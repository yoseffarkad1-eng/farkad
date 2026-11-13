// EVERY SCREEN OF THE APP, ONE LIST. A helper, not a suite: it asserts nothing.
//
// Two files walk it - tests/readability.audit.mjs, which writes down what it measures, and
// tests/largetext.browser.mjs, which holds the large display to its floors - so that "every
// screen" is the same list in both, and a screen added to the app is added HERE, once.
//
// What it gives:
//   openApp(browser, url, options)  a phone (width, height, scheme, large display on/off)
//                                   on Playwright's clock in Asia/Jerusalem, seeded
//   SCREENS                         { name, scope, open(page), close(page) } - each one
//                                   opened by the app's own functions, never by markup
//   walk(page, visit)               opens each in turn and calls visit(screen)
//   measure(page, scope)            in the page: every visible text node, pseudo-element
//                                   word and field under the scope with its computed size,
//                                   weight, line-height and contrast against the ground it
//                                   is really drawn on; every target's rectangle; what is
//                                   off the side; what is cut
//
// SYNTHETIC NAMES ONLY. Invented men, invented numbers, invented sites. NOT a real phone:
// Chromium with emulated touch.

// 320x568 since v191's review: the iPhone SE with Display Zoom, where half its findings were.
export const PHONES = [[320, 568], [375, 667], [440, 956]];
export const SCHEMES = ['dark', 'light'];
export const LARGE_KEY = 'farkadDisplay:large';
export const EVENING = '2026-11-10T19:30:00+02:00';      // a Tuesday evening in Israel
export const TODAY = '2026-11-10';
export const TOMORROW = '2026-11-11';

export const CREW = ['דוד כהן', 'עלי חסן', 'מוחמד אבו ראס חוסיין', 'יוסי מזרחי', 'אחמד נסאר', "סאמר ח'טיב", 'רון לוי',
    'איברהים עודה', 'מאיר ביטון', 'חאלד סלאמה', 'נועם פרץ', 'וליד זועבי', 'אבי דהן', 'ראמי חורי'];
export const SITES = ['הרצליה - מגדל הים', 'תל אביב - רוטשילד', 'רמת גן', 'נתניה - עיר ימים', 'פתח תקווה'];

// ---------------------------------------------------------------------------- a phone
//
// options.large: true writes the preference BEFORE the app's first script runs, which is
// how a phone that turned the mode on yesterday opens today.
export async function openApp(browser, url, options = {}) {
    const { width = 440, height = 956, scheme = 'dark', large = false, seeded = true, before = null } = options;
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true,
        hasTouch: true, colorScheme: scheme, serviceWorkers: 'block', timezoneId: 'Asia/Jerusalem', locale: 'he-IL' });
    if (before) await before(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.route('https://wa.me/**', route =>
        route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>wa</title>' }));
    await page.addInitScript(([key, on]) => {
        try {
            if (on && localStorage.getItem('screens:seeded') === null) localStorage.setItem(key, '1');
        } catch (error) { /* the app says what it must about a disk that refuses */ }
    }, [LARGE_KEY, large]);
    // STILL. A dialog fades in over 220ms and a count's ground eases after a commit; a
    // reading taken on the way is the colour of a moment. Nothing the app sizes or paints
    // at rest is touched by this - only how long it takes to get there.
    await page.addInitScript(() => {
        const still = () => {
            if (document.getElementById('screens-still') || !document.head) return;
            const style = document.createElement('style');
            style.id = 'screens-still';
            style.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; scroll-behavior: auto !important; }';
            document.head.appendChild(style);
        };
        still();
        document.addEventListener('DOMContentLoaded', still);
    });
    await page.clock.install({ time: new Date(EVENING) });
    await page.goto(`${url}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof State !== 'undefined' && typeof render === 'function');
    await page.waitForTimeout(300);
    if (seeded) {
        await seed(page);
        // RELOADED: the history of an advance is built from ledger entries, and the origin
        // entry of a legacy advance is written by the boot mirror (js/state.js).
        await page.reload({ waitUntil: 'load' });
        await page.waitForFunction(() => typeof State !== 'undefined' && typeof render === 'function');
        await page.waitForTimeout(300);
        await page.evaluate(seedMoney);
        await page.waitForTimeout(200);
    }
    return { context, page, errors };
}

async function seed(page) {
    await page.evaluate(([crew, sites, today, tomorrow]) => {
        localStorage.setItem('screens:seeded', '1');
        // Two men are paid by the WEEK (v189: the pay sheet opens each group over its own period,
        // and a week of theirs left open inside the fortnight is named under their group).
        State.schedule.workers = crew.map((name, i) => ({ id: 'w' + String(i + 1).padStart(2, '0'), name, active: true,
            dailyRate: 400 + 10 * (i % 4), hourlyRate: 50, phone: i < 9 ? '05200000' + String(10 + i) : '',
            ...(i === 6 || i === 7 ? { payCycles: '2026-08-07=weekly' } : {}) }));
        State.schedule.places = sites.map((name, i) => ({ id: 'p' + (i + 1), name, active: true }));
        State.save();
        const day = new Date(2026, 9, 23);
        const last = new Date(2026, 10, 11);
        let at = 0;
        for (; day <= last; day.setDate(day.getDate() + 1), at += 1) {
            if (day.getDay() === 6) continue;
            const date = toLocalDateStr(day);
            if (date === '2026-11-05') continue;                       // a working day left open: the account banner's reason
            State.schedule.workers.forEach((worker, i) => {
                if (i >= 11) return;                                   // three never recorded
                if (date === today && i === 8) { markAbsent(State.schedule, date, worker.id, 'actual'); return; }
                if (date === tomorrow && i >= 8) return;               // tomorrow is half built
                // נועם פרץ is settled on רמת גן and not recorded yet today: the usual site's
                // chip beside his name in «לא נרשמו» (v189, js/ui/usual.js).
                if (date === today && i === 10) return;
                if ((i + at) % 9 === 0) { markAbsent(State.schedule, date, worker.id, 'actual'); return; }
                const place = i === 10 ? 'p3' : 'p' + (((i + (at % 3)) % 5) + 1);
                if (i === 3 && at % 4 === 0) assignPlace(State.schedule, date, worker.id, 'actual', place, 'double');
                else if (i === 5 && at % 3 === 0) assignPlace(State.schedule, date, worker.id, 'actual', place, 'extra', 2);
                else assignPlace(State.schedule, date, worker.id, 'actual', place);
            });
            if (at % 2 === 0) setRimaCount(State.schedule, date, 'p1', 3);
            if (at % 3 === 0 && typeof setYosefGevesCount === 'function') setYosefGevesCount(State.schedule, date, 'p2', 2);
        }
        setRimaCount(State.schedule, today, 'p1', 3);
        if (typeof setYosefGevesCount === 'function') setYosefGevesCount(State.schedule, today, 'p2', 2);
        addAdvance(State.schedule, 'w02', '2026-11-02', 500, '');
        addAdvance(State.schedule, 'w05', '2026-11-03', 1200, 'ציוד');
        State.save();
        if (typeof transportSetEnabled === 'function') transportSetEnabled(true);
    }, [CREW, SITES, TODAY, TOMORROW]);
}

function seedMoney() {
    const plan = planCarryMigration(State.schedule);
    if (!carryMigrationApproved(State.schedule, plan)) {
        State.commit(recordCarryApproval(State.schedule, plan, new Date().toISOString(), syncDeviceId()));
    }
    const id = Object.keys(State.schedule.advances || {}).find(key => State.schedule.advances[key].workerId === 'w02');
    if (id && typeof recordAdvanceRepaid === 'function') {
        State.commit(recordAdvanceRepaid(State.schedule, id, 200, '2026-11-04', '', new Date().toISOString(), syncDeviceId(), 'cash'));
    }
    if (typeof transportPlace === 'function') {
        const today = todayStr();
        const next = toLocalDateStr(new Date(2026, 10, 11));
        [today, next].forEach(date => {
            transportPlace(date, 'w01', 'tv_01', 1);
            transportPlace(date, 'w02', 'tv_01', 2);
            transportPlace(date, 'w03', 'tv_01', 3);
            transportPlace(date, 'w04', 'tv_05', 1);
            transportPlace(date, 'w05', 'tv_05', 4);
        });
    }
    State.date = todayStr();
    showView('day');
    render();
    const banner = document.getElementById('accountBanner');
    const putAway = banner && banner.style.display !== 'none' && banner.querySelector(':scope > .btn-icon');
    if (putAway) putAway.click();
}

// ---------------------------------------------------------------------------- the screens
const pause = (page, ms = 220) => page.waitForTimeout(ms);
const run = (page, fn, arg) => page.evaluate(fn, arg);
const byText = (page, scope, words) => run(page, ([scope, words]) => {
    const node = [...document.querySelectorAll(`${scope} button, ${scope} summary, ${scope} a`)]
        .find(one => one.offsetParent !== null && one.textContent.replace(/\s+/g, ' ').trim().includes(words));
    if (!node) throw new Error(`no control «${words}» under ${scope}`);
    node.click();
}, [scope, words]);
const home = async page => {
    await run(page, () => {
        if (document.getElementById('askModal').style.display === 'flex') askCancel();
        State.date = todayStr();
        showView('day');
        setDayMode('sites');
        window.scrollTo(0, 0);
    });
    await pause(page, 120);
};
const view = name => async page => { await run(page, name => { showView(name); window.scrollTo(0, 0); }, name); await pause(page); };

const APP = ['body > .app'];

// Two of the old version's cells the migration would not guess at, as js/model/migrate.js
// words them (its 'unknown-place' issue: a split offered when every part is a real site).
// Put in memory only - never written to the disk - and the dialog opened by its banner's
// own function. Runs in the page.
function migrationQuestions() {
    const unknown = value => `"${value}" אינו שם של מקום קיים - יש להחליט ידנית.`;
    const both = 'הרצליה - מגדל הים + תל אביב - רוטשילד';
    State.migrationIssues = [
        { kind: 'unknown-place', index: 1, value: both, date: '2026-11-03', workerId: 'w01', workerName: 'דוד כהן',
            suggestion: { separator: '+', parts: ['הרצליה - מגדל הים', 'תל אביב - רוטשילד'], placeIds: ['p1', 'p2'] }, message: unknown(both) },
        { kind: 'unknown-place', index: 7, value: 'נתניה/פ"ת', date: '2026-11-04', workerId: 'w02', workerName: 'עלי חסן',
            suggestion: null, message: unknown('נתניה/פ"ת') }
    ];
    renderMigration();
    openMigrationModal();
}

// A record with something for «שים לב» and «סגירות שנרשמו» to say: סאמר ח'טיב - paid by the
// week - took 1,500 two weeks ago; that week of his and רון לוי's were closed at one moment,
// and his week since was left open. IN MEMORY ONLY: the model's own writers on the
// live schedule, nothing committed, and owesRecordBack puts back what was there. Both run in
// the page.
function owesRecord() {
    if (window.__owesKept) return;
    window.__owesKept = JSON.stringify({ advances: State.schedule.advances || {}, ledger: State.schedule.ledger || null });
    const at = '2026-10-29T15:40:00.000Z';
    addAdvance(State.schedule, 'w06', '2026-10-26', 1500, '');
    State.schedule.workers[5].payCycles = '2026-08-07=weekly';
    closePeriodChanges(State.schedule, 'w06', '2026-10-23', '2026-10-29', at, syncDeviceId(), 300);
    closePeriodChanges(State.schedule, 'w07', '2026-10-23', '2026-10-29', at, syncDeviceId(), 0);
    closePeriodChanges(State.schedule, 'w08', '2026-10-23', '2026-10-29', '2026-10-30T07:05:00.000Z', 'd_other_phone', 0);
    OWES_PAGE = null;
    render();
}

function owesRecordBack() {
    if (!window.__owesKept) return;
    const kept = JSON.parse(window.__owesKept);
    window.__owesKept = null;
    State.schedule.advances = kept.advances;
    if (kept.ledger) State.schedule.ledger = kept.ledger; else delete State.schedule.ledger;
    delete State.schedule.workers[5].payCycles;
    OWES_PAGE = null;
    ADVANCE_WORKER = null;
    render();
}

// The pay sheet as it opens: «לפי עובד», the cards, the default range (v189: each group read
// over its own period). Runs in the page.
function reportsDefault() {
    REPORT_RANGE.from = null; REPORT_RANGE.to = null; REPORT_PRESET = 'fortnight'; REPORT_RANGE_OPEN = false;
    REPORT_WORKERS = null; REPORT_SECTION = 'workers'; REPORT_CARD_GRID = true;
}

export const SCREENS = [
    { name: 'day - by site', scope: APP, open: async page => { await home(page); } },
    { name: 'day - by worker', scope: APP,
        open: async page => { await home(page); await run(page, () => setDayMode('workers')); await pause(page); },
        close: home },
    { name: 'day - the account banner', scope: ['#accountBanner'],
        open: async page => { await home(page); await run(page, () => {
            Store.remove(ACCOUNT_BANNER_KEY);
            renderAccountBanner();
            const sum = document.querySelector('#accountBanner .banner-sum');
            if (sum && sum.getAttribute('aria-expanded') !== 'true') sum.click();
        }); await pause(page); },
        close: page => run(page, () => { const x = document.querySelector('#accountBanner > .btn-icon'); if (x) x.click(); }) },
    { name: 'day - which day (drawer)', scope: ['#dayDrawer'],
        open: async page => { await home(page); await run(page, () => openDayDrawer()); await pause(page); },
        close: page => run(page, () => closeDayDrawer()) },
    { name: 'assign sheet', scope: ['#assignSheet'],
        open: async page => { await home(page); await run(page, () => openAssignSheet('w06')); await pause(page); },
        close: page => run(page, () => closeAssignSheet()) },
    { name: 'worker picker', scope: ['#workerPickerModal'],
        open: async page => { await home(page); await run(page, () => openWorkerPicker('p1')); await pause(page); },
        close: page => run(page, () => closeWorkerPicker()) },
    { name: 'place picker', scope: ['#placePickerModal'],
        open: async page => { await home(page); await run(page, () => openPlacePicker('w12')); await pause(page); },
        close: page => run(page, () => closePlacePicker()) },
    { name: 'day check', scope: ['#dayCheckModal'],
        open: async page => { await home(page); await run(page, () => openDayCheck()); await pause(page); },
        close: page => run(page, () => closeDayCheck()) },
    { name: 'WhatsApp dialog', scope: ['#shareModal'],
        open: async page => { await home(page); await run(page, () => showDayMessage()); await pause(page); },
        close: page => run(page, () => closeShareModal()) },
    { name: 'seder list', scope: ['#sederModal'],
        open: async page => { await home(page); await run(page, () => openSederList(State.date)); await pause(page); },
        close: page => run(page, () => closeSederList()) },

    { name: 'week - grid', scope: APP,
        open: async page => { await home(page); await view('week')(page); await run(page, () => setWeekPhoneMode('grid')); await pause(page); } },
    { name: 'week - days', scope: APP,
        open: async page => { await view('week')(page); await run(page, () => setWeekPhoneMode('days')); await pause(page); },
        close: page => run(page, () => setWeekPhoneMode('grid')) },

    { name: 'crew', scope: APP, open: view('roster') },
    { name: 'crew - worker card', scope: ['#workerCardModal'],
        open: async page => { await view('roster')(page); await run(page, () => openWorkerCard('w02')); await pause(page); },
        close: page => run(page, () => closeWorkerCard()) },
    { name: 'crew - worker form', scope: ['#workerFormModal'],
        open: async page => { await view('roster')(page); await run(page, () => editWorker('w02')); await pause(page); },
        close: page => run(page, () => closeWorkerForm()) },
    { name: 'crew - site card', scope: ['#siteCardModal'],
        open: async page => { await view('roster')(page); await run(page, () => openSiteCard('p1')); await pause(page, 350); },
        close: page => run(page, () => closeSiteCard()) },
    { name: 'crew - site card, the client\'s text', scope: ['#siteCardModal'],
        open: async page => { await view('roster')(page); await run(page, () => { openSiteCard('p3'); siteCardToggleClient(); }); await pause(page, 350); },
        close: page => run(page, () => closeSiteCard()) },
    { name: 'crew - paste a list', scope: ['#quickModal'],
        open: async page => { await view('roster')(page); await run(page, () => openQuickStart()); await pause(page); },
        close: page => run(page, () => closeQuickStart()) },
    { name: 'crew - reorder', scope: ['#reorderPanel'],
        open: async page => { await view('roster')(page); await run(page, () => openReorder()); await pause(page); },
        close: async page => { await run(page, () => closeReorder()); await pause(page, 120); } },

    { name: 'advances - list', scope: APP,
        open: async page => { await run(page, () => { ADVANCE_WORKER = null; }); await view('advances')(page); } },
    { name: 'advances - one worker', scope: APP,
        open: async page => { await run(page, () => showWorkerAdvances('w02')); await pause(page); } },
    { name: 'advances - the advance form', scope: APP,
        open: async page => { await run(page, () => showWorkerAdvances('w02')); await pause(page);
            await byText(page, '#advancesView', '+ מקדמה'); await pause(page); } },
    { name: 'advances - the repayment form', scope: APP,
        open: async page => { await run(page, () => showWorkerAdvances('w05')); await pause(page);
            await byText(page, '#advancesView', 'העובד החזיר כסף'); await pause(page); } },
    { name: 'advances - the correction form', scope: APP,
        open: async page => { await run(page, () => showWorkerAdvances('w05')); await pause(page);
            await byText(page, '#advancesView', 'תיקון טעות'); await pause(page); },
        close: page => run(page, () => showWorkerAdvances(null)) },

    // «מי חייב כסף», «שים לב» and «סגירות שנרשמו» (js/ui/owes.js). The seeded record has two
    // men who owe and nothing to warn of - that is 'advances - list', above. These four are
    // drawn on a record with a debt two weeks old, a week left open and two closes on
    // it: IN MEMORY ONLY (owesRecord), never written to the disk, and taken back on leaving.
    { name: 'advances - who owes, with the warnings', scope: APP,
        open: async page => { await run(page, owesRecord); await run(page, () => { ADVANCE_WORKER = null; OWES_PAGE = null; }); await view('advances')(page); },
        close: page => run(page, owesRecordBack) },
    { name: 'advances - the closures on record', scope: APP,
        open: async page => { await run(page, owesRecord); await view('advances')(page); await run(page, () => owesOpenPage('closures')); await pause(page); },
        close: page => run(page, owesRecordBack) },
    { name: 'advances - one closure', scope: APP,
        open: async page => { await run(page, owesRecord); await view('advances')(page);
            await run(page, () => owesOpenPage(owesClosures(State.schedule).filter(group => group.items.length > 1)[0].key)); await pause(page); },
        close: page => run(page, owesRecordBack) },
    { name: 'reports - «שים לב», opened', scope: APP,
        open: async page => { await run(page, reportsDefault); await run(page, owesRecord); await view('reports')(page);
            // The row is read after the page has painted when the record moved since the
            // last reading (js/ui/owes.js): wait until nothing is pending.
            await page.waitForFunction(() => !document.querySelector('.owes-pending'));
            await run(page, () => {
                const fold = document.querySelector('#reportsView .owes-warnings');
                if (!fold) throw new Error('no «שים לב» at the head of the reports');
                fold.open = true;
            }); await pause(page); },
        close: page => run(page, () => { OWES_HEAD_OPEN = false; owesRecordBack(); }) },

    { name: 'reports - by worker', scope: APP,
        open: async page => { await run(page, reportsDefault); await view('reports')(page); } },
    { name: 'reports - the «כל העובדים» picker', scope: APP,
        open: async page => { await run(page, reportsDefault); await run(page, () => { REPORT_PICKER_OPEN = true; }); await view('reports')(page); },
        close: page => run(page, () => { REPORT_PICKER_OPEN = false; render(); }) },
    // v192: a man whose pay cycle changes inside the fortnight has a group of his own for the
    // part before it, so the page holds three groups and three buttons above them. In memory
    // only: the record on the disk is not written, and the man is given back his cycle.
    { name: 'reports - three groups (a cycle changed inside the fortnight)', scope: APP,
        open: async page => { await run(page, reportsDefault);
            await run(page, () => { State.schedule.workers[6].payCycles = '2026-08-07=weekly;2026-11-06=biweekly'; }); await view('reports')(page); },
        close: page => run(page, () => { State.schedule.workers[6].payCycles = '2026-08-07=weekly'; render(); }) },
    { name: 'reports - a week left open, shown', scope: APP,
        open: async page => { await run(page, reportsDefault); await view('reports')(page);
            await run(page, () => {
                const show = document.querySelector('#reportsView .report-other-account button');
                if (!show) throw new Error('no «הצג את החשבון» on the page');
                show.click();
            }); await pause(page, 300); },
        close: page => run(page, reportsDefault) },
    { name: 'reports - by worker, detailed', scope: APP,
        open: async page => { await run(page, () => { REPORT_SECTION = 'workers'; REPORT_CARD_GRID = false; }); await view('reports')(page); },
        close: page => run(page, () => { REPORT_CARD_GRID = true; }) },
    { name: 'reports - by site', scope: APP,
        open: async page => { await run(page, () => { REPORT_SECTION = 'sites'; }); await view('reports')(page); },
        close: page => run(page, () => { REPORT_SECTION = 'workers'; }) },
    { name: 'reports - the «הפקת דוח» menu', scope: APP,
        open: async page => { await run(page, () => { REPORT_SECTION = 'workers'; REPORT_CARD_GRID = true; }); await view('reports')(page);
            await run(page, () => { const menu = document.querySelector('#reportsView details.report-output-actions'); if (menu) menu.open = true; }); await pause(page); },
        close: page => run(page, () => { const menu = document.querySelector('#reportsView details.report-output-actions'); if (menu) menu.open = false; }) },
    { name: 'reports - the month on one screen', scope: ['#monthSummaryModal'],
        open: async page => { await view('reports')(page); await run(page, () => {
            openMonthSummary();
            const fold = document.getElementById('monthSummaryFoldLabel');
            if (fold) fold.click();
        }); await pause(page, 350); },
        close: page => run(page, () => closeMonthSummary()) },
    { name: 'reports - a payslip to each man', scope: ['#payslipsModal'],
        open: async page => { await view('reports')(page); await run(page, () => { openPayslips('current'); }); await pause(page, 350); },
        close: page => run(page, () => closePayslips()) },
    { name: 'reports - a payslip, one man\'s text opened', scope: ['#payslipsModal'],
        open: async page => { await run(page, reportsDefault); await view('reports')(page); await run(page, () => {
            openPayslips('current');
            const open = [...document.querySelectorAll('#payslipsModal button')].find(node => node.getAttribute('aria-expanded') === 'false');
            if (!open) throw new Error('no man\'s text to open');
            open.click();
        }); await pause(page, 350); },
        close: page => run(page, () => closePayslips()) },
    { name: 'reports - one worker\'s days', scope: ['#workerDaysModal'],
        open: async page => { await view('reports')(page); await run(page, () => openWorkerDays('w02')); await pause(page, 350); },
        close: page => run(page, () => closeWorkerDays()) },
    { name: 'reports - one worker\'s days, with extra hours', scope: ['#workerDaysModal'],
        open: async page => { await view('reports')(page); await run(page, () => openWorkerDays('w06')); await pause(page, 350); },
        close: page => run(page, () => closeWorkerDays()) },
    { name: 'reports - one weekly worker\'s days', scope: ['#workerDaysModal'],
        open: async page => { await view('reports')(page); await run(page, () => openWorkerDays('w07')); await pause(page, 350); },
        close: page => run(page, () => closeWorkerDays()) },

    { name: 'settings - every row open', scope: ['#settingsPanel'],
        open: async page => { await home(page); await run(page, () => {
            openSettings();
            document.querySelectorAll('#settingsPanel details').forEach(node => { node.open = true; });
            const toggle = document.getElementById('diagnosticToggle');
            if (toggle && toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
        }); await pause(page, 300); },
        close: page => run(page, () => closeSettings()) },
    { name: 'find', scope: ['#findModal'],
        open: async page => { await home(page); await run(page, () => { openFind(); }); await pause(page, 300);
            await run(page, () => { const field = document.querySelector('#findModal input'); if (field) { field.value = 'ר'; field.dispatchEvent(new Event('input', { bubbles: true })); } });
            await pause(page, 300); },
        close: page => run(page, () => closeFind()) },
    { name: 'the «מה חדש» line', scope: ['#whatsNewBanner'],
        open: async page => { await home(page); await run(page, () => whatsNewShowLine()); await pause(page); },
        close: page => run(page, () => whatsNewHideLine()) },
    { name: 'what is new', scope: ['#whatsNewModal'],
        open: async page => { await home(page); await run(page, () => { openWhatsNew('all'); }); await pause(page, 300); },
        close: page => run(page, () => closeWhatsNew()) },
    { name: 'the migration\'s questions', scope: ['#migrationModal'],
        open: async page => { await home(page); await run(page, migrationQuestions); await pause(page, 300); },
        close: page => run(page, () => { closeMigrationModal(); State.migrationIssues = []; renderMigration(); }) },
    { name: 'sign-in dialog', scope: ['#signInModal'],
        open: async page => { await home(page); await run(page, () => openSignInModal()); await pause(page); },
        close: page => run(page, () => closeSignInModal()) },

    { name: 'ask - a question with a field', scope: ['#askModal'],
        open: async page => { await home(page); await run(page, () => { askText({ title: 'שם האתר', value: 'רמת גן', message: 'השם יופיע בכל הדוחות.' }); }); await pause(page); },
        close: page => run(page, () => askCancel()) },
    { name: 'ask - confirm', scope: ['#askModal'],
        open: async page => { await run(page, () => { askConfirm({ title: 'להעביר לארכיון?', message: 'העובד לא יופיע ברשימות, והרישום שלו נשמר.', ok: 'העבר לארכיון', danger: true }); }); await pause(page); },
        close: page => run(page, () => askCancel()) },
    { name: 'ask - tell', scope: ['#askModal'],
        open: async page => { await run(page, () => { askTell('השינוי לא נשמר במכשיר. אם האפליקציה תיסגר, הוא יאבד.'); }); await pause(page); },
        close: page => run(page, () => askCancel()) },
    { name: 'ask - choices', scope: ['#askModal'],
        open: async page => { await run(page, () => { askChoice({ title: 'מי יושב כאן?', choices: ['דוד כהן', 'עלי חסן', 'מוחמד אבו ראס', 'ביטול'] }); }); await pause(page); },
        close: page => run(page, () => askCancel()) },
    // «עוד ⋯» at the foot of the day, and «הכל חופש» behind it (the owner, 2026-11-11, round two):
    // the day's menu, read once its hold is over, and the question it goes straight on to, read
    // once ITS hold is over. Shut by askClose: a held dialog answers nothing for its first 700ms.
    { name: 'ask - the day\'s menu («עוד ⋯»)', scope: ['#askModal'],
        open: async page => { await home(page); await run(page, () => { openDayMore(); }); await pause(page, 820); },
        close: page => run(page, () => askClose(null)) },
    { name: 'ask - «בטוח שכולם בחופש?», through the menu', scope: ['#askModal'],
        open: async page => {
            await home(page);
            await run(page, () => { openDayMore(); });
            await pause(page, 820);
            await run(page, () => { document.querySelector('#askChoices button').click(); });
            await pause(page, 820);
        },
        close: page => run(page, () => askClose(null)) },

    { name: 'banners', scope: ['#updateBanner', '#installBanner', '#offlineBanner', '#storageNotice', '#syncChip', '#undoBar'],
        open: async page => { await home(page); await run(page, () => {
            showUpdateBanner(null);
            Store.remove('farkadInstallDismissed');
            showInstallBanner('ios');
            const offline = document.getElementById('offlineBanner');
            offline.textContent = '📡 אין חיבור. הרישום נשמר במכשיר ויסונכרן כשהחיבור יחזור.';
            offline.style.display = '';
            // The bar the day's ✕ puts up (js/ui/day.js): the same call, the same words.
            editWithUndo('w01', `הרישום של ${isolate('דוד כהן')} נמחק`,
                () => clearWorkerDay(State.schedule, State.date, 'w01', State.layer));
            render();
        }); await pause(page); },
        close: async page => { await run(page, () => {
            ['updateBanner', 'installBanner', 'offlineBanner'].forEach(id => { document.getElementById(id).style.display = 'none'; });
            runUndo();
            render();
        }); await pause(page); } },

    { name: 'rides - the cars and the tray', scope: ['#transportPanel'],
        open: async page => { await home(page); await run(page, () => openTransport(State.date)); await pause(page, 300); },
        close: page => run(page, () => closeTransport()) },
    { name: 'rides - the vehicle list', scope: ['#transportPanel'],
        open: async page => { await run(page, () => {
            openTransport(State.date);
            document.querySelectorAll('#transportPanel details').forEach(node => { node.open = true; });
            const body = document.getElementById('transportBody');
            body.scrollTop = body.scrollHeight;
        }); await pause(page, 300); },
        close: page => run(page, () => closeTransport()) },
    { name: 'rides - summary of the day', scope: ['#transportSummaryModal'],
        open: async page => { await run(page, () => { openTransport(State.date); openTransportSummary(); }); await pause(page, 300); },
        close: page => run(page, () => { closeTransportSummary(); closeTransport(); }) },
    { name: 'rides - report of a period', scope: ['#transportReportModal'],
        open: async page => { await run(page, () => { openTransport(State.date); openTransportReport(); }); await pause(page, 300); },
        close: page => run(page, () => { closeTransportReport(); closeTransport(); }) },

    { name: 'journey 1 - the day with its row', scope: APP,
        open: async page => { await home(page); await run(page, () => { journeyStart(); window.scrollTo(0, 0); }); await pause(page, 300); } },
    { name: 'journey 2 - the check', scope: ['#journeyPanel'],
        open: async page => { await run(page, () => journeyGo(2)); await pause(page, 300); } },
    { name: 'journey 3 - rides', scope: ['#transportPanel'],
        open: async page => { await run(page, () => journeyGo(3)); await pause(page, 300); } },
    { name: 'journey 4 - the last look', scope: ['#journeyPanel'],
        open: async page => { await run(page, () => journeyGo(4)); await pause(page, 300); } },
    { name: 'journey 5 - sending', scope: ['#journeyPanel'],
        open: async page => { await run(page, () => journeyGo(5)); await pause(page, 300); },
        close: async page => { await run(page, () => journeyLeave()); await pause(page); await home(page); } }
];

// Opens each screen in turn. A screen that will not open is REPORTED to the visitor - with
// `failed` set - never skipped: a walk that quietly measured fewer screens is a green
// number about less than it says.
export async function walk(page, visit, only) {
    for (const screen of SCREENS) {
        if (only && !only(screen)) continue;
        let failed = null;
        try { await screen.open(page); } catch (error) { failed = String((error && error.message) || error).split('\n')[0]; }
        const shown = failed ? false : await page.evaluate(scopes => scopes.some(sel =>
            [...document.querySelectorAll(sel)].some(node => node.getClientRects().length > 0)), screen.scope);
        if (!failed && !shown) failed = `nothing drawn under ${screen.scope.join(', ')}`;
        await visit(screen, failed);
        try { if (screen.close) await screen.close(page); } catch (error) { /* the next open starts from home */ }
        await page.waitForTimeout(80);
    }
}

// ---------------------------------------------------------------------------- the ruler
//
// Runs IN THE PAGE. Everything is read off computed style and real rectangles.
export function measureInPage(scopes) {
    const vw = window.innerWidth;
    const parse = text => {
        const m = /rgba?\(([^)]+)\)/.exec(text || '');
        if (!m) return null;
        const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
        return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
    };
    const over = (top, under) => {
        const a = top[3];
        return [0, 1, 2].map(i => top[i] * a + under[i] * (1 - a)).concat([1]);
    };
    const lum = c => [c[0], c[1], c[2]].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
        .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const hex = c => '#' + [c[0], c[1], c[2]].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
    const canvas = (() => {
        const dark = matchMedia('(prefers-color-scheme: dark)').matches;
        return dark ? [18, 18, 18, 1] : [255, 255, 255, 1];
    })();
    // The ground a node is drawn on: every painted ancestor from the nearest opaque one up.
    const groundOf = node => {
        const layers = [];
        let image = false;
        for (let at = node; at && at.nodeType === 1; at = at.parentElement) {
            const cs = getComputedStyle(at);
            const c = parse(cs.backgroundColor);
            if (cs.backgroundImage && cs.backgroundImage !== 'none' && !layers.length) image = true;
            if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
        }
        let ground = layers.length && layers[layers.length - 1][3] >= 1 ? layers.pop() : canvas;
        while (layers.length) ground = over(layers.pop(), ground);
        return { ground, image };
    };
    const opacityOf = node => {
        let o = 1;
        for (let at = node; at && at.nodeType === 1; at = at.parentElement) o *= parseFloat(getComputedStyle(at).opacity);
        return o;
    };
    // What is left of a rectangle after every ancestor that hides its overflow.
    // Once a box that SCROLLS along an axis stands between the words and an edge, what is
    // past that edge is one push away, not hidden: the walk stops clipping along that axis.
    const clipped = (rect, node) => {
        let { left, top, right, bottom } = rect;
        let freeX = false;
        let freeY = false;
        for (let at = node; at && at.nodeType === 1; at = at.parentElement) {
            const cs = getComputedStyle(at);
            if (/inset\(50%/.test(cs.clipPath || '')) return 0;
            if (/auto|scroll/.test(cs.overflowX) && at.scrollWidth > at.clientWidth + 1) freeX = true;
            if (/auto|scroll/.test(cs.overflowY) && at.scrollHeight > at.clientHeight + 1) freeY = true;
            const hx = !freeX && /hidden|clip/.test(cs.overflowX);
            const hy = !freeY && /hidden|clip/.test(cs.overflowY);
            if (!hx && !hy) continue;
            const r = at.getBoundingClientRect();
            if (hx) { left = Math.max(left, r.left); right = Math.min(right, r.right); }
            if (hy) { top = Math.max(top, r.top); bottom = Math.min(bottom, r.bottom); }
        }
        return Math.max(0, right - left) * Math.max(0, bottom - top);
    };
    const scrollsSideways = node => {
        for (let at = node.parentElement; at && at.nodeType === 1; at = at.parentElement) {
            const cs = getComputedStyle(at);
            if (/auto|scroll/.test(cs.overflowX) && at.scrollWidth > at.clientWidth + 1) return true;
        }
        return false;
    };
    const describe = node => {
        const one = at => at.tagName.toLowerCase() + (at.id ? '#' + at.id : '')
            + (typeof at.className === 'string' && at.className.trim() ? '.' + at.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
        const up = node.parentElement;
        return (up && up !== document.body ? one(up) + ' > ' : '') + one(node);
    };
    const shown = node => node.checkVisibility ? node.checkVisibility({ checkVisibilityCSS: true, contentVisibilityAuto: true }) : node.offsetParent !== null;
    const roots = scopes.flatMap(sel => [...document.querySelectorAll(sel)]).filter(shown);

    const texts = [];
    const hidden = [];
    // OUT OF REACH: words past the top or the bottom of the glass, on a layer that does not
    // move with the page (a dialog, a panel), with no box around them that scrolls. On the
    // page itself the page scrolls; on a fixed layer only the layer's own box can.
    const unreachable = [];
    const fixedLayer = node => {
        for (let at = node; at && at.nodeType === 1; at = at.parentElement) {
            if (getComputedStyle(at).position === 'fixed') return true;
        }
        return false;
    };
    const scrollsDown = node => {
        for (let at = node.parentElement; at && at.nodeType === 1; at = at.parentElement) {
            const cs = getComputedStyle(at);
            if (/auto|scroll/.test(cs.overflowY) && at.scrollHeight > at.clientHeight + 1) return true;
        }
        return false;
    };
    const push = (node, words, kind, rect, cs) => {
        const size = parseFloat(cs.fontSize);
        const color = parse(cs.color);
        const { ground, image } = groundOf(node);
        const o = opacityOf(node);
        const ink = color ? over([color[0], color[1], color[2], color[3] * o], ground) : null;
        const lh = cs.lineHeight === 'normal' ? null : parseFloat(cs.lineHeight) / size;
        texts.push({ words: words.replace(/\s+/g, ' ').trim().slice(0, 28), where: describe(node), kind, size,
            weight: Number(cs.fontWeight) || 400, lineHeight: lh === null ? null : Math.round(lh * 100) / 100,
            contrast: ink ? Math.round(ratio(ink, ground) * 100) / 100 : null, ink: ink ? hex(ink) : '', ground: hex(ground),
            image, faded: o < 1, off: Boolean(node.closest(':disabled, [aria-disabled="true"]')),
            lines: rect ? Math.max(1, Math.round(rect.height / (lh === null ? size * 1.2 : parseFloat(cs.lineHeight)))) : 1 });
    };
    const seenField = new Set();
    roots.forEach(root => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const range = document.createRange();
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (!node.nodeValue.trim()) continue;
            const parent = node.parentElement;
            if (!parent || parent.closest('script, style, option, select, textarea, title, noscript')) continue;
            if (!shown(parent)) continue;
            const cs = getComputedStyle(parent);
            if (cs.visibility !== 'visible') continue;
            range.selectNodeContents(node);
            const rect = range.getBoundingClientRect();
            if (rect.width < 1 || rect.height < 1) continue;
            const left = clipped(rect, parent);
            if (left < 4) continue;
            push(parent, node.nodeValue, 'text', rect, cs);
            // Partly under an ancestor that hides its overflow and cannot be scrolled: words
            // a person can see the start of and never the rest.
            if ((rect.bottom > window.innerHeight + 1 || rect.top < -1) && fixedLayer(parent) && !scrollsDown(parent)) {
                unreachable.push({ where: describe(parent), words: node.nodeValue.replace(/\s+/g, ' ').trim().slice(0, 24),
                    top: Math.round(rect.top), bottom: Math.round(rect.bottom) });
            }
            const part = left / (rect.width * rect.height);
            if (part < 0.9) hidden.push({ where: describe(parent), words: node.nodeValue.replace(/\s+/g, ' ').trim().slice(0, 24),
                ellipsis: cs.textOverflow === 'ellipsis' || (cs.webkitLineClamp && cs.webkitLineClamp !== 'none'),
                by: `${Math.round(part * 100)}% of it drawn` });
        }
        const all = [root, ...root.querySelectorAll('*')];
        all.forEach(node => {
            if (node.closest('svg') && node.tagName.toLowerCase() !== 'svg') return;
            if (!shown(node)) return;
            const cs = getComputedStyle(node);
            if (cs.visibility !== 'visible') return;
            ['::before', '::after'].forEach(pseudo => {
                const ps = getComputedStyle(node, pseudo);
                const content = ps.content;
                if (!content || content === 'none' || content === 'normal') return;
                const words = /^"(.*)"$/.exec(content);
                if (!words || !words[1].trim() || ps.display === 'none') return;
                const rect = node.getBoundingClientRect();
                if (rect.width < 1 || clipped(rect, node) < 4) return;
                push(node, words[1], 'drawn', null, ps);
                texts[texts.length - 1].where += pseudo;
            });
            if (/^(INPUT|SELECT|TEXTAREA)$/.test(node.tagName) && node.type !== 'hidden' && node.type !== 'file'
                && node.type !== 'checkbox' && node.type !== 'radio' && !seenField.has(node)) {
                seenField.add(node);
                const rect = node.getBoundingClientRect();
                if (rect.width < 1 || clipped(rect, node) < 4) return;
                if (opacityOf(node) < 0.05) return;                    // a field nobody sees (the date picker under its button)
                const words = node.tagName === 'SELECT' ? (node.selectedOptions[0] || {}).textContent || ''
                    : node.value || node.placeholder || `(${node.type || node.tagName.toLowerCase()})`;
                push(node, words, 'field', null, cs);
            }
        });
    });

    const targets = [];
    const offside = [];
    const cut = [];
    const hits = [];
    const spills = [];
    roots.forEach(root => {
        [root, ...root.querySelectorAll('*')].forEach(node => {
            if (!shown(node) || node.closest('svg')) return;
            const cs = getComputedStyle(node);
            if (cs.visibility !== 'visible') return;
            const rect = node.getBoundingClientRect();
            if (rect.width < 1 || rect.height < 1) return;
            if (clipped(rect, node) < 4) return;
            if (node.matches('button, a[href], select, summary, input:not([type=hidden]), textarea')
                && node.getAttribute('aria-hidden') !== 'true' && node.tabIndex !== -1 && node.type !== 'file'
                && opacityOf(node) >= 0.05) {
                // A tick box inside its label is as big as the label: the label is what a finger lands on.
                const held = (node.type === 'checkbox' || node.type === 'radio') && node.closest('label');
                const rect = held ? held.getBoundingClientRect() : node.getBoundingClientRect();
                targets.push({ where: describe(held || node), words: (node.textContent || node.value || node.id || '').replace(/\s+/g, ' ').trim().slice(0, 24),
                    w: Math.round(rect.width * 10) / 10, h: Math.round(rect.height * 10) / 10 });
                hits.push({ node: held || node, rect });
                // WORDS THAT RUN OUT OF THEIR CONTROL: a word of a control drawn past the
                // control's own edge - over whatever stands beside it («דו־שבועי · 9» under
                // «תצוגה מפורטת», 320, v191's review). The words themselves are measured,
                // not the box's overflow: the active tab's pill reaches past its tab by
                // design and is not a word.
                const box = held || node;
                const edge = box.getBoundingClientRect();
                const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
                let past = 0;
                // A word kept for a screen reader and clipped to a pixel (the emoji of a
                // dressed button, a tab's word on the tight day) is not on the glass.
                const unseen = text => {
                    for (let at = text.parentElement; at && at !== box.parentElement; at = at.parentElement) {
                        const style = getComputedStyle(at);
                        if (style.clipPath !== 'none' || style.visibility === 'hidden' || style.opacity === '0') return true;
                    }
                    return false;
                };
                for (let text = walker.nextNode(); text; text = walker.nextNode()) {
                    if (!text.nodeValue.trim() || unseen(text)) continue;
                    const range = document.createRange();
                    range.selectNodeContents(text);
                    for (const piece of range.getClientRects()) {
                        if (piece.width < 1 || piece.height < 1) continue;
                        past = Math.max(past, edge.left - piece.left, piece.right - edge.right);
                    }
                }
                if (past > 1) {
                    spills.push({ where: describe(box), words: (box.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24),
                        by: `${Math.round(past * 10) / 10}px past its edge` });
                }
            }
            if ((rect.right > vw + 1 || rect.left < -1) && !scrollsSideways(node) && cs.position !== 'fixed'
                && clipped(rect, node.parentElement || node) > 4 && Math.min(rect.right, vw) - Math.max(rect.left, 0) > 0) {
                offside.push({ where: describe(node), left: Math.round(rect.left), right: Math.round(rect.right) });
            }
            const ownText = [...node.childNodes].some(child => child.nodeType === 3 && child.nodeValue.trim());
            if (ownText && /hidden|clip/.test(cs.overflowX + cs.overflowY) && node.clientWidth > 1
                && (node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1)) {
                cut.push({ where: describe(node), words: node.textContent.replace(/\s+/g, ' ').trim().slice(0, 24),
                    ellipsis: cs.textOverflow === 'ellipsis' || (cs.webkitLineClamp && cs.webkitLineClamp !== 'none'),
                    by: `${node.scrollWidth}/${node.clientWidth} x ${node.scrollHeight}/${node.clientHeight}` });
            }
        });
    });
    // CONTROLS THAT OVERLAP: two controls whose rectangles cross, so a finger on the seam
    // lands on the other one (the month's days on the worker's and the site's card at 320,
    // v191's review). Only controls that move together are compared - the same fixed or
    // sticky layer, the same menu laid over the page, and the same scrolling box: a row
    // passing under the dock, or the «הפקת דוח» menu over the sheet it was opened from, is
    // not this.
    const layerOf = node => {
        for (let at = node; at && at.nodeType === 1; at = at.parentElement) {
            const style = getComputedStyle(at);
            if (style.position === 'fixed' || style.position === 'sticky') return at;
            if (style.position === 'absolute' && style.zIndex !== 'auto') return at;
        }
        return null;
    };
    const scrollerOf = node => {
        for (let at = node.parentElement; at && at.nodeType === 1; at = at.parentElement) {
            const cs = getComputedStyle(at);
            if (/auto|scroll/.test(cs.overflowX + cs.overflowY)
                && (at.scrollHeight > at.clientHeight + 1 || at.scrollWidth > at.clientWidth + 1)) return at;
        }
        return null;
    };
    const overlaps = [];
    hits.forEach(one => { one.layer = layerOf(one.node); one.scroller = scrollerOf(one.node); });
    for (let i = 0; i < hits.length; i += 1) {
        for (let j = i + 1; j < hits.length; j += 1) {
            const a = hits[i];
            const b = hits[j];
            if (a.layer !== b.layer || a.scroller !== b.scroller) continue;
            if (a.node.contains(b.node) || b.node.contains(a.node)) continue;
            const w = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
            const h = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
            if (w > 1 && h > 1) {
                overlaps.push({ where: `${describe(a.node)} × ${describe(b.node)}`,
                    words: `${(a.node.textContent || '').trim().slice(0, 12)} × ${(b.node.textContent || '').trim().slice(0, 12)}`,
                    by: `${Math.round(w * 10) / 10}x${Math.round(h * 10) / 10}` });
            }
        }
    }
    const html = document.documentElement;
    hidden.forEach(one => { if (!cut.some(c => c.where === one.where && c.words === one.words)) cut.push(one); });
    return { texts, targets, offside, cut, unreachable, overlaps, spills, page: { scrollWidth: html.scrollWidth, width: vw },
        large: html.classList.contains('display-large') };
}

export const measure = (page, scope) => page.evaluate(measureInPage, scope);

// A SAMPLE OF SIZES, read by name off the app's own screens: `size/weight` of the words,
// the height of a row and a bar. tests/largetext.browser.mjs pins what v186 drew.
export async function sampleInPage() {
    const wait = ms => new Promise(done => setTimeout(done, ms));
    const at = sel => { const n = document.querySelector(sel); if (!n) return null; const cs = getComputedStyle(n);
        return `${parseFloat(cs.fontSize)}/${cs.fontWeight}`; };
    const box = sel => { const n = document.querySelector(sel); return n ? Math.round(n.getBoundingClientRect().height) : null; };
    const out = {};
    State.date = todayStr(); showView('day'); setDayMode('workers'); window.scrollTo(0, 0);
    await wait(300);
    Object.assign(out, { body: at('body'), tab: at('.tab'), wrowName: at('.wrow-name'), wrowTag: at('.wrow .tag'), wrow: box('.wrow'),
        dayLabel: at('.day-label strong'), dayDate: at('.day-date'), dock: at('.day-actions .btn-success'), tabs: box('.tabs'), topbar: box('.topbar') });
    setDayMode('sites');
    await wait(300);
    Object.assign(out, { siteName: at('.site-head .site-name'), assignName: at('.assign-name'), rima: at('.rima-label'), rimaInput: at('.rima-input') });
    showView('week'); setWeekPhoneMode('grid');
    await wait(300);
    Object.assign(out, { weekName: at('.week-table tbody .name-cell'), weekCell: box('.week-table td.week-cell'),
        weekLetter: getComputedStyle(document.querySelector('.week-cell .cell-line[data-initial]'), '::before').fontSize });
    showView('roster');
    await wait(300);
    Object.assign(out, { rosterName: at('#rosterView .roster-details > strong'), rosterMeta: at('.roster-meta') });
    showWorkerAdvances(null);
    await wait(300);
    Object.assign(out, { advanceName: at('.advance-worker-card strong'), advanceSum: at('.advance-worker-card:not(.advance-worker-zero) span'),
        advanceRow: box('.advance-worker-card') });
    REPORT_SECTION = 'workers'; REPORT_CARD_GRID = true; showView('reports');
    await wait(300);
    Object.assign(out, { tileName: at('.report-tile-name'), tileValue: at('.report-tile-value'), tileLabel: at('.report-tile-label') });
    showView('day');
    openTransport(State.date);
    await wait(300);
    Object.assign(out, { seat: at('.transport-seat-taken'), seatEmpty: at('.transport-seat-empty'), chip: at('.transport-chip'), seatBox: box('.transport-seat') });
    closeTransport();
    openSettings();
    await wait(300);
    Object.assign(out, { settingsRow: box('#settingsFoldRestore > summary'), settingsTitle: at('#settingsFoldRestore h3'), settingsHint: at('#settingsFoldRestore .hint') });
    closeSettings();
    return out;
}
