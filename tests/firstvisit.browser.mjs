// THE WINDOW THE CLAIM TOOK AND NOBODY WROTE DOWN - a first visit, reloaded while the
// service worker is still installing, in a real Chromium.
//
//   node tests/firstvisit.browser.mjs
//
// sw.js writes down which build every window runs and refuses, 503 «farkad: build
// identity unknown», a window it has no record for. Two doors write the record: the
// navigation this worker answers, and the enrollment at `activate`, just before
// clients.claim(). On a FIRST visit there is a stretch with neither: no worker controls
// the origin while this one installs, so a reload in that stretch is navigated from the
// network by nobody, and if its window comes to exist after the enrollment has read the
// list of windows and before the claim reads its own, it is claimed with no record. From
// then on everything it asks the worker for is refused: the cloud adapter js/app.js
// imports after boot (sync never starts), the spreadsheet library (the export falls back
// to CSV and says the build is incomplete), an icon. Until somebody reloads.
//
// It was found by the v192 gate (2026-11-12): tests/whatsnew.browser.mjs opens every one
// of its phones by a load and a reload 350ms later, and on a machine whose timing had
// moved, about one such phone in four was that window - on v190 and v191 exactly as on
// v192. No suite asked the question on purpose. This one does, five ways:
//
//   1. THE RACE HELD OPEN, so it is not a matter of luck. The worker served to this phone
//      carries a four-line prologue that waits for the test at two places - the end of
//      `install`, and clients.claim() - and the origin holds the reloaded document, and
//      then holds it a second time HALFWAY: the top of the page is sent, enough for the
//      window to exist, and the rest - every stylesheet and every script - only after the
//      claim has landed. So the order is exactly: the reload leaves while the worker is
//      installing; `activate` reads its list of windows without the one that is on its
//      way; that window arrives; the claim lands; and only then does the page ask for its
//      own scripts, every one of them of this worker. It must START, be written down
//      under ITS OWN id, and be handed THIS build's bytes for everything it asks for
//      later. The prologue changes WHEN, never what: every line of the worker below it is
//      the shipped file.
//   2. WHAT A RESTART KEEPS, AND WHAT IS STILL REFUSED. The answer the late window was
//      given is on the disk: with the worker's process stopped and nothing deleted it is
//      served as before. And the repair must not have turned «unknown» into «served»:
//      with the process stopped and the records gone, the same window is refused exactly
//      as before, and a reload - the remedy the refusal names - brings it back.
//   3. A DISK THAT REFUSES THE RECORD. The same held race on a phone whose registry will
//      not take a write (INJECTED: see REFUSING below). The late window stays refused - a
//      write that did not land is not believed; a window this worker could not START
//      (the «האפליקציה לא נפתחה» page) is never enrolled afterwards, though the disk has
//      recovered and the process is the one that claimed; and the late window is served
//      the first time IT asks once the write goes through - the fetch handler's own
//      question, with no census before it.
//   4. AN UPGRADE, the same race between two builds, and there the late window is
//      REFUSED. It went past the outgoing worker (a hard reload), and what the origin
//      handed it depends on whether it asked before the deploy or after - which the
//      worker cannot know. Both orders are held open here. The first candidate of this
//      repair wrote such a window down as the outgoing build, and in the second order
//      that was measured as a NEW page running the OUTGOING build's scripts (2026-11-12,
//      this section, before it said what it says now). So: refused `unrecorded` in both
//      orders, its page started on nothing, no record written for it by anything, and a
//      reload - through the new worker - opens it on ONE build. And a window that was
//      open at `activate` and has since lost its record is refused too, in the very
//      process that claimed. Desktop only - a phone has no hard reload.
//   5. THE ORDINARY SEQUENCE, UNHELD, on the shipped worker byte for byte: a load and a
//      reload after 0 to 600ms, a dozen phones, and no request of any of them refused.
//
// The documents of 1-4 are asked for under a query (/index.html?window=...). Not for the
// worker - a navigation is a navigation to it whatever its address, and 2 ends by proving
// that - but for Chromium's HTTP cache: the worker's precache asks for ./index.html, and a
// second request for a URL that is already in flight waits for the first one for up to
// twenty seconds. A document held at the origin under the precache's own address stalled
// the install that long, about one run in fourteen, and the suite threw.
//
// NOT a real phone. Synthetic: no names, no record.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { join, extname, normalize } from 'node:path';
import { chromium } from 'playwright';
import { launchLocalBrowser } from './network-guard.mjs';
import { deployedFromSync } from './shell.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const root = new URL('..', import.meta.url).pathname;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const VERSION = /const VERSION = '(farkad-v\d+)'/.exec(readFileSync(join(root, 'sw.js'), 'utf8'))[1];

// ---------------------------------------------------------------- the two trees
//
// THIS build is the checkout, served as it lies. The build BEFORE it, for the upgrade, is
// the same tree copied out and stamped as its own build the way tests/swidentity.test.mjs
// stamps its five: the page's meta, js/app.js's APP_VERSION and sw.js's VERSION. So
// js/app.js tells the two apart, byte for byte, and the outgoing worker is this worker.
const work = mkdtempSync(join(tmpdir(), 'farkad-firstvisit-'));
const STAMP = VERSION.replace(/^farkad-/, '');
const BEFORE = { root: join(work, 'before') + '/', stamp: `${STAMP}before`, cache: `${VERSION}before` };
for (const name of deployedFromSync(root)) cpSync(join(root, name), join(BEFORE.root, name), { recursive: true });
for (const [name, from, to] of [
    ['index.html', `<meta name="farkad-build" content="${STAMP}">`, `<meta name="farkad-build" content="${BEFORE.stamp}">`],
    ['js/app.js', `const APP_VERSION = '${STAMP}';`, `const APP_VERSION = '${BEFORE.stamp}';`],
    ['sw.js', `const VERSION = '${VERSION}';`, `const VERSION = '${BEFORE.cache}';`]]) {
    const text = readFileSync(join(BEFORE.root, name), 'utf8');
    given(`the build before this one could be stamped in ${name}`, text.split(from).length === 2, from);
    writeFileSync(join(BEFORE.root, name), text.replace(from, to));
}

// ---------------------------------------------------------------- the origin
//
// tests/serve.mjs, plus the places this suite holds the world still. A hold is a request
// the origin has received and not yet answered; `arrived` resolves when it comes in and
// `release` answers it.
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };

// WHEN, never what. Registered before the worker's own listeners, so `install` cannot
// finish, and the claim cannot start, until the test says.
const PROLOGUE = `/* tests/firstvisit.browser.mjs: two waits, nothing else */
self.addEventListener('install', event => event.waitUntil(fetch('/__hold/install').catch(() => undefined)));
{ const claim = self.clients.claim.bind(self.clients);
  self.clients.claim = () => fetch('/__hold/claim').catch(() => undefined).then(() => claim()); }
`;

// INJECTED, and named here rather than glossed: a Cache API write that rejects. A browser
// rejects it for quota, for eviction, for a storage backend it cannot reach; this is that
// shape of failure and not that cause, exactly as in tests/swidentity.test.mjs - except
// that here the registry asks the origin before every write, so the test can have the
// disk refuse for a while and then take writes again, in ONE worker process. Only `put`
// on `farkad-clients` is touched; everything else is handed straight through.
const REFUSING = `/* tests/firstvisit.browser.mjs: INJECTED - the registry's put asks the origin whether it lands */
{ const open = CacheStorage.prototype.open;
  CacheStorage.prototype.open = function (name) {
    return open.call(this, name).then(cache => (name !== 'farkad-clients' ? cache : new Proxy(cache, {
      get(target, prop) {
        if (prop === 'put') {
          return (...args) => fetch('/__registry').then(said => said.text()).then(word => (word === 'take'
            ? target.put(...args) : Promise.reject(new DOMException('storage full', 'QuotaExceededError'))));
        }
        const value = Reflect.get(target, prop);
        return typeof value === 'function' ? value.bind(target) : value;
      } })));
  }; }
`;

function hold() {
    let arrive; let let_go;
    const arrived = new Promise(resolve => { arrive = resolve; });
    const released = new Promise(resolve => { let_go = resolve; });
    return { arrived, released, arrive, release: let_go };
}
const fourHolds = () => ({ install: hold(), claim: hold(), document: hold(), rest: hold() });

// root: the tree being served. prologue: what is put in front of sw.js, or nothing.
// registry: what the REFUSING worker is told when it asks whether a write lands.
const origin = { root, prologue: '', holds: {}, holdDocument: false, registry: 'take' };
const http = createServer(async (request, response) => {
    try {
        const path = decodeURIComponent(new URL(request.url, 'http://x').pathname);
        const named = /^\/__hold\/(install|claim)$/.exec(path);
        if (named) {
            const at = origin.holds[named[1]];
            if (at) { at.arrive(); await at.released; }
            response.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }).end('go');
            return;
        }
        if (path === '/__registry') {
            response.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }).end(origin.registry);
            return;
        }
        const tree = normalize(origin.root);
        let file = normalize(join(tree, path === '/' ? '/index.html' : path));
        if (!file.startsWith(tree)) { response.writeHead(403).end('no'); return; }
        const info = await stat(file).catch(() => null);
        if (info && info.isDirectory()) file = join(file, 'index.html');
        // Read NOW: a request is answered from the tree that was deployed when it arrived,
        // however long the answer then takes to leave.
        let body = await readFile(file);
        if (origin.prologue && path === '/sw.js') body = Buffer.concat([Buffer.from(origin.prologue), body]);
        const head = { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
            'Cache-Control': 'no-store', 'Service-Worker-Allowed': '/' };
        // The held DOCUMENT only - the worker's own precache asks for index.html too, and
        // that request is not a navigation. Held twice: before a byte of it is sent, and
        // again with the top of the page sent (enough for the window to exist and to be
        // claimed) and everything from its first stylesheet on still to come.
        if (origin.holdDocument && request.headers['sec-fetch-mode'] === 'navigate') {
            origin.holdDocument = false;
            const at = origin.holds;
            at.document.arrive();
            await at.document.released;
            const cut = body.indexOf('<link');
            response.writeHead(200, head);
            response.write(body.subarray(0, cut));
            await at.rest.released;
            response.end(body.subarray(cut));
            return;
        }
        response.writeHead(200, head);
        response.end(body);
    } catch (error) {
        response.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
    }
});
await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
const BASE = `http://127.0.0.1:${http.address().port}`;

const browser = await launchLocalBrowser(chromium, { executablePath: process.env.CHROME_PATH });
const browserCdp = await browser.newBrowserCDPSession();
const settle = ms => new Promise(resolve => setTimeout(resolve, ms));
const WAIT = 30000;
const within = (promise, what) => Promise.race([promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`timed out waiting for ${what}`)), WAIT))]);
const PHONE = { viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true };

// What the worker handed this page for `path`: the status, the refusal's own cause, and a
// hash of the bytes, so «served» means served THIS build's file and not merely answered.
const served = (page, path) => page.evaluate(async url => {
    const response = await fetch(url, { cache: 'no-store' });
    const bytes = new Uint8Array(await response.arrayBuffer());
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return { status: response.status, cause: response.headers.get('X-Farkad-Fail-Closed'),
        hash: [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('') };
}, path);
const onDisk = (path, tree = root) => ({ status: 200, cause: null, hash: sha(readFileSync(join(tree, path))) });
const REFUSED = { status: 503, cause: 'unrecorded' };
const answer = ({ status, cause }) => ({ status, cause });
// The registry, read from the page: the Cache API is one store for the page and the
// worker. Client id -> the build written down for it.
const registry = page => page.evaluate(async () => {
    const cache = await caches.open('farkad-clients');
    const out = {};
    for (const key of await cache.keys()) {
        out[decodeURIComponent(key.url.split('/').pop())] = await (await cache.match(key)).text();
    }
    return out;
});
const forget = (page, id) => page.evaluate(async key => {
    const cache = await caches.open('farkad-clients');
    return cache.delete(new Request('https://farkad.invalid/client/' + encodeURIComponent(key)));
}, id);
const controlled = page => page.evaluate(() => Boolean(navigator.serviceWorker.controller));
// Every refusal a page was handed, by path and cause.
function refusals(page) {
    const list = [];
    page.on('response', response => {
        if (response.status() !== 503) return;
        list.push(`${new URL(response.url()).pathname} (${response.headers()['x-farkad-fail-closed'] || 'no cause'})`);
    });
    return list;
}
const LATE = ['js/sync/firebase-adapter.js', 'vendor/xlsx-0.18.5.min.js', 'icons/icon-192.png'];

// A phone, and every worker process it has ever started: a worker that was stopped and
// came back is a NEW entry here, which is how a check that only means something in the
// process that claimed can say that it was asked there.
async function phone() {
    const context = await browser.newContext(PHONE);
    const processes = [];
    context.on('serviceworker', worker => processes.push(worker));
    return { context, processes };
}
// The id the WORKER knows a window by, asked of the worker itself. A page cannot read its
// own; the windows of this suite are told apart by the query they were opened under.
async function clientId(device, mark) {
    // Asked until exactly one answers to the mark: a window that has just been replaced
    // by its own reload can stay on the worker's list for a moment.
    for (const until = Date.now() + 6000; Date.now() < until; await settle(100)) {
        for (const worker of [...device.processes].reverse()) {
            const windows = await worker.evaluate(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true })
                .then(list => list.map(client => ({ id: client.id, url: client.url })))).catch(() => null);
            if (!windows) continue;
            const mine = windows.filter(client => client.url.includes(mark));
            if (mine.length === 1) return mine[0].id;
            break;
        }
    }
    return null;
}
// The top of a held document has arrived and nothing below it: the window exists, and
// not one of its stylesheets or scripts has been asked for.
async function halfThere(page) {
    let state = null;
    for (const until = Date.now() + 15000; Date.now() < until;) {
        state = await Promise.race([settle(2000).then(() => 'no answer'),
            page.evaluate(() => ({ ready: document.readyState,
                asked: document.scripts.length + document.querySelectorAll('link').length })).catch(error => String(error))]);
        if (state && state.ready === 'loading' && state.asked === 0) return null;
        await settle(50);
    }
    return JSON.stringify(state);
}
async function stopWorkers(device, page) {
    const cdp = await device.context.newCDPSession(page);
    await cdp.send('ServiceWorker.enable');
    const workers = async () => (await browserCdp.send('Target.getTargets')).targetInfos
        .filter(info => info.type === 'service_worker' && info.url.startsWith(BASE));
    let alive = await workers();
    for (let tries = 0; tries < 60 && alive.length > 0; tries += 1) {
        await cdp.send('ServiceWorker.stopAllWorkers');
        await settle(250);
        alive = await workers();
    }
    return alive.length;
}

// THE FIRST-VISIT RACE, up to the moment everything is waiting: the first window is open,
// its reload has left and is held at the origin, the install has been let go, and
// `activate` has read the windows it can see - the one that is leaving, or none - written
// them down, and stopped at the claim.
async function reloadedWhileInstalling(page) {
    await page.goto(`${BASE}/index.html?window=first`, { waitUntil: 'load' });
    await within(origin.holds.install.arrived, 'the worker to reach the end of its install');
    given('the first window is open, the worker is installing, and nothing controls the page',
        !(await controlled(page)), 'a controller before the install was let go');
    // The reload leaves NOW - no worker is active, so the network answers it and no
    // navigation handler records it - and its document is held on the way.
    origin.holdDocument = true;
    const reloading = page.reload({ waitUntil: 'commit' });
    await within(origin.holds.document.arrived, 'the reload to reach the origin');
    origin.holds.install.release();
    await within(origin.holds.claim.arrived, 'activate to reach its claim');
    // In a box: an async function that returned the promise itself would wait for it.
    return { arriving: reloading };
}
// AND THE REST OF IT: the window arrives - after the enrollment, before the claim has
// landed - and then the claim lands. It returns with the worker in charge of a window it
// never wrote down, and with everything below the top of that window's page still held.
async function arrivesThenClaimed(page, { arriving }) {
    origin.holds.document.release();
    await arriving;
    const half = await halfThere(page);
    given('the window has arrived, and has asked for nothing yet', half === null, String(half));
    origin.holds.claim.release();
    await within(page.waitForFunction(() => Boolean(navigator.serviceWorker.controller)),
        'the worker to have the window that arrived late');
}

// ---------------------------------------------------------------- 1. the race, held open
suite('A first visit reloaded while the worker installs: the window the claim took is written down');
{
    origin.root = root;
    origin.prologue = PROLOGUE;
    origin.holds = fourHolds();
    const device = await phone();
    const page = await device.context.newPage();
    const refused = refusals(page);
    // Every script the page is handed, and by whom.
    const scripts = [];
    page.on('response', response => {
        const path = new URL(response.url()).pathname;
        if (path.endsWith('.js')) scripts.push({ path, worker: response.fromServiceWorker(), status: response.status() });
    });

    await arrivesThenClaimed(page, await reloadedWhileInstalling(page));
    // Now, and only now, the page is given the rest of itself: every stylesheet and every
    // script it names is asked of a worker that never wrote this window down.
    scripts.length = 0;
    origin.holds.rest.release();
    await page.waitForLoadState('load');

    const named = await page.evaluate(() => [...document.scripts].filter(script => script.src)
        .map(script => new URL(script.src).pathname));
    given('the page names its scripts, and the suite saw each of them answered',
        named.length > 20 && named.every(path => scripts.some(got => got.path === path)),
        `${named.length} named, ${scripts.length} answered`);
    same('every script of the page was asked of this worker, after the claim, and was answered',
        named.filter(path => !scripts.some(got => got.path === path && got.worker && got.status === 200)), []);
    const booted = await page.evaluate(() => ({
        build: typeof APP_VERSION === 'string' ? `farkad-${APP_VERSION}` : null,
        state: typeof State === 'object' && State !== null
    }));
    same('the reloaded window started: every script of the page ran, on this build',
        booted, { build: VERSION, state: true });

    for (const path of LATE) {
        same(`${path} is handed to the claimed window, and it is this build's file`, await served(page, path), onDisk(path));
    }
    const id = await clientId(device, 'window=first');
    given('the worker names the reloaded window', typeof id === 'string' && id.length > 0, String(id));
    const records = await registry(page);
    same('the reloaded window is written down under its own id, as running this build', records[id], VERSION);
    check('and every record on this phone names this build',
        Object.values(records).every(build => build === VERSION), JSON.stringify(records));
    await settle(400);
    same('the window was refused nothing, from its first request to its last', refused, []);

    // ------------------------------------------------------------ 2. a restart, and what is still refused
    suite('What was written down outlives the process - and the repair did not turn «unknown» into «served»');
    // The process goes, and the memory of who was served goes with it. Nothing is deleted:
    // what the late window was told has to be on the disk, or this is where it is lost.
    given('the worker process was stopped', (await stopWorkers(device, page)) === 0);
    same('a restarted worker, with nothing deleted, serves the window that arrived late: its record is on the disk',
        await served(page, LATE[0]), onDisk(LATE[0]));
    // And now the records go too.
    given('the worker process was stopped again', (await stopWorkers(device, page)) === 0);
    await page.evaluate(async () => {
        const cache = await caches.open('farkad-clients');
        await Promise.all((await cache.keys()).map(key => cache.delete(key)));
    });
    same('a window whose record is gone, asked by a worker that ran no activate, is refused as before',
        answer(await served(page, LATE[0])), REFUSED);
    same('and it is still refused a moment later - nothing wrote a record for it behind its back',
        answer(await served(page, LATE[1])), REFUSED);
    // Under its query, as it was opened: to the worker that is the app's navigation.
    await page.reload({ waitUntil: 'load' });
    same('a reload - the remedy the refusal names - brings it back', await served(page, LATE[0]), onDisk(LATE[0]));
    same('and what the reload opened is the app, on this build',
        await page.evaluate(() => (typeof APP_VERSION === 'string' ? `farkad-${APP_VERSION}` : null)), VERSION);
    await device.context.close();
}

// ---------------------------------------------------------------- 3. a disk that refuses the record
suite('The same race on a disk that refuses the record: a write that did not land is not believed');
{
    origin.root = root;
    origin.prologue = REFUSING + PROLOGUE;
    origin.registry = 'take';
    origin.holds = fourHolds();
    const device = await phone();
    const page = await device.context.newPage();

    const reloading = await reloadedWhileInstalling(page);
    // The enrollment is over and its writes landed. From here the disk refuses.
    origin.registry = 'refuse';
    await arrivesThenClaimed(page, reloading);
    const claimer = device.processes.length;

    same('the window that arrived late is refused while its record cannot be written',
        answer(await served(page, LATE[0])), REFUSED);

    // A second window, opened through the worker while the disk still refuses: the worker
    // cannot write it down, so it does not start it.
    const unstarted = await device.context.newPage();
    const opened = await unstarted.goto(`${BASE}/index.html?window=unstarted`, { waitUntil: 'load' });
    given('the worker refused to start a window it could not write down',
        opened.status() === 503 && opened.headers()['x-farkad-fail-closed'] === 'unwritable'
        && (await controlled(unstarted)), `${opened.status()} ${opened.headers()['x-farkad-fail-closed']}`);
    // Every navigation the worker answers is followed, a second and a half later, by a
    // reap that asks about every window. It is let run - and fail to write - BEFORE the
    // disk recovers, so that the next question about either window is that window's own.
    await settle(2600);
    origin.registry = 'take';

    same('a window this worker refused to start is not enrolled afterwards, though the disk now takes the write',
        answer(await served(unstarted, LATE[0])), REFUSED);
    same('and it is still not, asked again', answer(await served(unstarted, LATE[1])), REFUSED);
    // Asked by the window itself, of the fetch handler, before any census: nothing else
    // has asked about it since the disk came back.
    same('the late window is served the first time it asks once the write lands - by its own request',
        await served(page, LATE[0]), onDisk(LATE[0]));
    given('and all of that was answered by the one process that claimed',
        device.processes.length === claimer, `${device.processes.length} processes, ${claimer} at the claim`);
    const id = await clientId(device, 'window=first');
    const never = await clientId(device, 'window=unstarted');
    given('the worker names both windows', Boolean(id) && Boolean(never), `${id} ${never}`);
    const records = await registry(page);
    same('the late window is written down now, under its own id', records[id], VERSION);
    check('and the window that was never started is in no record', !(never in records), JSON.stringify(records));
    origin.holds.rest.release();
    await device.context.close();
}

// ---------------------------------------------------------------- 4. an upgrade
for (const order of ['before', 'after']) {
    suite(`An upgrade, the hard reload reaching the origin ${order} the deploy: the window that arrives during the takeover is refused`);
    given('js/app.js tells the two builds apart',
        onDisk('js/app.js').hash !== onDisk('js/app.js', BEFORE.root).hash);
    // The build before, installed the ordinary way and in charge of two windows.
    origin.root = BEFORE.root;
    origin.prologue = '';
    origin.holds = {};
    const device = await phone();
    const kept = await device.context.newPage();
    await kept.goto(`${BASE}/index.html?window=kept`, { waitUntil: 'load' });
    await within(kept.waitForFunction(() => Boolean(navigator.serviceWorker.controller)), 'the build before to take its first window');
    const late = await device.context.newPage();
    await late.goto(`${BASE}/index.html?window=late`, { waitUntil: 'load' });
    given('two windows are running the build before, under its worker',
        (await kept.evaluate(() => APP_VERSION)) === BEFORE.stamp && (await late.evaluate(() => APP_VERSION)) === BEFORE.stamp
        && (await controlled(late)));
    // Somebody is typing in both. A window of the app that finds a new worker under it
    // reloads itself at the first moment nobody is typing (js/ui/offline.js), and on an
    // upgrade the windows of the outgoing worker are handed to the new one the moment it
    // starts to take over, before its `activate` has run. So one window stays where it is,
    // on the build before; and the other does not answer that hand-over with a reload of
    // its own, which would replace the hard reload that is already on its way (measured:
    // without this the hard reload is aborted, and the reload that replaces it goes
    // through the new worker and is written down like any other).
    const typing = window => window.evaluate(() => {
        const input = document.createElement('input');
        document.body.appendChild(input);
        input.value = 'שם עובד';
        input.focus();
        return midEdit();
    });
    given('both windows are mid-edit', (await typing(kept)) && (await typing(late)));
    const keptId = await clientId(device, 'window=kept');
    const before = await registry(kept);
    given('and it is written down as running the build before', before[keptId] === BEFORE.cache, JSON.stringify(before));

    // A HARD reload of the other window: it goes past the worker, so nobody records it.
    // It reaches the origin either while the build before is still what is deployed, or
    // just after the deploy; the origin answers it from the tree it found, and holds the
    // answer. That is the whole difference between the two orders, and the worker is
    // shown neither.
    if (order === 'after') origin.root = root;
    origin.holds = fourHolds();
    origin.holdDocument = true;
    const cdp = await device.context.newCDPSession(late);
    await cdp.send('Page.reload', { ignoreCache: true });
    await within(origin.holds.document.arrived, 'the hard reload to reach the origin');

    // The deploy. The new worker installs, waits behind the old one, is told to take
    // over, reads its list of windows, and stops at the claim.
    origin.root = root;
    origin.prologue = PROLOGUE;
    await kept.evaluate(() => navigator.serviceWorker.getRegistration().then(registration => registration.update()));
    await within(origin.holds.install.arrived, 'the new worker to reach the end of its install');
    origin.holds.install.release();
    // Installed, it waits behind the worker that has the windows - until it is told to
    // take over, which is what «רענן עכשיו» tells it. Asked until it is said.
    const told = () => kept.evaluate(() => navigator.serviceWorker.getRegistration().then(registration => {
        if (!registration || !registration.waiting) return false;
        registration.waiting.postMessage('skip-waiting');
        return true;
    }));
    let waiting = await told();
    for (let tries = 0; tries < 300 && !waiting; tries += 1) {
        await settle(50);
        waiting = await told();
    }
    given('the new worker was installed, was waiting, and was told to take over', waiting);
    await within(origin.holds.claim.arrived, 'the new worker to reach its claim');

    // The hard-reloaded window arrives now - after the enrollment, before the claim has
    // landed - and then the claim lands.
    origin.holds.document.release();
    const half = await halfThere(late);
    given('the window has arrived, and has asked for nothing yet', half === null, String(half));
    given('and nothing controls it', !(await controlled(late)));
    origin.holds.claim.release();
    await within(late.waitForFunction(() => Boolean(navigator.serviceWorker.controller)), 'the new worker to have the late window');
    const claimer = device.processes.length;
    // The rest of its page, and with it every script it names - all asked of the new
    // worker, about a window it has no record for.
    origin.holds.rest.release();
    await late.waitForLoadState('load');
    const handed = order === 'before' ? BEFORE.stamp : STAMP;
    const started = window => window.evaluate(() => ({
        page: document.querySelector('meta[name="farkad-build"]').getAttribute('content'),
        scripts: typeof APP_VERSION === 'string' ? APP_VERSION : null }));
    same(`the origin handed it the page of the build deployed ${order === 'before' ? 'before' : 'now'}, and the worker handed it NO build's scripts`,
        await started(late), { page: handed, scripts: null });
    same('asked for js/app.js, the window that arrived during the takeover is refused', answer(await served(late, 'js/app.js')), REFUSED);
    same('and refused again, whatever it asks for', answer(await served(late, LATE[0])), REFUSED);
    const lateId = await clientId(device, 'window=late');
    given('the new worker names the late window', Boolean(lateId) && !(lateId in before), String(lateId));
    // Asked by the reap at `activate`, by every script of its page and twice more above.
    same('and nothing wrote a record for it - as the outgoing build, or as this one',
        (await registry(kept))[lateId], undefined);

    // The other window was open when `activate` began and was written down. Its record is
    // taken away: that is a LOST record, which may belong to a window two builds back, and
    // not a late arrival - so nothing is to be written for it, by this process either.
    same('a window that was open at activate is served its own build while its record stands',
        await served(kept, 'js/app.js'), onDisk('js/app.js', BEFORE.root));
    given('its record was taken away', await forget(kept, keptId));
    same('a window that was open at activate and has lost its record is refused, by the very process that claimed',
        answer(await served(kept, 'js/app.js')), REFUSED);
    same('and is refused again', answer(await served(kept, LATE[0])), REFUSED);
    same('and nothing wrote a record for it', (await registry(kept))[keptId], undefined);
    given('all of that was answered by the one process that claimed',
        device.processes.length === claimer, `${device.processes.length} processes, ${claimer} at the claim`);
    // The remedy the refusal names. This navigation goes THROUGH the new worker, which
    // writes it down and hands it its own page.
    await late.reload({ waitUntil: 'load' });
    same('a reload brings the late window back on ONE build: its page and its scripts are this build',
        await started(late), { page: STAMP, scripts: STAMP });
    same('and what it asks for afterwards is this build\'s file', await served(late, 'js/app.js'), onDisk('js/app.js'));
    await device.context.close();
}

// ---------------------------------------------------------------- 5. the ordinary sequence
suite('The ordinary sequence on the shipped worker: a load, and a reload a moment later');
{
    origin.root = root;
    origin.prologue = '';
    origin.holds = {};
    const swBytes = await (await fetch(`${BASE}/sw.js`)).arrayBuffer();
    given('the worker served here is the shipped file, byte for byte',
        sha(Buffer.from(swBytes)) === sha(readFileSync(join(root, 'sw.js'))), 'the prologue is still on');
    const GAPS = [0, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 600];
    const refusedAt = [];
    const unclaimed = [];
    for (const gap of GAPS) {
        const context = await browser.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });
        const page = await context.newPage();
        const refused = refusals(page);
        await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
        await page.waitForTimeout(gap);
        await page.reload({ waitUntil: 'load' });
        // Until the worker has the page, and then whatever the page asks for late. A reload
        // that lands AFTER the claim is nobody's window: it runs off the network until its
        // next start, asks the worker for nothing and is refused nothing - a third outcome
        // of the same race, older than this suite, counted here and not judged.
        await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 6000 })
            .catch(() => unclaimed.push(gap));
        for (const path of LATE) {
            const got = await served(page, path);
            if (got.status !== 200 || got.hash !== onDisk(path).hash) refused.push(`${path} asked late: ${got.status} (${got.cause})`);
        }
        await page.waitForTimeout(300);
        if (refused.length) refusedAt.push(`${gap}ms: ${refused.join(', ')}`);
        await context.close();
    }
    given('most of those phones ended with the worker in charge - the question was really asked',
        unclaimed.length <= GAPS.length / 2, `not claimed at ${unclaimed.join(', ')}ms`);
    console.log(`  [the worker had ${GAPS.length - unclaimed.length} of ${GAPS.length} windows`
        + `${unclaimed.length ? `; left to the network, reloaded at ${unclaimed.join(', ')}ms` : ''}]`);
    same(`${GAPS.length} phones reloaded ${GAPS[0]}-${GAPS[GAPS.length - 1]}ms after their first load were refused nothing`, refusedAt, []);
}

await browser.close();
await new Promise(resolve => http.close(resolve));
rmSync(work, { recursive: true, force: true });
report();
