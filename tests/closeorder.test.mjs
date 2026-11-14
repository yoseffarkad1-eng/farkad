// Closing a man's periods OUT OF ORDER, and the advance it took twice.
//
//   node tests/closeorder.test.mjs
//
// THE FINDING (the owner's problem (a), 2026-11-14; tests/weeklyclose.test.mjs W7 on the
// weekly-close branch, and finding L7 of the money design): a period nobody closed is read
// by the walk as if the full possible deduction had come off that wage. Close the NEXT
// period by hand in front of it and the later close is computed from that presumption.
// Type a forgotten day into the old period afterwards and close it the way the box offers:
// 1,390 + 1,220 = 2,610 recorded as deducted against an advance of 2,000. The extra 610
// turns into «יתרת זכות» - the books balance, and the man had 610 taken off two wages.
//
// THE CURE is a refusal in the model (planPeriodClosure, js/model/ledger.js), for NEW
// closes only:
//
//   earlierOpen  this period opens owing, and an earlier period of his that handed a debt
//                on (the walk presumed less came off it than he owed) is still open:
//                close the old one first.
//   laterClosed  money runs through this period, and a later period of his is already
//                closed with a deduction taken from a balance carried into it: that close
//                was computed from a presumption about this one, and closing it now can
//                take the same advance twice.
//
// What this suite holds, besides the finding and its cure:
//
//   O1  the finding, end to end on the writer the box uses (closePeriodChanges).
//   O2  in order, nothing is refused and the money is the same as before the cure.
//   O3  a period with no money in it is never refused - in front of an open one, or
//       behind a closed one - and a man with no advance at all is untouched.
//   O4  NOTHING ALREADY WRITTEN CHANGES MEANING: a record a v195 phone wrote out of order
//       (its own bytes, out of Git) reads the same on this build - every closure, every
//       sheet row, every statement figure, no closure judged impossible - and only the
//       NEW close it would have offered is refused.
//   O5  the screen: the box says why, in its own sentence, and offers no button.
//
// Synthetic names and money throughout.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeDevice, loadOrder, sourceRoot } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

process.env.TZ = 'Asia/Jerusalem';
const ROOT = sourceRoot();
const j = value => JSON.stringify(value);

// ---------------------------------------------------------------- v195, on its own bytes
// The build served on 2026-11-13 (origin/main b48ac44). The out-of-order record below is
// written by THIS, not by a description of it.
const V195 = 'b48ac44255353a0e41138348eecfa5639a852520';
const git = args => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
let v195Sources = null;
function v195(options = {}) {
    if (v195Sources === null) {
        let sha = '';
        try { sha = git(['rev-parse', '--verify', '--quiet', `${V195}^{commit}`]).trim(); } catch (error) { sha = ''; }
        given('the v195 commit is in this repository', sha === V195, V195);
        v195Sources = loadOrder().map(file => ({ file, code: git(['show', `${sha}:${file}`]) }));
        const stamp = (/const APP_VERSION = '([^']+)'/.exec(git(['show', `${sha}:js/app.js`])) || [])[1];
        given('and it names itself v195', stamp === 'v195', String(stamp));
    }
    return makeDevice(Object.assign({ sources: v195Sources, appVersion: 'v195' }, options));
}

// ---------------------------------------------------------------- the fixtures
// One man on 610 a day, the carried reading approved - as on the owner's record since v116.
function base(workers) {
    return {
        schemaVersion: 2,
        workers: workers || [{ id: 'w_1', name: 'ראמי', dailyRate: 610, hourlyRate: 0, active: true }],
        places: [{ id: 'p_1', name: 'אתר צפון', active: true }],
        days: {},
        vehicles: [],
        advances: {},
        ledger: { advances: {}, unreadable: {},
            migrations: { cm_carry: { id: 'cm_carry', kind: 'carry', rows: 0, at: '', by: 'd' } } }
    };
}
function work(record, worker, dates) {
    dates.forEach(date => {
        record.days[date] = record.days[date] || { plan: {}, actual: {} };
        record.days[date].actual[worker] = { entries: [{ placeId: 'p_1' }], rates: { daily: 610, hourly: 0 } };
    });
}
function give(record, worker, id, date, amount) {
    record.advances[id] = { id, workerId: worker, date, amount, note: '' };
    record.ledger.advances[`le_mig_${id}`] = { id: `le_mig_${id}`, advanceId: id, kind: 'given',
        workerId: worker, date, amount, note: '', at: `${date}T07:00:00.000Z`, by: 'd' };
}
const addDays = (date, n) => {
    const [y, m, d] = date.split('-').map(Number);
    const at = new Date(y, m - 1, d + n, 12);
    return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
};
const weekdays = (from, to) => {
    const out = [];
    for (let date = from; date <= to; date = addDays(date, 1)) {
        if (new Date(`${date}T12:00:00`).getDay() !== 6) out.push(date);
    }
    return out;
};
const P1 = ['2026-08-07', '2026-08-20'];
const P2 = ['2026-08-21', '2026-09-03'];
const P3 = ['2026-09-04', '2026-09-17'];

// THE SCENE: P1 holds ONE day and the 2,000 he was handed; P2 is a full fortnight.
function scene(workers) {
    const record = base(workers);
    work(record, 'w_1', ['2026-08-07']);
    work(record, 'w_1', weekdays(P2[0], P2[1]));
    give(record, 'w_1', 'adv_1', '2026-08-07', 2000);
    return record;
}
function holding(record, today, make = makeDevice, deviceId = 'd_office') {
    const device = make({ deviceId, storage: { 'scheduleData:v2': JSON.stringify(record) } });
    device.setToday(today);
    device.ctx.askTell = () => Promise.resolve();
    device.State.load();
    return device;
}
const plan = (d, range, at, deduction) => d.call('planPeriodClosure', d.State.schedule, 'w_1', range[0], range[1], at, deduction);
const close = (d, range, at, deduction) => {
    const changes = d.call('closePeriodChanges', d.State.schedule, 'w_1', range[0], range[1], at, 'd_hand', deduction);
    if (changes.length) d.State.commitMany(changes);
    return changes;
};
const typeDay = (d, date) => d.State.commit(d.call('assignPlace', d.State.schedule, date, 'w_1', 'actual', 'p_1'));
const deductedTotal = d => Object.values(d.State.schedule.ledger.advances)
    .filter(entry => entry.kind === 'deducted').reduce((sum, entry) => sum + entry.amount, 0);

// ================================================================== O1 the finding
{
    suite('O1 the finding: a period closed in front of an open one, a day typed behind it, and the advance taken twice');
    const d = holding(scene(), '2026-09-04');
    const p2 = plan(d, P2, '2026-09-04T10:00:00.000Z');
    // Before the cure: [true, 1390]. The box offered P2 with P1 open behind it.
    same('P2, with P1 (one day, 2,000 handed over) still open: REFUSED, naming P1', [p2.canClose, p2.reasons, p2.earlierOpen],
        [false, ['earlierOpen'], { from: P1[0], to: P1[1] }]);
    same('and the writer the box calls writes nothing', close(d, P2, '2026-09-04T10:00:00.000Z').length, 0);

    // The same scene on a v195 phone, which did write it - and then a day typed into P1.
    const old = holding(scene(), '2026-09-04', v195, 'd_old');
    given('v195 closed P2 in front of P1, at the sheet\'s 1,390', close(old, P2, '2026-09-04T10:00:00.000Z').length > 0
        && deductedTotal(old) === 1390, j(deductedTotal(old)));
    typeDay(old, '2026-08-10');
    const oldP1 = plan(old, P1, '2026-09-05T10:00:00.000Z');
    given('and v195 would close P1 at 1,220 - the finding, on its own bytes', oldP1.canClose === true && oldP1.deducted === 1220, j([oldP1.canClose, oldP1.deducted]));
    close(old, P1, '2026-09-05T10:00:00.000Z');
    given('2,610 recorded as deducted against an advance of 2,000 by v195', deductedTotal(old) === 2610, j(deductedTotal(old)));

    // This build, opening what v195 wrote BEFORE its second close.
    const twin = holding(scene(), '2026-09-04', v195, 'd_old2');
    close(twin, P2, '2026-09-04T10:00:00.000Z');
    typeDay(twin, '2026-08-10');
    const here = holding(JSON.parse(twin.raw('scheduleData:v2')), '2026-09-05');
    const p1 = plan(here, P1, '2026-09-05T10:00:00.000Z');
    same('this build, on that record: P1 REFUSED - a later period is closed with a deduction on it', [p1.canClose, p1.reasons], [false, ['laterClosed']]);
    same('nothing is written', close(here, P1, '2026-09-05T10:00:00.000Z').length, 0);
    same('the recorded deductions stay 1,390 - never above the 2,000 handed over', deductedTotal(here), 1390);
}

// ================================================================== O2 in order
{
    suite('O2 in order, nothing is refused and nothing moves');
    const d = holding(scene(), '2026-09-04');
    const p1 = plan(d, P1, '2026-09-04T10:00:00.000Z');
    same('P1 first: closable, at the sheet\'s 610', [p1.canClose, p1.reasons, p1.deducted], [true, [], 610]);
    close(d, P1, '2026-09-04T10:00:00.000Z');
    const p2 = plan(d, P2, '2026-09-04T10:01:00.000Z');
    same('then P2: closable, at the 1,390 left', [p2.canClose, p2.reasons, p2.deducted], [true, [], 1390]);
    close(d, P2, '2026-09-04T10:01:00.000Z');
    same('2,000 recorded against 2,000', deductedTotal(d), 2000);
    same('no closure judged impossible', d.call('impossibleClosures', d.State.schedule), []);

    // Exactly what v195 writes for the same two presses: the cure adds no byte to a close.
    const old = holding(scene(), '2026-09-04', v195, 'd_office');
    close(old, P1, '2026-09-04T10:00:00.000Z');
    close(old, P2, '2026-09-04T10:01:00.000Z');
    // But for what problem (c) took out of a close (tests/closuresize.test.mjs): a
    // deduction no longer repeats the payslip's basis and days, and a frozen day leaves
    // `"absent":false` out. MOVED ON PURPOSE with that commit.
    const asNow = entries => {
        const out = JSON.parse(j(entries));
        Object.values(out).forEach(entry => {
            if (entry.kind === 'deducted') { delete entry.basis; delete entry.days; }
            (entry.days || []).forEach(day => { if (day.absent === false) delete day.absent; });
        });
        return j(out);
    };
    same('the ledger, byte for byte what v195 writes in order (but for problem (c))', j(d.State.schedule.ledger.advances), asNow(old.State.schedule.ledger.advances));

    // A chosen amount, smaller than the most: the next period is still closable after it.
    const e = holding(scene(), '2026-09-04');
    close(e, P1, '2026-09-04T10:00:00.000Z', 0);
    const e2 = plan(e, P2, '2026-09-04T10:01:00.000Z');
    same('P1 closed with 0 taken, then P2: closable at the 2,000 still owed', [e2.canClose, e2.deducted], [true, 2000]);
}

// ================================================================== O3 no money, no refusal
{
    suite('O3 a period no money ran through is never refused, and a man with no advance is untouched');
    // 500 handed over in P1 against a wage of 610: the sheet takes it all there, P2 opens owing nothing.
    const small = base();
    work(small, 'w_1', ['2026-08-07']);
    work(small, 'w_1', weekdays(P2[0], P2[1]));
    give(small, 'w_1', 'adv_1', '2026-08-07', 500);
    const d = holding(small, '2026-09-04');
    const p2 = plan(d, P2, '2026-09-04T10:00:00.000Z');
    same('P2 owes nothing, so P1 open behind it refuses nothing', [p2.canClose, p2.reasons, p2.deducted], [true, [], 0]);
    close(d, P2, '2026-09-04T10:00:00.000Z');
    const p1 = plan(d, P1, '2026-09-04T10:01:00.000Z');
    same('and P1, behind a later close that took NOTHING: closable', [p1.canClose, p1.reasons, p1.deducted], [true, [], 500]);

    // A man with no advance at all: every period closable in any order, as before.
    const none = base();
    work(none, 'w_1', ['2026-08-07']);
    work(none, 'w_1', weekdays(P2[0], P2[1]));
    work(none, 'w_1', weekdays(P3[0], P3[1]));
    const n = holding(none, '2026-09-18');
    close(n, P3, '2026-09-18T10:00:00.000Z');
    same('no advance: P1 closable behind a closed P3, and P2 too', [plan(n, P1, '2026-09-18T10:01:00.000Z').canClose,
        plan(n, P2, '2026-09-18T10:01:00.000Z').canClose], [true, true]);

    // A later close that took nothing does not hold an earlier one.
    const zero = holding(scene(), '2026-09-04', v195, 'd_old');
    close(zero, P2, '2026-09-04T10:00:00.000Z', 0);
    const z = holding(JSON.parse(zero.raw('scheduleData:v2')), '2026-09-05');
    const z1 = plan(z, P1, '2026-09-05T10:00:00.000Z');
    same('P2 closed by v195 with 0 taken: P1 closable, at the sheet\'s 610', [z1.canClose, z1.reasons, z1.deducted], [true, [], 610]);
}

// ================================================================== O4 nothing already written moves
{
    suite('O4 a record v195 wrote out of order reads the same on this build, figure for figure');
    const old = holding(scene(), '2026-09-18', v195, 'd_old');
    close(old, P2, '2026-09-04T10:00:00.000Z');
    typeDay(old, '2026-08-10');
    close(old, P1, '2026-09-05T10:00:00.000Z');
    given('v195 wrote the finding: 2,610 recorded', deductedTotal(old) === 2610);
    const bytes = old.raw('scheduleData:v2');
    const here = holding(JSON.parse(bytes), '2026-09-18');
    const read = d => {
        const s = d.State.schedule;
        const worker = s.workers[0];
        return j({
            closed: d.call('closedPeriods', s, 'w_1'),
            impossible: d.call('impossibleClosures', s),
            walks: [P1, P2, P3].map(range => d.call('advanceAccount', s, 'w_1', range[0], range[1])),
            sheets: [P1, P2, P3].map(range => d.call('payrollReport', s, range[0], range[1])),
            days: [P1, P2].map(range => d.call('workerDaysReport', s, worker, range[0], range[1])),
            left: d.call('advanceOutstanding', s, 'adv_1'),
            problems: d.call('ledgerProblems', s)
        });
    };
    same('every closure, sheet, statement and balance the same on both builds', read(here), read(old));
    same('no closure judged impossible', here.call('impossibleClosures', here.State.schedule), []);
    check('and the disk was not rewritten by opening it', here.raw('scheduleData:v2') === bytes
        || JSON.stringify(JSON.parse(here.raw('scheduleData:v2')).ledger) === JSON.stringify(JSON.parse(bytes).ledger));
    same('and P3 is planned exactly as v195 plans it (the cure adds no reason where nothing is open behind it)',
        plan(here, P3, '2026-09-18T10:00:00.000Z').reasons, plan(old, P3, '2026-09-18T10:00:00.000Z').reasons);
}

// ================================================================== O5 the screen
{
    suite('O5 the box says why, and offers no button');
    const source = readFileSync(join(ROOT, 'js/ui/reports.js'), 'utf8');
    const words = {
        earlierOpen: 'חשבון קודם של העובד הזה עדיין פתוח. סוגרים מהישן לחדש: סגור קודם את החשבון ההוא.',
        laterClosed: 'תקופה מאוחרת יותר של העובד הזה כבר נסגרה עם ניכוי, והחשבון הזה עדיין פתוח. '
            + 'סגירה שלו עכשיו עלולה לנכות את אותה מקדמה פעמיים - לכן היא חסומה. בדוק את עמוד המקדמות שלו.'
    };
    const text = vmText('CLOSURE_ORDER_TEXT');
    same('the two sentences, word for word (PROPOSED)', [text.earlierOpen, text.laterClosed], [words.earlierOpen, words.laterClosed]);
    check('the box asks both reasons before it offers a field', /reasons\.indexOf\('earlierOpen'\)/.test(source)
        && /reasons\.indexOf\('laterClosed'\)/.test(source)
        && source.indexOf("reasons.indexOf('laterClosed')") < source.indexOf("const label = el('label', 'field-label', 'כמה לקזז מהשכר הפעם?')"));
    check('and points at the open period with v189\'s own button', /CLOSURE_ORDER_TEXT\.earlierOpen[\s\S]{0,600}showOtherAccount\(/.test(source));
}
function vmText(name) {
    // reports.js is UI and is not loaded into a harness device; its block is read as code.
    const source = readFileSync(join(ROOT, 'js/ui/reports.js'), 'utf8');
    const at = source.indexOf(`const ${name} = `);
    if (at === -1) return {};
    const end = source.indexOf('});', at);
    // eslint-disable-next-line no-new-func
    return new Function(`${source.slice(at, end + 3)}; return ${name};`)();
}

report();
