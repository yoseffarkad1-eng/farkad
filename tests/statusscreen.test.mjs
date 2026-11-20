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
//       journeyCrewWords, workersAtPlace and rimaCount on thirty seeded days; and its door is not
//       offered while the journey builds another day on the day screen - a press moves nothing.
//   S2  THE NEXT WORKING DAY: journeyDefaultDate (a Friday evening is Sunday, a recorded
//       Saturday is opened), its crew words, the seder's own progress, and its rides - the
//       journey's own words over the STORED day, equal to what the journey says on a twin
//       phone: a day with men going another way and a vehicle kept home and nobody seated, the
//       session's copy of a day the disk refused, damaged day bytes (no line), a damaged vehicle
//       list not yet loaded (no line, and not one byte written), no day at all; transportDayOf,
//       transportPrune and openTransport never called, and transportLoad never on a day.
//   S3  THE NEXT PAYDAY: the men who WORKED in the period that ends first, up to today - a
//       Thursday that ends both cycles («היום, »), a Friday, a man a boundary cut short, an archived
//       man who worked (counted), an active man with nothing, a man with only an absence and one
//       with only an advance (not counted), a seder typed for days to come (not work: not
//       counted), the first evening of both periods (no line), a week the fortnight does not end
//       (the cycle named), weekly and fortnightly crews; each count the sheet's own attendance for
//       that period up to today.
//   S4  THE MONEY: the close line is the reminder's line MIRRORED - there exactly while
//       #closeReminderLine is, byte for byte; absent with the switch off, ✕ today, nothing to
//       close, the gate shut and before the reminder has read - and nothing read for it; never
//       the count of a record the money moved off under the open dialog, nor of yesterday; the
//       board's own figures and words under both gates; «אף עובד לא חייב כסף כרגע.».
//   S5  THE ONE READING: the board inside reportReadOnce + weeklyCloseOnce equal to the bare one;
//       the gate never planned on an approved record, at most once on another; a fresh
//       OWES_KEPT read nothing; a moved record read once; a write on the day screen and then an
//       open: one owesRead, no weeklyCloseRead.
//   S6  THE PULSE: every cell the week tab's own «סה"כ עובדים» (renderWeekTotals) and the
//       invoice's workerIds per date, the month summary's busiest day; every week's total its
//       cells; Σ payrollReport(week).attendanceDays only for a week no man closed - and a weekly
//       week closed and then corrected is the live record here and the frozen one there, by
//       exactly the correction; the dates to come «·» and in no total; the Saturday column
//       exactly when anyRecordOnRestDay holds (an absence alone, a Rima count alone); each row's
//       Friday; the shades; the caption's averages.
//   S7  THE SITES: which and in what order; the month SO FAR - own + Rima = the billing count to
//       today, «סיכום חודש»'s exactly when nothing after today is recorded and different by
//       exactly tomorrow's count when tomorrow's seder is typed; the eight weeks; a site outside
//       the roster a plain row; «עובדי יוסף גבס» on its own line and in no other number.
//   S8  THE PHASE WORDS on seeded seasons with planted lifecycles, against an oracle written in
//       this file from the planted counts, on every evening; the steady site silent; under
//       thirty-six working days nobody gets a word; the constants pinned, and the legend's
//       numbers read from them.
//   S9  THIS PHONE: the sync line is #storageNotice's text; backupAgeSentence says the backup
//       row's five sentences, and renderBackupAge draws byte for byte what v204's drew (its
//       bytes out of Git).
//   S10 THE WORDS: every proposed string pinned word for word; every borrowed one found in its
//       owner's source; the file writes no key, never reads the close count, and calls no
//       browser dialog; never «נשלח».
//   S11 WHAT IT COSTS: statusFacts on a season; the board with nothing kept on the screens'
//       record, on a season closed in order and on a season nobody closed; kept readings read
//       nothing; weeklyCloseRead never; render() with the dialog shut reads nothing of this file.
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
// tests/moneydom.mjs's, with what this screen's code asks of a node besides: a dataset, contains,
// removeAttribute - on the registered frames too - and getElementById that finds a node this
// screen made and named (#statusMoney, #closeReminderLine) inside a registered frame.
function readableDom() {
    const dom = makeDom();
    const roots = [];
    const dress = node => {
        node.dataset = node.dataset || {};
        node.removeAttribute = name => { delete node.attributes[name]; };
        node.contains = other => {
            for (let at = other; at; at = at.parentNode) if (at === node) return true;
            return false;
        };
        return node;
    };
    const make = dom.createElement;
    dom.createElement = tag => dress(make(tag));
    const register = dom.register;
    dom.register = id => {
        const made = dress(register(id));
        roots.push(made);
        return made;
    };
    const find = (node, id) => {
        if (node.id === id || node.attributes.id === id) return node;
        for (const child of node.children) {
            const found = find(child, id);
            if (found) return found;
        }
        return null;
    };
    const byId = dom.getElementById;
    dom.getElementById = id => byId(id) || roots.reduce((found, root) => found || find(root, id), null) || find(dom.body, id);
    dress(dom.body);
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

// Spies, by name, on the device's own globals: how often each was called. Each spy counts on its
// own (a function spied twice is counted by both); resetSpy sets every count on the device to 0.
let spyTag = 0;
function spy(d, names) {
    spyTag += 1;
    const tag = j(`s${spyTag}`);
    d.run(`var __spies = typeof __spies === 'object' && __spies ? __spies : {}; __spies[${tag}] = {};
        ${names.map(name => `(function () {
            const real = ${name}; __spies[${tag}][${j(name)}] = 0;
            ${name} = function () { __spies[${tag}][${j(name)}] += 1; return real.apply(this, arguments); };
        })();`).join('\n')}`);
    return () => JSON.parse(d.run(`JSON.stringify(__spies[${tag}])`));
}
const resetSpy = d => d.run('Object.keys(__spies).forEach(tag => Object.keys(__spies[tag]).forEach(name => { __spies[tag][name] = 0; }))');

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
// transportLoad, spied with the key it is asked for: the vehicle list may be loaded the way the
// journey loads it (bytes that read, or none); a DAY never.
function spyTransport(d) {
    d.run(`var __transport = { dayOf: 0, prune: 0, open: 0, load: [] }; (function () {
        const dayOf = transportDayOf, prune = transportPrune, open = openTransport, load = transportLoad;
        transportDayOf = function () { __transport.dayOf += 1; return dayOf.apply(this, arguments); };
        transportPrune = function () { __transport.prune += 1; return prune.apply(this, arguments); };
        openTransport = function () { __transport.open += 1; return open.apply(this, arguments); };
        transportLoad = function (key) { __transport.load.push(String(key)); return load.apply(this, arguments); };
    })();`);
    return () => JSON.parse(d.run('JSON.stringify(__transport)'));
}
// The journey's own words for the rides of `date`, asked on a TWIN phone - a device of its own,
// opened on the same disk - the way the journey's third station asks them (journeyReadings).
const journeyRides = (d, date) => {
    const twin = reopen(d, { deviceId: 'd_twin' });
    return twin.run(`journeyRideWords(journeyRideStatus(transportContext(${j(date)}), transportDayOf(${j(date)})))`);
};
// The line says them with their subject - the הסעות screen's own name - so that under the crew's
// «לא נרשמו: 6» the screen's bar («כל העובדים משובצים») is not read as the men on the sites.
const rideLine = words => `הסעות: ${words}`;
const RIDE_DAY = '2026-11-15';
function ridePhone() {
    const d = phone({ today: '2026-11-13', rides: true });
    d.State.schedule.workers = ['אחמד', 'מוחמד', 'יוסי', 'סמיר', 'עלי', 'Ali Hassan'].map((name, i) => ({
        id: `w_${i + 1}`, name, active: true, dailyRate: 400, hourlyRate: 0, phone: i === 2 ? '' : `05211100${i}${i}` }));
    d.State.schedule.places = PLACES.map(place => Object.assign({}, place));
    ['2026-11-12', '2026-11-13'].forEach(date => d.State.schedule.workers.forEach(w => work(d, w.id, date, 'p_01')));
    ['w_1', 'w_2', 'w_3', 'w_4'].forEach(id => work(d, id, RIDE_DAY, id === 'w_4' ? 'p_02' : 'p_01'));
    absent(d, 'w_5', RIDE_DAY);
    return kept(d);
}
await block('S2 the next working day: the journey\'s own day, crew and messages; the rides over the stored day, as it is', async () => {
    const d = ridePhone();
    // A Friday evening, the Saturday empty: Sunday.
    const friday = facts(d, '2026-11-13').next;
    same('a Friday evening: the next working day is Sunday, the journey\'s own', [friday.date, d.call('journeyDefaultDate', '2026-11-13')],
        [RIDE_DAY, RIDE_DAY]);
    same('headed in the journey\'s words, never «מחר»', friday.heading, 'סידור ליום ראשון 15/11/2026');
    same('its crew in the journey\'s words', friday.words,
        d.call('journeyCrewWords', d.call('journeyCrewStatus', d.State.schedule, RIDE_DAY, 'actual')));
    same('which say what the record holds', friday.words, 'שובצו: 4 · לא נרשמו: 1 · נעדרים: 1');
    same('a Thursday evening: Friday', facts(d, '2026-11-12').next.date, '2026-11-13');
    work(d, 'w_6', '2026-11-14', 'p_02');
    kept(d);
    same('a recorded Saturday is the next working day', facts(d, '2026-11-13').next.date, '2026-11-14');
    d.State.commit(d.call('clearWorkerDay', d.State.schedule, '2026-11-14', 'w_6', 'actual'));
    same('the Saturday\'s record taken back: Sunday again', facts(d, '2026-11-13').next.date, RIDE_DAY);

    // (e) No day key at all: the empty day - the journey's words for it.
    const empty = reopen(d);
    const spiedE = spyTransport(empty);
    same('(e) no plan stored for the day: the journey\'s own words for an empty day, with their subject', facts(empty, '2026-11-13').next.rides,
        rideLine(journeyRides(empty, RIDE_DAY)));

    // (a) Two men getting there another way, a vehicle kept home, nobody seated - written by the
    // screen's own writers, then read in a fresh session, where only the disk has it.
    const a = reopen(d);
    a.call('transportSetStatus', RIDE_DAY, 'w_1', 'private');
    a.call('transportSetStatus', RIDE_DAY, 'w_2', 'contractor');
    a.call('transportSetAvailable', RIDE_DAY, 'tv_02', false);
    const stored = reopen(a);
    given('the day is on the disk, and nobody is seated in it', stored.run(`transportPeekDay(${j(RIDE_DAY)}).state`) === 'none'
        && stored.Store.get(`farkadTransport:day:${RIDE_DAY}`) !== null);
    const calls = spyTransport(stored);
    const before = [disk(stored), record(stored)];
    const rides = facts(stored, '2026-11-13').next.rides;
    same('(a) the day as it is: the riders the journey counts, not every man on a site', rides, rideLine(journeyRides(stored, RIDE_DAY)));
    same('two of the four go another way: two wait for a seat - said as the rides\' line, never as the crew\'s', rides, 'הסעות: בלי מושב: 2');
    check('where the peek would have said every man waits', rides !== rideLine(stored.run(`journeyRideWords(journeyRideStatus(transportContext(${j(RIDE_DAY)}),
        transportPeekDay(${j(RIDE_DAY)}).day || transportEmptyDay()))`)));
    const counted = calls();
    same('transportDayOf, transportPrune and openTransport are never called', [counted.dayOf, counted.prune, counted.open], [0, 0, 0]);
    same('and transportLoad never on a day - only the vehicle list, loaded as the journey loads it', counted.load.filter(key => key !== 'farkadTransport:settings'), []);
    same('the disk and the record, byte for byte', [disk(stored), record(stored)], before);
    check('and no day of the session was loaded by the reading', stored.run(`Object.keys(transportDays).length`) === 0);

    // (b) The same day held only by the session: the disk refused it.
    const b = reopen(d);
    b.setQuota(key => key === `farkadTransport:day:${RIDE_DAY}`);
    b.call('transportSetStatus', RIDE_DAY, 'w_1', 'private');
    b.call('transportSetStatus', RIDE_DAY, 'w_2', 'contractor');
    given('the disk refused the day; the session holds it', b.Store.get(`farkadTransport:day:${RIDE_DAY}`) === null
        && b.run(`Boolean(transportDays[${j(RIDE_DAY)}])`));
    same('(b) the session\'s own copy is read - as the journey sees it', facts(b, '2026-11-13').next.rides,
        rideLine(b.run(`journeyRideWords(journeyRideStatus(transportContext(${j(RIDE_DAY)}), transportDayOf(${j(RIDE_DAY)})))`)));
    same('which is the day as changed', facts(b, '2026-11-13').next.rides, 'הסעות: בלי מושב: 2');

    // Every rider seated, a driver in seat 1: the screen's bar says «כל העובדים משובצים» - and here
    // it is the rides' line, under a crew line that still says who is not recorded.
    const seated = reopen(a);
    seated.call('transportPlace', RIDE_DAY, 'w_3', 'tv_01', 1);
    seated.call('transportPlace', RIDE_DAY, 'w_4', 'tv_01', 2);
    const all = facts(reopen(seated), '2026-11-13').next;
    same('everyone who rides is seated: the journey\'s words, with their subject, under the crew\'s',
        [all.words, all.rides], ['שובצו: 4 · לא נרשמו: 1 · נעדרים: 1', 'הסעות: כל העובדים משובצים']);
    same('the words are the journey\'s own for that day', all.rides, rideLine(journeyRides(seated, RIDE_DAY)));

    // (c) The day's bytes damaged: no ride line, and nothing copied anywhere.
    const c = reopen(d);
    c.Store.set(`farkadTransport:day:${RIDE_DAY}`, '{"version":1,"trips":');
    const damaged = reopen(c);
    spyTransport(damaged);
    const c0 = disk(damaged);
    same('(c) a day that will not read: no ride line', facts(damaged, '2026-11-13').next.rides, null);
    same('and the disk byte for byte - no copy set aside by a reading', disk(damaged), c0);

    // (d) The vehicle list damaged and not loaded this session: no ride line, not one byte written.
    const s = reopen(d);
    s.Store.set('farkadTransport:settings', 'not a list');
    const list = reopen(s);
    const spiedD = spyTransport(list);
    const d0 = disk(list);
    same('(d) a vehicle list that will not read: no ride line', facts(list, '2026-11-13').next.rides, null);
    same('every key byte for byte, and no ":unreadable" copy', [disk(list), Object.keys(list.dump()).filter(key => key.includes('unreadable'))], [d0, []]);
    same('and the list was never even loaded', spiedD().load, []);
    check('(e) again: the empty day asked nothing of a day either', spiedE().load.every(key => key === 'farkadTransport:settings'), j(spiedE()));
    const off = reopen(d);
    off.Store.remove(RIDES);
    same('הסעות off on this phone: no rides line', facts(reopen(off), '2026-11-13').next.rides, null);

    // The seder's own progress: «הודעה לכל עובד: נפתחו N מתוך M», with the list's own rule.
    const r = reopen(d);
    const rows = r.call('sederCrew', r.State.schedule, RIDE_DAY, 'actual');
    same('nothing opened yet', facts(r, '2026-11-13').next.seder, 'הודעה לכל עובד: נפתחו 0 מתוך 3');
    const one = rows.find(row => row.number);
    r.call('sederMarkOpened', RIDE_DAY, one, r.call('sederMessage', one, RIDE_DAY));
    const run = r.call('sederRun', rows, RIDE_DAY);
    same('one opened: the seder\'s own count, in its own words', facts(r, '2026-11-13').next.seder,
        `${r.run('JOURNEY_TEXT.sendWorkers')}: ${r.run(`SEDER_TEXT.progress(${run.done}, ${run.total})`)}`);
    same('which reads', facts(r, '2026-11-13').next.seder, 'הודעה לכל עובד: נפתחו 1 מתוך 3');
    rows.filter(row => row.number).forEach(row => r.call('sederSetOn', RIDE_DAY, row.workerId, false));
    same('nobody chosen: no line', facts(r, '2026-11-13').next.seder, null);
});

// ================================================================== S3 the next payday
await block('S3 the next payday: the men who WORKED in the period that ends first - dates, days and the roster', async () => {
    const crew = (today, workers, days) => {
        const d = phone({ today });
        d.State.schedule.workers = workers.map((w, i) => Object.assign({ id: `w_${i + 1}`, name: `עובד ${i + 1}`, active: true,
            dailyRate: 400, hourlyRate: 0 }, w));
        d.State.schedule.places = PLACES.map(place => Object.assign({}, place));
        (days || []).forEach(([id, date, how]) => {
            if (how === 'absent') absent(d, id, date);
            else if (how === 'advance') d.call('addAdvance', d.State.schedule, id, date, 500, '');
            else work(d, id, date, 'p_01');
        });
        return kept(d);
    };
    const lines = (d, payday) => d.call('statusPaydayLines', payday).map(plain);
    // A cycle's word is held to its count, and «·» to the word after it, by a no-break space.
    const nb = text => text.replace(/(שבועי) (\d)/g, '$1\u00a0$2').replace(/· /g, '·\u00a0');
    // The sheet's own count: a man is counted when payrollReport over HIS period UP TO TODAY has
    // him at a day of attendance - asked for the men whose period ends on the payday (no closure
    // in these). A date to come is a plan, not work: the line says «עבדו».
    const sheet = (d, today, date) => d.State.schedule.workers.filter(w => {
        const p = d.call('periodRangeFor', w, today);
        if (p.to !== date) return false;
        const row = d.call('payrollReport', d.State.schedule, p.from, p.to < today ? p.to : today).find(r => r.workerId === w.id);
        return Boolean(row && row.attendanceDays > 0);
    }).length;
    const weekly = { payCycles: '2026-08-07=weekly' };

    // Thursday 2026-11-12: the week 06/11-12/11 and the fortnight 30/10-12/11 both end today.
    const thursday = crew('2026-11-12', [weekly, weekly, {}, {}, {}, { active: false }, {}, {}, {}], [
        ['w_1', '2026-11-09'], ['w_2', '2026-11-12'], ['w_3', '2026-11-02'], ['w_4', '2026-11-05'], ['w_5', '2026-10-30'],
        ['w_6', '2026-11-03'],                                // archived, and worked: counted
        ['w_8', '2026-11-04', 'absent'],                      // only an absence: not counted
        ['w_9', '2026-11-04', 'advance']]);                   // only an advance: not counted (w_7: nothing at all)
    const thu = facts(thursday).payday;
    same('a Thursday that ends both cycles: today, and the men who worked - the archived man counted, the man with nothing, the one only absent and the one with only an advance not',
        thu, { date: '2026-11-12', isToday: true, worked: 6, weekly: 2, biweekly: 4 });
    same('the count is the sheet\'s own attendance over each man\'s period', thu.worked, sheet(thursday, '2026-11-12', thu.date));
    same('said: «היום, », the day and the date; then who worked, by cycle - each word before its count, one colon',
        lines(thursday, thu), ['יום התשלום הבא: היום, יום חמישי 12/11', nb('עבדו בתקופה: שבועי 2 · דו־שבועי 4')]);

    // Friday 2026-11-13: of the new periods only today is recorded for one man, and the seder for
    // Sunday and Monday is typed for two more. The weekly week ends first; the seder is a plan,
    // not work, and is not counted.
    const friday = crew('2026-11-13', [weekly, weekly, {}, {}], [
        ['w_1', '2026-11-15'], ['w_2', '2026-11-13'], ['w_3', '2026-11-16'], ['w_4', '2026-11-12']]);
    const fri = facts(friday).payday;
    same('a Friday: the weekly men\'s Thursday comes first; the man who worked today counted, the seder typed for Sunday not',
        fri, { date: '2026-11-19', isToday: false, worked: 1, weekly: 1, biweekly: 0 });
    same('the sheet\'s own count again, over the period up to today', fri.worked, sheet(friday, '2026-11-13', fri.date));
    same('one cycle: named, then counted', lines(friday, fri), ['יום התשלום הבא: יום חמישי 19/11', nb('עבדו בתקופה: שבועי 1')]);

    // Friday evening 2026-11-27, which opens the week AND the fortnight, nobody at work today, and
    // Sunday's seder typed for all twelve: nobody has worked in his period yet, so there is no
    // payday line - never «עבדו בתקופה: 4» for the weekly men's Sunday.
    const opening = crew('2026-11-27', Array.from({ length: 12 }, (_, i) => (i < 4 ? weekly : {})),
        between('2026-11-01', '2026-11-26').filter(date => dow(date) !== 6).flatMap(date =>
            Array.from({ length: 12 }, (_, i) => [`w_${i + 1}`, date])).concat(
            Array.from({ length: 12 }, (_, i) => [`w_${i + 1}`, '2026-11-29'])));
    given('both periods open today', [opening.call('periodRangeFor', opening.State.schedule.workers[0], '2026-11-27').from,
        opening.call('periodRangeFor', opening.State.schedule.workers[5], '2026-11-27').from], ['2026-11-27', '2026-11-27']);
    same('the first evening of both periods, the seder typed: nobody worked in them yet - no payday line', facts(opening).payday, null);

    // Tuesday 2026-11-17, a week the fortnight does not end: the weekly men's Thursday comes first,
    // and the line names whose it is - never «2» alone under a crew of seven at work.
    const midweek = crew('2026-11-17', [weekly, weekly, {}, {}, {}, {}, {}],
        ['2026-11-16', '2026-11-17'].flatMap(date => Array.from({ length: 7 }, (_, i) => [`w_${i + 1}`, date])));
    const mid = facts(midweek).payday;
    same('a week the fortnight does not end: the weekly men\'s payday, and the weekly men only', mid,
        { date: '2026-11-19', isToday: false, worked: 2, weekly: 2, biweekly: 0 });
    same('said with their cycle', lines(midweek, mid), ['יום התשלום הבא: יום חמישי 19/11', nb('עבדו בתקופה: שבועי 2')]);

    // Monday 2026-11-16: a man moving to the week from Friday 2026-11-20 - his fortnight 13/11-26/11 is cut at 19/11.
    const cut = crew('2026-11-16', [weekly, { payCycles: '2026-11-20=weekly' }, {}], [
        ['w_1', '2026-11-16'], ['w_2', '2026-11-16'], ['w_3', '2026-11-16']]);
    const period = cut.call('periodRangeFor', cut.State.schedule.workers[1], '2026-11-16');
    given('his period is a stub a boundary cut short', period.transition === true && period.to === '2026-11-19', j(period));
    same('a transition: the stub ends with the weekly man\'s week, and is counted under its own cycle', facts(cut).payday,
        { date: '2026-11-19', isToday: false, worked: 2, weekly: 1, biweekly: 1 });

    const onlyWeekly = crew('2026-11-17', [weekly, weekly], [['w_1', '2026-11-16'], ['w_2', '2026-11-17']]);
    same('a weekly crew: the coming Thursday', facts(onlyWeekly).payday, { date: '2026-11-19', isToday: false, worked: 2, weekly: 2, biweekly: 0 });
    const fortnight = crew('2026-11-17', [{}, {}, {}], [['w_1', '2026-11-13'], ['w_2', '2026-11-17'], ['w_3', '2026-11-16']]);
    same('a fortnightly crew: the end of the fortnight on the owner\'s seam', facts(fortnight).payday,
        { date: '2026-11-26', isToday: false, worked: 3, weekly: 0, biweekly: 3 });
    same('a fortnightly crew is named for its cycle too', lines(fortnight, facts(fortnight).payday),
        ['יום התשלום הבא: יום חמישי 26/11', nb('עבדו בתקופה: דו־שבועי 3')]);
    same('one man: «עבדו בתקופה: דו־שבועי 1»', lines(fortnight, { date: '2026-11-26', isToday: false, worked: 1, weekly: 0, biweekly: 1 }),
        ['יום התשלום הבא: יום חמישי 26/11', nb('עבדו בתקופה: דו־שבועי 1')]);
    const nobody = crew('2026-11-17', [{}, weekly], [['w_1', '2026-11-12'], ['w_2', '2026-11-17', 'absent']]);
    same('nobody worked in his period yet: no payday line', facts(nobody).payday, null);
    check('no money in it: the reading asks no pay sheet', !/payroll|advance|owes|moneyOf/i.test(
        STATUS.slice(STATUS.indexOf('function statusWorkedIn'), STATUS.indexOf('function statusWeekColumns'))));
});

// ================================================================== S4 the money lines
// What the board's place says, drawn into a node of the readable DOM.
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
// The dialog's frame and the reminder's banner, as index.html has them - so openStatus and the
// reminder can draw on a device.
function frame(d) {
    const modal = d.dom.register('statusModal');
    modal.style.display = 'none';
    const content = d.dom.createElement('div');
    content.className = 'modal-content';
    modal.appendChild(content);
    ['statusTitle', 'statusBody', 'statusClose'].forEach(id => content.appendChild(d.dom.register(id)));
    const banner = d.dom.register('closeReminderBanner');
    banner.style.display = 'none';
    return d;
}
// Every sentence in the open dialog's body, in order.
const said = d => d.run(`(function () {
    const out = [];
    const walk = n => { if (n.tagName === 'P') out.push(n.textContent); n.children.forEach(walk); };
    walk(document.getElementById('statusBody'));
    return JSON.stringify(out);
})()`);
await block('S4 the money: the close reminder\'s own line, mirrored and never read; the board\'s own figures and words', async () => {
    const d = frame(three());
    const reads = spy(d, ['weeklyCloseRead', 'closeReminderReadCount', 'closeReminderRefresh', 'owesRead']);
    same('before the reminder has read: no close line', facts(d).close, null);
    same('and nothing read for it', reads().weeklyCloseRead, 0);
    // The reminder reads - its own reading - and puts its line up.
    d.call('closeReminderRefresh', 'boot');
    const line = d.dom.getElementById('closeReminderBanner').textContent;
    given('the reminder\'s line is on the glass, with its count', d.run('closeReminderShown') === 3
        && d.dom.getElementById('closeReminderBanner').style.display !== 'none', line);
    resetSpy(d);
    const before = [disk(d), record(d)];
    same('while it is up: the close line here is its count', facts(d).close, 3);
    d.run('openStatus()');
    const sentences = JSON.parse(said(d));
    check('byte for byte the sentence on the reminder\'s line', sentences.includes(d.run('CLOSE_REMINDER_TEXT.line(3)'))
        && line.startsWith(d.run('CLOSE_REMINDER_TEXT.line(3)')), j(sentences));
    same('which reads', d.run('CLOSE_REMINDER_TEXT.line(3)'), 'יש 3 עובדים שהחשבון שלהם עוד לא נסגר');
    same('mirrored, never read: no reading of the close count by this screen', [reads().weeklyCloseRead, reads().closeReminderReadCount, reads().closeReminderRefresh], [0, 0, 0]);
    same('the board, read once', reads().owesRead, 1);
    d.run('closeStatus()');
    same('the disk and the record, byte for byte, after opening it', [disk(d), record(d)], before);

    // The board's own figures and words.
    const board = d.call('owesRead', d.State.schedule, '2026-11-13');
    const money = JSON.parse(d.run('JSON.stringify(statusMoneyFacts())'));
    same('the board\'s own figures: the sum, the gate, its count line', money,
        { folded: board.folded, total: board.total, countLine: d.call('owesCountLine', board) });
    same('drawn in its own words', moneyWords(d, money), [`${d.run('OWES_TEXT.total')}: ${plain(d.call('owesMoney', board.total))}`,
        d.call('owesCountLine', board), `[${d.run('OWES_TEXT.board')}]`].join(' | '));
    check('which is a debt to say', board.folded === true && board.total > 0, j(board.total));

    // The line down, every way: the switch off, ✕ today, nothing to close, the gate shut.
    d.call('closeReminderSetOff', true);
    same('the reminder switched off: no close line', facts(d).close, null);
    d.call('closeReminderSetOff', false);
    d.call('closeReminderRefresh', 'boot');
    given('back on: the line is up again', facts(d).close === 3);
    d.call('closeReminderDismiss');
    same('✕ pressed today: no close line', facts(d).close, null);
    const c = frame(three());
    c.State.commitMany(byHand(c, 'w_w', '2026-11-06', '2026-11-12', 0, '2026-11-13T08:00:00.000Z'));
    c.State.commitMany(byHand(c, 'w_f', '2026-10-30', '2026-11-12', undefined, '2026-11-13T08:01:00.000Z'));
    c.State.commitMany(byHand(c, 'w_g', '2026-10-30', '2026-11-12', undefined, '2026-11-13T08:02:00.000Z'));
    c.call('closeReminderRefresh', 'boot');
    same('nothing left to close: no close line - and no "all closed" claim', facts(c).close, null);
    const s = frame(three({ flags: SHUT, inOrder: false }));
    s.call('closeReminderRefresh', 'boot');
    same('the carry shut: no close line', facts(s).close, null);
    const shutSpy = spy(s, ['weeklyCloseRead']);
    s.run('openStatus(); closeStatus();');
    same('and nothing read for it', shutSpy().weeklyCloseRead, 0);
    const shut = JSON.parse(s.run('JSON.stringify(statusMoneyFacts())'));
    const handed = s.call('owesRead', s.State.schedule, '2026-11-13');
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
    const waiting = JSON.parse(unapproved.run('JSON.stringify(statusMoneyFacts())'));
    same('unapproved: «מקדמות רשומות» and the sum handed over', [waiting.folded, moneyWords(unapproved, waiting).startsWith('מקדמות רשומות: 9000 ₪')],
        [false, true]);

    // Nobody owes: the board's own sentence, and no door to a board with nothing on it.
    const n = phone({ today: '2026-11-13' });
    n.State.schedule.workers = [{ id: 'w_n', name: 'נביל', active: true, dailyRate: 400, hourlyRate: 0 }];
    n.State.schedule.places = PLACES.map(place => Object.assign({}, place));
    between('2026-10-30', '2026-11-12').filter(date => dow(date) !== 6).forEach(date => work(n, 'w_n', date, 'p_01'));
    approve(n);
    kept(n);
    const nobodyReads = spy(n, ['owesRead']);
    const none = JSON.parse(n.run('JSON.stringify(statusMoneyFacts())'));
    same('nobody owes: «אף עובד לא חייב כסף כרגע.», and no door', [none, moneyWords(n, none)], [{ none: true }, 'אף עובד לא חייב כסף כרגע.']);
    same('a record with no advance and no close asks the board nothing at all', nobodyReads().owesRead, 0);
    same('the placeholder until it is read: «מחשב את החשבונות…», no figure', moneyWords(n, undefined), 'מחשב את החשבונות…');

    // THE LINE IS THE COUNT OF ITS OWN RECORD. While the dialog is open the reminder does not read
    // (an open dialog is an edit, midEdit), so the count it left up is the record's of the moment
    // the dialog opened. The money moving under it - the three accounts closed on another phone -
    // takes the line away beside the board read again; the calendar turning a day does too; and a
    // count the reminder itself puts up meanwhile is its own reading, mirrored as it is.
    const o = frame(three());
    o.call('closeReminderRefresh', 'boot');
    given('the reminder\'s line up, with 3', o.run('closeReminderShown') === 3);
    const lineOf = (dev, n) => JSON.parse(said(dev)).includes(dev.run(`CLOSE_REMINDER_TEXT.line(${n})`));
    const anyClose = dev => JSON.parse(said(dev)).some(text => text.startsWith('יש ') && text.includes('שהחשבון שלהם'));
    o.run('openStatus()');
    check('open: the reminder\'s line mirrored', lineOf(o, 3));
    const oReads = spy(o, ['weeklyCloseRead', 'closeReminderReadCount', 'closeReminderRefresh']);
    o.State.commitMany(byHand(o, 'w_w', '2026-11-06', '2026-11-12', 0, '2026-11-13T08:00:00.000Z'));
    o.State.commitMany(byHand(o, 'w_f', '2026-10-30', '2026-11-12', undefined, '2026-11-13T08:01:00.000Z'));
    o.State.commitMany(byHand(o, 'w_g', '2026-10-30', '2026-11-12', undefined, '2026-11-13T08:02:00.000Z'));
    o.run('renderStatusIfOpen()');
    same('the accounts closed under the open dialog: the count of the record before is not said beside the board',
        [anyClose(o), o.run('Boolean(document.getElementById("statusBody").querySelectorAll("button").find(b => b.dataset.statusKey === "go:close"))')],
        [false, false]);
    same('and nothing was read to say it: the close count is never this screen\'s to read', oReads(),
        { weeklyCloseRead: 0, closeReminderReadCount: 0, closeReminderRefresh: 0 });
    same('the reminder\'s own line is the reminder\'s - this screen took nothing down', o.run('closeReminderShown'), 3);
    o.run('closeStatus(); openStatus()');
    check('opened again over the record as it is now, its line is the line that is up', lineOf(o, 3));
    o.run('closeStatus()');
    const m = frame(three());
    m.call('closeReminderRefresh', 'boot');
    m.run('openStatus()');
    check('open over Friday\'s record: the line mirrored', lineOf(m, 3));
    m.setToday('2026-11-14');
    m.run('renderStatusIfOpen()');
    same('the calendar turned a day under the open dialog: the line of the day before goes', anyClose(m), false);
    m.run('closeReminderShow(2)');
    m.run('renderStatusIfOpen()');
    check('a count the reminder itself puts up meanwhile is its own reading: mirrored as it is', lineOf(m, 2));
    m.run('closeStatus()');
});

// ================================================================== S1 today's door and the journey
// THE DAY SCREEN IS THE JOURNEY'S AT ITS FIRST STATION, its date the journey's: «פתיחת היום
// לעריכה» there would carry tomorrow's seder to today and write the journey's place to say so.
await block('S1 today\'s door: never while a journey builds another day on the day screen - and nothing written', async () => {
    const d = frame(screensRecord());
    const keys = () => JSON.parse(d.run('JSON.stringify(document.getElementById("statusBody").querySelectorAll("button").map(b => b.dataset.statusKey))'));
    d.run('openStatus()');
    check('no journey: the door to today is there', keys().includes('go:today'), j(keys()));
    d.run('closeStatus()');
    // The journey at its first station for tomorrow - the place the dock's own button leaves it.
    d.run(`journeyLive = { version: 1, date: '2026-11-11', station: 1, at: Date.now(), open: true }; State.date = '2026-11-11';`);
    const before = [disk(d), record(d)];
    d.run('openStatus()');
    same('a journey building Wednesday on the day screen: no door to today; the journey\'s own door is there',
        [keys().includes('go:today'), keys().includes('go:journey')], [false, true]);
    same('and a press that reached it anyway moves nothing: no date, no journey, no byte',
        [d.run('statusGoToday()'), d.run('State.date'), d.run('journeyDate()'), d.run('journeyStation()'), disk(d), record(d)],
        [false, '2026-11-11', '2026-11-11', 1, before[0], before[1]]);
    d.run('closeStatus()');
    // At a station that is not the day screen, or on today itself, the door moves no journey.
    d.run(`journeyLive.station = 2;`);
    d.run('openStatus()');
    check('at the journey\'s second station the day screen is not its editor: the door is there', keys().includes('go:today'));
    d.run('closeStatus()');
    d.run(`journeyLive.station = 1; journeyLive.date = '2026-11-10'; State.date = '2026-11-10';`);
    d.run('openStatus()');
    check('a journey building today itself: the door to today is there - it moves nothing', keys().includes('go:today'));
    d.run('closeStatus(); journeyLive = null;');
});

// ================================================================== S5 the one reading
const COUNTER = `var COST = null; (function () {
    const real = { plan: planAdvanceCarry, gate: carryMigrationSettled };
    planAdvanceCarry = function () { if (COST) COST.plans += 1; return real.plan.apply(this, arguments); };
    carryMigrationSettled = function () { if (COST) COST.questions += 1; return real.gate.apply(this, arguments); };
})();
function cost(work) { COST = { plans: 0, questions: 0 }; try { work(); } finally { var out = COST; COST = null; } return out; }`;
await block('S5 the one reading: the board inside reportReadOnce + weeklyCloseOnce, equal to the bare one, once', async () => {
    const d = frame(three());
    const inside = d.run('JSON.stringify(reportReadOnce(() => weeklyCloseOnce(() => owesReadNow())))');
    d.run('OWES_KEPT = null;');
    const bare = d.run('JSON.stringify(owesRead(State.schedule, todayStr()))');
    same('inside reportReadOnce and weeklyCloseOnce: the bare owesRead, byte for byte', inside, bare);

    // Counted the way tests/reports.speed.test.mjs counts it.
    d.run(COUNTER);
    const reads = spy(d, ['owesRead', 'weeklyCloseRead', 'payrollReport']);
    const first = JSON.parse(d.run('JSON.stringify(cost(() => { OWES_KEPT = null; statusMoneyFacts(); }))'));
    same('approved: the gate is asked nothing of the plan, and nothing is planned', first, { plans: 0, questions: 0 });
    same('the board read once, the close count never', [reads().owesRead, reads().weeklyCloseRead], [1, 0]);
    resetSpy(d);
    d.run('statusMoneyFacts()');
    same('the record unmoved (OWES_KEPT fresh): nothing read at all', [reads().owesRead, reads().weeklyCloseRead, reads().payrollReport], [0, 0, 0]);
    resetSpy(d);
    d.State.commit(d.call('assignPlace', d.State.schedule, '2026-11-13', 'w_f', 'actual', 'p_02'));
    d.run('statusMoneyFacts(); statusMoneyFacts(); statusMoneyFacts();');
    same('a moved record: read again exactly once', [reads().owesRead, reads().weeklyCloseRead], [1, 0]);
    // A write on the day screen, then an open.
    resetSpy(d);
    d.run('currentView = "day";');
    d.State.commit(d.call('assignPlace', d.State.schedule, '2026-11-13', 'w_g', 'actual', 'p_02'));
    d.run('openStatus(); closeStatus();');
    same('a write on the day screen and then an open: one owesRead, no weeklyCloseRead', [reads().owesRead, reads().weeklyCloseRead], [1, 0]);

    // Unapproved: the gate's question planned at most once a reading.
    const u = phone({ today: '2026-11-13' });
    u.State.schedule.workers = [{ id: 'w_u', name: 'עומר', active: true, dailyRate: 400, hourlyRate: 0 }];
    u.State.schedule.places = PLACES.map(place => Object.assign({}, place));
    between('2026-08-07', '2026-11-12').filter(date => dow(date) !== 6).forEach(date => work(u, 'w_u', date, 'p_01'));
    u.call('addAdvance', u.State.schedule, 'w_u', '2026-10-19', 9000, '');
    kept(u);
    const w = phone({ today: '2026-11-13', storage: u.dump() });
    w.run(COUNTER);
    const planned = JSON.parse(w.run('JSON.stringify(cost(() => { OWES_KEPT = null; REPORT_GATE_KEPT = null; statusMoneyFacts(); }))'));
    check('unapproved: the gate planned once at most for the whole reading', planned.plans <= 1 && planned.questions <= 1, j(planned));
    same('and an unmoved record not again', JSON.parse(w.run('JSON.stringify(cost(() => statusMoneyFacts()))')), { plans: 0, questions: 0 });
    same('afterwards the page\'s functions are the ones that were there, and no reading is left open',
        d.run('[REPORT_ONCE === null, payrollReport.toString().indexOf("__spies") !== -1].join()'), 'true,true');
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
    same('each row starts with its Friday, written as the app writes a short date', pulse.weeks.map(week => week.label),
        pulse.weeks.map(week => `${week.from.slice(8, 10)}/${week.from.slice(5, 7)}`));

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

    // Each week's total: its cells - the week tab's rule summed; and the sheet's attendance, for
    // a week nobody closed (a closed period answers its FROZEN counts, js/model/money.js).
    same('each total is its cells', pulse.weeks.map(week => week.total),
        pulse.weeks.map(week => week.days.reduce((sum, day) => sum + (day.n || 0), 0)));
    same('which is the week tab\'s own count summed over the week, up to today', pulse.weeks.map(week => week.total),
        pulse.weeks.map(week => weekRule(week.days.map(day => day.date)).filter((n, i) => week.days[i].n !== null).reduce((a, b) => a + b, 0)));
    const sheet = (from, to) => d.call('payrollReport', d.State.schedule, from, to).reduce((sum, row) => sum + row.attendanceDays, 0);
    const open = (from, to) => d.State.schedule.workers.every(w => d.call('frozenPeriodFor', d.State.schedule, w.id, from, to) === undefined);
    const unclosed = pulse.weeks.filter(week => open(week.from, week.to < today ? week.to : today));
    given('a season nobody closed: every week is one the sheet reads live', unclosed.length === 12);
    same('a week nobody closed: Σ payrollReport(week).attendanceDays', unclosed.map(week => week.total),
        unclosed.map(week => sheet(week.from, week.to < today ? week.to : today)));

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
        `בממוצע ${avg(pulse.weeks.slice(0, 4))} עובדים ביום עבודה בארבעת השבועות האחרונים, ו-${avg(pulse.weeks.slice(4, 8))} בארבעת השבועות שלפניהם.`);
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

    // A weekly man's week CLOSED, and then a day of it corrected: the pulse is the live record,
    // the sheet over exactly that week answers the closure's frozen basis - by exactly the day.
    const small = phone({ today: TODAY });
    small.State.schedule.workers = [
        { id: 'w_k', name: 'כרים', active: true, dailyRate: 400, hourlyRate: 0, payCycles: '2026-08-07=weekly' },
        { id: 'w_l', name: 'לואי', active: true, dailyRate: 420, hourlyRate: 0 }];
    small.State.schedule.places = PLACES.map(place => Object.assign({}, place));
    between('2026-10-23', TODAY).filter(date => dow(date) !== 6).forEach(date => {
        work(small, 'w_k', date, 'p_01');
        work(small, 'w_l', date, 'p_02');
    });
    approve(small);
    kept(small);
    const closedWeek = { from: '2026-10-30', to: '2026-11-05' };
    const weekRow = () => facts(small, TODAY).pulse.weeks.find(one => one.from === closedWeek.from);
    const smallSheet = () => small.call('payrollReport', small.State.schedule, closedWeek.from, closedWeek.to)
        .reduce((sum, row) => sum + row.attendanceDays, 0);
    const was = weekRow().total;
    small.State.commitMany(byHand(small, 'w_k', closedWeek.from, closedWeek.to, 0, '2026-11-05T16:00:00.000Z'));
    given('his week is one a closure froze', small.call('frozenPeriodFor', small.State.schedule, 'w_k', closedWeek.from, closedWeek.to) !== undefined);
    same('closed and not yet corrected: the pulse and the sheet agree', [weekRow().total, smallSheet()], [was, was]);
    small.State.commit(small.call('clearWorkerDay', small.State.schedule, '2026-11-03', 'w_k', 'actual'));
    const corrected = weekRow();
    same('a day of it corrected: the pulse follows the live record - the week tab\'s own count', corrected.total,
        small.run(`(function (dates) {
            const foot = renderWeekTotals(dates, weekWorkers(dates));
            return foot.children[0].children.slice(1).reduce((sum, td) => sum + (td.textContent === '' ? 0 : Number(td.textContent)), 0);
        })(${j(corrected.days.map(day => day.date))})`));
    same('a day less than before', corrected.total, was - 1);
    same('while the sheet over that week answers the frozen basis: different by exactly the correction', smallSheet() - corrected.total, 1);

    // No Saturday with anything on it: six columns.
    const plainWeeks = season(phone(), { seed: 42 });
    const six = facts(plainWeeks, today).pulse;
    same('no Saturday with anything on it among the twelve: six columns, Friday first', [six.saturday, six.columns], [false, [5, 0, 1, 2, 3, 4]]);
    // A Saturday holding only an absence, and one holding only a Rima count: the column is there,
    // its cells 0 - the day's arrows' own rule (anyRecordOnRestDay), the month board's too.
    const away = season(phone(), { seed: 42 });
    absent(away, 'w_01', '2026-10-31');
    kept(away);
    const withAbsence = facts(away, today).pulse;
    same('a Saturday with only an absence on it: «ש׳» for every row, and its cell 0', [withAbsence.saturday,
        withAbsence.weeks.flatMap(w => w.days).find(day => day.date === '2026-10-31').n], [true, 0]);
    const rima = season(phone(), { seed: 42 });
    rima.call('setRimaCount', rima.State.schedule, '2026-10-24', 'p_1', 2);
    kept(rima);
    same('a Saturday with only a Rima count: the same', [facts(rima, today).pulse.saturday,
        facts(rima, today).pulse.weeks.flatMap(w => w.days).find(day => day.date === '2026-10-24').n], [true, 0]);
    same('which is anyRecordOnRestDay, the day screen\'s own rule', [away.call('anyRecordOnRestDay', '2026-10-31'),
        rima.call('anyRecordOnRestDay', '2026-10-24'), plainWeeks.call('anyRecordOnRestDay', '2026-10-31')], [true, true, false]);
    // Only the last four weeks worked: one average.
    const fresh = season(phone(), { first: '2026-10-25', seed: 9, advances: false });
    const recent = facts(fresh, today).pulse;
    check('a crew that began within the last four weeks: one average', recent.caption !== null
        && recent.caption.endsWith('בארבעת השבועות האחרונים.') && !recent.caption.includes('שלפניהם'), String(recent.caption));
    same('and a crew with no day at all: no caption', facts(phone(), today).pulse.caption, null);

    // A crew that stopped a month ago: the last four weeks hold no working day, the four before do.
    // That is said as it is - never «בממוצע 0 עובדים ביום עבודה», an average of nobody over days
    // that, by this screen's own rule, were not working days.
    const stopped = phone({ today });
    stopped.State.schedule.places = [{ id: 'p_1', name: 'אתר', active: true }];
    stopped.State.schedule.workers = Array.from({ length: 11 }, (_, i) => ({ id: `w_${i + 1}`, name: `עובד ${i + 1}`, active: true,
        dailyRate: 400, hourlyRate: 0 }));
    between('2026-08-01', '2026-10-15').filter(date => dow(date) !== 6)
        .forEach(date => stopped.State.schedule.workers.forEach(w => work(stopped, w.id, date, 'p_1')));
    kept(stopped);
    same('no working day in the last four weeks: said so, and the four before said apart',
        facts(stopped, today).pulse.caption,
        'בארבעת השבועות האחרונים לא היה יום עבודה. בארבעת השבועות שלפניהם: בממוצע 11 עובדים ביום עבודה.');
    // One man at work: «עובד אחד», never «1 עובדים».
    const alone = phone({ today });
    alone.State.schedule.places = [{ id: 'p_1', name: 'אתר', active: true }];
    alone.State.schedule.workers = [{ id: 'w_1', name: 'עובד', active: true, dailyRate: 400, hourlyRate: 0 }];
    between('2026-09-20', today).filter(date => dow(date) !== 6).forEach(date => work(alone, 'w_1', date, 'p_1'));
    kept(alone);
    same('a crew of one: one man a working day, in the singular',
        facts(alone, today).pulse.caption, 'בממוצע עובד אחד ביום עבודה בארבעת השבועות האחרונים, ו-1 בארבעת השבועות שלפניהם.');
});

// ================================================================== S7 the sites
await block('S7 the sites: which and in what order, the month so far, own + Rima = the billing count, eight weeks, יוסף גבס apart', async () => {
    const d = season(phone(), { saturday: '2026-10-31' });
    const today = TODAY;
    const seen = facts(d, today);
    const thisWeek = seen.pulse.weeks[0].from;
    const from8 = addDays(thisWeek, -49);
    const eight = d.call('invoiceWithoutRima', d.State.schedule, from8, today);
    const worked = d.State.schedule.places.filter(place => eight.places.some(row => row.placeId === place.id && row.workerDays > 0));
    same('every site of the roster with his men in the last eight weeks, and no other',
        seen.sites.map(site => site.placeId).sort(), worked.map(place => place.id).sort());
    check('the archived site, last worked in October, is one of them - a site of the roster, with a card',
        seen.sites.some(site => site.placeId === 'p_6' && site.active === false && site.listed === true));
    const monthFrom = '2026-11-01';
    const own = id => d.call('invoiceWithoutRima', d.State.schedule, monthFrom, today, id).total;
    const active = seen.sites.filter(site => site.active);
    same('active first, by this month\'s own count; the archived after them', seen.sites.map(site => site.active),
        seen.sites.map(site => site.active).slice().sort((a, b) => Number(b) - Number(a)));
    same('in order of this month\'s count', active.map(site => site.month), active.map(site => site.month).slice().sort((a, b) => b - a));
    same('a site\'s month SO FAR is his own men\'s worker-site days there, the first of the month to today', seen.sites.map(site => site.month),
        seen.sites.map(site => own(site.placeId)));
    same('and Rima beside it is rimaReport\'s, to today', seen.sites.map(site => site.rima),
        seen.sites.map(site => d.call('rimaReport', d.State.schedule, monthFrom, today, site.placeId).total));
    const billed = d.call('invoiceByDate', d.State.schedule, monthFrom, today);
    same('own + Rima is the billing count of the month so far, site by site', seen.sites.map(site => site.month + site.rima),
        seen.sites.map(site => (billed.places.find(row => row.placeId === site.placeId) || { workerDays: 0 }).workerDays));
    const summary = () => JSON.parse(d.run('JSON.stringify(monthSummaryScope(() => monthSummaryRead("2026-11")).sites)'));
    given('nothing recorded after today', Object.keys(d.State.schedule.days).every(date => date <= today));
    same('nothing after today recorded: «סיכום חודש»\'s own count of the month', seen.sites.filter(site => site.month + site.rima > 0)
        .map(site => [site.placeId, site.month + site.rima]).sort(), summary().map(site => [site.id, site.days]).sort());
    check('Rima is on some site this month', seen.sites.some(site => site.rima > 0));

    // Tomorrow's seder typed: the month so far does not move; «סיכום חודש», which reads the whole
    // month, differs by exactly tomorrow's count, site by site.
    const tomorrow = addDays(today, 1);
    ['w_01', 'w_02', 'w_03', 'w_04', 'w_05'].forEach((id, i) => work(d, id, tomorrow, i < 3 ? 'p_1' : 'p_3'));
    d.call('setRimaCount', d.State.schedule, tomorrow, 'p_3', 2);
    kept(d);
    const later = facts(d, today);
    same('tomorrow\'s seder typed: the month so far does not move', later.sites.map(site => [site.placeId, site.month, site.rima]),
        seen.sites.map(site => [site.placeId, site.month, site.rima]));
    const tomorrowCount = id => d.call('invoiceByDate', d.State.schedule, tomorrow, tomorrow).countAt(id, tomorrow);
    same('«סיכום חודש» differs from it by exactly tomorrow\'s count, and only by it', summary().map(site => [site.id,
        site.days - ((later.sites.find(one => one.placeId === site.id) || { month: 0, rima: 0 }).month
            + (later.sites.find(one => one.placeId === site.id) || { month: 0, rima: 0 }).rima)]).sort(),
    summary().map(site => [site.id, tomorrowCount(site.id)]).sort());
    check('and tomorrow does count there', tomorrowCount('p_1') === 3 && tomorrowCount('p_3') === 4);

    // The eight weeks, against the men on the site counted date by date.
    const weeks = place => Array.from({ length: 8 }, (_, k) => addDays(from8, 7 * k)).map(friday =>
        between(friday, addDays(friday, 6)).filter(date => date <= today)
            .reduce((sum, date) => sum + d.call('workersAtPlace', d.State.schedule, date, place, 'actual').length, 0));
    same('each site\'s eight weeks, oldest first: his men on it, week by week', later.sites.map(site => site.weeks),
        later.sites.map(site => weeks(site.placeId)));
    same('which is Σ of the invoice\'s own countAt', later.sites.map(site => site.weeks.reduce((a, b) => a + b, 0)),
        later.sites.map(site => between(from8, today).reduce((sum, date) => sum + eight.countAt(site.placeId, date), 0)));

    // «עובדי יוסף גבס»: the month so far, its own line, in no other number.
    same('יוסף גבס this month so far is yosefGevesReport\'s own total', later.yosef,
        d.call('yosefGevesReport', d.State.schedule, monthFrom, today).total);
    check('and there is one to say', later.yosef > 0);
    const without = value => { const copy = JSON.parse(j(value)); delete copy.yosef; return j(copy); };
    between('2026-11-01', today).filter(date => dow(date) !== 6).forEach(date => {
        ['p_1', 'p_3', 'p_4'].forEach(place => d.call('setYosefGevesCount', d.State.schedule, date, place, 7));
    });
    d.call('setYosefGevesCount', d.State.schedule, tomorrow, 'p_1', 9);
    kept(d);
    const more = facts(d, today);
    check('more of them typed: the line moves', more.yosef > later.yosef, `${later.yosef} -> ${more.yosef}`);
    same('by what was typed up to today - tomorrow\'s is not in it', more.yosef,
        d.call('yosefGevesReport', d.State.schedule, monthFrom, today).total);
    same('and not one other number on the screen moves', without(more), without(later));
    same('its line names the list by the list\'s own title', d.run('STATUS_TEXT.yosef(6)'), `${d.run('YOSEF_GEVES_TITLE')} החודש: 6`);

    // A site the record names and the roster has not got: a plain row, named as the reports name it.
    const ghost = season(phone(), { seed: 11, advances: false });
    ['w_01', 'w_02'].forEach(id => work(ghost, id, '2026-11-17', 'p_gone'));
    kept(ghost);
    const unlisted = facts(ghost, today).sites.find(site => site.placeId === 'p_gone');
    same('a site outside the roster: a row of its own, not of the roster, named as the reports name it, last',
        [unlisted && unlisted.listed, unlisted && unlisted.name, facts(ghost, today).sites.slice(-1)[0].placeId],
        [false, 'אתר שאינו ברשימה 1', 'p_gone']);
    same('with its own count', unlisted.month, 2);
    // Drawn: the archived site a button to its card, the unlisted one a plain row with the same
    // words (openSiteCard says nothing for a place the roster has not got).
    frame(ghost);
    ghost.run('openStatus()');
    const rows = JSON.parse(ghost.run(`JSON.stringify(document.getElementById('statusBody').querySelectorAll('.status-site')
        .map(node => [node.dataset.placeId, node.tagName, node.getAttribute('role'), node.getAttribute('aria-label'),
            node.querySelectorAll('BUTTON').length]))`));
    const row = id => rows.find(one => one[0] === id) || [];
    same('the archived site is drawn as a button, named by its words', row('p_6').slice(1, 3), ['BUTTON', null]);
    same('the site outside the roster as a plain row - a group, named by the same words, no button in it',
        row('p_gone').slice(1), ['DIV', 'group', ghost.call('statusSiteName', unlisted), 0]);
    check('and its words say what it is', plain(ghost.call('statusSiteName', unlisted)).startsWith('אתר שאינו ברשימה 1: 2 ימי עובד־אתר החודש'),
        ghost.call('statusSiteName', unlisted));
    ghost.run('closeStatus()');

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
    if (mB >= 4 - tiny && mR <= 0.6 * mB + tiny && mB - mR >= 3 - tiny) return 'בירידה';
    let firstOwn = null;
    for (let i = 0; i <= e && firstOwn === null; i += 1) if (own(i) > 0) firstOwn = i;
    if (firstOwn !== null && firstOwn >= e - 11 && sum(R) >= 10) return 'חדש';
    if (mB >= 2 - tiny && mR >= 1.6 * mB - tiny && mR - mB >= 3 - tiny) return 'בעלייה';
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
    const firstFall = said.p_fall.find(e => facts(d, days[e]).sites.find(one => one.placeId === 'p_fall').phase === 'בירידה');
    const firstRule = Array.from({ length: days.length }, (_, e) => e).find(e => oracle('p_fall', e) === 'בירידה');
    check('the falling site says «בירידה» - never before its drop', firstFall >= 70, String(firstFall));
    check('within five working days of the drop meeting the rule', firstFall !== undefined && firstFall - firstRule <= 5,
        `${firstFall} / ${firstRule}`);
    check('and while it holds', said.p_fall.filter(e => oracle('p_fall', e) === 'בירידה').length
        === Array.from({ length: days.length }, (_, e) => e).filter(e => e >= 30 && oracle('p_fall', e) === 'בירידה').length);
    const words = site => [...new Set(said[site].map(e => facts(d, days[e]).sites.find(one => one.placeId === site).phase))];
    check('«חדש» on the new site', words('p_new').includes('חדש'), j(words('p_new')));
    check('«שקט» on the active site that stopped', words('p_quiet').includes('שקט'), j(words('p_quiet')));
    check('never «שקט» on the archived one that stopped the same way', !words('p_stopped').includes('שקט'), j(words('p_stopped')));
    check('«בעלייה» on the rising site', words('p_rise').includes('בעלייה'), j(words('p_rise')));
    // Under thirty-six working days on the record: nobody has a word.
    const young = phone();
    const youngDays = lifecycles(young, '2026-07-10');
    given('a record of fewer than thirty-six working days', youngDays.length < 36, String(youngDays.length));
    same('under thirty-six working days: no site gets a word', facts(young, youngDays[youngDays.length - 1]).sites
        .filter(site => site.phase !== null), []);
    const P = JSON.parse(d.run('JSON.stringify(STATUS_PHASE)'));
    same('the constants, pinned', P, {
        history: 36, recent: 12, before: 24, quietDays: 5, fallFrom: 4, fallShare: 0.6, fallBy: 3,
        freshDays: 10, riseFrom: 2, riseShare: 1.6, riseBy: 3 });
    same('the sentence under the list says the rule\'s own numbers, read from the constants', d.run('STATUS_TEXT.phaseNote'),
        `בעלייה או בירידה: כמה עובדים היו ביום עבודה ב-${P.recent} ימי העבודה האחרונים, לעומת ${P.before} ימי העבודה שלפניהם. `
        + `חדש: אתר שהתחיל לעבוד ב-${P.recent} ימי העבודה האחרונים. שקט: אתר פעיל שלא עבד בו אף עובד ב-${P.quietDays} ימי העבודה האחרונים.`);
    same('and the history is the two windows together', P.history, P.recent + P.before);

    // Drawn under the list ONLY when a word is there to be explained: five lines about words no
    // site has are words to look for.
    const notes = dev => {
        frame(dev);
        dev.run('openStatus()');
        const out = JSON.parse(dev.run(`(function () { const out = [];
            const walk = n => { if (n.tagName === 'P' && n.className === 'status-note') out.push(n.textContent); n.children.forEach(walk); };
            walk(document.getElementById('statusBody')); return JSON.stringify(out); })()`));
        dev.run('closeStatus()');
        return out;
    };
    const note = d.run('STATUS_TEXT.phaseNote');
    const worded = said.p_fall.filter(e => oracle('p_fall', e) === 'בירידה').pop();
    d.setToday(days[worded]);
    given('an evening on which a site has its word', facts(d, days[worded]).sites.some(site => site.phase),
        `${days[worded]} ${j(facts(d, days[worded]).sites.map(site => site.phase))}`);
    same('a word on the list: the sentence under it says what the words mean', notes(d).includes(note), true);
    d.setToday(TODAY);
    given('the season\'s last evening: every site steady, or quiet in the way that has no word', !facts(d, TODAY).sites.some(site => site.phase));
    same('the same list on an evening with no word: no sentence about the words', notes(d).includes(note), false);
    given('the young record\'s sites have no word today', !facts(young, young.ctx.todayStr()).sites.some(site => site.phase));
    same('no word on any site: no sentence about the words', notes(young).includes(note), false);
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

    // A phone with nothing on it - a first install, where the chip is the first thing he may tap:
    // the dialog opens, says what there is, and writes nothing.
    const empty = frame(phone());
    const untouched = [disk(empty), record(empty)];
    given('a first install: no man, no site', empty.State.schedule.workers.length === 0 && empty.State.schedule.places.length === 0);
    same('the dialog opens on it', empty.run('openStatus()'), true);
    const words = JSON.parse(said(empty));
    same('and says what there is: nobody today, nobody owing, no site worked, no backup yet', ['עוד אין היום אף עובד באתר.',
        'אף עובד לא חייב כסף כרגע.', 'לא נרשמה עבודה באתרים ב-8 השבועות האחרונים.', 'אין במכשיר הזה רישום של ייצוא קובץ גיבוי.']
        .filter(sentence => !words.includes(sentence)), []);
    same('no payday line, no close line and no caption: nothing to say is said by nothing',
        [facts(empty).payday, facts(empty).close, facts(empty).pulse.caption], [null, null, null]);
    same('and nothing written', [disk(empty), record(empty)], untouched);
    empty.run('closeStatus()');
});

// ================================================================== S10 the words
await block('S10 the words: every one pinned, every borrowed one found where it lives, nothing written', async () => {
    const d = phone();
    const T = name => d.run(`STATUS_TEXT.${name}`);
    const fixed = {
        title: 'תמונת מצב', door: 'תמונת מצב', nobodyToday: 'עוד אין היום אף עובד באתר.',
        money: 'חשבונות ומקדמות', pulse: '12 השבועות האחרונים', few: 'מעט', many: 'הרבה',
        pulseHint: 'לחיצה על שבוע פותחת אותו במסך השבוע.', sites: 'האתרים', siteDays: 'ימי עובד־אתר החודש',
        rising: 'בעלייה', falling: 'בירידה', fresh: 'חדש', quiet: 'שקט',
        phaseNote: 'בעלייה או בירידה: כמה עובדים היו ביום עבודה ב-12 ימי העבודה האחרונים, לעומת 24 ימי העבודה שלפניהם. '
            + 'חדש: אתר שהתחיל לעבוד ב-12 ימי העבודה האחרונים. שקט: אתר פעיל שלא עבד בו אף עובד ב-5 ימי העבודה האחרונים.',
        noSites: 'לא נרשמה עבודה באתרים ב-8 השבועות האחרונים.', device: 'המכשיר הזה'
    };
    same('every fixed word, word for word', Object.keys(fixed).map(key => T(key)), Object.values(fixed));
    const made = [
        ['doorName("מסונכרן")', 'תמונת מצב · מסונכרן'],
        ['heroLabel(1)', 'עובד היום'], ['heroLabel(12)', 'עובדים היום'],
        ['inSites(1)', 'באתר אחד'], ['inSites(4)', 'ב-4 אתרים'],
        ['rima(3)', 'רימא 3'],
        ['nextPayday("יום חמישי", "26/11", false)', 'יום התשלום הבא: יום חמישי 26/11'],
        ['nextPayday("יום חמישי", "19/11", true)', 'יום התשלום הבא: היום, יום חמישי 19/11'],
        ['rides("כל העובדים משובצים")', 'הסעות: כל העובדים משובצים'], ['rides("בלי מושב: 3")', 'הסעות: בלי מושב: 3'],
        ['worked(2, 0)', 'עבדו בתקופה: שבועי\u00a02'], ['worked(0, 12)', 'עבדו בתקופה: דו־שבועי\u00a012'],
        ['worked(0, 1)', 'עבדו בתקופה: דו־שבועי\u00a01'],
        ['worked(8, 4)', 'עבדו בתקופה: שבועי\u00a08 ·\u00a0דו־שבועי\u00a04'],
        ['pulseCaption(11.5, 9)', 'בממוצע 11.5 עובדים ביום עבודה בארבעת השבועות האחרונים, ו-9 בארבעת השבועות שלפניהם.'],
        ['pulseCaption(1, 1)', 'בממוצע עובד אחד ביום עבודה בארבעת השבועות האחרונים, ו-1 בארבעת השבועות שלפניהם.'],
        ['pulseCaptionRecent(7)', 'בממוצע 7 עובדים ביום עבודה בארבעת השבועות האחרונים.'],
        ['pulseCaptionRecent(1)', 'בממוצע עובד אחד ביום עבודה בארבעת השבועות האחרונים.'],
        ['pulseCaptionQuiet(11)', 'בארבעת השבועות האחרונים לא היה יום עבודה. בארבעת השבועות שלפניהם: בממוצע 11 עובדים ביום עבודה.'],
        ['pulseCaptionQuiet(1)', 'בארבעת השבועות האחרונים לא היה יום עבודה. בארבעת השבועות שלפניהם: בממוצע עובד אחד ביום עבודה.'],
        ['weekName("R", 1, "D")', 'שבוע R: יום נוכחות אחד · D'], ['weekName("R", 54, "D")', 'שבוע R: 54 ימי נוכחות · D'],
        ['siteName("X", 1, "W")', 'X: יום עובד־אתר אחד החודש · 8 השבועות האחרונים: W'],
        ['siteName("X", 14, "W")', 'X: 14 ימי עובד־אתר החודש · 8 השבועות האחרונים: W'],
        ['yosef(6)', 'עובדי יוסף גבס החודש: 6']
    ];
    same('every template, word for word', made.map(([call]) => T(call)), made.map(([, words]) => words));
    same('and nothing in the block that is not pinned here', JSON.parse(d.run('JSON.stringify(Object.keys(STATUS_TEXT))')).sort(),
        Object.keys(fixed).concat(['doorName', 'heroLabel', 'inSites', 'rima', 'rides', 'nextPayday', 'worked', 'pulseCaption',
            'pulseCaptionRecent', 'pulseCaptionQuiet', 'weekName', 'siteName', 'yosef']).sort());
    check('no number before a singular adjective: the cycles are named, then counted', !/\d+[\s\u00a0]+(שבועי|דו־שבועי)/.test(T('worked(8, 4)')));
    same('and one colon in the line, never a colon after a cycle\'s word', T('worked(8, 4)').split(':').length - 1, 1);
    check('a count is never put against a «4» of the period: the four weeks are in words',
        !/\d+ ב-4|ב-4 השבועות/.test(T('pulseCaption(24, 9)') + T('pulseCaptionRecent(24)') + T('pulseCaptionQuiet(24)')));
    check('and never «0 עובדים» or «1 עובדים»', ![T('pulseCaption(1, 0)'), T('pulseCaptionRecent(1)'), T('pulseCaptionQuiet(1)')]
        .some(text => /(^|\s)[01] עובדים/.test(text)));
    const owner = {
        today: ['index.html', '<span>היום</span>'], openDay: ['js/ui/week.js', "'פתיחת היום לעריכה'"],
        rima: ['js/ui/day.js', "'רימא'"], reports: ['index.html', '<span>דוחות</span>'], inactive: ['js/ui/roster.js', "'לא פעיל'"],
        cloud: ['index.html', '<h3>ענן וסנכרון</h3>'], backup: ['index.html', '<h3>גיבוי</h3>'], close: ['index.html', '>סגור</button>']
    };
    const reused = JSON.parse(d.run('JSON.stringify(STATUS_REUSED)'));
    same('every borrowed word is one this file lists', Object.keys(reused).sort(), Object.keys(owner).sort());
    same('and each is found, as it is, in its owner\'s source', Object.keys(owner).filter(key =>
        !source(owner[key][0]).includes(owner[key][1]) || !owner[key][1].includes(reused[key])), []);
    same('the words read from their owners, as they stand there', [d.run('JOURNEY_TEXT.forDay("יום ראשון", "22/11/2026")'),
        d.run('JOURNEY_TEXT.sendWorkers'), d.run('SEDER_TEXT.progress(3, 12)'), d.run('CLOSE_REMINDER_TEXT.line(4)'),
        d.run('CLOSE_REMINDER_TEXT.open'), d.run('OWES_TEXT.total'), d.run('OWES_TEXT.board'), d.run('OWES_TEXT.none'),
        d.run('OWES_REUSED.recorded'), d.run('OWES_TEXT.sum'), d.run('WEEKLY_CLOSE_TEXT.reading'), d.run('PAY_CYCLE_LABELS.weekly'),
        d.run('PAY_CYCLE_LABELS.biweekly'), d.run('YOSEF_GEVES_TITLE'), d.run('HEBREW_DAY_LETTERS.join(" ")'), d.run('TRANSPORT_TEXT.title')],
    ['סידור ליום ראשון 22/11/2026', 'הודעה לכל עובד', 'נפתחו 3 מתוך 12', 'יש 4 עובדים שהחשבון שלהם עוד לא נסגר', 'לסגירת שבוע',
        'חוב פתוח של העובדים', 'מי חייב כסף', 'אף עובד לא חייב כסף כרגע.', 'מקדמות רשומות', 'סה״כ', 'מחשב את החשבונות…',
        'שבועי', 'דו־שבועי', 'עובדי יוסף גבס', 'א׳ ב׳ ג׳ ד׳ ה׳ ו׳ ש׳', 'הסעות']);
    check('the borrowed sentences are taken from their owners, never typed again here', !/'מחשב את החשבונות…'|'אף עובד לא חייב כסף כרגע\.'|'מקדמות רשומות'|'לסגירת שבוע'|'מי חייב כסף'/.test(STATUS));

    const code = STATUS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/[^'"`\n]*$/gm, '');
    check('the file writes no key and touches no disk', !/Store\.(set|setVerified|remove|clear)|localStorage|sessionStorage|indexedDB/.test(code));
    check('commits nothing and saves nothing', !/State\.(commit|commitMany|commitRoster|save|persist)\b|saveFinancialAction|closePeriodChanges|recordNew|addAdvance/.test(code));
    check('calls no dialog of the browser (law 11)', !/\b(alert|confirm|prompt)\s*\(/.test(code));
    check('and never says «נשלח»', !STATUS.includes('נשלח'));
    check('no money is worked out here: it prices nothing', !/dailyRate|hourlyRate|ratesForDay|moneyOf\(|amount\s*\*|advanceAccount|advanceWalk/.test(code));
    check('the close count is never read here: no weeklyCloseRead, closeReminderReadCount, closeReminderRefresh or closeReminderCount',
        !/weeklyCloseRead|closeReminderReadCount|closeReminderRefresh|closeReminderCount\b/.test(code));
    check('and the reminder\'s state is only read: nothing assigns closeReminderShown or CLOSE_REMINDER_KEPT',
        !/closeReminderShown\s*=[^=]|CLOSE_REMINDER_KEPT\s*=[^=]/.test(code));
    same('the board is read in ONE place, by owesReadNow, and never bare', [(code.match(/owesReadNow\(\)/g) || []).length,
        /\bowesRead\(/.test(code)], [1, false]);
    check('the rides are only read: no transportDayOf, transportPrune, transportPeekDay, transportLoad or openTransport',
        !/transportDayOf|transportPrune|transportPeekDay|transportLoad|openTransport/.test(code));
    check('and nothing of theirs is assigned', !/transportSettingsMemory\s*=[^=]|transportDays\s*\[[^\]]*\]\s*=[^=]/.test(code));
    // The hooks in the files this track touches.
    const app = source('js/app.js');
    check('render() asks renderStatusIfOpen through typeof - after the close reminder\'s, whose line it mirrors',
        /closeReminderAfterRender\(\);\s*\n(\s*\/\/[^\n]*\n)*\s*if \(typeof renderStatusIfOpen === 'function'\) renderStatusIfOpen\(\);/.test(app)
        && app.indexOf('renderStatusIfOpen();') > app.indexOf('closeReminderAfterRender();')
        && app.indexOf('renderStatusIfOpen();') < app.indexOf('scheduleBarMeasure();\n}'));
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
    check('and no file of this track names tests/status.*: that is the sync line\'s own suite', !/tests\/status\.(test|browser)\.mjs/.test(STATUS));
});

// ================================================================== S11 what it costs
// Every reading of the close count, by anyone, counted - none of them may be this screen's.
const NEVER = ['weeklyCloseRead', 'closeReminderReadCount', 'closeReminderRefresh'];
await block('S11 what it costs: the facts on a season, the board once, the close count never, nothing at all while shut', async () => {
    // A SEASON NOBODY CLOSED (scout-api 7.2 "B"): forty-one men, 2026-01-01 to today, an advance
    // for every man every two to four weeks, no close at all, the approval recorded.
    const b = season(phone(), { men: 41, weekly: 16, first: '2026-01-01', seed: 2026, saturday: '2026-03-07', advances: false });
    const rand = mulberry(14);
    b.State.schedule.workers.forEach(worker => {
        for (let date = addDays('2026-01-01', Math.floor(rand() * 20)); date <= TODAY; date = addDays(date, 14 + Math.floor(rand() * 14))) {
            advance(b, worker.id, date, [200, 300, 500, 800, 1000][Math.floor(rand() * 5)]);
        }
    });
    kept(b);
    const dayKeys = Object.keys(b.State.schedule.days).length;
    const advances = Object.keys(b.State.schedule.advances).length;
    console.log(`        season B: ${b.State.schedule.workers.length} men, ${dayKeys} day keys, ${advances} advances, no close, `
        + `${(j(b.State.schedule).length / 1024).toFixed(0)} KiB as text`);
    given('a season: forty-one men, every day of the year so far, an advance every few weeks, nobody closed',
        b.State.schedule.workers.length === 41 && dayKeys >= 270 && advances >= 550
        && Object.keys(b.State.schedule.ledger.advances).every(id => b.State.schedule.ledger.advances[id].kind !== 'periodClosed'),
        `${dayKeys} days, ${advances} advances`);
    frame(b);
    const never = spy(b, NEVER.concat(['owesRead']));

    // statusFacts - everything but the money.
    const times = [];
    for (let n = 0; n < 5; n += 1) {
        const began = performance.now();
        b.call('statusFacts', TODAY);
        times.push(performance.now() - began);
    }
    console.log(`        statusFacts on the season: ${times.map(t => t.toFixed(1)).join(', ')} ms (median ${median(times).toFixed(1)})`);
    check('statusFacts on the season, everything but the money: 60 ms or less, the median of five', median(times) <= 60,
        `${median(times).toFixed(1)} ms`);
    same('and it reads no money at all', never().owesRead, 0);

    // render() with the dialog shut: the two hooks return before they read anything.
    const shut = spy(b, ['invoiceByDate', 'invoiceWithoutRima', 'payrollReport', 'statusFacts', 'drawStatus', 'statusMoneyFacts',
        'statusMoneyLater', 'statusSyncSentence']);
    for (let n = 0; n < 20; n += 1) b.run('renderStatusIfOpen(); statusDoorSync(null, "מסונכרן");');
    same('twenty draws with the dialog shut: no reading of any kind', shut(), { invoiceByDate: 0, invoiceWithoutRima: 0, payrollReport: 0,
        statusFacts: 0, drawStatus: 0, statusMoneyFacts: 0, statusMoneyLater: 0, statusSyncSentence: 0 });

    // The board with nothing kept, on the season nobody closed.
    b.run('OWES_KEPT = null; REPORT_GATE_KEPT = null;');
    resetSpy(b);
    let began = performance.now();
    const open = JSON.parse(b.run('JSON.stringify(statusMoneyFacts())'));
    const openMs = performance.now() - began;
    console.log(`        the board, nothing kept, on the season nobody closed: ${openMs.toFixed(0)} ms (owesRead inside weeklyCloseOnce measured 309 ms by the scout)`);
    check('the board with nothing kept, on a season nobody closed: 900 ms or less', openMs <= 900, `${openMs.toFixed(0)} ms`);
    check('and the men owe', open.folded === true && open.total > 0, j(open));
    same('read once', never().owesRead, 1);

    // Kept: nothing read.
    resetSpy(b);
    began = performance.now();
    b.run('statusMoneyFacts()');
    const keptMs = performance.now() - began;
    same('OWES_KEPT fresh: the board is not read again', never().owesRead, 0);
    console.log(`        the board, kept: ${keptMs.toFixed(1)} ms`);

    // A write ON THE DAY SCREEN, then an open: the reminder's own count is kept under its old key
    // on purpose (closereminder.js) - this screen does not follow it into a reading.
    const free = b.State.schedule.workers.filter(worker => worker.active !== false
        && b.call('entriesFor', b.State.schedule, TODAY, worker.id, 'actual').length === 0
        && !b.call('isAbsent', b.State.schedule, TODAY, worker.id, 'actual')).slice(0, 4);
    given('four men with nothing today, to put on a site one after another', free.length === 4, String(free.length));
    b.run('currentView = "day";');
    b.call('closeReminderRefresh', 'boot');
    resetSpy(b);
    const unmoved = record(b);
    b.State.commit(b.call('assignPlace', b.State.schedule, TODAY, free[0].id, 'actual', 'p_4'));
    given('the write went in', record(b) !== unmoved);
    began = performance.now();
    b.run('openStatus()');
    const afterWriteMs = performance.now() - began;
    const afterWrite = never();
    console.log(`        a write on the day screen, then an open: ${afterWriteMs.toFixed(0)} ms, the board read ${afterWrite.owesRead} time(s)`);
    same('a write on the day screen and then an open: ONE owesRead and ZERO weeklyCloseRead', [afterWrite.owesRead, afterWrite.weeklyCloseRead], [1, 0]);
    check('and the board\'s lines are on the glass', !/מחשב את החשבונות/.test(b.dom.getElementById('statusMoney').textContent)
        && b.dom.getElementById('statusMoney').textContent.includes(b.run('OWES_TEXT.total')), b.dom.getElementById('statusMoney').textContent);
    b.run('closeStatus()');

    // A RUN OF DRAWS under the open dialog: each draws the cheap sections from the record as it is,
    // and the board is read ONCE, after they stop for 1.5 s.
    b.run('openStatus()');
    resetSpy(b);
    const heroOf = () => {
        const hero = b.dom.getElementById('statusBody').querySelector('.status-hero-n');
        return hero ? Number(hero.textContent) : 0;
    };
    const placedBefore = heroOf();
    const heroes = [];
    const pending = [];
    for (const worker of free.slice(1)) {
        b.State.commit(b.call('assignPlace', b.State.schedule, TODAY, worker.id, 'actual', 'p_4'));
        b.run('renderStatusIfOpen()');
        heroes.push(heroOf());
        pending.push(/מחשב את החשבונות/.test(b.dom.getElementById('statusMoney').textContent));
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    same('each draw has the cheap sections from the record as it is: the hero one more each time', heroes,
        [placedBefore + 1, placedBefore + 2, placedBefore + 3]);
    same('the board\'s place says «מחשב את החשבונות…» while the draws go on, and nothing is read in them', [pending, never().owesRead],
        [[true, true, true], 0]);
    await new Promise(resolve => setTimeout(resolve, 1700));
    same('after the draws stop for 1.5 s: the board read ONCE', never().owesRead, 1);
    check('and its lines drawn', !/מחשב את החשבונות/.test(b.dom.getElementById('statusMoney').textContent), b.dom.getElementById('statusMoney').textContent);
    b.run('closeStatus()');

    // The board with nothing kept: on the screens' record...
    const s = frame(screensRecord());
    const before = [disk(s), record(s)];
    const sNever = spy(s, NEVER.concat(['owesRead']));
    began = performance.now();
    const money = JSON.parse(s.run('JSON.stringify(statusMoneyFacts())'));
    const screensMs = performance.now() - began;
    console.log(`        the board, nothing kept, on the screens' record: ${screensMs.toFixed(0)} ms`);
    check('the board with nothing kept, on the screens\' record: 300 ms or less', screensMs <= 300, `${screensMs.toFixed(0)} ms`);
    check('and it says something', money.total > 0 && money.countLine, j(money));
    same('read once', sNever().owesRead, 1);
    same('the disk and the record, byte for byte, after the reading', [disk(s), record(s)], before);
    resetSpy(s);
    s.run('statusMoneyFacts()');
    same('kept: the second reading reads nothing', sNever().owesRead, 0);

    // ...and on a season whose periods are closed in order (scout-api 7.2 "D"): advances only in
    // the last seventy days, every period since each man's first advance closed, oldest first.
    const c = season(phone(), { men: 40, weekly: 16, first: '2026-01-01', seed: 77, advances: false });
    const crand = mulberry(70);
    const from = addDays(TODAY, -70);
    c.State.schedule.workers.forEach(worker => {
        for (let date = addDays(from, Math.floor(crand() * 14)); date <= TODAY; date = addDays(date, 14 + Math.floor(crand() * 14))) {
            advance(c, worker.id, date, [300, 500, 800, 1000][Math.floor(crand() * 4)]);
        }
    });
    let closes = 0;
    const seeding = performance.now();
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
    console.log(`        season D: ${closes} closes, ${Object.keys(c.State.schedule.ledger.advances).length} ledger entries, seeded in ${((performance.now() - seeding) / 1000).toFixed(1)} s`);
    given('a season closed in order: closes in their hundreds', closes >= 150, String(closes));
    frame(c);
    const cNever = spy(c, NEVER.concat(['owesRead']));
    began = performance.now();
    const closedMoney = JSON.parse(c.run('JSON.stringify(statusMoneyFacts())'));
    const closedMs = performance.now() - began;
    console.log(`        the board, nothing kept, on the season closed in order: ${closedMs.toFixed(0)} ms`);
    check('the board with nothing kept, on a season closed in order: 300 ms or less', closedMs <= 300, `${closedMs.toFixed(0)} ms`);
    check('and it is the board\'s answer', closedMoney.none === true || closedMoney.folded === true, j(closedMoney));
    same('read once', cNever().owesRead, 1);
    c.run('openStatus(); renderStatusIfOpen(); closeStatus();');

    // And over every row above: the close count never read by this screen.
    same('weeklyCloseRead, closeReminderReadCount and closeReminderRefresh from this screen: never, on any of the three records',
        [NEVER.map(name => never()[name]), NEVER.map(name => sNever()[name]), NEVER.map(name => cNever()[name])], [[0, 0, 0], [0, 0, 0], [0, 0, 0]]);
});

report();
