// v206, the speed track in Chromium with the processor slowed four times - because the
// owner's phone is the clock that matters, and Node is not it.
//
//   node tests/speed.browser.mjs
//
// There is NO screen in this track: no node, word, key or style moved (tests/speed.test.mjs
// holds every way in byte for byte against v204 in Node). What this suite holds, the
// contract's criteria 14-18 (features/speed/contract.md):
//
//   14. THE CLOCKS. Each row of the budget in a FRESH PAGE - the season-open disk written into
//       localStorage before load, the day screen drawn, the boot's own reading of the close
//       reminder done, then the processor slowed 4x through CDP and the one act - on this
//       build and on 6ab193d's tree served beside it on its own port, alternating, the
//       longest task of the act (a longtask PerformanceObserver) printed side by side.
//   15. THE SAME DOM. On season-closed, the pages and dialogs drawn sharing what they worked
//       out are the same innerHTML as the same draw made afresh in the page and as a second
//       draw of the unmoved record - and «דוחות» is v204's tree's, node for node.
//   16. THE SAME PICTURE. sharePrintout('report') through a recorder: the same PNG bytes
//       drawn shared and drawn afresh.
//   17. THE DAY SCREEN. A write on Thursday, the close reminder's reading after its quiet -
//       exactly once (a spy on weeklyCloseRead) - its line up, its count a fresh count's, and
//       «סגירת שבוע» opened by pressing that line on the unmoved record. On season-closed and
//       season-skipped, where the line shows, three fresh pages of each build (fix round 1: on
//       season-open «סגירת שבוע» holds every man and the count is 0 on both builds, so there is no
//       line to press - those rows stay, as clocks of the reading where it is heaviest).
//   18. NOTHING WRITTEN by any reading (tests/census.mjs), and no uncaught error.
//
// (fix round 1) Where a row is a reading of a record that did not move, the suite also reads
// off the page that the memo kept before it is the memo that answered it (REPORT_SHARED_KEPT,
// this build only) - so a row that only a missing S3, or a tick back in its key, would slow
// down cannot pass by the clock alone. And three rows the review timed by hand: a man's page
// of «מקדמות» opened from the board, «סגירות שנרשמו» from it, and letters typed into its search.
//
// The rows where v204's own task takes minutes in Node (the payslips) are held to an
// absolute ceiling instead. While a row other than the reminder's is measured, the reminder's
// timer is stubbed out on both builds alike (closeReminderAfterRender), so the longest task
// is the act's own. Synthetic data only. NOT a real phone.

import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir, loadavg } from 'node:os';
import { join, dirname } from 'node:path';
import { serve } from './serve.mjs';
import { launchLocalBrowser } from './network-guard.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { deployedFromSource } from './shell.mjs';
import { censusOnly, CENSUS_KEY } from './census.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import { ROOT, BASE, seasonDisk } from './speed.seed.mjs';

const STARTED = Date.now();
const NOON = '2026-11-19T19:30:00+02:00';
const RATE = 4;
const load = () => loadavg().map(value => value.toFixed(1)).join(' ');
const ms = value => `${Math.round(value)}`;

// ---------------------------------------------------------------- the records and the trees
const SEASON = {};
for (const kind of ['open', 'closed', 'skipped']) {
    const began = Date.now();
    SEASON[kind] = seasonDisk(kind);
    console.log(`season-${kind}: ${JSON.stringify(SEASON[kind].facts)} - seeded in ${((Date.now() - began) / 1000).toFixed(1)} s`);
}
given('the season-open record is a season', SEASON.open.facts.men === 40 && SEASON.open.facts.advances > 500, JSON.stringify(SEASON.open.facts));

// v204: 6ab193d's own shell, out of Git's object store - never a checkout.
const git = (args, text) => execFileSync('git', ['-C', ROOT, ...args], { maxBuffer: 256 * 1024 * 1024, ...(text ? { encoding: 'utf8' } : {}) });
const work = mkdtempSync(join(tmpdir(), 'farkad-speed-'));
const baseRoot = join(work, 'v204');
const baseNames = [];
{
    const shell = deployedFromSource(git(['show', `${BASE}:sw.js`], true), `${BASE}:sw.js`);
    git(['ls-tree', '-r', '--name-only', BASE, '--', ...shell], true).split('\n').filter(Boolean).forEach(name => {
        baseNames.push(name);
        mkdirSync(join(baseRoot, dirname(name)), { recursive: true });
        writeFileSync(join(baseRoot, name), git(['show', `${BASE}:${name}`]));
    });
}
const here = await serve(ROOT);
const there = await serve(baseRoot);
check('this build\'s origin serves this commit, byte for byte', (await verifyServedAssets(here.url, ROOT, expectedShaFor(ROOT))).ok);
// MOVED ON PURPOSE (v207's integration): verifyServedAssets reads the shell list off THIS
// tree's sw.js, and the merged tree's shell names files the base never had (crewcheck.js,
// history.js) - "not tracked" there, so the check could not pass on any merged tree. The base's
// origin is held to the base's OWN shell instead: every file of it, fetched, against its blob.
{
    const wrong = [];
    for (const name of baseNames) {
        try {
            const response = await fetch(`${there.url.replace(/\/$/, '')}/${name}`);
            const body = Buffer.from(await response.arrayBuffer());
            if (!response.ok || !body.equals(git(['show', `${BASE}:${name}`]))) wrong.push(name);
        } catch (error) { wrong.push(`${name}: ${error.message}`); }
    }
    check(`the base's origin serves ${BASE.slice(0, 7)}'s own shell, byte for byte (${baseNames.length} files)`,
        baseNames.length > 20 && wrong.length === 0, wrong.slice(0, 6).join(' | '));
}
const TREES = { v204: there, now: here };

const browser = await launchLocalBrowser(chromium, { executablePath: process.env.CHROME_PATH });
const errors = [];

// ---------------------------------------------------------------- a fresh page
//
// A new context, so a new renderer: loaded from the disk, the day screen drawn, the boot's
// reading of the reminder done (the app reads it after its first paint), then slowed.
async function freshPage(tree, record, options = {}) {
    const context = await browser.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true,
        hasTouch: true, colorScheme: 'light', serviceWorkers: 'block', timezoneId: 'Asia/Jerusalem', locale: 'he-IL' });
    await context.addInitScript({ content: `(() => { try { if (!sessionStorage.getItem('speed:seeded')) {
        const D = ${JSON.stringify(record.disk)}; localStorage.clear(); Object.keys(D).forEach(k => localStorage.setItem(k, D[k]));
        sessionStorage.setItem('speed:seeded', '1'); } } catch (error) { console.error('speed seed', error); } })();` });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`${tree}: ${error.message}`));
    await page.clock.setFixedTime(new Date(NOON));
    await page.goto(`${TREES[tree].url}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof State !== 'undefined' && typeof render === 'function' && State.schedule
        && State.schedule.workers.length >= 40, null, { timeout: 300000 });
    await page.waitForFunction(() => typeof CLOSE_REMINDER_KEPT !== 'undefined' && CLOSE_REMINDER_KEPT !== null
        && !closeReminderSoon, null, { timeout: 300000 });
    await page.evaluate(() => {
        window.speedDisk = () => Object.keys(localStorage).filter(key => key !== 'farkad:openBuilds').sort()
            .map(key => [key, localStorage.getItem(key)]);
        // A write on the day screen, through the app's own writer: a man moved between two sites.
        window.speedWrite = () => {
            showView('day');
            const id = State.schedule.workers[3].id;
            const day = ((State.schedule.days[todayStr()] || {}).actual || {})[id];
            const site = day && JSON.stringify(day).indexOf('"p_2"') !== -1 ? 'p_3' : 'p_2';
            return State.commit(assignPlace(State.schedule, todayStr(), id, 'actual', site, 'normal')) !== false;
        };
        ['updateBanner', 'installBanner', 'whatsNewBanner'].forEach(id => { const node = document.getElementById(id); if (node) node.style.display = 'none'; });
        // The memo S3 keeps (this build; v204 has none): held before an act, and asked after it
        // whether that very memo answered the act, and whether anything was worked out anew.
        const memoNow = () => (typeof REPORT_SHARED_KEPT === 'undefined' || !REPORT_SHARED_KEPT ? null : REPORT_SHARED_KEPT.memo);
        const sizeOf = memo => (memo ? (memo.entries ? 1 : 0) + (memo.fold ? 1 : 0) + (memo.history ? 1 : 0) + memo.overpaid.size
            + memo.outstanding.size + memo.walks.size + memo.positions.size : -1);
        window.speedHold = () => { window.speedHeld = memoNow(); window.speedHeldSize = sizeOf(window.speedHeld); };
        window.speedKept = () => ({ same: Boolean(window.speedHeld) && memoNow() === window.speedHeld,
            grew: sizeOf(memoNow()) !== window.speedHeldSize });
        window.speedSettle = async () => {
            for (let n = 0; n < 2400 && document.querySelector('.owes-pending'); n += 1) await new Promise(resolve => setTimeout(resolve, 50));
        };
    });
    if (!options.reminder) await page.evaluate(() => { window.speedReminderAfterRender = closeReminderAfterRender; closeReminderAfterRender = () => {}; });
    await page.waitForTimeout(300);
    const cdp = await context.newCDPSession(page);
    if (options.rate !== 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
    return { context, page, cdp };
}

// In the page: run `act`, then wait until `done` holds and two frames passed; every long task
// in between counted. `act` may leave window.speedDiskAfterWrite: the disk the reading must leave.
async function measure(page, act, done = 'true', limit = 300000) {
    return page.evaluate(async ([actCode, doneCode, limitMs]) => {
        const tasks = [];
        const observer = new PerformanceObserver(list => list.getEntries().forEach(entry => tasks.push(entry.duration)));
        try { observer.observe({ type: 'longtask', buffered: false }); } catch (error) { /* none */ }
        const frame = () => new Promise(resolve => requestAnimationFrame(() => resolve()));
        await frame();
        window.speedDiskAfterWrite = null;
        const began = performance.now();
        // eslint-disable-next-line no-new-func
        new Function(actCode)();
        // The act's own synchronous call: a cheap draw can be done in under the 50 ms a task needs
        // to be a long task at all, and then no long task is recorded for it (rows 12 and 14).
        const sync = performance.now() - began;
        // eslint-disable-next-line no-new-func
        const isDone = new Function(`return (${doneCode})`);
        while (!isDone() && performance.now() < began + limitMs) await new Promise(resolve => setTimeout(resolve, 50));
        const finished = isDone();
        await frame(); await frame();
        await new Promise(resolve => setTimeout(resolve, 100));
        observer.disconnect();
        const disk = window.speedDiskAfterWrite;
        const moved = disk === null ? null : JSON.stringify(disk) !== JSON.stringify(window.speedDisk()
            .filter(([key]) => key !== 'farkadPayslipsProgress'));
        return { longest: Math.max(0, ...tasks), sync, tasks: tasks.length, total: performance.now() - began, finished, moved };
    }, [act, done, limit]);
}
const SNAPSHOT = "window.speedDiskAfterWrite = window.speedDisk().filter(([key]) => key !== 'farkadPayslipsProgress');";
const AFTER_PAINT = "!document.querySelector('.owes-pending')";

// ---------------------------------------------------------------- 14, 17, 18. the clocks
const rows = [];
const written = [];
function row(name, v204, mine, limit, saying) {
    rows.push(`${name}: this build ${ms(mine.longest)} ms / v204 ${v204 === null ? '-' : `${ms(v204.longest)} ms`}`);
    check(`${name}: the longest task ${ms(mine.longest)} ms (v204 ${v204 === null ? 'not timed' : `${ms(v204.longest)} ms`}) - ${saying}`,
        mine.finished && (v204 === null || v204.finished) && mine.longest <= limit, `${ms(mine.longest)} > ${ms(limit)}`);
    [['this build', mine], ['v204', v204]].forEach(([who, one]) => { if (one && one.moved === true) written.push(`${name}: ${who}`); });
}
// For an act that may take under 50 ms: what it cost is its synchronous call, or the longest task
// after it when that is longer. A long-task observer alone saw nothing of v204's man's page at a
// load of 3 (0 ms on two men of three, the first run of row 12 on 3e2b867), and nothing of a
// cheap letter typed into the search.
const own = one => Object.assign({}, one, { longest: Math.max(one.longest, one.sync) });
// Several timings of one act as one: the median task, finished only if every one finished, and
// a disk moved if any of them moved it - so a median never hides a sample that wrote.
function pooled(list) {
    const middle = list.slice().sort((a, b) => a.longest - b.longest)[Math.floor(list.length / 2)];
    return { longest: middle.longest, finished: list.every(one => one.finished),
        moved: list.some(one => one.moved === true) ? true : middle.moved, all: list.map(one => Math.round(one.longest)) };
}
async function both(act, done, options = {}) {
    const out = {};
    for (const tree of options.only ? [options.only] : ['v204', 'now']) {
        const { context, page, cdp } = await freshPage(tree, options.record || SEASON.open, options);
        if (options.before) await page.evaluate(options.before);
        out[tree] = await measure(page, act, done);
        if (options.after) out[`${tree}After`] = await options.after(page);
        if (options.keep) out[`${tree}Page`] = { context, page, cdp }; else await context.close();
    }
    return out;
}
{
    suite(`14. the clocks: fresh pages, 375x667, the processor slowed ${RATE}x, this build against v204 (load ${load()})`);

    // 1, 2. a write on the day screen, then «דוחות»; and in that page the two sections redrawn.
    const first = await both(`speedWrite(); ${SNAPSHOT} showView('reports');`, AFTER_PAINT, { keep: true });
    row('1. a write, then «דוחות» opened', first.v204, first.now, first.v204.longest / 4, '<= 1/4 of v204\'s');
    for (const [name, act] of [['«לפי אתר»', "REPORT_SECTION = 'sites'; render();"], ['«לפי עובד»', "REPORT_SECTION = 'workers'; render();"]]) {
        const v204 = await measure(first.v204Page.page, `${SNAPSHOT} ${act}`, AFTER_PAINT);
        const mine = await measure(first.nowPage.page, `${SNAPSHOT} speedHold(); ${act}`, AFTER_PAINT);
        const kept = await first.nowPage.page.evaluate(() => window.speedKept());
        // (fix round 1) v204's row 1 alone could not catch a redraw that kept nothing: this build's
        // own first reading is under a tenth of v204's. So also a quarter of THIS build's row 1,
        // in this same page - and the memo row 1 kept, answering the redraw.
        row(`2. then ${name} redrawn, the record unmoved`, v204, mine, Math.min(first.v204.longest / 10, first.now.longest / 4),
            `<= 1/10 of v204's row 1 and <= 1/4 of this build's own (${ms(first.now.longest)} ms)`);
        same(`2. ${name}: the memo «דוחות» kept answered the redraw, and nothing was worked out anew`, kept, { same: true, grew: false });
    }
    await first.v204Page.context.close();
    await first.nowPage.context.close();

    // 3. a write, then «מקדמות».
    const third = await both(`speedWrite(); ${SNAPSHOT} showView('advances');`, AFTER_PAINT);
    row('3. a write, then «מקדמות» opened', third.v204, third.now, third.v204.longest / 2, '<= 1/2 of v204\'s');

    // 4. «שים לב» read after paint, the record moved.
    const fourth = await both(`State.schedule.workers[0].note = 'speed ' + Math.random(); OWES_KEPT = null; ${SNAPSHOT} owesReadNow();`, 'true');
    row('4. «שים לב» read after paint, the record moved', fourth.v204, fourth.now, fourth.v204.longest / 2, '<= 1/2 of v204\'s');

    // 5, 6, 17. a write on Thursday; the reminder's reading after its quiet - exactly once -
    // its line, its count a fresh count's; then «סגירת שבוע» opened after it, the record unmoved.
    const spy = () => {
        window.speedReads = 0;
        const real = weeklyCloseRead;
        weeklyCloseRead = function () { window.speedReads += 1; return real.apply(this, arguments); };
    };
    const QUIET = 'window.speedReads >= 1 && closeReminderQuiet === null && !closeReminderSoon';
    const DIALOG = 'typeof WEEKLY_CLOSE !== "undefined" && WEEKLY_CLOSE && WEEKLY_CLOSE.read';
    // On season-open: the reading where it is heaviest. «סגירת שבוע» holds every man there (an
    // earlier open period a debt ran through), so the count is 0 on both builds and no line is up:
    // the dialog is opened by the function the line's button calls.
    const fifth = await both(`speedWrite(); ${SNAPSHOT}`, QUIET, { reminder: true, before: spy, keep: true });
    row('5. season-open: a write on Thursday, then the close reminder\'s reading after its quiet', fifth.v204, fifth.now, fifth.v204.longest * 0.7, '<= 0.7 of v204\'s');
    const opened = {};
    for (const tree of ['v204', 'now']) {
        const { page } = fifth[`${tree}Page`];
        await page.waitForTimeout(2500);
        const said = await page.evaluate(() => ({ reads: window.speedReads, kept: CLOSE_REMINDER_KEPT.count,
            line: Boolean(document.getElementById('closeReminderOpen') && document.getElementById('closeReminderOpen').offsetParent) }));
        same(`17. season-open, ${tree}: the reminder read the record exactly once after the write`, said.reads, 1);
        same(`season-open, ${tree}: every man held, so a count of 0 and no line - the dialog opened by the function the line calls`, [said.kept, said.line], [0, false]);
        opened[tree] = await measure(page, `${SNAPSHOT} ${tree === 'now' ? 'speedHold();' : ''} openWeeklyClose();`, DIALOG);
        if (tree === 'now') opened.kept = await page.evaluate(() => window.speedKept());
    }
    row('6. season-open: then «סגירת שבוע» opened (no line: by the function the line calls), the record unmoved',
        opened.v204, opened.now, opened.v204.longest / 3, '<= 1/3 of v204\'s same act');
    same('6. season-open: the memo the reminder\'s reading kept answered the dialog', opened.kept.same, true);
    await fifth.v204Page.context.close();
    await fifth.nowPage.context.close();

    // (fix round 1) THE OWNER'S THURSDAY: season-closed (the crew closed in order, a third of the
    // men's last period open) and season-skipped (and some weekly men missed the week before, so
    // their empty week is closed first on a copy). The line is up there; it is pressed. Neither
    // reading is a fraction of v204's: after a write the reading is the model's walk of every
    // man's last period, and the copies of the record are planned again at every reading - so
    // these rows hold "never slower" and print the fraction (features/speed/handoff.md). The two
    // builds are about level here, so one page of each is a coin toss against any ceiling: the
    // first run of these rows, at load 10, put season-skipped's reading at 1.28x on one page each
    // (the review's six pages each: 1.00). So each is THREE fresh pages of each build, alternating
    // v204 / this build, every page's line, count and press checked, and the medians held.
    const PAGES = 3;
    for (const kind of ['closed', 'skipped']) {
        const reading = { v204: [], now: [] };
        const press = { v204: [], now: [] };
        const counted = { v204: [], now: [] };
        const answered = [];
        for (let round = 1; round <= PAGES; round += 1) {
            const day = await both(`speedWrite(); ${SNAPSHOT}`, QUIET, { record: SEASON[kind], reminder: true, before: spy, keep: true });
            for (const tree of ['v204', 'now']) {
                reading[tree].push(day[tree]);
                const { page, cdp } = day[`${tree}Page`];
                await page.waitForTimeout(2500);
                const said = await page.evaluate(() => ({ reads: window.speedReads, kept: CLOSE_REMINDER_KEPT.count,
                    line: Boolean(document.getElementById('closeReminderOpen') && document.getElementById('closeReminderOpen').offsetParent),
                    words: (document.getElementById('closeReminderLine') || {}).textContent || '' }));
                same(`17. season-${kind}, ${tree}, page ${round}: the reminder read the record exactly once after the write`, said.reads, 1);
                check(`17. season-${kind}, ${tree}, page ${round}: its line is up, counting ${said.kept} men («${said.words}»)`, said.line === true && said.kept > 0);
                press[tree].push(await measure(page, `${SNAPSHOT} ${tree === 'now' ? 'speedHold();' : ''} document.getElementById('closeReminderOpen').click();`, DIALOG));
                const dialog = await page.evaluate(() => ({ up: document.getElementById('weeklyCloseModal').style.display === 'flex',
                    men: WEEKLY_CLOSE && WEEKLY_CLOSE.read ? WEEKLY_CLOSE.read.men.filter(man => !man.held).length : -1 }));
                check(`17. season-${kind}, ${tree}, page ${round}: pressing the line opened «סגירת שבוע», offering ${dialog.men} men`, dialog.up && dialog.men > 0);
                if (tree === 'now') answered.push(await page.evaluate(() => window.speedKept()));
                await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
                const fresh = await page.evaluate(() => {
                    if (typeof REPORT_SHARED_KEPT !== 'undefined') REPORT_SHARED_KEPT = null;
                    return closeReminderReadCount(State.schedule, todayStr(), new Date().toISOString());
                });
                same(`17. season-${kind}, ${tree}, page ${round}: the line's count (${said.kept}) is a fresh count's`, said.kept, fresh);
                counted[tree].push(said.kept);
                await day[`${tree}Page`].context.close();
            }
        }
        same(`17. season-${kind}: both builds count the same men, on every page`, counted.now, counted.v204);
        const [read204, readNow, press204, pressNow] = [pooled(reading.v204), pooled(reading.now), pooled(press.v204), pooled(press.now)];
        row(`5. season-${kind}: a write on Thursday, then the close reminder's reading after its quiet (the median of ${PAGES} pages each)`, read204, readNow,
            read204.longest * 1.25 + 30, `<= 1.25x v204's + 30 ms (${(readNow.longest / read204.longest).toFixed(2)} of it; this build ${readNow.all.join(', ')} / v204 ${read204.all.join(', ')})`);
        row(`6. season-${kind}: then «סגירת שבוע» opened from the reminder's line, the record unmoved (the median of ${PAGES} pages each)`, press204, pressNow,
            press204.longest * 1.25 + 30, `<= 1.25x v204's + 30 ms (${(pressNow.longest / press204.longest).toFixed(2)} of it; this build ${pressNow.all.join(', ')} / v204 ${press204.all.join(', ')})`);
        same(`6. season-${kind}: the memo the reminder's reading kept answered the dialog, on every page`, answered.map(one => one.same), answered.map(() => true));
    }

    // 7, 8. the closing box of a weekly man; the card of a fortnightly one.
    const seventh = await both(`${SNAPSHOT} openWorkerSettlement('w_01');`, 'true');
    row('7. the closing box (a weekly man)', seventh.v204, seventh.now, seventh.v204.longest / 2, '<= 1/2 of v204\'s');
    const eighth = await both(`${SNAPSHOT} openWorkerCard('w_17');`, 'true');
    row('8. «כרטיס עובד» (a fortnightly man)', eighth.v204, eighth.now, eighth.v204.longest / 2, '<= 1/2 of v204\'s');

    // 9. the payslips: v204 takes minutes for them in Node and is not timed.
    const ninth = await both(`${SNAPSHOT} openPayslips('current');`, 'true', { only: 'now' });
    row('9. «תלוש לכל עובד»', null, ninth.now, 3000, '<= 3,000 ms');

    // 10. the month's summary, which was cheap and stays so.
    const tenth = await both(`${SNAPSHOT} openMonthSummary();`, 'true');
    row('10. «סיכום חודש»', tenth.v204, tenth.now, tenth.v204.longest * 1.25 + 30, '<= 1.25x v204\'s + 30 ms');

    // 11. a write, «דוחות» drawn; a provenance key as a send leaves it - the tick moves, the
    // record does not; then «דוחות» redrawn.
    const eleventh = {};
    for (const tree of ['v204', 'now']) {
        const { context, page } = await freshPage(tree, SEASON.open);
        eleventh[`${tree}First`] = await measure(page, "speedWrite(); showView('reports');", AFTER_PAINT);
        const tick = await page.evaluate(() => { const before = Store.tick; Store.set('farkad:prov:sent:advance:speed_row11', '1'); return [before, Store.tick]; });
        given(`${tree}: the provenance key moved the tick`, tick[1] !== tick[0], JSON.stringify(tick));
        eleventh[tree] = await measure(page, `${SNAPSHOT} ${tree === 'now' ? 'speedHold();' : ''} render();`, AFTER_PAINT);
        if (tree === 'now') eleventh.kept = await page.evaluate(() => window.speedKept());
        await context.close();
    }
    row('11. a write, «דוחות», a send\'s provenance key (the tick moved, the record not), «דוחות» redrawn', eleventh.v204, eleventh.now,
        Math.min(first.v204.longest / 10, eleventh.nowFirst.longest / 4), `<= 1/10 of v204's row 1 and <= 1/4 of this page's own first draw (${ms(eleventh.nowFirst.longest)} ms)`);
    same('11. the memo the first draw kept answered the redraw across the tick (S3 holds no tick), nothing worked out anew', eleventh.kept, { same: true, grew: false });

    // (fix round 1) A HAND ON A DRAWN PAGE, as the review timed it. A man's page of «מקדמות»
    // opened from the board, and «סגירות שנרשמו» from it, on season-closed: both read only what
    // the board's reading already answered, and since fix round 1 pay ONE copy of the record (it
    // was two, and the copies were most of a man's page: 39 ms on v204, 119 here). Cheap on v204
    // already, so they are held to never being slower than v204 by more than that one copy.
    const BOARD = async () => { showView('advances'); await window.speedSettle(); };
    // Three men a page, each opened from the list and the list drawn again after him - the median
    // of the three (one page of each build: a single tap of a few tens of ms is noise).
    const pages = {};
    for (const tree of ['v204', 'now']) {
        const { context, page } = await freshPage(tree, SEASON.closed);
        await page.evaluate(BOARD);
        const times = [];
        for (const id of ['w_03', 'w_17', 'w_25']) {
            times.push(await measure(page, `${SNAPSHOT} ${tree === 'now' ? 'speedHold();' : ''} showWorkerAdvances(${JSON.stringify(id)});`, 'true'));
            if (tree === 'now') pages.kept = (pages.kept || []).concat([await page.evaluate(() => window.speedKept())]);
            await page.evaluate(async () => { ADVANCE_WORKER = null; render(); await window.speedSettle(); });
        }
        pages[tree] = times;
        await context.close();
    }
    const [man204, manNow] = [pooled(pages.v204.map(own)), pooled(pages.now.map(own))];
    row('12. season-closed: a man\'s page of «מקדמות», opened from the board (its own synchronous draw, the median of three men)', man204, manNow,
        man204.longest * 1.25 + 60, `<= 1.25x v204's + 60 ms (one copy of a 1 MB record at 4x; this build ${manNow.all.join(', ')} / v204 ${man204.all.join(', ')})`);
    same('12. the board\'s memo answered each man\'s page, nothing worked out anew', pages.kept.every(one => one.same && !one.grew), true);
    const closures = await both(`${SNAPSHOT} speedHold(); OWES_PAGE = 'closures'; render();`, 'true',
        { record: SEASON.closed, before: BOARD, after: page => page.evaluate(() => window.speedKept()) });
    row('13. season-closed: «סגירות שנרשמו», opened from the board', closures.v204, closures.now, closures.v204.longest / 2, '<= 1/2 of v204\'s');
    same('13. the board\'s memo answered it', closures.nowAfter.same, true);
    // Letters typed into «מקדמות»'s search on season-open: each letter is every listed man's
    // advances read again - outside the reading until fix round 1 (850 ms a letter on both builds).
    const LETTERS = ['ע', 'עו', 'עוב', 'עובד', 'עובד ', 'עובד 1'];
    const typed = {};
    for (const tree of ['v204', 'now']) {
        const { context, page } = await freshPage(tree, SEASON.open);
        await page.evaluate(BOARD);
        const times = [];
        for (const text of LETTERS) {
            times.push(await measure(page, `${SNAPSHOT} ${tree === 'now' ? 'speedHold();' : ''} const field = document.querySelector('#advancesView input[type=search]');
                field.value = ${JSON.stringify(text)}; field.dispatchEvent(new Event('input'));`, 'true'));
            if (tree === 'now') typed.kept = (typed.kept || []).concat([await page.evaluate(() => window.speedKept())]);
        }
        typed[tree] = times;
        typed[`${tree}Cards`] = await page.evaluate(() => document.querySelectorAll('#advancesView .advance-worker-card').length);
        await context.close();
    }
    row('14. season-open: the first letter typed into «מקדמות»\'s search (its own synchronous call)', own(typed.v204[0]), own(typed.now[0]),
        own(typed.v204[0]).longest / 4, '<= 1/4 of v204\'s');
    const [letter204, letterNow] = [pooled(typed.v204.map(own)), pooled(typed.now.map(own))];
    row(`14. season-open: the median of ${LETTERS.length} letters (each its own synchronous call)`, letter204, letterNow, letter204.longest / 4,
        `<= 1/4 of v204's (this build ${letterNow.all.join(', ')} / v204 ${letter204.all.join(', ')})`);
    same('14. every letter answered by the board\'s memo, nothing worked out anew; the same men listed on both builds',
        [typed.kept.every(one => one.same && !one.grew), typed.nowCards], [true, typed.v204Cards]);

    // The day screen's own write: reported, with no budget (the commit is js/state.js's).
    const day = await both(`speedWrite();`, 'true');
    console.log(`        the day screen, a write (commit + draw): this build ${ms(day.now.longest)} ms / v204 ${ms(day.v204.longest)} ms - reported, no budget`);
    rows.forEach(line => console.log(`        ${line}`));
    console.log(`        (load at the end of the clocks: ${load()})`);
    same('18. no reading wrote to the disk: every act\'s disk after it was the disk its write left', written, []);
}

// ---------------------------------------------------------------- 15, 16, 18. the same DOM, the same picture
{
    suite('15, 16. season-closed: drawn sharing, drawn again unmoved, drawn afresh - the same nodes and the same picture');

    const { context, page } = await freshPage('now', SEASON.closed, { rate: 1 });
    await page.evaluate(() => {
        const settle = async () => {
            for (let n = 0; n < 1200 && document.querySelector('.owes-pending'); n += 1) await new Promise(resolve => setTimeout(resolve, 50));
            await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
        };
        // Drawn afresh: no reading at all - REPORT_ONCE planted, as tests/reports.speed.test.mjs
        // draws one - and the gate answered once for the record, as there, but by v196's own rule
        // (reportGateAnswer: a record that carries the approval is not planned). The bare plan of
        // season-closed takes minutes (161 s in Node, measured), and a draw asks the gate a dozen
        // times; the answer is the gate's either way (tests/reports.speed.test.mjs holds the two equal).
        window.speedDraw = async (code, selector, afresh) => {
            const was = REPORT_ONCE;
            const gate = carryReportingEnabled;
            if (afresh) {
                const record = State.schedule;
                let answer;
                carryReportingEnabled = function (schedule) {
                    if (schedule !== record || arguments.length !== 1) return gate.apply(this, arguments);
                    if (answer === undefined) answer = reportGateAnswer(schedule, gate);
                    return answer;
                };
                REPORT_ONCE = { schedule: record };
                OWES_KEPT = null;
            }
            try {
                // eslint-disable-next-line no-new-func
                new Function(code)();
                await settle();
                return document.querySelector(selector).innerHTML;
            } finally { if (afresh) { REPORT_ONCE = was; carryReportingEnabled = gate; } }
        };
        window.speedPicture = async () => {
            let file = null;
            navigator.canShare = () => true;
            navigator.share = data => { file = data.files && data.files[0]; return Promise.resolve(); };
            sharePrintout('report');
            for (let n = 0; n < 100 && !file; n += 1) await new Promise(resolve => setTimeout(resolve, 20));
            if (!file) return null;
            const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
            return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
        };
    });
    const before = await page.evaluate(() => window.speedDisk());
    const SURFACES = [
        ['«דוחות», both sections', "showView('reports'); REPORT_SECTION = 'workers'; render();", '#reportsView'],
        ['«מקדמות», the board', "ADVANCE_WORKER = null; OWES_PAGE = null; showView('advances'); render();", '#advancesView'],
        ['«מקדמות», a man\'s page', "ADVANCE_WORKER = 'w_01'; OWES_PAGE = null; render();", '#advancesView'],
        ['«סגירות שנרשמו»', "ADVANCE_WORKER = null; OWES_PAGE = 'closures'; render();", '#advancesView'],
        ['the closing box', "openWorkerSettlement('w_03');", '#workerDaysBody'],
        ['a man\'s days', "openWorkerDays('w_03');", '#workerDaysBody'],
        ['«כרטיס עובד»', "openWorkerCard('w_17');", '#workerCardBody'],
        ['«תלוש לכל עובד»', "openPayslips('current');", '#payslipsModal .modal-content']
    ];
    let reportsNodes = null;
    for (const [name, code, selector] of SURFACES) {
        const drawn = await page.evaluate(([c, s]) => window.speedDraw(c, s, false), [code, selector]);
        const again = await page.evaluate(([c, s]) => window.speedDraw(c, s, false), [code, selector]);
        const afresh = await page.evaluate(([c, s]) => window.speedDraw(c, s, true), [code, selector]);
        check(`15. ${name}: drawn sharing, drawn again on the unmoved record, and drawn afresh - the same innerHTML (${drawn.length} characters)`,
            drawn === afresh && again === afresh && drawn.length > 200);
        if (selector === '#reportsView') {
            // v208: the screen grid of «לפי אתר» with its switch is one block the base never
            // drew (tests/sitegrid.browser.mjs holds it); it is taken out of THIS side before
            // the two trees are compared, and required to have been there.
            reportsNodes = await page.evaluate(() => {
                const copy = document.getElementById('reportsView').cloneNode(true);
                const grids = copy.querySelectorAll('.client-grid');
                grids.forEach(node => node.remove());
                return { html: copy.innerHTML, grids: grids.length, whole: document.getElementById('reportsView').innerHTML };
            });
            check('15. «דוחות» as compared with the base is the page just drawn, less the one grid v208 adds', reportsNodes.whole === drawn && reportsNodes.grids === 1, String(reportsNodes.grids));
            reportsNodes = reportsNodes.html;
            const shared = await page.evaluate(async code => { await window.speedDraw(code, '#reportsView', false); return window.speedPicture(); }, code);
            const fresh = await page.evaluate(async code => { await window.speedDraw(code, '#reportsView', true); return window.speedPicture(); }, code);
            check(`16. sharePrintout('report'): the same PNG bytes drawn sharing and drawn afresh (${shared ? shared.slice(0, 12) : 'no picture'})`, Boolean(shared) && shared === fresh);
        }
    }
    const after = await page.evaluate(() => window.speedDisk().filter(([key]) => key !== 'farkadPayslipsProgress'));
    same('18. drawing every one of them, three times each, wrote nothing (the payslips\' own open-state preference left out)',
        JSON.stringify(after), JSON.stringify(before.filter(([key]) => key !== 'farkadPayslipsProgress')));
    await censusOnly(check, page, before, ['farkadPayslipsProgress']);
    await context.close();

    const old = await freshPage('v204', SEASON.closed, { rate: 1 });
    await old.page.evaluate(() => {
        window.speedReports = async () => {
            showView('reports'); REPORT_SECTION = 'workers'; render();
            for (let n = 0; n < 2400 && document.querySelector('.owes-pending'); n += 1) await new Promise(resolve => setTimeout(resolve, 50));
            await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
            return document.getElementById('reportsView').innerHTML;
        };
    });
    const v204 = await old.page.evaluate(() => window.speedReports());
    check(`15. «דוחות», both sections, is v204's tree's node for node (${v204.length} characters)`, v204 === reportsNodes);
    await old.context.close();
}

same('18. no uncaught error on any page of either build', errors, []);
console.log(`\n        (tests/speed.browser.mjs ran ${((Date.now() - STARTED) / 60000).toFixed(1)} minutes; load ${load()})`);
await browser.close();
await here.close();
await there.close();
rmSync(work, { recursive: true, force: true });
report();
