// ↶ is taken back only over what this phone's own step left there - on devices in Node.
//
//   node tests/undo-stale.test.mjs
//
// Two faults the audit of v192 reproduced, each written down here so it cannot happen twice.
//
// (1) ↶ STAYED ARMED OVER ANOTHER PHONE'S CORRECTION. The step is two copies of a man's day taken
// at the edit, and the header's ↶ holds it until the day is left. Phone A puts a man on site 1;
// phone B corrects him - another site, three extra hours; A adopts that and says «מסונכרן»; ↶ on
// A then wrote A's OLD copy over B's record, on A, on B and in the cloud, all three saying
// «מסונכרן», and ↷ brought back A's own edit, never B's. The same through the two steps over
// several men («N עובדים נרשמו ב…», «N עובדים הוסרו מ…»). Now a step is written only over a day
// that still holds what this phone's last step left on it (undoStands, js/ui/undo.js): otherwise
// nothing is written, both directions are forgotten and the person is told; a step over several
// men goes back man by man and says how many it left.
//
// (4) «הכל חופש» LEFT ↶ HOLDING THE STEP BEFORE IT. Pressed to take the holiday back, ↶ removed
// an earlier man's work day and left the absences. The holiday is its own single step now.
//
// Real editWithUndo / runUndo / runRedo / bulkAssign / clearWorkerPicker / markAllHoliday, two
// devices on the harness's fake cloud. Synthetic names only.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeDevice, makeCloud, settle, settleUntil, loadOrder, sourceRoot } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const DATE = '2026-11-13';
const UI = ['js/ui/undo.js', 'js/ui/sitecolor.js', 'js/ui/sheet.js', 'js/ui/day.js'];
const sources = loadOrder().concat(UI).map(file => ({ file, code: readFileSync(join(sourceRoot(), file), 'utf8') }));

const STALE = 'הרישום הזה השתנה מאז, אולי ממכשיר אחר. הפעולה לא בוצעה ושום רישום לא שונה.';
const PARTIAL_ONE = 'רישום אחד השתנה מאז, אולי ממכשיר אחר, ונשאר כמו שהוא.';
const PARTIAL = count => `${count} רישומים השתנו מאז, אולי ממכשיר אחר, ונשארו כמו שהם.`;

function device(id) {
    const d = makeDevice({ deviceId: id, sources });
    d.setToday(DATE);
    d.State.date = DATE;
    d.Sync.pushDelayMs = 5;
    d.told = [];
    d.ctx.askTell = message => { d.told.push(typeof message === 'string' ? message : message.message); return Promise.resolve(); };
    d.ctx.askConfirm = () => Promise.resolve(true);
    return d;
}
function seed(d, men = 2) {
    const names = ['דוגמה א', 'דוגמה ב', 'דוגמה ג', 'דוגמה ד'];
    d.State.schedule.workers = names.slice(0, men).map((name, at) =>
        ({ id: 'w_0' + (at + 1), name, idNumber: '', phone: '', active: true, dailyRate: 500, hourlyRate: 60, payCycles: '' }));
    d.State.schedule.places = [{ id: 'p_01', name: 'אתר צפון', active: true }, { id: 'p_02', name: 'אתר דרום', active: true }];
    if (!d.State.save({ silent: true })) throw new Error('seed save failed');
}
// Two phones on one cloud, both holding the crew.
async function pair(men = 2) {
    const cloud = makeCloud();
    const A = device('d_a'); seed(A, men);
    A.Sync.connect(cloud.adapter);
    await settleUntil(() => A.Sync.status === 'synced' && cloud.doc, 3000);
    const B = device('d_b');
    B.Sync.connect(cloud.adapter);
    await settleUntil(() => B.State.schedule.workers.length === men, 3000);
    return { cloud, A, B };
}
const dayOf = (d, id) => JSON.stringify((((d.State.schedule.days[DATE] || {}).actual) || {})[id] || null);
const cloudDay = (cloud, id) => JSON.stringify((((cloud.doc.days || {})[DATE] || {}).actual || {})[id] || null);
const quiet = async (...devices) => { await settleUntil(() => devices.every(d => d.Sync.pendingCount() === 0), 3000); await settle(60); };
const armed = d => [typeof d.global('undoAction') === 'function', typeof d.global('redoAction') === 'function'];
const place = (d, id, site) => d.call('editWithUndo', id, 'נרשם', (date, layer) =>
    d.call('assignPlace', d.State.schedule, date, id, layer, site, 'normal', 0));
// The other phone's correction: another site, three extra hours.
const correct = d => (id => {
    d.State.commit(d.call('unassignPlace', d.State.schedule, DATE, id, 'actual', 'p_01'));
    d.State.commit(d.call('assignPlace', d.State.schedule, DATE, id, 'actual', 'p_02', 'extra', 3));
});

suite('every word, word for word - PROPOSED');
{
    const d = device('d_words');
    let text = null;
    try { text = d.global('UNDO_TEXT'); } catch (error) { text = null; }
    check('the block is there', Boolean(text));
    same('the step that found the record changed', text && text.stale, STALE);
    same('one man left as he is', text && text.partial(1), PARTIAL_ONE);
    same('several', text && text.partial(3), PARTIAL(3));
}

suite('↶ after another phone corrected the same man: nothing is written, anywhere, and it says so');
{
    const { cloud, A, B } = await pair();
    place(A, 'w_01', 'p_01');
    await settleUntil(() => A.Sync.pendingCount() === 0 && dayOf(B, 'w_01').includes('p_01'), 3000);
    correct(B)('w_01');
    await settleUntil(() => B.Sync.pendingCount() === 0 && dayOf(A, 'w_01').includes('p_02'), 3000);
    const corrected = dayOf(B, 'w_01');
    given('B\'s correction reached A, and A says synced', dayOf(A, 'w_01') === corrected && A.Sync.status === 'synced', dayOf(A, 'w_01'));
    given('↶ on A still holds its step', armed(A)[0]);
    A.call('runUndo');
    await quiet(A, B);
    same('on A the man\'s day is B\'s correction', dayOf(A, 'w_01'), corrected);
    same('and on B', dayOf(B, 'w_01'), corrected);
    same('and in the cloud', cloudDay(cloud, 'w_01'), corrected);
    same('the person is told, once, in the pinned words', A.told, [STALE]);
    same('and neither ↶ nor ↷ is left holding anything', armed(A), [false, false]);
}

suite('↷ after another phone recorded the man: the same');
{
    const { cloud, A, B } = await pair();
    place(A, 'w_01', 'p_01');
    await quiet(A, B);
    A.call('runUndo');
    await quiet(A, B);
    given('A took its own step back, and ↷ holds the way forward', !dayOf(A, 'w_01').includes('p_01') && armed(A)[1], dayOf(A, 'w_01'));
    B.State.commit(B.call('assignPlace', B.State.schedule, DATE, 'w_01', 'actual', 'p_02', 'extra', 3));
    await settleUntil(() => B.Sync.pendingCount() === 0 && dayOf(A, 'w_01').includes('p_02'), 3000);
    const recorded = dayOf(B, 'w_01');
    A.call('runRedo');
    await quiet(A, B);
    same('A, B and the cloud hold what B recorded', [dayOf(A, 'w_01'), dayOf(B, 'w_01'), cloudDay(cloud, 'w_01')], [recorded, recorded, recorded]);
    same('told, and nothing left armed', [A.told, armed(A)], [[STALE], [false, false]]);
}

suite('this phone\'s own step is still its own: after the cloud echoed it back, ↶ and ↷ work as they did');
{
    const { cloud, A, B } = await pair();
    const before = dayOf(A, 'w_01');
    given('the man had no day before', before === 'null', before);
    place(A, 'w_01', 'p_01');
    await settleUntil(() => A.Sync.pendingCount() === 0 && dayOf(B, 'w_01').includes('p_01'), 3000);
    await settle(80);
    const placed = dayOf(A, 'w_01');
    A.call('runUndo');
    await quiet(A, B);
    check('↶: the site is gone on A, on B and in the cloud', [dayOf(A, 'w_01'), dayOf(B, 'w_01'), cloudDay(cloud, 'w_01')].every(day => !day.includes('p_01')),
        dayOf(A, 'w_01'));
    same('nothing was said', A.told, []);
    same('↷ holds the way forward', armed(A), [false, true]);
    A.call('runRedo');
    await quiet(A, B);
    same('↷: the placement is back, byte for byte, on A, on B and in the cloud', [dayOf(A, 'w_01'), dayOf(B, 'w_01'), cloudDay(cloud, 'w_01')], [placed, placed, placed]);
    A.call('runUndo');
    await quiet(A, B);
    A.call('runRedo');
    await quiet(A, B);
    same('and back and forth again', [dayOf(A, 'w_01'), A.told], [placed, []]);
}

suite('a site filled in one tap («N עובדים נרשמו ב…»): ↶ clears the men still standing and leaves the one corrected');
{
    const { cloud, A, B } = await pair(3);
    A.call('bulkAssign', A.State.place('p_01'), DATE);
    await settleUntil(() => A.Sync.pendingCount() === 0 && dayOf(B, 'w_03').includes('p_01'), 3000);
    correct(B)('w_02');
    await settleUntil(() => B.Sync.pendingCount() === 0 && dayOf(A, 'w_02').includes('p_02'), 3000);
    const corrected = dayOf(B, 'w_02');
    A.call('runUndo');
    await quiet(A, B);
    same('the corrected man keeps the other phone\'s record on A, on B and in the cloud',
        [dayOf(A, 'w_02'), dayOf(B, 'w_02'), cloudDay(cloud, 'w_02')], [corrected, corrected, corrected]);
    check('the two others are off the site everywhere', ['w_01', 'w_03'].every(id =>
        [dayOf(A, id), dayOf(B, id), cloudDay(cloud, id)].every(day => !day.includes('p_01'))), dayOf(A, 'w_01') + dayOf(A, 'w_03'));
    same('and it says that one was left', A.told, [PARTIAL_ONE]);
}
{
    const { cloud, A, B } = await pair(2);
    A.call('bulkAssign', A.State.place('p_01'), DATE);
    await settleUntil(() => A.Sync.pendingCount() === 0 && dayOf(B, 'w_02').includes('p_01'), 3000);
    correct(B)('w_01');
    correct(B)('w_02');
    await settleUntil(() => B.Sync.pendingCount() === 0 && dayOf(A, 'w_02').includes('p_02') && dayOf(A, 'w_01').includes('p_02'), 3000);
    const now = [dayOf(B, 'w_01'), dayOf(B, 'w_02')];
    A.call('runUndo');
    await quiet(A, B);
    same('every man corrected: nothing written, on A or in the cloud', [[dayOf(A, 'w_01'), dayOf(A, 'w_02')], [cloudDay(cloud, 'w_01'), cloudDay(cloud, 'w_02')]], [now, now]);
    same('told the whole sentence, nothing left armed', [A.told, armed(A)], [[STALE], [false, false]]);
}
{
    const { A, B } = await pair(2);
    A.call('bulkAssign', A.State.place('p_01'), DATE);
    await quiet(A, B);
    A.call('runUndo');
    await quiet(A, B);
    check('nobody corrected: both men are off the site, and nothing is said',
        ['w_01', 'w_02'].every(id => !dayOf(A, id).includes('p_01') && !dayOf(B, id).includes('p_01')) && A.told.length === 0, A.told.join('|'));
}

suite('a site emptied («N עובדים הוסרו מ…»): ↶ puts back the men still standing and leaves the one recorded since');
{
    const { cloud, A, B } = await pair(3);
    ['w_01', 'w_02', 'w_03'].forEach(id => A.State.commit(A.call('assignPlace', A.State.schedule, DATE, id, 'actual', 'p_01', 'normal', 0)));
    await settleUntil(() => A.Sync.pendingCount() === 0 && dayOf(B, 'w_03').includes('p_01'), 3000);
    A.ctx.renderWorkerPicker = () => {};
    A.run ? A.run(`pickerPlaceId = 'p_01'; pickerDate = '${DATE}'; pickerLayer = 'actual';`) : A.call('eval', `pickerPlaceId = 'p_01'; pickerDate = '${DATE}'; pickerLayer = 'actual';`);
    await A.call('clearWorkerPicker');
    await settleUntil(() => A.Sync.pendingCount() === 0 && !dayOf(B, 'w_03').includes('p_01'), 3000);
    given('the site is empty on both phones', ['w_01', 'w_02', 'w_03'].every(id => !dayOf(A, id).includes('p_01') && !dayOf(B, id).includes('p_01')));
    B.State.commit(B.call('assignPlace', B.State.schedule, DATE, 'w_02', 'actual', 'p_02', 'extra', 3));
    await settleUntil(() => B.Sync.pendingCount() === 0 && dayOf(A, 'w_02').includes('p_02'), 3000);
    const recorded = dayOf(B, 'w_02');
    A.told.length = 0;
    A.call('runUndo');
    await quiet(A, B);
    same('the man recorded since keeps the other phone\'s record everywhere', [dayOf(A, 'w_02'), dayOf(B, 'w_02'), cloudDay(cloud, 'w_02')], [recorded, recorded, recorded]);
    check('the two others are back on the site everywhere', ['w_01', 'w_03'].every(id =>
        [dayOf(A, id), dayOf(B, id), cloudDay(cloud, id)].every(day => day.includes('p_01'))), dayOf(A, 'w_01'));
    same('and it says that one was left', A.told, [PARTIAL_ONE]);
}

suite('«הכל חופש» is its own step: ↶ after it takes the holiday back, and never the step before it');
{
    const d = device('d_holiday'); seed(d, 3);
    d.call('editWithUndo', 'w_01', 'דוגמה א נרשם', (date, layer) =>
        d.call('assignPlace', d.State.schedule, date, 'w_01', layer, 'p_01', 'normal', 2));
    const worked = dayOf(d, 'w_01');
    const stood = await d.call('markAllHoliday', null, null, DATE);
    given('the holiday stood: the two men without a record are away', stood === true
        && ['w_02', 'w_03'].every(id => d.call('isAbsent', d.State.schedule, DATE, id, 'actual')));
    same('↶ names the holiday', [armed(d)[0], d.global('undoLabel')], [true, 'חופש נרשם ל-2 עובדים']);
    d.call('runUndo');
    same('↶: the man who worked keeps his day, byte for byte', dayOf(d, 'w_01'), worked);
    same('and the two are no longer away', ['w_02', 'w_03'].map(id => d.call('isAbsent', d.State.schedule, DATE, id, 'actual')), [false, false]);
    same('nothing was said', d.told, []);
}
{
    // And the holiday's own step asks the same question as every other: a man another phone has
    // since put on a site keeps that day.
    const { cloud, A, B } = await pair(3);
    await A.call('markAllHoliday', null, null, DATE);
    await settleUntil(() => A.Sync.pendingCount() === 0 && dayOf(B, 'w_03').includes('absent'), 3000);
    B.State.commit(B.call('clearWorkerDay', B.State.schedule, DATE, 'w_02', 'actual'));
    B.State.commit(B.call('assignPlace', B.State.schedule, DATE, 'w_02', 'actual', 'p_02', 'normal', 0));
    await settleUntil(() => B.Sync.pendingCount() === 0 && dayOf(A, 'w_02').includes('p_02'), 3000);
    const recorded = dayOf(B, 'w_02');
    A.call('runUndo');
    await quiet(A, B);
    same('the man put on a site since keeps it everywhere', [dayOf(A, 'w_02'), dayOf(B, 'w_02'), cloudDay(cloud, 'w_02')], [recorded, recorded, recorded]);
    same('the two others are no longer away, on both phones', ['w_01', 'w_03'].map(id =>
        [A, B].map(d => d.call('isAbsent', d.State.schedule, DATE, id, 'actual'))), [[false, false], [false, false]]);
    same('and it says that one was left', A.told, [PARTIAL_ONE]);
}

report();
