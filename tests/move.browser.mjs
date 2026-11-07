import { launchLocalBrowser } from './network-guard.mjs';
// Moving a man from one site to another, from the BY-SITE screen, by real clicks.
//
//   node tests/move.browser.mjs
//
// THE REPORT THIS EXISTS FOR: «if I move a worker from one place to another I have to
// repeat the operation about five times before it takes», and «especially when I am
// recording in לפי אתר». Nothing in this repository drove that path. tests/smoke.mjs
// opens the picker on the FIRST .site-card only and adds two men to that one site;
// tests/snapshot.stale.test.mjs moves a man by calling assignPlace/unassignPlace on the
// model and never touches a button. So the one gesture the owner described - open the
// target site's ＋, tap the name, and expect the record to change - was measured nowhere.
//
// WHAT THIS FILE DOES NOT ASSERT, deliberately. Two sites in one day are allowed
// (MAX_ENTRIES_PER_DAY = 2) and assignPlace ADDS rather than replaces, by design: «two
// sites in a day is the normal case here, so a second assignment must not silently
// discard the first». So a man still being at A after he is added to B is NOT a defect
// and this suite does not ask for an atomic move. What it asks is narrower and is the
// only thing the symptom can be:
//
//   EVERY CLICK DOES WHAT ITS OWN BUTTON PROMISES, ON THE FIRST CLICK.
//
// «+ הוסף» promises this man gains THIS site. «✓ נמצא» promises he loses it. «✕» on a
// card row promises he loses that card's site. A click whose record afterwards says
// something else is a failed attempt, and failed attempts are what a person repeats.
// So two numbers are kept apart and reported separately:
//
//   steps   - intentional UI actions the accepted design needs (add at B, remove at A
//             = two; that is the design, not a fault)
//   retries - clicks whose record contradicted the clicked button's own promise
//
// The symptom is retries > 0. steps is reported so that a count of two is never read as
// a count of two failures.
//
// SYNTHETIC ONLY: two invented men with fixed ids and fixed rates, three invented sites,
// one invented day. No real record, no worker data, no network - network-guard.mjs maps
// every host but loopback to NOTFOUND, so the page cannot reach Firebase or any CDN even
// if it tries. The only injections are inside this file: FarkadSync.edit made to refuse
// one journal write (the law-3 path), and Store.setVerified made slow for a bounded
// 120ms, both restored immediately afterwards. Nothing is patched to force a success.

import { serve } from './serve.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { suite, check, given, report } from './runner.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const EXEC = process.env.CHROME_PATH || undefined;
const SERVED_ROOT = new URL('..', import.meta.url).pathname;
const server = process.env.SMOKE_URL
    ? { url: process.env.SMOKE_URL, close: () => {} }
    : await serve(SERVED_ROOT);

// Whatever the origin handed the browser, hashed against the commit - the same guard the
// other browser suites carry, for the same reason: a run rooted at another tree would
// pass every check below and the count would mean nothing.
const SERVED = await verifyServedAssets(server.url, SERVED_ROOT, expectedShaFor(SERVED_ROOT));
check('the origin served this commit, byte for byte',
    SERVED.ok, `${SERVED.checked} assets; ${SERVED.wrong.slice(0, 3).join(' | ')}`);

const browser = await launchLocalBrowser(chromium, EXEC ? { executablePath: EXEC } : {});

// ------------------------------------------------------------------------ the fixture
const DAY = '2026-09-15';
const W1 = { id: 'w_mv_01', name: 'עובד ניסיון א', dailyRate: 400 };
const W2 = { id: 'w_mv_02', name: 'עובד ניסיון ב', dailyRate: 450 };
const SITES = [
    { id: 'p_mv_a', name: 'אתר ניסיון א' },
    { id: 'p_mv_b', name: 'אתר ניסיון ב' },
    { id: 'p_mv_c', name: 'אתר ניסיון ג' }
];
const A = 0, B = 1, C = 2;       // card indexes: State.activePlaces() keeps roster order

const errors = [];               // uncaught page errors - the signal
const noise = [];                // the unreachable SDK and blocked hosts - not failures

async function open() {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();

    // The adapter cannot be fetched on this origin at all (by design: see network-guard),
    // and treating that as a failure would make this suite red for the network rather
    // than for the app. Narrow on purpose - matched by the adapter's own path - so any
    // other module failing to import is still a failure.
    const ADAPTER_UNREACHABLE = /Failed to fetch dynamically imported module:.*js\/sync\/firebase-adapter\.js/;
    page.on('pageerror', error => errors.push(String(error && error.message)));
    page.on('console', message => {
        if (message.type() !== 'error') return;
        const text = message.text();
        if (text.indexOf('ERR_') !== -1 || text.indexOf('Failed to load resource') !== -1
            || text.indexOf('blockedbyclient') !== -1 || ADAPTER_UNREACHABLE.test(text)) {
            noise.push(text);
            return;
        }
        errors.push(text);
    });
    await page.goto(`${server.url}/index.html`, { waitUntil: 'load' });
    await page.waitForTimeout(400);

    await page.evaluate(([day, w1, w2, sites]) => {
        // The day screen draws State.date, and the header names "today" - pinned so the
        // run does not change meaning when the container's clock does.
        todayStr = () => day;
        State.date = day;
        State.schedule.workers = [
            { id: w1.id, name: w1.name, active: true, dailyRate: w1.dailyRate, hourlyRate: 0 },
            { id: w2.id, name: w2.name, active: true, dailyRate: w2.dailyRate, hourlyRate: 0 }
        ];
        State.schedule.places = sites.map(site =>
            ({ id: site.id, name: site.name, active: true }));
        State.commitRoster();
        // BY SITE, which is the screen the report names. dayMode is a module-level let
        // read from storage at load, so it is set through the product's own switch.
        if (typeof setDayMode === 'function') setDayMode('sites');
        showView('day');
        render();
    }, [DAY, W1, W2, SITES]);
    await page.waitForTimeout(250);
    return page;
}

// --------------------------------------------------------------------- the instrument
//
// One read, taken from BOTH sides of the save: the live schedule the screen is drawn
// from, and the durable copy in localStorage. A screen that shows the move and a disk
// that does not is the exact shape of "I did it and it came back", and a reader that
// only looked at one of them could not tell them apart.
const STATE = ([day, w1, w2]) => {
    const show = node => node ? getComputedStyle(node).display : 'absent';
    const strip = text => String(text || '').replace(/[⁨⁩‎]/g, '');
    const entriesIn = (source, id) => {
        const record = (((source.days || {})[day] || {}).actual || {})[id] || null;
        if (!record) return null;
        return {
            places: (record.entries || []).map(entry => entry.placeId),
            rates: record.rates ? JSON.stringify(record.rates) : null,
            absent: Boolean(record.absent)
        };
    };
    let disk = {};
    try { disk = JSON.parse(localStorage.getItem('scheduleData:v2') || '{}'); } catch (e) { disk = {}; }

    const modal = document.getElementById('workerPickerModal');
    const ask = document.getElementById('askModal');
    return {
        date: State.date,
        layer: State.layer,
        live: { one: entriesIn(State.schedule, w1), two: entriesIn(State.schedule, w2) },
        disk: { one: entriesIn(disk, w1), two: entriesIn(disk, w2) },
        picker: {
            display: show(modal),
            title: strip((document.getElementById('workerPickerTitle') || {}).textContent),
            rows: [...document.querySelectorAll('#workerPickerList .picker-row')]
                .map(row => row.dataset.workerId),
            buttons: [...document.querySelectorAll('#workerPickerList .picker-row')]
                .map(row => ({
                    worker: row.dataset.workerId,
                    text: strip(row.querySelector('button').textContent),
                    pressed: row.querySelector('button').getAttribute('aria-pressed')
                }))
        },
        ask: {
            display: show(ask),
            title: strip((document.getElementById('askTitle') || {}).textContent),
            message: strip((document.getElementById('askMessage') || {}).textContent)
        },
        cards: [...document.querySelectorAll('.site-card')].map(card => ({
            head: strip(card.querySelector('h3').textContent),
            count: (card.querySelector('.site-count') || {}).textContent,
            rows: [...card.querySelectorAll('.assign-row')].map(row => ({
                name: strip((row.querySelector('.assign-name') || {}).textContent),
                split: Boolean(row.querySelector('.badge-split'))
            }))
        }))
    };
};

const look = page => page.evaluate(STATE, [DAY, W1.id, W2.id]);

const placesOf = (snapshot, who) =>
    ((snapshot.live[who] || {}).places || []).slice().sort().join('+') || '-';
const diskOf = (snapshot, who) =>
    ((snapshot.disk[who] || {}).places || []).slice().sort().join('+') || '-';

// A click, and what it promised. The promise is read off the BUTTON, before the finger
// lands: that is the whole point - the record is compared with what the person was told
// would happen, not with what the test author expected.
const LOG = [];
async function tap(page, what, selector) {
    const before = await look(page);
    const promise = await page.evaluate(sel => {
        const node = document.querySelector(sel);
        if (!node) return null;
        const strip = text => String(text || '').replace(/[⁨⁩‎]/g, '');
        return { text: strip(node.textContent), pressed: node.getAttribute('aria-pressed'),
            label: strip(node.getAttribute('aria-label')) };
    }, selector);
    if (!promise) return { before, promise: null, after: before, honoured: false, missing: true };

    await page.click(selector);
    // The commit is synchronous; the render it triggers is not always in the same task.
    await page.waitForTimeout(120);
    const after = await look(page);

    LOG.push({ what, button: promise.text, pressed: promise.pressed,
        one: `${placesOf(before, 'one')} -> ${placesOf(after, 'one')}`,
        disk: `${diskOf(before, 'one')} -> ${diskOf(after, 'one')}`,
        told: after.ask.display === 'flex' ? after.ask.message.slice(0, 40) : '' });
    return { before, promise, after };
}

const pickerRow = id => `#workerPickerList .picker-row[data-worker-id="${id}"] button`;
const siteAdd = index => `.site-grid > .site-card:nth-child(${index + 1}) .site-head-btn`;

// Counts the places a worker holds in the live record AND on the disk, and says whether
// both agree - a disagreement is itself the answer to "why did it come back".
const holds = (snapshot, who, placeId) => ({
    live: ((snapshot.live[who] || {}).places || []).indexOf(placeId) !== -1,
    disk: ((snapshot.disk[who] || {}).places || []).indexOf(placeId) !== -1
});

// ============================================================ 1. one move, counted
{
    suite('recording at a site, then moving the man to another - by clicks, counted');

    const page = await open();
    const start = await look(page);
    given('the by-site screen drew the three invented sites',
        start.cards.length === 3 && start.cards[A].head.indexOf(SITES[A].name) !== -1
        && start.cards[B].head.indexOf(SITES[B].name) !== -1
        && start.cards[C].head.indexOf(SITES[C].name) !== -1,
        JSON.stringify(start.cards.map(card => card.head)));
    given('neither invented man is recorded anywhere yet',
        start.live.one === null && start.live.two === null,
        JSON.stringify(start.live));

    let steps = 0, retries = 0;

    // ---- step 1: record him at A, through the site's own ＋
    await page.click(siteAdd(A));
    await page.waitForTimeout(150);
    const opened = await look(page);
    given('the ＋ on the first card opened the picker for that site',
        opened.picker.display === 'flex'
        && opened.picker.title.indexOf(SITES[A].name) !== -1,
        JSON.stringify(opened.picker.title));
    given('the picker lists both invented men',
        opened.picker.rows.length === 2, JSON.stringify(opened.picker.rows));

    const addA = await tap(page, 'picker A: + הוסף', pickerRow(W1.id));
    steps += 1;
    given('the button offered to ADD him', addA.promise
        && addA.promise.text.indexOf('הוסף') !== -1 && addA.promise.pressed === 'false',
        JSON.stringify(addA.promise));
    const atA = holds(addA.after, 'one', SITES[A].id);
    if (!(atA.live && atA.disk)) retries += 1;
    check('one click on «+ הוסף» records him at that site, in memory and on the disk',
        atA.live && atA.disk, JSON.stringify({ atA, live: placesOf(addA.after, 'one'),
            disk: diskOf(addA.after, 'one') }));
    check('and the button now says he is there',
        (addA.after.picker.buttons.find(b => b.worker === W1.id) || {}).text.indexOf('נמצא') !== -1
        && (addA.after.picker.buttons.find(b => b.worker === W1.id) || {}).pressed === 'true',
        JSON.stringify(addA.after.picker.buttons));
    check('the site he was NOT added to stays empty',
        addA.after.cards[B].rows.length === 0 && addA.after.cards[C].rows.length === 0,
        JSON.stringify(addA.after.cards.map(card => card.rows.length)));
    check('and the other man is untouched',
        addA.after.live.two === null && addA.after.disk.two === null,
        JSON.stringify({ live: addA.after.live.two, disk: addA.after.disk.two }));

    // Close and reopen: a state that only exists inside one opening of the modal is a
    // state that comes back the moment the person looks away.
    await page.click('#workerPickerModal button:has-text("סגור")');
    await page.waitForTimeout(100);
    const closed = await look(page);
    check('closing the picker leaves the record standing and the card showing him',
        closed.picker.display === 'none' && closed.cards[A].rows.length === 1
        && closed.cards[A].count === '1'
        && closed.cards[A].rows[0].name.indexOf(W1.name) !== -1,
        JSON.stringify({ display: closed.picker.display, card: closed.cards[A] }));

    // ---- step 2: the move - the TARGET site's ＋, one tap on his name
    await page.click(siteAdd(B));
    await page.waitForTimeout(150);
    const atB = await look(page);
    given('the second card\'s ＋ opened the picker for the SECOND site',
        atB.picker.display === 'flex' && atB.picker.title.indexOf(SITES[B].name) !== -1,
        JSON.stringify(atB.picker.title));
    const addB = await tap(page, 'picker B: + הוסף', pickerRow(W1.id));
    steps += 1;
    given('the button offered to ADD him to the target site',
        addB.promise && addB.promise.text.indexOf('הוסף') !== -1,
        JSON.stringify(addB.promise));
    const nowB = holds(addB.after, 'one', SITES[B].id);
    if (!(nowB.live && nowB.disk)) retries += 1;
    check('one click records him at the TARGET site, in memory and on the disk',
        nowB.live && nowB.disk,
        JSON.stringify({ nowB, live: placesOf(addB.after, 'one'), disk: diskOf(addB.after, 'one') }));
    // The accepted behaviour, pinned so that nobody later reads this suite as asking for
    // an atomic move: he is at BOTH, and the screen says so.
    check('he is now at both sites, which is the accepted behaviour, and the row says so',
        placesOf(addB.after, 'one') === [SITES[A].id, SITES[B].id].sort().join('+')
        && addB.after.cards[A].rows[0].split === true
        && addB.after.cards[B].rows[0].split === true,
        JSON.stringify({ places: placesOf(addB.after, 'one'),
            badges: [addB.after.cards[A].rows[0], addB.after.cards[B].rows[0]] }));

    // ---- step 3: finish the move - the old site's ✕, one tap
    await page.click('#workerPickerModal button:has-text("סגור")');
    await page.waitForTimeout(100);
    const removeA = await tap(page, 'card A: ✕',
        `.site-grid > .site-card:nth-child(${A + 1}) .assign-row button.btn-icon`);
    steps += 1;
    given('the button offered to REMOVE him from the old site',
        removeA.promise && removeA.promise.label.indexOf('הסר') === 0,
        JSON.stringify(removeA.promise));
    const goneA = holds(removeA.after, 'one', SITES[A].id);
    if (goneA.live || goneA.disk) retries += 1;
    check('one click on ✕ takes him off the old site, in memory and on the disk',
        !goneA.live && !goneA.disk,
        JSON.stringify({ goneA, live: placesOf(removeA.after, 'one'),
            disk: diskOf(removeA.after, 'one') }));
    check('and leaves him at the target site alone',
        placesOf(removeA.after, 'one') === SITES[B].id
        && removeA.after.cards[A].rows.length === 0
        && removeA.after.cards[B].rows.length === 1
        && removeA.after.cards[B].rows[0].split === false,
        JSON.stringify({ places: placesOf(removeA.after, 'one'),
            cards: removeA.after.cards.map(card => card.rows.length) }));

    // ---- the two numbers, kept apart
    check('the move took the three UI steps the design asks for, and no more',
        steps === 3, `steps=${steps}`);
    check('AND NOT ONE CLICK HAD TO BE REPEATED: every click did what its button promised',
        retries === 0, `retries=${retries}`);

    // ---- the day, the man, the wage: unmoved by any of it
    const end = await look(page);
    check('the day never moved under the edits',
        end.date === DAY && end.layer === 'actual', JSON.stringify([end.date, end.layer]));
    check('the rate stamped at the first write survived every later edit',
        end.live.one && end.live.one.rates === JSON.stringify({ daily: W1.dailyRate, hourly: 0 }),
        JSON.stringify((end.live.one || {}).rates));
    check('the other man was never recorded by any of it',
        end.live.two === null && end.disk.two === null,
        JSON.stringify({ live: end.live.two, disk: end.disk.two }));

    console.log('\n  clicks, in order:');
    LOG.forEach((row, at) => console.log(`   ${at + 1}. ${row.what} [${row.button}`
        + `, aria-pressed=${row.pressed}]  live ${row.one}  disk ${row.disk}`
        + (row.told ? `  told: ${row.told}` : '')));

    await page.context().close();
}

// ================================================ 2. five clicks on the same button
{
    suite('five taps on the same button, each measured against what that button said');

    const page = await open();
    await page.evaluate(([day, w1, site]) => {
        State.commit(assignPlace(State.schedule, day, w1, 'actual', site, 'normal'));
    }, [DAY, W1.id, SITES[A].id]);
    await page.waitForTimeout(100);
    await page.click(siteAdd(B));
    await page.waitForTimeout(150);

    const story = [];
    let dishonoured = 0;
    for (let round = 1; round <= 5; round += 1) {
        // Five DECISIONS, each made after the last one was drawn. Inside 700 ms a second tap
        // on the same row is the first one again and does nothing (DOUBLE_TAP_GUARD_MS,
        // js/ui/day.js - suite 3 below measures that); what this suite asks is that every
        // tap a person means does what its button said.
        if (round > 1) await page.waitForTimeout(800);
        const step = await tap(page, `round ${round}`, pickerRow(W1.id));
        if (!step.promise) { dishonoured += 1; story.push({ round, missing: true }); continue; }
        // The promise, read off the button before the tap: pressed=false means «+ הוסף»
        // (he will be here afterwards), pressed=true means «✓ נמצא» (he will not).
        const wanted = step.promise.pressed === 'false';
        const got = holds(step.after, 'one', SITES[B].id);
        const honoured = got.live === wanted && got.disk === wanted;
        if (!honoured) dishonoured += 1;
        story.push({ round, said: step.promise.text, wanted, live: got.live, disk: got.disk,
            places: placesOf(step.after, 'one'), honoured });
    }

    check('all five taps did exactly what the button said, each time',
        dishonoured === 0, JSON.stringify(story));
    const after = await look(page);
    check('and the five taps are a toggle, so the odd one leaves him there',
        holds(after, 'one', SITES[B].id).live === true,
        JSON.stringify(story[story.length - 1]));
    check('five taps never duplicated an entry',
        (after.live.one.places || []).length
            === new Set(after.live.one.places).size
        && after.live.one.places.length <= 2,
        JSON.stringify(after.live.one));
    check('five taps never moved the day, the wage, or the other man',
        after.date === DAY
        && after.live.one.rates === JSON.stringify({ daily: W1.dailyRate, hourly: 0 })
        && after.live.two === null,
        JSON.stringify({ date: after.date, rates: after.live.one.rates, two: after.live.two }));
    check('and the old site was never disturbed by taps aimed at the new one',
        holds(after, 'one', SITES[A].id).live === true
        && holds(after, 'one', SITES[A].id).disk === true,
        JSON.stringify(holds(after, 'one', SITES[A].id)));

    // The row the finger was on stayed where it was for all five - the guarantee that
    // makes a mistaken tap self-correcting.
    check('the row kept its place in the list for all five taps',
        after.picker.rows.join() === [W1.id, W2.id].join()
        || after.picker.rows.join() === [W2.id, W1.id].join(),
        JSON.stringify(after.picker.rows));

    console.log('\n  five taps:');
    story.forEach(row => console.log(`   ${row.round}. said «${row.said}» -> expected here=`
        + `${row.wanted}; live=${row.live} disk=${row.disk} places=${row.places}`
        + `  ${row.honoured ? 'honoured' : 'NOT HONOURED'}`));

    await page.context().close();
}

// ========================================== 3. a second tap before the first has drawn
{
    suite('two taps at one spot, with a slow disk under them');

    const page = await open();
    await page.evaluate(([day, w1, site]) => {
        State.commit(assignPlace(State.schedule, day, w1, 'actual', site, 'normal'));
    }, [DAY, W1.id, SITES[A].id]);
    await page.click(siteAdd(B));
    await page.waitForTimeout(150);

    // A BOUNDED synthetic delay on the durable write, inside this file only: 120ms of
    // real work in the same place a slow phone spends it. Nothing is faked into
    // succeeding - setVerified still does its own write and its own read-back.
    const slowed = await page.evaluate(() => {
        if (typeof Store === 'undefined' || typeof Store.setVerified !== 'function') return false;
        window.__realSetVerified = Store.setVerified;
        Store.setVerified = function (key, value) {
            const until = performance.now() + 120;
            while (performance.now() < until) { /* a slow disk, honestly slow */ }
            return window.__realSetVerified.call(this, key, value);
        };
        return true;
    });
    given('the durable write was slowed for this page only', slowed === true, String(slowed));

    const box = await page.locator(pickerRow(W1.id)).boundingBox();
    given('the button has a box to aim at', Boolean(box && box.width && box.height),
        JSON.stringify(box));
    // 44px in BOTH dimensions, measured where the finger actually lands. Below that a
    // tap misses, and a missed tap is indistinguishable from an ignored one.
    check('the picker\'s own button is a finger-sized target',
        box.width >= 44 && box.height >= 44,
        JSON.stringify({ width: box.width, height: box.height }));

    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    // Two taps at ONE screen point, the second before the first has finished drawing -
    // which is what a person does when nothing seems to have happened. Not dblclick:
    // that re-resolves the element, and the question here is what the SECOND tap lands
    // on after the list has been rebuilt under it.
    await page.mouse.click(x, y);
    await page.mouse.click(x, y);
    await page.waitForTimeout(400);
    const twice = await look(page);

    await page.evaluate(() => {
        if (window.__realSetVerified && typeof Store !== 'undefined') {
            Store.setVerified = window.__realSetVerified;
        }
    });

    // Two taps at one spot inside 700 ms are ONE tap (DOUBLE_TAP_GUARD_MS, js/ui/day.js).
    // This used to pin add-then-remove - he ended where he started - and that is the owner's
    // report, word for word: «+ הוסף» had turned into «✓ נמצא» under his finger, and "I
    // added him twice and he was deleted". So he ends where the FIRST tap put him. The
    // failure this still looks for is an end state that is neither - a duplicate, a third
    // site, or the OTHER man moved because the row under the finger changed identity.
    check('two fast taps on one spot are one tap: he is added, and nothing stray is written',
        holds(twice, 'one', SITES[B].id).live === true
        && holds(twice, 'one', SITES[B].id).disk === true
        && holds(twice, 'one', SITES[A].id).live === true,
        JSON.stringify({ one: placesOf(twice, 'one'), disk: diskOf(twice, 'one') }));
    check('and the second tap did not land on the other man',
        twice.live.two === null && twice.disk.two === null,
        JSON.stringify({ live: twice.live.two, disk: twice.disk.two }));
    check('memory and disk agree after the pair',
        placesOf(twice, 'one') === diskOf(twice, 'one'),
        JSON.stringify({ live: placesOf(twice, 'one'), disk: diskOf(twice, 'one') }));

    await page.context().close();
}

// ================================================= 4. the third site, and its refusal
{
    suite('a third site is refused, out loud, and the picker is still usable afterwards');

    const page = await open();
    await page.evaluate(([day, w1, a, b]) => {
        State.commit(assignPlace(State.schedule, day, w1, 'actual', a, 'normal'));
        State.commit(assignPlace(State.schedule, day, w1, 'actual', b, 'normal'));
    }, [DAY, W1.id, SITES[A].id, SITES[B].id]);
    await page.waitForTimeout(120);
    const two = await look(page);
    given('he is recorded at two sites, which is the cap',
        (two.live.one.places || []).length === 2, JSON.stringify(two.live.one));

    await page.click(siteAdd(C));
    await page.waitForTimeout(150);
    const third = await tap(page, 'picker C: + הוסף (over the cap)', pickerRow(W1.id));
    given('the third site\'s button still offered to add him',
        third.promise && third.promise.text.indexOf('הוסף') !== -1,
        JSON.stringify(third.promise));

    // THE RULE IS NOT CHANGED HERE. What is measured is that the refusal is spoken -
    // State.commit's own comment says a refusal handled in silence «looks exactly like a
    // tap that did not register, and the person taps again» - and that it says the
    // sentence the model wrote, not a different one.
    check('the refusal is shown to the person, in the model\'s own words',
        third.after.ask.display === 'flex'
        && third.after.ask.message === 'אפשר לרשום עד 2 אתרים ליום לעובד.',
        JSON.stringify(third.after.ask));
    check('and no third site reached the record, in memory or on the disk',
        (third.after.live.one.places || []).length === 2
        && (third.after.disk.one.places || []).length === 2
        && holds(third.after, 'one', SITES[C].id).live === false,
        JSON.stringify({ live: placesOf(third.after, 'one'), disk: diskOf(third.after, 'one') }));

    // The thing a person would experience as "the tap did nothing": the dialog is a
    // second overlay above the picker, so the NEXT tap aimed at a row may land on the
    // dialog instead. Measured, not assumed - whatever the answer, it is evidence.
    const covered = await page.evaluate(sel => {
        const node = document.querySelector(sel);
        if (!node) return { missing: true };
        const box = node.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        const modal = hit && hit.closest ? hit.closest('.modal') : null;
        return { hitTag: hit ? hit.tagName : null, hitIsButton: hit === node,
            inModal: modal ? modal.id : null };
    }, pickerRow(W1.id));
    check('while the refusal is up, a tap at the row lands on the dialog, not the row',
        covered.inModal === 'askModal' || covered.hitIsButton === false,
        JSON.stringify(covered));

    await page.click('#askOk');
    await page.waitForTimeout(150);
    const back = await look(page);
    check('closing the refusal leaves the picker open and the rows live again',
        back.ask.display === 'none' && back.picker.display === 'flex'
        && back.picker.rows.length === 2, JSON.stringify({ ask: back.ask.display,
            picker: back.picker.display, rows: back.picker.rows }));

    // And one honest click still works right after the refusal: removing him from a site
    // he IS at, which is what a person does next.
    await page.click('#workerPickerModal button:has-text("סגור")');
    await page.waitForTimeout(100);
    const freed = await tap(page, 'card A: ✕ after the refusal',
        `.site-grid > .site-card:nth-child(${A + 1}) .assign-row button.btn-icon`);
    check('one click after a refusal still does what its button says',
        holds(freed.after, 'one', SITES[A].id).live === false
        && holds(freed.after, 'one', SITES[A].id).disk === false,
        JSON.stringify({ live: placesOf(freed.after, 'one'), disk: diskOf(freed.after, 'one') }));

    await page.context().close();
}

// ========================================== 5. a save that does not land, and the retry
{
    suite('a journal write that refuses: nothing is shown as saved, and one retry takes');

    const page = await open();
    await page.evaluate(([day, w1, site]) => {
        State.commit(assignPlace(State.schedule, day, w1, 'actual', site, 'normal'));
    }, [DAY, W1.id, SITES[A].id]);
    await page.click(siteAdd(B));
    await page.waitForTimeout(150);

    // ONE refused journal write, injected here and nowhere else. This is the law-3 path:
    // an edit with nowhere durable to live must roll memory back and say so, never sit
    // on the screen looking recorded. Nothing is patched to make a write succeed.
    const armed = await page.evaluate(() => {
        if (typeof FarkadSync === 'undefined' || typeof FarkadSync.edit !== 'function') return false;
        window.__realEdit = FarkadSync.edit.bind(FarkadSync);
        let used = false;
        FarkadSync.edit = function (path, value) {
            if (!used) { used = true; return false; }
            return window.__realEdit(path, value);
        };
        return true;
    });
    given('one journal write is armed to refuse', armed === true, String(armed));

    const refused = await tap(page, 'picker B: + הוסף (journal refuses)', pickerRow(W1.id));
    const landed = holds(refused.after, 'one', SITES[B].id);
    check('a write that could not be journalled is not on the disk',
        landed.disk === false, JSON.stringify({ disk: diskOf(refused.after, 'one') }));
    check('and it is not left on the screen looking recorded either',
        landed.live === false, JSON.stringify({ live: placesOf(refused.after, 'one') }));
    check('the person is told the record was not saved',
        refused.after.ask.display === 'flex'
        && refused.after.ask.title === 'הרישום לא נשמר',
        JSON.stringify(refused.after.ask));
    check('and the work already recorded is untouched by the refusal',
        holds(refused.after, 'one', SITES[A].id).disk === true,
        JSON.stringify({ disk: diskOf(refused.after, 'one') }));

    // The retry. THIS is the number the report is about: after a refusal that was
    // explained, does ONE further click take?
    // WHICH BUTTON PUTS THE PERSON BACK. refuseEdit offers the backup export as the
    // PRIMARY action and «סגור» as the secondary one, so the way back to the picker is
    // the second button - pressing the first opens the export instead, which is right
    // for a full device and wrong for somebody who just wants to try the tap again.
    const buttons = await page.evaluate(() => {
        const visible = node => node && getComputedStyle(node).display !== 'none';
        const ok = document.getElementById('askOk');
        const cancel = document.getElementById('askCancel');
        return { ok: ok ? ok.textContent : null,
            cancel: visible(cancel) ? cancel.textContent : null };
    });
    check('the failure dialog offers a way out AND a plain close',
        buttons.ok === 'ייצוא קובץ גיבוי' && buttons.cancel === 'סגור',
        JSON.stringify(buttons));
    if (refused.after.ask.display === 'flex') {
        await page.click(buttons.cancel ? '#askCancel' : '#askOk');
        await page.waitForTimeout(200);
    }
    const again = await look(page);
    given('the picker survived the refusal and still lists him',
        again.picker.display === 'flex' && again.picker.rows.indexOf(W1.id) !== -1,
        JSON.stringify(again.picker));
    // A person reads the refusal before trying again; inside 700 ms the retry would be taken
    // for the refused tap itself (DOUBLE_TAP_GUARD_MS, js/ui/day.js).
    await page.waitForTimeout(800);
    const retry = await tap(page, 'picker B: + הוסף (retry)', pickerRow(W1.id));
    check('ONE retry after an explained failure records him',
        holds(retry.after, 'one', SITES[B].id).live === true
        && holds(retry.after, 'one', SITES[B].id).disk === true,
        JSON.stringify({ live: placesOf(retry.after, 'one'), disk: diskOf(retry.after, 'one') }));

    await page.evaluate(() => {
        if (window.__realEdit) FarkadSync.edit = window.__realEdit;
    });
    await page.context().close();
}

// ================================ 6. closing, reopening, and where the row then is
{
    suite('close and reopen: the record reads back, and the row is ranked afresh');

    const page = await open();
    await page.click(siteAdd(A));
    await page.waitForTimeout(150);
    const firstOpening = await look(page);
    given('nobody is recorded yet, so both men rank the same',
        firstOpening.picker.rows.length === 2 && firstOpening.live.one === null,
        JSON.stringify(firstOpening.picker.rows));
    check('with nobody recorded the list is the roster\'s own order',
        firstOpening.picker.rows[0] === W1.id,
        JSON.stringify(firstOpening.picker.rows));

    await tap(page, 'picker A: + הוסף', pickerRow(W1.id));
    await page.click('#workerPickerModal button:has-text("סגור")');
    await page.waitForTimeout(120);
    const shut = await look(page);
    given('the picker is shut', shut.picker.display === 'none', shut.picker.display);

    // REOPENED, on the same site. What the picker says must come from the record, not
    // from whatever the last opening happened to be holding.
    await page.click(siteAdd(A));
    await page.waitForTimeout(150);
    const reopened = await look(page);
    const row = reopened.picker.buttons.find(item => item.worker === W1.id) || {};
    check('the reopened picker reads the record back: the count, the button and the disk agree',
        reopened.picker.title.indexOf('1 רשומים') !== -1
        && row.text.indexOf('נמצא') !== -1 && row.pressed === 'true'
        && diskOf(reopened, 'one') === SITES[A].id,
        JSON.stringify({ title: reopened.picker.title, row, disk: diskOf(reopened, 'one') }));

    // THE MEASUREMENT, not a complaint: openWorkerPicker ranks a man already here BELOW
    // a man nobody has recorded, so a name that was at the top before the tap is at the
    // bottom the next time the sheet is opened. That is the ranking the file asks for -
    // unrecorded first, because an unrecorded man is the one who still needs a site -
    // and it is pinned here so that the position a thumb has to go to is a fact somebody
    // decided rather than a thing that drifts. Inside ONE opening the order never moves;
    // that is measured in the five-taps suite above.
    check('a man who is now recorded here is ranked last when the sheet is reopened',
        reopened.picker.rows[reopened.picker.rows.length - 1] === W1.id
        && firstOpening.picker.rows[0] === W1.id,
        JSON.stringify({ before: firstOpening.picker.rows, after: reopened.picker.rows }));

    // Twice more, to show the reopen is stable rather than alternating.
    await page.click('#workerPickerModal button:has-text("סגור")');
    await page.waitForTimeout(100);
    await page.click(siteAdd(A));
    await page.waitForTimeout(150);
    const thrice = await look(page);
    check('a second reopen says exactly the same thing',
        thrice.picker.rows.join() === reopened.picker.rows.join()
        && thrice.picker.title === reopened.picker.title,
        JSON.stringify({ rows: thrice.picker.rows, title: thrice.picker.title }));

    await page.context().close();
}

// ================ 7. the owner's own order: add, remove, add - then wait
{
    suite('add him to A, take him off A, add him to B - then several seconds of nothing');

    const page = await open();
    const log = [];
    const note = async (what, snapshot) => log.push(
        `${what}: live ${placesOf(snapshot, 'one')}  disk ${diskOf(snapshot, 'one')}`);

    // ---- add to A, through the site's own ＋
    await page.click(siteAdd(A));
    await page.waitForTimeout(150);
    const one = await tap(page, 'picker A: + הוסף', pickerRow(W1.id));
    given('he is at the first site', holds(one.after, 'one', SITES[A].id).live === true,
        placesOf(one.after, 'one'));
    await note('after the add to A', one.after);

    // ---- take him OFF A, through the card's ✕. This is the order the report names, and
    // it is not the one the three-step suite above drove: there the removal came last.
    await page.click('#workerPickerModal button:has-text("סגור")');
    await page.waitForTimeout(100);
    const two = await tap(page, 'card A: ✕',
        `.site-grid > .site-card:nth-child(${A + 1}) .assign-row button.btn-icon`);
    check('one click takes him off the first site, in memory and on the disk',
        holds(two.after, 'one', SITES[A].id).live === false
        && holds(two.after, 'one', SITES[A].id).disk === false,
        JSON.stringify({ live: placesOf(two.after, 'one'), disk: diskOf(two.after, 'one') }));
    await note('after the removal from A', two.after);

    // ---- add to B
    await page.click(siteAdd(B));
    await page.waitForTimeout(150);
    const three = await tap(page, 'picker B: + הוסף', pickerRow(W1.id));
    check('and the add then puts him at the second site ALONE',
        placesOf(three.after, 'one') === SITES[B].id
        && diskOf(three.after, 'one') === SITES[B].id,
        JSON.stringify({ live: placesOf(three.after, 'one'), disk: diskOf(three.after, 'one') }));
    await note('after the add to B', three.after);

    await page.click('#workerPickerModal button:has-text("סגור")');
    await page.waitForTimeout(100);

    // ---- AND THEN NOTHING, FOR SIX SECONDS. Longer than the send's own delay, longer
    // than the undo bar's timer, and long enough for anything the page does on a timer
    // of its own to have run. Nothing is clicked and nothing is delivered: this measures
    // the one window on its own.
    await page.waitForTimeout(6000);
    const later = await look(page);
    await note('after six seconds of nothing', later);

    check('six seconds later he is still at the second site, in memory',
        placesOf(later, 'one') === SITES[B].id, placesOf(later, 'one'));
    check('and on the disk',
        diskOf(later, 'one') === SITES[B].id, diskOf(later, 'one'));
    check('the old site did not come back on the screen either',
        later.cards[A].rows.length === 0 && later.cards[A].count === '0',
        JSON.stringify(later.cards[A]));
    check('and the new site shows him once, with no two-sites badge',
        later.cards[B].rows.length === 1 && later.cards[B].rows[0].split === false
        && later.cards[B].count === '1', JSON.stringify(later.cards[B]));
    check('a reload reads the same record back off the disk',
        await (async () => {
            await page.reload({ waitUntil: 'load' });
            await page.waitForTimeout(600);
            return page.evaluate(([day, worker, place]) => {
                const record = (((State.schedule.days || {})[day] || {}).actual || {})[worker];
                const places = ((record || {}).entries || []).map(entry => entry.placeId);
                return places.length === 1 && places[0] === place;
            }, [DAY, W1.id, SITES[B].id]);
        })(), 'after a real page reload');

    console.log('\n  the owner\'s order, step by step:');
    log.forEach(line => console.log(`   ${line}`));

    await page.context().close();
}

// ========== 9. TWO WINDOWS of the app, the owner's order, and the screen reopened
{
    suite('two windows of one app: the move, the other window\'s own edit, and a reopen');

    // Two pages in ONE context share the origin's localStorage, which is what two
    // windows of this app on one phone are. No cloud reaches either of them - the
    // adapter cannot be fetched on this origin by design - so the second window is a
    // window that hears nothing, which is the case the report describes: backgrounded,
    // its listener dropped, or an older build still served from the cache (law 7).
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const faults = [];
    const watch = page => page.on('pageerror', error => faults.push(String(error && error.message)));

    const settle = page => page.waitForTimeout(250);
    const openPage = async () => {
        const page = await context.newPage();
        watch(page);
        await page.goto(`${server.url}/index.html`, { waitUntil: 'load' });
        await page.waitForTimeout(500);
        return page;
    };
    // The day screen, on the invented day, by site. No roster is written here: a window
    // that opens on an existing record reads it through the app's own boot.
    const toDay = page => page.evaluate(day => {
        todayStr = () => day;
        State.date = day;
        if (typeof setDayMode === 'function') setDayMode('sites');
        showView('day');
        render();
    }, DAY);

    // ---- window one, and the roster
    const one = await openPage();
    await one.evaluate(([day, w1, w2, sites]) => {
        todayStr = () => day;
        State.date = day;
        State.schedule.workers = [
            { id: w1.id, name: w1.name, active: true, dailyRate: w1.dailyRate, hourlyRate: 0 },
            { id: w2.id, name: w2.name, active: true, dailyRate: w2.dailyRate, hourlyRate: 0 }];
        State.schedule.places = sites.map(site => ({ id: site.id, name: site.name, active: true }));
        State.commitRoster();
        if (typeof setDayMode === 'function') setDayMode('sites');
        showView('day');
        render();
    }, [DAY, W1, W2, SITES]);
    await settle(one);

    // ---- the man at A, by the site's own ＋
    await one.click(siteAdd(A));
    await one.waitForTimeout(150);
    await tap(one, 'w1 window one: + הוסף at A', pickerRow(W1.id));
    await one.click('#workerPickerModal button:has-text("סגור")');
    await settle(one);
    const seeded = await look(one);
    given('window one has him at the first site, on the disk',
        diskOf(seeded, 'one') === SITES[A].id, diskOf(seeded, 'one'));

    // ---- WINDOW TWO OPENS NOW, on the record as it stands: the man at A. From here on
    // it is a window holding a copy of that day that is about to go out of date.
    const two = await openPage();
    await toDay(two);
    await settle(two);
    const twoSees = await look(two);
    given('the second window opened on the same record and shows him at the first site',
        placesOf(twoSees, 'one') === SITES[A].id
        && twoSees.cards[A].rows.length === 1, placesOf(twoSees, 'one'));

    // ---- window one finishes the owner's sequence: ✕ on A, then ＋ on B
    const off = await tap(one, 'window one: ✕ on A',
        `.site-grid > .site-card:nth-child(${A + 1}) .assign-row button.btn-icon`);
    check('the removal lands on the disk',
        diskOf(off.after, 'one') === '-', diskOf(off.after, 'one'));
    await one.click(siteAdd(B));
    await one.waitForTimeout(150);
    const onto = await tap(one, 'window one: + הוסף at B', pickerRow(W1.id));
    await one.click('#workerPickerModal button:has-text("סגור")');
    await settle(one);
    given('and the add leaves him at the second site, memory and disk',
        placesOf(onto.after, 'one') === SITES[B].id
        && diskOf(onto.after, 'one') === SITES[B].id,
        JSON.stringify({ live: placesOf(onto.after, 'one'), disk: diskOf(onto.after, 'one') }));

    // ---- THE SECOND WINDOW'S OWN NEXT PIECE OF WORK: the other man, at the first site,
    // by real clicks. Its save writes the WHOLE schedule, and its whole schedule still
    // holds the first man at the site he was taken off.
    await two.click(siteAdd(A));
    await two.waitForTimeout(150);
    const other = await tap(two, 'window two: + הוסף the OTHER man at A', pickerRow(W2.id));
    given('the second window recorded the other man',
        holds(other.after, 'two', SITES[A].id).live === true,
        placesOf(other.after, 'two'));
    await two.click('#workerPickerModal button:has-text("סגור")');
    await two.waitForTimeout(400);

    // ---- several seconds of nothing, in both windows
    await one.waitForTimeout(6000);

    const disk = await look(two);
    check('THE SECOND WINDOW\'S EDIT DOES NOT PUT THE FIRST MAN BACK ON THE OLD SITE',
        diskOf(disk, 'one') === SITES[B].id,
        `disk says ${diskOf(disk, 'one')}`);
    check('and the other man it recorded is on the disk beside him, not instead of him',
        diskOf(disk, 'two') === SITES[A].id, diskOf(disk, 'two'));

    // ---- THE SCREEN REOPENED, which is what the report says happens next: off the day
    // screen and back onto it, and the picker opened again.
    const reopened = await one.evaluate(([day, worker]) => {
        showView('week'); render();
        showView('day'); render();
        const strip = text => String(text || '').replace(/[⁨⁩‎]/g, '');
        const cards = [...document.querySelectorAll('.site-grid > .site-card')].map(card => ({
            head: strip(card.querySelector('h3').textContent),
            count: (card.querySelector('.site-count') || {}).textContent,
            names: [...card.querySelectorAll('.assign-name')].map(node => strip(node.textContent))
        }));
        const record = (((State.schedule.days || {})[day] || {}).actual || {})[worker];
        return { cards, places: ((record || {}).entries || []).map(entry => entry.placeId) };
    }, [DAY, W1.id]);
    // THE GUARANTEE, and only it: the man who was MOVED is at the new site and not back
    // at the old one, after the screen has been left and come back to.
    check('leaving the day screen and coming back shows the moved man at the new site only',
        reopened.places.length === 1 && reopened.places[0] === SITES[B].id
        && reopened.cards[B].names.some(name => name.indexOf(W1.name) !== -1)
        && reopened.cards[A].names.every(name => name.indexOf(W1.name) === -1),
        JSON.stringify(reopened));

    // WHAT IS STILL TRUE AND IS NOT THIS FIX'S TO CHANGE, pinned here so it is visible
    // rather than discovered. There is no 'storage' listener anywhere in js/, so window
    // one does not learn that window two recorded the OTHER man: its card for the old
    // site is empty while the disk holds that man there. The record is right and a
    // window opened fresh shows both - checked below - so nothing is lost; what is
    // stale is one window's screen until it is reopened. Removing that staleness means
    // giving the app a cross-window listener, which is a change this evidence does not
    // reach and which is deliberately not made here.
    check('and window one does NOT yet show the other window\'s man - the known residual',
        reopened.cards[A].count === '0' && reopened.cards[A].names.length === 0,
        JSON.stringify(reopened.cards[A]));

    // And the picker for the OLD site, reopened: it must not offer him as «✓ נמצא».
    await one.click(siteAdd(A));
    await one.waitForTimeout(200);
    const pickerAgain = await look(one);
    check('the old site\'s picker, reopened, does not say he is there',
        (pickerAgain.picker.buttons.find(item => item.worker === W1.id) || {}).pressed === 'false',
        JSON.stringify(pickerAgain.picker.buttons));
    await one.click('#workerPickerModal button:has-text("סגור")');

    // ---- AND A FRESH WINDOW: the app opened again from nothing, which is the reopen
    // that reads the disk and replays the journal.
    const three = await openPage();
    await toDay(three);
    await settle(three);
    const fresh = await look(three);
    check('a window opened fresh after all of it shows him at the new site only',
        placesOf(fresh, 'one') === SITES[B].id && diskOf(fresh, 'one') === SITES[B].id,
        JSON.stringify({ live: placesOf(fresh, 'one'), disk: diskOf(fresh, 'one') }));
    check('and the other man is still where the second window put him',
        placesOf(fresh, 'two') === SITES[A].id, placesOf(fresh, 'two'));
    check('neither man ends up at two sites by accident',
        placesOf(fresh, 'one').indexOf('+') === -1
        && placesOf(fresh, 'two').indexOf('+') === -1,
        JSON.stringify([placesOf(fresh, 'one'), placesOf(fresh, 'two')]));
    check('two windows of the app produced no uncaught error',
        faults.length === 0, JSON.stringify(faults.slice(0, 3)));

    await context.close();
}

// ============================================================ 10. nothing threw, anywhere
{
    suite('the whole run threw nothing');
    check('no uncaught page error in any of the above',
        errors.length === 0, JSON.stringify(errors.slice(0, 4)));
    console.log(`\n  (${noise.length} blocked/offline console lines ignored by design)`);
}

await browser.close();
server.close();
report();
