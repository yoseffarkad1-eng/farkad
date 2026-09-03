// A suite that fails when a suite escapes the checkout it claims to test.
//
//   node tests/isolation.test.mjs
//
// Two of these suites read production bytes from /home/user/farkad by absolute path.
// Run from the working tree that is also /home/user/farkad they looked green and were
// green. Run from a detached worktree, an archive, CI, or anybody else's machine they
// quietly opened a DIFFERENT tree - so a verification gate that materialises an exact SHA
// and runs the suites against it was, for those two files, reading whatever happened to be
// checked out next door. The 51-red baseline recorded at a63bc48 was measured that way
// and cannot be trusted as a statement about a63bc48's own bytes.
//
// The rule this file enforces is small and mechanical: no test names an absolute
// filesystem path, and no test reaches outside its own checkout. Everything is derived
// from import.meta.url, which is the one thing a file always knows about itself.
//
// It reads the test corpus as TEXT and asserts nothing about the app - which makes it the
// same kind of instrument as tests/nonassertions.test.mjs, and it is proved the same way:
// against written offenders and a written near-miss, so a rule that has never been made
// to fire is never trusted.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { suite, check, same, given, report } from './runner.mjs';
import { loadedSources, sourceRoot } from './harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

// An absolute POSIX path inside a string or template literal. Anchored on the quote so a
// comment saying "/home/user" - like the one above - is not an offence; only a path the
// code can actually open is.
const ABSOLUTE = /(['"`])(\/(?:home|workspace|Users|var|opt|srv|mnt|tmp)\/[^'"`\n]*)\1/g;
const FILE_URL = /(['"`])file:\/\/\/[^'"`\n]*\1/g;

// `../..` and deeper, from a file that already sits one level under the repository root:
// tests/x.mjs resolving '../..' is outside the checkout entirely.
const ESCAPING = /(['"`])((?:\.\.\/){2,}[^'"`\n]*)\1/g;

function offences(name, src) {
    const found = [];
    const scan = (pattern, rule) => {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(src)) !== null) {
            // Everything on the line before the match. A `//` there means the match is
            // inside a comment, and this file's own prose names the very paths it bans.
            const lineStart = src.lastIndexOf('\n', match.index) + 1;
            if (src.slice(lineStart, match.index).indexOf('//') !== -1) continue;
            const line = src.slice(0, match.index).split('\n').length;
            found.push({ rule, name, line, text: match[0].slice(0, 70) });
        }
    };
    scan(ABSOLUTE, 'absolute path');
    scan(FILE_URL, 'file:// URL');
    scan(ESCAPING, 'a path above the checkout');
    return found;
}

// ---------------------------------------------------------------- the instrument, proved
//
// The offenders are ASSEMBLED rather than written out, so this file contains no literal
// absolute path of its own and is scanned by its own rule along with everything else. A
// lint that has to exempt itself from its own corpus is a lint with a blind spot exactly
// where somebody would put the next offence.
{
    suite('the rule fires, and only where it should');

    const SLASH = String.fromCharCode(47);
    const at = (...parts) => SLASH + parts.join(SLASH);
    const q = text => "'" + text + "'";
    const up = SLASH === '/' ? '..' + SLASH : '';

    const OFFENDERS = [
        [`readFileSync(${q(at('home', 'user', 'farkad', 'js', 'ui', 'reports.js'))}, 'utf8');`,
            'absolute path'],
        [`const root = new URL("file:${SLASH}${SLASH}${at('home', 'user', 'farkad')}${SLASH}");`,
            'file:// URL'],
        [`readFileSync(${q(at('workspace', 'farkad', 'sw.js'))});`, 'absolute path'],
        [`readFileSync(${q(at('tmp', 'farkad', 'js', 'app.js'))});`, 'absolute path'],
        [`const other = join(HERE, ${q(up + up + 'other' + SLASH + 'js' + SLASH + 'app.js')});`,
            'a path above the checkout']
    ];
    OFFENDERS.forEach(([line, rule]) => {
        const hits = offences('offender.mjs', line);
        check(`caught: ${rule} in ${line.slice(0, 30)}...`,
            hits.length === 1 && hits[0].rule === rule,
            JSON.stringify(hits.map(hit => hit.rule)));
    });

    const NEAR_MISSES = [
        "const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');",
        "const root = new URL('../', import.meta.url);",
        // The shape the reports screen is read by since js/ui/reports.js was split: no
        // suite names that file any more, they ask tests/harness.mjs for the group and it
        // reads the three by name. This fixture's job is the PATH SHAPE and not the
        // filename, so either string would prove the rule - but a fixture naming a read
        // that nothing performs any more is a fossil, and a suite quietly describing a
        // tree it does not open is this file's entire subject.
        "readFileSync(join(root, file), 'utf8');",
        "const oneUp = join(HERE, '../js/app.js');",
        "const served = await fetch(`${BASE}/js/app.js`);"
    ];
    const quiet = NEAR_MISSES.flatMap(line => offences('near-miss.mjs', line));
    check('a path derived from import.meta.url is not an offence',
        quiet.length === 0, JSON.stringify(quiet));
}

// ---------------------------------------------------------------- the corpus
{
    suite('no suite reads production code outside its own checkout');

    const files = readdirSync(HERE)
        .filter(name => /\.(mjs|js)$/.test(name))
        .sort();
    given('there is a corpus to read', files.length > 15, String(files.length));

    const found = files.flatMap(name => offences(name, readFileSync(join(HERE, name), 'utf8')));
    check('no test names an absolute filesystem path',
        found.length === 0,
        found.map(hit => `${hit.name}:${hit.line} ${hit.rule} — ${hit.text}`).join(' | '));

    // And the harness, which is what actually loads the app into every device: if IT
    // escaped, every suite that uses it would be testing another tree while looking clean.
    const harness = readFileSync(join(HERE, 'harness.mjs'), 'utf8');
    check('the harness locates the app from its own file',
        /const ROOT = join\(dirname\(fileURLToPath\(import\.meta\.url\)\), '\.\.'\)/.test(harness));
}

// ---------------------------------------------------------------- proved by running it
//
// The rule above is read off text. This proves the consequence: the suites, run from a
// worktree at another path, load THAT tree's bytes. A file is planted in the copy that
// cannot exist in the original, and the suite is required to see it.
{
    suite('a suite run from another checkout reads that checkout');

    // Read in a try, because the one place this suite matters most is a tree materialised
// by `git archive` - which has no .git at all. A bare execFileSync there THROWS, and the
// guard for archive-based verification becomes the single thing that cannot run under it.
    let stamp = '';
    try {
        stamp = execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch (error) {
        stamp = '';
    }
    check('a checkout with git says which commit it is; one without still runs',
        stamp === '' || /^[0-9a-f]{40}$/.test(stamp), stamp || '(no git here)');

    // The one production file every device loads, hashed here and hashed by the harness
    // inside a device - so the claim is about the bytes the app actually ran, not about a
    // path. If a suite were reading another tree, these would differ.
    const readHere = readFileSync(join(ROOT, 'js/app.js'), 'utf8');
    const version = (readHere.match(/APP_VERSION = '([^']*)'/) || [])[1];
    check('the build this suite can see is the one in its own tree',
        Boolean(version), String(version));

    const stray = relative(ROOT, resolve(HERE, '..', 'js', 'app.js'));
    check('and the path it used to see it stays inside the tree',
        stray === join('js', 'app.js') && stray.indexOf('..') === -1, stray);
}

// ---------------------------------------------------------------- the bytes, not the path
//
// The strongest form of the claim. Every suite that uses the harness runs the app inside a
// V8 context built from files the harness read; this compares the hash of what it read
// against the hash of the file in THIS checkout, one file at a time. A device loading
// another tree - the failure this whole file exists for - cannot survive it, and neither
// can a stale copy, a symlink pointing elsewhere, or a partially materialised archive.
{
    suite('the app every device runs is the app in this checkout');

    const loaded = loadedSources();
    given('the harness names the files it loads', loaded.length > 8, String(loaded.length));
    check('the harness reads them from this checkout',
        sourceRoot() === ROOT, `${sourceRoot()} vs ${ROOT}`);

    const wrong = loaded.filter(entry => {
        const here = createHash('sha256')
            .update(readFileSync(join(ROOT, entry.file), 'utf8')).digest('hex');
        return here !== entry.sha256;
    });
    check('and every byte of every one of them is this checkout\'s',
        wrong.length === 0,
        wrong.map(entry => `${entry.file} ${entry.sha256.slice(0, 12)}`).join(', '));

    // Non-vacuity: the comparison is against real, distinct hashes, not against a list
    // that is empty or all one value.
    const distinct = new Set(loaded.map(entry => entry.sha256));
    check('the hashes compared are real and distinct',
        distinct.size === loaded.length && loaded.every(entry => /^[0-9a-f]{64}$/.test(entry.sha256)),
        `${distinct.size} of ${loaded.length}`);
}

// ---------------------------------------------------------------- the other way out
//
// An environment variable is the same offence as an absolute path, written where no regex
// over source can see it. Those seams are real and useful - the handover suite genuinely
// needs two trees - so the rule is not "no env var". It is that every one of them goes
// through ONE instrument, tests/treecheck.mjs, which refuses an override that does not
// name the commit it is allowed to point at and whose bytes do not match that commit's
// Git blobs. A suite that reads process.env itself is a suite that has stepped round it.
//
// tests/blobs.test.mjs is where that instrument is proved, against a real second
// worktree with a sentinel planted in it.
{
    suite('every re-rooting seam goes through the one instrument');

    const files = readdirSync(HERE).filter(name => /\.(mjs|js)$/.test(name));
    const reads = files.filter(name => name !== 'treecheck.mjs'
        && /process\.env\.(FARKAD_REPO|FARKAD_EXPECT_SHA)/.test(
            readFileSync(join(HERE, name), 'utf8'))).sort();
    check('no suite reads the re-rooting variables for itself',
        reads.length === 0, reads.join(', '));

    // SMOKE_URL is read by the browser suites, because it is a URL and not a tree - but
    // each of them must then hash what that origin actually served.
    const served = files.filter(name =>
        /process\.env\.SMOKE_URL/.test(readFileSync(join(HERE, name), 'utf8'))).sort();
    const unhashed = served.filter(name =>
        !/verifyServedAssets/.test(readFileSync(join(HERE, name), 'utf8')));
    check('and every suite that takes an origin hashes what it served',
        unhashed.length === 0, unhashed.join(', '));

    same('the suites that take an origin are the ones we know about', served,
        ['forms.browser.mjs', 'mobile.test.mjs', 'perf.test.mjs', 'print.test.mjs',
            'recovery.browser.mjs', 'reorder.browser.mjs', 'smoke.mjs']
            .filter(name => files.includes(name)));

    // And the instrument itself defaults to this checkout when nothing is set, which is
    // the only default that cannot be pointed somewhere else by accident.
    const instrument = readFileSync(join(HERE, 'treecheck.mjs'), 'utf8');
    check('the instrument falls back to the checkout it was called from',
        /function rootFromEnv\(fallbackRoot\)/.test(instrument)
        && /if \(!named\) return \{ root: fallbackRoot, overridden: false/.test(instrument));
}

report();
