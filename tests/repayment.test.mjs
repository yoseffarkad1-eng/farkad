// An advance that is bigger than the fortnight it was taken in.
//
//   node tests/repayment.test.mjs
//
// A man takes 5000 on the 10th and earns 3050 in that account. Today the pay sheet shows
// a net of -1950 and the next account starts from nothing: the 1,950 he still owes is on
// no screen, in no file, and in nobody's arithmetic. It is not lost from the RECORD - the
// advance is still there - it is lost from the SUM, which is worse, because the sum is
// what somebody is paid from.
//
// Two mechanisms close it, and the owner asked for both:
//
//   the balance carries    an account deducts up to what the man earned, and what is left
//                          over goes to the next account until it is settled
//   a repayment is recorded  cash handed BACK is its own dated entry against the advance,
//                          and reduces the balance the same way a deduction does
//
// And one rule over the top of both, which decides the whole shape: A SETTLED ACCOUNT
// NEVER CHANGES. An entry dated in September may not move a number on a fortnight
// somebody was already paid from. That is why every figure below is a function of entries
// dated on or before the account's own last day, and of nothing else - not of "the
// advance's balance today", which is a moving number.
//
// It also means turning the carry on cannot be free: an account that showed 3,000 would
// begin showing 1,050, and this app does not know which fortnights have been paid. So the
// carry is a flag, off, with a plan function that says exactly what flipping it would do -
// the same treatment planRateStamping gives to stamping old days, and for the same reason.

import { makeDevice } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import { makeNode } from './nodes.mjs';

// Two consecutive accounts, either side of the anchor's fortnight.
const A = { from: '2026-08-07', to: '2026-08-20' };
const B = { from: '2026-08-21', to: '2026-09-03' };

function crew(options = {}) {
    const device = makeDevice(options);
    device.setToday('2026-09-03');
    device.State.schedule.workers = [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 0 }
    ];
    device.State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
    device.State.save({ silent: true });
    return device;
}

// Seven days in account A at 400 = 2800... but the man is owed 3050 in the story above,
// so: six days at 400 and one double = 3200. Kept simple and literal instead: eight days
// in A at 400 is 3200, seven in B at 400 is 2800. Every number below is checkable.
function work(device, dates) {
    dates.forEach(date => device.State.commit(device.call('assignPlace',
        device.State.schedule, date, 'w_01', 'actual', 'p_01')));
}

const A_DAYS = ['2026-08-07', '2026-08-10', '2026-08-11', '2026-08-12',
    '2026-08-13', '2026-08-14', '2026-08-17', '2026-08-18'];   // 8 x 400 = 3200
const B_DAYS = ['2026-08-21', '2026-08-24', '2026-08-25', '2026-08-26',
    '2026-08-27', '2026-08-28', '2026-08-31'];                 // 7 x 400 = 2800

// ------------------------------------------------------------------ what happens today
{
    suite('the fortnight that forgets what is still owed');

    const device = crew({ deviceId: 'd_now' });
    work(device, A_DAYS);
    work(device, B_DAYS);
    device.State.commit(device.call('addAdvance', device.State.schedule,
        'w_01', '2026-08-10', 5000, ''));

    const rowIn = range => device.call('payrollReport', device.State.schedule,
        range.from, range.to).find(row => row.workerId === 'w_01');

    given('account A: 3,200 earned against 5,000 taken',
        rowIn(A).amount === 3200 && rowIn(A).advances === 5000,
        JSON.stringify([rowIn(A).amount, rowIn(A).advances]));
    given('account B: 2,800 earned and no advance in it',
        rowIn(B).amount === 2800 && rowIn(B).advances === 0,
        JSON.stringify([rowIn(B).amount, rowIn(B).advances]));

    // THE FAULT. 1,800 of the 5,000 was never covered by account A, and account B does
    // not know it exists.
    const owed = device.call('advanceCarryInto', device.State.schedule, 'w_01', B.from);
    check('account B is told what account A could not cover',
        owed === 1800, String(owed));
}

// -------------------------------------------------------------- the carry, account by account
{
    suite('the balance walks forward, and each account deducts what it can');

    const device = crew({ deviceId: 'd_carry', flags: { carryAdvances: true } });
    work(device, A_DAYS);
    work(device, B_DAYS);
    device.State.commit(device.call('addAdvance', device.State.schedule,
        'w_01', '2026-08-10', 5000, ''));

    const a = device.call('advanceAccount', device.State.schedule, 'w_01', A.from, A.to);
    const b = device.call('advanceAccount', device.State.schedule, 'w_01', B.from, B.to);

    same('account A takes 5,000 in and deducts the 3,200 he earned',
        [a.carriedIn, a.given, a.repaid, a.deducted, a.carriedOut],
        [0, 5000, 0, 3200, 1800]);
    same('account B starts owing 1,800 and clears it out of 2,800',
        [b.carriedIn, b.given, b.repaid, b.deducted, b.carriedOut],
        [1800, 0, 0, 1800, 0]);
    check('so he is paid nothing in A and 1,000 in B',
        a.net === 0 && b.net === 1000, JSON.stringify([a.net, b.net]));
}

// ------------------------------------------------------------------- cash handed back
{
    suite('cash handed back is its own entry, on its own date');

    const device = crew({ deviceId: 'd_repaid', flags: { carryAdvances: true } });
    work(device, A_DAYS);
    work(device, B_DAYS);
    const add = device.call('addAdvance', device.State.schedule,
        'w_01', '2026-08-10', 5000, '');
    device.State.commit(add);
    const advanceId = Object.keys(device.State.schedule.advances)[0];

    // He hands 1,800 back in cash on the 24th, inside account B.
    const paid = device.call('recordAdvanceRepaid', device.State.schedule,
        advanceId, 1800, '2026-08-24', '', '2026-08-24T09:00:00.000Z', 'd_repaid', 'cash');
    given('the repayment produces an entry to commit',
        paid && paid.path !== null && paid.path !== undefined, JSON.stringify(paid));
    device.State.commit(paid);

    const b = device.call('advanceAccount', device.State.schedule, 'w_01', B.from, B.to);
    same('account B: the cash he handed back settles it, and nothing is deducted from pay',
        [b.carriedIn, b.repaid, b.deducted, b.carriedOut, b.net],
        [1800, 1800, 0, 0, 2800]);

    // The rule that decides the shape: account A is a closed fortnight.
    const a = device.call('advanceAccount', device.State.schedule, 'w_01', A.from, A.to);
    same('and account A says exactly what it said before the repayment existed',
        [a.carriedIn, a.given, a.repaid, a.deducted, a.carriedOut, a.net],
        [0, 5000, 0, 3200, 1800, 0]);
}

// ------------------------------------------------------------- nothing changes silently
{
    suite('turning the carry on is a decision somebody makes, not one the app makes');

    const off = crew({ deviceId: 'd_off' });
    work(off, A_DAYS);
    work(off, B_DAYS);
    off.State.commit(off.call('addAdvance', off.State.schedule,
        'w_01', '2026-08-10', 5000, ''));

    const rowB = off.call('payrollReport', off.State.schedule, B.from, B.to)
        .find(row => row.workerId === 'w_01');
    check('with the flag off, account B is untouched - 2,800 earned, nothing deducted',
        rowB.amount === 2800 && rowB.advances === 0,
        JSON.stringify([rowB.amount, rowB.advances]));

    // And the app says what flipping it would do, without doing any of it.
    //
    // BOTH accounts, not just the later one. Written expecting one, which was wrong: the
    // fortnight the advance was TAKEN in changes too. It currently deducts the whole
    // 5,000 and reports a net of -1,800; under the carry it deducts the 3,200 he earned
    // and reports nothing owed to him, with 1,800 carried. That is a different number on
    // a pay sheet somebody may already have been handed, which is exactly the thing this
    // report exists to put in front of a person before they decide.
    const plan = off.call('planAdvanceCarry', off.State.schedule);
    const shape = plan.map(row => [row.from, row.now, row.deducted, row.carriedOut]);
    same('it reports every account it would move, with both answers side by side', shape,
        [[A.from, 5000, 3200, 1800], [B.from, 0, 1800, 0]]);
    check('and names the man on each of them',
        plan.every(row => row.workerId === 'w_01'), JSON.stringify(plan));
    check('and reporting it changed nothing on the disk',
        off.call('payrollReport', off.State.schedule, B.from, B.to)
            .find(row => row.workerId === 'w_01').advances === 0);
}

// ------------------------------------------------------------- what the sheet says
{
    suite('the three columns a bookkeeper adds up, with the carry on');

    const vm = (await import('node:vm')).default;
    const { readFileSync } = await import('node:fs');

    // Loaded once per device. These are classic scripts full of top-level const, so
    // running them a second time in the same context throws on the first redeclaration -
    // which is a fact about the harness, not about the app.
    const loadedInto = new Set();
    function sheetFor(device, range) {
        const run = code => vm.runInContext(code, device.ctx, { filename: 'harness:reports' });
        if (!loadedInto.has(device)) {
            loadedInto.add(device);
            run(readFileSync(new URL('../js/ui/sitecolor.js', import.meta.url), 'utf8'));
            run(readFileSync(new URL('../js/ui/reports.js', import.meta.url), 'utf8'));
        }
        run(`REPORT_RANGE.from = '${range.from}'; REPORT_RANGE.to = '${range.to}';`
            + `REPORT_SECTION = 'workers'; INVOICE_PLACE = null;`);
        const rows = run('payrollSheetRows()');
        const head = rows[0];
        const row = rows.find(line => line[0] === 'דוד');
        return {
            gross: row[head.indexOf('נצבר')],
            advances: row[head.indexOf('מקדמות')],
            net: row[head.indexOf('לתשלום')],
            note: row[head.indexOf('הערה')]
        };
    }

    // The account the 5,000 was taken in. He earned 3,200, so 3,200 is what can come off
    // it - and the reconciliation the sheet states in its own headings has to hold:
    // נצבר plus מקדמות equals לתשלום, on the row somebody is paid from.
    const one = crew({ deviceId: 'd_sheet_a', flags: { carryAdvances: true } });
    work(one, A_DAYS);
    work(one, B_DAYS);
    one.State.commit(one.call('addAdvance', one.State.schedule,
        'w_01', '2026-08-10', 5000, ''));
    const a = sheetFor(one, A);
    same('account A: 3,200 earned, 3,200 deducted, nothing to pay',
        [a.gross, a.advances, a.net], [3200, -3200, 0]);
    check('and the sheet says what did not fit, rather than leaving it unsaid',
        String(a.note).indexOf('1800') !== -1 || String(a.note).indexOf('1,800') !== -1,
        JSON.stringify(a.note));

    const two = crew({ deviceId: 'd_sheet_b', flags: { carryAdvances: true } });
    work(two, A_DAYS);
    work(two, B_DAYS);
    two.State.commit(two.call('addAdvance', two.State.schedule,
        'w_01', '2026-08-10', 5000, ''));
    const b = sheetFor(two, B);
    same('account B: 2,800 earned, the 1,800 it inherited deducted, 1,000 to pay',
        [b.gross, b.advances, b.net], [2800, -1800, 1000]);

    // And with the switch off, which is how it ships, nothing about the sheet moves.
    // The gates are SET, not inherited. A check named "with the carry off" that reads
    // the shipped default measures whatever branch it happens to be run on - and on
    // claude/farkad-ledger-enable-ready, where the default is open, it measured the
    // opposite of its own name and passed for a while doing it.
    const off = crew({ deviceId: 'd_sheet_off', flags: { carryAdvances: false } });
    work(off, A_DAYS);
    work(off, B_DAYS);
    off.State.commit(off.call('addAdvance', off.State.schedule,
        'w_01', '2026-08-10', 5000, ''));
    same('with the carry off, account B is the sheet this build ships today',
        [sheetFor(off, B).gross, sheetFor(off, B).advances, sheetFor(off, B).net],
        [2800, 0, 2800]);
}

// -------------------------------------------------- the entry has to survive the wire
{
    suite('a repayment is a record like any other, and is checked like one');

    const device = crew({ deviceId: 'd_valid', flags: { carryAdvances: true } });
    work(device, A_DAYS);
    device.State.commit(device.call('addAdvance', device.State.schedule,
        'w_01', '2026-08-10', 5000, ''));
    const advanceId = Object.keys(device.State.schedule.advances)[0];

    const paid = device.call('recordAdvanceRepaid', device.State.schedule,
        advanceId, 1800, '2026-08-18', '', '2026-08-18T09:00:00.000Z', 'd_valid', 'cash');
    device.State.commit(paid);

    // THE PATH VALIDATOR. Every edit goes through it on its way to the queue, and an
    // entry it refuses is quarantined - which on this device means writes are held and
    // nobody can record a day. A kind the writer produces and the validator has never
    // heard of is that fault exactly, and it is silent until somebody uses the feature.
    check('the entry the writer produced is one the queue accepts',
        device.call('ledgerEntryProblems', paid.value.id, paid.value).length === 0,
        JSON.stringify(device.call('ledgerEntryProblems', paid.value.id, paid.value)));
    check('and the whole record still reads',
        device.call('storedScheduleProblems',
            JSON.parse(JSON.stringify(device.State.schedule))).length === 0,
        JSON.stringify(device.call('storedScheduleProblems',
            JSON.parse(JSON.stringify(device.State.schedule)))));

    // The shapes that must NOT be accepted. Each is money, and each would be believed.
    const bad = [
        ['no date at all', { kind: 'repaid', amount: 100 }],
        ['a date that is not a date', { kind: 'repaid', amount: 100, date: 'ראשון' }],
        ['an amount that is not a number', { kind: 'repaid', amount: 'הרבה', date: '2026-08-18' }],
        // A negative repayment is a second advance wearing the wrong name: it would ADD
        // to what the man owes through a form whose whole meaning is that he paid.
        ['a repayment of less than nothing', { kind: 'repaid', amount: -100, date: '2026-08-18' }]
    ];
    bad.forEach(([label, shape]) => {
        const entry = Object.assign({ id: 'le_x', advanceId }, shape);
        check(`refused: ${label}`,
            device.call('ledgerEntryProblems', 'le_x', entry).length > 0,
            JSON.stringify(device.call('ledgerEntryProblems', 'le_x', entry)));
    });
}

// ---------------------------------------------------- the control, and the gate on it
{
    suite('recording a repayment, and the gate the whole feature sits behind');

    const vm = (await import('node:vm')).default;
    const { readFileSync } = await import('node:fs');

    // A worker screen, built by the real renderer, so what is asked is whether the app
    // appends the control - not whether a paraphrase of it would have.
    async function screenFor(options) {
        const device = crew(options);
        work(device, A_DAYS);
        device.State.commit(device.call('addAdvance', device.State.schedule,
            'w_01', '2026-08-10', 5000, ''));
        device.setToday('2026-08-18');

        // The worker modal's three nodes, which openWorkerDays writes into by id.
        const reportsView = makeNode('div');
        const workerDaysTitle = makeNode('h2');
        const workerDaysMeta = makeNode('p');
        const workerDaysBody = makeNode('div');
        const workerDaysModal = makeNode('div');
        const nodes = { reportsView, workerDaysTitle, workerDaysMeta, workerDaysBody,
            workerDaysModal };
        device.ctx.document = {
            body: makeNode('body'),
            head: { appendChild(tag) { if (tag.onerror) tag.onerror(); return tag; } },
            getElementById: id => nodes[id] || null,
            querySelector: () => null,
            querySelectorAll: () => [],
            addEventListener() {}, removeEventListener() {},
            createElement: tag => makeNode(tag),
            createElementNS: (ns, tag) => makeNode(tag)
        };
        const run = code => vm.runInContext(code, device.ctx, { filename: 'harness:reports' });
        run(readFileSync(new URL('../js/ui/sitecolor.js', import.meta.url), 'utf8'));
        run(readFileSync(new URL('../js/ui/reports.js', import.meta.url), 'utf8'));
        run(`REPORT_RANGE.from = '${A.from}'; REPORT_RANGE.to = '${A.to}';`
            + `REPORT_SECTION = 'workers'; INVOICE_PLACE = null;`);
        run(`openWorkerDays('w_01')`);
        return { device, run, reportsView: workerDaysBody };
    }

    // THE SHIPPED BUILD. The ledger's writer gate is shut - iron law 1 - and a control
    // that writes an entry no other phone can read is not a control, it is a way to lose
    // a repayment. Nothing anywhere may reach one.
    const shipped = await screenFor({ deviceId: 'd_ui_off',
        flags: { ledgerWrites: false, carryAdvances: false } });
    check('with the writer gated off there is no way to record a repayment at all',
        shipped.reportsView.textContent.indexOf('החזר') === -1,
        shipped.reportsView.textContent.slice(0, 200));
    check('and nothing on the screen writes a ledger entry behind the gate',
        Object.keys(((shipped.device.State.schedule.ledger || {}).advances) || {})
            .filter(id => (shipped.device.State.schedule.ledger.advances[id] || {})
                .kind === 'repaid').length === 0);

    // AND WITH IT OPEN, which is the build somebody eventually ships.
    const open = await screenFor({ deviceId: 'd_ui_on',
        flags: { carryAdvances: true, ledgerWrites: true } });
    check('the control is there, on the advance it settles',
        open.reportsView.textContent.indexOf('החזר') !== -1,
        open.reportsView.textContent.slice(0, 300));

    // AND IT IS PRESSED. A control that exists and does nothing is the same to a person
    // as no control, and worse to whoever reads the test that only looked for it.
    const press = node => (node.listeners.click || []).forEach(fn => fn({
        preventDefault() {}, stopPropagation() {}
    }));
    const repayButton = open.reportsView.querySelectorAll('button')
        .find(node => String(node.textContent).indexOf('החזר') !== -1);
    given('the repayment button is reachable', Boolean(repayButton));
    press(repayButton);

    const form = open.reportsView.querySelector('.advance-form');
    given('and it opens a form', Boolean(form), String(form && form.textContent));

    // Prefilled with the whole of what is left, because settling in full is what usually
    // happens and typing it again is a chance to type it wrong.
    const amountField = form.querySelectorAll('INPUT')
        .find(node => node.type === 'text' && node.value !== '');
    check('the amount is prefilled with what is still owed',
        amountField && amountField.value === '5000',
        JSON.stringify(amountField && amountField.value));

    // Half of it, in cash, today - which the form clamps into the current account.
    amountField.value = '1800';
    const dateField = form.querySelectorAll('INPUT').find(node => node.type === 'date');
    dateField.value = '2026-08-18';
    press(form.querySelectorAll('button').find(node => node.textContent === 'שמור'));

    const entries = open.device.State.schedule.ledger.advances;
    const repaid = Object.keys(entries).map(id => entries[id])
        .filter(entry => entry.kind === 'repaid');
    same('one repayment is recorded, for what was typed, on the day it was typed for',
        repaid.map(entry => [entry.amount, entry.date]), [[1800, '2026-08-18']]);
    check('and it reached the disk, not just the screen',
        JSON.parse(open.device.dump()['scheduleData:v2']).ledger.advances[repaid[0].id]
            .amount === 1800);

    // The account it lands in deducts less from his wage by exactly what he handed back.
    const account = open.device.call('advanceAccount', open.device.State.schedule,
        'w_01', A.from, A.to);
    same('and the account it lands in stops deducting what he already settled',
        [account.given, account.repaid, account.deducted, account.carriedOut],
        [5000, 1800, 3200, 0]);
}

// ------------------------------------------ the two gates only make sense together
{
    suite('a repayment nobody deducts is worse than no repayment at all');

    // Found while preparing the branch that would open the writer gate, which is the
    // moment this stops being theoretical.
    //
    // The control was gated on the WRITER alone. Open the writer and leave the carry shut
    // - exactly the state that branch creates - and a person hands back 200, the row says
    // so, and the pay column goes on deducting the whole 500: moneyOf reads the deduction
    // off row.carry, and with the carry off there is no row.carry. Money that changed
    // hands, recorded, visible on the screen, and absent from the sum somebody is paid
    // from. It reads as settled and is not.
    //
    // Either a build deducts what it lets somebody record, or it does not offer a way to
    // record one. The invariant is asked of both halves, because either alone can be
    // satisfied by a build nobody should ship.
    const vm = (await import('node:vm')).default;
    const { readFileSync } = await import('node:fs');

    async function screen(flags, deviceId) {
        const device = crew({ deviceId, flags });
        work(device, A_DAYS);
        device.State.commit(device.call('addAdvance', device.State.schedule,
            'w_01', '2026-08-10', 500, ''));
        device.setToday('2026-08-18');
        const advanceId = Object.keys(device.State.schedule.advances)[0];
        device.State.commit(device.call('recordAdvanceRepaid', device.State.schedule,
            advanceId, 200, '2026-08-18', '', '2026-08-18T09:00:00.000Z', deviceId, 'cash'));

        const nodes = {
            reportsView: makeNode('div'), workerDaysTitle: makeNode('h2'),
            workerDaysMeta: makeNode('p'), workerDaysBody: makeNode('div'),
            workerDaysModal: makeNode('div')
        };
        device.ctx.document = {
            body: makeNode('body'),
            head: { appendChild(tag) { if (tag.onerror) tag.onerror(); return tag; } },
            getElementById: id => nodes[id] || null,
            querySelector: () => null, querySelectorAll: () => [],
            addEventListener() {}, removeEventListener() {},
            createElement: tag => makeNode(tag),
            createElementNS: (ns, tag) => makeNode(tag)
        };
        const run = code => vm.runInContext(code, device.ctx, { filename: 'harness:reports' });
        run(readFileSync(new URL('../js/ui/sitecolor.js', import.meta.url), 'utf8'));
        run(readFileSync(new URL('../js/ui/reports.js', import.meta.url), 'utf8'));
        run(`REPORT_RANGE.from = '${A.from}'; REPORT_RANGE.to = '${A.to}';`
            + `REPORT_SECTION = 'workers'; INVOICE_PLACE = null;`);
        run(`openWorkerDays('w_01')`);

        const offers = nodes.workerDaysBody.querySelectorAll('button')
            .some(node => String(node.textContent).indexOf('החזר') !== -1);
        const deducted = device.call('payrollReport', device.State.schedule, A.from, A.to)
            .find(item => item.workerId === 'w_01').advances;
        const shown = Number(run('moneyOf(payrollRows()[0]).netted'));
        return { offers, deducted, shown };
    }

    // The half-open build: the writer says a repayment may be written, the carry says
    // nothing will read it. It must not offer the control.
    const half = await screen({ ledgerWrites: true, carryAdvances: false }, 'd_half_gate');
    check('with nothing to deduct it, no build offers a way to record a repayment',
        half.offers === false,
        JSON.stringify(half));

    // And the build that does offer it deducts what was handed back: 500 given, 200
    // returned, 300 off the wage.
    const both = await screen({ ledgerWrites: true, carryAdvances: true }, 'd_both_gates');
    check('and the build that offers it deducts what was handed back',
        both.offers === true && both.shown === -300,
        JSON.stringify(both));
}

// ============================================ the accounting example, exactly as agreed
//
// עומר סעד, the one worked example the design carries on every frame that shows money.
// There is no second example anywhere, so there is no second one here.
//
//   תקופה א׳ (07/08-20/08, closed)  0 → +5,000 cash on 10/08 → gross 3,050
//                                    → deducted 3,050 = min(5,000, 3,050)
//                                    → net 0 → closing balance 1,950
//   תקופה ב׳ (21/08-03/09, open)     opening 1,950 → −200 repaid on 24/08
//                                    → open debt today 1,750
//
//   the debt line: 0 ← 5,000 ← 1,950 ← 1,750
const OMER_A = { from: '2026-08-07', to: '2026-08-20' };
const OMER_B = { from: '2026-08-21', to: '2026-09-03' };

function omer(flags) {
    const device = makeDevice({ deviceId: 'd_omer', flags });
    device.setToday('2026-08-26');
    // 500 a day and 50 an hour: six pay-days and one hour is 3,050.
    device.State.schedule.workers = [
        { id: 'w_01', name: 'עומר סעד', active: true, dailyRate: 500, hourlyRate: 50 }];
    device.State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
    device.State.save({ silent: true });

    ['2026-08-07', '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13'].forEach(date =>
        device.State.commit(device.call('assignPlace', device.State.schedule,
            date, 'w_01', 'actual', 'p_01')));
    // The sixth day carries the single extra hour.
    device.State.commit(device.call('assignPlace', device.State.schedule,
        '2026-08-14', 'w_01', 'actual', 'p_01', 'extra', 1));

    device.State.commit(device.call('addAdvance', device.State.schedule,
        'w_01', '2026-08-10', 5000, ''));
    return device;
}

{
    suite('עומר סעד: the debt line 0 - 5,000 - 1,950 - 1,750');

    const device = omer({ carryAdvances: true, ledgerWrites: true });

    const gross = device.call('payrollReport', device.State.schedule,
        OMER_A.from, OMER_A.to).find(row => row.workerId === 'w_01').amount;
    given('six pay-days and one hour come to 3,050', gross === 3050, String(gross));

    const a = device.call('advanceAccount', device.State.schedule, 'w_01',
        OMER_A.from, OMER_A.to);
    same('תקופה א׳: 5,000 taken, 3,050 deducted at the cap, nothing to pay, 1,950 carried',
        [a.carriedIn, a.given, a.deducted, a.net, a.carriedOut],
        [0, 5000, 3050, 0, 1950]);

    const advanceId = Object.keys(device.State.schedule.advances)[0];
    device.State.commit(device.call('recordAdvanceRepaid', device.State.schedule,
        advanceId, 200, '2026-08-24', '', '2026-08-24T09:00:00.000Z', 'd_omer', 'cash'));

    const b = device.call('advanceAccount', device.State.schedule, 'w_01',
        OMER_B.from, OMER_B.to);
    same('תקופה ב׳: opening 1,950, 200 handed back, 1,750 still owed',
        [b.carriedIn, b.repaid, b.carriedOut], [1950, 200, 1750]);

    // תקופה א׳ CLOSES, and the deduction is written down. This is the act that makes the
    // payslip a record rather than a reckoning - see recordPeriodClosed.
    device.State.commit(device.call('recordPeriodClosed', device.State.schedule,
        advanceId, 'w_01', OMER_A.from, OMER_A.to, 3050,
        '2026-08-20T18:00:00.000Z', 'd_omer', 1950));
    const closedRow = device.call('advanceAccount', device.State.schedule, 'w_01',
        OMER_A.from, OMER_A.to);
    same('the closed period reports the same figures it was closed on',
        [closedRow.deducted, closedRow.net, closedRow.carriedOut, closedRow.closed],
        [3050, 0, 1950, true]);

    // THE INVARIANT THE OWNER SET, and the one thing that can break it: an entry dated
    // INSIDE a period that was already closed and paid. The form clamps a repayment to
    // the current account, but the wire does not - a phone that was offline for three
    // weeks, an import, a restore, all deliver back-dated entries. A closed payslip that
    // moves is a man handed one number in August and shown another in September.
    device.State.commit(device.call('recordAdvanceRepaid', device.State.schedule,
        advanceId, 400, '2026-08-15', 'הגיע מטלפון אחר', '2026-08-30T09:00:00.000Z',
        'd_other', 'cash'));

    const reprinted = device.call('advanceAccount', device.State.schedule, 'w_01',
        OMER_A.from, OMER_A.to);
    // THE WHOLE CLOSING ROW, not the two figures that happen to survive.
    //
    // Written first as `deducted === 3050 && net === 0`, and it passed - because the wage
    // was the binding half of min(5,000, 3,050), so a fourth of the balance could
    // disappear underneath it without either number moving. The one that moved was the
    // closing balance: 1,950 became 1,550, which is the number תקופה ב׳ opens on and the
    // number a man is told he still owes.
    //
    // A check that passes for the wrong reason is worse than no check, so this asks for
    // the row a reprint has to produce, whole.
    same('a back-dated entry does not move the closed payslip of תקופה א׳',
        [reprinted.carriedIn, reprinted.given,
            reprinted.deducted, reprinted.net, reprinted.carriedOut],
        [0, 5000, 3050, 0, 1950]);

    // AND THE 400 IS NOT LOST. Freezing the payslip and stopping there would take a
    // repayment a man actually made and reduce nothing with it, anywhere - money out of
    // the sum, which is the failure the freeze was meant to prevent, arrived at from the
    // other side. It moves into the period that is open.
    check('but the money he handed back is carried into the open period, not lost',
        reprinted.carriedForward === 1550 && reprinted.lateSinceClose === -400,
        JSON.stringify([reprinted.carriedOut, reprinted.carriedForward,
            reprinted.lateSinceClose]));

    const after = device.call('advanceAccount', device.State.schedule, 'w_01',
        OMER_B.from, OMER_B.to);
    same('so תקופה ב׳ opens on 1,550 and owes 1,350 after the 200 he handed back in it',
        [after.carriedIn, after.repaid, after.carriedForward],
        [1550, 200, 1350]);
}

// ------------------------------------------- the two labels that must never trade places
{
    suite('היסטורי מול נוכחי: two labels, two numbers, never swapped');

    const vm = (await import('node:vm')).default;
    const { readFileSync } = await import('node:fs');

    const device = omer({ carryAdvances: true, ledgerWrites: true });
    const advanceId = Object.keys(device.State.schedule.advances)[0];
    device.State.commit(device.call('recordPeriodClosed', device.State.schedule,
        advanceId, 'w_01', OMER_A.from, OMER_A.to, 3050,
        '2026-08-20T18:00:00.000Z', 'd_omer', 1950));
    device.State.commit(device.call('recordAdvanceRepaid', device.State.schedule,
        advanceId, 200, '2026-08-24', '', '2026-08-24T09:00:00.000Z', 'd_omer', 'cash'));

    const run = code => vm.runInContext(code, device.ctx, { filename: 'harness:reports' });
    run(readFileSync(new URL('../js/ui/sitecolor.js', import.meta.url), 'utf8'));
    run(readFileSync(new URL('../js/ui/reports.js', import.meta.url), 'utf8'));

    // The CLOSED period. Its figures are a record, and the sheet says so before it says
    // anything else.
    run(`REPORT_RANGE.from = '${OMER_A.from}'; REPORT_RANGE.to = '${OMER_A.to}';`
        + `REPORT_SECTION = 'workers'; INVOICE_PLACE = null;`);
    const closedSheet = run('payrollSheetRows()');
    const noteAt = closedSheet[0].indexOf('הערה');
    const closedNote = String((closedSheet.find(r => r[0] === 'עומר סעד') || [])[noteAt]);
    check('a closed period says it is closed, and names its יתרת סגירה',
        closedNote.indexOf('החשבון נסגר ולא ישתנה') !== -1
        && closedNote.indexOf('יתרת סגירה 1950 ₪') !== -1,
        JSON.stringify(closedNote));
    check('and never calls that historical figure a חוב פתוח',
        closedNote.indexOf('חוב פתוח') === -1, JSON.stringify(closedNote));

    // The OPEN period. Its figure is live.
    run(`REPORT_RANGE.from = '${OMER_B.from}'; REPORT_RANGE.to = '${OMER_B.to}';`);
    const openSheet = run('payrollSheetRows()');
    const openNote = String((openSheet.find(r => r[0] === 'עומר סעד') || [])[noteAt]);
    check('an open period never claims to be closed',
        openNote.indexOf('החשבון נסגר') === -1 && openNote.indexOf('יתרת סגירה') === -1,
        JSON.stringify(openNote));
    check('and carries the opening balance it inherited',
        openNote.indexOf('1950 ₪ מקדמה מחשבון קודם') !== -1, JSON.stringify(openNote));
}

// ------------------------------------------------- a mistake is reversed, never deleted
{
    suite('תנועת ביטול: both rows stay, and the balance comes back');

    // The design's AdvReverse example, exactly: a 300 advance recorded by mistake on
    // 25/08, and a reversal of −300 carrying the reason "נרשם פעמיים בטעות". Two lines
    // remain in the ledger and the balance returns to 1,750.
    //
    // This is the confirmed rule that the ledger's existing 'cancelled' kind does not
    // keep: cancelling drops the advance out of the fold entirely, which is a deletion
    // wearing another word. Nothing in the app has ever called it - there is no
    // production caller - so no record has been lost to it, and the kind that replaces
    // it compensates rather than removes.
    const device = omer({ carryAdvances: true, ledgerWrites: true });
    const advanceId = Object.keys(device.State.schedule.advances)[0];
    device.State.commit(device.call('recordPeriodClosed', device.State.schedule,
        advanceId, 'w_01', OMER_A.from, OMER_A.to, 3050,
        '2026-08-20T18:00:00.000Z', 'd_omer', 1950));
    device.State.commit(device.call('recordAdvanceRepaid', device.State.schedule,
        advanceId, 200, '2026-08-24', '', '2026-08-24T09:00:00.000Z', 'd_omer', 'cash'));

    const before = device.call('advanceAccount', device.State.schedule, 'w_01',
        OMER_B.from, OMER_B.to).carriedForward;
    given('he owes 1,750 before the mistake', before === 1750, String(before));

    // The mistake: a second 300 nobody handed over.
    const wrong = device.call('addAdvance', device.State.schedule,
        'w_01', '2026-08-25', 300, '');
    device.State.commit(wrong);
    const withWrong = device.call('advanceAccount', device.State.schedule, 'w_01',
        OMER_B.from, OMER_B.to).carriedForward;
    given('and 2,050 with it', withWrong === 2050, String(withWrong));

    // The reversal, with its reason.
    const undo = device.call('recordAdvanceReversed', device.State.schedule,
        wrong.value.id, 300, '2026-08-25', 'נרשם פעמיים בטעות',
        '2026-08-25T10:00:00.000Z', 'd_omer');
    device.State.commit(undo);

    const after = device.call('advanceAccount', device.State.schedule, 'w_01',
        OMER_B.from, OMER_B.to).carriedForward;
    check('the balance comes back to 1,750', after === 1750, String(after));

    // BOTH ROWS. A reversal that hides the row it reverses is a deletion with extra steps.
    const entries = device.State.schedule.ledger.advances;
    const rows = Object.keys(entries).map(id => entries[id])
        .filter(entry => String(entry.advanceId) === String(wrong.value.id));
    check('and both lines are still in the ledger, the mistake and its reversal',
        rows.length === 2 && rows.some(r => r.kind === 'reversed'),
        JSON.stringify(rows.map(r => [r.kind, r.amount])));
    check('the reversal carries the reason it was made for',
        rows.filter(r => r.kind === 'reversed')[0].reason === 'נרשם פעמיים בטעות',
        JSON.stringify(rows.filter(r => r.kind === 'reversed')[0]));

    // A reversal with no reason is not a reversal; it is an unexplained edit to money.
    const noReason = { id: 'le_x', advanceId: wrong.value.id, kind: 'reversed',
        amount: 300, date: '2026-08-25' };
    check('a reversal with no reason is refused',
        device.call('ledgerEntryProblems', 'le_x', noReason).length > 0,
        JSON.stringify(device.call('ledgerEntryProblems', 'le_x', noReason)));
    check('and one that gives back more than was ever given is refused too',
        device.call('ledgerEntryProblems', 'le_x', Object.assign({}, noReason,
            { reason: 'למה', amount: -5 })).length > 0,
        JSON.stringify(device.call('ledgerEntryProblems', 'le_x',
            Object.assign({}, noReason, { reason: 'למה', amount: -5 }))));
}

report();
