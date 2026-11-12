// THE READABILITY AUDIT: every screen of the app, measured, written down. Not a suite - it
// asserts nothing and is in no gate; tests/largetext.browser.mjs is the suite, and walks
// the same list (tests/screens.mjs).
//
//   node tests/readability.audit.mjs <out.md> [--large] [--shots <dir>] [--tree <dir>]
//
// For both phones (375x667, 440x956) and both schemes it opens every screen and dialog on
// a seeded record and records, for EVERY visible text node, drawn word and field: the
// computed font-size, the weight, the line-height and the contrast against the ground it
// is really drawn on. The file it writes lists everything under 18px and everything under
// 7:1 (4.5:1 in bold), every target under 52px, and what is off the side or cut - by
// screen, the worst screen first and, on each screen, the worst offender first.
//
// --large measures the large display («תצוגה גדולה») instead of the app as everybody has it.
// --shots writes a JPEG of each screen on both phones, dark. Synthetic names. NOT a real phone.
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from './serve.mjs';
import { launchLocalBrowser } from './network-guard.mjs';
import { PHONES, SCHEMES, openApp, walk, measure } from './screens.mjs';

const args = process.argv.slice(2);
const large = args.includes('--large');
const shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : '';
const tree = args.includes('--tree') ? args[args.indexOf('--tree') + 1] : '';
const out = args.find((arg, at) => !arg.startsWith('--') && args[at - 1] !== '--shots' && args[at - 1] !== '--tree') || 'AUDIT.md';
if (shots) mkdirSync(shots, { recursive: true });

// --tree <dir> measures ANOTHER tree of the app (a `git archive` of an older build) with
// this file's walker: how "before" is measured rather than remembered.
const root = tree || new URL('..', import.meta.url).pathname;
const server = await serve(root);
const browser = await launchLocalBrowser(chromium, { executablePath: process.env.CHROME_PATH });

const runs = [];
for (const [width, height] of PHONES) {
    for (const scheme of SCHEMES) {
        const { context, page, errors } = await openApp(browser, server.url, { width, height, scheme, large });
        const screens = [];
        await walk(page, async (screen, failed) => {
            const read = failed ? null : await measure(page, screen.scope);
            screens.push({ name: screen.name, failed, read });
            if (shots && scheme === 'dark') {
                await page.screenshot({ path: join(shots, `${screen.name.replace(/[^a-z0-9]+/gi, '-')}${large ? '-on' : '-off'}-${width}.jpg`), type: 'jpeg', quality: 70 });
            }
        });
        runs.push({ width, height, scheme, screens, errors });
        await context.close();
        console.log(`${width}x${height} ${scheme}: ${screens.length} screens, ${screens.filter(s => s.failed).length} would not open, ${errors.length} errors`);
        screens.filter(s => s.failed).forEach(s => console.log(`   NOT OPENED ${s.name}: ${s.failed}`));
        errors.slice(0, 5).forEach(e => console.log(`   ERROR ${e}`));
    }
}
await browser.close();
server.close();

const live = t => !t.off;
const count = (list, test) => list.filter(test).length;
const lines = [];
const say = text => lines.push(text);
say(`# Readability audit - ${large ? 'the large display («תצוגה גדולה») ON' : 'the app as every phone has it (large display OFF)'}${tree ? ' - tree: ' + tree : ''}`);
say('');
say('Measured, not eyeballed: Chromium with emulated touch, a seeded record with synthetic names,');
say('every visible text node, drawn word (`::before`/`::after`) and field of every screen and dialog');
say('in `tests/screens.mjs`. Size is the computed `font-size`; contrast is the text\'s colour (with every');
say('ancestor\'s opacity) against the ground actually painted under it. A disabled control is listed');
say('apart: it is meant to step back. NOT a real phone, and nobody far-sighted has looked at it.');
say('');
say('## Headline');
say('');
say('| phone | scheme | screens | text nodes | under 16px | under 18px | under 4.5:1 | under 7:1 | line-height under 1.4 | weight under 500 | targets under 44px | targets under 52px | fields under 16px |');
say('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const run of runs) {
    const texts = run.screens.flatMap(s => s.read ? s.read.texts.filter(live) : []);
    const targets = run.screens.flatMap(s => s.read ? s.read.targets : []);
    say(`| ${run.width}x${run.height} | ${run.scheme} | ${run.screens.length} | ${texts.length} | ${count(texts, t => t.size < 16)} | ${count(texts, t => t.size < 18)} | ${count(texts, t => t.contrast !== null && t.contrast < 4.5)} | ${count(texts, t => t.contrast !== null && t.contrast < 7)} | ${count(texts, t => t.lineHeight !== null && t.lineHeight < 1.4 && t.lines > 1)} | ${count(texts, t => t.weight < 500)} | ${count(targets, t => t.w < 43.5 || t.h < 43.5)} | ${count(targets, t => t.w < 51.5 || t.h < 51.5)} | ${count(texts, t => t.kind === 'field' && t.size < 16)} |`);
}
say('');
say('(line-height is counted only where the text actually ran to a second line.)');
say('');
say('## By screen (the largest count of the four runs)');
say('');
say('| screen | text nodes | under 16px | under 18px | under 4.5:1 | under 7:1 | smallest |');
say('|---|---|---|---|---|---|---|');
const names = runs[0].screens.map(s => s.name);
const perScreen = names.map(name => {
    const found = runs.map(run => run.screens.find(s => s.name === name));
    const reads = found.filter(s => s && s.read).map(s => s.read.texts.filter(live));
    const most = fn => Math.max(0, ...reads.map(fn));
    return { name, nodes: most(r => r.length), u16: most(r => count(r, t => t.size < 16)), u18: most(r => count(r, t => t.size < 18)),
        c45: most(r => count(r, t => t.contrast !== null && t.contrast < 4.5)), c7: most(r => count(r, t => t.contrast !== null && t.contrast < 7)),
        min: Math.min(99, ...reads.flatMap(r => r.map(t => t.size))), failed: found.find(s => s && s.failed) };
});
perScreen.slice().sort((a, b) => b.u16 - a.u16 || b.u18 - a.u18).forEach(s =>
    say(`| ${s.name}${s.failed ? ' (NOT OPENED: ' + s.failed.failed + ')' : ''} | ${s.nodes} | ${s.u16} | ${s.u18} | ${s.c45} | ${s.c7} | ${s.min}px |`));
say('');

const group = (rows, key) => {
    const map = new Map();
    rows.forEach(row => {
        const k = key(row);
        if (!map.has(k)) map.set(k, { row, n: 0, words: new Set() });
        const g = map.get(k);
        g.n += 1;
        if (g.words.size < 3) g.words.add(row.words);
    });
    return [...map.values()];
};
// Within every section the screens stand the worst first: by how many of their text nodes
// are under 16px, then under 18px - the order of the table above.
const worstFirst = perScreen.slice().sort((a, b) => b.u16 - a.u16 || b.u18 - a.u18).map(s => s.name);
const section = (title, pick, order, cols) => {
    say(`## ${title}`);
    say('');
    for (const name of worstFirst) {
        const rows = [];
        runs.forEach(run => {
            const screen = run.screens.find(s => s.name === name);
            if (!screen || !screen.read) return;
            pick(screen.read).forEach(t => rows.push({ ...t, run: `${run.width} ${run.scheme}` }));
        });
        if (!rows.length) continue;
        const groups = group(rows, cols.key).sort((a, b) => order(a.row, b.row));
        say(`### ${name}`);
        say('');
        say(cols.head);
        say(cols.head.replace(/[^|]+/g, '---'));
        groups.slice(0, 60).forEach(g => say(cols.line(g)));
        say('');
    }
};
const where = g => '`' + g.row.where.replace(/\|/g, '\\|') + '`';
const words = g => [...g.words].map(w => w.replace(/\|/g, '\\|')).join(' · ');
section('Everything under 18px (the smallest first)', read => read.texts.filter(t => live(t) && t.size < 18), (a, b) => a.size - b.size || a.contrast - b.contrast,
    { key: t => `${t.where}|${t.size}|${t.weight}`, head: '| size | weight | line-height | kind | where | says | count (4 runs) |',
        line: g => `| **${g.row.size}px** | ${g.row.weight} | ${g.row.lineHeight === null ? 'normal' : g.row.lineHeight} | ${g.row.kind} | ${where(g)} | ${words(g)} | ${g.n} |` });
section('Everything under 7:1 (the weakest first; under 4.5:1 in bold)', read => read.texts.filter(t => live(t) && t.contrast !== null && t.contrast < 7), (a, b) => a.contrast - b.contrast,
    { key: t => `${t.where}|${t.ink}|${t.ground}`, head: '| contrast | ink | ground | size | where | says | first seen | count |',
        line: g => `| ${g.row.contrast < 4.5 ? '**' + g.row.contrast + '**' : g.row.contrast}${g.row.image ? ' (over a picture)' : ''}${g.row.faded ? ' (faded)' : ''} | ${g.row.ink} | ${g.row.ground} | ${g.row.size}px | ${where(g)} | ${words(g)} | ${g.row.run} | ${g.n} |` });
section('Disabled controls (listed apart; they are meant to step back)', read => read.texts.filter(t => t.off && (t.size < 18 || (t.contrast !== null && t.contrast < 4.5))), (a, b) => a.size - b.size,
    { key: t => `${t.where}|${t.size}`, head: '| size | contrast | where | says | count |',
        line: g => `| ${g.row.size}px | ${g.row.contrast} | ${where(g)} | ${words(g)} | ${g.n} |` });
section('Targets under 52px in either dimension (under 44px in bold)', read => read.targets.filter(t => t.w < 51.5 || t.h < 51.5), (a, b) => Math.min(a.w, a.h) - Math.min(b.w, b.h),
    { key: t => `${t.where}|${Math.round(t.w)}x${Math.round(t.h)}`, head: '| size | where | says | count |',
        line: g => `| ${g.row.w < 43.5 || g.row.h < 43.5 ? '**' + g.row.w + 'x' + g.row.h + '**' : g.row.w + 'x' + g.row.h} | ${where(g)} | ${words(g)} | ${g.n} |` });
section('Off the side, or cut', read => read.offside.map(o => ({ ...o, words: `${o.left}..${o.right}`, kind: 'off the side' }))
    .concat(read.cut.map(c => ({ ...c, kind: c.ellipsis ? 'cut with an ellipsis' : 'CUT' }))), (a, b) => a.kind.localeCompare(b.kind),
    { key: t => `${t.where}|${t.kind}`, head: '| what | where | says | count |',
        line: g => `| ${g.row.kind} ${g.row.by || ''} | ${where(g)} | ${words(g)} | ${g.n} |` });
writeFileSync(out, lines.join('\n') + '\n');
console.log(`written: ${out}`);
