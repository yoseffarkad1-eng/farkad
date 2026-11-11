// סיכום חודש - the month on one screen, on devices.
//
//   node tests/monthsummary.test.mjs
//
// The summary (js/ui/monthsummary.js) is the owner's picture of a calendar month: the
// work per site, the two counts, the men, the money, and the step from the month before.
// It is one more surface showing numbers that three reports already show, so what this
// suite holds is not that the summary is right. It is that it CANNOT BE DIFFERENT:
//
//   1. THE FIGURES ARE THE REPORTS'. Over seeded records - both pay cycles, a raise in the
//      middle of a month, men with no rate, double days, extra hours, two sites in a day,
//      Rima, עובדי יוסף גבס, advances, cash handed back, a month before the record and a
//      month after it, a month in progress - every number of every month is the number
//      the reports screen has when its range is that month: the exported pay sheet's
//      columns, the group bands the screen prints, the billing sheet's total row and the
//      bars drawn on the screen, «בלי עובדי רימא», the Rima sheet, the יוסף גבס sheet.
//      Then the wages and the billing counts are worked out a second time by
//      tests/oracle.mjs, which imports nothing from js/. Then the counts this file makes
//      for itself (men, working days, the busiest day, the longest three) are held
//      against what was RECORDED, remembered by the generator and never priced.
//   2. A DAY IS IN ITS OWN MONTH, ONCE. Hand-written days either side of a month's end
//      and across both clock changes, a raise mid-month, every line of the text.
//   3. THE GATE IS THE REPORTS'. Cash handed back is not shown on a record whose migration
//      nobody approved, and is after a durable approval; the wage does not move.
//   4. IT WRITES NOTHING. Every key on the disk, byte for byte, across opening, stepping,
//      redrawing, sending, copying and closing - then shown to notice a real write.
//   5. THE WORDS. Each new string, word for word; each borrowed one, where its owner
//      keeps it; never «נשלח».

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDevice } from './harness.mjs';
import { makeDom } from './moneydom.mjs';
import * as oracle from './oracle.mjs';
import { suite, check, same, given, report } from './runner.mjs';

process.env.TZ = 'Asia/Jerusalem';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = file => readFileSync(join(ROOT, file), 'utf8');
const SUMMARY = source('js/ui/monthsummary.js');

const SHUT = { carryAdvances: false, ledgerWrites: false };
const OPEN = { carryAdvances: true, ledgerWrites: true };

// A Tuesday in a month that is not over. The record starts on 1 September.
const TODAY = '2026-11-10';
const FIRST_DAY = '2026-09-01';
// The month before the record, three months of it (the last in progress), the month after.
const MONTHS = ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12'];
// The day one man's rate is raised, in the middle of October.
const RAISE_ON = '2026-10-15';

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
const lastOf = key => {
    const [y, m] = key.split('-').map(Number);
    return `${key}-${String(new Date(y, m, 0, 12).getDate()).padStart(2, '0')}`;
};
const agora = value => Math.round(Number(value) * 100) / 100;
// The marks the app pins direction with, taken off so a line can be read and compared.
const plain = text => String(text).replace(/[‎⁦-⁩]/g, '');

const IDS = ['reportsView', 'advancesView', 'workerDaysTitle', 'workerDaysMeta', 'workerDaysBody',
    'workerDaysModal', 'monthSummaryModal', 'monthSummaryTitle', 'monthSummaryPrev', 'monthSummaryNext',
    'monthSummaryMonth', 'monthSummaryBody', 'monthSummaryFoldLabel',
    'monthSummaryText', 'monthSummarySend', 'monthSummaryCopy', 'monthSummaryClose', 'monthSummaryStatus'];

// The report code and the summary, in the device's own context, over a DOM that can be
// read back - the way tests/workercard.test.mjs reaches the sheet.
function withSummary(device) {
    const dom = makeDom();
    IDS.forEach(id => dom.register(id));
    const make = dom.createElement;
    dom.createElement = tag => { const node = make(tag); node.dataset = {}; return node; };
    device.ctx.document = dom;
    device.dom = dom;
    device.run = code => vm.runInContext(code, device.ctx, { filename: 'harness:monthsummary' });
    device.run(source('js/ui/sitecolor.js'));
    device.run(source('js/ui/reports.js'));
    device.run(SUMMARY);
    device.ctx.showView = () => {};
    device.ctx.askTell = () => Promise.resolve();
    device.ctx.askConfirm = () => Promise.resolve(true);
    device.shared = [];
    device.ctx.shareTextOut = (text, status, done) => { device.shared.push(['share', text]); done(); };
    device.ctx.copyTextOut = (box, status) => { device.shared.push(['copy', box.value]); };
    device.setToday(TODAY);
    device.facts = key => JSON.parse(device.run(`JSON.stringify(monthSummaryFacts(${JSON.stringify(key)}))`));
    return device;
}

// What the REPORTS SCREEN has when its range is this month and no man is left out: the
// files it exports, the bands it prints and the bars it draws.
function reportsFor(device, key) {
    return JSON.parse(device.run(`(function (from, to) {
        REPORT_RANGE.from = from; REPORT_RANGE.to = to;
        REPORT_WORKERS = null; INVOICE_PLACE = null; REPORT_PRESET = 'month';
        const rows = payrollRows();
        const split = payrollDisplaySplit(rows);
        const invoice = renderInvoiceTable();
        return JSON.stringify({
            file: payrollSheetRows(),
            rows: rows.length,
            bands: payrollGroups(split.work, split.finance)
                .map(group => payrollBandTotals(group.rows.concat(group.finance))),
            invoice: invoiceSheetRows(),
            bars: invoice.querySelectorAll('.invoice-bar-row').map(row =>
                [row.querySelectorAll('.site-name')[0].textContent,
                    row.querySelectorAll('.invoice-bar-count')[0].textContent]),
            barsTotal: (invoice.querySelectorAll('.invoice-bars-total')[0] || { children: [] })
                .children.map(node => node.textContent),
            norima: withoutRimaSheetRows(),
            rima: rimaSheetRows(),
            yosef: yosefGevesSheetRows(),
            carry: carryReportingEnabled(State.schedule) === true,
            repaid: State.schedule.workers.reduce((sum, worker) => sum
                + advanceRepaymentsFor(State.schedule, worker.id, from, to), 0)
        });
    })(${JSON.stringify(`${key}-01`)}, ${JSON.stringify(lastOf(key))})`));
}

// ---------------------------------------------------------------- seeded records
//
// `memory` remembers what was RECORDED - which man was at which site on which date, a
// count typed for a site - and never what anything was worth.
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
    const first = makeDevice({ deviceId: `d_month${seed}`, flags });
    first.setToday(TODAY);
    const schedule = first.State.schedule;
    const memory = { days: [], rima: [], yosef: [], repaid: [], raised: null };

    const crew = 4 + Math.floor(rand() * 4);
    schedule.workers = [];
    for (let n = 1; n <= crew; n += 1) {
        const worker = {
            id: `w_${n}`, name: `עובד ${seed}-${n}`, active: rand() > 0.15,
            // One man in five has no rate: his wage is unknown, which is not zero. Hourly
            // rates whose products stay on the agora, so the second calculator and the
            // sheet round nothing differently.
            dailyRate: n === 1 ? 400 : pick([0, 380, 410, 450, 610]), hourlyRate: pick([0, 0, 50, 60])
        };
        // Both cycles on one record: about a third of the men are settled weekly.
        if (rand() < 0.35) worker.payCycles = '2026-08-07=weekly';
        schedule.workers.push(worker);
    }
    const sites = 2 + Math.floor(rand() * 4);
    schedule.places = [];
    for (let n = 1; n <= sites; n += 1) {
        schedule.places.push({ id: `p_${n}`, name: `אתר ${seed}-${n}`, active: true });
    }
    const siteIds = schedule.places.map(place => place.id);

    datesBetween(FIRST_DAY, TODAY).forEach(date => {
        // THE RAISE. Days already written keep the rate they were written at; the days
        // from here on are stamped with the new one. October is then a month no single
        // rate explains.
        if (date === RAISE_ON) {
            schedule.workers[0].dailyRate = 480;
            memory.raised = schedule.workers[0].id;
        }
        const saturday = new Date(`${date}T12:00:00`).getDay() === 6;
        schedule.workers.forEach(worker => {
            const roll = rand();
            if (roll < (saturday ? 0.9 : 0.3)) return;
            if (roll < (saturday ? 0.92 : 0.36)) {
                first.call('markAbsent', schedule, date, worker.id, 'actual');
                memory.days.push({ date, worker: worker.id, absent: true, sites: [], doubled: false, hours: 0 });
                return;
            }
            const one = pick(siteIds);
            const band = rand();
            const rate = band < 0.1 ? 'double' : band < 0.2 ? 'extra' : undefined;
            const hours = rate === 'extra' ? pick([1, 2, 3.5]) : 0;
            first.call('assignPlace', schedule, date, worker.id, 'actual', one, rate, hours || undefined);
            const here = [one];
            if (roll > 0.93) {
                const two = pick(siteIds.filter(id => id !== one));
                first.call('assignPlace', schedule, date, worker.id, 'actual', two);
                here.push(two);
            }
            memory.days.push({ date, worker: worker.id, absent: false, sites: here,
                doubled: rate === 'double', hours });
        });
        // The two counts, on a day in six and a day in nine, each on one site.
        if (rand() < 0.17) {
            const entry = { date, place: pick(siteIds), count: 1 + Math.floor(rand() * 5) };
            first.call('setRimaCount', schedule, date, entry.place, entry.count);
            memory.rima.push(entry);
        }
        if (rand() < 0.11) {
            const entry = { date, place: pick(siteIds), count: 1 + Math.floor(rand() * 4) };
            first.call('setYosefGevesCount', schedule, date, entry.place, entry.count);
            memory.yosef.push(entry);
        }
    });

    schedule.workers.forEach(worker => {
        const count = Math.floor(rand() * 3);
        for (let n = 0; n < count; n += 1) {
            first.call('addAdvance', schedule, worker.id,
                addDays(TODAY, -Math.floor(rand() * 65)), pick([200, 500, 1500, 250.5]), '');
        }
    });
    first.State.save({ silent: true });

    // REOPENED, which is what mirrors the advances into the ledger.
    const device = withSummary(makeDevice({ deviceId: `d_month${seed}`, storage: first.dump(), flags }));
    device.State.load();
    device.memory = memory;
    device.approved = false;

    if (flags.carryAdvances) {
        const plan = device.call('planCarryMigration', device.State.schedule);
        // Two records in three are approved; the third is a phone nobody pressed the
        // button on, so the unapproved reading is in the corpus too.
        if (plan.needed && seed % 3 !== 1) {
            device.State.commit(device.call('recordCarryApproval', device.State.schedule,
                plan, '2026-11-01T09:00:00.000Z', 'd_person'));
        }
        device.approved = device.call('carryReportingEnabled', device.State.schedule) === true;

        // Cash handed back - by the model's recorder where this record may be written,
        // and straight onto the ledger where it may not (it arrived from another phone).
        device.State.schedule.workers.forEach(worker => {
            const mine = device.call('advancesFor', device.State.schedule, worker.id,
                '0000-01-01', '9999-12-31');
            if (mine.length === 0 || rand() < 0.4) return;
            const back = pick([100, 200, 50]);
            const date = addDays(TODAY, -Math.floor(rand() * 40));
            if (date < mine[0].date) return;
            if (device.call('financialWritingEnabled', device.State.schedule)) {
                const done = device.State.commit(device.call('recordAdvanceRepaid', device.State.schedule,
                    mine[0].id, back, date, '', `${date}T10:00:00.000Z`, 'd_person', 'cash'));
                if (done !== true) return;
            } else {
                const ledger = device.State.schedule.ledger;
                ledger.advances[`le_back_${worker.id}`] = {
                    id: `le_back_${worker.id}`, advanceId: mine[0].id, kind: 'repaid',
                    workerId: worker.id, date, amount: back, note: '', method: 'cash',
                    at: `${date}T10:00:00.000Z`, by: 'd_elsewhere' };
                device.State.save({ silent: true });
            }
            memory.repaid.push({ date, amount: back });
        });
    }
    return device;
}

// What the month must hold, from what was recorded.
function recordedIn(device, key) {
    const memory = device.memory;
    const names = {};
    device.State.schedule.workers.forEach(worker => { names[worker.id] = worker.name; });
    const order = device.State.schedule.workers.map(worker => worker.id);
    const days = memory.days.filter(day => day.date.startsWith(key) && !day.absent);
    const perMan = {};
    const perDate = {};
    days.forEach(day => {
        perMan[day.worker] = (perMan[day.worker] || 0) + 1;
        perDate[day.date] = (perDate[day.date] || 0) + 1;
    });
    const dates = Object.keys(perDate).sort();
    let busiest = null;
    dates.forEach(date => { if (!busiest || perDate[date] > busiest.men) busiest = { date, men: perDate[date] }; });
    const bySite = list => {
        const out = {};
        list.filter(entry => entry.date.startsWith(key))
            .forEach(entry => { out[entry.place] = (out[entry.place] || 0) + entry.count; });
        return out;
    };
    const rima = bySite(memory.rima);
    const billed = Object.assign({}, rima);
    days.forEach(day => day.sites.forEach(site => { billed[site] = (billed[site] || 0) + 1; }));
    const doubled = days.filter(day => day.doubled);
    return {
        attendance: days.length,
        workingDays: dates.length,
        men: Object.keys(perMan).length,
        busiest,
        top: order.filter(id => perMan[id]).map(id => ({ name: names[id], days: perMan[id] }))
            .sort((a, b) => b.days - a.days).slice(0, 3),
        doubleDays: doubled.length,
        doubleMen: new Set(doubled.map(day => day.worker)).size,
        extraHours: Math.round(days.reduce((sum, day) => sum + day.hours, 0) * 100) / 100,
        billed,
        own: days.reduce((sum, day) => sum + day.sites.length, 0),
        rima,
        yosef: bySite(memory.yosef),
        repaid: agora(memory.repaid.filter(entry => entry.date.startsWith(key))
            .reduce((sum, entry) => sum + entry.amount, 0))
    };
}

const total = map => Object.keys(map).reduce((sum, id) => sum + map[id], 0);
// A map of site -> count with its keys in one order, so two of them compare as text.
const inOrder = map => { const out = {}; Object.keys(map).sort().forEach(id => { out[id] = map[id]; }); return out; };
const sitesOf = list => { const out = {}; (list || []).forEach(site => { out[site.id] = site.days !== undefined ? site.days : site.count; }); return inOrder(out); };
const numeric = cell => (typeof cell === 'number' ? cell : 0);

// ---------------------------------------------------------------- 1. the figures
const SEEDS = [31, 32, 33, 34, 35, 36, 37, 38, 39, 40];
const seen = { months: 0, empty: 0, rima: 0, yosef: 0, weekly: 0, unpriced: 0, raise: 0,
    twoCycles: 0, repaidShown: 0, repaidHidden: 0, unapproved: 0, doubles: 0, hours: 0,
    twoSites: 0, inProgress: 0, compared: 0, noCompare: 0, up: 0, down: 0, oracleWages: 0 };

[['the money gates shut', SHUT], ['the money gates open', OPEN]].forEach(([reading, flags]) => {
    suite(`every month is the reports screen's own month - ${reading}`);

    SEEDS.forEach(seed => {
        const device = seededPhone(seed, flags);
        const schedule = device.State.schedule;
        const record = JSON.parse(JSON.stringify(schedule));
        const wrong = [];
        const fail = (key, what, got, want) => wrong.push(`${key} ${what}: ${JSON.stringify(got)} against ${JSON.stringify(want)}`);
        const eq = (key, what, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) fail(key, what, got, want); };
        if (flags.carryAdvances && !device.approved) seen.unapproved += 1;
        if (schedule.workers.some(w => w.payCycles) && schedule.workers.some(w => !w.payCycles)) seen.twoCycles += 1;
        const idOf = {};
        schedule.places.forEach(place => { idOf[place.name] = place.id; });

        MONTHS.forEach(key => {
            // The report is left on a range and a filter nobody would confuse with the
            // month, so a summary that forgot to put them back is caught.
            device.run(`REPORT_RANGE.from = '2026-01-05'; REPORT_RANGE.to = '2026-01-09';`
                + `REPORT_WORKERS = new Set(['w_1']); REPORT_SECTION = 'sites';`);
            const gate = device.run('carryReportingEnabled');
            const facts = device.facts(key);
            eq(key, 'the report is left as it was', JSON.parse(device.run(
                'JSON.stringify([REPORT_RANGE.from, REPORT_RANGE.to, [...REPORT_WORKERS], REPORT_SECTION])')),
                ['2026-01-05', '2026-01-09', ['w_1'], 'sites']);
            if (device.run('carryReportingEnabled') !== gate) fail(key, 'the gate function', 'replaced', 'put back');

            const reports = reportsFor(device, key);
            const want = recordedIn(device, key);
            const head = reports.file[0];
            const col = name => reports.file.slice(1).map(row => row[head.indexOf(name)]);
            const figure = id => facts.headline.find(item => item.id === id);
            seen.months += 1;

            eq(key, 'the range', [facts.range.from, facts.range.to], [`${key}-01`, lastOf(key)]);

            // ---- against the reports screen
            eq(key, 'ימי נוכחות is the sheet\'s נוכחות column', figure('attendance').value,
                col('נוכחות').reduce((sum, n) => sum + n, 0));
            const fileGross = agora(col('נצבר').reduce((sum, cell) => sum + numeric(cell), 0));
            const bandGross = agora(reports.bands.reduce((sum, band) => sum + band.gross, 0));
            const anyPriced = reports.file.slice(1).some(row => row[head.indexOf('נוכחות')] > 0
                && typeof row[head.indexOf('נצבר')] === 'number');
            const anyWorked = col('נוכחות').some(n => n > 0);
            if (facts.money.gross === null) {
                if (anyPriced || !anyWorked) fail(key, 'נצבר is — only when nobody who worked has a rate', null, fileGross);
            } else {
                eq(key, 'נצבר is the sheet\'s נצבר column', facts.money.gross, fileGross);
                eq(key, 'and the bands the screen prints', facts.money.gross, bandGross);
            }
            eq(key, 'the tile is the same figure', figure('gross').value, facts.money.gross);
            const label = head[head.indexOf('נצבר') + 1];
            eq(key, 'the advances are under the sheet\'s own heading', facts.money.advancesLabel, label);
            eq(key, 'and are its column', facts.money.advances,
                agora(-col(label).reduce((sum, cell) => sum + numeric(cell), 0)));
            eq(key, 'and its bands', facts.money.advances,
                agora(reports.bands.reduce((sum, band) => sum + band.taken, 0)));
            const unpricedNames = reports.file.slice(1)
                .filter(row => row[head.indexOf('נוכחות')] > 0 && typeof row[head.indexOf('נצבר')] !== 'number')
                .map(row => row[0]);
            unpricedNames.forEach(name => {
                if (!facts.money.unpriced || plain(facts.money.unpriced).indexOf(name) === -1) {
                    fail(key, 'a man the sheet cannot price is named', facts.money.unpriced, name);
                }
            });
            if (unpricedNames.length > 0) seen.unpriced += 1;

            const billing = reports.invoice;
            const billingTotal = billing[billing.length - 1];
            const fileSites = {};
            billing[0].slice(1, -1).forEach((name, at) => { fileSites[idOf[name]] = billingTotal[at + 1]; });
            eq(key, 'ימי עובד־אתר per site is the billing sheet\'s total row', sitesOf(facts.work.sites), inOrder(fileSites));
            eq(key, 'and its grand total', facts.work.total, billing[0].length > 2 ? billingTotal[billingTotal.length - 1] : 0);
            const barSites = {};
            reports.bars.forEach(([name, count]) => { barSites[idOf[name]] = Number(count); });
            eq(key, 'and the bars the screen draws', sitesOf(facts.work.sites), inOrder(barSites));
            if (reports.bars.length > 0) eq(key, 'and the total under them', String(facts.work.total), reports.barsTotal[1]);
            const sorted = facts.work.sites.map(site => site.days);
            eq(key, 'the sites are in order of days', sorted, sorted.slice().sort((a, b) => b - a));

            const totalRow = file => file.filter(row => row.length > 1).slice(-1)[0];
            const countSites = (file) => {
                const out = {};
                file[0].slice(1, -1).forEach((name, at) => { out[idOf[name]] = totalRow(file)[at + 1]; });
                return inOrder(out);
            };
            if (reports.rima === null) {
                eq(key, 'no Rima block without a Rima count', [facts.rima, facts.work.own], [null, null]);
            } else {
                seen.rima += 1;
                eq(key, 'the Rima block is the Rima sheet', [sitesOf(facts.rima.sites), facts.rima.total],
                    [countSites(reports.rima), totalRow(reports.rima).slice(-1)[0]]);
                eq(key, '«בלי עובדי רימא» is that sheet\'s total', facts.work.own, totalRow(reports.norima).slice(-1)[0]);
                eq(key, 'and with Rima it is the billing total', facts.work.own + facts.rima.total, facts.work.total);
            }
            eq(key, 'the Rima tile', figure('rima').value, reports.rima === null ? 0 : totalRow(reports.rima).slice(-1)[0]);
            if (reports.yosef === null) {
                eq(key, 'no יוסף גבס block without a count', facts.yosef, null);
            } else {
                seen.yosef += 1;
                eq(key, 'the יוסף גבס block is its sheet', [sitesOf(facts.yosef.sites), facts.yosef.total],
                    [countSites(reports.yosef), totalRow(reports.yosef).slice(-1)[0]]);
            }

            // ---- the gate
            if (reports.carry) {
                eq(key, 'cash handed back is what the account\'s own function says', facts.money.repaid, agora(reports.repaid));
                if (facts.money.repaid > 0) seen.repaidShown += 1;
            } else {
                eq(key, 'cash handed back is not shown before the record may be read that way', facts.money.repaid, null);
                if (reports.repaid > 0) seen.repaidHidden += 1;
            }

            // ---- worked out a second time, by rule
            const byRule = oracle.payroll(record, `${key}-01`, lastOf(key));
            if (facts.money.gross !== null && byRule.every(row => row.amount !== null || row.attendanceDays === 0)) {
                eq(key, 'the wages by the second calculator', facts.money.gross,
                    oracle.shekels(byRule.reduce((sum, row) => sum + (row.amount || 0), 0)));
                seen.oracleWages += 1;
            }
            eq(key, 'the attendance by the second calculator', figure('attendance').value,
                byRule.reduce((sum, row) => sum + row.attendanceDays, 0));
            const billedByRule = {};
            oracle.invoice(record, `${key}-01`, lastOf(key)).filter(row => row.workerDays > 0)
                .forEach(row => { billedByRule[row.placeId] = row.workerDays; });
            eq(key, 'the billing counts by the second calculator', sitesOf(facts.work.sites), inOrder(billedByRule));

            // ---- against what was recorded
            eq(key, 'attendance, as recorded', figure('attendance').value, want.attendance);
            eq(key, 'working days, as recorded', figure('workingDays').value, want.workingDays);
            eq(key, 'the men who worked', facts.men.count, want.men);
            eq(key, 'the busiest day', facts.work.busiest && [facts.work.busiest.date, facts.work.busiest.men],
                want.busiest && [want.busiest.date, want.busiest.men]);
            eq(key, 'the average', facts.work.average,
                want.workingDays ? Math.round((want.attendance / want.workingDays) * 10) / 10 : null);
            eq(key, 'the longest three, in the roster\'s order among equals', facts.men.top, want.top);
            eq(key, 'double days and whose', [facts.men.doubleDays, facts.men.doubleMen], [want.doubleDays, want.doubleMen]);
            eq(key, 'extra hours', facts.men.extraHours, want.extraHours);
            eq(key, 'the billing counts, as recorded', sitesOf(facts.work.sites), inOrder(want.billed));
            eq(key, 'his own men\'s site-days', facts.work.own === null ? want.own : facts.work.own, want.own);
            eq(key, 'Rima, as recorded', facts.rima ? sitesOf(facts.rima.sites) : {}, inOrder(want.rima));
            eq(key, 'יוסף גבס, as recorded', facts.yosef ? sitesOf(facts.yosef.sites) : {}, inOrder(want.yosef));
            if (reports.carry) eq(key, 'cash handed back, as recorded', facts.money.repaid, want.repaid);

            // ---- empty, in progress, compared
            const nothing = reports.rows === 0 && billing[0].length <= 2 && reports.yosef === null
                && !(reports.carry && reports.repaid > 0);
            eq(key, 'a month with no record says so, and only that month', facts.empty, nothing);
            if (facts.empty) {
                seen.empty += 1;
                eq(key, 'its text is the one sentence', plain(facts.text).split('\n').slice(2), ['', 'אין רישומים בחודש הזה.']);
            }
            eq(key, 'in progress only while today is inside it and it is not over', facts.inProgress,
                !facts.empty && key === TODAY.slice(0, 7));
            if (facts.inProgress) seen.inProgress += 1;
            const deltas = facts.headline.map(item => item.delta).filter(Boolean);
            if (!facts.empty && facts.compare) seen.noCompare += 1;
            if (deltas.length > 0) seen.compared += 1;
            deltas.forEach(delta => { if (delta.dir === 'up') seen.up += 1; if (delta.dir === 'down') seen.down += 1; });
            if (want.doubleDays > 0) seen.doubles += 1;
            if (want.extraHours > 0) seen.hours += 1;
            if (want.own > want.attendance) seen.twoSites += 1;
            if (key === '2026-10' && want.top.some(man => man.name === schedule.workers[0].name)) seen.raise += 1;
        });

        // EVERY DAY IN EXACTLY ONE MONTH: the months add up to everything recorded.
        const all = MONTHS.map(key => device.facts(key));
        eq('all', 'the months\' attendance adds up to every day recorded',
            all.reduce((sum, facts) => sum + facts.headline[0].value, 0),
            device.memory.days.filter(day => !day.absent).length);
        eq('all', 'and their Rima counts to every count typed',
            all.reduce((sum, facts) => sum + (facts.rima ? facts.rima.total : 0), 0),
            device.memory.rima.reduce((sum, entry) => sum + entry.count, 0));
        eq('all', 'and their יוסף גבס counts',
            all.reduce((sum, facts) => sum + (facts.yosef ? facts.yosef.total : 0), 0),
            device.memory.yosef.reduce((sum, entry) => sum + entry.count, 0));
        // The step from last month is this month's figure less last month's, as printed.
        all.slice(1).forEach((facts, at) => {
            const before = all[at];
            facts.headline.forEach((item, index) => {
                if (!item.delta) return;
                eq(facts.key, `the step of ${item.id}`, item.delta.by, agora(item.value - before.headline[index].value));
            });
            if (!facts.empty && before.empty && facts.headline.some(item => item.delta)) {
                fail(facts.key, 'a step', 'drawn', 'none against a month with no record');
            }
        });

        check(`seed ${seed}: ${MONTHS.length} months, every figure the reports' own`, wrong.length === 0,
            wrong.slice(0, 6).join('\n      '));
    });
});

suite('the corpus really held what it claims to');
check('months were compared', seen.months === SEEDS.length * MONTHS.length * 2, String(seen.months));
check('months with no record', seen.empty >= SEEDS.length * 2, String(seen.empty));
check('months with a Rima count, and with a יוסף גבס count', seen.rima > 20 && seen.yosef > 20, `${seen.rima} ${seen.yosef}`);
check('records with both pay cycles', seen.twoCycles > 4, String(seen.twoCycles));
check('months with a man the sheet cannot price', seen.unpriced > 5, String(seen.unpriced));
check('the man who was raised is in October\'s longest three somewhere', seen.raise > 0, String(seen.raise));
check('double days, extra hours and two sites in a day', seen.doubles > 20 && seen.hours > 20 && seen.twoSites > 20,
    `${seen.doubles} ${seen.hours} ${seen.twoSites}`);
check('months in progress', seen.inProgress === SEEDS.length * 2, String(seen.inProgress));
check('steps up and steps down, and a month with nothing to compare with', seen.up > 20 && seen.down > 20
    && seen.noCompare === SEEDS.length * 2, `${seen.up} ${seen.down} ${seen.noCompare}`);
check('cash handed back was shown on approved records', seen.repaidShown > 3, String(seen.repaidShown));
check('and withheld on a record nobody approved, where there was some', seen.unapproved > 0 && seen.repaidHidden > 0,
    `${seen.unapproved} ${seen.repaidHidden}`);
check('the second calculator priced months of wages', seen.oracleWages > 30, String(seen.oracleWages));

// ---------------------------------------------------------------- 2. by hand
//
// A record small enough to price on paper.
//
//   אלף   400 a day until 20 October, 500 from then; fortnightly
//   בית   300 a day, 50 an hour; weekly
//   גימל  no rate
//
//   September   30/9 אלף צפון                                        400
//   October     1/10 אלף+בית צפון · 24, 25, 26/10 אלף צפון (the clocks go back on the 25th)
//               31/10 אלף דרום double, בית דרום +2h · Rima 3 on צפון on the 25th
//               אלף 400 + 3x500 + 1000 = 2,900 · בית 300 + 400 = 700 · 3,600
//   November    1/11 all three (גימל on דרום) · 2/11 אלף on BOTH sites, בית צפון · 3/11 אלף דרום
//               9/11 אלף צפון, בית absent · Rima 2 on צפון on the 2nd and 1 on דרום on the 5th
//               (a day none of his men worked) · יוסף גבס 4 on דרום on the 3rd
//               אלף 4x500 = 2,000 · בית 2x300 = 600 · גימל unknown · 2,600
//               1,000 handed to אלף on the 4th; 300 handed back on the 8th
function handPhone(flags, upTo) {
    const first = makeDevice({ deviceId: 'd_hand', flags });
    first.setToday(TODAY);
    const schedule = first.State.schedule;
    schedule.workers = [
        { id: 'w_1', name: 'אלף', active: true, dailyRate: 400, hourlyRate: 0 },
        { id: 'w_2', name: 'בית', active: true, dailyRate: 300, hourlyRate: 50, payCycles: '2026-08-07=weekly' },
        { id: 'w_3', name: 'גימל', active: true }];
    schedule.places = [{ id: 'p_1', name: 'צפון', active: true }, { id: 'p_2', name: 'דרום', active: true }];
    const put = (date, worker, place, rate, hours) =>
        first.call('assignPlace', schedule, date, worker, 'actual', place, rate, hours);
    put('2026-09-30', 'w_1', 'p_1');
    put('2026-10-01', 'w_1', 'p_1'); put('2026-10-01', 'w_2', 'p_1');
    schedule.workers[0].dailyRate = 500;
    ['2026-10-24', '2026-10-25', '2026-10-26'].forEach(date => put(date, 'w_1', 'p_1'));
    put('2026-10-31', 'w_1', 'p_2', 'double'); put('2026-10-31', 'w_2', 'p_2', 'extra', 2);
    first.call('setRimaCount', schedule, '2026-10-25', 'p_1', 3);
    first.call('addAdvance', schedule, 'w_2', '2026-10-10', 200, '');
    if (upTo !== 'october') {
        put('2026-11-01', 'w_1', 'p_1'); put('2026-11-01', 'w_2', 'p_1'); put('2026-11-01', 'w_3', 'p_2');
        put('2026-11-02', 'w_1', 'p_1'); put('2026-11-02', 'w_1', 'p_2'); put('2026-11-02', 'w_2', 'p_1');
        put('2026-11-03', 'w_1', 'p_2');
        put('2026-11-09', 'w_1', 'p_1');
        first.call('markAbsent', schedule, '2026-11-09', 'w_2', 'actual');
        first.call('setRimaCount', schedule, '2026-11-02', 'p_1', 2);
        first.call('setRimaCount', schedule, '2026-11-05', 'p_2', 1);
        first.call('setYosefGevesCount', schedule, '2026-11-03', 'p_2', 4);
        first.call('addAdvance', schedule, 'w_1', '2026-11-04', 1000, '');
    }
    first.State.save({ silent: true });
    const device = withSummary(makeDevice({ deviceId: 'd_hand', storage: first.dump(), flags }));
    device.State.load();
    return device;
}

const approve = device => {
    const plan = device.call('planCarryMigration', device.State.schedule);
    return device.State.commit(device.call('recordCarryApproval', device.State.schedule,
        plan, '2026-11-05T09:00:00.000Z', 'd_person'));
};

{
    suite('a month priced on paper: the raise, the month\'s end, the clock change');

    const device = handPhone(OPEN);
    given('the record needs its migration approved, and gets it', device.call('planCarryMigration',
        device.State.schedule).needed === true && approve(device) === true
        && device.call('carryReportingEnabled', device.State.schedule) === true);
    const advance = device.call('advancesFor', device.State.schedule, 'w_1', '2026-11-01', '2026-11-30')[0];
    given('300 is handed back on the 8th, through the model\'s own recorder',
        device.State.commit(device.call('recordAdvanceRepaid', device.State.schedule, advance.id, 300,
            '2026-11-08', '', '2026-11-08T10:00:00.000Z', 'd_person', 'cash')) === true);

    const october = device.facts('2026-10');
    const tiles = facts => facts.headline.map(item => [item.label, item.text, item.delta ? plain(item.delta.text) : null]);
    same('October: seven days of attendance on five dates, 3,600, three of Rima\'s - each against September',
        tiles(october), [
            ['ימי נוכחות', '7', '↑ 6 יותר מספטמבר'],
            ['ימי עבודה', '5', '↑ 4 יותר מספטמבר'],
            ['נצבר', '3600 ₪', '↑ 3200 ₪ יותר מספטמבר'],
            ['סה״כ עובדי רימא', '3', '↑ 3 יותר מספטמבר']]);
    same('the days before the raise at 400 and the days after it at 500 - not 5 x 500, not 5 x 400',
        [october.money.gross, 400 + 3 * 500 + 2 * 500 + 300 + 300 + 2 * 50], [3600, 3600]);
    same('24, 25 and 26 October are three days, the night the clocks go back among them',
        [october.work.sites, october.work.total, october.work.own],
        [[{ id: 'p_1', name: 'צפון', days: 8 }, { id: 'p_2', name: 'דרום', days: 2 }], 10, 7]);
    same('the busiest day is the earlier of two equal ones', [october.work.busiest.date, october.work.busiest.men,
        october.work.busiest.when, october.work.average], ['2026-10-01', 2, 'יום חמישי 01/10', 1.4]);
    same('31 October is October\'s: one double day, one man\'s; two hours', [october.men.doubleDays, october.men.doubleMen,
        october.men.extraHours], [1, 1, 2]);
    same('the 200 of 10 October is October\'s advance, under the sheet\'s heading',
        [october.money.advancesLabel, october.money.advances, october.money.repaid], ['מקדמות', 200, 0]);

    const november = device.facts('2026-11');
    same('November: 1 November is November\'s, and the month is still open',
        [tiles(november), november.inProgress], [[
            ['ימי נוכחות', '7', 'כמו באוקטובר'],
            ['ימי עבודה', '4', '↓ 1 פחות מאוקטובר'],
            ['נצבר', '2600 ₪', '↓ 1000 ₪ פחות מאוקטובר'],
            ['סה״כ עובדי רימא', '3', 'כמו באוקטובר']], true]);
    same('a man on two sites in a day is one day of attendance and two site-days; a day of Rima\'s alone is no working day',
        [november.work.sites, november.work.total, november.work.own, november.work.average],
        [[{ id: 'p_1', name: 'צפון', days: 7 }, { id: 'p_2', name: 'דרום', days: 4 }], 11, 8, 1.8]);
    same('the two counts, apart', [november.rima, november.yosef], [
        { sites: [{ id: 'p_1', name: 'צפון', count: 2 }, { id: 'p_2', name: 'דרום', count: 1 }], total: 3 },
        { sites: [{ id: 'p_2', name: 'דרום', count: 4 }], total: 4 }]);
    same('the men', november.men, { count: 3, top: [{ name: 'אלף', days: 4 }, { name: 'בית', days: 2 },
        { name: 'גימל', days: 1 }], doubleDays: 0, doubleMen: 0, extraHours: 0 });
    same('the money: גימל is named, not counted as nothing in silence',
        [november.money.gross, november.money.advances, november.money.repaid, november.money.reversed,
            plain(november.money.unpriced)],
        [2600, 1000, 300, 0, '⚠️ 1 עובדים בלי שכר יומי, ולכן הסכום חסר אותם: גימל. הוסף להם שכר במסך "עובדים ואתרים".']);

    same('the text that leaves the phone, line for line', plain(november.text).split('\n'), [
        '📊 סיכום חודש · נובמבר 2026',
        '01/11/2026 - 30/11/2026',
        'החודש עוד לא נגמר. המספרים הם של מה שנרשם עד עכשיו, וההשוואה היא מול חודש שלם.',
        '',
        'ימי נוכחות: 7 · כמו באוקטובר',
        'ימי עבודה: 4 · ↓ 1 פחות מאוקטובר',
        'נצבר: 2600 ₪ · ↓ 1000 ₪ פחות מאוקטובר',
        'סה״כ עובדי רימא: 3 · כמו באוקטובר',
        'ממוצע עובדים ליום עבודה: 1.8',
        'היום העמוס ביותר: יום ראשון 01/11 · 3 עובדים',
        '',
        'ימי עובד־אתר לפי אתר',
        '• צפון: 7',
        '• דרום: 4',
        'סה״כ ימי עובד־אתר: 11',
        'בלי עובדי רימא: 8',
        '',
        'רישום לרימא',
        '• צפון: 2',
        '• דרום: 1',
        'סה״כ עובדי רימא: 3',
        'עובדי רימא בלבד. אינם נכללים בשכר. בחיוב כל אחד מהם נספר כיום עובד־אתר אחד.',
        '',
        'עובדי יוסף גבס',
        '• דרום: 4',
        'סה״כ עובדי יוסף גבס: 4',
        'עובדי יוסף גבס בלבד. אינם נכללים בשכר ואינם נכללים בחיוב.',
        '',
        'עובדים שעבדו: 3',
        'הכי הרבה ימים:',
        '• אלף: 4',
        '• בית: 2',
        '• גימל: 1',
        '',
        'נצבר: 2600 ₪',
        'מקדמות: 1000 ₪',
        'הוחזר במזומן: 300 ₪',
        '⚠️ 1 עובדים בלי שכר יומי, ולכן הסכום חסר אותם: גימל. הוסף להם שכר במסך "עובדים ואתרים".']);
    check('a name travels isolated, so a Latin one cannot be reordered by the line around it',
        november.text.indexOf('⁨אלף⁩') !== -1 && november.text.indexOf('⁨צפון⁩') !== -1);
    check('the range is one left-to-right run', november.text.split('\n')[1] === '⁦01/11/2026 - 30/11/2026⁩');

    const september = device.facts('2026-09');
    same('September has nothing before it, and says so once instead of four steps',
        [september.headline.map(item => item.delta), september.compare],
        [[null, null, null, null], 'אין רישומים באוגוסט, ולכן אין השוואה.']);
    same('a month before the record, and one after it', [device.facts('2026-08').empty, device.facts('2026-12').empty,
        plain(device.facts('2026-12').text)], [true, true, '📊 סיכום חודש · דצמבר 2026\n01/12/2026 - 31/12/2026\n\nאין רישומים בחודש הזה.']);

    // THE CALENDAR, every month of a year with both clock changes in it (27 March and 25
    // October 2026 in this zone) and a leap February beside it.
    same('every month is its first day to its last, by the phone\'s own calendar',
        JSON.parse(device.run(`JSON.stringify(['2026-01','2026-02','2026-03','2026-04','2026-10','2026-12','2028-02']
            .map(key => [monthSummaryRange(key).from, monthSummaryRange(key).to]))`)),
        [['2026-01-01', '2026-01-31'], ['2026-02-01', '2026-02-28'], ['2026-03-01', '2026-03-31'],
            ['2026-04-01', '2026-04-30'], ['2026-10-01', '2026-10-31'], ['2026-12-01', '2026-12-31'],
            ['2028-02-01', '2028-02-29']]);
    same('a step back from January is December of the year before, and forward from December the next January',
        JSON.parse(device.run(`JSON.stringify([monthSummaryShift('2026-01', -1), monthSummaryShift('2026-12', 1),
            monthSummaryShift('2026-03', 1), monthSummaryShift('2026-11', -1), monthSummaryKeyOf('2026-10-25')])`)),
        ['2025-12', '2027-01', '2026-04', '2026-10', '2026-10']);

    // A MONTH THAT IS OVER is not "in progress", and today's month on its last day is whole.
    device.setToday('2026-11-30');
    same('on the month\'s last day it is no longer "not over"', device.facts('2026-11').inProgress, false);
    device.setToday('2026-12-02');
    same('nor from the next month', [device.facts('2026-11').inProgress, device.facts('2026-10').inProgress], [false, false]);
    device.setToday(TODAY);
}

// ---------------------------------------------------------------- 3. the gate
{
    suite('the gate is the reports\': cash handed back waits for an approval, the wage does not move');

    const device = handPhone(OPEN);
    const advance = device.call('advancesFor', device.State.schedule, 'w_1', '2026-11-01', '2026-11-30')[0];
    // It arrived from a phone that had approved; this one has not.
    device.State.schedule.ledger.advances.le_back = { id: 'le_back', advanceId: advance.id, kind: 'repaid',
        workerId: 'w_1', date: '2026-11-08', amount: 300, note: '', method: 'cash',
        at: '2026-11-08T10:00:00.000Z', by: 'd_elsewhere' };
    device.State.save({ silent: true });
    given('both gates are open and the migration is needed and unapproved',
        device.call('advanceCarryEnabled') === true && device.call('planCarryMigration', device.State.schedule).needed === true
        && device.call('carryReportingEnabled', device.State.schedule) === false);
    given('the 300 is on the record', device.call('advanceRepaymentsFor', device.State.schedule, 'w_1',
        '2026-11-01', '2026-11-30') === 300);

    const before = device.facts('2026-11');
    same('before anybody approves: the wage, the advances under «מקדמות», and no cash handed back at all',
        [before.money.gross, before.money.advancesLabel, before.money.advances, before.money.repaid, before.money.reversed],
        [2600, 'מקדמות', 1000, null, null]);
    check('and the text does not say it either', before.text.indexOf('הוחזר במזומן') === -1, before.text);

    // An approval that is only in memory moves nothing on a reopened phone.
    given('a durable approval', approve(device) === true);
    const after = device.facts('2026-11');
    same('after it: the same wage and the same advances, and the 300',
        [after.money.gross, after.money.advancesLabel, after.money.advances, after.money.repaid],
        [2600, 'מקדמות', 1000, 300]);
    check('in the ledger\'s own words', after.text.split('\n').indexOf('הוחזר במזומן: 300 ₪') !== -1, after.text);

    const shut = handPhone(SHUT);
    const plainRead = shut.facts('2026-11');
    same('with the build\'s gate shut: the month reads the same, and no cash handed back',
        [plainRead.money.gross, plainRead.money.advances, plainRead.money.repaid], [2600, 1000, null]);

    const shipped = handPhone(undefined);
    same('and on the build as a person installs it, the wage is the same 2,600',
        shipped.facts('2026-11').money.gross, 2600);

    // THE GATE FUNCTION IS PUT BACK EVEN WHEN A READER THROWS.
    const gate = device.run('carryReportingEnabled');
    device.run('REPORT_RANGE.from = "2026-02-01"; REPORT_RANGE.to = "2026-02-14"; REPORT_WORKERS = new Set(["w_2"]);');
    const real = device.run('payrollRows');
    device.ctx.payrollRows = () => { throw new Error('boom'); };
    let thrown = '';
    try { device.facts('2026-11'); } catch (error) { thrown = error.message; }
    device.ctx.payrollRows = real;
    same('a reader that throws leaves the report\'s range, its filter and the gate as they were',
        [thrown, device.run('carryReportingEnabled') === gate, JSON.parse(device.run(
            'JSON.stringify([REPORT_RANGE.from, REPORT_RANGE.to, [...REPORT_WORKERS]])'))],
        ['boom', true, ['2026-02-01', '2026-02-14', ['w_2']]]);
    let asked = 0;
    device.ctx.carryReportingEnabled = schedule => { asked += 1; return gate(schedule); };
    device.facts('2026-11');
    device.ctx.carryReportingEnabled = gate;
    same('the gate is asked once for both months of a reading', asked, 1);
}

// ---------------------------------------------------------------- 4. it writes nothing
{
    suite('a reading: not one key on the disk moves');

    const device = handPhone(OPEN);
    approve(device);
    const disk = () => JSON.stringify(device.dump());
    const before = disk();
    const record = JSON.stringify(device.State.schedule);

    device.run('openMonthSummary()');
    const modal = device.dom.getElementById('monthSummaryModal');
    same('it opens on the month today is in', [modal.style.display, device.run('MONTH_SUMMARY_KEY'),
        device.dom.getElementById('monthSummaryMonth').textContent, device.dom.getElementById('monthSummaryTitle').textContent],
        ['flex', '2026-11', 'נובמבר 2026', 'סיכום חודש']);
    same('the frame is worded from the file\'s blocks',
        ['monthSummaryPrev', 'monthSummaryNext', 'monthSummaryFoldLabel', 'monthSummarySend', 'monthSummaryCopy',
            'monthSummaryClose'].map(id => device.dom.getElementById(id).textContent),
        ['חודש קודם', 'חודש הבא', 'הסיכום כטקסט', '💬 שלח בוואטסאפ', 'העתק', 'סגור']);
    const body = device.dom.getElementById('monthSummaryBody');
    same('the four tiles on the screen are the four figures', body.querySelectorAll('.msum-tile').map(tile =>
        tile.children.map(node => plain(node.textContent))), device.facts('2026-11').headline.map(item =>
        [item.label, item.text].concat(item.delta ? [plain(item.delta.text)] : [])));
    same('a bar per site, the number beside it', body.querySelectorAll('.msum-bar-row').map(row =>
        [row.querySelectorAll('.site-name')[0].textContent, row.querySelectorAll('.msum-bar-count')[0].textContent,
            row.querySelectorAll('.msum-bar-fill')[0].style.width, row.querySelectorAll('.msum-bar-fill')[0].style.background]),
        [['צפון', '7', '100%', 'var(--site-1)'], ['דרום', '4', '57%', 'var(--site-2)']]);
    same('each count under its own name with its own note', [
        body.querySelectorAll('.msum-rima')[0].children[0].textContent,
        body.querySelectorAll('.msum-rima')[0].querySelectorAll('.msum-note')[0].textContent,
        body.querySelectorAll('.msum-yosefgeves')[0].children[0].textContent,
        body.querySelectorAll('.msum-yosefgeves')[0].querySelectorAll('.msum-note')[0].textContent],
        ['רישום לרימא', 'עובדי רימא בלבד. אינם נכללים בשכר. בחיוב כל אחד מהם נספר כיום עובד־אתר אחד.',
            'עובדי יוסף גבס', 'עובדי יוסף גבס בלבד. אינם נכללים בשכר ואינם נכללים בחיוב.']);
    same('the money block reads the lines the text reads', body.querySelectorAll('.msum-money')[0]
        .querySelectorAll('.msum-line').map(line => line.children.map(node => plain(node.textContent))),
        [['נצבר', '2600 ₪'], ['מקדמות', '1000 ₪'], ['הוחזר במזומן', '0 ₪']]);
    same('the field holds the text', device.dom.getElementById('monthSummaryText').value, device.facts('2026-11').text);

    device.run('monthSummaryStep(-1)');
    same('one step back is October', [device.run('MONTH_SUMMARY_KEY'), device.dom.getElementById('monthSummaryMonth').textContent,
        device.dom.getElementById('monthSummaryText').value], ['2026-10', 'אוקטובר 2026', device.facts('2026-10').text]);
    device.run('monthSummaryStep(-1); monthSummaryStep(-1)');
    same('two more is August, which has no record and says only that',
        [device.run('MONTH_SUMMARY_KEY'), body.querySelectorAll('.empty-hint').map(node => node.textContent),
            body.querySelectorAll('.msum-tile').length], ['2026-08', ['אין רישומים בחודש הזה.'], 0]);
    device.run('monthSummaryStep(1); monthSummaryStep(1); monthSummaryStep(1); monthSummaryStep(1)');
    same('and four forward is December', device.run('MONTH_SUMMARY_KEY'), '2026-12');
    device.run('monthSummaryStep(-1); renderMonthSummaryIfOpen(); monthSummarySend(); monthSummaryCopy()');
    same('the two doors are handed the field\'s words, and the copy shows the field first',
        [device.shared, device.dom.getElementById('monthSummaryText').hidden],
        [[['share', device.facts('2026-11').text], ['copy', device.facts('2026-11').text]], false]);
    device.run('closeMonthSummary()');
    same('closed: hidden, and it forgets which month it was', [modal.style.display, device.run('MONTH_SUMMARY_KEY')], ['none', null]);
    device.run('monthSummaryStep(1); monthSummarySend(); monthSummaryCopy(); renderMonthSummaryIfOpen()');
    same('and nothing it has answers while it is shut', [device.run('MONTH_SUMMARY_KEY'), device.shared.length], [null, 2]);
    MONTHS.forEach(key => device.facts(key));

    same('every key on the disk is byte for byte what it was', disk(), before);
    same('and the record in memory', JSON.stringify(device.State.schedule), record);
    device.State.commit(device.call('assignPlace', device.State.schedule, '2026-11-10', 'w_2', 'actual', 'p_1'));
    check('the comparison notices a real write', disk() !== before);
    same('and the summary then says what the record says now', device.facts('2026-11').headline[0].value, 8);
    const src = SUMMARY.replace(/\/\/[^\n]*/g, '');
    check('the file names no writer: no Store, no commit, no save, no localStorage',
        !/\bStore\b|\.commit|commitMany|\.save\(|localStorage|setVerified/.test(src));
    check('and prices nothing: no rate is read in it', !/dailyRate|hourlyRate|ratesForDay/.test(src));
    check('nor does it name the יוסף גבס layer or the Rima layer - only their reports', !/schedule\.days|rimaCount|yosefGevesCount|_LAYER/.test(src));
    check('it never prints by itself and never asks the browser a question', !/window\.print|\balert\(|\bconfirm\(|\bprompt\(/.test(src));
}

// ---------------------------------------------------------------- 5. the words
{
    suite('the words: each new one pinned, each borrowed one found where its owner keeps it');

    const device = handPhone(SHUT);
    const T = JSON.parse(device.run(`JSON.stringify(Object.assign({}, MONTH_SUMMARY_TEXT, {
        unpriced: MONTH_SUMMARY_TEXT.unpriced(2, 'א, ב'), more: MONTH_SUMMARY_TEXT.more('5', 'מאי'),
        less: MONTH_SUMMARY_TEXT.less('5', 'מאי'), same: MONTH_SUMMARY_TEXT.same('מאי'),
        noCompare: MONTH_SUMMARY_TEXT.noCompare('מאי') }))`));
    same('every new string, word for word', T, {
        title: 'סיכום חודש',
        months: ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'],
        prev: 'חודש קודם',
        next: 'חודש הבא',
        empty: 'אין רישומים בחודש הזה.',
        inProgress: 'החודש עוד לא נגמר. המספרים הם של מה שנרשם עד עכשיו, וההשוואה היא מול חודש שלם.',
        workingDays: 'ימי עבודה',
        average: 'ממוצע עובדים ליום עבודה',
        busiest: 'היום העמוס ביותר',
        men: 'עובדים שעבדו',
        top: 'הכי הרבה ימים',
        rimaNote: 'עובדי רימא בלבד. אינם נכללים בשכר. בחיוב כל אחד מהם נספר כיום עובד־אתר אחד.',
        unpriced: '⚠️ 2 עובדים בלי שכר יומי, ולכן הסכום חסר אותם: א, ב. הוסף להם שכר במסך "עובדים ואתרים".',
        more: '↑ 5 יותר ממאי',
        less: '↓ 5 פחות ממאי',
        same: 'כמו במאי',
        noCompare: 'אין רישומים במאי, ולכן אין השוואה.',
        asText: 'הסיכום כטקסט'
    });
    same('the Rima note is the table\'s own, less the one word of place',
        T.rimaNote, device.run('RIMA_NOTE').replace('בחיוב שלמעלה', 'בחיוב'));

    const R = JSON.parse(device.run('JSON.stringify(MONTH_SUMMARY_REUSED)'));
    const owners = { send: 'index.html', copy: 'index.html', close: 'index.html' };
    const missing = Object.keys(R).filter(name => source(owners[name] || 'js/ui/reports.js').indexOf(R[name]) === -1);
    same('every borrowed word is in its owner\'s source', missing, []);
    same('and the ones read straight from the reports are the reports\'', JSON.parse(device.run(
        'JSON.stringify([RIMA_TITLE, RIMA_TOTAL, YOSEF_GEVES_TITLE, YOSEF_GEVES_TOTAL, YOSEF_GEVES_NOTE, NO_RIMA_TITLE, LEDGER_KIND_LABELS.repaid, LEDGER_KIND_LABELS.reversed])')),
        ['רישום לרימא', 'סה״כ עובדי רימא', 'עובדי יוסף גבס', 'סה״כ עובדי יוסף גבס',
            'עובדי יוסף גבס בלבד. אינם נכללים בשכר ואינם נכללים בחיוב.', 'בלי עובדי רימא', 'הוחזר במזומן', 'תיקון-היפוך']);
    check('no word of it says «נשלח»', SUMMARY.indexOf('נשלח') === -1);
    const hebrewOutsideBlocks = SUMMARY.slice(SUMMARY.indexOf('const MONTH_SUMMARY_TOP')).replace(/\/\/[^\n]*/g, '').match(/'[^'\n]*[א-ת][^'\n]*'|`[^`\n]*[א-ת][^`\n]*`/g);
    same('no Hebrew string is written anywhere but in the two blocks', hebrewOutsideBlocks, null);

    // THE ENTRY: one row, asked for by the reports screen through typeof.
    const reportsSource = source('js/ui/reports.js');
    same('the reports screen asks for the entry in one guarded line',
        (reportsSource.match(/monthSummary/g) || []).length === 2
        && reportsSource.indexOf("if (typeof monthSummaryEntry === 'function') actions.appendChild(monthSummaryEntry());") !== -1, true);
    const entry = device.run('monthSummaryEntry()');
    same('the row says what it opens', [entry.textContent, entry.id], ['סיכום חודש', 'monthSummaryOpen']);
    const bare = makeDevice({ deviceId: 'd_bare', flags: SHUT });
    const dom = makeDom();
    IDS.forEach(id => dom.register(id));
    bare.ctx.document = dom;
    vm.runInContext(source('js/ui/sitecolor.js'), bare.ctx);
    vm.runInContext(source('js/ui/reports.js'), bare.ctx);
    same('without the file the menu is the three outputs it always was',
        vm.runInContext('renderReportActions().querySelectorAll("button").map(node => node.textContent)', bare.ctx).length, 3);
    vm.runInContext(SUMMARY, bare.ctx);
    same('and with it, a fourth row at the end', vm.runInContext(
        'renderReportActions().querySelectorAll("button").map(node => node.textContent)', bare.ctx).slice(3), ['סיכום חודש']);

    // THE SHELL: served, cached, closable, redrawn.
    const index = source('index.html');
    check('the script is loaded after reports.js and share.js', index.indexOf('<script src="js/ui/monthsummary.js">') > index.indexOf('<script src="js/ui/share.js">')
        && index.indexOf('<script src="js/ui/share.js">') > index.indexOf('<script src="js/ui/reports.js">')
        && index.indexOf('<script src="js/ui/reports.js">') !== -1);
    check('as a classic script', /<script src="js\/ui\/monthsummary\.js"><\/script>/.test(index));
    check('it is in the service worker\'s shell', source('sw.js').indexOf("'./js/ui/monthsummary.js'") !== -1);
    check('Escape closes it through its own function', source('js/ui/modal.js').indexOf('monthSummaryModal: () => closeMonthSummary()') !== -1);
    check('render() redraws it when it is open', source('js/app.js').indexOf("if (typeof renderMonthSummaryIfOpen === 'function') renderMonthSummaryIfOpen();") !== -1);
    check('every id the file writes into is in the frame', IDS.filter(id => id.startsWith('monthSummary'))
        .every(id => index.indexOf(`id="${id}"`) !== -1));
    check('the field is read-only, and folded away until asked for', /<textarea id="monthSummaryText"[^>]*readonly hidden/.test(index));
}

report();
