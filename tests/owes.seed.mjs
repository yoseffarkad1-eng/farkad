// A crew with money on it, for tests/owes.browser.mjs. A helper, not a suite: it asserts
// nothing. Both functions RUN IN THE PAGE.
//
// SYNTHETIC NAMES ONLY. Invented men, invented sums, invented sites.
//
// What it leaves on the record, on Thursday 12 November 2026 (the last day of a week, and
// of the fortnight that opened on 30 October):
//
//   ג'מאל בשארה   weekly       3,000 on 09/10, worked until 22/10 and not since; nothing closed
//   סאמר ח'ורי     weekly       2,400 on 16/10, works every week; nothing closed
//   מחמוד עיסא     weekly       2,600 on 27/10; the week to 29/10 CLOSED with 600 taken;
//                               the week to 05/11 left open
//   ראמי עודה      fortnightly  5,950 on 21/10; the fortnight to 29/10 CLOSED with 2,000 taken
//   אחמד זועבי     fortnightly  1,200 on 03/11, in his open fortnight
//   יוסף נסאר      weekly       1,000 on 08/11, in his open week
//   וליד מנסור     weekly       800 on 20/10, handed back in full: owes nothing
//   כרם נסאר, נאסר עודה         no advances; their weeks closed with the others'
//
// and three closes: two men on 22/10, four on 29/10, and one from another phone on 05/11.

export const OWES_TODAY = '2026-11-12';
export const OWES_NOON = '2026-11-12T12:00:00+02:00';

// The crew, their days and their advances - the old way, as every phone still writes an
// advance. The page is RELOADED after this, which is what mirrors them into the ledger.
export function owesSeedCrew() {
    const W = '2026-08-07=weekly';
    State.schedule = emptySchedule();
    State.schedule.workers = [
        { id: 'w_j', name: 'ג\'מאל בשארה', active: true, dailyRate: 500, hourlyRate: 0, payCycles: W },
        { id: 'w_s', name: 'סאמר ח\'ורי', active: true, dailyRate: 600, hourlyRate: 0, payCycles: W },
        { id: 'w_m', name: 'מחמוד עיסא', active: true, dailyRate: 480, hourlyRate: 0, payCycles: W },
        { id: 'w_r', name: 'ראמי עודה', active: true, dailyRate: 650, hourlyRate: 0 },
        { id: 'w_a', name: 'אחמד זועבי', active: true, dailyRate: 520, hourlyRate: 0 },
        { id: 'w_y', name: 'יוסף נסאר', active: true, dailyRate: 550, hourlyRate: 0, payCycles: W },
        { id: 'w_w', name: 'וליד מנסור', active: true, dailyRate: 500, hourlyRate: 0, payCycles: W },
        { id: 'w_k', name: 'כרם נסאר', active: true, dailyRate: 450, hourlyRate: 0, payCycles: W },
        { id: 'w_n', name: 'נאסר עודה', active: true, dailyRate: 430, hourlyRate: 0, payCycles: W }
    ];
    State.schedule.places = [{ id: 'p_1', name: 'חיפה - נמל', active: true }, { id: 'p_2', name: 'נצרת', active: true }];
    const day = new Date(2026, 9, 2, 12);
    const last = new Date(2026, 10, 12, 12);
    for (let at = 0; day <= last; day.setDate(day.getDate() + 1), at += 1) {
        if (day.getDay() === 6 || day.getDay() === 5) continue;          // Friday and Saturday off
        const date = toLocalDateStr(day);
        State.schedule.workers.forEach((worker, i) => {
            if (worker.id === 'w_j' && date > '2026-10-22') return;       // he stopped coming
            if ((i + at) % 11 === 0) return;                              // a day off here and there
            assignPlace(State.schedule, date, worker.id, 'actual', i % 2 ? 'p_1' : 'p_2');
        });
    }
    addAdvance(State.schedule, 'w_j', '2026-10-09', 3000, '');
    addAdvance(State.schedule, 'w_s', '2026-10-16', 2400, '');
    addAdvance(State.schedule, 'w_m', '2026-10-27', 2600, '');
    addAdvance(State.schedule, 'w_r', '2026-10-21', 5950, '');
    addAdvance(State.schedule, 'w_a', '2026-11-03', 1200, '');
    addAdvance(State.schedule, 'w_y', '2026-11-08', 1000, '');
    addAdvance(State.schedule, 'w_w', '2026-10-20', 800, '');
    State.save({ silent: true });
}

// The approval, the repayment and the closes - written the way the app's own buttons write
// them (saveFinancialAction -> closePeriodChanges -> State.commitMany). Returns what each
// writer answered, for the caller to hold as a precondition.
export function owesSeedMoney() {
    const done = [];
    const plan = planCarryMigration(State.schedule);
    if (plan.needed && !carryMigrationApproved(State.schedule, plan)) {
        done.push(State.commit(recordCarryApproval(State.schedule, plan, '2026-10-20T09:00:00.000Z', syncDeviceId())) !== false);
    }
    const of = id => advancesFor(State.schedule, id, '0000-01-01', '9999-12-31')[0].id;
    done.push(State.commit(recordAdvanceRepaid(State.schedule, of('w_w'), 800, '2026-10-28', '',
        '2026-10-28T15:00:00.000Z', syncDeviceId(), 'cash')) !== false);
    const close = (list, at, by) => saveFinancialAction(() => list.reduce((all, one) => all.concat(
        closePeriodChanges(State.schedule, one[0], one[1], one[2], at, by || syncDeviceId(), one[3])), [])) === true;
    done.push(close([['w_k', '2026-10-16', '2026-10-22', 0], ['w_n', '2026-10-16', '2026-10-22', 0]],
        '2026-10-22T14:30:00.000Z'));
    done.push(close([['w_m', '2026-10-23', '2026-10-29', 600], ['w_r', '2026-10-16', '2026-10-29', 2000],
        ['w_k', '2026-10-23', '2026-10-29', 0], ['w_n', '2026-10-23', '2026-10-29', 0]],
    '2026-10-29T15:40:00.000Z'));
    done.push(close([['w_k', '2026-10-30', '2026-11-05', 0]], '2026-11-05T15:10:00.000Z', 'd_other_phone'));
    return done;
}
