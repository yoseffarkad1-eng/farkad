// «שכר שעה נוספת 50 ₪», the undecided hourly stamp, and taking back a cycle change.
//
//   node tests/hourly50.test.mjs
//
// The owner, 2026-11-20: Yosef's four extra hours read «לא נכללו בסכום» because his day was
// stamped while his hourly rate was 0; he asked for 50 ₪ an extra hour for everybody,
// changeable; and a weekly boundary typed by mistake on 20/11 cut a stub out of the
// fortnight he meant Yosef to be on. Three things, each held here:
//   H1  a stamp's hourly 0 is read with the man's current hourly rate; nothing else moves
//   H2  a closed period's frozen sheet does not move
//   H3  the button: who it names, what it writes, and nothing else
//   H4  the new man's form opens at 50
//   H5  the last cycle boundary taken back, and refused where a closed period depends on it
//   H6  every word, pinned

import { makeDevice } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const OPEN = { ledgerWrites: true, carryAdvances: true };

function crew(options = {}) {
    const device = makeDevice(options);
    device.setToday('2026-11-20');
    device.State.schedule.workers = [
        { id: 'w_y', name: 'יוסף', active: true, dailyRate: 1000, hourlyRate: 0,
            payCycles: '2026-11-13=biweekly;2026-11-20=weekly' },
        { id: 'w_a', name: 'אחמד', active: true, dailyRate: 400, hourlyRate: 40 },
        { id: 'w_o', name: 'עומר', active: false, dailyRate: 350 }
    ];
    device.State.schedule.places = [{ id: 'p_01', name: 'אילון', active: true }];
    device.State.commitRoster();
    device.asked = [];
    device.told = [];
    device.answer = true;
    device.ctx.askConfirm = question => { device.asked.push(question); return Promise.resolve(device.answer); };
    device.ctx.askTell = said => { device.told.push(said); return Promise.resolve(true); };
    return device;
}

// A day through the model's own writers: stamped at its first write by iron law 2.
function work(device, worker, date, hours = 0) {
    device.State.commit(device.call('assignPlace',
        device.State.schedule, date, worker, 'actual', 'p_01', undefined, hours));
}

const row = (device, worker, from, to) =>
    device.call('payrollReport', device.State.schedule, from, to).find(item => item.workerId === worker);

// ---------------------------------------------------------------- H1

suite('H1: a stamp that says hourly 0 is priced at his hourly rate now; nothing else moves');
{
    const d = crew();
    work(d, 'w_y', '2026-11-16', 4);
    const stamp = d.State.schedule.days['2026-11-16'].actual.w_y.rates;
    same('the day is stamped while he has no hourly rate: daily 1000, hourly 0', stamp, { daily: 1000, hourly: 0 });
    const before = row(d, 'w_y', '2026-11-13', '2026-11-19');
    same('before: 1000, the hours unpriced - the owner\'s picture', [before.amount, Boolean(before.hoursUnpriced)], [1000, true]);

    d.State.worker('w_y').hourlyRate = 50;
    d.State.commitRoster();
    const after = row(d, 'w_y', '2026-11-13', '2026-11-19');
    same('after 50 ₪ an hour: 1000 + 4 × 50 = 1200, nothing unpriced', [after.amount, Boolean(after.hoursUnpriced)], [1200, false]);
    const days = d.call('workerDaysReport', d.State.schedule, d.State.worker('w_y'), '2026-11-13', '2026-11-19');
    same('his day says the same: 1200', days.map(day => day.amount), [1200]);
    same('and the stamp on the disk is not rewritten', JSON.parse(d.raw('scheduleData:v2')).days['2026-11-16'].actual.w_y.rates,
        { daily: 1000, hourly: 0 });

    // A stamped hourly rate above 0 is never replaced.
    work(d, 'w_a', '2026-11-16', 2);
    d.State.worker('w_a').hourlyRate = 90;
    d.State.worker('w_a').dailyRate = 999;
    d.State.commitRoster();
    same('a stamp of 40 an hour keeps 40, and its daily 400, whatever the roster says now',
        row(d, 'w_a', '2026-11-13', '2026-11-19').amount, 400 + 2 * 40);

    // The daily half of a 0-hourly stamp stays the stamp's.
    d.State.worker('w_y').dailyRate = 1500;
    d.State.commitRoster();
    same('his daily rate raised to 1500: the day is still 1000 + 200', row(d, 'w_y', '2026-11-13', '2026-11-19').amount, 1200);

    // The rule as one line, read both ways.
    same('the ruling is one line, on', d.global('HOURLY_ZERO_STAMP_UNDECIDED'), true);

    const disk = JSON.stringify(d.dump());
    row(d, 'w_y', '2026-11-01', '2026-11-30');
    d.call('workerDaysReport', d.State.schedule, d.State.worker('w_y'), '2026-11-01', '2026-11-30');
    check('reading writes nothing: the disk byte for byte', JSON.stringify(d.dump()) === disk);
}

// ---------------------------------------------------------------- H2

suite('H2: a closed period is read from its frozen record, and does not move');
{
    const d = crew({ flags: OPEN });
    d.State.worker('w_y').payCycles = '';
    d.State.commitRoster();
    work(d, 'w_y', '2026-10-19', 3);
    work(d, 'w_y', '2026-10-20');
    // The period of 2026-10-16 .. 2026-10-29, closed on the wage it was then: 2000.
    const frozenBefore = row(d, 'w_y', '2026-10-16', '2026-10-29');
    // The stamp is hourly 0 and the roster has none: 2000 either way, hours unpriced.
    same('the fortnight before any rate: 2000', frozenBefore.amount, 2000);
    // Freeze it the way a close does: an artifact with the wage it was closed on.
    d.State.schedule.ledger = d.State.schedule.ledger || {};
    d.State.schedule.ledger.advances = d.State.schedule.ledger.advances || {};
    d.State.schedule.ledger.advances.c_1 = { id: 'c_1', kind: 'closed', workerId: 'w_y',
        periodFrom: '2026-10-16', periodTo: '2026-10-29', gross: 2000,
        basis: { attendanceDays: 2, payUnits: 2, extraHours: 3 }, at: 1 };
    d.State.worker('w_y').hourlyRate = 50;
    const frozen = row(d, 'w_y', '2026-10-16', '2026-10-29');
    same('with 50 ₪ an hour on the roster, the closed fortnight still says 2000', frozen.amount, 2000);
    same('and a range that is not the closed period prices the hours: 2150',
        row(d, 'w_y', '2026-10-19', '2026-10-20').amount, 2150);
}

// ---------------------------------------------------------------- H3

suite('H3: the button gives 50 to every man with no hourly rate, and to nobody else');
(async () => {
    const d = crew();
    same('the men it would name: יוסף (0) and עומר (none, archived) - not אחמד (40)',
        d.call('workersWithoutHourly', d.State.schedule).map(w => w.id), ['w_y', 'w_o']);

    d.answer = false;
    const untouched = d.raw('scheduleData:v2');
    await d.call('fillHourlyRates');
    same('asked once, naming two men', d.asked.map(q => q.message),
        ['לקבוע 50 ₪ לשעה נוספת ל-2 עובדים שאין להם שכר שעה? מי שכבר יש לו שכר שעה נשאר כמו שהוא, ואפשר לשנות לכל עובד בפרטים שלו.']);
    check('cancelled: nothing written', d.raw('scheduleData:v2') === untouched);

    d.answer = true;
    await d.call('fillHourlyRates');
    const saved = JSON.parse(d.raw('scheduleData:v2')).workers;
    same('confirmed: יוסף and עומר at 50, אחמד still 40, on the disk',
        saved.map(w => [w.id, w.hourlyRate]), [['w_y', 50], ['w_a', 40], ['w_o', 50]]);
    same('nothing else of any man changed', saved.map(w => [w.name, w.dailyRate, w.active]),
        [['יוסף', 1000, true], ['אחמד', 400, true], ['עומר', 350, false]]);
    same('told how many', d.told.map(t => t.message), ['נקבע 50 ₪ לשעה נוספת ל-2 עובדים.']);
    same('and then nobody is left without one: the button is not drawn again',
        d.call('workersWithoutHourly', d.State.schedule).length, 0);

    // A refused write leaves memory as it was.
    const e = crew();
    e.setQuota(() => true);
    await e.call('fillHourlyRates');
    same('a disk that refuses: nobody is left at 50 in memory',
        e.State.schedule.workers.map(w => [w.id, w.hourlyRate === undefined ? 'none' : w.hourlyRate]),
        [['w_y', 0], ['w_a', 40], ['w_o', 'none']]);
    check('and he is told it was not saved', e.told.some(t => t && t.message === 'לא הצלחנו לשמור במכשיר. שום דבר לא השתנה - נסה שוב.'));
})().then(() => {

// ---------------------------------------------------------------- H4

suite('H4: the new man\'s form opens at 50, and he can still change it');
{
    const d = crew();
    same('DEFAULT_HOURLY_RATE', d.global('DEFAULT_HOURLY_RATE'), 50);
    const roster = d.call('workersWithoutHourly', { workers: [{ hourlyRate: '' }, { hourlyRate: 0 }, { hourlyRate: 12 }] });
    same('an empty field and a 0 are "no rate"; 12 is a rate', roster.length, 2);
}

// ---------------------------------------------------------------- H5

suite('H5: the last cycle change taken back - Yosef fortnightly from 13/11 again');
return (async () => {
    const d = crew();
    work(d, 'w_y', '2026-11-13');
    work(d, 'w_y', '2026-11-16', 4);
    work(d, 'w_y', '2026-11-20');
    const y = () => d.State.worker('w_y');
    same('as typed by mistake: 13/11 is a one-week stub', d.call('periodRangeFor', y(), '2026-11-13'),
        { cycle: 'biweekly', from: '2026-11-13', to: '2026-11-19', transition: true });
    const offer = d.call('payCycleUndoOffer', y());
    same('the offer is the LAST boundary only', offer && offer.last, { from: '2026-11-20', cycle: 'weekly' });
    same('its button\'s words', d.global('PAY_CYCLE_UNDO_TEXT').button(offer.last), 'מחיקת השינוי האחרון (מ-20/11 שבועי)');

    await d.call('undoLastPayCycle', 'w_y');
    same('the question names the change and what the periods become', d.asked.map(q => [q.title, q.message, q.ok, q.danger]), [[
        'למחוק את שינוי מחזור התשלום האחרון?',
        'יוסף: השינוי מ-20/11 לשבועי יימחק. מ-13/11 יחושב כל שבועיים. תקופות שכבר נסגרו לא משתנות.',
        'מחק את השינוי', true]]);
    same('written: only the 13/11 boundary is left, on the disk',
        JSON.parse(d.raw('scheduleData:v2')).workers.find(w => w.id === 'w_y').payCycles, '2026-11-13=biweekly');
    same('13/11 opens a whole fortnight, 13/11-26/11, no stub', d.call('periodRangeFor', y(), '2026-11-13'),
        { cycle: 'biweekly', from: '2026-11-13', to: '2026-11-26', transition: false });
    same('and the sheet over that fortnight has all three of his days', row(d, 'w_y', '2026-11-13', '2026-11-26').attendanceDays, 3);
    same('the one boundary left can be taken back too (to the default): offered',
        Boolean(d.call('payCycleUndoOffer', y())), true);
    same('to nothing: the default cycle, said in its own words',
        d.global('PAY_CYCLE_UNDO_TEXT').afterDefault, 'הוא יחושב כל שבועיים, כמו לפני כל שינוי.');

    // Refused where a closed period depends on the boundary.
    const e = crew();
    e.State.schedule.ledger = { advances: { c_1: { id: 'c_1', kind: 'closed', workerId: 'w_y',
        periodFrom: '2026-11-20', periodTo: '2026-11-26', gross: 0, at: 1 } } };
    same('a closed WEEK 20/11-26/11: removing the weekly boundary would unmake it, so nothing is offered',
        e.call('payCycleUndoOffer', e.State.worker('w_y')), null);
    const before = e.raw('scheduleData:v2');
    await e.call('undoLastPayCycle', 'w_y');
    same('pressed anyway (a stale form): refused in words, and nothing asked', [e.asked.length, e.told.map(t => t.message)],
        [0, ['אי אפשר למחוק את השינוי הזה: כבר נסגרה לו תקופה שתלויה בו.']]);
    check('and nothing written', e.raw('scheduleData:v2') === before);

    // A man with no history has nothing to take back.
    same('a man with no cycle history: nothing offered', e.call('payCycleUndoOffer', e.State.worker('w_a')), null);
})();
}).then(async () => {

// ---------------------------------------------------------------- H7

suite('H7: the form makes no mess - Yosef\'s evening replayed');
{
    const d = crew();
    d.State.worker('w_y').payCycles = '';
    d.State.commitRoster();
    const nodes = {};
    for (const id of ['workerFormTitle', 'workerFormName', 'workerFormId', 'workerFormPhone',
        'workerFormDaily', 'workerFormHourly', 'workerFormError', 'workerFormCycle', 'workerFormCycleFrom',
        'workerFormCycleHint', 'workerFormCycleHistory', 'workerFormModal', 'workerFormMore']) {
        nodes[id] = { value: '', textContent: '', style: {}, options: [{ textContent: '' }], focus() {},
            appendChild() {}, open: false };
    }
    d.ctx.document.getElementById = id => nodes[id] || null;
    d.ctx.document.createElement = () => ({ style: {}, setAttribute() {}, appendChild() {},
        addEventListener() {}, classList: { add() {} }, textContent: '' });
    d.ctx.workerPhoneTyped = () => {};
    d.ctx.renderWorkerFormActions = () => {};
    const disk = () => JSON.parse(d.raw('scheduleData:v2')).workers.find(w => w.id === 'w_y').payCycles || '';

    // 1. «כל שבועיים מ-13/11» while he is already fortnightly: nothing to add.
    d.call('editWorker', 'w_y');
    nodes.workerFormCycle.value = 'biweekly'; nodes.workerFormCycleFrom.value = '2026-11-13';
    d.call('workerCycleTyped');
    same('the hint says so in one line', nodes.workerFormCycleHint.textContent,
        'יוסף כבר משולם כל שבועיים מהתאריך הזה - לא יישמר שינוי.');
    await d.call('saveWorkerForm');
    same('saved with no boundary at all, and nothing asked', [disk(), d.asked.length], ['', 0]);

    // 2. A date with no cycle: the clear sentence, nothing saved.
    d.call('editWorker', 'w_y');
    nodes.workerFormCycle.value = ''; nodes.workerFormCycleFrom.value = '2026-11-20';
    await d.call('saveWorkerForm');
    same('a date with no cycle is refused in the new words', nodes.workerFormError.textContent,
        'בחרת תאריך בלי לבחור כל כמה זמן משלמים - בחר "כל שבוע" או "כל שבועיים", או מחק את התאריך.');

    // 3. «כל שבוע מ-20/11»: asked first, in plain words; «ביטול» keeps the form.
    d.call('editWorker', 'w_y');
    nodes.workerFormCycle.value = 'weekly'; nodes.workerFormCycleFrom.value = '2026-11-20';
    d.answer = false;
    await d.call('saveWorkerForm');
    same('the question names the man, the Friday and the stub it leaves', d.asked.map(q => [q.title, q.message, q.ok]), [[
        'שינוי מחזור התשלום של יוסף',
        'מ-20/11 יוסף יקבל כל שבוע. הימים 13/11–19/11 יחושבו כתקופה קצרה לחוד. תקופות שכבר נסגרו לא משתנות.',
        'שמור את השינוי']]);
    same('«ביטול»: nothing written, the form still holds his choice', [disk(), nodes.workerFormCycle.value], ['', 'weekly']);
    d.answer = true;
    await d.call('saveWorkerForm');
    same('confirmed: one boundary, the one he meant', disk(), '2026-11-20=weekly');

    // 4. The state is said before the list, and the way back is offered.
    d.call('renderWorkerCycleHistory', d.State.worker('w_y'));
    same('«עכשיו:» before «רשום:»', nodes.workerFormCycleHistory.textContent, 'עכשיו: כל שבוע. רשום: מ-2026-11-20 שבועי');
    same('and «מחיקת השינוי האחרון» is there for it', Boolean(d.call('payCycleUndoOffer', d.State.worker('w_y'))), true);
}

// ---------------------------------------------------------------- H6

suite('H6: every word of the button, pinned');
{
    const d = crew();
    const t = d.global('HOURLY_FILL_TEXT');
    same('the line, one and many', [t.line(1), t.line(3)], ['לעובד אחד אין שכר לשעה נוספת.', 'ל-3 עובדים אין שכר לשעה נוספת.']);
    same('the button', t.button, 'שכר שעה נוספת 50 ₪ לכולם');
    same('the title and the confirming word', [t.title, t.ok], ['שכר לשעה נוספת: 50 ₪', 'קבע לכולם']);
    same('one man', t.message(1), 'לקבוע 50 ₪ לשעה נוספת לעובד אחד שאין להם שכר שעה? מי שכבר יש לו שכר שעה נשאר כמו שהוא, ואפשר לשנות לכל עובד בפרטים שלו.');
    same('done, one man', t.done(1), 'נקבע 50 ₪ לשעה נוספת לעובד אחד.');
}
report();
});
