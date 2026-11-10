// הסעות (v171) in a real Chromium: off until this phone turns it on, one entry in the
// WhatsApp dialog and none on the day, and then the whole evening - areas, who may drive,
// which cars go out, suggest, move a man, choose a driver, lock, accept (a partial plan
// only with a typed reason), versions, each driver's link, the marks - at two phone sizes,
// in both schemes, with the day record byte for byte what it was at the end.
//
//   CHROME_PATH=/opt/pw-browsers/chromium node tests/transport.browser.mjs
//
// The engine, the words, the driver's message and where everything is kept are measured
// in tests/transport.test.mjs. This is the part only a page can answer: that the panel
// opens over the app and the app's own questions open over the panel, that only the men
// who may drive a car are there to be tapped, that the link to WhatsApp is a real link
// with the whole address on it, and that nothing a finger lands on is under 44px.
//
// WHATSAPP IS NEVER REACHED AND THE LINK IS NEVER FOLLOWED. The address and the target are
// read off the link; the tap that marks it has its navigation prevented by this file, so
// what is measured is the app's own handler. (tests/seder.browser.mjs follows its links to
// a routed page, and on a Chromium newer than the pinned one a refused popup reports an
// empty address - a fact about that browser, not about a link.) Every request the page
// makes is recorded, and none may be for WhatsApp or for anywhere else off this machine.
//
// TRANSPORT_SHOTS=<directory> also writes one JPEG of each of the four parts at 440x956,
// dark. Synthetic names only - it is this file's own fixture.

import { chromium } from 'playwright';
import { join } from 'node:path';
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
const SHOTS = process.env.TRANSPORT_SHOTS || '';

const DAY = '2026-11-10';       // a Tuesday
const FSI = '\u2068';
const RLI = '\u2067';
const PDI = '\u2069';
const named = name => `${FSI}${name}${PDI}`;
const car = name => `${RLI}${name}${PDI}`;
const bare = text => String(text || '').replace(/[\u2066-\u2069\u200e\u200f]/g, '');

// The pinned words this file reads off the glass (all of them are pinned, word for word,
// in tests/transport.test.mjs).
const ENTRY = 'הסעות – שיבוץ לרכבים';
const TITLE = 'הסעות';
const SWITCH_ON = 'הפעלת הסעות במכשיר הזה';
const SWITCH_OFF = 'כיבוי הסעות במכשיר הזה';
const THIS_PHONE = 'פועל במכשיר הזה בלבד: לא מסונכרן, לא משותף עם הטלפונים האחרים, ולא נכלל בגיבוי.';
const REASON_NEEDED = 'צריך לכתוב סיבה';

// SYNTHETIC. Invented men and invented numbers.
const WORKERS = [
    { id: 'w_01', name: 'אחמד', active: true, dailyRate: 400, phone: '052-884-1930' },
    { id: 'w_02', name: 'מוחמד', active: true, dailyRate: 400, phone: '+972 54-123-4567' },
    { id: 'w_03', name: 'יוסי', active: true, dailyRate: 400, phone: '' },
    { id: 'w_04', name: 'סמיר', active: true, dailyRate: 400, phone: '0501112233' },
    { id: 'w_05', name: 'עלי', active: true, dailyRate: 400, phone: '0549998877' },
    { id: 'w_06', name: 'Ali Hassan', active: true, dailyRate: 400, phone: '0587654321' }
];
const PLACES = [
    { id: 'p_01', name: 'הרצליה', active: true },
    { id: 'p_02', name: 'חיפה', active: true },
    { id: 'p_03', name: 'פרדסיה', active: true }
];

// אחמד and מוחמד at הרצליה (מוחמד at חיפה too), יוסי and סמיר at חיפה, Ali Hassan at
// פרדסיה, עלי marked נעדר.
async function open(width, height, scheme) {
    const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme });
    const page = await context.newPage();
    const errors = [];
    const away = [];
    page.on('pageerror', error => errors.push(error.message));
    // The app itself asks for the Firebase SDK after boot (js/app.js) and the network guard
    // refuses it, as it does in every browser suite: that one host, the "failed to load"
    // line the browser prints for it and the sync layer's report of it are the guard at
    // work. Anything ELSE asked for off this machine, or said on the console, is counted.
    const sdk = url => /^https:\/\/www\.gstatic\.com\/firebasejs\//.test(url);
    page.on('console', message => {
        if (message.type() !== 'error') return;
        const said = message.text();
        if (/ERR_BLOCKED_BY_CLIENT/.test(said) || /^Sync error: .*firebase-adapter\.js/.test(said)) return;
        errors.push(`console: ${said}`);
    });
    context.on('request', request => {
        const host = new URL(request.url()).hostname;
        if (!['127.0.0.1', 'localhost', '[::1]', ''].includes(host) && !sdk(request.url())) away.push(request.url());
    });
    await page.goto(`${server.url}/index.html`, { waitUntil: 'load' });
    await page.waitForTimeout(350);
    await page.evaluate(([workers, places, day]) => {
        todayStr = () => day;
        State.schedule.workers = workers;
        State.schedule.places = places;
        const work = (id, place) => assignPlace(State.schedule, day, id, 'actual', place);
        work('w_01', 'p_01');
        work('w_02', 'p_01');
        work('w_02', 'p_02');
        work('w_03', 'p_02');
        work('w_04', 'p_02');
        work('w_06', 'p_03');
        markAbsent(State.schedule, day, 'w_05', 'actual');
        State.save();
        State.date = day;
        showView('day');
        render();
    }, [WORKERS, PLACES, DAY]);
    await page.waitForTimeout(200);
    return { page, context, errors, away };
}

const WA_BUTTON = 'button[onclick="showDayMessage()"]';
const visible = async (page, selector) => page.locator(selector).first().isVisible().catch(() => false);
const text = async (page, selector) => bare(await page.locator(selector).first().textContent());
const tab = (page, id) => page.locator(`#transportTabs [data-tk="tab:${id}"]`).click();
const tk = (page, key) => page.locator(`#transportPanel [data-tk="${key}"]`);
const trips = page => page.evaluate(day => {
    const all = transportDayOf(day).trips;
    return Object.keys(all).sort().map(v => `${v}=${all[v].driver || '?'}+[${all[v].passengers.join(',')}]`).join(' ');
}, DAY);
// What a card shows, read off the glass: the driver's line and the passengers' names.
const cardOf = (page, vehicleId) => page.evaluate(id => {
    const card = document.querySelector(`#transportBody .transport-card[data-vehicle="${id}"]`);
    if (!card) return null;
    const strip = value => String(value || '').replace(/[\u2066-\u2069]/g, '');
    return { name: strip(card.querySelector('.transport-vehicle-name').textContent),
        driver: strip(card.querySelector('[data-driver] .transport-name').textContent),
        riders: [...card.querySelectorAll('.transport-person[data-tk^="w:"] .transport-name')].map(node => strip(node.textContent)) };
}, vehicleId);

// The record, and everything queued for the cloud, as bytes.
const recordBytes = page => page.evaluate(() => {
    const out = {};
    Object.keys(localStorage).sort().forEach(key => {
        if (key === 'scheduleData:v2' || (typeof FarkadSync !== 'undefined' && FarkadSync.isQueueKey && FarkadSync.isQueueKey(key))) {
            out[key] = localStorage.getItem(key);
        }
    });
    return JSON.stringify(out);
});

// THE FLOORS, on whatever the panel is showing: 44px both ways for everything a finger
// lands on, 16px for every field, nothing running off the side, and one filled button.
async function floors(page, label) {
    const found = await page.evaluate(() => {
        const panel = document.getElementById('transportPanel');
        const seen = node => {
            const box = node.getBoundingClientRect();
            const style = getComputedStyle(node);
            return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const targets = [...panel.querySelectorAll('button, a[href], select, summary, input, textarea')].filter(seen);
        const small = targets.map(node => ({ node, box: node.getBoundingClientRect() }))
            .filter(({ box }) => box.width < 43.5 || box.height < 43.5)
            .map(({ node, box }) => `${node.tagName} ${String(node.dataset.tk || node.id || node.textContent).slice(0, 24)} ${Math.round(box.width)}x${Math.round(box.height)}`);
        const fields = [...panel.querySelectorAll('select, input, textarea')].filter(seen)
            .filter(node => parseFloat(getComputedStyle(node).fontSize) < 16)
            .map(node => `${node.dataset.tk || node.id} ${getComputedStyle(node).fontSize}`);
        const body = document.getElementById('transportBody');
        const outside = targets.filter(node => {
            const box = node.getBoundingClientRect();
            return box.left < -0.5 || box.right > window.innerWidth + 0.5;
        }).map(node => String(node.dataset.tk || node.id));
        // Filled = painted in the accent. The tonal look and WhatsApp's green are not it.
        const probe = document.createElement('span');
        probe.style.cssText = 'position:absolute;background:var(--accent)';
        panel.appendChild(probe);
        const accent = getComputedStyle(probe).backgroundColor;
        probe.remove();
        const filled = [...panel.querySelectorAll('button, a[href]')].filter(seen)
            .filter(node => getComputedStyle(node).backgroundColor === accent)
            .map(node => String(node.dataset.tk || node.id));
        return { count: targets.length, small, fields, outside, filled,
            bodyFits: body.scrollWidth <= body.clientWidth + 1,
            pageFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 };
    });
    given(`${label}: there is something on the panel to measure`, found.count > 0);
    check(`${label}: nothing a finger lands on is under 44px, either way`, found.small.length === 0, found.small.join(' | '));
    check(`${label}: no field is under 16px`, found.fields.length === 0, found.fields.join(' | '));
    check(`${label}: nothing scrolls sideways or runs off the side`,
        found.bodyFits && found.pageFits && found.outside.length === 0,
        JSON.stringify({ body: found.bodyFits, page: found.pageFits, outside: found.outside }));
    check(`${label}: at most one filled button`, found.filled.length <= 1, found.filled.join(' | '));
    return found;
}

// The app's own question (js/ui/ask.js), answered the way a person does.
async function answer(page, value) {
    await page.locator('#askModal').waitFor({ state: 'visible' });
    if (value !== undefined) await page.locator('#askInput').fill(value);
    await page.locator('#askOk').click();
}

async function shot(page, name) {
    if (!SHOTS) return;
    await page.evaluate(() => { document.getElementById('transportBody').scrollTop = 0; });
    await page.screenshot({ path: join(SHOTS, `impl-${name}.jpg`), type: 'jpeg', quality: 80 });
}

async function evening(width, height, scheme) {
    const at = `${width}x${height} ${scheme}`;
    const shots = Boolean(SHOTS) && width === 440 && scheme === 'dark';
    const { page, context, errors, away } = await open(width, height, scheme);

    // ------------------------------------------------------------ off by default
    suite(`${at}: off until this phone turns it on`);
    await page.locator(WA_BUTTON).click();
    await page.locator('#shareModal').waitFor({ state: 'visible' });
    check('the WhatsApp dialog has the seder\'s row', await visible(page, '#sederEntry'));
    same('and no entry for transport', await page.locator('#transportEntry').count(), 0);
    await page.keyboard.press('Escape');
    same('nothing of it is on the disk', await page.evaluate(() =>
        Object.keys(localStorage).filter(key => /transport/i.test(key))), []);
    same('and the day screen has no control of it',
        await page.locator('#dayView [id^="transport"], #dayView [class*="transport"]').count(), 0);

    // ------------------------------------------------------------ the switch, in ⋯
    suite(`${at}: the switch in ⋯`);
    await page.locator('#settingsBtn').click();
    await page.locator('#transportSwitchCard').scrollIntoViewIfNeeded();
    // MOVED IN v172, and the move is the point: the settings sheet was put in strict order
    // and the switch is now the last row of «כללי», not a card at the foot of «מכשיר ועזרה»
    // under the technical report. It is a row that is shut when the sheet opens - nothing
    // on it is ever urgent - so it is opened by a tap, as a person opens it.
    check('the card is the last row of «כללי»', await page.evaluate(() => {
        const card = document.getElementById('transportSwitchCard');
        const section = document.getElementById('settingsDailySection');
        return Boolean(card && section && section.lastElementChild === card
            && card.tagName === 'DETAILS' && !card.closest('#settingsHelpCards'));
    }));
    same('shut until it is tapped', await page.evaluate(() => document.getElementById('transportSwitchCard').open), false);
    await page.locator('#transportSwitchCard > summary').click();
    check('it says this phone only, not shared, not in a backup',
        (await text(page, '#transportSwitchCard')).includes(THIS_PHONE));
    same('its button offers to turn it on', await text(page, '#transportSwitch'), SWITCH_ON);
    const switchBox = await page.locator('#transportSwitch').boundingBox();
    check('a finger wide and tall', switchBox && switchBox.width >= 44 && switchBox.height >= 44, JSON.stringify(switchBox));
    await page.locator('#transportSwitch').click();
    same('turned on, it offers to turn it off', await text(page, '#transportSwitch'), SWITCH_OFF);
    same('and the preference is on this phone\'s disk', await page.evaluate(() => localStorage.getItem('farkadTransport:enabled')), '1');
    await page.evaluate(() => closeSettings());

    // ------------------------------------------------------------ the one entry
    suite(`${at}: one entry, in the WhatsApp dialog`);
    const before = await recordBytes(page);
    given('the record is on the disk', before.includes('scheduleData:v2'));
    await page.locator(WA_BUTTON).click();
    await page.locator('#shareModal').waitFor({ state: 'visible' });
    same('the entry is there, by its word', await text(page, '#transportEntry'), ENTRY);
    check('directly under the seder\'s row', await page.evaluate(() =>
        document.getElementById('sederEntry').nextElementSibling === document.getElementById('transportEntry')));
    const entryBox = await page.locator('#transportEntry').boundingBox();
    check('a finger tall, and the width of the dialog\'s row', entryBox && entryBox.height >= 44 && entryBox.width >= 200,
        JSON.stringify(entryBox));
    same('still nothing new on the day screen',
        await page.locator('#dayView [id^="transport"], #dayView [class*="transport"]').count(), 0);
    await page.locator('#transportEntry').click();
    await page.locator('#transportPanel.open').waitFor({ state: 'visible' });
    await page.waitForTimeout(80);
    check('the WhatsApp dialog stepped aside', !(await visible(page, '#shareModal')));
    same('the panel is entered at its heading', await page.evaluate(() => document.activeElement && document.activeElement.id), 'transportTitle');
    same('which is the feature\'s name', await text(page, '#transportTitle'), TITLE);
    same('with the day it is about', await text(page, '#transportContext'), 'יום שלישי 10/11/2026');
    check('it covers the screen', await page.evaluate(() => {
        const box = document.getElementById('transportPanel').getBoundingClientRect();
        return box.top <= 0 && box.left <= 0 && box.right >= window.innerWidth && box.bottom >= window.innerHeight;
    }));
    same('the plan opens as a draft', await page.locator('#transportPlanStatus').getAttribute('data-state'), 'draft');
    await floors(page, 'the empty plan');

    // ------------------------------------------------------------ עובדים
    suite(`${at}: עובדים - areas, and who may drive what`);
    await tab(page, 'workers');
    same('the list of areas starts empty', await page.locator('#transportAreas .transport-area').count(), 0);
    same('the men with a site today, and nobody else',
        await page.locator('#transportBody .transport-card[data-worker]').evaluateAll(cards => cards.map(card => card.dataset.worker)),
        ['w_01', 'w_02', 'w_03', 'w_04', 'w_06']);
    check('a man on two sites is told which one the ride is to',
        (await text(page, '.transport-card[data-worker="w_02"]')).includes('רשום היום גם בחיפה. ההסעה לאתר הראשון.'));
    await page.locator('#transportAddArea').click();
    await page.locator('#askModal').waitFor({ state: 'visible' });
    check('the app\'s own question opens OVER the panel', await page.evaluate(() => {
        const ok = document.getElementById('askOk').getBoundingClientRect();
        const top = document.elementFromPoint(ok.left + ok.width / 2, ok.top + ok.height / 2);
        return top === document.getElementById('askOk');
    }));
    await page.locator('#askOk').click();
    check('an area with no name is not added: the question stays, with the reason',
        (await visible(page, '#askModal')) && (await text(page, '#askError')) === 'צריך לכתוב שם');
    await answer(page, 'צפון');
    await page.locator('#transportAddArea').click();
    await answer(page, 'דרום');
    same('two areas, as typed', await page.locator('#transportAreas .transport-area .transport-name').allTextContents(), ['צפון', 'דרום']);

    await page.locator('[data-worker-area="w_01"]').selectOption({ label: 'אזור איסוף: צפון' });
    await page.locator('[data-worker-area="w_04"]').selectOption({ label: 'אזור איסוף: דרום' });
    await page.locator('[data-drive="w_01"]').click();
    same('אחמד may drive, every vehicle', await text(page, '[data-drive="w_01"]'), 'רשאי לנהוג · כל הרכבים');
    await page.locator('[data-drive="w_04"]').click();
    await page.locator('[data-drives-all="w_04"]').click();
    await page.locator('.transport-card[data-worker="w_04"] [data-drives="tv_02"]').click();
    same('סמיר may drive one vehicle only', await text(page, '[data-drive="w_04"]'), 'רשאי לנהוג · רכב אחד');
    // The other three men's areas, by the same function the selects call.
    await page.evaluate(() => {
        const areas = transportSettings().areas;
        transportSetWorker('w_02', { area: areas[0].id });
        transportSetWorker('w_03', { area: areas[1].id });
        transportSetWorker('w_06', { area: areas[1].id });
        renderTransportIfOpen();
    });
    same('the settings are this phone\'s own record, not the roster', await page.evaluate(() => {
        const kept = JSON.parse(localStorage.getItem('farkadTransport:settings'));
        return [kept.workers.w_01.canDrive, kept.workers.w_01.drives, kept.workers.w_04.drives,
            Object.keys(State.schedule.workers[0]).sort().join()];
    }), [true, 'all', ['tv_02'], 'active,dailyRate,id,name,phone']);
    await floors(page, 'עובדים');
    if (shots) await shot(page, '3-workers-440-dark');

    // ------------------------------------------------------------ רכבים
    suite(`${at}: רכבים - which go out today, and the list itself`);
    await tab(page, 'vehicles');
    same('the seven, by the owner\'s names', await page.locator('#transportBody .transport-vehicle-name').allTextContents(),
        ['טויוטה קורולה 2013', 'טויוטה קורולה 2016', 'BYD סיל U 2025', 'BYD אטו 3 2025', 'פולקסווגן 2018', 'סוואנה 2010', 'ליפמוטור C10 2026']);
    same('all available to begin with', await text(page, '#transportVehiclesSummary'), 'זמינים 7 מתוך 7 · 39 מושבים');
    for (const id of ['tv_03', 'tv_04', 'tv_05', 'tv_06', 'tv_07']) await page.locator(`[data-avail="${id}"]`).click();
    same('five marked as not going out', await text(page, '#transportVehiclesSummary'), 'זמינים 2 מתוך 7 · 10 מושבים');
    same('and each says so', await text(page, '[data-avail="tv_05"]'), 'לא זמין היום');
    await page.locator('#transportAddVehicle').click();
    await answer(page, 'מיניבוס לבדיקה');
    await page.locator('#askInput').waitFor({ state: 'visible' });
    await page.locator('#askInput').fill('1');
    await page.locator('#askOk').click();
    same('a seat count that is not one is refused, with the reason', await text(page, '#askError'), 'מספר בין 2 ל-20');
    await answer(page, '12');
    same('a vehicle is added to the list', (await page.locator('#transportBody .transport-vehicle-name').allTextContents()).slice(-1),
        ['מיניבוס לבדיקה']);
    const addedId = await page.evaluate(() => transportSettings().vehicles.slice(-1)[0].id);
    check('with an id of this feature\'s own', /^tv_/.test(addedId), addedId);
    await page.locator(`.transport-card[data-vehicle="${addedId}"] summary`).click();
    await floors(page, 'רכבים, with a vehicle\'s edit row open');
    await tk(page, `rename:${addedId}`).click();
    await answer(page, 'מיניבוס');
    same('it is renamed', (await page.locator('#transportBody .transport-vehicle-name').allTextContents()).slice(-1), ['מיניבוס']);
    await page.locator(`.transport-card[data-vehicle="${addedId}"] summary`).click();
    await tk(page, `retire:${addedId}`).click();
    await answer(page);
    same('and retired: it leaves the list', await page.locator('#transportBody .transport-vehicle-name').count(), 7);
    if (shots) await shot(page, '2-vehicles-440-dark');

    // ------------------------------------------------------------ שיבוץ
    suite(`${at}: שיבוץ - suggest, move, driver, lock`);
    await tab(page, 'plan');
    same('before anything is planned, «הצעת שיבוץ» is the one filled button',
        (await floors(page, 'the plan, empty')).filled, ['suggest']);
    await page.locator('#transportSuggest').click();
    same('the suggestion: each area\'s driver takes his own car', await trips(page), 'tv_01=w_01+[w_02] tv_02=w_04+[w_03,w_06]');
    same('drawn as it is kept', [await cardOf(page, 'tv_01'), await cardOf(page, 'tv_02')], [
        { name: 'טויוטה קורולה 2013', driver: 'נהג: אחמד', riders: ['מוחמד'] },
        { name: 'טויוטה קורולה 2016', driver: 'נהג: סמיר', riders: ['יוסי', 'Ali Hassan'] }]);
    same('it is said', await text(page, '#transportLive'), 'הוצע שיבוץ לכולם');
    check('a vehicle that is not going out has no card', (await cardOf(page, 'tv_05')) === null);
    check('a site is drawn in the site\'s own colour', await page.evaluate(() => {
        const chip = document.querySelector('#transportBody .transport-card[data-vehicle="tv_01"] .transport-site');
        return Boolean(chip) && chip.style.background.includes('--site-1');
    }));
    same('with a plan to accept, «אישור התוכנית» is the one filled button',
        (await floors(page, 'the plan, suggested')).filled, ['accept']);

    await tk(page, 'w:w_06').click();
    same('a tapped man is the one being moved', await text(page, '.transport-movebar > .transport-name'), 'מעבירים את Ali Hassan – בוחרים רכב');
    check('his own car offers no "move here"', (await page.locator('[data-move-to="tv_02"]').count()) === 0);
    await floors(page, 'the plan, a man being moved');
    await page.locator('[data-move-to="tv_01"]').click();
    same('a second tap on a car moves him there', await trips(page), 'tv_01=w_01+[w_02,w_06] tv_02=w_04+[w_03]');
    check('and the bar is gone', (await page.locator('.transport-movebar').count()) === 0);

    await page.locator('[data-driver="tv_01"]').click();
    same('the driver list of the first car offers ONLY the man who may drive it',
        await page.locator('.transport-picker [data-pick]').evaluateAll(nodes => nodes.map(node => node.dataset.pick)), ['w_01', '']);
    same('headed with the car\'s name', await text(page, '.transport-picker-title'), 'מי נוהג בטויוטה קורולה 2013?');
    await page.keyboard.press('Escape');
    check('Escape steps back out of the list, not out of the panel',
        (await page.locator('.transport-picker').count()) === 0 && (await visible(page, '#transportPanel.open')));
    await page.locator('[data-driver="tv_02"]').click();
    same('the second car offers both men who may drive it, and nobody else',
        await page.locator('.transport-picker [data-pick]').evaluateAll(nodes => nodes.map(node => node.dataset.pick)), ['w_01', 'w_04', '']);
    await floors(page, 'the plan, a driver list open');
    await page.locator('.transport-picker [data-pick="w_01"]').click();
    same('a driver is picked: he leaves his seat, and the man who drove stays as a passenger',
        await trips(page), 'tv_01=?+[w_02,w_06] tv_02=w_01+[w_03,w_04]');
    check('the car left without a driver is named, live',
        (await text(page, '#transportErrors')).includes('טויוטה קורולה 2013: אין נהג'));
    await page.locator('#transportSuggest').click();
    given('suggest puts the plan back', (await trips(page)) === 'tv_01=w_01+[w_02] tv_02=w_04+[w_03,w_06]', await trips(page));

    // Lock the second car as it is by hand, then ask for a suggestion.
    await tk(page, 'w:w_06').click();
    await page.locator('[data-move-to="tv_01"]').click();
    await page.locator('[data-lock-vehicle="tv_02"]').click();
    same('a locked car says so', await text(page, '[data-lock-vehicle="tv_02"]'), 'שחרור הרכב');
    check('its driver cannot be changed', await page.locator('[data-driver="tv_02"]').isDisabled());
    await page.locator('#transportSuggest').click();
    same('suggest respects the lock: without it Ali Hassan would be back in that car',
        await trips(page), 'tv_01=w_01+[w_02,w_06] tv_02=w_04+[w_03]');
    await tk(page, 'w:w_03').click();
    same('a man in a locked car cannot be moved, and is told why', await text(page, '.transport-movebar > .transport-name'), 'הרכב נעול');
    await tk(page, 'cancelMove').click();
    if (shots) await shot(page, '1-plan-440-dark');

    // ------------------------------------------------------------ accepting
    suite(`${at}: accepting - a partial plan only with a reason, and versions`);
    await tk(page, 'w:w_06').click();
    await tk(page, 'unseat').click();
    check('a man taken out of his car is an open item, live',
        (await text(page, '#transportErrors')).includes('Ali Hassan בלי מקום ברכב')
        && (await text(page, '#transportUnseated')).includes('בלי מקום ברכב (1)'));
    await page.locator('#transportAccept').click();
    await page.locator('#askModal').waitFor({ state: 'visible' });
    check('accepting a partial plan asks why, and lists what is open',
        (await text(page, '#askMessage')).includes('התוכנית חלקית: דבר אחד לא סגור. אפשר לאשר רק עם סיבה.')
        && (await text(page, '#askMessage')).includes('Ali Hassan בלי מקום ברכב')
        && (await text(page, '#askMessage')).includes('למה מאשרים תוכנית חלקית?'));
    same('the button says what it does', await text(page, '#askOk'), 'אישור כתוכנית חלקית');
    await page.keyboard.press('Escape');
    check('Escape answers the question and NOT the panel behind it: one key, one step back',
        !(await visible(page, '#askModal')) && (await visible(page, '#transportPanel.open'))
        && (await page.evaluate(day => transportDayOf(day).accepted.length, DAY)) === 0);
    same('and the keyboard is back on the button that asked',
        await page.evaluate(() => document.activeElement && document.activeElement.id), 'transportAccept');
    await page.locator('#transportAccept').click();
    await page.locator('#askModal').waitFor({ state: 'visible' });
    await page.locator('#askOk').click();
    check('with no reason it is REFUSED: the question stays, with the reason under the field',
        (await visible(page, '#askModal')) && (await text(page, '#askError')) === REASON_NEEDED);
    same('and no version was made', await page.evaluate(day => transportDayOf(day).accepted.length, DAY), 0);
    await answer(page, 'חסר רכב אחד הבוקר');
    same('with a typed reason: version 1', await text(page, '#transportPlanStatus strong'), 'גרסה 1 מאושרת');
    check('the history says it is partial, and why',
        (await text(page, '#transportHistory [data-version="1"]')).includes('חלקית – חסר רכב אחד הבוקר'));
    check('with nothing changed there is nothing to accept',
        (await page.locator('#transportAccept').isDisabled()) && (await text(page, '#transportAccept')) === 'אין שינויים לאשר');

    await tk(page, 'w:w_06').click();
    await page.locator('[data-move-to="tv_01"]').click();
    same('an edit after acceptance is a draft again', await text(page, '#transportPlanStatus strong'), 'יש שינויים שלא אושרו מאז גרסה 1');
    await page.locator('#transportAccept').click();
    await page.locator('#askModal').waitFor({ state: 'visible' });
    same('a whole plan is asked once, with no reason', [await text(page, '#askMessage'), await visible(page, '#askInput')],
        ['התוכנית מלאה. לאשר אותה?', false]);
    await answer(page);
    same('version 2', await text(page, '#transportPlanStatus strong'), 'גרסה 2 מאושרת');
    same('the history holds both, the newest first',
        await page.locator('#transportHistory [data-version]').evaluateAll(nodes => nodes.map(node => node.dataset.version)), ['2', '1']);
    check('version 2 says how many men changed',
        (await text(page, '#transportHistory [data-version="2"]')).includes('עובד אחד שונה לעומת גרסה 1'));
    await floors(page, 'the plan, accepted');

    // ------------------------------------------------------------ הודעות
    suite(`${at}: הודעות - each driver's message, the link, the marks`);
    await tab(page, 'messages');
    same('a card for each car of the accepted version, in the list\'s order',
        await page.locator('#transportBody [data-message]').evaluateAll(cards => cards.map(card => card.dataset.message)), ['tv_01', 'tv_02']);
    const message = [`שלום ${named('אחמד')},`, 'הסעה ליום שלישי 10/11/2026:', 'עדכון מספר 1 לתוכנית.',
        `רכב: ${car('טויוטה קורולה 2013')}`, `איסוף: ${named('צפון')}`, 'נוסעים (2):',
        `- ${named('מוחמד')} – ${named('הרצליה')}`, `- ${named('Ali Hassan')} – ${named('פרדסיה')}`,
        `יעדים: ${named('הרצליה')}, ${named('פרדסיה')}`].join('\n');
    same('the message on the card is the message', await page.locator('[data-message="tv_01"] .transport-message').textContent(), message);
    const link = page.locator('a[data-wa="tv_01"]');
    same('the link is a real link with the whole address on it, opened in its own tab',
        [await link.getAttribute('href'), await link.getAttribute('target'), (await link.getAttribute('rel')).includes('noopener')],
        [`https://wa.me/972528841930?text=${encodeURIComponent(message)}`, '_blank', true]);
    same('it is WhatsApp\'s green, and it says what it does', [await page.evaluate(() => {
        const probe = document.createElement('span');
        probe.style.cssText = 'position:absolute;background:var(--wa)';
        document.body.appendChild(probe);
        const wa = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return getComputedStyle(document.querySelector('a[data-wa="tv_01"]')).backgroundColor === wa;
    }), await text(page, 'a[data-wa="tv_01"]')], [true, 'פתיחה בוואטסאפ']);
    same('the other driver\'s goes to the other driver',
        (await page.locator('a[data-wa="tv_02"]').getAttribute('href')).split('?')[0], 'https://wa.me/972501112233');
    same('nothing is marked yet', await page.locator('[data-message="tv_01"]').getAttribute('data-mark'), 'none');
    await floors(page, 'הודעות');

    // The tap, with its navigation prevented HERE: what is measured is the app's own mark.
    await page.evaluate(() => document.querySelector('a[data-wa="tv_01"]')
        .addEventListener('click', event => event.preventDefault(), { capture: true }));
    await link.click();
    await page.waitForTimeout(1750);
    same('a tap on the link marks it opened - never sent',
        [await page.locator('[data-message="tv_01"]').getAttribute('data-mark'), await text(page, '[data-message="tv_01"] .transport-mark')],
        ['opened', 'נפתח בוואטסאפ']);
    same('the other card is untouched', await page.locator('[data-message="tv_02"]').getAttribute('data-mark'), 'none');
    await page.locator('[data-sent="tv_01"]').click();
    check('«סימנתי שנשלח» is the person\'s own mark, with the time',
        (await page.locator('[data-message="tv_01"]').getAttribute('data-mark')) === 'sent'
        && /^סומן כנשלח ב-\d\d:\d\d$/.test(await text(page, '[data-message="tv_01"] .transport-mark')));
    same('and can be taken back', await text(page, '[data-sent="tv_01"]'), 'ביטול הסימון');
    if (shots) await shot(page, '4-messages-440-dark');

    // A later version that changes that driver's words.
    await tab(page, 'plan');
    await page.locator('[data-lock-vehicle="tv_02"]').click();
    await tk(page, 'w:w_03').click();
    await page.locator('[data-move-to="tv_01"]').click();
    await tab(page, 'messages');
    check('while the draft differs from what was accepted, the messages say which version they are',
        (await text(page, '#transportDraftDiffers')) === 'ההודעות לפי גרסה 2. יש שינויים שלא אושרו.'
        && (await page.locator('[data-message="tv_01"]').getAttribute('data-mark')) === 'sent');
    await tab(page, 'plan');
    await page.locator('#transportAccept').click();
    await answer(page);
    await tab(page, 'messages');
    same('a message that changed un-believes its mark',
        [await page.locator('[data-message="tv_01"]').getAttribute('data-mark'), await text(page, '[data-message="tv_01"] .transport-mark')],
        ['changed', 'ההודעה השתנתה מאז שסומנה – כדאי לשלוח שוב']);
    check('and the new message names the man who joined',
        (await page.locator('[data-message="tv_01"] .transport-message').textContent()).includes(`- ${named('יוסי')} – ${named('חיפה')}`));

    // ------------------------------------------------------------ the record, and the way out
    suite(`${at}: the record is untouched, and the way out`);
    same('the day record and everything queued for the cloud are byte for byte what they were',
        await recordBytes(page), before);
    same('everything it wrote is under its own three names', await page.evaluate(() =>
        Object.keys(localStorage).filter(key => /transport/i.test(key)).sort()),
    ['farkadTransport:day:2026-11-10', 'farkadTransport:enabled', 'farkadTransport:settings']);
    await page.keyboard.press('Escape');
    check('Escape closes the panel', !(await visible(page, '#transportPanel')));
    check('and the keyboard is back on the button the evening started from', await page.evaluate(selector =>
        document.activeElement === document.querySelector(selector), WA_BUTTON));
    same('nothing was asked of WhatsApp, or of anywhere else off this machine', away, []);

    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(400);
    await page.evaluate(day => { todayStr = () => day; State.date = day; render(); }, DAY);
    await page.locator(WA_BUTTON).click();
    await page.locator('#transportEntry').click();
    await page.locator('#transportPanel.open').waitFor({ state: 'visible' });
    same('after a reload it is still on, with the three versions and the plan',
        [await text(page, '#transportPlanStatus strong'), await page.locator('#transportHistory [data-version]').count(), await trips(page)],
        ['גרסה 3 מאושרת', 3, 'tv_01=w_01+[w_02,w_06,w_03] tv_02=w_04+[]']);
    await page.locator('#transportClose').click();
    check('the back button closes it too', !(await visible(page, '#transportPanel')));

    await page.locator('#settingsBtn').click();
    // v172: the row is shut again at every opening of the sheet; one tap opens it.
    await page.locator('#transportSwitchCard > summary').click();
    await page.locator('#transportSwitch').click();
    await page.evaluate(() => closeSettings());
    same('turned off in ⋯, the entry is gone from the WhatsApp dialog', await page.locator('#transportEntry').count(), 0);
    check('and the plans stay on the disk for when it is turned on again', await page.evaluate(() =>
        localStorage.getItem('farkadTransport:enabled') === null && localStorage.getItem('farkadTransport:day:2026-11-10') !== null));
    same('the record is still what it was', await recordBytes(page), before);

    same('no page error and no console error', errors, []);
    same('and still no request off this machine', away, []);
    await context.close();
}

for (const [width, height] of [[440, 956], [375, 667]]) {
    for (const scheme of ['dark', 'light']) await evening(width, height, scheme);
}

await browser.close();
await server.close();
report();
