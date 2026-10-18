// A WEEK WITH NO WORK AND A WEEK WITH NO PRICE ARE NOT THE SAME THING.
//
//   node tests/weekly.unpriced.test.mjs
//
// R3 OF THE INDEPENDENT READ OF v158, 18 October 2026 - A MEASUREMENT, NOT A FIX.
//
// The read observed, statically, that renderWeeklyBreakdown shows «—» for a week whose
// amount is null but then sums with `Number(week.amount || 0)` and prints that sum
// whenever ANY week is priced. Its question: when a known wage and an unknown wage are
// mixed, is the sum of the known weeks shown as if it were the range's total?
//
// THIS SUITE ANSWERS THAT QUESTION AND PINS TODAY'S ANSWER. It changes nothing and asks
// for nothing: the owner decides whether the display moves, and when it does, the
// expectations marked ** TODAY ** below move with it in that same commit.
//
// THE CONTRACT, read in js/model/money.js and js/model/schema.js and not touched here:
//
//   ratesForDay   - a day's price is its own STAMP when it has one, and the roster's rate
//                   today when it has none.
//   currentRates  - returns nothing when the worker has no rate, and money.js writes
//                   `next.rates` only when it answers: "freezing 'no rate' onto the day
//                   would make it permanent". So an unpriced day carries NO stamp at all.
//   a day's amount is null only when its effective daily rate is 0.
//   a worked period is null when ANY of its days is; a period with no work is
//   `dailyRate > 0 ? 0 : null`.
//
// WHICH CORRECTS THE ROUTE THE READ ASSUMED, and part one below pins that correction: a
// man who worked BEFORE a rate was entered does not produce an unknown week. His day has
// no stamp, so it is priced at the rate the roster shows today - measured at 450, not
// «—». A mixture needs the other order: a rate that was present when one day was recorded
// and is gone when the next is. That is reachable with the roster screen alone, and it is
// the fixture part two uses.
//
// Synthetic data only: one invented man, one invented site, no wage guessed anywhere.

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDevice } from './harness.mjs';
import { makeDom } from './moneydom.mjs';
import { suite, check, given, report } from './runner.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORTS = readFileSync(join(ROOT, 'js/ui/reports.js'), 'utf8');

const ANCHOR = '2026-08-07';          // a Friday: a real weekly period start
const WEEK1_DAY = '2026-08-10';
const WEEK2_DAY = '2026-08-17';
const TO = '2026-08-27';              // three weekly periods: 07-13, 14-20, 21-27
const TODAY = '2026-08-28';

function device() {
    const made = makeDevice({ deviceId: 'd_unpriced' });
    made.setToday(TODAY);
    const dom = makeDom();
    ['reportsView', 'workerDaysTitle', 'workerDaysMeta', 'workerDaysBody', 'workerDaysModal']
        .forEach(id => dom.register(id));
    made.ctx.document = dom;
    vm.runInContext(REPORTS, made.ctx, { filename: 'harness:reports' });
    made.ctx.askTell = () => Promise.resolve();
    made.run = code => vm.runInContext(code, made.ctx, { filename: 'harness:reports' });
    made.State.schedule.places = [{ id: 'p_01', name: 'פרסדיה', active: true }];
    return made;
}

const look = made => made.run(`REPORT_RANGE.from='${ANCHOR}'; REPORT_RANGE.to='${TO}';`
    + `REPORT_SECTION='workers'; REPORT_WORKERS=null; 1`);

// ROUTE ONE: no rate when the first day is recorded, a rate afterwards.
function phoneLateRate() {
    const made = device();
    made.State.schedule.workers = [
        { id: 'w_mix', name: 'כרם', active: true, dailyRate: 0, hourlyRate: 0,
            payCycles: `${ANCHOR}=weekly` }];
    made.State.commit(made.call('assignPlace',
        made.State.schedule, WEEK1_DAY, 'w_mix', 'actual', 'p_01', 'normal'));
    made.State.worker('w_mix').dailyRate = 450;
    made.State.commit(made.call('assignPlace',
        made.State.schedule, WEEK2_DAY, 'w_mix', 'actual', 'p_01', 'normal'));
    made.State.save({ silent: true });
    look(made);
    return made;
}

// ROUTE TWO: a rate when the first day is recorded, and none when the second is - the
// roster's own two taps, in the other order.
function phoneClearedRate() {
    const made = device();
    made.State.schedule.workers = [
        { id: 'w_mix', name: 'כרם', active: true, dailyRate: 450, hourlyRate: 0,
            payCycles: `${ANCHOR}=weekly` }];
    made.State.commit(made.call('assignPlace',
        made.State.schedule, WEEK1_DAY, 'w_mix', 'actual', 'p_01', 'normal'));
    made.State.worker('w_mix').dailyRate = 0;
    made.State.commit(made.call('assignPlace',
        made.State.schedule, WEEK2_DAY, 'w_mix', 'actual', 'p_01', 'normal'));
    made.State.save({ silent: true });
    look(made);
    return made;
}

const plain = text => String(text).replace(/[‎⁦⁧⁨⁩]/g, '')
    .replace(/\s+/g, ' ').trim();
// The drawn line is a row of spans with no separator between a label and its value, so
// «נצבר» and its number arrive welded together. Compared with the spaces taken out of both
// sides, which is what a person sees rather than what the DOM concatenates.
const has = (text, needle) =>
    String(text).replace(/\s/g, '').indexOf(String(needle).replace(/\s/g, '')) !== -1;
const stampsOf = made => JSON.parse(made.run(`JSON.stringify({
    week1: (((State.schedule.days['${WEEK1_DAY}'] || {}).actual || {}).w_mix || {}).rates || null,
    week2: (((State.schedule.days['${WEEK2_DAY}'] || {}).actual || {}).w_mix || {}).rates || null
})`));
const weeksOf = made => JSON.parse(made.run(
    `JSON.stringify(weeklyBreakdownFor('w_mix', REPORT_RANGE.from, REPORT_RANGE.to))`));
const drawn = made => {
    const section = made.run('renderPayrollTable()');
    return {
        lines: section.querySelectorAll('.report-weekly-line').map(n => plain(n.textContent)),
        total: section.querySelectorAll('.report-weekly-total').map(n => plain(n.textContent))[0] || ''
    };
};

// ------------------------------------- part one: the route the read assumed, corrected
{
    suite('a rate entered AFTER the work does not make an unknown week');

    const made = phoneLateRate();
    const stamps = stampsOf(made);
    given('the day worked before the rate carries no stamp at all',
        stamps.week1 === null, JSON.stringify(stamps));
    given('and the day worked after it is stamped at the rate',
        stamps.week2 && Number(stamps.week2.daily) === 450, JSON.stringify(stamps));

    const weeks = weeksOf(made);
    // ratesForDay falls back to the roster's rate today for a day with no stamp, so this
    // week is PRICED - at 450, the rate the man is on now. Not an unknown wage.
    check('the unstamped day is priced at the roster\'s rate today',
        weeks[0].attendanceDays === 1 && weeks[0].amount === 450, JSON.stringify(weeks[0]));
    check('so no week in this range is unknown',
        weeks.every(week => week.amount !== null), JSON.stringify(weeks.map(w => w.amount)));
    check('and the total for the range is a real total',
        drawn(made).total.indexOf('סה״כ לטווח') === 0
        && has(drawn(made).total, 'נצבר 900 ₪'), JSON.stringify(drawn(made).total));
}

// ------------------------- part two: the reachable mixture, and what the total then says
{
    suite('a rate that was present and then cleared leaves one week with no price');

    const made = phoneClearedRate();
    const stamps = stampsOf(made);
    given('the first day is stamped and the second carries no stamp',
        stamps.week1 && Number(stamps.week1.daily) === 450 && stamps.week2 === null,
        JSON.stringify(stamps));

    const weeks = weeksOf(made);
    given('three weekly periods came back', weeks.length === 3, JSON.stringify(weeks));
    check('the week with the stamp has a known amount',
        weeks[0].attendanceDays === 1 && weeks[0].amount === 450, JSON.stringify(weeks[0]));
    check('the week WORKED with no price has an unknown amount',
        weeks[1].attendanceDays === 1 && weeks[1].amount === null, JSON.stringify(weeks[1]));
    check('and the week with NO work is unknown too, because the roster has no rate now',
        weeks[2].attendanceDays === 0 && weeks[2].amount === null, JSON.stringify(weeks[2]));

    const shown = drawn(made);
    // THE DISTINCTION, AS A PERSON READS IT. Both empty weeks print «נצבר —», so the
    // money column does NOT tell them apart; the day counts do - one worked day against
    // none. That is worth saying plainly: the dash means "not known", never "nothing".
    check('both unknown weeks show a dash in the money column',
        has(shown.lines[1], 'נצבר —') && has(shown.lines[2], 'נצבר —'),
        JSON.stringify(shown.lines));
    check('and they are told apart only by their day counts',
        has(shown.lines[1], 'נוכחות 1') && has(shown.lines[2], 'נוכחות 0'),
        JSON.stringify(shown.lines));

    // ** TODAY'S BEHAVIOUR, AND THE FINDING. **
    //
    // The total line prints the sum of the weeks it could price - 450 - and calls itself
    // «סה״כ לטווח», the total FOR THE CHOSEN RANGE, while one worked week of that range
    // has no wage at all. Nothing marks the sum as partial, two rows under a line that
    // says «נצבר —». The dash is reached on the total only when NO week can be priced,
    // so the all-unknown case is honest and this mixed case is the one that reads wrong.
    //
    // Pinned, not fixed: R3 of the read was a verification, and the remedy is a display
    // decision for the owner. The money is untouched either way - the range row a person
    // is actually paid from already carries «—» for this man.
    check('** TODAY ** the total is the sum of the priced weeks alone',
        has(shown.total, 'נצבר 450 ₪'), JSON.stringify(shown.total));
    check('** TODAY ** and it is still called the total for the range',
        shown.total.indexOf('סה״כ לטווח') === 0, JSON.stringify(shown.total));
    check('the ceiling work is not involved - this range is three weeks long',
        made.run(`weeklyBreakdownFor('w_mix', REPORT_RANGE.from, REPORT_RANGE.to).complete === true`) === true,
        made.run(`String(weeklyBreakdownFor('w_mix', REPORT_RANGE.from, REPORT_RANGE.to).complete)`));

    // THE TWO NUMBERS THE DECISION NEEDS, side by side: what is shown, and what the full
    // total of this range actually is - which is not a number at all, because one worked
    // week of it has no price and no wage may be guessed to close the gap.
    const known = weeks.filter(w => w.amount !== null).reduce((sum, w) => sum + w.amount, 0);
    const unknownWorked = weeks.filter(w => w.amount === null && w.attendanceDays > 0).length;
    check('shown 450, known 450, and one worked week unknowable',
        known === 450 && unknownWorked === 1,
        JSON.stringify({ shown: 450, known, unknownWorkedWeeks: unknownWorked }));
    // And the range row the sheet pays from says the same thing the honest total would.
    check('the range row itself reports an unknown wage for this man',
        made.run(`payrollRows().find(r => r.workerId === 'w_mix').amount === null`) === true,
        made.run(`String(payrollRows().find(r => r.workerId === 'w_mix').amount)`));
}

// ------------------------------------- part three: the all-unknown case is already honest
{
    suite('when nothing in the range can be priced, the total says so');

    const made = phoneClearedRate();
    // Take the one stamped day away: now no week can be priced at all.
    made.State.commit(made.call('unassignPlace',
        made.State.schedule, WEEK1_DAY, 'w_mix', 'actual', 'p_01'));
    made.State.save({ silent: true });
    look(made);
    const weeks = weeksOf(made);
    given('no week in the range has a price',
        weeks.every(week => week.amount === null), JSON.stringify(weeks.map(w => w.amount)));
    check('the total shows a dash rather than a number',
        has(drawn(made).total, 'נצבר —'), JSON.stringify(drawn(made).total));
}

report();
