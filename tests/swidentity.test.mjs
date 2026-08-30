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
const editRecord = (page, build, value) => page.evaluate(async ([name, want, next]) => {
    const cache = await caches.open(name);
    for (const request of await cache.keys()) {
        const response = await cache.match(request);
        if ((await response.text()) !== want) continue;
        if (next === null) await cache.delete(request);
        else await cache.put(request, new Response(next));
        return request.url;
    }
    return null;
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
    `${nameOf(path, result.hash)} sha256=${result.hash} (status ${result.status})`;

function servedOwnBuild(name, page, id, result, path) {
    check(name, result.hash === EXPECT[id][path],
        `${describe(path, result)}, wanted ${BUILD[id].stamp} ${EXPECT[id][path]}`);
}
function failedClosed(name, result, path) {
    check(name, !isAsset(path, result.hash),
        `handed ${describe(path, result)}: "${result.note}"`);
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
    given('exactly one record is left, the middle build\'s',
        left.length === 1 && left[0].build === BUILD.b.cache, JSON.stringify(left));

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
    // rejects. rememberClient swallows it (sw.js:123) and the navigation completes.
    const crossed = await crossTo(now, 'p');
    given('the window crossed to the build whose worker cannot write the record',
        crossed.offered && crossed.crossed && crossed.shelf > 30, JSON.stringify(crossed));
    given('it is running that build', (await buildOf(now)).script === BUILD.p.stamp,
        (await buildOf(now)).script);

    const record = await clientRecord(now);
    check('the failed write is silent: nothing was stored, nothing was reported, the app runs on',
        !record.some(entry => entry.build === BUILD.p.cache)
        && (await buildOf(now)).controlled === true,
        `stored: ${JSON.stringify(record.map(entry => entry.build))}`);

    // While the process lives, the in-memory SERVED covers the hole and the window is
    // answered correctly - which is exactly why the failure goes unnoticed.
    servedOwnBuild('while the worker process lives, the unwritten window is served correctly anyway',
        now, 'p', await servedOffline(now, 'js/app.js'), '/js/app.js');

    const control = await swProcess(putPhone, now);
    const stopped = await stopWorker(control);
    check('the worker process really is gone, so what follows is a restart',
        stopped.ok, `${stopped.targets} targets, running ${stopped.running.join()}`);

    // One previous shelf on the disk. sw.js:291 hands it over without asking whether
    // this window is running it.
    // These three moved, and the trade is written down rather than hidden.
    //
    // A window with NO record on a device holding exactly ONE previous shelf has one
    // possible answer, and refusing it breaks the ordinary upgrade: every phone in the
    // field runs a build that predates this bookkeeping, its worker never wrote a record,
    // and a blanket refusal is a 503 on every script the moment the new build claims that
    // window - the app failing to open, on every phone, to avoid a mixed-build session on
    // the one whose Cache API refused a write. "Never an ARBITRARY previous build" is the
    // rule, and with a single shelf there is nothing arbitrary to choose between.
    // Measured, not argued: tests/handover.test.mjs and tests/swrestart.test.mjs both go
    // red on the strict version, on the real v86-to-v87 path.
    //
    // What stays refused, and is measured everywhere else in this file: a record that is
    // there and cannot be READ - the device has an opinion about this window and cannot
    // reach it, so there is no single possible answer - a record naming a shelf that is
    // gone, and any device holding more than one previous shelf.
    //
    // The claim that does not bend, and is what these now assert: THIS build's bytes
    // never reach a window that is not running this build.
    const after = await servedOffline(now, 'js/app.js');
    check('after the restart, the unwritten window is never handed THIS build',
        after.hash !== EXPECT.p['/js/app.js'],
        `${BUILD.p.stamp} window handed ${describe('/js/app.js', after)}`);
    check('and what it does get is the one unambiguous shelf, not a choice between several',
        after.hash === EXPECT.a['/js/app.js'] || after.status === 503,
        `${BUILD.p.stamp} window handed ${describe('/js/app.js', after)}`);
    const afterSync = await servedOffline(now, 'js/sync/sync.js');
    check('and its sync layer comes from that same one shelf, never from this build',
        afterSync.hash !== EXPECT.p['/js/sync/sync.js'],
        describe('/js/sync/sync.js', afterSync));
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
    await boot(only);
    await settle(1200);
    check('one window, one build, and no record of it',
        (await buildOf(only)).script === BUILD.p.stamp
        && (await clientRecord(only)).length === 0,
        JSON.stringify(await clientRecord(only)));

    const control = await swProcess(solo, only);
    const stopped = await stopWorker(control);
    check('the worker process really is gone, so what follows is a restart',
        stopped.ok, `${stopped.targets} targets, running ${stopped.running.join()}`);

    // previousCaches() is empty, so sw.js:290 falls back to THIS build's cache: an
    // unidentified client is served the current build's assets. It happens to be right
    // here; it is right by luck, and the same branch is what serves the current build to
    // the window in the corrupt-record suite below, where it is wrong.
    const after = await servedOffline(only, 'js/app.js');
    failedClosed('an unidentifiable window is refused rather than served this build\'s assets',
        after, '/js/app.js');

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
    given('the window crossed to the build whose worker cannot read the record',
        crossed.offered && crossed.crossed && crossed.shelf > 30, JSON.stringify(crossed));
    given('it is running that build', (await buildOf(now)).script === BUILD.m.stamp,
        (await buildOf(now)).script);

    // The record IS on the disk - the write worked. This is the whole distinction the
    // catch at sw.js:139 throws away.
    const record = await clientRecord(now);
    check('the record was written and is on the disk, unlike the missing-record case',
        record.some(entry => entry.build === BUILD.m.cache)
        && record.some(entry => entry.build === BUILD.a.cache),
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

await browser.close();
await server.close();
rmSync(work, { recursive: true, force: true });

report();
