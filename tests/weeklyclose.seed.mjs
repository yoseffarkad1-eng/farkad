// A crew with a week to close, for tests/weeklyclose.browser.mjs and the pictures made for
// the owner. A helper, not a suite: it asserts nothing. Both functions RUN IN THE PAGE.
//
// SYNTHETIC NAMES ONLY. Invented men, invented sums, invented sites.
//
// Friday 13 November 2026, noon - the morning after a week, and a fortnight, ended:
//
//   מחמוד עיסא    weekly       3,000 on 02/11; that week closed BY HAND with 1,000 taken;
//                              500 more on 09/11 - he comes in owing 2,000 and leaves 2,500
//   סאמר ח'ורי     weekly       2,400 on 08/11
//   יוסף נסאר      weekly       1,000 on 09/11
//   אחמד זועבי     weekly       no advance
//   כרים סלאמה     weekly       800 on 02/11, and THAT week left open: the pass refuses him
//                              and points at it (the owner's D5)
//   ראמי עודה      fortnightly  5,950 on 21/10; that fortnight closed by hand with 2,000 taken
//   ג'מאל בשארה    fortnightly  3,000 on 19/10, worked until 22/10 and not since; that
//                              fortnight closed by hand with nothing taken
//   וליד מנסור     fortnightly  no advance
//
// Every earlier period that money ran through is closed by hand, oldest first, except
// כרים's - which is the state the owner's decisions leave a record in after the first
// weeks of closing.

export const WEEKLY_TODAY = '2026-11-13';
export const WEEKLY_NOON = '2026-11-13T12:00:00+02:00';

export function weeklySeedCrew() {
    const W = '2026-08-07=weekly';
    State.schedule = emptySchedule();
    State.schedule.workers = [
        { id: 'w_m', name: 'מחמוד עיסא', active: true, dailyRate: 480, hourlyRate: 0, payCycles: W },
        { id: 'w_s', name: 'סאמר ח\'ורי', active: true, dailyRate: 600, hourlyRate: 0, payCycles: W },
        { id: 'w_y', name: 'יוסף נסאר', active: true, dailyRate: 550, hourlyRate: 0, payCycles: W },
        { id: 'w_a', name: 'אחמד זועבי', active: true, dailyRate: 520, hourlyRate: 0, payCycles: W },
        { id: 'w_k', name: 'כרים סלאמה', active: true, dailyRate: 450, hourlyRate: 0, payCycles: W },
        { id: 'w_r', name: 'ראמי עודה', active: true, dailyRate: 650, hourlyRate: 0 },
        { id: 'w_j', name: 'ג\'מאל בשארה', active: true, dailyRate: 500, hourlyRate: 0 },
        { id: 'w_w', name: 'וליד מנסור', active: true, dailyRate: 500, hourlyRate: 0 }
    ];
    State.schedule.places = [{ id: 'p_1', name: 'חיפה - נמל', active: true }, { id: 'p_2', name: 'נצרת', active: true }];
    const day = new Date(2026, 9, 16, 12);
    const last = new Date(2026, 10, 12, 12);
    for (; day <= last; day.setDate(day.getDate() + 1)) {
        if (day.getDay() === 6) continue;                                  // Saturday off
        const date = toLocalDateStr(day);
        State.schedule.workers.forEach((worker, i) => {
            if (worker.id === 'w_j' && date > '2026-10-22') return;          // he stopped coming
            if (day.getDay() === 5 && i % 3 === 0) return;                   // some Fridays off
            assignPlace(State.schedule, date, worker.id, 'actual', i % 2 ? 'p_1' : 'p_2');
        });
    }
    addAdvance(State.schedule, 'w_m', '2026-11-02', 3000, '');
    addAdvance(State.schedule, 'w_m', '2026-11-09', 500, '');
    addAdvance(State.schedule, 'w_s', '2026-11-08', 2400, '');
    addAdvance(State.schedule, 'w_y', '2026-11-09', 1000, '');
    addAdvance(State.schedule, 'w_k', '2026-11-02', 800, '');
    addAdvance(State.schedule, 'w_r', '2026-10-21', 5950, '');
    addAdvance(State.schedule, 'w_j', '2026-10-19', 3000, '');
    State.save({ silent: true });
}

// The approval and the closes by hand - written the way the app's own button writes them
// (saveFinancialAction -> closePeriodChanges -> State.commitMany). Returns what each writer
// answered, for the caller to hold as a precondition.
export function weeklySeedMoney() {
    const done = [];
    const plan = planCarryMigration(State.schedule);
    if (plan.needed && !carryMigrationApproved(State.schedule, plan)) {
        done.push(State.commit(recordCarryApproval(State.schedule, plan, '2026-10-20T09:00:00.000Z', syncDeviceId())) !== false);
    }
    const close = (list, at) => saveFinancialAction(() => list.reduce((all, one) => all.concat(
        closePeriodChanges(State.schedule, one[0], one[1], one[2], at, syncDeviceId(), one[3])), [])) === true;
    done.push(close([['w_r', '2026-10-16', '2026-10-29', 2000], ['w_j', '2026-10-16', '2026-10-29', 0]], '2026-10-30T15:00:00.000Z'));
    done.push(close([['w_m', '2026-10-30', '2026-11-05', 1000]], '2026-11-06T15:00:00.000Z'));
    return done;
}
