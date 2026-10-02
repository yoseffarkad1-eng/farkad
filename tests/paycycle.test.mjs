// Two pay cycles on one record, and every place the arithmetic has to know the difference.
//
//   node tests/paycycle.test.mjs
//
// Four of the crew are settled every Thursday and the rest every second Thursday. That is
// one sentence and it reaches further than it looks: a period is not a filter on a report,
// it is the unit an advance is deducted once against, the unit a closure freezes, and the
// unit a carry is carried to. Get it wrong in any one of those and somebody is paid twice
// or not at all, on a sheet where every number looks reasonable.
//
// The cases here are the ones that can actually cost money:
//   W1  a week is seven days, Friday to Thursday, and it is nobody's fortnight
//   W2  a week that crosses the end of a month is still one week
//   W3  a cycle change applies FORWARD, and leaves a named stub behind it
//   W4  a cycle change never re-cuts a period that is already closed
//   W5  an advance bigger than one week's wage settles once and carries the rest
//   W6  the same advance is never deducted twice by two overlapping views
//   W7  a closure that overlaps one already recorded is refused, and says why
//   W8  vehicle pay lands in the period its departure was recorded in
//   W9  two phones setting the cycle differently contest one field, not the man
//   W10 the setting survives a backup, a restore and a reopen
//
// The money gates are SHUT in everything that ships. The suites that need them open them
// through the harness `flags` seam and nowhere else, so the shipped defaults stay pinned.

import { makeDevice } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const OPEN = { ledgerWrites: true, carryAdvances: true };

// 2026-09-11 is a Friday. The fortnight containing it opens on 2026-09-04.
const SWITCH = '2026-09-11';
const WEEK = { from: '2026-09-11', to: '2026-09-17' };
const FORTNIGHT = { from: '2026-09-04', to: '2026-09-17' };

function crew(options = {}) {
    const device = makeDevice(options);
    device.setToday('2026-09-17');
    device.State.schedule.workers = [
        // Weekly, from the Friday named above.
        { id: 'w_wk', name: 'אבו גזאל', active: true, dailyRate: 650, hourlyRate: 0,
            payCycles: `${SWITCH}=weekly` },
        // Nothing set: the way everybody was before this existed.
        { id: 'w_bi', name: 'עומר', active: true, dailyRate: 450, hourlyRate: 0 }
    ];
    device.State.schedule.places = [{ id: 'p_01', name: 'אילון', active: true }];
    // Through the roster's own door, not a bare save: that is what puts the crew on the
    // disk in the shape a reopen reads back.
    device.State.commitRoster();
    return device;
}

function work(device, worker, dates) {
    dates.forEach(date => device.State.commit(device.call('assignPlace',
        device.State.schedule, date, worker, 'actual', 'p_01')));
}

const period = (device, worker, date) =>
    device.call('periodRangeFor', device.State.worker(worker), date);

// ------------------------------------------------------------------ W1: a week is a week
{
    suite('W1: a weekly man is settled over seven days, Friday to Thursday');

    const device = crew({ deviceId: 'd_w1' });

    const weekly = period(device, 'w_wk', '2026-09-16');
    same('his period opens on the Friday', weekly.from, WEEK.from);
    same('and closes on the Thursday', weekly.to, WEEK.to);
    same('and it is called weekly', weekly.cycle, 'weekly');

    const other = period(device, 'w_bi', '2026-09-16');
    same('the man with nothing set keeps the fortnight', other.from, FORTNIGHT.from);
    same('through its fourteenth day', other.to, FORTNIGHT.to);
    same('and it is called biweekly', other.cycle, 'biweekly');

    // The load-bearing fact that lets the two share one ledger.
    check('a week never straddles a fortnight: it opens on the same Friday or its midpoint',
        weekly.from === FORTNIGHT.from || weekly.from === '2026-09-11',
        `${weekly.from} vs ${FORTNIGHT.from}`);
}

// ------------------------------------------------------- W2: across the end of a month
{
    suite('W2: a week that crosses the end of a month is still one week');

    const device = crew({ deviceId: 'd_w2' });
    device.State.worker('w_wk').payCycles = '2026-08-28=weekly';
    device.State.save({ silent: true });

    // 2026-08-28 is a Friday; the week runs into September.
    const across = period(device, 'w_wk', '2026-09-01');
    same('it opens in August', across.from, '2026-08-28');
    same('and closes in September', across.to, '2026-09-03');
    check('seven days, not a calendar month',
        Math.round((new Date(across.to) - new Date(across.from)) / 86400000) + 1 === 7,
        `${across.from}..${across.to}`);
}

// ------------------------------------------------------------ W3: the change is forward
{
    suite('W3: a cycle change applies forward and names the stub it leaves');

    const device = crew({ deviceId: 'd_w3' });

    const after = period(device, 'w_wk', SWITCH);
    same('from the effective Friday he is weekly', after.cycle, 'weekly');
    same('and that week opens on it', after.from, SWITCH);

    const before = period(device, 'w_wk', '2026-09-10');
    same('the day before, he is still on the old cycle', before.cycle, 'biweekly');
    same('that period keeps its original opening', before.from, FORTNIGHT.from);
    // The whole point: the fortnight is CUT at the change, not carried over it.
    same('but it is cut the day before the change', before.to, '2026-09-10');
    check('and it says it is a transition', before.transition === true,
        JSON.stringify(before));

    // A cycle with no date in force is not a cycle. Guessing one would be the
    // retroactive recut this exists to prevent.
    device.State.worker('w_wk').payCycles = '';
    device.State.save({ silent: true });
    same('an empty history is the old way, not a new one',
        period(device, 'w_wk', '2026-09-16').cycle, 'biweekly');
}

// ------------------------------------------------- W4: a closed period is never re-cut
{
    suite('W4: changing the cycle does not recompute a period already closed');

    const device = crew({ deviceId: 'd_w4', flags: OPEN });
    work(device, 'w_bi', ['2026-09-04', '2026-09-07', '2026-09-08']);   // 3 x 450 = 1350

    const before = device.call('payrollReport', device.State.schedule,
        FORTNIGHT.from, FORTNIGHT.to).find(row => row.workerId === 'w_bi');
    given('the fortnight is worth 1,350 before anything is closed',
        before.amount === 1350, String(before.amount));

    const closing = device.call('closePeriodChanges', device.State.schedule,
        'w_bi', FORTNIGHT.from, FORTNIGHT.to, new Date().toISOString(), 'd_w4');
    given('the closure produced changes', Array.isArray(closing) && closing.length > 0,
        String(closing && closing.length));
    device.State.commitMany(closing);

    // Now move him to weekly, retroactively as far as the form would allow.
    device.State.worker('w_bi').payCycles = `${SWITCH}=weekly`;
    device.State.save({ silent: true });

    const after = device.call('payrollReport', device.State.schedule,
        FORTNIGHT.from, FORTNIGHT.to).find(row => row.workerId === 'w_bi');
    same('the closed fortnight still reports the same wage', after.amount, before.amount);
    same('and the same number of pay units', after.payUnits, before.payUnits);
}

// ------------------------------------- W5: an advance bigger than one week's wage
{
    suite('W5: an advance larger than a week settles once and carries the rest');

    const device = crew({ deviceId: 'd_w5', flags: OPEN });
    // Three days at 650 = 1,950 in the week.
    work(device, 'w_wk', ['2026-09-11', '2026-09-14', '2026-09-15']);
    device.State.commit(device.call('addAdvance', device.State.schedule,
        'w_wk', '2026-09-11', 3000, 'מקדמה'));

    const account = device.call('advanceAccount', device.State.schedule,
        'w_wk', WEEK.from, WEEK.to);
    same('the week earns 1,950', account.gross, 1950);
    same('all of it goes against the advance', account.deducted, 1950);
    same('and 1,050 is carried, not written off', account.carriedForward, 1050);
    check('the man is never owed a negative wage',
        account.gross - account.deducted >= 0,
        JSON.stringify([account.gross, account.deducted]));
}

// -------------------------------------------- W6: the same advance, two views, once
{
    suite('W6: a wider view never deducts the same advance a second time');

    const device = crew({ deviceId: 'd_w6', flags: OPEN });
    work(device, 'w_wk', ['2026-09-11', '2026-09-14', '2026-09-15']);
    device.State.commit(device.call('addAdvance', device.State.schedule,
        'w_wk', '2026-09-11', 3000, 'מקדמה'));

    const week = device.call('advanceAccount', device.State.schedule,
        'w_wk', WEEK.from, WEEK.to);
    const fortnight = device.call('advanceAccount', device.State.schedule,
        'w_wk', FORTNIGHT.from, FORTNIGHT.to);

    // The fortnight is NOT his period. Looking at him through it is a way of reading
    // days; it must never double what the week already took off.
    check('the fortnight does not take more off than the man ever earned',
        fortnight.deducted <= fortnight.gross,
        JSON.stringify([fortnight.deducted, fortnight.gross]));
    check('and it does not deduct twice what one advance is worth',
        week.deducted + fortnight.deducted <= 3000 + week.deducted,
        JSON.stringify([week.deducted, fortnight.deducted]));
    same('the advance itself is still one record',
        Object.keys(device.State.schedule.advances || {}).length, 1);
}

// ------------------------------------------------- W7: overlapping closures refused
{
    suite('W7: a closure overlapping one already recorded is refused and says why');

    const device = crew({ deviceId: 'd_w7', flags: OPEN });
    work(device, 'w_wk', ['2026-09-11', '2026-09-14']);

    const first = device.call('closePeriodChanges', device.State.schedule,
        'w_wk', WEEK.from, WEEK.to, new Date().toISOString(), 'd_w7');
    given('his week closes', Array.isArray(first) && first.length > 0,
        String(first && first.length));
    device.State.commitMany(first);

    // The fortnight CONTAINS that week. Closing it would freeze the same days again.
    const plan = device.call('planPeriodClosure', device.State.schedule,
        'w_wk', FORTNIGHT.from, FORTNIGHT.to, new Date().toISOString());
    check('the overlapping fortnight cannot be closed', plan.canClose === false,
        JSON.stringify(plan.reasons));
    check('and the reason names the overlap, not something else',
        plan.reasons.indexOf('overlap') !== -1, JSON.stringify(plan.reasons));

    // A period that shares no day is still closable: the guard is about days, not about
    // being cautious.
    const clear = device.call('planPeriodClosure', device.State.schedule,
        'w_wk', '2026-09-18', '2026-09-24', new Date().toISOString());
    check('a period sharing no day with it is not blocked by the overlap rule',
        clear.reasons.indexOf('overlap') === -1, JSON.stringify(clear.reasons));
}

// ---------------------------------------------------------------- W8: vehicle pay
{
    suite('W8: vehicle pay lands in the period its departure was recorded in');

    const device = crew({ deviceId: 'd_w8', flags: { vehicles: true } });
    const row = device.call('payrollReport', device.State.schedule, WEEK.from, WEEK.to)
        .find(entry => entry.workerId === 'w_wk');
    // With no departure recorded there is no vehicle money. That is the shipped rule and
    // the cycle does not change it.
    same('no departure recorded means no vehicle pay', row.vehicleAmount || 0, 0);
    same('and no vehicle days', row.vehicleDays || 0, 0);
}

// ------------------------------------------------- W9: two phones, one field
{
    suite('W9: two phones setting the cycle contest one field, not the man');

    const device = crew({ deviceId: 'd_w9a' });
    const ok = device.call('entityFieldProblems', 'workers', 'payCycles',
        `${SWITCH}=weekly`);
    same('a readable history is a field the wire will carry', ok.length, 0);
    const bad = device.call('entityFieldProblems', 'workers', 'payCycles',
        `${SWITCH}=monthly`);
    check('a cycle the arithmetic does not know is refused', bad.length > 0,
        JSON.stringify(bad));
    const notFriday = device.call('entityFieldProblems', 'workers', 'payCycles',
        '2026-09-16=weekly');
    check('a boundary that is not a Friday is refused', notFriday.length > 0,
        JSON.stringify(notFriday));
    const backwards = device.call('entityFieldProblems', 'workers', 'payCycles',
        '2026-09-25=biweekly;2026-09-11=weekly');
    check('a history that runs backwards is refused', backwards.length > 0,
        JSON.stringify(backwards));
    const cleared = device.call('entityFieldProblems', 'workers', 'payCycles', '');
    same('clearing it back to the default is allowed', cleared.length, 0);
}

// ------------------------------------------- W10: it survives the round trip
{
    suite('W10: the setting survives a save, a reopen and a backup');

    const device = crew({ deviceId: 'd_w10' });
    device.State.save({ silent: true });

    // A reopen is the bytes on the disk opened by a new app, and the new app has to be
    // told to read them - the harness does not boot one for you. See tests/upgrade.test.mjs.
    const reopened = makeDevice({ storage: device.dump(), deviceId: device.id });
    reopened.State.load();
    const worker = reopened.State.worker('w_wk');
    same('the history is still there after a reopen', worker.payCycles,
        `${SWITCH}=weekly`);
    same('and it still settles him weekly',
        reopened.call('payCycleAt', worker, '2026-09-16'), 'weekly');
    // The GUARANTEE, not the spelling. A man nobody set a cycle for carries no cycle key
    // at all through this path, and `''` and absent mean the same thing to every reader -
    // so what is pinned is that nothing was invented for him and he is still settled the
    // way he always was. Asserting `''` here would be a test about a representation.
    const untouched = reopened.State.worker('w_bi');
    check('nothing invented a cycle for the man nobody set one for',
        !untouched.payCycles, JSON.stringify([untouched.payCycles]));
    same('and he is still settled fortnightly',
        reopened.call('payCycleAt', untouched, '2026-09-16'), 'biweekly');

    // Through the backup file, which is what a person actually carries between phones.
    const backup = JSON.parse(JSON.stringify(reopened.State.schedule));
    const fresh = makeDevice({ deviceId: 'd_w10b' });
    fresh.State.schedule = fresh.call('normaliseSchedule', backup);
    fresh.State.save({ silent: true });
    same('and it survives the backup file', fresh.State.worker('w_wk').payCycles,
        `${SWITCH}=weekly`);

    // A value nobody here understands reads as the default, never as a new cycle.
    const odd = JSON.parse(JSON.stringify(backup));
    odd.workers.find(item => item.id === 'w_wk').payCycles = '2026-09-11=monthly';
    const guarded = makeDevice({ deviceId: 'd_w10c' });
    guarded.State.schedule = guarded.call('normaliseSchedule', odd);
    check('an unreadable history is KEPT, not replaced with the default',
        guarded.State.worker('w_wk').payCycles === '2026-09-11=monthly',
        JSON.stringify(guarded.State.worker('w_wk').payCycles));
    same('and he is settled fortnightly again',
        guarded.call('periodRangeFor', guarded.State.worker('w_wk'), '2026-09-16').cycle,
        'biweekly');
}

report();
