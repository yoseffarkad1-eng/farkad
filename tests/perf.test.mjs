// What the app COSTS: the first suite in this repository that measures time and memory.
//
//   node tests/perf.test.mjs        (or: npm run test:perf)
//
// Fifty-nine suites measured what the app SAYS. Not one of them measured what it costs to
// say it. That gap is not academic: this app is opened on a phone, at the end of a working
// day, by somebody who taps a row thirty times an evening, and it holds a season of days in
// localStorage. A screen that takes half a second to redraw is a screen that gets tapped
// twice, and a double tap on this app is a day of somebody's pay recorded twice or not at
// all. Speed here is a correctness property wearing a stopwatch.
//
// WHAT THIS IS NOT, and the sentence must survive every later edit of this file: these are
// DESKTOP CHROMIUM NUMBERS, measured in a Linux container, and they are a LOWER BOUND.
// tests/mobile.test.mjs already carries the warning about a phone-sized viewport not being
// a phone; it is worse for timing than for layout. A 2019 iPhone has a slower core, a
// smaller cache, a thermally throttled clock and a localStorage implementation that is not
// this one. Nothing in this file may be reported as "the app takes N ms on a phone". What
// it can be reported as: the app takes at LEAST this long, this is where the time goes, and
// this number doubled is a regression somebody introduced.
//
// HOW A NUMBER IS TAKEN. Every measurement is a median of repeated runs with warm-ups
// discarded, taken inside the page with performance.now(), so nothing is being timed
// through the Playwright wire. The median rather than the mean, because one scheduler
// hiccup on a shared container moves a mean and does not move a median. The full spread is
// printed as the detail of every check, so a reader can see the noise rather than trust a
// single figure.
//
// THE CEILINGS ARE TRIPWIRES, NOT A SPEC. Each budget below is roughly twice the number
// measured on the machine named in features/performance/findings.md. Twice, because a
// container's clock is not steady enough to defend a tighter margin and because the
// question worth failing on is "did somebody double the cost of the day screen", not "is
// this machine 15% busier than the one that set the number". A budget that fires is a
// question, not a verdict: re-run it, and if it stays red, find what changed.
//
// AND THIS SUITE IS DELIBERATELY OUT OF THE RELEASE GATE. See tests/README.md and
// package.json: a red suite in this repository is a stop and "flake" is not a cause, and a
// timing suite on a shared container will eventually be red for a reason that is nobody's
// defect. It is run on purpose, by a person, before and after a change that touches the
// hot paths - which is exactly when its numbers mean something.

import { serve } from './serve.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { suite, check, given, report } from './runner.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const EXEC = process.env.CHROME_PATH || undefined;

const server = process.env.SMOKE_URL
    ? { url: process.env.SMOKE_URL, close: () => {} }
    : await serve(new URL('..', import.meta.url).pathname);
const BASE = server.url;

// Whatever the ORIGIN handed the browser, hashed against the commit. The same guard the
// other browser suites carry, and it matters more here than anywhere: a performance number
// is worthless unless the bytes it was measured on can be named.
const SERVED_ROOT = new URL('..', import.meta.url).pathname;
const SERVED_SHA = expectedShaFor(SERVED_ROOT);
const SERVED = await verifyServedAssets(BASE, SERVED_ROOT, SERVED_SHA);

suite('the numbers below came from this commit');
check('the origin served this commit, byte for byte',
    SERVED.ok, `${SERVED.checked} assets; ${SERVED.wrong.slice(0, 3).join(' | ')}`);
console.log(`  (measured at ${SERVED_SHA.slice(0, 12)} on node ${process.version})`);

// --enable-precise-memory-info: without it Chromium rounds usedJSHeapSize to the nearest
// 100KB as a side-channel defence, and a heap that grows by 40KB over two hundred renders -
// which is what a small leak looks like - reads as no change at all. The flag is a
// measurement instrument and is why the memory numbers here exist; it is not something the
// app asks for, and no other suite launches with it.
// --expose-gc: a heap read taken without collecting first is mostly garbage nobody has
// swept yet, and comparing two of those measures the collector's mood rather than the app.
const browser = await chromium.launch({
    ...(EXEC ? { executablePath: EXEC } : {}),
    args: ['--enable-precise-memory-info', '--js-flags=--expose-gc']
});

// ---------------------------------------------------------------- taking a number

// The middle value, which is what every headline number in this file is.
function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = sorted.length >> 1;
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const round = value => Math.round(value * 100) / 100;

// The shape every timing check reports: the median, the fastest and slowest run, and how
// many runs there were. Printing the spread is the only honest way to publish a number from
// a shared machine - a reader who can see min 4ms / max 41ms knows what to believe.
function spread(values) {
    const sorted = [...values].sort((a, b) => a - b);
    return `median ${round(median(sorted))}ms  (min ${round(sorted[0])}, `
        + `max ${round(sorted[sorted.length - 1])}, n=${sorted.length})`;
}

// A page with the app on it, on a phone-sized viewport, with no cloud anywhere near it.
async function newPage() {
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true
    });
    const page = await context.newPage();
    page.on('dialog', dialog => dialog.accept());
    return page;
}

async function open() {
    const page = await newPage();
    await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    // The app boots on DOMContentLoaded and the service worker registers after it; a short
    // settle keeps a registration landing mid-measurement out of the first number.
    await page.waitForTimeout(400);
    return page;
}

// Run one expression inside the page, `runs` times, and hand back every duration. Warm-ups
// are run and thrown away: the first call through a function in V8 is an interpreter pass
// and the shape it reports is not the shape the crew's tenth tap gets.
//
// The body arrives as a source string rather than a function, because it has to close over
// the app's own globals - render, State, payrollReport - which exist only in the page.
async function timeInPage(page, body, { runs = 11, warmups = 3 } = {}) {
    return page.evaluate(([source, runCount, warmupCount]) => {
        const work = new Function(source);
        for (let i = 0; i < warmupCount; i += 1) work();
        const times = [];
        for (let i = 0; i < runCount; i += 1) {
            const started = performance.now();
            work();
            times.push(performance.now() - started);
        }
        return times;
    }, [body, runs, warmups]);
}

// ---------------------------------------------------------------- seeding a real record
//
// Built through the app's own model functions - assignPlace stamps the day's rates the way
// a real tap does - and written through State.save, so what the boot measurements read off
// the disk is a record this app could actually have produced. A hand-written blob would
// measure the parser against a shape the app never writes.

const SEED = `
window.__seed = function (workerCount, placeCount, dayCount, firstDate, fillRatio) {
    State.schedule.workers = Array.from({ length: workerCount }, function (unused, i) {
        return {
            id: 'w_' + String(i + 1).padStart(3, '0'),
            name: 'עובד מספר ' + (i + 1),
            active: true,
            dailyRate: 400 + (i % 5) * 25,
            hourlyRate: 50
        };
    });
    State.schedule.places = Array.from({ length: placeCount }, function (unused, i) {
        return { id: 'p_' + String(i + 1).padStart(2, '0'), name: 'אתר בנייה ' + (i + 1), active: true };
    });

    var start = parseLocalDate(firstDate);
    var written = 0;
    var lastDate = firstDate;
    for (var offset = 0; offset < dayCount; offset += 1) {
        var date = new Date(start);
        date.setDate(start.getDate() + offset);
        if (date.getDay() === 6) continue;          // Saturday is not a working day here
        var value = toLocalDateStr(date);
        lastDate = value;
        State.schedule.workers.forEach(function (worker, i) {
            if ((i + offset) % 10 === 0) { markAbsent(State.schedule, value, worker.id, 'actual'); return; }
            if (i / workerCount >= fillRatio) return;
            assignPlace(State.schedule, value, worker.id, 'actual',
                State.schedule.places[(i + offset) % placeCount].id, RATE_NORMAL);
            written += 1;
        });
    }

    State.date = lastDate;
    var landed = State.save({ silent: true });
    return {
        landed: landed,
        written: written,
        days: Object.keys(State.schedule.days || {}).length,
        bytes: JSON.stringify(State.schedule).length
    };
};
`;

// Every page gets the seeder; whether it is called, and with what, is each suite's business.
async function seeded(workers, places, days, from, fillRatio = 1) {
    const page = await open();
    await page.evaluate(SEED);
    const result = await page.evaluate(
        ([w, p, d, f, r]) => window.__seed(w, p, d, f, r),
        [workers, places, days, from, fillRatio]);
    return { page, result };
}

// The date the seeds start from. A fixed Friday, so the fortnight and month ranges below
// line up with the app's own Friday-anchored account and nothing shifts with the calendar.
const FIRST = '2026-01-02';

// ---------------------------------------------------------------- boot
//
// Read off the navigation timing entry rather than injected timers, because the app's whole
// boot runs synchronously inside its one DOMContentLoaded listener (js/app.js bootOnce):
// State.load, the journal replay, the daily snapshot and the first render() are all between
// domContentLoadedEventStart and domContentLoadedEventEnd. So the split falls out of the
// browser's own clock with nothing added to the app to get it:
//
//   domInteractive                - the document is parsed; every script has been fetched,
//                                   parsed and run, and nothing has read the disk yet
//   ...EventEnd - ...EventStart   - boot: the record read, the journal replayed, the
//                                   snapshot taken, and the first screen drawn
//   domContentLoadedEventEnd      - the moment the app answers a tap
async function bootTiming(page) {
    return page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        return {
            interactive: nav.domInteractive,
            bootStart: nav.domContentLoadedEventStart,
            bootEnd: nav.domContentLoadedEventEnd,
            boot: nav.domContentLoadedEventEnd - nav.domContentLoadedEventStart,
            nodes: document.getElementsByTagName('*').length
        };
    });
}

{
    suite('boot: an empty app, opened for the first time');

    const page = await open();
    const timing = await bootTiming(page);

    check('the scripts are parsed and run inside 400ms',
        timing.interactive < 400, `domInteractive ${round(timing.interactive)}ms`);
    check('boot - read the disk, replay the journal, draw the first screen - is under 120ms',
        timing.boot < 120, `${round(timing.boot)}ms`);
    check('the app answers a tap inside 500ms of the navigation',
        timing.bootEnd < 500, `domContentLoadedEventEnd ${round(timing.bootEnd)}ms`);

    await page.context().close();
}

{
    suite('boot: a season on the disk - 30 workers, 12 sites, 200 days');

    const { page, result } = await seeded(30, 12, 200, FIRST);
    given('the season was written to the device, not to memory',
        result.landed === true, JSON.stringify(result));
    console.log(`  (seed: ${result.days} days, ${result.written} records, `
        + `${Math.round(result.bytes / 1024)}KB of JSON)`);

    // The reload is the honest second open: the service worker is registered by now, so
    // this is the app coming up the way it comes up every evening after the first.
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(400);
    const timing = await bootTiming(page);

    check('a season of records still parses and boots inside 900ms to first tap',
        timing.bootEnd < 900, `domContentLoadedEventEnd ${round(timing.bootEnd)}ms`);
    check('boot itself - the parse of the record, the snapshot and the first draw - is under 400ms',
        timing.boot < 400, `${round(timing.boot)}ms`);
    check('the first screen is not an unreasonable number of nodes',
        timing.nodes < 3000, `${timing.nodes} elements`);

    await page.context().close();
}

// ---------------------------------------------------------------- the day screen
//
// The screen this app IS. Everything else is opened occasionally; this one is opened every
// evening and redrawn after every single tap, because State.commit ends in render().

const CREWS = [30, 60, 120];
const MODES = [['workers', 'לפי עובדים'], ['sites', 'לפי אתרים']];

// Roughly twice the numbers in features/performance/findings.md, per the note at the top of
// this file. Two entries, because the by-site view builds a card per site with a select on
// every row and is genuinely a heavier screen than the flat list.
const DAY_BUDGET = { workers: { 30: 40, 60: 60, 120: 110 }, sites: { 30: 60, 60: 90, 120: 170 } };

for (const crew of CREWS) {
    for (const [mode, hebrew] of MODES) {
        suite(`the day screen: ${crew} workers, ${hebrew}`);

        // Fourteen days of records, so the day on screen is full and the record under it is
        // the size a fortnight of work actually is.
        const { page, result } = await seeded(crew, 12, 14, FIRST);
        given('the crew and the fortnight are on the device',
            result.landed === true, JSON.stringify(result));

        await page.evaluate(mode => { setDayMode(mode); showView('day'); render(); }, mode);

        const times = await timeInPage(page, 'renderDay();');
        check(`one full redraw of the day screen is under ${DAY_BUDGET[mode][crew]}ms`,
            median(times) < DAY_BUDGET[mode][crew], spread(times));

        const size = await page.evaluate(() => ({
            all: document.getElementsByTagName('*').length,
            day: document.getElementById('dayView').getElementsByTagName('*').length
        }));
        check(`the day screen builds fewer than ${crew * 40} nodes`,
            size.day < crew * 40, `${size.day} in #dayView, ${size.all} in the page`);

        await page.context().close();
    }
}

// ---------------------------------------------------------------- the same screens, on a season
//
// The suites above draw a fortnight. A phone that has been in use since the spring is
// holding a season, and two of these screens get SLOWER AS THE RECORD GROWS even though
// they still draw exactly the same number of rows.
//
// The reason is one line in the wrong place. placeLabelsIn (js/model/schema.js) walks every
// day in the schedule looking for sites the roster has lost, and it was called from INSIDE
// the per-row loop on the day screen and the per-CELL loop on the week grid - so drawing
// thirty rows walked the season thirty times, and drawing a week walked it ninety. The map
// cannot change while one screen is being drawn: the schedule is not touched between the
// first row and the last. So the map is built once per draw and handed down.
//
// It is NOT held across draws, and must not be: tests/labelcache.test.mjs pins that these
// two screens follow a site rename immediately, which is exactly what a cached map would
// stop doing. Once per draw is the whole of the fix.
//
// The call count is asserted as well as the time, because the time is a number about this
// machine and the count is a fact about the code. A rewrite that made the map ten times
// cheaper would hide the defect from the clock and not from the count.
{
    suite('a season on the disk: the site-label map is built once per screen, not once per row');

    const { page, result } = await seeded(30, 12, 200, FIRST);
    given('a season of records is on the device',
        result.landed === true, JSON.stringify(result));

    // The counter wraps the global the two screens call. A function declaration at the top
    // level of a classic script is a writable property of the window, and every free
    // reference to it inside day.js and week.js resolves through the same property - so
    // this counts the app's own calls without a line of instrumentation in the app.
    const counted = await page.evaluate(() => {
        const original = window.placeLabelsIn;
        let calls = 0;
        window.placeLabelsIn = function () { calls += 1; return original.apply(this, arguments); };

        const take = draw => { calls = 0; draw(); return calls; };
        setDayMode('workers'); showView('day'); render();
        const byWorker = take(() => renderDay());
        setDayMode('sites'); render();
        const bySite = take(() => renderDay());
        setWeekFromDate(State.date); showView('week'); render();
        const week = take(() => renderWeek());

        window.placeLabelsIn = original;
        return { byWorker, bySite, week };
    });

    check('the day screen by worker builds the map once', counted.byWorker === 1,
        `${counted.byWorker} calls to placeLabelsIn per renderDay()`);
    check('the day screen by site builds it at most once', counted.bySite <= 1,
        `${counted.bySite} calls to placeLabelsIn per renderDay()`);
    check('the week grid builds it once', counted.week === 1,
        `${counted.week} calls to placeLabelsIn per renderWeek()`);

    // And the clock, on the same record. These are the numbers the count above is the
    // explanation for.
    await page.evaluate(() => { setDayMode('workers'); showView('day'); render(); });
    const byWorker = await timeInPage(page, 'renderDay();');
    check('the day screen by worker redraws in under 8ms on a season of records',
        median(byWorker) < 8, spread(byWorker));

    await page.evaluate(() => { setDayMode('sites'); showView('day'); render(); });
    const bySite = await timeInPage(page, 'renderDay();');
    check('the day screen by site redraws in under 8ms on a season of records',
        median(bySite) < 8, spread(bySite));

    // The two ways of looking at one day must cost about the same. They draw the same
    // record and roughly the same number of rows; a five-fold difference between them is
    // never a drawing difference, it is one of them doing work per row that belongs to
    // the screen.
    check('neither way of looking at the day is more than twice the cost of the other',
        median(byWorker) < median(bySite) * 2 + 2 && median(bySite) < median(byWorker) * 2 + 2,
        `by worker ${round(median(byWorker))}ms, by site ${round(median(bySite))}ms`);

    await page.evaluate(() => { setWeekFromDate(State.date); showView('week'); render(); });
    const week = await timeInPage(page, 'renderWeek();');
    check('the week grid redraws in under 12ms on a season of records',
        median(week) < 12, spread(week));

    await page.context().close();
}

// ---------------------------------------------------------------- one tap
//
// The number the crew actually feels. A tap on a site tile in the assign sheet runs
// editWithUndo -> State.commit -> the journal write, the whole-schedule save, the read-back,
// and a full render() - and it happens about thirty times an evening.
//
// It is driven through the real button rather than through the functions behind it, because
// what is being measured is the whole path a finger takes.
{
    suite('one edit, end to end, through the real button');

    const { page, result } = await seeded(30, 12, 14, FIRST);
    given('the crew and the fortnight are on the device',
        result.landed === true, JSON.stringify(result));

    // A fresh day, so every worker is unrecorded and every tap is a first assignment - the
    // ordinary evening, rather than the correction of one.
    const taps = await page.evaluate(() => {
        State.date = '2026-03-06';
        showView('day');
        render();
        const times = [];
        for (let i = 0; i < 25; i += 1) {
            const worker = State.unrecorded()[0];
            if (!worker) break;
            openAssignSheet(worker.id);
            const tile = document.querySelector('#assignSheetBody .sheet-place:not(.sheet-place-on)');
            if (!tile) break;
            const started = performance.now();
            tile.click();
            times.push(performance.now() - started);
        }
        closeAssignSheet();
        return times;
    });

    given('twenty-five taps were actually made', taps.length === 25, `${taps.length} taps`);
    // The interaction budget everyone uses is 100ms for "instant"; 60ms leaves the browser
    // room to paint what the render just built inside one frame budget on a machine several
    // times slower than this one.
    check('a tap that records a day costs under 60ms end to end', median(taps) < 60, spread(taps));
    // The tenth tap must not cost more than the first. A record that grows with every tap -
    // a journal that never prunes, a map rebuilt per row - shows up here and nowhere else.
    check('the last five taps are no worse than twice the first five',
        median(taps.slice(-5)) < median(taps.slice(0, 5)) * 2 + 5,
        `first five ${round(median(taps.slice(0, 5)))}ms, last five ${round(median(taps.slice(-5)))}ms`);

    await page.context().close();
}

// ---------------------------------------------------------------- the journal, as it grows
//
// A LOCAL-ONLY PHONE NEVER PRUNES ITS JOURNAL, and this is the suite that says so with a
// number. js/sync/sync.js collectQueueGarbage lets an operation go only when it is BOTH in
// a written schedule and acknowledged by the cloud (`op.sent`). On the three phones this app
// runs on today - js/sync/firebase-config.js is empty, so there is no cloud - the second
// half is never true, so every edit ever made stays in the queue, is written to its own
// localStorage key, and is replayed onto the schedule at every boot for ever.
//
// That is not a bug to be fixed here: the journal is the ONLY local rebuild of an edit whose
// schedule write failed (iron law 3), and shortening it is a change to how the record
// survives a crash. What this suite does is put a cost on it, so the decision is made
// against a number rather than a feeling.
{
    suite('the journal a phone with no cloud accumulates');

    const { page, result } = await seeded(30, 12, 14, FIRST);
    given('the crew and the fortnight are on the device',
        result.landed === true, JSON.stringify(result));

    const growth = await page.evaluate(() => {
        const dates = [];
        const start = parseLocalDate('2026-04-03');
        for (let d = 0; d < 40; d += 1) {
            const day = new Date(start);
            day.setDate(start.getDate() + d);
            if (day.getDay() !== 6) dates.push(toLocalDateStr(day));
        }

        // Real commits: journal write, whole-schedule save, read-back, render. Exactly what
        // a tap does, minus the sheet.
        const times = [];
        let made = 0;
        for (const date of dates) {
            for (const worker of State.schedule.workers) {
                State.date = date;
                const started = performance.now();
                State.commit(assignPlace(State.schedule, date, worker.id, 'actual', 'p_01', RATE_NORMAL));
                times.push(performance.now() - started);
                made += 1;
                if (made >= 600) break;
            }
            if (made >= 600) break;
        }
        return {
            times,
            pending: FarkadSync.pendingPaths().length,
            keys: Object.keys(localStorage).filter(k => k.indexOf('farkad:outbox') === 0).length
        };
    });

    const early = growth.times.slice(0, 25);
    const late = growth.times.slice(-25);
    given('six hundred edits were made', growth.times.length === 600, `${growth.times.length} edits`);

    check('the queue is still holding every one of them, unsent and unprunable',
        growth.pending === 600, `${growth.pending} paths across ${growth.keys} storage keys`);
    check('the six-hundredth edit costs no more than four times the first',
        median(late) < median(early) * 4 + 5,
        `first 25: ${round(median(early))}ms, last 25: ${round(median(late))}ms`);
    check('even the six-hundredth edit is under 250ms', median(late) < 250, spread(late));

    // And the boot that has to replay all of it.
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(400);
    const timing = await bootTiming(page);
    check('a boot replaying six hundred journal entries is under 1500ms to first tap',
        timing.bootEnd < 1500, `domContentLoadedEventEnd ${round(timing.bootEnd)}ms, `
            + `boot ${round(timing.boot)}ms`);

    await page.context().close();
}

// ---------------------------------------------------------------- the reports screen
//
// Read on payday, over a fortnight; read over a month when somebody is reconciling; read
// over a season when the accountant asks. The arithmetic is measured on its own and the
// whole screen is measured around it, because a report that computes in 8ms and draws in
// 800 is a slow report.
{
    suite('the reports screen, over a fortnight, a month and a season');

    const { page, result } = await seeded(30, 12, 200, FIRST);
    given('a season of records is on the device',
        result.landed === true, JSON.stringify(result));

    const RANGES = [
        ['a fortnight', '2026-01-02', '2026-01-15', 220, 400],
        ['a month', '2026-01-02', '2026-02-01', 320, 600],
        ['a season, 200 days', '2026-01-02', '2026-07-20', 1200, 2400]
    ];

    for (const [label, from, to, arithmeticBudget, screenBudget] of RANGES) {
        await page.evaluate(([f, t]) => {
            REPORT_RANGE.from = f;
            REPORT_RANGE.to = t;
            showView('reports');
        }, [from, to]);

        const money = await timeInPage(page,
            'payrollReport(State.schedule, REPORT_RANGE.from, REPORT_RANGE.to);'
            + 'invoiceReport(State.schedule, REPORT_RANGE.from, REPORT_RANGE.to);',
            { runs: 7, warmups: 2 });
        check(`${label}: the pay and invoice arithmetic is under ${arithmeticBudget}ms`,
            median(money) < arithmeticBudget, spread(money));

        const screen = await timeInPage(page, 'renderReports();', { runs: 7, warmups: 2 });
        check(`${label}: the whole screen redraws in under ${screenBudget}ms`,
            median(screen) < screenBudget, spread(screen));
    }

    const nodes = await page.evaluate(() =>
        document.getElementById('reportsView').getElementsByTagName('*').length);
    check('the season report is under 12000 nodes', nodes < 12000, `${nodes} elements`);

    await page.context().close();
}

// ---------------------------------------------------------------- the week grid
{
    suite('the week grid: 30 workers across seven days');

    const { page, result } = await seeded(30, 12, 14, FIRST);
    given('the crew and the fortnight are on the device',
        result.landed === true, JSON.stringify(result));

    await page.evaluate(() => { setWeekFromDate('2026-01-05'); showView('week'); render(); });
    const times = await timeInPage(page, 'renderWeek();');
    check('one redraw of the week grid is under 120ms', median(times) < 120, spread(times));

    const nodes = await page.evaluate(() =>
        document.getElementById('weekView').getElementsByTagName('*').length);
    check('the week grid is under 4000 nodes', nodes < 4000, `${nodes} elements`);

    await page.context().close();
}

// ---------------------------------------------------------------- storage
//
// State.save() is on the end of every single edit: it stringifies the WHOLE schedule, writes
// it, and reads it back to prove it landed (Store.setVerified - iron law 3). That is the one
// cost in this app that grows straight with the size of the record, and it is paid thirty
// times an evening.
{
    suite('State.save(): the whole record, written and read back, on every edit');

    const sizes = [
        ['a fortnight', 14, 25],
        ['a month', 30, 40],
        ['a season, 200 days', 200, 120]
    ];

    for (const [label, days, budget] of sizes) {
        const { page, result } = await seeded(30, 12, days, FIRST);
        given(`the ${label} is on the device`, result.landed === true, JSON.stringify(result));

        const times = await timeInPage(page, 'State.save({ silent: true });', { runs: 15, warmups: 3 });
        check(`${label} (${Math.round(result.bytes / 1024)}KB): one save is under ${budget}ms`,
            median(times) < budget, spread(times));

        await page.context().close();
    }
}

// ---------------------------------------------------------------- memory
//
// The day screen is rebuilt from scratch on every tap - root.innerHTML = '' and everything
// appended again - and every row it builds carries a click listener. A listener left holding
// a detached node is the classic way that pattern leaks, and on a phone the app stays open
// all evening. Two hundred renders is roughly a busy evening's worth.
{
    suite('two hundred day-screen redraws do not leak');

    const { page, result } = await seeded(60, 12, 14, FIRST);
    given('the crew and the fortnight are on the device',
        result.landed === true, JSON.stringify(result));

    const memory = await page.evaluate(() => {
        const collect = () => { if (typeof gc === 'function') gc(); };
        const heap = () => performance.memory.usedJSHeapSize;

        showView('day');
        render();
        // Ten first, so the measurement starts from a heap that has already grown to hold
        // one drawn screen and its listeners rather than from a cold one.
        for (let i = 0; i < 10; i += 1) renderDay();
        collect();
        const before = heap();

        for (let i = 0; i < 200; i += 1) renderDay();
        collect();
        const after = heap();

        return { before, after, precise: before % 100000 !== 0 || after % 100000 !== 0 };
    });

    const grown = memory.after - memory.before;
    const perRender = grown / 200;
    given('the heap was read at a finer grain than Chromium\'s 100KB default rounding',
        memory.precise === true,
        `before ${memory.before}, after ${memory.after} - if both are round hundreds of KB, `
        + '--enable-precise-memory-info did not take');

    check('two hundred redraws grow the heap by less than 4MB',
        grown < 4 * 1024 * 1024,
        `${Math.round(grown / 1024)}KB over 200 renders (${Math.round(perRender / 1024)}KB each)`);
    check('the heap holding a drawn day screen is under 40MB',
        memory.after < 40 * 1024 * 1024, `${Math.round(memory.after / (1024 * 1024))}MB`);

    await page.context().close();
}

// ---------------------------------------------------------------- the biggest realistic case
//
// 120 workers is twice the biggest crew this app has ever been described as serving, on a
// day where everybody is on a site, drawn the heavier of the two ways. If the DOM is going
// to be the thing that makes a 2019 phone stutter, it is here.
{
    suite('the biggest realistic screen: 120 workers, by site, everybody placed');

    const { page, result } = await seeded(120, 12, 14, FIRST);
    given('the crew and the fortnight are on the device',
        result.landed === true, JSON.stringify(result));

    const size = await page.evaluate(() => {
        setDayMode('sites');
        showView('day');
        render();
        const view = document.getElementById('dayView');
        return {
            nodes: view.getElementsByTagName('*').length,
            buttons: view.querySelectorAll('button').length,
            selects: view.querySelectorAll('select').length,
            depth: (function deepest(node, at) {
                let most = at;
                for (const child of node.children) most = Math.max(most, deepest(child, at + 1));
                return most;
            })(view, 0)
        };
    });

    // 5000 nodes is the number in the brief this suite was written to, and it is a fair
    // line: below it a 2019 phone lays out a screen in one frame, above it the layout
    // itself - not the JavaScript - is what the thumb waits for.
    check('the busiest day screen this app can be given is under 5000 nodes',
        size.nodes < 5000, JSON.stringify(size));
    check('and under 1200 interactive controls',
        size.buttons + size.selects < 1200,
        `${size.buttons} buttons, ${size.selects} selects`);

    await page.context().close();
}

await browser.close();
server.close();
report();
