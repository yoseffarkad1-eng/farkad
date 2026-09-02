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
import { readFileSync } from 'node:fs';
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

// A listener the rules can refuse. Firestore's onSnapshot delivers its error once and
// nothing further - the subscription is over - and while the rules still refuse, a new
// subscription errors the same way. `kill()` is the refusal arriving; `repair()` is the
// rules being fixed, after which only a NEW subscribe hears anything.
function fragile(cloud) {
    const wire = { broken: false, subscribes: 0, live: null, adapter: Object.assign({}, cloud.adapter) };
    const denied = () => {
        const error = new Error('Missing or insufficient permissions.');
        error.code = 'permission-denied';
        return error;
    };
    wire.adapter.subscribe = (onNext, onError) => {
        wire.subscribes += 1;
        if (wire.broken) {
            Promise.resolve().then(() => onError(denied()));
            return () => {};
        }
        const stop = cloud.adapter.subscribe(onNext, onError);
        wire.live = { stop, onError };
        return () => {
            if (wire.live && wire.live.stop === stop) wire.live = null;
            stop();
        };
    };
    wire.kill = () => {
        wire.broken = true;
        const live = wire.live;
        wire.live = null;
        if (!live) return;
        live.stop();
        live.onError(denied());
    };
    wire.repair = () => { wire.broken = false; };
    return wire;
}

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

// ============================================================ acknowledged, and then a snapshot
{
    suite('a record it could not read, acknowledged, is not an error on every snapshot');

    // The suite above is the pre-acknowledgement state: writes blocked, and 'synced'
    // answered with 'blocked'. This is the state after. The person exported the rescue
    // file and acknowledged; the entry is still held aside on the disk - by design, it
    // is carried and never folded - and writes have resumed. Then the first snapshot
    // arrives from another phone.
    //
    // Measured on this tree: the snapshot was adopted and persisted, and then the
    // post-persist check counted the entry this device was ALREADY holding, reported it
    // again (deduplicated, so nothing new was shown), called fail() and returned. Status
    // 'error', «שגיאת סנכרון - הנתונים שמורים במכשיר הזה.», on every snapshot for the
    // rest of the session - while the cloud provably had this phone's writes - and the
    // return skipped archiveDaily, so this phone never took the daily restore point,
    // and skipped the identity repairs and the post-snapshot flush with it.
    const seed = makeDevice({ deviceId: 'd_seed' });
    seed.setToday('2026-08-20');
    seed.State.schedule.workers = [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 0 }];
    seed.State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
    // An advance entry this build cannot fold: the amount is not a number.
    seed.State.schedule.ledger = { advances: {}, unreadable: { le_bad: {
        id: 'le_bad', advanceId: 'a_1', kind: 'repaid', workerId: 'w_01',
        date: '2026-08-10', amount: 'abc', note: '',
        at: '2026-08-10T09:00:00.000Z', by: 'd_x' } } };
    seed.State.schedule.updatedAt = '2026-08-19T00:00:00.000Z';
    seed.State.schedule.updatedBy = 'd_seed';
    seed.State.save({ silent: true });

    const device = makeDevice({ deviceId: 'd_acked', storage: seed.dump() });
    device.Sync.pushDelayMs = TICK;
    device.setToday('2026-08-20');
    device.ctx.askTell = () => Promise.resolve();
    device.State.load();
    const recovery = device.global('Recovery');
    given('the reopened phone is told about the entry and holds its writes',
        recovery.problems.some(problem => problem.key === 'scheduleData:v2:ledger')
        && device.call('farkadWritesBlocked') === true,
        JSON.stringify(recovery.problems.map(problem => problem.key)));
    given('acknowledging releases it', recovery.acknowledge() === true
        && device.call('farkadWritesBlocked') === false,
        String(device.call('farkadWritesBlocked')));

    // Another phone's document, clean, newer.
    const other = JSON.parse(JSON.stringify(device.State.schedule));
    other.ledger = { advances: {}, unreadable: {}, migrations: {}, unreadableMigrations: {} };
    other.updatedAt = '2026-08-20T10:00:00.000Z';
    other.updatedBy = 'd_other';
    const cloud = makeCloud({ doc: other });
    const seen = watchStatus(device);
    device.Sync.connect(cloud.adapter);
    await settleUntil(() => seen.length > 1 && device.Sync.status !== 'connecting', 5000);
    await settle(TICK * 20);

    check('the snapshot leaves the line saying synced',
        device.Sync.status === 'synced',
        `${device.Sync.status}: ${String(device.Sync.lastError
            && (device.Sync.lastError.message || device.Sync.lastError))}`);
    check('and nothing on the way said error',
        seen.every(item => item.said !== 'error'),
        JSON.stringify(seen.map(i => `${i.asked}->${i.said}`)));
    check('the daily restore point was taken',
        cloud.history.size === 1 && Boolean(device.Sync._archivedOn),
        `${cloud.history.size} archived, _archivedOn ${String(device.Sync._archivedOn)}`);
    const disk = JSON.parse(device.dump()['scheduleData:v2'] || 'null') || {};
    check('the entry is still held aside, on the screen and on the disk',
        Object.keys((device.State.schedule.ledger || {}).unreadable || {}).indexOf('le_bad') !== -1
        && Object.keys((disk.ledger || {}).unreadable || {}).indexOf('le_bad') !== -1,
        JSON.stringify([Object.keys((device.State.schedule.ledger || {}).unreadable || {}),
            Object.keys((disk.ledger || {}).unreadable || {})]));
    check('and the person was told, once',
        recovery.problems.filter(problem => problem.key === 'scheduleData:v2:ledger').length === 1
        && device.call('farkadWritesBlocked') === false,
        JSON.stringify(recovery.problems.map(problem => problem.key)));

    // The evening goes on. A day is recorded, lands, and the line still tells the truth.
    record(device, '2026-08-20', 'w_01');
    await settleUntil(() => device.Sync.pendingCount() === 0, 5000);
    await settle(TICK * 20);
    check('a later write lands and the line says so',
        Boolean(((cloud.doc || {}).days || {})['2026-08-20'])
        && device.Sync.status === 'synced' && device.Sync.pendingCount() === 0,
        `${device.Sync.status}, ${device.Sync.pendingCount()} owed, cloud has day: `
        + `${Boolean(((cloud.doc || {}).days || {})['2026-08-20'])}`);

    device.ctx.document.getElementById = id => (id === 'storageNotice'
        ? device.__notice : null);
    device.__notice = { textContent: '' };
    device.call('updateSyncNotice');
    check('in the words of a finished device, not a tunnel',
        device.__notice.textContent.indexOf('מסונכרן') !== -1
        && device.__notice.textContent.indexOf('שגיאת סנכרון') === -1,
        JSON.stringify(device.__notice.textContent));
}

// ============================================================ a listener that has died
{
    suite('a phone whose listener has died is not finished when its own write lands');

    // A Firestore listener that has delivered its error delivers nothing further; only
    // a new subscription hears again. So a phone whose listener the rules refused -
    // mis-deployed rules, an address dropped and restored - keeps recording, and each
    // of its own sends lands, while the cloud holds the other phone's corrections it
    // will never hear. 'synced' is then the opposite of the truth: the day the other
    // phone corrected is priced here at the old site with the line vouching for it.
    //
    // Measured: the listener error put the phone on 'error', its next write landed,
    // and the line read «מסונכרן» - the one sticky signal that this phone was deaf,
    // cleared by any write of its own.
    const cloud = makeCloud();
    const wire = fragile(cloud);
    const deaf = crew(null, 'd_deaf');
    deaf.Sync.connect(wire.adapter);
    const other = crew(cloud, 'd_hears');
    await settleUntil(() => deaf.Sync.status === 'synced' && other.Sync.status === 'synced', 5000);
    record(deaf, '2026-08-12', 'w_01');
    const shown = device => device.call('entriesFor', device.State.schedule, '2026-08-12', 'w_01', 'actual')
        .map(entry => entry.placeId).sort().join();
    await settleUntil(() => shown(other) === 'p_01' && deaf.Sync.status === 'synced', 5000);
    given('both phones are finished and hold the day',
        deaf.Sync.status === 'synced' && other.Sync.status === 'synced'
        && shown(deaf) === 'p_01' && shown(other) === 'p_01',
        `${deaf.Sync.status} / ${other.Sync.status}`);

    const seen = watchStatus(deaf);
    wire.kill();
    await settle(TICK * 5);
    given('the listener error reached the phone', deaf.Sync.status === 'error', deaf.Sync.status);

    // The evening goes on. A day is recorded, and the write lands.
    record(deaf, '2026-08-13', 'w_01');
    await settleUntil(() => Boolean(((cloud.doc || {}).days || {})['2026-08-13'])
        && deaf.Sync.pendingCount() === 0, 5000);
    await settle(TICK * 10);
    given('the deaf phone\'s own write landed',
        Boolean(((cloud.doc || {}).days || {})['2026-08-13']) && deaf.Sync.pendingCount() === 0,
        `${deaf.Sync.pendingCount()} owed`);
    check('and the line does not say synced over a listener that is dead',
        deaf.Sync.status !== 'synced', deaf.Sync.status);

    // The other phone corrects the first day. The deaf phone will never hear it.
    other.State.commit(other.call('assignPlace', other.State.schedule,
        '2026-08-12', 'w_01', 'actual', 'p_02'));
    const inCloud = () => {
        const day = ((cloud.doc || {}).days || {})['2026-08-12'];
        const held = day && day.actual && day.actual.w_01;
        return ((held && held.entries) || []).map(entry => entry.placeId).sort().join();
    };
    await settleUntil(() => inCloud() === 'p_01,p_02', 5000);
    await settle(TICK * 20);
    check('the correction is in the cloud and not on the deaf phone',
        inCloud() === 'p_01,p_02' && shown(deaf) === 'p_01',
        `cloud ${inCloud()}, deaf phone ${shown(deaf)}`);
    check('and the line still does not say synced',
        deaf.Sync.status !== 'synced', deaf.Sync.status);
    check('nor did it at any moment since the listener died',
        seen.every(item => item.said !== 'synced'),
        JSON.stringify(seen.map(i => `${i.asked}->${i.said}@${i.pending}`)));
    deaf.ctx.document.getElementById = id => (id === 'storageNotice' ? deaf.__notice : null);
    deaf.__notice = { textContent: '' };
    deaf.call('updateSyncNotice');
    check('and the words on the line do not promise it',
        deaf.__notice.textContent.indexOf('מסונכרן') === -1,
        JSON.stringify(deaf.__notice.textContent));

    // AND THE PANEL SAYS WHY - one write later. The listener died on permission-denied;
    // the phone's own write then landed and asked for 'synced', honestStatusFor said
    // 'error' instead, and setStatus wrote lastError = null over the refusal. The
    // status is right and the reason is gone: a person opening ⋯ now is told the sync
    // failed and nothing about the cloud refusing this phone, which is the one thing
    // they could act on. js/ui/settings.js is not in the harness's load order (it draws a
    // sheet), so it is loaded here, over a stub of the three nodes it writes.
    vm.runInContext(readFileSync(new URL('../js/ui/settings.js', import.meta.url), 'utf8'),
        deaf.ctx, { filename: 'js/ui/settings.js' });
    deaf.__mirror = { textContent: '', hidden: false };
    deaf.__reason = { textContent: '', hidden: true };
    deaf.ctx.document.getElementById = id => ({
        storageNotice: deaf.__notice,
        settingsSyncStatus: deaf.__mirror,
        settingsSyncReason: deaf.__reason
    })[id] || null;
    deaf.call('renderSettingsSyncLine');
    check('the panel mirrors the line',
        deaf.__mirror.textContent === deaf.__notice.textContent
        && deaf.__notice.textContent.indexOf('שגיאת סנכרון') === 0,
        JSON.stringify([deaf.__mirror.textContent, deaf.__notice.textContent]));
    check('and names the refusal the listener died on, after a write of its own has landed',
        deaf.__reason.hidden === false
        && deaf.__reason.textContent === 'הענן מסרב לקבל רישומים מהמכשיר הזה. '
            + 'אם האפליקציה עודכנה זה עתה, כללי הענן עדיין לא פורסמו. \u2066(permission-denied)\u2069',
        JSON.stringify({ text: deaf.__reason.textContent, hidden: deaf.__reason.hidden,
            lastError: String(deaf.Sync.lastError) }));

    // The line exists to be read aloud, so what it holds is a sentence or nothing: an
    // error with no message is not "[object Object]", and a stuck claim - already
    // explained in Hebrew by the line above it - adds nothing unless the cloud gave a code.
    check('an error with no message is an unrecorded reason, not an object',
        deaf.call('syncFailureReason', { status: 'error', lastError: {} }) === 'הסיבה לא נרשמה.',
        JSON.stringify(deaf.call('syncFailureReason', { status: 'error', lastError: {} })));
    check('a stuck claim with an internal message adds no line of its own',
        deaf.call('syncFailureReason', { status: 'claimstuck',
            lastError: new Error('the send claim is held by another window') }) === '',
        JSON.stringify(deaf.call('syncFailureReason', { status: 'claimstuck',
            lastError: new Error('the send claim is held by another window') })));

    // AND IT IS NOT A GAG. The rules are fixed; the phone subscribes again on its own,
    // hears the correction, and only then is the claim true and allowed.
    wire.repair();
    await settleUntil(() => shown(deaf) === 'p_01,p_02', 6000);
    await settle(TICK * 20);
    check('once it hears again it adopts the correction',
        shown(deaf) === 'p_01,p_02', shown(deaf));
    check('and only then says synced',
        deaf.Sync.status === 'synced' && deaf.Sync.pendingCount() === 0,
        `${deaf.Sync.status}, ${deaf.Sync.pendingCount()} owed`);
    check('through a subscription it made itself',
        wire.subscribes >= 2, `${wire.subscribes} subscribe(s)`);
}

report();
