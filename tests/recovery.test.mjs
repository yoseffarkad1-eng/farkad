// The recovery path, asked the questions Phase 3 did not ask.
//
//   node tests/recovery.test.mjs
//
// Every check here describes something a person loses. The rescue file is the last thing
// standing between somebody and an evening of work that no longer exists anywhere, and
// "the export ran" is not the same claim as "what came out of it rebuilds the same week
// the phone was showing".
//
// These run against the DISK the way the app leaves it - staged raw records, the real
// export, the real file input - because every fault below survived a test that reached
// past one of those three.

import { makeDevice, makeCloud, settle, sharedStore } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const TICK = 6;
const wait = () => settle(TICK * 5);
const PATH = 'days.2026-08-10.actual.w_01';

const WORKERS = [
    { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 },
    { id: 'w_02', name: 'שרה', active: true, dailyRate: 350, hourlyRate: 0 }
];
const PLACES = [
    { id: 'p_01', name: 'הרצליה', active: true },
    { id: 'p_02', name: 'תל אביב', active: true }
];

function schedule(days) {
    return {
        schemaVersion: 2,
        workers: WORKERS.map(worker => Object.assign({}, worker)),
        places: PLACES.map(place => Object.assign({}, place)),
        days: days || {},
        advances: {},
        updatedAt: '2026-08-01T00:00:00.000Z',
        updatedBy: 'd_old'
    };
}

function seed(device) {
    device.State.schedule.workers = WORKERS.map(worker => Object.assign({}, worker));
    device.State.schedule.places = PLACES.map(place => Object.assign({}, place));
    device.State.save({ silent: true });
    return device;
}

// One site on a day, REPLACING whatever was there - assignPlace adds and is idempotent,
// so the site that is already there has to be taken off with unassignPlace first.
function put(device, path, placeId) {
    const [, date, layer, workerId] = path.split('.');
    device.call('entriesFor', device.State.schedule, date, workerId, layer)
        .slice()
        .filter(entry => entry.placeId !== placeId)
        .forEach(entry => device.State.commit(device.call('unassignPlace',
            device.State.schedule, date, workerId, layer, entry.placeId)));
    return device.State.commit(device.call('assignPlace',
        device.State.schedule, date, workerId, layer, placeId));
}

const connected = async (device, cloud) => {
    device.Sync.pushDelayMs = TICK;
    device.Sync.connect(cloud.adapter);
    await settle(TICK * 30);
};

function batch(batchId, ops) {
    return JSON.stringify({ batchId, at: '2026-08-10T06:00:00.000Z', ops });
}

function dayValue(placeId) {
    return { entries: [{ placeId }] };
}

function placeOf(record) {
    const entries = (record && record.entries) || [];
    return entries.length > 0 ? entries[0].placeId : null;
}

// A device that answers its own dialogs, so an import can be driven end to end.
function answering(device, options = {}) {
    const said = [];
    const asked = [];
    device.ctx.askTell = message => {
        said.push(typeof message === 'string' ? message : JSON.stringify(message));
        return Promise.resolve();
    };
    device.ctx.askConfirm = question => {
        asked.push(question);
        return Promise.resolve(options.answer !== false);
    };
    device.ctx.askText = question => Promise.resolve(String((question || {}).title || ''));
    device.ctx.openMigrationModal = () => {};
    return { said, asked };
}

// What the app would REBUILD from a rescue file, without going near the UI. The recovery
// import is the only caller of this in production; here it is asked directly so that the
// projection can be interrogated on records a test staged by hand.
function rebuild(device, payload) {
    return device.call('readBackupFile', payload);
}

// ================================================================ P0-1
//
// The recovery import wrote a SECOND queue algorithm. It sorted storage keys lexically,
// sorted only inside each batch, threw away opId and `after`, and applied every operation
// it could parse. So which value a rescue file rebuilds depended on how two random batch
// ids happened to sort - a coin toss, decided per file, over whose day is on the sheet.
{
    suite('R1: a correction that saw the value it replaced wins the rebuild too');

    const device = makeDevice({ deviceId: 'd_reader' });
    seed(device);

    // The stale operation lives under a LEXICALLY LATER key than the correction. Nothing
    // about that is unusual - batch ids are random - and it is the whole of the fault.
    const records = {
        'scheduleData:v2': JSON.stringify(schedule()),
        'farkad:outbox': JSON.stringify({ seq: 2, items: {} }),
        'farkad:outbox:op:zzzzzzzzzzzz': batch('zzzzzzzzzzzz', [
            { opId: 'opold1', path: PATH, value: dayValue('p_01'), seq: 1, after: [] }
        ]),
        'farkad:outbox:op:aaaaaaaaaaaa': batch('aaaaaaaaaaaa', [
            { opId: 'opnew1', path: PATH, value: dayValue('p_02'), seq: 2, after: ['opold1'] }
        ])
    };

    const loaded = rebuild(device, { kind: 'farkad-recovery', records });
    const rebuilt = device.call('entriesFor', loaded.schedule, '2026-08-10', 'w_01', 'actual');

    check('the operation that named the other as superseded is the one that stands',
        rebuilt.length === 1 && rebuilt[0].placeId === 'p_02',
        JSON.stringify({ rebuilt, replayed: loaded.summary }));
}

{
    suite('R1: the hidden loser does not come back through a rescue file');

    const device = makeDevice({ deviceId: 'd_reader2' });
    seed(device);

    // Three operations for one path, written in an order no sort recovers: the winner is
    // the one that names both of the others, and it sits in the middle lexically.
    const records = {
        'scheduleData:v2': JSON.stringify(schedule()),
        'farkad:outbox': JSON.stringify({ seq: 3, items: {} }),
        'farkad:outbox:op:aaa1': batch('aaa1', [
            { opId: 'opa', path: PATH, value: dayValue('p_01'), seq: 1, after: [] }
        ]),
        'farkad:outbox:op:mmm2': batch('mmm2', [
            { opId: 'opc', path: PATH, value: dayValue('p_02'), seq: 3, after: ['opa', 'opb'] }
        ]),
        'farkad:outbox:op:zzz3': batch('zzz3', [
            { opId: 'opb', path: PATH, value: dayValue('p_01'), seq: 2, after: ['opa'] }
        ])
    };

    const loaded = rebuild(device, { kind: 'farkad-recovery', records });
    const rebuilt = device.call('entriesFor', loaded.schedule, '2026-08-10', 'w_01', 'actual');
    check('the superseded values stay superseded',
        rebuilt.length === 1 && rebuilt[0].placeId === 'p_02',
        JSON.stringify(rebuilt));
}

{
    suite('R1: half a damaged batch is never applied');

    const device = makeDevice({ deviceId: 'd_reader3' });
    seed(device);

    // A roster commit is several paths that only mean anything together. One of them is
    // unreadable, so the record is unreadable - the batch is immutable and there is no
    // such thing as most of it.
    const records = {
        'scheduleData:v2': JSON.stringify(schedule()),
        'farkad:outbox': JSON.stringify({ seq: 2, items: {} }),
        'farkad:outbox:op:b1': batch('b1', [
            { opId: 'opgood', path: 'roster.workers.w_zz',
              value: { id: 'w_zz', name: 'חדש', active: true, dailyRate: 0, hourlyRate: 0 },
              seq: 1, after: [] },
            // A layer nobody writes. journalEntryProblems refuses it, which is what makes
            // the record unreadable rather than partly usable.
            { opId: 'opbad', path: 'days.2026-08-10.nonsense.w_01',
              value: dayValue('p_01'), seq: 2, after: [] }
        ])
    };

    const loaded = rebuild(device, { kind: 'farkad-recovery', records });
    check('the readable half of an unreadable batch is not applied either',
        !(loaded.schedule.workers || []).some(worker => worker && worker.id === 'w_zz'),
        JSON.stringify((loaded.schedule.workers || []).map(worker => worker.id)));
    check('and the file says a record could not be read',
        Array.isArray(loaded.unread) && loaded.unread.length > 0,
        JSON.stringify(loaded.unread));
}

{
    suite('R1: an older build’s item and a v87 operation are judged by one rule');

    const device = makeDevice({ deviceId: 'd_reader4' });
    seed(device);

    // The legacy item is NEWER. Assuming an item without an id must be older - because an
    // operation exists beside it - is how an old client's correction gets overruled.
    const records = {
        'scheduleData:v2': JSON.stringify(schedule()),
        'farkad:outbox': JSON.stringify({
            seq: 9,
            items: { [PATH]: { value: dayValue('p_02'), seq: 9, sent: false } }
        }),
        'farkad:outbox:op:aaa': batch('aaa', [
            { opId: 'opold', path: PATH, value: dayValue('p_01'), seq: 4, after: [] }
        ])
    };

    const loaded = rebuild(device, { kind: 'farkad-recovery', records });
    const rebuilt = device.call('entriesFor', loaded.schedule, '2026-08-10', 'w_01', 'actual');
    check('the newer legacy item is not overruled by an older operation',
        rebuilt.length === 1 && rebuilt[0].placeId === 'p_02', JSON.stringify(rebuilt));
}

{
    suite('R1: two operations in the same millisecond resolve the same way every time');

    // Neither has seen the other, so nothing but a rule decides it - and the rule has to
    // be the SAME rule the live queue uses, or the phone and its rescue file disagree
    // about whose day it is.
    const answers = [];
    for (let run = 0; run < 6; run += 1) {
        const device = makeDevice({ deviceId: 'd_tie' + run });
        seed(device);
        const records = {
            'scheduleData:v2': JSON.stringify(schedule()),
            'farkad:outbox': JSON.stringify({ seq: 5, items: {} }),
            'farkad:outbox:op:one': batch('one', [
                { opId: 'aaaa1', path: PATH, value: dayValue('p_01'), seq: 5, after: [] }
            ]),
            'farkad:outbox:op:two': batch('two', [
                { opId: 'bbbb2', path: PATH, value: dayValue('p_02'), seq: 5, after: [] }
            ])
        };
        const loaded = rebuild(device, { kind: 'farkad-recovery', records });
        answers.push(placeOf(((loaded.schedule.days || {})['2026-08-10'] || {}).actual
            ? loaded.schedule.days['2026-08-10'].actual.w_01 : null));
    }
    check('every run agrees', new Set(answers).size === 1, JSON.stringify(answers));

    // And it agrees with the LIVE queue, asked of the same bytes.
    const live = makeDevice({
        deviceId: 'd_tie_live',
        storage: {
            'scheduleData:v2': JSON.stringify(schedule()),
            'farkad:outbox': JSON.stringify({ seq: 5, items: {} }),
            'farkad:outbox:op:one': batch('one', [
                { opId: 'aaaa1', path: PATH, value: dayValue('p_01'), seq: 5, after: [] }
            ]),
            'farkad:outbox:op:two': batch('two', [
                { opId: 'bbbb2', path: PATH, value: dayValue('p_02'), seq: 5, after: [] }
            ])
        }
    });
    live.State.load();
    const onDevice = live.call('entriesFor', live.State.schedule, '2026-08-10', 'w_01', 'actual');
    check('and the rescue file agrees with the phone it came from',
        answers[0] === (onDevice[0] || {}).placeId,
        JSON.stringify({ file: answers[0], phone: onDevice }));
}

{
    suite('R1: a real export and import keep the correction, whatever the ids are');

    // The same question through the whole path: two tabs, a correction, the real export,
    // the real file input, and a close and reopen on the far side.
    const cloud = makeCloud({ online: false });
    const shared = sharedStore();
    const a = makeDevice({ sharedStorage: shared, deviceId: 'd_a' });
    seed(a);
    const b = makeDevice({ sharedStorage: shared, deviceId: 'd_b' });
    b.State.load();

    put(a, PATH, 'p_01');
    await wait();
    // The disk will not take a removal, so the superseded operation stays where it is -
    // which is the state this is about. A queue that had collected the loser would have
    // nothing left to get wrong.
    a.blockRemoval(key => String(key).indexOf('farkad:outbox') === 0);
    b.blockRemoval(key => String(key).indexOf('farkad:outbox') === 0);
    put(b, PATH, 'p_02');
    await wait();
    given('both operations are on the disk',
        Object.keys(a.dump()).filter(key => key.indexOf('farkad:outbox:op:') === 0).length === 2,
        JSON.stringify(Object.keys(a.dump()).filter(key => key.indexOf('farkad:outbox') === 0)));

    answering(a);
    a.call('exportRecoveryData');
    given('a file was produced', a.downloads.length === 1);

    const rescuer = makeDevice({ deviceId: 'd_rescuer' });
    seed(rescuer);
    answering(rescuer);
    rescuer.call('importBackup',
        rescuer.fileEvent(a.downloads[0].name, a.downloads[0].text));
    await settle(80);

    const here = rescuer.call('entriesFor', rescuer.State.schedule, '2026-08-10', 'w_01', 'actual');
    check('the correction is what arrived', here.length === 1 && here[0].placeId === 'p_02',
        JSON.stringify(here));

    const reopened = makeDevice({ storage: rescuer.dump(), deviceId: 'd_rescuer' });
    reopened.State.load();
    const after = reopened.call('entriesFor', reopened.State.schedule, '2026-08-10', 'w_01', 'actual');
    check('and it is still the correction after a close and reopen',
        after.length === 1 && after[0].placeId === 'p_02', JSON.stringify(after));
}

// ================================================================ P0-2
{
    suite('R2: the rescue file carries the queue from every slot, not the active one');

    // A damaged mark in the first slot moves recording to the next slot along. The
    // OPERATIONS under the first slot are untouched by that - they are their own records -
    // and they are still part of what this device owes. An export that walks only the
    // active slot's family leaves them behind, and they exist nowhere else.
    const staged = {
        'farkad:deviceId': 'd_split',
        'scheduleData:v2': JSON.stringify(schedule()),
        // The mark will not read as a queue, so the slot is quarantined and recording
        // continues in active1.
        'farkad:outbox': '{"seq":4,"items":{"days.2026-08-10',
        'farkad:outbox:op:slot0batch': batch('slot0batch', [
            { opId: 'opslot0', path: PATH, value: dayValue('p_01'), seq: 1, after: [] }
        ])
    };

    const device = makeDevice({ storage: staged, deviceId: 'd_split' });
    device.State.load();
    device.global('Recovery').acknowledge();
    given('recording moved to the next slot',
        device.Sync.activeOutboxKey() === 'farkad:outbox:active1',
        String(device.Sync.activeOutboxKey()));
    given('and the first slot’s operation is still part of the journal',
        device.Sync.physicalOperations().some(op => op.opId === 'opslot0'),
        JSON.stringify(device.Sync.physicalOperations().map(op => op.opId)));

    device.Sync.queueBatch([{ path: 'days.2026-08-11.actual.w_02', value: dayValue('p_02') }]);
    given('there is an operation in the new slot too',
        device.Sync.physicalOperations().length === 2,
        JSON.stringify(device.Sync.physicalOperations().map(op => op.path)));

    const held = device.global('Recovery').rawRecords();
    check('the batch under the damaged slot is in the export, byte for byte',
        held['farkad:outbox:op:slot0batch'] === staged['farkad:outbox:op:slot0batch'],
        JSON.stringify(Object.keys(held)));
    check('and so is the one under the slot recording moved to',
        Object.keys(held).some(key => key.indexOf('farkad:outbox:active1:op:') === 0
            && String(held[key]).includes('2026-08-11')),
        JSON.stringify(Object.keys(held)));

    // The proof that matters: the far side rebuilds the same week.
    answering(device);
    device.call('exportRecoveryData');
    const rescuer = makeDevice({ deviceId: 'd_split_rescuer' });
    seed(rescuer);
    answering(rescuer);
    rescuer.call('importBackup',
        rescuer.fileEvent(device.downloads[0].name, device.downloads[0].text));
    await settle(80);

    check('both days arrive on the rescuing phone',
        rescuer.call('entriesFor', rescuer.State.schedule, '2026-08-10', 'w_01', 'actual').length === 1
        && rescuer.call('entriesFor', rescuer.State.schedule, '2026-08-11', 'w_02', 'actual').length === 1,
        JSON.stringify(Object.keys(rescuer.State.schedule.days || {})));

    const reopened = makeDevice({ storage: rescuer.dump(), deviceId: 'd_split_rescuer' });
    reopened.State.load();
    check('and a close and reopen shows the same two',
        Object.keys(reopened.State.schedule.days || {}).sort().join() === '2026-08-10,2026-08-11',
        JSON.stringify(Object.keys(reopened.State.schedule.days || {})));
}

{
    suite('R2: the export does not sweep up records that are not this app’s');

    // ":damaged" is a suffix this app uses; it is not a licence to copy anything on the
    // origin whose name happens to contain it into a file somebody will send by WhatsApp.
    const device = makeDevice({ deviceId: 'd_sweep' });
    seed(device);
    device.putRaw('someoneelse:damaged', 'not ours');
    device.putRaw('farkad:outbox:damaged', '{"seq":1,"items":{"days');

    const held = device.global('Recovery').rawRecords();
    check('a foreign key is not in the file',
        held['someoneelse:damaged'] === undefined, JSON.stringify(Object.keys(held)));
    check('while this app’s quarantine copy is',
        held['farkad:outbox:damaged'] === '{"seq":1,"items":{"days',
        JSON.stringify(Object.keys(held)));
}

// ================================================================ P0-3
{
    suite('R3: a handover that could not be written down is not reported as written');

    // Every route forgetLocalOrigin has, refused at once: the generation will not move,
    // the uncertainty flag will not store, and removing the mine facts throws - which is
    // what takes localStorage away entirely. A device that cannot READ cannot prove a key
    // is absent, and "I could not read it" was being counted as "it is gone".
    const device = makeDevice({ deviceId: 'd_liar' });
    seed(device);
    const mine = device.State.nextWorkerId();
    device.State.schedule.workers.push(
        { id: mine, name: 'חדש', active: true, dailyRate: 300, hourlyRate: 0 });
    device.State.save({ silent: true });
    given('he is provably this phone’s own',
        device.Sync.provenLocalOnly('workers', mine) === true);
    const genBefore = device.raw('farkad:prov:gen');
    const mineKey = device.Store.keys().filter(key => key.indexOf('farkad:prov:mine:') === 0)[0];
    given('and the fact is on the disk', typeof mineKey === 'string');

    answering(device);
    device.setQuota(key => String(key).indexOf('farkad:prov:') === 0);
    device.throwOnRemove(key => String(key).indexOf('farkad:prov:') === 0);

    device.call('exportRecoveryData');

    check('the file was still handed over', device.downloads.length === 1,
        JSON.stringify(device.downloads.map(file => file.name)));
    const file = JSON.parse(device.downloads[0].text);
    check('and it says the handover was NOT written down',
        file.handoverRecorded === false, String(file.handoverRecorded));
    check('the raw evidence is in it all the same',
        Boolean(file.records) && Object.keys(file.records).length > 0,
        JSON.stringify(Object.keys(file.records || {})));

    // The disk heals and the app opens again.
    //
    // Nothing durable could be written while it was refusing, so there is no record of
    // the handover for this session to find - and no honest way to make one. That is not
    // a hole to be papered over with a message: it is the reason permanent deletion is
    // shipped OFF, and the two checks below say so in the only way a test can.
    const reopened = makeDevice({ storage: device.dump(), deviceId: 'd_liar' });
    reopened.State.load();
    check('permanent deletion is unavailable, which is the whole of what saves this',
        reopened.call('deletionBlockers', mine)
            .includes('מחיקה סופית מושבתת בגרסה הזו'),
        JSON.stringify(reopened.call('deletionBlockers', mine)));
    check('and with the gate open this device WOULD destroy him - so it stays shut',
        (() => {
            const open = makeDevice({
                storage: device.dump(), deviceId: 'd_liar', flags: { permanentDeletion: true }
            });
            open.State.load();
            return open.call('deletionBlockers', mine).length === 0;
        })(),
        JSON.stringify({ gen: reopened.raw('farkad:prov:gen'), was: genBefore }));
}

{
    suite('R3: the receiving phone is told the handover was never recorded');

    const rescuer = makeDevice({ deviceId: 'd_warned' });
    seed(rescuer);
    const { said } = answering(rescuer);

    rescuer.call('importBackup', rescuer.fileEvent('farkad-recovery.json', JSON.stringify({
        kind: 'farkad-recovery',
        handoverRecorded: false,
        records: { 'scheduleData:v2': JSON.stringify(schedule({
            '2026-08-10': { plan: {}, actual: { w_01: dayValue('p_01') } }
        })) }
    })));
    await settle(80);

    check('the day arrived',
        rescuer.call('entriesFor', rescuer.State.schedule, '2026-08-10', 'w_01', 'actual').length === 1,
        JSON.stringify(Object.keys(rescuer.State.schedule.days || {})));
    check('and the person was told the source could not record the handover',
        said.some(message => message.includes('לא נרשם')), JSON.stringify(said));
    check('nobody in it can be proved local-only here',
        rescuer.Sync.provenLocalOnly('workers', 'w_01') === false);
}

// ================================================================ P0-4
{
    suite('R4: the export does not take half of one moment and half of another');

    // Two tabs. The exporter reads the schedule, the other tab saves a newer edit and
    // collects the operation that carried it, and only then does the exporter read the
    // queue. The file then holds a schedule from before the edit and no operation that
    // could put it back - and the phone it came from has the edit.
    const shared = sharedStore();
    const a = makeDevice({ sharedStorage: shared, deviceId: 'd_torn_a' });
    seed(a);
    const b = makeDevice({ sharedStorage: shared, deviceId: 'd_torn_b' });
    b.State.load();
    answering(a);

    put(a, PATH, 'p_01');
    await wait();

    // The moment between the exporter's two reads, spelled exactly: the other tab
    // commits a day AND lets the queue collect the operation behind it, so the newer
    // edit exists only in the schedule record from here on.
    // The hook is one-shot, so it re-arms itself until the read it is waiting for.
    let fired = false;
    const armFor = key => {
        a.ctx.localStorage.interleave(read => {
            if (String(read) !== key) { armFor(key); return; }
            fired = true;
            put(b, 'days.2026-08-11.actual.w_02', 'p_02');
            b.Sync.markAcknowledged(b.Sync.physicalOperations()
                .filter(op => op.path === 'days.2026-08-11.actual.w_02')
                .map(op => op.opId));
            b.Sync.collectQueueGarbage();
        });
    };
    armFor('scheduleData:v2');

    a.call('exportRecoveryData');
    given('the other tab did get in between the two reads', fired === true);

    const onPhone = (() => {
        const reopened = makeDevice({ storage: a.dump(), deviceId: 'd_torn_a' });
        reopened.State.load();
        return Object.keys(reopened.State.schedule.days || {}).sort().join();
    })();

    const rescuer = makeDevice({ deviceId: 'd_torn_rescuer' });
    seed(rescuer);
    answering(rescuer);
    rescuer.call('importBackup', rescuer.fileEvent(a.downloads[0].name, a.downloads[0].text));
    await settle(80);

    const file = JSON.parse(a.downloads[0].text);
    check('what the file rebuilds is what the phone actually holds',
        Object.keys(rescuer.State.schedule.days || {}).sort().join() === onPhone,
        JSON.stringify({
            file: Object.keys(rescuer.State.schedule.days || {}).sort(),
            phone: onPhone,
            stable: file.stable
        }));
}

// ================================================================ P0-5
{
    suite('R5: a restore the person asked for is not left in the file as inert bytes');

    // The device was told the restore happened. It is on the disk as a pending
    // transaction and has not been applied - which is exactly the state a held device is
    // in - and the rescue file carries it. Falling back to the older schedule beside it
    // undoes, silently, the thing the person pressed a button for.
    const restored = schedule({ '2026-07-01': { plan: {}, actual: { w_01: dayValue('p_01') } } });
    const device = makeDevice({ deviceId: 'd_pending' });
    seed(device);
    given('a restore can be prepared', device.Sync.prepareReplace(restored, false) === true);
    const envelope = device.raw('farkad:pendingReplace');
    given('and it is on the disk', typeof envelope === 'string');

    const reader = makeDevice({ deviceId: 'd_pending_reader' });
    seed(reader);
    const loaded = rebuild(reader, {
        kind: 'farkad-recovery',
        records: {
            'scheduleData:v2': JSON.stringify(schedule({
                '2026-08-10': { plan: {}, actual: { w_01: dayValue('p_02') } }
            })),
            'farkad:pendingReplace': envelope
        }
    });

    check('the replacement the person asked for is what the file rebuilds',
        Object.keys(loaded.schedule.days || {}).sort().join() === '2026-07-01',
        JSON.stringify(Object.keys(loaded.schedule.days || {})));
    check('and the summary says a restore was outstanding',
        String(loaded.summary).includes('שחזור'), String(loaded.summary));
}

{
    suite('R5: a cancelled restore is not carried out by the rescue instead');

    const device = makeDevice({ deviceId: 'd_cancelled' });
    seed(device);
    device.Sync.prepareReplace(schedule({ '2026-07-01': { plan: {}, actual: {} } }), false);
    device.Sync.cancelPreparedReplace();
    const cancelled = device.raw('farkad:pendingReplace');

    const reader = makeDevice({ deviceId: 'd_cancelled_reader' });
    seed(reader);
    const records = {
        'scheduleData:v2': JSON.stringify(schedule({
            '2026-08-10': { plan: {}, actual: { w_01: dayValue('p_02') } }
        }))
    };
    if (cancelled !== null) records['farkad:pendingReplace'] = cancelled;

    const loaded = rebuild(reader, { kind: 'farkad-recovery', records });
    check('the schedule on the disk is what stands',
        Object.keys(loaded.schedule.days || {}).sort().join() === '2026-08-10',
        JSON.stringify(Object.keys(loaded.schedule.days || {})));
}

{
    suite('R5: a damaged pending record is reported, never guessed at');

    const reader = makeDevice({ deviceId: 'd_damaged_pending' });
    seed(reader);
    const loaded = rebuild(reader, {
        kind: 'farkad-recovery',
        records: {
            'scheduleData:v2': JSON.stringify(schedule({
                '2026-08-10': { plan: {}, actual: { w_01: dayValue('p_02') } }
            })),
            'farkad:pendingReplace': '{"version":2,"phase":"prep'
        }
    });

    check('the readable schedule is used',
        Object.keys(loaded.schedule.days || {}).sort().join() === '2026-08-10',
        JSON.stringify(Object.keys(loaded.schedule.days || {})));
    check('and the unreadable transaction is named',
        (loaded.unread || []).some(line => String(line).includes('pendingReplace')),
        JSON.stringify(loaded.unread));
}

// ================================================================ P1: decisions
{
    suite('R6: a rescued schedule and its unanswered decisions land together or not at all');

    // The decisions belong to THIS schedule. A stale list under the same key - left by
    // whatever was on the phone before - must not be adopted as though it described the
    // week that just arrived.
    const rescuer = makeDevice({
        deviceId: 'd_decisions',
        storage: { 'scheduleData:migrationIssues': JSON.stringify([
            { kind: 'unknown-place', value: 'משהו ישן', message: 'ישן' }
        ]) }
    });
    seed(rescuer);
    answering(rescuer);

    rescuer.call('importBackup', rescuer.fileEvent('farkad-recovery.json', JSON.stringify({
        kind: 'farkad-recovery',
        pendingDecisions: [],
        records: { 'scheduleData:v2': JSON.stringify(schedule({
            '2026-08-10': { plan: {}, actual: { w_01: dayValue('p_01') } }
        })) }
    })));
    await settle(80);

    check('the stale decision from the phone before is not adopted',
        rescuer.State.migrationIssues.length === 0,
        JSON.stringify(rescuer.State.migrationIssues));
    // The record on the disk carries the fingerprint of the schedule it describes now, so
    // a list left by whatever was on this phone before cannot attach itself to the week
    // that just arrived.
    const stored = JSON.parse(String(rescuer.raw('scheduleData:migrationIssues') || '{}'));
    check('and the disk agrees',
        Array.isArray(stored.issues) && stored.issues.length === 0
        && typeof stored.forSchedule === 'string' && stored.forSchedule.length > 0,
        String(rescuer.raw('scheduleData:migrationIssues')));
}

{
    suite('R6: decisions survive the reopen that the schedule survives');

    const rescuer = makeDevice({ deviceId: 'd_decisions2' });
    seed(rescuer);
    answering(rescuer);
    const issue = { kind: 'unknown-place', value: 'מקום שלא ברשימה',
        date: '2026-08-11', workerId: 'w_02', message: 'לא ידוע' };

    rescuer.call('importBackup', rescuer.fileEvent('farkad-recovery.json', JSON.stringify({
        kind: 'farkad-recovery',
        pendingDecisions: [issue],
        records: { 'scheduleData:v2': JSON.stringify(schedule({
            '2026-08-10': { plan: {}, actual: { w_01: dayValue('p_01') } }
        })) }
    })));
    await settle(80);

    given('the decision arrived', rescuer.State.migrationIssues.length === 1,
        JSON.stringify(rescuer.State.migrationIssues));

    const reopened = makeDevice({ storage: rescuer.dump(), deviceId: 'd_decisions2' });
    reopened.State.load();
    check('the schedule is there after a reopen',
        Boolean((reopened.State.schedule.days || {})['2026-08-10']));
    check('and so is the decision that came with it',
        reopened.State.migrationIssues.length === 1,
        JSON.stringify(reopened.State.migrationIssues));
}

// ================================================================ P1: dormant money
{
    suite('R7: money the app does not draw is still money, and survives the rescue');

    const withMoney = schedule({ '2026-08-10': { plan: {}, actual: { w_01: dayValue('p_01') } } });
    withMoney.advances = {
        a_01: { id: 'a_01', workerId: 'w_01', amount: 500, date: '2026-08-10',
            method: 'cash', note: 'מזומן' }
    };
    withMoney.ledger = { advances: {
        // A real entry: the append-only record that this advance was given.
        l_01: { id: 'l_01', advanceId: 'a_01', kind: 'given', workerId: 'w_01',
            amount: 500, date: '2026-08-10', method: 'transfer',
            at: '2026-08-10T18:00:00.000Z', by: 'd_old' },
        // And one this build cannot read - a field from a version that does not exist
        // yet, or bytes that arrived wrong. It is money either way.
        l_02: { id: 'l_02', workerId: 'w_01', amount: 250, date: '2026-08-11' }
    } };
    withMoney.vehicles = [{ id: 'v_01', name: 'טנדר', ownerId: 'w_01', active: true,
        rates: [{ from: '2026-01-01', amount: 300 }] }];

    const reader = makeDevice({ deviceId: 'd_money' });
    seed(reader);
    const loaded = rebuild(reader, {
        kind: 'farkad-recovery',
        records: { 'scheduleData:v2': JSON.stringify(withMoney) }
    });

    check('the way an advance was paid is not lost',
        ((loaded.schedule.advances || {}).a_01 || {}).method === 'cash',
        JSON.stringify((loaded.schedule.advances || {}).a_01));
    check('a dormant ledger entry is not lost',
        Boolean(((loaded.schedule.ledger || {}).advances || {}).l_01),
        JSON.stringify((loaded.schedule.ledger || {}).advances));
    check('and its method is not lost either',
        (((loaded.schedule.ledger || {}).advances || {}).l_01 || {}).method === 'transfer',
        JSON.stringify(((loaded.schedule.ledger || {}).advances || {}).l_01));
    check('vehicle bytes are kept even though the feature is off',
        (loaded.schedule.vehicles || []).some(vehicle => vehicle && vehicle.id === 'v_01'),
        JSON.stringify(loaded.schedule.vehicles));
    check('and a ledger entry this build cannot read is named, not dropped in silence',
        (loaded.unread || []).some(line => String(line).includes('l_02')),
        JSON.stringify(loaded.unread));
}

// ================================================================ vehicles, shipped off
{
    suite('R8: with vehicles off, nothing charges anybody for one');

    const device = makeDevice({ deviceId: 'd_vehicles' });
    seed(device);
    // The shape the app itself writes: a rate history, so the vehicle earns from the day
    // it was added and not before. This one has been earning since before the day below.
    device.State.schedule.vehicles = [
        { id: 'v_01', name: 'טנדר', ownerId: 'w_01', active: true,
          rates: [{ from: '2026-01-01', amount: 300 }] }
    ];
    device.State.schedule.days = {
        '2026-08-10': { plan: {}, actual: { w_01: dayValue('p_01') } }
    };
    device.State.save({ silent: true });

    check('the flag says the feature is off',
        device.global('FARKAD_FLAGS').vehicles === false,
        String(device.global('FARKAD_FLAGS').vehicles));

    const vehiclePay = device.call('vehiclePayFor', device.State.schedule, 'w_01',
        '2026-08-01', '2026-08-31');
    check('nobody is charged for a vehicle nobody said went out',
        !vehiclePay || vehiclePay.amount === 0,
        JSON.stringify(vehiclePay));

    const pay = device.call('payrollReport', device.State.schedule,
        '2026-08-01', '2026-08-31');
    check('and no vehicle money reaches the pay run',
        !JSON.stringify(pay).includes('300'), JSON.stringify(pay).slice(0, 400));

    check('while the vehicle itself is still on the disk',
        String(device.raw('scheduleData:v2')).includes('v_01'));
}

{
    suite('R8: the shipped flags cannot be changed by anything running in the app');

    const device = makeDevice({ deviceId: 'd_frozen' });
    seed(device);
    const flags = device.global('FARKAD_FLAGS');
    try { flags.permanentDeletion = true; } catch (error) { /* frozen throws in strict */ }
    try { flags.vehicles = true; } catch (error) { /* the same */ }

    check('permanent deletion is still off',
        device.global('FARKAD_FLAGS').permanentDeletion === false,
        String(device.global('FARKAD_FLAGS').permanentDeletion));
    check('and so are vehicles',
        device.global('FARKAD_FLAGS').vehicles === false,
        String(device.global('FARKAD_FLAGS').vehicles));
}

// ------------------------------------------------------- E7: more than one wreck
{
    suite('E7: several damaged records, and every one of them off the phone');

    // The numbered quarantine exists - tests/data.test.mjs proves a second copy goes
    // BESIDE the first rather than on top of it. What that proves is that the bytes are
    // kept. It does not prove they leave.
    //
    // The rescue file is the only route off the phone, and it sweeps quarantine keys by a
    // predicate. A predicate that recognised <base>:damaged but not <base>:damaged:2
    // would keep every copy safely on a device nobody can read, which is the same
    // outcome as deleting them and a worse one to discover.
    const FIRST = '{"first":';
    const SECOND = '{"second":';
    const THIRD = '{"third":';
    const device = makeDevice({
        storage: {
            'farkad:outbox': THIRD,
            'farkad:outbox:damaged': FIRST,
            'farkad:outbox:damaged:2': SECOND
        }
    });
    device.Sync.loadOutbox();

    given('three distinct wrecks are on the disk, none written over the others',
        device.raw('farkad:outbox:damaged') === FIRST
        && device.raw('farkad:outbox:damaged:2') === SECOND
        && device.raw('farkad:outbox:damaged:3') === THIRD,
        JSON.stringify(Object.keys(device.dump()).filter(k => k.includes('damaged'))));

    const rescue = device.global('Recovery').rawRecords();
    const carried = [FIRST, SECOND, THIRD].filter(bytes =>
        Object.keys(rescue).some(key => rescue[key] === bytes));
    check('all three leave the phone in the rescue file, not just the first',
        carried.length === 3,
        `${carried.length} of 3 — keys ${JSON.stringify(
            Object.keys(rescue).filter(k => k.includes('damaged')))}`);
}

// -------------------------------------------------- E7: the ceiling on the copies
{
    suite('E7: a disk already holding twenty wrecks does not lose the twenty-first');

    // quarantineRecord stops at twenty and answers null. Null means "no copy could be
    // kept", which is the mustHold case - the original is the only thing there is, and
    // the device holds rather than letting an ordinary write near it. That is the right
    // answer and it is worth pinning, because the tempting alternative - wrap around to
    // :damaged:2 and reuse it - destroys the first wreck to make room for the last.
    const storage = { 'farkad:outbox': '{"newest":' };
    storage['farkad:outbox:damaged'] = '{"n1":';
    for (let n = 2; n <= 20; n += 1) storage['farkad:outbox:damaged:' + n] = `{"n${n}":`;

    const device = makeDevice({ storage });
    device.Sync.loadOutbox();

    check('the earliest wreck is not recycled to make room',
        device.raw('farkad:outbox:damaged') === '{"n1":',
        JSON.stringify(device.raw('farkad:outbox:damaged')));
    check('and a device that could not keep the copy holds instead of writing near it',
        device.global('Recovery').blocked() === true
        && device.global('Recovery').acknowledge() === false,
        JSON.stringify({ blocked: device.global('Recovery').blocked(),
            problems: device.global('Recovery').problems.length }));
}

// -------------------------------------------------- E7: the poison family is swept too
{
    suite('E7: a quarantined poisoned map made in an earlier session leaves the phone');

    // The copies js/state.js makes of a map with a name it cannot use as a key live under
    // scheduleData:v2:poison:<where>:damaged. The sweep above carries a copy only when
    // the record it is a copy OF is one this app writes - by allowlist, on purpose - and
    // this family was not on the list. So a copy whose original has since been written
    // over, from a session whose problem list is gone, stayed on a device nobody can
    // read: the same outcome as deleting it.
    //
    // Asked of the export directly, without booting: a boot re-derives a hold from the
    // copy and puts it on the problem list, which would carry it by a different route
    // and prove nothing about the sweep.
    const COPY = '{"__proto__":{"entries":[{"placeId":"p_POISON_SWEEP"}]}}';
    const device = makeDevice({
        storage: { 'scheduleData:v2:poison:days.2026-08-12.actual:damaged': COPY }
    });

    check('the sweep recognises the copy as one of this app’s quarantines',
        device.call('isFarkadQuarantineKey',
            'scheduleData:v2:poison:days.2026-08-12.actual:damaged') === true);
    check('and a numbered copy of the same family',
        device.call('isFarkadQuarantineKey',
            'scheduleData:v2:poison:ledger.unreadable:damaged:2') === true);
    const rescue = device.global('Recovery').rawRecords();
    check('so the bytes are in the rescue file',
        Object.keys(rescue).some(key => rescue[key] === COPY),
        JSON.stringify(Object.keys(rescue)));
}

// ================================================================ E8
//
// The rescue door and a name nobody can use as a key.
//
// A phone whose record carries a map with an own `__proto__` is HELD: the map's bytes are
// quarantined, writing stops, and - since the evidence has to outlive the session that
// found it - the poisoned key is kept on the record itself, so every reopen holds again.
// The rescue file is the one door that phone has left. It is built through the real
// export, from a real disk, and opened on a second phone through the real reader,
// because the gate that refuses is three calls below the button.
{
    suite('E8: a rescue file from a phone holding a poisoned ledger map opens on a fresh phone');

    // The record as an older session left it: the held-aside part of the advances history
    // carries an entry under a name the map cannot take as an ordinary key. The reopened
    // phone holds it - that is the branch this suite sits on - and exports its file.
    const MARKER = 'le_POISON_RESCUE';
    const source = seed(makeDevice({ deviceId: 'd_e8_src' }));
    source.setToday('2026-08-26');
    given('a day is recorded on the source phone', put(source, 'days.2026-08-12.actual.w_01', 'p_01'));
    const record = JSON.parse(source.raw('scheduleData:v2'));
    record.ledger = JSON.parse('{"advances":{},"unreadable":{"__proto__":'
        + `{"id":"${MARKER}","amount":500}}}`);
    const disk = source.dump();
    disk['scheduleData:v2'] = JSON.stringify(record);
    given('the record really carries the name as an own key',
        disk['scheduleData:v2'].indexOf('"__proto__"') !== -1);

    const held = makeDevice({ deviceId: 'd_e8_held', storage: disk });
    held.setToday('2026-08-26');
    held.State.load();
    given('the reopened phone is held for it, with the bytes quarantined',
        held.call('farkadWritesBlocked') === true
        && held.global('Recovery').problems.some(problem =>
            problem.key === 'scheduleData:v2:poison:ledger.unreadable.__proto__' && problem.copy),
        JSON.stringify(held.global('Recovery').problems.map(problem => problem.key)));
    held.ctx.askTell = () => Promise.resolve();
    held.call('exportRecoveryData');
    given('and it hands over a rescue file', held.downloads.length === 1);
    const text = held.downloads[0].text;
    const file = JSON.parse(text);
    given('which carries the poisoned record itself, not only a copy of the map',
        file.kind === 'farkad-recovery'
        && typeof file.records['scheduleData:v2'] === 'string'
        && file.records['scheduleData:v2'].indexOf(MARKER) !== -1
        && JSON.stringify(file.liveSchedule).indexOf(MARKER) !== -1);

    // A fresh phone, through readBackupFile - which is what the import handler calls.
    const fresh = seed(makeDevice({ deviceId: 'd_e8_fresh' }));
    fresh.setToday('2026-08-26');
    let read = null;
    let refused = null;
    try {
        read = rebuild(fresh, file);
    } catch (error) {
        refused = error;
    }
    check('the rescue door opens the file rather than calling it unusable',
        read !== null && read.rescue === true,
        refused ? `${refused.message}: ${JSON.stringify(refused.problems)}` : 'opened');
    const dayRead = read && read.schedule.days['2026-08-12'];
    check('and rebuilds the day the held phone was carrying',
        Boolean(dayRead) && placeOf(dayRead.actual && dayRead.actual.w_01) === 'p_01',
        JSON.stringify(dayRead));
    const unreadable = read && read.schedule.ledger && read.schedule.ledger.unreadable;
    check('the evidence rides on the rebuilt schedule as an own key, exactly as the held phone kept it',
        Boolean(unreadable)
        && Object.prototype.hasOwnProperty.call(unreadable, '__proto__')
        && JSON.stringify(read.schedule).indexOf(MARKER) !== -1,
        unreadable ? JSON.stringify(Object.getOwnPropertyNames(unreadable)) : 'no schedule');
    // The findings ride on the RESULT. Reporting them to Recovery at the read held the
    // reading phone for a file it had only previewed: importBackup reads before it asks,
    // so a person who cancelled at the dialog was left with another phone's bytes
    // quarantined on their disk, writing blocked, and the hold re-derived at every
    // reopen for the rest of the phone's life. The hold belongs to the phone that
    // LOADS the rescue - the suite below drives that door - and it is raised only once
    // the replacement is on the disk.
    const finding = read && Array.isArray(read.evidence) && read.evidence.find(item =>
        item.key === 'scheduleData:v2:poison:ledger.unreadable.__proto__');
    check('the evidence is returned on the result, bytes and all',
        Boolean(finding) && String(finding.raw).indexOf(MARKER) !== -1,
        read ? JSON.stringify(read.evidence) : 'not opened');
    check('and the reading phone is not held for a file it only read',
        fresh.call('farkadWritesBlocked') === false
        && fresh.global('Recovery').problems.length === 0
        && Object.keys(fresh.dump()).every(key => key.indexOf(':poison:') === -1),
        JSON.stringify(fresh.global('Recovery').problems.map(problem => [problem.key, problem.copy])));
    check('nothing in the file is reported unreadable because of the name',
        read !== null && read.unread.every(line => line.indexOf('כמפתח') === -1),
        read ? JSON.stringify(read.unread) : 'not opened');
}

{
    suite('E8: the rescue door holds the phone once the rescue is loaded, and not for a preview');

    // The reading phone is a healthy phone with its own recorded days. It opens the
    // file, reads the dialog, and cancels - wrong file. Measured before this existed:
    // the record was unchanged, and the phone was held anyway - the other phone's
    // poisoned bytes quarantined on this disk under the poison family, State.commit
    // refused until acknowledged, and since the hold is re-derived at every boot from
    // every scheduleData:v2:poison:* copy, held again at every reopen for life; its own
    // rescue file then carried the other phone's evidence as if it were its own.
    //
    // The same staging as the suite above: a held phone's real export, opened on a
    // second phone through the real import handler, with the dialog answered.
    const MARKER = 'le_POISON_PREVIEW';
    const source = seed(makeDevice({ deviceId: 'd_e8p_src' }));
    source.setToday('2026-08-26');
    given('a day is recorded on the source phone', put(source, 'days.2026-08-12.actual.w_01', 'p_01'));
    const record = JSON.parse(source.raw('scheduleData:v2'));
    record.ledger = JSON.parse('{"advances":{},"unreadable":{"__proto__":'
        + `{"id":"${MARKER}","amount":500}}}`);
    const disk = source.dump();
    disk['scheduleData:v2'] = JSON.stringify(record);
    const held = makeDevice({ deviceId: 'd_e8p_held', storage: disk });
    held.setToday('2026-08-26');
    held.State.load();
    held.ctx.askTell = () => Promise.resolve();
    held.call('exportRecoveryData');
    given('the held phone hands over a rescue file carrying the name',
        held.downloads.length === 1 && held.downloads[0].text.indexOf(MARKER) !== -1);
    const file = held.downloads[0];

    // ---- cancelled at the dialog
    const reader = seed(makeDevice({ deviceId: 'd_e8p_reader' }));
    reader.setToday('2026-08-26');
    given('the reading phone has a day of its own',
        put(reader, 'days.2026-08-20.actual.w_02', 'p_02'));
    const before = JSON.stringify(reader.dump());
    const cancelling = answering(reader, { answer: false });
    reader.call('importBackup', reader.fileEvent(file.name, file.text));
    await settle(80);
    given('the dialog was asked and answered no', cancelling.asked.length === 1);

    check('on cancel nothing on the disk changed',
        JSON.stringify(reader.dump()) === before,
        JSON.stringify(Object.keys(reader.dump()).filter(key =>
            before.indexOf(JSON.stringify(key)) === -1)));
    check('and the phone is not held for a file it only previewed',
        reader.call('farkadWritesBlocked') === false
        && reader.global('Recovery').problems.length === 0,
        JSON.stringify(reader.global('Recovery').problems.map(problem => problem.key)));
    check('it can still record a day',
        put(reader, 'days.2026-08-21.actual.w_02', 'p_02') === true);
    const reopened = makeDevice({ deviceId: 'd_e8p_reader', storage: reader.dump() });
    reopened.setToday('2026-08-26');
    reopened.State.load();
    check('and a reopened phone is not held either',
        reopened.call('farkadWritesBlocked') === false,
        JSON.stringify(reopened.global('Recovery').problems.map(problem => problem.key)));
    reopened.ctx.askTell = () => Promise.resolve();
    reopened.call('exportRecoveryData');
    check('its own rescue file does not carry the other phone’s evidence',
        reopened.downloads.length === 1 && reopened.downloads[0].text.indexOf(MARKER) === -1);

    // ---- confirmed
    const loader = seed(makeDevice({ deviceId: 'd_e8p_loader' }));
    loader.setToday('2026-08-26');
    given('the loading phone has a day of its own',
        put(loader, 'days.2026-08-20.actual.w_02', 'p_02'));
    const loading = answering(loader, { answer: true });
    loader.call('importBackup', loader.fileEvent(file.name, file.text));
    await settle(120);
    given('the dialog was asked and answered yes', loading.asked.length === 1);

    const landed = JSON.parse(loader.raw('scheduleData:v2'));
    check('the rescue replaced the record on the disk',
        Boolean(landed.days['2026-08-12'])
        && placeOf(landed.days['2026-08-12'].actual.w_01) === 'p_01'
        && !landed.days['2026-08-20'],
        JSON.stringify(Object.keys(landed.days || {})));
    check('carrying the evidence exactly as the held phone kept it',
        loader.raw('scheduleData:v2').indexOf(MARKER) !== -1);
    const evidence = loader.global('Recovery').problems.find(problem =>
        problem.key === 'scheduleData:v2:poison:ledger.unreadable.__proto__');
    check('and only then is the phone held, with the bytes quarantined there',
        Boolean(evidence) && Boolean(evidence.copy)
        && String(loader.raw(evidence.copy)).indexOf(MARKER) !== -1
        && loader.call('farkadWritesBlocked') === true,
        JSON.stringify(loader.global('Recovery').problems.map(problem => [problem.key, problem.copy])));
    check('the person is told the rescue loaded, not that the device is full',
        loading.said.some(line => line.indexOf('קובץ החילוץ נטען') !== -1)
        && loading.said.every(line => line.indexOf('אין מקום') === -1),
        JSON.stringify(loading.said));
    check('acknowledging releases the phone to record on the rescued schedule',
        loader.global('Recovery').acknowledge() === true
        && put(loader, 'days.2026-08-21.actual.w_01', 'p_01') === true);
}

{
    suite('E8: a rescue file carrying a held poisoned day layer opens the same way');

    // The other family: a layer that arrived from the cloud with a worker under a name the
    // map cannot take. The phone that heard it held the layer's bytes under the poison
    // family and its record stayed as it was, so what the file carries is the quarantine
    // copy beside the clean record - and the door has to open that too, name the copy,
    // and rebuild the day for the worker whose name can be read.
    const MARKER = 'p_POISON_LAYER';
    const sky = seed(makeDevice({ deviceId: 'd_e8_sky' }));
    sky.setToday('2026-08-26');
    given('a day is recorded on that phone', put(sky, 'days.2026-08-12.actual.w_01', 'p_01'));
    const raw = JSON.parse(JSON.stringify(sky.State.schedule));
    raw.days['2026-08-12'] = JSON.parse('{"actual":{"__proto__":{"entries":[{"placeId":"'
        + MARKER + '"}]},"w_01":{"entries":[{"placeId":"p_01"}]}}}');
    raw.updatedAt = '2026-08-26T10:00:00.000Z';
    raw.updatedBy = 'd_other';
    sky.Sync.receive(raw);
    await settle(40);
    given('the phone that heard it is held, with the layer quarantined',
        sky.call('farkadWritesBlocked') === true
        && Object.keys(sky.dump()).some(key =>
            key.indexOf('scheduleData:v2:poison:days.2026-08-12.actual') === 0
            && String(sky.raw(key)).indexOf(MARKER) !== -1),
        JSON.stringify(Object.keys(sky.dump()).filter(key => key.indexOf('poison') !== -1)));
    sky.ctx.askTell = () => Promise.resolve();
    sky.call('exportRecoveryData');
    given('and it hands over a rescue file carrying the layer’s bytes',
        sky.downloads.length === 1 && sky.downloads[0].text.indexOf(MARKER) !== -1);
    const file = JSON.parse(sky.downloads[0].text);

    const fresh = seed(makeDevice({ deviceId: 'd_e8_fresh2' }));
    fresh.setToday('2026-08-26');
    let read = null;
    let refused = null;
    try {
        read = rebuild(fresh, file);
    } catch (error) {
        refused = error;
    }
    check('the rescue door opens the file',
        read !== null && read.rescue === true,
        refused ? `${refused.message}: ${JSON.stringify(refused.problems)}` : 'opened');
    const dayRead = read && read.schedule.days['2026-08-12'];
    check('and rebuilds the day for the worker whose name can be read',
        Boolean(dayRead) && placeOf(dayRead.actual && dayRead.actual.w_01) === 'p_01',
        JSON.stringify(dayRead));
    check('and names the quarantined layer it carries rather than dropping it',
        read !== null && read.damagedKeys.some(key =>
            key.indexOf('scheduleData:v2:poison:days.2026-08-12.actual') === 0
            && String(file.records[key]).indexOf(MARKER) !== -1),
        read ? JSON.stringify(read.damagedKeys) : 'not opened');
}

{
    suite('E8: an ordinary backup carrying a poisoned map is still refused at the door');

    // The other half of the same rule, so the rescue door opening cannot be bought by
    // letting a REPLACEMENT through. A backup file is about to become the whole record on
    // three phones; one carrying a name nobody can use as a key is refused in its own
    // words, and the phone that only read it is not held for it - restore.test R8 says
    // the same through the restore-point door.
    const MARKER = 'le_POISON_BACKUP';
    const device = seed(makeDevice({ deviceId: 'd_e8_backup' }));
    device.setToday('2026-08-26');
    const backup = JSON.parse(JSON.stringify(device.State.schedule));
    backup.ledger = JSON.parse('{"advances":{},"unreadable":{"__proto__":'
        + `{"id":"${MARKER}","amount":500}}}`);
    let refused = null;
    try {
        rebuild(device, backup);
    } catch (error) {
        refused = error;
    }
    check('the backup door refuses it and names the key',
        refused !== null && Array.isArray(refused.problems)
        && refused.problems.some(problem =>
            problem.indexOf('שאי אפשר להשתמש בו כמפתח') !== -1
            && problem.indexOf('ledger.unreadable') !== -1),
        refused ? JSON.stringify(refused.problems) : 'opened');
    check('and the phone is not held for a file it only read',
        device.call('farkadWritesBlocked') === false
        && device.global('Recovery').problems.length === 0
        && Object.keys(device.dump()).every(key => key.indexOf(':poison:') === -1),
        JSON.stringify(device.global('Recovery').problems.map(problem => problem.key)));
}

// ================================================================ E9
//
// Evidence found while the disk is being read, and the screen.
//
// Recovery.evidence redraws the app so that a poisoned map arriving from the cloud is
// worn by the whole screen the moment it is held. It is also reached from State.load -
// normaliseSchedule runs it for a record that carries the map - and State.load runs
// inside boot() in js/app.js BEFORE the app's first render(). A redraw there draws every
// view over a State that is half read: the schedule still the empty one from definition
// time, the journal not yet replayed, the questions not yet read. And it runs inside
// loadRecord's try: anything render() throws while drawing that half-state is caught as
// "the stored record cannot be read", the readable record is quarantined and the phone
// held for a fault in the drawing, not in the data. damaged() never redrew; halt() redraws
// only after the boot render. This is the one path that redrew before it.
//
// The harness runs no boot, so a device here is exactly "before the app's first render":
// what boot() does after that first render is done by hand below, on the seam it uses.
{
    suite('E9: evidence found while the disk is read does not redraw the app before its first render');

    const MARKER = 'le_POISON_EARLY_RENDER';
    const source = seed(makeDevice({ deviceId: 'd_e9_src' }));
    source.setToday('2026-08-26');
    given('a day is recorded on the source phone', put(source, 'days.2026-08-12.actual.w_01', 'p_01'));
    const record = JSON.parse(source.raw('scheduleData:v2'));
    record.ledger = JSON.parse('{"advances":{},"unreadable":{"__proto__":'
        + `{"id":"${MARKER}","amount":500}}}`);
    const disk = source.dump();
    disk['scheduleData:v2'] = JSON.stringify(record);

    const device = makeDevice({ deviceId: 'd_e9', storage: disk });
    device.setToday('2026-08-26');
    given('nothing has been drawn on this device yet', device.renders.count === 0);
    device.State.load();
    const recovery = device.global('Recovery');
    given('the record is held and its map quarantined by the read',
        device.call('farkadWritesBlocked') === true
        && recovery.problems.some(problem =>
            problem.key === 'scheduleData:v2:poison:ledger.unreadable.__proto__' && problem.copy),
        JSON.stringify(recovery.problems.map(problem => problem.key)));
    check('and the read did not redraw the app on its way through the disk',
        device.renders.count === 0, `${device.renders.count} render(s) during State.load`);
    check('the day the record held is on the schedule the boot will draw',
        placeOf(device.State.schedule.days['2026-08-12'].actual.w_01) === 'p_01');

    // What boot() does once the app has drawn itself for the first time.
    recovery.onScreen = true;
    const before = device.renders.count;
    recovery.evidence('scheduleData:v2:poison:days.2026-08-13.actual',
        '{"__proto__":{"entries":[{"placeId":"p_02"}]}}', 'x');
    check('once the app is on screen, new evidence is worn by the whole screen at once',
        device.renders.count === before + 1, `${before} -> ${device.renders.count}`);
    recovery.evidence('scheduleData:v2:poison:days.2026-08-13.actual',
        '{"__proto__":{"entries":[{"placeId":"p_02"}]}}', 'x');
    check('and the same bytes again are the same sighting, not another redraw',
        device.renders.count === before + 1, `${before} -> ${device.renders.count}`);
}

report();
