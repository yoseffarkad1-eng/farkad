// הסעות, shared - on the glass, in a real Chromium with a touch screen.
//
//   node tests/transport.share.browser.mjs
//
// The logic is tests/transport.share.test.mjs (Node, the fake cloud) and
// tests/transport.emulator.test.mjs (a real Firestore). This file is what a person SEES:
//
//   - the gate shut again (the test seam; it ships OPEN since v186): the screen of before,
//     with not one new thing on it;
//   - the gate open, two phones on one cloud: the line under the head and what it says,
//     a man seated on one phone appearing in his seat on the other with nobody touching
//     it, the loser of a same-seat race shown the plan that won with ONE sentence and
//     two buttons, «להשתמש בשיבוץ שלי» through the app's own question, «להשאיר את המשותף»;
//   - the same under the rules of today: «עדיין לא משותף»;
//   - and the floors: every new control 44px both ways, every new word 16px, nothing
//     wider than the phone, at 440 and 375, in both schemes; no native dialog, no error;
//   - v191: the first meeting on a 320x568 phone with «תצוגה גדולה» on - under the two
//     notices the cars still have room for a whole seat.
//
// THE CLOUD is the harness's fake (makeTransportCloud), living in THIS process and bridged
// into each page: a page's adapter calls out through an exposed function, and the cloud's
// answers come back by page.evaluate. Two pages are two phones with two disks. The gate is
// as this build ships it (open, since v186); the one block about the SHUT path shuts it the
// only way it can be shut without a commit, by defining the test seam before the app's
// scripts run - which no shipped file does (tests/build.test.mjs).
//
// NOT a real phone, and not the real Firebase SDK in a page: the SDK is not loaded here at
// all (the network guard refuses it, as in every browser suite).

import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import { launchLocalBrowser } from './network-guard.mjs';
import { tapsAtAPersonsPace } from './pace.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { makeTransportCloud } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
const served = await verifyServedAssets(server.url, root, expectedShaFor(root));
check('the origin served this commit, byte for byte', served.ok,
    `${served.checked} assets; ${(served.wrong || []).slice(0, 3).join(' | ')}`);
const browser = await launchLocalBrowser(chromium, { executablePath: process.env.CHROME_PATH });

const DAY = '2026-11-10';
const DOC = `day_${DAY}`;
const bare = text => String(text || '').replace(/[⁦-⁩‎‏]/g, '');
const WORKERS = ['אחמד', 'מוחמד', 'יוסי', 'סמיר', 'עלי', 'ראמי'].map((name, i) => (
    { id: `w_0${i + 1}`, name, active: true, dailyRate: 400, phone: '' }));
const PLACES = [{ id: 'p_01', name: 'הרצליה', active: true }, { id: 'p_02', name: 'חיפה', active: true }];

// The pinned words read off the glass (pinned in tests/transport.test.mjs).
const W = {
    thisPhone: 'פועל במכשיר הזה בלבד: לא מסונכרן, לא משותף עם הטלפונים האחרים, ולא נכלל בגיבוי.',
    leadShared: 'שיבוץ העובדים לרכבים והודעה לכל נהג. מופעל בכל מכשיר בנפרד. במכשיר שמחובר לענן, השיבוץ ורשימת הרכבים משותפים עם הטלפונים האחרים שהפעילו הסעות. לא נכלל בגיבוי.',
    shared: 'השיבוץ משותף עם הטלפונים האחרים ומעודכן.',
    waiting: 'השינוי שמור במכשיר הזה ועדיין לא התעדכן בענן.',
    unchecked: 'אין חיבור: לא ניתן לבדוק אם השיבוץ מעודכן. מוצג מה ששמור במכשיר הזה.',
    notShared: 'השיבוץ עדיין לא משותף: הענן אינו מאפשר זאת כרגע. הוא שמור במכשיר הזה בלבד.',
    changedDay: 'השיבוץ של היום הזה שונה בטלפון אחר. מוצג השיבוץ המשותף, והשיבוץ שלך נשמר בצד.',
    firstDay: 'במכשיר הזה היה ליום הזה שיבוץ שונה מהמשותף. מוצג השיבוץ המשותף, והשיבוץ של המכשיר נשמר בצד.',
    firstList: 'במכשיר הזה הייתה רשימת רכבים שונה מהמשותפת. מוצגת הרשימה המשותפת, והרשימה של המכשיר נשמרה בצד.',
    useMineList: 'להשתמש ברשימה שלי',
    useMineListTitle: 'להחליף את רשימת הרכבים המשותפת ברשימה שלך?',
    useMine: 'להשתמש בשיבוץ שלי',
    keep: 'להשאיר את המשותף',
    useMineTitle: 'להחליף את השיבוץ המשותף בשיבוץ שלך?',
    useMineLead: 'הטלפונים האחרים יראו את שלך במקום מה שמוצג עכשיו.',
    useMineOk: 'להחליף'
};

async function block(name, body) {
    suite(name);
    try {
        await body();
    } catch (error) {
        check(`${name}: the block ran to its end`, false,
            String((error && error.stack) || error).split('\n').slice(0, 4).join(' | '));
    }
}

// One phone. `gate`: the test seam, defined before any script of the app runs. `cloud`:
// the fake transport cloud this phone's adapter is bridged to (or none: a phone that is
// not signed in).
async function phone(options) {
    const { width, height, scheme, gate, cloud, large } = options;
    const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, hasTouch: true, isMobile: true });
    // «תצוגה גדולה» (v191, js/ui/display.js): the one per-phone key, there before the app reads it.
    if (large) await context.addInitScript(() => { try { localStorage.setItem('farkadDisplay:large', '1'); } catch (error) { /* no disk */ } });
    const page = await context.newPage();
    // v194: this suite is not about double taps - its taps come at a person's pace (tests/pace.mjs).
    tapsAtAPersonsPace(page);
    const errors = [];
    const dialogs = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => { dialogs.push(dialog.type()); dialog.dismiss().catch(() => {}); });
    page.on('console', message => {
        if (message.type() !== 'error') return;
        const said = message.text();
        if (/ERR_BLOCKED_BY_CLIENT/.test(said) || /^Sync error: .*firebase-adapter\.js/.test(said)) return;
        errors.push(`console: ${said}`);
    });
    // As shipped the gate is open (v186). `gate: false` shuts it through the test seam,
    // defined before any script of the app runs - the build a rollback would be.
    if (!gate) await context.addInitScript(() => { window.FARKAD_FLAG_OVERRIDES = { transportShare: false }; });
    const line = cloud ? cloud.phone() : null;
    if (line) {
        // The page's write, answered by the cloud in this process. An Error does not
        // cross the bridge with its fields, so a refusal is carried as data and thrown
        // again on the far side - code, revision and the document that won.
        await page.exposeFunction('__cloudWrite', async (name, base, data) => {
            try { return { ok: await line.adapter.write(name, base, data) }; } catch (error) {
                return { error: { code: error.code || null, revision: error.revision, document: error.document || null, message: error.message } };
            }
        });
        let stop = null;
        await page.exposeFunction('__cloudSubscribe', from => {
            if (stop) stop();
            stop = line.adapter.subscribe(from,
                (docs, info) => { page.evaluate(([list, meta]) => window.__cloudHeard && window.__cloudHeard(list, meta), [docs, info]).catch(() => {}); },
                error => { page.evaluate(code => window.__cloudFailed && window.__cloudFailed(code), error.code || null).catch(() => {}); });
        });
        await page.exposeFunction('__cloudUnsubscribe', () => { if (stop) stop(); stop = null; });
    }
    await page.goto(`${server.url}/index.html`, { waitUntil: 'load' });
    await page.waitForTimeout(350);
    await page.evaluate(([workers, places, day]) => {
        todayStr = () => day;
        State.schedule.workers = workers;
        State.schedule.places = places;
        workers.forEach((worker, i) => assignPlace(State.schedule, day, worker.id, 'actual', places[i % places.length].id));
        State.save();
        State.date = day;
        showView('day');
        render();
        transportSetEnabled(true);
    }, [WORKERS, PLACES, DAY]);
    const connect = () => page.evaluate(() => {
        TransportShare.flushDelayMs = 30;
        TransportShare.retryMs = 200;
        TransportShare.staleGraceMs = 100;
        TransportShare.retryMaxMs = 1500;
        return TransportShare.connect({
            write(name, base, data) {
                return window.__cloudWrite(name, base, data).then(answer => {
                    if (answer.error) throw Object.assign(new Error(answer.error.message), answer.error);
                    return answer.ok;
                });
            },
            subscribe(from, onDocs, onError) {
                window.__cloudHeard = onDocs;
                window.__cloudFailed = code => onError(Object.assign(new Error('refused'), { code }));
                window.__cloudSubscribe(from);
                return () => { window.__cloudHeard = null; window.__cloudFailed = null; window.__cloudUnsubscribe(); };
            }
        });
    });
    const openPanel = async () => {
        await page.evaluate(day => openTransport(day), DAY);
        await page.locator('#transportPanel.open').waitFor({ state: 'visible' });
        await page.waitForTimeout(80);
    };
    return { page, context, errors, dialogs, line, connect, openPanel };
}

const lineOf = async page => {
    const node = page.locator('#transportShareLine');
    return (await node.count()) ? bare(await node.textContent()) : null;
};
const waitLine = (page, words) => page.waitForFunction(want => {
    const node = document.getElementById('transportShareLine');
    return Boolean(node) && node.textContent === want;
}, words, { timeout: 8000 }).then(() => true, () => false);
const drawn = (page, vehicle) => page.evaluate(id => [...document.querySelectorAll(`#transportBody .transport-seat[data-vehicle="${id}"]`)]
    .sort((a, b) => Number(a.dataset.seat) - Number(b.dataset.seat)).map(tile => tile.dataset.worker || '-').join(' '), vehicle);
const waitDrawn = (page, vehicle, want) => page.waitForFunction(([id, expected]) => [...document.querySelectorAll(`#transportBody .transport-seat[data-vehicle="${id}"]`)]
    .sort((a, b) => Number(a.dataset.seat) - Number(b.dataset.seat)).map(tile => tile.dataset.worker || '-').join(' ') === expected,
[vehicle, want], { timeout: 8000 }).then(() => true, () => false);
// Tap then tap: the man in the tray, then the seat.
const seatByTaps = async (page, worker, vehicle, n) => {
    await page.locator(`#transportChips .transport-chip[data-worker="${worker}"]`).tap();
    await page.locator(`#transportBody .transport-seat[data-vehicle="${vehicle}"][data-seat="${n}"]`).tap();
    await page.waitForTimeout(60);
};
// The floors, measured on everything inside the share node: 44px both ways for a control,
// 16px for a word, inside the phone's width, and the page not scrolling sideways.
const floors = page => page.evaluate(() => {
    const host = document.getElementById('transportShare');
    const wide = document.documentElement.clientWidth;
    const controls = [...host.querySelectorAll('button')].map(node => {
        const box = node.getBoundingClientRect();
        return { text: node.textContent, w: Math.round(box.width), h: Math.round(box.height), size: parseFloat(getComputedStyle(node).fontSize),
            inside: box.left >= 0 && box.right <= wide + 0.5 };
    });
    const words = [...host.querySelectorAll('p')].map(node => {
        const box = node.getBoundingClientRect();
        return { size: parseFloat(getComputedStyle(node).fontSize), inside: box.left >= 0 && box.right <= wide + 0.5, h: Math.round(box.height) };
    });
    return { controls, words, sideways: document.documentElement.scrollWidth > wide + 1,
        hostVisible: !host.hidden && host.getBoundingClientRect().height > 0 };
});
// Contrast of the line's ink on what is behind it (WCAG), read from the computed colours.
const contrast = page => page.evaluate(() => {
    const rgb = text => (text.match(/[\d.]+/g) || []).slice(0, 4).map(Number);
    const lum = ([r, g, b]) => [r, g, b].map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); })
        .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
    const behind = node => {
        for (let at = node; at; at = at.parentElement) {
            const c = rgb(getComputedStyle(at).backgroundColor);
            if (c.length >= 3 && (c.length === 3 || c[3] > 0.99)) return c;
        }
        return [255, 255, 255];
    };
    return [...document.querySelectorAll('#transportShare p')].map(node => {
        const a = lum(rgb(getComputedStyle(node).color));
        const b = lum(behind(node));
        return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 10) / 10;
    });
});

// ================================================================== the gate, shut

// MOVED in v186: this was 'the gate as shipped'. The gate now ships open; shut is the seam.
await block('the gate shut again (the seam): the screen of before, with nothing added to it', async () => {
    const cloud = makeTransportCloud();
    const one = await phone({ width: 440, height: 956, scheme: 'dark', gate: false, cloud });
    same('the gate reads shut', await one.page.evaluate(() => TransportShare.on()), false);
    same('handed a cloud, it declines it', await one.connect(), false);
    await one.openPanel();
    await seatByTaps(one.page, 'w_01', 'tv_01', 1);
    await one.page.waitForTimeout(300);
    same('the man is in his seat', await drawn(one.page, 'tv_01'), 'w_01 - - - -');
    same('the share node is in the page, hidden and empty',
        await one.page.evaluate(() => { const host = document.getElementById('transportShare');
            return [host.hidden, host.childElementCount, Math.round(host.getBoundingClientRect().height)]; }), [true, 0, 0]);
    same('the cloud was never called', cloud.attempts.length, 0);
    same('no key of a shared plan is on the disk',
        await one.page.evaluate(() => Object.keys(localStorage).filter(key => /:shared:|:aside:/.test(key))), []);
    same('and the switch in ⋯ still says the plan is on this phone only',
        bare(await one.page.evaluate(() => document.querySelector('#transportSwitchCard .settings-fold-body p.hint').textContent)).endsWith(W.thisPhone), true);
    same('no error, and no dialog of the browser\'s own', [one.errors, one.dialogs], [[], []]);
    await one.context.close();
});

// ================================================================== two phones

async function twoPhones(width, height, scheme) {
    const label = `${width}x${height} ${scheme}`;
    await block(`two phones, one plan (${label})`, async () => {
        const cloud = makeTransportCloud();
        const a = await phone({ width, height, scheme, gate: true, cloud });
        const b = await phone({ width, height, scheme, gate: true, cloud });
        same('the gate is open on both', [await a.page.evaluate(() => TransportShare.on()), await b.page.evaluate(() => TransportShare.on())], [true, true]);
        same('the switch in ⋯ says the plan is shared, and no longer that it is not',
            bare(await a.page.evaluate(() => document.querySelector('#transportSwitchCard .settings-fold-body p.hint').textContent)), W.leadShared);

        // Not signed in: today's screen.
        await a.openPanel();
        same('not signed in, nothing is said about sharing',
            await a.page.evaluate(() => document.getElementById('transportShare').hidden), true);
        await a.connect();
        await b.openPanel();
        await b.connect();
        given('both lines say the plan is shared and current', (await waitLine(a.page, W.shared)) && (await waitLine(b.page, W.shared)),
            `${await lineOf(a.page)} / ${await lineOf(b.page)}`);
        const calm = await floors(a.page);
        check('the line is 16px, inside the phone, and the page does not scroll sideways',
            calm.hostVisible && calm.words.length === 1 && calm.words.every(word => word.size >= 16 && word.inside) && !calm.sideways,
            JSON.stringify(calm));
        check('and readable: at least 4.5:1 on what is behind it', (await contrast(a.page)).every(ratio => ratio >= 4.5),
            JSON.stringify(await contrast(a.page)));

        // A seats a man; B, untouched, draws him.
        await seatByTaps(a.page, 'w_01', 'tv_01', 1);
        same('A sees him at once', await drawn(a.page, 'tv_01'), 'w_01 - - - -');
        check('B draws him in the same seat with nobody touching B', await waitDrawn(b.page, 'tv_01', 'w_01 - - - -'), await drawn(b.page, 'tv_01'));
        check('and both lines are back to shared', (await waitLine(a.page, W.shared)) && (await waitLine(b.page, W.shared)));
        same('B was told nothing', await b.page.locator('#transportShare .transport-share-notice').count(), 0);
        same('B\'s own disk holds the day', await b.page.evaluate(key => JSON.parse(localStorage.getItem(key)).trips.tv_01.driver, `farkadTransport:day:${DAY}`), 'w_01');

        // The same seat, at once: B's change waits; A's lands; B is shown A's and told.
        await b.page.evaluate(() => { TransportShare.flushDelayMs = 600000; });
        await seatByTaps(b.page, 'w_03', 'tv_01', 2);
        same('B\'s line says its change is not up yet', await lineOf(b.page), W.waiting);
        await seatByTaps(a.page, 'w_02', 'tv_01', 2);
        check('B is shown the plan that won', await waitDrawn(b.page, 'tv_01', 'w_01 w_02 - - -'), await drawn(b.page, 'tv_01'));
        const notice = b.page.locator('#transportShare .transport-share-notice');
        same('with one notice', await notice.count(), 1);
        same('one sentence', bare(await notice.locator('p').textContent()), W.changedDay);
        same('and two buttons, by their words', (await notice.locator('button').allTextContents()).map(bare), [W.useMine, W.keep]);
        const told = await floors(b.page);
        check('both buttons are 44px in both dimensions, 16px, inside the phone',
            told.controls.length === 2 && told.controls.every(one => one.w >= 44 && one.h >= 44 && one.size >= 16 && one.inside), JSON.stringify(told.controls));
        check('every word is 16px and inside the phone, and nothing scrolls sideways',
            told.words.every(word => word.size >= 16 && word.inside) && !told.sideways, JSON.stringify(told.words));
        check('the notice is readable: at least 4.5:1', (await contrast(b.page)).every(ratio => ratio >= 4.5), JSON.stringify(await contrast(b.page)));
        check('the cars are still on the glass under it', await b.page.evaluate(() => {
            const body = document.getElementById('transportBody').getBoundingClientRect();
            return body.height >= 200 && body.bottom <= window.innerHeight + 1;
        }));
        same('A, who won, is told nothing', await a.page.locator('#transportShare .transport-share-notice').count(), 0);
        same('the man B seated is waiting again on B, not lost from the day',
            await b.page.locator('#transportChips .transport-chip[data-worker="w_03"]').count(), 1);

        // «להשתמש בשיבוץ שלי»: the app's own question, then an ordinary change.
        await b.page.evaluate(() => { TransportShare.flushDelayMs = 30; });
        await notice.locator('button').first().tap();
        await b.page.locator('#askModal').waitFor({ state: 'visible' });
        same('it asks first, in the app\'s own dialog', [bare(await b.page.locator('#askTitle').textContent()),
            bare(await b.page.locator('#askMessage').textContent()), bare(await b.page.locator('#askOk').textContent())],
        [W.useMineTitle, W.useMineLead, W.useMineOk]);
        await b.page.locator('#askCancel').tap();
        await b.page.waitForTimeout(120);
        same('cancelled, nothing moves and the notice stays', [await drawn(b.page, 'tv_01'), await notice.count()], ['w_01 w_02 - - -', 1]);
        await notice.locator('button').first().tap();
        await b.page.locator('#askModal').waitFor({ state: 'visible' });
        await b.page.locator('#askOk').tap();
        check('B\'s own plan is drawn again', await waitDrawn(b.page, 'tv_01', 'w_01 w_03 - - -'), await drawn(b.page, 'tv_01'));
        check('and A draws it too', await waitDrawn(a.page, 'tv_01', 'w_01 w_03 - - -'), await drawn(a.page, 'tv_01'));
        same('the notice is gone from B', await notice.count(), 0);
        same('A is told nothing: it had not changed anything', await a.page.locator('#transportShare .transport-share-notice').count(), 0);
        same('the cloud holds it as the next revision', [cloud.docs.get(DOC).revision, cloud.docs.get(DOC).trips.tv_01.passengers], [3, ['w_03']]);

        // Again, and this time B keeps the shared one.
        await b.page.evaluate(() => { TransportShare.flushDelayMs = 600000; });
        await seatByTaps(b.page, 'w_04', 'tv_02', 1);
        await seatByTaps(a.page, 'w_05', 'tv_02', 1);
        check('B is shown A\'s driver', await waitDrawn(b.page, 'tv_02', 'w_05 - - - -'), await drawn(b.page, 'tv_02'));
        await b.page.locator('#transportShare .transport-share-notice button').nth(1).tap();
        await b.page.waitForTimeout(120);
        same('keep the shared one: the notice goes, the plan stays', [await notice.count(), await drawn(b.page, 'tv_02')], [0, 'w_05 - - - -']);
        same('and nothing was put aside any more',
            await b.page.evaluate(() => Object.keys(localStorage).filter(key => /:aside:/.test(key))), []);

        // The signal goes on B.
        await b.page.evaluate(() => { TransportShare.flushDelayMs = 30; });
        b.line.setOnline(false);
        check('offline, B says it cannot check', await waitLine(b.page, W.unchecked), await lineOf(b.page));
        await seatByTaps(b.page, 'w_06', 'tv_03', 1);
        same('a change made offline is drawn at once', await drawn(b.page, 'tv_03'), 'w_06 - - - -');
        same('and said to be not up yet', await lineOf(b.page), W.waiting);
        b.line.setOnline(true);
        check('back, it goes up and A draws it', await waitDrawn(a.page, 'tv_03', 'w_06 - - - -'), await drawn(a.page, 'tv_03'));
        check('and B says shared again', await waitLine(b.page, W.shared), await lineOf(b.page));

        same('no error on either phone, and no dialog of the browser\'s own', [a.errors, a.dialogs, b.errors, b.dialogs], [[], [], [], []]);
        await a.context.close();
        await b.context.close();
    });
}

await block('under the rules in the field today: not shared yet, said in one line', async () => {
    const cloud = makeTransportCloud({ rules: 'old' });
    const one = await phone({ width: 375, height: 667, scheme: 'light', gate: true, cloud });
    await one.openPanel();
    await one.connect();
    check('the line says it is not shared yet', await waitLine(one.page, W.notShared), await lineOf(one.page));
    await seatByTaps(one.page, 'w_01', 'tv_01', 1);
    same('the plan works as ever', await drawn(one.page, 'tv_01'), 'w_01 - - - -');
    same('and is on the disk', await one.page.evaluate(key => JSON.parse(localStorage.getItem(key)).trips.tv_01.driver, `farkadTransport:day:${DAY}`), 'w_01');
    const said = await floors(one.page);
    check('the long sentence fits a 375px phone at 16px', said.words.every(word => word.size >= 16 && word.inside) && !said.sideways, JSON.stringify(said));
    check('and is readable', (await contrast(one.page)).every(ratio => ratio >= 4.5), JSON.stringify(await contrast(one.page)));
    same('nothing was written to the cloud', cloud.writes.length, 0);
    same('no error, no dialog', [one.errors, one.dialogs], [[], []]);
    await one.context.close();
});

// THE FIRST TIME A PHONE MEETS THE SHARED PLAN (v186: the gate is open, and the three
// phones do not update together). The owner's phone got there first; this is what the
// SECOND phone's person sees if that phone had a list and a plan of its own: the shared
// ones drawn, and for each of the two one sentence that says where his went and two
// buttons. And a phone that had touched nothing sees nothing but the shared plan.
await block('the first meeting, on the glass: a phone with its own list and plan, and a phone with neither', async () => {
    const cloud = makeTransportCloud();
    const owner = await phone({ width: 375, height: 667, scheme: 'dark', gate: true, cloud });
    await owner.page.evaluate(day => { transportRenameVehicle('tv_02', 'קורולה לבנה'); transportPlace(day, 'w_01', 'tv_01', 1); }, DAY);
    await owner.openPanel();
    await owner.connect();
    given('the owner\'s phone made the shared list and day', await waitLine(owner.page, W.shared)
        && cloud.docs.has('settings') && cloud.docs.has(DOC), [...cloud.docs.keys()].join(','));
    same('and is told nothing', await owner.page.locator('#transportShare .transport-share-notice').count(), 0);

    const second = await phone({ width: 375, height: 667, scheme: 'dark', gate: true, cloud });
    await second.page.evaluate(day => { transportRenameVehicle('tv_03', 'ביוואידי אפור'); transportPlace(day, 'w_04', 'tv_03', 1); }, DAY);
    await second.openPanel();
    same('before it is signed in, its own plan is on the glass', await drawn(second.page, 'tv_03'), 'w_04 - - - -');
    await second.connect();
    check('signed in, the shared day is drawn', await waitDrawn(second.page, 'tv_01', 'w_01 - - - -'), await drawn(second.page, 'tv_01'));
    same('and its own man is waiting again', await second.page.locator('#transportChips .transport-chip[data-worker="w_04"]').count(), 1);
    const notices = second.page.locator('#transportShare .transport-share-notice');
    same('two notices: the list, then the day', (await notices.locator('p').allTextContents()).map(bare), [W.firstList, W.firstDay]);
    same('each with its two buttons', (await notices.locator('button').allTextContents()).map(bare), [W.useMineList, W.keep, W.useMine, W.keep]);
    const told = await floors(second.page);
    check('all four buttons are 44px both ways and 16px, inside a 375px phone',
        told.controls.length === 4 && told.controls.every(one => one.w >= 44 && one.h >= 44 && one.size >= 16 && one.inside), JSON.stringify(told.controls));
    check('the words are 16px, inside the phone, nothing scrolls sideways',
        told.words.every(word => word.size >= 16 && word.inside) && !told.sideways, JSON.stringify(told.words));
    check('and with both notices up the cars still have room on a 667px phone', await second.page.evaluate(() => {
        const body = document.getElementById('transportBody').getBoundingClientRect();
        return body.height >= 240 && body.bottom <= window.innerHeight + 1;
    }), JSON.stringify(await second.page.evaluate(() => Math.round(document.getElementById('transportBody').getBoundingClientRect().height))));
    same('nothing of the owner\'s was written over', [cloud.docs.get('settings').revision, cloud.docs.get(DOC).revision], [1, 1]);
    // His list back, through the app's own question.
    await notices.first().locator('button').first().tap();
    await second.page.locator('#askModal').waitFor({ state: 'visible' });
    same('use my list asks first', bare(await second.page.locator('#askTitle').textContent()), W.useMineListTitle);
    await second.page.locator('#askOk').tap();
    const gone = await second.page.waitForFunction(() => document.querySelectorAll('#transportShare .transport-share-notice').length === 1, null, { timeout: 8000 })
        .then(() => true, () => false);
    // The notice goes at the tap; the list goes up a moment after, as any change does.
    let up = false;
    for (let waited = 0; waited < 8000 && !up; waited += 50) {
        up = cloud.docs.get('settings').revision === 2;
        if (!up) await second.page.waitForTimeout(50);
    }
    check('that notice is gone, and his list is the shared list now, as the next revision', gone && up
        && cloud.docs.get('settings').vehicles[2].name === 'ביוואידי אפור', JSON.stringify(cloud.docs.get('settings').vehicles[2]));
    check('the owner\'s phone draws the name, with no notice: it had nothing unsent', await owner.page.waitForFunction(() =>
        [...document.querySelectorAll('#transportBody .transport-vehicle-name')].some(node => node.textContent === 'ביוואידי אפור'), null, { timeout: 8000 })
        .then(() => true, () => false) && (await owner.page.locator('#transportShare .transport-share-notice').count()) === 0);

    // A phone that never touched the list or a plan.
    const third = await phone({ width: 375, height: 667, scheme: 'dark', gate: true, cloud });
    const writes = cloud.writes.length;
    await third.openPanel();
    await third.connect();
    check('a phone with neither draws the shared day', await waitDrawn(third.page, 'tv_01', 'w_01 - - - -'), await drawn(third.page, 'tv_01'));
    same('says shared, with no notice', [await waitLine(third.page, W.shared), await third.page.locator('#transportShare .transport-share-notice').count()], [true, 0]);
    same('and wrote nothing to the cloud: an untouched list of seven is not uploaded', cloud.writes.length, writes);
    same('no error, no dialog', [owner.errors, owner.dialogs, second.errors, second.dialogs, third.errors, third.dialogs], [[], [], [], [], [], []]);
    await owner.context.close();
    await second.context.close();
    await third.context.close();
});

// THE FIRST MEETING ON THE SMALLEST PHONE, WITH «תצוגה גדולה» ON (v191's review). The two
// notices and the line take at most two fifths of the screen and scroll inside it; at the
// mode's sizes on a 568px phone that left the cars 67px under the waiting men - no seat
// (84px and up) whole, the whole window inside a drag's two edge strips. With the mode on
// a short screen gives them a quarter (css/large.css). Held: under the tray there is room
// for the tallest seat on the screen, the notices still scroll inside their own box, and
// every one of their buttons can be reached there.
await block('the first meeting on a 320x568 phone with the large display on: the cars keep room for a whole seat', async () => {
    const cloud = makeTransportCloud();
    const owner = await phone({ width: 375, height: 667, scheme: 'dark', gate: true, cloud });
    await owner.page.evaluate(day => { transportRenameVehicle('tv_02', 'קורולה לבנה'); transportPlace(day, 'w_01', 'tv_01', 1); }, DAY);
    await owner.openPanel();
    await owner.connect();
    given('the owner\'s phone made the shared list and day', await waitLine(owner.page, W.shared), [...cloud.docs.keys()].join(','));
    const small = await phone({ width: 320, height: 568, scheme: 'dark', gate: true, cloud, large: true });
    await small.page.evaluate(day => { transportRenameVehicle('tv_03', 'ביוואידי אפור'); transportPlace(day, 'w_04', 'tv_03', 1); }, DAY);
    await small.openPanel();
    await small.connect();
    await small.page.waitForFunction(() => document.querySelectorAll('#transportShare .transport-share-notice').length === 2, null, { timeout: 8000 }).catch(() => {});
    await small.page.waitForTimeout(200);
    const room = await small.page.evaluate(() => {
        const body = document.getElementById('transportBody').getBoundingClientRect();
        const tray = document.getElementById('transportTray').getBoundingClientRect();
        const share = document.getElementById('transportShare');
        const box = share.getBoundingClientRect();
        const seats = [...document.querySelectorAll('#transportBody .transport-seat')].map(seat => seat.getBoundingClientRect().height);
        // Each button of the notices, scrolled to inside the box: on the glass there.
        const reached = [...share.querySelectorAll('button')].map(node => {
            node.scrollIntoView({ block: 'nearest' });
            const at = node.getBoundingClientRect();
            const now = share.getBoundingClientRect();
            return at.top >= now.top - 1 && at.bottom <= now.bottom + 1;
        });
        share.scrollTop = 0;
        return { large: document.documentElement.classList.contains('display-large'), notices: share.querySelectorAll('.transport-share-notice').length,
            window: Math.round(body.bottom - tray.bottom), tallest: Math.round(Math.max(...seats)), share: Math.round(box.height),
            scrolls: share.scrollHeight > share.clientHeight + 1, reached, height: window.innerHeight };
    });
    given('the mode is on, and both notices are up', room.large && room.notices === 2, JSON.stringify(room));
    check('under the waiting men there is room for the tallest seat on the screen', room.window >= room.tallest, JSON.stringify(room));
    check('the notices take a quarter of the screen at most, and scroll inside it', room.share <= Math.ceil(room.height / 4) + 1 && room.scrolls, JSON.stringify(room));
    check('and each of their four buttons can be reached there', room.reached.length === 4 && room.reached.every(Boolean), JSON.stringify(room.reached));
    same('no error, no dialog', [owner.errors, owner.dialogs, small.errors, small.dialogs], [[], [], [], []]);
    await owner.context.close();
    await small.context.close();
});

// THE SEDER'S JOURNEY (js/ui/journey.js) reads the rides at two of its stations: the bar
// over this screen at station 3, and the last look at station 4 - which is drawn with the
// rides screen SHUT. A plan adopted from another phone has to reach both.
await block('the journey on one phone says what the other phone just did', async () => {
    const cloud = makeTransportCloud();
    const a = await phone({ width: 440, height: 956, scheme: 'dark', gate: true, cloud });
    const b = await phone({ width: 440, height: 956, scheme: 'dark', gate: true, cloud });
    await a.openPanel();
    await a.connect();
    await b.connect();
    // B walks the journey for that day and stands on the rides.
    await b.page.evaluate(day => { journeyStart(); journeyLive.date = day; journeyGo(3); }, DAY);
    await b.page.locator('#journeyRideStatus').waitFor({ state: 'visible' });
    given('B is on station 3 with the rides open and shared', (await b.page.evaluate(() => journeyStation())) === 3
        && await waitLine(b.page, W.shared), await lineOf(b.page));
    const barOf = async page => bare(await page.locator('#journeyRideStatus').textContent());
    same('six men, nobody seated: the bar says six have no seat', await barOf(b.page), 'בלי מושב: 6');
    await seatByTaps(a.page, 'w_01', 'tv_01', 1);
    const five = await b.page.waitForFunction(() => document.getElementById('journeyRideStatus')
        && document.getElementById('journeyRideStatus').textContent.includes('5'), null, { timeout: 8000 }).then(() => true, () => false);
    check('A seats a man: B\'s bar counts five, with nobody touching B', five, await barOf(b.page));
    same('and B\'s picture has him', await drawn(b.page, 'tv_01'), 'w_01 - - - -');
    // The last look: the rides screen is shut, the journey's own panel is up.
    await b.page.evaluate(() => { journeyGo(4); });
    await b.page.locator('#journeyLookRides').waitFor({ state: 'visible' });
    same('B is on the last look, and the rides screen is shut',
        await b.page.evaluate(() => [journeyStation(), transportIsOpen()]), [4, false]);
    const look = async () => bare(await b.page.locator('#journeyLookRides').textContent());
    given('the last look says what the picture says: one of five in the car, five men waiting',
        (await look()).includes('1 מתוך 5') && (await look()).includes('ממתינים לשיבוץ (5)'), await look());
    await seatByTaps(a.page, 'w_02', 'tv_01', 2);
    const seen = await b.page.waitForFunction(() => {
        const said = document.getElementById('journeyLookRides').textContent;
        return said.includes('2 מתוך 5') && said.includes('(4)');
    }, null, { timeout: 8000 }).then(() => true, () => false);
    check('A seats another: B\'s last look says two of five and four waiting, with the rides screen still shut', seen, await look());
    same('the rides screen was not opened by it', await b.page.evaluate(() => [journeyStation(), transportIsOpen()]), [4, false]);
    same('no error, no dialog', [a.errors, a.dialogs, b.errors, b.dialogs], [[], [], [], []]);
    await a.context.close();
    await b.context.close();
});

for (const [width, height] of [[440, 956], [375, 667]]) {
    for (const scheme of ['dark', 'light']) await twoPhones(width, height, scheme);
}

await browser.close();
await server.close();
report();
