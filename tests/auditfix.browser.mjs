// The browser half of tests/auditfix.test.mjs: what a read-only audit of v192 found and
// only a real page can show. Chromium, served by tests/serve.mjs; NOT a real phone.
//
//   node tests/auditfix.browser.mjs
//
// Each section was red on v192 (origin/main ae6e1a0) before its repair.

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { serve } from './serve.mjs';
import { launchLocalBrowser } from './network-guard.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
check('the browser is served the named tree',
    (await verifyServedAssets(server.url, root, expectedShaFor(root))).ok);
const browser = await launchLocalBrowser(chromium, { executablePath: process.env.CHROME_PATH });
const errors = [];

async function open(options = {}) {
    const context = await browser.newContext(Object.assign({ viewport: { width: 375, height: 667 },
        serviceWorkers: 'block' }, options));
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(server.url + '/index.html');
    await page.waitForFunction(() => typeof State === 'object' && typeof render === 'function'
        && typeof correctionLine === 'function');
    return { context, page };
}

// ---------------------------------------------------------------------------------------
// 4. The day a correction was WRITTEN is a day of this phone's calendar.
//
// `at` is a UTC timestamp. v192 cut its first ten characters, so a correction written at
// 01:30 on the 13th in Israel (23:30 UTC on the 12th) was shown as written on the 12th.
// Display only: the line is words in the history and in the man's statement, no figure.
// ---------------------------------------------------------------------------------------
suite('4. «תוקן …» is the local day the correction was written');
{
    const { context, page } = await open({ timezoneId: 'Asia/Jerusalem' });
    const read = await page.evaluate(() => {
        const entry = at => ({ targetKind: 'advance', targetDate: '2026-11-10', targetAmount: 400,
            reason: 'טעות', at, by: 'd_test', targetId: 'le_test' });
        const day = text => `תוקן ${formatShortDate(parseLocalDate(text))}`;
        return {
            zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            night: correctionLine(entry(new Date(2026, 10, 13, 1, 30).toISOString())),
            nightAt: new Date(2026, 10, 13, 1, 30).toISOString(),
            noon: correctionLine(entry(new Date(2026, 10, 13, 12, 0).toISOString())),
            bare: correctionLine(entry('2026-11-13')),
            none: correctionLine(entry(undefined)),
            junk: correctionLine(entry('not a time')),
            the13: day('2026-11-13'), the12: day('2026-11-12')
        };
    });
    given('the page runs on Israel time and 01:30 there is the day before in UTC',
        read.zone === 'Asia/Jerusalem' && read.nightAt.startsWith('2026-11-12T23:30'), JSON.stringify(read));
    check('written at 01:30 on the 13th: «תוקן» says the 13th',
        read.night.includes(read.the13) && !read.night.includes(read.the12), read.night);
    check('written at noon on the 13th: the 13th (as before)', read.noon.includes(read.the13), read.noon);
    check('an `at` that is a bare day is that day', read.bare.includes(read.the13), read.bare);
    check('no `at`: no date is invented', !read.none.includes('תוקן'), read.none);
    check('an `at` that is not a time: no date is invented', !read.junk.includes('תוקן'), read.junk);
    await context.close();
}

// ---------------------------------------------------------------------------------------
// 5. The app inside a frame of ANOTHER site does not open.
//
// GitHub Pages can send no frame-ancestors header, so nothing stopped any site loading the
// app in an invisible frame over its own buttons; where third-party storage is not
// partitioned (an older Chrome or WebView - and Chromium as Playwright launches it, which
// is why this can be measured) that frame holds the REAL record. Two origins here: the
// app on 127.0.0.1, the other site on localhost and its own port.
//
// A frame of the SAME origin, and the sandboxed frame of tests/embedded.html (an opaque
// origin: no storage to reach), open exactly as they did.
// ---------------------------------------------------------------------------------------
suite('5. framed by another site, the app does not open');
{
    const { context, page } = await open();
    await page.evaluate(() => {
        State.schedule.workers.push({ id: 'w_real', name: 'עובד מהרישום', idNumber: '', phone: '',
            dailyRate: 400, hourlyRate: 50, active: true });
        State.schedule.places.push({ id: 'p_real', name: 'אתר מהרישום', active: true });
        State.commitRoster();
    });
    const disk = () => page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()
        .map(key => [key, localStorage.getItem(key)])));
    const before = await disk();
    given('the record is on the app’s own origin', before.includes('עובד מהרישום'));

    const other = createServer((request, response) => {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end('<!doctype html><title>another site</title><button>prize</button>'
            + `<iframe id="f" src="${server.url}/index.html" style="width:375px;height:667px;border:0"></iframe>`);
    });
    await new Promise(resolve => other.listen(0, '127.0.0.1', resolve));
    const otherUrl = `http://localhost:${other.address().port}/`;
    given('the two pages are two origins', new URL(otherUrl).origin !== new URL(server.url).origin);

    const top = await context.newPage();
    top.on('pageerror', error => errors.push(error.message));
    await top.goto(otherUrl);
    const frame = top.frames().find(candidate => candidate !== top.mainFrame());
    given('the other site holds the app in a frame', Boolean(frame) && frame.url().startsWith(server.url));
    await frame.waitForFunction(() => window.farkadFramed === true
        || (typeof State === 'object' && typeof render === 'function'), null, { timeout: 10000 });
    await top.waitForTimeout(600);
    const inside = await frame.evaluate(() => {
        const cover = document.getElementById('farkadFramedCover');
        const link = cover && cover.querySelector('a');
        const box = link && link.getBoundingClientRect();
        const lid = cover && cover.getBoundingClientRect();
        return {
            flagged: window.farkadFramed === true,
            booted: typeof State !== 'undefined' || typeof Store !== 'undefined' || typeof render === 'function',
            scripts: document.querySelectorAll('script[src]').length,
            text: document.documentElement.innerText || '',
            cover: cover ? cover.textContent : null,
            covers: lid ? [Math.round(lid.left), Math.round(lid.top), Math.round(lid.width), Math.round(lid.height)] : null,
            view: [window.innerWidth, window.innerHeight],
            link: link ? { href: link.href, target: link.target, rel: link.rel, text: link.textContent,
                height: Math.round(box.height), width: Math.round(box.width),
                size: parseFloat(getComputedStyle(link).fontSize) } : null,
            size: cover ? parseFloat(getComputedStyle(cover).fontSize) : 0
        };
    });
    check('the framed app did not boot: no State, no Store, no render', inside.booted === false, JSON.stringify(inside));
    check('and no script of the app was loaded into the frame', inside.scripts === 0, String(inside.scripts));
    check('no name of the record is anywhere in the frame', !inside.text.includes('עובד מהרישום')
        && !inside.text.includes('אתר מהרישום'));
    same('the frame is covered, and says why in one sentence with one way out (PROPOSED Hebrew)',
        [inside.cover, inside.link && inside.link.text],
        ['פרקד לא נפתחת בתוך דף של אתר אחר, כדי לשמור על הרישום.לפתיחת פרקד בחלון משלה',
            'לפתיחת פרקד בחלון משלה']);
    check('the cover is the whole frame',
        inside.covers && inside.covers[0] === 0 && inside.covers[1] === 0
        && inside.covers[2] >= inside.view[0] && inside.covers[3] >= inside.view[1], JSON.stringify(inside.covers));
    check('the way out opens the app in a window of its own, with no handle back',
        inside.link && inside.link.href === server.url + '/index.html' && inside.link.target === '_blank'
        && /noopener/.test(inside.link.rel), JSON.stringify(inside.link));
    check('the sentence is 16px or more and the link 44px both ways',
        inside.size >= 16 && inside.link && inside.link.size >= 16 && inside.link.height >= 44
        && inside.link.width >= 44, JSON.stringify([inside.size, inside.link]));
    check('the disk of the app’s origin is byte for byte what it was', (await disk()) === before);
    await top.close();
    other.close();

    // The same origin: a frame of the app inside a page of the app.
    await page.evaluate(() => {
        const frame = document.createElement('iframe');
        frame.id = 'sameOrigin';
        frame.src = 'index.html';
        document.body.appendChild(frame);
    });
    const sameFrame = page.frames().find(candidate => candidate !== page.mainFrame());
    await sameFrame.waitForFunction(() => typeof State === 'object' && typeof render === 'function'
        && document.querySelector('#dayView') !== null, null, { timeout: 10000 });
    const sameRead = await sameFrame.evaluate(() => ({ flagged: window.farkadFramed,
        cover: document.getElementById('farkadFramedCover') !== null,
        ear: Array.isArray(window.farkadBootEar),
        names: State.schedule.workers.map(worker => worker.name) }));
    check('a frame of the SAME origin opens as it did: the app, the record, no cover',
        sameRead.flagged === undefined && sameRead.cover === false && sameRead.ear
        && sameRead.names.includes('עובד מהרישום'), JSON.stringify(sameRead));
    const topRead = await page.evaluate(() => ({ flagged: window.farkadFramed,
        cover: document.getElementById('farkadFramedCover') !== null, ear: Array.isArray(window.farkadBootEar) }));
    check('the app in its own window: no cover, the ear installed',
        topRead.flagged === undefined && topRead.cover === false && topRead.ear, JSON.stringify(topRead));
    await context.close();

    // tests/embedded.html: sandbox="allow-scripts", an opaque origin. Storage throws there,
    // so there is nothing to protect, and the app has to open as the smoke suite expects.
    const boxed = await browser.newContext({ viewport: { width: 375, height: 667 }, serviceWorkers: 'block' });
    const outer = await boxed.newPage();
    await outer.goto(server.url + '/tests/embedded.html');
    const sandboxed = outer.frames().find(candidate => candidate !== outer.mainFrame());
    await sandboxed.waitForFunction(() => typeof State === 'object' && typeof render === 'function',
        null, { timeout: 10000 });
    const boxRead = await sandboxed.evaluate(() => ({ origin: String(window.origin), flagged: window.farkadFramed,
        cover: document.getElementById('farkadFramedCover') !== null,
        day: document.querySelector('#dayView') !== null }));
    check('the sandboxed frame of tests/embedded.html opens as it did',
        boxRead.origin === 'null' && boxRead.flagged === undefined && boxRead.cover === false && boxRead.day,
        JSON.stringify(boxRead));
    await boxed.close();
}

// ---------------------------------------------------------------------------------------
// 6. «התחלה מהירה»: a paste past the bounds is refused whole, with the words still in the
//    box and nothing added. (The backup file's bounds are tests/auditfix.test.mjs.)
//
// v192: 5,000 pasted lines became 5,000 workers, committed and queued for the cloud, and
// the count was said only afterwards. 500 lines and 200 characters a line are far above
// any list of names. The Hebrew is PROPOSED.
// ---------------------------------------------------------------------------------------
suite('6. a quick-start paste past the bounds is refused, and nothing is added');
{
    const { context, page } = await open();
    const disk = () => page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()
        .filter(key => !key.startsWith('farkad:openBuilds')).map(key => [key, localStorage.getItem(key)])));
    const state = () => page.evaluate(() => ({ step: quickStep, title: document.getElementById('quickTitle').textContent,
        error: document.getElementById('quickError').textContent,
        box: document.getElementById('quickText').value.length,
        open: document.getElementById('quickModal').style.display,
        workers: State.schedule.workers.length, places: State.schedule.places.length }));
    const paste = async text => {
        // The button's own click, fired in the page: a dialog that has already shut (the
        // fault itself) is then a failed check here and not a thrown timeout.
        await page.evaluate(value => {
            document.getElementById('quickText').value = value;
            document.getElementById('quickNext').click();
        }, text);
    };
    await page.evaluate(() => { window.__told = []; askTell = message => { window.__told.push(typeof message === 'string' ? message : message.message); return Promise.resolve(); }; });
    const before = await disk();

    await page.evaluate(() => openQuickStart());
    const crowd = Array.from({ length: 5000 }, (unused, at) => `שורה מהצ'אט ${at + 1}`).join('\n');
    await paste(crowd);
    let now = await state();
    same('5,000 lines at the workers step: refused, still step 1, the words still in the box',
        [now.step, now.error, now.box, now.open],
        ['workers', 'יש כאן 5000 שורות - יותר מ-500. זו לא נראית רשימת שמות, ולכן לא נוסף כלום. בדוק מה הודבק ונסה שוב.',
            crowd.length, 'flex']);

    const long = `דוגמה אלף\n${'מ'.repeat(201)}\nדוגמה גימל`;
    await paste(long);
    now = await state();
    same('a line of 201 characters: refused, and it says which line',
        [now.step, now.error, now.box],
        ['workers', 'שורה 2 ארוכה מדי לשם: 201 תווים, יותר מ-200. לא נוסף כלום. בדוק מה הודבק ונסה שוב.', long.length]);

    // Exactly at the bounds is taken: 500 names, one of them 200 characters.
    const fair = Array.from({ length: 500 }, (unused, at) => at === 0 ? 'ש'.repeat(200) : `דוגמה ${at + 1}`).join('\n');
    await paste(fair);
    now = await state();
    same('500 names, one of 200 characters: taken, on to the sites', [now.step, now.error], ['places', '']);

    const sites = Array.from({ length: 501 }, (unused, at) => `אתר ${at + 1}`).join('\n');
    await paste(sites);
    now = await state();
    same('501 lines at the sites step: refused, still step 2, nothing added',
        [now.step, now.error, now.workers, now.places, now.open],
        ['places', 'יש כאן 501 שורות - יותר מ-500. זו לא נראית רשימת שמות, ולכן לא נוסף כלום. בדוק מה הודבק ונסה שוב.', 0, 0, 'flex']);
    check('and through all four the disk is byte for byte what it was', (await disk()) === before);
    check('and nothing was announced', (await page.evaluate(() => window.__told.length)) === 0);

    await paste('אתר צפון\nאתר דרום');
    now = await state();
    const told = await page.evaluate(() => window.__told);
    check('a fair list of sites finishes it: 500 workers and 2 sites, said in the app’s own sentence',
        now.step === null && now.workers === 500 && now.places === 2
        && told.length === 1 && told[0] === 'מוכן: 500 עובדים ו-2 אתרים. אפשר להתחיל לרשום.', JSON.stringify([now, told]));
    await context.close();
}

// ---------------------------------------------------------------------------------------
// 7. The two wa.me doors opened by window.open give the page they open no handle back.
//
// The four anchors to wa.me carry rel="noopener noreferrer"; these two calls opened a tab
// that held window.opener and could navigate the app's window. Neither caller reads what
// window.open returns - the share sheet's failure is told from its promise, and the
// wa.me branch is the one with no share sheet at all - so the third argument costs no
// fallback. Not tried on an iPhone's home-screen app.
// ---------------------------------------------------------------------------------------
suite('7. window.open to wa.me carries noopener');
{
    const { context, page } = await open();
    const read = await page.evaluate(() => {
        const calls = [];
        window.open = (...args) => { calls.push(args); return null; };
        Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
        const status = document.createElement('p');
        let done = 0;
        shareTextOut('שלום לכולם', status, () => { done += 1; });
        const day = { calls: calls.splice(0), done, status: status.textContent };
        workerStatementText = () => 'חשבון לדוגמה';
        shareWorkerStatement('w_any');
        return { day, statement: calls.splice(0) };
    });
    const opensWa = (calls, text) => calls.length === 1
        && calls[0][0] === `https://wa.me/?text=${encodeURIComponent(text)}` && calls[0][1] === '_blank';
    const noHandle = calls => calls.length === 1 && String(calls[0][2] || '').split(',').includes('noopener');
    given('with no share sheet the day message opens wa.me in a new tab, once, and closes its dialog',
        opensWa(read.day.calls, 'שלום לכולם') && read.day.done === 1 && read.day.status === 'פותח וואטסאפ…',
        JSON.stringify(read.day));
    given('with no share sheet a man’s statement opens wa.me in a new tab, once',
        opensWa(read.statement, 'חשבון לדוגמה'), JSON.stringify(read.statement));
    check('the day message (and the rides’ summary, the same door): noopener', noHandle(read.day.calls), JSON.stringify(read.day.calls));
    check('a man’s statement: noopener', noHandle(read.statement), JSON.stringify(read.statement));
    await context.close();
}

check('no page threw', errors.length === 0, errors.join(' | '));
await browser.close();
await server.close();
report();
