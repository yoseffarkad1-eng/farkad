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
import { deployedFrom } from './shell.mjs';

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

// What to copy is read off the shell rather than listed - see tests/shell.mjs for the
// stale list that made this suite fail on a timeout naming neither the file nor the
// reason.
for (const item of await deployedFrom(ROOT)) {
    await cp(join(ROOT, item), join(dir, item), { recursive: true });
}

// The three strings that name a build. They are checked against each other at boot -
// checkBuildConsistency() stops the app writing when the page and the scripts disagree -
// so a deploy that moved only one of them would be testing the crash banner instead.
const BUILDS = {
    old: { app: 'v79', cache: 'farkad-v79' },
    new: { app: 'v79-deploy-test', cache: 'farkad-v79-deploy-test' }
};

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

// The SHELVES. farkad-clients is not one: it holds which window is running which build -
// the record a worker restart used to lose, after which this build's own window was
// served the oldest shelf on the device. It is never reaped as a shelf and never served
// out of as one, and tests/build.test.mjs pins both.
// The BUILD SHELVES. Two caches are bookkeeping and are not shelves: farkad-clients holds
// which window is running which build, farkad-shelves holds each shelf's lifecycle state,
// which build is active, and the per-build asset manifests. Neither is ever served out of
// as a shelf and neither is reaped as one, so neither belongs in a count of shelves.
const cacheNames = page => page.evaluate(() =>
    caches.keys().then(keys => keys.filter(key =>
        key !== 'farkad-clients' && key !== 'farkad-shelves')));
const allCacheNames = page => page.evaluate(() => caches.keys());

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
    check('exactly one shelf is left', caches.length === 1, String(caches.length));
    check('and beside it, the record of which window is running what',
        (await allCacheNames(page)).includes('farkad-clients'),
        (await allCacheNames(page)).join());

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

// ---------------------------------------------------- the window nobody pressed anything in
{
    suite('the other window of the app catches up when the typing is over');

    // clients.claim() takes over EVERY window of the origin, so a person with the app
    // open twice - the day screen on one, the roster on the other - has a second window
    // running the old page under the new build's worker the moment the first one crosses.
    // sw.js keeps serving that window its OWN build's bytes for as long as it is there
    // (tests/handover.test.mjs measures that against two real trees), and this is the
    // other half: the window does not stay half-and-half for the rest of the evening. It
    // reloads itself at the first moment that costs nobody anything - and NOT before,
    // which is the half that has to be observed rather than assumed.
    await deploy(BUILDS.old);
    const asking = await newPage();
    await asking.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await controlled(asking);

    const typing = await asking.context().newPage();
    typing.on('dialog', d => d.accept());
    await typing.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await controlled(typing);
    given('both windows are running the old build',
        (await buildOnScreen(asking)).script === BUILDS.old.app
        && (await buildOnScreen(typing)).script === BUILDS.old.app);

    // Somebody part-way through entering a name, which is the ordinary state on a site.
    await typing.bringToFront();
    await typing.click('#tab-roster');
    await typing.waitForTimeout(250);
    await typing.getByRole('button', { name: '+ הוסף עובד' }).click();
    await typing.fill('#workerFormName', 'אבו פרקד');
    given('the second window is genuinely mid-edit',
        (await typing.evaluate(() => midEdit())) === true);

    await asking.waitForTimeout(2000);
    await deploy(BUILDS.new);
    await asking.bringToFront();
    await asking.evaluate(() => navigator.serviceWorker.getRegistration()
        .then(registration => registration.update()));
    await asking.waitForSelector('#updateBanner:visible', { timeout: 25000 });
    await Promise.all([
        asking.waitForNavigation({ timeout: 25000 }),
        asking.getByRole('button', { name: 'רענן עכשיו' }).click()
    ]);
    await controlled(asking);
    given('the window that asked crossed',
        (await buildOnScreen(asking)).script === BUILDS.new.app);

    check('the window in the middle of typing was not reloaded under their hands',
        (await buildOnScreen(typing)).script === BUILDS.old.app,
        (await buildOnScreen(typing)).script);
    check('and the half-entered name is still in the field',
        (await typing.inputValue('#workerFormName')) === 'אבו פרקד',
        await typing.inputValue('#workerFormName'));

    await typing.fill('#workerFormName', '');
    await typing.keyboard.press('Escape');
    await typing.waitForTimeout(300);
    // Read tolerantly, because the thing being waited for can arrive DURING the read.
    // catchUpWhenSafe polls every 500ms, and the reload it eventually fires destroys the
    // execution context this evaluate is running in - which used to take the whole suite
    // down with an "Execution context was destroyed" from the middle of a precondition,
    // intermittently, on a run where the app had done exactly the right thing. A
    // destroyed context here is not an unknown: the only thing that reloads this window
    // is the catch-up, and the catch-up only fires when midEdit() is already false.
    const stillTyping = await typing.evaluate(() => midEdit()).catch(() => 'already caught up');
    given('the edit is over and a reload would cost nothing',
        stillTyping === false || stillTyping === 'already caught up', String(stillTyping));

    const caught = await typing.waitForFunction(
        expected => typeof APP_VERSION === 'string' && APP_VERSION === expected,
        BUILDS.new.app, { timeout: 15000, polling: 250 }).then(() => true, () => false);
    check('once the typing is finished it catches up to its worker\'s build',
        caught, (await buildOnScreen(typing)).script);
    check('and the old build\'s cache goes once nothing is running it',
        !(await cacheNames(typing)).includes(BUILDS.old.cache),
        (await cacheNames(typing)).join());

    await asking.context().close();
}

// ------------------------------------------- the only window, and nobody pressing anything
{
    suite('the one window on the phone is never reloaded without being asked');

    // THE SHAPE THE FIELD IS ACTUALLY IN. The suite above is two windows: one person
    // presses, the OTHER window is claimed out from under itself and catches up at the
    // first safe moment. That is law 7, and it is measured. A phone is not that. An
    // installed app on a home screen is ONE window, nobody else presses anything, and
    // there is no claim - the new worker installs, waits, and waits.
    //
    // This matters because docs/rollout-checklist.md tells Yusuf, in the list of things
    // that need not worry him: «وإذا ما ضغطت، بيحدّث حاله أول لحظة ما حدا يكون عم يكتب» -
    // if you do not press it, it updates itself at the first moment nobody is typing.
    // That sentence is true of the OTHER window and of nothing else. On the one window in
    // front of him, pressing «אחר כך» is a decision the app then keeps: no reload comes,
    // at any moment, typing or not.
    //
    // Which of the two is right is not a close call. Reloading the only window somebody is
    // looking at, because a timer decided they had stopped typing, is precisely what the
    // first paragraph of js/ui/offline.js refuses to do, and this app's whole subject is a
    // financial record being entered by hand. The code is right and the document overstates
    // it. What the document should say is measured at the foot of this suite: the update
    // lands when the app is fully closed and opened again, which is the thing a person on a
    // phone can actually do.
    await deploy(BUILDS.old);
    const alone = await newPage();
    await alone.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await controlled(alone);
    await alone.waitForTimeout(2000);

    await deploy(BUILDS.new);
    await alone.evaluate(() => navigator.serviceWorker.getRegistration()
        .then(registration => registration.update()));
    const offered = await alone.waitForSelector('#updateBanner:visible', { timeout: 25000 })
        .then(() => true, () => false);
    given('the update is installed and offered', offered);

    // «אחר כך». The banner goes; the update stays waiting.
    await alone.getByRole('button', { name: 'אחר כך' }).click();
    await alone.waitForTimeout(300);
    check('saying "later" takes the banner off the screen',
        (await alone.locator('#updateBanner').isVisible()) === false);
    check('and leaves the update waiting rather than throwing it away',
        (await alone.evaluate(() => navigator.serviceWorker.getRegistration()
            .then(registration => Boolean(registration.waiting)))) === true);

    // A mark on THIS window. A reload takes it with it, so its survival is the proof -
    // not a version string, which would read the same either way if the reload happened
    // to land on the same build.
    await alone.evaluate(() => { window.__thisWindow = 'not reloaded'; });
    const idle = await alone.evaluate(() => midEdit());
    given('nobody is typing, so nothing is standing in a reload\'s way', idle === false);

    // Long enough to have happened. catchUpWhenSafe polls every 500ms; ten seconds is
    // twenty chances for a reload that is not coming.
    await alone.waitForTimeout(10000);
    check('and then nothing happens: ten idle seconds later it is the same window',
        (await alone.evaluate(() => window.__thisWindow === 'not reloaded')) === true);
    check('still running the build the person chose to stay on',
        (await alone.evaluate(() => APP_VERSION)) === BUILDS.old.app,
        await alone.evaluate(() => APP_VERSION));
    check('and the day screen is still theirs, not a fresh one',
        (await alone.evaluate(() => document.getElementById('dayView').children.length)) > 0);

    // The offer comes back on the next return to the foreground, which is how it reaches
    // somebody who said "later" and meant "not now" rather than "never" - an installed app
    // on a phone is resumed, not reopened, and a banner does not survive that.
    //
    // THE EVENT IS SYNTHESISED, and that is a limit of the harness rather than a choice.
    // Measured: in headless Chromium every page of a context stays visibilityState
    // 'visible', and bringToFront moves nothing - a page sent behind another and brought
    // back records no visibilitychange at all. So the browser cannot be made to produce
    // this event here. What IS real is everything the event reaches: the listener
    // registerOffline() installed, the registration it closes over, its waiting worker,
    // and showUpdateBanner drawing the banner out of them. Only the tap on the app icon is
    // pretended.
    given('the page is in the state the listener requires',
        (await alone.evaluate(() => document.visibilityState)) === 'visible');
    await alone.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    const returned = await alone.waitForSelector('#updateBanner:visible', { timeout: 15000 })
        .then(() => true, () => false);
    check('coming back to the foreground offers the waiting update again', returned);

    // AND THE WAY IT ACTUALLY LANDS ON A PHONE. Not a timer: the app is closed - properly
    // closed, every window - and opened again. With no client left, the waiting worker
    // activates, and the next launch is the new build from its first byte.
    const context = alone.context();
    await alone.close();
    await new Promise(resolve => setTimeout(resolve, 1500));
    const reopened = await context.newPage();
    reopened.on('dialog', d => d.accept());
    await reopened.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await controlled(reopened);
    await reopened.waitForTimeout(400);
    const relaunched = await buildOnScreen(reopened);
    check('closing the app and opening it again lands on the new build',
        relaunched.script === BUILDS.new.app, relaunched.script);
    check('page and scripts from the same build, as always',
        relaunched.meta === relaunched.script,
        `${relaunched.meta} / ${relaunched.script}`);

    await context.close();
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
