// סיכום שנה - the year on one screen, on devices.
//
//   node tests/yearsummary.test.mjs
//
// The year (js/ui/yearsummary.js) is one more surface showing numbers that «סיכום חודש» and
// «דוחות» already show, so what this suite holds is not that the year is right. It is that it
// CANNOT BE DIFFERENT, and that it never says more than a year can say:
//
//   1. EVERY MONTH IS «סיכום חודש»'S MONTH. Over seeded years - both pay cycles, a cycle that
//      changes, a raise in June, Rima, עובדי יוסף גבס, a man switched off in May, a man with
//      ONE day in March that has no daily rate, advances with agorot, cash handed back, a
//      fortnight across 1 January closed and then corrected - every row is monthSummaryRead's
//      own answer for its month, field by field, and every figure it draws is the string the
//      month's own dialog draws (monthSummaryFacts).
//   2. THE YEAR'S LINE IS THE YEAR'S, NEVER THE ROWS ADDED: monthSummaryReadRange over the
//      year; the man with one unpriced day is out of the year's «נצבר» and out of March's
//      only; he is named; and the sentence that says why the year is smaller stands exactly
//      where a man the year cannot price worked priced in some month - decided from the
//      unpriced lists, never from a sum (contract revision 2): true for the March man, false
//      for a man whose only month is the unpriced one, false for a year whose rounded months
//      miss the rounded year by an agora, with a spy holding that no month's «נצבר» is read.
//   3. THE MEN ARE THE PAY SHEET'S ROWS over the year, field by field, «—» exactly for an
//      unknown wage, and their two money columns add up to the year's tiles (to the agora
//      per man - each row is rounded once and the band once, the sheet's own two roundings).
//   4. THE SITES ARE THE BILLING'S: invoiceByDate, invoiceWithoutRima, rimaReport; his own
//      plus Rima's is the billed count; the first and last months; יוסף גבס equal to its
//      report and in no other figure.
//   5. A FORTNIGHT ACROSS 1 JANUARY is split by its days, and no figure of either year is
//      its payslip - closed, and corrected after its close.
//   6. THE EXTRACTION MOVED NOTHING: monthSummaryRead on this branch is the base's (v204's
//      js/ui/monthsummary.js out of Git at 6ab193d), byte for byte, every month of every
//      seeded year, under both readings of the gates; and the file is the base's but for the
//      extraction and the one hook line.
//   7. THE GATE: shut or unapproved, no «הוחזר במזומן» and no «תיקון-היפוך», and every other
//      figure the same (a year has no carry either way).
//   8. THE WORKBOOK, built by the shipped vendor/xlsx-0.18.5.min.js and read back by readers
//      that have never heard of it: every cell the reading's, the sheets in order with
//      «עובדי יוסף גבס» last, right to left, the frame on «סיכום», the name; the look that
//      never costs the file; the CSV that leaves when the library is missing; a refusal.
//   9. IT WRITES NOTHING: every key on the disk, byte for byte, across the reading, the open,
//      the arrows, a month's row, the export - then shown to notice a real write. And a redraw
//      never reads: shut, render() asks nothing of the record; open on a moved record, the
//      figures go at once and the year is read ONCE, 1.5 s after the last of three draws.
//  10. THE WORDS: each new one pinned, each borrowed one found where its owner keeps it.
//  11. THE COST: a season year read under the budget, the gate asked at most once a reading
//      and never planned on an approved record.

import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDevice } from './harness.mjs';
import { makeDom } from './moneydom.mjs';
import { unzip, tags, attr, SHEETJS_CODE, SHEETJS_PRESENT, SHEETJS_REASON } from './exports-proof.lib.mjs';
import { suite, check, same, given, report } from './runner.mjs';

process.env.TZ = 'Asia/Jerusalem';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = file => readFileSync(join(ROOT, file), 'utf8');
const YEAR_SRC = source('js/ui/yearsummary.js');
const MONTH_SRC = source('js/ui/monthsummary.js');

// The commit this track was cut from: v204, origin/main.
const BASE = '6ab193d';
let BASE_MONTH = null;
function baseMonthSummary() {
    if (BASE_MONTH === null) {
        let code = '';
        try {
            code = execFileSync('git', ['-C', ROOT, 'show', `${BASE}:js/ui/monthsummary.js`],
                { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
        } catch (error) { code = ''; }
        given('the base commit is in this repository', code.length > 0, BASE);
        given('and its month summary knows no year', code.indexOf('monthSummaryReadRange') === -1
            && code.indexOf('yearSummaryEntryLabel') === -1);
        BASE_MONTH = code;
    }
    return BASE_MONTH;
}

const SHUT = { carryAdvances: false, ledgerWrites: false };
const OPEN = { carryAdvances: true, ledgerWrites: true };

const agora = value => Math.round(Number(value) * 100) / 100;
// The marks the app pins direction with, taken off so a line can be read and compared.
const plain = text => String(text).replace(/[\u200e\u2066-\u2069]/g, '');
const addDays = (date, days) => {
    const [y, m, d] = date.split('-').map(Number);
    const at = new Date(y, m - 1, d + days, 12);
    return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
};
const datesBetween = (from, to) => {
    const out = [];
    for (let date = from; date <= to; date = addDays(date, 1)) out.push(date);
    return out;
};
const saturday = date => new Date(`${date}T12:00:00`).getDay() === 6;
const MONTH_KEYS = year => Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
const lastOf = key => {
    const [y, m] = key.split('-').map(Number);
    return `${key}-${String(new Date(y, m, 0, 12).getDate()).padStart(2, '0')}`;
};

// A clock in the device's hands: setTimeout and clearTimeout replaced inside its context, and
// time moved only by advance() - so "1.5 s after the last draw" is asked of the code, not of
// the machine's load.
function fakeClock(device) {
    let now = 0;
    let next = 0;
    const queue = new Map();
    device.ctx.setTimeout = (fn, ms) => { next += 1; queue.set(next, { at: now + (Number(ms) || 0), fn }); return next; };
    device.ctx.clearTimeout = id => { queue.delete(id); };
    return {
        advance(ms) {
            const until = now + ms;
            for (;;) {
                let due = null;
                queue.forEach((timer, id) => {
                    if (timer.at <= until && (!due || timer.at < due.timer.at)) due = { id, timer };
                });
                if (!due) break;
                queue.delete(due.id);
                now = due.timer.at;
                due.timer.fn();
            }
            now = until;
        }
    };
}

const IDS = ['reportsView', 'advancesView', 'workerDaysTitle', 'workerDaysMeta', 'workerDaysBody', 'workerDaysModal',
    'monthSummaryModal', 'monthSummaryTitle', 'monthSummaryPrev', 'monthSummaryNext', 'monthSummaryMonth',
    'monthSummaryBody', 'monthSummaryYear', 'monthSummaryFoldLabel', 'monthSummaryText', 'monthSummarySend',
    'monthSummaryCopy', 'monthSummaryClose', 'monthSummaryStatus',
    'yearSummaryModal', 'yearSummaryTitle', 'yearSummaryPrev', 'yearSummaryYear', 'yearSummaryNext',
    'yearSummaryBody', 'yearSummaryExport', 'yearSummaryClose', 'yearSummaryStatus'];

// The report code, the two summaries and owes.js (the key a reading is kept under) in the
// device's own context, over a DOM that can be read back - the way tests/monthsummary.test.mjs
// reaches the month. An anchor is still the harness's, so a CSV handed over is a file caught.
function withYear(device, options = {}) {
    const dom = makeDom();
    IDS.forEach(id => dom.register(id));
    dom.getElementById('monthSummaryYear').hidden = true;     // as index.html draws it
    const harnessDocument = device.ctx.document;
    const make = dom.createElement;
    dom.createElement = tag => {
        if (tag === 'a') return harnessDocument.createElement('a');
        const node = make(tag);
        node.dataset = {};
        return node;
    };
    device.ctx.document = dom;
    device.dom = dom;
    device.run = code => vm.runInContext(code, device.ctx, { filename: 'harness:yearsummary' });
    device.run(source('js/ui/sitecolor.js'));
    device.run(source('js/ui/reports.js'));
    device.run(options.month || MONTH_SRC);
    device.run(source('js/ui/owes.js'));
    if (options.year !== false) device.run(YEAR_SRC);
    device.ctx.showView = () => {};
    device.told = [];
    device.ctx.askTell = message => { device.told.push(message); return Promise.resolve(true); };
    device.ctx.askConfirm = () => Promise.resolve(true);
    device.chosen = [];
    device.answers = [];
    device.ctx.askChoice = settings => {
        device.chosen.push(settings);
        return Promise.resolve(device.answers.length ? device.answers.shift() : null);
    };
    device.ctx.shareTextOut = (text, status, done) => { if (done) done(); };
    device.ctx.copyTextOut = () => {};
    device.facts = year => JSON.parse(device.run(`JSON.stringify(yearSummaryFacts(${JSON.stringify(year)}))`));
    return device;
}

function reopen(storage, flags, today, options = {}) {
    const device = withYear(makeDevice({ deviceId: options.deviceId || 'd_year', storage, flags }), options);
    device.setToday(today);
    device.State.load();
    device.setToday(today);
    return device;
}

const approve = (device, at) => {
    const plan = device.call('planCarryMigration', device.State.schedule);
    return device.State.commit(device.call('recordCarryApproval', device.State.schedule,
        plan, at || '2026-02-01T09:00:00.000Z', 'd_person'));
};

// The sheet's rows over a range, with nothing else pointed: what «דוחות» has on a custom
// range and no man left out.
const sheetRows = (device, from, to) => JSON.parse(device.run(`reportReadOnce(() => {
    const held = [REPORT_RANGE.from, REPORT_RANGE.to, REPORT_WORKERS, REPORT_PRESET];
    REPORT_RANGE.from = ${JSON.stringify(from)}; REPORT_RANGE.to = ${JSON.stringify(to)};
    REPORT_WORKERS = null; REPORT_PRESET = 'custom';
    try {
        return JSON.stringify(payrollRows().map(row => ({ id: String(row.workerId), name: row.name,
            attendanceDays: row.attendanceDays, payUnits: row.payUnits, doubleDays: row.doubleDays,
            extraHours: row.extraHours, amount: row.amount, money: moneyOf(row) })));
    } finally { [REPORT_RANGE.from, REPORT_RANGE.to, REPORT_WORKERS, REPORT_PRESET] = held; }
})`));

// ---------------------------------------------------------------- seeded years
//
// `memory` remembers what was RECORDED, never what anything was worth.
function mulberry(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const RAISE_ON = '2026-06-15';
const UNPRICED_ON = '2026-03-10';
const ARCHIVED_FROM = '2026-05-01';
const CROSS = { from: '2026-12-25', to: '2027-01-07' };

// The disk of one seeded record, written on a phone whose gates are open, so that the same
// bytes can be opened under either reading.
function seededDisk(seed, shape) {
    const rand = mulberry(seed);
    const pick = list => list[Math.floor(rand() * list.length)];
    const today = shape.crossing ? '2027-01-10' : '2026-11-19';
    const last = shape.crossing ? CROSS.to : today;
    const first = makeDevice({ deviceId: `d_year${seed}`, flags: OPEN });
    first.setToday(today);
    const schedule = first.State.schedule;
    const memory = { repaid: [], given: [] };

    const crew = 6 + Math.floor(rand() * 4);
    schedule.workers = [];
    for (let n = 1; n <= crew; n += 1) {
        const worker = { id: `w_${n}`, name: `עובד ${seed}-${n}`, active: true,
            dailyRate: n === 1 ? 400 : pick([380, 410, 450, 610]), hourlyRate: pick([0, 50, 60]) };
        // Both cycles on one record, and one man whose cycle changes in June.
        if (n === 2 || (n > 4 && rand() < 0.3)) worker.payCycles = '2026-01-02=weekly';
        if (n === 3) worker.payCycles = '2026-01-02=weekly;2026-06-05=biweekly';
        schedule.workers.push(worker);
    }
    // The last man is switched off in May and keeps every day he worked before it.
    const archived = schedule.workers[crew - 1];
    const sites = 3 + Math.floor(rand() * 3);
    schedule.places = [];
    for (let n = 1; n <= sites; n += 1) schedule.places.push({ id: `p_${n}`, name: `אתר ${seed}-${n}`, active: true });
    const siteIds = schedule.places.map(place => place.id);

    datesBetween('2026-01-01', last).forEach(date => {
        // THE RAISE: days already written keep the rate they were written at.
        if (date === RAISE_ON) schedule.workers[0].dailyRate = 480;
        if (saturday(date)) return;
        schedule.workers.forEach(worker => {
            if (worker === archived && date >= ARCHIVED_FROM) return;
            const crossing = shape.crossing && worker.id === 'w_1' && date >= CROSS.from;
            const unpriced = shape.unpriced && worker.id === 'w_4' && date === UNPRICED_ON;
            const roll = rand();
            if (!crossing && !unpriced && roll < 0.25) return;
            if (!crossing && !unpriced && roll < 0.29) {
                first.call('markAbsent', schedule, date, worker.id, 'actual');
                return;
            }
            const one = pick(siteIds);
            const band = rand();
            const rate = crossing || unpriced ? undefined : (band < 0.08 ? 'double' : band < 0.16 ? 'extra' : undefined);
            const hours = rate === 'extra' ? pick([1, 2, 3.5]) : 0;
            // ONE DAY WITH NO DAILY RATE: written while his roster has none (and an hourly
            // rate, so the day is stamped and stays unpriced whatever the roster says later).
            const held = unpriced ? [worker.dailyRate, worker.hourlyRate] : null;
            if (unpriced) { worker.dailyRate = 0; worker.hourlyRate = 50; }
            first.call('assignPlace', schedule, date, worker.id, 'actual', crossing ? 'p_1' : one, rate, hours || undefined);
            if (unpriced) { worker.dailyRate = held[0]; worker.hourlyRate = held[1]; }
            if (!crossing && !unpriced && roll > 0.95) {
                first.call('assignPlace', schedule, date, worker.id, 'actual', pick(siteIds.filter(id => id !== one)));
            }
        });
        if (rand() < 0.15) first.call('setRimaCount', schedule, date, pick(siteIds.slice(0, 2)), 1 + Math.floor(rand() * 4));
        if (rand() < 0.1) first.call('setYosefGevesCount', schedule, date, siteIds[siteIds.length - 1], 1 + Math.floor(rand() * 3));
    });
    archived.active = false;
    // Advances - never to w_1, whose fortnight across the new year is closed below with
    // nothing to take.
    schedule.workers.slice(1).forEach(worker => {
        const count = Math.floor(rand() * 4);
        for (let n = 0; n < count; n += 1) {
            const date = addDays('2026-01-01', Math.floor(rand() * 300));
            first.call('addAdvance', schedule, worker.id, date, pick([200, 500, 1500, 250.5]), '');
            memory.given.push({ worker: worker.id, date });
        }
    });
    first.State.save({ silent: true });

    // REOPENED, which is what mirrors the advances into the ledger.
    const device = reopen(first.dump(), OPEN, today, { deviceId: `d_year${seed}` });
    if (shape.approve) approve(device);
    const writes = device.call('financialWritingEnabled', device.State.schedule) === true;
    // Cash handed back - by the model's recorder where this record may be written, and
    // straight onto the ledger where it may not (it arrived from another phone).
    device.State.schedule.workers.forEach(worker => {
        const mine = device.call('advancesFor', device.State.schedule, worker.id, '0000-01-01', '9999-12-31');
        if (mine.length === 0 || rand() < 0.4) return;
        const back = pick([100, 200, 50]);
        const date = addDays(mine[0].date, 1 + Math.floor(rand() * 20));
        if (date > today) return;
        if (writes) {
            const done = device.State.commit(device.call('recordAdvanceRepaid', device.State.schedule,
                mine[0].id, back, date, '', `${date}T10:00:00.000Z`, 'd_person', 'cash'));
            if (done !== true) return;
        } else {
            device.State.schedule.ledger.advances[`le_back_${worker.id}`] = {
                id: `le_back_${worker.id}`, advanceId: mine[0].id, kind: 'repaid', workerId: worker.id, date,
                amount: back, note: '', method: 'cash', at: `${date}T10:00:00.000Z`, by: 'd_elsewhere' };
            device.State.save({ silent: true });
        }
        memory.repaid.push({ date, amount: back });
    });
    // THE FORTNIGHT ACROSS 1 JANUARY, closed - and then a day of it corrected after its close.
    let closed = false;
    if (shape.crossing) {
        given(`seed ${seed}: a record that may be closed`, writes === true);
        const changes = device.call('closePeriodChanges', device.State.schedule, 'w_1', CROSS.from, CROSS.to,
            '2027-01-08T10:00:00.000Z', 'd_person', 0);
        given(`seed ${seed}: w_1's fortnight across the new year closes`, changes.length > 0);
        given(`seed ${seed}: and the close is kept`, device.State.commitMany(changes) === true);
        given(`seed ${seed}: and a day of it is corrected after the close`, device.State.commit(
            device.call('clearWorkerDay', device.State.schedule, '2027-01-05', 'w_1', 'actual')) === true);
        closed = true;
    }
    return { storage: device.dump(), today, memory, closed, years: shape.crossing ? [2026, 2027] : [2026] };
}

const SEEDS = [61, 62, 63, 64, 65, 66, 67, 68];
const shapeOf = seed => ({ unpriced: seed % 2 === 0, crossing: seed % 4 === 1, approve: seed % 3 !== 0 });
const DISKS = {};
SEEDS.forEach(seed => { DISKS[seed] = seededDisk(seed, shapeOf(seed)); });

const seen = { years: 0, months: 0, readings: 0, unpriced: 0, notSummed: 0, summed: 0, rima: 0, yosef: 0,
    archived: 0, repaidShown: 0, repaidHidden: 0, unapproved: 0, crossing: 0, cycleChange: 0,
    weekly: 0, empty: 0, agorot: 0, monthInProgress: 0, monthUnpriced: 0 };

// The drawn year, read off the DOM: the tiles, the months, the men and the sites as text.
function drawn(device) {
    const body = device.dom.getElementById('yearSummaryBody');
    const texts = (node, cls) => node.querySelectorAll(cls).map(n => n.textContent);
    return {
        tiles: body.querySelectorAll('.msum-tile').map(tile => [tile.getAttribute('data-figure'),
            tile.children[0].textContent, tile.children[1].textContent]),
        months: body.querySelectorAll('.ysum-month').map(row => ({
            key: row.getAttribute('data-ysum-month'),
            name: texts(row, '.ysum-month-name')[0],
            empty: texts(row, '.ysum-month-empty'),
            own: texts(row, '.ysum-bar-count'),
            values: texts(row, '.ysum-pair-value'),
            labels: texts(row, '.ysum-pair-label'),
            tags: texts(row, '.ysum-month-tag'),
            width: (row.querySelectorAll('.ysum-bar-fill')[0] || { style: {} }).style.width
        })),
        men: body.querySelectorAll('.ysum-man').map(row => [texts(row, '.ysum-man-name')[0],
            texts(row, '.ysum-inactive'), texts(row, '.ysum-pair-value')]),
        menLabels: body.querySelectorAll('.ysum-man').map(row => texts(row, '.ysum-pair-label')),
        sites: body.querySelectorAll('.ysum-site').map(row => [texts(row, '.site-name')[0],
            texts(row, '.ysum-span')[0], texts(row, '.ysum-pair-label'), texts(row, '.ysum-pair-value')]),
        text: body.textContent
    };
}

// ---------------------------------------------------------------- the hand records
//
// Defined above the first suite: they run inside the suites that call them (tests/nonassertions.test.mjs).
//
// THE YEAR BY HAND (sections 2, 3, 7-10):
//
//   אלף   400 a day, fortnightly                 5/1 צפון · 10/3 צפון · 15/6 דרום double
//   בית   300 a day, 50 an hour, weekly           5/1 צפון · 10/3 דרום (written with NO daily
//                                                 rate) · 15/6 דרום +2h
//   גימל  350 a day, switched off afterwards      5/1 דרום
//   Rima 2 on צפון on 5/1 · יוסף גבס 3 on דרום on 15/6
//   500 handed to אלף on 12/3, 100 back on 20/3 · 250.50 handed to גימל on 6/1
//
//   January  400 + 300 + 350 = 1,050      March  400 (בית's day has no rate) · June 800 + 400
//   The YEAR: אלף 1,600 + גימל 350 = 1,950 - בית is out of the whole year's wage, because one
//   of his days has no rate; out of March's only. The months add to 2,650.
function handPhone(flags, options = {}) {
    const first = makeDevice({ deviceId: 'd_hand', flags: OPEN });
    first.setToday('2026-11-19');
    const schedule = first.State.schedule;
    schedule.workers = [
        { id: 'w_a', name: 'אלף', active: true, dailyRate: 400, hourlyRate: 0 },
        { id: 'w_b', name: 'בית', active: true, dailyRate: 300, hourlyRate: 50, payCycles: '2026-01-02=weekly' },
        { id: 'w_c', name: 'גימל', active: true, dailyRate: 350, hourlyRate: 0 }];
    schedule.places = [{ id: 'p_1', name: 'צפון', active: true }, { id: 'p_2', name: 'דרום', active: true }];
    const put = (date, worker, place, rate, hours) =>
        first.call('assignPlace', schedule, date, worker, 'actual', place, rate, hours);
    put('2026-01-05', 'w_a', 'p_1'); put('2026-01-05', 'w_c', 'p_2');
    if (!options.onlyMarch) put('2026-01-05', 'w_b', 'p_1');
    put('2026-03-10', 'w_a', 'p_1');
    if (options.priced) put('2026-03-10', 'w_b', 'p_2');
    else {
        schedule.workers[1].dailyRate = 0;
        put('2026-03-10', 'w_b', 'p_2');
        schedule.workers[1].dailyRate = 300;
    }
    put('2026-06-15', 'w_a', 'p_2', 'double');
    if (!options.onlyMarch) put('2026-06-15', 'w_b', 'p_2', 'extra', 2);
    first.call('setRimaCount', schedule, '2026-01-05', 'p_1', 2);
    if (options.geves !== false) first.call('setYosefGevesCount', schedule, '2026-06-15', 'p_2', 3);
    first.call('addAdvance', schedule, 'w_a', '2026-03-12', 500, '');
    first.call('addAdvance', schedule, 'w_c', '2026-01-06', 250.5, '');
    if (options.advanceB) first.call('addAdvance', schedule, 'w_b', options.advanceB, 200, '');
    // 1,500 typed for אלף on 3/2 where 150 was handed over - corrected below by «תיקון טעות».
    if (options.typo) first.call('addAdvance', schedule, 'w_a', '2026-02-03', 1500, '');
    schedule.workers[2].active = false;
    first.State.save({ silent: true });
    const opened = reopen(first.dump(), OPEN, '2026-11-19', { deviceId: 'd_hand' });
    if (options.approve !== false) {
        given('the hand record is approved', approve(opened) === true);
        const advance = opened.call('advancesFor', opened.State.schedule, 'w_a', '2026-03-01', '2026-03-31')[0];
        given('and 100 is handed back on 20/3', opened.State.commit(opened.call('recordAdvanceRepaid', opened.State.schedule,
            advance.id, 100, '2026-03-20', '', '2026-03-20T10:00:00.000Z', 'd_person', 'cash')) === true);
        if (options.typo) {
            // «תיקון טעות» on the advance's own card (reports.js): recordAdvanceReversed, the
            // model's writer, which dates the correction on the advance's own day.
            const typed = opened.call('advancesFor', opened.State.schedule, 'w_a', '2026-02-01', '2026-02-28')[0];
            given('and the 1,500 typed for 150 is corrected by «תיקון טעות» for 1,350', opened.State.commit(opened.call(
                'recordAdvanceReversed', opened.State.schedule, typed.id, 1350, typed.date, 'נרשם בטעות',
                '2026-02-04T10:00:00.000Z', 'd_person')) === true);
        }
    }
    return reopen(opened.dump(), flags, '2026-11-19', { deviceId: 'd_hand', year: options.year, month: options.month });
}

// ACROSS 1 JANUARY (section 5):
//
//   גימל  480 a day, fortnightly, every day but Saturday from Friday 25/12 to Thursday 7/1 -
//         twelve days, closed on 8/1 at 5,760; then 5/1 is taken off after the close
//   דלת   300 a day, weekly: 31/12 and 1/1, the first day of his next week
function crossingPhone(flags) {
    const first = makeDevice({ deviceId: 'd_cross', flags: OPEN });
    first.setToday('2027-01-10');
    const schedule = first.State.schedule;
    schedule.workers = [
        { id: 'w_c', name: 'גימל', active: true, dailyRate: 480, hourlyRate: 0 },
        { id: 'w_d', name: 'דלת', active: true, dailyRate: 300, hourlyRate: 0, payCycles: '2026-01-02=weekly' }];
    schedule.places = [{ id: 'p_1', name: 'צפון', active: true }];
    datesBetween(CROSS.from, CROSS.to).filter(date => !saturday(date))
        .forEach(date => first.call('assignPlace', schedule, date, 'w_c', 'actual', 'p_1'));
    ['2026-12-31', '2027-01-01'].forEach(date => first.call('assignPlace', schedule, date, 'w_d', 'actual', 'p_1'));
    first.State.save({ silent: true });
    const opened = reopen(first.dump(), OPEN, '2027-01-10', { deviceId: 'd_cross' });
    given('approved', approve(opened, '2027-01-08T09:00:00.000Z') === true);
    const changes = opened.call('closePeriodChanges', opened.State.schedule, 'w_c', CROSS.from, CROSS.to,
        '2027-01-08T10:00:00.000Z', 'd_person', 0);
    given('his fortnight closes, with nothing to take', changes.length > 0 && opened.State.commitMany(changes) === true);
    given('and 5/1 is taken off it after the close', opened.State.commit(
        opened.call('clearWorkerDay', opened.State.schedule, '2027-01-05', 'w_c', 'actual')) === true);
    return reopen(opened.dump(), flags, '2027-01-10', { deviceId: 'd_cross' });
}

// ---------------------------------------------------------------- 1-4. the figures
for (const [reading, flags] of [['the money gates open', OPEN], ['the money gates shut', SHUT]]) {
    suite(`every month is «סיכום חודש»'s own, and the year's line is the year's - ${reading}`);

    SEEDS.forEach(seed => {
        const disk = DISKS[seed];
        const device = reopen(disk.storage, flags, disk.today, { deviceId: `d_year${seed}` });
        const schedule = device.State.schedule;
        const wrong = [];
        const eq = (what, got, want) => {
            if (JSON.stringify(got) !== JSON.stringify(want)) wrong.push(`${what}: ${JSON.stringify(got)} against ${JSON.stringify(want)}`);
        };
        const approved = device.call('carryReportingEnabled', schedule) === true;
        if (flags.carryAdvances && !approved) seen.unapproved += 1;
        if (schedule.workers.some(w => w.payCycles === '2026-01-02=weekly')) seen.weekly += 1;
        if (schedule.workers.some(w => String(w.payCycles).indexOf(';') !== -1)) seen.cycleChange += 1;
        if (disk.closed) seen.crossing += 1;
        seen.readings += 1;

        disk.years.concat([2025]).forEach(year => {
            // The report is left on a range, a filter and a section nobody would confuse with
            // the year, so a reading that forgot to put them back is caught.
            device.run(`REPORT_RANGE.from = '2026-01-05'; REPORT_RANGE.to = '2026-01-09';`
                + ` REPORT_WORKERS = new Set(['w_1']); REPORT_SECTION = 'sites'; REPORT_PRESET = 'custom';`);
            const gate = device.run('carryReportingEnabled');
            const facts = device.facts(year);
            eq(`${year} the report is left as it was`, JSON.parse(device.run(
                'JSON.stringify([REPORT_RANGE.from, REPORT_RANGE.to, [...REPORT_WORKERS], REPORT_SECTION, REPORT_PRESET])')),
                ['2026-01-05', '2026-01-09', ['w_1'], 'sites', 'custom']);
            if (device.run('carryReportingEnabled') !== gate) wrong.push(`${year} the gate function was not put back`);
            seen.years += 1;
            const from = `${year}-01-01`;
            const to = `${year}-12-31`;
            eq(`${year} the range`, [facts.year, facts.range], [year, { from, to }]);
            eq(`${year} twelve months, January first`, facts.months.map(m => m.key), MONTH_KEYS(year));

            // ---- 1. the months: monthSummaryRead's own, in one scope
            const months = JSON.parse(device.run(`JSON.stringify(monthSummaryScope(() =>
                ${JSON.stringify(MONTH_KEYS(year))}.map(key => monthSummaryRead(key))))`));
            facts.months.forEach((month, at) => eq(`${month.key} the row is monthSummaryRead's`, month, months[at]));
            seen.months += 12;

            // ---- 2. the year's line, and whether the rows add up to it
            const line = JSON.parse(device.run(`JSON.stringify(monthSummaryScope(() =>
                monthSummaryReadRange(${JSON.stringify(String(year))}, { from: '${from}', to: '${to}' })))`));
            eq(`${year} the line is monthSummaryReadRange over the year`, facts.line, line);
            // Whether the year is smaller than its months: decided from who the year cannot price,
            // asked of the sheet here man by man and month by month - never by adding shekels.
            const yearSheet = sheetRows(device, from, to);
            const unknownIds = new Set(yearSheet.filter(row => row.amount === null).map(row => row.id));
            const pricedInAMonth = unknownIds.size > 0 && MONTH_KEYS(year).some(key => sheetRows(device, `${key}-01`, lastOf(key))
                .some(row => unknownIds.has(row.id) && row.attendanceDays > 0 && row.amount !== null));
            eq(`${year} the sentence stands exactly where a man the year cannot price worked priced in some month`,
                facts.notSummed, pricedInAMonth);
            eq(`${year} the men the year cannot price, named as its line names them`, facts.unpriced, line.unpriced);
            if (pricedInAMonth) seen.notSummed += 1; else if (!line.empty) seen.summed += 1;
            if (line.unpriced.length > 0) seen.unpriced += 1;
            if (line.empty) seen.empty += 1;

            // ---- 3. the men: the pay sheet's rows over the year
            const rows = sheetRows(device, from, to);
            // What a תיקון-היפוך of an advance took back, per man: the model's own sum by the kind
            // it corrects - asked only where the line says the record may be read that way.
            const undone = Object.fromEntries(JSON.parse(device.run(`JSON.stringify(State.schedule.workers.map(w =>
                [String(w.id), advanceReversalsFor(State.schedule, w.id, '${from}', '${to}', 'given')]))`)));
            eq(`${year} one man per row of the sheet, in its order`, facts.men.map(m => m.workerId), rows.map(r => r.id));
            facts.men.forEach((man, at) => {
                const row = rows[at];
                if (!row) return;
                eq(`${year} ${man.workerId} field by field`, [man.name, man.attendanceDays, man.payUnits, man.doubleDays,
                    man.extraHours, man.gross, man.handedOver],
                [row.name, row.attendanceDays, row.payUnits, row.doubleDays, Math.round(row.extraHours * 100) / 100,
                    row.money.gross, -row.money.netted || 0]);
                eq(`${year} ${man.workerId} «—» exactly for an unknown wage`, man.gross === null, row.amount === null);
                eq(`${year} ${man.workerId} the advances a תיקון-היפוך took back: the model's, and only where the line has corrections`,
                    man.handedOverReversed, line.reversed !== null ? undone[man.workerId] : null);
                const worker = schedule.workers.find(w => String(w.id) === man.workerId);
                eq(`${year} ${man.workerId} switched off or not`, man.active, !(worker && worker.active === false));
                if (!man.active) seen.archived += 1;
                if (!Number.isInteger(man.handedOver)) seen.agorot += 1;
            });
            const slack = 0.005 * facts.men.length + 1e-9;
            if (Math.abs(facts.men.reduce((sum, m) => sum + m.handedOver, 0) - line.advances) > slack) {
                wrong.push(`${year} the men's «מקדמות שניתנו» do not add up to the tile ${line.advances}`);
            }
            if (line.unpriced.length === 0 && line.gross !== null
                && Math.abs(facts.men.reduce((sum, m) => sum + (m.gross || 0), 0) - line.gross) > slack) {
                wrong.push(`${year} the men's «נצבר» do not add up to the tile ${line.gross}`);
            }

            // ---- 4. the sites: the billing's
            const billing = JSON.parse(device.run(`(() => {
                const invoice = invoiceByDate(State.schedule, '${from}', '${to}');
                const own = invoiceWithoutRima(State.schedule, '${from}', '${to}');
                const rima = rimaReport(State.schedule, '${from}', '${to}');
                const yosef = yosefGevesReport(State.schedule, '${from}', '${to}');
                return JSON.stringify({
                    sites: invoice.places.map(place => {
                        const dates = Object.keys(place.byDate).sort();
                        const mine = own.places.find(p => String(p.placeId) === String(place.placeId));
                        const theirs = rima.places.find(p => String(p.placeId) === String(place.placeId));
                        return { placeId: String(place.placeId), name: place.name, billed: place.workerDays,
                            own: mine ? mine.workerDays : 0, rima: theirs ? theirs.total : 0,
                            first: dates[0].slice(0, 7), last: dates[dates.length - 1].slice(0, 7) };
                    }),
                    yosef: yosef.places.map(p => ({ placeId: String(p.placeId), name: p.name, total: p.total })),
                    total: yosef.total
                });
            })()`));
            eq(`${year} the sites are the billing's`, facts.sites, billing.sites);
            facts.sites.forEach(site => eq(`${year} ${site.placeId} his own and Rima's are the billed count`,
                site.own + site.rima, site.billed));
            eq(`${year} יוסף גבס is its own report`, facts.yosef, billing.yosef);
            eq(`${year} and its total`, facts.line.yosef ? facts.line.yosef.total : 0, billing.total);
            if (line.rima) seen.rima += 1;
            if (billing.yosef.length > 0) seen.yosef += 1;
            if (line.repaid !== null && line.repaid > 0) seen.repaidShown += 1;
            if (line.repaid === null && disk.memory.repaid.some(r => r.date.startsWith(String(year)))) seen.repaidHidden += 1;

            // ---- 1 again: what is DRAWN for each month is what «סיכום חודש» draws for it
            device.run(`openYearSummary(${year})`);
            const shown = drawn(device);
            // A year with nothing says so in one sentence, and draws no row, tile or bar.
            eq(`${year} twelve rows drawn - or, for a year with nothing, none`, shown.months.map(m => m.key),
                facts.empty ? [] : MONTH_KEYS(year));
            if (facts.empty) {
                eq(`${year} an empty year is one sentence`, [device.dom.getElementById('yearSummaryBody')
                    .querySelectorAll('.empty-hint').map(n => n.textContent), shown.tiles.length], [['אין רישומים בשנה הזאת.'], 0]);
            }
            const monthLabel = facts.line.rima !== null ? 'ימי עובד־אתר בלי עובדי רימא' : 'ימי עובד־אתר';
            shown.months.forEach(row => {
                const mf = JSON.parse(device.run(`JSON.stringify(monthSummaryFacts('${row.key}'))`));
                const lines = JSON.parse(device.run(`JSON.stringify(monthSummaryMoneyLines(${JSON.stringify(mf.money)}))`));
                if (mf.name.indexOf(`${row.name} `) !== 0) wrong.push(`${row.key} named «${row.name}», the month says «${mf.name}»`);
                if (mf.empty) {
                    eq(`${row.key} an empty month says «—» and nothing else`, [row.empty, row.own, row.values], [['—'], [], []]);
                    return;
                }
                eq(`${row.key} his own men's worker-site days`, row.own, [String(mf.work.own !== null ? mf.work.own : mf.work.total)]);
                const corrected = lines.find(l => l.label === 'תיקון-היפוך');
                eq(`${row.key} the men, the wage, the advances (and a correction where it has one): the month's own strings`, row.values,
                    [String(mf.men.count), mf.headline.find(item => item.id === 'gross').text,
                        lines.find(l => l.label === mf.money.advancesLabel).value].concat(corrected ? [corrected.value] : []));
                eq(`${row.key} the wage is the month's tile`, mf.headline.find(item => item.id === 'gross').value, mf.money.gross);
                // What «סיכום חודש» says beside the same figures, said on the row: a month not over
                // yet, in the first words of its own sentence, and the men its «נצבר» leaves out.
                eq(`${row.key} the month's own caveats on its row`, row.tags,
                    (mf.inProgress ? ['החודש עוד לא נגמר.'] : []).concat(mf.money.unpriced ? [mf.money.unpriced] : []));
                if (mf.inProgress) seen.monthInProgress += 1;
                if (mf.money.unpriced) seen.monthUnpriced += 1;
            });
            if (!facts.empty) {
                const labels = device.dom.getElementById('yearSummaryBody').querySelectorAll('.ysum-bar-label')
                    .map(node => node.textContent);
                eq(`${year} the bar's figure is called what it counts`, [...new Set(labels)], labels.length ? [monthLabel] : []);
                const tiles = JSON.parse(device.run(`JSON.stringify(yearSummaryTiles(yearSummaryFacts(${year})))`));
                eq(`${year} the tiles drawn are the reading's, the money first`, shown.tiles,
                    tiles.map(t => [t.id, t.label, t.text]));
                eq(`${year} and «עובדי יוסף גבס» is no tile among them`, shown.tiles.filter(t => t[0] === 'yosef'), []);
                eq(`${year} the men drawn are the reading's`, shown.men.map(m => m[0]), facts.men.map(m => m.name));
            }
            device.run('closeYearSummary()');
        });
        same(`seed ${seed}: every figure of every year is the function's own`, wrong.slice(0, 4), []);
    });
}

suite('the corpus really held what it claims to');
check('years read under both readings, and an empty one each time', seen.years === SEEDS.length * 2 * 2 + 4
    && seen.empty >= SEEDS.length * 2, `${seen.years} ${seen.empty}`);
check('a year smaller than its months (the man with one unpriced day, priced elsewhere), and years that are not',
    seen.notSummed >= 4 && seen.summed >= 4 && seen.unpriced >= 4, `${seen.notSummed} ${seen.summed} ${seen.unpriced}`);
check('Rima and יוסף גבס counts', seen.rima >= 8 && seen.yosef >= 8, `${seen.rima} ${seen.yosef}`);
check('a man switched off, weekly men and a cycle that changes', seen.archived >= 8 && seen.weekly === seen.readings
    && seen.cycleChange === seen.readings, `${seen.archived} ${seen.weekly} ${seen.cycleChange}`);
check('advances with agorot handed over', seen.agorot > 0, String(seen.agorot));
check('cash handed back shown on approved records, and withheld where nobody approved or the gate is shut',
    seen.repaidShown > 0 && seen.repaidHidden > 0 && seen.unapproved > 0,
    `${seen.repaidShown} ${seen.repaidHidden} ${seen.unapproved}`);
check('fortnights across 1 January, closed and corrected', seen.crossing === 4, String(seen.crossing));
check('months not over yet, and months whose «נצבר» leaves a man out, each with its caveat on its row',
    seen.monthInProgress >= 8 && seen.monthUnpriced >= 4, `${seen.monthInProgress} ${seen.monthUnpriced}`);

// ---------------------------------------------------------------- 2 and 3. by hand (handPhone, above)
{
    suite('by hand: the year is read over the year, and the man with one unpriced day is out of it');

    const device = handPhone(OPEN);
    const facts = device.facts(2026);
    const month = key => facts.months.find(m => m.key === key);
    same('January, March and June: 1,050, 400 and 1,200 - March without בית, whose day there has no rate',
        [month('2026-01').gross, month('2026-03').gross, month('2026-06').gross, month('2026-03').unpriced, month('2026-01').unpriced],
        [1050, 400, 1200, ['בית'], []]);
    same('the year: 1,950 - בית out of all of it, not only out of March', [facts.line.gross, facts.line.unpriced], [1950, ['בית']]);
    same('his months add to more than the year (2,650 against 1,950), and the year says why: he was priced in January and June',
        [agora(facts.months.reduce((s, m) => s + m.gross, 0)), facts.notSummed, facts.unpriced], [2650, true, ['בית']]);
    same('the men: his wage «—», the others\' theirs, and what each was handed', facts.men.map(m => [m.name, m.active,
        m.attendanceDays, m.payUnits, m.doubleDays, m.extraHours, m.gross, m.handedOver]), [
        ['אלף', true, 3, 4, 1, 0, 1600, 500],
        ['בית', true, 3, 3, 0, 2, null, 0],
        ['גימל', false, 1, 1, 0, 0, 350, 250.5]]);
    same('the sites: billed, his own, Rima\'s, and the months', facts.sites, [
        { placeId: 'p_1', name: 'צפון', billed: 5, own: 3, rima: 2, first: '2026-01', last: '2026-03' },
        { placeId: 'p_2', name: 'דרום', billed: 4, own: 4, rima: 0, first: '2026-01', last: '2026-06' }]);
    same('יוסף גבס, its own', [facts.yosef, facts.line.yosef.total], [[{ placeId: 'p_2', name: 'דרום', total: 3 }], 3]);

    device.run('openYearSummary(2026)');
    const shown = drawn(device);
    // THE MONEY FIRST (fix round 1): «נצבר» and what was handed over lead, then the days; and
    // «עובדי יוסף גבס» is no tile at all - its count is its own table, last.
    same('the tiles, label over value, in the order they are read: the money first, then the days', shown.tiles, [
        ['gross', 'נצבר', '1950 ₪'], ['advances', 'מקדמות שניתנו', '750.5 ₪'], ['repaid', 'הוחזר במזומן', '100 ₪'],
        ['workingDays', 'ימי עבודה', '3'], ['attendance', 'ימי נוכחות', '7'], ['men', 'עובדים שעבדו', '3'],
        ['siteDays', 'סה״כ ימי עובד־אתר', '9'], ['ownSiteDays', 'בלי עובדי רימא', '7'], ['rima', 'סה״כ עובדי רימא', '2']]);
    const body = device.dom.getElementById('yearSummaryBody');
    const gridOf = cls => (body.querySelectorAll(cls)[0] || { children: [] }).children.map(t => t.getAttribute('data-figure'));
    same('the money leads in a grid of its own, the days after it', [gridOf('.ysum-lead'), gridOf('.ysum-counts')],
    [['gross', 'advances', 'repaid'], ['workingDays', 'attendance', 'men', 'siteDays', 'ownSiteDays', 'rima']]);
    same('the frame first, before any figure', body.querySelectorAll('.ysum-frame-line').map(n => n.textContent), [
        'נצבר לפי הרישום: כל יום עבודה בשנה, לפי השכר שנרשם ליום הזה. זה לא מה ששולם בפועל.',
        'תקופת חשבון שעוברת את 1 בינואר מתחלקת כאן לפי הימים: כל יום נספר בשנה שבה עבדו בו.',
        'השנה עוד לא נגמרה. המספרים הם של מה שנרשם עד עכשיו.']);
    check('and the frame is the first thing under the range', body.children[1].className === 'ysum-frame', body.children[1].className);
    same('he is named in the sheet\'s own sentence, and the year says why its rows do not add up',
        [body.querySelectorAll('.ysum-figures')[0].querySelectorAll('.msum-warn').map(n => plain(n.textContent)),
            body.querySelectorAll('.ysum-notsummed').map(n => n.textContent)],
        [['⚠️ 1 עובדים בלי שכר יומי, ולכן הסכום חסר אותם: בית. הוסף להם שכר במסך "עובדים ואתרים".'],
            ['עובד שיש לו אפילו יום עבודה אחד בלי שכר יומי לא נכלל בנצבר של כל השנה, ולכן הנצבר של השנה קטן מחיבור החודשים.']]);
    check('the reason stands straight under the money, before the days',
        body.querySelectorAll('.ysum-figures')[0].children.map(n => n.className).join(' | ')
        === 'msum-head | msum-tiles ysum-lead | hint hint-warn msum-warn | msum-note ysum-notsummed | msum-tiles ysum-counts',
        body.querySelectorAll('.ysum-figures')[0].children.map(n => n.className).join(' | '));
    check('his name travels isolated', body.querySelectorAll('.ysum-figures')[0].querySelectorAll('.msum-warn')[0]
        .textContent.indexOf('\u2068בית\u2069') !== -1);
    same('«עובדי יוסף גבס» is said once: its own table, and nowhere among the figures', [
        body.querySelectorAll('.ysum-figures')[0].textContent.indexOf('יוסף גבס'),
        body.textContent.split('עובדי יוסף גבס בלבד. אינם נכללים בשכר ואינם נכללים בחיוב.').length - 1], [-1, 1]);
    same('the months: the hint before the first row, three with a figure, nine «—», each bar the share of the busiest',
        [body.querySelectorAll('.ysum-months')[0].children.slice(0, 2).map(n => n.className),
            shown.months.map(m => (m.empty.length ? [m.key, '—'] : [m.key, m.own[0], m.values, m.width]))], [
            ['msum-head', 'msum-note ysum-months-hint'], [
                ['2026-01', '3', ['3', '1050 ₪', '250.5 ₪'], '100%'], ['2026-02', '—'], ['2026-03', '2', ['2', '400 ₪', '500 ₪'], '67%'],
                ['2026-04', '—'], ['2026-05', '—'], ['2026-06', '2', ['2', '1200 ₪', '0 ₪'], '67%'], ['2026-07', '—'], ['2026-08', '—'],
                ['2026-09', '—'], ['2026-10', '—'], ['2026-11', '—'], ['2026-12', '—']]]);
    same('March\'s row says what «סיכום חודש» says beside its «נצבר»: the man it leaves out; no other row says anything',
        shown.months.map(m => [m.key, m.tags.map(plain)]).filter(m => m[1].length > 0),
        [['2026-03', ['⚠️ 1 עובדים בלי שכר יומי, ולכן הסכום חסר אותם: בית. הוסף להם שכר במסך "עובדים ואתרים".']]]);
    same('the men, label over value: a double day and an extra hour only where he has one; the man switched off says so',
        [shown.men, shown.menLabels], [[
            ['אלף', [], ['3', '4', '1', '1600 ₪', '500 ₪']],
            ['בית', [], ['3', '3', '2', '—', '0 ₪']],
            ['גימל', ['לא פעיל'], ['1', '1', '350 ₪', '250.5 ₪']]], [
            ['ימי נוכחות', 'ימי שכר', 'כפולים', 'נצבר', 'מקדמות שניתנו'],
            ['ימי נוכחות', 'ימי שכר', 'שעות נוספות', 'נצבר', 'מקדמות שניתנו'],
            ['ימי נוכחות', 'ימי שכר', 'נצבר', 'מקדמות שניתנו']]]);
    same('and after the last man, the reason for his «—» - the «עובדים» sheet\'s own note row, on the glass',
        [body.querySelectorAll('.ysum-men')[0].children.slice(-1).map(n => [n.className, plain(n.textContent)])],
        [[['hint hint-warn msum-warn ysum-men-warn', '⚠️ 1 עובדים בלי שכר יומי, ולכן הסכום חסר אותם: בית. הוסף להם שכר במסך "עובדים ואתרים".']]]);
    same('the sites, and the months each was worked in: his own men\'s share and Rima\'s only on a site Rima has a count on',
        shown.sites, [
            ['צפון', 'ינואר–מרץ', ['סה״כ ימי עובד־אתר', 'בלי עובדי רימא', 'עובדי רימא'], ['5', '3', '2']],
            ['דרום', 'ינואר–יוני', ['סה״כ ימי עובד־אתר'], ['4']]]);
    const geves = body.querySelectorAll('.ysum-yosefgeves')[0];
    same('«עובדי יוסף גבס»\'s own table, last of all, with its total and its note',
        [body.children[body.children.length - 1] === geves, geves.children[0].textContent,
            geves.querySelectorAll('.msum-total')[0].textContent, geves.querySelectorAll('.msum-note')[0].textContent],
        [true, 'עובדי יוסף גבס', 'סה״כ עובדי יוסף גבס3', 'עובדי יוסף גבס בלבד. אינם נכללים בשכר ואינם נכללים בחיוב.']);
    check('nothing on it is a payslip: no «לתשלום», no deduction, no balance',
        !/לתשלום|נוכה מהשכר|יתרת|החשבון נסגר|שולם במזומן/.test(shown.text), shown.text.slice(0, 80));
    same('the months\' sentence over them', body.querySelectorAll('.ysum-months .msum-note').map(n => n.textContent),
        ['לחיצה על חודש פותחת את סיכום החודש.']);

    // The same record with his March day priced: the rows add up, and nothing says otherwise.
    const priced = handPhone(OPEN, { priced: true }).facts(2026);
    same('with his day priced the year is the twelve rows, and the sentence is gone',
        [priced.line.gross, agora(priced.months.reduce((s, m) => s + m.gross, 0)), priced.notSummed, priced.line.unpriced],
        [2950, 2950, false, []]);
}

{
    suite('why the year is smaller than its months: decided from the unpriced lists, never from a sum');

    // A man whose ONLY worked month is the one with the unpriced day: the year and the months
    // agree about him (he is out of both), so there is nothing to explain.
    const only = handPhone(OPEN, { onlyMarch: true }).facts(2026);
    same('a man whose only month is the unpriced one: named, the months the year, and no sentence',
        [only.unpriced, only.line.gross, agora(only.months.reduce((s, m) => s + m.gross, 0)), only.notSummed],
        [['בית'], 1950, 1950, false]);

    // THE «WORKED» HALF OF THE RULE (fix round 1: no fixture held it). The same man handed 200 in
    // May: May's sheet has a row of his with no day in it and a wage it CAN price (nothing), so a
    // rule that forgot «he worked there» would say the year is smaller than its months - and it
    // is not: he worked in March only, and is out of March's «נצבר» as he is out of the year's.
    const handed = handPhone(OPEN, { onlyMarch: true, advanceB: '2026-05-04' });
    const may = sheetRows(handed, '2026-05-01', '2026-05-31').find(row => row.id === 'w_b');
    given('May has a row of his with no day in it, priced', Boolean(may) && may.attendanceDays === 0 && may.amount !== null,
        JSON.stringify(may));
    const handedFacts = handed.facts(2026);
    same('a man who only WORKED in the unpriced month, and was handed an advance in another: no sentence',
        [handedFacts.unpriced, handedFacts.line.gross, agora(handedFacts.months.reduce((s, m) => s + (m.gross || 0), 0)),
            handedFacts.notSummed], [['בית'], 1950, 1950, false]);
    handed.run('openYearSummary(2026)');
    same('and the screen says none', handed.dom.getElementById('yearSummaryBody').querySelectorAll('.ysum-notsummed').length, 0);

    // A YEAR WITH NO «נצבר» TO BE SMALLER: one man, priced in January, with ONE day in March that
    // has no rate - the year shows «—», and the unpriced sentence is its reason; «smaller than its
    // months» would be said of nothing (fix round 1).
    const lone = makeDevice({ deviceId: 'd_lone', flags: OPEN });
    lone.setToday('2026-11-19');
    lone.State.schedule.workers = [{ id: 'w_a', name: 'אלף', active: true, dailyRate: 400, hourlyRate: 0 }];
    lone.State.schedule.places = [{ id: 'p_1', name: 'צפון', active: true }];
    ['2026-01-05', '2026-01-06'].forEach(date => lone.call('assignPlace', lone.State.schedule, date, 'w_a', 'actual', 'p_1'));
    Object.assign(lone.State.schedule.workers[0], { dailyRate: 0, hourlyRate: 50 });
    lone.call('assignPlace', lone.State.schedule, '2026-03-10', 'w_a', 'actual', 'p_1');
    Object.assign(lone.State.schedule.workers[0], { dailyRate: 400, hourlyRate: 0 });
    lone.State.save({ silent: true });
    const alone = reopen(lone.dump(), OPEN, '2026-11-19', { deviceId: 'd_lone' });
    const aloneFacts = alone.facts(2026);
    given('the year has no figure, and he is priced in January',
        aloneFacts.line.gross === null && aloneFacts.months[0].gross === 800,
        JSON.stringify([aloneFacts.line.gross, aloneFacts.months[0].gross]));
    alone.run('openYearSummary(2026)');
    const aloneBody = alone.dom.getElementById('yearSummaryBody');
    same('under a «נצבר» of «—» the screen says only why it is «—»', [
        aloneBody.querySelectorAll('.msum-tile').filter(t => t.getAttribute('data-figure') === 'gross')[0].children[1].textContent,
        aloneBody.querySelectorAll('.ysum-notsummed').length,
        aloneBody.querySelectorAll('.ysum-figures')[0].querySelectorAll('.msum-warn').map(n => plain(n.textContent))],
    ['—', 0, ['⚠️ 1 עובדים בלי שכר יומי, ולכן הסכום חסר אותם: אלף. הוסף להם שכר במסך "עובדים ואתרים".']]);
    // The rows «סיכום» is written from (the workbook's suite below holds the file to them, cell for cell).
    const aloneSummary = JSON.parse(alone.run(`JSON.stringify(yearSummarySheets(yearSummaryFacts(2026))
        .find(sheet => sheet.key === 'summary').rows)`)).flat().map(cell => plain(cell));
    check('and so does «סיכום»: the unpriced sentence and not the other',
        aloneSummary.some(cell => cell.indexOf('בלי שכר יומי') !== -1) && aloneSummary.every(cell => cell.indexOf('קטן מחיבור החודשים') === -1));

    // A year with nobody unpriced whose rounded months miss the rounded year by an agora: an
    // hourly rate of 10.003, an hour and a half on two days in two months - each month's wage
    // 115.0045, rounded to 115; the year's 230.009, rounded to 230.01.
    const first = makeDevice({ deviceId: 'd_agora', flags: OPEN });
    first.setToday('2026-11-19');
    first.State.schedule.workers = [{ id: 'w_r', name: 'רבע', active: true, dailyRate: 100, hourlyRate: 10.003 }];
    first.State.schedule.places = [{ id: 'p_1', name: 'צפון', active: true }];
    ['2026-02-02', '2026-05-04'].forEach(date => first.call('assignPlace', first.State.schedule, date, 'w_r', 'actual', 'p_1', 'extra', 1.5));
    first.State.save({ silent: true });
    const device = reopen(first.dump(), OPEN, '2026-11-19', { deviceId: 'd_agora' });
    const spied = JSON.parse(device.run(`(() => {
        let reads = 0;
        const real = monthSummaryRead;
        monthSummaryRead = function () {
            const out = real.apply(this, arguments);
            let gross = out.gross;
            Object.defineProperty(out, 'gross', { enumerable: true, configurable: true,
                get() { reads += 1; return gross; }, set(value) { gross = value; } });
            return out;
        };
        try {
            const facts = yearSummaryFacts(2026);
            const during = reads;
            return JSON.stringify({ during, notSummed: facts.notSummed, unpriced: facts.unpriced, year: facts.line.gross,
                months: facts.months.filter(m => !m.empty).map(m => m.gross) });
        } finally { monthSummaryRead = real; }
    })()`));
    given('the rounded months miss the rounded year by an agora', JSON.stringify([spied.months, spied.year]) === '[[115,115],230.01]',
        JSON.stringify([spied.months, spied.year]));
    same('nobody unpriced: no sentence, whatever the agorot do', [spied.unpriced, spied.notSummed], [[], false]);
    same('and no month\'s «נצבר» was read to decide it - not one', spied.during, 0);
    check('the file adds no shekel to decide it: nothing in it rounds to the agora', YEAR_SRC.replace(/\/\/[^\n]*/g, '').indexOf('agora(') === -1);
}

// ---------------------------------------------------------------- 5. across 1 January (crossingPhone, above)
for (const [reading, flags] of [['gates open', OPEN], ['gates shut', SHUT]]) {
    suite(`${reading}: a fortnight across 1 January is split by its days, and neither year is its payslip`);

    const device = crossingPhone(flags);
    const closed = device.call('closedPeriods', device.State.schedule, 'w_c')[CROSS.from];
    given('the close froze twelve days at 5,760', closed && closed.gross === 5760, JSON.stringify(closed && closed.gross));
    same('and the sheet over exactly that fortnight prints the payslip', sheetRows(device, CROSS.from, CROSS.to)
        .find(r => r.id === 'w_c').money.gross, 5760);
    const y2026 = device.facts(2026);
    const y2027 = device.facts(2027);
    const his = (facts, id) => facts.men.find(m => m.workerId === id);
    same('2026 has his six days in it, at 480: 2,880', [his(y2026, 'w_c').attendanceDays, his(y2026, 'w_c').gross], [6, 2880]);
    same('2027 has the five left after the correction: 2,400 - the live record, not the frozen one',
        [his(y2027, 'w_c').attendanceDays, his(y2027, 'w_c').gross], [5, 2400]);
    check('no figure of his in either year is the payslip\'s 5,760',
        [his(y2026, 'w_c').gross, his(y2027, 'w_c').gross, y2026.line.gross, y2027.line.gross].indexOf(5760) === -1);
    same('the weekly man\'s two days are one in each year', [his(y2026, 'w_d').gross, his(y2027, 'w_d').gross], [300, 300]);
    same('each year is its months: December 3,180, January 2,700', [y2026.line.gross, y2026.months[11].gross,
        y2027.line.gross, y2027.months[0].gross], [3180, 3180, 2700, 2700]);
    same('2026 is over and 2027 is not', [y2026.inProgress, y2027.inProgress], [false, true]);
    // ON ITS LAST DAY THE YEAR READS WHOLE - «סיכום חודש»'s own rule for a month on its last
    // day (tests/monthsummary.test.mjs), so that December's summary and the year's never
    // disagree about whether what they show is finished. Deliberate, not an off-by-one.
    const decemberOf = () => JSON.parse(device.run(`JSON.stringify(monthSummaryFacts('2026-12'))`)).inProgress;
    device.setToday('2026-12-31');
    same('on 31 December the year reads whole, as December does on its last day',
        [device.facts(2026).inProgress, decemberOf()], [false, false]);
    // A YEAR THAT HAS NOT BEGUN is not over either (fix round 1): on 31 December the day screen
    // writes tomorrow's seder into 1 January, and «סיכום חודש»'s arrows reach January 2027 and
    // its door - where the year had read as finished.
    device.setToday('2026-12-31');
    same('on 31 December, 2027 - which has records already - is a year still being recorded', device.facts(2027).inProgress, true);
    device.run('openYearSummary(2027)');
    same('and its frame says so, as the year today is in does', device.dom.getElementById('yearSummaryBody')
        .querySelectorAll('.ysum-frame-line').map(n => n.textContent).slice(-1), ['השנה עוד לא נגמרה. המספרים הם של מה שנרשם עד עכשיו.']);
    device.run('closeYearSummary()');
    same('and 2025, behind it, has nothing to be in progress with', device.facts(2025).inProgress, false);
    device.setToday('2026-12-30');
    same('the day before, both are still being recorded', [device.facts(2026).inProgress, decemberOf()], [true, true]);
    device.setToday('2027-01-10');
    ['2026', '2027'].forEach(year => {
        device.run(`openYearSummary(${year})`);
        const text = device.dom.getElementById('yearSummaryBody').textContent;
        check(`${year}: no word of a payslip on the screen`, !/לתשלום|נוכה מהשכר|יתרת|החשבון נסגר/.test(text), text.slice(0, 60));
        check(`${year}: and the frame says how the fortnight was split`,
            text.indexOf('תקופת חשבון שעוברת את 1 בינואר מתחלקת כאן לפי הימים: כל יום נספר בשנה שבה עבדו בו.') !== -1);
        device.run('closeYearSummary()');
    });
}

// ---------------------------------------------------------------- 6. the extraction
{
    suite('the extraction moved nothing: monthSummaryRead is the base\'s, byte for byte');

    const base = baseMonthSummary();
    // THE FILE: the base's, with the extraction and the one hook line, and nothing else.
    const extracted = base
        .replace(`function monthSummaryRead(key) {
    const range = monthSummaryRange(key);
    const schedule = State.schedule;`, `function monthSummaryRead(key) {
    return monthSummaryReadRange(key, monthSummaryRange(key));
}

// The same numbers over any calendar span the caller names - the month above, or the
// year «סיכום שנה» reads (js/ui/yearsummary.js), whose own line is these functions asked
// over the whole year and never the twelve months added up. The body is the month's,
// moved here unchanged: a range that is not somebody's whole period is read by the sheet
// the plain way, a month and a year alike (wholeAccountRange, js/ui/reports.js).
function monthSummaryReadRange(key, range) {
    const schedule = State.schedule;`)
        .replace(`    const facts = monthSummaryFacts(MONTH_SUMMARY_KEY);
`, `    const facts = monthSummaryFacts(MONTH_SUMMARY_KEY);
    if (typeof yearSummaryEntryLabel === 'function') yearSummaryEntryLabel(MONTH_SUMMARY_KEY);
`);
    check('js/ui/monthsummary.js is the base\'s but for the extraction and the hook - right after the month is read, before any return - byte for byte',
        extracted === MONTH_SRC && extracted !== base);

    const reads = device => device.run(`JSON.stringify(monthSummaryScope(() =>
        KEYS.map(key => monthSummaryRead(key))))`);
    let compared = 0;
    const wrong = [];
    for (const flags of [OPEN, SHUT]) {
        SEEDS.forEach(seed => {
            const disk = DISKS[seed];
            const now = reopen(disk.storage, flags, disk.today, { deviceId: `d_year${seed}` });
            const old = reopen(disk.storage, flags, disk.today, { deviceId: `d_year${seed}`, month: base, year: false });
            const keys = disk.years.flatMap(MONTH_KEYS).concat(['2025-12']);
            [now, old].forEach(device => device.run(`var KEYS = ${JSON.stringify(keys)};`));
            if (reads(now) !== reads(old)) wrong.push(`seed ${seed} monthSummaryRead`);
            keys.forEach(key => {
                const ask = device => device.run(`JSON.stringify(monthSummaryFacts('${key}'))`);
                if (ask(now) !== ask(old)) wrong.push(`seed ${seed} ${key} monthSummaryFacts`);
                compared += 1;
            });
        });
    }
    given('the comparison was a corpus', compared > 200, String(compared));
    same('every month of every seeded year, under both readings: the same bytes', wrong.slice(0, 4), []);
}

// ---------------------------------------------------------------- 7. the gate
{
    suite('the gate: no cash handed back and no correction before an approval, and every other figure the same');

    const strip = facts => {
        const out = JSON.parse(JSON.stringify(facts));
        const drop = item => { delete item.repaid; delete item.reversed; };
        drop(out.line);
        out.months.forEach(drop);
        out.men.forEach(man => { delete man.handedOverReversed; });
        return out;
    };
    const ids = device => JSON.parse(device.run('JSON.stringify(yearSummaryTiles(yearSummaryFacts(2026)).map(t => t.id))'));
    const approved = handPhone(OPEN);
    const unapproved = handPhone(OPEN, { approve: false });
    const shut = handPhone(SHUT);
    given('the approved record carries 100 handed back in 2026', approved.facts(2026).line.repaid === 100);
    same('approved: «הוחזר במזומן» is a figure of the year', ids(approved).indexOf('repaid') !== -1, true);
    same('shut: not there', ids(shut).filter(id => id === 'repaid' || id === 'reversed'), []);
    same('open and nobody approved: not there either', ids(unapproved).filter(id => id === 'repaid' || id === 'reversed'), []);
    same('and every other figure of the year is the same under the three: shut, unapproved, approved',
        [strip(shut.facts(2026)), strip(unapproved.facts(2026))], [strip(approved.facts(2026)), strip(approved.facts(2026))]);
    shut.run('openYearSummary(2026)');
    const text = shut.dom.getElementById('yearSummaryBody').textContent;
    check('the screen does not say it', text.indexOf('הוחזר במזומן') === -1 && text.indexOf('תיקון-היפוך') === -1);
    same('nor is there a man\'s advance correction, shut or unapproved', [shut, unapproved].map(d => d.facts(2026).men
        .map(m => m.handedOverReversed)), [[null, null, null], [null, null, null]]);

    // A correction (תיקון-היפוך) dated in the year is a figure where the gate is open.
    const fixed = handPhone(OPEN);
    const target = Object.values(fixed.State.schedule.ledger.advances).find(entry => entry.kind === 'repaid');
    given('a repayment to correct', Boolean(target));
    const change = fixed.call('recordEventReversed', fixed.State.schedule, target.id, 100, '2026-04-02', 'נרשם בטעות',
        '2026-04-02T10:00:00.000Z', 'd_person');
    given('the correction is written by the model\'s own writer', Boolean(change) && fixed.State.commit(change) === true);
    const after = fixed.facts(2026);
    same('a correction dated in the year is said, under the ledger\'s own word', [after.line.reversed,
        JSON.parse(fixed.run('JSON.stringify(yearSummaryTiles(yearSummaryFacts(2026)).filter(t => t.id === "reversed").map(t => [t.label, t.text]))'))],
        [100, [['תיקון-היפוך', '100 ₪']]]);
    same('a correction of a REPAYMENT takes nothing back from what he was handed: no man carries it beside «מקדמות שניתנו»',
        after.men.map(m => [m.workerId, m.handedOverReversed]), [['w_a', 0], ['w_b', 0], ['w_c', 0]]);

    // «תיקון טעות» ON AN ADVANCE (fix round 1). The owner types 1,500 for אלף where he handed
    // over 150 and corrects it on the advance's own card: the ledger says he was given 150.
    // «מקדמות שניתנו» is what was RECORDED (the sheet's own «מקדמות», advancesTotal), so beside it
    // stands what the correction took back - per man, the model's own sum by the kind it
    // corrects (advanceReversalsFor, 'given'); per month the month's own «תיקון-היפוך» - and no
    // shekel is taken off anything here.
    const typo = handPhone(OPEN, { typo: true });
    const typoFacts = typo.facts(2026);
    const ledgerSays = JSON.parse(typo.run(`JSON.stringify(advanceOutstanding(State.schedule,
        advancesFor(State.schedule, 'w_a', '2026-02-01', '2026-02-28')[0].id))`));
    given('the ledger folds the advance to the 150 handed over', ledgerSays.given === 150 && ledgerSays.givenGross === 1500,
        JSON.stringify(ledgerSays));
    const alef = typoFacts.men.find(m => m.workerId === 'w_a');
    same('his year: 2,000 recorded as handed over (500 and the 1,500), and beside it the 1,350 the correction took back',
        [alef.handedOver, alef.handedOverReversed, typoFacts.men.filter(m => m.workerId !== 'w_a').map(m => m.handedOverReversed)],
        [2000, 1350, [0, 0]]);
    same('February - the month of the advance and of its correction - carries «סיכום חודש»\'s own «תיקון-היפוך»',
        [typoFacts.months[1].advances, typoFacts.months[1].reversed,
            JSON.parse(typo.run(`JSON.stringify(monthSummaryFacts('2026-02').money.reversed)`))], [1500, 1350, 1350]);
    typo.run('openYearSummary(2026)');
    const typoShown = drawn(typo);
    same('on the glass his row says both, label over value', [typoShown.men[0][2], typoShown.menLabels[0]], [
        ['3', '4', '1', '1600 ₪', '2000 ₪', '1350 ₪'],
        ['ימי נוכחות', 'ימי שכר', 'כפולים', 'נצבר', 'מקדמות שניתנו', 'מתוכן בוטלו בתיקון-היפוך']]);
    same('and February\'s row says its correction beside what it recorded', [typoShown.months[1].labels, typoShown.months[1].values],
        [['עובדים שעבדו', 'נצבר', 'מקדמות שניתנו', 'תיקון-היפוך'], ['0', '0 ₪', '1500 ₪', '1350 ₪']]);
    const typoShut = reopen(typo.dump(), SHUT, '2026-11-19', { deviceId: 'd_hand' });
    typoShut.run('openYearSummary(2026)');
    same('with the gate shut, on the same disk: no man carries a correction and the glass says none', [
        typoShut.facts(2026).men.map(m => m.handedOverReversed), drawn(typoShut).text.indexOf('תיקון-היפוך')], [[null, null, null], -1]);
}

// ---------------------------------------------------------------- 8. the workbook
function cellsOf(xml) {
    const out = {};
    (xml.match(/<c\s[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []).forEach(cellXml => {
        const open = /^<c[^>]*>/.exec(cellXml)[0];
        const v = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(cellXml);
        const t = /<is>[\s\S]*?<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/.exec(cellXml);
        out[attr(open, 'r')] = { t: attr(open, 't'), s: attr(open, 's'), v: v ? v[1] : (t ? t[1] : null) };
    });
    return out;
}
const unescapeXml = text => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, '&');
function bookOf(bytes) {
    const parts = unzip(bytes);
    const rels = {};
    tags(parts['xl/_rels/workbook.xml.rels'].toString('utf8'), 'Relationship')
        .forEach(rel => { rels[attr(rel, 'Id')] = attr(rel, 'Target'); });
    const shared = parts['xl/sharedStrings.xml'] ? (parts['xl/sharedStrings.xml'].toString('utf8')
        .match(/<si>[\s\S]*?<\/si>/g) || []).map(si => (si.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g) || [])
        .map(t => unescapeXml(t.replace(/^<t(?:\s[^>]*)?>/, '').replace(/<\/t>$/, ''))).join('')) : [];
    const styles = parts['xl/styles.xml'].toString('utf8');
    const codes = {};
    tags(styles, 'numFmt').forEach(tag => { codes[attr(tag, 'numFmtId')] = unescapeXml(attr(tag, 'formatCode')); });
    const xfs = (/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles) || ['', ''])[1];
    const formats = tags(xfs, 'xf').map(tag => (attr(tag, 'numFmtId') === '0' ? 'General' : (codes[attr(tag, 'numFmtId')] || 'builtin')));
    const names = [];
    const sheets = {};
    const views = {};
    tags(parts['xl/workbook.xml'].toString('utf8'), 'sheet').forEach(tag => {
        const name = unescapeXml(attr(tag, 'name'));
        const xml = parts['xl/' + String(rels[attr(tag, 'r:id')]).replace(/^\/?xl\//, '')].toString('utf8');
        names.push(name);
        views[name] = tags(xml, 'sheetView').map(view => attr(view, 'rightToLeft'));
        const rows = [];
        const looks = [];
        Object.entries(cellsOf(xml)).forEach(([ref, cell]) => {
            const [, col, row] = /^([A-Z]+)(\d+)$/.exec(ref);
            let c = 0;
            for (const ch of col) c = c * 26 + (ch.charCodeAt(0) - 64);
            const r = Number(row) - 1;
            while (rows.length <= r) { rows.push([]); looks.push([]); }
            while (rows[r].length < c - 1) { rows[r].push(''); looks[r].push('General'); }
            rows[r][c - 1] = cell.t === 's' ? shared[Number(cell.v)] : cell.t ? unescapeXml(cell.v || '') : Number(cell.v);
            looks[r][c - 1] = cell.s ? formats[Number(cell.s)] : 'General';
        });
        sheets[name] = { rows, looks };
    });
    return { names, sheets, views };
}

// A sentence in a cell, as the workbook sets it: right to left by a U+200F at each end (a name,
// a number, a heading and a month carry none - the cell-for-cell comparisons below hold both).
const said = text => `\u200F${text}\u200F`;

// The sheet's own sentence for a wage it cannot price, as the year writes it.
const unpricedSentence = names => `⚠️ ${names.length} עובדים בלי שכר יומי, ולכן הסכום חסר אותם: `
    + `${names.map(name => `\u2068${name}\u2069`).join(', ')}. הוסף להם שכר במסך "עובדים ואתרים".`;

// The workbook's rows written out again here from the reading and the pinned words - not
// from the file's own builder - so a cell that is not the reading's is a cell that differs.
function expectedBook(facts, today) {
    const L = facts.line;
    const money = value => (value === null ? '—' : value);
    const summary = [[`סיכום שנת ${facts.year}`],
        [said('נצבר לפי הרישום: כל יום עבודה בשנה, לפי השכר שנרשם ליום הזה. זה לא מה ששולם בפועל.')],
        [said('תקופת חשבון שעוברת את 1 בינואר מתחלקת כאן לפי הימים: כל יום נספר בשנה שבה עבדו בו.')]]
        .concat(facts.inProgress ? [[said('השנה עוד לא נגמרה. המספרים הם של מה שנרשם עד עכשיו.')]] : [])
        .concat([[`הופק: ${today.slice(8, 10)}/${today.slice(5, 7)}/${today.slice(0, 4)}`], []])
        // THE MONEY FIRST (fix round 1), and right under «נצבר» the men it leaves out, why the
        // year is smaller (only under a «נצבר» that is a number), and the hours left out.
        .concat([['נצבר', money(L.gross)]])
        .concat(L.unpriced.length ? [[said(unpricedSentence(L.unpriced))]] : [])
        .concat(facts.notSummed && L.gross !== null ? [[said('עובד שיש לו אפילו יום עבודה אחד בלי שכר יומי לא נכלל בנצבר של כל השנה, ולכן הנצבר של השנה קטן מחיבור החודשים.')]] : [])
        .concat(L.hoursUnpriced ? [[said('* שעות נוספות בלי שכר שעה - לא נכללו בסכום.')]] : [])
        .concat([['מקדמות שניתנו', L.advances]])
        .concat(L.repaid ? [['הוחזר במזומן', L.repaid]] : [])
        .concat(L.reversed ? [['תיקון-היפוך', L.reversed]] : [])
        .concat([['ימי עבודה', L.workingDays], ['ימי נוכחות', L.attendance], ['עובדים שעבדו', L.men], ['סה״כ ימי עובד־אתר', L.siteDays]])
        .concat(L.ownSiteDays !== null ? [['בלי עובדי רימא', L.ownSiteDays]] : [])
        // «עובדי יוסף גבס» is not on «סיכום»: it is the last sheet's, and only its.
        .concat([['סה״כ עובדי רימא', L.rima ? L.rima.total : 0]]);
    const NAMES = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
    const withRima = L.rima !== null;
    // «חודשים»: the count headed with what it counts; «תיקון-היפוך» beside the advances where the
    // year has one; and under the table each month whose «נצבר» leaves a man out, in «סיכום
    // חודש»'s own sentence beside the month's name.
    const reversals = L.reversed !== null && L.reversed !== 0;
    const monthHead = ['חודש', withRima ? 'ימי עובד־אתר בלי עובדי רימא' : 'ימי עובד־אתר', 'עובדים שעבדו', 'נצבר', 'מקדמות שניתנו']
        .concat(reversals ? ['תיקון-היפוך'] : []);
    const months = [monthHead]
        .concat(facts.months.map((m, i) => (m.empty ? monthHead.map((cell, at) => (at === 0 ? NAMES[i] : '—'))
            : [NAMES[i], m.ownSiteDays !== null ? m.ownSiteDays : m.siteDays, m.men, money(m.gross), m.advances]
                .concat(reversals ? [m.reversed || 0] : []))));
    const marked = facts.months.map((m, i) => [m, i]).filter(([m]) => !m.empty && m.unpriced.length > 0);
    if (marked.length > 0) months.push([], ...marked.map(([m, i]) => [NAMES[i], said(unpricedSentence(m.unpriced))]));
    // «עובדים»: the name cell the name and nothing else; a column for who is switched off where
    // somebody is, and one for what a תיקון-היפוך of an advance took back where somebody has one.
    const menReversals = facts.men.some(m => Boolean(m.handedOverReversed));
    const switchedOff = facts.men.some(m => !m.active);
    const men = [['עובד', 'ימי נוכחות', 'ימי שכר', 'כפולים', 'שעות נוספות', 'נצבר', 'מקדמות שניתנו']
        .concat(menReversals ? ['מתוכן בוטלו בתיקון-היפוך'] : [], switchedOff ? ['מצב'] : [])]
        .concat(facts.men.map(m => [m.name, m.attendanceDays, m.payUnits, m.doubleDays, m.extraHours, money(m.gross), m.handedOver]
            .concat(menReversals ? [m.handedOverReversed || 0] : [], switchedOff ? [m.active ? 'פעיל' : 'לא פעיל'] : [])))
        // No «—» without its reason: one row after the last man names every man whose cell it is.
        .concat(facts.men.some(m => m.gross === null) ? [[said(unpricedSentence(facts.men.filter(m => m.gross === null).map(m => m.name)))]] : []);
    const span = s => (s.first === s.last ? NAMES[Number(s.first.slice(5)) - 1]
        : `${NAMES[Number(s.first.slice(5)) - 1]}–${NAMES[Number(s.last.slice(5)) - 1]}`);
    const sites = [['אתר', 'סה״כ ימי עובד־אתר'].concat(withRima ? ['בלי עובדי רימא', 'עובדי רימא'] : [], ['חודשים'])]
        .concat(facts.sites.map(s => [s.name, s.billed].concat(withRima ? [s.own, s.rima] : [], [span(s)])))
        .concat(withRima ? [[], [said('עובדי רימא בלבד. אינם נכללים בשכר. בחיוב כל אחד מהם נספר כיום עובד־אתר אחד.')]] : []);
    const book = { 'סיכום': summary, 'חודשים': months, 'עובדים': men, 'אתרים': sites };
    if (facts.yosef.length > 0) {
        book['עובדי יוסף גבס'] = [['אתר', 'עובדי יוסף גבס']].concat(facts.yosef.map(p => [p.name, p.total]),
            [['סה״כ עובדי יוסף גבס', L.yosef.total], [], [said('עובדי יוסף גבס בלבד. אינם נכללים בשכר ואינם נכללים בחיוב.')]]);
    }
    return book;
}

function withLibrary(device) {
    vm.runInContext(SHEETJS_CODE, device.ctx, { filename: 'xlsx.full.min.js' });
    device.caught = [];
    device.ctx.__caught = device.caught;
    // Only the last inch is redirected: book_new, aoa_to_sheet, the direction, the sheets, the
    // looks and the name are the app's own code.
    device.run(`XLSX.writeFile = function (wb, filename) {
        __caught.push({ filename: filename, bytes: XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) });
    };`);
    return device;
}

{
    suite('the workbook: every cell the reading\'s, «עובדי יוסף גבס» last, right to left');
    given(`SheetJS is the shipped build`, SHEETJS_PRESENT, SHEETJS_REASON || 'vendor/xlsx-0.18.5.min.js');

    const MONEY = '#,##0 "₪";-#,##0 "₪"';
    const MONEY_AGORA = '#,##0.00 "₪";-#,##0.00 "₪"';
    for (const [name, make, year] of [['by hand', () => handPhone(OPEN), 2026],
        ['a seeded year across 1 January', () => reopen(DISKS[61].storage, OPEN, DISKS[61].today, { deviceId: 'd_year61' }), 2026],
        ['the year after it, in progress', () => reopen(DISKS[61].storage, OPEN, DISKS[61].today, { deviceId: 'd_year61' }), 2027],
        ['a seeded year, the gates shut', () => reopen(DISKS[62].storage, SHUT, DISKS[62].today, { deviceId: 'd_year62' }), 2026],
        ['an advance corrected by «תיקון טעות»', () => handPhone(OPEN, { typo: true }), 2026]]) {
        const device = withLibrary(make());
        device.run(`openYearSummary(${year})`);
        const facts = device.facts(year);
        // NOT awaited by a suite that wants it to fail loudly: awaited, and asked.
        await device.run('yearSummaryExport()');
        given(`${name}: one workbook was written`, device.caught.length === 1, String(device.caught.length));
        const book = bookOf(Buffer.from(device.caught[0].bytes));
        const want = expectedBook(facts, device.run('todayStr()'));
        same(`${name}: the file is called farkad-year_${year}.xlsx`, device.caught[0].filename, `farkad-year_${year}.xlsx`);
        same(`${name}: the sheets in order, «עובדי יוסף גבס» last where it has a count`, book.names, Object.keys(want));
        Object.keys(want).forEach(sheet => same(`${name}: «${sheet}», cell for cell`, book.sheets[sheet].rows, want[sheet]));
        same(`${name}: every sheet opens right to left`, Object.values(book.views).map(v => v.join()), book.names.map(() => '1'));
        same(`${name}: the frame on the first sheet, before any figure`, book.sheets['סיכום'].rows[1][0],
            said('נצבר לפי הרישום: כל יום עבודה בשנה, לפי השכר שנרשם ליום הזה. זה לא מה ששולם בפועל.'));
        // THE MARKS: every sentence of the file is set right to left by a U+200F at each end and
        // holds none inside; a cell without them never opens with ⚠️ or * nor closes on a stop -
        // so a sentence added later without its marks fails here.
        const cells = Object.values(book.sheets).flatMap(sheet => sheet.rows.flat()).filter(cell => typeof cell === 'string');
        const marked = cells.filter(cell => cell.indexOf('\u200F') !== -1);
        check(`${name}: each sentence is set right to left by its marks, and nothing else carries one`,
            marked.length >= 3 && marked.every(cell => cell[0] === '\u200F' && cell[cell.length - 1] === '\u200F'
                && cell.slice(1, -1).indexOf('\u200F') === -1)
            && cells.filter(cell => cell.indexOf('\u200F') === -1).every(cell => !/^(⚠️|\*)/.test(cell) && !/\.$/.test(cell)),
            JSON.stringify(cells.filter(cell => cell.indexOf('\u200F') === -1 && (/^(⚠️|\*)/.test(cell) || /\.$/.test(cell)))));
        // Money in the workbook's own money format; a count is a count.
        const men = book.sheets['עובדים'];
        const moneyColumns = men.rows[0].map((head, c) => (['נצבר', 'מקדמות שניתנו', 'מתוכן בוטלו בתיקון-היפוך'].indexOf(head) !== -1 ? c : -1))
            .filter(c => c !== -1);
        const moneyLooks = men.rows.slice(1, 1 + facts.men.length).flatMap((row, r) => moneyColumns.filter(c => typeof row[c] === 'number')
            .map(c => men.looks[r + 1][c] === (Number.isInteger(row[c]) ? MONEY : MONEY_AGORA)));
        check(`${name}: «נצבר» and «מקדמות שניתנו» are shekels in the file`, moneyLooks.length > 0 && moneyLooks.every(Boolean),
            JSON.stringify(men.looks.slice(1, 3)));
        check(`${name}: the counts are numbers in the General format`, men.rows.slice(1, 1 + facts.men.length).every((row, r) =>
            [1, 2, 3, 4].every(c => typeof row[c] === 'number' && men.looks[r + 1][c] === 'General')));
        if (facts.unpriced.length === 0) {
            check(`${name}: nobody unpriced, so no sentence about it anywhere in the file`, Object.values(book.sheets)
                .every(sheet => sheet.rows.flat().every(cell => String(cell).indexOf('בלי שכר יומי') === -1)));
        }
        same(`${name}: handed to the browser, in the export's own words - never «נשמר»`, [device.chosen.length,
            device.chosen[0].title, device.chosen[0].message, device.chosen[0].choices], [1, 'קובץ ה-Excel נמסר לשמירה',
            `\u2066farkad-year_${year}.xlsx\u2069 נמסר לדפדפן — פתח את "קבצים" וודא שהוא מופיע. `
            + 'ב-Excel הטבלה נפתחת מימין לשמאל; תצוגה מקדימה ("קבצים", וואטסאפ, Numbers) עשויה להציג אותה משמאל לימין, עם אותם מספרים.',
            ['הבנתי', 'שמירה חוזרת']]);
    }

    // THE MARCH MAN IN THE FILE: right under «נצבר» his sentence and the year's reason; on «עובדים»
    // his cell «—» and, after the last man, the one row naming him.
    const march = withLibrary(handPhone(OPEN));
    march.run('openYearSummary(2026)');
    await march.run('yearSummaryExport()');
    const marchBook = bookOf(Buffer.from(march.caught[0].bytes));
    const summaryRows = marchBook.sheets['סיכום'].rows;
    const grossAt = summaryRows.findIndex(row => row[0] === 'נצבר');
    same('«סיכום»: right under «נצבר», his sentence and then the year\'s reason', [summaryRows[grossAt],
        plain(summaryRows[grossAt + 1][0]), summaryRows[grossAt + 2][0], summaryRows[grossAt + 3][0]],
    [['נצבר', 1950], said('⚠️ 1 עובדים בלי שכר יומי, ולכן הסכום חסר אותם: בית. הוסף להם שכר במסך "עובדים ואתרים".'),
        said('עובד שיש לו אפילו יום עבודה אחד בלי שכר יומי לא נכלל בנצבר של כל השנה, ולכן הנצבר של השנה קטן מחיבור החודשים.'), 'מקדמות שניתנו']);
    const menRows = marchBook.sheets['עובדים'].rows;
    same('«עובדים»: his «נצבר» «—», and after the last man the one row that names him', [menRows[2][5], menRows.length,
        plain(menRows[4][0])], ['—', 5, said('⚠️ 1 עובדים בלי שכר יומי, ולכן הסכום חסר אותם: בית. הוסף להם שכר במסך "עובדים ואתרים".')]);

    // «שמירה חוזרת» writes it again; anything else (a tap beside it, Escape, «הבנתי») writes nothing more.
    const again = withLibrary(handPhone(OPEN));
    again.run('openYearSummary(2026)');
    again.answers.push('שמירה חוזרת', 'הבנתי');
    await again.run('yearSummaryExport()');
    await new Promise(done => setTimeout(done, 20));
    same('«שמירה חוזרת» writes the file once more, and «הבנתי» nothing', again.caught.map(c => c.filename),
        ['farkad-year_2026.xlsx', 'farkad-year_2026.xlsx']);

    // A FIRST EXPORT PRESSED TWICE (fix round 1). The session's first export waits for the library,
    // and nothing on the glass said so: a second press handed the browser a second file. Now the
    // button is shut and the frame's line says «מכין את הקובץ…» from the press until the file is
    // handed over, and a press meanwhile is nothing.
    const twice = withLibrary(handPhone(OPEN));
    twice.run('openYearSummary(2026)');
    const releases = [];
    twice.ctx.loadXlsx = () => new Promise(done => { releases.push(() => done(true)); });
    const firstPress = twice.run('yearSummaryExport()');
    const meanwhile = [twice.dom.getElementById('yearSummaryExport').disabled, twice.dom.getElementById('yearSummaryStatus').textContent];
    const secondPress = twice.run('yearSummaryExport()');
    const asked = releases.length;
    releases.forEach(release => release());
    await firstPress;
    await secondPress;
    await new Promise(done => setTimeout(done, 20));
    same('pressed twice while the library is on its way: the library asked once, ONE file, the button shut and the frame saying so meanwhile, the year\'s again after',
        [asked, twice.caught.length, meanwhile, twice.dom.getElementById('yearSummaryExport').disabled,
            twice.dom.getElementById('yearSummaryStatus').textContent, twice.chosen.length], [1, 1, [true, 'מכין את הקובץ…'], false, '', 1]);

    // THE LOOK NEVER COSTS THE FILE: with the look broken the same rows go, plain.
    const broken = withLibrary(handPhone(OPEN));
    broken.run('openYearSummary(2026)');
    broken.ctx.dressSheet = () => { throw new Error('the look is broken'); };
    await broken.run('yearSummaryExport()');
    const plainBook = bookOf(Buffer.from(broken.caught[0].bytes));
    const plainWant = expectedBook(broken.facts(2026), broken.run('todayStr()'));
    same('with the look broken the file is still written, every cell the same - the sentences under «נצבר» and the men\'s note row included', [broken.caught.length,
        Object.keys(plainWant).every(sheet => JSON.stringify(plainBook.sheets[sheet].rows) === JSON.stringify(plainWant[sheet]))], [1, true]);
    check('and plain: no money format on it', Object.values(plainBook.sheets).every(sheet =>
        sheet.looks.flat().every(look => look === 'General')));
    check('still right to left', Object.values(plainBook.views).every(v => v.join() === '1'));

    // An empty year has nothing to hand over.
    const empty = withLibrary(handPhone(OPEN));
    empty.run('openYearSummary(2025)');
    await empty.run('yearSummaryExport()');
    same('an empty year writes no file, and its button is not pressable', [empty.caught.length,
        empty.dom.getElementById('yearSummaryExport').disabled], [0, true]);

    suite('the library missing: the same rows as CSV files, and the export\'s own sentence');
    const csv = handPhone(OPEN);
    csv.run('openYearSummary(2026)');
    csv.ctx.loadXlsx = () => Promise.resolve(false);
    given('the library is not on this device', csv.run('typeof XLSX') === 'undefined');
    await csv.run('yearSummaryExport()');
    same('one file a sheet, named in Latin to the end', csv.downloads.map(d => d.name), ['farkad-year-summary_2026.csv',
        'farkad-year-months_2026.csv', 'farkad-year-workers_2026.csv', 'farkad-year-sites_2026.csv', 'farkad-year-yosef-geves_2026.csv']);
    const csvWant = expectedBook(csv.facts(2026), csv.run('todayStr()'));
    const firstLine = text => text.replace(/^\uFEFF/, '').split('\r\n')[0];
    same('each the sheet\'s rows: the months\' file opens on its header', firstLine(csv.downloads[1].text),
        csvWant['חודשים'][0].map(cell => `"${cell}"`).join(','));
    same('and says what the export says in that case', csv.told, ['חלק מהאפליקציה חסר במכשיר, ולכן הקבצים יוצאו כ-CSV במקום Excel. '
        + 'המספרים זהים. רענן את הדף כדי להשלים את ההתקנה.']);

    const refused = handPhone(OPEN);
    refused.run('openYearSummary(2026)');
    refused.ctx.loadXlsx = () => Promise.resolve(false);
    refused.ctx.downloadCsv = (rows, name) => name.indexOf('months') === -1;
    await refused.run('yearSummaryExport()');
    same('a file the browser would not take is said, and what it did take', refused.told.map(t => [t.title, plain(t.message)]), [[
        'ההורדה נחסמה', 'הדפדפן לא קיבל את farkad-year-months_2026.csv. כן התקבלו: farkad-year-summary_2026.csv, '
        + 'farkad-year-workers_2026.csv, farkad-year-sites_2026.csv, farkad-year-yosef-geves_2026.csv. הרישום במכשיר לא השתנה. '
        + 'נסה שוב; אם זה חוזר, ההורדות חסומות במכשיר הזה - בדוק את הגדרות ההורדה בדפדפן.']]);
}

// ---------------------------------------------------------------- 9. it writes nothing
{
    suite('a reading: not one key on the disk moves');

    const device = withLibrary(handPhone(OPEN));
    const disk = () => JSON.stringify(device.dump());
    const before = disk();
    const record = JSON.stringify(device.State.schedule);
    const renders = device.renders.count;

    device.facts(2026);
    device.run('openYearSummary(2026)');
    const modal = device.dom.getElementById('yearSummaryModal');
    same('it opens on the year asked for, worded from the file\'s blocks', [modal.style.display, device.run('YEAR_SUMMARY_YEAR'),
        ...['yearSummaryTitle', 'yearSummaryYear', 'yearSummaryPrev', 'yearSummaryNext', 'yearSummaryExport', 'yearSummaryClose']
            .map(id => device.dom.getElementById(id).textContent)],
    ['flex', 2026, 'סיכום שנת 2026', '2026', 'שנה קודמת', 'שנה הבאה', '📊 יצוא השנה', 'סגור']);
    same('on the year today is in there is no next year, and the export can be pressed',
        [device.dom.getElementById('yearSummaryNext').hidden, device.dom.getElementById('yearSummaryExport').disabled], [true, false]);
    device.run('yearSummaryStep(1)');
    same('a step forward from the year today is in goes nowhere', device.run('YEAR_SUMMARY_YEAR'), 2026);
    device.run('yearSummaryStep(-1)');
    const body = device.dom.getElementById('yearSummaryBody');
    same('one back is 2025, which has no record and says only that', [device.run('YEAR_SUMMARY_YEAR'),
        device.dom.getElementById('yearSummaryTitle').textContent, body.querySelectorAll('.empty-hint').map(n => n.textContent),
        body.querySelectorAll('.msum-tile').length, device.dom.getElementById('yearSummaryNext').hidden,
        device.dom.getElementById('yearSummaryExport').disabled],
    [2025, 'סיכום שנת 2025', ['אין רישומים בשנה הזאת.'], 0, false, true]);
    device.run('yearSummaryStep(1); renderYearSummaryIfOpen()');
    same('and forward again is 2026', device.run('YEAR_SUMMARY_YEAR'), 2026);

    // A month's row opens «סיכום חודש» on that month; its door opens the year again.
    device.run('yearSummaryGoMonth("2026-03")');
    same('a month\'s row: the year shuts and «סיכום חודש» opens on that month', [modal.style.display, device.run('YEAR_SUMMARY_YEAR'),
        device.dom.getElementById('monthSummaryModal').style.display, device.run('MONTH_SUMMARY_KEY')],
    ['none', null, 'flex', '2026-03']);
    same('and where he was in the year is kept for the way back through the month\'s door',
        JSON.parse(device.run('typeof YEAR_SUMMARY_BACK === "undefined" ? "\\"no such memory\\"" : JSON.stringify(YEAR_SUMMARY_BACK)')),
        { year: 2026, top: 0, month: '2026-03' });
    same('and its door is worded for the month\'s year', [device.dom.getElementById('monthSummaryYear').textContent,
        device.dom.getElementById('monthSummaryYear').hidden], ['סיכום שנת 2026', false]);
    device.run('monthSummaryStep(-3)');
    same('three months back is December of the year before, and the door says that year',
        [device.run('MONTH_SUMMARY_KEY'), device.dom.getElementById('monthSummaryYear').textContent], ['2025-12', 'סיכום שנת 2025']);
    device.run('monthSummaryStep(1)');
    same('and January again says 2026, on an empty month as well', [device.run('MONTH_SUMMARY_KEY'),
        device.dom.getElementById('monthSummaryYear').textContent], ['2026-01', 'סיכום שנת 2026']);
    device.run('openYearSummaryFromMonth()');
    same('the door: the month shuts and the year of its month opens', [device.dom.getElementById('monthSummaryModal').style.display,
        device.run('MONTH_SUMMARY_KEY'), modal.style.display, device.run('YEAR_SUMMARY_YEAR')], ['none', null, 'flex', 2026]);
    same('and the place kept for it is given and spent', JSON.parse(device.run(
        'typeof YEAR_SUMMARY_BACK === "undefined" ? "\\"no such memory\\"" : JSON.stringify([YEAR_SUMMARY_BACK, YEAR_SUMMARY_PLACE])')),
    [null, null]);
    await device.run('yearSummaryExport()');
    given('the export ran', device.caught.length === 1);
    device.run('closeYearSummary()');
    same('closed: hidden, it forgets which year it was, and its nodes go with it',
        [modal.style.display, device.run('YEAR_SUMMARY_YEAR'), body.children.length], ['none', null, 0]);
    device.run('yearSummaryStep(-1); renderYearSummaryIfOpen(); openYearSummaryFromMonth()');
    same('and nothing it has answers while it is shut', [device.run('YEAR_SUMMARY_YEAR'), modal.style.display], [null, 'none']);

    same('every key on the disk is byte for byte what it was', disk(), before);
    same('and the record in memory', JSON.stringify(device.State.schedule), record);
    same('and nothing was drawn by render() for it', device.renders.count, renders);

    // A REAL WRITE: the disk notices, and the open year reads the record again - once the draws
    // have stopped (a clock in the suite's hands).
    const clock = fakeClock(device);
    device.run('openYearSummary(2026)');
    const attendance = () => {
        const tile = device.dom.getElementById('yearSummaryBody').querySelectorAll('.msum-tile')
            .filter(t => t.getAttribute('data-figure') === 'attendance')[0];
        return tile ? tile.children[1].textContent : 'no figure on the glass';
    };
    given('the year reads seven days', attendance() === '7', attendance());
    device.State.commit(device.call('assignPlace', device.State.schedule, '2026-11-02', 'w_a', 'actual', 'p_1'));
    check('the comparison notices a real write', disk() !== before);
    device.run('renderYearSummaryIfOpen()');
    // MARKED, NOT TAKEN OFF (fix round 1): the figures stay where they are - the page does not
    // shrink under the reader and throw him to its top - and none of them stands as current.
    const status = () => device.dom.getElementById('yearSummaryStatus').textContent;
    const exportShut = () => device.dom.getElementById('yearSummaryExport').disabled;
    same('the figures are marked at once - kept where they are, dimmed and busy, the export shut, «מחשב את השנה…» in the frame\'s line', [
        attendance(), body.classList.contains('ysum-stale'), body.getAttribute('aria-busy'), exportShut(), status(),
        body.querySelectorAll('.ysum-reading').length], ['7', true, 'true', true, 'מחשב את השנה…', 0]);
    clock.advance(1500);
    same('and once the draws have stopped the open year says what the record says now, and is current again', [attendance(),
        body.classList.contains('ysum-stale'), body.getAttribute('aria-busy'), exportShut(), status()], ['8', false, 'false', false, '']);
    let read = 0;
    const real = device.ctx.yearSummaryFacts;
    device.ctx.yearSummaryFacts = function () { read += 1; return real.apply(this, arguments); };
    device.run('renderYearSummaryIfOpen(); renderYearSummaryIfOpen(); closeYearSummary(); openYearSummary(2026)');
    device.ctx.yearSummaryFacts = real;
    same('a record that did not move is not read again - not by a redraw, not by opening it again', read, 0);

    const src = YEAR_SRC.replace(/\/\/[^\n]*/g, '');
    check('the file names no writer: no Store, no commit, no save, no localStorage',
        !/\bStore\b|\.commit|commitMany|\.save\(|localStorage|setVerified|saveFinancialAction/.test(src));
    // A row's amount is only ever asked whether it is known (the not-summed rule, revision 2):
    // never added, multiplied or compared to a number.
    check('and prices nothing: no rate is read in it, and a row\'s amount is only asked whether it is known',
        !/dailyRate|hourlyRate|ratesForDay/.test(src) && !/\.amount\b(?!\s*[!=]==\s*null)/.test(src)
        && /\.amount\s*!==\s*null/.test(src));
    // SUMMARY_TEXT.rimaCount is the workbook overview's WORD for Rima's men (js/ui/reports.js),
    // borrowed for the sites' column since fix round 1 - not a layer.
    check('nor does it name a layer - only the reports of them', !/schedule\.days|(?<!SUMMARY_TEXT\.)rimaCount|yosefGevesCount|_LAYER/.test(src));
    check('it never prints by itself and never asks the browser a question', !/window\.print|\balert\(|\bconfirm\(|\bprompt\(/.test(src));
    check('and no word of a payslip is in it', !/לתשלום|נשמר|נשלח|נוכה|ניכוי|יתרת/.test(src));
}

// ---------------------------------------------------------------- 9b. a redraw never reads
{
    suite('a redraw never reads the year: shut it asks nothing, moved it waits for the draws to stop');

    const device = handPhone(OPEN);
    const clock = fakeClock(device);
    const counted = { read: 0, range: 0, keys: 0 };
    const spy = (name, field) => {
        const real = device.ctx[name];
        device.ctx[name] = function () { counted[field] += 1; return real.apply(this, arguments); };
    };
    spy('yearSummaryRead', 'read');
    spy('monthSummaryReadRange', 'range');
    spy('owesKey', 'keys');
    for (let n = 0; n < 20; n += 1) device.run('renderYearSummaryIfOpen()');
    same('shut: twenty draws, and not one reading, not one month read, not even the record\'s key', counted, { read: 0, range: 0, keys: 0 });
    // What a draw does to the glass, counted: a mark that the year is being read again, and the
    // placeholder of a first reading.
    counted.stale = 0;
    counted.paint = 0;
    spy('yearSummaryMarkStale', 'stale');
    spy('yearSummaryPaintReading', 'paint');

    device.run('openYearSummary(2026)');
    given('opened, it read the year once', counted.read === 1, JSON.stringify(counted));
    const body = device.dom.getElementById('yearSummaryBody');
    const tiles = () => body.querySelectorAll('.msum-tile').length;
    const stale = () => body.classList.contains('ysum-stale');
    const days = () => {
        const tile = body.querySelectorAll('.msum-tile').filter(t => t.getAttribute('data-figure') === 'attendance')[0];
        return tile ? tile.children[1].textContent : 'no figure on the glass';
    };
    given('seven days on it', days() === '7');
    // AN UNMOVED RECORD DRAWS NOTHING NEW (fix round 1: no check failed when that guard went).
    // Asked right after the draws, before any clock moves: no mark, no placeholder, no wait owed.
    counted.read = 0;
    counted.range = 0;
    counted.paint = 0;
    for (let n = 0; n < 20; n += 1) device.run('renderYearSummaryIfOpen()');
    same('twenty draws of a record that did not move: nothing read, nothing marked, nothing painted, no reading owed', [counted.read,
        counted.range, counted.stale, counted.paint, stale(), tiles(), device.run('YEAR_SUMMARY_WAIT === null')], [0, 0, 0, 0, false, 9, true]);
    counted.read = 0;
    counted.range = 0;
    const inside = [];
    // Three commits 500 ms apart - Saturdays nobody worked - each followed by the draw render() makes.
    ['2026-11-14', '2026-11-07', '2026-10-31'].forEach((date, at) => {
        if (at > 0) clock.advance(500);
        device.State.commit(device.call('assignPlace', device.State.schedule, date, 'w_a', 'actual', 'p_1'));
        device.run('renderYearSummaryIfOpen()');
        inside.push([counted.read, counted.range, stale(), days()]);
    });
    same('not one reading inside the three draws; the figures marked from the first and kept where they were', inside,
        [[0, 0, true, '7'], [0, 0, true, '7'], [0, 0, true, '7']]);
    same('marked once, painted over never', [counted.stale, counted.paint], [1, 0]);
    clock.advance(1499);
    same('1.499 s after the last draw: still nothing read, still marked', [counted.read, stale(), days()], [0, true, '7']);
    clock.advance(1);
    same('1.5 s after it: read ONCE, the three days on it, current again', [counted.read, stale(), days()], [1, false, '10']);
    clock.advance(10000);
    for (let n = 0; n < 20; n += 1) device.run('renderYearSummaryIfOpen()');
    same('and a record that did not move again: twenty more draws, right after them nothing read, marked or owed',
        [counted.read, counted.stale, stale(), tiles() > 0, device.run('YEAR_SUMMARY_WAIT === null')], [1, 1, false, true, true]);
    clock.advance(10000);
    same('nor anything later', [counted.read, counted.stale, stale()], [1, 1, false]);

    // An arrow or the dialog shut meanwhile: the reading owed to the moved record is not owed.
    device.State.commit(device.call('assignPlace', device.State.schedule, '2026-10-24', 'w_a', 'actual', 'p_1'));
    device.run('renderYearSummaryIfOpen(); closeYearSummary()');
    clock.advance(5000);
    same('shut while it waited: nothing read for a dialog that is not there', counted.read, 1);
}

// ---------------------------------------------------------------- 10. the words
{
    suite('the words: each new one pinned, each borrowed one found where its owner keeps it');

    const device = handPhone(SHUT);
    const T = JSON.parse(device.run(`JSON.stringify(Object.assign({}, YEAR_SUMMARY_TEXT, {
        title: YEAR_SUMMARY_TEXT.title(2026), entry: YEAR_SUMMARY_TEXT.entry(2027),
        span: [YEAR_SUMMARY_TEXT.span('ינואר', 'מרץ'), YEAR_SUMMARY_TEXT.span('מרץ', 'מרץ')] }))`));
    same('every new string, word for word (PROPOSED)', T, {
        title: 'סיכום שנת 2026',
        entry: 'סיכום שנת 2027',
        prev: 'שנה קודמת',
        next: 'שנה הבאה',
        reading: 'מחשב את השנה…',
        empty: 'אין רישומים בשנה הזאת.',
        worked: 'נצבר לפי הרישום: כל יום עבודה בשנה, לפי השכר שנרשם ליום הזה. זה לא מה ששולם בפועל.',
        // MOVED ON PURPOSE (fix round 1): «תקופת החשבון» is the app's word for a pay period.
        split: 'תקופת חשבון שעוברת את 1 בינואר מתחלקת כאן לפי הימים: כל יום נספר בשנה שבה עבדו בו.',
        inProgress: 'השנה עוד לא נגמרה. המספרים הם של מה שנרשם עד עכשיו.',
        figures: 'השנה במספרים',
        handedOver: 'מקדמות שניתנו',
        handedOverReversed: 'מתוכן בוטלו בתיקון-היפוך',
        // MOVED ON PURPOSE (fix round 1): «אין לו ... אפילו ביום אחד» read as a man who never had a rate.
        notSummed: 'עובד שיש לו אפילו יום עבודה אחד בלי שכר יומי לא נכלל בנצבר של כל השנה, ולכן הנצבר של השנה קטן מחיבור החודשים.',
        months: 'חודש אחר חודש',
        monthsHint: 'לחיצה על חודש פותחת את סיכום החודש.',
        ownDays: 'ימי עובד־אתר בלי עובדי רימא',
        men: 'העובדים בשנה',
        sites: 'האתרים בשנה',
        span: ['ינואר–מרץ', 'מרץ'],
        export: '📊 יצוא השנה',
        exporting: 'מכין את הקובץ…',
        monthsSheet: 'חודשים',
        menSheet: 'עובדים',
        sitesSheet: 'אתרים',
        monthColumn: 'חודש',
        stateColumn: 'מצב'
    });
    check('the block is frozen', device.run('Object.isFrozen(YEAR_SUMMARY_TEXT) && Object.isFrozen(YEAR_SUMMARY_REUSED)'));

    const R = JSON.parse(device.run('JSON.stringify(YEAR_SUMMARY_REUSED)'));
    const owners = { inactive: 'js/ui/day.js', active: 'js/ui/roster.js', monthInProgress: 'js/ui/monthsummary.js' };
    const missing = Object.keys(R).filter(name => source(owners[name] || 'js/ui/reports.js').indexOf(R[name]) === -1);
    same('every borrowed word is in its owner\'s source', missing, []);
    same('the borrowed words, word for word', R, {
        payUnits: 'ימי שכר', worker: 'עובד', inactive: 'לא פעיל', active: 'פעיל', monthInProgress: 'החודש עוד לא נגמר.',
        handedTitle: 'קובץ ה-Excel נמסר לשמירה',
        handed: ' נמסר לדפדפן — ', files: 'פתח את "קבצים" וודא שהוא מופיע. ',
        direction: 'ב-Excel הטבלה נפתחת מימין לשמאל; תצוגה מקדימה ("קבצים", וואטסאפ, Numbers) ',
        directionEnd: 'עשויה להציג אותה משמאל לימין, עם אותם מספרים.',
        csv: 'חלק מהאפליקציה חסר במכשיר, ולכן הקבצים יוצאו כ-CSV במקום Excel. ',
        csvEnd: 'המספרים זהים. רענן את הדף כדי להשלים את ההתקנה.', refusedTitle: 'ההורדה נחסמה',
        refused: 'הדפדפן לא קיבל את ', refusedTook: 'כן התקבלו: ', refusedRecord: 'הרישום במכשיר לא השתנה. ',
        refusedAgain: 'נסה שוב; אם זה חוזר, ההורדות חסומות במכשיר הזה - בדוק את הגדרות ההורדה ', refusedWhere: 'בדפדפן',
        failedTitle: 'היצוא נכשל', failed: 'קובץ ה-Excel לא נוצר. לא שינינו כלום. ' });
    same('and the ones read straight from their owners are theirs', JSON.parse(device.run(`JSON.stringify([
        MONTH_SUMMARY_TEXT.workingDays, MONTH_SUMMARY_TEXT.men, MONTH_SUMMARY_REUSED.attendance, MONTH_SUMMARY_REUSED.siteDaysTotal,
        MONTH_SUMMARY_REUSED.gross, MONTH_SUMMARY_REUSED.doubles, MONTH_SUMMARY_REUSED.extraHours, MONTH_SUMMARY_REUSED.close,
        SUMMARY_TEXT.siteDays, SUMMARY_TEXT.site, SUMMARY_TEXT.made, SUMMARY_TEXT.rimaCount, SUMMARY_SHEET, NO_RIMA_TITLE, RIMA_TOTAL,
        YOSEF_GEVES_TITLE, YOSEF_GEVES_TOTAL, YOSEF_GEVES_SHEET, LEDGER_KIND_LABELS.repaid, LEDGER_KIND_LABELS.reversed,
        EXPORT_CHOICE_DONE, EXPORT_CHOICE_AGAIN])`)), ['ימי עבודה', 'עובדים שעבדו', 'ימי נוכחות', 'סה״כ ימי עובד־אתר', 'נצבר',
        'כפולים', 'שעות נוספות', 'סגור', 'ימי עובד־אתר', 'אתר', 'הופק', 'עובדי רימא', 'סיכום', 'בלי עובדי רימא',
        'סה״כ עובדי רימא', 'עובדי יוסף גבס', 'סה״כ עובדי יוסף גבס', 'עובדי יוסף גבס', 'הוחזר במזומן', 'תיקון-היפוך',
        'הבנתי', 'שמירה חוזרת']);
    check('the refusal is the export\'s own notice, cut before the clause that points at a picture this dialog has not got',
        device.run(`downloadRefusedNotice(['x'], []).message`).indexOf(R.refusedRecord + R.refusedAgain + R.refusedWhere + ', ') !== -1);
    check('and the hand-over is the export\'s own sentence, less the one that points there',
        source('js/ui/reports.js').indexOf('טבלה שנקראת נכון בכל מקום יוצאת מהכפתור «🖼️ שיתוף כתמונה».') !== -1
        && YEAR_SRC.indexOf('שיתוף כתמונה».') === -1);
    const hebrewOutsideBlocks = YEAR_SRC.slice(YEAR_SRC.indexOf('let YEAR_SUMMARY_YEAR')).replace(/\/\/[^\n]*/g, '')
        .match(/'[^'\n]*[א-ת][^'\n]*'|`[^`\n]*[א-ת][^`\n]*`/g);
    same('no Hebrew string is written anywhere but in the two blocks', hebrewOutsideBlocks, null);
    check('and not one Arabic letter', !/[؀-ۿݐ-ݿ]/.test(YEAR_SRC));

    // THE FRAME, the door and the registrations.
    const index = source('index.html');
    // MOVED ON PURPOSE (fix round 1): on the month's first screen, straight under its arrows -
    // after the whole month it stood two to five screens down.
    check('the door is in «סיכום חודש»\'s frame, straight under its arrows and before its body, hidden until worded',
        index.indexOf('<div class="msum-year"><button type="button" class="btn-secondary" id="monthSummaryYear" '
            + 'onclick="typeof openYearSummaryFromMonth === \'function\' && openYearSummaryFromMonth()" hidden></button></div>') !== -1
        && index.indexOf('id="monthSummaryNext"') < index.indexOf('id="monthSummaryYear"')
        && index.indexOf('id="monthSummaryYear"') < index.indexOf('id="monthSummaryBody"')
        && /<\/div>\s*<!--[\s\S]*?-->\s*<div class="msum-year">[\s\S]*?<\/div>\s*<div id="monthSummaryBody"><\/div>/.test(index));
    check('the year\'s frame comes straight after the month\'s', index.indexOf('<div class="modal" id="yearSummaryModal">')
        > index.indexOf('<div class="modal" id="monthSummaryModal">')
        && index.indexOf('<div class="modal" id="yearSummaryModal">') < index.indexOf('<div class="modal" id="siteCardModal">'));
    check('its heading is the first thing in it, and focusable by hand',
        /<div class="modal" id="yearSummaryModal">\s*<div class="modal-content modal-wide">\s*<h3 id="yearSummaryTitle" tabindex="-1"><\/h3>/.test(index));
    check('every id the file writes into is in the frame', IDS.filter(id => id.startsWith('yearSummary'))
        .every(id => index.indexOf(`id="${id}"`) !== -1));
    check('the script straight after monthsummary.js, as a classic script',
        /<script src="js\/ui\/monthsummary\.js"><\/script>\s*<!--[\s\S]*?-->\s*<script src="js\/ui\/yearsummary\.js"><\/script>/.test(index));
    check('in the service worker\'s shell straight after the month', source('sw.js')
        .indexOf("    './js/ui/monthsummary.js',\n    './js/ui/yearsummary.js',\n") !== -1);
    check('Escape closes it through its own function', source('js/ui/modal.js').indexOf('yearSummaryModal: () => closeYearSummary()') !== -1);
    check('render() reads it again when it is open, after the month', /renderMonthSummaryIfOpen\(\);\n[\s\S]{0,200}if \(typeof renderYearSummaryIfOpen === 'function'\) renderYearSummaryIfOpen\(\);/
        .test(source('js/app.js')));

    // Without the file the door is hidden and the month is the month.
    const bare = handPhone(SHUT, { year: false });
    bare.run('openMonthSummary("2026-06")');
    same('a build without the file leaves the door hidden and unworded', [bare.dom.getElementById('monthSummaryYear').hidden,
        bare.dom.getElementById('monthSummaryYear').textContent], [true, '']);
}

// ---------------------------------------------------------------- 11. the cost
{
    suite('the cost: a season year under the budget, the gate asked at most once and never planned on an approved record');

    // A season: 40 men (16 weekly), 6 sites, 1/1 to 19/11 without Saturdays, about 85% of
    // them on a site, doubles, extra hours, second sites, Rima on two sites, יוסף גבס on one,
    // an advance every two to four weeks per man. The approval is the record's own entry - its
    // plan is the gate's cost and not the year's, and the approval reads nothing but its id.
    const rand = mulberry(20261119);
    const pick = list => list[Math.floor(rand() * list.length)];
    const first = makeDevice({ deviceId: 'd_season', flags: OPEN });
    first.setToday('2026-11-19');
    const schedule = first.State.schedule;
    schedule.places = [1, 2, 3, 4, 5, 6].map(n => ({ id: `p_${n}`, name: `אתר ${n}`, active: true }));
    schedule.workers = [];
    const days = datesBetween('2026-01-01', '2026-11-19').filter(date => !saturday(date));
    for (let n = 1; n <= 40; n += 1) {
        const id = `w_${String(n).padStart(2, '0')}`;
        schedule.workers.push(Object.assign({ id, name: `עובד ${n}`, active: true, dailyRate: pick([380, 420, 450, 500, 550, 610]),
            hourlyRate: pick([0, 0, 45, 50]) }, n <= 16 ? { payCycles: '2026-01-02=weekly' } : {}));
        const home = `p_${1 + (n % 6)}`;
        days.forEach(date => {
            if (rand() > 0.85) return;
            const r = rand();
            if (r < 0.03) first.call('assignPlace', schedule, date, id, 'actual', home, 'double');
            else if (r < 0.08) first.call('assignPlace', schedule, date, id, 'actual', home, 'extra', 1 + Math.floor(rand() * 3));
            else first.call('assignPlace', schedule, date, id, 'actual', home);
            if (rand() < 0.05) first.call('assignPlace', schedule, date, id, 'actual', `p_${1 + ((n + 3) % 6)}`);
        });
        for (let date = addDays('2026-01-01', Math.floor(rand() * 20)); date <= '2026-11-19'; date = addDays(date, 14 + Math.floor(rand() * 14))) {
            first.call('addAdvance', schedule, id, date, pick([200, 300, 500, 800, 1000, 1500]), '');
        }
    }
    days.forEach(date => {
        if (rand() < 0.4) first.call('setRimaCount', schedule, date, 'p_1', 1 + Math.floor(rand() * 4));
        if (rand() < 0.3) first.call('setRimaCount', schedule, date, 'p_3', 1 + Math.floor(rand() * 3));
        if (rand() < 0.3) first.call('setYosefGevesCount', schedule, date, 'p_2', 1 + Math.floor(rand() * 5));
    });
    first.call('recordCarryApproval', schedule, { id: first.call('carryMigrationId'), rows: [] }, '2026-01-01T09:00:00.000Z', 'd_person');
    first.State.save({ silent: true });
    const device = reopen(first.dump(), OPEN, '2026-11-19', { deviceId: 'd_season' });
    given('a season: 40 men, 6 sites, a day key for every day but Saturday', device.State.schedule.workers.length === 40
        && Object.keys(device.State.schedule.days).length === days.length, String(Object.keys(device.State.schedule.days).length));

    const counted = { gate: 0, plan: 0 };
    const gate = device.ctx.carryReportingEnabled;
    const plan = device.ctx.planCarryMigration;
    device.ctx.carryReportingEnabled = function () { counted.gate += 1; return gate.apply(this, arguments); };
    device.ctx.planCarryMigration = function () { counted.plan += 1; return plan.apply(this, arguments); };
    const times = [];
    let facts = null;
    for (let n = 0; n < 3; n += 1) {
        const began = performance.now();
        facts = JSON.parse(device.run('JSON.stringify(yearSummaryFacts(2026))'));
        times.push(performance.now() - began);
    }
    device.ctx.carryReportingEnabled = gate;
    device.ctx.planCarryMigration = plan;
    const median = times.slice().sort((a, b) => a - b)[1];
    console.log(`  the season year read in ${times.map(t => t.toFixed(0)).join(', ')} ms (median ${median.toFixed(0)}; budget 500)`);
    given('it read the season', facts.men.length === 40 && facts.line.attendance > 7000, String(facts.line.attendance));
    check('yearSummaryFacts on a season year: the median of three under 500 ms', median <= 500, `${median.toFixed(0)} ms`);
    same('on an approved record the gate is answered without asking it, and the migration is never planned', counted, { gate: 0, plan: 0 });

    // A record nobody approved: the gate's real question, once a reading - and not on shut gates.
    const unapproved = handPhone(OPEN, { approve: false });
    given('it is a record whose migration is needed and unapproved', unapproved.call('planCarryMigration',
        unapproved.State.schedule).needed === true && unapproved.call('carryReportingEnabled', unapproved.State.schedule) === false);
    const shut = handPhone(SHUT);
    const asked = device => {
        const real = device.ctx.carryReportingEnabled;
        const realPlan = device.ctx.planCarryMigration;
        const out = { gate: 0, plan: 0 };
        device.ctx.carryReportingEnabled = function () { out.gate += 1; return real.apply(this, arguments); };
        device.ctx.planCarryMigration = function () { out.plan += 1; return realPlan.apply(this, arguments); };
        device.run('REPORT_GATE_KEPT = null; yearSummaryFacts(2026); yearSummaryFacts(2025)');
        device.ctx.carryReportingEnabled = real;
        device.ctx.planCarryMigration = realPlan;
        return out;
    };
    same('unapproved: the real question once for two readings of one record (kept under the record), one plan', asked(unapproved), { gate: 1, plan: 1 });
    same('the gates shut: not asked at all', asked(shut), { gate: 0, plan: 0 });

    // «סיכום חודש» costs what it cost: the extraction adds one call, and its suite is the proof
    // (tests/monthsummary.test.mjs); the reading of a month asks the sheet once per range.
    const sheets = [];
    const sheet = device.ctx.payrollReport;
    device.ctx.payrollReport = function (s, from, to) { sheets.push(`${from}..${to}`); return sheet.apply(this, arguments); };
    device.run('yearSummaryFacts(2026)');
    device.ctx.payrollReport = sheet;
    same('the year asks the sheet once per range it reads: twelve months and the year', [sheets.length, new Set(sheets).size], [13, 13]);
}

report();
