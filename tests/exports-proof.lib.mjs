// The plumbing the exports-proof suites share: a phone that can export, and a reader
// that opens the .xlsx it produced without asking SheetJS what it wrote.
//
// Not a suite. It asserts nothing; it is imported by tests/exports-proof.xlsx.mjs and
// tests/exports-proof.advances.mjs so that neither of them carries its own copy of a
// zip reader that could drift from the other's.
//
// The zip and XML readers below are the same technique tests/xlsx.test.mjs uses and are
// deliberately independent of the library under test: a library asked to read back its
// own output confirms anything it wrote, including a part no spreadsheet can open.

import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { makeDevice } from './harness.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
export const REPORTS = readFileSync(ROOT + 'js/ui/reports.js', 'utf8');
// THE SHIPPED BYTES. vendor/ is what the service worker precaches and what a phone
// runs; node_modules holds a different build of the same version.
export const SHEETJS_PATH = process.env.FARKAD_SHEETJS || (ROOT + 'vendor/xlsx-0.18.5.min.js');
export const SHEETJS_PRESENT = existsSync(SHEETJS_PATH);
export const SHEETJS_CODE = SHEETJS_PRESENT ? readFileSync(SHEETJS_PATH, 'utf8') : '';

// ---------------------------------------------------------------- a zip reader, by hand

export function unzip(buf) {
    let eocd = -1;
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
        // The LOCAL header carries its own extra field, whose length is not the central
        // one; reading the central length here lands inside the payload.
        if (buf.readUInt32LE(localAt) !== 0x04034b50) throw new Error('bad local header');
        const start = localAt + 30 + buf.readUInt16LE(localAt + 26) + buf.readUInt16LE(localAt + 28);
        const raw = buf.subarray(start, start + compressed);
        parts[name] = method === 0 ? Buffer.from(raw) : inflateRawSync(raw);
        at += 46 + nameLen + extraLen + commentLen;
    }
    return parts;
}

// ---------------------------------------------------------------- an xml reader, by hand

export const attr = (tag, name) => {
    const found = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
    return found ? found[1] : null;
};
export const tags = (xml, name) => xml.match(new RegExp(`<${name}(?:\\s[^>]*)?/?>`, 'g')) || [];
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

// A worksheet part back to rows. The cell TYPE is kept, and so is whether the cell
// carried a FORMULA element - which is the whole question a spreadsheet-injection check
// is asking, and it is invisible in the value.
function sheetOf(xml, strings) {
    const values = [];
    const types = [];
    const formulas = [];
    (xml.match(/<row[\s\S]*?<\/row>|<row[^>]*\/>/g) || []).forEach(rowXml => {
        const row = [];
        const rowTypes = [];
        const rowFormulas = [];
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
                // <v xml:space="preserve"> is what SheetJS writes for a value with a
                // leading tab in it, and a reader that insists on a bare <v> reads such a
                // cell as empty - which would quietly turn a name this suite is hunting
                // into "nothing was exported".
                const found = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(cellXml);
                const raw = found ? unescapeXml(found[1]) : '';
                text = type === 's' ? (strings[Number(raw)] || '') : raw;
            }
            const formula = /<f(?:\s[^>]*)?>([\s\S]*?)<\/f>|<f[^>]*\/>/.exec(cellXml);
            while (row.length < index) { row.push(''); rowTypes.push('str'); rowFormulas.push(null); }
            row[index] = type ? text : Number(text);
            rowTypes[index] = type || 'number';
            rowFormulas[index] = formula ? (formula[1] === undefined ? '' : formula[1]) : null;
        });
        values.push(row);
        types.push(rowTypes);
        formulas.push(rowFormulas);
    });
    return { values, types, formulas };
}

export function workbookOf(bytes) {
    const parts = unzip(bytes);
    const rels = {};
    tags(parts['xl/_rels/workbook.xml.rels'].toString('utf8'), 'Relationship')
        .forEach(rel => { rels[attr(rel, 'Id')] = attr(rel, 'Target'); });
    const strings = sharedStrings(parts['xl/sharedStrings.xml']
        && parts['xl/sharedStrings.xml'].toString('utf8'));
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
    // Only the parts that carry DATA: styles, the theme and docProps are full of stock
    // names and round numbers, and a leak check that reads them never fails honestly.
    const text = worksheets.map(name => parts[name].toString('utf8'))
        .concat(parts['xl/sharedStrings.xml'] ? [parts['xl/sharedStrings.xml'].toString('utf8')] : [])
        .join('\n');
    return { bytes, parts, names, sheets, worksheets, text, strings };
}

// ---------------------------------------------------------------- one phone, headless

// reports.js is a classic script, so it is loaded into a device's scope and its
// functions are called there (js/ui/share.js, which holds downloadCsv, is already one
// of the files tests/harness.mjs loads into every device). The last inch of the export - XLSX.writeFile,
// which would put the file on a disk - is the only thing redirected: book_new,
// aoa_to_sheet, the RTL flag, the sheet names and the filename are all still the app's.
export function phone(seed, options = {}) {
    const device = makeDevice(options.flags ? { flags: options.flags } : undefined);

    // Installed BEFORE reports.js runs, so a fetch added at the top of the file is
    // recorded here rather than throwing on a missing document.head.
    const fetched = [];
    let onAppend = null;
    device.ctx.document.head = {
        appendChild(tag) { fetched.push(tag); if (onAppend) onAppend(tag); }
    };
    // Every door out of this device that reaches a network. None of them should be
    // touched by an export on a phone that has the app installed.
    const network = [];
    device.ctx.fetch = (...args) => {
        network.push({ via: 'fetch', args: args.map(String) });
        return Promise.reject(new Error('the export must not reach the network'));
    };
    device.ctx.XMLHttpRequest = function () {
        network.push({ via: 'XMLHttpRequest' });
        throw new Error('the export must not reach the network');
    };
    device.ctx.importScripts = () => { network.push({ via: 'importScripts' }); };

    const told = [];
    device.ctx.askTell = message => { told.push(message); };
    const confirmed = [];
    device.ctx.askConfirm = opts => { confirmed.push(opts); return Promise.resolve(true); };
    const chosen = [];
    const answers = [];
    device.ctx.askChoice = opts => {
        chosen.push(opts);
        return Promise.resolve(answers.length ? answers.shift() : null);
    };

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
    run(`REPORT_RANGE.from = '${options.from || '2026-08-01'}';`
        + ` REPORT_RANGE.to = '${options.to || '2026-08-31'}';`
        + ` REPORT_SECTION = '${options.section || 'workers'}';`
        + ` INVOICE_PLACE = ${options.place ? `'${options.place}'` : 'null'};`);
    if (seed) run(seed);

    const caught = [];
    if (options.sheetjs !== false) {
        vm.runInContext(SHEETJS_CODE, device.ctx, { filename: 'xlsx.full.min.js' });
        device.ctx.__caught = caught;
        run(`XLSX.writeFile = function (wb, filename) {
                 __caught.push({ filename: filename,
                     bytes: XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) });
             };`);
    }

    return {
        device, run, caught, fetched, network, told, confirmed, chosen, answers,
        downloads: device.downloads,
        failOnFetch: () => { onAppend = tag => tag.onerror(); },
        async exportOnce() {
            caught.length = 0;
            await run('exportReports()');
            if (caught.length !== 1) {
                throw new Error(`exportReports wrote ${caught.length} workbooks, not one`);
            }
            return workbookOf(Buffer.from(caught[0].bytes));
        }
    };
}
