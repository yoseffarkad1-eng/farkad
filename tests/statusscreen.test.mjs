// «תמונת מצב» (js/ui/status.js) on devices.
//
//   node tests/statusscreen.test.mjs
//
// (Not tests/status.test.mjs: that name has long been the sync line's own suite - what
// "מסונכרן בין המכשירים" may say and when - and this is the screen the chip now opens.)
//
// The owner, 2026-11-19: real features that lift the app. «תמונת מצב» is ONE screen, opened from
// the sync chip, that reads where the business stands - and writes nothing. This suite holds,
// on real devices of this build, every figure on it against the one function it is read from
// (features/status/contract.md, criteria 1-11):
//
//   S1  TODAY: the hero, the journey's words and every site line equal journeyCrewStatus,
//       journeyCrewWords, workersAtPlace and rimaCount on thirty seeded days.
//   S2  THE NEXT WORKING DAY: journeyDefaultDate (a Friday evening is Sunday, a recorded
//       Saturday is opened), its crew words, its rides through the journey's own functions over
//       a PEEKED day (transportDayOf and transportPrune never called), none with הסעות off,
//       and the seder's own progress.
//   S3  THE NEXT PAYDAY: from periodRangeFor and the roster - a Thursday that ends both
//       cycles, a Friday, a man a boundary cut short, a weekly crew, a fortnightly crew.
//   S4  THE MONEY: the close line is CLOSE_REMINDER_TEXT.line(closeReminderCount(weeklyCloseRead))
//       and the board's own figures and words, the carry open and shut, approved and not; no
//       close line at 0; «אף עובד לא חייב כסף כרגע.» when nobody owes.
//   S5  THE ONE READING: inside reportReadOnce + weeklyCloseOnce equal to the bare reading; the
//       gate never planned on an approved record, at most once on another; what is kept read
//       nothing; a moved record read again exactly once.
//   S6  THE PULSE: every cell the week tab's own «סה"כ עובדים» (renderWeekTotals) and the
//       invoice's workerIds per date, the month summary's busiest day; every past week's total
//       Σ payrollReport(week).attendanceDays, this week's up to today; the dates to come «·» and
//       in no total; the Saturday column exactly when a Saturday holds work; the shades; the
//       caption's averages.
//   S7  THE SITES: which and in what order; own + Rima = the billing count = «סיכום חודש»'s; the
//       eight weeks; «עובדי יוסף גבס» on its own line and in no other number.
//   S8  THE PHASE WORDS on seeded seasons with planted lifecycles, against an oracle written in
//       this file from the planted counts, on every evening; the steady site silent; under
//       thirty-six working days nobody gets a word; the constants pinned.
//   S9  THIS PHONE: the sync line is #storageNotice's text; backupAgeSentence says the backup
//       row's five sentences, and renderBackupAge draws byte for byte what v204's drew (its
//       bytes out of Git).
//   S10 THE WORDS: every proposed string pinned word for word; every borrowed one found in its
//       owner's source; the file writes no key and calls no browser dialog; never «נשלח».
//   S11 WHAT IT COSTS: statusFacts on a season, the money with nothing kept on the screens'
//       record and on a season closed in order; kept readings read nothing; render() with the
//       dialog shut reads nothing of this file.
//
// And through all of it: the disk, byte for byte, and the record, unmoved by any reading.
//
// Synthetic names and money throughout. No browser, no emulator.

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDevice, loadOrder } from './harness.mjs';
import { makeDom } from './moneydom.mjs';
import { suite, check, same, given, report } from './runner.mjs';

process.env.TZ = 'Asia/Jerusalem';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = file => readFileSync(join(ROOT, file), 'utf8');
const STATUS = source('js/ui/status.js');
// The reading's own screen and everything it reads, in index.html's order.
const UI = ['js/ui/sitecolor.js', 'js/ui/day.js', 'js/ui/week.js', 'js/ui/reports.js', 'js/ui/workercard.js',
    'js/ui/seder.js', 'js/ui/payslips.js', 'js/ui/daycheck.js', 'js/model/transport.js', 'js/ui/transport.js',
    'js/ui/journey.js', 'js/ui/monthsummary.js', 'js/ui/owes.js', 'js/ui/weeklyclose.js', 'js/ui/closereminder.js',
    'js/ui/status.js'].map(file => ({ file, code: source(file) }));

const OPEN = { carryAdvances: true, ledgerWrites: true };
const SHUT = { carryAdvances: false, ledgerWrites: false };
const TODAY = '2026-11-19';
const RIDES = 'farkadTransport:enabled';
const j = value => JSON.stringify(value);
const addDays = (date, days) => {
    const [y, m, d] = date.split('-').map(Number);
    const at = new Date(y, m - 1, d + days, 12);
    return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
};
const dow = date => new Date(`${date}T12:00:00`).getDay();
const between = (from, to) => {
    const out = [];
    for (let date = from; date <= to; date = addDays(date, 1)) out.push(date);
    return out;
};
const plain = text => String(text).replace(/[‎⁦-⁩]/g, '');
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

async function block(name, body) {
    suite(name);
    try {
        await body();
    } catch (error) {
        check(`${name}: the block ran to its end`, false,
            String((error && error.stack) || error).split('\n').slice(0, 3).join(' | '));
    }
}

// ---------------------------------------------------------------- a DOM that reads back
function readableDom() {
    const dom = makeDom();
    const make = dom.createElement;
    dom.createElement = tag => {
        const node = make(tag);
        node.dataset = {};
        node.removeAttribute = name => { delete node.attributes[name]; };
        node.contains = other => {
            for (let at = other; at; at = at.parentNode) if (at === node) return true;
            return false;
        };
        return node;
    };
    dom.activeElement = null;
    return dom;
}

// ---------------------------------------------------------------- phones
function phone({ today = TODAY, flags = OPEN, storage = null, rides = false, deviceId = 'd_office' } = {}) {
    const disk = Object.assign({}, storage || {});
    if (rides) disk[RIDES] = '1';
    const d = makeDevice({ deviceId, flags, storage: Object.keys(disk).length ? disk : undefined });
    d.setToday(today);
    d.run = code => vm.runInContext(code, d.ctx, { filename: 'status-suite' });
    UI.forEach(({ file, code }) => vm.runInContext(code, d.ctx, { filename: file }));
    // What the device draws into, once everything is loaded: a DOM a suite can read back.
    d.dom = readableDom();
    d.ctx.document = d.dom;
    d.run('var currentView = "day";');
    d.ctx.askTell = () => Promise.resolve();
    d.ctx.askConfirm = () => Promise.resolve(true);
    if (storage) d.State.load();
    return d;
}
function reopen(d, options = {}) {
    return phone(Object.assign({ today: d.ctx.todayStr(), storage: d.dump() }, options));
}
const facts = (d, today) => JSON.parse(d.run(`JSON.stringify(statusFacts(${j(today || d.ctx.todayStr())}))`));
const disk = d => {
    const out = d.dump();
    return j(Object.keys(out).sort().map(key => [key, out[key]]));
};
const record = d => j(d.State.schedule);
function kept(d) {
    if (d.State.save({ silent: true }) !== true) throw new Error('the seeded record was not saved');
    return d;
}

// ---------------------------------------------------------------- the model's own writers
function work(d, id, date, place, rate, hours) {
    const change = d.call('assignPlace', d.State.schedule, date, id, 'actual', place, rate, hours);
    if (!change || change.refused) throw new Error(`a day for ${id} on ${date} at ${place}`);
}
function absent(d, id, date) {
    d.call('markAbsent', d.State.schedule, date, id, 'actual');
}
function advance(d, id, date, amount) {
    return d.call('recordNewAdvance', d.State.schedule, id, date, amount, '', `${date}T07:00:00.000Z`, 'd_seed', 'cash')[0].value.id;
}
// THE APPROVAL, by the model's own writer. On a small record the plan is the real one; on a
// season the plan costs tens of seconds, and the approval is written with the plan's id - the
// one thing the gate reads of it (carryMigrationApproved) - and no rows.
function approve(d, cheap) {
    const plan = cheap ? { id: d.call('carryMigrationId'), rows: [] } : d.call('planCarryMigration', d.State.schedule);
    if (!d.call('carryMigrationApproved', d.State.schedule, plan)) {
        d.call('recordCarryApproval', d.State.schedule, plan, '2026-01-01T09:00:00.000Z', 'd_person');
    }
}
function byHand(d, id, from, to, deduction, at) {
    return d.call('closePeriodChanges', d.State.schedule, id, from, to, at, 'd_seed', deduction);
}

const SITES = [
    { id: 'p_1', name: 'הרצליה - מגדל הים', active: true },
    { id: 'p_2', name: 'תל אביב - רוטשילד', active: true },
    { id: 'p_3', name: 'רמת גן', active: true },
    { id: 'p_4', name: 'נתניה - עיר ימים', active: true },
    { id: 'p_5', name: 'פתח תקווה', active: true },
    { id: 'p_6', name: 'Bat Yam B7', active: false }
];

// A SEASON, seeded with a seeded PRNG through the model's writers: `men` men, the first
// `weekly` of them paid by the week; every day but Saturday from `first` to `last`, about 85%
// of the men at a home site, doubles, extra hours, a second site now and then; the sixth site
// archived and worked until `archivedUntil`; Rima on two sites and יוסף גבס on one; ONE
// Saturday with work when `saturday` names it; advances every few weeks; the approval.
function season(d, { men = 24, weekly = 8, first = '2026-06-01', last = TODAY, seed = 20261119, saturday = null,
    archivedUntil = '2026-10-15', advances = true, cheap = true } = {}) {
    const rand = mulberry(seed);
    const pick = list => list[Math.floor(rand() * list.length)];
    const schedule = d.State.schedule;
    schedule.places = SITES.map(site => Object.assign({}, site));
    schedule.workers = [];
    for (let n = 1; n <= men; n += 1) {
        const id = `w_${String(n).padStart(2, '0')}`;
        schedule.workers.push(Object.assign({ id, name: `עובד ${n}`, active: n !== men, dailyRate: pick([380, 420, 450, 500, 550]),
            hourlyRate: pick([0, 45, 50]), phone: `0520000${String(100 + n)}` }, n <= weekly ? { payCycles: '2026-01-02=weekly' } : {}));
    }
    const dates = between(first, last).filter(date => dow(date) !== 6 || date === saturday);
    schedule.workers.forEach((worker, i) => {
        const home = `p_${1 + (i % 6)}`;
        dates.forEach(date => {
            if (rand() > 0.85) return;
            if (rand() < 0.03) { absent(d, worker.id, date); return; }
            const place = home === 'p_6' && date > archivedUntil ? 'p_1' : home;
            const r = rand();
            if (r < 0.04) work(d, worker.id, date, place, 'double');
            else if (r < 0.09) work(d, worker.id, date, place, 'extra', 1 + Math.floor(rand() * 3));
            else work(d, worker.id, date, place);
            if (rand() < 0.05) work(d, worker.id, date, place === 'p_2' ? 'p_3' : 'p_2');
        });
    });
    dates.forEach(date => {
        if (rand() < 0.45) d.call('setRimaCount', schedule, date, 'p_1', 1 + Math.floor(rand() * 4));
        if (rand() < 0.3) d.call('setRimaCount', schedule, date, 'p_3', 1 + Math.floor(rand() * 3));
        if (rand() < 0.3) d.call('setYosefGevesCount', schedule, date, 'p_2', 1 + Math.floor(rand() * 5));
    });
    if (advances) {
        schedule.workers.slice(0, Math.ceil(men / 2)).forEach(worker => {
            for (let date = addDays(first, Math.floor(rand() * 20)); date <= last; date = addDays(date, 21 + Math.floor(rand() * 21))) {
                advance(d, worker.id, date, pick([200, 300, 500, 800, 1000]));
            }
        });
    }
    approve(d, cheap);
    return kept(d);
}

// THREE MEN (tests/closereminder.test.mjs has them): פואד fortnightly, ואליד weekly, גסאן
// fortnightly, days to Thursday 2026-11-12, advances in and before the last finished period;
// `inOrder` closes their earlier periods by hand, oldest first.
const PLACES = [{ id: 'p_01', name: 'אתר צפון', active: true }, { id: 'p_02', name: 'אתר דרום', active: true }];
function three({ today = '2026-11-13', flags = OPEN, inOrder = true } = {}) {
    const d = phone({ today, flags });
    d.State.schedule.workers = [
        { id: 'w_f', name: 'פואד', active: true, dailyRate: 500, hourlyRate: 0 },
        { id: 'w_w', name: 'ואליד', active: true, dailyRate: 400, hourlyRate: 0, payCycles: '2026-10-16=weekly' },
        { id: 'w_g', name: 'גסאן', active: true, dailyRate: 450, hourlyRate: 0 }
    ];
    d.State.schedule.places = PLACES.map(place => Object.assign({}, place));
    between('2026-10-16', '2026-11-12').filter(date => dow(date) !== 6)
        .forEach(date => ['w_f', 'w_w', 'w_g'].forEach(id => work(d, id, date, 'p_01')));
    advance(d, 'w_f', '2026-10-19', 1500);
    advance(d, 'w_f', '2026-11-02', 1000);
    advance(d, 'w_w', '2026-10-26', 800);
    advance(d, 'w_w', '2026-11-09', 600);
    advance(d, 'w_g', '2026-11-03', 900);
    approve(d);
    if (inOrder) {
        byHand(d, 'w_f', '2026-10-16', '2026-10-29', undefined, '2026-10-30T16:00:00.000Z');
        byHand(d, 'w_w', '2026-10-23', '2026-10-29', undefined, '2026-10-30T16:01:00.000Z');
        byHand(d, 'w_w', '2026-10-30', '2026-11-05', undefined, '2026-11-06T16:00:00.000Z');
    }
    return kept(d);
}

// THE SCREENS' RECORD (tests/screens.mjs, seed and seedMoney): fourteen men, two of them weekly,
// five sites, 2026-10-23 to 2026-11-11, Rima and יוסף גבס counts, two advances, a repayment,
// the approval - at the evening of Tuesday 2026-11-10.
function screensRecord() {
    const crew = ['דוד כהן', 'עלי חסן', 'מוחמד אבו ראס חוסיין', 'יוסי מזרחי', 'אחמד נסאר', "סאמר ח'טיב", 'רון לוי',
        'איברהים עודה', 'מאיר ביטון', 'חאלד סלאמה', 'נועם פרץ', 'וליד זועבי', 'אבי דהן', 'ראמי חורי'];
    const today = '2026-11-10';
    const tomorrow = '2026-11-11';
    const first = phone({ today });
    const schedule = first.State.schedule;
    schedule.workers = crew.map((name, i) => Object.assign({ id: 'w' + String(i + 1).padStart(2, '0'), name, active: true,
        dailyRate: 400 + 10 * (i % 4), hourlyRate: 50, phone: i < 9 ? '05200000' + String(10 + i) : '' },
    i === 6 || i === 7 ? { payCycles: '2026-08-07=weekly' } : {}));
    schedule.places = ['הרצליה - מגדל הים', 'תל אביב - רוטשילד', 'רמת גן', 'נתניה - עיר ימים', 'פתח תקווה']
        .map((name, i) => ({ id: 'p' + (i + 1), name, active: true }));
    let at = 0;
    between('2026-10-23', '2026-11-11').forEach(date => {
        if (dow(date) === 6) return;
        if (date !== '2026-11-05') {
            schedule.workers.forEach((worker, i) => {
                if (i >= 11) return;
                if (date === today && i === 8) { absent(first, worker.id, date); return; }
                if (date === tomorrow && i >= 8) return;
                if (date === today && i === 10) return;
                if ((i + at) % 9 === 0) { absent(first, worker.id, date); return; }
                const place = i === 10 ? 'p3' : 'p' + (((i + (at % 3)) % 5) + 1);
                if (i === 3 && at % 4 === 0) work(first, worker.id, date, place, 'double');
                else if (i === 5 && at % 3 === 0) work(first, worker.id, date, place, 'extra', 2);
                else work(first, worker.id, date, place);
            });
            if (at % 2 === 0) first.call('setRimaCount', schedule, date, 'p1', 3);
            if (at % 3 === 0) first.call('setYosefGevesCount', schedule, date, 'p2', 2);
        }
        at += 1;
    });
    first.call('setRimaCount', schedule, today, 'p1', 3);
    first.call('setYosefGevesCount', schedule, today, 'p2', 2);
    first.call('addAdvance', schedule, 'w02', '2026-11-02', 500, '');
    first.call('addAdvance', schedule, 'w05', '2026-11-03', 1200, 'ציוד');
    kept(first);
    // Reopened: the origin entry of a legacy advance is written by the boot mirror (js/state.js).
    const d = phone({ today, storage: first.dump() });
    approve(d);
    const id = Object.keys(d.State.schedule.advances).find(key => d.State.schedule.advances[key].workerId === 'w02');
    d.State.commit(d.call('recordAdvanceRepaid', d.State.schedule, id, 200, '2026-11-04', '', '2026-11-04T10:00:00.000Z', 'd_seed', 'cash'));
    return kept(d);
}

// Spies, by name, on the device's own globals: how often each was called.
function spy(d, names) {
    d.run(`var __calls = {}; ${names.map(name => `(function () {
        const real = ${name}; __calls[${j(name)}] = 0;
        ${name} = function () { __calls[${j(name)}] += 1; return real.apply(this, arguments); };
    })();`).join('\n')}`);
    return () => JSON.parse(d.run('JSON.stringify(__calls)'));
}
const resetSpy = d => d.run('Object.keys(__calls).forEach(name => { __calls[name] = 0; })');

// ================================================================== S1 today
await block('S1 today: the hero, the words and every site line are the journey\'s and the model\'s own', async () => {
    const d = season(phone(), { saturday: '2026-10-31' });
    const rand = mulberry(7);
    const days = Object.keys(d.State.schedule.days).filter(date => date >= '2026-06-01').sort();
    given('a season of days to pick from', days.length > 100, String(days.length));
    const picked = [];
    while (picked.length < 30) {
        const date = days[Math.floor(rand() * days.length)];
        if (!picked.includes(date)) picked.push(date);
    }
    const before = [disk(d), record(d)];
    const wrong = [];
    picked.forEach(date => {
        const seen = facts(d, date).crew;
        const crew = d.call('journeyCrewStatus', d.State.schedule, date, 'actual');
        const sites = d.State.schedule.places.filter(place => place.active !== false)
            .map(place => ({ placeId: place.id, name: place.name,
                count: d.call('workersAtPlace', d.State.schedule, date, place.id, 'actual').length,
                rima: d.call('rimaCount', d.State.schedule, date, place.id) }))
            .filter(site => site.count > 0);
        const want = { placed: crew.placed.length, words: d.call('journeyCrewWords', crew), sites };
        if (j(seen) !== j(want)) wrong.push(`${date}: ${j(seen)} / ${j(want)}`);
    });
    same('on thirty seeded days the hero, the words and every site line equal their sources', wrong, []);
    check('and the days picked hold men, absences and Rima', picked.some(date => facts(d, date).crew.placed > 0)
        && picked.some(date => facts(d, date).crew.words.includes('נעדרים'))
        && picked.some(date => facts(d, date).crew.sites.some(site => site.rima > 0)), picked.join(' '));
    same('the archived site, worked on its last days, is never a line of today', picked
        .filter(date => facts(d, date).crew.sites.some(site => site.placeId === 'p_6')), []);
    const empty = facts(d, '2026-05-01').crew;
    same('a day nobody worked: no man, no site', [empty.placed, empty.sites], [0, []]);
    same('and nobody\'s words are the journey\'s', empty.words, d.call('journeyCrewWords',
        d.call('journeyCrewStatus', d.State.schedule, '2026-05-01', 'actual')));
    same('the disk and the record, byte for byte, after thirty readings', [disk(d), record(d)], before);
});

// ================================================================== S2 the next working day
await block('S2 the next working day: the journey\'s own day, crew, rides and messages', async () => {
    const d = phone({ today: '2026-11-13', rides: true });
    d.State.schedule.workers = ['אחמד', 'מוחמד', 'יוסי', 'סמיר', 'עלי', 'Ali Hassan'].map((name, i) => ({
        id: `w_${i + 1}`, name, active: true, dailyRate: 400, hourlyRate: 0, phone: i === 2 ? '' : `05211100${i}${i}` }));
    d.State.schedule.places = PLACES.map(place => Object.assign({}, place));
    ['2026-11-12', '2026-11-13'].forEach(date => d.State.schedule.workers.forEach(w => work(d, w.id, date, 'p_01')));
    ['w_1', 'w_2', 'w_3', 'w_4'].forEach(id => work(d, id, '2026-11-15', id === 'w_4' ? 'p_02' : 'p_01'));
    absent(d, 'w_5', '2026-11-15');
    kept(d);

    // A Friday evening, the Saturday empty: Sunday.
    const friday = facts(d, '2026-11-13').next;
    same('a Friday evening: the next working day is Sunday, the journey\'s own', [friday.date, d.call('journeyDefaultDate', '2026-11-13')],
        ['2026-11-15', '2026-11-15']);
    same('headed in the journey\'s words, never «מחר»', friday.heading, 'סידור ליום ראשון 15/11/2026');
    same('its crew in the journey\'s words', friday.words,
        d.call('journeyCrewWords', d.call('journeyCrewStatus', d.State.schedule, '2026-11-15', 'actual')));
    same('which say what the record holds', friday.words, 'שובצו: 4 · לא נרשמו: 1 · נעדרים: 1');
    // An ordinary evening: tomorrow.
    same('a Thursday evening: Friday', facts(d, '2026-11-12').next.date, '2026-11-13');
    // A Saturday that already holds something is opened, as the day's arrows open it.
    work(d, 'w_6', '2026-11-14', 'p_02');
    kept(d);
    same('a recorded Saturday is the next working day', facts(d, '2026-11-13').next.date, '2026-11-14');
    d.State.commit(d.call('clearWorkerDay', d.State.schedule, '2026-11-14', 'w_6', 'actual'));

    // The rides: seated in this session, then read in a fresh one, where only the disk has them.
    ['w_1', 'w_2'].forEach((id, n) => d.call('transportPlace', '2026-11-15', id, 'tv_01', n + 1));
    const r = reopen(d, { today: '2026-11-13' });
    const calls = spy(r, ['transportDayOf', 'transportPrune', 'transportPeekDay']);
    const before = [disk(r), record(r)];
    const next = facts(r, '2026-11-13').next;
    const want = r.run(`journeyRideWords(journeyRideStatus(transportContext('2026-11-15'),
        transportPeekDay('2026-11-15').day || transportEmptyDay()))`);
    same('the rides: the journey\'s words over the peeked day', next.rides, want);
    same('two of the four are seated: the other two wait', next.rides, 'בלי מושב: 2');
    const counted = calls();
    same('transportDayOf and transportPrune are never called; the day is peeked', [counted.transportDayOf, counted.transportPrune],
        [0, 0]);
    check('and peeked it is', counted.transportPeekDay >= 1, j(counted));
    same('the disk and the record, byte for byte, after reading the rides', [disk(r), record(r)], before);
    const off = reopen(r, { today: '2026-11-13' });
    off.Store.remove(RIDES);
    const silent = reopen(off, { today: '2026-11-13' });
    same('הסעות off on this phone: no rides line', facts(silent, '2026-11-13').next.rides, null);

    // The seder's own progress: «הודעה לכל עובד: נפתחו N מתוך M», with the list's own rule.
    const rows = r.call('sederCrew', r.State.schedule, '2026-11-15', 'actual');
    same('nothing opened yet', facts(r, '2026-11-13').next.seder, 'הודעה לכל עובד: נפתחו 0 מתוך 3');
    const one = rows.find(row => row.number);
    r.call('sederMarkOpened', '2026-11-15', one, r.call('sederMessage', one, '2026-11-15'));
    const run = r.call('sederRun', rows, '2026-11-15');
    same('one opened: the seder\'s own count, in its own words', facts(r, '2026-11-13').next.seder,
        `${r.run('JOURNEY_TEXT.sendWorkers')}: ${r.run(`SEDER_TEXT.progress(${run.done}, ${run.total})`)}`);
    same('which reads', facts(r, '2026-11-13').next.seder, 'הודעה לכל עובד: נפתחו 1 מתוך 3');
    rows.filter(row => row.number).forEach(row => r.call('sederSetOn', '2026-11-15', row.workerId, false));
    same('nobody chosen: no line', facts(r, '2026-11-13').next.seder, null);
});

// ================================================================== S3 the next payday
await block('S3 the next payday: the earliest end of the men\'s own periods, by cycle - dates only', async () => {
    const crew = (today, workers) => {
        const d = phone({ today });
        d.State.schedule.workers = workers.map((w, i) => Object.assign({ id: `w_${i + 1}`, name: `עובד ${i + 1}`, active: true,
            dailyRate: 400, hourlyRate: 0 }, w));
        d.State.schedule.places = PLACES.map(place => Object.assign({}, place));
        return kept(d);
    };
    const line = (d, payday) => plain(d.call('statusPaydayLine', payday));
    const mixed = [{ payCycles: '2026-08-07=weekly' }, { payCycles: '2026-08-07=weekly' }, {}, {}, {}, { active: false }];

    const thursday = crew('2026-11-12', mixed);
    const thu = facts(thursday).payday;
    same('a Thursday that ends both cycles: today, every active man, both counted', thu,
        { date: '2026-11-12', men: 5, weekly: 2, biweekly: 3 });
    same('said: the day, the date, the men and both cycles', line(thursday, thu),
        'יום התשלום הבא: יום חמישי 12/11 · 5 עובדים (2 שבועי, 3 דו־שבועי)');
    same('which is each man\'s own period, asked of periodRangeFor', thursday.State.schedule.workers.filter(w => w.active !== false)
        .map(w => thursday.call('periodRangeFor', w, '2026-11-12').to), Array(5).fill('2026-11-12'));

    const friday = crew('2026-11-13', mixed);
    const fri = facts(friday).payday;
    same('a Friday: the weekly men\'s Thursday comes first, and only they end on it', fri,
        { date: '2026-11-19', men: 2, weekly: 2, biweekly: 0 });
    same('one cycle: no cycles in brackets', line(friday, fri), 'יום התשלום הבא: יום חמישי 19/11 · 2 עובדים');

    // A man moving to the week from Friday 2026-11-20: his fortnight 13/11-26/11 is cut at 19/11.
    const cut = crew('2026-11-16', [{ payCycles: '2026-08-07=weekly' }, { payCycles: '2026-11-20=weekly' }, {}]);
    const period = cut.call('periodRangeFor', cut.State.schedule.workers[1], '2026-11-16');
    given('his period is a stub a boundary cut short', period.transition === true && period.to === '2026-11-19', j(period));
    same('a transition: the stub ends with the weekly man\'s week, and is counted under its own cycle', facts(cut).payday,
        { date: '2026-11-19', men: 2, weekly: 1, biweekly: 1 });

    const weekly = crew('2026-11-17', [{ payCycles: '2026-08-07=weekly' }, { payCycles: '2026-08-07=weekly' }]);
    same('a weekly crew: the coming Thursday', facts(weekly).payday, { date: '2026-11-19', men: 2, weekly: 2, biweekly: 0 });
    const fortnight = crew('2026-11-17', [{}, {}, {}]);
    same('a fortnightly crew: the end of the fortnight on the owner\'s seam', facts(fortnight).payday,
        { date: '2026-11-26', men: 3, weekly: 0, biweekly: 3 });
    same('one man: in the singular', line(fortnight, { date: '2026-11-26', men: 1, weekly: 0, biweekly: 1 }),
        'יום התשלום הבא: יום חמישי 26/11 · עובד אחד');
    const nobody = crew('2026-11-17', [{ active: false }]);
    same('no active man: no payday line', facts(nobody).payday, null);
    check('no money in it: the reading asks no pay sheet', !/payroll|advance|owes|moneyOf/i.test(
        STATUS.slice(STATUS.indexOf('function statusPayday'), STATUS.indexOf('function statusWeekColumns'))));
});

// ================================================================== S4 the money lines
// What the section says, drawn into a node of the readable DOM.
function moneyWords(d, money) {
    return plain(d.run(`(function (money) {
        const node = document.createElement('div');
        drawStatusMoneyInto(node, money);
        const out = [];
        const walk = n => { if (n.tagName === 'P') out.push(n.textContent); if (n.tagName === 'BUTTON') out.push('[' + n.textContent + ']'); n.children.forEach(walk); };
        walk(node);
        return out.join(' | ');
    })(${j(money)})`));
}
await block('S4 the money: the close reminder\'s own sentence and the board\'s own figures and words', async () => {
    const d = three();
    const at = new Date().toISOString();
    const before = [disk(d), record(d)];
    const money = JSON.parse(d.run('JSON.stringify(statusMoneyNow())'));
    const count = d.call('closeReminderCount', d.call('weeklyCloseRead', d.State.schedule, '2026-11-13', at));
    given('three men «סגירת שבוע» would offer', count === 3, String(count));
    same('the close count is «סגירת שבוע»\'s own', money.close, count);
    const board = d.call('owesRead', d.State.schedule, '2026-11-13');
    same('the board\'s own figures: the sum, the gate, its count line', money.owes,
        { folded: board.folded, total: board.total, count: d.call('owesCountLine', board) });
    check('which is a debt to say', board.folded === true && board.total > 0, j(board.total));
    same('drawn in their own words', moneyWords(d, money), [
        d.run('CLOSE_REMINDER_TEXT.line(3)'), `[${d.run('CLOSE_REMINDER_TEXT.open')}]`,
        `${d.run('OWES_TEXT.total')}: ${plain(d.call('owesMoney', board.total))}`, d.call('owesCountLine', board),
        `[${d.run('OWES_TEXT.board')}]`].join(' | '));
    same('which read', moneyWords(d, money).split(' | ').slice(0, 2), ['יש 3 עובדים שהחשבון שלהם עוד לא נסגר', '[לסגירת שבוע]']);
    same('the disk and the record, byte for byte, after the reading', [disk(d), record(d)], before);

    // Every account closed: no close line - and no "all closed" claim either.
    const c = three();
    c.State.commitMany(byHand(c, 'w_w', '2026-11-06', '2026-11-12', 0, '2026-11-13T08:00:00.000Z'));
    c.State.commitMany(byHand(c, 'w_f', '2026-10-30', '2026-11-12', undefined, '2026-11-13T08:01:00.000Z'));
    c.State.commitMany(byHand(c, 'w_g', '2026-10-30', '2026-11-12', undefined, '2026-11-13T08:02:00.000Z'));
    const closed = JSON.parse(c.run('JSON.stringify(statusMoneyNow())'));
    same('count 0: no close line, the board still there', [closed.close, moneyWords(c, closed).includes('לסגירת שבוע'),
        moneyWords(c, closed).includes('חוב פתוח של העובדים')], [0, false, true]);

    // The carry shut: the board's own words and nothing of the new arithmetic.
    const s = three({ flags: SHUT, inOrder: false });
    const shut = JSON.parse(s.run('JSON.stringify(statusMoneyNow())'));
    const handed = s.call('owesRead', s.State.schedule, '2026-11-13');
    same('shut: no close line', shut.close, 0);
    same('shut: «מקדמות רשומות» and the sum handed over, as the board draws it', moneyWords(s, shut),
        `מקדמות רשומות: ${plain(s.call('owesMoney', handed.total))} | ${s.call('owesCountLine', handed)} | [מי חייב כסף]`);
    same('which is every advance handed over', handed.total, 1500 + 1000 + 800 + 600 + 900);

    // Nobody approved the migration: the same.
    const u = phone({ today: '2026-11-13' });
    u.State.schedule.workers = [{ id: 'w_u', name: 'עומר', active: true, dailyRate: 400, hourlyRate: 0 }];
    u.State.schedule.places = PLACES.map(place => Object.assign({}, place));
    between('2026-08-07', '2026-11-12').filter(date => dow(date) !== 6).forEach(date => work(u, 'w_u', date, 'p_01'));
    u.call('addAdvance', u.State.schedule, 'w_u', '2026-10-19', 9000, '');
    kept(u);
    const unapproved = phone({ today: '2026-11-13', storage: u.dump() });
    given('a record whose migration is needed and nobody approved', unapproved.call('carryReportingEnabled', unapproved.State.schedule) === false);
    const waiting = JSON.parse(unapproved.run('JSON.stringify(statusMoneyNow())'));
    same('unapproved: no close line, «מקדמות רשומות»', [waiting.close, waiting.owes.folded, moneyWords(unapproved, waiting).startsWith('מקדמות רשומות: 9000 ₪')],
        [0, false, true]);

    // Nobody owes: the board's own sentence, and no door to a board with nothing on it.
    const n = phone({ today: '2026-11-13' });
    n.State.schedule.workers = [{ id: 'w_n', name: 'נביל', active: true, dailyRate: 400, hourlyRate: 0 }];
    n.State.schedule.places = PLACES.map(place => Object.assign({}, place));
    between('2026-10-30', '2026-11-12').filter(date => dow(date) !== 6).forEach(date => work(n, 'w_n', date, 'p_01'));
    approve(n);
    kept(n);
    const none = JSON.parse(n.run('JSON.stringify(statusMoneyNow())'));
    same('nobody owes: «אף עובד לא חייב כסף כרגע.»', [none.owes, moneyWords(n, none).split(' | ').pop()],
        [null, 'אף עובד לא חייב כסף כרגע.']);
    same('and its close line is the man the dialog would offer', none.close, 1);
    same('the placeholder until it is read: «מחשב את החשבונות…», no figure', moneyWords(n, undefined), 'מחשב את החשבונות…');
});

// ================================================================== S5 the one reading
await block('S5 the one reading: equal to the bare one; the gate asked once at most and never planned when approved', async () => {
    const d = three();
    const today = '2026-11-13';
    const at = '2026-11-13T15:00:00.000Z';
    const inside = d.run(`JSON.stringify(reportReadOnce(() => weeklyCloseOnce(() => statusMoneyRead(${j(today)}, ${j(at)}))))`);
    d.run('OWES_KEPT = null; CLOSE_REMINDER_KEPT = null; STATUS_MONEY_KEPT = null;');
    const bare = d.run(`JSON.stringify(statusMoneyRead(${j(today)}, ${j(at)}))`);
    same('inside reportReadOnce and weeklyCloseOnce: the bare reading, byte for byte', inside, bare);

    // Counted the way tests/reports.speed.test.mjs counts it.
    d.run(`var COST = null; (function () {
        const real = { plan: planAdvanceCarry, gate: carryMigrationSettled };
        planAdvanceCarry = function () { if (COST) COST.plans += 1; return real.plan.apply(this, arguments); };
        carryMigrationSettled = function () { if (COST) COST.questions += 1; return real.gate.apply(this, arguments); };
    })();
    function cost(work) { COST = { plans: 0, questions: 0 }; try { work(); } finally { var out = COST; COST = null; } return out; }`);
    const reads = spy(d, ['owesRead', 'weeklyCloseRead', 'payrollReport']);
    const move = 'State.schedule.workers[0].note = String(Math.random()); OWES_KEPT = null; CLOSE_REMINDER_KEPT = null;';
    const first = JSON.parse(d.run(`JSON.stringify(cost(() => { ${move} statusMoneyNow(); }))`));
    same('approved: the gate is asked nothing of the plan, and nothing is planned', first, { plans: 0, questions: 0 });
    same('each reader read once', [reads().owesRead, reads().weeklyCloseRead], [1, 1]);
    resetSpy(d);
    d.run('statusMoneyNow()');
    same('the record unmoved: nothing read at all', [reads().owesRead, reads().weeklyCloseRead, reads().payrollReport], [0, 0, 0]);
    resetSpy(d);
    d.run('STATUS_MONEY_KEPT = null; OWES_KEPT = null; CLOSE_REMINDER_KEPT = null;');
    d.run('owesReadNow(); closeReminderRefresh("boot");');
    given('the board and the close count kept by their own screens, under this record',
        d.run('Boolean(owesKeptNow()) && CLOSE_REMINDER_KEPT.key === closeReminderKey(State.schedule, todayStr())'));
    resetSpy(d);
    const composed = d.run('JSON.stringify(statusMoneyNow())');
    same('their kept readings fresh: nothing read, the same money', [reads().owesRead, reads().weeklyCloseRead, composed],
        [0, 0, bare]);
    resetSpy(d);
    d.State.commit(d.call('assignPlace', d.State.schedule, '2026-11-13', 'w_f', 'actual', 'p_02'));
    d.run('statusMoneyNow(); statusMoneyNow(); statusMoneyNow();');
    same('a moved record: read again exactly once', [reads().owesRead, reads().weeklyCloseRead], [1, 1]);

    // Unapproved: the gate's question planned at most once a reading.
    const u = phone({ today });
    u.State.schedule.workers = [{ id: 'w_u', name: 'עומר', active: true, dailyRate: 400, hourlyRate: 0 }];
    u.State.schedule.places = PLACES.map(place => Object.assign({}, place));
    between('2026-08-07', '2026-11-12').filter(date => dow(date) !== 6).forEach(date => work(u, 'w_u', date, 'p_01'));
    u.call('addAdvance', u.State.schedule, 'w_u', '2026-10-19', 9000, '');
    kept(u);
    const w = phone({ today, storage: u.dump() });
    w.run(`var COST = null; (function () {
        const real = { plan: planAdvanceCarry, gate: carryMigrationSettled };
        planAdvanceCarry = function () { if (COST) COST.plans += 1; return real.plan.apply(this, arguments); };
        carryMigrationSettled = function () { if (COST) COST.questions += 1; return real.gate.apply(this, arguments); };
    })();
    function cost(work) { COST = { plans: 0, questions: 0 }; try { work(); } finally { var out = COST; COST = null; } return out; }`);
    const planned = JSON.parse(w.run('JSON.stringify(cost(() => { STATUS_MONEY_KEPT = null; OWES_KEPT = null; CLOSE_REMINDER_KEPT = null; REPORT_GATE_KEPT = null; statusMoneyNow(); }))'));
    check('unapproved: the gate planned once at most for the whole reading', planned.plans <= 1 && planned.questions <= 1, j(planned));
    same('and an unmoved record not again', JSON.parse(w.run('JSON.stringify(cost(() => statusMoneyNow()))')), { plans: 0, questions: 0 });
    same('the functions on the page afterwards are the real ones and no reading is left open',
        d.run('[typeof REPORT_ONCE === "undefined" || REPORT_ONCE === null, payrollReport.toString().indexOf("__calls") !== -1].join()'),
        'true,true');
});

// ================================================================== S6 the pulse
await block('S6 the pulse: the week tab\'s own count per date, the sheet\'s attendance per week, and the shades', async () => {
    // A Tuesday evening: the week holds days to come - and the season has records on them
    // (tomorrow's seder is written into tomorrow's day).
    const today = '2026-11-17';
    const d = season(phone({ today }), { saturday: '2026-10-31' });
    // Three short days, so the light end of the ramp has cells to be: one man, six, eleven.
    [['2026-10-05', 1], ['2026-10-12', 6], ['2026-10-19', 11]].forEach(([date, keep]) => {
        d.State.schedule.workers.filter(worker => d.call('entriesFor', d.State.schedule, date, worker.id, 'actual').length > 0)
            .slice(keep).forEach(worker => d.call('clearWorkerDay', d.State.schedule, date, worker.id, 'actual'));
    });
    kept(d);
    const before = [disk(d), record(d)];
    const pulse = facts(d, today).pulse;
    same('twelve weeks, newest on top, each opened by its Friday', pulse.weeks.map(week => [dow(week.from), dow(week.to)]),
        Array(12).fill([5, 4]));
    same('the newest is the week today is in', [pulse.weeks[0].from <= today, today <= pulse.weeks[0].to], [true, true]);
    same('weeks follow each other back', pulse.weeks.slice(1).every((week, i) => addDays(week.from, 7) === pulse.weeks[i].from), true);
    same('a worked Saturday among the twelve: the column «ש׳» for every row, in its place', [pulse.saturday, pulse.columns],
        [true, [5, 6, 0, 1, 2, 3, 4]]);

    // The week tab's own rule for every date: renderWeekTotals over weekWorkers.
    const weekRule = dates => JSON.parse(d.run(`(function (dates) {
        const foot = renderWeekTotals(dates, weekWorkers(dates));
        return JSON.stringify(foot.children[0].children.slice(1).map(td => td.textContent === '' ? 0 : Number(td.textContent)));
    })(${j(dates)})`));
    const first = pulse.weeks[11].from;
    const invoice = d.call('invoiceByDate', d.State.schedule, first, today);
    const menOn = {};
    invoice.places.forEach(place => place.days.forEach(day => {
        menOn[day.date] = menOn[day.date] || new Set();
        day.workerIds.forEach(id => menOn[day.date].add(String(id)));
    }));
    const wrongTab = [];
    const wrongUnion = [];
    pulse.weeks.forEach(week => {
        const dates = week.days.map(day => day.date);
        const tab = weekRule(dates);
        week.days.forEach((day, i) => {
            if (day.n === null) return;
            if (day.n !== tab[i]) wrongTab.push(`${day.date}: ${day.n}/${tab[i]}`);
            const union = menOn[day.date] ? menOn[day.date].size : 0;
            if (day.n !== union) wrongUnion.push(`${day.date}: ${day.n}/${union}`);
        });
    });
    same('every cell is the week tab\'s «סה"כ עובדים» for its date', wrongTab, []);
    same('and the union of the invoice\'s workerIds that date', wrongUnion, []);
    check('the cells are not all alike', new Set(pulse.weeks.flatMap(week => week.days.map(day => day.n))).size > 5);

    // The month summary's busiest working day of each month the twelve weeks touch.
    const months = [...new Set(pulse.weeks.flatMap(week => week.days.map(day => day.date.slice(0, 7))))];
    const busiest = months.map(key => JSON.parse(d.run(`JSON.stringify(monthSummaryScope(() => monthSummaryRead(${j(key)})).busiest)`)))
        .filter(day => day && day.date >= first && day.date <= today);
    given('the busiest days fall inside the twelve weeks', busiest.length >= 2, j(busiest));
    const cellOf = date => pulse.weeks.flatMap(week => week.days).find(day => day.date === date);
    same('on each month\'s busiest day, the cell is «סיכום חודש»\'s own count', busiest.map(day => cellOf(day.date).n),
        busiest.map(day => day.men));

    // Each week's total: the sheet's attendance, up to today.
    const sheet = (from, to) => d.call('payrollReport', d.State.schedule, from, to).reduce((sum, row) => sum + row.attendanceDays, 0);
    same('every past week\'s total is Σ payrollReport(week).attendanceDays', pulse.weeks.slice(1).map(week => week.total),
        pulse.weeks.slice(1).map(week => sheet(week.from, week.to)));
    same('this week\'s, Σ of the sheet up to today', pulse.weeks[0].total, sheet(pulse.weeks[0].from, today));
    same('and each total is its cells', pulse.weeks.map(week => week.total),
        pulse.weeks.map(week => week.days.reduce((sum, day) => sum + (day.n || 0), 0)));

    // The days to come.
    const later = pulse.weeks[0].days.filter(day => day.date > today);
    check('this week has days to come', later.length > 0, j(pulse.weeks[0].days));
    same('a date after today is null - «·» - and has no shade', later.map(day => [day.n, day.step]), later.map(() => [null, null]));

    // The shades: ceil(5 x n / max), nobody the surface.
    const max = Math.max(...pulse.weeks.flatMap(week => week.days.map(day => day.n || 0)));
    same('max is the largest cell of the twelve weeks', pulse.max, max);
    same('every shade is ceil(5 x n / max), 0 for nobody', pulse.weeks.flatMap(week => week.days.filter(day => day.n !== null)
        .map(day => day.step)), pulse.weeks.flatMap(week => week.days.filter(day => day.n !== null)
        .map(day => (day.n === 0 ? 0 : Math.ceil((5 * day.n) / max)))));
    check('all five shades and the surface are used', [0, 1, 2, 3, 4, 5].every(step =>
        pulse.weeks.some(week => week.days.some(day => day.step === step))), j(pulse.weeks.map(week => week.days.map(day => day.step))));

    // The caption: men per WORKING day, the last four weeks and the four before, to a tenth.
    const avg = weeks => {
        const worked = weeks.flatMap(week => week.days.map(day => day.n || 0)).filter(n => n > 0);
        return Math.round((worked.reduce((sum, n) => sum + n, 0) / worked.length) * 10) / 10;
    };
    same('the caption is the two averages', pulse.caption,
        `בממוצע ${avg(pulse.weeks.slice(0, 4))} עובדים ביום עבודה ב-4 השבועות האחרונים, ו-${avg(pulse.weeks.slice(4, 8))} ב-4 השבועות שלפניהם.`);
    // Each row is named with every day it shows.
    const named = pulse.weeks[1];
    same('a week\'s name: its range, its total and every day', plain(named.name), `שבוע ${named.from.slice(8, 10)}/${named.from.slice(5, 7)} - `
        + `${named.to.slice(8, 10)}/${named.to.slice(5, 7)}: ${named.total} ימי נוכחות · `
        + named.days.map(day => `יום ${['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'][dow(day.date)]} ${day.n}`).join(' · '));
    same('the disk and the record, byte for byte, after the pulse', [disk(d), record(d)], before);
    // Tomorrow's seder is written into tomorrow's day: a record for a date to come is no work done.
    work(d, 'w_01', addDays(today, 1), 'p_1');
    kept(d);
    same('a record written for a day to come is counted nowhere', [facts(d, today).pulse.weeks[0].total, facts(d, today).pulse.max],
        [pulse.weeks[0].total, pulse.max]);

    // No Saturday worked: six columns.
    const plainWeeks = season(phone(), { seed: 42 });
    const six = facts(plainWeeks, today).pulse;
    same('no Saturday with work among the twelve: six columns, Friday first', [six.saturday, six.columns], [false, [5, 0, 1, 2, 3, 4]]);
    // Only the last four weeks worked: one average.
    const fresh = season(phone(), { first: '2026-10-25', seed: 9, advances: false });
    const recent = facts(fresh, today).pulse;
    check('a crew that began within the last four weeks: one average', recent.caption !== null
        && recent.caption.endsWith('ב-4 השבועות האחרונים.') && !recent.caption.includes('שלפניהם'), String(recent.caption));
    same('and a crew with no day at all: no caption', facts(phone(), today).pulse.caption, null);
});

// ================================================================== S7 the sites
await block('S7 the sites: which and in what order, own + Rima = the billing count, eight weeks, יוסף גבס apart', async () => {
    const d = season(phone(), { saturday: '2026-10-31' });
    const today = TODAY;
    const seen = facts(d, today);
    const thisWeek = seen.pulse.weeks[0].from;
    const from8 = addDays(thisWeek, -49);
    const eight = d.call('invoiceWithoutRima', d.State.schedule, from8, today);
    const worked = d.State.schedule.places.filter(place => eight.places.some(row => row.placeId === place.id && row.workerDays > 0));
    same('every site of the roster with his men in the last eight weeks, and no other',
        seen.sites.map(site => site.placeId).sort(), worked.map(place => place.id).sort());
    check('the archived site, last worked in October, is one of them', seen.sites.some(site => site.placeId === 'p_6' && site.active === false));
    const month = { from: '2026-11-01', to: '2026-11-30' };
    const own = id => d.call('invoiceWithoutRima', d.State.schedule, month.from, month.to, id).total;
    const active = seen.sites.filter(site => site.active);
    same('active first, by this month\'s own count; the archived after them', seen.sites.map(site => site.active),
        seen.sites.map(site => site.active).slice().sort((a, b) => Number(b) - Number(a)));
    same('in order of this month\'s count', active.map(site => site.month), active.map(site => site.month).slice().sort((a, b) => b - a));
    same('a site\'s month is his own men\'s worker-site days there (the invoice without Rima)', seen.sites.map(site => site.month),
        seen.sites.map(site => own(site.placeId)));
    same('and Rima beside it is rimaReport\'s', seen.sites.map(site => site.rima),
        seen.sites.map(site => d.call('rimaReport', d.State.schedule, month.from, month.to, site.placeId).total));
    const billed = d.call('invoiceByDate', d.State.schedule, month.from, month.to);
    same('own + Rima is the billing count, site by site', seen.sites.map(site => site.month + site.rima),
        seen.sites.map(site => (billed.places.find(row => row.placeId === site.placeId) || { workerDays: 0 }).workerDays));
    const summary = JSON.parse(d.run('JSON.stringify(monthSummaryScope(() => monthSummaryRead("2026-11")).sites)'));
    same('which is «סיכום חודש»\'s own count of the month', seen.sites.filter(site => site.month + site.rima > 0)
        .map(site => [site.placeId, site.month + site.rima]).sort(), summary.map(site => [site.id, site.days]).sort());
    check('Rima is on some site this month', seen.sites.some(site => site.rima > 0));

    // The eight weeks, against the men on the site counted date by date.
    const weeks = place => Array.from({ length: 8 }, (_, k) => addDays(from8, 7 * k)).map(friday =>
        between(friday, addDays(friday, 6)).filter(date => date <= today)
            .reduce((sum, date) => sum + d.call('workersAtPlace', d.State.schedule, date, place, 'actual').length, 0));
    same('each site\'s eight weeks, oldest first: his men on it, week by week', seen.sites.map(site => site.weeks),
        seen.sites.map(site => weeks(site.placeId)));
    same('which is Σ of the invoice\'s own countAt', seen.sites.map(site => site.weeks.reduce((a, b) => a + b, 0)),
        seen.sites.map(site => between(from8, today).reduce((sum, date) => sum + eight.countAt(site.placeId, date), 0)));

    // «עובדי יוסף גבס»: its own line, in no other number.
    same('יוסף גבס this month is yosefGevesReport\'s own total', seen.yosef,
        d.call('yosefGevesReport', d.State.schedule, month.from, month.to).total);
    check('and there is one to say', seen.yosef > 0);
    const without = value => { const copy = JSON.parse(j(value)); delete copy.yosef; return j(copy); };
    between('2026-11-01', today).filter(date => dow(date) !== 6).forEach(date => {
        ['p_1', 'p_3', 'p_4'].forEach(place => d.call('setYosefGevesCount', d.State.schedule, date, place, 7));
    });
    kept(d);
    const more = facts(d, today);
    check('more of them typed: the line moves', more.yosef > seen.yosef, `${seen.yosef} -> ${more.yosef}`);
    same('and not one other number on the screen does', without(more), without(seen));
    same('its line names the list by the list\'s own title', d.run('STATUS_TEXT.yosef(6)'), `${d.run('YOSEF_GEVES_TITLE')} החודש: 6`);

    // No site worked in eight weeks: the one sentence.
    const idle = season(phone(), { first: '2026-06-01', last: '2026-08-31', seed: 5, advances: false });
    same('nothing in eight weeks: no site', facts(idle, today).sites, []);
});

// ================================================================== S8 the phase words
// A SEASON WITH PLANTED LIFECYCLES: every day but Saturday from 2026-06-01, each site its own
// story in men a day, written through the model's writers. `plan(site, index)` is how many of
// his men stand on the site on working day `index`.
const LIFE = {
    p_steady: () => 6,                                  // never a word
    p_fall: i => (i < 70 ? 8 : 2),                      // falls at 70
    p_new: i => (i < 90 ? 0 : 3),                       // opens at 90
    p_quiet: i => (i < 100 ? 4 : 0),                    // stops at 100, active
    p_stopped: i => (i < 100 ? 4 : 0),                  // the same, archived
    p_rise: i => (i < 60 ? 2 : 6)                       // rises at 60
};
const LIFE_MEN = { p_steady: 6, p_fall: 8, p_new: 3, p_quiet: 4, p_stopped: 4, p_rise: 6 };
function lifecycles(d, until) {
    const schedule = d.State.schedule;
    schedule.places = Object.keys(LIFE).map(id => ({ id, name: `אתר ${id.slice(2)}`, active: id !== 'p_stopped' }));
    schedule.workers = [];
    const menOf = {};
    Object.keys(LIFE).forEach(id => {
        menOf[id] = [];
        for (let n = 0; n < LIFE_MEN[id]; n += 1) {
            const man = { id: `w_${id.slice(2)}_${n}`, name: `${id.slice(2)} ${n}`, active: true, dailyRate: 400, hourlyRate: 0 };
            schedule.workers.push(man);
            menOf[id].push(man.id);
        }
    });
    const days = between('2026-06-01', until).filter(date => dow(date) !== 6);
    days.forEach((date, i) => Object.keys(LIFE).forEach(id => {
        menOf[id].slice(0, LIFE[id](i)).forEach(man => work(d, man, date, id));
    }));
    approve(d);
    kept(d);
    return days;
}
// THE ORACLE, from the planted counts alone - the contract's table, written again here.
function oracle(site, e) {
    if (e < 35) return null;
    const own = i => LIFE[site](i);
    const B = []; const R = [];
    for (let i = e - 35; i <= e - 12; i += 1) B.push(own(i));
    for (let i = e - 11; i <= e; i += 1) R.push(own(i));
    const sum = list => list.reduce((a, b) => a + b, 0);
    const mB = sum(B) / 24;
    const mR = sum(R) / 12;
    const tiny = 1e-9;
    if (site !== 'p_stopped' && sum(B) > 0 && R.slice(-5).every(n => n === 0)) return 'שקט';
    if (mB >= 4 - tiny && mR <= 0.6 * mB + tiny && mB - mR >= 3 - tiny) return 'יורד';
    let firstOwn = null;
    for (let i = 0; i <= e && firstOwn === null; i += 1) if (own(i) > 0) firstOwn = i;
    if (firstOwn !== null && firstOwn >= e - 11 && sum(R) >= 10) return 'חדש';
    if (mB >= 2 - tiny && mR >= 1.6 * mB - tiny && mR - mB >= 3 - tiny) return 'עולה';
    return null;
}
await block('S8 the phase words: on planted lifecycles, the oracle\'s word on every evening; the steady site silent', async () => {
    const d = phone();
    const days = lifecycles(d, '2026-11-19');
    given('a season of working days', days.length >= 140, String(days.length));
    const wrong = [];
    const said = {};
    Object.keys(LIFE).forEach(site => { said[site] = []; });
    for (let e = 30; e < days.length; e += 1) {
        const seen = facts(d, days[e]).sites;
        Object.keys(LIFE).forEach(site => {
            const row = seen.find(one => one.placeId === site);
            if (!row) return;
            const want = oracle(site, e);
            if (row.phase !== want) wrong.push(`${days[e]} ${site}: ${row.phase} / ${want}`);
            if (row.phase) said[site].push(e);
        });
    }
    same('on every evening, every listed site says the oracle\'s word, or none', wrong.slice(0, 6), []);
    same('the steady site has no word on any evening of the season', said.p_steady, []);
    const firstFall = said.p_fall.find(e => facts(d, days[e]).sites.find(one => one.placeId === 'p_fall').phase === 'יורד');
    const firstRule = Array.from({ length: days.length }, (_, e) => e).find(e => oracle('p_fall', e) === 'יורד');
    check('the falling site says «יורד» - never before its drop', firstFall >= 70, String(firstFall));
    check('within five working days of the drop meeting the rule', firstFall !== undefined && firstFall - firstRule <= 5,
        `${firstFall} / ${firstRule}`);
    check('and while it holds', said.p_fall.filter(e => oracle('p_fall', e) === 'יורד').length
        === Array.from({ length: days.length }, (_, e) => e).filter(e => e >= 30 && oracle('p_fall', e) === 'יורד').length);
    const words = site => [...new Set(said[site].map(e => facts(d, days[e]).sites.find(one => one.placeId === site).phase))];
    check('«חדש» on the new site', words('p_new').includes('חדש'), j(words('p_new')));
    check('«שקט» on the active site that stopped', words('p_quiet').includes('שקט'), j(words('p_quiet')));
    check('never «שקט» on the archived one that stopped the same way', !words('p_stopped').includes('שקט'), j(words('p_stopped')));
    check('«עולה» on the rising site', words('p_rise').includes('עולה'), j(words('p_rise')));
    // Under thirty-six working days on the record: nobody has a word.
    const young = phone();
    const youngDays = lifecycles(young, '2026-07-10');
    given('a record of fewer than thirty-six working days', youngDays.length < 36, String(youngDays.length));
    same('under thirty-six working days: no site gets a word', facts(young, youngDays[youngDays.length - 1]).sites
        .filter(site => site.phase !== null), []);
    same('the constants, pinned', JSON.parse(d.run('JSON.stringify(STATUS_PHASE)')), {
        history: 36, recent: 12, before: 24, quietDays: 5, fallFrom: 4, fallShare: 0.6, fallBy: 3,
        freshDays: 10, riseFrom: 2, riseShare: 1.6, riseBy: 3 });
});

// ================================================================== S9 this phone
await block('S9 this phone: the sync line is #storageNotice\'s, the backup row\'s own sentences, drawn as v204 drew them', async () => {
    const d = phone();
    const notice = d.dom.register('storageNotice');
    notice.textContent = 'מסונכרן בין המכשירים. · עודכן: 19:42';
    same('the sync line is the notice\'s own text, verbatim', facts(d).sync, 'מסונכרן בין המכשירים. · עודכן: 19:42');
    notice.textContent = '';
    same('no notice: no line', facts(d).sync, '');
    const cases = [[null, 'אין במכשיר הזה רישום של ייצוא קובץ גיבוי.'], ['garbage', 'מועד מסירת קובץ הגיבוי לדפדפן אינו ידוע.'],
        ['2026-12-01', 'מועד מסירת קובץ הגיבוי לדפדפן אינו ידוע.'], [TODAY, 'קובץ גיבוי נמסר לדפדפן: היום.'],
        ['2026-11-18', 'קובץ גיבוי נמסר לדפדפן: אתמול.'], ['2026-11-03', 'קובץ גיבוי נמסר לדפדפן: לפני 16 ימים.']];
    same('backupAgeSentence says the row\'s five sentences', cases.map(([last]) => d.call('backupAgeSentence', last, TODAY)),
        cases.map(([, words]) => words));
    // The row as v204 drew it, from its own bytes out of Git, beside this build's - on the same disks.
    let old = null;
    try { old = execFileSync('git', ['show', '6ab193d68c960e4a56d947673c282b867acd258f:js/ui/backup.js'], { cwd: ROOT, encoding: 'utf8' }); } catch (error) { old = null; }
    given('v204\'s backup.js is in this repository\'s history', typeof old === 'string' && old.includes('function renderBackupAge'));
    const drawn = (code, last) => {
        const sources = loadOrder().map(file => ({ file, code: file === 'js/ui/backup.js' && code ? code : source(file) }));
        const one = makeDevice({ deviceId: 'd_backup', flags: OPEN, sources });
        one.setToday(TODAY);
        const dom = readableDom();
        one.ctx.document = dom;
        // A fresh disk has no note of a file at all: that is the `null` case as it is.
        if (last !== null) vm.runInContext(`Store.set('scheduleData:lastBackup', ${j(last)})`, one.ctx);
        const line = dom.register('backupAge');
        vm.runInContext('renderBackupAge()', one.ctx);
        return [line.textContent, line.className];
    };
    same('renderBackupAge draws byte for byte what v204\'s drew, on every age', cases.map(([last]) => drawn(null, last)),
        cases.map(([last]) => drawn(old, last)));
    d.Store.set('scheduleData:lastBackup', '2026-11-03');
    same('the reminder from fourteen days', facts(d).backup, { sentence: 'קובץ גיבוי נמסר לדפדפן: לפני 16 ימים.',
        reminder: 'שבועיים ויותר בלי קובץ גיבוי חדש מהמכשיר הזה.', warn: true });
    d.Store.set('scheduleData:lastBackup', '2026-11-16');
    same('and not before', facts(d).backup, { sentence: 'קובץ גיבוי נמסר לדפדפן: לפני 3 ימים.', reminder: null, warn: false });
});

// ================================================================== S10 the words
await block('S10 the words: every one pinned, every borrowed one found where it lives, nothing written', async () => {
    const d = phone();
    const T = name => d.run(`STATUS_TEXT.${name}`);
    const fixed = {
        title: 'תמונת מצב', door: 'תמונת מצב', heroLabel: 'עובדים באתרים היום', nobodyToday: 'עוד אין היום אף עובד באתר.',
        money: 'חשבונות ומקדמות', pulse: '12 השבועות האחרונים', few: 'מעט', many: 'הרבה',
        pulseHint: 'לחיצה על שבוע פותחת אותו במסך השבוע.', sites: 'האתרים', siteDays: 'ימי עובד־אתר החודש',
        rising: 'עולה', falling: 'יורד', fresh: 'חדש', quiet: 'שקט',
        phaseNote: 'עולה או יורד: כמה עובדים היו ביום עבודה בשבועיים האחרונים, לעומת ארבעת השבועות שלפניהם. שקט: אתר פעיל שלא עבד בו אף עובד בחמשת ימי העבודה האחרונים.',
        noSites: 'לא נרשמה עבודה באתרים ב-8 השבועות האחרונים.', device: 'המכשיר הזה'
    };
    same('every fixed word, word for word', Object.keys(fixed).map(key => T(key)), Object.values(fixed));
    const made = [
        ['doorName("מסונכרן")', 'תמונת מצב · מסונכרן'],
        ['inSites(1)', 'באתר אחד'], ['inSites(4)', 'ב-4 אתרים'],
        ['rima(3)', 'רימא 3'],
        ['nextPayday("יום חמישי", "19/11", "12 עובדים")', 'יום התשלום הבא: יום חמישי 19/11 · 12 עובדים'],
        ['payCycles(4, 8)', '4 שבועי, 8 דו־שבועי'],
        ['pulseCaption(11.5, 9)', 'בממוצע 11.5 עובדים ביום עבודה ב-4 השבועות האחרונים, ו-9 ב-4 השבועות שלפניהם.'],
        ['pulseCaptionRecent(7)', 'בממוצע 7 עובדים ביום עבודה ב-4 השבועות האחרונים.'],
        ['weekName("R", 1, "D")', 'שבוע R: יום נוכחות אחד · D'], ['weekName("R", 54, "D")', 'שבוע R: 54 ימי נוכחות · D'],
        ['siteName("X", 1, "W")', 'X: יום עובד־אתר אחד החודש · 8 השבועות האחרונים: W'],
        ['siteName("X", 14, "W")', 'X: 14 ימי עובד־אתר החודש · 8 השבועות האחרונים: W'],
        ['yosef(6)', 'עובדי יוסף גבס החודש: 6']
    ];
    same('every template, word for word', made.map(([call]) => T(call)), made.map(([, words]) => words));
    same('and nothing in the block that is not pinned here', JSON.parse(d.run('JSON.stringify(Object.keys(STATUS_TEXT))')).sort(),
        Object.keys(fixed).concat(['doorName', 'inSites', 'rima', 'nextPayday', 'payCycles', 'pulseCaption', 'pulseCaptionRecent',
            'weekName', 'siteName', 'yosef']).sort());
    const owner = {
        today: ['index.html', '<span>היום</span>'], openDay: ['js/ui/week.js', "'פתיחת היום לעריכה'"],
        rima: ['js/ui/day.js', "'רימא'"], reports: ['index.html', '<span>דוחות</span>'], inactive: ['js/ui/roster.js', "'לא פעיל'"],
        cloud: ['index.html', '<h3>ענן וסנכרון</h3>'], backup: ['index.html', '<h3>גיבוי</h3>'], close: ['index.html', '>סגור</button>'],
        oneMan: ['js/ui/reports.js', "'עובד אחד'"], manyMen: ['js/ui/reports.js', "'עובדים'"]
    };
    const reused = JSON.parse(d.run('JSON.stringify(STATUS_REUSED)'));
    same('every borrowed word is one this file lists', Object.keys(reused).sort(), Object.keys(owner).sort());
    same('and each is found, as it is, in its owner\'s source', Object.keys(owner).filter(key =>
        !source(owner[key][0]).includes(owner[key][1]) || !owner[key][1].includes(reused[key])), []);
    same('the words read from their owners, as they stand there', [d.run('JOURNEY_TEXT.forDay("יום ראשון", "22/11/2026")'),
        d.run('JOURNEY_TEXT.sendWorkers'), d.run('SEDER_TEXT.progress(3, 12)'), d.run('CLOSE_REMINDER_TEXT.line(4)'),
        d.run('CLOSE_REMINDER_TEXT.open'), d.run('OWES_TEXT.total'), d.run('OWES_TEXT.board'), d.run('OWES_TEXT.none'),
        d.run('OWES_REUSED.recorded'), d.run('OWES_TEXT.sum'), d.run('WEEKLY_CLOSE_TEXT.reading'), d.run('PAY_CYCLE_LABELS.weekly'),
        d.run('PAY_CYCLE_LABELS.biweekly'), d.run('YOSEF_GEVES_TITLE'), d.run('HEBREW_DAY_LETTERS.join(" ")')],
    ['סידור ליום ראשון 22/11/2026', 'הודעה לכל עובד', 'נפתחו 3 מתוך 12', 'יש 4 עובדים שהחשבון שלהם עוד לא נסגר', 'לסגירת שבוע',
        'חוב פתוח של העובדים', 'מי חייב כסף', 'אף עובד לא חייב כסף כרגע.', 'מקדמות רשומות', 'סה״כ', 'מחשב את החשבונות…',
        'שבועי', 'דו־שבועי', 'עובדי יוסף גבס', 'א׳ ב׳ ג׳ ד׳ ה׳ ו׳ ש׳']);

    const code = STATUS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/[^'"`\n]*$/gm, '');
    check('the file writes no key and touches no disk', !/Store\.(set|setVerified|remove|clear)|localStorage|sessionStorage|indexedDB/.test(code));
    check('commits nothing and saves nothing', !/State\.(commit|commitMany|commitRoster|save|persist)\b|saveFinancialAction|closePeriodChanges|recordNew|addAdvance/.test(code));
    check('calls no dialog of the browser (law 11)', !/\b(alert|confirm|prompt)\s*\(/.test(code));
    check('and never says «נשלח»', !STATUS.includes('נשלח'));
    check('no money is worked out here: it prices nothing', !/dailyRate|hourlyRate|ratesForDay|moneyOf\(|amount\s*\*|advanceAccount|advanceWalk/.test(code));
    check('the rides are only peeked: no transportDayOf, transportPrune or openTransport', !/transportDayOf|transportPrune|openTransport/.test(code));
    // The hooks in the files this track touches.
    const app = source('js/app.js');
    check('render() asks renderStatusIfOpen through typeof, after the finder\'s', /renderFindIfOpen\(\);\s*\n(\s*\/\/[^\n]*\n)*\s*if \(typeof renderStatusIfOpen === 'function'\) renderStatusIfOpen\(\);/.test(app));
    check('renderSyncChip ends by asking statusDoorSync', /chip\.hidden = label === '';\s*\n(\s*\/\/[^\n]*\n)*\s*if \(typeof statusDoorSync === 'function'\) statusDoorSync\(chip, label\);\s*\n\}/.test(app));
    check('Escape and the backdrop close it through closeStatus', /statusModal: \(\) => closeStatus\(\)/.test(source('js/ui/modal.js')));
    const page = source('index.html');
    const scripts = [...page.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    same('the page loads it after reminders.js and straight before app.js', scripts.slice(scripts.indexOf('js/ui/reminders.js'), scripts.indexOf('js/app.js') + 1),
        ['js/ui/reminders.js', 'js/ui/status.js', 'js/app.js']);
    const sw = source('sw.js');
    check('and the worker precaches it in that place', sw.indexOf("'./js/ui/reminders.js',\n    './js/ui/status.js',\n    './js/app.js'") !== -1);
    check('the chip is the same span inside the door, unchanged', page.includes('<button type="button" class="status-door" id="statusDoor" aria-haspopup="dialog"')
        && page.includes('<span class="sync-chip" id="syncChip" hidden aria-hidden="true"></span><span class="status-door-words" hidden></span>'));
    check('the frame is static, entered at its title', /<div class="modal" id="statusModal">\s*<div class="modal-content modal-wide">\s*<h3 id="statusTitle" tabindex="-1"><\/h3>/.test(page));
});

// ================================================================== S11 what it costs
await block('S11 what it costs: the facts on a season, the money once, and nothing at all while shut', async () => {
    // statusFacts on a season of forty men, six sites, 2026-01-01 to today, the approval recorded.
    const d = season(phone(), { men: 40, weekly: 16, first: '2026-01-01', seed: 2026, saturday: '2026-03-07' });
    given('a season: forty men and every day of the year so far', d.State.schedule.workers.length === 40
        && Object.keys(d.State.schedule.days).length >= 270, String(Object.keys(d.State.schedule.days).length));
    const times = [];
    for (let n = 0; n < 5; n += 1) {
        const began = performance.now();
        d.call('statusFacts', TODAY);
        times.push(performance.now() - began);
    }
    console.log(`        statusFacts on the season: ${times.map(t => t.toFixed(1)).join(', ')} ms (median ${median(times).toFixed(1)})`);
    check('statusFacts on the season, everything but the money: 60 ms or less, the median of five', median(times) <= 60,
        `${median(times).toFixed(1)} ms`);

    // render() with the dialog shut: nothing of this file reads anything.
    const calls = spy(d, ['invoiceByDate', 'invoiceWithoutRima', 'payrollReport', 'statusFacts', 'statusMoneyNow', 'owesRead', 'weeklyCloseRead']);
    for (let n = 0; n < 20; n += 1) d.run('renderStatusIfOpen(); statusDoorSync(null, "מסונכרן");');
    same('twenty draws with the dialog shut: no reading of any kind', calls(),
        { invoiceByDate: 0, invoiceWithoutRima: 0, payrollReport: 0, statusFacts: 0, statusMoneyNow: 0, owesRead: 0, weeklyCloseRead: 0 });

    // The money with nothing kept: on the screens' record...
    const s = screensRecord();
    const before = [disk(s), record(s)];
    let began = performance.now();
    const money = JSON.parse(s.run('JSON.stringify(statusMoneyNow())'));
    const screensMs = performance.now() - began;
    console.log(`        the money, nothing kept, on the screens' record: ${screensMs.toFixed(0)} ms`);
    check('the money with nothing kept, on the screens\' record: 300 ms or less', screensMs <= 300, `${screensMs.toFixed(0)} ms`);
    check('and it says something', money.close > 0 && money.owes && money.owes.total > 0, j(money));
    same('the disk and the record, byte for byte, after the money', [disk(s), record(s)], before);
    const keptCalls = spy(s, ['owesRead', 'weeklyCloseRead']);
    s.run('statusMoneyNow()');
    same('kept: the second reading reads nothing', keptCalls(), { owesRead: 0, weeklyCloseRead: 0 });

    // ...and on a season whose periods are closed in order (scout-api 7.2 "D"): advances only in
    // the last seventy days, every period since each man's first advance closed, oldest first.
    const c = season(phone(), { men: 40, weekly: 16, first: '2026-01-01', seed: 77, advances: false });
    const rand = mulberry(70);
    const from = addDays(TODAY, -70);
    c.State.schedule.workers.forEach(worker => {
        for (let date = addDays(from, Math.floor(rand() * 14)); date <= TODAY; date = addDays(date, 14 + Math.floor(rand() * 14))) {
            advance(c, worker.id, date, [300, 500, 800, 1000][Math.floor(rand() * 4)]);
        }
    });
    let closes = 0;
    const seeding = performance.now();
    c.run(`weeklyCloseOnce(() => {})`);
    c.State.schedule.workers.forEach(worker => {
        const mine = c.call('advancesFor', c.State.schedule, worker.id, '0000-01-01', '9999-12-31');
        if (!mine.length) return;
        let period = c.call('periodRangeFor', worker, mine[0].date);
        while (period.to < TODAY) {
            const made = c.run(`weeklyCloseOnce(() => closePeriodChanges(State.schedule, ${j(worker.id)}, ${j(period.from)}, ${j(period.to)},
                ${j(`${period.to}T15:00:00.000Z`)}, 'd_seed').length)`);
            if (made > 0) closes += 1;
            period = c.call('periodRangeFor', worker, addDays(period.to, 1));
        }
    });
    kept(c);
    console.log(`        a season closed in order: ${closes} closes, ${Object.keys(c.State.schedule.ledger.advances).length} ledger entries, seeded in ${((performance.now() - seeding) / 1000).toFixed(1)} s`);
    given('a season closed in order: closes in their hundreds', closes >= 150, String(closes));
    began = performance.now();
    const closedMoney = JSON.parse(c.run('JSON.stringify(statusMoneyNow())'));
    const closedMs = performance.now() - began;
    console.log(`        the money, nothing kept, on the season closed in order: ${closedMs.toFixed(0)} ms`);
    check('the money with nothing kept, on a season closed in order: 600 ms or less', closedMs <= 600, `${closedMs.toFixed(0)} ms`);
    check('and the men owe what was not yet deducted', closedMoney.owes !== null, j(closedMoney));
});

report();
