// v206, the speed track («דוחות ומקדמות מהירים»): every money reading of «דוחות» and
// «מקדמות» shares what it already worked out - inside v196's one reading, and between
// readings of a record that did not move - and not one output byte moves.
//
//   node tests/speed.test.mjs
//
// WHAT v204 COST. Every reader that asks for a man's account walks every period of his
// since his first advance, and each step of every walk folds the WHOLE ledger again
// (advanceWalk -> overpaidAdvances -> advanceOutstanding -> foldLedger + advanceHistory,
// js/model). On a season nobody closed: 40 s for one draw of «דוחות» in Node, two minutes
// for the payslips. js/ui/reports.js now answers the seven readers of that walk once per
// question inside the one reading (S1), reads «שים לב» and «איפוס מקדמות»'s board inside a
// reading (S2), and keeps those answers - and each range's pay sheet (S4) - between readings
// of the same schedule object, today, flags and readers (S3). Nothing in js/model or js/sync.
//
// What this suite holds (the numbers are the contract's, features/speed/contract.md):
//
//    1. v204's bytes, cold AND warm: every way in on the seeded records, two fixtures and the
//       medium season, under three readings of the gate, against v204's three files out of
//       Git - each way in cold, then again, and the whole list again, every output compared.
//    2. (the plan) the gate's plan asked inside a reading is the bare plan, JSON for JSON.
//    3. fresh after every kind of write: the same way in drawn afresh and v204's.
//    4. what is kept is never stale, and is used: zero real walks on an unmoved record.
//    5. scope hygiene, through every throw.     6. another record is never answered from memory.
//    7. an absent reader stays absent, cold and warm.     8. the counts, for every way in.
//    9. appends: a copy keeps, the record forgets.     10. no write inside a way in.
//   11. the source.     12. the gate as before.     19. S4's copies.     20. rows are flat.
//   21. one memo, dropped when it cannot serve.
//   (fix round 1, the review of v206)
//   22. a hand on a drawn page - a man's page opened from «מקדמות», a letter typed into its
//       search, figures typed into a closing box and «הצג בדוח» pressed - each inside a reading,
//       and ONE copy of the record for a reading that works out nothing new (criterion 4 holds
//       every repeated reading to one; criterion 8 counts per reading, and no question bare).
//   23. a record nobody approved: the sheets the gate's own plan prices are not kept.
//
// The clocks are tests/speed.season.test.mjs's and tests/speed.browser.mjs's; here nothing
// is timed but the suite itself. Synthetic data only.

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeDevice, makeCloud, settle, settleUntil } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import { ROOT, BASE, TODAY, AT, SHUT, OPEN, filesOf, baseDiffers, openDevice, mediumDisk, addDays, workdays,
    mulberry, RANGE_NAMES, PAGE_WAYS, MAN_WAYS, SEVEN, V196, phone, counted, realCalls, twice, readingsOf, waysOf, outcome,
    compareAll, FRESH, writesScenario, resetStep } from './speed.seed.mjs';

process.env.TZ = 'Asia/Jerusalem';
const STARTED = performance.now();
// Where the time goes, printed (not asserted): each section's own seconds, for the report.
let SECTION = { name: 'the seeding', at: STARTED };
const TIMES = [];
const section = name => {
    const now = performance.now();
    TIMES.push(`${SECTION.name.split(':')[0].split(' - ')[0]} ${((now - SECTION.at) / 1000).toFixed(0)} s`);
    SECTION = { name, at: now };
    suite(name);
};
const NOW = filesOf('now');
const OLD = filesOf('base');
const git = args => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const j = value => JSON.stringify(value);

{
    let sha = '';
    try { sha = git(['rev-parse', '--verify', '--quiet', `${BASE}^{commit}`]).trim(); } catch (error) { sha = ''; }
    given('v204 (6ab193d) is in this repository', sha === BASE, sha);
    given('and its pay sheet does not share the walks', !/reportShareLedger/.test(OLD['js/ui/reports.js']));
    given('while this build\'s does', /function reportShareLedger\(/.test(NOW['js/ui/reports.js']));
}

// ---------------------------------------------------------------- the records
//
// (a) tests/reports.speed.test.mjs's eight seeded records, the same seeds and the same
// writers: both pay cycles, closes whole, half and nothing, repayments, men who stopped, and
// on two of them a man with a debt and no daily rate.
const SEEDED_TODAY = '2026-09-22';
const ANCHOR = '2026-08-07';
function seeded(seed, noRate) {
    const rand = mulberry(seed);
    const pick = list => list[Math.floor(rand() * list.length)];
    const first = makeDevice({ deviceId: 'd_office', flags: OPEN });
    first.setToday(SEEDED_TODAY);
    const schedule = first.State.schedule;
    schedule.places = [{ id: 'p_x', name: 'חיפה', active: true }];
    schedule.workers = [];
    const man = (id, name, extra = {}) => schedule.workers.push(Object.assign({ id, name, active: true, dailyRate: 610, hourlyRate: 0 }, extra));
    const work = (id, dates, rate) => dates.forEach(date => first.call('assignPlace', schedule, date, id, 'actual', 'p_x', rate || 'normal'));
    const give = (id, date, amount) => first.call('addAdvance', schedule, id, date, amount, '');
    const men = [];
    const crew = 3 + Math.floor(rand() * 3);
    for (let n = 1; n <= crew; n += 1) {
        const id = `w_${n}`;
        const weekly = rand() < 0.5;
        const stops = rand() < 0.25 ? addDays(SEEDED_TODAY, -Math.floor(10 + rand() * 30)) : null;
        man(id, `עובד ${seed}-${n}`, Object.assign({ dailyRate: pick([380, 450, 610]), hourlyRate: pick([0, 0, 45]),
            active: rand() > 0.15 }, weekly ? { payCycles: `${ANCHOR}=weekly` } : {}));
        const dates = [];
        for (let date = ANCHOR; date <= SEEDED_TODAY; date = addDays(date, 1)) {
            if (stops && date >= stops) break;
            if (rand() < 0.6) dates.push(date);
        }
        work(id, dates.filter(() => rand() < 0.85));
        work(id, dates.filter(() => rand() < 0.08), 'double');
        const count = Math.floor(rand() * 3);
        for (let k = 0; k < count; k += 1) give(id, addDays(SEEDED_TODAY, -Math.floor(rand() * 45)), pick([200, 500, 1500, 5000, 250.5]));
        men.push(id);
    }
    if (noRate) {
        man('w_nr', `בלי שכר ${seed}`, { dailyRate: 0 });
        work('w_nr', [addDays(SEEDED_TODAY, -9), addDays(SEEDED_TODAY, -8), addDays(SEEDED_TODAY, -2)]);
        give('w_nr', addDays(SEEDED_TODAY, -8), 1000);
    }
    first.State.save({ silent: true });
    const device = openDevice(first.dump(), { files: NOW, today: SEEDED_TODAY });
    const S = () => device.State.schedule;
    const facts = { closes: 0, repaid: 0 };
    const plan = device.call('planCarryMigration', S());
    if (plan.needed) device.State.commit(device.call('recordCarryApproval', S(), plan, '2026-09-01T09:00:00.000Z', 'd_person'));
    men.forEach(id => {
        if (rand() < 0.3) return;
        const worker = S().workers.filter(one => one.id === id)[0];
        const mine = device.call('advancesFor', S(), id, '0000-01-01', '9999-12-31');
        if (!mine.length) return;
        if (rand() < 0.4) {
            const of = pick(mine);
            const room = device.call('advanceOutstanding', S(), of.id).left;
            const sum = Math.min(room, pick([100, 200, 500]));
            if (sum > 0 && device.run(`saveFinancialAction(() => recordAdvanceRepaid(State.schedule, ${j(of.id)}, ${sum}, ${j(of.date)}, '', '2026-09-22T08:00:00.000Z', 'd_office', 'cash'))`) === true) facts.repaid += 1;
        }
        const upTo = Math.floor(rand() * 4);
        let period = device.call('periodRangeFor', worker, mine[0].date);
        for (let n = 0; n < upTo && period.to < SEEDED_TODAY; n += 1) {
            const proposed = device.call('advanceAccount', S(), id, period.from, period.to).deducted;
            const deduction = Math.floor(proposed * pick([0, 0.5, 1]));
            if (device.run(`speedClose(${j([[id, period.from, period.to, deduction]])}, '2026-09-22T09:${String(10 + facts.closes % 50)}:00.000Z')`) === true) facts.closes += 1;
            period = device.call('periodRangeFor', worker, addDays(period.to, 1));
        }
    });
    return { disk: device.dump(), men: S().workers.map(worker => worker.id), facts, today: SEEDED_TODAY };
}

// (b) THE TWO FIXTURES. The owner's over-settled advance (v201, tests/overpaidfix.test.mjs):
// 2,200 handed over, 2,200 handed back, 2,200 taken off a closed wage and the advance reversed
// at its level. And a close refused out of order (v198, tests/closeorder.test.mjs): 2,000
// handed over in a period still open, the next one ended - its closing box says why it may
// not be closed.
function overpaidFixture() {
    const builder = makeDevice({ flags: OPEN });
    const M = name => builder.global(name);
    const record = {
        schemaVersion: 2,
        workers: [{ id: 'w_s', name: 'סאמר', dailyRate: 550, hourlyRate: 0, active: true }],
        places: [{ id: 'p_x', name: 'אתר מערב', active: true }],
        days: {}, vehicles: [], advances: {},
        ledger: { advances: {}, unreadable: {}, migrations: { cm_carry: { id: 'cm_carry', kind: 'carry', rows: 0, at: '', by: 'd' } } }
    };
    workdays('2026-10-16', '2026-11-15').forEach(date => {
        record.days[date] = { plan: {}, actual: { w_s: { entries: [{ placeId: 'p_x' }], rates: { daily: 550, hourly: 0 } } } };
    });
    const a1 = M('recordNewAdvance')(record, 'w_s', '2026-10-23', 2200, '', '2026-10-23T07:00:00.000Z', 'd_owner', 'cash')[0].value.id;
    given('the fixture\'s repayment', Boolean(M('recordAdvanceRepaid')(record, a1, 2200, '2026-11-10', '', '2026-11-10T15:00:00.000Z', 'd_owner', 'cash')));
    given('the fixture\'s close', M('closePeriodChanges')(record, 'w_s', '2026-10-16', '2026-10-29', '2026-11-11T10:00:00.000Z', 'd_owner', 2200).length > 0);
    given('the fixture\'s reversal', Boolean(M('recordAdvanceReversed')(record, a1, 2200, '2026-10-23', 'העובד החזיר', '2026-11-12T10:00:00.000Z', 'd_owner')));
    return { disk: { 'scheduleData:v2': JSON.stringify(record) }, men: ['w_s'], today: '2026-11-16' };
}
function orderFixture() {
    const record = {
        schemaVersion: 2,
        workers: [{ id: 'w_1', name: 'ראמי', dailyRate: 610, hourlyRate: 0, active: true }],
        places: [{ id: 'p_1', name: 'אתר צפון', active: true }],
        days: {}, vehicles: [], advances: {},
        ledger: { advances: {}, unreadable: {}, migrations: { cm_carry: { id: 'cm_carry', kind: 'carry', rows: 0, at: '', by: 'd' } } }
    };
    ['2026-08-07'].concat(workdays('2026-08-21', '2026-09-03')).forEach(date => {
        record.days[date] = { plan: {}, actual: { w_1: { entries: [{ placeId: 'p_1' }], rates: { daily: 610, hourly: 0 } } } };
    });
    record.advances.adv_1 = { id: 'adv_1', workerId: 'w_1', date: '2026-08-07', amount: 2000, note: '' };
    record.ledger.advances.le_mig_adv_1 = { id: 'le_mig_adv_1', advanceId: 'adv_1', kind: 'given', workerId: 'w_1',
        date: '2026-08-07', amount: 2000, note: '', at: '2026-08-07T07:00:00.000Z', by: 'd' };
    return { disk: { 'scheduleData:v2': JSON.stringify(record) }, men: ['w_1'], today: '2026-09-04' };
}

const READINGS = [
    ['the gates shut', SHUT, false],
    ['the gates open', OPEN, false],
    ['the gates open, nobody approved', OPEN, true]
];

// ---------------------------------------------------------------- 11. the source
{
    section('11. the source: nothing of the model, the sync, the state or the store; the key and its readers');

    let untouched = true;
    try { git(['diff', '--quiet', BASE, '--', 'js/model', 'js/sync', 'js/state.js', 'js/store.js', 'js/recovery.js', 'firestore.rules', 'functions']); }
    catch (error) { untouched = false; }
    check('no file of js/model, js/sync, js/state.js, js/store.js, js/recovery.js, firestore.rules or functions differs from 6ab193d', untouched);
    let weekly = true;
    try { git(['diff', '--quiet', BASE, '--', 'js/ui/weeklyclose.js']); } catch (error) { weekly = false; }
    check('js/ui/weeklyclose.js is 6ab193d\'s', weekly);
    same('every other file a phone here loads is 6ab193d\'s bytes, so the v204 side IS v204', baseDiffers(), []);

    const reset = git(['diff', '-U0', BASE, '--', 'js/ui/advancereset.js']).split('\n').filter(line => /^[-+][^-+]/.test(line));
    same('js/ui/advancereset.js differs from 6ab193d\'s in exactly one line', [reset.length, reset[0] && reset[0][0], reset[1] && reset[1][0]], [2, '-', '+']);
    check('and it is advanceResetAfter\'s board, through owesReadNow()',
        reset.length === 2 && /const board = owesRead\(State\.schedule, todayStr\(\)\);/.test(reset[0])
        && /const board = typeof owesReadNow === 'function' \? owesReadNow\(\) : owesRead\(State\.schedule, todayStr\(\)\);/.test(reset[1]));
    const afterAt = NOW['js/ui/advancereset.js'].indexOf('function advanceResetAfter(');
    check('inside advanceResetAfter', afterAt !== -1 && NOW['js/ui/advancereset.js'].indexOf('owesReadNow()', afterAt)
        < NOW['js/ui/advancereset.js'].indexOf('\n}\n', afterAt));

    const js = [];
    const walk = dir => readdirSync(join(ROOT, dir), { withFileTypes: true }).forEach(entry => {
        if (entry.isDirectory()) walk(`${dir}/${entry.name}`);
        else if (entry.name.endsWith('.js')) js.push(`${dir}/${entry.name}`);
    });
    walk('js');
    const callers = [];
    js.forEach(file => readFileSync(join(ROOT, file), 'utf8').split('\n').forEach((line, at) => {
        if (/currentAdvances\(/.test(line) && !/^\s*\/\//.test(line) && !/function currentAdvances\(/.test(line)) callers.push(`${file}:${at + 1}`);
    }));
    same('currentAdvances - the one function that writes into a fold - has no caller in js/, so a shared fold is written by nobody', callers, []);

    const REPORTS = NOW['js/ui/reports.js'];
    const body = (text, name) => { const at = text.indexOf(`function ${name}(`); return text.slice(at, text.indexOf('\n}\n', at)); };
    const share = body(REPORTS, 'reportShareLedger');
    const wrappers = [...share.matchAll(/wrap\.(\w+) = function \(([^)]*)\) \{\n\s*([^\n]*)/g)].map(match => [match[1], match[3]]);
    same('S1 wraps the seven readers and the appender, and nothing else', wrappers.map(one => one[0]).sort(),
        SEVEN.concat(['appendLedgerEntry']).sort());
    same('each of the seven tests `asked !== schedule` first', wrappers.filter(one => one[0] !== 'appendLedgerEntry')
        .filter(one => !/^if \(asked !== schedule\) return real\.\w+\.apply\(this, arguments\);$/.test(one[1].trim())).map(one => one[0]), []);
    const key = body(REPORTS, 'reportSharedKey').replace(/\/\/[^\n]*/g, '');
    check('the kept key is today, the flags and the record as text - and names no Store and no tick',
        /todayStr\(\)/.test(key) && /JSON\.stringify\(FARKAD_FLAGS\)/.test(key) && /JSON\.stringify\(schedule\)/.test(key)
        && !/Store|tick/.test(key));
    same('reportGateKey\'s body is 6ab193d\'s', body(REPORTS, 'reportGateKey'), body(OLD['js/ui/reports.js'], 'reportGateKey'));

    // The names js/model feature-detects, by the contract's own grep. A name that is the
    // parameter of the function it is asked in is not a reader on the page, and is said.
    const detected = new Map();
    readdirSync(join(ROOT, 'js/model')).filter(file => file.endsWith('.js')).forEach(file => {
        const text = readFileSync(join(ROOT, 'js/model', file), 'utf8');
        [...text.matchAll(/typeof ([A-Za-z_]+) [!=]==? 'function'/g)].forEach(match => {
            const before = text.slice(0, match.index);
            const head = [...before.matchAll(/function \w+\(([^)]*)\)/g)].pop();
            const parameter = head && head[1].split(',').map(one => one.trim()).indexOf(match[1]) !== -1;
            if (!detected.has(match[1])) detected.set(match[1], parameter);
            else if (!parameter) detected.set(match[1], false);
        });
    });
    const DEPENDS = JSON.parse(phone(orderFixture().disk, NOW, { today: '2026-09-04' }).run('JSON.stringify(REPORT_SHARED_DEPENDS)'));
    const missing = [...detected.keys()].filter(name => !detected.get(name) && DEPENDS.indexOf(name) === -1);
    same('REPORT_SHARED_DEPENDS holds every name js/model feature-detects', missing, []);
    same('the names that are a parameter of their own function, and so not on the list',
        [...detected.keys()].filter(name => detected.get(name)).sort(), ['skip']);
    check('and the seven, the appender and v196\'s three', SEVEN.concat(['appendLedgerEntry'], V196).every(name => DEPENDS.indexOf(name) !== -1));

    // js/model reads no Store, no clock and nothing of the sync: what makes a key with no tick
    // in it sound. `new Date(` there is only ever a date built from given parts.
    const model = readdirSync(join(ROOT, 'js/model')).filter(file => file.endsWith('.js'))
        .map(file => readFileSync(join(ROOT, 'js/model', file), 'utf8').replace(/\/\/[^\n]*/g, '')).join('\n');
    check('js/model names no Store., localStorage, FarkadSync, Date.now(, new Date() or todayStr(',
        !/Store\.|localStorage|FarkadSync|Date\.now\(|new Date\(\s*\)|todayStr\(/.test(model));
    same('its one `new Date(` is built from the parts it is handed', (model.match(/new Date\([^)]*\)?/g) || []), ['new Date(Date.UTC(year, month - 1, day)']);
}

// ---------------------------------------------------------------- 1. v204's bytes, cold and warm
const tally = { records: 0, readings: 0, compared: 0, wrong: [], threw: [], dirty: [], writes: 0, diskMoved: [], kept: 0, states: {},
    flat: { sheets: 0, rows: 0, bad: [] }, later: [] };
const MEDIUM = { without: mediumDisk(), with: mediumDisk({ closes: true }) };
const SEEDED = [1, 2, 3, 4, 5, 6, 7, 8].map(seed => [seed, seeded(seed, seed % 4 === 0)]);
{
    section('1. every way in is v204\'s bytes - cold, again, and the whole list again');

    const records = SEEDED.map(([seed, record]) => [`seed ${seed}`, record, {}]);
    records.push(['the over-settled advance', overpaidFixture(), {}]);
    records.push(['the close refused out of order', orderFixture(), {}]);
    // The medium season against v204 is tests/speed.season.test.mjs's (the contract's rule for
    // this suite running longer than tests/reports.speed.test.mjs, measured: 11.2 minutes
    // against 2.9 right after it on the same machine).
    for (const [name, record, options] of records) {
        tally.records += 1;
        for (const [reading, flags, unapproved] of READINGS) {
            const old = phone(record.disk, OLD, { flags, today: record.today, unapproved });
            const now = phone(record.disk, NOW, { flags, today: record.today, unapproved });
            const state = `${reading}: ${now.call('carryReportingEnabled', now.State.schedule) ? 'read the new way' : 'read the old way'}`;
            tally.states[state] = (tally.states[state] || 0) + 1;
            compareAll(`${name}, ${reading}`, old, now, waysOf(now, record.men, options), tally);
            tally.readings += 1;
        }
    }
    given('the corpus reads both ways', Object.keys(tally.states).some(key => /new way/.test(key))
        && Object.keys(tally.states).some(key => /shut: read the old way/.test(key))
        && Object.keys(tally.states).some(key => /nobody approved: read the old way/.test(key)), j(tally.states));
    check(`${tally.records} records x ${READINGS.length} readings, ${tally.compared} readings of a screen (each way in cold, again, and the list again): every one v204's bytes`,
        tally.wrong.length === 0, tally.wrong.slice(0, 6).join(' | '));
    console.log(`        (${j(tally.states)})`);
    same('every way in ended as v204\'s did, and none of v204\'s threw', tally.threw, []);
    same('5. after every way in, every reader is the one it was and no reading is left open', tally.dirty, []);
    same('10. not one write at any door during any of them: commit, commitMany, commitRoster, save, persist, an append to the record, Store.set/setVerified/remove', tally.writes, 0);
    same('10. and the whole disk byte for byte across all of them', tally.diskMoved, []);
    check(`S3: a memo was kept at the end of ${tally.kept} of ${tally.readings} sequences (it is used, criterion 4)`, tally.kept > tally.readings / 2, String(tally.kept));
    console.log('        (the medium season, both records, against v204: tests/speed.season.test.mjs)');
    // A later track's row on «מקדמות» (payday's, once merged): taken out of the comparison and
    // counted - none on this branch, one per board drawn once a LATER_SCREENS file draws it.
    const later = tally.later.filter(([, one]) => one.kids !== (one.drawing ? one.boards : 0) || one.rows !== one.kids);
    same(`the rows later tracks add to «מקדמות», taken out and counted: ${tally.later.reduce((sum, [, one]) => sum + one.kids, 0)} on ${tally.later.reduce((sum, [, one]) => sum + one.boards, 0)} boards drawn`,
        later.map(([label, one]) => `${label}: ${j(one)}`), []);
    check('and the boards were drawn to count them on', tally.later.reduce((sum, [, one]) => sum + one.boards, 0) > 0);
}

// ---------------------------------------------------------------- 1. «איפוס מקדמות»'s step 3
{
    section('1. «איפוס מקדמות»\'s step 3: the board read after a real write is v204\'s');

    // On the seeded records (the medium season's is tests/speed.season.test.mjs's): every one
    // where v204's reset writes something.
    let tried = 0;
    let done = 0;
    for (const [seed, record] of SEEDED) {
        const old = resetStep(record, OLD);
        if (!(old.men > 0 && old.done > 0)) continue;
        tried += 1;
        const now = resetStep(record, NOW);
        done += now.done;
        same(`seed ${seed}: the result and the names it says still owe are v204's (${old.done} of ${old.men} men reset)`,
            [now.done, now.failure, now.result], [old.done, old.failure, old.result]);
        same(`seed ${seed}: 10. reading it writes nothing, and 12. asks the gate nothing on an approved record`,
            [now.writes, now.questions, now.plans], [0, 0, 0]);
    }
    check(`records where v204's reset wrote something: ${tried}, men reset: ${done}`, tried >= 2 && done > 0);
}

// ---------------------------------------------------------------- 2. the gate's plan
{
    section('2. the gate\'s own plan, asked inside a reading, is the bare plan');

    for (const [name, record] of [['the medium season', MEDIUM.without], ['the medium season, closed in order', MEDIUM.with]]) {
        const device = phone(record.disk, NOW);
        device.run('State.schedule.ledger.migrations = {}; 1');
        const inside = device.run('REPORT_SHARED_KEPT = null; JSON.stringify(reportReadOnce(() => planCarryMigration(State.schedule)))');
        const bare = device.run('JSON.stringify(planCarryMigration(State.schedule))');
        same(`${name}: JSON for JSON`, inside, bare);
        check(`${name}: and it is a plan of something`, JSON.parse(bare).rows !== undefined, bare.slice(0, 80));
    }
}

// ---------------------------------------------------------------- 4, 8, 12. the counts
//
// One cold reading of each way in on the medium season, counted: every reader once per
// question, the key twice at most, the gate as v196 left it. Then the same way in again on
// the unmoved record: no walk at all, and a pay sheet only before its first question.
const COUNT_WAYS = (device, men) => waysOf(device, men, { ranges: [RANGE_NAMES[0]], manRanges: [RANGE_NAMES[0]], someMen: ['w_1', 'w_2'] });
{
    section('8. the counts, for every way in: each reader once per question, the key twice at most');

    const record = MEDIUM.with;
    const now = phone(record.disk, NOW);
    const old = phone(record.disk, OLD);
    const ways = COUNT_WAYS(now, record.men);
    const wrong = [];
    const printed = [];
    let monthChecked = 0;
    ways.forEach(([name, body]) => {
        now.run('REPORT_SHARED_KEPT = null; 1');
        const cold = counted(now, body);
        const c = cold.counted;
        const was = counted(old, body).counted;
        const of = fn => realCalls(c, [fn]);
        // Per READING: a way in that draws a page and then types into it, or presses one of its
        // buttons, is a reading for the page and one for each hand on it (fix round 1).
        const readings = readingsOf(c);
        const each = (test) => readings.every(reading => test(fn => realCalls({ calls: reading.calls }, [fn]), reading));
        const rules = [
            ['ledgerEntries once a reading', each(r => r('ledgerEntries').length <= 1)],
            ['foldLedger once a reading', each(r => r('foldLedger').length <= 1)],
            ['advanceHistory never (grouped from the entries)', of('advanceHistory').length === 0],
            ['advanceWalk once per (man, from, to, carriedIn) a reading', each(r => twice(r('advanceWalk')).length === 0)],
            ['advancePositionInto once per (man, from) a reading', each(r => twice(r('advancePositionInto')).length === 0)],
            ['overpaidAdvances once per man a reading', each(r => twice(r('overpaidAdvances')).length === 0)],
            ['advanceOutstanding once per advance a reading', each(r => twice(r('advanceOutstanding')).length === 0)],
            ['payrollReport once per range a reading', each(r => twice(r('payrollReport')).length === 0)],
            ['the key at most twice a reading', each((r, reading) => reading.keys <= 2)],
            // (fix round 1) a letter typed into «מקדמות»'s search and a figure typed into the
            // closing box were asked bare, every advance of every man again at each one
            ['every question of the seven asked inside a reading', c.bare.length === 0],
            ['12. the gate not asked on an approved record', c.questions === 0 && c.plans === 0]
        ];
        rules.filter(rule => !rule[1]).forEach(rule => wrong.push(`${name}: ${rule[0]} (${j({ keys: c.keys, readings: readings.length, bare: c.bare.length, q: c.questions, n: c.calls.length })})`));
        const asksSeven = SEVEN.some(fn => realCalls(c, [fn]).length > 0) || c.keys > 0;
        if (!asksSeven) {
            monthChecked += 1;
            same(`${name}: it asks none of the seven - and so asks exactly what v204 asks, and works out no key`,
                [c.keys, c.calls.slice().sort()], [0, was.calls.slice().sort()]);
        }
        // Every function the rules above count, v204's real calls beside this build's (the report's table).
        printed.push(`${name}: ${SEVEN.concat(['payrollReport']).map(fn => `${fn} ${realCalls(was, [fn]).length} -> ${of(fn).length}`).join(', ')}, keys ${c.keys}`);
    });
    same(`${ways.length} ways in on the medium season, each read cold: every rule of the count`, wrong, []);
    printed.forEach(line => console.log(`        v204 -> this build: ${line}`));
    check('the month\'s summary is among them, asking none of the seven', monthChecked > 0, String(monthChecked));
    const draw = ways.filter(([name]) => /«לפי עובד»/.test(name))[0];
    now.run('REPORT_SHARED_KEPT = null; 1');
    const one = counted(now, draw[1]).counted;
    const v204 = counted(old, draw[1]).counted;
    check(`one draw of «לפי עובד»: v204 listed the ledger ${realCalls(v204, ['ledgerEntries']).length} times, this build ${realCalls(one, ['ledgerEntries']).length}`,
        realCalls(one, ['ledgerEntries']).length === 1 && realCalls(v204, ['ledgerEntries']).length >= 50);
}
{
    section('4. a way in repeated on an unmoved record: no walk, no fold, and a pay sheet only before its first question');

    const record = MEDIUM.with;
    const now = phone(record.disk, NOW);
    const ways = COUNT_WAYS(now, record.men);
    const wrong = [];
    const sheets = [];
    const keysTaken = [];
    ways.forEach(([name, body]) => {
        now.run('REPORT_SHARED_KEPT = null; 1');
        const first = counted(now, body);
        const again = counted(now, body);
        const c = again.counted;
        if (again.out !== first.out) wrong.push(`${name}: not the same bytes`);
        const walks = realCalls(c, SEVEN);
        if (walks.length) wrong.push(`${name}: ${walks.length} real calls of the seven (${walks.slice(0, 2).join(', ')})`);
        // Per reading: a sheet worked out after the reading's first key is a sheet S4 did not keep.
        readingsOf(c).forEach((reading, at) => {
            const events = [];
            let open = false;
            let seen = -1;
            c.events.forEach(event => {
                if (event === 'open') { seen += 1; open = seen === at; return; }
                if (event === 'close') { open = false; return; }
                if (open) events.push(event);
            });
            const firstKey = events.indexOf('key');
            const late = events.filter((event, n) => event === 'payrollReport' && firstKey !== -1 && n > firstKey);
            if (late.length) wrong.push(`${name}: reading ${at + 1}: ${late.length} pay sheets worked out after its first question`);
            // (fix round 1) ONE copy of the record: a reading that adopted the kept memo and worked
            // out nothing new is put back without the second key.
            if (reading.keys > 1) wrong.push(`${name}: reading ${at + 1} worked out nothing new and took ${reading.keys} copies of the record`);
        });
        sheets.push(`${name.replace(/^.*: /, '')} ${realCalls(c, ['payrollReport']).length}`);
        keysTaken.push(c.keys);
    });
    same(`${ways.length} ways in, each twice on the unmoved record: the second asks the model nothing it already answered, and each of its readings takes ONE copy of the record`, wrong, []);
    console.log(`        (pay sheets worked out by the second reading, all before its first question: ${sheets.join(', ')})`);
    check(`and those copies were taken: ${keysTaken.reduce((sum, n) => sum + n, 0)} keys over the ${ways.length} repeats`, keysTaken.filter(n => n > 0).length > ways.length / 2);
}

// ---------------------------------------------------------------- 3. fresh after every kind of write
{
    section('3. after every kind of write, every way in is the record\'s: the same as afresh');
    const out = await writesScenario(MEDIUM.with, { afresh: true, v204: false }, given);
    same(`every way in, after each of ${out.steps} kinds of write: as the same way drawn afresh`, out.wrongs, []);
    console.log(`        (the seven, called by the first reading after each: ${out.realAfter.join(', ')})`);
    console.log('        (the same scenario against v204\'s files: tests/speed.season.test.mjs - the medium season\'s v204 side)');
}

// ---------------------------------------------------------------- 5. scope hygiene, through every throw
{
    section('5. through every throw, every reader is put back, no reading is left open and nothing is kept from a failed key');

    const record = MEDIUM.with;
    const ways = (device) => FRESH(device, record.men);
    // The key plants say when they throw (SPEED_KEY_THREW), so a memo can be held to it: a way in
    // whose key failed keeps nothing. "At the close" is a reading's SECOND key - since fix round
    // 1 a reading that adopted and worked out nothing takes no second one, and keeps.
    const plants = [
        ['a reader that throws inside the reading', 'payrollRows = () => { throw new Error("planted"); }; 1'],
        ['todayStr that throws', 'todayStr = () => { throw new Error("planted today"); }; 1'],
        ['the kept key that throws at the first question', 'reportSharedKey = () => { SPEED_KEY_THREW = true; throw new Error("planted key"); }; 1'],
        ['the kept key that throws at the close', `(function () { const real = reportSharedKey; const read = reportReadOnce; let asked = 0;
            reportReadOnce = function () { if (!reportReading()) asked = 0; return read.apply(this, arguments); };
            reportSharedKey = function () { asked += 1; if (asked === 2) { SPEED_KEY_THREW = true; throw new Error("planted close"); } return real.apply(this, arguments); }; })(); 1`]
    ];
    for (const [name, plant] of plants) {
        const now = phone(record.disk, NOW);
        const old = phone(record.disk, OLD);
        const wrong = [];
        const list = ways(old);
        // A memo kept beforehand, so a failed key has something it must not hand on.
        now.way(list[0][1]);
        given(`${name}: a memo is kept beforehand`, now.run('REPORT_SHARED_KEPT !== null'));
        now.run('var SPEED_KEY_THREW = false; 1');
        now.run(plant);
        if (!/reportSharedKey/.test(plant)) old.run(plant);
        let threw = 0;
        list.forEach(([way, body]) => {
            now.run('SPEED_KEY_THREW = false; 1');
            const mine = outcome(now, body);
            const theirs = outcome(old, body);
            if (mine !== theirs) wrong.push(`${way}: ${mine.slice(0, 60)} / ${theirs.slice(0, 60)}`);
            if (!now.run('speedClean()')) wrong.push(`${way}: a reader left swapped or a reading open`);
            if (now.run('SPEED_KEY_THREW')) {
                threw += 1;
                if (!now.run('REPORT_SHARED_KEPT === null')) wrong.push(`${way}: a memo kept from a reading whose key failed`);
            }
        });
        same(`${name}: every way in ends as v204's does (the same bytes, or the same throw), and leaves the page clean`, wrong, []);
        if (/key/.test(name)) check(`${name}: and it did throw, in ${threw} of ${list.length} ways in`, threw > list.length / 2, String(threw));
    }
}

// ---------------------------------------------------------------- 6. another record
{
    section('6. inside a reading, another schedule is asked of the real functions, every time');

    const now = phone(MEDIUM.with.disk, NOW);
    const out = JSON.parse(now.run(`(function () {
        const record = State.schedule;
        const json = JSON.parse(JSON.stringify(record));
        const shallow = Object.assign({}, record, { ledger: Object.assign({}, record.ledger, { advances: Object.assign({}, record.ledger.advances) }) });
        const advance = Object.keys(record.advances)[0];
        const span = periodRangeFor(record.workers[1], todayStr());
        const asks = {
            ledgerEntries: s => [s], foldLedger: s => [s], advanceHistory: s => [s, advance], overpaidAdvances: s => [s, 'w_2'],
            advanceOutstanding: s => [s, advance], advanceWalk: s => [s, 'w_2', span.from, span.to, 0],
            advancePositionInto: s => [s, 'w_2', span.from], payrollReport: s => [s, span.from, span.to]
        };
        const result = {};
        reportReadOnce(() => {
            foldLedger(record);
            Object.keys(asks).forEach(name => {
                [['a JSON copy', json], ['a copy with a ledger map of its own', shallow]].forEach(([kind, copy]) => {
                    SPEED_COUNT = { calls: [], events: [], keys: 0, questions: 0, plans: 0 };
                    const one = globalThis[name].apply(null, asks[name](copy));
                    const two = globalThis[name].apply(null, asks[name](copy));
                    const calls = SPEED_COUNT.calls.filter(call => call.indexOf('copy:' + name + '(') === 0);
                    SPEED_COUNT = null;
                    result[name + ', ' + kind] = { real: calls.length, distinct: typeof one !== 'object' || one === null || one !== two,
                        equal: JSON.stringify(one) === JSON.stringify(SPEED_REAL[name].apply(null, asks[name](copy))) && JSON.stringify(one) === JSON.stringify(two) };
                });
            });
        });
        return JSON.stringify(result);
    })()`));
    const bad = Object.keys(out).filter(key => !(out[key].real === 2 && out[key].distinct && out[key].equal));
    same(`${Object.keys(out).length} questions of another record, each asked twice: two real calls, two answers, each the real function's`, bad.map(key => `${key} ${j(out[key])}`), []);
}

// ---------------------------------------------------------------- 7. an absent reader
{
    section('7. a reader that is absent stays absent - cold, and warm');

    const record = MEDIUM.with;
    for (const name of ['advanceHistory', 'foldLedger', 'ledgerEntries']) {
        const now = phone(record.disk, NOW);
        const old = phone(record.disk, OLD);
        const list = FRESH(old, record.men);
        // warm: a memo of every reader kept first - both phones read the same way first, and
        // the board v204 keeps too (OWES_KEPT, keyed on the record and not on the readers) is
        // let go on both, so what is under test is S3's memo alone.
        now.way(list[0][1]);
        old.way(list[0][1]);
        given('a memo with every reader present is kept', now.run('REPORT_SHARED_KEPT !== null'));
        now.run(`var SPEED_HELD = ${name}; ${name} = undefined; OWES_KEPT = null; 1`);
        old.run(`${name} = undefined; OWES_KEPT = null; 1`);
        same(`${name} taken away: inside the reading it is still absent`, now.run(`reportReadOnce(() => typeof ${name})`), 'undefined');
        const wrong = [];
        list.forEach(([way, body]) => {
            const mine = outcome(now, body);
            const theirs = outcome(old, body);
            if (mine !== theirs) wrong.push(way);
        });
        same(`${name} taken away: the memo kept with it is refused, and every way in is v204's without it`, wrong, []);
        now.run('REPORT_SHARED_KEPT = null; 1');
        const cold = list.filter(([way, body]) => outcome(now, body) !== outcome(old, body)).map(([way]) => way);
        same(`${name} taken away, cold: every way in is v204's without it`, cold, []);
        now.run(`${name} = SPEED_HELD; 1`);
    }

    // The critic's fixture: 3,000 handed over, 1,000 back.
    const first = makeDevice({ deviceId: 'd_office', flags: OPEN });
    first.setToday(TODAY);
    const s = first.State.schedule;
    s.places = [{ id: 'p_1', name: 'אתר 1', active: true }];
    s.workers = [{ id: 'w_01', name: 'עובד א', active: true, dailyRate: 400, hourlyRate: 0 }];
    workdays('2026-10-01', TODAY).forEach(date => first.call('assignPlace', s, date, 'w_01', 'actual', 'p_1', 'normal'));
    first.call('addAdvance', s, 'w_01', '2026-11-01', 3000, '');
    first.State.save({ silent: true });
    const d = phone(first.dump(), NOW);
    d.State.commit(d.call('recordCarryApproval', d.State.schedule, d.call('planCarryMigration', d.State.schedule), '2026-10-01T09:00:00.000Z', 'd_person'));
    const advance = Object.keys(d.State.schedule.advances)[0];
    given('1,000 handed back', d.run(`saveFinancialAction(() => recordAdvanceRepaid(State.schedule, ${j(advance)}, 1000, '2026-11-10', '', '2026-11-10T08:00:00.000Z', 'd_office', 'cash'))`) === true);
    const balance = () => JSON.parse(d.run('reportReadOnce(() => JSON.stringify(openAdvanceBalance(State.schedule, "w_01")))')).total;
    const read = [balance()];
    d.run('var SPEED_HISTORY = advanceHistory; advanceHistory = undefined; 1');
    read.push(balance(), balance());
    d.run('advanceHistory = SPEED_HISTORY; 1');
    read.push(balance(), balance());
    same('every reader, then advanceHistory taken away, then put back: 2,000 / 3,000 / 3,000 / 2,000 / 2,000 - as the model says each time', read, [2000, 3000, 3000, 2000, 2000]);
    // tests/smoke.mjs's case, in Node: a man's days with advanceHistory taken away - the dialog
    // still opens, the fold simply absent - both ways.
    const smoke = phone(MEDIUM.with.disk, NOW);
    const smokeOld = phone(MEDIUM.with.disk, OLD);
    smoke.way(MAN_WAYS[1][1]('w_1'));
    const days = MAN_WAYS[1][1]('w_1');
    smoke.run('advanceHistory = undefined; 1');
    smokeOld.run('advanceHistory = undefined; 1');
    same('a man\'s days with advanceHistory taken away, after a reading with it kept: as v204 draws them', outcome(smoke, days), outcome(smokeOld, days));
    smoke.run('REPORT_SHARED_KEPT = null; 1');
    same('and cold', outcome(smoke, days), outcome(smokeOld, days));
}

// ---------------------------------------------------------------- 9. appends
{
    section('9. appends inside a reading: a copy of its own keeps every answer; anything that can reach the record forgets');

    const record = MEDIUM.with;
    const entry = `{ id: 'le_speed_probe', advanceId: 'a_speed_probe', kind: 'given', workerId: 'w_1', date: '${TODAY}', amount: 100,
        note: '', at: '${AT}', by: 'd_speed' }`;
    const cases = [
        ['(a) a copy with a ledger object and a ledger map of its own', `Object.assign({}, State.schedule, { ledger: Object.assign({}, State.schedule.ledger, { advances: Object.assign({}, State.schedule.ledger.advances) }) })`, true, true],
        ['(b) a copy that shares the record\'s ledger map', `Object.assign({}, State.schedule, { ledger: Object.assign({}, State.schedule.ledger) })`, false, true],
        ['(c) a copy that shares its ledger object', 'Object.assign({}, State.schedule)', false, true],
        ['(d) the record itself', 'State.schedule', false, true],
        ['(e) one that throws', `Object.assign({}, State.schedule, { ledger: Object.assign({}, State.schedule.ledger, { advances: Object.assign({}, State.schedule.ledger.advances) }) })`, false, false]
    ];
    for (const [name, target, keeps, valid] of cases) {
        const now = phone(record.disk, NOW);
        const out = JSON.parse(now.run(`(function () {
            REPORT_SHARED_KEPT = null;
            let after = null; let threw = false;
            reportReadOnce(() => {
                foldLedger(State.schedule); advanceWalk(State.schedule, 'w_1', '2026-11-13', '2026-11-19', 0);
                const target = ${target};
                try { appendLedgerEntry(target, ${valid ? entry : 'null'}); } catch (error) { threw = true; }
                SPEED_COUNT = { calls: [], events: [], keys: 0, questions: 0, plans: 0 };
                foldLedger(State.schedule); ledgerEntries(State.schedule); advanceWalk(State.schedule, 'w_1', '2026-11-13', '2026-11-19', 0);
                after = SPEED_COUNT; SPEED_COUNT = null;
            });
            return JSON.stringify({ threw, real: after.calls.filter(call => call.indexOf('copy:') !== 0).length, kept: REPORT_SHARED_KEPT !== null });
        })()`));
        if (keeps) same(`${name}: every later answer for the record still the reading's (no real call), and the reading is kept`, [out.real, out.kept], [0, true]);
        else check(`${name}: every later answer is the real function's, and nothing of the reading is kept`, out.real >= 3 && out.kept === false, j(out));
        if (!valid) check('(it did throw)', out.threw === true);
    }
}

// ---------------------------------------------------------------- 12. the gate as before
{
    section('12. the gate: at most one question per reading, none on an approved record - every way in, «שים לב» after paint included');

    const wrong = [];
    for (const [name, unapproved] of [['approved', false], ['nobody approved', true]]) {
        const now = phone(MEDIUM.with.disk, NOW, { unapproved });
        FRESH(now, MEDIUM.with.men).concat([['«שים לב» read after paint', 'OWES_KEPT = null; return JSON.stringify(owesReadNow());']])
            .forEach(([way, body]) => {
                now.run('REPORT_SHARED_KEPT = null; REPORT_GATE_KEPT = null; 1');
                const c = counted(now, body).counted;
                if (c.questions > 1 || c.plans > 1 || (!unapproved && (c.questions || c.plans))) wrong.push(`${name}: ${way}: ${c.questions} questions, ${c.plans} plans`);
            });
    }
    same('every way in, approved and not', wrong, []);
}

// ---------------------------------------------------------------- 19. S4's copies
{
    section('19. a kept pay sheet is handed to a reading as rows of its own');

    const now = phone(MEDIUM.with.disk, NOW);
    const old = phone(MEDIUM.with.disk, OLD);
    const span = now.call('periodRangeFor', now.State.schedule.workers[1], TODAY);
    const ask = `payrollReport(State.schedule, ${j(span.from)}, ${j(span.to)})`;
    now.run(`REPORT_SHARED_KEPT = null; reportReadOnce(() => { foldLedger(State.schedule); ${ask}; }); 1`);
    given('a reading kept the sheet', now.run(`REPORT_SHARED_KEPT !== null && REPORT_SHARED_KEPT.sheets.has(${j(`${span.from}..${span.to}`)})`));
    const inside = JSON.parse(now.run(`JSON.stringify(reportReadOnce(() => {
        foldLedger(State.schedule);
        const rows = ${ask};
        rows[0].amount = -1; rows[0].speedPlanted = true;
        const again = ${ask};
        return [rows === again, again[0].amount, again[0].speedPlanted === true];
    }))`));
    same('within the reading that adopted it, a row written into is the row the next asker sees, as v196 hands a sheet (one array)', inside, [true, -1, true]);
    const next = now.run(`reportReadOnce(() => { foldLedger(State.schedule); return JSON.stringify(${ask}); })`);
    same('the next reading of the unmoved record is handed rows equal to the real function\'s, JSON for JSON', next, now.run(`JSON.stringify(SPEED_REAL.payrollReport(State.schedule, ${j(span.from)}, ${j(span.to)}))`));
    same('and its draw is v204\'s', outcome(now, PAGE_WAYS[0][1]), outcome(old, PAGE_WAYS[0][1]));
    same('two readings are handed two arrays', now.run(`(function () { const one = reportReadOnce(() => { foldLedger(State.schedule); return ${ask}; });
        const two = reportReadOnce(() => { foldLedger(State.schedule); return ${ask}; }); return one !== two && JSON.stringify(one) === JSON.stringify(two); })()`), true);

    // (fix round 1) AND A SHEET THE READING ITSELF WORKED OUT: what it puts aside is a copy
    // nobody was handed, so a reader writing into the rows it was handed - in the very reading
    // that priced them - cannot reach the next reading either. (Without the copy every check
    // above still passes: the review of v206, by a mutant.)
    now.run(`REPORT_SHARED_KEPT = null; reportReadOnce(() => {
        foldLedger(State.schedule);
        const rows = ${ask};
        rows[0].amount = -1; rows[0].speedPlanted = true;
    }); 1`);
    given('the reading that priced the sheet and wrote into it was kept, with the sheet', now.run(`REPORT_SHARED_KEPT !== null
        && REPORT_SHARED_KEPT.sheets.has(${j(`${span.from}..${span.to}`)})`));
    const handed = now.run(`reportReadOnce(() => { foldLedger(State.schedule); return JSON.stringify(${ask}); })`);
    same('a sheet worked out and written into in one reading: the next reading is handed the real function\'s rows, JSON for JSON',
        handed, now.run(`JSON.stringify(SPEED_REAL.payrollReport(State.schedule, ${j(span.from)}, ${j(span.to)}))`));
    check('(and the next reading was handed the kept sheet, not a sheet of its own)', now.run(`(function () {
        SPEED_COUNT = { calls: [], events: [], keys: 0, questions: 0, plans: 0, bare: [] };
        reportReadOnce(() => { foldLedger(State.schedule); ${ask}; });
        const sheets = SPEED_COUNT.calls.filter(call => call.indexOf('payrollReport(') === 0).length; SPEED_COUNT = null; return sheets === 0; })()`));
    same('and its draw is v204\'s, after it too', outcome(now, PAGE_WAYS[0][1]), outcome(old, PAGE_WAYS[0][1]));
}

// ---------------------------------------------------------------- 20. rows are flat
{
    section('20. every row of every pay sheet is flat - what S4\'s shallow copy relies on');

    // Every sheet the phones of criterion 1 worked out was held to it as it was worked out
    // (the instrument), and here every range of the seven and every period of every man of
    // both medium seasons besides.
    const flat = { sheets: tally.flat.sheets, rows: tally.flat.rows, bad: tally.flat.bad.slice() };
    for (const record of [MEDIUM.without, MEDIUM.with]) {
        const d = phone(record.disk, NOW);
        d.run(`(function () {
            ${j(RANGE_NAMES)}.forEach(name => { speedRange(name); payrollReport(State.schedule, REPORT_RANGE.from, REPORT_RANGE.to); });
            State.schedule.workers.forEach(worker => accountsBefore(State.schedule, worker.id, todayStr())
                .forEach(span => payrollReport(State.schedule, span.from, span.to)));
        })(); 1`);
        const one = JSON.parse(d.run('JSON.stringify(SPEED_FLAT)'));
        flat.sheets += one.sheets;
        flat.rows += one.rows;
        one.bad.forEach(field => flat.bad.push(field));
    }
    same(`${flat.sheets} pay sheets, ${flat.rows} rows: every field a string, a number, a boolean, null or undefined`, flat.bad, []);
    check('and there were sheets to read', flat.sheets > 100 && flat.rows > 500, `${flat.sheets} / ${flat.rows}`);
}

// ---------------------------------------------------------------- 21. one memo
{
    section('21. one memo at a time, dropped at the first question of a reading it cannot serve');

    const now = phone(MEDIUM.with.disk, NOW);
    const keep = () => now.way(FRESH(now, MEDIUM.with.men)[0][1]);
    const atFirst = `JSON.stringify(reportReadOnce(() => { foldLedger(State.schedule); return REPORT_SHARED_KEPT === null; }))`;
    keep();
    const kept = now.run('REPORT_SHARED_KEPT');
    given('a memo is kept', kept !== null);
    now.State.load();
    same('another schedule object (State.load): the kept memo is off the shelf by the end of the first question', JSON.parse(now.run(atFirst)), true);
    check('and the memo kept after it is the new object\'s', now.run('REPORT_SHARED_KEPT !== null && REPORT_SHARED_KEPT.schedule === State.schedule'));
    keep();
    now.run('State.schedule.workers[0].note = "speed moved"; 1');
    same('another key (the record moved in memory): dropped at the first question', JSON.parse(now.run(atFirst)), true);
    check('and the memo after it is of the record as it now reads', now.run('REPORT_SHARED_KEPT !== null && REPORT_SHARED_KEPT.key === reportSharedKey(State.schedule)'));
    now.run('delete State.schedule.workers[0].note; 1');
    keep();
    now.run('var SPEED_CLOSED = closedPeriods; closedPeriods = function () { return SPEED_CLOSED.apply(this, arguments); }; 1');
    same('other readers (closedPeriods replaced): dropped at the first question', JSON.parse(now.run(atFirst)), true);
    now.run('closedPeriods = SPEED_CLOSED; 1');
    keep();
    same('the same schedule, key and readers: adopted (off the shelf while the reading has it)', JSON.parse(now.run(atFirst)), true);
    check('and put back at its close', now.run('REPORT_SHARED_KEPT !== null && REPORT_SHARED_KEPT.schedule === State.schedule'));
    // A reading that asks none of the seven leaves the shelf as it was.
    const before = now.run('REPORT_SHARED_KEPT');
    now.way(`return JSON.stringify(monthSummaryFacts('${TODAY.slice(0, 7)}'));`);
    check('a reading that asks none of the seven («סיכום חודש») neither drops nor replaces it', now.run('REPORT_SHARED_KEPT') === before);
}

// ---------------------------------------------------------------- 22. a hand on a drawn page
//
// (fix round 1, the review of v206) What a person does once a page is drawn: opens a man from
// the list of «מקדמות», types a letter into its search, types a figure into his closing box
// and presses «הצג בדוח». The page was a reading; each of these was its own reading - or none:
// the letter and the figure were asked bare, every advance of every man again at each one, and
// a man's page paid two copies of the whole record for answers the board had kept.
{
    section('22. a hand on a drawn page: a man\'s page, a letter typed, a figure typed - each inside a reading, one copy of the record where nothing is new');

    const record = MEDIUM.with;
    const now = phone(record.disk, NOW);
    const old = phone(record.disk, OLD);
    // The page drawn on both phones; then the hand on it, counted on this one.
    const hand = (setup, body) => {
        now.way(setup); old.way(setup);
        const mine = counted(now, body);
        const theirs = outcome(old, body);
        return { c: mine.counted, same: (mine.error === null ? `ok:${mine.out}` : `threw:${mine.error}`) === theirs, error: mine.error };
    };
    const board = 'speedReset(); ADVANCE_SEARCH = ""; return speedAdvances(null);';

    const man = hand(board, 'return speedAdvances("w_1");');
    same('a man\'s page of «מקדמות» opened from the board, the record unmoved: v204\'s page, the seven asked nothing, ONE copy of the record',
        [man.same, realCalls(man.c, SEVEN).length, readingsOf(man.c).map(reading => reading.keys)], [true, 0, [1]]);

    const letter = hand(board, `const field = speedSearchField(); field.value = '1'; speedFire(field, 'input');
        const out = speedDrawn('advancesView'); ADVANCE_SEARCH = ''; return out;`);
    same('a letter typed into its search: v204\'s list, asked inside ONE reading, the seven asked nothing, one copy of the record',
        [letter.same, letter.c.bare.length, readingsOf(letter.c).map(reading => reading.keys), realCalls(letter.c, SEVEN).length], [true, 0, [1], 0]);
    const second = hand('ADVANCE_SEARCH = ""; return 1;', `const field = speedSearchField(); field.value = '12'; speedFire(field, 'input');
        const out = speedDrawn('advancesView'); ADVANCE_SEARCH = ''; return out;`);
    same('and the next letter the same', [second.same, second.c.bare.length, readingsOf(second.c).map(reading => reading.keys)], [true, 0, [1]]);

    // A man whose closing box has its field (his last finished period open, nothing in the way).
    const closable = record.men.filter(id => now.way(`speedReset(); return speedKeepRange(() => { openWorkerSettlement(${j(id)}); return speedBoxField() !== null; });`));
    given('a man whose closing box has a field to type into', closable.length > 0, j(closable));
    const id = closable[0];
    const box = `speedReset(); openWorkerSettlement(${j(id)}); return 1;`;
    const figure = hand(box, `return speedBoxPress(speedBoxField(), ['1', '0']);`);
    const readings = readingsOf(figure.c);
    same(`two figures typed into ${id}'s closing box and «הצג בדוח» pressed: what v204 shows and chooses, every question asked inside a reading - one for each figure, one for the press`,
        [figure.same, figure.c.bare.length, readings.length], [true, 0, 3]);
    check('each asking each question once, and the press - the last figure\'s own plan - working out nothing new: one copy of the record',
        readings.every(reading => twice(reading.calls.filter(call => call.indexOf('copy:') !== 0)).length === 0)
            && readings[2] && readings[2].keys === 1 && realCalls({ calls: readings[2].calls }, SEVEN).length === 0,
        j(readings.map(reading => [reading.keys, reading.calls.length])));
}

// ---------------------------------------------------------------- 23. the gate's plan
//
// (fix round 1, the review of v206) On a record nobody approved the gate's own question plans
// the migration inside the reading, and the plan walks a man with a debt and no daily rate four
// thousand fortnights ahead, a sheet each. Those sheets are shared inside the reading as v196
// shares one, and not kept: kept, they held some 50 MB after one draw of a season.
{
    section('23. a record nobody approved: the sheets the gate\'s own plan prices are not kept for the next reading');

    const [seed, record] = SEEDED.filter(([n]) => n % 4 === 0)[0];
    const now = phone(record.disk, NOW, { flags: OPEN, today: record.today, unapproved: true });
    const old = phone(record.disk, OLD, { flags: OPEN, today: record.today, unapproved: true });
    given(`seed ${seed}: a man with a debt and no daily rate, on a record nobody approved`, record.men.indexOf('w_nr') !== -1
        && now.run('reportReadOnce(() => carryReportingEnabled(State.schedule))') === false);
    now.run('REPORT_SHARED_KEPT = null; REPORT_GATE_KEPT = null; 1');
    const draw = counted(now, PAGE_WAYS[0][1]);
    given('the draw planned the migration, once', draw.counted.plans === 1, String(draw.counted.plans));
    const priced = realCalls(draw.counted, ['payrollReport']).length;
    const kept = now.run('REPORT_SHARED_KEPT === null ? -1 : REPORT_SHARED_KEPT.sheets.size');
    given(`the gate's plan priced the sheets of his fortnights inside the draw: ${priced}`, priced > 1000, String(priced));
    check(`and the reading kept ${kept} sheets: the ranges the draw itself read, none of the plan's`, kept >= 1 && kept <= 60, String(kept));
    same('the draw is v204\'s', `ok:${draw.out}`, outcome(old, PAGE_WAYS[0][1]));
    // A send's provenance key: the tick moves, the gate's kept answer with it, and the gate is asked
    // again - planned from the walks that were kept, which need no sheet.
    now.run('Store.set("farkad:prov:sent:advance:speed_plan", "1"); 1');
    old.run('Store.set("farkad:prov:sent:advance:speed_plan", "1"); 1');
    const again = counted(now, PAGE_WAYS[0][1]);
    same('the next draw, the tick moved and the record not: the gate planned again from what was kept - the seven asked nothing - and v204\'s bytes',
        [again.counted.plans, realCalls(again.counted, SEVEN).length, `ok:${again.out}` === outcome(old, PAGE_WAYS[0][1])], [1, 0, true]);
}

section('end');
const minutes = ((performance.now() - STARTED) / 60000).toFixed(1);
console.log(`\n        (tests/speed.test.mjs ran ${minutes} minutes on this machine; by section: ${TIMES.join(', ')})`);
report();
