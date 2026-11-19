// «איפוס מקדמות» - every man to zero on the advances side, once, from one screen.
//
// The owner, 2026-11-14: "Clean all the workers - no worker owes money now. Set every worker
// to zero on the advances side, and close all the old accounts." Asked why, he answered:
//
//   (1) the men REALLY paid it back, or it was settled outside the app - so it is recorded as
//       what it is, a repayment («הוחזר במזומן», kind 'repaid'), dated today;
//   (2) every man was paid his FULL wage for the old periods nobody closed - so each of them
//       is closed with NOTHING taken off the wage (a deduction of 0).
//
// He runs it once, from his own phone. NOTHING IS DELETED OR REWRITTEN (iron law 1): the tool
// only appends, through the two writers that already exist, in the order a person would:
//
//   1. closePeriodChanges(..., 0)   js/model/ledger.js - the per-man close's own writer
//      (closeAccountFor, js/ui/reports.js; «סגירת שבוע», js/ui/weeklyclose.js), each man's
//      ended periods OLDEST FIRST, so a close never stands in front of an open period that
//      handed a debt on (the order the v198 planner refuses otherwise: 'earlierOpen').
//   2. recordAdvanceRepaid(...)     js/model/ledger.js - the repayment form's own writer
//      (openRepaymentForm, js/ui/reports.js), with the form's own method ('cash'), for what
//      his advances still have left on the LEDGER - openAdvanceBalance, the figure of «מי
//      חייב כסף» - split over his advances oldest first, never more than one has left.
//
// WHY THE CLOSES COME FIRST AND TAKE NOTHING. A period nobody closed is read by the pay
// sheet as if the whole possible deduction had come off its wage (advanceWalk,
// js/model/schema.js; js/ui/owes.js says why at length), while the ledger never heard of it.
// The owner says no such deduction was made: he paid the full wage. Closing each of those
// periods at 0 makes the sheet say what happened, and the ledger's balance is then the one
// figure both screens agree on - which the repayment brings to zero. A close at 0 writes
// the period's payslip and no deduction entry, so it moves no ledger balance: the amount
// shown as "will be recorded as repaid" before the write is the amount written.
//
// WHICH PERIODS. A man's ENDED periods (the one holding today is not ended) from the one
// holding his first advance - the walk the account itself starts from (accountsBefore) - that
// nobody closed and that hold anything: a day, an absence, an advance, or money running
// through them once the earlier ones are closed at 0. Periods before his first advance have
// nothing to do with advances and are left as they are.
//
// EACH MAN WHOLE, OR NOT AT ALL. One man's closes and his repayments go into ONE commit
// (State.commitMany through saveFinancialAction - one journal batch, one cloud transaction).
// Men are packed into as few commits as the queue's limit allows (MAX_PATHS_PER_WRITE); a
// failed commit stops the pass with the men before it done and named, and nothing of the
// man it failed on. Re-opening the tool reads what is left: it is resumable, and a man
// already at zero with no open period is not on it at all.
//
// WHAT IT REFUSES - by name, never by forcing:
//   - a phone that is not «מסונכרן בין המכשירים», or with a write pending or held
//     (weeklyCloseReadyWord, js/ui/weeklyclose.js - the deletion's own question);
//   - a record that moved between the look and the press (every man re-read at the write and
//     compared with what was shown; any difference stops the WHOLE pass, nothing written);
//   - per man, the per-man box's own refusals: an account over-settled ('overpaid'), a period
//     overlapping one already closed on another grid ('overlap'), a period with no daily rate
//     ('unpriced'); a later period of his already closed WITH a deduction taken from a carried
//     debt in front of an open one ('laterClosed' - the v198 planner's refusal, asked here too
//     so the tool behaves the same on both); and more entries than one commit can carry.
//   - the gates: no figure at all on a record whose migration nobody approved, or on a build
//     whose writer is shut (financialWritingEnabled - the box's own).
//
// NOTHING IS WRITTEN BY LOOKING. The reading writes no key and no field; what is ticked is
// memory, and a reload forgets it.

// ================================================================== THE WORDS
//
// Every Hebrew string this screen adds, in one block. PROPOSED, not approved. Pinned word for
// word in tests/advancereset.test.mjs, so changing one is a decision.
const ADVANCE_RESET_TEXT = Object.freeze({
    // --- the row in ⋯ (index.html, written there as static text; pinned to it)
    entry: 'איפוס מקדמות',
    rowHint: 'פעם אחת: כל העובדים לאפס',
    rowLead: 'סוגר כל חשבון ישן בלי ניכוי, ורושם שכל עובד החזיר את מה שהוא עוד חייב. לפני שמאשרים רואים הכל, ואפשר לדלג על עובד.',
    title: 'איפוס מקדמות',
    step1: '1 · בדיקה',
    step2: '2 · סיכום',
    step3: '3 · נרשם',
    reading: 'בודק את החשבונות…',
    lead: 'פעם אחת, לכל העובדים: כל חשבון ישן שלא נסגר ייסגר בלי ניכוי (השכר שולם במלואו), '
        + 'ומה שהעובד עוד חייב יירשם כהוחזר היום. שום דבר לא נמחק.',
    backupFirst: 'לפני שממשיכים - שמור קובץ גיבוי. אחרי האישור אי אפשר לבטל, רק לרשום תיקון לצד כל רישום.',
    nothing: 'אין מה לאפס: אף עובד לא חייב כסף ואין חשבון ישן פתוח.',
    // --- a man's card
    periodsHead: count => (count === 1 ? 'ייסגר חשבון אחד בלי ניכוי:' : `ייסגרו ${count} חשבונות בלי ניכוי:`),
    noPeriods: 'אין לו חשבון ישן פתוח.',
    wage: amount => `שכר ${amount} ₪`,
    noWage: 'בלי שכר יומי',
    repayLine: amount => `יירשם כהוחזר היום: ${amount} ₪`,
    noRepay: 'לא חייב כסף - לא יירשם החזר.',
    chipReset: 'יאופס',
    chipSkipped: 'דילגת',
    chipHeld: 'לא יאופס',
    skippedLine: 'לא יאופס עכשיו. שום דבר שלו לא ישתנה.',
    // --- why a man is shown and left as he is
    heldLaterClosed: dates => `חשבון מאוחר יותר שלו (${dates}) כבר נסגר עם ניכוי מחוב קודם. `
        + 'סגירה של החשבונות שלפניו עלולה לנכות את אותה מקדמה פעמיים - בדוק את עמוד המקדמות שלו.',
    heldTooMany: 'יש לו יותר מדי חשבונות פתוחים לפעם אחת. סגור חלק מהם בדוח, ואז פתח שוב את המסך.',
    // --- the foot
    footClosed: 'חשבונות שייסגרו',
    footRepaid: 'יירשם כהוחזר',
    footMen: 'עובדים',
    // --- the summary
    willReset: count => (count === 1 ? 'יאופס עובד אחד' : `יאופסו ${count} עובדים`),
    worker: 'עובד',
    accounts: 'חשבונות',
    repaid: 'הוחזר',
    noneChosen: 'לא נבחר אף עובד לאיפוס.',
    skippedList: 'לא יאופס עכשיו (דילגת):',
    heldList: 'לא יאופס - צריך לבדוק קודם:',
    confirm: count => (count === 1 ? 'אפס עובד אחד' : `אפס ${count} עובדים`),
    askTitle: 'לאפס את המקדמות?',
    askMessage: (closes, amount, men) => `ייסגרו ${closes} חשבונות בלי ניכוי, ויירשם שהוחזרו ${amount} ₪ `
        + `מ-${men} עובדים. אי אפשר לבטל.`,
    askOk: 'כן, לאפס',
    saving: 'שומר…',
    // --- the write did not happen, or happened in part
    moved: 'הרישום השתנה מאז הבדיקה. לא נרשם דבר. בדוק שוב ואשר.',
    notWritten: 'לא נשמר דבר. נסה שוב, ואם זה חוזר - סגור כל עובד מהחשבון שלו בדוח.',
    partial: (done, all) => `נרשם רק חלק: ${done} מתוך ${all} עובדים. השאר לא נרשמו - פתח שוב את המסך כדי להמשיך.`,
    // --- the result
    doneHead: 'נרשם',
    doneLine: (closes, amount) => `נסגרו ${closes} חשבונות בלי ניכוי · נרשם שהוחזרו ${amount} ₪`,
    doneRepaid: 'נרשם כהוחזר היום:',
    notReset: 'לא אופסו:',
    stillOwe: names => `עדיין חייבים: ${names}.`,
    // --- the repayment's note, in the ledger and on his statement
    note: 'איפוס - הוחזר מחוץ לאפליקציה'
});

// The words this screen borrows, each beside the screen that owns it. tests/advancereset.test.mjs
// finds every one in its owner's source, so a word changed there and not here fails by name.
// WEEKLY_CLOSE_TEXT (next, back, notSynced...), WEEKLY_CLOSE_REUSED (final, overpaid, overlap,
// gateShut), NO_DAILY_RATE_NOTE, OWES_TEXT (none, sum, closures) are read, not repeated.
const ADVANCE_RESET_REUSED = Object.freeze({
    backup: '💾 שמור קובץ גיבוי'                  // index.html, ⋯ ← גיבוי (exportBackup)
});

// The repayment form's own method (openRepaymentForm, js/ui/reports.js).
const ADVANCE_RESET_METHOD = 'cash';
const ADVANCE_RESET_TAP_GUARD_MS = 1500;
const ADVANCE_RESET_WALK_CEILING = 4000;

function advanceResetCents(value) {
    return Math.round((Number(value) || 0) * 100);
}

// How many field paths one commit may carry for the men in it: the queue's limit, less one
// for the approval saveFinancialAction may add and one to spare.
function advanceResetRoom() {
    return (typeof MAX_PATHS_PER_WRITE === 'number' ? MAX_PATHS_PER_WRITE : 296) - 2;
}

// ================================================================== the reading (pure)

// "Money ran through it" - the planner's own words for it (closureMoneyRan, v198).
function advanceResetMoneyRan(walk) {
    return walk.carriedIn > 0 || walk.creditIn > 0 || walk.given > 0 || walk.repaid > 0 || walk.reversed !== 0;
}

// His advances with money left on the LEDGER, oldest first - the ids openAdvanceBalance adds.
function advanceResetLeft(schedule, workerId) {
    const ids = workerFootprint(schedule, workerId).advances;
    const folded = foldLedger(schedule);
    const legacy = (schedule && schedule.advances) || {};
    return ids.map(id => {
        const of = folded[id] || legacy[id] || {};
        return { advanceId: String(id), date: String(of.date || ''), left: advanceOutstanding(schedule, id).left };
    }).filter(row => row.left > 0)
        .sort((a, b) => (a.date < b.date ? -1 : (a.date > b.date ? 1 : (a.advanceId < b.advanceId ? -1 : 1))));
}

// ONE MAN, READ: his periods to close at 0, his repayment rows, or why he is left. null when
// there is nothing to do for him.
function advanceResetMan(schedule, worker, today) {
    const id = String(worker.id);
    const items = advancesFor(schedule, id, '0000-01-01', '9999-12-31');
    const open = openAdvanceBalance(schedule, id);
    const owed = open ? open.total : 0;
    if (!items.length && !(owed > 0)) return null;
    const current = periodRangeFor(worker, today);
    const periods = [];
    const before = accountsBefore(schedule, id, current.from);
    let position = 0;
    for (let n = 0; n < before.length && n < ADVANCE_RESET_WALK_CEILING; n += 1) {
        const span = before[n];
        const walk = advanceWalk(schedule, id, span.from, span.to, position);
        if (walk.closed) { position = walk.position; continue; }
        // As it will be once this period is closed with nothing taken: what the sheet presumed
        // came off its wage stays owed (advanceAccount with a deduction of 0).
        position = agoraRound(walk.position + walk.deducted);
        const row = payrollReport(schedule, span.from, span.to).filter(item => String(item.workerId) === id)[0] || null;
        const recorded = Boolean(row) && (row.attendanceDays > 0 || row.absent > 0 || Number(row.advances) > 0);
        const money = advanceResetMoneyRan(walk);
        if (!recorded && !money) continue;
        periods.push({
            from: span.from,
            to: span.to,
            cycle: periodRangeFor(worker, span.from).cycle,
            days: row ? row.attendanceDays : 0,
            gross: walk.gross,
            money,
            // What the close at 0 leaves owed - its balanceAfter.
            owed: agoraRound(walk.carriedForward + walk.deducted),
            // What the pay sheet presumed came off this wage until now.
            presumed: walk.deducted
        });
    }
    const left = advanceResetLeft(schedule, id);
    const repay = [];
    let room = owed;
    left.forEach(row => {
        if (!(room > 0)) return;
        const amount = agoraRound(Math.min(room, row.left));
        if (amount <= 0) return;
        room = agoraRound(room - amount);
        repay.push({ advanceId: row.advanceId, amount });
    });
    if (!periods.length && !repay.length) return null;
    const man = {
        id,
        name: worker.name === undefined || worker.name === null ? '' : String(worker.name),
        active: worker.active !== false,
        cycle: current.cycle,
        owed,
        periods,
        repay,
        repaid: agoraRound(repay.reduce((sum, row) => sum + row.amount, 0)),
        held: null
    };
    // Each reason the per-man box would give, asked of every period he would close.
    const closed = closedPeriods(schedule, id) || {};
    const laterClosed = periods.filter(period => period.money).map(period => Object.keys(closed).sort()
        .filter(key => key > period.to && (Number(closed[key].deducted) || 0) > 0
            && ((Number(closed[key].carriedIn) || 0) > 0 || (Number(closed[key].creditIn) || 0) > 0))[0])
        .filter(Boolean)[0];
    if (typeof overpaidAdvances === 'function' && overpaidAdvances(schedule, id).length > 0) {
        man.held = { kind: 'overpaid' };
    } else if (periods.some(period => overlappingClosures(schedule, id, period.from, period.to)
        .filter(key => key !== String(period.from)).length > 0)) {
        man.held = { kind: 'overlap' };
    } else if (laterClosed) {
        const of = closed[laterClosed];
        man.held = { kind: 'laterClosed', from: laterClosed,
            to: of.periodTo !== undefined ? String(of.periodTo) : periodRangeFor(worker, laterClosed).to };
    } else if (periods.some(period => period.gross === null)) {
        man.held = { kind: 'unpriced' };
    } else if (room > 0) {
        // His balance cannot be laid on his advances (it never happens on a record the fold
        // reads; said rather than written short).
        man.held = { kind: 'other' };
    } else if (periods.length + repay.length > advanceResetRoom()) {
        man.held = { kind: 'tooMany' };
    }
    man.sig = JSON.stringify([man.name, man.active, man.owed, man.periods, man.repay, man.held]);
    return man;
}

// THE WHOLE LIST at one moment, in the roster's order. `gate` false: no figure at all.
// Inside weeklyCloseOnce, so the model's repeated questions are answered once per state.
function advanceResetRead(schedule, today) {
    const read = () => weeklyCloseOnce(() => {
        if (!financialWritingEnabled(schedule)) return { gate: false, today, men: [] };
        const men = ((schedule && schedule.workers) || [])
            .filter(worker => worker && worker.id)
            .map(worker => advanceResetMan(schedule, worker, today))
            .filter(Boolean);
        return { gate: true, today, men };
    });
    return typeof reportReadOnce === 'function' ? reportReadOnce(read) : read();
}

function advanceResetTotals(men) {
    const out = { men: 0, closes: 0, repaid: 0 };
    men.forEach(man => {
        out.men += 1;
        out.closes += man.periods.length;
        out.repaid = agoraRound(out.repaid + man.repaid);
    });
    return out;
}

// ================================================================== the write

// THE ONE SYNCHRONOUS BLOCK. `men` as the screen showed them. Nothing in here awaits: what is
// compared is what is written. Answers
//   { notReady } | { moved: [ids] } | { at, by, done: [ids], failure, failedOn }.
function advanceResetWrite(men) {
    const at = new Date().toISOString();
    const by = syncDeviceId();
    const today = todayStr();
    const result = { at, by, today, notReady: null, moved: [], failure: null, failedOn: null, done: [] };
    const notReady = weeklyCloseReadyWord();
    if (notReady) { result.notReady = notReady; return result; }

    // Every chosen man read again now, and compared with what was shown.
    const now = advanceResetRead(State.schedule, today);
    men.forEach(man => {
        const again = now.men.filter(one => one.id === man.id)[0];
        if (!again || again.sig !== man.sig || again.held) result.moved.push(man.id);
    });
    if (!now.gate) result.moved = men.map(man => man.id);
    if (result.moved.length > 0) return result;

    // As few commits as the queue's limit allows, never splitting a man.
    const batches = [];
    let batch = [];
    let paths = 0;
    men.forEach(man => {
        const size = man.periods.length + man.repay.length;
        if (batch.length && paths + size > advanceResetRoom()) { batches.push(batch); batch = []; paths = 0; }
        batch.push(man);
        paths += size;
    });
    if (batch.length) batches.push(batch);

    // No redraw inside a commit (weeklyCloseWrite says why): drawn once afterwards.
    const realRender = typeof render === 'function' ? render : null;
    if (realRender) render = () => {};
    try {
        for (const group of batches) {
            let built = [];
            let failure = null;
            const saved = weeklyCloseOnce(() => saveFinancialAction(() => {
                try {
                    weeklyCloseOnce(() => {
                        for (const man of group) {
                            // 1. His ended periods, oldest first, each with nothing taken.
                            for (const period of man.periods) {
                                const made = closePeriodChanges(State.schedule, man.id, period.from, period.to, at, by, 0);
                                const artifact = made[0];
                                if (made.length !== 1 || !artifact || !artifact.value || artifact.value.kind !== 'closed'
                                    || artifact.value.gross !== period.gross
                                    || advanceResetCents(artifact.value.balanceAfter) !== advanceResetCents(period.owed)) {
                                    failure = { kind: 'build', id: man.id };
                                    return;
                                }
                                built.push(artifact);
                            }
                            // 2. What his advances still have left, handed back today.
                            for (const row of man.repay) {
                                const change = recordAdvanceRepaid(State.schedule, row.advanceId, row.amount, today,
                                    ADVANCE_RESET_TEXT.note, at, by, ADVANCE_RESET_METHOD);
                                if (!change) { failure = { kind: 'build', id: man.id }; return; }
                                built.push(change);
                            }
                            // And he reads zero on the ledger, or nothing of this commit is kept.
                            const left = openAdvanceBalance(State.schedule, man.id);
                            if (left && left.total > 0) { failure = { kind: 'build', id: man.id }; return; }
                        }
                    });
                } catch (error) {
                    failure = { kind: 'threw', message: String((error && error.message) || error) };
                }
                if (!failure && built.length + 1 > MAX_PATHS_PER_WRITE) failure = { kind: 'tooMany' };
                if (!failure && weeklyCloseBytes(JSON.stringify(State.schedule)) > WEEKLY_CLOSE_RECORD_LIMIT) {
                    failure = { kind: 'tooLarge' };
                }
                if (failure) {
                    // Memory back to what the disk and the journal hold.
                    State.rollback();
                    built = [];
                    return [];
                }
                return built;
            }), { memo: false });
            if (failure || !saved) {
                result.failure = failure || { kind: 'refused' };
                result.failedOn = group.map(man => man.id);
                break;
            }
            // READ BACK, never assumed: every period of his closed, and zero on the ledger.
            group.forEach(man => {
                const closedAll = man.periods.every(period => {
                    const artifact = periodArtifactFor(State.schedule, man.id, period.from);
                    return artifact && artifact.at === at && artifact.by === by;
                });
                const left = openAdvanceBalance(State.schedule, man.id);
                if (closedAll && !(left && left.total > 0)) result.done.push(man.id);
            });
        }
    } finally {
        if (realRender) render = realRender;
    }
    return result;
}

// ================================================================== the screen
//
// One dialog (#advanceResetModal, index.html), three pages: «בדיקה», «סיכום», «נרשם».

let ADVANCE_RESET = null;
let advanceResetLastTap = 0;
let advanceResetBusy = false;
let advanceResetWriting = false;

function advanceResetParts() {
    const get = id => document.getElementById(id);
    return { modal: get('advanceResetModal'), title: get('advanceResetTitle'), meta: get('advanceResetMeta'),
        steps: get('advanceResetSteps'), status: get('advanceResetStatus'), body: get('advanceResetBody'),
        totals: get('advanceResetTotals'), go: get('advanceResetGo'), back: get('advanceResetBack') };
}

function advanceResetIsOpen() {
    const parts = advanceResetParts();
    return Boolean(ADVANCE_RESET && parts.modal && parts.modal.style.display === 'flex');
}

function advanceResetMoney(value) {
    return `${moneyText(value)} ₪`;
}

// THE ONE WAY IN is a row of ⋯ (index.html, «גיבוי ושחזור» ← «איפוס מקדמות»), shut at every
// opening and never opened by itself: the owner, 2026-11-14, asked for it "somewhere not
// within easy reach". No page of the app draws a button for it - tests/advancereset.test.mjs
// holds every source file but index.html and this one free of a call to openAdvanceReset.

function advanceResetRecordKey() {
    return `${typeof Store === 'object' && Store ? Store.tick : 0}|${todayStr()}|${JSON.stringify(State.schedule)}`;
}

function openAdvanceReset() {
    const parts = advanceResetParts();
    if (!parts.modal) return false;
    // Opened from ⋯, whose sheet stands above every dialog: the sheet is put away first, the
    // way the sheet's own rows send a person elsewhere.
    if (typeof settingsOpen !== 'undefined' && settingsOpen && typeof closeSettings === 'function') closeSettings();
    ADVANCE_RESET = { step: 1, read: null, skip: {}, moved: [], stale: false, key: null, saving: false,
        error: null, result: null };
    parts.modal.style.display = 'flex';
    renderAdvanceReset();
    void parts.modal.offsetHeight;
    if (parts.title && parts.title.focus) parts.title.focus({ preventScroll: true });
    const read = () => { if (ADVANCE_RESET && !ADVANCE_RESET.read) advanceResetLoad([]); };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(read, 0));
    else read();
    return true;
}

function closeAdvanceReset() {
    if (ADVANCE_RESET && ADVANCE_RESET.saving) return;
    const parts = advanceResetParts();
    if (parts.modal) parts.modal.style.display = 'none';
    ADVANCE_RESET = null;
}

// (Re)reads the list; a man who reads as he did keeps being skipped if he was.
function advanceResetLoad(moved) {
    if (!ADVANCE_RESET) return;
    const before = ADVANCE_RESET.read;
    const read = advanceResetRead(State.schedule, todayStr());
    const skip = {};
    read.men.forEach(man => {
        const was = before ? before.men.filter(one => one.id === man.id)[0] : null;
        if (ADVANCE_RESET.skip[man.id] && was && was.sig === man.sig) skip[man.id] = true;
    });
    ADVANCE_RESET.read = read;
    ADVANCE_RESET.skip = skip;
    ADVANCE_RESET.moved = moved.slice();
    ADVANCE_RESET.stale = false;
    ADVANCE_RESET.key = advanceResetRecordKey();
    renderAdvanceReset();
}

// render() asks this (js/app.js): a record that moved under the screen raises one line.
function renderAdvanceResetIfOpen() {
    if (!advanceResetIsOpen() || advanceResetWriting || !ADVANCE_RESET.read || ADVANCE_RESET.step === 3) return;
    if (!ADVANCE_RESET.stale && advanceResetRecordKey() !== ADVANCE_RESET.key) {
        ADVANCE_RESET.stale = true;
        advanceResetSay();
    }
}

function advanceResetChosen() {
    if (!ADVANCE_RESET || !ADVANCE_RESET.read) return [];
    return ADVANCE_RESET.read.men.filter(man => !man.held && !ADVANCE_RESET.skip[man.id]);
}

function advanceResetHeldText(man) {
    const held = man.held;
    switch (held.kind) {
    case 'overpaid': return WEEKLY_CLOSE_REUSED.overpaid;
    case 'overlap': return WEEKLY_CLOSE_REUSED.overlap;
    case 'unpriced': return `${NO_DAILY_RATE_NOTE}.`;
    case 'laterClosed': return ADVANCE_RESET_TEXT.heldLaterClosed(weeklyCloseDates(held.from, held.to));
    case 'tooMany': return ADVANCE_RESET_TEXT.heldTooMany;
    default: return WEEKLY_CLOSE_TEXT.heldOther;
    }
}

function advanceResetSay() {
    const parts = advanceResetParts();
    if (!parts.status || !ADVANCE_RESET) return;
    const lines = [];
    if (!ADVANCE_RESET.read) lines.push(ADVANCE_RESET_TEXT.reading);
    else if (ADVANCE_RESET.read.gate && ADVANCE_RESET.step !== 3) {
        const notReady = weeklyCloseReadyWord();
        if (notReady) lines.push(notReady);
        if (ADVANCE_RESET.error) lines.push(ADVANCE_RESET.error);
        if (ADVANCE_RESET.stale) lines.push(WEEKLY_CLOSE_TEXT.stale);
    } else if (ADVANCE_RESET.step === 3 && ADVANCE_RESET.error) lines.push(ADVANCE_RESET.error);
    if (ADVANCE_RESET.saving) lines.push(ADVANCE_RESET_TEXT.saving);
    parts.status.textContent = lines.join(' ');
    parts.status.hidden = lines.length === 0;
}

function renderAdvanceReset() {
    const parts = advanceResetParts();
    if (!parts.body || !ADVANCE_RESET) return;
    parts.title.textContent = ADVANCE_RESET_TEXT.title;
    const today = parseLocalDate(todayStr());
    parts.meta.textContent = `${hebrewDayName(today)} ${formatFullDate(today)}`;
    clear(parts.steps);
    [ADVANCE_RESET_TEXT.step1, ADVANCE_RESET_TEXT.step2, ADVANCE_RESET_TEXT.step3].forEach((words, index) => {
        const on = index + 1 === ADVANCE_RESET.step;
        const chip = el('span', `weekly-close-step${on ? ' weekly-close-step-on' : ''}`, words);
        if (on) chip.setAttribute('aria-current', 'step');
        parts.steps.appendChild(chip);
    });
    clear(parts.body);
    advanceResetSay();
    const read = ADVANCE_RESET.read;
    if (read && !read.gate) parts.body.appendChild(el('p', 'hint hint-warn', WEEKLY_CLOSE_REUSED.gateShut));
    else if (ADVANCE_RESET.step === 3) advanceResetDrawResult(parts.body);
    else if (read && ADVANCE_RESET.step === 1) advanceResetDrawList(parts.body);
    else if (read && ADVANCE_RESET.step === 2) advanceResetDrawSummary(parts.body);
    advanceResetDrawFoot();
}

// The strong line and the backup's own button, right there (exportBackup, js/ui/backup.js).
function advanceResetBackupBox() {
    const box = el('div', 'advance-reset-backup');
    box.appendChild(el('p', 'advance-reset-backup-line', ADVANCE_RESET_TEXT.backupFirst));
    box.appendChild(button(ADVANCE_RESET_REUSED.backup, 'btn-secondary advance-reset-backup-button', () => exportBackup()));
    return box;
}

function advanceResetDrawList(body) {
    const read = ADVANCE_RESET.read;
    if (!read.men.length) { body.appendChild(emptyHint(ADVANCE_RESET_TEXT.nothing)); return; }
    body.appendChild(advanceResetBackupBox());
    body.appendChild(el('p', 'weekly-close-lead', ADVANCE_RESET_TEXT.lead));
    read.men.forEach(man => body.appendChild(advanceResetCard(man)));
}

function advanceResetCard(man) {
    const skipped = !man.held && ADVANCE_RESET.skip[man.id] === true;
    const state = man.held ? 'held' : (skipped ? 'skipped' : 'all');
    const card = el('div', `weekly-close-card advance-reset-card weekly-close-${state}`);
    card.dataset.worker = man.id;
    card.dataset.cycle = man.cycle;
    const head = el('div', 'weekly-close-row advance-reset-row');
    const top = el('span', 'weekly-close-row-top');
    top.appendChild(el('strong', 'weekly-close-name', man.name));
    top.appendChild(el('span', `weekly-close-chip weekly-close-chip-${state}`, man.held ? ADVANCE_RESET_TEXT.chipHeld
        : (skipped ? ADVANCE_RESET_TEXT.chipSkipped : ADVANCE_RESET_TEXT.chipReset)));
    head.appendChild(top);
    card.appendChild(head);
    if (ADVANCE_RESET.moved.indexOf(man.id) !== -1) card.appendChild(el('p', 'hint hint-warn', WEEKLY_CLOSE_TEXT.changedHere));
    const box = el('div', 'weekly-close-detail');
    const line = (label, value, cls) => {
        const row = el('div', `weekly-close-line${cls ? ` ${cls}` : ''}`);
        row.appendChild(el('span', null, label));
        if (value !== null) row.appendChild(el('b', null, value));
        box.appendChild(row);
    };
    if (man.periods.length) {
        line(ADVANCE_RESET_TEXT.periodsHead(man.periods.length), null, 'advance-reset-periods-head');
        man.periods.forEach(period => line(weeklyCloseDates(period.from, period.to),
            period.gross === null ? ADVANCE_RESET_TEXT.noWage : ADVANCE_RESET_TEXT.wage(moneyText(period.gross)),
            'advance-reset-period'));
    } else {
        line(ADVANCE_RESET_TEXT.noPeriods, null, 'advance-reset-periods-head');
    }
    line(man.repaid > 0 ? ADVANCE_RESET_TEXT.repayLine(moneyText(man.repaid)) : ADVANCE_RESET_TEXT.noRepay, null,
        'advance-reset-repay');
    card.appendChild(box);
    if (man.held) {
        card.appendChild(el('p', 'weekly-close-held', advanceResetHeldText(man)));
        return card;
    }
    if (skipped) card.appendChild(el('p', 'weekly-close-skipped', ADVANCE_RESET_TEXT.skippedLine));
    const actions = el('div', 'weekly-close-actions');
    actions.appendChild(button(skipped ? WEEKLY_CLOSE_TEXT.unskipButton : WEEKLY_CLOSE_TEXT.skipButton,
        `btn-secondary ${skipped ? 'advance-reset-unskip' : 'advance-reset-skip'}`, () => {
            if (skipped) delete ADVANCE_RESET.skip[man.id]; else ADVANCE_RESET.skip[man.id] = true;
            renderAdvanceReset();
            const again = document.querySelector(`.advance-reset-card[data-worker="${man.id}"] .weekly-close-actions button`);
            if (again && again.focus) again.focus({ preventScroll: true });
        }));
    card.appendChild(actions);
    return card;
}

function advanceResetFootFit() {
    if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return;
    const content = document.querySelector('#advanceResetModal .modal-content');
    const foot = document.querySelector('#advanceResetModal .weekly-close-foot');
    if (!content || !foot || typeof foot.getBoundingClientRect !== 'function' || !foot.classList) return;
    foot.classList.remove('weekly-close-foot-loose');
    const room = Number(content.clientHeight) || 0;
    foot.classList.toggle('weekly-close-foot-loose', room > 0 && foot.getBoundingClientRect().height > room * 0.4);
}
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('resize', () => { if (advanceResetIsOpen()) advanceResetFootFit(); });
}

function advanceResetDrawFoot() {
    const parts = advanceResetParts();
    if (!parts.totals || !ADVANCE_RESET) return;
    clear(parts.totals);
    const read = ADVANCE_RESET.read;
    const chosen = advanceResetChosen();
    const totals = advanceResetTotals(chosen);
    const showing = Boolean(read && read.gate && read.men.length > 0 && ADVANCE_RESET.step !== 3);
    parts.totals.hidden = !showing;
    if (showing) {
        [[ADVANCE_RESET_TEXT.footMen, String(totals.men)], [ADVANCE_RESET_TEXT.footClosed, String(totals.closes)],
            [ADVANCE_RESET_TEXT.footRepaid, advanceResetMoney(totals.repaid)]].forEach(([label, value]) => {
            const cell = el('span', 'weekly-close-total');
            cell.appendChild(el('small', null, label));
            cell.appendChild(el('b', null, value));
            parts.totals.appendChild(cell);
        });
    }
    if (ADVANCE_RESET.step === 3) {
        parts.go.hidden = true;
        parts.back.textContent = WEEKLY_CLOSE_TEXT.back;
    } else if (ADVANCE_RESET.step === 1) {
        parts.back.textContent = WEEKLY_CLOSE_TEXT.back;
        parts.go.textContent = WEEKLY_CLOSE_TEXT.next;
        parts.go.hidden = !showing;
        parts.go.disabled = ADVANCE_RESET.saving;
    } else {
        parts.back.textContent = WEEKLY_CLOSE_TEXT.back;
        parts.go.textContent = ADVANCE_RESET_TEXT.confirm(totals.men);
        parts.go.hidden = totals.men === 0;
        parts.go.disabled = ADVANCE_RESET.saving;
    }
    advanceResetFootFit();
}

function advanceResetDrawSummary(body) {
    const read = ADVANCE_RESET.read;
    const chosen = advanceResetChosen();
    const totals = advanceResetTotals(chosen);
    body.appendChild(advanceResetBackupBox());
    const table = el('div', 'weekly-close-summary');
    table.appendChild(el('h4', null, totals.men ? ADVANCE_RESET_TEXT.willReset(totals.men) : ADVANCE_RESET_TEXT.noneChosen));
    if (chosen.length) {
        const grid = el('div', 'weekly-close-table advance-reset-table');
        const head = el('div', 'weekly-close-tr weekly-close-th advance-reset-tr');
        [ADVANCE_RESET_TEXT.worker, ADVANCE_RESET_TEXT.accounts, ADVANCE_RESET_TEXT.repaid]
            .forEach(words => head.appendChild(el('span', null, words)));
        grid.appendChild(head);
        chosen.forEach(man => {
            const tr = el('div', 'weekly-close-tr advance-reset-tr');
            tr.dataset.worker = man.id;
            tr.appendChild(el('strong', null, man.name));
            tr.appendChild(el('span', null, String(man.periods.length)));
            tr.appendChild(el('span', null, moneyText(man.repaid)));
            grid.appendChild(tr);
        });
        const sum = el('div', 'weekly-close-tr weekly-close-sum advance-reset-tr');
        sum.appendChild(el('strong', null, OWES_TEXT.sum));
        sum.appendChild(el('span', null, String(totals.closes)));
        sum.appendChild(el('span', null, moneyText(totals.repaid)));
        grid.appendChild(sum);
        table.appendChild(grid);
    }
    body.appendChild(table);
    const named = (cls, title, men, lineOf) => {
        if (!men.length) return;
        const box = el('div', `weekly-close-named ${cls}`);
        box.appendChild(el('strong', null, title));
        men.forEach(man => box.appendChild(el('p', null, lineOf(man))));
        body.appendChild(box);
    };
    named('weekly-close-named-skipped', ADVANCE_RESET_TEXT.skippedList,
        read.men.filter(man => !man.held && ADVANCE_RESET.skip[man.id]), man => isolate(man.name));
    named('weekly-close-named-held', ADVANCE_RESET_TEXT.heldList, read.men.filter(man => man.held),
        man => `${isolate(man.name)} · ${advanceResetHeldText(man)}`);
    if (totals.men) body.appendChild(el('p', 'hint weekly-close-final', WEEKLY_CLOSE_REUSED.final));
}

function advanceResetDrawResult(body) {
    const result = ADVANCE_RESET.result;
    if (!result) return;
    const box = el('div', 'weekly-close-summary advance-reset-done');
    box.appendChild(el('h4', null, ADVANCE_RESET_TEXT.doneHead));
    box.appendChild(el('p', 'advance-reset-done-line', ADVANCE_RESET_TEXT.doneLine(result.closes, moneyText(result.repaid))));
    if (result.repayments.length) {
        box.appendChild(el('strong', 'advance-reset-done-sub', ADVANCE_RESET_TEXT.doneRepaid));
        result.repayments.forEach(row => box.appendChild(el('p', 'advance-reset-done-row',
            `${isolate(row.name)} · ${advanceResetMoney(row.amount)}`)));
    }
    body.appendChild(box);
    if (result.left.length) {
        const left = el('div', 'weekly-close-named weekly-close-named-held');
        left.appendChild(el('strong', null, ADVANCE_RESET_TEXT.notReset));
        left.appendChild(el('p', null, result.left.map(name => isolate(name)).join(', ')));
        body.appendChild(left);
    }
    // What «מי חייב כסף» says now, read off the record as it is.
    body.appendChild(el('p', `advance-reset-board${result.owing.length ? ' advance-reset-board-owing' : ''}`,
        result.owing.length ? ADVANCE_RESET_TEXT.stillOwe(result.owing.map(name => isolate(name)).join(', ')) : OWES_TEXT.none));
    if (result.closes > 0) {
        body.appendChild(button(OWES_TEXT.closures, 'btn-secondary advance-reset-closures', () => {
            closeAdvanceReset();
            owesOpenPage(result.key);
        }));
    }
}

function advanceResetGuarded(now) {
    const since = now - advanceResetLastTap;
    return advanceResetLastTap > 0 && since >= 0 && since < ADVANCE_RESET_TAP_GUARD_MS;
}

// «המשך לסיכום» / «אפס N עובדים».
async function advanceResetGo() {
    if (!ADVANCE_RESET || !ADVANCE_RESET.read || advanceResetBusy || ADVANCE_RESET.saving) return;
    if (ADVANCE_RESET.step === 1) {
        ADVANCE_RESET.step = 2;
        ADVANCE_RESET.error = null;
        renderAdvanceReset();
        const content = document.querySelector('#advanceResetModal .modal-content');
        if (content) content.scrollTop = 0;
        return;
    }
    if (ADVANCE_RESET.step !== 2) return;
    const now = Date.now();
    if (advanceResetGuarded(now)) return;
    advanceResetLastTap = now;
    if (weeklyCloseReadyWord()) { ADVANCE_RESET.error = null; renderAdvanceReset(); return; }
    const chosen = advanceResetChosen();
    if (!chosen.length) return;
    const totals = advanceResetTotals(chosen);
    advanceResetBusy = true;
    try {
        const yes = await askConfirm({ title: ADVANCE_RESET_TEXT.askTitle,
            message: ADVANCE_RESET_TEXT.askMessage(totals.closes, moneyText(totals.repaid), totals.men),
            ok: ADVANCE_RESET_TEXT.askOk, danger: true, names: chosen.map(man => man.name) });
        if (!yes || !ADVANCE_RESET) return;
        ADVANCE_RESET.saving = true;
        advanceResetDrawFoot();
        advanceResetSay();
        await new Promise(resolve => {
            const later = () => setTimeout(resolve, 0);
            if (typeof requestAnimationFrame === 'function') requestAnimationFrame(later); else later();
        });
        let result;
        advanceResetWriting = true;
        try { result = advanceResetWrite(chosen); } finally { advanceResetWriting = false; }
        advanceResetAfter(result, chosen);
    } finally {
        advanceResetBusy = false;
        if (ADVANCE_RESET) { ADVANCE_RESET.saving = false; advanceResetDrawFoot(); advanceResetSay(); }
    }
}

function advanceResetAfter(result, chosen) {
    const tried = !result.notReady && !result.moved.length;
    if (tried && typeof render === 'function') render();
    if (!ADVANCE_RESET) return;
    if (result.notReady) { ADVANCE_RESET.error = null; renderAdvanceReset(); return; }
    if (result.moved.length) {
        const names = result.moved.map(id => {
            const man = chosen.filter(one => one.id === id)[0];
            return isolate(man ? man.name : id);
        }).join(', ');
        ADVANCE_RESET.step = 1;
        advanceResetLoad(result.moved);
        ADVANCE_RESET.error = `${ADVANCE_RESET_TEXT.moved} ${WEEKLY_CLOSE_TEXT.movedNames(names)}`;
        renderAdvanceReset();
        return;
    }
    const done = chosen.filter(man => result.done.indexOf(man.id) !== -1);
    if (!done.length) {
        ADVANCE_RESET.error = result.failure && result.failure.kind === 'tooLarge' ? WEEKLY_CLOSE_TEXT.tooLarge
            : ADVANCE_RESET_TEXT.notWritten;
        renderAdvanceReset();
        return;
    }
    // «3 · נרשם», read off the record as it now is.
    const board = typeof owesReadNow === 'function' ? owesReadNow() : owesRead(State.schedule, todayStr());
    ADVANCE_RESET.result = {
        key: `${result.at}|${result.by}`,
        closes: done.reduce((sum, man) => sum + man.periods.length, 0),
        repaid: agoraRound(done.reduce((sum, man) => sum + man.repaid, 0)),
        repayments: done.filter(man => man.repaid > 0).map(man => ({ name: man.name, amount: man.repaid })),
        left: ADVANCE_RESET.read.men.filter(man => result.done.indexOf(man.id) === -1).map(man => man.name),
        owing: board.rows.map(row => row.name)
    };
    ADVANCE_RESET.error = done.length < chosen.length ? ADVANCE_RESET_TEXT.partial(done.length, chosen.length) : null;
    ADVANCE_RESET.step = 3;
    renderAdvanceReset();
    const content = document.querySelector('#advanceResetModal .modal-content');
    if (content) content.scrollTop = 0;
}

function advanceResetBack() {
    if (!ADVANCE_RESET || ADVANCE_RESET.saving) return;
    if (ADVANCE_RESET.step === 2) {
        ADVANCE_RESET.step = 1;
        ADVANCE_RESET.error = null;
        renderAdvanceReset();
        return;
    }
    closeAdvanceReset();
}
