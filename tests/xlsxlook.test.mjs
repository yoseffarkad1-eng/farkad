// v202: the workbook made nicer to open, and not one figure moved.
//
//     node tests/xlsxlook.test.mjs
//
// The owner asked for the exported file to be "more organised and polished" (2026-11-16).
// What changed is only what the shipped library (SheetJS CE 0.18.5, vendor/) actually writes
// into the bytes: column widths, a number format per money and count cell, a filter on each
// table's header row, the header row repeated on every printed page, and a first sheet,
// «סיכום», whose headings link to the sheets they sum.
//
// THE QUESTION THIS SUITE EXISTS FOR is the opposite one: did any figure move? So every
// sheet that was in the file before is read back out of the bytes - by the zip and XML
// readers of tests/exports-proof.lib.mjs, which have never heard of SheetJS - and held cell
// for cell, value and type, against the same export written by v201's js/ui/reports.js out
// of Git, on the same synthetic record, in eight shapes: the page as it opens (both pay
// cycles, Rima, יוסף גבס), no counts, Rima without יוסף גבס, two clients' files, chosen men,
// an explicit month, and the gates shut.
//
// Then: the look is in the XML; «סיכום»'s every figure equals the cell or the column sum it
// was read from - and a hand-worked literal; «עובדי יוסף גבס» is in no total; the client's
// file carries no pay and no overview; a fault in the look still hands over v201's file; the
// CSV fallback is v201's byte for byte; every new Hebrew word, pinned (PROPOSED).
//
// What it CANNOT say: how Excel, Numbers or a phone's preview draw these bytes. The pictures
// were drawn by LibreOffice (tests/xlsxlook.render.mjs writes the two files) and looked at.

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { suite, check, same, given, report } from './runner.mjs';
import { tags, attr, SHEETJS_PRESENT, SHEETJS_PATH, SHEETJS_REASON } from './exports-proof.lib.mjs';
import { lookPhone, LOOK_WORKERS } from './xlsxlook.seed.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORTS = readFileSync(join(ROOT, 'js/ui/reports.js'), 'utf8');

given(`SheetJS is the shipped build (${SHEETJS_PATH})`, SHEETJS_PRESENT,
    SHEETJS_REASON || 'vendor/, the copy sw.js precaches');

// The build the owner holds: main at cd2cce1, served as v201.
const V201 = 'cd2cce1';
let V201_REPORTS = '';
try {
    V201_REPORTS = execFileSync('git', ['-C', ROOT, 'show', `${V201}:js/ui/reports.js`],
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
} catch (error) { V201_REPORTS = ''; }
given('v201\'s pay sheet is in this repository', V201_REPORTS.length > 0, V201);
given('and it is not the file under test, and knows no overview',
    V201_REPORTS !== REPORTS && V201_REPORTS.indexOf('SUMMARY_SHEET') === -1);

const SUMMARY = 'סיכום';
const GEVES = 'עובדי יוסף גבס';
const MONEY = '#,##0 "₪";-#,##0 "₪"';
const MONEY_AGORA = '#,##0.00 "₪";-#,##0.00 "₪"';
const COUNT = '0_);-0_);"–"_)';

// ---------------------------------------------------------------- reading the bytes

// What a part says about each cell: its value as text, its type, its style index.
function cellsOf(xml) {
    const out = {};
    // `<c ` with its space: `<cols>` and `<col>` are not cells.
    (xml.match(/<c\s[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []).forEach(cellXml => {
        const open = /^<c[^>]*>/.exec(cellXml)[0];
        const v = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(cellXml);
        out[attr(open, 'r')] = { t: attr(open, 't'), s: attr(open, 's'), v: v ? v[1] : null, f: /<f[\s>/]/.test(cellXml) };
    });
    return out;
}

// A part back to rows WITH its empty rows: SheetJS writes no <row> for an empty one, so a
// reader that lists <row>s closes the gap. «סיכום» has empty rows between its blocks, and a
// row's number is what its cell addresses are checked against.
const unescape = text => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
function gridOf(xml) {
    const rows = [];
    Object.entries(cellsOf(xml)).forEach(([ref, cell]) => {
        const [, col, row] = /^([A-Z]+)(\d+)$/.exec(ref);
        let c = 0;
        for (const ch of col) c = c * 26 + (ch.charCodeAt(0) - 64);
        const r = Number(row) - 1;
        while (rows.length <= r) rows.push([]);
        while (rows[r].length < c - 1) rows[r].push('');
        rows[r][c - 1] = cell.t ? unescape(cell.v || '') : Number(cell.v);
    });
    return rows;
}

// The workbook as parts: sheet name -> its XML, and each style index -> its format code.
function partsOf(book) {
    const rels = {};
    tags(book.parts['xl/_rels/workbook.xml.rels'].toString('utf8'), 'Relationship')
        .forEach(rel => { rels[attr(rel, 'Id')] = attr(rel, 'Target'); });
    const xml = {};
    tags(book.parts['xl/workbook.xml'].toString('utf8'), 'sheet').forEach(tag => {
        xml[attr(tag, 'name')] = book.parts['xl/' + String(rels[attr(tag, 'r:id')]).replace(/^\/?xl\//, '')].toString('utf8');
    });
    const styles = book.parts['xl/styles.xml'].toString('utf8');
    const codes = {};
    tags(styles, 'numFmt').forEach(tag => {
        codes[attr(tag, 'numFmtId')] = attr(tag, 'formatCode').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    });
    const xfs = (/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles) || ['', ''])[1];
    const formats = tags(xfs, 'xf').map(tag => {
        const id = attr(tag, 'numFmtId');
        return id === '0' ? 'General' : (codes[id] || `builtin:${id}`);
    });
    const workbookXml = book.parts['xl/workbook.xml'].toString('utf8').replace(/&apos;/g, '\'');
    return { xml, formats, workbookXml };
}

const formatOf = (parts, cell) => (cell && cell.s ? parts.formats[Number(cell.s)] : 'General');
const letters = index => {
    let n = index + 1;
    let out = '';
    while (n > 0) { out = String.fromCharCode(65 + ((n - 1) % 26)) + out; n = Math.floor((n - 1) / 26); }
    return out;
};
const sumOf = list => Math.round(list.reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0) * 100) / 100;

// ---------------------------------------------------------------- the shapes

const SHAPES = [
    { name: 'the page as it opens: both cycles, Rima, יוסף גבס', options: {} },
    { name: 'no Rima and no יוסף גבס on the record', options: { counts: false } },
    { name: 'Rima and no יוסף גבס', options: { geves: false } },
    { name: 'one client\'s file, a site with Rima', options: { section: 'sites', place: 'p_1' } },
    { name: 'one client\'s file, a site with יוסף גבס and no Rima', options: { section: 'sites', place: 'p_2' } },
    { name: 'two men chosen', options: { chosen: ['w_k', 'w_s'] } },
    { name: 'an explicit month', options: { range: { from: '2026-11-01', to: '2026-11-30' }, preset: 'custom' } },
    { name: 'the financial gates shut', options: { flags: { carryAdvances: false, ledgerWrites: false } } }
];

const books = {};
for (const shape of SHAPES) {
    const before = lookPhone(V201_REPORTS, shape.options);
    const after = lookPhone(REPORTS, shape.options);
    const old = await before.exportOnce();
    const now = await after.exportOnce();
    books[shape.name] = {
        old, now, oldParts: partsOf(old), nowParts: partsOf(now),
        oldSheets: before.run('JSON.stringify(reportSheets())'),
        nowSheets: after.run('JSON.stringify(reportSheets())'),
        phone: after,
        client: Boolean(shape.options.place)
    };
}
const MAIN = books[SHAPES[0].name];
given('the record has pay in both cycles, a billing grid, Rima and יוסף גבס',
    MAIN.old.names.join() === ['שכר', 'חיוב', 'בלי עובדי רימא', 'פירוט', 'רימא', GEVES].join()
        && MAIN.old.sheets['שכר'].values.some(row => /^שבועי/.test(String(row[row.length - 1])))
        && MAIN.old.sheets['שכר'].values.some(row => /^דו־שבועי/.test(String(row[row.length - 1]))),
    JSON.stringify(MAIN.old.names));

// ---------------------------------------------------------------- not one figure moved

suite('every sheet v201 wrote is in the file, cell for cell, value and type');

SHAPES.forEach(shape => {
    const { old, now, oldParts, nowParts, oldSheets, nowSheets, client } = books[shape.name];
    same(`${shape.name}: the rows reportSheets hands the builder are v201's`, nowSheets, oldSheets);
    same(`${shape.name}: the sheets, in v201's order${client ? '' : ', after «סיכום»'}`,
        now.names, client ? old.names : [SUMMARY].concat(old.names));
    same(`${shape.name}: the same filename`, now.filename, old.filename);
    old.names.forEach(name => {
        same(`${shape.name} · ${name}: every value`, now.sheets[name].values, old.sheets[name].values);
        same(`${shape.name} · ${name}: every type`, now.sheets[name].types, old.sheets[name].types);
        // The XML itself, cell by cell: the same addresses, the same stored text and type -
        // a style index is the only thing a cell may have gained.
        const a = cellsOf(oldParts.xml[name]);
        const b = cellsOf(nowParts.xml[name]);
        same(`${shape.name} · ${name}: the same cells at the same addresses, stored the same`,
            Object.keys(b).map(r => [r, b[r].t, b[r].v, b[r].f]), Object.keys(a).map(r => [r, a[r].t, a[r].v, a[r].f]));
        same(`${shape.name} · ${name}: the same extent`,
            /<dimension ref="([^"]*)"/.exec(nowParts.xml[name])[1], /<dimension ref="([^"]*)"/.exec(oldParts.xml[name])[1]);
        check(`${shape.name} · ${name}: still right to left`, /<sheetView[^>]*rightToLeft="1"/.test(nowParts.xml[name]));
    });
    check(`${shape.name}: nothing in the file is a formula`,
        Object.values(nowParts.xml).every(xml => !/<f[\s>/]/.test(xml)));
});

// ---------------------------------------------------------------- the look, in the XML

suite('the look is in the bytes: widths, formats, filters, print titles, links');

{
    const { now, nowParts } = MAIN;
    const data = now.names.filter(name => name !== SUMMARY);
    data.forEach(name => {
        const xml = nowParts.xml[name];
        const rows = now.sheets[name].values;
        const cols = tags(xml, 'col');
        check(`${name}: a width for every column`, cols.length === rows[0].length, `${cols.length} / ${rows[0].length}`);
        // Each column at least as wide as its longest cell as drawn (a lone note row runs on
        // over the empty cells beside it and does not count), and none wider than 100.
        const cells = cellsOf(xml);
        const short = [];
        rows.forEach((row, r) => {
            if (row.length === 1) return;
            row.forEach((value, c) => {
                const format = formatOf(nowParts, cells[letters(c) + (r + 1)]);
                let shown = [...String(value)].length;
                if (typeof value === 'number' && (format === MONEY || format === MONEY_AGORA)) {
                    const whole = Math.floor(Math.abs(value)).toLocaleString('en-US');
                    shown = whole.length + (format === MONEY_AGORA ? 3 : 0) + 2 + (value < 0 ? 1 : 0);
                }
                const width = Number(attr(cols[c] || '', 'width'));
                if (!(width >= Math.min(shown, 100))) short.push(`${letters(c)}${r + 1} ${value} in ${width}`);
            });
        });
        same(`${name}: no cell wider than its column`, short, []);
        check(`${name}: no column wider than 100 characters`, cols.every(col => Number(attr(col, 'width')) <= 101));
        check(`${name}: the header row repeats on every printed page`,
            nowParts.workbookXml.indexOf(`>'${name}'!$1:$1</definedName>`) !== -1
                && /_xlnm\.Print_Titles/.test(nowParts.workbookXml));
        check(`${name}: does not claim a frozen header row - the library cannot write one`, !/<pane\b/.test(xml));
    });

    // The pay sheet: its money columns in shekels, agorot only where a cell has them; its
    // counts, its names, its notes and its cycle as they were (General).
    const pay = now.sheets['שכר'].values;
    const payCells = cellsOf(nowParts.xml['שכר']);
    const moneyCols = ['שכר יומי', 'נצבר', pay[0][pay[0].indexOf('נצבר') + 1], 'לתשלום'].map(h => pay[0].indexOf(h));
    const wrong = [];
    pay.forEach((row, r) => row.forEach((value, c) => {
        const format = formatOf(nowParts, payCells[letters(c) + (r + 1)]);
        const want = r > 0 && moneyCols.includes(c) && typeof value === 'number'
            ? (Number.isInteger(value) ? MONEY : MONEY_AGORA) : 'General';
        if (format !== want) wrong.push(`${letters(c)}${r + 1} ${value}: ${format}`);
    }));
    same('שכר: ₪ on every money cell, agorot only on 412.5 and 2,062.5; every other cell as it was', wrong, []);
    check('and there IS a cell with agorot in the record, shown with them',
        pay.some(row => row.some((value, c) => moneyCols.includes(c) && typeof value === 'number' && !Number.isInteger(value))));
    same('שכר: the filter covers the header and every man', /<autoFilter ref="([^"]*)"/.exec(nowParts.xml['שכר'])[1],
        `A1:${letters(pay[0].length - 1)}${pay.length}`);

    const detail = now.sheets['פירוט'].values;
    const detailCells = cellsOf(nowParts.xml['פירוט']);
    const dayAt = detail[0].indexOf('לתשלום ליום');
    same('פירוט: the day\'s pay in shekels, everything else as it was',
        detail.flatMap((row, r) => row.map((value, c) => [formatOf(nowParts, detailCells[letters(c) + (r + 1)]),
            r > 0 && c === dayAt && typeof value === 'number' ? (Number.isInteger(value) ? MONEY : MONEY_AGORA) : 'General']))
            .filter(([is, want]) => is !== want), []);
    same('פירוט: the filter covers every day', /<autoFilter ref="([^"]*)"/.exec(nowParts.xml['פירוט'])[1],
        `A1:${letters(detail[0].length - 1)}${detail.length}`);

    // The four date-by-site grids: every count, zero as a dash; the filter stops above the
    // total line, so a sort never moves the total in among the days.
    ['חיוב', 'בלי עובדי רימא', 'רימא', GEVES].forEach(name => {
        const grid = now.sheets[name].values;
        const cells = cellsOf(nowParts.xml[name]);
        const off = [];
        grid.forEach((row, r) => row.forEach((value, c) => {
            const want = r > 0 && c > 0 && typeof value === 'number' ? COUNT : 'General';
            const is = formatOf(nowParts, cells[letters(c) + (r + 1)]);
            if (is !== want) off.push(`${letters(c)}${r + 1}: ${is}`);
        }));
        same(`${name}: every count in the count format, the dates and words as they were`, off, []);
        const lastDay = grid.reduce((at, row, r) => (r > 0 && /^\d{4}-\d{2}-\d{2}$/.test(String(row[0])) ? r : at), 0);
        same(`${name}: the filter covers the header and the days, and stops above the total`,
            /<autoFilter ref="([^"]*)"/.exec(nowParts.xml[name])[1], `A1:${letters(grid[0].length - 1)}${lastDay + 1}`);
        check(`${name}: and the total line is below it`, lastDay + 1 < grid.length && /^סה״כ/.test(String(grid[lastDay + 1][0])));
    });
    check('a grid holds zeros, so the dash is drawn somewhere',
        now.sheets['חיוב'].values.slice(1).some(row => row.includes(0)));

    // Every number format the file declares is one of the three this build writes.
    same('the file declares exactly the three formats it writes', [...new Set(nowParts.formats.filter(f => f !== 'General'))].sort(),
        [COUNT, MONEY, MONEY_AGORA].sort());

    // «סיכום»'s headings link to the sheets they name, inside the file.
    const links = tags(nowParts.xml[SUMMARY], 'hyperlink').map(tag => attr(tag, 'location').replace(/&apos;/g, '\''));
    same('סיכום: a link for every sheet it reads, each to a sheet of this file',
        links, ['שכר', 'פירוט', 'חיוב', 'בלי עובדי רימא', 'רימא', GEVES].map(name => `'${name}'!A1`));
    check('and every one of them names a sheet that is here', links.every(link => now.names.includes(link.slice(1, link.indexOf('\'', 1)))));
    check('סיכום: no filter and no print title of its own',
        !/<autoFilter/.test(nowParts.xml[SUMMARY]) && nowParts.workbookXml.indexOf(`'${SUMMARY}'!`) === -1);
}

// ---------------------------------------------------------------- «סיכום», figure by figure

suite('«סיכום»: every figure is a cell of a sheet or a sum of its column');

// Its rows, read back out of the file - the same reader as every other sheet.
const summaryOf = book => gridOf(book.nowParts.xml[SUMMARY]);
const blockAt = (rows, heading) => rows.findIndex(row => row.length === 1 && row[0] === heading);

{
    const rows = summaryOf(MAIN);
    const pay = MAIN.now.sheets['שכר'].values;
    const head = pay[0];
    const at = name => head.indexOf(name);
    const men = pay.slice(1).filter(row => typeof row[at('נוכחות')] === 'number');
    const cycle = label => men.filter(row => row[at('מחזור תשלום')] === label || String(row[at('מחזור תשלום')]).startsWith(`${label} · `));
    const line = (label, list) => [label, list.length, sumOf(list.map(r => r[at('נצבר')])),
        sumOf(list.map(r => r[at('נצבר') + 1])), sumOf(list.map(r => r[at('לתשלום')]))];
    const p = blockAt(rows, 'שכר');
    same('the pay block\'s heading row is the pay sheet\'s own headings', rows[p + 1],
        [head[at('מחזור תשלום')], 'עובדים', 'נצבר', head[at('נצבר') + 1], 'לתשלום']);
    same('weekly: how many men, and the sum of each money column over their rows', rows[p + 2], line('שבועי', cycle('שבועי')));
    same('fortnightly: the same', rows[p + 3], line('דו־שבועי', cycle('דו־שבועי')));
    same('the total: every man on the sheet, every column summed', rows[p + 4], line('סה״כ', men));
    // And by hand, from the seed (tests/xlsxlook.seed.mjs): weekly 2,250 + 1,200 + 420;
    // 300 taken and 420 of זיאד's carried 2,000 off his one day; fortnightly 4,500 + 2,020 +
    // 2,062.5 + 0, with 1,500 and 300 taken.
    same('the same figures, worked by hand', rows.slice(p + 2, p + 5), [
        ['שבועי', 3, 3870, -720, 3150],
        ['דו־שבועי', 4, 8582.5, -1800, 6782.5],
        ['סה״כ', 7, 12452.5, -2520, 9932.5]]);
    same('the one man with no daily rate, said and counted', rows[p + 5], ['עובדים בלי שכר יומי, שהשכר שלהם אינו בסכום: 1']);
    same('the men on the pay sheet are the seven of the crew', men.map(r => r[0]).sort(), LOOK_WORKERS.map(w => w.name).sort());

    const inv = MAIN.now.sheets['חיוב'].values;
    const foot = inv[inv.length - 1];
    const i = blockAt(rows, 'חיוב');
    same('חיוב: a row per site, its figure the total line\'s cell, then the grand total',
        rows.slice(i + 1, i + 2 + inv[0].length - 2 + 1),
        [['אתר', 'ימי עובד־אתר']].concat(inv[0].slice(1, -1).map((site, c) => [site, foot[c + 1]]))
            .concat([['סה״כ', foot[foot.length - 1]]]));
    const own = MAIN.now.sheets['בלי עובדי רימא'].values;
    same('and «בלי עובדי רימא»: that sheet\'s grand total', rows[i + inv[0].length + 1],
        ['בלי עובדי רימא', own[own.length - 1][own[0].length - 1]]);
    same('by hand: 15, 9, 9, 6 = 39 worker-site days, 30 of them his own men',
        rows.slice(i + 2, i + inv[0].length + 2).map(r => r[1]), [15, 9, 9, 6, 39, 30]);

    const rima = MAIN.now.sheets['רימא'].values;
    const rimaFoot = rima.find(row => row[0] === 'סה״כ עובדי רימא');
    const r = blockAt(rows, 'רימא');
    same('רימא: a row per site from its total line, the total, and the sheet\'s own note', rows.slice(r + 1, r + rima[0].length + 2),
        [['אתר', 'עובדי רימא']].concat(rima[0].slice(1, -1).map((site, c) => [site, rimaFoot[c + 1]]))
            .concat([['סה״כ עובדי רימא', rimaFoot[rimaFoot.length - 1]],
                ['עובדי רימא בלבד. אינם נכללים בשכר. בגיליון החיוב כל אחד מהם נספר כיום עובד־אתר אחד.']]));
    check('the billing total is his men and Rima\'s, as the two sheets say: 30 + 9 = 39',
        own[own.length - 1][own[0].length - 1] + rimaFoot[rimaFoot.length - 1] === foot[foot.length - 1]);

    const geves = MAIN.now.sheets[GEVES].values;
    const gevesFoot = geves.find(row => row[0] === 'סה״כ עובדי יוסף גבס');
    const g = blockAt(rows, GEVES);
    same('עובדי יוסף גבס: the LAST block - its sites, its total, its own note, and nothing after it', rows.slice(g),
        [[GEVES], ['אתר', GEVES]].concat(geves[0].slice(1, -1).map((site, c) => [site, gevesFoot[c + 1]]))
            .concat([['סה״כ עובדי יוסף גבס', gevesFoot[gevesFoot.length - 1]],
                ['עובדי יוסף גבס בלבד. אינם נכללים בשכר ואינם נכללים בחיוב.']]));
    same('by hand: 11 at הרצליה פיתוח, 2 at כפר סבא, 13', rows.slice(g + 2, g + 5).map(row => row[1]), [11, 2, 13]);

    // Money cells of the overview in shekels; its counts as they are.
    const cells = cellsOf(MAIN.nowParts.xml[SUMMARY]);
    same('סיכום: the money in shekels, agorot only where the sum has them; the men and the days plain',
        [p + 2, p + 3, p + 4].map(row => [0, 1, 2, 3, 4].map(c => formatOf(MAIN.nowParts, cells[letters(c) + (row + 1)]))),
        [['General', 'General', MONEY, MONEY, MONEY], ['General', 'General', MONEY_AGORA, MONEY, MONEY_AGORA],
            ['General', 'General', MONEY_AGORA, MONEY, MONEY_AGORA]]);
}

suite('«עובדי יוסף גבס» is in no total');

{
    const withList = summaryOf(MAIN);
    const without = summaryOf(books[SHAPES[2].name]);
    const g = blockAt(withList, GEVES);
    same('the overview without the list is the overview with it, cut before the list\'s block',
        withList.slice(0, g - 1), without);
    same('and what is cut is an empty row and the list\'s own block', withList[g - 1], []);
    const numbers = withList.slice(0, g).flat().filter(value => typeof value === 'number');
    check('no figure above the list\'s block changed for it', JSON.stringify(withList.slice(0, g - 1)) === JSON.stringify(without));
    check('and none of them is a total that the list\'s 13 went into: the billing total is the חיוב sheet\'s 39',
        numbers.includes(39) && !numbers.includes(39 + 13) && !numbers.includes(30 + 13));
    same('the full file without counts: no Rima or list block, and no line for a sheet that is not there',
        summaryOf(books[SHAPES[1].name]).filter(row => row.length === 1).map(row => row[0]).filter(text =>
            ['רימא', GEVES, 'בלי עובדי רימא'].includes(text)), []);
}

// ---------------------------------------------------------------- whose file

suite('the client\'s file: the billing grid, no overview, no pay');

[SHAPES[3], SHAPES[4]].forEach(shape => {
    const { now, nowParts } = books[shape.name];
    check(`${shape.name}: no «סיכום»`, !now.names.includes(SUMMARY), JSON.stringify(now.names));
    check(`${shape.name}: no worker's name and no pay word anywhere in its data`,
        !LOOK_WORKERS.some(w => now.text.includes(w.name)) && !/נצבר|לתשלום|שכר יומי/.test(now.text));
    check(`${shape.name}: no cell in shekels`, nowParts.formats.every(f => f !== MONEY && f !== MONEY_AGORA)
        || Object.values(nowParts.xml).every(xml => Object.values(cellsOf(xml)).every(cell =>
            ![MONEY, MONEY_AGORA].includes(formatOf(nowParts, cell)))));
    check(`${shape.name}: not «עובדי יוסף גבס» either`, !now.names.includes(GEVES));
});

suite('two men chosen: their pay, summed, and nobody else\'s');

{
    const chosen = books[SHAPES[5].name];
    const rows = summaryOf(chosen);
    same('the overview says whose file it is, under the period', rows.slice(0, 4).map(row => row[0]).slice(3),
        ['בקובץ רק העובדים שנבחרו.']);
    const p = blockAt(rows, 'שכר');
    same('one man in each cycle', rows.slice(p + 2, p + 5).map(row => row.slice(0, 2)),
        [['שבועי', 1], ['דו־שבועי', 1], ['סה״כ', 2]]);
    same('and no billing, Rima or list block', ['חיוב', 'רימא', GEVES, 'בלי עובדי רימא'].map(h => blockAt(rows, h)), [-1, -1, -1, -1]);
    const others = LOOK_WORKERS.filter(w => !['w_k', 'w_s'].includes(w.id)).map(w => w.name);
    same('no other man\'s name anywhere in the file', others.filter(name => chosen.now.text.includes(name)), []);
}

suite('the gates shut, and an explicit month');

{
    const shut = books[SHAPES[7].name];
    const rows = summaryOf(shut);
    const pay = shut.now.sheets['שכר'].values;
    same('the deduction column is named as the pay sheet names it', rows[blockAt(rows, 'שכר') + 1][3], pay[0][pay[0].indexOf('נצבר') + 1]);
    const month = books[SHAPES[6].name];
    same('the period line is the file\'s range', summaryOf(month)[1], ['תקופה: 01/11/2026 עד 30/11/2026']);
    same('and the page as it opens says its fortnight', summaryOf(MAIN)[1], ['תקופה: 13/11/2026 עד 26/11/2026']);
}

// ---------------------------------------------------------------- the look never costs the file

suite('a fault in the look: the file goes out as v201 wrote it');

{
    const broken = lookPhone(REPORTS, {});
    broken.run('dressSheet = function () { throw new Error("a fault in the look"); }; 1');
    const book = await broken.exportOnce();
    const old = MAIN.old;
    same('one workbook, v201\'s sheets and no overview', book.names, old.names);
    same('every value and type v201\'s', old.names.map(name => [book.sheets[name].values, book.sheets[name].types]),
        old.names.map(name => [old.sheets[name].values, old.sheets[name].types]));
    same('and no width, filter or format: the plain file', Object.values(partsOf(book).xml).map(xml =>
        [/<cols>/.test(xml), /<autoFilter/.test(xml), / s="[1-9]/.test(xml)]), old.names.map(() => [false, false, false]));
    const summaryFault = lookPhone(REPORTS, {});
    summaryFault.run('workbookSummary = function () { throw new Error("a fault in the overview"); }; 1');
    const plain = await summaryFault.exportOnce();
    same('a fault in the overview too', plain.names, old.names);
}

suite('the CSV fallback is v201\'s, byte for byte');

for (const shape of [SHAPES[0], SHAPES[3], SHAPES[5]]) {
    const a = lookPhone(V201_REPORTS, Object.assign({ sheetjs: false }, shape.options));
    const b = lookPhone(REPORTS, Object.assign({ sheetjs: false }, shape.options));
    await a.run('exportReports()');
    await b.run('exportReports()');
    check(`${shape.name}: files were handed over`, a.downloads.length > 0 && a.caught.length === 0, String(a.downloads.length));
    same(`${shape.name}: the same files, the same bytes`, b.downloads, a.downloads);
}

// ---------------------------------------------------------------- the words

suite('every new word, as pinned (PROPOSED - not read by the owner)');

{
    const g = name => MAIN.phone.run(name);
    same('the sheet\'s name', g('SUMMARY_SHEET'), SUMMARY);
    same('its words', JSON.parse(g('JSON.stringify(SUMMARY_TEXT)')), {
        title: 'סיכום הדוח',
        range: 'תקופה',
        made: 'הופק',
        chosen: 'בקובץ רק העובדים שנבחרו.',
        source: 'כל מספר כאן נספר או חובר מהגיליון ששמו בכותרת שמעליו, והכותרת מקשרת אליו.',
        men: 'עובדים',
        unpriced: 'עובדים בלי שכר יומי, שהשכר שלהם אינו בסכום',
        detail: 'כל יום עבודה של כל עובד',
        site: 'אתר',
        siteDays: 'ימי עובד־אתר',
        rimaCount: 'עובדי רימא'
    });
    same('the three formats', [g('XLSX_MONEY'), g('XLSX_MONEY_AGORA'), g('XLSX_COUNT')], [MONEY, MONEY_AGORA, COUNT]);
    // The whole overview of the page as it opens, word for word - every line a person reads.
    same('the overview of the page as it opens, every row', summaryOf(MAIN), [
        ['סיכום הדוח'],
        ['תקופה: 13/11/2026 עד 26/11/2026'],
        ['הופק: 25/11/2026'],
        ['כל מספר כאן נספר או חובר מהגיליון ששמו בכותרת שמעליו, והכותרת מקשרת אליו.'],
        [],
        ['שכר'],
        ['מחזור תשלום', 'עובדים', 'נצבר', 'נוכה מהשכר', 'לתשלום'],
        ['שבועי', 3, 3870, -720, 3150],
        ['דו־שבועי', 4, 8582.5, -1800, 6782.5],
        ['סה״כ', 7, 12452.5, -2520, 9932.5],
        ['עובדים בלי שכר יומי, שהשכר שלהם אינו בסכום: 1'],
        [],
        ['פירוט'],
        ['כל יום עבודה של כל עובד'],
        [],
        ['חיוב'],
        ['אתר', 'ימי עובד־אתר'],
        ['פרדסיה', 15],
        ['הרצליה פיתוח', 9],
        ['רמת השרון - מגדל', 9],
        ['כפר סבא', 6],
        ['סה״כ', 39],
        ['בלי עובדי רימא', 30],
        [],
        ['רימא'],
        ['אתר', 'עובדי רימא'],
        ['פרדסיה', 5],
        ['רמת השרון - מגדל', 4],
        ['סה״כ עובדי רימא', 9],
        ['עובדי רימא בלבד. אינם נכללים בשכר. בגיליון החיוב כל אחד מהם נספר כיום עובד־אתר אחד.'],
        [],
        [GEVES],
        ['אתר', GEVES],
        ['הרצליה פיתוח', 11],
        ['כפר סבא', 2],
        ['סה״כ עובדי יוסף גבס', 13],
        ['עובדי יוסף גבס בלבד. אינם נכללים בשכר ואינם נכללים בחיוב.']
    ]);
}

report();
