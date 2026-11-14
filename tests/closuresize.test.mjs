// What a close COSTS the shared record, and what it must keep (the owner's problem (c),
// 2026-11-14).
//
//   node tests/closuresize.test.mjs
//
// THE FINDING: every close freezes the payslip - the wage, the counts and the days it was
// made of (closureFacts, js/model/ledger.js) - and wrote that payslip IN FULL onto every
// entry of the close: the period's own record (`closed`) AND each deduction (`deducted`),
// one per advance the deduction touched. A fortnight closed against one advance carried its
// day list twice, against two advances three times. The cloud document every phone shares
// has a hard limit of 1 MiB, and the record only ever grows.
//
// What a close MUST keep is the frozen evidence of what was paid - and it is all on the
// period's record. Every reader asks closedPeriods (js/model/ledger.js), which folds the
// close by period and takes the payslip (basis, days) from the first entry of it that
// carries one; the deductions add up the money and nothing else. So from this build a
// deduction carries its money and the payslip's money figures, and not the payslip's
// basis and day list a second time: the same facts, once.
//
//   S1  the finding: a deduction carried the period's day list and basis again.
//   S2  NOTHING READS DIFFERENTLY: a season of closes (six men, weekly and fortnightly,
//       advances every week) closed in order by v195 (its own bytes, out of Git) and by
//       this build - every closed period's fold, sheet row, statement days, account and
//       balance the same, no closure judged impossible, no entry unreadable.
//   S3  AN OLDER PHONE READS THE NEW SHAPE: v195 opening this build's record reads every
//       one of those figures exactly as it reads its own.
//   S4  WHAT IS ALREADY WRITTEN STAYS: a record v195 wrote, opened and saved by this build,
//       keeps every ledger byte.
//   S5  THE COST, measured and printed: the season's growth from its closes, on both builds.
//
// Synthetic names and money throughout.

import { execFileSync } from 'node:child_process';
import { makeDevice, loadOrder, sourceRoot } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

process.env.TZ = 'Asia/Jerusalem';
const ROOT = sourceRoot();
const j = value => JSON.stringify(value);

const V195 = 'b48ac44255353a0e41138348eecfa5639a852520';
const git = args => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
let v195Sources = null;
function v195(options = {}) {
    if (v195Sources === null) {
        let sha = '';
        try { sha = git(['rev-parse', '--verify', '--quiet', `${V195}^{commit}`]).trim(); } catch (error) { sha = ''; }
        given('the v195 commit is in this repository', sha === V195, V195);
        v195Sources = loadOrder().map(file => ({ file, code: git(['show', `${sha}:${file}`]) }));
        const stamp = (/const APP_VERSION = '([^']+)'/.exec(git(['show', `${sha}:js/app.js`])) || [])[1];
        given('and it names itself v195', stamp === 'v195', String(stamp));
    }
    return makeDevice(Object.assign({ sources: v195Sources, appVersion: 'v195' }, options));
}

const addDays = (date, n) => {
    const [y, m, d] = date.split('-').map(Number);
    const at = new Date(y, m - 1, d + n, 12);
    return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
};
const dow = date => new Date(`${date}T12:00:00`).getDay();

// SIX MEN, three months: four weekly from 2026-08-07, two fortnightly; two sites; every
// fourth day a second site with two extra hours; the even men handed 500 every Monday and
// 300 more on the first of the month.
const START = '2026-08-07';
const TODAY = '2026-11-13';
function season() {
    const record = {
        schemaVersion: 2, workers: [], places: [{ id: 'p_north_site', name: 'אתר צפון', active: true },
            { id: 'p_south_site', name: 'אתר דרום', active: true }],
        days: {}, vehicles: [], advances: {},
        ledger: { advances: {}, unreadable: {},
            migrations: { cm_carry: { id: 'cm_carry', kind: 'carry', rows: 0, at: '', by: 'd' } } }
    };
    for (let i = 0; i < 6; i += 1) {
        record.workers.push(Object.assign({ id: `w_${String(i).padStart(2, '0')}_crew`, name: `עובד מספר ${i}`, active: true,
            dailyRate: 400 + i * 10, hourlyRate: 45 }, i < 4 ? { payCycles: `${START}=weekly` } : {}));
    }
    let n = 0;
    for (let date = START; date < TODAY; date = addDays(date, 1)) {
        if (dow(date) === 6) continue;
        n += 1;
        const actual = {};
        record.workers.forEach((worker, i) => {
            // And now and then a day he was ABSENT, which the frozen day list must still say.
            if ((n + 2 * i) % 11 === 0) { actual[worker.id] = { absent: true, entries: [], rates: { daily: worker.dailyRate, hourly: 45 } }; return; }
            const entries = (n + i) % 4 === 0
                ? [{ placeId: 'p_north_site' }, { placeId: 'p_south_site', extraHours: 2 }]
                : [{ placeId: i % 2 ? 'p_south_site' : 'p_north_site' }];
            actual[worker.id] = { entries, rates: { daily: worker.dailyRate, hourly: 45 } };
        });
        record.days[date] = { plan: {}, actual };
        record.workers.forEach((worker, i) => {
            if (i % 2) return;
            const gifts = [];
            if (dow(date) === 1) gifts.push(500);
            if (date.slice(8) === '01') gifts.push(300);
            gifts.forEach((amount, k) => {
                const id = `a_${worker.id}_${date.replace(/-/g, '')}_${k}`;
                record.advances[id] = { id, workerId: worker.id, date, amount, note: '' };
                record.ledger.advances[`le_mig_${id}`] = { id: `le_mig_${id}`, advanceId: id, kind: 'given',
                    workerId: worker.id, date, amount, note: '', at: `${date}T07:00:00.000Z`, by: 'd_office' };
            });
        });
    }
    return record;
}
function holding(record, make = makeDevice) {
    const device = make({ storage: { 'scheduleData:v2': JSON.stringify(record) } });
    device.setToday(TODAY);
    device.ctx.askTell = () => Promise.resolve();
    device.State.load();
    return device;
}
// Every ended period of every man closed, oldest first, at the sheet's own figure - each
// close at the morning after it ended - and the record saved once.
function closeAll(d) {
    const s = d.State.schedule;
    const closed = [];
    s.workers.forEach(worker => {
        let period = d.call('periodRangeFor', worker, START);
        for (let k = 0; period.to < TODAY && k < 100; k += 1) {
            const at = `${addDays(period.to, 1)}T08:00:00.000Z`;
            const changes = d.call('closePeriodChanges', s, worker.id, period.from, period.to, at, 'd_office');
            if (changes.length) closed.push([worker.id, period.from, period.to]);
            period = d.call('nextPeriodFor', worker, period.from);
        }
    });
    given('the record is saved', d.State.save({ silent: true }) === true);
    return closed;
}
function readings(d, closed) {
    const s = d.State.schedule;
    const out = {};
    closed.forEach(([id, from, to]) => {
        const worker = s.workers.filter(one => one.id === id)[0];
        // The fold as its readers read it: a frozen day's `absent` is Boolean(day.absent)
        // (workerDaysReport), so a day list that leaves `"absent":false` out is the same list.
        const asRead = fold => fold && Object.assign({}, fold, { days: Array.isArray(fold.days)
            ? fold.days.map(day => { const out = {}; Object.keys(day).concat(['absent']).sort()
                .forEach(key => { out[key] = key === 'absent' ? Boolean(day.absent) : day[key]; }); return out; })
            : fold.days });
        out[`${id}|${from}`] = j({
            fold: asRead(d.call('closedPeriods', s, id)[from]),
            frozen: asRead(d.call('frozenPeriodFor', s, id, from, to)),
            row: d.call('payrollReport', s, from, to).filter(row => row.workerId === id)[0],
            days: d.call('workerDaysReport', s, worker, from, to),
            account: d.call('advanceAccount', s, id, from, to)
        });
    });
    s.workers.forEach(worker => { out[`balance|${worker.id}`] = j(d.call('openAdvanceBalance', s, worker.id)); });
    out.impossible = j(d.call('impossibleClosures', s));
    out.unreadable = j(Object.keys((s.ledger || {}).unreadable || {}));
    return out;
}
const differing = (one, two) => Object.keys(one).filter(key => one[key] !== two[key]);
const deductions = d => Object.values(d.State.schedule.ledger.advances).filter(entry => entry.kind === 'deducted');

// ================================================================== S1
{
    suite('S1 the finding: a deduction carried the payslip\'s day list and basis a second time');
    const d = holding(season());
    const closed = closeAll(d);
    given('the season closed', closed.length > 40, String(closed.length));
    const carrying = deductions(d).filter(entry => entry.days !== undefined || entry.basis !== undefined);
    same('no deduction carries the day list or the basis (the period\'s record does)', carrying.length, 0);
    const periods = Object.values(d.State.schedule.ledger.advances).filter(entry => entry.kind === 'closed');
    check('every period\'s record still carries both', periods.length === closed.length
        && periods.every(entry => Array.isArray(entry.days) && entry.basis && typeof entry.basis === 'object'), String(periods.length));
    const days = periods.reduce((all, entry) => all.concat(entry.days), []);
    check('a day he was absent still says so, and no day says `"absent":false`',
        days.some(day => day.absent === true) && days.every(day => day.absent === true || !('absent' in day)),
        `${days.filter(day => day.absent === true).length} absent of ${days.length}`);
    check('and every deduction still carries its money and the payslip\'s money figures',
        deductions(d).length > 20 && deductions(d).every(entry => ['amount', 'balanceAfter', 'gross', 'carriedIn', 'given', 'repaid', 'reversed', 'net']
            .every(field => entry[field] !== undefined)), String(deductions(d).length));
}

// ================================================================== S2 + S3 + S5
{
    suite('S2 nothing reads differently: the same season closed by v195 and by this build');
    const old = holding(season(), v195);
    const here = holding(season());
    const before = here.raw('scheduleData:v2').length;
    const closedOld = closeAll(old);
    const closedHere = closeAll(here);
    same('the same periods closed, in the same order', j(closedHere), j(closedOld));
    const a = readings(old, closedOld);
    const b = readings(here, closedHere);
    same('every closed period, sheet row, statement, account and balance the same', differing(a, b), []);
    same('no closure judged impossible, nothing unreadable', [b.impossible, b.unreadable], ['[]', '[]']);
    same('the same entries, by id', Object.keys(here.State.schedule.ledger.advances).sort(), Object.keys(old.State.schedule.ledger.advances).sort());

    suite('S3 an older phone reads the new shape exactly as it reads its own');
    const oldOnNew = holding(JSON.parse(here.raw('scheduleData:v2')), v195);
    same('v195 on this build\'s record: every figure as v195 on its own', differing(readings(oldOnNew, closedHere), a), []);
    same('and v195 holds nothing aside and blocks nothing', [Object.keys(oldOnNew.State.schedule.ledger.unreadable || {}).length,
        oldOnNew.call('farkadWritesBlocked')], [0, false]);

    suite('S5 the cost, measured');
    const oldBytes = old.raw('scheduleData:v2').length;
    const newBytes = here.raw('scheduleData:v2').length;
    const oldGrowth = oldBytes - before;
    const newGrowth = newBytes - before;
    console.log(`        before the closes ${before} bytes; ${closedHere.length} closes, ${deductions(here).length} deductions;`
        + ` after - v195 ${oldBytes} (+${oldGrowth}), this build ${newBytes} (+${newGrowth});`
        + ` per close ${Math.round(oldGrowth / closedHere.length)} -> ${Math.round(newGrowth / closedHere.length)} bytes`);
    check('the closes cost this build at most two thirds of what they cost v195', newGrowth * 3 <= oldGrowth * 2, `${newGrowth} vs ${oldGrowth}`);
}

// ================================================================== S4
{
    suite('S4 what is already written stays: a v195 record of closes, opened and saved here, keeps every ledger byte');
    const old = holding(season(), v195);
    closeAll(old);
    const bytes = JSON.parse(old.raw('scheduleData:v2'));
    const here = holding(JSON.parse(JSON.stringify(bytes)));
    given('saved here', here.State.save({ silent: true }) === true);
    same('the ledger, byte for byte', j(JSON.parse(here.raw('scheduleData:v2')).ledger), j(bytes.ledger));
    const fromOld = deductions(here).filter(entry => Array.isArray(entry.days));
    check('and v195\'s deductions still carry the copies they were written with', fromOld.length > 20, String(fromOld.length));
}

report();
