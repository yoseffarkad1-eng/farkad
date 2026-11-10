// The pay book suites' shared ground: one crew, recorded through the app's own doors.
//
// Not a suite - it asserts nothing and `npm test` does not run it. It exists because four
// files need the same world (tests/paybook.store.test.mjs, tests/paybook.sync.test.mjs,
// tests/paybook.oldbuilds.test.mjs and tests/paybook.emulator.test.mjs) and four copies of
// a roster drift: the day one of them gives a man a different rate, two suites are
// measuring two different closures and both are green.
//
// Synthetic data only. Nothing here is anybody's pay.

import { makeDevice } from './harness.mjs';
import { given } from './runner.mjs';

// 2026-10-02 is a Friday and opens a fortnight (ACCOUNT_ANCHOR + 56 days).
export const W1 = ['2026-10-02', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'];
export const W2 = ['2026-10-09', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'];
export const WEEK1 = { from: '2026-10-02', to: '2026-10-08' };
export const WEEK2 = { from: '2026-10-09', to: '2026-10-15' };
export const FORTNIGHT = { from: '2026-10-02', to: '2026-10-15' };
export const OPENING = '2026-10-02';
export const TODAY = '2026-10-16';

export const clone = value => JSON.parse(JSON.stringify(value));
export const stamp = (today = TODAY, by = 'd_boss', hour = '10') =>
    ({ at: `${today}T${hour}:00:00.000Z`, by, today });

// Key order is not content: the wire, the disk and a phone's memory each have their own.
export const canonical = value => {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') {
        return '{' + Object.keys(value).sort()
            .map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
    }
    return JSON.stringify(value === undefined ? null : value);
};

// THE GATE, spelled once. A device built with WRITER_ON is the build somebody will one
// day ship with the pay book open; a device built with no flags is exactly what a person
// installs today, and every claim about "the shipped state" is made on one of those.
//
// AND THE OLD DOOR WITH IT (v175). These four suites are about what Phase 2 built: the
// record's storage, its union between phones, its conflict rule, its restore rule. Every
// one of those is exercised by putting a pay entry on ONE phone and letting the queue
// carry it - the only way two phones ever come to hold different pay entries. Since v175
// that door is shut in every build (FARKAD_FLAGS.paybookQueue; a closure is one server
// transaction, tests/paybook.transact.test.mjs), so the suites open it here, by name. A
// device built with SERVER_FIRST is the build that will ship with the pay book open.
export const WRITER_ON = { paybook: true, paybookQueue: true };
export const SERVER_FIRST = { paybook: true };

let made = 0;
export function payDevice(options = {}) {
    made += 1;
    // SINCE PHASE 8 A RECORD CAN TURN THE PAY BOOK ON BY ITSELF (the opening,
    // paybookActivated in js/model/schema.js), and nearly every record in these suites
    // holds an opening. So that the suites go on measuring what they were written to
    // measure - a BUILD with the flags named, on whatever record - a device made here
    // does not honour the record's switch unless it asks to (`activation: true`):
    //
    //   default            the flags named through the seam, and nothing else, decide
    //   shipped: true      «the pay book shut»: the three flags false and the record's
    //                      switch not honoured - the build main served before Phase 8,
    //                      and this build's own way back (docs/payroll-activation.md)
    //   activation: true   the build exactly as it ships: the record decides
    //
    // tests/activation.test.mjs is where the build as it ships meets an activated record.
    const honoured = options.activation === true ? {} : { paybookActivation: false };
    const device = makeDevice(Object.assign({ deviceId: `d_book${made}` }, options, {
        flags: options.shipped ? Object.assign({}, honoured, options.flags || {})
            : Object.assign({}, honoured, WRITER_ON, options.flags || {})
    }));
    device.setToday(options.today || TODAY);
    // Every dialog the data layer raises, recorded rather than answered into the void: a
    // refusal that says nothing looks, from here, exactly like one that said the wrong
    // thing. askConfirm answers no - nobody in a suite wants the backup export it offers.
    device.said = [];
    const note = said => device.said.push(typeof said === 'string' ? said
        : `${(said && said.title) || ''} | ${(said && said.message) || ''}`);
    device.ctx.askTell = said => { note(said); return Promise.resolve(); };
    device.ctx.askConfirm = said => { note(said); return Promise.resolve(false); };
    return device;
}

//   AHMAD   weekly     300 a day, 50 an hour   week 1 = 1,800   week 2 = 1,800 + 4h = 2,000
//   KHALED  biweekly   350 a day, 50 an hour   2,100 + 2,300 = 4,400
//   NASSER  biweekly   500 a day               week 1 only = 3,000
//   SALIM   biweekly   400 a day               9 days = 3,600, and away on the 13th
export const CREW = () => [
    { id: 'w_ahmad', name: 'אחמד', active: true, dailyRate: 300, hourlyRate: 50,
        payCycles: '2026-09-11=weekly' },
    { id: 'w_khaled', name: 'חאלד', active: true, dailyRate: 350, hourlyRate: 50 },
    { id: 'w_nasser', name: 'נאסר', active: true, dailyRate: 500, hourlyRate: 0 },
    { id: 'w_salim', name: 'סלים', active: true, dailyRate: 400, hourlyRate: 0 }
];
export const SITES = () => [{ id: 'p_a', name: 'אילון', active: true },
    { id: 'p_b', name: 'גבעתיים', active: true }];

// The roster, the fortnight's days, the advances and the carry approval - each through
// the door the app itself uses (commitRoster, State.commit, recordNewAdvance + commitMany,
// recordCarryApproval), so the schedule a planner is handed is one the shipped journal
// produced and not one this file imagined.
//
// `advances`: [[worker, date, amount, id?]]. An id is given when two phones must hold the
// SAME advance without a cloud between them; recordNewAdvance mints a random one.
export function fillWorld(device, options = {}) {
    const S = device.State.schedule;
    S.workers = CREW().concat(options.workers || []);
    S.places = SITES();
    given('the roster is committed', device.State.commitRoster() === true);
    const put = (worker, day, place, hours) => {
        const change = device.call('assignPlace', device.State.schedule, day, worker, 'actual',
            place, undefined, hours);
        given(`a day is recorded (${worker} ${day})`, device.State.commit(change) === true);
    };
    W1.forEach(day => ['w_ahmad', 'w_khaled', 'w_nasser', 'w_salim'].forEach(w => put(w, day, 'p_a', 0)));
    W2.forEach((day, at) => {
        put('w_ahmad', day, at < 3 ? 'p_a' : 'p_b', at === 0 ? 4 : 0);
        put('w_khaled', day, 'p_a', at === 0 ? 4 : 0);
        if (at < 3) put('w_salim', day, 'p_b', 0);
    });
    given('an absence is recorded', device.State.commit(
        device.call('markAbsent', device.State.schedule, '2026-10-13', 'w_salim', 'actual')) === true);
    (options.advances || []).forEach(([worker, date, amount]) => {
        const made = device.call('recordNewAdvance', device.State.schedule, worker, date, amount,
            'בדיקה', `${date}T09:00:00.000Z`, device.id, 'cash');
        given(`an advance is recorded (${worker} ${amount})`, device.State.commitMany(made) === true);
    });
    if (options.approveCarry !== false) {
        const approval = device.call('recordCarryApproval', device.State.schedule,
            device.call('planCarryMigration', device.State.schedule), '2026-10-01T08:00:00.000Z', device.id);
        given('the carry is approved', device.State.commitMany([approval]) === true);
    }
    given('the financial gate is open on this record',
        device.call('financialWritingEnabled', device.State.schedule) === true);
    return device;
}

export function world(options = {}) {
    return fillWorld(payDevice(options.device || {}), options);
}

export const advancesOf = (device, worker) => {
    const all = device.call('currentAdvances', device.State.schedule);
    return Object.keys(all).filter(id => all[id].workerId === worker)
        .sort((a, b) => (all[a].date < all[b].date ? -1 : (all[a].date > all[b].date ? 1 : (a < b ? -1 : 1))));
};

// A plan, drawn against the device's own live record.
export const plan = (device, name, ...args) => device.call(name, device.State.schedule, ...args);

// The activation day, written through the one door a pay entry has.
export function openBook(device, date = OPENING, by) {
    const opening = plan(device, 'planOpening', date, stamp('2026-10-09', by || device.id));
    given('the opening is allowed', opening.ok === true, JSON.stringify(opening.reasons));
    const done = device.State.commitPaybook(opening.changes);
    given('the opening is committed', done.ok === true, JSON.stringify(done));
    return done;
}

// What is on the disk under the journal: one key per batch (`<slot>:op:<batchId>`).
export const batchKeys = device => Object.keys(device.dump()).filter(key => key.indexOf(':op:') !== -1);

// The same device, closed and opened again: a fresh context on the bytes the old one left.
export function reopen(device, options = {}) {
    const next = payDevice(Object.assign({ storage: device.dump(), deviceId: device.id }, options));
    next.State.load();
    return next;
}

// The whole pay book as a phone would report it, in an order that does not depend on the
// order entries arrived in.
export const bookOf = device => canonical(device.State.schedule.pay || {});
export const foldOf = device => {
    const fold = device.call('paybookFold', device.State.schedule);
    return canonical({
        opening: fold.opening && fold.opening.date,
        statements: Object.keys(fold.statements).sort().map(id => {
            const of = fold.statements[id];
            return [id, of.owed, of.paid, of.due, of.overpaid, of.status];
        }),
        legacy: Object.keys(fold.legacy).sort(),
        held: fold.held.map(row => row.id).sort(),
        conflicts: fold.conflicts.map(row => [row.id, row.variants, row.workerIds])
    });
};
