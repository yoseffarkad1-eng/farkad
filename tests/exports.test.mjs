// What leaves the app as a file.
//
// Three things go out of this app to somebody who cannot open it: a WhatsApp message to
// the crew, a spreadsheet to the bookkeeper, and a backup file to the next phone. Once
// any of them is sent, the app has no further say - nobody re-reads it, nobody notices a
// number that moved, and the paper wins every argument. So each one is produced HERE by
// the production function, taken back off the browser out of device.downloads, and read
// as the person receiving it would read it: bytes, not the arrays they were built from.
//
// The suites below never rebuild a file. downloadCsv writes a BOM, CRLF and its own
// quoting, exportBackup serialises the live schedule; a test that compared reportSheets()
// against reportSheets() would prove the arithmetic to itself and say nothing about the
// file. Everything asserted is either a byte in a produced file or a durable record on
// the disk beside it.

import { makeDevice, settle } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// The reports screen is a classic script like everything else in this app, so it runs
// here the way the model does - loaded into a device's own scope, no browser and no
// spreadsheet library. Same seam tests/data.test.mjs already uses for reportSheets().
// Derived from THIS FILE's location, never from an absolute workspace path. A suite that
// names /home/user/farkad reads the checkout the author happened to be sitting in - so
// run from a detached worktree it silently tests somebody else's bytes and reports a
// result about a tree it never opened. See tests/isolation.test.mjs, which fails when any
// suite grows one back.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORTS = readFileSync(join(ROOT, 'js/ui/reports.js'), 'utf8');

// Fixed, because every file this suite reads is stamped with the day it left the phone,
// and a suite whose expected filename changes at midnight is a suite nobody trusts.
const TODAY = '2026-08-20';
const FROM = '2026-08-01';
const TO = '2026-08-31';
const STAMP = `${FROM}_${TO}`;

function run(device, code) {
    return vm.runInContext(code, device.ctx, { filename: 'harness:exports' });
}

function phone(options = {}) {
    const device = makeDevice(options);
    device.setToday(TODAY);
    vm.runInContext(REPORTS, device.ctx, { filename: 'harness:reports' });

    // The app's own dialogs, which the harness document cannot draw. Recorded rather than
    // swallowed: what the person is TOLD after an export is part of what the export did,
    // and the CSV fallback says one of two different sentences depending on whose file it
    // is - a suite that discarded them could not tell those two apart.
    device.ctx.told = null;
    device.ctx.askTell = message => { device.ctx.told = message; };
    device.ctx.askConfirm = () => Promise.resolve(true);

    // The SheetJS CDN, unreachable - which on a building site is a normal Tuesday and is
    // the path that actually produces files here. loadXlsx appends a <script> to
    // document.head and waits for onload, onerror or eight seconds; the harness document
    // has no head and its stub node fires nothing, so the export would sit for the full
    // timeout and then take the same branch. The tag is failed at once instead, which is
    // what a phone with no signal does, and exportReports is otherwise driven untouched.
    device.ctx.document.head = { appendChild() {} };
    const create = device.ctx.document.createElement;
    device.ctx.document.createElement = tag => {
        const node = create(tag);
        if (String(tag).toLowerCase() === 'script') {
            setTimeout(() => { if (node.onerror) node.onerror(); }, 0);
        }
        return node;
    };
    return device;
}

// One fortnight, recorded the way the day screen records it: through the model, committed
// through State, so the journal and the disk carry it exactly as a phone would.
//
// דוד has a double day, an evening of extra hours he IS paid for, an absence and an
// advance by bank transfer. שרה has extra hours nobody can price and an advance in cash.
// עלי has a day and no rate at all, so his money is unknown rather than zero. The van is
// owned by דוד and went out on every worked day - it earns 900 with the flag on, which is
// what makes "nothing about it is in the file" a claim about the gate and not the fixture.
function seed(device) {
    device.State.schedule.workers = [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 },
        { id: 'w_02', name: 'שרה', active: true, dailyRate: 350, hourlyRate: 0 },
        { id: 'w_03', name: 'עלי', active: true, dailyRate: 0, hourlyRate: 0 }
    ];
    device.State.schedule.places = [
        { id: 'p_01', name: 'הרצליה', active: true },
        { id: 'p_02', name: 'תל אביב', active: true }
    ];
    device.State.schedule.vehicles = [{
        id: 'v_01', name: 'טנדר לבן', ownerId: 'w_01', active: true,
        rates: [{ from: '2026-01-01', amount: 300 }]
    }];
    device.State.save({ silent: true });

    const put = (date, worker, place, rate, hours) => device.State.commit(device.call(
        'assignPlace', device.State.schedule, date, worker, 'actual', place, rate, hours));
    put('2026-08-10', 'w_01', 'p_01');
    put('2026-08-10', 'w_01', 'p_02', device.global('RATE_DOUBLE'));
    put('2026-08-11', 'w_01', 'p_01', device.global('RATE_EXTRA'), 2);
    put('2026-08-11', 'w_02', 'p_02', device.global('RATE_EXTRA'), 3);
    put('2026-08-13', 'w_03', 'p_01');
    device.State.commit(device.call('markAbsent', device.State.schedule,
        '2026-08-12', 'w_01', 'actual'));

    // Exactly the way the advance form writes it: addAdvance builds the record, the
    // method is set on that same record, and the whole thing is committed once - so the
    // journal entry and the saved schedule carry the field together.
    const ids = {};
    [['w_01', '2026-08-12', 500, 'על חשבון', 'transfer'],
     ['w_02', '2026-08-14', 250, '', 'cash']].forEach(([worker, date, amount, note, how]) => {
        const change = device.call('addAdvance', device.State.schedule, worker, date, amount, note);
        change.value.method = how;
        device.State.commit(change);
        ids[worker] = change.value.id;
    });

    run(device, `REPORT_RANGE.from='${FROM}'; REPORT_RANGE.to='${TO}';`
        + ` REPORT_SECTION='workers'; INVOICE_PLACE=null;`);
    return ids;
}

function fileNamed(device, name) {
    const found = device.downloads.filter(item => item.name === name);
    return found.length === 1 ? found[found.length - 1].text : null;
}

// The produced bytes, read back the way a spreadsheet reads them - not the array they
// were built from. downloadCsv quotes every cell and doubles the quotes inside one, so
// this undoes exactly that and nothing else.
function csvRows(text) {
    return String(text).replace(/^﻿/, '').split('\r\n').map(line => {
        const cells = [];
        let cell = '';
        let inside = false;
        for (let i = 0; i < line.length; i += 1) {
            const ch = line[i];
            if (ch === '"' && inside && line[i + 1] === '"') { cell += '"'; i += 1; continue; }
            if (ch === '"') { inside = !inside; continue; }
            if (ch === ',' && !inside) { cells.push(cell); cell = ''; continue; }
            cell += ch;
        }
        cells.push(cell);
        return cells;
    });
}

// ---------------------------------------------------------------- the seder on WhatsApp
{
    suite('the message that goes out to the crew');

    const device = phone();
    seed(device);

    // The owner's own template, character for character - he sent it, the app copied it.
    // Pinned whole rather than sampled: a heading, a site marker, a bullet and the
    // absentee line are four separate product decisions and a substring check on one of
    // them would not notice the other three moving.
    same('the whole evening reads exactly as the owner wrote it',
        run(device, `dayMessage('2026-08-10', 'actual', 'pin', null)`),
        '📅 סידור עבודה – יום שני 10/08/2026\n\n📍 הרצליה\n• דוד\n\n'
        + '📍 תל אביב\n• דוד (כפול)\n\n🚫 נעדרים: אין');

    // One site, because the seder does not go to one group: the man driving to Herzliya
    // must not be reading the other gate's line. And who is away is a fact about the
    // crew, not about a site, so the one-site message leaves it out entirely.
    const oneSite = run(device, `dayMessage('2026-08-10', 'actual', 'pin', 'p_01')`);
    same('one site is that site alone',
        oneSite, '📅 סידור עבודה – יום שני 10/08/2026\n\n📍 הרצליה\n• דוד');
    check('and it carries no absentee line for the man to act on',
        oneSite.indexOf('נעדרים') === -1, oneSite.split('\n').pop());

    // The line is always there, "אין" included, because its absence would be ambiguous
    // between nobody-absent and nobody-checked.
    same('a day with nothing but an absence still says who is away',
        run(device, `dayMessage('2026-08-12', 'actual', 'pin', null)`),
        '📅 סידור עבודה – יום רביעי 12/08/2026\n\n🚫 נעדרים: דוד');
}

// ---------------------------------------------------------------- the worker's statement
{
    suite('the statement the worker himself is sent');

    const device = phone();
    seed(device);

    const statement = run(device, `workerStatementText('w_01')`);

    // Pinned whole. This is the one document the man checks his own pay against, and
    // every line in it - the day rows, the two day counts, נצבר, the advance and the net -
    // is a number he can dispute.
    same('every line of it, as he receives it',
        statement,
        '📄 ⁨דוד⁩ - 01/08/2026 עד 31/08/2026\n\n'
        + '• שני 10/08 - הרצליה + תל אביב (כפול) - 800\n'
        + '• שלישי 11/08 - הרצליה (‎+2 ש׳) - 500\n'
        + '• רביעי 12/08 - נעדר\n\n'
        + 'סה״כ 2 ימי נוכחות\n3 ימי שכר · מתוכם יום כפול אחד · 2 שעות נוספות\n'
        + 'נצבר: 1300\n\nמקדמה בהעברה 12/08: ‎-500\n\nנותר לתשלום: 800');

    // A name that is not plain Hebrew is a left-to-right run inside a right-to-left
    // sentence and slides to wherever the bidi algorithm puts it - so the isolate travels
    // IN the string, not in any CSS, because WhatsApp has none of ours.
    check('his name is isolated so the sentence cannot reorder it',
        statement.indexOf('📄 ⁨דוד⁩ - ') === 0, statement.slice(0, 20));

    // A leading hyphen resolves to the paragraph direction: "-500" lays out as "500-" and
    // the man reads backwards the one number that says money was already taken.
    check('the advance carries the left-to-right mark before its minus',
        statement.indexOf('מקדמה בהעברה 12/08: ‎-500') !== -1);

    // The screen puts a * on unpriced hours and the sheet explains it; the message he
    // actually receives must not be the one place that pretends the number is complete.
    const unpriced = run(device, `workerStatementText('w_02')`);
    check('hours nobody can price are declared in his message too',
        unpriced.indexOf('\n* שעות נוספות בלי שכר שעה - לא נכללו בסכום.') !== -1,
        unpriced.split('\n\n')[2]);

    // RED. The manager's screen draws this same advance as מקדמה בהעברה - the record
    // holds 'transfer' and reports.js has the Hebrew for it. The man is the one person
    // who will ever dispute "you were paid in cash", and his own copy is the document
    // that cannot answer.
    check('the statement says how the money reached him, as the manager\'s screen does',
        statement.indexOf('מקדמה בהעברה 12/08') !== -1,
        statement.split('\n').filter(line => line.indexOf('מקדמה') === 0).join(' | '));
}

// ---------------------------------------------------------------- the bookkeeper's file
{
    suite('the pay sheet, taken back off the browser');

    const device = phone();
    seed(device);
    await run(device, 'exportReports()');

    same('three files go out, named for the period they cover',
        device.downloads.map(item => item.name),
        [`שכר_${STAMP}.csv`, `חיוב_${STAMP}.csv`, `פירוט_${STAMP}.csv`]);
    same('and the person is told why they are CSV and not a workbook',
        device.ctx.told, 'ספריית Excel לא נטענה, ולכן הקבצים יוצאו כ-CSV.');

    const payroll = fileNamed(device, `שכר_${STAMP}.csv`);
    given('the pay sheet is one of the files handed over', typeof payroll === 'string');

    // Without the BOM Excel reads a UTF-8 CSV as mojibake and the whole sheet is Hebrew
    // names. Without CRLF some readers put the entire file on one line.
    check('it opens as Hebrew: the UTF-8 BOM is the first byte',
        payroll.charCodeAt(0) === 0xFEFF, String(payroll.charCodeAt(0)));
    check('and its rows are separated the way a spreadsheet expects',
        payroll.indexOf('\r\n') !== -1 && payroll.indexOf('\n\r') === -1);

    const rows = csvRows(payroll);

    // Fixed, and deliberately never narrowed by the data: a spreadsheet is compared
    // against last month's, and a file whose columns move depending on what happened that
    // fortnight is a file that cannot be.
    same('the columns are the eleven the bookkeeper compares month to month',
        rows[0],
        ['עובד', 'ימי נוכחות', 'ימי שכר', 'מתוכם כפולים', 'שעות נוספות', 'נעדר',
            'שכר יומי', 'נצבר', 'מקדמות', 'לתשלום', 'הערה']);

    // Four dates, one of them double, one absence, two paid hours, five hundred already
    // handed over. Every cell of it, because each is somebody's pay.
    same('דוד\'s row, cell by cell',
        rows[1], ['דוד', '2', '3', '1', '2', '1', '400', '1300', '-500', '800', '']);

    // The note column is the file's only place to say the total is short - the screen
    // says it with a star nobody can put in a CSV.
    same('שרה\'s row says her hours could not be priced',
        rows[2],
        ['שרה', '1', '1', '0', '3', '0', '350', '350', '-250', '100',
            'שעות נוספות בלי שכר שעה - לא נכללו']);

    // Blank, not nought: a man whose rate was never entered is owed an unknown amount,
    // which is a different statement from being owed nothing. And מקדמות is the NUMBER
    // zero, so the column sums.
    same('עלי is owed an unknown amount, and the file says unknown rather than zero',
        rows[3], ['עלי', '1', '1', '0', '0', '0', '0', '', '0', '', '']);

    // The three money columns are the ones a bookkeeper checks by adding them up, and
    // this file is the one that reaches him.
    const unbalanced = sheet => sheet.slice(1).filter(row => row[7] !== ''
        && Number(row[7]) + Number(row[8]) !== Number(row[9]));
    check('every row adds up: נצבר plus מקדמות is לתשלום',
        unbalanced(rows).length === 0, unbalanced(rows).map(row => row.join('/')).join(' | '));

    // RED. נצבר, מקדמות and לתשלום are each rounded on their own, so half a shekel
    // handed over makes the row say 1300 + (-501) = 800. The advance form forbids a
    // fraction (/^\d+$/), which is why nothing has caught this; the wire does not -
    // advanceProblems and journalEntryProblems both accept 0.5 - so it arrives from
    // another phone, from an import, or out of a restore, and lands in this file.
    const odd = phone();
    seed(odd);
    odd.State.commit(odd.call('addAdvance', odd.State.schedule, 'w_01', '2026-08-15', 0.5, ''));
    await run(odd, 'exportReports()');
    const oddRows = csvRows(fileNamed(odd, `שכר_${STAMP}.csv`));
    // -500.5, not -501. The agora is no longer rounded away on the way into the file:
    // six surfaces used to round gross, advance and net independently, from the exact
    // value, and produced six answers to one question. See moneyOf in js/ui/reports.js.
    given('the fraction reached the file', oddRows[1][8] === '-500.5', oddRows[1][8]);
    check('and it still adds up when an advance arrives with an agora on it',
        unbalanced(oddRows).length === 0,
        unbalanced(oddRows).map(row => row.join('/')).join(' | '));

    // A name or a site beginning with = or - is a formula the moment the file is opened,
    // and the leading apostrophe is how a spreadsheet is told "this is text". A negative
    // advance is NOT quoted: -1000 opens with a dangerous character and is not dangerous,
    // and quoting it as text would break the bookkeeper's own totals.
    const risky = phone();
    risky.State.schedule.workers = [
        { id: 'w_01', name: '-חדש', active: true, dailyRate: 400, hourlyRate: 0 }];
    risky.State.schedule.places = [{ id: 'p_01', name: '=תל אביב', active: true }];
    risky.State.save({ silent: true });
    risky.State.commit(risky.call('assignPlace', risky.State.schedule,
        '2026-08-10', 'w_01', 'actual', 'p_01'));
    risky.State.commit(risky.call('addAdvance', risky.State.schedule,
        'w_01', '2026-08-11', 500, ''));
    run(risky, `REPORT_RANGE.from='${FROM}'; REPORT_RANGE.to='${TO}';`);
    await run(risky, 'exportReports()');

    const riskyPay = csvRows(fileNamed(risky, `שכר_${STAMP}.csv`));
    const riskyBill = csvRows(fileNamed(risky, `חיוב_${STAMP}.csv`));
    check('a name that begins with a dash is text in the file, not a formula',
        riskyPay[1][0] === "'-חדש", JSON.stringify(riskyPay[1][0]));
    check('and a site that begins with an equals sign is too',
        riskyBill[0][1] === "'=תל אביב", JSON.stringify(riskyBill[0][1]));
    check('while the advance stays a number the bookkeeper can total',
        riskyPay[1][8] === '-500', JSON.stringify(riskyPay[1][8]));
}

// ---------------------------------------------------------------- the retired feature
{
    suite('nothing about a vehicle leaves in the bookkeeper\'s file');

    const device = phone();
    given('the shipped build does not do vehicles',
        device.global('FARKAD_FLAGS').vehicles === false);
    seed(device);
    await run(device, 'exportReports()');

    const payroll = fileNamed(device, `שכר_${STAMP}.csv`);
    const detail = fileNamed(device, `פירוט_${STAMP}.csv`);

    // Two columns of zeroes in a file that reaches a bookkeeper are not neutral: they are
    // a heading saying this app still accounts for vehicles, beside a number saying it
    // accounted for none.
    check('the pay sheet has no vehicle columns',
        payroll.indexOf('ימי רכב') === -1 && payroll.indexOf('שכר רכב') === -1,
        csvRows(payroll)[0].join(','));
    check('and no word about one anywhere in either sheet',
        payroll.indexOf('רכב') === -1 && payroll.indexOf('טנדר') === -1
        && detail.indexOf('רכב') === -1 && detail.indexOf('טנדר') === -1);
    check('nor does the message that goes out to the crew mention it',
        run(device, `dayMessage('2026-08-10', 'actual', 'pin', null)`).indexOf('רכב') === -1);

    // The witness that the two checks above are about the GATE and not about an empty
    // fixture: the same seed, on a device where the feature is on, writes the columns and
    // pays 900 for the van. Without this the file could be silent because there is
    // nothing to say, and nobody would know which.
    const on = phone({ flags: { vehicles: true } });
    seed(on);
    await run(on, 'exportReports()');
    const onRows = csvRows(fileNamed(on, `שכר_${STAMP}.csv`));
    check('the van in this fixture is real: with the feature on the file bills for it',
        onRows[0][6] === 'ימי רכב' && onRows[0][7] === 'שכר רכב'
        && onRows[1][6] === '3' && onRows[1][7] === '900',
        onRows[1].join(','));

    // Retired is not deleted. Whoever turns it back on must get the same vehicles, the
    // same owner and the same rate history, so the backup - the file that carries a phone
    // to its replacement - keeps every byte of them.
    run(device, 'exportBackup()');
    const backup = JSON.parse(fileNamed(device, `farkad-${TODAY}.json`));
    same('and the backup carries the retired records out whole',
        backup.vehicles,
        [{ id: 'v_01', name: 'טנדר לבן', ownerId: 'w_01', active: true,
            rates: [{ from: '2026-01-01', amount: 300 }] }]);
}

// ---------------------------------------------------------------- the client's own file
{
    suite('the file a client opens is that client\'s days and nothing else');

    const device = phone();
    seed(device);
    run(device, `REPORT_SECTION = 'sites'; INVOICE_PLACE = 'p_01';`);
    await run(device, 'exportReports()');

    same('one file goes out, not three',
        device.downloads.map(item => item.name), [`חיוב_${STAMP}.csv`]);
    same('and the person is told it is the billing file alone that fell back',
        device.ctx.told, 'ספריית Excel לא נטענה, ולכן קובץ החיוב יוצא כ-CSV.');

    const bill = fileNamed(device, `חיוב_${STAMP}.csv`);
    same('the grid is his site, his dates and his totals',
        csvRows(bill),
        [['תאריך', 'הרצליה', 'סה״כ'],
         ['2026-08-10', '1', '1'],
         ['2026-08-11', '1', '1'],
         ['2026-08-13', '1', '1'],
         ['סה״כ', '3', '3']]);

    // The dates are HIS dates. Narrowed by the same predicate that decides whose file
    // this is, so a day worked only at the other site is not a row of zeroes telling him
    // when the crew was somewhere else.
    check('no day this site had nobody on is in the file',
        bill.indexOf('2026-08-12') === -1 && bill.indexOf('2026-08-14') === -1,
        csvRows(bill).map(row => row[0]).join(','));
    check('nor the other client\'s site', bill.indexOf('תל אביב') === -1,
        csvRows(bill)[0].join(','));

    // The other two sheets carry every worker's name and every rate, which is exactly
    // what the printed page for this client was built never to say.
    const named = ['דוד', 'שרה', 'עלי'].filter(name => bill.indexOf(name) !== -1);
    check('and nobody is named in it', named.length === 0, named.join(','));
    check('and no pay is in it either',
        bill.indexOf('400') === -1 && bill.indexOf('לתשלום') === -1
        && bill.indexOf('נצבר') === -1, csvRows(bill)[0].join(','));
}

// ---------------------------------------------------------------- the handover file
{
    suite('the backup file, and the phone that opens it');

    const source = phone({ deviceId: 'd_one' });
    const ids = seed(source);

    // Reopened, because the boot mirror is what writes the v80 ledger entries - the same
    // thing that happens on every phone every morning - and the backup taken afterwards
    // is the one that carries both records of the same advance.
    const device = phone({ storage: source.dump(), deviceId: 'd_one' });
    device.State.load();
    await settle(5);
    run(device, 'exportBackup()');

    const text = fileNamed(device, `farkad-${TODAY}.json`);
    given('the backup is named for the day it left the phone', typeof text === 'string');
    const backup = JSON.parse(text);

    same('the advance goes out with the way the money moved on it',
        backup.advances[ids.w_01],
        { id: ids.w_01, workerId: 'w_01', date: '2026-08-12', amount: 500,
            note: 'על חשבון', method: 'transfer' });

    // A backup is a handover to another device: it is opened on a second phone, imported,
    // and worked on. Driven through the real change event and the real FileReader, the
    // way the person holding the file hands it over.
    const other = phone({ deviceId: 'd_two' });
    other.ctx.importBackup(other.fileEvent(`farkad-${TODAY}.json`, text));
    await settle(30);

    same('and it is still there after the second phone opens the file',
        other.State.schedule.advances[ids.w_01].method, 'transfer');
    same('written to that phone\'s disk, not only into its memory',
        JSON.parse(other.raw('scheduleData:v2')).advances[ids.w_01].method, 'transfer');
    same('with the retired vehicle record carried across untouched',
        other.State.schedule.vehicles, backup.vehicles);

    // RED. The same file carries a v80 'given' entry for this advance, written by the
    // boot mirror on every phone this morning, and it says who and when and how much and
    // nothing about how. Entries are append-only and never edited, so an entry that goes
    // out without it goes out without it for good - and reports.js already tells the
    // person on screen that this row "becomes" that movement with היסטוריה מלאה.
    const entries = Object.keys(backup.ledger.advances)
        .map(id => backup.ledger.advances[id])
        .filter(entry => entry.advanceId === ids.w_01);
    given('the mirror wrote its entry into the file', entries.length === 1);
    same('the ledger entry beside it says how the money moved too',
        entries[0].method, 'transfer');
}

// ---------------------------------------------------------------- one workbook, one story
{
    suite('the sheets inside one export agree with each other');

    // The bookkeeper reads פירוט to answer "which days" and חיוב to answer "who is
    // billed". Every worker-day that is on the first has to be on the second, or the
    // company paid for a day it never charged anybody for.
    const countable = detail => csvRows(detail).slice(1)
        .filter(row => row[4] !== 'נעדר').length;
    const billed = bill => {
        const rows = csvRows(bill);
        return Number(rows[rows.length - 1][rows[0].length - 1]);
    };

    const device = phone();
    seed(device);
    await run(device, 'exportReports()');
    const cleanDetail = fileNamed(device, `פירוט_${STAMP}.csv`);
    const cleanBill = fileNamed(device, `חיוב_${STAMP}.csv`);
    given('both sheets came out of the same export',
        typeof cleanDetail === 'string' && typeof cleanBill === 'string');
    check('every worker-day in the detail sheet is billed on the invoice sheet',
        countable(cleanDetail) === billed(cleanBill),
        `${countable(cleanDetail)} worked rows, ${billed(cleanBill)} billed`);

    // A day naming a site this phone's roster has not got. Not exotic: days and roster
    // entries travel as separate field paths, so an edit made on another phone can land
    // here while the write that would have introduced the site is still queued behind it
    // or was refused for room. Applied through the very function that lands an arriving
    // edit, then saved, so it is a day on this disk like any other.
    const orphan = phone();
    seed(orphan);
    orphan.call('applyJournalEntry', orphan.State.schedule,
        'days.2026-08-14.actual.w_01',
        { entries: [{ placeId: 'p_kfar' }], rates: { daily: 400, hourly: 50 } });
    orphan.State.save({ silent: true });
    await run(orphan, 'exportReports()');

    const detail = fileNamed(orphan, `פירוט_${STAMP}.csv`);
    const bill = fileNamed(orphan, `חיוב_${STAMP}.csv`);
    const payroll = fileNamed(orphan, `שכר_${STAMP}.csv`);
    given('the day was paid for, so the disagreement is about billing and not about it',
        csvRows(payroll)[1][7] === '1700');

    // RED. The payroll sheet paid 400 for that day and the detail sheet lists it; the
    // invoice sheet drops it, because it is built by walking the roster. Three sheets in
    // one file, and the money in them does not add up to the same fortnight.
    check('a day at a site the roster has not got is still billed to somebody',
        countable(detail) === billed(bill),
        `${countable(detail)} worked rows, ${billed(bill)} billed`);

    // RED. And the file the bookkeeper opens prints the internal id in the אתר column,
    // which is not a site name, is not translatable, and is the only place in any of
    // these three files that a record id reaches a person outside the app.
    check('and no record id is printed where a site name belongs',
        detail.indexOf('p_kfar') === -1,
        csvRows(detail).map(row => row[3]).join(','));
}

report();
