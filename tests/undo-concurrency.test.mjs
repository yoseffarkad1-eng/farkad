// An undo belongs to the edit it reverses, not to every later edit of that worker-day.
// These are synthetic devices and a fake cloud; nothing connects to Firebase.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { makeDevice, makeCloud, settle } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const DATE = '2026-10-08';
const OTHER_DATE = '2026-10-07';
const SOURCE_DATE = '2026-10-06';
function device(id, options = {}) {
    const d = makeDevice({ deviceId: id, ...options });
    for (const file of ['js/ui/undo.js', 'js/ui/day.js', 'js/ui/sheet.js']) {
        vm.runInContext(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), d.ctx, { filename: file });
    }
    d.setToday(DATE); d.State.date = DATE; d.State.layer = 'actual';
    d.messages = [];
    d.ctx.askTell = async message => { d.messages.push(message); };
    d.ctx.askConfirm = async () => true;
    d.ctx.renderWorkerPicker = () => {};
    return d;
}
function seed(d) {
    d.State.schedule.workers = [
        { id: 'w_a', name: 'SYNTHETIC يوسف', active: true, dailyRate: 500, hourlyRate: 50 },
        { id: 'w_b', name: 'SYNTHETIC דוד', active: true, dailyRate: 600, hourlyRate: 60 }
    ];
    d.State.schedule.places = [{ id: 'p_a', name: 'TEST A', active: true }, { id: 'p_b', name: 'TEST B', active: true }];
    given('synthetic roster committed', d.State.commitRoster() === true);
    return d;
}
const record = (d, id = 'w_a', date = DATE, layer = 'actual') =>
    d.call('snapshotWorkerDay', date, layer, id);
const sites = (d, id = 'w_a', date = DATE, layer = 'actual') =>
    record(d, id, date, layer).entries.map(entry => entry.placeId);
function assignment(d, id = 'w_a', place = 'p_a', date = DATE, rate = 'normal', hours = 0) {
    return d.call('assignPlace', d.State.schedule, date, id, 'actual', place, rate, hours);
}
function edit(d, id = 'w_a', place = 'p_a', rate = 'normal', hours = 0) {
    return d.call('editWithUndo', id, 'TEST assignment', () => assignment(d, id, place, DATE, rate, hours));
}
function reopen(d) {
    const r = device(d.id + '_reopened', { storage: d.dump() });
    r.State.load();
    return r;
}
async function connectedPair() {
    const a = seed(device('d_undo_a')); const b = device('d_undo_b'); const cloud = makeCloud();
    for (const d of [a, b]) { d.Sync.pushDelayMs = 6; d.Sync.connect(cloud.adapter); await settle(250); }
    return { a, b, cloud, disconnect() { a.Sync.disconnect(); b.Sync.disconnect(); } };
}
function unchangedAfterRefusal(d, invoke, name) {
    const before = JSON.stringify(d.State.schedule);
    const bytes = d.dump(); const messages = d.messages.length;
    d.call(invoke);
    same(name + ': memory unchanged', JSON.stringify(d.State.schedule), before);
    same(name + ': durable bytes unchanged', d.dump(), bytes);
    check(name + ': refusal explained', d.messages.length > messages
        && String(d.messages.at(-1)).includes('השתנ'));
    same(name + ': no opposite action offered', d.global(invoke === 'runUndo' ? 'redoAction' : 'undoAction'), null);
}

{
    suite('U1: undo cannot erase work received from a second device');
    const p = await connectedPair(); const { a, b, cloud } = p;
    given('A assignment committed', edit(a) === true); await settle(300);
    given('B adds second site', b.State.commit(assignment(b, 'w_a', 'p_b')) === true); await settle(300);
    given('both devices received both sites', sites(a).length === 2 && sites(b).length === 2);
    const expected = record(a); const cloudBefore = JSON.stringify(cloud.doc);
    unchangedAfterRefusal(a, 'runUndo', 'intervening second site'); await settle(300);
    same('B keeps both sites', record(b), expected);
    same('cloud is unchanged', JSON.stringify(cloud.doc), cloudBefore);
    same('reopening keeps both sites', record(reopen(a)), expected);
    p.disconnect();
}

for (const kind of ['hours', 'double day', 'holiday', 'stamped rates']) {
    suite('U2: undo refuses intervening ' + kind);
    const d = seed(device('d_' + kind)); given('original edit committed', edit(d, 'w_a', 'p_a', 'extra', 2));
    let change;
    if (kind === 'hours' || kind === 'double day') change = d.call('setRate', d.State.schedule,
        DATE, 'w_a', 'actual', 'p_a', kind === 'hours' ? 'extra' : 'double', 4);
    else if (kind === 'holiday') change = d.call('markAbsent', d.State.schedule, DATE, 'w_a', 'actual');
    else {
        // A received/imported fact, not a new rule that restamps a historical day.
        const changed = record(d); changed.rates = { daily: 750, hourly: 75 };
        d.State.schedule.days[DATE].actual.w_a = changed;
        change = { path: 'days.' + DATE + '.actual.w_a', value: changed };
    }
    given('later fact committed', d.State.commit(change));
    const expected = record(d);
    unchangedAfterRefusal(d, 'runUndo', kind);
    same('reopen retains ' + kind, record(reopen(d)), expected);
}

{
    suite('U3: ordinary undo/redo respects stamps and unrelated records');
    const d = seed(device('d_roundtrip')); given('edited empty worker-day', edit(d));
    const after = record(d);
    given('unrelated worker saved', d.State.commit(assignment(d, 'w_b', 'p_b')));
    given('unrelated date saved', d.State.commit(assignment(d, 'w_a', 'p_b', OTHER_DATE)));
    given('unrelated layer saved', d.State.commit(d.call('assignPlace', d.State.schedule,
        DATE, 'w_a', 'plan', 'p_b')));
    const unrelated = [record(d, 'w_b'), record(d, 'w_a', OTHER_DATE), record(d, 'w_a', DATE, 'plan')];
    d.call('runUndo');
    same('undo removes original assignment', sites(d), []);
    same('undo keeps stamped rate', record(d).rates, after.rates);
    d.call('runRedo'); same('redo restores exact original assignment', record(d), after);
    d.call('runUndo'); d.call('runRedo'); same('repeat round trip works', record(d), after);
    same('other worker/date/layer untouched', [record(d, 'w_b'), record(d, 'w_a', OTHER_DATE), record(d, 'w_a', DATE, 'plan')], unrelated);
    same('no conflict message for disjoint changes', d.messages, []);
    same('reopen retains completed redo', record(reopen(d)), after);
}

{
    suite('U4: redo cannot replace a new holiday after undo');
    const d = seed(device('d_redo')); given('edit committed', edit(d)); d.call('runUndo');
    given('new holiday committed', d.State.commit(d.call('markAbsent', d.State.schedule, DATE, 'w_a', 'actual')));
    unchangedAfterRefusal(d, 'runRedo', 'redo after holiday');
    const reopened = reopen(d);
    same('holiday remains on reopen', reopened.call('isAbsent', reopened.State.schedule, DATE, 'w_a', 'actual'), true);
}

{
    suite('U5: same fact with different object key order does not block undo');
    const d = seed(device('d_keyorder')); given('edit committed', edit(d));
    const before = record(d);
    const equivalent = { rates: { hourly: before.rates.hourly, daily: before.rates.daily }, entries: before.entries };
    d.State.schedule.days[DATE].actual.w_a = equivalent;
    given('equivalent record committed', d.State.commit({ path: 'days.' + DATE + '.actual.w_a', value: equivalent }));
    d.call('runUndo'); same('same fact undo succeeds', sites(d), []);
    d.call('runRedo'); same('same fact redo succeeds', sites(d), ['p_a']);
    same('same fact produces no refusal', d.messages, []);
}

for (const direction of ['runUndo', 'runRedo']) {
    suite('U6: failed durable ' + direction + ' remains retryable');
    const d = seed(device('d_full_' + direction)); given('edit committed', edit(d));
    if (direction === 'runRedo') d.call('runUndo');
    const before = record(d); const bytes = d.dump();
    d.ctx.askConfirm = async message => { d.messages.push(message); return false; };
    d.setQuota(() => true); d.call(direction);
    same('failed commit keeps the record', record(d), before);
    same('failed commit keeps durable bytes', d.dump(), bytes);
    check('save failure explicitly explained', d.messages.some(message => message.title === 'הרישום לא נשמר'));
    check('failed action stays available', typeof d.global(direction === 'runUndo' ? 'undoAction' : 'redoAction') === 'function');
    same('failed commit does not arm opposite action', d.global(direction === 'runUndo' ? 'redoAction' : 'undoAction'), null);
    d.setQuota(null); d.call(direction);
    same('retry performs requested direction', sites(d), direction === 'runUndo' ? [] : ['p_a']);
    same('retry survives reopen', sites(reopen(d)), direction === 'runUndo' ? [] : ['p_a']);
}

for (const operation of ['bulk', 'clear site', 'copy']) {
    suite('U7: ' + operation + ' undo refuses a changed member without partial writes');
    const d = seed(device('d_group_' + operation));
    if (operation === 'bulk') d.call('bulkAssign', d.State.place('p_a'));
    else if (operation === 'clear site') {
        given('first site saved', d.State.commit(assignment(d)));
        given('second worker saved', d.State.commit(assignment(d, 'w_b')));
        vm.runInContext("pickerPlaceId = 'p_a'", d.ctx);
        await d.call('clearWorkerPicker');
    } else {
        given('copy source first worker saved', d.State.commit(assignment(d, 'w_a', 'p_a', SOURCE_DATE)));
        given('copy source second worker saved', d.State.commit(assignment(d, 'w_b', 'p_a', SOURCE_DATE)));
        d.call('copyDayInto', SOURCE_DATE, 'actual', 'TEST source', 'TEST empty');
    }
    given('other edit saved in touched group', d.State.commit(assignment(d, 'w_a', 'p_b')));
    const expected = [record(d), record(d, 'w_b')];
    unchangedAfterRefusal(d, 'runUndo', operation);
    const reopened = reopen(d);
    same('both group members survive reopen', [record(reopened), record(reopened, 'w_b')], expected);
}

{
    suite('U8: copied first-write stamps allow undo and redo');
    const d = seed(device('d_copy_roundtrip'));
    given('source saved', d.State.commit(assignment(d, 'w_a', 'p_a', SOURCE_DATE, 'double')));
    d.call('copyDayInto', SOURCE_DATE, 'actual', 'TEST source', 'TEST empty');
    const after = record(d); d.call('runUndo'); same('copy undone', sites(d), []);
    d.call('runRedo'); same('copy redone despite preserved stamp', record(d), after);
}

{
    suite('U9: clear-site confirmation cannot retarget another day or overwrite a new fact');
    const d = seed(device('d_dialog'));
    given('original day saved', d.State.commit(assignment(d)));
    given('other day saved', d.State.commit(assignment(d, 'w_a', 'p_a', OTHER_DATE)));
    vm.runInContext("pickerPlaceId = 'p_a'", d.ctx);
    d.ctx.askConfirm = async () => { d.State.date = OTHER_DATE; return true; };
    const other = record(d, 'w_a', OTHER_DATE); await d.call('clearWorkerPicker');
    same('confirmed original day cleared', sites(d), []);
    same('newly viewed day untouched', record(d, 'w_a', OTHER_DATE), other);
    d.State.date = DATE; given('original day refilled', d.State.commit(assignment(d)));
    d.ctx.askConfirm = async () => { given('later fact saved during dialog', d.State.commit(assignment(d, 'w_a', 'p_b'))); return true; };
    await d.call('clearWorkerPicker');
    same('changed worker-day retained whole', sites(d), ['p_a', 'p_b']);
    check('changed confirmation explained', String(d.messages.at(-1)).includes('השתנ'));
}

report();
