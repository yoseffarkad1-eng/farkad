// A held record is shown with both sides, and released by a person, one row at a time.
//
//   node tests/held.test.mjs
//
// tests/contested.test.mjs proves the hold: a write that lost a race while this phone was
// away is kept on this disk, sent by nothing, and counted. The line under the count said
// «רענן, בדוק את המסך, ואשר שוב» - refresh, look at the screen, confirm again. But the
// screen shows THIS phone's value: the held operation is still current on the disk and
// the journal lays it over every snapshot. So the person could not see what the other
// phone had recorded there, and re-recording the cell as told would have sent their own
// value over it, blind.
//
// Measured on the owner's phone, 11 September 2026: «הנתונים השתנו במכשיר אחר ... (6
// ממתינים לשליחה)», six cells of one Thursday, and nothing on the phone said which six or
// what the cloud held. A rescue export read on a laptop named them.
//
// So the ⋯ panel lists every held record - the day and the person, what this device
// recorded, what the cloud was last heard to hold - and offers the two honest answers.
// Both are a fresh explicit edit of the same path through State.commit, which is the one
// sanctioned way out of a hold; nothing here invents a third door.

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { makeDevice, makeCloud, settle, settleUntil } from './harness.mjs';
import { suite, check, given, report } from './runner.mjs';

const TICK = 6;
const DAY = '2026-08-12';
const PATH = `days.${DAY}.actual.w_01`;

// The sentences the panel speaks, pinned here as the product decisions they are.
const LEAD = 'רישומים שמכשיר אחר שינה בזמן שהטלפון הזה היה מנותק. כל שורה שמורה כאן ואינה נשלחת עד שתחליט.';
const UNHEARD = 'הענן טרם ענה - ההשוואה תוצג כשיענה.';
const ELSEWHERE = 'לשחרור: ערוך את הרישום הזה שוב מהמסך שלו.';
const KEEP = 'להשאיר את שלי';
const TAKE = 'לקחת מהענן';

// js/ui/settings.js draws a sheet and is not in the harness's load order; the panel's
// functions under test live there, so it is loaded over the device's stub document, the
// way tests/status.test.mjs loads it for the reason line.
function withPanel(device) {
    vm.runInContext(readFileSync(new URL('../js/ui/settings.js', import.meta.url), 'utf8'),
        device.ctx, { filename: 'js/ui/settings.js' });
    return device;
}

function phone(id) {
    const device = withPanel(makeDevice({ deviceId: id }));
    device.Sync.pushDelayMs = TICK;
    device.setToday('2026-08-20');
    device.ctx.askTell = () => Promise.resolve();
    device.State.schedule.workers = [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 0 }];
    device.State.schedule.places = [
        { id: 'p_00', name: 'התחלה', active: true },
        { id: 'p_01', name: 'הרצליה', active: true },
        { id: 'p_02', name: 'תל אביב', active: true }];
    device.State.save({ silent: true });
    return device;
}

// The same phone, opened again from what its disk holds, with no adapter: an open with no
// signal, which on a building site is the ordinary open.
function reopen(id, storage) {
    const device = withPanel(makeDevice({ deviceId: id, storage }));
    device.Sync.pushDelayMs = TICK;
    device.setToday('2026-08-20');
    device.ctx.askTell = () => Promise.resolve();
    device.State.load();
    return device;
}

const site = (device, day, placeId) => device.State.commit(device.call('assignPlace',
    device.State.schedule, day, 'w_01', 'actual', placeId));

// A phone that can WRITE but cannot HEAR - the stairwell. Withholding the snapshot is how
// the race happens; see tests/contested.test.mjs.
function tunnel(cloud) {
    const gate = { open: true, waiting: [], adapter: {} };
    Object.keys(cloud.adapter).forEach(name => {
        gate.adapter[name] = (...args) => cloud.adapter[name](...args);
    });
    gate.adapter.subscribe = (onNext, onError) => cloud.adapter.subscribe(
        snapshot => {
            if (gate.open) onNext(snapshot);
            else gate.waiting.push([onNext, snapshot]);
        }, onError);
    gate.close = () => { gate.open = false; };
    gate.release = () => {
        gate.open = true;
        const waiting = gate.waiting.slice();
        gate.waiting = [];
        waiting.forEach(([onNext, snapshot]) => onNext(snapshot));
    };
    return gate;
}

const cloud = makeCloud();
const inCloud = day => {
    const held = ((((cloud.doc || {}).days || {})[day] || {}).actual || {}).w_01;
    return ((held && held.entries) || []).map(item => item.placeId).sort().join();
};
const onPhone = (device, day) => {
    const held = (((device.State.schedule.days || {})[day] || {}).actual || {}).w_01;
    return ((held && held.entries) || []).map(item => item.placeId).sort().join();
};
const accepted = () => cloud.writes.filter(write => !write.replayed).length;
const sides = row => `${row.path} mine=${JSON.stringify(row.mine)} cloud=${JSON.stringify(row.cloud)} heard=${row.heard}`;

const a = phone('d_a');
const b = phone('d_b');
const gate = tunnel(cloud);
a.Sync.connect(cloud.adapter);
await settle(TICK * 10);
b.Sync.connect(gate.adapter);
await settle(TICK * 10);

// One race, on one day: A corrects while B cannot hear, B writes the same path, B loses
// and holds. Then B hears the winner. Returns B's held rows as the panel would read them.
async function race(day) {
    site(a, day, 'p_00');
    await settleUntil(() => inCloud(day) === 'p_00'
        && b.Sync._revision === cloud.doc.revision, 5000);
    given(`${day}: both phones read the same value at the same revision`,
        inCloud(day) === 'p_00' && b.Sync._revision === cloud.doc.revision,
        `cloud ${inCloud(day)} at ${cloud.doc && cloud.doc.revision}, B at ${b.Sync._revision}`);
    gate.close();
    site(a, day, 'p_01');
    await settleUntil(() => inCloud(day) === 'p_00,p_01', 5000);
    site(b, day, 'p_02');
    b.Sync.flush();
    await settleUntil(() => b.Sync.status === 'contested', 5000);
    given(`${day}: B lost and holds`, b.Sync.status === 'contested'
        && b.Sync.holdingContested() === true, b.Sync.status);
    gate.release();
    await settleUntil(() => b.Sync._revision === cloud.doc.revision, 5000);
    given(`${day}: and has now heard the winner`, b.Sync._revision === cloud.doc.revision,
        `${b.Sync._revision} of ${cloud.doc.revision}`);
    await settle(TICK * 20);
    return b.Sync.heldRecords();
}

// --------------------------------------------------------------- both sides, on the record
{
    suite('every held record is listed with both sides');

    const rows = await race(DAY);
    check('one record is held, and it is listed once', rows.length === 1,
        JSON.stringify(rows.map(sides)));
    const row = rows[0] || {};
    check('the row names the path', row.path === PATH, String(row.path));
    check('this device\'s side is what this phone recorded',
        ((row.mine || {}).entries || []).map(e => e.placeId).sort().join() === 'p_00,p_02',
        sides(row));
    check('the cloud\'s side is what the other phone recorded',
        ((row.cloud || {}).entries || []).map(e => e.placeId).sort().join() === 'p_00,p_01',
        sides(row));
    check('and the row says the cloud has been heard', row.heard === true, sides(row));
    check('the hold is still in force: nothing was sent by listing it',
        b.Sync.holdingContested() === true && inCloud(DAY) === 'p_00,p_01',
        `${b.Sync.holdingContested()} ${inCloud(DAY)}`);

    const said = b.call('describeHeldRecord', row, b.State.schedule);
    check('the row is titled with the weekday, the date and the person',
        said.title === 'יום רביעי 12/08 · ⁨דוד⁩', JSON.stringify(said.title));
    check('this device\'s side reads as sites, each name isolated as every name in a sentence is',
        said.mine === '\u2068התחלה\u2069 + \u2068תל אביב\u2069', JSON.stringify(said.mine));
    check('the cloud\'s side reads the same way', said.cloud === '\u2068התחלה\u2069 + \u2068הרצליה\u2069',
        JSON.stringify(said.cloud));
    check('and the row offers a decision', said.kind === 'day' && said.decidable === true
        && said.takeable === true, JSON.stringify(said));
    check('the panel\'s lead sentence is the pinned one', b.global('HELD_LEAD') === LEAD,
        b.global('HELD_LEAD'));
    check('and so are the two answers', b.global('HELD_KEEP') === KEEP
        && b.global('HELD_TAKE') === TAKE, `${b.global('HELD_KEEP')} / ${b.global('HELD_TAKE')}`);
}

// ------------------------------------------------------------------ keeping this device's
{
    suite('keeping this device\'s value sends it once, as a fresh operation');

    const before = accepted();
    const rows = b.Sync.heldRecords();
    given('the record is still held', rows.length === 1, String(rows.length));
    const done = await b.call('resolveHeldRecord', rows[0], false);
    check('the resolution reports that it committed', done === true, String(done));
    await settleUntil(() => accepted() > before, 8000);
    await settle(TICK * 40);
    check('exactly one new write landed', accepted() === before + 1,
        `${before} -> ${accepted()}`);
    check('and it is this device\'s value', inCloud(DAY) === 'p_00,p_02', inCloud(DAY));
    check('the queue is empty', b.Sync.pendingCount() === 0, String(b.Sync.pendingCount()));
    check('nothing is held any more', b.Sync.holdingContested() === false
        && b.Sync.heldRecords().length === 0, String(b.Sync.heldRecords().length));
    check('and the phone may say synced', b.Sync.status === 'synced', b.Sync.status);
    await settleUntil(() => onPhone(a, DAY) === 'p_00,p_02', 5000);
    check('the other phone adopts the decision', onPhone(a, DAY) === 'p_00,p_02', onPhone(a, DAY));
}

// ---------------------------------------------------------------------- taking the cloud's
{
    suite('taking the cloud\'s value replaces this device\'s record, after asking');

    const DAY2 = '2026-08-13';
    const rows = await race(DAY2);
    given('a second record is held', rows.length === 1, JSON.stringify(rows.map(sides)));
    const asked = [];
    b.ctx.askConfirm = options => { asked.push(options); return Promise.resolve(true); };
    const before = accepted();
    const cloudBytes = JSON.stringify(cloud.doc.days[DAY2].actual.w_01);
    const done = await b.call('resolveHeldRecord', rows[0], true);
    check('the resolution reports that it committed', done === true, String(done));
    check('the person was asked first, and told both sides', asked.length === 1
        && String(asked[0].message).indexOf('\u2068התחלה\u2069 + \u2068הרצליה\u2069') !== -1
        && String(asked[0].message).indexOf('\u2068התחלה\u2069 + \u2068תל אביב\u2069') !== -1
        && asked[0].ok === TAKE, JSON.stringify(asked));
    await settle(TICK * 60);
    check('this device now holds the cloud\'s record', onPhone(b, DAY2) === 'p_00,p_01',
        onPhone(b, DAY2));
    check('with the cloud\'s bytes, stamp and all',
        JSON.stringify(b.State.schedule.days[DAY2].actual.w_01) === cloudBytes,
        JSON.stringify(b.State.schedule.days[DAY2].actual.w_01));
    check('the cloud still holds what it held', inCloud(DAY2) === 'p_00,p_01'
        && JSON.stringify(cloud.doc.days[DAY2].actual.w_01) === cloudBytes, inCloud(DAY2));
    check('at most one write went out, and it changed nothing there',
        accepted() <= before + 1, `${before} -> ${accepted()}`);
    check('the queue is empty and nothing is held', b.Sync.pendingCount() === 0
        && b.Sync.heldRecords().length === 0 && b.Sync.holdingContested() === false,
        `${b.Sync.pendingCount()} pending, ${b.Sync.heldRecords().length} held`);
    check('and the phone may say synced', b.Sync.status === 'synced', b.Sync.status);
}

// ------------------------------------------------------------------- a cancelled decision
{
    suite('a decision the person cancels changes nothing');

    const DAY3 = '2026-08-16';
    const rows = await race(DAY3);
    given('a third record is held', rows.length === 1, JSON.stringify(rows.map(sides)));
    b.ctx.askConfirm = () => Promise.resolve(false);
    const before = accepted();
    const mine = onPhone(b, DAY3);
    const done = await b.call('resolveHeldRecord', rows[0], true);
    check('the resolution reports that nothing was committed', done === false, String(done));
    await settle(TICK * 30);
    check('this device still holds its own record', onPhone(b, DAY3) === mine, onPhone(b, DAY3));
    check('nothing was sent', accepted() === before, `${before} -> ${accepted()}`);
    check('and the record is still held', b.Sync.heldRecords().length === 1
        && b.Sync.holdingContested() === true, String(b.Sync.heldRecords().length));

    // --------------------------------------------------------- and a phone that has heard nothing
    suite('a phone that has heard nothing lists the record and offers no decision');

    const blind = reopen('d_b', b.dump());
    given('the reopened phone has heard nothing', blind.Sync._baseDoc === null,
        String(blind.Sync._baseDoc));
    const listed = blind.Sync.heldRecords();
    check('the held record is still listed', listed.length === 1,
        JSON.stringify(listed.map(sides)));
    const row = listed[0] || {};
    check('with this device\'s side', onPhone(blind, DAY3) === mine
        && ((row.mine || {}).entries || []).length > 0, sides(row));
    check('and no other side', row.heard === false && row.cloud === undefined, sides(row));
    const said = blind.call('describeHeldRecord', row, blind.State.schedule);
    check('the row says the cloud has not answered', said.cloud === UNHEARD,
        JSON.stringify(said.cloud));
    check('and offers no decision', said.decidable === false, JSON.stringify(said));
    blind.ctx.askConfirm = () => Promise.resolve(true);
    const pending = blind.Sync.pendingCount();
    const kept = await blind.call('resolveHeldRecord', row, false);
    const taken = await blind.call('resolveHeldRecord', row, true);
    check('neither answer is taken from it', kept === false && taken === false,
        `${kept} ${taken}`);
    check('and its disk is as it was', blind.Sync.pendingCount() === pending
        && onPhone(blind, DAY3) === mine && blind.Sync.heldRecords().length === 1,
        `${blind.Sync.pendingCount()} pending, ${onPhone(blind, DAY3)}`);
}

// ------------------------------------------------------------------- a record of another kind
{
    suite('a held record that is not a worker\'s day is listed, and says where its way out is');

    const row = { path: 'roster.workers.w_01', opId: 'x', heard: true,
        mine: { id: 'w_01', name: 'דוד', active: true },
        cloud: { id: 'w_01', name: 'דויד', active: true } };
    const said = b.call('describeHeldRecord', row, b.State.schedule);
    check('it is titled as the worker it is', said.kind === 'other'
        && said.title === 'עובד: ⁨דוד⁩', JSON.stringify(said));
    check('it says where the way out is', said.note === ELSEWHERE, JSON.stringify(said.note));
    check('and offers no button', said.decidable === false, JSON.stringify(said));
    const before = accepted();
    const done = await b.call('resolveHeldRecord', row, false);
    await settle(TICK * 20);
    check('the resolution refuses it', done === false && accepted() === before,
        `${done} ${before} -> ${accepted()}`);

    // The cloud holding NOTHING at the path is a side too - the other phone cleared the
    // day - and taking it clears the day here the way the ✕ on the day screen does.
    suite('taking a cloud that holds nothing clears the day');

    const DAY4 = '2026-08-17';
    site(b, DAY4, 'p_02');
    await settleUntil(() => inCloud(DAY4) === 'p_02', 5000);
    b.ctx.askConfirm = () => Promise.resolve(true);
    const gone = { path: `days.${DAY4}.actual.w_01`, opId: 'y', heard: true,
        mine: b.State.schedule.days[DAY4].actual.w_01, cloud: undefined };
    const described = b.call('describeHeldRecord', gone, b.State.schedule);
    check('the cloud\'s side reads as no record', described.cloud === 'אין רישום',
        JSON.stringify(described.cloud));
    const done2 = await b.call('resolveHeldRecord', gone, true);
    await settle(TICK * 40);
    check('the day is cleared here', done2 === true && onPhone(b, DAY4) === '',
        `${done2} ${onPhone(b, DAY4)}`);
    check('and the stamp the day was worked at stays on it',
        Boolean(b.State.schedule.days[DAY4].actual.w_01.rates),
        JSON.stringify(b.State.schedule.days[DAY4].actual.w_01));
}

report();
