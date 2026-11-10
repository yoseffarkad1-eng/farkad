// כרטיס עובד - the worker's card, on devices.
//
//   node tests/workercard.test.mjs
//
// The card (js/ui/workercard.js) is one man on one screen: his open period, what he owes,
// where he has been. It is a READING, and it is the fifth surface to show a fortnight's
// money - the sheet, the worker's days, the message he is sent and the exported file are
// the other four, and this app has already paid for those four disagreeing. So what this
// suite holds is not that the card is right. It is that the card CANNOT BE DIFFERENT:
//
//   1. THE FIGURES ARE THE SHEET'S. Over many seeded records - two cycles, a cycle that
//      changes mid-fortnight, men with no rate, double days, extra hours with and without
//      an hourly rate, advances, cash handed back, a closed fortnight, a site that left
//      the list - every cell on every man's card is the cell the pay sheet prints for him
//      when the card's own button has taken the person there. Cell for cell, as text.
//      Then the same figures are found on two surfaces that do not share the card's code
//      path at all: the exported sheet and the message he is sent.
//   2. THE GATE IS THE SHEET'S. With the migration unapproved the card says what
//      tests/approval.test.mjs makes every other surface say - the acceptance example,
//      3,050 earned, 5,000 handed over, -1,950 - and it moves when a durable approval
//      moves them, and not before.
//   3. IT WRITES NOTHING. Every key on the disk, byte for byte, across opening the card
//      for every man, redrawing it, and leaving it by both of its buttons - with a
//      recorder on the disk that is then shown to notice a real write.
//   4. THE WORDS. Each new string, word for word; each borrowed one, found where its
//      owner keeps it.
//
// Both money gates are opened and shut through the harness's seam, because the two
// readings of a record differ in different places and a suite that measured one would
// have called the other safe.

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
const CARD = source('js/ui/workercard.js');

const SHUT = { carryAdvances: false, ledgerWrites: false };
const OPEN = { carryAdvances: true, ledgerWrites: true };

// A Tuesday, in the second week of the fortnight that opened on Friday 30 October: a
// weekly man is four days into his week and a fortnightly one eleven into his account.
const TODAY = '2026-11-10';
// Two whole fortnights behind the open one, so there is an account to carry out of.
const FIRST_DAY = '2026-10-02';

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

// The bidi marks the app pins its signs with, and the * it puts on a wage that leaves
// unpriced hours out - taken off so a number is a number.
const plain = text => String(text).replace(/[‎⁦-⁩]/g, '').replace(/\s*\*$/, '');
const num = text => {
    const bare = plain(text);
    if (bare === '') return 0;
    if (bare === '—') return null;
    return Number(bare.replace(/[^\d.-]/g, ''));
};

// The report code and the card, in the device's own context - the way
// tests/finance.test.mjs reaches the sheet - over a DOM that can be read back.
function withCard(device) {
    const dom = makeDom();
    ['reportsView', 'advancesView', 'workerDaysTitle', 'workerDaysMeta', 'workerDaysBody',
        'workerDaysModal', 'workerCardModal', 'workerCardTitle', 'workerCardBody',
        'workerCardReport', 'workerCardAdvances'].forEach(id => dom.register(id));
    // The crew row keeps the man's id on its dataset, which this small DOM does not have.
    const make = dom.createElement;
    dom.createElement = tag => { const node = make(tag); node.dataset = {}; return node; };
    device.ctx.document = dom;
    device.dom = dom;
    device.run = code => vm.runInContext(code, device.ctx, { filename: 'harness:workercard' });
    device.run(source('js/ui/sitecolor.js'));
    device.run(source('js/ui/reports.js'));
    device.run(CARD);
    device.views = [];
    device.ctx.showView = view => { device.views.push(view); };
    device.ctx.askTell = () => Promise.resolve();
    device.ctx.askConfirm = () => Promise.resolve(true);
    device.setToday(TODAY);
    device.facts = id => JSON.parse(device.run(`JSON.stringify(workerCardFacts(${JSON.stringify(id)}))`));
    return device;
}

// ---------------------------------------------------------------- seeded records
//
// A small generator with its own arithmetic-free memory: `oracle` remembers what was
// RECORDED - which man was at which site on which date - and never what it was worth.
// Whether the card's money is right is asked of the sheet, the file and the message;
// whether its days are right is asked of this.
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

function seededPhone(seed, flags) {
    const rand = mulberry(seed);
    const pick = list => list[Math.floor(rand() * list.length)];
    const first = makeDevice({ deviceId: `d_seed${seed}`, flags });
    first.setToday(TODAY);
    const schedule = first.State.schedule;
    const oracle = {};

    const crew = 3 + Math.floor(rand() * 4);
    schedule.workers = [];
    for (let n = 1; n <= crew; n += 1) {
        const worker = {
            id: `w_${n}`, name: `עובד ${seed}-${n}`, active: rand() > 0.15,
            // One man in five has no rate: his wage is unknown, which is not zero.
            dailyRate: pick([0, 380, 410, 450, 610]), hourlyRate: pick([0, 0, 41.25, 60])
        };
        if (rand() < 0.5) worker.phone = `050-00000${String(seed % 10)}${n}`;
        const cycle = rand();
        // Weekly from long ago; or weekly from the Friday INSIDE the open fortnight, which
        // cuts it in two and leaves a transition period behind it.
        if (cycle < 0.3) worker.payCycles = '2026-10-02=weekly';
        else if (cycle < 0.45) worker.payCycles = '2026-11-06=weekly';
        // One man in four stopped coming two weeks ago: nothing in his open period but,
        // for some of them, money - the men the sheet moves to its financial lines.
        worker.idleFrom = rand() < 0.25 ? '2026-10-27' : null;
        schedule.workers.push(worker);
        oracle[worker.id] = {};
    }
    const sites = 2 + Math.floor(rand() * 3);
    schedule.places = [];
    for (let n = 1; n <= sites; n += 1) {
        schedule.places.push({ id: `p_${n}`, name: `אתר ${seed}-${n}`, active: true });
    }
    // One record in three has a day at a site that is no longer on the list.
    const siteIds = schedule.places.map(place => place.id)
        .concat(seed % 3 === 0 ? ['p_gone'] : []);

    // Kept beside the record, not on it: the roster holds only what a roster holds.
    const idle = {};
    schedule.workers.forEach(worker => { idle[worker.id] = worker.idleFrom; delete worker.idleFrom; });

    datesBetween(FIRST_DAY, TODAY).forEach(date => {
        schedule.workers.forEach(worker => {
            const roll = rand();
            if (roll < 0.30 || (idle[worker.id] && date >= idle[worker.id])) return;
            if (roll < 0.37) {
                first.call('markAbsent', schedule, date, worker.id, 'actual');
                oracle[worker.id][date] = { absent: true, sites: [] };
                return;
            }
            const one = pick(siteIds);
            const band = rand();
            const rate = band < 0.1 ? 'double' : band < 0.2 ? 'extra' : undefined;
            first.call('assignPlace', schedule, date, worker.id, 'actual', one, rate,
                rate === 'extra' ? pick([1, 2, 3.5]) : undefined);
            const here = [one];
            if (roll > 0.92) {
                const two = pick(siteIds.filter(id => id !== one));
                first.call('assignPlace', schedule, date, worker.id, 'actual', two);
                here.push(two);
            }
            oracle[worker.id][date] = { absent: false, sites: here };
        });
    });

    // Advances the old way, as every phone still reads them: some in the open period,
    // some a period or two back, some larger than a fortnight's wage.
    schedule.workers.forEach(worker => {
        const count = Math.floor(rand() * 3);
        for (let n = 0; n < count; n += 1) {
            first.call('addAdvance', schedule, worker.id,
                addDays(TODAY, -Math.floor(rand() * 30)), pick([200, 500, 1500, 5000, 250.5]), '');
        }
    });
    first.State.save({ silent: true });

    // REOPENED, which is what mirrors the advances into the ledger - the state a phone is
    // actually in every morning.
    const device = withCard(makeDevice({ deviceId: `d_seed${seed}`, storage: first.dump(), flags }));
    device.State.load();
    device.oracle = oracle;
    device.approved = false;

    if (flags.carryAdvances) {
        const plan = device.call('planCarryMigration', device.State.schedule);
        // Two records in three are approved; the third stays as a phone nobody has
        // pressed the button on, so the unapproved reading is in the corpus too.
        if (plan.needed && seed % 3 !== 1) {
            device.State.commit(device.call('recordCarryApproval', device.State.schedule,
                plan, '2026-11-01T09:00:00.000Z', 'd_person'));
        }
        device.approved = device.call('carryReportingEnabled', device.State.schedule) === true;

        // Cash handed back against the first advance of each man who has one - written
        // by the model's recorder where this record may be written, and straight onto the
        // ledger where it may not, which is how such an entry reaches an unapproved
        // phone: from another one.
        device.State.schedule.workers.forEach(worker => {
            const mine = device.call('advancesFor', device.State.schedule, worker.id,
                '0000-01-01', '9999-12-31');
            if (mine.length === 0 || rand() < 0.5) return;
            const back = pick([100, 200, mine[0].amount, mine[0].amount + 300]);
            const date = addDays(TODAY, -Math.floor(rand() * 6));
            if (device.call('financialWritingEnabled', device.State.schedule)) {
                device.State.commit(device.call('recordAdvanceRepaid', device.State.schedule,
                    mine[0].id, back, date, '', `${date}T10:00:00.000Z`, 'd_person', 'cash'));
            } else {
                const ledger = device.State.schedule.ledger;
                ledger.advances[`le_back_${worker.id}`] = {
                    id: `le_back_${worker.id}`, advanceId: mine[0].id, kind: 'repaid',
                    workerId: worker.id, date, amount: back, note: '', method: 'cash',
                    at: `${date}T10:00:00.000Z`, by: 'd_elsewhere' };
                device.State.save({ silent: true });
            }
        });

        // And the fortnight BEFORE the open one closed for the first fortnightly man the
        // model will close it for, so somebody opens his period on a frozen balance.
        if (device.call('financialWritingEnabled', device.State.schedule)) {
            device.State.schedule.workers.some(worker => {
                const now = device.call('periodRangeFor', worker, TODAY);
                if (now.cycle !== 'biweekly' || now.transition) return false;
                const before = device.call('periodRangeFor', worker, addDays(now.from, -1));
                const changes = device.call('closePeriodChanges', device.State.schedule,
                    worker.id, before.from, before.to, '2026-11-09T20:00:00.000Z', 'd_person');
                if (changes.length === 0) return false;
                device.closed = device.State.commitMany(changes) === true ? worker.id : null;
                return true;
            });
        }
    }
    return device;
}

// The sheet, the file and the message for ONE man, read after the card's own button has
// pointed the report at him - so the comparison is with the screen a person lands on.
function sheetFor(device, id) {
    return JSON.parse(device.run(`(function (id) {
        WORKER_CARD_ID = id;
        workerCardGo('report');
        const section = renderPayrollTable();
        const group = section.querySelectorAll('.report-payroll-group')[0];
        const table = group ? group.querySelector('table') : null;
        return JSON.stringify({
            range: [REPORT_RANGE.from, REPORT_RANGE.to],
            workers: REPORT_WORKERS === null ? null : [...REPORT_WORKERS],
            section: REPORT_SECTION,
            head: table ? table.querySelectorAll('thead th').map(node => node.textContent) : null,
            body: table ? table.querySelectorAll('tbody tr')
                .map(tr => tr.children.map(td => td.textContent)) : [],
            finance: section.querySelectorAll('.report-finance-text').map(node => node.textContent),
            empty: section.querySelectorAll('.empty-hint').map(node => node.textContent),
            file: payrollSheetRows(),
            notes: payrollRows().map(row => moneyNotes(row)),
            statement: workerStatementText(id),
            // What he owes: the gated sentence's figure, and the advances screen's.
            open: openAdvanceBalance(State.schedule, id),
            left: workerAdvanceSummary(id).left,
            owedText: moneyText((openAdvanceBalance(State.schedule, id) || { total: 0 }).total),
            folded: carryReportingEnabled(State.schedule) === true
        });
    })(${JSON.stringify(id)})`));
}

// ---------------------------------------------------------------- 1. the figures
// Twelve records under each reading of the money, with a short history.
//
// AND THE GATE IS ANSWERED ONCE PER RECORD HERE, which needs saying because it is the one
// place this suite stands between the app and its own function. carryReportingEnabled
// re-plans the migration on every call, and the plan walks a man whose balance has not
// cleared some four thousand fortnights forward (planAdvanceCarry): measured on these
// records, up to a second per question, and the sheet, the file and the message ask it a
// dozen times a man. Nothing in a record moves while its cards are compared, so the real
// function is asked once and its answer handed back - by the real function's name, so
// every reader on both sides of the comparison still goes through the gate. The suites
// below that are ABOUT the gate do not do this: they ask the real thing every time.
const SEEDS = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
const GATE_ONCE = `(function () {
    const real = carryReportingEnabled;
    const asked = State.schedule;
    let known;
    carryReportingEnabled = schedule => {
        if (schedule !== asked) return real(schedule);
        if (known === undefined) known = real(schedule);
        return known;
    };
    return () => { carryReportingEnabled = real; };
})()`;
const seen = { cards: 0, pay: 0, finance: 0, nothing: 0, weekly: 0, unpriced: 0, carried: 0,
    notes: 0, credit: 0, moves: 0, closed: 0, unapproved: 0, file: 0, statement: 0,
    twoSites: 0, absent: 0 };

[['the money gates shut', SHUT], ['the money gates open', OPEN]].forEach(([reading, flags]) => {
    suite(`every card is the pay sheet's own row - ${reading}`);

    SEEDS.forEach(seed => {
        const device = seededPhone(seed, flags);
        const schedule = device.State.schedule;
        const wrong = [];
        const fail = (id, what, detail) => wrong.push(`${id} ${what}: ${detail}`);
        if (flags.carryAdvances && !device.approved) seen.unapproved += 1;
        if (device.closed) seen.closed += 1;
        const gateBack = device.run(GATE_ONCE);

        schedule.workers.forEach(worker => {
            const id = worker.id;
            // The report is left on a range nobody would confuse with his period, and on
            // every man, so that a card which forgot to put it back is caught.
            device.run(`REPORT_RANGE.from = '2026-01-01'; REPORT_RANGE.to = '2026-01-31';`
                + `REPORT_WORKERS = null; REPORT_SECTION = 'sites';`);
            const facts = device.facts(id);
            const after = JSON.parse(device.run(
                'JSON.stringify([REPORT_RANGE.from, REPORT_RANGE.to, REPORT_WORKERS, REPORT_SECTION])'));
            if (JSON.stringify(after) !== JSON.stringify(['2026-01-01', '2026-01-31', null, 'sites'])) {
                fail(id, 'left the report somewhere else', JSON.stringify(after));
            }
            seen.cards += 1;

            const period = device.call('periodRangeFor', worker, TODAY);
            if (facts.period.from !== period.from || facts.period.to !== period.to) {
                fail(id, 'period', JSON.stringify(facts.period));
            }
            if (period.cycle === 'weekly') seen.weekly += 1;

            // THE SCREEN the card's button lands on.
            const sheet = sheetFor(device, id);
            if (JSON.stringify(sheet.range) !== JSON.stringify([period.from, period.to])
                || JSON.stringify(sheet.workers) !== JSON.stringify([id])
                || sheet.section !== 'workers') {
                fail(id, 'the button pointed the report elsewhere', JSON.stringify(sheet.range));
            }
            if (sheet.body.length === 1) {
                seen.pay += 1;
                const mine = (facts.pay || []).map(cell => [cell.label, cell.value]);
                const theirs = sheet.head.slice(1).map((label, at) => [label, sheet.body[0][at + 1]]);
                if (JSON.stringify(mine) !== JSON.stringify(theirs)) {
                    fail(id, 'cells', `${JSON.stringify(mine)} !== ${JSON.stringify(theirs)}`);
                }
                if (facts.finance !== null) fail(id, 'finance beside a row', facts.finance);
                if (JSON.stringify(facts.notes) !== JSON.stringify(sheet.notes[0])) {
                    fail(id, 'notes', JSON.stringify(facts.notes));
                }
                if (facts.notes.length > 0) seen.notes += 1;
            } else if (sheet.finance.length === 1) {
                seen.finance += 1;
                if (facts.finance !== sheet.finance[0] || facts.pay !== null) {
                    fail(id, 'finance line', `${facts.finance} !== ${sheet.finance[0]}`);
                }
            } else {
                seen.nothing += 1;
                if (facts.pay !== null || facts.finance !== null
                    || sheet.empty.indexOf('אין רישומים בטווח הזה.') === -1) {
                    fail(id, 'a card for a man the sheet has no row for', JSON.stringify(facts.pay));
                }
            }

            // THE FILE, which shares no drawing code with the card: the same figures as
            // numbers, under the same headings.
            const cell = label => (facts.pay || []).filter(one => one.label === label)[0];
            if (facts.pay && sheet.file.length === 2) {
                const heads = sheet.file[0];
                const row = sheet.file[1];
                ['נוכחות', 'ימי שכר', 'כפולים', 'שעות נוספות', 'נעדר'].forEach(label => {
                    const mine = cell(label);
                    if (mine && num(mine.value) !== Number(row[heads.indexOf(label)])) {
                        fail(id, `file ${label}`, `${mine.value} !== ${row[heads.indexOf(label)]}`);
                    }
                });
                const gross = cell('נצבר');
                if (gross && num(gross.value) !== null) {
                    seen.file += 1;
                    const at = heads.indexOf('נצבר');
                    const deduction = cell(heads[at + 1]);
                    const net = cell('לתשלום');
                    if (num(gross.value) !== Number(row[at])) {
                        fail(id, 'file נצבר', `${gross.value} !== ${row[at]}`);
                    }
                    if (deduction && num(deduction.value) !== Number(row[at + 1])) {
                        fail(id, `file ${heads[at + 1]}`, `${deduction.value} !== ${row[at + 1]}`);
                    }
                    if (!net || num(net.value) !== Number(row[at + 2])) {
                        fail(id, 'file לתשלום', `${net && net.value} !== ${row[at + 2]}`);
                    }
                }
            }
            if (facts.pay && !(Number(worker.dailyRate) > 0)) seen.unpriced += 1;

            // THE MESSAGE HE IS SENT, which adds his days up for itself.
            const said = label => {
                const line = plain(sheet.statement).split('\n')
                    .filter(text => text.indexOf(`${label}: `) === 0)[0];
                return line === undefined ? undefined : Number(line.slice(label.length + 2));
            };
            if (facts.pay && cell('נצבר') && num(cell('נצבר').value) !== null
                && Number(worker.dailyRate) > 0) {
                seen.statement += 1;
                if (said('נצבר') !== num(cell('נצבר').value)) {
                    fail(id, 'message נצבר', `${said('נצבר')} !== ${cell('נצבר').value}`);
                }
                if (said('נותר לתשלום') !== num(cell('לתשלום').value)) {
                    fail(id, 'message נותר לתשלום',
                        `${said('נותר לתשלום')} !== ${cell('לתשלום').value}`);
                }
            }

            // WHAT HE OWES: the gated sentence's figure, under the words its gate allows -
            // and, once the record may be read that way, the advances screen's figure.
            const folded = sheet.folded;
            const owed = `${sheet.owedText} ₪`;
            if (facts.owed.amount !== owed
                || facts.owed.label !== (folded ? 'נשאר להחזיר' : 'מקדמות רשומות')) {
                fail(id, 'owed', `${JSON.stringify(facts.owed)} !== ${owed}`);
            }
            if (folded && num(facts.owed.amount) !== sheet.left) {
                fail(id, 'owed against the advances screen', facts.owed.amount);
            }
            if (!folded && facts.credit.length > 0) {
                fail(id, 'a credit on a record nobody approved', JSON.stringify(facts.credit));
            }
            if (facts.credit.length > 0) seen.credit += 1;
            if (facts.moves.length > 0) seen.moves += 1;
            const account = sheet.notes[0] || [];
            if (account.some(note => note.indexOf('מחשבון קודם') !== -1
                || note.indexOf('יתרת סגירה') !== -1 || note.indexOf('לחשבון הבא') !== -1)) {
                seen.carried += 1;
            }

            // WHERE HE WAS, against what this suite itself recorded.
            const mine = device.oracle[id];
            const strip = datesBetween(addDays(TODAY, -13), TODAY).reverse();
            if (JSON.stringify(facts.strip.map(day => day.date)) !== JSON.stringify(strip)) {
                fail(id, 'strip dates', JSON.stringify(facts.strip.map(day => day.date)));
            }
            facts.strip.forEach(day => {
                const was = mine[day.date] || { absent: false, sites: [] };
                if (day.absent !== was.absent
                    || JSON.stringify(day.sites.map(site => site.id).sort())
                        !== JSON.stringify(was.sites.slice().sort())) {
                    fail(id, `strip ${day.date}`, JSON.stringify(day));
                }
                if (day.absent) seen.absent += 1;
                if (day.sites.length === 2) seen.twoSites += 1;
                day.sites.forEach(site => {
                    const listed = schedule.places.filter(place => place.id === site.id)[0];
                    // A site that left the list is put back, archived, when the record is
                    // opened - so every site here is a listed one, and is named by it.
                    if (!listed || site.name !== listed.name || site.name === site.id) {
                        fail(id, `strip ${day.date} name`, site.name);
                    }
                });
            });
            const counted = {};
            datesBetween('2026-11-01', '2026-11-30').forEach(date => {
                ((mine[date] || {}).sites || []).forEach(site => {
                    counted[site] = (counted[site] || 0) + 1;
                });
            });
            const month = {};
            facts.month.forEach(site => { month[site.id] = site.days; });
            if (JSON.stringify(Object.keys(month).sort().map(key => [key, month[key]]))
                !== JSON.stringify(Object.keys(counted).sort().map(key => [key, counted[key]]))) {
                fail(id, 'month', `${JSON.stringify(month)} !== ${JSON.stringify(counted)}`);
            }
            // And the day count on the card is the days this suite put in his period.
            // (Not for a closed fortnight's man: his open period is not the closed one,
            // so it is asked of him like anybody else.)
            if (facts.pay && cell('נוכחות')) {
                const days = datesBetween(period.from, period.to)
                    .filter(date => mine[date] && !mine[date].absent).length;
                if (num(cell('נוכחות').value) !== days) {
                    fail(id, 'attendance', `${cell('נוכחות').value} !== ${days}`);
                }
            }
        });

        gateBack();
        check(`record ${seed}: ${schedule.workers.length} cards, each one the sheet's row, `
            + 'the file\'s figures, the message\'s and the days recorded',
            wrong.length === 0, wrong.slice(0, 3).join(' | '));
    });
});

{
    suite('and the corpus really held the cases it was written for');

    // A green run over records that never produced a deduction, a man with no days or a
    // weekly period would prove nothing about them. Each of these is a number that moves.
    check('many cards were compared', seen.cards > 45, String(seen.cards));
    check('most with a row of their own', seen.pay > 30, String(seen.pay));
    check('some with money and no day - the sheet\'s financial line', seen.finance > 0,
        String(seen.finance));
    check('some with nothing in the period at all', seen.nothing > 0, String(seen.nothing));
    check('weekly men among them', seen.weekly > 10, String(seen.weekly));
    check('men with no daily rate among them', seen.unpriced > 0, String(seen.unpriced));
    check('rows the sheet had to explain', seen.notes > 10, String(seen.notes));
    check('balances carried in or out', seen.carried > 0, String(seen.carried));
    check('credits', seen.credit > 0, String(seen.credit));
    check('movements', seen.moves > 20, String(seen.moves));
    check('records whose migration nobody approved', seen.unapproved > 0, String(seen.unapproved));
    check('records with a fortnight already closed', seen.closed > 0, String(seen.closed));
    check('figures found again in the file', seen.file > 30, String(seen.file));
    check('and in the message', seen.statement > 30, String(seen.statement));
    check('absences on the strip', seen.absent > 20, String(seen.absent));
    check('and days at two sites', seen.twoSites > 5, String(seen.twoSites));
}

// ---------------------------------------------------------------- 2. the gate
//
// tests/approval.test.mjs's own fixture and its own three numbers: he earned 3,050 and was
// handed 5,000. Before anybody approves the migration every surface says -1,950 and no
// surface announces a carried debt; the card is a surface.
const FROM = '2026-08-07';
const RATE = 610;
const GROSS = 3050;
const ADVANCE = 5000;

function approvalPhone() {
    const first = makeDevice({ deviceId: 'd_gate', flags: OPEN });
    first.State.schedule.workers = [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: RATE, hourlyRate: 0 }];
    first.State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
    first.State.save({ silent: true });
    ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14'].forEach(date =>
        first.State.commit(first.call('assignPlace', first.State.schedule, date, 'w_01',
            'actual', 'p_01')));
    first.State.commit(first.call('addAdvance', first.State.schedule, 'w_01', '2026-08-10',
        ADVANCE, ''));
    const device = withCard(first);
    device.setToday('2026-08-20');
    return device;
}
const cellOf = (facts, label) => ((facts.pay || []).filter(one => one.label === label)[0] || {}).value;

{
    suite('an unapproved migration leaves the card where every other surface is');

    const device = approvalPhone();
    given('both gates are open, through the seam',
        device.call('advanceCarryEnabled') === true && device.call('ledgerWritesEnabled') === true);
    given('the migration is genuinely needed and genuinely unapproved',
        device.call('planCarryMigration', device.State.schedule).needed === true
        && device.call('carryMigrationSettled', device.State.schedule) === false);

    const before = device.facts('w_01');
    same('the card reads 3,050 earned, 5,000 advanced, -1,950 payable',
        [num(cellOf(before, 'נצבר')), num(cellOf(before, 'מקדמות')), num(cellOf(before, 'לתשלום'))],
        [GROSS, -ADVANCE, GROSS - ADVANCE]);
    check('its deduction column is called מקדמות, not a deduction nobody approved',
        cellOf(before, 'נוכה מהשכר') === undefined, JSON.stringify(before.pay));
    check('no carried debt is announced on it',
        before.notes.join(' ').indexOf(String(ADVANCE - GROSS)) === -1, before.notes.join(' | '));
    check('and no credit', before.credit.length === 0, JSON.stringify(before.credit));
    same('what stands over the advances is what was handed over, in the words for that',
        before.owed, { label: 'מקדמות רשומות', amount: `${ADVANCE} ₪` });

    // A REPAYMENT ALREADY ON THE RECORD - approval.test.mjs's own way of making the
    // folded and unfolded answers differ, written by a phone that had approved.
    const advanceId = Object.keys(device.State.schedule.advances)[0];
    const ledger = device.State.schedule.ledger = device.State.schedule.ledger || {};
    ledger.advances = ledger.advances || {};
    ledger.advances.le_given = { id: 'le_given', advanceId, kind: 'given', workerId: 'w_01',
        date: '2026-08-10', amount: ADVANCE, note: '', at: '2026-08-10T09:00:00.000Z', by: 'd_elsewhere' };
    ledger.advances.le_back = { id: 'le_back', advanceId, kind: 'repaid', workerId: 'w_01',
        date: '2026-08-18', amount: 1000, note: '', method: 'cash',
        at: '2026-08-18T09:00:00.000Z', by: 'd_elsewhere' };
    device.State.save({ silent: true });
    given('the two answers really do differ here',
        device.call('advanceOutstanding', device.State.schedule, advanceId).left === 4000);

    const held = device.facts('w_01');
    same('with cash handed back on the record it still says what was handed over',
        held.owed, { label: 'מקדמות רשומות', amount: `${ADVANCE} ₪` });
    same('and the sheet\'s three figures have not moved',
        [num(cellOf(held, 'נצבר')), num(cellOf(held, 'מקדמות')), num(cellOf(held, 'לתשלום'))],
        [GROSS, -ADVANCE, GROSS - ADVANCE]);
    same('while the movement itself is listed - it is a fact, not an arithmetic',
        held.moves.map(move => [move.label, plain(move.amount)]),
        [['הוחזר במזומן', '1000 ₪'], ['ניתנה מקדמה', '5000 ₪']]);

    // AN APPROVAL HELD ONLY IN MEMORY IS NOT ONE ON THE DISK: a reopened phone.
    const plan = device.call('planCarryMigration', device.State.schedule);
    const stale = device.dump();
    const committed = device.State.commit(device.call('recordCarryApproval',
        device.State.schedule, plan, '2026-08-25T09:00:00.000Z', 'd_person'));
    given('the approval committed durably', committed === true
        && device.call('carryMigrationSettled', device.State.schedule) === true);

    const after = device.facts('w_01');
    // 5,000 handed over, 1,000 handed back: 4,000 owed, against a wage of 3,050. So the
    // whole wage comes off, nothing is payable, and 950 goes on to the next account.
    same('a durable approval moves the card: 3,050 earned, 3,050 deducted, nothing payable',
        [num(cellOf(after, 'נצבר')), num(cellOf(after, 'נוכה מהשכר')), num(cellOf(after, 'לתשלום'))],
        [GROSS, -GROSS, 0]);
    check('and now it names the 950 that carries',
        after.notes.some(note => note === '950 ₪ מקדמה עוברים לחשבון הבא'), after.notes.join(' | '));
    same('and what stands over the advances is now what is left, in the words for that',
        after.owed, { label: 'נשאר להחזיר', amount: '4000 ₪' });
    check('the column is the deduction now', cellOf(after, 'מקדמות') === undefined,
        JSON.stringify(after.pay));

    const again = withCard(makeDevice({ deviceId: 'd_gate_r', storage: stale, flags: OPEN }));
    again.State.load();
    again.setToday('2026-08-20');
    same('a phone opened from the disk as it was before the approval reads the old way',
        again.facts('w_01').owed, { label: 'מקדמות רשומות', amount: `${ADVANCE} ₪` });
}

// ---------------------------------------------------------------- the gate's own function
{
    suite('one reading asks the gate once, by its own function, and leaves it as it found it');

    // The fixture above is exactly the record the question is dear on: a man whose
    // balance has not cleared. The real function is counted from underneath the card.
    const device = approvalPhone();
    device.run(`var GATE_ASKS = 0; var GATE_REAL = carryReportingEnabled;
        carryReportingEnabled = function counted(schedule) { GATE_ASKS += 1; return GATE_REAL(schedule); };
        var GATE_COUNTED = carryReportingEnabled;`);
    const unapproved = device.facts('w_01');
    same('the unapproved answer came from the real function, asked once',
        [device.run('GATE_ASKS'), unapproved.owed.label], [1, 'מקדמות רשומות']);
    check('and the function on the page afterwards is the one that was there before',
        device.run('carryReportingEnabled === GATE_COUNTED') === true);

    device.State.commit(device.call('recordCarryApproval', device.State.schedule,
        device.call('planCarryMigration', device.State.schedule), '2026-08-25T09:00:00.000Z', 'd_person'));
    device.run('GATE_ASKS = 0');
    same('a later reading asks again - nothing is remembered between two readings',
        [device.facts('w_01').owed.label, device.run('GATE_ASKS')], ['נשאר להחזיר', 1]);

    // A THROW in the middle of a reading: the range, the filter and the gate all go back.
    device.run(`REPORT_RANGE.from = '2026-01-01'; REPORT_RANGE.to = '2026-01-31'; REPORT_WORKERS = null;
        var REAL_NOTES = moneyNotes; moneyNotes = function () { throw new Error('planted'); };`);
    const thrown = device.run(`(function () { try { workerCardFacts('w_01'); return 'no throw'; }
        catch (error) { return error.message; } })()`);
    device.run('moneyNotes = REAL_NOTES');
    same('a reading that throws', thrown, 'planted');
    same('still leaves the report on the range and the men it was on, and the gate its own',
        JSON.parse(device.run('JSON.stringify([REPORT_RANGE.from, REPORT_RANGE.to, REPORT_WORKERS,'
            + ' carryReportingEnabled === GATE_COUNTED])')), ['2026-01-01', '2026-01-31', null, true]);

    // And a schedule that is not the one on the phone is never answered from memory.
    const other = JSON.parse(JSON.stringify(device.State.schedule));
    other.ledger.migrations = {};
    same('inside a reading, another schedule gets its own answer from the real function',
        device.run(`(function (other) {
            return workerCardScope('w_01', { from: '2026-08-07', to: '2026-08-20' }, function () {
                return [carryReportingEnabled(State.schedule), carryReportingEnabled(other),
                    carryReportingEnabled(State.schedule)];
            }).join(',');
        })(${JSON.stringify(other)})`), 'true,false,true');
}

// ---------------------------------------------------------------- the credit (v180)
{
    suite('money handed back beyond the debt is on the card as his credit, in v180\'s words');

    // One fortnight worked, 1,000 handed over in it and 1,500 handed back: 500 is his.
    const record = {
        schemaVersion: 2,
        workers: [{ id: 'w_d', name: 'דוד', dailyRate: RATE, hourlyRate: 0, active: true }],
        places: [{ id: 'p_x', name: 'חיפה', active: true }],
        days: {}, vehicles: [],
        advances: { a_1: { id: 'a_1', workerId: 'w_d', date: '2026-08-10', amount: 1000, note: '' } },
        ledger: { advances: {
            le_mig_a_1: { id: 'le_mig_a_1', advanceId: 'a_1', kind: 'given', workerId: 'w_d',
                date: '2026-08-10', amount: 1000, note: '', at: '2026-08-10T08:00:00.000Z', by: 'd' },
            le_back: { id: 'le_back', advanceId: 'a_1', kind: 'repaid', date: '2026-08-12',
                amount: 1500, note: '', at: '2026-08-12T08:00:00.000Z', by: 'd2' }
        }, unreadable: {},
        migrations: { cm_carry: { id: 'cm_carry', kind: 'carry', rows: 0, at: '', by: 'd' } } }
    };
    ['2026-08-10', '2026-08-11', '2026-08-24'].forEach(date => {
        record.days[date] = { plan: {}, actual: { w_d: { entries: [{ placeId: 'p_x' }],
            rates: { daily: RATE, hourly: 0 } } } };
    });
    const device = withCard(makeDevice({ deviceId: 'd_credit', flags: OPEN,
        storage: { 'scheduleData:v2': JSON.stringify(record) } }));
    device.State.load();
    device.setToday('2026-08-25');
    given('the record may be read the new way',
        device.call('carryReportingEnabled', device.State.schedule) === true);

    const facts = device.facts('w_d');
    same('he opens the next fortnight 500 in credit, under the two phrases v180 named',
        facts.credit, [{ label: 'יתרת זכות מחשבון קודם', amount: '500 ₪' },
            { label: 'יתרת זכות', amount: '500 ₪' }]);
    same('and owes nothing', facts.owed, { label: 'נשאר להחזיר', amount: '0 ₪' });
    check('the sheet\'s own note says the same figure',
        facts.notes.some(note => note === '500 ₪ יתרת זכות מחשבון קודם'), facts.notes.join(' | '));
}

// ---------------------------------------------------------------- 2c. beside the pay book
{
    suite('with the pay book open, the card and the accounts page say one debt (the test seam)');

    // The card reads openAdvanceBalance and the walk; the accounts page (js/ui/accounts.js)
    // draws accountFor's `debt` and `credit` - the pay book's own fold. They are two
    // functions in two files, and the pay book's gate moves the walk under one of them
    // (the one-debt ruling). Asked here over the same twelve records, with the pay book
    // open through the seam, so that a man is never 1,000 on his card and 1,500 on the
    // accounts page.
    const BOOK = Object.assign({}, OPEN, { paybook: true });
    const rows = [];
    const unapproved = [];
    SEEDS.forEach(seed => {
        const device = seededPhone(seed, BOOK);
        const schedule = device.State.schedule;
        given(`record ${seed}: the pay book and the one-debt ruling are on`,
            device.call('paybookWritesEnabled', schedule) === true && device.call('advanceDebtStays', schedule) === true);
        const approvedNow = device.call('carryReportingEnabled', schedule) === true;
        const read = () => schedule.workers.map(worker => {
            const facts = device.facts(worker.id);
            const account = device.call('accountFor', device.State.schedule, worker, TODAY);
            return { id: `${seed}/${worker.id}`, label: facts.owed.label, owed: num(facts.owed.amount),
                debt: account.debt, credit: account.credit,
                cardCredit: facts.credit.map(line => [line.label, num(line.amount)]) };
        });
        if (!approvedNow) {
            // KNOWN, and closed by the activation step (docs/payroll-closure.md, Phase 8):
            // until the carry is approved on a record the card says what was HANDED OVER,
            // under «מקדמות רשומות», while the accounts page reads the fold.
            read().forEach(row => unapproved.push(row));
            const stampAt = '2026-11-10T09:00:00.000Z';
            const written = device.call('recordCarryApproval', device.State.schedule,
                device.call('planCarryMigration', device.State.schedule), stampAt, 'd_owner');
            given(`record ${seed}: the carry approval is committed`, device.State.commitMany([{ path: written.path, value: written.value }]) === true);
            given(`record ${seed}: and the record now reads the new way`, device.call('carryReportingEnabled', device.State.schedule) === true);
        }
        read().forEach(row => rows.push(row));
    });
    given('the corpus has men who owe, men who do not, and a record nobody had approved',
        rows.some(row => row.debt > 0) && rows.some(row => row.debt === 0) && unapproved.length > 0,
        `${rows.filter(row => row.debt > 0).length} owing of ${rows.length}; ${unapproved.length} read before approval`);
    same('ONCE THE CARRY IS APPROVED, every man\'s «נשאר להחזיר» on his card is the accounts page\'s «חוב מקדמות», to the agora',
        rows.filter(row => row.label !== 'נשאר להחזיר' || row.owed !== row.debt), []);
    same('and a man the accounts page shows in credit owes nothing on his card',
        rows.filter(row => row.credit > 0 && row.owed !== 0), []);
    // Before the approval: a statement of what a person would see, not a guarantee.
    check('BEFORE the carry is approved the card does not claim «נשאר להחזיר» at all - it says «מקדמות רשומות», what was handed over',
        unapproved.every(row => row.label === 'מקדמות רשומות'), JSON.stringify(unapproved.slice(0, 3)));
    console.log(`  (measured: of ${unapproved.length} men read before the approval, ${unapproved.filter(row => row.owed !== row.debt).length} read a different figure on the card than on the accounts page)`);

    // The credit, on the fixture v180 was argued on, with the pay book open.
    const record = {
        schemaVersion: 2,
        workers: [{ id: 'w_d', name: 'דוד', dailyRate: RATE, hourlyRate: 0, active: true }],
        places: [{ id: 'p_x', name: 'חיפה', active: true }],
        days: {}, vehicles: [],
        advances: { a_1: { id: 'a_1', workerId: 'w_d', date: '2026-08-10', amount: 1000, note: '' } },
        ledger: { advances: {
            le_mig_a_1: { id: 'le_mig_a_1', advanceId: 'a_1', kind: 'given', workerId: 'w_d',
                date: '2026-08-10', amount: 1000, note: '', at: '2026-08-10T08:00:00.000Z', by: 'd' },
            le_back: { id: 'le_back', advanceId: 'a_1', kind: 'repaid', date: '2026-08-12',
                amount: 1500, note: '', at: '2026-08-12T08:00:00.000Z', by: 'd2' }
        }, unreadable: {},
        migrations: { cm_carry: { id: 'cm_carry', kind: 'carry', rows: 0, at: '', by: 'd' } } }
    };
    ['2026-08-10', '2026-08-11', '2026-08-24'].forEach(date => {
        record.days[date] = { plan: {}, actual: { w_d: { entries: [{ placeId: 'p_x' }],
            rates: { daily: RATE, hourly: 0 } } } };
    });
    const credit = withCard(makeDevice({ deviceId: 'd_credit_book', flags: BOOK,
        storage: { 'scheduleData:v2': JSON.stringify(record) } }));
    credit.State.load();
    credit.setToday('2026-08-25');
    const facts = credit.facts('w_d');
    const account = credit.call('accountFor', credit.State.schedule, credit.State.schedule.workers[0], '2026-08-25');
    same('500 handed back beyond the debt: the card says 0 owed and 500 «יתרת זכות»; the accounts page says debt 0, credit 500',
        [facts.owed, facts.credit.map(line => line.amount), account.debt, account.credit],
        [{ label: 'נשאר להחזיר', amount: '0 ₪' }, ['500 ₪', '500 ₪'], 0, 500]);
    // He takes 1,500 in the open fortnight: both say 1,000.
    const later = JSON.parse(JSON.stringify(record));
    later.advances.a_2 = { id: 'a_2', workerId: 'w_d', date: '2026-08-24', amount: 1500, note: '' };
    later.ledger.advances.le_mig_a_2 = { id: 'le_mig_a_2', advanceId: 'a_2', kind: 'given', workerId: 'w_d',
        date: '2026-08-24', amount: 1500, note: '', at: '2026-08-24T08:00:00.000Z', by: 'd' };
    const took = withCard(makeDevice({ deviceId: 'd_credit_book2', flags: BOOK,
        storage: { 'scheduleData:v2': JSON.stringify(later) } }));
    took.State.load();
    took.setToday('2026-08-25');
    const after = took.facts('w_d');
    const then = took.call('accountFor', took.State.schedule, took.State.schedule.workers[0], '2026-08-25');
    same('he then takes 1,500: his card says 1,000 left to return and the accounts page says «חוב מקדמות» 1,000 - not 1,500 on either',
        [after.owed, then.debt, then.credit], [{ label: 'נשאר להחזיר', amount: '1000 ₪' }, 1000, 0]);
}

// ---------------------------------------------------------------- 3. it writes nothing
{
    suite('opening the card for every man leaves every byte on the disk where it was');

    const device = seededPhone(31, OPEN);
    const workers = device.State.schedule.workers.map(worker => worker.id);
    given('there is a crew, and money on the record', workers.length > 2
        && Object.keys(device.State.schedule.advances || {}).length > 0);

    const disk = JSON.stringify(device.dump());
    const record = JSON.stringify(device.State.schedule);
    const outbox = Object.keys(device.dump()).filter(key => key.indexOf('farkad:outbox') === 0).length;
    const touched = [];
    device.setQuota(key => { touched.push(`set ${key}`); return false; });
    device.blockRemoval(key => { touched.push(`remove ${key}`); return false; });
    const renders = device.renders.count;

    workers.forEach(id => {
        device.run(`(function (id) {
            openWorkerCard(id);
            renderWorkerCardIfOpen();
            closeWorkerCard();
            openWorkerCard(id); workerCardGo('advances');
            openWorkerCard(id); workerCardGo('report');
        })(${JSON.stringify(id)})`);
    });

    check('not one write reached the disk', touched.length === 0, touched.slice(0, 5).join(', '));
    check('every key holds the bytes it held', JSON.stringify(device.dump()) === disk);
    check('the record in memory is the record it was',
        JSON.stringify(device.State.schedule) === record);
    same('nothing was queued for the cloud',
        Object.keys(device.dump()).filter(key => key.indexOf('farkad:outbox') === 0).length, outbox);
    same('and the card asked for no redraw of its own', device.renders.count, renders);
    same('it left by its two buttons, to the two screens they name',
        device.views.slice(-2), ['advances', 'reports']);

    // The recorder can see a write: one real commit, and everything above would have failed.
    device.State.commit(device.call('assignPlace', device.State.schedule, TODAY, workers[0],
        'actual', device.State.schedule.places[0].id));
    check('the same recorder notices a real commit', touched.length > 0
        && JSON.stringify(device.dump()) !== disk, String(touched.length));

    // And in its code: nothing that commits, stores, queues or sends. Comments are taken
    // out first - the file's own header names several of these to say it avoids them.
    const code = CARD.split('\n').filter(line => line.trim().indexOf('//') !== 0)
        .map(line => line.replace(/\s\/\/ .*$/, '')).join('\n');
    const writers = code.match(new RegExp([
        '\\bStore\\b', 'localStorage', 'sessionStorage', 'indexedDB', '\\.commit', 'commitMany',
        'commitRoster', '\\.save\\(', '\\.persist\\(', 'FarkadSync', '\\bfetch\\(', 'window\\.open',
        '\\brecord[A-Z]\\w*\\(', 'addAdvance', 'removeAdvance', 'assignPlace', 'markAbsent',
        'setWorkerDay', 'closePeriodChanges', 'saveFinancialAction', '<input', 'createElement'
    ].join('|'), 'g')) || [];
    same('the card\'s code calls nothing that writes, and builds no field', writers, []);
}

// ---------------------------------------------------------------- the drawing
{
    suite('what is drawn is what was read, with nothing on it to press');

    const device = seededPhone(32, OPEN);
    // A man with a row on the sheet this period, so every part of the card has something
    // in it to be drawn.
    const worker = device.State.schedule.workers.filter(one => device.facts(one.id).pay !== null)[0];
    given('the record has such a man', Boolean(worker));
    const facts = device.facts(worker.id);
    device.run(`openWorkerCard(${JSON.stringify(worker.id)})`);
    const modal = device.dom.getElementById('workerCardModal');
    const body = device.dom.getElementById('workerCardBody');
    const text = body.textContent;

    same('the card is open', modal.style.display, 'flex');
    same('headed by the words and the man',
        device.dom.getElementById('workerCardTitle').textContent, `כרטיס עובד · ${worker.name}`);
    const expected = [facts.cycle, facts.period.range, facts.owed.label, facts.owed.amount,
        'התקופה הנוכחית', 'מקדמות', 'תנועות אחרונות', '14 הימים האחרונים', 'ימים בכל אתר החודש']
        .concat((facts.pay || []).map(cell => cell.label))
        .concat((facts.pay || []).map(cell => cell.value))
        .concat(facts.notes).concat(facts.finance ? [facts.finance] : [])
        .concat(facts.moves.map(move => move.label + move.date))
        .concat(facts.strip.map(day => day.when))
        .concat(facts.month.map(site => site.name));
    const missing = expected.filter(piece => text.indexOf(piece) === -1);
    check('every figure and every heading of the reading is on it', missing.length === 0
        && expected.length > 30, missing.join(' | '));
    same('there is no button, field, link or switch in its body',
        ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A', 'DETAILS']
            .map(tag => body.querySelectorAll(tag).length), [0, 0, 0, 0, 0, 0]);
    same('its two ways out are named after the screens they open',
        [device.dom.getElementById('workerCardReport').textContent,
            device.dom.getElementById('workerCardAdvances').textContent],
        ['שכר - לפי עובד', 'מקדמות']);
    check('the advances screen really is headed by that word, and the sheet by that heading',
        source('js/ui/reports.js').indexOf("el('h2', null, 'מקדמות')") !== -1
        && source('js/ui/reports.js').indexOf("el('h2', null, 'שכר - לפי עובד')") !== -1);

    // A SNAPSHOT FROM ANOTHER PHONE while it is open: render() redraws it.
    const days = () => num(cellOf(device.facts(worker.id), 'נוכחות') || '');
    const had = days();
    const free = datesBetween(facts.period.from, TODAY)
        .filter(date => !device.oracle[worker.id][date])[0];
    given('he has a day in his period with nothing recorded on it', Boolean(free), String(free));
    device.call('assignPlace', device.State.schedule, free, worker.id, 'actual',
        device.State.schedule.places[0].id);
    device.run('renderWorkerCardIfOpen()');
    same('a day recorded under the open card is on it at the next render', days(), had + 1);
    check('and it is the drawn card that moved, not only the reading',
        body.textContent.indexOf(device.facts(worker.id).pay
            .filter(cell => cell.label === 'נצבר' || cell.label === 'נוכחות')
            .map(cell => cell.label + (cell.value || '0'))[0]) !== -1);
    check('render() is where the redraw is asked for',
        source('js/app.js').indexOf("if (typeof renderWorkerCardIfOpen === 'function') renderWorkerCardIfOpen();") !== -1);

    // HE LEFT THE RECORD while it was open.
    device.State.schedule.workers = device.State.schedule.workers.filter(one => one.id !== worker.id);
    device.run('renderWorkerCardIfOpen()');
    same('a card about a man who is no longer on the record closes', modal.style.display, 'none');

    device.run(`openWorkerCard(${JSON.stringify(device.State.schedule.workers[0].id)})`);
    given('another man\'s card opens', modal.style.display === 'flex');
    device.run('closeWorkerCard()');
    same('closing it hides it', modal.style.display, 'none');
    check('and forgets whose it was', device.run('WORKER_CARD_ID') === null);
    check('Escape reaches that same function (js/ui/modal.js)',
        source('js/ui/modal.js').indexOf('workerCardModal: () => closeWorkerCard()') !== -1);
}

// ---------------------------------------------------------------- the way in
{
    suite('one worded control on the crew row, and the two that were there unmoved');

    const device = seededPhone(33, SHUT);
    const worker = device.State.schedule.workers[0];
    const row = JSON.parse(device.run(`(function () {
        const row = workerRow(State.worker(${JSON.stringify(worker.id)}));
        const actions = row.querySelector('.roster-actions');
        return JSON.stringify({
            order: row.children.map(node => node.className.split(' ')[0]),
            first: row.querySelector('.roster-details').children.slice(0, 2)
                .map(node => node.tagName),
            cards: row.querySelectorAll('.worker-card-open').map(node => ({
                text: node.textContent, label: node.getAttribute('aria-label'),
                popup: node.getAttribute('aria-haspopup'), tag: node.tagName })),
            actions: actions.children.map(node => node.textContent)
        });
    })()`));
    same('exactly one, a button, saying what it opens', row.cards.map(card => [card.tag, card.text]),
        [['BUTTON', 'כרטיס עובד']]);
    same('named for the man, his name isolated like every other name in a label',
        row.cards[0].label, `כרטיס עובד של ⁨${worker.name}⁩`);
    same('and announced as opening a dialog', row.cards[0].popup, 'dialog');
    same('the row is still his details and the column of two controls, and nothing else',
        row.order, ['roster-details', 'roster-actions']);
    same('it is the first thing in his details, ahead of his name',
        row.first, ['BUTTON', 'STRONG']);
    same('which are the same two, in the same order, under the same words',
        row.actions, [worker.active === false ? 'כבוי' : 'פעיל', 'עוד ⋯']);
    check('the «עוד ⋯» menu is as it was - the card is not a choice inside it',
        /const choices = \['עריכת פרטים'\];\s+if \(permanentDeletionEnabled\(\)\) choices\.push\('מחיקת עובד'\);\s+choices\.push\('סגור'\);/
            .test(source('js/ui/roster.js')));
    check('the day screen\'s worker name still opens his assign sheet and nothing else',
        source('js/ui/day.js').indexOf('openWorkerCard') === -1
        && source('js/ui/sheet.js').indexOf('openWorkerCard') === -1);
}

// ---------------------------------------------------------------- 4. the words
{
    suite('every new word, word for word - proposed, for the owner to approve');

    const device = seededPhone(34, SHUT);
    same('the six strings this feature adds', JSON.parse(device.run('JSON.stringify(WORKER_CARD_TEXT)')), {
        title: 'כרטיס עובד',
        openFor: 'כרטיס עובד של',
        moves: 'תנועות אחרונות',
        noMoves: 'אין תנועות רשומות.',
        strip: '14 הימים האחרונים',
        month: 'ימים בכל אתר החודש'
    });

    // The borrowed words, each found in the file that owns it - so a word changed there
    // and left here fails by name, and none of them is a new coinage in disguise.
    const owners = {
        weekly: ['js/ui/roster.js', "'תשלום שבועי'"],
        biweekly: ['js/ui/roster.js', "'תשלום כל שבועיים'"],
        noPhone: ['js/ui/roster.js', "'בלי טלפון'"],
        inactive: ['js/ui/roster.js', "'לא פעיל'"],
        recorded: ['js/ui/roster.js', '`מקדמות רשומות: '],
        dailyRate: ['js/ui/reports.js', "headers.push('שכר יומי', 'נצבר')"],
        hourlyRate: ['index.html', '<label class="field-label" for="workerFormHourly">שכר לשעה נוספת</label>'],
        period: ['js/ui/reports.js', "['התקופה הנוכחית', 0]"],
        nothing: ['js/ui/reports.js', "emptyHint('אין רישומים בטווח הזה.')"],
        noDays: ['js/ui/reports.js', "'אין ימי עבודה בתקופה הזו.'"],
        advances: ['js/ui/reports.js', "el('h2', null, 'מקדמות')"],
        left: ['js/ui/reports.js', "'נשאר להחזיר'"],
        absent: ['js/ui/reports.js', "{ header: 'נעדר'"],
        report: ['js/ui/reports.js', "el('h2', null, 'שכר - לפי עובד')"]
    };
    const reused = JSON.parse(device.run('JSON.stringify(WORKER_CARD_REUSED)'));
    same('the borrowed words are exactly the ones this suite knows the owners of',
        Object.keys(reused).sort(), Object.keys(owners).sort());
    const strangers = Object.keys(owners).filter(key =>
        source(owners[key][0]).indexOf(owners[key][1]) === -1
        || owners[key][1].indexOf(reused[key]) === -1);
    same('and each is in its owner\'s source, as that screen says it', strangers, []);

    // No Hebrew anywhere else in the code: a sentence composed in passing is a string
    // nobody approved and no test pins.
    const blocks = /const WORKER_CARD_TEXT = \{[\s\S]*?\n\};|const WORKER_CARD_REUSED = \{[\s\S]*?\n\};/g;
    given('both blocks are found', (CARD.match(blocks) || []).length === 2);
    const loose = CARD.replace(blocks, '').split('\n')
        .filter(line => line.trim().indexOf('//') !== 0)
        .map(line => line.replace(/\s\/\/ .*$/, ''))
        .filter(line => /[֐-׿]/.test(line));
    same('outside its two blocks the card\'s code holds no Hebrew letter', loose, []);
    check('the one word in its frame is the word every other dialog closes by',
        source('index.html').indexOf('<button type="button" class="btn-secondary" onclick="closeWorkerCard()">סגור</button>') !== -1
        && source('index.html').indexOf('onclick="closeWorkerDays()">סגור</button>') !== -1);
    check('and no existing string was changed to make room: the crew row still says its own',
        source('js/ui/roster.js').indexOf("button('עוד ⋯', 'btn-icon crew-edit'") !== -1
        && source('js/ui/roster.js').indexOf("button(enabled ? 'פעיל' : 'כבוי',") !== -1);
}

// ---------------------------------------------------------------- the shell
{
    suite('the file is on the page, in order, and in the offline shell');

    const page = source('index.html');
    const scripts = [...page.matchAll(/<script src="([^"]+)"><\/script>/g)].map(match => match[1]);
    const at = scripts.indexOf('js/ui/workercard.js');
    check('index.html loads it once, as a classic script',
        scripts.filter(src => src === 'js/ui/workercard.js').length === 1
        && page.indexOf('type="module" src="js/ui/workercard.js"') === -1);
    check('after the sheet, the crew row, the site colours and the dialogs it asks',
        ['js/ui/reports.js', 'js/ui/roster.js', 'js/ui/sitecolor.js', 'js/ui/modal.js',
            'js/ui/dom.js', 'js/model/ledger.js', 'js/state.js']
            .every(src => scripts.indexOf(src) !== -1 && scripts.indexOf(src) < at),
        String(at));
    check('and before boot', at < scripts.indexOf('js/app.js'), String(at));
    check('the service worker\'s shell names it', source('sw.js').indexOf("'./js/ui/workercard.js',") !== -1);
    check('its frame is one of the app\'s dialogs, with a heading the dialog is entered at',
        /<div class="modal" id="workerCardModal">\s+<div class="modal-content modal-wide">\s+<h3 id="workerCardTitle" tabindex="-1"><\/h3>/
            .test(page));
    check('its look is in the design layer and nowhere else',
        source('css/design.css').indexOf('.worker-card-open') !== -1
        && source('css/app.css').indexOf('wcard') === -1
        && source('css/readability.css').indexOf('wcard') === -1);
}

report();
