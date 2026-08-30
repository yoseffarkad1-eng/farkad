// Is this directory the commit it claims to be?
//
// Not a suite - the instrument the suites and the gate share, so the thing that decides
// and the thing that reports cannot drift apart.
//
// The authority is the GIT OBJECT, never a second read through the filesystem. Two
// readings of one path agree whatever that path really points at: a symlink into another
// tree, a bind-mount, an overlay, a dirty working file. A blob at a named SHA is bytes in
// the object database, and nothing on the filesystem can forge one.
//
// It exists because a verification gate that materialises an exact commit and then runs
// suites against it was, for two of those suites, reading whatever happened to be checked
// out next door - and reporting a number about a tree it never opened. The repair for
// that was to derive paths from import.meta.url. This is the repair for the next layer:
// an environment variable that re-roots a suite is the same escape written where no
// regex over source can see it, so an override must name the commit it is allowed to
// point at, and be checked against it before a byte is read.

import { readFileSync, lstatSync, existsSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const sha256 = text => createHash('sha256').update(text).digest('hex');

// The production files a session runs. Everything the service worker precaches, which is
// the app's own definition of itself, plus the rules the emulator is pointed at.
function shellFiles(root) {
    const sw = readFileSync(join(root, 'sw.js'), 'utf8');
    const list = sw.slice(sw.indexOf('const SHELL'), sw.indexOf('];'));
    return (list.match(/'\.\/[^']*'/g) || [])
        .map(entry => entry.slice(1, -1).replace('./', ''))
        .filter(entry => entry !== '' && !entry.endsWith('/'))
        .concat(['sw.js', 'firestore.rules'])
        .filter(entry => existsSync(join(root, entry)));
}

function gitIn(root, args) {
    return execFileSync('git', ['-C', root].concat(args),
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

// Every blob the commit holds for those paths, by path. Read from the object database of
// whichever checkout can see the commit - a worktree materialised by `git archive` has no
// object database of its own, so the caller may hand in an `objectsFrom` root that does.
export function blobsAt(sha, options) {
    const from = (options && options.objectsFrom) || (options && options.root);
    const files = shellFiles((options && options.root) || from);
    const blobs = {};
    files.forEach(file => {
        try {
            blobs[file] = sha256(gitIn(from, ['show', `${sha}:${file}`]));
        } catch (error) {
            blobs[file] = null;
        }
    });
    return blobs;
}

// The verdict. `{ ok, reason, mismatched, sha }`.
//
// ok:false is returned rather than thrown, because every caller has something better to
// do with a refusal than crash: a suite reports it as a failed check, and the gate stops
// before it counts anything.
export function verifyTree(root, sha, options) {
    if (!isAbsolute(root)) return { ok: false, reason: 'root is not an absolute path' };
    if (!/^[0-9a-f]{40}$/.test(String(sha || ''))) {
        return { ok: false, reason: 'no expected SHA was named' };
    }

    const objectsFrom = (options && options.objectsFrom) || root;
    let files;
    try {
        files = shellFiles(root);
    } catch (error) {
        return { ok: false, reason: 'this directory does not look like the app: ' + error.message };
    }
    if (files.length < 20) {
        return { ok: false, reason: `only ${files.length} production files found` };
    }

    // A link is refused before it is read. Following one would compare the bytes at the
    // far end, which is exactly the substitution this exists to catch.
    const linked = files.filter(file => {
        try { return lstatSync(join(root, file)).isSymbolicLink(); } catch (error) { return true; }
    });
    if (linked.length > 0) {
        return { ok: false, reason: 'reached through a link: ' + linked.join(', '), linked };
    }

    const escaping = files.filter(file => relative(root, join(root, file)).startsWith('..'));
    if (escaping.length > 0) {
        return { ok: false, reason: 'resolves outside the tree: ' + escaping.join(', ') };
    }

    let blobs;
    try {
        blobs = blobsAt(sha, { root, objectsFrom });
    } catch (error) {
        return { ok: false, reason: 'the commit could not be read: ' + error.message };
    }

    const mismatched = [];
    files.forEach(file => {
        const want = blobs[file];
        if (want === null || want === undefined) {
            mismatched.push(`${file}: not tracked at ${sha.slice(0, 8)}`);
            return;
        }
        let have;
        try {
            have = sha256(readFileSync(join(root, file), 'utf8'));
        } catch (error) {
            mismatched.push(`${file}: unreadable`);
            return;
        }
        if (have !== want) {
            mismatched.push(`${file}: ${have.slice(0, 12)} != ${want.slice(0, 12)}`);
        }
    });

    if (mismatched.length > 0) {
        return { ok: false, reason: `${mismatched.length} file(s) are not the commit`, mismatched, sha };
    }
    return { ok: true, sha, files: files.length };
}

// What an override is allowed to point at.
//
// A suite that takes FARKAD_REPO must also be told which commit that tree is expected to
// be. Without the variable the answer is this checkout and its own HEAD, which is the
// only default that cannot be pointed somewhere else by accident.
export function rootFromEnv(fallbackRoot) {
    const named = process.env.FARKAD_REPO;
    if (!named) return { root: fallbackRoot, overridden: false, expect: null };
    return {
        root: named,
        overridden: true,
        expect: process.env.FARKAD_EXPECT_SHA || null
    };
}

// Called by a re-rootable suite before it reads a byte. Returns a string to report as a
// setup failure, or null when the tree may be used.
export function refuseUnlessVerified(root, overridden, expect) {
    if (!overridden) return null;
    if (!expect) {
        return 'FARKAD_REPO was set without FARKAD_EXPECT_SHA: a re-rooted suite must '
            + 'name the commit that tree is expected to be';
    }
    const verdict = verifyTree(root, expect);
    if (verdict.ok) return null;
    return `FARKAD_REPO does not hold ${expect.slice(0, 8)}: ${verdict.reason}`;
}

// Which commit a served origin is expected to be. Named by FARKAD_EXPECT_SHA, or this
// checkout's own HEAD - read here rather than in four browser suites, so there is one
// place that knows what an override means.
export function expectedShaFor(root) {
    if (/^[0-9a-f]{40}$/.test(String(process.env.FARKAD_EXPECT_SHA || ''))) {
        return process.env.FARKAD_EXPECT_SHA;
    }
    try {
        return gitIn(root, ['rev-parse', 'HEAD']).trim();
    } catch (error) {
        return '';
    }
}

// The other half: what a SERVER handed a browser.
//
// A suite that takes SMOKE_URL counts its checks against assets fetched over HTTP, and
// nothing hashed them - so an origin rooted at another tree passed every check in the
// file. Fetch each shell path and compare it with the blob.
export async function verifyServedAssets(base, root, sha, fetchImpl) {
    const get = fetchImpl || fetch;
    const expected = blobsAt(sha, { root, objectsFrom: root });
    const wrong = [];
    const names = Object.keys(expected).filter(file => file !== 'firestore.rules');

    for (const file of names) {
        if (expected[file] === null) { wrong.push(`${file}: not tracked`); continue; }
        let text;
        try {
            const response = await get(`${base.replace(/\/$/, '')}/${file}`);
            if (!response.ok) { wrong.push(`${file}: HTTP ${response.status}`); continue; }
            text = await response.text();
        } catch (error) {
            wrong.push(`${file}: ${error.message}`);
            continue;
        }
        if (sha256(text) !== expected[file]) {
            wrong.push(`${file}: served ${sha256(text).slice(0, 12)} != ${expected[file].slice(0, 12)}`);
        }
    }
    return { ok: wrong.length === 0, checked: names.length, wrong };
}
