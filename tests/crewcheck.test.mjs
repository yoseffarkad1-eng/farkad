// «בדיקת הצוות» on devices, in Node.
//
//   node tests/crewcheck.test.mjs
//   CREWCHECK_NOISE=1 node tests/crewcheck.test.mjs    also prints every season's table
//
// The check (js/ui/crewcheck.js) is a READING of the roster against the record: who has no
// daily rate, whose number will not open in WhatsApp, which number and which name is on two
// active rows, which active man and site had no work in the last 25 working days - and,
// never counted, another country's number, no number for a man working these days, days
// stamped with no daily rate, men and sites with no day of work at all. What this suite
// holds, section by section (features/crewcheck/contract.md, criteria 1-9):
//
//   1. EACH RULE fires on the record made for it and is silent on its near miss - 25
//      working days back and 24, tomorrow, absences only, an archived man, Rima and יוסף
//      גבס counts, a closure, a Saturday, a short record, every spelling of no rate, the
//      evening read as of itself, and the stamped days.
//   2. THE PHONE FAMILY, every spelling tests/seder.test.mjs pins and every one the
//      contract added, on exactly the line the table gives it.
//   3. THE AGREEMENTS: the dialog says what the row and the seder already say, on the four
//      seeds and on records made to have duplicates - and its one money fact is the pay
//      sheet's own, asked on a copy.
//   4. THE TIERS: the calm line, the too-few line, the order, the flat list's shape.
//   5. THE WORDS, every one; the borrowed ones found in their owners.
//   6. IT WRITES NOTHING: the whole disk byte for byte across the reading and every door.
//   7. IT IS QUIET WHERE NOTHING IS WRONG, on seeded seasons - each evening read as of
//      itself, which is the only reading in which "of the men it named, how many came back"
//      can be measured at all; the whole-record reading is printed beside it.
//   8. THE COST, printed.
//   9. NOT IN A DRAW: on a DOM that holds nodes, the crew screen's draws read nothing while
//      the dialog is shut, and exactly once a draw while it is open.
//
// SYNTHETIC NAMES AND NUMBERS ONLY. The seasons are models; their shares are true of the
// model, not of anybody's real year.

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDevice } from './harness.mjs';
import { makeDom } from './moneydom.mjs';
import { owesSeedCrew, OWES_TODAY } from './owes.seed.mjs';
import { weeklySeedCrew, WEEKLY_TODAY } from './weeklyclose.seed.mjs';
import { CREW, SITES, TODAY as SCREENS_TODAY, TOMORROW as SCREENS_TOMORROW } from './screens.mjs';
import { suite, check, same, given, report } from './runner.mjs';

process.env.TZ = 'Asia/Jerusalem';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = file => readFileSync(join(ROOT, file), 'utf8');
const CHECK = source('js/ui/crewcheck.js');
const NOISE = Boolean(process.env.CREWCHECK_NOISE);

const FSI = '⁨';
const LRI = '⁦';
const PDI = '⁩';
const named = name => `${FSI}${name}${PDI}`;
const numbered = number => `${LRI}${number}${PDI}`;
const IDLE = 25;

// ---------------------------------------------------------------- calendars

const iso = at => `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
const addDays = (date, n) => {
    const [y, m, d] = date.split('-').map(Number);
    return iso(new Date(y, m - 1, d + n, 12));
};
const weekdayOf = date => new Date(`${date}T12:00:00`).getDay();
const calendarDays = (from, to) => Math.round((new Date(`${to}T12:00:00`) - new Date(`${from}T12:00:00`)) / 86400000);
// `n` days of a working week - Sunday to Friday - ending on `last`, oldest first.
function workweekEndingOn(last, n) {
    const out = [];
    for (let date = last; out.length < n; date = addDays(date, -1)) if (weekdayOf(date) !== 6) out.unshift(date);
    return out;
}

// mulberry32, the suites' generator: the same numbers on every machine and in every run.
function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ---------------------------------------------------------------- devices

// A phone: the model and the crew screen (the harness), with the seder, the day check and
// the crew's check run into its context in index.html's order.
function device(today, options = {}) {
    const d = makeDevice({ deviceId: 'd_crewcheck', ...options });
    d.run = code => vm.runInContext(code, d.ctx, { filename: 'harness:crewcheck' });
    ['js/ui/seder.js', 'js/ui/daycheck.js'].forEach(file => vm.runInContext(source(file), d.ctx, { filename: file }));
    vm.runInContext(CHECK, d.ctx, { filename: 'js/ui/crewcheck.js' });
    if (today) d.setToday(today);
    return d;
}

// The reading, and the flat list, of a schedule handed in (the device's own when none is).
function readOn(d, today, asOf, schedule) {
    d.ctx.__schedule = schedule || d.State.schedule;
    d.ctx.__today = today;
    d.ctx.__asOf = asOf;
    return JSON.parse(d.run('JSON.stringify(crewCheckRead(__schedule, __today, "actual", __asOf))'));
}
function findingsOn(d, today, schedule) {
    d.ctx.__schedule = schedule || d.State.schedule;
    d.ctx.__today = today;
    return JSON.parse(d.run('JSON.stringify(crewCheckFindings(crewCheckRead(__schedule, __today, "actual"), __today))'));
}
const ids = list => list.map(item => item.id);
const names = list => list.map(item => item.name);
const checkEmpty = read => Object.values(read.check).every(list => list.length === 0);
const infoEmpty = read => Object.values(read.info).every(list => list.length === 0);

// A record written by the model's own writers, inside the device:
//   { workers, places, work: [[date, id, place, rate?, hours?]], absent: [[date, id]],
//     rima: [[date, place, n]], yosef: [[date, place, n]] }
// The roster is in place before any day is written, so each day is stamped as the app
// stamps it (setWorkerDay, js/model/money.js).
function build(d, spec) {
    d.ctx.__spec = JSON.parse(JSON.stringify(spec));
    d.run(`(function (spec) {
        const S = emptySchedule();
        S.workers = spec.workers.map(w => Object.assign({ active: true, dailyRate: 400, hourlyRate: 0, phone: '' }, w));
        S.places = spec.places.map(p => Object.assign({ active: true }, p));
        (spec.work || []).forEach(([date, id, place, rate, hours]) => {
            const done = assignPlace(S, date, id, 'actual', place, rate, hours);
            if (done && done.refused) throw new Error('refused: ' + done.reason);
        });
        (spec.absent || []).forEach(([date, id]) => markAbsent(S, date, id, 'actual'));
        (spec.rima || []).forEach(([date, place, n]) => setRimaCount(S, date, place, n));
        (spec.yosef || []).forEach(([date, place, n]) => setYosefGevesCount(S, date, place, n));
        State.schedule = S;
    })(__spec)`);
    return d.State.schedule;
}

// ---------------------------------------------------------------- the seeds
//
// tests/screens.mjs's record, rebuilt in Node with its own crew, sites and dates: the record
// every screen of the app is measured on (its seed(), the same loop). Its money is left out -
// the check reads no money but the stamps the loop writes.
function screensSeed() {
    const d = device(SCREENS_TODAY);
    d.ctx.__args = JSON.parse(JSON.stringify([CREW, SITES, SCREENS_TODAY, SCREENS_TOMORROW]));
    d.run(`(function ([crew, sites, today, tomorrow]) {
        State.schedule = emptySchedule();
        State.schedule.workers = crew.map((name, i) => ({ id: 'w' + String(i + 1).padStart(2, '0'), name, active: true,
            dailyRate: 400 + 10 * (i % 4), hourlyRate: 50, phone: i < 9 ? '05200000' + String(10 + i) : '',
            ...(i === 6 || i === 7 ? { payCycles: '2026-08-07=weekly' } : {}) }));
        State.schedule.places = sites.map((name, i) => ({ id: 'p' + (i + 1), name, active: true }));
        const day = new Date(2026, 9, 23);
        const last = new Date(2026, 10, 11);
        let at = 0;
        for (; day <= last; day.setDate(day.getDate() + 1), at += 1) {
            if (day.getDay() === 6) continue;
            const date = toLocalDateStr(day);
            if (date === '2026-11-05') continue;
            State.schedule.workers.forEach((worker, i) => {
                if (i >= 11) return;
                if (date === today && i === 8) { markAbsent(State.schedule, date, worker.id, 'actual'); return; }
                if (date === tomorrow && i >= 8) return;
                if (date === today && i === 10) return;
                if ((i + at) % 9 === 0) { markAbsent(State.schedule, date, worker.id, 'actual'); return; }
                const place = i === 10 ? 'p3' : 'p' + (((i + (at % 3)) % 5) + 1);
                if (i === 3 && at % 4 === 0) assignPlace(State.schedule, date, worker.id, 'actual', place, 'double');
                else if (i === 5 && at % 3 === 0) assignPlace(State.schedule, date, worker.id, 'actual', place, 'extra', 2);
                else assignPlace(State.schedule, date, worker.id, 'actual', place);
            });
            if (at % 2 === 0) setRimaCount(State.schedule, date, 'p1', 3);
            if (at % 3 === 0) setYosefGevesCount(State.schedule, date, 'p2', 2);
        }
        setRimaCount(State.schedule, today, 'p1', 3);
        setYosefGevesCount(State.schedule, today, 'p2', 2);
    })(__args)`);
    return d;
}

// A seed helper of the browser suites, run in the device: it writes State.schedule.
function seedFrom(fn, today) {
    const d = device(today);
    d.run(`(${fn.toString()})()`);
    return d;
}

// The 'with findings' state tests/screens.mjs draws, made the same way on the same seed: the
// model's own writers, in memory (contract.md, Existing suites touched). w02's rate goes
// first, so the day added for him is stamped with it.
const ADDED = ['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16',
    '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22'];
function withFindings(d) {
    d.ctx.__added = ADDED;
    d.run(`(function (added) {
        const S = State.schedule;
        const w = id => S.workers.find(x => x.id === id);
        w('w02').dailyRate = 0;
        w('w03').phone = '03-5551234';
        w('w05').phone = w('w01').phone;
        w('w04').phone = '+970 59-123-4567';
        w('w13').name = w('w12').name;
        S.places.push({ id: 'p6', name: 'חדרה - בית הספר', active: true }, { id: 'p7', name: 'כפר סבא - מרכז', active: true });
        added.forEach((date, i) => {
            if (i === 0) assignPlace(S, date, 'w14', 'actual', 'p6');
            else assignPlace(S, date, 'w01', 'actual', 'p1');
            if (i === 1) assignPlace(S, date, 'w02', 'actual', 'p1');
        });
    })(__added)`);
    return d;
}

// The time-season record (40 regular men, 6 sites, 2026-01-01..11-19 without Saturdays - the
// record every cost in this program was measured on).
function timeSeason() {
    const d = device('2026-11-19');
    const rand = rng(20261119);
    const pick = list => list[Math.floor(rand() * list.length)];
    const s = d.State.schedule;
    s.places = [1, 2, 3, 4, 5, 6].map(n => ({ id: `p_${n}`, name: `אתר ${n}`, active: true }));
    s.workers = [];
    const days = [];
    for (let date = '2026-01-01'; date <= '2026-11-19'; date = addDays(date, 1)) if (weekdayOf(date) !== 6) days.push(date);
    for (let n = 1; n <= 40; n += 1) {
        const id = `w_${String(n).padStart(2, '0')}`;
        s.workers.push(Object.assign({ id, name: `עובד ${n}`, active: true, dailyRate: pick([380, 420, 450, 500, 550, 610, 650]),
            hourlyRate: pick([0, 0, 45, 50]), phone: `05200${String(10000 + n)}` }, n <= 16 ? { payCycles: '2026-01-02=weekly' } : {}));
        const home = `p_${1 + (n % 6)}`;
        days.forEach(date => {
            if (rand() > 0.85) return;
            if (rand() < 0.02) { d.call('markAbsent', s, date, id, 'actual'); return; }
            const r = rand();
            if (r < 0.03) d.call('assignPlace', s, date, id, 'actual', home, 'double');
            else if (r < 0.08) d.call('assignPlace', s, date, id, 'actual', home, 'extra', 1 + Math.floor(rand() * 3));
            else d.call('assignPlace', s, date, id, 'actual', home, 'normal');
            if (rand() < 0.05) d.call('assignPlace', s, date, id, 'actual', `p_${1 + ((n + 3) % 6)}`, 'normal');
        });
    }
    days.forEach(date => {
        if (rand() < 0.4) d.call('setRimaCount', s, date, 'p_1', 1 + Math.floor(rand() * 4));
        if (rand() < 0.3) d.call('setRimaCount', s, date, 'p_3', 1 + Math.floor(rand() * 3));
        if (rand() < 0.3) d.call('setYosefGevesCount', s, date, 'p_2', 1 + Math.floor(rand() * 5));
    });
    return d;
}

// A heavier record than the owner's: `men` men, every day from `from` to 2026-11-19 but
// Saturdays, eight sites, Rima on one.
function bigSeason(men, from) {
    const d = device('2026-11-19');
    const rand = rng(777);
    const s = d.State.schedule;
    s.places = [1, 2, 3, 4, 5, 6, 7, 8].map(n => ({ id: `p_${n}`, name: `אתר ${n}`, active: true }));
    s.workers = [];
    const days = [];
    for (let date = from; date <= '2026-11-19'; date = addDays(date, 1)) if (weekdayOf(date) !== 6) days.push(date);
    for (let n = 1; n <= men; n += 1) {
        const id = `w_${String(n).padStart(2, '0')}`;
        s.workers.push({ id, name: `עובד ${n}`, active: true, dailyRate: 450, hourlyRate: 50, phone: n % 7 ? `05200${String(10000 + n)}` : '' });
        const home = `p_${1 + (n % 8)}`;
        days.forEach(date => { if (rand() > 0.8) return; d.call('assignPlace', s, date, id, 'actual', home, 'normal'); });
    }
    days.forEach(date => { if (rand() < 0.4) d.call('setRimaCount', s, date, 'p_1', 2); });
    return d;
}

// tests/daycheck.test.mjs's season(), copied line for line: fourteen men who work, three on
// the roster who never do, one archived; five sites that open and finish, a finished site
// left ACTIVE in the roster; Sunday to Thursday nearly everybody, Friday a short day or
// none, two holidays, spells of absence; Rima's men on two sites for weeks at a time.
function daycheckSeason(seed, habit, rimaFriday) {
    const rand = rng(seed);
    const pick = list => list[Math.floor(rand() * list.length)];
    const workers = [];
    for (let i = 1; i <= 14; i += 1) workers.push({ id: `w_${String(i).padStart(2, '0')}`, name: `עובד ${i}`, active: true, dailyRate: 400, hourlyRate: 50 });
    for (let i = 15; i <= 17; i += 1) workers.push({ id: `w_${i}`, name: `רדום ${i}`, active: true, dailyRate: 400, hourlyRate: 50 });
    workers.push({ id: 'w_18', name: 'בארכיון', active: false, dailyRate: 400, hourlyRate: 50 });
    const places = [1, 2, 3, 4, 5].map(i => ({ id: `p_0${i}`, name: `אתר ${i}`, active: true }));
    const schedule = { workers, places, days: {} };
    const working14 = workers.slice(0, 14);
    const fridayMen = new Set(working14.slice(0, 5).map(worker => worker.id));
    const home = new Map(working14.map((worker, i) => [worker.id, places[i % 4].id]));
    const awayLeft = new Map();
    const rima = new Map([[places[0].id, { left: 0, rest: 5, count: 3 }], [places[2].id, { left: 0, rest: 20, count: 4 }]]);
    let openSites = places.slice(0, 4).map(place => place.id);
    const start = new Date(2026, 5, 7, 12);
    const holidays = new Set();
    [[40, 4], [85, 8]].forEach(([from, length]) => { for (let k = 0; k < length; k += 1) holidays.add(from + k); });
    for (let offset = 0; offset < 120; offset += 1) {
        const date = new Date(start);
        date.setDate(start.getDate() + offset);
        const weekday = date.getDay();
        if (weekday === 6 || holidays.has(offset)) continue;
        const friday = weekday === 5;
        if (friday && rand() < 0.25) continue;
        if (!friday && rand() < 0.04) {
            const closing = pick(openSites);
            const opening = places.find(place => !openSites.includes(place.id));
            if (opening) {
                openSites = openSites.filter(id => id !== closing).concat([opening.id]);
                working14.forEach(worker => { if (home.get(worker.id) === closing) home.set(worker.id, opening.id); });
            }
        }
        const side = {};
        const working = [];
        working14.forEach(worker => {
            let left = awayLeft.get(worker.id) || 0;
            if (left === 0 && rand() < 0.035) left = 1 + Math.floor(rand() * 5);
            if (left > 0) { awayLeft.set(worker.id, left - 1); return; }
            if (friday && !(fridayMen.has(worker.id) || rand() < 0.1)) return;
            if (rand() < 0.03) return;
            if (rand() < 0.06) home.set(worker.id, pick(openSites));
            const entry = { placeId: home.get(worker.id) };
            const roll = rand();
            if (roll < 0.02) entry.rate = 'double';
            else if (roll < 0.10) { entry.rate = 'extra'; entry.extraHours = 1 + Math.floor(rand() * 3); }
            const entries = [entry];
            if (rand() < 0.05) {
                const second = pick(openSites.filter(id => id !== entry.placeId));
                if (second) entries.push({ placeId: second });
            }
            side[worker.id] = { entries, rates: { daily: 400, hourly: 50 } };
            working.push(worker.id);
        });
        if (working.length === 0) continue;
        if (habit === 'full') {
            workers.filter(worker => worker.active !== false && !side[worker.id])
                .forEach(worker => { side[worker.id] = { absent: true, entries: [] }; });
        }
        const day = { actual: side };
        const counts = {};
        rima.forEach((state, placeId) => {
            if (state.left === 0) {
                state.rest -= 1;
                if (state.rest <= 0) { state.left = 10 + Math.floor(rand() * 12); state.count = 2 + Math.floor(rand() * 5); }
                return;
            }
            state.left -= 1;
            if (state.left === 0) state.rest = 6 + Math.floor(rand() * 12);
            if (friday && !rimaFriday) return;
            if (rand() < 0.08) return;
            if (rand() < 0.15) state.count = Math.max(1, state.count + (rand() < 0.5 ? -1 : 1));
            counts[placeId] = state.count;
        });
        if (Object.keys(counts).length > 0) day.rima = counts;
        schedule.days[iso(date)] = day;
    }
    return schedule;
}

// A SEASON WITH TURNOVER, the contract's model (contract.md, THE THRESHOLD; its rates are
// guesses, true of the model only): 2026-01-01..2026-11-19, Saturdays off, two closures of
// the whole business (8 and 9 working days); 26 regulars (spells of 1-5 days, and 30% of
// them ONE long leave of 10-35 working days, after which they come back); 5 who leave for
// good on a random day and are never switched off; 4 occasional men (a day of work with
// probability 1/15); 2 who join mid-season; 3 on the roster who never work. Six sites: one
// finishes on day 110 and one on day 200, both left active; one PAUSES for 20-30 working
// days and resumes; one opens on day 110. Rima's men on p_1 for weeks at a time.
function turnoverSeason(seed) {
    const rand = rng(seed);
    const pick = list => list[Math.floor(rand() * list.length)];
    const days = [];
    for (let date = '2026-01-01'; date <= '2026-11-19'; date = addDays(date, 1)) if (weekdayOf(date) !== 6) days.push(date);
    const closed = new Set();
    const from1 = days.indexOf('2026-04-01'); for (let k = 0; k < 8; k += 1) closed.add(days[from1 + k]);
    const from2 = days.indexOf('2026-09-27'); for (let k = 0; k < 9; k += 1) closed.add(days[from2 + k]);
    const places = [1, 2, 3, 4, 5, 6].map(n => ({ id: `p_${n}`, name: `אתר ${n}`, active: true }));
    const workers = []; const kind = new Map(); const plan = new Map();
    const add = (id, name, k, extra) => { workers.push({ id, name, active: true, dailyRate: 450, hourlyRate: 50, phone: '' }); kind.set(id, k); plan.set(id, extra || {}); };
    for (let i = 1; i <= 26; i += 1) {
        const leave = rand() < 0.3 ? { at: 20 + Math.floor(rand() * (days.length - 80)), length: 10 + Math.floor(rand() * 26) } : null;
        add(`r_${i}`, `קבוע ${i}`, 'regular', { leave });
    }
    for (let i = 1; i <= 5; i += 1) add(`l_${i}`, `יוצא ${i}`, 'leaver', { until: 40 + Math.floor(rand() * 190) });
    for (let i = 1; i <= 4; i += 1) add(`o_${i}`, `מזדמן ${i}`, 'occasional');
    add('j_1', 'חדש 1', 'joiner', { from: 100 }); add('j_2', 'חדש 2', 'joiner', { from: 180 });
    for (let i = 1; i <= 3; i += 1) add(`d_${i}`, `רדום ${i}`, 'dormant');
    const schedule = { workers, places, days: {} };
    const home = new Map(workers.map((w, i) => [w.id, ['p_1', 'p_2', 'p_3', 'p_4'][i % 4]]));
    const pauseAt = 140 + Math.floor(rand() * 20); const pauseLength = 20 + Math.floor(rand() * 11);
    const awayLeft = new Map();
    const rimaState = { left: 0, rest: 5, count: 3 };
    days.forEach((date, index) => {
        if (closed.has(date)) return;
        const friday = weekdayOf(date) === 5;
        if (friday && rand() < 0.25) return;
        const open = ['p_1', 'p_4'];
        if (index < 110) open.push('p_2'); else open.push('p_5');
        if (index < 200) open.push('p_6');
        if (!(index >= pauseAt && index < pauseAt + pauseLength)) open.push('p_3');
        const side = {};
        workers.forEach(w => {
            const k = kind.get(w.id); const p = plan.get(w.id);
            if (k === 'dormant') return;
            if (k === 'leaver' && index > p.until) return;
            if (k === 'joiner' && index < p.from) return;
            if (k === 'occasional' && rand() >= 1 / 15) return;
            if (k === 'regular' && p.leave && index >= p.leave.at && index < p.leave.at + p.leave.length) return;
            let left = awayLeft.get(w.id) || 0;
            if (k !== 'occasional') {
                if (left === 0 && rand() < 0.035) left = 1 + Math.floor(rand() * 5);
                if (left > 0) { awayLeft.set(w.id, left - 1); return; }
                if (friday && rand() < 0.6) return;
                if (rand() < 0.03) return;
            }
            let site = home.get(w.id);
            if (!open.includes(site)) { site = pick(open); home.set(w.id, site); }
            side[w.id] = { entries: [{ placeId: site }], rates: { daily: 450, hourly: 50 } };
        });
        if (Object.keys(side).length === 0) return;
        const day = { actual: side };
        if (rimaState.left === 0) { rimaState.rest -= 1; if (rimaState.rest <= 0) { rimaState.left = 10 + Math.floor(rand() * 12); } }
        else { rimaState.left -= 1; if (rimaState.left === 0) rimaState.rest = 6 + Math.floor(rand() * 12); if (rand() >= 0.08) day.rima = { p_1: rimaState.count }; }
        schedule.days[date] = day;
    });
    return { schedule, kind };
}

// ================================================================== 1. each rule
//
// Thursday 19 November 2026, and the forty days of a working week that end on it. A man
// who works every one of them - «בסיס» - makes each of them a working day.
const T = '2026-11-19';
const TOMORROW = '2026-11-20';
const W40 = workweekEndingOn(T, 40);
const BASE = { id: 'w_base', name: 'בסיס', phone: '0520000001' };
const baseWork = (days = W40, place = 'p_1') => days.map(date => [date, BASE.id, place]);

suite('1. idle: 25 working days after his last day and he is named, 24 and he is not');
{
    const d = device(T);
    build(d, {
        workers: [BASE, { id: 'w_25', name: 'עשרים וחמש', phone: '0520000002' }, { id: 'w_24', name: 'עשרים וארבע', phone: '0520000003' },
            { id: 'w_tom', name: 'מחר', phone: '0520000004' }, { id: 'w_abs', name: 'רק נעדר', phone: '0520000005' }],
        places: [{ id: 'p_1', name: 'אתר אחד' }],
        work: baseWork().concat(W40.slice(0, 15).map(date => [date, 'w_25', 'p_1']),
            W40.slice(0, 16).map(date => [date, 'w_24', 'p_1']), [[TOMORROW, 'w_tom', 'p_1']]),
        absent: W40.slice(30, 35).map(date => [date, 'w_abs'])
    });
    const read = readOn(d, T);
    same('the window opens on the 25th working day from the end', read.since, W40[15]);
    same('the man with 25 working days after his last is idle, with that last day', read.check.idle,
        [{ id: 'w_25', name: 'עשרים וחמש', last: W40[14] }]);
    check('the man with 24 is not', !ids(read.check.idle).includes('w_24') && !ids(read.info.never).includes('w_24'));
    check('a man whose only site is tomorrow is neither idle nor «never»',
        !ids(read.check.idle).includes('w_tom') && !ids(read.info.never).includes('w_tom'), JSON.stringify(read));
    same('a man with absences only has no day of work: «never»', ids(read.info.never), ['w_abs']);
    same('the counts are the active men and the active sites', read.counts, { men: 5, sites: 1 });
}

suite('1. an archived man is on no line - and his days are still days that were worked, his site still in use');
{
    const d = device(T);
    const ARCHIVED = { id: 'w_arch', name: 'בארכיון', active: false, dailyRate: 0, phone: '1234' };
    build(d, {
        workers: [BASE, ARCHIVED],
        places: [{ id: 'p_1', name: 'אתר אחד' }, { id: 'p_arch', name: 'אתר שלו' }],
        work: baseWork(W40.filter((_, at) => at !== 30)).concat([[W40[30], 'w_arch', 'p_arch'], [W40[35], 'w_arch', 'p_arch']])
    });
    const read = readOn(d, T);
    check('he is on no line of either tier', !JSON.stringify(read.check).includes('w_arch') && !JSON.stringify(read.info).includes('w_arch'),
        JSON.stringify(read));
    same('the day only he worked is still a working day: the window is where forty days put it', read.since, W40[15]);
    check('and the site only he worked on is in use - neither idle nor «never»',
        !ids(read.check.idleSites).includes('p_arch') && !ids(read.info.neverSites).includes('p_arch'));
    same('he is not counted among the active men', read.counts.men, 1);
}

suite('1. Rima\'s men and יוסף גבס\'s men keep a site in use, and a day of counts alone is no working day');
{
    const d = device(T);
    const before = addDays(W40[0], -10);
    build(d, {
        workers: [BASE],
        places: [{ id: 'p_1', name: 'אתר אחד' }, { id: 'p_rima', name: 'רק רימא' }, { id: 'p_yosef', name: 'רק יוסף גבס' },
            { id: 'p_old', name: 'רימא מזמן' }],
        work: baseWork(),
        rima: [[W40[30], 'p_rima', 3], [W40[5], 'p_old', 2], [before, 'p_1', 4]],
        yosef: [[W40[30], 'p_yosef', 2], [addDays(before, -1), 'p_1', 5]]
    });
    const read = readOn(d, T);
    check('a site with only Rima counts after the window opens is not idle',
        !ids(read.check.idleSites).includes('p_rima') && !ids(read.info.neverSites).includes('p_rima'));
    check('nor one with only יוסף גבס counts', !ids(read.check.idleSites).includes('p_yosef') && !ids(read.info.neverSites).includes('p_yosef'));
    same('a site whose last count is before the window is idle, the count\'s day its last', read.check.idleSites,
        [{ id: 'p_old', name: 'רימא מזמן', last: W40[5] }]);
    same('the two days of counts alone, before the forty, are not working days: the window is unmoved', read.since, W40[15]);
    same('and the day check says the same of both days', [before, addDays(before, -1)].map(date =>
        d.call('dayCheckIsWorkingDay', d.State.schedule, date, 'actual')), [false, false]);
}

suite('1. nine working days when nobody worked move the window back by nine, and make nobody idle');
{
    const open = device(T);
    const closed = device(T);
    const shut = new Set(W40.slice(25, 34));
    const spec = days => ({
        workers: [BASE, { id: 'w_x', name: 'כל יום', phone: '0520000002' }, { id: 'w_y', name: 'עד היום העשירי', phone: '0520000003' }],
        places: [{ id: 'p_1', name: 'אתר אחד' }],
        work: baseWork(days).concat(days.map(date => [date, 'w_x', 'p_1']), W40.slice(0, 11).map(date => [date, 'w_y', 'p_1']))
    });
    build(open, spec(W40));
    build(closed, spec(W40.filter(date => !shut.has(date))));
    const a = readOn(open, T);
    const b = readOn(closed, T);
    same('without the closure the window opens on the 25th working day from the end', a.since, W40[15]);
    same('with nine days shut it opens nine working days earlier', b.since, W40[6]);
    same('the man whose last day was the eleventh is idle without the closure', ids(a.check.idle), ['w_y']);
    same('and with it nobody is: the days nobody worked are not days he missed', b.check.idle, []);
}

suite('1. a Saturday with work is a working day');
{
    const d = device(T);
    const saturday = '2026-11-14';
    given('the date is a Saturday', weekdayOf(saturday) === 6, saturday);
    build(d, { workers: [BASE], places: [{ id: 'p_1', name: 'אתר אחד' }], work: baseWork().concat([[saturday, BASE.id, 'p_1']]) });
    const W = W40.concat([saturday]).sort();
    same('the window counts it', readOn(d, T).since, W[W.length - IDLE]);
    check('the day check calls it one', d.call('dayCheckIsWorkingDay', d.State.schedule, saturday, 'actual'));
}

suite('1. fewer than 25 working days: no window, and nobody idle however long ago');
{
    const d = device(T);
    const W24 = W40.slice(16);
    build(d, { workers: [BASE, { id: 'w_first', name: 'רק ביום הראשון', phone: '0520000002' }], places: [{ id: 'p_1', name: 'אתר אחד' }, { id: 'p_2', name: 'אתר שני' }],
        work: baseWork(W24).concat([[W24[0], 'w_first', 'p_2']]) });
    const read = readOn(d, T);
    same('24 working days: since is null', read.since, null);
    same('and nothing is idle, man or site', [read.check.idle, read.check.idleSites], [[], []]);
    const e = device(T);
    build(e, { workers: [BASE], places: [{ id: 'p_1', name: 'אתר אחד' }], work: baseWork(W40.slice(15)) });
    same('25 of them: the window opens on the first', readOn(e, T).since, W40[15]);
}

suite('1. no daily rate, every way it is written - and an hourly rate alone');
{
    const d = device(T);
    build(d, { workers: [BASE], places: [{ id: 'p_1', name: 'אתר אחד' }], work: baseWork() });
    d.run(`State.schedule.workers.push(
        { id: 'w_zero', name: 'אפס', active: true, dailyRate: 0, hourlyRate: 0, phone: '0520000010' },
        { id: 'w_empty', name: 'ריק', active: true, dailyRate: '', hourlyRate: 0, phone: '0520000011' },
        { id: 'w_text', name: 'אפס בטקסט', active: true, dailyRate: '0', hourlyRate: 0, phone: '0520000012' },
        { id: 'w_none', name: 'בלי שדה', active: true, hourlyRate: 0, phone: '0520000013' },
        { id: 'w_minus', name: 'שלילי', active: true, dailyRate: -5, hourlyRate: 0, phone: '0520000014' },
        { id: 'w_hourly', name: 'שעתי בלבד', active: true, dailyRate: 0, hourlyRate: 50, phone: '0520000015' },
        { id: 'w_one', name: 'שקל אחד', active: true, dailyRate: 1, hourlyRate: 0, phone: '0520000016' },
        { id: 'w_typed', name: 'בטקסט', active: true, dailyRate: '450', hourlyRate: 0, phone: '0520000017' },
        { id: 'w_off', name: 'כבוי בלי שכר', active: false, dailyRate: 0, hourlyRate: 0, phone: '0520000018' })`);
    same('0, \'\', \'0\', no field, -5 and an hourly rate alone are «בלי שכר יומי»; 1 and \'450\' are not, nor the man switched off',
        ids(readOn(d, T).check.noRate), ['w_zero', 'w_empty', 'w_text', 'w_none', 'w_minus', 'w_hourly']);
}

suite('1. the evening read as of itself: a key after it changes nothing, and without it tomorrow counts');
{
    const d = device(T);
    const H = { id: 'w_h', name: 'שעתי', dailyRate: 0, hourlyRate: 50, phone: '0520000020' };
    const L = { id: 'w_late', name: 'חוזר מחר', phone: '0520000021' };
    const spec = future => ({
        workers: [BASE, H, L], places: [{ id: 'p_1', name: 'אתר אחד' }],
        work: baseWork().concat(W40.slice(0, 15).map(date => [date, L.id, 'p_1']), W40.slice(37).map(date => [date, H.id, 'p_1']),
            future ? [[TOMORROW, L.id, 'p_1'], [TOMORROW, H.id, 'p_1'], [addDays(T, 4), BASE.id, 'p_1']] : [])
    });
    const withFuture = build(d, spec(true));
    const e = device(T);
    const without = build(e, spec(false));
    const asOf = readOn(d, T, T, withFuture);
    same('as of the evening, the days after it are not read: the same reading as a record without them',
        asOf, readOn(e, T, T, without));
    same('and the same as that record read whole', asOf, readOn(e, T, undefined, without));
    same('as of the evening he is idle, his last day the one before the window', ids(asOf.check.idle), ['w_late']);
    same('his stamped days are counted up to the evening only', asOf.info.zeroStamped.map(x => [x.id, x.days]), [['w_h', 3]]);
    const whole = readOn(d, T, undefined, withFuture);
    same('read whole - the app\'s reading - his site tomorrow keeps him from idle', whole.check.idle, []);
    same('and the stamped day tomorrow is one of his', whole.info.zeroStamped.map(x => [x.id, x.days]), [['w_h', 4]]);
    same('the window is the same either way: a day after today is no working day of it', whole.since, asOf.since);
}

suite('1. days stamped with no daily rate: named under «לידיעה» with how many, for as long as the record holds them');
{
    const d = device(T);
    const days3 = W40.slice(37);
    build(d, {
        workers: [BASE, { id: 'w_h', name: 'שעתי בלבד', dailyRate: 0, hourlyRate: 50, phone: '0520000020' },
            { id: 'w_n', name: 'בלי שום שכר', dailyRate: 0, hourlyRate: 0, phone: '0520000021' },
            { id: 'w_1', name: 'יום אחד בלבד', dailyRate: 0, hourlyRate: 40, phone: '0520000022' },
            { id: 'w_c', name: 'נמחק ונעדר', dailyRate: 0, hourlyRate: 45, phone: '0520000023' }],
        places: [{ id: 'p_1', name: 'אתר אחד' }],
        work: baseWork().concat(days3.map(date => [date, 'w_h', 'p_1']), days3.map(date => [date, 'w_n', 'p_1']),
            [[W40[39], 'w_1', 'p_1']], days3.map(date => [date, 'w_c', 'p_1']))
    });
    same('the hourly-only man\'s days carry a stamp with no daily rate', JSON.stringify(d.call('workerDay', d.State.schedule, days3[0], 'w_h', 'actual')),
        JSON.stringify({ entries: [{ placeId: 'p_1' }], rates: { daily: 0, hourly: 50 } }));
    d.State.commit(d.call('clearWorkerDay', d.State.schedule, days3[0], 'w_c', 'actual'));
    d.State.commit(d.call('markAbsent', d.State.schedule, days3[1], 'w_c', 'actual'));
    let read = readOn(d, T);
    check('the hourly-only man is «בלי שכר יומי»', ids(read.check.noRate).includes('w_h'));
    same('and his three stamped days are named apart; the no-rate man\'s days carry no stamp and are not; one day is one',
        read.info.zeroStamped.map(x => [x.id, x.days]), [['w_h', 3], ['w_1', 1], ['w_c', 1]]);
    check('the no-rate man is «בלי שכר יומי» all the same', ids(read.check.noRate).includes('w_n'));
    same('a stamped day cleared, and one marked absent, are no longer days with a site: one of three is left', 
        read.info.zeroStamped.find(x => x.id === 'w_c').days, 1);
    const chips = findingsOn(d, T).find(f => f.kind === 'zeroStamped').chips.map(chip => chip.text);
    same('the chips say how many: «N ימים», and «יום אחד» for one', chips,
        [`${named('שעתי בלבד')} · 3 ימים`, `${named('יום אחד בלבד')} · יום אחד`, `${named('נמחק ונעדר')} · יום אחד`]);
    // His rate typed, the way the form leaves it (a number on the roster).
    d.run("State.schedule.workers.find(w => w.id === 'w_h').dailyRate = 450; State.schedule.workers.find(w => w.id === 'w_n').dailyRate = 450;");
    read = readOn(d, T);
    check('his rate typed: «בלי שכר יומי» is gone', !ids(read.check.noRate).includes('w_h') && !ids(read.check.noRate).includes('w_n'));
    same('and the stamped days are still three - no rate typed now prices them', read.info.zeroStamped.find(x => x.id === 'w_h').days, 3);
    check('while the no-rate man, whose days had no stamp, has none', !ids(read.info.zeroStamped).includes('w_n'));
}

// ================================================================== 2. the phone family
//
// tests/seder.test.mjs's own spellings (its usable list and its unusable one), the three of
// the design round's probe, and every row revision 2 added (contract.md, the phone family).
const PHONES = [
    // the seder opens them: on no line
    ['052-884-1930', 'ok'], ['0528841930', 'ok'], [' 052 884 1930 ', 'ok'], ['+972 52-884-1930', 'ok'],
    ['972528841930', 'ok'], ['00972-52-884-1930', 'ok'], ['+972 (0)52-884-1930', 'ok'], ['٠٥٢٨٨٤١٩٣٠', 'ok'],
    ['0587654321', 'ok'], ['۰۵۲۸۸۴۱۹۳۰', 'ok'], ['+0528841930', 'ok'], ['٠٥٢-884-1930', 'ok'], ['٠٥٣-884-1930', 'ok'],
    // written as an Israeli number, and it will not open: «כדאי לבדוק»
    ['1234', 'bad'], ['03-1234567', 'bad'], ['052-884-193', 'bad'], ['052-884-19301', 'bad'],
    ['0528841930 / 0541234567', 'bad'], ['972-3-1234567', 'bad'], ['528841930', 'bad'], ['٠٥٢٨', 'bad'],
    ['8841930', 'bad'], ['52884193', 'bad'], ['5288419301', 'bad'], ['5551234', 'bad'], ['528841930 / 541234567', 'bad'],
    ['۰۵۲۸', 'bad'], ['+972 3-1234567', 'bad'], ['00972 3 1234567', 'bad'], ['+05288419', 'bad'], ['O528841930', 'bad'],
    // another country's, as typed: «לידיעה»
    ['+970 59-123-4567', 'other'], ['+1 212 555 0100', 'other'], ['00970599123456', 'other'], ['+44 7700 900123', 'other'],
    ['(+970) 59-123-4567', 'other'],
    // THE KNOWN MISS, pinned as it is: a mobile without its 0 behind a doubled zero reads as
    // +52. It errs the safe way - under «לידיעה», where the seder's row still says «אין מספר
    // טלפון תקין» - and never puts a foreign number in the counted tier.
    ['00528841930', 'other'],
    // no digit typed at all
    ['', 'none'], ['   ', 'none'], [null, 'none'], [undefined, 'none'], ['אין', 'none'], ['+', 'none']
];
const LINE_OF = { ok: null, bad: 'badPhone', other: 'otherPhone', none: 'noPhone' };

suite('2. the phone family: every spelling on exactly the line the contract gives it');
{
    const d = device(T);
    build(d, { workers: [BASE], places: [{ id: 'p_1', name: 'אתר אחד' }], work: baseWork() });
    d.ctx.__phones = PHONES.map(([typed]) => typed);
    d.run(`__phones.forEach((phone, at) => {
        const id = 'w_p' + String(at).padStart(2, '0');
        State.schedule.workers.push({ id, name: 'טלפון ' + at, active: true, dailyRate: 400, hourlyRate: 0, phone });
        assignPlace(State.schedule, ${JSON.stringify(T)}, id, 'actual', 'p_1');
    })`);
    const read = readOn(d, T);
    const lineOf = id => (read.check.badPhone.some(x => x.id === id) ? 'badPhone' : null)
        || (read.info.otherPhone.some(x => x.id === id) ? 'otherPhone' : null)
        || (read.info.noPhone.some(x => x.id === id) ? 'noPhone' : null);
    const wrong = [];
    PHONES.forEach(([typed, kind], at) => {
        const id = 'w_p' + String(at).padStart(2, '0');
        d.ctx.__typed = typed;
        const said = d.run('crewCheckPhoneKind(__typed)');
        if (said !== kind) wrong.push(`${JSON.stringify(typed)}: ${said}, not ${kind}`);
        if (lineOf(id) !== LINE_OF[kind]) wrong.push(`${JSON.stringify(typed)} on ${lineOf(id)}, not ${LINE_OF[kind]}`);
        const opens = d.run('sederWaNumber(__typed)') !== '';
        if (opens !== (kind === 'ok')) wrong.push(`${JSON.stringify(typed)}: the seder ${opens ? 'opens' : 'refuses'} it`);
    });
    same(`all ${PHONES.length} spellings: the kind, the line, and the seder's own answer`, wrong, []);
    same('a number on a line is the number as typed, trimmed', read.check.badPhone.map(x => x.phone).slice(0, 4),
        ['1234', '03-1234567', '052-884-193', '052-884-19301']);
    same('the five Israeli numbers gone wrong that revision 1 called foreign are counted', ['8841930', '52884193', '5288419301', '5551234',
        '528841930 / 541234567'].map(typed => d.call('crewCheckPhoneKind', typed)), ['bad', 'bad', 'bad', 'bad', 'bad']);
    check('every kind of the four is on the list at least twice', ['ok', 'bad', 'other', 'none'].every(kind =>
        PHONES.filter(row => row[1] === kind).length >= 2));
}

// ================================================================== 3. the agreements
//
// THE DIALOG SAYS WHAT THE ROW AND THE SEDER ALREADY SAY, NEVER SOMETHING ELSE. Asked of the
// production functions, on the record as it stands:
//   - a man is in a «שם כפול» finding exactly when his row carries the badge (hasDuplicateName);
//   - in a «מספר משותף» finding exactly when workersSharingPhone names another ACTIVE man -
//     except where he and every such man have numbers the seder opens and reads as different;
//   - on exactly one of the three phone lines exactly when the seder refuses his number - and
//     so every active man on today's or tomorrow's seder list with no number is on one;
//   - his stamped days named exactly when the pay sheet, asked on a copy of the record with
//     his rate set to 1, leaves a day of his unpriced (never by arithmetic of its own);
//   - the calendar the day check's, date for date.
const AGREE = String.raw`(function (S, today, read) {
    const bad = [];
    const active = S.workers.filter(w => w && w.active !== false);
    const inName = new Set(read.check.sameName.flatMap(g => g.men.map(m => m.id)));
    const inShared = new Set(read.check.sharedPhone.flatMap(g => g.men.map(m => m.id)));
    const lines = w => (read.check.badPhone.some(m => m.id === w.id) ? 1 : 0) + (read.info.otherPhone.some(m => m.id === w.id) ? 1 : 0)
        + (/[0-9٠-٩۰-۹]/.test(String(w.phone === undefined || w.phone === null ? '' : w.phone)) ? 0 : 1);
    const zero = new Set(read.info.zeroStamped.map(m => m.id));
    const held = State.schedule;
    State.schedule = S;
    try {
        active.forEach(w => {
            if (inName.has(w.id) !== hasDuplicateName(w)) bad.push('sameName ' + w.id);
            const others = workersSharingPhone(S, w.phone, w.id).filter(o => o.active !== false);
            const mine = sederWaNumber(w.phone);
            const apart = others.length > 0 && mine !== '' && others.every(o => sederWaNumber(o.phone) !== '' && sederWaNumber(o.phone) !== mine);
            if (inShared.has(w.id) !== (others.length > 0 && !apart)) bad.push('sharedPhone ' + w.id);
            if (lines(w) !== (mine === '' ? 1 : 0)) bad.push('phone lines ' + w.id + ' ' + lines(w));
            const copy = Object.assign({}, S, { workers: S.workers.map(x => (x.id === w.id ? Object.assign({}, x, { dailyRate: 1 }) : x)) });
            const row = payrollReport(copy, '0000-01-01', '9999-12-31').find(r => r.workerId === w.id);
            const unpriced = Boolean(row) && row.attendanceDays > 0 && row.amount === null;
            if (zero.has(w.id) !== unpriced) bad.push('zeroStamped ' + w.id);
        });
    } finally {
        State.schedule = held;
    }
    const next = toLocalDateStr(new Date(parseLocalDate(today).getFullYear(), parseLocalDate(today).getMonth(), parseLocalDate(today).getDate() + 1));
    [today, next].forEach(date => sederCrew(S, date, 'actual').forEach(row => {
        const w = S.workers.find(x => x.id === row.workerId);
        if (w && w.active !== false && row.number === '' && lines(w) !== 1) bad.push('sederCrew ' + date + ' ' + w.id);
    }));
    return bad;
})`;

// The calendar, date for date: each working day is the window's first exactly when 24 more
// follow it up to the evening - read as of every evening of the record.
function windowAgrees(d, today) {
    const S = d.State.schedule;
    d.ctx.__S = S;
    const keys = Object.keys(S.days).filter(date => d.call('isRealDate', date)).sort();
    const byDayCheck = keys.filter(date => d.call('dayCheckIsWorkingDay', S, date, 'actual'));
    const byHand = keys.filter(date => Object.values((S.days[date] || {}).actual || {})
        .some(record => record && !record.absent && Array.isArray(record.entries) && record.entries.length > 0));
    const wrong = [];
    if (JSON.stringify(byDayCheck) !== JSON.stringify(byHand)) wrong.push('the day check and the record differ');
    keys.filter(date => date <= today).forEach(evening => {
        const W = byDayCheck.filter(date => date <= evening);
        const expected = W.length >= IDLE ? W[W.length - IDLE] : null;
        const said = d.run(`crewCheckRead(__S, ${JSON.stringify(evening)}, 'actual', ${JSON.stringify(evening)}).since`);
        if (said !== expected) wrong.push(`${evening}: ${said}, not ${expected}`);
    });
    return { wrong, working: byDayCheck.filter(date => date <= today).length };
}

const SEEDS = [
    ['tests/screens.mjs\'s seed', () => screensSeed(), SCREENS_TODAY],
    ['tests/owes.seed.mjs', () => seedFrom(owesSeedCrew, OWES_TODAY), OWES_TODAY],
    ['tests/weeklyclose.seed.mjs', () => seedFrom(weeklySeedCrew, WEEKLY_TODAY), WEEKLY_TODAY],
    ['the time-season record', () => timeSeason(), '2026-11-19']
];
const seeded = {};
for (const [label, make, today] of SEEDS) {
    suite(`3. the agreements, on ${label}`);
    const d = make();
    const read = readOn(d, today);
    seeded[label] = { d, today, read };
    d.ctx.__S = d.State.schedule; d.ctx.__T = today; d.ctx.__R = read;
    same('the row\'s badges, the seder\'s refusals and the pay sheet\'s unpriced days, man by man', d.run(`${AGREE}(__S, __T, __R)`), []);
    const calendar = windowAgrees(d, today);
    same(`the window, as of each of its evenings, where the day check's calendar puts it (${calendar.working} working days)`, calendar.wrong, []);
}

suite('3. what each seed says, as the contract measured it');
{
    const say = label => seeded[label].read;
    const screens = say('tests/screens.mjs\'s seed');
    same('the screens\' seed: nothing to check, fewer than 25 working days', [checkEmpty(screens), screens.since], [true, null]);
    same('and for information: two men with no number, three who never worked',
        [names(screens.info.noPhone), names(screens.info.never)], [['חאלד סלאמה', 'נועם פרץ'], ['וליד זועבי', 'אבי דהן', 'ראמי חורי']]);
    const owes = say('tests/owes.seed.mjs');
    same('the owes seed: nothing to check, the window open, and every one of its nine with no number',
        [checkEmpty(owes), owes.since !== null, owes.info.noPhone.length, owes.counts.men], [true, true, 9, 9]);
    const weekly = say('tests/weeklyclose.seed.mjs');
    same('the weekly-close seed: nothing at all but the too-few line (24 working days)', [checkEmpty(weekly), infoEmpty(weekly), weekly.since],
        [true, true, null]);
    check('its man who "stopped coming" on 22/10 is not idle at 25 working days', weekly.check.idle.length === 0
        && seeded['tests/weeklyclose.seed.mjs'].d.State.schedule.workers.some(w => w.name === 'ג\'מאל בשארה'));
    const time = say('the time-season record');
    same('the time-season record: every line empty', [checkEmpty(time), infoEmpty(time), time.counts], [true, true, { men: 40, sites: 6 }]);
}

suite('3. the agreements, on records made to have every finding');
{
    const d = withFindings(screensSeed());
    const read = readOn(d, SCREENS_TODAY);
    d.ctx.__S = d.State.schedule; d.ctx.__T = SCREENS_TODAY; d.ctx.__R = read;
    same('the \'with findings\' state of the screens\' seed: every agreement holds', d.run(`${AGREE}(__S, __T, __R)`), []);
    const counted = [read.check.noRate, read.check.badPhone, read.check.sharedPhone, read.check.sameName, read.check.idle,
        read.check.idleSites, read.info.otherPhone, read.info.noPhone, read.info.zeroStamped, read.info.never, read.info.neverSites]
        .map(list => list.length);
    check('and it has something on every line, so none of them held over nothing', counted.every(n => n > 0), JSON.stringify(counted));
    seeded.withFindings = { d, read };

    const e = device(T);
    build(e, {
        workers: [BASE,
            { id: 'w_a', name: 'ספרות מעורבות א', phone: '٠٥٢-884-1930' }, { id: 'w_b', name: 'ספרות מעורבות ב', phone: '٠٥٣-884-1930' },
            { id: 'w_c', name: 'שני כתיבים א', phone: '052-884-1931' }, { id: 'w_d', name: 'שני כתיבים ב', phone: '+972 52 884 1931' },
            { id: 'w_e', name: 'עם כבוי', phone: '0520000077' }, { id: 'w_f', name: 'כבוי', phone: '052-000-0077', active: false },
            { id: 'w_g', name: 'שלושה', phone: '0520000088' }, { id: 'w_h', name: 'שלושה', phone: '0520000089' },
            { id: 'w_i', name: 'שלושה', phone: '0520000090', active: false }, { id: 'w_j', name: 'מספר שבור משותף', phone: '1234567' },
            { id: 'w_k', name: 'מספר שבור משותף ב', phone: '123-4567' }],
        places: [{ id: 'p_1', name: 'אתר אחד' }],
        work: baseWork().concat(['w_a', 'w_b', 'w_c', 'w_d', 'w_e', 'w_g', 'w_h', 'w_j', 'w_k'].map(id => [T, id, 'p_1']))
    });
    const r = readOn(e, T);
    e.ctx.__S = e.State.schedule; e.ctx.__T = T; e.ctx.__R = r;
    same('every agreement holds here too', e.run(`${AGREE}(__S, __T, __R)`), []);
    same('two usable numbers the roster calls one (normalisePhone reads ASCII digits only) - and the row badges both',
        [e.call('samePhone', '٠٥٢-884-1930', '٠٥٣-884-1930'), e.call('normalisePhone', '٠٥٢-884-1930')], [true, '8841930']);
    same('are not one number here: the seder reads them apart', r.check.sharedPhone.map(g => ids(g.men)),
        [['w_c', 'w_d'], ['w_j', 'w_k']]);
    same('052-884-1931 and +972 52 884 1931 are one finding, its number the first man\'s as he typed it',
        [r.check.sharedPhone[0].number, r.check.sharedPhone[0].key], ['052-884-1931', '0528841931']);
    check('a number shared with a man switched off only is not named', !JSON.stringify(r.check.sharedPhone).includes('w_e'));
    same('two numbers that will not open, written two ways, are one number on two rows',
        [r.check.sharedPhone[1].number, ids(r.check.badPhone)], ['1234567', ['w_j', 'w_k']]);
    same('a name on three rows, one of them switched off, is one finding of the two active men', r.check.sameName,
        [{ name: 'שלושה', men: [{ id: 'w_g', name: 'שלושה' }, { id: 'w_h', name: 'שלושה' }] }]);

    // A third man on the Arabic-Indic number: the pair that share it are one finding.
    e.run("State.schedule.workers.push({ id: 'w_z', name: 'שלישי', active: true, dailyRate: 400, hourlyRate: 0, phone: '٠٥٢-884-1930' })");
    const third = readOn(e, T);
    same('a third man on \'٠٥٢-884-1930\' makes ONE finding of the two who share it', ids(third.check.sharedPhone[0].men), ['w_a', 'w_z']);
    e.ctx.__R = third;
    same('and the agreements hold with him', e.run(`${AGREE}(__S, __T, __R)`), []);

    // The near miss: the seder lists an archived man - it filters nothing but holes.
    const f = device(T);
    build(f, { workers: [{ id: 'w_1', name: 'פעיל', phone: '' }, { id: 'w_2', name: 'כבוי', phone: '', active: false }],
        places: [{ id: 'p_1', name: 'אתר אחד' }], work: [[TOMORROW, 'w_1', 'p_1'], [TOMORROW, 'w_2', 'p_1']] });
    const crew = f.call('sederCrew', f.State.schedule, TOMORROW, 'actual').map(row => [row.workerId, row.number]);
    const near = readOn(f, T);
    same('an archived man with no number and a site tomorrow is on tomorrow\'s seder list, with no number', crew, [['w_1', ''], ['w_2', '']]);
    same('and on no line here; the active one is on one', [JSON.stringify(near).includes('w_2'), ids(near.info.noPhone)], [false, ['w_1']]);
}

// ================================================================== 4. the tiers
//
// A DOM that holds nodes and can be read back (tests/moneydom.mjs), with the dialog's own
// ids registered, the way tests/sitecard.test.mjs runs its card. Roster.js's lists are left
// unregistered, so the crew screen's own draws take their null branch.
const DIALOG_IDS = ['crewCheckFoot', 'crewCheckModal', 'crewCheckTitle', 'crewCheckContext', 'crewCheckList',
    'crewCheckLead', 'crewCheckClose', 'workerFormModal', 'workerFormMore', 'workerFormName', 'workerFormDaily', 'workerFormPhone'];
function withDom(d) {
    const dom = makeDom();
    DIALOG_IDS.forEach(id => dom.register(id));
    const make = dom.createElement;
    dom.createElement = tag => { const node = make(tag); node.dataset = {}; return node; };
    d.ctx.document = dom;
    d.dom = dom;
    return dom;
}
// What a drawn list says: its children in order, each as [class, text] - a group as its
// heading and its findings.
function drawn(container) {
    return container.children.map(node => {
        if (node.tagName === 'SECTION') {
            return [node.className, node.children[0].textContent, node.children.slice(1).map(finding => ({
                kind: finding.dataset.kind, say: finding.children[0].textContent,
                chips: finding.children[1].children.map(chip => [chip.tagName, chip.textContent, chip.getAttribute('aria-label')]),
                note: finding.children[2] ? finding.children[2].textContent : null }))];
        }
        return [node.className, node.textContent];
    });
}
function drawInto(d, today) {
    withDom(d);
    const box = d.dom.createElement('div');
    d.ctx.__box = box;
    d.ctx.__today = today;
    const count = d.run('renderCrewCheckInto(__box, __today)');
    return { count, box, said: drawn(box) };
}

const WITH_FINDINGS = (() => {
    const go = name => `עריכת הפרטים של ${named(name)}`;
    const row = name => `הצג את ${named(name)} ברשימת העובדים`;
    const site = name => `הצג את ${named(name)} ברשימת האתרים`;
    const more = (text, door) => `${text} - ${door}`;
    const man = (text, aria, door, workerId, field) => Object.assign({ text, aria, door, workerId }, field ? { field } : {});
    return [
        { kind: 'noRate', tier: 'check', say: 'בלי שכר יומי - ימי העבודה שלו לא יחושבו בשכר:', note: null,
            chips: [man('עלי חסן', go('עלי חסן'), 'form', 'w02', 'daily')] },
        { kind: 'badPhone', tier: 'check', say: 'אין מספר טלפון תקין - המספר שנרשם לו לא ייפתח בוואטסאפ:', note: null,
            chips: [man(`${named('מוחמד אבו ראס חוסיין')} · ${numbered('03-5551234')}`,
                more(`${named('מוחמד אבו ראס חוסיין')} · ${numbered('03-5551234')}`, go('מוחמד אבו ראס חוסיין')), 'form', 'w03', 'phone')] },
        { kind: 'sharedPhone', tier: 'check', say: `מספר משותף - ${numbered('0520000010')} רשום אצל 2 עובדים פעילים:`, note: null,
            chips: [man('דוד כהן', go('דוד כהן'), 'form', 'w01', 'phone'), man('אחמד נסאר', go('אחמד נסאר'), 'form', 'w05', 'phone')] },
        { kind: 'sameName', tier: 'check', say: `שם כפול - 2 עובדים פעילים בשם ${named('וליד זועבי')}:`, note: null,
            chips: [man(`${named('וליד זועבי')} · 1`, more(`${named('וליד זועבי')} · 1`, go('וליד זועבי')), 'form', 'w12', 'name'),
                man(`${named('וליד זועבי')} · 2`, more(`${named('וליד זועבי')} · 2`, go('וליד זועבי')), 'form', 'w13', 'name')] },
        { kind: 'idle', tier: 'check', say: 'לא עבד ב-25 ימי העבודה האחרונים (מאז 12/10), ועדיין פעיל:',
            note: 'אם מכבים עובד בכפתור «פעיל»: הימים שכבר נרשמו יישמרו, והעובד לא יופיע ברשימה היומית.',
            chips: [man(`${named('ראמי חורי')} · 11/10`, more(`${named('ראמי חורי')} · 11/10`, row('ראמי חורי')), 'row', 'w14')] },
        { kind: 'idleSites', tier: 'check', say: 'אתר שלא נרשמה בו עבודה ב-25 ימי העבודה האחרונים (מאז 12/10), ועדיין פעיל:', note: null,
            chips: [{ text: `${named('חדרה - בית הספר')} · 11/10`, aria: more(`${named('חדרה - בית הספר')} · 11/10`, site('חדרה - בית הספר')),
                door: 'site', placeId: 'p6' }] },
        { kind: 'otherPhone', tier: 'info', say: 'מספר שאינו נייד ישראלי - אי אפשר לפתוח לו הודעה בוואטסאפ:', note: null,
            chips: [man(`${named('יוסי מזרחי')} · ${numbered('+970 59-123-4567')}`,
                more(`${named('יוסי מזרחי')} · ${numbered('+970 59-123-4567')}`, go('יוסי מזרחי')), 'form', 'w04', 'phone')] },
        { kind: 'noPhone', tier: 'info', say: 'בלי טלפון - אי אפשר לפתוח להם הודעה בוואטסאפ:', note: null,
            chips: [man('חאלד סלאמה', go('חאלד סלאמה'), 'form', 'w10', 'phone'), man('נועם פרץ', go('נועם פרץ'), 'form', 'w11', 'phone')] },
        { kind: 'zeroStamped', tier: 'info', say: 'ימים שנרשמו לו בלי שכר יומי יישארו בלי סכום גם אחרי שיוזן שכר:', note: null,
            chips: [man(`${named('עלי חסן')} · יום אחד`, more(`${named('עלי חסן')} · יום אחד`, row('עלי חסן')), 'row', 'w02')] },
        { kind: 'never', tier: 'info', say: 'פעילים בלי אף יום עבודה רשום:', note: null,
            chips: [man('וליד זועבי', row('וליד זועבי'), 'row', 'w12'), man('וליד זועבי', row('וליד זועבי'), 'row', 'w13')] },
        { kind: 'neverSites', tier: 'info', say: 'אתר פעיל בלי אף יום עבודה רשום:', note: null,
            chips: [{ text: 'כפר סבא - מרכז', aria: site('כפר סבא - מרכז'), door: 'site', placeId: 'p7' }] }
    ];
})();

suite('4. the flat list the dialog draws, on the \'with findings\' state: every finding, in order, word for word');
{
    const { d } = seeded.withFindings;
    const flat = findingsOn(d, SCREENS_TODAY);
    same('the whole list', flat, WITH_FINDINGS);
    same('the documented shape: { kind, tier, say, note, chips } and each chip { text, aria, door, workerId | placeId, field? }',
        [...new Set(flat.map(f => Object.keys(f).join()))].concat([...new Set(flat.flatMap(f => f.chips.map(c => Object.keys(c).sort().join())))].sort()),
        ['kind,tier,say,note,chips', 'aria,door,field,text,workerId', 'aria,door,placeId,text', 'aria,door,text,workerId']);
    same('every door is the one the table gives its kind', [...new Set(flat.map(f => `${f.kind}:${[...new Set(f.chips.map(c => c.door + (c.field ? '/' + c.field : '')))].join()}`))],
        ['noRate:form/daily', 'badPhone:form/phone', 'sharedPhone:form/phone', 'sameName:form/name', 'idle:row', 'idleSites:site',
            'otherPhone:form/phone', 'noPhone:form/phone', 'zeroStamped:row', 'never:row', 'neverSites:site']);
}

suite('4. the calm line stands exactly when there is nothing to check, and «לידיעה» is never counted');
{
    const cases = [['the screens\' seed', seeded['tests/screens.mjs\'s seed']], ['the owes seed', seeded['tests/owes.seed.mjs']],
        ['the weekly-close seed', seeded['tests/weeklyclose.seed.mjs']], ['the time-season record', seeded['the time-season record']]];
    cases.forEach(([label, { d, today, read }]) => {
        const { count, said } = drawInto(d, today);
        const calm = said.some(([cls]) => cls === 'daycheck-clean');
        const tooFew = said.some(([cls]) => cls === 'crewcheck-note');
        same(`${label}: the calm line, the too-few line and the count drawn are the reading's`,
            [calm, tooFew, count], [checkEmpty(read), read.since === null, findingsOn(d, today).length]);
    });
    const owes = drawInto(seeded['tests/owes.seed.mjs'].d, OWES_TODAY).said;
    same('the owes seed: nine men under «לידיעה» and the calm line standing over them', [owes[0], owes[1][1], owes[1][2].length],
        [['daycheck-clean', '✓ לא נמצא בצוות דבר שכדאי לבדוק.'], 'לידיעה', 1]);
}

suite('4. the too-few line: first in the list exactly while the record holds fewer than 25 working days');
{
    const first = label => drawInto(seeded[label].d, seeded[label].today).said[0];
    const line = ['crewcheck-note', 'עדיין אין 25 ימי עבודה רשומים, ולכן לא נבדקו עובדים ואתרים בלי עבודה זמן רב.'];
    same('on the screens\' seed (15 working days)', first('tests/screens.mjs\'s seed'), line);
    same('on the weekly-close seed (24)', first('tests/weeklyclose.seed.mjs'), line);
    same('not on the owes seed (30): it opens on the calm line', first('tests/owes.seed.mjs')[0], 'daycheck-clean');
    same('and it is not a finding: the screens\' seed draws two', drawInto(seeded['tests/screens.mjs\'s seed'].d, SCREENS_TODAY).count, 2);
}

suite('4. drawn, the list is the flat list: groups in order, each finding its sentence, its chips and its note');
{
    const { d } = seeded.withFindings;
    const { count, said } = drawInto(d, SCREENS_TODAY);
    same('nothing above the groups: no calm line, no too-few line (26 working days)', said.length, 2);
    same('«כדאי לבדוק» and then «לידיעה»', said.map(group => [group[0], group[1]]),
        [['daycheck-group daycheck-check', 'כדאי לבדוק'], ['daycheck-group daycheck-info', 'לידיעה']]);
    const flat = WITH_FINDINGS;
    same('every finding, its sentence, its chips as the words and the label of each, and the idle men\'s note',
        said.flatMap(group => group[2]), flat.map(f => ({ kind: f.kind, say: f.say,
            chips: f.chips.map(c => ['SPAN', c.text, null]), note: f.note })));
    same('the count is the findings drawn', count, flat.length);
    // On the crew screen the names are doors; anywhere else they are names.
    d.ctx.currentView = 'roster';
    const live = drawInto(d, SCREENS_TODAY).said;
    same('on the crew screen every chip is a button with its label', live.flatMap(group => group[2]).flatMap(f => f.chips),
        flat.flatMap(f => f.chips.map(c => ['BUTTON', c.text, c.aria])));
    delete d.ctx.currentView;
}

// ================================================================== 5. the words

suite('5. every word the check says, pinned');
{
    const d = seeded.withFindings.d;
    const T_ = d.global('CREW_CHECK_TEXT');
    const R = d.global('CREW_CHECK_REUSED');
    same('nothing else in the block', Object.keys(T_).sort(), ['badPhone', 'chip', 'clean', 'counts', 'days', 'entry', 'goForm', 'goRow',
        'goSite', 'idle', 'idleSites', 'archiveIf', 'never', 'neverSites', 'noPhone', 'noRate', 'oneDay', 'otherPhone', 'sameName',
        'sharedPhone', 'title', 'tooFew', 'zeroStamped'].sort());
    same('the way in, the title, the line under it, the too-few line and the calm line',
        [T_.entry, T_.title, T_.counts(40, 6), T_.tooFew(25), T_.clean],
        ['בדיקת הצוות', 'בדיקת הצוות', 'עובדים פעילים: 40 · אתרים פעילים: 6',
            'עדיין אין 25 ימי עבודה רשומים, ולכן לא נבדקו עובדים ואתרים בלי עבודה זמן רב.', '✓ לא נמצא בצוות דבר שכדאי לבדוק.']);
    same('what a door says aloud', [T_.goForm(named('אחמד')), T_.goRow(named('אחמד')), T_.goSite(named('הרצליה'))],
        [`עריכת הפרטים של ${named('אחמד')}`, `הצג את ${named('אחמד')} ברשימת העובדים`, `הצג את ${named('הרצליה')} ברשימת האתרים`]);
    same('«כדאי לבדוק», each line for one and for many', [T_.noRate(1), T_.noRate(2), T_.badPhone(1), T_.badPhone(3),
        T_.sharedPhone(numbered('052-884-1930'), 2), T_.sameName(2, named('אחמד')), T_.idle(1, 25, '12/10'), T_.idle(2, 25, '12/10'),
        T_.archiveIf, T_.idleSites(1, 25, '12/10'), T_.idleSites(2, 25, '12/10')], [
        'בלי שכר יומי - ימי העבודה שלו לא יחושבו בשכר:',
        'בלי שכר יומי - ימי העבודה שלהם לא יחושבו בשכר:',
        'אין מספר טלפון תקין - המספר שנרשם לו לא ייפתח בוואטסאפ:',
        'אין מספר טלפון תקין - המספרים שנרשמו להם לא ייפתחו בוואטסאפ:',
        `מספר משותף - ${numbered('052-884-1930')} רשום אצל 2 עובדים פעילים:`,
        `שם כפול - 2 עובדים פעילים בשם ${named('אחמד')}:`,
        'לא עבד ב-25 ימי העבודה האחרונים (מאז 12/10), ועדיין פעיל:',
        'לא עבדו ב-25 ימי העבודה האחרונים (מאז 12/10), ועדיין פעילים:',
        'אם מכבים עובד בכפתור «פעיל»:',
        'אתר שלא נרשמה בו עבודה ב-25 ימי העבודה האחרונים (מאז 12/10), ועדיין פעיל:',
        'אתרים שלא נרשמה בהם עבודה ב-25 ימי העבודה האחרונים (מאז 12/10), ועדיין פעילים:']);
    same('«לידיעה», each line for one and for many', [T_.otherPhone(1), T_.otherPhone(2), T_.noPhone(1), T_.noPhone(2),
        T_.zeroStamped(1), T_.zeroStamped(2), T_.never(1), T_.never(2), T_.neverSites(1), T_.neverSites(2)], [
        'מספר שאינו נייד ישראלי - אי אפשר לפתוח לו הודעה בוואטסאפ:',
        'מספרים שאינם ניידים ישראליים - אי אפשר לפתוח להם הודעה בוואטסאפ:',
        'בלי טלפון - אי אפשר לפתוח לו הודעה בוואטסאפ:',
        'בלי טלפון - אי אפשר לפתוח להם הודעה בוואטסאפ:',
        'ימים שנרשמו לו בלי שכר יומי יישארו בלי סכום גם אחרי שיוזן שכר:',
        'ימים שנרשמו להם בלי שכר יומי יישארו בלי סכום גם אחרי שיוזן שכר:',
        'פעיל בלי אף יום עבודה רשום:', 'פעילים בלי אף יום עבודה רשום:',
        'אתר פעיל בלי אף יום עבודה רשום:', 'אתרים פעילים בלי אף יום עבודה רשום:']);
    same('a chip that says more than the name, and the two counts of stamped days',
        [T_.chip(named('אחמד'), '2'), T_.oneDay, T_.days(3), T_.chip(named('אחמד'), T_.oneDay)],
        [`${named('אחמד')} · 2`, 'יום אחד', '3 ימים', `${named('אחמד')} · יום אחד`]);
    same('the idle men\'s note, one line: the condition and then the archive question\'s own sentence',
        `${T_.archiveIf} ${R.archiveSays}`, 'אם מכבים עובד בכפתור «פעיל»: הימים שכבר נרשמו יישמרו, והעובד לא יופיע ברשימה היומית.');
    check('the block is frozen, and so is the borrowed one', Object.isFrozen(T_) && Object.isFrozen(R));
    same('the threshold is one constant', d.global('CREW_CHECK_IDLE_DAYS'), 25);
}

suite('5. every borrowed word is its owner\'s, found in the owner\'s source');
{
    const d = seeded.withFindings.d;
    const R = d.global('CREW_CHECK_REUSED');
    const DAY = d.global('DAY_CHECK_TEXT');
    const SEDER = d.global('SEDER_TEXT');
    const daycheck = source('js/ui/daycheck.js');
    const seder = source('js/ui/seder.js');
    const roster = source('js/ui/roster.js');
    same('nothing else is borrowed', Object.keys(R).sort(), ['archiveSays', 'close', 'headCheck', 'headInfo', 'lead', 'noPhone',
        'noPhoneRow', 'sameName', 'shared'].sort());
    same('the day check\'s four, read from its block', [R.headCheck, R.headInfo, R.lead, R.close], [DAY.headCheck, DAY.headInfo, DAY.lead, DAY.close]);
    check('and written there', [R.headCheck, R.headInfo, R.lead, R.close].every(word => daycheck.includes(`'${word}'`)));
    same('the seder\'s «אין מספר טלפון תקין», read from its block', R.noPhone, SEDER.noPhone);
    check('and written there', seder.includes(`noPhone: '${R.noPhone}'`));
    check('«בלי טלפון» is a man\'s meta line on the crew screen', roster.includes(`el('span', null, '${R.noPhoneRow}')`));
    check('«שם כפול» and «מספר משותף» are the crew row\'s badges', roster.includes(`el('span', 'badge badge-warn', '${R.sameName}')`)
        && roster.includes(`el('span', 'badge badge-warn', '${R.shared}')`));
    check('the archive sentence is the body of «להסתיר זמנית את X?», word for word',
        roster.includes(`message: '${R.archiveSays}'`) && roster.includes('title: `להסתיר זמנית את ${before.name}?`'));
    check('and «פעיל» in the condition before it is the switch\'s own word', roster.includes("button(enabled ? 'פעיל' : 'כבוי',")
        && d.global('CREW_CHECK_TEXT').archiveIf.includes('«פעיל»'));
}

suite('5. names, numbers and dates, and what the words never say');
{
    const d = seeded.withFindings.d;
    same('a date this year is dd/mm, another year\'s dd/mm/yyyy', [d.call('crewCheckDateWord', '2026-10-11', '2026-11-10'),
        d.call('crewCheckDateWord', '2025-12-28', '2026-01-05'), d.call('crewCheckDateWord', '2026-01-02', '2026-01-05')],
    ['11/10', '28/12/2025', '02/01']);
    const flat = WITH_FINDINGS;
    check('every name in a sentence or a chip with more is FSI…PDI, every number LRI…PDI',
        flat.find(f => f.kind === 'sameName').say.includes(named('וליד זועבי'))
        && flat.find(f => f.kind === 'badPhone').chips[0].text === `${named('מוחמד אבו ראס חוסיין')} · ${numbered('03-5551234')}`
        && flat.find(f => f.kind === 'sharedPhone').say.includes(numbered('0520000010')));
    const T_ = d.global('CREW_CHECK_TEXT');
    const everything = Object.keys(T_).map(key => (typeof T_[key] === 'function' ? [T_[key](1, 1, 'x'), T_[key](2, 2, 'x')].join('\n') : T_[key]))
        .concat(Object.values(d.global('CREW_CHECK_REUSED'))).join('\n');
    check('no word of it says a man left, or that anything was sent', everything.length > 1000
        && !/נשלח|עזב|עזבו|סיים|הפסיק/.test(everything), String(everything.length));
    // tests/reportnames.test.mjs's rule, over this file: no word mixes Hebrew and Arabic letters.
    const HEBREW = /\p{Script=Hebrew}/u;
    const ARABIC_LETTER = /(?=\p{Script=Arabic})\p{L}/u;
    const mixed = (CHECK.match(/[\p{L}\p{M}]+/gu) || []).filter(word => HEBREW.test(word) && ARABIC_LETTER.test(word));
    const codeLines = CHECK.split('\n').filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line) && HEBREW.test(line) && ARABIC_LETTER.test(line));
    same('no word in the file mixes Hebrew and Arabic letters, and no line of code holds both', [mixed, codeLines], [[], []]);
    // No Hebrew outside the two blocks: a word typed straight into the code is a word no test pins.
    const code = CHECK.split('\n').map(line => line.replace(/\/\/.*$/, '')).join('\n');
    const from = code.indexOf('const CREW_CHECK_TEXT');
    const to = code.indexOf('});', code.indexOf('const CREW_CHECK_REUSED'));
    given('the two blocks are in the file', from !== -1 && to > from);
    same('and there is no Hebrew in the code outside them', (code.slice(0, from) + code.slice(to)).match(/[֐-׿]+/g) || [], []);
}

// THE «מה חדש» ITEM, handed to the integrator (it goes into WHATSNEW_BUILDS in the commit that
// moves the build stamps - js/ui/whatsnew.js is not this track's). Pinned here word for word,
// held to the facts it states, and - once whatsnew.js carries it - held to that copy.
const NEWS = Object.freeze({
    title: 'בדיקת הצוות',
    text: 'בסוף מסך הצוות: מה כדאי לסדר בעובדים ובאתרים - שכר יומי חסר, טלפון שלא ייפתח בוואטסאפ, שם או מספר כפול, ועובדים ואתרים בלי עבודה ב-25 ימי העבודה האחרונים.',
    where: 'צוות ← בדיקת הצוות (בסוף המסך)',
    go: 'crewcheck'
});
suite('5. the «מה חדש» item for the integrator');
{
    const d = seeded.withFindings.d;
    const T_ = d.global('CREW_CHECK_TEXT');
    same('its title is the button\'s and the dialog\'s', [NEWS.title, NEWS.where.includes(`← ${T_.entry} `)], [T_.title, true]);
    check('its threshold is the check\'s', NEWS.text.includes(`ב-${d.global('CREW_CHECK_IDLE_DAYS')} ימי העבודה האחרונים`));
    check('its way there starts at the crew tab\'s own word', source('index.html').includes('<span class="tab-short">צוות</span>')
        && NEWS.where.startsWith('צוות ← '));
    check('one sentence, never «נשלח»', NEWS.text.endsWith('.') && NEWS.text.indexOf('.') === NEWS.text.length - 1 && !/נשלח/.test(NEWS.text));
    const whatsnew = makeDevice({ deviceId: 'd_crewcheck_news' });
    vm.runInContext(source('js/ui/whatsnew.js'), whatsnew.ctx, { filename: 'js/ui/whatsnew.js' });
    const items = whatsnew.global('WHATSNEW_BUILDS').flatMap(build => build.items).filter(item => item.go === 'crewcheck');
    if (items.length === 0) console.log('  SKIP  «מה חדש» does not carry it yet: the integrator adds it with the stamps');
    else same('and «מה חדש» carries it word for word', JSON.parse(JSON.stringify(items)), [Object.assign({}, NEWS)]);
}

// ================================================================== 6. it writes nothing
//
// Every writer the app has, counted; every key on the disk, byte for byte - across the
// reading, the flat list, the drawing, the dialog opened and shut, and every door of every
// chip, run against a stub where the door would open a form.
suite('6. it writes nothing: the whole disk byte for byte, and no writer called');
{
    const d = withFindings(screensSeed());
    d.State.save({ silent: true });
    withDom(d);
    d.run(`(function () {
        window.__writes = [];
        ['commit', 'commitMany', 'commitRoster', 'save', 'persist'].forEach(name => {
            const real = State[name];
            State[name] = function () { __writes.push('State.' + name); return real.apply(State, arguments); };
        });
        ['set', 'setVerified', 'remove'].forEach(name => {
            const real = Store[name];
            Store[name] = function () { __writes.push('Store.' + name); return real.apply(Store, arguments); };
        });
        window.__opened = [];
        editWorker = function (id) { __opened.push(['editWorker', id]); document.getElementById('workerFormModal').style.display = 'flex'; };
        window.__focused = [];
        ['workerFormName', 'workerFormDaily', 'workerFormPhone'].forEach(id => {
            document.getElementById(id).focus = () => __focused.push(id);
        });
    })()`);
    const before = JSON.stringify(d.dump());
    const record = JSON.stringify(d.State.schedule);
    d.ctx.currentView = 'roster';
    d.run(`crewCheckRead(State.schedule, todayStr(), 'actual'); crewCheckFindings(crewCheckRead(State.schedule, todayStr(), 'actual'), todayStr());
        renderCrewCheckEntry(); openCrewCheck(); renderCrewCheckIfOpen(); closeCrewCheck();`);
    const chips = findingsOn(d, SCREENS_TODAY).flatMap(f => f.chips);
    d.ctx.__chips = chips;
    const doors = d.run(`__chips.map(chip => { __focused.length = 0; document.getElementById('workerFormMore').open = false;
        document.getElementById('workerFormModal').style.display = 'none'; openCrewCheck();
        const went = crewCheckGo(chip);
        return [chip.door, chip.field || null, went, __focused.slice(), document.getElementById('workerFormMore').open, crewCheckIsOpen()]; })`);
    await new Promise(done => setTimeout(done, 20));
    same('the whole disk', JSON.stringify(d.dump()), before);
    same('the record in memory', JSON.stringify(d.State.schedule), record);
    same('no writer of State or Store was called', d.run('JSON.stringify(__writes)'), '[]');
    same('every door shut the dialog', doors.map(row => row[5]), chips.map(() => false));
    const forms = doors.filter(row => row[0] === 'form');
    same('a form door opened the form for his row and focused the field he came to mend, the fold open for a number',
        forms.map(row => [row[1], row[2], row[3], row[4]]), chips.filter(c => c.door === 'form').map(c =>
            [c.field, true, [{ daily: 'workerFormDaily', phone: 'workerFormPhone', name: 'workerFormName' }[c.field]], c.field === 'phone']));
    same('each through editWorker, for the man on the chip', JSON.parse(d.run('JSON.stringify(__opened)')),
        chips.filter(c => c.door === 'form').map(c => ['editWorker', c.workerId]));
    d.run("State.schedule.workers = State.schedule.workers.filter(w => w.id !== 'w03')");
    d.ctx.__gone = chips.find(c => c.workerId === 'w03');
    same('a man no longer in the record when his chip is pressed: nothing opens', d.run(`__opened.length = 0; openCrewCheck();
        [crewCheckGo(__gone), __opened.length, crewCheckIsOpen()]`), [false, 0, false]);
    // THE CONTROL: an ordinary edit does move what was compared, so the comparison can fail.
    const disk = JSON.stringify(d.dump());
    d.run("State.schedule.workers[0].name = 'שם אחר'; State.commitRoster();");
    check('and the instrument is live: a roster edit is counted and moves the disk',
        d.run('__writes.length') > 0 && JSON.stringify(d.dump()) !== disk);
}

report();
