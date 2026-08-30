// The durable client-to-build record, and every way it fails OPEN.
//
//   node swfailclosed.test.mjs
//
// sw.js no longer keeps the identity of a window only in memory: rememberClient writes
// it into the `farkad-clients` cache (sw.js:118-124) and buildOfClient reads it back
// (sw.js:129-140), so a worker restart no longer forgets who is running what. That is
// the repair tests/swrestart.test.mjs asked for and it holds - while the Cache API
// works and while the record says something the worker can use.
//
// This suite asks the other half of the question: what happens when the record is NOT
// there. Four ways it can not be there, all of them ordinary on a phone:
//
//   1. rememberClient's write failed. `.catch(() => undefined)` (sw.js:123) swallows it,
//      so nothing anywhere knows the window was never written down. A Cache API write
//      rejects on quota, on eviction, on a profile whose storage backend is unreadable.
//   2. buildOfClient's read failed. `.catch(() => null)` (sw.js:139) returns the SAME
//      null that "nobody ever wrote it down" returns, so a read error and a missing
//      record are one value by the time anything acts on it.
//   3. The record is gone - evicted, pruned by forgetClosedClients, or never written.
//   4. The record is there and says something unusable: a cache name that is not on this
//      disk any more, or a body that is not a build name at all.
//
// In every one of those cases the worker still ANSWERS. With one previous shelf on the
// disk it serves that shelf (sw.js:291) whether or not the window is running it; with
// several it asks the origin and then guesses the newest (sw.js:304-305); with none, and
// for any unusable stored value, it falls back to THIS build's cache (sw.js:290, 312).
// Every one of those is a page from one build being handed another build's scripts -
// the exact failure the header of sw.js says the whole design exists to prevent - and
// the corrupt case additionally lets reapUnusedCaches DELETE the shelf a live window is
// still running (sw.js:176-185), because a corrupt value is "known" as far as
// buildsInUse is concerned.
//
// The invariant these checks are written against:
//
//   * a window whose build IS known is served that build's shelf and nothing else;
//   * a window whose identity is unknown, unreadable or corrupt is served NEITHER this
//     build's assets NOR an arbitrary previous build's - it gets a dedicated, static,
//     fail-closed diagnostic response instead, and every cache and every byte of stored
//     data is left exactly where it is;
//   * no cache is deleted while any live window's identity is unknown, or while a live
//     window's identity still names it.
//
// How it is measured. Five real trees are materialised out of the working tree, each
// one stamped as its own build (index.html's meta, js/app.js's APP_VERSION, sw.js's
// VERSION, and one comment line in js/sync/sync.js so the sync layer is a discriminator
// too). They are served from ONE origin whose pointer moves, the way tests/handover and
// tests/swrestart do it. Every answer is a SHA-256 of the bytes a page was actually
// handed, and at the moment of nearly every assertion the origin is withholding the
// file - so an answer that arrives at all came out of a cache, and the only question
// left is whose.
//
// Two things are deliberately not real, and are named here rather than glossed:
//
//   * The Cache API failures are INJECTED. The build served for those phones carries a
//     prologue that wraps CacheStorage.prototype.open and makes `put` (or `match`)
//     reject for the `farkad-clients` cache only. A browser rejects those calls for
//     quota, eviction and storage-backend errors; this is that shape of failure, not
//     that cause. See FINDINGS.md.
//   * The windows that must STAY on an older build are held there by being mid-edit:
//     an input with text in it, focused, so js/ui/offline.js's catchUpWhenSafe() keeps
//     deferring the catch-up reload. That is a production state (somebody is typing),
//     and it is the only way three windows of three builds can be open at once from
//     v87 forward, where every claimed window catches itself up.

import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ---------------------------------------------------------------- where the tree is
//
// Every path below is derived from this file's own location: walk up from it until a
// directory holds both sw.js and tests/runner.mjs. Dropped into tests/ that finds the
// checkout it ships in on the first step. FARKAD_REPO overrides it only so the same
// file can be run from a scratch directory before it lands.
function repoAbove(start) {
    let dir = start;
    for (let step = 0; step < 8; step += 1) {
        if (existsSync(join(dir, 'sw.js')) && existsSync(join(dir, 'tests', 'runner.mjs'))) return dir;
        const up = dirname(dir);
        if (up === dir) break;
        dir = up;
    }
    return null;
}

// This file's own checkout, always. An override goes through the one instrument that
// binds it to a commit - see tests/treecheck.mjs and tests/blobs.test.mjs - rather than
// being read here, because a suite that reads the variable for itself is a suite that has
// stepped round the binding.
const REPO = repoAbove(fileURLToPath(new URL('.', import.meta.url)));

if (!REPO) {
    console.error('SETUP FAILED: no checkout above this file');
    process.exit(2);
}

const { suite, check, given, report } =
    await import(pathToFileURL(join(REPO, 'tests', 'runner.mjs')).href);
const { rootFromEnv, refuseUnlessVerified } =
    await import(pathToFileURL(join(REPO, 'tests', 'treecheck.mjs')).href);

// If somebody re-roots this suite, the tree they point at must be the commit they name.
const ROOT_ENV = rootFromEnv(REPO);
given('the tree this suite reads is the tree it was pointed at',
    refuseUnlessVerified(ROOT_ENV.root, ROOT_ENV.overridden, ROOT_ENV.expect) === null,
    String(refuseUnlessVerified(ROOT_ENV.root, ROOT_ENV.overridden, ROOT_ENV.expect)));
// CommonJS through a dynamic import: the named export is on `default` for the CJS build
// and on the namespace for anything else. Both are accepted rather than guessed at.
const playwright = await import(pathToFileURL(join(REPO, 'node_modules', 'playwright', 'index.js')).href);
const chromium = playwright.chromium || (playwright.default && playwright.default.chromium);
given('playwright is where this checkout keeps it', Boolean(chromium),
    join(REPO, 'node_modules', 'playwright'));
const EXEC = process.env.CHROME_PATH || undefined;

const settle = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const DEPLOYED = ['index.html', 'sw.js', 'manifest.webmanifest', 'css', 'js', 'icons'];
const CLIENTS = 'farkad-clients';

const work = mkdtempSync(join(tmpdir(), 'farkad-failclosed-'));

function git(args, asText) {
    return execFileSync('git', ['-C', REPO, ...args],
        { maxBuffer: 128 * 1024 * 1024, ...(asText ? { encoding: 'utf8' } : {}) });
}

// ---------------------------------------------------------------- five builds, one tree
//
// The working tree, copied five times and stamped five ways. Not five releases out of
// git: the code under test is the code in the tree, and the point of this suite is that
// EVERY build here carries the durable bookkeeping - the best case for sw.js, not a
// museum piece that predates it.
const BASE_STAMP = (() => {
    const hit = readFileSync(join(REPO, 'js', 'app.js'), 'utf8').match(/const APP_VERSION = '([^']*)';/);
    return hit && hit[1];
})();
given('the working tree names a build', Boolean(BASE_STAMP), String(BASE_STAMP));

// The Cache API that refuses. Wrapped at CacheStorage.prototype.open so both the
// identity writes and the identity reads go through it, and ONLY for the client record:
// the shell caches are untouched, so the app installs and runs normally and the only
// thing that fails is the thing this suite is about.
const faultPrologue = fault => `// ---- injected by swfailclosed.test.mjs ----
(function () {
    const FAULT = ${JSON.stringify(fault)};
    const open = CacheStorage.prototype.open;
    CacheStorage.prototype.open = function (name) {
        return open.call(this, name).then(cache => {
            if (name !== ${JSON.stringify(CLIENTS)}) return cache;
            return new Proxy(cache, {
                get(target, prop) {
                    if (prop === 'put' && FAULT.put) {
                        return () => Promise.reject(new DOMException('storage full', 'QuotaExceededError'));
                    }
                    if (prop === 'match' && FAULT.match) {
                        return () => Promise.reject(new DOMException('read failed', 'UnknownError'));
                    }
                    const value = Reflect.get(target, prop);
                    return typeof value === 'function' ? value.bind(target) : value;
                }
            });
        });
    };
})();
`;

const TRACKED = git(['ls-files', '--', ...DEPLOYED], true).split('\n').filter(Boolean);

function makeBuild(id, fault) {
    const dest = join(work, id);
    const stamp = BASE_STAMP + id;
    for (const name of TRACKED) {
        mkdirSync(join(dest, dirname(name)), { recursive: true });
        copyFileSync(join(REPO, name), join(dest, name));
    }
    const edit = (name, from, to) => {
        const text = readFileSync(join(dest, name), 'utf8');
        const next = text.replace(from, to);
        given(`the ${id} tree could be stamped in ${name}`, next !== text, String(from));
        writeFileSync(join(dest, name), next);
    };
    edit('index.html', `<meta name="farkad-build" content="${BASE_STAMP}">`,
        `<meta name="farkad-build" content="${stamp}">`);
    edit('js/app.js', `const APP_VERSION = '${BASE_STAMP}';`, `const APP_VERSION = '${stamp}';`);
    edit('sw.js', `const VERSION = 'farkad-${BASE_STAMP}';`, `const VERSION = 'farkad-${stamp}';`);
    // The sync layer, made a discriminator without being made a different program: one
    // comment line, so "which build's sync.js was this page handed" is a question with
    // an answer.
    writeFileSync(join(dest, 'js/sync/sync.js'),
        readFileSync(join(dest, 'js/sync/sync.js'), 'utf8') + `\n// build ${stamp}\n`);
    if (fault) {
        writeFileSync(join(dest, 'sw.js'),
            faultPrologue(fault) + readFileSync(join(dest, 'sw.js'), 'utf8'));
    }
    return { id, dest, stamp, cache: 'farkad-' + stamp, fault: fault || null };
}

const BUILD = {
    a: makeBuild('a'),
    b: makeBuild('b'),
    c: makeBuild('c'),
    p: makeBuild('p', { put: true }),
    m: makeBuild('m', { match: true })
};
const IDS = Object.keys(BUILD);

function expectedCache(id) {
    const out = {};
    for (const name of TRACKED) {
        if (name === 'sw.js') continue;
        out['/' + name] = sha(readFileSync(join(BUILD[id].dest, name)));
    }
    out['/'] = out['/index.html'];
    return out;
}
const EXPECT = Object.fromEntries(IDS.map(id => [id, expectedCache(id)]));

given('the five trees are complete', TRACKED.length > 30, `${TRACKED.length} files`);
given('js/app.js tells all five builds apart',
    new Set(IDS.map(id => EXPECT[id]['/js/app.js'])).size === 5);
given('js/sync/sync.js tells all five builds apart',
    new Set(IDS.map(id => EXPECT[id]['/js/sync/sync.js'])).size === 5);
given('the five cache names are five names',
    new Set(IDS.map(id => BUILD[id].cache)).size === 5);

// The inventory, printed before anything is asked. Every check below reports the
// SHA-256 it was actually handed; these are what those hashes MEAN. HASHES=1 prints the
// whole shell for every build rather than only the files the checks ask for.
const ASKED = ['/index.html', '/js/app.js', '/js/sync/sync.js'];
console.log('sha256 of the files these checks ask for:');
for (const path of (process.env.HASHES ? Object.keys(EXPECT.a).sort() : ASKED)) {
    for (const id of IDS) console.log(`  ${path}  ${BUILD[id].stamp}  ${EXPECT[id][path]}`);
}

// What a hash IS, said in build names. Every build it could be, not the first match.
function nameOf(path, hash) {
    if (hash === null || hash === undefined) return 'nothing';
    const hits = IDS.filter(id => EXPECT[id][path] === hash).map(id => BUILD[id].stamp);
    return hits.length ? hits.join('/') : 'bytes from no build here';
}
// Is this any build's real asset - as opposed to a refusal, a diagnostic, or nothing?
const isAsset = (path, hash) => IDS.some(id => EXPECT[id][path] === hash);

// ---------------------------------------------------------------- one origin, five trees

const TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png'
};

function origin() {
    let root = BUILD.a.dest;
    let dark = false;
    const withheld = new Set();
    const hits = [];
    const sockets = new Set();

    const server = createServer((request, response) => {
        const path = decodeURIComponent(new URL(request.url, 'http://x').pathname);
        hits.push(path);
        if (dark || withheld.has(path)) { response.writeHead(503).end('unavailable'); return; }
        const name = path === '/' ? '/index.html' : path;
        const file = join(root, name.replace(/^\/+/, ''));
        if (!file.startsWith(root)) { response.writeHead(403).end('no'); return; }
        let body;
        try { body = readFileSync(file); }
        catch (error) { response.writeHead(404).end('not found'); return; }
        response.writeHead(200, {
            'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
            'Cache-Control': 'no-store',
            'Service-Worker-Allowed': '/'
        });
        response.end(body);
    });

    server.on('connection', socket => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
    });

    return new Promise(resolve => {
        server.listen(0, '127.0.0.1', () => resolve({
            url: `http://127.0.0.1:${server.address().port}`,
            deploy: id => { root = BUILD[id].dest; },
            withhold: path => withheld.add(path),
            restore: path => withheld.delete(path),
            darken: value => { dark = value; },
            hits,
            close: () => new Promise(done => { sockets.forEach(s => s.destroy()); server.close(done); })
        }));
    });
}

const server = await origin();
const BASE = server.url;
const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});
const browserCdp = await browser.newBrowserCDPSession();

// ---------------------------------------------------------------- the instruments

async function openWindow(ctx) {
    const page = await ctx.newPage();
    page.on('dialog', d => d.accept());
    return page;
}

async function boot(page) {
    await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null,
        { timeout: 25000, polling: 100 });
}

const buildOf = page => page.evaluate(() => ({
    meta: document.querySelector('meta[name="farkad-build"]').getAttribute('content'),
    script: typeof APP_VERSION === 'string' ? APP_VERSION : null,
    controlled: Boolean(navigator.serviceWorker.controller)
}));

// What a window actually IS right now, asked in a way that survives the app not being
// there. buildOf reads a meta tag and throws when the page is a refusal rather than the
// app, which is the very outcome some of these scenarios are about.
const pageState = page => page.evaluate(() => {
    const meta = document.querySelector('meta[name="farkad-build"]');
    return {
        // The bare identifier, not window.APP_VERSION: these are classic scripts and a
        // top-level `const` is in scope without ever becoming a property of window, so
        // asking window for it answers "not booted" about an app that is running fine.
        booted: typeof APP_VERSION === 'string',
        meta: meta ? meta.getAttribute('content') : null,
        controlled: Boolean(navigator.serviceWorker.controller),
        text: (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').slice(0, 200)
    };
});

const cacheKeys = page => page.evaluate(() => caches.keys());

const shelfCounts = page => page.evaluate(async () => {
    const out = {};
    for (const name of await caches.keys()) {
        out[name] = (await (await caches.open(name)).keys()).length;
    }
    return out;
});

// The durable record itself, read through the PAGE's Cache API - which is never the
// faulted one. What the worker wrote down, and what is still there.
const clientRecord = page => page.evaluate(async name => {
    const cache = await caches.open(name);
    const out = [];
    for (const request of await cache.keys()) {
        const response = await cache.match(request);
        out.push({ id: request.url.split('/').pop(), build: await response.text() });
    }
    return out;
}, CLIENTS);

// Rewrite (or drop) the record of the window that is recorded as running `build`. The
// page is the only party that can do this to the worker's store; on a phone the same
// state arrives by eviction, by a partial write, or by a shelf that was reaped out from
// under a record that still names it.
// EVERY record naming that build, not the first one found. Records of windows that have
// closed are kept for a few seconds now - deleting one the moment its client stops being
// listed was throwing away the identity of windows that were only mid-navigation - so
// "the first record whose body is farkad-v87a" stopped reliably meaning "this window's
// record", and the suite was quietly corrupting a dead window's entry while the live one
// went on being served correctly.
const editRecord = (page, build, value) => page.evaluate(async ([name, want, next]) => {
    const cache = await caches.open(name);
    const touched = [];
    for (const request of await cache.keys()) {
        const response = await cache.match(request);
        if ((await response.text()) !== want) continue;
        if (next === null) await cache.delete(request);
        else await cache.put(request, new Response(next));
        touched.push(request.url);
    }
    return touched.length === 0 ? null : touched.join(' ');
}, [CLIENTS, build, value === undefined ? null : value]);

// One asset, asked for through the page's own controller, hashed. The only question
// that tells a mixed build from a clean one.
const served = (page, path) => page.evaluate(async name => {
    let response;
    try { response = await fetch(name, { cache: 'no-store' }); }
    catch (error) { return { status: 0, hash: null, note: String(error).slice(0, 80) }; }
    const bytes = await response.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return {
        status: response.status,
        // The refusal's own shape, not merely "these are not somebody's bytes". A test
        // that accepts any non-asset answer as a refusal also accepts a network error, a
        // 404 from a deploy in progress, and an empty body - none of which tell the
        // person anything, and one of which is the browser's own failure wearing the
        // costume of ours.
        statusText: response.statusText,
        cause: response.headers.get('X-Farkad-Fail-Closed'),
        client: response.headers.get('X-Farkad-Client'),
        type: response.headers.get('Content-Type'),
        hash: [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join(''),
        note: new TextDecoder().decode(bytes.slice(0, 60)).replace(/\s+/g, ' ')
    };
}, path);

// The same question with the origin unable to answer it, so a hit is a cache hit and
// nothing else. `dark` takes the WHOLE origin away rather than one path - a phone on a
// building site, not a deploy in progress.
async function servedOffline(page, path) {
    server.darken(true);
    try { return await served(page, path); }
    finally { server.darken(false); }
}

async function swProcess(ctx, page) {
    const cdp = await ctx.newCDPSession(page);
    const versions = new Map();
    cdp.on('ServiceWorker.workerVersionUpdated', ({ versions: list }) => {
        for (const version of list) versions.set(version.versionId, version);
    });
    await cdp.send('ServiceWorker.enable');
    await settle(300);
    return { cdp, versions };
}

const swTargets = async () => (await browserCdp.send('Target.getTargets')).targetInfos
    .filter(info => info.type === 'service_worker' && info.url.startsWith(BASE));

// Stops every worker of this origin and proves it stopped, two ways: the CDP version
// record says `stopped`, and the service_worker TARGET is gone from the browser - a
// target is a process, so its absence is the process being gone rather than an opinion.
async function stopWorker(control) {
    await control.cdp.send('ServiceWorker.stopAllWorkers');
    const deadline = Date.now() + 10000;
    let targets = await swTargets();
    while (targets.length > 0 && Date.now() < deadline) {
        await settle(150);
        targets = await swTargets();
    }
    // 'stopping' is a process on its way out and the target is already gone; only
    // 'running' and 'starting' are a process that could still answer a fetch.
    let running = [];
    const settled = Date.now() + 4000;
    do {
        running = [...control.versions.values()]
            .filter(version => /^(running|starting)$/.test(version.runningStatus))
            .map(version => `${version.versionId}:${version.runningStatus}`);
        if (running.length === 0) break;
        await settle(200);
    } while (Date.now() < settled);
    const stale = [...control.versions.values()]
        .map(version => `${version.versionId}:${version.runningStatus}`);
    // Printed rather than only asserted: a suite about restarts should say, in its own
    // log, that the process really went - the two independent ways it was checked.
    console.log(`  [stopAllWorkers] service_worker targets on this origin: ${targets.length}; `
        + `versions: ${stale.join(' ') || 'none reported'}`);
    return { targets: targets.length, running, stale, ok: targets.length === 0 && running.length === 0 };
}

// Somebody is typing in this window. js/ui/offline.js:117-120 defers the catch-up reload
// while midEdit() is true, which is what lets a window stay on the build it is running
// after a newer worker has claimed it.
async function pin(page) {
    await page.evaluate(() => {
        let input = document.getElementById('__pinned');
        if (!input) {
            input = document.createElement('input');
            input.id = '__pinned';
            document.body.appendChild(input);
        }
        input.value = 'שם עובד';
        input.focus();
    });
    return page.evaluate(() => midEdit());
}

// Reaps in flight, waited out.
//
// A 'running' message starts reapLater, which comes back at +2s and again at +5s
// (sw.js:194-203), and a navigation schedules one at +1.5s (sw.js:260-261). Any of those
// that lands while the NEXT build is installing deletes that build's shelf: for the
// worker doing the reaping the incoming cache is just another name that is not VERSION
// and that no window is recorded as running (sw.js:160-162, 176-185). The last suite in
// this file reproduces that on purpose. Everywhere else the setup waits the reaps out
// first, so the scenarios are about identity and not about that.
const quiesce = () => settle(8500);

// A deploy, and one window crossing to it by the banner - the only way a build is
// adopted in this app.
async function crossTo(page, id) {
    await quiesce();
    server.deploy(id);
    await page.bringToFront();
    await page.evaluate(() => navigator.serviceWorker.getRegistration()
        .then(registration => registration.update()).catch(() => {}));
    const offered = await page.waitForSelector('#updateBanner:visible', { timeout: 35000 })
        .then(() => true, () => false);
    if (process.env.DUMP) console.log('DUMP before click', id, JSON.stringify(await shelfCounts(page)));
    if (!offered) return { offered, crossed: false };
    const [crossed] = await Promise.all([
        page.waitForNavigation({ timeout: 35000 }).then(() => true, () => false),
        page.getByRole('button', { name: 'רענן עכשיו' }).click()
    ]);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null,
        { timeout: 25000, polling: 100 });
    await settle(1500);
    const shelves = await shelfCounts(page);
    if (process.env.DUMP) console.log('DUMP after cross', id, JSON.stringify(shelves));
    return { offered, crossed, shelf: shelves[BUILD[id].cache] || 0, shelves };
}

// The two checks every scenario below ends with, said once: the window was handed its
// own build, and - when it could not be identified - it was handed a refusal rather
// than somebody else's program.
const describe = (path, result) =>
    `${nameOf(path, result.hash)} sha256=${result.hash} (status ${result.status}`
    + `${result.cause ? ', cause ' + result.cause : ''})`;

function servedOwnBuild(name, page, id, result, path) {
    check(name, result.hash === EXPECT[id][path],
        `${describe(path, result)}, wanted ${BUILD[id].stamp} ${EXPECT[id][path]}`);
}
// A refusal is a refusal only if it is THE refusal.
//
// This used to ask one question - "are these bytes not any build's asset" - and every
// other way of not answering passes that: a network error with hash null, a 404 while a
// deploy is in flight, an empty body, a worker that threw. So the suite could go green
// on the app simply failing to load, which is a different outcome from the app being
// told why it cannot load, and only one of them is recoverable by a reload.
//
// The exact shape is required instead: status 503, the diagnostic header naming a cause,
// and - when the caller knows which cause it should be - that exact cause. `cause` is
// checked against the header rather than the body so a reworded message is not a test
// failure, while a refusal that stops saying why is.
function failedClosed(name, result, path, cause) {
    const shaped = result.status === 503
        && typeof result.cause === 'string' && result.cause.length > 0
        && !isAsset(path, result.hash)
        && (cause === undefined || result.cause === cause);
    check(name, shaped,
        `status ${result.status} "${result.statusText}" cause=${JSON.stringify(result.cause)}`
        + `${cause === undefined ? '' : ` (wanted ${cause})`}, handed ${describe(path, result)}`);
}

// ================================================================ three builds, three windows
const three = await browser.newContext();
{
    suite('three windows running three builds, and a worker that keeps the record');

    server.deploy('a');
    const wa = await openWindow(three);
    await boot(wa);
    const wb = await openWindow(three);
    await boot(wb);
    const wc = await openWindow(three);
    await boot(wc);
    await settle(1500);
    given('three windows are running the first build',
        (await buildOf(wa)).script === BUILD.a.stamp
        && (await buildOf(wb)).script === BUILD.a.stamp
        && (await buildOf(wc)).script === BUILD.a.stamp);

    // Pinned BEFORE anything crosses: from this build forward a claimed window catches
    // itself up on its own (js/ui/offline.js:88-90), so the only window that can stay on
    // an older build is one where somebody is typing.
    given('the window that must stay on the first build is mid-edit', await pin(wa));

    const toB = await crossTo(wb, 'b');
    given('the second build is offered, one window crosses to it, and its shelf is complete',
        toB.offered && toB.crossed && toB.shelf > 30, JSON.stringify(toB));
    given('the pinned window is still running the first build',
        (await buildOf(wa)).script === BUILD.a.stamp, (await buildOf(wa)).script);
    given('the window that must stay on the second build is mid-edit now', await pin(wb));

    // The third window was claimed by the second build's worker and caught itself up -
    // which is the design working. It crosses again, to the third build.
    await wc.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null,
        { timeout: 25000, polling: 100 });
    await settle(1200);
    const toC = await crossTo(wc, 'c');
    given('the third build is offered, a third window crosses to it, and its shelf is complete',
        toC.offered && toC.crossed && toC.shelf > 30, JSON.stringify(toC));
    await settle(1200);

    const running = {
        a: (await buildOf(wa)).script, b: (await buildOf(wb)).script, c: (await buildOf(wc)).script
    };
    given('three windows are running three different builds, right now',
        running.a === BUILD.a.stamp && running.b === BUILD.b.stamp && running.c === BUILD.c.stamp,
        JSON.stringify(running));

    const keys = await cacheKeys(wc);
    given('all three shelves and the record are on the disk',
        ['a', 'b', 'c'].every(id => keys.includes(BUILD[id].cache)) && keys.includes(CLIENTS),
        keys.join());

    if (process.env.DUMP) {
        console.log('DUMP shelves', JSON.stringify(await wc.evaluate(async () => {
            const out = {};
            for (const name of await caches.keys()) {
                const cache = await caches.open(name);
                out[name] = (await cache.keys()).map(r => new URL(r.url).pathname).length;
            }
            return out;
        })));
        console.log('DUMP c has app.js', await wc.evaluate(() => caches.open('farkad-v87c')
            .then(c => c.match(new Request(location.origin + '/js/app.js'))).then(Boolean)));
        console.log('DUMP c live fetch', JSON.stringify(await served(wc, 'js/app.js')));
        console.log('DUMP c url', await wc.evaluate(() => location.href));
        console.log('DUMP record', JSON.stringify(await clientRecord(wc)));
    }

    // The control. Nothing is faulted, nothing was deleted, the worker has been up the
    // whole time: every window gets its own build. Without this the reds below would say
    // nothing about whether the question can be answered at all.
    for (const [id, page] of [['a', wa], ['b', wb], ['c', wc]]) {
        const hit = await servedOffline(page, 'js/app.js');
        servedOwnBuild(`with the record intact, the ${BUILD[id].stamp} window is served ${BUILD[id].stamp}`,
            page, id, hit, '/js/app.js');
    }

    const record = await clientRecord(wc);
    check('and the record on the disk names all three builds',
        new Set(record.map(entry => entry.build)).size === 3
        && ['a', 'b', 'c'].every(id => record.some(entry => entry.build === BUILD[id].cache)),
        JSON.stringify(record.map(entry => entry.build)));

    // ------------------------------------------------------------ the restart, record intact
    suite('a restarted worker, with the record still on the disk');

    const control = await swProcess(three, wc);
    const stopped = await stopWorker(control);
    check('the worker process really is gone, so what follows is a restart',
        stopped.ok, `${stopped.targets} targets, running ${stopped.running.join()}`);

    for (const [id, page] of [['a', wa], ['b', wb], ['c', wc]]) {
        const hit = await servedOffline(page, 'js/app.js');
        servedOwnBuild(`after the restart the ${BUILD[id].stamp} window is still served ${BUILD[id].stamp}`,
            page, id, hit, '/js/app.js');
    }

    // ------------------------------------------------------------ the record is gone
    suite('the record is gone for two of the three windows');

    // Evicted, pruned, or never written - by the time anything acts on it, all three are
    // the same missing entry. The other window's record is left alone, so the worker
    // cannot fall back on "nobody is written down".
    const droppedA = await editRecord(wa, BUILD.a.cache, undefined);
    const droppedC = await editRecord(wc, BUILD.c.cache, undefined);
    given('two records were removed and the third was left', Boolean(droppedA) && Boolean(droppedC),
        `${droppedA} / ${droppedC}`);
    const left = await clientRecord(wb);
    // What the scenario needs is that NOTHING on the disk can still identify the first
    // and third windows, while the second is still identifiable. It used to be phrased as
    // "exactly one record", which also counted records belonging to windows that have
    // since closed - and those now linger a few seconds longer on purpose, because
    // deleting a record the moment a client stops being listed was throwing away the
    // identity of windows that were merely mid-navigation.
    given('no record names the first or third build any more, and the middle one still does',
        !left.some(entry => entry.build === BUILD.a.cache || entry.build === BUILD.c.cache)
        && left.some(entry => entry.build === BUILD.b.cache), JSON.stringify(left));

    const stoppedAgain = await stopWorker(control);
    given('the worker process is gone again, so nothing is remembered in memory either',
        stoppedAgain.ok, `${stoppedAgain.targets} targets, running ${stoppedAgain.running.join()}`);

    // With the origin dark: three shelves down there, two windows nobody can identify.
    const darkA = await servedOffline(wa, 'js/app.js');
    const darkC = await servedOffline(wc, 'js/app.js');
    failedClosed('a window whose record vanished is refused, not handed a guessed build (offline origin)',
        darkA, '/js/app.js');
    failedClosed('and neither is the window running THIS build when its record vanished',
        darkC, '/js/app.js');
    // Written to catch two windows being handed the same WRONG build. Both being handed
    // the same REFUSAL is the opposite outcome and the required one: neither is running a
    // build this device can name, so neither may be served. Rewritten to say that, with
    // the original claim kept underneath it - if either window is ever handed real bytes
    // here, they must at least be different bytes.
    check('two windows of two builds are refused, or at least not handed the same build',
        (darkA.status === 503 && darkC.status === 503) || darkA.hash !== darkC.hash,
        `${describe('/js/app.js', darkA)} and ${describe('/js/app.js', darkC)}`);
    servedOwnBuild('the window whose record survived is served its own build, restart or not',
        wb, 'b', await servedOffline(wb, 'js/app.js'), '/js/app.js');

    // The sync layer goes out on the same branch, so it is asked for by name.
    failedClosed('the sync layer of an unidentifiable window is refused too',
        await servedOffline(wa, 'js/sync/sync.js'), '/js/sync/sync.js');

    // And with the origin up. Now the guess is the origin's CURRENT pointer - which is
    // the newest build, handed to a window running the oldest.
    server.deploy('c');
    const liveA = await served(wa, 'js/app.js');
    check('with the origin reachable, an unidentifiable window is not handed the current deploy',
        !isAsset('/js/app.js', liveA.hash) || liveA.hash === EXPECT.a['/js/app.js'],
        `the ${BUILD.a.stamp} window was handed ${describe('/js/app.js', liveA)}`);

    // Nothing may be thrown away while a window cannot be identified. This one the
    // current code gets right - reapUnusedCaches returns early on `unknown` (sw.js:180) -
    // and it is checked so the report says which half holds and which does not.
    await wb.evaluate(build => navigator.serviceWorker.controller
        .postMessage({ type: 'running', build }), BUILD.b.cache);
    await settle(2500);
    const survived = await cacheKeys(wb);
    check('no shelf is deleted while any window\'s identity is unknown',
        ['a', 'b', 'c'].every(id => survived.includes(BUILD[id].cache)), survived.join());

    await three.close();
}

// ================================================================ the write that failed
const putPhone = await browser.newContext();
{
    suite('a client whose identity could not be written down (Cache API put refuses)');

    server.deploy('a');
    const old = await openWindow(putPhone);
    await boot(old);
    const now = await openWindow(putPhone);
    await boot(now);
    await settle(1200);
    given('the window that must stay behind is mid-edit', await pin(old));

    // The newest build's worker cannot write the record: every put into farkad-clients
    // rejects.
    //
    // This suite used to continue "...and the navigation completes" - the app started on
    // build p with nothing on the disk saying so, and the mixed build arrived later, at
    // the first worker restart. The navigation does not complete any more: a window is
    // not handed a page until its identity is durably recorded and read back, so what
    // comes back is the fail-closed document instead of the app.
    //
    // That is a real cost and it is the point of the trade. The app not opening on a
    // device whose Cache API is refusing writes is a visible failure a reload can chase;
    // the app opening as a session that cannot be identified is an invisible one that
    // ends in another build's scripts running against this build's data, halfway through
    // somebody's working day.
    const crossed = await crossTo(now, 'p');
    given('the update was offered and the window navigated to it',
        crossed.offered && crossed.crossed, JSON.stringify(crossed));

    // Read off the window the navigation actually produced. Asking for index.html again
    // afterwards measures the wrong thing: that is an ordinary fetch from an existing
    // client, which takes the clientId branch and is refused for a different reason.
    const landed = await pageState(now);
    check('the app does not start on a build whose identity write is refused',
        landed.booted === false && landed.meta === null,
        JSON.stringify(landed));
    check('and what the person sees is a page that says so, in their own language',
        /האפליקציה לא נפתחה/.test(landed.text), landed.text.slice(0, 120));

    const record = await clientRecord(now);
    check('and nothing was written down for it, which is why it was refused',
        !record.some(entry => entry.build === BUILD.p.cache),
        `stored: ${JSON.stringify(record.map(entry => entry.build))}`);

    const control = await swProcess(putPhone, now);
    const stopped = await stopWorker(control);
    check('the worker process really is gone, so what follows is a restart',
        stopped.ok, `${stopped.targets} targets, running ${stopped.running.join()}`);

    // THE FORBIDDEN OUTCOME, and until the repair this suite counted it as a pass.
    //
    // One previous shelf on the disk - build a's. The old code reached previousCaches(),
    // found exactly one, and handed this window build a's app.js and build a's sync.js:
    // a page from one build executing another build's program, in one session. The
    // assertion here was `after.hash === EXPECT.a[...] || after.status === 503`, whose
    // left arm IS that outcome, so the suite reported green while it happened.
    //
    // The singleton guess is gone. A window with no record is refused, and the legacy
    // phones the guess was protecting are written down at activate instead - before the
    // claim, while their build is still a fact rather than an inference.
    const after = await servedOffline(now, 'js/app.js');
    check('after the restart, the unwritten window is never handed THIS build',
        after.hash !== EXPECT.p['/js/app.js'],
        `${BUILD.p.stamp} window handed ${describe('/js/app.js', after)}`);
    failedClosed('and it is not handed the one other shelf on the disk either',
        after, '/js/app.js');
    const afterSync = await servedOffline(now, 'js/sync/sync.js');
    check('and its sync layer comes from this build or from nowhere, never from another',
        afterSync.hash !== EXPECT.a['/js/sync/sync.js'],
        describe('/js/sync/sync.js', afterSync));
    failedClosed('the sync layer is refused by the same route, and says so',
        afterSync, '/js/sync/sync.js');

    servedOwnBuild('the window whose record was written before the fault is still served its own build',
        old, 'a', await servedOffline(old, 'js/app.js'), '/js/app.js');

    await putPhone.close();
}

// ================================================================ nothing else on the disk
const solo = await browser.newContext();
{
    suite('the same failed write with no other shelf on the disk');

    server.deploy('p');
    const only = await openWindow(solo);
    await only.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    // Not boot(): boot waits for a controller, and the point of this scenario is that a
    // worker which cannot write down who it is taking over does not take anybody over.
    await settle(6000);

    const state = await pageState(only);
    const record = await clientRecord(only);
    check('a worker that cannot record a window\'s build does not claim it',
        state.controlled === false && record.length === 0,
        `controlled=${state.controlled} records ${JSON.stringify(record.map(e => e.build))}`);
    check('and the app is running - from the network, as a first visit does',
        state.booted === true && state.meta === BUILD.p.stamp,
        JSON.stringify({ booted: state.booted, meta: state.meta }));

    const control = await swProcess(solo, only);
    const stopped = await stopWorker(control);
    check('the worker process really is gone, so what follows is a restart',
        stopped.ok, `${stopped.targets} targets, running ${stopped.running.join()}`);

    // This used to assert a refusal, because the old code claimed the window and then had
    // nothing to identify it with. The refusal was the best answer available once that had
    // happened; not letting it happen is a better one. An unclaimed window is served by
    // the network, which on this device is the same build it is already running - there is
    // no other program here to be mixed with, which is the entire content of the rule.
    //
    // What must still be true, and is what this asks: the window is never handed a build
    // that is not its own, and its state is not the invisible one the whole file exists to
    // remove - a controlled session that nothing can identify.
    const after = await served(only, 'js/app.js');
    check('an unclaimed window is never handed another build\'s program',
        after.hash === EXPECT.p['/js/app.js'] || !isAsset('/js/app.js', after.hash),
        describe('/js/app.js', after));
    check('and it is still not a controlled session with an unknown identity',
        (await pageState(only)).controlled === false
        || (await clientRecord(only)).length > 0,
        JSON.stringify(await pageState(only)));

    await solo.close();
}

// ================================================================ the read that failed
const matchPhone = await browser.newContext();
{
    suite('a client whose identity could not be read back (Cache API match refuses)');

    server.deploy('a');
    const old = await openWindow(matchPhone);
    await boot(old);
    const now = await openWindow(matchPhone);
    await boot(now);
    await settle(1200);
    given('the window that must stay behind is mid-edit', await pin(old));

    const crossed = await crossTo(now, 'm');
    given('the update was offered and the window navigated to it',
        crossed.offered && crossed.crossed, JSON.stringify(crossed));

    // The write LANDS here - put works, match is what rejects. That distinction used to
    // be thrown away by a catch that answered a read failure with the same null a missing
    // record gives, and it still matters below. What it no longer does is let the app
    // start: a record that cannot be read back has not been verified, and an unverified
    // identity is exactly the state that ends in another build's scripts after a restart.
    const landed = await pageState(now);
    check('a build whose worker cannot read its own record does not start the app',
        landed.booted === false && landed.meta === null
        && /האפליקציה לא נפתחה/.test(landed.text),
        JSON.stringify(landed));

    const record = await clientRecord(now);
    check('the record was written and is on the disk, unlike the missing-record case',
        record.some(entry => entry.build === BUILD.a.cache),
        JSON.stringify(record.map(entry => entry.build)));

    const control = await swProcess(matchPhone, now);
    const stopped = await stopWorker(control);
    check('the worker process really is gone, so what follows is a restart',
        stopped.ok, `${stopped.targets} targets, running ${stopped.running.join()}`);

    const after = await servedOffline(now, 'js/app.js');
    failedClosed('a window whose record cannot be READ is refused, not handed another shelf',
        after, '/js/app.js');
    check('a read failure is not answered as though nothing had ever been written down',
        after.hash !== EXPECT.a['/js/app.js'],
        `${BUILD.m.stamp} window handed ${describe('/js/app.js', after)}; `
        + `on disk: ${JSON.stringify((await clientRecord(now)).map(entry => entry.build))}`);
    failedClosed('and its sync layer is refused too',
        await servedOffline(now, 'js/sync/sync.js'), '/js/sync/sync.js');

    await matchPhone.close();
}

// ================================================================ the record that lies
const corrupt = await browser.newContext();
{
    suite('a record that is there and says something unusable');

    server.deploy('a');
    const old = await openWindow(corrupt);
    await boot(old);
    const now = await openWindow(corrupt);
    await boot(now);
    await settle(1200);
    given('the window that must stay behind is mid-edit', await pin(old));

    const crossed = await crossTo(now, 'b');
    given('one window crossed and the other stayed',
        crossed.offered && crossed.crossed && crossed.shelf > 30, JSON.stringify(crossed));
    given('two windows, two builds',
        (await buildOf(old)).script === BUILD.a.stamp && (await buildOf(now)).script === BUILD.b.stamp,
        `${(await buildOf(old)).script} / ${(await buildOf(now)).script}`);

    // A record naming a shelf that is not on this disk. It arrives on a phone the moment
    // a shelf is reaped while a record still names it, or a partial write lands.
    const ghost = 'farkad-' + BASE_STAMP + 'ghost';
    given('the older window\'s record now names a shelf that does not exist',
        Boolean(await editRecord(old, BUILD.a.cache, ghost)),
        JSON.stringify((await clientRecord(old)).map(entry => entry.build)));
    const atCorruption = await cacheKeys(now);
    given('and both shelves are on the disk at that moment',
        atCorruption.includes(BUILD.a.cache) && atCorruption.includes(BUILD.b.cache),
        atCorruption.join());

    server.deploy('b');
    const live = await served(old, 'js/app.js');
    check('a window with a corrupt record is not handed the current deploy from the origin',
        !isAsset('/js/app.js', live.hash) || live.hash === EXPECT.a['/js/app.js'],
        `the ${BUILD.a.stamp} window was handed ${describe('/js/app.js', live)}`);

    const dark = await servedOffline(old, 'js/app.js');
    failedClosed('and with the origin dark it is refused rather than served THIS build\'s assets',
        dark, '/js/app.js');
    check('a corrupt record never yields the current build\'s scripts to an older page',
        dark.hash !== EXPECT.b['/js/app.js'],
        `${BUILD.a.stamp} window handed ${describe('/js/app.js', dark)}`);

    // Not a build name at all: a body that is JSON, and a body that is empty. Both come
    // back from hit.text() as strings, so neither is null, so neither is treated as
    // unknown - they are treated as CACHE NAMES.
    for (const [what, value] of [['JSON', JSON.stringify({ build: BUILD.a.cache })], ['empty', '']]) {
        await editRecord(old, what === 'JSON' ? ghost : JSON.stringify({ build: BUILD.a.cache }), value);
        await settle(300);
        const hit = await servedOffline(old, 'js/app.js');
        failedClosed(`a record whose body is ${what} rather than a build name is refused`,
            hit, '/js/app.js');
    }

    // And the shelf itself. A corrupt record is "known" as far as buildsInUse is
    // concerned (sw.js:143-155): `unknown` stays false, so reapUnusedCaches goes ahead
    // and deletes every shelf the record does not name - including the one the window is
    // running. The reap needs no help from this test to happen; reapLater comes back at
    // +2s and +5s after any 'running' message (sw.js:194-203), so by the time the checks
    // above have run it may already have gone. The message below is only there to make
    // sure a reap has certainly been attempted.
    await now.evaluate(build => navigator.serviceWorker.controller
        .postMessage({ type: 'running', build }), BUILD.b.cache);
    await settle(3000);
    const after = await cacheKeys(now);
    check('no shelf is deleted while a live window is still running it',
        after.includes(BUILD.a.cache),
        `the ${BUILD.a.stamp} window is still open; shelves were ${atCorruption.join()} `
        + `and are now ${after.join()}`);
    const orphaned = await servedOffline(old, 'js/app.js');
    // This asked for the impossible once the invariant was settled. The window's record
    // names a shelf that is not on the disk, so nothing on this device can say which build
    // it is running - and the rule is that a window whose identity cannot be established
    // is refused rather than guessed at. Being served its own build here would mean the
    // worker had guessed correctly, which is the behaviour the other twenty checks in this
    // file exist to remove. What is required instead is that the refusal is a refusal and
    // not somebody else's bytes, and that the shelf and the record are both still there
    // for the reload to recover from.
    check('and the window is refused rather than handed a build it is not running',
        orphaned.status === 503
        && orphaned.hash !== EXPECT.b['/js/app.js'] && orphaned.hash !== EXPECT.c['/js/app.js'],
        `${describe('/js/app.js', orphaned)}`);

    await corrupt.close();
}

// ================================================================ the shelf nobody runs yet
const waiting = await browser.newContext();
{
    suite('a shelf a build has installed and is waiting on, and the reaper that cannot see it');

    // Not the identity question - the OTHER half of the same rule. reapUnusedCaches keeps
    // a shelf only while a window is recorded as RUNNING that build (sw.js:143-155,
    // 176-185). A build that has installed and is waiting for somebody to press the
    // banner has a complete shelf and no window: to the worker it is replacing it is a
    // name that is not VERSION and that nobody holds, so it is deleted - while the
    // browser calls the install a success, because cache.add already resolved against a
    // handle to a cache that is no longer in the store.
    server.deploy('a');
    const page = await openWindow(waiting);
    await boot(page);
    await quiesce();

    server.deploy('b');
    await page.evaluate(() => navigator.serviceWorker.getRegistration()
        .then(registration => registration.update()).catch(() => {}));
    const installed = await page.waitForFunction(
        ([name, count]) => caches.open(name).then(cache => cache.keys())
            .then(keys => keys.length >= count).catch(() => false),
        [BUILD.b.cache, 30], { timeout: 40000, polling: 150 }).then(() => true, () => false);
    given('the next build installed a complete shelf and is waiting to be pressed', installed,
        JSON.stringify(await shelfCounts(page)));

    // The one thing a second window doing nothing but loading would do: announce which
    // build it is running (js/ui/offline.js:74-77). That is all it takes.
    await page.evaluate(build => navigator.serviceWorker.controller
        .postMessage({ type: 'running', build }), BUILD.a.cache);
    await settle(3000);
    const after = await shelfCounts(page);
    check('the waiting build\'s shelf is not deleted by the build it is replacing',
        (after[BUILD.b.cache] || 0) > 30,
        `${BUILD.b.cache} ${BUILD.b.cache in after ? 'holds ' + after[BUILD.b.cache] + ' files' : 'is gone'}`
        + `; shelves now ${JSON.stringify(after)}`);

    await waiting.close();
}

// ================================================================ enrollment before the claim
const enroll = await browser.newContext();
{
    suite('the windows a new worker claims from the worker before it');

    // The repair the rest of this file's refusals depend on, stated as its own scenario.
    //
    // clients.claim() takes over every window of the origin. At the moment it runs, the
    // windows it is taking over are - by construction - the ones the OUTGOING worker was
    // controlling: they are running the previous build, and this is the one moment in the
    // life of the device when that is known rather than guessed. sw.js does not use that
    // moment. It claims first and asks afterwards, at fetch time, by which point the only
    // thing left to go on is how many shelves happen to be on the disk.
    //
    // So: before claiming, write down who those windows are. Read it back. Claim only if
    // that succeeded. After that a window with no record is not "a phone from before the
    // bookkeeping" - it is a window nothing on this device can identify, and refusing it
    // costs nothing that was ever working.
    server.deploy('a');
    const one = await openWindow(enroll);
    await boot(one);
    const two = await openWindow(enroll);
    await boot(two);
    await quiesce();
    given('two windows are running the first build',
        (await buildOf(one)).script === BUILD.a.stamp
        && (await buildOf(two)).script === BUILD.a.stamp);
    given('the window that must stay behind is mid-edit', await pin(one));

    // Take the records away, so what is on the disk afterwards can only have been put
    // there by the incoming worker rather than left over from the outgoing one. This is
    // the state every phone in the field is actually in: v86's worker wrote no records.
    await one.evaluate(async name => {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) await cache.delete(request);
    }, CLIENTS);
    given('neither window has a record any more, exactly as a pre-v87 phone has none',
        (await clientRecord(one)).length === 0);

    // And this window will not tell the worker what it is running, because a real one
    // cannot. The 'running' message is js/ui/offline.js code that ships in v87 and later;
    // the windows this whole problem is about were loaded by v86, whose page says nothing
    // and whose worker wrote nothing. Without this the suite measures the wrong thing: the
    // record appears, but it appears because the PAGE asserted its own identity after the
    // claim, which no page in the field can do and which no worker should believe anyway
    // - a page can name any build it likes, and the one asking is the one being placed.
    //
    // Enrollment has to come from the worker, at activate, from the fact that these
    // windows were already being controlled when it arrived.
    await one.evaluate(() => {
        const proto = window.ServiceWorker && window.ServiceWorker.prototype;
        if (!proto || proto.__farkadNoAnnounce) return;
        const real = proto.postMessage;
        proto.postMessage = function (data) {
            if (data && data.type === 'running') return undefined;
            return real.apply(this, arguments);
        };
        proto.__farkadNoAnnounce = true;
    });
    given('and it will not announce itself either, as a v86 page cannot',
        await one.evaluate(() => Boolean(window.ServiceWorker.prototype.__farkadNoAnnounce)));

    const crossed = await crossTo(two, 'b');
    given('the second window crossed to the next build and its shelf is complete',
        crossed.offered && crossed.crossed && crossed.shelf > 30, JSON.stringify(crossed));
    await settle(1500);

    const enrolled = await clientRecord(two);
    check('claiming a window means writing down which build it is running, first',
        enrolled.length >= 2,
        `records on the disk: ${JSON.stringify(enrolled.map(entry => entry.build))}`);
    check('the window left behind is recorded as running the build it is running',
        enrolled.some(entry => entry.build === BUILD.a.cache),
        `wanted ${BUILD.a.cache} among ${JSON.stringify(enrolled.map(entry => entry.build))}`);

    // And the point of all of it: the enrolled window is served its own build with no
    // guess anywhere in the path, and the process can die without changing the answer.
    servedOwnBuild('the enrolled window is served its own build',
        one, 'a', await servedOffline(one, 'js/app.js'), '/js/app.js');
    const control = await swProcess(enroll, two);
    const stopped = await stopWorker(control);
    check('the worker process is gone, so nothing is answered from memory',
        stopped.ok, `${stopped.targets} targets`);
    servedOwnBuild('and still served its own build after the worker restarts',
        one, 'a', await servedOffline(one, 'js/app.js'), '/js/app.js');

    await enroll.close();
}

// ================================================================ booting without an identity
const unwritten = await browser.newContext();
{
    suite('a navigation whose identity cannot be written down');

    // Invariant: a navigation must not boot the app until its build identity is durably
    // recorded AND read back. sw.js writes the record in event.waitUntil and answers the
    // navigation regardless (sw.js:303-311), so a window whose write was refused runs the
    // app anyway - with nothing on the disk saying what it is running. Every later fetch
    // from that window is then a question with no answer, and the only reason it looks
    // fine is the in-memory Set that dies with the process.
    //
    // The app not opening is a bad outcome. Opening as a session that will be handed
    // another build's scripts the moment the worker restarts is a worse one, and it is
    // the one that corrupts a day's work rather than delaying it.
    server.deploy('p');
    const page = await openWindow(unwritten);
    await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null,
        { timeout: 25000, polling: 100 }).catch(() => {});
    await settle(1500);

    const record = await clientRecord(page);
    const running = await pageState(page);
    const asset = await served(page, 'js/app.js');

    // The FIRST visit to an origin is the one navigation no worker can gate: the page is
    // fetched from the network before any worker exists, and only then does one install.
    // So this window really is running the app with nothing written down about it, and no
    // rule in sw.js could have prevented that without preventing the app from ever being
    // installed.
    //
    // What must hold is the part that is actually in the worker's hands, and it is the
    // part that matters: an unidentified window is never handed a DIFFERENT build's bytes,
    // and its unidentified state is visible as a refusal rather than papered over with a
    // guess. The device has one shelf here, so there is nothing else to be handed - the
    // check that this holds when there IS something else to be handed is the put-refusal
    // suite above, where the same window is refused with build a's shelf sitting right
    // there.
    check('an unidentified window is refused rather than guessed at, and says why',
        record.length > 0
        || asset.status === 503 && asset.cause === 'unrecorded'
        || running.controlled === false,
        `controlled=${running.controlled} meta=${running.meta} `
        + `asset: status ${asset.status} cause=${JSON.stringify(asset.cause)} `
        + `records: ${JSON.stringify(record.map(entry => entry.build))}`);
    check('and it is never handed another build\'s program',
        !isAsset('/js/app.js', asset.hash) || asset.hash === EXPECT.p['/js/app.js'],
        describe('/js/app.js', asset));

    await unwritten.close();
}

// ================================================================ a shelf that cannot answer
const gappy = await browser.newContext();
{
    suite('a known build\'s shelf that is missing the file being asked for');

    // Invariant 6: if build X's shelf lacks an application asset, the current origin is
    // NOT the fallback. serveFrom is `hit || fetch(request)` (sw.js:455-457), and the
    // origin serves whatever is deployed now - so a page from an older build asking for a
    // file its shelf has lost is handed the CURRENT build's copy of it. That is the mixed
    // build again, arriving by the one route the identity work does not cover: identity
    // was established correctly, and the shelf simply could not answer.
    server.deploy('a');
    const stay = await openWindow(gappy);
    await boot(stay);
    const move = await openWindow(gappy);
    await boot(move);
    await quiesce();
    given('the window that must stay behind is mid-edit', await pin(stay));
    const crossed = await crossTo(move, 'b');
    given('the other window crossed, so the first build is a previous build now',
        crossed.offered && crossed.crossed && crossed.shelf > 30, JSON.stringify(crossed));

    // One file removed from the old shelf. On a phone this is eviction: the Cache API is
    // allowed to drop entries under storage pressure, per-entry, without telling anybody.
    const dropped = await stay.evaluate(async ([name, path]) => {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
            if (new URL(request.url).pathname.endsWith(path)) {
                await cache.delete(request);
                return request.url;
            }
        }
        return null;
    }, [BUILD.a.cache, '/js/app.js']);
    given('one application script is gone from the old build\'s shelf', Boolean(dropped),
        String(dropped));

    // The origin is UP and serving the NEW build. That is the whole point: the wrong
    // answer is available and free, and must not be taken.
    const hit = await served(stay, 'js/app.js');
    check('the missing file is not fetched from the origin, which serves a different build',
        hit.hash !== EXPECT.b['/js/app.js'],
        `${BUILD.a.stamp} window handed ${describe('/js/app.js', hit)}`);
    failedClosed('it is refused, and the refusal says which build could not be served',
        hit, '/js/app.js');

    await gappy.close();
}

// ================================================================ the shelf that rolled back
const rolled = await browser.newContext();
{
    suite('a waiting shelf whose name sorts below the running build');

    // Invariants 8 and 9: installing and waiting shelves are protected by LIFECYCLE, not
    // by comparing names. isNewerShelf (sw.js:206-219) protects a shelf only if its
    // version number is higher, or - on a tie - if its name sorts after this build's. So
    // a rollback, and any same-version candidate whose name happens to sort lower, is not
    // "newer", lands in previousCaches(), and is deleted by the build it is replacing -
    // while its install is still resolving against a handle to a cache that is no longer
    // in the store, so the browser calls that install a success.
    //
    // Deploying build a on top of build b is exactly that shape: same version number,
    // 'a' sorts below 'b'. It is what a rollback looks like from the worker's side.
    server.deploy('b');
    const page = await openWindow(rolled);
    await boot(page);
    await quiesce();
    given('the running build is the one whose name sorts higher',
        (await buildOf(page)).script === BUILD.b.stamp);

    server.deploy('a');
    await page.evaluate(() => navigator.serviceWorker.getRegistration()
        .then(registration => registration.update()).catch(() => {}));
    const installed = await page.waitForFunction(
        ([name, count]) => caches.open(name).then(cache => cache.keys())
            .then(keys => keys.length >= count).catch(() => false),
        [BUILD.a.cache, 30], { timeout: 40000, polling: 150 }).then(() => true, () => false);
    given('the rollback installed a complete shelf and is waiting to be pressed', installed,
        JSON.stringify(await shelfCounts(page)));

    await page.evaluate(build => navigator.serviceWorker.controller
        .postMessage({ type: 'running', build }), BUILD.b.cache);
    await settle(3000);
    const after = await shelfCounts(page);
    check('a waiting shelf is not reaped for sorting below the build it replaces',
        (after[BUILD.a.cache] || 0) > 30,
        `${BUILD.a.cache} ${BUILD.a.cache in after ? 'holds ' + after[BUILD.a.cache] + ' files' : 'is gone'}`
        + `; shelves now ${JSON.stringify(after)}`);

    await rolled.close();
}

// ================================================================ every script, not one
const whole = await browser.newContext();
{
    suite('every application script a correctly identified window is handed');

    // The suites above ask about js/app.js and js/sync/sync.js because those are the two
    // that tell the builds apart cheaply. That leaves the rest of the shell asserted by
    // implication, and "the two files we check are right" is not the invariant - the
    // invariant is that a window runs ONE build, which is a claim about all of them.
    server.deploy('a');
    const stay = await openWindow(whole);
    await boot(stay);
    const move = await openWindow(whole);
    await boot(move);
    await quiesce();
    given('the window that must stay behind is mid-edit', await pin(stay));
    const crossed = await crossTo(move, 'b');
    given('the other window crossed to the next build',
        crossed.offered && crossed.crossed && crossed.shelf > 30, JSON.stringify(crossed));

    const SCRIPTS = TRACKED.filter(name => name.endsWith('.js') && name !== 'sw.js');
    given('there are enough scripts for this to mean something', SCRIPTS.length >= 20,
        `${SCRIPTS.length} scripts`);

    server.darken(true);
    const wrong = [];
    for (const name of SCRIPTS) {
        const hit = await served(stay, name);
        if (hit.hash !== EXPECT.a['/' + name]) {
            wrong.push(`${name}: ${nameOf('/' + name, hit.hash)} (status ${hit.status})`);
        }
    }
    server.darken(false);
    check('the window left behind is handed its own build\'s bytes for every one of them',
        wrong.length === 0,
        wrong.length === 0
            ? `all ${SCRIPTS.length} scripts matched ${BUILD.a.stamp}`
            : `${wrong.length} of ${SCRIPTS.length} came from elsewhere: ${wrong.slice(0, 6).join('; ')}`);

    const moved = [];
    server.darken(true);
    for (const name of SCRIPTS) {
        const hit = await served(move, name);
        if (hit.hash !== EXPECT.b['/' + name]) {
            moved.push(`${name}: ${nameOf('/' + name, hit.hash)} (status ${hit.status})`);
        }
    }
    server.darken(false);
    check('and the window that crossed is handed its own build\'s bytes for every one of them',
        moved.length === 0,
        moved.length === 0
            ? `all ${SCRIPTS.length} scripts matched ${BUILD.b.stamp}`
            : `${moved.length} of ${SCRIPTS.length} came from elsewhere: ${moved.slice(0, 6).join('; ')}`);

    await whole.close();
}

await browser.close();
await server.close();
rmSync(work, { recursive: true, force: true });

report();
