// The v86 -> v87 handover, driven between two REAL trees.
//
//   npm run test:handover
//
// tests/update.test.mjs proves the update MECHANISM: a second worker installs, a banner
// appears, somebody presses it, the page comes back. It proves it by copying the tree
// once and rewriting three version strings in that one copy. So "the old build" and "the
// new build" are the same 34 files with three strings edited, there is only ever one
// directory, and the strongest evidence any assertion there can reach is APP_VERSION - a
// string the test itself wrote a moment earlier.
//
// That shape cannot see the failures this file is about. It cannot notice a shell entry
// whose CONTENT changed, because none ever does. It can never re-serve the old build to
// an offline client, because the old build ceased to exist the instant the new one was
// written over it. Nothing ever fails to fetch, so the install handler's all-or-nothing
// throw - the thing standing between a half-fetched update and a deleted good cache -
// has never once been made to throw in a browser.
//
// So this file materialises two genuine trees: a released commit, and the working tree
// that is about to ship. Nine cached files differ between them and none of the nine is a
// version stamp. One origin serves whichever of the two it is pointed at, which is what
// a deploy is. Every assertion below is either a SHA-256 of the bytes a browser actually
// holds in its cache, or an answer from a production function running in the page.
//
// Three of the checks were RED when this file was written, and they are the reason it
// exists:
//   * no worker from the new build serves a page still running the old one
//   * the old build's cache is still there while a window is still running it
//   * once the typing is finished the window catches up to its worker's build
// clients.claim() took over EVERY window of the origin, js/ui/offline.js reloaded only
// the window that pressed the banner, and activate() reaped the old cache before it
// claimed anything. Two windows of one app, and only one of them crossed.
//
// The first two are closed and are measured below. The THIRD cannot be measured from
// here and never will be: the code that makes a window catch up runs in the window, and
// that window is running the OLD build - a build already on somebody's phone cannot be
// given new code. So it is proved from v87 onward by tests/update.test.mjs, which
// deploys two builds that both carry it, and what this file measures in its place is the
// guarantee that does hold across a handover FROM a build that predates it: the old
// window stays a coherent old session for the whole of its life, and crosses on its next
// open.
//
// What it cannot do is prove any of it on iOS, where a home-screen app is resumed rather
// than reopened. That limit is the same one tests/update.test.mjs names.

import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { suite, check, same, given, report } from './runner.mjs';
import { rootFromEnv, refuseUnlessVerified } from './treecheck.mjs';
import { settle } from './harness.mjs';
import { deployedFromSync, deployedFromSource } from './shell.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const EXEC = process.env.CHROME_PATH || undefined;

// The repository the two trees come out of. Resolved from this file's own location, so
// the copy that lives in tests/ measures the tree it ships in. The override exists only
// so the same file can be run against a scratch clone before the stamps land: without
// it, a run from any other directory silently measures whatever repository happens to
// sit above it and reports the answer as if it were about this one.
// Re-rootable, and bound. FARKAD_REPO points this suite at another tree; on its own
// that is an absolute path written where no regex over source can see it, so it is
// refused unless FARKAD_EXPECT_SHA names the commit that tree is expected to be AND the
// tree's production bytes match that commit's Git blobs. Without the variable the answer
// is this checkout, which is the only default that cannot be pointed elsewhere.
const REPO_ENV = rootFromEnv(fileURLToPath(new URL('..', import.meta.url)));
const REPO_REFUSAL = refuseUnlessVerified(REPO_ENV.root, REPO_ENV.overridden, REPO_ENV.expect);
given('the tree this suite reads is the tree it was pointed at',
    REPO_REFUSAL === null, String(REPO_REFUSAL));
const REPO = REPO_ENV.root;

// The released build this deploy hands over FROM. It ages: when the next build ships,
// this moves to it, and that is a line in docs/releases.md rather than a mechanism.
const OLD_COMMIT = '880d7bb3ce58affd5fb285095c73c54435e5c7e7';

// Exactly what a deploy puts on the origin. sw.js is in the list and is deliberately NOT
// in any cache - a worker that cached itself could never be replaced.
// Read off each tree's OWN sw.js, not listed here - see tests/shell.mjs. A shell entry
// nobody deployed makes the worker refuse to install at all, which looks exactly like the
// app being broken: no worker activates, no page is controlled, and the failure names
// neither the file nor the reason.
const DEPLOYED = deployedFromSync(REPO);

const work = mkdtempSync(join(tmpdir(), 'farkad-handover-'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function git(args, asText) {
    return execFileSync('git', ['-C', REPO, ...args],
        { maxBuffer: 128 * 1024 * 1024, ...(asText ? { encoding: 'utf8' } : {}) });
}

// The released tree, out of git's object store. Never a checkout: this test is read-only
// on the repository it is measuring, and a suite that moved HEAD to look at an old build
// would be a suite that could lose somebody's work in progress.
function materialiseOld(dest) {
    // That build's OWN shell, out of its own sw.js. Using this checkout's list would ask
    // the old commit for directories it never had - harmless - and, the direction that
    // matters, would miss one it had and this build dropped.
    const oldShell = deployedFromSource(
        git(['show', `${OLD_COMMIT}:sw.js`], true), `${OLD_COMMIT}:sw.js`);
    const names = git(['ls-tree', '-r', '--name-only', OLD_COMMIT, '--', ...oldShell], true)
        .split('\n').filter(Boolean);
    for (const name of names) {
        mkdirSync(join(dest, dirname(name)), { recursive: true });
        writeFileSync(join(dest, name), git(['show', `${OLD_COMMIT}:${name}`]));
    }
    return names;
}

// The candidate, out of the WORKING TREE - ls-files for the names, the files themselves
// off the disk. `git archive HEAD` would have been shorter and would have silently
// dropped an uncommitted stamp bump, which is the one edit this whole file waits on.
function materialiseNew(dest) {
    const names = git(['ls-files', '--', ...DEPLOYED], true).split('\n').filter(Boolean);
    for (const name of names) {
        mkdirSync(join(dest, dirname(name)), { recursive: true });
        copyFileSync(join(REPO, name), join(dest, name));
    }
    return names;
}

// The three stamps, read out of the materialised tree rather than invented. A test that
// writes the version it then asserts is testing its own regex.
function stampsOf(root) {
    const read = name => readFileSync(join(root, name), 'utf8');
    const one = (text, pattern) => { const hit = text.match(pattern); return hit && hit[1]; };
    return {
        page: one(read('index.html'), /<meta name="farkad-build" content="([^"]*)">/),
        app: one(read('js/app.js'), /const APP_VERSION = '([^']*)';/),
        cache: one(read('sw.js'), /const VERSION = '([^']*)';/)
    };
}

const OLD = join(work, 'old');
const NEW = join(work, 'new');
const oldNames = materialiseOld(OLD);
const newNames = materialiseNew(NEW);
const oldStamps = stampsOf(OLD);
const newStamps = stampsOf(NEW);

given('the released build is reachable from this clone',
    oldNames.length > 30 && Object.values(oldStamps).every(Boolean));
given('the working tree is complete',
    newNames.length > 30 && Object.values(newStamps).every(Boolean));

// The loud skip. Everything below is about what happens when a phone crosses from one
// build to another; with one build there is nothing to cross, and every check would pass
// by measuring a deploy that never happened. This is a SETUP failure and not a red line,
// because the app is not what is wrong.
if (oldStamps.app === newStamps.app || oldStamps.cache === newStamps.cache) {
    console.error(`
====================================================================
 NOT RUN: both trees carry the same build.
   released ${OLD_COMMIT.slice(0, 7)}: page=${oldStamps.page} app=${oldStamps.app} cache=${oldStamps.cache}
   working tree:      page=${newStamps.page} app=${newStamps.app} cache=${newStamps.cache}
 The three stamps move together in the same commit as any change to
 a cached file (index.html farkad-build, js/app.js APP_VERSION,
 sw.js VERSION). Until they move, this suite has no handover to
 watch and will not pretend otherwise.
====================================================================`);
    process.exit(2);
}
given('the two trees agree with themselves about which build they are',
    oldStamps.page === oldStamps.app && newStamps.page === newStamps.app);
given('the deploy changes files and not only stamps',
    newNames.some(name => !/^(index\.html|js\/app\.js|sw\.js)$/.test(name) &&
        sha(readFileSync(join(OLD, name))) !== sha(readFileSync(join(NEW, name)))));

// What the cache should hold, derived from the tree on disk rather than from sw.js's own
// SHELL list. Reading the list out of the file under test would make the completeness
// claim circular: a shell entry deleted from sw.js would delete the expectation with it.
function expectedCache(root, names) {
    const out = {};
    for (const name of names) {
        if (name === 'sw.js') continue;
        out['/' + name] = sha(readFileSync(join(root, name)));
    }
    // './' and './index.html' are two URLs and one file - the navigation and the entry
    // in the list. Both are cached, and they must be the same bytes.
    out['/'] = out['/index.html'];
    return out;
}
const EXPECT = { old: expectedCache(OLD, oldNames), new: expectedCache(NEW, newNames) };

// ---------------------------------------------------------------- one origin, two trees

const TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png'
};

// A server holding a POINTER to a tree. deploy() moves the pointer; that is the whole
// difference between this and tests/serve.mjs, and it is what makes an old client
// re-servable after the new build is up - the old bytes never stopped existing.
function origin() {
    let root = OLD;
    let down = false;
    const withheld = new Set();
    const hits = [];
    const sockets = new Set();

    const server = createServer((request, response) => {
        const path = decodeURIComponent(new URL(request.url, 'http://x').pathname);
        hits.push(path);
        // Withholding is a 503 and not a 404: a missing file is a deploy that never
        // included it, an unavailable one is the half-landed deploy this file is about.
        if (withheld.has(path)) { response.writeHead(503).end('unavailable'); return; }
        const name = path === '/' ? '/index.html' : path;
        const file = join(root, name.replace(/^\/+/, ''));
        if (!file.startsWith(root)) { response.writeHead(403).end('no'); return; }
        let body;
        try { body = readFileSync(file); }
        catch (error) { response.writeHead(404).end('not found'); return; }
        response.writeHead(200, {
            'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
            // A cached response would make "the deploy landed" pass or fail on the
            // browser's mood rather than on the service worker.
            'Cache-Control': 'no-store',
            'Service-Worker-Allowed': '/'
        });
        response.end(body);
    });

    // Destroying the socket rather than refusing to listen. Closing the listener would
    // free the port, and a later run binding it is the sort of flake that gets a real
    // failure dismissed.
    server.on('connection', socket => {
        if (down) { socket.destroy(); return; }
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
    });

    return new Promise(resolve => {
        server.listen(0, '127.0.0.1', () => resolve({
            url: `http://127.0.0.1:${server.address().port}`,
            deploy: tree => { root = tree; },
            withhold: path => withheld.add(path),
            restore: path => withheld.delete(path),
            hits,
            down: () => { down = true; sockets.forEach(socket => socket.destroy()); },
            up: () => { down = false; },
            close: () => new Promise(done => { sockets.forEach(s => s.destroy()); server.close(done); })
        }));
    });
}

const server = await origin();
const BASE = server.url;
const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});

async function openPhone() {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    page.on('dialog', d => d.accept());
    return page;
}

async function boot(page) {
    await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null,
        { timeout: 20000, polling: 100 });
}

// The bytes a phone is actually holding, hashed in the page. Not "the file the server
// would send now" - a cache is the only thing that answers when the origin is gone, and
// it is the only place a mixed build can hide.
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

// One line naming every path whose bytes are not the ones that build shipped.
function wrongBytes(held, expected) {
    const bad = [];
    for (const path of Object.keys(expected)) {
        if (held[path] !== expected[path]) bad.push(path + (held[path] ? ' differs' : ' missing'));
    }
    for (const path of Object.keys(held)) if (!(path in expected)) bad.push(path + ' unexpected');
    return bad;
}

const buildOf = page => page.evaluate(() => ({
    meta: document.querySelector('meta[name="farkad-build"]').getAttribute('content'),
    script: APP_VERSION,
    controlled: Boolean(navigator.serviceWorker.controller)
}));

// A shell script asked for through the page's own controller, hashed. This is the one
// question that tells a mixed build from a clean one: not which version the page SAYS it
// is, but which build's bytes it is being handed right now.
const fetchedScript = (page, path) => page.evaluate(async name => {
    const response = await fetch(name, { cache: 'no-store' });
    if (!response.ok) return { status: response.status, hash: null };
    const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
    return {
        status: response.status,
        hash: [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
    };
}, path);

const nameOfBuild = hash => hash === EXPECT.old['/js/app.js'] ? oldStamps.app
    : hash === EXPECT.new['/js/app.js'] ? newStamps.app : 'neither build';

// ---------------------------------------------------------------- the shell it holds
const phone = await openPhone();
{
    suite(`a phone installs ${oldStamps.app} and holds it byte for byte`);

    server.deploy(OLD);
    await boot(phone);
    const running = await buildOf(phone);
    check('the app boots and a worker is in charge',
        running.controlled && running.script === oldStamps.app, running.script);
    check('the page and its scripts are the same build',
        running.meta === running.script, `${running.meta} / ${running.script}`);

    const held = await hashCaches(phone);
    const names = Object.keys(held);
    check('there is one cache and it is named for that build',
        names.length === 1 && names[0] === oldStamps.cache, names.join());

    const shelf = held[oldStamps.cache] || {};
    same('every file of the build is in it, and nothing else is',
        Object.keys(shelf).sort(), Object.keys(EXPECT.old).sort());
    const bad = wrongBytes(shelf, EXPECT.old);
    check('and every cached response is the byte that build shipped',
        bad.length === 0, bad.join(', ').slice(0, 200));

    // The boot-time safety nets re-offer an already-waiting worker twice - once when
    // register() resolves and again 1500ms later. Deploying before they have fired makes
    // a banner from a coincidence, and every assertion after it measures the wrong
    // mechanism. tests/update.test.mjs learned this the same way.
    await settle(2000);
}

// ---------------------------------------------------------------- a deploy that did not land
{
    suite('a deploy that did not fully land leaves the old build serving');

    const before = (await hashCaches(phone))[oldStamps.cache];
    await phone.evaluate(() => {
        window.__states = [];
        return navigator.serviceWorker.getRegistration().then(registration => {
            registration.addEventListener('updatefound', () => {
                const worker = registration.installing;
                if (!worker) return;
                window.__states.push('found:' + worker.state);
                worker.addEventListener('statechange', () => window.__states.push(worker.state));
            });
        });
    });

    // One file of the new build is unavailable. Not corrupt, not missing from the deploy
    // - the 503 a half-uploaded release actually gives, which is the case sw.js's
    // all-or-nothing install was written for and which nothing has ever made it face.
    server.deploy(NEW);
    server.withhold('/js/ui/settings.js');
    await phone.evaluate(() => navigator.serviceWorker.getRegistration()
        .then(registration => registration.update()).catch(() => {}));

    // Waited for as a STATE, never as a stretch of time. registration.update() resolves
    // happily over an install that failed, so a test that trusted its promise would call
    // this a landed deploy.
    const died = await phone.waitForFunction(() => window.__states.includes('redundant'),
        null, { timeout: 25000, polling: 100 }).then(() => true, () => false);
    check('the install that could not complete ends redundant, and says so',
        died, JSON.stringify(await phone.evaluate(() => window.__states)));

    check('nothing is offered to the person',
        (await phone.locator('#updateBanner').isVisible()) === false);
    const still = await buildOf(phone);
    check('the phone is still running the build it booted',
        still.script === oldStamps.app && still.meta === oldStamps.app,
        `${still.meta} / ${still.script}`);

    const after = (await hashCaches(phone))[oldStamps.cache];
    same('and its cache was not touched by the attempt', after, before);

    // The same measurement, in a world where nothing has handed over: the origin is
    // withholding this file too, so the answer can only have come out of a cache, and
    // the cache it came out of is the one this window's own worker opens. This is the
    // control for the red check of the same shape in the last suite - without it, that
    // one failing would say nothing about whether the question can be answered at all.
    server.withhold('/js/app.js');
    const script = await fetchedScript(phone, 'js/app.js');
    check('a script asked for now comes out of this build\'s own cache',
        script.hash === EXPECT.old['/js/app.js'],
        `${nameOfBuild(script.hash)} (status ${script.status})`);

    server.restore('/js/app.js');
    server.restore('/js/ui/settings.js');
    await phone.context().close();
}

// ---------------------------------------------------------------- nothing to open from
{
    suite('the origin is gone and the old build is still the whole app');

    server.deploy(OLD);
    const alone = await openPhone();
    await boot(alone);
    const before = await hashCaches(alone);

    // Both halves. setOffline stops the browser trying; the origin refusing every socket
    // means that even if it did try, there is nothing there. An origin that is merely
    // serving something else is not the building site.
    const mark = server.hits.length;
    await alone.context().setOffline(true);
    server.down();
    await alone.reload({ waitUntil: 'load' }).catch(() => {});
    await alone.waitForFunction(() => typeof APP_VERSION === 'string', null, { timeout: 20000 });

    const running = await buildOf(alone);
    check('it opens, with nothing to open from',
        running.script === oldStamps.app && running.meta === oldStamps.app,
        `${running.meta} / ${running.script}`);
    check('nothing is refusing to write',
        (await alone.locator('#crashBanner').isVisible()) === false);
    check('and it says being offline out loud, in the app\'s own words',
        (await alone.textContent('#offlineBanner')) ===
            '📴 אין חיבור. הרישום נשמר במכשיר ויסונכרן כשהחיבור יחזור.',
        (await alone.textContent('#offlineBanner')).slice(0, 60));

    // The whole point of shipping an offline shell: the record still gets made.
    const wrote = await alone.evaluate(() => {
        State.schedule.workers = [{ id: 'w_01', name: 'דוד', active: true, dailyRate: 400 }];
        State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
        State.save({ silent: true });
        const ok = State.commit(assignPlace(State.schedule, '2026-08-12', 'w_01', 'actual', 'p_01'));
        const raw = Store.get('scheduleData:v2') || '';
        return { ok, holds: raw.includes('2026-08-12') && raw.includes('p_01') };
    });
    check('a day recorded with no origin is on the disk, not just on the screen',
        wrote.ok === true && wrote.holds === true, JSON.stringify(wrote));

    check('and not one request reached the origin to make any of it work',
        server.hits.length === mark, `${server.hits.length - mark} requests`);

    server.up();
    await alone.context().setOffline(false);
    const after = await hashCaches(alone);
    same('the cache is the same bytes it was before the signal went', after, before);
    await alone.context().close();
}

// ---------------------------------------------------------------- two windows, one hand
{
    suite('two windows of one app, and only one of them is asked');

    server.deploy(OLD);
    const asking = await openPhone();
    await boot(asking);
    const typing = await asking.context().newPage();
    typing.on('dialog', d => d.accept());
    await boot(typing);
    await settle(2000);

    check('both windows are under one worker, running one build',
        (await buildOf(asking)).script === oldStamps.app &&
        (await buildOf(typing)).controlled === true,
        `${(await buildOf(asking)).script} / ${(await buildOf(typing)).script}`);

    // The second window is somebody part-way through entering a name. Not a contrived
    // state: it is the ordinary one on a site, and it is the reason the app never swaps
    // builds on its own.
    await typing.bringToFront();
    await typing.click('#tab-roster');
    await typing.getByRole('button', { name: '+ הוסף עובד' }).click();
    await typing.fill('#workerFormName', 'אבו פרקד');
    given('the second window is genuinely mid-edit',
        (await typing.evaluate(() => midEdit())) === true);

    server.deploy(NEW);
    await asking.bringToFront();
    await asking.evaluate(() => navigator.serviceWorker.getRegistration()
        .then(registration => registration.update()));
    const offered = await asking.waitForSelector('#updateBanner:visible', { timeout: 25000 })
        .then(() => true, () => false);
    check('the window that asked is offered the new build, in words',
        offered && (await asking.textContent('#updateBanner')).includes('גרסה חדשה זמינה'),
        (await asking.textContent('#updateBanner')).trim().slice(0, 40));

    const [crossed] = await Promise.all([
        asking.waitForNavigation({ timeout: 25000 }).then(() => true, () => false),
        asking.getByRole('button', { name: 'רענן עכשיו' }).click()
    ]);
    given('pressing it hands that window over', crossed);
    await asking.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null,
        { timeout: 20000, polling: 100 });
    await settle(600);

    const crossedTo = await buildOf(asking);
    check('and it comes back running the new build, page and scripts together',
        crossedTo.script === newStamps.app && crossedTo.meta === newStamps.app,
        `${crossedTo.meta} / ${crossedTo.script}`);
    const fresh = (await hashCaches(asking))[newStamps.cache] || {};
    const badNew = wrongBytes(fresh, EXPECT.new);
    check('with a cache that is the new build byte for byte',
        badNew.length === 0, badNew.join(', ').slice(0, 200));

    // The guarantee that DOES hold: nobody's typing is thrown away by somebody else's
    // update. Both halves are observed - the build the window is running, and the
    // characters still in the field.
    const untouched = await buildOf(typing);
    check('the window in the middle of typing was not reloaded under their hands',
        untouched.script === oldStamps.app, untouched.script);
    check('and the half-entered name is still in the field',
        (await typing.inputValue('#workerFormName')) === 'אבו פרקד',
        await typing.inputValue('#workerFormName'));

    // RED. clients.claim() takes over every window of the origin, and the fetch handler
    // only ever opens caches.open(VERSION) - it has no way to know which build a claimed
    // page is running. So the window still executing the old scripts is handed the new
    // build's bytes for anything it asks for after the handover: new sync layer, old
    // page, one session. That is the exact failure sw.js's header says the design exists
    // to prevent, and it is measured here rather than argued about - the origin is
    // withholding this file, so the answer can only have come out of a cache.
    server.withhold('/js/app.js');
    const served = await fetchedScript(typing, 'js/app.js');
    check('no worker from the new build serves a page still running the old one',
        served.hash === EXPECT.old['/js/app.js'],
        `${nameOfBuild(served.hash)} (status ${served.status})`);
    server.restore('/js/app.js');

    // RED. activate() reaps every other cache and THEN claims, so the old build's cache
    // is deleted while a window is still running the old build - and after the claim
    // that window has nowhere of its own left to be served from.
    const left = await typing.evaluate(() => caches.keys());
    check('the old build\'s cache is still there while a window is still running it',
        left.includes(oldStamps.cache), left.join());

    // The catch-up, and the one thing this file cannot measure.
    //
    // The window that never pressed anything now reloads itself at the first moment that
    // costs nobody anything - and that code is in js/ui/offline.js, which is to say in the
    // NEW build. The window it has to run in is the OLD one. A build already installed on
    // somebody's phone cannot be given new code, so no v87 can make a v86 page reload
    // itself, and no test can pretend otherwise: the catch-up is proved from v87 onward
    // by tests/update.test.mjs, which deploys two builds that both carry it.
    //
    // What IS guaranteed here, and is what this pair measures: the old window stays a
    // COHERENT old session for the whole of its life - never half-and-half - and it
    // crosses on its next open, taking the old cache with it.
    await typing.fill('#workerFormName', '');
    await typing.keyboard.press('Escape');
    await typing.waitForTimeout(400);
    given('the edit is over and a reload would cost nothing',
        (await typing.evaluate(() => midEdit())) === false);

    server.withhold('/js/app.js');
    const stillOld = await fetchedScript(typing, 'js/app.js');
    server.restore('/js/app.js');
    check('a window running the old build is served the old build for as long as it is open',
        (await buildOf(typing)).script === oldStamps.app
        && stillOld.hash === EXPECT.old['/js/app.js'],
        `${(await buildOf(typing)).script} / ${nameOfBuild(stillOld.hash)}`);

    await typing.reload({ waitUntil: 'load' });
    await typing.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null,
        { timeout: 20000, polling: 100 });
    await settle(2500);
    check('and its next open crosses, taking the build it left behind with it',
        (await buildOf(typing)).script === newStamps.app
        && !(await typing.evaluate(() => caches.keys())).includes(oldStamps.cache),
        `${(await buildOf(typing)).script} / ${(await typing.evaluate(() => caches.keys())).join()}`);

    await asking.context().close();
}

await browser.close();
await server.close();
rmSync(work, { recursive: true, force: true });

report();
