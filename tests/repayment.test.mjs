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
    const off = crew({ deviceId: 'd_sheet_off' });
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
    const shipped = await screenFor({ deviceId: 'd_ui_off' });
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
}

report();
