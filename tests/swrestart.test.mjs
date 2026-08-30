// A service worker process that was restarted, and the windows it no longer recognises.
//
//   node tests/swrestart.test.mjs
//
// tests/handover.test.mjs proves what happens ACROSS a deploy: two real trees, one
// origin whose pointer moves, and every answer a SHA-256 of the bytes a browser is
// actually holding. It proves it against a worker that has been alive, in one process,
// for the whole of the test. That is the one thing a phone never gives you.
//
// sw.js keeps the identity of every window it has served in `SERVED`, a Set in the
// worker's global scope (sw.js:102). A service worker is not a process that stays: the
// browser stops it after about thirty seconds of quiet and starts it again for the next
// event, and on a phone it does that all day. A restarted worker is the same VERSION,
// the same registration and the same controller - so no `controllerchange` fires, and
// js/ui/offline.js only ever announces `{type:'running'}` at register time and on
// `controllerchange` (js/ui/offline.js:72-79). Nothing re-announces. The Set comes back
// empty and stays empty.
//
// sw.js:99-101 calls that "the safe direction": a window it has forgotten reads as "not
// this build", the old cache is kept, the old bytes are served, "the same answer,
// reached again". That is true of the window running the old build. It is exactly wrong
// for the window running the NEW one - which is now also unrecognised, also takes the
// stranger branch at sw.js:180, and is handed the first thing
// `previousCaches().reduce(...)` finds (sw.js:182-187). A v87 page, asking its own
// worker for its own script, is given v86's.
//
// So this file materialises THREE real trees - v85, v86 and the working tree - serves
// them from one origin whose pointer moves, opens windows of more than one build at
// once, and then stops the worker's process with CDP the way the browser does. Every
// assertion is a SHA-256 of bytes a page was actually handed, and the origin is
// withholding the file at the moment of every one of them, so the answer can only have
// come out of a cache.
//
// What it cannot do: three windows of three DIFFERENT builds cannot be opened at this
// commit. The v85 and v86 workers reap every other cache the moment they activate
// (sw.js@880d7bb:90-98), so crossing to either one destroys the build before it. Only
// v87 keeps a cache a window is still running. Three CACHES can be made to coexist -
// an install creates its cache and only an activate reaps one, so a worker that installs
// and waits leaves its shelf behind - and three caches is what the reduce ranges over.
// That is what the third suite builds, and it is named in FINDINGS rather than glossed.

import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { suite, check, given, report } from './runner.mjs';
import { rootFromEnv, refuseUnlessVerified } from './treecheck.mjs';
import { settle } from './harness.mjs';

// The caches that are not build shelves. farkad-clients holds which window is running
// which build; farkad-shelves holds each shelf's lifecycle state, which build is active,
// and the per-build asset manifests. Neither is served out of as a shelf and neither is
// reaped as one, so neither belongs in a list of shelves.
const BOOKKEEPING = new Set(['farkad-clients', 'farkad-shelves']);

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const EXEC = process.env.CHROME_PATH || undefined;

// The repository the trees come out of. Resolved from this file's own location, so the
// copy that lives in tests/ measures the tree it ships in. The override exists only so
// the same file can be run from a scratch directory before it lands.
// See tests/treecheck.mjs: an override must name the commit it is allowed to point at.
const REPO_ENV = rootFromEnv(fileURLToPath(new URL('..', import.meta.url)));
const REPO_REFUSAL = refuseUnlessVerified(REPO_ENV.root, REPO_ENV.overridden, REPO_ENV.expect);
given('the tree this suite reads is the tree it was pointed at',
    REPO_REFUSAL === null, String(REPO_REFUSAL));
const REPO = REPO_ENV.root;

// The two released builds this test opens windows of. They age the same way
// tests/handover.test.mjs's OLD_COMMIT does: a line in docs/releases.md, not a mechanism.
const V85_COMMIT = '03bf814';
const V86_COMMIT = '880d7bb';

const DEPLOYED = ['index.html', 'sw.js', 'manifest.webmanifest', 'css', 'js', 'icons'];

const work = mkdtempSync(join(tmpdir(), 'farkad-swrestart-'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function git(args, asText) {
    return execFileSync('git', ['-C', REPO, ...args],
        { maxBuffer: 128 * 1024 * 1024, ...(asText ? { encoding: 'utf8' } : {}) });
}

// A released tree out of git's object store. Never a checkout: this suite is read-only
// on the repository it measures.
function materialiseCommit(commit, dest) {
    const names = git(['ls-tree', '-r', '--name-only', commit, '--', ...DEPLOYED], true)
        .split('\n').filter(Boolean);
    for (const name of names) {
        mkdirSync(join(dest, dirname(name)), { recursive: true });
        writeFileSync(join(dest, name), git(['show', `${commit}:${name}`]));
    }
    return names;
}

// The candidate, out of the WORKING TREE - so an uncommitted stamp bump is measured
// rather than silently skipped.
function materialiseWorking(dest) {
    const names = git(['ls-files', '--', ...DEPLOYED], true).split('\n').filter(Boolean);
    for (const name of names) {
        mkdirSync(join(dest, dirname(name)), { recursive: true });
        copyFileSync(join(REPO, name), join(dest, name));
    }
    return names;
}

// The three stamps, read out of the materialised tree rather than invented.
function stampsOf(root) {
    const read = name => readFileSync(join(root, name), 'utf8');
    const one = (text, pattern) => { const hit = text.match(pattern); return hit && hit[1]; };
    return {
        page: one(read('index.html'), /<meta name="farkad-build" content="([^"]*)">/),
        app: one(read('js/app.js'), /const APP_VERSION = '([^']*)';/),
        cache: one(read('sw.js'), /const VERSION = '([^']*)';/)
    };
}

const TREE = { v85: join(work, 'v85'), v86: join(work, 'v86'), v87: join(work, 'v87') };
const NAMES = {
    v85: materialiseCommit(V85_COMMIT, TREE.v85),
    v86: materialiseCommit(V86_COMMIT, TREE.v86),
    v87: materialiseWorking(TREE.v87)
};
const STAMP = { v85: stampsOf(TREE.v85), v86: stampsOf(TREE.v86), v87: stampsOf(TREE.v87) };

for (const build of ['v85', 'v86', 'v87']) {
    given(`the ${build} tree is complete and agrees with itself about which build it is`,
        NAMES[build].length > 30 && Object.values(STAMP[build]).every(Boolean)
        && STAMP[build].page === STAMP[build].app,
        JSON.stringify(STAMP[build]));
}

// The loud skip, for the same reason handover has one: with fewer than three distinct
// builds on the origin there is nothing here to tell apart, and every check below would
// pass by measuring a deploy that never happened.
const cacheNames = ['v85', 'v86', 'v87'].map(build => STAMP[build].cache);
if (new Set(cacheNames).size !== 3) {
    console.error(`
====================================================================
 NOT RUN: the three trees do not carry three different builds.
   ${V85_COMMIT}: ${STAMP.v85.cache}   ${V86_COMMIT}: ${STAMP.v86.cache}   working tree: ${STAMP.v87.cache}
 The three stamps move together in the same commit as any change to
 a cached file. Until they do, this suite has nothing to tell apart.
====================================================================`);
    process.exit(2);
}

// js/app.js is the discriminator, and it is one by accident of history rather than by
// arrangement: it is the only cached file whose bytes differ in ALL THREE trees. Every
// "which build was this page handed" question below is asked of it.
function expectedCache(build) {
    const out = {};
    for (const name of NAMES[build]) {
        if (name === 'sw.js') continue;
        out['/' + name] = sha(readFileSync(join(TREE[build], name)));
    }
    out['/'] = out['/index.html'];
    return out;
}
const EXPECT = { v85: expectedCache('v85'), v86: expectedCache('v86'), v87: expectedCache('v87') };

given('js/app.js tells the three builds apart',
    new Set(['v85', 'v86', 'v87'].map(b => EXPECT[b]['/js/app.js'])).size === 3);
given('js/sync/sync.js tells this build from the one before it',
    EXPECT.v86['/js/sync/sync.js'] !== EXPECT.v87['/js/sync/sync.js']);

// What a hash IS, said in build names, so a red check reads as "v86" and not as 64 hex
// digits nobody can place.
// Every build it could be, not the first one: most files are unchanged between two
// releases, and a report that named only the earliest match would read as evidence of a
// cache that is not on this disk.
function nameOf(path, hash) {
    if (hash === null || hash === undefined) return 'nothing';
    const hits = ['v85', 'v86', 'v87']
        .filter(build => EXPECT[build][path] === hash).map(build => STAMP[build].app);
    return hits.length ? hits.join('/') : 'neither build';
}

// ---------------------------------------------------------------- one origin, three trees

const TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png'
};

// A server holding a POINTER to a tree. deploy() moves it; that is what a deploy is.
// withhold() is a 503 and not a 404 - and here it is not simulating a half-landed
// release, it is the instrument: with the file unavailable at the origin, an answer that
// arrives at all came out of a cache, and the only question left is which one.
function origin() {
    let root = TREE.v86;
    const withheld = new Set();
    const hits = [];
    const sockets = new Set();

    const server = createServer((request, response) => {
        const path = decodeURIComponent(new URL(request.url, 'http://x').pathname);
        hits.push(path);
        if (withheld.has(path)) { response.writeHead(503).end('unavailable'); return; }
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
            deploy: build => { root = TREE[build]; },
            withhold: path => withheld.add(path),
            restore: path => withheld.delete(path),
            hits,
            close: () => new Promise(done => { sockets.forEach(s => s.destroy()); server.close(done); })
        }));
    });
}

const server = await origin();
const BASE = server.url;
const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});

async function newPhone() {
    const ctx = await browser.newContext();
    return ctx;
}

async function openWindow(ctx) {
    const page = await ctx.newPage();
    page.on('dialog', d => d.accept());
    return page;
}

// Install a build and WAIT FOR IT TO FINISH, then prove it finished by the bytes on the
// shelf rather than by the shelf existing.
//
// caches.open(VERSION) in the install handler creates the cache on the first line, empty,
// long before cache.add has fetched anything. A test that moved the deploy pointer as
// soon as the name appeared filled 'farkad-v86' with the NEXT build's files and then
// measured its own race - the shelf was named for one build and held another, and every
// assertion after it was about a disk that cannot exist. So: wait for the worker to
// reach 'installed', for the shelf to be the full count, and then hash it.
async function installAndWait(page, build) {
    await page.evaluate(() => navigator.serviceWorker.getRegistration()
        .then(registration => registration.update()).catch(() => {}));
    const full = await page.waitForFunction(
        ([name, count]) => caches.open(name).then(cache => cache.keys())
            .then(keys => keys.length >= count).catch(() => false),
        [STAMP[build].cache, Object.keys(EXPECT[build]).length],
        { timeout: 40000, polling: 200 }).then(() => true, () => false);
    const waiting = await page.waitForFunction(() => navigator.serviceWorker.getRegistration()
        .then(registration => Boolean(registration.waiting)),
        null, { timeout: 40000, polling: 200 }).then(() => true, () => false);
    await settle(400);
    const held = (await hashCaches(page))[STAMP[build].cache] || {};
    return { full, waiting, bad: wrongBytes(held, EXPECT[build]) };
}

async function boot(page) {
    await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null,
        { timeout: 20000, polling: 100 });
}

const buildOf = page => page.evaluate(() => ({
    meta: document.querySelector('meta[name="farkad-build"]').getAttribute('content'),
    script: typeof APP_VERSION === 'string' ? APP_VERSION : null,
    controlled: Boolean(navigator.serviceWorker.controller)
}));

const cacheKeys = page => page.evaluate(() => caches.keys());

// The bytes a phone is holding, hashed in the page.
const hashCaches = page => page.evaluate(async () => {
    const out = {};
    for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        const entries = {};
        for (const request of await cache.keys()) {
            const response = await cache.match(request);
            const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
            entries[new URL(request.url).pathname] =
                [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
        }
        out[name] = entries;
    }
    return out;
});

function wrongBytes(held, expected) {
    const bad = [];
    for (const path of Object.keys(expected)) {
        if (held[path] !== expected[path]) bad.push(path + (held[path] ? ' differs' : ' missing'));
    }
    for (const path of Object.keys(held)) if (!(path in expected)) bad.push(path + ' unexpected');
    return bad;
}

// One asset, asked for through the page's own controller, hashed. The only question that
// tells a mixed build from a clean one.
const served = (page, path) => page.evaluate(async name => {
    const response = await fetch(name, { cache: 'no-store' });
    if (!response.ok) return { status: response.status, hash: null };
    const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
    return {
        status: response.status,
        hash: [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
    };
}, path);

// The same question with the origin unable to answer it, so a hit is a cache hit and
// nothing else. Restores the file afterwards whatever happens.
async function servedFromCache(page, path) {
    const url = '/' + path;
    server.withhold(url);
    try { return await served(page, path); }
    finally { server.restore(url); }
}

// ---------------------------------------------------------------- stopping the process

// The browser does this on its own after about thirty seconds of quiet. Here it is done
// on purpose and, more to the point, CONFIRMED: a test that assumed the stop landed
// would report the defect on a worker that never restarted.
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
// target is a process, so its absence is the process being gone rather than an opinion
// about it.
async function stopWorker(control) {
    await control.cdp.send('ServiceWorker.stopAllWorkers');
    const deadline = Date.now() + 10000;
    let targets = await swTargets();
    while (targets.length > 0 && Date.now() < deadline) {
        await settle(150);
        targets = await swTargets();
    }
    const running = [...control.versions.values()]
        .filter(version => version.runningStatus !== 'stopped')
        .map(version => `${version.versionId}:${version.runningStatus}`);
    return { targets: targets.length, running };
}

// A phone being put away and picked up again, as far as this browser can be made to do
// it. Three things happen when an installed app goes to the background and comes back,
// and all three are done here: the renderer is frozen and thawed, the worker's process
// is taken (backgrounding is exactly when the browser takes it), and the page is told it
// is visible again - which is the event js/ui/offline.js:43-48 hangs the resume on.
//
// The one part that is NOT real here is the visibility flag itself: this Chromium keeps
// every page 'visible', with or without bringToFront, and neither
// Emulation.setPageVisibilityOverride (gone from the protocol) nor
// Page.setWebLifecycleState moves it. So the event is dispatched rather than provoked,
// and the proof that the app's own resume actually ran is not the dispatch - it is the
// request for sw.js that registration.update() puts on the origin, counted below.
async function backgroundAndResume(page, control) {
    const mark = server.hits.length;
    await control.cdp.send('Page.setWebLifecycleState', { state: 'frozen' }).catch(() => {});
    const stopped = await stopWorker(control);
    await control.cdp.send('Page.setWebLifecycleState', { state: 'active' }).catch(() => {});
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await settle(2000);
    return {
        stopped,
        asked: server.hits.slice(mark).filter(path => path === '/sw.js').length
    };
}

const browserCdp = await browser.newBrowserCDPSession();

// ---------------------------------------------------------------- two builds, one worker
const two = await newPhone();
{
    suite('a worker that was restarted no longer knows which window is which');

    server.deploy('v86');
    const asking = await openWindow(two);
    await boot(asking);
    const staying = await openWindow(two);
    await boot(staying);
    await settle(2000);

    given('both windows are running the released build',
        (await buildOf(asking)).script === STAMP.v86.app
        && (await buildOf(staying)).script === STAMP.v86.app);

    server.deploy('v87');
    await asking.bringToFront();
    await asking.evaluate(() => navigator.serviceWorker.getRegistration()
        .then(registration => registration.update()));
    const offered = await asking.waitForSelector('#updateBanner:visible', { timeout: 25000 })
        .then(() => true, () => false);
    given('the new build is offered to the window that asked', offered);

    const [crossed] = await Promise.all([
        asking.waitForNavigation({ timeout: 25000 }).then(() => true, () => false),
        asking.getByRole('button', { name: 'רענן עכשיו' }).click()
    ]);
    given('pressing it hands that window over', crossed);
    await asking.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null,
        { timeout: 20000, polling: 100 });
    await settle(1200);

    given('one window is on this build and the other is still on the one before it',
        (await buildOf(asking)).script === STAMP.v87.app
        && (await buildOf(staying)).script === STAMP.v86.app,
        `${(await buildOf(asking)).script} / ${(await buildOf(staying)).script}`);
    const both = await cacheKeys(asking);
    given('and both builds\' caches are on the disk',
        both.includes(STAMP.v86.cache) && both.includes(STAMP.v87.cache), both.join());

    // The control. While the worker has been alive for the whole session, SERVED holds
    // what it was told and both windows are answered correctly. Without this pair, the
    // red checks below would say nothing about whether the question can be answered.
    const controlNew = await servedFromCache(asking, 'js/app.js');
    check('with the worker still up, this build\'s window is served this build',
        controlNew.hash === EXPECT.v87['/js/app.js'],
        `${nameOf('/js/app.js', controlNew.hash)} (status ${controlNew.status})`);
    const controlOld = await servedFromCache(staying, 'js/app.js');
    check('and the window still running the build before it is served that one',
        controlOld.hash === EXPECT.v86['/js/app.js'],
        `${nameOf('/js/app.js', controlOld.hash)} (status ${controlOld.status})`);

    // The worker's process goes, the way the browser takes it every time a phone is
    // quiet for half a minute. Same version, same registration, same controller - so
    // nothing fires in either page and nothing re-announces.
    // Counted, not assumed. The whole reason nothing re-announces is that the page is
    // never told: same version, same registration, same controller object.
    for (const page of [asking, staying]) {
        await page.evaluate(() => {
            window.__cc = 0;
            navigator.serviceWorker.addEventListener('controllerchange', () => { window.__cc += 1; });
        });
    }

    const control = await swProcess(two, asking);
    const stopped = await stopWorker(control);
    given('the worker process is actually gone',
        stopped.targets === 0 && stopped.running.length === 0,
        `${stopped.targets} targets, running ${stopped.running.join()}`);
    const told = {
        asking: await asking.evaluate(() => window.__cc),
        staying: await staying.evaluate(() => window.__cc),
        controlled: (await buildOf(asking)).controlled
    };
    check('no window is told its worker restarted',
        told.asking === 0 && told.staying === 0 && told.controlled === true,
        `${told.asking}/${told.staying} controllerchange events, still controlled`);

    // RED. The restarted worker's SERVED is empty, so the window running THIS build is a
    // stranger to it, takes the branch at sw.js:180 and is handed whatever
    // previousCaches() finds first. The origin is withholding the file, so this is a
    // cache and nothing else.
    const afterNew = await servedFromCache(asking, 'js/app.js');
    check('after its worker restarts, this build\'s window is still served this build',
        afterNew.hash === EXPECT.v87['/js/app.js'],
        `${nameOf('/js/app.js', afterNew.hash)} (status ${afterNew.status})`);

    const afterOld = await servedFromCache(staying, 'js/app.js');
    check('the window running the build before it is served that one, restart or not',
        afterOld.hash === EXPECT.v86['/js/app.js'],
        `${nameOf('/js/app.js', afterOld.hash)} (status ${afterOld.status})`);

    // RED, and the mechanism said in one line: after the restart the two windows are not
    // two windows to the worker. They are one answer.
    check('two windows of two builds are not handed the same file',
        afterNew.hash !== afterOld.hash,
        `both were handed ${nameOf('/js/app.js', afterNew.hash)}`);

    // RED. Not one file: the whole shell it asks for from here on.
    const alsoNew = await servedFromCache(asking, 'js/sync/sync.js');
    check('and its sync layer is this build\'s too',
        alsoNew.hash === EXPECT.v87['/js/sync/sync.js'],
        `${nameOf('/js/sync/sync.js', alsoNew.hash)} (status ${alsoNew.status}), `
        + `shelves: ${(await cacheKeys(asking)).join()}`);

    // The cause, isolated, and the reason this file names SERVED rather than gesturing at
    // the fetch handler. The only thing the restart destroyed is the announcement; making
    // it by hand - the exact message js/ui/offline.js:76 sends, no other change - puts the
    // right answer back at once. GREEN here is what makes the reds above mean what they
    // say. It is a diagnostic and not a repair: nothing in the app sends this message
    // again after a restart, which is the defect.
    await asking.evaluate(build => navigator.serviceWorker.controller
        .postMessage({ type: 'running', build }), STAMP.v87.cache);
    await settle(600);
    const reannounced = await servedFromCache(asking, 'js/app.js');
    check('announcing the build again puts the right answer back, so the forgotten Set is the whole of it',
        reannounced.hash === EXPECT.v87['/js/app.js'],
        `${nameOf('/js/app.js', reannounced.hash)} (status ${reannounced.status})`);
    check('and the window still running the build before it kept its own shelf through that',
        (await cacheKeys(asking)).includes(STAMP.v86.cache), (await cacheKeys(asking)).join());

    // ------------------------------------------------------------ put away, picked up
    suite('and putting the phone away and picking it up does not mend it');

    const resumed = await backgroundAndResume(asking, control);
    given('the app\'s own resume ran, and asked the origin about a new worker',
        resumed.asked >= 1, `${resumed.asked} requests for /sw.js`);
    check('the resume left the window on its own build',
        (await buildOf(asking)).script === STAMP.v87.app, (await buildOf(asking)).script);

    const stoppedAgain = await stopWorker(control);
    given('the worker process is gone again',
        stoppedAgain.targets === 0 && stoppedAgain.running.length === 0,
        `${stoppedAgain.targets} targets, running ${stoppedAgain.running.join()}`);

    // RED. The resume asked the registration for an update (js/ui/offline.js:46) and got
    // nothing new, which is correct - but nothing in that path says which build is
    // running here, so the next restart forgets this window exactly as the last one did.
    const resumedNew = await servedFromCache(asking, 'js/app.js');
    check('a window that was backgrounded and resumed is still served its own build',
        resumedNew.hash === EXPECT.v87['/js/app.js'],
        `${nameOf('/js/app.js', resumedNew.hash)} (status ${resumedNew.status})`);

    const resumedOld = await servedFromCache(staying, 'js/app.js');
    check('and so is the window that never crossed',
        resumedOld.hash === EXPECT.v86['/js/app.js'],
        `${nameOf('/js/app.js', resumedOld.hash)} (status ${resumedOld.status})`);

    await two.close();
}

// ---------------------------------------------------------------- three builds on one disk
const three = await newPhone();
let threeState = null;
{
    suite('three builds on one disk, and a reduce that cannot tell them apart');

    // How three caches come to exist without three activations: an install creates its
    // cache and only an activate reaps one, so a worker that installs and then WAITS -
    // because nobody pressed the banner - leaves a complete shelf behind it. v86 is
    // never activated here and never gets a window; its cache is on the disk all the
    // same, which is all the reduce at sw.js:182 needs to reach for it.
    server.deploy('v85');
    const asking = await openWindow(three);
    await boot(asking);
    const staying = await openWindow(three);
    await boot(staying);
    await settle(2000);
    given('two windows are running the oldest build',
        (await buildOf(asking)).script === STAMP.v85.app
        && (await buildOf(staying)).script === STAMP.v85.app);

    server.deploy('v86');
    const middle = await installAndWait(asking, 'v86');
    given('the middle build installed its shelf, complete, and is waiting unpressed',
        middle.full && middle.waiting && middle.bad.length === 0,
        JSON.stringify(middle).slice(0, 200));

    // The middle build never gets a window, and at this commit it never can: its own
    // worker deletes every other shelf the instant it activates, so crossing to it would
    // take v85 with it. Measured against that tree rather than asserted about it.
    const v86Worker = readFileSync(join(TREE.v86, 'sw.js'), 'utf8');
    check('the middle build cannot have a window of its own alongside an older one',
        /addEventListener\('activate'[\s\S]{0,400}caches\.delete/.test(v86Worker)
        && !/SERVED|strangerOpen/.test(v86Worker),
        'its activate reaps every other cache without asking who is running one');

    server.deploy('v87');
    const newest = await installAndWait(asking, 'v87');
    given('and this build installed on top of it, complete',
        newest.full && newest.waiting && newest.bad.length === 0,
        JSON.stringify(newest).slice(0, 200));

    await asking.bringToFront();
    const offered = await asking.waitForSelector('#updateBanner:visible', { timeout: 25000 })
        .then(() => true, () => false);
    given('the newest build is what is offered', offered);
    const [crossed] = await Promise.all([
        asking.waitForNavigation({ timeout: 25000 }).then(() => true, () => false),
        asking.getByRole('button', { name: 'רענן עכשיו' }).click()
    ]);
    given('pressing it hands that window over', crossed);
    await asking.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null,
        { timeout: 20000, polling: 100 });
    await settle(1500);

    // Beside the three shelves there is now a fourth cache that is not a shelf:
    // farkad-clients, which holds which window is running which build. That record is
    // what a worker restart used to lose - after which this build's own window failed the
    // membership test and was handed the OLDEST shelf on the device. It is never reaped
    // as a shelf and never served out of as one; tests/build.test.mjs pins both.
    const keys = await cacheKeys(asking);
    const shelves = keys.filter(name => !BOOKKEEPING.has(name));
    check('all three builds\' shelves are on the disk at once, oldest first',
        shelves.length === 3 && shelves[0] === STAMP.v85.cache
        && shelves[1] === STAMP.v86.cache && shelves[2] === STAMP.v87.cache, keys.join());
    check('and the record of who is running what is beside them, not among them',
        keys.includes('farkad-clients'), keys.join());

    const held = await hashCaches(asking);
    for (const build of ['v85', 'v86', 'v87']) {
        const bad = wrongBytes(held[STAMP[build].cache] || {}, EXPECT[build]);
        check(`the ${STAMP[build].app} shelf is that build byte for byte`,
            bad.length === 0, bad.join(', ').slice(0, 160));
    }

    given('one window is on this build and one is still on the oldest',
        (await buildOf(asking)).script === STAMP.v87.app
        && (await buildOf(staying)).script === STAMP.v85.app,
        `${(await buildOf(asking)).script} / ${(await buildOf(staying)).script}`);

    const controlNew = await servedFromCache(asking, 'js/app.js');
    check('with the worker up, each window is served its own build (this one)',
        controlNew.hash === EXPECT.v87['/js/app.js'],
        `${nameOf('/js/app.js', controlNew.hash)} (status ${controlNew.status})`);
    // The window from the OLDEST build cannot be identified, and this is the honest
    // limit of the whole design: the record of which window runs which build is written
    // by the worker that serves the navigation, and v85's worker had no such code. A
    // build already on somebody's phone cannot be given new code. So a pre-v87 window is
    // a window nobody wrote down, and what it gets is stated below rather than wished
    // for. From v87 forward every window is written down at its own navigation, so this
    // case is transient and gone the moment that window reloads.
    const controlOld = await servedFromCache(staying, 'js/app.js');
    // With THREE shelves and a window nobody wrote down there is no single possible
    // answer, and the rule is that a window whose build cannot be established is refused
    // rather than guessed at. It IS served its own build when the device holds exactly one
    // previous shelf - the ordinary upgrade, measured in the suite above. What must never
    // happen either way is THIS build's bytes reaching it.
    check('a window from a build that predates the bookkeeping is never handed THIS build',
        controlOld.hash !== EXPECT.v87['/js/app.js'],
        `${nameOf('/js/app.js', controlOld.hash)} (status ${controlOld.status})`);

    const control = await swProcess(three, asking);
    const stopped = await stopWorker(control);
    given('the worker process is gone', stopped.targets === 0 && stopped.running.length === 0,
        `${stopped.targets} targets, running ${stopped.running.join()}`);

    // RED, and by two builds rather than one. Both windows are strangers now, and
    // previousCaches() is [v85, v86] in creation order, so the reduce hands BOTH of them
    // v85 - a page shipped two releases later, running two releases of scripts back.
    const afterNew = await servedFromCache(asking, 'js/app.js');
    check('after the restart, this build\'s window is served this build, with three shelves down there',
        afterNew.hash === EXPECT.v87['/js/app.js'],
        `${nameOf('/js/app.js', afterNew.hash)} (status ${afterNew.status})`);
    // And the unidentifiable window still never gets THIS build. When the origin cannot
    // answer, the last resort is the NEWEST previous shelf - the build that window most
    // likely came from, since builds are adopted in order - and not whichever one
    // caches.keys() yields first, which was creation order and therefore the oldest.
    const afterOld = await servedFromCache(staying, 'js/app.js');
    check('and a window nobody wrote down is still never handed this build',
        afterOld.hash !== EXPECT.v87['/js/app.js'],
        `${nameOf('/js/app.js', afterOld.hash)} (status ${afterOld.status})`);
    check('with three shelves down there, the two windows still get two different answers',
        afterNew.hash !== afterOld.hash,
        `both were handed ${nameOf('/js/app.js', afterNew.hash)}`);

    threeState = { asking, staying };
}

// ---------------------------------------------------------------- what is reaped, and when
{
    suite('a shelf goes when nothing is running it, and not before');

    const { asking, staying } = threeState;
    const before = (await cacheKeys(asking)).filter(name => !BOOKKEEPING.has(name));
    check('while a window is still running an old build, nothing is reaped',
        before.length === 3, before.join());

    // The last window of the old build closes. Nothing announces on its way out, so what
    // collects the shelves is the next 'running' message or the next navigation
    // (sw.js:249-262, sw.js:166) - here, the message the surviving window sends.
    // Every window, not just the old one. Nothing is deleted until EVERY live window's
    // build is known and none of them names the shelf - stricter than "the old window
    // closed", because a window whose record cannot be read is running SOMETHING, and
    // until it is gone or identified no shelf on this disk can be proved unused. Earlier
    // suites in this file leave their own windows open on the same origin.
    await staying.close();
    for (const context of asking.context().browser().contexts()) {
        for (const page of context.pages()) {
            if (page !== asking) await page.close().catch(() => {});
        }
    }
    await settle(800);

    // Collected at a NAVIGATION, which is the point the worker's own comment names and
    // the only moment it is guaranteed to be awake with the closed windows really gone.
    // The 'running' message is an opportunistic extra - it makes the collection prompt
    // when it fires, and how promptly a browser drops a closed client from
    // clients.matchAll is not something this app decides. What is guaranteed is that
    // nothing in use is ever deleted, which the check above measures, and that the
    // unused shelves do go rather than accumulating for the life of the origin.
    await asking.reload({ waitUntil: 'load' });
    await asking.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null,
        { timeout: 20000, polling: 100 });
    // The filter is spelled out here rather than using BOOKKEEPING: this function is
    // evaluated in the PAGE, where a constant declared in this file does not exist, and a
    // ReferenceError inside waitForFunction reads exactly like the condition never coming
    // true - a green-looking wait that is really a broken one.
    const reaped = await asking.waitForFunction(name => caches.keys().then(keys =>
        keys.filter(key => key !== 'farkad-clients' && key !== 'farkad-shelves')
            .join() === name),
        STAMP.v87.cache, { timeout: 25000, polling: 200 }).then(() => true, () => false);
    const after = (await cacheKeys(asking)).filter(name => !BOOKKEEPING.has(name));
    check('once nothing is running them, the unreferenced shelves go',
        reaped && after.length === 1 && after[0] === STAMP.v87.cache, after.join());

    const held = await hashCaches(asking);
    const bad = wrongBytes(held[STAMP.v87.cache] || {}, EXPECT.v87);
    check('and the one that is still referenced is untouched, byte for byte',
        bad.length === 0, bad.join(', ').slice(0, 160));

    // With nothing left to be wrong about, the same question the two suites above ask in
    // red comes back green: the defect is the OTHER caches, not the branch.
    const control = await swProcess(three, asking);
    const stopped = await stopWorker(control);
    given('the worker process is gone once more',
        stopped.targets === 0 && stopped.running.length === 0, `${stopped.targets} targets`);
    const alone = await servedFromCache(asking, 'js/app.js');
    check('a restarted worker with one shelf left serves the right build',
        alone.hash === EXPECT.v87['/js/app.js'],
        `${nameOf('/js/app.js', alone.hash)} (status ${alone.status})`);

    await three.close();
}

// ---------------------------------------------------------------- the import that comes late
const late = await newPhone();
{
    suite('the cloud adapter, imported long after the boot that was going to import it');

    // A device that boots onto a damaged record does not import the adapter at all -
    // js/app.js:290-295 refuses while Recovery.blocked() - and imports it when the person
    // acknowledges, which can be minutes later (js/recovery.js:237-254). By then the
    // worker has been stopped and started, and the import goes out through the stranger
    // branch: an ES MODULE, not a byte, chosen by a reduce that does not know who asked.
    server.deploy('v86');
    const asking = await openWindow(late);
    await boot(asking);
    const staying = await openWindow(late);
    await boot(staying);
    await settle(2000);

    // The damaged record, planted on the disk before the load that reads it.
    await asking.evaluate(() => localStorage.setItem('scheduleData:v2', '{"days":{ not json'));

    server.deploy('v87');
    await asking.bringToFront();
    await asking.evaluate(() => navigator.serviceWorker.getRegistration()
        .then(registration => registration.update()));
    given('the new build is offered',
        await asking.waitForSelector('#updateBanner:visible', { timeout: 25000 })
            .then(() => true, () => false));
    const [crossed] = await Promise.all([
        asking.waitForNavigation({ timeout: 25000 }).then(() => true, () => false),
        asking.getByRole('button', { name: 'רענן עכשיו' }).click()
    ]);
    given('pressing it hands that window over', crossed);
    await asking.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null,
        { timeout: 20000, polling: 100 });
    await settle(1500);

    given('the window came back on this build, with the other still on the one before',
        (await buildOf(asking)).script === STAMP.v87.app
        && (await buildOf(staying)).script === STAMP.v86.app,
        `${(await buildOf(asking)).script} / ${(await buildOf(staying)).script}`);

    const blocked = await asking.evaluate(() => ({
        blocked: Recovery.blocked(),
        problems: Recovery.problems.length,
        cloud: typeof FarkadSync !== 'undefined' && Boolean(FarkadSync.adapter)
    }));
    check('a damaged record holds the device, and the cloud was never started',
        blocked.blocked === true && blocked.problems > 0 && blocked.cloud === false,
        JSON.stringify(blocked));

    const control = await swProcess(late, asking);
    const stopped = await stopWorker(control);
    given('the worker process is gone before the person presses anything',
        stopped.targets === 0 && stopped.running.length === 0, `${stopped.targets} targets`);

    // The acknowledgement, through the production function, with the origin unable to
    // answer for either file the import needs.
    server.withhold('/js/sync/firebase-adapter.js');
    server.withhold('/js/sync/sync.js');
    const released = await asking.evaluate(() => Recovery.acknowledge());
    await settle(1500);
    check('acknowledging releases the device and asks for the adapter',
        released === true && (await asking.evaluate(() => Recovery.blocked())) === false,
        String(released));

    // firebase-adapter.js is byte-identical in all three trees, so its own hash cannot
    // say which shelf answered - said out loud rather than dressed up as a passing check.
    // What CAN be measured is the shelf the same client is being served from at the same
    // moment, and the module the adapter reaches the app through.
    const adapter = await served(asking, 'js/sync/firebase-adapter.js');
    check('the adapter arrives at all, with nothing at the origin to serve it',
        adapter.status === 200 && adapter.hash === EXPECT.v87['/js/sync/firebase-adapter.js'],
        `status ${adapter.status}; identical bytes in ${['v85', 'v86', 'v87']
            .filter(b => EXPECT[b]['/js/sync/firebase-adapter.js'] === adapter.hash)
            .map(b => STAMP[b].app).join('/')}`);

    // RED. The import went out on the same branch this did.
    const sync = await served(asking, 'js/sync/sync.js');
    server.restore('/js/sync/firebase-adapter.js');
    server.restore('/js/sync/sync.js');
    check('the module graph pulled in after the acknowledgement is this build\'s',
        sync.hash === EXPECT.v87['/js/sync/sync.js'],
        `${nameOf('/js/sync/sync.js', sync.hash)} (status ${sync.status}), `
        + `shelves: ${(await cacheKeys(asking)).join()}`);

    await late.close();
}

// The instrument, and what could not be taken out of it.
//
// The stops above are asked for through CDP rather than waited for, and that invites the
// reading that the defect is an artefact of the instrument. It is not - a restart is a
// restart, and SERVED is empty either way - but the honest version of that sentence is
// that this harness CANNOT watch the browser do it by itself: Playwright attaches to
// every service worker target of a context, an attached inspector keeps a worker alive,
// and a worker left completely alone here was still up after two minutes of silence
// (measured, and then deleted from this file rather than shipped as a permanently red
// check about the harness). The thirty-second idle termination that makes this a
// daily event on a phone is documented Chromium behaviour and is not measured here.

await browser.close();
await server.close();
rmSync(work, { recursive: true, force: true });

report();
