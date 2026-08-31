// What the line is allowed to say, and when.
//
//   node tests/status.test.mjs
//
// "מסונכרן בין המכשירים" is a promise: everything this person recorded is on the other
// two phones. Six places in js/sync/sync.js could make it, and each was right about its
// own half - a snapshot adopted, a batch acknowledged, a restore finished - while being
// wrong about the whole.
//
// Reproduced before this suite existed, with roster work held and one safe day patch
// going out beside it:
//
//   connecting  - 6 pending
//   synced      - 6 pending      <- the promise, with six of them still on the disk
//   connecting  - 6 pending
//
// A person watching that line has been told the opposite of the truth and then had it
// taken back. This file therefore asserts TRANSITIONS, not final states: a final-state
// check cannot see a claim that was made and withdrawn, and that claim is the defect.

import vm from 'node:vm';
import { makeDevice, makeCloud, settle, settleUntil } from './harness.mjs';
import { suite, check, given, report } from './runner.mjs';

const TICK = 6;

// Every status the app ASKED for and every status it LANDED on, in order. Wrapping
// setStatus rather than polling: a claim made and withdrawn between two polls is exactly
// the shape being measured, and polling would miss it by design.
function watchStatus(device) {
    const seen = [];
    device.ctx.__statusSeen = seen;
    vm.runInContext(`(function () {
        const original = FarkadSync.setStatus.bind(FarkadSync);
        FarkadSync.setStatus = function (status, error) {
            original(status, error);
            __statusSeen.push({
                asked: status,
                said: FarkadSync.status,
                pending: FarkadSync.pendingCount(),
                replace: Boolean(FarkadSync.pendingReplace())
            });
        };
    })();`, device.ctx, { filename: 'harness:status' });
    return seen;
}

function crew(cloud, id, options = {}) {
    const device = makeDevice(Object.assign({ deviceId: id }, options));
    device.Sync.pushDelayMs = TICK;
    device.setToday('2026-08-20');
    device.ctx.askTell = () => Promise.resolve();
    device.State.schedule.workers = [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 0 },
        { id: 'w_02', name: 'שרה', active: true, dailyRate: 350, hourlyRate: 0 }];
    device.State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
    device.State.save({ silent: true });
    if (cloud) device.Sync.connect(cloud.adapter);
    return device;
}

const record = (device, date, workerId) => device.State.commit(device.call('assignPlace',
    device.State.schedule, date, workerId, 'actual', 'p_01'));

// Every moment the app claimed to be finished while something was still owed.
const dishonest = seen => seen.filter(item =>
    item.said === 'synced' && (item.pending > 0 || item.replace));

// ============================================================ a partial send
{
    suite('one write goes out, the rest is still owed, and the line does not lie');

    // More paths than a single write may carry, so the first batch lands and leaves the
    // rest behind - which is the ordinary shape of a phone coming back after a week.
    const cloud = makeCloud();
    const device = crew(null, 'd_partial');
    const cap = device.global('MAX_PATHS_PER_WRITE');
    given('the build states a per-write path cap', Number.isInteger(cap) && cap > 0, String(cap));

    const days = [];
    for (let n = 0; n < cap + 40; n += 1) {
        const day = new Date(Date.UTC(2026, 0, 1));
        day.setUTCDate(day.getUTCDate() + n);
        days.push(day.toISOString().slice(0, 10));
    }
    days.forEach(date => record(device, date, 'w_01'));
    given('the queue is larger than one write', device.Sync.pendingCount() > cap,
        `${device.Sync.pendingCount()} pending, cap ${cap}`);

    const seen = watchStatus(device);
    // No rejection and no contrivance: a queue larger than one write goes out in several,
    // and between them work is owed. That gap is where the claim used to be made.
    device.Sync.connect(cloud.adapter);
    await settleUntil(() => device.Sync.pendingCount() === 0, 8000, 20);
    await settle(TICK * 20);

    const owed = seen.filter(item => item.asked === 'synced' && item.pending > 0);
    check('it did ask to say synced while work was still owed, more than once',
        owed.length >= 2, JSON.stringify(seen.map(i => `${i.asked}->${i.said}@${i.pending}`)));
    check('and every one of those was answered with sending, not synced',
        owed.every(item => item.said === 'sending'),
        JSON.stringify(owed.map(i => `${i.said}@${i.pending}`)));
    check('the line never once said synced while work was owed',
        dishonest(seen).length === 0,
        JSON.stringify(dishonest(seen)));
    // AND IT IS NOT A GAG. When the queue really is empty the claim is true and is made.
    check('once it has all gone, it says so',
        device.Sync.pendingCount() === 0 && device.Sync.status === 'synced',
        `${device.Sync.status}, ${device.Sync.pendingCount()} pending`);
    check('and that last claim was the only one allowed through',
        seen.filter(item => item.said === 'synced').every(item => item.pending === 0),
        JSON.stringify(seen.filter(i => i.said === 'synced').map(i => i.pending)));
}

// ============================================================ an unfinished restore
{
    suite('a restore that has not landed is not a finished device');

    const cloud = makeCloud();
    const device = crew(cloud, 'd_replace');
    await settle(TICK * 10);
    record(device, '2026-08-12', 'w_01');
    await settle(TICK * 20);
    given('it starts from a clean, finished state',
        device.Sync.status === 'synced' && device.Sync.pendingCount() === 0,
        `${device.Sync.status}, ${device.Sync.pendingCount()} pending`);

    const seen = watchStatus(device);
    // A restore is prepared and the cloud will not take it.
    cloud.reject = kind => {
        if (kind !== 'save' && kind !== 'update') return null;
        const error = new Error('client is offline');
        error.code = 'unavailable';
        return error;
    };
    const replacement = JSON.parse(JSON.stringify(device.State.schedule));
    replacement.days = {};
    device.Sync.prepareReplace(replacement, true);
    await settle(TICK * 40);

    given('the restore is outstanding', Boolean(device.Sync.pendingReplace()),
        JSON.stringify(Boolean(device.Sync.pendingReplace())));
    check('nothing claimed the device was synced while it was owed',
        dishonest(seen).length === 0,
        JSON.stringify(seen.map(i => `${i.asked}->${i.said}@${i.pending}/${i.replace}`)));
    check('and the status is not synced now either',
        device.Sync.status !== 'synced', device.Sync.status);
}

// ============================================================ a record it could not read
{
    suite('a device holding a record it cannot read is never finished');

    const cloud = makeCloud();
    const device = crew(cloud, 'd_blocked');
    await settle(TICK * 10);
    record(device, '2026-08-12', 'w_01');
    await settle(TICK * 20);
    given('it starts finished', device.Sync.status === 'synced', device.Sync.status);

    const seen = watchStatus(device);
    device.global('Recovery').damaged('scheduleData:v2:ledger', '{"advances":{"le_x":',
        'חלק מהיסטוריית המקדמות לא נקרא.');
    // Something asks the line to be redrawn, the way an adopted snapshot would.
    device.Sync.setStatus('synced');
    await settle(TICK * 10);

    check('the writes are blocked', device.call('farkadWritesBlocked') === true);
    check('and asking for synced is answered with blocked',
        device.Sync.status === 'blocked', device.Sync.status);
    check('nothing in the transitions claimed finished',
        seen.every(item => item.said !== 'synced'),
        JSON.stringify(seen.map(i => `${i.asked}->${i.said}`)));
}

// ============================================================ close and reopen
{
    suite('the honest state survives the app being closed and reopened');

    const cloud = makeCloud();
    const first = crew(null, 'd_reopen');
    for (let n = 0; n < 5; n += 1) record(first, `2026-07-0${n + 1}`, 'w_01');
    given('work is queued and nothing has gone', first.Sync.pendingCount() === 5,
        `${first.Sync.pendingCount()} pending`);
    const disk = first.dump();

    // The process dies. The queue is on the disk; nothing has been sent.
    const again = makeDevice({ deviceId: 'd_reopen', storage: disk });
    again.Sync.pushDelayMs = TICK;
    again.setToday('2026-08-20');
    again.ctx.askTell = () => Promise.resolve();
    again.State.load();
    const seen = watchStatus(again);

    cloud.reject = kind => {
        if (kind !== 'update' && kind !== 'create') return null;
        const error = new Error('client is offline');
        error.code = 'unavailable';
        return error;
    };
    again.Sync.connect(cloud.adapter);
    await settle(TICK * 40);

    check('the reopened device still owes the work', again.Sync.pendingCount() > 0,
        `${again.Sync.pendingCount()} pending`);
    check('and never said it was synced', dishonest(seen).length === 0,
        JSON.stringify(seen.map(i => `${i.asked}->${i.said}@${i.pending}`)));
    check('nor is it synced now', again.Sync.status !== 'synced', again.Sync.status);

    // AND IT STILL CAN BE. The gate is not a sticky state: the moment the queue drains,
    // the claim is true and allowed. A gate that could not be reopened would be a second
    // lie in the other direction.
    cloud.reject = null;
    again.Sync._retryAt = 0;
    await again.Sync.flush();
    await settleUntil(() => again.Sync.pendingCount() === 0, 4000, 20);
    await settle(TICK * 20);
    check('once it has all gone, the line says so',
        again.Sync.pendingCount() === 0 && again.Sync.status === 'synced',
        `${again.Sync.status}, ${again.Sync.pendingCount()} pending`);
}

report();
