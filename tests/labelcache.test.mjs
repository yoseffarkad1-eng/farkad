// The site-label map, after the record has moved under it.
//
//   node tests/labelcache.test.mjs
//
// tests/labels.test.mjs pinned that one span gets ONE map and that every consumer reads
// it. This file asks the next question: is the map the consumers read still a map of the
// record they are drawing?
//
// js/ui/reports.js memoises it on
//
//     `${REPORT_RANGE.from}|${REPORT_RANGE.to}|${State.schedule.places.length}|`
//         + `${Object.keys(State.schedule.days || {}).length}`
//
// which is four numbers about the SIZE of two collections and nothing at all about what
// is in them. Rename a site, move a day from one site to another, or restore a whole
// different record with the same number of sites and the same number of days, and the
// key does not move - so the map does not either. The invoice sheet beside it is rebuilt
// from the record every time (js/model/schema.js invoiceReport calls placeLabelsIn
// itself), so the two sheets of one export go back to disagreeing about the same site,
// which is exactly the failure labels.test.mjs exists to prevent.
//
// The fourth suite is about a different hole in the same wall: js/ui/sheet.js draws the
// site name on the assign sheet's rate row as `place ? place.name : entry.placeId`,
// which is the line day.js and week.js were cured of.
//
// Every check here asserts what the app is supposed to do. A failing check is the defect,
// and its detail is what the app actually said.

import { makeDevice, settle } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORTS = readFileSync(join(ROOT, 'js/ui/reports.js'), 'utf8');
const DAY = readFileSync(join(ROOT, 'js/ui/day.js'), 'utf8');
const WEEK = readFileSync(join(ROOT, 'js/ui/week.js'), 'utf8');
const SHEET = readFileSync(join(ROOT, 'js/ui/sheet.js'), 'utf8');
const SITECOLOR = readFileSync(join(ROOT, 'js/ui/sitecolor.js'), 'utf8');

const TODAY = '2026-08-20';
const FROM = '2026-08-01';
const TO = '2026-08-31';

const KFAR = 'p_kfar';     // a day names it; the roster has not got it
const RAMLA = 'p_ramla';   // and a second one, so the numbering has two to order
const ALEF = 'p_alef';     // sorts BEFORE both, so arriving renumbers the others
const MISSING = 'p_09';    // the id the assign sheet is claimed to print

const run = (device, code) => vm.runInContext(code, device.ctx, { filename: 'harness:labelcache' });

// ---------------------------------------------------------------- a readable DOM

// Same shape as tests/labels.test.mjs, plus the three things the assign sheet needs that
// the reports page does not: a working firstChild/removeChild pair (clear() in
// js/ui/dom.js walks it, and a body that never empties would let one render's text be
// read as the next one's), createElementNS for the forward chevron, and attributes that
// are actually kept - one of the site names on that sheet is drawn only into an
// aria-label, and a setAttribute that throws its argument away would report that name as
// present when nothing was written.
function makeNode(tag) {
    const node = {
        tagName: String(tag || 'div').toUpperCase(), children: [], style: {}, dataset: {},
        attrs: {},
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        setAttribute(name, value) { this.attrs[name] = String(value); },
        removeAttribute(name) { delete this.attrs[name]; },
        getAttribute(name) { return this.attrs[name] === undefined ? null : this.attrs[name]; },
        setAttributeNS(name, value) { this.attrs[name] = String(value); },
        addEventListener() {}, removeEventListener() {}, focus() {}, click() {},
        matches: () => false,
        appendChild(child) { this.children.push(child); return child; },
        insertBefore(child) { this.children.push(child); return child; },
        removeChild(child) {
            const at = this.children.indexOf(child);
            if (at !== -1) this.children.splice(at, 1);
            return child;
        },
        get firstChild() { return this.children.length ? this.children[0] : null; },
        querySelector: () => null, querySelectorAll: () => [],
        get textContent() {
            return this._text !== undefined ? this._text
                : this.children.map(child => child.textContent || '').join(' ');
        },
        set textContent(value) { this._text = value; this.children.length = 0; }
    };
    return node;
}

// Every attribute of that name anywhere under a node, in draw order.
function attrsUnder(node, name) {
    const found = [];
    const walk = item => {
        if (!item || typeof item !== 'object') return;
        if (item.attrs && item.attrs[name] !== undefined) found.push(item.attrs[name]);
        (item.children || []).forEach(walk);
    };
    walk(node);
    return found;
}

// The ids the assign sheet writes into. Pre-made, because renderAssignSheet reaches for
// them by name and a null here would be a silent no-draw that reads as "no id printed".
const SHEET_IDS = ['assignSheetTitle', 'assignSheetMeta', 'assignSheetBody', 'assignSheetFoot'];

function phone(options = {}) {
    const device = makeDevice(options);
    device.setToday(TODAY);

    const nodes = {};
    SHEET_IDS.forEach(id => { nodes[id] = makeNode('div'); });

    device.ctx.document = Object.assign({}, device.ctx.document, {
        body: makeNode('body'),
        head: { appendChild() {} },
        createElement: tag => makeNode(tag),
        createElementNS: (ns, tag) => makeNode(tag),
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
    vm.runInContext(SHEET, device.ctx, { filename: 'harness:sheet' });
    device.nodes = nodes;
    return device;
}

// Two sites on the roster, four days on the record. Two of those days name sites the
// roster has not got - the shape that makes the numbering visible at all, because a site
// that IS on the roster is named the same by a stale map and a fresh one.
function seed(device, options = {}) {
    device.State.schedule.workers = [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 },
        { id: 'w_02', name: 'שרה', active: true, dailyRate: 350, hourlyRate: 50 }
    ];
    device.State.schedule.places = [
        { id: 'p_01', name: 'הרצליה', active: true },
        { id: 'p_02', name: 'תל אביב', active: options.archived ? false : true }
    ];
    device.State.save({ silent: true });

    const put = (date, worker, place) => device.State.commit(device.call(
        'assignPlace', device.State.schedule, date, worker, 'actual', place));
    put('2026-08-10', 'w_01', 'p_01');
    put('2026-08-11', 'w_01', 'p_02');

    // Applied the way an arriving edit is applied: a day on this disk like any other,
    // naming a site the roster has not got.
    land(device, '2026-08-12', 'w_01', KFAR);
    land(device, '2026-08-14', 'w_02', RAMLA);
    device.State.save({ silent: true });
    return device;
}

function land(device, date, worker, placeId, rate) {
    device.call('applyJournalEntry', device.State.schedule,
        `days.${date}.actual.${worker}`,
        {
            entries: [Object.assign({ placeId }, rate ? { rate } : {})],
            rates: { daily: 400, hourly: 50 }
        });
}

function setRange(device, from, to) {
    run(device, `REPORT_RANGE.from = '${from}'; REPORT_RANGE.to = '${to}';`);
}

const sizes = device => [
    device.State.schedule.places.length,
    Object.keys(device.State.schedule.days || {}).length
];

// Every surface the reports page produces, as text, for one device and one range.
function surfaces(device, workerId = 'w_01') {
    const sheets = JSON.parse(JSON.stringify(run(device, 'reportSheets()')));
    const invoiceHeader = sheets.invoice[0];
    const detailRows = sheets.detail.slice(1);
    const detailSites = detailRows.map(row => row[3]).filter(Boolean);
    // date -> what the אתר column said on that date. The renumbering is a claim about
    // ONE day, and a flat list of labels cannot say which day carried which.
    const byDate = {};
    detailRows.forEach(row => { if (row[3]) byDate[row[0]] = row[3]; });

    const statement = run(device, `workerStatementText('${workerId}')`);

    // The worker's own modal, drawn through the real production path, row by row rather
    // than through openWorkerDays - which also reaches for the modal chrome and the
    // ledger block, neither of which is what this file is about and both of which would
    // let a draw failure pass as "nothing stale printed".
    const worker = device.State.worker(workerId);
    const days = device.call('workerDaysReport', device.State.schedule, worker,
        run(device, 'REPORT_RANGE.from'), run(device, 'REPORT_RANGE.to'));
    const rows = days.map(day => run(device,
        `renderWorkerDayRow(${JSON.stringify(day)}, ${JSON.stringify(worker)})`));
    const modal = rows.map(row => row.textContent).join(' | ');

    return {
        invoiceHeader, detailSites, byDate, statement, modal, rows: rows.length, sheets,
        // The memo key the page is holding, and the map it is holding under it.
        key: run(device, 'LABELS_FOR'),
        labelled: sites => sites.map(id => run(device,
            `placeLabelFrom(reportPlaceLabels(), ${JSON.stringify(id)})`))
    };
}

// The names the invoice sheet used, and the names the detail sheet used, as sets. These
// two sit in ONE workbook and are read against each other by whoever opens it.
const named = header => header.slice(1, -1).slice().sort();
const uniq = list => [...new Set(list)].sort();

// ---------------------------------------------------------------- 1. a rename
{
    suite('a site renamed while the report is open');

    const device = seed(phone());
    setRange(device, FROM, TO);

    const before = surfaces(device);
    given('the report was drawn once, under the old name',
        before.detailSites.indexOf('הרצליה') !== -1, JSON.stringify(uniq(before.detailSites)));
    given('and the page is now holding a memo key', typeof before.key === 'string', String(before.key));

    // Exactly what renamePlaceById does once the dialog closes - js/ui/roster.js:1482.
    // Renaming is the one roster edit that CANNOT change places.length.
    run(device, `State.place('p_01').name = 'הרצליה מערב'; State.commitRoster();`);
    const after = surfaces(device);

    given('the roster really carries the new name',
        device.State.place('p_01').name === 'הרצליה מערב', device.State.place('p_01').name);
    given('and the two collections are the same size as before',
        JSON.stringify(sizes(device)) === JSON.stringify([2, 4]), JSON.stringify(sizes(device)));

    check('the memo key notices that the record moved',
        after.key !== before.key, `${before.key} -> ${after.key}`);
    check('the detail sheet calls the site by its new name',
        after.detailSites.indexOf('הרצליה מערב') !== -1, JSON.stringify(uniq(after.detailSites)));
    check('and never by the name it had before',
        after.detailSites.indexOf('הרצליה') === -1, JSON.stringify(uniq(after.detailSites)));
    check('the message the worker is sent carries the new name',
        after.statement.indexOf('הרצליה מערב') !== -1,
        after.statement.split('\n').filter(line => line.indexOf('10/08') !== -1).join(' | '));
    check('and his own modal on the screen',
        after.modal.indexOf('הרצליה מערב') !== -1, after.modal.slice(0, 120));
    same('the two sheets of one export still call one site one thing',
        uniq(after.detailSites.filter(Boolean)), named(after.invoiceHeader));
}

// ---------------------------------------------------------------- 2. a day changes site
{
    suite('one day moved from one unlisted site to another');

    const device = seed(phone());
    setRange(device, FROM, TO);

    const before = surfaces(device);
    given('the two unlisted sites are numbered 1 and 2 to begin with',
        JSON.stringify(before.labelled([KFAR, RAMLA]))
            === JSON.stringify(['אתר שאינו ברשימה 1', 'אתר שאינו ברשימה 2']),
        JSON.stringify(before.labelled([KFAR, RAMLA])));
    given('and 14/08 is drawn as the second of them',
        before.byDate['2026-08-14'] === 'אתר שאינו ברשימה 2',
        JSON.stringify(before.byDate));

    // p_ramla out, p_alef in, on the day that already exists. The day COUNT does not
    // move, and neither does the roster - so neither does the memo key. p_alef sorts
    // before p_kfar, so a map built now numbers the OTHER day differently too.
    land(device, '2026-08-14', 'w_02', ALEF);
    device.State.save({ silent: true });

    given('the collections are still the same size',
        JSON.stringify(sizes(device)) === JSON.stringify([2, 4]), JSON.stringify(sizes(device)));
    const fresh = device.call('placeLabelsIn', device.State.schedule, FROM, TO);
    given('a map built now numbers p_alef 1 and p_kfar 2',
        fresh.get(ALEF) === 'אתר שאינו ברשימה 1' && fresh.get(KFAR) === 'אתר שאינו ברשימה 2',
        JSON.stringify([fresh.get(ALEF), fresh.get(KFAR)]));

    const after = surfaces(device);
    check('the memo key notices that a day changed site',
        after.key !== before.key, `${before.key} -> ${after.key}`);
    check('the day that moved is named by the map, not left unnumbered',
        after.byDate['2026-08-14'] === 'אתר שאינו ברשימה 1',
        String(after.byDate['2026-08-14']));
    check('and the day beside it renumbers with it',
        after.byDate['2026-08-12'] === 'אתר שאינו ברשימה 2',
        String(after.byDate['2026-08-12']));
    check('the message the worker is sent renumbers too',
        after.statement.indexOf('אתר שאינו ברשימה 2') !== -1,
        after.statement.split('\n').filter(line => line.indexOf('12/08') !== -1).join(' | '));
    check('and his own modal on the screen',
        after.modal.indexOf('אתר שאינו ברשימה 2') !== -1, after.modal.slice(0, 160));
    same('the two sheets of one export still agree on the two missing sites',
        uniq(after.detailSites.filter(name => name.indexOf('אתר שאינו ברשימה') === 0)),
        uniq(named(after.invoiceHeader).filter(name => name.indexOf('אתר שאינו ברשימה') === 0)));
    check('and no surface of that export prints a record id',
        JSON.stringify(after.sheets).indexOf(ALEF) === -1
        && after.statement.indexOf(ALEF) === -1 && after.modal.indexOf(ALEF) === -1,
        JSON.stringify(after.byDate));
}

// ---------------------------------------------------------------- 3. a restore
{
    suite('a different record restored over this one, same number of sites and days');

    const device = seed(phone());
    setRange(device, FROM, TO);

    const before = surfaces(device);
    given('the report was drawn once, over this record',
        before.detailSites.indexOf('הרצליה') !== -1, JSON.stringify(uniq(before.detailSites)));

    // Somebody else's record: two sites and four days, exactly like this one, and not one
    // name in common. Off any of share.js's four doors this ends in the same two lines -
    // State.schedule = next; State.save() - in applyReplacementLocally.
    const day = (worker, placeId) => ({
        [worker]: { entries: [{ placeId }], rates: { daily: 400, hourly: 50 } }
    });
    const document = {
        schemaVersion: device.State.schedule.schemaVersion,
        workers: [
            { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 },
            { id: 'w_02', name: 'שרה', active: true, dailyRate: 350, hourlyRate: 50 }
        ],
        places: [
            { id: 'p_01', name: 'רעננה', active: true },
            { id: 'p_02', name: 'לוד', active: true }
        ],
        days: {
            '2026-08-10': { actual: day('w_01', 'p_01') },
            '2026-08-11': { actual: day('w_01', 'p_02') },
            // NOT an unlisted site: fullScheduleProblems (js/model/schema.js:520) refuses
            // a whole-document restore that names a site its own roster has not got, so
            // this door cannot carry one and the suite does not pretend it can.
            '2026-08-12': { actual: day('w_01', 'p_02') },
            '2026-08-14': { actual: day('w_02', 'p_01') }
        },
        advances: {}
    };

    given('the restore is prepared', device.Sync.prepareReplace(document, false) === true);
    const envelope = device.Sync.pendingReplace();
    given('and the envelope carries a document', Boolean(envelope && envelope.document));
    const applied = device.Sync.applyReplacementLocally(envelope);
    given('and it is stored', applied.stored === true, JSON.stringify(applied));
    // The ledger mirror commits a moment after the swap - see migrateSoon in js/state.js.
    await settle(5);

    given('the restored record is on the screen',
        device.State.place('p_01').name === 'רעננה', device.State.place('p_01').name);
    given('and it is the same size as the one it replaced',
        JSON.stringify(sizes(device)) === JSON.stringify([2, 4]), JSON.stringify(sizes(device)));

    const after = surfaces(device);
    check('the memo key notices that the whole record was swapped out',
        after.key !== before.key, `${before.key} -> ${after.key}`);
    check('the detail sheet names the restored record’s sites',
        after.detailSites.indexOf('רעננה') !== -1 && after.detailSites.indexOf('לוד') !== -1,
        JSON.stringify(uniq(after.detailSites)));
    check('and none of the sites the restore replaced',
        after.detailSites.indexOf('הרצליה') === -1 && after.detailSites.indexOf('תל אביב') === -1,
        JSON.stringify(uniq(after.detailSites)));
    check('no site the restore did not bring is still being numbered',
        uniq(after.detailSites).every(name => name.indexOf('אתר שאינו ברשימה') !== 0),
        JSON.stringify(uniq(after.detailSites)));
    check('the message the worker is sent is about the restored record',
        after.statement.indexOf('רעננה') !== -1 && after.statement.indexOf('הרצליה') === -1,
        after.statement.split('\n').filter(line => line.indexOf('10/08') !== -1).join(' | '));
    check('and his own modal on the screen',
        after.modal.indexOf('רעננה') !== -1 && after.modal.indexOf('הרצליה') === -1,
        after.modal.slice(0, 160));
    same('the two sheets of one export agree about the restored record',
        uniq(after.detailSites.filter(Boolean)),
        uniq(named(after.invoiceHeader)));
}

// ---------------------------------------------------------------- 4. the assign sheet
{
    suite('the assign sheet, over a day naming a site the roster cannot find');

    const device = seed(phone(), { archived: true });
    device.State.date = TODAY;
    device.State.layer = 'actual';

    // One worker, one day, three sites: one on the roster, one archived off it, and one
    // the roster has never had. All three are drawn by the same rate rows.
    device.call('applyJournalEntry', device.State.schedule, `days.${TODAY}.actual.w_01`, {
        entries: [
            { placeId: 'p_01' },
            { placeId: 'p_02' },
            { placeId: MISSING, rate: 'extra', extraHours: 3 }
        ],
        rates: { daily: 400, hourly: 50 }
    });
    device.State.save({ silent: true });

    run(device, `sheetWorkerId = 'w_01'; renderAssignSheet();`);
    const body = device.nodes.assignSheetBody;
    const drawn = body.textContent;
    const ariaLabels = attrsUnder(body, 'aria-label');

    given('the sheet actually drew the rate rows for all three sites',
        drawn.indexOf('הרצליה') !== -1 && body.children.length > 0, drawn.slice(0, 200));

    // What every other screen calls that site, over the record - js/ui/day.js:387,
    // js/ui/week.js:153. The assign sheet is drawn over the SAME day, at the same moment.
    const whole = device.call('placeLabelsIn', device.State.schedule);
    const elsewhere = device.call('placeLabelFrom', whole, MISSING);
    given('the day screen has a name for it', elsewhere.indexOf('p_') === -1, elsewhere);

    check('the assign sheet prints no record id',
        drawn.indexOf(MISSING) === -1, drawn.slice(0, 240));
    check('and calls the missing site what every other screen calls it',
        drawn.indexOf(elsewhere) !== -1, `${elsewhere} not in: ${drawn.slice(0, 240)}`);
    check('the extra-hours field says which site its hours belong to',
        ariaLabels.some(label => label.indexOf('שעות נוספות ב') === 0
            && label.length > 'שעות נוספות ב'.length),
        JSON.stringify(ariaLabels));
    check('and that field names no record id either',
        ariaLabels.every(label => label.indexOf(MISSING) === -1), JSON.stringify(ariaLabels));

    // The precise edge of the claim: a site moved to the ARCHIVE is still on the roster,
    // so State.place finds it and its name is drawn. Only a site the roster has lost
    // entirely falls through to the id.
    check('a site moved to the archive is still named, not printed as an id',
        drawn.indexOf('תל אביב') !== -1 && drawn.indexOf('p_02') === -1, drawn.slice(0, 240));

    check('js/ui/sheet.js reads no place name off the roster with the id as its fallback',
        SHEET.indexOf('place ? place.name : entry.placeId') === -1,
        `js/ui/sheet.js:${SHEET.slice(0, SHEET.indexOf('place ? place.name : entry.placeId'))
            .split('\n').length}`);
}

// ---------------------------------------------------------------- the screens that don't cache
{
    suite('the two screens that build their map per render, for contrast');

    const device = seed(phone());
    device.State.date = '2026-08-12';
    device.State.layer = 'actual';

    // Neither file memoises anything: js/ui/day.js:387 and js/ui/week.js:153 call
    // placeLabelsIn(State.schedule) inside the draw, every draw. So a rename that the
    // reports page cannot see is on these two the moment the screen is redrawn.
    run(device, `State.place('p_01').name = 'הרצליה מערב'; State.commitRoster();`);
    const whole = device.call('placeLabelsIn', device.State.schedule);
    check('the day screen and the week grid follow a rename immediately',
        whole.get('p_01') === 'הרצליה מערב', String(whole.get('p_01')));
    check('and neither file holds a map across renders',
        DAY.indexOf('placeLabelsIn(State.schedule)') !== -1
        && WEEK.indexOf('placeLabelsIn(State.schedule)') !== -1
        && DAY.indexOf('LABELS_FOR') === -1 && WEEK.indexOf('LABELS_FOR') === -1);
}

// ---------------------------------------------------------------- the key itself
{
    suite('the memo key, held up against the thing it is a key for');

    const device = seed(phone());
    setRange(device, FROM, TO);
    surfaces(device);
    const start = run(device, 'LABELS_FOR');

    const keyNow = () => run(device,
        `${'`'}\${REPORT_RANGE.from}|\${REPORT_RANGE.to}|\${State.schedule.places.length}|`
        + `\${Object.keys(State.schedule.days || {}).length}${'`'}`);

    given('the key is what reports.js says it is', keyNow() === start, `${keyNow()} vs ${start}`);

    run(device, `State.place('p_01').name = 'שם אחר'; State.commitRoster();`);
    check('a rename moves the key', keyNow() !== start, `${start} -> ${keyNow()}`);

    land(device, '2026-08-12', 'w_01', ALEF);
    device.State.save({ silent: true });
    check('a day changing site moves the key', keyNow() !== start, `${start} -> ${keyNow()}`);

    // A site archived, then unarchived: the collections never change size, and the label
    // for a day at that site changes twice. Named separately because this one needs no
    // sync, no restore and no second phone - it is two taps on the roster screen.
    device.State.place('p_02').active = false;
    device.State.commitRoster();
    check('archiving a site moves the key', keyNow() !== start, `${start} -> ${keyNow()}`);
}

report();
