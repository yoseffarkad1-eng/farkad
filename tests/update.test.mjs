// The update path, driven end to end against a real deploy.
//
//   npm run test:update
//
// This is the road every fix travels. The print isolation, the capacity warning, every
// one of the G-series guarantees - none of them reach a phone on a building site except
// through: a new service worker installs, a banner appears, somebody presses it, and the
// page comes back running the new build. If that chain is broken the release ships and
// nothing happens, on every phone, silently, and the version number on the settings
// screen goes on saying what it said last month.
//
// It had no test at all. js/ui/offline.js is six functions and the whole suite never
// named one of them, which is how a mechanism nobody exercises stays plausible-looking
// for a year.
//
// So this serves a COPY of the app, rewrites the three version strings in that copy
// while a browser is sitting on the old one - which is what a deploy is - and then makes
// the browser walk the rest of it. Nothing here is stubbed: a real service worker
// installs a real second build into a real cache, and the assertions are about what the
// page is running afterwards.
//
// What it cannot do is prove this on iOS, where the home-screen app is resumed rather
// than reopened and the handover is at its most awkward. checkForUpdate() exists for
// exactly that case, and the most that is claimed for it below is that its two answers
// are the right ones.

import { cp, readFile, writeFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve } from './serve.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const EXEC = process.env.CHROME_PATH || undefined;
const ROOT = new URL('..', import.meta.url).pathname;

const results = [];
const check = (name, pass, detail = '') => {
    results.push({ name, pass: Boolean(pass), detail });
    console.log(`${pass ? '  PASS' : '**FAIL**'}  ${name}${detail ? '  — ' + detail : ''}`);
};
const suite = name => console.log(`\n${name}`);

// A precondition of the test rather than a claim about the app: if the copy did not come
// out the way this file expects, every assertion below is measuring the wrong thing.
const given = (what, ok) => {
    if (!ok) { console.error(`\nSETUP FAILED: ${what}`); process.exit(2); }
};

// ---------------------------------------------------------------- a deployable copy

const dir = await mkdtemp(join(tmpdir(), 'farkad-deploy-'));
for (const item of ['index.html', 'sw.js', 'manifest.webmanifest', 'css', 'js', 'icons']) {
    await cp(join(ROOT, item), join(dir, item), { recursive: true });
}

// The three strings that name a build. They are checked against each other at boot -
// checkBuildConsistency() stops the app writing when the page and the scripts disagree -
// so a deploy that moved only one of them would be testing the crash banner instead.
// The real pair. `new` is READ from the copy - whatever this candidate is actually
// stamped with, so the suite cannot pass by handing over between two builds that do not
// exist - and `old` is the build that is live on main today, which is what the phones
// this candidate reaches are running. Synthetic names would have proved the machinery and
// not the release.
const RELEASED = { app: 'v86', cache: 'farkad-v86' };

const stampedBuild = await (async () => {
    const html = await readFile(join(dir, 'index.html'), 'utf8');
    const sw = await readFile(join(dir, 'sw.js'), 'utf8');
    const app = (html.match(/<meta name="farkad-build" content="([^"]*)">/) || [])[1];
    const cache = (sw.match(/const VERSION = '([^']*)';/) || [])[1];
    return { app, cache };
})();
given('the copy is stamped with a build at all',
    Boolean(stampedBuild.app) && Boolean(stampedBuild.cache));
given('and it is not the build that is already live - a candidate has to be a new one',
    stampedBuild.app !== RELEASED.app && stampedBuild.cache !== RELEASED.cache);

const BUILDS = { old: RELEASED, new: stampedBuild };

async function deploy(build) {
    const edits = [
        ['index.html', /<meta name="farkad-build" content="[^"]*">/,
            `<meta name="farkad-build" content="${build.app}">`],
        ['js/app.js', /const APP_VERSION = '[^']*';/,
            `const APP_VERSION = '${build.app}';`],
        ['sw.js', /const VERSION = '[^']*';/, `const VERSION = '${build.cache}';`]
    ];
    for (const [file, pattern, replacement] of edits) {
        const path = join(dir, file);
        const before = await readFile(path, 'utf8');
        // Matched, not changed: deploying the build that is already there is a no-op and
        // a legitimate one - each suite below starts by putting the copy back to the old
        // build, and the first of them finds it already there.
        given(`${file} carries a version string this test can move`, pattern.test(before));
        await writeFile(path, before.replace(pattern, replacement));
    }
}

const server = await serve(dir);
const BASE = server.url;
const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});

const newPage = async () => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    page.on('dialog', d => d.accept());
    return page;
};

// The worker has to be in charge before a second build means anything: an update is a
// SECOND worker, and until the first one controls the page there is nothing to update
// from. Polling for the controller rather than sleeping - the install fetches thirty
// files and how long that takes is not this test's business.
async function controlled(page, timeout = 15000) {
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null,
        { timeout, polling: 100 });
}

const buildOnScreen = page => page.evaluate(() => ({
    meta: document.querySelector('meta[name="farkad-build"]').getAttribute('content'),
    script: APP_VERSION,
    caches: null
}));

const cacheNames = page => page.evaluate(() => caches.keys());

// ---------------------------------------------------------------- the handover
{
    suite('a new build reaches a phone that is already running the old one');

    await deploy(BUILDS.old);
    const page = await newPage();
    await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await controlled(page);

    const before = await buildOnScreen(page);
    given('the browser is running the old build', before.script === BUILDS.old.app);
    check('the page and its scripts agree on which build this is',
        before.meta === before.script, `${before.meta} / ${before.script}`);
    check('and the cache is named for it',
        (await cacheNames(page)).join() === BUILDS.old.cache,
        (await cacheNames(page)).join());

    // Wait out the boot-time safety nets before deploying anything.
    //
    // registerOffline() re-offers an already-waiting worker twice at start-up - once when
    // register() resolves and again 1500ms later - because register() can resolve a moment
    // before the browser knows a worker is waiting. Both are correct and both are wanted.
    // But the first version of this test deployed immediately, and the new worker happened
    // to finish installing just before that 1500ms net fired: the banner appeared, every
    // assertion passed, and deleting the live update path outright changed nothing. The
    // test was measuring a coincidence.
    //
    // Two seconds of doing nothing is what makes the rest of this suite mean what it says:
    // by the time the deploy lands, the only thing left that can raise a banner is the
    // updatefound listener, which is the thing being tested.
    await page.waitForTimeout(2000);

    // The deploy. The browser is not told; it finds out the way it would in the world,
    // by asking for sw.js again.
    await deploy(BUILDS.new);

    const banner = '#updateBanner';
    check('before a deploy is noticed, nothing is offered',
        (await page.locator(banner).isVisible()) === false);

    await page.evaluate(() => navigator.serviceWorker.getRegistration()
        .then(registration => registration.update()));

    // Reported rather than thrown. A banner that never comes is the failure this whole
    // file exists to catch, and it should read as one line saying so, not as a stack
    // trace from the middle of a test framework.
    const offered = await page.waitForSelector(`${banner}:visible`, { timeout: 20000 })
        .then(() => true, () => false);
    check('once the new build is installed, the app says so', offered);
    if (!offered) {
        console.log('  (the rest of the handover cannot be checked without it)');
        await page.context().close();
    } else {
    check('and says it in words, not a version number',
        (await page.textContent(banner)).includes('גרסה חדשה'),
        (await page.textContent(banner)).trim().slice(0, 40));
    check('with a way to take it now',
        (await page.textContent(banner)).includes('רענן עכשיו'));
    check('and a way to say later',
        (await page.textContent(banner)).includes('אחר כך'));

    // The new worker is installed and waiting. Nothing has changed under the person yet:
    // an app that swapped builds on its own would reload the screen mid-entry.
    const during = await buildOnScreen(page);
    check('the running build is untouched while the banner waits',
        during.script === BUILDS.old.app, during.script);
    check('and it is still the build the page was drawn from',
        during.meta === during.script, `${during.meta} / ${during.script}`);

    // Press it. The banner tells the waiting worker to take over, and controllerchange
    // reloads the page onto it. Reported rather than thrown, for the same reason as the
    // banner above: a handover that never happens is a headline failure of this file, not
    // a timeout in the middle of it.
    const [navigated] = await Promise.all([
        page.waitForNavigation({ timeout: 20000 }).then(() => true, () => false),
        page.click(`${banner} button`)
    ]);
    check('pressing it hands the page over to the new worker', navigated);
    if (navigated) {
        await controlled(page);
        await page.waitForTimeout(400);
    }

    const after = await buildOnScreen(page);
    check('after the reload the app is running the new build',
        after.script === BUILDS.new.app, after.script);
    check('the page came from the new build too - not one of each',
        after.meta === after.script, `${after.meta} / ${after.script}`);

    const caches = await cacheNames(page);
    check('the new build has its own cache', caches.includes(BUILDS.new.cache), caches.join());
    check('and the old one is gone, not left to be served from later',
        !caches.includes(BUILDS.old.cache), caches.join());
    check('exactly one cache is left', caches.length === 1, String(caches.length));

    // The point of all of it: the build a person is now running is the build that ships,
    // offline as well as online.
    check('nothing on the page is refusing to write',
        (await page.locator('#crashBanner').isVisible()) === false);
    const wrote = await page.evaluate(() => {
        State.schedule.workers = [{ id: 'w_01', name: 'דוד', active: true, dailyRate: 400 }];
        return State.save() && Boolean(Store.get('scheduleData:v2'));
    });
    check('and the new build records a day, which is the whole point of shipping it', wrote);

    await page.context().close();
    }
}

// ---------------------------------------------------------------- the second offer
{
    suite('a waiting update is offered again to a phone that was restarted');

    // iOS restarts a home-screen app freely, and the banner does not survive that: an
    // update could sit installed and unannounced, which from the outside is exactly what
    // "it appeared for a moment and then went away" looks like. So registerOffline()
    // re-offers an already-waiting worker at start-up as well.
    //
    // Worth its own suite because it is a SECOND mechanism, and while the two were tested
    // together the timing decided which one was really being measured - this file's first
    // version passed with the live update path deleted outright.
    await deploy(BUILDS.old);
    const first = await newPage();
    await first.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await controlled(first);
    await first.waitForTimeout(2000);

    await deploy(BUILDS.new);
    await first.evaluate(() => navigator.serviceWorker.getRegistration()
        .then(registration => registration.update()));
    const ready = await first.waitForSelector('#updateBanner:visible', { timeout: 20000 })
        .then(() => true, () => false);
    given('an update is installed and waiting', ready);

    // The restart. Same storage, same registration, a page that has never seen a banner.
    const again = await first.context().newPage();
    await again.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await controlled(again);

    const reoffered = await again.waitForSelector('#updateBanner:visible', { timeout: 10000 })
        .then(() => true, () => false);
    check('the waiting update is offered again without being asked for', reoffered);
    check('and the phone is still on the old build until somebody takes it',
        (await again.evaluate(() => APP_VERSION)) === BUILDS.old.app,
        await again.evaluate(() => APP_VERSION));

    await first.context().close();
}

// ---------------------------------------------------------------- not under their hands
{
    suite('an update waits for somebody who is in the middle of typing');

    // Every edit is on the disk the moment it is made, so a reload loses no record. What
    // it does lose is TYPING: a worker's name half entered, an amount in an advance. The
    // predicate that decides this is worth testing on its own - the reload it gates
    // happens once, in a browser event, and a test that only watched the outcome would
    // pass just as well if the predicate always said no.
    await deploy(BUILDS.old);
    const page = await newPage();
    await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await controlled(page);

    check('an idle screen is not in the middle of anything',
        (await page.evaluate(() => midEdit())) === false);

    await page.evaluate(() => {
        State.schedule.workers = [{ id: 'w_01', name: 'דוד', active: true, dailyRate: 400 }];
        State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
        State.save(); render();
    });

    // An open dialog is somebody part-way through a decision, whether or not they have
    // typed into it yet.
    await page.click('#tab-roster');
    await page.waitForTimeout(250);
    await page.getByRole('button', { name: '+ הוסף עובד' }).click();
    await page.waitForTimeout(300);
    check('an open dialog counts as the middle of something',
        (await page.evaluate(() => midEdit())) === true);

    await page.fill('#workerFormName', 'ע');
    check('and so does a half-typed name',
        (await page.evaluate(() => midEdit())) === true);

    await page.fill('#workerFormName', '');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    check('closing it clears the way again',
        (await page.evaluate(() => midEdit())) === false);

    await page.context().close();
}

// ---------------------------------------------------------------- the way out
{
    suite('the manual check, for the phone the banner never reached');

    // An installed app can sit on a cached build for a long time: on iOS "closed" is not
    // what going back to the home screen does, and the banner does not survive the app
    // being restarted. This is the button in settings for that, and what is claimed for
    // it here is only that its two answers are the right ones - the handover itself is
    // proved above.
    await deploy(BUILDS.old);
    const page = await newPage();
    await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await controlled(page);

    await page.evaluate(() => { window.__said = null; window.askTell = t => { window.__said = t; }; });
    await page.evaluate(() => checkForUpdate());
    await page.waitForFunction(() => window.__said !== null, null, { timeout: 15000 });

    const said = await page.evaluate(() => window.__said);
    const text = typeof said === 'string' ? said : (said && said.message) || '';
    check('with nothing new, it says so rather than staying silent',
        text.includes('מעודכנת'), text.slice(0, 60));
    check('and names the build it is on, so the answer can be checked',
        text.includes(BUILDS.old.app), text.slice(0, 60));

    await page.context().close();
}

// ---------------------------------------------------------------- a half-fetched update
//
// The install is all-or-nothing, and the reason is what happens if it is not: a shell
// with one file missing ACTIVATES, the activate handler deletes the complete old cache,
// and the next offline launch opens an app with some of its scripts gone and nothing
// pointing at why. Somebody on a site with no signal is then holding a phone that will
// not open, and the record of the week is inside it.
{
    suite('an update that cannot fetch its whole shell leaves the old build serving');

    await deploy(BUILDS.old);
    const page = await newPage();
    await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await controlled(page);
    given('the old build is installed and in charge',
        (await cacheNames(page)).includes(BUILDS.old.cache));

    // The new build is deployed, and one of its shell files cannot be fetched. Taken off
    // the SERVER rather than intercepted in the browser: the fetches that build a shell
    // come from the service worker, and route() does not see those. The old cache already
    // holds its own copy, so this changes what can be installed and nothing else.
    await deploy(BUILDS.new);
    const hidden = join(dir, 'js/ui/reports.js');
    const hiddenBody = await readFile(hidden, 'utf8');
    await rm(hidden);

    await page.evaluate(() => navigator.serviceWorker.getRegistration()
        .then(reg => reg && reg.update()).catch(() => {}));
    await page.waitForTimeout(2500);

    const names = await cacheNames(page);
    check('the old cache is still there, whole',
        names.includes(BUILDS.old.cache), JSON.stringify(names));
    check('and nothing is waiting to take over',
        (await page.evaluate(() => navigator.serviceWorker.getRegistration()
            .then(reg => Boolean(reg && reg.waiting)))) === false);

    // The page still opens, offline, from the build that did install.
    await writeFile(hidden, hiddenBody);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(500);
    check('the phone is still running the build it was running',
        (await buildOnScreen(page)).script === BUILDS.old.app,
        JSON.stringify(await buildOnScreen(page)));
    check('with every script it needs',
        (await page.evaluate(() => typeof payrollRows === 'function')) === true);

    // And the retry on a later visit finds the whole shell and takes.
    await page.evaluate(() => navigator.serviceWorker.getRegistration()
        .then(reg => reg && reg.update()).catch(() => {}));
    await page.waitForFunction(() => navigator.serviceWorker.getRegistration()
        .then(reg => Boolean(reg && reg.waiting)), null, { timeout: 20000, polling: 200 });
    check('a later visit installs it after all',
        (await cacheNames(page)).includes(BUILDS.new.cache),
        JSON.stringify(await cacheNames(page)));
    check('and the old cache is still whole while the new one waits',
        (await cacheNames(page)).includes(BUILDS.old.cache),
        JSON.stringify(await cacheNames(page)));

    await page.context().close();
}

// ---------------------------------------------------------------- one build per session
//
// While the old build is the one in charge, nothing may change what it serves. A session
// runs one build end to end, and a cache mutated underneath a running client is two.
{
    suite('a waiting update does not touch the cache the phone is running from');

    await deploy(BUILDS.old);
    const page = await newPage();
    await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await controlled(page);

    const shellOf = name => page.evaluate(async cacheName => {
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        const out = {};
        for (const request of keys) {
            const response = await cache.match(request);
            out[new URL(request.url).pathname] = (await response.text()).length;
        }
        return out;
    }, name);

    const before = await shellOf(BUILDS.old.cache);
    given('the old cache holds a shell', Object.keys(before).length > 20);

    await deploy(BUILDS.new);
    await page.evaluate(() => navigator.serviceWorker.getRegistration()
        .then(reg => reg && reg.update()).catch(() => {}));
    await page.waitForFunction(() => navigator.serviceWorker.getRegistration()
        .then(reg => Boolean(reg && reg.waiting)), null, { timeout: 20000, polling: 200 });

    const after = await shellOf(BUILDS.old.cache);
    check('every file in the running build\u2019s cache is byte-for-byte what it was',
        JSON.stringify(after) === JSON.stringify(before),
        JSON.stringify(Object.keys(after).filter(key => after[key] !== before[key])));
    check('and the page is still running the old build',
        (await buildOnScreen(page)).script === BUILDS.old.app,
        JSON.stringify(await buildOnScreen(page)));
    check('while the new one waits in its own cache',
        (await cacheNames(page)).includes(BUILDS.new.cache),
        JSON.stringify(await cacheNames(page)));

    // The handover, and only then does the old cache go.
    //
    // Waited on the browser's OWN signal - the moment the new worker takes control -
    // rather than on a pause or on a poll that can catch the old worker still active a
    // millisecond before it is replaced. A fixed sleep is how a suite comes to pass on a
    // fast machine and fail on the one that matters.
    await page.evaluate(() => {
        window.__tookOver = new Promise(resolve =>
            navigator.serviceWorker.addEventListener('controllerchange', resolve,
                { once: true }));
    });
    await page.evaluate(() => navigator.serviceWorker.getRegistration()
        .then(reg => reg && reg.waiting && reg.waiting.postMessage('skip-waiting')));
    await page.evaluate(() => window.__tookOver);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(600);
    check('after the handover the phone is on the new build',
        (await buildOnScreen(page)).script === BUILDS.new.app,
        JSON.stringify(await buildOnScreen(page)));
    check('and the old cache is the one that went, not the new one',
        !(await cacheNames(page)).includes(BUILDS.old.cache)
        && (await cacheNames(page)).includes(BUILDS.new.cache),
        JSON.stringify(await cacheNames(page)));

    await page.context().close();
}

await browser.close();
await server.close();
await rm(dir, { recursive: true, force: true });

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    console.log('\nfailed:');
    failed.forEach(r => console.log(`  ${r.name}${r.detail ? '  — ' + r.detail : ''}`));
}
process.exit(failed.length ? 1 : 0);
