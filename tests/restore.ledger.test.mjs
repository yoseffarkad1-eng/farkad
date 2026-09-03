// A restore removes no ledger entry, on any phone.
//
//   node tests/restore.ledger.test.mjs
//
// THE FAULT THIS SUITE WAS WRITTEN FOR. Two phones, both online, nothing failing. A
// takes a backup. B records a repayment of 500, which reaches the cloud and A. A then
// restores that backup through the ordinary door. Afterwards:
//
//     A  left 5000        B  left 4500        cloud  left 5000
//
// B keeps the repayment for ever, never sends it back, and BOTH PHONES REPORT SYNCED.
// Only the ledger diverges: days, advances, workers and places all converge, so nothing
// on any screen says the two phones disagree about what a man owes. Somebody is docked
// 500 shekels he already handed over, and the app is certain.
//
// The decision, and the reasoning behind it, is features/restore-ledger/contract.md:
// RULE A - a restore replaces days, roster, places and every other part of the record,
// as it always has, and UNIONS the ledger, on the restoring device as well as on the
// phones that adopt the snapshot afterwards. Nothing in a restore ever deletes an
// advance, a repayment, a correction or a closure, anywhere.
//
// It costs something and the contract says so: a restore can no longer be used to remove
// a ledger entry, including on the phone performing it. That is visible - the entry is on
// the screen and in the statement - and the ledger's own correction kinds are the
// designed answer to it. The failure it buys off is invisible: an entry somebody else
// recorded, deleted from their phone by a restore they never asked for and were never
// told about.
//
// WHAT A GREEN RUN HERE DOES NOT SAY. Every claim below is about an entry this phone
// HOLDS. An entry that is in the cloud and has never reached the restoring phone is still
// removed from the cloud document by the save, because the union can only carry what this
// device has - reachable by restoring while offline, and named under LIMIT in
// features/restore-ledger/contract.md. It is not new and it is not fixed here; this
// paragraph is so that a page of PASS lines cannot be read as covering it.
//
// Every check below is an observation through the production doors and the bytes that
// are actually on the disk or in the fake cloud. Nothing asserts by reading source.

import { makeDevice, makeCloud, settle, settleUntil } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const WORKER = { id: 'w_01', name: 'עומר', active: true, dailyRate: 500, hourlyRate: 0 };
const PLACE = { id: 'p_01', name: 'הרצליה', active: true };

// The advance every suite here is about: 5,000 handed over on the 10th, under a FIXED id
// so that two phones mirror it to the same deterministic ledger entry and the fixture is
// not built on a coin toss.
const ADVANCE = { id: 'a_omer', workerId: 'w_01', date: '2026-08-10', amount: 5000, note: '' };

// The money gates, opened through the one seam that exists for it. The shipped defaults
// stay false and are pinned elsewhere; this is the build a person would ship with them
// open, which is the only build in which any of this arithmetic is reachable at all.
const FLAGS = { carryAdvances: true, ledgerWrites: true };

function phone(id, storage) {
    const device = makeDevice(storage
        ? { deviceId: id, storage, flags: FLAGS }
        : { deviceId: id, flags: FLAGS });
    device.Sync.pushDelayMs = 6;
    device.setToday('2026-08-26');
    device.ctx.askTell = () => Promise.resolve();
    device.ctx.askConfirm = () => Promise.resolve(true);
    if (storage) { device.State.load(); return device; }

    device.State.load();
    device.State.schedule.workers = [Object.assign({}, WORKER)];
    device.State.schedule.places = [Object.assign({}, PLACE)];
    device.State.schedule.advances = { a_omer: Object.assign({}, ADVANCE) };
    device.State.save({ silent: true });
    // Loaded again, because the boot mirror is what writes the 'given' entry every
    // document below is built around, and it runs at load - see State.load. Seeding the
    // schedule in place never asks for one: save() only requests the mirror when the
    // schedule OBJECT has changed, and a fixture that mutates the object it was handed
    // would measure a ledger no phone in the field ever has.
    device.State.load();
    // A day, because a restore document has to be a whole record to get through the
    // doors at all - and because the day is what proves the rest of the record still
    // REPLACES while the ledger unions.
    device.State.commit(device.call('assignPlace', device.State.schedule,
        '2026-08-12', 'w_01', 'actual', 'p_01'));
    return device;
}

// What the man still owes, asked of the production fold rather than counted here.
const leftOn = (device, schedule) =>
    device.call('advanceOutstanding', schedule, 'a_omer').left;

const leftHere = device => leftOn(device, device.State.schedule);

// The same question, of the document in the cloud. Read through a device of its own so
// that normalising somebody else's document cannot report anything against a phone this
// suite is measuring.
function leftInCloud(reader, cloud) {
    if (!cloud.doc) return null;
    const document = JSON.parse(JSON.stringify(cloud.doc));
    return leftOn(reader, reader.call('normaliseSchedule', document));
}

// He hands 500 back in cash on the 24th, through the function the form calls.
function repayOn(device, by) {
    const change = device.call('recordAdvanceRepaid', device.State.schedule,
        'a_omer', 500, '2026-08-24', '', '2026-08-24T09:00:00.000Z', by, 'cash');
    device.State.commit(change);
    return change;
}

// ================================================================ L1
{
    suite('L1: the reproduction - two phones, one cloud, one restore');

    const cloud = makeCloud();
    const reader = phone('d_reader');
    const a = phone('d_a');
    a.Sync.connect(cloud.adapter);
    await settleUntil(() => Boolean(cloud.doc), 5000);
    await settle(60);

    const b = phone('d_b_seed', a.dump());
    b.Sync.connect(cloud.adapter);
    await settle(120);

    given('both phones hold the same advance, mirrored to one entry',
        leftHere(a) === 5000 && leftHere(b) === 5000,
        JSON.stringify([leftHere(a), leftHere(b)]));
    given('and the cloud holds it too', leftInCloud(reader, cloud) === 5000,
        String(leftInCloud(reader, cloud)));

    // A takes the backup. The restore point is the bytes of A's record at this moment -
    // before the repayment exists anywhere.
    a.Store.set('scheduleData:snap:2026-08-20', JSON.stringify(a.State.schedule));
    given('the restore point carries no repayment',
        JSON.parse(a.raw('scheduleData:snap:2026-08-20')).ledger.advances
            && Object.keys(JSON.parse(a.raw('scheduleData:snap:2026-08-20'))
                .ledger.advances).length === 1,
        a.raw('scheduleData:snap:2026-08-20').slice(0, 120));

    // A day recorded AFTER the restore point was taken. It is part of what the restore
    // is replacing, and it has to be gone afterwards or "days still replace" is a claim
    // about nothing.
    a.State.commit(a.call('assignPlace', a.State.schedule,
        '2026-08-19', 'w_01', 'actual', 'p_01'));
    await settle(60);

    // B records the repayment, and it reaches the cloud and A.
    repayOn(b, 'd_b_seed');
    b.Sync.flush();
    await settleUntil(() => leftInCloud(reader, cloud) === 4500, 5000);
    await settleUntil(() => leftHere(a) === 4500, 5000);

    given('the repayment is on all three before the restore',
        leftHere(a) === 4500 && leftHere(b) === 4500
        && leftInCloud(reader, cloud) === 4500,
        JSON.stringify([leftHere(a), leftHere(b), leftInCloud(reader, cloud)]));

    // ---------------------------------------------------------- the restore, real door
    await a.call('restoreSnapshot', '2026-08-20');
    await settle(400);
    await settleUntil(() => a.Sync.pendingReplace() === null, 5000);
    await settle(400);

    const state = () => [leftHere(a), leftHere(b), leftInCloud(reader, cloud)];
    same('all three still say the man owes 4,500', state(), [4500, 4500, 4500]);

    check('the repayment is on the restoring phone’s own disk',
        JSON.stringify(JSON.parse(a.raw('scheduleData:v2')).ledger.advances)
            .indexOf('"repaid"') !== -1,
        JSON.stringify(Object.keys(
            JSON.parse(a.raw('scheduleData:v2')).ledger.advances)));

    check('and in the cloud document the other phones read',
        JSON.stringify((cloud.doc.ledger || {}).advances).indexOf('"repaid"') !== -1,
        JSON.stringify(Object.keys((cloud.doc.ledger || {}).advances || {})));

    // The other half of the contract: this is still a RESTORE. The day A recorded after
    // the restore point was taken is gone, because days replace.
    check('a restore still replaces the days',
        Object.keys(JSON.parse(a.raw('scheduleData:v2')).days).sort().join()
            === '2026-08-12',
        JSON.stringify(Object.keys(JSON.parse(a.raw('scheduleData:v2')).days)));

    // AND AFTER A REOPEN, because a union that lives in memory is not a union.
    const again = phone('d_a_again', a.dump());
    check('the reopened phone still holds it',
        leftHere(again) === 4500, String(leftHere(again)));
}

// ---------------------------------------------------------------- the four doors
//
// Every door a whole document replaces the record through, one device each. The restore
// source is always the phone's own record with the repayment taken out of it and a
// different day in it, so the only two things being measured are: does the entry survive,
// and does the day still replace.

// A phone that has recorded the advance AND the repayment, plus the document that would
// undo the repayment if a restore were allowed to.
async function stagedFor(id) {
    const device = phone(id);
    // The ledger mirror commits a moment after the save - see migrateSoon in js/state.js -
    // and it is what writes the 'given' entry every document below is built around.
    // Building the fixture before it has run measures a state no session ever holds.
    await settle(5);
    repayOn(device, id);
    const held = JSON.parse(JSON.stringify(device.State.schedule));
    const document = JSON.parse(JSON.stringify(device.State.schedule));
    // The backup as it was before the repayment: the mirror entry only.
    document.ledger.advances = {};
    Object.keys(held.ledger.advances).forEach(entryId => {
        if (String(held.ledger.advances[entryId].kind) === 'given') {
            document.ledger.advances[entryId] = held.ledger.advances[entryId];
        }
    });
    document.days = { '2026-07-30': held.days['2026-08-12'] };
    return { device, document };
}

const repaymentsOn = schedule => Object.keys((schedule.ledger || {}).advances || {})
    .filter(id => String(schedule.ledger.advances[id].kind) === 'repaid');

// ================================================================ L2
{
    suite('L2: the local restore point');

    const { device, document } = await stagedFor('d_snap');
    given('the phone holds the repayment and the restore point does not',
        leftHere(device) === 4500 && repaymentsOn(document).length === 0,
        JSON.stringify([leftHere(device), repaymentsOn(document)]));

    device.Store.set('scheduleData:snap:2026-08-20', JSON.stringify(document));
    await device.call('restoreSnapshot', '2026-08-20');
    await settle(80);

    const disk = JSON.parse(device.raw('scheduleData:v2'));
    check('the repayment survives the restore', leftHere(device) === 4500,
        String(leftHere(device)));
    check('and is on the disk, not only on the screen',
        repaymentsOn(disk).length === 1, JSON.stringify(repaymentsOn(disk)));
    check('while the days were replaced',
        Object.keys(disk.days).join() === '2026-07-30',
        JSON.stringify(Object.keys(disk.days)));
}

// ================================================================ L3
{
    suite('L3: the backup file');

    const { device, document } = await stagedFor('d_file');
    given('the file carries no repayment', repaymentsOn(document).length === 0,
        JSON.stringify(repaymentsOn(document)));

    device.call('importBackup',
        device.fileEvent('farkad.json', JSON.stringify(document)));
    await settle(200);

    const disk = JSON.parse(device.raw('scheduleData:v2'));
    check('the repayment survives the import', leftHere(device) === 4500,
        String(leftHere(device)));
    check('and is on the disk', repaymentsOn(disk).length === 1,
        JSON.stringify(repaymentsOn(disk)));
    check('while the days were replaced',
        Object.keys(disk.days).join() === '2026-07-30',
        JSON.stringify(Object.keys(disk.days)));
}

// ================================================================ L4
{
    suite('L4: the cloud restore point');

    const { device, document } = await stagedFor('d_cloudpoint');
    const cloud = makeCloud();
    device.Sync.connect(cloud.adapter);
    await settle(120);
    cloud.history.set('2026-08-20', JSON.parse(JSON.stringify(document)));

    given('the copy in the cloud carries no repayment',
        repaymentsOn(cloud.history.get('2026-08-20')).length === 0,
        JSON.stringify(repaymentsOn(cloud.history.get('2026-08-20'))));

    await device.call('restoreFromCloud', '2026-08-20');
    await settle(300);
    await settleUntil(() => device.Sync.pendingReplace() === null, 5000);

    const disk = JSON.parse(device.raw('scheduleData:v2'));
    check('the repayment survives the restore', leftHere(device) === 4500,
        String(leftHere(device)));
    check('and is on the disk', repaymentsOn(disk).length === 1,
        JSON.stringify(repaymentsOn(disk)));
    check('and in the cloud document the other phones read',
        repaymentsOn(cloud.doc || { ledger: { advances: {} } }).length === 1,
        JSON.stringify(Object.keys(((cloud.doc || {}).ledger || {}).advances || {})));
    check('while the days were replaced',
        Object.keys(disk.days).join() === '2026-07-30',
        JSON.stringify(Object.keys(disk.days)));
}

// ================================================================ L5
{
    suite('L5: the legacy upgrade - a v71 restore still waiting to be sent');

    const { device, document } = await stagedFor('d_v71');
    // A genuine v71 record: the bare cloud document, no version and no phase, sitting on
    // the disk of a phone that was closed before it could finish sending.
    const records = device.dump();
    records['farkad:pendingReplace'] = JSON.stringify(
        device.call('cloudDocument', device.call('normaliseSchedule', document)));

    const reopened = phone('d_v71_open', records);
    const envelope = reopened.Sync.pendingReplace();
    given('the phone recognises the old record and freezes it',
        envelope !== null && reopened.Sync.replaceHeld !== true,
        JSON.stringify({ held: reopened.Sync.replaceHeld,
            id: envelope && envelope.transactionId }));
    given('and the frozen document carries no repayment',
        repaymentsOn(envelope.document).length === 0,
        JSON.stringify(repaymentsOn(envelope.document)));

    const applied = reopened.Sync.applyReplacementLocally(envelope);
    given('the replacement is stored', applied.stored === true,
        JSON.stringify(applied));
    await settle(40);

    const disk = JSON.parse(reopened.raw('scheduleData:v2'));
    check('the repayment survives the legacy upgrade',
        leftHere(reopened) === 4500, String(leftHere(reopened)));
    check('and is on the disk', repaymentsOn(disk).length === 1,
        JSON.stringify(repaymentsOn(disk)));
    check('the device is told it holds what it holds',
        reopened.Sync.localDurableHolds(envelope) === true,
        String(reopened.Sync.localDurableHolds(envelope)));
    check('while the days were replaced',
        Object.keys(disk.days).join() === '2026-07-30',
        JSON.stringify(Object.keys(disk.days)));
}

// ================================================================ L6
{
    suite('L6: the union a restore performs is the union receive performs');

    // Requirement 4 of the contract. Not "two functions that agree today" - the SAME
    // function, asked of the same two records, so a restore and a snapshot cannot drift
    // apart about what merging a ledger means.
    const { device, document } = await stagedFor('d_same');
    const held = JSON.parse(JSON.stringify(device.State.schedule));

    const throughReceive = device.call('mergeLedgerInto',
        JSON.parse(JSON.stringify(document)), held, []);

    device.Store.set('scheduleData:snap:2026-08-20', JSON.stringify(document));
    await device.call('restoreSnapshot', '2026-08-20');
    await settle(80);

    same('the restored ledger is the merged ledger, entry for entry',
        Object.keys(JSON.parse(device.raw('scheduleData:v2')).ledger.advances).sort(),
        Object.keys(throughReceive.ledger.advances).sort());
}

// ================================================================ L7
{
    suite('L7: one id with two different bodies is still held, not resolved');

    // The union is not a licence to pick a winner. A restore document carrying an entry
    // that shares an id with this phone's and says something different about money is a
    // disagreement, and the answer is the same one receive() gives: keep both bytes, tell
    // the person, stop writing. Silently taking the restore's copy would be a deletion
    // wearing the word "restore".
    const { device, document } = await stagedFor('d_clash');
    const mine = repaymentsOn(device.State.schedule)[0];
    given('this phone has exactly one repayment to disagree about',
        typeof mine === 'string' && mine.length > 0, String(mine));

    const forged = JSON.parse(JSON.stringify(
        device.State.schedule.ledger.advances[mine]));
    forged.amount = 900;
    document.ledger.advances[mine] = forged;

    device.Store.set('scheduleData:snap:2026-08-20', JSON.stringify(document));
    await device.call('restoreSnapshot', '2026-08-20');
    await settle(120);

    const disk = JSON.parse(device.raw('scheduleData:v2'));
    const dispute = (disk.ledger.conflicted || {})[mine] || {};
    check('both bodies are kept, on the disk, under the id they disagree about',
        (dispute.here || {}).amount === 500 && (dispute.arrived || {}).amount === 900
        && disk.ledger.advances[mine].amount === 900,
        JSON.stringify(disk.ledger.conflicted));
    check('the person is told', device.global('Recovery').problems.length > 0,
        JSON.stringify(device.global('Recovery').problems.map(p => p.key)));
    check('and the device stops writing',
        device.call('farkadWritesBlocked') === true,
        String(device.call('farkadWritesBlocked')));
}

// ================================================================ L8
{
    suite('L8: the union only ADDS, and the gate is no looser for it');

    // The bound on what Rule A cost the invariant. localDurableHolds now unions this
    // device's ledger into what it expects, so entries the replacement never named do not
    // make it answer "no". The other direction must not move an inch: an entry the
    // REPLACEMENT carries and this disk does not have is still a device holding part of a
    // restore, and it must still stop the transaction - or a restore closes over a phone
    // that has the days and none of the money, which is what the seven-subtree comparison
    // in js/sync/sync.js was widened to catch in the first place.
    const { device, document } = await stagedFor('d_bound');
    device.Store.set('scheduleData:snap:2026-08-20', JSON.stringify(document));
    await device.call('restoreSnapshot', '2026-08-20');
    await settle(80);

    const envelope = { version: 2, phase: 'prepared', transactionId: 'bound',
        supersedesSeq: 0, supersedes: [], cloud: false,
        document: device.call('cloudDocument', device.State.schedule) };
    given('the device holds the record the envelope names',
        device.Sync.localDurableHolds(envelope) === true,
        String(device.Sync.localDurableHolds(envelope)));

    // One ledger entry the replacement carries and the disk does not.
    envelope.document.ledger = JSON.parse(JSON.stringify(envelope.document.ledger));
    envelope.document.ledger.advances.le_only_in_the_restore = {
        id: 'le_only_in_the_restore', advanceId: 'a_omer', kind: 'repaid',
        date: '2026-08-25', amount: 100, note: '', at: '', by: 'd_elsewhere'
    };
    check('a ledger entry the disk is missing still fails the gate',
        device.Sync.localDurableHolds(envelope) === false,
        String(device.Sync.localDurableHolds(envelope)));
}

report();
