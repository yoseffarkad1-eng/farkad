// v206, the speed track on SEASON-SIZED records: tests/speed.test.mjs's companion, in
// `npm run test:all` and not in `npm test` (it seeds three seasons and runs v204's own
// readings of them, which take seconds to minutes each).
//
//   node tests/speed.season.test.mjs
//
// The seasons are tests/speed.seed.mjs's: 40 men (16 weekly), 300 working days to Thursday
// 2026-11-19, six sites, Rima and יוסף גבס -
//   season-open     an advance every 14-28 days per man since the first day, nothing closed
//   season-closed   advances in the last 70 days, every period closed in order but a third
//                   of the men's last one
//   season-skipped  season-closed, except that a third of the weekly men took an advance in
//                   the week before their last finished one and did not come that week
//
// What it holds (the contract's numbers, features/speed/contract.md):
//    1, 3. THE MEDIUM SEASON'S v204 SIDE, moved here from tests/speed.test.mjs by the contract's
//       own rule (that suite ran 11.2 minutes against tests/reports.speed.test.mjs's 2.9 right
//       after it): every way in on both medium records under three readings of the gate, cold,
//       again and the list again, against v204; «איפוס מקדמות»'s step 3 after a real write on
//       both; and after every kind of write, every way in against v204's files on the same
//       record (tests/speed.test.mjs holds the same scenario against the same way drawn afresh).
//    2. the season records against v204 (6ab193d's three files out of Git, every other file
//       the same bytes): season-closed every way in; season-open «דוחות» once, every man's
//       statement, the cards, days and closing boxes of two weekly and two fortnightly men
//       and the pages of «מקדמות» - the workbook and the payslips held cold against warm on
//       this build instead (v204 takes minutes for each); season-skipped the pass's list, the
//       reminder, «מקדמות» and the cards of the men offered with an empty week, cold and then
//       unmoved. The gate's own plan inside a reading is the bare plan on season-closed.
//    4. on season-skipped the pass's list and the reminder, repeated on the unmoved record, ask
//       the record's seven readers nothing - the copies' own walks are counted apart.
//    8. the counts on season-open for every way in; v204's ledgerEntries at least 50x this
//       build's for one draw of «לפי עובד» on season-closed.
//    9. the real thing: one «סגירת שבוע» reading on season-skipped folds the record's ledger
//       once and is kept, though it closes four men's empty weeks on copies.
//   13. the clocks: the Node rows of the budget, both builds in this one process on the same
//       disk, interleaved v204 / this, the median of three each, printed side by side.

import { suite, check, same, given, report } from './runner.mjs';
import { TODAY, AT, SHUT, OPEN, filesOf, seasonDisk, mediumDisk, RANGE_NAMES, PAGE_WAYS, MAN_WAYS, BOOK_WAYS, BOOK_MAN_WAYS,
    SEVEN, phone, counted, realCalls, twice, waysOf, outcome, compareAll, writesScenario, resetStep } from './speed.seed.mjs';
import { loadavg } from 'node:os';

process.env.TZ = 'Asia/Jerusalem';
const STARTED = performance.now();
const NOW = filesOf('now');
const OLD = filesOf('base');
const j = value => JSON.stringify(value);
const ms = value => `${Math.round(value)}`;
const load = () => loadavg().map(value => value.toFixed(1)).join(' ');

// ---------------------------------------------------------------- 1, 3. the medium season against v204
{
    suite('1. the medium season: every way in is v204\'s bytes - cold, again, and the whole list again');
    const tally = { records: 0, readings: 0, compared: 0, wrong: [], threw: [], dirty: [], writes: 0, diskMoved: [], kept: 0, states: {},
        flat: { sheets: 0, rows: 0, bad: [] } };
    const READINGS = [['the gates shut', SHUT, false], ['the gates open', OPEN, false], ['the gates open, nobody approved', OPEN, true]];
    const MEDIUM = { without: mediumDisk(), with: mediumDisk({ closes: true }) };
    for (const [name, record] of [['the medium season', MEDIUM.without], ['the medium season, closed in order', MEDIUM.with]]) {
        for (const [reading, flags, unapproved] of READINGS) {
            const old = phone(record.disk, OLD, { flags, unapproved });
            const now = phone(record.disk, NOW, { flags, unapproved });
            compareAll(`${name}, ${reading}`, old, now, waysOf(now, record.men), tally);
            tally.readings += 1;
        }
    }
    check(`both medium records x 3 readings, ${tally.compared} readings of a screen: every one v204's bytes`, tally.wrong.length === 0,
        tally.wrong.slice(0, 6).join(' | '));
    same('every way in ended as v204\'s did, and none of v204\'s threw', tally.threw, []);
    same('5. after every way in, every reader is the one it was and no reading is left open', tally.dirty, []);
    same('10. not one write at any door, and the disk byte for byte', [tally.writes, tally.diskMoved], [0, []]);
    same('20. every row of every pay sheet flat', tally.flat.bad, []);

    suite('1. the medium season: «איפוס מקדמות»\'s step 3, the board read after a real write, is v204\'s');
    for (const [name, record] of [['the medium season', MEDIUM.without], ['the medium season, closed in order', MEDIUM.with]]) {
        const old = resetStep(record, OLD);
        const now = resetStep(record, NOW);
        check(`${name}: v204's reset wrote something (${old.done} of ${old.men} men)`, old.men > 0 && old.done > 0, j(old).slice(0, 200));
        same(`${name}: the result and the names it says still owe are v204's`, [now.done, now.failure, now.result], [old.done, old.failure, old.result]);
        same(`${name}: 10. reading it writes nothing, and 12. asks the gate nothing on an approved record`, [now.writes, now.questions, now.plans], [0, 0, 0]);
    }

    suite('3. the medium season, after every kind of write: every way in is v204\'s');
    const out = await writesScenario(MEDIUM.with, { afresh: false, v204: true }, given);
    same(`every way in, after each of ${out.steps} kinds of write: v204's files on the same record`, out.wrongs, []);
    console.log(`        (the seven, called by the first reading after each: ${out.realAfter.join(', ')}; load ${load()})`);
}

// ---------------------------------------------------------------- the seasons
const SEASON = {};
{
    suite('the three seasons, written by the app\'s own writers');
    for (const kind of ['open', 'closed', 'skipped']) {
        const began = performance.now();
        SEASON[kind] = seasonDisk(kind);
        SEASON[kind].ms = performance.now() - began;
        console.log(`        season-${kind}: ${j(SEASON[kind].facts)} - seeded in ${(SEASON[kind].ms / 1000).toFixed(1)} s (load ${load()})`);
    }
    given('season-open: 40 men, an advance every few weeks since the first day, nothing closed',
        SEASON.open.facts.men === 40 && SEASON.open.facts.advances > 500 && SEASON.open.facts.closes === 0, j(SEASON.open.facts));
    given('season-closed: closed in order', SEASON.closed.facts.closes > 100, j(SEASON.closed.facts));
    given('season-skipped: closed in order, with its men who missed a week', SEASON.skipped.facts.closes > 100
        && SEASON.skipped.facts.skippers.length >= 4, j(SEASON.skipped.facts));
    // The shape the clocks below are taken on, said: a record of the size the contract measured.
    check(`season-open: ${SEASON.open.facts.advances} advances, ${SEASON.open.facts.ledger} ledger entries, ${SEASON.open.facts.kib} KiB, nothing closed`,
        SEASON.open.facts.kib > 800 && SEASON.open.facts.ledger > SEASON.open.facts.advances);
    check(`season-closed: ${SEASON.closed.facts.closes} closes, ${SEASON.closed.facts.ledger} ledger entries, ${SEASON.closed.facts.kib} KiB`,
        SEASON.closed.facts.kib > 800 && SEASON.closed.facts.ledger > SEASON.closed.facts.closes);
    check(`season-skipped: ${SEASON.skipped.facts.skippers.length} weekly men who missed the week before their last finished one`,
        SEASON.skipped.facts.skippers.every(id => Number(id.slice(2)) <= 16));
}
const MEN = Array.from({ length: 40 }, (unused, at) => `w_${String(at + 1).padStart(2, '0')}`);
const WEEKLY = ['w_01', 'w_02'];
const FORTNIGHTLY = ['w_17', 'w_18'];
const FOUR = WEEKLY.concat(FORTNIGHTLY);

// The pass as season-skipped offers it: who is held, who has an empty week closed first.
const skippedPhone = phone(SEASON.skipped.disk, NOW);
const offered = JSON.parse(skippedPhone.way(`const read = weeklyCloseRead(State.schedule, todayStr(), '${AT}');
    return JSON.stringify(read.men.filter(man => !man.held).map(man => ({ id: man.id, empties: man.empties.length })));`));
const withEmpties = offered.filter(man => man.empties > 0).map(man => man.id);
const without = offered.filter(man => man.empties === 0).map(man => man.id);

// Every way in of `ways` on both builds: v204 once (timed), this build cold and then again.
function againstV204(label, record, ways, options = {}) {
    const old = phone(record.disk, OLD, options);
    const now = phone(record.disk, NOW, options);
    const wrong = [];
    let v204 = 0;
    let mine = 0;
    ways.forEach(([name, body]) => {
        let began = performance.now();
        const theirs = outcome(old, body);
        v204 += performance.now() - began;
        now.run('REPORT_SHARED_KEPT = null; 1');
        began = performance.now();
        const cold = outcome(now, body);
        mine += performance.now() - began;
        const warm = outcome(now, body);
        if (theirs.indexOf('threw:') === 0) wrong.push(`${name}: v204 threw ${theirs.slice(0, 60)}`);
        if (cold !== theirs) wrong.push(`${name} (cold)`);
        if (warm !== theirs) wrong.push(`${name} (again)`);
    });
    console.log(`        (${label}: ${ways.length} ways in - v204 ${(v204 / 1000).toFixed(1)} s, this build cold ${(mine / 1000).toFixed(1)} s; load ${load()})`);
    return { wrong, old, now };
}

// ---------------------------------------------------------------- 2. season-closed
{
    suite('2. season-closed: every way in is v204\'s bytes, cold and again');
    const device = phone(SEASON.closed.disk, NOW);
    const ways = waysOf(device, MEN);
    const { wrong } = againstV204('season-closed', SEASON.closed, ways);
    same(`${ways.length} ways in on season-closed`, wrong, []);
    // The same record nobody approved, and with both gates shut: «דוחות».
    for (const [name, options] of [['nobody approved', { unapproved: true }], ['both gates shut', { flags: SHUT }]]) {
        const draws = waysOf(device, [], { ranges: [RANGE_NAMES[0]], manRanges: [] }).filter(([way]) => /«דוחות»/.test(way));
        same(`season-closed, ${name}: «דוחות», both sections`, againstV204(`season-closed, ${name}`, SEASON.closed, draws, options).wrong, []);
    }
    const plain = phone(SEASON.closed.disk, NOW);
    plain.run('State.schedule.ledger.migrations = {}; 1');
    const inside = plain.run('REPORT_SHARED_KEPT = null; JSON.stringify(reportReadOnce(() => planCarryMigration(State.schedule)))');
    same('the gate\'s own plan, asked inside a reading, is the bare plan, JSON for JSON', inside, plain.run('JSON.stringify(planCarryMigration(State.schedule))'));
}

// ---------------------------------------------------------------- 2. season-open
{
    suite('2. season-open: «דוחות», every statement, four men\'s cards, days and closing boxes, the pages of «מקדמות» - v204\'s bytes');
    const device = phone(SEASON.open.disk, NOW);
    const at = 'speedReset();';
    const ways = [[PAGE_WAYS[0][0], `${at} ${PAGE_WAYS[0][1]}`]];
    MEN.forEach(id => ways.push([`${id}: his statement`, `${at} ${MAN_WAYS[0][1](id)}`]));
    FOUR.forEach(id => {
        ways.push([`${id}: his days`, `${at} ${MAN_WAYS[1][1](id)}`]);
        ways.push([`${id}: his closing box`, `${at} ${MAN_WAYS[2][1](id)}`]);
        BOOK_MAN_WAYS.forEach(([name, make]) => ways.push([`${id}: ${name}`, `${at} ${make(id)}`]));
    });
    BOOK_WAYS.filter(([name]) => !/payslips/.test(name)).forEach(([name, body]) => ways.push([name, `${at} ${body}`]));
    const { wrong, now } = againstV204('season-open', SEASON.open, ways);
    same(`${ways.length} ways in on season-open`, wrong, []);
    // The workbook and the payslips: v204 takes minutes for each. This build, cold (nothing
    // kept) against warm; their parts - «דוחות» and every statement - are v204's above.
    const heavy = [['the workbook', `${at} ${PAGE_WAYS[3][1]}`]].concat(BOOK_WAYS.filter(([name]) => /payslips/.test(name))
        .map(([name, body]) => [name, `${at} ${body}`]));
    const parted = heavy.filter(([name, body]) => {
        now.run('REPORT_SHARED_KEPT = null; 1');
        const cold = outcome(now, body);
        const warm = outcome(now, body);
        return cold !== warm || cold.indexOf('ok:') !== 0;
    }).map(([name]) => name);
    same('the workbook and the payslips of both periods: cold (nothing kept) and warm, the same bytes', parted, []);
}

// ---------------------------------------------------------------- 2, 4, 9. season-skipped
{
    suite('2, 4, 9. season-skipped: the men whose empty week is closed first on a copy');
    given('season-skipped: at least four men offered with an empty week closed first on a copy', withEmpties.length >= 4, j(offered));
    given('and at least four offered without', without.length >= 4, j(offered));
    const ways = [
        ['«סגירת שבוע»\'s list', `speedReset(); ${BOOK_WAYS.filter(([name]) => /סגירת שבוע/.test(name))[0][1]}`],
        ['the reminder\'s count', `speedReset(); ${BOOK_WAYS.filter(([name]) => /reminder/.test(name))[0][1]}`],
        ['«מקדמות»', `speedReset(); ${BOOK_WAYS[0][1]}`]
    ].concat(withEmpties.map(id => [`${id}: his card`, `speedReset(); ${BOOK_MAN_WAYS[1][1](id)}`]));
    const { wrong, now } = againstV204('season-skipped', SEASON.skipped, ways);
    same(`${ways.length} ways in on season-skipped, each cold and then again: v204's bytes`, wrong, []);
    // 4: repeated on the unmoved record, the pass's list and the reminder ask the record's seven
    // readers nothing; the copies are planned again, and their walks counted apart.
    [ways[0], ways[1]].forEach(([name, body]) => {
        now.run('REPORT_SHARED_KEPT = null; 1');
        counted(now, body);
        const again = counted(now, body).counted;
        const record = realCalls(again, SEVEN).length;
        const copies = again.calls.filter(call => /^copy:advanceWalk\(/.test(call)).length;
        same(`${name}, again on the unmoved record: the record's seven asked ${record} times`, record, 0);
        check(`and the copies' own walks are planned again, as they must be: ${copies}`, copies > 0, String(copies));
    });
    // 9: one reading - four men's empty weeks closed on copies inside it - folds the record's
    // ledger once and is kept.
    now.run('REPORT_SHARED_KEPT = null; 1');
    const one = counted(now, ways[0][1]).counted;
    same('one «סגירת שבוע» reading on season-skipped: the record\'s ledger folded once', realCalls(one, ['foldLedger']).length, 1);
    check(`it appended to copies (${one.calls.filter(call => /^copy:appendLedgerEntry\(/.test(call)).length}) and was kept all the same`,
        one.calls.some(call => /^copy:appendLedgerEntry\(/.test(call)) && now.run('REPORT_SHARED_KEPT !== null && REPORT_SHARED_KEPT.schedule === State.schedule'));
}

// ---------------------------------------------------------------- 8. the counts on season-open
{
    suite('8. season-open, every way in read cold: each reader once per question, the key twice at most');
    const device = phone(SEASON.open.disk, NOW);
    const ways = waysOf(device, FOUR, { ranges: [RANGE_NAMES[0]], manRanges: [RANGE_NAMES[0]] });
    const wrong = [];
    ways.forEach(([name, body]) => {
        device.run('REPORT_SHARED_KEPT = null; 1');
        const c = counted(device, body).counted;
        const of = fn => realCalls(c, [fn]);
        [['ledgerEntries once', of('ledgerEntries').length <= 1], ['foldLedger once', of('foldLedger').length <= 1],
            ['advanceHistory never', of('advanceHistory').length === 0],
            ['advanceWalk once per question', twice(of('advanceWalk')).length === 0],
            ['advancePositionInto once per question', twice(of('advancePositionInto')).length === 0],
            ['overpaidAdvances once per man', twice(of('overpaidAdvances')).length === 0],
            ['advanceOutstanding once per advance', twice(of('advanceOutstanding')).length === 0],
            ['payrollReport once per range', twice(of('payrollReport')).length === 0], ['the key at most twice', c.keys <= 2]]
            .filter(rule => !rule[1]).forEach(rule => wrong.push(`${name}: ${rule[0]}`));
    });
    same(`${ways.length} ways in on season-open`, wrong, []);
    const closed = phone(SEASON.closed.disk, NOW);
    const oldClosed = phone(SEASON.closed.disk, OLD);
    const draw = `speedReset(); ${PAGE_WAYS[0][1]}`;
    closed.run('REPORT_SHARED_KEPT = null; 1');
    const mine = counted(closed, draw).counted;
    const theirs = counted(oldClosed, draw).counted;
    const n = list => realCalls(list, ['ledgerEntries']).length;
    console.log(`        one draw of «לפי עובד» on season-closed, v204 -> this build: ${SEVEN.concat(['payrollReport'])
        .map(fn => `${fn} ${realCalls(theirs, [fn]).length} -> ${realCalls(mine, [fn]).length}`).join(', ')}`);
    check(`v204 listed the ledger ${n(theirs)} times for it, this build ${n(mine)}: at least 50x`, n(mine) >= 1 && n(theirs) >= 50 * n(mine),
        `${n(theirs)} / ${n(mine)}`);
}

// ---------------------------------------------------------------- 13. the clocks
//
// A row is a way in and its ceilings: a fraction of v204's own median taken in this process
// at the same moment ({ f, plus }), or - where v204 takes minutes - an absolute ceiling in ms.
// "after a change": the record moved before each run (a note on a man), so nothing kept is of
// it. "unmoved": the same reading again with nothing moved.
const X = (f, plus = 0) => ({ f, plus });
const ABS = value => ({ abs: value });
const way = (list, test) => list.filter(([name]) => test.test(name))[0][1];
const CLOCKS = [
    ['«דוחות» (one draw builds both sections)', `speedReset(); ${PAGE_WAYS[0][1]}`, { open: [ABS(5000), ABS(800)], closed: X(1 / 4) }],
    ['the workbook', `speedReset(); ${PAGE_WAYS[3][1]}`, { open: [ABS(5000), ABS(800)], closed: X(1 / 6) }],
    ['«תלוש לכל עובד», this period', `speedReset(); ${way(BOOK_WAYS, /payslips, this/)}`, { open: [ABS(5000), ABS(800)], closed: X(1 / 6) }],
    ['«תלוש לכל עובד», the period before', `speedReset(); ${way(BOOK_WAYS, /payslips, the period/)}`, { open: [ABS(5000), ABS(800)], closed: X(1 / 6) }],
    ['the closing box, a weekly man', `speedReset(); ${MAN_WAYS[2][1]('w_01')}`, { open: [X(0.35), X(1 / 4)], closed: X(1.25, 30) }],
    ['the closing box, a fortnightly man', `speedReset(); ${MAN_WAYS[2][1]('w_17')}`, { open: [X(0.6), X(1 / 4)], closed: X(1.25, 30) }],
    ['a man\'s days', `speedReset(); ${MAN_WAYS[1][1]('w_01')}`, { open: [X(0.35), X(1 / 4)], closed: X(1.25, 30) }],
    ['his statement', `speedReset(); ${MAN_WAYS[0][1]('w_01')}`, { open: [X(0.5), X(1 / 2)], closed: X(1.25, 30) }],
    ['«מקדמות»', `speedReset(); ${BOOK_WAYS[0][1]}`, { open: [X(0.35), X(1 / 4)], closed: X(1 / 2) }],
    ['a man\'s page of «מקדמות»', `speedReset(); ${BOOK_MAN_WAYS[0][1]('w_01')}`, { open: [X(0.6, 20), X(0.6, 20)], closed: X(1.25, 30) }],
    // Unmoved, v204 ALREADY keeps this page's one reading - the board, OWES_KEPT - and
    // season-open has no close to list: v204 draws it unmoved in milliseconds (measured, 8 ms),
    // and a quarter of that is no ceiling. The contract's own rule for a reading already cheap
    // on v204 holds it instead: never slower than 1.25x + 30 ms.
    ['«סגירות שנרשמו»', `speedReset(); ${BOOK_WAYS[1][1]}`, { open: [X(0.35), X(1.25, 30)], closed: X(1 / 2) }],
    ['owesReadNow («שים לב»)', 'OWES_KEPT = null; return JSON.stringify(owesReadNow());', { open: [X(0.35), X(1 / 4)], closed: X(1 / 2) }],
    ['«סגירת שבוע»\'s list', `speedReset(); ${way(BOOK_WAYS, /סגירת שבוע/)}`, { open: [X(0.75), X(1 / 4)], closed: X(1.25, 30) }],
    ['the reminder\'s count', `speedReset(); ${way(BOOK_WAYS, /reminder/)}`, { open: [X(0.75), X(1 / 4)], closed: X(1.25, 30) }],
    ['«איפוס מקדמות»\'s reading', `speedReset(); ${way(BOOK_WAYS, /איפוס/)}`, { open: [X(0.75), X(1 / 4)], closed: X(1.25, 30) }],
    // Its step 3: the board as each build's advanceResetAfter reads it after the write -
    // v204 bare, this build through owesReadNow (the one line of advancereset.js).
    ['«איפוס מקדמות»\'s step 3 (the board after the write)', `OWES_KEPT = null; return JSON.stringify(typeof reportSharedKey === 'function'
        ? owesReadNow() : owesRead(State.schedule, todayStr()));`, { open: [X(0.35), X(1 / 4)], closed: X(1.25, 30) }],
    ['«כרטיס עובד», a weekly man', `speedReset(); ${BOOK_MAN_WAYS[1][1]('w_01')}`, { open: [X(0.35), X(1 / 4)], closed: X(1.25, 30) }],
    ['«כרטיס עובד», a fortnightly man', `speedReset(); ${BOOK_MAN_WAYS[1][1]('w_17')}`, { open: [X(0.35), X(1 / 4)], closed: X(1.25, 30) }],
    ['«סיכום חודש»', `speedReset(); ${way(BOOK_WAYS, /^the month$/)}`, { open: [X(1.25, 20), X(1.25, 20)], closed: X(1.25, 20) }]
];
const MOVE = 'State.schedule.workers[0].note = String(Math.random()); 1';
const median = list => list.slice().sort((a, b) => a - b)[Math.floor(list.length / 2)];
const timeOf = (device, body, move) => {
    if (move) device.run(MOVE);
    const began = performance.now();
    device.way(body);
    return performance.now() - began;
};
const within = (limit, mine, theirs) => (limit.abs !== undefined ? mine <= limit.abs : mine <= theirs * limit.f + limit.plus);
const said = limit => (limit.abs !== undefined ? `<= ${limit.abs} ms` : `<= ${limit.f === 1.25 ? '1.25x' : (limit.f < 1 ? limit.f.toFixed(2).replace(/0+$/, '') : limit.f)}${limit.plus ? ` + ${limit.plus} ms` : ''} of v204's`);
// Both builds on one disk, interleaved v204 / this, three rounds; `unmoved` too when asked
// (straight after the same round's reading, the record not moved between). The median of
// three discards a first run with the code not yet warm.
function clock(record, body, options = {}) {
    const old = options.skipOld ? null : phone(record.disk, OLD, options.phone || {});
    const now = phone(record.disk, NOW, options.phone || {});
    const times = { oldAfter: [], nowAfter: [], oldUnmoved: [], nowUnmoved: [] };
    for (let round = 0; round < 3; round += 1) {
        if (old) times.oldAfter.push(timeOf(old, body, true));
        times.nowAfter.push(timeOf(now, body, true));
        if (options.unmoved) {
            if (old) times.oldUnmoved.push(timeOf(old, body, false));
            times.nowUnmoved.push(timeOf(now, body, false));
        }
    }
    return { oldAfter: old ? median(times.oldAfter) : null, nowAfter: median(times.nowAfter),
        oldUnmoved: old && options.unmoved ? median(times.oldUnmoved) : null, nowUnmoved: options.unmoved ? median(times.nowUnmoved) : null };
}
{
    suite('13. the clocks: this build against v204 in the same process, interleaved, medians of three');
    console.log(`        (load at the start of the clocks: ${load()})`);
    const lines = [];
    for (const [name, body, budget] of CLOCKS) {
        // season-open: after a change, and unmoved
        const open = clock(SEASON.open, body, { unmoved: true, skipOld: budget.open[0].abs !== undefined });
        const [after, unmoved] = budget.open;
        check(`season-open, ${name}, after a change: ${ms(open.nowAfter)} ms (v204 ${open.oldAfter === null ? 'not timed: minutes' : `${ms(open.oldAfter)} ms`}) - ${said(after)}`,
            within(after, open.nowAfter, open.oldAfter));
        check(`season-open, ${name}, unmoved: ${ms(open.nowUnmoved)} ms (v204 ${open.oldUnmoved === null ? 'not timed' : `${ms(open.oldUnmoved)} ms`}) - ${said(unmoved)}`,
            within(unmoved, open.nowUnmoved, open.oldUnmoved));
        const closed = clock(SEASON.closed, body, {});
        check(`season-closed, ${name}, after a change: ${ms(closed.nowAfter)} ms (v204 ${ms(closed.oldAfter)} ms) - ${said(budget.closed)}`,
            within(budget.closed, closed.nowAfter, closed.oldAfter));
        lines.push(`${name}: open ${ms(open.nowAfter)}/${open.oldAfter === null ? '-' : ms(open.oldAfter)}, unmoved ${ms(open.nowUnmoved)}/${open.oldUnmoved === null ? '-' : ms(open.oldUnmoved)}, closed ${ms(closed.nowAfter)}/${ms(closed.oldAfter)}`);
    }
    for (const [name, body] of [['«סגירת שבוע»\'s list', CLOCKS[12][1]], ['the reminder\'s count', CLOCKS[13][1]]]) {
        const skipped = clock(SEASON.skipped, body, { unmoved: true });
        check(`season-skipped, ${name}, after a change: ${ms(skipped.nowAfter)} ms (v204 ${ms(skipped.oldAfter)} ms) - <= 1.25x + 30 ms`,
            skipped.nowAfter <= skipped.oldAfter * 1.25 + 30);
        check(`season-skipped, ${name}, unmoved: ${ms(skipped.nowUnmoved)} ms (v204 ${ms(skipped.oldUnmoved)} ms) - <= 1.25x + 30 ms`,
            skipped.nowUnmoved <= skipped.oldUnmoved * 1.25 + 30);
        lines.push(`season-skipped ${name}: ${ms(skipped.nowAfter)}/${ms(skipped.oldAfter)}, unmoved ${ms(skipped.nowUnmoved)}/${ms(skipped.oldUnmoved)}`);
    }
    const shut = clock(SEASON.closed, CLOCKS[0][1], { phone: { flags: SHUT } });
    check(`season-closed, both gates shut, «דוחות»: ${ms(shut.nowAfter)} ms (v204 ${ms(shut.oldAfter)} ms) - <= 1.25x + 30 ms`, shut.nowAfter <= shut.oldAfter * 1.25 + 30);
    const unapproved = clock(SEASON.closed, CLOCKS[0][1], { phone: { unapproved: true } });
    check(`season-closed, nobody approved, «דוחות»: ${ms(unapproved.nowAfter)} ms (v204 ${ms(unapproved.oldAfter)} ms) - <= 0.4 of v204's`, unapproved.nowAfter <= unapproved.oldAfter * 0.4);
    lines.push(`shut ${ms(shut.nowAfter)}/${ms(shut.oldAfter)}, unapproved ${ms(unapproved.nowAfter)}/${ms(unapproved.oldAfter)}`);
    // The kept key: at most two per reading that asked a kept function and none for one that
    // asked none (counted for every way in by tests/speed.test.mjs); here its cost.
    const device = phone(SEASON.open.disk, NOW);
    const keyTimes = [0, 1, 2].map(() => { const began = performance.now(); device.run('reportSharedKey(State.schedule).length'); return performance.now() - began; });
    check(`the kept key on season-open's record (${device.run('JSON.stringify(State.schedule).length')} characters): ${ms(median(keyTimes))} ms - <= 30 ms`, median(keyTimes) <= 30);
    lines.forEach(line => console.log(`        this build / v204, ms: ${line}`));
    console.log(`        (load at the end of the clocks: ${load()})`);
}

console.log(`\n        (tests/speed.season.test.mjs ran ${((performance.now() - STARTED) / 60000).toFixed(1)} minutes on this machine; load ${load()})`);
report();
