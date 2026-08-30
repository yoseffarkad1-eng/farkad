// A test that fails when a test stops testing.
//
// Every other suite here asks the app a question. This one asks the suites a question:
// is each assertion capable of failing at all? A check that cannot fail is worse than
// no check - it prints PASS beside a sentence nobody has proved, and it goes on printing
// it after the behaviour it names is gone. `given('...', xs.length >= 0)` is the whole
// failure in one line: it reads as a precondition, it aborts the run when it is false,
// and it can never be false.
//
// ON THE HOUSE RULE THAT A CHECK IS AN OBSERVATION THROUGH PRODUCTION FUNCTIONS AND
// DURABLE BYTES. It is kept here, with the subject moved: what this suite observes is
// the test corpus, so the durable bytes are the real tests/*.mjs on disk, read at run
// time and never mocked, and the production function is `scanFile` below. An instrument
// is not believed before it is proved, so the first suite feeds `scanFile` a written
// offender and a written near-miss for every rule and requires it to fire on one and
// stay silent on the other. A lint whose rules were never made to fire is the same
// vacuous PASS it exists to hunt.
//
// It reads no js/ source and asserts nothing about the app from text. The one claim it
// makes about the app - that the count the flagged tautology compares to zero really is
// zero there - is made the way every other suite makes one: on a device, through
// addAdvance and ledgerEntries.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, dirname, join } from 'node:path';
import { makeDevice } from './harness.mjs';
import { suite, check, given, report } from './runner.mjs';

const CORPUS_DIR = dirname(fileURLToPath(import.meta.url));
const SPACE = ' ';

// ---------------------------------------------------------------- the instrument
//
// Strings, templates, comments and regex literals are replaced by spaces of the same
// length, newlines kept, so every offset in the masked copy still names the same
// character in the original. Without the regex arm the apostrophe inside
// /const APP_VERSION = '[^']*';/ (tests/update.test.mjs) opens a string that never
// closes, and every assertion after it in the file scans as one long literal and is
// silently never examined - a lint with a blind spot the size of a file.
function mask(src) {
    const out = new Array(src.length);
    let i = 0;
    let last = '';
    const keep = ch => (ch === '\n' ? '\n' : SPACE);
    const blank = (from, to) => { for (let j = from; j < to; j += 1) out[j] = keep(src[j]); };
    while (i < src.length) {
        const ch = src[i];
        const next = src[i + 1];
        if (ch === '/' && next === '/') {
            let j = i; while (j < src.length && src[j] !== '\n') j += 1;
            blank(i, j); i = j; continue;
        }
        if (ch === '/' && next === '*') {
            let j = i + 2;
            while (j < src.length && !(src[j] === '*' && src[j + 1] === '/')) j += 1;
            j = Math.min(j + 2, src.length);
            blank(i, j); i = j; continue;
        }
        if (ch === '"' || ch === "'") {
            let j = i + 1;
            while (j < src.length && src[j] !== ch) { if (src[j] === '\\') j += 1; j += 1; }
            j = Math.min(j + 1, src.length);
            out[i] = ch; blank(i + 1, j - 1);
            if (j - 1 < src.length) out[j - 1] = ch;
            i = j; last = 'val'; continue;
        }
        if (ch === '`') {
            // The interpolations go too. A comma inside `${a}, ${b}` is not an argument
            // separator, and reading it as one splits a two-argument check into three
            // and drops the condition on the floor unexamined.
            let j = i + 1; let depth = 0;
            while (j < src.length) {
                if (src[j] === '\\') { j += 2; continue; }
                if (src[j] === '$' && src[j + 1] === '{') { depth += 1; j += 2; continue; }
                if (src[j] === '}' && depth > 0) { depth -= 1; j += 1; continue; }
                if (src[j] === '`' && depth === 0) break;
                j += 1;
            }
            j = Math.min(j + 1, src.length);
            out[i] = '`'; blank(i + 1, j - 1);
            if (j - 1 < src.length) out[j - 1] = '`';
            i = j; last = 'val'; continue;
        }
        // A `/` after a value is division; after anything else it opens a regex.
        if (ch === '/' && last !== 'val') {
            let j = i + 1; let inClass = false; let closed = false;
            while (j < src.length && src[j] !== '\n') {
                if (src[j] === '\\') { j += 2; continue; }
                if (src[j] === '[') inClass = true;
                else if (src[j] === ']') inClass = false;
                else if (src[j] === '/' && !inClass) { closed = true; break; }
                j += 1;
            }
            if (closed) {
                let k = j + 1;
                while (k < src.length && /[a-z]/.test(src[k])) k += 1;
                out[i] = '/'; blank(i + 1, k);
                i = k; last = 'val'; continue;
            }
        }
        out[i] = ch;
        if (!/\s/.test(ch)) last = /[A-Za-z0-9_$)\]]/.test(ch) ? 'val' : ch;
        i += 1;
    }
    return out.join('');
}

function matchBracket(masked, open) {
    let depth = 0;
    for (let i = open; i < masked.length; i += 1) {
        const ch = masked[i];
        if (ch === '(' || ch === '[' || ch === '{') depth += 1;
        else if (ch === ')' || ch === ']' || ch === '}') { depth -= 1; if (depth === 0) return i; }
    }
    return -1;
}

function splitTop(masked, from, to) {
    const parts = []; let depth = 0; let start = from;
    for (let i = from; i < to; i += 1) {
        const ch = masked[i];
        if (ch === '(' || ch === '[' || ch === '{') depth += 1;
        else if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
        else if (ch === ',' && depth === 0) { parts.push([start, i]); start = i + 1; }
    }
    if (to > start) parts.push([start, to]);
    return parts;
}

const lineIndex = src => {
    const starts = [0];
    for (let i = 0; i < src.length; i += 1) if (src[i] === '\n') starts.push(i + 1);
    return offset => {
        let lo = 0; let hi = starts.length - 1;
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= offset) lo = mid; else hi = mid - 1; }
        return lo + 1;
    };
};

const tidy = text => text.replace(/\s+/g, ' ').trim();

// Every check/same/given/suite call site in one file, with each argument's original text
// (so an offender is reported as it was written) and its masked text (so a Hebrew comma
// is never mistaken for an argument boundary).
function scanFile(file, src) {
    const masked = mask(src);
    const lineOf = lineIndex(src);
    const sites = [];
    const re = /\b(check|same|given|suite)\s*\(/g;
    let m;
    while ((m = re.exec(masked)) !== null) {
        const before = m.index > 0 ? masked[m.index - 1] : ' ';
        // `page.check(` and `precheck(` belong to somebody else, not to the runner.
        if (/[.A-Za-z0-9_$]/.test(before)) continue;
        const open = m.index + m[0].length - 1;
        const close = matchBracket(masked, open);
        if (close < 0) continue;
        sites.push({
            file,
            fn: m[1],
            start: m.index,
            line: lineOf(m.index),
            // Trimmed by the MASKED slice, never independently: a leading comment is
            // blank there and not in the original, and two slices of different lengths
            // make every offset a rule computes point at the wrong character.
            args: splitTop(masked, open + 1, close).map(([a, b]) => {
                const blanked = masked.slice(a, b);
                let s = 0; let e = blanked.length;
                while (s < e && /\s/.test(blanked[s])) s += 1;
                while (e > s && /\s/.test(blanked[e - 1])) e -= 1;
                return { text: src.slice(a + s, a + e), masked: blanked.slice(s, e) };
            })
        });
        re.lastIndex = close;
    }
    return { sites, masked, src, lineOf };
}

// ---------------------------------------------------------------- the rules
//
// Each rule answers one question about one call site and returns the offending text, or
// null. They are deliberately narrow: a rule that fires on a legitimate assertion trains
// the next person to ignore this suite, which costs more than the vacuity it found.

// >= 0 on a count is true for every array that exists. So is > -1 and !== -1. The
// negative lookahead keeps `>= 0.5` out of it, which is a real comparison.
const TAUTOLOGY = /\.length\s*(?:>=\s*0(?![.\d])|>\s*-\s*1\b|!==?\s*-\s*1\b)/;

function condOf(site) {
    if (site.fn === 'suite') return null;
    return site.args.length >= 2 ? site.args[1] : null;
}

function ruleLength(site) {
    const cond = condOf(site);
    if (!cond || !TAUTOLOGY.test(cond.masked)) return null;
    return tidy(cond.text);
}

function ruleOrTrue(site) {
    const cond = condOf(site);
    if (!cond) return null;
    // Only a top-level alternative. `x || (y && true)` inside a nested call is somebody
    // else's expression, and a default like `f(a || true)` is not an assertion.
    const parts = splitOn(cond, '||');
    if (parts.length < 2) return null;
    const dead = parts.filter(p => /^(true|[1-9]\d*|!0|!!1)$/.test(tidy(p.masked)));
    return dead.length ? tidy(cond.text) : null;
}

function ruleLiteral(site, all) {
    const cond = condOf(site);
    if (!cond) return null;
    const t = tidy(cond.masked);
    const literal = /^(true|[1-9]\d*|!0|!!1|Boolean\(\s*true\s*\))$/.test(t)
        || /^(['"`]) *\1$/.test(t);
    if (!literal) return null;
    // The throw IS the assertion: a `check(name, true)` in a try whose catch answers
    // `check(name, false, ...)` under the same name reports a real outcome, and calling
    // it vacuous would be wrong. tests/rules.test.mjs:50 and :55 are that shape.
    const twin = all.some(other => other !== site
        && (other.fn === 'check' || other.fn === 'same')
        && other.args.length >= 2
        && tidy(other.args[0].text) === tidy(site.args[0].text)
        && /^(false|0)$/.test(tidy(other.args[1].masked)));
    if (twin) return null;
    return tidy(cond.text);
}

// Split a condition on a top-level binary operator, returning ORIGINAL-text slices.
// Splitting the masked text and comparing masked halves says 'p_11' === 'p_01' are the
// same expression, because both mask to blanks - which is how a lint invents a defect
// in tests/smoke.mjs:6757, an honest check that the tenth colour wraps.
function splitOn(arg, op) {
    const masked = arg.masked;
    const text = arg.text;
    const parts = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < masked.length; i += 1) {
        const ch = masked[i];
        if (ch === '(' || ch === '[' || ch === '{') depth += 1;
        else if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
        else if (depth === 0 && masked.startsWith(op, i)
            && !masked.startsWith(op + '=', i)
            && !'=!<>'.includes(masked[i - 1] || '')) {
            parts.push({ text: text.slice(start, i), masked: masked.slice(start, i) });
            i += op.length - 1;
            start = i + 1;
        }
    }
    parts.push({ text: text.slice(start), masked: masked.slice(start) });
    return parts;
}

function ruleSelfCompare(site) {
    if (site.fn === 'same' && site.args.length >= 3) {
        const a = tidy(site.args[1].text);
        const b = tidy(site.args[2].text);
        return a && a === b ? `${a} , ${b}` : null;
    }
    const cond = condOf(site);
    if (!cond) return null;
    for (const op of ['===', '!==', '==', '!=']) {
        const parts = splitOn(cond, op);
        if (parts.length !== 2) continue;
        const a = tidy(parts[0].text);
        const b = tidy(parts[1].text);
        if (a && a === b) return tidy(cond.text);
    }
    return null;
}

// given(what, condition) takes two parameters; tests/runner.mjs:27 drops anything after
// them. An author who writes a third argument has written a failure report - the number
// or the JSON that says WHY - and a failure report is what check() prints and given()
// throws away. On abort the operator sees `SETUP FAILED: <name>` and none of it.
function ruleGivenDetail(site) {
    if (site.fn !== 'given' || site.args.length <= 2) return null;
    return `${tidy(site.args[0].text)} — discarded: ${tidy(site.args.slice(2).map(a => a.text).join(', ')).slice(0, 90)}`;
}

// A given with no check below it inside its own suite is protecting nothing. There is no
// assertion it is a precondition for, so it is the claim itself - and it aborts the run
// instead of failing, so the report says the test is broken rather than the app.
function ruleGivenOrphan(sites) {
    const found = [];
    let started = false;
    for (let i = 0; i < sites.length; i += 1) {
        if (sites[i].fn === 'suite') { started = true; continue; }
        // Helpers defined above the first suite() run inside every suite that calls
        // them; source order says nothing about what they protect.
        if (!started || sites[i].fn !== 'given') continue;
        let protects = false;
        for (let j = i + 1; j < sites.length; j += 1) {
            if (sites[j].fn === 'suite') break;
            if (sites[j].fn === 'check' || sites[j].fn === 'same') { protects = true; break; }
        }
        if (!protects) found.push(sites[i]);
    }
    return found;
}

const RULES = [
    { id: 'V1', what: 'a length compared to >= 0, > -1 or !== -1', fn: ruleLength },
    { id: 'V2', what: 'a top-level `|| true` alternative', fn: ruleOrTrue },
    { id: 'V3', what: 'a condition that is a literal', fn: ruleLiteral },
    { id: 'V4', what: 'a call compared with itself', fn: ruleSelfCompare },
    { id: 'V5', what: 'a given() carrying a detail the runner discards', fn: ruleGivenDetail }
];

function findings(file, src) {
    const { sites } = scanFile(file, src);
    const out = [];
    for (const site of sites) {
        if (site.fn === 'suite') continue;
        for (const rule of RULES) {
            const hit = rule.fn(site, sites);
            if (hit) out.push({ rule: rule.id, file, line: site.line, fn: site.fn, text: hit });
        }
    }
    ruleGivenOrphan(sites).forEach(site => out.push({
        rule: 'V6', file, line: site.line, fn: 'given',
        text: tidy(site.args.map(a => a.text).join(', ')).slice(0, 110)
    }));
    return out.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
}

// ---------------------------------------------------------------- the instrument, proved
//
// Written offenders and written near-misses. Every rule must fire on the first and stay
// silent on the second, or the green it prints over the real suites means nothing.
const OFFENDERS = `
import { suite, check, given, same } from './runner.mjs';
suite('written to be caught');
check('V1 here', device.call('entries', s).length >= 0, 'x');
check('V2 here', out.status !== 'synced' || true);
check('V3 here', true);
check('V4 here', read(node) === read(node));
given('V5 here', result.ok === true, JSON.stringify(result));
check('so V5 is not also V6', 1 === 1 - 0);
suite('a second block');
given('V6 here, with nothing below it', ready === true);
`;

const NEAR_MISSES = `
import { suite, check, given, same } from './runner.mjs';
suite('written to be left alone');
check('a real count', rows.length >= 2, String(rows.length));
check('a real threshold', ratio >= 0.5);
check('not a length', budget >= 0);
check('a real alternative', a === 'x' || b === 'y');
check('a default inside a call', label(name || true) === 'x');
check('a real comparison', read('p_11') === read('p_01'));
check('the throw is the assertion', true);
check('the throw is the assertion', false, 'why');
same('two shapes', left(a), right(b));
given('a real precondition', device.State.commitRoster() === true);
check('protected by the given above', disk === 'p_01');
const pattern = /const APP_VERSION = '[^']*';/;
check('found after a regex holding an apostrophe', pattern.test(text));
`;

{
    suite('the instrument fires, and only where it should');

    const caught = findings('offenders.mjs', OFFENDERS);
    const quiet = findings('near-misses.mjs', NEAR_MISSES);
    const ids = caught.map(f => f.rule);

    ['V1', 'V2', 'V3', 'V4', 'V5', 'V6'].forEach(id => {
        check(`${id} fires on the offender written for it`,
            ids.filter(x => x === id).length === 1,
            JSON.stringify(caught.filter(f => f.rule === id).map(f => `${f.line}:${f.text}`)));
    });
    check('and it catches nothing else in that file',
        caught.length === 6, JSON.stringify(ids));

    check('a count with a real floor is not a tautology',
        !quiet.some(f => f.rule === 'V1'), JSON.stringify(quiet.filter(f => f.rule === 'V1')));
    check('a real alternative, and a default inside a call, are not `|| true`',
        !quiet.some(f => f.rule === 'V2'), JSON.stringify(quiet.filter(f => f.rule === 'V2')));
    check('a literal true whose catch answers under the same name is the throw, not a vacuity',
        !quiet.some(f => f.rule === 'V3'), JSON.stringify(quiet.filter(f => f.rule === 'V3')));
    check("two calls that differ only inside their strings are two calls",
        !quiet.some(f => f.rule === 'V4'), JSON.stringify(quiet.filter(f => f.rule === 'V4')));
    check('a two-argument precondition is a precondition',
        !quiet.some(f => f.rule === 'V5'), JSON.stringify(quiet.filter(f => f.rule === 'V5')));
    check('a given with a check below it is protecting something',
        !quiet.some(f => f.rule === 'V6'), JSON.stringify(quiet.filter(f => f.rule === 'V6')));
    check('so the near-miss file is reported clean',
        quiet.length === 0, JSON.stringify(quiet));

    // The blind spot that would make every green above a lie: one unterminated string
    // and the rest of the file is never examined at all.
    const seen = scanFile('near-misses.mjs', NEAR_MISSES).sites
        .filter(s => s.fn !== 'suite').length;
    check('an assertion after a regex holding an apostrophe is still seen',
        seen === 12, String(seen));
}

// ---------------------------------------------------------------- the corpus
//
// Every .mjs in tests/, this file included - a lint that exempts itself is the first
// place a vacuous assertion will be written. runner.mjs is the one exclusion: it DEFINES
// check(name, pass, ...), and a definition is not a call site. The helpers that assert
// nothing (harness, pdf, serve, shot) contribute no sites and need no filter; the browser
// suites declare their own check/given rather than importing the runner, and are scanned
// on the same terms because those declarations have the same two-parameter given().
const SELF = fileURLToPath(import.meta.url);
const PATHS = readdirSync(CORPUS_DIR)
    .filter(name => name.endsWith('.mjs') && name !== 'runner.mjs')
    .map(name => join(CORPUS_DIR, name));
if (!PATHS.includes(SELF)) PATHS.push(SELF);
const CORPUS = PATHS.sort().map(path => ({ name: basename(path), src: readFileSync(path, 'utf8') }));

const ALL = CORPUS.flatMap(f => findings(f.name, f.src))
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule));

const of = id => ALL.filter(f => f.rule === id);
const listing = hits => hits.map(f => `${f.file}:${f.line}  ${f.fn}(${f.text})`);

// file:line and the offending text for every site, so a failure below can be acted on
// without re-running anything.
console.log('\n---- every site the scan reports --------------------------------------');
if (!ALL.length) console.log('  (none)');
ALL.forEach(f => console.log(`  ${f.rule}  ${f.file}:${f.line}  ${f.fn}(${f.text})`));
console.log(`---- ${CORPUS.length} files, ${ALL.length} sites ---------------------------------------`);

{
    suite('no assertion in this repository is incapable of failing');

    // Inside the block, before the checks it protects - which is rule V6, applied to the
    // file that enforces it.
    given('every suite in tests/ was read off the disk, this one included',
        CORPUS.length >= 12 && CORPUS.some(f => f.name === basename(SELF)));

    check('no length is compared to >= 0, > -1 or !== -1',
        of('V1').length === 0, listing(of('V1')).join(' | '));
    check('no condition carries a top-level `|| true`',
        of('V2').length === 0, listing(of('V2')).join(' | '));
    check('no condition is a literal, except where a catch answers under the same name',
        of('V3').length === 0, listing(of('V3')).join(' | '));
    check('no assertion compares a call with itself',
        of('V4').length === 0, listing(of('V4')).join(' | '));
    check('no given() is handed the failure report only check() can print',
        of('V5').length === 0, `${of('V5').length} sites: ` + listing(of('V5')).slice(0, 6).join(' | '));
    check('every given() inside a suite has a check below it that it protects',
        of('V6').length === 0, listing(of('V6')).join(' | '));
}

// ---------------------------------------------------------------- and it is really vacuous
//
// The scan says tests/data.test.mjs:9291 compares a count to >= 0. That is a fact about
// text. Whether it MATTERS is a fact about the app, and it is settled the way every
// other suite settles one: on a device, through the same production functions that
// assertion calls. If the count there were ever above zero the line would still be
// vacuous, but the sentence beside it - "two advances and no entries" - would also be
// false, which is a second defect and a different fix.
{
    suite('the flagged tautology hides a true statement it declines to make');

    const device = makeDevice({ deviceId: 'd_here' });
    device.State.schedule.workers = [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 },
        { id: 'w_02', name: 'שרה', active: true, dailyRate: 350, hourlyRate: 0 }
    ];
    device.State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
    device.State.save({ silent: true });
    device.State.commit(device.call('addAdvance', device.State.schedule, 'w_01', '2026-08-03', 500, ''));
    device.State.commit(device.call('addAdvance', device.State.schedule, 'w_02', '2026-08-05', 300, ''));

    given('the two advances are recorded the old way',
        Object.keys(device.State.schedule.advances).length === 2);

    const entries = device.call('ledgerEntries', device.State.schedule);
    check('an advance written in this session mirrors nothing: the count is exactly 0',
        entries.length === 0, JSON.stringify(entries));

    // And the mirror, so `=== 0` above is a claim about a moment and not about a build
    // that cannot write entries at all.
    const booted = makeDevice({ storage: device.dump(), deviceId: device.id });
    booted.State.load();
    check('while the reopen does write them, so the count is a number that moves',
        booted.call('ledgerEntries', booted.State.schedule).length === 2,
        JSON.stringify(booted.call('ledgerEntries', booted.State.schedule).map(e => e.kind)));
}

report();
