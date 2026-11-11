// tests/activation.test.mjs
//
// PHASE 8: turning the pay book on for ONE RECORD, by a person, from the app.
//
//   node tests/activation.test.mjs
//
// `paybook`, `months` and `cold` are false in everything a person installs, and stay
// false. What turns the pay book on is an entry in the shared record - the opening,
// `pay.po_open` - written by one server transaction that only the new rules accept
// (js/model/schema.js, paybookOn; js/model/payroll.js, planOpening and planActivation;
// docs/payroll-activation.md). This suite is that sentence, measured:
//
//   V1  the build that OFFERS the step, on a record nobody activated, is the build main
//       serves: every gate shut, the old arithmetic, nothing new written
//   V13 THE BUILD AS IT SHIPS (v190): it offers nothing - no plan, no opening, no figure
//       moved, nothing written - and it HONOURS a record another phone turned on, wholly
//   V2  the dry run a person reads first: what it says, and that reading it writes nothing
//   V3  the server still runs the rules published today: refused in a sentence's worth of
//       code, before anything is attempted - and refused whole by the server if attempted
//   V4  turning it on: the carry approval, the opening, one transaction - and every phone
//       that holds the record is on, at once, with one arithmetic
//   V5  the point of no return: what the record gained, to the field
//   V6  the way back before it: a build that does not honour the entry reads the record
//       exactly as it read before
//   V7  two phones turn it on in the same minute: one opening, nobody silently different
//   V8  a phone that had not heard closes an account the old way: it is not lost, not
//       silent, and not a second arithmetic
//   V9  a build from before the pay book, on an activated record: its writes are refused
//   V9b the same with the REAL BYTES of v180, v183, v184 and v186, out of Git, on the fake rules
//   V10 the months and the cold store follow the same switch - the whole of Phases 5 to 7
//       on a build with every flag false
//   V11 the one function: no other line reads the three flags
//
// The fake cloud runs with `payRules: true`: it refuses what firestore.rules refuse. The
// real rules, the production adapter and the real older builds (v180, v183, out of Git)
// are in tests/activation.emulator.test.mjs.

import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeCloud, makeDevice, settle, settleUntil, loadOrder, sourceRoot } from './harness.mjs';
import { makeIndexedDB } from './fake-indexeddb.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import { CREW, SITES, W1, W2, FORTNIGHT, WEEK1, WEEK2, clone, stamp, canonical } from './paybook.world.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEDULE = 'scheduleData:v2';
const TODAY = '2026-10-16';
const OPENING = '2026-10-02';
const F3 = { from: '2026-09-04', to: '2026-09-17' };           // nobody closed it
const F4 = { from: '2026-09-18', to: '2026-10-01' };           // closed the old way
const LATER = '2027-05-01';

// THREE BUILDS, SINCE v190 (the owner's decision 71, option B, 2026-11-11: nobody sees the
// row until he says "activate"). OFFERING the step and HONOURING the entry are two flags:
//
//   SHIPS   no flag named: THE BUILD AS IT SHIPS. v190 does not offer the step
//           (`paybookActivation: false`) and honours a record another phone turned on
//           (`paybookHonour: true`). V13 is this build, by itself and beside the next.
//   OFFER   the build that OFFERS the step - this build with the one line changed
//           (`paybookActivation: true`), which is the whole of the build served on the
//           day he says so. Every section that TURNS A RECORD ON does it on this build,
//           named through the seam; a phone made with no word is this one.
//   OFF     the way back: the record's switch not honoured (`paybookHonour: false`), the
//           step not offered.
//
// Wherever a section below hands a phone `SHIPS`, it is asking the question of v190: the
// phone that did NOT turn the record on and is handed it.
const SHIPS = null;
const OFFER = { paybookActivation: true };
function phone(id, options = {}) {
    const device = makeDevice(Object.assign({ deviceId: id }, options,
        { flags: options.flags === undefined ? OFFER : options.flags }));
    device.setToday(options.today || TODAY);
    device.said = [];
    const note = said => device.said.push(typeof said === 'string' ? said
        : `${(said && said.title) || ''} | ${(said && said.message) || ''}`);
    device.ctx.askTell = said => { note(said); return Promise.resolve(); };
    device.ctx.askConfirm = said => { note(said); return Promise.resolve(false); };
    device.Sync.pushDelayMs = 5;
    return device;
}
const OFF = { paybookActivation: false, paybookHonour: false };
const quiet = device => device.Sync.status === 'synced' && device.Sync.pendingCount() === 0;
const settled = (devices, limit = 8000) => settleUntil(() => devices.every(quiet), limit, 5);
const S = device => device.State.schedule;
const at = (device, hour = '10', today = TODAY) => stamp(today, device.id, hour);

// THE RECORD BEFORE ANYBODY TURNS ANYTHING ON, written by the app's own doors on a build
// as it ships. The owner's examples (the October fortnight), and behind them the two
// things an activation has to say something about:
//
//   KHALED took 500 on 2026-09-06, in a fortnight he earned 700 in and NOBODY CLOSED.
//          Today's walk counts it as taken out of that wage: he owes 0. Under the
//          one-debt ruling he owes 500 until somebody deducts it.
//   NASSER had the fortnight before the opening closed THE OLD WAY: a frozen payslip
//          with no payment record - «סגירה ישנה לבדיקה».
function seed(options = {}) {
    const d = phone(options.id || 'd_seed');
    const schedule = d.State.schedule;
    schedule.workers = CREW();
    schedule.places = SITES();
    given('the roster is committed', d.State.commitRoster() === true);
    const put = (worker, day, place, hours) => given(`a day is recorded (${worker} ${day})`,
        d.State.commit(d.call('assignPlace', d.State.schedule, day, worker, 'actual', place, undefined, hours || 0)) === true);
    ['2026-09-06', '2026-09-07'].forEach(day => put('w_khaled', day, 'p_a'));
    ['2026-09-20', '2026-09-21'].forEach(day => put('w_nasser', day, 'p_a'));
    W1.forEach(day => ['w_ahmad', 'w_khaled', 'w_nasser', 'w_salim'].forEach(w => put(w, day, 'p_a')));
    W2.forEach((day, n) => {
        put('w_ahmad', day, n < 3 ? 'p_a' : 'p_b', n === 0 ? 4 : 0);
        put('w_khaled', day, 'p_a', n === 0 ? 4 : 0);
        if (n < 3) put('w_salim', day, 'p_b');
    });
    given('a Rima count and a «עובדי יוסף גבס» count are recorded',
        d.State.commit(d.call('setRimaCount', d.State.schedule, '2026-10-05', 'p_a', 3)) === true
        && d.State.commit(d.call('setYosefGevesCount', d.State.schedule, '2026-10-05', 'p_a', 2)) === true);
    given('the advance is recorded', d.State.commitMany(d.call('recordNewAdvance', d.State.schedule, 'w_khaled',
        '2026-09-06', 500, 'בדיקה', '2026-09-06T09:00:00.000Z', d.id, 'cash')) === true);
    if (options.carry === true) {
        given('the carry is approved (as on a record that approved it long ago)', d.State.commitMany([d.call('recordCarryApproval',
            d.State.schedule, d.call('planCarryMigration', d.State.schedule), '2026-09-01T08:00:00.000Z', d.id)]) === true);
    }
    if (options.oldClosure !== false && d.call('financialWritingEnabled', d.State.schedule)) {
        given('Nasser\'s earlier fortnight is closed the old way', d.State.commitMany(d.call('closePeriodChanges',
            d.State.schedule, 'w_nasser', F4.from, F4.to, '2026-10-02T08:00:00.000Z', d.id, 0)) === true);
    }
    return d;
}
// The document a phone on v184 left on the server: protocol 1.
const wireOf = device => Object.assign(clone(device.call('cloudDocument', device.State.schedule)),
    { protocol: 1, revision: 7, lastOpId: 'op_seed', opFingerprint: 'f_seed' });
const cloudFor = (device, options = {}) => makeCloud(Object.assign({ payRules: true, doc: wireOf(device) }, options));
function join_(id, base, cloud, options = {}) {
    const device = phone(id, Object.assign({ storage: { [SCHEDULE]: JSON.stringify(base.State.schedule) } }, options));
    device.State.load();
    if (cloud) device.Sync.connect(cloud.adapter);
    return device;
}

// Everything anybody reads off the record, as one string.
const RANGE = ['2026-09-01', '2026-10-31'];
const parts = device => ({
    payroll: canonical(device.call('payrollReport', S(device), RANGE[0], RANGE[1])),
    // The same sheet over the open fortnight alone, a row a man: where a carried debt shows.
    payrollRows: device.call('payrollReport', S(device), FORTNIGHT.from, FORTNIGHT.to).map(row => [row.workerId, canonical(row)]),
    invoice: canonical(device.call('invoiceReport', S(device), RANGE[0], RANGE[1])),
    each: canonical(S(device).workers.map(man => device.call('workerDaysReport', S(device), man, RANGE[0], RANGE[1]))),
    rima: canonical(device.call('rimaReport', S(device), RANGE[0], RANGE[1])),
    geves: canonical(device.call('yosefGevesReport', S(device), RANGE[0], RANGE[1])),
    carry: canonical(S(device).workers.map(man => [man.id, device.call('advanceCarryInto', S(device), man.id, FORTNIGHT.from),
        device.call('advanceCarryInto', S(device), man.id, '2026-10-16')])),
    owed: canonical(S(device).workers.map(man => (device.call('openAdvanceBalance', S(device), man.id) || { total: 0 }).total)),
    days: canonical(S(device).days)
});
const figures = device => JSON.stringify(parts(device));
const gates = device => ({
    on: device.call('paybookOn', S(device)), writes: device.call('paybookWritesEnabled', S(device)),
    ruling: device.call('advanceDebtStays', S(device)), months: device.call('monthWritesEnabled', S(device)),
    cold: device.call('coldWriterEnabled')
});
const ALL_OFF = { on: false, writes: false, ruling: false, months: false, cold: false };
const ALL_ON = { on: true, writes: true, ruling: true, months: true, cold: true };

// The whole step, as js/ui/accounts.js runs it (accDrawActivate): the server is asked
// which rules it runs; the carry approval is written if the record has none and the
// queue is let drain; then the opening goes through the server-first door.
async function activate(device, date = OPENING, hour = '10') {
    const refused = await device.Sync.activationRefusal();
    if (refused) return { ok: false, state: 'refused', reasons: [refused] };
    let drawn = device.call('planActivation', S(device), date, at(device, hour));
    if (drawn.state !== 'offered') return { ok: false, state: drawn.state, reasons: drawn.reasons };
    if (drawn.reasons.indexOf('carry-approval-needed') !== -1) {
        const carry = device.call('planCarryApproval', S(device), at(device, hour));
        if (!carry.ok) return { ok: false, state: 'carry', reasons: carry.reasons };
        if (!carry.already) {
            const change = device.call('recordCarryApproval', S(device),
                { id: carry.carryApproval.id, rows: carry.carryApproval.rows }, at(device, hour).at, device.id);
            if (device.State.commitMany([change]) !== true) return { ok: false, state: 'carry', reasons: ['storage'] };
            await settleUntil(() => device.Sync.pendingCount() === 0 && device.Sync._sending.size === 0, 8000, 5);
        }
    }
    const plan = device.call('planOpening', S(device), date, at(device, hour));
    if (!plan.ok) return { ok: false, state: 'plan', reasons: plan.reasons };
    return device.Sync.transactPaybook(plan);
}

// ------------------------------------------------------------------------------------
{
    suite('V1: the build that offers the step, on a record nobody activated, is the build main serves');

    const d = seed({ id: 'd_v1', carry: true });
    // MOVED AT v190, deliberately (decision 71, option B): «the shipped flags: the three
    // switches false, and the step offered» was [.., paybookActivation: true]. The build
    // as it ships no longer offers the step; it honours an entry (a flag of its own).
    same('the shipped flags: the three switches false, the step NOT offered, an opening on the record honoured',
        (flags => [flags.paybook, flags.months, flags.cold, flags.paybookQueue, flags.paybookActivation, flags.paybookHonour])(
            phone('d_v1ships', { flags: SHIPS }).global('FARKAD_FLAGS')),
        [false, false, false, false, false, true]);
    same('and the build this suite turns records on with differs from it by that one flag',
        (flags => [flags.paybook, flags.months, flags.cold, flags.paybookQueue, flags.paybookActivation, flags.paybookHonour])(d.global('FARKAD_FLAGS')),
        [false, false, false, false, true, true]);
    same('every gate is shut for this record', gates(d), ALL_OFF);
    same('the walk is today\'s: Khaled\'s 500 from the fortnight nobody closed is counted as taken, and nothing is carried',
        [d.call('advanceCarryInto', S(d), 'w_khaled', FORTNIGHT.from), d.call('advanceOutstanding', S(d), Object.keys(S(d).advances)[0]).left], [0, 500]);
    const st = at(d);
    const refused = [
        d.call('planClosure', S(d), 'w_khaled', FORTNIGHT, {}, st),
        d.call('planPayment', S(d), 'ps_w_khaled_20261002', 10, { paymentId: 'pp_v1000000000001' }, st),
        d.call('planLegacy', S(d), 'w_nasser', F4.from, { state: 'paid' }, st),
        d.call('planGroupClosure', S(d), ['w_khaled'], { cycle: 'biweekly', today: TODAY }, {}, st)
    ];
    same('every planner but the opening refuses with `gate`, and hands back no change',
        refused.slice(0, 3).map(plan => [plan.ok, plan.reasons.indexOf('gate') !== -1, plan.changes.length]),
        [[false, true, 0], [false, true, 0], [false, true, 0]]);
    same('the archive and the months answer `gate` and move nothing', [d.call('planArchive', S(d), LATER).reasons,
        d.call('planMonths', S(d), LATER).reasons, d.Sync.archiveRefusal(), d.Sync.monthArchiveRefusal()], [['gate'], ['gate'], 'gate', 'gate']);
    same('State.commitPaybook refuses whatever reaches it', d.State.commitPaybook([{ path: 'pay.x', value: {} }]).reasons[0], 'gate');
    same('and the record holds no pay book', Object.keys(S(d).pay || {}), []);

    // The same record on the build with the step NOT offered: nothing differs.
    const off = join_('d_v1off', d, null, { flags: OFF });
    same('the way-back build (the step not offered, the entry not honoured) reads this record exactly as the offering build does',
        [figures(off) === figures(d), gates(off)], [true, ALL_OFF]);
    same('- and there the opening is refused like everything else', off.call('planOpening', S(off), OPENING, at(off)).reasons, ['gate']);
}

// ------------------------------------------------------------------------------------
{
    suite('V2: the dry run a person reads first - what it says, and that reading it writes nothing');

    const d = seed({ id: 'd_v2', carry: true });
    const cloud = cloudFor(d);
    d.Sync.connect(cloud.adapter);
    await settled([d]);
    const disk = JSON.stringify(d.dump());
    const memory = canonical(S(d));
    const wrote = cloud.writes.length;
    const drawn = d.call('planActivation', S(d), OPENING, at(d));
    same('it is offered, allowed, and changes nothing by being drawn', [drawn.state, drawn.ok, drawn.reasons, drawn.changes], ['offered', true, [], []]);
    same('WHAT THE ONE-DEBT RULING MOVES: Khaled, 0 today, 500 once it is on - and nobody else',
        drawn.report.debt.map(row => [row.workerId, row.old, row.new, row.recorded]), [['w_khaled', 0, 500, 500]]);
    same('the totals are the model\'s own sums', drawn.report.debtTotals, { men: 1, old: 0, new: 500 });
    same('THE OLDER CLOSURE: one, waiting for an answer nobody is made to give', drawn.report.legacy.paymentUnknown, 1);
    check('the size of the record is the server\'s document, weighed', drawn.report.archive.liveBytes > 1000
        && drawn.report.archive.limitBytes === 1048576, JSON.stringify(drawn.report.archive));
    same('the months are planned on the record as it will read: nothing ready, and it says why for each',
        [drawn.report.months.reasons, drawn.report.months.months.map(one => [one.month, one.state])],
        [[], [['2026-09', 'held'], ['2026-10', 'held']]]);
    same('the carry is on this record already: it is not part of the step', drawn.report.carry.approved, true);
    same('the opening inside it is the plan that would be sent: one path, the opening, on the day asked',
        [drawn.opening.ok, drawn.opening.activating, drawn.opening.changes.map(change => [change.path, change.value.kind, change.value.date])],
        [true, true, [['pay.po_open', 'opening', OPENING]]]);
    same('a day in the future is refused, and the report is still drawn', (late => [late.ok, late.reasons, late.report.debt.length])(
        d.call('planActivation', S(d), '2026-12-01', at(d))), [false, ['date'], 1]);
    await settle(60);
    same('READING ALL OF THAT WROTE NOTHING: every key on the disk byte for byte, memory unchanged, the cloud untouched, the server not even asked',
        [JSON.stringify(d.dump()) === disk, canonical(S(d)) === memory, cloud.writes.length - wrote, cloud.probes.length], [true, true, 0, 0]);
    same('the same report twice is the same report', canonical(d.call('planActivation', S(d), OPENING, at(d)).report) === canonical(drawn.report), true);
    same('and on a frozen record', (() => {
        const frozen = clone(S(d));
        const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
        return canonical(d.call('planActivation', freeze(frozen), OPENING, at(d)).report) === canonical(drawn.report);
    })(), true);

    // A record whose carry nobody approved: the step says so, and carries the approval.
    const bare = seed({ id: 'd_v2bare', carry: false, oldClosure: false });
    const need = bare.call('planActivation', S(bare), OPENING, at(bare));
    same('A RECORD WITH NO CARRY APPROVAL: the opening waits for it, the approval is in the same step, and the step as a whole is allowed',
        [need.opening.ok, need.reasons, need.carry.ok, need.carry.already, need.carry.changes.map(change => change.path), need.ok],
        [false, ['carry-approval-needed'], true, false, ['ledger.migrations.cm_carry'], true]);
    same('- and the report says the record has none, with how many rows the carry would move on the record as it WILL read',
        [need.report.carry.approved, Number.isInteger(need.report.carry.rows)], [false, true]);
}

// ------------------------------------------------------------------------------------
{
    suite('V3: the server still runs the rules published today - refused before anything is attempted');

    const d = seed({ id: 'd_v3', carry: true });
    const cloud = cloudFor(d, { oldRules: true });
    d.Sync.connect(cloud.adapter);
    await settled([d]);
    const disk = JSON.stringify(d.dump());
    const wrote = cloud.writes.length;
    const attempts = cloud.attempts.length;
    same('THE QUESTION IS A READ, and the answer is `rules`', [await d.Sync.activationRefusal(), cloud.probes, cloud.attempts.length - attempts],
        ['rules', ['paybook-8'], 0]);
    same('the step stops there: nothing written, nothing queued, the disk byte for byte, the record not on',
        [(await activate(d)).reasons, cloud.writes.length - wrote, d.Sync.pendingCount(), JSON.stringify(d.dump()) === disk, gates(d).on],
        [['rules'], 0, 0, true, false]);

    // And if a build ever sent the opening without asking: the server refuses it whole.
    const sent = await d.Sync.transactPaybook(d.call('planOpening', S(d), OPENING, at(d)));
    await settle(60);
    same('SENT ANYWAY, the opening is refused WHOLE by those rules: `server`, nothing in doubt, nothing queued, no closed document, the record not on',
        [sent.state, sent.reasons, d.Sync.payIntent(), d.Sync.pendingCount(), cloud.closed.size, Object.keys(cloud.doc.pay || {}), gates(d).on],
        ['refused', ['server'], null, 0, 0, [], false]);
    same('and the phone goes on recording days', [d.State.commit(d.call('assignPlace', S(d), '2026-10-16', 'w_salim', 'actual', 'p_a', undefined, 0)),
        (await settled([d]), d.Sync.status), Boolean(cloud.doc.days['2026-10-16'])], [true, 'synced', true]);

    // No signal: never read as "the rules are there".
    const away = seed({ id: 'd_v3away', carry: true });
    const other = cloudFor(away);
    away.Sync.connect(other.adapter);
    await settled([away]);
    other.online = false;
    same('with no signal the answer is `offline` - never "may"', await away.Sync.activationRefusal(), 'offline');
    other.online = true;
    const blind = phone('d_v3blind', { storage: away.dump() });
    blind.State.load();
    same('with no cloud at all, the same', await blind.Sync.activationRefusal(), 'offline');
    given('a day is recorded and not yet sent', (other.online = false, away.State.commit(
        away.call('assignPlace', S(away), '2026-10-16', 'w_salim', 'actual', 'p_a', undefined, 0))) === true);
    same('with unsent work on the phone: `unsent-work`, and the server is not asked', [await away.Sync.activationRefusal(), other.probes], ['unsent-work', []]);
    const old = Object.assign({}, other.adapter);
    delete old.probeRules;
    other.online = true;
    await settled([away]);
    away.Sync.adapter = old;
    same('an adapter that cannot ask is `unsupported`', await away.Sync.activationRefusal(), 'unsupported');
}

// ------------------------------------------------------------------------------------
let ACTIVATED = null;
{
    suite('V4: turning it on - the carry approval, the opening, one transaction; and every phone is on at once');

    const base = seed({ id: 'd_v4seed', carry: false, oldClosure: false });
    const cloud = cloudFor(base);
    const a = join_('d_owner', base, cloud);
    // v190: the phone that presses is on the build that offers; THE OTHER TWO ARE ON THE
    // BUILD AS IT SHIPS, which does not - the state of the fleet on the day, while the
    // phones update one by one.
    const b = join_('d_fore', base, cloud, { flags: SHIPS });
    const c = join_('d_third', base, null, { flags: SHIPS });   // has the record, no signal today
    await settled([a, b]);
    const before = { figures: figures(a), parts: parts(a), record: clone(S(a)), revision: cloud.doc.revision };
    given('the three phones start on one record, all gates shut',
        figures(b) === before.figures && figures(c) === before.figures && [a, b, c].every(d => !gates(d).on));

    const answer = await activate(a);
    await settled([a, b]);
    same('THE ANSWER IS `closed`: committed, read back, adopted', [answer.ok, answer.state], [true, 'closed']);
    same('the server holds the opening, its create-once closed document, and the carry approval the step wrote first',
        [Object.keys(cloud.doc.pay), cloud.doc.pay.po_open.date, [...cloud.closed.keys()], Object.keys(cloud.doc.ledger.migrations)],
        [['po_open'], OPENING, ['po_open'], ['cm_carry']]);
    same('written as: the carry approval by the ordinary queue, then ONE transaction - and nothing else',
        cloud.writes.filter(write => !write.replayed).slice(-2).map(write => write.kind), ['update', 'transact']);
    same('the phone that did it is ON - the pay book, the ruling, the months and the cold store, by the one switch', gates(a), ALL_ON);
    same('THE OTHER PHONE IS ON TOO, with nobody touching it', gates(b), ALL_ON);
    same('and they hold one record and one arithmetic', [canonical(S(a).pay) === canonical(S(b).pay), figures(a) === figures(b)], [true, true]);
    same('the ruling is in force on both: Khaled owes 500 going into the open fortnight',
        [a, b].map(d => d.call('advanceCarryInto', S(d), 'w_khaled', FORTNIGHT.from)), [500, 500]);
    same('the old readers and the pay book agree on what he owes: the card\'s figure and the accounts page\'s',
        [a, b].map(d => [d.call('carryReportingEnabled', S(d)), d.call('openAdvanceBalance', S(d), 'w_khaled').total,
            d.call('accountFor', S(d), S(d).workers[1], TODAY).debt]), [[true, 500, 500], [true, 500, 500]]);
    same('a closure can now be planned on either phone', [a, b].map(d => d.call('planClosure', S(d), 'w_nasser', FORTNIGHT, {}, at(d)).ok), [true, true]);
    same('no intent is left, nothing is pending, nobody is stopped',
        [a, b].map(d => [d.Sync.payIntent(), d.Sync.pendingCount(), d.call('farkadWritesBlocked')]), [[null, 0, false], [null, 0, false]]);
    same('after a reopen both are still on - from their own disks', [a, b].map(d => {
        const next = phone(d.id, { storage: d.dump(), flags: d === a ? OFFER : SHIPS });
        next.State.load();
        return gates(next).on;
    }), [true, true]);

    // The phone with no signal: NOT half on. The old arithmetic for the whole record...
    same('THE PHONE THAT HAS NOT HEARD is not on - for the whole record, by every gate', [gates(c), figures(c) === before.figures], [ALL_OFF, true]);
    c.Sync.connect(cloud.adapter);
    await settled([c]);
    // ...and then on, for the whole record, the moment it adopts.
    same('- and the moment it hears, it is on, with the same arithmetic as the other two', [gates(c), figures(c) === figures(a)], [ALL_ON, true]);

    // Pressed again, anywhere: the same fact.
    same('pressed again on another phone, the step says it is already on, and writes nothing',
        [b.call('planActivation', S(b), OPENING, at(b)).state, b.call('planActivation', S(b), OPENING, at(b)).since,
            (wrote => (b.call('planOpening', S(b), OPENING, at(b)).already === true) && cloud.writes.length === wrote)(cloud.writes.length)],
        ['on', OPENING, true]);
    same('another day, afterwards, is refused: the opening is one fact', b.call('planOpening', S(b), '2026-09-18', at(b)).reasons, ['opened']);
    ACTIVATED = { cloud, a, b, c, before, base };
}

// ------------------------------------------------------------------------------------
{
    suite('V5: the point of no return - what the record gained by being turned on, to the field');

    const { cloud, a, before } = ACTIVATED;
    const now = clone(S(a));
    const strip = record => { const out = clone(record); delete out.pay; delete out.updatedAt; delete out.updatedBy;
        if (out.ledger) delete out.ledger.migrations; return out; };
    same('EVERYTHING BUT TWO ENTRIES IS WHAT IT WAS: every day, every advance, every ledger entry, the roster',
        canonical(strip(now)) === canonical(strip(before.record)), true);
    same('the two entries: the carry approval and the opening', [Object.keys(now.ledger.migrations), Object.keys(now.pay)], [['cm_carry'], ['po_open']]);
    same('on the server: two revisions, one closed document, no index, no month out',
        [cloud.doc.revision - before.revision, cloud.closed.size, Object.keys((cloud.doc.payIndex || {}).rows || {}), Object.keys((cloud.doc.monthIndex || {}).rows || {})],
        [2, 1, [], []]);
    const is = parts(a);
    same('no day, no wage, no invoice line and no count moved - ONLY what a man is said to owe going into an account',
        Object.keys(is).filter(key => JSON.stringify(is[key]) !== JSON.stringify(before.parts[key])), ['carry']);
    same('- and that is Khaled\'s 500, the advance from the fortnight nobody closed: 0 before, 500 now, into both accounts asked',
        [JSON.parse(before.parts.carry).filter(row => row[1] !== 0 || row[2] !== 0), JSON.parse(is.carry).filter(row => row[1] !== 0 || row[2] !== 0)],
        [[], [['w_khaled', 500, 500]]]);
}

// ------------------------------------------------------------------------------------
{
    suite('V6: the way back, before the first closure - a build that does not honour the entry reads the record as before');

    const { cloud, a, before } = ACTIVATED;
    const back = phone('d_owner', { storage: a.dump(), flags: OFF });
    back.State.load();
    same('the way-back build on the ACTIVATED record: every gate shut', gates(back), ALL_OFF);
    same('EVERY FIGURE IS WHAT IT WAS BEFORE ANYBODY TURNED ANYTHING ON', figures(back) === before.figures, true);
    same('it still HOLDS the opening - it does not write the pay book, and it does not drop it',
        [Object.keys(S(back).pay), JSON.parse(back.raw(SCHEDULE)).pay.po_open.date], [['po_open'], OPENING]);
    back.Sync.connect(cloud.adapter);
    await settled([back]);
    given('a day is recorded on it', back.State.commit(back.call('assignPlace', S(back), '2026-10-16', 'w_salim', 'actual', 'p_a', undefined, 0)) === true);
    await settled([back, a]);
    same('it records a day (it speaks protocol 2), and the server\'s pay book is untouched',
        [Boolean(cloud.doc.days['2026-10-16']), Object.keys(cloud.doc.pay), cloud.closed.size, back.Sync.status], [true, ['po_open'], 1, 'synced']);
    same('its closures are refused with `gate`, as on any build with the pay book shut',
        back.call('planClosure', S(back), 'w_nasser', FORTNIGHT, {}, at(back)).reasons, ['gate']);
    same('and the offering build, beside it on the same record, is still on', gates(a).on, true);
}

// ------------------------------------------------------------------------------------
{
    suite('V7: two phones turn it on in the same minute - one opening, and nobody is silently different');

    const base = seed({ id: 'd_v7seed', carry: true });
    {
        const cloud = cloudFor(base);
        const a = join_('d_7a', base, cloud);
        const b = join_('d_7b', base, cloud);
        await settled([a, b]);
        const [one, two] = await Promise.all([activate(a, OPENING, '10'), activate(b, '2026-09-18', '11')]);
        await settled([a, b]);
        const states = [one.state, two.state].sort();
        same('DIFFERENT DAYS, the same minute: exactly one is `closed`, the other is told the record changed', states, ['closed', 'stale']);
        const loser = one.state === 'stale' ? one : two;
        same('- told WHY: the opening is already there', loser.reasons.indexOf('opened') !== -1, true);
        same('ONE opening on the server, one closed document, nothing kept beside it',
            [Object.keys(cloud.doc.pay), cloud.closed.size, Object.keys(cloud.doc.payConflicted || {})], [['po_open'], 1, []]);
        same('both phones hold the SAME opening and are on; neither holds an intent, a queued write or a disagreement',
            [canonical(S(a).pay) === canonical(S(b).pay), gates(a).on, gates(b).on,
                [a, b].map(d => [d.Sync.payIntent(), d.Sync.pendingCount(), Object.keys(S(d).payConflicted || {}).length, d.Sync.heldRecords().length])],
            [true, true, true, [[null, 0, 0, 0], [null, 0, 0, 0]]]);
    }
    {
        const cloud = cloudFor(base);
        const a = join_('d_7c', base, cloud);
        const b = join_('d_7d', base, cloud);
        await settled([a, b]);
        const [one, two] = await Promise.all([activate(a, OPENING, '10'), activate(b, OPENING, '10')]);
        await settled([a, b]);
        same('THE SAME DAY on both: both are told it is done, and there is one opening',
            [[one.ok, two.ok], [one.state, two.state].sort().join('|').replace('closed|done', 'ok').replace('closed|closed', 'ok').replace('done|done', 'ok'),
                Object.keys(cloud.doc.pay), cloud.closed.size, canonical(S(a).pay) === canonical(S(b).pay)],
            [[true, true], 'ok', ['po_open'], 1, true]);
    }
}

// ------------------------------------------------------------------------------------
{
    suite('V7b: an opening that disagrees can only come from a FILE - and then the server\'s stands, on every phone, and nothing is locked');

    // Through the screens two openings cannot both land (V7). The one other way a second
    // body can reach a record is a restore of a file from ANOTHER state of it - and a
    // restore unions the pay book, the live copy standing (docs/payroll-closure.md, the
    // restore rule). Asked of the model's own union, the one every door calls.
    const d = seed({ id: 'd_v7b', carry: true });
    const opening = d.call('planOpening', S(d), OPENING, at(d));
    const live = d.call('paybookApply', S(d), opening.changes).schedule;
    const file = clone(live);
    file.pay.po_open = Object.assign({}, file.pay.po_open, { date: '2026-09-18', by: 'd_other' });
    const united = d.call('paybookUnion', live, file);
    const record = Object.assign(clone(live), { pay: united.pay, payConflicted: united.payConflicted });
    same('the live opening STANDS and the file\'s is kept beside it, verbatim - nothing merged, nothing chosen by a clock',
        [united.clashes, record.pay.po_open.date, record.payConflicted.po_open.map(body => body.date)], [['po_open'], OPENING, ['2026-09-18']]);
    same('the record is still on, from the standing day, and the disagreement is in the fold', [d.call('paybookOn', record),
        d.call('paybookFold', record).opening.date, d.call('paybookFold', record).conflicts.map(one => one.id)], [true, OPENING, ['po_open']]);
    same('NOBODY IS LOCKED BY IT: an opening belongs to no man, so every man\'s account reads as it did and a closure can be planned',
        [canonical(d.call('accountsList', record, TODAY).rows.map(row => [row.workerId, row.status]))
            === canonical(d.call('accountsList', live, TODAY).rows.map(row => [row.workerId, row.status])),
            d.call('planClosure', record, 'w_nasser', FORTNIGHT, { allocations: {}, paid: 0 }, at(d)).ok], [true, true]);
    // KNOWN, and said in the docs (Phase 8, «settling a disagreement»): this one
    // disagreement is on no screen - «מה לבדוק?» is a page per man. Every phone that has
    // heard the server computes from the same opening, so no figure differs anywhere.
    same('KNOWN: it is listed on no man\'s «לבדיקה» - there is no man to list it under',
        d.call('accountsList', record, TODAY).rows.filter(row => (row.conflicts || []).length > 0).length, 0);
}

// ------------------------------------------------------------------------------------
{
    suite('V8: a phone that had not heard closes an account the old way - not lost, not silent, not a second arithmetic');

    const base = seed({ id: 'd_v8seed', carry: true });
    const cloud = cloudFor(base);
    const a = join_('d_8a', base, cloud);
    const b = join_('d_8b', base, null, { flags: SHIPS });   // the foreman's phone, no signal, on the build as it ships
    await settled([a]);
    given('the owner turns it on', (await activate(a)).state === 'closed');
    await settled([a]);
    // The foreman, who has not heard, closes Salim's fortnight with the old dialog's writer.
    given('the foreman\'s phone is not on', gates(b).on === false);
    const old = b.call('closePeriodChanges', S(b), 'w_salim', FORTNIGHT.from, FORTNIGHT.to, '2026-10-16T12:00:00.000Z', b.id, 0);
    given('the old closure is accepted on the phone that has not heard', old.length > 0 && b.State.commitMany(old) === true);
    b.Sync.connect(cloud.adapter);
    await settled([a, b]);
    same('it reaches the server and both phones, and both are on', [gates(a).on, gates(b).on, a.Sync.status, b.Sync.status], [true, true, 'synced', 'synced']);
    same('nobody is stopped and nothing is held', [a, b].map(d => [d.call('farkadWritesBlocked'), d.Sync.heldRecords().length]), [[false, 0], [false, 0]]);
    const list = d => d.call('planPayMigration', S(d), TODAY).paymentUnknown.map(row => [row.workerId, row.periodFrom]).sort();
    same('IT IS ON THE LIST A PERSON ANSWERS - «סגירות ישנות לבדיקה» - on both phones, beside the one from before',
        [list(a), canonical(list(a)) === canonical(list(b))], [[['w_nasser', F4.from], ['w_salim', FORTNIGHT.from]], true]);
    same('the account is CLOSED on both: the pay book will not close it a second time',
        [a, b].map(d => d.call('planClosure', S(d), 'w_salim', FORTNIGHT, {}, at(d)).reasons), [['closed'], ['closed']]);
    same('and the two phones compute every figure the same', figures(a) === figures(b), true);
    const answer = await a.Sync.transactPaybook(a.call('planLegacy', S(a), 'w_salim', FORTNIGHT.from, { state: 'paid' }, at(a, '13')));
    await settled([a, b]);
    same('a person answers it once, through the pay book, and it leaves the list on both',
        [answer.state, list(a), list(b)], ['closed', [['w_nasser', F4.from]], [['w_nasser', F4.from]]]);
}

// ------------------------------------------------------------------------------------
{
    suite('V9: a build from before the pay book, on an activated record - its writes are refused (the fake cloud speaking firestore.rules)');

    const base = seed({ id: 'd_v9seed', carry: true });
    const cloud = cloudFor(base);
    const a = join_('d_9a', base, cloud);
    await settled([a]);
    const head = (name, protocol) => ({ updatedAt: new Date().toISOString(), updatedBy: 'd_old', protocol, lastOpId: name,
        opFingerprint: 'f', revision: cloud.doc.revision + 1 });
    const tried = (kind, payload) => cloud.adapter[kind](payload).then(() => 'accepted', error => error.code);
    same('BEFORE anybody turns it on, a protocol-1 day is accepted: publishing the rules first stops no phone',
        await tried('update', Object.assign(head('op9a', 1), { 'days.2026-10-16.actual.w_salim': { entries: [{ placeId: 'p_a' }] } })), 'accepted');
    await settled([a]);
    given('turned on', (await activate(a)).state === 'closed');
    await settled([a]);
    const stood = canonical(cloud.doc);
    same('AFTER: a protocol-1 day is refused', await tried('update', Object.assign(head('op9b', 1), { 'days.2026-10-17.actual.w_salim': { entries: [{ placeId: 'p_a' }] } })), 'permission-denied');
    same('a protocol-1 closure made the old way is refused', await tried('update', Object.assign(head('op9c', 1),
        { 'ledger.advances.le_period_w_salim_20261002': { id: 'le_period_w_salim_20261002', kind: 'closed' } })), 'permission-denied');
    const whole = Object.assign(clone(cloud.doc), head('op9d', 1));
    delete whole.pay;
    same('a protocol-1 whole document (its restore) is refused', await tried('save', whole), 'permission-denied');
    same('and the server\'s document is exactly what it was', canonical(cloud.doc) === stood, true);
    same('a protocol-2 day is accepted', await tried('update', Object.assign(head('op9e', 2), { 'days.2026-10-17.actual.w_salim': { entries: [{ placeId: 'p_a' }] } })), 'accepted');
}

// ------------------------------------------------------------------------------------
// The builds a phone may still be on when the owner presses the button: v180, v183, v184
// and v186 were all served on 2026-11-10, and v186 (9846d7f, the shared rides) is the build
// v190 is made on top of. Their own files, out of
// Git, in this build's load order less the six files only this branch has. (The same
// builds meet the REAL rules, through their own adapter, in the emulator suite.)
{
    const git = args => execFileSync('git', ['-C', sourceRoot()].concat(args), { maxBuffer: 64 * 1024 * 1024 });
    const NOT_ON_MAIN = ['js/model/payroll.js', 'js/sync/transact.js', 'js/sync/closed.js',
        'js/model/months.js', 'js/sync/months.js', 'js/cold.js'];
    const order = loadOrder().filter(file => NOT_ON_MAIN.indexOf(file) === -1);
    const answers = {};
    for (const [name, sha] of [['v180', 'd3103d6'], ['v183', '1af6729'], ['v184', '990f5b4'], ['v186', '9846d7f']]) {
        suite(`V9b: ${name}, its real bytes out of Git, on a record that is turned on beside it`);

        let present = false;
        try { present = git(['cat-file', '-t', sha]).toString().trim() === 'commit'; } catch (error) { present = false; }
        given(`the ${name} commit is in this repository`, present, sha);
        const files = order.filter(file => { try { git(['cat-file', '-e', `${sha}:${file}`]); return true; } catch (error) { return false; } });
        given(`${name} has every file this build loads that it could have had`, files.length === order.length, `${files.length} of ${order.length}`);
        const sources = files.map(file => ({ file, code: git(['show', `${sha}:${file}`]).toString('utf8') }));
        const said = (/const APP_VERSION = '([^']+)'/.exec(git(['show', `${sha}:js/app.js`]).toString('utf8')) || [])[1];
        given(`the older build names itself ${name}`, said === name, String(said));
        given(`${name} has never heard of the pay book`, !sources.some(source => /payConflicted|paybookOn|layPaybookEntry/.test(source.code)));

        const base = seed({ id: `d_v9b_${name}`, carry: true });
        const cloud = cloudFor(base);
        const mine = join_(`d_new_${name}`, base, cloud);
        // Its own disk as such a phone has it: v180 never kept «עובדי יוסף גבס» (v183's layer)
        // in its own copy, and reads a disk that holds one as damaged. The CLOUD holds it.
        const itsDisk = clone(base.State.schedule);
        Object.keys(itsDisk.days).forEach(date => { delete itsDisk.days[date].yosefGeves; });
        const old = makeDevice({ sources, appVersion: name, deviceId: `d_old_${name}`, storage: { [SCHEDULE]: JSON.stringify(itsDisk) } });
        old.setToday(TODAY);
        old.ctx.askTell = () => Promise.resolve();
        old.ctx.askConfirm = () => Promise.resolve(true);
        old.Sync.pushDelayMs = 5;
        old.State.load();
        old.Sync.connect(cloud.adapter);
        await settled([mine, old]);
        const put = (device, date, worker) => device.State.commit(device.call('assignPlace', device.State.schedule, date, worker, 'actual', 'p_a', undefined, 0)) === true;

        given('before: the old phone records a day', put(old, '2026-10-16', 'w_salim'));
        await settled([mine, old]);
        const cell = answers[name] = {};
        cell.dayBefore = Boolean(cloud.doc.days['2026-10-16']) && old.Sync.status === 'synced';
        same('BEFORE the record is on it records a day under these rules, and says synced', cell.dayBefore, true);

        given('this build turns the record on', (await activate(mine)).state === 'closed');
        await settled([mine]);
        await settle(120);
        const stood = canonical(cloud.doc);
        cell.adopts = [old.Sync.status, Boolean(old.State.schedule.pay && old.State.schedule.pay.po_open),
            old.call('advanceCarryInto', old.State.schedule, 'w_khaled', FORTNIGHT.from)];
        same('MEASURED, what cannot be changed from here: it adopts the document, keeps no pay book in its own copy, and still reads the old walk (Khaled carries 0)',
            cell.adopts.slice(1), [false, 0]);

        given('after: a day is typed on the old phone', put(old, '2026-10-18', 'w_salim'));
        await settle(600);
        cell.dayRefused = !cloud.doc.days['2026-10-18'] && canonical(cloud.doc) === stood;
        same('AFTER: ITS DAY IS REFUSED - not on the server, and the server\'s document is exactly what it was', cell.dayRefused, true);
        cell.says = old.Sync.status;
        check('IT DOES NOT SAY SYNCED, and it still holds the day', old.Sync.status !== 'synced' && old.Sync.pendingCount() > 0
            && Boolean(old.State.schedule.days['2026-10-18'].actual.w_salim), `${old.Sync.status} / ${old.Sync.pendingCount()}`);
        const closing = old.call('closePeriodChanges', old.State.schedule, 'w_salim', FORTNIGHT.from, FORTNIGHT.to, '2026-10-16T12:00:00.000Z', old.id, 0);
        given('a closure is made on it the old way', closing.length > 0 && old.State.commitMany(closing) === true);
        await settle(600);
        cell.closeRefused = canonical(cloud.doc) === stood;
        same('A CLOSURE MADE THE OLD WAY ON IT never reaches the server', cell.closeRefused, true);
        const restoring = old.Sync.replaceEverything(old.call('normaliseSchedule', clone(old.State.schedule)));
        await Promise.race([restoring.catch(() => null), settle(1500)]);
        await settle(300);
        cell.restoreRefused = canonical(cloud.doc) === stood;
        same('ITS RESTORE IS REFUSED: the opening, the closed document and the revision exactly where they were',
            [cell.restoreRefused, Object.keys(cloud.doc.pay), cloud.closed.size], [true, ['po_open'], 1]);
        same('and this build, beside it, goes on recording', (put(mine, '2026-10-19', 'w_nasser'), await settled([mine]), Boolean(cloud.doc.days['2026-10-19'])), true);
    }
    suite('V9b: every one of them answers the same way');
    same('v180, v183, v184 and v186: a day before, yes; a day, an old-style closure and a restore after, refused',
        Object.keys(answers).map(name => [name, answers[name].dayBefore, answers[name].dayRefused, answers[name].closeRefused, answers[name].restoreRefused]),
        [['v180', true, true, true, true], ['v183', true, true, true, true], ['v184', true, true, true, true], ['v186', true, true, true, true]]);
    console.log('  measured, what each older phone says of itself after its write is refused: ' + JSON.stringify(Object.keys(answers).map(name => [name, answers[name].says])));
}

// ------------------------------------------------------------------------------------
{
    suite('V10: the months and the cold store follow the same switch - Phases 5 to 7 on a build with every flag false');

    const base = seed({ id: 'd_v10seed', carry: true });
    const cloud = cloudFor(base);
    const fake = makeIndexedDB();
    const a = join_('d_10a', base, cloud, { indexedDB: fake.indexedDB });
    const b = join_('d_10b', base, cloud, { flags: SHIPS });   // the phone that watches is on the build as it ships
    await settled([a, b]);
    same('before: no database is opened on a phone whose record is not on', [fake.disk.opens, gates(a).cold], [0, false]);
    given('turned on, from the day before Nasser\'s old closure so that every day here is inside tracking',
        (await activate(a, F3.from)).state === 'closed');
    await settled([a, b]);
    const close = async (worker, period, hour = '10', today = TODAY) => {
        const st = stamp(today, a.id, hour);
        const first = a.call('planClosure', S(a), worker, period, { method: 'cash' }, st);
        const choices = { method: 'cash', allocations: {} };
        (first.review ? first.review.advances : []).forEach(row => { choices.allocations[row.advanceId] = row.left; });
        const sized = a.call('planClosure', S(a), worker, period, choices, st);
        given(`the closure of ${worker} ${period.from} is allowed`, sized.ok === true, JSON.stringify(sized.reasons));
        const drawn = a.call('planClosure', S(a), worker, period, Object.assign({ paid: sized.review.netDue, paidOn: today }, choices), st);
        const answer = await a.Sync.transactPaybook(drawn);
        given(`the closure of ${worker} ${period.from} is on the server`, answer.state === 'closed', JSON.stringify(answer));
    };
    await close('w_khaled', F3);                         // the fortnight nobody closed: the whole 500 comes off 700
    await close('w_khaled', FORTNIGHT, '11');
    await close('w_salim', FORTNIGHT);
    await close('w_nasser', FORTNIGHT);
    await close('w_ahmad', WEEK1);
    await close('w_ahmad', WEEK2, '11');
    given('Nasser\'s old closure is answered', (await a.Sync.transactPaybook(
        a.call('planLegacy', S(a), 'w_nasser', F4.from, { state: 'paid' }, at(a, '12')))).state === 'closed');
    await settled([a, b]);
    same('the 500 that today\'s walk hides came off Khaled\'s wage by a person\'s decision, and he owes nothing',
        [a.call('advanceOutstanding', S(a), Object.keys(S(a).advances)[0]).left, a.call('accountFor', S(a), S(a).workers[1], TODAY).debt], [0, 0]);
    const whole = figures(a);

    const closures = await a.Sync.archiveClosed({ today: LATER });
    await settled([a, b]);
    same('PHASE 5 with every one of the three flags false: the settled closures leave the live document',
        [closures.ok, closures.failed, Object.keys(cloud.doc.payIndex.rows).length, Object.keys(cloud.doc.pay)], [true, [], 7, ['po_open']]);
    const months = await a.Sync.archiveMonths({ today: LATER });
    await settled([a, b]);
    same('PHASE 6: the closed months leave it too', [months.ok, months.failed, Object.keys(cloud.doc.monthIndex.rows).sort(),
        Object.keys(cloud.doc.days).filter(date => date < '2026-11')], [true, [], ['2026-09', '2026-10'], []]);
    same('- with «עובדי יוסף גבס» in the month document, beside Rima',
        (doc => [doc.days['2026-10-05'].yosefGeves, doc.days['2026-10-05'].rima])(cloud.months.get(cloud.doc.monthIndex.rows['2026-10'].d)), [{ p_a: 2 }, { p_a: 3 }]);
    same('no figure moved on the phone that did it or the phone that watched', [figures(a) === whole, figures(b) === whole], [true, true]);
    a.said.length = 0;
    same('a day of an archived month is no longer edited - on a build with `months` false', [a.State.commit(a.call('assignPlace', S(a), '2026-10-06', 'w_nasser', 'actual', 'p_b', undefined, 0)), a.said.length], [false, 1]);

    const moved = await a.global('Cold').move();
    same('PHASE 7: this phone moves what has left to its cold store, and the record on its disk shrinks',
        [moved.failed, moved.moved.length, moved.dropped, Object.keys(JSON.parse(a.raw(SCHEDULE)).days).filter(date => date < '2026-11')], [[], 9, true, []]);
    same('memory did not move', figures(a) === whole, true);
    const again = phone('d_10a', { storage: a.dump(), indexedDB: fake.indexedDB });
    again.State.load();
    await again.global('Cold').ready;
    await settle(20);
    same('reopened with no signal, from the two stores: nothing missing, every figure what it was', [again.State.coldMissing(), figures(again) === whole, gates(again)], [[], true, ALL_ON]);
    same('and the phone with no IndexedDB keeps everything in its record', [b.State.coldMissing(), figures(b) === whole], [[], true]);

    // A phone installed afterwards, on the build as it ships.
    const fresh = phone('d_10new', { flags: SHIPS });
    fresh.State.load();
    fresh.Sync.connect(cloud.adapter);
    await settled([fresh]);
    same('A PHONE INSTALLED AFTERWARDS is made whole from the closed and month documents, is on, and computes the same', [gates(fresh).on, figures(fresh) === whole], [true, true]);
}

// ------------------------------------------------------------------------------------
// v190. THE BUILD AS IT SHIPS, asked by itself. The owner's decision 71 (option B,
// 2026-11-11): nobody on any phone sees anything of the pay book until he says so. So the
// build that is served first OFFERS nothing - and, because the phones will not all be on
// the next build at the moment he presses, it HONOURS a record that another phone turned
// on. The two halves are two flags (js/model/schema.js) and are asked apart here.
{
    suite('V13a: THE BUILD AS IT SHIPS on a record nobody turned on - it offers nothing, plans nothing, and computes what v186 computes');

    const git = args => execFileSync('git', ['-C', sourceRoot()].concat(args), { maxBuffer: 64 * 1024 * 1024 });
    const base = seed({ id: 'd_v13seed', carry: true });
    // The server's document AS v186 LEFT IT: no `pay` key at all (v186 has never heard of
    // one). The other fixtures of this suite take the wire form this build makes, which
    // carries an empty map - and the question here is what this build ADDS to the server.
    const asV186Left = () => { const doc = wireOf(base); delete doc.pay; delete doc.payConflicted; delete doc.payIndex; return doc; };
    const cloud = cloudFor(base, { doc: asV186Left() });
    given('the server\'s document holds no `pay` key before this build touches it', !Object.prototype.hasOwnProperty.call(cloud.doc, 'pay'));
    const s = join_('d_13s', base, cloud, { flags: SHIPS });
    await settled([s]);
    const disk = JSON.stringify(s.dump());
    const wrote = cloud.writes.length;
    same('every gate is shut', gates(s), ALL_OFF);
    const drawn = s.call('planActivation', S(s), OPENING, at(s));
    same('THE STEP IS NOT OFFERED: `off`, no report, no opening, no carry plan - there is nothing for a screen to draw',
        [drawn.state, drawn.ok, drawn.report, drawn.opening, drawn.carry, drawn.changes], ['off', false, null, null, null, []]);
    same('NO PLANNER OF THIS BUILD WRITES AN OPENING: refused with `gate`, no change handed back - on any day asked',
        [OPENING, TODAY, '2026-10-09'].map(day => (plan => [plan.ok, plan.reasons, plan.changes.length, plan.activating])(s.call('planOpening', S(s), day, at(s)))),
        [[false, ['gate'], 0, false], [false, ['gate'], 0, false], [false, ['gate'], 0, false]]);
    same('nor the carry approval as part of a step it does not offer', s.call('planCarryApproval', S(s), at(s)).reasons, ['gate']);
    same('every other planner refuses with `gate`', [s.call('planClosure', S(s), 'w_khaled', FORTNIGHT, {}, at(s)).reasons.indexOf('gate') !== -1,
        s.call('planLegacy', S(s), 'w_nasser', F4.from, { state: 'paid' }, at(s)).reasons.indexOf('gate') !== -1,
        s.call('planArchive', S(s), LATER).reasons, s.call('planMonths', S(s), LATER).reasons, s.State.commitPaybook([{ path: 'pay.x', value: {} }]).reasons[0]],
        [true, true, ['gate'], ['gate'], 'gate']);
    await settle(60);
    same('asking all of that wrote nothing: the disk byte for byte, the cloud untouched, the server not asked',
        [JSON.stringify(s.dump()) === disk, cloud.writes.length - wrote, cloud.probes.length], [true, 0, 0]);
    const offering = join_('d_13o', base, null);
    same('every figure anybody reads is the offering build\'s on the same record (which V1 holds to be main\'s)', figures(s) === figures(offering), true);

    // And against v186 ITSELF - its real bytes out of Git - on the same record.
    const NOT_ON_MAIN = ['js/model/payroll.js', 'js/sync/transact.js', 'js/sync/closed.js', 'js/model/months.js', 'js/sync/months.js', 'js/cold.js'];
    const sources = loadOrder().filter(file => NOT_ON_MAIN.indexOf(file) === -1)
        .map(file => ({ file, code: git(['show', `9846d7f:${file}`]).toString('utf8') }));
    const otherCloud = cloudFor(base, { doc: asV186Left() });
    const v186 = makeDevice({ sources, appVersion: 'v186', deviceId: 'd_13v186', storage: { [SCHEDULE]: JSON.stringify(base.State.schedule) } });
    v186.setToday(TODAY);
    v186.ctx.askTell = () => Promise.resolve();
    v186.ctx.askConfirm = () => Promise.resolve(true);
    v186.Sync.pushDelayMs = 5;
    v186.State.load();
    given('the other build is v186, out of Git', (/const APP_VERSION = '([^']+)'/.exec(git(['show', '9846d7f:js/app.js']).toString('utf8')) || [])[1] === 'v186');
    same('EVERY FIGURE IS v186\'s: the pay sheet, the invoice, each man\'s days, Rima, יוסף גבס, what is carried and what is owed, and the days themselves',
        Object.keys(parts(s)).filter(key => JSON.stringify(parts(s)[key]) !== JSON.stringify(parts(v186)[key])), []);

    // WHAT IT WRITES THAT v186 DOES NOT - measured, not argued (the release entry says so):
    // the same day typed on each, each on a cloud of its own holding the same document.
    v186.Sync.connect(otherCloud.adapter);
    await settled([v186]);
    const day = device => device.State.commit(device.call('assignPlace', device.State.schedule, '2026-10-16', 'w_salim', 'actual', 'p_a', undefined, 0)) === true;
    const before = [cloud.writes.length, otherCloud.writes.length];
    given('the same day is typed on both', day(s) && day(v186));
    await settled([s, v186]);
    const sent = (one, from) => one.writes.slice(from).filter(write => !write.replayed);
    const mine = sent(cloud, before[0]);
    const theirs = sent(otherCloud, before[1]);
    const ENVELOPE = ['updatedAt', 'updatedBy', 'protocol', 'revision', 'lastOpId', 'opFingerprint'];
    const business = write => Object.keys(write.patch || {}).filter(key => ENVELOPE.indexOf(key) === -1).sort();
    same('one write each, of the same kind, carrying the same ONE field path - and no path under `pay`',
        [mine.map(write => write.kind), theirs.map(write => write.kind), mine.map(business), theirs.map(business)],
        [['update'], ['update'], [['days.2026-10-16.actual.w_salim']], [['days.2026-10-16.actual.w_salim']]]);
    same('THE ONE DIFFERENCE ON THE WIRE: this build says protocol 2 where v186 says 1 (as every build of the pay book\'s branch since v175: "I keep the pay book")',
        [mine[0].patch.protocol, theirs[0].patch.protocol], [2, 1]);
    same('the server\'s document after it: the day is there, the protocol is 2, and NO `pay` MAP WAS WRITTEN onto a record nobody turned on',
        [Boolean(cloud.doc.days['2026-10-16']), cloud.doc.protocol, Object.prototype.hasOwnProperty.call(cloud.doc, 'pay'),
            Object.prototype.hasOwnProperty.call(cloud.doc, 'payIndex'), cloud.closed.size], [true, 2, false, false, 0]);
    same('on its own DISK the record carries an empty pay map, as every build that keeps the pay book does - a key on this phone, not on the server',
        (stored => [stored.pay, Object.prototype.hasOwnProperty.call(JSON.parse(v186.raw(SCHEDULE)), 'pay')])(JSON.parse(s.raw(SCHEDULE))), [{}, false]);
    console.log('  measured, the document this build would send WHOLE (only a restore does) holds beyond v186\'s: '
        + JSON.stringify(Object.keys(s.call('cloudDocument', S(s))).filter(key => !Object.prototype.hasOwnProperty.call(v186.call('cloudDocument', v186.State.schedule), key))));
}

{
    suite('V13b: THE BUILD AS IT SHIPS IS HANDED A RECORD ANOTHER PHONE TURNED ON - it is on, wholly, with the step never offered to it');

    const base = seed({ id: 'd_v13bseed', carry: false, oldClosure: true });
    const cloud = cloudFor(base);
    const owner = join_('d_13owner', base, cloud);                       // the build that offers
    const s = join_('d_13fore', base, cloud, { flags: SHIPS });          // v190, with signal
    const t = join_('d_13third', base, null, { flags: SHIPS });          // v190, no signal
    await settled([owner, s]);
    const before = figures(s);
    given('before: one record, nobody on, and the shipped build offers nothing',
        figures(owner) === before && !gates(s).on && s.call('planActivation', S(s), OPENING, at(s)).state === 'off');
    given('the owner turns the record on, from the build that offers', (await activate(owner)).state === 'closed');
    await settled([owner, s]);

    same('THE SHIPPED BUILD IS ON - the pay book, the one-debt ruling, the months and the cold store - by the record alone', gates(s), ALL_ON);
    same('with `paybookActivation` false in its flags: the honouring is not behind the offer',
        (flags => [flags.paybookActivation, flags.paybookHonour, flags.paybook, flags.months, flags.cold])(s.global('FARKAD_FLAGS')), [false, true, false, false, false]);
    same('ONE ARITHMETIC: every figure on it is the figure on the phone that pressed, and not what it read before', [figures(s) === figures(owner), figures(s) === before], [true, false]);
    same('Khaled owes 500 going into the open fortnight on both; the card and the accounts page agree on it',
        [owner, s].map(d => [d.call('advanceCarryInto', S(d), 'w_khaled', FORTNIGHT.from), d.call('openAdvanceBalance', S(d), 'w_khaled').total,
            d.call('accountFor', S(d), S(d).workers[1], TODAY).debt]), [[500, 500, 500], [500, 500, 500]]);
    same('it SAYS so: the plan a screen would draw is `on`, since the day; and its own opening plan is the same fact, written already',
        [(plan => [plan.state, plan.since, plan.report])(s.call('planActivation', S(s), OPENING, at(s))),
            (plan => [plan.ok, plan.already, plan.changes.length])(s.call('planOpening', S(s), OPENING, at(s))),
            s.call('planOpening', S(s), '2026-09-18', at(s)).reasons], [['on', OPENING, null], [true, true, 0], ['opened']]);
    same('the accounts home takes the «מקדמות» tab on it (the screens ask the same one question)', s.call('paybookWritesEnabled', S(s)), true);

    // FULLY on: it CLOSES AND PAYS through the pay book, by the server-first door.
    const st = at(s, '11');
    const first = s.call('planClosure', S(s), 'w_salim', FORTNIGHT, { method: 'cash', allocations: {} }, st);
    given('the shipped build plans a closure', first.ok === true, JSON.stringify(first.reasons));
    const closure = await s.Sync.transactPaybook(s.call('planClosure', S(s), 'w_salim', FORTNIGHT,
        { method: 'cash', allocations: {}, paid: first.review.netDue, paidOn: TODAY }, st));
    await settled([owner, s]);
    same('IT CLOSES AN ACCOUNT THROUGH THE PAY BOOK: one transaction, on the server, adopted by the phone that pressed the button',
        [closure.state, Object.keys(cloud.doc.pay).filter(id => id.indexOf('ps_w_salim') === 0).length, cloud.closed.size >= 2,
            canonical(S(owner).pay) === canonical(S(s).pay), figures(owner) === figures(s)], ['closed', 1, true, true, true]);
    const legacy = await s.Sync.transactPaybook(s.call('planLegacy', S(s), 'w_nasser', F4.from, { state: 'paid' }, at(s, '12')));
    await settled([owner, s]);
    same('and answers an old closure', [legacy.state, owner.call('planPayMigration', S(owner), TODAY).paymentUnknown.length], ['closed', 0]);
    same('its ordinary days go on, at protocol 2, beside the pay book', [s.State.commit(s.call('assignPlace', S(s), '2026-10-16', 'w_ahmad', 'actual', 'p_a', undefined, 0)),
        (await settled([owner, s]), s.Sync.status), Boolean(cloud.doc.days['2026-10-16']), Object.keys(cloud.doc.pay).indexOf('po_open') !== -1], [true, 'synced', true, true]);
    same('nobody is stopped, nothing is held, no intent is left', [owner, s].map(d => [d.call('farkadWritesBlocked'), d.Sync.heldRecords().length, d.Sync.payIntent(), d.Sync.pendingCount()]),
        [[false, 0, null, 0], [false, 0, null, 0]]);
    const again = phone(s.id, { storage: s.dump(), flags: SHIPS });
    again.State.load();
    same('closed and opened again with no signal, from its own disk: still on, the same figures', [gates(again), figures(again) === figures(s)], [ALL_ON, true]);

    same('THE THIRD PHONE, also as shipped, has not heard: not on, for the whole record', [gates(t), figures(t) === before], [ALL_OFF, true]);
    t.Sync.connect(cloud.adapter);
    await settled([t]);
    same('- and the moment it hears it is on, with the others\' figures, having been offered nothing at any point', [gates(t), figures(t) === figures(owner)], [ALL_ON, true]);

    // The way back from THIS build is the honouring's own flag - and only that.
    const back = phone(s.id, { storage: s.dump(), flags: { paybookHonour: false } });
    back.State.load();
    same('THE WAY BACK is `paybookHonour: false`, by itself: every gate shut on the activated record, the opening still held',
        [gates(back), Object.keys(S(back).pay).indexOf('po_open') !== -1, back.call('planClosure', S(back), 'w_nasser', FORTNIGHT, {}, at(back)).reasons], [ALL_OFF, true, ['gate']]);
}

// ------------------------------------------------------------------------------------
// v190. THE TRACKING DAY THE OWNER CHOSE (decision 75, 2026-11-11): 2026-10-30, the first
// day of the fortnight that was current as he answered - and the day he presses the
// button is LATER, possibly after that fortnight has ended and pay day has passed. So:
// some men's accounts for 30/10-12/11 are by then CLOSED THE OLD WAY, one is not, and
// there are advances inside it. This is that record, walked with its figures.
//
//   AHMAD   weekly    300 a day   both weeks closed the old way; 400 taken 2/11, deducted in week 1
//   OMAR    weekly    250 a day   week 1 closed the old way; week 2 NOT closed; 300 taken 9/11
//   KHALED  biweekly  350 a day   closed the old way: 4,200, 1,000 taken 3/11 and deducted; 200 more on 13/11
//   NASSER  biweekly  500 a day   closed the old way: 6,000, 7,000 taken 4/11, 6,000 deducted, 1,000 carried
//   SALIM   biweekly  400 a day   NOT closed: 4,800, 800 taken 5/11
{
    const DAY = '2026-11-14';                                    // the day he presses: a Saturday, the next fortnight's second day
    const DECIDED = '2026-10-30';
    const P = { from: '2026-10-30', to: '2026-11-12' };
    const WK1 = { from: '2026-10-30', to: '2026-11-05' };
    const WK2 = { from: '2026-11-06', to: '2026-11-12' };
    const NEXT = { from: '2026-11-13', to: '2026-11-26' };
    const WORKED = ['2026-10-30', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05',
        '2026-11-06', '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'];
    const MEN = ['w_ahmad', 'w_omar', 'w_khaled', 'w_nasser', 'w_salim'];
    const now = (device, hour = '10') => stamp(DAY, device.id, hour);

    // (The suite's line stands above its fixtures: a given() in them is then inside a
    // suite whose checks are below it, which is what tests/nonassertions.test.mjs asks.)
    suite('V14a: the day the screen offers - the day the owner decided, once it has come; and never a day he did not choose');

    function record() {
        const d = phone('d_v14seed', { today: DAY });
        const schedule = d.State.schedule;
        schedule.workers = [
            { id: 'w_ahmad', name: 'אחמד', active: true, dailyRate: 300, hourlyRate: 0, payCycles: '2026-09-11=weekly' },
            { id: 'w_omar', name: 'עומר', active: true, dailyRate: 250, hourlyRate: 0, payCycles: '2026-09-11=weekly' },
            { id: 'w_khaled', name: 'חאלד', active: true, dailyRate: 350, hourlyRate: 0 },
            { id: 'w_nasser', name: 'נאסר', active: true, dailyRate: 500, hourlyRate: 0 },
            { id: 'w_salim', name: 'סלים', active: true, dailyRate: 400, hourlyRate: 0 }
        ];
        schedule.places = SITES();
        given('the roster is committed', d.State.commitRoster() === true);
        WORKED.forEach(day => MEN.forEach(man => given(`a day is recorded (${man} ${day})`,
            d.State.commit(d.call('assignPlace', d.State.schedule, day, man, 'actual', 'p_a', undefined, 0)) === true)));
        const advance = (man, day, sum) => given(`an advance is recorded (${man} ${sum})`, d.State.commitMany(
            d.call('recordNewAdvance', d.State.schedule, man, day, sum, 'בדיקה', `${day}T09:00:00.000Z`, d.id, 'cash')) === true);
        advance('w_ahmad', '2026-11-02', 400);
        advance('w_omar', '2026-11-09', 300);
        advance('w_khaled', '2026-11-03', 1000);
        advance('w_nasser', '2026-11-04', 7000);
        advance('w_salim', '2026-11-05', 800);
        given('the carry is approved, long ago', d.State.commitMany([d.call('recordCarryApproval', d.State.schedule,
            d.call('planCarryMigration', d.State.schedule), '2026-09-01T08:00:00.000Z', d.id)]) === true);
        // THE OLD DIALOG'S WRITER, on pay day, with the deduction it proposes by itself.
        const closeOld = (man, period, when) => given(`${man} ${period.from} is closed the old way`, (changes =>
            changes.length > 0 && d.State.commitMany(changes) === true)(
            d.call('closePeriodChanges', d.State.schedule, man, period.from, period.to, when, d.id, undefined)));
        closeOld('w_ahmad', WK1, '2026-11-06T08:00:00.000Z');
        closeOld('w_ahmad', WK2, '2026-11-13T08:00:00.000Z');
        closeOld('w_omar', WK1, '2026-11-06T08:00:00.000Z');
        closeOld('w_khaled', P, '2026-11-13T08:00:00.000Z');
        closeOld('w_nasser', P, '2026-11-13T08:00:00.000Z');
        advance('w_khaled', '2026-11-13', 200);
        return d;
    }
    // What each man reads: what he owes going into the fortnight that is open, the figure
    // on his card, each advance [day, given, deducted, left], and his closures
    // [from, to, wage, deducted, left over].
    const reads = device => S(device).workers.map(man => ({
        man: man.id,
        carried: device.call('advanceCarryInto', S(device), man.id, NEXT.from),
        card: (device.call('openAdvanceBalance', S(device), man.id) || { total: 0 }).total || 0,
        advances: Object.keys(S(device).advances).map(id => S(device).advances[id]).filter(one => one.workerId === man.id)
            .sort((x, y) => (x.date < y.date ? -1 : 1))
            .map(one => (left => [one.date, left.given, left.deducted, left.left])(device.call('advanceOutstanding', S(device), one.id))),
        closed: (closed => Object.keys(closed).sort().map(from => [from, closed[from].periodTo, closed[from].gross, closed[from].deducted]))(
            device.call('closedPeriods', S(device), man.id) || {})
    }));
    const sheets = device => JSON.stringify([device.call('payrollReport', S(device), '2026-10-01', '2026-11-30'),
        device.call('payrollReport', S(device), P.from, P.to), device.call('payrollReport', S(device), NEXT.from, NEXT.to),
        device.call('invoiceReport', S(device), '2026-10-01', '2026-11-30'), S(device).days]);
    const turnedOn = async (id, base, day) => {
        const cloud = cloudFor(base);
        const device = join_(id, base, cloud, { today: DAY });
        await settled([device]);
        const plan = device.call('planOpening', S(device), day, now(device));
        given(`the opening on ${day} is allowed, asked on ${DAY}`, plan.ok === true && (await device.Sync.activationRefusal()) === null, JSON.stringify(plan.reasons));
        given('the record is turned on', (await device.Sync.transactPaybook(plan)).state === 'closed');
        await settled([device]);
        return { cloud, device };
    };

    const any = phone('d_v14any');
    same('the decided day is 2026-10-30, a Friday that opens a fortnight for a fortnightly man and a week for a weekly one',
        [any.global('PAYBOOK_TRACKING_DAY_DECIDED'), (range => [range.from, range.to, range.cycle])(any.call('periodRangeFor', {}, DECIDED)),
            (range => [range.from, range.to, range.cycle])(any.call('periodRangeFor', { payCycles: '2026-09-11=weekly' }, DECIDED))],
        [DECIDED, [P.from, P.to, 'biweekly'], [WK1.from, WK1.to, 'weekly']]);
    same('BEFORE that day has come, the offer is what it was: the first day of the fortnight that holds today',
        ['2026-10-15', '2026-10-16', '2026-10-29'].map(day => any.call('paybookTrackingDefault', day)), ['2026-10-02', '2026-10-16', '2026-10-16']);
    same('FROM that day on it is that day - inside its own fortnight, in the next one (where "the fortnight that holds today" would say 13/11), and months later',
        ['2026-10-30', '2026-11-11', '2026-11-12', '2026-11-13', DAY, '2026-11-27', '2027-01-10'].map(day => any.call('paybookTrackingDefault', day)),
        [DECIDED, DECIDED, DECIDED, DECIDED, DECIDED, DECIDED, DECIDED]);
    same('a day that is not a day offers nothing', [any.call('paybookTrackingDefault', 'soon'), any.call('paybookTrackingDefault', null)], [null, null]);

    suite('V14b: activated on 14/11 with the tracking day 30/10 - the fortnight that has ended, closed the old way for some and for one not');

    const base = record();
    const before = { reads: reads(base), sheets: sheets(base) };
    same('BEFORE, the old arithmetic: what was closed the old way is on its closures; what was not is assumed to have come off a wage nobody closed (Omar and Salim carry 0 and their cards say 300 and 800)',
        before.reads, [
            { man: 'w_ahmad', carried: 0, card: 0, advances: [['2026-11-02', 400, 400, 0]], closed: [[WK1.from, WK1.to, 1800, 400], [WK2.from, WK2.to, 1800, 0]] },
            { man: 'w_omar', carried: 0, card: 300, advances: [['2026-11-09', 300, 0, 300]], closed: [[WK1.from, WK1.to, 1500, 0]] },
            { man: 'w_khaled', carried: 0, card: 200, advances: [['2026-11-03', 1000, 1000, 0], ['2026-11-13', 200, 0, 200]], closed: [[P.from, P.to, 4200, 1000]] },
            { man: 'w_nasser', carried: 1000, card: 1000, advances: [['2026-11-04', 7000, 6000, 1000]], closed: [[P.from, P.to, 6000, 6000]] },
            { man: 'w_salim', carried: 0, card: 800, advances: [['2026-11-05', 800, 0, 800]], closed: [] }
        ]);
    const drawn = base.call('planActivation', S(base), base.call('paybookTrackingDefault', DAY), now(base));
    same('THE SCREEN, on 14/11: it offers 30/10 as the decided day, the step is allowed, and that day strands nothing',
        [drawn.state, drawn.ok, drawn.reasons, drawn.opening.changes.map(change => change.value.date), drawn.report.tracking],
        ['offered', true, [], [DECIDED], { offered: DECIDED, decided: true, asked: DECIDED, stranded: [] }]);
    same('what it tells him will read differently: the two men nobody closed - Omar 0 to 300, Salim 0 to 800 - and nobody who was closed',
        drawn.report.debt.map(row => [row.workerId, row.old, row.new]), [['w_omar', 0, 300], ['w_salim', 0, 800]]);
    same('and the old closures that will wait for an answer: five (Ahmad two, Omar one, Khaled, Nasser); the periods nobody closed: two', [drawn.report.legacy.paymentUnknown, drawn.report.legacy.unclosed], [5, 2]);

    const { device: a } = await turnedOn('d_v14a', base, DECIDED);
    const after = reads(a);
    same('AFTER: every closure made the old way is what it was - its wage, its deduction, what it left over - and nothing is taken twice',
        after.map(row => row.closed), before.reads.map(row => row.closed));
    same('every advance has the SAME given / deducted / left as before: Khaled\'s 1,000 is not owed again, Nasser owes the same 1,000, Ahmad nothing',
        after.map(row => row.advances), before.reads.map(row => row.advances));
    same('the card figures did not move', after.map(row => row.card), before.reads.map(row => row.card));
    same('THE ONE THING THAT MOVED: what Omar and Salim carry into the open fortnight - 300 and 800, the advances of a period nobody closed, now a debt until somebody deducts it',
        after.map(row => [row.man, row.carried]), [['w_ahmad', 0], ['w_omar', 300], ['w_khaled', 0], ['w_nasser', 1000], ['w_salim', 800]]);
    same('no day, no wage, no pay sheet over any range asked and no invoice line moved', sheets(a) === before.sheets, true);
    same('the sum of what the five owe on advances: 2,300 before by their cards, 2,300 after on the accounts page - nothing lost, nothing doubled',
        [before.reads.reduce((sum, row) => sum + row.card, 0), a.call('accountsList', S(a), DAY).totals.debt], [2300, 2300]);

    const rows = a.call('accountsList', S(a), DAY).rows.map(row => ({ man: row.workerId, status: row.status, tracking: row.tracking.from, debt: row.debt, wageDue: row.wageDue,
        pending: row.pending.map(one => [one.from, one.to, one.gross]), before: row.beforeTracking.length,
        old: row.paymentUnknown.map(one => [one.periodFrom, one.periodTo, one.gross, one.deducted]) }));
    same('THE ACCOUNTS PAGE: tracking from 30/10 for every man; the old closures on «סגירות ישנות לבדיקה» with their own figures; the two unclosed periods WAITING INSIDE tracking; nothing before it',
        rows, [
            { man: 'w_ahmad', status: 'waiting', tracking: DECIDED, debt: 0, wageDue: 0, pending: [], before: 0, old: [[WK1.from, WK1.to, 1800, 400], [WK2.from, WK2.to, 1800, 0]] },
            { man: 'w_omar', status: 'waiting', tracking: DECIDED, debt: 300, wageDue: 0, pending: [[WK2.from, WK2.to, 1500]], before: 0, old: [[WK1.from, WK1.to, 1500, 0]] },
            { man: 'w_khaled', status: 'waiting', tracking: DECIDED, debt: 200, wageDue: 0, pending: [], before: 0, old: [[P.from, P.to, 4200, 1000]] },
            { man: 'w_nasser', status: 'waiting', tracking: DECIDED, debt: 1000, wageDue: 0, pending: [], before: 0, old: [[P.from, P.to, 6000, 6000]] },
            { man: 'w_salim', status: 'waiting', tracking: DECIDED, debt: 800, wageDue: 0, pending: [[P.from, P.to, 4800]], before: 0, old: [] }
        ]);
    same('an account closed the old way cannot be closed a second time through the pay book - refused with `closed`, for a fortnightly man and a weekly one',
        [a.call('planClosure', S(a), 'w_khaled', P, { method: 'cash', allocations: {} }, now(a)).reasons,
            a.call('planClosure', S(a), 'w_ahmad', WK1, { method: 'cash', allocations: {} }, now(a)).reasons], [['closed'], ['closed']]);
    same('and it asks NOTHING of him by force: nobody is «לבדיקה», nothing is held, no closure is blocked by an unanswered old one',
        [rows.filter(row => row.status === 'review').length, a.call('farkadWritesBlocked'), a.Sync.heldRecords().length], [0, false, 0]);

    // The man nobody closed: his fortnight is closed through the new page, the advance comes off.
    const offer = a.call('planClosure', S(a), 'w_salim', P, { method: 'cash', allocations: {} }, now(a, '11'));
    same('SALIM, not closed: the review page offers his fortnight - 4,800, and the 800 on its one advance - and waits for a person to say how much comes off',
        [offer.reasons, offer.review.gross, offer.review.advances.map(one => [one.date, one.left, one.offered])], [['allocation-missing'], 4800, [['2026-11-05', 800, true]]]);
    const choice = { method: 'cash', allocations: { [offer.review.advances[0].advanceId]: 800 } };
    const sized = a.call('planClosure', S(a), 'w_salim', P, choice, now(a, '11'));
    const closed = await a.Sync.transactPaybook(a.call('planClosure', S(a), 'w_salim', P, Object.assign({ paid: sized.review.netDue, paidOn: DAY }, choice), now(a, '11')));
    await settled([a]);
    same('closed through the pay book: 4,800 less 800 is 4,000 paid; he owes nothing, carries nothing, and nothing of his waits',
        [closed.state, sized.review.netDue, (row => [row.debt, row.wageDue, row.pending.length])(a.call('accountFor', S(a), S(a).workers[4], DAY)),
            a.call('advanceCarryInto', S(a), 'w_salim', NEXT.from)], ['closed', 4000, [0, 0, 0], 0]);
    const answered = await a.Sync.transactPaybook(a.call('planLegacy', S(a), 'w_khaled', P.from, { state: 'paid' }, now(a, '12')));
    await settled([a]);
    same('an old closure is answered when convenient - «שולם» - and leaves the list; the others stay, blocking nothing',
        [answered.state, a.call('planPayMigration', S(a), DAY).paymentUnknown.map(row => row.workerId).sort()], ['closed', ['w_ahmad', 'w_ahmad', 'w_nasser', 'w_omar']]);

    suite('V14c: the same record with the LATER day - 13/11, what the screen would have offered by itself - strands the periods nobody closed');

    const later = base.call('planActivation', S(base), NEXT.from, now(base));
    same('THE SCREEN SAYS SO BEFORE ANYTHING IS WRITTEN: asked 13/11 where 30/10 is offered, two periods would be stranded - Omar\'s week and Salim\'s fortnight',
        [later.ok, later.report.tracking.offered, later.report.tracking.asked, later.report.tracking.stranded.map(row => [row.workerId, row.from, row.to, row.gross])],
        [true, DECIDED, NEXT.from, [['w_omar', WK2.from, WK2.to, 1500], ['w_salim', P.from, P.to, 4800]]]);
    const { device: b } = await turnedOn('d_v14b', base, NEXT.from);
    same('every figure is the same as under 30/10 - the debts, the old closures, the sheets: the day changes no arithmetic',
        [canonical(reads(b)) === canonical(after), sheets(b) === before.sheets], [true, true]);
    same('KNOWN, and why 30/10 is the safer day: Salim\'s fortnight and Omar\'s week are BEFORE tracking, the review page refuses them, and no other door closes an account on a record that is on',
        [(row => [row.pending.length, row.beforeTracking.map(one => [one.from, one.gross])])(b.call('accountFor', S(b), S(b).workers[4], DAY)),
            b.call('planClosure', S(b), 'w_salim', P, choice, now(b, '11')).reasons, b.call('planClosure', S(b), 'w_omar', WK2, { method: 'cash', allocations: {} }, now(b, '11')).reasons.indexOf('before-tracking') !== -1],
        [[0, [[P.from, 4800]]], ['before-tracking'], true]);
    same('- so his 800 stays a debt that only a «החזר» can settle, and the day cannot be moved afterwards',
        [b.call('accountFor', S(b), S(b).workers[4], DAY).debt, b.call('planOpening', S(b), DECIDED, now(b)).reasons], [800, ['opened']]);
}

// ------------------------------------------------------------------------------------
{
    suite('V11: the one function - no other line reads the three flags');

    const files = [];
    const walk = dir => readdirSync(join(ROOT, dir), { withFileTypes: true }).forEach(entry => {
        if (entry.isDirectory()) walk(join(dir, entry.name));
        else if (/\.js$/.test(entry.name)) files.push(join(dir, entry.name));
    });
    walk('js');
    const reads = [];
    files.sort().forEach(file => readFileSync(join(ROOT, file), 'utf8').split('\n').forEach(line => {
        if (/^\s*\/\//.test(line)) return;
        const found = line.match(/FARKAD_FLAGS\.(paybook|months|cold)\b/g);
        if (found) found.forEach(read => reads.push(`${file} ${read}`));
    }));
    same('every read of FARKAD_FLAGS.paybook, .months and .cold in what ships: the three predicates in the schema, and the fallback beside each of their three callers',
        reads, [
            'js/cold.js FARKAD_FLAGS.cold',
            'js/model/months.js FARKAD_FLAGS.months', 'js/model/months.js FARKAD_FLAGS.paybook',
            'js/model/payroll.js FARKAD_FLAGS.paybook',
            'js/model/schema.js FARKAD_FLAGS.paybook', 'js/model/schema.js FARKAD_FLAGS.months',
            'js/model/schema.js FARKAD_FLAGS.paybook', 'js/model/schema.js FARKAD_FLAGS.cold'
        ]);
    const schema = readFileSync(join(ROOT, 'js/model/schema.js'), 'utf8');
    // MOVED AT v190, deliberately: «the step ships offered» (`paybookActivation: true`) is
    // «the step ships NOT offered, and the honouring ships on» - the owner's decision 71.
    check('the three flags ship false, the step ships NOT offered, and an opening on the record ships honoured',
        /\n\s*paybook: false,/.test(schema) && /\n\s*months: false,/.test(schema)
        && /\n\s*cold: false,/.test(schema) && /\n\s*paybookActivation: false,\n/.test(schema) && /\n\s*paybookHonour: true\n/.test(schema)
        && !/paybook: true|months: true|cold: true|paybookActivation: true/.test(schema));
    same('the honouring reads its own flag and the offer reads its own - in the source',
        [/function paybookActivated\(schedule\) \{\n    if \(!paybookHonoured\(\)\) return false;/.test(schema),
            /function paybookHonoured\(\) \{\n    return FARKAD_FLAGS\.paybookHonour === true;/.test(schema),
            /function paybookActivationOffered\(\) \{\n    return FARKAD_FLAGS\.paybookActivation === true;/.test(schema),
            (schema.split('\n').filter(line => !/^\s*\/\//.test(line)).join('\n').match(/FARKAD_FLAGS\.paybookActivation\b/g) || []).length], [true, true, true, 1]);
    const called = files.filter(file => /\b(paybookWritesEnabled|monthWritesEnabled|advanceDebtStays)\(\)/.test(
        readFileSync(join(ROOT, file), 'utf8').split('\n').filter(line => !/^\s*\/\//.test(line)).join('\n')));
    same('and nobody asks a gate without handing it the record', called, []);
    const one = phone('d_v11');
    same('a record with an entry under the opening\'s name that this build could not have written is NOT an activation',
        [{ pay: { po_open: { id: 'po_open', kind: 'opening', date: 'soon', at: 'x', by: 'y' } } },
            { pay: { po_open: { id: 'po_open', kind: 'statement', date: OPENING } } },
            { pay: { po_open: null } }, { pay: [] }, {}, null,
            { pay: Object.create({ po_open: { id: 'po_open', kind: 'opening', date: OPENING, at: '2026-10-09T10:00:00.000Z', by: 'd' } }) }
        ].map(record => one.call('paybookOn', record)), [false, false, false, false, false, false, false]);
    same('and one it could have, is', one.call('paybookOn', { pay: { po_open: { id: 'po_open', kind: 'opening', date: OPENING,
        at: '2026-10-09T10:00:00.000Z', by: 'd' } } }), true);
}

// ------------------------------------------------------------------------------------
{
    suite('V12: the rules file a person pastes - the published file with lines ADDED, and nothing else');

    const published = readFileSync(join(ROOT, 'docs/firestore.rules.before-paybook'), 'utf8').split('\n');
    const pasted = readFileSync(join(ROOT, 'firestore.rules'), 'utf8').split('\n');
    // Every line of the published file is in the new one, in the same order: nothing that
    // is enforced today was removed or reworded. (The emulator suite holds that the
    // published file is main's, byte for byte.)
    let at = 0;
    const missing = [];
    published.forEach(line => {
        const found = pasted.indexOf(line, at);
        if (found === -1) missing.push(line); else at = found + 1;
    });
    same('NOT ONE LINE of the rules published today is removed or changed', missing, []);
    same('what is added: 380 lines', pasted.length - published.length, 380);
    const added = pasted.join('\n');
    same('the additions, by name: the pay map, the index of closures, the months, the record that is on, and the three kinds of document',
        ['function payGuard(docId)', 'function indexGuard(docId)', 'function indexedNeedsPaybook()', 'function daysGuard()',
            'function monthGuard(docId)', 'function monthsNeedPaybook()', 'function activatedNeedsPaybook()', 'function payGuardOnCreate(docId)',
            'function indexGuardOnCreate()', 'function monthGuardOnCreate()', 'match /closed/{entryId}', 'match /months/{monthId}', 'match /probe/{generation}']
            .filter(name => added.includes(name) && !published.join('\n').includes(name)).length, 13);
    same('who may read and write is the same list, to the letter', (text => (/function allowed\(\) \{[\s\S]*?\n    \}/.exec(text) || [''])[0])(added)
        === (text => (/function allowed\(\) \{[\s\S]*?\n    \}/.exec(text) || [''])[0])(published.join('\n')), true);
    // v190 MOVED: «the place another block of documents under the schedule is added: after
    // probe/, before the schedule's closing brace» pinned an EMPTY place. The other block
    // has arrived - the shared rides' match /transport/{name}, live since v185 - and it is
    // in that place, so the pin is now of what stands there: the probe block, then the
    // transport block WORD FOR WORD as the live file holds it, then the brace that closes
    // the schedule. (tools/combine-rules.py put it there; nothing of it was retyped.)
    const probeBlock = "      match /probe/{generation} {\n        allow get: if allowed() && generation == 'paybook-8';\n        allow list, create, update, delete: if false;\n      }\n";
    const blockOf = text => {
        const from = text.indexOf('\n\n      // הסעות, shared: who rides to work in which vehicle.');
        const to = from === -1 ? -1 : text.indexOf('\n    }\n', from);       // the brace that closes the schedule
        return to > from ? text.slice(from, to) : null;
    };
    const liveBlock = blockOf(published.join('\n'));
    given('the live rules hold the shared rides\' block', liveBlock !== null && liveBlock.includes('match /transport/{name} {'));
    same('the shared rides\' block is in the pasted file word for word as it is live today',
        blockOf(added) === liveBlock, true);
    check('and it stands after probe/, the last of the pay book\'s blocks, and before the schedule\'s closing brace',
        added.includes(probeBlock + liveBlock.slice(1) + '\n    }\n'));
    same('the pay book\'s rules do not name the shared rides, and the rides\' block does not name the pay book',
        [/transport/i.test(added.replace(liveBlock, '').replace(/\/\/.*$/gm, '')), /\bpay\b|payIndex|monthIndex|closed\/|probe/.test(liveBlock.replace(/\/\/.*$/gm, ''))],
        [false, false]);
    same('the app asks for the generation the rules answer to', [/RULES_GENERATION: 'paybook-8'/.test(readFileSync(join(ROOT, 'js/sync/transact.js'), 'utf8')),
        (added.match(/paybook-8/g) || []).length >= 2], [true, true]);
}

report();
