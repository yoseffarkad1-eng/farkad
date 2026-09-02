// The vehicles, retired.
//
//   node tests/vehicles.test.mjs
//
// The owner cancelled the feature. FARKAD_FLAGS in js/model/schema.js says so, and the
// shape it had is the reason it could not simply be left running: an evening with nothing
// said about vehicles meant they all went out, so one ordinary Tuesday added three hundred
// shekels to somebody's pay by itself. A retired feature that still moves money is not
// retired.
//
// What a retirement must be, and what every check below is one of: nothing is drawn, so
// nobody can reach a vehicle from a screen; nothing is computed, on any day, including
// the ordinary day that had the default; nothing is written, by any path, because a rate
// stamped today is money the moment anybody reconsiders; and NOTHING IS LOST - every
// stored vehicle byte survives load, save, sync, backup, recovery and restore, because
// the records are somebody's, not this build's.
//
// The last suite runs the same app with the gate OPEN. A gate that rots while it is shut
// is not a gate, and if the arithmetic underneath has quietly died then this was a
// deletion wearing a flag.
//
// FOUR CHECKS HERE ARE RED, deliberately, and each one names a defect that is live at
// this commit. They are listed at the bottom of this comment so a reader does not have to
// discover them from a failing run:
//   R1  renameVehicle writes a vehicle record with the feature off
//   R2  changeVehicleRate stamps a new rate with the feature off
//   R3  toggleVehicleActive archives a vehicle with the feature off
//   R4  with the gate OPEN, the day control's own edit quarantines the outbox batch
//       (setVehicleOut returns a three-segment day path; journalEntryProblems requires
//       four, so the one control the feature has damages the queue on first use)

import { makeDevice, makeCloud, settle } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import { makeNode } from './nodes.mjs';

const TICK = 6;
const SYNCED = () => settle(TICK * 40);

// ---------------------------------------------------------------- the fixture
//
// Deliberately awkward, because "the records survive" is a claim about the records out
// there and not about the tidy one this file would write: fields no build in this repo
// has heard of, a rate entry with no date it applies from, an archived vehicle, an order
// somebody chose, and an evening that names one of them as having stayed in the yard.
function fixtureVehicles() {
    return [
        { id: 'v_01', name: 'טנדר לבן', ownerId: 'w_01', active: true,
            plate: '12-345-67', note: { by: 'd_old', text: 'שייך לאבא' },
            rates: [{ from: '2026-06-01', amount: 250 },
                { from: '2026-08-01', amount: 300, by: 'd_old' }] },
        { id: 'v_02', name: 'טרנזיט', ownerId: 'w_02', active: false,
            rates: [{ amount: 400 }, { from: '2026-07-01', amount: 350 }] },
        { id: 'v_03', name: 'מיניבוס', ownerId: 'w_02', active: true,
            rates: [{ from: '2026-08-01', amount: 300 }] }
    ];
}

const FIXTURE_JSON = JSON.stringify(fixtureVehicles());

function seed(device) {
    device.State.schedule.workers = [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 },
        { id: 'w_02', name: 'שרה', active: true, dailyRate: 350, hourlyRate: 0 }
    ];
    device.State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
    device.State.save({ silent: true });
}

// A phone holding the fixture, one worked day, and an evening that names a vehicle off.
// The day is committed the way the app commits one - through the model and State - so the
// journal and the queue see it; the vehiclesOff mark is put on the record directly,
// because with the feature off there is no path in the app that would write one, and that
// is exactly the record this build has to go on carrying.
function loaded(options = {}) {
    const device = makeDevice(options);
    seed(device);
    device.setToday('2026-08-29');
    device.State.schedule.vehicles = fixtureVehicles();
    device.State.save({ silent: true });
    device.State.commit(device.call('assignPlace',
        device.State.schedule, '2026-08-12', 'w_01', 'actual', 'p_01'));
    device.State.commit(device.call('assignPlace',
        device.State.schedule, '2026-08-13', 'w_01', 'actual', 'p_01'));
    device.State.schedule.days['2026-08-12'].vehiclesOff = ['v_02'];
    device.State.save({ silent: true });
    stubDialogs(device);
    return device;
}

// The app's own dialogs, answered. Every one of these returns the ANSWER a person would
// give - a new name, a new price, yes - so a writer that is meant to be shut cannot pass
// this test by being cancelled at the prompt instead of at the gate.
function stubDialogs(device) {
    device.ctx.askText = async () => 'טנדר אחר';
    device.ctx.askAmount = async () => 999;
    device.ctx.askConfirm = async () => true;
    device.ctx.askChoice = async () => 'דוד';
    device.ctx.askTell = () => {};
}

const vehiclesOf = device => JSON.stringify(device.State.schedule.vehicles);
const offOn = (device, date) =>
    JSON.stringify((device.State.schedule.days[date] || {}).vehiclesOff);

// ---------------------------------------------------------------- a screen, in Node
//
// Enough DOM to run the app's real render functions and read what they built. Not a
// browser: the browser suites measure pixels, and what is asked here is whether a column,
// a tray or a panel exists at all - a question about the nodes the production function
// appends, and those it builds anywhere.
// The DOM stub lives in tests/nodes.mjs now - see the note at the top of it.
// A device with the screens attached: the reports page, the roster's vehicle panel, and
// the files the export button hands over.
async function staged(options = {}) {
    const { readFileSync } = await import('node:fs');
    const vm = (await import('node:vm')).default;
    // From this file, not from an absolute workspace path - see the note in
    // tests/exports.test.mjs and the suite that enforces it.
    const root = new URL('../', import.meta.url);

    const device = loaded(options);
    const files = [];
    const blobs = new Map();

    const reportsView = makeNode('div');
    const panel = makeNode('section');
    panel.className = 'roster-panel';
    const vehicleList = makeNode('div');
    panel.appendChild(makeNode('h2')).textContent = 'רכבים';
    panel.appendChild(vehicleList);
    const nodes = { reportsView, vehicleList, panel };

    device.ctx.document = {
        body: makeNode('body'),
        // The CDN, unreachable - which on a building site is a normal Tuesday. The script
        // tag fails the moment it is appended, so loadXlsx settles at once instead of
        // sitting on its eight-second timer, and the export takes the CSV road for real.
        head: { appendChild(tag) { if (tag.onerror) tag.onerror(); return tag; } },
        getElementById: id => nodes[id] || null,
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener() {}, removeEventListener() {},
        createElement: tag => {
            const node = makeNode(tag);
            if (String(tag).toLowerCase() === 'a') {
                node.click = () => files.push({ name: String(node.download), text: blobs.get(node.href) });
            }
            return node;
        },
        createElementNS: (ns, tag) => makeNode(tag)
    };
    let urls = 0;
    device.ctx.URL = {
        createObjectURL(blob) {
            urls += 1;
            const url = `blob:staged/${urls}`;
            blobs.set(url, blob && blob.__text);
            return url;
        },
        revokeObjectURL() {}
    };

    const run = code => vm.runInContext(code, device.ctx, { filename: 'vehicles:ui' });
    ['js/ui/sitecolor.js', 'js/ui/reports.js', 'js/ui/day.js'].forEach(file => {
        run(readFileSync(new URL(file, root), 'utf8'));
    });
    run(`REPORT_RANGE.from = '2026-08-01'; REPORT_RANGE.to = '2026-08-31';
         REPORT_SECTION = 'workers'; INVOICE_PLACE = null;`);

    return { device, run, nodes, files };
}

// ---------------------------------------------------------------- the gate is shut
{
    suite('the shipped build does not do vehicles');

    const device = loaded();
    given('the fixture is on this phone',
        device.State.schedule.vehicles.length === 3,
        String((device.State.schedule.vehicles || []).length));
    // A claim about the app, not a precondition for one: the shipped flags are what
    // decides whether any of the rest of this file is describing a live feature. It
    // aborted the run instead of failing, so a build that turned vehicles on would have
    // been reported as a broken test rather than as the release it is.
    check('the flags a person installs have vehicles off',
        device.global('FARKAD_FLAGS').vehicles === false,
        JSON.stringify(device.global('FARKAD_FLAGS')));
}

// ---------------------------------------------------------------- the money
//
// The hazard the retirement exists for. Not "the screen shows no column" - the number
// itself. An ordinary evening, with a worked day and nothing said about vehicles, is the
// exact record that used to pay three hundred shekels nobody asked for.
{
    suite('no day pays for a vehicle, including the day nobody said anything about');

    const device = loaded();
    const s = device.State.schedule;

    same('the vehicles that went out on a worked day are none',
        device.call('vehiclesOutOn', s, '2026-08-13').map(item => item.vehicle.id), []);
    same('and on the evening that named one as having stayed in, still none',
        device.call('vehiclesOutOn', s, '2026-08-12').map(item => item.vehicle.id), []);
    same('the owner of two of them is owed nothing for the fortnight',
        device.call('vehiclePayFor', s, 'w_02', '2026-08-01', '2026-08-31'),
        { days: 0, amount: 0 });

    const rows = device.call('payrollReport', s, '2026-08-01', '2026-08-31');
    const david = rows.find(row => row.workerId === 'w_01');
    const sara = rows.find(row => row.workerId === 'w_02');
    check('two worked days at 400 come to 800 and not a shekel more',
        david.amount === 800 && david.netAmount === 800, JSON.stringify(david.amount));
    check('and the vehicle columns of his row are zero, not absent',
        david.vehicleDays === 0 && david.vehicleAmount === 0,
        JSON.stringify([david.vehicleDays, david.vehicleAmount]));
    check('the woman who owns two vans and worked nowhere is owed nothing',
        sara.amount === 0 && sara.vehicleAmount === 0, JSON.stringify(sara.amount));

    // The default was per DAY, so one day proves very little. A fortnight of them is the
    // shape the money actually went missing in.
    for (let day = 14; day <= 25; day += 1) {
        device.State.commit(device.call('assignPlace', s,
            `2026-08-${day}`, 'w_01', 'actual', 'p_01'));
    }
    const after = device.call('payrollReport', s, '2026-08-01', '2026-08-31');
    check('a fortnight of ordinary evenings adds nothing at all',
        after.every(row => row.vehicleDays === 0 && row.vehicleAmount === 0),
        JSON.stringify(after.map(row => row.vehicleAmount)));
    check('and fourteen worked days are fourteen days of pay',
        after.find(row => row.workerId === 'w_01').amount === 14 * 400,
        String(after.find(row => row.workerId === 'w_01').amount));
}

// ---------------------------------------------------------------- the controls
{
    suite('there is no control anywhere that reaches a vehicle');

    const { device, run, nodes } = await staged();

    check('the day screen draws no vehicle tray, with three vehicles on the phone',
        run('renderVehicleTray()') === null, String(run('renderVehicleTray()')));

    run('renderVehicleList()');
    check('the roster hides the whole vehicle panel, heading and add button included',
        nodes.panel.style.display === 'none', String(nodes.panel.style.display));
    check('and empties the list it was drawn into',
        nodes.vehicleList.childNodes.length === 0,
        String(nodes.vehicleList.childNodes.length));

    const before = vehiclesOf(device);
    await device.call('showAddVehicleModal');
    check('the add-a-vehicle form creates nothing even when every dialog says yes',
        vehiclesOf(device) === before, vehiclesOf(device).slice(0, 80));

    // The one edit the day screen had. A stale screen, an undo held from before a
    // reload, or an edit queued by another build can all still call it.
    const day = JSON.stringify(device.State.schedule.days['2026-08-13']);
    const change = device.call('setVehicleOut', device.State.schedule,
        '2026-08-13', 'v_01', false);
    same('marking a vehicle as having stayed in produces no edit at all',
        change, { path: null, value: null });
    check('and leaves the day record byte for byte as it was',
        JSON.stringify(device.State.schedule.days['2026-08-13']) === day,
        JSON.stringify(device.State.schedule.days['2026-08-13']));

    // What is compared is the RECORD, not the file: State.commit stamps updatedAt on
    // every save whether or not anything changed, and a check that read the whole file
    // would be reporting a clock. The days, the vehicles and every byte of the queue are
    // what a vehicle edit would have moved.
    const queued = () => Object.keys(device.dump())
        .filter(key => key.indexOf('farkad:outbox') === 0).sort()
        .map(key => key + '=' + device.raw(key)).join('\n');
    const stored = () => {
        const record = JSON.parse(device.raw('scheduleData:v2'));
        return JSON.stringify([record.days, record.vehicles]);
    };
    const queueBefore = queued();
    const storedBefore = stored();
    device.State.commit(change);
    check('committing it sends nothing and writes nothing',
        stored() === storedBefore && queued() === queueBefore,
        stored().slice(0, 120));
}

// ---------------------------------------------------------------- the writers
//
// RED, all three. These are the roster's own edit buttons, and unlike showAddVehicleModal
// and setVehicleOut beside them they carry no gate: called from a screen drawn by an
// older build, from an undo, or from a hand in a console, they write a vehicle record and
// commit it to the disk. Nothing moves money while the flag is off - and a rate stamped
// today is money the moment anybody turns it back on.
{
    suite('no path writes a vehicle record while the feature is off');

    const device = loaded();
    const before = vehiclesOf(device);
    const disk = () => JSON.parse(device.raw('scheduleData:v2')).vehicles;

    await device.call('renameVehicle', 'v_01');
    check('R1: renaming a vehicle changes nothing, in memory or on the disk',
        vehiclesOf(device) === before && JSON.stringify(disk()) === before,
        vehiclesOf(device).slice(0, 90));

    const priced = loaded();
    const pricedBefore = vehiclesOf(priced);
    await priced.call('changeVehicleRate', 'v_01');
    check('R2: no new rate is stamped, so nothing is priced from today',
        vehiclesOf(priced) === pricedBefore
        && JSON.stringify(JSON.parse(priced.raw('scheduleData:v2')).vehicles) === pricedBefore,
        vehiclesOf(priced).slice(0, 120));

    const archived = loaded();
    const archivedBefore = vehiclesOf(archived);
    await archived.call('toggleVehicleActive', 'v_03');
    check('R3: archiving a vehicle changes nothing either',
        vehiclesOf(archived) === archivedBefore
        && JSON.stringify(JSON.parse(archived.raw('scheduleData:v2')).vehicles) === archivedBefore,
        vehiclesOf(archived).slice(0, 90));
}

// ---------------------------------------------------------------- the pages
{
    suite('no vehicle column on any page, on screen or on paper');

    const { run, nodes } = await staged();

    run('renderReports()');
    const paper = nodes.reportsView.textContent;
    check('the pay sheet on screen carries neither vehicle heading',
        paper.indexOf('ימי רכב') === -1 && paper.indexOf('שכר רכב') === -1,
        paper.slice(0, 120));
    // renderReports builds BOTH sections into the page whichever one is on screen,
    // because the print stylesheet prints the record rather than the screen's current
    // answer to it - so this node is the paper.
    check('and the page the printer is given says nothing about a vehicle at all',
        paper.indexOf('רכב') === -1, paper.slice(0, 160));

    const sheet = run('payrollSheetRows()');
    same('the exported pay sheet is the eleven columns and no others', sheet[0],
        ['עובד', 'ימי נוכחות', 'ימי שכר', 'מתוכם כפולים', 'שעות נוספות', 'נעדר',
            'שכר יומי', 'נצבר', 'מקדמות', 'לתשלום', 'הערה']);
    check('and every row is eleven cells wide',
        sheet.every(row => row.length === 11), JSON.stringify(sheet[1]));

    const bundle = JSON.stringify(run('reportSheets()'));
    check('no sheet in the workbook mentions a vehicle',
        bundle.indexOf('רכב') === -1, bundle.slice(0, 160));

    // The row predicate's vehicle arm. A man who owns two vans and worked nothing is the
    // only thing that arm can be seen by.
    const named = run('payrollRows()').map(row => row.workerId);
    check('a van nobody may be charged for keeps nobody on the sheet',
        named.indexOf('w_02') === -1, named.join(','));
}

// ---------------------------------------------------------------- the files
{
    suite('the files that leave the phone carry no vehicle column');

    const csv = await staged();
    await csv.run('exportReports()');
    same('with the spreadsheet library unreachable, three CSV files go out',
        csv.files.map(file => file.name),
        ['שכר_2026-08-01_2026-08-31.csv', 'חיוב_2026-08-01_2026-08-31.csv',
            'פירוט_2026-08-01_2026-08-31.csv']);
    check('and not one of them has a vehicle column',
        csv.files.every(file => file.text.indexOf('רכב') === -1),
        csv.files.map(f => f.text.split('\r\n')[0]).join(' | ').slice(0, 160));
    check('the pay sheet CSV opens with the same eleven headings as the screen',
        csv.files[0].text.split('\r\n')[0]
            === '﻿"עובד","ימי נוכחות","ימי שכר","מתוכם כפולים","שעות נוספות","נעדר",'
            + '"שכר יומי","נצבר","מקדמות","לתשלום","הערה"',
        csv.files[0].text.split('\r\n')[0]);

    // The workbook itself, built by the app's own code with the library standing in for
    // SheetJS - so what is read here is the rows that would be written into the file.
    const book = await staged();
    const written = [];
    const wrote = [];
    book.device.ctx.XLSX = {
        utils: {
            book_new: () => ({ SheetNames: [], Sheets: {} }),
            aoa_to_sheet: rows => ({ rows }),
            book_append_sheet: (wb, ws, name) => {
                wb.SheetNames.push(name);
                written.push({ name, rows: ws.rows });
            }
        },
        writeFile: (wb, name) => wrote.push(name)
    };
    await book.run('exportReports()');
    same('the workbook is the three Hebrew sheets', written.map(s => s.name),
        ['שכר', 'חיוב', 'פירוט']);
    check('and no sheet in it carries a vehicle heading or a vehicle number',
        JSON.stringify(written).indexOf('רכב') === -1,
        JSON.stringify(written[0].rows[0]));
    // Named so a run where the library stub was never reached - and the CSV road taken
    // instead - cannot pass as a workbook with no vehicle column in it.
    same('and the file handed over is the ordinary workbook', wrote,
        ['דוחות_2026-08-01_2026-08-31.xlsx']);
}

// ---------------------------------------------------------------- nothing is lost
{
    suite('every stored vehicle byte survives being closed and opened');

    const device = loaded();
    given('the phone is holding the fixture verbatim', vehiclesOf(device) === FIXTURE_JSON);

    const reopened = makeDevice({ storage: device.dump(), deviceId: device.id });
    reopened.State.load();
    check('the records come back byte for byte - unknown fields, order and all',
        vehiclesOf(reopened) === FIXTURE_JSON, vehiclesOf(reopened).slice(0, 160));
    check('a rate entry with no date it applies from is kept, not dropped',
        JSON.stringify(reopened.State.schedule.vehicles[1].rates[0]) === '{"amount":400}',
        JSON.stringify(reopened.State.schedule.vehicles[1].rates));
    check('the archived one is still archived',
        reopened.State.schedule.vehicles[1].active === false);
    check('and the evening that named a vehicle off still names it',
        offOn(reopened, '2026-08-12') === '["v_02"]', offOn(reopened, '2026-08-12'));

    // Saved AGAIN by the build that cannot draw them: the reopen above proves reading,
    // and this proves the write that follows it does not quietly drop what it cannot use.
    reopened.State.commit(reopened.call('assignPlace',
        reopened.State.schedule, '2026-08-20', 'w_02', 'actual', 'p_01'));
    const twice = makeDevice({ storage: reopened.dump(), deviceId: reopened.id });
    twice.State.load();
    check('and an ordinary edit made afterwards does not shed them',
        vehiclesOf(twice) === FIXTURE_JSON && offOn(twice, '2026-08-12') === '["v_02"]',
        vehiclesOf(twice).slice(0, 100));
}

{
    suite('every stored vehicle byte survives the cloud');

    const cloud = makeCloud();
    const device = loaded({ deviceId: 'd_first' });
    device.Sync.pushDelayMs = TICK;
    device.Sync.connect(cloud.adapter);
    await SYNCED();

    check('the first sync puts the records in the cloud document verbatim',
        JSON.stringify(cloud.doc.vehicles) === FIXTURE_JSON,
        JSON.stringify(cloud.doc.vehicles).slice(0, 120));
    check('and the evening that named one off with them',
        JSON.stringify(cloud.doc.days['2026-08-12'].vehiclesOff) === '["v_02"]',
        JSON.stringify(cloud.doc.days['2026-08-12'].vehiclesOff));

    const second = makeDevice({ deviceId: 'd_second' });
    seed(second);
    second.Sync.pushDelayMs = TICK;
    second.Sync.connect(cloud.adapter);
    await SYNCED();
    check('a second phone adopts them whole, though it can draw none of them',
        vehiclesOf(second) === FIXTURE_JSON, vehiclesOf(second).slice(0, 120));
    check('and holds the evening mark too',
        offOn(second, '2026-08-12') === '["v_02"]', offOn(second, '2026-08-12'));

    // A document written by a phone that carries no vehicles is not a document saying
    // they were deleted. This is the snapshot that once took a crew's vehicles, their
    // rate history and the evenings that named them off the one device that still had
    // them - and could not be undone.
    const stripped = JSON.parse(JSON.stringify(cloud.doc));
    stripped.vehicles = [];
    delete stripped.days['2026-08-12'].vehiclesOff;
    stripped.updatedAt = '2099-01-01T00:00:00.000Z';
    stripped.updatedBy = 'd_third';
    cloud.subscribers.forEach(fn => fn(JSON.parse(JSON.stringify(stripped))));
    await SYNCED();
    check('a snapshot carrying no vehicles does not delete them',
        vehiclesOf(device) === FIXTURE_JSON, vehiclesOf(device).slice(0, 120));
    check('nor does it clear the evening that named one off',
        offOn(device, '2026-08-12') === '["v_02"]', offOn(device, '2026-08-12'));
}

{
    suite('every stored vehicle byte survives a backup, a rescue and a restore');

    const device = loaded({ deviceId: 'd_source' });

    device.call('exportBackup');
    const backup = device.downloads[device.downloads.length - 1];
    given('a backup file was handed over', Boolean(backup && backup.text));
    check('the backup file carries the vehicles as they are stored',
        JSON.stringify(JSON.parse(backup.text).vehicles) === FIXTURE_JSON,
        JSON.stringify(JSON.parse(backup.text).vehicles).slice(0, 120));

    // Imported through the real door - a file event, the reader, the confirmation and the
    // whole-document restore transaction underneath it.
    const imported = makeDevice({ deviceId: 'd_import' });
    seed(imported);
    stubDialogs(imported);
    imported.call('importBackup', imported.fileEvent(backup.name, backup.text));
    await settle(120);
    check('a phone that imports it holds every record',
        vehiclesOf(imported) === FIXTURE_JSON, vehiclesOf(imported).slice(0, 120));
    check('and the evening mark inside it',
        offOn(imported, '2026-08-12') === '["v_02"]', offOn(imported, '2026-08-12'));
    check('the restore left them on the disk, not only in memory',
        JSON.stringify(JSON.parse(imported.raw('scheduleData:v2')).vehicles) === FIXTURE_JSON,
        String(imported.raw('scheduleData:v2')).slice(0, 60));

    const afterRestore = makeDevice({ storage: imported.dump(), deviceId: imported.id });
    afterRestore.State.load();
    check('and the phone that was restored onto still has them at the next open',
        vehiclesOf(afterRestore) === FIXTURE_JSON, vehiclesOf(afterRestore).slice(0, 120));

    // The rescue file: raw bytes off a phone that cannot read itself. It is the last
    // copy anybody has, so what it carries is the whole question.
    device.call('exportRecoveryData');
    const rescue = device.downloads[device.downloads.length - 1];
    given('a rescue file was written', Boolean(rescue && rescue.text));
    const rescued = makeDevice({ deviceId: 'd_rescue' });
    seed(rescued);
    stubDialogs(rescued);
    rescued.call('importBackup', rescued.fileEvent(rescue.name, rescue.text));
    await settle(160);
    check('what comes out of a rescue file has the vehicles in it',
        vehiclesOf(rescued) === FIXTURE_JSON, vehiclesOf(rescued).slice(0, 120));
    check('and the evening that named one off',
        offOn(rescued, '2026-08-12') === '["v_02"]', offOn(rescued, '2026-08-12'));
}

// ---------------------------------------------------------------- the gate is a gate
//
// The same app, the same records, the flag on. If any of this has died then the records
// above are being kept for a feature that could no longer read them, and the retirement
// was a deletion after all.
{
    suite('with the gate open the arithmetic that was argued over is still there');

    const device = loaded({ flags: { vehicles: true }, deviceId: 'd_open' });
    const s = device.State.schedule;

    same('an ordinary worked evening sends every active vehicle out',
        device.call('vehiclesOutOn', s, '2026-08-13').map(item => [item.vehicle.id, item.amount]),
        [['v_01', 300], ['v_03', 300]]);
    check('the archived one earns nothing, then or ever',
        device.call('vehiclesOutOn', s, '2026-08-13')
            .every(item => item.vehicle.id !== 'v_02'));
    same('and the evening that named one off leaves it out',
        device.call('vehiclesOutOn', s, '2026-08-12').map(item => item.vehicle.id),
        ['v_01', 'v_03']);
    same('a day with nobody on a site is not a day the vehicles earned',
        device.call('vehiclesOutOn', s, '2026-08-30').map(item => item.vehicle.id), []);

    // The rate history, which is what stops a price change repaying a settled month.
    const july = loaded({ flags: { vehicles: true }, deviceId: 'd_july' });
    july.State.commit(july.call('assignPlace',
        july.State.schedule, '2026-07-15', 'w_01', 'actual', 'p_01'));
    same('a day in July is paid at the price it was worth in July',
        july.call('vehiclePayFor', july.State.schedule, 'w_01', '2026-07-15', '2026-07-15'),
        { days: 1, amount: 250 });

    const rows = device.call('payrollReport', s, '2026-08-01', '2026-08-31');
    const david = rows.find(row => row.workerId === 'w_01');
    const sara = rows.find(row => row.workerId === 'w_02');
    check('two worked days at 400 and two vehicle days at 300 come to 1400',
        david.amount === 1400 && david.vehicleDays === 2 && david.vehicleAmount === 600,
        JSON.stringify([david.amount, david.vehicleDays, david.vehicleAmount]));
    check('the woman who worked nowhere is still owed for the van that went out',
        sara.attendanceDays === 0 && sara.vehicleDays === 2 && sara.amount === 600,
        JSON.stringify([sara.attendanceDays, sara.vehicleDays, sara.amount]));

    const open = await staged({ flags: { vehicles: true }, deviceId: 'd_open_ui' });
    open.run('renderReports()');
    const paper = open.nodes.reportsView.textContent;
    check('the two columns come back on the screen',
        paper.indexOf('ימי רכב') !== -1 && paper.indexOf('שכר רכב') !== -1,
        paper.slice(0, 120));
    const sheet = open.run('payrollSheetRows()');
    same('and the exported pay sheet grows to thirteen, in their old places', sheet[0],
        ['עובד', 'ימי נוכחות', 'ימי שכר', 'מתוכם כפולים', 'שעות נוספות', 'נעדר',
            'ימי רכב', 'שכר רכב',
            'שכר יומי', 'נצבר', 'מקדמות', 'לתשלום', 'הערה']);
    check('the tray is drawn on the day screen again',
        open.run('renderVehicleTray()') !== null);

    // R4, RED. The one control the feature has, used once, on the build that would ship
    // if the flag were flipped: setVehicleOut returns days.<date>.vehiclesOff, three
    // segments, and journalEntryProblems requires four - so the edit is written locally
    // and then quarantined on its way to the queue, which blocks writes on the phone.
    const change = device.call('setVehicleOut', s, '2026-08-13', 'v_01', false);
    given('the day control produces an edit to commit', change.path !== null);
    device.State.commit(change);
    check('R4: marking a vehicle as having stayed in does not damage the outbox',
        device.call('farkadWritesBlocked') === false
        && Object.keys(device.dump()).filter(key => key.indexOf(':damaged') !== -1).length === 0,
        Object.keys(device.dump()).filter(key => key.indexOf(':damaged') !== -1).join(','));
}

// ------------------------------------------- the money rule does not stop at the gate
{
    suite('behind the flag, a vehicle is priced by the same rule as a man');

    // E6 moved every surface that prices a DAY off Math.round and onto the agora, because
    // showing 313 for 312.5 is a different number from the one the record holds. The two
    // vehicle cells were not moved with them: they sit inside vehiclesEnabled() and so
    // could not be measured by a suite running with the feature off.
    //
    // A hole behind a flag is still a hole. Whoever opens this gate opens it onto an
    // export whose vehicle column disagrees with every other column in the same file,
    // and they will be looking for a vehicle bug rather than a rounding one. Nothing
    // about a van makes its price more whole than a man's.
    const device = loaded({ flags: { vehicles: true }, deviceId: 'd_half' });
    device.State.schedule.vehicles = [
        { id: 'v_h', name: 'טנדר', ownerId: 'w_01', active: true,
            rates: [{ from: '2026-06-01', amount: 312.5 }] }
    ];
    device.State.save({ silent: true });

    const rows = device.call('payrollReport', device.State.schedule, '2026-08-01', '2026-08-31');
    const david = rows.find(row => row.workerId === 'w_01');
    given('the van went out on the two worked days, at 312.50 each',
        david.vehicleDays === 2 && david.vehicleAmount === 625,
        JSON.stringify([david.vehicleDays, david.vehicleAmount]));

    // One day, so the total itself carries the half.
    const one = device.call('payrollReport', device.State.schedule, '2026-08-13', '2026-08-13');
    const oneDay = one.find(row => row.workerId === 'w_01');
    given('and one day on its own is worth 312.5',
        oneDay.vehicleAmount === 312.5, String(oneDay.vehicleAmount));

    const staged1 = await staged({ flags: { vehicles: true }, deviceId: 'd_half_ui' });
    staged1.device.State.schedule.vehicles = device.State.schedule.vehicles;
    staged1.device.State.save({ silent: true });
    staged1.run(`REPORT_RANGE.from = '2026-08-13'; REPORT_RANGE.to = '2026-08-13';`);
    const sheet = staged1.run('payrollSheetRows()');
    const at = sheet[0].indexOf('שכר רכב');
    const row = sheet.find(line => line[0] === 'דוד');
    check('the exported vehicle cell carries the agora, like every cell beside it',
        row && Number(row[at]) === 312.5,
        JSON.stringify({ cell: row ? row[at] : null, headers: sheet[0] }));
}

report();
