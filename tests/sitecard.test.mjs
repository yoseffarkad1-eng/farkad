// כרטיס אתר - one site on one screen, on devices.
//
//   node tests/sitecard.test.mjs
//
// The card (js/ui/sitecard.js) is one more surface showing counts that «לפי אתר» already
// shows, and it adds a text that goes to a CLIENT. So what this suite holds is not that
// the card is right. It is that it CANNOT BE DIFFERENT:
//
//   1. THE COUNTS ARE THE REPORTS'. Over seeded records - Rima, עובדי יוסף גבס, a man at
//      two sites in one day, absences, Saturdays, a hidden site, a site nobody ever stood
//      on, a month before the record, one after it, one in progress - every count of every
//      site in every month is the number the reports screen has when its range is that
//      month: the site's column of the חיוב sheet, of «בלי עובדי רימא», of the רימא sheet
//      and of the יוסף גבס sheet, and the one-client file when the site is chosen. Then
//      the same counts are held against what was RECORDED, remembered by the generator.
//   2. A MONTH ON PAPER. A hand-written record, every figure and every line of the
//      client's text written out here.
//   3. THE CLIENT'S TEXT. It totals to the invoice's count, says nothing of «עובדי יוסף
//      גבס» - a count typed for the list moves the card and not one byte of the text -
//      and carries no price.
//   4. THE SCREEN. What is drawn is what the facts say; a day goes to the day screen, a
//      man to his own card on the same month; the doors do not answer while the text is
//      folded away.
//   5. IT WRITES NOTHING. Every key on the disk, byte for byte - then shown to notice a
//      real write.
//   6. THE WORDS, and the shell.

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDevice } from './harness.mjs';
import { makeDom } from './moneydom.mjs';
import { suite, check, same, report } from './runner.mjs';

process.env.TZ = 'Asia/Jerusalem';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = file => readFileSync(join(ROOT, file), 'utf8');
const CARD = source('js/ui/sitecard.js');

const SHUT = { carryAdvances: false, ledgerWrites: false };
const OPEN = { carryAdvances: true, ledgerWrites: true };

// A Tuesday in a month that is not over. The record starts on 1 September.
const TODAY = '2026-11-10';
const FIRST_DAY = '2026-09-01';
const MONTHS = ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12'];
const MONTH_NAMES = { '2026-08': 'אוגוסט 2026', '2026-09': 'ספטמבר 2026', '2026-10': 'אוקטובר 2026',
    '2026-11': 'נובמבר 2026', '2026-12': 'דצמבר 2026' };

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
const weekdayOf = date => new Date(`${date}T12:00:00`).getDay();
// The marks the app pins direction with, taken off so a line can be read and compared.
const plain = text => String(text).replace(/[‎⁦-⁩]/g, '');

const IDS = ['reportsView', 'advancesView', 'workerDaysTitle', 'workerDaysMeta', 'workerDaysBody',
    'workerDaysModal', 'workerCardModal', 'workerCardTitle', 'workerCardBody', 'workerCardReport',
    'workerCardAdvances', 'siteCardModal', 'siteCardTitle', 'siteCardWho', 'siteCardPrev', 'siteCardMonth',
    'siteCardNext', 'siteCardHome', 'siteCardBody', 'siteCardClientOpen', 'siteCardClient', 'siteCardText',
    'siteCardSend', 'siteCardCopy', 'siteCardStatus', 'siteCardClose'];

// The report code, the worker's card, the month summary and the site's card, in the
// device's own context, over a DOM that can be read back.
function withCard(device) {
    const dom = makeDom();
    IDS.forEach(id => dom.register(id));
    const make = dom.createElement;
    dom.createElement = tag => { const node = make(tag); node.dataset = {}; return node; };
    device.ctx.document = dom;
    device.dom = dom;
    device.run = code => vm.runInContext(code, device.ctx, { filename: 'harness:sitecard' });
    ['js/ui/sitecolor.js', 'js/ui/reports.js', 'js/ui/week.js', 'js/ui/seder.js', 'js/ui/workercard.js',
        'js/ui/monthsummary.js'].forEach(file => device.run(source(file)));
    device.run(CARD);
    device.views = [];
    device.ctx.showView = view => { device.views.push(view); };
    device.ctx.askTell = () => Promise.resolve();
    device.ctx.askConfirm = () => Promise.resolve(true);
    device.shared = [];
    device.ctx.shareTextOut = (text, status, done) => { device.shared.push(['share', text]); done(); };
    device.ctx.copyTextOut = (box, status) => { device.shared.push(['copy', box.value]); };
    device.setToday(TODAY);
    device.facts = (id, key) => JSON.parse(device.run(
        `JSON.stringify(siteCardFacts(${JSON.stringify(id)}, ${JSON.stringify(key)}))`));
    return device;
}

// What the REPORTS SCREEN has when its range is this month: the four sheets it exports
// with every site on them, and - with this one site chosen for a client - the client's
// own file and the client's own page.
function reportsFor(device, key, placeId) {
    return JSON.parse(device.run(`(function (from, to, id) {
        const held = [REPORT_RANGE.from, REPORT_RANGE.to, REPORT_WORKERS, INVOICE_PLACE, REPORT_SECTION];
        REPORT_RANGE.from = from; REPORT_RANGE.to = to; REPORT_WORKERS = null;
        REPORT_SECTION = 'sites'; INVOICE_PLACE = null;
        const out = { invoice: invoiceSheetRows(), norima: withoutRimaSheetRows(), rima: rimaSheetRows(),
            yosef: yosefGevesSheetRows() };
        INVOICE_PLACE = id;
        out.chosen = Boolean(scopedExportPlace());
        if (out.chosen) {
            const sheets = reportSheets();
            out.client = { keys: Object.keys(sheets), invoice: sheets.invoice, rima: sheets.rima || null,
                norima: sheets.withoutRima || null };
            const page = renderInvoiceTable();
            out.page = { title: page.querySelectorAll('H2')[0].textContent,
                grid: page.querySelectorAll('.invoice-grid')[0].querySelectorAll('TR')
                    .map(row => row.children.map(cell => cell.textContent)),
                rima: (page.querySelectorAll('.report-rima')[0] || { querySelectorAll: () => [] })
                    .querySelectorAll('TR').map(row => row.children.map(cell => cell.textContent)),
                rimaTitle: page.querySelectorAll('.report-rima-title').map(node => node.textContent),
                rimaNote: page.querySelectorAll('.report-rima-note').map(node => node.textContent) };
        }
        REPORT_RANGE.from = held[0]; REPORT_RANGE.to = held[1]; REPORT_WORKERS = held[2];
        INVOICE_PLACE = held[3]; REPORT_SECTION = held[4];
        return JSON.stringify(out);
    })(${JSON.stringify(`${key}-01`)}, ${JSON.stringify(lastOf(key))}, ${JSON.stringify(placeId)})`));
}

// One site's column of a sheet: { byDate, total }, or null when the sheet (or the column)
// is not there. The first row is the header, the last counted row the totals.
function columnOf(sheet, name) {
    if (!sheet) return null;
    const at = sheet[0].indexOf(name);
    if (at <= 0) return null;
    const rows = sheet.slice(1).filter(row => row.length > 1);
    const byDate = {};
    rows.slice(0, -1).forEach(row => { if (row[at] !== 0) byDate[row[0]] = row[at]; });
    return { byDate, total: rows[rows.length - 1][at] };
}

// ---------------------------------------------------------------- seeded records
//
// `memory` remembers what was RECORDED - which man stood on which site on which date, a
// count typed for a site - and nothing else.
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
    const first = makeDevice({ deviceId: `d_site${seed}`, flags });
    first.setToday(TODAY);
    const schedule = first.State.schedule;
    const memory = { days: [], rima: [], yosef: [] };

    const crew = 4 + Math.floor(rand() * 4);
    schedule.workers = [];
    for (let n = 1; n <= crew; n += 1) {
        schedule.workers.push({ id: `w_${n}`, name: `עובד ${seed}-${n}`, active: rand() > 0.15,
            dailyRate: pick([0, 380, 410, 450]), hourlyRate: pick([0, 50]) });
    }
    // Three to five sites in use, the last of them HIDDEN from the list (it still has its
    // days), and one more that nobody ever stands on.
    const sites = 3 + Math.floor(rand() * 3);
    schedule.places = [];
    for (let n = 1; n <= sites; n += 1) {
        schedule.places.push({ id: `p_${n}`, name: `אתר ${seed}-${n}`, active: n !== sites });
    }
    const siteIds = schedule.places.map(place => place.id);
    schedule.places.push({ id: `p_${sites + 1}`, name: `אתר ריק ${seed}`, active: true });

    datesBetween(FIRST_DAY, TODAY).forEach(date => {
        const saturday = weekdayOf(date) === 6;
        schedule.workers.forEach(worker => {
            const roll = rand();
            if (roll < (saturday ? 0.85 : 0.3)) return;
            if (roll < (saturday ? 0.87 : 0.36)) {
                first.call('markAbsent', schedule, date, worker.id, 'actual');
                return;
            }
            const one = pick(siteIds);
            const band = rand();
            const rate = band < 0.1 ? 'double' : band < 0.2 ? 'extra' : undefined;
            first.call('assignPlace', schedule, date, worker.id, 'actual', one, rate, rate === 'extra' ? 2 : undefined);
            const here = [one];
            if (roll > 0.9) {
                const two = pick(siteIds.filter(id => id !== one));
                first.call('assignPlace', schedule, date, worker.id, 'actual', two);
                here.push(two);
            }
            memory.days.push({ date, worker: worker.id, sites: here });
        });
        // The two counts, on a day in five and a day in seven, each on one site.
        if (rand() < 0.2) {
            const entry = { date, place: pick(siteIds), count: 1 + Math.floor(rand() * 5) };
            first.call('setRimaCount', schedule, date, entry.place, entry.count);
            memory.rima.push(entry);
        }
        if (rand() < 0.14) {
            const entry = { date, place: pick(siteIds), count: 1 + Math.floor(rand() * 4) };
            first.call('setYosefGevesCount', schedule, date, entry.place, entry.count);
            memory.yosef.push(entry);
        }
    });
    first.State.save({ silent: true });

    const device = withCard(makeDevice({ deviceId: `d_site${seed}`, storage: first.dump(), flags }));
    device.State.load();
    device.memory = memory;
    return device;
}

// What one site's month must hold, from what was recorded.
function recordedIn(device, key, placeId) {
    const memory = device.memory;
    const mine = memory.days.filter(day => day.date.startsWith(key) && day.sites.indexOf(placeId) !== -1);
    const men = {};
    const perMan = {};
    mine.forEach(day => {
        men[day.date] = (men[day.date] || 0) + 1;
        perMan[day.worker] = (perMan[day.worker] || 0) + 1;
    });
    const typed = list => {
        const out = {};
        list.filter(entry => entry.date.startsWith(key) && entry.place === placeId)
            .forEach(entry => { out[entry.date] = entry.count; });
        return out;
    };
    const rima = typed(memory.rima);
    const billed = Object.assign({}, rima);
    Object.keys(men).forEach(date => { billed[date] = (billed[date] || 0) + men[date]; });
    return { men, perMan, rima, yosef: typed(memory.yosef), billed };
}

const sum = map => Object.keys(map).reduce((total, id) => total + map[id], 0);
const inOrder = map => { const out = {}; Object.keys(map).sort().forEach(id => { out[id] = map[id]; }); return out; };
const cellsOf = facts => facts.calendar.weeks.reduce((all, week) => all.concat(week.filter(Boolean)), [])
    .concat(facts.calendar.saturdays);
const byDateOf = (cells, field) => {
    const out = {};
    cells.filter(cell => cell[field] > 0).forEach(cell => { out[cell.date] = cell[field]; });
    return inOrder(out);
};
const numberOf = (facts, id) => (facts.numbers.find(line => line.id === id) || { value: null }).value;
// The counted lines of the client's text - «ראשון 01/11: 3 עובדים» - as [when, men], in the
// two lists it may hold: the billing, and the Rima table under it.
function readClientText(text) {
    const lines = plain(text).split('\n');
    const count = said => (said === 'עובד אחד' ? 1 : Number(/^(\d+) עובדים$/.exec(said)[1]));
    const counted = block => block.filter(line => /^\S+ \d\d\/\d\d: /.test(line))
        .map(line => { const at = line.indexOf(': '); return [line.slice(0, at), count(line.slice(at + 2))]; });
    const cut = lines.indexOf('רישום לרימא');
    const billing = cut === -1 ? lines : lines.slice(0, cut);
    const rima = cut === -1 ? [] : lines.slice(cut);
    const totalOf = (block, label) => {
        const line = block.find(item => item.startsWith(`${label}: `));
        return line ? Number(line.slice(label.length + 2)) : null;
    };
    return { lines, billing: counted(billing), total: totalOf(billing, 'סה״כ ימי עובד־אתר'),
        rima: counted(rima), rimaTotal: totalOf(rima, 'סה״כ עובדי רימא') };
}
const whenOf = date => `${['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'][weekdayOf(date)]} ${date.slice(8, 10)}/${date.slice(5, 7)}`;

// ---------------------------------------------------------------- 1. the counts
const SEEDS = [51, 52, 53, 54, 55, 56, 57, 58, 59, 60];
const seen = { cards: 0, empty: 0, rima: 0, rimaOnlyDay: 0, yosef: 0, yosefOnly: 0, twoSites: 0, hidden: 0,
    saturdays: 0, neverUsed: 0, inProgress: 0, clientFiles: 0, average: 0 };

[['the money gates shut', SHUT], ['the money gates open', OPEN]].forEach(([reading, flags]) => {
    suite(`every site's month is the reports screen's own - ${reading}`);
    const wrong = { sheet: [], client: [], page: [], recorded: [], calendar: [], men: [], numbers: [], text: [], range: [] };

    SEEDS.forEach(seed => {
        const device = seededPhone(seed, flags);
        const twoSiteDays = device.memory.days.filter(day => day.sites.length > 1);
        if (twoSiteDays.length > 0) seen.twoSites += 1;
        const rangeBefore = device.run('JSON.stringify([REPORT_RANGE, REPORT_WORKERS, INVOICE_PLACE, REPORT_SECTION])');

        device.State.schedule.places.forEach(place => MONTHS.forEach(key => {
            const tag = `${seed}/${place.id}/${key}`;
            const facts = device.facts(place.id, key);
            const reports = reportsFor(device, key, place.id);
            const recorded = recordedIn(device, key, place.id);
            const cells = cellsOf(facts);
            seen.cards += 1;
            if (facts.empty) seen.empty += 1;
            if (place.active === false) seen.hidden += 1;
            if (facts.inProgress) seen.inProgress += 1;
            if (facts.calendar.saturdays.length > 0) seen.saturdays += 1;
            if (place.name.startsWith('אתר ריק')) seen.neverUsed += 1;

            // --- against the sheets the reports screen exports, this site's column
            const invoice = columnOf(reports.invoice, place.name);
            const norima = columnOf(reports.norima, place.name);
            const rima = columnOf(reports.rima, place.name);
            const yosef = columnOf(reports.yosef, place.name);
            const billed = {};
            facts.billed.forEach(day => { billed[day.date] = day.count; });
            if (facts.siteDays !== (invoice ? invoice.total : 0)
                || JSON.stringify(inOrder(billed)) !== JSON.stringify(inOrder(invoice ? invoice.byDate : {}))
                || JSON.stringify(byDateOf(cells, 'billed')) !== JSON.stringify(inOrder(invoice ? invoice.byDate : {}))) {
                wrong.sheet.push(`${tag} invoice`);
            }
            if ((facts.rima === null) !== (rima === null) || (rima && facts.rima !== rima.total)
                || JSON.stringify(byDateOf(cells, 'rima')) !== JSON.stringify(inOrder(rima ? rima.byDate : {}))) {
                wrong.sheet.push(`${tag} rima`);
            }
            if ((facts.yosef === null) !== (yosef === null) || (yosef && facts.yosef !== yosef.total)
                || JSON.stringify(byDateOf(cells, 'yosef')) !== JSON.stringify(inOrder(yosef ? yosef.byDate : {}))) {
                wrong.sheet.push(`${tag} yosef`);
            }
            // «בלי עובדי רימא» is on the screen only when the site has a Rima count - and
            // then it is that sheet's column; his men per day are that column's days.
            if (facts.own !== null && (!norima || facts.own !== norima.total)) wrong.sheet.push(`${tag} own`);
            if (norima && JSON.stringify(byDateOf(cells, 'men')) !== JSON.stringify(inOrder(norima.byDate))) {
                wrong.sheet.push(`${tag} men per day`);
            }

            // --- against the one-client file and the client's page, the site chosen
            if (reports.chosen) {
                seen.clientFiles += 1;
                const file = reports.client;
                const fileRows = file.invoice.slice(1, -1);
                if (file.keys.indexOf('yosefGeves') !== -1 || file.keys.indexOf('payroll') !== -1) wrong.client.push(`${tag} keys`);
                if (file.invoice[file.invoice.length - 1][1] !== facts.siteDays
                    || JSON.stringify(fileRows.map(row => [row[0], row[1]]))
                        !== JSON.stringify(facts.billed.map(day => [day.date, day.count]))) wrong.client.push(`${tag} file`);
                if ((file.rima !== null) !== (facts.rima !== null)
                    || (file.rima && columnOf(file.rima, place.name).total !== facts.rima)) wrong.client.push(`${tag} rima file`);
                // The page: its heading, its grid and its Rima table are the text's lines.
                const text = readClientText(facts.text);
                const grid = reports.page.grid;
                if (text.lines[0] !== plain(reports.page.title)) wrong.page.push(`${tag} title`);
                if (JSON.stringify(text.billing) !== JSON.stringify(grid.slice(1, -1).map(row => [row[0], Number(row[1])]))
                    || text.total !== Number(grid[grid.length - 1][1])
                    || grid[grid.length - 1][0] !== 'סה״כ ימי עובד־אתר') wrong.page.push(`${tag} grid`);
                const table = reports.page.rima;
                if (JSON.stringify(text.rima) !== JSON.stringify(table.slice(1, -1).map(row => [row[0], Number(row[1])]))
                    || text.rimaTotal !== (table.length ? Number(table[table.length - 1][1]) : null)
                    || (table.length > 0 && (text.lines.indexOf(reports.page.rimaTitle[0]) === -1
                        || text.lines[text.lines.length - 1] !== reports.page.rimaNote[0]))) wrong.page.push(`${tag} rima table`);
            } else if (facts.billed.length !== 0) wrong.client.push(`${tag} not chosen`);

            // --- against what was recorded
            if (JSON.stringify(inOrder(billed)) !== JSON.stringify(inOrder(recorded.billed))
                || JSON.stringify(byDateOf(cells, 'men')) !== JSON.stringify(inOrder(recorded.men))
                || JSON.stringify(byDateOf(cells, 'rima')) !== JSON.stringify(inOrder(recorded.rima))
                || JSON.stringify(byDateOf(cells, 'yosef')) !== JSON.stringify(inOrder(recorded.yosef))
                || facts.siteDays !== sum(recorded.billed)) wrong.recorded.push(tag);
            const names = {};
            device.State.schedule.workers.forEach(worker => { names[worker.id] = worker.name; });
            const order = device.State.schedule.workers.map(worker => worker.id);
            const expectedMen = order.filter(id => recorded.perMan[id])
                .map(id => ({ id, name: names[id], days: recorded.perMan[id] })).sort((a, b) => b.days - a.days);
            if (JSON.stringify(facts.men) !== JSON.stringify(expectedMen)
                || facts.men.reduce((total, man) => total + man.days, 0) !== sum(recorded.men)
                || facts.siteDays !== sum(recorded.men) + sum(recorded.rima)) wrong.men.push(tag);

            // --- the calendar: every day of the month once, six columns, no Saturday in
            // the grid, and a Saturday under it exactly when it holds something
            const all = datesBetween(`${key}-01`, lastOf(key));
            const grid = facts.calendar.weeks.reduce((list, week) => list.concat(week.filter(Boolean)), []);
            const saturdaysDue = all.filter(date => weekdayOf(date) === 6
                && (recorded.men[date] || recorded.rima[date] || recorded.yosef[date]));
            if (JSON.stringify(grid.map(cell => cell.date)) !== JSON.stringify(all.filter(date => weekdayOf(date) !== 6))
                || facts.calendar.weeks.some(week => week.length !== 6)
                || JSON.stringify(facts.calendar.columns) !== JSON.stringify(['ו׳', 'א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳'])
                || facts.calendar.weeks.some(week => week.some((cell, at) => cell && [5, 0, 1, 2, 3, 4][at] !== cell.weekday))
                || JSON.stringify(facts.calendar.saturdays.map(cell => cell.date)) !== JSON.stringify(saturdaysDue)
                || cells.filter(cell => cell.today).map(cell => cell.date).join() !== (key === '2026-11' ? TODAY : '')) {
                wrong.calendar.push(tag);
            }

            // --- the numbers block: the labels the reports print, the working days and
            // the average counted from what was recorded
            const workingDays = Object.keys(recorded.men).length;
            const average = workingDays > 0 ? Math.round((sum(recorded.men) / workingDays) * 10) / 10 : null;
            if (average !== null && !Number.isInteger(average)) seen.average += 1;
            const expectedNumbers = [['siteDays', 'סה״כ ימי עובד־אתר', String(sum(recorded.billed))]]
                .concat(sum(recorded.rima) > 0 ? [['own', 'בלי עובדי רימא', String(sum(recorded.men))],
                    ['rima', 'סה״כ עובדי רימא', String(sum(recorded.rima))]] : [])
                .concat([['workingDays', 'ימי עבודה', String(workingDays)],
                    ['average', 'ממוצע עובדים ליום עבודה', average === null ? '—' : String(average)]])
                .concat(sum(recorded.yosef) > 0 ? [['yosef', 'סה״כ עובדי יוסף גבס', String(sum(recorded.yosef))]] : []);
            if (JSON.stringify(facts.numbers.map(line => [line.id, line.label, line.value])) !== JSON.stringify(expectedNumbers)) {
                wrong.numbers.push(tag);
            }

            // --- the client's text: it totals to the invoice, and the other list is not in it
            const text = readClientText(facts.text);
            if (sum(recorded.rima) > 0) seen.rima += 1;
            if (Object.keys(recorded.rima).some(date => !recorded.men[date])) seen.rimaOnlyDay += 1;
            if (sum(recorded.yosef) > 0) seen.yosef += 1;
            if (sum(recorded.yosef) > 0 && sum(recorded.billed) === 0) seen.yosefOnly += 1;
            if (/יוסף|גבס|₪|ש״ח|שקל/.test(facts.text)
                || text.billing.reduce((total, line) => total + line[1], 0) !== facts.siteDays
                || (facts.billed.length > 0 && text.total !== facts.siteDays)
                || JSON.stringify(text.billing) !== JSON.stringify(facts.billed.map(day => [whenOf(day.date), day.count]))
                || JSON.stringify(text.rima) !== JSON.stringify(Object.keys(inOrder(recorded.rima)).map(date => [whenOf(date), recorded.rima[date]]))
                || text.lines[1] !== `${MONTH_NAMES[key]} · 01/${key.slice(5)}/2026 - ${lastOf(key).slice(8)}/${key.slice(5)}/2026`
                || (facts.billed.length === 0 && text.lines.slice(2).join('|') !== '|אין רישומים בחודש הזה.')) {
                wrong.text.push(tag);
            }
        }));
        if (device.run('JSON.stringify([REPORT_RANGE, REPORT_WORKERS, INVOICE_PLACE, REPORT_SECTION])') !== rangeBefore) wrong.range.push(String(seed));
    });

    same('the invoice, Rima, יוסף גבס and «בלי עובדי רימא»: each the site\'s column of its own sheet, day by day', wrong.sheet, []);
    same('the one-client file: its total, its dates, its Rima sheet - and no יוסף גבס sheet in it', wrong.client, []);
    same('the client\'s page: its heading, its grid and its Rima table are the text, line for line', wrong.page, []);
    same('every day\'s men and both counts are what was recorded', wrong.recorded, []);
    same('who worked there: each man\'s days, by days, adding up to his men\'s share of the bill', wrong.men, []);
    same('the calendar: every day once, six columns from Friday, a Saturday under it only when it holds something', wrong.calendar, []);
    same('the numbers, under the labels the reports print them by', wrong.numbers, []);
    same('the client\'s text totals to the invoice, names no יוסף גבס and no price', wrong.text, []);
    same('and the reports screen\'s own range and choice of site are never touched', wrong.range, []);
});

suite('the corpus really held what it claims to');
check('cards were read', seen.cards >= 400, String(seen.cards));
check('months with nothing on the site', seen.empty >= 40, String(seen.empty));
check('months with a Rima count on the site', seen.rima >= 20, String(seen.rima));
check('days the invoice bills for Rima alone', seen.rimaOnlyDay >= 2, String(seen.rimaOnlyDay));
check('months with a יוסף גבס count on the site', seen.yosef >= 20, String(seen.yosef));
check('records with a man on two sites in a day', seen.twoSites >= 10, String(seen.twoSites));
check('a hidden site\'s months', seen.hidden >= 50, String(seen.hidden));
check('a site nobody stood on', seen.neverUsed >= 50, String(seen.neverUsed));
check('Saturdays that hold a record', seen.saturdays >= 10, String(seen.saturdays));
check('a month in progress', seen.inProgress >= 20, String(seen.inProgress));
check('one-client files were read', seen.clientFiles >= 100, String(seen.clientFiles));
check('averages that are not whole', seen.average >= 20, String(seen.average));

// ---------------------------------------------------------------- 2. a month on paper
function handPhone(flags) {
    const first = makeDevice({ deviceId: 'd_hand', flags });
    first.setToday(TODAY);
    const schedule = first.State.schedule;
    schedule.workers = [
        { id: 'w_1', name: 'אלף', active: true, dailyRate: 400 },
        { id: 'w_2', name: 'בית', active: true, dailyRate: 300 },
        { id: 'w_3', name: 'גימל', active: false }];
    schedule.places = [{ id: 'p_1', name: 'צפון', active: true }, { id: 'p_2', name: 'דרום', active: false },
        { id: 'p_3', name: 'ריק', active: true }];
    const put = (date, worker, place, rate) => first.call('assignPlace', schedule, date, worker, 'actual', place, rate);
    put('2026-10-30', 'w_1', 'p_1');                                      // a Friday in October
    put('2026-11-01', 'w_1', 'p_1'); put('2026-11-01', 'w_2', 'p_1'); put('2026-11-01', 'w_3', 'p_2');
    put('2026-11-02', 'w_1', 'p_1'); put('2026-11-02', 'w_1', 'p_2');     // one man, two sites
    put('2026-11-02', 'w_2', 'p_1', 'double');                            // a double day is one man
    put('2026-11-03', 'w_1', 'p_2');
    put('2026-11-07', 'w_2', 'p_1');                                      // a Saturday
    put('2026-11-09', 'w_1', 'p_1');
    first.call('markAbsent', schedule, '2026-11-09', 'w_2', 'actual');
    first.call('setRimaCount', schedule, '2026-11-02', 'p_1', 2);
    first.call('setRimaCount', schedule, '2026-11-05', 'p_1', 1);         // Rima alone on the site
    first.call('setRimaCount', schedule, '2026-11-03', 'p_2', 4);
    first.call('setYosefGevesCount', schedule, '2026-11-03', 'p_1', 4);   // יוסף גבס alone on the site
    first.call('setYosefGevesCount', schedule, '2026-11-02', 'p_1', 1);
    first.State.save({ silent: true });
    const device = withCard(makeDevice({ deviceId: 'd_hand', storage: first.dump(), flags }));
    device.State.load();
    return device;
}

{
    suite('a month on paper: one site, every figure written out');
    const device = handPhone(OPEN);
    const facts = device.facts('p_1', '2026-11');

    same('who it is', [facts.id, facts.name, facts.active, facts.status, facts.month, facts.current, plain(facts.range.text)],
        ['p_1', 'צפון', true, 'פעיל', 'נובמבר 2026', true, '01/11/2026 - 30/11/2026']);
    same('the month is not over, and the card says so', [facts.inProgress, facts.empty], [true, false]);
    same('the numbers: 6 of his men\'s days and 3 of Rima\'s are 9 billed; 4 working days; יוסף גבס apart',
        facts.numbers.map(line => [line.id, line.label, line.value, line.note || '', line.apart === true]), [
            ['siteDays', 'סה״כ ימי עובד־אתר', '9', '', false],
            ['own', 'בלי עובדי רימא', '6', '', false],
            ['rima', 'סה״כ עובדי רימא', '3', 'עובדי רימא בלבד. אינם נכללים בשכר. בחיוב שלמעלה כל אחד מהם נספר כיום עובד־אתר אחד.', false],
            ['workingDays', 'ימי עבודה', '4', '', false],
            ['average', 'ממוצע עובדים ליום עבודה', '1.5', '', false],
            ['yosef', 'סה״כ עובדי יוסף גבס', '5', 'עובדי יוסף גבס בלבד. אינם נכללים בשכר ואינם נכללים בחיוב.', true]]);
    same('who worked there: by days, the roster\'s order among equals; the absent day is nobody\'s',
        facts.men, [{ id: 'w_1', name: 'אלף', days: 3 }, { id: 'w_2', name: 'בית', days: 3 }]);
    same('the first row of the calendar starts under א׳: the 1st is a Sunday',
        facts.calendar.weeks[0].map(cell => (cell ? [cell.number, cell.men, cell.rima, cell.yosef, cell.billed] : null)),
        [null, [1, 2, 0, 0, 2], [2, 2, 2, 1, 4], [3, 0, 0, 4, 0], [4, 0, 0, 0, 0], [5, 0, 1, 0, 1]]);
    same('the second starts on Friday the 6th; the Saturday between them is under the grid',
        [facts.calendar.weeks[1].map(cell => cell.number), facts.calendar.saturdays.map(cell => [cell.date, cell.men])],
        [[6, 8, 9, 10, 11, 12], [['2026-11-07', 1]]]);
    same('a day read aloud: the date, his men, then each count by its name',
        cellsOf(facts).filter(cell => ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-07'].indexOf(cell.date) !== -1)
            .map(cell => plain(cell.said)), [
            'יום שני 02/11/2026 · 2 עובדים · רימא 2 · יוסף גבס 1',
            'יום שלישי 03/11/2026 · יוסף גבס 4',
            'יום רביעי 04/11/2026 · ללא רישום',
            'יום חמישי 05/11/2026 · רימא 1',
            'יום שבת 07/11/2026 · עובד אחד']);
    same('today is marked, and only today', cellsOf(facts).filter(cell => cell.today).map(cell => cell.date), [TODAY]);

    same('THE CLIENT\'S TEXT, every line', plain(facts.text).split('\n'), [
        'חיוב - צפון',
        'נובמבר 2026 · 01/11/2026 - 30/11/2026',
        '',
        'ראשון 01/11: 2 עובדים',
        'שני 02/11: 4 עובדים',
        'חמישי 05/11: עובד אחד',
        'שבת 07/11: עובד אחד',
        'שני 09/11: עובד אחד',
        'סה״כ ימי עובד־אתר: 9',
        '',
        'רישום לרימא',
        'שני 02/11: 2 עובדים',
        'חמישי 05/11: עובד אחד',
        'סה״כ עובדי רימא: 3',
        'עובדי רימא בלבד. אינם נכללים בשכר. בחיוב שלמעלה כל אחד מהם נספר כיום עובד־אתר אחד.']);
    check('the site\'s name travels as a name: isolated, whatever it holds', facts.text.split('\n')[0] === 'חיוב - ⁨צפון⁩');

    suite('a month on paper: the other site, the other months, the site nobody stood on');
    const south = device.facts('p_2', '2026-11');
    same('the hidden site is read like any other, and called what the crew list calls it',
        [south.active, south.status, south.siteDays, south.own, south.rima, south.yosef, south.workingDays, south.average, south.men],
        [false, 'לא פעיל', 7, 3, 4, null, 3, 1, [{ id: 'w_1', name: 'אלף', days: 2 }, { id: 'w_3', name: 'גימל', days: 1 }]]);
    same('the man who stood on both sites on the 2nd is one on each', [facts.calendar.weeks[0][2].men,
        south.calendar.weeks[0][2].men], [2, 1]);
    same('its text has its own Rima table and nothing of the first site\'s', plain(south.text).split('\n'), [
        'חיוב - דרום', 'נובמבר 2026 · 01/11/2026 - 30/11/2026', '',
        'ראשון 01/11: עובד אחד', 'שני 02/11: עובד אחד', 'שלישי 03/11: 5 עובדים', 'סה״כ ימי עובד־אתר: 7', '',
        'רישום לרימא', 'שלישי 03/11: 4 עובדים', 'סה״כ עובדי רימא: 4',
        'עובדי רימא בלבד. אינם נכללים בשכר. בחיוב שלמעלה כל אחד מהם נספר כיום עובד־אתר אחד.']);

    const october = device.facts('p_1', '2026-10');
    same('October is its one Friday: no Rima, so neither Rima line; a month that is over',
        [october.numbers.map(line => [line.id, line.value]), october.inProgress, october.current,
            october.calendar.weeks[october.calendar.weeks.length - 1].map(cell => (cell ? cell.number : null))],
        [[['siteDays', '1'], ['workingDays', '1'], ['average', '1']], false, false, [30, null, null, null, null, null]]);
    same('and its text is three lines of billing and no table', plain(october.text).split('\n'),
        ['חיוב - צפון', 'אוקטובר 2026 · 01/10/2026 - 31/10/2026', '', 'שישי 30/10: עובד אחד', 'סה״כ ימי עובד־אתר: 1']);

    const empty = device.facts('p_3', '2026-11');
    same('a site nobody stood on: empty, said plainly, and not "in progress"',
        [empty.empty, empty.inProgress, empty.siteDays, empty.men, empty.calendar.saturdays, empty.workingDays, empty.average],
        [true, false, 0, [], [], 0, null]);
    same('its text says the month has no record, and has no total to bill',
        plain(empty.text).split('\n'), ['חיוב - ריק', 'נובמבר 2026 · 01/11/2026 - 30/11/2026', '', 'אין רישומים בחודש הזה.']);
    same('a month before the record is the same sentence', plain(device.facts('p_1', '2026-08').text).split('\n').slice(2),
        ['', 'אין רישומים בחודש הזה.']);
    same('a site that is not in the record has no card at all', device.run('siteCardFacts("p_99", "2026-11")'), null);
    same('and a month that is not a month is the month today is in', device.facts('p_1', 'x').key, '2026-11');

    // ------------------------------------------------------------ 3. the client's text
    suite('the client\'s text: יוסף גבס moves the card and not one byte of the text');
    const before = device.facts('p_1', '2026-11');
    device.State.commit(device.call('setYosefGevesCount', device.State.schedule, '2026-11-09', 'p_1', 7));
    const after = device.facts('p_1', '2026-11');
    same('the card counts the new seven', [before.yosef, after.yosef, numberOf(after, 'yosef')], [5, 12, '12']);
    same('the text is byte for byte what it was', after.text, before.text);
    same('and so is every other number on the card', after.numbers.filter(line => line.id !== 'yosef'),
        before.numbers.filter(line => line.id !== 'yosef'));
    // A month with ONLY that list on the site: the card is not empty, the client's text is.
    device.State.commit(device.call('setYosefGevesCount', device.State.schedule, '2026-12-01', 'p_3', 2));
    const only = device.facts('p_3', '2026-12');
    same('a month holding only that list: on the card, with its note; nothing for the client',
        [only.empty, only.numbers.map(line => [line.id, line.value]), plain(only.text).split('\n').slice(2)],
        [false, [['siteDays', '0'], ['workingDays', '0'], ['average', '—'], ['yosef', '2']], ['', 'אין רישומים בחודש הזה.']]);
    const textSource = CARD.slice(CARD.indexOf('function siteCardClientText'), CARD.indexOf('// ---------------------------------------------------------------- the drawing'));
    check('the function that writes the text reads nothing of the list', textSource.length > 400
        && !/yosef|YOSEF/.test(textSource.replace(/\/\/[^\n]*/g, '')));
    device.State.commit(device.call('setRimaCount', device.State.schedule, '2026-11-09', 'p_1', 3));
    const billed = device.facts('p_1', '2026-11');
    same('a Rima count does move it: the day\'s line, the total, and the table under it',
        [readClientText(billed.text).total, readClientText(billed.text).rimaTotal,
            plain(billed.text).split('\n').filter(line => line.startsWith('שני 09/11'))],
        [12, 6, ['שני 09/11: 4 עובדים', 'שני 09/11: 3 עובדים']]);
}

// ---------------------------------------------------------------- 4. the screen
{
    suite('the screen: what is drawn is what the facts say');
    const device = handPhone(OPEN);
    const dom = device.dom;
    const at = id => dom.getElementById(id);
    device.run('openSiteCard("p_1")');
    const facts = device.facts('p_1', '2026-11');
    same('it opens on the month today is in', [at('siteCardModal').style.display, device.run('SITE_CARD_ID'),
        device.run('SITE_CARD_MONTH'), at('siteCardMonth').textContent, at('siteCardTitle').textContent],
        ['flex', 'p_1', '2026-11', 'נובמבר 2026', 'כרטיס אתר']);
    same('the frame is worded from the file\'s blocks', ['siteCardPrev', 'siteCardNext', 'siteCardHome', 'siteCardClientOpen',
        'siteCardSend', 'siteCardCopy', 'siteCardClose'].map(id => at(id).textContent),
        ['חודש קודם', 'חודש הבא', 'חזרה לחודש הנוכחי', 'סיכום החודש ללקוח', '💬 שלח בוואטסאפ', 'העתק', 'סגור']);
    same('the site in its own colour, and whether it is in use',
        [at('siteCardWho').querySelectorAll('.site-name')[0].textContent, at('siteCardWho').children[0].style.background, at('siteCardWho').children[0].className,
            at('siteCardWho').children[1].textContent], ['צפון', 'var(--site-1)', 'scard-name', 'פעיל']);
    same('on the current month the way home is not drawn; the text is folded away',
        [at('siteCardHome').hidden, at('siteCardClient').hidden, at('siteCardClientOpen').attributes['aria-expanded']],
        [true, true, 'false']);
    const body = at('siteCardBody');
    const days = body.querySelectorAll('.scard-cal-day');
    same('a button for each day of the grid, named by what the day holds', days.map(day => day.attributes['aria-label']),
        facts.calendar.weeks.reduce((all, week) => all.concat(week.filter(Boolean)), []).map(cell => cell.said));
    same('a day\'s cell: its number, his men in the site\'s colour, then the two marks',
        days.filter(day => day.dataset.date === '2026-11-02').map(day => [day.children[0].textContent,
            day.children[1].children.map(mark => mark.textContent), day.children[1].children[0].style.background,
            day.children[1].attributes['aria-hidden']]), [['2', ['2', 'ר2', 'י1'], 'var(--site-1)', 'true']]);
    same('a day with nothing has its number and no mark; today is marked',
        [days.filter(day => day.dataset.date === '2026-11-04')[0].children[1].children.length,
            days.filter(day => day.attributes['aria-current'] === 'date').map(day => day.dataset.date)], [0, [TODAY]]);
    same('six letters over the grid; one gap before Sunday the 1st, three after Monday the 30th', [body.querySelectorAll('.scard-cal-head').map(node => node.textContent),
        body.querySelectorAll('.scard-cal-gap').length], [['ו׳', 'א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳'], 1 + 3]);
    same('the Saturday with a record is under the grid, and is a way into its day too',
        body.querySelectorAll('.scard-cal-saturday').map(day => [day.dataset.date, day.children[0].textContent,
            day.children[1].children.map(mark => mark.textContent)]), [['2026-11-07', '07/11', ['1']]]);
    same('under it: what the two letters are, and what a tap does', body.querySelectorAll('.scard-cal')[0]
        .querySelectorAll('.scard-note').map(node => node.textContent),
        ['ר = רימא · י = יוסף גבס', 'לחיצה על יום פותחת אותו במסך היום.']);
    same('the numbers block is the facts\' lines', body.querySelectorAll('.scard-pair').map(pair =>
        [pair.attributes['data-figure'], pair.children[0].textContent, pair.children[1].textContent]),
        facts.numbers.map(line => [line.id, line.label, line.value]));
    same('the two notes are under their own counts, and יוסף גבס is set apart',
        body.querySelectorAll('.scard-pair-note').map(note => [note.parentNode.attributes['data-figure'], note.textContent]),
        [['rima', 'עובדי רימא בלבד. אינם נכללים בשכר. בחיוב שלמעלה כל אחד מהם נספר כיום עובד־אתר אחד.'],
            ['yosef', 'עובדי יוסף גבס בלבד. אינם נכללים בשכר ואינם נכללים בחיוב.']]);
    same('and only that one', body.querySelectorAll('.scard-apart').map(pair => pair.attributes['data-figure']), ['yosef']);
    same('each man a button into his own card', body.querySelectorAll('.scard-man').map(man =>
        [man.dataset.workerId, man.children[0].textContent, man.children[1].textContent, plain(man.attributes['aria-label'])]),
        [['w_1', 'אלף', '3', 'כרטיס עובד של אלף · 3'], ['w_2', 'בית', '3', 'כרטיס עובד של בית · 3']]);
    same('the month is not over, said once at the top', body.querySelectorAll('.scard-progress').map(node => node.textContent),
        ['החודש עוד לא נגמר. המספרים הם של מה שנרשם עד עכשיו.']);
    same('the field holds the client\'s text', at('siteCardText').value, facts.text);

    suite('the screen: the months, the doors, the two ways out');
    device.run('siteCardStep(-1)');
    same('one step back is October, and the way home is drawn', [device.run('SITE_CARD_MONTH'), at('siteCardMonth').textContent,
        at('siteCardHome').hidden, at('siteCardText').value, body.querySelectorAll('.scard-progress').length],
        ['2026-10', 'אוקטובר 2026', false, device.facts('p_1', '2026-10').text, 0]);
    device.run('siteCardStep(-1); siteCardStep(-1)');
    same('August has no record and says only that - and still has its calendar',
        [device.run('SITE_CARD_MONTH'), body.querySelectorAll('.scard-numbers')[0].querySelectorAll('.empty-hint').map(node => node.textContent),
            body.querySelectorAll('.scard-pair').length, body.querySelectorAll('.scard-men')[0].querySelectorAll('.empty-hint').map(node => node.textContent),
            body.querySelectorAll('.scard-cal-day').length],
        ['2026-08', ['אין רישומים בחודש הזה.'], 0, ['אין ימי עבודה בתקופה הזו.'], 26]);
    device.run('siteCardStep(0)');
    same('home is November again', [device.run('SITE_CARD_MONTH'), at('siteCardHome').hidden], ['2026-11', true]);
    device.run('siteCardStep(1); siteCardStep(1)');
    same('and two forward is January', [device.run('SITE_CARD_MONTH'), at('siteCardMonth').textContent], ['2027-01', 'ינואר 2027']);
    device.run('siteCardStep(0)');

    device.run('siteCardSend(); siteCardCopy()');
    same('neither door answers while the text is folded away', device.shared, []);
    device.run('siteCardToggleClient()');
    same('the one button shows the field and its two doors', [at('siteCardClient').hidden, at('siteCardClientOpen').attributes['aria-expanded']],
        [false, 'true']);
    device.run('renderSiteCardIfOpen(); siteCardSend(); siteCardCopy()');
    same('then both are handed the field\'s words - the client\'s text and nothing else',
        device.shared, [['share', facts.text], ['copy', facts.text]]);
    device.run('siteCardToggleClient()');
    same('and the same button folds it away again', at('siteCardClient').hidden, true);

    device.run('siteCardStep(-1); siteCardGoDay("2026-10-30")');
    same('a day closes the card and opens that date on the day screen', [at('siteCardModal').style.display, device.run('SITE_CARD_ID'),
        device.State.date, device.views], ['none', null, '2026-10-30', ['day']]);
    device.run('siteCardGoDay("2026-10-29"); siteCardGoMan("w_1"); siteCardStep(1); siteCardToggleClient(); siteCardSend(); renderSiteCardIfOpen()');
    same('and nothing of it answers while it is shut', [device.State.date, device.views.length, device.shared.length,
        at('workerCardModal').style.display === 'flex', at('siteCardClient').hidden], ['2026-10-30', 1, 2, false, true]);

    device.run('openSiteCard("p_1"); siteCardStep(-1); siteCardGoMan("w_2")');
    same('a man closes this card and opens his own - on the month this one was on',
        [at('siteCardModal').style.display, at('workerCardModal').style.display, device.run('WORKER_CARD_ID'),
            device.run('WORKER_CARD_MONTH'), plain(at('workerCardTitle').textContent)],
        ['none', 'flex', 'w_2', '2026-10', 'כרטיס עובד · בית']);
    device.run('closeWorkerCard(); openSiteCard("p_1"); siteCardGoMan("w_1")');
    same('from the current month his card is on its own current month', [device.run('WORKER_CARD_ID'), device.run('WORKER_CARD_MONTH')], ['w_1', null]);
    device.run('closeWorkerCard(); openSiteCard("p_1"); siteCardGoDay("not a date")');
    same('a date that is not one goes nowhere', [at('siteCardModal').style.display, device.views.length], ['flex', 1]);
    device.run('openSiteCard("p_2"); siteCardToggleClient(); openSiteCard("p_1")');
    same('opening a card folds the text away again and starts on this month', [at('siteCardClient').hidden, device.run('SITE_CARD_MONTH')], [true, '2026-11']);
    device.State.schedule.places = device.State.schedule.places.filter(place => place.id !== 'p_1');
    device.run('renderSiteCardIfOpen()');
    same('a site that left the record under an open card: the card closes', [at('siteCardModal').style.display, device.run('SITE_CARD_ID')], ['none', null]);
    device.run('openSiteCard("p_1")');
    same('and cannot be opened', at('siteCardModal').style.display, 'none');
}

// ---------------------------------------------------------------- 5. it writes nothing
{
    suite('a reading: not one key on the disk moves');
    const device = handPhone(OPEN);
    const disk = () => JSON.stringify(device.dump());
    const before = disk();
    const record = JSON.stringify(device.State.schedule);
    const date = device.State.date;

    ['p_1', 'p_2', 'p_3'].forEach(id => {
        device.run(`openSiteCard(${JSON.stringify(id)}); siteCardStep(-1); siteCardStep(-1); siteCardStep(0); siteCardStep(1);
            renderSiteCardIfOpen(); siteCardToggleClient(); siteCardSend(); siteCardCopy(); siteCardToggleClient(); closeSiteCard()`);
        MONTHS.forEach(key => device.facts(id, key));
    });
    device.run('openSiteCard("p_1"); siteCardGoMan("w_1"); closeWorkerCard(); openSiteCard("p_2"); siteCardGoDay("2026-11-03")');
    same('every door was really used', [device.shared.length, device.views, device.State.date], [6, ['day'], '2026-11-03']);
    device.State.date = date;
    same('every key on the disk is byte for byte what it was', disk(), before);
    same('and the record in memory', JSON.stringify(device.State.schedule), record);
    device.State.commit(device.call('assignPlace', device.State.schedule, '2026-11-10', 'w_2', 'actual', 'p_1'));
    check('the comparison notices a real write', disk() !== before);
    same('and the card then says what the record says now', numberOf(device.facts('p_1', '2026-11'), 'siteDays'), '10');

    const src = CARD.replace(/\/\/[^\n]*/g, '');
    check('the file names no writer: no Store, no commit, no save, no localStorage',
        !/\bStore\b|\.commit|commitMany|\.save\(|localStorage|setVerified/.test(src));
    check('it reads no money: no pay, no rate, no advance, no ledger, no gate',
        !/payroll|dailyRate|hourlyRate|ratesForDay|moneyOf|moneyText|advance|ledger|carryReportingEnabled|workerAccountFor|₪/i.test(src));
    check('it never moves the reports screen\'s range or its choice of site', !/REPORT_RANGE|REPORT_WORKERS|INVOICE_PLACE|REPORT_SECTION/.test(src));
    check('nor does it read a day\'s layers itself - only the four reports', !/schedule\.days|rimaCount|yosefGevesCount|_LAYER|workersAtPlace|entriesFor/.test(src)
        && ['invoiceByDate(', 'invoiceWithoutRima(', 'rimaReport(', 'yosefGevesReport('].every(name => src.split(name).length === 2));
    check('it never prints by itself and never asks the browser a question', !/window\.print|\balert\(|\bconfirm\(|\bprompt\(/.test(src));
    check('a name is text: no markup is ever written', !/innerHTML|insertAdjacentHTML|outerHTML/.test(src));

    // The same counts whichever way the money gates stand: nothing gated is read.
    const shut = handPhone(SHUT);
    same('with the money gates shut the card is the same card', ['p_1', 'p_2', 'p_3'].map(id => shut.facts(id, '2026-11')),
        ['p_1', 'p_2', 'p_3'].map(id => handPhone(OPEN).facts(id, '2026-11')));
}

// ---------------------------------------------------------------- 6. the words, the shell
{
    suite('the words: each new one pinned, each borrowed one found where its owner keeps it');
    const device = handPhone(SHUT);
    const T = JSON.parse(device.run('JSON.stringify(Object.assign({}, SITE_CARD_TEXT, { legend: SITE_CARD_TEXT.legend("א", "ב") }))'));
    same('every new string, word for word', T, {
        title: 'כרטיס אתר',
        openFor: 'כרטיס אתר של',
        numbers: 'החודש במספרים',
        men: 'מי עבד באתר',
        rimaMark: 'ר',
        yosefMark: 'י',
        legend: 'ר = א · י = ב',
        inProgress: 'החודש עוד לא נגמר. המספרים הם של מה שנרשם עד עכשיו.',
        client: 'סיכום החודש ללקוח'
    });
    check('the legend is written with the two marks the cells are drawn with',
        T.legend.startsWith(`${T.rimaMark} = `) && T.legend.indexOf(` · ${T.yosefMark} = `) !== -1);

    const R = JSON.parse(device.run('JSON.stringify(SITE_CARD_REUSED)'));
    same('the borrowed words', R, { active: 'פעיל', inactive: 'לא פעיל', rima: 'רימא', yosef: 'יוסף גבס', oneMan: 'עובד אחד',
        manyMen: 'עובדים', noDays: 'אין ימי עבודה בתקופה הזו.', billing: 'חיוב -', send: '💬 שלח בוואטסאפ', copy: 'העתק', close: 'סגור' });
    const owners = { active: 'js/ui/roster.js', inactive: 'js/ui/roster.js', rima: 'js/ui/day.js', yosef: 'js/ui/day.js',
        send: 'index.html', copy: 'index.html', close: 'index.html' };
    const quoted = { active: "'פעיל'", inactive: "'לא פעיל'", rima: "label: 'רימא'", yosef: "YOSEF_GEVES_LABEL = 'יוסף גבס'",
        billing: '`חיוב - ${chosen.name}`' };
    same('every borrowed word is in its owner\'s source',
        Object.keys(R).filter(name => source(owners[name] || 'js/ui/reports.js').indexOf(quoted[name] || R[name]) === -1), []);
    same('the ones read straight from the reports are the reports\'', JSON.parse(device.run(
        'JSON.stringify([RIMA_TITLE, RIMA_TOTAL, RIMA_NOTE, NO_RIMA_TITLE, NO_RIMA_TOTAL, YOSEF_GEVES_TOTAL, YOSEF_GEVES_NOTE])')),
        ['רישום לרימא', 'סה״כ עובדי רימא', 'עובדי רימא בלבד. אינם נכללים בשכר. בחיוב שלמעלה כל אחד מהם נספר כיום עובד־אתר אחד.',
            'בלי עובדי רימא', 'סה״כ ימי עובד־אתר', 'סה״כ עובדי יוסף גבס', 'עובדי יוסף גבס בלבד. אינם נכללים בשכר ואינם נכללים בחיוב.']);
    same('the calendar\'s words are the worker card\'s, and three are the month summary\'s', JSON.parse(device.run(
        `JSON.stringify([WORKER_CARD_TEXT.calendar, WORKER_CARD_TEXT.prevMonth, WORKER_CARD_TEXT.nextMonth, WORKER_CARD_TEXT.thisMonth,
            WORKER_CARD_TEXT.saturdays, WORKER_CARD_TEXT.openDay, WORKER_CARD_TEXT.openFor, WORKER_CARD_REUSED.blank,
            MONTH_SUMMARY_TEXT.workingDays, MONTH_SUMMARY_TEXT.average, MONTH_SUMMARY_TEXT.empty])`)),
        ['לוח החודש', 'חודש קודם', 'חודש הבא', 'חזרה לחודש הנוכחי', 'ימי שבת עם רישום', 'לחיצה על יום פותחת אותו במסך היום.',
            'כרטיס עובד של', 'ללא רישום', 'ימי עבודה', 'ממוצע עובדים ליום עבודה', 'אין רישומים בחודש הזה.']);
    check('no word of it says «נשלח»', CARD.indexOf('נשלח') === -1);
    const hebrewOutsideBlocks = CARD.slice(CARD.indexOf('let SITE_CARD_ID')).replace(/\/\/[^\n]*/g, '')
        .match(/'[^'\n]*[א-ת][^'\n]*'|`[^`\n]*[א-ת][^`\n]*`/g);
    same('no Hebrew string is written anywhere but in the two blocks', hebrewOutsideBlocks, null);
    check('the calendar\'s arithmetic is the worker card\'s own, asked and not copied',
        ['workerCardMonthSpan(', 'workerCardMonthStep(', 'workerCardWeekdays('].every(name => CARD.indexOf(name) !== -1)
        && !/snapToWeekStart|new Date\(/.test(CARD.replace(/\/\/[^\n]*/g, '')));

    suite('the shell: one entry, served, cached, closable, redrawn');
    const roster = source('js/ui/roster.js');
    same('the crew screen asks for the entry in one guarded place, per site row',
        [(roster.match(/openSiteCard/g) || []).length, (roster.match(/SITE_CARD_TEXT/g) || []).length,
            roster.indexOf("if (typeof openSiteCard === 'function') {") > roster.indexOf('function renderPlaceList')
            && roster.indexOf("if (typeof openSiteCard === 'function') {") < roster.indexOf('async function openPlaceOptions')],
        [2, 2, true]);
    same('and nothing else in the app opens it', ['js/ui/day.js', 'js/ui/find.js', 'js/ui/reports.js', 'js/ui/week.js', 'js/ui/sheet.js',
        'js/ui/workercard.js', 'js/ui/monthsummary.js', 'js/ui/settings.js', 'js/ui/journey.js', 'js/app.js']
        .filter(file => source(file).indexOf('openSiteCard') !== -1), []);
    const index = source('index.html');
    const at = file => index.indexOf(`<script src="${file}"></script>`);
    check('the script is a classic one, after everything it asks', at('js/ui/sitecard.js') !== -1
        && ['js/ui/sitecolor.js', 'js/ui/roster.js', 'js/ui/reports.js', 'js/ui/workercard.js', 'js/ui/share.js',
            'js/ui/monthsummary.js'].every(file => at(file) !== -1 && at(file) < at('js/ui/sitecard.js'))
        && at('js/ui/sitecard.js') < at('js/app.js'));
    check('it is in the service worker\'s shell', source('sw.js').indexOf("'./js/ui/sitecard.js'") !== -1);
    check('Escape closes it through its own function', source('js/ui/modal.js').indexOf('siteCardModal: () => closeSiteCard()') !== -1);
    check('render() redraws it when it is open', source('js/app.js').indexOf("if (typeof renderSiteCardIfOpen === 'function') renderSiteCardIfOpen();") !== -1);
    check('every id the file writes into is in the frame', IDS.filter(id => id.startsWith('siteCard'))
        .every(id => index.indexOf(`id="${id}"`) !== -1));
    check('the field is read-only, and the doors are inside the fold that starts shut',
        /<textarea id="siteCardText"[^>]*readonly/.test(index)
        && /<div id="siteCardClient" class="scard-client-fold" hidden>\s*<textarea id="siteCardText"[^>]*>\s*<\/textarea>\s*<button[^>]*id="siteCardSend"[^>]*><\/button>\s*<button[^>]*id="siteCardCopy"[^>]*><\/button>/.test(index));
    check('the heading is where the dialog is entered', /<h3 id="siteCardTitle" tabindex="-1"><\/h3>/.test(index));

    // Without the file the sites list is the list it always was: the guard is typeof.
    const css = source('css/design.css');
    // MOVED ON PURPOSE (the reports say the account, js/ui/reports.js): a look added after
    // this one is one more block at the end of the layer, and that one carries a phone-width
    // query of its own. "No media query" is a statement about THIS block, so it is read up
    // to where the next block begins instead of to the end of the file.
    const mine = css.slice(css.indexOf('כרטיס אתר (js/ui/sitecard.js)'));
    const next = mine.indexOf('/* ---- the reports say the account');
    check('its look is one block at the end of the design layer, inside the screen-only rule',
        css.indexOf('כרטיס אתר (js/ui/sitecard.js)') > css.indexOf('«מה חדש» (js/ui/whatsnew.js)')
        && css.trimEnd().endsWith('}') && (next === -1 ? mine : mine.slice(0, next)).indexOf('@media') === -1
        && ['css/app.css', 'css/readability.css'].every(file => source(file).indexOf('scard-') === -1 && source(file).indexOf('site-card-open') === -1));
}

report();
