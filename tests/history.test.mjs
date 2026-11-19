// «מי עבד איפה» - who worked where, on any day of the record - on devices.
//
//   node tests/history.test.mjs
//
// The dialog (js/ui/history.js) is one more surface counting days that the pay sheet, the
// invoice and the site card already count, and it lists days a man may be handed in a
// dispute. So what this suite holds is not that it is right. It is that it CANNOT BE
// DIFFERENT from what it reads:
//
//   1. THE RANGE. Every key on the calendar's edges - the 1st of a month, 1 January, the
//      last day of a year, a leap day - and «תאריכים אחרים» refused when it is not a range;
//      nothing after today is ever read.
//   2. THE ROWS, on three seeded records, against the live branch of workerDaysReport (one
//      man), against the day screen's own reading of a site's row (a man at a site) and
//      against the invoice's workerIds (everyone at a site).
//   3. THE COUNTS, by what is chosen, against the pay sheet's sums and the invoice; against
//      the site card month by month, the current month differing by exactly tomorrow's
//      seder; and the critic's day - extra hours at one site, a double at another - both
//      ways.
//   4. THE EXCEPTION: a closed period corrected after its close reads live here and frozen
//      on the pay sheet, by exactly the correction; an old closure with no `periodTo`, in
//      its real shape (agrees) and in a hand-made one with a basis and days (frozen for any
//      range starting on its day, live here).
//   5. THE SITE'S BLOCK: billed = own + Rima, each from its own report, in the site card's
//      order; «עובדי יוסף גבס» apart and in no other number, and never in the text; none of
//      it on one man's reading.
//   6. THE KINDS, every word from its owner.
//   7. NOTHING AFTER TODAY, on every range.
//   8. THE NAMES: an unlisted site numbered as the day screen numbers it, whatever the
//      range; archived men and sites; a man or a site that leaves the record under it.
//   9. THE TEXT, line for line on a fixture of each view, and the cap on a season.
//  10. THE CHUNKS: 200 at a time, never more than 600.
//  11. THE FINDER'S DOOR, with this file and without it.
//  12. IT WRITES NOTHING - and with «בניית סידור» open a day's door asks, and moves only the
//      journey's own key, by the journey's own function, on a yes.
//  13. THE WORDS: every new one pinned, every borrowed one found where its owner keeps it.
//  14. NO MONEY: no money function, gate or ledger reader is asked anything.
//  15. THE COSTS: the reading on a season, the text built only while its fold is open, a
//      render that touches nothing when the record did not move.
//  16. THE SHELL.

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { makeDevice } from './harness.mjs';
import { makeDom } from './moneydom.mjs';
import { suite, check, same, given, report } from './runner.mjs';

process.env.TZ = 'Asia/Jerusalem';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = file => readFileSync(join(ROOT, file), 'utf8');
const HISTORY_JS = source('js/ui/history.js');

// A Tuesday in a month that is not over; the seeded records start on 1 December 2025.
const TODAY = '2026-11-10';
const TOMORROW = '2026-11-11';
const FIRST_DAY = '2025-12-01';
const CRITIC_DAY = '2026-10-14';
const SATURDAY = '2026-10-17';
const SEEDS = [11, 22, 33];

// The marks the app pins direction with, taken off so a line can be read and compared.
const plain = text => String(text).replace(/[⁦-⁩‎]/g, '');
const I = name => `⁨${name}⁩`;
const L = text => `⁦${text}⁩`;
const PLUS = hours => `‎+${hours}`;

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
const lastOf = key => {
    const [y, m] = key.split('-').map(Number);
    return `${key}-${String(new Date(y, m, 0, 12).getDate()).padStart(2, '0')}`;
};
const weekdayOf = date => new Date(`${date}T12:00:00`).getDay();
const median = list => list.slice().sort((a, b) => a - b)[Math.floor(list.length / 2)];

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

// ---------------------------------------------------------------- the phone

const HISTORY_IDS = ['historyModal', 'historyTitle', 'historyClose', 'historyScroll', 'historyMan', 'historySite',
    'historyRange', 'historyDates', 'historyFrom', 'historyTo', 'historyRangeNow', 'historyTotals', 'historyFoldLabel',
    'historyFoldBody', 'historyText', 'historySend', 'historyCopy', 'historyStatus', 'historyList',
    'historyManLabel', 'historySiteLabel', 'historyRangeLabel', 'historyFromLabel', 'historyToLabel'];
const OTHER_IDS = ['reportsView', 'advancesView', 'workerDaysTitle', 'workerDaysMeta', 'workerDaysBody',
    'workerDaysModal', 'workerCardModal', 'workerCardTitle', 'workerCardBody', 'workerCardReport', 'workerCardAdvances',
    'siteCardModal', 'siteCardTitle', 'siteCardWho', 'siteCardPrev', 'siteCardMonth', 'siteCardNext', 'siteCardHome',
    'siteCardBody', 'siteCardClientOpen', 'siteCardClient', 'siteCardText', 'siteCardSend', 'siteCardCopy',
    'siteCardStatus', 'siteCardClose', 'findModal', 'findTitle', 'findInput', 'findClear', 'findClose', 'findStatus',
    'findList', 'findEntry'];

// The report code, the cards, the month summary, this file and the finder, in the device's
// own context, over a DOM that can be read back. `history: false` leaves this file out - the
// finder of the base. `journey: true` loads «בניית סידור» too.
function withHistory(device, options = {}) {
    const dom = makeDom();
    HISTORY_IDS.concat(OTHER_IDS).forEach(id => dom.register(id));
    const make = dom.createElement;
    dom.createElement = tag => { const node = make(tag); node.dataset = {}; return node; };
    device.ctx.document = dom;
    device.dom = dom;
    device.run = code => vm.runInContext(code, device.ctx, { filename: 'harness:history' });
    const files = ['js/ui/sitecolor.js', 'js/ui/reports.js', 'js/ui/week.js', 'js/ui/seder.js', 'js/ui/workercard.js',
        'js/ui/monthsummary.js', 'js/ui/sitecard.js'];
    if (options.journey) files.push('js/ui/journey.js');
    if (options.history !== false) files.push('js/ui/history.js');
    files.push('js/ui/find.js');
    files.forEach(file => device.run(source(file)));
    device.views = [];
    device.ctx.showView = view => { device.views.push(view); };
    device.asked = [];
    device.told = [];
    device.answer = false;
    device.ctx.askConfirm = settings => { device.asked.push(settings); return Promise.resolve(device.answer); };
    device.ctx.askTell = settings => { device.told.push(settings); return Promise.resolve(true); };
    device.shared = [];
    device.ctx.shareTextOut = (text, status, done) => { device.shared.push(['share', text]); done(); };
    device.ctx.copyTextOut = box => { device.shared.push(['copy', box.value]); };
    device.ctx.navigator = { share: () => Promise.resolve() };
    device.focused = [];
    const title = dom.getElementById('historyTitle');
    title.focus = () => { device.focused.push('historyTitle'); };
    device.setToday(options.today || TODAY);
    device.read = (query, today = options.today || TODAY, schedule = 'State.schedule') => JSON.parse(device.run(
        `JSON.stringify(historyRead(${schedule}, ${JSON.stringify(query)}, ${JSON.stringify(today)}))`));
    device.range = (key, today, chosen, firstDay) => JSON.parse(device.run(
        `JSON.stringify(historyRange(${JSON.stringify(key)}, ${JSON.stringify(today)}, ${JSON.stringify(chosen || null)}, ${JSON.stringify(firstDay || null)}))`));
    device.facts = () => JSON.parse(device.run('JSON.stringify(historyFacts())'));
    device.text = () => device.run('historyText(historyFacts())');
    device.byId = id => dom.getElementById(id);
    device.rowsDrawn = () => dom.getElementById('historyList').querySelectorAll('.history-row');
    device.choose = (which, value) => {
        const field = { man: 'historyMan', site: 'historySite', range: 'historyRange' }[which];
        dom.getElementById(field).value = value;
        device.run(`historyChoose(${JSON.stringify(which)})`);
    };
    device.dates = (from, to) => {
        dom.getElementById('historyFrom').value = from;
        dom.getElementById('historyTo').value = to;
        device.run("historyChoose('dates')");
    };
    return device;
}

// A record seeded on one phone and opened on another - the way the record reaches a phone.
function reopened(first, id, options) {
    first.State.save({ silent: true });
    const device = withHistory(makeDevice({ deviceId: id, storage: first.dump() }), options);
    device.State.load();
    return device;
}

// ---------------------------------------------------------------- seeded records
//
// Both pay cycles, two sites a day, doubles, extra hours with and without hours, a regular
// entry carrying hours, absences, an archived man who worked, an archived site, two unlisted
// site ids (p_8 only outside the default range, p_9 inside it), Rima on two sites, יוסף גבס
// on one, a Saturday with work, tomorrow's seder typed (Rima too), and the critic's day.
function seeded(seed, options) {
    const rand = mulberry(20261119 + seed);
    const pick = list => list[Math.floor(rand() * list.length)];
    const first = makeDevice({ deviceId: `d_seed${seed}` });
    first.setToday(TODAY);
    const S = first.State.schedule;
    const crew = 7 + (seed % 3);
    S.workers = [];
    for (let n = 1; n <= crew; n += 1) {
        S.workers.push(Object.assign({ id: `w_${n}`, name: `עובד ${seed}-${n}`, active: n !== crew,
            dailyRate: [380, 410, 450][n % 3], hourlyRate: n % 2 ? 50 : 0 },
        n % 3 === 0 ? { payCycles: '2025-12-05=weekly' } : {}));
    }
    S.places = [1, 2, 3, 4].map(n => ({ id: `p_${n}`, name: `אתר ${seed}-${n}`, active: n !== 4 }));
    const sites = ['p_1', 'p_2', 'p_3', 'p_4'];
    const assign = (date, id, place, rate, hours) => first.call('assignPlace', S, date, id, 'actual', place, rate, hours);
    datesBetween(FIRST_DAY, TODAY).forEach(date => {
        if (weekdayOf(date) === 6 && date !== SATURDAY) return;
        S.workers.forEach(worker => {
            // The man who was turned off stopped working at the end of the summer.
            if (worker.active === false && date > '2026-08-31') return;
            const roll = rand();
            if (roll < 0.15) return;
            if (roll < 0.18) { first.call('markAbsent', S, date, worker.id, 'actual'); return; }
            const one = pick(sites);
            const band = rand();
            if (band < 0.04) assign(date, worker.id, one, 'double');
            else if (band < 0.09) assign(date, worker.id, one, 'extra', 1 + Math.floor(rand() * 3));
            else if (band < 0.11) assign(date, worker.id, one, 'extra');
            else if (band < 0.13) assign(date, worker.id, one, 'normal', 1);
            else assign(date, worker.id, one);
            if (rand() < 0.08) assign(date, worker.id, pick(sites.filter(id => id !== one)));
        });
        if (rand() < 0.4) first.call('setRimaCount', S, date, 'p_1', 1 + Math.floor(rand() * 4));
        if (rand() < 0.25) first.call('setRimaCount', S, date, 'p_3', 1 + Math.floor(rand() * 3));
        if (rand() < 0.3) first.call('setYosefGevesCount', S, date, 'p_2', 1 + Math.floor(rand() * 5));
    });
    // Two sites the roster has not got: p_9 inside «3 החודשים האחרונים», p_8 in January only.
    first.call('setWorkerDay', S, '2026-10-05', 'w_2', 'actual', { entries: [first.call('makeEntry', 'p_9')] });
    first.call('setWorkerDay', S, '2026-01-12', 'w_3', 'actual', { entries: [first.call('makeEntry', 'p_8')] });
    // THE CRITIC'S DAY: 3 extra hours at p_1 and a double at p_2, one man, one date.
    first.call('setWorkerDay', S, CRITIC_DAY, 'w_1', 'actual',
        { entries: [first.call('makeEntry', 'p_1', 'extra', 3), first.call('makeEntry', 'p_2', 'double')] });
    // Tomorrow's seder, typed this evening - at p_1 among others, and Rima's men with it.
    S.workers.slice(0, 4).forEach((worker, at) => assign(TOMORROW, worker.id, at < 2 ? 'p_1' : 'p_2'));
    first.call('setRimaCount', S, TOMORROW, 'p_1', 2);
    // And this month, for certain: Rima's men at p_1 and יוסף גבס's at p_2 today.
    first.call('setRimaCount', S, TODAY, 'p_1', 3);
    first.call('setYosefGevesCount', S, TODAY, 'p_2', 2);
    const device = reopened(first, `d_seed${seed}`, options);
    // A LOAD puts every site a day names back on the roster, archived («אתר שנמחק (p_9)»,
    // reinstateReferenced). A site the roster has not got exists in memory, as when a day
    // arrives from another phone before the roster entry that introduces its site: so here.
    device.State.schedule.places = device.State.schedule.places.filter(place => place.id !== 'p_8' && place.id !== 'p_9');
    return device;
}

// What the pay sheet sums, over the men listed: the five counts with no site chosen.
function paySums(device, from, to, workerId) {
    const rows = JSON.parse(device.run(`JSON.stringify(payrollReport(State.schedule, ${JSON.stringify(from)}, ${JSON.stringify(to)}))`))
        .filter(row => workerId === null || row.workerId === workerId);
    const sum = field => rows.reduce((total, row) => total + row[field], 0);
    return [['attendance', sum('attendanceDays')], ['siteDays', sum('siteVisits')], ['doubleDays', sum('doubleDays')],
        ['extraHours', sum('extraHours')], ['absent', sum('absent')]].map(([id, value]) => ({ id, value }));
}

// What workerDaysReport answers - its live branch, or a closure's frozen days - newest first,
// as [date, absent, sites, double, hours].
function reportDays(device, workerId, from, to, schedule = 'State.schedule') {
    return JSON.parse(device.run(`(function () {
        const worker = ${schedule}.workers.find(one => one.id === ${JSON.stringify(workerId)});
        return JSON.stringify(workerDaysReport(${schedule}, worker, ${JSON.stringify(from)}, ${JSON.stringify(to)}).map(day => {
            const ids = [];
            (day.entries || []).forEach(entry => { if (ids.indexOf(String(entry.placeId)) === -1) ids.push(String(entry.placeId)); });
            return [day.date, Boolean(day.absent), ids, Boolean(day.doubled), Number(day.extraHours) || 0];
        }));
    })()`)).reverse();
}
const historyDays = rows => rows.map(row => [row.date, row.kind === 'absent', row.sites.map(site => site.id),
    row.kind === 'double', row.hours]);

// The invoice's own (man, date) pairs at a site, newest first and roster order in a date.
function invoicePairs(device, placeId, from, to) {
    return JSON.parse(device.run(`(function () {
        const row = invoiceByDate(State.schedule, ${JSON.stringify(from)}, ${JSON.stringify(to)}).places
            .find(item => String(item.placeId) === ${JSON.stringify(placeId)});
        const order = State.schedule.workers.map(worker => worker.id);
        const out = [];
        (row ? row.days : []).slice().reverse().forEach(day => day.workerIds.slice()
            .sort((a, b) => order.indexOf(a) - order.indexOf(b)).forEach(id => out.push([day.date, id])));
        return JSON.stringify(out);
    })()`));
}

// What the day screen's row under a site reads for him on a date: the first entry at it.
function siteEntry(device, date, workerId, placeId) {
    return JSON.parse(device.run(`(function () {
        const day = State.schedule.days[${JSON.stringify(date)}];
        const record = day && day.actual && day.actual[${JSON.stringify(workerId)}];
        if (!record || record.absent) return 'null';
        const entries = record.entries || [];
        const entry = entries.find(one => one.placeId === ${JSON.stringify(placeId)});
        if (!entry) return 'null';
        return JSON.stringify({ kind: entry.rate || 'normal', hours: Number(entry.extraHours) || 0, split: entries.length > 1 });
    })()`));
}

const RANGES = [['thisMonth'], ['thisYear'], ['all'], ['custom', '2026-03-01', '2026-03-31']];
const queryOf = (range, workerId, placeId) => ({ workerId, placeId, range: range[0], from: range[1] || null, to: range[2] || null });

// ================================================================== 1. the range
{
    suite('1. the range: every key on the calendar\'s edges, and nothing after today');

    const device = withHistory(makeDevice({ deviceId: 'd_range' }));
    const read = (key, today, chosen, firstDay) => {
        const range = device.range(key, today, chosen, firstDay);
        return range === null ? null : [range.from, range.to < today ? range.to : today];
    };
    const keys = ['thisMonth', 'lastMonth', 'last3', 'thisYear'];
    same('on 1 January: this month, December, three months back to November, and «השנה» read as its one day',
        keys.map(key => read(key, '2026-01-01')),
        [['2026-01-01', '2026-01-01'], ['2025-12-01', '2025-12-31'], ['2025-11-01', '2026-01-01'], ['2026-01-01', '2026-01-01']]);
    same('and before the cut «3 החודשים האחרונים» runs to the end of January, «השנה» to 31 December',
        [device.range('last3', '2026-01-01'), device.range('thisYear', '2026-01-01')],
        [{ from: '2025-11-01', to: '2026-01-31' }, { from: '2026-01-01', to: '2026-12-31' }]);
    same('on 31 March', keys.map(key => read(key, '2026-03-31')),
        [['2026-03-01', '2026-03-31'], ['2026-02-01', '2026-02-28'], ['2026-01-01', '2026-03-31'], ['2026-01-01', '2026-03-31']]);
    same('on 1 November «3 החודשים האחרונים» is two months and a day - the intended edge',
        keys.map(key => read(key, '2026-11-01')),
        [['2026-11-01', '2026-11-01'], ['2026-10-01', '2026-10-31'], ['2026-09-01', '2026-11-01'], ['2026-01-01', '2026-11-01']]);
    same('on 19 November', keys.map(key => read(key, '2026-11-19')),
        [['2026-11-01', '2026-11-19'], ['2026-10-01', '2026-10-31'], ['2026-09-01', '2026-11-19'], ['2026-01-01', '2026-11-19']]);
    same('on 31 December the year is whole and so is the month', keys.map(key => read(key, '2026-12-31')),
        [['2026-12-01', '2026-12-31'], ['2026-11-01', '2026-11-30'], ['2026-10-01', '2026-12-31'], ['2026-01-01', '2026-12-31']]);
    same('on a leap day', keys.map(key => read(key, '2028-02-29')),
        [['2028-02-01', '2028-02-29'], ['2028-01-01', '2028-01-31'], ['2027-12-01', '2028-02-29'], ['2028-01-01', '2028-02-29']]);
    same('«מתחילת הרישום» is the record\'s first day to today, and today alone on a record with no day',
        [read('all', '2026-11-19', null, '2025-11-20'), read('all', '2026-11-19', null, null),
            read('all', '2026-11-19', null, '2026-12-01')],
        [['2025-11-20', '2026-11-19'], ['2026-11-19', '2026-11-19'], ['2026-11-19', '2026-11-19']]);
    same('the record\'s first day is the least of its keys, or none', [device.run(`historyFirstDay({ days: { '2026-03-02': {},
        '2025-12-08': {}, '2026-01-01': {} } })`), device.run('historyFirstDay({ days: {} })'), device.run('historyFirstDay(null)')],
    ['2025-12-08', null, null]);
    same('«תאריכים אחרים» refused when inverted, not a date, or starting after the last day it would read',
        [read('custom', '2026-11-19', { from: '2026-05-02', to: '2026-05-01' }),
            read('custom', '2026-11-19', { from: '2026-02-30', to: '2026-03-01' }),
            read('custom', '2026-11-19', { from: '2026-05-01', to: '' }),
            read('custom', '2026-11-19', { from: '2026-11-20', to: '2026-12-31' }), read('custom', '2026-11-19', null),
            read('nonsense', '2026-11-19')],
        [null, null, null, null, null, null]);
    same('and an end after today is read as today', read('custom', '2026-11-19', { from: '2026-10-01', to: '2027-01-31' }),
        ['2026-10-01', '2026-11-19']);
    // For every key, on every day of two years, the reading's last day is never after today.
    const late = [];
    datesBetween('2026-01-01', '2027-12-31').forEach(today => {
        ['thisMonth', 'lastMonth', 'last3', 'thisYear', 'all'].forEach(key => {
            const range = read(key, today, null, '2025-06-01');
            if (!range || range[1] > today || range[0] > range[1]) late.push([today, key, range]);
        });
    });
    same('on every day of 2026 and 2027, every key reads a range that ends at today or before it', late, []);
    // THE READING IS PURE, read as tests/find.test.mjs reads findRead: from the reading's
    // header to the facts' header, its code names no DOM, no storage, no State and no clock -
    // today is handed in. (A date BUILT from numbers, `new Date(year, month, 1, 12)`, is the
    // month arithmetic setMonthRange does, not a clock.)
    const reading = HISTORY_JS.slice(HISTORY_JS.indexOf('// ================================================================== the reading'),
        HISTORY_JS.indexOf('// ================================================================== the facts'))
        .split('\n').filter(line => line.trim().indexOf('//') !== 0).map(line => line.replace(/\s\/\/ .*$/, '')).join('\n');
    given('the reading\'s section is found', reading.indexOf('function historyRead(') !== -1 && reading.indexOf('function historyRange(') !== -1);
    same('the reading is pure: no DOM, no storage, no State, no clock in it',
        reading.match(/document|window|\bStore\b|localStorage|todayStr|\bState\b|Date\.now|new Date\(\)|performance/g) || [], []);

    // The two fields, opened after «השנה»: filled with the dates it READ.
    device.State.schedule.workers = [{ id: 'w_1', name: 'דוגמה', active: true }];
    device.State.schedule.places = [{ id: 'p_1', name: 'אתר', active: true }];
    device.run('openHistory(null)');
    device.choose('range', 'thisYear');
    device.choose('range', 'custom');
    same('«תאריכים אחרים» opened after «השנה» is filled with 01/01 and today, never 31 December',
        [device.byId('historyFrom').value, device.byId('historyTo').value, device.byId('historyDates').hidden,
            device.byId('historyTo').getAttribute('max'), device.byId('historyTo').getAttribute('min'),
            device.byId('historyFrom').getAttribute('max')],
        ['2026-01-01', TODAY, false, TODAY, '2026-01-01', TODAY]);
    device.run('closeHistory()');
}

// ================================================================== 2. the rows
{
    suite('2. the rows, on three seeded records, against the live record\'s own readers');

    SEEDS.forEach(seed => {
        const device = seeded(seed);
        const men = device.State.schedule.workers.map(worker => worker.id);
        const sites = device.State.schedule.places.map(place => place.id);
        given(`seed ${seed}: a record with men, sites and a year of days`,
            men.length >= 7 && sites.length === 4 && Object.keys(device.State.schedule.days).length > 250,
            JSON.stringify([men.length, sites.length, Object.keys(device.State.schedule.days).length]));
        const bad = { one: [], site: [], everyone: [], absent: [] };
        RANGES.forEach(range => {
            men.forEach(id => {
                const read = device.read(queryOf(range, id, null));
                const live = reportDays(device, id, read.from, read.to);
                if (JSON.stringify(historyDays(read.rows)) !== JSON.stringify(live)) bad.one.push([range[0], id]);
            });
            sites.forEach(place => {
                men.forEach(id => {
                    const read = device.read(queryOf(range, id, place));
                    const want = Object.keys(device.State.schedule.days).filter(date => date >= read.from && date <= read.to)
                        .sort().reverse().map(date => [date, siteEntry(device, date, id, place)]).filter(pair => pair[1] !== null)
                        .map(([date, entry]) => [date, entry.kind, entry.hours, entry.split]);
                    const got = read.rows.map(row => [row.date, row.kind, row.hours, row.split]);
                    if (JSON.stringify(got) !== JSON.stringify(want)) bad.site.push([range[0], id, place]);
                    if (read.rows.some(row => row.kind === 'absent')) bad.absent.push([range[0], id, place]);
                });
                const everyone = device.read(queryOf(range, null, place));
                const pairs = everyone.rows.map(row => [row.date, row.workerId]);
                if (JSON.stringify(pairs) !== JSON.stringify(invoicePairs(device, place, everyone.from, everyone.to))) {
                    bad.everyone.push([range[0], place]);
                }
                const kinds = everyone.rows.filter(row => {
                    const entry = siteEntry(device, row.date, row.workerId, place);
                    return !entry || entry.kind !== row.kind || entry.hours !== row.hours || entry.split !== row.split;
                });
                if (kinds.length) bad.everyone.push([range[0], place, 'kind']);
                if (everyone.rows.some(row => row.kind === 'absent')) bad.absent.push([range[0], 'everyone', place]);
            });
            // Everyone, every site: the union of the men's own rows, newest first, roster order.
            const all = device.read(queryOf(range, null, null));
            const union = [];
            men.forEach(id => reportDays(device, id, all.from, all.to).forEach(day => union.push([men.indexOf(id), day])));
            union.sort((a, b) => (a[1][0] < b[1][0] ? 1 : a[1][0] > b[1][0] ? -1 : a[0] - b[0]));
            if (JSON.stringify(historyDays(all.rows)) !== JSON.stringify(union.map(item => item[1]))
                || JSON.stringify(all.rows.map(row => row.workerId)) !== JSON.stringify(union.map(item => men[item[0]]))) {
                bad.everyone.push([range[0], 'every site']);
            }
        });
        same(`seed ${seed}: one man, no site - row for row the live branch of workerDaysReport (dates, absences, sites, doubles, hours)`,
            bad.one, []);
        same(`seed ${seed}: one man at a site - exactly the dates his live entries hold it, each the kind, hours and «2 אתרים» of the entry the day screen's row reads`,
            bad.site, []);
        same(`seed ${seed}: everyone at a site - exactly the invoice's (man, date) pairs, newest first and roster order, each with the site's own kind`,
            bad.everyone, []);
        same(`seed ${seed}: an absence is never listed with a site chosen`, bad.absent, []);
        const rows = device.read({ workerId: null, placeId: null, range: 'all' }).rows;
        check(`seed ${seed}: the whole record holds every kind of row it was seeded with`,
            ['normal', 'extra', 'double', 'absent'].every(kind => rows.some(row => row.kind === kind))
            && rows.some(row => row.kind === 'normal' && row.hours > 0) && rows.some(row => row.kind === 'extra' && row.hours === 0)
            && rows.some(row => row.sites.length === 2) && rows.some(row => row.date === SATURDAY),
        String(rows.length));
    });
}

// ================================================================== 3. the counts
{
    suite('3. the counts, by what is chosen, against the pay sheet, the invoice and the site card');

    SEEDS.forEach(seed => {
        const device = seeded(seed);
        const men = device.State.schedule.workers.map(worker => worker.id);
        const sites = device.State.schedule.places.map(place => place.id);
        const bad = { none: [], one: [], everyone: [] };
        RANGES.forEach(range => {
            [null].concat(men).forEach(id => {
                const read = device.read(queryOf(range, id, null));
                if (JSON.stringify(read.tiles) !== JSON.stringify(paySums(device, read.from, read.to, id))) bad.none.push([range[0], id]);
            });
            sites.forEach(place => {
                men.forEach(id => {
                    const read = device.read(queryOf(range, id, place));
                    const his = invoicePairs(device, place, read.from, read.to).filter(pair => pair[1] === id).length;
                    if (JSON.stringify(read.tiles) !== JSON.stringify([{ id: 'siteDays', value: his }]) || read.site !== null) {
                        bad.one.push([range[0], id, place]);
                    }
                });
                const everyone = device.read(queryOf(range, null, place));
                if (everyone.tiles.length !== 0 || !everyone.site) bad.everyone.push([range[0], place]);
            });
        });
        same(`seed ${seed}: no site - the five tiles are the pay sheet's own sums over the men listed, for everyone and for each man`,
            bad.none, []);
        same(`seed ${seed}: a site and one man - one tile, his count in that site's workerIds, and none of the site's billing`,
            bad.one, []);
        same(`seed ${seed}: a site and everyone - no tile, the site's block`, bad.everyone, []);

        // AGAINST THE SITE CARD: every past month exactly; the current one by exactly tomorrow.
        const months = ['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08',
            '2026-09', '2026-10'];
        const card = (place, key) => JSON.parse(device.run(`JSON.stringify(siteCardFacts(${JSON.stringify(place)}, ${JSON.stringify(key)}))`));
        const past = [];
        months.forEach(key => sites.forEach(place => {
            const read = device.read({ workerId: null, placeId: place, range: 'custom', from: `${key}-01`, to: lastOf(key) });
            const facts = card(place, key);
            if (JSON.stringify(read.site.men) !== JSON.stringify(facts.men) || read.site.billed !== facts.siteDays) {
                past.push([key, place]);
            }
        }));
        same(`seed ${seed}: every past month at every site - «מי עבד באתר» and the billed total are the site card's, man for man and in its order`,
            past, []);
        const now = device.read({ workerId: null, placeId: 'p_1', range: 'thisMonth' });
        const nowCard = card('p_1', '2026-11');
        const tomorrowMen = JSON.parse(device.run(`JSON.stringify(workersAtPlace(State.schedule, ${JSON.stringify(TOMORROW)}, 'p_1', 'actual'))`));
        const tomorrowBilled = JSON.parse(device.run(`JSON.stringify(invoiceByDate(State.schedule, ${JSON.stringify(TOMORROW)}, ${JSON.stringify(TOMORROW)}).countAt('p_1', ${JSON.stringify(TOMORROW)}))`));
        given(`seed ${seed}: tomorrow's seder is typed at p_1, with Rima's men`, tomorrowMen.length === 2 && tomorrowBilled === 4,
            JSON.stringify([tomorrowMen, tomorrowBilled]));
        const plusOne = {};
        now.site.men.forEach(man => { plusOne[man.id] = man.days; });
        tomorrowMen.forEach(id => { plusOne[id] = (plusOne[id] || 0) + 1; });
        const cardMen = {};
        nowCard.men.forEach(man => { cardMen[man.id] = man.days; });
        const sorted = map => Object.keys(map).sort().map(id => [id, map[id]]);
        same(`seed ${seed}: the current month at p_1 - the card has each man of tomorrow's seder one day more, and its total more by tomorrow's billed count`,
            [sorted(plusOne), now.site.billed + tomorrowBilled], [sorted(cardMen), nowCard.siteDays]);
        const quiet = sites.filter(place => place !== 'p_1' && place !== 'p_2').map(place => {
            const read = device.read({ workerId: null, placeId: place, range: 'thisMonth' });
            const facts = card(place, '2026-11');
            return JSON.stringify(read.site.men) === JSON.stringify(facts.men) && read.site.billed === facts.siteDays;
        });
        same(`seed ${seed}: and at a site nothing is typed at after today, the current month is the card's exactly`, quiet, [true, true]);

        // THE CRITIC'S DAY, both sites in turn.
        const day = place => device.read({ workerId: 'w_1', placeId: place, range: 'custom', from: CRITIC_DAY, to: CRITIC_DAY });
        const atHours = day('p_1');
        const atDouble = day('p_2');
        const noSite = day(null);
        same(`seed ${seed}: the critic's day at the site with the hours - «שעות נוספות», +3 ש׳, «2 אתרים», one tile of 1`,
            [atHours.rows.map(row => [row.kind, row.hours, row.split]), atHours.tiles], [[['extra', 3, true]], [{ id: 'siteDays', value: 1 }]]);
        same(`seed ${seed}: at the site with the double - «יום כפול», no hours, «2 אתרים», one tile of 1`,
            [atDouble.rows.map(row => [row.kind, row.hours, row.split]), atDouble.tiles], [[['double', 0, true]], [{ id: 'siteDays', value: 1 }]]);
        same(`seed ${seed}: with no site - «יום כפול» and +3 ש׳ on both sites, and the tiles 1 / 2 / 1 / 3 / 0, the pay sheet's own`,
            [noSite.rows.map(row => [row.kind, row.hours, row.sites.map(site => site.id)]), noSite.tiles.map(tile => tile.value),
                paySums(device, CRITIC_DAY, CRITIC_DAY, 'w_1').map(tile => tile.value)],
            [[['double', 3, ['p_1', 'p_2']]], [1, 2, 1, 3, 0], [1, 2, 1, 3, 0]]);
    });
}

// ================================================================== 4. the exception
{
    suite('4. a closed period corrected after its close: live here, frozen on the pay sheet, by exactly the correction');

    // (a) A weekly man's week, closed on a copy, then one of its days corrected.
    const device = seeded(11);
    const weekly = device.State.schedule.workers.find(worker => worker.payCycles);
    const WEEK = ['2026-10-23', '2026-10-29'];
    given('a weekly man of the record', Boolean(weekly), JSON.stringify(device.State.schedule.workers.map(worker => worker.payCycles)));
    const id = JSON.stringify(weekly.id);
    // Two days of his in that week, written plainly, so the correction has something to move -
    // on a COPY, in the device's own realm, as the seeds close a period.
    const closed = Number(device.run(`globalThis.__copy = JSON.parse(JSON.stringify(State.schedule));
        setWorkerDay(__copy, '2026-10-26', ${id}, 'actual', { entries: [makeEntry('p_1')] });
        setWorkerDay(__copy, '2026-10-27', ${id}, 'actual', { entries: [makeEntry('p_3')] });
        closePeriodChanges(__copy, ${id}, '${WEEK[0]}', '${WEEK[1]}', '2026-10-30T18:00:00.000Z', 'd_seed', 0).length`));
    given('his week closes on the copy', closed > 0, String(closed));
    const frozenBefore = reportDays(device, weekly.id, WEEK[0], WEEK[1], '__copy');
    // The correction, after the close: Monday moved to p_2 and made a double.
    device.run(`setWorkerDay(__copy, '2026-10-26', ${id}, 'actual', { entries: [makeEntry('p_2', 'double')] })`);
    const frozen = reportDays(device, weekly.id, WEEK[0], WEEK[1], '__copy');
    const read = device.read({ workerId: weekly.id, placeId: null, range: 'custom', from: WEEK[0], to: WEEK[1] }, TODAY, '__copy');
    same('workerDaysReport answers the closure\'s frozen days over exactly that week - the correction is not in them',
        frozen, frozenBefore);
    const differ = historyDays(read.rows).filter(row => JSON.stringify(row) !== JSON.stringify(frozen.find(day => day[0] === row[0])));
    same('the history reads the live record, and differs from them by exactly the corrected day: its site and its kind',
        differ, [['2026-10-26', false, ['p_2'], true, 0]]);
    const pay = JSON.parse(device.run(`JSON.stringify(payrollReport(__copy, ${JSON.stringify(WEEK[0])}, ${JSON.stringify(WEEK[1])})
        .find(row => row.workerId === ${JSON.stringify(weekly.id)}))`));
    const tiles = read.tiles.reduce((out, tile) => Object.assign(out, { [tile.id]: tile.value }), {});
    same('and the pay sheet\'s counts are the frozen ones: one double day fewer than the live record\'s',
        [pay.doubleDays, tiles.doubleDays - pay.doubleDays, pay.attendanceDays === tiles.attendance],
        [frozen.filter(day => day[3]).length, 1, true]);

    suite('4. an old closure with no periodTo, opening on 1 January, in its two shapes');

    // A man who worked in January only, on a small record of his own.
    const jan = withHistory(makeDevice({ deviceId: 'd_jan' }));
    jan.State.schedule.workers = [{ id: 'w_j', name: 'דוגמה ינואר', active: true, dailyRate: 400 }];
    jan.State.schedule.places = [{ id: 'p_1', name: 'אתר א', active: true }, { id: 'p_2', name: 'אתר ב', active: true }];
    ['2026-01-01', '2026-01-04', '2026-01-05', '2026-01-06', '2026-01-08'].forEach(date =>
        jan.call('assignPlace', jan.State.schedule, date, 'w_j', 'actual', 'p_1'));
    jan.State.save({ silent: true });
    const janDays = reopened(jan, 'd_jan');
    janDays.call('addAdvance', janDays.State.schedule, 'w_j', '2026-01-01', 500, '');
    const advanceId = Object.keys(janDays.State.schedule.advances)[0];
    const shapes = {
        // The real old shape: what came off and the balance, no basis, no days (js/model/ledger.js).
        old: `{ id: 'le_old', advanceId: ${JSON.stringify(advanceId)}, kind: 'deducted', periodFrom: '2026-01-01',
            amount: 200, balanceAfter: 300, at: '2026-01-15T08:00:00.000Z', by: 'd_old' }`,
        // A hand-made one: a basis and the days, and still no periodTo.
        made: `{ id: 'le_made', workerId: 'w_j', kind: 'closed', periodFrom: '2026-01-01', at: '2026-01-15T08:00:00.000Z',
            by: 'd_old', basis: { attendanceDays: 5, payUnits: 5, normalDays: 5, doubleDays: 0, extraHours: 0, siteVisits: 5, absent: 0 },
            days: [{ date: '2026-01-01', entries: [{ placeId: 'p_1' }] }, { date: '2026-01-04', entries: [{ placeId: 'p_1' }] },
                { date: '2026-01-05', entries: [{ placeId: 'p_1' }] }, { date: '2026-01-06', entries: [{ placeId: 'p_1' }] },
                { date: '2026-01-08', entries: [{ placeId: 'p_1' }] }] }`
    };
    const ranges = [['thisYear'], ['custom', '2026-01-01', '2026-01-31'], ['custom', '2026-01-01', '2026-06-30'],
        ['custom', '2026-01-01', TODAY]];
    Object.keys(shapes).forEach(shape => {
        janDays.run(`globalThis.__jan = JSON.parse(JSON.stringify(State.schedule));
            __jan.ledger = __jan.ledger || {}; __jan.ledger.advances = __jan.ledger.advances || {};
            __jan.ledger.advances[${shape === 'old' ? "'le_old'" : "'le_made'"}] = ${shapes[shape]};`);
        const counts = (from, to) => JSON.parse(janDays.run(`(function () {
            const row = payrollReport(__jan, ${JSON.stringify(from)}, ${JSON.stringify(to)}).find(one => one.workerId === 'w_j');
            return JSON.stringify([row.attendanceDays, row.siteVisits, row.doubleDays, row.extraHours, row.absent]);
        })()`));
        const agree = () => {
            const results = ranges.map(range => {
                const read = janDays.read(queryOf(range, 'w_j', null), TODAY, '__jan');
                const live = historyDays(read.rows);
                const days = reportDays(janDays, 'w_j', read.from, read.to, '__jan');
                const tiles = read.tiles.map(tile => tile.value);
                const pay = counts(read.from, read.to);
                return { range: range[0] + (range[2] || ''), rows: JSON.stringify(live) === JSON.stringify(days),
                    counts: JSON.stringify(tiles) === JSON.stringify(pay), live, days, tiles, pay };
            });
            return results;
        };
        const before = agree();
        same(`${shape}: before any correction the pay sheet and this list agree over every range starting on 1 January`,
            before.map(r => [r.range, r.rows, r.counts]), ranges.map(range => [range[0] + (range[2] || ''), true, true]));
        // A day of it corrected: 5 January moved to p_2 and made a double.
        janDays.run("setWorkerDay(__jan, '2026-01-05', 'w_j', 'actual', { entries: [makeEntry('p_2', 'double')] })");
        const after = agree();
        if (shape === 'old') {
            same('old: the real old shape carries no basis and no days - the pay sheet\'s counts and days stay live, and agree with this list, corrected',
                after.map(r => [r.range, r.rows, r.counts]), ranges.map(range => [range[0] + (range[2] || ''), true, true]));
        } else {
            same('made: a basis and days with no periodTo - frozen on the pay sheet over «השנה» and over every range from 01/01, live here',
                after.map(r => [r.range, r.rows, r.counts]), ranges.map(range => [range[0] + (range[2] || ''), false, false]));
            same('and the two differ by exactly the correction, row for row and count for count',
                after.map(r => [r.live.filter(row => JSON.stringify(row) !== JSON.stringify(r.days.find(day => day[0] === row[0]))),
                    r.tiles.map((value, at) => value - r.pay[at])]),
                ranges.map(() => [[['2026-01-05', false, ['p_2'], true, 0]], [0, 0, 1, 0, 0]]));
            const other = janDays.read({ workerId: 'w_j', placeId: null, range: 'custom', from: '2026-01-02', to: TODAY }, TODAY, '__jan');
            same('while over a range starting on any other day they agree', [JSON.stringify(historyDays(other.rows))
                === JSON.stringify(reportDays(janDays, 'w_j', other.from, other.to, '__jan')),
            JSON.stringify(other.tiles.map(tile => tile.value)) === JSON.stringify(counts('2026-01-02', TODAY))], [true, true]);
        }
    });
}

// ================================================================== 5. the site's block
{
    suite('5. the site\'s block: billed = own + Rima, each from its own report, in the site card\'s order');

    SEEDS.forEach(seed => {
        const device = seeded(seed);
        const bad = [];
        RANGES.forEach(range => device.State.schedule.places.forEach(place => {
            const read = device.read(queryOf(range, null, place.id));
            const want = JSON.parse(device.run(`(function (from, to, id) {
                const row = invoiceByDate(State.schedule, from, to).places.find(item => String(item.placeId) === id);
                return JSON.stringify({ billed: row ? row.workerDays : 0, own: invoiceWithoutRima(State.schedule, from, to, id).total,
                    rima: rimaReport(State.schedule, from, to, id).total, yosef: yosefGevesReport(State.schedule, from, to, id).total });
            })(${JSON.stringify(read.from)}, ${JSON.stringify(read.to)}, ${JSON.stringify(place.id)})`));
            const site = read.site;
            if (site.billed !== want.billed || site.own !== want.own || site.rima !== want.rima || site.yosef !== want.yosef
                || site.billed !== site.own + site.rima) bad.push([range[0], place.id, site, want]);
        }));
        same(`seed ${seed}: at every site and range - billed is the invoice's, own invoiceWithoutRima's, Rima rimaReport's, יוסף גבס yosefGevesReport's, and billed = own + Rima`,
            bad, []);
    });

    const device = seeded(22);
    const lines = () => device.byId('historyTotals').querySelectorAll('.history-pair')
        .map(pair => [pair.dataset.figure, pair.children.map(child => plain(child.textContent))]);
    device.run('openHistory(null)');
    device.choose('range', 'thisMonth');
    device.choose('site', 'p_1');
    const R = JSON.parse(device.run('JSON.stringify({ NO_RIMA_TOTAL, NO_RIMA_TITLE, RIMA_TOTAL, RIMA_NOTE, YOSEF_GEVES_TOTAL, YOSEF_GEVES_NOTE, billing: SITE_CARD_REUSED.billing, men: SITE_CARD_TEXT.men })'));
    let facts = device.facts();
    given('p_1 has Rima\'s men this month', facts.site.rima > 0, JSON.stringify(facts.site));
    same('with Rima: «סה״כ ימי עובד־אתר» (billed) first, then «בלי עובדי רימא» and «סה״כ עובדי רימא» with its note - each once',
        lines(), [['billed', [R.NO_RIMA_TOTAL, String(facts.site.billed)]], ['own', [R.NO_RIMA_TITLE, String(facts.site.own)]],
            ['rima', [R.RIMA_TOTAL, String(facts.site.rima), R.RIMA_NOTE]]]);
    same('under its heading «חיוב - <site>», and then «מי עבד באתר», a man a line',
        [plain(device.byId('historyTotals').querySelectorAll('.history-site-head')[0].textContent),
            device.byId('historyTotals').querySelectorAll('.history-men-head').map(node => node.textContent),
            device.byId('historyTotals').querySelectorAll('.history-man').length],
        [`${R.billing} ${facts.site.name}`, [R.men], facts.site.men.length]);
    same('no tile beside the billing', device.byId('historyTotals').querySelectorAll('.history-tile').length, 0);
    device.choose('site', 'p_2');
    facts = device.facts();
    given('p_2 has יוסף גבס and no Rima this month', facts.site.yosef > 0 && facts.site.rima === 0, JSON.stringify(facts.site));
    same('with no Rima there is neither Rima line, billed is own, and «עובדי יוסף גבס» stands apart with its note',
        [lines(), facts.site.billed === facts.site.own,
            device.byId('historyTotals').querySelectorAll('.history-pair-apart').map(pair => pair.dataset.figure)],
        [[['billed', [R.NO_RIMA_TOTAL, String(facts.site.billed)]],
            ['yosef', [R.YOSEF_GEVES_TOTAL, String(facts.site.yosef), R.YOSEF_GEVES_NOTE]]], true, ['yosef']]);
    const text = plain(device.text());
    check('and «עובדי יוסף גבס» is nowhere in the text', text.indexOf('יוסף גבס') === -1 && text.indexOf(R.billing) !== -1, text.slice(0, 200));
    // IN NO OTHER NUMBER: the same record with the יוסף גבס layer taken off reads the same,
    // figure for figure, row for row and word for word, but for its own line.
    const without = JSON.parse(device.run(`(function () {
        const copy = JSON.parse(JSON.stringify(State.schedule));
        Object.keys(copy.days).forEach(date => { delete copy.days[date].yosefGeves; });
        const held = State.schedule;
        State.schedule = copy;
        try {
            const facts = historyFacts();
            return JSON.stringify({ facts, text: historyText(facts) });
        } finally { State.schedule = held; }
    })()`));
    const withIt = { facts: device.facts(), text: device.text() };
    same('the record with every יוסף גבס count taken off reads the same - rows, counts, billing, men and text - but for that one figure',
        [without.text === withIt.text, JSON.stringify(Object.assign({}, without.facts, { site: Object.assign({}, without.facts.site, { yosef: 0 }) }))
            === JSON.stringify(Object.assign({}, withIt.facts, { site: Object.assign({}, withIt.facts.site, { yosef: 0 }) })),
        without.facts.site.yosef, withIt.facts.site.yosef > 0],
        [true, true, 0, true]);
    // One man at a site: no block, on the screen or in the text.
    device.choose('man', 'w_1');
    same('with one man and a site the block is absent, on the screen and in the text',
        [device.byId('historyTotals').querySelectorAll('.history-site').length, device.facts().site,
            plain(device.text()).indexOf(R.billing), plain(device.text()).indexOf(R.NO_RIMA_TOTAL)],
        [0, null, -1, -1]);
    device.run('closeHistory()');
}

// ================================================================== 6. the kinds, and 9. the text
//
// A hand-written record, every line of it written out here.
function kindsPhone() {
    const first = makeDevice({ deviceId: 'd_kinds' });
    first.setToday(TODAY);
    const S = first.State.schedule;
    S.workers = [{ id: 'w_a', name: 'אחמד נסאר', active: true }, { id: 'w_b', name: 'יוסי כהן', active: true },
        { id: 'w_c', name: 'סלים חורי', active: false }];
    S.places = [{ id: 'p_1', name: 'רמת גן', active: true }, { id: 'p_2', name: 'הרצליה', active: true },
        { id: 'p_3', name: 'נתניה', active: false }];
    const entry = (place, rate, hours) => first.call('makeEntry', place, rate, hours);
    const day = (date, id, entries) => first.call('setWorkerDay', S, date, id, 'actual', { entries });
    day('2026-10-29', 'w_b', [entry('p_1')]);
    day('2026-11-02', 'w_a', [entry('p_1')]);
    day('2026-11-02', 'w_b', [entry('p_1', 'extra', 2)]);
    day('2026-11-03', 'w_a', [entry('p_1', 'double'), entry('p_2')]);
    first.call('markAbsent', S, '2026-11-03', 'w_b', 'actual');
    day('2026-11-04', 'w_a', [entry('p_2', 'extra')]);
    day('2026-11-04', 'w_b', [entry('p_1', 'normal', 1)]);
    day('2026-11-05', 'w_a', [entry('p_1', 'extra', 3), entry('p_2', 'double')]);
    day('2026-11-06', 'w_c', [entry('p_3')]);
    day(TOMORROW, 'w_a', [entry('p_1')]);
    first.call('setRimaCount', S, '2026-11-02', 'p_1', 2);
    first.call('setYosefGevesCount', S, '2026-11-03', 'p_1', 4);
    return reopened(first, 'd_kinds');
}

{
    suite('6. the kinds, each a word from its owner');

    const device = kindsPhone();
    device.run('openHistory(null)');
    device.choose('range', 'thisMonth');
    const drawn = () => device.rowsDrawn().map(row => [row.dataset.historyKey,
        row.querySelectorAll('.history-day')[0].children.map(child => plain(child.textContent))]);
    const L6 = JSON.parse(device.run('JSON.stringify(RATE_LABELS)'));
    same('every site of his day by name, the day\'s kind, and the hours the pay counts',
        drawn(), [
            ['row:2026-11-06:w_c', ['נתניה', L6.normal]],
            ['row:2026-11-05:w_a', ['רמת גן', 'הרצליה', L6.double, '+3 ש׳']],
            ['row:2026-11-04:w_a', ['הרצליה', L6.extra]],
            ['row:2026-11-04:w_b', ['רמת גן', L6.normal, '+1 ש׳']],
            ['row:2026-11-03:w_a', ['רמת גן', 'הרצליה', L6.double]],
            ['row:2026-11-03:w_b', ['נעדר']],
            ['row:2026-11-02:w_a', ['רמת גן', L6.normal]],
            ['row:2026-11-02:w_b', ['רמת גן', L6.extra, '+2 ש׳']]]);
    same('the words are the model\'s own - RATE_LABELS - and the day screen\'s «נעדר»',
        [L6, source('js/ui/day.js').indexOf("el('span', 'tag tag-absent', 'נעדר')") !== -1],
        [{ normal: 'רגיל', extra: 'שעות נוספות', double: 'יום כפול' }, true]);
    same('a double is a heavier word, never only a colour; a site is painted and named',
        [device.rowsDrawn()[1].querySelectorAll('.history-kind-double').map(node => node.textContent),
            device.rowsDrawn()[1].querySelectorAll('.tag-place').map(node => [node.style.color, node.querySelectorAll('.site-name')[0].textContent])],
        [[L6.double], [['#fff', 'רמת גן'], ['#fff', 'הרצליה']]]);
    device.choose('man', 'w_a');
    device.choose('site', 'p_1');
    same('with a site chosen, the kind of HIS ENTRY THERE and «2 אתרים» from the day screen - the critic\'s day at the hours',
        drawn(), [['row:2026-11-05:w_a', ['רמת גן', L6.extra, '+3 ש׳', '2 אתרים']],
            ['row:2026-11-03:w_a', ['רמת גן', L6.double, '2 אתרים']],
            ['row:2026-11-02:w_a', ['רמת גן', L6.normal]]]);
    device.choose('site', 'p_2');
    same('and at the double', drawn(), [['row:2026-11-05:w_a', ['הרצליה', L6.double, '2 אתרים']],
        ['row:2026-11-04:w_a', ['הרצליה', L6.extra]], ['row:2026-11-03:w_a', ['הרצליה', L6.normal, '2 אתרים']]]);
    check('«2 אתרים» is the day screen\'s badge, word for word', source('js/ui/day.js')
        .indexOf("el('span', 'badge badge-split', '2 אתרים')") !== -1
        && device.rowsDrawn()[0].querySelectorAll('.badge-split').length === 1);
    same('each row is named in full: the date, the man, the sites and the kind, names isolated',
        device.rowsDrawn().map(row => row.getAttribute('aria-label')),
        [`יום חמישי 05/11/2026 · ${I('אחמד נסאר')} · ${I('הרצליה')} · יום כפול · 2 אתרים`,
            `יום רביעי 04/11/2026 · ${I('אחמד נסאר')} · ${I('הרצליה')} · שעות נוספות`,
            `יום שלישי 03/11/2026 · ${I('אחמד נסאר')} · ${I('הרצליה')} · רגיל · 2 אתרים`]);
    device.choose('man', 'w_b');
    device.choose('site', '');
    same('an absence has no site in its name', device.rowsDrawn().map(row => row.getAttribute('aria-label')),
        [`יום רביעי 04/11/2026 · ${I('יוסי כהן')} · ${I('רמת גן')} · רגיל · ${PLUS(1)} ש׳`,
            `יום שלישי 03/11/2026 · ${I('יוסי כהן')} · נעדר`,
            `יום שני 02/11/2026 · ${I('יוסי כהן')} · ${I('רמת גן')} · שעות נוספות · ${PLUS(2)} ש׳`]);
    device.run('closeHistory()');

    suite('9. the text, line for line, in each of the three views');

    device.run('openHistory(null)');
    device.choose('range', 'thisMonth');
    same('everyone, every site: the question, the dates, the five counts, both sentences, then the days',
        device.text().split('\n'), [
            '📄 כל העובדים · כל האתרים',
            L('01/11/2026 - 10/11/2026'),
            '',
            'ימי נוכחות: 7',
            'ימי עובד־אתר: 9',
            'כפולים: 2',
            'שעות נוספות: 6',
            'נעדר: 1',
            'עובד בשני אתרים נספר פעם אחת בכל אתר; ימי עובד־אתר אינם ימי נוכחות ואינם ימי שכר — אין לצפות שהסכומים יתאימו.',
            'עובדי רימא לא נספרים כאן. כדי לראות גם אותם, בחר אתר.',
            '',
            'נובמבר 2026 · 7 ימי נוכחות',
            `• שישי 06/11 - ${I('סלים חורי')} - ${I('נתניה')} · רגיל`,
            `• חמישי 05/11 - ${I('אחמד נסאר')} - ${I('רמת גן')} + ${I('הרצליה')} · יום כפול · ${PLUS(3)} ש׳`,
            `• רביעי 04/11 - ${I('אחמד נסאר')} - ${I('הרצליה')} · שעות נוספות`,
            `• רביעי 04/11 - ${I('יוסי כהן')} - ${I('רמת גן')} · רגיל · ${PLUS(1)} ש׳`,
            `• שלישי 03/11 - ${I('אחמד נסאר')} - ${I('רמת גן')} + ${I('הרצליה')} · יום כפול`,
            `• שלישי 03/11 - ${I('יוסי כהן')} - נעדר`,
            `• שני 02/11 - ${I('אחמד נסאר')} - ${I('רמת גן')} · רגיל`,
            `• שני 02/11 - ${I('יוסי כהן')} - ${I('רמת גן')} · שעות נוספות · ${PLUS(2)} ש׳`]);
    same('and the screen says the same counts', device.byId('historyTotals').querySelectorAll('.history-tile')
        .map(tile => [tile.dataset.tile, tile.children.map(child => child.textContent)]),
    [['attendance', ['ימי נוכחות', '7']], ['siteDays', ['ימי עובד־אתר', '9']], ['doubleDays', ['כפולים', '2']],
        ['extraHours', ['שעות נוספות', '6']], ['absent', ['נעדר', '1']]]);
    device.choose('man', 'w_a');
    device.choose('site', 'p_1');
    same('one man at a site: his count, his days at it, no billing, no Rima sentence, no name on a row',
        device.text().split('\n'), [
            `📄 ${I('אחמד נסאר')} · ${I('רמת גן')}`,
            L('01/11/2026 - 10/11/2026'),
            '',
            'ימי עובד־אתר: 3',
            '',
            'נובמבר 2026',
            `• חמישי 05/11 - ${I('רמת גן')} · שעות נוספות · ${PLUS(3)} ש׳ · 2 אתרים`,
            `• שלישי 03/11 - ${I('רמת גן')} · יום כפול · 2 אתרים`,
            `• שני 02/11 - ${I('רמת גן')} · רגיל`]);
    device.choose('man', '');
    same('everyone at a site: the billing with Rima\'s lines and note, never יוסף גבס, «מי עבד באתר», then the days',
        device.text().split('\n'), [
            `📄 כל העובדים · ${I('רמת גן')}`,
            L('01/11/2026 - 10/11/2026'),
            '',
            `חיוב - ${I('רמת גן')}`,
            'סה״כ ימי עובד־אתר: 7',
            'בלי עובדי רימא: 5',
            'סה״כ עובדי רימא: 2',
            'עובדי רימא בלבד. אינם נכללים בשכר. בחיוב שלמעלה כל אחד מהם נספר כיום עובד־אתר אחד.',
            '',
            'מי עבד באתר',
            `${I('אחמד נסאר')} · 3 ימים`,
            `${I('יוסי כהן')} · 2 ימים`,
            '',
            'נובמבר 2026',
            `• חמישי 05/11 - ${I('אחמד נסאר')} - ${I('רמת גן')} · שעות נוספות · ${PLUS(3)} ש׳ · 2 אתרים`,
            `• רביעי 04/11 - ${I('יוסי כהן')} - ${I('רמת גן')} · רגיל · ${PLUS(1)} ש׳`,
            `• שלישי 03/11 - ${I('אחמד נסאר')} - ${I('רמת גן')} · יום כפול · 2 אתרים`,
            `• שני 02/11 - ${I('אחמד נסאר')} - ${I('רמת גן')} · רגיל`,
            `• שני 02/11 - ${I('יוסי כהן')} - ${I('רמת גן')} · שעות נוספות · ${PLUS(2)} ש׳`]);
    device.choose('man', 'w_b');
    device.choose('site', '');
    device.choose('range', 'last3');
    same('one man, three months: two months each under its own heading, and no Rima sentence with one man',
        device.text().split('\n'), [
            `📄 ${I('יוסי כהן')} · כל האתרים`,
            L('01/09/2026 - 10/11/2026'),
            '',
            'ימי נוכחות: 3',
            'ימי עובד־אתר: 3',
            'כפולים: 0',
            'שעות נוספות: 3',
            'נעדר: 1',
            '',
            'נובמבר 2026 · 2 ימי נוכחות',
            `• רביעי 04/11 - ${I('רמת גן')} · רגיל · ${PLUS(1)} ש׳`,
            '• שלישי 03/11 - נעדר',
            `• שני 02/11 - ${I('רמת גן')} · שעות נוספות · ${PLUS(2)} ש׳`,
            '',
            'אוקטובר 2026 · יום נוכחות אחד',
            `• חמישי 29/10 - ${I('רמת גן')} · רגיל`]);
    device.choose('man', 'w_a');
    device.choose('range', 'custom');
    device.dates('2026-11-07', '2026-11-08');
    same('and nothing found says so, with no cut line', device.text().split('\n').slice(-2), ['', 'לא נמצא אף יום שמתאים לבחירה.']);
    same('the screen says it too', [device.byId('historyList').textContent, device.rowsDrawn().length],
        ['לא נמצא אף יום שמתאים לבחירה.', 0]);
    device.run('closeHistory()');
}

// ================================================================== 7. nothing after today
{
    suite('7. nothing after today: tomorrow\'s typed seder is in no row, count, block or line');

    const device = seeded(33);
    const bad = [];
    ['thisMonth', 'lastMonth', 'last3', 'thisYear', 'all'].forEach(key => {
        [[null, null], ['w_1', null], [null, 'p_1'], ['w_1', 'p_1']].forEach(([man, place]) => {
            const read = device.read({ workerId: man, placeId: place, range: key });
            if (read.to > TODAY || read.rows.some(row => row.date > TODAY) || read.months.some(month => month.key > TODAY.slice(0, 7))) {
                bad.push([key, man, place, 'rows']);
            }
            if (read.site) {
                const billed = JSON.parse(device.run(`JSON.stringify(invoiceByDate(State.schedule, ${JSON.stringify(read.from)}, ${JSON.stringify(read.to)}).places.find(row => row.placeId === 'p_1').workerDays)`));
                if (read.site.billed !== billed) bad.push([key, man, place, 'billed']);
            }
        });
    });
    same('on every range, for one man and everyone, at a site and at every site, nothing dated after today', bad, []);
    device.run('openHistory(null)');
    device.choose('range', 'thisMonth');
    device.choose('site', 'p_1');
    check('and no line of the text names tomorrow', plain(device.text()).indexOf('11/11') === -1, plain(device.text()).slice(0, 120));
    device.choose('range', 'custom');
    device.dates('2026-11-01', '2026-12-31');
    same('a custom range ending after today is read to today, the field written back and the line saying it',
        [device.byId('historyTo').value, plain(device.byId('historyRangeNow').textContent).slice(-23), device.facts().to],
        [TODAY, '01/11/2026 - 10/11/2026', TODAY]);
    device.run('closeHistory()');
}

// ================================================================== 8. the names
{
    suite('8. the names: an unlisted site as the day screen numbers it, archived men and sites, a man who left');

    const device = seeded(11);
    const map = JSON.parse(device.run('JSON.stringify([...placeLabelsIn(State.schedule)])'));
    const label = id => (map.find(pair => pair[0] === id) || [])[1];
    given('the day screen\'s map names the two unlisted sites', label('p_8') && label('p_9'), JSON.stringify(map));
    const named = range => device.read({ workerId: 'w_2', placeId: null, range }).rows
        .filter(row => row.date === '2026-10-05')[0].sites.map(site => site.name);
    same('«אתר שאינו ברשימה N» with the day screen\'s N - in the default range, which leaves the other one\'s days out, and over the year',
        [named('last3'), named('thisYear'), named('all'), label('p_9')],
        [[label('p_9')], [label('p_9')], [label('p_9')], 'אתר שאינו ברשימה 2']);
    const spanned = JSON.parse(device.run(`JSON.stringify([...placeLabelsIn(State.schedule, '2026-09-01', '${TODAY}')].find(pair => pair[0] === 'p_9'))`));
    check('(a map over that range alone would have called it 1 - which is why there is one map)', spanned[1] === 'אתר שאינו ברשימה 1', String(spanned));
    device.run('openHistory(null)');
    const facts = device.facts();
    same('«אתר» offers every site, the active ones, then the archived one marked - and no unlisted site',
        facts.siteOptions.map(option => [option.value, plain(option.text)]),
        [['', 'כל האתרים'], ['p_1', 'אתר 11-1'], ['p_2', 'אתר 11-2'], ['p_3', 'אתר 11-3'], ['p_4', 'אתר 11-4 · לא פעיל']]);
    const last = device.State.schedule.workers[device.State.schedule.workers.length - 1];
    same('«עובד» offers everyone, the daily list, then the man turned off, marked',
        facts.manOptions.slice(-2).map(option => [option.value, plain(option.text)]).concat([facts.manOptions[0].text]),
        [[device.State.schedule.workers[device.State.schedule.workers.length - 2].id, device.State.schedule.workers[device.State.schedule.workers.length - 2].name],
            [last.id, `${last.name} · לא פעיל`], 'כל העובדים']);
    same('the select holds those options, drawn', device.byId('historySite').children.map(option => option.value),
        ['', 'p_1', 'p_2', 'p_3', 'p_4']);
    device.choose('man', last.id);
    device.choose('site', 'p_4');
    device.choose('range', 'thisYear');
    same('an archived man and an archived site are chosen and read like any other', [device.facts().workerId, device.facts().placeId,
        device.facts().rows.length > 0, device.facts().rows.every(row => row.workerId === last.id && row.sites[0].id === 'p_4')],
    [last.id, 'p_4', true, true]);
    // He and the site leave the record under the open dialog.
    device.State.schedule.workers = device.State.schedule.workers.filter(worker => worker.id !== last.id);
    device.State.schedule.places = device.State.schedule.places.filter(place => place.id !== 'p_4');
    device.run('renderHistoryIfOpen()');
    same('a man or a site that leaves the record under it falls back to «כל העובדים» / «כל האתרים»',
        [device.run('HISTORY.workerId'), device.run('HISTORY.placeId'), device.byId('historyMan').value, device.byId('historySite').value,
            plain(device.byId('historyRangeNow').textContent).split(' · ').slice(0, 2)],
        [null, null, '', '', ['כל העובדים', 'כל האתרים']]);
    device.run('closeHistory()');
}

// ================================================================== 9. the cap, and 10. the chunks
//
// A season: 40 men, 6 sites, a year of days without Saturdays, Rima on two sites, יוסף גבס on
// one (the record the contract's budget was measured on).
function seasonPhone() {
    const today = '2026-11-19';
    const rand = mulberry(20261119);
    const pick = list => list[Math.floor(rand() * list.length)];
    const NAMES = ['מוחמד אבו ראס חוסיין', 'אחמד נסאר', "סאמר ח'טיב", 'איברהים עודה', 'חאלד סלאמה', 'וליד זועבי', 'ראמי חורי',
        'דוד כהן', 'עלי חסן', 'יוסי מזרחי', 'רון לוי', 'מאיר ביטון', 'נועם פרץ', 'אבי דהן'];
    const SITES = ['הרצליה - מגדל הים', 'תל אביב - רוטשילד', 'רמת גן', 'נתניה - עיר ימים', 'פתח תקווה', 'ראשון לציון - מערב'];
    const first = makeDevice({ deviceId: 'd_season' });
    const S = first.State.schedule;
    S.places = SITES.map((name, n) => ({ id: `p_${n + 1}`, name, active: n !== 5 }));
    S.workers = [];
    const days = datesBetween('2025-11-20', today).filter(date => weekdayOf(date) !== 6);
    for (let n = 1; n <= 40; n += 1) {
        const id = `w_${String(n).padStart(2, '0')}`;
        S.workers.push(Object.assign({ id, name: `${NAMES[n % NAMES.length]} ${n}`, active: n !== 40,
            dailyRate: pick([380, 420, 450, 500]), hourlyRate: pick([0, 45, 50]) }, n <= 16 ? { payCycles: '2026-01-02=weekly' } : {}));
        const home = `p_${1 + (n % 6)}`;
        days.forEach(date => {
            if (rand() > 0.85) return;
            if (rand() < 0.02) { first.call('markAbsent', S, date, id, 'actual'); return; }
            const r = rand();
            if (r < 0.03) first.call('assignPlace', S, date, id, 'actual', home, 'double');
            else if (r < 0.08) first.call('assignPlace', S, date, id, 'actual', home, 'extra', 1 + Math.floor(rand() * 3));
            else first.call('assignPlace', S, date, id, 'actual', home, 'normal');
            if (rand() < 0.05) first.call('assignPlace', S, date, id, 'actual', `p_${1 + ((n + 3) % 6)}`, 'normal');
        });
    }
    days.forEach(date => {
        if (rand() < 0.4) first.call('setRimaCount', S, date, 'p_1', 1 + Math.floor(rand() * 4));
        if (rand() < 0.3) first.call('setRimaCount', S, date, 'p_3', 1 + Math.floor(rand() * 3));
        if (rand() < 0.3) first.call('setYosefGevesCount', S, date, 'p_2', 1 + Math.floor(rand() * 5));
    });
    const device = reopened(first, 'd_season', { today });
    device.today = today;
    return device;
}

const season = seasonPhone();
// «השנה» - the year the contract's budget table calls "a year" (01/01 to the season's today).
const YEAR = { range: 'thisYear', from: null, to: null };
{
    suite('9. the text\'s cap, on a season');

    given('the season holds about a year of 40 men', Object.keys(season.State.schedule.days).length === 313
        && season.State.schedule.workers.length === 40, String(Object.keys(season.State.schedule.days).length));
    season.run(`openHistory(null)`);
    season.choose('range', 'thisYear');
    const facts = season.facts();
    const pay = paySums(season, facts.from, facts.to, null);
    console.log(`      the season's year: ${facts.rows.length} rows; ${facts.tiles.map(tile => `${tile.id} ${tile.value}`).join(', ')}`);
    same('on the season, the year\'s five counts are the pay sheet\'s own sums', facts.tiles, pay);
    const text = season.text();
    const lines = text.split('\n');
    const rowLines = lines.filter(line => line.startsWith('• '));
    const cut = lines[lines.length - 1];
    same('a year of everyone: within 60,000 characters, ending with the line that says how many rows of how many',
        [text.length <= 60000, cut, lines[lines.length - 2]],
        [true, `ההודעה כוללת רק את ${rowLines.length} השורות החדשות ביותר מתוך ${facts.rows.length}, כי כל הרשימה ארוכה מדי להודעה אחת. כדי לקבל את כולן, בחר טווח קצר יותר, אתר או עובד.`, '']);
    check('it holds whole rows only, and almost all the room - one more row would not have fit',
        rowLines.length > 900 && rowLines.length < facts.rows.length && text.length > 59000
        && rowLines.every(line => / - .+ · (רגיל|שעות נוספות|יום כפול)|- נעדר$/.test(plain(line))), `${rowLines.length} rows, ${text.length}`);
    const screenKeys = season.rowsDrawn().map(row => row.dataset.historyKey);
    const firstLines = JSON.parse(season.run(`(function () { const facts = historyFacts();
        return JSON.stringify(facts.rows.slice(0, 200).map(row => historyRowLine(row, facts))); })()`));
    same('and its rows begin with the screen\'s rows, in the same order, line for line',
        [screenKeys, rowLines.slice(0, 200)], [facts.rows.slice(0, 200).map(row => `row:${row.date}:${row.workerId}`), firstLines]);
    season.choose('range', 'thisMonth');
    season.choose('man', 'w_05');
    check('a short query has no cut line', season.text().indexOf('ההודעה כוללת רק') === -1 && season.text().length < 60000);

    suite('10. the chunks: 200 at a time, never more than 600');

    season.choose('man', '');
    season.choose('range', 'thisYear');
    const total = season.facts().rows.length;
    const foot = () => season.byId('historyList').querySelectorAll('.history-foot')[0].children.map(child => child.textContent);
    same('the first draw shows 200 rows, «מוצגות 200 שורות מתוך N.» and «הצג עוד 200»',
        [season.rowsDrawn().length, foot()], [200, ['לחיצה על יום פותחת אותו במסך היום.', `מוצגות 200 שורות מתוך ${total}.`, 'הצג עוד 200']]);
    const firstChunk = season.rowsDrawn();
    season.run('historyMore()');
    same('«הצג עוד» draws 200 more under them', [season.rowsDrawn().length, foot().slice(1)],
        [400, [`מוצגות 400 שורות מתוך ${total}.`, 'הצג עוד 200']]);
    check('and the 200 drawn before are the same nodes, where they were - only the new days and the foot are built',
        season.rowsDrawn().slice(0, 200).every((node, at) => node === firstChunk[at]));
    season.run('historyMore()');
    same('up to 600 - and there no «הצג עוד», the line that says to narrow it', [season.rowsDrawn().length, foot().slice(1)],
        [600, [`מוצגות 600 השורות החדשות ביותר מתוך ${total}. כדי לראות את השאר, בחר טווח קצר יותר, אתר או עובד.`]]);
    season.run('historyMore()');
    same('and once more is nothing more', [season.rowsDrawn().length, season.run('HISTORY.shown')], [600, 600]);
    same('the drawn rows are the reading\'s first 600, in its order', season.rowsDrawn().map(row => row.dataset.historyKey),
        season.facts().rows.slice(0, 600).map(row => `row:${row.date}:${row.workerId}`));
    const headings = season.byId('historyList').querySelectorAll('.history-month').map(node => [node.dataset.month, plain(node.textContent)]);
    const months = season.facts().months;
    same('a month\'s heading carries the month\'s whole count with no site, whatever is drawn of it yet',
        headings.slice(0, 2), months.slice(0, 2).map(month => [month.key,
            `${['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'][Number(month.key.slice(5)) - 1]} ${month.key.slice(0, 4)} · ${month.attendance} ימי נוכחות`]));
    season.choose('site', 'p_1');
    same('and none with a site', season.byId('historyList').querySelectorAll('.history-month').map(node => plain(node.textContent)).slice(0, 2),
        ['נובמבר 2026', 'אוקטובר 2026']);
    same('a new choice starts again at 200', season.rowsDrawn().length, 200);
    season.run('closeHistory()');
}

// ================================================================== 11. the finder's door
{
    suite('11. the finder\'s door: last on every man it finds, with this file loaded');

    const device = kindsPhone();
    const rows = () => device.byId('findList').querySelectorAll('.find-row').map(row => ({ id: row.dataset.workerId,
        doors: row.querySelectorAll('.find-door').map(node => [node.dataset.findDoor, node.textContent, plain(node.getAttribute('aria-label'))]) }));
    device.State.date = TODAY;
    device.run('openFind()');
    const found = rows();
    same('a man on the daily list: «כרטיס עובד», «שיבוץ להיום», «מקדמות», «איפה עבד» - the last named for him',
        found[0].doors, [['card', 'כרטיס עובד', 'כרטיס עובד · אחמד נסאר'], ['sheet', 'שיבוץ להיום', 'שיבוץ להיום · אחמד נסאר'],
            ['advances', 'מקדמות', 'מקדמות · אחמד נסאר'], ['history', 'איפה עבד', 'איפה עבד · אחמד נסאר']]);
    same('a man turned off: «כרטיס עובד», «מקדמות», «איפה עבד»', found[2].doors.map(door => door[1]),
        ['כרטיס עובד', 'מקדמות', 'איפה עבד']);
    device.byId('findInput').value = 'אחמד';
    device.run('findGo("history", "w_a")');
    same('«איפה עבד» shuts the finder, field empty, and opens the dialog on him, every site, «3 החודשים האחרונים», entered at its title',
        [device.byId('findModal').style.display, device.byId('findInput').value, device.byId('historyModal').style.display,
            JSON.parse(device.run('JSON.stringify([HISTORY.workerId, HISTORY.placeId, HISTORY.range])')), device.focused],
        ['none', '', 'flex', ['w_a', null, 'last3'], ['historyTitle']]);
    device.run('closeHistory()');
    device.run('openFind()');
    device.run('findGo("history", "w_nobody")');
    same('a man who left the record between the list and the tap opens nothing',
        [device.byId('findModal').style.display, device.byId('historyModal').style.display, device.run('HISTORY')], ['none', 'none', null]);
    same('and openHistory itself refuses a man the record has not got', [device.run('openHistory("w_nobody")'),
        device.byId('historyModal').style.display], [false, 'none']);

    const base = withHistory(makeDevice({ deviceId: 'd_base' }), { history: false });
    base.State.schedule.workers = [{ id: 'w_1', name: 'דוגמה', active: true }, { id: 'w_2', name: 'כבוי', active: false }];
    base.State.date = TODAY;
    base.run('openFind()');
    same('without js/ui/history.js the finder draws its three doors, as on the base',
        base.byId('findList').querySelectorAll('.find-row').map(row => row.querySelectorAll('.find-door').map(node => node.textContent)),
        [['כרטיס עובד', 'שיבוץ להיום', 'מקדמות'], ['כרטיס עובד', 'מקדמות']]);
    check('and asks for this file only through typeof, with no Hebrew of its own and no new word in FIND_TEXT',
        source('js/ui/find.js').indexOf("if (typeof HISTORY_TEXT === 'object' && typeof openHistory === 'function') door('history', HISTORY_TEXT.door);") !== -1
        && source('js/ui/find.js').indexOf("if (typeof openHistory === 'function') openHistory(worker.id);") !== -1
        && base.run('Object.keys(FIND_TEXT).join()') === 'sheetToday,sheetDay,doorFor');
}

// ================================================================== 12. it writes nothing
{
    suite('12. opening it, every choice, every door and the close leave every byte on the disk where it was');

    const device = seeded(22);
    const disk = JSON.stringify(device.dump());
    const record = JSON.stringify(device.State.schedule);
    given('there is a record on the disk', Object.keys(device.dump()).length > 0);
    const touched = [];
    device.setQuota(key => { touched.push(`set ${key}`); return false; });
    device.blockRemoval(key => { touched.push(`remove ${key}`); return false; });
    [null].concat(device.State.schedule.workers.map(worker => worker.id)).forEach(id => {
        device.run(`openHistory(${JSON.stringify(id)})`);
        ['thisMonth', 'lastMonth', 'thisYear', 'all', 'custom', 'last3'].forEach(range => device.choose('range', range));
        ['p_1', 'p_2', 'p_4', ''].forEach(place => device.choose('site', place));
        device.choose('range', 'custom');
        device.dates('2026-05-01', '2026-05-31');
        device.dates('2026-06-01', '2026-05-01');
        device.dates('2026-05-01', '2027-01-01');
        device.run('historyMore(); historyToggleText(); historySend(); historyCopy(); renderHistoryIfOpen(); historyToggleText();');
        device.run('closeHistory()');
    });
    device.run('openHistory(null)');
    device.run(`historyGoDay(${JSON.stringify('2026-10-05')}, 'row:2026-10-05:w_1')`);
    same('a row\'s door closes the dialog and puts the day screen on that date - nothing else', [device.byId('historyModal').style.display,
        device.State.date, device.views.slice(-1)], ['none', '2026-10-05', ['day']]);
    check('not one write reached the disk', touched.length === 0, touched.slice(0, 5).join(', '));
    check('every key holds the bytes it held', JSON.stringify(device.dump()) === disk);
    check('the record in memory is the record it was', JSON.stringify(device.State.schedule) === record);
    same('the refused pair asked in the reports\' own words, and the doors were the day message\'s own',
        [device.told.length > 0 && device.told.every(told => told.title === 'הטווח הפוך'),
            device.shared.filter(one => one[0] === 'share').length > 0, device.shared.filter(one => one[0] === 'copy').length > 0],
        [true, true, true]);
    device.State.commit(device.call('assignPlace', device.State.schedule, TODAY, 'w_1', 'actual', 'p_3'));
    check('the same recorder notices a real commit', touched.length > 0 && JSON.stringify(device.dump()) !== disk);

    suite('12. with «בניית סידור» at its first station, a day\'s door asks - and only a yes moves the journey\'s own key');

    const evening = withHistory(makeDevice({ deviceId: 'd_journey' }), { journey: true });
    evening.State.schedule.workers = [{ id: 'w_1', name: 'דוגמה', active: true }];
    evening.State.schedule.places = [{ id: 'p_1', name: 'אתר', active: true }];
    evening.call('assignPlace', evening.State.schedule, '2026-10-12', 'w_1', 'actual', 'p_1');
    evening.State.save({ silent: true });
    let started = null;
    try { started = evening.run('journeyStart() && journeyStation()'); } catch (error) { started = String(error && error.message); }
    // The journey's own entry, on the harness's DOM: it has no frame to draw here, and draws
    // none - its state and its key are what this asks about (the page is the browser suite's).
    check('«בניית סידור» opens at its first station on the device', started === 1, String(started));
    if (started === 1) {
        const before = JSON.stringify(evening.dump());
        const kept = JSON.parse(evening.raw('farkadSederJourney'));
        const date = evening.State.date;
        evening.run('openHistory("w_1")');
        evening.answer = false;
        let answered = null;
        evening.run(`historyGoDay('2026-10-12', 'row:2026-10-12:w_1')`).then(value => { answered = value; });
        await new Promise(resolve => setTimeout(resolve, 20));
        same('it asks, over the dialog, in the block\'s words - the row\'s day and the journey\'s named',
            evening.asked.map(asked => [asked.title, asked.message, asked.ok]),
            [['לצאת מבניית הסידור?', `כדי לפתוח את יום שני 12/10/2026 צריך לצאת מבניית הסידור ל${'יום רביעי 11/11/2026'}. אפשר לחזור אליה אחר כך מ«בניית סידור».`,
                'צא ופתח את היום']]);
        same('«ביטול»: nothing at all - every key, the date on screen, the journey and the dialog as they were',
            [answered, JSON.stringify(evening.dump()) === before, evening.State.date, evening.run('journeyStation()'),
                evening.run('journeyDate()'), evening.byId('historyModal').style.display],
            [false, true, date, 1, kept.date, 'flex']);
        evening.answer = true;
        const at = Date.now();
        evening.run(`historyGoDay('2026-10-12', 'row:2026-10-12:w_1')`).then(value => { answered = value; });
        await new Promise(resolve => setTimeout(resolve, 20));
        const now = evening.dump();
        const moved = Object.keys(now).filter(key => now[key] !== JSON.parse(before)[key]);
        const left = JSON.parse(now.farkadSederJourney);
        same('a yes: the ONLY key that moved is the journey\'s, as journeyLeave leaves it - same version, date and station, shut, a fresh time',
            [answered, moved, left.version, left.date, left.station, left.open, left.at >= at],
            [true, ['farkadSederJourney'], kept.version, kept.date, kept.station, false, true]);
        same('and the day screen is on the row\'s date, the journey off the screen, the dialog shut',
            [evening.State.date, evening.run('journeyStation()'), evening.views.slice(-1), evening.byId('historyModal').style.display],
            ['2026-10-12', 0, ['day'], 'none']);
        check('the journey\'s name in the question is the journey\'s own', evening.run('JOURNEY_TEXT.entry') === 'בניית סידור'
            && evening.asked[0].message.indexOf(`«${evening.run('JOURNEY_TEXT.entry')}»`) !== -1);
    }

    const code = HISTORY_JS.split('\n').filter(line => line.trim().indexOf('//') !== 0)
        .map(line => line.replace(/\s\/\/ .*$/, '')).join('\n');
    const writers = code.match(new RegExp([
        '\\bStore\\b', 'localStorage', 'sessionStorage', 'indexedDB', '\\.commit', 'commitMany', 'commitRoster',
        '\\.save\\(', '\\.persist\\(', 'FarkadSync', '\\bfetch\\(', 'window\\.open', '\\brecord[A-Z]\\w*\\(',
        'addAdvance', 'removeAdvance', 'assignPlace', 'markAbsent', 'setWorkerDay', 'setRimaCount', 'setYosefGevesCount',
        'innerHTML', '\\balert\\(', '\\bconfirm\\(', '\\bprompt\\('
    ].join('|'), 'g')) || [];
    same('its code calls nothing that writes, and puts no name into markup', writers, []);
    const body = name => { const at = code.indexOf(`function ${name}(`); return code.slice(at, code.indexOf('\n}\n', at)); };
    same('State.date is set in one place - a row\'s door - and journeyLeave called there only, after the answer',
        [(code.match(/State\.date\s*=/g) || []).length, body('historyGoDay').indexOf('State.date = date;') !== -1,
            (code.match(/journeyLeave\(\)/g) || []).length, /if \(leave && journeyOpen\(\) && typeof journeyLeave === 'function'\) journeyLeave\(\);/.test(body('historyGoDay')),
            /return go\(true\);/.test(body('historyGoDay')) && (body('historyGoDay').match(/go\(true\)/g) || []).length === 1],
        [1, true, 1, true, true]);
}

// ================================================================== 13. the words
{
    suite('13. every new word, word for word - proposed, for the owner to approve');

    const device = withHistory(makeDevice({ deviceId: 'd_words' }));
    const T = key => device.run(`HISTORY_TEXT.${key}`);
    same('the plain words', ['title', 'door', 'man', 'site', 'last3', 'thisYear', 'all', 'asText', 'noRima', 'dayOne', 'dayMany',
        'empty', 'tooLongForLink', 'leaveTitle', 'leaveOk'].map(T), [
        'מי עבד איפה', 'איפה עבד', 'עובד', 'אתר', '3 החודשים האחרונים', 'השנה', 'מתחילת הרישום', 'הרשימה כטקסט',
        'עובדי רימא לא נספרים כאן. כדי לראות גם אותם, בחר אתר.', 'יום אחד', 'ימים', 'לא נמצא אף יום שמתאים לבחירה.',
        '⚠️ הרשימה ארוכה מדי לקישור של וואטסאפ - השתמש בהעתק ושלח ידנית', 'לצאת מבניית הסידור?', 'צא ופתח את היום']);
    same('and the templates', [
        device.run('HISTORY_TEXT.now("אחמד", "כל האתרים", "01/09/2026 - 19/11/2026")'),
        device.run('HISTORY_TEXT.month("נובמבר", 2026, "3 ימי נוכחות")'), device.run('HISTORY_TEXT.month("נובמבר", 2026, null)'),
        device.run('HISTORY_TEXT.who("אחמד", "3 ימים")'),
        device.run('HISTORY_TEXT.rowName("יום שני 12/10/2026", "אחמד", "רמת גן", "רגיל")'),
        device.run('HISTORY_TEXT.rowName("יום שני 12/10/2026", "אחמד", "", "נעדר")'),
        device.run('HISTORY_TEXT.shown(200, 9412)'), device.run('HISTORY_TEXT.more(200)'), device.run('HISTORY_TEXT.capped(600, 9412)'),
        device.run('HISTORY_TEXT.textHead("כל העובדים", "רמת גן")'), device.run('HISTORY_TEXT.textCut(1072, 9412)'),
        device.run('HISTORY_TEXT.leaveMessage("יום שני 12/10/2026", "יום שישי 20/11/2026", "בניית סידור")'),
        device.run('HISTORY_TEXT.leaveMessage("יום שני 12/10/2026", "יום שישי 20/11/2026", "")')], [
        'אחמד · כל האתרים · 01/09/2026 - 19/11/2026', 'נובמבר 2026 · 3 ימי נוכחות', 'נובמבר 2026', 'אחמד · 3 ימים',
        'יום שני 12/10/2026 · אחמד · רמת גן · רגיל', 'יום שני 12/10/2026 · אחמד · נעדר',
        'מוצגות 200 שורות מתוך 9412.', 'הצג עוד 200',
        'מוצגות 600 השורות החדשות ביותר מתוך 9412. כדי לראות את השאר, בחר טווח קצר יותר, אתר או עובד.',
        '📄 כל העובדים · רמת גן',
        'ההודעה כוללת רק את 1072 השורות החדשות ביותר מתוך 9412, כי כל הרשימה ארוכה מדי להודעה אחת. כדי לקבל את כולן, בחר טווח קצר יותר, אתר או עובד.',
        'כדי לפתוח את יום שני 12/10/2026 צריך לצאת מבניית הסידור ליום שישי 20/11/2026. אפשר לחזור אליה אחר כך מ«בניית סידור».',
        'כדי לפתוח את יום שני 12/10/2026 צריך לצאת מבניית הסידור ליום שישי 20/11/2026.']);
    same('and those are all it adds', device.run('Object.keys(HISTORY_TEXT).join()'),
        'title,door,man,site,last3,thisYear,all,now,asText,noRima,dayOne,dayMany,empty,month,who,rowName,shown,more,capped,textHead,textCut,tooLongForLink,leaveTitle,leaveMessage,leaveOk');
    check('the block is frozen', device.run('Object.isFrozen(HISTORY_TEXT) && Object.isFrozen(HISTORY_REUSED)'));
    same('the constants', JSON.parse(device.run('JSON.stringify([HISTORY_CHUNK, HISTORY_SHOWN_MAX, HISTORY_TEXT_MAX, HISTORY_LINK_MAX])')),
        [200, 600, 60000, 8000]);

    // Each borrowed word in its owner's source, as that screen says it.
    const reused = JSON.parse(device.run(`JSON.stringify(Object.assign({}, HISTORY_REUSED, { hours: HISTORY_REUSED.hours(2) }))`));
    const owners = {
        allMen: ['js/ui/reports.js', "? 'כל העובדים'", 'כל העובדים'],
        allSites: ['js/ui/reports.js', "chip('כל האתרים', null)", 'כל האתרים'],
        inactive: ['js/ui/roster.js', "el('span', 'badge', 'לא פעיל')", 'לא פעיל'],
        range: ['js/ui/reports.js', "range: 'תקופה',", 'תקופה'],
        thisMonth: ['js/ui/reports.js', "presetChip('month', 'החודש', () => setMonthRange(0))", 'החודש'],
        lastMonth: ['js/ui/reports.js', "presetChip('lastmonth', 'חודש שעבר', () => setMonthRange(-1))", 'חודש שעבר'],
        custom: ['js/ui/reports.js', "presetChip('custom', 'תאריכים אחרים', () => {})", 'תאריכים אחרים'],
        from: ['js/ui/reports.js', "key === 'from' ? 'מתאריך' : 'עד תאריך'", 'מתאריך'],
        to: ['js/ui/reports.js', "key === 'from' ? 'מתאריך' : 'עד תאריך'", 'עד תאריך'],
        invertedTitle: ['js/ui/reports.js', "title: 'הטווח הפוך',", 'הטווח הפוך'],
        invertedMessage: ['js/ui/reports.js', "message: 'תאריך ההתחלה מאוחר מתאריך הסיום, ולכן הוא לא שונה. ' +\n                        'בחר קודם את תאריך ההתחלה ואז את הסיום.'",
            'תאריך ההתחלה מאוחר מתאריך הסיום, ולכן הוא לא שונה. בחר קודם את תאריך ההתחלה ואז את הסיום.'],
        attendance: ['js/ui/reports.js', "countedIn(summary.attendanceDays, 'יום נוכחות אחד', 'ימי נוכחות')", 'ימי נוכחות'],
        attendanceOne: ['js/ui/reports.js', "countedIn(summary.attendanceDays, 'יום נוכחות אחד', 'ימי נוכחות')", 'יום נוכחות אחד'],
        siteDays: ['js/ui/reports.js', "siteDays: 'ימי עובד־אתר',", 'ימי עובד־אתר'],
        doubles: ['js/ui/reports.js', "{ header: 'כפולים', value: row => row.doubleDays }", 'כפולים'],
        extraHours: ['js/ui/reports.js', "{ header: 'שעות נוספות', value: row => row.extraHours }", 'שעות נוספות'],
        absent: ['js/ui/reports.js', "{ header: 'נעדר', value: row => row.absent }", 'נעדר'],
        twoSites: ['js/ui/reports.js', "'עובד בשני אתרים נספר פעם אחת בכל אתר; ימי עובד־אתר אינם ימי נוכחות ואינם ' +\n        'ימי שכר — אין לצפות שהסכומים יתאימו.'",
            'עובד בשני אתרים נספר פעם אחת בכל אתר; ימי עובד־אתר אינם ימי נוכחות ואינם ימי שכר — אין לצפות שהסכומים יתאימו.'],
        split: ['js/ui/day.js', "el('span', 'badge badge-split', '2 אתרים')", '2 אתרים'],
        hours: ['js/ui/reports.js', '`${name} (${plusAmount(hours)} ש׳)`', `${PLUS(2)} ש׳`]
    };
    same('the borrowed words are exactly these', Object.keys(reused).sort(), Object.keys(owners).sort());
    same('each is in its owner\'s source, and says here what it says there',
        Object.keys(owners).filter(key => source(owners[key][0]).indexOf(owners[key][1]) === -1 || reused[key] !== owners[key][2]), []);
    check('«נעדר» is the day screen\'s word for an absence too', source('js/ui/day.js').indexOf("el('span', 'tag tag-absent', 'נעדר')") !== -1);
    // The ones read from their owners' constants at the moment they are drawn.
    const owned = JSON.parse(device.run(`JSON.stringify([MONTH_SUMMARY_REUSED.close, MONTH_SUMMARY_REUSED.send, MONTH_SUMMARY_REUSED.copy,
        SITE_CARD_REUSED.billing, SITE_CARD_TEXT.men, WORKER_CARD_TEXT.openDay])`));
    same('«סגור», «💬 שלח בוואטסאפ», «העתק», «חיוב -», «מי עבד באתר» and «לחיצה על יום…» are read from their owners',
        owned, ['סגור', '💬 שלח בוואטסאפ', 'העתק', 'חיוב -', 'מי עבד באתר', 'לחיצה על יום פותחת אותו במסך היום.']);
    same('and drawn as their owners say them', (() => {
        device.State.schedule.workers = [{ id: 'w_1', name: 'דוגמה', active: true }];
        device.run('openHistory(null)');
        const said = ['historyTitle', 'historyClose', 'historyManLabel', 'historySiteLabel', 'historyRangeLabel', 'historyFromLabel',
            'historyToLabel', 'historyFoldLabel', 'historySend', 'historyCopy'].map(id => device.byId(id).textContent)
            .concat([device.byId('historyRange').children.map(option => option.textContent)]);
        device.run('closeHistory()');
        return said;
    })(), ['מי עבד איפה', 'סגור', 'עובד', 'אתר', 'תקופה', 'מתאריך', 'עד תאריך', 'הרשימה כטקסט', '💬 שלח בוואטסאפ', 'העתק',
        ['החודש', 'חודש שעבר', '3 החודשים האחרונים', 'השנה', 'מתחילת הרישום', 'תאריכים אחרים']]);
    // The way back is named by the journey's own JOURNEY_TEXT.entry, read when the question is
    // asked - the asked sentence holds it (the evening device above) - and never spelled here.
    check('the journey\'s name inside the question is JOURNEY_TEXT.entry, handed in, and this file does not spell it',
        source('js/ui/journey.js').indexOf("entry: 'בניית סידור',") !== -1
        && device.run('HISTORY_TEXT.leaveMessage("א", "ב", "שם אחר")').indexOf('«שם אחר»') !== -1
        && (() => { const code = HISTORY_JS.split('\n').filter(line => line.trim().indexOf('//') !== 0)
            .map(line => line.replace(/\s\/\/ .*$/, '')).join('\n');
        return code.indexOf('«בניית סידור»') === -1 && /JOURNEY_TEXT\.entry/.test(code); })());
    check('every constant it reads at call time is read at call time - none at load',
        !/^const [A-Z_]+ = (?!Object\.freeze|\d|\[|\{|null|false|new WeakMap\(\))/m.test(HISTORY_JS)
        && !/^(?:const|let) \w+ = [A-Z_]+\./m.test(HISTORY_JS));

    const blocks = /const HISTORY_TEXT = Object\.freeze\(\{[\s\S]*?\n\}\);|const HISTORY_REUSED = Object\.freeze\(\{[\s\S]*?\n\}\);/g;
    given('both blocks are found', (HISTORY_JS.match(blocks) || []).length === 2);
    const loose = HISTORY_JS.replace(blocks, '').split('\n').filter(line => line.trim().indexOf('//') !== 0)
        .map(line => line.replace(/\s\/\/ .*$/, '')).filter(line => /[֐-׿]/.test(line));
    same('outside its two blocks the code holds no Hebrew word', loose, []);
    check('nothing in it says anything was sent', HISTORY_JS.indexOf('נשלח') === -1);
    same('the door and the title hold no «היסטוריה», and neither is a word of the advances page, the money readings or the crew screen',
        [T('door').indexOf('היסטוריה'), T('title').indexOf('היסטוריה'),
            ['js/ui/reports.js', 'js/ui/owes.js', 'js/ui/roster.js'].filter(file => source(file).indexOf(`'${T('door')}'`) !== -1
                || source(file).indexOf(`'${T('title')}'`) !== -1)],
        [-1, -1, []]);
    check('and no word in it mixes Hebrew and Arabic letters', !/[֐-׿][؀-ۿ]|[؀-ۿ][֐-׿]/.test(HISTORY_JS));
}

// ================================================================== 14. no money
{
    suite('14. no money: no money function, gate or ledger reader is asked anything');

    const device = seeded(33);
    const spied = ['payrollReport', 'workerDaysReport', 'reportReadOnce', 'carryReportingEnabled', 'ledgerEntries',
        'openAdvanceBalance', 'closedPeriods'];
    given('each is a function of the app', spied.every(name => typeof device.global(name) === 'function'), spied.join());
    const calls = {};
    spied.forEach(name => {
        calls[name] = 0;
        const real = device.ctx[name];
        device.ctx[name] = function () { calls[name] += 1; return real.apply(this, arguments); };
    });
    [null, 'w_1', 'w_3'].forEach(id => {
        device.run(`openHistory(${JSON.stringify(id)})`);
        ['thisMonth', 'lastMonth', 'last3', 'thisYear', 'all'].forEach(range => {
            device.choose('range', range);
            ['', 'p_1', 'p_2', 'p_3', 'p_4'].forEach(place => {
                device.choose('site', place);
                device.run('historyMore(); renderHistoryIfOpen(); historyToggleText(); historyToggleText();');
            });
        });
        device.run('closeHistory()');
    });
    same('across every reading and every draw of the dialog, not one call', calls, Object.fromEntries(spied.map(name => [name, 0])));
    device.run('payrollReport(State.schedule, "2026-11-01", "2026-11-10")');
    check('and the spy counts a real call', calls.payrollReport === 1);
}

// ================================================================== 15. the costs
{
    suite('15. the costs: the reading on a season, the text only while it is shown, a render that touches nothing');

    const queries = [
        ['a year, everyone, every site', Object.assign({ workerId: null, placeId: null }, YEAR)],
        ['a year, one man, every site', Object.assign({ workerId: 'w_05', placeId: null }, YEAR)],
        ['a year, everyone, one site', Object.assign({ workerId: null, placeId: 'p_1' }, YEAR)],
        ['a year, one man, one site', Object.assign({ workerId: 'w_05', placeId: 'p_6' }, YEAR)],
        ['this month, everyone, every site', { workerId: null, placeId: null, range: 'thisMonth' }],
        ['3 months, everyone, every site', { workerId: null, placeId: null, range: 'last3' }],
        ['the whole record, everyone', { workerId: null, placeId: null, range: 'all' }]
    ];
    season.run('globalThis.__timed = function (query) { HISTORY = Object.assign({ shown: 200, textOpen: false }, query); const read = historyFacts(); const text = historyText(read); HISTORY = null; return [read.rows.length, text.length]; };');
    const timed = queries.map(([label, query]) => {
        const runs = [];
        // One run first, unmeasured: the cost asked about is the reading's, not the compiler's.
        let shape = season.run(`__timed(${JSON.stringify(query)})`);
        for (let at = 0; at < 5; at += 1) {
            const began = performance.now();
            shape = season.run(`__timed(${JSON.stringify(query)})`);
            runs.push(performance.now() - began);
        }
        return [label, shape[0], shape[1], Math.round(median(runs) * 10) / 10];
    });
    timed.forEach(([label, rows, chars, ms]) => console.log(`      ${label}: ${rows} rows, ${chars} characters, ${ms} ms (median of 5)`));
    same('each of the seven queries reads and writes its text inside 100 ms, median of 5 (printed above)',
        timed.filter(item => item[3] > 100).map(item => item[0]), []);
    same('and every text is within 60,000 characters', timed.filter(item => item[2] > 60000).map(item => item[0]), []);

    // The text is built only while its fold is open: a spy on historyText.
    const real = season.ctx.historyText;
    let texts = 0;
    season.ctx.historyText = function () { texts += 1; return real.apply(this, arguments); };
    let reads = 0;
    const realRead = season.ctx.historyRead;
    season.ctx.historyRead = function () { reads += 1; return realRead.apply(this, arguments); };
    season.run('openHistory(null)');
    texts = 0;
    for (let at = 0; at < 20; at += 1) season.run('renderHistoryIfOpen()');
    same('20 redraws with the fold shut build the text 0 times', texts, 0);
    season.run('historyToggleText()');
    texts = 0;
    for (let at = 0; at < 20; at += 1) season.run('renderHistoryIfOpen()');
    same('and with it open, once a redraw', texts, 20);
    season.run('closeHistory()');
    reads = 0;
    for (let at = 0; at < 20; at += 1) season.run('renderHistoryIfOpen()');
    same('render() with the dialog shut: 0 readings over 20', reads, 0);
    season.State.date = season.today;
    season.run('openFind()');
    reads = 0;
    for (let at = 0; at < 10; at += 1) season.run('renderFind()');
    same('the finder drawn 10 times with its door on every man reads nothing of this file', reads, 0);
    check('(the door is there)', season.byId('findList').querySelectorAll('.find-door-history').length === 40);
    season.run('closeFind()');

    // A render on a record that did not move: ONE reading, and no node of the dialog changed.
    season.run('openHistory(null)');
    season.run('historyToggleText()');
    const nodes = () => {
        const out = [];
        const walk = node => { out.push(node); node.children.forEach(walk); };
        ['historyMan', 'historySite', 'historyRange', 'historyRangeNow', 'historyTotals', 'historyList', 'historyFoldBody']
            .forEach(id => walk(season.byId(id)));
        return out;
    };
    const snap = () => nodes().map(node => [node._text, node.className, JSON.stringify(node.attributes), node.children.length,
        node.hidden, node.value]);
    const beforeNodes = nodes();
    const beforeSnap = JSON.stringify(snap());
    reads = 0;
    season.run('renderHistoryIfOpen()');
    const afterNodes = nodes();
    same('a render on a record that did not move: one reading, and every node the same node, unchanged',
        [reads, afterNodes.length === beforeNodes.length && afterNodes.every((node, at) => node === beforeNodes[at]),
            JSON.stringify(snap()) === beforeSnap], [1, true, true]);
    // And a record that moved is drawn again: today, the first man, a double at a site of his
    // that is not his home.
    const listBefore = season.byId('historyList').children.slice();
    season.run("State.schedule.days['2026-11-19'].actual.w_01 = { entries: [makeEntry('p_5', 'double')] };");
    season.run('renderHistoryIfOpen()');
    const moved = nodes();
    check('while a record that moved is drawn again', moved.some((node, at) => node !== beforeNodes[at])
        && JSON.stringify(snap()) !== beforeSnap && season.rowsDrawn()[0].getAttribute('aria-label').indexOf('יום כפול') !== -1,
    season.rowsDrawn()[0].getAttribute('aria-label'));
    // ONLY WHERE IT MOVED: of the list's 200 days and their headings, the one day is built
    // again - and its month's heading and the foot only if a count they say moved - and every
    // other node is the node it was. And the answer is the list a fresh draw makes.
    const built = season.byId('historyList').children.filter(node => listBefore.indexOf(node) === -1);
    same('only the day that moved is built again: every other node of the list is the node it was',
        [built.length >= 1 && built.length <= 3, built.indexOf(season.rowsDrawn()[0]) !== -1,
            built.every(node => node === season.rowsDrawn()[0] || node.className === 'history-month' || node.className === 'history-foot')],
        [true, true, true]);
    const listSnap = () => {
        const out = [];
        const walk = node => {
            out.push([node.tagName, node._text, node.className, JSON.stringify(node.attributes), JSON.stringify(node.dataset || {}),
                node.style ? node.style.background : '']);
            node.children.forEach(walk);
        };
        walk(season.byId('historyList'));
        return JSON.stringify(out);
    };
    const drawnInPlace = listSnap();
    season.run('closeHistory(); openHistory(null); historyToggleText();');
    same('and the list says, node for node, what a fresh draw of the same record says', listSnap() === drawnInPlace, true);
    season.run('closeHistory()');
    season.ctx.historyText = real;
    season.ctx.historyRead = realRead;
}

// ================================================================== 16. the shell
{
    suite('16. the shell: on the page in order, in the offline shell, closed by Escape, redrawn by render()');

    const page = source('index.html');
    const scripts = [...page.matchAll(/<script src="([^"]+)"><\/script>/g)].map(match => match[1]);
    const at = scripts.indexOf('js/ui/history.js');
    check('index.html loads it once, as a classic script',
        scripts.filter(src => src === 'js/ui/history.js').length === 1 && page.indexOf('type="module" src="js/ui/history.js"') === -1);
    check('directly after js/ui/sitecard.js, and before js/ui/find.js and js/app.js',
        at === scripts.indexOf('js/ui/sitecard.js') + 1 && at < scripts.indexOf('js/ui/find.js') && at < scripts.indexOf('js/app.js'), String(at));
    check('after everything it calls', ['js/ui/dom.js', 'js/ui/sitecolor.js', 'js/ui/ask.js', 'js/ui/modal.js', 'js/ui/reports.js',
        'js/ui/workercard.js', 'js/ui/share.js', 'js/ui/journey.js', 'js/ui/monthsummary.js', 'js/model/schema.js', 'js/model/money.js']
        .every(src => scripts.indexOf(src) !== -1 && scripts.indexOf(src) < at));
    check('the service worker\'s shell names it, directly after the site card',
        source('sw.js').indexOf("    './js/ui/sitecard.js',\n    './js/ui/history.js',\n    './js/ui/find.js',") !== -1);
    check('its frame is static at boot, directly after the finder\'s, its heading focusable and the choices labelled above their fields',
        /<div id="findList"><\/div>\s+<\/div>\s+<\/div>\s+<!-- «מי עבד איפה»[\s\S]*?-->\s+<div class="modal" id="historyModal">\s+<div class="modal-content history-content">\s+<div class="history-head">\s+<h3 id="historyTitle" tabindex="-1"><\/h3>/.test(page)
        && ['<label class="history-field" for="historyMan"><span id="historyManLabel"></span>',
            '<select id="historyMan" onchange="historyChoose(\'man\')"></select></label>',
            '<select id="historySite" onchange="historyChoose(\'site\')"></select></label>',
            '<select id="historyRange" onchange="historyChoose(\'range\')"></select></label>',
            '<div id="historyDates" class="history-dates" hidden>',
            '<input type="date" id="historyFrom" onchange="historyChoose(\'dates\')"></label>',
            '<input type="date" id="historyTo" onchange="historyChoose(\'dates\')"></label>',
            '<strong id="historyRangeNow" class="history-now" role="status" aria-live="polite"></strong>',
            '<button type="button" class="btn-secondary" id="historyFoldLabel" aria-expanded="false" aria-controls="historyText" onclick="historyToggleText()"></button>',
            '<div id="historyFoldBody" class="history-fold-body" hidden>', '<textarea id="historyText" rows="10" readonly></textarea>',
            '<div id="historyList" class="history-list"></div>'].every(piece => page.indexOf(piece) !== -1));
    check('Escape and the backdrop reach its own closer, directly after the finder\'s row',
        /findModal: \(\) => closeFind\(\),\n\s+\/\/ «מי עבד איפה».*\n\s+historyModal: \(\) => closeHistory\(\),/.test(source('js/ui/modal.js')));
    check('render() asks it to follow the record, directly after the site card',
        /if \(typeof renderSiteCardIfOpen === 'function'\) renderSiteCardIfOpen\(\);\n\s+\/\/ .*\n\s+if \(typeof renderHistoryIfOpen === 'function'\) renderHistoryIfOpen\(\);/.test(source('js/app.js')));
    check('nothing at load: every statement at its top level is a declaration',
        HISTORY_JS.split('\n').filter(line => /^[^\s/}]/.test(line)).every(line => /^(const|let|function) /.test(line)));
    same('and nothing else in the app opens it but the finder', ['index.html', 'js/app.js', 'js/ui/day.js', 'js/ui/sheet.js',
        'js/ui/roster.js', 'js/ui/reports.js', 'js/ui/workercard.js', 'js/ui/sitecard.js', 'js/ui/journey.js']
        .filter(file => source(file).indexOf('openHistory(') !== -1), []);
    check('its look is in the design layer and the large display, nowhere else',
        source('css/design.css').indexOf('#historyList .history-row') !== -1 && source('css/large.css').indexOf('.history-row') !== -1
        && !/(^|[^\w-])[.#]history[-A-Z]/m.test(source('css/app.css')) && !/(^|[^\w-])[.#]history[-A-Z]/m.test(source('css/readability.css')));
}

report();
