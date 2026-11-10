// tests/months.test.mjs
//
// PHASE 6: a closed month of days leaves the server's live document, and nothing is lost.
//
// The claim, in one line: after the move the SERVER's document is smaller, every PHONE's
// days are byte for byte what they were, every report over a range that includes the
// month says what it said - on the phone that moved it, on a phone that watched, on a
// phone that was away for all of it, and on a phone installed afterwards - and a day of
// that month can no longer be changed by anybody, through any door, without being told.
//
//   M1  the model: what may move and what may not, the words, whole <-> stripped
//   M2  the move on three phones: the document shrinks, no day and no figure moves
//   M3  never before the server confirms the copy; a day edited between copy and drop
//   M4  a phone that lacks the month: it fetches, or it does not adopt - and says so
//   M5  resumable: a lost answer at each step, two phones at once
//   M6  an edit of an archived day: refused in a sentence; one already queued is held
//   M7  the server's own refusals (the fake cloud speaking firestore.rules)
//   M8  a restore never changes an archived month: before, after, a tampered file
//   M9  the files: the backup, the rescue file, the daily cloud copy
//   M10 the gates: either flag shut and nothing moves; reading is not behind them
//
// The fake cloud runs with `payRules: true`: it refuses what firestore.rules refuse. The
// real rules and the production adapter are measured in tests/months.emulator.test.mjs.

import { makeCloud, settle, settleUntil } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import {
    FORTNIGHT, WEEK1, WEEK2, TODAY, clone, stamp, canonical, payDevice, world, plan, openBook
} from './paybook.world.mjs';

const SCHEDULE = 'scheduleData:v2';
const FLAGS = { paybookQueue: false, months: true };
const SEP = '2026-09';
const OCT = '2026-10';
const NOV = '2026-11';
const EARLY = '2026-12-01';       // every month above is over; none is six months old
const LATER = '2027-05-01';       // September and October are; November is still open

// The base record: the fortnight of the pay book's own world, a Rima count inside it, a
// Rima count alone in September (a month with no worker-day), and one day in November
// that nobody closes.
const BASE = (() => {
    const first = world();
    openBook(first, undefined, 'd_seed');
    const put = change => given('a base edit is committed', first.State.commit(change) === true, JSON.stringify(change));
    put(first.call('setRimaCount', first.State.schedule, '2026-10-05', 'p_a', 3));
    put(first.call('setRimaCount', first.State.schedule, '2026-09-28', 'p_b', 2));
    put(first.call('assignPlace', first.State.schedule, '2026-11-02', 'w_salim', 'actual', 'p_a', undefined, 0));
    const schedule = clone(first.State.schedule);
    return { schedule, wire: first.call('cloudDocument', schedule) };
})();

const cloudWith = (options = {}) => makeCloud(Object.assign({ payRules: true,
    doc: Object.assign(clone(BASE.wire), { protocol: 2, revision: 1, lastOpId: 'op_seed' })
}, options));

function phone(id, cloud, options = {}) {
    const device = payDevice(Object.assign({ deviceId: id, flags: FLAGS,
        storage: options.storage || { [SCHEDULE]: JSON.stringify(BASE.schedule) } }, options));
    device.Sync.pushDelayMs = 5;
    device.State.load();
    if (cloud) device.Sync.connect(cloud.adapter);
    return device;
}
const again = (device, cloud, flags = FLAGS) => {
    const next = payDevice({ storage: device.dump(), deviceId: device.id, flags });
    next.Sync.pushDelayMs = 5;
    next.State.load();
    if (cloud) next.Sync.connect(cloud.adapter);
    return next;
};
const quiet = device => device.Sync.status === 'synced' && device.Sync.pendingCount() === 0;
const settled = (devices, limit = 8000) => settleUntil(() => devices.every(quiet), limit, 5);

const monthsOut = source => Object.keys(((source && source.monthIndex) || {}).rows || {}).sort();
const daysIn = (source, month) => Object.keys((source && source.days) || {}).filter(date => date.slice(0, 7) === month).sort();
const sizeOf = value => JSON.stringify(value).length;
const kinds = cloud => cloud.writes.filter(write => !write.replayed).map(write => write.kind);

// Everything anybody reads off the days, as one string: the pay sheet, the client's
// invoice, each man's own days, the Rima table - over a range that holds all three months
// - and the days themselves. If any figure on any report moved, this moved.
const RANGE = ['2026-09-01', '2026-11-30'];
const figures = device => {
    const S = device.State.schedule;
    return canonical({
        payroll: device.call('payrollReport', S, RANGE[0], RANGE[1]),
        invoice: device.call('invoiceReport', S, RANGE[0], RANGE[1]),
        each: S.workers.map(man => device.call('workerDaysReport', S, man, RANGE[0], RANGE[1])),
        rima: device.call('rimaReport', S, RANGE[0], RANGE[1]),
        accounts: device.call('accountsList', S, LATER),
        days: S.days
    });
};

async function close(device, worker, period, choices = {}, hour = '10') {
    const draw = paid => plan(device, 'planClosure', worker, period,
        Object.assign({ method: 'cash' }, choices, paid === null ? {} : { paid, paidOn: TODAY }),
        stamp(TODAY, device.id, hour));
    const first = draw(null);
    given(`the closure of ${worker} is allowed`, first.ok === true, JSON.stringify(first.reasons));
    const drawn = choices.paid === 0 ? first : draw(choices.paid === undefined ? first.review.netDue : choices.paid);
    given(`and with its payment (${worker})`, drawn.ok === true, JSON.stringify(drawn.reasons));
    const answer = await device.Sync.transactPaybook(drawn);
    given(`the closure of ${worker} is on the server`, answer.state === 'closed', JSON.stringify(answer));
    return drawn;
}

// The world every section starts from: every man's October closed and paid in full,
// unless told to leave Nasser owed.
async function closedWorld(options = {}) {
    const cloud = cloudWith(options.cloud || {});
    const a = phone('d_a' + (options.tag || ''), cloud);
    const b = phone('d_b' + (options.tag || ''), cloud);
    await settled([a, b]);
    await close(a, 'w_khaled', FORTNIGHT);
    await close(a, 'w_salim', FORTNIGHT, { method: 'transfer' });
    await close(a, 'w_nasser', FORTNIGHT, options.nasserOwed ? { paid: 0 } : {});
    await close(a, 'w_ahmad', WEEK1);
    if (!options.ahmadOpen) await close(a, 'w_ahmad', WEEK2, {}, '11');
    await settled([a, b]);
    return { cloud, a, b };
}

const WANT = {
    refusedTitle: 'החודש הזה בארכיון',
    refused: 'החודש הזה נסגר לכל העובדים והועבר לארכיון, ולכן אי אפשר לשנות בו ימים. הרישום לא שונה ודבר לא נשמר. לתיקון שכר של תקופה סגורה רושמים התאמה בחשבון העובד.',
    heldArchived: 'השינוי הזה נרשם במכשיר לפני שנודע לו שהחודש הועבר לארכיון. הוא לא נשלח ולא יישלח. מה שמופיע בארכיון הוא הרישום הקובע.',
    planTitle: 'העברת חודשים סגורים לארכיון - בדיקה בלבד, דבר לא הועבר',
    planSize: 'גודל הרישום בשרת עכשיו: {now} ק״ב מתוך 1,024. אחרי העברת החודשים המוכנים: {after} ק״ב.',
    planNothing: 'אין חודש שמוכן להעברה.',
    archived: 'בארכיון',
    ready: 'מוכן להעברה',
    waiting: 'סגור לכולם; יוכל לעבור החל מ-{date}',
    current: 'החודש עוד לא הסתיים',
    open: 'יש ימים שעוד לא נסגר עליהם חשבון: {names}',
    beforeOpening: 'יש בו ימים מלפני תחילת המעקב, ולא נסגר עליהם חשבון: {names}',
    unsettled: 'יש חשבון סגור שעוד לא הוסדר: {names}',
    unreadable: 'יש בו יום שאי אפשר לקרוא. הוא נשאר במקומו',
    tooLarge: 'החודש גדול מדי למסמך אחד. הוא נשאר במקומו',
    days: '{n} ימים',
    waitingForMonths: 'המכשיר עוד לא קיבל מהשרת את הימים של חודש שהועבר לארכיון, ולכן לא עדכן את הרישום. הוא ינסה שוב כשיהיה קליטה. עד אז מוצג הרישום שהיה במכשיר.'
};

// ------------------------------------------------------------------------------------
{
    suite('M1: the model - what may move, what may not, and the words');

    const { a } = await closedWorld({ tag: '1' });
    const S = a.State.schedule;
    same('every Hebrew string of this phase, word for word (PROPOSED)', clone(a.global('MONTH_TEXT')), WANT);

    const early = a.call('planMonths', S, EARLY, {});
    const by = list => list.months.map(one => [one.month, one.state, one.why, one.readyOn]);
    same('at the start of December nothing is six months old: September and October WAIT, each from its own day; November is OPEN',
        by(early), [[SEP, 'waiting', null, '2027-03-30'], [OCT, 'waiting', null, '2027-04-30'], [NOV, 'held', 'open', null]]);
    same('the man whose day holds November is named', early.months[2].names, ['סלים']);
    same('a month with a Rima count and no worker-day waits six months from its own last day', early.months[0].lastClosedOn, '');
    same('October counts from the later of its last closure and its last day', early.months[1].lastClosedOn, TODAY);
    same('the day before October may go, it may not', a.call('planMonths', S, '2027-04-29', {}).months[1].state, 'waiting');
    same('and on that day it may', a.call('planMonths', S, '2027-04-30', {}).months[1].state, 'ready');
    same('the current month never moves', a.call('planMonths', S, '2026-11-15', {}).months[2].why, 'current');
    const later = a.call('planMonths', S, LATER, {});
    same('in May: September and October are READY, November still held', by(later).map(row => row.slice(0, 3)),
        [[SEP, 'ready', null], [OCT, 'ready', null], [NOV, 'held', 'open']]);
    same('the plan writes nothing', [later.changes, canonical(a.State.schedule) === canonical(S)], [[], true]);
    check('and says what the server\'s document would weigh', later.totals.liveBytesAfter < later.totals.liveBytes
        && later.totals.ready === 2 && later.totals.limitBytes === 1048576, JSON.stringify(later.totals));
    same('read as lines, in these words', a.call('monthsPlanLines', later).slice(2),
        ['2026-09 · 1 ימים · מוכן להעברה', '2026-10 · 12 ימים · מוכן להעברה',
            '2026-11 · 1 ימים · יש ימים שעוד לא נסגר עליהם חשבון: סלים']);
    same('and the first line says it is a check only', a.call('monthsPlanLines', later)[0], WANT.planTitle);

    // What holds a month.
    const owed = await closedWorld({ tag: '1o', nasserOwed: true });
    const heldOwed = owed.a.call('planMonths', owed.a.State.schedule, LATER, {}).months[1];
    same('A CLOSURE THAT IS STILL OWED holds the month, and names the man', [heldOwed.state, heldOwed.why, heldOwed.names], ['held', 'unsettled', ['נאסר']]);
    const open = await closedWorld({ tag: '1a', ahmadOpen: true });
    const heldOpen = open.a.call('planMonths', open.a.State.schedule, LATER, {}).months[1];
    same('A WEEK NOBODY CLOSED holds the month, and names the man', [heldOpen.state, heldOpen.why, heldOpen.names], ['held', 'open', ['אחמד']]);

    // Days from before the tracking day: no account will ever cover them.
    const old = clone(S);
    old.days['2026-08-30'] = { plan: {}, actual: { w_khaled: clone(S.days['2026-10-02'].actual.w_khaled) } };
    const before = a.call('planMonths', old, LATER, {}).months[0];
    same('A DAY FROM BEFORE THE TRACKING DAY holds its month by default, under its own word', [before.month, before.state, before.why, before.names],
        ['2026-08', 'held', 'before-opening', ['חאלד']]);
    const allowed = a.call('planMonths', old, LATER, { beforeOpening: true }).months[0];
    same('and moves only when the caller says the opening settles what came before it (decision 55)', [allowed.state, allowed.lastClosedOn], ['ready', '2026-10-09']);

    // A day this build cannot read stays where a person can see it.
    const bad = clone(S);
    bad.days['2026-10-05'].actual.w_khaled = 'not a record';
    same('A DAY THAT CANNOT BE READ holds its month (law 10)', a.call('planMonths', bad, LATER, {}).months[1].why, 'unreadable');

    // whole <-> stripped, on a hand-made index
    const octDays = a.call('monthDaysOf', S, OCT);
    const row = a.call('monthRow', OCT, octDays, '2027-05-01T10:00:00.000Z');
    const live = clone(S);
    Object.keys(octDays).forEach(date => { delete live.days[date]; });
    live.monthIndex = { v: 1, rows: { [OCT]: row }, dates: a.call('monthCalendar', OCT) };
    same('a row is one this build reads back', a.call('monthRowProblems', OCT, row), []);
    const fromLocal = a.call('monthsWhole', live, [S], {});
    same('MADE WHOLE from the phone\'s own record: every day back, byte for byte', [fromLocal.missing, fromLocal.broken, fromLocal.laid,
        canonical(fromLocal.document.days) === canonical(S.days)], [[], [], 12, true]);
    const none = a.call('monthsWhole', live, [{ days: {} }], {});
    same('with nothing to lay it from, it says which document is missing - and lays nothing', [none.missing, none.laid], [[row.d], 0]);
    const doc = a.call('monthDocument', OCT, octDays, 'op_x', 7);
    same('a month document is one this build reads back', a.call('monthDocumentProblems', row.d, doc), []);
    const fetched = a.call('monthsWhole', live, [{ days: {} }], { [row.d]: doc });
    same('MADE WHOLE from the month document', [fetched.missing, canonical(fetched.document.days) === canonical(S.days)], [[], true]);
    const wrong = clone(S);
    wrong.days['2026-10-05'].rima.p_a = 4;
    same('a phone whose own days are NOT the archive\'s (one Rima count differs) is not believed: the document is asked for',
        a.call('monthsWhole', live, [wrong], {}).missing, [row.d]);
    const tampered = clone(doc);
    tampered.days['2026-10-05'].rima.p_a = 9;
    same('and a month document whose days are not the days it was made from is not believed either',
        [a.call('monthDocumentProblems', row.d, tampered).length > 0, a.call('monthsWhole', live, [{ days: {} }], { [row.d]: tampered }).missing], [true, [row.d]]);
    same('STRIPPED again, it is the live document', canonical(a.call('monthsStripCovered', fromLocal.document)) === canonical(live), true);
    same('a document whose index names nothing comes back as the same object', a.call('monthsWhole', S, [S], {}).document === S
        && a.call('monthsStripCovered', S) === S, true);

    const unreadable = clone(live);
    unreadable.monthIndex.rows[OCT] = { d: 'x', h: 'nope', n: 12 };
    same('A ROW THIS BUILD CANNOT READ IS BROKEN, never a row that names nothing: thirty days must not vanish quietly',
        [a.call('monthsWhole', unreadable, [S], {}).broken, a.call('monthArchivedDate', unreadable, '2026-10-05')], [['month:' + OCT], true]);
    const both = clone(live);
    both.days['2026-10-05'] = clone(S.days['2026-10-05']);
    same('and so is a live document that still holds a day of a month its index says has left',
        a.call('monthsWhole', both, [S], {}).broken, ['month:' + OCT]);
    same('everything in a day moves with it - the rate stamps, the Rima count, a layer this build never heard of',
        (() => {
            const odd = clone(octDays);
            odd['2026-10-05'].somethingNew = { x: [1, 2, { y: null }] };
            const made = a.call('monthDocument', OCT, odd, 'op', 1);
            return [canonical(made.days) === canonical(odd), made.days['2026-10-05'].rima.p_a,
                JSON.stringify(made.days['2026-10-02'].actual.w_khaled) === JSON.stringify(S.days['2026-10-02'].actual.w_khaled)];
        })(), [true, 3, true]);
    same('the calendar of a month is every date in it, worked or not', [a.call('monthCalendar', '2027-02').length, a.call('monthCalendar', '2028-02').length,
        a.call('monthCalendar', OCT)[30]], [28, 29, '2026-10-31']);
    same('six months on from the 31st of August is the last day of February', a.call('monthStepDay', '2026-08-31', 6), '2027-02-28');
}

// ------------------------------------------------------------------------------------
{
    suite('M2: the move - the live document shrinks, and no phone\'s days or figures move');

    const { cloud, a, b } = await closedWorld({ tag: '2' });
    const whole = figures(a);
    given('both phones read the same before', figures(b) === whole);
    const before = sizeOf(cloud.doc);
    const wrote = kinds(cloud).length;
    const record = canonical(a.State.schedule.days);

    const early = await a.Sync.archiveMonths({ today: EARLY });
    same('before the six months are up NOTHING moves, and nothing is written', [early.ok, early.moved, kinds(cloud).length - wrote, monthsOut(cloud.doc)], [true, [], 0, []]);

    const answer = await a.Sync.archiveMonths({ today: LATER });
    await settled([a, b]);
    same('in May September and October move, oldest first; November stays', [answer.ok, answer.state, answer.moved, answer.failed, answer.left],
        [true, 'done', [SEP, OCT], [], 0]);
    same('each as a copy and then a drop, and nothing else', kinds(cloud).slice(wrote), ['copyMonth', 'archiveMonth', 'copyMonth', 'archiveMonth']);
    same('THE SERVER\'S LIVE DOCUMENT holds no day of either month, and still holds November',
        [daysIn(cloud.doc, SEP), daysIn(cloud.doc, OCT), daysIn(cloud.doc, NOV), monthsOut(cloud.doc)], [[], [], ['2026-11-02'], [SEP, OCT]]);
    check('and is smaller', sizeOf(cloud.doc) < before, `${before} -> ${sizeOf(cloud.doc)}`);
    same('the index carries every calendar date of both months - what the server refuses writes to', cloud.doc.monthIndex.dates.length, 30 + 31);
    const docs = [...cloud.months.keys()].sort();
    same('one month document each, named by month and digest', docs.map(id => id.slice(0, 8)), [SEP + '_', OCT + '_']);
    same('each holding its month\'s days exactly as they were, Rima count and rate stamps and all',
        docs.map(id => canonical(cloud.months.get(id).days) === canonical(a.call('monthDaysOf', BASE.schedule.days ? a.State.schedule : null, id.slice(0, 7)))), [true, true]);
    same('THE PHONE THAT MOVED THEM holds every day, byte for byte, and every figure', [canonical(a.State.schedule.days) === record, figures(a) === whole], [true, true]);
    same('THE PHONE THAT WATCHED likewise', [canonical(b.State.schedule.days) === record, figures(b) === whole], [true, true]);
    same('and both know which months have left', [monthsOut(a.State.schedule), monthsOut(b.State.schedule)], [[SEP, OCT], [SEP, OCT]]);
    same('after a reopen, the same - off the disk', (next => [figures(next) === whole, monthsOut(next.State.schedule)])(again(b, null)), [true, [SEP, OCT]]);

    const count = kinds(cloud).length;
    const second = await b.Sync.archiveMonths({ today: LATER });
    same('IDEMPOTENT: asked again, from the other phone, nothing is ready and nothing is written', [second.ok, second.moved, kinds(cloud).length - count], [true, [], 0]);
    same('the dry run now says so', a.call('planMonths', a.State.schedule, LATER, {}).months.map(one => one.state), ['archived', 'archived', 'held']);

    // The work goes on: a day in the open month, from both phones.
    given('a November day is recorded', b.State.commit(b.call('assignPlace', b.State.schedule, '2026-11-03', 'w_khaled', 'actual', 'p_a', undefined, 0)) === true);
    await settled([a, b]);
    same('LIFE AFTER THE MOVE: a day in a month that has not left is recorded and reaches the other phone, and the archive is untouched',
        [Boolean(a.State.schedule.days['2026-11-03']), Boolean(cloud.doc.days['2026-11-03']), monthsOut(cloud.doc), canonical(a.State.schedule.days) === canonical(b.State.schedule.days)],
        [true, true, [SEP, OCT], true]);
}

// ------------------------------------------------------------------------------------
{
    suite('M3: never before the server confirms the copy');

    const { cloud, a, b } = await closedWorld({ tag: '3' });
    const real = cloud.adapter.archiveMonth;
    const octId = a.call('monthDocumentId', OCT, a.call('monthDigest', a.call('monthDaysOf', a.State.schedule, OCT)));

    // The drop asked for on the strength of a document that is not there.
    const envelope = () => ({ updatedAt: new Date().toISOString(), updatedBy: 'x', protocol: 2, lastOpId: 'op_m3_' + Math.random(),
        opFingerprint: 'f', revision: cloud.doc.revision + 1, archivedMonth: OCT, monthDoc: octId, 'monthIndex.v': 1,
        ['monthIndex.rows.' + OCT]: a.call('monthRow', OCT, a.call('monthDaysOf', a.State.schedule, OCT), 'now') });
    same('a drop naming a month document that does not exist is refused, and nothing leaves',
        [await real(envelope(), OCT, octId).then(() => 'accepted', error => error.code), daysIn(cloud.doc, OCT).length], ['month-unconfirmed', 12]);

    // A day of the month changes between the copy and the drop.
    let edited = false;
    cloud.adapter.archiveMonth = (patch, month, id) => {
        if (month === OCT && !edited) {
            edited = true;
            // Another phone corrects a Rima count in October before the drop lands.
            cloud.doc.days['2026-10-05'].rima.p_a = 5;
            cloud.doc.revision += 1;
            cloud.doc.updatedAt = new Date().toISOString();
            cloud.doc.updatedBy = 'd_other';
            cloud.subscribers.forEach(fn => fn(clone(cloud.doc)));
        }
        return real(patch, month, id);
    };
    const answer = await a.Sync.archiveMonths({ today: LATER, only: [OCT] });
    await settled([a, b]);
    cloud.adapter.archiveMonth = real;
    same('A DAY EDITED BETWEEN THE COPY AND THE DROP: the stale copy is not what the month leaves on',
        [edited, cloud.doc.monthIndex.rows[OCT].d !== octId, cloud.months.has(octId)], [true, true, true]);
    same('the drop aimed at the stale copy was refused, the phone adopted the correction, and the SAME run finished the move under a new name',
        [answer.moved, answer.failed, daysIn(cloud.doc, OCT).length, monthsOut(cloud.doc), a.State.schedule.days['2026-10-05'].rima.p_a],
        [[OCT], [], 0, [OCT], 5]);
    same('the month document the row names holds the CORRECTED day; the stale copy is a document nothing points at',
        [cloud.months.size, cloud.months.get(cloud.doc.monthIndex.rows[OCT].d).days['2026-10-05'].rima.p_a, cloud.months.get(octId).days['2026-10-05'].rima.p_a],
        [2, 5, 3]);
    same('and both phones hold the corrected day', [a.State.schedule.days['2026-10-05'].rima.p_a, b.State.schedule.days['2026-10-05'].rima.p_a], [5, 5]);

    // The phone's record is not the server's.
    const two = await closedWorld({ tag: '3b' });
    two.cloud.doc.days['2026-09-28'].rima.p_b = 7;       // the server holds something this phone has not heard
    const differs = await two.a.Sync.archiveMonths({ today: LATER, only: [SEP] });
    same('A MONTH WHOSE SERVER BYTES ARE NOT THIS PHONE\'S does not move: somebody knows something this phone does not',
        [differs.ok, differs.failed.map(one => one.reason), two.cloud.months.size, monthsOut(two.cloud.doc)], [false, ['differs'], 0, []]);
}

// ------------------------------------------------------------------------------------
{
    suite('M4: a phone that lacks the month fetches it - or does not adopt, and says so');

    const { cloud, a, b } = await closedWorld({ tag: '4' });
    const whole = figures(a);
    given('moved', (await a.Sync.archiveMonths({ today: LATER })).ok === true);
    await settled([a, b]);

    {
        const reads = [];
        const real = cloud.adapter.readMonth;
        cloud.adapter.readMonth = id => { reads.push(String(id)); return real(id); };
        const fresh = phone('d_new4', cloud, { storage: {} });
        await settled([fresh]);
        same('A PHONE INSTALLED AFTER THE MOVE holds every day and reads every report the same', [figures(fresh) === whole, monthsOut(fresh.State.schedule)], [true, [SEP, OCT]]);
        same('it fetched each month document its index names', [...new Set(reads)].sort(), [...cloud.months.keys()].sort());
        const next = again(fresh, cloud);
        reads.length = 0;
        await settled([next]);
        same('and after a reopen it needs none - the days are in its own record', [reads, figures(next) === whole], [[], true]);
        cloud.adapter.readMonth = real;
    }
    {
        const real = cloud.adapter.readMonth;
        let failing = true;
        cloud.adapter.readMonth = id => (failing ? Promise.reject(Object.assign(new Error('no signal'), { code: 'unavailable' })) : real(id));
        const dark = phone('d_dark4', cloud, { storage: {} });
        await settle(60);
        same('A PHONE THAT CANNOT FETCH THE MONTH ADOPTS NOTHING: no roster, no day, no hole',
            [dark.State.schedule.workers.length, Object.keys(dark.State.schedule.days).length, monthsOut(dark.State.schedule)], [0, 0, []]);
        same('it does not say synced', dark.Sync.status === 'synced', false);
        same('and says what it is waiting for', (dark.Sync.closedWaiting() || {}).months.slice().sort(), [...cloud.months.keys()].sort());
        same('nothing may be moved or closed from it meanwhile', [dark.Sync.monthArchiveRefusal(), dark.Sync.archiveRefusal()], ['waiting', 'waiting']);
        failing = false;
        await settleUntil(() => quiet(dark), 20000, 20);
        same('when the documents can be read it adopts, whole', [figures(dark) === whole, dark.Sync.closedWaiting(), dark.Sync.status], [true, null, 'synced']);
        cloud.adapter.readMonth = real;
    }
    {
        // A phone that held the record and was away for the move: it needs no fetch at all.
        const cloud2 = cloudWith();
        const mover = phone('d_m4', cloud2);
        const away = phone('d_w4', cloud2);
        await settled([mover, away]);
        for (const [who, period, hour] of [['w_khaled', FORTNIGHT], ['w_salim', FORTNIGHT], ['w_nasser', FORTNIGHT], ['w_ahmad', WEEK1], ['w_ahmad', WEEK2, '11']]) {
            await close(mover, who, period, {}, hour || '10');
        }
        await settled([mover, away]);
        const awayDisk = away.dump();
        cloud2.subscribers.splice(1, 1);                    // away stops hearing
        given('moved while the other phone is away', (await mover.Sync.archiveMonths({ today: LATER })).ok === true);
        await settled([mover]);
        const reads = [];
        const real = cloud2.adapter.readMonth;
        cloud2.adapter.readMonth = id => { reads.push(id); return real(id); };
        const back = payDevice({ storage: awayDisk, deviceId: 'd_w4', flags: FLAGS });
        back.Sync.pushDelayMs = 5;
        back.State.load();
        back.Sync.connect(cloud2.adapter);
        await settled([back]);
        same('A PHONE THAT WAS AWAY FOR THE MOVE comes back to the whole record without fetching anything: its own days have the digest',
            [figures(back) === figures(mover), monthsOut(back.State.schedule), reads], [true, [SEP, OCT], []]);
    }
}

// ------------------------------------------------------------------------------------
{
    suite('M5: resumable - a lost answer at each step, and two phones at once');

    for (const step of ['copyMonth', 'archiveMonth']) {
        const { cloud, a, b } = await closedWorld({ tag: '5' + step });
        const whole = figures(a);
        let lost = 0;
        cloud.loseAnswer = kind => (kind === step && (lost += 1) === 1);
        const answer = await a.Sync.archiveMonths({ today: LATER });
        await settled([a, b]);
        same(`THE ANSWER TO THE ${step === 'copyMonth' ? 'COPY' : 'DROP'} IS LOST: the move reads the server and carries on - both months out, once each`,
            [answer.ok, answer.moved, monthsOut(cloud.doc), cloud.months.size, lost >= 1], [true, [SEP, OCT], [SEP, OCT], 2, true]);
        same('- and no figure moved on either phone', [figures(a) === whole, figures(b) === whole], [true, true]);
        cloud.loseAnswer = null;
    }
    {
        // The phone is reloaded between the copy and the drop: nothing on it says a move was under way.
        const { cloud, a, b } = await closedWorld({ tag: '5r' });
        const real = cloud.adapter.archiveMonth;
        cloud.adapter.archiveMonth = () => Promise.reject(Object.assign(new Error('gone'), { code: 'unavailable', unsent: true }));
        const first = await a.Sync.archiveMonths({ today: LATER, only: [OCT] });
        same('the drop cannot be sent: the month stays whole in the live document, with its copy made', [first.ok, first.failed.map(one => one.reason),
            daysIn(cloud.doc, OCT).length, cloud.months.size, monthsOut(cloud.doc)], [false, ['offline'], 12, 1, []]);
        same('and nothing about the move is on the phone\'s disk', Object.keys(a.dump()).filter(key => /month/i.test(key)), []);
        cloud.adapter.archiveMonth = real;
        const reopened = again(a, cloud);
        await settled([reopened, b]);
        const second = await reopened.Sync.archiveMonths({ today: LATER, only: [OCT] });
        await settled([reopened, b]);
        same('AFTER A RELOAD the same request finishes it, with the copy that was already there', [second.moved, cloud.months.size, monthsOut(cloud.doc)], [[OCT], 1, [OCT]]);
    }
    {
        const { cloud, a, b } = await closedWorld({ tag: '5t' });
        const whole = figures(a);
        const [one, two] = await Promise.all([a.Sync.archiveMonths({ today: LATER }), b.Sync.archiveMonths({ today: LATER })]);
        await settled([a, b]);
        same('TWO PHONES MOVE THE SAME MONTHS IN THE SAME MINUTE: both end with both out, one row and one document each',
            [one.ok, two.ok, monthsOut(cloud.doc), cloud.months.size, cloud.doc.monthIndex.dates.length], [true, true, [SEP, OCT], 2, 61]);
        same('- and both phones hold the whole record', [figures(a) === whole, figures(b) === whole], [true, true]);
    }
}

// ------------------------------------------------------------------------------------
{
    suite('M6: an edit of an archived day - refused in a sentence; one already queued is held, never sent, never dropped');

    const { cloud, a, b } = await closedWorld({ tag: '6' });
    // Phone b goes dark BEFORE the move and records a late correction to October.
    const bDisk = b.dump();
    cloud.subscribers.splice(1, 1);
    given('moved', (await a.Sync.archiveMonths({ today: LATER })).ok === true);
    await settled([a]);
    const whole = figures(a);
    const disk = JSON.stringify(a.dump());
    const wrote = cloud.writes.length;

    a.said.length = 0;
    const change = a.call('assignPlace', a.State.schedule, '2026-10-06', 'w_nasser', 'actual', 'p_b', undefined, 0);
    same('A DAY OF AN ARCHIVED MONTH IS NOT EDITED: the commit answers false', a.State.commit(change), false);
    same('and says why, and what to do instead, in these words', a.said, [`${WANT.refusedTitle} | ${WANT.refused}`]);
    await settle(40);
    same('nothing was journalled, nothing queued, nothing sent, and the disk is byte for byte what it was',
        [a.Sync.pendingCount(), cloud.writes.length - wrote, JSON.stringify(a.dump()) === disk], [0, 0, true]);
    same('memory was put back: every figure is what it was', figures(a) === whole, true);
    a.said.length = 0;
    same('a Rima count in an archived month, likewise', [a.State.commit(a.call('setRimaCount', a.State.schedule, '2026-10-05', 'p_a', 9)), a.said.length,
        a.State.schedule.days['2026-10-05'].rima.p_a], [false, 1, 3]);
    a.said.length = 0;
    const batch = [a.call('assignPlace', a.State.schedule, '2026-11-04', 'w_salim', 'actual', 'p_a', undefined, 0),
        a.call('assignPlace', a.State.schedule, '2026-10-07', 'w_salim', 'actual', 'p_b', undefined, 0)];
    same('A BATCH with one archived day in it is refused WHOLE - not half-written', [a.State.commitMany(batch), Boolean(a.State.schedule.days['2026-11-04']),
        a.Sync.pendingCount(), a.said.length], [false, false, 0, 1]);
    same('a new day inside an archived month - a date that held nothing - is refused too',
        a.State.commit(a.call('assignPlace', a.State.schedule, '2026-10-20', 'w_salim', 'actual', 'p_a', undefined, 0)), false);
    same('a day in a month that has not left is recorded as ever', a.State.commit(a.call('assignPlace', a.State.schedule, '2026-11-04', 'w_salim', 'actual', 'p_a', undefined, 0)), true);
    await settled([a]);

    // The phone that was away: it corrected October with no signal, then comes back.
    const back = payDevice({ storage: bDisk, deviceId: b.id, flags: FLAGS });
    back.Sync.pushDelayMs = 5;
    back.State.load();
    given('the correction is accepted on the phone that has not heard', back.State.commit(
        back.call('setRimaCount', back.State.schedule, '2026-10-05', 'p_a', 8)) === true);
    given('and so is an ordinary day', back.State.commit(back.call('assignPlace', back.State.schedule, '2026-11-05', 'w_khaled', 'actual', 'p_a', undefined, 0)) === true);
    const sentBefore = cloud.attempts.length;
    back.Sync.connect(cloud.adapter);
    await settleUntil(() => Boolean(cloud.doc.days['2026-11-05']), 8000, 5);
    await settle(200);
    const octWrites = cloud.attempts.slice(sentBefore).filter(attempt => attempt.payload
        && Object.keys(attempt.payload).some(key => key.indexOf('days.2026-10') === 0));
    same('AN EDIT QUEUED BEFORE THE PHONE HEARD: it is never sent', octWrites.length, 0);
    same('the ordinary day behind it IS sent - a held edit is not a blocked queue', Boolean(cloud.doc.days['2026-11-05']), true);
    const rows = back.Sync.heldRecords();
    same('it is HELD, durably, and listed with the archive\'s value beside it - never dropped (law 10)',
        rows.map(row => [row.path, row.mine, row.cloud, row.archived]), [['days.2026-10-05.rima.p_a', 8, 3, true]]);
    same('the phone does not say synced over it', back.Sync.status === 'synced', false);
    same('«mine» is not an answer: the hold stands', [back.Sync.answerHold(rows[0].opId, 'mine'), back.Sync.heldRecords().length], [false, 1]);
    const reopened = again(back, cloud);
    await settle(200);
    same('after a reopen it is still held and still unsent', [reopened.Sync.heldRecords().map(row => row.path), cloud.attempts.slice(sentBefore).filter(attempt => attempt.payload
        && Object.keys(attempt.payload).some(key => key.indexOf('days.2026-10') === 0)).length], [['days.2026-10-05.rima.p_a'], 0]);
    same('the server\'s archive was never touched', cloud.months.get(cloud.doc.monthIndex.rows[OCT].d).days['2026-10-05'].rima.p_a, 3);
}

// ------------------------------------------------------------------------------------
{
    suite('M7: what the server refuses (the fake cloud speaking firestore.rules)');

    const { cloud, a, b } = await closedWorld({ tag: '7' });
    given('moved', (await a.Sync.archiveMonths({ today: LATER })).ok === true);
    await settled([a, b]);
    const stood = () => [monthsOut(cloud.doc), cloud.doc.monthIndex.dates.length, daysIn(cloud.doc, OCT), cloud.months.size];
    const was = stood();
    const head = name => ({ updatedAt: new Date().toISOString(), updatedBy: 'x', protocol: 2, lastOpId: name, opFingerprint: 'f', revision: cloud.doc.revision + 1 });
    const tried = (kind, payload) => cloud.adapter[kind](payload).then(() => 'accepted', error => error.code);

    same('a field-path write to a day of an archived month', await tried('update', Object.assign(head('op7a'), { 'days.2026-10-05.rima.p_a': 6 })), 'permission-denied');
    same('a field-path write to a date of that month that held nothing', await tried('update', Object.assign(head('op7b'), { 'days.2026-10-20.actual.w_salim': { entries: [] } })), 'permission-denied');
    same('a write that changes the index', await tried('update', Object.assign(head('op7c'), { 'monthIndex.rows.2026-11': { d: 'x', h: 'y', n: 1 } })), 'permission-denied');
    const resurrect = Object.assign(clone(cloud.doc), head('op7d'));
    resurrect.days['2026-10-05'] = clone(a.State.schedule.days['2026-10-05']);
    same('A WHOLE DOCUMENT THAT PUTS AN ARCHIVED DAY BACK', await tried('save', resurrect), 'permission-denied');
    const noIndex = Object.assign(clone(cloud.doc), head('op7e'));
    delete noIndex.monthIndex;
    same('a whole document that drops the index', await tried('save', noIndex), 'permission-denied');
    const fewer = Object.assign(clone(cloud.doc), head('op7f'));
    delete fewer.monthIndex.rows[OCT];
    same('a whole document that takes a row away', await tried('save', fewer), 'permission-denied');
    const old = Object.assign(clone(cloud.doc), head('op7g'), { protocol: 1 });
    delete old.monthIndex;
    delete old.pay;
    same('a whole document from a build that knows neither', await tried('save', old), 'permission-denied');
    same('a day recorded by a protocol-1 build once a month has left', await tried('update', Object.assign(head('op7h'), { protocol: 1, 'days.2026-11-09.actual.w_salim': { entries: [] } })), 'permission-denied');
    same('after all of that the index, the days and the month documents are exactly what they were', stood(), was);
    same('and a protocol-2 day in an open month is accepted', await tried('update', Object.assign(head('op7i'), { 'days.2026-11-09.actual.w_salim': { entries: [] } })), 'accepted');
    const empty = makeCloud({ payRules: true });
    const born = Object.assign(clone(cloud.doc), head('op7j'), { revision: 1 });
    delete born.pay; delete born.payIndex;
    same('a project may not begin with a month index', await empty.adapter.create(born).then(() => 'accepted', error => error.code), 'permission-denied');
}

// ------------------------------------------------------------------------------------
{
    suite('M8: a restore never changes an archived month - a file from before, from after, and one that disagrees');

    const { cloud, a, b } = await closedWorld({ tag: '8' });
    const fileBefore = clone(a.State.schedule);                    // a backup taken BEFORE the move
    given('moved', (await a.Sync.archiveMonths({ today: LATER })).ok === true);
    await settled([a, b]);
    const whole = figures(a);
    const fileAfter = clone(a.State.schedule);
    const tampered = clone(fileBefore);                            // an older state of October
    tampered.days['2026-10-05'].rima.p_a = 1;
    delete tampered.days['2026-10-06'];
    tampered.days['2026-11-02'].actual.w_salim.entries[0].placeId = 'p_b';      // and a real change to an OPEN month
    const cloudCopy = a.call('monthsStripCovered', clone(fileAfter));          // the daily copy's shape
    const stay = () => [monthsOut(cloud.doc), cloud.doc.monthIndex.dates.length, daysIn(cloud.doc, OCT), daysIn(cloud.doc, SEP),
        [...cloud.months.entries()].map(([id, doc]) => id + canonical(doc)).sort().join('|')];
    const stood = stay();
    const octOf = device => canonical(device.call('monthDaysOf', device.State.schedule, OCT));
    const archived = octOf(a);

    for (const [name, file] of [['a file from before the move', fileBefore], ['a file from after the move', fileAfter],
        ['a daily cloud copy from after the move (no archived days in it)', cloudCopy],
        ['a file whose October DISAGREES with the archive and whose November was changed', tampered]]) {
        const saves = cloud.writes.filter(write => write.kind === 'save').length;
        const result = await b.Sync.replaceEverything(b.call('normaliseSchedule', clone(file)));
        await settled([a, b]);
        same(`${name}: the restore is ACCEPTED by a server that refuses any write to an archived date`,
            [result.ok, cloud.writes.filter(write => write.kind === 'save').length - saves], [true, 1]);
        same('- the index and the month documents are exactly what they were, and no archived day is in the live document', stay(), stood);
        const sent = cloud.writes.filter(write => write.kind === 'save').slice(-1)[0].data;
        same('- the document it sent carries the index and no day of an archived month', [monthsOut(sent), daysIn(sent, OCT), daysIn(sent, SEP)], [[SEP, OCT], [], []]);
        same('- and both phones hold October exactly as the archive does: never lost, never duplicated, never the file\'s',
            [octOf(a) === archived, octOf(b) === archived], [true, true]);
    }
    same('the months that have NOT left were replaced as asked: November is the file\'s',
        [a.State.schedule.days['2026-11-02'].actual.w_salim.entries[0].placeId, cloud.doc.days['2026-11-02'].actual.w_salim.entries[0].placeId], ['p_b', 'p_b']);
    given('put November back', (await b.Sync.replaceEverything(b.call('normaliseSchedule', clone(fileAfter)))).ok === true);
    await settled([a, b]);
    same('and with the first file back every figure is what it was', [figures(a) === whole, figures(b) === whole], [true, true]);

    // A phone installed after the move restores a file that predates it.
    const fresh = phone('d_new8', cloud, { storage: {} });
    await settled([fresh]);
    const result = await fresh.Sync.replaceEverything(fresh.call('normaliseSchedule', clone(fileBefore)));
    await settled([a, b, fresh]);
    same('a restore from a phone installed after the move: accepted, nothing archived lost or doubled anywhere',
        [result.ok, stay().slice(0, 4), octOf(fresh) === archived, figures(a) === whole], [true, stood.slice(0, 4), true, true]);

    // A phone whose own record cannot vouch for the archive does not restore over it.
    const lone = payDevice({ storage: a.dump(), deviceId: 'd_lone8', flags: FLAGS });
    lone.State.load();
    lone.State.schedule.days['2026-10-05'].rima.p_a = 2;       // its October is no longer the archive's, and it has no server document
    const kept = canonical(lone.State.schedule);
    const refused = await lone.Sync.replaceEverything(lone.call('normaliseSchedule', clone(fileBefore)));
    same('A PHONE THAT HOLDS NOTHING WITH THE ARCHIVE\'S DIGEST does not run a restore at all: refused at the first step, record untouched',
        [refused.ok, refused.stage, canonical(lone.State.schedule) === kept], [false, 'prepare', true]);

    // With no month out, a file that carries an index (another project's) is just days.
    const plain = payDevice({ storage: { [SCHEDULE]: JSON.stringify(BASE.schedule) }, deviceId: 'd_plain8', flags: FLAGS });
    plain.State.load();
    const done = await plain.Sync.replaceEverything(plain.call('normaliseSchedule', clone(fileAfter)));
    same('on a phone whose server has no month out, a file carrying an index restores as plain days - every day, and no index',
        [done.ok, monthsOut(plain.State.schedule), canonical(plain.State.schedule.days) === canonical(fileAfter.days)], [true, [], true]);
}

// ------------------------------------------------------------------------------------
{
    suite('M9: the files - the backup, the rescue file, the daily cloud copy');

    const { cloud, a, b } = await closedWorld({ tag: '9' });
    a.call('exportBackup');
    same('with no month out the backup file is this phone\'s record and nothing else, byte for byte',
        a.downloads[a.downloads.length - 1].text === JSON.stringify(a.State.schedule, null, 1), true);
    given('moved', (await a.Sync.archiveMonths({ today: LATER })).ok === true);
    await settled([a, b]);

    a.call('exportBackup');
    const file = JSON.parse(a.downloads[a.downloads.length - 1].text);
    same('THE BACKUP FILE carries every day of every month - the archived ones included - and the index',
        [canonical(file.days) === canonical(a.State.schedule.days), daysIn(file, OCT).length, monthsOut(file)], [true, 12, [SEP, OCT]]);
    same('and SAYS, in the file, what it carries', [file.aboutArchivedMonths.monthsArchivedOnServer, file.aboutArchivedMonths.monthsCarriedWholeInThisFile,
        file.aboutArchivedMonths.monthsNotAsTheArchiveHoldsThem, file.aboutArchivedMonths.monthDocumentsCarried,
        /keeps every archived month exactly as the server holds it/.test(file.aboutArchivedMonths.note)], [2, 2, [], false, true]);
    const read = a.call('readBackupFile', clone(file));
    same('read back, the file is the record - the note is not taken for data',
        [canonical(read.schedule.days) === canonical(a.State.schedule.days), canonical(read.schedule.monthIndex) === canonical(a.State.schedule.monthIndex),
            'aboutArchivedMonths' in read.schedule], [true, true, false]);
    a.call('exportRecoveryData');
    const rescue = JSON.parse(a.downloads[a.downloads.length - 1].text);
    same('THE RESCUE FILE says the same, and its copy of the record holds every day and the index',
        (raw => [rescue.aboutArchivedMonths.monthsCarriedWholeInThisFile, canonical(raw.days) === canonical(a.State.schedule.days), monthsOut(raw)])(JSON.parse(rescue.records[SCHEDULE])),
        [2, true, [SEP, OCT]]);
    same('its comparison of two captures knows each archived month as a fact of its own',
        Object.keys(a.call('recoveryFacts', a.State.schedule)).filter(key => key.indexOf('monthIndex:') === 0).sort(), ['monthIndex:' + SEP, 'monthIndex:' + OCT]);

    cloud.history.clear();
    a.Sync._archivedOn = null;
    a.Sync.archiveDaily(a.State.schedule);
    await settle(20);
    const copies = [...cloud.history.values()];
    given('a daily copy was written', copies.length === 1, String(copies.length));
    same('THE DAILY CLOUD COPY is the live document\'s shape: the index, the open months, and no day of an archived one',
        [monthsOut(copies[0]), daysIn(copies[0], OCT), daysIn(copies[0], SEP), daysIn(copies[0], NOV)], [[SEP, OCT], [], [], ['2026-11-02']]);
    check('so it is no larger than the document it copies', sizeOf(copies[0]) < sizeOf(a.call('cloudDocument', a.State.schedule)),
        `${sizeOf(copies[0])} < ${sizeOf(a.call('cloudDocument', a.State.schedule))}`);
}

// ------------------------------------------------------------------------------------
{
    suite('M10: the gates - shut, nothing moves; reading is not behind them');

    const { cloud, a, b } = await closedWorld({ tag: '10' });
    const wrote = cloud.writes.length;
    for (const [name, flags] of [['the build as shipped (no flag set)', null], ['the pay book open and months shut', { paybookQueue: false }],
        ['months open and the pay book shut', { paybook: false, paybookQueue: false, months: true }]]) {
        const shut = flags === null
            ? payDevice({ storage: a.dump(), deviceId: 'd_shut10', shipped: true })
            : payDevice({ storage: a.dump(), deviceId: 'd_shut10', flags });
        shut.Sync.pushDelayMs = 5;
        shut.State.load();
        shut.Sync.connect(cloud.adapter);
        await settled([shut]);
        const answer = await shut.Sync.archiveMonths({ today: LATER });
        same(`${name}: the move is refused before it reads anything`, [answer.state, answer.reasons, shut.Sync.monthArchiveRefusal()], ['refused', ['gate'], 'gate']);
        same('- and the dry run says so, while still showing what it would find', (plan => [plan.ok, plan.reasons, plan.months.length])(shut.call('planMonths', shut.State.schedule, LATER, {})), [false, ['gate'], 3]);
    }
    same('none of that wrote anything', [cloud.writes.length - wrote, monthsOut(cloud.doc), cloud.months.size], [0, [], 0]);
    same('the shipped flags are both false', [a.global('FARKAD_SHIPPED_FLAGS').months, a.global('FARKAD_SHIPPED_FLAGS').paybook], [false, false]);

    // READING is not behind the gate: a phone with months shut makes whole what another moved.
    given('moved, by a phone with the gate open', (await a.Sync.archiveMonths({ today: LATER })).ok === true);
    await settled([a, b]);
    const reader = payDevice({ storage: {}, deviceId: 'd_reader10', flags: { paybookQueue: false } });
    reader.Sync.pushDelayMs = 5;
    reader.State.load();
    reader.Sync.connect(cloud.adapter);
    await settled([reader]);
    same('A PHONE WITH THE GATE SHUT, installed afterwards, still makes the record whole and reads the same figures',
        [figures(reader) === figures(a), monthsOut(reader.State.schedule)], [true, [SEP, OCT]]);
    // A copy of the record that lost the index under the cloud's own stamps - what a build
    // that never kept `monthIndex` leaves on a shared disk - must not read the cloud's
    // document as its own echo.
    {
        const disk = a.dump();
        const stored = JSON.parse(disk[SCHEDULE]);
        given('the phone that moved them wrote last', stored.updatedBy === a.id && stored.updatedAt === cloud.doc.updatedAt);
        delete stored.monthIndex;
        disk[SCHEDULE] = JSON.stringify(stored);
        const lost = payDevice({ storage: disk, deviceId: a.id, flags: FLAGS });
        lost.Sync.pushDelayMs = 5;
        lost.State.load();
        given('its copy has no index', monthsOut(lost.State.schedule).length === 0);
        lost.Sync.connect(cloud.adapter);
        await settled([lost]);
        same('A COPY THAT LOST THE INDEX UNDER THE CLOUD\'S OWN STAMPS adopts the document all the same - it is not this phone\'s echo',
            monthsOut(lost.State.schedule), [SEP, OCT]);
    }
    reader.said.length = 0;
    same('and still refuses an edit of an archived day, in the same sentence',
        [reader.State.commit(reader.call('setRimaCount', reader.State.schedule, '2026-10-05', 'p_a', 9)), reader.said.length], [false, 1]);
}

report();
