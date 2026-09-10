// The white screen at six in the morning.
//
//   node tests/startup.blank.test.mjs
//
// Every other suite in this repository asks whether the app is RIGHT. This one asks
// whether it is THERE. The failure it hunts has no stack trace and no banner of its own:
// a phone is taken out of a pocket on a building site, the icon is pressed, and nothing
// appears. A fortnight of records is on the disk, intact, behind a white page - and the
// person has no way to tell that from a fortnight that is gone.
//
// Four things can produce it, and each one is a scenario below:
//
//   - something outside this origin is between the person and the first render. Not
//     "fails" - HANGS. One bar of signal does not refuse a request, it holds it open, and
//     an app that waits for window.onload waits for ever. That is the bug this app was
//     rebuilt around (js/app.js, boot()); this measures that it stayed fixed, with a
//     promise that genuinely never settles.
//   - a script the page needs did not arrive at all: a deploy mid-flight, a truncated
//     response, a cache that lost an entry. The scripts after it run, or do not, and the
//     app either half-boots or does not boot.
//   - a script arrived and would not parse.
//   - js/app.js itself failed, so nothing calls render() and no handler is installed.
//
// In three of those four the app's OWN error reporting is part of what broke. So what is
// asserted here is the STATIC diagnostic: the sentence is written into index.html, ahead
// of the first <script src>, and the only thing the sentinel does is find one element by
// id and show it. A diagnostic that needs the broken file to run is not a diagnostic, and
// the checks below are written to fail if it ever becomes one.
//
// Nothing here is stubbed and nothing is mocked: a real Chromium, a real origin, and the
// breakage applied at the origin so the browser meets it exactly as a phone would.

import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, extname } from 'node:path';
import { suite, check, given, report } from './runner.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const EXEC = process.env.CHROME_PATH || undefined;
const ROOT = new URL('..', import.meta.url).pathname;

// THE SENTENCE. Pinned verbatim, because it is the whole of what a person gets on the
// worst morning this app has: it says the app did not finish loading, that what is
// already on the phone was not harmed and not deleted, and what to do. Every clause is
// load-bearing and none of it may drift without somebody deciding to change it.
const BOOT_SENTENCE = '⚠️ האפליקציה לא נטענה במלואה. מה שכבר נשמר במכשיר לא נפגע ולא נמחק'
    + ' - רענן את הדף. אם זה חוזר, נסה שוב כשיש חיבור טוב יותר.';
const BOOT_BUTTON = 'רענן';
// What the sentinel appends when the failure is a file that did not arrive.
const NOT_LOADED = 'לא נטען';

// ---------------------------------------------------------------- the origin
//
// A server over this checkout with one extra power: it can BREAK a path, in the three
// shapes a phone actually meets. 'missing' is the deploy that half-landed and the cache
// that lost an entry; 'syntax' is the file that arrived corrupt; 'throw' is the file that
// arrived whole and died the moment it ran.
//
// The breakage is at the origin rather than in the page, because a page that has to
// cooperate with the test is a page that is still working - and the entire question here
// is what happens when it is not.

const TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png'
};

const broken = new Map();

// Deliberately unparseable, and deliberately not clever: an unclosed brace after a
// keyword is a SyntaxError in every engine, thrown at COMPILE time, which is the case
// that matters - the script never runs at all, so nothing inside it can report itself.
const SYNTAX_ERROR_BODY = 'function farkadBrokenOnPurpose( { \n';
const THROW_BODY = "throw new Error('farkad-test: this script died as it ran');\n";

function origin() {
    const sockets = new Set();
    const server = createServer((request, response) => {
        const path = decodeURIComponent(new URL(request.url, 'http://x').pathname);

        // Somewhere on this origin to stand while localStorage is seeded, that is not the
        // app. Loading the app to seed it would register the service worker, and from
        // then on the origin cannot break anything: the shelf answers first, which is the
        // whole point of the shelf and the opposite of what these scenarios need.
        if (path === '/__seed.html') {
            response.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' });
            response.end('<!doctype html><html lang="he"><meta charset="utf-8"><body>seed</body></html>');
            return;
        }

        const how = broken.get(path);
        if (how === 'missing') { response.writeHead(404).end('not found'); return; }
        if (how === 'syntax' || how === 'throw') {
            response.writeHead(200, {
                'Content-Type': TYPES['.js'], 'Cache-Control': 'no-store'
            });
            response.end(how === 'syntax' ? SYNTAX_ERROR_BODY : THROW_BODY);
            return;
        }

        const name = path === '/' ? '/index.html' : path;
        const file = join(ROOT, name.replace(/^\/+/, ''));
        if (!file.startsWith(ROOT)) { response.writeHead(403).end('no'); return; }
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
            close: () => new Promise(done => { sockets.forEach(s => s.destroy()); server.close(done); })
        }));
    });
}

const server = await origin();
const BASE = server.url;
const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});

// A phone: its own context, so its own disk and its own service worker registry. Nothing
// carries between scenarios, which matters more here than anywhere else - a shelf left
// behind by a previous scenario would serve the file the next one is trying to break.
async function phone() {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    page.on('dialog', d => d.accept());
    return { ctx, page };
}

// A record on the disk, written from somewhere that is NOT the app, before the app is
// ever loaded. Every scenario below that breaks a file plants one of these first, because
// the sentence on the screen makes a promise about it - «מה שכבר נשמר במכשיר לא נפגע ולא
// נמחק» - and a promise nothing checks is a sentence, not a guarantee.
//
// WRITTEN BY THE APP, once, and then replayed as bytes. A record hand-built in this file
// is a record in the shape this file imagines, and State.load is entitled to refuse it -
// at which point every "untouched" check below would be comparing two copies of something
// the app never accepted. So one working phone records one working day through the
// production path, and what it left on the disk is what the broken phones are given.
const PLANTED = await (async () => {
    const { ctx, page } = await phone();
    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof State !== 'undefined' && State.schedule,
        null, { timeout: 15000 });
    await page.evaluate(() => {
        State.schedule.workers = [{ id: 'w_01', name: 'אבו פרקד', idNumber: '', phone: '',
            active: true, dailyRate: 400, hourlyRate: 0 }];
        State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
        State.date = '2026-08-12';
        State.save();
        State.commit(assignPlace(State.schedule, '2026-08-12', 'w_01', 'actual', 'p_01'));
    });
    const record = await page.evaluate(() => localStorage.getItem('scheduleData:v2'));
    await ctx.close();
    return record;
})();

given('a real day was recorded by a working phone, to plant on the broken ones',
    Boolean(PLANTED) && PLANTED.includes('p_01') && PLANTED.includes('2026-08-12'),
    `${(PLANTED || '').length} chars`);

async function plant(page) {
    await page.goto(`${BASE}/__seed.html`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(record => localStorage.setItem('scheduleData:v2', record), PLANTED);
    const stored = await page.evaluate(() => localStorage.getItem('scheduleData:v2'));
    given('the record is on the disk before the app is opened', stored === PLANTED,
        `${(stored || '').length} chars`);
}

async function stillThere(page) {
    return page.evaluate(() => localStorage.getItem('scheduleData:v2'));
}

// What the sentinel put on the screen, read the way a person reads it: the sentence, the
// small detail line under it, and whether the thing is actually drawn rather than merely
// present in the DOM with no height.
async function diagnostic(page) {
    return page.evaluate(() => {
        const host = document.getElementById('bootBanner');
        if (!host) return { there: false };
        const box = host.getBoundingClientRect();
        const first = host.querySelector('span');
        const detail = document.getElementById('bootBannerDetail');
        const button = host.querySelector('button');
        const crash = document.getElementById('crashBanner');
        return {
            there: true,
            shown: getComputedStyle(host).display !== 'none' && box.height > 0 && box.width > 0,
            sentence: first ? first.textContent : '',
            detail: detail ? detail.textContent : '',
            button: button ? button.textContent : '',
            height: Math.round(box.height),
            crashShown: crash ? getComputedStyle(crash).display !== 'none' : false
        };
    });
}

// ---------------------------------------------------------------- what the origin hands out
{
    suite('the diagnostic is in the bytes a phone is handed, before anything runs');

    // The structural version of this - where the element sits, what the sentinel is
    // allowed to call - is in tests/build.test.mjs, which is a file read and runs in
    // npm test on a machine with no browser. This is the other end of the same claim, and
    // the one a file read cannot make: what the ORIGIN actually served, parsed by a real
    // browser, with JavaScript switched off entirely.
    //
    // Off, and not merely broken. It is the strongest available statement of "this needs
    // no script to exist": not one line of this app ran, and the sentence is in the
    // document the browser built. All any script ever does is take the `display:none` off.
    const bytes = await fetch(`${BASE}/index.html`).then(response => response.text());
    check('the origin serves the sentence as part of the page',
        bytes.includes(BOOT_SENTENCE), `${bytes.length} bytes`);

    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    // Proved by what is NOT there rather than by asking the browser: the page's own
    // inline sentinel defines window.farkadBootSentinel, and js/app.js defines
    // APP_VERSION. Neither exists, so neither script ran.
    const ran = await page.evaluate(() => ({
        sentinel: typeof window.farkadBootSentinel,
        app: typeof window.APP_VERSION
    }));
    given('not one script on the page ran',
        ran.sentinel === 'undefined' && ran.app === 'undefined', JSON.stringify(ran));

    const inDocument = await page.locator('#bootBanner > span').first().textContent();
    check('and a browser running no JavaScript at all still has it in the document',
        inDocument === BOOT_SENTENCE, inDocument);
    check('the button beside it is in the document too, not built later',
        (await page.locator('#bootBanner button').first().textContent()) === BOOT_BUTTON);
    check('the detail line is there, empty, waiting to be filled',
        (await page.locator('#bootBannerDetail').textContent()) === '');
    // Hidden, because a diagnostic on a page that is working is a false alarm. The
    // sentinel takes the inline style off; that is the whole of the revealing.
    check('and it is hidden until something reveals it',
        (await page.locator('#bootBanner').isVisible()) === false);

    await ctx.close();
}

// ---------------------------------------------------------------- the network that never answers
{
    suite('the record opens and takes a new day while the network answers nothing');

    // HANGING, not failing. A route handler that is never resolved is a request that is
    // never answered and never refused - which is what one bar of signal in a stairwell
    // actually does, and the reason `load` was the wrong event to boot on.
    const { ctx, page } = await phone();
    const held = { gstatic: 0, cdnjs: 0, other: 0 };
    await ctx.route(url => /(^|\.)gstatic\.com$/.test(url.hostname), () => { held.gstatic++; });
    await ctx.route(url => /cdnjs\.cloudflare\.com$/.test(url.hostname), () => { held.cdnjs++; });
    await ctx.route(url => url.origin !== BASE
        && !/gstatic\.com$|cdnjs\.cloudflare\.com$/.test(url.hostname),
        () => { held.other++; });

    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });

    // The day screen, drawn. Not "the document parsed" - the app's own first render, from
    // the app's own read of the disk.
    const drew = await page.waitForFunction(
        () => document.getElementById('dayView')
            && document.getElementById('dayView').children.length > 0,
        null, { timeout: 15000 }).then(() => true, () => false);
    check('the day screen is drawn with every off-origin request still unanswered', drew,
        `gstatic ${held.gstatic} held, cdnjs ${held.cdnjs} held, other ${held.other} held`);

    // And it is drawn because nothing was WAITING on them, not because they happened to
    // be quick: the requests are still open at this instant and will never be answered.
    check('the cloud SDK was asked for and has still not answered', held.gstatic > 0,
        `${held.gstatic} request(s) held open`);
    check('and nothing was fetched from a CDN at all - the library ships on this origin',
        held.cdnjs === 0, `${held.cdnjs} cdnjs request(s)`);

    const state = await page.evaluate(() => ({
        boot: getComputedStyle(document.getElementById('bootBanner')).display,
        crash: getComputedStyle(document.getElementById('crashBanner')).display,
        view: currentView
    }));
    check('no diagnostic is shown, because nothing is wrong', state.boot === 'none'
        && state.crash === 'none', JSON.stringify(state));

    // The week, which is the screen the question "who worked where" is answered from.
    await page.evaluate(() => showView('week'));
    await page.waitForTimeout(200);
    const week = await page.evaluate(() =>
        document.getElementById('weekView').children.length);
    check('the week grid draws too', week > 0, `${week} children`);

    // AND A DAY IS RECORDED. Through the production commit path, with the cloud request
    // still hanging, and read back off the disk rather than off the screen.
    await page.evaluate(() => {
        State.schedule.workers = [{ id: 'w_01', name: 'אבו פרקד', active: true, dailyRate: 400 }];
        State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
        State.date = '2026-08-12';
        showView('day');
    });
    const recorded = await page.evaluate(() => State.commit(
        assignPlace(State.schedule, '2026-08-12', 'w_01', 'actual', 'p_01')));
    const onDisk = await page.evaluate(() => {
        const raw = JSON.parse(localStorage.getItem('scheduleData:v2'));
        return raw && raw.days && raw.days['2026-08-12'] ? JSON.stringify(raw.days['2026-08-12']) : '';
    });
    check('a day recorded while the cloud hangs is committed', recorded === true, String(recorded));
    check('and it is on the disk, not only on the screen',
        onDisk.includes('p_01'), onDisk.slice(0, 120));

    // Still hanging when it is all over: if the routes had settled at any point, every
    // claim above would be about a network that answered after all.
    check('and every off-origin request is still unanswered at the end of all that',
        held.gstatic > 0 && held.cdnjs === 0,
        `gstatic ${held.gstatic}, cdnjs ${held.cdnjs}, other ${held.other}`);

    await ctx.close();
}

// ---------------------------------------------------------------- a script that never arrived
{
    suite('an early script that 404s says so, in Hebrew, on the screen');

    const { ctx, page } = await phone();
    await plant(page);

    // js/store.js: the first script the page loads, and the one everything else is built
    // on. Nothing after it can report anything, because Store is what Recovery, State and
    // the sync layer all reach for at load.
    broken.set('/js/store.js', 'missing');
    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    broken.delete('/js/store.js');

    const said = await diagnostic(page);
    check('the diagnostic is on the screen, drawn, with height', said.shown === true,
        JSON.stringify({ shown: said.shown, height: said.height }));
    check('and it is the sentence the page ships with, word for word',
        said.sentence === BOOT_SENTENCE, said.sentence);
    check('the detail names the file that did not arrive',
        said.detail.includes('/js/store.js') && said.detail.includes(NOT_LOADED), said.detail);
    check('and there is one button on it, and it reloads',
        said.button === BOOT_BUTTON, said.button);
    check('only one banner speaks - the app\'s own crash banner stays quiet',
        said.crashShown === false, String(said.crashShown));

    const disk = await stillThere(page);
    check('and the record the sentence promises about is untouched', disk === PLANTED,
        `${(disk || '').length} of ${PLANTED.length} chars`);

    await ctx.close();
}

{
    suite('a stylesheet that 404s does not take the diagnostic down with it');

    // The banner carries its own class, and the class is in a file that may be the thing
    // that failed. It ships with an inline `display:none` which the sentinel clears, so
    // what is left is a plain block-level div with text in it - unstyled, and readable.
    const { ctx, page } = await phone();
    await plant(page);
    broken.set('/css/app.css', 'missing');
    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    broken.delete('/css/app.css');

    const said = await diagnostic(page);
    check('the diagnostic is drawn with no stylesheet at all', said.shown === true,
        JSON.stringify({ shown: said.shown, height: said.height }));
    check('and says the same sentence', said.sentence === BOOT_SENTENCE, said.sentence);
    check('and the record is untouched', (await stillThere(page)) === PLANTED);

    await ctx.close();
}

// ---------------------------------------------------------------- a script that would not parse
{
    suite('an early script that will not parse says so, in Hebrew, on the screen');

    const { ctx, page } = await phone();
    await plant(page);

    // Not a 404: two hundred OK, the right content type, and a body the engine refuses.
    // A truncated response over a bad connection looks exactly like this, and it is the
    // case where the file is THERE - so anything that decides by asking whether the file
    // exists gets it wrong.
    broken.set('/js/store.js', 'syntax');
    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    broken.delete('/js/store.js');

    const said = await diagnostic(page);
    check('the diagnostic is on the screen, drawn, with height', said.shown === true,
        JSON.stringify({ shown: said.shown, height: said.height }));
    check('and it is the sentence the page ships with, word for word',
        said.sentence === BOOT_SENTENCE, said.sentence);
    check('the detail carries what the engine actually said',
        /SyntaxError/i.test(said.detail), said.detail);
    check('and the record is untouched', (await stillThere(page)) === PLANTED,
        `${((await stillThere(page)) || '').length} chars`);

    await ctx.close();
}

// ---------------------------------------------------------------- app.js itself
{
    suite('js/app.js never arrives, so nothing ever calls render()');

    // The worst shape of this failure. app.js installs the crash handler, reads the disk
    // and draws the first screen; without it there is no render, no banner of the app's
    // own, and no handler listening. Whatever is said here is said by the document.
    const { ctx, page } = await phone();
    await plant(page);
    broken.set('/js/app.js', 'missing');
    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    broken.delete('/js/app.js');

    const said = await diagnostic(page);
    check('the diagnostic is on the screen, drawn, with height', said.shown === true,
        JSON.stringify({ shown: said.shown, height: said.height }));
    check('and it is the sentence the page ships with, word for word',
        said.sentence === BOOT_SENTENCE, said.sentence);
    check('the detail names app.js', said.detail.includes('/js/app.js')
        && said.detail.includes(NOT_LOADED), said.detail);
    check('the day screen was never drawn, which is exactly why the banner matters',
        (await page.evaluate(() => document.getElementById('dayView').children.length)) === 0);
    check('and the record is untouched', (await stillThere(page)) === PLANTED);

    // The sentinel is still armed - it never stood down, because the thing that stands it
    // down is in the file that never arrived.
    const armed = await page.evaluate(() => window.farkadBootSentinel
        && window.farkadBootSentinel.live() === false
        && window.farkadBootSentinel.spoke() === true);
    check('and the sentinel is the one that spoke, not the app', armed === false,
        String(armed));

    await ctx.close();
}

{
    suite('js/app.js arrives and dies as it runs');

    // The other half: the file is there, the browser executed it, and it threw before it
    // reached the line that hands error reporting over to the app. Nothing in the app is
    // listening at that moment, and the document is again the only thing that can speak.
    const { ctx, page } = await phone();
    await plant(page);
    broken.set('/js/app.js', 'throw');
    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    broken.delete('/js/app.js');

    const said = await diagnostic(page);
    check('the diagnostic is on the screen, drawn, with height', said.shown === true,
        JSON.stringify({ shown: said.shown, height: said.height }));
    check('and it is the sentence the page ships with, word for word',
        said.sentence === BOOT_SENTENCE, said.sentence);
    check('the detail carries the error the script threw',
        said.detail.includes('farkad-test'), said.detail);
    check('and the record is untouched', (await stillThere(page)) === PLANTED);

    await ctx.close();
}

// ---------------------------------------------------------------- the cloud that could not be reached
{
    suite('the cloud adapter cannot be fetched, and the record is untouched');

    // The import is deliberately outside the boot: js/app.js calls it last, catches its
    // failure, and lets a later resume try again. What is measured here is the half of
    // that which is a data guarantee - the app comes up, the record is intact and
    // editable, and nothing anywhere claims a write reached anybody.
    const { ctx, page } = await phone();
    await plant(page);
    broken.set('/js/sync/firebase-adapter.js', 'missing');
    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
        () => document.getElementById('dayView')
            && document.getElementById('dayView').children.length > 0,
        null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
    broken.delete('/js/sync/firebase-adapter.js');

    const said = await diagnostic(page);
    check('the app comes up: no boot diagnostic, because the app itself is fine',
        said.shown === false, JSON.stringify({ shown: said.shown }));
    check('and no crash banner either', said.crashShown === false);

    // AND IT SAYS SO. This is the half that used to be a console.info and nothing else.
    //
    // A phone whose adapter never loaded looked identical, on every screen, to a phone
    // with no cloud configured at all: «הנתונים נשמרים במכשיר הזה בלבד», chip off, ⋯ panel
    // silent. That sentence is true of the second phone and is the opposite of the truth
    // about the first - the record is on this disk, the other two phones are not getting
    // it, and nothing anywhere said so. Measured on this build before the repair: status
    // 'off', foot «הנתונים נשמרים במכשיר הזה בלבד.», chip hidden, reason hidden.
    //
    // The words are the app's own, already pinned elsewhere: the foot line for a sync that
    // failed, and under it in ⋯ ← ענן וסנכרון the reason, which for a cloud that could not
    // be reached names the retry rather than asking for anything.
    const line = await page.evaluate(() => {
        openSettings();
        return {
            status: FarkadSync.status,
            foot: document.getElementById('storageNotice').textContent,
            chip: document.getElementById('syncChip').textContent,
            chipHidden: document.getElementById('syncChip').hidden,
            reason: document.getElementById('settingsSyncReason').textContent,
            reasonHidden: document.getElementById('settingsSyncReason').hidden,
            online: navigator.onLine
        };
    });
    given('the browser believes it is online, which is the case this is about',
        line.online === true);
    check('the phone does not call itself local-only when its cloud simply did not load',
        line.foot === 'שגיאת סנכרון - הנתונים שמורים במכשיר הזה.', line.foot);
    check('the chip beside the app name carries it too, not only the foot',
        line.chipHidden === false && line.chip === 'שגיאת סנכרון',
        `${line.chip} (hidden ${line.chipHidden})`);
    check('and the panel says WHY, in the sentence for a cloud that cannot be reached',
        line.reasonHidden === false
        && line.reason === 'אין כרגע גישה לענן - הניסיון יחזור מעצמו.', line.reason);
    await page.evaluate(() => closeSettings());

    const seen = await page.evaluate(() => ({
        workers: State.schedule.workers.length,
        day: JSON.stringify(State.schedule.days['2026-08-12'] || null),
        adapter: typeof FarkadSync !== 'undefined' && Boolean(FarkadSync.adapter),
        pending: typeof FarkadSync !== 'undefined' ? FarkadSync.pendingCount() : -1
    }));
    check('the planted record was read and is on the screen\'s state', seen.workers === 1
        && seen.day.includes('p_01'), JSON.stringify(seen));
    check('and no adapter was connected, so nothing pretends a write went anywhere',
        seen.adapter === false, String(seen.adapter));

    // ERASES NOTHING. The failure is on the way OUT of the phone; the disk is not its
    // business, and a failed import that quietly reset the record would be the worst bug
    // in this repository.
    check('the record on the disk is byte for byte what was planted',
        (await stillThere(page)) === PLANTED);

    // And a new day still records, locally, with the cloud unreachable.
    const recorded = await page.evaluate(() => State.commit(
        assignPlace(State.schedule, '2026-08-13', 'w_01', 'actual', 'p_01')));
    const after = await page.evaluate(() => {
        const raw = JSON.parse(localStorage.getItem('scheduleData:v2'));
        return Boolean(raw && raw.days && raw.days['2026-08-13'])
            && Boolean(raw.days['2026-08-12']);
    });
    check('a day recorded with no cloud is written, and the old one is still beside it',
        recorded === true && after === true, `${recorded} / ${after}`);

    await ctx.close();
}

await browser.close();
await server.close();

report();
