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
//       exactly once (a spy on weeklyCloseRead) - its count a fresh count's, and «סגירת שבוע»
//       opened after it on the unmoved record.
//   18. NOTHING WRITTEN by any reading (tests/census.mjs), and no uncaught error.
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
for (const kind of ['open', 'closed']) {
    const began = Date.now();
    SEASON[kind] = seasonDisk(kind);
    console.log(`season-${kind}: ${JSON.stringify(SEASON[kind].facts)} - seeded in ${((Date.now() - began) / 1000).toFixed(1)} s`);
}
given('the season-open record is a season', SEASON.open.facts.men === 40 && SEASON.open.facts.advances > 500, JSON.stringify(SEASON.open.facts));

// v204: 6ab193d's own shell, out of Git's object store - never a checkout.
const git = (args, text) => execFileSync('git', ['-C', ROOT, ...args], { maxBuffer: 256 * 1024 * 1024, ...(text ? { encoding: 'utf8' } : {}) });
const work = mkdtempSync(join(tmpdir(), 'farkad-speed-'));
const baseRoot = join(work, 'v204');
{
    const shell = deployedFromSource(git(['show', `${BASE}:sw.js`], true), `${BASE}:sw.js`);
    git(['ls-tree', '-r', '--name-only', BASE, '--', ...shell], true).split('\n').filter(Boolean).forEach(name => {
        mkdirSync(join(baseRoot, dirname(name)), { recursive: true });
        writeFileSync(join(baseRoot, name), git(['show', `${BASE}:${name}`]));
    });
}
const here = await serve(ROOT);
const there = await serve(baseRoot);
check('this build\'s origin serves this commit, byte for byte', (await verifyServedAssets(here.url, ROOT, expectedShaFor(ROOT))).ok);
check('v204\'s origin serves 6ab193d, byte for byte', (await verifyServedAssets(there.url, ROOT, BASE)).ok);
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
        return { longest: Math.max(0, ...tasks), tasks: tasks.length, total: performance.now() - began, finished, moved };
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
        const mine = await measure(first.nowPage.page, `${SNAPSHOT} ${act}`, AFTER_PAINT);
        row(`2. then ${name} redrawn, the record unmoved`, v204, mine, first.v204.longest / 10, '<= 1/10 of v204\'s row 1');
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
    // its count a fresh count's; then «סגירת שבוע» opened after it, the record unmoved.
    const spy = () => {
        window.speedReads = 0;
        const real = weeklyCloseRead;
        weeklyCloseRead = function () { window.speedReads += 1; return real.apply(this, arguments); };
    };
    const fifth = await both(`speedWrite(); ${SNAPSHOT}`, 'window.speedReads >= 1 && closeReminderQuiet === null && !closeReminderSoon',
        { reminder: true, before: spy, keep: true });
    row('5. a write on Thursday, then the close reminder\'s reading after its quiet', fifth.v204, fifth.now, fifth.v204.longest * 0.7, '<= 0.7 of v204\'s');
    const opened = {};
    for (const tree of ['v204', 'now']) {
        const { page, cdp } = fifth[`${tree}Page`];
        await page.waitForTimeout(2500);
        const said = await page.evaluate(() => ({ reads: window.speedReads, kept: CLOSE_REMINDER_KEPT.count,
            line: Boolean(document.getElementById('closeReminderOpen') && document.getElementById('closeReminderOpen').offsetParent) }));
        same(`17. ${tree}: the reminder read the record exactly once after the write`, said.reads, 1);
        const act = `${SNAPSHOT} ${said.line ? "document.getElementById('closeReminderOpen').click();" : 'openWeeklyClose();'}`;
        opened[tree] = await measure(page, act, 'typeof WEEKLY_CLOSE !== "undefined" && WEEKLY_CLOSE && WEEKLY_CLOSE.read');
        opened[`${tree}Line`] = said.line;
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        const fresh = await page.evaluate(() => {
            if (typeof REPORT_SHARED_KEPT !== 'undefined') REPORT_SHARED_KEPT = null;
            return closeReminderReadCount(State.schedule, todayStr(), new Date().toISOString());
        });
        same(`17. ${tree}: the line's count (${said.kept}) is a fresh count's`, said.kept, fresh);
    }
    row(`6. then «סגירת שבוע» opened ${opened.nowLine ? 'from the reminder\'s line' : '(no man to offer, so no line: by the function the line calls)'}, the record unmoved`,
        opened.v204, opened.now, opened.v204.longest / 3, '<= 1/3 of v204\'s same act');
    await fifth.v204Page.context.close();
    await fifth.nowPage.context.close();

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
        await measure(page, "speedWrite(); showView('reports');", AFTER_PAINT);
        const tick = await page.evaluate(() => { const before = Store.tick; Store.set('farkad:prov:sent:advance:speed_row11', '1'); return [before, Store.tick]; });
        given(`${tree}: the provenance key moved the tick`, tick[1] !== tick[0], JSON.stringify(tick));
        eleventh[tree] = await measure(page, `${SNAPSHOT} render();`, AFTER_PAINT);
        await context.close();
    }
    row('11. a write, «דוחות», a send\'s provenance key (the tick moved, the record not), «דוחות» redrawn', eleventh.v204, eleventh.now,
        first.v204.longest / 10, '<= 1/10 of v204\'s row 1');

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
            reportsNodes = drawn;
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
