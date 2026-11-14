// Two phones closing ONE period in the same second (the owner's problem (b), 2026-11-14).
//
//   node tests/closerace.test.mjs
//
// THE FINDING (tests/weeklyclose.test.mjs W12 on the weekly-close branch, measured and
// printed there): both phones synced, one closes a man's period, the other has not heard
// it yet and closes the same period with a different amount. The server keeps the first
// (the compare-and-set refuses the second) - and the second phone ends in 'error', with a
// record held aside, a write still queued and every write blocked until a person exports a
// backup and looks. The money is right on the server; the phone that lost is stuck.
//
// A closure's ids are derived from what it closes (le_period_<man>_<from>,
// le_close_<advance>_<from>), so "the same period closed twice" is always the same ids. Two
// phones that close it with the SAME numbers already settle as one fact (sameLedgerFact).
// With DIFFERENT numbers the period is still closed exactly once - by whoever landed first
// - and the honest answer on the phone that lost is "it is already closed; here is what
// was recorded", not a dispute about money nobody has.
//
// THE CURE, on the client (js/model/ledger.js closureLostTo, js/sync/receive.js,
// js/sync/send.js): a close of this phone's that meets a DIFFERENT close of the same man
// and the same period already on the record is dropped WHOLE - the period's record and
// every deduction of the same close, so the server's close is never mixed with a part of
// this one - its bytes are put aside on this phone (farkad:closureAside:*, never the
// record), it is not sent, and the person is told once. Nothing else is: a different
// ADVANCE, a repayment, a correction under one id still holds exactly as before.
//
//   R1  the race, A takes 900 and B takes 0: B ends synced, nothing held or queued, not
//       blocked; the cloud and B hold A's close and only it; B's copy put aside; one
//       sentence.
//   R2  the race the other way, A takes 0 and B takes 900: B's DEDUCTION, which the cloud
//       has no record of under its id, is not sent either - the cloud never carries A's
//       payslip beside B's money.
//   R3  the same numbers: one fact, as before (nothing put aside, nothing said).
//   R4  B hears A before it sends (the snapshot first): the same end.
//   R5  NOT a closure: two bodies under one advance id are still held, as before.
//   R6  ACROSS BUILDS (v195 on its own bytes): this build losing to v195 is cured; v195
//       losing to this build is stuck exactly as before - the cure is the loser's.
//
// No browser, no emulator: the harness's cloud speaks the adapter's contract.

import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeDevice, makeCloud, settle, settleUntil, sourceRoot, loadOrder } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

process.env.TZ = 'Asia/Jerusalem';
const j = value => JSON.stringify(value);

const P = ['2026-08-07', '2026-08-20'];
function seedDoc() {
    const record = {
        schemaVersion: 2,
        workers: [{ id: 'w_1', name: 'גסאן', dailyRate: 450, hourlyRate: 0, active: true }],
        places: [{ id: 'p_1', name: 'אתר צפון', active: true }],
        days: {}, vehicles: [], advances: {},
        ledger: { advances: {}, unreadable: {},
            migrations: { cm_carry: { id: 'cm_carry', kind: 'carry', rows: 0, at: '', by: 'd' } } }
    };
    for (let n = 0; n < 14; n += 1) {
        const at = new Date(2026, 7, 7 + n, 12);
        if (at.getDay() === 6) continue;
        const date = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
        record.days[date] = { plan: {}, actual: { w_1: { entries: [{ placeId: 'p_1' }], rates: { daily: 450, hourly: 0 } } } };
    }
    record.advances.adv_1 = { id: 'adv_1', workerId: 'w_1', date: '2026-08-10', amount: 900, note: '' };
    record.ledger.advances.le_mig_adv_1 = { id: 'le_mig_adv_1', advanceId: 'adv_1', kind: 'given', workerId: 'w_1',
        date: '2026-08-10', amount: 900, note: '', at: '2026-08-10T07:00:00.000Z', by: 'd' };
    return Object.assign(record, { protocol: 1, revision: 1, lastOpId: 'op_seed',
        updatedAt: '2026-08-21T06:00:00.000Z', updatedBy: 'd_seed' });
}

// The one sentence and the function that says it, as js/ui/reports.js has them (the UI is
// not loaded into a harness device; these two lines are, from the shipped source).
const REPORTS = readFileSync(join(sourceRoot(), 'js/ui/reports.js'), 'utf8');
const TELLING = (() => {
    const from = REPORTS.indexOf('const CLOSURE_LOST_TEXT = ');
    const to = REPORTS.indexOf('\n}\n', REPORTS.indexOf('function closureLostTell(', from)) + 3;
    return from === -1 || to < from ? '' : REPORTS.slice(from, to);
})();
// v195, the build on the phones, on its own bytes out of Git (R6).
const V195 = 'b48ac44255353a0e41138348eecfa5639a852520';
let v195Sources = null;
function v195Device(options) {
    if (v195Sources === null) {
        const git = args => execFileSync('git', ['-C', sourceRoot(), ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
        let sha = '';
        try { sha = git(['rev-parse', '--verify', '--quiet', `${V195}^{commit}`]).trim(); } catch (error) { sha = ''; }
        given('the v195 commit is in this repository', sha === V195, V195);
        v195Sources = loadOrder().map(file => ({ file, code: git(['show', `${sha}:${file}`]) }));
    }
    return makeDevice(Object.assign({ sources: v195Sources, appVersion: 'v195' }, options));
}
function phone(cloudAdapter, deviceId, old) {
    const d = old ? v195Device({ deviceId }) : makeDevice({ deviceId });
    if (!old) vm.runInContext(TELLING, d.ctx, { filename: 'js/ui/reports.js (the telling)' });
    d.setToday('2026-08-21');
    d.told = [];
    d.ctx.askTell = said => { d.told.push(typeof said === 'string' ? said : (said && (said.message || said.title))); return Promise.resolve(true); };
    d.Sync.pushDelayMs = 5;
    d.Sync.connect(cloudAdapter);
    return d;
}
// B's listener a second behind: its snapshots are kept back until the test lets them go.
function lagged(cloud) {
    const gate = { open: true, waiting: [], adapter: {} };
    Object.keys(cloud.adapter).forEach(name => { gate.adapter[name] = (...args) => cloud.adapter[name](...args); });
    gate.adapter.subscribe = (next, error) => cloud.adapter.subscribe(snapshot => {
        if (gate.open) next(snapshot); else gate.waiting.push([next, snapshot]);
    }, error);
    // And its writes, when the test says so: refused as a phone with no signal is refused,
    // nothing having left it, so they go out again later (R4: the snapshot first).
    gate.writesOff = false;
    ['update', 'save', 'create'].forEach(name => {
        if (typeof cloud.adapter[name] !== 'function') return;
        gate.adapter[name] = (...args) => {
            if (!gate.writesOff) return cloud.adapter[name](...args);
            const error = new Error('client is offline');
            error.code = 'unavailable';
            if (name !== 'create') error.unsent = true;
            return Promise.reject(error);
        };
    });
    gate.release = () => { gate.open = true; gate.waiting.splice(0).forEach(([next, snapshot]) => next(snapshot)); };
    return gate;
}
async function twoPhones(builds = {}) {
    const cloud = makeCloud({ doc: seedDoc() });
    const gate = lagged(cloud);
    const a = phone(cloud.adapter, 'd_A', builds.a === 'v195');
    const b = phone(gate.adapter, 'd_B', builds.b === 'v195');
    given('both phones are synced', await settleUntil(() => a.Sync.status === 'synced' && b.Sync.status === 'synced'
        && a.State.schedule.workers.length === 1 && b.State.schedule.workers.length === 1, 30000), j([a.Sync.status, b.Sync.status]));
    return { cloud, gate, a, b };
}
// The per-man box's own writer, at one moment (closeAccountFor, js/ui/reports.js).
function closeOn(d, deduction, at) {
    const changes = d.call('closePeriodChanges', d.State.schedule, 'w_1', P[0], P[1], at, d.id, deduction);
    given(`${d.id} wrote its close`, changes.length > 0, j(changes.map(change => change.path)));
    given(`${d.id} committed it`, d.State.commitMany(changes) !== false);
    return changes;
}
const closeEntries = doc => Object.values(((doc || {}).ledger || {}).advances || {})
    .filter(entry => entry && (entry.kind === 'closed' || entry.kind === 'deducted') && entry.periodFrom === P[0])
    .map(entry => [entry.id, entry.kind, entry.amount === undefined ? null : entry.amount, entry.by])
    .sort((x, y) => (x[0] < y[0] ? -1 : 1));
const asideKeys = d => Object.keys(d.dump()).filter(key => key.indexOf('farkad:closureAside:') === 0);
function state(d) {
    return {
        status: d.Sync.status,
        held: d.Sync.heldRecords().length,
        pending: d.Sync.pendingCount(),
        blocked: d.call('farkadWritesBlocked'),
        conflicted: Object.keys(((d.State.schedule.ledger || {}).conflicted) || {}).length
    };
}
const CLEAN = { status: 'synced', held: 0, pending: 0, blocked: false, conflicted: 0 };
// PROPOSED words; the suite runs the shipped js/ui/reports.js lines that say them.
const TOLD = 'החשבון הזה כבר נסגר בטלפון אחר, באותו זמן. נשמרה הסגירה שהגיעה ראשונה, והסגירה מהטלפון הזה לא נרשמה. בדוק את הסכומים בחשבון שלו.';

async function race(aTakes, bTakes, order, builds) {
    const one = await twoPhones(builds);
    one.gate.open = false;
    closeOn(one.a, aTakes, '2026-08-21T10:00:00.000Z');
    given('A\'s close reached the cloud', await settleUntil(() => one.a.Sync.pendingCount() === 0 && one.a.Sync.status === 'synced', 30000));
    // R4: B's press is on B's disk and in its queue, but nothing has left B yet when A's
    // close reaches it.
    if (order === 'heard-first') one.gate.writesOff = true;
    closeOn(one.b, bTakes, '2026-08-21T10:00:01.000Z');
    await settle(1500);
    one.gate.release();
    if (order === 'heard-first') {
        await settle(1500);
        one.gate.writesOff = false;   // and B's own retry ladder takes it from here
    }
    await settleUntil(() => one.b.Sync.pendingCount() === 0 && one.b.Sync.status === 'synced', 20000);
    await settle(500);
    one.states = { a: state(one.a), b: state(one.b) };
    one.a.Sync.disconnect(); one.b.Sync.disconnect();
    return one;
}

{
    suite('R1 the race: A takes 900, B (not yet heard) takes 0 - B is not stuck, and nothing B wrote reaches the cloud');
    const one = await race(900, 0);
    const cloud = closeEntries(one.cloud.doc);
    same('the cloud: A\'s close and only it', cloud.map(entry => [entry[1], entry[2], entry[3]]), [['deducted', 900, 'd_A'], ['closed', null, 'd_A']]);
    same('B: synced, nothing held, nothing queued, not blocked', one.states.b, CLEAN);
    same('B holds the cloud\'s close, entry for entry', closeEntries(one.b.State.schedule), cloud);
    same('B\'s own close is put aside on B, not in the record', asideKeys(one.b).length, 1);
    same('and B is told, once, in one sentence', one.b.told.filter(said => said === TOLD).length, 1);
    same('A is untouched', one.states.a, CLEAN);
    const aside = JSON.parse(one.b.raw(asideKeys(one.b)[0]) || '{}');
    same('what is aside is B\'s own close, as B wrote it', Object.values(aside.entries || {}).map(entry => [entry.kind, entry.by]),
        [['closed', 'd_B']]);
    check('no write the cloud accepted from B carried a closure path', one.cloud.writes.every(write => write.kind !== 'update'
        || write.patch.updatedBy !== 'd_B' || !Object.keys(write.patch).some(path => /^ledger\.advances\.le_(period|close)_/.test(path))));

    suite('R1 again: B closed and opened again - the lost close is not laid back by the journal');
    const again = makeDevice({ deviceId: 'd_B', storage: one.b.dump() });
    again.setToday('2026-08-21');
    again.ctx.askTell = () => Promise.resolve();
    again.State.load();
    same('B reopened holds the cloud\'s close, entry for entry', closeEntries(again.State.schedule), closeEntries(one.cloud.doc));
    same('nothing queued, nothing held, not blocked', [again.Sync.pendingCount(), again.Sync.heldRecords().length, again.call('farkadWritesBlocked')],
        [0, 0, false]);
}
{
    suite('R2 the race the other way: A takes 0, B takes 900 - B\'s deduction never lands beside A\'s payslip');
    const one = await race(0, 900);
    const cloud = closeEntries(one.cloud.doc);
    same('the cloud: A\'s close, with nothing deducted, and no deduction of B\'s', cloud.map(entry => [entry[1], entry[2], entry[3]]), [['closed', null, 'd_A']]);
    same('B: synced, nothing held, nothing queued, not blocked', one.states.b, CLEAN);
    same('B holds the cloud\'s close, entry for entry', closeEntries(one.b.State.schedule), cloud);
    same('the advance is still owed in full on both phones', [one.a, one.b].map(d => d.call('advanceOutstanding', d.State.schedule, 'adv_1').left), [900, 900]);
    same('B is told once', one.b.told.filter(said => said === TOLD).length, 1);
    check('no write the cloud accepted from B carried a closure path', one.cloud.writes.every(write => write.kind !== 'update'
        || write.patch.updatedBy !== 'd_B' || !Object.keys(write.patch).some(path => /^ledger\.advances\.le_(period|close)_/.test(path))));
}
{
    suite('R3 the same numbers on both phones: one fact, as before');
    const one = await race(900, 900);
    same('B: synced and clean', one.states.b, CLEAN);
    same('nothing put aside, nothing said', [asideKeys(one.b).length, one.b.told.filter(said => said === TOLD).length], [0, 0]);
    same('the cloud: one close, A\'s hand on it', closeEntries(one.cloud.doc).map(entry => [entry[1], entry[2], entry[3]]), [['deducted', 900, 'd_A'], ['closed', null, 'd_A']]);
}
{
    suite('R4 B hears A first, then its press lands: the same end');
    const one = await race(900, 0, 'heard-first');
    same('B: synced, clean', one.states.b, CLEAN);
    same('the cloud: A\'s close and only it', closeEntries(one.cloud.doc).map(entry => [entry[1], entry[2], entry[3]]), [['deducted', 900, 'd_A'], ['closed', null, 'd_A']]);
    same('B holds the cloud\'s close', closeEntries(one.b.State.schedule), closeEntries(one.cloud.doc));
}
{
    suite('R6 across builds: the cure is on the phone that LOSES - a v195 phone that loses is stuck as it always was');
    const oldWins = await race(900, 0, undefined, { a: 'v195' });
    same('A on v195 wins, B on this build loses: B clean', oldWins.states.b, CLEAN);
    same('and holds v195\'s close, entry for entry', closeEntries(oldWins.b.State.schedule), closeEntries(oldWins.cloud.doc));
    const oldLoses = await race(900, 0, undefined, { b: 'v195' });
    same('A on this build wins: the cloud has A\'s close and only it', closeEntries(oldLoses.cloud.doc).map(entry => [entry[1], entry[2], entry[3]]),
        [['deducted', 900, 'd_A'], ['closed', null, 'd_A']]);
    const stuck = oldLoses.states.b;
    console.log(`        MEASURED, NOT CHANGED: B on v195 after losing - ${j(stuck)}`);
    check('B on v195 is not synced - exactly the finding, on the build that cannot be given new code', stuck.status !== 'synced'
        && (stuck.blocked || stuck.held > 0 || stuck.conflicted > 0), j(stuck));
    same('A on this build is untouched by it', oldLoses.states.a, CLEAN);
}
{
    suite('R5 not a closure: one advance id with two bodies is still held, exactly as before');
    const one = await twoPhones();
    one.gate.open = false;
    const write = (d, amount) => d.State.commit({ path: 'ledger.advances.le_rep_same', value: { id: 'le_rep_same', advanceId: 'adv_1',
        kind: 'repaid', date: '2026-08-21', amount, note: '', at: '2026-08-21T10:00:00.000Z', by: d.id } });
    write(one.a, 100);
    await settleUntil(() => one.a.Sync.pendingCount() === 0, 30000);
    write(one.b, 200);
    await settle(1500);
    one.gate.release();
    await settle(3000);
    const b = state(one.b);
    check('B does not call itself synced over two repayments under one id', b.status !== 'synced' && (b.held > 0 || b.conflicted > 0 || b.blocked), j(b));
    same('nothing put aside as a closure', asideKeys(one.b).length, 0);
    one.a.Sync.disconnect(); one.b.Sync.disconnect();
}

report();
