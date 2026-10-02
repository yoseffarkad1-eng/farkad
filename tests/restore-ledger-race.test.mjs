// A restore, and the money another phone recorded while it was being taken.
//
//   node tests/restore-ledger-race.test.mjs
//
// THE BLOCKER (docs/data-safety-audit.md, O1). Two phones, both online, nothing failing.
// A takes a backup. B records that 500 of an advance was handed back; it reaches the
// cloud and A. A then restores the backup it took a moment earlier, through the ordinary
// door. Afterwards A and the cloud hold no repayment and B holds it, for ever: B never
// sends it back, both phones report synced, and it survives closing and reopening B.
//
//     A: 5000 left      B: 4500 left      cloud: 5000 left
//
// Nothing is reported. Only the ledger diverges, because the ledger is the only part of
// the record that is merged by union rather than replaced - receive() folds the arriving
// document into this phone's ledger container with mergeLedgerInto (js/sync/receive.js
// :602), and nothing travels with a snapshot to say whether it is an ordinary field
// merge or the whole-document replacement a restore just wrote. So the restoring phone
// drops the entry (applyReplacementLocally normalises the backup document and saves it,
// js/sync/restore.js:159) and every OTHER phone keeps it.
//
// THE RULE THIS SUITE IS WRITTEN AGAINST, which the owner has decided:
//
//   an ordinary restore never erases known financial history, on any device;
//   the financial record is preserved and merged consistently on the restoring device,
//     the other devices and the cloud;
//   if two financial facts conflict, both are kept and a person is stopped - never a
//     silent choice of amount;
//   no destructive financial rollback under the name of an ordinary restore.
//
// So every check below asks for ONE balance on all three, and the balance it asks for is
// the one that includes the repayment. On this commit the first suite fails and prints
// the three numbers; the rest are the ways a fix could be wrong.
//
// The money gates are opened through the test seam and nowhere else - `flags` on a
// harness device - so the shipped defaults are untouched. Every reading is taken through
// production functions (advanceOutstanding, foldLedger, readBackupFile) over the bytes on
// a device's own disk or in the fake cloud's document; nothing here asserts by reading
// source.

import { makeDevice, makeCloud, settle, settleUntil } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const GATES = { carryAdvances: true, ledgerWrites: true };
const WORKER = { id: 'w_01', name: 'עומר', active: true, dailyRate: 500, hourlyRate: 0 };
const PLACE = { id: 'p_01', name: 'הרצליה', active: true };

// One phone. `storage` carries a previous session's disk across, which is how a close and
// reopen is spelled.
function phone(id, storage) {
    const device = makeDevice(storage
        ? { deviceId: id, storage, flags: GATES }
        : { deviceId: id, flags: GATES });
    device.Sync.pushDelayMs = 6;
    device.setToday('2026-08-26');
    device.ctx.askTell = () => Promise.resolve();
    device.ctx.askConfirm = () => Promise.resolve(true);
    device.State.load();
    return device;
}

// A device that only READS. Every balance below is computed on it rather than on the
// phone being measured, so that normalising somebody else's document can never put the
// phone under test into recovery and change the thing being measured.
const meter = makeDevice({ deviceId: 'd_meter', flags: GATES });
meter.State.load();

// What an advance stands at, through the production fold, over whatever record is handed
// in. `left` is what the man still owes.
function leftIn(schedule, advanceId) {
    if (!schedule) return null;
    const normalised = meter.call('normaliseSchedule',
        JSON.parse(JSON.stringify(schedule)));
    return meter.call('advanceOutstanding', normalised, advanceId).left;
}

const leftOn = (device, advanceId) => leftIn(device.State.schedule, advanceId);
const leftInCloud = (cloud, advanceId) => leftIn(cloud.doc, advanceId);

// The ledger entries the fold can actually see for this advance, by kind, wherever the
// record is. A balance can be right for the wrong reason; this says what is on the record.
function kindsIn(schedule, advanceId) {
    if (!schedule) return [];
    const normalised = meter.call('normaliseSchedule',
        JSON.parse(JSON.stringify(schedule)));
    return meter.call('advanceHistory', normalised, advanceId)
        .map(entry => String(entry.kind)).sort();
}

// A phone that can write and cannot hear - the gate tests/samefact.test.mjs and
// tests/contested.test.mjs use. `deaf` also refuses the writes, which is what a tunnel
// actually does to a phone.
function tunnel(cloud) {
    const gate = { open: true, deaf: false, waiting: [], adapter: {} };
    Object.keys(cloud.adapter).forEach(name => {
        gate.adapter[name] = (...args) => {
            if (gate.deaf && name !== 'subscribe') {
                const error = new Error('client is offline');
                error.code = 'unavailable';
                return Promise.reject(error);
            }
            return cloud.adapter[name](...args);
        };
    });
    gate.adapter.subscribe = (onNext, onError) => cloud.adapter.subscribe(
        snapshot => {
            if (gate.open) onNext(snapshot);
            else gate.waiting.push([onNext, snapshot]);
        }, onError);
    gate.close = () => { gate.open = false; gate.deaf = true; };
    gate.release = () => {
        gate.open = true;
        gate.deaf = false;
        const waiting = gate.waiting.slice();
        gate.waiting = [];
        waiting.forEach(([onNext, snapshot]) => onNext(snapshot));
    };
    return gate;
}

// The advance, through the real writer: the legacy field AND its origin entry, which is
// what recordNewAdvance produces with the ledger gate open.
function handOver(device, amount) {
    const changes = device.call('recordNewAdvance', device.State.schedule,
        'w_01', '2026-08-10', amount, '', '2026-08-10T07:00:00.000Z', device.id, 'cash');
    device.State.commitMany(changes);
    return changes[0].value.id;
}

// Cash handed back, through the real writer.
function handBack(device, advanceId, amount, date, at) {
    const change = device.call('recordAdvanceRepaid', device.State.schedule,
        advanceId, amount, date, '', at, device.id, 'cash');
    return { change, committed: device.State.commit(change) };
}

// The backup file, produced by the button and read back by the reader the import door
// uses. Not a hand-built object: the thing a person is holding is the bytes exportBackup
// wrote, and the schedule the restore transaction is given is what readBackupFile makes
// of them.
function backupOf(device) {
    device.call('exportBackup');
    const file = device.downloads[device.downloads.length - 1];
    return { name: file.name, text: file.text };
}

function scheduleFromBackup(device, text) {
    return device.call('readBackupFile', JSON.parse(text)).schedule;
}

// The whole opening: a crew, an advance of 5000, two phones that have both heard it.
async function twoPhones(tag, options = {}) {
    const cloud = makeCloud();
    const a = phone(`d_${tag}_a`);
    a.State.schedule.workers = [Object.assign({}, WORKER)];
    a.State.schedule.places = [Object.assign({}, PLACE)];
    a.State.save({ silent: true });
    const advanceId = handOver(a, 5000);

    const b = phone(`d_${tag}_b`);
    const gate = options.gated ? tunnel(cloud) : null;

    a.Sync.connect(cloud.adapter);
    await settleUntil(() => Boolean(cloud.doc && cloud.doc.advances
        && cloud.doc.advances[advanceId]));
    b.Sync.connect(gate ? gate.adapter : cloud.adapter);
    await settleUntil(() => Boolean((b.State.schedule.advances || {})[advanceId]));
    await settle(40);

    return { cloud, a, b, gate, advanceId };
}

// ================================================================ L1
{
    suite('L1: a backup restored while another phone has just recorded a repayment');

    const { cloud, a, b, advanceId } = await twoPhones('o1');

    given('both phones hold the same advance of 5,000',
        leftOn(a, advanceId) === 5000 && leftOn(b, advanceId) === 5000,
        JSON.stringify([leftOn(a, advanceId), leftOn(b, advanceId)]));

    // 1. A takes a backup - the real file, off the real button.
    const backup = backupOf(a);
    given('the backup file is a whole record naming the advance',
        backup.text.indexOf(advanceId) !== -1 && backup.name.indexOf('farkad-') === 0,
        JSON.stringify({ name: backup.name, bytes: backup.text.length }));

    // 2. B records 500 handed back. It reaches the cloud, and from there A.
    const repaid = handBack(b, advanceId, 500, '2026-08-24', '2026-08-24T09:00:00.000Z');
    given('the repayment was committed on B', repaid.committed === true,
        JSON.stringify(repaid.change));
    await settleUntil(() => leftInCloud(cloud, advanceId) === 4500);
    await settleUntil(() => leftOn(a, advanceId) === 4500);
    given('every phone and the cloud stand at 4,500 before the restore',
        leftOn(a, advanceId) === 4500 && leftOn(b, advanceId) === 4500
        && leftInCloud(cloud, advanceId) === 4500,
        JSON.stringify([leftOn(a, advanceId), leftOn(b, advanceId),
            leftInCloud(cloud, advanceId)]));

    // 3. A restores the backup it took a moment ago, through the ordinary door.
    const restored = await a.Sync.replaceEverything(scheduleFromBackup(a, backup.text));
    given('the restore transaction reports itself done',
        restored.ok === true && restored.stage === 'done', JSON.stringify(restored));
    await settle(120);

    const reading = {
        A: leftOn(a, advanceId), B: leftOn(b, advanceId),
        cloud: leftInCloud(cloud, advanceId),
        statusA: a.Sync.status, statusB: b.Sync.status
    };

    // THE THREE BALANCES, printed on every one of these checks so a failing run says
    // what the record actually holds rather than only that it is wrong.
    check('the restoring phone still knows the 500 was handed back',
        reading.A === 4500, JSON.stringify(reading));
    check('and so does the cloud', reading.cloud === 4500, JSON.stringify(reading));
    check('and so does the phone that recorded it',
        reading.B === 4500, JSON.stringify(reading));
    check('the three of them say one thing about one man’s money',
        reading.A === reading.B && reading.B === reading.cloud,
        JSON.stringify(reading));

    // Not the balance: the record. A number that happens to agree is not the entry.
    same('the repayment is still an entry on the restoring phone',
        kindsIn(a.State.schedule, advanceId), ['given', 'repaid']);
    same('and in the cloud document', kindsIn(cloud.doc, advanceId),
        ['given', 'repaid']);

    // And the one thing that makes the divergence permanent rather than a moment: the
    // phone that is behind is not allowed to say it is up to date.
    check('no phone claims to be synced while the two disagree',
        reading.A === reading.B
        || (reading.statusA !== 'synced' && reading.statusB !== 'synced'),
        JSON.stringify(reading));
}

// ================================================================ L2
{
    suite('L2: and it survives closing and reopening the phone that recorded it');

    const { cloud, a, b, advanceId } = await twoPhones('reopen');
    const backup = backupOf(a);
    handBack(b, advanceId, 500, '2026-08-24', '2026-08-24T09:00:00.000Z');
    await settleUntil(() => leftInCloud(cloud, advanceId) === 4500);
    await settleUntil(() => leftOn(a, advanceId) === 4500);

    const restored = await a.Sync.replaceEverything(scheduleFromBackup(a, backup.text));
    given('the restore ran', restored.ok === true, JSON.stringify(restored));
    await settle(120);

    // Both phones closed and opened again: the state the next session actually computes,
    // off the disk, with the journal replayed.
    const aAgain = phone(`d_reopen_a2`, a.dump());
    const bAgain = phone(`d_reopen_b2`, b.dump());
    await settle(20);

    const reading = {
        A: leftOn(aAgain, advanceId), B: leftOn(bAgain, advanceId),
        cloud: leftInCloud(cloud, advanceId)
    };
    check('the reopened restoring phone holds the repayment',
        reading.A === 4500, JSON.stringify(reading));
    check('the reopened recording phone holds it too',
        reading.B === 4500, JSON.stringify(reading));
    check('and a reopen does not leave two phones describing two debts',
        reading.A === reading.B && reading.B === reading.cloud,
        JSON.stringify(reading));
}

// ================================================================ L3
{
    suite('L3: the repayment reached the cloud, and B was deaf across the restore');

    // The same defect from the other side of the signal. B records the cash, it lands,
    // and THEN B goes into a tunnel - so B does not see the restore until afterwards and
    // meets it as a snapshot arriving on a phone that has been out of touch, which is the
    // ordinary case on a building site rather than the exception.
    const { cloud, a, b, gate, advanceId } = await twoPhones('deaf', { gated: true });

    const backup = backupOf(a);
    handBack(b, advanceId, 500, '2026-08-24', '2026-08-24T09:00:00.000Z');
    await settleUntil(() => leftInCloud(cloud, advanceId) === 4500);
    await settleUntil(() => leftOn(a, advanceId) === 4500);

    gate.close();
    const restored = await a.Sync.replaceEverything(scheduleFromBackup(a, backup.text));
    given('the restore ran while B could not hear it',
        restored.ok === true, JSON.stringify(restored));
    await settle(80);

    gate.release();
    await settle(140);

    const reading = {
        A: leftOn(a, advanceId), B: leftOn(b, advanceId),
        cloud: leftInCloud(cloud, advanceId), statusB: b.Sync.status
    };
    check('B coming back finds a record that still has the repayment in it',
        reading.B === 4500, JSON.stringify(reading));
    check('and the phone that restored has it too',
        reading.A === 4500, JSON.stringify(reading));
    check('and the three agree', reading.A === reading.B && reading.B === reading.cloud,
        JSON.stringify(reading));
}

// ================================================================ L4
{
    suite('L4: the repayment that never reached the cloud is not the same failure');

    // The contrast, and it is here so the suites above cannot be read as "a restore loses
    // any repayment". An entry still sitting in B's own queue is work B is owed; the
    // restore supersedes nothing of B's, and the flush puts it back. If this one is red
    // the fault is somewhere else entirely, and knowing that is worth a suite.
    const { cloud, a, b, gate, advanceId } = await twoPhones('queued', { gated: true });

    const backup = backupOf(a);
    gate.close();
    const repaid = handBack(b, advanceId, 500, '2026-08-24', '2026-08-24T09:00:00.000Z');
    given('B recorded the cash with nowhere to send it',
        repaid.committed === true && leftOn(b, advanceId) === 4500,
        JSON.stringify([repaid.committed, leftOn(b, advanceId)]));

    const restored = await a.Sync.replaceEverything(scheduleFromBackup(a, backup.text));
    given('and A restored a backup taken before it',
        restored.ok === true, JSON.stringify(restored));
    await settle(80);

    gate.release();
    await settleUntil(() => leftInCloud(cloud, advanceId) === 4500, 4000);
    await settle(140);

    const reading = {
        A: leftOn(a, advanceId), B: leftOn(b, advanceId),
        cloud: leftInCloud(cloud, advanceId)
    };
    check('the queued repayment reaches the cloud after the restore',
        reading.cloud === 4500, JSON.stringify(reading));
    check('and the phone that restored ends up holding it',
        reading.A === 4500, JSON.stringify(reading));
    check('and nobody is left behind', reading.A === reading.B
        && reading.B === reading.cloud, JSON.stringify(reading));
}

// ================================================================ L5
{
    suite('L5: two repayments, from two phones, racing one restore');

    const { cloud, a, b, advanceId } = await twoPhones('two');
    const backup = backupOf(a);

    const fromB = handBack(b, advanceId, 500, '2026-08-24', '2026-08-24T09:00:00.000Z');
    await settleUntil(() => leftInCloud(cloud, advanceId) === 4500);
    await settleUntil(() => leftOn(a, advanceId) === 4500);
    const fromA = handBack(a, advanceId, 300, '2026-08-25', '2026-08-25T09:00:00.000Z');
    await settleUntil(() => leftInCloud(cloud, advanceId) === 4200);
    await settleUntil(() => leftOn(b, advanceId) === 4200);
    given('both repayments are on the record everywhere before the restore',
        fromA.committed === true && fromB.committed === true
        && leftOn(a, advanceId) === 4200 && leftOn(b, advanceId) === 4200
        && leftInCloud(cloud, advanceId) === 4200,
        JSON.stringify([leftOn(a, advanceId), leftOn(b, advanceId),
            leftInCloud(cloud, advanceId)]));

    const restored = await a.Sync.replaceEverything(scheduleFromBackup(a, backup.text));
    given('the restore of the older backup ran', restored.ok === true,
        JSON.stringify(restored));
    await settle(140);

    const reading = {
        A: leftOn(a, advanceId), B: leftOn(b, advanceId),
        cloud: leftInCloud(cloud, advanceId)
    };
    check('a restore does not undo the repayment made on the restoring phone',
        reading.A === 4200, JSON.stringify(reading));
    check('nor the one made on the other phone', reading.B === 4200,
        JSON.stringify(reading));
    check('and the cloud holds both', reading.cloud === 4200, JSON.stringify(reading));
    same('both entries are still on the restoring phone’s record',
        kindsIn(a.State.schedule, advanceId), ['given', 'repaid', 'repaid']);
}

// ================================================================ L6
{
    suite('L6: a third phone adopts the restore document');

    // C has heard the repayment and takes no part in the restore. It is the phone nobody
    // is looking at, and under the union rule it is the one that ends up holding a debt
    // the other two have forgotten - which is how a divergence gets to payday.
    const { cloud, a, b, advanceId } = await twoPhones('third');
    const c = phone('d_third_c');
    c.Sync.connect(cloud.adapter);
    await settleUntil(() => Boolean((c.State.schedule.advances || {})[advanceId]));

    const backup = backupOf(a);
    handBack(b, advanceId, 500, '2026-08-24', '2026-08-24T09:00:00.000Z');
    await settleUntil(() => leftOn(c, advanceId) === 4500, 4000);
    given('the third phone heard the repayment',
        leftOn(c, advanceId) === 4500, String(leftOn(c, advanceId)));

    const restored = await a.Sync.replaceEverything(scheduleFromBackup(a, backup.text));
    given('the restore ran', restored.ok === true, JSON.stringify(restored));
    await settle(160);

    const reading = {
        A: leftOn(a, advanceId), B: leftOn(b, advanceId), C: leftOn(c, advanceId),
        cloud: leftInCloud(cloud, advanceId)
    };
    check('the third phone is not left alone with the repayment',
        reading.C === reading.A, JSON.stringify(reading));
    check('all three phones and the cloud say one number',
        reading.A === reading.B && reading.B === reading.C
        && reading.C === reading.cloud, JSON.stringify(reading));
    check('and that number is the one that includes the cash handed back',
        reading.A === 4500, JSON.stringify(reading));
}

// ================================================================ L7
{
    suite('L7: the same restore run twice adds nothing and removes nothing');

    // Whatever a fix does about the union, it must be idempotent: a restore is retried
    // from the disk by resumeReplace, and an operation that MERGES rather than replaces
    // is exactly the shape that doubles an amount when it runs a second time.
    const { cloud, a, b, advanceId } = await twoPhones('twice');
    const backup = backupOf(a);
    handBack(b, advanceId, 500, '2026-08-24', '2026-08-24T09:00:00.000Z');
    await settleUntil(() => leftOn(a, advanceId) === 4500);

    const schedule = scheduleFromBackup(a, backup.text);
    const first = await a.Sync.replaceEverything(schedule);
    given('the first run finished', first.ok === true, JSON.stringify(first));
    await settle(120);
    const afterOne = {
        A: leftOn(a, advanceId), B: leftOn(b, advanceId),
        cloud: leftInCloud(cloud, advanceId),
        kinds: kindsIn(a.State.schedule, advanceId)
    };

    const second = await a.Sync.replaceEverything(
        scheduleFromBackup(a, backup.text));
    given('the second run finished too', second.ok === true, JSON.stringify(second));
    await settle(140);
    const afterTwo = {
        A: leftOn(a, advanceId), B: leftOn(b, advanceId),
        cloud: leftInCloud(cloud, advanceId),
        kinds: kindsIn(a.State.schedule, advanceId)
    };

    same('the second run changes no balance anywhere',
        [afterTwo.A, afterTwo.B, afterTwo.cloud],
        [afterOne.A, afterOne.B, afterOne.cloud]);
    same('and no event is counted twice', afterTwo.kinds, afterOne.kinds);
    check('and the balance is still the one that includes the repayment',
        afterTwo.A === 4500 && afterTwo.cloud === 4500, JSON.stringify(afterTwo));
}

report();
