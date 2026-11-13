// A deploy that lands while the phone's HTTP cache still holds the build before it.
//
//   npm run test:swfresh
//
// The host this app is served from answers every file with `Cache-Control: max-age=600`.
// Every server the other suites use answers `no-store` (tests/serve.mjs, and the servers
// inside tests/handover.test.mjs and tests/firstvisit.browser.mjs), which is right for
// what they measure and is also why none of them could see this: a service worker's
// fetch is answered out of the browser's HTTP cache while the entry is fresh, and the
// install used to fill its shelf with a bare cache.add(url). So a phone that had fetched
// the shell less than ten minutes before a deploy - its first visit, or its install of
// the build before - installed the NEW worker over the OLD bytes:
//
//   - every file still fresh: a shelf named for the new build holding the old one whole.
//     The banner comes, the person presses it, and the phone goes on running the old
//     program under the new worker. sw.js is already the newest, so no later check finds
//     anything, and a rollout rule ("every phone on this build before ...") is believed
//     met on a phone that is not.
//   - some fresh and some not (a CDN hands each file its own remaining lifetime): one
//     script of the new build beside the rest of the old. A session runs one build, end
//     to end - except this one.
//
// So this suite is tests/update.test.mjs's deploy on a server that answers the way the
// real host does, and what it holds the worker to is bytes: after the install, EVERY
// file of the new shelf is read out of the Cache API and compared with the file the
// deploy put on the disk. The deploy changes every script and stylesheet, so a file left
// over from the build before cannot compare equal by being the same file.
//
// The third section is the same fault by the route the fetch mode does not cover: the
// origin itself still handing out the old page and the old app.js behind a new sw.js
// (a CDN mid-deploy). The install must fail - the old build serving, nothing waiting -
// and succeed, whole, once the origin has caught up.
//
// NOT launchLocalBrowser, and deliberately. tests/network-guard.mjs keeps a browser on
// loopback by routing every request of the context, and Playwright turns the HTTP cache
// OFF for a context with a route - under it this suite would be green on the faulty
// worker. The resolver rule below is the half of the guard that does not touch the
// cache, and the server counts what it was asked for, so "the HTTP cache really did hold
// the old build" is a precondition this file measures and stops on, not an assumption.
//
// What it does not prove: the real host's headers (no network is used; the ten minutes
// are what GitHub Pages is documented to send), and anything about WebKit.

import { cp, readFile, writeFile, rm, mkdtemp, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, extname, normalize } from 'node:path';
import { deployedFrom } from './shell.mjs';
import { suite, check, given, report } from './runner.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const EXEC = process.env.CHROME_PATH || undefined;
const ROOT = new URL('..', import.meta.url).pathname;

const BUILDS = {
    old: { app: 'v79', cache: 'farkad-v79' },
    new: { app: 'v79-fresh-test', cache: 'farkad-v79-fresh-test' }
};
const MARKER = 'SWFRESH_DEPLOY_MARKER';

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.png': 'image/png',
    '.ics': 'text/calendar; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8'
};

const sha = bytes => createHash('sha256').update(bytes).digest('hex');

// The shell, read off the worker under test: the list the install walks is the list
// whose bytes are compared, so a file added to the shell is compared without being named
// here.
const SHELL = (() => {
    const found = [];
    return readFile(join(ROOT, 'sw.js'), 'utf8').then(source => {
        const block = /const SHELL = \[([\s\S]*?)\];/.exec(source);
        given('sw.js has a SHELL this suite can read', Boolean(block));
        for (const match of block[1].matchAll(/^\s*'(\.\/[^']*)'/gm)) found.push(match[1]);
        given('the shell is the app and not a fragment of it', found.length > 30, String(found.length));
        return found;
    });
})();
const shell = await SHELL;
const fileOf = url => (url === './' ? 'index.html' : url.slice(2));

// ---------------------------------------------------------------- one phone, one origin
//
// A copy of the app, a server over it that answers as the real host does, and a browser
// with its HTTP cache ON. `lifetime(path)` is the max-age of one file - the mixed case is
// one file whose freshness was already spent. `behind` is the set of paths for which the
// origin is still handing out the build before (the copy kept in `previous`).
async function origin(lifetime) {
    const dir = await mkdtemp(join(tmpdir(), 'farkad-swfresh-'));
    for (const item of await deployedFrom(ROOT)) {
        await cp(join(ROOT, item), join(dir, item), { recursive: true });
    }

    const world = { dir, hits: [], behind: new Set(), previous: new Map() };

    const server = createServer(async (request, response) => {
        try {
            const path = decodeURIComponent(new URL(request.url, 'http://x').pathname);
            let file = normalize(join(dir, path === '/' ? '/index.html' : path));
            if (!file.startsWith(normalize(dir))) { response.writeHead(403).end('no'); return; }
            const info = await stat(file).catch(() => null);
            if (info && info.isDirectory()) file = join(file, 'index.html');

            const late = world.behind.has(path) && world.previous.has(path);
            const body = late ? world.previous.get(path) : await readFile(file);
            world.hits.push(path);
            response.writeHead(200, {
                'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
                // The header this whole file is about. No validator is sent, so a
                // revalidation is a full answer and is counted like any other request.
                'Cache-Control': `max-age=${lifetime(path)}`,
                'Service-Worker-Allowed': '/'
            });
            response.end(body);
        } catch (error) {
            response.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
        }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    world.url = `http://127.0.0.1:${server.address().port}`;

    const edit = async (file, pattern, replacement) => {
        const path = join(dir, file);
        const before = await readFile(path, 'utf8');
        given(`${file} carries a version string this test can move`, pattern.test(before));
        await writeFile(path, before.replace(pattern, replacement));
    };
    world.stamp = async build => {
        await edit('index.html', /<meta name="farkad-build" content="[^"]*">/,
            `<meta name="farkad-build" content="${build.app}">`);
        await edit('js/app.js', /const APP_VERSION = '[^']*';/, `const APP_VERSION = '${build.app}';`);
        await edit('sw.js', /const VERSION = '[^']*';/, `const VERSION = '${build.cache}';`);
    };

    // The deploy of the new build. The three stamps move, and EVERY script and
    // stylesheet of the shell gains one comment line - otherwise an old file and a new
    // one are the same bytes and the comparison below could not tell them apart. The
    // page differs by its stamp. What is left the same between the two builds (the
    // icons, the calendar, the licence, the manifest) is listed by the suite, not hidden.
    world.deployNew = async () => {
        for (const url of shell) {
            const path = '/' + fileOf(url);
            world.previous.set(path, await readFile(join(dir, fileOf(url))));
        }
        world.previous.set('/', world.previous.get('/index.html'));
        await world.stamp(BUILDS.new);
        for (const url of shell) {
            const file = fileOf(url);
            const kind = extname(file);
            if (kind !== '.js' && kind !== '.css') continue;
            const path = join(dir, file);
            await writeFile(path, Buffer.concat([await readFile(path),
                Buffer.from(`\n/* ${MARKER} ${BUILDS.new.app} */\n`)]));
        }
        await writeFile(join(dir, 'swfresh-late.txt'), 'new');
        world.hits.length = 0;
    };

    // What the deploy put on the disk, per shell entry.
    world.deployed = async () => {
        const out = {};
        for (const url of shell) out[url] = sha(await readFile(join(dir, fileOf(url))));
        return out;
    };
    world.browser = await chromium.launch({
        ...(EXEC ? { executablePath: EXEC } : {}),
        args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1, EXCLUDE [::1]']
    });
    world.context = await world.browser.newContext();
    world.page = await world.context.newPage();
    world.page.on('dialog', dialog => dialog.accept());

    // The precondition the whole file stands on, measured before the app is ever opened
    // and so before any worker exists to answer instead: this browser keeps a file for
    // as long as max-age says and does not ask the origin again. With the HTTP cache off
    // every check below would pass on any worker at all.
    if (lifetime('/swfresh-probe.txt') > 0) {
        const probe = join(dir, 'swfresh-probe.txt');
        await writeFile(probe, 'first');
        await world.page.goto(`${world.url}/swfresh-probe.txt`);
        const read = () => world.page.evaluate(() => fetch('/swfresh-probe.txt').then(r => r.text()));
        const before = await read();
        await writeFile(probe, 'second');
        world.hits.length = 0;
        const after = await read();
        given('the browser\'s HTTP cache is on and honours max-age',
            before === 'first' && after === 'first' && world.hits.length === 0,
            `${before} then ${after}; the origin was asked for ${JSON.stringify(world.hits)}`);
        // Out of the way of what follows: the old build reads this file under another
        // query, so nothing kept here answers for it.
        await rm(probe);
    }

    world.close = async () => {
        await world.browser.close();
        await new Promise(done => server.close(done));
        await rm(dir, { recursive: true, force: true });
    };
    return world;
}

// The old build, installed and in charge, with its shelf complete - and a file the old
// page read once, so that the HTTP cache holds the old copy of something the shelf never
// will.
async function runOld(world) {
    await world.stamp(BUILDS.old);
    await writeFile(join(world.dir, 'swfresh-late.txt'), 'old');
    const { page } = world;
    await page.goto(`${world.url}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null,
        { timeout: 30000, polling: 100 });
    await page.waitForFunction(name => caches.open('farkad-shelves')
        .then(cache => cache.match('https://farkad.invalid/shelf/' + name))
        .then(hit => (hit ? hit.text() : ''))
        .then(state => state === 'complete')
        .catch(() => false), BUILDS.old.cache, { timeout: 30000, polling: 200 })
        // The registry's key is the worker's business; if it is ever renamed this wait
        // times out and the count below still decides.
        .catch(() => {});
    const held = await page.evaluate(name => caches.open(name).then(c => c.keys()).then(k => k.length),
        BUILDS.old.cache);
    given('the old build is installed whole', held === shell.length, `${held} of ${shell.length}`);
    given('the old page is the old build',
        (await page.evaluate(() => APP_VERSION)) === BUILDS.old.app);
    given('the old page read a file that is in no shell',
        (await page.evaluate(() => fetch('./swfresh-late.txt').then(r => r.text()))) === 'old');
    // The boot-time re-offers of a waiting worker (tests/update.test.mjs says why).
    await page.waitForTimeout(2000);
}

// Ask for sw.js the way a return to the foreground does, and wait for the outcome:
// a worker waiting, or the install over with nothing waiting.
async function updateCheck(world) {
    return world.page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        let failed = false;
        registration.addEventListener('updatefound', () => {
            const worker = registration.installing;
            if (worker) worker.addEventListener('statechange', () => {
                if (worker.state === 'redundant') failed = true;
            });
        });
        await registration.update().catch(() => {});
        const until = Date.now() + 30000;
        while (Date.now() < until) {
            if (registration.waiting) return 'waiting';
            if (failed && !registration.installing) return 'failed';
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return 'nothing';
    });
}

// Every entry of one shelf, hashed where it lies.
const shelfSums = (world, name) => world.page.evaluate(async ({ name, urls }) => {
    if (!(await caches.has(name))) return null;
    const cache = await caches.open(name);
    const out = {};
    for (const url of urls) {
        const hit = await cache.match(url);
        if (!hit) { out[url] = null; continue; }
        const digest = await crypto.subtle.digest('SHA-256', await hit.arrayBuffer());
        out[url] = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
    }
    return out;
}, { name, urls: shell });

const shelfSays = (world, name) => world.page.evaluate(async name => {
    if (!(await caches.has(name))) return null;
    const cache = await caches.open(name);
    const text = async url => { const hit = await cache.match(url); return hit ? hit.text() : ''; };
    return {
        page: ((await text('./index.html')).match(/farkad-build" content="([^"]*)"/) || [])[1] || null,
        app: ((await text('./js/app.js')).match(/APP_VERSION = '([^']*)'/) || [])[1] || null
    };
}, name);

const shelfState = (world, name) => world.page.evaluate(name => caches.open('farkad-shelves')
    .then(cache => cache.match('https://farkad.invalid/shelf/' + name))
    .then(hit => (hit ? hit.text() : null)), name);

// Press the banner's button the way the banner does, and come back on whatever the
// worker now serves. The page may reload itself on the handover (js/ui/offline.js); this
// reloads once more either way, so what is read is a page the NEW worker handed over.
async function takeUpdate(world) {
    const { page } = world;
    await page.evaluate(() => navigator.serviceWorker.getRegistration()
        .then(registration => registration.waiting.postMessage('skip-waiting')));
    await page.waitForTimeout(2500);
    await page.reload({ waitUntil: 'load' }).catch(() => {});
    await page.waitForFunction(() => typeof APP_VERSION === 'string'
        && document.readyState === 'complete', null, { timeout: 30000 });
    return page.evaluate(() => ({
        meta: document.querySelector('meta[name="farkad-build"]').getAttribute('content'),
        script: APP_VERSION
    }));
}

// The bytes, entry by entry. One check per section rather than one per file: sixty lines
// that are all the same sentence are a wall nobody reads, and the failure names its files.
function holdToDeploy(what, sums, deployed) {
    const wrong = shell.filter(url => sums === null || sums[url] !== deployed[url]);
    check(what, wrong.length === 0,
        sums === null ? 'the shelf does not exist'
            : wrong.length ? `${wrong.length} of ${shell.length} are not the deploy's bytes: ${wrong.slice(0, 6).join(', ')}${wrong.length > 6 ? ', ...' : ''}`
                : `${shell.length} files`);
}

// ---------------------------------------------------------------- 1. every file fresh
{
    suite('a deploy inside the ten minutes: every file of the old build still fresh in the HTTP cache');

    const world = await origin(() => 600);
    await runOld(world);
    await world.deployNew();
    const deployed = await world.deployed();

    const differ = shell.filter(url => sha(world.previous.get(url === './' ? '/' : '/' + fileOf(url))) !== deployed[url]);
    given('the deploy changed the page and every script and stylesheet',
        differ.length === shell.filter(url => url === './' || /\.(html|js|css)$/.test(url)).length,
        `${differ.length} changed`);
    console.log(`        (${shell.length - differ.length} shell files are the same bytes in both builds: `
        + `${shell.filter(url => differ.indexOf(url) === -1).join(', ')})`);

    world.hits.length = 0;
    const outcome = await updateCheck(world);
    check('the new worker installs and waits', outcome === 'waiting', outcome);

    const wanted = new Set(shell.map(url => (url === './' ? '/' : '/' + fileOf(url))));
    const fetched = new Set(world.hits);
    const unasked = [...wanted].filter(path => !fetched.has(path));
    check('the install asked the ORIGIN for every file of the shell',
        unasked.length === 0,
        unasked.length ? `${unasked.length} never asked for: ${unasked.slice(0, 6).join(', ')}` : `${wanted.size} paths`);

    holdToDeploy('every file on the new shelf is the NEW build\'s bytes',
        await shelfSums(world, BUILDS.new.cache), deployed);
    const says = await shelfSays(world, BUILDS.new.cache);
    check('the shelf named for the new build holds the new build\'s page and scripts',
        says !== null && says.page === BUILDS.new.app && says.app === BUILDS.new.app,
        JSON.stringify(says));

    if (outcome === 'waiting') {
        const after = await takeUpdate(world);
        check('after the banner, the phone runs the new build',
            after.script === BUILDS.new.app && after.meta === BUILDS.new.app,
            `${after.meta} / ${after.script}`);

        // The other way old bytes reach a new page: a file this build's shelf does not
        // hold, asked of the network by the worker for its own build's window. The probe
        // file is in no shell, the HTTP cache holds the old one, the origin has the new.
        const probe = await world.page.evaluate(() => fetch('./swfresh-late.txt').then(r => r.text()));
        check('a file the shelf does not hold reaches the new page from the origin, not from the HTTP cache',
            probe === 'new', JSON.stringify(probe));
    } else {
        check('after the banner, the phone runs the new build', false, 'nothing was waiting');
        check('a file the shelf does not hold reaches the new page from the origin, not from the HTTP cache',
            false, 'nothing was waiting');
    }

    await world.close();
}

// ---------------------------------------------------------------- 2. the mixed shelf
{
    suite('a deploy inside the ten minutes: some files fresh, some already spent');

    // What a CDN's Age header leaves a browser: each file its own remaining lifetime.
    // Two scripts and a stylesheet have none left; everything else has ten minutes.
    const SPENT = ['/js/ui/dom.js', '/js/dates.js', '/css/design.css'];
    const world = await origin(path => (SPENT.indexOf(path) !== -1 || path === '/sw.js' ? 0 : 600));
    await runOld(world);
    await world.deployNew();
    const deployed = await world.deployed();

    const outcome = await updateCheck(world);
    check('the new worker installs and waits', outcome === 'waiting', outcome);

    const sums = await shelfSums(world, BUILDS.new.cache);
    holdToDeploy('every file on the new shelf is the NEW build\'s bytes', sums, deployed);

    // Said separately because it is the sharper sentence: not "stale", but two builds on
    // one shelf.
    const fromOld = sums === null ? [] : shell.filter(url =>
        sums[url] !== null && sums[url] !== deployed[url]
        && sums[url] === sha(world.previous.get(url === './' ? '/' : '/' + fileOf(url))));
    const fromNew = sums === null ? [] : shell.filter(url => sums[url] === deployed[url]);
    check('the shelf is one build, not two',
        sums !== null && fromOld.length === 0 && fromNew.length === shell.length,
        `${fromNew.length} of the new build, ${fromOld.length} of the old`);

    if (outcome === 'waiting') {
        const after = await takeUpdate(world);
        check('after the banner, the phone runs the new build',
            after.script === BUILDS.new.app && after.meta === BUILDS.new.app,
            `${after.meta} / ${after.script}`);
    } else {
        check('after the banner, the phone runs the new build', false, 'nothing was waiting');
    }

    await world.close();
}

// ---------------------------------------------------------------- 3. the origin behind
{
    suite('the origin itself is behind: a new sw.js over the old page and the old app.js');

    // Nothing here is the HTTP cache: every file is answered max-age=0. The ORIGIN hands
    // out the last build's page and app.js while sw.js is already the new one - a CDN
    // partway through a deploy. Every file downloads and nothing is missing.
    const world = await origin(() => 0);
    await runOld(world);
    await world.deployNew();
    const deployed = await world.deployed();
    ['/', '/index.html', '/js/app.js'].forEach(path => world.behind.add(path));

    const first = await updateCheck(world);
    check('the install fails: nothing is offered', first === 'failed', first);
    check('the shelf of the new build is not called complete',
        (await shelfState(world, BUILDS.new.cache)) !== 'complete',
        String(await shelfState(world, BUILDS.new.cache)));
    const still = await world.page.evaluate(() => fetch('./js/app.js').then(r => r.text())
        .then(text => (text.match(/APP_VERSION = '([^']*)'/) || [])[1]));
    check('the old build goes on serving its own scripts',
        still === BUILDS.old.app, String(still));
    const oldSums = await shelfSums(world, BUILDS.old.cache);
    const oldWhole = oldSums !== null && shell.every(url =>
        oldSums[url] === sha(world.previous.get(url === './' ? '/' : '/' + fileOf(url))));
    check('and its shelf is whole and untouched', oldWhole);

    // The origin catches up, and the next check - the next return to the foreground -
    // installs the build whole.
    world.behind.clear();
    const second = await updateCheck(world);
    check('when the origin has caught up, the next check installs it', second === 'waiting', second);
    holdToDeploy('and every file on the new shelf is the NEW build\'s bytes',
        await shelfSums(world, BUILDS.new.cache), deployed);
    check('and the shelf is called complete',
        (await shelfState(world, BUILDS.new.cache)) === 'complete',
        String(await shelfState(world, BUILDS.new.cache)));

    if (second === 'waiting') {
        const after = await takeUpdate(world);
        check('after the banner, the phone runs the new build',
            after.script === BUILDS.new.app && after.meta === BUILDS.new.app,
            `${after.meta} / ${after.script}`);
    } else {
        check('after the banner, the phone runs the new build', false, 'nothing was waiting');
    }

    await world.close();
}

report();
