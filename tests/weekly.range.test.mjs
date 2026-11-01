// The weekly fold's ceiling, and what the total under it is allowed to claim.
//
//   node tests/weekly.range.test.mjs
//
// R1 OF THE INDEPENDENT READ OF v158, 18 October 2026.
//
// weeklyBreakdownFor stops after a fixed number of weekly periods - sixteen - and that
// ceiling is right: a loop that cannot end is worse than a table that stops. What was
// wrong is what the page then SAID about the stop. The slices came back with no mark on
// them, renderWeeklyBreakdown summed whatever it was handed, and labelled the sum
// «סה״כ לטווח» - the total for the chosen range - over a range the fold had not finished
// reading. A person settling a long range read a partial sum as a complete one, and
// nothing on the page said otherwise. dateInput only refuses an inverted range; nothing
// limits a range to sixteen weeks, so the case is reachable with two taps on the calendar.
//
// The fix is display only: the answer now carries whether it covers the range and how far
// it got, the total line says which of the two it is, and when it is short the page names
// the ceiling, the last week it reached, and that the sum belongs to those weeks alone.
// No boundary moved: every slice is still periodRangeFor's own answer stepped with
// nextPeriodFor and clamped to the range, and the ceiling is still sixteen.
//
// Synthetic data only: one invented man, one invented site, no real record is read.

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDevice } from './harness.mjs';
import { makeDom } from './moneydom.mjs';
import { suite, check, given, report } from './runner.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORTS = readFileSync(join(ROOT, 'js/ui/reports.js'), 'utf8');

// A real week start: Friday. Every slice below is one of this man's own weekly periods.
const ANCHOR = '2026-08-07';
const WORKED = '2026-08-10';
const TODAY = '2026-12-10';

// 16 periods exactly, and 17: the two sides of the ceiling.
const TO_16 = '2026-11-26';   // ANCHOR + 16*7 - 1
const TO_17 = '2026-12-03';   // ANCHOR + 17*7 - 1

function phone() {
    const device = makeDevice({ deviceId: 'd_weekly' });
    device.setToday(TODAY);
    const dom = makeDom();
    ['reportsView', 'workerDaysTitle', 'workerDaysMeta', 'workerDaysBody', 'workerDaysModal']
        .forEach(id => dom.register(id));
    device.ctx.document = dom;
    vm.runInContext(REPORTS, device.ctx, { filename: 'harness:reports' });
    device.ctx.askTell = () => Promise.resolve();
    device.run = code => vm.runInContext(code, device.ctx, { filename: 'harness:reports' });

    device.State.schedule.workers = [
        { id: 'w_week', name: 'כרם', active: true, dailyRate: 400, hourlyRate: 0,
            payCycles: `${ANCHOR}=weekly` },
        // A second man on the ordinary cycle, so the page has a work table to put the
        // fold under and the group split is the real one.
        { id: 'w_fort', name: 'סאלח', active: true, dailyRate: 450, hourlyRate: 0 }
    ];
    device.State.schedule.places = [{ id: 'p_01', name: 'פרסדיה', active: true }];
    ['w_week', 'w_fort'].forEach(id => device.State.commit(device.call('assignPlace',
        device.State.schedule, WORKED, id, 'actual', 'p_01', 'normal')));
    device.State.save({ silent: true });
    return device;
}

const rangeTo = (device, to) => device.run(
    `REPORT_RANGE.from='${ANCHOR}'; REPORT_RANGE.to='${to}';`
    + `REPORT_SECTION='workers'; REPORT_WORKERS=null; 1`);

const weeksOf = (device, to) => {
    rangeTo(device, to);
    return JSON.parse(device.run(`(() => {
        const weeks = weeklyBreakdownFor('w_week', REPORT_RANGE.from, REPORT_RANGE.to);
        return JSON.stringify({
            length: weeks.length,
            complete: weeks.complete,
            coveredTo: weeks.coveredTo,
            first: weeks[0] || null,
            last: weeks[weeks.length - 1] || null,
            spans: weeks.map(week => week.from + '..' + week.to)
        });
    })()`));
};

// The fold as it is drawn, which is where the claim is made.
const foldOf = (device, to) => {
    rangeTo(device, to);
    const section = device.run('renderPayrollTable()');
    const lines = section.querySelectorAll('.report-weekly-line')
        .map(node => node.textContent.replace(/\s+/g, ' ').trim());
    const totals = section.querySelectorAll('.report-weekly-total')
        .map(node => node.textContent.replace(/\s+/g, ' ').trim());
    const hints = section.querySelectorAll('.report-weekly-breakdown')
        .map(fold => fold.querySelectorAll('P').map(p => p.textContent).join(' | '))
        .join(' || ');
    return { lines, totals, hints };
};

// ------------------------------------------------------- sixteen periods: the whole range
{
    suite('a range of exactly sixteen weeks is covered, and says so');

    const device = phone();
    const weeks = weeksOf(device, TO_16);

    given('the range holds sixteen of this man\'s own weekly periods',
        weeks.length === 16, JSON.stringify({ length: weeks.length, spans: weeks.spans.slice(0, 2) }));
    check('the answer says it covers the range', weeks.complete === true,
        JSON.stringify({ complete: weeks.complete, coveredTo: weeks.coveredTo }));
    // COVERAGE OF BOTH ENDS. A fold that starts late or stops early is the same fault as
    // one that stops at the ceiling, and it would be invisible without these two.
    check('the first week starts where the range starts', weeks.first.from === ANCHOR,
        JSON.stringify(weeks.first));
    check('and the last week ends where the range ends', weeks.last.to === TO_16,
        JSON.stringify(weeks.last));
    check('it reached the end of the range', weeks.coveredTo === TO_16,
        String(weeks.coveredTo));
    // The boundaries are the cycle's own, stepped: no overlap and no gap between them.
    check('the weeks neither overlap nor leave a gap',
        weeks.spans.every((span, at) => at === 0
            || span.slice(0, 10) > weeks.spans[at - 1].slice(12)),
        JSON.stringify(weeks.spans.slice(0, 3)));

    const fold = foldOf(device, TO_16);
    check('the total line is the total FOR THE RANGE',
        fold.totals.length === 1 && fold.totals[0].indexOf('סה״כ לטווח') === 0,
        JSON.stringify(fold.totals));
    check('and nothing warns about a ceiling, because none was hit',
        fold.hints.indexOf('16 השבועות הראשונים') === -1, fold.hints);
    check('the fold says the last line is the total for the chosen range',
        fold.hints.indexOf('הסכום לטווח שנבחר') !== -1, fold.hints);
}

// ------------------------------------------------- seventeen periods: the ceiling is hit
{
    suite('a range of seventeen weeks stops at the ceiling, and does not call it the range');

    const device = phone();
    const weeks = weeksOf(device, TO_17);

    given('the range would hold seventeen periods and sixteen came back',
        weeks.length === 16, JSON.stringify({ length: weeks.length }));
    check('the answer says it does NOT cover the range', weeks.complete === false,
        JSON.stringify({ complete: weeks.complete, coveredTo: weeks.coveredTo }));
    check('and names the last week it reached', weeks.coveredTo === TO_16,
        String(weeks.coveredTo));
    check('which is inside the range, not at its end',
        weeks.coveredTo < TO_17, `${weeks.coveredTo} < ${TO_17}`);
    check('the first week still starts where the range starts',
        weeks.first.from === ANCHOR, JSON.stringify(weeks.first));

    const fold = foldOf(device, TO_17);
    check('the total line no longer claims to be the total for the range',
        fold.totals.length === 1 && fold.totals[0].indexOf('סה״כ לטווח') === -1,
        JSON.stringify(fold.totals));
    check('it says how many weeks it is the total of',
        fold.totals[0].indexOf('16 השבועות שמוצגים') !== -1, JSON.stringify(fold.totals));
    // BOTH BOUNDS OF WHAT IS SHOWN, not only the far end: a person checking a long range
    // needs to know where the shown weeks start as well as where they stop.
    check('the page names the ceiling and both bounds of the weeks it shows',
        fold.hints.indexOf('16 השבועות הראשונים') !== -1
        && fold.hints.indexOf('07/08') !== -1
        && fold.hints.indexOf('26/11') !== -1, fold.hints);
    check('and says the sum belongs to those weeks alone',
        fold.hints.indexOf('ולא של כל הטווח') !== -1, fold.hints);
    check('the fold\'s opening line agrees with the total under it',
        fold.hints.indexOf('הסכום של השבועות שמוצגים') !== -1
        && fold.hints.indexOf('הסכום לטווח שנבחר') === -1, fold.hints);
}

// -------------------------------------------------- the cycle boundaries, unchanged by R1
{
    suite('the boundaries are the cycle\'s own, before and after the ceiling');

    const device = phone();
    // A range that starts MID-week: the first slice is clamped to the range, which is what
    // makes the weeks add up to the row above them.
    const midWeek = '2026-08-09';          // inside the first weekly period
    device.run(`REPORT_RANGE.from='${midWeek}'; REPORT_RANGE.to='${TO_16}'; 1`);
    const clamped = JSON.parse(device.run(`(() => {
        const weeks = weeklyBreakdownFor('w_week', REPORT_RANGE.from, REPORT_RANGE.to);
        return JSON.stringify({ first: weeks[0] || null, complete: weeks.complete,
            length: weeks.length });
    })()`));
    check('a range starting mid-week is clamped, not widened',
        clamped.first && clamped.first.from === midWeek && clamped.first.whole === false,
        JSON.stringify(clamped.first));
    check('and that range is still covered to its end',
        clamped.complete === true, JSON.stringify(clamped));

    // A man who is NOT weekly over the whole range gets no fold at all - the existing
    // refusal, pinned here because the ceiling work runs right beside it.
    const none = JSON.parse(device.run(
        `JSON.stringify(weeklyBreakdownFor('w_fort', '${ANCHOR}', '${TO_16}'))`));
    check('a fortnightly man gets no weekly split', none.length === 0, JSON.stringify(none));
    check('and the refusal carries no false coverage mark',
        device.run(`weeklyBreakdownFor('w_fort', '${ANCHOR}', '${TO_16}').complete === undefined`) === true,
        String(device.run(`String(weeklyBreakdownFor('w_fort', '${ANCHOR}', '${TO_16}').complete)`)));
}

report();
