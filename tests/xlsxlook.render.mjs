// Not a suite: writes the same synthetic record's workbook twice - by v201's pay sheet out of
// Git and by this checkout's - for a person to open, or for LibreOffice to draw.
//
//     node tests/xlsxlook.render.mjs <dir>
//
// Writes <dir>/before.xlsx and <dir>/after.xlsx. Asserts nothing.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lookPhone } from './xlsxlook.seed.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const V201 = 'cd2cce1';
const out = process.argv[2];
if (!out) { console.error('usage: node tests/xlsxlook.render.mjs <dir>'); process.exit(2); }
mkdirSync(out, { recursive: true });

const before = execFileSync('git', ['-C', ROOT, 'show', `${V201}:js/ui/reports.js`],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const after = readFileSync(join(ROOT, 'js/ui/reports.js'), 'utf8');

for (const [name, source] of [['before', before], ['after', after]]) {
    const book = await lookPhone(source).exportOnce();
    writeFileSync(join(out, `${name}.xlsx`), book.bytes);
    console.log(name, book.names.join(' | '));
}
