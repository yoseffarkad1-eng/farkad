// The seder to each worker (v167) in a real Chromium: the entry in the WhatsApp dialog, the
// list, a man left out, the run through WhatsApp one tap at a time, the marks, a reload in
// the middle of it, the rectangles a finger lands on - and, on a touched phone, two taps in
// a row that must open one man and not two, and two men on one number told so.
//
//   node tests/seder.browser.mjs
//
// Who is on the list, what each man is sent, the phone numbers and where the progress is
// kept are measured in tests/seder.test.mjs. This is the part only a page can answer: the
// tap that opens WhatsApp has to BE the person's tap (iOS opens nothing for a navigation
// that is not), the next man has to be there when the person comes back, and the list has
// to come back too when the phone killed the app while WhatsApp was in front.
//
// WhatsApp itself is never reached. wa.me is answered by a route on this browser's own
// context with a page of nothing, and the address the tap asked for is what is read.

import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import { launchLocalBrowser } from './network-guard.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
const served = await verifyServedAssets(server.url, root, expectedShaFor(root));
check('the origin served this commit, byte for byte', served.ok,
    `${served.checked} assets; ${(served.wrong || []).slice(0, 3).join(' | ')}`);
const browser = await launchLocalBrowser(chromium, { executablePath: process.env.CHROME_PATH });

const DAY = '2026-11-05';       // a Thursday
const OTHER = '2026-11-08';
const HOLIDAY = '2026-11-06';

const FSI = '⁨';
const PDI = '⁩';
const named = name => `${FSI}${name}${PDI}`;
const bare = text => String(text || '').replace(/[⁦-⁩]/g, '');

// The pinned words - drafts for the owner, kept in one block in js/ui/seder.js.
const ENTRY = '👷 לכל עובד בנפרד';
const TITLE = 'סידור לכל עובד';
const OPENED = '✓ נפתח בוואטסאפ';
const NO_PHONE = 'אין מספר טלפון תקין';
const NOBODY = 'אין ביום הזה עובדים עם אתר עבודה.';
const ALL_DONE = '✓ כל ההודעות שנבחרו נפתחו בוואטסאפ';
const progress = (done, total) => `נפתחו ${done} מתוך ${total}`;
const go = name => `💬 פתח בוואטסאפ: ${name}`;
const SHARED = names => `⚠️ מספר משותף עם ${names}`;
// A site where he is the only one of the owner's men has its site line and nothing under it
// (the owner, 2026-11-07).
const message = (name, sites) => [`שלום ${named(name)},`, 'סידור עבודה ליום חמישי 05/11/2026:']
    .concat(...sites.map(([site, others]) => ['', `📍 ${named(site)}`]
        .concat(others.length ? [`👷 איתך: ${others.map(named).join(', ')}`] : [])))
    .join('\n');

const WORKERS = [
    { id: 'w_01', name: 'אחמד', active: true, dailyRate: 400, phone: '052-884-1930' },
    { id: 'w_02', name: 'מוחמד עבד אל רחמן', active: true, dailyRate: 400, phone: '+972 54-123-4567' },
    { id: 'w_03', name: 'יוסי', active: true, dailyRate: 400, phone: '' },
    { id: 'w_04', name: 'סמיר', active: true, dailyRate: 400, phone: '0501112233' },
    { id: 'w_05', name: 'עלי', active: true, dailyRate: 400, phone: '0549998877' },
    { id: 'w_06', name: 'Ali Hassan', active: true, dailyRate: 400, phone: '+972 54 765 4321' },
    { id: 'w_07', name: 'ח\'אלד', active: true, dailyRate: 400, phone: '0587654321' }
];
const PLACES = [
    { id: 'p_01', name: 'הרצליה', active: true },
    { id: 'p_02', name: 'חיפה', active: true },
    { id: 'p_03', name: 'פרדסיה', active: true },
    { id: 'p_04', name: 'נתניה', active: true }
];

// The evening: אחמד at הרצליה; מוחמד at הרצליה and חיפה; יוסי (no phone) and ח'אלד at חיפה;
// Ali Hassan alone at פרדסיה beside two of Rima's; סמיר נעדר; עלי nothing; Rima alone at
// נתניה. And אחמד on OTHER too, for the per-date check. `device` is handed to the context (a
// touched phone), and `phones` gives a man another number on this page alone.
async function open(width, height = 844, device = {}, phones = {}) {
    const context = await browser.newContext({ viewport: { width, height }, ...device });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // WhatsApp, answered here and nowhere else. A route registered after the network guard's
    // runs first, and fulfilling it sends nothing anywhere.
    const asked = [];
    await context.route('https://wa.me/**', route => {
        asked.push(route.request().url());
        return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>wa</title>' });
    });
    await page.goto(`${server.url}/index.html`, { waitUntil: 'load' });
    await page.waitForTimeout(350);
    await page.evaluate(([workers, places, day, other, phones]) => {
        todayStr = () => '2026-11-04';
        State.schedule.workers = workers.map(worker =>
            (phones[worker.id] === undefined ? worker : { ...worker, phone: phones[worker.id] }));
        State.schedule.places = places;
        const work = (date, id, place) => assignPlace(State.schedule, date, id, 'actual', place);
        work(day, 'w_01', 'p_01');
        work(day, 'w_02', 'p_01');
        work(day, 'w_02', 'p_02');
        work(day, 'w_03', 'p_02');
        work(day, 'w_06', 'p_03');
        work(day, 'w_07', 'p_02');
        markAbsent(State.schedule, day, 'w_04', 'actual');
        setRimaCount(State.schedule, day, 'p_03', 2);
        setRimaCount(State.schedule, day, 'p_04', 3);
        work(other, 'w_01', 'p_01');
        State.save();
        State.date = day;
        showView('day');
        render();
    }, [WORKERS, PLACES, DAY, OTHER, phones]);
    await page.waitForTimeout(200);
    return { page, errors, context, asked };
}

// How long after a door is used every door on the list does nothing (js/ui/seder.js) - 0 on
// a build that has no such moment.
const guardOf = page => page.evaluate(() => (typeof SEDER_TAP_GUARD_MS === 'number' ? SEDER_TAP_GUARD_MS : 0));

// The tap that opens WhatsApp, and the address it asked for. The moment after it is waited
// out, the way a person comes back from sending a message: long after it.
async function tapToWhatsApp(page, context, locator) {
    const [popup] = await Promise.all([context.waitForEvent('page'), locator.click()]);
    await popup.waitForLoadState('domcontentloaded').catch(() => {});
    const url = popup.url();
    await popup.close();
    await page.bringToFront();
    await page.waitForTimeout(250 + await guardOf(page));
    return url;
}

const rowIds = page => page.locator('#sederList .seder-row').evaluateAll(rows => rows.map(row => row.dataset.workerId));
const row = (page, id) => page.locator(`#sederList .seder-row[data-worker-id="${id}"]`);
const goText = async page => bare(await page.locator('#sederGo').textContent());

async function stop(page, context) {
    await context.close();
    await browser.close();
    await server.close();
    report();
}

const { page, errors, context, asked } = await open(390);
const recordBefore = await page.evaluate(() => localStorage.getItem('scheduleData:v2'));
const queuedBefore = await page.evaluate(() => JSON.stringify(FarkadSync.pendingPaths()));

{
    suite('the way in is one entry inside the WhatsApp dialog, not a new button on the day');

    same('the day\'s dock still has its two buttons and no more',
        await page.locator('.day-actions button').count(), 2);
    same('and nothing on the day screen itself offers it',
        await page.locator('#dayView').getByText(ENTRY).count(), 0);
    await page.locator('.day-actions .btn-success').click();
    await page.waitForTimeout(200);
    check('the dock\'s WhatsApp button opens the WhatsApp dialog', await page.locator('#shareModal').isVisible());
    const entry = page.locator('#shareModal').getByRole('button', { name: ENTRY, exact: true });
    const found = await entry.count();
    check('which has one entry for the seder to each worker', found === 1, String(found));
    if (found !== 1) await stop(page, context);
    const box = await entry.boundingBox();
    check('a finger wide and tall', box && box.width >= 44 && box.height >= 44, JSON.stringify(box));
    await entry.click();
    await page.waitForTimeout(250);
}

{
    suite('the list: the men with a site that day, each chosen, each with his own door');

    check('the list is open', await page.locator('#sederModal').isVisible());
    check('and the WhatsApp dialog stepped out of its way', !(await page.locator('#shareModal').isVisible()));
    same('it is entered at its heading', await page.evaluate(() => document.activeElement && document.activeElement.id),
        'sederTitle');
    same('which says what it is', await page.locator('#sederTitle').textContent(), TITLE);
    check('the day and the date being sent are said under it',
        bare(await page.locator('#sederContext').textContent()).includes('יום חמישי 05/11/2026'),
        await page.locator('#sederContext').textContent());
    same('the men with a site, in roster order', await rowIds(page), ['w_01', 'w_02', 'w_03', 'w_06', 'w_07']);
    same('nobody marked נעדר, nobody with no site, and no Rima', await page.locator('#sederList')
        .evaluate(node => ['סמיר', 'עלי', 'רימא', 'נתניה'].filter(word => node.textContent.includes(word))), []);
    check('a man on two sites is one row, naming both', (await row(page, 'w_02').count()) === 1
        && bare(await row(page, 'w_02').locator('.seder-sites').textContent()).includes('הרצליה')
        && bare(await row(page, 'w_02').locator('.seder-sites').textContent()).includes('חיפה'));
    same('everyone who can be sent to starts chosen',
        await page.locator('#sederList .seder-check').evaluateAll(boxes => boxes.map(box => box.checked)),
        [true, true, true, true]);
    same('the man with no number has no tick and no door, and says why',
        [await row(page, 'w_03').locator('.seder-check').count(), await row(page, 'w_03').locator('a').count(),
            bare(await row(page, 'w_03').locator('.seder-state').textContent())], [0, 0, NO_PHONE]);
    same('everybody else has his own door to WhatsApp', await page.locator('#sederList .seder-one').count(), 4);
}

{
    suite('one man left out; the run opens WhatsApp for the first, with his own message');

    await row(page, 'w_02').locator('.seder-pick').click();
    await page.waitForTimeout(150);
    same('tapping his row leaves him out', await row(page, 'w_02').locator('.seder-check').isChecked(), false);
    check('and the row says so by its look', await row(page, 'w_02').evaluate(node => node.classList.contains('seder-row-off')));
    same('the run will start at the first chosen man', await goText(page), go('אחמד'));
    same('and says how far it has got', await page.locator('#sederStatus').textContent(), progress(0, 3));

    const expected = message('אחמד', [['הרצליה', ['מוחמד עבד אל רחמן']]]);
    const href = await page.locator('#sederGo a').getAttribute('href');
    // Written onto the link BEFORE the tap, so the tap itself is the navigation - nothing
    // is worked out after the person's finger has left the glass.
    same('the address is on the link before it is tapped',
        href, `https://wa.me/972528841930?text=${encodeURIComponent(expected)}`);
    same('and it opens a new window, leaving the app where it is',
        await page.locator('#sederGo a').getAttribute('target'), '_blank');
    const url = await tapToWhatsApp(page, context, page.locator('#sederGo a'));
    const opened = new URL(url);
    same('the tap went to wa.me, to his number', opened.host + opened.pathname, 'wa.me/972528841930');
    same('with his message, decoded, character for character', opened.searchParams.get('text'), expected);
    same('and nothing else went anywhere', asked.length, 1);
}

{
    suite('back from WhatsApp: the next man is one tap away, and the first is marked');

    same('the first man is marked opened in WhatsApp - never "sent"',
        bare(await row(page, 'w_01').locator('.seder-state').textContent()), OPENED);
    same('the next is the next chosen man, past the one left out and the one with no number',
        await goText(page), go('Ali Hassan'));
    same('the count moved', await page.locator('#sederStatus').textContent(), progress(1, 3));
    same('the record on the disk is byte for byte what it was',
        await page.evaluate(() => localStorage.getItem('scheduleData:v2')), recordBefore);
    same('and nothing was queued for the cloud',
        await page.evaluate(() => JSON.stringify(FarkadSync.pendingPaths())), queuedBefore);
    check('the progress is in its own key and nowhere in the record', await page.evaluate(() => {
        const kept = JSON.parse(localStorage.getItem('farkadSederProgress'));
        return Boolean(kept['2026-11-05'].opened.w_01) && kept['2026-11-05'].off.w_02 === true
            && !localStorage.getItem('scheduleData:v2').includes('farkadSeder');
    }));
}

{
    suite('the phone kills the app while WhatsApp is in front: it comes back to the list');

    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(600);
    check('the list is open again by itself', await page.locator('#sederModal').isVisible());
    same('on the day it was sending, not on today', await page.evaluate(() => State.date), DAY);
    same('the mark survived', bare(await row(page, 'w_01').locator('.seder-state').textContent()), OPENED);
    same('so did the man left out', await row(page, 'w_02').locator('.seder-check').isChecked(), false);
    same('and the next man is ready under one tap', await goText(page), go('Ali Hassan'));
    same('nobody was opened by the reload itself - only a tap does that', asked.length, 1);
}

{
    suite('every control on the list is a finger wide and tall; nothing on it zooms; it reads right to left');

    const sizes = await page.locator('#sederModal').evaluate(modal => {
        const controls = [...modal.querySelectorAll('label.seder-pick, a, button, input')]
            .filter(node => node.offsetParent !== null);
        return controls.map(node => {
            const hit = node.matches('input') ? node.closest('label') || node : node;
            const box = hit.getBoundingClientRect();
            return { what: node.className || node.tagName, w: Math.round(box.width), h: Math.round(box.height) };
        });
    });
    given('the list has its ticks, its doors, the run and the close to measure', sizes.length >= 14,
        String(sizes.length));
    check('every target is at least 44 by 44', sizes.every(size => size.w >= 44 && size.h >= 44),
        JSON.stringify(sizes.filter(size => size.w < 44 || size.h < 44)));
    const fonts = await page.locator('#sederModal input').evaluateAll(inputs =>
        inputs.map(input => parseFloat(getComputedStyle(input).fontSize)));
    check('every input on it is 16px or larger', fonts.length === 4 && fonts.every(size => size >= 16),
        JSON.stringify(fonts));
    const rtl = await page.locator('#sederModal .modal-content').evaluate(content => {
        const first = content.querySelector('.seder-row');
        const pick = first.querySelector('.seder-pick').getBoundingClientRect();
        const door = first.querySelector('.seder-one').getBoundingClientRect();
        const name = first.querySelector('.seder-name').getBoundingClientRect();
        return { dir: getComputedStyle(content).direction, pickRight: pick.right, doorRight: door.right,
            nameRight: Math.round(name.right), rowRight: Math.round(first.getBoundingClientRect().right) };
    });
    same('the list is right to left', rtl.dir, 'rtl');
    check('the name and its tick start at the right, the door sits at the left',
        rtl.pickRight > rtl.doorRight && rtl.rowRight - rtl.nameRight <= 48, JSON.stringify(rtl));

    for (const width of [320, 440]) {
        await page.setViewportSize({ width, height: 700 });
        await page.waitForTimeout(150);
        const fit = await page.locator('#sederModal .modal-content').evaluate(content => {
            const foot = content.querySelector('.seder-foot').getBoundingClientRect();
            const box = content.getBoundingClientRect();
            return { fits: content.scrollWidth <= content.clientWidth + 1,
                footInside: foot.bottom <= box.bottom + 1 && foot.top >= box.top - 1,
                page: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 };
        });
        check(`${width}px: nothing runs off the side and the foot is on screen`,
            fit.fits && fit.footInside && fit.page, JSON.stringify(fit));
    }

    // A crew of thirty on a small phone: the list scrolls, the run stays under the thumb.
    const LONG = '2026-11-09';
    await page.evaluate(long => {
        closeSederList();
        for (let i = 10; i < 40; i += 1) {
            State.schedule.workers.push({ id: `w_${i}`, name: `עובד ${i}`, active: true, dailyRate: 400,
                phone: `05${String(i).padStart(8, '0')}` });
            assignPlace(State.schedule, long, `w_${i}`, 'actual', i % 2 ? 'p_01' : 'p_02');
        }
        State.save();
        State.date = long;
        render();
        openSederList(long);
    }, LONG);
    await page.setViewportSize({ width: 320, height: 568 });
    await page.waitForTimeout(250);
    const reach = async () => page.locator('#sederModal .modal-content').evaluate(content => {
        const box = content.getBoundingClientRect();
        const run = content.querySelector('#sederGo a').getBoundingClientRect();
        const middle = document.elementFromPoint(run.left + run.width / 2, run.top + run.height / 2);
        return { scrolls: content.scrollHeight > content.clientHeight + 40,
            inside: run.top >= box.top && run.bottom <= box.bottom + 1,
            onTop: Boolean(middle && middle.closest('#sederGo')), viewport: run.bottom <= window.innerHeight };
    });
    const atTop = await reach();
    check('thirty men make the list scroll', atTop.scrolls, JSON.stringify(atTop));
    check('and the run is on screen and on top before scrolling', atTop.inside && atTop.onTop && atTop.viewport,
        JSON.stringify(atTop));
    await page.locator('#sederModal .modal-content').evaluate(content => { content.scrollTop = content.scrollHeight / 2; });
    await page.waitForTimeout(100);
    const midway = await reach();
    check('and still there halfway down the list', midway.inside && midway.onTop && midway.viewport,
        JSON.stringify(midway));
    await page.evaluate(day => { closeSederList(); State.date = day; render(); openSederList(day); }, DAY);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    same('back on the evening being sent, where it was left', await goText(page), go('Ali Hassan'));
}

{
    suite('the run goes on to its end, and a man\'s own door works beside it');

    const second = new URL(await tapToWhatsApp(page, context, page.locator('#sederGo a')));
    same('the second tap goes to the second man', second.host + second.pathname, 'wa.me/972547654321');
    same('with his own message: his site and nothing under it, and no word of Rima\'s two beside him',
        second.searchParams.get('text'), message('Ali Hassan', [['פרדסיה', []]]));

    // The man left out still has his own door, and using it is the person's choice.
    const own = new URL(await tapToWhatsApp(page, context, row(page, 'w_02').locator('.seder-one')));
    same('a man\'s own door opens him even when he was left out of the run',
        own.host + own.pathname, 'wa.me/972541234567');
    same('with both his sites in it', own.searchParams.get('text'),
        message('מוחמד עבד אל רחמן', [['הרצליה', ['אחמד']], ['חיפה', ['יוסי', 'ח\'אלד']]]));
    same('he is marked too', bare(await row(page, 'w_02').locator('.seder-state').textContent()), OPENED);
    same('and the run is not moved by it', await goText(page), go('ח\'אלד'));

    await tapToWhatsApp(page, context, page.locator('#sederGo a'));
    same('when every chosen man is opened the list says so', await page.locator('#sederStatus').textContent(),
        ALL_DONE);
    same('and offers no further tap', await page.locator('#sederGo a').count(), 0);
}

{
    suite('closed is closed; another date shows none of this one; a holiday lists nobody');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    check('Escape closes the list', !(await page.locator('#sederModal').isVisible()));
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(600);
    check('and a list that was closed does not come back after a reload',
        !(await page.locator('#sederModal').isVisible()));

    await page.evaluate(other => { State.date = other; render(); showDayMessage(); }, OTHER);
    await page.waitForTimeout(200);
    await page.locator('#shareModal').getByRole('button', { name: ENTRY, exact: true }).click();
    await page.waitForTimeout(250);
    same('on another date only that date\'s men are listed', await rowIds(page), ['w_01']);
    same('none of them marked', await page.locator('#sederList .seder-state').count(), 0);
    same('and nobody left out', await page.locator('#sederList .seder-check').evaluateAll(boxes =>
        boxes.map(box => box.checked)), [true]);
    await page.locator('#sederClose').click();
    await page.waitForTimeout(150);

    // הכל חופש, pressed the way a person presses it.
    await page.evaluate(holiday => { State.date = holiday; render(); }, HOLIDAY);
    await page.waitForTimeout(150);
    await page.evaluate(() => { markAllHoliday(); });
    await page.waitForTimeout(200);
    await page.locator('#askOk').click();
    await page.waitForTimeout(250);
    given('הכל חופש recorded everyone absent', await page.evaluate(holiday =>
        State.activeWorkers().every(worker => isAbsent(State.schedule, holiday, worker.id, 'actual')), HOLIDAY));
    await page.evaluate(() => showDayMessage());
    await page.waitForTimeout(150);
    await page.locator('#shareModal').getByRole('button', { name: ENTRY, exact: true }).click();
    await page.waitForTimeout(250);
    same('a הכל חופש day lists nobody', await rowIds(page), []);
    same('and says so', bare(await page.locator('#sederList').textContent()), NOBODY);
    same('with nothing to tap', await page.locator('#sederGo a').count(), 0);
    await page.locator('#sederClose').click();
}

{
    suite('in the dark scheme too');

    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate(day => { State.date = day; render(); showDayMessage(); }, DAY);
    await page.waitForTimeout(150);
    await page.locator('#shareModal').getByRole('button', { name: ENTRY, exact: true }).click();
    await page.waitForTimeout(250);
    const colours = await page.locator('#sederModal .modal-content').evaluate(content => ({
        surface: getComputedStyle(content).backgroundColor,
        ink: getComputedStyle(content.querySelector('.seder-name')).color
    }));
    check('the list follows the dark scheme', colours.surface !== 'rgb(255, 255, 255)'
        && colours.ink !== 'rgb(23, 32, 43)', JSON.stringify(colours));
}

// A touched phone of its own, from an empty disk. ח'אלד carries אחמד's number here, typed
// the other way round - the same phone once it is read as digits.
const touched = await open(390, 844, { isMobile: true, hasTouch: true }, { w_07: '+972 52 884 1930' });
const tp = touched.page;
const windows = [];
touched.context.on('page', opened => windows.push(opened));
const reached = () => touched.asked.map(url => new URL(url).pathname);
const marked = () => tp.evaluate(day => {
    const kept = JSON.parse(localStorage.getItem('farkadSederProgress') || '{}');
    return Object.keys((kept[day] || {}).opened || {});
}, DAY);
// Where a finger lands on the one element a locator names, or null when there is not one -
// so a build that gets this wrong fails the checks below rather than hanging on a lookup.
const centre = locator => locator.evaluateAll(nodes => {
    if (nodes.length !== 1) return null;
    const box = nodes[0].getBoundingClientRect();
    return [box.left + box.width / 2, box.top + box.height / 2];
});
const press = async (point, act) => { if (point) await act(point[0], point[1]); };
const touch = (x, y) => tp.touchscreen.tap(x, y);
const mouse = (x, y) => tp.mouse.click(x, y);

{
    suite('two taps in a row open one man, not two: nothing on the list moves under the finger');

    // The owner taps twice in a row - css/app.css records that he does - or taps again
    // because the first seemed to do nothing while the phone was getting to WhatsApp. The
    // second tap used to land on the run's button already redrawn for the next man: two
    // chats opened, only one of them in front, and both rows saying ✓ while the run went
    // on to a third man.
    await tp.locator('.day-actions .btn-success').tap();
    await tp.waitForTimeout(200);
    await tp.locator('#shareModal').getByRole('button', { name: ENTRY, exact: true }).tap();
    await tp.waitForTimeout(250);
    const guard = await guardOf(tp);
    given('the list is open on the touched phone, the run on its first man',
        (await tp.locator('#sederModal').isVisible()) && (await goText(tp)) === go('אחמד'), await goText(tp));

    const first = await centre(tp.locator('#sederGo a'));
    await press(first, touch);
    await tp.waitForTimeout(120);
    await press(first, touch);
    await tp.waitForTimeout(400);
    same('two taps 120 ms apart ask WhatsApp for one man', reached(), ['/972528841930']);
    same('in one window', windows.length, 1);
    same('and mark one man', await marked(), ['w_01']);
    same('the run\'s button still names the man it has just opened', await goText(tp), go('אחמד'));
    // Whatever redraws the list in that moment - the person back at once, a snapshot from
    // another phone - redraws it with him still there.
    await tp.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await tp.waitForTimeout(50);
    same('a redraw in that moment does not move it either', await goText(tp), go('אחמד'));
    check('the moment is long enough for a phone to get to WhatsApp and too short to be waited on',
        guard >= 1000 && guard <= 3000, String(guard));

    await tp.waitForTimeout(guard + 200);
    same('once it is over the run names the next man', await goText(tp), go('מוחמד עבד אל רחמן'));
    same('the man opened is marked', await row(tp, 'w_01').locator('.seder-state')
        .evaluateAll(nodes => nodes.map(node => node.textContent)), [OPENED]);
    same('and the next man is not', await row(tp, 'w_02').locator('.seder-state').count(), 0);
    same('the count says one', await tp.locator('#sederStatus').textContent(), progress(1, 4));

    // Two clicks 150 ms apart on the second man: a mouse, or a finger read as one.
    const second = await centre(tp.locator('#sederGo a'));
    await press(second, mouse);
    await tp.waitForTimeout(150);
    await press(second, mouse);
    await tp.waitForTimeout(400);
    same('two clicks 150 ms apart open the next man once', reached(), ['/972528841930', '/972541234567']);
    same('and mark him once', await marked(), ['w_01', 'w_02']);

    // The run, and a man's own door in the same moment: the moment is the list's, not the button's.
    await tp.waitForTimeout(guard + 200);
    same('after it the run is on the third man', await goText(tp), go('Ali Hassan'));
    const third = await centre(tp.locator('#sederGo a'));
    const door = await centre(row(tp, 'w_07').locator('.seder-one'));
    await press(third, touch);
    await tp.waitForTimeout(150);
    await press(door, touch);
    await tp.waitForTimeout(400);
    same('a man\'s own door tapped in that moment opens nobody', reached().slice(2), ['/972547654321']);
    same('and marks nobody', await marked(), ['w_01', 'w_02', 'w_06']);

    // A double click on a man's own door, once the moment is over.
    await tp.waitForTimeout(guard + 200);
    const own = await centre(row(tp, 'w_07').locator('.seder-one'));
    await press(own, (x, y) => tp.mouse.dblclick(x, y));
    await tp.waitForTimeout(400);
    same('a double click on a man\'s own door opens him once', reached().slice(3), ['/972528841930']);
    same('and marks him once', await marked(), ['w_01', 'w_02', 'w_06', 'w_07']);
    same('every window opened was one somebody meant', windows.length, 4);
}

{
    suite('two men on the list with one number are each told so, and both stay on it');

    // The roster calls it «מספר משותף» (js/ui/roster.js). On this list it is what decides
    // whether two messages go into one chat, so each of the two names the other.
    const notes = await tp.locator('#sederList .seder-row').evaluateAll(rows => rows.map(one => {
        const note = one.querySelector('.seder-shared');
        return [one.dataset.workerId, note ? note.textContent : null];
    }));
    same('each of the two names the other, and nobody else carries a note',
        notes.map(([id, text]) => [id, text === null ? null : bare(text)]),
        [['w_01', SHARED('ח\'אלד')], ['w_02', null], ['w_03', null], ['w_06', null], ['w_07', SHARED('אחמד')]]);
    same('both are still chosen, each with his own door: whether both go there is the owner\'s call',
        await tp.locator('#sederList .seder-row').evaluateAll(rows => rows
            .filter(one => one.querySelector('.seder-shared'))
            .map(one => [one.querySelector('.seder-check').checked, Boolean(one.querySelector('.seder-one'))])),
        [[true, true], [true, true]]);

    await tp.setViewportSize({ width: 320, height: 700 });
    await tp.waitForTimeout(150);
    const fit = await tp.locator('#sederModal .modal-content').evaluate(content => {
        const note = content.querySelector('.seder-shared');
        const box = content.getBoundingClientRect();
        const at = note ? note.getBoundingClientRect() : null;
        return { fits: content.scrollWidth <= content.clientWidth + 1, note: Boolean(at),
            inside: Boolean(at) && at.left >= box.left - 1 && at.right <= box.right + 1 };
    });
    check('at 320px the note wraps inside its row and nothing runs off the side',
        fit.fits && fit.note && fit.inside, JSON.stringify(fit));
}

same('no page errors on the touched phone either', touched.errors, []);
await touched.context.close();
same('no page errors', errors, []);
await context.close();
await browser.close();
await server.close();
report();
