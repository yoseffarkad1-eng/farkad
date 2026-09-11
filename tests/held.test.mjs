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
const MOVED = 'הרישום בענן השתנה בזמן שהחלון היה פתוח. ההשוואה עודכנה - בדוק שוב והחלט.';
const LEDGER_ROW = 'רישום כספי שהענן מחזיק אחרת. נשמר כאן ואינו נשלח; אין לו פתרון מהמסך הזה.';

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

// A cloud and two phones of their own, for a suite that breaks one of them: the module's
// pair above is shared by the suites that only read.
function crew(tag) {
    const sky = makeCloud();
    const won = phone(`d_${tag}_a`);
    const lost = phone(`d_${tag}_b`);
    const wall = tunnel(sky);
    won.Sync.connect(sky.adapter);
    lost.Sync.connect(wall.adapter);
    const at = day => ((((sky.doc || {}).days || {})[day] || {}).actual || {}).w_01;
    const c = {
        cloud: sky, a: won, b: lost, gate: wall,
        inCloud: day => {
            const held = at(day);
            if (held && held.absent === true) return 'ABSENT';
            return ((held && held.entries) || []).map(item => item.placeId).sort().join();
        },
        accepted: () => sky.writes.filter(write => !write.replayed).length,
        // The race of race() above, on this crew's own cloud.
        race: async day => {
            await settle(TICK * 10);
            site(won, day, 'p_00');
            await settleUntil(() => c.inCloud(day) === 'p_00'
                && lost.Sync._revision === sky.doc.revision, 5000);
            given(`${tag} ${day}: both phones read the same value at the same revision`,
                c.inCloud(day) === 'p_00' && lost.Sync._revision === sky.doc.revision,
                `cloud ${c.inCloud(day)}, B at ${lost.Sync._revision}`);
            wall.close();
            site(won, day, 'p_01');
            await settleUntil(() => c.inCloud(day) === 'p_00,p_01', 5000);
            site(lost, day, 'p_02');
            lost.Sync.flush();
            await settleUntil(() => lost.Sync.status === 'contested', 5000);
            given(`${tag} ${day}: B lost and holds`, lost.Sync.status === 'contested'
                && lost.Sync.holdingContested() === true, lost.Sync.status);
            wall.release();
            await settleUntil(() => lost.Sync._revision === sky.doc.revision, 5000);
            given(`${tag} ${day}: and has now heard the winner`,
                lost.Sync._revision === sky.doc.revision,
                `${lost.Sync._revision} of ${sky.doc.revision}`);
            await settle(TICK * 20);
            return lost.Sync.heldRecords();
        }
    };
    return c;
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

// ------------------------------------------------------------- and in the rescue export
{
    suite('the rescue export carries the held records, both sides, raw');

    // The owner's six were named FROM this file, and the file could not say what the
    // cloud held at those paths: the base document is memory. So the hunt for how the
    // cloud came to hold a third value, with one phone writing, had nothing to read.
    b.call('exportRecoveryData');
    check('the file was handed over', b.downloads.length === 1,
        JSON.stringify(b.downloads.map(file => file.name)));
    const file = JSON.parse((b.downloads[0] || { text: '{}' }).text);
    check('it carries the held records', Array.isArray(file.held) && file.held.length === 1,
        JSON.stringify(file.held));
    const row = (file.held || [])[0] || {};
    check('with this device\'s side, bytes and all',
        row.path === PATH && JSON.stringify(row.mine) === JSON.stringify(b.State.schedule.days[DAY].actual.w_01),
        JSON.stringify(row));
    check('and the cloud\'s side, bytes and all',
        JSON.stringify(row.cloud) === JSON.stringify(cloud.doc.days[DAY].actual.w_01) && row.heard === true,
        JSON.stringify(row));
    check('and the hold is still in force: the export decided nothing',
        b.Sync.holdingContested() === true && b.Sync.heldRecords().length === 1,
        String(b.Sync.heldRecords().length));
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
    blind.call('exportRecoveryData');
    const file = JSON.parse((blind.downloads[0] || { text: '{}' }).text);
    const exported = (file.held || [])[0] || {};
    check('its rescue export carries the record and says the cloud was not heard',
        (file.held || []).length === 1 && exported.heard === false && !('cloud' in exported)
        && JSON.stringify(exported.mine) === JSON.stringify(row.mine),
        JSON.stringify(file.held));
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

// --------------------------------------------- the cloud moved while the question was open
{
    suite('a cloud that moved while the question was open is not answered');

    // The row is what the base document held when the panel was drawn. A snapshot that
    // arrives while the confirmation is open changes the cloud's side, and the answer
    // the person gives is to the sentence they read, not to the record as it now is.
    // Writing the value from the row would send it over the other phone's newer
    // correction - and the sync layer would let it out, because `seen` is stamped at
    // commit time with the new base. The same file already refuses this race for the
    // carry approval. Measured by the reviewer's stale.mjs before this suite existed.
    const c = crew('mv');
    const rows = await c.race(DAY);
    given('the record is held and heard', rows.length === 1 && rows[0].heard === true,
        JSON.stringify(rows.map(sides)));
    let answer = null;
    const told = [];
    c.b.ctx.askConfirm = () => new Promise(resolve => { answer = resolve; });
    c.b.ctx.askTell = options => { told.push(options); return Promise.resolve(); };
    const pending = c.b.call('resolveHeldRecord', rows[0], true);
    await settle(TICK * 5);
    given('the question is open', typeof answer === 'function');
    // While the person reads it, the other phone marks the man absent, and this phone hears.
    c.a.State.commit(c.a.call('markAbsent', c.a.State.schedule, DAY, 'w_01', 'actual'));
    await settleUntil(() => c.inCloud(DAY) === 'ABSENT'
        && c.b.Sync._revision === c.cloud.doc.revision, 5000);
    given('the cloud moved under the open question', c.inCloud(DAY) === 'ABSENT'
        && c.b.Sync._revision === c.cloud.doc.revision, c.inCloud(DAY));
    const before = c.accepted();
    answer(true);
    const done = await pending;
    await settle(TICK * 40);
    check('the answer is refused', done === false, String(done));
    check('and nothing was sent over the newer record',
        c.accepted() === before && c.inCloud(DAY) === 'ABSENT', `${before} -> ${c.accepted()} ${c.inCloud(DAY)}`);
    check('the person is told, in the pinned sentence',
        told.some(item => (item && item.message) === MOVED), JSON.stringify(told));
    const again = c.b.Sync.heldRecords();
    check('the record is still held, and its cloud side is the new one',
        again.length === 1 && again[0].cloud && again[0].cloud.absent === true,
        JSON.stringify(again.map(sides)));

    // The same for keeping: a row drawn before the move is not acted on either.
    c.b.ctx.askConfirm = () => Promise.resolve(true);
    const kept = await c.b.call('resolveHeldRecord', rows[0], false);
    await settle(TICK * 20);
    check('keeping from a row drawn before the move is refused too',
        kept === false && c.accepted() === before, `${kept} ${before} -> ${c.accepted()}`);
    check('and said so', told.filter(item => (item && item.message) === MOVED).length === 2,
        String(told.length));
    // A row drawn now is acted on.
    const fresh = c.b.Sync.heldRecords()[0];
    const ok = await c.b.call('resolveHeldRecord', fresh, false);
    await settleUntil(() => c.inCloud(DAY) === 'p_00,p_02', 8000);
    check('a row drawn after the move goes through', ok === true && c.inCloud(DAY) === 'p_00,p_02',
        `${ok} ${c.inCloud(DAY)}`);
}

// ------------------------------------------- a hold the disk would not take, released here
{
    suite('a hold the disk would not take is released by the same decision, in the same session');

    // The marker is refused; the hold lives in _heldNow, a Set in memory that nothing ever
    // removed a path from. The fresh operation named the held one in `after` and carried
    // the current base in `seen` - and the pre-send pass still withheld it BY PATH, so
    // the button committed, sent nothing, and re-listed the row until a reopen. A
    // day-screen edit had the same session-long block; measured by heldnow.mjs.
    const c = crew('hn');
    c.b.setQuota(key => key.indexOf(':hold:') !== -1);
    const rows = await c.race(DAY);
    given('the hold is in memory only', c.b.Sync._heldNow.size === 1
        && rows.length === 1 && c.b.Sync._outbox.get(PATH).held !== true,
        `${c.b.Sync._heldNow.size} in memory, held flag ${c.b.Sync._outbox.get(PATH).held}`);
    const before = c.accepted();
    const done = await c.b.call('resolveHeldRecord', rows[0], false);
    await settleUntil(() => c.inCloud(DAY) === 'p_00,p_02', 8000);
    await settle(TICK * 40);
    check('the decision committed', done === true, String(done));
    check('and this device\'s value landed, in this session', c.inCloud(DAY) === 'p_00,p_02',
        c.inCloud(DAY));
    check('as exactly one write', c.accepted() === before + 1, `${before} -> ${c.accepted()}`);
    check('nothing is held, nothing is pending, and the phone may say synced',
        c.b.Sync.heldRecords().length === 0 && c.b.Sync.holdingContested() === false
        && c.b.Sync.pendingCount() === 0 && c.b.Sync.status === 'synced',
        `${c.b.Sync.heldRecords().length} held, ${c.b.Sync.pendingCount()} pending, ${c.b.Sync.status}`);
}

// --------------------------------------------- the status and the panel read the same set
{
    suite('the status line and the panel answer from the same set');

    // holdingContested asked the PHYSICAL set (any op with the hold mark, not retired)
    // while the panel reads the projection. A held operation superseded by a fresh edit
    // is out of the projection and can never be sent - but while the collection of its
    // batch is refused by the disk it is still physical, so the line said «contested»
    // over an empty panel. Measured by physical.mjs.
    const c = crew('ph');
    const rows = await c.race(DAY);
    given('the record is held, durably', rows.length === 1 && c.b.Sync._outbox.get(PATH).held === true);
    c.cloud.online = false;
    const OP = c.b.global('OP_MARK');
    c.b.blockRemoval(key => key.indexOf(OP) !== -1);
    const done = await c.b.call('resolveHeldRecord', rows[0], false);
    await settle(TICK * 40);
    check('the decision committed', done === true, String(done));
    const physicalHeld = c.b.Sync.physicalOperations().filter(op => op.held && !op.retired).length;
    given('the superseded operation is still on the disk, its mark with it', physicalHeld === 1,
        String(physicalHeld));
    check('the panel lists nothing', c.b.Sync.heldRecords().length === 0,
        String(c.b.Sync.heldRecords().length));
    check('and the status does not say contested over it',
        c.b.Sync.holdingContested() === false && c.b.Sync.status !== 'contested',
        `${c.b.Sync.holdingContested()} ${c.b.Sync.status}`);
}

// --------------------------------------------------------------- the sentences, once more
{
    suite('a rate that differs is said whatever the sites say');

    const row = { path: PATH, opId: 'r', heard: true,
        mine: { entries: [{ placeId: 'p_01' }], rates: { daily: 400, hourly: 0 } },
        cloud: { entries: [{ placeId: 'p_02' }], rates: { daily: 450, hourly: 0 } } };
    const said = b.call('describeHeldRecord', row, b.State.schedule);
    check('both sides carry their stamp when the stamps differ',
        said.mine.indexOf('תעריף 400') !== -1 && said.cloud.indexOf('תעריף 450') !== -1,
        JSON.stringify(said));
    const same = b.call('describeHeldRecord', { path: PATH, opId: 'r', heard: true,
        mine: { entries: [{ placeId: 'p_01' }], rates: { daily: 400, hourly: 0 } },
        cloud: { entries: [{ placeId: 'p_02' }], rates: { daily: 400, hourly: 0 } } }, b.State.schedule);
    check('and neither does when they agree', same.mine.indexOf('תעריף') === -1
        && same.cloud.indexOf('תעריף') === -1, JSON.stringify(same));

    suite('a worker no longer on the roster is named as such');
    const gone = b.call('describeHeldRecord', { path: `days.${DAY}.actual.w_77`, opId: 'g', heard: true,
        mine: { entries: [{ placeId: 'p_01' }] }, cloud: { entries: [] } }, b.State.schedule);
    check('the title says so rather than showing an id',
        gone.title === 'יום רביעי 12/08 · \u2068עובד שאינו ברשימה\u2069', JSON.stringify(gone.title));

    suite('a held advance is named; a held ledger entry says it has no way out here');
    const advance = b.call('describeHeldRecord', { path: 'advances.a_1', opId: 'v', heard: true,
        mine: { id: 'a_1', workerId: 'w_01', date: DAY, amount: 500 },
        cloud: { id: 'a_1', workerId: 'w_01', date: DAY, amount: 450 } }, b.State.schedule);
    check('the advance is titled with the person, the day and the sum',
        advance.title === 'מקדמה: \u2068דוד\u2069 · 12/08 · 500 ₪', JSON.stringify(advance.title));
    const ledger = b.call('describeHeldRecord', { path: 'ledger.advances.le_1', opId: 'l', heard: true,
        mine: { kind: 'advance', amount: 500 }, cloud: { kind: 'advance', amount: 450 } }, b.State.schedule);
    check('the ledger row carries its own sentence', ledger.title === 'רישום כספי'
        && ledger.note === LEDGER_ROW && ledger.decidable === false, JSON.stringify(ledger));

    suite('with no dialog to ask through, taking the cloud\'s is refused');
    const DAY6 = '2026-08-18';
    const rows = await race(DAY6);
    given('a record is held', rows.length === 1);
    b.ctx.askConfirm = undefined;
    const before = accepted();
    const done = await b.call('resolveHeldRecord', rows[0], true);
    await settle(TICK * 20);
    check('nothing is taken', done === false && accepted() === before
        && b.Sync.heldRecords().length === 1, `${done} ${before} -> ${accepted()}`);
    b.ctx.askConfirm = () => Promise.resolve(true);
    const kept = await b.call('resolveHeldRecord', b.Sync.heldRecords()[0], false);
    await settleUntil(() => accepted() > before, 8000);
    check('and keeping still works', kept === true && accepted() === before + 1, `${kept}`);
}

report();
