// A device near the edge of its storage.
//
//   node tests/capacity.test.mjs
//
// Five megabytes is the whole of what iOS Safari gives this origin, and everything the
// app owns lives inside it: the record, the journal - now a family of keys per operation
// rather than one blob - the acknowledgements, the retirements, the write tick, the
// restore points and any quarantined bytes. A phone that fills up does not announce it:
// it refuses one write, and if the app believes that write anyway the evening is on the
// screen and nowhere else.
//
// So everything below COUNTS - keys off the raw localStorage dump, bytes charged the way
// a browser charges them: two per UTF-16 unit, key as well as value. Nothing estimates,
// and nothing reads the app's source to decide what the app should say.

import { makeDevice, makeCloud, settle } from './harness.mjs';
import { suite, check, given, report } from './runner.mjs';

const TICK = 6;
const MIB = 1024 * 1024;

// What the browser charges for a set of records. Not JSON.stringify of the dump: the
// separators would be counted and the keys would not, and it is exactly the keys that
// make a family of one small record per operation cost what it costs.
function bytesOf(dump) {
    return Object.keys(dump).reduce(
        (bytes, key) => bytes + (key.length + String(dump[key]).length) * 2, 0);
}

const opKeys = dump => Object.keys(dump).filter(key => key.indexOf(':op:') > 0);
const ackKeys = dump => Object.keys(dump).filter(key => key.indexOf(':ack:') > 0);
const beatKeys = dump => Object.keys(dump).filter(key => key.indexOf(':beat:') > 0);
const snapKeys = dump => Object.keys(dump).filter(key => key.startsWith('scheduleData:snap:'));

function roster(device, workers) {
    device.State.schedule.workers = [];
    for (let i = 1; i <= workers; i += 1) {
        device.State.schedule.workers.push({
            id: 'w_' + String(i).padStart(2, '0'),
            name: 'עובד ' + i, active: true, dailyRate: 400, hourlyRate: 50
        });
    }
    device.State.schedule.places = [
        { id: 'p_01', name: 'הרצליה', active: true },
        { id: 'p_02', name: 'תל אביב', active: true }
    ];
    device.State.save({ silent: true });
}

// Working days from a fixed Monday, Saturdays off. Fixed so that two runs of this suite
// count the same keys - the arithmetic below is exact, not approximate.
function workingDates(count, fromMs = Date.UTC(2026, 2, 2)) {
    const out = [];
    for (let step = 0; out.length < count; step += 1) {
        const day = new Date(fromMs + step * 86400000);
        if (day.getUTCDay() !== 6) out.push(day.toISOString().slice(0, 10));
    }
    return out;
}

// One evening entered the way the app enters one: a worker at a time, each its own
// commit, each its own journal record.
function recordDays(device, dates, workers) {
    let landed = 0;
    dates.forEach(date => {
        for (let i = 1; i <= workers; i += 1) {
            const id = 'w_' + String(i).padStart(2, '0');
            const change = device.call('assignPlace', device.State.schedule,
                date, id, 'actual', i % 2 ? 'p_01' : 'p_02');
            if (device.State.commit(change)) landed += 1;
        }
    });
    return landed;
}

// A disk with a real edge: every write is measured against what is already on it, and
// refused when it would not fit. A quota hook that simply says "no" tests the refusal;
// this tests the LADDER, because a write that fits after something is deleted lands.
function capAt(device, cap) {
    device.setQuota((key, value) => {
        const dump = device.dump();
        const had = Object.prototype.hasOwnProperty.call(dump, key)
            ? (key.length + String(dump[key]).length) * 2 : 0;
        return bytesOf(dump) - had + (key.length + String(value).length) * 2 > cap;
    });
}

const WORKERS = 5;
const SEASON = 156;                       // six months of working days
const SEASON_EDITS = WORKERS * SEASON;    // 780 worker-days, one operation each

// ------------------------------------------------- a season, a partial sync, a damage
let seasonDump = null;
{
    suite('a season, a partial sync and a damaged slot, counted');

    const site = makeDevice({ deviceId: 'd_site' });
    roster(site, WORKERS);

    // The office phone got there first, so this one's queue goes out as field updates
    // rather than as the first-sync seed - which would empty it in a single write and
    // prove nothing about a queue that is only half sent.
    const cloud = makeCloud({ doc: site.call('cloudDocument', site.State.schedule) });
    cloud.doc.updatedBy = 'd_office';

    const landed = recordDays(site, workingDates(SEASON), WORKERS);
    given('the season was recorded', landed === SEASON_EDITS);

    const recorded = site.dump();
    check('one operation on the disk per worker-day, and no mark yet',
        opKeys(recorded).length === SEASON_EDITS
        && ackKeys(recorded).length === 0 && beatKeys(recorded).length === 0,
        `${opKeys(recorded).length} op / ${ackKeys(recorded).length} ack / ${beatKeys(recorded).length} beat`);
    check('and the whole season, unsent, is inside the five megabytes the phone gives',
        site.Store.used() < site.Store.budget,
        `${bytesOf(recorded)} B = ${(bytesOf(recorded) / MIB * 100 / 5).toFixed(1)}% of 5 MiB, ${Object.keys(recorded).length} keys`);

    // Two writes of three hundred paths land; the signal dies before the third.
    let allowed = 2;
    cloud.reject = kind => {
        if (kind !== 'update') return null;
        if (allowed > 0) { allowed -= 1; return null; }
        const error = new Error('client is offline');
        error.code = 'unavailable';
        return error;
    };
    site.Sync.pushDelayMs = TICK;
    site.Sync.stuckMs = 200;
    site.Sync.connect(cloud.adapter);
    await settle(TICK * 80);

    const synced = site.dump();
    // Two FULL writes, whatever a full write holds. It was spelled 600 here, which was
    // two times the path cap at the time; the cap moved when every write started carrying
    // the ordering envelope, and a hard-coded 600 then measured arithmetic rather than
    // behaviour. Read from the app's own constant so it cannot drift again.
    const sentInTwo = site.global('MAX_PATHS_PER_WRITE') * 2;
    check('two writes landed and the third did not, so the rest is still owed',
        cloud.writes.length === 2 && site.Sync.pendingCount() === SEASON_EDITS - sentInTwo,
        `${cloud.writes.length} writes, ${site.Sync.pendingCount()} pending, `
        + `${sentInTwo} paths in two writes`);
    check('what the cloud has is off the disk, and took its acknowledgements with it',
        opKeys(synced).length === SEASON_EDITS - sentInTwo
        && ackKeys(synced).length === 0 && beatKeys(synced).length === 0,
        `${opKeys(synced).length} op / ${ackKeys(synced).length} ack / ${beatKeys(synced).length} beat`);
    check('the write tick is one key on the whole device, not one per record',
        Object.keys(synced).filter(key => key === 'farkad:writeTick').length === 1
        && (String('farkad:writeTick').length + String(synced['farkad:writeTick']).length) * 2 < 64,
        JSON.stringify(synced['farkad:writeTick']));

    site.Sync.disconnect();
    seasonDump = site.dump();
}

{
    suite('the queue mark will not read, and the season under it is not lost');

    // A truncated write, which is what a full device leaves behind. The MARK is what is
    // damaged; the operations under that slot are their own records and are still owed.
    const broken = '{"seq":1560,"items":{';
    const staged = Object.assign({}, seasonDump, { 'farkad:outbox': broken });
    const owed = opKeys(staged).length;
    given('there is a season under that slot', owed > 0);

    const phone = makeDevice({ storage: staged, deviceId: 'd_site' });
    phone.State.load();
    const held = phone.dump();

    check('the bytes that would not parse are still exactly where they were',
        held['farkad:outbox'] === broken, JSON.stringify(held['farkad:outbox']));
    check('and a copy of them was made and read back before anything else happened',
        held['farkad:outbox:damaged'] === broken, JSON.stringify(held['farkad:outbox:damaged']));
    check('the person is told, in the words the app tells them in',
        phone.global('Recovery').problems.some(problem =>
            problem.message === 'תור השליחה (עריכות שטרם נשלחו) לא נקרא: farkad:outbox.'),
        JSON.stringify(phone.global('Recovery').problems.map(p => p.message)));

    const before = phone.dump();
    const blocked = phone.State.commit(phone.call('assignPlace',
        phone.State.schedule, '2026-09-01', 'w_01', 'actual', 'p_01'));
    check('nothing is recorded until they have been told',
        blocked === false && bytesOf(phone.dump()) === bytesOf(before),
        `${blocked} / ${bytesOf(phone.dump()) - bytesOf(before)} B`);

    given('acknowledging releases the device', phone.global('Recovery').acknowledge() === true);

    const fortnight = recordDays(phone, workingDates(12, Date.UTC(2026, 8, 1)), WORKERS);
    given('a fortnight was recorded after it', fortnight === 12 * WORKERS);

    const after = phone.dump();
    const inSlotOne = opKeys(after).filter(key => key.startsWith('farkad:outbox:active1:'));
    check('recording continued in the next slot along, not over the damaged one',
        inSlotOne.length === 12 * WORKERS && after['farkad:outbox'] === broken,
        `${inSlotOne.length} in slot 1`);
    check('and the season under the damaged slot is still owed, every operation of it',
        opKeys(after).filter(key => key.startsWith('farkad:outbox:op:')).length === owed
        && phone.Sync.pendingCount() === owed + 12 * WORKERS,
        `${owed} owed + ${12 * WORKERS} new, pending ${phone.Sync.pendingCount()}`);
    // The queue is a family of keys now, and only the MARK would not parse. A recovery
    // that copied the whole family aside would double a season on the one device least
    // able to afford it - so the copy is measured against the operations it sits beside.
    const copied = ('farkad:outbox:damaged'.length
        + String(after['farkad:outbox:damaged']).length) * 2;
    const queued = opKeys(after).reduce(
        (bytes, key) => bytes + (key.length + String(after[key]).length) * 2, 0);
    check('the copy is of the mark, not of the season underneath it',
        copied * 100 < queued, `${copied} B copied beside ${queued} B of operations`);

    check('and all of it together is still inside the five megabytes',
        phone.Store.used() < phone.Store.budget,
        `${bytesOf(after)} B = ${(bytesOf(after) / MIB * 100 / 5).toFixed(1)}% of 5 MiB, ${Object.keys(after).length} keys`);
    check('so the app says there is room, because there is',
        phone.call('capacityState') === 'ok', phone.call('capacityState'));
}

// ---------------------------------------------------------------- honest arithmetic
{
    suite('Store.used() charges what the browser charges');

    const phone = makeDevice({ storage: seasonDump, deviceId: 'd_site' });
    phone.State.load();
    const dump = phone.dump();

    check('every key on the device is counted, and none twice',
        phone.Store.used() === bytesOf(dump),
        `${phone.Store.used()} vs ${bytesOf(dump)} over ${Object.keys(dump).length} keys`);
    check('and keys() sees exactly what the disk holds',
        phone.Store.keys().sort().join('\n') === Object.keys(dump).sort().join('\n'),
        `${phone.Store.keys().length} vs ${Object.keys(dump).length}`);

    // Hebrew is the whole of this app's text, and it is two bytes a character in every
    // browser that charges for localStorage. Counting characters understates a record by
    // half, and it is that half which decides whether the next write fits.
    const before = phone.Store.used();
    const hebrew = 'שם'.repeat(50);              // 100 UTF-16 units
    phone.Store.set('farkad:probe', hebrew);
    check('Hebrew costs two bytes a character, key included',
        phone.Store.used() - before === ('farkad:probe'.length + 100) * 2,
        `${phone.Store.used() - before} B`);
    phone.Store.remove('farkad:probe');
    check('and a removal gives the bytes back',
        phone.Store.used() === before, `${phone.Store.used()} vs ${before}`);
}

// ---------------------------------------------------------------- the reclaim ladder
{
    suite('the reclaim ladder pays for a real write with a restore point');

    const phone = makeDevice({ deviceId: 'd_tight' });
    roster(phone, 3);
    recordDays(phone, workingDates(6), 3);

    ['2026-08-10', '2026-08-11', '2026-08-12'].forEach(date => {
        phone.setToday(date);
        phone.call('takeDailySnapshot');
    });
    const points = snapKeys(phone.dump());
    given('there are restore points to spend', points.length === 3);

    // Room for the write tick and nothing else. The next edit is a journal record and a
    // schedule the size of the season - neither fits until something is thrown away.
    capAt(phone, phone.Store.used() + 64);
    const wrote = phone.State.commit(phone.call('assignPlace',
        phone.State.schedule, '2026-08-13', 'w_01', 'actual', 'p_02'));
    const after = phone.dump();

    check('the edit landed', wrote === true && phone.Store.full === false,
        `${wrote} / full=${phone.Store.full}`);
    check('and it is on the disk, not only on the screen',
        String(after['scheduleData:v2']).includes('2026-08-13')
        && opKeys(after).some(key => String(after[key]).includes('2026-08-13')),
        `${opKeys(after).length} operations on the disk`);
    check('exactly one restore point paid for it, and it was the oldest',
        snapKeys(after).length === points.length - 1
        && !snapKeys(after).includes('scheduleData:snap:2026-08-10'),
        JSON.stringify(snapKeys(after)));
    check('the album is not emptied to buy one write',
        snapKeys(after).includes('scheduleData:snap:2026-08-12'),
        JSON.stringify(snapKeys(after)));
}

// ---------------------------------------------------------------- genuinely full
{
    suite('a device with nowhere left refuses the edit rather than claiming it');

    const said = [];
    const phone = makeDevice({ deviceId: 'd_full' });
    phone.ctx.askTell = notice => { said.push(notice); };
    roster(phone, 3);
    recordDays(phone, workingDates(6), 3);

    // No restore points, and not a byte to spare: the ladder has nothing to sell.
    given('there is nothing expendable left', snapKeys(phone.dump()).length === 0);
    capAt(phone, phone.Store.used());

    const before = phone.dump();
    const wrote = phone.State.commit(phone.call('assignPlace',
        phone.State.schedule, '2026-08-20', 'w_02', 'actual', 'p_01'));
    const after = phone.dump();

    check('the edit is refused', wrote === false, String(wrote));
    check('nothing about the device moved - not one byte',
        bytesOf(after) === bytesOf(before)
        && Object.keys(after).length === Object.keys(before).length,
        `${bytesOf(after) - bytesOf(before)} B`);
    check('the day is on no disk here: not the record, not the journal',
        !String(after['scheduleData:v2']).includes('2026-08-20')
        && !opKeys(after).some(key => String(after[key]).includes('2026-08-20')),
        JSON.stringify(opKeys(after).length));
    check('and it is off the screen too, so nothing looks recorded that is not',
        phone.call('entriesFor', phone.State.schedule, '2026-08-20', 'w_02', 'actual').length === 0,
        JSON.stringify(phone.call('entriesFor', phone.State.schedule, '2026-08-20', 'w_02', 'actual')));
    check('the person is told it was not saved, in the words the app uses',
        said.length === 1 && said[0].title === 'הרישום לא נשמר'
        && said[0].message === 'אין מקום פנוי במכשיר, ולכן לא הצלחנו לשמור את השינוי - הוא בוטל '
            + 'כדי שלא ייראה כאילו נרשם. מה שכבר שמור לא נפגע. פנה מקום במכשיר '
            + 'או ייצא קובץ גיבוי, ונסה שוב.',
        JSON.stringify(said));
    check('and the refusal was reported as a full disk, not as a dead one',
        phone.Store.full === true && phone.Store.available === true,
        `full=${phone.Store.full} available=${phone.Store.available}`);

    // The days recorded before the wall are the ones somebody is being paid for.
    phone.setQuota(null);
    const reopened = makeDevice({ storage: after, deviceId: 'd_full' });
    reopened.State.load();
    check('every day recorded before the wall is still there at the next open',
        workingDates(6).every(date =>
            reopened.call('entriesFor', reopened.State.schedule, date, 'w_01', 'actual').length === 1),
        JSON.stringify(workingDates(6)));
}

// ------------------------------------------- the small records that hang off an edit
//
// An acknowledgement and a retirement are one key each, per operation, and they are the
// only records here that describe something else rather than being it. A mark that
// outlives the operation it describes is a byte nothing will ever collect, and a device
// that gains one per edit gains them for ever.

// A phone whose journal writes land and whose RECORD write does not: the edit is queued,
// the cloud takes it, the schedule on the disk does not hold it yet - so the
// acknowledgement has to STAY, and can be counted, instead of being written and collected
// inside one call.
async function ackHeldOpen(deviceId) {
    const phone = makeDevice({ deviceId });
    roster(phone, 1);
    const cloud = makeCloud({ doc: phone.call('cloudDocument', phone.State.schedule) });
    cloud.doc.updatedBy = 'd_office';
    phone.Sync.pushDelayMs = TICK;
    phone.Sync.connect(cloud.adapter);
    await settle(TICK * 20);

    phone.setQuota(key => key === 'scheduleData:v2');
    phone.State.commit(phone.call('assignPlace',
        phone.State.schedule, '2026-08-12', 'w_01', 'actual', 'p_01'));
    await settle(TICK * 30);
    phone.setQuota(null);
    return { phone, cloud };
}

{
    suite('an acknowledgement is one key, and it goes when its operation goes');

    const { phone, cloud } = await ackHeldOpen('d_ack');
    const held = phone.dump();
    given('the cloud took the edit', JSON.stringify(cloud.doc.days || {}).includes('p_01'));
    given('and the record on this device did not', phone.State.saveFailed === true);

    check('the cloud having it is its own small key beside the operation, not a rewrite',
        opKeys(held).length === 1 && ackKeys(held).length === 1,
        `${opKeys(held).length} op / ${ackKeys(held).length} ack`);
    check('and that key names the operation, so one edit can never mark another',
        ackKeys(held)[0].slice(ackKeys(held)[0].indexOf(':ack:') + 5)
            === JSON.parse(held[opKeys(held)[0]]).ops[0].opId,
        ackKeys(held)[0]);
    check('it is a mark, not a copy: a byte for a record of its own size',
        (ackKeys(held)[0].length + String(held[ackKeys(held)[0]]).length) * 2 < 200,
        `${(ackKeys(held)[0].length + String(held[ackKeys(held)[0]]).length) * 2} B against `
        + `${(opKeys(held)[0].length + String(held[opKeys(held)[0]]).length) * 2} B of operation`);

    // Now the device holds it too, so there is nothing left for the operation to protect.
    given('the record lands on the second try', phone.State.save({ silent: true }) === true);
    phone.Sync.collectQueueGarbage();
    const after = phone.dump();
    check('once the operation goes, its acknowledgement goes with it',
        opKeys(after).length === 0 && ackKeys(after).length === 0,
        `${opKeys(after).length} op / ${ackKeys(after).length} ack`);
    check('and the day is still the day, on the disk and on the screen',
        String(after['scheduleData:v2']).includes('2026-08-12')
        && phone.call('entriesFor', phone.State.schedule, '2026-08-12', 'w_01', 'actual').length === 1,
        JSON.stringify(phone.call('entriesFor', phone.State.schedule, '2026-08-12', 'w_01', 'actual')));
    phone.Sync.disconnect();
}

{
    suite('a restore takes the operations it supersedes, and their marks, off the disk');

    const { phone } = await ackHeldOpen('d_drop');
    phone.Sync.disconnect();

    // Closed and reopened with no signal, which is where a restore is actually pressed.
    const offline = makeDevice({ storage: phone.dump(), deviceId: 'd_drop' });
    offline.State.load();
    const before = offline.dump();
    given('the operation and its acknowledgement came back with the device',
        opKeys(before).length === 1 && ackKeys(before).length === 1);

    const restored = offline.call('normaliseSchedule',
        JSON.parse(JSON.stringify(offline.State.schedule)));
    restored.days['2026-08-12'] = {
        actual: { w_01: { entries: [{ placeId: 'p_02' }], rates: { daily: 400, hourly: 50 } } }
    };
    const result = await offline.Sync.replaceEverything(restored);
    const after = offline.dump();

    check('the restore reports itself done', result.ok === true && result.stage === 'done',
        JSON.stringify(result));
    check('the superseded operation is off the disk, and its acknowledgement with it',
        opKeys(after).length === 0 && ackKeys(after).length === 0,
        `${opKeys(after).length} op / ${ackKeys(after).length} ack`);

    const reopened = makeDevice({ storage: after, deviceId: 'd_drop2' });
    reopened.State.load();
    check('so the next open shows the day the restore put there',
        JSON.stringify(reopened.call('entriesFor',
            reopened.State.schedule, '2026-08-12', 'w_01', 'actual')) === '[{"placeId":"p_02"}]',
        JSON.stringify(reopened.call('entriesFor',
            reopened.State.schedule, '2026-08-12', 'w_01', 'actual')));
}

// ------------------------------------------- the same restore, over an older build's queue
//
// Every phone in the field is on v86 today, and a v86 queue is one record with the edits
// INSIDE it. This build reads those items as operations, gives them an id of their own
// and marks them with keys of their own - and the marks are permanent, because the one
// function that can take an item out of that record computes a different id from the one
// everything else computes. See dropOperations.
//
// The five checks below are RED at this commit. They are the point of the file.
const LEGACY_PATH = 'days.2026-08-12.actual.w_01';
const LEGACY_ITEM = { value: { entries: [{ placeId: 'p_01' }], rates: { daily: 400, hourly: 50 } }, seq: 4 };

function v86Disk(deviceId) {
    const older = makeDevice({ deviceId });
    roster(older, 1);
    const disk = older.dump();
    // The whole queue in one record, which is the only shape a v86 phone can write.
    disk['farkad:outbox'] = JSON.stringify({ seq: 4, items: { [LEGACY_PATH]: LEGACY_ITEM } });
    return disk;
}

async function restoreOver(device) {
    const restored = device.call('normaliseSchedule',
        JSON.parse(JSON.stringify(device.State.schedule)));
    restored.days['2026-08-12'] = {
        actual: { w_01: { entries: [{ placeId: 'p_02' }], rates: { daily: 400, hourly: 50 } } }
    };
    return device.Sync.replaceEverything(restored);
}

{
    suite('a restore over the queue an older build left behind');

    const phone = makeDevice({ storage: v86Disk('d_v86'), deviceId: 'd_v86' });
    phone.State.load();
    phone.State.save({ silent: true });
    given('the older build\'s edit is read as an operation and is still owed',
        phone.Sync.pendingCount() === 1);
    given('and it is the day on the screen',
        JSON.stringify(phone.call('entriesFor',
            phone.State.schedule, '2026-08-12', 'w_01', 'actual')) === '[{"placeId":"p_01"}]');

    const result = await restoreOver(phone);
    const after = phone.dump();

    check('the restore takes that item out of the record it is sitting in',
        !String(after['farkad:outbox']).includes(LEGACY_PATH),
        String(after['farkad:outbox']));
    check('and it does not report itself done over a queue it did not prune',
        !(result.ok === true && result.stage === 'done'
            && String(after['farkad:outbox']).includes(LEGACY_PATH)),
        JSON.stringify(result));

    const reopened = makeDevice({ storage: after, deviceId: 'd_v86b' });
    reopened.State.load();
    check('so the next open shows the day the restore put there, not the one it replaced',
        JSON.stringify(reopened.call('entriesFor',
            reopened.State.schedule, '2026-08-12', 'w_01', 'actual')) === '[{"placeId":"p_02"}]',
        JSON.stringify(reopened.call('entriesFor',
            reopened.State.schedule, '2026-08-12', 'w_01', 'actual')));
}

{
    suite('and the marks that older item collected along the way');

    const sending = makeDevice({ storage: v86Disk('d_v86m'), deviceId: 'd_v86m' });
    sending.State.load();
    sending.State.save({ silent: true });
    const cloud = makeCloud({ doc: sending.call('cloudDocument', sending.State.schedule) });
    cloud.doc.updatedBy = 'd_office';
    sending.Sync.pushDelayMs = TICK;
    sending.Sync.connect(cloud.adapter);
    await settle(TICK * 40);
    sending.Sync.disconnect();

    const sent = sending.dump();
    given('the cloud took it', JSON.stringify(cloud.doc.days || {}).includes('p_01'));
    check('the item an older build left gets a mark of its own for each answer',
        ackKeys(sent).length === 1 && beatKeys(sent).length === 1,
        `${ackKeys(sent).length} ack / ${beatKeys(sent).length} beat, `
        + `${(ackKeys(sent)[0] || '').length + (beatKeys(sent)[0] || '').length} chars of key`);

    // Bounded, at least: collecting again and again does not mint more of them.
    for (let round = 0; round < 5; round += 1) sending.Sync.collectQueueGarbage();
    const settled = sending.dump();
    check('and however often the device collects, it never mints a second pair',
        ackKeys(settled).length === 1 && beatKeys(settled).length === 1,
        `${ackKeys(settled).length} ack / ${beatKeys(settled).length} beat`);

    const offline = makeDevice({ storage: settled, deviceId: 'd_v86n' });
    offline.State.load();
    given('both marks came back with the device',
        ackKeys(offline.dump()).length === 1 && beatKeys(offline.dump()).length === 1);

    await restoreOver(offline);
    const after = offline.dump();
    check('the acknowledgement goes when the operation it describes goes',
        ackKeys(after).length === 0, JSON.stringify(ackKeys(after)));
    check('and so does the retirement, or they are bytes nothing will ever collect',
        beatKeys(after).length === 0, JSON.stringify(beatKeys(after)));
}

report();
