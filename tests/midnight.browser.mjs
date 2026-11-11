// Midnight with a writer open, in a real Chromium on Playwright's clock.
//
//   node tests/midnight.browser.mjs
//
// The review of v189 found two old defects of one kind (c1, c2). watchDayRollover (js/app.js)
// follows the calendar when the page comes back on a new day, so that the morning's first
// record does not land on yesterday. It did that whatever was open over the day: the assign
// sheet, «לאן הלך» and a site's picker each name their day once, when they are drawn, and
// write to State.date at the tap - so a sheet opened at 23:50 on Tuesday and tapped at 00:05
// still said «יום שלישי 10/11» and wrote the man's site to WEDNESDAY, rate-stamped and queued,
// leaving Tuesday empty. «🧹 רוקן אתר» counted the men before its question and read the date
// after the answer, so a question answered in the morning emptied Wednesday's site.
//
// Measured here, for every surface that names a day and writes it - the sheet walked from the
// by-worker list, the sheet opened from a man's row (a rate), «לאן הלך», a site's picker,
// «🧹 רוקן אתר», «הכל חופש» and a site's count box holding typed digits: opened on Tuesday
// before midnight, the phone locked, the clock moved past midnight, the phone unlocked, the
// write made by a real touch - and the write lands on the day the surface named, in memory,
// on the disk and in the queue; Wednesday is untouched. And the follow still happens: at once
// when nothing is open, in the same turn as the close of the last dialog when something was,
// at the next return for a typed box, and never off a day somebody moved to by hand. And a
// man another phone moved, or marked absent, while «🧹 רוקן אתר» was asking keeps his day.
//
// The clock is Playwright's, installed before the page loads, in Israel's time zone: nothing
// here replaces todayStr. The phone's lock is the page's own visibilitychange, with
// document.visibilityState answered as a phone answers it. NOT a real phone.

import { chromium } from 'playwright';
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

const TUE = '2026-11-10';
const WED = '2026-11-11';
const EVENING = '2026-11-10T23:50:00+02:00';    // Tuesday, ten to midnight, in Israel
const AFTER = '2026-11-11T00:05:00+02:00';      // Wednesday, five past
const LATER = '2026-11-11T00:20:00+02:00';
const MORNING = '2026-11-11T07:10:00+02:00';
const bare = text => String(text || '').replace(/[⁦-⁩‎]/g, '');

// Synthetic names.
const CREW = ['דוגמה אחת', 'דוגמה שתיים', 'דוגמה שלוש', 'דוגמה ארבע'];
const SITES = ['אתר צפון', 'אתר דרום'];

// A phone woken on Tuesday evening, its clock running from EVENING. `work` is a list of
// [date, man, site] already recorded.
async function phone(work = []) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
        isMobile: true, hasTouch: true, timezoneId: 'Asia/Jerusalem' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({ time: new Date(EVENING) });
    await page.goto(server.url);
    await page.waitForFunction(() => typeof State === 'object' && State.schedule && typeof openAssignSheet === 'function'
        && typeof watchDayRollover === 'function');
    await page.evaluate(([crew, sites, work]) => {
        State.schedule.workers = crew.map((name, at) => ({ id: 'w_0' + (at + 1), name, active: true, dailyRate: 400 }));
        State.schedule.places = sites.map((name, at) => ({ id: 'p_0' + (at + 1), name, active: true }));
        State.commitRoster();
        work.forEach(([date, id, site]) => State.commit(assignPlace(State.schedule, date, id, 'actual', site)));
        hideUndo();
        showView('day'); setDayMode('sites'); render();
        const banner = document.getElementById('accountBanner');
        const putAway = banner && banner.style.display !== 'none' && banner.querySelector(':scope > .btn-icon');
        if (putAway) putAway.click();
    }, [CREW, SITES, work]);
    await page.waitForTimeout(100);
    return { context, page };
}

// The phone locked, the clock moved on, the phone unlocked - as the page sees it.
async function lockUntil(page, when) {
    await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.setSystemTime(new Date(when));
    await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
        document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(150);
}

const sites = (page, date, id) => page.evaluate(([date, id]) =>
    entriesFor(State.schedule, date, id, 'actual').map(entry => entry.placeId), [date, id]);
const onDisk = (page, date, id) => page.evaluate(([date, id]) => {
    const disk = JSON.parse(localStorage.getItem('scheduleData:v2') || '{}');
    const record = (((disk.days || {})[date] || {}).actual || {})[id];
    return record ? (record.absent ? 'absent' : (record.entries || []).map(entry => entry.placeId).join('+')) : null;
}, [date, id]);
// The queue as path -> the operation now standing for it. A path the seed already queued is
// written again under a new operation id, so "what this tap queued" is every path whose
// operation is new.
const queued = page => page.evaluate(() => Object.fromEntries([...FarkadSync._outbox.entries()].map(([path, op]) => [path, op.opId])));
const added = async (page, before) => Object.entries(await queued(page))
    .filter(([path, opId]) => before[path] !== opId).map(([path]) => path).sort();
const dateNow = page => page.evaluate(() => State.date);
const header = async page => bare(await page.evaluate(() => {
    const label = document.querySelector('#dayView .day-header .day-label');
    return label ? label.textContent : null;
}));
const open = page => page.evaluate(() => [...document.querySelectorAll('.modal')]
    .filter(modal => modal.style.display && modal.style.display !== 'none').map(modal => modal.id));
// An element's words, its bidi isolates taken off.
const textOf = async (page, id) => bare(await page.evaluate(id => { const node = document.getElementById(id); return node ? node.textContent : null; }, id));
const undoSays = page => page.evaluate(() => { const bar = document.getElementById('undoBar');
    return bar && bar.style.display !== 'none' && bar.firstChild ? bar.firstChild.textContent : null; });

// ================================================================== nothing open: it follows
suite('nothing open over the day: the day follows the calendar the moment the phone is unlocked');
{
    const { context, page } = await phone();
    given('the phone woke on Tuesday', JSON.stringify(await page.evaluate(() => [State.date, todayStr()])) === JSON.stringify([TUE, TUE]));
    const tuesday = await header(page);
    await lockUntil(page, AFTER);
    same('unlocked at 00:05 the day is Wednesday', await dateNow(page), WED);
    check('and the header says so', (await header(page)) !== tuesday && (await header(page)).includes('11/11/2026'), `${tuesday} -> ${await header(page)}`);
    // The next record is written to the day the screen says: Wednesday.
    await page.locator('#dayView .tray-pending .chip-main', { hasText: 'דוגמה שתיים' }).tap();
    await page.locator('#placePickerList .place-btn', { hasText: 'אתר צפון' }).tap();
    await page.waitForTimeout(100);
    same('a man placed after it is placed on Wednesday', [await sites(page, WED, 'w_02'), await sites(page, TUE, 'w_02')], [['p_01'], []]);
    await context.close();
}
{
    // A past day being fixed is not yanked off it.
    const { context, page } = await phone();
    await page.evaluate(() => { State.date = '2026-11-05'; render(); });
    await lockUntil(page, AFTER);
    same('a day moved to by hand before midnight stays where it was', await dateNow(page), '2026-11-05');
    await context.close();
}

// ================================================================== the assign sheet
suite('the assign sheet walked from the by-worker list: opened at 23:50 on Tuesday, tapped at 00:05');
{
    const { context, page } = await phone();
    await page.locator('.layer-off', { hasText: 'לפי עובדים' }).tap();
    await page.locator('.wrow-main', { hasText: 'דוגמה שתיים' }).first().tap();
    const meta = () => textOf(page, 'assignSheetMeta');
    check('the sheet names Tuesday', (await meta()).endsWith('יום שלישי 10/11'), await meta());
    await lockUntil(page, AFTER);
    given('the page has seen Wednesday come', (await page.evaluate(() => todayStr())) === WED);
    same('the day under the open sheet is still Tuesday', await dateNow(page), TUE);
    check('and the sheet still says so', (await meta()).endsWith('יום שלישי 10/11'), await meta());
    const before = await queued(page);
    await page.locator('#assignSheetBody .sheet-place', { hasText: 'אתר צפון' }).tap();
    await page.waitForTimeout(150);
    same('the site tapped is written to Tuesday, the day the sheet named', await sites(page, TUE, 'w_02'), ['p_01']);
    same('and nothing to Wednesday', await sites(page, WED, 'w_02'), []);
    same('on the disk the same: Tuesday holds him, Wednesday does not', [await onDisk(page, TUE, 'w_02'), await onDisk(page, WED, 'w_02')], ['p_01', null]);
    same('the one path queued is Tuesday\'s', await added(page, before), [`days.${TUE}.actual.w_02`]);
    same('the sheet walked on to the next man of Tuesday', [await textOf(page, 'assignSheetTitle'),
        (await meta()).endsWith('יום שלישי 10/11')], ['דוגמה שלוש', true]);
    // Closing it is the first moment nothing is open: the day follows, in that same turn.
    const turn = await page.evaluate(() => { closeAssignSheet(); return Promise.resolve().then(() => State.date); });
    same('the moment the sheet closes, the day is Wednesday - in the same turn, before a frame is painted', turn, WED);
    check('and the header says Wednesday', (await header(page)).includes('11/11/2026'), await header(page));
    same('the step on ↶ was Tuesday\'s and is not offered over Wednesday', await page.evaluate(() => document.getElementById('undoBtn').disabled), true);
    await context.close();
}

suite('the assign sheet opened from a man\'s row: a rate tapped after midnight');
{
    const { context, page } = await phone([[TUE, 'w_01', 'p_01'], [WED, 'w_01', 'p_01']]);
    await page.locator('#dayView .assign-row .assign-main', { hasText: 'דוגמה אחת' }).first().tap();
    // The sheet takes no finger for DOUBLE_TAP_GUARD_MS after a row opens it (js/ui/sheet.js).
    await page.waitForTimeout(800);
    await lockUntil(page, AFTER);
    same('the day under his sheet is still Tuesday', await dateNow(page), TUE);
    const before = await queued(page);
    await page.locator('#assignSheetBody .sheet-rates button', { hasText: 'יום כפול' }).tap();
    await page.waitForTimeout(150);
    const rate = (date) => page.evaluate(date => (entriesFor(State.schedule, date, 'w_01', 'actual')[0] || {}).rate || 'normal', date);
    same('the double day is Tuesday\'s', [await rate(TUE), await rate(WED)], ['double', 'normal']);
    same('and the one path queued is Tuesday\'s', await added(page, before), [`days.${TUE}.actual.w_01`]);
    await context.close();
}

// ================================================================== «לאן הלך»
suite('«לאן הלך», opened from the tray before midnight and tapped after it');
{
    const { context, page } = await phone();
    await page.locator('#dayView .tray-pending .chip-main', { hasText: 'דוגמה שלוש' }).tap();
    const context1 = () => textOf(page, 'placePickerContext');
    check('it names Tuesday', (await context1()).includes('10/11/2026'), await context1());
    await lockUntil(page, AFTER);
    same('the day under it is still Tuesday, and so is its line', [await dateNow(page), (await context1()).includes('10/11/2026')], [TUE, true]);
    const before = await queued(page);
    await page.locator('#placePickerList .place-btn', { hasText: 'אתר דרום' }).tap();
    await page.waitForTimeout(150);
    same('the site is written to Tuesday', [await sites(page, TUE, 'w_03'), await sites(page, WED, 'w_03')], [['p_02'], []]);
    same('on the disk', [await onDisk(page, TUE, 'w_03'), await onDisk(page, WED, 'w_03')], ['p_02', null]);
    same('one path, Tuesday\'s', await added(page, before), [`days.${TUE}.actual.w_03`]);
    check('it is drawn again for Tuesday', (await context1()).includes('10/11/2026'), await context1());
    await page.locator('#placePickerModal button[onclick="closePlacePicker()"]').tap();
    await page.waitForTimeout(100);
    same('closed: the day follows to Wednesday', await dateNow(page), WED);
    await context.close();
}

// ================================================================== a site's picker
suite('a site\'s picker, opened before midnight and tapped after it');
{
    const { context, page } = await phone();
    await page.locator('#dayView .site-card .site-head-btn').first().tap();
    const line = () => textOf(page, 'workerPickerContext');
    check('it names Tuesday', (await line()).includes('10/11/2026'), await line());
    await lockUntil(page, AFTER);
    same('the day under it is still Tuesday', await dateNow(page), TUE);
    const before = await queued(page);
    await page.locator('#workerPickerList .picker-row[data-worker-id="w_04"] button').tap();
    await page.waitForTimeout(150);
    same('«+ הוסף» writes him to Tuesday', [await sites(page, TUE, 'w_04'), await sites(page, WED, 'w_04')], [['p_01'], []]);
    same('one path, Tuesday\'s', await added(page, before), [`days.${TUE}.actual.w_04`]);
    same('the undo bar names what was done', bare(await undoSays(page)), 'דוגמה ארבע נוסף לאתר צפון');
    await page.locator('#workerPickerModal button[onclick="closeWorkerPicker()"]').tap();
    await page.waitForTimeout(100);
    same('closed: the day follows to Wednesday', await dateNow(page), WED);
    await context.close();
}

// ================================================================== «🧹 רוקן אתר»
suite('«🧹 רוקן אתר»: asked on Tuesday at 23:58, answered on Wednesday morning');
{
    const both = [[TUE, 'w_01', 'p_01'], [TUE, 'w_02', 'p_01'], [WED, 'w_01', 'p_01'], [WED, 'w_02', 'p_01']];
    const { context, page } = await phone(both);
    await page.locator('#dayView .site-card .site-head-btn').first().tap();
    await page.locator('#workerPickerModal button', { hasText: '🧹 רוקן אתר' }).tap();
    await page.waitForTimeout(100);
    const asked = await textOf(page, 'askMessage');
    same('the question counts Tuesday\'s two men', asked, '2 עובדים יוסרו מאתר צפון ביום הזה. שאר הימים לא ייגעו.');
    await lockUntil(page, MORNING);
    same('in the morning the question and the picker are still up, over Tuesday',
        [(await open(page)).slice().sort(), await dateNow(page)], [['askModal', 'workerPickerModal'], TUE]);
    const before = await queued(page);
    await page.locator('#askOk').tap();
    await page.waitForTimeout(150);
    same('«רוקן» empties the site on Tuesday', [await sites(page, TUE, 'w_01'), await sites(page, TUE, 'w_02')], [[], []]);
    same('and Wednesday keeps both men', [await sites(page, WED, 'w_01'), await sites(page, WED, 'w_02')], [['p_01'], ['p_01']]);
    same('on the disk the same', [await onDisk(page, TUE, 'w_01'), await onDisk(page, WED, 'w_01'), await onDisk(page, WED, 'w_02')], ['', 'p_01', 'p_01']);
    same('the paths queued are Tuesday\'s two', await added(page, before), [`days.${TUE}.actual.w_01`, `days.${TUE}.actual.w_02`]);
    same('the undo bar says it', bare(await undoSays(page)), '2 עובדים הוסרו מאתר צפון');
    await page.evaluate(() => runUndo());
    await page.waitForTimeout(100);
    same('and its step puts them back on Tuesday', [await sites(page, TUE, 'w_01'), await sites(page, TUE, 'w_02')], [['p_01'], ['p_01']]);
    await page.locator('#workerPickerModal button[onclick="closeWorkerPicker()"]').tap();
    await page.waitForTimeout(100);
    same('the picker closed, the day follows to Wednesday', await dateNow(page), WED);
    await context.close();
}

suite('«🧹 רוקן אתר»: a man another phone moved, or marked absent, while it was asking keeps his day');
for (const [what, change, keeps] of [
    ['moved to another site', `State.commit(setWorkerDay(State.schedule, '${TUE}', 'w_02', 'actual', { entries: [{ placeId: 'p_02' }] }))`, 'p_02'],
    ['marked absent', `State.commit(markAbsent(State.schedule, '${TUE}', 'w_02', 'actual'))`, 'absent']]) {
    const { context, page } = await phone([[TUE, 'w_01', 'p_01'], [TUE, 'w_02', 'p_01']]);
    await page.locator('#dayView .site-card .site-head-btn').first().tap();
    await page.locator('#workerPickerModal button', { hasText: '🧹 רוקן אתר' }).tap();
    await page.waitForTimeout(100);
    // What another phone's snapshot does to this one's memory, while the question is up.
    await page.evaluate(code => (0, eval)(code), change);
    const before = await queued(page);
    await page.locator('#askOk').tap();
    await page.waitForTimeout(150);
    same(`${what}: the man still on the site is taken off it`, await sites(page, TUE, 'w_01'), []);
    same(`${what}: the other keeps what the other phone gave him`, await onDisk(page, TUE, 'w_02'), keeps);
    same(`${what}: and no path of his is queued by the answer`, await added(page, before), [`days.${TUE}.actual.w_01`]);
    same(`${what}: the undo bar counts the one man taken off`, bare(await undoSays(page)), '1 עובדים הוסרו מאתר צפון');
    await context.close();
}

// ================================================================== «הכל חופש»
suite('«הכל חופש»: asked before midnight, answered after it');
{
    const { context, page } = await phone([[TUE, 'w_01', 'p_01']]);
    await page.locator('#dayView .day-holiday-action').first().tap();
    await page.waitForTimeout(100);
    check('the question names Tuesday', (await textOf(page, 'askTitle')).includes('10/11/2026'), await textOf(page, 'askTitle'));
    await lockUntil(page, AFTER);
    await page.locator('#askOk').tap();
    await page.waitForTimeout(150);
    same('the three men with no record are on holiday on Tuesday', await page.evaluate(day =>
        ['w_02', 'w_03', 'w_04'].map(id => isAbsent(State.schedule, day, id, 'actual')), TUE), [true, true, true]);
    same('and nobody on Wednesday', await page.evaluate(day =>
        ['w_01', 'w_02', 'w_03', 'w_04'].map(id => isAbsent(State.schedule, day, id, 'actual')), WED), [false, false, false, false]);
    same('the question closed, the day follows to Wednesday', await dateNow(page), WED);
    await context.close();
}

// ================================================================== a count being typed
suite('a site\'s count box holding typed digits across midnight');
{
    const { context, page } = await phone([[TUE, 'w_01', 'p_01']]);
    const box = page.locator('#dayView .rima-input[data-place-id="p_01"]');
    await box.tap();
    await page.keyboard.type('3');
    await lockUntil(page, AFTER);
    same('the day under the typed box is still Tuesday, the box still holds the digits', [await dateNow(page), await box.inputValue()], [TUE, '3']);
    // Left: saved on the day the box was drawn for.
    await page.locator('#dayView .tray h4').first().tap();
    await page.waitForTimeout(150);
    same('left, the count is Tuesday\'s', await page.evaluate(([tue, wed]) => [rimaCount(State.schedule, tue, 'p_01'), rimaCount(State.schedule, wed, 'p_01')], [TUE, WED]), [3, 0]);
    same('and the day is not moved under the finger that left it', await dateNow(page), TUE);
    // The follow owed is made the next time the phone comes back.
    await lockUntil(page, LATER);
    same('the next time the phone is unlocked the day follows to Wednesday', await dateNow(page), WED);
    await context.close();
}

suite('nothing broke on the way');
same('no page error on any phone', errors.join(' | '), '');

await browser.close();
await server.close();
report();
