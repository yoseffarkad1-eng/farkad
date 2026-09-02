// How an advance was paid, across every path it can travel.
//
//   node tests/method.test.mjs
//
// `advance.method` is the one field on a money record that no arithmetic reads: nothing
// adds it up, nothing refuses it, no total moves when it is lost - which is exactly why
// it goes missing quietly. So the only way to know it survived a journal, a flush, an
// acknowledgement, two reopens, another phone, a file and a restore is to send it down
// each of them and read the durable bytes at the far end.
//
// Four ways everywhere, because they fail differently: 'cash' and 'transfer', the only
// two the shipped form writes; NO method, which is every advance recorded before the
// field existed and every advance written today by a phone on an older build; and an
// unknown word, from a build that does not exist yet - still somebody's record of how
// they handed money over.
//
// NINE checks here are RED at 6ff9fd9, all in the last two suites: the v80 ledger cannot
// say how the money moved, and the boot mirror is writing entries without it on every
// phone at every open, into a record that is append-only and can never be edited.

import { makeDevice, makeCloud, settle } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

// The sync layer debounces before it sends; a test that does not wait past it is testing
// the debounce.
const TICK = 6;
const flushed = () => settle(TICK * 40);

// The four ways, in one fixed order. Every comparison below is against this object, so a
// path that INVENTS a method for the advance that never said how fails as loudly as one
// that loses a method somebody wrote down.
const EXPECTED = { cash: 'cash', transfer: 'transfer', none: null, future: 'cheque' };

function seed(device) {
    device.State.schedule.workers = [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 }
    ];
    device.State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
    device.State.save({ silent: true });
}

// Answer the dialogs the export and import paths open. Without these the handlers throw
// on a phone-shaped harness and the test measures the stub instead of the app.
function answering(device, answer = true) {
    const said = [];
    device.ctx.askTell = message => {
        said.push(typeof message === 'string' ? message : JSON.stringify(message));
        return Promise.resolve();
    };
    device.ctx.askConfirm = () => Promise.resolve(answer);
    device.ctx.openMigrationModal = () => {};
    return said;
}

// Written the way the form writes it: the record addAdvance builds, with the method set
// on it BEFORE the commit, so the journal entry and the saved schedule carry it together.
// addAdvance itself does not know the field exists.
function writeTheFourWays(device, date, amount) {
    const ids = {};
    Object.keys(EXPECTED).forEach(label => {
        const change = device.call('addAdvance', device.State.schedule,
            'w_01', date, amount, 'על חשבון');
        if (EXPECTED[label]) change.value.method = EXPECTED[label];
        given(`the ${label} advance is committed`, device.State.commit(change) === true);
        ids[label] = change.value.id;
    });
    return ids;
}

// What a set of records ACTUALLY says, keyed by the way it was paid. An absent field
// reads null and a present one reads its word, so "kept", "never had one" and "invented"
// are three answers rather than two.
function asWritten(advances, ids) {
    const out = {};
    Object.keys(ids).forEach(label => {
        const item = (advances || {})[ids[label]];
        out[label] = item && Object.prototype.hasOwnProperty.call(item, 'method')
            ? item.method : null;
    });
    return out;
}

function onDisk(device) {
    return JSON.parse(device.raw('scheduleData:v2'));
}

// The queue as the DISK holds it. The journal is a family of keys, not one record, and an
// edit that is only in memory is an edit a closed app loses.
function queuedAdvances(device) {
    const dump = device.dump();
    const out = {};
    Object.keys(dump)
        .filter(key => key.indexOf('farkad:outbox') === 0 && key.indexOf(':damaged') === -1)
        .forEach(key => {
            let parsed;
            try { parsed = JSON.parse(dump[key]); } catch (error) { return; }
            if (!parsed || typeof parsed !== 'object') return;
            const put = (path, value) => {
                if (String(path).indexOf('advances.') === 0) out[String(path).slice(9)] = value;
            };
            (parsed.ops || []).forEach(op => { if (op) put(op.path, op.value); });
            Object.keys(parsed.items || {}).forEach(path => put(path, parsed.items[path].value));
        });
    return out;
}

async function connected(device, cloud) {
    device.Sync.pushDelayMs = TICK;
    device.Sync.connect(cloud.adapter);
    await flushed();
}

// ================================================================ the reproduction
{
    suite('an advance paid in cash, sent, acknowledged, and the app closed');

    // The sequence as reported: record it, let it reach the cloud, let the queue empty,
    // close the app, open it again. One phone, one evening.
    const device = makeDevice({ deviceId: 'd_repro' });
    seed(device);
    device.setToday('2026-08-12');

    const change = device.call('addAdvance', device.State.schedule,
        'w_01', '2026-08-12', 500, 'על חשבון');
    change.value.method = 'cash';
    const id = change.value.id;
    check('the commit is accepted', device.State.commit(change) === true);
    check('and the way it was paid is on the record',
        device.State.schedule.advances[id].method === 'cash',
        JSON.stringify(device.State.schedule.advances[id]));

    const cloud = makeCloud();
    await connected(device, cloud);
    check('the queue empties', device.Sync.pendingCount() === 0,
        String(device.Sync.pendingCount()));
    check('and the cloud document holds the method',
        cloud.doc.advances[id].method === 'cash',
        JSON.stringify(cloud.doc.advances[id]));
    const reopened = makeDevice({ storage: device.dump(), deviceId: 'd_repro' });
    reopened.State.load();
    check('after a close and reopen the method is still there',
        (reopened.State.schedule.advances[id] || {}).method === 'cash',
        JSON.stringify(reopened.State.schedule.advances[id]));
}

// ================================================================ write and flush
{
    suite('the field write and the flush - all four ways');

    // Written with no cloud attached - a site with no signal - so the journal on the disk
    // is the only copy for a while, and the first place the field can go missing.
    const device = makeDevice({ deviceId: 'd_write' });
    seed(device);
    device.setToday('2026-08-12');
    const ids = writeTheFourWays(device, '2026-08-12', 500);
    same('the live record says exactly what was written',
        asWritten(device.State.schedule.advances, ids), EXPECTED);
    same('and so does the record on the disk',
        asWritten(onDisk(device).advances, ids), EXPECTED);
    same('the journal carries it before anything is sent',
        asWritten(queuedAdvances(device), ids), EXPECTED);

    // The wire gate. An extra field is not a problem: a phone one build behind will
    // receive this record, and refusing it would refuse the money.
    same('the validator passes all four untouched',
        device.call('advanceProblems', { advances: device.State.schedule.advances }), []);

    const cloud = makeCloud();
    await connected(device, cloud);
    same('the cloud document holds all four as written',
        asWritten(cloud.doc.advances, ids), EXPECTED);

    // The PAYLOAD, not the document: a document can be right because of a whole-document
    // write, while an ordinary edit is one field path and that is what must carry it.
    const sent = {};
    cloud.writes.forEach(write => {
        Object.keys(write.patch || {}).forEach(path => {
            if (path.indexOf('advances.') === 0) sent[path.slice(9)] = write.patch[path];
        });
        Object.assign(sent, (write.data || {}).advances || {});
    });
    same('and every write that went out carried it on the wire',
        asWritten(sent, ids), EXPECTED);
}

// ================================================================ ack and collection
{
    suite('acknowledgement and collection - all four ways');

    const device = makeDevice({ deviceId: 'd_ack' });
    seed(device);
    device.setToday('2026-08-12');
    const ids = writeTheFourWays(device, '2026-08-12', 250);
    const cloud = makeCloud();
    await connected(device, cloud);
    check('nothing is left pending', device.Sync.pendingCount() === 0,
        String(device.Sync.pendingCount()));
    const queueBytes = Object.keys(device.dump())
        .filter(key => key.indexOf('farkad:outbox') === 0)
        .map(key => device.raw(key)).join('\n');
    check('and no queue key still names any of the four',
        Object.keys(ids).every(label => !queueBytes.includes(ids[label])), queueBytes);

    // What "the disk holds it" means. Collection is not a counter: an operation is dropped
    // only once the saved schedule holds the value that was sent, and the method is part
    // of that value - so a record that has LOST it must not count as holding it.
    const stored = onDisk(device);
    const asSent = id => JSON.parse(JSON.stringify(stored.advances[id]));
    check('an operation is held when the record on the disk is the record that was sent',
        Object.keys(ids).every(label =>
            device.call('scheduleHoldsEntry', stored, 'advances.' + ids[label],
                asSent(ids[label])) === true),
        JSON.stringify(asWritten(stored.advances, ids)));
    const stripped = asSent(ids.transfer);
    delete stripped.method;
    check('and it is NOT held when the value has lost how the money moved',
        device.call('scheduleHoldsEntry', stored, 'advances.' + ids.transfer, stripped) === false,
        JSON.stringify(stripped));
    const invented = asSent(ids.none);
    invented.method = 'cash';
    check('nor when a method has been invented for the advance that never said',
        device.call('scheduleHoldsEntry', stored, 'advances.' + ids.none, invented) === false,
        JSON.stringify(invented));

    // Collected means gone for good: a reopen must not send any of them again. A resend
    // is not harmless - it overwrites whatever the other phones have since said.
    const reopened = makeDevice({ storage: device.dump(), deviceId: 'd_ack' });
    reopened.State.load();
    const before = cloud.writes.length;
    await connected(reopened, cloud);
    const resent = cloud.writes.slice(before)
        .map(write => Object.keys(write.patch || {}))
        .reduce((all, keys) => all.concat(keys), [])
        .filter(path => path.indexOf('advances.') === 0);
    same('and a reopen sends none of them again', resent, []);
    same('while the cloud still says how each was paid',
        asWritten(cloud.doc.advances, ids), EXPECTED);
}

// ================================================================ two reopens
{
    suite('two closes and two reopens - all four ways');

    const device = makeDevice({ deviceId: 'd_reopen' });
    seed(device);
    device.setToday('2026-08-12');
    const ids = writeTheFourWays(device, '2026-08-12', 400);

    // normaliseSchedule starts from an empty record and copies across what it recognises,
    // so a field it does not name disappears at the NEXT reopen, not this one: one reopen
    // proves the copy, two prove what the copy wrote back is itself readable.
    const first = makeDevice({ storage: device.dump(), deviceId: 'd_reopen' });
    first.State.load();
    same('the first reopen keeps all four in memory',
        asWritten(first.State.schedule.advances, ids), EXPECTED);
    same('and writes all four back to the disk',
        asWritten(onDisk(first).advances, ids), EXPECTED);
    const second = makeDevice({ storage: first.dump(), deviceId: 'd_reopen' });
    second.State.load();
    same('the second reopen still has all four',
        asWritten(second.State.schedule.advances, ids), EXPECTED);
    same('and the disk still does', asWritten(onDisk(second).advances, ids), EXPECTED);
}

// ================================================================ a second phone
{
    suite('a second device adopting the snapshot - all four ways');

    const first = makeDevice({ deviceId: 'd_first' });
    seed(first);
    first.setToday('2026-08-12');
    const ids = writeTheFourWays(first, '2026-08-12', 300);
    const cloud = makeCloud();
    await connected(first, cloud);

    // The other phone in somebody's pocket. It has never seen any of these records.
    const second = makeDevice({ deviceId: 'd_second' });
    second.State.load();
    await connected(second, cloud);
    same('the adopting phone holds all four as written',
        asWritten(second.State.schedule.advances, ids), EXPECTED);
    same('and has written all four to its own disk',
        asWritten(onDisk(second).advances, ids), EXPECTED);
    const later = makeDevice({ storage: second.dump(), deviceId: 'd_second' });
    later.State.load();
    same('and still has them after it is closed and opened',
        asWritten(later.State.schedule.advances, ids), EXPECTED);
}

// ================================================================ a backup file
{
    suite('a backup file, out and back in through the real file input - all four ways');

    const source = makeDevice({ deviceId: 'd_source' });
    seed(source);
    source.setToday('2026-08-12');
    const ids = writeTheFourWays(source, '2026-08-12', 550);
    answering(source, false);

    source.call('exportBackup');
    given('a file was handed to the browser', source.downloads.length === 1);
    const file = source.downloads[0];
    same('the file the person is handed says how each was paid',
        asWritten(JSON.parse(file.text).advances, ids), EXPECTED);

    // Opened on another phone through the handler the browser calls, with a real file on a
    // real change event - the file is the thing a person is actually holding.
    const target = makeDevice({ deviceId: 'd_target' });
    seed(target);
    answering(target, true);
    target.call('importBackup', target.fileEvent(file.name, file.text));
    await settle(200);
    same('the imported schedule says how each was paid',
        asWritten(target.State.schedule.advances, ids), EXPECTED);
    same('and so does the disk it was written to',
        asWritten(onDisk(target).advances, ids), EXPECTED);
}

// ================================================================ the rescue file
{
    suite('a raw recovery file, out and back in - all four ways');

    const broken = makeDevice({ deviceId: 'd_broken' });
    seed(broken);
    broken.setToday('2026-08-12');
    const ids = writeTheFourWays(broken, '2026-08-12', 150);
    answering(broken, false);

    // The reason the rescue file is not just a backup: an advance queued and never written
    // into the schedule record. The journal is the only copy of it, and of how it moved.
    const only = { id: 'a_only', workerId: 'w_01', date: '2026-08-13',
        amount: 700, note: 'רק בתור', method: 'transfer' };
    given('an advance is queued that the schedule record never got',
        broken.Sync.queueBatch([{ path: 'advances.a_only', value: only }]) === true);

    broken.call('exportRecoveryData');
    given('a rescue file was handed over', broken.downloads.length === 1);
    const file = broken.downloads[0];
    const payload = JSON.parse(file.text);
    given('it says what it is', payload.kind === 'farkad-recovery');
    same('the live schedule inside the file says how each was paid',
        asWritten(payload.liveSchedule.advances, ids), EXPECTED);
    const rescuer = makeDevice({ deviceId: 'd_rescuer' });
    seed(rescuer);
    answering(rescuer, true);
    rescuer.call('importBackup', rescuer.fileEvent(file.name, file.text));
    await settle(200);
    same('the rescued schedule says how each was paid',
        asWritten(rescuer.State.schedule.advances, ids), EXPECTED);
    same('and the rescuer wrote all four to its disk',
        asWritten(onDisk(rescuer).advances, ids), EXPECTED);
    check('the advance that only ever existed in the queue is rescued with its method',
        (rescuer.State.schedule.advances.a_only || {}).method === 'transfer',
        JSON.stringify(rescuer.State.schedule.advances.a_only));
}

// ================================================================ a whole-document restore
{
    suite('a whole-document restore - all four ways');

    const device = makeDevice({ deviceId: 'd_restore' });
    seed(device);
    device.setToday('2026-08-12');
    // Something to supersede, so this is a replacement and not a write onto an empty phone.
    writeTheFourWays(device, '2026-08-12', 900);
    const cloud = makeCloud();
    await connected(device, cloud);

    const ids = { cash: 'b_cash', transfer: 'b_transfer', none: 'b_none', future: 'b_future' };
    const document = {
        schemaVersion: 2,
        workers: [{ id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 }],
        places: [{ id: 'p_01', name: 'הרצליה', active: true }],
        days: { '2026-07-01': { plan: {}, actual: { w_01: { entries: [{ placeId: 'p_01' }] } } } },
        advances: {}
    };
    Object.keys(ids).forEach(label => {
        document.advances[ids[label]] = Object.assign({ id: ids[label], workerId: 'w_01',
            date: '2026-07-01', amount: 300, note: '' },
            EXPECTED[label] ? { method: EXPECTED[label] } : {});
    });
    const restored = device.call('normaliseSchedule', document);
    same('the document the restore will write says how each was paid',
        asWritten(restored.advances, ids), EXPECTED);

    // The gate the restore is held by: two documents differing ONLY in how the money moved
    // must not read as the same document, or a device reports holding what it does not.
    const otherwise = device.call('normaliseSchedule', JSON.parse(JSON.stringify(document)));
    otherwise.advances.b_cash.method = 'transfer';
    check('two documents differing only in a method are not the same document',
        device.call('replacementContent', restored)
        !== device.call('replacementContent', otherwise));
    const result = await device.Sync.replaceEverything(restored);
    check('the restore finished', result.ok === true, JSON.stringify(result));
    same('the disk holds all four as the file wrote them',
        asWritten(onDisk(device).advances, ids), EXPECTED);
    same('and so does the cloud document the other phones will read',
        asWritten(cloud.doc.advances, ids), EXPECTED);
    const reopened = makeDevice({ storage: device.dump(), deviceId: 'd_restore' });
    reopened.State.load();
    same('and after a close and reopen it still does',
        asWritten(reopened.State.schedule.advances, ids), EXPECTED);
}

// ================================================================ the ledger mirror
//
// NINE RED CHECKS BELOW, and they are the point of this file.
//
// The v80 ledger has no field for how the money moved: migrateAdvancesToLedger names the
// fields it writes and `method` is not among them, and foldAdvance and the legacy overlay
// in currentAdvances rebuild their records field by field and drop it too. The mirror in
// js/state.js is NOT gated by LEDGER_WRITES - it runs at every open, on every phone - so
// entries saying how much and to whom and never how are being written right now, and an
// entry is written once and can never be edited afterwards. No screen is wrong today,
// because js/ui/reports.js still reads advancesFor; the day the read path moves onto the
// fold, every advance goes back to a bare 'מקדמה' on a build whose legacy record still
// knows the answer.
{
    suite('the ledger mirror - all four ways');

    const device = makeDevice({ deviceId: 'd_ledger' });
    seed(device);
    device.setToday('2026-08-12');
    const ids = writeTheFourWays(device, '2026-08-12', 500);

    // The mirror runs inside State.load(), after the disk is read and before the first
    // render, so a reopen is the only honest way to make it happen.
    const booted = makeDevice({ storage: device.dump(), deviceId: 'd_ledger' });
    booted.State.load();
    // An entry is found by the advance it is about, never by a minted id.
    const entryIn = (held, label) => Object.keys(held || {}).map(key => held[key])
        .filter(entry => String(entry.advanceId) === ids[label])[0] || {};
    const entries = booted.State.schedule.ledger.advances;
    given('the mirror wrote an entry for each of the four',
        Object.keys(ids).every(label => entryIn(entries, label).kind === 'given'),
        JSON.stringify(Object.keys(entries)));

    // Non-destructive by design, which is what makes the loss survivable for now: the
    // legacy field is still the authority every screen reads.
    same('the legacy record still says how each was paid',
        asWritten(booted.State.schedule.advances, ids), EXPECTED);
    const stored = onDisk(booted).ledger.advances;
    const storedFor = label => entryIn(stored, label);
    check('the entry the mirror wrote says the money was handed over in cash',
        storedFor('cash').method === 'cash', JSON.stringify(storedFor('cash')));
    check('the entry the mirror wrote says the money went by transfer',
        storedFor('transfer').method === 'transfer', JSON.stringify(storedFor('transfer')));
    check('the entry the mirror wrote keeps a word this build does not draw',
        storedFor('future').method === 'cheque', JSON.stringify(storedFor('future')));
    check('and nothing is invented for the advance that never said how',
        !Object.prototype.hasOwnProperty.call(storedFor('none'), 'method'),
        JSON.stringify(storedFor('none')));

    const cloud = makeCloud();
    await connected(booted, cloud);
    const remote = ((cloud.doc.ledger || {}).advances) || {};
    const remoteFor = label => entryIn(remote, label);
    given('the mirror reached the cloud',
        remoteFor('cash').kind === 'given', JSON.stringify(Object.keys(remote)));
    check('and the entry the other two phones receive says it too',
        remoteFor('cash').method === 'cash', JSON.stringify(remoteFor('cash')));

    // The parity line on the settings screen compares the man, the day and the amount -
    // the numbers that decide what somebody is handed. It is right not to compare more,
    // and it is why this loss is invisible on the device it happens on.
    check('and the parity check cannot see any of this, by design',
        booted.call('ledgerAgreesWithAdvances', booted.State.schedule).agrees === true,
        JSON.stringify(booted.call('ledgerAgreesWithAdvances', booted.State.schedule)));
}

{
    suite('the fold, given an entry that does record how the money moved');

    // A phone on a build that records the method on the ENTRY, which the wire already
    // accepts: ledgerEntryProblems ignores extra fields and normaliseSchedule carries an
    // entry through whole. So it arrives, is stored, and is dropped by the projection.
    const document = {
        schemaVersion: 2,
        workers: [{ id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 }],
        places: [{ id: 'p_01', name: 'הרצליה', active: true }],
        days: {},
        advances: {
            a_1: { id: 'a_1', workerId: 'w_01', date: '2026-08-12', amount: 500,
                note: '', method: 'cash' },
            a_2: { id: 'a_2', workerId: 'w_01', date: '2026-08-13', amount: 200, note: '' },
            // The compatibility case, and the one every phone is in today: the entry the
            // boot mirror wrote says nothing about how the money moved, and the legacy
            // field is the only place the answer exists.
            a_3: { id: 'a_3', workerId: 'w_01', date: '2026-08-14', amount: 400,
                note: '', method: 'transfer' }
        },
        ledger: { advances: {
            le_1: { id: 'le_1', advanceId: 'a_1', kind: 'given', workerId: 'w_01',
                date: '2026-08-12', amount: 500, note: '', method: 'transfer',
                at: '2026-08-12T10:00:00.000Z', by: 'd_future' },
            le_2: { id: 'le_2', advanceId: 'a_2', kind: 'given', workerId: 'w_01',
                date: '2026-08-13', amount: 200, note: '', method: 'cheque',
                at: '2026-08-13T10:00:00.000Z', by: 'd_future' },
            // A correction that moves the amount and says nothing about the method: the
            // commonest correction there is, and the one that must not quietly retire a
            // fact it never mentioned.
            le_3: { id: 'le_3', advanceId: 'a_2', kind: 'corrected', amount: 250,
                at: '2026-08-14T10:00:00.000Z', by: 'd_future' },
            le_4: { id: 'le_4', advanceId: 'a_3', kind: 'given', workerId: 'w_01',
                date: '2026-08-14', amount: 400, note: '',
                at: '2026-08-14T11:00:00.000Z', by: 'd_old' }
        } },
        updatedAt: '2026-08-14T10:00:00.000Z', updatedBy: 'd_future'
    };

    const cloud = makeCloud({ doc: document });
    const device = makeDevice({ deviceId: 'd_fold' });
    device.State.load();
    await connected(device, cloud);

    const held = device.State.schedule.ledger.advances;
    given('the entries arrived and were kept whole',
        held.le_1.method === 'transfer' && held.le_2.method === 'cheque',
        JSON.stringify(held.le_1));
    given('and are on this phone\'s disk',
        (onDisk(device).ledger.advances.le_1 || {}).method === 'transfer');

    const folded = device.call('foldLedger', device.State.schedule);
    check('the fold carries the method a given entry does record',
        (folded.a_1 || {}).method === 'transfer', JSON.stringify(folded.a_1));
    check('and a correction leaves the method the handover was recorded with standing',
        (folded.a_2 || {}).method === 'cheque', JSON.stringify(folded.a_2));

    // What every screen should read, in the words of its own comment: "the ledger's
    // answer, with anything ONLY the old field knows about laid in beside it". Both
    // halves of that sentence are load-bearing, and they are two different claims:
    //
    //   a_1 - the entry and the legacy field disagree. The entry is the newer statement
    //         and this build wrote it, so the fold's word wins and the old field does not
    //         overwrite it. A fix that copies the legacy method over every folded record
    //         passes the a_3 check below and fails this one.
    //   a_3 - the entry says nothing, which is what EVERY entry on EVERY phone says
    //         today. Here the legacy field is the only source there is.
    const current = device.call('currentAdvances', device.State.schedule);
    check('currentAdvances prefers the entry\'s own word over the legacy field',
        (current.a_1 || {}).method === 'transfer', JSON.stringify(current.a_1));
    check('and lays the legacy word in beside an entry that does not carry one',
        (current.a_3 || {}).method === 'transfer', JSON.stringify(current.a_3));

    // And the branch a phone that has never run the mirror takes: no entries at all, so
    // every advance falls to the legacy overlay, which rebuilds the record field by field
    // and does not name this one.
    const legacyOnly = device.call('normaliseSchedule', {
        schemaVersion: 2, workers: document.workers, places: document.places,
        days: {}, advances: document.advances
    });
    given('this schedule has no entries at all',
        Object.keys((legacyOnly.ledger || {}).advances || {}).length === 0);
    const overlaid = device.call('currentAdvances', legacyOnly);
    check('currentAdvances keeps the method of an advance the ledger never heard of',
        (overlaid.a_1 || {}).method === 'cash', JSON.stringify(overlaid.a_1));
    check('and invents nothing for the one that never said how',
        !Object.prototype.hasOwnProperty.call(overlaid.a_2 || {}, 'method'),
        JSON.stringify(overlaid.a_2));
}

report();
