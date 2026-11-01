// What the financial section PROMISES about money it did not deduct.
//
//   node tests/finance.wording.test.mjs
//
// R2 OF THE INDEPENDENT READ OF v158, 18 October 2026.
//
// The section's heading already asks the record which reading it is in -
// financeSectionTitle calls carryReportingEnabled - but the sentence under it promised,
// unconditionally, that «מה שלא נוכה בתקופה הזו עובר לתקופה הבאה ולא נמחק»: what was not
// deducted this period moves to the next one and is not erased.
//
// THE CONTRACT THAT PROMISE DEPENDS ON, read in js/model (and not touched by this suite
// or by the fix it measures):
//
//   carryReportingEnabled(schedule) = advanceCarryEnabled() && carryMigrationSettled(schedule)
//   advanceCarryEnabled()           = FARKAD_FLAGS.carryAdvances === true      (the BUILD)
//   carryMigrationSettled(schedule) = the migration is not needed, or it is APPROVED
//                                     on this record                            (the RECORD)
//
// So the carry needs both, and in the other reading there is no balance crossing periods
// at all: the advance is netted in the period it falls in, and what is left of it lives on
// the man's advances record and is read on the מקדמות screen. The promise was true for one
// of the three states this app actually ships in and false for the other two - on the
// screen, on the paper and in the picture, because the sentence is .hint-money and both of
// those carry it.
//
// This suite pins the sentence in all three states. It changes no money, no approval and no
// ledger entry of its own beyond the synthetic record it builds, and it reads the same
// gate the product reads.

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDevice } from './harness.mjs';
import { makeDom } from './moneydom.mjs';
import { suite, check, given, report } from './runner.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORTS = readFileSync(join(ROOT, 'js/ui/reports.js'), 'utf8');

const FROM = '2026-08-07';
const TO = '2026-08-20';
const WORKED = '2026-08-10';
const TODAY = '2026-08-20';

const CARRY_PROMISE = 'עובר לתקופה הבאה ולא נמחק';
const NO_CARRY_PROMISE = 'אין יתרה שעוברת בין תקופות';

// One man who worked, one man whose only record is a legacy advance - seeded straight onto
// the schedule, which is what a record that has not been through the migration looks like.
function phone(flags) {
    const device = makeDevice({ deviceId: 'd_wording', flags });
    device.setToday(TODAY);
    const dom = makeDom();
    ['reportsView', 'workerDaysTitle', 'workerDaysMeta', 'workerDaysBody', 'workerDaysModal']
        .forEach(id => dom.register(id));
    device.ctx.document = dom;
    vm.runInContext(REPORTS, device.ctx, { filename: 'harness:reports' });
    device.ctx.askTell = () => Promise.resolve();
    device.run = code => vm.runInContext(code, device.ctx, { filename: 'harness:reports' });

    device.State.schedule.workers = [
        { id: 'w_day', name: 'סאלח', active: true, dailyRate: 450, hourlyRate: 0 },
        { id: 'w_cash', name: 'רגא', active: true, dailyRate: 470, hourlyRate: 0 }
    ];
    device.State.schedule.places = [{ id: 'p_01', name: 'פרסדיה', active: true }];
    device.State.commit(device.call('assignPlace',
        device.State.schedule, WORKED, 'w_day', 'actual', 'p_01', 'normal'));
    device.State.schedule.advances = { a_legacy: { id: 'a_legacy', workerId: 'w_cash',
        date: WORKED, amount: 500, note: '' } };
    device.State.save({ silent: true });
    device.run(`REPORT_RANGE.from='${FROM}'; REPORT_RANGE.to='${TO}';`
        + `REPORT_SECTION='workers'; REPORT_WORKERS=null; 1`);
    return device;
}

// The section as it is drawn: its heading, and the sentence a person reads under it - the
// same node that reaches the paper and the picture.
const sectionOf = device => {
    const node = device.run('renderPayrollTable()');
    return {
        titles: node.querySelectorAll('H3').map(h => h.textContent),
        money: node.querySelectorAll('.hint-money').map(p => p.textContent),
        gate: device.run('carryReportingEnabled(State.schedule) === true'),
        needed: device.run('planCarryMigration(State.schedule).needed === true')
    };
};

// ----------------------------------------------------------- the build does not carry
{
    suite('with the carry switched off in the build, nothing is promised to carry');

    const device = phone({ carryAdvances: false, ledgerWrites: false });
    const seen = sectionOf(device);
    given('the gate is shut and a financial section is drawn',
        seen.gate === false && seen.money.length > 0, JSON.stringify(seen.titles));

    check('the heading says advances and deductions',
        seen.titles.some(text => text.indexOf('כספים - מקדמות וניכויים') !== -1),
        JSON.stringify(seen.titles));
    check('the section does NOT promise a carry to the next period',
        seen.money.every(text => text.indexOf(CARRY_PROMISE) === -1),
        JSON.stringify(seen.money));
    check('it says there is no balance crossing periods in this reading',
        seen.money.some(text => text.indexOf(NO_CARRY_PROMISE) !== -1),
        JSON.stringify(seen.money));
    check('and it says where the amount IS read instead',
        seen.money.some(text => text.indexOf('מקדמות') !== -1),
        JSON.stringify(seen.money));
}

// --------------------------------------- the build carries, the record is not approved yet
{
    suite('with the build ready but the record not approved, nothing is promised either');

    const device = phone({ carryAdvances: true, ledgerWrites: true });
    const seen = sectionOf(device);
    given('the migration is needed and not approved, so the gate is still shut',
        seen.needed === true && seen.gate === false,
        JSON.stringify({ needed: seen.needed, gate: seen.gate }));

    check('the heading still says advances and deductions',
        seen.titles.some(text => text.indexOf('כספים - מקדמות וניכויים') !== -1),
        JSON.stringify(seen.titles));
    check('and the carry is still not promised',
        seen.money.every(text => text.indexOf(CARRY_PROMISE) === -1),
        JSON.stringify(seen.money));
    check('the no-carry sentence is the one on the page',
        seen.money.some(text => text.indexOf(NO_CARRY_PROMISE) !== -1),
        JSON.stringify(seen.money));
}

// ------------------------------------------------- approved on the record: now it carries
{
    suite('once the record is approved, the carry is promised and the heading changes');

    const device = phone({ carryAdvances: true, ledgerWrites: true });
    // THE APPROVAL, through the function the button calls - no hand-written ledger entry.
    const approved = device.run(`(() => {
        const plan = planCarryMigration(State.schedule);
        if (!plan.needed) return 'not needed';
        State.commit(recordCarryApproval(State.schedule, plan,
            '2026-08-20T08:00:00.000Z', 'd_wording'));
        return carryMigrationApproved(State.schedule, planCarryMigration(State.schedule))
            ? 'approved' : 'refused';
    })()`);
    const seen = sectionOf(device);
    given('the approval is on the record and the gate is open',
        approved === 'approved' && seen.gate === true,
        JSON.stringify({ approved, gate: seen.gate }));

    check('the heading says advances and balances',
        seen.titles.some(text => text.indexOf('כספים - מקדמות ויתרות') !== -1),
        JSON.stringify(seen.titles));
    check('and NOW the section promises the carry, because the record does it',
        seen.money.some(text => text.indexOf(CARRY_PROMISE) !== -1),
        JSON.stringify(seen.money));
    check('the no-carry sentence is gone',
        seen.money.every(text => text.indexOf(NO_CARRY_PROMISE) === -1),
        JSON.stringify(seen.money));
}

// ------------------------------------- the sentence is one sentence, in one place
{
    suite('the promise has one source, so the three surfaces cannot disagree');

    // The paper and the picture carry .hint-money - the print stylesheet lifts it and
    // js/ui/printout.js reads it into the image - so the sentence measured above IS the
    // sentence on all three surfaces. What is pinned here is that there is exactly ONE
    // function deciding it, which is what makes that true.
    check('the wording is decided in one place in the file',
        (REPORTS.match(/function financeCarryPromise\(\)/g) || []).length === 1,
        String((REPORTS.match(/financeCarryPromise/g) || []).length));
    check('and the hint is built from it rather than from a literal',
        /financeCarryPromise\(\)/.test(REPORTS.slice(REPORTS.indexOf('function renderFinanceBlock'),
            REPORTS.indexOf('function renderFinanceBlock') + 1200)),
        'renderFinanceBlock');
}

report();
