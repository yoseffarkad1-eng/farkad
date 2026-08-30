// A phone upgrading onto this build.
//
//   node tests/upgrade.test.mjs
//
// Every other suite starts from a disk THIS build wrote. Nobody in the field has one: the
// three phones are on v86 and the first thing this build ever does is read bytes an older
// one left behind. So every device below is STAGED - hand-written bytes in the shape the
// older build wrote - then opened with the real State.load, flushed through the real sync
// layer, and read back through the real projections. Nothing here asserts by reading
// source, and nothing compares one caller of a function against another caller of the
// same function: where a claim is about the disk it is read off the dump.
//
// Four questions of every staging, and they are the only four that matter: nothing lost,
// nothing sent twice that would double a payment, nothing left that can never be
// collected, and two reopens agreeing.

import { makeDevice, makeCloud, settle } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const TICK = 6;

const WORKERS = [
    { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 },
    { id: 'w_02', name: 'שרה', active: true, dailyRate: 350, hourlyRate: 0 }
];
const PLACES = [
    { id: 'p_01', name: 'הרצליה', active: true },
    { id: 'p_02', name: 'תל אביב', active: true }
];

const document = extra => Object.assign({
    schemaVersion: 2,
    workers: WORKERS.map(worker => Object.assign({}, worker)),
    places: PLACES.map(place => Object.assign({}, place)),
    days: {}, advances: {},
    updatedAt: '2026-08-01T00:00:00.000Z', updatedBy: 'd_old'
}, extra || {});

const dayValue = placeId => ({ entries: [{ placeId }] });
const dayFor = (workerId, placeId) => ({ plan: {}, actual: { [workerId]: dayValue(placeId) } });

// A migration question, in the shape migrateV1 writes one. The message is the app's, and
// it is the whole content of an unanswered question - so it is quoted, not paraphrased.
const ISSUE = {
    kind: 'unknown-place', index: 3, value: 'שכונת רמות', date: '2026-08-11',
    workerId: 'w_01', workerName: 'דוד', suggestion: null,
    message: '"שכונת רמות" אינו שם של מקום קיים - יש להחליט ידנית.'
};

// The identity an item inside a slot record USED to wear: 'legacy_' + a 32-bit rolling
// hash of slot|path. Spelled out here rather than imported, because this is staging and
// not an assertion - these are bytes a build that no longer exists put on the disk, and
// the only way to have them is to write them the way it did.
function retiredHash(text) {
    let value = 0;
    for (let i = 0; i < text.length; i += 1) {
        value = (Math.imul(value, 31) + text.charCodeAt(i)) | 0;
    }
    return (value >>> 0).toString(36);
}
const retiredId = (slot, path) => 'legacy_' + retiredHash(slot + '|' + path);

const screenPlace = (device, date, workerId) => {
    const entries = device.call('entriesFor', device.State.schedule, date, workerId, 'actual');
    return entries.length > 0 ? entries[0].placeId : null;
};

const advanceAmount = (device, id) => {
    const advance = (device.State.schedule.advances || {})[id];
    return advance ? advance.amount : null;
};

// Closing the app and opening it again: the bytes are what survives, and everything this
// session believes is built again from them.
const reopen = device => {
    const next = makeDevice({ storage: device.dump(), deviceId: device.id });
    next.State.load();
    return next;
};

const connected = async (device, cloud) => {
    device.Sync.pushDelayMs = TICK;
    device.Sync.connect(cloud.adapter);
    await settle(TICK * 40);
};

const drain = async (device, rounds = 6) => {
    for (let round = 0; round < rounds; round += 1) {
        device.Sync.flush();
        await settle(TICK * 20);
    }
};

// Every field path the cloud was written at, and how many times. A path written twice is
// an edit sent twice; when the path is an advance, that is somebody paid twice.
function pathWrites(cloud) {
    const counts = {};
    cloud.writes.forEach(write => {
        if (write.kind !== 'update') return;
        Object.keys(write.patch).forEach(path => {
            if (path === 'updatedAt' || path === 'updatedBy') return;
            counts[path] = (counts[path] || 0) + 1;
        });
    });
    return counts;
}

// The ids named by every acknowledgement and retirement on the disk, read off the dump
// rather than through the app's own key scan - a projection that cannot see a key must not
// be what decides the key is not there. Ids carry no colon, so the last one separates.
function markedIds(device) {
    return Object.keys(device.dump())
        .filter(key => /^farkad:outbox(:active\d+)?:(ack|beat):[A-Za-z0-9_-]+$/.test(key))
        .map(key => key.slice(key.lastIndexOf(':') + 1));
}

// A mark whose operation is not on this device at all: it can never be answered and never
// be collected, and it is copied into every rescue export for the life of the phone.
function orphanedMarks(device) {
    const held = new Set(device.Sync.physicalOperations().map(op => String(op.opId)));
    return markedIds(device).filter(id => !held.has(id));
}

const slotItems = device => {
    const raw = device.raw('farkad:outbox');
    if (raw === null) return null;
    try { return Object.keys(JSON.parse(raw).items || {}); } catch (error) { return null; }
};

// ================================================================ 1
{
    suite('1: a v86 queue arriving with the retired scheme’s ack and beat keys');

    // What a phone that upgraded once before looks like. The slot record is the whole
    // queue, the way every build before v87 wrote it; beside it are an acknowledgement
    // and a retirement minted under the identity that was abandoned for not being
    // injective. Neither can be matched to anything this build computes, so the question
    // is whether a mark nobody can read is allowed to speak for an edit nobody has sent.
    const DAY = 'days.2026-08-12.actual.w_01';
    const ADVANCE = 'advances.a_up1';
    const device = makeDevice({
        deviceId: 'd_marks',
        storage: {
            'farkad:deviceId': 'd_marks',
            'scheduleData:v2': JSON.stringify(document()),
            'farkad:outbox': JSON.stringify({
                seq: 2,
                items: {
                    [DAY]: { value: dayValue('p_01'), seq: 1 },
                    [ADVANCE]: { seq: 2, value: { id: 'a_up1', workerId: 'w_01',
                        date: '2026-08-12', amount: 500, note: '' } }
                }
            }),
            [`farkad:outbox:ack:${retiredId('farkad:outbox', DAY)}`]: '1',
            [`farkad:outbox:beat:${retiredId('farkad:outbox', ADVANCE)}`]: '1'
        }
    });
    device.State.load();

    given('the two retired-scheme marks are on the disk',
        device.raw(`farkad:outbox:ack:${retiredId('farkad:outbox', DAY)}`) === '1'
        && device.raw(`farkad:outbox:beat:${retiredId('farkad:outbox', ADVANCE)}`) === '1');

    const ops = device.Sync.physicalOperations();
    const dayOp = ops.find(op => op.path === DAY);
    const advanceOp = ops.find(op => op.path === ADVANCE);
    given('both items were read out of the slot record',
        Boolean(dayOp) && Boolean(advanceOp), JSON.stringify(ops.map(op => op.path)));

    // An acknowledgement is the app's whole answer to "has the cloud got this". Read
    // under a name this build cannot mint, it would say yes about an edit that never
    // left the phone - and the collector would then throw the only copy away.
    check('an acknowledgement under the retired name does not say the day was sent',
        dayOp.sent === false, JSON.stringify({ sent: dayOp.sent, id: dayOp.opId }));

    // A retirement is stronger: a retired operation can never be current again, whatever
    // is collected around it. Answered under the old name it takes the advance off the
    // record for good, and nothing anywhere reports a fault.
    check('and a retirement under the retired name does not silence the advance',
        advanceOp.retired === false, JSON.stringify({ retired: advanceOp.retired }));

    check('so the day and the advance are both on the record at the first open',
        screenPlace(device, '2026-08-12', 'w_01') === 'p_01'
        && advanceAmount(device, 'a_up1') === 500,
        JSON.stringify([screenPlace(device, '2026-08-12', 'w_01'),
            advanceAmount(device, 'a_up1')]));

    const cloud = makeCloud({ doc: document() });
    await connected(device, cloud);
    await drain(device);

    const counts = pathWrites(cloud);
    check('each queued path reached the cloud exactly once over six flush rounds',
        counts[DAY] === 1 && counts[ADVANCE] === 1
        && Object.keys(counts).every(path => counts[path] === 1), JSON.stringify(counts));
    check('and the advance in the cloud is the one amount, not two',
        ((cloud.doc.advances || {}).a_up1 || {}).amount === 500,
        JSON.stringify(cloud.doc.advances));
    check('with nothing left waiting',
        device.Sync.pendingCount() === 0, String(device.Sync.pendingCount()));

    const once = reopen(device);
    const twice = reopen(once);
    same('two reopens agree about the day, the advance and the count',
        [screenPlace(once, '2026-08-12', 'w_01'), advanceAmount(once, 'a_up1'),
            once.Sync.pendingCount()],
        [screenPlace(twice, '2026-08-12', 'w_01'), advanceAmount(twice, 'a_up1'),
            twice.Sync.pendingCount()]);
    check('and they agree with what was recorded, not merely with each other',
        screenPlace(twice, '2026-08-12', 'w_01') === 'p_01'
        && advanceAmount(twice, 'a_up1') === 500 && twice.Sync.pendingCount() === 0,
        JSON.stringify([screenPlace(twice, '2026-08-12', 'w_01'),
            advanceAmount(twice, 'a_up1'), twice.Sync.pendingCount()]));

    // RED. The marks under the retired name are queue keys by shape, so every projection
    // reads them and every rescue export carries them - and nothing can ever take them
    // off: forgetQueueMarks removes the marks of an operation that exists, and no
    // operation will ever wear those names again.
    check('no acknowledgement or retirement is left naming an operation nobody holds',
        orphanedMarks(twice).length === 0, JSON.stringify(orphanedMarks(twice)));
}

// ================================================================ 2
{
    suite('2: a restore on a phone still carrying an older build’s queue');

    // The ordinary door on a phone with sync switched off: restore a backup, which
    // supersedes every pending edit by definition. The pending edit here is an item
    // inside a slot record, which is what every phone in the field is carrying.
    const DAY = 'days.2026-08-12.actual.w_01';
    const device = makeDevice({
        deviceId: 'd_restore',
        storage: {
            'farkad:deviceId': 'd_restore',
            'scheduleData:v2': JSON.stringify(document()),
            'farkad:outbox': JSON.stringify({
                seq: 1, items: { [DAY]: { value: dayValue('p_01'), seq: 1 } }
            })
        }
    });
    device.State.load();
    given('the older build’s edit is pending and on the screen',
        device.Sync.pendingCount() === 1
        && screenPlace(device, '2026-08-12', 'w_01') === 'p_01');

    const restored = device.call('normaliseSchedule', document({
        days: { '2026-08-12': dayFor('w_01', 'p_02') }
    }));
    const result = await device.Sync.replaceEverything(restored);

    check('the restore reports itself finished',
        result.ok === true && result.stage === 'done', JSON.stringify(result));

    // RED. dropOperations names a legacy item by the retired identity, so nothing it is
    // asked to remove ever matches, the slot record is never rewritten, and the function
    // reports success over a queue it did not prune.
    check('and the entries it superseded are gone from the slot record',
        (slotItems(device) || []).length === 0, JSON.stringify(slotItems(device)));

    const once = reopen(device);
    const twice = reopen(once);
    // RED. This is what the person sees: the day they restored, replaced at the next
    // open by the day they restored AWAY from - the superseded item is still on the disk
    // with nothing left to fence it, and the journal replays it over the restore.
    check('and both reopens show the day the restore put on the record',
        screenPlace(once, '2026-08-12', 'w_01') === 'p_02'
        && screenPlace(twice, '2026-08-12', 'w_01') === 'p_02',
        JSON.stringify([screenPlace(once, '2026-08-12', 'w_01'),
            screenPlace(twice, '2026-08-12', 'w_01')]));

    // RED. The same defect through the other door, which is not a restore at all: the
    // explicit clear every whole-document replacement calls. An answer of true is what
    // lets its caller stop looking.
    const emptied = twice.Sync.clearOutbox();
    check('clearOutbox does not answer true over a queue it did not empty',
        !(emptied === true && (slotItems(twice) || []).length > 0),
        JSON.stringify({ emptied, items: slotItems(twice),
            pending: twice.Sync.pendingCount() }));
}

// ================================================================ 3
{
    suite('3: a v1 record, never modified, opened by this build');

    // The oldest disk anybody still has: one week of cells, a name in one of them that is
    // not a site, and no v2 record at all. The migration must not guess, and the v1 bytes
    // must be exactly where they were afterwards - if anything about the migration turns
    // out to be wrong, that record is the only original there will ever be.
    const raw = JSON.stringify({
        workers: ['דוד', 'שרה'],
        places: ['הרצליה', 'תל אביב'],
        weekStartDate: '2026-08-10',
        assignments: [
            { index: 0, value: 'הרצליה' },
            { index: 1, value: 'שכונת רמות' },
            { index: 7, value: 'תל אביב' }
        ],
        updatedAt: '2026-08-01T00:00:00.000Z'
    });

    const device = makeDevice({ storage: { scheduleData: raw }, deviceId: 'd_v1' });
    given('the record was migrated rather than opened as v2',
        device.State.load().migrated === true);

    check('the v1 bytes are byte-identical after the migration',
        device.raw('scheduleData') === raw, String(device.raw('scheduleData')).slice(0, 70));
    check('both readable cells are on the record',
        screenPlace(device, '2026-08-10', 'w_01') === 'p_01'
        && screenPlace(device, '2026-08-10', 'w_02') === 'p_02',
        JSON.stringify([screenPlace(device, '2026-08-10', 'w_01'),
            screenPlace(device, '2026-08-10', 'w_02')]));
    // The cell naming no site is the one thing that must not become data. It is a
    // question, and a question that lives only in memory is one nobody will be asked.
    check('and the cell it refused to guess is a question on the disk, in its own words',
        String(device.raw('scheduleData:migrationIssues')).includes('שכונת רמות'),
        String(device.raw('scheduleData:migrationIssues')).slice(0, 90));

    const once = reopen(device);
    const twice = reopen(once);
    same('two reopens agree about the week, the question and the v1 record',
        [screenPlace(once, '2026-08-10', 'w_01'), screenPlace(once, '2026-08-10', 'w_02'),
            once.State.migrationIssues.length, once.raw('scheduleData')],
        [screenPlace(twice, '2026-08-10', 'w_01'), screenPlace(twice, '2026-08-10', 'w_02'),
            twice.State.migrationIssues.length, twice.raw('scheduleData')]);
    check('and what they agree on is the migrated week and the open question',
        screenPlace(twice, '2026-08-10', 'w_01') === 'p_01'
        && twice.State.migrationIssues.length === 1
        && twice.raw('scheduleData') === raw,
        JSON.stringify([screenPlace(twice, '2026-08-10', 'w_01'),
            twice.State.migrationIssues.length]));
    check('the second open does not migrate again over the record the first one wrote',
        once.raw('scheduleData:v2') === twice.raw('scheduleData:v2'),
        String(twice.raw('scheduleData:v2')).slice(0, 70));
}

// ================================================================ 4
{
    suite('4: a v71 pending replacement, with no companion beside it');

    // v71 stored the bare cloud document under the pending-replace key and cleared the
    // whole queue on success, so the record cannot say what it supersedes. This build
    // computes that boundary ONCE and writes it down. Computing it again at the next open
    // - against a queue that has grown since - is how an edit made after the restore was
    // asked for came to be inside the boundary and was deleted by the retry.
    const DAY = 'days.2026-08-12.actual.w_01';
    const primary = document({
        days: { '2026-07-01': dayFor('w_01', 'p_02') },
        // v71 captured the document before State.save stamped it, so a genuine record can
        // carry no stamp at all - which the rules refuse on every attempt, for ever.
        updatedAt: null, updatedBy: null
    });

    const device = makeDevice({
        deviceId: 'd_v71',
        storage: {
            'farkad:deviceId': 'd_v71',
            'scheduleData:v2': JSON.stringify(document({
                days: { '2026-08-10': dayFor('w_01', 'p_01') } })),
            'farkad:pendingReplace': JSON.stringify(primary),
            'farkad:outbox': JSON.stringify({
                seq: 1, items: { [DAY]: { value: dayValue('p_01'), seq: 1 } }
            })
        }
    });
    device.State.load();

    let stored = null;
    try { stored = JSON.parse(device.raw('farkad:pendingReplace')); } catch (error) { stored = null; }
    check('the record on the disk is now an envelope that names its own transaction',
        Boolean(stored) && stored.version === 2 && stored.phase === 'prepared'
        && typeof stored.transactionId === 'string' && stored.transactionId.length > 0,
        JSON.stringify(stored && { version: stored.version, phase: stored.phase,
            transactionId: stored.transactionId }));
    check('and it still carries the week the v71 record was holding',
        Boolean(stored)
        && (((((stored.document || {}).days || {})['2026-07-01'] || {}).actual || {})
            .w_01 || { entries: [{}] }).entries[0].placeId === 'p_02',
        JSON.stringify(Object.keys(((stored || {}).document || {}).days || {})));
    check('with a stamp put on it, where the v71 record had none',
        Boolean(stored) && typeof stored.document.updatedAt === 'string'
        && stored.document.updatedAt.length > 0,
        JSON.stringify({ staged: primary.updatedAt,
            stored: stored && stored.document.updatedAt }));

    const first = device.Sync.pendingReplace();
    given('the boundary was frozen', Array.isArray(first.supersedes));
    const frozen = first.supersedes.slice().sort();

    // An ordinary evening's work, recorded AFTER the restore was asked for. It is the one
    // thing this transaction must not touch.
    device.State.commit(device.call('assignPlace',
        device.State.schedule, '2026-08-20', 'w_01', 'actual', 'p_02'));

    const once = reopen(device);
    const second = once.Sync.pendingReplace();
    same('the boundary at the next open is the one that was frozen, not a new one',
        second.supersedes.slice().sort(), frozen);
    same('and the transaction is still the same transaction',
        second.transactionId, first.transactionId);
    check('so the day recorded after the freeze is still on the record',
        screenPlace(once, '2026-08-20', 'w_01') === 'p_02',
        String(screenPlace(once, '2026-08-20', 'w_01')));

    const twice = reopen(once);
    same('and two reopens agree about that day, the count and the boundary',
        [screenPlace(once, '2026-08-20', 'w_01'), once.Sync.pendingCount(),
            second.supersedes.length],
        [screenPlace(twice, '2026-08-20', 'w_01'), twice.Sync.pendingCount(),
            twice.Sync.pendingReplace().supersedes.length]);
}

// ================================================================ 5
{
    suite('5: a v71 pending replacement whose companion was already written');

    // The crash case: an earlier open froze the boundary to the companion key and died
    // before it could write it over the raw record. The companion is the only statement
    // of that boundary there will ever be, and it says the restore supersedes NOTHING -
    // it was frozen when the queue was empty. Recomputing it now, against a queue with an
    // edit in it, would supersede that edit and delete it.
    const DAY = 'days.2026-08-12.actual.w_01';
    const primary = document({
        days: { '2026-07-01': dayFor('w_01', 'p_02') }, updatedAt: null, updatedBy: null
    });
    const companion = {
        version: 2, phase: 'prepared', transactionId: 'legacy_frozen1',
        supersedesSeq: 0, supersedes: [], cloud: true, document: primary
    };

    const device = makeDevice({
        deviceId: 'd_comp',
        storage: {
            'farkad:deviceId': 'd_comp',
            'scheduleData:v2': JSON.stringify(document({
                days: { '2026-08-10': dayFor('w_01', 'p_01') } })),
            'farkad:pendingReplace': JSON.stringify(primary),
            'farkad:pendingReplace:v71': JSON.stringify(companion),
            'farkad:outbox': JSON.stringify({
                seq: 1, items: { [DAY]: { value: dayValue('p_01'), seq: 1 } }
            })
        }
    });
    device.State.load();

    const envelope = device.Sync.pendingReplace();
    check('the companion’s own transaction is the one that is resumed',
        Boolean(envelope) && envelope.transactionId === 'legacy_frozen1',
        JSON.stringify(envelope && envelope.transactionId));
    check('and its boundary is taken as written, not computed again',
        Boolean(envelope) && Array.isArray(envelope.supersedes)
        && envelope.supersedes.length === 0,
        JSON.stringify(envelope && envelope.supersedes));
    check('so the edit the boundary does not name is still owed and still on the screen',
        device.Sync.pendingCount() === 1
        && screenPlace(device, '2026-08-12', 'w_01') === 'p_01',
        JSON.stringify([device.Sync.pendingCount(),
            screenPlace(device, '2026-08-12', 'w_01')]));

    const cloud = makeCloud({ doc: document({
        days: { '2026-08-10': dayFor('w_01', 'p_01') } }) });
    await connected(device, cloud);
    await drain(device, 3);

    check('the restored week reached the cloud',
        Boolean(((cloud.doc.days || {})['2026-07-01'] || {}).actual),
        JSON.stringify(Object.keys(cloud.doc.days || {})));
    check('and the edit the restore did not name went with it, rather than under it',
        Boolean(((cloud.doc.days || {})['2026-08-12'] || {}).actual),
        JSON.stringify(Object.keys(cloud.doc.days || {})));
    check('the transaction is over, so nothing will resume it',
        device.raw('farkad:pendingReplace') === null,
        String(device.raw('farkad:pendingReplace')).slice(0, 70));
    // RED. The companion is written before the raw record and dropped when the raw record
    // is rewritten over it - and on this path the raw record is never rewritten, because
    // the companion was already frozen. A whole schedule document is left on a phone the
    // app warns about running out of room on; nothing will ever read it again, no code
    // path removes it, and every rescue export from now on carries a finished restore.
    check('and the frozen companion it was bound to goes with it',
        device.raw('farkad:pendingReplace:v71') === null,
        String(device.raw('farkad:pendingReplace:v71')).slice(0, 70));

    const once = reopen(device);
    const twice = reopen(once);
    same('two reopens agree about both days and the count',
        [screenPlace(once, '2026-07-01', 'w_01'), screenPlace(once, '2026-08-12', 'w_01'),
            once.Sync.pendingCount()],
        [screenPlace(twice, '2026-07-01', 'w_01'), screenPlace(twice, '2026-08-12', 'w_01'),
            twice.Sync.pendingCount()]);
    check('and what they agree on is the restore and the edit, with nothing waiting',
        screenPlace(twice, '2026-07-01', 'w_01') === 'p_02'
        && screenPlace(twice, '2026-08-12', 'w_01') === 'p_01'
        && twice.Sync.pendingCount() === 0,
        JSON.stringify([screenPlace(twice, '2026-07-01', 'w_01'),
            screenPlace(twice, '2026-08-12', 'w_01'), twice.Sync.pendingCount()]));
}

// ================================================================ 6
{
    suite('6: the questions a migration refused to guess, in the bare-array form');

    // Before the binding existed the list was a bare array under a fixed key. It is all
    // there is, so refusing it would throw away questions nobody has answered - and each
    // one is a day of somebody's work not yet attributed to a site.
    const bare = JSON.stringify([ISSUE]);
    const device = makeDevice({
        deviceId: 'd_bare',
        storage: {
            'scheduleData:v2': JSON.stringify(document({
                days: { '2026-08-10': dayFor('w_01', 'p_01') } })),
            'scheduleData:migrationIssues': bare
        }
    });
    device.State.load();

    check('the bare array is read rather than passed over',
        device.State.migrationIssues.length === 1
        && device.State.migrationIssues[0].value === 'שכונת רמות',
        JSON.stringify(device.State.migrationIssues.map(issue => issue.value)));
    check('and opening the app does not rewrite bytes it cannot vouch for',
        device.raw('scheduleData:migrationIssues') === bare,
        String(device.raw('scheduleData:migrationIssues')).slice(0, 70));

    const once = reopen(device);
    const twice = reopen(once);
    same('two reopens agree that the question is still open',
        [once.State.migrationIssues.length, once.raw('scheduleData:migrationIssues')],
        [twice.State.migrationIssues.length, twice.raw('scheduleData:migrationIssues')]);
    check('and it is the question that was staged, with its text intact',
        twice.State.migrationIssues.length === 1
        && twice.State.migrationIssues[0].message === ISSUE.message,
        JSON.stringify(twice.State.migrationIssues[0]));

    // Answering one is the point of carrying it. The answer has to survive the app being
    // closed, or the question comes back and the person answers it for ever.
    twice.call('dismissIssue', twice.State.migrationIssues[0]);
    const answered = reopen(twice);
    check('answering one leaves nothing to ask at the next open',
        answered.State.migrationIssues.length === 0,
        JSON.stringify(answered.State.migrationIssues));
    check('and the week it was about is untouched by the answer',
        screenPlace(answered, '2026-08-10', 'w_01') === 'p_01',
        String(screenPlace(answered, '2026-08-10', 'w_01')));
}

// ================================================================ 7
{
    suite('7: a way back written before it could carry the unanswered questions');

    // An undo entry from a build whose stack held the schedule and nothing else. It
    // cannot say what questions were open when it was written, so the app leaves whatever
    // is on the device alone rather than clearing them on that entry's behalf.
    const before = document({ days: { '2026-07-01': dayFor('w_01', 'p_02') } });
    const now = document({ days: { '2026-08-10': dayFor('w_01', 'p_01') } });

    const device = makeDevice({
        deviceId: 'd_undo',
        storage: {
            'farkad:deviceId': 'd_undo',
            'scheduleData:v2': JSON.stringify(now),
            // No `decisions`, no `forSchedule`: the shape the older build wrote.
            'scheduleData:undoStack': JSON.stringify([
                { at: '2026-08-09T10:00:00.000Z', schedule: JSON.stringify(before) }
            ]),
            'scheduleData:v2backup': JSON.stringify(before)
        }
    });
    device.State.load();
    device.State.migrationIssues = [ISSUE];
    given('a question is open and written down',
        device.call('writeIssues', [ISSUE]) === true
        && String(device.raw('scheduleData:migrationIssues')).includes('שכונת רמות'));

    const said = [];
    device.ctx.askTell = message => {
        said.push(typeof message === 'string' ? message : JSON.stringify(message));
        return Promise.resolve();
    };
    device.ctx.askConfirm = () => Promise.resolve(true);

    await device.call('restoreLocalBackup');

    check('the way back is taken, and said so in the app’s own word',
        said.length === 1 && said[0] === 'שוחזר.', JSON.stringify(said));
    check('and the week it holds is the week on the record',
        screenPlace(device, '2026-07-01', 'w_01') === 'p_02'
        && screenPlace(device, '2026-08-10', 'w_01') === null,
        JSON.stringify([screenPlace(device, '2026-07-01', 'w_01'),
            screenPlace(device, '2026-08-10', 'w_01')]));
    check('the question is not cleared on the old entry’s behalf',
        device.State.migrationIssues.length === 1,
        JSON.stringify(device.State.migrationIssues.map(issue => issue.value)));
    check('and the state being left became a way back that CAN carry questions',
        JSON.parse(device.raw('scheduleData:undoStack'))
            .some(entry => typeof entry.decisions === 'string'
                && entry.decisions.includes('שכונת רמות')),
        String(device.raw('scheduleData:undoStack')).slice(0, 70));

    const once = reopen(device);
    const twice = reopen(once);
    same('two reopens agree about the restored week',
        [screenPlace(once, '2026-07-01', 'w_01'), screenPlace(once, '2026-08-10', 'w_01')],
        [screenPlace(twice, '2026-07-01', 'w_01'), screenPlace(twice, '2026-08-10', 'w_01')]);
    check('and it is the week the entry held',
        screenPlace(twice, '2026-07-01', 'w_01') === 'p_02',
        String(screenPlace(twice, '2026-07-01', 'w_01')));

    // RED. The question was kept on this screen because the old entry could not speak for
    // it - and the record on the disk still names the schedule that was replaced, so the
    // next open judges it stale and shows nothing. The bytes are still there: the person
    // is shown an open question once and never again, and nothing says so.
    check('a question the restore left standing is still there at the next open',
        once.State.migrationIssues.length === device.State.migrationIssues.length,
        JSON.stringify({ afterRestore: device.State.migrationIssues.length,
            afterReopen: once.State.migrationIssues.length,
            stillOnDisk: String(once.raw('scheduleData:migrationIssues'))
                .includes('שכונת רמות') }));
}

report();
