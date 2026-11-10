// THE SECOND CALCULATOR.
//
// Every number this app shows is somebody's pay, and every suite before this one asked
// the app's own functions what the number is. This file is a second answer to the same
// questions, worked out a second way, so that tests/oracle.test.mjs can put the two
// side by side on a few hundred records and stop at the first shekel they disagree on.
//
// WHAT MAKES IT A SECOND ANSWER AND NOT AN ECHO:
//
//   - It imports nothing from js/ and calls nothing in it. It is handed the raw record -
//     the JSON a phone keeps under scheduleData:v2 - and reads only that.
//   - It was written from the RULES, where the rules are written down: iron laws 1 and 2
//     in CLAUDE.md, docs/architecture.md («The shape of the record», «Money»),
//     docs/weekly-cycle.md, docs/releases.md (v166) and the comment blocks that state a
//     rule in words. Each function below names the rule it implements.
//   - It does the sums differently. Dates are whole day numbers worked out by integer
//     arithmetic - there is no Date in this file, so no time zone and no DST hour can
//     reach it. Money is whole AGOROT, so nothing here can carry a binary float from one
//     fortnight into the next.
//
// WHERE A RULE IS NOT WRITTEN DOWN and this file had to follow what the code does, the
// line says «FOLLOWS THE CODE» and says what was not documented. Those lines are not
// independent evidence of anything, and tests/README.md lists them.
//
// It is a helper, not a suite: it asserts nothing and is listed in HELPERS in
// tests/gate.integrity.test.mjs.

// ---------------------------------------------------------------- the calendar
//
// A date is the number of days since 1970-01-01, by the proleptic Gregorian rule. No
// clock, no zone: 2026-03-27 is one day after 2026-03-26 whether or not an hour was
// skipped that night.

export function dayNumber(text) {
    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text));
    if (!parts) throw new Error(`oracle: not a date: ${text}`);
    const month = Number(parts[2]);
    const day = Number(parts[3]);
    const year = Number(parts[1]) - (month <= 2 ? 1 : 0);
    const era = Math.floor(year / 400);
    const yearOfEra = year - era * 400;
    const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
    const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4)
        - Math.floor(yearOfEra / 100) + dayOfYear;
    return era * 146097 + dayOfEra - 719468;
}

export function dateText(number) {
    const shifted = number + 719468;
    const era = Math.floor(shifted / 146097);
    const dayOfEra = shifted - era * 146097;
    const yearOfEra = Math.floor((dayOfEra - Math.floor(dayOfEra / 1460)
        + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365);
    const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4)
        - Math.floor(yearOfEra / 100));
    const turned = Math.floor((5 * dayOfYear + 2) / 153);
    const day = dayOfYear - Math.floor((153 * turned + 2) / 5) + 1;
    const month = turned < 10 ? turned + 3 : turned - 9;
    const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);
    const two = value => String(value).padStart(2, '0');
    return `${String(year).padStart(4, '0')}-${two(month)}-${two(day)}`;
}

// A day that exists: it survives the round trip. 2026-02-30 does not.
export function isRealDay(text) {
    return typeof text === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(text)
        && dateText(dayNumber(text)) === text;
}

export function addDays(text, count) {
    return dateText(dayNumber(text) + count);
}

const mod = (value, by) => ((value % by) + by) % by;

// THE NAMED FRIDAY. «An account is fourteen days anchored to a named Friday»
// (docs/architecture.md); tests/money.test.mjs names it as the 7th of August 2026. The
// date is the owner's, a fact about the business - it is copied here as a fact, not
// derived, and `anchorIsAFriday` below is what the suite asks before trusting it.
export const ACCOUNT_ANCHOR = '2026-08-07';
const ANCHOR = dayNumber(ACCOUNT_ANCHOR);

// 1970-01-01 was a Thursday, so a day number that leaves 1 over 7 is a Friday.
export function isFriday(text) {
    return mod(dayNumber(text), 7) === 1;
}

export function anchorIsAFriday() {
    return isFriday(ACCOUNT_ANCHOR);
}

// «Weeks run Friday-Thursday» - the Friday at or before the day.
export function weekStart(text) {
    const at = dayNumber(text);
    return dateText(at - mod(at - 1, 7));
}

// «Every other account sits a whole number of fortnights from» the anchor.
export function accountStart(text) {
    const at = dayNumber(text);
    return dateText(at - mod(at - ANCHOR, 14));
}

// ---------------------------------------------------------------- one man's own period
//
// docs/weekly-cycle.md and the block over PAY_CYCLES in js/dates.js: four of the crew are
// settled every Thursday, the rest every second Thursday. The record is a history in one
// canonical string - `2026-09-11=weekly;2026-09-25=biweekly` - each boundary a Friday,
// strictly increasing. «Absent means every second Thursday», and so does a history this
// reader cannot read.

export function cycleHistory(worker) {
    if (!worker) return [];
    const text = worker.payCycles;
    if (text === undefined || text === null || text === '') {
        // The pair an unreleased build wrote, read as a one-entry history.
        const cycle = worker.payCycle;
        const from = worker.payCycleFrom;
        if ((cycle === 'weekly' || cycle === 'biweekly') && isRealDay(from) && isFriday(from)) {
            return [{ from, cycle }];
        }
        return [];
    }
    if (typeof text !== 'string') return [];
    const out = [];
    for (const piece of text.split(';')) {
        const cut = piece.indexOf('=');
        if (cut === -1) return [];
        const from = piece.slice(0, cut);
        const cycle = piece.slice(cut + 1);
        if (!isRealDay(from) || !isFriday(from)) return [];
        if (cycle !== 'weekly' && cycle !== 'biweekly') return [];
        if (out.length > 0 && from <= out[out.length - 1].from) return [];
        out.push({ from, cycle });
    }
    return out;
}

// The period containing a day, for one man.
//
// Worked out as an INTERSECTION, which is how the rule is stated: the history cuts the
// calendar into stretches, each governed by one cycle («the last boundary at or before
// it»; before the first boundary, every second Thursday). The day sits in one stretch.
// Its period is the week or the fortnight of that stretch's cycle, kept inside the
// stretch - «the fortnight the change interrupts becomes its own transition period,
// ending the day before the new cycle opens», and a return to fortnightly on a
// fortnight's second Friday «starts a short first period THERE, not in the week just
// paid».
export function periodOf(worker, text) {
    const history = cycleHistory(worker).map(entry => ({
        from: dayNumber(entry.from), cycle: entry.cycle
    }));
    const at = dayNumber(text);
    let index = -1;
    history.forEach((entry, i) => { if (entry.from <= at) index = i; });
    const cycle = index === -1 ? 'biweekly' : history[index].cycle;
    const stretchFrom = index === -1 ? -Infinity : history[index].from;
    const stretchTo = index + 1 < history.length ? history[index + 1].from - 1 : Infinity;

    const opens = dayNumber(cycle === 'weekly' ? weekStart(text) : accountStart(text));
    const shuts = opens + (cycle === 'weekly' ? 6 : 13);
    const from = Math.max(opens, stretchFrom);
    const to = Math.min(shuts, stretchTo);
    return {
        cycle,
        from: dateText(from),
        to: dateText(to),
        transition: from !== opens || to !== shuts
    };
}

// «Derived by stepping one day past the end and asking again.»
export function nextPeriod(worker, text) {
    return periodOf(worker, addDays(periodOf(worker, text).to, 1));
}

export function isPeriodOf(worker, from, to) {
    if (!isRealDay(from) || !isRealDay(to)) return false;
    const period = periodOf(worker, from);
    return period.from === from && period.to === to;
}

// ---------------------------------------------------------------- money, in agorot

// A figure off the record, in whole agorot. The record holds shekels to the agora; a
// value finer than that is a value three surfaces would round three ways, and this
// calculator refuses to pick one.
export function agorot(value) {
    if (value === undefined || value === null) return 0;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`oracle: not money: ${JSON.stringify(value)}`);
    }
    const scaled = value * 100;
    const whole = Math.round(scaled);
    if (Math.abs(scaled - whole) > 1e-6) {
        throw new Error(`oracle: finer than an agora: ${value}`);
    }
    return whole;
}

// Agorot back to the shekels a surface prints. One division, by a whole number.
export function shekels(value) {
    return value === null || value === undefined ? value : value / 100;
}

// ---------------------------------------------------------------- one reading at a time
//
// Every function here is a function of the record it is handed and of nothing else, and
// most of them start by walking the whole of it. Asked a thousand questions about one
// record, that is a thousand walks.
//
// `reading(record, work)` is a promise from the CALLER: while `work` runs, this record
// does not change. Inside it, what was worked out once is kept. Outside it - and for any
// other record - nothing is ever remembered, so an answer can never be about a record
// as it used to be. Each exported question opens a reading of its own for as long as it
// takes to answer.
let frame = null;

export function reading(record, work) {
    if (frame && frame.record === record) return work();
    const outer = frame;
    frame = { record, kept: new Map() };
    try { return work(); } finally { frame = outer; }
}

function once(record, key, work) {
    if (!frame || frame.record !== record) return work();
    if (!frame.kept.has(key)) frame.kept.set(key, work());
    return frame.kept.get(key);
}

// ---------------------------------------------------------------- who is on the record
//
// The roster, and then anybody the record still names. «Work outranks a tombstone: a day
// or advance naming a deleted worker reinstates him - archived» (docs/architecture.md).
// What comes back is whatever anybody still remembers; handed nothing but the record,
// that is an id, no rate and no pay cycle.
export function workersOf(record) {
    return once(record, 'workers', () => everyoneOn(record));
}

function everyoneOn(record) {
    const out = (record.workers || []).filter(Boolean).map(worker => worker);
    const known = new Set(out.map(worker => String(worker.id)));
    const named = [];
    const meet = id => {
        const key = String(id);
        if (!known.has(key)) { known.add(key); named.push(key); }
    };
    Object.keys(record.days || {}).forEach(date => {
        ['plan', 'actual'].forEach(layer => {
            Object.keys((record.days[date] || {})[layer] || {}).forEach(meet);
        });
    });
    Object.values(record.advances || {}).forEach(item => {
        if (item && item.workerId) meet(item.workerId);
    });
    Object.values((record.ledger && record.ledger.advances) || {}).forEach(entry => {
        if (entry && entry.workerId) meet(entry.workerId);
    });
    named.forEach(id => out.push({ id, dailyRate: 0, hourlyRate: 0, active: false,
        reinstated: true }));
    return out;
}

function workerById(record, workerId) {
    return workersOf(record).find(worker => String(worker.id) === String(workerId)) || null;
}

function datesIn(record, from, to) {
    return once(record, `dates|${from}|${to}`, () => Object.keys(record.days || {})
        .filter(date => date >= from && date <= to).sort());
}

// ---------------------------------------------------------------- what a day was worth
//
// The rules, as the block over payrollReport gives them and docs/architecture.md repeats:
//
//   a normal day        = the daily rate
//   a double day        = twice the daily rate, exactly
//   extra hours         = the hourly rate, per hour, on top
//   two sites in a day  = still one day; normal at one and double at the other is double
//
// AND IRON LAW 2: the rate is the one STAMPED on the day (`rates: { daily, hourly }`),
// surviving every later edit. The roster's rate is read only for a day that carries no
// stamp - a day recorded before stamping existed.
//
// An absence is not a day of work and not a deduction. A record with no site on it
// (`{ entries: [] }`) is a placeholder, not a day.
//
// A day with no daily rate is worth an UNKNOWN amount - null, never 0.
export function dayOf(record, worker, date) {
    const side = ((record.days || {})[date] || {}).actual || {};
    const held = side[worker.id];
    if (!held || typeof held !== 'object') return null;
    if (held.absent) return { date, absent: true };

    const entries = Array.isArray(held.entries) ? held.entries : [];
    if (entries.length === 0) return null;

    const doubled = entries.some(entry => entry && entry.rate === 'double');
    const hours = entries.reduce((sum, entry) => {
        const extra = entry ? Number(entry.extraHours) : 0;
        return sum + (Number.isFinite(extra) && extra > 0 ? extra : 0);
    }, 0);

    const stamped = Boolean(held.rates);
    const daily = agorot(stamped ? held.rates.daily : worker.dailyRate);
    const hourly = agorot(stamped ? held.rates.hourly : worker.hourlyRate);
    const units = doubled ? 2 : 1;

    return {
        date,
        absent: false,
        sites: entries.map(entry => String(entry.placeId)),
        doubled,
        units,
        hours,
        stamped,
        daily,
        hourly,
        amount: daily > 0 ? daily * units + hourly * hours : null
    };
}

// Money handed over before settlement day, as the field every phone reads holds it
// («the screens still read the legacy field», docs/architecture.md).
function legacyAdvances(record) {
    return once(record, 'legacy', () => legacyList(record));
}

function legacyList(record) {
    const held = record.advances || {};
    return Object.keys(held)
        .filter(id => held[id] && typeof held[id] === 'object')
        .map(id => ({
            id: String(id),
            workerId: String(held[id].workerId),
            date: String(held[id].date),
            amount: agorot(held[id].amount)
        }));
}

function advancesGiven(record, workerId, from, to) {
    return legacyAdvances(record)
        .filter(item => item.workerId === String(workerId) && item.date >= from && item.date <= to)
        .reduce((sum, item) => sum + item.amount, 0);
}

// One man's row on the pay sheet over a range of dates, with nothing frozen applied.
function liveRow(record, worker, from, to) {
    return once(record, `row|${worker.id}|${from}|${to}`, () => rowOf(record, worker, from, to));
}

function rowOf(record, worker, from, to) {
    const row = {
        workerId: worker.id,
        attendanceDays: 0,
        payUnits: 0,
        normalDays: 0,
        doubleDays: 0,
        extraHours: 0,
        siteVisits: 0,
        absent: 0,
        hoursUnpriced: false,
        days: []
    };
    let total = 0;
    let unpriced = false;
    const rates = new Set();

    datesIn(record, from, to).forEach(date => {
        const day = dayOf(record, worker, date);
        if (!day) return;
        row.days.push(day);
        if (day.absent) { row.absent += 1; return; }

        // Two counts: how many DATES he was on a site, and how many days he is PAID for.
        row.attendanceDays += 1;
        row.payUnits += day.units;
        row.siteVisits += day.sites.length;
        if (day.doubled) row.doubleDays += 1; else row.normalDays += 1;
        row.extraHours += day.hours;
        rates.add(day.daily);

        if (day.amount === null) { unpriced = true; return; }
        // FOLLOWS THE CODE: the flag is raised only on a day that HAS a daily rate. A
        // day with neither rate is already an unknown amount; whether its hours are also
        // «unpriced» is not written down anywhere.
        if (day.hours > 0 && day.hourly <= 0) row.hoursUnpriced = true;
        total += day.amount;
    });

    const roster = agorot(worker.dailyRate);
    // «Only a number when there is a rate to multiply by»: no days and a rate is 0; no
    // days and no rate is unknown; any worked day without a rate makes the whole unknown.
    if (row.attendanceDays === 0) row.amount = roster > 0 ? 0 : null;
    else row.amount = unpriced ? null : total;

    // «More than one rate inside the period», or «every day at one rate that is no
    // longer the rate on the roster today».
    row.mixedRates = rates.size > 1
        || (roster > 0 && row.attendanceDays > 0 && !rates.has(roster));

    row.advances = advancesGiven(record, worker.id, from, to);
    return row;
}

// ---------------------------------------------------------------- the ledger, folded
//
// docs/architecture.md, «Money»: `ledger.advances` is a map of ENTRIES, never rewritten
// and never removed, and what anybody reads is a fold over them.
//
//   given      cash handed over - the origin, `le_mig_<advanceId>`
//   repaid     cash handed BACK, on its own date; it accumulates
//   reversed   a correction. It names the transaction it corrects (`targetId`) and runs
//              against that transaction's own direction: undoing money handed over
//              reduces the debt, undoing a repayment or a deduction puts it back. One
//              that names nothing was written when the only thing it could mean was
//              «this advance was recorded in error».
//   deducted   what came off a WAGE when a period closed, per advance
//   closed     the period itself, frozen: the payslip, moving no money
//   corrected, cancelled   restate or withdraw the advance itself

function ledgerEntries(record) {
    return once(record, 'entries', () => entriesOf(record));
}

function entriesOf(record) {
    const held = (record.ledger && record.ledger.advances) || {};
    return Object.keys(held).map(id => held[id])
        .filter(entry => entry && typeof entry === 'object' && entry.id)
        // «The order is by `at` and then by id.»
        .sort((a, b) => {
            const one = String(a.at || '');
            const two = String(b.at || '');
            if (one !== two) return one < two ? -1 : 1;
            return String(a.id) < String(b.id) ? -1 : 1;
        });
}

// What the ledger says each advance IS: who, when, how much. Absent where the ledger has
// no origin for it, or has cancelled it.
function foldedAdvances(record) {
    const out = new Map();
    ledgerEntries(record).forEach(entry => {
        if (!entry.advanceId) return;
        const id = String(entry.advanceId);
        if (entry.kind === 'given') {
            out.set(id, { id, workerId: String(entry.workerId), date: String(entry.date),
                amount: agorot(Number(entry.amount) || 0) });
        } else if (entry.kind === 'cancelled') {
            out.delete(id);
        } else if (entry.kind === 'corrected' && out.has(id)) {
            const was = out.get(id);
            out.set(id, {
                id,
                workerId: entry.workerId === undefined ? was.workerId : String(entry.workerId),
                date: entry.date === undefined ? was.date : String(entry.date),
                amount: entry.amount === undefined ? was.amount : agorot(Number(entry.amount) || 0)
            });
        }
    });
    return out;
}

// Every advance the record knows about: «the ledger's answer where there is one; the
// old field otherwise».
//
// FOLLOWS THE CODE for the two kinds no screen of this build writes. An advance the
// ledger has `cancelled` falls back to the old field here, as it does in the app's
// advanceOutstanding - although currentAdvances says a cancellation «is not resurrected
// by the old field». And a `corrected` entry restates what an advance IS for the fold,
// while an account goes on reading what was GIVEN from the old field (`advancesGiven`).
// The suite generates neither kind, so nothing here is evidence about them; see
// tests/README.md, «what the oracle does not cover».
export function advancesOf(record) {
    return once(record, 'advances', () => everyAdvance(record));
}

function everyAdvance(record) {
    const folded = foldedAdvances(record);
    const out = new Map();
    legacyAdvances(record).forEach(item => out.set(item.id, item));
    folded.forEach((state, id) => out.set(id, state));
    return out;
}

// «Whose entry it is comes from the ADVANCE, not from the entry.»
function ownerOf(advances, entry) {
    const of = advances.get(String(entry.advanceId));
    return of ? of.workerId : null;
}

// What a correction corrects: the kind of the transaction it names, read off the record.
function correctedKind(entry, byId) {
    const target = entry.targetId ? byId.get(String(entry.targetId)) : null;
    if (target) return String(target.kind);
    return String(entry.targetKind || 'given');
}

// WHAT IS STILL OWED ON ONE ADVANCE - «the one answer» every surface prints.
//
//   given, less a correction saying it was never handed over
//   settled = cash back + wage deductions, each less the corrections against it
//   left never goes below zero; the remainder is `overpaid`, its own number
//
// `onOrBefore` leaves out everything but the origin dated after that day - how a closure
// reads the debt «as it stood» at its own period's end.
export function outstanding(record, advanceId, onOrBefore) {
    return once(record, `left|${advanceId}|${onOrBefore || ''}`,
        () => standing(record, advanceId, onOrBefore));
}

function standing(record, advanceId, onOrBefore) {
    const id = String(advanceId);
    const of = advancesOf(record).get(id);
    const entries = ledgerEntries(record).filter(entry => String(entry.advanceId) === id);
    const byId = new Map(entries.map(entry => [String(entry.id), entry]));

    let repaid = 0;
    let deducted = 0;
    let reversed = 0;
    let undoneGiven = 0;
    let undoneRepaid = 0;
    let undoneDeducted = 0;
    entries.forEach(entry => {
        if (onOrBefore && entry.kind !== 'given' && String(entry.date || '') > onOrBefore) return;
        const sum = agorot(Number(entry.amount) || 0);
        if (entry.kind === 'repaid') repaid += sum;
        else if (entry.kind === 'deducted') deducted += sum;
        else if (entry.kind === 'reversed') {
            reversed += sum;
            const kind = correctedKind(entry, byId);
            if (kind === 'repaid') undoneRepaid += sum;
            else if (kind === 'deducted') undoneDeducted += sum;
            else undoneGiven += sum;
        }
    });

    const given = (of ? of.amount : 0) - undoneGiven;
    const settled = (repaid - undoneRepaid) + (deducted - undoneDeducted);
    return {
        id,
        given,
        repaid: repaid - undoneRepaid,
        deducted: deducted - undoneDeducted,
        reversed,
        settled,
        left: Math.max(0, given - settled),
        overpaid: Math.max(0, settled - given)
    };
}

// «More has been settled against this man's advances than was ever handed to him» - the
// sum of it, over all of them.
export function overpaidBy(record, workerId) {
    let sum = 0;
    advancesOf(record).forEach((of, id) => {
        if (of.workerId === String(workerId)) sum += outstanding(record, id).overpaid;
    });
    return sum;
}

// What still has to be settled with a man: what is left on each of his advances, added up.
export function openBalance(record, workerId) {
    let sum = 0;
    let count = 0;
    advancesOf(record).forEach((of, id) => {
        if (of.workerId !== String(workerId)) return;
        count += 1;
        sum += outstanding(record, id).left;
    });
    return { count, total: sum };
}

// Movements dated inside a range, for one man, by kind - and a correction by what it
// corrects.
function movements(record, workerId, from, to) {
    const advances = advancesOf(record);
    const entries = ledgerEntries(record);
    const byId = new Map(entries.map(entry => [String(entry.id), entry]));
    const out = { repaid: 0, reversed: 0, undoneGiven: 0, undoneRepaid: 0, undoneDeducted: 0 };
    entries.forEach(entry => {
        if (!entry.advanceId || ownerOf(advances, entry) !== String(workerId)) return;
        const date = String(entry.date || '');
        if (date < from || date > to) return;
        const sum = agorot(Number(entry.amount) || 0);
        if (entry.kind === 'repaid') out.repaid += sum;
        if (entry.kind !== 'reversed') return;
        out.reversed += sum;
        const kind = correctedKind(entry, byId);
        if (kind === 'repaid') out.undoneRepaid += sum;
        else if (kind === 'deducted') out.undoneDeducted += sum;
        else if (kind === 'given') out.undoneGiven += sum;
    });
    return out;
}

// ---------------------------------------------------------------- the closed period
//
// «A closed period carries a RECORD of what came off, and every later read of that
// period reports the record rather than doing the sum again.» Two kinds say it: the
// artifact (`closed`, one per man and period, the payslip) and the deductions
// (`deducted`, one per advance the close touched). Keyed by the day the period opened;
// «a closure freezes the fortnight it names, not every range that starts on the same
// Friday», so a reader also asks that it ended on the day the range ends.
export function closuresOf(record, workerId) {
    return once(record, `closed|${workerId}`, () => closedFor(record, workerId));
}

function closedFor(record, workerId) {
    const legacy = record.advances || {};
    const out = new Map();
    const held = (record.ledger && record.ledger.advances) || {};
    const readable = value => {
        const number = Number(value);
        return Number.isFinite(number) ? agorot(number) : undefined;
    };
    Object.values(held)
        .filter(entry => entry && (entry.kind === 'deducted' || entry.kind === 'closed')
            && entry.periodFrom)
        .filter(entry => {
            const of = legacy[entry.advanceId];
            return String(of ? of.workerId : entry.workerId) === String(workerId);
        })
        .forEach(entry => {
            const key = String(entry.periodFrom);
            const at = out.get(key) || { from: key, deducted: 0 };
            if (at.to === undefined && entry.periodTo !== undefined) at.to = String(entry.periodTo);
            if (entry.kind === 'deducted') {
                // «Two advances can each be deducted at one close»: they add up.
                at.deducted += agorot(Number(entry.amount) || 0);
                if (entry.balanceAfter !== undefined) {
                    at.left = (at.left || 0) + agorot(Number(entry.balanceAfter) || 0);
                }
            }
            // «Per PERIOD and not per advance»: every entry of one close records the
            // same wage, so it is taken once.
            if (at.gross === undefined && entry.gross !== undefined && entry.gross !== null) {
                at.gross = readable(entry.gross);
            }
            if (at.carriedIn === undefined && entry.carriedIn !== undefined) {
                at.carriedIn = readable(entry.carriedIn);
            }
            if (at.basis === undefined && entry.basis && typeof entry.basis === 'object') {
                at.basis = entry.basis;
            }
            if (at.days === undefined && Array.isArray(entry.days)) at.days = entry.days;
            out.set(key, at);
        });
    // «New artifacts freeze the TOTAL»: a partial deduction can leave an advance
    // untouched, so the artifact's own balance is the period's, where it carries one.
    Object.values(held)
        .filter(entry => entry && entry.kind === 'closed'
            && String(entry.workerId) === String(workerId) && entry.balanceAfter !== undefined)
        .forEach(entry => {
            const at = out.get(String(entry.periodFrom));
            if (at) at.left = agorot(Number(entry.balanceAfter) || 0);
        });
    return out;
}

function frozenFor(record, workerId, from, to) {
    const frozen = closuresOf(record, workerId).get(String(from));
    if (!frozen) return undefined;
    if (frozen.to !== undefined && frozen.to !== String(to)) return undefined;
    return frozen;
}

// Every closed period of this man sharing a day with [from, to]. «The question is asked
// about DAYS.»
export function closuresOverlapping(record, workerId, from, to) {
    const out = [];
    closuresOf(record, workerId).forEach(period => {
        if (period.to === undefined) { if (period.from === from) out.push(period.from); return; }
        if (period.from <= to && period.to >= from) out.push(period.from);
    });
    return out.sort();
}

// ---------------------------------------------------------------- the pay sheet
//
// One row per man. «A closed fortnight reports the row it was closed on»: the wage and
// every count the sheet prints, where the closure recorded them - and only for the
// period it names.
//
// Only a POSITIVE advance is netted; `netAmount` is the wage less what was handed over in
// the range. (The carry - what an account could not cover going to the next one - is
// `account` below, and the sheet reads it only over a man's whole period.)
export function payrollRow(record, worker, from, to) {
    const row = liveRow(record, worker, from, to);
    const netted = row.advances > 0 ? row.advances : 0;
    row.netAmount = row.amount === null ? null : row.amount - netted;

    const frozen = frozenFor(record, worker.id, from, to);
    if (frozen !== undefined) {
        row.frozen = true;
        if (frozen.gross !== undefined) {
            row.amount = frozen.gross;
            row.netAmount = frozen.gross - netted;
        }
        if (frozen.basis) {
            ['attendanceDays', 'payUnits', 'normalDays', 'doubleDays', 'extraHours',
                'siteVisits', 'absent'].forEach(field => {
                const held = Number(frozen.basis[field]);
                if (Number.isFinite(held)) row[field] = held;
            });
        }
    }
    return row;
}

export function payroll(record, from, to) {
    return reading(record, () => workersOf(record)
        .map(worker => payrollRow(record, worker, from, to)));
}

// One man, day by day - «why is my pay this number». A closed period answers with the
// days it recorded.
export function workerDays(record, worker, from, to) {
    const frozen = frozenFor(record, worker.id, from, to);
    if (frozen !== undefined && Array.isArray(frozen.days)) {
        return frozen.days.map(day => {
            const entries = Array.isArray(day.entries) ? day.entries : [];
            return {
                date: String(day.date),
                absent: Boolean(day.absent),
                doubled: entries.some(one => String(one.rate) === 'double'),
                hours: entries.reduce((sum, one) => sum + (Number(one.hours) || 0), 0),
                amount: agorot(Number(day.amount) || 0),
                frozen: true
            };
        });
    }
    return liveRow(record, worker, from, to).days.map(day => (day.absent
        ? { date: day.date, absent: true, doubled: false, hours: 0, amount: 0 }
        : { date: day.date, absent: false, doubled: day.doubled, hours: day.hours,
            amount: day.amount, daily: day.daily,
            // «Not at the rate the roster shows today.»
            historic: day.stamped && day.daily !== agorot(worker.dailyRate) }));
}

// ---------------------------------------------------------------- the client's invoice
//
// The client is billed worker-site DAYS, not shekels: one for each of the owner's men on
// that site that day - a man at two sites is one at each, and still one day of pay - and,
// since the owner's ruling of 2026-11-01 (docs/releases.md, v166), one for each of Rima's
// men counted there: «three of his and two of Rima's on a site is five». A day with Rima
// and none of his men is a billed day. Rima is a count of people, 1 to 99, and never
// touches pay.

export function rimaAt(record, date, placeId) {
    const map = ((record.days || {})[date] || {}).rima;
    if (!map || typeof map !== 'object' || Array.isArray(map)) return 0;
    if (!Object.prototype.hasOwnProperty.call(map, placeId)) return 0;
    const count = map[placeId];
    return typeof count === 'number' && Number.isInteger(count) && count >= 1 && count <= 99
        ? count : 0;
}

function menAt(record, date, placeId) {
    const side = ((record.days || {})[date] || {}).actual || {};
    return workersOf(record).filter(worker => {
        const held = side[worker.id];
        return held && !held.absent && (held.entries || [])
            .some(entry => String(entry.placeId) === String(placeId));
    }).map(worker => worker.id);
}

// Every site the range names: «the roster first, then every site the days name that the
// roster has not got».
export function sitesIn(record, from, to) {
    const roster = (record.places || []).map(place => String(place.id));
    const known = new Set(roster);
    const extra = new Set();
    datesIn(record, from, to).forEach(date => {
        const day = record.days[date] || {};
        ['plan', 'actual'].forEach(layer => {
            Object.values(day[layer] || {}).forEach(held => {
                ((held && held.entries) || []).forEach(entry => {
                    const id = String(entry.placeId);
                    if (!known.has(id)) extra.add(id);
                });
            });
        });
        Object.keys((day.rima && typeof day.rima === 'object') ? day.rima : {})
            .forEach(id => { if (!known.has(id) && rimaAt(record, date, id) > 0) extra.add(id); });
    });
    return roster.concat(Array.from(extra).sort());
}

export function invoice(record, from, to) {
    return reading(record, () => billed(record, from, to));
}

function billed(record, from, to) {
    const dates = datesIn(record, from, to);
    return sitesIn(record, from, to).map(placeId => {
        const row = { placeId, workerDays: 0, ownDays: 0, rimaDays: 0, byDate: {},
            ownByDate: {}, rimaByDate: {} };
        dates.forEach(date => {
            const own = menAt(record, date, placeId).length;
            const rima = rimaAt(record, date, placeId);
            if (own + rima === 0) return;
            row.byDate[date] = own + rima;
            row.ownByDate[date] = own;
            if (rima > 0) row.rimaByDate[date] = rima;
            row.workerDays += own + rima;
            row.ownDays += own;
            row.rimaDays += rima;
        });
        return row;
    });
}

// ---------------------------------------------------------------- an account, walked
//
// docs/architecture.md, «The fourth kind» and «The fifth kind»:
//
//   «An account takes what it was carrying, adds what was given inside it, subtracts
//    what was handed back inside it, and deducts from the wage only what is left - never
//    more than the man earned. The order is load-bearing: repayments come off before the
//    wage is asked to cover the rest. A man with no rate is owed an unknown amount, not
//    zero, so the balance passes through him untouched. An overpayment does not become a
//    negative balance.»
//
//   «Every figure is a function of what is dated on or before its own account's last
//    day, and of nothing else.»
//
//   A closed period reports its record: the deduction, the wage and the opening balance
//   it was closed on. It has TWO balances out: `carriedOut` is what the payslip says and
//   says for ever; `carriedForward` is what the next period opens owing, and includes
//   anything dated into this period after it shut. `lateSinceClose` names the gap.
//
//   While more has been settled against a man's advances than he was ever given, the
//   automatic deduction STOPS on every open period and the row says `review`.
//
// `opening` is what the period started out owing; `accountOf` works it out.
export function walk(record, workerId, from, to, opening) {
    return reading(record, () => once(record, `walk|${workerId}|${from}|${to}|${opening}`,
        () => walked(record, workerId, from, to, opening)));
}

function walked(record, workerId, from, to, opening) {
    const worker = workerById(record, workerId);
    const given = advancesGiven(record, workerId, from, to);
    const moved = movements(record, workerId, from, to);
    const closed = frozenFor(record, workerId, from, to);

    const live = worker ? liveRow(record, worker, from, to).amount : null;
    const gross = closed !== undefined && closed.gross !== undefined ? closed.gross : live;

    // Cash back first, each correction against its own target, and never below zero.
    const balance = Math.max(0, opening + given - (moved.repaid - moved.undoneRepaid)
        - moved.undoneGiven + moved.undoneDeducted);

    const overpaid = overpaidBy(record, workerId);
    const deducted = closed !== undefined
        ? closed.deducted
        : (gross === null || overpaid > 0 ? 0 : Math.min(balance, Math.max(gross, 0)));

    // BY THE RULE, AND THE SUITE SAYS WHERE THE APP PARTS FROM IT: «an overpayment does
    // not become a negative balance, which would quietly add itself to his next wage as
    // though the firm owed him for it.» On an open period the sum cannot go below zero.
    // On a closed one it can - a repayment dated into the period after it shut, larger
    // than what the close left - and the rule is the same rule.
    const forward = Math.max(0, balance - deducted);
    const out = closed !== undefined && closed.left !== undefined ? closed.left : forward;

    return {
        from,
        to,
        carriedIn: closed !== undefined && closed.carriedIn !== undefined
            ? closed.carriedIn : opening,
        given,
        repaid: moved.repaid,
        reversed: moved.reversed,
        gross,
        deducted,
        carriedOut: out,
        carriedForward: forward,
        // What the sum comes to before the floor, so a reader can see when it bit.
        unflooredForward: balance - deducted,
        lateSinceClose: forward - out,
        overpaid,
        review: overpaid > 0 && closed === undefined,
        net: gross === null ? null : gross - deducted,
        closed: closed !== undefined
    };
}

// The man's periods that came before `from`, in his own cycle - «stepped in this man's
// own cycle, not in fourteens», starting from the period his first advance fell in, and
// «a period is "before" only when its last day falls short of the target's first».
export function periodsBefore(record, workerId, from) {
    const worker = workerById(record, workerId);
    const mine = legacyAdvances(record).filter(item => item.workerId === String(workerId))
        .map(item => item.date).sort();
    if (mine.length === 0) return [];
    const out = [];
    let period = periodOf(worker, mine[0]);
    while (period.from < from) {
        if (period.to < from) out.push(period);
        period = nextPeriod(worker, period.from);
    }
    return out;
}

// What the period beginning `from` opens owing: every account before it, walked in order,
// each handing the next what it carried FORWARD - «the payslip is frozen, the money is
// not».
export function openingBalance(record, workerId, from) {
    return reading(record, () => {
        let balance = 0;
        periodsBefore(record, workerId, from).forEach(period => {
            balance = walk(record, workerId, period.from, period.to, balance).carriedForward;
        });
        return balance;
    });
}

export function accountOf(record, workerId, from, to) {
    return reading(record, () =>
        walk(record, workerId, from, to, openingBalance(record, workerId, from)));
}

// Whether the floor in `walk` decided anything on the way to this period or inside it:
// the one place this calculator knowingly reads the rule where the app reads the sum.
export function floorBit(record, workerId, from, to) {
    let balance = 0;
    let bit = false;
    periodsBefore(record, workerId, from).concat([{ from, to }]).forEach(period => {
        const one = walk(record, workerId, period.from, period.to, balance);
        if (one.unflooredForward < 0) bit = true;
        balance = one.carriedForward;
    });
    return bit;
}

// ---------------------------------------------------------------- closing, predicted
//
// What a close would write, said before it is written. «The split is oldest advance
// first»; each advance gives up what it had left as of the period's last day, until the
// period's deduction is used up; what is left on it afterwards is its `balanceAfter`.
// `deduction` is the amount a person chose instead of the whole of what could come off.
export function closePlan(record, workerId, from, to, deduction) {
    return reading(record, () => planned(record, workerId, from, to, deduction));
}

function planned(record, workerId, from, to, deduction) {
    const account = accountOf(record, workerId, from, to);
    const reasons = [];
    if (account.closed) reasons.push('closed');
    if (closuresOverlapping(record, workerId, from, to).some(key => key !== from)) {
        reasons.push('overlap');
    }
    if (account.review) reasons.push('overpaid');
    if (account.gross === null) reasons.push('unpriced');

    const off = deduction === undefined ? account.deducted : deduction;
    const mine = [];
    advancesOf(record).forEach((of, id) => {
        if (of.workerId !== String(workerId)) return;
        const left = outstanding(record, id, to).left;
        if (left > 0) mine.push({ id, date: of.date, left });
    });
    mine.sort((a, b) => (a.date < b.date ? -1 : (a.date > b.date ? 1 : (a.id < b.id ? -1 : 1))));

    let room = off;
    const rows = [];
    mine.forEach(item => {
        if (room <= 0) return;
        const take = Math.min(room, item.left);
        room -= take;
        rows.push({ advanceId: item.id, amount: take, balanceAfter: item.left - take });
    });

    const balance = account.carriedForward + account.deducted;
    return {
        reasons,
        gross: account.gross,
        carriedIn: account.carriedIn,
        deducted: off,
        carriedForward: balance - off,
        net: account.gross === null ? null : account.gross - off,
        rows,
        // The most a person may choose: what is owed, and never more than the wage.
        limit: account.gross === null ? 0 : Math.min(balance, Math.max(0, account.gross))
    };
}
