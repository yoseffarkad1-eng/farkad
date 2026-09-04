// The bytes a suite loaded, checked against Git rather than against the filesystem.
//
//   node tests/blobs.test.mjs
//
// tests/isolation.test.mjs closed the two hard-coded path escapes and proved the harness
// reads its production files from its own checkout. It is not enough, and this file is
// the list of ways round it - written first, red, so the repair has something to be
// measured against.
//
// Every check below is RED at this commit. They are the point of the file.
//
//   1. FARKAD_REPO re-roots three suites and SMOKE_URL replaces the origin for four more.
//      An environment variable is the same offence as an absolute path, written where no
//      regex over source can see it, and nothing binds either to an expected commit.
//
//   2. The hash comparison reads the same filesystem path TWICE - once through the
//      harness, once through the suite - and calls agreement proof. A symlink, a
//      bind-mount, an overlay or a dirty working file satisfies both readings equally.
//      The authority has to be the Git blob at a named SHA, which no filesystem trick
//      can forge.
//
//   3. Nothing rejects a symlinked production file, a tracked file missing from the
//      working tree, or production bytes that differ from the commit under test.
//
//   4. The browser suites count checks against assets served over HTTP that nothing
//      hashes. A server rooted at another tree passes every one of them.
//
//   5. "A suite run from another checkout reads that checkout" asserts a path string and
//      a version constant. It never CONSTRUCTS another checkout, so it cannot fail.

import { readFileSync, readdirSync, lstatSync, existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { suite, check, same, given, report } from './runner.mjs';
import { loadedSources, sourceRoot } from './harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const sha256 = text => createHash('sha256').update(text).digest('hex');

function git(args, options) {
    return execFileSync('git', ['-C', ROOT].concat(args),
        Object.assign({ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }, options || {}));
}

let HEAD = '';
try { HEAD = git(['rev-parse', 'HEAD']).trim(); } catch (error) { HEAD = ''; }

// ---------------------------------------------------------------- 1. the Git blob is the authority
{
    suite('the bytes a device loaded are the bytes the commit holds');

    given('this checkout is a git worktree', /^[0-9a-f]{40}$/.test(HEAD), HEAD || '(none)');

    const loaded = loadedSources();
    given('the harness names what it loaded', loaded.length > 8, String(loaded.length));

    // The claim: for every production file a device ran, the bytes hash to the blob Git
    // holds for that path at HEAD. Not "the file on disk reads the same twice" - the
    // OBJECT, out of the object database, which a symlink cannot point at and a dirty
    // working file cannot match.
    const wrong = [];
    loaded.forEach(entry => {
        let blob = null;
        try {
            blob = git(['show', `${HEAD}:${entry.file}`]);
        } catch (error) {
            wrong.push(`${entry.file}: not tracked at ${HEAD.slice(0, 8)}`);
            return;
        }
        if (sha256(blob) !== entry.sha256) {
            wrong.push(`${entry.file}: loaded ${entry.sha256.slice(0, 12)} != blob ${sha256(blob).slice(0, 12)}`);
        }
    });
    check('every production file a device ran matches its Git blob at HEAD',
        wrong.length === 0, wrong.join(' | '));

    // Non-vacuity: the comparison really is against distinct object bytes.
    check('and the blobs compared are real and distinct',
        new Set(loaded.map(entry => entry.sha256)).size === loaded.length,
        String(loaded.length));
}

// ---------------------------------------------------------------- 2. nothing is a symlink
{
    suite('no production file is reached through a link');

    const linked = loadedSources().map(entry => entry.file).filter(file => {
        const path = join(ROOT, file);
        try { return lstatSync(path).isSymbolicLink(); } catch (error) { return true; }
    });
    check('every production file is a real file in this checkout',
        linked.length === 0, linked.join(', '));

    // And every path a device used stays inside the tree once links are resolved.
    const outside = loadedSources().map(entry => entry.file)
        .filter(file => relative(ROOT, join(ROOT, file)).startsWith('..'));
    check('and none of them resolves outside it', outside.length === 0, outside.join(', '));
}

// ---------------------------------------------------------------- 3. the tree is not dirty
{
    suite('the production bytes under test are the commit under test');

    let dirty = '';
    try {
        dirty = git(['status', '--porcelain', '--', 'js', 'sw.js', 'index.html', 'css',
            'firestore.rules']).trim();
    } catch (error) {
        dirty = 'STATUS FAILED';
    }
    check('no tracked production file is modified, staged or untracked',
        dirty === '', dirty.split('\n').slice(0, 6).join(' | '));

    // A tracked file that is not on disk is the other half: a suite reading it would get
    // whatever a stale copy elsewhere holds, or throw somewhere unhelpful.
    let tracked = [];
    try {
        tracked = git(['ls-files', 'js', 'sw.js', 'index.html']).trim().split('\n');
    } catch (error) {
        tracked = [];
    }
    given('the commit tracks production files', tracked.length > 20, String(tracked.length));
    const missing = tracked.filter(file => file && !existsSync(join(ROOT, file)));
    check('every tracked production file is present in the working tree',
        missing.length === 0, missing.join(', '));
}

// ---------------------------------------------------------------- 4. overrides are bound to a SHA
{
    suite('an override names the commit it is allowed to point at');

    const files = readdirSync(HERE).filter(name => /\.(mjs|js)$/.test(name));
    const overriding = files.filter(name =>
        /process\.env\.(FARKAD_REPO|SMOKE_URL)/.test(readFileSync(join(HERE, name), 'utf8')))
        .sort();
    given('the seams are there to be checked', overriding.length > 0, overriding.join(', '));

    // The rule: a suite that accepts a re-rooting variable must also accept the SHA that
    // tree is expected to be, and must verify it before reading a byte. Without that,
    // "run the gate against commit X" is a wish - the variable can point anywhere and the
    // suite reports a number about a tree nobody named.
    // Bound one of two ways, because there are two kinds of override. A suite handed a
    // TREE goes through refuseUnlessVerified, which demands FARKAD_EXPECT_SHA and then
    // compares that tree's production bytes with the commit's blobs. A suite handed an
    // ORIGIN cannot verify a directory - it has a URL - so it goes through
    // verifyServedAssets, which fetches every shell path and compares what the server
    // actually served with the same blobs. Either way the answer is Git's, and neither
    // suite reads the variable for itself. What is refused is a third way: a suite that
    // takes an override and checks nothing.
    const unbound = overriding.filter(name => {
        const src = readFileSync(join(HERE, name), 'utf8');
        return !/refuseUnlessVerified/.test(src) && !/verifyServedAssets/.test(src);
    });
    check('every re-rootable suite binds its override to a commit',
        unbound.length === 0, unbound.join(', '));

    // And the browser suites authenticate what the server actually handed them.
    const served = files.filter(name =>
        /process\.env\.SMOKE_URL/.test(readFileSync(join(HERE, name), 'utf8'))).sort();
    const unhashed = served.filter(name => {
        const src = readFileSync(join(HERE, name), 'utf8');
        return !/assertServedBytes|verifyServedAssets/.test(src);
    });
    check('every browser suite hashes the assets its origin served before counting checks',
        unhashed.length === 0, unhashed.join(', '));
}

// ---------------------------------------------------------------- 5. a real second checkout
{
    suite('a suite refuses to consume a checkout it was not pointed at');

    // Constructed, not asserted about. The previous version of this claim compared a path
    // string and an APP_VERSION constant, which is satisfied by the tree it is already
    // in - so it could not fail, and a suite reading the wrong tree would have sailed
    // through it.
    const work = mkdtempSync(join(tmpdir(), 'farkad-other-'));
    let built = false;
    try {
        execFileSync('git', ['-C', ROOT, 'worktree', 'add', '--detach', work, HEAD],
            { stdio: ['ignore', 'pipe', 'pipe'] });
        built = true;
    } catch (error) {
        built = false;
    }

    given('a second checkout of this commit was built', built, work);

    // A sentinel that cannot exist in the real tree. If anything consumes this checkout
    // believing it to be the one under test, the sentinel is what proves it.
    const SENTINEL = '/* FARKAD-SENTINEL-NOT-THE-TREE-UNDER-TEST */\n';
    writeFileSync(join(work, 'js', 'app.js'),
        SENTINEL + readFileSync(join(work, 'js', 'app.js'), 'utf8'));

    // The Git blob comparison is the thing that must notice. Read the sentinel copy the
    // way a re-rooted suite would, and require the check to FAIL against the commit.
    const poisoned = sha256(readFileSync(join(work, 'js', 'app.js'), 'utf8'));
    const blob = sha256(git(['show', `${HEAD}:js/app.js`]));
    check('the sentinel copy does not match the commit\'s blob',
        poisoned !== blob, `${poisoned.slice(0, 12)} vs ${blob.slice(0, 12)}`);

    // And the instrument the repair will use must be exported and must say no. Named
    // rather than inlined, so the gate and this suite cannot drift apart.
    let refused = null;
    try {
        const mod = await import('./treecheck.mjs');
        refused = mod.verifyTree(work, HEAD);
    } catch (error) {
        refused = { ok: true, reason: 'tests/treecheck.mjs does not exist yet: ' + error.message };
    }
    check('the gate refuses a checkout whose bytes are not the commit',
        refused && refused.ok === false,
        JSON.stringify(refused).slice(0, 140));

    // The same instrument must ACCEPT this checkout, or it is a gate that refuses
    // everything and proves nothing.
    let accepted = null;
    try {
        const mod = await import('./treecheck.mjs');
        accepted = mod.verifyTree(ROOT, HEAD);
    } catch (error) {
        accepted = { ok: false, reason: error.message };
    }
    check('and accepts the checkout it was pointed at',
        accepted && accepted.ok === true, JSON.stringify(accepted).slice(0, 140));

    try {
        execFileSync('git', ['-C', ROOT, 'worktree', 'remove', '--force', work],
            { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
        rmSync(work, { recursive: true, force: true });
    }
}

// ------------------------------------------------- 6. the INDEX itself carries nothing odd
//
// Section 2 asks whether the files the app LOADS are real files. That is a narrower
// question than it reads as, and the gap it left was found the hard way: this repository
// is worked in parallel git worktrees that LINK node_modules rather than copy 366MB into
// each one, `.gitignore` said `node_modules/` with a trailing slash, and a trailing slash
// matches a DIRECTORY. A symlink is not a directory to git. So the link - an absolute path
// pointing outside the repository, at a tree that exists on one machine and nowhere else -
// was staged and committed as a tracked file, and every check in section 2 passed, because
// the app does not load node_modules.
//
// The question this section asks is the whole-index one: is anything in the commit a
// symlink, and is anything in the commit inside a dependency directory. Both are cheap,
// both are absolute, and neither depends on which files a suite happens to read.
{
    suite('the commit tracks no link and no dependency directory');

    // `ls-files -s` prints the mode in the first field. 120000 is a symlink; 160000 is a
    // gitlink (a submodule), which this repository has never had and which would bring the
    // same class of problem - a path whose content lives somewhere this checkout does not
    // control. Both are named, so that adding a submodule is a deliberate act that has to
    // move this check rather than something a tool can do quietly.
    let entries = [];
    try {
        entries = git(['ls-files', '-s']).trim().split('\n').filter(Boolean);
    } catch (error) {
        entries = [];
    }
    given('the index could be read', entries.length > 50, String(entries.length));

    const modeOf = line => line.slice(0, 6);
    const pathOf = line => line.slice(line.indexOf('\t') + 1);

    const links = entries.filter(line => modeOf(line) === '120000').map(pathOf);
    check('no tracked path is a symlink', links.length === 0, links.slice(0, 6).join(', '));

    const gitlinks = entries.filter(line => modeOf(line) === '160000').map(pathOf);
    check('and no tracked path is a submodule', gitlinks.length === 0,
        gitlinks.slice(0, 6).join(', '));

    // The second half: a real node_modules committed as files would not be a symlink and
    // would pass the check above, while being the same mistake at 366MB.
    const vendored = entries.map(pathOf)
        .filter(file => file === 'node_modules' || file.startsWith('node_modules/'));
    check('and nothing under node_modules is tracked', vendored.length === 0,
        vendored.slice(0, 4).join(', ') + ' (' + vendored.length + ')');

    // And the ignore rule that lets the worktrees exist has to actually cover the form the
    // worktrees use. This cannot be asked with `git check-ignore <name>` alone: when the
    // path does not exist on disk, git answers for a name that COULD be a directory, so
    // `node_modules/` and `node_modules` give the same answer and the check discriminates
    // nothing. The first version of this check did exactly that and passed against the very
    // rule that had let the link through.
    //
    // So the state is CONSTRUCTED: a throwaway repository, this repository's own
    // .gitignore copied into it verbatim, and a symlink named node_modules created for
    // real. `git status --porcelain` then answers about the thing itself. Against the
    // slashed rule the link shows up as untracked - one `git add -A` from being committed -
    // and against the rule this repository now carries it does not show up at all.
    const bench = mkdtempSync(join(tmpdir(), 'farkad-ignore-'));
    let porcelain = 'NOT RUN';
    try {
        execFileSync('git', ['-C', bench, 'init', '-q'], { stdio: ['ignore', 'pipe', 'pipe'] });
        writeFileSync(join(bench, '.gitignore'), readFileSync(join(ROOT, '.gitignore')));
        symlinkSync(join(ROOT, 'tests'), join(bench, 'node_modules'));
        // Flattened, because a detail that carries a newline is printed truncated and the
        // whole value of this check is the line naming node_modules.
        porcelain = execFileSync('git', ['-C', bench, 'status', '--porcelain'],
            { encoding: 'utf8' }).trim().split('\n').join(' | ');
    } catch (error) {
        porcelain = 'BENCH FAILED: ' + error.message;
    } finally {
        rmSync(bench, { recursive: true, force: true });
    }

    given('the bench repository saw this repository\'s .gitignore and a real symlink',
        !porcelain.startsWith('BENCH FAILED'), porcelain.slice(0, 120));
    check('a symlink named node_modules is ignored, not offered for staging',
        !/node_modules/.test(porcelain),
        porcelain === '' ? 'nothing untracked' : porcelain.slice(0, 120));
}

report();
