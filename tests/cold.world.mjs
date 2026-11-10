// NOT A SUITE: it asserts nothing. The record tests/cold.browser.mjs puts on a real
// browser's disk - a phone as Phase 6 leaves one: two months and five closures out of the
// server's live document, and every one of their days and entries still in the
// localStorage record. Built with the app's own code on the fake cloud, exactly as
// tests/cold.test.mjs builds its own (that suite keeps its copy of these forty lines so
// that it reads top to bottom on its own).

import { makeCloud, settleUntil } from './harness.mjs';
import { FORTNIGHT, WEEK1, WEEK2, TODAY, clone, stamp, payDevice, world, plan, openBook } from './paybook.world.mjs';

const SCHEDULE = 'scheduleData:v2';

export async function archivedPhone() {
    const first = world();
    openBook(first, undefined, 'd_seed');
    const put = change => { if (first.State.commit(change) !== true) throw new Error('a base edit was refused'); };
    put(first.call('setRimaCount', first.State.schedule, '2026-10-05', 'p_a', 3));
    put(first.call('setRimaCount', first.State.schedule, '2026-09-28', 'p_b', 2));
    put(first.call('assignPlace', first.State.schedule, '2026-11-02', 'w_salim', 'actual', 'p_a', undefined, 0));
    const schedule = clone(first.State.schedule);
    const cloud = makeCloud({ payRules: true,
        doc: Object.assign(clone(first.call('cloudDocument', schedule)), { protocol: 2, revision: 1, lastOpId: 'op_seed' }) });
    const a = payDevice({ deviceId: 'd_a', flags: { paybookQueue: false, months: true },
        storage: { [SCHEDULE]: JSON.stringify(schedule) } });
    a.Sync.pushDelayMs = 5;
    a.State.load();
    a.Sync.connect(cloud.adapter);
    const quiet = () => a.Sync.status === 'synced' && a.Sync.pendingCount() === 0;
    await settleUntil(quiet, 8000, 5);
    const close = async (worker, period, hour = '10') => {
        const draw = paid => plan(a, 'planClosure', worker, period,
            Object.assign({ method: 'cash' }, paid === null ? {} : { paid, paidOn: TODAY }), stamp(TODAY, a.id, hour));
        const answer = await a.Sync.transactPaybook(draw(draw(null).review.netDue));
        if (answer.state !== 'closed') throw new Error('a closure did not reach the server: ' + JSON.stringify(answer));
    };
    for (const man of ['w_khaled', 'w_salim', 'w_nasser']) await close(man, FORTNIGHT);
    await close('w_ahmad', WEEK1);
    await close('w_ahmad', WEEK2, '11');
    await settleUntil(quiet, 8000, 5);
    if ((await a.Sync.archiveClosed({ today: '2027-05-01' })).ok !== true) throw new Error('the closures did not leave');
    await settleUntil(quiet, 8000, 5);
    if ((await a.Sync.archiveMonths({ today: '2027-05-01' })).ok !== true) throw new Error('the months did not leave');
    await settleUntil(quiet, 8000, 5);
    const units = a.call('coldUnitsNamed', a.State.schedule).map(unit => unit.key).sort();
    return { record: a.raw(SCHEDULE), units, cloud };
}
