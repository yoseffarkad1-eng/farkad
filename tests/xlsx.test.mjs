// The actual spreadsheet, not the object.
//
// The one check that existed for the export stubbed SheetJS and asserted a property on
// the stub - `book.views[0].RTL === true`. That proves this app set a flag. It cannot
// see what the flag became in the file, and the file is the whole artefact: a workbook
// that opens left-to-right lays עובד on the far left and the bookkeeper reads a Hebrew
// table backwards, with לתשלום where שכר יומי should be. So here the app's own
// exportReports() runs against a REAL SheetJS, the bytes it would have handed the phone
// are caught, and they are opened by a zip reader and an XML reader that have never
// heard of SheetJS. A library asked to read back its own output would confirm anything
// it wrote, including a part no spreadsheet can open.
//
//     node tests/xlsx.test.mjs
//
// SheetJS is a devDependency (pinned to the same 0.18.5 the app names in XLSX_URL) and
// is read off the disk. It is never fetched at run time: the CDN is unreachable from a
// building site, which is the reason the CSV fallback exists and is tested below.

import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDevice } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const ROOT = process.env.FARKAD_REPO || join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORTS = readFileSync(join(ROOT, 'js/ui/reports.js'), 'utf8');
const SHEETJS = process.env.FARKAD_SHEETJS ||
    join(ROOT, 'node_modules/xlsx/dist/xlsx.full.min.js');

// dist/xlsx.full.min.js, not `import('xlsx')` - that resolves to a DIFFERENT build of
// the package, and a test that proves the wrong build proves nothing about the file a
// phone writes.
given(`SheetJS is installed (${SHEETJS} - run npm ci, or set FARKAD_SHEETJS)`,
    existsSync(SHEETJS));
const SHEETJS_CODE = readFileSync(SHEETJS, 'utf8');

// ---------------------------------------------------------------- a zip reader, by hand

// An .xlsx is a zip of XML parts. zlib does the only hard part; the rest is the central
// directory. No dependency and no `unzip` on the PATH, so this runs on the same machine
// the data suite runs on.
function unzip(buf) {
    let eocd = -1;
    // Scanned from the back: the record ends with a variable-length comment, so its
    // offset cannot be computed, only found.
    for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i -= 1) {
        if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('not a zip: no end-of-central-directory record');

    const count = buf.readUInt16LE(eocd + 10);
    let at = buf.readUInt32LE(eocd + 16);
    const parts = {};

    for (let n = 0; n < count; n += 1) {
        if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error('bad central directory');
        const method = buf.readUInt16LE(at + 10);
        const compressed = buf.readUInt32LE(at + 20);
        const nameLen = buf.readUInt16LE(at + 28);
        const extraLen = buf.readUInt16LE(at + 30);
        const commentLen = buf.readUInt16LE(at + 32);
        const localAt = buf.readUInt32LE(at + 42);
        const name = buf.toString('utf8', at + 46, at + 46 + nameLen);

        // The LOCAL header carries its own extra field, and its length is not the
        // central one. Reading the central length here lands a few bytes inside the
        // payload and inflate returns plausible garbage rather than throwing.
        if (buf.readUInt32LE(localAt) !== 0x04034b50) throw new Error('bad local header');
        const start = localAt + 30 + buf.readUInt16LE(localAt + 26) + buf.readUInt16LE(localAt + 28);
        const raw = buf.subarray(start, start + compressed);
        parts[name] = method === 0 ? Buffer.from(raw) : inflateRawSync(raw);
        at += 46 + nameLen + extraLen + commentLen;
    }
    return parts;
}

// ---------------------------------------------------------------- an xml reader, by hand
const attr = (tag, name) => {
    const found = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
    return found ? found[1] : null;
};
const tags = (xml, name) => xml.match(new RegExp(`<${name}(?:\\s[^>]*)?/?>`, 'g')) || [];
const unescapeXml = text => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');

function sharedStrings(xml) {
    if (!xml) return [];
    return (xml.match(/<si>[\s\S]*?<\/si>|<si\/>/g) || []).map(si =>
        (si.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g) || [])
            .map(t => unescapeXml(t.replace(/^<t(?:\s[^>]*)?>/, '').replace(/<\/t>$/, '')))
            .join(''));
}

// A worksheet part back to rows. The cell TYPE is kept, not thrown away: a count written
// as text is a column the bookkeeper cannot SUM and cannot sort, which looks identical
// on screen to one written as a number.
function sheetOf(xml, strings) {
    const values = [];
    const types = [];
    (xml.match(/<row[\s\S]*?<\/row>|<row[^>]*\/>/g) || []).forEach(rowXml => {
        const row = [];
        const rowTypes = [];
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
            while (row.length < index) { row.push(''); rowTypes.push('str'); }
            // No `t` at all is the OOXML default, and the default is numeric.
            row[index] = type ? text : Number(text);
            rowTypes[index] = type || 'number';
        });
        values.push(row);
        types.push(rowTypes);
    });
    return { values, types };
}

// The part each sheet name points at, resolved through the workbook's own relationships -
// never by guessing sheet1/sheet2/sheet3, which is the order SheetJS happens to use and
// not a promise it makes.
function workbookOf(bytes) {
    const parts = unzip(bytes);
    const rels = {};
    tags(parts['xl/_rels/workbook.xml.rels'].toString('utf8'), 'Relationship')
        .forEach(rel => { rels[attr(rel, 'Id')] = attr(rel, 'Target'); });
    const strings = sharedStrings(parts['xl/sharedStrings.xml'] &&
        parts['xl/sharedStrings.xml'].toString('utf8'));
    const names = [];
    const sheets = {};
    tags(parts['xl/workbook.xml'].toString('utf8'), 'sheet').forEach(tag => {
        const name = unescapeXml(attr(tag, 'name'));
        const part = 'xl/' + String(rels[attr(tag, 'r:id')]).replace(/^\/?xl\//, '');
        names.push(name);
        sheets[name] = sheetOf(parts[part].toString('utf8'), strings);
    });
    const worksheets = Object.keys(parts)
        .filter(name => /^xl\/worksheets\/[^/]+\.xml$/.test(name)).sort();
    // The parts that carry DATA, for the questions that are about what is not in the
    // file. Not every part: docProps, styles and the theme are full of round numbers and
    // stock names, and a leak check that reads them is a leak check that never fails
    // honestly.
    const text = worksheets.map(name => parts[name].toString('utf8'))
        .concat(parts['xl/sharedStrings.xml'] ? [parts['xl/sharedStrings.xml'].toString('utf8')] : [])
        .join('\n');
    return { bytes, parts, names, sheets, worksheets, text };
}

// ---------------------------------------------------------------- one phone, headless

// reports.js is a classic script, so it is loaded into a device's scope and its functions
// are called there - the seam tests/data.test.mjs already uses for reportSheets().
function phone(seed, options = {}) {
    const device = makeDevice();
    // Installed BEFORE reports.js runs. A library fetch added at the top of that file, or
    // inside reportSheets(), would be recorded here rather than throwing on a missing
    // document.head - which would read as a broken test rather than an eager fetch.
    const fetched = [];
    let onAppend = null;
    device.ctx.document.head = {
        appendChild(tag) { fetched.push(tag); if (onAppend) onAppend(tag); }
    };
    const told = [];
    device.ctx.askTell = message => { told.push(message); };

    device.State.schedule.workers = options.workers || [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 },
        { id: 'w_02', name: 'שרה', active: true, dailyRate: 350, hourlyRate: 0 }
    ];
    device.State.schedule.places = options.places || [
        { id: 'p_01', name: 'הרצליה', active: true },
        { id: 'p_02', name: 'תל אביב', active: true }
    ];
    device.State.save({ silent: true });

    const run = code => vm.runInContext(code, device.ctx, { filename: 'harness:reports' });
    run(REPORTS);
    run(`REPORT_RANGE.from = '2026-08-01'; REPORT_RANGE.to = '2026-08-31';
         REPORT_SECTION = 'workers'; INVOICE_PLACE = null;`);
    run(seed);

    const caught = [];
    if (options.sheetjs !== false) {
        vm.runInContext(SHEETJS_CODE, device.ctx, { filename: 'xlsx.full.min.js' });
        device.ctx.__caught = caught;
        // Only the last inch is redirected. book_new, aoa_to_sheet, the RTL flag, the
        // Hebrew sheet names and the filename are all still the app's own code;
        // writeFile would put the file on a disk and the bytes are wanted in hand.
        run(`XLSX.writeFile = function (wb, filename) {
                 __caught.push({ filename: filename,
                     bytes: XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) });
             };`);
    }
    return {
        device, run, caught, fetched, told,
        downloads: device.downloads,
        hangOnFetch: () => { onAppend = null; },
        failOnFetch: () => { onAppend = tag => tag.onerror(); },
        async exportOnce() {
            caught.length = 0;
            await run('exportReports()');
            given('exportReports wrote exactly one workbook', caught.length === 1);
            return workbookOf(Buffer.from(caught[0].bytes));
        }
    };
}

// A fortnight somebody actually worked: a double day at two sites, a day with two extra
// hours, an absence, a second worker, and an advance against the first.
const FORTNIGHT = `
    assignPlace(State.schedule, '2026-08-10', 'w_01', 'actual', 'p_01', RATE_DOUBLE);
    assignPlace(State.schedule, '2026-08-10', 'w_01', 'actual', 'p_02', RATE_DOUBLE);
    assignPlace(State.schedule, '2026-08-11', 'w_01', 'actual', 'p_01', RATE_EXTRA, 2);
    assignPlace(State.schedule, '2026-08-11', 'w_02', 'actual', 'p_02');
    assignPlace(State.schedule, '2026-08-13', 'w_02', 'actual', 'p_01');
    markAbsent(State.schedule, '2026-08-12', 'w_01', 'actual');
    State.commit(addAdvance(State.schedule, 'w_01', '2026-08-05', 500, ''));
    State.save({ silent: true });
`;

// Which column a heading is in, asked of the file. Reading נצבר at a fixed index is how
// a check quietly moves onto the wrong column the day a column is inserted before it -
// and goes on passing, about a different number.
const column = (workbook, heading) => workbook.sheets['שכר'].values[0].indexOf(heading);

const PAYROLL_HEAD = ['עובד', 'ימי נוכחות', 'ימי שכר', 'מתוכם כפולים', 'שעות נוספות',
    'נעדר', 'שכר יומי', 'נצבר', 'מקדמות', 'לתשלום', 'הערה'];

const main = phone(FORTNIGHT);
const book = await main.exportOnce();

// ---------------------------------------------------------------- it is a spreadsheet

suite('the bytes are a workbook, and the workbook is the three reports');

check('the file begins PK, the way a zip does, and holds an OPC content-types part',
    book.bytes[0] === 0x50 && book.bytes[1] === 0x4b &&
    book.parts['[Content_Types].xml'] !== undefined,
    book.bytes.subarray(0, 2).toString('latin1'));
same('one worksheet part per sheet the app appended', book.worksheets.length, 3);
same('named in Hebrew, in the order the app appends them', book.names, ['שכר', 'חיוב', 'פירוט']);

// ---------------------------------------------------------------- the question

suite('right to left - in every worksheet part, not the first one');

// xl/workbook.xml carries no <workbookView> at all in what SheetJS writes: the flag lands
// per WORKSHEET. A workbook that got it on sheet one and lost it on two and three opens
// correctly, reads backwards on the other two, and looks fixed.
same('the workbook part says nothing about direction, so per-sheet is the only answer',
    tags(book.parts['xl/workbook.xml'].toString('utf8'), 'workbookView')
        .filter(view => attr(view, 'rightToLeft') !== null).length, 0);

book.worksheets.forEach(part => {
    const views = tags(book.parts[part].toString('utf8'), 'sheetView');
    check(`${part} has a sheetView to carry the direction`, views.length >= 1,
        String(views.length));
    check(`${part} says rightToLeft="1"`,
        views.length > 0 && views.every(view => attr(view, 'rightToLeft') === '1'),
        views.join(' '));
});

// ---------------------------------------------------------------- the numbers

suite('שכר, read back out of the file');

// Every value pinned against a literal, not against another call of the same function:
// comparing reportSheets() to reportSheets() would agree with itself no matter what the
// arithmetic did.
same('the header is the eleven columns, in order', book.sheets['שכר'].values[0], PAYROLL_HEAD);
same('דוד: a double day at two sites, two extra hours, an absence, 500 already taken',
    book.sheets['שכר'].values[1], ['דוד', 2, 3, 1, 2, 1, 400, 1300, -500, 800, '']);
same('שרה: two ordinary days at 350', book.sheets['שכר'].values[2],
    ['שרה', 2, 2, 0, 0, 0, 350, 700, 0, 700, '']);
same('and nobody else is on the sheet', book.sheets['שכר'].values.length, 3);

// A number stored as text is a column that will not SUM and will not sort, and it looks
// exactly like a number in the cell.
same('the name is text and every figure beside it is a number',
    book.sheets['שכר'].types[1],
    ['str', 'number', 'number', 'number', 'number', 'number', 'number', 'number',
        'number', 'number', 'str']);

suite('חיוב, read back out of the file');

same('the grid is dates down, sites across, with the geresh in סה״כ',
    book.sheets['חיוב'].values, [
        ['תאריך', 'הרצליה', 'תל אביב', 'סה״כ'],
        ['2026-08-10', 1, 1, 2],
        ['2026-08-11', 1, 1, 2],
        ['2026-08-13', 1, 0, 1],
        ['סה״כ', 3, 2, 5]
    ]);

const invoice = book.sheets['חיוב'].values;
const body = invoice.slice(1, -1);
const footer = invoice[invoice.length - 1];
check('every row totals its own sites',
    body.length > 0 && body.every(row =>
        row[row.length - 1] === row.slice(1, -1).reduce((sum, n) => sum + n, 0)),
    JSON.stringify(body));
check('and the last row totals every column above it',
    footer.slice(1).every((total, at) =>
        total === body.reduce((sum, row) => sum + row[at + 1], 0)),
    JSON.stringify(footer));
check('every date is written as text, so it reads as a date and not as a serial number',
    body.length > 0 && body.every((row, index) =>
        book.sheets['חיוב'].types[index + 1][0] === 'str' &&
        /^\d{4}-\d{2}-\d{2}$/.test(row[0])),
    JSON.stringify(body.map(row => row[0])));

suite('פירוט, read back out of the file');

same('one row per worker-day-site, worker-major, the day priced once',
    book.sheets['פירוט'].values, [
        ['תאריך', 'יום', 'עובד', 'אתר', 'סוג', 'שעות נוספות', 'לתשלום ליום'],
        ['2026-08-10', 'שני', 'דוד', 'הרצליה', 'יום כפול', '', 800],
        ['2026-08-10', 'שני', 'דוד', 'תל אביב', 'יום כפול', '', ''],
        ['2026-08-11', 'שלישי', 'דוד', 'הרצליה', 'שעות נוספות', 2, 500],
        ['2026-08-12', 'רביעי', 'דוד', '', 'נעדר', '', ''],
        ['2026-08-11', 'שלישי', 'שרה', 'תל אביב', 'רגיל', '', 350],
        ['2026-08-13', 'חמישי', 'שרה', 'הרצליה', 'רגיל', '', 350]
    ]);

const detail = book.sheets['פירוט'].values.slice(1);
const earned = detail.reduce((sum, row) => sum + (typeof row[6] === 'number' ? row[6] : 0), 0);
check('the day column adds up to what the pay sheet says was earned',
    earned === book.sheets['שכר'].values.slice(1)
        .reduce((sum, row) => sum + row[column(book, 'נצבר')], 0),
    String(earned));
check('and every worker-day on it is billed on the billing sheet',
    detail.filter(row => row[4] !== 'נעדר').length === footer[footer.length - 1],
    `${detail.filter(row => row[4] !== 'נעדר').length} worked / ${footer[footer.length - 1]} billed`);

// ---------------------------------------------------------------- the retired feature

suite('no vehicle columns while the feature is retired');

same('the pay sheet is eleven columns wide, not thirteen',
    book.sheets['שכר'].values[0].length, 11);
check('and no part of the file carries a vehicle heading',
    !book.text.includes('ימי רכב') && !book.text.includes('שכר רכב'));

// ---------------------------------------------------------------- the client's file

suite("the client's file is the billing grid and nothing else");

const client = await phone(FORTNIGHT + `REPORT_SECTION = 'sites'; INVOICE_PLACE = 'p_01';`)
    .exportOnce();
same('one sheet, named חיוב', client.names, ['חיוב']);
same('and one worksheet part behind it', client.worksheets.length, 1);
check('which is right to left too',
    tags(client.parts[client.worksheets[0]].toString('utf8'), 'sheetView')
        .every(view => attr(view, 'rightToLeft') === '1'));
same('only that site, and only the dates it was worked', client.sheets['חיוב'].values, [
    ['תאריך', 'הרצליה', 'סה״כ'],
    ['2026-08-10', 1, 1],
    ['2026-08-11', 1, 1],
    ['2026-08-13', 1, 1],
    ['סה״כ', 3, 3]
]);
// The file a stranger opens. The leak this export had lived in what got bundled, and it
// is asked here of the BYTES, not of the object that was handed to the library.
check('and nobody is named, or priced, anywhere in its bytes',
    !['דוד', 'שרה', 'שכר', 'לתשלום', 'פירוט', '400', '1300']
        .some(secret => client.text.includes(secret)));

// ---------------------------------------------------------------- the fallback

suite('the CDN is unreachable, which on a building site is a Tuesday');

const offline = phone(FORTNIGHT, { sheetjs: false });

// Nothing is fetched by loading the file or by building all three sheets. It used to be
// a plain script tag in the head - synchronous, before anything on the page - and on a
// slow connection it took the whole app down with it for a feature used once a fortnight.
offline.run('reportSheets()');
same('loading reports.js and building every sheet fetches nothing',
    offline.fetched.length, 0);

offline.hangOnFetch();
check('two presses while it is in flight share one fetch',
    offline.run('(function () { var a = loadXlsx(60); var b = loadXlsx(60); return a === b; })()')
        === true);
same('and one script tag was appended, not two', offline.fetched.length, 1);
same('pointing at the pinned build of the library', offline.fetched[0].src,
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
check('fetched out of the way of the page, not blocking it', offline.fetched[0].async === true);

// The version in that URL and the version this suite proved the file against have to be
// the same build, or the proof is about a library no phone loads.
same('and that is the build these checks were run against',
    main.run('XLSX.version'),
    /xlsx\/([^/]+)\//.exec(offline.fetched[0].src)[1]);

await offline.run('loadXlsx(60)');
check('after it fails the button re-arms rather than remembering the failure',
    offline.run('xlsxLoading') === null);

offline.failOnFetch();
await offline.run('exportReports()');
same('three CSV files, named for the range, in the order the sheets are built',
    offline.downloads.map(file => file.name),
    ['שכר_2026-08-01_2026-08-31.csv', 'חיוב_2026-08-01_2026-08-31.csv',
        'פירוט_2026-08-01_2026-08-31.csv']);
// Excel reads a UTF-8 CSV as mojibake without the BOM, and splits rows on CRLF only.
check('each begins with the byte order mark Excel needs to read Hebrew',
    offline.downloads.every(file => file.text.charCodeAt(0) === 0xfeff));
check('and its rows end CRLF',
    offline.downloads.every(file => file.text.includes('\r\n') && !/[^\r]\n/.test(file.text)));
same('the pay sheet carries the same numbers the workbook did',
    offline.downloads[0].text.split('\r\n')[1],
    '"דוד","2","3","1","2","1","400","1300","-500","800",""');
same('and the person is told, in the words the app pins',
    offline.told, ['ספריית Excel לא נטענה, ולכן הקבצים יוצאו כ-CSV.']);

const scopedCsv = phone(FORTNIGHT + `REPORT_SECTION = 'sites'; INVOICE_PLACE = 'p_01';`,
    { sheetjs: false });
scopedCsv.failOnFetch();
await scopedCsv.run('exportReports()');
same("the client's fallback is still the client's file alone",
    scopedCsv.downloads.map(file => file.name), ['חיוב_2026-08-01_2026-08-31.csv']);
same('and its own sentence, not the other one', scopedCsv.told,
    ['ספריית Excel לא נטענה, ולכן קובץ החיוב יוצא כ-CSV.']);

// A site called '=תל אביב' is a formula in Excel, and a name is not markup - but a
// negative advance opens with a minus and must stay a number the bookkeeper can total.
const risky = phone(`
    assignPlace(State.schedule, '2026-08-10', 'w_01', 'actual', 'p_01');
    State.commit(addAdvance(State.schedule, 'w_01', '2026-08-05', 500, ''));
    State.save({ silent: true });`, {
    sheetjs: false,
    workers: [{ id: 'w_01', name: '-חדש', active: true, dailyRate: 400, hourlyRate: 50 }],
    places: [{ id: 'p_01', name: '=תל אביב', active: true }]
});
risky.failOnFetch();
await risky.run('exportReports()');
same('a name that opens like a formula is defused in the file itself',
    risky.downloads[0].text.split('\r\n')[1],
    '"\'-חדש","1","1","0","0","0","400","400","-500","-100",""');
same('and a site name too, on the billing sheet the client is the one who opens',
    risky.downloads[1].text.replace('\ufeff', '').split('\r\n')[0],
    '"תאריך","\'=תל אביב","סה״כ"');

// ---------------------------------------------------------------- what the file gets wrong

suite('what the file still gets wrong');

// RED. The form forbids a fraction; sync, an import and a restore do not, and
// advanceProblems accepts one. The three money columns are then rounded independently,
// so the row a bookkeeper checks by adding it up does not add up: 400 + (-1) is 399 and
// the file says 400. schema.js rounds row.advances once, or this stays wrong on the
// screen and in the file together.
const fractional = await phone(`
    assignPlace(State.schedule, '2026-08-10', 'w_01', 'actual', 'p_01');
    State.commit(addAdvance(State.schedule, 'w_01', '2026-08-05', 0.5, ''));
    State.save({ silent: true });`).exportOnce();
const money = fractional.sheets['שכר'].values.slice(1);
const [gross, taken, net] = ['נצבר', 'מקדמות', 'לתשלום'].map(head => column(fractional, head));
check('every row of שכר adds up: נצבר plus מקדמות is לתשלום',
    money.every(row => row[gross] === '' || row[gross] + row[taken] === row[net]),
    JSON.stringify(money));

// RED. A day whose site this phone does not have - an ordinary arrival order, because a
// day and the roster entry behind it are separate field writes and either can land
// first - is paid on שכר, listed on פירוט under its raw record id, and billed nowhere.
// One workbook, two sheets, two different answers about the same day's work.
const orphan = await phone(`
    assignPlace(State.schedule, '2026-08-10', 'w_01', 'actual', 'p_01');
    assignPlace(State.schedule, '2026-08-11', 'w_01', 'actual', 'p_09');
    State.save({ silent: true });`).exportOnce();
const orphanDetail = orphan.sheets['פירוט'].values.slice(1);
const orphanTotal = orphan.sheets['חיוב'].values.slice(-1)[0].slice(-1)[0];
check('a day the pay sheet pays for is a day the billing sheet bills for',
    orphanDetail.filter(row => row[4] !== 'נעדר').length === orphanTotal,
    `${orphanDetail.length} worked, ${orphanTotal} billed, אתר reads ` +
        JSON.stringify(orphanDetail.map(row => row[3])));

report();
