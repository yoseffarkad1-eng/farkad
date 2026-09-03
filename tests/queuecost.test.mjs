// What ASKING the queue a question costs, and what it must still answer.
//
//   node tests/queuecost.test.mjs
//
// The owner's iPhone showed «שגיאת סנכרון - הנתונים שמורים במכשיר הזה. (59 ממתינים
// לשליחה)» on 3 September 2026. The cloud is configured and the writes are being refused,
// so `op.sent` never becomes true, so `collectQueueGarbage` never collects, so the queue
// grows by one for every edit anybody makes until `firestore.rules` is deployed. That is
// the durable outbox working, and features/performance/contract-journal-growth.md says
// plainly that nothing may be forgotten to make it cheaper.
//
// This suite is about the OTHER half of that document - the half that needs nobody's
// decision. The queue was being DECODED on every question about it: twice inside
// `queueOperations` before a single edit could be written, once more in
// `collectQueueGarbage` on the save that follows, and once more again in `pendingCount`
// for the number on the status line, on every render. Four full rebuilds of every
// operation on the disk, per tap, for one edit's worth of new information.
//
// So the claims here are counted, not timed. A stopwatch on a shared container proves
// nothing that survives the next run; the number of times the app decodes bytes it has
// already decoded is a fact about the code. `decodeQueue` is a function DECLARATION in a
// classic script, which means it is a property of the global object, which means this
// suite can count its calls from outside without the app knowing.
//
// AND THE COUNTING IS THE SMALLER HALF. A cache over a queue on a disk two tabs share is
// how a day gets lost, so the second half of this file is the other tab: writing an
// operation, removing one, and acknowledging one, each time asking whether THIS tab's
// very next answer moved. It must, every time, because the cache is kept against the
// bytes and the bytes are re-read for every question - there is no signal being trusted
// and so no signal to get wrong. tests/probes.test.mjs and tests/concurrency.test.mjs are
// the reason those checks exist; this is the same hazard asked about one new cache.
//
// Nothing here loosens anything. The last three checks are the ones that would catch a
// change to what the queue may forget: six hundred edits leave six hundred pending paths,
// every one of them readable, none of them collectable - and a journal write the disk
// refuses still comes back false with nothing left behind.

import { makeDevice, sharedStore } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const WORKERS = [
    { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 },
    { id: 'w_02', name: 'שרה', active: true, dailyRate: 350, hourlyRate: 0 }
];
const PLACES = [
    { id: 'p_01', name: 'הרצליה', active: true },
    { id: 'p_02', name: 'תל אביב', active: true }
];

function seeded(options = {}) {
    const device = makeDevice(options);
    device.setToday('2026-08-20');
    device.ctx.askTell = () => Promise.resolve();
    device.State.schedule.workers = WORKERS.map(worker => Object.assign({}, worker));
    device.State.schedule.places = PLACES.map(place => Object.assign({}, place));
    device.State.save({ silent: true });
    return device;
}

// One ordinary edit, through the real commit: journal first, then the schedule, then a
// render. No adapter is connected anywhere in this file, so every operation it makes ends
// unsent - which is the state the collector cannot collect, and the state the owner's
// phone is in.
function edit(device, date, workerId, placeId = 'p_01') {
    return device.State.commit(device.call('assignPlace',
        device.State.schedule, date, workerId, 'actual', placeId));
}

// n edits, on n different days, so that no two of them project onto one path - a queue of
// n operations rather than one path rewritten n times.
function deepen(device, n, from = 0) {
    for (let i = from; i < from + n; i += 1) {
        const day = new Date(Date.UTC(2026, 3, 1));
        day.setUTCDate(day.getUTCDate() + i);
        const date = day.toISOString().slice(0, 10);
        edit(device, date, i % 2 === 0 ? 'w_01' : 'w_02');
    }
}

// How many times the app decodes the queue while `act` runs.
//
// `decodeQueue` is replaced on the context's global object and the app's own calls resolve
// through it, so this counts the production path rather than a copy of it. Restored
// afterwards, because a device usually goes on to be asked something else.
function decodesDuring(device, act) {
    const original = device.ctx.decodeQueue;
    given('decodeQueue is reachable on the device', typeof original === 'function',
        typeof original);
    let count = 0;
    device.ctx.decodeQueue = function (records) {
        count += 1;
        return original(records);
    };
    try { act(); } finally { device.ctx.decodeQueue = original; }
    return count;
}

// The status line, as a person reads it. The harness's document answers null for every
// element, so the one element this needs is given to it.
function noticeText(device) {
    device.__notice = { textContent: '' };
    device.ctx.document.getElementById = id => (id === 'storageNotice' ? device.__notice : null);
    device.call('updateSyncNotice');
    return device.__notice.textContent;
}

// ================================================================ one edit, one decode
{
    suite('an edit decodes the queue once, however deep the queue is');

    const device = seeded({ deviceId: 'd_depth' });
    deepen(device, 30);
    given('thirty edits are queued and none of them was sent',
        device.Sync.pendingCount() === 30, String(device.Sync.pendingCount()));

    // Warm: the very first question of a session decodes, and must. What is being counted
    // is the SECOND edit's worth of questions, which is every edit the crew ever makes.
    device.Sync.pendingCount();
    const shallow = decodesDuring(device, () => edit(device, '2026-09-01', 'w_01'));

    deepen(device, 270, 30);
    given('three hundred edits are queued and none of them was sent',
        device.Sync.pendingCount() === 301, String(device.Sync.pendingCount()));
    device.Sync.pendingCount();
    const deep = decodesDuring(device, () => edit(device, '2026-09-02', 'w_01'));

    // ONE. The journal write is one new operation on the disk; everything else asked about
    // that disk in the same tap is asking about bytes that have not moved since.
    check('one commit decodes the queue once',
        deep === 1, `${deep} decodes at 301 deep`);
    check('and the number does not grow with the depth of the queue',
        deep === shallow, `${shallow} decodes at 30 deep, ${deep} at 301 deep`);
}

// ================================================================ the render half
{
    suite('drawing the screen does not decode the queue');

    const device = seeded({ deviceId: 'd_render' });
    deepen(device, 120);
    given('a hundred and twenty edits are queued',
        device.Sync.pendingCount() === 120, String(device.Sync.pendingCount()));

    // render() ends in updateSyncNotice(), which asks pendingCount() for the number on the
    // line. Nothing has been written between these two draws - this is a person scrolling,
    // switching to the week and back, opening the ⋯ panel - and the answer cannot have
    // changed, but the queue was being rebuilt from the disk for each of them.
    noticeText(device);
    const drawing = decodesDuring(device, () => { noticeText(device); noticeText(device); });
    check('two redraws over an unchanged queue decode it no times',
        drawing === 0, `${drawing} decodes`);

}

// ================================================================ the owner's own line
{
    suite('the sentence on the owner\'s phone, character for character');

    // And the sentence itself, which is a product decision and not a number. Law 6.
    const device = seeded({ deviceId: 'd_owner' });
    deepen(device, 59);
    given('fifty-nine edits are waiting, as they were on the owner\'s phone',
        device.Sync.pendingCount() === 59, String(device.Sync.pendingCount()));
    device.Sync.status = 'error';
    check('the line the owner is reading is unchanged, character for character',
        noticeText(device) === 'שגיאת סנכרון - הנתונים שמורים במכשיר הזה. (59 ממתינים לשליחה)',
        JSON.stringify(noticeText(device)));
}

{
    suite('one waiting record is still said in the singular');

    const device = seeded({ deviceId: 'd_one' });
    edit(device, '2026-08-21', 'w_01');
    given('exactly one edit is waiting', device.Sync.pendingCount() === 1,
        String(device.Sync.pendingCount()));
    device.Sync.status = 'error';
    check('«רישום אחד ממתין לשליחה», not «1 ממתינים»',
        noticeText(device) === 'שגיאת סנכרון - הנתונים שמורים במכשיר הזה. (רישום אחד ממתין לשליחה)',
        JSON.stringify(noticeText(device)));
}

// ================================================================ the other tab
//
// One disk, two JavaScript worlds. Everything below is tab B writing through its own
// production code and tab A being asked immediately afterwards, with nothing in between:
// no reload, no event, no settle. A cache that answers out of what THIS tab last saw
// fails every one of these, which is the point of them.
{
    suite('another tab writing this disk is seen by the very next question');

    const shared = sharedStore();
    const tabA = seeded({ sharedStorage: shared, deviceId: 'd_tabA' });
    const tabB = makeDevice({ sharedStorage: shared, deviceId: 'd_tabB' });
    tabB.State.load();
    tabB.setToday('2026-08-20');

    edit(tabA, '2026-08-21', 'w_01');
    const before = tabA.Sync.pendingCount();
    given('this tab has one edit of its own waiting', before === 1, String(before));

    // B records a day. A has not reloaded, has not heard an event, and has just been
    // asked - so A's next answer is the only thing standing between B's work and a status
    // line that says everything is sent.
    edit(tabB, '2026-08-22', 'w_02');
    const after = tabA.Sync.pendingCount();
    check('an operation the other tab wrote is counted here immediately',
        after === before + 1, `${before} before, ${after} after`);
    check('and the path itself is in this tab\'s queue',
        tabA.Sync.pendingPaths().indexOf('days.2026-08-22.actual.w_02') !== -1,
        JSON.stringify(tabA.Sync.pendingPaths()));

    // B acknowledges its own operation. That is a new mark key beside an unchanged batch
    // record - the batch bytes do not move at all - and A must still see the count fall.
    const owed = tabB.Sync.physicalOperations()
        .filter(op => op.path === 'days.2026-08-22.actual.w_02').map(op => op.opId);
    given('the other tab holds the operation it just wrote', owed.length === 1,
        JSON.stringify(owed));
    tabB.Sync.markAcknowledged(owed);
    const acked = tabA.Sync.pendingCount();
    check('an acknowledgement the other tab wrote is seen here immediately',
        acked === before, `${after} before the mark, ${acked} after`);

    // And B takes the operation off the disk entirely. Reporting it as still owed would be
    // the queue resurrecting a record that is gone.
    tabB.Sync.dropOperations(owed);
    const dropped = tabA.Sync.pendingPaths();
    check('an operation the other tab removed is gone from this tab\'s queue',
        dropped.indexOf('days.2026-08-22.actual.w_02') === -1, JSON.stringify(dropped));
    same('and this tab still holds its own edit', dropped, ['days.2026-08-21.actual.w_01']);
}

// ================================================================ nothing is forgotten
//
// The three checks that would go red if anybody ever made the queue cheaper by making it
// shorter. features/performance/contract-journal-growth.md is explicit that when a device
// whose writes are being refused may forget a journal entry is a question for the owner,
// not for this repository, and these are what hold that line.
{
    suite('a queue that cannot send forgets nothing');

    const device = seeded({ deviceId: 'd_hold' });
    deepen(device, 600);

    const paths = device.Sync.pendingPaths();
    check('six hundred edits leave six hundred pending paths',
        paths.length === 600, `${paths.length} paths`);
    check('every one of them is still an operation this device holds',
        device.Sync.physicalOperations().length === 600,
        `${device.Sync.physicalOperations().length} operations`);

    // The collector runs on every save and has run six hundred times by now. Not one of
    // these is collectable, because not one of them was sent - which is exactly the
    // mechanism the contract describes, left exactly as it is.
    device.Sync.collectQueueGarbage();
    check('and the collector took none of them',
        device.Sync.pendingPaths().length === 600,
        `${device.Sync.pendingPaths().length} paths after collection`);

    // Reopened. The bytes are the record, so a session that has never seen this queue
    // reads back the same six hundred.
    const reopened = makeDevice({ storage: device.dump(), deviceId: 'd_reopen' });
    reopened.State.load();
    check('a session opening these bytes reads the same six hundred back',
        reopened.Sync.pendingPaths().length === 600,
        `${reopened.Sync.pendingPaths().length} paths on reopen`);
}

// ================================================================ law 3
{
    suite('a journal write the disk refuses is still not a saved edit');

    const device = seeded({ deviceId: 'd_refuse' });
    deepen(device, 20);
    const before = device.Sync.pendingPaths().length;
    given('twenty edits are queued', before === 20, String(before));

    // Every write of a new batch record refused, the way a full disk refuses one.
    device.setQuota(key => String(key).indexOf('farkad:outbox') === 0
        && String(key).indexOf(':op:') !== -1);
    const landed = edit(device, '2026-09-09', 'w_01');
    check('the commit says out loud that it did not land', landed === false, String(landed));
    check('and nothing was added to the queue',
        device.Sync.pendingPaths().length === before,
        `${before} before, ${device.Sync.pendingPaths().length} after`);
    check('and the day is not on the schedule either',
        !((State => State)(device.State).schedule.days || {})['2026-09-09'],
        JSON.stringify((device.State.schedule.days || {})['2026-09-09'] || null));

    // The refusal lifted, the same edit lands and is counted - so nothing above left the
    // queue in a state that swallows the next honest write.
    device.setQuota(null);
    const again = edit(device, '2026-09-09', 'w_01');
    check('and the next honest write still lands', again === true
        && device.Sync.pendingPaths().length === before + 1,
        `${again}, ${device.Sync.pendingPaths().length} paths`);
}

report();
