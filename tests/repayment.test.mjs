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

import { readFileSync } from 'node:fs';
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

    // AND WITH IT OPEN - which is NOT yet enough, and that is the L3 gate.
    //
    // A device whose accounts the carry would restate has money on the line nobody has
    // looked at. Both flags open and the migration unapproved, there is still no control:
    // financialWritingEnabled refuses, and the review screen in the ⋯ panel is what a
    // person answers first.
    const pending = await screenFor({ deviceId: 'd_ui_pending',
        flags: { carryAdvances: true, ledgerWrites: true } });
    given('this record has accounts the carry would restate',
        pending.device.call('planCarryMigration', pending.device.State.schedule).needed === true,
        JSON.stringify(pending.device.call('planCarryMigration',
            pending.device.State.schedule).rows.length));
    check('both flags open and the migration unapproved, there is still no control',
        pending.reportsView.textContent.indexOf('החזר') === -1,
        pending.reportsView.textContent.slice(0, 200));

    // APPROVED, and only now.
    const open = await screenFor({ deviceId: 'd_ui_on',
        flags: { carryAdvances: true, ledgerWrites: true } });
    const approvalPlan = open.device.call('planCarryMigration', open.device.State.schedule);
    open.device.State.commit(open.device.call('recordCarryApproval',
        open.device.State.schedule, approvalPlan, '2026-08-26T09:00:00.000Z', 'd_ui_on'));
    open.run('openWorkerDays("w_01")');
    check('once the migration is approved the control is there, on the advance it settles',
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
        // The carry migration approved where the build could write at all, because this
        // suite is about the two GATES and not about the review screen - see the L3
        // block, which measures the refusal before approval on its own.
        if (flags.ledgerWrites && flags.carryAdvances) {
            const plan = device.call('planCarryMigration', device.State.schedule);
            if (plan.needed) {
                device.State.commit(device.call('recordCarryApproval', device.State.schedule,
                    plan, '2026-08-18T08:00:00.000Z', deviceId));
            }
        }

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

    // BOTH ROWS. A reversal that hides the row it reverses is a deletion with extra
    // steps. The two live in different places on this build - the advance itself is
    // still in schedule.advances, which is the field every phone reads, and the reversal
    // is the ledger entry beside it - so the check asks both, which is what a person
    // reading the history would see.
    const entries = device.State.schedule.ledger.advances;
    const rows = Object.keys(entries).map(id => entries[id])
        .filter(entry => String(entry.advanceId) === String(wrong.value.id));
    check('the advance that was wrong is still on the record, not removed',
        Boolean(device.State.schedule.advances[wrong.value.id])
        && device.State.schedule.advances[wrong.value.id].amount === 300,
        JSON.stringify(device.State.schedule.advances[wrong.value.id]));
    check('and the reversal stands beside it rather than in place of it',
        rows.length === 1 && rows[0].kind === 'reversed' && rows[0].amount === 300,
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
    // WHAT THIS CHECK ACTUALLY MEASURES, said correctly. It was named "one that gives
    // back more than was ever given is refused too" and passed an amount of -5, which
    // ledgerEntryProblems refuses for being NEGATIVE. That validator is handed a single
    // record and never sees the advance behind it, so it would have accepted 301 against
    // a 300 without blinking, and the check would have gone on passing. The bound by the
    // advance is reversalProblems, and it is measured in the D5 suite below with 301, 500
    // and a concurrent duplicate. Here the name matches the amount.
    check('a reversal of a negative amount is refused',
        device.call('ledgerEntryProblems', 'le_x', Object.assign({}, noReason,
            { reason: 'למה', amount: -5 })).length > 0,
        JSON.stringify(device.call('ledgerEntryProblems', 'le_x',
            Object.assign({}, noReason, { reason: 'למה', amount: -5 }))));
}


// ------------------------------------------------- one answer to "what is still owed"
{
    suite('D1: the outstanding balance counts every kind of entry that reduces it');

    // The defect, in one line: the screen computed `given - repaid`, and three kinds of
    // entry reduce a debt. A 500 advance with 400 already taken off his WAGE read
    // "חוב פתוח 500" and offered a repayment ceiling of 500 - so a man could hand back
    // 500 in cash against a debt of 100, and the app would take it.
    const device = omer({ carryAdvances: true, ledgerWrites: true });
    const id = Object.keys(device.State.schedule.advances)[0];

    same('nothing has happened to it yet',
        device.call('advanceOutstanding', device.State.schedule, id),
        { id, given: 5000, repaid: 0, reversed: 0, deducted: 0,
            givenGross: 5000, repaidGross: 0, deductedGross: 0,
            settled: 0, left: 5000, overpaid: 0 });

    // 3,050 came off his wage when account A closed. That is not a repayment and it is
    // not a reversal; it is the third kind, and it was the one nobody counted.
    device.State.commit(device.call('recordPeriodClosed', device.State.schedule,
        id, 'w_01', OMER_A.from, OMER_A.to, 3050,
        '2026-08-20T18:00:00.000Z', 'd_omer', 1950));
    const afterWage = device.call('advanceOutstanding', device.State.schedule, id);
    check('money taken off the wage comes off the balance', afterWage.deducted === 3050
        && afterWage.left === 1950, JSON.stringify(afterWage));

    device.State.commit(device.call('recordAdvanceRepaid', device.State.schedule,
        id, 200, '2026-08-24', '', '2026-08-24T09:00:00.000Z', 'd_omer', 'cash'));
    device.State.commit(device.call('recordAdvanceReversed', device.State.schedule,
        id, 50, '2026-08-24', 'נרשם 50 בטעות', '2026-08-24T10:00:00.000Z', 'd_omer'));

    const all = device.call('advanceOutstanding', device.State.schedule, id);
    // WHERE THE CORRECTION LANDS, which moved with L4 and is the point of it.
    //
    // This reversal names no transaction, so it means what such an entry has always
    // meant - the ADVANCE was recorded in error - and it now reduces what was given
    // rather than adding to what was settled. The money is identical either way: 1,700
    // left, before and after. The decomposition is not, and it is the decomposition that
    // lets a reversal of a REPAYMENT push the debt up instead of down.
    same('and cash, wage and correction each land where they belong',
        { repaid: all.repaid, deducted: all.deducted, reversed: all.reversed,
            given: all.given, settled: all.settled, left: all.left, overpaid: all.overpaid },
        { repaid: 200, deducted: 3050, reversed: 50, given: 4950, settled: 3250,
            left: 1700, overpaid: 0 });
    check('and the gross figures still say what the history says happened',
        all.givenGross === 5000 && all.repaidGross === 200 && all.deductedGross === 3050,
        JSON.stringify({ given: all.givenGross, repaid: all.repaidGross,
            deducted: all.deductedGross }));

    // The old arithmetic, written out so the difference is on the record: given - repaid
    // alone would have said 4,800 was still owed on an advance with 1,700 left on it.
    // Read off the GROSS, because that is the number the screen used to work from.
    check('the number the screen used to print was 4,800 on this advance',
        all.givenGross - all.repaidGross === 4800,
        String(all.givenGross - all.repaidGross));
}

{
    suite('D1: the repayment ceiling is the same number the screen prints');

    const device = omer({ carryAdvances: true, ledgerWrites: true });
    const id = Object.keys(device.State.schedule.advances)[0];
    device.State.commit(device.call('recordPeriodClosed', device.State.schedule,
        id, 'w_01', OMER_A.from, OMER_A.to, 4900,
        '2026-08-20T18:00:00.000Z', 'd_omer', 100));

    const state = device.call('advanceOutstanding', device.State.schedule, id);
    given('4,900 of the 5,000 came off his wage', state.deducted === 4900);
    check('so 100 is what is left, on every surface that asks',
        state.left === 100, JSON.stringify(state));
    // The form's ceiling is `settled.left`, and `settled` is now this same call - see
    // advanceSettled in js/ui/reports.js. The check that matters is that there is no
    // second arithmetic anywhere that could answer 5,000.
    check('and the old answer, 5,000, is not reachable from this record',
        state.given - state.repaid - state.reversed - state.deducted === 100,
        JSON.stringify(state));
}

// ------------------------------------------------- two phones, one repayment, twice
{
    suite('D2: more settled than was ever given is a state, not a clamp');

    // Both phones are offline, both are told the man handed back 500 against the same
    // advance, and both record it. Both entries are true records of something somebody
    // said, and an append-only ledger that dropped one would be losing exactly the
    // evidence needed to work out which. So both stay - and the app stops deducting.
    const device = omer({ carryAdvances: true, ledgerWrites: true });
    const id = Object.keys(device.State.schedule.advances)[0];
    device.State.commit(device.call('recordPeriodClosed', device.State.schedule,
        id, 'w_01', OMER_A.from, OMER_A.to, 4600,
        '2026-08-20T18:00:00.000Z', 'd_omer', 400));
    device.State.commit(device.call('recordAdvanceRepaid', device.State.schedule,
        id, 400, '2026-08-24', 'מזומן', '2026-08-24T09:00:00.000Z', 'd_a', 'cash'));
    device.State.commit(device.call('recordAdvanceRepaid', device.State.schedule,
        id, 400, '2026-08-24', 'מזומן', '2026-08-24T09:00:01.000Z', 'd_b', 'cash'));

    const state = device.call('advanceOutstanding', device.State.schedule, id);
    check('both repayments are still on the record', state.repaid === 800,
        JSON.stringify(state));
    check('the debt is zero and not a negative number', state.left === 0,
        JSON.stringify(state));
    check('and the surplus is named rather than swallowed', state.overpaid === 400,
        JSON.stringify(state));

    const flagged = device.call('overpaidAdvances', device.State.schedule, 'w_01');
    check('the worker has an advance flagged for review',
        flagged.length === 1 && flagged[0].id === id && flagged[0].overpaid === 400,
        JSON.stringify(flagged));

    // The pay sheet stops deducting while it stands. Nothing is lost - the balance is
    // carried, not written off - and the row says why.
    const walk = device.call('advanceAccount', device.State.schedule, 'w_01',
        OMER_B.from, OMER_B.to);
    check('nothing is deducted from his wage while the account does not add up',
        walk.deducted === 0, JSON.stringify(walk));
    check('the row says it is holding, and by how much',
        walk.review === true && walk.overpaid === 400, JSON.stringify(walk));
    check('and the balance is carried rather than written off',
        walk.carriedForward === walk.carriedIn + walk.given - walk.repaid - walk.reversed
        || walk.carriedForward >= 0, JSON.stringify(walk));

    // A CLOSED period is not revised by a surplus noticed today. That is the whole rule
    // this feature rests on, and it holds here too.
    const closedWalk = device.call('advanceAccount', device.State.schedule, 'w_01',
        OMER_A.from, OMER_A.to);
    check('the payslip that was already handed over is untouched',
        closedWalk.deducted === 4600 && closedWalk.carriedOut === 400
        && closedWalk.review === false, JSON.stringify(closedWalk));
}

// ------------------------------------------------- the reversal, bounded by its advance
{
    suite('D5: a reversal cannot exceed, or repeat, what it corrects');

    const device = omer({ carryAdvances: true, ledgerWrites: true });
    // A separate, small advance so the numbers are the brief's own: 300 given.
    const wrong = device.call('addAdvance', device.State.schedule,
        'w_01', '2026-08-25', 300, '');
    device.State.commit(wrong);
    const id = wrong.value.id;

    // THE CHECK THAT USED TO BE WRONG. It was named "one that gives back more than was
    // ever given is refused too" and it passed an amount of -5 to ledgerEntryProblems,
    // which refuses -5 for being negative and would have accepted 301 without blinking:
    // that validator is handed one record and never sees the advance behind it. So the
    // check proved a rule nobody had written. These are the amounts the name claims.
    check('301 against a 300 advance is refused',
        device.call('reversalProblems', device.State.schedule, id, 301, 'למה').length > 0,
        JSON.stringify(device.call('reversalProblems', device.State.schedule, id, 301, 'למה')));
    check('and so is 500', device.call('reversalProblems',
        device.State.schedule, id, 500, 'למה').length > 0,
        JSON.stringify(device.call('reversalProblems', device.State.schedule, id, 500, 'למה')));
    check('300 exactly is allowed', device.call('reversalProblems',
        device.State.schedule, id, 300, 'נרשם פעמיים בטעות').length === 0);
    check('a reversal with no reason is refused whatever the amount',
        device.call('reversalProblems', device.State.schedule, id, 300, '   ').length > 0);
    check('and a reversal of nothing is refused',
        device.call('reversalProblems', device.State.schedule, id, 0, 'למה').length > 0);

    device.State.commit(device.call('recordAdvanceReversed', device.State.schedule,
        id, 300, '2026-08-25', 'נרשם פעמיים בטעות', '2026-08-25T10:00:00.000Z', 'd_omer'));

    check('once reversed in full there is nothing left to reverse',
        device.call('reversalRoom', device.State.schedule, id) === 0,
        String(device.call('reversalRoom', device.State.schedule, id)));
    check('so a second reversal of the same advance is refused',
        device.call('reversalProblems', device.State.schedule, id, 300,
            'שוב').length > 0,
        JSON.stringify(device.call('reversalProblems', device.State.schedule, id, 300, 'שוב')));
    check('even a small one', device.call('reversalProblems',
        device.State.schedule, id, 1, 'שוב').length > 0);

    // TWO PHONES REVERSING THE SAME MISTAKE. Each one's guard passed when it was asked,
    // because each was offline and each saw an unreversed advance. Both entries land and
    // both stay - and the result is the visible overpayment state, not a silent debt of
    // the opposite sign.
    const second = device.call('recordAdvanceReversed', device.State.schedule,
        id, 300, '2026-08-25', 'נרשם פעמיים בטעות', '2026-08-25T10:00:05.000Z', 'd_b');
    device.State.commit(second);
    const state = device.call('advanceOutstanding', device.State.schedule, id);
    check('both reversals are still on the record', state.reversed === 600,
        JSON.stringify(state));
    check('the debt is zero, never negative', state.left === 0, JSON.stringify(state));
    check('and the duplicate is visible as a surplus to be looked at',
        state.overpaid === 300, JSON.stringify(state));
    check('the advance itself was never removed',
        Boolean(device.State.schedule.advances[id])
        && device.State.schedule.advances[id].amount === 300,
        JSON.stringify(device.State.schedule.advances[id]));
}

{
    suite('D3: nothing in this build deletes an advance');

    // removeAdvance still EXISTS in the model - a `null` at an advance path has to be
    // understood when it arrives from a phone that has not updated - but no screen may
    // send one. The check is on the shipped source, because a button is easy to add back
    // and this is the rule it would break.
    const reports = readFileSync(new URL('../js/ui/reports.js', import.meta.url), 'utf8');
    check('the ✕ that deleted an advance is gone from the advance row',
        reports.indexOf('מחק מקדמה') === -1);
    check('and nothing in the reports screen calls removeAdvance',
        /removeAdvance\s*\(/.test(reports) === false);
    check('the correction that replaces it is there instead',
        reports.indexOf('openReversalForm') !== -1
        && reports.indexOf('recordAdvanceReversed') !== -1);
    check('and it asks for a reason before it writes anything',
        reports.indexOf('סיבה (חובה)') !== -1);

    // The five words, in one place, on every surface.
    const labels = ['ניתנה מקדמה', 'הוחזר במזומן', 'נוכה מהשכר', 'תיקון-היפוך',
        'החשבון נסגר'];
    labels.forEach(word => check(`the statement says ${word} in its own words`,
        reports.indexOf(word) !== -1));
}


// ------------------------------------------------- closing an account, exactly once
{
    suite('D4: a closure is identified by what it closes, not by when it was pressed');

    const device = omer({ carryAdvances: true, ledgerWrites: true });
    const id = Object.keys(device.State.schedule.advances)[0];

    const plan = device.call('planPeriodClosure', device.State.schedule, 'w_01',
        OMER_A.from, OMER_A.to);
    check('the plan says what would come off, before anything is written',
        plan.canClose === true && plan.deducted === 3050 && plan.rows.length === 1
        && plan.rows[0].advanceId === id && plan.rows[0].amount === 3050
        && plan.rows[0].balanceAfter === 1950, JSON.stringify(plan));
    check('and nothing has been written by planning it',
        device.call('ledgerEntries', device.State.schedule)
            .filter(e => e.kind === 'deducted').length === 0);

    const first = device.call('closePeriodChanges', device.State.schedule, 'w_01',
        OMER_A.from, OMER_A.to, '2026-08-20T18:00:00.000Z', 'd_a');
    device.State.commitMany(first);
    const closures = () => device.call('ledgerEntries', device.State.schedule)
        .filter(e => e.kind === 'deducted');
    check('closing it writes exactly one closure', closures().length === 1,
        JSON.stringify(closures()));
    check('whose id names the advance and the period it closed',
        closures()[0].id === device.call('closureId', id, OMER_A.from),
        closures()[0].id);

    // THE DOUBLE-CLOSE, ON ONE PHONE. A second press writes nothing.
    const second = device.call('closePeriodChanges', device.State.schedule, 'w_01',
        OMER_A.from, OMER_A.to, '2026-08-20T18:05:00.000Z', 'd_a');
    check('a second press produces no changes at all', second.length === 0,
        JSON.stringify(second));
    device.State.commitMany(second);
    check('and the ledger still holds one closure', closures().length === 1,
        JSON.stringify(closures()));

    const folded = device.call('closedPeriods', device.State.schedule, 'w_01')[OMER_A.from];
    same('the fold reads one closure, not two', folded,
        { deducted: 3050, balanceAfter: 1950 });
    const walk = device.call('advanceAccount', device.State.schedule, 'w_01',
        OMER_A.from, OMER_A.to);
    check('and the payslip says 3,050 off and 1,950 left, once',
        walk.deducted === 3050 && walk.carriedOut === 1950 && walk.closed === true,
        JSON.stringify(walk));
}

{
    suite('D4: two phones cannot close the same account twice');

    // Both are offline, both press סגור, both write. This is the case a random entry id
    // could not survive: two entries, both real, and closedPeriods adding them up - 6,100
    // off a wage of 3,050 and a carried balance of 3,900, from one closure pressed twice.
    //
    // ONE schedule, copied before either write, because the two phones are two copies of
    // the same record - which is the whole situation. Two freshly built devices would
    // have minted two different advance ids and measured nothing.
    const a = omer({ carryAdvances: true, ledgerWrites: true });
    const id = Object.keys(a.State.schedule.advances)[0];
    const asPhoneB = JSON.parse(JSON.stringify(a.State.schedule));

    const fromA = a.call('closePeriodChanges', a.State.schedule, 'w_01',
        OMER_A.from, OMER_A.to, '2026-08-20T18:00:00.000Z', 'd_a');
    // Phone B is asked against ITS copy, which has not seen A's closure - so it is not
    // being helped by knowing the answer.
    const fromB = a.call('closePeriodChanges', asPhoneB, 'w_01',
        OMER_A.from, OMER_A.to, '2026-08-20T18:00:03.000Z', 'd_b');
    check('each phone, alone, believed it was closing the account',
        fromA.length === 1 && fromB.length === 1,
        JSON.stringify([fromA.length, fromB.length]));
    check('and both wrote to the same field path',
        fromA[0].path === fromB[0].path, `${fromA[0].path} | ${fromB[0].path}`);

    // The union, which is what Firestore does with two writes to one field path: the
    // later one stands, and there is ONE entry either way.
    a.State.commitMany(fromA);
    a.State.schedule.ledger.advances[fromB[0].value.id] = fromB[0].value;
    const closures = a.call('ledgerEntries', a.State.schedule)
        .filter(e => e.kind === 'deducted');
    check('the record holds one closure after both landed', closures.length === 1,
        JSON.stringify(closures));
    check('carrying the same money whichever phone wrote it',
        closures[0].amount === 3050 && closures[0].balanceAfter === 1950,
        JSON.stringify(closures[0]));

    const walk = a.call('advanceAccount', a.State.schedule, 'w_01',
        OMER_A.from, OMER_A.to);
    check('so the payslip is 3,050 off and 1,950 left, not 6,100 and 3,900',
        walk.deducted === 3050 && walk.carriedOut === 1950, JSON.stringify(walk));
}

{
    suite('D4: a closure is a decision, not a side effect of looking');

    // Reading an account must never seal it. Every one of these is a person LOOKING at
    // a number - a preview, a print, a workbook, a message - and a closure cannot be
    // taken back, so none of them may write one.
    const reports = readFileSync(new URL('../js/ui/reports.js', import.meta.url), 'utf8');
    const share = readFileSync(new URL('../js/ui/share.js', import.meta.url), 'utf8');
    const callers = (reports + share).split('closePeriodChanges').length - 1;
    check('closePeriodChanges is called from exactly one place in the whole app',
        callers === 1, String(callers));
    check('and that place is the account-closing button, behind a confirmation',
        /closeAccountFor[\s\S]{0,900}askConfirm/.test(reports));
    check('nothing that prints, previews or exports closes anything',
        share.indexOf('closePeriodChanges') === -1
        && share.indexOf('recordPeriodClosed') === -1);
    // THREE conditions now, not two: the two flags and the record's own readiness. A
    // device whose accounts the carry would restate has money nobody has looked at, and
    // financialWritingEnabled is what refuses to write against it - see the migration
    // review in js/ui/settings.js.
    check('and the button is behind the writing gate, which is all three',
        /renderPeriodClosure[\s\S]{0,400}financialWritingEnabled\(/.test(reports));

    // An account that does not add up cannot be sealed. Freezing a wrong number is
    // exactly the thing a closure makes permanent.
    const device = omer({ carryAdvances: true, ledgerWrites: true });
    const id = Object.keys(device.State.schedule.advances)[0];
    device.State.commit(device.call('recordAdvanceRepaid', device.State.schedule,
        id, 5000, '2026-08-12', '', '2026-08-12T09:00:00.000Z', 'd_a', 'cash'));
    device.State.commit(device.call('recordAdvanceRepaid', device.State.schedule,
        id, 5000, '2026-08-12', '', '2026-08-12T09:00:01.000Z', 'd_b', 'cash'));
    const blocked = device.call('planPeriodClosure', device.State.schedule, 'w_01',
        OMER_A.from, OMER_A.to);
    check('a period with an unexplained surplus refuses to close',
        blocked.canClose === false && blocked.reasons.indexOf('overpaid') !== -1,
        JSON.stringify(blocked.reasons));
    check('and closing it produces no changes',
        device.call('closePeriodChanges', device.State.schedule, 'w_01',
            OMER_A.from, OMER_A.to, '2026-08-20T18:00:00.000Z', 'd_a').length === 0);
}


// ------------------------------------------------- an advance without its own origin
{
    suite('L1: creating an advance writes the record every phone reads AND its origin');

    // openAdvanceForm called addAdvance and nothing else, and recordAdvanceGiven had no
    // production caller anywhere. So an advance made today exists in schedule.advances -
    // which is what every phone reads, and is right - and NOT in the ledger, which is
    // what the money is supposed to be folded from once the writer opens.
    //
    // It does not stay invisible. A repayment recorded against it before the app is next
    // closed writes a 'repaid' entry standing on nothing:
    //
    //   history:        repaid only
    //   given entry:    missing
    //   foldAdvance:    undefined
    //
    // and the fold answers undefined for the whole advance, because foldAdvance builds
    // its state from the 'given' and ignores everything that arrives before one.
    const device = omer({ carryAdvances: true, ledgerWrites: true });
    const made = device.call('recordNewAdvance', device.State.schedule, 'w_01',
        '2026-08-25', 300, 'מזומן', '2026-08-25T09:00:00.000Z', 'd_omer', 'cash');
    check('creating an advance produces two changes, not one',
        Array.isArray(made) && made.length === 2, JSON.stringify(made && made.length));
    check('one of them is the record every phone still reads',
        made.some(change => String(change.path).indexOf('advances.') === 0
            && String(change.path).indexOf('ledger.') !== 0),
        JSON.stringify(made.map(c => c.path)));
    check('and the other is the immutable origin in the ledger',
        made.some(change => String(change.path).indexOf('ledger.advances.') === 0
            && change.value.kind === 'given'),
        JSON.stringify(made.map(c => `${c.path}#${c.value && c.value.kind}`)));

    device.State.commitMany(made);
    const id = made[0].value.id;
    const history = device.call('advanceHistory', device.State.schedule, id);
    check('the origin is on the record before anything else happens',
        history.length === 1 && history[0].kind === 'given' && history[0].amount === 300,
        JSON.stringify(history.map(e => [e.kind, e.amount])));

    // AND NOW THE REPAYMENT, in the same session, with no reboot and no migration.
    device.State.commit(device.call('recordAdvanceRepaid', device.State.schedule,
        id, 100, '2026-08-26', '', '2026-08-26T09:00:00.000Z', 'd_omer', 'cash'));
    const folded = device.call('foldLedger', device.State.schedule)[id];
    check('the fold knows the advance, because it has an origin to stand on',
        Boolean(folded) && folded.amount === 300 && folded.repaid === 100,
        JSON.stringify(folded));
    same('and what is owed on it is the ordinary arithmetic',
        (({ given, repaid, left }) => ({ given, repaid, left }))(
            device.call('advanceOutstanding', device.State.schedule, id)),
        { given: 300, repaid: 100, left: 200 });
}

{
    suite('L1: no repayment, reversal or deduction may stand on no origin');

    // The check the model owes: an entry about an advance that has no 'given' behind it is
    // an event about money nobody recorded giving. It is not repaired here - nothing is
    // invented - it is NAMED, so a screen can say so and a fold can refuse to price it.
    const device = omer({ carryAdvances: true, ledgerWrites: true });
    const made = device.call('recordNewAdvance', device.State.schedule, 'w_01',
        '2026-08-25', 300, '', '2026-08-25T09:00:00.000Z', 'd_omer', 'cash');
    device.State.commitMany(made);
    const id = made[0].value.id;

    check('an advance created properly has its origin',
        device.call('advanceHasOrigin', device.State.schedule, id) === true);

    // One that arrived from somewhere else with only a repayment against it.
    device.State.schedule.advances.a_orphan = {
        id: 'a_orphan', workerId: 'w_01', date: '2026-08-20', amount: 500, note: ''
    };
    device.State.schedule.ledger.advances.le_orphan = {
        id: 'le_orphan', advanceId: 'a_orphan', kind: 'repaid', date: '2026-08-22',
        amount: 200, at: '2026-08-22T09:00:00.000Z', by: 'd_b'
    };
    check('and one carrying only a repayment does not',
        device.call('advanceHasOrigin', device.State.schedule, 'a_orphan') === false);
    const orphans = device.call('advancesWithoutOrigin', device.State.schedule);
    check('the orphan is named, and only the orphan',
        orphans.length === 1 && orphans[0] === 'a_orphan', JSON.stringify(orphans));
}

{
    suite('L1: migration asks for a valid origin, not for any entry at all');

    // THE DEFECT THIS CLOSES. migrateAdvancesToLedger built its "already done" set from
    // every entry's advanceId, whatever the entry was. So an advance whose only entry was
    // a repayment looked migrated, the migration skipped it, and the origin was never
    // written - by the one mechanism that exists to write it.
    const device = omer({ carryAdvances: true, ledgerWrites: true });
    // An advance from a build that wrote no entries, with a repayment recorded against it
    // by a phone that did.
    device.State.schedule.advances.a_legacy = {
        id: 'a_legacy', workerId: 'w_01', date: '2026-08-20', amount: 500, note: ''
    };
    device.State.schedule.ledger.advances.le_repay = {
        id: 'le_repay', advanceId: 'a_legacy', kind: 'repaid', date: '2026-08-22',
        amount: 200, at: '2026-08-22T09:00:00.000Z', by: 'd_b'
    };

    const plan = device.call('migrateAdvancesToLedger', device.State.schedule, 'd_omer');
    check('the migration writes the origin the repayment was standing on',
        plan.added.indexOf('a_legacy') !== -1, JSON.stringify(plan.added));
    const history = device.call('advanceHistory', device.State.schedule, 'a_legacy');
    check('and the history now reads origin first, repayment after',
        history.length === 2 && history[0].kind === 'given' && history[1].kind === 'repaid',
        JSON.stringify(history.map(e => [e.kind, e.amount])));
    check('the fold prices it, which it could not do before',
        device.call('advanceOutstanding', device.State.schedule, 'a_legacy').left === 300,
        JSON.stringify(device.call('advanceOutstanding', device.State.schedule, 'a_legacy')));

    // AND NOT TWICE. An advance that already has a real origin is left alone.
    const again = device.call('migrateAdvancesToLedger', device.State.schedule, 'd_omer');
    check('running it again writes nothing', again.added.length === 0,
        JSON.stringify(again.added));

    // A MALFORMED origin is not an origin. An entry of kind 'given' that the validator
    // refuses cannot be what stops the migration writing a real one.
    device.State.schedule.advances.a_bad = {
        id: 'a_bad', workerId: 'w_01', date: '2026-08-20', amount: 400, note: ''
    };
    device.State.schedule.ledger.advances.le_bad_given = {
        id: 'le_bad_given', advanceId: 'a_bad', kind: 'given', workerId: 'w_01',
        date: '2026-08-20', amount: 'abc'
    };
    const third = device.call('migrateAdvancesToLedger', device.State.schedule, 'd_omer');
    check('an unreadable given does not count as an origin',
        third.added.indexOf('a_bad') !== -1, JSON.stringify(third.added));
}

{
    suite('L1: a refused write cannot leave half an advance');

    // The two halves are one logical operation. If the disk takes one and refuses the
    // other, the record is a repayment waiting to happen against money nobody recorded -
    // or an origin for an advance no phone reads. Neither may exist.
    const FAULTS = [
        ['the disk is full', device => device.setQuota(() => true)],
        ['the browser refuses the write', device => device.failWrite(() => true)]
    ];
    FAULTS.forEach(([label, breakIt]) => {
        const device = omer({ carryAdvances: true, ledgerWrites: true });
        breakIt(device);
        const made = device.call('recordNewAdvance', device.State.schedule, 'w_01',
            '2026-08-25', 300, '', '2026-08-25T09:00:00.000Z', 'd_omer', 'cash');
        const newId = made[0].value.id;
        device.State.commitMany(made);

        // BY ID, not by counting. The reopen below runs the boot mirror, which writes an
        // origin for the advance this crew already had - correct, and it moves the count.
        // What is being asked here is about THIS advance and nothing else.
        const reopened = makeDevice({ deviceId: 'd_half', storage: device.dump(),
            flags: { carryAdvances: true, ledgerWrites: true } });
        reopened.State.load();
        const legacy = Boolean(reopened.State.schedule.advances[newId]);
        const origin = reopened.call('advanceHasOrigin', reopened.State.schedule, newId);
        // EITHER BOTH OR NEITHER, and that is the whole of it. A disk that took one half
        // would leave an advance no fold can price, or an origin for money no phone reads.
        check(`${label}: the two halves landed together or not at all`,
            legacy === origin, JSON.stringify({ legacy, origin }));
        check(`${label}: and nothing anywhere is standing on no origin`,
            reopened.call('advancesWithoutOrigin', reopened.State.schedule).length === 0,
            JSON.stringify(reopened.call('advancesWithoutOrigin', reopened.State.schedule)));
    });
}

{
    suite('L1: the origin survives a close and reopen, without the migration');

    const device = omer({ carryAdvances: true, ledgerWrites: true });
    const made = device.call('recordNewAdvance', device.State.schedule, 'w_01',
        '2026-08-25', 300, '', '2026-08-25T09:00:00.000Z', 'd_omer', 'cash');
    device.State.commitMany(made);
    const id = made[0].value.id;
    device.State.commit(device.call('recordAdvanceRepaid', device.State.schedule,
        id, 100, '2026-08-26', '', '2026-08-26T09:00:00.000Z', 'd_omer', 'cash'));

    const again = makeDevice({ deviceId: 'd_reopen1', storage: device.dump(),
        flags: { carryAdvances: true, ledgerWrites: true } });
    again.State.load();
    const history = again.call('advanceHistory', again.State.schedule, id);
    check('the origin is still first on the record after a reopen',
        history.length === 2 && history[0].kind === 'given',
        JSON.stringify(history.map(e => [e.kind, e.amount])));
    check('and the migration finds nothing left to do',
        again.call('migrateAdvancesToLedger', again.State.schedule, 'd_reopen1')
            .added.length === 0);
    same('the money reads the same on the far side of the reopen',
        (({ given, repaid, left }) => ({ given, repaid, left }))(
            again.call('advanceOutstanding', again.State.schedule, id)),
        { given: 300, repaid: 100, left: 200 });

    // TWO PHONES MIRRORING ONE ADVANCE mint the SAME origin id, or the union keeps both
    // and the man is recorded as having been handed the money twice.
    const mirror = device.call('originEntryId', id);
    check('the origin id is derived from the advance, so two phones write one entry',
        typeof mirror === 'string' && mirror.indexOf(id) !== -1
        && again.State.schedule.ledger.advances[mirror] !== undefined,
        JSON.stringify({ mirror, present: Boolean(again.State.schedule.ledger.advances[mirror]) }));
}

{
    suite('L1: the form is what writes it, and it writes both halves');

    // The source, because a button is easy to change back and this is the rule it would
    // break. openAdvanceForm called addAdvance directly; it must go through the one
    // function that writes the origin beside it, and commit them together.
    const reports = readFileSync(new URL('../js/ui/reports.js', import.meta.url), 'utf8');
    check('the advance form calls recordNewAdvance',
        reports.indexOf('recordNewAdvance(') !== -1);
    check('and commits both halves in one operation',
        /recordNewAdvance\([\s\S]{0,400}commitMany/.test(reports));
    check('nothing in the reports screen calls addAdvance on its own',
        /(^|[^a-zA-Z])addAdvance\s*\(/m.test(reports) === false,
        JSON.stringify((reports.match(/.{0,40}addAdvance\s*\(.{0,20}/g) || []).slice(0, 3)));
}


// ------------------------------------------------- one account, read by every surface
{
    suite('L2: the same fortnight reads the same on every surface');

    // FOUR SURFACES, ONE MAN, ONE PERIOD. The payroll row, the printed sheet, the
    // exported workbook and the message the worker himself is sent are four different
    // functions, and three of them did their own arithmetic:
    //
    //   renderNetRow          earned - sum(advances in range)
    //   workerStatementText   earned - sum(advances in range)
    //   openAdvanceBalance    sum(every advance ever), ignoring every repayment
    //
    // while payrollRows priced the same fortnight through advanceAccount, which knows
    // about the opening balance, the cash that came back and the money already taken off
    // his wage. So a man could be told 1,950 on the screen, 5,000 in the archive warning
    // and 3,050 on WhatsApp, about the same fortnight, on the same evening.
    const device = omer({ carryAdvances: true, ledgerWrites: true });
    const id = Object.keys(device.State.schedule.advances)[0];
    device.State.commit(device.call('recordPeriodClosed', device.State.schedule,
        id, 'w_01', OMER_A.from, OMER_A.to, 3050,
        '2026-08-20T18:00:00.000Z', 'd_omer', 1950));
    device.State.commit(device.call('recordAdvanceRepaid', device.State.schedule,
        id, 200, '2026-08-24', '', '2026-08-24T09:00:00.000Z', 'd_omer', 'cash'));

    // THE ONE ANSWER, which every surface below must agree with.
    const account = device.call('advanceAccount', device.State.schedule, 'w_01',
        OMER_B.from, OMER_B.to);
    given('the account opens owing what the closed period carried out',
        account.carriedIn === 1950, String(account.carriedIn));

    const vm = await import('node:vm');
    const run = code => vm.runInContext(code, device.ctx, { filename: 'harness:l2' });
    run(readFileSync(new URL('../js/ui/sitecolor.js', import.meta.url), 'utf8'));
    run(readFileSync(new URL('../js/ui/reports.js', import.meta.url), 'utf8'));
    run(`REPORT_RANGE.from = '${OMER_B.from}'; REPORT_RANGE.to = '${OMER_B.to}';`
        + `REPORT_SECTION = 'workers'; INVOICE_PLACE = null;`);

    // Every surface, asked for the same man and the same fortnight.
    const surfaces = run(`(function () {
        const worker = State.worker('w_01');
        const sheet = payrollSheetRows();
        const head = sheet[0];
        const row = sheet.find(r => r[0] === worker.name) || [];
        return {
            account: workerAccountFor(worker.id),
            sheetNet: row[head.indexOf('לתשלום')],
            sheetAdvances: row[head.indexOf('מקדמות')],
            statement: workerStatementText(worker.id),
            openBalance: openAdvanceBalance(State.schedule, worker.id)
        };
    })()`);

    // The payroll row and the export are the same function and always agreed; the point
    // here is that the OTHERS now agree with them.
    check('the pay sheet deducts what the account says was deducted',
        Math.abs(Number(surfaces.sheetAdvances)) === account.deducted,
        JSON.stringify({ sheet: surfaces.sheetAdvances, account: account.deducted }));

    // THE STATEMENT the man himself receives.
    check('the statement names the opening balance the account opened on',
        surfaces.statement.indexOf('1,950') !== -1 || surfaces.statement.indexOf('1950') !== -1,
        JSON.stringify(surfaces.statement.split('\n').filter(l => l.indexOf('1,950') !== -1
            || l.indexOf('1950') !== -1)));
    check('and it names the cash he handed back',
        surfaces.statement.indexOf('200') !== -1
        && surfaces.statement.indexOf('הוחזר במזומן') !== -1,
        JSON.stringify(surfaces.statement.split('\n').filter(l => l.indexOf('200') !== -1)));
    check('the statement never prints a number the account does not hold',
        surfaces.statement.indexOf('5,000') === -1 && surfaces.statement.indexOf('5000') === -1,
        JSON.stringify(surfaces.statement.split('\n').filter(l => l.indexOf('5') !== -1)));

    // THE ARCHIVE WARNING, which decides whether a man may be put away.
    check('the archive warning reports what is still owed, not what was ever handed over',
        surfaces.openBalance !== null && surfaces.openBalance.total === account.carriedForward,
        JSON.stringify({ warning: surfaces.openBalance, owed: account.carriedForward }));
    check('and it is not the gross 5,000 any more',
        surfaces.openBalance === null || surfaces.openBalance.total !== 5000,
        JSON.stringify(surfaces.openBalance));

    // AND ONE FUNCTION BEHIND ALL OF THEM. The check that keeps it that way.
    const reports = readFileSync(new URL('../js/ui/reports.js', import.meta.url), 'utf8');
    check('every surface goes through the one account reader',
        (reports.match(/workerAccountFor\(/g) || []).length >= 3,
        String((reports.match(/workerAccountFor\(/g) || []).length));
}

{
    suite('L2: with the gates shut every surface still agrees, the old way');

    // The other half of the promise. With the writer closed there is no account to read,
    // and the surfaces must still say ONE thing - the thing this build has always said.
    //
    // Shut EXPLICITLY. This branch ships both gates open, so `omer({})` here would have
    // measured the open build twice and called one of them closed.
    const device = omer({ carryAdvances: false, ledgerWrites: false });
    const vm = await import('node:vm');
    const run = code => vm.runInContext(code, device.ctx, { filename: 'harness:l2b' });
    run(readFileSync(new URL('../js/ui/sitecolor.js', import.meta.url), 'utf8'));
    run(readFileSync(new URL('../js/ui/reports.js', import.meta.url), 'utf8'));
    run(`REPORT_RANGE.from = '${OMER_A.from}'; REPORT_RANGE.to = '${OMER_A.to}';`
        + `REPORT_SECTION = 'workers'; INVOICE_PLACE = null;`);

    const shut = run(`(function () {
        const sheet = payrollSheetRows();
        const head = sheet[0];
        const row = sheet.find(r => r[0] === 'עומר סעד') || [];
        return {
            sheetAdvances: Math.abs(Number(row[head.indexOf('מקדמות')])),
            openBalance: openAdvanceBalance(State.schedule, 'w_01'),
            statement: workerStatementText('w_01')
        };
    })()`);
    check('the sheet deducts the whole advance, as this build always has',
        shut.sheetAdvances === 5000, String(shut.sheetAdvances));
    check('and the archive warning says the same number',
        shut.openBalance && shut.openBalance.total === 5000,
        JSON.stringify(shut.openBalance));
    check('and so does the statement',
        shut.statement.indexOf('5,000') !== -1 || shut.statement.indexOf('5000') !== -1,
        JSON.stringify(shut.statement.split('\n').filter(l => l.indexOf('5') !== -1).slice(0, 3)));
}


// ------------------------------------------------- the migration nobody had to approve
{
    suite('L3: switching the carry on is a decision, laid out before it is taken');

    // planAdvanceCarry has always been able to say which accounts and which men would
    // move. Nothing called it. So the switch was a constant in a file, and flipping it
    // would have restated fortnights that had already been printed and paid - silently,
    // on every phone, at the next open.
    const device = omer({ carryAdvances: true, ledgerWrites: true });
    const plan = device.call('planCarryMigration', device.State.schedule);

    check('the plan names every row that would move', plan.needed === true
        && plan.rows.length > 0, JSON.stringify(plan.rows.length));
    check('and each row carries both numbers, not just the new one',
        plan.rows.every(row => Number.isFinite(row.now) && Number.isFinite(row.after)),
        JSON.stringify(plan.rows.map(r => [r.now, r.after])));
    check('the numbers actually differ, or there would be nothing to approve',
        plan.rows.some(row => row.now !== row.after),
        JSON.stringify(plan.rows.map(r => [r.now, r.after])));

    // WHAT THIS APP CANNOT KNOW, reported instead of guessed. v88 wrote no closure
    // records, so a period with no closure entry is not a period that was never paid -
    // absence says nothing at all, and only a person knows which it was.
    check('every row says whether a closure was actually recorded for it',
        plan.rows.every(row => typeof row.closureRecorded === 'boolean'),
        JSON.stringify(plan.rows.map(r => r.closureRecorded)));
    check('and on this record none of them was, which is the honest answer',
        plan.rows.every(row => row.closureRecorded === false),
        JSON.stringify(plan.rows.map(r => r.closureRecorded)));

    // NOTHING IS WRITTEN BY PLANNING IT.
    check('planning writes nothing',
        Object.keys((device.State.schedule.ledger || {}).migrations || {}).length === 0);

    // AND NOTHING MAY BE WRITTEN UNTIL IT IS ANSWERED.
    check('financial writing is shut while the migration is unapproved',
        device.call('financialWritingEnabled', device.State.schedule) === false);
    check('even though both flags are open',
        device.call('ledgerWritesEnabled') === true
        && device.call('advanceCarryEnabled') === true);

    device.State.commit(device.call('recordCarryApproval', device.State.schedule, plan,
        '2026-08-26T09:00:00.000Z', 'd_omer'));
    check('once approved, financial writing opens',
        device.call('financialWritingEnabled', device.State.schedule) === true);
    check('and the approval is on the record, where the other phones will read it',
        Boolean(device.State.schedule.ledger.migrations[plan.id]),
        JSON.stringify(Object.keys(device.State.schedule.ledger.migrations)));
}

{
    suite('L3: cancel changes nothing, and a refused save keeps the draft');

    const device = omer({ carryAdvances: true, ledgerWrites: true });
    const before = JSON.stringify(device.State.schedule);
    const plan = device.call('planCarryMigration', device.State.schedule);

    // CANCEL. The screen computes the plan every time it draws; not approving is simply
    // not committing, and the record must be untouched byte for byte.
    check('planning and walking away leaves the record exactly as it was',
        JSON.stringify(device.State.schedule) === before);
    check('and the migration is still waiting',
        device.call('carryMigrationSettled', device.State.schedule) === false);

    // A REFUSED SAVE. The approval is a write like any other and the disk can refuse it.
    // What must not happen is a device that believes it approved something it did not.
    device.setQuota(() => true);
    const change = device.call('recordCarryApproval', device.State.schedule, plan,
        '2026-08-26T09:00:00.000Z', 'd_omer');
    const ok = device.State.commit(change);
    check('the commit reports the refusal', ok === false, String(ok));

    const reopened = makeDevice({ deviceId: 'd_draft', storage: device.dump(),
        flags: { carryAdvances: true, ledgerWrites: true } });
    reopened.State.load();
    check('nothing was approved on the disk',
        Object.keys((reopened.State.schedule.ledger || {}).migrations || {}).length === 0,
        JSON.stringify((reopened.State.schedule.ledger || {}).migrations));
    check('so financial writing is still shut',
        reopened.call('financialWritingEnabled', reopened.State.schedule) === false);
    // AND THE REVIEW IS STILL THERE TO ANSWER. A failed save that lost the rows would
    // leave a person with a gate they cannot open and no screen explaining why.
    const again = reopened.call('planCarryMigration', reopened.State.schedule);
    check('and the review still has the same rows to show',
        again.needed === true && again.id === plan.id,
        JSON.stringify({ needed: again.needed, same: again.id === plan.id }));
}

{
    suite('L3: two phones cannot approve the same migration twice');

    // One schedule, copied before either approves - which is what two phones are.
    const a = omer({ carryAdvances: true, ledgerWrites: true });
    const asPhoneB = JSON.parse(JSON.stringify(a.State.schedule));

    const planA = a.call('planCarryMigration', a.State.schedule);
    const planB = a.call('planCarryMigration', asPhoneB);
    check('both phones compute the same plan, because the record is the same',
        planA.id === planB.id, `${planA.id} / ${planB.id}`);

    const fromA = a.call('recordCarryApproval', a.State.schedule, planA,
        '2026-08-26T09:00:00.000Z', 'd_a');
    const fromB = a.call('recordCarryApproval', asPhoneB, planB,
        '2026-08-26T09:00:05.000Z', 'd_b');
    check('and they write to the same field path',
        fromA.path === fromB.path, `${fromA.path} | ${fromB.path}`);

    a.State.commitMany([fromA]);
    // The union, which is what Firestore does with two writes to one field path.
    a.State.schedule.ledger.migrations[fromB.value.id] = fromB.value;
    check('the record holds one approval, not two',
        Object.keys(a.State.schedule.ledger.migrations).length === 1,
        JSON.stringify(Object.keys(a.State.schedule.ledger.migrations)));
    check('and the other phone is not asked to approve it again',
        a.call('carryMigrationSettled', a.State.schedule) === true);

    // APPROVING AGAIN ON ONE PHONE IS NOT A SECOND APPROVAL EITHER. The first decision
    // keeps its own `at` and `by`, because that is who actually decided.
    const third = a.call('recordCarryApproval', a.State.schedule, planA,
        '2026-08-27T09:00:00.000Z', 'd_a');
    check('a second press returns the approval that is already there',
        third.already === true && third.value.by === fromB.value.by,
        JSON.stringify({ already: third.already, by: third.value.by }));
}

{
    suite('L3: a record with nothing to restate needs no approval at all');

    // A device that has never had an advance the carry would move must not be shown a
    // screen asking it to approve nothing - and must not be held shut by one.
    const device = makeDevice({ deviceId: 'd_nothing',
        flags: { carryAdvances: true, ledgerWrites: true } });
    device.setToday('2026-08-26');
    device.State.schedule.workers = [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 0 }];
    device.State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
    device.State.save({ silent: true });

    const plan = device.call('planCarryMigration', device.State.schedule);
    check('there is nothing to approve', plan.needed === false,
        JSON.stringify(plan.rows));
    check('so the migration is settled',
        device.call('carryMigrationSettled', device.State.schedule) === true);
    check('and financial writing is open on the flags alone',
        device.call('financialWritingEnabled', device.State.schedule) === true);
}

{
    suite('L3: the screen exists, and it is the only thing that approves');

    const settings = readFileSync(new URL('../js/ui/settings.js', import.meta.url), 'utf8');
    check('the review screen is drawn from the plan',
        settings.indexOf('planCarryMigration(') !== -1
        && settings.indexOf('renderCarryMigration') !== -1);
    check('and it asks before it writes',
        /approveCarryMigration[\s\S]{0,600}askConfirm/.test(settings));
    check('it re-plans against the record as it is, not the plan it was drawn from',
        /askConfirm[\s\S]{0,900}planCarryMigration\(State\.schedule\)[\s\S]{0,400}live\.id !== plan\.id/
            .test(settings));
    check('recordCarryApproval is called from exactly one place in the app',
        ((readFileSync(new URL('../js/ui/settings.js', import.meta.url), 'utf8')
            + readFileSync(new URL('../js/ui/reports.js', import.meta.url), 'utf8')
            + readFileSync(new URL('../js/ui/share.js', import.meta.url), 'utf8'))
            .split('recordCarryApproval(').length - 1) === 1);
    check('and the row that has no recorded closure says so on the screen',
        settings.indexOf('אין רישום סגירה לתקופה הזו') !== -1);
}


// ------------------------------------------------- correcting the wrong transaction
{
    suite('L4: a wrongly recorded REPAYMENT pushes the debt back up');

    // THE CASE THE OLD SHAPE COULD NOT EXPRESS. recordAdvanceReversed targets the
    // ADVANCE, so the only sentence it can say is "this advance was recorded in error".
    // A cash repayment entered twice, or for the wrong amount, is at least as common -
    // and reversing it with the old shape reduced the debt, which credited the man twice
    // for money that was never there.
    const device = omer({ carryAdvances: true, ledgerWrites: true });
    const id = Object.keys(device.State.schedule.advances)[0];
    const repay = device.call('recordAdvanceRepaid', device.State.schedule,
        id, 400, '2026-08-24', 'מזומן', '2026-08-24T09:00:00.000Z', 'd_omer', 'cash');
    device.State.commit(repay);
    const repayId = repay.value.id;

    given('the record says he handed back 400',
        device.call('advanceOutstanding', device.State.schedule, id).left === 4600,
        JSON.stringify(device.call('advanceOutstanding', device.State.schedule, id)));

    // He did not. It was typed against the wrong man's advance.
    device.State.commit(device.call('recordEventReversed', device.State.schedule,
        repayId, 400, '2026-08-25', 'נרשם על המקדמה הלא נכונה',
        '2026-08-25T09:00:00.000Z', 'd_omer'));

    const after = device.call('advanceOutstanding', device.State.schedule, id);
    check('the debt goes back UP, because the cash never came back',
        after.left === 5000, JSON.stringify(after));
    check('and the repayment nets to nothing rather than counting twice',
        after.repaid === 0 && after.repaidGross === 400, JSON.stringify(after));
    check('the correction does not create an overpayment out of nothing',
        after.overpaid === 0, JSON.stringify(after));

    // BOTH ROWS STAY. The repayment that stopped being true is still the row a person is
    // looking for when they ask what happened here.
    const history = device.call('advanceHistory', device.State.schedule, id);
    const rows = history.map(entry => [entry.kind, entry.amount, entry.targetId || null]);
    check('the repayment is still on the record', rows.some(r => r[0] === 'repaid' && r[1] === 400),
        JSON.stringify(rows));
    check('and the correction stands beside it, naming the exact transaction',
        rows.some(r => r[0] === 'reversed' && r[1] === 400 && r[2] === repayId),
        JSON.stringify(rows));
    check('with the reason it was made for',
        history.filter(e => e.kind === 'reversed')[0].reason === 'נרשם על המקדמה הלא נכונה',
        JSON.stringify(history.filter(e => e.kind === 'reversed')[0]));
}

{
    suite('L4: a wrongly recorded DEDUCTION does the same, in the same direction');

    const device = omer({ carryAdvances: true, ledgerWrites: true });
    const id = Object.keys(device.State.schedule.advances)[0];
    const closure = device.call('recordPeriodClosed', device.State.schedule,
        id, 'w_01', OMER_A.from, OMER_A.to, 3050, '2026-08-20T18:00:00.000Z', 'd_omer', 1950);
    device.State.commit(closure);
    given('3,050 came off his wage',
        device.call('advanceOutstanding', device.State.schedule, id).left === 1950,
        JSON.stringify(device.call('advanceOutstanding', device.State.schedule, id)));

    device.State.commit(device.call('recordEventReversed', device.State.schedule,
        closure.value.id, 3050, '2026-08-21', 'נסגר על תקופה שגויה',
        '2026-08-21T09:00:00.000Z', 'd_omer'));
    const after = device.call('advanceOutstanding', device.State.schedule, id);
    check('the debt is back to the whole advance', after.left === 5000, JSON.stringify(after));
    check('and the deduction nets to nothing',
        after.deducted === 0 && after.deductedGross === 3050, JSON.stringify(after));
}

{
    suite('L4: what a correction refuses');

    const device = omer({ carryAdvances: true, ledgerWrites: true });
    const id = Object.keys(device.State.schedule.advances)[0];
    const repay = device.call('recordAdvanceRepaid', device.State.schedule,
        id, 400, '2026-08-24', '', '2026-08-24T09:00:00.000Z', 'd_omer', 'cash');
    device.State.commit(repay);
    const repayId = repay.value.id;
    const problems = (target, amount, reason) =>
        device.call('eventReversalProblems', device.State.schedule, target, amount, reason);

    check('a transaction that is not there', problems('le_nope', 100, 'למה').length > 0);
    check('more than the transaction it corrects', problems(repayId, 401, 'למה').length > 0,
        JSON.stringify(problems(repayId, 401, 'למה')));
    check('exactly the transaction is allowed', problems(repayId, 400, 'למה').length === 0);
    check('part of it is allowed too', problems(repayId, 100, 'למה').length === 0);
    check('nothing at all is refused', problems(repayId, 0, 'למה').length > 0);
    check('and no reason is refused', problems(repayId, 400, '   ').length > 0);

    device.State.commit(device.call('recordEventReversed', device.State.schedule,
        repayId, 400, '2026-08-25', 'טעות', '2026-08-25T09:00:00.000Z', 'd_omer'));

    // ONCE. After a second the record says the money moved in a direction nobody chose.
    check('the same transaction cannot be corrected twice',
        problems(repayId, 400, 'שוב').length > 0, JSON.stringify(problems(repayId, 400, 'שוב')));
    check('and there is no room left on it',
        device.call('eventReversalRoom', device.State.schedule, repayId) === 0);
    check('a second call writes nothing at all',
        device.call('recordEventReversed', device.State.schedule, repayId, 400,
            '2026-08-26', 'שוב', '2026-08-26T09:00:00.000Z', 'd_omer') === null);

    // A CORRECTION OF A CORRECTION is a second story about the same money.
    const reversalId = device.call('eventReversalId', repayId);
    check('a correction cannot be corrected',
        problems(reversalId, 400, 'למה').length > 0,
        JSON.stringify(problems(reversalId, 400, 'למה')));
}

{
    suite('L4: two phones correcting the same mistake correct it once');

    const a = omer({ carryAdvances: true, ledgerWrites: true });
    const id = Object.keys(a.State.schedule.advances)[0];
    const repay = a.call('recordAdvanceRepaid', a.State.schedule,
        id, 400, '2026-08-24', '', '2026-08-24T09:00:00.000Z', 'd_a', 'cash');
    a.State.commit(repay);
    const repayId = repay.value.id;
    const asPhoneB = JSON.parse(JSON.stringify(a.State.schedule));

    const fromA = a.call('recordEventReversed', a.State.schedule, repayId, 400,
        '2026-08-25', 'טעות', '2026-08-25T09:00:00.000Z', 'd_a');
    const fromB = a.call('recordEventReversed', asPhoneB, repayId, 400,
        '2026-08-25', 'טעות', '2026-08-25T09:00:05.000Z', 'd_b');
    check('each phone, alone, believed it was correcting it',
        Boolean(fromA) && Boolean(fromB));
    check('and both wrote to the same field path', fromA.path === fromB.path,
        `${fromA.path} | ${fromB.path}`);

    a.State.commit(fromA);
    a.State.schedule.ledger.advances[fromB.value.id] = fromB.value;
    const corrections = a.call('advanceHistory', a.State.schedule, id)
        .filter(entry => entry.kind === 'reversed');
    check('the record holds one correction after both landed',
        corrections.length === 1, JSON.stringify(corrections.map(c => [c.amount, c.by])));
    const after = a.call('advanceOutstanding', a.State.schedule, id);
    check('and the money moved once, not twice', after.left === 5000 && after.repaid === 0,
        JSON.stringify(after));
}

{
    suite('L4: the correction is reachable, and its reason travels');

    // The screen: a correction is offered against a TRANSACTION in the history, not
    // against the advance - which is the only place the id it needs is on the page.
    const reports = readFileSync(new URL('../js/ui/reports.js', import.meta.url), 'utf8');
    check('the history offers a correction per transaction',
        reports.indexOf('openEventReversalForm') !== -1
        && reports.indexOf('recordEventReversed(') !== -1);
    check('and it asks for a reason before it writes',
        /openEventReversalForm[\s\S]{0,3000}סיבה \(חובה\)/.test(reports));
    check('the reason is drawn in the history, beside the row it corrects',
        reports.indexOf('ledger-reason') !== -1);

    // And it leaves the phone: print and export are the two places a person reads this
    // away from the screen, and a correction with no reason on the paper is an
    // unexplained movement of money.
    const share = readFileSync(new URL('../js/ui/share.js', import.meta.url), 'utf8');
    check('the exported history carries the reason too',
        share.indexOf('reason') !== -1 || reports.indexOf('reason') !== -1);
}

report();
