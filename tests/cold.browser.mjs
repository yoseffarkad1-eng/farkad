// PHASE 7 in real Chromium: the cold store on the REAL IndexedDB and the real localStorage.
//
//   node tests/cold.browser.mjs
//
// tests/cold.test.mjs proves the logic against a fake IndexedDB that somebody wrote. This
// file asks the questions a fake cannot answer for a browser:
//
//   B0  flag shut: no database exists on the origin after the app has booted and saved
//   B1  the move on the real thing; a reload reads it back; the reports draw
//   B2  the page KILLED mid-move (closed at a named step), three places: the next page is
//       whole and finishes
//   B3  the database deleted between two sessions (what an eviction looks like), and
//       deleted WHILE a page holds it open: noticed, said on the screens that would
//       otherwise print a smaller number, the day screen still records
//   B4  two tabs of one origin
//   B5  a browser with no IndexedDB
//
// The record is tests/cold.world.mjs's: a phone as Phase 6 leaves one. No cloud is
// configured in the page (js/sync/firebase-config.js is empty), so everything here is a
// phone with no signal; being made whole FROM THE SERVER is tests/cold.test.mjs, K3.
//
// Not measured anywhere: a real iPhone, and a real eviction by a real browser under
// storage pressure. deleteDatabase is the nearest thing a test can do.

import { chromium } from 'playwright';
import { launchLocalBrowser } from './network-guard.mjs';
import { serve } from './serve.mjs';
import { expectedShaFor, verifyServedAssets } from './treecheck.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import { archivedPhone } from './cold.world.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
const served = await verifyServedAssets(server.url, root, expectedShaFor(root));
check('the origin served this commit, byte for byte', served.ok,
    `${served.checked} assets; ${(served.wrong || []).slice(0, 3).join(' | ')}`);
const browser = await launchLocalBrowser(chromium, { executablePath: process.env.CHROME_PATH });

const WORLD = await archivedPhone();
const OCT = '2026-10';
// (Phase 8: a record can turn the pay book on by itself - its opening. So that this suite
// goes on measuring a BUILD with the flags it names, on whatever record, its pages do not
// honour the record's switch: `paybookHonour: false` (v190: its own flag), the rule tests/paybook.world.mjs
// keeps for the node suites. tests/activation.browser.mjs is where the build as it ships
// meets a record that is turned on.)
const ON = { paybook: true, paybookQueue: false, months: true, cold: true, paybookActivation: false, paybookHonour: false };
const OFF = { paybook: true, paybookQueue: false, months: true, paybookActivation: false, paybookHonour: false };
const MISSING = 'חלק מהרישום הישן שהועבר לארכיון לא נמצא כרגע במכשיר הזה. הדוחות, החשבונות והגיבוי לא יוצגו עד שהוא יושלם מהשרת, כדי שלא יוצג סכום חסר. רישום הימים ממשיך כרגיל.';
const MISSING_DAY = 'היום הזה שייך לחודש שהועבר לארכיון, והעותק שלו לא נמצא כרגע במכשיר. הוא לא ריק - הוא חסר.';

// A context is one phone: its own localStorage and its own IndexedDB. The record is put
// on the disk once, before the app's first script, and never again.
async function phoneContext(flags, options = {}) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, serviceWorkers: 'block' });
    await context.route('**/*', route => {
        const url = new URL(route.request().url());
        return ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
            || ['data:', 'blob:', 'about:'].includes(url.protocol) ? route.continue() : route.abort();
    });
    await context.addInitScript(([held, record, noIdb]) => {
        window.FARKAD_FLAG_OVERRIDES = held;
        if (noIdb) Object.defineProperty(window, 'indexedDB', { get: () => undefined, configurable: true });
        if (localStorage.getItem('__seeded') === null) {
            localStorage.setItem('scheduleData:v2', record);
            localStorage.setItem('__seeded', '1');
        }
    }, [flags, WORLD.record, options.noIndexedDB === true]);
    context.__errors = [];
    return context;
}
async function openPage(context) {
    const page = await context.newPage();
    page.on('pageerror', error => context.__errors.push(error.message));
    await page.goto(server.url, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Cold !== 'undefined' && Cold.ready !== null);
    await page.evaluate(() => Cold.ready);
    return page;
}
// What the page holds, asked of the page itself.
const facts = page => page.evaluate(async () => {
    const canon = value => JSON.stringify(value, (key, held) => (held && typeof held === 'object' && !Array.isArray(held)
        ? Object.keys(held).sort().reduce((out, name) => { out[name] = held[name]; return out; }, {}) : held));
    const onDisk = JSON.parse(localStorage.getItem('scheduleData:v2'));
    const month = (record, prefix) => Object.keys(record.days || {}).filter(date => date.indexOf(prefix) === 0).length;
    const databases = indexedDB && indexedDB.databases ? (await indexedDB.databases()).map(one => one.name) : null;
    let units = null;
    if (databases && databases.indexOf('farkad-cold') !== -1) {
        units = await new Promise(resolve => {
            const request = indexedDB.open('farkad-cold');
            request.onsuccess = () => {
                const db = request.result;
                const keys = db.transaction(['units'], 'readonly').objectStore('units').getAllKeys();
                keys.onsuccess = () => { db.close(); resolve(keys.result.slice().sort()); };
                keys.onerror = () => { db.close(); resolve(null); };
            };
            request.onerror = () => resolve(null);
        });
    }
    return {
        missing: State.coldMissing().slice().sort(),
        refusal: State.coldRefusal(),
        state: Cold.state,
        memory: canon({ days: State.schedule.days, ledger: State.schedule.ledger.advances, pay: State.schedule.pay }),
        figures: canon({ pay: payrollReport(State.schedule, '2026-09-01', '2026-11-30'),
            invoice: invoiceReport(State.schedule, '2026-09-01', '2026-11-30'),
            accounts: accountsList(State.schedule, '2027-05-01') }),
        diskOctober: month(onDisk, '2026-10'), memoryOctober: month(State.schedule, '2026-10'),
        diskChars: localStorage.getItem('scheduleData:v2').length,
        marks: Object.keys(localStorage).filter(key => key.indexOf('farkad:cold:u:') === 0).map(key => key.slice(14)).sort(),
        databases, units, line: coldDeviceLine()
    };
});
const moveIn = page => page.evaluate(() => Cold.move().then(result => ({ moved: result.moved.slice().sort(), failed: result.failed, dropped: result.dropped })));
const recordDay = (page, date, worker = 'w_salim') => page.evaluate(([day, man]) =>
    State.commit(assignPlace(State.schedule, day, man, 'actual', 'p_a', undefined, 0)), [date, worker]);

try {
    // -------------------------------------------------------------------------------- B0
    suite('B0: flag shut - no database on the origin');
    {
        const context = await phoneContext(OFF);
        const page = await openPage(context);
        given('a day is recorded', await recordDay(page, '2026-11-03') === true);
        const now = await facts(page);
        same('after boot, a save and a render there is NO database, no mark, and the record holds October',
            [now.databases, now.marks, now.diskOctober > 0, now.state, now.line], [[], [], true, 'off', '']);
        same('and nothing broke on the page', context.__errors, []);
        await context.close();
    }

    // -------------------------------------------------------------------------------- B1
    suite('B1: the move on the real IndexedDB, and a reload');
    let reference;
    {
        const context = await phoneContext(ON);
        const page = await openPage(context);
        // The move starts by itself after boot; asking for it hands back the same run.
        const result = await moveIn(page);
        const now = await facts(page);
        check('every unit was moved or was already being moved, and none failed',
            result.failed.length === 0 && now.marks.join() === WORLD.units.join(), JSON.stringify([result, now.marks]));
        same('the real database holds exactly the seven units', now.units, WORLD.units);
        same('the record in localStorage holds no day of October; memory holds them all; nothing is missing',
            [now.diskOctober, now.memoryOctober > 0, now.missing, now.refusal], [0, true, [], null]);
        check('and it is smaller than the record that was put there', now.diskChars < WORLD.record.length,
            `${WORLD.record.length} -> ${now.diskChars}`);
        reference = now;

        await page.reload({ waitUntil: 'load' });
        await page.waitForFunction(() => typeof Cold !== 'undefined' && Cold.ready !== null);
        await page.evaluate(() => Cold.ready);
        const again = await facts(page);
        same('RELOADED: memory is byte for byte what it was, and so is every figure',
            [again.memory === now.memory, again.figures === now.figures, again.missing, again.state], [true, true, [], 'ready']);
        same('the record on the disk was not grown by the boot', again.diskChars, now.diskChars);
        // The screens that read the archive draw as they always did.
        await page.evaluate(() => showView('reports'));
        same('the reports screen is drawn, with no sentence over it',
            await page.evaluate(() => [document.querySelectorAll('#reportsView .cold-notice').length,
                document.getElementById('reportsView').innerText.trim().length > 0]), [0, true]);
        same('⋯ says the archive is whole', again.line, 'ארכיון במכשיר: שלם (7 פריטים)');
        same('and nothing broke on the page', context.__errors, []);
        await context.close();
    }

    // -------------------------------------------------------------------------------- B2
    suite('B2: the page killed mid-move - the next page is whole, and finishes');
    const coldSource = readFileSync(join(root, 'js/cold.js'), 'utf8');
    for (const at of ['copied:' + WORLD.units[0], 'read:' + WORLD.units[3], 'marked:' + WORLD.units[5], 'drop']) {
        const context = await phoneContext(ON);
        // The app's own file, with one line after it: at the named step the move hangs,
        // for ever, which is where the page will be closed.
        await context.route('**/js/cold.js', route => route.fulfill({ contentType: 'application/javascript',
            body: coldSource + `\nCold.step = name => (name === ${JSON.stringify(at)} ? new Promise(() => { window.__reached = true; }) : undefined);\n` }));
        const page = await context.newPage();
        await page.goto(server.url, { waitUntil: 'load' });
        await page.waitForFunction(() => window.__reached === true, null, { timeout: 15000 });
        const dying = await page.evaluate(() => ({
            october: Object.keys(JSON.parse(localStorage.getItem('scheduleData:v2')).days).filter(date => date.indexOf('2026-10') === 0).length,
            marks: Object.keys(localStorage).filter(key => key.indexOf('farkad:cold:u:') === 0).length }));
        await page.close({ runBeforeUnload: false });          // THE KILL
        await context.unroute('**/js/cold.js');
        const next = await openPage(context);
        const first = await facts(next);
        same(`killed at ${at.split(':')[0]}: the next page has nothing missing and the whole record in memory`,
            [first.missing, first.memory === reference.memory], [[], true]);
        given(`(at the kill the record still held October: ${dying.october} days, ${dying.marks} marks)`, dying.october > 0);
        const done = await moveIn(next);
        const after = await facts(next);
        same(`- and it finishes: seven units in the database, seven marks, no October in the record, memory unmoved`,
            [done.failed, after.units, after.marks, after.diskOctober, after.memory === reference.memory],
            [[], WORLD.units, WORLD.units, 0, true]);
        await context.close();
    }

    // -------------------------------------------------------------------------------- B3
    suite('B3: the database deleted - between sessions, and under an open page');
    {
        const context = await phoneContext(ON);
        const page = await openPage(context);
        given('the move finished', (await moveIn(page)).failed.length === 0 && (await facts(page)).diskOctober === 0);

        // UNDER AN OPEN PAGE: the app's own connection must not block the deletion.
        const deleted = await page.evaluate(() => new Promise(resolve => {
            let blocked = 0;
            const request = indexedDB.deleteDatabase('farkad-cold');
            request.onblocked = () => { blocked += 1; };
            request.onsuccess = () => resolve({ ok: true, blocked });
            request.onerror = () => resolve({ ok: false, blocked });
            setTimeout(() => resolve({ ok: false, blocked, timedOut: true }), 8000);
        }));
        same('a deletion while the page holds the database open goes through - the app lets go of its connection',
            [deleted.ok, deleted.timedOut === true], [true, false]);
        const still = await facts(page);
        same('the open page still has the whole record in memory', [still.missing, still.memory === reference.memory], [[], true]);

        // THE NEXT SESSION: the marks are there, the units are not.
        await page.reload({ waitUntil: 'load' });
        await page.waitForFunction(() => typeof Cold !== 'undefined' && Cold.ready !== null);
        await page.evaluate(() => Cold.ready);
        const gone = await facts(page);
        same('NEXT SESSION, NO SIGNAL: all seven units are MISSING - named, not read as an empty archive',
            [gone.missing, gone.marks.length, gone.memoryOctober, gone.refusal], [WORLD.units, 7, 0, MISSING + (await page.evaluate(() => navigator.onLine === false ? ' אין כרגע קליטה. כשתהיה, המכשיר ישלים את החסר בעצמו.' : ''))]);
        same('⋯ counts it', gone.line, 'ארכיון במכשיר: חסרים 7 פריטים מתוך 7');

        // The screens.
        for (const view of ['reports', 'advances']) {
            await page.evaluate(name => showView(name), view);
            const seen = await page.evaluate(name => {
                const root = document.getElementById(name + 'View');
                const note = root.querySelector('.cold-notice');
                const others = Array.prototype.filter.call(root.children, child => child !== note);
                return { text: note ? note.textContent : null, visible: note ? note.getBoundingClientRect().height > 0 : false,
                    othersShown: others.filter(child => child.getBoundingClientRect().height > 0).length,
                    shekels: (root.innerText.match(/₪/g) || []).length };
            }, view);
            same(`the ${view} screen shows the sentence and NOT ONE FIGURE`,
                [seen.text === gone.refusal, seen.visible, seen.othersShown, seen.shekels], [true, true, 0, 0]);
        }
        await page.evaluate(() => { State.date = '2026-10-06'; showView('day'); });
        same('a day of the missing month is drawn as MISSING, not as an empty day',
            await page.evaluate(() => { const note = document.querySelector('#dayView .cold-notice'); return note ? note.textContent : null; }), MISSING_DAY);
        await page.evaluate(() => { State.date = '2026-11-02'; showView('day'); });
        same('a day of November is drawn as ever, and today\'s work still records - on the disk',
            [await page.evaluate(() => document.querySelectorAll('#dayView .cold-notice').length),
                await recordDay(page, '2026-11-04', 'w_nasser'),
                await page.evaluate(() => JSON.parse(localStorage.getItem('scheduleData:v2')).days['2026-11-04'] !== undefined)],
            [0, true, true]);
        same('an advance is refused', await page.evaluate(() => State.commitMany(
            recordNewAdvance(State.schedule, 'w_khaled', '2026-11-03', 200, '', new Date().toISOString(), 'd_x', 'cash'))), false);
        check('and the refusal is on the screen, in the app\'s own dialog',
            await page.evaluate(() => document.body.innerText.indexOf('הארכיון במכשיר לא שלם') !== -1));
        same('the page raised no error through any of it', context.__errors, []);
        await context.close();
    }

    // -------------------------------------------------------------------------------- B4
    suite('B4: two tabs of one origin');
    {
        const context = await phoneContext(ON);
        const one = await openPage(context);
        const two = await openPage(context);
        const [first, second] = await Promise.all([moveIn(one), moveIn(two)]);
        same('both tabs move at once and neither fails', [first.failed, second.failed], [[], []]);
        given('tab one records a day', await recordDay(one, '2026-11-07') === true);
        given('tab two records another', await recordDay(two, '2026-11-08', 'w_nasser') === true);
        const [a, b] = [await facts(one), await facts(two)];
        same('both hold the whole archive in memory; the database holds the seven units; the record holds no October',
            [a.missing, b.missing, a.memoryOctober > 0, b.memoryOctober > 0, b.units, b.diskOctober],
            [[], [], true, true, WORLD.units, 0]);
        same('and the record on the disk has both days',
            await two.evaluate(() => ['2026-11-07', '2026-11-08'].map(date => JSON.parse(localStorage.getItem('scheduleData:v2')).days[date] !== undefined)),
            [true, true]);
        same('nothing broke in either tab', context.__errors, []);
        await context.close();
    }

    // -------------------------------------------------------------------------------- B5
    suite('B5: a browser with no IndexedDB');
    {
        const context = await phoneContext(ON, { noIndexedDB: true });
        const page = await openPage(context);
        given('a day is recorded', await recordDay(page, '2026-11-03') === true);
        const now = await page.evaluate(() => ({ state: Cold.state, missing: State.coldMissing(), refusal: State.coldRefusal(),
            october: Object.keys(JSON.parse(localStorage.getItem('scheduleData:v2')).days).filter(date => date.indexOf('2026-10') === 0).length,
            marks: Object.keys(localStorage).filter(key => key.indexOf('farkad:cold:') === 0).length, line: coldDeviceLine() }));
        same('nothing moves, nothing is missing, nothing is refused; the record keeps October, as today',
            [now.state, now.missing, now.refusal, now.october > 0, now.marks], ['none', [], null, true, 0]);
        same('and ⋯ says so', now.line, 'ארכיון במכשיר: אין בדפדפן הזה אחסון נפרד, ולכן הכול נשמר באחסון הרגיל');
        same('no error', context.__errors, []);
        await context.close();
    }
} finally {
    await browser.close();
    server.close();
}

report();
