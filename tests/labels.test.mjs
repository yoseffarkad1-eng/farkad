// One identity for a site the roster has lost.
//
//   node tests/labels.test.mjs
//
// Days and roster entries travel as separate field paths, so an edit made on another
// phone lands here while the write that would have introduced the site is still queued
// behind it or was refused for room. The day is real, somebody worked it, and it is paid
// for - so it has to be called something on every surface that shows it.
//
// It used to be called three things at once. The invoice sheet numbered the missing sites
// it found over the REPORT RANGE; the detail sheet numbered the ones it found over the
// WHOLE SCHEDULE; and the screen, the worker's modal and the message he is sent printed
// the record id. One site, in one export, as 'אתר שאינו ברשימה 1', 'אתר שאינו ברשימה 2'
// and 'p_09'. A bookkeeper reconciling two sheets of one file is reading about two sites
// that do not exist and cannot find the one that does.
//
// What is pinned here: one map per span, every consumer reading it, and no record id
// reaching a person anywhere.

import { makeDevice, settle, reportsSource } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORTS = reportsSource();
const DAY = readFileSync(join(ROOT, 'js/ui/day.js'), 'utf8');
const WEEK = readFileSync(join(ROOT, 'js/ui/week.js'), 'utf8');
const SITECOLOR = readFileSync(join(ROOT, 'js/ui/sitecolor.js'), 'utf8');

const TODAY = '2026-08-20';
const STAMP = '2026-08-20';
const IN_RANGE = 'p_kfar';        // a day inside the report range names it
const ALSO_IN = 'p_ramla';        // and a second one, so the numbering has two to order
const OUT_OF_RANGE = 'p_eilat';   // a day OUTSIDE the range names this one

const run = (device, code) => vm.runInContext(code, device.ctx, { filename: 'harness:labels' });

function makeNode(tag) {
    const node = {
        tagName: String(tag || 'div').toUpperCase(), children: [], style: {}, dataset: {},
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        setAttribute() {}, removeAttribute() {}, getAttribute: () => null,
        addEventListener() {}, removeEventListener() {}, focus() {}, click() {},
        appendChild(child) { this.children.push(child); return child; },
        removeChild() {}, insertBefore(child) { this.children.push(child); return child; },
        querySelector: () => null, querySelectorAll: () => [],
        get textContent() {
            return this._text !== undefined ? this._text
                : this.children.map(child => child.textContent || '').join('');
        },
        set textContent(value) { this._text = value; this.children.length = 0; }
    };
    return node;
}

function phone(options = {}) {
    const device = makeDevice(options);
    device.setToday(TODAY);

    const nodes = {};
    device.ctx.document = Object.assign({}, device.ctx.document, {
        body: makeNode('body'),
        head: { appendChild() {} },
        createElement: tag => makeNode(tag),
        createTextNode: text => ({ textContent: text, children: [] }),
        getElementById: id => nodes[id] || null,
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener() {}, removeEventListener() {}
    });
    device.ctx.render = () => {};
    device.ctx.told = null;
    device.ctx.askTell = message => { device.ctx.told = message; };
    device.ctx.askConfirm = () => Promise.resolve(true);

    vm.runInContext(SITECOLOR, device.ctx, { filename: 'harness:sitecolor' });
    vm.runInContext(REPORTS, device.ctx, { filename: 'harness:reports' });
    vm.runInContext(DAY, device.ctx, { filename: 'harness:day' });
    vm.runInContext(WEEK, device.ctx, { filename: 'harness:week' });
    device.nodes = nodes;
    return device;
}

// The roster has two sites. Three MORE are named by days and are not on it - two inside
// the report range and one outside it - which is the shape that made the two sheets
// disagree: a consumer scoped to the whole schedule counts the outside one and shifts
// every number after it.
function seed(device, options = {}) {
    device.State.schedule.workers = [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 },
        { id: 'w_02', name: 'שרה', active: true, dailyRate: 350, hourlyRate: 50 }
    ];
    device.State.schedule.places = [
        { id: 'p_01', name: 'הרצליה', active: true },
        { id: 'p_02', name: 'תל אביב', active: true }
    ];
    device.State.save({ silent: true });

    const put = (date, worker, place) => device.State.commit(device.call(
        'assignPlace', device.State.schedule, date, worker, 'actual', place));
    put('2026-08-10', 'w_01', 'p_01');
    put('2026-08-11', 'w_01', 'p_02');

    // Applied the way an arriving edit is applied, then saved: a day on this disk like
    // any other, naming a site the roster has not got.
    const land = (date, worker, placeId) => {
        device.call('applyJournalEntry', device.State.schedule,
            `days.${date}.actual.${worker}`,
            { entries: [{ placeId }], rates: { daily: 400, hourly: 50 } });
    };
    if (options.outside !== false) land('2026-07-04', 'w_01', OUT_OF_RANGE);
    if (options.second) land('2026-08-14', 'w_02', ALSO_IN);
    land('2026-08-12', 'w_01', IN_RANGE);
    device.State.save({ silent: true });
    return device;
}

function setRange(device, from, to) {
    run(device, `REPORT_RANGE.from = '${from}'; REPORT_RANGE.to = '${to}';`);
}

// Every surface the reports page produces, as text, for one device and one range.
function surfaces(device) {
    const sheets = JSON.parse(JSON.stringify(run(device, 'reportSheets()')));
    const invoiceHeader = sheets.invoice[0];
    const detailSites = sheets.detail.slice(1).map(row => row[3]).filter(Boolean);
    const statement = run(device, `workerStatementText('w_01')`);

    // The worker's own modal, drawn through the real production path into nodes the
    // harness can read back. Drawn row by row rather than through openWorkerDays, which
    // also reaches for the modal chrome and the ledger block - neither of which is what
    // this file is about, and both of which would let a draw failure pass as "no id
    // printed".
    const worker = device.State.worker('w_01');
    const days = device.call('workerDaysReport', device.State.schedule, worker,
        run(device, 'REPORT_RANGE.from'), run(device, 'REPORT_RANGE.to'));
    const rows = days.map(day => run(device,
        `renderWorkerDayRow(${JSON.stringify(day)}, ${JSON.stringify(worker)})`));
    const drawn = rows.map(row => row.textContent).join(' | ');
    return { invoiceHeader, detailSites, statement, modal: drawn, rows: rows.length, sheets };
}

const LABEL = /אתר שאינו ברשימה( \d+)?/g;
const labelsIn = text => (String(text).match(LABEL) || []);

// ---------------------------------------------------------------- the map itself
{
    suite('one map for one span, and it is the only reading');

    const device = seed(phone());
    setRange(device, '2026-08-01', '2026-08-31');

    const inRange = device.call('placeLabelsIn', device.State.schedule, '2026-08-01', '2026-08-31');
    given('the roster names are in the map',
        inRange.get('p_01') === 'הרצליה' && inRange.get('p_02') === 'תל אביב');
    check('a site the roster has lost is numbered, not named by its id',
        inRange.get(IN_RANGE) === 'אתר שאינו ברשימה 1',
        String(inRange.get(IN_RANGE)));
    check('and a site outside the span is not in this span’s map at all',
        inRange.has(OUT_OF_RANGE) === false, String(inRange.get(OUT_OF_RANGE)));

    // The one case a map cannot answer, answered anyway: never the id.
    check('a site the map has never heard of is still not shown as a record id',
        device.call('placeLabelFrom', inRange, 'p_nowhere') === 'אתר שאינו ברשימה',
        device.call('placeLabelFrom', inRange, 'p_nowhere'));

    const whole = device.call('placeLabelsIn', device.State.schedule);
    check('over the whole record both missing sites are numbered, in id order',
        whole.get('p_eilat') === 'אתר שאינו ברשימה 1'
        && whole.get('p_kfar') === 'אתר שאינו ברשימה 2',
        JSON.stringify([whole.get('p_eilat'), whole.get('p_kfar')]));
}

// ---------------------------------------------------------------- the consumers agree
{
    suite('every consumer of one report says the same thing about the same site');

    const device = seed(phone());
    setRange(device, '2026-08-01', '2026-08-31');
    const seen = surfaces(device);

    // The failure this file was written for: one missing site is INSIDE the range and one
    // is outside it, so a consumer scoped to the whole schedule numbers the inside one 2
    // while a range-scoped one numbers it 1.
    given('the invoice sheet has a column for it',
        seen.invoiceHeader.some(name => LABEL.test(String(name))),
        JSON.stringify(seen.invoiceHeader));
    const column = seen.invoiceHeader.filter(name => labelsIn(name).length > 0);
    const detail = [...new Set(seen.detailSites.filter(name => labelsIn(name).length > 0))];

    same('the invoice column and the detail rows call it one thing', column, detail);
    check('and that thing is the range’s first missing site, not the record’s second',
        column.length === 1 && column[0] === 'אתר שאינו ברשימה 1', JSON.stringify(column));

    check('the message the worker is sent says it too',
        seen.statement.indexOf('אתר שאינו ברשימה 1') !== -1,
        seen.statement.split('\n').filter(line => line.indexOf('12/08') !== -1).join(' | '));
    given('the modal really drew his days', seen.rows > 0, String(seen.rows));
    check('and his own modal on the screen',
        seen.modal.indexOf('אתר שאינו ברשימה 1') !== -1, seen.modal.slice(0, 160));
}

// ---------------------------------------------------------------- no id, anywhere
{
    suite('no record id reaches a person, on any surface');

    const device = seed(phone(), { second: true });
    setRange(device, '2026-08-01', '2026-08-31');
    const seen = surfaces(device);

    const everywhere = [
        ['the invoice sheet', JSON.stringify(seen.sheets.invoice)],
        ['the detail sheet', JSON.stringify(seen.sheets.detail)],
        ['the pay sheet', JSON.stringify(seen.sheets.payroll)],
        ['the message he is sent', seen.statement],
        ['his modal on the screen', seen.modal]
    ];
    given('every surface above produced something to read',
        seen.rows > 0 && seen.statement.length > 40 && seen.sheets.detail.length > 1,
        JSON.stringify([seen.rows, seen.statement.length, seen.sheets.detail.length]));
    everywhere.forEach(([where, text]) => {
        check(`${where} prints no record id`,
            text.indexOf(IN_RANGE) === -1 && text.indexOf(ALSO_IN) === -1
            && text.indexOf(OUT_OF_RANGE) === -1,
            String(text).slice(0, 100));
    });

    // Two inside the range: they are told apart, and told apart the same way everywhere.
    const column = seen.invoiceHeader.filter(name => labelsIn(name).length > 0).sort();
    const detail = [...new Set(seen.detailSites.filter(name => labelsIn(name).length > 0))].sort();
    same('two missing sites are two columns and two names', column,
        ['אתר שאינו ברשימה 1', 'אתר שאינו ברשימה 2']);
    same('and the detail sheet uses the same two', detail, column);
}

// ---------------------------------------------------------------- the range moves
{
    suite('switching the report range does not leave two answers behind');

    const device = seed(phone(), { second: true });

    setRange(device, '2026-08-01', '2026-08-31');
    const august = surfaces(device);
    setRange(device, '2026-07-01', '2026-07-31');
    const july = surfaces(device);
    setRange(device, '2026-08-01', '2026-08-31');
    const again = surfaces(device);

    check('July’s report names July’s missing site',
        july.detailSites.includes('אתר שאינו ברשימה 1')
        && !july.detailSites.includes('אתר שאינו ברשימה 2'),
        JSON.stringify([...new Set(july.detailSites)]));
    same('and August, asked again, says exactly what it said the first time',
        [august.invoiceHeader, [...new Set(august.detailSites)]],
        [again.invoiceHeader, [...new Set(again.detailSites)]]);

    // Within EACH report the two sheets still agree - which is the property that broke,
    // and the one a cached map could break again by going stale across a range change.
    [['August', august], ['July', july]].forEach(([name, seen]) => {
        const column = seen.invoiceHeader.filter(item => labelsIn(item).length > 0).sort();
        const detail = [...new Set(seen.detailSites.filter(item => labelsIn(item).length > 0))].sort();
        same(`${name}: the two sheets of that one report agree`, column, detail);
    });
}

// ---------------------------------------------------------------- only outside
{
    suite('a missing site only outside the selected range');

    const device = seed(phone(), { outside: true });
    setRange(device, '2026-06-01', '2026-06-30');
    const seen = surfaces(device);

    check('a report covering none of it names no missing site at all',
        seen.invoiceHeader.every(name => labelsIn(name).length === 0)
        && seen.detailSites.length === 0,
        JSON.stringify([seen.invoiceHeader, seen.detailSites]));
    check('and still prints no record id',
        JSON.stringify(seen.sheets).indexOf(OUT_OF_RANGE) === -1,
        JSON.stringify(seen.sheets).slice(0, 100));
}

// ---------------------------------------------------------------- the other screens
{
    suite('the day and the week screens name the same site the same way');

    const device = seed(phone(), { second: true });
    device.State.date = '2026-08-12';
    device.State.layer = 'actual';

    const whole = device.call('placeLabelsIn', device.State.schedule);
    // Those two screens are not a report and have no range: they show the record, so they
    // are drawn over the record. What must never differ is that the site is NAMED - the
    // id is not a name on any screen either.
    check('the day screen has a name for it, and it is not the id',
        whole.get(IN_RANGE) === 'אתר שאינו ברשימה 2'
        && device.call('placeLabelFrom', whole, IN_RANGE).indexOf('p_') === -1,
        String(whole.get(IN_RANGE)));
    check('and neither file reads a place name off the roster any more',
        readFileSync(join(ROOT, 'js/ui/day.js'), 'utf8')
            .indexOf('place ? place.name : entry.placeId') === -1
        && readFileSync(join(ROOT, 'js/ui/week.js'), 'utf8')
            .indexOf('place ? place.name : entry.placeId') === -1);
}

report();
