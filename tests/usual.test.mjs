// The usual site - the chip beside a man in «לא נרשמו» - in Node.
//
//   node tests/usual.test.mjs
//   USUAL_TABLE=1 node tests/usual.test.mjs     also prints the seeded months' table
//
// js/ui/usual.js offers, beside each man not yet recorded, the one site he is most likely
// at, and a tap puts him there. What this suite holds:
//
//   1. THE RULE, a pure function of (schedule, date, layer, man), on records written by
//      hand: when there is a chip, which site, and every case in which there is none.
//   2. HOW OFTEN IT IS RIGHT, on seeded months: the share of men who get a chip and the
//      share of chips that name where the man then worked - held over floors - and the
//      rule as it was first drafted, measured beside it, to show why it was tightened.
//   3. THE TAP IS THE SHEET'S PICK. Two phones, one seed, one clock: one picks the site in
//      the man's sheet, the other taps his chip - and the two disks are the same bytes,
//      key for key: the record, the journal, the queue. With a control that can tell.
//   4. A regular day, whatever his last days were; ↶ takes it back; ↷ puts it back.
//   5. ONE TAP IS ONE MAN; a tap on a chip the record no longer agrees with writes nothing.
//   6. NOTHING ELSE IS KEPT: drawing the tray moves no key; nothing learned on the disk.
//   7. The words, word for word; no writer named in the file; the shell.

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDevice } from './harness.mjs';
import { makeDom } from './moneydom.mjs';
import { suite, check, same, given, report } from './runner.mjs';

process.env.TZ = 'Asia/Jerusalem';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = file => readFileSync(join(ROOT, file), 'utf8');
const USUAL = source('js/ui/usual.js');
const bare = text => String(text).replace(/[⁦-⁩‎]/g, '');

const TODAY = '2026-11-10';     // a Tuesday
const DAY = '2026-11-11';       // the day on screen: tomorrow
const A = 'p_01', B = 'p_02', C = 'p_03', OLD = 'p_04';

// ------------------------------------------------------------------ a phone
//
// The harness's device, a DOM that keeps its listeners (so a button can be pressed), one
// fixed clock and one sequence of random numbers - the same on every phone made here, so
// that two phones doing the same thing can be compared byte for byte.
function phone(id, options = {}) {
    const device = makeDevice({ deviceId: id, storage: options.storage });
    const dom = makeDom();
    const make = dom.createElement;
    dom.createElement = tag => {
        const node = make(tag);
        node.dataset = {};
        node.listeners = {};
        node.addEventListener = (type, fn) => { (node.listeners[type] = node.listeners[type] || []).push(fn); };
        node.click = () => (node.listeners.click || []).forEach(fn =>
            fn({ detail: 0, target: node, preventDefault() {}, stopPropagation() {} }));
        node.style.setProperty = (name, value) => { node.style[name] = value; };
        return node;
    };
    dom.createElementNS = (ns, tag) => dom.createElement(tag);
    ['assignSheetTitle', 'assignSheetMeta', 'assignSheetBody', 'assignSheetFoot'].forEach(name => dom.register(name));
    dom.register('assignSheet').appendChild(Object.assign(dom.createElement('div'), { className: 'sheet-content' }));
    device.ctx.document = dom;
    device.dom = dom;
    device.run = code => vm.runInContext(code, device.ctx, { filename: 'harness:usual' });

    // One clock. secondTapTooSoon reads it too (no `performance` here), so the test moves it.
    const clock = { now: Date.parse(`${TODAY}T18:00:00+02:00`) };
    class FixedDate extends Date {
        constructor(...args) { if (args.length === 0) super(clock.now); else super(...args); }
        static now() { return clock.now; }
    }
    device.ctx.Date = FixedDate;
    device.clock = clock;
    let seed = 0x1234567;
    const math = Object.create(Math);
    math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    device.ctx.Math = math;

    ['js/ui/sitecolor.js', 'js/ui/undo.js', 'js/ui/day.js', 'js/ui/sheet.js'].forEach(file =>
        vm.runInContext(source(file), device.ctx, { filename: file }));
    if (!options.without) vm.runInContext(USUAL, device.ctx, { filename: 'js/ui/usual.js' });
    device.told = [];
    device.ctx.askTell = said => { device.told.push(said); return Promise.resolve(); };
    device.ctx.askConfirm = () => Promise.resolve(true);
    device.setToday(TODAY);
    device.Sync.pushDelayMs = 60 * 1000;    // nothing leaves for a cloud in this suite
    return device;
}

// The crew and the fortnight every write below is about (synthetic names).
//   w_01 אמיר     - five days on אתר צפון                      -> a chip: צפון
//   w_02 בסאם     - three days צפון, then two on אתר דרום      -> a chip: דרום (he moved)
//   w_03 גדי      - צפון and דרום in turns                     -> no chip
//   w_04 דאוד     - never worked                               -> no chip
//   w_05 הלל      - five days on אתר ישן, since archived       -> no chip
//   w_06 וליד     - five DOUBLE days with hours on אתר מרכז    -> a chip: מרכז, a regular day
//   w_07 זיאד     - four days צפון; marked נעדר on the day itself -> not in the tray at all
const CREW = [
    { id: 'w_01', name: 'אמיר דוגמה', active: true, dailyRate: 400, hourlyRate: 50 },
    { id: 'w_02', name: 'בסאם דוגמה', active: true, dailyRate: 420, hourlyRate: 55 },
    { id: 'w_03', name: 'גדי דוגמה', active: true, dailyRate: 380, hourlyRate: 50 },
    { id: 'w_04', name: 'דאוד דוגמה', active: true, dailyRate: 400, hourlyRate: 50 },
    { id: 'w_05', name: 'הלל דוגמה', active: true, dailyRate: 400, hourlyRate: 50 },
    { id: 'w_06', name: 'וליד דוגמה', active: true, dailyRate: 450, hourlyRate: 60 },
    { id: 'w_07', name: 'זיאד דוגמה', active: true, dailyRate: 400, hourlyRate: 50 }
];
const SITES = [
    { id: A, name: 'אתר צפון', active: true },
    { id: B, name: 'אתר דרום', active: true },
    { id: C, name: 'אתר מרכז', active: true },
    { id: OLD, name: 'אתר ישן', active: true }
];
const FIVE = ['2026-11-04', '2026-11-05', '2026-11-08', '2026-11-09', '2026-11-10'];

function seeded(id, options) {
    const device = phone(id, options);
    device.run(`(function (crew, sites, five) {
        State.schedule.workers = crew;
        State.schedule.places = sites;
        State.commitRoster();
        five.forEach((date, at) => {
            State.commit(assignPlace(State.schedule, date, 'w_01', 'actual', 'p_01'));
            State.commit(assignPlace(State.schedule, date, 'w_02', 'actual', at < 3 ? 'p_01' : 'p_02'));
            State.commit(assignPlace(State.schedule, date, 'w_03', 'actual', at % 2 ? 'p_02' : 'p_01'));
            State.commit(assignPlace(State.schedule, date, 'w_05', 'actual', 'p_04'));
            State.commit(assignPlace(State.schedule, date, 'w_06', 'actual', 'p_03', RATE_DOUBLE));
            State.commit(setRate(State.schedule, date, 'w_06', 'actual', 'p_03', RATE_EXTRA, 2));
            if (at > 0) State.commit(assignPlace(State.schedule, date, 'w_07', 'actual', 'p_01'));
        });
        State.schedule.places.find(place => place.id === 'p_04').active = false;
        State.commitRoster();
        State.date = ${JSON.stringify(DAY)};
        State.commit(markAbsent(State.schedule, State.date, 'w_07', 'actual'));
        hideUndo();
    })(${JSON.stringify(CREW)}, ${JSON.stringify(SITES)}, ${JSON.stringify(FIVE)})`);
    return device;
}

// The tray as the day screen draws it, and what a person reads on it.
function tray(device) {
    const node = device.run('renderUnassignedTray(State.unrecorded())');
    const rows = node.querySelectorAll('.chip').map(chip => {
        const offer = chip.querySelectorAll('.chip-usual')[0] || null;
        return { name: chip.querySelectorAll('.chip-main')[0].textContent,
            buttons: chip.children.map(child => child.className),
            offer, text: offer ? offer.textContent : null,
            aria: offer ? offer.getAttribute('aria-label') : null,
            wide: chip.classList.contains('chip-has-usual') };
    });
    return { node, rows, note: (node.querySelectorAll('.usual-note')[0] || {}).textContent || null,
        of: name => rows.find(row => row.name.startsWith(name)) };
}
const dayOf = (device, id) => device.run(`JSON.stringify((State.schedule.days[${JSON.stringify(DAY)}] || { actual: {} }).actual[${JSON.stringify(id)}] || null)`);
const disk = device => JSON.stringify(Object.keys(device.dump()).sort().map(key => [key, device.dump()[key]]));
const differing = (one, two) => {
    const a = one.dump(), b = two.dump();
    return [...new Set(Object.keys(a).concat(Object.keys(b)))].filter(key => a[key] !== b[key]).sort();
};

async function block(name, body) {
    suite(name);
    try { await body(); } catch (error) { check(`${name}: ran to its end`, false, error && error.stack ? error.stack : String(error)); }
}

// ================================================================== 1. the rule
//
// A record written by hand: { date: { man: 'p_01' | ['p_01', 'p_02'] | 'absent' } }.
const pure = phone('d_pure');
given('js/ui/usual.js is there and defines the rule', USUAL.length > 0 && typeof pure.global('usualSiteFor') === 'function');

function record(days, places, layer = 'actual') {
    const schedule = { workers: [{ id: 'm', name: 'איש', active: true }],
        places: places || [{ id: A, name: 'א', active: true }, { id: B, name: 'ב', active: true }, { id: C, name: 'ג', active: true }],
        days: {} };
    Object.keys(days).forEach(date => {
        const value = days[date];
        const entries = value === 'absent' ? [] : [].concat(value).map(placeId => ({ placeId }));
        schedule.days[date] = { [layer]: { m: value === 'absent' ? { absent: true, entries: [] } : { entries } } };
    });
    return schedule;
}
const ask = (schedule, date = DAY, layer = 'actual', man = 'm') => {
    pure.ctx.__q = { schedule, date, layer, man };
    return pure.run('usualSiteFor(__q.schedule, __q.date, __q.layer, __q.man)');
};
// The days before 2026-11-11, latest first: Tue 10, Mon 9, Sun 8, (Sat 7), Fri 6, Thu 5, Wed 4 ...
const D = ['2026-11-10', '2026-11-09', '2026-11-08', '2026-11-06', '2026-11-05', '2026-11-04', '2026-11-03'];
const run = (...sites) => record(Object.fromEntries(sites.map((site, at) => [D[at], site])));

await block('the rule: when there is a chip, and which site', async () => {
    same('five working days on one site: that site', ask(run(A, A, A, A, A)), A);
    same('two working days, both on one site: that site', ask(run(B, B)), B);
    same('three days on one site and then two on another: the newer one - he moved', ask(run(B, B, A, A, A)), B);
    same('four of the last five on one site, the odd day in the middle: that site', ask(run(A, B, A, A, A)), A);
    same('four of the last five alone on one site, one day shared with another: that site', ask(run(A, [A, B], A, A, A)), A);
    same('a day he was marked נעדר is not a working day: the two around it count', ask(run(A, 'absent', A)), A);
    same('a rest day and a holiday are stepped over the same way',
        ask(record({ '2026-11-10': C, '2026-11-02': C })), C);
    same('only his last five working days are read: two on the new site after four on the old', ask(run(B, B, A, A, A, A)), B);
    same('the earliest day that counts is fourteen days back',
        ask(record({ '2026-10-28': A, '2026-10-29': A })), A);
    same('a double day and extra hours are a day on that site like any other',
        ask({ workers: [], places: [{ id: A, name: 'א', active: true }], days: {
            '2026-11-10': { actual: { m: { entries: [{ placeId: A, rate: 'double' }] } } },
            '2026-11-09': { actual: { m: { entries: [{ placeId: A, rate: 'extra', extraHours: 3 }] } } } } }), A);
});

await block('the rule: every case with no chip', async () => {
    same('an empty record', ask(record({})), null);
    same('a man who never worked', ask(run(A, A, A), DAY, 'actual', 'nobody'), null);
    same('one working day only - one day is not a habit', ask(run(A)), null);
    same('four days on one site and yesterday on another - a loan or a move, the record cannot tell', ask(run(B, A, A, A, A)), null);
    same('two sites on his last working day', ask(run([A, B], A, A, A, A)), null);
    same('two sites on his last working day, even the same two every day', ask(run([A, B], [A, B], [A, B])), null);
    same('sites in turns, no majority', ask(run(A, B, A, B, A)), null);
    same('three of five, and yesterday unlike the day before', ask(run(A, B, A, A, B)), null);
    same('yesterday on his site, the day before on two', ask(run(A, [A, B], C)), null);
    same('work only fifteen days back and more', ask(record({ '2026-10-27': A, '2026-10-26': A, '2026-10-25': A })), null);
    same('one day inside the fourteen and one outside', ask(record({ '2026-10-28': A, '2026-10-27': A })), null);
    same('the site has been archived', ask(record(
        { [D[0]]: A, [D[1]]: A }, [{ id: A, name: 'א', active: false }, { id: B, name: 'ב', active: true }])), null);
    same('the site is gone from the list', ask(record({ [D[0]]: A, [D[1]]: A }, [{ id: B, name: 'ב', active: true }])), null);
    same('and an archived site is not swapped for the one before it',
        ask(record({ [D[0]]: A, [D[1]]: A, [D[2]]: B, [D[3]]: B, [D[4]]: B },
            [{ id: A, name: 'א', active: false }, { id: B, name: 'ב', active: true }])), null);
    same('marked נעדר on every day', ask(run('absent', 'absent', 'absent')), null);
    same('the other layer is not read', ask(record({ [D[0]]: A, [D[1]]: A }, null, 'planned')), null);
    same('the day on screen itself is not read', ask(record({ [DAY]: A, '2026-11-12': A, '2026-11-13': A })), null);
    same('a date that is not a date', ask(run(A, A), 'tomorrow'), null);
    same('no record at all', ask(null), null);
    same('a list with holes in it', ask({ workers: [null], places: [null, { id: A, name: 'א', active: true }],
        days: { [D[0]]: { actual: { m: { entries: [null, { placeId: A }] } } }, [D[1]]: null, [D[2]]: { actual: { m: { entries: [{ placeId: A }] } } } } }), A);
});

await block('the rule reads and never changes what it is handed', async () => {
    const schedule = run(B, B, A, A, A);
    const before = JSON.stringify(schedule);
    const first = ask(schedule);
    same('asked twice, the same answer', ask(schedule), first);
    same('and the record it was handed is the same bytes', JSON.stringify(schedule), before);
    const rules = USUAL.slice(USUAL.indexOf('// ------------------------------------------------------------------ the rule'),
        USUAL.indexOf('// ------------------------------------------------------------------ the tray'));
    given('the rule half of the file was found', rules.length > 500);
    same('the rule half names no state, storage, screen or clock',
        (rules.replace(/^\s*\/\/.*$/gm, '').match(/\b(State|Store|document|window|Date|todayStr|localStorage|render)\b/g) || []).join(','), '');
});

// ================================================================== 2. how often it is right
//
// SEEDED MONTHS (mulberry32: the same numbers on every machine). tests/daycheck.test.mjs's
// idea of a season, with what this rule has to live through added: eighteen men - twelve
// with a site of their own, three who are sent wherever they are needed, three who never
// work; five sites that open and finish; Sunday to Thursday, a short Friday, no Saturday,
// two holidays; spells of absence. A man with a site of his own MOVES for good on 3% of
// his days, is LENT for one day on 4%, and has a second site on 4%. Every working day
// from the third week on is read the evening before: what chip would each man have had,
// and where did he then work.
//
// The model is a model. Its rates are guesses and the shares below are true of the model,
// not of anybody's real year.
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

function months(seed) {
    const rand = rng(seed);
    const pick = list => list[Math.floor(rand() * list.length)];
    const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const workers = [];
    for (let i = 1; i <= 18; i += 1) workers.push({ id: `w_${String(i).padStart(2, '0')}`, name: `עובד ${i}`, active: true });
    const places = [1, 2, 3, 4, 5, 6].map(i => ({ id: `p_0${i}`, name: `אתר ${i}`, active: true }));
    const schedule = { workers, places, days: {} };
    const steady = workers.slice(0, 12), floating = workers.slice(12, 15);
    let open = places.slice(0, 4).map(place => place.id);
    const home = new Map(steady.concat(floating).map((worker, i) => [worker.id, open[i % 4]]));
    const away = new Map();
    const fridayMen = new Set(steady.slice(0, 5).map(worker => worker.id));
    const truth = [];
    const start = new Date(2026, 5, 7, 12);     // a Sunday
    const holidays = new Set();
    [[40, 4], [85, 8]].forEach(([from, length]) => { for (let k = 0; k < length; k += 1) holidays.add(from + k); });

    for (let offset = 0; offset < 120; offset += 1) {
        const date = new Date(start);
        date.setDate(start.getDate() + offset);
        const weekday = date.getDay();
        if (weekday === 6 || holidays.has(offset)) continue;
        const friday = weekday === 5;
        if (friday && rand() < 0.25) continue;
        if (!friday && rand() < 0.03) {         // a site finishes, another opens, its men go over
            const closing = pick(open);
            const opening = places.find(place => !open.includes(place.id));
            if (opening) {
                open = open.filter(id => id !== closing).concat([opening.id]);
                home.forEach((site, id) => { if (site === closing) home.set(id, opening.id); });
                places.find(place => place.id === closing).closedOn = iso(date);
            }
        }
        const side = {};
        const worked = {};
        steady.concat(floating).forEach(worker => {
            let left = away.get(worker.id) || 0;
            if (left === 0 && rand() < 0.035) left = 1 + Math.floor(rand() * 5);
            if (left > 0) { away.set(worker.id, left - 1); return; }
            if (friday && !(fridayMen.has(worker.id) || rand() < 0.1)) return;
            if (rand() < 0.03) return;
            let site = home.get(worker.id);
            if (floating.includes(worker)) {
                if (rand() < 0.5) { site = pick(open); home.set(worker.id, site); }
            } else {
                const roll = rand();
                if (roll < 0.03) { site = pick(open.filter(id => id !== site)); home.set(worker.id, site); }
                else if (roll < 0.07) site = pick(open.filter(id => id !== site));
            }
            const entry = { placeId: site };
            const kind = rand();
            if (kind < 0.02) entry.rate = 'double';
            else if (kind < 0.10) { entry.rate = 'extra'; entry.extraHours = 1 + Math.floor(rand() * 3); }
            const entries = [entry];
            if (rand() < 0.04) entries.push({ placeId: pick(open.filter(id => id !== site)) });
            side[worker.id] = { entries };
            worked[worker.id] = entries.map(one => one.placeId);
        });
        if (Object.keys(worked).length === 0) continue;
        schedule.days[iso(date)] = { actual: side };
        truth.push({ date: iso(date), worked, open: open.slice() });
    }
    return { schedule, truth };
}

// THE RULE AS FIRST DRAFTED, kept here to be measured beside the one that ships: four of
// the last five on one site names THAT site, whatever yesterday was; else the last two.
function drafted(schedule, date, man) {
    pure.ctx.__q = { schedule, date, man };
    const days = pure.run('usualWorkingDays(__q.schedule, __q.date, "actual", __q.man)');
    if (days.length === 0 || days[0].sites.length !== 1) return null;
    const tally = {};
    days.forEach(day => { if (day.sites.length === 1) tally[day.sites[0]] = (tally[day.sites[0]] || 0) + 1; });
    const major = Object.keys(tally).find(site => tally[site] >= 4);
    const last = days[0].sites[0];
    const site = major || (days.length >= 2 && days[1].sites.length === 1 && days[1].sites[0] === last ? last : null);
    return site;
}

function measure(seeds) {
    const sum = { evenings: 0, men: 0, chips: 0, right: 0, idle: 0, closed: 0,
        drafted: 0, draftedRight: 0, lent: 0, lentRight: 0,
        steadyMen: 0, steadyChips: 0, steadyRight: 0, sentMen: 0, sentChips: 0, sentRight: 0 };
    seeds.forEach(seed => {
        const { schedule, truth } = months(seed);
        truth.forEach((day, index) => {
            if (index < 12) return;                     // the first fortnight has little behind it
            sum.evenings += 1;
            // The roster as it stood that evening: a site that has finished is archived.
            const places = schedule.places.map(place => ({ ...place, active: day.open.includes(place.id) }));
            const asOf = { ...schedule, places };
            schedule.workers.forEach(worker => {
                const chip = ask(asOf, day.date, 'actual', worker.id);
                const went = day.worked[worker.id];
                if (chip && !day.open.includes(chip)) sum.closed += 1;
                if (!went) { if (chip) sum.idle += 1; return; }
                sum.men += 1;
                if (chip) { sum.chips += 1; if (went.includes(chip)) sum.right += 1; }
                // Apart: the men with a site of their own, and the three sent where needed.
                const group = Number(worker.id.slice(2)) <= 12 ? 'steady' : 'sent';
                sum[group + 'Men'] += 1;
                if (chip) { sum[group + 'Chips'] += 1; if (went.includes(chip)) sum[group + 'Right'] += 1; }
                const draft = drafted(asOf, day.date, worker.id);
                const live = draft && day.open.includes(draft) ? draft : null;
                if (live) { sum.drafted += 1; if (went.includes(live)) sum.draftedRight += 1; }
                // The one case the two rules part on: a chip from the draft, none from the rule.
                if (live && !chip) { sum.lent += 1; if (went.includes(live)) sum.lentRight += 1; }
            });
        });
    });
    return sum;
}

await block('on seeded months: how many men get a chip, and how often it is where they went', async () => {
    const m = measure([11, 23, 37, 41, 59, 67, 73, 89]);
    const share = (part, whole) => (whole === 0 ? 0 : part / whole);
    const pct = (part, whole) => `${(100 * share(part, whole)).toFixed(1)}% (${part}/${whole})`;
    given('months of evenings were read', m.evenings > 500 && m.men > 5000 && m.chips > 3000, JSON.stringify(m));
    check('a chip names where the man then worked at least 87% of the time',
        share(m.right, m.chips) >= 0.87, pct(m.right, m.chips));
    check('and at least three men in four who work get one',
        share(m.chips, m.men) >= 0.75, pct(m.chips, m.men));
    check('for the men with a site of their own it is right at least nine times in ten',
        share(m.steadyRight, m.steadyChips) >= 0.90, pct(m.steadyRight, m.steadyChips));
    check('and nearly all of them get one',
        share(m.steadyChips, m.steadyMen) >= 0.85, pct(m.steadyChips, m.steadyMen));
    check('the men sent wherever they are needed mostly get none',
        share(m.sentChips, m.sentMen) < 0.6, pct(m.sentChips, m.sentMen));
    same('no chip ever names a site that had finished', m.closed, 0);
    check('the rule as first drafted is right less often than the rule that ships',
        share(m.draftedRight, m.drafted) < share(m.right, m.chips),
        `drafted ${pct(m.draftedRight, m.drafted)} · ships ${pct(m.right, m.chips)}`);
    check('and where the two part - four days on one site, yesterday on another - the draft was a coin',
        m.lent > 100 && share(m.lentRight, m.lent) < 0.85, pct(m.lentRight, m.lent));
    if (process.env.USUAL_TABLE) {
        console.log(JSON.stringify({ ...m,
            chipShare: pct(m.chips, m.men), chipRight: pct(m.right, m.chips),
            draftShare: pct(m.drafted, m.men), draftRight: pct(m.draftedRight, m.drafted),
            partedRight: pct(m.lentRight, m.lent), chipsToMenWhoStayedHome: m.idle,
            steadyShare: pct(m.steadyChips, m.steadyMen), steadyRight: pct(m.steadyRight, m.steadyChips),
            sentShare: pct(m.sentChips, m.sentMen), sentRight: pct(m.sentRight, m.sentChips) }));
    }
});

// ================================================================== 3. the tray
await block('the tray: one chip beside the men the record is plain about, none beside the rest', async () => {
    const device = seeded('d_tray');
    const drawn = tray(device);
    same('the men not recorded, in the roster\'s order', drawn.rows.map(row => row.name).join(' | '),
        'אמיר דוגמה | בסאם דוגמה | גדי דוגמה | דאוד דוגמה | הלל דוגמה | וליד דוגמה');
    same('five days on one site: the site, after the arrow', drawn.of('אמיר').text, '←אתר צפון');
    same('moved two days ago: the newer site', drawn.of('בסאם').text, '←אתר דרום');
    same('sites in turns: no chip', drawn.of('גדי').offer, null);
    same('never worked: no chip', drawn.of('דאוד').offer, null);
    same('his site was archived: no chip', drawn.of('הלל').offer, null);
    same('double days with hours: the site, and nothing about the rate', drawn.of('וליד').text, '←אתר מרכז');
    check('the man marked נעדר on the day is not in this tray', !drawn.rows.some(row => row.name.startsWith('זיאד')));
    same('the chip comes after the two buttons that were there', drawn.of('אמיר').buttons.join(' '), 'chip-main chip-side chip-usual');
    same('and a man with no chip has the two he always had', drawn.of('גדי').buttons.join(' '), 'chip-main chip-side');
    same('its accessible name says the man and the site', bare(drawn.of('אמיר').aria), 'שבץ את אמיר דוגמה באתר צפון');
    check('each name inside its own isolate', drawn.of('אמיר').aria === 'שבץ את ⁨אמיר דוגמה⁩ ב⁨אתר צפון⁩');
    same('the arrow is not read aloud', drawn.of('אמיר').offer.children[0].getAttribute('aria-hidden'), 'true');
    same('the colour is the site\'s own, handed to the stylesheet', drawn.of('וליד').offer.style['--usual-site'], 'var(--site-3)');
    same('the one sentence over the rows', drawn.note, 'האתר ליד השם הוא הצעה לפי הימים האחרונים. נגיעה בו משבצת.');
    same('the tray\'s heading is what it was', drawn.node.children[0].textContent, 'לא נרשמו (6)');
    check('a man with a chip takes a line of his own, a man without does not',
        drawn.of('אמיר').wide === true && drawn.of('גדי').wide === false);

    // Nobody with a chip: no sentence, and the tray is the tray it always was.
    const none = seeded('d_tray_none');
    none.run(`['w_01', 'w_02', 'w_06'].forEach(id => State.commit(markAbsent(State.schedule, State.date, id, 'actual')))`);
    const plain = tray(none);
    same('with no chip to explain, no sentence', plain.note, null);
    same('and no row carries one', plain.rows.filter(row => row.offer).length, 0);

    // Without the file the tray is drawn as before - the hook asks before it calls.
    const without = seeded('d_tray_without', { without: true });
    const old = tray(without);
    same('without js/ui/usual.js the tray draws the same men', old.rows.map(row => row.name).join('|'), drawn.rows.map(row => row.name).join('|'));
    same('with the two buttons each', [...new Set(old.rows.map(row => row.buttons.join(' ')))].join(';'), 'chip-main chip-side');
});

// ================================================================== 4. the tap is the sheet's pick
//
// The sheet's tile, pressed the way a person presses it: the man's sheet opened, the
// site's tile found by its name, its click run.
function pickInSheet(device, workerId, siteName) {
    device.ctx.__pick = { workerId };
    device.run('openAssignSheet(__pick.workerId, { stay: true })');
    const tile = device.dom.getElementById('assignSheetBody').querySelectorAll('.sheet-place')
        .find(node => node.textContent.includes(siteName));
    if (!tile) throw new Error(`no tile for ${siteName}`);
    tile.click();
    device.run('closeAssignSheet()');
}

await block('a chip tap and a pick in his sheet leave the same bytes on the disk', async () => {
    const sheet = seeded('d_same');
    const chip = seeded('d_same');
    given('the two phones start as the same bytes', disk(sheet) === disk(chip), differing(sheet, chip).join(', '));
    const before = sheet.dump();

    pickInSheet(sheet, 'w_01', 'אתר צפון');
    tray(chip).of('אמיר').offer.click();

    same('no key differs between the two phones', differing(sheet, chip).join(', '), '');
    check('the whole disk is byte for byte the same', disk(sheet) === disk(chip));
    const moved = Object.keys(sheet.dump()).filter(key => sheet.dump()[key] !== before[key]).sort();
    given('and the pick did move the disk', moved.length > 0, moved.join(', '));
    same('the record of the man that day', dayOf(chip, 'w_01'), dayOf(sheet, 'w_01'));
    same('which is one regular day on that site, stamped with his rates', dayOf(chip, 'w_01'),
        JSON.stringify(JSON.parse(dayOf(sheet, 'w_01'))));
    const value = JSON.parse(dayOf(chip, 'w_01'));
    same('one entry, on אתר צפון', JSON.stringify(value.entries.map(entry => entry.placeId)), JSON.stringify([A]));
    check('with no rate other than regular and no hours', value.entries.every(entry =>
        (entry.rate === undefined || entry.rate === 'normal') && !entry.extraHours), JSON.stringify(value.entries));
    same('the rates of the day are his own, stamped at this first write', JSON.stringify(value.rates),
        JSON.stringify(JSON.parse(dayOf(sheet, 'w_01')).rates));
    check('his daily rate among them', JSON.stringify(value.rates).includes('400'), JSON.stringify(value.rates));
    const path = `days.${DAY}.actual.w_01`;
    same('the queue of both holds the same paths', JSON.stringify(chip.Sync.pendingPaths()), JSON.stringify(sheet.Sync.pendingPaths()));
    check('and this one field path among them', chip.Sync.pendingPaths().includes(path), JSON.stringify(chip.Sync.pendingPaths().slice(-3)));
    same('the undo names the edit in the sheet\'s own words',
        bare(chip.run('undoLabel')), bare(sheet.run('undoLabel')));
    same('which are', bare(chip.run('undoLabel')), 'אמיר דוגמה נרשם באתר צפון');
    same('nobody was told anything', chip.told.length, 0);

    // The control: a phone that picked ANOTHER site is not the same bytes.
    const other = seeded('d_same');
    pickInSheet(other, 'w_01', 'אתר דרום');
    check('a phone that picked another site differs - the comparison can tell', disk(other) !== disk(chip)
        && differing(other, chip).length > 0);
    // And each key the chip moved is a key the sheet moved - nothing of its own beside them.
    const chipMoved = Object.keys(chip.dump()).filter(key => chip.dump()[key] !== before[key]).sort();
    same('the chip moved exactly the keys the sheet moved', chipMoved.join(', '), moved.join(', '));
    check('none of them a key of this feature', !chipMoved.some(key => /usual/i.test(key)), chipMoved.join(', '));
});

await block('a man whose last days were double with hours is given a REGULAR day, as the sheet gives', async () => {
    const sheet = seeded('d_reg');
    const chip = seeded('d_reg');
    pickInSheet(sheet, 'w_06', 'אתר מרכז');
    tray(chip).of('וליד').offer.click();
    check('the two disks are the same bytes', disk(sheet) === disk(chip), differing(sheet, chip).join(', '));
    const value = JSON.parse(dayOf(chip, 'w_06'));
    same('one entry on אתר מרכז', JSON.stringify(value.entries.map(entry => entry.placeId)), JSON.stringify([C]));
    check('regular: no double day, no extra hours carried over', value.entries.every(entry =>
        (entry.rate === undefined || entry.rate === 'normal') && !entry.extraHours), JSON.stringify(value.entries));
    check('while the day before is still extra hours', chip.run(`JSON.stringify(State.schedule.days['2026-11-10'].actual.w_06)`).includes('extra'));
});

await block('↶ takes the tap back in one step, and ↷ puts it back', async () => {
    const device = seeded('d_undo');
    const empty = dayOf(device, 'w_02');
    tray(device).of('בסאם').offer.click();
    const placed = dayOf(device, 'w_02');
    check('he is on אתר דרום', JSON.parse(placed).entries[0].placeId === B, placed);
    check('and no longer in the tray', !tray(device).rows.some(row => row.name.startsWith('בסאם')));
    device.run('runUndo()');
    same('after ↶ he has no site', JSON.parse(dayOf(device, 'w_02') || '{"entries":[]}').entries.length, 0);
    same('which is what he had before the tap', empty, 'null');
    same('and he is back in the tray with his chip', tray(device).of('בסאם').text, '←אתר דרום');
    device.run('runRedo()');
    same('after ↷ his day is what the tap wrote', dayOf(device, 'w_02'), placed);
});

// ================================================================== 5. one tap, one man
await block('a double tap is one tap, and a chip the record no longer agrees with writes nothing', async () => {
    const device = seeded('d_double');
    const first = tray(device);
    first.of('אמיר').offer.click();
    device.clock.now += 300;
    // The next man's chip is where the first one was: the second tap of the pair lands on it.
    tray(device).of('בסאם').offer.click();
    same('300ms later the next man\'s chip does nothing', dayOf(device, 'w_02'), 'null');
    device.clock.now += 300;
    tray(device).of('בסאם').offer.click();
    same('nor does a third tap of the burst', dayOf(device, 'w_02'), 'null');
    device.clock.now += 701;
    tray(device).of('בסאם').offer.click();
    check('after the guard has passed it places him', JSON.parse(dayOf(device, 'w_02')).entries[0].placeId === B);

    // A chip drawn before the record changed under it.
    const stale = seeded('d_stale');
    const held = tray(stale);
    stale.run(`State.commit(markAbsent(State.schedule, State.date, 'w_01', 'actual'))`);
    const was = disk(stale);
    const renders = stale.renders.count;
    held.of('אמיר').offer.click();
    same('a man marked נעדר since the chip was drawn: nothing is written', disk(stale), was);
    check('and the day is drawn again', stale.renders.count > renders);

    stale.clock.now += 5000;
    stale.run(`State.schedule.places.find(place => place.id === 'p_02').active = false; State.commitRoster();`);
    const archived = disk(stale);
    held.of('בסאם').offer.click();
    same('a site archived since: nothing is written', disk(stale), archived);

    stale.clock.now += 5000;
    stale.run(`State.commit(assignPlace(State.schedule, State.date, 'w_06', 'actual', 'p_01'))`);
    const elsewhere = disk(stale);
    held.of('וליד').offer.click();
    same('a man placed on another site since: nothing is written, and he keeps that site', disk(stale), elsewhere);

    // His last days changed under the chip: the suggestion is no longer this one.
    const moved = seeded('d_moved');
    const drawn = tray(moved);
    moved.run(`State.commit(clearWorkerDay(State.schedule, '2026-11-10', 'w_01', 'actual'));
        State.commit(assignPlace(State.schedule, '2026-11-10', 'w_01', 'actual', 'p_02'));`);
    const then = disk(moved);
    moved.clock.now += 5000;
    drawn.of('אמיר').offer.click();
    same('yesterday corrected to another site since: the old chip writes nothing', disk(moved), then);
    same('and the tray drawn now has no chip for him', tray(moved).of('אמיר').offer, null);
});

await block('while recording is held the tap records nothing and offers no undo', async () => {
    const device = seeded('d_held');
    const drawn = tray(device);
    device.ctx.farkadWritesBlocked = () => true;
    const was = dayOf(device, 'w_01');
    drawn.of('אמיר').offer.click();
    same('nothing in the record', dayOf(device, 'w_01'), was);
    same('and no step on ↶', device.run('Boolean(undoAction)'), false);
});

// ================================================================== 6. nothing else is kept
await block('drawing the suggestions writes nothing, and nothing is learned', async () => {
    const device = seeded('d_quiet');
    const was = disk(device);
    const queued = JSON.stringify(device.Sync.pendingPaths());
    const memory = device.run('JSON.stringify(State.schedule)');
    for (let i = 0; i < 3; i += 1) tray(device);
    device.run(`State.date = '2026-11-12'`); tray(device);
    device.run(`State.date = ${JSON.stringify(DAY)}`); tray(device);
    same('the whole disk is the same bytes after the tray was drawn five times', disk(device), was);
    same('the queue is what it was', JSON.stringify(device.Sync.pendingPaths()), queued);
    same('and so is the record in memory', device.run('JSON.stringify(State.schedule)'), memory);
    // The control: an ordinary edit does move what was just compared.
    device.run(`State.commit(markAbsent(State.schedule, State.date, 'w_04', 'actual'))`);
    check('an ordinary edit moves the disk - the comparison can tell', disk(device) !== was);

    const code = USUAL.replace(/^\s*\/\/.*$/gm, '');
    same('the file names no storage, no queue, no journal and no writer of the model',
        (code.match(/\b(Store|localStorage|sessionStorage|indexedDB|FarkadSync|commitMany|commitRoster|assignPlace|unassignPlace|markAbsent|setWorkerDay|clearWorkerDay|setRate|save|persist)\b/g) || []).join(','), '');
    same('it reaches State.commit by no name of its own', (code.match(/State\.commit/g) || []).length, 0);
    same('the one write it borrows is the sheet\'s pick, called once', (code.match(/sheetPickPlace\(/g) || []).length, 1);
    const sheetCode = source('js/ui/sheet.js');
    same('which the sheet\'s own tile calls', (sheetCode.match(/const stood = sheetPickPlace\(worker, place\);/g) || []).length, 1);
    check('and which is editWithUndo over assignPlace at the regular rate, on the day and layer on screen',
        /function sheetPickPlace\(worker, place\) \{\s*return editWithUndo\(worker\.id,\s*`\$\{isolate\(worker\.name\)\} נרשם ב\$\{isolate\(place\.name\)\}`, \(\) =>\s*assignPlace\(State\.schedule, State\.date, worker\.id, State\.layer, place\.id, RATE_NORMAL\)\);\s*\}/.test(sheetCode));
    same('no batch: there is no button that places several men', /שיבוץ כל/.test(code), false);
});

// ================================================================== 7. the words, the shell
await block('every word, word for word', async () => {
    const T = pure.global('USUAL_TEXT');
    same('the arrow', T.arrow, '←');
    same('the accessible name', bare(T.aria('פלוני', 'אתר')), 'שבץ את פלוני באתר');
    same('the sentence', T.note, 'האתר ליד השם הוא הצעה לפי הימים האחרונים. נגיעה בו משבצת.');
    check('the block is frozen', Object.isFrozen(T));
    same('three strings and no more', Object.keys(T).join(','), 'arrow,aria,note');
    const start = USUAL.indexOf('const USUAL_TEXT');
    const end = USUAL.indexOf('});', start) + 3;
    const outside = (USUAL.slice(0, start) + USUAL.slice(end)).replace(/^\s*\/\/.*$/gm, '');
    same('no Hebrew in the code outside the block', (outside.match(/[֐-׿]+/g) || []).join(' '), '');
    check('never the word for something sent', !/נשלח/.test(USUAL));
    same('none of the three dialogs the app does not use',
        (USUAL.replace(/^\s*\/\/.*$/gm, '').match(/\b(alert|confirm|prompt)\s*\(/g) || []).join(','), '');
    check('a name reaches the page as text only', !/innerHTML|insertAdjacentHTML|outerHTML/.test(USUAL));
    // A name written as markup is drawn as its letters.
    const device = seeded('d_markup');
    device.run(`State.schedule.places.find(place => place.id === 'p_01').name = '<img src=x onerror=1>'; State.commitRoster();`);
    same('a site named like a tag is drawn as its letters', tray(device).of('אמיר').text, '←<img src=x onerror=1>');
});

await block('the shell: on the page after the files it calls, in the offline shell, in one style block', async () => {
    const page = source('index.html');
    const at = name => page.indexOf(`<script src="js/ui/${name}.js"></script>`);
    check('the page loads js/ui/usual.js', at('usual') > 0);
    check('after day.js, sheet.js, undo.js and sitecolor.js', ['day', 'sheet', 'undo', 'sitecolor'].every(name => at(name) > 0 && at(name) < at('usual')));
    check('and before app.js', at('usual') < page.indexOf('<script src="js/app.js"></script>'));
    check('as a classic script', !/<script[^>]*type="module"[^>]*usual/.test(page));
    check('the service worker precaches it', source('sw.js').includes("'./js/ui/usual.js',"));
    const day = source('js/ui/day.js');
    same('the day screen calls it in two places, asking first each time',
        (day.match(/typeof usual(ChipInto|NoteInto) === 'function'/g) || []).length, 2);
    same('and from nowhere else in the app', ['js/app.js', 'js/ui/journey.js', 'js/ui/sheet.js', 'js/ui/week.js', 'js/ui/roster.js']
        .filter(file => /usual[A-Z]/.test(source(file))).join(','), '');
    const css = source('css/design.css');
    const from = css.indexOf('/* ---- the usual site (js/ui/usual.js)');
    check('its look is one block of css/design.css', from > 0 && css.indexOf('/* ---- the usual site', from + 10) === -1);
    // MOVED ON PURPOSE (the reports say the account, js/ui/reports.js): every feature's look
    // is one more block at the END of the layer, so this block is last but for the blocks
    // added since - today exactly one, named here. What is held is unchanged: the usual
    // site's look is whole, in one place, and read below without its neighbour.
    const next = css.indexOf('/* ---- ', from + 10);
    check('the last block of the screen layer but for the ones added since', css.trimEnd().endsWith('}')
        && (next === -1 || (css.indexOf('/* ---- the reports say the account') === next
            && css.indexOf('/* ---- ', next + 10) === -1)));
    const block = next === -1 ? css.slice(from) : css.slice(from, next);
    check('48px and 18px, written there', /min-height: 48px/.test(block) && /font-size: 18px/.test(block));
    same('css/readability.css does not name it', /chip-usual|usual-note/.test(source('css/readability.css')), false);
    const app = source('css/app.css');
    same('css/app.css names it once, to keep a suggestion off paper',
        (app.match(/^.*(chip-usual|usual-note).*$/gm) || []).join('\n'),
        '@media print { .chip-usual, .usual-note { display: none !important; } }');
});

report();
