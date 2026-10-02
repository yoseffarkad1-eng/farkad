// The three ways two pay cycles went wrong, each reproduced before it was fixed.
//
//   node tests/paycycle.blockers.test.mjs
//
// Every case here was produced on a real tree and measured, not imagined. They are kept
// as one file because they share a cause: the cycle was written as a SETTING - the
// current cycle and the Friday it started - when it is a HISTORY, and a history that has
// to travel as one decision.
//
//   B1  a weekly closure was quarantined as damage at the next boot, and blocked writes
//   B2  a later change silently re-cut a day that was already worked
//   B3  two phones merged two different decisions into a third nobody made
//
// B1 is the one that costs most: a correct money record, written by this app through its
// own door, condemned by its own validator on reopen.

import { makeDevice, makeCloud, settle } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const OPEN = { ledgerWrites: true, carryAdvances: true };
const SWITCH = '2026-09-11';                 // a Friday
const WEEK = { from: '2026-09-11', to: '2026-09-17' };

function phone(id, extra = {}) {
    const device = makeDevice(Object.assign({ deviceId: id, flags: OPEN }, extra));
    device.Sync.pushDelayMs = 6;
    device.setToday('2026-09-17');
    device.ctx.askTell = () => Promise.resolve();
    return device;
}

function seed(device, payCycles) {
    device.State.schedule.workers = [{ id: 'w_wk', name: 'אבו גזאל', active: true,
        dailyRate: 650, hourlyRate: 0, payCycles }];
    device.State.schedule.places = [{ id: 'p_01', name: 'אילון', active: true }];
    device.State.commitRoster();
    return device;
}

// ------------------------------------------------------------------------------ B1
{
    suite('B1: a weekly closure survives its own validator, a reopen and a second phone');

    const a = seed(phone('d_b1'), `${SWITCH}=weekly`);
    ['2026-09-11', '2026-09-14'].forEach(date => a.State.commit(a.call('assignPlace',
        a.State.schedule, date, 'w_wk', 'actual', 'p_01')));

    const changes = a.call('closePeriodChanges', a.State.schedule, 'w_wk',
        WEEK.from, WEEK.to, '2026-09-17T12:00:00.000Z', 'd_b1');
    given('his week produced a closure', Array.isArray(changes) && changes.length > 0,
        String(changes && changes.length));
    given('and it committed', a.State.commitMany(changes) === true);
    given('the writing device is not blocked', a.call('farkadWritesBlocked') === false);

    // THE MEASUREMENT THAT WAS RED. closureProblems asked accountStart and thirteen days,
    // which no weekly period can satisfy, so the closure this app had just written was
    // read back as damage.
    const reopened = makeDevice({ storage: a.dump(), deviceId: 'd_b1', flags: OPEN });
    reopened.State.load();
    check('after a reopen the device is still able to write',
        reopened.call('farkadWritesBlocked') === false,
        String(reopened.call('farkadWritesBlocked')));
    const unreadable = (reopened.State.schedule.ledger || {}).unreadable || {};
    check('and the closure is not sitting in ledger.unreadable',
        Object.keys(unreadable).length === 0, JSON.stringify(Object.keys(unreadable)));
    check('the closure is on the record where it belongs',
        Boolean(((reopened.State.schedule.ledger || {}).advances || {})
            [`le_period_w_wk_${SWITCH.replace(/-/g, '')}`]),
        JSON.stringify(Object.keys((reopened.State.schedule.ledger || {}).advances || {})));

    // A SECOND PHONE, opening the same bytes. A closure that only the phone that wrote it
    // can read is money off a wage the other two go on deducting.
    const second = makeDevice({ storage: a.dump(), deviceId: 'd_b1_other', flags: OPEN });
    second.State.load();
    check('a second device reading the same disk is not blocked either',
        second.call('farkadWritesBlocked') === false,
        String(second.call('farkadWritesBlocked')));
    same('and it agrees the period is closed',
        Boolean(second.call('periodArtifactFor', second.State.schedule, 'w_wk', WEEK.from)),
        true);

    // The historical half: he moves BACK to fortnightly afterwards. The closure was
    // written under a cycle he is no longer on, and it must stay accountable for.
    const later = makeDevice({ storage: a.dump(), deviceId: 'd_b1_later', flags: OPEN });
    later.State.load();
    later.State.worker('w_wk').payCycles = `${SWITCH}=weekly;2026-10-02=biweekly`;
    later.State.commitRoster();
    const after = makeDevice({ storage: later.dump(), deviceId: 'd_b1_later', flags: OPEN });
    after.State.load();
    check('a weekly closure is still valid after he moves back to fortnightly',
        after.call('farkadWritesBlocked') === false,
        JSON.stringify(Object.keys((after.State.schedule.ledger || {}).unreadable || {})));
}

// ------------------------------------------------------------------------------ B2
{
    suite('B2: a later change never re-cuts a day that is already behind it');

    const device = seed(phone('d_b2'), `${SWITCH}=weekly`);
    const before = device.call('periodRangeFor', device.State.worker('w_wk'), '2026-09-16');
    given('16 September is settled by his week',
        before.from === WEEK.from && before.to === WEEK.to,
        `${before.cycle} ${before.from}..${before.to}`);

    // The change that used to erase it: a LATER boundary, saved over the record.
    device.State.worker('w_wk').payCycles = `${SWITCH}=weekly;2026-09-25=biweekly`;
    device.State.commitRoster();

    const after = device.call('periodRangeFor', device.State.worker('w_wk'), '2026-09-16');
    same('the same day is still settled by the same period, from', after.from, before.from);
    same('and to', after.to, before.to);
    same('and by the same cycle', after.cycle, before.cycle);

    // And the new boundary does govern what comes after it.
    const next = device.call('periodRangeFor', device.State.worker('w_wk'), '2026-09-26');
    same('while the day after the new boundary is fortnightly', next.cycle, 'biweekly');

    // The form refuses a boundary that would land on a period already closed.
    const closing = device.call('closePeriodChanges', device.State.schedule, 'w_wk',
        WEEK.from, WEEK.to, '2026-09-17T12:00:00.000Z', 'd_b2');
    device.State.commitMany(closing);
    const refusal = device.call('payCycleAddProblem', 'w_wk', SWITCH);
    check('and a boundary on a closed period is refused in words',
        typeof refusal === 'string' && refusal.length > 0, JSON.stringify(refusal));
    const allowed = device.call('payCycleAddProblem', 'w_wk', '2026-10-02');
    same('while one after it is allowed', allowed, '');
}

// ------------------------------------------------------------------------------ B3
{
    suite('B3: two phones choosing differently contest the decision, not its halves');

    const cloud = makeCloud();
    const a = seed(phone('d_b3_a'), `${SWITCH}=weekly`);
    a.Sync.connect(cloud.adapter);
    await settle(200);

    const b = makeDevice({ storage: a.dump(), deviceId: 'd_b3_b', flags: OPEN });
    b.Sync.pushDelayMs = 6;
    b.setToday('2026-09-17');
    b.ctx.askTell = () => Promise.resolve();
    b.State.load();
    b.Sync.connect(cloud.adapter);
    await settle(200);

    given('both phones start from the same history',
        a.State.worker('w_wk').payCycles === b.State.worker('w_wk').payCycles,
        JSON.stringify([a.State.worker('w_wk').payCycles,
            b.State.worker('w_wk').payCycles]));

    // A says "weekly, and from the 25th too". B says "fortnightly, from the 11th".
    a.State.worker('w_wk').payCycles = `${SWITCH}=weekly;2026-09-25=weekly`;
    a.State.commitRoster();
    b.State.worker('w_wk').payCycles = `${SWITCH}=biweekly`;
    b.State.commitRoster();
    await settle(900);
    a.Sync.flush(); b.Sync.flush();
    await settle(900);

    const ofA = a.State.worker('w_wk').payCycles;
    const ofB = b.State.worker('w_wk').payCycles;
    const chose = [`${SWITCH}=weekly;2026-09-25=weekly`, `${SWITCH}=biweekly`];

    // THE MEASUREMENT THAT WAS RED. Two fields merged into (biweekly, 2026-09-25) - a
    // setting neither phone chose - on both phones, both saying synced, nothing held.
    check('no phone ends on a decision neither of them made',
        chose.indexOf(ofA) !== -1 && chose.indexOf(ofB) !== -1,
        JSON.stringify([ofA, ofB]));
    // THEY DO NOT AGREE YET, AND THAT IS THE POINT.
    //
    // Convergence here would mean the losing phone quietly adopted the other's decision
    // about how a man is paid - which is the merge this whole change exists to stop. What
    // is owed is that the disagreement is VISIBLE and survives until somebody resolves it.
    // An earlier version of this check asserted equality and was asserting the defect.
    const cloudCycles = (((cloud.doc || {}).roster || {}).workers || {}).w_wk || {};
    check('the cloud holds one of the two real decisions, not a blend of them',
        chose.indexOf(String(cloudCycles.payCycles)) !== -1,
        JSON.stringify(cloudCycles.payCycles));

    // One field is one path, so the loser is HELD rather than silently overwritten.
    const heldA = (a.Sync.heldRecords && a.Sync.heldRecords()) || [];
    const heldB = (b.Sync.heldRecords && b.Sync.heldRecords()) || [];
    const paths = heldA.concat(heldB).map(row => String(row.path || ''));
    check('the phone that lost holds its own version for a person to decide',
        heldA.length + heldB.length > 0,
        JSON.stringify({ heldA, heldB }));
    check('and it does not call itself synced over a decision it is still holding',
        (heldA.length === 0 || a.Sync.status !== 'synced')
        && (heldB.length === 0 || b.Sync.status !== 'synced'),
        JSON.stringify({ a: a.Sync.status, b: b.Sync.status,
            heldA: heldA.length, heldB: heldB.length }));
    check('and what it holds is the whole decision, not half of one',
        paths.every(path => path.indexOf('payCycleFrom') === -1),
        JSON.stringify(paths));
}

report();
