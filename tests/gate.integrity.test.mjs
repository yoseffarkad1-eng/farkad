// A suite that fails when the GATE stops being a gate.
//
//   node tests/gate.integrity.test.mjs
//
// The suites in this repository measure the app. Nothing measured the measuring: whether
// every suite is actually RUN, whether a wait actually waits, whether a re-rooting seam is
// bound to a commit, and whether the build stamps still describe the bytes a phone would
// be handed. Each of those failures is silent and each one turns a green number into a
// number about nothing.
//
// It is the same kind of instrument as tests/nonassertions.test.mjs and
// tests/isolation.test.mjs: it reads the corpus as TEXT and asserts nothing about the app.
// Like tests/blobs.test.mjs it is written RED where a defect is real, so the repair has
// something to be measured against, and every red check below names a defect that was
// proved by hand before it was written down. See features/gate-integrity/findings.md.
//
// Everything is derived from import.meta.url. No absolute path, no environment variable.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { suite, check, same, given, report } from './runner.mjs';
import { settleUntil } from './harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const read = name => readFileSync(join(HERE, name), 'utf8');
const corpus = readdirSync(HERE).filter(name => name.endsWith('.mjs')).sort();

// The modules that are imported BY suites and are not suites themselves. Kept by hand,
// deliberately: a new helper is a decision somebody made, and the alternative - inferring
// "not a suite" from the filename - would let a real suite named without .test. slip out
// of the gate unnoticed, which is exactly the failure this file exists for.
const HELPERS = ['exports-proof.lib.mjs', 'harness.mjs', 'moneydom.mjs', 'nodes.mjs',
    'pdf.mjs', 'runner.mjs', 'serve.mjs', 'shell.mjs', 'shot.mjs', 'treecheck.mjs'];

// This file. The auditor who wrote it may not edit package.json, so it cannot yet be
// named by a script; the exemption is ONE file and the check below pins that it is one,
// so the carve-out cannot quietly grow into a second orphan.
const UNWIRED = 'gate.integrity.test.mjs';

// ---------------------------------------------------------------- the npm script graph
//
// Resolved rather than read: `npm test` is a chain of `npm run test:x`, and a suite can be
// reached three levels down. A regex over package.json's text would call every one of them
// configured whether or not anything runs it.
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

function commandsOf(name, seen) {
    if (seen.has(name)) return [];
    seen.add(name);
    const body = pkg.scripts[name];
    if (!body) return [];
    const out = [];
    body.split(/&&|\|\|/).forEach(part => {
        const step = part.trim();
        const run = step.match(/^npm run ([\w:.-]+)/);
        if (run) out.push(...commandsOf(run[1], seen));
        else if (step.indexOf('npm test') === 0) out.push(...commandsOf('test', seen));
        else out.push(step);
    });
    return out;
}

function suitesOf(name) {
    const found = new Set();
    commandsOf(name, new Set()).forEach(cmd => {
        [...cmd.matchAll(/tests\/([\w.-]+\.mjs)/g)].forEach(match => found.add(match[1]));
    });
    return found;
}

// ---------------------------------------------------------------- 1. no orphan suite
{
    suite('every suite in the corpus is run by a gate');

    given('there is a corpus to read', corpus.length > 40, String(corpus.length));

    const release = suitesOf('test:release');
    given('the release gate resolves to suites', release.size > 40, String(release.size));

    const orphans = corpus
        .filter(name => HELPERS.indexOf(name) === -1 && name !== UNWIRED)
        .filter(name => !release.has(name))
        .sort();
    check('no suite is left out of npm run test:release',
        orphans.length === 0, orphans.join(', '));

    // The exemption is one file and stays one file.
    same('exactly one suite is exempt, and it is this one',
        corpus.filter(name => name === UNWIRED), [UNWIRED]);

    // And the helper list is real: a name on it that is not in the corpus is a stale
    // exemption, and a stale exemption is how an orphan hides.
    const stale = HELPERS.filter(name => corpus.indexOf(name) === -1).sort();
    check('every name exempted as a helper exists', stale.length === 0, stale.join(', '));

    // Non-vacuity: the rule must be able to fire. A name the corpus does not contain is
    // an orphan by construction, and the same filter has to say so.
    const planted = ['ghost.test.mjs'].filter(name => !release.has(name));
    same('the rule fires on a suite no script names', planted, ['ghost.test.mjs']);

    // The two default gates, reported separately because they are different gates.
    const node = suitesOf('test');
    const all = suitesOf('test:all');
    check('npm test is a subset of npm run test:all',
        [...node].every(name => all.has(name)), String(node.size));
    check('and npm run test:all is a subset of the release gate',
        [...all].every(name => release.has(name)), String(all.size));

    const releaseOnly = [...release].filter(name => !all.has(name)).sort();
    check('the suites the default gates do not reach are the emulator half and sendclaim',
        releaseOnly.every(name => /emulator|rules|rollout|money\.concurrency|sendclaim/.test(name)),
        releaseOnly.join(', '));
}

// ---------------------------------------------------------------- 2. a wait that waits
//
// settleUntil USED to read its predicate synchronously: `if (ready()) return true`. Handed
// an async function it was handed a Promise, which is always truthy - so it returned true
// on its first turn, never polled, never evaluated the condition, and the limit it was
// given was a number nobody used. Five barriers in the emulator bootstrap were written
// that way, and everything each of them guarded was measured on a state that had not
// arrived. The barrier was gone and nothing said so.
//
// 844e69b awaits the predicate, so that hazard no longer exists and the rule about it is
// gone with it - as the check that stood here said it should be. What replaces it is the
// half that was never true and still has to stay true: a wait that CAN time out is only a
// barrier if somebody looks at the answer.
{
    suite('a barrier that timed out says so');

    // The repair itself, pinned by behaviour rather than by the line that implements it.
    // Text would go stale the first time the loop is rewritten; this runs it.
    const seen = [];
    const answer = await settleUntil(async () => { seen.push(1); return seen.length >= 3; },
        2000, 1);
    check('settleUntil awaits an async predicate instead of believing its Promise',
        answer === true && seen.length === 3, `${seen.length} turns, answer ${answer}`);

    const gaveUp = await settleUntil(async () => false, 60, 5);
    check('and it reports false when the condition never arrives', gaveUp === false,
        String(gaveUp));

    // THE HALF THAT MATTERS. settleUntil returning false is a measurement that did not
    // happen; a call site that discards it goes on to assert about a state that never
    // came, and reports PASS on whatever the disk happened to hold. The emulator suites
    // are where this costs the most - they are slow, they are the only place two real
    // clients meet, and they are the suites nobody re-reads.
    //
    // The rule is scoped to the emulator suites deliberately. In the fast in-process
    // suites a settle is usually a courtesy before an assertion that would fail on its own
    // if the state were wrong; there, a discarded answer costs a confusing failure, not a
    // false pass. Widening this to the whole corpus would make it noise, and noise is how
    // an instrument like this stops being read.
    const discarded = [];
    corpus.filter(name => /emulator/.test(name)).forEach(name => {
        read(name).split('\n').forEach((line, index) => {
            if (!/settleUntil\(/.test(line)) return;
            // Bound to a name, returned, or asserted on: the answer is in somebody's hands.
            if (/(?:const|let|var)\s+\w+\s*=|return |check\(|given\(|\|\||&&|\?/.test(line)) return;
            discarded.push(`${name}:${index + 1}`);
        });
    });
    check('no emulator suite throws away what a barrier told it',
        discarded.length === 0, discarded.join(', '));

    // And the five that were found are each holding their answer against a named check, so
    // a timeout there is a red line rather than a quiet one.
    const bootstrap = read('bootstrap.emulator.test.mjs');
    const barriers = (bootstrap.match(/settleUntil\(/g) || []).length;
    const reported = (bootstrap.match(/the barrier this case rests on was actually reached/g)
        || []).length;
    same('every barrier in the bootstrap suite reports whether it was reached',
        reported, barriers);
}

// ---------------------------------------------------------------- 3. a re-rooting seam
//
// tests/isolation.test.mjs bans an absolute path in source and requires every re-rooting
// environment variable to go through tests/treecheck.mjs - but its hand-kept rule names
// only FARKAD_REPO and FARKAD_EXPECT_SHA. Any OTHER variable that decides which bytes a
// suite reads is the same offence written in a name the rule does not know.
{
    suite('every variable that chooses bytes is bound to a commit');

    const ROOTING = /process\.env\.(FARKAD_[A-Z_]+)/g;
    const BOUND = ['FARKAD_REPO', 'FARKAD_EXPECT_SHA'];
    // Not a path: FARKAD_SEED chooses a random seed, not a file, so it cannot point a
    // suite at another tree.
    const NOT_A_PATH = ['FARKAD_SEED'];

    const seams = [];
    corpus.forEach(name => {
        if (name === 'treecheck.mjs') return;
        const src = read(name);
        ROOTING.lastIndex = 0;
        let match;
        while ((match = ROOTING.exec(src)) !== null) {
            if (BOUND.indexOf(match[1]) !== -1) continue;
            if (NOT_A_PATH.indexOf(match[1]) !== -1) continue;
            const line = src.slice(0, match.index).split('\n').length;
            seams.push({ name, line, variable: match[1] });
        }
    });

    given('the scan reached the corpus', corpus.indexOf('treecheck.mjs') !== -1,
        String(corpus.length));

    const unbound = seams.filter(seam => {
        const src = read(seam.name);
        return !/refuseUnlessVerified|verifyServedAssets/.test(src);
    });
    check('no suite re-roots itself through a variable nothing verifies',
        unbound.length === 0,
        unbound.map(seam => `${seam.name}:${seam.line} ${seam.variable}`).join(' | '));
}

// ---------------------------------------------------------------- 4. the stamps describe
//                                                                     the bytes
//
// Iron law 5: the three build stamps move in the SAME COMMIT as any change to a cached
// file. tests/build.test.mjs proves the three agree WITH EACH OTHER, which is a different
// claim and cannot catch this one: a shell file edited after the stamp commit leaves the
// three in perfect agreement about a build that no longer describes the bytes. A phone
// already holding that build is never offered the change.
{
    suite('the build stamps describe the bytes a phone would be handed');

    const git = args => execFileSync('git', ['-C', ROOT].concat(args),
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

    let usable = true;
    try { git(['rev-parse', 'HEAD']); } catch (error) { usable = false; }
    given('this checkout is a git worktree', usable, String(usable));

    const shell = readFileSync(join(ROOT, 'sw.js'), 'utf8');
    const block = shell.match(/const SHELL\s*=\s*\[([\s\S]*?)\]/);
    given('sw.js names a shell', Boolean(block), String(Boolean(block)));

    const cached = [...block[1].matchAll(/'\.\/([^']+)'/g)]
        .map(match => match[1])
        .filter(path => path.length > 0);
    given('the shell has files in it', cached.length > 10, String(cached.length));

    const commitOf = paths => {
        try { return git(['log', '-1', '--format=%H', '--'].concat(paths)).trim(); }
        catch (error) { return ''; }
    };

    // The commit that last moved a stamp, and the commit that last changed a cached file.
    const stamped = commitOf(['index.html', 'js/app.js', 'sw.js']);
    const touched = commitOf(cached.concat(['index.html', 'sw.js']));

    check('a stamp commit and a shell commit were both found',
        /^[0-9a-f]{40}$/.test(stamped) && /^[0-9a-f]{40}$/.test(touched),
        `${stamped.slice(0, 8)} / ${touched.slice(0, 8)}`);

    // Not "the same commit": index.html and sw.js are themselves cached, so a stamp-only
    // commit IS a shell commit. The claim is that no cached file has been changed SINCE
    // the stamps last moved - which is what `git log` ordering answers.
    let drifted = [];
    try {
        drifted = git(['log', '--format=%H', `${stamped}..HEAD`, '--'].concat(cached))
            .trim().split('\n').filter(line => line.length > 0);
    } catch (error) {
        drifted = ['GIT LOG FAILED'];
    }
    check('no cached file has changed since the three stamps last moved',
        drifted.length === 0,
        drifted.map(sha => `${sha.slice(0, 8)} ${commitSubject(git, sha)}`).join(' | '));
}

function commitSubject(git, sha) {
    try { return git(['log', '-1', '--format=%s', sha]).trim().slice(0, 60); }
    catch (error) { return '(?)'; }
}

// ---------------------------------------------------------------- 5. the shipped gates
//
// The money gates ship shut. tests/build.test.mjs pins two of the three shipped flags as
// SOURCE TEXT and the runtime suites pin all four as behaviour; this pins the source text
// of every one of them in one place, so a flag added to the object arrives with a decision
// about its default rather than without one.
{
    suite('every shipped flag is false in the source that ships');

    const schema = readFileSync(join(ROOT, 'js/model/schema.js'), 'utf8');
    const start = schema.indexOf('const FARKAD_SHIPPED_FLAGS');
    const end = schema.indexOf('const FARKAD_FLAGS');
    given('the shipped flags are declared before the frozen object',
        start !== -1 && end > start, `${start} / ${end}`);

    const declared = [...schema.slice(start, end).matchAll(/^\s*(\w+):\s*(true|false),?\s*$/gm)]
        .map(match => ({ flag: match[1], value: match[2] }));
    given('the block declares flags', declared.length > 0, String(declared.length));

    const open = declared.filter(one => one.value !== 'false').map(one => one.flag);
    check('no shipped flag is open', open.length === 0, open.join(', '));
    same('and the shipped flags are the three that were argued over',
        declared.map(one => one.flag).sort(),
        ['carryAdvances', 'permanentDeletion', 'vehicles']);

    const ledger = readFileSync(join(ROOT, 'js/model/ledger.js'), 'utf8');
    check('and the ledger writer gate is shut in its own file',
        /const LEDGER_WRITES = false;/.test(ledger));
}

report();
