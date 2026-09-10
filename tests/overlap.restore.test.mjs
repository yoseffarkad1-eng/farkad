// A restore and an ordinary edit, and a restore and somebody's money, IN FLIGHT AT ONCE.
//
//   node tests/overlap.restore.test.mjs
//
// The restore transaction already has suites. tests/restore.test.mjs asks whether a device
// holds what it says it holds; the G13/G15 blocks in tests/data.test.mjs walk a crash
// between any two of its steps; tests/cas.test.mjs proves the whole-document write takes
// the same ordering fence as every other write. Every one of them is a SEQUENCE: one
// operation finishes, and then the next one starts.
//
// That is not what a building site does. Three phones, and the restore's request is open
// for as long as the signal takes - seconds, on a good day - and during those seconds
// somebody records a day and somebody else hands a man back 500 shekels. A test where A
// resolves before B begins says nothing about that window, so every case here holds one
// write open with deferred() while the other one begins, and asks its questions TWICE:
// once while both are in flight, and once after they have both finished.
//
// Eleven cases: the ten of the matrix, plus O8b, which asks the money question of the
// build a person actually has - both gates shut - rather than of the one the gates open.
//
// What is asked of every one of them, because it is what the record needs:
//
//   nothing a person recorded is swallowed by the replacement;
//   NO FINANCIAL EVENT IS ERASED, ANYWHERE - not on a phone, and not in the cloud, at any
//     instant, which is why the cloud is watched by a subscriber rather than read at the
//     end (a value that is deleted and put back has still been deleted);
//   every device that says `synced` agrees with every other device that says `synced`, on
//     the facts AND on the balances;
//   a stamped day is never repriced - the backup carries a different roster rate on
//     purpose, so a day that lost its stamp would report a different number (law 2);
//   the transaction keeps its identity: one transaction id, one operation id, one frozen
//     boundary, however many times it is retried;
//   and a conflict survives a close and reopen.
//
// The money gates are opened through the harness `flags` seam and nowhere else, so the
// shipped defaults stay shut - tests/data.test.mjs and tests/smoke.mjs pin that - while
// the machinery behind them is measured here. O1 to O5 and O8b run with the gates as a
// person actually installs them, because a day recorded on a building site is not behind
// a flag, and neither is an advance handed over on the build that is served today.
//
// O8b IS RED, and it is meant to be read rather than fixed by weakening it. It is the
// same window as O8 asked of the shipped build, where an advance handed over writes the
// legacy `advances` map and nothing else - and that map is part of the work record a
// restore replaces, so the 800 shekels somebody was handed while the restore was in
// flight are gone from all three phones with every one of them saying «מסונכרן». What a
// restore does to `advances` is not a bug with an obvious fix: it is the one thing
// features/restore-ledger/contract.md does not decide, and deciding it silently here is
// exactly what docs/data-safety-audit.md's O1 refused to do. The reproduction stays.
//
// features/restore-ledger/contract.md is the spec for the second half: "an ordinary
// restore never erases a financial event, on any device", and "after the restore settles,
// the restoring device, every other device and the cloud agree on the same set of
// financial facts".

import { makeDevice, makeCloud, settle, settleUntil, deferred } from './harness.mjs';
import { suite, check, given, report } from './runner.mjs';

const TICK = 6;
const GATES = { carryAdvances: true, ledgerWrites: true };
const ADVANCE = 'a_01';
const STAMPED = '2026-08-12';
// The rate the stamped day was WORKED at. The backup below says the man is on 900 now,
// which is what makes law 2 measurable here rather than merely asserted.
const WORKED_AT = 400;
// What the record looks like after the backup is restored: the stamped day is in the
// file too, so law 2 is measured against a roster the same file raises to 900.
const RESTORED_DAYS = '2026-07-01,2026-08-12';

// ---------------------------------------------------------------- the record everybody starts from

function seedRecord() {
    return {
        schemaVersion: 2,
        workers: [
            { id: 'w_01', name: 'דוד', idNumber: '', phone: '', dailyRate: 400, hourlyRate: 50, active: true },
            { id: 'w_02', name: 'שרה', idNumber: '', phone: '', dailyRate: 350, hourlyRate: 0, active: true }
        ],
        places: [
            { id: 'p_01', name: 'הרצליה', active: true },
            { id: 'p_02', name: 'תל אביב', active: true }
        ],
        days: {
            // Stamped, as the app stamps a day at first write: this one was worked at 400.
            [STAMPED]: {
                plan: {},
                actual: { w_01: { entries: [{ placeId: 'p_01' }], rates: { daily: 400, hourly: 50 } } }
            }
        },
        advances: {
            a_01: {
                id: 'a_01', workerId: 'w_01', date: '2026-08-01',
                amount: 5000, note: 'מקדמה', method: 'cash'
            }
        },
        // The origin entry the mirror would otherwise write, so the boot mirror has
        // nothing to add and every entry that appears later got there by somebody
        // recording something.
        ledger: {
            advances: {
                le_mig_a_01: {
                    id: 'le_mig_a_01', advanceId: 'a_01', kind: 'given',
                    workerId: 'w_01', date: '2026-08-01', amount: 5000,
                    note: 'מקדמה', method: 'cash', at: '', by: 'd_seed', origin: 'migration'
                }
            }
        },
        updatedAt: '2026-08-11T06:00:00.000Z', updatedBy: 'd_seed'
    };
}

// The file somebody restores: the same record, one day OLDER, and with the man's roster
// rate raised to 900 since. A restore replaces the roster - so if the stamped day lost its
// stamp on the way through, the sheet would price it at 900 and say so.
function backupFile() {
    const backup = seedRecord();
    backup.workers[0].dailyRate = 900;
    backup.days['2026-07-01'] = {
        plan: {}, actual: { w_02: { entries: [{ placeId: 'p_02' }], rates: { daily: 350, hourly: 0 } } }
    };
    backup.updatedAt = '2026-07-02T06:00:00.000Z';
    backup.updatedBy = 'd_backup';
    return backup;
}

// ---------------------------------------------------------------- devices

// `flags: null` is a phone as a person installs it, gates shut. The money cases pass
// GATES, which is the test seam and the only door either gate is opened by.
function phone(id, cloud, options = {}) {
    const device = makeDevice({
        deviceId: id,
        flags: options.gates === false ? null : GATES,
        storage: options.storage
    });
    device.Sync.pushDelayMs = TICK;
    device.setToday('2026-08-26');
    device.ctx.askTell = () => Promise.resolve();
    device.ctx.askConfirm = () => Promise.resolve(false);

    if (options.storage) {
        device.State.load();
    } else {
        device.State.schedule = device.call('normaliseSchedule', seedRecord());
        device.State.save({ silent: true });
    }
    if (cloud) device.Sync.connect(cloud.adapter);
    return device;
}

const record = (device, date, workerId, placeId) => device.State.commit(device.call(
    'assignPlace', device.State.schedule, date, workerId, 'actual', placeId || 'p_01'));

const repay = (device, amount, at) => device.State.commit(device.call('recordAdvanceRepaid',
    device.State.schedule, ADVANCE, amount, '2026-08-24', 'מזומן', at, device.id, 'cash'));

// ---------------------------------------------------------------- what a device holds

const ledgerIdsOf = record => Object.keys(
    (((record || {}).ledger || {}).advances) || {}).sort();

const dayKeysOf = schedule => Object.keys((schedule || {}).days || {}).sort().join();

const diskOf = device => {
    const raw = device.raw('scheduleData:v2');
    return raw ? JSON.parse(raw) : null;
};

const leftOn = device => {
    const owed = device.call('advanceOutstanding', device.State.schedule, ADVANCE);
    return owed ? owed.left : null;
};

// What the sheet says the stamped day is worth on this device. Read through the production
// report, not off the record, because law 2 is a statement about what somebody is paid.
function pricedAt(device) {
    const rows = device.call('payrollReport', device.State.schedule, STAMPED, STAMPED);
    const row = (rows || []).find(item => item.workerId === 'w_01');
    return row ? row.amount : null;
}

// One device's whole answer, for the agreement rule. Facts AND balances, because two
// phones can hold the same days and disagree about what a man is owed.
const answerOf = device => JSON.stringify({
    days: Object.keys(device.State.schedule.days || {}).sort(),
    workers: (device.State.schedule.workers || []).map(w => w.id).sort(),
    ledger: ledgerIdsOf(device.State.schedule),
    left: leftOn(device)
});

// Every device claiming to be finished must describe the same record. Returns the pair
// that does not, or null.
function disagreementAmongSynced(devices) {
    const claiming = devices.filter(device => device.Sync.status === 'synced');
    for (let i = 1; i < claiming.length; i += 1) {
        if (answerOf(claiming[i]) !== answerOf(claiming[0])) {
            return `${claiming[0].id}: ${answerOf(claiming[0])}  ||  `
                + `${claiming[i].id}: ${answerOf(claiming[i])}`;
        }
    }
    return null;
}

// ---------------------------------------------------------------- the instruments
//
// Two things have to be watched rather than read at the end.
//
// A ledger entry that is deleted from the cloud and put back by the next write is an entry
// that was gone, and a phone that adopted the document in between has lost it for good -
// so the cloud is watched by a subscriber and every id it has ever published is remembered.
//
// And a whole-document save that lands is measured against what the document held at the
// moment the call was made: the hold hook runs after the attempt is counted and before it
// is applied, which is exactly that moment.
function instrument(cloud) {
    const seen = [];
    const lost = [];
    const saves = [];
    let gate = null;

    cloud.hold = (kind, payload) => {
        if (kind === 'save' || kind === 'create') {
            saves.push({
                kind,
                opId: payload && payload.lastOpId,
                revision: payload && payload.revision,
                carried: ledgerIdsOf(payload),
                heldThen: ledgerIdsOf(cloud.doc)
            });
        }
        return gate ? gate(kind, payload) : null;
    };

    cloud.adapter.subscribe(snapshot => {
        const ids = ledgerIdsOf(snapshot);
        seen.forEach(id => {
            if (ids.indexOf(id) === -1 && lost.indexOf(id) === -1) lost.push(id);
        });
        ids.forEach(id => { if (seen.indexOf(id) === -1) seen.push(id); });
    }, () => {});

    return {
        seen, lost, saves,
        hold(fn) { gate = fn; },
        open() { gate = null; },
        // Every save that dropped a ledger entry the document held when the call was made.
        droppers() {
            return saves.filter(save =>
                save.heldThen.some(id => save.carried.indexOf(id) === -1));
        }
    };
}

const landedSaves = cloud => cloud.writes.filter(write => write.kind === 'save').length;
const attemptedSaves = cloud => cloud.attempts.filter(a => a.kind === 'save').length;

// The envelope's identity, which a retry may not change. NOT the whole document: the
// ledger union is allowed to grow (that is the contract), and the boundary, the
// transaction and the work record are not.
const identityOf = envelope => (envelope ? JSON.stringify({
    transactionId: envelope.transactionId,
    supersedesSeq: envelope.supersedesSeq,
    supersedes: envelope.supersedes,
    cloud: envelope.cloud,
    days: Object.keys((envelope.document || {}).days || {}).sort(),
    workers: ((envelope.document || {}).workers || []).map(w => `${w.id}:${w.dailyRate}`),
    stamp: JSON.stringify((((envelope.document || {}).days || {})[STAMPED] || {}).actual || {})
}) : null);

// A barrier on the condition, not on the clock: the retry ladder's first step is two
// seconds, so anything that has to survive one needs a budget well past it.
async function settled(devices, limitMs = 20000) {
    await settleUntil(() => devices.every(device =>
        device.Sync.pendingCount() === 0
        && device.Sync.pendingReplace() === null
        && device.Sync.status !== 'connecting'), limitMs, 20);
    await settle(TICK * 30);
}

// ================================================================ O1
{
    suite('O1: a day recorded while the restore\'s cloud write is open is not swallowed');

    const cloud = makeCloud();
    const spy = instrument(cloud);
    const a = phone('d_a', cloud, { gates: false });
    await settle(TICK * 20);
    given('the cloud holds the record', ledgerIdsOf(cloud.doc).join() === 'le_mig_a_01',
        JSON.stringify(ledgerIdsOf(cloud.doc)));

    const open = deferred();
    spy.hold(kind => (kind === 'save' ? open.promise : null));

    const restoring = a.Sync.replaceEverything(a.call('normaliseSchedule', backupFile()));
    await settle(TICK * 15);
    given('the restore\'s save is in flight', attemptedSaves(cloud) === 1,
        String(attemptedSaves(cloud)));
    given('and it has not landed', landedSaves(cloud) === 0, String(landedSaves(cloud)));

    // ---- while BOTH are in flight
    const wrote = record(a, '2026-08-25', 'w_01');
    check('the day is accepted while the replacement is still open', wrote === true);
    check('and it is on the DISK, not only on the screen',
        dayKeysOf(diskOf(a)).indexOf('2026-08-25') !== -1, dayKeysOf(diskOf(a)));
    check('the replacement is not reported done while its write is open',
        a.Sync.pendingReplace() !== null);
    check('and the line does not say synced', a.Sync.status !== 'synced', a.Sync.status);
    await settle(TICK * 15);
    check('the day is not sent out from under the open replacement',
        cloud.writes.filter(w => w.kind === 'update').length === 0,
        JSON.stringify(cloud.writes.map(w => w.kind)));

    // ---- and after
    open.release();
    spy.open();
    const result = await restoring;
    await settled([a]);

    check('the restore finishes', result.ok === true, JSON.stringify(result));
    check('the day the person recorded mid-restore is still on this phone',
        dayKeysOf(a.State.schedule).indexOf('2026-08-25') !== -1,
        dayKeysOf(a.State.schedule));
    check('and on the disk the next session will open',
        dayKeysOf(diskOf(a)).indexOf('2026-08-25') !== -1, dayKeysOf(diskOf(a)));
    check('and it reached the cloud',
        Boolean((cloud.doc.days || {})['2026-08-25']),
        JSON.stringify(Object.keys(cloud.doc.days || {})));
    check('the restored day is there too',
        Boolean((cloud.doc.days || {})['2026-07-01']),
        JSON.stringify(Object.keys(cloud.doc.days || {})));
    check('and the cloud holds the restore plus that day, and nothing else',
        Object.keys(cloud.doc.days || {}).sort().join() === RESTORED_DAYS + ',2026-08-25',
        JSON.stringify(Object.keys(cloud.doc.days || {}).sort()));
    check('no ledger entry left the cloud at any instant', spy.lost.length === 0,
        JSON.stringify(spy.lost));
    check('the stamped day is still priced at what it was worked at',
        pricedAt(a) === WORKED_AT, String(pricedAt(a)));
    check('and the device says synced with nothing owed',
        a.Sync.status === 'synced' && a.Sync.pendingCount() === 0,
        `${a.Sync.status} / ${a.Sync.pendingCount()}`);
}

// ================================================================ O2
{
    suite('O2: the reverse order - a day\'s write is open, and a restore is asked for');

    const cloud = makeCloud();
    const spy = instrument(cloud);
    const a = phone('d_a2', cloud, { gates: false });
    const b = phone('d_b2', cloud, { gates: false });
    await settle(TICK * 25);

    const open = deferred();
    spy.hold(kind => (kind === 'update' ? open.promise : null));
    given('the day is recorded', record(a, '2026-08-25', 'w_01') === true);
    await settle(TICK * 15);
    given('its write is in flight',
        cloud.attempts.filter(x => x.kind === 'update').length > 0,
        String(cloud.attempts.filter(x => x.kind === 'update').length));
    given('and it has not landed', !(cloud.doc.days || {})['2026-08-25']);

    // ---- while BOTH are in flight
    const restoring = a.Sync.replaceEverything(a.call('normaliseSchedule', backupFile()));
    await settle(TICK * 15);
    check('the replacement does not overtake the write that was already open',
        attemptedSaves(cloud) === 0, String(attemptedSaves(cloud)));
    check('and nothing has reported the restore done',
        a.Sync.pendingReplace() !== null);
    check('the line does not say synced on either phone',
        a.Sync.status !== 'synced', a.Sync.status);

    // ---- and after
    open.release();
    spy.open();
    const result = await restoring;
    await settled([a, b]);

    check('the restore goes through once the older write has finished',
        result.ok === true, JSON.stringify(result));
    const order = cloud.writes.map(w => w.kind).join();
    check('and the two landed in the order they were started',
        order.indexOf('update,save') !== -1, order);
    check('the day that was in flight is inside the boundary and does not come back',
        !(cloud.doc.days || {})['2026-08-25'],
        JSON.stringify(Object.keys(cloud.doc.days || {})));
    check('the other phone agrees, rather than putting it back',
        !(b.State.schedule.days || {})['2026-08-25'],
        dayKeysOf(b.State.schedule));
    check('the restored record is what both phones hold',
        dayKeysOf(a.State.schedule) === dayKeysOf(b.State.schedule),
        `${dayKeysOf(a.State.schedule)} || ${dayKeysOf(b.State.schedule)}`);
    check('no ledger entry left the cloud at any instant', spy.lost.length === 0,
        JSON.stringify(spy.lost));
    check('the stamped day is priced at what it was worked at, not at the backup\'s rate',
        pricedAt(a) === WORKED_AT && pricedAt(b) === WORKED_AT,
        `${pricedAt(a)} / ${pricedAt(b)}`);
    check('and no device claiming synced disagrees with another',
        disagreementAmongSynced([a, b]) === null, String(disagreementAmongSynced([a, b])));
}

// ================================================================ O3
{
    suite('O3: a snapshot arrives from another phone while the restore is in flight');

    const cloud = makeCloud();
    const spy = instrument(cloud);
    const a = phone('d_a3', cloud, { gates: false });
    const b = phone('d_b3', cloud, { gates: false });
    await settle(TICK * 25);

    const open = deferred();
    spy.hold(kind => (kind === 'save' ? open.promise : null));
    const restoring = a.Sync.replaceEverything(a.call('normaliseSchedule', backupFile()));
    await settle(TICK * 15);
    given('the restore\'s save is in flight', attemptedSaves(cloud) === 1,
        String(attemptedSaves(cloud)));

    // ---- while BOTH are in flight: B records a day and it LANDS, so a snapshot reaches
    //      the phone whose restore is still open.
    given('the other phone records a day', record(b, '2026-08-24', 'w_02', 'p_02') === true);
    await settleUntil(() => Boolean((cloud.doc.days || {})['2026-08-24']), 5000, 10);
    given('and it reached the cloud', Boolean((cloud.doc.days || {})['2026-08-24']));

    check('the restoring phone does not adopt the state it is replacing',
        !(a.State.schedule.days || {})['2026-08-24'], dayKeysOf(a.State.schedule));
    check('and it does not say synced over an unfinished replacement',
        a.Sync.status !== 'synced', a.Sync.status);
    check('the replacement is still pending', a.Sync.pendingReplace() !== null);

    // ---- and after
    open.release();
    spy.open();
    await restoring.catch(() => {});
    await settled([a, b], 25000);

    check('the transaction finishes rather than wedging',
        a.Sync.pendingReplace() === null, JSON.stringify(a.Sync.pendingReplace()));
    check('both phones end up holding the same record',
        answerOf(a) === answerOf(b), `${answerOf(a)} || ${answerOf(b)}`);
    check('and the cloud holds it too',
        Object.keys(cloud.doc.days || {}).sort().join()
            === Object.keys(a.State.schedule.days || {}).sort().join(),
        `${Object.keys(cloud.doc.days || {}).sort().join()} || ${dayKeysOf(a.State.schedule)}`);
    check('no ledger entry left the cloud at any instant', spy.lost.length === 0,
        JSON.stringify(spy.lost));
    check('and no device claiming synced disagrees with another',
        disagreementAmongSynced([a, b]) === null, String(disagreementAmongSynced([a, b])));
}

// ================================================================ O4
{
    suite('O4: the restore\'s answer is lost, the app is reopened, and it resumes ONCE');

    const cloud = makeCloud();
    const spy = instrument(cloud);
    const a = phone('d_a4', cloud, { gates: false });
    await settle(TICK * 20);

    // Never released while this session is alive: a socket that neither answers nor
    // closes, which is the shape of a request whose answer is lost.
    const hung = deferred();
    spy.hold(kind => (kind === 'save' ? hung.promise : null));

    const restoring = a.Sync.replaceEverything(a.call('normaliseSchedule', backupFile()));
    await settle(TICK * 20);
    given('the save was made', attemptedSaves(cloud) === 1, String(attemptedSaves(cloud)));
    given('and it has not answered', landedSaves(cloud) === 0, String(landedSaves(cloud)));

    // ---- while it is still in flight, the app dies. This is the disk it leaves.
    //
    // Including the send claim the dying session was holding. It stopped beating when the
    // app went, so the claim goes stale exactly as it does in the field - twenty seconds,
    // see SEND_CLAIM_STALE_MS - and a session that reopens after that may take it. The
    // reopen here is a minute later, said in the record rather than waited out, because
    // how long somebody leaves their phone in a pocket is not a fact about this app.
    const disk = a.dump();
    if (typeof disk['farkad:sendClaim'] === 'string') {
        const claim = JSON.parse(disk['farkad:sendClaim']);
        claim.at -= 60000;
        claim.beat -= 60000;
        disk['farkad:sendClaim'] = JSON.stringify(claim);
    }
    const envelopeBefore = identityOf(a.Sync.pendingReplace());
    check('the transaction is on the disk the next session will open',
        typeof disk['farkad:pendingReplace'] === 'string');
    check('and this session has not claimed it is finished',
        a.Sync.status !== 'synced', a.Sync.status);

    // The request the dead session made now lands: the answer was lost, not the write.
    hung.release();
    spy.open();
    await restoring.catch(() => {});
    await settleUntil(() => landedSaves(cloud) === 1, 5000, 10);
    given('the lost request had in fact landed', landedSaves(cloud) === 1,
        String(landedSaves(cloud)));
    const revisionAfterFirst = cloud.doc.revision;

    // ---- the reopen, from the disk taken BEFORE the answer arrived. Built first and
    //      connected second, so the envelope can be read while it is still outstanding:
    //      connect() resumes it, and asking afterwards asks a finished transaction.
    const again = phone('d_a4', null, { gates: false, storage: disk });
    const envelopeOnReopen = identityOf(again.Sync.pendingReplace());
    check('the reopened app finds the same transaction, not a new one',
        envelopeOnReopen !== null && envelopeOnReopen === envelopeBefore,
        `${envelopeOnReopen} vs ${envelopeBefore}`);
    again.Sync.connect(cloud.adapter);
    await settled([again]);
    const replacements = spy.saves.filter(save => save.kind === 'save');
    check('every whole-document write carried the same operation id',
        replacements.length > 0
        && replacements.every(save => save.opId === replacements[0].opId),
        JSON.stringify(replacements.map(save => save.opId)));
    check('the replacement was not applied a second time',
        cloud.doc.revision === revisionAfterFirst,
        `${cloud.doc.revision} vs ${revisionAfterFirst}`);
    check('the transaction is over', again.Sync.pendingReplace() === null,
        JSON.stringify(again.Sync.pendingReplace()));
    check('the reopened device holds the restore',
        dayKeysOf(again.State.schedule) === RESTORED_DAYS, dayKeysOf(again.State.schedule));
    check('and so does the cloud',
        Object.keys(cloud.doc.days || {}).sort().join() === RESTORED_DAYS,
        JSON.stringify(Object.keys(cloud.doc.days || {}).sort()));
    check('no ledger entry left the cloud at any instant', spy.lost.length === 0,
        JSON.stringify(spy.lost));
    check('and it says synced only now that all three agree',
        again.Sync.status === 'synced', again.Sync.status);
}

// ================================================================ O5
{
    suite('O5: the local half lands, the cloud half fails, and the reopen does not lie');

    const cloud = makeCloud();
    const spy = instrument(cloud);
    const a = phone('d_a5', cloud, { gates: false });
    await settle(TICK * 20);

    const open = deferred();
    spy.hold(kind => (kind === 'save' ? open.promise : null));
    const restoring = a.Sync.replaceEverything(a.call('normaliseSchedule', backupFile()));
    await settle(TICK * 15);
    given('the save is in flight', attemptedSaves(cloud) === 1, String(attemptedSaves(cloud)));

    // ---- while it is in flight, the local half is already true. That is the invariant
    //      the whole transaction is built on, and it is measurable right here.
    check('the device already holds the replacement, before the cloud does',
        dayKeysOf(diskOf(a)) === RESTORED_DAYS, dayKeysOf(diskOf(a)));
    check('and the cloud does not', !(cloud.doc.days || {})['2026-07-01'],
        JSON.stringify(Object.keys(cloud.doc.days || {})));
    check('and nothing says synced in that window',
        a.Sync.status !== 'synced', a.Sync.status);

    // ---- the cloud half fails
    open.refuse(new Error('the request died'));
    spy.open();
    const result = await restoring;
    check('the restore is reported as unfinished, naming the stage',
        result.ok === false && result.stage === 'cloud', JSON.stringify(result));
    check('the transaction stays on the disk so it can still run',
        a.Sync.pendingReplace() !== null);
    check('and the device does not claim to be synced',
        a.Sync.status !== 'synced', a.Sync.status);

    // ---- reopened against a cloud that never got it
    cloud.reject = () => new Error('still no reach');
    const carried = a.dump();
    if (typeof carried['farkad:sendClaim'] === 'string') {
        const claim = JSON.parse(carried['farkad:sendClaim']);
        claim.at -= 60000;
        claim.beat -= 60000;
        carried['farkad:sendClaim'] = JSON.stringify(claim);
    }
    const again = phone('d_a5', cloud, { gates: false, storage: carried });
    await settle(TICK * 40);
    check('the reopened device still holds the restore locally',
        dayKeysOf(diskOf(again)) === RESTORED_DAYS, dayKeysOf(diskOf(again)));
    check('and still does not say synced with the cloud half owed',
        again.Sync.status !== 'synced', again.Sync.status);
    check('the transaction is still there to be finished',
        again.Sync.pendingReplace() !== null);

    // ---- and it finishes when the cloud comes back
    cloud.reject = null;
    await again.Sync.resumeReplace();
    await settled([again]);
    check('the restore lands once there is somewhere to send it',
        Object.keys(cloud.doc.days || {}).sort().join() === RESTORED_DAYS,
        JSON.stringify(Object.keys(cloud.doc.days || {}).sort()));
    check('the transaction is over', again.Sync.pendingReplace() === null);
    // NOT 'synced'. The line is 'sending' here, with nothing owed and nothing scheduled,
    // and it stays that way: honestStatusFor demotes a claimed 'synced' while the retry
    // ladder's timer is armed, the timer was armed by this transaction's own earlier
    // failure and is still armed at the moment the success sets the status, and flush()
    // clears it a moment later without ever correcting the sentence. It is a demotion, so
    // nothing is claimed that is not true - which is why this asks what it asks. The
    // sentence not returning is reported as a finding against the ladder, in js/sync/send.js.
    check('the failure is over: nothing owed, nothing pending, and no error',
        again.Sync.status !== 'error' && again.Sync.pendingCount() === 0
        && again.Sync.pendingReplace() === null,
        `${again.Sync.status} / ${again.Sync.pendingCount()}`);
    check('no ledger entry left the cloud at any instant', spy.lost.length === 0,
        JSON.stringify(spy.lost));
}

// ================================================================ O6
//
// features/restore-ledger/contract.md, the failure at the top of it, with the one change
// that makes it a concurrency question: the repayment is recorded while the restore's
// write is ALREADY OPEN, so it is not a fact the restoring phone had a chance to absorb.
{
    suite('O6: a repayment recorded on B while A\'s restore is in flight');

    const cloud = makeCloud();
    const spy = instrument(cloud);
    const a = phone('d_a6', cloud);
    const b = phone('d_b6', cloud);
    await settle(TICK * 25);
    given('both phones hold the advance', leftOn(a) === 5000 && leftOn(b) === 5000,
        `${leftOn(a)} / ${leftOn(b)}`);

    const open = deferred();
    spy.hold(kind => (kind === 'save' ? open.promise : null));
    const restoring = a.Sync.replaceEverything(a.call('normaliseSchedule', backupFile()));
    await settle(TICK * 15);
    given('A\'s restore is in flight', attemptedSaves(cloud) === 1, String(attemptedSaves(cloud)));
    given('and it has not landed', landedSaves(cloud) === 0, String(landedSaves(cloud)));

    // ---- while BOTH are in flight
    given('B records the repayment', repay(b, 500, '2026-08-24T09:00:00.000Z') === true);
    await settleUntil(() => ledgerIdsOf(cloud.doc).length === 2, 5000, 10);
    check('the repayment is in the cloud while the restore is still open',
        ledgerIdsOf(cloud.doc).length === 2, JSON.stringify(ledgerIdsOf(cloud.doc)));
    check('B holds it', leftOn(b) === 4500, String(leftOn(b)));
    check('A has not adopted it, because A is replacing that document',
        leftOn(a) === 5000, String(leftOn(a)));
    check('and A does not say synced with a replacement outstanding',
        a.Sync.status !== 'synced', a.Sync.status);

    // ---- and after
    open.release();
    spy.open();
    await restoring.catch(() => {});
    await settled([a, b], 25000);

    check('NO FINANCIAL EVENT LEFT THE CLOUD, at any instant', spy.lost.length === 0,
        JSON.stringify(spy.lost));
    check('the cloud still holds both entries',
        ledgerIdsOf(cloud.doc).length === 2, JSON.stringify(ledgerIdsOf(cloud.doc)));
    check('no whole-document save dropped an entry the document held when it was made',
        spy.droppers().length === 0, JSON.stringify(spy.droppers()));
    check('B still holds the repayment', leftOn(b) === 4500, String(leftOn(b)));
    check('and so does the phone that restored', leftOn(a) === 4500, String(leftOn(a)));
    check('the two phones hold the same record', answerOf(a) === answerOf(b),
        `${answerOf(a)} || ${answerOf(b)}`);
    check('no device claiming synced disagrees with another',
        disagreementAmongSynced([a, b]) === null, String(disagreementAmongSynced([a, b])));
    check('the work record IS replaced - that half of a restore still happens',
        dayKeysOf(a.State.schedule) === RESTORED_DAYS, dayKeysOf(a.State.schedule));
    check('and the stamped day is priced at what it was worked at, on both phones',
        pricedAt(a) === WORKED_AT && pricedAt(b) === WORKED_AT,
        `${pricedAt(a)} / ${pricedAt(b)}`);

    // A device that was never in the room reads the same account.
    const c = phone('d_c6', cloud);
    await settled([c]);
    check('a phone joining afterwards is told about the repayment',
        leftOn(c) === 4500, String(leftOn(c)));
}

// ================================================================ O7
{
    suite('O7: two financial writes race one restore');

    const cloud = makeCloud();
    const spy = instrument(cloud);
    const a = phone('d_a7', cloud);
    const b = phone('d_b7', cloud);
    const c = phone('d_c7', cloud);
    await settle(TICK * 30);
    given('all three hold the advance',
        leftOn(a) === 5000 && leftOn(b) === 5000 && leftOn(c) === 5000,
        `${leftOn(a)} / ${leftOn(b)} / ${leftOn(c)}`);

    const open = deferred();
    spy.hold(kind => (kind === 'save' ? open.promise : null));
    const restoring = a.Sync.replaceEverything(a.call('normaliseSchedule', backupFile()));
    await settle(TICK * 15);
    given('A\'s restore is in flight', attemptedSaves(cloud) === 1, String(attemptedSaves(cloud)));

    // ---- while all three are in flight
    given('B records 500 back', repay(b, 500, '2026-08-24T09:00:00.000Z') === true);
    given('C records 300 back', repay(c, 300, '2026-08-24T09:00:01.000Z') === true);
    await settleUntil(() => ledgerIdsOf(cloud.doc).length === 3, 8000, 10);
    check('both repayments are in the cloud while the restore is still open',
        ledgerIdsOf(cloud.doc).length === 3, JSON.stringify(ledgerIdsOf(cloud.doc)));
    check('and the restore has claimed nothing',
        a.Sync.pendingReplace() !== null && a.Sync.status !== 'synced', a.Sync.status);

    // ---- and after
    open.release();
    spy.open();
    await restoring.catch(() => {});
    await settled([a, b, c], 30000);

    check('NO FINANCIAL EVENT LEFT THE CLOUD, at any instant', spy.lost.length === 0,
        JSON.stringify(spy.lost));
    check('all three events are in the cloud',
        ledgerIdsOf(cloud.doc).length === 3, JSON.stringify(ledgerIdsOf(cloud.doc)));
    check('the balance is what the record says, on the phone that restored',
        leftOn(a) === 4200, String(leftOn(a)));
    check('and on both phones that recorded',
        leftOn(b) === 4200 && leftOn(c) === 4200, `${leftOn(b)} / ${leftOn(c)}`);
    check('no device claiming synced disagrees with another',
        disagreementAmongSynced([a, b, c]) === null,
        String(disagreementAmongSynced([a, b, c])));
    check('and the three hold one record',
        answerOf(a) === answerOf(b) && answerOf(b) === answerOf(c),
        `${answerOf(a)} || ${answerOf(b)} || ${answerOf(c)}`);
}

// ================================================================ O8
{
    suite('O8: a third phone adopts the restore, having recorded its own advance in the window');

    const cloud = makeCloud();
    const spy = instrument(cloud);
    const a = phone('d_a8', cloud);
    const c = phone('d_c8', cloud);
    await settle(TICK * 25);

    const open = deferred();
    spy.hold(kind => (kind === 'save' ? open.promise : null));
    const restoring = a.Sync.replaceEverything(a.call('normaliseSchedule', backupFile()));
    await settle(TICK * 15);
    given('A\'s restore is in flight', attemptedSaves(cloud) === 1, String(attemptedSaves(cloud)));

    // ---- while it is open, C hands somebody a NEW advance: a new legacy record and a
    //      new origin entry, which is two field paths and one event.
    const made = c.State.commitMany(c.call('recordNewAdvance', c.State.schedule,
        'w_02', '2026-08-25', 800, 'מקדמה שנייה', '2026-08-25T07:00:00.000Z', 'd_c8', 'cash'));
    given('C records a new advance', made === true, String(made));
    const secondId = Object.keys(c.State.schedule.advances || {})
        .filter(id => id !== ADVANCE)[0];
    given('and it has an id', typeof secondId === 'string' && secondId.length > 0,
        String(secondId));
    await settleUntil(() => ledgerIdsOf(cloud.doc).length === 2, 8000, 10);
    check('C\'s advance is in the cloud while the restore is still open',
        ledgerIdsOf(cloud.doc).length === 2, JSON.stringify(ledgerIdsOf(cloud.doc)));

    // ---- and after
    open.release();
    spy.open();
    await restoring.catch(() => {});
    await settled([a, c], 30000);

    check('NO FINANCIAL EVENT LEFT THE CLOUD, at any instant', spy.lost.length === 0,
        JSON.stringify(spy.lost));
    check('the advance C handed over is still in the cloud\'s ledger',
        ledgerIdsOf(cloud.doc).indexOf(`le_mig_${secondId}`) !== -1,
        JSON.stringify(ledgerIdsOf(cloud.doc)));
    check('the restoring phone is told about it too',
        ledgerIdsOf(a.State.schedule).indexOf(`le_mig_${secondId}`) !== -1,
        JSON.stringify(ledgerIdsOf(a.State.schedule)));
    check('and so is the phone that recorded it, after adopting the restore',
        ledgerIdsOf(c.State.schedule).indexOf(`le_mig_${secondId}`) !== -1,
        JSON.stringify(ledgerIdsOf(c.State.schedule)));
    // THE LEGACY FIELD, WHICH USED TO BE A DIFFERENT QUESTION.
    //
    // This check pinned the opposite: that `ledgerParity()` REPORTED an orphan. That was
    // the honest thing to assert while the defect stood - `advances` was part of the work
    // record the restore replaced, so the ledger entry survived and the map every build
    // actually reads did not, and the one thing that must never happen is for that to pass
    // unremarked.
    //
    // The defect is fixed rather than reported now. absorbCloudLedger absorbs an advance
    // that this device had never heard of when the restore was asked for (knownAdvances,
    // frozen at prepare), so both halves of the event survive and there is no longer a
    // disagreement to announce. Reporting one would now be the false statement.
    //
    // The pinned expectation therefore moves, deliberately, in the commit that made it
    // untrue - and it moves to the STRONGER claim, not a looser one: agreement, with the
    // legacy record actually present, rather than "some parity answer".
    const parity = a.State.ledgerParity();
    check('the ledger and the legacy field agree about it, on the restoring phone',
        parity.agrees === true && parity.orphaned.length === 0, JSON.stringify(parity));
    check('and the legacy record every shipped build reads is the one that survived',
        Boolean((a.State.schedule.advances || {})[secondId]),
        JSON.stringify(Object.keys(a.State.schedule.advances || {})));
    check('on the phone that recorded it as well',
        Boolean((c.State.schedule.advances || {})[secondId])
            && c.State.ledgerParity().agrees === true,
        JSON.stringify(Object.keys(c.State.schedule.advances || {})));
    check('and in the cloud',
        Boolean((cloud.doc.advances || {})[secondId]),
        JSON.stringify(Object.keys(cloud.doc.advances || {})));
    check('the two phones hold the same record', answerOf(a) === answerOf(c),
        `${answerOf(a)} || ${answerOf(c)}`);
    check('and neither claims synced while disagreeing with the other',
        disagreementAmongSynced([a, c]) === null, String(disagreementAmongSynced([a, c])));
}

// ================================================================ O8b
//
// THE SAME WINDOW, ON THE BUILD A PERSON ACTUALLY HAS: both money gates shut.
//
// With the gates open, an advance handed over writes two things - the legacy `advances`
// map every build reads, and a `given` entry in the ledger - and O8 above proves the
// ledger half survives the restore on every phone, because ledger entries are merged by
// union. With the gates SHUT, which is what is installed, recordNewAdvance writes the
// legacy map and nothing else (see ledgerWritesEnabled in js/model/ledger.js), and the
// legacy map is part of the work record a restore replaces.
//
// So this asks the contract's own question - "an ordinary restore never erases a financial
// event, on any device" - of the shipped build. It is a financial event: somebody was
// handed 800 shekels and it was written down.
{
    suite('O8b: the shipped build - an advance handed over while a restore is in flight');

    const cloud = makeCloud();
    const spy = instrument(cloud);
    const a = phone('d_a8b', cloud, { gates: false });
    const c = phone('d_c8b', cloud, { gates: false });
    await settle(TICK * 25);

    const open = deferred();
    spy.hold(kind => (kind === 'save' ? open.promise : null));
    const restoring = a.Sync.replaceEverything(a.call('normaliseSchedule', backupFile()));
    await settle(TICK * 15);
    given('A\'s restore is in flight', attemptedSaves(cloud) === 1, String(attemptedSaves(cloud)));

    const made = c.State.commitMany(c.call('recordNewAdvance', c.State.schedule,
        'w_02', '2026-08-25', 800, 'מקדמה שנייה', '2026-08-25T07:00:00.000Z', 'd_c8b', 'cash'));
    given('C hands somebody 800 and writes it down', made === true, String(made));
    const secondId = Object.keys(c.State.schedule.advances || {})
        .filter(id => id !== ADVANCE)[0];
    given('and it has an id', typeof secondId === 'string' && secondId.length > 0,
        String(secondId));
    await settleUntil(() => Boolean((cloud.doc.advances || {})[secondId]), 8000, 10);
    check('it reached the cloud while the restore was still open',
        Boolean((cloud.doc.advances || {})[secondId]),
        JSON.stringify(Object.keys(cloud.doc.advances || {})));

    open.release();
    spy.open();
    await restoring.catch(() => {});
    await settled([a, c], 30000);

    check('the 800 somebody was handed is still in the cloud',
        Boolean((cloud.doc.advances || {})[secondId]),
        JSON.stringify(Object.keys(cloud.doc.advances || {})));
    check('and on the phone that wrote it down',
        Boolean((c.State.schedule.advances || {})[secondId]),
        JSON.stringify(Object.keys(c.State.schedule.advances || {})));
    check('and on the phone that restored',
        Boolean((a.State.schedule.advances || {})[secondId]),
        JSON.stringify(Object.keys(a.State.schedule.advances || {})));
    check('no device claiming synced disagrees with another',
        disagreementAmongSynced([a, c]) === null, String(disagreementAmongSynced([a, c])));
}

// ================================================================ O9
{
    suite('O9: retrying the same restore doubles no financial event');

    const cloud = makeCloud();
    const spy = instrument(cloud);
    const a = phone('d_a9', cloud);
    const b = phone('d_b9', cloud);
    await settle(TICK * 25);

    const open = deferred();
    spy.hold(kind => (kind === 'save' ? open.promise : null));
    const restoring = a.Sync.replaceEverything(a.call('normaliseSchedule', backupFile()));
    await settle(TICK * 15);
    given('the restore is in flight', attemptedSaves(cloud) === 1, String(attemptedSaves(cloud)));
    const identityAtPrepare = identityOf(a.Sync.pendingReplace());

    given('B records a repayment in the window',
        repay(b, 500, '2026-08-24T09:00:00.000Z') === true);
    await settleUntil(() => ledgerIdsOf(cloud.doc).length === 2, 5000, 10);

    open.release();
    spy.open();
    await restoring.catch(() => {});
    await settled([a, b], 25000);

    const entriesAfterFirst = ledgerIdsOf(cloud.doc).join();
    const leftAfterFirst = leftOn(a);

    // ---- and now the same transaction is asked for again, by hand, from every door that
    //      can ask for one. A retry that re-applies is a retry that counts money twice.
    await a.Sync.resumeReplace();
    await a.Sync.resumeReplace();
    a.Sync.scheduleFlush();
    await settled([a, b], 20000);

    check('the ledger is exactly what it was before the retries',
        ledgerIdsOf(cloud.doc).join() === entriesAfterFirst,
        `${ledgerIdsOf(cloud.doc).join()} vs ${entriesAfterFirst}`);
    check('no repayment was counted twice',
        leftOn(a) === leftAfterFirst && leftOn(b) === leftAfterFirst,
        `${leftOn(a)} / ${leftOn(b)} vs ${leftAfterFirst}`);
    check('and the repayment is still there rather than tidied away',
        leftAfterFirst === 4500, String(leftAfterFirst));
    const wholeWrites = spy.saves.filter(save => save.kind === 'save');
    check('every whole-document write carried the transaction\'s own operation id',
        wholeWrites.length > 0
        && wholeWrites.every(save => save.opId === wholeWrites[0].opId),
        JSON.stringify(wholeWrites.map(save => save.opId)));
    check('the transaction kept its identity across every attempt',
        a.Sync.pendingReplace() === null
        || identityOf(a.Sync.pendingReplace()) === identityAtPrepare,
        `${identityOf(a.Sync.pendingReplace())} vs ${identityAtPrepare}`);
    check('no financial event left the cloud at any instant', spy.lost.length === 0,
        JSON.stringify(spy.lost));
}

// ================================================================ O10
{
    suite('O10: one id, two bodies, arriving while a restore is in flight');

    const cloud = makeCloud();
    const spy = instrument(cloud);
    const a = phone('d_a10', cloud);
    const b = phone('d_b10', cloud);
    await settle(TICK * 25);

    // The backup carries an entry under a name B is about to write something else under.
    // Same id, different amount: two statements about what happened to one man's money,
    // and nothing in this app is allowed to pick one.
    const backup = backupFile();
    backup.ledger.advances.le_contested = {
        id: 'le_contested', advanceId: ADVANCE, kind: 'repaid',
        workerId: 'w_01', date: '2026-08-24', amount: 500, note: 'מזומן',
        method: 'cash', at: '2026-08-24T09:00:00.000Z', by: 'd_backup'
    };

    const open = deferred();
    spy.hold(kind => (kind === 'save' ? open.promise : null));
    const restoring = a.Sync.replaceEverything(a.call('normaliseSchedule', backup));
    await settle(TICK * 15);
    given('the restore is in flight', attemptedSaves(cloud) === 1, String(attemptedSaves(cloud)));

    // ---- B writes the SAME id with a different body, in the window
    const clash = b.State.commit(b.call('appendLedgerEntry', b.State.schedule, {
        id: 'le_contested', advanceId: ADVANCE, kind: 'repaid',
        workerId: 'w_01', date: '2026-08-24', amount: 900, note: 'מזומן',
        method: 'cash', at: '2026-08-24T09:00:00.000Z', by: 'd_b10'
    }));
    given('B records its own version of that entry', clash === true, String(clash));
    await settleUntil(() => ledgerIdsOf(cloud.doc).indexOf('le_contested') !== -1, 5000, 10);
    check('B\'s copy is in the cloud while the restore is open',
        ledgerIdsOf(cloud.doc).indexOf('le_contested') !== -1,
        JSON.stringify(ledgerIdsOf(cloud.doc)));

    open.release();
    spy.open();
    await restoring.catch(() => {});
    await settled([a, b], 25000);

    const conflicted = ((a.State.schedule.ledger || {}).conflicted) || {};
    const held = conflicted.le_contested || null;
    check('the disagreement is held on the restoring phone, under its own name',
        Boolean(held), JSON.stringify(Object.keys(conflicted)));
    check('and BOTH bodies are kept, neither chosen',
        Boolean(held) && Number((held.here || {}).amount) !== Number((held.arrived || {}).amount)
        && [Number((held.here || {}).amount), Number((held.arrived || {}).amount)].sort().join() === '500,900',
        JSON.stringify(held));
    check('the phone stops rather than carrying on quietly',
        a.Sync.status !== 'synced', a.Sync.status);
    check('no financial event left the cloud at any instant', spy.lost.length === 0,
        JSON.stringify(spy.lost));

    // ---- a conflict survives a close and reopen
    const again = phone('d_a10', cloud, { storage: a.dump() });
    await settle(TICK * 40);
    const afterConflicted = ((again.State.schedule.ledger || {}).conflicted) || {};
    check('the disagreement is still there after a close and reopen',
        Boolean(afterConflicted.le_contested), JSON.stringify(Object.keys(afterConflicted)));
    check('with both bodies still kept',
        Boolean(afterConflicted.le_contested)
        && [Number((afterConflicted.le_contested.here || {}).amount),
            Number((afterConflicted.le_contested.arrived || {}).amount)].sort().join() === '500,900',
        JSON.stringify(afterConflicted.le_contested));
    check('and the reopened phone does not report itself finished',
        again.Sync.status !== 'synced', again.Sync.status);
}

// ================================================================ O10b
//
// The same disagreement, arriving by the OTHER door and with nothing in flight at all:
// the file a person hands in disagrees with the phone they hand it to. No concurrency
// here - it is in this suite because it is the same rule, and because a person meeting a
// disagreement on one path and not on the other learns that whether the app stops depends
// on how the record arrived, which is not true.
//
// prepareReplace has built that map since the ledger merge. What it could not do was get
// it onto the disk: normaliseSchedule reports a conflicted map to Recovery, Recovery
// blocks writing the moment it is told, and the block landed on the save that was going
// to store the two bodies. So the restore came back «stage: local» with the transaction
// cancelled and the record holding neither copy, and the hold died with the session.
{
    suite('O10b: the backup file itself disagrees with the phone about one entry');

    const cloud = makeCloud();
    const spy = instrument(cloud);
    const entry = (amount, by) => ({
        id: 'le_contested', advanceId: ADVANCE, kind: 'repaid', workerId: 'w_01',
        date: '2026-08-24', amount, note: 'מזומן', method: 'cash',
        at: '2026-08-24T09:00:00.000Z', by
    });

    const a = phone('d_a10b', cloud);
    given('the phone records 900 handed back',
        a.State.commit(a.call('appendLedgerEntry', a.State.schedule, entry(900, 'd_a10b')))
            === true);
    await settle(TICK * 25);
    given('nothing is held yet', a.call('farkadWritesBlocked') === false);
    given('and the account reads what the phone recorded', leftOn(a) === 4100,
        String(leftOn(a)));

    // The file says 500 under the same id. One of the two is a mistake and this app is
    // not the thing that decides which.
    const backup = backupFile();
    backup.ledger.advances.le_contested = entry(500, 'd_backup');
    const result = await a.Sync.replaceEverything(a.call('normaliseSchedule', backup));

    check('the restore does not report itself done over a disagreement',
        result.ok === false, JSON.stringify(result));
    const conflicted = ((a.State.schedule.ledger || {}).conflicted) || {};
    check('both bodies are on the record, neither chosen',
        Boolean(conflicted.le_contested)
        && [Number((conflicted.le_contested.here || {}).amount),
            Number((conflicted.le_contested.arrived || {}).amount)].sort().join() === '500,900',
        JSON.stringify(conflicted.le_contested));
    check('and on the disk, which is what the next session opens',
        Boolean(((JSON.parse(a.raw('scheduleData:v2')).ledger || {}).conflicted || {}).le_contested),
        JSON.stringify(Object.keys((JSON.parse(a.raw('scheduleData:v2')).ledger || {}).conflicted || {})));
    check('nothing more is recorded against that account until a person has looked',
        a.call('farkadWritesBlocked') === true);
    check('and the local half of the restore did happen',
        dayKeysOf(diskOf(a)) === RESTORED_DAYS, dayKeysOf(diskOf(a)));
    check('no financial event left the cloud at any instant', spy.lost.length === 0,
        JSON.stringify(spy.lost));

    // ---- and it survives a close and reopen
    const again = phone('d_a10b', cloud, { storage: a.dump() });
    await settle(TICK * 30);
    const afterConflicted = ((again.State.schedule.ledger || {}).conflicted) || {};
    check('the disagreement is still on the record after a reopen',
        Boolean(afterConflicted.le_contested), JSON.stringify(Object.keys(afterConflicted)));
    check('the reopened phone is still stopped',
        again.call('farkadWritesBlocked') === true);
    check('and it does not report itself finished',
        again.Sync.status !== 'synced', again.Sync.status);
}

report();
