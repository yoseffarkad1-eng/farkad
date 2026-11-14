// «תלוש לכל עובד» - each man's pay statement, one WhatsApp door per man - on devices.
//
//   node tests/payslips.test.mjs
//
// js/ui/payslips.js is the seder's pattern for pay: the men with a row on the pay sheet
// for their own period, each with his «נותר לתשלום» and one door that opens WhatsApp on
// his number with his statement. A statement sent to the wrong man, or for the wrong
// period, or with a figure the sheet does not show, is an error in the world and not on a
// screen. So what this suite holds is that the list CANNOT SAY ANYTHING OF ITS OWN:
//
//   1. THE TEXT IS THE STATEMENT. Over seeded records - two cycles, a cycle that changes
//      mid-fortnight, men with no rate, advances, cash handed back, a closed fortnight -
//      under both readings of the money gates and for both periods the list offers, each
//      man's text is, byte for byte, workerStatementText for him with the report pointed
//      at his own period by other code than the list's.
//   2. THE FIGURE IS THE SHEET'S. The number on his row is the «לתשלום» cell the pay sheet
//      draws for him, as text; and it is the number his text states. Where the two are
//      not one figure the row says so and offers no door - shown on a record built to
//      make them differ.
//   3. THE LIST IS THE SHEET'S ROWS. A man is listed exactly when the sheet has a row for
//      him over his own period - and a man with nothing in it is not.
//   4. THE DOOR IS HIS. wa.me/<his normalised number>?text=<his statement>, and no other
//      man's number unless the list says the two share one.
//   5. THE GATE IS THE SHEET'S: tests/approval.test.mjs's own fixture and its own three
//      numbers, before and after a durable approval.
//   6. IT WRITES ONE PREFERENCE AND NOTHING ELSE: not the record, the outbox, the fence,
//      the cloud, a backup or the rescue file; a damaged value means nobody opened.
//   7. THE WORDS, word for word; the borrowed ones found where their owners keep them;
//      never «נשלח»; and nothing of it in the day's WhatsApp dialog.
//
// The screen itself - the entry in «הפקת דוח», the tap, the popup's address, the preview,
// the copy, a reload mid-run, the rectangles - is tests/payslips.browser.mjs.

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDevice, makeCloud, settle, settleUntil } from './harness.mjs';
import { makeDom } from './moneydom.mjs';
import { suite, check, same, given, report } from './runner.mjs';

process.env.TZ = 'Asia/Jerusalem';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = file => readFileSync(join(ROOT, file), 'utf8');
const SLIPS = source('js/ui/payslips.js');
const KEY = 'farkadPayslipsProgress';

const SHUT = { carryAdvances: false, ledgerWrites: false };
const OPEN = { carryAdvances: true, ledgerWrites: true };

// A Tuesday in the second week of the fortnight that opened on Friday 30 October: a
// weekly man is four days into his week and a fortnightly one eleven into his account.
const TODAY = '2026-11-10';
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
// The bidi marks the app pins its signs with, and the * on a wage that leaves unpriced
// hours out - taken off, so that a figure is the figure as written.
const plain = text => String(text).replace(/[‎‏‪-‮⁦-⁩]/g, '').replace(/\s*\*$/, '').trim();
const FSI = '⁨';
const PDI = '⁩';
const named = name => `${FSI}${name}${PDI}`;

// The report code, the seder (whose phone rule, link and words the list borrows) and the
// list, in the device's own context, over a DOM that can be read back and pressed.
function withSlips(device) {
    const dom = makeDom();
    ['reportsView', 'workerDaysTitle', 'workerDaysMeta', 'workerDaysBody', 'workerDaysModal',
        'payslipsModal', 'payslipsTitle', 'payslipsWhich', 'payslipsContext', 'payslipsLead',
        'payslipsNote', 'payslipsList', 'payslipsStatus', 'payslipsSaid', 'payslipsClose']
        .forEach(id => dom.register(id));
    const make = dom.createElement;
    dom.createElement = tag => {
        const node = make(tag);
        node.dataset = {};
        node.listeners = {};
        node.addEventListener = (type, heard) => { node.listeners[type] = heard; };
        return node;
    };
    // The harness's own document is the one that hands files over (a backup, the rescue
    // file); it is kept, and put back by the one suite that exports.
    device.realDocument = device.ctx.document;
    device.ctx.document = dom;
    device.dom = dom;
    device.run = code => vm.runInContext(code, device.ctx, { filename: 'harness:payslips' });
    device.run(source('js/ui/sitecolor.js'));
    device.run(source('js/ui/reports.js'));
    device.run(source('js/ui/seder.js'));
    device.run(SLIPS);
    device.views = [];
    device.ctx.showView = view => { device.views.push(view); };
    device.ctx.askTell = () => Promise.resolve();
    device.ctx.askConfirm = () => Promise.resolve(true);
    device.setToday(TODAY);
    device.facts = which => JSON.parse(device.run(`JSON.stringify(payslipsFacts(${JSON.stringify(which || 'current')}))`));
    device.rowOf = (id, which) => device.facts(which).rows.filter(row => row.workerId === id)[0];
    // A mark, a state and a link asked of the row the list itself holds - never of a
    // copy that has been through JSON, though the two are the same data.
    device.onRow = (id, which, body) => device.run(`(function () {
        const row = payslipsFacts(${JSON.stringify(which || 'current')}).rows
            .filter(one => one.workerId === ${JSON.stringify(id)})[0];
        return row ? (${body})(row) : 'no row';
    })()`);
    return device;
}

// ---------------------------------------------------------------- the sheet, by other code
//
// What the pay sheet says about ONE man over ONE range, reached without a line of
// js/ui/payslips.js: the report is pointed by hand, the sheet is drawn, and its table is
// read back; the statement is the function «שלח לעובד» calls. Everything is put back.
function sheetFor(device, id, from, to) {
    return JSON.parse(device.run(`(function (id, from, to) {
        const held = [REPORT_RANGE.from, REPORT_RANGE.to, REPORT_WORKERS, REPORT_SECTION];
        REPORT_RANGE.from = from; REPORT_RANGE.to = to;
        REPORT_WORKERS = new Set([id]); REPORT_SECTION = 'workers';
        const section = renderPayrollTable();
        const group = section.querySelectorAll('.report-payroll-group')[0];
        const table = group ? group.querySelector('table') : null;
        const out = JSON.stringify({
            head: table ? table.querySelectorAll('thead th').map(node => node.textContent) : null,
            body: table ? table.querySelectorAll('tbody tr')
                .map(tr => tr.children.map(td => td.textContent)) : [],
            finance: section.querySelectorAll('.report-finance-text').map(node => node.textContent),
            rows: payrollRows().length,
            statement: workerStatementText(id),
            account: workerAccountFor(id),
            folded: carryReportingEnabled(State.schedule) === true
        });
        REPORT_RANGE.from = held[0]; REPORT_RANGE.to = held[1];
        REPORT_WORKERS = held[2]; REPORT_SECTION = held[3];
        return out;
    })(${JSON.stringify(id)}, ${JSON.stringify(from)}, ${JSON.stringify(to)})`));
}

// The sheet's «לתשלום» for him out of that reading, as the list is meant to show it:
// his cell on the work table («—» where the table has no such column - the pay card's own
// step), or the figure in the financial line the sheet writes for a man with no days.
function sheetFigure(sheet) {
    if (sheet.body.length === 1) {
        const at = sheet.head.indexOf('לתשלום');
        return (at === -1 ? '' : sheet.body[0][at]) || '—';
    }
    if (sheet.finance.length === 1) {
        const match = sheet.finance[0].match(/ · לתשלום ([^·]*?)(?: ₪)?(?: · |$)/);
        return match ? match[1] : 'no figure in the line';
    }
    return null;
}

// ---------------------------------------------------------------- seeded records
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
    const first = makeDevice({ deviceId: `d_slip${seed}`, flags });
    first.setToday(TODAY);
    const schedule = first.State.schedule;

    const crew = 4 + Math.floor(rand() * 4);
    schedule.workers = [];
    const idle = {};
    for (let n = 1; n <= crew; n += 1) {
        const worker = {
            id: `w_${n}`, name: `עובד ${seed}-${n}`, active: rand() > 0.15,
            dailyRate: pick([0, 380, 410, 450, 610]), hourlyRate: pick([0, 0, 41.25, 60])
        };
        // Phones as people type them: local, international, the trunk zero left in, one
        // that is not a number, none at all - and now and then the number of the man above.
        const phone = rand();
        if (phone < 0.45) worker.phone = `05${n}-${String(1000000 + seed * 137 + n).slice(-7)}`;
        else if (phone < 0.6) worker.phone = `+972 (0)5${n} ${String(2000000 + seed * 91 + n).slice(-7)}`;
        else if (phone < 0.7) worker.phone = '03-5551234';
        else if (phone < 0.8 && n > 1 && schedule.workers[n - 2].phone) worker.phone = schedule.workers[n - 2].phone;
        const cycle = rand();
        if (cycle < 0.3) worker.payCycles = '2026-10-02=weekly';
        else if (cycle < 0.45) worker.payCycles = '2026-11-06=weekly';
        idle[worker.id] = rand() < 0.25 ? '2026-10-27' : null;
        schedule.workers.push(worker);
    }
    schedule.places = [1, 2, 3].map(n => ({ id: `p_${n}`, name: `אתר ${seed}-${n}`, active: true }));
    const siteIds = schedule.places.map(place => place.id);

    datesBetween(FIRST_DAY, TODAY).forEach(date => {
        schedule.workers.forEach(worker => {
            const roll = rand();
            if (roll < 0.30 || (idle[worker.id] && date >= idle[worker.id])) return;
            if (roll < 0.37) { first.call('markAbsent', schedule, date, worker.id, 'actual'); return; }
            const band = rand();
            const rate = band < 0.1 ? 'double' : band < 0.2 ? 'extra' : undefined;
            first.call('assignPlace', schedule, date, worker.id, 'actual', pick(siteIds), rate,
                rate === 'extra' ? pick([1, 2, 3.5]) : undefined);
        });
    });
    schedule.workers.forEach(worker => {
        const count = Math.floor(rand() * 3);
        for (let n = 0; n < count; n += 1) {
            first.call('addAdvance', schedule, worker.id,
                addDays(TODAY, -Math.floor(rand() * 30)), pick([200, 500, 1500, 5000, 250.5]), '');
        }
    });
    first.State.save({ silent: true });

    // REOPENED, which is what mirrors the advances into the ledger.
    const device = withSlips(makeDevice({ deviceId: `d_slip${seed}`, storage: first.dump(), flags }));
    device.State.load();
    device.approved = false;
    device.closed = null;

    if (flags.carryAdvances) {
        const plan = device.call('planCarryMigration', device.State.schedule);
        if (plan.needed && seed % 3 !== 1) {
            device.State.commit(device.call('recordCarryApproval', device.State.schedule,
                plan, '2026-11-01T09:00:00.000Z', 'd_person'));
        }
        device.approved = device.call('carryReportingEnabled', device.State.schedule) === true;

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

        // The fortnight BEFORE the open one, closed for the first fortnightly man the
        // model will close it for: the list's «התקופה הקודמת» then reads a frozen period.
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

// The gate answered once per record WHILE THE TWO SIDES ARE COMPARED - the step
// tests/workercard.test.mjs takes, for its reason: carryReportingEnabled re-plans the
// migration on every call, and the sheet and the statement ask it a dozen times a man.
// By the real function's name, so every reader on both sides still goes through the gate;
// the suites below that are ABOUT the gate ask the real thing every time.
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

// ---------------------------------------------------------------- 1-4. the corpus
const stateOfRow = (device, id, which) => device.onRow(id, which, 'row => payslipsState(row)');
const SEEDS = [41, 42, 43, 44, 45, 46, 47, 48, 49, 50];
const seen = { men: 0, listed: 0, absent: 0, weekly: 0, biweekly: 0, transition: 0, work: 0,
    finance: 0, unknown: 0, doors: 0, nophone: 0, shared: 0, differs: 0, review: 0,
    carried: 0, credit: 0, closedLine: 0, unapproved: 0, closed: 0, previous: 0, negative: 0,
    deducted: 0 };
const differing = [];

[['the money gates shut', SHUT], ['the money gates open', OPEN]].forEach(([reading, flags]) => {
    suite(`every man's text is his statement, his figure the sheet's, his door his own - ${reading}`);

    SEEDS.forEach(seed => {
        const device = seededPhone(seed, flags);
        const schedule = device.State.schedule;
        const wrong = [];
        const fail = (id, what, detail) => wrong.push(`${id} ${what}: ${detail}`);
        if (flags.carryAdvances && !device.approved) seen.unapproved += 1;
        if (device.closed) seen.closed += 1;
        const gateBack = device.run(GATE_ONCE);

        ['current', 'previous'].forEach(which => {
            // The report left on a range and a section nobody would confuse with anyone's
            // period, so a list that forgot to put it back is caught.
            device.run(`REPORT_RANGE.from = '2026-01-01'; REPORT_RANGE.to = '2026-01-31';`
                + `REPORT_WORKERS = null; REPORT_SECTION = 'sites';`);
            const facts = device.facts(which);
            const after = JSON.parse(device.run(
                'JSON.stringify([REPORT_RANGE.from, REPORT_RANGE.to, REPORT_WORKERS, REPORT_SECTION])'));
            if (JSON.stringify(after) !== JSON.stringify(['2026-01-01', '2026-01-31', null, 'sites'])) {
                fail(which, 'left the report somewhere else', JSON.stringify(after));
            }
            const listed = {};
            facts.rows.forEach(row => { listed[row.workerId] = row; });
            if (JSON.stringify(facts.rows.map(row => row.workerId))
                !== JSON.stringify(schedule.workers.map(one => one.id).filter(id => listed[id]))) {
                fail(which, 'order', 'not the roster\'s');
            }

            schedule.workers.forEach(worker => {
                const id = worker.id;
                const tag = `${which} ${id}`;
                seen.men += 1;
                // HIS OWN PERIOD, asked of the calendar here and not of the list.
                const now = device.call('periodRangeFor', worker, TODAY);
                const period = which === 'previous'
                    ? device.call('periodRangeFor', worker, addDays(now.from, -1)) : now;
                const sheet = sheetFor(device, id, period.from, period.to);
                const figure = sheetFigure(sheet);
                const row = listed[id];

                // 3. LISTED EXACTLY WHEN THE SHEET HAS A ROW FOR HIM.
                if (figure === null) {
                    seen.absent += 1;
                    if (row) fail(tag, 'listed with no row on the sheet', row.figure);
                    if (sheet.rows !== 0) fail(tag, 'the reading itself', String(sheet.rows));
                    return;
                }
                if (!row) { fail(tag, 'has a row on the sheet and is not listed', figure); return; }
                seen.listed += 1;
                if (which === 'previous') seen.previous += 1;
                if (period.cycle === 'weekly') seen.weekly += 1; else seen.biweekly += 1;
                if (period.transition) seen.transition += 1;
                if (sheet.body.length === 1) seen.work += 1; else seen.finance += 1;

                if (row.period.from !== period.from || row.period.to !== period.to) {
                    fail(tag, 'period', JSON.stringify(row.period));
                }
                const dates = [period.from, period.to].map(date => date.split('-').reverse().join('/'));
                if (plain(row.range) !== `${dates[0]} - ${dates[1]}`) fail(tag, 'range', row.range);
                if (row.cycle !== (period.cycle === 'weekly' ? 'תשלום שבועי' : 'תשלום כל שבועיים')) {
                    fail(tag, 'cycle', row.cycle);
                }

                // 1. THE TEXT IS THE STATEMENT, byte for byte - and names him and his dates.
                if (row.text !== sheet.statement) fail(tag, 'text', 'not workerStatementText');
                if (row.text.split('\n')[0]
                    !== `📄 ${named(worker.name)} - ${dates[0]} עד ${dates[1]}`) {
                    fail(tag, 'first line', row.text.split('\n')[0]);
                }

                // 2. THE FIGURE IS THE SHEET'S CELL, as text.
                if (row.figure !== figure) fail(tag, 'figure', `${row.figure} !== ${figure}`);
                if (row.known !== (plain(figure) !== '—')) fail(tag, 'known', String(row.known));
                if (!row.known) seen.unknown += 1;
                const stated = row.text.split('\n').filter(line => line.indexOf('נותר לתשלום: ') === 0);
                const inText = stated.length === 0 ? '—' : plain(stated[stated.length - 1].slice(13));
                if (stated.length > 1) fail(tag, 'two payable lines in one statement', String(stated.length));
                if (row.agrees !== (inText === plain(figure))) {
                    fail(tag, 'agrees', `${row.agrees} with ${inText} against ${plain(figure)}`);
                }
                const state = device.onRow(id, which, 'row => payslipsState(row)');
                if (!row.agrees) {
                    seen.differs += 1;
                    differing.push(`${reading} ${seed} ${tag}: text ${inText}, sheet ${plain(figure)}`);
                    if (state !== 'differs') fail(tag, 'a differing row is not held', state);
                } else if (row.known && Number(plain(figure)) < 0) {
                    seen.negative += 1;
                }

                // 4. THE DOOR IS HIS.
                const number = device.call('sederWaNumber', worker.phone);
                if (row.number !== number) fail(tag, 'number', `${row.number} !== ${number}`);
                if (number) {
                    seen.doors += 1;
                    const url = device.onRow(id, which, 'row => payslipsUrl(row)');
                    if (url !== `https://wa.me/${number}?text=${encodeURIComponent(sheet.statement)}`) {
                        fail(tag, 'link', url.slice(0, 60));
                    }
                    if (!/^9725\d{8}$/.test(number)) fail(tag, 'not an Israeli mobile', number);
                } else {
                    seen.nophone += 1;
                    if (row.agrees && state !== 'nophone') fail(tag, 'no number and not said', state);
                }
                const sharers = facts.rows.filter(other => other.workerId !== id
                    && other.number && other.number === row.number).map(other => other.name);
                if (JSON.stringify(row.sharedWith) !== JSON.stringify(sharers)) {
                    fail(tag, 'shared', JSON.stringify(row.sharedWith));
                }
                if (sharers.length > 0) seen.shared += 1;

                // WHAT STANDS ON HIM: the sheet's own sentence, from the sheet's own account.
                const warning = sheet.account ? device.call('overpaymentWarning', sheet.account) : null;
                if (row.review !== warning) fail(tag, 'review', String(row.review));
                if (warning) {
                    seen.review += 1;
                    if (row.text.indexOf(warning) === -1) fail(tag, 'the warning is not in his text', warning);
                }
                if (!sheet.folded && (row.review !== null || /יתרת פתיחה|יתרת זכות|חוב פתוח/.test(row.text))) {
                    fail(tag, 'a balance on a record nobody approved', row.text);
                }
                if (/\nיתרת פתיחה: /.test(row.text)) seen.carried += 1;
                if (/יתרת זכות/.test(row.text)) seen.credit += 1;
                if (sheet.account && sheet.account.closed) seen.closedLine += 1;
                if (/\nנוכה מהשכר: /.test(row.text)) seen.deducted += 1;
            });

            // The dates said before the first tap: one line per period, counting its men.
            const counted = {};
            facts.rows.forEach(row => { counted[row.period.key] = (counted[row.period.key] || 0) + 1; });
            if (facts.rows.length > 0 && JSON.stringify(facts.periods.map(one => [one.key, one.listed]).sort())
                !== JSON.stringify(Object.keys(counted).map(key => [key, counted[key]]).sort())) {
                fail(which, 'periods', JSON.stringify(facts.periods));
            }
        });

        gateBack();
        check(`record ${seed}: ${schedule.workers.length} men, both periods - listed as the sheet lists, `
            + 'worded as the statement words, figured as the sheet figures, linked to their own number',
            wrong.length === 0, wrong.slice(0, 3).join(' | '));
    });
});

{
    suite('and the corpus really held the cases it was written for');

    check('many men were asked about', seen.men > 150, String(seen.men));
    check('most of them listed', seen.listed > 100, String(seen.listed));
    check('some with nothing on the sheet, and so not on the list', seen.absent > 10, String(seen.absent));
    check('weekly men', seen.weekly > 20, String(seen.weekly));
    check('fortnightly men', seen.biweekly > 20, String(seen.biweekly));
    check('men in a period a change of cycle cut short', seen.transition > 0, String(seen.transition));
    check('men on the work table', seen.work > 80, String(seen.work));
    check('men with money and no day - the sheet\'s financial line', seen.finance > 0, String(seen.finance));
    check('men whose wage is unknown', seen.unknown > 0, String(seen.unknown));
    check('men owed less than nothing - an advance larger than the wage, gate shut', seen.negative > 0,
        String(seen.negative));
    check('doors', seen.doors > 50, String(seen.doors));
    check('men with no usable number', seen.nophone > 20, String(seen.nophone));
    check('men sharing a number', seen.shared > 0, String(seen.shared));
    check('the previous period, listed', seen.previous > 40, String(seen.previous));
    check('deductions', seen.deducted > 5, String(seen.deducted));
    check('balances carried in', seen.carried > 0, String(seen.carried));
    check('credits', seen.credit > 0, String(seen.credit));
    check('records whose migration nobody approved', seen.unapproved > 0, String(seen.unapproved));
    check('records with a fortnight already closed', seen.closed > 0, String(seen.closed));
    check('and a man listed over a fortnight that is closed', seen.closedLine > 0, String(seen.closedLine));
    // On these records the statement and the sheet state ONE figure for every man - which
    // is what lets the list send anything at all. A record that parts them (and what the
    // list does then) is built by hand below; a seeded one that did would be a finding
    // about the app's two surfaces, and is named here.
    same('rows on which the statement and the sheet stated different figures', seen.differs, 0);
    same('and which they were', differing.slice(0, 5), []);
}

// ---------------------------------------------------------------- a small crew, by hand
//
// Every expected value here is a literal somebody could check on paper.
//   אחמד   weekly, 400 a day, Sunday and Monday of his week          800
//   יוסי   fortnightly, 500 a day, one day, 200 advanced, no phone   300
//   סמיר   fortnightly, no rate, one day                             unknown
//   עלי    fortnightly, nothing recorded at all                      not listed
//   ח'אלד  fortnightly, 450 a day, one day - and סמיר's number       450
//   Dan    fortnightly, 400 a day, worked only LAST fortnight        not listed now
function crewPhone(id, flags) {
    const first = makeDevice({ deviceId: id, flags: flags || SHUT });
    first.setToday(TODAY);
    first.State.schedule.workers = [
        { id: 'w_01', name: 'אחמד', active: true, dailyRate: 400, hourlyRate: 0,
            phone: '052-884-1930', payCycles: '2026-10-02=weekly' },
        { id: 'w_02', name: 'יוסי', active: true, dailyRate: 500, hourlyRate: 0, phone: '' },
        { id: 'w_03', name: 'סמיר', active: true, dailyRate: 0, hourlyRate: 0, phone: '0501112233' },
        { id: 'w_04', name: 'עלי', active: true, dailyRate: 400, hourlyRate: 0, phone: '0549998877' },
        { id: 'w_05', name: 'ח\'אלד', active: true, dailyRate: 450, hourlyRate: 0,
            phone: '+972 (0)50-111-2233' },
        { id: 'w_06', name: 'Dan', active: true, dailyRate: 400, hourlyRate: 0, phone: '0587654321' }
    ];
    first.State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
    first.State.save({ silent: true });
    const put = (date, worker) => first.State.commit(first.call('assignPlace',
        first.State.schedule, date, worker, 'actual', 'p_01'));
    put('2026-11-08', 'w_01');
    put('2026-11-09', 'w_01');
    put('2026-11-02', 'w_02');
    put('2026-11-09', 'w_03');
    put('2026-11-03', 'w_05');
    put('2026-10-20', 'w_06');
    put('2026-10-21', 'w_06');
    first.State.commit(first.call('addAdvance', first.State.schedule, 'w_02', '2026-11-03', 200, ''));
    return withSlips(first);
}

const LRM = '‎';
const AHMED_TEXT = [
    `📄 ${named('אחמד')} - 06/11/2026 עד 12/11/2026`,
    '',
    '• ראשון 08/11 - הרצליה - 400',
    '• שני 09/11 - הרצליה - 400',
    '',
    'סה״כ 2 ימי נוכחות',
    '2 ימי שכר',
    'נצבר: 800',
    '',
    'נותר לתשלום: 800'
].join('\n');

{
    suite('a crew of six: who is on the list, what each is shown, what each is sent');

    const device = crewPhone('d_crew');
    const facts = device.facts('current');
    same('the four with a row on the sheet for their own period, in roster order',
        facts.rows.map(row => row.name), ['אחמד', 'יוסי', 'סמיר', 'ח\'אלד']);
    check('the man with nothing recorded is not on it',
        !facts.rows.some(row => row.workerId === 'w_04'));
    check('nor the man whose only days are in the fortnight before',
        !facts.rows.some(row => row.workerId === 'w_06'));
    same('each in his own period - the weekly man\'s week, the others\' fortnight',
        facts.rows.map(row => [row.period.from, row.period.to]),
        [['2026-11-06', '2026-11-12'], ['2026-10-30', '2026-11-12'], ['2026-10-30', '2026-11-12'],
            ['2026-10-30', '2026-11-12']]);
    same('the dates said before the first tap: each cycle, its range and its men',
        facts.periods.map(one => [plain(one.range), one.cycle, one.listed]),
        [['06/11/2026 - 12/11/2026', 'תשלום שבועי', 1], ['30/10/2026 - 12/11/2026', 'תשלום כל שבועיים', 3]]);
    same('the figures: 800, 300, unknown, 450', facts.rows.map(row => row.figure), ['800', '300', '—', '450']);
    same('a figure is a number, or it is said to be unknown', facts.rows.map(row => row.known),
        [true, true, false, true]);

    same('the weekly man\'s text, whole', facts.rows[0].text, AHMED_TEXT);
    same('the man with an advance: what he took and what is left', facts.rows[1].text.split('\n').slice(-4),
        ['מקדמות חדשות: 200', `מקדמה 03/11: ${LRM}-200`, '', 'נותר לתשלום: 300']);
    check('a man with no rate is sent no figure at all, and none is shown for him',
        facts.rows[2].text.indexOf('נותר לתשלום') === -1 && facts.rows[2].text.indexOf('נצבר') === -1
        && facts.rows[2].agrees === true);
    same('nobody\'s row disagrees with his text', facts.rows.map(row => row.agrees), [true, true, true, true]);

    // THE DOORS. Each number is the man's own, normalised by the seder's rule.
    same('the numbers wa.me is handed', facts.rows.map(row => row.number),
        ['972528841930', '', '972501112233', '972501112233']);
    same('the weekly man\'s link, whole',
        device.onRow('w_01', 'current', 'row => payslipsUrl(row)'),
        `https://wa.me/972528841930?text=${encodeURIComponent(AHMED_TEXT)}`);
    const links = ['w_01', 'w_03', 'w_05'].map(id => device.onRow(id, 'current', 'row => payslipsUrl(row)'));
    check('no link carries another man\'s name or another man\'s statement',
        links.every((url, at) => ['אחמד', 'סמיר', 'ח\'אלד'].every((name, other) =>
            (decodeURIComponent(url).indexOf(named(name)) !== -1) === (at === other))),
        links.map(url => decodeURIComponent(url).split('\n')[0]).join(' | '));
    same('the two men on one number are each told who the other is',
        facts.rows.map(row => row.sharedWith), [[], [], ['ח\'אלד'], ['סמיר']]);
    same('the states before anything is opened',
        ['w_01', 'w_02', 'w_03', 'w_05'].map(id => device.onRow(id, 'current', 'row => payslipsState(row)')),
        ['', 'nophone', '', '']);

    // THE PREVIOUS PERIOD: other men, other dates, other texts.
    const before = device.facts('previous');
    same('the period before holds the man who worked then, and only him',
        before.rows.map(row => [row.name, row.period.from, row.period.to, row.figure]),
        [['Dan', '2026-10-16', '2026-10-29', '800']]);
    check('and his text is for those dates',
        before.rows[0].text.split('\n')[0] === `📄 ${named('Dan')} - 16/10/2026 עד 29/10/2026`,
        before.rows[0].text.split('\n')[0]);

    // NOBODY: a phone with a crew and nothing recorded.
    const empty = withSlips(makeDevice({ deviceId: 'd_empty', flags: SHUT }));
    empty.State.schedule.workers = [{ id: 'w_01', name: 'אחמד', active: true, dailyRate: 400, phone: '0528841930' }];
    const none = empty.facts('current');
    same('a record with nothing in the period lists nobody', none.rows, []);
    same('and still says which dates it looked at',
        none.periods.map(one => [plain(one.range), one.listed]), [['30/10/2026 - 12/11/2026', 0]]);
}

// ---------------------------------------------------------------- 5. the gate
//
// tests/approval.test.mjs's own fixture and its own three numbers: he earned 3,050 and was
// handed 5,000. Before anybody approves the migration every surface says -1,950.
function approvalPhone() {
    const first = makeDevice({ deviceId: 'd_gate', flags: OPEN });
    first.State.schedule.workers = [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: 610, hourlyRate: 0, phone: '0528841930' }];
    first.State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
    first.State.save({ silent: true });
    ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14'].forEach(date =>
        first.State.commit(first.call('assignPlace', first.State.schedule, date, 'w_01',
            'actual', 'p_01')));
    first.State.commit(first.call('addAdvance', first.State.schedule, 'w_01', '2026-08-10', 5000, ''));
    const device = withSlips(first);
    device.setToday('2026-08-20');
    return device;
}

{
    suite('an unapproved migration leaves the list where every other surface is');

    const device = approvalPhone();
    given('both gates are open, the migration needed and unapproved',
        device.call('advanceCarryEnabled') === true
        && device.call('planCarryMigration', device.State.schedule).needed === true
        && device.call('carryMigrationSettled', device.State.schedule) === false);

    const before = device.rowOf('w_01');
    same('the list shows -1,950, the minus pinned before the digits', [plain(before.figure), before.figure],
        ['-1950', `${LRM}-1950`]);
    same('and his text ends on the same figure', before.text.split('\n').slice(-1)[0],
        `נותר לתשלום: ${LRM}-1950`);
    check('with no balance, no deduction and no warning nobody approved',
        !/יתרת|חוב פתוח|נוכה מהשכר/.test(before.text) && before.review === null);
    same('it can be opened - it is what «שלח לעובד» sends today',
        device.onRow('w_01', 'current', 'row => payslipsState(row)'), '');

    device.onRow('w_01', 'current', 'row => payslipsMarkOpened(row)');
    given('he was opened on the unapproved reading',
        device.onRow('w_01', 'current', 'row => payslipsState(row)') === 'opened');

    const committed = device.State.commit(device.call('recordCarryApproval', device.State.schedule,
        device.call('planCarryMigration', device.State.schedule), '2026-08-25T09:00:00.000Z', 'd_person'));
    given('the approval committed durably', committed === true
        && device.call('carryMigrationSettled', device.State.schedule) === true);

    const after = device.rowOf('w_01');
    same('a durable approval moves the list: nothing payable', plain(after.figure), '0');
    same('and his text with it: the whole wage deducted, 1,950 still open',
        after.text.split('\n').slice(-4), ['נוכה מהשכר: 3050', '', 'נותר לתשלום: 0', 'חוב פתוח: 1950']);
    same('and the mark from before the approval is no longer believed',
        device.onRow('w_01', 'current', 'row => payslipsState(row)'), 'changed');
}

{
    suite('one reading of the list asks the gate once, by its own function, and puts it back');

    const device = crewPhone('d_once', OPEN);
    device.run(`var GATE_ASKS = 0; var GATE_REAL = carryReportingEnabled;
        carryReportingEnabled = function counted(schedule) { GATE_ASKS += 1; return GATE_REAL(schedule); };
        var GATE_COUNTED = carryReportingEnabled;`);
    const facts = device.facts('current');
    same('four men, two periods, one question', [facts.rows.length, device.run('GATE_ASKS')], [4, 1]);
    check('the function on the page afterwards is the one that was there before',
        device.run('carryReportingEnabled === GATE_COUNTED') === true);
    device.run('GATE_ASKS = 0');
    device.facts('current');
    // MOVED ON PURPOSE (v196, the pay sheet's one reading - reportReadOnce, js/ui/reports.js):
    // this said a later reading asks again. The answer of a record that has to be planned is
    // now kept under a key that IS the record (reportGateKey: the write tick, today, the
    // flags and the whole record as text), so a reading of the SAME record asks nothing -
    // and a reading of a record that moved asks once, from the gate's own function.
    same('a later reading of the same record asks nothing: the answer is kept under the record',
        device.run('GATE_ASKS'), 0);
    device.State.commit(device.call('addAdvance', device.State.schedule, 'w_04', '2026-11-04', 100, ''));
    device.run('GATE_ASKS = 0');
    device.facts('current');
    same('and a reading after the record moved asks the gate\'s function again, once',
        device.run('GATE_ASKS'), 1);

    // A THROW in the middle: the range, the filter and the gate all go back.
    device.run(`REPORT_RANGE.from = '2026-01-01'; REPORT_RANGE.to = '2026-01-31'; REPORT_WORKERS = null;
        var REAL_TEXT = workerStatementText; workerStatementText = function () { throw new Error('planted'); };`);
    const thrown = device.run(`(function () { try { payslipsFacts('current'); return 'no throw'; }
        catch (error) { return error.message; } })()`);
    device.run('workerStatementText = REAL_TEXT');
    same('a reading that throws', thrown, 'planted');
    same('still leaves the report on the range and the men it was on, and the gate its own',
        JSON.parse(device.run('JSON.stringify([REPORT_RANGE.from, REPORT_RANGE.to, REPORT_WORKERS,'
            + ' carryReportingEnabled === GATE_COUNTED])')), ['2026-01-01', '2026-01-31', null, true]);
}

// ---------------------------------------------------------------- credit, review, closed
function ledgerPhone(id, record, today) {
    const device = withSlips(makeDevice({ deviceId: id, flags: OPEN,
        storage: { 'scheduleData:v2': JSON.stringify(record) } }));
    device.State.load();
    device.setToday(today);
    return device;
}
const dayAt = rate => ({ plan: {}, actual: { w_d: { entries: [{ placeId: 'p_x' }],
    rates: { daily: rate, hourly: 0 } } } });
function creditRecord(back) {
    const record = {
        schemaVersion: 2,
        workers: [{ id: 'w_d', name: 'דוד', dailyRate: 610, hourlyRate: 0, active: true, phone: '0528841930' }],
        places: [{ id: 'p_x', name: 'חיפה', active: true }],
        days: {}, vehicles: [],
        advances: { a_1: { id: 'a_1', workerId: 'w_d', date: '2026-08-10', amount: 1000, note: '' } },
        ledger: { advances: {
            le_mig_a_1: { id: 'le_mig_a_1', advanceId: 'a_1', kind: 'given', workerId: 'w_d',
                date: '2026-08-10', amount: 1000, note: '', at: '2026-08-10T08:00:00.000Z', by: 'd' },
            le_back: { id: 'le_back', advanceId: 'a_1', kind: 'repaid', date: '2026-08-12',
                amount: back, note: '', at: '2026-08-12T08:00:00.000Z', by: 'd2' }
        }, unreadable: {},
        migrations: { cm_carry: { id: 'cm_carry', kind: 'carry', rows: 0, at: '', by: 'd' } } }
    };
    ['2026-08-10', '2026-08-11', '2026-08-24'].forEach(date => { record.days[date] = dayAt(610); });
    return record;
}

{
    suite('a man in credit, and a man whose account needs checking, are shown as the sheet shows them');

    // 1,000 handed over and 1,500 handed back in one fortnight: 500 is his, and it is
    // carried into the next - one day worked there, nothing to take off it.
    const next = ledgerPhone('d_credit', creditRecord(1500), '2026-08-25');
    given('the record may be read the new way',
        next.call('carryReportingEnabled', next.State.schedule) === true);
    const row = next.rowOf('w_d');
    same('he is owed his day, whole', plain(row.figure), '610');
    check('his text names the credit he opened the fortnight with, in v180\'s words',
        row.text.indexOf('\nיתרת זכות מחשבון קודם: 500\n') !== -1);
    same('and ends: the figure, then the credit he goes on with', row.text.split('\n').slice(-2),
        ['נותר לתשלום: 610', 'יתרת זכות: 500']);
    same('the row and the text state one figure, and it can be opened',
        [row.agrees, next.onRow('w_d', 'current', 'row => payslipsState(row)')], [true, '']);

    // THE FORTNIGHT IT HAPPENED IN, read as the period before: over-settled, so the sheet
    // says the account needs a person - and the list says it in the sheet's sentence.
    const then = next.rowOf('w_d', 'previous');
    const sentence = '⚠️ החשבון דורש בדיקה · ההחזרים עולים על החוב הפתוח ב-500 ₪ · אין לאשר את התשלום אוטומטית';
    same('«דורש בדיקה», in the sheet\'s own sentence', then.review, sentence);
    check('which is in the text he would be sent', then.text.indexOf(`\n${sentence}\n`) !== -1);
    same('his figure is the sheet\'s - two days, nothing deducted while the account is in review',
        [plain(then.figure), then.agrees], ['1220', true]);
    same('and he can still be opened: the row hides nothing the statement does not say',
        next.onRow('w_d', 'previous', 'row => payslipsState(row)'), '');
    check('the sentence is the one function every surface says it by',
        then.review === next.run(`(function () { REPORT_RANGE.from = '2026-08-07'; REPORT_RANGE.to = '2026-08-20';
            const said = overpaymentWarning(workerAccountFor('w_d')); REPORT_RANGE.from = null; REPORT_RANGE.to = null;
            return said; })()`));
}

{
    suite('a closed fortnight is listed as it was closed, and a day recorded into it afterwards moves nothing');

    // One fortnight, five days at 610 and 5,000 handed over; closed; then read from the
    // fortnight after it, as «התקופה הקודמת».
    const first = makeDevice({ deviceId: 'd_closed', flags: OPEN });
    first.setToday('2026-08-25');
    first.State.schedule.workers = [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: 610, hourlyRate: 0, phone: '0528841930' }];
    first.State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
    first.State.save({ silent: true });
    ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14'].forEach(date =>
        first.State.commit(first.call('assignPlace', first.State.schedule, date, 'w_01', 'actual', 'p_01')));
    first.State.commit(first.call('addAdvance', first.State.schedule, 'w_01', '2026-08-10', 5000, ''));
    const device = withSlips(makeDevice({ deviceId: 'd_closed', flags: OPEN, storage: first.dump() }));
    device.State.load();
    device.setToday('2026-08-25');
    const plan = device.call('planCarryMigration', device.State.schedule);
    if (plan.needed) {
        device.State.commit(device.call('recordCarryApproval', device.State.schedule, plan,
            '2026-08-21T09:00:00.000Z', 'd_person'));
    }
    const changes = device.call('closePeriodChanges', device.State.schedule, 'w_01',
        '2026-08-07', '2026-08-20', '2026-08-21T10:00:00.000Z', 'd_person');
    given('the model closes that fortnight', changes.length > 0
        && device.State.commitMany(changes) === true, String(changes.length));

    const closed = device.rowOf('w_01', 'previous');
    same('the closed fortnight: nothing payable, the row and the text agreeing',
        [plain(closed.figure), closed.agrees, closed.text.split('\n').slice(-2)],
        ['0', true, ['נותר לתשלום: 0', 'יתרת סגירה: 1950']]);
    same('and it can be opened', device.onRow('w_01', 'previous', 'row => payslipsState(row)'), '');

    // A DAY RECORDED INSIDE THE CLOSED FORTNIGHT, afterwards - a phone that was offline,
    // an import. The sheet goes on printing what the closure recorded, and so does the
    // statement: the payslip he was handed does not move, on either surface.
    device.call('assignPlace', device.State.schedule, '2026-08-17', 'w_01', 'actual', 'p_01');
    const late = device.rowOf('w_01', 'previous');
    same('a day recorded into it afterwards moves neither the figure nor the text',
        [plain(late.figure), late.agrees, late.text === closed.text], ['0', true, true]);
}

{
    suite('a figure the sheet does not show is NOT sent: the row is held, with no door and no copy');

    // The one way found to part the two surfaces on this build: an advance with a
    // NEGATIVE amount - which the form refuses and the wire does not, so it arrives by an
    // import, a restore or another phone. The sheet shows it and does not net it (moneyOf:
    // netting it would report a man as owed MORE than he earned); the statement sums the
    // advances of the range for itself. 800 on the sheet, 1,300 in the text.
    const device = crewPhone('d_differs');
    device.State.schedule.advances.a_neg = { id: 'a_neg', workerId: 'w_01', date: '2026-11-08',
        amount: -500, note: '' };
    const sheet = sheetFor(device, 'w_01', '2026-11-06', '2026-11-12');
    given('the sheet shows 800 and the statement states 1,300',
        plain(sheetFigure(sheet)) === '800' && sheet.statement.split('\n').slice(-1)[0] === 'נותר לתשלום: 1300',
        `${sheetFigure(sheet)} | ${sheet.statement.split('\n').slice(-1)[0]}`);

    const row = device.rowOf('w_01');
    same('the list shows the SHEET\'s figure and knows the text states another',
        [plain(row.figure), row.agrees, row.text === sheet.statement], ['800', false, true]);
    same('his row is held', stateOfRow(device, 'w_01'), 'differs');
    same('he is not counted among those that can be opened',
        JSON.parse(device.run('JSON.stringify(payslipsRun(payslipsFacts("current").rows))')),
        { total: 2, done: 0 });
    device.onRow('w_01', 'current', 'row => payslipsMarkOpened(row)');
    same('and a mark cannot make him read as opened', stateOfRow(device, 'w_01'), 'differs');

    // On the screen: his figure, the sentence, the message to read - and no way out.
    device.run('openPayslips("current")');
    const drawn = device.dom.getElementById('payslipsList').querySelectorAll('.payslips-row')[0];
    same('the drawn row is his, with no door and no copy - only the message to read',
        [drawn.dataset.workerId, drawn.querySelectorAll('A').length,
            drawn.querySelectorAll('.payslips-copy').length, drawn.querySelectorAll('.payslips-show').length],
        ['w_01', 0, 0, 1]);
    same('and says why, in the one sentence written for it',
        drawn.querySelectorAll('.payslips-warn').map(node => node.textContent),
        ['⚠️ הסכום בהודעה אינו הסכום שבדוח השכר, ולכן ההודעה לא נפתחת מכאן. בדוק את החשבון של העובד בדוח.']);
    same('the men beside him keep their doors', device.dom.getElementById('payslipsList')
        .querySelectorAll('.payslips-row').map(one => one.querySelectorAll('A').length), [0, 0, 1, 1]);

    // The same man with no number: still held - «העתק» would carry the same wrong figure.
    device.State.schedule.workers[0].phone = '';
    device.run('renderPayslipsIfOpen()');
    const bare = device.dom.getElementById('payslipsList').querySelectorAll('.payslips-row')[0];
    same('with no number he is held just the same', [stateOfRow(device, 'w_01'),
        bare.querySelectorAll('.payslips-copy').length], ['differs', 0]);
}

// ---------------------------------------------------------------- the marks
function reopen(device, flags) {
    const again = withSlips(makeDevice({ deviceId: device.id, storage: device.dump(), flags: flags || SHUT }));
    again.State.load();
    return again;
}
const stateOf = (device, id, which) => device.onRow(id, which, 'row => payslipsState(row)');
const mark = (device, id, which) => device.onRow(id, which, 'row => payslipsMarkOpened(row)');

{
    suite('a mark is per period and per man, survives the app being closed, and is not believed once his message has moved');

    const device = crewPhone('d_marks');
    same('marking one man is kept', mark(device, 'w_01'), true);
    same('he is opened; the men beside him are not',
        ['w_01', 'w_02', 'w_03', 'w_05'].map(id => stateOf(device, id)), ['opened', 'nophone', '', '']);
    same('one of three that can be opened', JSON.parse(device.run(
        'JSON.stringify(payslipsRun(payslipsFacts("current").rows))')), { total: 3, done: 1 });
    same('a man with no number cannot be marked', mark(device, 'w_02'), false);

    const kept = JSON.parse(device.raw(KEY));
    same('on the disk under its own key: the period, then the man', Object.keys(kept.periods),
        ['2026-11-06~2026-11-12']);
    same('holding only when, and a fingerprint - no name, no number, no figure, no text',
        [Object.keys(kept.periods['2026-11-06~2026-11-12'].opened), Object.keys(kept.periods['2026-11-06~2026-11-12'].opened.w_01).sort()],
        [['w_01'], ['at', 'sig']]);
    check('nothing a man is paid is in it', !/800|אחמד|97252/.test(device.raw(KEY)), device.raw(KEY));

    const again = reopen(device);
    same('after a reopen the mark is still there', stateOf(again, 'w_01'), 'opened');

    // NEXT WEEK is another period: the same man, not marked.
    again.setToday('2026-11-15');
    again.State.commit(again.call('assignPlace', again.State.schedule, '2026-11-15', 'w_01', 'actual', 'p_01'));
    same('in his next week he is not marked', stateOf(again, 'w_01'), '');
    same('and the week he was opened for is now the period before, where he still is',
        stateOf(again, 'w_01', 'previous'), 'opened');
    again.setToday(TODAY);

    // HIS MESSAGE MOVED after it was opened: another day, an advance, a corrected number.
    again.State.commit(again.call('assignPlace', again.State.schedule, '2026-11-10', 'w_01', 'actual', 'p_01'));
    same('a day recorded after his message was opened: changed, not opened', stateOf(again, 'w_01'), 'changed');
    mark(again, 'w_01');
    given('opened again with the new text', stateOf(again, 'w_01') === 'opened');
    again.State.commit(again.call('addAdvance', again.State.schedule, 'w_01', '2026-11-09', 100, ''));
    same('an advance recorded after it: changed', stateOf(again, 'w_01'), 'changed');
    mark(again, 'w_01');
    again.State.schedule.workers.filter(one => one.id === 'w_01')[0].phone = '0521112233';
    same('his number corrected after it: changed - the old message went to the old number',
        stateOf(again, 'w_01'), 'changed');
}

{
    suite('none of it is the record: not the schedule, not the outbox, not the fence');

    const device = crewPhone('d_record');
    const schedule = JSON.stringify(device.State.schedule);
    const disk = device.raw('scheduleData:v2');
    const queued = JSON.stringify(device.Sync.pendingPaths());
    const fence = device.Store.fenceState();
    const keys = Object.keys(device.dump()).sort();
    given('the record is on the disk and the fence can be read', disk !== null && fence !== null);

    // READING the list - both periods, drawn, redrawn, a preview unfolded - writes nothing.
    const whole = JSON.stringify(device.dump());
    device.facts('current');
    device.facts('previous');
    device.run('payslipsFacts("current").rows.forEach(row => { payslipsState(row); payslipsUrl(row); })');
    same('reading the list leaves every byte on the disk where it was', JSON.stringify(device.dump()), whole);

    device.run('openPayslips("current")');
    mark(device, 'w_01');
    mark(device, 'w_05');
    device.run('renderPayslipsIfOpen()');

    same('the schedule in memory is byte for byte what it was', JSON.stringify(device.State.schedule), schedule);
    same('so is the record on the disk', device.raw('scheduleData:v2'), disk);
    same('nothing was queued for the cloud', JSON.stringify(device.Sync.pendingPaths()), queued);
    same('the write counter did not move: this is not a record the rescue file carries',
        device.Store.fenceState(), fence);
    same('ONE key was added to the disk, and it is the preference',
        Object.keys(device.dump()).sort().filter(key => keys.indexOf(key) === -1), [KEY]);
    const after = device.dump();
    check('and every other key holds the bytes it held',
        keys.every(key => after[key] === JSON.parse(whole)[key]),
        keys.filter(key => after[key] !== JSON.parse(whole)[key]).join(', '));

    // In its code: nothing that commits, queues or sends. Comments are taken out first.
    const code = SLIPS.split('\n').filter(line => line.trim().indexOf('//') !== 0)
        .map(line => line.replace(/\s\/\/ .*$/, '')).join('\n');
    const writers = code.match(new RegExp([
        'localStorage', 'sessionStorage', 'indexedDB', '\\.commit', 'commitMany', 'commitRoster',
        '\\.save\\(', '\\.persist\\(', 'FarkadSync', '\\bfetch\\(', 'window\\.open', 'navigator\\.share',
        '\\brecord[A-Z]\\w*\\(', 'addAdvance', 'removeAdvance', 'assignPlace', 'markAbsent',
        'closePeriodChanges', 'saveFinancialAction', 'setVerified', 'Store\\.remove'
    ].join('|'), 'g')) || [];
    same('the code calls nothing that writes the record, and opens nothing by itself', writers, []);
    same('it touches Store twice: one read and one write', code.match(/Store\.\w+\(/g), ['Store.get(', 'Store.set(']);
    check('both of its own key, and the write optional - it never spends a restore point',
        code.indexOf('Store.get(PAYSLIPS_PROGRESS_KEY)') !== -1
        && code.indexOf('Store.set(PAYSLIPS_PROGRESS_KEY, JSON.stringify(all), { optional: true })') !== -1
        && code.indexOf("const PAYSLIPS_PROGRESS_KEY = 'farkadPayslipsProgress';") !== -1);
}

{
    suite('none of it leaves the phone: no backup, no rescue file, no cloud');

    const cloud = makeCloud();
    const device = crewPhone('d_cloud');
    device.Sync.pushDelayMs = 6;
    device.Sync.connect(cloud.adapter);
    const synced = await settleUntil(() => device.Sync.status === 'synced' && device.Sync.pendingCount() === 0, 5000);
    given('the phone is connected and has sent its record', synced, device.Sync.status);
    const attempts = cloud.attempts.length;
    const doc = JSON.stringify(cloud.doc);

    device.run('openPayslips("current")');
    mark(device, 'w_01');
    await settle(120);
    same('the cloud was not written to', cloud.attempts.length, attempts);
    same('and holds the document it held', JSON.stringify(cloud.doc), doc);

    device.State.commit(device.call('assignPlace', device.State.schedule, '2026-11-10', 'w_05', 'actual', 'p_01'));
    const travelled = await settleUntil(() => cloud.attempts.length > attempts, 5000);
    check('while an ordinary edit on the same phone still goes to the cloud', travelled,
        String(cloud.attempts.length - attempts));

    device.ctx.document = device.realDocument;
    device.call('exportBackup');
    const backup = device.downloads[device.downloads.length - 1];
    given('the backup file was handed over', Boolean(backup && backup.text && /\.json$/.test(backup.name)),
        JSON.stringify(backup && backup.name));
    same('the backup is the record and only the record', JSON.parse(backup.text),
        JSON.parse(JSON.stringify(device.State.schedule)));
    check('with nothing of the marks in it', !backup.text.includes(KEY) && !backup.text.includes('"sig"'));

    device.call('exportRecoveryData');
    const rescue = device.downloads[device.downloads.length - 1];
    given('the rescue file was handed over', Boolean(rescue && rescue.text && rescue.text.includes('farkad-recovery')),
        JSON.stringify(rescue && rescue.name));
    check('and the rescue file does not carry it either', !rescue.text.includes(KEY));
}

{
    suite('a damaged preference means nobody was opened; a full disk is said; old periods fall off');

    const damaged = ['{', 'null', '[]', '"x"', '{"periods":7}', '{"periods":{"nonsense":{"opened":{"w_01":{"at":1,"sig":"a"}}}}}',
        '{"periods":{"2026-11-12~2026-11-06":{"opened":{"w_01":{"at":1,"sig":"a"}}}}}',
        '{"periods":{"2026-11-06~2026-11-12":{"opened":{"__proto__":{"at":1,"sig":"a"},"w_01":{"at":"x","sig":"a"}}}},"open":{"at":"now","which":"current"}}',
        '{"periods":{"2026-11-06~2026-11-12":{"opened":{"w_01":{"at":1}}}},"open":{"at":1,"which":"sideways"}}'];
    const read = damaged.map(value => {
        const first = crewPhone('d_damaged');
        first.putRaw(KEY, value);
        const device = reopen(first);
        return [stateOf(device, 'w_01'), device.run('payslipsResumeWhich(Date.now())'),
            device.run(`Object.keys(payslipsAll().periods).reduce((marks, key) =>
                marks + Object.keys(payslipsAll().periods[key].opened).length, 0)`)];
    });
    same('every damaged value reads as nobody opened, nothing to resume, and not one mark kept',
        read, damaged.map(() => ['', null, 0]));
    const mended = crewPhone('d_mend');
    mended.putRaw(KEY, '{');
    const next = reopen(mended);
    same('and the next mark writes over it', [mark(next, 'w_01'), stateOf(next, 'w_01'),
        Object.keys(JSON.parse(next.raw(KEY)).periods)], [true, 'opened', ['2026-11-06~2026-11-12']]);

    // A DISK THAT REFUSES IT: held for the session, said on the list, and no restore
    // point is spent to make room - the write is optional.
    const full = crewPhone('d_full');
    full.Store.set('scheduleData:snap:2026-11-01', JSON.stringify(full.State.schedule));
    given('there is a restore point a full disk could be tempted to spend',
        full.raw('scheduleData:snap:2026-11-01') !== null);
    full.setQuota(key => key === KEY);
    same('the mark is refused by the disk and still held for this session',
        [mark(full, 'w_01'), stateOf(full, 'w_01'), full.run('payslipsProgressKept()'), full.raw(KEY)],
        [false, 'opened', false, null]);
    check('the restore point was not spent on it', full.raw('scheduleData:snap:2026-11-01') !== null);
    full.run('openPayslips("current")');
    const note = full.dom.getElementById('payslipsNote');
    same('and the list says so, in the seder\'s sentence', [note.hidden, note.textContent],
        [false, '⚠️ הסימונים לא נשמרו במכשיר - אם האפליקציה תיסגר, הם יאבדו.']);

    // PRUNING: fourteen periods touched in turn; the twelve touched last are kept.
    const many = crewPhone('d_many');
    const real = Date.now;
    let clock = Date.parse('2026-11-10T08:00:00');
    Date.now = () => clock;
    try {
        for (let week = 0; week < 14; week += 1) {
            clock += 60000;
            const from = addDays('2026-08-07', week * 7);
            many.run(`payslipsMarkOpened({ workerId: 'w_01', number: '972528841930', text: 't${week}',
                period: { key: '${from}~${addDays(from, 6)}' } })`);
        }
    } finally {
        Date.now = real;
    }
    const left = Object.keys(JSON.parse(many.raw(KEY)).periods).sort();
    same('twelve periods are kept', left.length, 12);
    same('the two touched first are the two that fell off', [left[0], left.indexOf('2026-08-07~2026-08-13')],
        ['2026-08-21~2026-08-27', -1]);
}

{
    suite('a list left open comes back after a reload, on the period it was on - for twenty minutes');

    const device = crewPhone('d_resume');
    const real = Date.now;
    let clock = Date.parse('2026-11-10T08:00:00');
    Date.now = () => clock;
    try {
        same('nothing to resume before it was ever opened', device.run('payslipsResumeWhich(Date.now())'), null);
        device.run('openPayslips("previous")');
        mark(device, 'w_06', 'previous');
        const killed = reopen(device);
        clock += 5 * 60 * 1000;
        same('five minutes later, a reopened app is told: the period before',
            killed.run('payslipsResumeWhich(Date.now())'), 'previous');
        killed.run(`REPORT_SECTION = 'sites'`);
        same('and brings the list back, on the reports screen, on «לפי עובד»',
            [killed.run('resumePayslipsRun()'), killed.views.slice(-1)[0], killed.run('REPORT_SECTION'),
                killed.dom.getElementById('payslipsModal').style.display, killed.run('payslipsWhich'),
                stateOf(killed, 'w_06', 'previous')],
            [true, 'reports', 'workers', 'flex', 'previous', 'opened']);

        clock += 21 * 60 * 1000;
        const late = reopen(device);
        same('after twenty minutes it does not', [late.run('payslipsResumeWhich(Date.now())'),
            late.run('resumePayslipsRun()')], [null, false]);
        clock -= 60 * 60 * 1000;
        same('nor on a clock that was put back', reopen(device).run('payslipsResumeWhich(Date.now())'), null);
        clock += 60 * 60 * 1000 - 20 * 60 * 1000;

        // CLOSED ON PURPOSE is not resumed.
        const shut = reopen(device);
        shut.run('openPayslips("current")');
        shut.run('closePayslips()');
        same('a list closed on purpose is not brought back',
            [reopen(shut).run('payslipsResumeWhich(Date.now())'), shut.dom.getElementById('payslipsModal').style.display],
            [null, 'none']);
        check('while the marks made before it was closed are kept', stateOf(reopen(shut), 'w_06', 'previous') === 'opened');

        // NOT OVER ANOTHER DIALOG the boot opened.
        const busy = reopen(device);
        const other = busy.dom.createElement('div');
        other.className = 'modal';
        other.style.display = 'flex';
        busy.dom.body.appendChild(other);
        same('it stands aside for a dialog that is already open', busy.run('resumePayslipsRun()'), false);
    } finally {
        Date.now = real;
    }
    check('boot asks for it after the seder\'s own resume (js/app.js)',
        /if \(typeof resumeSederRun === 'function'\) resumeSederRun\(\);[\s\S]{0,300}if \(typeof resumePayslipsRun === 'function'\) resumePayslipsRun\(\);\s+FarkadReminders\.openPending\(\);/
            .test(source('js/app.js')));
}

// ---------------------------------------------------------------- the drawing
const press = (node, type) => {
    const event = { prevented: false, preventDefault() { event.prevented = true; } };
    node.listeners[type || 'click'](event);
    return event;
};

{
    suite('what is drawn is what was read: each row its man, his figure, his door');

    const device = crewPhone('d_draw');
    device.run('openPayslips("current")');
    const get = id => device.dom.getElementById(id);
    const facts = device.facts('current');
    const rows = () => get('payslipsList').querySelectorAll('.payslips-row');

    same('the list is open, under its title', [get('payslipsModal').style.display, get('payslipsTitle').textContent],
        ['flex', 'תלוש לכל עובד']);
    same('the one line before the first tap says what is sent', get('payslipsLead').textContent,
        'כל עובד מקבל את החשבון שלו לתקופה שלו: הימים, מה נצבר, המקדמות וכמה נותר לתשלום. '
        + 'וואטסאפ נפתח עם ההודעה מוכנה, ושם לוחצים על שליחה.');
    same('and for which period: each cycle\'s dates and its men',
        get('payslipsContext').children.map(line => plain(line.textContent)),
        ['06/11/2026 - 12/11/2026תשלום שבועי · עובד אחד', '30/10/2026 - 12/11/2026תשלום כל שבועיים · 3 עובדים']);
    same('the two periods, in the settlement\'s words, the current one pressed',
        get('payslipsWhich').children.map(chip => [chip.textContent, chip.getAttribute('aria-pressed')]),
        [['התקופה הנוכחית', 'true'], ['התקופה הקודמת', 'false']]);
    same('a row per listed man, each carrying his id', rows().map(row => row.dataset.workerId),
        facts.rows.map(row => row.workerId));
    same('each row: his name, his own dates, his cycle',
        rows().map(row => [row.querySelector('.payslips-name').textContent,
            plain(row.querySelector('.payslips-when').textContent), row.querySelector('.payslips-cycle').textContent]),
        [['אחמד', '06/11/2026 - 12/11/2026', 'תשלום שבועי'], ['יוסי', '30/10/2026 - 12/11/2026', 'תשלום כל שבועיים'],
            ['סמיר', '30/10/2026 - 12/11/2026', 'תשלום כל שבועיים'], ['ח\'אלד', '30/10/2026 - 12/11/2026', 'תשלום כל שבועיים']]);
    same('his figure under «נותר לתשלום», with ₪ only beside a number',
        rows().map(row => row.querySelector('.payslips-amount').textContent),
        ['נותר לתשלום800₪', 'נותר לתשלום300₪', 'נותר לתשלום—', 'נותר לתשלום450₪']);

    // THE DOORS, as drawn: a link per man with a number, to HIS number with HIS text, and
    // HIS NAME on it; a copy button for the man with none.
    same('a door for each man with a number, none for the man without',
        rows().map(row => row.querySelectorAll('A').length), [1, 0, 1, 1]);
    same('each door\'s address is its own row\'s link',
        rows().map(row => (row.querySelector('A') || {}).href || null),
        facts.rows.map(row => (row.number ? `https://wa.me/${row.number}?text=${encodeURIComponent(row.text)}` : null)));
    same('and each door is worded with the man it opens, in the seder\'s words',
        rows().map(row => (row.querySelector('A') || {}).textContent || null),
        [`💬 פתח בוואטסאפ: ${named('אחמד')}`, null, `💬 פתח בוואטסאפ: ${named('סמיר')}`, `💬 פתח בוואטסאפ: ${named('ח\'אלד')}`]);
    check('a door opens a new window and hands it nothing of this one',
        rows().every(row => !row.querySelector('A') || (row.querySelector('A').target === '_blank'
            && row.querySelector('A').rel === 'noopener noreferrer')));
    same('the man with no number: the seder\'s sentence, and «העתק» where the door would be',
        [rows()[1].querySelectorAll('.payslips-warn').map(node => node.textContent),
            rows()[1].querySelectorAll('.payslips-copy').map(node => node.textContent)],
        [['אין מספר טלפון תקין'], ['העתק']]);
    same('the two men on one number each carry the seder\'s warning, naming the other',
        [rows()[2], rows()[3]].map(row => row.querySelectorAll('.payslips-warn').map(node => node.textContent)),
        [[`⚠️ מספר משותף עם ${named('ח\'אלד')}`], [`⚠️ מספר משותף עם ${named('סמיר')}`]]);
    same('nothing is opened yet', get('payslipsStatus').textContent, 'נפתחו 0 מתוך 3');

    // THE PREVIEW: every row has it; it unfolds his text and nobody else's, one at a time.
    same('every row offers the message to read first, named for its man',
        rows().map(row => [row.querySelector('.payslips-show').textContent,
            row.querySelector('.payslips-show').getAttribute('aria-label'),
            row.querySelector('.payslips-show').getAttribute('aria-expanded')]),
        facts.rows.map(row => ['הצג הודעה', `הצג את ההודעה ל${named(row.name)}`, 'false']));
    same('no message is unfolded before it is asked for', get('payslipsList').querySelectorAll('TEXTAREA').length, 0);
    press(rows()[1].querySelector('.payslips-show'));
    const shown = get('payslipsList').querySelectorAll('TEXTAREA');
    same('pressing it unfolds that man\'s text, read-only, in his row',
        [shown.length, shown[0].value, shown[0].readOnly, shown[0].parentNode.dataset.workerId,
            shown[0].getAttribute('aria-label'), rows()[1].querySelector('.payslips-show').textContent],
        [1, facts.rows[1].text, true, 'w_02', `ההודעה ל${named('יוסי')}`, 'הסתר הודעה']);
    press(rows()[0].querySelector('.payslips-show'));
    same('another man\'s replaces it - one message on the screen at a time',
        get('payslipsList').querySelectorAll('TEXTAREA').map(box => [box.parentNode.dataset.workerId, box.value]),
        [['w_01', AHMED_TEXT]]);
    press(rows()[0].querySelector('.payslips-show'));
    same('and pressing it again folds it away', get('payslipsList').querySelectorAll('TEXTAREA').length, 0);

    // THE TAP: marks HIM, inside the tap, and a second tap in the moment after is refused.
    const real = Date.now;
    let clock = Date.parse('2026-11-10T08:00:00');
    Date.now = () => clock;
    try {
        const first = press(rows()[0].querySelector('A'));
        same('the tap is left to navigate, and marks the man whose door it was',
            [first.prevented, stateOf(device, 'w_01'), stateOf(device, 'w_03'), stateOf(device, 'w_05')],
            [false, 'opened', '', '']);
        clock += 400;
        const second = press(rows()[2].querySelector('A'));
        same('a second tap in the moment after opens nobody: no navigation, no mark',
            [second.prevented, stateOf(device, 'w_03')], [true, '']);
        clock += device.run('PAYSLIPS_TAP_GUARD_MS');
        device.run('renderPayslipsIfOpen()');
        const third = press(rows()[2].querySelector('A'));
        same('once the moment is over the next door works', [third.prevented, stateOf(device, 'w_03')],
            [false, 'opened']);
    } finally {
        Date.now = real;
    }
    device.run('renderPayslipsIfOpen()');
    same('the opened rows say so in the seder\'s word, and the count moves',
        [rows().map(row => row.querySelectorAll('.payslips-state').map(node => node.textContent)),
            get('payslipsStatus').textContent],
        [[['✓ נפתח בוואטסאפ'], [], ['✓ נפתח בוואטסאפ'], []], 'נפתחו 2 מתוך 3']);
    check('an opened man keeps his door: opening him again is the person\'s choice',
        rows()[0].querySelectorAll('A').length === 1);

    // A SNAPSHOT FROM ANOTHER PHONE while it is open: render() redraws it.
    device.call('assignPlace', device.State.schedule, '2026-11-10', 'w_01', 'actual', 'p_01');
    device.run('renderPayslipsIfOpen()');
    same('a day recorded under the open list moves his figure, his link, and his mark',
        [rows()[0].querySelector('.payslips-value').textContent,
            decodeURIComponent(rows()[0].querySelector('A').href).split('\n').slice(-1)[0],
            rows()[0].querySelectorAll('.payslips-warn').map(node => node.textContent)],
        ['1200', 'נותר לתשלום: 1200', ['⚠️ השתנה מאז שנפתח - כדאי לפתוח שוב']]);
    check('render() is where the redraw is asked for',
        source('js/app.js').indexOf("if (typeof renderPayslipsIfOpen === 'function') renderPayslipsIfOpen();") !== -1);

    // THE OTHER PERIOD, by its chip.
    press(get('payslipsWhich').children[1]);
    same('«התקופה הקודמת» lists the men of the period before, with its dates',
        [rows().map(row => row.querySelector('.payslips-name').textContent),
            get('payslipsContext').children.map(line => plain(line.textContent)),
            get('payslipsWhich').children.map(chip => chip.getAttribute('aria-pressed'))],
        [['Dan'], ['16/10/2026 - 29/10/2026תשלום כל שבועיים · עובד אחד'], ['false', 'true']]);

    // NOBODY.
    device.State.schedule.days = {};
    device.State.schedule.advances = {};
    device.run('renderPayslipsIfOpen()');
    same('a period with nobody says so, in one sentence, and counts nothing',
        [get('payslipsList').textContent, get('payslipsStatus').textContent],
        ['אין בתקופה הזו עובדים עם שורה בדוח השכר.', '']);

    device.run('closePayslips()');
    same('closing hides it', get('payslipsModal').style.display, 'none');
    check('Escape reaches that same function (js/ui/modal.js)',
        source('js/ui/modal.js').indexOf('payslipsModal: () => closePayslips()') !== -1);
}

// ---------------------------------------------------------------- the way in
{
    suite('one way in: a row of «הפקת דוח» on «לפי עובד» - and nothing in the day\'s WhatsApp dialog');

    const device = crewPhone('d_entry');
    const menu = section => JSON.parse(device.run(`(function () {
        REPORT_SECTION = ${JSON.stringify(section)};
        const menu = renderReportActions();
        return JSON.stringify(menu.querySelectorAll('BUTTON').map(node => [node.textContent, node.id || null]));
    })()`));
    same('on «לפי עובד» it is the last row of the menu, under the three that were there',
        menu('workers'), [['🖨️ הדפסה', null], ['🖼️ שיתוף כתמונה', null], ['📊 יצוא', null],
            ['💬 תלוש לכל עובד', 'payslipsEntry']]);
    same('on «לפי אתר» - a client\'s outputs - it is not there',
        menu('sites'), [['🖨️ הדפסה', null], ['🖼️ שיתוף כתמונה', null], ['📊 יצוא', null]]);
    const entry = device.run(`(function () { REPORT_SECTION = 'workers'; return payslipsEntryButton(); })()`);
    entry.closest = () => null;
    press(entry);
    same('pressing it opens the list on the current period',
        [device.dom.getElementById('payslipsModal').style.display, device.run('payslipsWhich')], ['flex', 'current']);

    const page = source('index.html');
    const share = page.slice(page.indexOf('<div class="modal" id="shareModal">'), page.indexOf('<div class="modal" id="sederModal">'));
    given('the WhatsApp dialog was found in the page', share.length > 200 && share.indexOf('shareText') !== -1);
    check('the day\'s WhatsApp dialog has nothing of it in its frame', !/payslip|תלוש/i.test(share));
    check('and no file that builds that dialog\'s rows knows of it',
        ['js/ui/share.js', 'js/ui/seder.js', 'js/ui/transport.js', 'js/ui/journey.js', 'js/ui/day.js', 'js/ui/sheet.js']
            .every(file => !/payslip|תלוש/i.test(source(file))));
    check('nor does this file reach for that dialog', !/shareModal|sederInstallEntry|showDayMessage/.test(SLIPS));
    same('the app asks for the entry in exactly one place',
        ['js/ui/reports.js', 'js/ui/roster.js', 'js/ui/day.js', 'js/ui/settings.js', 'js/app.js', 'index.html']
            .map(file => (source(file).match(/payslipsEntryButton/g) || []).length), [2, 0, 0, 0, 0, 0]);
}

// ---------------------------------------------------------------- 7. the words
{
    suite('every new word, word for word - proposed, for the owner to approve');

    const device = crewPhone('d_words');
    const T = device.global('PAYSLIPS_TEXT');
    same('the fixed strings this feature adds', JSON.parse(JSON.stringify(T)), {
        entry: '💬 תלוש לכל עובד',
        title: 'תלוש לכל עובד',
        lead: 'כל עובד מקבל את החשבון שלו לתקופה שלו: הימים, מה נצבר, המקדמות וכמה נותר לתשלום. '
            + 'וואטסאפ נפתח עם ההודעה מוכנה, ושם לוחצים על שליחה.',
        nobody: 'אין בתקופה הזו עובדים עם שורה בדוח השכר.',
        show: 'הצג הודעה',
        hide: 'הסתר הודעה',
        differs: '⚠️ הסכום בהודעה אינו הסכום שבדוח השכר, ולכן ההודעה לא נפתחת מכאן. '
            + 'בדוק את החשבון של העובד בדוח.'
    });
    same('and the two that are built around a name', [T.showFor('אחמד'), T.messageFor('אחמד')],
        ['הצג את ההודעה לאחמד', 'ההודעה לאחמד']);
    same('nine in all', Object.keys(T).length, 9);

    const owners = {
        payable: ['js/ui/reports.js', "el('span', 'report-tile-label', 'נותר לתשלום')"],
        sheetNet: ['js/ui/reports.js', "if (anyRate) headers.push('לתשלום');"],
        current: ['js/ui/reports.js', "['התקופה הנוכחית', 0]"],
        previous: ['js/ui/reports.js', "['התקופה הקודמת', -1]"],
        weekly: ['js/ui/roster.js', "'תשלום שבועי'"],
        biweekly: ['js/ui/roster.js', "'תשלום כל שבועיים'"],
        copy: ['index.html', 'onclick="copyDayMessage()">העתק</button>']
    };
    const reused = JSON.parse(JSON.stringify(device.global('PAYSLIPS_REUSED')));
    same('the borrowed words are exactly the ones this suite knows the owners of',
        Object.keys(reused).sort(), Object.keys(owners).sort());
    same('and each is in its owner\'s source, as that screen says it', Object.keys(owners).filter(key =>
        source(owners[key][0]).indexOf(owners[key][1]) === -1 || owners[key][1].indexOf(reused[key]) === -1), []);
    check('the statement itself says «נותר לתשלום: » - the line the list reads the figure from',
        source('js/ui/reports.js').indexOf('lines.push(`נותר לתשלום: ${bidiAmount(moneyText(left))}`);') !== -1);

    // The seder's words are not retyped at all: they are read off SEDER_TEXT.
    const S = device.global('SEDER_TEXT');
    same('the seder\'s words the list says, as the seder pins them',
        [S.opened, S.changed, S.noPhone, S.close, S.notKept, S.progress(1, 4), S.go('אחמד'), S.shared('ח\'אלד'), S.count(1), S.count(3)],
        ['✓ נפתח בוואטסאפ', '⚠️ השתנה מאז שנפתח - כדאי לפתוח שוב', 'אין מספר טלפון תקין', 'סגור',
            '⚠️ הסימונים לא נשמרו במכשיר - אם האפליקציה תיסגר, הם יאבדו.', 'נפתחו 1 מתוך 4',
            '💬 פתח בוואטסאפ: אחמד', '⚠️ מספר משותף עם ח\'אלד', 'עובד אחד', '3 עובדים']);
    same('each used by name, in the code',
        ['opened', 'changed', 'noPhone', 'close', 'notKept', 'progress', 'go', 'shared', 'count']
            .filter(word => SLIPS.indexOf(`SEDER_TEXT.${word}`) === -1), []);

    // NEVER «נשלח»: the app opened WhatsApp; whether send was pressed it cannot know.
    const code = SLIPS.split('\n').filter(line => line.trim().indexOf('//') !== 0)
        .map(line => line.replace(/\s\/\/ .*$/, ''));
    check('nothing this feature shows says «נשלח»', !/נשלח/.test(code.join('\n'))
        && !/נשלח/.test(JSON.stringify(T) + T.showFor('') + T.messageFor('')));

    const blocks = /const PAYSLIPS_TEXT = Object\.freeze\(\{[\s\S]*?\n\}\);|const PAYSLIPS_REUSED = Object\.freeze\(\{[\s\S]*?\n\}\);/g;
    given('both blocks are found', (SLIPS.match(blocks) || []).length === 2);
    const loose = SLIPS.replace(blocks, '').split('\n')
        .filter(line => line.trim().indexOf('//') !== 0)
        .map(line => line.replace(/\s\/\/ .*$/, ''))
        .filter(line => /[֐-׿]/.test(line));
    same('outside its two blocks the code holds no Hebrew letter', loose, []);
    check('and the frame in index.html holds none either',
        !/[֐-׿]/.test((source('index.html').match(/<div class="modal" id="payslipsModal">[\s\S]*?\n<\/div>\n/) || ['א'])[0]));
    check('no existing string was changed to make room: the menu still says its own three',
        ["button('🖨️ הדפסה', 'btn-success'", "button('🖼️ שיתוף כתמונה', 'btn-secondary'", "'📊 יצוא'",
            "el('summary', null, 'הפקת דוח')", "button('💬 שלח לעובד', 'btn-success', () => shareWorkerStatement(worker.id))"]
            .every(piece => source('js/ui/reports.js').indexOf(piece) !== -1));
}

// ---------------------------------------------------------------- the phone numbers
{
    suite('a number is handed to wa.me only when it is plainly an Israeli mobile - the seder\'s rule, unchanged');

    const device = crewPhone('d_numbers');
    const number = phone => device.call('sederWaNumber', phone);
    same('local, spaced, international, the trunk zero left in, 00972',
        ['052-884-1930', '052 884 1930', '+972 52-884-1930', '+972 (0)52-884-1930', '00972528841930', '972528841930']
            .map(number), Array(6).fill('972528841930'));
    same('and nothing else is a number: a landline, too short, too long, two in one field, another country, none',
        ['03-5551234', '1234', '05288419301', '0528841930 / 0541234567', '+1 415 555 0100', '', undefined, null]
            .map(number), Array(8).fill(''));
    check('the list takes that function and no rule of its own',
        SLIPS.indexOf('number: sederWaNumber(worker.phone)') !== -1 && !/972|replace\(\/\[\^0-9\]/.test(
            SLIPS.split('\n').filter(line => line.trim().indexOf('//') !== 0).join('\n')));
    check('and the seder\'s link builder',
        SLIPS.indexOf('return sederUrl(row.number, row.text);') !== -1
        && source('js/ui/seder.js').indexOf('return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;') !== -1);
}

// ---------------------------------------------------------------- the shell
{
    suite('the file is on the page, in order, and in the offline shell');

    const page = source('index.html');
    const scripts = [...page.matchAll(/<script src="([^"]+)"><\/script>/g)].map(match => match[1]);
    const at = scripts.indexOf('js/ui/payslips.js');
    check('index.html loads it once, as a classic script',
        scripts.filter(src => src === 'js/ui/payslips.js').length === 1
        && page.indexOf('type="module" src="js/ui/payslips.js"') === -1);
    check('after the sheet, the copier, the seder and everything they stand on',
        ['js/ui/reports.js', 'js/ui/roster.js', 'js/ui/share.js', 'js/ui/seder.js', 'js/ui/modal.js',
            'js/ui/dom.js', 'js/model/ledger.js', 'js/state.js', 'js/store.js']
            .every(src => scripts.indexOf(src) !== -1 && scripts.indexOf(src) < at), String(at));
    check('and before boot', at !== -1 && at < scripts.indexOf('js/app.js'), String(at));
    check('the service worker\'s shell names it', source('sw.js').indexOf("'./js/ui/payslips.js',") !== -1);
    check('its frame is one of the app\'s dialogs, entered at its heading, with its two live lines outside the rows',
        /<div class="modal" id="payslipsModal">\s+<div class="modal-content">\s+<h3 id="payslipsTitle" tabindex="-1"><\/h3>/.test(page)
        && /<p id="payslipsStatus" class="payslips-status" role="status" aria-live="polite"><\/p>\s+<p id="payslipsSaid" class="payslips-status" role="status" aria-live="polite"><\/p>/.test(page));
    check('its look is in the design layer and nowhere else',
        source('css/design.css').indexOf('.payslips-door') !== -1
        && source('css/app.css').indexOf('payslips') === -1
        && source('css/readability.css').indexOf('payslips') === -1);
    const look = source('css/design.css');
    // v188, MOVED: this read to the END of the file, which was this block and the two the
    // same build put after it (the card's second part, «חיפוש עובד»). The build's last two
    // blocks - the journey's second pass and «מה חדש» - now stand after those, and the first
    // of them holds one media query on purpose (a screen too short for a second button at
    // the foot of the day). So it reads as far as it always did, and stops where they begin.
    const tail = look.indexOf('/* ---- בניית סידור, the second pass');
    const mine = look.slice(look.indexOf('/* «תלוש לכל עובד»'), tail === -1 ? look.length : tail);
    const after = tail === -1 ? '' : look.slice(tail);
    const sizes = (mine.match(/font-size: [\d.]+px/g) || []).map(text => Number(text.replace(/[^\d.]/g, '')));
    check('nothing in it is written under 16px, and the figure is the largest thing on a row',
        sizes.length > 10 && Math.min(...sizes) >= 16 && Math.max(...sizes) === 30
        && /\.payslips-value \{ font-size: 30px;/.test(mine), JSON.stringify(sizes));
    // MOVED ON PURPOSE (the usual site, js/ui/usual.js): a look added after v188 is one more
    // block at the END of the layer, where the brief of every feature puts it, so what
    // stands after this block is the build's two AND whatever came later - counted as "two
    // or more" instead of "two". What it guards is unchanged: this block is whole, has no
    // media query and no fixed height, and the build's two are still behind it.
    check('and it stands at the end of the layer but for the build\'s last two blocks and the ones added since, with no fixed height in it',
        look.trim().endsWith('}') && mine.length > 1000 && mine.indexOf('@media') === -1
        && !/[^-]height: \d/.test(mine.replace(/min-height/g, 'min-h').replace(/line-height/g, 'line-h'))
        && (after.match(/^\/\* ---- /gm) || []).length >= 2 && after.indexOf('«מה חדש» (js/ui/whatsnew.js)') !== -1);
    // MOVED ON PURPOSE (the reports say the account, js/ui/reports.js): that block stands
    // last in the layer and needs one phone-width query of its own - the band's cells are
    // table cells above 700px and must not be made flex there. "One media query between
    // them" is a statement about the build's two blocks, so it is counted up to where the
    // reports' block begins; the no-fixed-height half still reads to the end of the file.
    const theirs = after.indexOf('/* ---- the reports say the account') === -1
        ? after : after.slice(0, after.indexOf('/* ---- the reports say the account'));
    check('and those two have no fixed height either, and one media query between them',
        !/[^-]height: \d/.test(after.replace(/min-height/g, 'min-h').replace(/max-height/g, 'max-h').replace(/line-height/g, 'line-h'))
        && (theirs.match(/@media/g) || []).length === 1 && after.indexOf('@media (max-height: 580px) { .journey-day-row { display: none; } }') !== -1);
}

await settle(1);
report();
