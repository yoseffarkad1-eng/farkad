// טבלת האתרים (v208) on devices in Node: the switch «כולל עובדי רימא» / «ללא עובדי רימא»
// over the billing grid of «דוחות» ← «לפי אתר» counts nothing itself.
//
//   node tests/sitegrid.test.mjs
//
// What is held: in each state every cell, every day's total, every site's total and the
// grand total is the existing reader's own answer (invoiceByDate with Rima's men,
// invoiceWithoutRima without), on seeded records with Rima counts, free ranges (10 and 17
// days and others), a site the roster no longer lists and the one-client narrowing; the
// two states differ by exactly the Rima table; the words; the block is the screen's only
// (not a .report-table, hidden in print); it names no worker and no shekel; the choice is
// memory and the disk does not move. The glass is tests/sitegrid.browser.mjs.

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { makeDevice } from './harness.mjs';
import { suite, check, same, report } from './runner.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const REPORTS = read('js/ui/reports.js');
const APP_CSS = read('css/app.css');
const LARGE_CSS = read('css/large.css');
const PRINTOUT = read('js/ui/printout.js');

const SITES = ['אלעד', 'נשר', 'אילון', 'חיפה', 'עכו', 'טבריה'];
const pad = n => String(n).padStart(2, '0');
const day = n => `2026-10-${pad(n)}`;

// A small deterministic generator: the same records on every run.
function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

function phone(seed) {
    const device = makeDevice({ deviceId: `sg${seed}` });
    device.setToday('2026-10-31');
    const next = rng(seed);
    device.State.schedule.workers = Array.from({ length: 12 }, (_, i) => (
        { id: `w_${pad(i + 1)}`, name: `פועל ${i + 1}`, active: i !== 11, dailyRate: 400 + i, hourlyRate: 50 }));
    device.State.schedule.places = SITES.map((name, i) => ({ id: `p_${i + 1}`, name, active: true }));
    for (let d = 1; d <= 30; d += 1) {
        if (next() < 0.15) continue;                      // a day nobody worked
        device.State.schedule.workers.forEach(worker => {
            const roll = next();
            if (roll < 0.2) return;
            const site = `p_${1 + Math.floor(next() * SITES.length)}`;
            device.call('assignPlace', device.State.schedule, day(d), worker.id, 'actual', site,
                next() < 0.15 ? 'double' : undefined);
            // Two sites in a day: once in each.
            if (next() < 0.12) {
                const other = `p_${1 + Math.floor(next() * SITES.length)}`;
                if (other !== site) device.call('assignPlace', device.State.schedule, day(d), worker.id, 'actual', other);
            }
        });
        SITES.forEach((_, i) => {
            if (next() < 0.25) device.call('setRimaCount', device.State.schedule, day(d), `p_${i + 1}`, 1 + Math.floor(next() * 4));
        });
    }
    // A site the days name and the roster no longer has.
    device.call('assignPlace', device.State.schedule, day(7), 'w_01', 'actual', 'p_gone');
    device.State.save({ silent: true });
    device.ctx.document.head = { appendChild() {} };
    vm.runInContext(REPORTS, device.ctx, { filename: 'js/ui/reports.js' });
    return device;
}
const run = (device, code) => vm.runInContext(code, device.ctx, { filename: 'harness:sitegrid' });

// The grid's facts as plain data, and the same grid asked of the readers themselves.
const FACTS = `(withRima, from, to, placeId) => {
    REPORT_RANGE.from = from; REPORT_RANGE.to = to; REPORT_SECTION = 'sites'; INVOICE_PLACE = placeId;
    SITE_GRID_WITH_RIMA = withRima;
    const all = invoiceByDate(State.schedule, from, to);
    const chosen = all.places.find(place => place.placeId === placeId) || null;
    const facts = siteGridFacts(all, chosen);
    return JSON.stringify({
        dates: facts.dates,
        sites: facts.places.map(place => [place.placeId, place.name, place.workerDays]),
        cells: facts.dates.map(date => facts.places.map(place => facts.countAt(place.placeId, date))),
        days: facts.dates.map(date => facts.dayTotal(date)),
        total: facts.total
    });
}`;
const SOURCE = `(withRima, from, to, placeId) => {
    const all = invoiceByDate(State.schedule, from, to);
    const chosen = all.places.find(place => place.placeId === placeId) || null;
    if (withRima) {
        const places = chosen ? [chosen] : all.places;
        const dates = chosen ? chosen.days.map(day => day.date) : all.dates;
        const cells = dates.map(date => places.map(place => all.countAt(place.placeId, date)));
        return JSON.stringify({ dates, sites: places.map(place => [place.placeId, place.name, place.workerDays]), cells,
            days: cells.map(row => row.reduce((a, b) => a + b, 0)),
            total: places.reduce((sum, place) => sum + place.workerDays, 0) });
    }
    const own = invoiceWithoutRima(State.schedule, from, to, chosen ? chosen.placeId : null);
    return JSON.stringify({ dates: own.dates, sites: own.places.map(place => [place.placeId, place.name, place.workerDays]),
        cells: own.dates.map(date => own.places.map(place => own.countAt(place.placeId, date))),
        days: own.dates.map(date => own.dayTotal(date)), total: own.total });
}`;
const ask = (device, fn, ...args) => JSON.parse(run(device, `(${fn})(${args.map(a => JSON.stringify(a)).join(', ')})`));

const RANGES = [[day(1), day(10)], [day(5), day(21)], [day(1), day(30)], [day(13), day(13)], [day(28), '2026-11-15']];

{
    suite('1. in each state every cell, total and date is the existing reader\'s own');
    let grids = 0;
    const wrong = [];
    for (let seed = 1; seed <= 12; seed += 1) {
        const device = phone(seed);
        RANGES.forEach(([from, to]) => {
            [null, 'p_1', 'p_3', 'p_gone'].forEach(placeId => {
                [true, false].forEach(withRima => {
                    const got = ask(device, FACTS, withRima, from, to, placeId);
                    const want = ask(device, SOURCE, withRima, from, to, placeId);
                    grids += 1;
                    if (JSON.stringify(got) !== JSON.stringify(want)) wrong.push([seed, from, to, placeId, withRima]);
                    // Each row adds up to its day's total, each column to its site's, all to the total.
                    const cols = got.sites.map((_, c) => got.cells.reduce((sum, row) => sum + row[c], 0));
                    if (JSON.stringify(cols) !== JSON.stringify(got.sites.map(site => site[2]))
                        || got.days.reduce((a, b) => a + b, 0) !== got.total
                        || got.cells.some((row, r) => row.reduce((a, b) => a + b, 0) !== got.days[r])) {
                        wrong.push(['sums', seed, from, to, placeId, withRima]);
                    }
                });
            });
        });
    }
    same(`${grids} grids: «כולל» is invoiceByDate's, «ללא» is invoiceWithoutRima's, and each adds up`, wrong, []);
    check('enough of them were read', grids === 12 * RANGES.length * 4 * 2, String(grids));
}

{
    suite('2. the two states differ by exactly the Rima count, cell by cell');
    const wrong = [];
    let differing = 0;
    for (let seed = 1; seed <= 12; seed += 1) {
        const device = phone(seed);
        const [from, to] = [day(1), day(30)];
        const withR = ask(device, FACTS, true, from, to, null);
        const without = ask(device, FACTS, false, from, to, null);
        same(`seed ${seed}: the same dates and the same sites in both states`,
            [without.dates, without.sites.map(site => site.slice(0, 2))], [withR.dates, withR.sites.map(site => site.slice(0, 2))]);
        withR.dates.forEach((date, r) => withR.sites.forEach(([placeId], c) => {
            const rima = run(device, `rimaCount(State.schedule, ${JSON.stringify(date)}, ${JSON.stringify(placeId)})`);
            if (withR.cells[r][c] - without.cells[r][c] !== rima) wrong.push([seed, date, placeId]);
            if (rima > 0) differing += 1;
        }));
    }
    same('with - without = rimaCount, everywhere', wrong, []);
    check('and Rima was really there to take out', differing > 100, String(differing));
}

{
    suite('3. the owner\'s example: 5 with and 4 without, 6 and 6, 5 and 3');
    const device = makeDevice({ deviceId: 'sgx' });
    device.setToday('2026-10-31');
    device.State.schedule.workers = Array.from({ length: 13 }, (_, i) => (
        { id: `w_${pad(i + 1)}`, name: `פועל ${i + 1}`, active: true, dailyRate: 400, hourlyRate: 50 }));
    device.State.schedule.places = SITES.slice(0, 3).map((name, i) => ({ id: `p_${i + 1}`, name, active: true }));
    const put = (from, to, site) => { for (let i = from; i <= to; i += 1) device.call('assignPlace', device.State.schedule, day(12), `w_${pad(i)}`, 'actual', site); };
    put(1, 4, 'p_1'); put(5, 10, 'p_2'); put(11, 13, 'p_3');
    device.call('setRimaCount', device.State.schedule, day(12), 'p_1', 1);
    device.call('setRimaCount', device.State.schedule, day(12), 'p_3', 2);
    // A double day and a man at two sites: one in each site, never two.
    device.call('assignPlace', device.State.schedule, day(13), 'w_01', 'actual', 'p_1', 'double');
    device.call('assignPlace', device.State.schedule, day(13), 'w_02', 'actual', 'p_1');
    device.call('assignPlace', device.State.schedule, day(13), 'w_02', 'actual', 'p_2');
    device.State.save({ silent: true });
    device.ctx.document.head = { appendChild() {} };
    vm.runInContext(REPORTS, device.ctx, { filename: 'js/ui/reports.js' });
    const withR = ask(device, FACTS, true, day(10), day(20), null);
    const without = ask(device, FACTS, false, day(10), day(20), null);
    same('with Rima\'s men: אלעד 5, נשר 6, אילון 5 - 16 that day', [withR.cells[0], withR.days[0]], [[5, 6, 5], 16]);
    same('without: אלעד 4, נשר 6, אילון 3 - 13 that day', [without.cells[0], without.days[0]], [[4, 6, 3], 13]);
    same('a double day is one man on the site, and a man at two sites is one in each',
        [withR.cells[1], without.cells[1]], [[2, 1, 0], [2, 1, 0]]);
    same('the totals move with the switch', [withR.total, without.total], [19, 16]);
}

{
    suite('4. the words, and where the block lives');
    const device = phone(3);
    same('every word of it', JSON.parse(run(device, 'JSON.stringify(SITE_GRID_TEXT)')), {
        group: 'עובדי רימא בטבלה',
        withRima: 'כולל עובדי רימא',
        withoutRima: 'ללא עובדי רימא',
        saysWith: 'כל העובדים בכל אתר, כולל עובדי רימא - כמו בחיוב.',
        saysWithout: 'העובדים שלך בלבד, בלי עובדי רימא.',
        date: 'תאריך',
        dayTotal: 'סה״כ יומי'
    });
    same('the total line is the invoice\'s own word', run(device, 'NO_RIMA_TOTAL'), 'סה״כ ימי עובד־אתר');
    check('it opens on «כולל»', /\nlet SITE_GRID_WITH_RIMA = true;\n/.test(REPORTS));

    const block = REPORTS.slice(REPORTS.indexOf('// ---------------------------------------------------------------- טבלת האתרים (v208)'),
        REPORTS.indexOf('// ---------------------------------------------------------------- רישום לרימא (v166)'));
    check('the block was found', block.length > 2000, String(block.length));
    const code = block.split('\n').filter(line => !/^\s*\/\//.test(line)).join('\n');
    check('its table is not a .report-table, so the picture never reads it',
        code.includes("el('table', 'client-grid-table')") && !/report-table/.test(code) && !/buildTable\(/.test(code));
    check('and the picture still reads .report-table alone, leaving «בלי עובדי רימא» out by name',
        PRINTOUT.includes("section.querySelectorAll('table.report-table')") && PRINTOUT.includes(".report-norima"));
    check('it keeps nothing: no Store, no localStorage, no commit, no save',
        !/Store\.|localStorage|\.commit|\.save\(|commitMany|setVerified/.test(code));
    check('it names no worker and no money: no worker reader, no rate, no shekel',
        !/worker\.name|workerName|dailyRate|hourlyRate|₪|payrollReport|moneyOf|advance/i.test(code));
    check('hidden in print', /@media print \{ \.client-grid \{ display: none !important; \} \}/.test(APP_CSS));
    check('«בלי עובדי רימא»\'s own section still never reaches paper',
        /@media print \{ \.report-norima \{ display: none !important; \} \}/.test(APP_CSS));
    check('and is put away on the screen, where the switch shows its figures',
        /@media screen \{ \.report-invoice \.report-norima \{ display: none; \} \}/.test(APP_CSS));
    check('the date column sticks to the inline start',
        /\.client-grid-table \.client-grid-date \{[^}]*position: sticky;[^}]*inset-inline-start: 0;/.test(APP_CSS));
    check('no bar height is written into it (law 8)', !/client-grid[^{]*\{[^}]*[\s;{]top:/.test(APP_CSS));
    const sizes = (APP_CSS.match(/\.client-grid[^{]*\{[^}]*font-size:[^}]*\}/g) || []).length;
    const again = (LARGE_CSS.match(/:root\.display-large \.client-grid[^{]*\{[^}]*font-size:[^}]*\}/g) || []).length;
    check('every size it sets is said again for the large display', sizes > 0 && again >= sizes, `${sizes} / ${again}`);
}

{
    suite('5. nothing is written by reading either state');
    const device = phone(5);
    const keys = () => {
        const out = [];
        for (let i = 0; i < device.ctx.localStorage.length; i += 1) {
            const key = device.ctx.localStorage.key(i);
            out.push([key, device.ctx.localStorage.getItem(key)]);
        }
        return JSON.stringify(out.sort());
    };
    const before = keys();
    const record = JSON.stringify(device.State.schedule);
    ask(device, FACTS, true, day(1), day(30), null);
    ask(device, FACTS, false, day(1), day(30), null);
    ask(device, FACTS, false, day(1), day(30), 'p_2');
    same('the disk, key for key and byte for byte', keys(), before);
    same('and the record in memory', JSON.stringify(device.State.schedule), record);
}

report();
