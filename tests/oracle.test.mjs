// Two calculators, one record.
//
//   node tests/oracle.test.mjs
//
// tests/oracle.mjs is a second calculator: written from the documented rules, handed the
// raw record, importing nothing from js/. This suite generates a few hundred records,
// asks the shipped app and the second calculator the same questions about each, and
// fails at the first figure they give differently - a day's worth, a pay sheet row, a
// client's worker-days, what is left on an advance, what a period opens and closes owing.
//
// Every suite before this one checked the app against literals somebody typed for one
// crew. That proves those cases. It cannot find the case nobody thought to type, and a
// silent arithmetic disagreement is, by definition, one nobody thought of.
//
// WHAT IS DETERMINISTIC HERE: everything. The records come from a seeded generator
// (mulberry32, the seeds are the integers below), there is no Math.random and no clock,
// and every `at` on a ledger entry is counted, not read. The time zone is SET, because
// the app's calendar is local time and the days around a DST change are among the cases:
// the records are priced in Asia/Jerusalem, and the calendar is compared in four zones.
//
// THREE THINGS THIS FILE DOES THAT ARE NOT COMPARISONS, and each is there so the
// comparisons mean something:
//
//   1. Hand-computed fixtures. A second calculator that shares a misreading with the
//      first agrees with it perfectly, so a handful of figures are literals, with the
//      arithmetic in a comment, and BOTH calculators are held to them.
//   2. The mutants. The app is loaded again with one line of js/model/money.js changed -
//      in memory, never on disk - and the comparison must go red each time. A net that
//      catches nothing is green too.
//   3. The census. A generator can quietly stop producing the hard cases; the last suite
//      counts them.
//
// NOTHING IS LEFT OUT. Up to v179 the two calculators were known to part on two things
// and those cases were kept out of this comparison by name and proved red in
// tests/oracle.findings.mjs, a file no gate ran: a closed period that carried forward
// less than nothing, and a wage finer than an agora closed against a debt at least as
// large. v180 repaired both. Their fixtures are green in tests/overpayment.test.mjs,
// which also opens what v179 already wrote, and every account and every close downstream
// of such a period is compared here like any other - the list of exclusions is gone, not
// emptied. A wage finer than an agora is still not GENERATED here (see HOURLY): the
// rounding is a rule now, and tests/overpayment.test.mjs holds both calculators to it on
// the one wage where it decides anything.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeDevice, loadOrder, sourceRoot } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import * as oracle from './oracle.mjs';

// The app's dates are local. Set before the first Date is made in this process.
const HOME_ZONE = 'Asia/Jerusalem';
process.env.TZ = HOME_ZONE;

const RECORDS = 240;
const MUTANT_RECORDS = 12;

// ---------------------------------------------------------------- the app, by name

// One device, every model function reached by name and remembered. `sources` runs the
// same device on other bytes - which is how a mutant is built.
function appOn(sources) {
    const device = makeDevice(sources ? { sources } : {});
    const held = new Map();
    const fn = name => {
        if (!held.has(name)) held.set(name, device.global(name));
        return held.get(name);
    };
    return new Proxy({}, { get: (_, name) => fn(String(name)) });
}

const APP = appOn();

// ---------------------------------------------------------------- comparing two figures

// A shekel figure from the app against agorot from the second calculator. The app sums
// floats and the calculator sums integers, so "equal" is "the same to a millionth of an
// agora" - tight enough that no rounding disagreement can hide in it, loose enough that
// 0.1 + 0.2 is not reported as a pay dispute.
function sameMoney(appValue, agorot) {
    if (agorot === null || agorot === undefined) return appValue === null || appValue === undefined;
    if (typeof appValue !== 'number' || !Number.isFinite(appValue)) return false;
    return Math.abs(appValue * 100 - agorot) < 1e-6;
}

const show = value => (value === undefined ? 'undefined' : JSON.stringify(value));
const shekels = agorot => (agorot === null || agorot === undefined ? agorot : agorot / 100);
const clone = value => JSON.parse(JSON.stringify(value));

// ---------------------------------------------------------------- the generator

function prng(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Where a record starts. Chosen for what is nearby: both DST changes in Israel in 2026
// and the spring one in 2027, the turn of a year, a leap day, and the named Friday.
const STARTS = ['2026-03-06', '2026-03-13', '2026-03-20', '2026-10-02', '2026-10-09',
    '2026-10-16', '2025-12-05', '2025-12-19', '2026-07-24', '2026-08-07', '2026-09-04',
    '2027-03-12', '2024-02-09', '2026-05-01', '2026-01-23'];

const DAILY = [300, 350, 400, 412.5, 450, 480, 520, 600, 333.33];
// Every hourly rate is a whole number of agorot for every half hour, so no wage here is
// finer than an agora. How the half is rounded is a rule since v180 and
// tests/overpayment.test.mjs holds both calculators to it; it stays out of the generator
// because a sum the app holds in binary can sit a hair under the half the second
// calculator's whole agorot see (16.665), and that comparison would be about floating
// point and not about anybody's pay.
const HOURLY = [0, 40, 45.5, 50, 62.5, 37.4];
const HANDED = [200, 300, 500, 750, 1000, 1500, 2500, 5000, 120.5, 333.33];

// One synthetic record, and everything that was seen while it was being made.
//
// It is built the way a season is: day after day, in order, with a counted clock. Days
// are written by this file's own writer (`putDay`), which stamps rates by iron law 2,
// and every one of those writes is also kept as an operation so the app's writers can
// be asked to produce the same days. Ledger entries are written raw, in the shapes
// js/model/ledger.js documents. The one thing the APP writes into the record is a
// closure: a period is closed through closePeriodChanges, the door the button uses, and
// what it wrote is checked on the spot against what the second calculator said it would.
function makeRecord(seed, app) {
    const random = prng(seed);
    const chance = p => random() < p;
    const int = (low, high) => low + Math.floor(random() * (high - low + 1));
    const pick = list => list[Math.floor(random() * list.length)];

    const start = oracle.addDays(pick(STARTS), int(0, 9));
    const length = int(42, 63);
    const last = oracle.addDays(start, length - 1);

    const record = {
        schemaVersion: 2,
        workers: [],
        places: [],
        days: {},
        vehicles: [],
        advances: {},
        // The approval of the carry is on the record, as it is on the owner's since v116:
        // with it there, every surface reads accounts the carried way.
        ledger: { advances: {}, unreadable: {},
            migrations: { cm_carry: { id: 'cm_carry', kind: 'carry', rows: 0, at: '', by: 'd_gen' } } },
        updatedAt: null,
        updatedBy: null
    };

    const workerCount = int(3, 5);
    for (let n = 1; n <= workerCount; n += 1) {
        const worker = { id: `w_${String(n).padStart(2, '0')}`, name: `עובד ${n}`, idNumber: '',
            phone: '', dailyRate: chance(0.1) ? 0 : pick(DAILY),
            hourlyRate: pick(HOURLY), active: true };
        // Settled weekly from some Friday; sometimes back to fortnightly later - on any
        // Friday, so a return can land on a fortnight's second one.
        if (chance(0.25)) {
            const first = oracle.weekStart(oracle.addDays(start, int(-21, Math.floor(length / 2))));
            if (chance(0.15)) {
                worker.payCycle = 'weekly';
                worker.payCycleFrom = first;
            } else {
                worker.payCycles = `${first}=weekly`;
                if (chance(0.45)) {
                    worker.payCycles += `;${oracle.addDays(first, 7 * int(1, 5))}=biweekly`;
                }
            }
        }
        record.workers.push(worker);
    }
    const placeCount = int(2, 5);
    for (let n = 1; n <= placeCount; n += 1) {
        record.places.push({ id: `p_${String(n).padStart(2, '0')}`, name: `אתר ${n}`,
            active: !chance(0.1) });
    }

    const made = {
        seed, start, last, record,
        roster0: clone({ workers: record.workers }),
        ops: [],
        closes: [],
        notes: new Set(),
        orphan: null
    };

    // The days before rate stamping existed, in some records: written with no stamp.
    const unstampedUntil = chance(0.25) ? oracle.addDays(start, int(5, 20)) : null;

    let today = start;
    let tick = 0;
    const at = () => {
        tick += 1;
        const two = value => String(value).padStart(2, '0');
        return `${today}T${two(Math.floor(tick / 3600) % 24)}:${two(Math.floor(tick / 60) % 60)}:${two(tick % 60)}.000Z`;
    };
    const rosterWorker = id => record.workers.find(worker => worker.id === id);

    // ---- days, by iron law 2
    const putDay = (date, workerId, next) => {
        if (!record.days[date]) record.days[date] = { plan: {}, actual: {} };
        const side = record.days[date].actual;
        const before = side[workerId];
        const held = Object.assign({}, next);
        if (before && before.rates) {
            held.rates = before.rates;
        } else if (!held.absent && held.entries.length > 0) {
            const who = rosterWorker(workerId);
            const daily = Number(who.dailyRate) || 0;
            const hourly = Number(who.hourlyRate) || 0;
            // «A worker with no rate yet is a rate that has not been decided, and
            // freezing "no rate" onto the day would make it permanent.»
            if (daily > 0 || hourly > 0) held.rates = { daily, hourly };
        }
        side[workerId] = held;
    };
    const entriesOn = (date, workerId) => {
        const held = ((record.days[date] || {}).actual || {})[workerId];
        return held && Array.isArray(held.entries) ? held.entries : [];
    };
    const entry = (placeId, band, hours) => {
        const out = { placeId };
        if (band !== 'normal') out.rate = band;
        if (hours > 0) out.extraHours = hours;
        return out;
    };
    const doOp = op => {
        made.ops.push(op);
        if (op.op === 'assign') {
            const kept = entriesOn(op.date, op.w).filter(one => one.placeId !== op.place);
            putDay(op.date, op.w, { entries: kept.concat([entry(op.place, op.band, op.hours)]) });
        } else if (op.op === 'unassign') {
            putDay(op.date, op.w,
                { entries: entriesOn(op.date, op.w).filter(one => one.placeId !== op.place) });
        } else if (op.op === 'band') {
            putDay(op.date, op.w, { entries: entriesOn(op.date, op.w)
                .map(one => (one.placeId === op.place ? entry(op.place, op.band, op.hours) : one)) });
        } else if (op.op === 'absent') {
            putDay(op.date, op.w, { absent: true, entries: [] });
        } else if (op.op === 'clear') {
            putDay(op.date, op.w, { entries: [] });
        } else if (op.op === 'unstamped') {
            if (!record.days[op.date]) record.days[op.date] = { plan: {}, actual: {} };
            record.days[op.date].actual[op.w] = clone(op.held);
        } else if (op.op === 'rima') {
            if (!record.days[op.date]) record.days[op.date] = { plan: {}, actual: {} };
            const day = record.days[op.date];
            if (op.count === null) {
                if (day.rima) {
                    delete day.rima[op.place];
                    if (Object.keys(day.rima).length === 0) delete day.rima;
                }
            } else {
                day.rima = day.rima || {};
                day.rima[op.place] = op.count;
            }
        } else if (op.op === 'rate') {
            const who = rosterWorker(op.w);
            who.dailyRate = op.daily;
            who.hourlyRate = op.hourly;
        } else if (op.op === 'archive') {
            rosterWorker(op.w).active = false;
        }
    };

    const band = () => {
        const roll = random();
        if (roll < 0.68) return { band: 'normal', hours: chance(0.04) ? pick([1, 2]) : 0 };
        if (roll < 0.88) return { band: 'extra', hours: chance(0.9) ? pick([0.5, 1, 1.5, 2, 3, 4]) : 0 };
        return { band: 'double', hours: chance(0.15) ? pick([1, 2.5]) : 0 };
    };
    const workDay = (date, workerId) => {
        const sites = record.places.map(place => place.id);
        const first = pick(sites);
        const one = band();
        if (unstampedUntil && date <= unstampedUntil) {
            const held = { entries: [entry(first, one.band, one.hours)] };
            doOp({ op: 'unstamped', date, w: workerId, held });
            made.notes.add('a day with no stamp');
            return;
        }
        doOp({ op: 'assign', date, w: workerId, place: first, band: one.band, hours: one.hours });
        if (chance(0.25)) {
            const second = pick(sites.filter(id => id !== first));
            const two = band();
            doOp({ op: 'assign', date, w: workerId, place: second, band: two.band, hours: two.hours });
        }
    };

    // ---- money
    let serial = 0;
    const give = (workerId, date, amount) => {
        serial += 1;
        const id = `a_${String(serial).padStart(3, '0')}`;
        record.advances[id] = { id, workerId, date, amount, note: '' };
        // Nine in ten carry their origin, as recordNewAdvance writes it; the tenth is an
        // advance a phone that cannot write entries recorded.
        if (!chance(0.1)) {
            record.ledger.advances[`le_mig_${id}`] = { id: `le_mig_${id}`, advanceId: id,
                kind: 'given', workerId, date, amount, note: '', at: at(), by: 'd_gen' };
        } else {
            made.notes.add('an advance with no origin entry');
        }
    };
    const ledgerOf = advanceId => Object.values(record.ledger.advances)
        .filter(one => one.advanceId === advanceId);
    const repay = (advanceId, date, amount) => {
        serial += 1;
        const id = `le_p${String(serial).padStart(3, '0')}`;
        record.ledger.advances[id] = { id, advanceId, kind: 'repaid', date, amount, note: '',
            at: at(), by: 'd_gen' };
    };
    const correct = target => {
        const id = `le_rev_${target.id}`;
        if (record.ledger.advances[id]) return false;
        record.ledger.advances[id] = { id, advanceId: target.advanceId, kind: 'reversed',
            targetId: target.id, targetKind: target.kind, targetDate: target.date,
            targetAmount: target.amount, date: target.date, amount: target.amount,
            reason: 'נרשם בטעות', at: at(), by: 'd_gen' };
        made.notes.add(`a correction of a ${target.kind}`);
        return true;
    };

    // ---- closing, through the app's own door
    const closedKeys = new Set();
    const tryClose = (worker, period) => {
        const key = `${worker.id}|${period.from}`;
        if (closedKeys.has(key)) return;
        let chosen;
        const open = oracle.closePlan(record, worker.id, period.from, period.to);
        if (open.reasons.length === 0 && open.limit > 0 && chance(0.3)) {
            chosen = pick([0, open.limit, Math.floor(open.limit / 200) * 100,
                Math.min(open.limit, 10000)]);
        }
        const plan = oracle.closePlan(record, worker.id, period.from, period.to, chosen);
        const stamp = at();
        const appPlan = app.planPeriodClosure(record, worker.id, period.from, period.to, stamp,
            chosen === undefined ? undefined : shekels(chosen));
        const before = new Set(Object.keys(record.ledger.advances));
        const wrote = appPlan.canClose
            ? app.closePeriodChanges(record, worker.id, period.from, period.to, stamp, 'd_gen',
                chosen === undefined ? undefined : shekels(chosen))
            : [];
        made.closes.push({
            workerId: worker.id, from: period.from, to: period.to, chosen, plan,
            appReasons: appPlan.reasons.slice().sort(),
            written: Object.keys(record.ledger.advances).filter(id => !before.has(id))
                .map(id => clone(record.ledger.advances[id])),
            changes: wrote.length
        });
        if (appPlan.canClose) {
            closedKeys.add(key);
            made.notes.add('a closed period');
            if (chosen !== undefined) made.notes.add('a period closed on a chosen deduction');
            if (period.cycle === 'weekly') made.notes.add('a weekly period closed');
        }
    };

    for (let step = 0; step < length; step += 1) {
        today = oracle.addDays(start, step);
        tick = 0;
        const saturday = oracle.addDays(oracle.weekStart(today), 1) === today;

        record.workers.forEach(worker => {
            // A raise, a cut, or a rate decided for a man who had none.
            if (chance(0.025)) {
                doOp({ op: 'rate', w: worker.id, daily: pick(DAILY),
                    hourly: chance(0.5) ? worker.hourlyRate : pick(HOURLY) });
                made.notes.add('a rate changed');
            }
            if (worker.active && step > 20 && chance(0.004)) {
                doOp({ op: 'archive', w: worker.id });
                made.notes.add('a worker archived');
            }

            const turnout = (worker.active ? 0.7 : 0.05) * (saturday ? 0.12 : 1);
            const roll = random();
            if (roll < turnout) workDay(today, worker.id);
            else if (roll < turnout + 0.05) doOp({ op: 'absent', date: today, w: worker.id });
            else if (roll < turnout + 0.07) {
                // Put on a site and taken off again: a placeholder, with or without a stamp.
                doOp({ op: 'assign', date: today, w: worker.id, place: record.places[0].id,
                    band: 'normal', hours: 0 });
                doOp({ op: 'clear', date: today, w: worker.id });
                made.notes.add('an empty day');
            }

            // An evening's second thoughts about a day already recorded.
            if (chance(0.04) && step > 2) {
                const date = oracle.addDays(today, -int(1, Math.min(step, 25)));
                const held = entriesOn(date, worker.id);
                const stamped = ((record.days[date] || {}).actual || {})[worker.id];
                const kind = random();
                if (held.length === 2 && kind < 0.5) {
                    doOp({ op: 'unassign', date, w: worker.id, place: held[1].placeId });
                } else if (held.length === 1 && kind < 0.3) {
                    const other = record.places.map(place => place.id)
                        .filter(id => id !== held[0].placeId);
                    doOp({ op: 'assign', date, w: worker.id, place: pick(other), band: 'normal',
                        hours: 0 });
                } else if (held.length >= 1 && kind < 0.6) {
                    const one = band();
                    doOp({ op: 'band', date, w: worker.id, place: held[0].placeId, band: one.band,
                        hours: one.hours });
                } else if (held.length >= 1 && kind < 0.75) {
                    doOp({ op: 'clear', date, w: worker.id });
                } else if (kind < 0.85) {
                    doOp({ op: 'absent', date, w: worker.id });
                } else if (held.length === 0 && stamped === undefined) {
                    doOp({ op: 'assign', date, w: worker.id, place: record.places[0].id,
                        band: 'normal', hours: 0 });
                }
                made.notes.add('a recorded day edited later');
            }

            // Cash handed over; occasionally written down days late.
            if (chance(0.035)) {
                give(worker.id, chance(0.12) ? oracle.addDays(today, -int(1, 18)) : today,
                    pick(HANDED));
            }
            const mine = Object.values(record.advances).filter(one => one.workerId === worker.id);
            if (mine.length > 0 && chance(0.06)) {
                const of = pick(mine);
                const left = oracle.outstanding(record, of.id).left;
                const twice = chance(0.03);
                if (left > 0 || twice) {
                    // The form offers what is left as the ceiling. Two phones, both
                    // offline, each recording the same money handed back, is how more
                    // lands than was owed - and both entries are real.
                    const amount = twice ? oracle.agorot(of.amount)
                        : pick([left, Math.ceil(left / 2), Math.min(left, 20000)]);
                    const late = chance(0.2);
                    const date = late ? oracle.addDays(today, -int(1, 20)) : today;
                    repay(of.id, date < of.date ? of.date : date, shekels(amount));
                    if (twice) made.notes.add('more handed back than was owed');
                }
            }
            if (mine.length > 0 && chance(0.012)) {
                const of = pick(mine);
                const state = oracle.outstanding(record, of.id);
                const room = oracle.agorot(of.amount) - ledgerOf(of.id)
                    .filter(one => one.kind === 'reversed' && !one.targetId)
                    .reduce((sum, one) => sum + oracle.agorot(one.amount), 0);
                if (room > 0 && state.left > 0) {
                    serial += 1;
                    const id = `le_v${String(serial).padStart(3, '0')}`;
                    // The advance, recorded in error: dated on the advance's own day.
                    record.ledger.advances[id] = { id, advanceId: of.id, kind: 'reversed',
                        date: of.date, amount: shekels(pick([room, Math.ceil(room / 2)])),
                        reason: 'נרשם בטעות', at: at(), by: 'd_gen' };
                    made.notes.add('an advance reversed');
                }
            }
            if (mine.length > 0 && chance(0.02)) {
                const targets = mine.flatMap(of => ledgerOf(of.id))
                    .filter(one => one.kind === 'repaid' || one.kind === 'deducted'
                        || (one.kind === 'given' && chance(0.2)))
                    .filter(one => oracle.agorot(one.amount) > 0);
                if (targets.length > 0) correct(pick(targets));
            }

            // Payday: his own period ends today.
            const period = oracle.periodOf(worker, today);
            if (period.to === today && chance(0.55)) tryClose(worker, period);
            // And a period nobody closed at the time, closed weeks afterwards.
            if (chance(0.01) && step > 28) {
                const old = oracle.periodOf(worker, oracle.addDays(today, -int(15, 28)));
                if (old.to < today) tryClose(worker, old);
            }
        });

        // Rima's men, counted per site - sometimes on a day none of his own were there.
        record.places.forEach(place => {
            if (chance(0.07)) {
                doOp({ op: 'rima', date: today, place: place.id,
                    count: chance(0.05) ? pick([10, 42, 99]) : int(1, 6) });
            } else if (chance(0.01) && step > 3) {
                doOp({ op: 'rima', date: oracle.addDays(today, -int(1, 3)), place: place.id,
                    count: null });
            }
        });
    }

    // A man deleted off the roster while the record still names him. The app puts him
    // back, archived; the second calculator is handed the record without him.
    if (chance(0.12)) {
        const gone = record.workers.filter(worker => !worker.payCycles && !worker.payCycle
            && Object.keys(record.days).some(date => (record.days[date].actual || {})[worker.id]));
        if (gone.length > 0) {
            made.orphan = pick(gone).id;
            record.workers = record.workers.filter(worker => worker.id !== made.orphan);
        }
    }
    // A site the roster no longer has, with days still on it.
    if (!made.orphan && chance(0.11) && record.places.length > 2) {
        record.places = record.places.slice(0, -1);
        made.notes.add('a site off the roster');
    }
    return made;
}

// The schedule the app is asked about: the record as it is, or - where a man is named
// and not on the roster - the record after the app's own door has put him back.
function appSchedule(app, made) {
    if (!made.orphan) return made.record;
    const copy = clone(made.record);
    app.reinstateReferenced(copy, {});
    return copy;
}

// Every range a report is asked over for one record: the fortnights on the account
// grid, each man's own periods, the whole record, a calendar month, a window that is
// nobody's period, and single days either side of an account seam.
function rangesOf(made) {
    const out = new Map();
    const add = (from, to) => out.set(`${from}|${to}`, { from, to });
    let from = oracle.accountStart(made.start);
    while (from <= made.last) {
        add(from, oracle.addDays(from, 13));
        add(from, oracle.addDays(from, 6));
        from = oracle.addDays(from, 14);
    }
    add(made.start, made.last);
    add('0000-01-01', '9999-12-31');
    const middle = oracle.addDays(made.start, 30);
    add(`${middle.slice(0, 8)}01`, `${middle.slice(0, 8)}28`);
    add(oracle.addDays(made.start, 3), oracle.addDays(made.start, 19));
    const seam = oracle.addDays(oracle.accountStart(middle), 14);
    add(oracle.addDays(seam, -1), oracle.addDays(seam, -1));
    add(seam, seam);
    add(oracle.addDays(seam, -1), seam);
    return Array.from(out.values());
}

function periodsOf(made, worker) {
    const out = [];
    let period = oracle.periodOf(worker, oracle.addDays(made.start, -8));
    const end = oracle.addDays(made.last, 15);
    while (period.from <= end) {
        out.push(period);
        period = oracle.nextPeriod(worker, period.from);
    }
    return out;
}

// ---------------------------------------------------------------- the comparison
//
// Everything the app says about one record, against everything the second calculator
// says. Returns sentences; an empty list is agreement. `tally` counts what was actually
// compared, so a family that compared nothing cannot report itself green.
//
// `only` asks one family of questions and no other - what a mutant run needs.
function compareRecord(app, made, tally, only = null) {
    // One reading: nothing below changes the record.
    return oracle.reading(made.record, () => compared(app, made, tally, only));
}

function compared(app, made, tally, only) {
    const out = { payroll: [], days: [], invoice: [], advances: [], accounts: [] };
    const wanted = family => only === null || only === family;
    const record = made.record;
    const schedule = appSchedule(app, made);
    const workers = oracle.workersOf(record);
    const count = name => { tally[name] = (tally[name] || 0) + 1; };
    const say = (family, text) => out[family].push(`seed ${made.seed}: ${text}`);

    // ---- the pay sheet
    const asked = new Map();
    rangesOf(made).concat(workers.flatMap(worker => periodsOf(made, worker)))
        .forEach(range => asked.set(`${range.from}|${range.to}`, range));
    if (wanted('payroll')) Array.from(asked.values())
        .forEach(range => {
            const rows = app.payrollReport(schedule, range.from, range.to);
            const mine = oracle.payroll(record, range.from, range.to);
            if (rows.length !== mine.length) {
                say('payroll', `${range.from}..${range.to}: ${rows.length} rows against ${mine.length}`);
                return;
            }
            mine.forEach(want => {
                const row = rows.find(item => item.workerId === want.workerId);
                const where = `${want.workerId} ${range.from}..${range.to}`;
                if (!row) { say('payroll', `${where}: no row`); return; }
                count('payroll rows');
                if (want.frozen) count('frozen payroll rows');
                ['attendanceDays', 'payUnits', 'normalDays', 'doubleDays', 'extraHours',
                    'siteVisits', 'absent', 'mixedRates', 'hoursUnpriced'].forEach(field => {
                    if (row[field] !== want[field]) {
                        say('payroll', `${where}: ${field} app ${show(row[field])}, by rule ${show(want[field])}`);
                    }
                });
                ['amount', 'advances', 'netAmount'].forEach(field => {
                    if (!sameMoney(row[field], want[field])) {
                        say('payroll', `${where}: ${field} app ${show(row[field])}, by rule ${show(shekels(want[field]))}`);
                    }
                });
                // The retired feature pays nobody. A shekel here is a shekel no rule gave.
                if (row.vehicleAmount !== 0 || row.vehicleDays !== 0) {
                    say('payroll', `${where}: a vehicle earned ${show(row.vehicleAmount)}`);
                }
            });
        });

    // ---- one man, day by day
    if (wanted('days')) workers.forEach(worker => {
        const appWorker = schedule.workers.find(item => item.id === worker.id);
        periodsOf(made, worker).concat([{ from: made.start, to: made.last }]).forEach(range => {
            const days = app.workerDaysReport(schedule, appWorker, range.from, range.to);
            const mine = oracle.workerDays(record, worker, range.from, range.to);
            const where = `${worker.id} ${range.from}..${range.to}`;
            if (days.length !== mine.length) {
                say('days', `${where}: ${days.length} days against ${mine.length}`);
                return;
            }
            mine.forEach((want, index) => {
                const day = days[index];
                count('priced days');
                if (day.date !== want.date || day.absent !== want.absent
                    || day.doubled !== want.doubled || day.extraHours !== want.hours
                    || !sameMoney(day.amount, want.amount)) {
                    say('days', `${where} ${want.date}: app ${show([day.date, day.absent, day.doubled, day.extraHours, day.amount])}, by rule ${show([want.date, want.absent, want.doubled, want.hours, shekels(want.amount)])}`);
                }
                if (!want.absent && !want.frozen && (day.historic !== want.historic
                    || !sameMoney(day.dailyRate, want.daily))) {
                    say('days', `${where} ${want.date}: rate app ${show([day.dailyRate, day.historic])}, by rule ${show([shekels(want.daily), want.historic])}`);
                }
            });
            // The summary every surface reads, off the app's own day rows.
            const summary = app.workerDaysSummary(days);
            const worked = mine.filter(day => !day.absent);
            const want = {
                attendanceDays: worked.length,
                payUnits: worked.reduce((sum, day) => sum + (day.doubled ? 2 : 1), 0),
                doubleDays: worked.filter(day => day.doubled).length,
                extraHours: worked.reduce((sum, day) => sum + day.hours, 0),
                absent: mine.length - worked.length
            };
            const total = worked.some(day => day.amount === null) ? null
                : worked.reduce((sum, day) => sum + day.amount, 0);
            count('day summaries');
            if (Object.keys(want).some(field => summary[field] !== want[field])
                || !sameMoney(summary.amount, total)) {
                say('days', `${where}: summary app ${show(summary)}, by rule ${show(want)} ${show(shekels(total))}`);
            }
        });
    });

    // ---- the client's invoice, and Rima
    if (wanted('invoice')) rangesOf(made).forEach(range => {
        const rows = app.invoiceReport(schedule, range.from, range.to);
        const mine = oracle.invoice(record, range.from, range.to);
        const where = `${range.from}..${range.to}`;
        if (show(rows.map(row => row.placeId)) !== show(mine.map(row => row.placeId))) {
            say('invoice', `${where}: sites app ${show(rows.map(row => row.placeId))}, by rule ${show(mine.map(row => row.placeId))}`);
            return;
        }
        const grid = app.invoiceByDate(schedule, range.from, range.to);
        const bare = app.invoiceWithoutRima(schedule, range.from, range.to);
        const rima = app.rimaReport(schedule, range.from, range.to);
        let all = 0;
        let own = 0;
        let others = 0;
        mine.forEach((want, index) => {
            const row = rows[index];
            count('invoice rows');
            all += want.workerDays;
            own += want.ownDays;
            others += want.rimaDays;
            if (row.workerDays !== want.workerDays || show(row.byDate) !== show(want.byDate)) {
                say('invoice', `${where} ${want.placeId}: app ${row.workerDays} ${show(row.byDate)}, by rule ${want.workerDays} ${show(want.byDate)}`);
            }
            Object.keys(want.byDate).forEach(date => {
                const day = row.days.find(item => item.date === date);
                if (!day || day.workerIds.length !== want.ownByDate[date]
                    || (day.rima || 0) !== (want.rimaByDate[date] || 0)) {
                    say('invoice', `${where} ${want.placeId} ${date}: app ${show(day)}, by rule ${want.ownByDate[date]} of his and ${want.rimaByDate[date] || 0} of Rima's`);
                }
                if (bare.countAt(want.placeId, date) !== want.ownByDate[date]
                    || rima.countAt(want.placeId, date) !== (want.rimaByDate[date] || 0)
                    || grid.countAt(want.placeId, date) !== want.byDate[date]) {
                    say('invoice', `${where} ${want.placeId} ${date}: the three tables say ${grid.countAt(want.placeId, date)}, ${bare.countAt(want.placeId, date)}, ${rima.countAt(want.placeId, date)}`);
                }
            });
        });
        count('invoices');
        if (grid.total !== all || bare.total !== own || rima.total !== others) {
            say('invoice', `${where}: totals app ${grid.total}/${bare.total}/${rima.total}, by rule ${all}/${own}/${others}`);
        }
    });

    // ---- what is left on each advance, and on each man
    if (wanted('advances')) oracle.advancesOf(record).forEach((of, id) => {
        const state = app.advanceOutstanding(schedule, id);
        const want = oracle.outstanding(record, id);
        count('advances');
        ['given', 'repaid', 'deducted', 'reversed', 'settled', 'left', 'overpaid'].forEach(field => {
            if (!sameMoney(state[field], want[field])) {
                say('advances', `${id}: ${field} app ${show(state[field])}, by rule ${show(shekels(want[field]))}`);
            }
        });
    });
    // The sentence the archive dialog says is asked only on a record where every account
    // has run down to nothing by the end, nobody is over-settled and everybody is paid
    // fortnightly. Not for the arithmetic's sake: behind this one call the app re-plans
    // the carry migration every time, in fixed fortnights, and while any man's balance
    // has not cleared that plan walks four thousand of them looking for the one where
    // it does - seconds per call on a record this size (tests/README.md says so under
    // «what the oracle does not cover»).
    const horizon = oracle.addDays(made.last, 60);
    const settled = wanted('advances') && workers.every(worker =>
        oracle.cycleHistory(worker).length === 0
        && oracle.overpaidBy(record, worker.id) === 0
        && oracle.openingBalance(record, worker.id, horizon) === 0);
    if (settled) count('records nobody is left owing on');
    if (wanted('advances')) workers.forEach(worker => {
        const want = oracle.openBalance(record, worker.id);
        if (settled) {
            const owed = app.openAdvanceBalance(schedule, worker.id);
            count('open balances');
            if (!sameMoney(owed ? owed.total : 0, want.total)) {
                say('advances', `${worker.id}: still owed app ${show(owed)}, by rule ${show(shekels(want.total))}`);
            }
        }
        const over = app.overpaidAdvances(schedule, worker.id)
            .reduce((sum, state) => sum + state.overpaid, 0);
        if (!sameMoney(over, oracle.overpaidBy(record, worker.id))) {
            say('advances', `${worker.id}: overpaid app ${over}, by rule ${shekels(oracle.overpaidBy(record, worker.id))}`);
        }
    });

    // ---- each man's account, period by period
    if (wanted('accounts')) workers.forEach(worker => {
        // A man who never took an advance has an account with nothing in it
        // but his wage; one period in three is enough of those.
        const plain = oracle.openBalance(record, worker.id).count === 0;
        // THE APP IS ASKED TWO WAYS. advanceAccount finds the opening balance for itself,
        // by walking every period before this one - so asking it of every period walks
        // the first of them a dozen times. One period in four (and the last) is asked
        // that way, whole. The rest are asked of advanceWalk, the function advanceAccount
        // is built from, handed where the APP's own previous period left the man (its
        // `position`: what he owes, or below zero what he is in credit): «each handing
        // the next where it left him» is the documented chain, and the whole ones are
        // what hold the app's own chaining to it.
        const periods = periodsOf(made, worker);
        let opening = null;
        periods.forEach((period, index) => {
            if (plain && index % 3 !== 0) return;
            const whole = opening === null || index % 4 === 0 || index === periods.length - 1;
            const account = whole
                ? app.advanceAccount(schedule, worker.id, period.from, period.to)
                : app.advanceWalk(schedule, worker.id, period.from, period.to, opening);
            opening = plain ? null : account.position;
            const want = oracle.accountOf(record, worker.id, period.from, period.to);
            const where = `${worker.id} ${period.from}..${period.to}`;
            count('accounts');
            if (want.creditIn > 0) count('accounts opening on a credit');
            if (want.creditIn > want.creditForward) count('accounts where a credit came off new money');
            if (want.closed && want.creditForward > 0) count('closed accounts handing a credit forward');
            if (whole) count('accounts asked whole');
            if (want.closed) count('closed accounts');
            if (want.lateSinceClose !== 0) count('accounts with movement after the close');
            ['carriedIn', 'creditIn', 'given', 'repaid', 'reversed', 'gross', 'deducted',
                'carriedOut', 'carriedForward', 'creditForward', 'position', 'lateSinceClose',
                'overpaid', 'net'].forEach(field => {
                if (!sameMoney(account[field], want[field])) {
                    say('accounts', `${where}: ${field} app ${show(account[field])}, by rule ${show(shekels(want[field]))}`);
                }
            });
            ['review', 'closed'].forEach(field => {
                if (account[field] !== want[field]) {
                    say('accounts', `${where}: ${field} app ${show(account[field])}, by rule ${show(want[field])}`);
                }
            });
            // And the opening balance on its own, the way the sheet's carry asks for it -
            // both halves, neither ever below zero.
            if (whole && !sameMoney(app.advanceCarryInto(schedule, worker.id, period.from),
                oracle.openingBalance(record, worker.id, period.from))) {
                say('accounts', `${where}: opens owing app ${app.advanceCarryInto(schedule, worker.id, period.from)}, by rule ${shekels(oracle.openingBalance(record, worker.id, period.from))}`);
            }
            if (whole && !sameMoney(app.advanceCreditInto(schedule, worker.id, period.from),
                oracle.openingCredit(record, worker.id, period.from))) {
                say('accounts', `${where}: opens in credit app ${app.advanceCreditInto(schedule, worker.id, period.from)}, by rule ${shekels(oracle.openingCredit(record, worker.id, period.from))}`);
            }
            // No figure a surface prints is below zero, whatever the two agree on.
            ['carriedIn', 'creditIn', 'carriedOut', 'carriedForward', 'creditForward',
                'deducted'].forEach(field => {
                if (account[field] < 0) say('accounts', `${where}: ${field} is ${account[field]}, below zero`);
            });
        });
    });
    return out;
}

// What the app wrote when it closed a period, against what the second calculator said a
// close would write - judged from the entries themselves, as they sit on the record.
function compareCloses(made, tally) {
    const out = [];
    const say = text => out.push(`seed ${made.seed}: ${text}`);
    made.closes.forEach(close => {
        const where = `${close.workerId} ${close.from}..${close.to}`;
        tally.closes = (tally.closes || 0) + 1;
        if (show(close.appReasons) !== show(close.plan.reasons.slice().sort())) {
            say(`${where}: refused for app ${show(close.appReasons)}, by rule ${show(close.plan.reasons)}`);
            return;
        }
        if (close.plan.reasons.length > 0) {
            tally['closes refused'] = (tally['closes refused'] || 0) + 1;
            if (close.written.length > 0) say(`${where}: refused and still wrote ${close.written.length}`);
            return;
        }
        const digits = close.from.replace(/-/g, '');
        const artifact = close.written.find(entry => entry.id === `le_period_${close.workerId}_${digits}`);
        const taken = close.written.filter(entry => entry.kind === 'deducted');
        if (!artifact || artifact.kind !== 'closed' || close.written.length !== taken.length + 1) {
            say(`${where}: wrote ${show(close.written.map(entry => entry.id))}`);
            return;
        }
        tally['closes written'] = (tally['closes written'] || 0) + 1;
        if (close.plan.creditIn > 0) {
            tally['closes written on a credit'] = (tally['closes written on a credit'] || 0) + 1;
        }
        tally['deductions written'] = (tally['deductions written'] || 0) + taken.length;
        if (artifact.periodTo !== close.to || artifact.date !== close.to
            || !sameMoney(artifact.gross, close.plan.gross)
            || !sameMoney(artifact.carriedIn, close.plan.carriedIn)
            // The credit is on the payslip only where there was one; a payslip never
            // opens on less than nothing.
            || !sameMoney(artifact.creditIn || 0, close.plan.creditIn)
            || (close.plan.creditIn === 0 && artifact.creditIn !== undefined)
            || artifact.carriedIn < 0
            || !sameMoney(artifact.net, close.plan.net)
            || !sameMoney(artifact.balanceAfter, close.plan.carriedForward)) {
            say(`${where}: payslip app ${show([artifact.gross, artifact.carriedIn, artifact.net, artifact.balanceAfter])}, by rule ${show([close.plan.gross, close.plan.carriedIn, close.plan.net, close.plan.carriedForward].map(shekels))}`);
        }
        const wrote = taken.map(entry => [entry.id, entry.amount, entry.balanceAfter])
            .sort((a, b) => (a[0] < b[0] ? -1 : 1));
        const want = close.plan.rows
            .map(row => [`le_close_${row.advanceId}_${digits}`, shekels(row.amount), shekels(row.balanceAfter)])
            .sort((a, b) => (a[0] < b[0] ? -1 : 1));
        if (show(wrote) !== show(want)) {
            say(`${where}: deductions app ${show(wrote)}, by rule ${show(want)}`);
        }
    });
    return out;
}

// The same evenings, recorded through the app's own writers on a schedule of its own,
// and the days they leave behind against the days this file's writer left. This is iron
// law 2 from the writing side: what gets stamped, when, and that an edit never restamps.
function compareWriters(app, made, tally) {
    const schedule = { schemaVersion: 2, workers: clone(made.roster0.workers), places: [],
        days: {}, vehicles: [], advances: {}, ledger: { advances: {}, unreadable: {} } };
    const who = id => schedule.workers.find(worker => worker.id === id);
    made.ops.forEach(op => {
        let done = {};
        if (op.op === 'assign') done = app.assignPlace(schedule, op.date, op.w, 'actual', op.place, op.band, op.hours);
        else if (op.op === 'unassign') done = app.unassignPlace(schedule, op.date, op.w, 'actual', op.place);
        else if (op.op === 'band') done = app.setRate(schedule, op.date, op.w, 'actual', op.place, op.band, op.hours);
        else if (op.op === 'absent') done = app.markAbsent(schedule, op.date, op.w, 'actual');
        else if (op.op === 'clear') done = app.clearWorkerDay(schedule, op.date, op.w, 'actual');
        else if (op.op === 'rima') done = app.setRimaCount(schedule, op.date, op.place, op.count);
        else if (op.op === 'unstamped') {
            if (!schedule.days[op.date]) schedule.days[op.date] = { plan: {}, actual: {} };
            schedule.days[op.date].actual[op.w] = clone(op.held);
        } else if (op.op === 'rate') {
            who(op.w).dailyRate = op.daily;
            who(op.w).hourlyRate = op.hourly;
        } else if (op.op === 'archive') who(op.w).active = false;
        if (done && done.refused) throw new Error(`the generator asked for a write the app refuses: ${show(op)}`);
    });
    // What each day SAYS: the records and the counts, in a canonical order. Whether an
    // empty `plan` map sits beside them is storage, not arithmetic.
    const said = days => {
        const out = {};
        Object.keys(days).sort().forEach(date => {
            const actual = days[date].actual || {};
            const line = {};
            Object.keys(actual).sort().forEach(workerId => {
                const held = actual[workerId];
                line[workerId] = { absent: Boolean(held.absent), entries: held.entries,
                    rates: held.rates || null };
            });
            const rima = days[date].rima || {};
            const counts = {};
            Object.keys(rima).sort().forEach(placeId => { counts[placeId] = rima[placeId]; });
            if (Object.keys(line).length > 0 || Object.keys(counts).length > 0) {
                out[date] = { actual: line, rima: counts };
            }
        });
        return out;
    };
    const theirs = said(schedule.days);
    const mine = said(made.record.days);
    const out = [];
    Object.keys(Object.assign({}, theirs, mine)).sort().forEach(date => {
        tally['days written twice'] = (tally['days written twice'] || 0) + 1;
        if (show(theirs[date]) !== show(mine[date])) {
            out.push(`seed ${made.seed}: ${date}: the app wrote ${show(theirs[date])}, by rule ${show(mine[date])}`);
        }
    });
    return out;
}

const few = list => (list.length === 0 ? '' : `${list.length}: ` + list.slice(0, 4).join(' || '));

// ---------------------------------------------------------------- 0. the instrument
{
    suite('the second calculator can count days before it is asked to count money');

    check('the named Friday is a Friday', oracle.anchorIsAFriday(), oracle.ACCOUNT_ANCHOR);
    // Dates somebody can check on a wall calendar: 1 January 2000 was a Saturday, so its
    // week opened on Friday 31 December 1999.
    same('a week runs Friday to Thursday, across a year', oracle.weekStart('2000-01-01'), '1999-12-31');
    same('a leap day is a day', oracle.addDays('2024-02-28', 1), '2024-02-29');
    same('and a year without one has none', oracle.addDays('2026-02-28', 1), '2026-03-01');
    check('a date that never happened is not a day', !oracle.isRealDay('2026-02-30'),
        String(oracle.isRealDay('2026-02-30')));
    // 2026-08-07 + 14 = 2026-08-21: the account after the named one.
    same('the account after the named one opens a fortnight later',
        oracle.accountStart('2026-08-22'), '2026-08-21');
    same('and the one before it closes the day before', oracle.accountStart('2026-08-06'), '2026-07-24');
    let wrong = 0;
    for (let n = -800; n < 1500; n += 1) {
        const text = oracle.addDays('2026-01-01', n);
        if (oracle.dayNumber(text) - oracle.dayNumber('2026-01-01') !== n) wrong += 1;
    }
    check('every day number comes back as the date it was made from', wrong === 0, String(wrong));
}

// ---------------------------------------------------------------- 1. the calendar
//
// The app's calendar is the device's local time, pinned to noon «so that adding days
// across a DST change can never land on an hour that does not exist». The second
// calculator has no clock at all. Four zones: the crew's own, UTC, one behind it and one
// far ahead with its seasons the other way round.
{
    suite('a man\'s period is the same period by the calendar and by the app');

    const friday = '2026-09-11';
    const men = [
        null,
        {},
        { payCycles: '' },
        { payCycles: `${friday}=weekly` },
        // Back to fortnightly on the first Friday of a fortnight, and on the second.
        { payCycles: `${friday}=weekly;2026-10-02=biweekly` },
        { payCycles: `${friday}=weekly;2026-10-09=biweekly` },
        { payCycles: '2026-03-20=weekly;2026-04-03=biweekly;2026-10-23=weekly' },
        // The spring DST change in Israel falls on a Friday; a cycle opening that day.
        { payCycles: '2026-03-27=weekly' },
        { payCycles: '2025-12-26=weekly;2026-01-02=biweekly' },
        // The pair an unreleased build wrote.
        { payCycle: 'weekly', payCycleFrom: '2026-08-14' },
        // A history nobody can read is every second Thursday.
        { payCycles: '2026-09-12=weekly' },
        { payCycles: 'weekly' }
    ];

    const zones = [HOME_ZONE, 'UTC', 'America/Los_Angeles', 'Pacific/Auckland'];
    zones.forEach(zone => {
        process.env.TZ = zone;
        // The zone took: a clock change is where this zone has one.
        const offset = (y, m, d) => new Date(y, m - 1, d, 12).getTimezoneOffset();
        const moved = offset(2026, 3, 26) !== offset(2026, 3, 28)
            || offset(2026, 3, 7) !== offset(2026, 3, 9)
            || offset(2026, 4, 4) !== offset(2026, 4, 6);
        given(`the process is keeping ${zone} time`, zone === 'UTC' ? !moved : moved,
            `${offset(2026, 3, 26)} ${offset(2026, 3, 28)}`);

        const bad = [];
        let asked = 0;
        // Three and a half years at home; elsewhere, sixteen months that hold three of
        // that zone's own clock changes and every boundary the men above carry.
        const home = zone === HOME_ZONE;
        for (let n = 0; n < (home ? 1280 : 500); n += 1) {
            const date = oracle.addDays(home ? '2025-06-01' : '2025-09-01', n);
            const at = APP.parseLocalDate(date);
            asked += 1;
            if (APP.toLocalDateStr(APP.snapToWeekStart(at)) !== oracle.weekStart(date)
                || APP.toLocalDateStr(APP.accountStart(at)) !== oracle.accountStart(date)) {
                bad.push(`${date}: week ${APP.toLocalDateStr(APP.snapToWeekStart(at))}, account ${APP.toLocalDateStr(APP.accountStart(at))}`);
            }
            men.forEach((man, index) => {
                const range = APP.periodRangeFor(man, date);
                const want = oracle.periodOf(man, date);
                const next = APP.nextPeriodFor(man, date);
                const after = oracle.nextPeriod(man, date);
                asked += 2;
                if (show([range.from, range.to, range.cycle, range.transition])
                    !== show([want.from, want.to, want.cycle, want.transition])) {
                    bad.push(`man ${index} on ${date}: app ${show(range)}, by rule ${show(want)}`);
                }
                if (show([next.from, next.to]) !== show([after.from, after.to])) {
                    bad.push(`man ${index} after ${date}: app ${show(next)}, by rule ${show(after)}`);
                }
                // The question a closure has to pass, asked of a right answer and of a
                // range one day too long.
                if (APP.isPeriodFor(man, want.from, want.to) !== true
                    || APP.isPeriodFor(man, want.from, oracle.addDays(want.to, 1))
                        !== oracle.isPeriodOf(man, want.from, oracle.addDays(want.to, 1))) {
                    bad.push(`man ${index} on ${date}: the app does not know its own period`);
                }
            });
        }
        check(`${zone}: every week, every account and every man's period, day by day`,
            bad.length === 0 && asked > 12000, `${asked} asked. ${few(bad)}`);
    });
    process.env.TZ = HOME_ZONE;

    // Every day belongs to exactly one period, and the periods tile: the rule that lets
    // two cycles share one ledger. Asked of the second calculator alone, because the
    // comparison above has already tied the app to it.
    const gaps = [];
    men.forEach((man, index) => {
        let period = oracle.periodOf(man, '2025-06-01');
        for (let n = 0; n < 200; n += 1) {
            const next = oracle.nextPeriod(man, period.from);
            if (next.from !== oracle.addDays(period.to, 1)) gaps.push(`man ${index} after ${period.to}`);
            const length = oracle.dayNumber(period.to) - oracle.dayNumber(period.from) + 1;
            if (length !== 7 && length !== 14) gaps.push(`man ${index}: ${length} days from ${period.from}`);
            period = next;
        }
    });
    check('the periods tile the calendar, seven or fourteen days at a time',
        gaps.length === 0, few(gaps));
}

// ---------------------------------------------------------------- 2. by hand
//
// Figures a person can check on paper. Both calculators are held to the literal: if they
// agreed with each other and not with these, they would be sharing a mistake.
{
    suite('figures worked out by hand, and both calculators held to them');

    const base = () => ({
        schemaVersion: 2,
        workers: [
            { id: 'w_a', name: 'אמיר', dailyRate: 450, hourlyRate: 60, active: true },
            { id: 'w_b', name: 'באסם', dailyRate: 380, hourlyRate: 0, active: false },
            { id: 'w_c', name: 'גיל', dailyRate: 0, hourlyRate: 0, active: true }
        ],
        places: [{ id: 'p_x', name: 'חיפה', active: true }, { id: 'p_y', name: 'עכו', active: true }],
        days: {},
        vehicles: [],
        advances: {},
        ledger: { advances: {}, unreadable: {},
            migrations: { cm_carry: { id: 'cm_carry', kind: 'carry', rows: 0, at: '', by: 'd' } } }
    });
    const site = (placeId, rate, extraHours) => {
        const out = { placeId };
        if (rate) out.rate = rate;
        if (extraHours) out.extraHours = extraHours;
        return out;
    };
    const day = (record, date, workerId, held) => {
        record.days[date] = record.days[date] || { plan: {}, actual: {} };
        record.days[date].actual[workerId] = held;
    };
    const both = (name, appValue, agorot, literal) => {
        check(`${name} - the app`, appValue === literal, `${show(appValue)}, by hand ${show(literal)}`);
        check(`${name} - the second calculator`, shekels(agorot) === literal,
            `${show(shekels(agorot))}, by hand ${show(literal)}`);
    };

    // -- A. The fortnight 20 March - 2 April 2026, which holds the night the clocks go
    //    forward in Israel (Friday 27 March), and a raise halfway through it.
    //
    //    אמיר is on 450 a day and 60 an hour today. His first days were recorded when he
    //    was on 400 and 50, and carry that stamp:
    //
    //      20/3  one site, normal                  at 400/50   400
    //      22/3  two sites, normal                 at 400/50   400      (one day, not two)
    //      23/3  double                            at 400/50   800
    //      24/3  normal + 2.5 extra hours          at 400/50   400 + 2.5 x 50 = 525
    //      25/3  absent                                          0
    //      27/3  one site, normal (the DST Friday) at 450/60   450
    //      29/3  normal at one site, double at the other, 1 hour at each
    //                                              at 450/60   900 + 2 x 60 = 1,020
    //      2/4   normal, last day of the account   at 450/60   450
    //      3/4   normal - the NEXT account         at 450/60   (not in this one)
    //
    //    400 + 400 + 800 + 525 + 450 + 1,020 + 450 = 4,045
    //    7 dates on a site; 9 days of pay (two of them double); 4.5 extra hours;
    //    9 site visits (22/3 and 29/3 are two each).
    const a = base();
    const old = { daily: 400, hourly: 50 };
    const now = { daily: 450, hourly: 60 };
    day(a, '2026-03-20', 'w_a', { entries: [site('p_x')], rates: old });
    day(a, '2026-03-22', 'w_a', { entries: [site('p_x'), site('p_y')], rates: old });
    day(a, '2026-03-23', 'w_a', { entries: [site('p_x', 'double')], rates: old });
    day(a, '2026-03-24', 'w_a', { entries: [site('p_y', 'extra', 2.5)], rates: old });
    day(a, '2026-03-25', 'w_a', { absent: true, entries: [], rates: old });
    day(a, '2026-03-27', 'w_a', { entries: [site('p_x')], rates: now });
    day(a, '2026-03-29', 'w_a', { entries: [site('p_x', 'extra', 1), site('p_y', 'double', 1)], rates: now });
    day(a, '2026-04-02', 'w_a', { entries: [site('p_y')], rates: now });
    day(a, '2026-04-03', 'w_a', { entries: [site('p_y')], rates: now });
    //    באסם is archived and has no hourly rate. Two days recorded before stamping
    //    existed carry no stamp and are priced at the roster's 380; the third is stamped
    //    at the 350 he was on then, with 3 hours nobody can price:
    //      20/3 380 + 21/3 380 + 26/3 350 = 1,110
    day(a, '2026-03-20', 'w_b', { entries: [site('p_x')] });
    day(a, '2026-03-21', 'w_b', { entries: [site('p_y')] });
    day(a, '2026-03-26', 'w_b', { entries: [site('p_y', 'extra', 3)], rates: { daily: 350, hourly: 0 } });
    //    גיל has no rate: one day worked, worth an unknown amount.
    day(a, '2026-03-30', 'w_c', { entries: [site('p_x')] });
    //    Rima: three on חיפה on 20/3, two on עכו on 28/3 - a day none of his own men worked.
    a.days['2026-03-20'].rima = { p_x: 3 };
    a.days['2026-03-28'] = { plan: {}, actual: {}, rima: { p_y: 2 } };
    //    An advance of 1,200 to אמיר on 24/3, and 300 on 3/4 - the next account.
    a.advances.a_1 = { id: 'a_1', workerId: 'w_a', date: '2026-03-24', amount: 1200, note: '' };
    a.advances.a_2 = { id: 'a_2', workerId: 'w_a', date: '2026-04-03', amount: 300, note: '' };

    const F = '2026-03-20';
    const T = '2026-04-02';
    given('the fixture is a record the app would open', APP.storedScheduleProblems(a).length === 0,
        show(APP.storedScheduleProblems(a)));
    same('the fortnight the clocks change in is still a Friday and thirteen days - the app',
        [APP.periodRangeFor(a.workers[0], '2026-03-27').from, APP.periodRangeFor(a.workers[0], '2026-03-27').to], [F, T]);
    same('and by the calendar', [oracle.periodOf(a.workers[0], '2026-03-27').from,
        oracle.periodOf(a.workers[0], '2026-03-27').to], [F, T]);

    const rows = APP.payrollReport(a, F, T);
    const mine = oracle.payroll(a, F, T);
    both('אמיר earned 4,045', rows[0].amount, mine[0].amount, 4045);
    // 4,045 - 1,200 = 2,845. The 300 of 3/4 is the next account's.
    both('less the 1,200 he took on the 24th: 2,845', rows[0].netAmount, mine[0].netAmount, 2845);
    same('seven dates, nine days of pay, two double, 4.5 hours, nine visits, one away - the app',
        [rows[0].attendanceDays, rows[0].payUnits, rows[0].doubleDays, rows[0].extraHours,
            rows[0].siteVisits, rows[0].absent], [7, 9, 2, 4.5, 9, 1]);
    same('and the second calculator', [mine[0].attendanceDays, mine[0].payUnits, mine[0].doubleDays,
        mine[0].extraHours, mine[0].siteVisits, mine[0].absent], [7, 9, 2, 4.5, 9, 1]);
    both('באסם, archived, two unstamped days and one stamped: 1,110', rows[1].amount, mine[1].amount, 1110);
    same('and his three hours are named as unpriced by both', [rows[1].hoursUnpriced, mine[1].hoursUnpriced], [true, true]);
    both('גיל has no rate, so what he earned is not known', rows[2].amount, mine[2].amount, null);
    // 9 pay units at today's 450 would be 4,050 + 4.5 x 60 = 4,320. He is owed 4,045.
    check('the raise did not repay the past', rows[0].amount !== 4320 && shekels(mine[0].amount) !== 4320,
        `${rows[0].amount} ${shekels(mine[0].amount)}`);
    same('the DST Friday is worth one day at the new rate, to both',
        [APP.workerDaysReport(a, a.workers[0], '2026-03-27', '2026-03-27')[0].amount,
            shekels(oracle.workerDays(a, a.workers[0], '2026-03-27', '2026-03-27')[0].amount)], [450, 450]);

    //    The invoice: חיפה - אמיר 20, 22, 23, 27, 29 (5) + באסם 20 (1) + גיל 30 (1) = 7 of
    //    his, + 3 of Rima's = 10. עכו - אמיר 22, 24, 29, 2/4 (4) + באסם 21, 26 (2) = 6 of
    //    his, + 2 of Rima's = 8. Eighteen worker-site days, five of them Rima's.
    const bill = APP.invoiceReport(a, F, T);
    const mineBill = oracle.invoice(a, F, T);
    same('חיפה is billed 10 and עכו 8 - the app', bill.map(row => row.workerDays), [10, 8]);
    same('and the second calculator', mineBill.map(row => row.workerDays), [10, 8]);
    same('thirteen of them his own men, five Rima\'s - the app',
        [APP.invoiceWithoutRima(a, F, T).total, APP.rimaReport(a, F, T).total], [13, 5]);
    same('and the second calculator', [mineBill.reduce((sum, row) => sum + row.ownDays, 0),
        mineBill.reduce((sum, row) => sum + row.rimaDays, 0)], [13, 5]);
    // Rima moves no pay: with the two counts taken off, the three wages are what they were.
    const bare = clone(a);
    delete bare.days['2026-03-20'].rima;
    delete bare.days['2026-03-28'];
    same('no shekel of pay moves when Rima\'s men are taken off the record',
        APP.payrollReport(bare, F, T).map(row => row.amount), [4045, 1110, null]);

    // -- B. The worked example the money surfaces carry: 0 -> 5,000 -> 1,950 -> 1,750.
    //
    //    דוד is on 610 a day. In the account 7-20 August 2026 he works five days:
    //    5 x 610 = 3,050, and on the 10th he takes 5,000.
    //      opens owing 0; given 5,000; the wage covers 3,050; carried out 1,950; net 0.
    //    In the next account, 21 August - 3 September, he works one day (610) and hands
    //    back 200 in cash on the 25th:
    //      opens owing 1,950; less 200 back = 1,750 owed; the wage covers 610;
    //      carried out 1,140; net 0.
    const b = base();
    b.workers = [{ id: 'w_d', name: 'דוד', dailyRate: 610, hourlyRate: 0, active: true }];
    ['2026-08-07', '2026-08-09', '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-24']
        .forEach(date => day(b, date, 'w_d', { entries: [site('p_x')], rates: { daily: 610, hourly: 0 } }));
    b.advances.a_5 = { id: 'a_5', workerId: 'w_d', date: '2026-08-10', amount: 5000, note: '' };
    b.ledger.advances.le_mig_a_5 = { id: 'le_mig_a_5', advanceId: 'a_5', kind: 'given',
        workerId: 'w_d', date: '2026-08-10', amount: 5000, note: '', at: '2026-08-10T10:00:00.000Z', by: 'd' };
    b.ledger.advances.le_back = { id: 'le_back', advanceId: 'a_5', kind: 'repaid',
        date: '2026-08-25', amount: 200, note: '', at: '2026-08-25T10:00:00.000Z', by: 'd' };
    given('the worked example is a record the app would open',
        APP.storedScheduleProblems(b).length === 0 && APP.ledgerProblems(b).length === 0,
        show(APP.ledgerProblems(b)));

    const first = ['2026-08-07', '2026-08-20'];
    const second = ['2026-08-21', '2026-09-03'];
    const line = account => [account.carriedIn, account.given, account.repaid, account.gross,
        account.deducted, account.carriedOut, account.net];
    const lineOf = account => line(account).map(shekels);
    same('the first account: 0 in, 5,000 given, 3,050 covered, 1,950 out, nothing to pay - the app',
        line(APP.advanceAccount(b, 'w_d', ...first)), [0, 5000, 0, 3050, 3050, 1950, 0]);
    same('and the second calculator', lineOf(oracle.accountOf(b, 'w_d', ...first)),
        [0, 5000, 0, 3050, 3050, 1950, 0]);
    same('the second: 1,950 in, 200 back, 610 covered, 1,140 out - the app',
        line(APP.advanceAccount(b, 'w_d', ...second)), [1950, 0, 200, 610, 610, 1140, 0]);
    same('and the second calculator', lineOf(oracle.accountOf(b, 'w_d', ...second)),
        [1950, 0, 200, 610, 610, 1140, 0]);
    // 5,000 given, 200 back, nothing yet written off a wage: 4,800 left on the advance.
    both('4,800 is left on the advance itself until a period is closed',
        APP.advanceOutstanding(b, 'a_5').left, oracle.outstanding(b, 'a_5').left, 4800);

    // -- C. The first account is closed, through the button's own door. Then, later:
    //    a repayment of 400 is dated back into it (a phone that was offline), and one of
    //    its five days is corrected off the record.
    //      The payslip does not move: wage 3,050, deducted 3,050, closing balance 1,950.
    //      The money does: 5,000 - 400 = 4,600 owed, 3,050 covered, 1,550 goes forward.
    //      The next account then opens on 1,550; less the 200 = 1,350; wage 610;
    //      carried out 740.
    const c = clone(b);
    const wrote = APP.closePeriodChanges(c, 'w_d', ...first, '2026-08-20T18:00:00.000Z', 'd');
    given('the account closed', wrote.length === 2, String(wrote.length));
    same('the close wrote 3,050 off the one advance and left 1,950 on it',
        [c.ledger.advances.le_close_a_5_20260807.amount, c.ledger.advances.le_close_a_5_20260807.balanceAfter],
        [3050, 1950]);
    c.ledger.advances.le_late = { id: 'le_late', advanceId: 'a_5', kind: 'repaid',
        date: '2026-08-15', amount: 400, note: '', at: '2026-08-28T09:00:00.000Z', by: 'd2' };
    c.days['2026-08-12'].actual.w_d = { entries: [], rates: { daily: 610, hourly: 0 } };
    const frozen = account => [account.gross, account.deducted, account.carriedOut,
        account.carriedForward, account.lateSinceClose, account.closed];
    same('the closed payslip stays 3,050 / 3,050 / 1,950 while 1,550 goes forward - the app',
        frozen(APP.advanceAccount(c, 'w_d', ...first)), [3050, 3050, 1950, 1550, -400, true]);
    const closedMine = oracle.accountOf(c, 'w_d', ...first);
    same('and the second calculator', [closedMine.gross, closedMine.deducted, closedMine.carriedOut,
        closedMine.carriedForward, closedMine.lateSinceClose].map(shekels).concat([closedMine.closed]),
    [3050, 3050, 1950, 1550, -400, true]);
    both('the pay sheet still prints the wage it was closed on, not four days\' worth',
        APP.payrollReport(c, ...first)[0].amount, oracle.payroll(c, ...first)[0].amount, 3050);
    same('and still five days, to both', [APP.payrollReport(c, ...first)[0].attendanceDays,
        oracle.payroll(c, ...first)[0].attendanceDays], [5, 5]);
    // A range that only STARTS on that Friday is not that closed fortnight: one week of
    // it holds the four days still on the record that fall in it (7, 9, 10, 11) = 2,440.
    both('a week that starts on the same Friday is priced live: 2,440',
        APP.payrollReport(c, '2026-08-07', '2026-08-13')[0].amount,
        oracle.payroll(c, '2026-08-07', '2026-08-13')[0].amount, 2440);
    same('the next account opens on 1,550 and carries out 740 - the app',
        line(APP.advanceAccount(c, 'w_d', ...second)), [1550, 0, 200, 610, 610, 740, 0]);
    same('and the second calculator', lineOf(oracle.accountOf(c, 'w_d', ...second)),
        [1550, 0, 200, 610, 610, 740, 0]);
    // On the advance: 5,000 given; 400 + 200 back; 3,050 off a wage. 5,000 - 3,650 = 1,350.
    both('1,350 is left on the advance', APP.advanceOutstanding(c, 'a_5').left,
        oracle.outstanding(c, 'a_5').left, 1350);

    // -- D. A correction runs against what it corrects. The 200 of the 25th was written
    //    against the wrong man: correcting it puts the 200 back on the debt.
    //      second account: 1,550 in, 200 back, 200 undone = 1,550 owed, 610 covered, 940 out.
    //      on the advance: 5,000 - (400 back + 3,050 off a wage) = 1,550.
    const d = clone(c);
    d.ledger.advances.le_rev_le_back = { id: 'le_rev_le_back', advanceId: 'a_5', kind: 'reversed',
        targetId: 'le_back', targetKind: 'repaid', targetDate: '2026-08-25', targetAmount: 200,
        date: '2026-08-25', amount: 200, reason: 'נרשם על העובד הלא נכון',
        at: '2026-08-29T09:00:00.000Z', by: 'd' };
    given('the correction is an entry the app reads', APP.ledgerProblems(d).length === 0,
        show(APP.ledgerProblems(d)));
    both('a corrected repayment is owed again: 940 carried out',
        APP.advanceAccount(d, 'w_d', ...second).carriedOut,
        oracle.accountOf(d, 'w_d', ...second).carriedOut, 940);
    both('and 1,550 left on the advance', APP.advanceOutstanding(d, 'a_5').left,
        oracle.outstanding(d, 'a_5').left, 1550);
    //    And the other direction: 1,000 of the 5,000 was never handed over at all.
    //      on the advance: 4,000 given, less 400 and 3,050 = 550.
    const e = clone(d);
    e.ledger.advances.le_never = { id: 'le_never', advanceId: 'a_5', kind: 'reversed',
        date: '2026-08-10', amount: 1000, reason: 'נמסרו רק 4,000', at: '2026-08-30T09:00:00.000Z', by: 'd' };
    both('an advance corrected down by 1,000 leaves 550', APP.advanceOutstanding(e, 'a_5').left,
        oracle.outstanding(e, 'a_5').left, 550);

    // -- E. A man settled every Thursday from 11 September 2026. The fortnight his
    //    change interrupts (4-17 September) leaves a seven-day stub behind it, 4-10
    //    September, and his first week is 11-17. 3,000 taken on the 11th against a week
    //    of three days at 650 = 1,950: carried out 1,050, and nothing counted twice.
    const w = base();
    w.workers = [{ id: 'w_w', name: 'ואיל', dailyRate: 650, hourlyRate: 0, active: true,
        payCycles: '2026-09-11=weekly' }];
    ['2026-09-11', '2026-09-13', '2026-09-14'].forEach(date =>
        day(w, date, 'w_w', { entries: [site('p_x')], rates: { daily: 650, hourly: 0 } }));
    w.advances.a_w = { id: 'a_w', workerId: 'w_w', date: '2026-09-11', amount: 3000, note: '' };
    same('the stub behind the change is 4-10 September - the app',
        [APP.periodRangeFor(w.workers[0], '2026-09-08').from, APP.periodRangeFor(w.workers[0], '2026-09-08').to,
            APP.periodRangeFor(w.workers[0], '2026-09-08').transition], ['2026-09-04', '2026-09-10', true]);
    same('and by the calendar', [oracle.periodOf(w.workers[0], '2026-09-08').from,
        oracle.periodOf(w.workers[0], '2026-09-08').to, oracle.periodOf(w.workers[0], '2026-09-08').transition],
    ['2026-09-04', '2026-09-10', true]);
    same('his week: 0 in, 3,000 given, 1,950 covered, 1,050 out - the app',
        line(APP.advanceAccount(w, 'w_w', '2026-09-11', '2026-09-17')), [0, 3000, 0, 1950, 1950, 1050, 0]);
    same('and the second calculator', lineOf(oracle.accountOf(w, 'w_w', '2026-09-11', '2026-09-17')),
        [0, 3000, 0, 1950, 1950, 1050, 0]);
    both('the week after opens on 1,050',
        APP.advanceCarryInto(w, 'w_w', '2026-09-18'), oracle.openingBalance(w, 'w_w', '2026-09-18'), 1050);
}

// ---------------------------------------------------------------- 3. the records
const tally = {};
const census = {};
const records = [];

{
    suite(`${RECORDS} synthetic records: every figure the app reports, worked out twice`);

    const split = { payroll: [], days: [], invoice: [], advances: [], accounts: [] };
    const closes = [];
    const writers = [];
    const unreadable = [];
    const condemned = [];

    for (let seed = 1; seed <= RECORDS; seed += 1) {
        const made = makeRecord(seed, APP);
        records.push(made);
        const schedule = appSchedule(APP, made);
        // A record the app itself would open, with a ledger it can read, and with the
        // carried reading approved - or the comparison below is about a record no phone
        // could be holding.
        const problems = APP.storedScheduleProblems(schedule).concat(APP.ledgerProblems(schedule));
        if (problems.length > 0
            || APP.carryMigrationApproved(schedule, { id: 'cm_carry' }) !== true) {
            unreadable.push(`seed ${seed}: ${show(problems.slice(0, 2))}`);
        }
        APP.impossibleClosures(schedule).forEach(id => condemned.push(`seed ${seed}: ${id}`));

        const found = compareRecord(APP, made, tally);
        Object.keys(split).forEach(family => split[family].push(...found[family]));
        closes.push(...compareCloses(made, tally));
        writers.push(...compareWriters(APP, made, tally));
    }

    given('every synthetic record is one the app would open and read the carried way',
        unreadable.length === 0, few(unreadable));

    check('a pay sheet row: the days, the pay units, the hours, the wage, the advances and the net',
        split.payroll.length === 0 && tally['payroll rows'] > 20000,
        `${tally['payroll rows']} rows. ${few(split.payroll)}`);
    check('a closed period\'s row is the row it was closed on, for its own period and no other',
        split.payroll.length === 0 && tally['frozen payroll rows'] > 200,
        `${tally['frozen payroll rows']} frozen rows`);
    check('one man day by day, each day at the rate stamped on it, and the summary of them',
        split.days.length === 0 && tally['priced days'] > 20000 && tally['day summaries'] > 3000,
        `${tally['priced days']} days, ${tally['day summaries']} summaries. ${few(split.days)}`);
    check('the client\'s invoice: his own men, Rima\'s men, and the three tables that must add up',
        split.invoice.length === 0 && tally['invoice rows'] > 10000 && tally.invoices > 3000,
        `${tally['invoice rows']} site rows over ${tally.invoices} ranges. ${few(split.invoice)}`);
    check('what is left on every advance, and what each man still owes',
        split.advances.length === 0 && tally.advances > 800 && tally['open balances'] > 100,
        `${tally.advances} advances, ${tally['open balances']} men. ${few(split.advances)}`);
    check('every man\'s account, period by period: in, given, back, corrected, covered, out, forward',
        split.accounts.length === 0 && tally.accounts > 5000 && tally['closed accounts'] > 300,
        `${tally.accounts} accounts, ${tally['closed accounts']} of them closed, ${tally['accounts with movement after the close']} with movement after the close. ${few(split.accounts)}`);
    check('a close writes the payslip and the deductions the rules say, oldest advance first',
        closes.length === 0 && tally['closes written'] > 300 && tally['deductions written'] > 60,
        `${tally['closes written']} closes, ${tally['deductions written']} deductions, ${tally['closes refused']} refused for a reason both name. ${few(closes)}`);
    check('the app\'s writers leave the days and the stamps iron law 2 says they leave',
        writers.length === 0 && tally['days written twice'] > 10000,
        `${tally['days written twice']} days. ${few(writers)}`);
    check('and no closure the app wrote is one its own judge calls impossible',
        condemned.length === 0, few(condemned));

    // THE ACCOUNTS THAT USED TO BE LEFT OUT. Up to v179 every account and close downstream
    // of a closed period that carried forward less than nothing was excluded by name. They
    // are compared now, and these counts are what says the generator still makes them.
    check('a credit: periods that open on one, periods where it comes off new money, closed periods that hand one on',
        split.accounts.length === 0 && tally['accounts opening on a credit'] >= 20
        && tally['accounts where a credit came off new money'] >= 5
        && tally['closed accounts handing a credit forward'] >= 5,
        `${tally['accounts opening on a credit']} open on a credit, ${tally['accounts where a credit came off new money']} use one, ${tally['closed accounts handing a credit forward']} closed periods hand one on, ${tally['closes written on a credit'] || 0} payslips written on one`);
    same('and nothing is left out of the comparison under any name',
        Object.keys(tally).filter(name => name.indexOf('left to') === 0), []);
}

// ---------------------------------------------------------------- 4. the mutants
//
// One line of js/model/money.js changed - or, for the last five, one line of the account
// walk in js/model/schema.js and of the fold in js/model/ledger.js - in memory, never on
// disk, and the comparison run again on the first dozen records. Each mutant is a wrong
// sum that still looks like a sum. The suite is only worth its runtime if every one of
// them turns it red.
{
    suite('a wrong sum in the money code does not get past the comparison');

    const sources = loadOrder().map(file => ({ file,
        code: readFileSync(join(sourceRoot(), file), 'utf8') }));
    const mutants = [
        { name: 'a double day paid three times over', family: 'payroll',
            from: 'total += rates.daily * (doubled ? 2 : 1) + rates.hourly * hours;',
            to: 'total += rates.daily * (doubled ? 3 : 1) + rates.hourly * hours;' },
        { name: 'the roster\'s rate today instead of the stamp', family: 'payroll',
            from: 'if (record && record.rates) {', to: 'if (false && record && record.rates) {' },
        { name: 'two sites paid as two days', family: 'payroll',
            from: 'row.payUnits += doubled ? 2 : 1;', to: 'row.payUnits += (doubled ? 2 : 1) * entries.length;' },
        { name: 'extra hours left off the day', family: 'days',
            from: '? rates.daily * (doubled ? 2 : 1) + rates.hourly * extraHours',
            to: '? rates.daily * (doubled ? 2 : 1)' },
        { name: 'the last day of the range dropped', family: 'payroll',
            from: '.filter(date => date >= fromDate && date <= toDate)\n        .sort();\n\n    return schedule.workers.map(worker => {',
            to: '.filter(date => date >= fromDate && date < toDate)\n        .sort();\n\n    return schedule.workers.map(worker => {' },
        { name: 'Rima\'s men left off the invoice', family: 'invoice',
            from: 'const count = workerIds.length + rima;', to: 'const count = workerIds.length;' },
        { name: 'Rima\'s men in the days and not in the total', family: 'invoice',
            from: 'row.workerDays += count;', to: 'row.workerDays += workerIds.length;' },
        { name: 'a closed period priced live again', family: 'payroll',
            from: 'if (Number.isFinite(frozen.gross)) {', to: 'if (false && Number.isFinite(frozen.gross)) {' },
        { name: 'a corrected repayment taken off the debt a second time', family: 'accounts', file: 'js/model/schema.js',
            from: '- agoraRound(repaid - undoneRepaid) - undoneGiven + undoneDeducted);',
            to: '- agoraRound(repaid + undoneRepaid) - undoneGiven + undoneDeducted);' },
        { name: 'a deduction larger than the wage', family: 'accounts', file: 'js/model/schema.js',
            // (The anchor is the pay book branch's line: the same deduction, with the
            // one-debt ruling's cap beside it - advanceLiveRoom. The mutant is the same
            // mutant: everything he owes comes off, whatever he earned.)
            from: ': agoraRound(Math.min(balance, Math.max(gross, 0),\n                    advanceLiveRoom(schedule, workerId, toDate, stays)))));',
            to: ': agoraRound(balance)));' },
        { name: 'a credit dropped at the end of the period it arose in', family: 'accounts',
            file: 'js/model/schema.js',
            from: 'const creditForward = keeps ? excess : 0;',
            to: 'const creditForward = 0;' },
        { name: 'a debt of less than nothing carried forward', family: 'accounts',
            file: 'js/model/schema.js',
            from: 'const live = moved > 0 ? moved : 0;',
            to: 'const live = moved;' },
        { name: 'what came off a wage forgotten by the advance it came off', family: 'advances',
            file: 'js/model/ledger.js',
            from: 'const settled = agoraRound(effectiveRepaid + effectiveDeducted);',
            to: 'const settled = agoraRound(effectiveRepaid);' }
    ];

    mutants.forEach(mutant => {
        const file = mutant.file || 'js/model/money.js';
        const original = sources.find(one => one.file === file).code;
        const places = original.split(mutant.from).length - 1;
        given(`the line "${mutant.name}" changes is in ${file} exactly once`, places === 1,
            String(places));
        const mutated = sources.map(one => (one.file === file
            ? { file, code: original.replace(mutant.from, mutant.to) } : one));
        const broken = appOn(mutated);
        const counted = {};
        const found = { payroll: [], days: [], invoice: [], advances: [], accounts: [] };
        records.slice(0, MUTANT_RECORDS).forEach(made => {
            const one = compareRecord(broken, made, counted, mutant.family);
            Object.keys(found).forEach(family => found[family].push(...one[family]));
        });
        check(`${mutant.name}: caught`, found[mutant.family].length > 0,
            `${found[mutant.family].length} disagreements in ${mutant.family}`);
    });

    // And the same dozen records against the app as shipped are clean - so what each
    // mutant turned up is the mutant, and not noise that was there all along.
    const counted = {};
    const clean = records.slice(0, MUTANT_RECORDS).map(made => compareRecord(APP, made, counted))
        .reduce((sum, one) => sum + Object.values(one).reduce((n, list) => n + list.length, 0), 0);
    check('and the same dozen records are clean against the app as shipped', clean === 0, String(clean));
}

// ---------------------------------------------------------------- 5. the census
//
// What the generator actually produced. A generator can go on producing records long
// after it has stopped producing the hard ones; each line here is a case the task names,
// counted on the records themselves rather than on what the generator meant to do.
{
    suite('the records hold the cases they were generated for');

    const bump = name => { census[name] = (census[name] || 0) + 1; };
    records.forEach(made => {
        const record = made.record;
        const dates = Object.keys(record.days).sort();
        made.notes.forEach(bump);
        if (made.orphan) bump('a man deleted off the roster with days still on the record');
        if (record.workers.some(worker => worker.active === false)) bump('an archived worker');
        if (record.workers.some(worker => (worker.payCycles || '').indexOf('weekly') !== -1 || worker.payCycle)) bump('a man settled weekly');
        if (record.workers.some(worker => oracle.cycleHistory(worker).length > 0
            && periodsOf(made, worker).some(period => period.transition))) bump('a transition period');
        if (record.workers.some(worker => !(worker.dailyRate > 0))) bump('a man with no rate');
        const seams = new Set(dates.map(date => oracle.accountStart(date)));
        if (seams.size > 1) bump('days either side of a fortnight boundary');
        // The nights the clocks change in Israel inside the generator's windows.
        if (['2026-03-27', '2026-10-25', '2027-03-26'].some(change =>
            Object.keys((record.days[change] || {}).actual || {}).length > 0)) bump('a day worked on a DST change');
        if (dates.some(date => Object.keys(record.days[date].rima || {}).length > 0)) bump('a Rima count');
        if (dates.some(date => Object.keys(record.days[date].rima || {}).length > 0
            && Object.values(record.days[date].actual || {}).every(held => !held.entries || held.entries.length === 0))) bump('a day with Rima and none of his own men');
        // A rate that changed INSIDE a period: two stamps in one man's one period.
        if (record.workers.some(worker => periodsOf(made, worker).some(period => {
            const stamps = new Set(dates.filter(date => date >= period.from && date <= period.to)
                .map(date => ((record.days[date].actual || {})[worker.id] || {}).rates)
                .filter(Boolean).map(rates => rates.daily));
            return stamps.size > 1;
        }))) bump('a rate change inside one period');
        const entries = Object.values(record.ledger.advances);
        const closed = entries.filter(entry => entry.kind === 'closed');
        if (Object.keys(record.advances).length > 0) bump('an advance');
        if (entries.some(entry => entry.kind === 'repaid')) bump('a repayment');
        if (entries.some(entry => entry.kind === 'deducted')) bump('a deduction written off a wage');
        if (closed.some(shut => Object.values(record.advances).some(of =>
            of.workerId === shut.workerId && of.date < shut.periodFrom))) bump('an advance before a closure');
        if (closed.some(shut => Object.values(record.advances).some(of =>
            of.workerId === shut.workerId && of.date > shut.periodTo))) bump('an advance after a closure');
        if (closed.some(shut => entries.some(entry => entry.kind === 'repaid'
            && (record.advances[entry.advanceId] || {}).workerId === shut.workerId
            && entry.date >= shut.periodFrom && entry.date <= shut.periodTo && entry.at > shut.at))) bump('a repayment dated into a period already closed');
    });

    const needed = ['a rate changed', 'a rate change inside one period', 'an archived worker',
        'a man deleted off the roster with days still on the record', 'a site off the roster',
        'days either side of a fortnight boundary', 'a day worked on a DST change', 'an empty day',
        'a day with no stamp', 'a recorded day edited later', 'a Rima count',
        'a day with Rima and none of his own men', 'a man settled weekly', 'a transition period',
        'a weekly period closed', 'a man with no rate', 'an advance', 'an advance with no origin entry',
        'a repayment', 'more handed back than was owed', 'a closed period',
        'a period closed on a chosen deduction', 'a deduction written off a wage',
        'an advance before a closure', 'an advance after a closure',
        'a repayment dated into a period already closed', 'an advance reversed',
        'a correction of a repaid', 'a correction of a deducted', 'a correction of a given'];
    needed.forEach(name => {
        check(`${name}: in at least five records`, (census[name] || 0) >= 5, String(census[name] || 0));
    });
}

report();
