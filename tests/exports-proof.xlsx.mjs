// The workbook, proved by READING THE FILE THAT WAS PRODUCED.
//
//   node tests/exports-proof.xlsx.mjs
//
// tests/xlsx.test.mjs already opens a produced workbook and reads its numbers back. This
// suite asks the four questions that one does not, and asks them of the bytes as well:
//
//   1. A NAME THAT IS A FORMULA. The CSV fallback defuses = + - @ tab CR (csvCell in
//      js/ui/share.js) and is measured there. The xlsx path defuses nothing, on the
//      stated grounds that "SheetJS types a string cell as a string" - a claim about a
//      third-party library, written in a comment, that nothing in this repository had
//      ever checked against a file. A worker called =1+1 or @SUM(A1) reaches a
//      bookkeeper's Excel from this app's export; whether it lands there as text or as
//      something Excel RUNS is a security question, and the only honest answer is in
//      xl/worksheets/*.xml. Read here: the cell's type, its stored value, and whether it
//      carries an <f> element - the one thing that makes a cell a formula in OOXML, and
//      the one thing invisible in the value.
//   2. NO NETWORK. The vendor library is on this origin and in the service worker's
//      shell, so an installed phone exports from a tunnel. Every network door on the
//      device is armed to record and refuse, and the whole export is run through them.
//   3. THREE SHAPES. One worker, one site (the client's file), and a quarter-long period
//      that crosses months - the last of which is what a bookkeeper actually asks for at
//      the end of a season, and the shape no other suite exports.
//   4. A CLOSED FORTNIGHT, through the file. A frozen payslip must not be recomputed from
//      the live days when it is exported again a month later.
//
// What this CANNOT say: how Excel, Numbers or the Files preview render what is in these
// bytes. rightToLeft="1" is read back below because it is in the file; that Excel honours
// it and Numbers ignores it is device acceptance, and is named as such in the report.

import { suite, check, same, given, report } from './runner.mjs';
import { phone, workbookOf, tags, attr, SHEETJS_PRESENT, SHEETJS_PATH, SHEETJS_REASON } from './exports-proof.lib.mjs';

given(`SheetJS is the shipped build (${SHEETJS_PATH})`, SHEETJS_PRESENT,
    SHEETJS_REASON || 'vendor/, the copy sw.js precaches');

// ------------------------------------------------------------- a name that is a formula
//
// The five openings a spreadsheet runs, and the two whitespace characters that hide one:
// Excel and Sheets strip a leading tab or carriage return and then read what is behind
// it, so "\t=1+1" is "=1+1" with a disguise.
const DANGEROUS = [
    { name: '=1+1', why: 'the plain formula' },
    { name: '+A1', why: 'the Lotus-style plus' },
    { name: '-1+1', why: 'a minus that is not a number' },
    { name: '@SUM(A1)', why: 'the at-sign call' },
    { name: '\t=1+1', why: 'a tab in front of a formula' },
    { name: '\r=1+1', why: 'a carriage return in front of a formula' },
    { name: '=HYPERLINK("http://x","click")', why: 'the one that phones home' },
    { name: '=cmd|\' /C calc\'!A0', why: 'the DDE opening, which is remote code' }
];

{
    suite('a worker named like a formula does not become one in the workbook');

    // One man per dangerous name, all on one sheet, all with a day worked so every one
    // of them reaches the pay sheet.
    const workers = DANGEROUS.map((item, index) => ({
        id: `w_${index + 1}`, name: item.name, active: true, dailyRate: 400, hourlyRate: 50
    }));
    const seed = workers
        .map(worker => `assignPlace(State.schedule, '2026-08-10', '${worker.id}', 'actual', 'p_01');`)
        .join('\n') + `\nState.save({ silent: true });`;

    const workbook = await phone(seed, {
        workers, places: [{ id: 'p_01', name: 'הרצליה', active: true }]
    }).exportOnce();

    // THE WHOLE FILE, not the sheet this suite expects the name on. A formula anywhere in
    // the workbook is a formula the bookkeeper's Excel runs.
    const formulas = [];
    workbook.worksheets.forEach(part => {
        const xml = workbook.parts[part].toString('utf8');
        (xml.match(/<f(?:\s[^>]*)?>[\s\S]*?<\/f>|<f[^>]*\/>/g) || [])
            .forEach(found => formulas.push({ part, found }));
    });
    check('no cell in any worksheet carries a formula element at all',
        formulas.length === 0, JSON.stringify(formulas.slice(0, 3)));

    const rows = workbook.sheets['שכר'].values;
    const types = workbook.sheets['שכר'].types;
    DANGEROUS.forEach(item => {
        // The name as the file holds it. A row is found by its name, so a name that was
        // mangled is a row that is not there - which is itself worth seeing.
        //
        // ONE EXCEPTION, and it is the file format's rather than the app's: a carriage
        // return inside a cell value is written as the OOXML escape _x000d_, which Excel
        // turns back into the character when it opens the file. So that name is matched
        // through the escape. Nothing about the question this suite is asking changes -
        // an escaped control character is still a string cell and still not a formula -
        // and no name typed into this app can carry one anyway: askText trims, and an
        // <input> cannot hold a tab or a return. The door such a name arrives by is a
        // restore, an import, or another phone.
        const held = text => String(text).replace(/_x([0-9a-fA-F]{4})_/g,
            (whole, hex) => String.fromCharCode(parseInt(hex, 16)));
        const at = rows.findIndex(row => held(row[0]) === item.name);
        check(`«${JSON.stringify(item.name)}» (${item.why}) is on the sheet, as itself`,
            at > 0, JSON.stringify(rows.map(row => row[0])));
        if (at > 0) {
            // t="str", t="s" and t="inlineStr" are all string cells. (SheetJS writes
            // t="str" when it is not building a shared-string table; OOXML calls that
            // type "formula string", and it is only a formula when an <f> element is
            // beside it - which the check above proves no cell in this file has.) The
            // failure this is watching for is a cell with NO type, which OOXML reads as
            // numeric, or one carrying a formula.
            check(`  and its cell is a string cell, not a number and not a formula`,
                ['str', 's', 'inlineStr'].indexOf(String(types[at][0])) !== -1,
                String(types[at][0]));
            check(`  and the money beside it is still his`,
                rows[at][7] === 400, JSON.stringify(rows[at]));
        }
    });

    // The other half of the same question. The CSV path puts a leading apostrophe in
    // front of a risky cell, which is how a spreadsheet is told "this is text"; the xlsx
    // path must NOT, because a string cell is already text and the apostrophe would be
    // part of the man's name in every viewer that shows it.
    check('and no name was defused by prefixing it, which the file does not need',
        !workbook.strings.some(text => /^'[=+\-@\t\r]/.test(text)),
        JSON.stringify(workbook.strings.filter(text => text.startsWith("'"))));
}

{
    suite('a site named like a formula, on the file the client is the one who opens');

    const places = [{ id: 'p_01', name: '=1+1', active: true },
        { id: 'p_02', name: '@SUM(A1)', active: true }];
    const seed = `
        assignPlace(State.schedule, '2026-08-10', 'w_01', 'actual', 'p_01');
        assignPlace(State.schedule, '2026-08-11', 'w_01', 'actual', 'p_02');
        State.save({ silent: true });`;

    const workbook = await phone(seed, { places }).exportOnce();
    const head = workbook.sheets['חיוב'].values[0];
    same('the billing grid names both sites as they are', head.slice(1, 3), ['=1+1', '@SUM(A1)']);
    check('both as string cells', workbook.sheets['חיוב'].types[0].slice(1, 3)
        .every(type => ['str', 's', 'inlineStr'].indexOf(String(type)) !== -1),
        JSON.stringify(workbook.sheets['חיוב'].types[0]));
    check('and the whole file still carries no formula',
        !workbook.text.includes('<f>') && !workbook.text.includes('<f '),
        workbook.text.slice(0, 0) || '');
}

// ---------------------------------------------------------------- no network, at all
{
    suite('the workbook is built and written without reaching the network');

    // The library is already in the page - which is the state of a phone that has
    // exported once this session - so the export has nothing left to fetch.
    const installed = phone(`
        assignPlace(State.schedule, '2026-08-10', 'w_01', 'actual', 'p_01');
        State.save({ silent: true });`);
    const workbook = await installed.exportOnce();
    given('a workbook was produced', workbook.names.length >= 1, JSON.stringify(workbook.names));
    same('no script tag was appended', installed.fetched.length, 0);
    same('fetch, XMLHttpRequest and importScripts were never touched',
        installed.network, []);

    // And the cold phone: the library is not in the page, so exactly one thing is
    // fetched, from this origin, and it is the file the service worker precaches.
    const cold = phone(`
        assignPlace(State.schedule, '2026-08-10', 'w_01', 'actual', 'p_01');
        State.save({ silent: true });`, { sheetjs: false });
    cold.failOnFetch();
    await cold.run('exportReports()');
    same('a cold phone appends exactly one script tag', cold.fetched.length, 1);
    same('pointing at this origin', cold.fetched[0].src, 'vendor/xlsx-0.18.5.min.js');
    same('and reaches no other network door', cold.network, []);
}

// ---------------------------------------------------------------- shape one: one worker
{
    suite('one worker, one site, one fortnight');

    const one = phone(`
        ['2026-08-10','2026-08-11','2026-08-12'].forEach(date =>
            assignPlace(State.schedule, date, 'w_01', 'actual', 'p_01'));
        State.save({ silent: true });`, {
        from: '2026-08-07', to: '2026-08-20',
        workers: [{ id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 }],
        places: [{ id: 'p_01', name: 'הרצליה', active: true }]
    });
    const workbook = await one.exportOnce();
    same('three sheets, named in Hebrew', workbook.names, ['שכר', 'חיוב', 'פירוט']);
    same('one row of pay, and it is his', workbook.sheets['שכר'].values.slice(1),
        [['דוד', 3, 3, 0, 0, 0, 400, 1200, 0, 1200, '']]);
    same('the billing grid is the three days and their total',
        workbook.sheets['חיוב'].values, [
            ['תאריך', 'הרצליה', 'סה״כ'],
            ['2026-08-10', 1, 1],
            ['2026-08-11', 1, 1],
            ['2026-08-12', 1, 1],
            ['סה״כ', 3, 3]
        ]);
    same('and the file is named for the period', one.caught[0].filename,
        'farkad-reports_2026-08-07_2026-08-20.xlsx');
}

// -------------------------------------------------------- shape two: one site, one client
{
    suite('one site, scoped to the client, read back out of the bytes');

    const scoped = phone(`
        assignPlace(State.schedule, '2026-08-10', 'w_01', 'actual', 'p_01');
        assignPlace(State.schedule, '2026-08-10', 'w_02', 'actual', 'p_02');
        assignPlace(State.schedule, '2026-08-11', 'w_01', 'actual', 'p_01');
        State.commit(addAdvance(State.schedule, 'w_01', '2026-08-05', 500, ''));
        State.save({ silent: true });`, { section: 'sites', place: 'p_01' });
    const workbook = await scoped.exportOnce();

    same('one sheet only', workbook.names, ['חיוב']);
    same('the other site is not in it', workbook.sheets['חיוב'].values, [
        ['תאריך', 'הרצליה', 'סה״כ'],
        ['2026-08-10', 1, 1],
        ['2026-08-11', 1, 1],
        ['סה״כ', 2, 2]
    ]);
    check('no worker is named anywhere in the bytes',
        !['דוד', 'שרה'].some(name => workbook.text.includes(name)), workbook.text.length + ' bytes');
    check('no wage, rate or advance is in them either',
        !['400', '350', '500', '1200', 'לתשלום', 'שכר יומי', 'נצבר']
            .some(secret => workbook.text.includes(secret)), '');
    same('and the file is named invoice, not reports', scoped.caught[0].filename,
        'farkad-invoice_2026-08-01_2026-08-31.xlsx');
}

// ------------------------------------------------------ shape three: a long period
{
    suite('a quarter, crossing three months and two rates');

    // 63 worked days across August, September and October, two men, one of them absent
    // for a week. The shape a bookkeeper asks for at the end of a season - and the one
    // where a date written as a serial number, or a month boundary counted twice, would
    // finally show.
    const seed = `
        var dates = [];
        for (var m = 8; m <= 10; m += 1) {
            for (var d = 1; d <= 21; d += 1) {
                dates.push('2026-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0'));
            }
        }
        dates.forEach(function (date, i) {
            assignPlace(State.schedule, date, 'w_01', 'actual', i % 2 ? 'p_01' : 'p_02');
        });
        dates.slice(0, 7).forEach(function (date) {
            markAbsent(State.schedule, date, 'w_02', 'actual');
        });
        dates.slice(7).forEach(function (date) {
            assignPlace(State.schedule, date, 'w_02', 'actual', 'p_01');
        });
        State.save({ silent: true });`;

    const long = phone(seed, { from: '2026-08-01', to: '2026-10-31' });
    const workbook = await long.exportOnce();
    const pay = workbook.sheets['שכר'];
    const invoice = workbook.sheets['חיוב'];
    const detail = workbook.sheets['פירוט'];

    same('both men are on the pay sheet', pay.values.slice(1).map(row => row[0]), ['דוד', 'שרה']);
    same('דוד: 63 days at 400', pay.values[1].slice(1, 8), [63, 63, 0, 0, 0, 400, 25200]);
    same('שרה: 56 days at 350 and seven absences', pay.values[2].slice(1, 8),
        [56, 56, 0, 0, 7, 350, 19600]);
    check('every money cell on the pay sheet is a number, not text that looks like one',
        pay.values.slice(1).every((row, at) => [7, 8, 9]
            .every(col => pay.types[at + 1][col] === 'number')),
        JSON.stringify(pay.types.slice(1)));

    // 63 dates down the billing grid, one row per date, plus a header and a total.
    same('the billing grid has a row for every worked date', invoice.values.length, 63 + 2);
    check('every date in it is ISO text, with its year, in order',
        invoice.values.slice(1, -1).every((row, at) =>
            invoice.types[at + 1][0] === 'str' && /^2026-(08|09|10)-\d{2}$/.test(row[0]))
        && invoice.values.slice(1, -1).map(row => row[0])
            .every((date, at, all) => at === 0 || all[at - 1] < date),
        JSON.stringify(invoice.values.slice(1, -1).map(row => row[0]).slice(0, 4)));
    const footer = invoice.values[invoice.values.length - 1];
    same('and its total is every worker-day in the quarter', footer[footer.length - 1], 63 + 56);
    check('with every column totalled off the rows above it',
        footer.slice(1, -1).every((total, col) =>
            total === invoice.values.slice(1, -1).reduce((sum, row) => sum + row[col + 1], 0)),
        JSON.stringify(footer));

    // The detail sheet against the pay sheet: the same money, one line per day.
    const earned = detail.values.slice(1)
        .reduce((sum, row) => sum + (typeof row[6] === 'number' ? row[6] : 0), 0);
    same('the day column adds up to what the pay sheet says was earned',
        earned, 25200 + 19600);
    check('and every one of its dates still carries its year',
        detail.values.slice(1).every(row => /^2026-\d{2}-\d{2}$/.test(row[0])),
        JSON.stringify(detail.values.slice(1, 3).map(row => row[0])));

    // Direction, on the sheets a long export actually produced - the flag lands per
    // worksheet, and a workbook that has it on sheet one and loses it on three opens
    // correctly and reads backwards on the sheet with the most rows in it.
    workbook.worksheets.forEach(part => {
        const views = tags(workbook.parts[part].toString('utf8'), 'sheetView');
        check(`${part} says rightToLeft="1"`,
            views.length > 0 && views.every(view => attr(view, 'rightToLeft') === '1'),
            views.join(' '));
    });
}

// ------------------------------------------- the agorot, and the three sheets agreeing
//
// The board's XLSX list asks for two things a file can answer: amounts to the agora, with
// the file not rounding away what the screen showed, and all three sheets carrying
// exactly the same numbers. A rate of 412.50 is legal (rateProblems accepts any finite
// amount) and an hourly rate multiplied by hours produces fractions with nobody typing
// one - so this is the ordinary case, not an exotic one.
{
    suite('agorot survive the file, and the three sheets agree to the agora');

    const fine = phone(`
        ['2026-08-10','2026-08-11','2026-08-12'].forEach(date =>
            assignPlace(State.schedule, date, 'w_01', 'actual', 'p_01'));
        assignPlace(State.schedule, '2026-08-10', 'w_02', 'actual', 'p_01');
        assignPlace(State.schedule, '2026-08-11', 'w_02', 'actual', 'p_01', RATE_EXTRA, 2);
        State.save({ silent: true });`, {
        from: '2026-08-07', to: '2026-08-20',
        workers: [{ id: 'w_01', name: 'דוד', active: true, dailyRate: 412.5, hourlyRate: 0 },
            { id: 'w_02', name: 'שרה', active: true, dailyRate: 300, hourlyRate: 37.25 }],
        places: [{ id: 'p_01', name: 'הרצליה', active: true }]
    });
    const book = await fine.exportOnce();
    const pay = book.sheets['שכר'];
    const earnedAt = pay.values[0].indexOf('נצבר');

    same('the wage cells carry the agorot, not a rounded shekel',
        pay.values.slice(1).map(row => row[earnedAt]), [1237.5, 674.5]);
    check('and they are numbers, so the column sums when it is selected',
        pay.values.slice(1).every((row, at) => pay.types[at + 1][earnedAt] === 'number'),
        JSON.stringify(pay.types.slice(1).map(row => row[earnedAt])));

    const detail = book.sheets['פירוט'].values.slice(1);
    const perDay = detail.map(row => row[6]).filter(cell => typeof cell === 'number');
    same('the detail sheet prices each day to the agora too', perDay,
        [412.5, 412.5, 412.5, 300, 374.5]);
    same('and its column adds up to the pay sheet, to the agora',
        perDay.reduce((sum, value) => sum + value, 0),
        pay.values.slice(1).reduce((sum, row) => sum + row[earnedAt], 0));

    // The third sheet counts days rather than shekels, so what it has to agree about is
    // the number of worker-days behind those figures.
    const billed = book.sheets['חיוב'].values.slice(-1)[0].slice(-1)[0];
    same('and the billing grid bills every day the other two priced',
        billed, detail.filter(row => row[4] !== 'נעדר').length);

    // WHAT THE FILE CAN ANSWER, asked as a check rather than as a given: nothing here
    // sets a column width (there is no !cols anywhere in js/ui/reports.js), so every
    // column opens at the viewer's default. A given at the end of a block protects
    // nothing below it and stops the whole run instead of reporting - tests/
    // nonassertions.test.mjs calls that V6, and it was right about this line.
    //
    // What is still NOT here, because a file cannot answer it: whether «###» lands over a
    // long number on a real device. The board's XlsxAcceptance list is where that belongs.
    check('the app writes no column widths, so width is the viewer\'s default',
        book.parts['xl/worksheets/sheet1.xml'].toString('utf8').indexOf('<cols>') === -1, '');
}

// ---------------------------------------------- a closed fortnight, exported again later
{
    suite('a closed fortnight exports the payslip it was closed on, not a fresh sum');

    // Closed on the numbers of the day, then a day is corrected off the fortnight and a
    // rate is raised - both of which are ordinary, and neither of which may move a
    // payslip somebody has already been paid from.
    const closing = phone(`
        ['2026-08-07','2026-08-10','2026-08-11','2026-08-12','2026-08-13'].forEach(
            date => State.commit(assignPlace(State.schedule, date, 'w_01', 'actual', 'p_01')));
        State.save({ silent: true });`, {
        flags: { carryAdvances: true, ledgerWrites: true },
        from: '2026-08-07', to: '2026-08-20',
        workers: [{ id: 'w_01', name: 'עומר', active: true, dailyRate: 500, hourlyRate: 50 }],
        places: [{ id: 'p_01', name: 'הרצליה', active: true }]
    });

    const before = await closing.exportOnce();
    const paid = before.sheets['שכר'].values[1];
    same('five days at 500 is the fortnight that was worked', paid.slice(1, 8),
        [5, 5, 0, 0, 0, 500, 2500]);

    // The closure, recorded the way the app records one.
    const closed = closing.run(`(function () {
        var changes = closePeriodChanges(State.schedule, 'w_01', '2026-08-07', '2026-08-20',
            '2026-08-21T09:00:00.000Z', 'd_one');
        if (changes.length === 0) return 'nothing to write';
        if (!State.commitMany(changes)) return 'the commit was refused';
        State.save({ silent: true });
        return advanceAccount(State.schedule, 'w_01', '2026-08-07', '2026-08-20').closed
            ? 'closed' : 'not closed';
    })()`);
    given('the fortnight was closed', closed === 'closed', String(closed));

    // Now the record moves underneath it, three ways, all of them ordinary: a day is
    // corrected off the fortnight, the man's rate is raised, and the site is renamed.
    closing.run(`
        unassignPlace(State.schedule, '2026-08-13', 'w_01', 'actual', 'p_01');
        State.worker('w_01').dailyRate = 900;
        State.schedule.places[0].name = 'הרצליה (חדש)';
        State.save({ silent: true });`);

    const after = await closing.exportOnce();
    const again = after.sheets['שכר'].values[1];

    same('the day counts on the reprinted payslip are the ones it was closed on',
        again.slice(1, 6), paid.slice(1, 6));
    same('so is the wage', again[7], paid[7]);
    same('and so is the net at the bottom of it', again[9], paid[9]);

    // RED, and the row a bookkeeper checks with a calculator is where it shows.
    //
    // The wage is frozen and the counts are frozen; the שכר יומי column beside them is
    // read off the roster as it stands TODAY (row.dailyRate, js/model/money.js). Raise a
    // man's rate after his fortnight is closed and the payslip reprints as 5 days ×
    // 900 = 2,500 - three cells that cannot all be true, on the document he was paid
    // from. It is not a wrong total; it is a row that cannot be checked.
    same('the daily-rate column is the one the payslip was closed on too',
        again[6], paid[6]);

    // RED, and the same fault seen from the other side. The screen DOES say why a total
    // is not days × rate - «בתקופה הזו השתנה השכר היומי של...», js/ui/reports.js - but
    // that sentence is a plain .hint, and a plain .hint is hidden in print
    // (css/app.css), is not one of the two classes the picture reads
    // (readReportPrintout in js/ui/printout.js), and is not among the notes moneyCells
    // puts in the file. So the one surface that explains the row is the only one the
    // bookkeeper does not have.
    const note = String(again[10] || '');
    check('and the file says why the wage is not the days times that rate',
        note.includes('השכר היומי') || note.includes('לפי השכר שהיה'), JSON.stringify(note));

    // AND WHERE THE CLOSURE RECORDED NO RATE AT ALL, nothing is printed in its place.
    //
    // Closures carry the basis they were priced at (closureFacts, js/model/ledger.js), but
    // a fortnight closed by a build from before that carries none - and the roster's rate
    // today is exactly the number that must not be printed over a frozen wage. The entries
    // are edited here, which the app itself never does (iron law 1): this is a fixture
    // standing in for a record written by an older build, and the only way to have one.
    const stripped = closing.run(`(function () {
        var held = State.schedule.ledger.advances;
        var found = 0;
        Object.keys(held).forEach(function (id) {
            if (held[id].basis) { delete held[id].basis; found += 1; }
        });
        State.save({ silent: true });
        return found;
    })()`);
    given('the closure now carries no basis, the way an older one would not',
        stripped > 0, String(stripped));

    const legacy = (await closing.exportOnce()).sheets['שכר'];
    const rateCell = legacy.values[1][legacy.values[0].indexOf('שכר יומי')];
    const legacyNote = String(legacy.values[1][legacy.values[0].indexOf('הערה')] || '');
    check('the rate column is empty rather than the rate he is on today',
        rateCell === '' && rateCell !== 900, JSON.stringify(rateCell));
    check('and the file says why it is empty',
        legacyNote.includes('לא נרשם בסגירה השכר היומי'), legacyNote);
    same('while the wage the fortnight was closed on is still the wage',
        legacy.values[1][legacy.values[0].indexOf('נצבר')], 2500);

    // The site's new name on a frozen fortnight is NOT asked as a failure: the detail
    // sheet resolves a placeId through the roster, and a site renamed is the same site.
    // It is recorded here so that the answer is on the record either way.
    const sites = after.sheets['פירוט'].values.slice(1).map(row => row[3]);
    same('the detail sheet still lists the five days the closure recorded, not the four left',
        after.sheets['פירוט'].values.slice(1).map(row => row[0]),
        ['2026-08-07', '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13']);
    check('the detail sheet names the site as the roster names it today',
        sites.every(name => name === 'הרצליה (חדש)'), JSON.stringify(sites));
}

// ------------------------------------- a phone number, a date, and the order of the columns
//
// Three things a spreadsheet decides for itself unless the file tells it otherwise, and
// each of them was a comment in this repository rather than a fact about a produced file.
//
//   A PHONE NUMBER. The roster is typed on a phone by whoever is holding it, and a man
//   entered under his mobile - 0501234567, or 050-1234567 - is an ordinary row. If that
//   cell leaves here typed as a NUMBER, the leading zero is gone before anybody opens the
//   file, and 501234567 is not a number anyone can ring. Nothing in the workbook path
//   defuses anything (the CSV path does; see csvCell), on the stated grounds that
//   "SheetJS types a string cell as a string" - which is the same class of claim as the
//   formula one, and is answered the same way: out of xl/worksheets/*.xml.
//
//   A DATE. Two sheets are dated. A date handed to a spreadsheet as a serial is 46264 in
//   the cell and whatever the viewer's locale decides on the screen, and a bookkeeper
//   reconciling a fortnight cannot tell a wrong one from a right one. Written as text in
//   ISO order it reads as a date, sorts as a date, and means the same thing in every
//   viewer that opens it.
//
//   THE ORDER. rightToLeft="1" turns the sheet round; it does not decide which column is
//   first. In a right-to-left sheet the first column is the one on the RIGHT, where a
//   Hebrew reader starts - so עובד first and לתשלום last is not a preference, it is what
//   makes the flag worth setting. The print suite measures the same fact on paper by the
//   x-coordinates of the headings; this is its half in the file.
{
    suite('a phone number is not a number, a date is not a serial, and the columns read right');

    const typed = phone(`
        ['w_01','w_02','w_03'].forEach(function (id) {
            State.commit(assignPlace(State.schedule, '2026-08-10', id, 'actual', 'p_01'));
        });`, {
        from: '2026-08-07', to: '2026-08-20',
        workers: [
            { id: 'w_01', name: '050-1234567', active: true, dailyRate: 400, hourlyRate: 0 },
            { id: 'w_02', name: '0501234567', active: true, dailyRate: 400, hourlyRate: 0 },
            { id: 'w_03', name: 'דוד כהן', active: true, dailyRate: 350, hourlyRate: 0 }
        ],
        places: [{ id: 'p_01', name: 'הרצליה', active: true }]
    });
    const book = await typed.exportOnce();
    const pay = book.sheets['שכר'];

    // The order, on all three sheets, read off the header row of the file.
    same('שכר begins with the man and ends with what he is owed and the note about it',
        [pay.values[0][0], pay.values[0][pay.values[0].length - 2],
            pay.values[0][pay.values[0].length - 1]],
        ['עובד', 'לתשלום', 'הערה']);
    same('חיוב begins with the date and ends with the total',
        [book.sheets['חיוב'].values[0][0],
            book.sheets['חיוב'].values[0][book.sheets['חיוב'].values[0].length - 1]],
        ['תאריך', 'סה״כ']);
    same('פירוט begins with the date and ends with what that day was worth',
        [book.sheets['פירוט'].values[0][0],
            book.sheets['פירוט'].values[0][book.sheets['פירוט'].values[0].length - 1]],
        ['תאריך', 'לתשלום ליום']);

    // The phone numbers, both spellings, out of the cell.
    //
    // `types` here is the cell's OOXML `t` attribute as the reader in
    // exports-proof.lib.mjs found it: 'str' for a string, and 'number' where there is no
    // attribute at all, which is what a numeric cell looks like. A cell that lost its
    // type is a cell that lost the zero.
    ['050-1234567', '0501234567'].forEach(written => {
        const at = pay.values.findIndex(row => String(row[0]) === written);
        check(`«${written}» reached the workbook exactly as it was typed`, at > 0,
            JSON.stringify(pay.values.map(row => row[0])));
        if (at > 0) {
            same(`and its cell is text, so no viewer may drop the leading zero`,
                pay.types[at][0], 'str');
            same(`and it is a value, not a formula`, pay.formulas[at][0], null);
        }
    });
    // The whole column, so a fourth spelling added later cannot slip through as a number.
    check('every name on the pay sheet is a text cell',
        pay.values.slice(1).every((row, at) => pay.types[at + 1][0] === 'str'),
        JSON.stringify(pay.values.slice(1).map((row, at) => pay.types[at + 1][0])));
    // And the Hebrew name beside them is still Hebrew, in the same file.
    check('and the Hebrew name in the same column is Hebrew, not an escape',
        pay.values.some(row => row[0] === 'דוד כהן'),
        JSON.stringify(pay.values.map(row => row[0])));

    // The dates, on both sheets that carry one.
    const billing = book.sheets['חיוב'];
    same('the billing sheet dates the day as a date somebody can read',
        billing.values.slice(1, -1).map(row => row[0]), ['2026-08-10']);
    check('and every one of those cells is text, never a serial',
        billing.types.slice(1, -1).every(row => row[0] === 'str'),
        JSON.stringify(billing.types.slice(1, -1).map(row => row[0])));

    const detail = book.sheets['פירוט'];
    same('the detail sheet dates every worker-day the same way',
        detail.values.slice(1).map(row => row[0]),
        ['2026-08-10', '2026-08-10', '2026-08-10']);
    check('and those cells are text too',
        detail.types.slice(1).every(row => row[0] === 'str'),
        JSON.stringify(detail.types.slice(1).map(row => row[0])));
    // Not asserted as decoration: the day name is what makes the ISO date legible to
    // somebody checking a fortnight without a calendar beside them.
    same('with the Hebrew day beside it', detail.values.slice(1).map(row => row[1]),
        ['שני', 'שני', 'שני']);

    // The money is still money. A fix that typed everything as text would pass every
    // check above and hand a bookkeeper a file whose columns will not sum.
    const net = pay.values[0].indexOf('לתשלום');
    check('and the money beside the name is still a number a column can total',
        pay.values.slice(1).every((row, at) => pay.types[at + 1][net] === 'number'),
        JSON.stringify(pay.values.slice(1).map(row => row[net])));
    same('adding up to what the three men are owed',
        pay.values.slice(1).reduce((sum, row) => sum + row[net], 0), 1150);
}

report();
