// P0-E: an invalid advance must not increase payroll.
//
//     node moneyvalid.test.mjs                       from inside the checkout
//     node moneyvalid.test.mjs /path/to/farkad        from anywhere else
//     FARKAD_REPO=/path/to/farkad node moneyvalid.test.mjs
//
// The checkout is found by walking up from this file; the argument and the environment
// variable exist because this suite is meant to be runnable from outside the tree.
//
// The advance FORM refuses anything that is not a whole positive number of shekels -
// js/ui/reports.js:803, `/^\d+$/.test(typed) || amount <= 0`. Nothing else does.
//
//   js/model/schema.js:562   advanceProblems asks only isFiniteNumber(item.amount).
//                            No sign, no zero, no magnitude. -500 is a valid advance.
//   js/model/schema.js:1721  row.netAmount = row.amount - row.advances, so a negative
//                            advance is ADDED to what a man is owed.
//   js/sync/sync.js:3595     receive() never runs advanceProblems at all: the snapshot
//                            is normalised and adopted.
//   js/state.js:660          normaliseSchedule writes `Number(item.amount) || 0`, so a
//                            string becomes money and rubbish becomes zero.
//   js/ui/reports.js:312     the מקדמות column appears only when some row has
//                            advances > 0, so a negative advance is invisible.
//   js/ui/reports.js:1273    moneyCells writes `row.advances > 0 ? -Math.round(...) : 0`,
//                            so the spreadsheet says the advance was 0.
//
// Every value below is driven through the three real doors - importBackup, a restore
// (restoreSnapshot -> replaceEverything), and a cloud snapshot (makeCloud + receive) -
// plus the journal, which is the fourth way a value reaches a schedule. Nothing is
// written into State.schedule by hand except the two places that say CONTROL.
//
// LEDGER_WRITES is not touched and stays false.

import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, parse as parsePath } from 'node:path';
import { makeDom, tableText } from './moneydom.mjs';

// The checkout, found rather than written down: FARKAD_REPO if it is set, otherwise the
// nearest ancestor of THIS file that holds tests/harness.mjs.
// This file's own checkout. An override goes through tests/treecheck.mjs, which binds it
// to a commit - see tests/blobs.test.mjs - rather than being read here.
function findRepo() {
    let at = dirname(fileURLToPath(import.meta.url));
    const stop = parsePath(at).root;
    for (;;) {
        if (existsSync(join(at, 'tests/harness.mjs'))
            && existsSync(join(at, 'js/model/schema.js'))) return at;
        if (at === stop) break;
        at = dirname(at);
    }
    throw new Error('cannot find the farkad checkout - pass it as an argument, '
        + 'or set FARKAD_REPO');
}

const ROOT = findRepo();
const { makeDevice, makeCloud, settle } =
    await import(pathToFileURL(join(ROOT, 'tests/harness.mjs')).href);
const { suite, check, same, given, report } =
    await import(pathToFileURL(join(ROOT, 'tests/runner.mjs')).href);

// reports.js draws site names through js/ui/sitecolor.js, so that file goes in with it.
// Both are classic scripts and both run in the device's own scope.
const REPORTS = readFileSync(join(ROOT, 'js/ui/sitecolor.js'), 'utf8')
    + '\n' + readFileSync(join(ROOT, 'js/ui/reports.js'), 'utf8');
const SHEETJS = process.env.FARKAD_SHEETJS
    || join(ROOT, 'node_modules/xlsx/dist/xlsx.full.min.js');

// ---------------------------------------------------------------- the crew

const FROM = '2026-08-07';
const TO = '2026-08-20';
const DAY = '2026-08-07';           // the day worked, inside the account
// A day the RECEIVING device already had, deliberately OUTSIDE the account being
// reported on, so that the gross in the matrix below is the one worked day at 400 on
// every door and the doors can be compared with each other.
const OWN = '2026-07-30';
const TODAY = '2026-08-20';

// Told apart from `undefined`: a record with no amount field at all is what a JSON file
// carrying undefined actually becomes, and it is a different thing to test.
const MISSING = Symbol('no amount field');
const show = v => (v === MISSING ? 'absent'
    : typeof v === 'string' ? JSON.stringify(v) : String(v));

function crew(options = {}) {
    const device = makeDevice(options);
    device.setToday(TODAY);
    device.ctx.askTell = () => Promise.resolve();
    device.ctx.askConfirm = () => Promise.resolve(true);
    device.State.schedule.workers =
        [{ id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 0 }];
    device.State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
    device.State.save({ silent: true });
    return device;
}

// One ordinary day at 400, through assignPlace and State.commit - the way an evening is
// recorded. The gross is therefore the app's own arithmetic, not a literal on the disk.
function workOneDay(device, date = DAY) {
    device.State.commit(device.call('assignPlace',
        device.State.schedule, date, 'w_01', 'actual', 'p_01'));
}

// A whole, otherwise sound v2 document carrying one worked day and one advance.
function sourceDoc() {
    const source = crew({ deviceId: 'd_src' });
    workOneDay(source);
    return JSON.parse(JSON.stringify(source.State.schedule));
}

// As an object, for the doors that are handed one.
function docWith(value) {
    const document = sourceDoc();
    const advance = { id: 'a_x', workerId: 'w_01', date: DAY, note: '' };
    if (value !== MISSING) advance.amount = value;
    document.advances = { a_x: advance };
    return document;
}

// As TEXT, with the amount spliced in verbatim - so a literal JSON cannot carry (NaN)
// arrives at the door as the bytes a person's file would actually hold, and is refused
// there rather than quietly becoming null on the way.
function docText(jsonLiteral) {
    const document = sourceDoc();
    document.advances = { a_x: { id: 'a_x', workerId: 'w_01', date: DAY, note: '' } };
    return JSON.stringify(document).replace('"note":""', `"amount":${jsonLiteral},"note":""`);
}

const VALUES = [
    { name: '-500', value: -500, json: '-500' },
    { name: '-0.5', value: -0.5, json: '-0.5' },
    { name: '0', value: 0, json: '0' },
    { name: '250.5', value: 250.5, json: '250.5' },
    // 2^53. MAX_SAFE_INTEGER+2 is not itself representable and collapses to this.
    { name: 'MAX_SAFE_INTEGER+2', value: Number.MAX_SAFE_INTEGER + 2, json: '9007199254740992' },
    { name: '1e308', value: 1e308, json: '1e308' },
    { name: 'NaN', value: NaN, json: 'NaN' },
    { name: '"NaN"', value: 'NaN', json: '"NaN"' },
    { name: 'null', value: null, json: 'null' },
    { name: 'undefined', value: MISSING, json: null },
    { name: '"500"', value: '500', json: '"500"' },
    { name: '"-500"', value: '-500', json: '"-500"' },
    { name: '"abc"', value: 'abc', json: '"abc"' },
    { name: '""', value: '', json: '""' }
];

// What the model itself says about each value, asked directly. This is the standard the
// four doors are measured against below.
{
    const judge = crew({ deviceId: 'd_judge' });
    VALUES.forEach(entry => {
        const advance = { id: 'a_x', workerId: 'w_01', date: DAY, note: '' };
        if (entry.value !== MISSING) advance.amount = entry.value;
        entry.modelProblems = judge.call('advanceProblems', { advances: { a_x: advance } }, null);
        entry.modelRefuses = entry.modelProblems.length > 0;
        entry.gateProblems = judge.call('journalEntryProblems', 'advances.a_x', advance);
    });
}

// What a device is holding after a door has been used.
function observe(device) {
    const advances = device.State.schedule.advances || {};
    const has = Object.prototype.hasOwnProperty.call(advances, 'a_x');
    const stored = has
        ? (Object.prototype.hasOwnProperty.call(advances.a_x, 'amount')
            ? advances.a_x.amount : MISSING)
        : MISSING;
    const row = device.call('payrollReport', device.State.schedule, FROM, TO)
        .find(r => r.workerId === 'w_01') || {};
    return {
        present: has,
        stored,
        storedType: stored === MISSING ? 'absent' : typeof stored,
        gross: row.amount === undefined ? null : row.amount,
        advances: row.advances === undefined ? null : row.advances,
        net: row.netAmount === undefined ? null : row.netAmount,
        quarantined: device.global('Recovery').problems.map(p => p.key),
        keptOwnDay: Boolean((device.State.schedule.days || {})[OWN])
    };
}

// ---------------------------------------------------------------- door 1: importBackup
//
// js/ui/share.js:1556. readBackupFile -> readReplacementDocument -> fullScheduleProblems
// -> advanceProblems, on the RAW file, before anything is replaced.

async function viaImport(entry) {
    const target = crew({ deviceId: 'd_import' });
    workOneDay(target, OWN);
    const told = [];
    target.ctx.askTell = message => { told.push(message); return Promise.resolve(); };

    const text = entry.json === null ? JSON.stringify(docWith(MISSING)) : docText(entry.json);
    target.call('importBackup', target.fileEvent('farkad-2026-08-20.json', text));
    await settle(160);

    const after = observe(target);
    return { after, accepted: after.present, told: told.length, target };
}

// ---------------------------------------------------------------- door 2: a restore
//
// The real door: a snapshot on the disk, restoreSnapshot() (js/ui/share.js:453) ->
// acceptRestoreText -> readReplacementDocument -> FarkadSync.replaceEverything, which
// checks it a second time (js/sync/sync.js:3211).

async function viaRestore(entry) {
    const target = crew({ deviceId: 'd_restore' });
    workOneDay(target, OWN);
    const told = [];
    target.ctx.askTell = message => { told.push(message); return Promise.resolve(); };

    const text = entry.json === null ? JSON.stringify(docWith(MISSING)) : docText(entry.json);
    target.Store.set('scheduleData:snap:2026-08-18', text);
    await target.call('restoreSnapshot', '2026-08-18');
    await settle(140);

    const after = observe(target);
    return { after, accepted: after.present, told: told.length, target };
}

// ---------------------------------------------------------------- door 3: a cloud snapshot
//
// Another phone wrote the document; this one subscribes and receives it.

async function viaCloud(entry) {
    const document = docWith(entry.value);
    document.updatedAt = '2026-08-20T05:00:00.000Z';
    document.updatedBy = 'd_other_phone';
    const cloud = makeCloud({ doc: document });

    const target = crew({ deviceId: 'd_cloud' });
    workOneDay(target, OWN);
    target.Sync.pushDelayMs = 6;
    target.Sync.connect(cloud.adapter);
    await settle(220);

    const after = observe(target);
    const item = (cloud.doc.advances || {}).a_x;
    return {
        after,
        accepted: after.present,
        status: target.Sync.status,
        told: target.Sync.status === 'error' ? 1 : 0,
        // What the FAKE could carry: the harness deep-clones through JSON, exactly as
        // the wire does, so a value JSON cannot hold is reported as what it became.
        carried: item
            ? (Object.prototype.hasOwnProperty.call(item, 'amount') ? item.amount : MISSING)
            : MISSING,
        target
    };
}

// ---------------------------------------------------------------- door 4: the journal
//
// One (path, value) entry, committed the way an edit is, then the app is closed and
// opened. The queue is read back through journalEntryProblems (js/sync/sync.js:906) and
// replayed through applyJournalEntry (js/sync/sync.js:3990).

async function viaJournal(entry) {
    const target = crew({ deviceId: 'd_journal' });
    workOneDay(target, DAY);        // the same 400 the other three doors bring with them
    workOneDay(target, OWN);        // and a day outside the account, to see it survive

    const advance = { id: 'a_x', workerId: 'w_01', date: DAY, note: '' };
    if (entry.value !== MISSING) advance.amount = entry.value;
    const committed = target.State.commit({ path: 'advances.a_x', value: advance });
    const queuedHere = target.Sync.pendingPaths().indexOf('advances.a_x') !== -1;

    // The reopen: a new V8 context on the same bytes, replaying its own journal.
    const again = makeDevice({ storage: target.dump(), deviceId: 'd_journal' });
    again.setToday(TODAY);
    again.State.load();

    const after = observe(again);
    return {
        after, committed, queuedHere,
        accepted: after.present,
        queuedAfter: again.Sync.pendingPaths().indexOf('advances.a_x') !== -1,
        told: 0,
        target: again
    };
}

// ---------------------------------------------------------------- the matrix

const DOORS = ['import', 'restore', 'cloud', 'journal'];
const RUN = { import: viaImport, restore: viaRestore, cloud: viaCloud, journal: viaJournal };

const MATRIX = [];
for (const entry of VALUES) {
    const row = { entry, name: entry.name };
    for (const door of DOORS) row[door] = await RUN[door](entry);
    MATRIX.push(row);
}

suite('the matrix: fourteen values, four doors, what each one did with them');

const cell = door => (door.accepted
    ? `${show(door.after.stored)} -> net ${show(door.after.net)}`
    : 'refused');

console.log('  value                model      import                     '
    + 'restore                    cloud                      journal');
MATRIX.forEach(row => {
    console.log('  ' + row.name.padEnd(20)
        + (row.entry.modelRefuses ? 'refuses  ' : 'accepts  ').padEnd(11)
        + DOORS.map(door => cell(row[door]).padEnd(27)).join(''));
});
check('the matrix ran every value through every door',
    MATRIX.length === VALUES.length
    && MATRIX.every(row => DOORS.every(door => row[door] && row[door].after)),
    `${MATRIX.length} values`);

// ---------------------------------------------------------------- 1

suite('1. payroll must never INCREASE because an advance is negative');

const CONTROL = (() => {
    const device = crew({ deviceId: 'd_control' });
    workOneDay(device);
    return observe(device);
})();
given('the control: one day at 400, no advance, 400 owed',
    CONTROL.gross === 400 && CONTROL.advances === 0 && CONTROL.net === 400,
    JSON.stringify([CONTROL.gross, CONTROL.advances, CONTROL.net]));

DOORS.forEach(door => {
    MATRIX.filter(row => row[door].accepted).forEach(row => {
        const seen = row[door].after;
        check(`${door}: ${row.name} does not make him owed MORE than he earned`,
            !(typeof seen.net === 'number' && typeof seen.gross === 'number'
                && seen.net > seen.gross),
            `gross ${show(seen.gross)}, advance ${show(seen.advances)}, net ${show(seen.net)}`);
    });
});

// The headline, stated on its own so it cannot hide inside the loop above.
{
    const negative = MATRIX.find(row => row.name === '-500');
    DOORS.forEach(door => {
        const seen = negative[door].after;
        check(`${door}: a -500 advance is refused, or leaves the 400 at 400`,
            !negative[door].accepted || seen.net === 400,
            `net ${show(seen.net)} (gross ${show(seen.gross)}, advances ${show(seen.advances)})`);
    });
}


// A worker whose only record in the account is a negative advance. The model says he is
// owed 500 he never earned; payrollRows() keeps a row alive only when advances > 0
// (js/ui/reports.js:262), so the pay sheet does not list him at all.
{
    const device = crew({ deviceId: 'd_negative_only' });
    await adoptAdvance(device, -500);
    const row = device.call('payrollReport', device.State.schedule, FROM, TO)
        .find(r => r.workerId === 'w_01');
    withDom(device);
    const listed = device.run('payrollRows().length');
    check('a man whose only record is a negative advance is not quietly owed money',
        row.netAmount === 0, `the model says he is owed ${show(row.netAmount)}`);
    check('and if he is, the pay sheet at least has a row for him',
        row.netAmount === 0 || listed > 0,
        `payrollReport says ${show(row.netAmount)}, payrollRows() lists ${listed} rows`);
}

// ---------------------------------------------------------------- 2

suite('2. a rejected input leaves the schedule, the queue and the cloud unchanged');

// "Rejected" is measured against the model's own gate: advanceProblems. A value it
// refuses must not reach a schedule through ANY door, and the device must still be
// holding what it held.
MATRIX.filter(row => row.entry.modelRefuses).forEach(row => {
    DOORS.forEach(door => {
        check(`${door}: ${row.name} is refused, and this device keeps its own day`,
            !row[door].accepted && row[door].after.keptOwnDay,
            `accepted=${row[door].accepted} stored=${show(row[door].after.stored)} `
            + `keptOwnDay=${row[door].after.keptOwnDay}`);
    });
    check(`journal: ${row.name} does not sit in the queue waiting to be sent`,
        !row.journal.queuedAfter, `queued=${row.journal.queuedAfter}`);
});

// And the person is told. A refusal in silence looks exactly like a tap that did not
// register - the app's own rule, js/state.js:335.
MATRIX.filter(row => row.entry.modelRefuses).forEach(row => {
    ['import', 'restore', 'cloud'].forEach(door => {
        check(`${door}: ${row.name} is refused OUT LOUD`, row[door].told > 0,
            `notices=${row[door].told}`);
    });
});

// ---------------------------------------------------------------- 3

suite('3. raw invalid bytes are preserved, never guessed at or normalised into money');

MATRIX.filter(row => row.entry.modelRefuses).forEach(row => {
    DOORS.forEach(door => {
        const seen = row[door].after;
        check(`${door}: ${row.name} is not turned into a number this app pays on`,
            !seen.present || typeof seen.stored !== 'number',
            `stored ${show(seen.stored)} (${seen.storedType}), `
            + `payroll advances ${show(seen.advances)}`);
    });
    check(`${row.name}: the unreadable record was quarantined, not overwritten`,
        DOORS.every(door => !row[door].accepted) || row.cloud.after.quarantined.length > 0,
        `quarantined ${JSON.stringify(row.cloud.after.quarantined)}`);
});

// ---------------------------------------------------------------- 4

suite('4. zero is handled explicitly and consistently');

{
    const zero = MATRIX.find(row => row.name === '0');
    // The form refuses it: js/ui/reports.js:803, `amount <= 0`.
    check('the four doors agree with the advance form about a zero advance',
        DOORS.every(door => !zero[door].accepted),
        DOORS.map(door => `${door}=${zero[door].accepted ? 'took it' : 'refused'}`).join(' '));
    // And once it IS on the disk, the surfaces must agree about whether it exists.
    const device = crew({ deviceId: 'd_zero_view' });
    workOneDay(device);
    await adoptAdvance(device, 0);
    const seen = surfaces(device);
    console.log(`    zero advance: sheet column=${seen.screen.hasAdvanceColumn}, `
        + `modal rows=${seen.modal.advanceRows.length}, `
        + `statement line=${JSON.stringify(plain(seen.statementAdvance))}, `
        + `export cell=${seen.sheet[8]}`);
    check('a zero advance is either shown everywhere or nowhere',
        seen.screen.hasAdvanceColumn === (seen.modal.advanceRows.length > 0),
        `pay sheet column=${seen.screen.hasAdvanceColumn}, `
        + `modal advance rows=${seen.modal.advanceRows.length}`);
    check('and the message the worker receives does not mention one either',
        (seen.statementAdvance !== '') === seen.screen.hasAdvanceColumn,
        `statement=${JSON.stringify(plain(seen.statementAdvance))}, `
        + `column=${seen.screen.hasAdvanceColumn}`);
}

// ---------------------------------------------------------------- the surfaces
//
// js/ui/reports.js is a classic script like the rest of the app, so it is loaded into the
// device's own scope and its functions are called there. A DOM that actually holds text
// goes in first, because the question here is what the SCREEN says.

function withDom(device) {
    if (device.__realDocument) return device.dom;
    device.__realDocument = device.ctx.document;
    const dom = makeDom();
    ['workerDaysTitle', 'workerDaysMeta', 'workerDaysBody', 'workerDaysModal', 'reportsView']
        .forEach(id => dom.register(id));
    device.ctx.document = dom;
    device.dom = dom;
    if (!device.ctx.__reportsLoaded) {
        vm.runInContext(REPORTS, device.ctx, { filename: 'harness:reports' });
        device.ctx.__reportsLoaded = true;
    }
    device.run = code => vm.runInContext(code, device.ctx, { filename: 'harness:reports' });
    device.run(`REPORT_RANGE.from='${FROM}'; REPORT_RANGE.to='${TO}';`
        + `REPORT_SECTION='workers'; INVOICE_PLACE=null;`);
    return dom;
}

function withoutDom(device) {
    if (!device.__realDocument) return;
    device.ctx.document = device.__realDocument;
    device.__realDocument = null;
}

// A cloud snapshot carrying one advance, adopted by a device that is already running.
// The wire is the door; nothing here writes State.schedule.
async function adoptAdvance(device, value) {
    const document = JSON.parse(JSON.stringify(device.State.schedule));
    document.updatedAt = '2026-08-20T06:00:00.000Z';
    document.updatedBy = 'd_other_phone';
    document.advances = {
        a_x: { id: 'a_x', workerId: 'w_01', date: DAY, amount: value, note: '' }
    };
    const cloud = makeCloud({ doc: document });
    device.Sync.pushDelayMs = 6;
    device.Sync.connect(cloud.adapter);
    await settle(220);
    return cloud;
}

// The bidi marks the app pins its minus signs with, taken back off so a number can be
// compared with a number. U+200E, U+2066..U+2069.
function plain(text) { return String(text).replace(/[\u200e\u2066\u2067\u2068\u2069]/g, ''); }
function num(text) { return Number(plain(text)); }

// Every surface's answer to one record, side by side.
function surfaces(device) {
    withDom(device);
    const row = device.call('payrollReport', device.State.schedule, FROM, TO)
        .find(r => r.workerId === 'w_01');

    const section = device.run('renderPayrollTable()');
    const table = tableText(section);
    const headers = table ? table.head[0] : [];
    const body = table && table.body[0] ? table.body[0] : [];
    const foot = table && table.foot[0] ? table.foot[0] : [];
    const at = heading => headers.indexOf(heading);

    device.run(`openWorkerDays('w_01')`);
    const modalBody = device.dom.getElementById('workerDaysBody');
    const netRow = modalBody.querySelectorAll('.wday-net')[0];
    const advanceRows = modalBody.querySelectorAll('.wday-advance').map(n => n.textContent);

    const statement = String(device.run(`workerStatementText('w_01')`));
    const lines = statement.split('\n');
    const sheet = JSON.parse(JSON.stringify(device.run('payrollSheetRows()')));

    return {
        model: { gross: row.amount, advances: row.advances, net: row.netAmount },
        screen: {
            headers,
            hasAdvanceColumn: at('מקדמות') !== -1,
            gross: at('נצבר') === -1 ? null : body[at('נצבר')],
            advance: at('מקדמות') === -1 ? null : body[at('מקדמות')],
            net: at('לתשלום') === -1 ? null : body[at('לתשלום')],
            footer: foot
        },
        modal: {
            net: netRow ? netRow.querySelectorAll('.wday-money')[0].textContent : null,
            summary: netRow ? netRow.querySelectorAll('.wday-what')[0].textContent : null,
            advanceRows
        },
        statement,
        statementNet: (lines.find(l => l.startsWith('נותר לתשלום:')) || '')
            .replace('נותר לתשלום: ', ''),
        statementGross: (lines.find(l => l.startsWith('נצבר:')) || '').replace('נצבר: ', ''),
        statementAdvance: lines.find(l => l.startsWith('מקדמה')) || '',
        sheetHead: sheet[0],
        sheet: sheet[1] || null
    };
}

// The CSV the button actually writes when SheetJS never arrives - which on a building
// site is the ordinary Tuesday, and is why the fallback exists.
async function csvOf(device) {
    withDom(device);
    device.dom.head.appendChild = tag => { tag.onerror(); };
    const before = device.downloads.length;
    device.ctx.__told = [];
    device.ctx.askTell = m => { device.ctx.__told.push(m); };
    // The anchor the download is pressed through lives on the real document, which knows
    // how to record the bytes; only the script tag is wanted on the rich one.
    const rich = device.ctx.document;
    device.ctx.document = Object.create(device.__realDocument);
    device.ctx.document.head = rich.head;
    try {
        await device.run('exportReports()');
        await settle(80);
    } finally {
        device.ctx.document = rich;
    }
    const payroll = device.downloads.slice(before).find(f => f.name.startsWith('שכר'));
    return payroll ? payroll.text.replace(/^﻿/, '').split('\r\n') : null;
}

// ---------------------------------------------------------------- 5

suite('5. every surface says the same thing about one record - gross 400, advance 250.5');

const HALF = await (async () => {
    const device = crew({ deviceId: 'd_half' });
    workOneDay(device);
    await adoptAdvance(device, 250.5);
    given('the half-shekel advance came off the wire and is on the disk',
        JSON.parse(device.raw('scheduleData:v2')).advances.a_x.amount === 250.5,
        String((JSON.parse(device.raw('scheduleData:v2')).advances.a_x || {}).amount));
    const seen = surfaces(device);
    const csv = await csvOf(device);
    return { device, seen, csv };
})();

{
    const { seen, csv } = HALF;
    console.log('\n  gross 400, advance 250.5 - each surface, in its own words:');
    console.log(`    model   payrollReport      gross ${show(seen.model.gross)}  advance `
        + `${show(seen.model.advances)}  net ${show(seen.model.net)}`);
    console.log(`    screen  renderPayrollTable gross ${plain(seen.screen.gross)}  advance `
        + `${plain(seen.screen.advance)}  net ${plain(seen.screen.net)}`);
    console.log(`    modal   openWorkerDays     ${plain(seen.modal.net)}   `
        + `(${plain(seen.modal.summary)})  advance row ${JSON.stringify(seen.modal.advanceRows.map(plain))}`);
    console.log(`    whatsapp workerStatement   gross ${seen.statementGross}  net `
        + `${plain(seen.statementNet)}  (${plain(seen.statementAdvance)})`);
    console.log(`    sheet   payrollSheetRows   ${JSON.stringify(seen.sheet)}`);
    console.log(`    csv     exportReports      ${csv ? csv[1] : 'none'}`);

    check('the screen and the model agree on the net',
        num(seen.screen.net) === seen.model.net,
        `screen ${plain(seen.screen.net)}, model ${seen.model.net}`);
    check('the worker modal and the model agree on the net',
        num(seen.modal.net) === seen.model.net,
        `modal ${plain(seen.modal.net)}, model ${seen.model.net}`);
    check('the message the worker receives agrees with the model',
        num(seen.statementNet) === seen.model.net,
        `whatsapp ${plain(seen.statementNet)}, model ${seen.model.net}`);
    check('the spreadsheet row agrees with the model',
        seen.sheet[9] === seen.model.net,
        `sheet ${seen.sheet[9]}, model ${seen.model.net}`);
    check('the screen and the spreadsheet agree with EACH OTHER',
        num(seen.screen.net) === seen.sheet[9],
        `screen ${plain(seen.screen.net)}, sheet ${seen.sheet[9]}`);
    check('the CSV carries the same net as the screen',
        Boolean(csv) && csv[1].split(',').map(c => plain(c.replace(/"/g, '')))
            .indexOf(String(num(seen.screen.net))) !== -1,
        csv ? csv[1] : 'no csv');
    check('the advance the worker is shown is the advance the record holds',
        Math.abs(num(seen.statementAdvance.split(': ')[1])) === seen.model.advances,
        `${plain(seen.statementAdvance)} against ${seen.model.advances}`);
}

// ---------------------------------------------------------------- 6

suite('6. each surface rounds gross, advance and net on its own');

{
    const { seen } = HALF;
    const screenGross = num(seen.screen.gross);
    const screenAdvance = Math.abs(num(seen.screen.advance));
    const screenNet = num(seen.screen.net);
    check('the screen\'s own three money columns reconcile: נצבר − מקדמות = לתשלום',
        screenGross - screenAdvance === screenNet,
        `${screenGross} − ${screenAdvance} = ${screenGross - screenAdvance}, `
        + `the column beside them says ${screenNet} (out by `
        + `${screenNet - (screenGross - screenAdvance)})`);

    const foot = seen.screen.footer;
    check('and the totals band under them reconciles too',
        foot.length > 0 && num(foot[foot.length - 3]) - Math.abs(num(foot[foot.length - 2]))
            === num(foot[foot.length - 1]),
        JSON.stringify(foot.map(plain)));

    check('the modal\'s "X נצבר · Y מקדמות" explains the number printed beside it',
        num(seen.modal.summary.split(' ')[0]) - num(seen.modal.summary.split('·')[1].trim().split(' ')[0])
            === num(seen.modal.net),
        `${plain(seen.modal.summary)} -> ${plain(seen.modal.net)}`);

    check('the exact shekels survive to at least one output surface',
        [num(seen.screen.net), num(seen.modal.net), num(seen.statementNet), seen.sheet[9]]
            .some(value => value === 149.5),
        JSON.stringify([num(seen.screen.net), num(seen.modal.net),
            num(seen.statementNet), seen.sheet[9]]));
}

// ---------------------------------------------------------------- 5b, through a real .xlsx

suite('5b. the same record, read back out of a real .xlsx');

{
    given(`SheetJS is installed (${SHEETJS} - npm ci, or set FARKAD_SHEETJS)`,
        existsSync(SHEETJS));
    const device = crew({ deviceId: 'd_half_xlsx' });
    workOneDay(device);
    await adoptAdvance(device, 250.5);
    const book = await workbookFrom(device);

    const heads = book.sheets['שכר'].values[0];
    const values = book.sheets['שכר'].values[1];
    const GROSS = heads.indexOf('נצבר');
    const ADV = heads.indexOf('מקדמות');
    const NET = heads.indexOf('לתשלום');
    console.log(`    xlsx    שכר, row one       ${JSON.stringify(values)}`);

    check('the workbook the bookkeeper opens carries the model\'s net',
        values[NET] === 149.5, `the file says ${values[NET]}, the model says 149.5`);
    check('and the advance the record actually holds',
        Math.abs(values[ADV]) === 250.5,
        `the file says ${values[ADV]}, the record holds 250.5`);
    check('the workbook and the screen agree',
        values[NET] === num(HALF.seen.screen.net),
        `xlsx ${values[NET]}, screen ${plain(HALF.seen.screen.net)}`);
    check('gross less advance is the net, inside the file itself',
        values[GROSS] + values[ADV] === values[NET],
        `${values[GROSS]} + (${values[ADV]}) = ${values[GROSS] + values[ADV]}, `
        + `the file says ${values[NET]}`);
}


// ---------------------------------------------------------------- the surface matrix
//
// Every value that reaches a schedule through ANY door, put to every surface at once.
// Driven through the cloud, which is the door that accepts the most; the stored amount
// is named beside each row so the two tables can be read together. payrollSheetRows() is
// what both the CSV and the .xlsx are built from - proved identical for 250.5 and -500
// in the two suites above - so it stands for both here.

suite('the surface matrix: what each output says about the same stored amount');

console.log('  stored           model      screen(gross/adv/net)   modal   whatsapp  '
    + 'sheet(gross/adv/net)   column shown');
for (const entry of VALUES) {
    const taken = DOORS.map(door => MATRIX.find(r => r.name === entry.name)[door])
        .find(door => door.accepted);
    if (!taken) { console.log(`  ${entry.name.padEnd(16)} refused by every door`); continue; }

    const device = crew({ deviceId: `d_surface_${VALUES.indexOf(entry)}` });
    workOneDay(device);
    await adoptAdvance(device, taken.after.stored);
    const seen = surfaces(device);
    console.log('  ' + `${entry.name} (${show(taken.after.stored)})`.padEnd(16)
        + String(show(seen.model.net)).padEnd(11)
        + `${plain(seen.screen.gross)}/${seen.screen.advance === null ? '-' : plain(seen.screen.advance)}/${plain(seen.screen.net)}`.padEnd(24)
        + String(plain(seen.modal.net)).padEnd(8)
        + String(plain(seen.statementNet)).padEnd(10)
        + `${seen.sheet[7]}/${seen.sheet[8]}/${seen.sheet[9]}`.padEnd(23)
        + String(seen.screen.hasAdvanceColumn));
}
check('the surface matrix ran', true);

// ---------------------------------------------------------------- the reported defect

suite('the reported defect, end to end: gross 400, advance -500');

{
    const device = crew({ deviceId: 'd_negative' });
    workOneDay(device);
    await adoptAdvance(device, -500);
    const seen = surfaces(device);
    const csv = await csvOf(device);
    const book = await workbookFrom(device);
    const heads = book.sheets['שכר'].values[0];
    const values = book.sheets['שכר'].values[1];

    console.log('\n  gross 400, advance -500 - each surface, in its own words:');
    console.log(`    model   payrollReport      gross ${show(seen.model.gross)}  advance `
        + `${show(seen.model.advances)}  net ${show(seen.model.net)}`);
    console.log(`    screen  headers            ${JSON.stringify(seen.screen.headers)}`);
    console.log(`    screen  row                gross ${plain(seen.screen.gross)}  advance `
        + `${seen.screen.advance === null ? 'NO COLUMN' : plain(seen.screen.advance)}  net `
        + `${plain(seen.screen.net)}`);
    console.log(`    modal   openWorkerDays     ${plain(seen.modal.net)}   `
        + `(${plain(seen.modal.summary)})`);
    console.log(`    modal   advance row        ${JSON.stringify(seen.modal.advanceRows.map(plain))}`);
    console.log(`    whatsapp workerStatement   net ${plain(seen.statementNet)}  advance line `
        + `${JSON.stringify(plain(seen.statementAdvance))}`);
    console.log(`    sheet   payrollSheetRows   ${JSON.stringify(seen.sheet)}`);
    console.log(`    csv     exportReports      ${csv ? csv[1] : 'none'}`);
    console.log(`    xlsx    שכר, row one       ${JSON.stringify(values)}`);

    check('payroll did not increase: a man who earned 400 is not owed more than 400',
        seen.model.net <= seen.model.gross,
        `gross ${seen.model.gross}, net ${seen.model.net}`);
    check('the screen shows the advance that changed the net',
        seen.screen.hasAdvanceColumn, `headers ${JSON.stringify(seen.screen.headers)}`);
    check('the spreadsheet carries the advance the model deducted',
        seen.sheet[8] === -seen.model.advances,
        `sheet ${seen.sheet[8]}, model deducted ${seen.model.advances}`);
    check('the spreadsheet net and the screen net are one number',
        seen.sheet[9] === num(seen.screen.net),
        `sheet ${seen.sheet[9]}, screen ${plain(seen.screen.net)}`);
    check('the .xlsx net and the screen net are one number',
        values[heads.indexOf('לתשלום')] === num(seen.screen.net),
        `xlsx ${values[heads.indexOf('לתשלום')]}, screen ${plain(seen.screen.net)}`);
    check('the message the worker receives shows one minus sign, not two',
        !plain(seen.statementAdvance).includes('--'),
        JSON.stringify(plain(seen.statementAdvance)));
    check('the modal shows one minus sign, not two',
        !seen.modal.advanceRows.some(text => plain(text).includes('--')),
        JSON.stringify(seen.modal.advanceRows.map(plain)));
}

// ---------------------------------------------------------------- the .xlsx reader
//
// Lifted from tests/xlsx.test.mjs: a zip reader and an XML reader that have never heard
// of SheetJS, so the file is read the way a spreadsheet reads it and not the way the
// library that wrote it would.

function unzip(buf) {
    let eocd = -1;
    for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i -= 1) {
        if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('not a zip: no end-of-central-directory record');
    const count = buf.readUInt16LE(eocd + 10);
    let at = buf.readUInt32LE(eocd + 16);
    const parts = {};
    for (let n = 0; n < count; n += 1) {
        const method = buf.readUInt16LE(at + 10);
        const compressed = buf.readUInt32LE(at + 20);
        const nameLen = buf.readUInt16LE(at + 28);
        const extraLen = buf.readUInt16LE(at + 30);
        const commentLen = buf.readUInt16LE(at + 32);
        const localAt = buf.readUInt32LE(at + 42);
        const name = buf.toString('utf8', at + 46, at + 46 + nameLen);
        const start = localAt + 30 + buf.readUInt16LE(localAt + 26)
            + buf.readUInt16LE(localAt + 28);
        const raw = buf.subarray(start, start + compressed);
        parts[name] = method === 0 ? Buffer.from(raw) : inflateRawSync(raw);
        at += 46 + nameLen + extraLen + commentLen;
    }
    return parts;
}

// Declarations, not const arrows: they are used by the suites above, which run first.
function attr(tag, name) {
    const found = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
    return found ? found[1] : null;
}
function tags(xml, name) {
    return xml.match(new RegExp(`<${name}(?:\\s[^>]*)?/?>`, 'g')) || [];
}
function unescapeXml(text) {
    return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function sharedStrings(xml) {
    if (!xml) return [];
    return (xml.match(/<si>[\s\S]*?<\/si>|<si\/>/g) || []).map(si =>
        (si.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g) || [])
            .map(t => unescapeXml(t.replace(/^<t(?:\s[^>]*)?>/, '').replace(/<\/t>$/, '')))
            .join(''));
}

function sheetOf(xml, strings) {
    const values = [];
    (xml.match(/<row[\s\S]*?<\/row>|<row[^>]*\/>/g) || []).forEach(rowXml => {
        const row = [];
        (rowXml.match(/<c[\s\S]*?<\/c>|<c[^>]*\/>/g) || []).forEach(cellXml => {
            const open = /^<c[^>]*>/.exec(cellXml)[0];
            const letters = /^([A-Z]+)/.exec(attr(open, 'r') || '');
            let index = row.length;
            if (letters) {
                index = 0;
                for (const ch of letters[1]) index = index * 26 + (ch.charCodeAt(0) - 64);
                index -= 1;
            }
            const type = attr(open, 't');
            let text = '';
            if (type === 'inlineStr') {
                const found = /<is>[\s\S]*?<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/.exec(cellXml);
                text = found ? unescapeXml(found[1]) : '';
            } else {
                const found = /<v>([\s\S]*?)<\/v>/.exec(cellXml);
                const raw = found ? unescapeXml(found[1]) : '';
                text = type === 's' ? (strings[Number(raw)] || '') : raw;
            }
            while (row.length < index) row.push('');
            row[index] = type ? text : Number(text);
        });
        values.push(row);
    });
    return { values };
}

function workbookOf(bytes) {
    const parts = unzip(bytes);
    const rels = {};
    tags(parts['xl/_rels/workbook.xml.rels'].toString('utf8'), 'Relationship')
        .forEach(rel => { rels[attr(rel, 'Id')] = attr(rel, 'Target'); });
    const strings = sharedStrings(parts['xl/sharedStrings.xml']
        && parts['xl/sharedStrings.xml'].toString('utf8'));
    const sheets = {};
    tags(parts['xl/workbook.xml'].toString('utf8'), 'sheet').forEach(tag => {
        const name = unescapeXml(attr(tag, 'name'));
        const part = 'xl/' + String(rels[attr(tag, 'r:id')]).replace(/^\/?xl\//, '');
        sheets[name] = sheetOf(parts[part].toString('utf8'), strings);
    });
    return { bytes, parts, sheets };
}

// The app's own exportReports(), against a real SheetJS, with only the last inch - the
// write to a disk - redirected so the bytes can be caught.
async function workbookFrom(device) {
    withDom(device);
    if (!device.ctx.__sheetjs) {
        vm.runInContext(readFileSync(SHEETJS, 'utf8'), device.ctx,
            { filename: 'xlsx.full.min.js' });
        device.ctx.__caught = [];
        device.run(`XLSX.writeFile = function (wb, filename) {
            __caught.push({ filename: filename,
                bytes: XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) });
        };`);
        device.ctx.__sheetjs = true;
    }
    device.ctx.__caught.length = 0;
    await device.run('exportReports()');
    await settle(40);
    given('exportReports wrote exactly one workbook',
        device.ctx.__caught.length === 1, String(device.ctx.__caught.length));
    return workbookOf(Buffer.from(device.ctx.__caught[0].bytes));
}

report();
