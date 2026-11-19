// The records and the phones of the speed track, for tests/speed.test.mjs,
// tests/speed.season.test.mjs and tests/speed.browser.mjs. A helper, not a suite: it
// asserts nothing (tests/gate.integrity.test.mjs lists it as one).
//
// SYNTHETIC DATA ONLY. Invented men («עובד 7»), invented sites («אתר 3»), invented sums.
//
// WHAT IS HERE
//
//   seasonDisk(kind)   a season-sized record, as a disk: 40 men (16 weekly), 300 working
//                      days to Thursday 2026-11-19, six sites, Rima and יוסף גבס counts.
//                        'open'     an advance every 14-28 days per man since the first
//                                   day, nothing closed - the crew nobody closes
//                        'closed'   advances only in the last 70 days, every period since
//                                   closed in order except a third of the men's last one
//                        'skipped'  'closed', except that a third of the weekly men are
//                                   handed an advance in the week before their last
//                                   finished one and work NO day in it, and that week is
//                                   left open - so «סגירת שבוע» offers them with that week
//                                   closed first on a copy (weeklyCloseWithoutEmpties), as
//                                   on the owner's own Thursdays
//   mediumDisk()       15 men over 26 weeks (half of them weekly), two advances each, a
//                      few repayments, Rima and יוסף גבס; `{ closes: true }` closes men in
//                      order from their first advance - whole, half or nothing
//   openDevice(disk)   a phone in Node, reopened on a disk, with the screens of this tree
//                      or of v204 (6ab193d, out of Git) - see FILES
//   WAYS_IN            every way into the money readings, as code a device runs
//
// HOW A RECORD IS WRITTEN: by the app's own writers on a harness device (assignPlace,
// markAbsent, setRimaCount, setYosefGevesCount, addAdvance), saved, and the device REOPENED
// so the boot mirror writes the advances into the ledger. The approval is the plan of the
// gate's own function, asked INSIDE the pay sheet's one reading (reportReadOnce): on
// season-open the bare plan walks every man's account from his first advance with no memory
// at all and takes minutes, and the same plan asked inside a reading is the same plan, byte
// for byte (tests/speed.test.mjs holds the two equal on the medium season, and
// tests/speed.season.test.mjs on season-closed). Closes and repayments go through
// saveFinancialAction inside weeklyCloseOnce(…, { memo: false }), as the probes and
// tests/reports.speed.test.mjs write them: that scope answers the gate's plan on an approved
// record without planning it, which is all a write needs of it.

import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDevice, makeCloud, settle, settleUntil, loadOrder } from './harness.mjs';
import { makeDom } from './moneydom.mjs';

process.env.TZ = 'Asia/Jerusalem';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = file => readFileSync(join(ROOT, file), 'utf8');

// v204, the build this track is measured against: origin/main when it was cut.
export const BASE = '6ab193d68c960e4a56d947673c282b867acd258f';
// The only files of the app this track changes.
export const CHANGED = ['js/ui/reports.js', 'js/ui/owes.js', 'js/ui/advancereset.js'];
// The screens a phone in Node is given, beside the harness's data layer: everything that
// opens the pay sheet's one reading, and what those readings call.
export const SCREENS = ['js/ui/sitecolor.js', 'js/ui/reports.js', 'js/ui/workercard.js', 'js/ui/seder.js', 'js/ui/payslips.js',
    'js/ui/monthsummary.js', 'js/ui/owes.js', 'js/ui/daycheck.js', 'js/ui/weeklyclose.js', 'js/ui/closereminder.js',
    'js/ui/advancereset.js', 'js/ui/undo.js'];
// THE FILES OF TRACKS MERGED AFTER THIS ONE that draw on a page compared here with v204, loaded
// on BOTH sides from this tree (6ab193d has none of them, and its own owes.js never calls
// them). EMPTY on this branch. The integrator puts 'js/ui/payday.js' here when wave 1 is
// merged: its row on «מקדמות» is then taken out of the comparison by LATER_ROWS below, and
// counted.
export const LATER_SCREENS = [];

export const TODAY = '2026-11-19';
// The seven readers of a man's walk S1 answers once (js/ui/reports.js), and v196's three.
export const SEVEN = ['ledgerEntries', 'foldLedger', 'advanceHistory', 'overpaidAdvances', 'advanceOutstanding', 'advanceWalk', 'advancePositionInto'];
export const V196 = ['carryReportingEnabled', 'payrollReport', 'closedPeriods'];
const j = value => JSON.stringify(value);
export const AT = `${TODAY}T15:00:00.000Z`;
export const SHUT = { carryAdvances: false, ledgerWrites: false };
export const OPEN = { carryAdvances: true, ledgerWrites: true };

const fromBase = file => execFileSync('git', ['-C', ROOT, 'show', `${BASE}:${file}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

// The screens of one build, by file: 'now' is this tree; 'base' is v204 - the three files
// this track changes out of Git, and every other file this tree's (baseDiffers() says
// whether those are 6ab193d's bytes too).
const BUILDS = {};
export function filesOf(build) {
    if (BUILDS[build]) return BUILDS[build];
    const out = {};
    SCREENS.forEach(file => { out[file] = build === 'base' && CHANGED.indexOf(file) !== -1 ? fromBase(file) : source(file); });
    BUILDS[build] = out;
    return out;
}

// The files a phone of either build loads that are NOT 6ab193d's bytes, besides the three.
// Empty on this branch; a merged tree names what it brought.
export function baseDiffers() {
    return loadOrder().concat(SCREENS).filter(file => CHANGED.indexOf(file) === -1).filter(file => {
        try { return fromBase(file) !== source(file); } catch (error) { return true; }
    });
}

export const addDays = (date, days) => {
    const [y, m, d] = date.split('-').map(Number);
    const at = new Date(y, m - 1, d + days, 12);
    return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
};
// Every day but Saturday, from..to.
export const workdays = (from, to) => {
    const out = [];
    for (let date = from; date <= to; date = addDays(date, 1)) if (new Date(`${date}T12:00:00`).getDay() !== 6) out.push(date);
    return out;
};
export function mulberry(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ---------------------------------------------------------------- a phone
//
// Reopened on `storage`, with the screens of `files` (filesOf('now') or filesOf('base')),
// the given flags and today. The DOM is tests/moneydom.mjs's, with the ids the money
// screens draw into. `options.frozen` freezes the clock at that instant (a write's `at`).
export function openDevice(storage, options = {}) {
    const device = makeDevice({ deviceId: options.deviceId || 'd_office', storage, flags: options.flags || OPEN });
    const dom = makeDom();
    ['reportsView', 'advancesView', 'workerDaysTitle', 'workerDaysMeta', 'workerDaysBody', 'workerDaysModal']
        .forEach(id => dom.register(id));
    const make = dom.createElement;
    dom.createElement = tag => { const node = make(tag); node.dataset = node.dataset || {}; return node; };
    device.ctx.document = dom;
    device.dom = dom;
    device.run = code => vm.runInContext(code, device.ctx, { filename: options.label || 'speed' });
    device.way = body => device.run(`(function () {\n${body}\n})()`);
    if (options.frozen) {
        const Real = Date;
        const iso = options.frozen;
        class Fixed extends Real {
            constructor(...args) { if (args.length) super(...args); else super(iso); }
            static now() { return new Real(iso).getTime(); }
        }
        device.ctx.Date = Fixed;
    }
    const files = options.files || filesOf('now');
    SCREENS.forEach(file => device.run(files[file]));
    LATER_SCREENS.forEach(file => device.run(source(file)));
    device.run('var currentView = "reports";');
    device.ctx.showView = view => device.run(`currentView = ${JSON.stringify(view)}`);
    device.ctx.askTell = () => Promise.resolve();
    device.ctx.askConfirm = () => Promise.resolve(true);
    device.ctx.render = () => {};
    device.ctx.openSettings = () => {};
    device.ctx.exportBackup = () => {};
    device.setToday(options.today || TODAY);
    device.State.load();
    device.run(`function speedClose(list, at) {
        return saveFinancialAction(() => list.reduce((all, one) => all.concat(
            closePeriodChanges(State.schedule, one[0], one[1], one[2], at, 'd_office', one[3])), []));
    }`);
    return device;
}

// ---------------------------------------------------------------- writing a record

// A first device on an empty disk, its record written by `build`, saved; then reopened
// (the boot mirror writes the ledger) with the approval recorded - asked inside the
// pay sheet's one reading.
function written(build, today) {
    const first = makeDevice({ deviceId: 'd_office', flags: OPEN });
    first.setToday(today);
    const schedule = first.State.schedule;
    schedule.places = [];
    schedule.workers = [];
    build(first, schedule);
    first.State.save({ silent: true });
    const device = openDevice(first.dump(), { today });
    const plan = JSON.parse(device.run('JSON.stringify(reportReadOnce(() => planCarryMigration(State.schedule)))'));
    if (!device.call('carryMigrationApproved', device.State.schedule, plan)) {
        device.State.commit(device.call('recordCarryApproval', device.State.schedule, plan, '2025-12-01T09:00:00.000Z', 'd_person'));
    }
    return device;
}

// One close, as the per-man box writes it: the sheet's proposal (or a share of it).
function closeOne(device, workerId, period, share) {
    const proposed = device.run(`reportReadOnce(() => advanceAccount(State.schedule, ${JSON.stringify(workerId)}, '${period.from}', '${period.to}').deducted)`);
    const take = Math.floor(proposed * share);
    return device.run(`weeklyCloseOnce(() => speedClose(${JSON.stringify([[workerId, period.from, period.to, take]])}, '${period.to}T15:00:00.000Z'), { memo: false })`) === true;
}

function repayOne(device, advanceId, amount, date, at) {
    return device.run(`weeklyCloseOnce(() => saveFinancialAction(() => recordAdvanceRepaid(State.schedule, ${JSON.stringify(advanceId)}, ${amount}, ${JSON.stringify(date)}, '', ${JSON.stringify(at)}, 'd_office', 'cash')), { memo: false })`) === true;
}

// THE SEASON. kind: 'open' | 'closed' | 'skipped'.
export function seasonDisk(kind, options = {}) {
    const men = options.men || 40;
    const span = options.days || 300;
    const today = options.today || TODAY;
    const rand = mulberry(options.seed || 20261119);
    const pick = list => list[Math.floor(rand() * list.length)];
    const days = [];
    for (let date = today; days.length < span; date = addDays(date, -1)) {
        if (new Date(`${date}T12:00:00`).getDay() !== 6) days.unshift(date);
    }
    const first = days[0];
    const advanceFrom = kind === 'open' ? first : addDays(today, -70);
    const facts = { kind, men, days: days.length, from: first, to: today, closes: 0, repaid: 0, skippers: [] };
    // The week before the weekly men's last finished one (Friday to Thursday; today is a
    // Thursday, so their last finished week is the one ending today).
    const lastWeek = { from: addDays(today, -6), to: today };
    const weekBefore = { from: addDays(today, -13), to: addDays(today, -7) };
    const weeklyCount = Math.round(men * 0.4);
    const skipper = n => kind === 'skipped' && n <= weeklyCount && n % 3 === 1;
    const device = written((writer, schedule) => {
        schedule.places = [1, 2, 3, 4, 5, 6].map(n => ({ id: `p_${n}`, name: `אתר ${n}`, active: true }));
        for (let n = 1; n <= men; n += 1) {
            const id = `w_${String(n).padStart(2, '0')}`;
            const weekly = n <= weeklyCount;
            schedule.workers.push(Object.assign({ id, name: `עובד ${n}`, active: n % 13 !== 0,
                dailyRate: pick([380, 420, 450, 500, 550, 610, 650]), hourlyRate: pick([0, 0, 45, 50, 41.25]),
                phone: `05200${String(10000 + n)}` }, weekly ? { payCycles: '2025-01-03=weekly' } : {}));
            const home = `p_${1 + (n % 6)}`;
            const stops = n % 17 === 0 ? addDays(today, -40) : null;
            days.forEach(date => {
                if (stops && date >= stops) return;
                if (skipper(n) && date >= weekBefore.from && date <= weekBefore.to) return;
                // A skipper works every day of his last week, today included, so his week is
                // his to close today («סגירת שבוע»'s own rule for a period that ends today).
                const sure = skipper(n) && date >= lastWeek.from;
                if (!sure && rand() > 0.85) return;
                if (!sure && rand() < 0.02) { writer.call('markAbsent', schedule, date, id, 'actual'); return; }
                const r = rand();
                if (r < 0.03) writer.call('assignPlace', schedule, date, id, 'actual', home, 'double');
                else if (r < 0.08) writer.call('assignPlace', schedule, date, id, 'actual', home, 'extra', 1 + Math.floor(rand() * 3) + (rand() < 0.3 ? 0.5 : 0));
                else writer.call('assignPlace', schedule, date, id, 'actual', home, 'normal');
                if (rand() < 0.05) writer.call('assignPlace', schedule, date, id, 'actual', `p_${1 + ((n + 3) % 6)}`, 'normal');
            });
            for (let date = addDays(advanceFrom, Math.floor(rand() * 20)); date <= today; date = addDays(date, 14 + Math.floor(rand() * 14))) {
                if (skipper(n) && date >= weekBefore.from) break;
                writer.call('addAdvance', schedule, id, date, pick([200, 300, 500, 800, 1000, 1500, 2000, 3000, 250.5]), '');
            }
            // The skipper's advance, handed over in the week he then did not come.
            if (skipper(n)) {
                writer.call('addAdvance', schedule, id, addDays(weekBefore.from, 2), 1500, '');
                facts.skippers.push(id);
            }
        }
        days.forEach(date => {
            if (rand() < 0.4) writer.call('setRimaCount', schedule, date, 'p_1', 1 + Math.floor(rand() * 4));
            if (rand() < 0.3) writer.call('setRimaCount', schedule, date, 'p_3', 1 + Math.floor(rand() * 3));
            if (rand() < 0.3) writer.call('setYosefGevesCount', schedule, date, 'p_2', 1 + Math.floor(rand() * 5));
        });
    }, today);
    const S = () => device.State.schedule;
    if (kind !== 'open') {
        S().workers.forEach(worker => {
            const mine = device.call('advancesFor', S(), worker.id, '0000-01-01', '9999-12-31');
            if (!mine.length) return;
            let period = device.call('periodRangeFor', worker, mine[0].date);
            // A third of the men keep their last finished period open (something to close);
            // a skipper keeps the week he did not come open, and the one after it.
            const third = /[369]$/.test(worker.id);
            const stopAt = facts.skippers.indexOf(worker.id) !== -1 ? weekBefore.from : (third ? addDays(today, -8) : today);
            while (period.to < stopAt) {
                if (closeOne(device, worker.id, period, facts.closes % 5 === 0 ? 0.5 : 1)) facts.closes += 1;
                period = device.call('periodRangeFor', worker, addDays(period.to, 1));
            }
        });
    }
    // A few repayments, against each man's last advance.
    S().workers.slice(0, 8).forEach((worker, i) => {
        if (facts.skippers.indexOf(worker.id) !== -1) return;
        const mine = device.call('advancesFor', S(), worker.id, '0000-01-01', '9999-12-31');
        const of = mine[mine.length - 1];
        if (!of) return;
        const room = device.run(`reportReadOnce(() => advanceOutstanding(State.schedule, ${JSON.stringify(of.id)}).left)`);
        const sum = Math.min(room, 100 + 50 * i);
        if (sum > 0 && repayOne(device, of.id, sum, of.date, `${today}T08:0${i}:00.000Z`)) facts.repaid += 1;
    });
    const schedule = S();
    facts.advances = Object.keys(schedule.advances || {}).length;
    facts.ledger = Object.keys((schedule.ledger || {}).advances || {}).length;
    facts.kib = Math.round(JSON.stringify(schedule).length / 1024);
    return { disk: device.dump(), facts };
}

// THE MEDIUM SEASON: fifteen men over twenty-six weeks.
export function mediumDisk(options = {}) {
    const today = options.today || TODAY;
    const rand = mulberry(options.seed || 26);
    const pick = list => list[Math.floor(rand() * list.length)];
    const days = workdays(addDays(today, -182), today);
    const facts = { closes: 0, repaid: 0 };
    const device = written((writer, schedule) => {
        schedule.places = [{ id: 'p_x', name: 'אתר צפון', active: true }, { id: 'p_y', name: 'אתר דרום', active: true }];
        for (let n = 1; n <= 15; n += 1) {
            const id = `w_${n}`;
            schedule.workers.push(Object.assign({ id, name: `עובד ${n}`, active: n !== 14, dailyRate: pick([380, 450, 500, 610]),
                hourlyRate: pick([0, 0, 45]), phone: `05300${String(10000 + n)}` }, n % 2 ? { payCycles: '2026-01-02=weekly' } : {}));
            const stops = n === 9 ? addDays(today, -30) : null;
            days.forEach(date => {
                if (stops && date >= stops) return;
                const r = rand();
                if (r < 0.03) { writer.call('markAbsent', schedule, date, id, 'actual'); return; }
                if (r < 0.06) return;
                writer.call('assignPlace', schedule, date, id, 'actual', n % 3 ? 'p_x' : 'p_y', r < 0.09 ? 'double' : 'normal');
            });
            writer.call('addAdvance', schedule, id, addDays(today, -170 + n), 1000 + 100 * n, '');
            writer.call('addAdvance', schedule, id, addDays(today, -30 + n), 500, '');
        }
        days.forEach(date => {
            if (rand() < 0.3) writer.call('setRimaCount', schedule, date, 'p_x', 1 + Math.floor(rand() * 3));
            if (rand() < 0.2) writer.call('setYosefGevesCount', schedule, date, 'p_y', 1 + Math.floor(rand() * 4));
        });
    }, today);
    const S = () => device.State.schedule;
    if (options.closes) {
        S().workers.forEach((worker, at) => {
            if (at % 4 === 3) return;
            const mine = device.call('advancesFor', S(), worker.id, '0000-01-01', '9999-12-31');
            let period = device.call('periodRangeFor', worker, mine[0].date);
            const upTo = 2 + (at % 4);
            for (let n = 0; n < upTo && period.to < today; n += 1) {
                if (closeOne(device, worker.id, period, [1, 0.5, 0][(at + n) % 3])) facts.closes += 1;
                period = device.call('periodRangeFor', worker, addDays(period.to, 1));
            }
        });
    }
    [1, 4, 6].forEach((n, i) => {
        const mine = device.call('advancesFor', S(), `w_${n}`, '0000-01-01', '9999-12-31');
        const of = mine[mine.length - 1];
        const room = device.run(`reportReadOnce(() => advanceOutstanding(State.schedule, ${JSON.stringify(of.id)}).left)`);
        if (room > 0 && repayOne(device, of.id, Math.min(room, 200), addDays(today, -3), `${today}T08:1${i}:00.000Z`)) facts.repaid += 1;
    });
    return { disk: device.dump(), men: S().workers.map(worker => worker.id), facts };
}

// ---------------------------------------------------------------- the ways in
//
// Each is code a phone runs and the TEXT it answers: a page's nodes as tests/
// reports.speed.test.mjs snaps them, or a reading's answer as JSON. `man` is filled in.
// NODES A LATER TRACK ADDS to a page compared with v204 (the contract, «Conflicts with wave 1»).
// Payday puts «סגירת שבוע»'s button INTO a row of its own beside its entry (owes-actions), where
// v204 draws the button straight in the board: so such a row is REPLACED by its children that
// v204 also draws - the «סגירת שבוע» button stays, in place - and its own children that v204
// does not draw (payday-entry) are taken out and COUNTED (SPEED_LATER), with the boards drawn.
// On this branch there are none; tests/speed.test.mjs holds that, and one per board once a
// LATER_SCREENS file draws one.
export const SNAP = `var SPEED_LATER = { rows: 0, kids: 0, boards: 0 };
const SPEED_LATER_ROWS = ['owes-actions'];
const SPEED_LATER_KIDS = ['payday-entry'];
function speedHas(node, names) {
    const own = String(node.className || '').split(/\\s+/);
    return names.some(name => own.indexOf(name) !== -1);
}
function speedKids(node) {
    const out = [];
    node.children.forEach(child => {
        if (speedHas(child, SPEED_LATER_ROWS)) {
            SPEED_LATER.rows += 1;
            child.children.forEach(inner => {
                if (speedHas(inner, SPEED_LATER_KIDS)) { SPEED_LATER.kids += 1; return; }
                out.push(speedSnap(inner));
            });
            return;
        }
        out.push(speedSnap(child));
    });
    return out;
}
function speedSnap(node) {
    if (speedHas(node, ['owes'])) SPEED_LATER.boards += 1;
    const out = { tag: node.tagName, cls: node.className || '' };
    const attrs = Object.keys(node.attributes || {}).sort();
    if (attrs.length) out.attrs = attrs.map(key => [key, node.attributes[key]]);
    const data = Object.keys(node.dataset || {}).sort();
    if (data.length) out.data = data.map(key => [key, node.dataset[key]]);
    ['hidden', 'disabled', 'open', 'checked', 'value', 'type', 'placeholder', 'title'].forEach(key => {
        if (node[key] !== undefined && node[key] !== '' && node[key] !== false) out[key] = node[key];
    });
    const style = Object.keys(node.style || {}).sort();
    if (style.length) out.style = style.map(key => [key, node.style[key]]);
    if (node.children.length === 0) out.text = node.textContent;
    else out.kids = speedKids(node);
    return out;
}
function speedDrawn(id) { return JSON.stringify(speedKids(document.getElementById(id))); }
function speedRange(name) {
    const set = {
        'the default account': () => { REPORT_PRESET = 'fortnight'; REPORT_RANGE.from = null; REPORT_RANGE.to = null; const r = defaultPayrollRange(); REPORT_RANGE.from = r.from; REPORT_RANGE.to = r.to; },
        'the same fortnight picked by hand': () => { REPORT_PRESET = 'custom'; const r = defaultPayrollRange(); REPORT_RANGE.from = r.from; REPORT_RANGE.to = r.to; },
        'the fortnight before': () => { REPORT_PRESET = 'custom'; const r = defaultPayrollRange(); REPORT_RANGE.from = shiftDate(r.from, -14); REPORT_RANGE.to = shiftDate(r.to, -14); },
        'this week': () => { REPORT_PRESET = 'weekly'; setWeeklyReportRange(0); },
        'last week': () => { REPORT_PRESET = 'lastweek'; setWeeklyReportRange(-1); },
        'this month': () => { REPORT_PRESET = 'month'; setMonthRange(0); },
        'last month': () => { REPORT_PRESET = 'lastmonth'; setMonthRange(-1); }
    };
    set[name]();
}
function speedReset() {
    REPORT_DEDUCTIONS.clear(); REPORT_WORKERS = null; INVOICE_PLACE = null; REPORT_CARD_GRID = true;
    ADVANCE_WORKER = null; OWES_PAGE = null; ADVANCE_ORDER_DRAFT = null; REPORT_SECTION = 'workers';
    speedRange('the default account');
}
function speedKeepRange(work) {
    const held = [REPORT_RANGE.from, REPORT_RANGE.to, REPORT_PRESET];
    try { return work(); } finally { REPORT_RANGE.from = held[0]; REPORT_RANGE.to = held[1]; REPORT_PRESET = held[2]; }
}
function speedAdvances(worker, page) {
    ADVANCE_WORKER = worker; OWES_PAGE = page === undefined ? null : page;
    clear(document.getElementById('advancesView')); renderAdvances();
    const out = speedDrawn('advancesView');
    ADVANCE_WORKER = null; OWES_PAGE = null;
    return out;
}
function speedClosureKeys() {
    return carryReportingEnabled(State.schedule) === true ? owesClosures(State.schedule).map(group => group.key) : [];
}
1`;

export const RANGE_NAMES = ['the default account', 'the same fortnight picked by hand', 'the fortnight before', 'this week',
    'last week', 'this month', 'last month'];

// [name, the BODY of a function that returns a string]: run with `device.way(body)`, inside a
// function so that nothing it declares outlives it. Functions of a man or a close are handed
// his id or its key.
export const PAGE_WAYS = [
    ['«דוחות» ← «לפי עובד»', 'REPORT_SECTION = "workers"; renderReports(); return speedDrawn("reportsView");'],
    ['«דוחות» ← «לפי אתר»', 'REPORT_SECTION = "sites"; renderReports(); const out = speedDrawn("reportsView"); REPORT_SECTION = "workers"; return out;'],
    ['the pay rows', 'return JSON.stringify(payrollRows());'],
    ['the workbook', 'return JSON.stringify(reportSheets());']
];
export const MAN_WAYS = [
    ['his statement', id => `return JSON.stringify(workerStatementText(${JSON.stringify(id)}));`],
    ['his days', id => `openWorkerDays(${JSON.stringify(id)}); return ['workerDaysTitle', 'workerDaysMeta', 'workerDaysBody'].map(speedDrawn).join('|') + document.getElementById('workerDaysTitle').textContent + document.getElementById('workerDaysMeta').textContent;`],
    ['his closing box', id => `return speedKeepRange(() => { openWorkerSettlement(${JSON.stringify(id)}); return speedDrawn('workerDaysBody') + document.getElementById('workerDaysTitle').textContent + document.getElementById('workerDaysMeta').textContent + '|' + REPORT_RANGE.from + '..' + REPORT_RANGE.to; });`]
];
// The readings that do not depend on the report's range.
export const BOOK_WAYS = [
    ['«מקדמות»', 'return speedAdvances(null);'],
    ['«סגירות שנרשמו»', 'return speedAdvances(null, "closures");'],
    ['owesRead', 'return JSON.stringify(owesRead(State.schedule, todayStr()));'],
    ['owesReadNow', 'OWES_KEPT = null; return JSON.stringify(owesReadNow());'],
    ['«סגירת שבוע»\'s list', `return JSON.stringify(weeklyCloseRead(State.schedule, todayStr(), '${AT}'));`],
    ['the reminder\'s count', `return String(closeReminderReadCount(State.schedule, todayStr(), '${AT}'));`],
    ['the payslips, this period', 'return JSON.stringify(payslipsFacts("current"));'],
    ['the payslips, the period before', 'return JSON.stringify(payslipsFacts("previous"));'],
    ['the month', `return JSON.stringify(monthSummaryFacts('${TODAY.slice(0, 7)}'));`],
    ['the month before', `return JSON.stringify(monthSummaryFacts('${addDays(TODAY, -31).slice(0, 7)}'));`],
    ['«איפוס מקדמות»\'s reading', 'return JSON.stringify(advanceResetRead(State.schedule, todayStr()));']
];
export const BOOK_MAN_WAYS = [
    ['his page of «מקדמות»', id => `return speedAdvances(${JSON.stringify(id)});`],
    ['his card', id => `return JSON.stringify(workerCardFacts(${JSON.stringify(id)}));`]
];
export const CLOSE_WAY = ['a close\'s page', key => `return speedAdvances(null, ${JSON.stringify(key)});`];

// ---------------------------------------------------------------- the instruments
//
// Installed on every phone after its screens load and BEFORE any reading opens: the real
// functions counted, by argument, for State.schedule and apart for any other schedule. A
// reading takes these as its readers, so what is counted is every call that reached the
// model - what S1, S3 and S4 did not answer. Transparent: each hands back what the function
// hands back. Rows of every pay sheet worked out are held to being flat (criterion 20).
export const COUNTER = `var SPEED_COUNT = null; var SPEED_FLAT = { sheets: 0, rows: 0, bad: [] }; var SPEED_INSTALLED = {};
var SPEED_WRITES = 0; var SPEED_REAL = {};
(function () {
    const arg = one => typeof one + ':' + (Object.is(one, -0) ? '-0' : String(one));
    ${j(SEVEN.concat(['payrollReport', 'appendLedgerEntry']))}.forEach(name => {
        const real = globalThis[name];
        if (typeof real !== 'function') return;
        SPEED_REAL[name] = real;
        globalThis[name] = function (schedule) {
            const mine = schedule === State.schedule;
            if (SPEED_COUNT) {
                SPEED_COUNT.calls.push((mine ? '' : 'copy:') + name + '(' + Array.prototype.slice.call(arguments, 1).map(arg).join('|') + ')');
                SPEED_COUNT.events.push((mine ? '' : 'copy:') + name);
            }
            if (name === 'appendLedgerEntry' && mine) SPEED_WRITES += 1;
            const out = real.apply(this, arguments);
            if (name === 'payrollReport' && Array.isArray(out)) {
                SPEED_FLAT.sheets += 1;
                out.forEach(row => {
                    SPEED_FLAT.rows += 1;
                    Object.keys(row || {}).forEach(field => {
                        const value = row[field];
                        if (!(value === null || value === undefined || ['string', 'number', 'boolean'].indexOf(typeof value) !== -1)
                            && SPEED_FLAT.bad.length < 5) SPEED_FLAT.bad.push(field + ':' + typeof value);
                    });
                });
            }
            return out;
        };
    });
    if (typeof reportSharedKey === 'function') {
        const realKey = reportSharedKey;
        reportSharedKey = function () { if (SPEED_COUNT) { SPEED_COUNT.keys += 1; SPEED_COUNT.events.push('key'); } return realKey.apply(this, arguments); };
    }
    const settled = carryMigrationSettled;
    carryMigrationSettled = function () { if (SPEED_COUNT) SPEED_COUNT.questions += 1; return settled.apply(this, arguments); };
    const plan = planAdvanceCarry;
    planAdvanceCarry = function () { if (SPEED_COUNT) SPEED_COUNT.plans += 1; return plan.apply(this, arguments); };
    // Every write a way in could make, counted at its door.
    ['commit', 'commitMany', 'commitRoster', 'save', 'persist'].forEach(name => {
        const real = State[name];
        if (typeof real !== 'function') return;
        State[name] = function () { SPEED_WRITES += 1; return real.apply(this, arguments); };
    });
    ['set', 'setVerified', 'remove', 'durableSet'].forEach(name => {
        const real = Store[name];
        if (typeof real !== 'function') return;
        Store[name] = function () { SPEED_WRITES += 1; return real.apply(this, arguments); };
    });
    ${j(SEVEN.concat(['appendLedgerEntry'], V196))}.forEach(name => { SPEED_INSTALLED[name] = globalThis[name]; });
})();
function speedCount(body) {
    SPEED_COUNT = { calls: [], events: [], keys: 0, questions: 0, plans: 0 };
    let out = null; let error = null;
    try { out = body(); } catch (thrown) { error = String(thrown && thrown.message); }
    const counted = SPEED_COUNT;
    SPEED_COUNT = null;
    return JSON.stringify({ out, error, counted });
}
// The page as it was before the reading: every reader the one it was, no reading open.
function speedClean() {
    return Object.keys(SPEED_INSTALLED).every(name => globalThis[name] === SPEED_INSTALLED[name]) && REPORT_ONCE === null;
}
1`;

// A phone on `disk`, of either build, instrumented. `unapproved`: the approval taken off in
// memory before anything is read - what a phone whose migration nobody approved reads.
export function phone(disk, files, options = {}) {
    const device = openDevice(disk, Object.assign({ files }, options));
    device.run(SNAP);
    device.run(COUNTER);
    if (options.unapproved) device.run('State.schedule.ledger.migrations = {}; 1');
    device.run('speedReset(); 1');
    return device;
}
export const counted = (device, body) => JSON.parse(device.run(`speedCount(() => (function () {\n${body}\n})())`));
export const realCalls = (counts, names) => counts.calls.filter(call => names.some(name => call.indexOf(`${name}(`) === 0));
export const twice = list => list.filter((one, at) => list.indexOf(one) !== at);

// The ways in of one record, as [name, body]. Every man's statement, days and closing box
// on the default account and on an explicit range; the pages on every range of the seven.
// Each body puts the report where it reads it first, so each way in is the same question
// whatever ran before it.
export function waysOf(device, men, options = {}) {
    const ranges = options.ranges || RANGE_NAMES;
    const manRanges = options.manRanges || [RANGE_NAMES[0], RANGE_NAMES[2]];
    const at = range => `speedReset(); speedRange(${j(range)});`;
    const out = [];
    ranges.forEach(range => PAGE_WAYS.forEach(([name, body]) => {
        // the pay rows are read as every reader reads them: inside the one reading
        const read = name === 'the pay rows' ? 'return reportReadOnce(() => JSON.stringify(payrollRows()));' : body;
        out.push([`${range}: ${name}`, `${at(range)} ${read}`]);
    }));
    manRanges.forEach(range => (options.someMen || men).forEach(id => MAN_WAYS.forEach(([name, make]) =>
        out.push([`${range}: ${id}: ${name}`, `${at(range)} ${make(id)}`]))));
    BOOK_WAYS.forEach(([name, body]) => {
        const read = name === 'owesRead' ? 'return reportReadOnce(() => JSON.stringify(owesRead(State.schedule, todayStr())));' : body;
        out.push([name, `speedReset(); ${read}`]);
    });
    (options.someMen || men).forEach(id => BOOK_MAN_WAYS.forEach(([name, make]) => out.push([`${id}: ${name}`, `speedReset(); ${make(id)}`])));
    // (A record a reader is missing from may not be able to list its closes at all - on
    // either build: weeklyCloseOnce wraps its readers whether or not they are loaded.)
    let keys = [];
    try { keys = JSON.parse(device.run('JSON.stringify(reportReadOnce(() => speedClosureKeys()))')); } catch (error) { keys = []; }
    keys.forEach(key => out.push([`${CLOSE_WAY[0]} ${key}`, `speedReset(); ${CLOSE_WAY[1](key)}`]));
    return out;
}

// A way in's outcome: its bytes, or the throw it ended in.
export const outcome = (device, body) => {
    try { return `ok:${device.way(body)}`; } catch (error) { return `threw:${error && error.message}`; }
};

// The same record, every way in, both builds. v204 once per way; this build cold (nothing
// kept), then again at once (warm), then the whole list a second time, twice each - every
// one of the four compared with v204's. Hygiene after every way in of this build.
export function compareAll(label, oldDevice, nowDevice, ways, tally) {
    const nowDisk = JSON.stringify(nowDevice.dump());
    nowDevice.run('SPEED_WRITES = 0; 1');
    const old = ways.map(([, body]) => outcome(oldDevice, body));
    const passes = [[], [], [], []];
    ways.forEach(([, body]) => {
        nowDevice.run('REPORT_SHARED_KEPT = null; 1');
        passes[0].push(outcome(nowDevice, body));
        if (!nowDevice.run('speedClean()')) tally.dirty.push(`${label}: cold`);
        passes[1].push(outcome(nowDevice, body));
    });
    ways.forEach(([, body]) => {
        passes[2].push(outcome(nowDevice, body));
        passes[3].push(outcome(nowDevice, body));
        if (!nowDevice.run('speedClean()')) tally.dirty.push(`${label}: warm`);
    });
    ways.forEach(([name], at) => {
        tally.compared += 4;
        if (old[at].indexOf('threw:') === 0) tally.threw.push(`${label}: ${name}: ${old[at].slice(0, 80)}`);
        ['cold', 'again', 'second pass', 'second pass, again'].forEach((which, pass) => {
            if (passes[pass][at] !== old[at]) tally.wrong.push(`${label}: ${name} (${which})`);
        });
    });
    tally.writes += nowDevice.run('SPEED_WRITES');
    if (JSON.stringify(nowDevice.dump()) !== nowDisk) tally.diskMoved.push(label);
    tally.kept += nowDevice.run('REPORT_SHARED_KEPT === null ? 0 : 1');
    const later = JSON.parse(nowDevice.run(`JSON.stringify(Object.assign({ drawing: typeof paydayEntryButton === 'function' }, SPEED_LATER))`));
    if (tally.later) tally.later.push([label, later]);
    const flat = JSON.parse(nowDevice.run('JSON.stringify(SPEED_FLAT)'));
    tally.flat.sheets += flat.sheets;
    tally.flat.rows += flat.rows;
    flat.bad.forEach(one => tally.flat.bad.push(`${label}: ${one}`));
}

// ---------------------------------------------------------------- the writes (criterion 3)
//
// One phone on `record` (the medium season), connected to a cloud with a second phone beside
// it. After each kind of write, every way in as this build reads it - the first reading after
// the write counted - and compared, as `columns` asks, with (afresh) the same way drawn afresh
// on the same phone - a reading marked open before it, so every reader runs with nothing
// shared, the gate answered once for the record's one text - and (v204) v204's files on the
// same record. tests/speed.test.mjs asks for the first, tests/speed.season.test.mjs for the
// second (the medium season's v204 side lives there: the contract's rule for a Node suite
// that runs longer than tests/reports.speed.test.mjs). `given` is the runner's.
export const FRESH = (device, men) => waysOf(device, men, { ranges: [RANGE_NAMES[0]], manRanges: [RANGE_NAMES[0]], someMen: ['w_1', 'w_2'] });
// (Inside one afresh way in the record cannot change, so its gate is asked once for it: the
// answer of the record's one text.)
export const AFRESH = body => `const was = REPORT_ONCE; const gate = carryReportingEnabled; const record = State.schedule; let answer;
    carryReportingEnabled = function (schedule) { if (schedule !== record || arguments.length !== 1) return gate.apply(this, arguments);
        if (answer === undefined) answer = gate(schedule); return answer; };
    REPORT_ONCE = { schedule: State.schedule };
    try { return (function () {\n${body}\n})(); } finally { REPORT_ONCE = was; carryReportingEnabled = gate; }`;
export async function writesScenario(record, columns, given) {
    const cloud = makeCloud();
    const A = phone(record.disk, filesOf('now'));
    A.Sync.pushDelayMs = 5;
    A.run('weeklyCloseShared = () => true; 1');
    A.Sync.connect(cloud.adapter);
    given('the phone is connected and synced', await settleUntil(() => A.Sync.status === 'synced' && cloud.doc, 8000), A.Sync.status);
    const B = makeDevice({ deviceId: 'd_second', flags: OPEN });
    B.setToday(TODAY);
    B.Sync.pushDelayMs = 5;
    B.Sync.connect(cloud.adapter);
    given('a second phone holds the same record', await settleUntil(() => B.State.schedule.workers.length === 15, 8000));
    const quiet = async () => { await settleUntil(() => A.Sync.pendingCount() === 0 && B.Sync.pendingCount() === 0, 8000); await settle(20); };

    // In-memory states the next phone must be given too: what a disk does not carry.
    let memory = [];
    const mirror = () => {
        const old = phone(A.dump(), filesOf('base'), { today: A.run('todayStr()') });
        memory.forEach(code => old.run(code));
        return old;
    };
    const wrongs = [];
    const realAfter = [];
    const step = (name, expectWalks) => {
        const old = mirror();
        given(`${name}: the v204 phone holds the same record`, JSON.stringify(old.State.schedule) === JSON.stringify(A.State.schedule));
        // The list is made on the v204 phone (the same record): making it asks for the closes
        // inside a reading, and on this phone that reading would be the first after the change.
        const ways = FRESH(old, record.men);
        // The first reading after the change that asks the seven anything (works out a key):
        // a reading of the old way - the gate shut by the change - asks none, and so is handed
        // nothing kept either.
        let first = null;
        ways.forEach(([way, body]) => {
            const read = counted(A, body);
            if (first === null && read.counted.keys > 0) first = read.counted;
            const mine = read.error === null ? `ok:${read.out}` : `threw:${read.error}`;
            if (columns.afresh && mine !== outcome(A, AFRESH(body))) wrongs.push(`${name}: ${way}: not as afresh`);
            if (columns.v204 && mine !== outcome(old, body)) wrongs.push(`${name}: ${way}: not v204's`);
        });
        const walks = first === null ? 0 : realCalls(first, SEVEN).length;
        realAfter.push(`${name} ${first === null ? '(none asked)' : walks}`);
        if (first === null && expectWalks !== null) wrongs.push(`${name}: no reading after it asked the seven anything`);
        if (expectWalks === true && walks < 1) wrongs.push(`${name}: the first reading after it asked the model nothing - an answer kept across it`);
        if (expectWalks === false && walks !== 0) wrongs.push(`${name}: the first reading after it called the seven ${walks} times - nothing was kept across it`);
    };
    const S = () => A.State.schedule;
    const W = id => S().workers.filter(one => one.id === id)[0];
    step('before anything', true);
    step('nothing changed', false);
    given('a day typed', A.State.commit(A.call('assignPlace', S(), TODAY, 'w_3', 'actual', 'p_y', 'double')) !== false);
    step('a day typed', true);
    given('an absence', A.State.commit(A.call('markAbsent', S(), addDays(TODAY, -1), 'w_4', 'actual')) !== false);
    step('an absence', true);
    given('a Rima count and a יוסף גבס count', A.State.commit(A.call('setRimaCount', S(), TODAY, 'p_x', 3)) !== false
        && A.State.commit(A.call('setYosefGevesCount', S(), TODAY, 'p_y', 2)) !== false);
    step('the two counts', true);
    given('an advance, as the form writes it', A.State.commitMany(A.call('recordNewAdvance', S(), 'w_5', TODAY, 700, '', `${TODAY}T10:00:00.000Z`, 'd_office', 'cash')) !== false);
    step('an advance', true);
    const mine = A.call('advancesFor', S(), 'w_6', '0000-01-01', '9999-12-31');
    const last = mine[mine.length - 1];
    given('a repayment', A.run(`saveFinancialAction(() => recordAdvanceRepaid(State.schedule, ${j(last.id)}, 100, ${j(TODAY)}, '', '${TODAY}T11:00:00.000Z', 'd_office', 'cash'))`) === true);
    step('a repayment', true);
    const entry = Object.values(S().ledger.advances).filter(one => one.kind === 'repaid' && one.at === `${TODAY}T11:00:00.000Z`)[0];
    given('a reversal of it', A.run(`saveFinancialAction(() => recordEventReversed(State.schedule, ${j(entry.id)}, 100, ${j(TODAY)}, 'נרשם בטעות', '${TODAY}T11:05:00.000Z', 'd_office'))`) === true);
    step('a reversal', true);
    // His first period - he has never been closed, so in order it is the one that may be.
    const open = A.call('periodRangeFor', W('w_8'), A.call('advancesFor', S(), 'w_8', '0000-01-01', '9999-12-31')[0].date);
    const closable = A.call('planPeriodClosure', S(), 'w_8', open.from, open.to, `${TODAY}T11:10:00.000Z`);
    given('a close', closable.canClose && A.run(`speedClose(${j([['w_8', open.from, open.to, closable.deducted]])}, '${TODAY}T11:10:00.000Z')`) === true, j(closable.reasons));
    step('a close', true);
    const pass = JSON.parse(A.run(`(function () { const read = weeklyCloseRead(State.schedule, todayStr(), new Date().toISOString());
        const picks = read.men.filter(man => !man.held).slice(0, 2).map(man => ({ man, x: man.max }));
        const result = weeklyCloseWrite(picks); return JSON.stringify({ picks: picks.length, saved: result.saved, failure: result.failure, moved: result.moved }); })()`));
    given('«סגירת שבוע»\'s pass', pass.picks > 0 && pass.saved === true, j(pass));
    step('«סגירת שבוע»\'s pass', true);
    const reset = JSON.parse(A.run(`(function () { ADVANCE_RESET = { step: 2, read: advanceResetRead(State.schedule, todayStr()), skip: {}, moved: [],
        stale: false, key: null, saving: false, error: null, result: null };
        const chosen = advanceResetChosen().slice(0, 1); const result = advanceResetWrite(chosen);
        return JSON.stringify({ chosen: chosen.length, done: result.done.length, failure: result.failure }); })()`));
    given('«איפוס מקדמות»', reset.chosen === 1 && reset.done === 1, j(reset));
    step('«איפוס מקדמות»', true);
    given('a rate and a pay cycle changed, the way the roster writes them', (() => {
        W('w_9').dailyRate = 720;
        // The roster's own history, a boundary on the Friday his current period opens.
        const from = A.call('periodRangeFor', W('w_10'), TODAY).from;
        W('w_10').payCycles = A.run(`payCyclesWith('w_10', ${j(from)}, 'weekly')`);
        return A.State.commitRoster() !== false && A.call('parsePayCycles', W('w_10').payCycles) !== null;
    })());
    step('a rate and a cycle', true);
    given('a man archived', (() => { W('w_12').active = false; return A.State.commitRoster() !== false; })());
    step('a man archived', true);
    await quiet();
    memory = ['var SPEED_APPROVAL = State.schedule.ledger.migrations; State.schedule.ledger.migrations = {}; 1'];
    A.run(memory[0]);
    step('the approval removed in memory', true);
    A.run('State.schedule.ledger.migrations = SPEED_APPROVAL; 1');
    memory = [];
    step('the approval put back', true);
    const tick = A.run('Store.tick');
    A.run('var SPEED_RATE = State.schedule.workers.filter(one => one.id === "w_4")[0].dailyRate; 1');
    memory = ['State.schedule.workers.filter(one => one.id === "w_4")[0].dailyRate = 0; 1'];
    A.run(memory[0]);
    given('a change in memory no write carried: the tick did not move', A.run('Store.tick') === tick);
    step('a change in memory', true);
    A.run('State.schedule.workers.filter(one => one.id === "w_4")[0].dailyRate = SPEED_RATE; 1');
    memory = [];
    step('the change taken back', true);
    await quiet();
    B.State.commit(B.call('assignPlace', B.State.schedule, TODAY, 'w_11', 'actual', 'p_y', 'extra', 2));
    given('a snapshot from the second phone adopted', await settleUntil(() => JSON.stringify((S().days[TODAY] || {}).actual || {}).includes('"w_11"')
        && JSON.stringify(((S().days[TODAY] || {}).actual || {}).w_11).includes('extra'), 8000));
    await quiet();
    step('a snapshot adopted', true);
    A.State.date = TODAY;
    A.call('editWithUndo', 'w_13', 'נרשם', (date, layer) => A.call('assignPlace', A.State.schedule, date, 'w_13', layer, 'p_x', 'double', 0));
    step('a day placed with ↶ ready', true);
    A.call('runUndo');
    step('↶', true);
    A.setToday(addDays(TODAY, 1));
    step('the day turned', true);
    A.setToday(TODAY);
    step('and back', true);
    await quiet();
    step('the sends settled', null);
    const tickNow = A.run('Store.tick');
    A.run('Store.set("farkad:prov:sent:advance:speed_probe", "1"); 1');
    given('a provenance key, as a send leaves one: the tick moved, the record did not', A.run('Store.tick') !== tickNow);
    step('a write that moves the tick and not the record', false);
    const loaded = S();
    A.State.load();
    given('the record loaded again: a new schedule object, the same text', S() !== loaded && JSON.stringify(S()) === JSON.stringify(loaded));
    step('a new schedule object with the same text', true);
    // LAST, because a phone whose disk refused a commit goes to 'error' at the next snapshot it
    // is handed (the sync layer's own answer to a full disk, measured; not this track's).
    const before = S();
    A.setQuota(() => true);
    const refused = A.State.commit(A.call('assignPlace', S(), TODAY, 'w_7', 'actual', 'p_x', 'double'));
    A.setQuota(null);
    given('a commit the disk refused, rolled back onto a new schedule object', refused === false && S() !== before
        && !JSON.stringify(S().days[TODAY] || {}).includes('"w_7":{"entries":[{"placeId":"p_x","rate":"double"'), String(refused));
    step('a refused commit rolled back', true);
    A.Sync.disconnect && A.Sync.disconnect();
    B.Sync.disconnect && B.Sync.disconnect();
    return { wrongs, realAfter, steps: realAfter.length };
}

// ---------------------------------------------------------------- «איפוס מקדמות»'s step 3
//
// A real write of «איפוס מקדמות» on a phone of `files` (the clock frozen, the phone taken as
// synced), and what its result step says afterwards - the board advanceResetAfter reads (v204:
// owesRead bare; this build: owesReadNow, the one line of js/ui/advancereset.js) - with what
// that reading itself wrote and asked of the gate. Both builds write the same record, so the
// two results are compared whole.
export function resetStep(record, files) {
    const device = phone(record.disk, files, { today: record.today || TODAY, frozen: `${record.today || TODAY}T10:00:00.000Z` });
    device.run('weeklyCloseShared = () => true; 1');
    return JSON.parse(device.way(`ADVANCE_RESET = { step: 2, read: advanceResetRead(State.schedule, todayStr()), skip: {}, moved: [], stale: false,
        key: null, saving: false, error: null, result: null };
    const chosen = advanceResetChosen();
    const result = advanceResetWrite(chosen);
    SPEED_WRITES = 0;
    SPEED_COUNT = { calls: [], events: [], keys: 0, questions: 0, plans: 0 };
    advanceResetAfter(result, chosen);
    const after = SPEED_COUNT; SPEED_COUNT = null;
    return JSON.stringify({ men: chosen.length, done: result.done.length, failure: result.failure, result: ADVANCE_RESET.result,
        writes: SPEED_WRITES, questions: after.questions, plans: after.plans });`));
}
