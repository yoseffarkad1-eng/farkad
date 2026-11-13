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
// The second review of the hotfix added three things. The sheet's «שעות נוספות» box shut after
// midnight with the focus still in it, by every road a sheet is shut: the hours are Tuesday's.
// Every writer on the day screen and in its surfaces, with State.date moved to Wednesday under
// it by hand and nothing drawn again: the write lands on the day the surface showed - by
// construction, not by the order of events. And the box that held the follow at the unlock,
// LEFT - by a tap, by the day's tab, by Tab, by a page switch that takes no focus: the follow is
// made then, after the tap that left it and never under it (the tap's click lands on what it
// was aimed at, a mouse held down holds the day), and the morning's first record lands on today.
//
// The third review of the hotfix found the follow's hold and its leaving still wrong. A box only
// tapped held the day like a box typed into, and the morning's first tap wrote Tuesday and then
// lost its step on ↶ to the follow that came after it; the tap that left a typed box landed on
// Tuesday's surface the same way (the click it lets through came before the follow); and the
// follow made at the first box's leaving drew the day again under the next box he had tapped or
// tabbed into, and the digits he typed there went nowhere. Measured here: a box only tapped holds
// nothing; the tap that leaves a typed box is spent on leaving it, by a finger, a mouse, and an
// iPhone's tap that moves no focus; and the typing goes with the focus from box to box.
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
// A picker a tap opens takes no finger on its writers for DOUBLE_TAP_GUARD_MS, and the sheet a
// tap opens to walk takes none for its bounce (js/ui/sheet.js: the review of the hotfix, R2 and
// R3, and its second review), so every opening by a tap below waits the longer of the two out
// before the surface is touched.
const OPENED = 800;
const tapOpen = async (locator) => { await locator.tap(); await locator.page().waitForTimeout(OPENED); };

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
    await tapOpen(page.locator('#dayView .tray-pending .chip-main', { hasText: 'דוגמה שתיים' }));
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
    await tapOpen(page.locator('.wrow-main', { hasText: 'דוגמה שתיים' }).first());
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
    await tapOpen(page.locator('#dayView .tray-pending .chip-main', { hasText: 'דוגמה שלוש' }));
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
    await tapOpen(page.locator('#dayView .site-card .site-head-btn').first());
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
    await tapOpen(page.locator('#dayView .site-card .site-head-btn').first());
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
    await tapOpen(page.locator('#dayView .site-card .site-head-btn').first());
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
    // MOVED (round two of the owner's «הכל חופש», 2026-11-11): the question is reached through
    // the day's menu, «עוד ⋯» at the foot of the day; the menu hands straight on to it, the
    // dialog never shut between the two, so the day cannot follow the calendar in the gap.
    await page.locator('#dayView .day-more-action').first().tap();
    await page.waitForTimeout(100);
    check('the menu names Tuesday', (await textOf(page, 'askTitle')).includes('10/11/2026'), await textOf(page, 'askTitle'));
    await page.waitForFunction(() => { const first = document.querySelector('#askChoices button'); return Boolean(first) && !first.disabled; });
    await page.locator('#askChoices button').first().tap();
    await page.waitForTimeout(100);
    check('the question names Tuesday', (await textOf(page, 'askTitle')).includes('10/11/2026'), await textOf(page, 'askTitle'));
    await page.waitForFunction(() => !document.getElementById('askOk').disabled);
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
    // MOVED ON PURPOSE (the second review of the hotfix): the follow is made when the box is
    // left, once the tap that left it is over - it used to stay owed until the next unlock, and
    // the morning's first record landed on yesterday. The digits are the box's day's (above).
    same('and once the tap that left it is over, the day follows the calendar to Wednesday', await dateNow(page), WED);
    check('the header with it', (await header(page)).includes('11/11/2026'), await header(page));
    await lockUntil(page, LATER);
    same('and the next unlock leaves it there', await dateNow(page), WED);
    await context.close();
}

// ================================================================== the morning follows the calendar
// The second review of the hotfix (MAJOR, on v190 too): a box that held the follow at the unlock
// kept it owed after he LEFT the box - nothing made the follow at the box's blur - so the first
// record of the morning went to yesterday, in a «לאן הלך» that named it, and the follow its close
// then made took the step back off ↶. Now the follow is made when the box is left (its `change`,
// or its focusout, or the page it was on being left) and nothing else holds it - after the tap
// that left it, never under it (js/app.js). Probe-held's two roads, as the verifier ran them.
suite('a box that held the follow, left: the morning\'s first record lands on today');
{
    // A: a site's count typed at 23:50, the phone unlocked at 07:10, the box left by a tap on the
    // tray's heading, the first man of the morning placed through «לאן הלך».
    const { context, page } = await phone([[TUE, 'w_01', 'p_01']]);
    await page.locator('#dayView .rima-input[data-place-id="p_01"]').tap();
    await page.keyboard.type('3');
    await lockUntil(page, MORNING);
    given('A: unlocked with the typed box on the glass, the follow is held', (await dateNow(page)) === TUE);
    await page.locator('#dayView .tray h4').first().tap();
    await page.waitForTimeout(200);
    same('A: the box left, the day is Wednesday', await dateNow(page), WED);
    check('A: and the header says so', (await header(page)).includes('11/11/2026'), await header(page));
    same('A: the digits typed are Tuesday\'s, the day the box was drawn for - kept, not thrown away',
        await page.evaluate(([tue, wed]) => [rimaCount(State.schedule, tue, 'p_01'), rimaCount(State.schedule, wed, 'p_01')], [TUE, WED]), [3, 0]);
    const before = await queued(page);
    await tapOpen(page.locator('#dayView .tray-pending .chip-main', { hasText: 'דוגמה שתיים' }));
    check('A: «לאן הלך» names Wednesday', (await textOf(page, 'placePickerContext')).includes('11/11/2026'), await textOf(page, 'placePickerContext'));
    await page.locator('#placePickerList .place-btn', { hasText: 'אתר צפון' }).tap();
    await page.waitForTimeout(200);
    same('A: the morning\'s first record lands on Wednesday', [await sites(page, WED, 'w_02'), await sites(page, TUE, 'w_02')], [['p_01'], []]);
    same('A: on the disk the same', [await onDisk(page, WED, 'w_02'), await onDisk(page, TUE, 'w_02')], ['p_01', null]);
    same('A: queued as Wednesday\'s', await added(page, before), [`days.${WED}.actual.w_02`]);
    same('A: with its step on ↶', bare(await undoSays(page)), 'דוגמה שתיים נרשם באתר צפון');
    await page.locator('#placePickerModal button[onclick="closePlacePicker()"]').tap();
    await page.waitForTimeout(150);
    same('A: the picker closed, the day and the step stay', [await dateNow(page),
        await page.evaluate(() => document.getElementById('undoBtn').disabled)], [WED, false]);
    await context.close();
}
{
    // B: the advances page's search box typed into, the phone unlocked on it in the morning, the
    // day tab tapped, the first man placed.
    const { context, page } = await phone();
    await page.locator('#tab-advances').tap();
    await page.waitForTimeout(100);
    const search = page.locator('#advancesView input[type=search]').first();
    await search.tap();
    await search.fill('דוג');
    await lockUntil(page, MORNING);
    given('B: unlocked with the typed search box on the glass, the follow is held', (await dateNow(page)) === TUE);
    await page.locator('#tab-day').tap();
    await page.waitForTimeout(200);
    same('B: the page left by the day\'s tab, the day screen is on Wednesday', await dateNow(page), WED);
    check('B: and its header says so', (await header(page)).includes('11/11/2026'), await header(page));
    await tapOpen(page.locator('#dayView .tray-pending .chip-main', { hasText: 'דוגמה שתיים' }));
    await page.locator('#placePickerList .place-btn', { hasText: 'אתר צפון' }).tap();
    await page.waitForTimeout(200);
    same('B: the morning\'s first record lands on Wednesday', [await sites(page, WED, 'w_02'), await sites(page, TUE, 'w_02')], [['p_01'], []]);
    same('B: on the disk the same', [await onDisk(page, WED, 'w_02'), await onDisk(page, TUE, 'w_02')], ['p_01', null]);
    await context.close();
}
{
    // C: the same search box, and the page's own «סידור» tapped instead of the day's tab. The
    // follow is made at that tap, and on a page that is not the day the tap lands first on what it
    // was aimed at, with the page as it was drawn: the third review's ordering drew the page again
    // under the click, and the button's own handler ran on a button already gone from the page.
    const { context, page } = await phone();
    await page.locator('#tab-advances').tap();
    await page.waitForTimeout(100);
    const search = page.locator('#advancesView input[type=search]').first();
    await search.tap();
    await search.fill('דוג');
    await lockUntil(page, MORNING);
    given('C: unlocked with the typed search box on the glass, the follow is held', (await dateNow(page)) === TUE);
    await page.evaluate(() => {
        window.__reachedOn = [];
        document.addEventListener('click', event => {
            const node = event.target && event.target.closest && event.target.closest('button');
            if (node) window.__reachedOn.push([node.textContent.includes('סידור'), node.isConnected]);
        }, true);
    });
    await page.locator('#advancesView button', { hasText: 'סידור' }).first().tap();
    await page.waitForTimeout(200);
    same('C: the tap reached «סידור» while it was still on the page', await page.evaluate(() => window.__reachedOn), [[true, true]]);
    same('C: and did what it does - the order is open for him to sort', await page.evaluate(() =>
        document.querySelectorAll('#advancesView .advance-order-row').length > 0), true);
    same('C: the day behind the page followed to Wednesday', await dateNow(page), WED);
    await context.close();
}
{
    // The page switched by code with the focus left where it was - an iPhone's tab takes no
    // focus - after the unlock: the switch is the moment the box was left.
    const { context, page } = await phone();
    await page.locator('#tab-advances').tap();
    await page.waitForTimeout(100);
    const search = page.locator('#advancesView input[type=search]').first();
    await search.tap();
    await search.fill('דוג');
    await lockUntil(page, MORNING);
    given('the search box holds the follow on the glass', (await dateNow(page)) === TUE);
    const seen = await page.evaluate(() => { const typed = document.activeElement; showView('day');
        return { focused: document.activeElement === typed, date: State.date }; });
    await page.waitForTimeout(100);
    same('switched to the day with the box still the focused element, the day follows in the turn after',
        [seen.focused, seen.date, await dateNow(page)], [true, TUE, WED]);
    await context.close();
}

// THE TAP THAT LEAVES A TYPED BOX IS SPENT ON LEAVING IT (the third review of the hotfix, BLOCKER).
// Round two made the follow after the tap that left the box, and let the tap's click land first on
// what it was aimed at - Tuesday's surface: a writer wrote Tuesday, a picker opened naming Tuesday
// and its pick was written there, and the follow that came after took the step off ↶ with the
// screen (leave-by-writer; an iPhone's tap, which moves no focus, wrote Tuesday and lost the
// digits typed as well). Now the follow is made at the tap's click, and a click on the day screen
// is spent on it: nothing under it acts. The man tapped is waiting on Tuesday only - on Wednesday
// he has a record, and his chip is not in that tray - so a click that reached his chip would show.
// Four ways to leave: a finger, a mouse held down a moment, a finger on a box typed into and left
// holding its stored count (nothing commits, nothing redraws, so the click itself does come and
// is spent by the app, not lost by the browser), and an iPhone's tap that moves no focus.
// A tap as an iPhone makes it on a button: its press, its release and its click, the focus left
// where it was (a dispatched press moves no focus).
const tapWithoutFocus = (page, find) => page.evaluate(code => {
    const target = (0, eval)(code)();
    const touch = { bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true };
    target.dispatchEvent(new PointerEvent('pointerdown', touch));
    target.dispatchEvent(new PointerEvent('pointerup', touch));
    for (const type of ['mousedown', 'mouseup', 'click']) target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, detail: 1 }));
}, find);
const rimaBoth = page => page.evaluate(([tue, wed]) => [rimaCount(State.schedule, tue, 'p_01'), rimaCount(State.schedule, wed, 'p_01')], [TUE, WED]);
suite('the tap that leaves a typed box is spent on leaving it: nothing under it acts on Tuesday, and the day follows');
for (const how of ['a finger', 'a mouse held down a moment', 'a finger, the box typed back to its stored count', 'an iPhone\'s tap, which moves no focus']) {
    const { context, page } = await phone([[TUE, 'w_01', 'p_01'], [WED, 'w_01', 'p_01'], [WED, 'w_03', 'p_02']]);
    const unchanged = how.includes('stored count');
    if (unchanged) await page.evaluate(tue => { State.commit(setRimaCount(State.schedule, tue, 'p_01', 2)); hideUndo(); render(); }, TUE);
    await page.locator('#dayView .rima-input[data-place-id="p_01"]').tap();
    // Typed over with the very count it held: a keystroke, and nothing for its `change` to commit.
    if (unchanged) await page.locator('#dayView .rima-input[data-place-id="p_01"]').fill('2');
    else await page.keyboard.type('3');
    const typed = unchanged ? 2 : 3;
    await lockUntil(page, MORNING);
    given(`${how}: the typed box holds the follow`, JSON.stringify(await page.evaluate(() =>
        [State.date, document.activeElement.className.includes('rima-input'), document.activeElement.value])) === JSON.stringify([TUE, true, String(typed)]));
    const before = await queued(page);
    await page.evaluate(() => {
        window.__reached = [];
        document.addEventListener('click', event => {
            const node = event.target && event.target.closest && event.target.closest('button');
            if (node) window.__reached.push(node.textContent.trim());
        });
    });
    const chip = page.locator('#dayView .tray-pending .chip-main', { hasText: 'דוגמה שלוש' });
    if (how === 'a mouse held down a moment') {
        const box = await chip.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(300);
        same(`${how}: while the button is held the day is not moved`, await dateNow(page), TUE);
        await page.mouse.up();
    } else if (how.startsWith('an iPhone')) {
        await tapWithoutFocus(page, "() => [...document.querySelectorAll('#dayView .tray-pending .chip-main')].find(node => node.textContent === 'דוגמה שלוש')");
    } else {
        await chip.tap();
    }
    await page.waitForTimeout(OPENED);
    same(`${how}: the day follows to Wednesday`, await dateNow(page), WED);
    check(`${how}: and the header says so`, (await header(page)).includes('11/11/2026'), await header(page));
    same(`${how}: the tap reached nothing on the day screen - no handler, no dialog`, [await page.evaluate(() => window.__reached), await open(page)], [[], []]);
    same(`${how}: the digits typed are Tuesday's, the day the box was drawn for`, await rimaBoth(page), [typed, 0]);
    same(`${how}: and nothing else was written: he is as he was on both days`, [await sites(page, TUE, 'w_03'), await sites(page, WED, 'w_03')], [[], ['p_02']]);
    same(`${how}: the only path queued is the count's`, await added(page, before), unchanged ? [] : [`days.${TUE}.rima.p_01`]);
    // A build that let the click through left a dialog open over the day (round two's «לאן הלך»
    // naming Tuesday): shut, so that the run goes on to say what came next.
    if ((await open(page)).length) { await page.evaluate(() => closePlacePicker()); await page.waitForTimeout(150); }
    // The next tap is on the day the screen says.
    await tapOpen(page.locator('#dayView .tray-pending .chip-main', { hasText: 'דוגמה שתיים' }));
    check(`${how}: the next tap opens «לאן הלך» on Wednesday`, (await textOf(page, 'placePickerContext')).includes('11/11/2026'), await textOf(page, 'placePickerContext'));
    await page.locator('#placePickerList .place-btn', { hasText: 'אתר צפון' }).tap();
    await page.waitForTimeout(150);
    same(`${how}: and what it picks is Wednesday's, with its step on ↶`, [await sites(page, WED, 'w_02'), await sites(page, TUE, 'w_02'), bare(await undoSays(page))],
        [['p_01'], [], 'דוגמה שתיים נרשם באתר צפון']);
    await context.close();
}

// A BOX ONLY TAPPED HOLDS NOTHING (the third review of the hotfix, BLOCKER, leave-by-writer with a
// stored count). A site's count box holding a count stored earlier, tapped at 23:50 and never typed
// into, held the follow at the unlock - the screen stayed on Tuesday, the morning's first tap wrote
// Tuesday, and the follow that came after it jumped to Wednesday with the step off ↶: every writer
// of the day screen did it. Nothing typed is nothing a redraw can lose: the day follows at the
// unlock, and the first tap of the morning writes today, with its step on ↶.
const LEAVERS = [
    { what: 'the usual site\'s chip', act: page => page.locator('#dayView .tray-pending .chip', { hasText: 'דוגמה שתיים' }).locator('.chip-usual').tap(),
        man: 'w_02', wed: 'p_02', step: 'דוגמה שתיים נרשם באתר דרום' },
    { what: '«נעדר»', act: page => page.locator('#dayView .tray-pending .chip', { hasText: 'דוגמה שתיים' }).locator('.chip-side').tap(),
        man: 'w_02', wed: 'absent', step: 'דוגמה שתיים נרשם כנעדר' },
    { what: 'a man\'s ✕ on a site', act: page => page.locator('#dayView .site-card .assign-row', { hasText: 'דוגמה שלוש' }).locator('.btn-icon').tap(),
        man: 'w_03', wed: '', tue: 'p_01', step: 'דוגמה שלוש הוסר מאתר צפון' },
    { what: 'his name, then a site in «לאן הלך»', act: async page => {
        await tapOpen(page.locator('#dayView .tray-pending .chip-main', { hasText: 'דוגמה שתיים' }));
        await page.locator('#placePickerList .place-btn', { hasText: 'אתר צפון' }).tap(); },
        man: 'w_02', wed: 'p_01', step: 'דוגמה שתיים נרשם באתר צפון', named: 'placePickerContext' },
    { what: 'a site\'s «+», then «+ הוסף»', act: async page => {
        await tapOpen(page.locator('#dayView .site-card .site-head-btn').first());
        await page.locator('#workerPickerList .picker-row[data-worker-id="w_02"] button').tap(); },
        man: 'w_02', wed: 'p_01', step: 'דוגמה שתיים נוסף לאתר צפון', named: 'workerPickerContext' },
    { what: 'the tally, then a tile', act: async page => {
        await tapOpen(page.locator('#dayView .now-count'));
        await page.locator('#assignSheetBody .sheet-place', { hasText: 'אתר צפון' }).tap(); },
        man: 'w_02', wed: 'p_01', step: 'דוגמה שתיים נרשם באתר צפון', named: 'assignSheetMeta' }
];
suite('a count box only tapped, never typed into, holds no day: the morning follows at the unlock, and its first tap writes today');
for (const leaver of LEAVERS) {
    const history = ['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-08', '2026-11-09'].map(date => [date, 'w_02', 'p_02']);
    const { context, page } = await phone([...history, [TUE, 'w_01', 'p_01'], [TUE, 'w_03', 'p_01'], [WED, 'w_01', 'p_01'], [WED, 'w_03', 'p_01']]);
    await page.evaluate(tue => { State.commit(setRimaCount(State.schedule, tue, 'p_01', 2)); hideUndo(); render(); }, TUE);
    await page.locator('#dayView .rima-input[data-place-id="p_01"]').tap();
    given(`${leaver.what}: the stored count's box has the focus, nothing typed`, JSON.stringify(await page.evaluate(() =>
        [document.activeElement.className.includes('rima-input'), document.activeElement.value])) === JSON.stringify([true, '2']));
    await lockUntil(page, MORNING);
    same(`${leaver.what}: unlocked, the day is Wednesday at once`, await dateNow(page), WED);
    check(`${leaver.what}: and the header says so`, (await header(page)).includes('11/11/2026'), await header(page));
    const before = await queued(page);
    await leaver.act(page);
    await page.waitForTimeout(200);
    if (leaver.named) check(`${leaver.what}: the surface it opened named Wednesday`,
        /11\/11|יום רביעי/.test(await textOf(page, leaver.named)), await textOf(page, leaver.named));
    const read = date => page.evaluate(([date, id]) => {
        const record = workerDay(State.schedule, date, id, 'actual');
        if (!record) return null;
        return record.absent ? 'absent' : (record.entries || []).map(entry => entry.placeId).join('+');
    }, [date, leaver.man]);
    same(`${leaver.what}: the morning's first tap wrote Wednesday`, await read(WED), leaver.wed);
    same(`${leaver.what}: and Tuesday is as it was`, await read(TUE), leaver.tue || null);
    same(`${leaver.what}: queued as Wednesday's`, await added(page, before), [`days.${WED}.actual.${leaver.man}`]);
    same(`${leaver.what}: with its step on ↶`, [bare(await undoSays(page)), await page.evaluate(() => document.getElementById('undoBtn').disabled)], [leaver.step, false]);
    same(`${leaver.what}: and the stored count is Tuesday's still`, await rimaBoth(page), [2, 0]);
    await context.close();
}

// FROM ONE TYPED BOX STRAIGHT INTO THE NEXT (the third review of the hotfix, MAJOR, box-to-box).
// Round two made the follow once the first box was left, and drew the day again under the box he
// had just tapped or tabbed into to type the next count: the focus fell to the page, the keyboard
// would close, and the digits he typed next went nowhere - recorded on neither day. On v190 the
// day stayed under him. Now the typing goes with the focus from box to box, the day stays, every
// count lands on the day the boxes were drawn for, and the day follows once he leaves the boxes.
// The third road is an iPhone's: the words of the next site's count tapped (a site's count is one
// <label>), the tap moving no focus by itself and the label's own click giving the box the focus.
suite('from one typed box straight into the next: the day stays under him, every count is Tuesday\'s, and leaving the boxes follows');
for (const how of ['a tap on the next site\'s רימא box', 'Tab, to the same site\'s יוסף גבס box', 'an iPhone\'s tap on the words of the next site\'s רימא']) {
    const { context, page } = await phone([[TUE, 'w_01', 'p_01'], [TUE, 'w_02', 'p_02']]);
    await page.locator('#dayView .rima-input[data-place-id="p_01"]').tap();
    await page.keyboard.type('3');
    await lockUntil(page, MORNING);
    given(`${how}: the typed box holds the follow`, (await dateNow(page)) === TUE);
    const tab = how.startsWith('Tab');
    const next = tab ? ['yosefgeves', 'p_01'] : ['rima', 'p_02'];
    if (tab) await page.keyboard.press('Tab');
    else if (how.startsWith('an iPhone')) await tapWithoutFocus(page, "() => document.querySelector('#dayView [data-anchor=\"rima:p_02\"] .rima-label')");
    else await page.locator('#dayView .rima-input[data-place-id="p_02"]').tap();
    await page.waitForTimeout(300);
    same(`${how}: the day is still Tuesday, and the box he went to has the focus`, [await dateNow(page), await page.evaluate(() =>
        [document.activeElement.dataset.count, document.activeElement.dataset.placeId, document.activeElement.isConnected])],
        [TUE, [next[0], next[1], true]]);
    await page.keyboard.type('4');
    await page.waitForTimeout(100);
    same(`${how}: what he types next goes into it`, await page.evaluate(() => document.activeElement.value), '4');
    await page.locator('#dayView .tray h4').first().tap();
    await page.waitForTimeout(OPENED);
    const counts = await page.evaluate(([tue, wed, next]) => {
        const read = next[0] === 'rima' ? rimaCount : yosefGevesCount;
        return { first: [rimaCount(State.schedule, tue, 'p_01'), rimaCount(State.schedule, wed, 'p_01')],
            second: [read(State.schedule, tue, next[1]), read(State.schedule, wed, next[1])] };
    }, [TUE, WED, next]);
    same(`${how}: both counts are Tuesday's and Wednesday has none`, counts, { first: [3, 0], second: [4, 0] });
    same(`${how}: the boxes left, the day follows to Wednesday`, await dateNow(page), WED);
    await context.close();
}
{
    // With no tap under way - the keyboard's own key lets go of the box - the follow is made in
    // the turn after.
    const { context, page } = await phone([[TUE, 'w_01', 'p_01']]);
    await page.locator('#dayView .rima-input[data-place-id="p_01"]').tap();
    await page.keyboard.type('5');
    await lockUntil(page, MORNING);
    given('the typed box holds the follow', (await dateNow(page)) === TUE);
    await page.evaluate(() => document.activeElement.blur());
    await page.waitForTimeout(150);
    same('let go of by the keyboard, the count is Tuesday\'s and the day follows to Wednesday',
        [await page.evaluate(tue => rimaCount(State.schedule, tue, 'p_01'), TUE), await dateNow(page)], [5, WED]);
    await context.close();
}

// ================================================================== the sheet's hours box
// The second review of the hotfix (c1, still open): the sheet's «שעות נוספות» box commits on
// `change`, which fires when the box is LEFT - and shut after midnight with the box still
// holding the focus (Escape, a «סגור» that takes no focus as an iPhone's tap is, the backdrop),
// the follow moved State.date in the close's own turn and the box was left after it: the hours
// typed on Tuesday were taken off Tuesday and written onto Wednesday, over Wednesday's regular
// day, and queued. On c33461b and on round one all three wrote Wednesday.
suite('the sheet\'s «שעות נוספות» box, typed into before midnight and shut after it with the focus still in it');
for (const [how, shut, wedToo] of [
    ['«סגור» taking no focus', () => "[...document.querySelectorAll('#assignSheet button')].find(node => node.textContent.trim() === 'סגור').click()", true],
    ['the backdrop', () => "(() => { const m = document.getElementById('assignSheet'); for (const t of ['mousedown', 'mouseup', 'click']) m.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, detail: 1 })); })()", true],
    ['Escape', null, true],
    // c1-hours.mjs: with no record on Wednesday, the same steps wrote Wednesday an empty day.
    ['«סגור» taking no focus, nothing on Wednesday', () => "[...document.querySelectorAll('#assignSheet button')].find(node => node.textContent.trim() === 'סגור').click()", false],
    ['Escape, nothing on Wednesday', null, false]]) {
    const { context, page } = await phone(wedToo ? [[TUE, 'w_01', 'p_01'], [WED, 'w_01', 'p_01']] : [[TUE, 'w_01', 'p_01']]);
    await page.evaluate(() => { State.schedule.workers[0].hourlyRate = 50; State.commitRoster(); hideUndo(); });
    await tapOpen(page.locator('#dayView .site-card .assign-main', { hasText: 'דוגמה אחת' }).first());
    await page.locator('#assignSheet .sheet-rate-row button', { hasText: 'שעות נוספות' }).first().tap();
    await page.waitForTimeout(200);
    await page.locator('#assignSheet input.rate-hours').focus();
    await page.keyboard.type('3');
    const before = await queued(page);
    await lockUntil(page, AFTER);
    given(`${how}: the box still holds the focus and the 3, over Tuesday`, JSON.stringify(await page.evaluate(() =>
        [document.activeElement.className, document.activeElement.value, State.date])) === JSON.stringify(['rate-hours', '3', TUE]));
    if (shut) await page.evaluate(code => (0, eval)(code), shut());
    else await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const record = date => page.evaluate(([date]) => JSON.stringify((((JSON.parse(localStorage.getItem('scheduleData:v2') || '{}').days || {})[date] || {}).actual || {}).w_01 || null), [date]);
    const hours = date => page.evaluate(date => entriesFor(State.schedule, date, 'w_01', 'actual').map(e => [e.rate || 'normal', e.extraHours || 0]), date);
    same(`${how}: the 3 hours are Tuesday's, in memory`, await hours(TUE), [['extra', 3]]);
    if (wedToo) {
        same(`${how}: and Wednesday's regular day is untouched`, await hours(WED), [['normal', 0]]);
        check(`${how}: on the disk the same`, /"extraHours":3/.test(await record(TUE)) && !/extra/.test(await record(WED)), `${await record(TUE)} / ${await record(WED)}`);
    } else {
        same(`${how}: and Wednesday has no record of him at all, in memory or on the disk`,
            [await page.evaluate(wed => workerDay(State.schedule, wed, 'w_01', 'actual'), WED), await record(WED)], [null, 'null']);
        check(`${how}: Tuesday's on the disk`, /"extraHours":3/.test(await record(TUE)), await record(TUE));
    }
    same(`${how}: the paths queued are Tuesday's alone`, await added(page, before), [`days.${TUE}.actual.w_01`]);
    same(`${how}: the sheet shut, the day follows to Wednesday`, [await dateNow(page), await open(page)], [WED, []]);
    same(`${how}: and no step on ↶ is offered over Wednesday for Tuesday's hours`, [await undoSays(page),
        await page.evaluate(() => document.getElementById('undoBtn').disabled)], [null, true]);
    await context.close();
}

// The finder (the second review's midnight variations): his day's door, drawn before midnight
// and taken after it, opens his sheet on the day the finder named, and the site picked there is
// that day's. The search box he typed into is left inside a dialog, which holds the follow.
suite('«חיפוש עובד»: his day\'s door, opened before midnight and taken after it');
{
    const { context, page } = await phone();
    await page.locator('#findEntry').tap();
    await page.waitForTimeout(200);
    await page.keyboard.type('שתיים');
    await page.waitForTimeout(150);
    const door = page.locator('#findList .find-row[data-worker-id="w_02"] .find-door-sheet');
    const words = bare(await door.textContent());
    await lockUntil(page, AFTER);
    same('unlocked with the finder open, the day under it is still Tuesday', await dateNow(page), TUE);
    const before = await queued(page);
    await door.tap();
    await page.waitForTimeout(OPENED);
    same(`«${words}» opens his sheet, naming Tuesday`, [await open(page), await textOf(page, 'assignSheetTitle'),
        (await textOf(page, 'assignSheetMeta')).endsWith('יום שלישי 10/11')], [['assignSheet'], 'דוגמה שתיים', true]);
    same('and the sheet holds the day', await dateNow(page), TUE);
    await page.locator('#assignSheetBody .sheet-place', { hasText: 'אתר צפון' }).tap();
    await page.waitForTimeout(150);
    same('the site picked there is Tuesday\'s', [await sites(page, TUE, 'w_02'), await sites(page, WED, 'w_02')], [['p_01'], []]);
    same('one path, Tuesday\'s', await added(page, before), [`days.${TUE}.actual.w_02`]);
    await page.locator('#assignSheetFoot .sheet-actions button', { hasText: 'סגור' }).tap();
    await page.waitForTimeout(150);
    same('closed, the day follows to Wednesday', await dateNow(page), WED);
    await context.close();
}

// ================================================================== the day a surface named
// A WRITE LANDS ON THE DAY ITS SURFACE NAMED - BY CONSTRUCTION, NOT BY TIMING (the second review
// of the hotfix). Each surface reads its day when it is drawn - the sheet and the two pickers
// when they open, the day screen at every render - and every write it makes goes there,
// never to State.date as it stands at the tap. Here State.date is moved to Wednesday under each
// surface by hand, with nothing drawn again - whatever the follow, or anything else, might do -
// and the tap made on the surface as it stands. The write must land on the day it showed, and
// Wednesday must be untouched. On c33461b and on round one every writer below but the two count
// boxes (which v166 already drew with their day) wrote Wednesday.
const moveDayUnder = page => page.evaluate(wed => { State.date = wed; }, WED);
const surfaceCases = [
    { what: 'the walking sheet: a site', seed: [],
        open: async page => { await page.locator('.layer-off', { hasText: 'לפי עובדים' }).tap(); await tapOpen(page.locator('.wrow-main', { hasText: 'דוגמה שתיים' }).first()); },
        act: page => page.locator('#assignSheetBody .sheet-place', { hasText: 'אתר צפון' }).tap(),
        expect: [['w_02', 'p_01']],
        after: async page => same('the walking sheet: it walked on to Tuesday\'s next man, and still names Tuesday',
            [await textOf(page, 'assignSheetTitle'), (await textOf(page, 'assignSheetMeta')).endsWith('יום שלישי 10/11')], ['דוגמה שלוש', true]) },
    { what: 'the walking sheet: «נעדר»', seed: [],
        open: async page => { await page.locator('.layer-off', { hasText: 'לפי עובדים' }).tap(); await tapOpen(page.locator('.wrow-main', { hasText: 'דוגמה שתיים' }).first()); },
        act: page => page.locator('#assignSheetFoot .sheet-actions button', { hasText: 'נעדר' }).first().tap(),
        expect: [['w_02', 'absent']] },
    { what: 'the walking sheet: «דלג» walks to Tuesday\'s next man, not Wednesday\'s', seed: [[WED, 'w_03', 'p_01']],
        open: async page => { await page.locator('.layer-off', { hasText: 'לפי עובדים' }).tap(); await tapOpen(page.locator('.wrow-main', { hasText: 'דוגמה שתיים' }).first()); },
        act: page => page.locator('#assignSheetFoot .sheet-fwd').first().tap(),
        expect: [],
        after: async page => same('the walking sheet: «דלג» from the second man is the third of TUESDAY, who is recorded only on Wednesday',
            await textOf(page, 'assignSheetTitle'), 'דוגמה שלוש') },
    { what: 'a man\'s sheet: a rate', seed: [[TUE, 'w_01', 'p_01'], [WED, 'w_01', 'p_01']],
        open: page => tapOpen(page.locator('#dayView .site-card .assign-main', { hasText: 'דוגמה אחת' }).first()),
        act: page => page.locator('#assignSheetBody .sheet-rates button', { hasText: 'יום כפול' }).tap(),
        expect: [['w_01', 'p_01:double']], wed: [['w_01', 'p_01']] },
    { what: 'a man\'s sheet: the hours box', seed: [[TUE, 'w_01', 'p_01'], [WED, 'w_01', 'p_01']],
        open: async page => {
            await tapOpen(page.locator('#dayView .site-card .assign-main', { hasText: 'דוגמה אחת' }).first());
            await page.locator('#assignSheet .sheet-rate-row button', { hasText: 'שעות נוספות' }).first().tap();
            await page.waitForTimeout(200);
            await page.locator('#assignSheet input.rate-hours').focus();
            await page.keyboard.type('4');
        },
        act: page => page.evaluate(() => document.activeElement.blur()),
        expect: [['w_01', 'p_01:extra:4']], wed: [['w_01', 'p_01']] },
    { what: '«לאן הלך»: a site', seed: [],
        open: page => tapOpen(page.locator('#dayView .tray-pending .chip-main', { hasText: 'דוגמה שלוש' })),
        act: page => page.locator('#placePickerList .place-btn', { hasText: 'אתר דרום' }).tap(),
        expect: [['w_03', 'p_02']],
        after: async page => check('«לאן הלך»: drawn again after the pick, it still names Tuesday', (await textOf(page, 'placePickerContext')).includes('10/11/2026'), await textOf(page, 'placePickerContext')) },
    { what: 'a site\'s picker: «+ הוסף»', seed: [],
        open: page => tapOpen(page.locator('#dayView .site-card .site-head-btn').first()),
        act: page => page.locator('#workerPickerList .picker-row[data-worker-id="w_04"] button').tap(),
        expect: [['w_04', 'p_01']],
        after: async page => check('a site\'s picker: drawn again, it still names Tuesday', (await textOf(page, 'workerPickerContext')).includes('10/11/2026'), await textOf(page, 'workerPickerContext')) },
    { what: 'a site\'s picker: «✓ נמצא»', seed: [[TUE, 'w_01', 'p_01'], [WED, 'w_01', 'p_01']],
        open: page => tapOpen(page.locator('#dayView .site-card .site-head-btn').first()),
        act: page => page.locator('#workerPickerList .picker-row[data-worker-id="w_01"] button').tap(),
        expect: [['w_01', '']], wed: [['w_01', 'p_01']] },
    { what: '«🧹 רוקן אתר»', seed: [[TUE, 'w_01', 'p_01'], [TUE, 'w_02', 'p_01'], [WED, 'w_01', 'p_01'], [WED, 'w_02', 'p_01']],
        open: page => tapOpen(page.locator('#dayView .site-card .site-head-btn').first()),
        act: async page => { await page.locator('#workerPickerModal button', { hasText: '🧹 רוקן אתר' }).tap(); await page.waitForTimeout(100); await page.locator('#askOk').tap(); },
        expect: [['w_01', ''], ['w_02', '']], wed: [['w_01', 'p_01'], ['w_02', 'p_01']] },
    { what: 'the tray: «נעדר»', seed: [],
        open: async () => {},
        act: page => page.locator('#dayView .tray-pending .chip', { hasText: 'דוגמה שתיים' }).locator('.chip-side').tap(),
        expect: [['w_02', 'absent']] },
    { what: 'the tray: the usual site\'s chip', seed: [['2026-11-08', 'w_01', 'p_02'], ['2026-11-09', 'w_01', 'p_02']],
        open: async () => {},
        act: page => page.locator('#dayView .tray-pending .chip-usual').first().tap(),
        expect: [['w_01', 'p_02']] },
    { what: '«נעדרים»: the ✕', seed: [], absent: [[TUE, 'w_03'], [WED, 'w_03']],
        open: async () => {},
        act: page => page.locator('#dayView .tray-absent .chip-side').first().tap(),
        expect: [['w_03', '']], wed: [['w_03', 'absent']] },
    { what: 'a site\'s row: the ✕', seed: [[TUE, 'w_01', 'p_01'], [WED, 'w_01', 'p_01']],
        open: async () => {},
        act: page => page.locator('#dayView .site-card .assign-row .btn-icon').first().tap(),
        expect: [['w_01', '']], wed: [['w_01', 'p_01']] },
    { what: '«לפי עובדים»: a row\'s ✕', seed: [[TUE, 'w_01', 'p_01'], [WED, 'w_01', 'p_01']],
        open: async page => { await page.locator('.layer-off', { hasText: 'לפי עובדים' }).tap(); await page.waitForTimeout(100); },
        act: page => page.locator('#dayView .wrow .btn-icon').first().tap(),
        expect: [['w_01', '']], wed: [['w_01', 'p_01']] },
    { what: '«הכל חופש»', seed: [[TUE, 'w_01', 'p_01']],
        open: async () => {},
        // MOVED (v194, round two of «הכל חופש» brought onto v192): reached through «עוד ⋯» at the
        // foot of the day and its menu - the door drawn for Tuesday names Tuesday all the way.
        act: async page => {
            await page.locator('#dayView .day-more-action').first().tap();
            await page.waitForFunction(() => { const first = document.querySelector('#askChoices button'); return Boolean(first) && !first.disabled; });
            await page.locator('#askChoices button').first().tap();
            await page.waitForFunction(() => document.getElementById('askOk').style.display !== 'none' && !document.getElementById('askOk').disabled);
            check('«הכל חופש»: the question names Tuesday', (await textOf(page, 'askTitle')).includes('10/11/2026'), await textOf(page, 'askTitle'));
            await page.locator('#askOk').tap();
        },
        expect: [['w_02', 'absent'], ['w_03', 'absent'], ['w_04', 'absent']], wed: [['w_02', null], ['w_03', null], ['w_04', null]] },
    { what: 'the bulk row: a site\'s chip', seed: [],
        open: async page => { await page.locator('#dayView .bulk-toggle').first().tap(); await page.waitForTimeout(100); },
        act: page => page.locator('#bulkRow .bulk-chip', { hasText: 'אתר דרום' }).tap(),
        expect: [['w_01', 'p_02'], ['w_02', 'p_02'], ['w_03', 'p_02'], ['w_04', 'p_02']] },
    { what: 'the copy button', seed: [['2026-11-09', 'w_01', 'p_02']],
        open: async () => {},
        act: async page => { await page.locator('#copyDayBtn').tap(); await page.waitForTimeout(100); await page.locator('#askOk').tap(); },
        expect: [['w_01', 'p_02']] },
    { what: 'a site\'s רימא box', seed: [], count: ['rima', 'rimaCount'] },
    { what: 'a site\'s יוסף גבס box', seed: [], count: ['yosefgeves', 'yosefGevesCount'] }
];
suite('a write lands on the day its surface named, whatever State.date has become under it');
for (const surface of surfaceCases) {
    const { context, page } = await phone(surface.seed);
    if (surface.absent) await page.evaluate(list => { list.forEach(([date, id]) => State.commit(markAbsent(State.schedule, date, id, 'actual'))); hideUndo(); render(); }, surface.absent);
    if (surface.count) {
        const [name, read] = surface.count;
        const box = page.locator(`#dayView .${name}-input[data-place-id="p_01"]`);
        await box.tap();
        await page.keyboard.type('2');
        await moveDayUnder(page);
        await page.evaluate(() => document.activeElement.blur());
        await page.waitForTimeout(150);
        same(`${surface.what}: the count is Tuesday's, and Wednesday has none`,
            await page.evaluate(([read, tue, wed]) => [window[read](State.schedule, tue, 'p_01'), window[read](State.schedule, wed, 'p_01')], [read, TUE, WED]), [2, 0]);
        await context.close();
        continue;
    }
    await surface.open(page);
    const before = await queued(page);
    const wedBefore = await page.evaluate(wed => JSON.stringify((State.schedule.days[wed] || {}).actual || {}), WED);
    await moveDayUnder(page);
    await surface.act(page);
    await page.waitForTimeout(200);
    const read = (date, id) => page.evaluate(([date, id]) => {
        const record = workerDay(State.schedule, date, id, 'actual');
        if (!record) return null;
        if (record.absent) return 'absent';
        return (record.entries || []).map(entry => entry.placeId + (entry.rate && entry.rate !== 'normal' ? ':' + entry.rate : '')
            + (entry.extraHours ? ':' + entry.extraHours : '')).join('+');
    }, [date, id]);
    for (const [id, value] of surface.expect) same(`${surface.what}: ${id} on Tuesday, the day the surface showed`, await read(TUE, id), value);
    for (const [id, value] of surface.wed || []) same(`${surface.what}: ${id} on Wednesday as he was`, await read(WED, id), value);
    if (!surface.wed) same(`${surface.what}: Wednesday untouched`, await page.evaluate(wed => JSON.stringify((State.schedule.days[wed] || {}).actual || {}), WED), wedBefore);
    const paths = await added(page, before);
    check(`${surface.what}: every path it queued is Tuesday's`, paths.length > 0 || surface.expect.length === 0,
        paths.join(', ') || 'nothing queued');
    same(`${surface.what}: and none of them Wednesday's`, paths.filter(path => path.startsWith(`days.${WED}`)), []);
    if (surface.after) await surface.after(page);
    await context.close();
}

// ================================================================== a day chosen by hand
// The follow owed waits for the last dialog to close - and a card's day CLOSES the card and
// sets the day in one turn. The close's follow came a microtask later and could not tell the
// day he tapped from the screen left sitting on yesterday when the two were the same day: his
// Tuesday tapped in the morning gave him Wednesday (the review of the hotfix, R1). A day
// chosen by hand settles the follow owed (dayChosenByHand, js/app.js).
suite('a card left open across midnight: the day tapped in its calendar is the day he gets, the old today too');
for (const [what, show, body, shut] of [
    ['a worker\'s card', "openWorkerCard('w_01')", '#workerCardBody', '#workerCardModal button[onclick="closeWorkerCard()"]'],
    ['a site\'s card', "openSiteCard('p_01')", '#siteCardBody', '#siteCardClose']]) {
    {
        const { context, page } = await phone([[TUE, 'w_01', 'p_01']]);
        await page.evaluate(code => (0, eval)(code), show);
        await page.waitForTimeout(150);
        await lockUntil(page, MORNING);
        same(`${what}: unlocked in the morning with it open, the day under it is still Tuesday`,
            [await dateNow(page), (await open(page)).length], [TUE, 1]);
        await page.locator(`${body} [data-date="${TUE}"]`).first().tap();
        await page.waitForTimeout(150);
        same(`${what}: his Tuesday tapped in its calendar, the day screen is on Tuesday, the card closed`,
            [await dateNow(page), await open(page)], [TUE, []]);
        check(`${what}: and the header says Tuesday`, (await header(page)).includes('10/11/2026'), await header(page));
        // No later moment takes it from him: a dialog opened and closed over it, the next return.
        await tapOpen(page.locator('#dayView .tray-pending .chip-main', { hasText: 'דוגמה שתיים' }));
        await page.locator('#placePickerModal button[onclick="closePlacePicker()"]').tap();
        await page.waitForTimeout(100);
        same(`${what}: a dialog opened and closed after it leaves him on Tuesday`, [await dateNow(page), await open(page)], [TUE, []]);
        await lockUntil(page, '2026-11-11T07:40:00+02:00');
        same(`${what}: and so does the next return`, await dateNow(page), TUE);
        await context.close();
    }
    {
        // What the follow is still for: the card shut by its own button, no day chosen.
        const { context, page } = await phone();
        await page.evaluate(code => (0, eval)(code), show);
        await page.waitForTimeout(150);
        await lockUntil(page, MORNING);
        await page.locator(shut).tap();
        await page.waitForTimeout(100);
        same(`${what}: shut by its own button instead, the day follows to Wednesday`, await dateNow(page), WED);
        await context.close();
    }
}

// MOVED ON PURPOSE (the second review of the hotfix, and again by the third): leaving a typed box
// makes the follow owed (js/app.js), and a box only tapped, never typed into, holds nothing at all,
// so a follow owed for a box is no longer still owed when he reaches the arrows or the drawer.
// What is held here is what this suite was for: a day reached by hand is his. Two roads to it:
// from a box holding a count stored earlier, only tapped - the day follows to Wednesday at the
// unlock, and he steps back to Tuesday by the arrow; and from a box typed into, left first (the
// day follows to Wednesday), then Tuesday chosen in the drawer.
suite('a follow made for a box: a day stepped or picked to by hand afterwards is his');
for (const how of ['the arrow, a day back from the Wednesday it followed to', 'the drawer\'s Tuesday']) {
    const { context, page } = await phone([[TUE, 'w_01', 'p_01']]);
    const arrows = how.startsWith('the arrow');
    if (arrows) await page.evaluate(tue => { State.commit(setRimaCount(State.schedule, tue, 'p_01', 3)); hideUndo(); render(); }, TUE);
    const box = page.locator('#dayView .rima-input[data-place-id="p_01"]');
    await box.tap();
    if (!arrows) await page.keyboard.type('3');
    await lockUntil(page, AFTER);
    if (arrows) {
        same(`${how}: the box only tapped holds nothing - the day followed at the unlock`, await dateNow(page), WED);
        await page.locator('#dayView .nav-back').first().tap();
    } else {
        given(`${how}: the follow is owed - the day under the typed box is still Tuesday`, (await dateNow(page)) === TUE);
        await page.locator('#dayView .tray h4').first().tap();
        await page.waitForTimeout(150);
        same(`${how}: the box left, the day followed to Wednesday`, await dateNow(page), WED);
        await page.locator('.day-nav .drawer-btn').first().tap();
        await page.waitForTimeout(200);
        await page.locator('#dayDrawerList .drawer-day', { hasText: '10/11' }).first().tap();
    }
    await page.waitForTimeout(150);
    same(`${how}: the day is Tuesday, by his hand`, await dateNow(page), TUE);
    await tapOpen(page.locator('#dayView .tray-pending .chip-main', { hasText: 'דוגמה שתיים' }));
    await page.locator('#placePickerModal button[onclick="closePlacePicker()"]').tap();
    await page.waitForTimeout(100);
    same(`${how}: a dialog closed after it does not move it`, [await dateNow(page), await open(page)], [TUE, []]);
    await lockUntil(page, LATER);
    same(`${how}: nor does the next return`, await dateNow(page), TUE);
    await context.close();
}

// ================================================================== a draft that names no day
// The advances page's «סידור» is a draft a RELOAD must wait for (midEdit), and it was the
// third thing the follow waited for too - on every unlock, wherever the screen was, until שמור
// or ביטול: left open while he went back to the day, it kept the day on Tuesday the next
// morning and his first record landed there (the review of the hotfix, R4). It names no day.
suite('the advances page\'s «סידור» draft left open: the morning still follows the calendar');
{
    const { context, page } = await phone();
    await page.locator('#tab-advances').tap();
    await page.waitForTimeout(100);
    await page.locator('#advancesView button', { hasText: 'סידור' }).first().tap();
    await page.waitForTimeout(100);
    await page.locator('#advancesView .advance-order-row[data-worker="w_01"] [data-move="down"]').tap();
    await page.waitForTimeout(100);
    const order = () => page.evaluate(() => [...document.querySelectorAll('#advancesView .advance-order-row')].map(row => row.dataset.worker));
    const drafted = await order();
    given('the draft is open with a man moved', drafted.join(',') === 'w_02,w_01,w_03,w_04', drafted.join(','));
    await page.locator('#tab-day').tap();
    await page.waitForTimeout(100);
    given('back on the day, the draft is still held: a reload still waits for it', await page.evaluate(() => midEdit()) === true);
    await lockUntil(page, MORNING);
    same('unlocked in the morning, the day is Wednesday', await dateNow(page), WED);
    check('and the header says so', (await header(page)).includes('11/11/2026'), await header(page));
    await tapOpen(page.locator('#dayView .tray-pending .chip-main', { hasText: 'דוגמה אחת' }));
    check('«לאן הלך» names Wednesday', (await textOf(page, 'placePickerContext')).includes('11/11/2026'), await textOf(page, 'placePickerContext'));
    await page.locator('#placePickerList .place-btn', { hasText: 'אתר צפון' }).tap();
    await page.waitForTimeout(150);
    same('the morning\'s first record lands on Wednesday', [await sites(page, WED, 'w_01'), await sites(page, TUE, 'w_01')], [['p_01'], []]);
    same('on the disk the same', [await onDisk(page, WED, 'w_01'), await onDisk(page, TUE, 'w_01')], ['p_01', null]);
    await page.locator('#placePickerModal button[onclick="closePlacePicker()"]').tap();
    await page.waitForTimeout(100);
    await page.locator('#tab-advances').tap();
    await page.waitForTimeout(100);
    same('the draft is where he left it, the man still moved', await order(), drafted);
    same('and a reload still waits for it', await page.evaluate(() => midEdit()), true);
    await context.close();
}
{
    const { context, page } = await phone();
    await page.locator('#tab-advances').tap();
    await page.waitForTimeout(100);
    await page.locator('#advancesView button', { hasText: 'סידור' }).first().tap();
    await page.waitForTimeout(100);
    await page.locator('#advancesView .advance-order-row[data-worker="w_01"] [data-move="down"]').tap();
    await page.waitForTimeout(100);
    const order = () => page.evaluate(() => [...document.querySelectorAll('#advancesView .advance-order-row')].map(row => row.dataset.worker));
    const drafted = await order();
    await lockUntil(page, MORNING);
    same('unlocked on the advances page with the draft open, the day follows to Wednesday', await dateNow(page), WED);
    same('and the draft is drawn again as it was', await order(), drafted);
    await page.locator('#tab-day').tap();
    await page.waitForTimeout(100);
    check('the day screen says Wednesday', (await header(page)).includes('11/11/2026'), await header(page));
    await context.close();
}

// The follow asks its own question (dayRolloverHeld, js/app.js): a dialog, or a box ON THE GLASS
// holding typing. A box in a page he has left is not being typed into - and a tab tapped on an
// iPhone takes no focus, so that box can go on being the focused element under display:none.
// Chromium lets go of it at the next frame, so here the view is switched without moving the
// focus, as an iPhone's tap is, and the phone unlocked in that same turn, before the frame.
suite('a box he was typing in, in a page he has left, holds no day');
{
    const { context, page } = await phone();
    await page.locator('#tab-advances').tap();
    await page.waitForTimeout(100);
    const box = page.locator('#advancesView input[type=search]').first();
    await box.tap();
    await box.fill('דוג');
    given('the advances search box holds typing and the focus', await page.evaluate(() =>
        document.activeElement && document.activeElement.type === 'search' && document.activeElement.value === 'דוג'));
    await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.setSystemTime(new Date(MORNING));
    const seen = await page.evaluate(() => {
        const typed = document.activeElement;
        showView('day');
        const left = { focused: document.activeElement === typed, reload: midEdit(),
            held: typeof dayRolloverHeld === 'function' ? dayRolloverHeld() : null };
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
        document.dispatchEvent(new Event('visibilitychange'));
        return Object.assign(left, { date: State.date });
    });
    same('the page left, the box is still the focused element and a reload still waits for it', [seen.focused, seen.reload], [true, true]);
    same('but it holds no day: unlocked, the day screen follows to Wednesday', [seen.held, seen.date], [false, WED]);
    await page.waitForTimeout(100);
    check('and the header says so', (await header(page)).includes('11/11/2026'), await header(page));
    await context.close();
}
{
    // On the glass it does hold - the declared case: the box keeps its typing and its focus,
    // and the day stays the day the screen says. MOVED ON PURPOSE (the second review of the
    // hotfix): left - here by the day's tab - the follow is made once that tap is over; it used
    // to wait for the next return, and the first record of the morning went to yesterday.
    const { context, page } = await phone();
    await page.locator('#tab-advances').tap();
    await page.waitForTimeout(100);
    const box = page.locator('#advancesView input[type=search]').first();
    await box.tap();
    await box.fill('דוג');
    await lockUntil(page, AFTER);
    same('typed into on the glass at the unlock, the box holds the day and keeps its typing and its focus',
        [await dateNow(page), await box.inputValue(), await page.evaluate(() => document.activeElement && document.activeElement.type)],
        [TUE, 'דוג', 'search']);
    await page.locator('#tab-day').tap();
    await page.waitForTimeout(150);
    const shown = await header(page);
    same('left by the day\'s tab, the day screen follows to Wednesday and names it', [await dateNow(page), shown.includes('11/11/2026')], [WED, true]);
    await lockUntil(page, LATER);
    same('and the next return leaves it there', await dateNow(page), WED);
    await context.close();
}

suite('nothing broke on the way');
same('no page error on any phone', errors.join(' | '), '');

await browser.close();
await server.close();
report();
