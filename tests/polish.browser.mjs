// The polish pack on the glass, in a real Chromium: what tests/polish.test.mjs decides in
// Node, measured where a person meets it.
//
//   node tests/polish.browser.mjs
//
//   1. the advances page - a man who owes nothing is quieter than one who owes: weaker
//      ink, ordinary weight, no accent. He is still there, in the same place, under the
//      same words, and still readable at 7:1;
//   2. an empty screen - one sentence, the existing button where there is an obvious next
//      step, and no toolbar or filter that acts on nothing; and the screens that are NOT
//      empty keep every control they had;
//   3. the phone's week - the site's first letter inside its colour block, white on every
//      one of the ten site colours at 4.5:1 or better in both schemes, the block's own
//      text and the cell's accessible name untouched, nothing of it on paper or on a
//      desktop, where the name is written out;
//   4. the backup row in ⋯ - the age it always showed, the same age on the row while it is
//      shut, and after fourteen days one quiet line: no dialog, no banner, nothing written.
//
// NOT a real phone, and not paper: tests/print.test.mjs and tests/week-print.browser.mjs
// read the real PDF and stay green because every look here is inside `@media screen`.
import { chromium } from 'playwright';
import { launchLocalBrowser } from './network-guard.mjs';
import { serve } from './serve.mjs';
import { expectedShaFor, verifyServedAssets } from './treecheck.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import { censusOnly } from './census.mjs';

const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
const served = await verifyServedAssets(server.url, root, expectedShaFor(root));
check('the origin served this commit, byte for byte', served.ok,
    `${served.checked} assets; ${(served.wrong || []).slice(0, 3).join(' | ')}`);
const browser = await launchLocalBrowser(chromium, { executablePath: process.env.CHROME_PATH });

const DATE = '2026-11-09';
const CREW = ['דוד כהן', 'עלי חסן', 'מוחמד אבו ראס', 'יוסי מזרחי', 'אחמד נסאר', 'רון לוי', 'מאיר ביטון'];
// Twelve sites and a palette of ten: every colour is on the grid, and two are worn twice.
const SITES = ['הרצליה - מגדל הים', 'תל אביב - רוטשילד', 'רמת גן', 'נתניה - עיר ימים', 'פתח תקווה',
    'B7 מחסן', 'אשדוד', 'חיפה - נמל', 'לוד', 'יבנה', 'כפר סבא', 'גבעתיים'];

// THE PINNED WORDS (tests/polish.test.mjs holds the same five against the source).
const NO_WORKERS = 'אין עובדים. הוסף עובד כדי להתחיל.';
const WEEK_NO_WORKERS = 'אין עובדים להצגה. הוסף עובד במסך עובדים ואתרים.';
const ADD_WORKER = '+ הוסף עובד';
const WEEK_BLANK = 'אין רישומים בשבוע הזה.';
const RANGE_EMPTY = 'אין רישומים בטווח הזה.';
const BACKUP_REMINDER = 'שבועיים ויותר בלי קובץ גיבוי חדש מהמכשיר הזה.';

async function open(width, height, scheme, seeded = true, mobile = true) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2,
        isMobile: mobile, hasTouch: mobile, colorScheme: scheme, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    const dialogs = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => { dialogs.push(dialog.type()); dialog.dismiss(); });
    await page.goto(server.url, { waitUntil: 'load' });
    await page.evaluate(([crew, sites, date, seeded]) => {
        todayStr = () => date;
        State.date = date;
        if (seeded) {
            State.schedule.workers = crew.map((name, i) => ({ id: 'w_' + String(i + 1).padStart(2, '0'),
                name, active: true, dailyRate: 400, hourlyRate: 50 }));
            State.schedule.places = sites.map((name, i) => ({ id: 'p_' + String(i + 1).padStart(2, '0'),
                name, active: true }));
        }
        State.save();
        showView('day'); render();
        const banner = document.getElementById('accountBanner');
        const putAway = banner && banner.style.display !== 'none' && banner.querySelector(':scope > .btn-icon');
        if (putAway) putAway.click();
    }, [CREW, SITES, DATE, seeded]);
    await page.waitForTimeout(250);
    return { context, page, errors, dialogs };
}

// WCAG contrast of two `rgb(...)` strings, worked out in the page so that a colour the
// browser reports in another notation is still read by the browser that wrote it.
const CONTRAST = `(() => {
    const canvas = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const rgb = colour => { canvas.clearRect(0, 0, 1, 1); canvas.fillStyle = '#000'; canvas.fillStyle = colour;
        canvas.fillRect(0, 0, 1, 1); return [...canvas.getImageData(0, 0, 1, 1).data].slice(0, 3); };
    const lum = colour => { const [r, g, b] = rgb(colour).map(v => { v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    window.__contrast = (a, b) => { const x = lum(a), y = lum(b);
        return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100; };
})()`;

// ------------------------------------------------------------------ 1. the quiet zero
for (const scheme of ['dark', 'light']) {
    suite(`440x956 ${scheme}: on the advances page a man who owes nothing is quieter`);
    const { context, page, errors } = await open(440, 956, scheme);
    await page.evaluate(CONTRAST);
    await page.evaluate(date => {
        addAdvance(State.schedule, 'w_02', date, 500, '');
        addAdvance(State.schedule, 'w_05', date, 1200, '');
        State.save(); showView('advances');
    }, DATE);
    await page.waitForTimeout(200);

    const rows = await page.evaluate(() => {
        const ground = getComputedStyle(document.querySelector('.advance-workers')).backgroundColor;
        return [...document.querySelectorAll('.advance-worker-card')].map(card => {
            const name = card.querySelector('strong'), sum = card.querySelector('span');
            const n = getComputedStyle(name), s = getComputedStyle(sum);
            const box = card.getBoundingClientRect();
            return { name: name.textContent, sum: sum.textContent, quiet: card.classList.contains('advance-worker-zero'),
                nameInk: n.color, sumInk: s.color, nameWeight: Number(n.fontWeight), sumWeight: Number(s.fontWeight),
                nameContrast: __contrast(n.color, ground), sumContrast: __contrast(s.color, ground),
                h: box.height, w: box.width, shown: card.offsetParent !== null };
        });
    });
    same('every man is on the list, in the order the page always had', rows.map(r => r.name), CREW);
    same('and every row says what it said', rows.map(r => r.sum),
        ['0 ₪ נשארו', '500 ₪ נשארו', '0 ₪ נשארו', '0 ₪ נשארו', '1200 ₪ נשארו', '0 ₪ נשארו', '0 ₪ נשארו']);
    same('the two who owe are not quiet, the five who do not are',
        rows.map(r => r.quiet), [true, false, true, true, false, true, true]);
    check('nobody is hidden, and every row is still a 44px target',
        rows.every(r => r.shown && r.h >= 44 && r.w >= 44), JSON.stringify(rows.map(r => r.h)));
    const owes = rows[1], zero = rows[0];
    check('a quiet name is in a weaker ink than a name that owes', zero.nameInk !== owes.nameInk,
        `${zero.nameInk} / ${owes.nameInk}`);
    check('and a quiet figure in a weaker ink than a figure that is owed', zero.sumInk !== owes.sumInk,
        `${zero.sumInk} / ${owes.sumInk}`);
    check('quieter means LESS contrast than the row that owes, name and figure',
        zero.nameContrast < owes.nameContrast && zero.sumContrast < owes.sumContrast,
        JSON.stringify([zero.nameContrast, owes.nameContrast, zero.sumContrast, owes.sumContrast]));
    check('and a lighter weight', zero.nameWeight < owes.nameWeight && zero.sumWeight < owes.sumWeight,
        JSON.stringify([zero.nameWeight, owes.nameWeight, zero.sumWeight, owes.sumWeight]));
    check('quiet is still readable in the sun: 7:1 or better on its ground, both inks, every quiet row',
        rows.filter(r => r.quiet).every(r => r.nameContrast >= 7 && r.sumContrast >= 7),
        JSON.stringify(rows.filter(r => r.quiet).map(r => [r.nameContrast, r.sumContrast])[0]));
    check('the rows that owe look exactly alike', rows[1].sumInk === rows[4].sumInk && rows[1].nameInk === rows[4].nameInk);

    // His own page.
    const pageOf = async id => {
        await page.evaluate(id => showWorkerAdvances(id), id);
        await page.waitForTimeout(150);
        return page.evaluate(() => {
            const box = document.querySelector('.advance-balance');
            const figure = box.querySelector('strong');
            const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
            const probe = document.createElement('i'); probe.style.color = accent; document.body.appendChild(probe);
            const accentRgb = getComputedStyle(probe).color; probe.remove();
            return { quiet: box.classList.contains('advance-balance-zero'), label: box.querySelector('span').textContent,
                figure: figure.textContent, ink: getComputedStyle(figure).color, accent: accentRgb,
                ground: getComputedStyle(box).backgroundColor,
                contrast: __contrast(getComputedStyle(figure).color, getComputedStyle(box).backgroundColor),
                buttons: [...document.querySelectorAll('#advancesView .finance-actions button')].map(b => b.textContent) };
        });
    };
    const settled = await pageOf('w_01');
    const owing = await pageOf('w_02');
    same('his own page says the same words over the same figure', [settled.label, settled.figure], ['נשאר להחזיר', '0 ₪']);
    same('and the man who owes: the same words', [owing.label, owing.figure], ['נשאר להחזיר', '500 ₪']);
    check('the figure of a man who owes is in the accent', owing.ink === owing.accent && !owing.quiet, `${owing.ink} / ${owing.accent}`);
    check('the figure of a man who owes nothing is not', settled.quiet && settled.ink !== settled.accent, settled.ink);
    check('and its box has lost the tint', settled.ground !== owing.ground, `${settled.ground} / ${owing.ground}`);
    check('still 7:1 on its box', settled.contrast >= 7, String(settled.contrast));
    same('both pages keep both actions - the second one closes an account, advance or no advance',
        [settled.buttons, owing.buttons], [['+ מקדמה חדשה', 'קיזוז מהשכר'], ['+ מקדמה חדשה', 'קיזוז מהשכר']]);
    same('no page error', errors, []);
    await context.close();
}

// ------------------------------------------------------------------ 2. empty screens
{
    suite('440x956 dark: an app with no crew and no site - one sentence and the button, on every screen');
    const { context, page, errors, dialogs } = await open(440, 956, 'dark', false);

    const screen = view => page.evaluate(async view => {
        showView(view);
        await new Promise(done => setTimeout(done, 120));
        const root = document.getElementById(view + 'View');
        const on = node => node.offsetParent !== null && getComputedStyle(node).visibility !== 'hidden';
        const size = node => { const r = node.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; };
        return {
            sentences: [...root.querySelectorAll('.empty-hint')].filter(on).map(n => n.textContent),
            buttons: [...root.querySelectorAll('button')].filter(on).map(n => n.textContent.trim()),
            sizes: [...root.querySelectorAll('button')].filter(on).map(size),
            fields: [...root.querySelectorAll('input, select, textarea')].filter(on).length,
            folds: [...root.querySelectorAll('details')].filter(on).length,
            wide: document.documentElement.scrollWidth > document.documentElement.clientWidth
        };
    }, view);

    const advances = await screen('advances');
    same('advances: the one sentence', advances.sentences, [NO_WORKERS]);
    same('advances: the one button', advances.buttons, [ADD_WORKER]);
    same('advances: no search field over nobody', advances.fields, 0);
    check('advances: and no «לא נמצא עובד» - nothing was searched',
        !(await page.locator('#advancesView').innerText()).includes('לא נמצא עובד'));

    const week = await screen('week');
    same('week: the sentence it always said', week.sentences, [WEEK_NO_WORKERS]);
    same('week: the one button - no week to step through, print or share', week.buttons, [ADD_WORKER]);

    // THE REPORTS ARE LEFT AS THEY WERE, on purpose (tests/wording.test.mjs says why the
    // sentence there is a fact about a range and not a setup problem, and the range that
    // would change it is one of the controls). Held here so that nobody "finishes the job".
    const reports = await screen('reports');
    same('reports: the sentence it always said, and no add button', [reports.sentences.slice(0, 1), reports.buttons.includes(ADD_WORKER)], [[RANGE_EMPTY], false]);
    check('reports: the range and the output menu are still there', reports.folds >= 2, String(reports.folds));

    const roster = await screen('roster');
    same('crew: the two sentences it always said', roster.sentences, [NO_WORKERS, 'אין אתרי עבודה. הוסף אתר כדי להתחיל.']);
    same('crew: what starts a crew stays - add a man, paste a list, add a site',
        roster.buttons, [ADD_WORKER, '📋 הדבק רשימה', '+ הוסף אתר']);
    same('crew: no search field over nobody', roster.fields, 0);

    for (const [name, seen] of [['advances', advances], ['week', week], ['crew', roster]]) {
        check(`${name}: every button is 44px both ways`, seen.sizes.every(([w, h]) => w >= 44 && h >= 44), JSON.stringify(seen.sizes));
        check(`${name}: the page does not scroll sideways`, !seen.wide);
    }

    suite('the button under the sentence does what the roster\'s own does');
    for (const view of ['advances', 'week']) {
        await page.evaluate(view => showView(view), view);
        await page.waitForTimeout(120);
        await page.locator(`#${view}View .empty-action`).tap();
        await page.waitForTimeout(200);
        const landed = await page.evaluate(() => ({ view: currentView,
            title: document.getElementById('workerFormTitle').textContent,
            open: document.getElementById('workerFormName').offsetParent !== null }));
        same(`from ${view}: the crew screen, with the add-a-worker form open`, landed,
            { view: 'roster', title: 'הוסף עובד', open: true });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(120);
        if (await page.evaluate(() => document.getElementById('workerFormName').offsetParent !== null)) {
            await page.evaluate(() => closeWorkerForm());
        }
    }
    check('the form really shut between the two', await page.evaluate(() =>
        document.getElementById('workerFormName').offsetParent === null));

    suite('and with the first man, the tools come back');
    const back = await page.evaluate(async () => {
        State.schedule.workers = [{ id: 'w_01', name: 'דוד כהן', active: true, dailyRate: 400, hourlyRate: 50 }];
        State.save(); showView('roster');
        await new Promise(done => setTimeout(done, 120));
        const on = sel => { const n = document.querySelector(sel); return Boolean(n && n.offsetParent !== null); };
        const roster = [on('#rosterWorkerSearch'), on('#reorderOpenBtn'), on('.crew-shortcuts button')];
        showView('advances'); await new Promise(done => setTimeout(done, 120));
        const advances = [on('#advancesView input[type=search]'), document.querySelectorAll('.advance-worker-card').length];
        showView('reports'); await new Promise(done => setTimeout(done, 120));
        const reports = [on('.reports-controls'), on('.report-output-actions'), on('.range-wrap')];
        showView('week'); await new Promise(done => setTimeout(done, 120));
        const week = [on('.week-header .week-print-action'), on('.week-table')];
        return { roster, advances, reports, week };
    });
    same('crew: the search, the reorder button and the shortcuts', back.roster, [true, true, true]);
    same('advances: the search and his row', back.advances, [true, 1]);
    same('reports: the controls, the output menu and the range', back.reports, [true, true, true]);
    same('week: print and the grid', back.week, [true, true]);
    same('no page error, and no browser dialog', [errors, dialogs], [[], []]);
    await context.close();
}

{
    suite('440x956 dark: a crew with nothing recorded is NOT an empty app - every control stays');
    const { context, page, errors } = await open(440, 956, 'dark');

    const week = await page.evaluate(async () => {
        showView('week'); await new Promise(done => setTimeout(done, 150));
        const root = document.getElementById('weekView');
        const note = root.querySelector('.week-empty-note');
        const table = root.querySelector('.week-table');
        return { note: note ? note.textContent : null, noteShown: Boolean(note && note.offsetParent !== null),
            before: Boolean(note && table && (note.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING)),
            header: [...root.querySelectorAll('.week-header button')].map(b => b.textContent.trim()),
            cells: root.querySelectorAll('.week-cell').length, rows: root.querySelectorAll('.week-table tbody tr').length };
    });
    same('the week nobody is on says one sentence', [week.note, week.noteShown], [WEEK_BLANK, true]);
    check('above the grid', week.before);
    same('and keeps its whole header', week.header, ['שבוע קודם', 'שבוע הבא', 'השבוע', '🖨️ הדפסה', '🖼️ שיתוף כתמונה']);
    same('and its whole grid - a cell is still the way into its day', [week.rows, week.cells], [CREW.length, CREW.length * 6]);

    const paper = await page.evaluate(async () => {
        const note = document.querySelector('.week-empty-note');
        return note ? getComputedStyle(note).display : 'missing';
    });
    await page.emulateMedia({ media: 'print' });
    const onPaper = await page.evaluate(() => getComputedStyle(document.querySelector('.week-empty-note')).display);
    await page.emulateMedia({ media: 'screen' });
    check('the sentence is the screen\'s: it is not on paper', paper !== 'none' && onPaper === 'none', `${paper} / ${onPaper}`);

    const after = await page.evaluate(async () => {
        assignPlace(State.schedule, weekDates()[2], 'w_01', 'actual', 'p_01');
        State.save(); render(); await new Promise(done => setTimeout(done, 120));
        return document.querySelector('.week-empty-note') === null;
    });
    check('one day recorded and the sentence is gone', after);

    const tap = await page.evaluate(async () => {
        delete State.schedule.days[weekDates()[2]]; State.save(); render();
        await new Promise(done => setTimeout(done, 120));
        const date = weekDates()[3];
        document.querySelectorAll('.week-table tbody tr')[0].querySelectorAll('.week-cell')[2].click();
        await new Promise(done => setTimeout(done, 120));
        return { view: currentView, date: State.date, expected: date };
    });
    same('and under the sentence a cell still opens its day', [tap.view, tap.date], ['day', tap.expected]);

    const reports = await page.evaluate(async () => {
        showView('reports'); await new Promise(done => setTimeout(done, 150));
        const on = sel => { const n = document.querySelector(sel); return Boolean(n && n.offsetParent !== null); };
        return { hint: [...document.querySelectorAll('#reportsView .report:not(.report-offscreen) .empty-hint')].map(n => n.textContent),
            controls: [on('.reports-controls'), on('.report-output-actions'), on('.range-wrap'), on('.report-section-toggle')],
            add: document.querySelectorAll('#reportsView .empty-action').length };
    });
    same('reports over an empty range: the sentence it always said', reports.hint, [RANGE_EMPTY]);
    same('with every control, because the range is one of them', reports.controls, [true, true, true, true]);
    same('and no add-a-worker button - the crew exists', reports.add, 0);

    suite('every man archived, none of them in this week: the steps stay, print and share do not');
    const archived = await page.evaluate(async () => {
        State.schedule.workers.forEach(worker => { worker.active = false; });
        State.save(); showView('week'); await new Promise(done => setTimeout(done, 150));
        const root = document.getElementById('weekView');
        return { header: [...root.querySelectorAll('.week-header button')].map(b => b.textContent.trim()),
            hints: [...root.querySelectorAll('.empty-hint')].map(n => n.textContent),
            add: root.querySelectorAll('.empty-action').length, table: root.querySelectorAll('.week-table').length };
    });
    same('another week may hold their days, so it can still be stepped to', archived.header, ['שבוע קודם', 'שבוע הבא', 'השבוע']);
    same('the sentence this screen always said, and no table', [archived.hints, archived.table], [[WEEK_NO_WORKERS], 0]);
    same('and no add button: the men exist, they are switched off', archived.add, 0);
    same('no page error', errors, []);
    await context.close();
}

// ------------------------------------------------------------------ 3. the site's letter
for (const [width, height, scheme] of [[440, 956, 'dark'], [440, 956, 'light'], [390, 844, 'dark'], [320, 568, 'light']]) {
    suite(`${width}x${height} ${scheme}: the week - the site's letter inside its colour block`);
    const { context, page, errors } = await open(width, height, scheme);
    await page.evaluate(CONTRAST);
    const seeded = await page.evaluate(async () => {
        setWeekFromDate(State.date);
        const day = weekDates()[2], other = weekDates()[3];
        // One man per site across two days, so all twelve sites are on the grid; then one
        // man on two sites, a doubled day and a day with extra hours.
        State.schedule.places.forEach((place, i) => {
            const worker = State.schedule.workers[i % State.schedule.workers.length];
            assignPlace(State.schedule, i < 7 ? day : other, worker.id, 'actual', place.id);
        });
        assignPlace(State.schedule, weekDates()[4], 'w_01', 'actual', 'p_01');
        assignPlace(State.schedule, weekDates()[4], 'w_01', 'actual', 'p_02');
        assignPlace(State.schedule, weekDates()[4], 'w_02', 'actual', 'p_03', RATE_DOUBLE);
        assignPlace(State.schedule, weekDates()[4], 'w_03', 'actual', 'p_04', RATE_EXTRA, 2);
        // And the eleventh site doubled: the diamond, the letter and the dot in one block.
        assignPlace(State.schedule, weekDates()[4], 'w_04', 'actual', 'p_11', RATE_DOUBLE);
        State.save(); showView('week'); render();
        await new Promise(done => setTimeout(done, 300));
        return { rates: [entryRate(entriesFor(State.schedule, weekDates()[4], 'w_02', 'actual')[0]),
            entryRate(entriesFor(State.schedule, weekDates()[4], 'w_03', 'actual')[0])], want: [RATE_DOUBLE, RATE_EXTRA] };
    });
    given('the fixture really holds a doubled day and an extra-hours day', JSON.stringify(seeded.rates) === JSON.stringify(seeded.want), JSON.stringify(seeded));

    const blocks = await page.evaluate(() => [...document.querySelectorAll('.week-cell .cell-line')].map(node => {
        const before = getComputedStyle(node, '::before');
        const after = getComputedStyle(node, '::after');
        const box = node.getBoundingClientRect(), cell = node.closest('.week-cell').getBoundingClientRect();
        const name = node.querySelector('.site-name');
        return { site: name.textContent, text: node.textContent,
            letter: before.content, ink: before.color, size: parseFloat(before.fontSize), weight: Number(before.fontWeight),
            ground: getComputedStyle(node).backgroundColor,
            contrast: __contrast(before.color, getComputedStyle(node).backgroundColor),
            w: box.width, h: box.height,
            inside: box.left >= cell.left - 0.5 && box.right <= cell.right + 0.5 && box.top >= cell.top - 0.5 && box.bottom <= cell.bottom + 0.5,
            cell: [cell.width, cell.height], nameShown: getComputedStyle(name).display !== 'none',
            double: node.classList.contains('cell-double'), extra: node.classList.contains('cell-extra'),
            afterGround: after.backgroundColor, afterContent: after.content, afterPosition: after.position,
            mark: node.querySelector('.site-mark') ? getComputedStyle(node.querySelector('.site-mark')).position : null,
            label: node.closest('.week-cell').getAttribute('aria-label') };
    }));
    given('every site is on the grid', new Set(blocks.map(b => b.site)).size === SITES.length, String(blocks.length));

    const first = name => (/[\p{L}\p{N}]/u.exec(name) || [''])[0];
    const wrong = blocks.filter(b => b.letter !== JSON.stringify(first(b.site)));
    check('every block carries the first letter of its own site', wrong.length === 0, JSON.stringify(wrong.slice(0, 2)));
    same('the twelve letters, as a person reads them off the names',
        SITES.map(site => JSON.parse(blocks.find(b => b.site === site).letter)), ['ה', 'ת', 'ר', 'נ', 'פ', 'B', 'א', 'ח', 'ל', 'י', 'כ', 'ג']);
    check('white, bold, and 12px or more', blocks.every(b => b.ink === 'rgb(255, 255, 255)' && b.weight >= 700 && b.size >= 12),
        JSON.stringify(blocks.slice(0, 1).map(b => [b.ink, b.weight, b.size])));
    const grounds = [...new Set(blocks.map(b => b.ground))];
    same('all ten site colours are on the grid', grounds.length, 10);
    const weakest = Math.min(...blocks.map(b => b.contrast));
    check('the letter clears 4.5:1 on every one of the ten', weakest >= 4.5, `weakest ${weakest}`);
    check('the block is big enough for it and inside its cell',
        blocks.every(b => b.h >= 20 && b.w >= 20 && b.inside), JSON.stringify(blocks.filter(b => !(b.h >= 20 && b.w >= 20 && b.inside)).slice(0, 2)));
    check('and every cell is still a 44px target', blocks.every(b => b.cell[0] >= 44 && b.cell[1] >= 44));
    check('the name itself is still not drawn in the block - the legend has it', blocks.every(b => !b.nameShown));

    // The letter is the stylesheet's, so nothing that READS the block has gained a letter.
    check('the block\'s own text is its name, its mark and its rate word, as before',
        blocks.every(b => b.text.replace('◆', '').indexOf(b.site) === 0 && !b.text.startsWith(first(b.site) + b.site)),
        JSON.stringify(blocks.slice(0, 2).map(b => b.text)));
    check('and the cell\'s accessible name says the site once', blocks.every(b => b.label.split(b.site).length === 2),
        JSON.stringify(blocks.slice(0, 1).map(b => b.label)));

    const doubled = blocks.filter(b => b.double), extra = blocks.filter(b => b.extra), lapped = blocks.filter(b => b.mark);
    given('a doubled day, an extra-hours day and a second-lap site are drawn', doubled.length > 0 && extra.length > 0 && lapped.length > 0,
        JSON.stringify([doubled.length, extra.length, lapped.length]));
    check('a doubled day keeps its white dot, now BESIDE the letter and not through it',
        doubled.every(b => b.afterGround === 'rgb(255, 255, 255)' && b.afterPosition === 'static'), JSON.stringify(doubled[0]));
    check('extra hours keep their plus, beside the letter', extra.every(b => b.afterContent === '"+"' && b.afterPosition === 'static'));
    check('and the second-lap diamond stands in the row with them', lapped.every(b => b.mark === 'static'));
    check('a block that carries a mark is wider than one that does not',
        Math.min(...doubled.concat(extra, lapped).map(b => b.w)) > Math.min(...blocks.filter(b => !b.double && !b.extra && !b.mark).map(b => b.w)));

    const legend = await page.evaluate(() => [...document.querySelectorAll('.week-legend .tag-place')].map(chip => ({
        text: chip.textContent, shown: chip.offsetParent !== null, before: getComputedStyle(chip, '::before').content })));
    check('the legend still names every active site in full, and has no letter pasted on it',
        legend.length === SITES.length && legend.every(c => c.shown && (c.before === 'none' || c.before === 'normal')), JSON.stringify(legend.slice(0, 1)));
    check('the page does not scroll sideways', await page.evaluate(() =>
        document.documentElement.scrollWidth <= document.documentElement.clientWidth));

    await page.emulateMedia({ media: 'print' });
    const paper = await page.evaluate(() => [...document.querySelectorAll('.week-cell .cell-line')].map(node => ({
        letter: getComputedStyle(node, '::before').content, name: getComputedStyle(node.querySelector('.site-name')).display })));
    await page.emulateMedia({ media: 'screen' });
    check('on paper there is no letter - the name is written out, as before',
        paper.every(p => (p.letter === 'none' || p.letter === 'normal') && p.name !== 'none'), JSON.stringify(paper[0]));
    same('no page error', errors, []);
    await context.close();
}

{
    suite('1100x800: on a desktop the name is in the cell, and no letter is drawn');
    const { context, page } = await open(1100, 800, 'light', true, false);
    const wide = await page.evaluate(async () => {
        setWeekFromDate(State.date);
        assignPlace(State.schedule, weekDates()[2], 'w_01', 'actual', 'p_01');
        State.save(); showView('week'); render();
        await new Promise(done => setTimeout(done, 200));
        const node = document.querySelector('.week-cell .cell-line');
        return { letter: getComputedStyle(node, '::before').content, name: getComputedStyle(node.querySelector('.site-name')).display };
    });
    check('no letter, the whole name', (wide.letter === 'none' || wide.letter === 'normal') && wide.name !== 'none', JSON.stringify(wide));
    await context.close();
}

// ------------------------------------------------------------------ 4. the backup row
for (const scheme of ['dark', 'light']) {
    suite(`440x956 ${scheme}: the backup row in ⋯ - the age, and one quiet line after fourteen days`);
    const { context, page, errors, dialogs } = await open(440, 956, scheme);
    await page.evaluate(CONTRAST);

    const row = async (daysAgo, shut = false) => page.evaluate(async ([daysAgo, shut, today]) => {
        if (daysAgo === null) Store.remove('scheduleData:lastBackup');
        else if (typeof daysAgo === 'string') Store.set('scheduleData:lastBackup', daysAgo);
        else { const d = parseLocalDate(today); d.setDate(d.getDate() - daysAgo); Store.set('scheduleData:lastBackup', toLocalDateStr(d)); }
        closeSettings(); openSettings();
        await new Promise(done => setTimeout(done, 150));
        const fold = document.getElementById('settingsFoldBackup');
        const openedBySheet = fold.open;
        if (shut) fold.open = false;
        // Without the service worker's census of open builds (tests/census.mjs says why).
        const diskKeys = Object.keys(localStorage).sort().filter(key => key !== 'farkad:openBuilds');
        const diskNow = () => JSON.stringify(Object.keys(localStorage).sort()
            .filter(key => key !== 'farkad:openBuilds').map(key => [key, localStorage[key]]));
        const disk = diskNow();
        renderBackupAge(); render();
        await new Promise(done => setTimeout(done, 80));
        const wrote = diskNow() !== disk;
        const on = node => Boolean(node) && node.offsetParent !== null && getComputedStyle(node).display !== 'none' && node.getBoundingClientRect().height > 0;
        const age = document.getElementById('backupAge'), onRow = document.getElementById('backupAgeRow'),
            reminder = document.getElementById('backupReminder');
        const head = fold.querySelector(':scope > summary');
        const style = getComputedStyle(reminder || head), box = (reminder || head).getBoundingClientRect();
        const card = fold.getBoundingClientRect();
        return { openedBySheet, stillShut: !fold.open, wrote, diskKeys,
            age: age.textContent, ageShown: on(age) && fold.open,
            row: onRow ? onRow.textContent : '', rowShown: on(onRow),
            onHead: [onRow, reminder].every(node => !node || head.contains(node)),
            order: [...head.querySelectorAll('h3, p')].map(node => node.id || node.tagName),
            reminder: on(reminder) ? reminder.textContent : null,
            lines: on(reminder) ? Math.round(box.height / parseFloat(style.lineHeight)) : 0,
            contrast: on(reminder) ? __contrast(style.color, getComputedStyle(fold).backgroundColor) : null,
            plain: [style.backgroundColor, style.borderTopWidth, style.position],
            inRow: box.left >= card.left && box.right <= card.right,
            summary: fold.querySelector('summary').getBoundingClientRect().height,
            // By `display`, not offsetParent: both of these are position:fixed, and a fixed
            // box has no offsetParent whether it is on the glass or not.
            dialogs: [...document.querySelectorAll('.modal')]
                .filter(m => getComputedStyle(m).display !== 'none').map(m => m.id),
            panelOpen: document.getElementById('settingsPanel').classList.contains('open')
                && getComputedStyle(document.getElementById('settingsPanel')).display !== 'none' };
    }, [daysAgo, shut, DATE]);

    let seen = await row(null);
    same('never: the sentence it always said, inside the open row', [seen.age, seen.ageShown], ['אין במכשיר הזה רישום של ייצוא קובץ גיבוי.', true]);
    same('never: no reminder', seen.reminder, null);
    check('the sheet opened the row, as it does every time', seen.openedBySheet);
    check('open, the row does not say the age twice', !seen.rowShown);
    same('and its head holds its title and its own line, and nothing empty beside them', seen.order, ['H3', 'P']);

    seen = await row(0);
    same('today: the age, and no reminder', [seen.age, seen.reminder], ['קובץ גיבוי נמסר לדפדפן: היום.', null]);
    seen = await row(13);
    same('thirteen days: the age, and no reminder yet', [seen.age, seen.reminder], ['קובץ גיבוי נמסר לדפדפן: לפני 13 ימים.', null]);

    seen = await row(14);
    same('fourteen days: the age', seen.age, 'קובץ גיבוי נמסר לדפדפן: לפני 14 ימים.');
    same('fourteen days: the reminder, word for word', seen.reminder, BACKUP_REMINDER);
    same('one line of it at this width', seen.lines, 1);
    check('on the backup row itself, in its head', seen.inRow && seen.onHead);
    check('quiet: text only - no box, no border, nothing fixed over the page',
        ['rgba(0, 0, 0, 0)', 'transparent'].includes(seen.plain[0]) && seen.plain[1] === '0px' && seen.plain[2] === 'static', JSON.stringify(seen.plain));
    check('and readable: 4.5:1 or better on the row', seen.contrast >= 4.5, String(seen.contrast));
    same('not a dialog, and the sheet is still the sheet', [seen.dialogs, seen.panelOpen], [[], true]);
    same('drawing it wrote nothing to the disk', seen.wrote, false);
    await censusOnly(check, page, seen.diskKeys);
    check('the row is still a 56px row', seen.summary >= 56, String(seen.summary));

    seen = await row(40, true);
    check('a redraw does not reopen a row the person shut', seen.stillShut);
    same('shut, the row itself says the age - the same sentence', [seen.rowShown, seen.row], [true, 'קובץ גיבוי נמסר לדפדפן: לפני 40 ימים.']);
    same('and the reminder holds on the shut row, under the age', [seen.reminder, seen.order],
        [BACKUP_REMINDER, ['H3', 'P', 'backupAgeRow', 'backupReminder']]);
    const reopened = await page.evaluate(async () => {
        const fold = document.getElementById('settingsFoldBackup');
        fold.querySelector('summary').click();
        await new Promise(done => setTimeout(done, 150));
        return { open: fold.open, age: document.getElementById('backupAgeRow') === null,
            reminder: Boolean(document.getElementById('backupReminder')) };
    });
    same('a finger opens the row: the repeated age leaves it, the reminder stays', reopened, { open: true, age: true, reminder: true });
    seen = await row(null, true);
    same('shut and never: the row says so', [seen.rowShown, seen.row, seen.reminder], [true, 'אין במכשיר הזה רישום של ייצוא קובץ גיבוי.', null]);
    seen = await row('not-a-date');
    same('an unreadable date: unknown, and no reminder', [seen.age, seen.reminder], ['מועד מסירת קובץ הגיבוי לדפדפן אינו ידוע.', null]);

    // The real button: a file handed over takes the line away.
    await row(20);
    await page.evaluate(() => { window.__handed = []; handOverBlob = (blob, name) => { window.__handed.push(name); return true; }; });
    await page.locator('#settingsFoldBackup .backup-primary').tap();
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => ({ handed: window.__handed.length,
        age: document.getElementById('backupAge').textContent, reminder: document.getElementById('backupReminder') === null }));
    same('after «שמור קובץ גיבוי»: today, and the reminder is gone', after, { handed: 1, age: 'קובץ גיבוי נמסר לדפדפן: היום.', reminder: true });
    // Non-vacuity for «not a dialog» above: the same question, asked while one IS open.
    const counted = await page.evaluate(() => [...document.querySelectorAll('.modal')]
        .filter(m => getComputedStyle(m).display !== 'none').length);
    check('(and the question can be answered yes: the hand-over dialog that follows the button is counted)', counted === 1, String(counted));
    same('no page error, and no browser dialog', [errors, dialogs], [[], []]);
    await context.close();
}

{
    suite('320x568 light: the reminder on the narrowest phone');
    const { context, page } = await open(320, 568, 'light');
    const narrow = await page.evaluate(async () => {
        const d = parseLocalDate(todayStr()); d.setDate(d.getDate() - 30); Store.set('scheduleData:lastBackup', toLocalDateStr(d));
        openSettings(); await new Promise(done => setTimeout(done, 200));
        const reminder = document.getElementById('backupReminder');
        if (!reminder) return { text: '' };
        const box = reminder.getBoundingClientRect();
        const card = document.getElementById('settingsFoldBackup').getBoundingClientRect();
        return { text: reminder.textContent, inside: box.left >= card.left - 0.5 && box.right <= card.right + 0.5,
            lines: Math.round(box.height / parseFloat(getComputedStyle(reminder).lineHeight)),
            wide: document.documentElement.scrollWidth > document.documentElement.clientWidth };
    });
    check('it wraps inside the row instead of pushing the sheet wide', narrow.text.length > 0 && narrow.inside && !narrow.wide && narrow.lines <= 2,
        JSON.stringify(narrow));
    await context.close();
}

await browser.close();
server.close();
report();
