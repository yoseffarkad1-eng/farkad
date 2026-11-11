// «מה חדש» - what changed and where it is - in a real Chromium, on a phone with a touch screen.
//
//   node tests/whatsnew.browser.mjs
//
// The rule (what a phone is owed), the note it keeps and every word are measured in
// tests/whatsnew.test.mjs. This is the part only a page can answer, at 440x956 and
// 375x667, dark and light:
//
//   - a first install: no line, nothing on the glass, and the phone noted;
//   - a phone with a crew and no note: ONE quiet line in the banner area, the last of the
//     banners, one line tall, its two buttons a finger wide - and nothing else: no
//     dialog, nothing over the day;
//   - never under somebody's hands: with a dialog open, or a field being typed in, the
//     line waits and appears when that ends;
//   - its button opens the card: what is owed, newest first, each item a title, one
//     sentence, where it is and - for most - «הראה לי»;
//   - seen: the card closed by its button, by Escape, or the line put away by its ✕ - and
//     a reload then shows nothing; unread, a reload offers it again;
//   - the row «מה חדש» in ⋯ ← מכשיר ועזרה ← עדכון וגרסה: everything, seen or not, OVER the
//     sheet;
//   - EVERY «הראה לי», pressed: it lands on the screen it names, and the whole disk but
//     the note is byte for byte what it was - and with הסעות off the rides' items lead to
//     the row where it is turned on, which is NOT turned on;
//   - the floors: 44px both ways, no text under 16px on the card, nothing off the side -
//     and again at 200% text.
//
// The page boots on the build js/app.js declares; what is expected is worked out from
// that build, so this file does not go red when the stamps move.
//
// WHATSNEW_SHOTS=<directory> also writes JPEGs (440x956, dark). Synthetic names only.
// NOT a real phone.

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
const SHOTS = process.env.WHATSNEW_SHOTS || '';

const EVENING = '2026-11-10T19:30:00+02:00';
const DAY = '2026-11-10';
const KEY = 'farkadWhatsNewSeen';
const bare = text => String(text || '').replace(/[⁦-⁩‎‏]/g, '');

// Pinned word for word in tests/whatsnew.test.mjs; read off the glass here.
const LINE = '🆕 יש חדש באפליקציה';
const OPEN = 'מה חדש';
const SINCE = 'מה שנוסף מאז העדכון האחרון שראית, מהחדש לישן.';
const ALL = 'כל מה שנוסף לאחרונה, מהחדש לישן.';
const SHOW = 'הראה לי';
// The builds that have news, newest first (tests/whatsnew.test.mjs pins the block).
const NEWS = [189, 188, 187, 186, 184, 183, 182, 181, 180, 179, 174];

// SYNTHETIC. Fourteen invented men on three invented sites.
const NAMES = ['אחמד', 'מוחמד', 'יוסי', 'סמיר', 'עלי', 'Ali Hassan', 'ראמי', 'דוד', 'עבד אל-רחמן', 'מחמוד', 'חאלד', 'נביל', 'זיאד', 'כרים'];
const WORKERS = NAMES.map((name, i) => ({ id: `w_${String(i + 1).padStart(2, '0')}`, name, active: true, dailyRate: 400, phone: '' }));
const PLACES = [{ id: 'p_01', name: 'הרצליה', active: true }, { id: 'p_02', name: 'חיפה', active: true }, { id: 'p_03', name: 'פרדסיה', active: true }];

// A phone. It boots EMPTY - which is a first install, and is measured as one - and is then
// given a crew and, by `note`, what it has seen: undefined leaves the note the first
// start wrote, null removes it (a phone that was here before this feature), a string is
// written as it is. Then the app is started again, as the phone would start it.
async function open(width, height, scheme, options = {}) {
    const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, hasTouch: true,
        isMobile: true, timezoneId: 'Asia/Jerusalem', locale: 'he-IL' });
    const page = await context.newPage();
    const errors = [];
    const away = [];
    page.on('pageerror', error => errors.push(error.message));
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
    await page.clock.install({ time: new Date(EVENING) });
    await page.goto(`${server.url}/index.html`, { waitUntil: 'load' });
    await page.waitForTimeout(350);
    const first = await page.evaluate(key => ({ note: localStorage.getItem(key), build: APP_VERSION,
        line: getComputedStyle(document.getElementById('whatsNewBanner')).display,
        card: document.getElementById('whatsNewModal').style.display || 'none' }), KEY);
    if (options.crew !== false) {
        await page.evaluate(([workers, places, day, note, key]) => {
            State.schedule.workers = workers;
            State.schedule.places = places;
            workers.slice(0, 12).forEach((worker, i) => assignPlace(State.schedule, day, worker.id, 'actual', places[i % 3].id));
            State.save();
            if (note === null) localStorage.removeItem(key);
            else if (typeof note === 'string') localStorage.setItem(key, note);
        }, [WORKERS, PLACES, DAY, options.note === undefined ? undefined : options.note, KEY]);
        await page.reload({ waitUntil: 'load' });
        await page.waitForTimeout(450);
    }
    return { page, context, errors, away, first, build: Number(first.build.slice(1)) };
}

const visible = async (page, selector) => page.locator(selector).first().isVisible().catch(() => false);
const text = async (page, selector) => bare(await page.locator(selector).first().textContent());
const noteOf = page => page.evaluate(key => localStorage.getItem(key), KEY);
const seenNote = build => JSON.stringify({ version: 1, build: `v${build}` });
const owedOn = (build, seen) => NEWS.filter(n => n <= build && n > (seen || 0)).map(n => `v${n}`);
const listed = page => page.evaluate(() => [...document.querySelectorAll('#whatsNewList .whatsnew-build')].map(node => node.dataset.build));
// Every key on the disk but the note, as bytes.
const diskBut = (page, ...skip) => page.evaluate(keys => JSON.stringify(Object.keys(localStorage).sort()
    .filter(key => !keys.includes(key)).map(key => [key, localStorage.getItem(key)])), skip);
const shot = async (page, name) => {
    if (!SHOTS) return;
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(SHOTS, `${name}.jpg`), type: 'jpeg', quality: 80 });
};

// THE FLOORS on the card (or on the line): everything a finger lands on 44px both ways, no
// text under 16px, nothing off the side, the page not scrolling sideways.
async function floors(page, selector, label) {
    const found = await page.evaluate(sel => {
        const host = document.querySelector(sel);
        const seen = node => { const box = node.getBoundingClientRect(); const style = getComputedStyle(node);
            return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'; };
        const name = node => String(node.id || node.textContent).slice(0, 24);
        const targets = [...host.querySelectorAll('button, a[href]')].filter(seen);
        const small = targets.map(node => ({ node, box: node.getBoundingClientRect() }))
            .filter(({ box }) => box.width < 43.5 || box.height < 43.5).map(({ node, box }) => `${name(node)} ${Math.round(box.width)}x${Math.round(box.height)}`);
        const texts = [...host.querySelectorAll('p, span, h3, h4, button')].filter(seen)
            .filter(node => [...node.childNodes].some(child => child.nodeType === 3 && child.textContent.trim()))
            .filter(node => parseFloat(getComputedStyle(node).fontSize) < 16).map(name);
        const outside = [host, ...host.querySelectorAll('*')].filter(seen).filter(node => {
            const box = node.getBoundingClientRect();
            return box.left < -0.5 || box.right > window.innerWidth + 0.5;
        }).map(name);
        return { count: targets.length, small, texts, outside,
            page: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 };
    }, selector);
    given(`${label}: there is something on the glass to measure`, found.count > 0);
    check(`${label}: nothing a finger lands on is under 44px, either way`, found.small.length === 0, found.small.join(' | '));
    check(`${label}: no text under 16px`, found.texts.length === 0, found.texts.join(' | '));
    check(`${label}: nothing runs off the side and the page does not scroll sideways`, found.outside.length === 0 && found.page,
        JSON.stringify({ outside: found.outside.slice(0, 4), page: found.page }));
}

// tests/mobile.test.mjs says why the cascade is doubled rather than each node.
const doubleEveryFontSize = page => page.evaluate(() => {
    const out = [];
    const walk = (rules, wrap) => {
        for (const rule of rules) {
            if (rule.type === 4 || rule.type === 12) {
                const head = rule.type === 4 ? `@media ${rule.media.mediaText}` : `@supports ${rule.conditionText}`;
                walk(rule.cssRules, said => wrap(`${head}{${said}}`));
                continue;
            }
            if (rule.type !== 1 || !rule.style) continue;
            const raw = rule.style.getPropertyValue('font-size');
            if (!raw || !/^[\d.]+px$/.test(raw.trim())) continue;
            wrap(`${rule.selectorText}{font-size:${parseFloat(raw) * 2}px !important;}`);
        }
    };
    for (const sheet of document.styleSheets) {
        let rules = null;
        try { rules = sheet.cssRules; } catch (error) { rules = null; }
        if (rules) walk(rules, said => out.push(said));
    }
    out.unshift('html{font-size:32px !important;}');
    const style = document.createElement('style');
    style.textContent = out.join('\n');
    document.head.appendChild(style);
    return out.length;
});

// ================================================================== the line and the card, four phones

for (const [width, height, scheme] of [[440, 956, 'dark'], [375, 667, 'dark'], [440, 956, 'light'], [375, 667, 'light']]) {
    const where = `${width}x${height} ${scheme}`;
    const shots = width === 440 && scheme === 'dark';
    const { page, context, errors, away, first, build } = await open(width, height, scheme, { note: null });

    suite(`${where}: a first install is told nothing`);
    given('the page declares a build', Number.isInteger(build) && build >= 186, first.build);
    same('the very first start, on an empty phone: no line, no card', [first.line, first.card], ['none', 'none']);
    same('and the phone is noted as having seen the build it started on', first.note, seenNote(build));

    suite(`${where}: a phone that was here before gets one quiet line`);
    const owed = owedOn(build, 0);
    given('this build has news to tell', owed.length > 0);
    const line = await page.evaluate(() => {
        const banner = document.getElementById('whatsNewBanner');
        const box = banner.getBoundingClientRect();
        const banners = [...document.querySelectorAll('.app > .banner, .banner')].filter(node => node.id);
        const header = document.querySelector('#dayView .day-header').getBoundingClientRect();
        const buttons = [...banner.querySelectorAll('button')].map(node => { const b = node.getBoundingClientRect(); return [node.id, Math.round(b.width) >= 44, Math.round(b.height) >= 44]; });
        return { display: getComputedStyle(banner).display, words: banner.querySelector('span').textContent, buttons,
            h: Math.round(box.height), last: banners[banners.length - 1].id, aboveDay: box.bottom <= header.top + 0.5,
            role: banner.getAttribute('role'), font: parseFloat(getComputedStyle(banner.querySelector('span')).fontSize),
            modals: [...document.querySelectorAll('.modal')].filter(node => node.style.display === 'flex').length,
            panels: document.querySelectorAll('.settings-panel.open').length, view: currentView,
            page: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 };
    });
    same('the line is on the glass, in its words, with its two buttons - each a finger wide and tall',
        [line.display !== 'none', line.words, line.buttons], [true, LINE, [['whatsNewOpen', true, true], ['whatsNewDismiss', true, true]]]);
    same('its button says', await text(page, '#whatsNewOpen'), OPEN);
    check('ONE line: no taller than its 44px buttons and their padding', line.h <= 60, String(line.h));
    check('16px words, in a status region, the last of the banners, above the day and over nothing',
        line.font >= 16 && line.role === 'status' && line.last === 'whatsNewBanner' && line.aboveDay, JSON.stringify(line));
    same('it is not a dialog and it opened nothing: the day screen is in front, as on any start',
        [line.modals, line.panels, line.view, line.page], [0, 0, 'day', true]);
    same('offering it wrote nothing: unread is unread', await noteOf(page), null);
    check('the day under it works: a name still opens its sheet',
        await (async () => {
            const chip = page.locator('#dayView .tray .chip-main').first();
            await chip.evaluate(node => node.scrollIntoView({ block: 'center' }));
            await page.waitForTimeout(250);
            await chip.tap();
            await page.waitForTimeout(200);
            const open = await page.evaluate(() => document.getElementById('placePickerModal').style.display === 'flex');
            await page.keyboard.press('Escape');
            await page.waitForTimeout(150);
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.waitForTimeout(150);
            return open;
        })());
    await floors(page, '#whatsNewBanner', 'the line');
    if (shots) await shot(page, 'whatsnew-line');

    suite(`${where}: the card - what is owed, newest first`);
    const diskBefore = await diskBut(page, KEY);
    await page.locator('#whatsNewOpen').tap();
    await page.waitForTimeout(200);
    same('the card, titled, and saying what it lists', [await visible(page, '#whatsNewModal'), await text(page, '#whatsNewTitle'), await text(page, '#whatsNewContext')],
        [true, OPEN, SINCE]);
    same('everything up to this build, newest first', await listed(page), owed);
    same('each under its build', (await page.locator('#whatsNewList .whatsnew-build-name').allTextContents()).map(bare), owed.map(v => `גרסה ${v}`));
    const items = await page.evaluate(() => [...document.querySelectorAll('#whatsNewList .whatsnew-item')].map(row => ({
        kids: [...row.children].map(node => node.className.replace('btn-secondary ', '')),
        title: row.querySelector('.whatsnew-item-title').textContent, text: row.querySelector('.whatsnew-item-text').textContent,
        where: row.querySelector('.whatsnew-item-where').textContent,
        show: row.querySelector('.whatsnew-show') ? [row.querySelector('.whatsnew-show').textContent, row.querySelector('.whatsnew-show').getAttribute('aria-label')] : null })));
    const block = await page.evaluate(n => WHATSNEW_BUILDS.filter(entry => Number(entry.build.slice(1)) <= n).flatMap(entry => entry.items), build);
    same('one row per item of the block: its title, its sentence, where it is',
        items.map(item => [item.title, item.text, item.where]), block.map(item => [item.title, item.text, `איפה: ${item.where}`]));
    check('in that order on the glass, and «הראה לי» last where there is one',
        items.every(item => item.kids.join(' ') === (item.show ? 'whatsnew-item-title whatsnew-item-text whatsnew-item-where whatsnew-show'
            : 'whatsnew-item-title whatsnew-item-text whatsnew-item-where')));
    same('«הראה לי» exactly on the items that have a place to go, each named for a screen reader with what it shows',
        items.map(item => item.show), block.map(item => (item.go ? [SHOW, `${SHOW}: ${item.title}`] : null)));
    const card = await page.evaluate(() => {
        const content = document.querySelector('#whatsNewModal .modal-content').getBoundingClientRect();
        const close = document.getElementById('whatsNewClose');
        const box = close.getBoundingClientRect();
        const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        const sizes = sel => Math.min(...[...document.querySelectorAll(sel)].map(node => parseFloat(getComputedStyle(node).fontSize)));
        return { inside: content.top >= -0.5 && content.bottom <= window.innerHeight + 0.5, closeOnGlass: box.bottom <= window.innerHeight + 0.5 && (top === close),
            closeH: Math.round(box.height), focus: document.activeElement && document.activeElement.id,
            title: sizes('.whatsnew-item-title'), text: sizes('.whatsnew-item-text'), where: sizes('.whatsnew-item-where'), show: sizes('.whatsnew-show') };
    });
    check('the card is inside the screen and its «סגור» stays on the glass, under the thumb, over a long list',
        card.inside && card.closeOnGlass && card.closeH >= 48, JSON.stringify(card));
    same('entered at its heading', card.focus, 'whatsNewTitle');
    check('read at arm\'s length: titles 18px or more, the sentence 17, where it is 16, the button 16',
        card.title >= 18 && card.text >= 17 && card.where >= 16 && card.show >= 16, JSON.stringify(card));
    await floors(page, '#whatsNewModal', 'the card');
    if (shots) await shot(page, 'whatsnew-card');
    same('opening and reading it wrote nothing - not even the note', [await noteOf(page), await diskBut(page, KEY)], [null, diskBefore]);

    await page.locator('#whatsNewClose').evaluate(node => node.scrollIntoView({ block: 'nearest' }));
    await page.locator('#whatsNewClose').tap();
    await page.waitForTimeout(200);
    same('«סגור»: the card is gone, the line with it, and the phone has seen this build',
        [await visible(page, '#whatsNewModal'), await visible(page, '#whatsNewBanner'), await noteOf(page)], [false, false, seenNote(build)]);
    same('the note is the only key that moved', await diskBut(page, KEY), diskBefore);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(450);
    same('after a restart there is no line: told once', [await visible(page, '#whatsNewBanner'), await visible(page, '#whatsNewModal')], [false, false]);
    same('nothing went wrong on the page, and nothing was asked for off this machine', [errors, away], [[], []]);
    await context.close();
}

// ================================================================== seen an older build; the ✕; Escape

{
    const { page, context, errors, build } = await open(440, 956, 'dark', { note: JSON.stringify({ version: 1, build: 'v181' }) });
    suite('seen v181, started on this build: only what came after');
    same('the line is offered', await visible(page, '#whatsNewBanner'), true);
    await page.locator('#whatsNewOpen').tap();
    await page.waitForTimeout(200);
    same('the card lists v182 onward and nothing it has seen', await listed(page), owedOn(build, 181));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    same('Escape is closing it, and closing is seen', [await visible(page, '#whatsNewModal'), await visible(page, '#whatsNewBanner'), await noteOf(page)],
        [false, false, seenNote(build)]);

    suite('unread is offered again; put away by its ✕ it is seen');
    await page.evaluate(key => localStorage.removeItem(key), KEY);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(450);
    given('the line is back for a phone with no note', await visible(page, '#whatsNewBanner'));
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(450);
    same('not opened and not put away, it is there again after a restart', [await visible(page, '#whatsNewBanner'), await noteOf(page)], [true, null]);
    same('the ✕ is named for a screen reader', await page.locator('#whatsNewDismiss').getAttribute('aria-label'), 'סגור');
    const disk = await diskBut(page, KEY);
    await page.locator('#whatsNewDismiss').tap();
    await page.waitForTimeout(150);
    same('the ✕ puts the line away without opening anything, and that is seen',
        [await visible(page, '#whatsNewBanner'), await visible(page, '#whatsNewModal'), await noteOf(page), await diskBut(page, KEY)],
        [false, false, seenNote(build), disk]);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(450);
    same('and it does not come back', await visible(page, '#whatsNewBanner'), false);

    suite('a note that will not read: offered once more, never an error');
    await page.evaluate(key => localStorage.setItem(key, '{"version":1,"build":"v1'), KEY);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(450);
    same('the app opens on the day as it always does, with the line', [await page.locator('#dayView .day-header').count(), await visible(page, '#whatsNewBanner')], [1, true]);
    await page.locator('#whatsNewOpen').tap();
    await page.waitForTimeout(200);
    same('and the card lists everything', await listed(page), owedOn(build, 0));
    await page.locator('#whatsNewClose').tap();
    await page.waitForTimeout(150);
    same('seen, a readable note is written over it', await noteOf(page), seenNote(build));

    // ------------------------------------------------------------ never under somebody's hands
    suite('never under somebody\'s hands: the line waits for a dialog and for a field');
    await page.evaluate(key => { localStorage.removeItem(key); }, KEY);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(450);
    await page.evaluate(() => whatsNewHideLine());
    await page.evaluate(() => openDayCheck());
    await page.waitForTimeout(100);
    given('a dialog is open, which is the middle of something', await page.evaluate(() => midEdit()) === true);
    same('with a dialog open the line is not put up', [await page.evaluate(() => whatsNewOffer()), await visible(page, '#whatsNewBanner')], [false, false]);
    await page.waitForTimeout(1800);
    same('and it goes on waiting while the dialog stays', await visible(page, '#whatsNewBanner'), false);
    await page.evaluate(() => closeDayCheck());
    await page.waitForTimeout(1900);
    same('the dialog closed, it appears by itself', await visible(page, '#whatsNewBanner'), true);

    await page.evaluate(() => whatsNewHideLine());
    const field = page.locator('#dayView .site-counts input').first();
    await field.evaluate(node => node.scrollIntoView({ block: 'center' }));
    await field.tap();
    await page.keyboard.type('2');
    given('a number is being typed into a field of the day', await page.evaluate(() => midEdit()) === true);
    const before = await field.evaluate(node => Math.round(node.getBoundingClientRect().top));
    same('while he types the line is not put up', [await page.evaluate(() => whatsNewOffer()), await visible(page, '#whatsNewBanner')], [false, false]);
    await page.waitForTimeout(1800);
    same('and the field under his finger has not moved', await field.evaluate(node => Math.round(node.getBoundingClientRect().top)), before);
    await page.keyboard.press('Backspace');
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.waitForTimeout(1900);
    same('the field left, it appears', await visible(page, '#whatsNewBanner'), true);
    same('nothing went wrong on the page', errors, []);
    await context.close();
}

// ================================================================== the row in ⋯

for (const [width, height] of [[440, 956], [375, 667]]) {
    const { page, context, errors, build } = await open(width, height, 'dark');
    suite(`${width}x${height}: «מה חדש» in ⋯ ← עדכון וגרסה, whenever he wants it`);
    given('this phone has seen the build: no line', !(await visible(page, '#whatsNewBanner')) && await noteOf(page) === seenNote(build));
    await page.locator('#settingsBtn').tap();
    await page.waitForTimeout(200);
    same('the row עדכון וגרסה is shut, as on every opening', await page.evaluate(() => document.getElementById('settingsFoldUpdate').open), false);
    await page.locator('#settingsFoldUpdate > summary').evaluate(node => node.scrollIntoView({ block: 'center' }));
    await page.locator('#settingsFoldUpdate > summary').tap();
    await page.waitForTimeout(200);
    const row = await page.evaluate(() => {
        const node = document.getElementById('whatsNewRow');
        const box = node.getBoundingClientRect();
        const check = document.querySelector('#settingsFoldUpdate button[onclick="checkForUpdate()"]').getBoundingClientRect();
        const body = document.querySelector('#settingsFoldUpdate .settings-fold-body').getBoundingClientRect();
        return { words: node.textContent, inFold: Boolean(node.closest('#settingsFoldUpdate')), under: box.top >= check.bottom - 0.5,
            h: Math.round(box.height), wide: box.width >= body.width - 40, font: parseFloat(getComputedStyle(node).fontSize),
            version: document.getElementById('appVersion').textContent };
    });
    same('one row, in that card, under the version and its check: «מה חדש»', [row.words, row.inFold, row.under], [OPEN, true, true]);
    check('48px, the width of the card, 16px words', row.h >= 48 && row.wide && row.font >= 16, JSON.stringify(row));
    check('the version line and «בדוק עדכון» are where they were', /v\d+/.test(row.version)
        && await page.locator('#settingsFoldUpdate button[onclick="checkForUpdate()"]').isVisible());
    if (width === 440 && SHOTS) await shot(page, 'whatsnew-settings-row');
    const disk = await diskBut(page);
    await page.locator('#whatsNewRow').tap();
    await page.waitForTimeout(250);
    const over = await page.evaluate(() => {
        const close = document.getElementById('whatsNewClose');
        close.scrollIntoView({ block: 'nearest' });
        const box = close.getBoundingClientRect();
        const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return top === close;
    });
    same('the card opens OVER the sheet, and lists everything - seen or not',
        [await visible(page, '#whatsNewModal'), over, await text(page, '#whatsNewContext'), await listed(page)], [true, true, ALL, owedOn(build, 0)]);
    await floors(page, '#whatsNewModal', 'the card over the sheet');
    await page.locator('#whatsNewClose').tap();
    await page.waitForTimeout(250);
    same('closed, he is back on the sheet, at the row he pressed, and nothing on the disk moved',
        [await visible(page, '#whatsNewModal'), await page.evaluate(() => document.getElementById('settingsPanel').classList.contains('open')),
            await page.evaluate(() => document.activeElement && document.activeElement.id), await diskBut(page)],
        [false, true, 'whatsNewRow', disk]);
    same('nothing went wrong on the page', errors, []);
    await context.close();
}

// ================================================================== every «הראה לי»

for (const rides of [false, true]) {
    const { page, context, errors, away, build } = await open(440, 956, 'dark');
    suite(`every «הראה לי» lands where it says, and writes nothing (הסעות ${rides ? 'on' : 'off'} on this phone)`);
    if (rides) await page.evaluate(() => transportSetEnabled(true));
    given(`הסעות is ${rides ? 'on' : 'off'}`, await page.evaluate(() => transportEnabled()) === rides);
    const ways = await page.evaluate(() => Object.keys(WHATSNEW_GO).sort());
    same('the ways there are', ways, ['advances', 'backup', 'day', 'dayCheck', 'dayFoot', 'find', 'payReport', 'payslipsMenu', 'reportsMenu', 'rides', 'roster', 'share', 'version', 'week']);
    const reset = () => page.evaluate(() => {
        [...document.querySelectorAll('.modal')].filter(node => node.style.display === 'flex').forEach(node => {
            const close = MODAL_CLOSERS[node.id];
            if (close) close(); else node.style.display = 'none';
        });
        if (typeof transportIsOpen === 'function' && transportIsOpen()) closeTransport();
        if (document.getElementById('settingsPanel').classList.contains('open')) closeSettings();
        if (typeof REPORT_SECTION !== 'undefined') REPORT_SECTION = 'sites';
        showView('week');
        window.scrollTo(0, 0);
    });
    const state = () => page.evaluate(() => ({ view: currentView,
        modals: [...document.querySelectorAll('.modal')].filter(node => node.style.display === 'flex').map(node => node.id),
        settings: document.getElementById('settingsPanel').classList.contains('open'),
        folds: [...document.querySelectorAll('#settingsPanel details.settings-fold')].filter(node => node.open).map(node => node.id).sort(),
        transport: typeof transportIsOpen === 'function' && transportIsOpen(), focus: document.activeElement && document.activeElement.id,
        journey: typeof journeyStation === 'function' ? journeyStation() : 0,
        menu: Boolean(document.querySelector('#reportsView details.report-output-actions') && document.querySelector('#reportsView details.report-output-actions').open),
        menuRows: [...document.querySelectorAll('#reportsView details.report-output-actions button')].filter(node => node.offsetParent !== null).map(node => node.id).filter(Boolean),
        section: typeof REPORT_SECTION !== 'undefined' ? REPORT_SECTION : null }));
    // Where each way lands. `folds` is asked only where the way goes to the sheet.
    const lands = {
        day: s => s.view === 'day' && s.modals.length === 0 && !s.settings && !s.transport,
        dayFoot: s => s.view === 'day' && s.modals.length === 0 && s.focus === 'journeyDayEntry' && s.journey === 0,
        dayCheck: s => s.view === 'day' && s.modals.join() === 'dayCheckModal',
        share: s => s.view === 'day' && s.modals.join() === 'shareModal',
        roster: s => s.view === 'roster' && s.modals.length === 0 && !s.settings,
        // The menu open with the row on the glass - and the row NOT pressed: no dialog.
        reportsMenu: s => s.view === 'reports' && s.menu && s.menuRows.includes('monthSummaryOpen') && s.modals.length === 0,
        // The pay sheet as it opens: on «לפי עובד», its menu shut, nothing pressed.
        payReport: s => s.view === 'reports' && s.section === 'workers' && !s.menu && s.modals.length === 0 && !s.settings,
        payslipsMenu: s => s.view === 'reports' && s.section === 'workers' && s.menu && s.menuRows.includes('payslipsEntry') && s.modals.length === 0,
        find: s => s.view === 'day' && s.modals.join() === 'findModal' && s.focus === 'findInput',
        advances: s => s.view === 'advances' && s.modals.length === 0 && !s.settings,
        week: s => s.view === 'week' && s.modals.length === 0 && !s.settings,
        backup: s => s.settings && s.folds.includes('settingsFoldBackup') && s.modals.length === 0,
        version: s => s.settings && s.folds.includes('settingsFoldUpdate') && s.modals.length === 0,
        rides: s => (rides ? s.transport && s.view === 'day' && !s.settings
            : s.settings && s.folds.includes('transportSwitchCard') && !s.transport)
    };
    // Each way once from the card as ⋯ opens it; a first disk reading is taken after the
    // phone has seen the build, so the note is not a difference either.
    await page.evaluate(() => { openWhatsNew('all'); closeWhatsNew(); });
    for (const way of ways) {
        await reset();
        await page.waitForTimeout(120);
        const disk = await diskBut(page);
        await page.evaluate(() => openWhatsNew('all'));
        // By its button, with a finger, wherever this build's card has an item that goes
        // there; a way only a LATER build's item uses (the block may be ahead of the
        // stamps) is asked of the same function the button calls.
        const button = page.locator(`#whatsNewList .whatsnew-show[data-go="${way}"]`).first();
        const pressed = await button.count() === 1;
        if (pressed) {
            await button.evaluate(node => node.scrollIntoView({ block: 'center' }));
            await page.waitForTimeout(150);
            await button.tap();
        } else {
            console.log(`  NOTE  ${way}: no item of v${build} goes there yet - asked through whatsNewGo, the function its button calls`);
            await page.evaluate(key => whatsNewGo(key), way);
        }
        await page.waitForTimeout(350);
        const s = await state();
        check(`${way}: it lands on the screen it names, with the card out of the way`, lands[way](s) && !s.modals.includes('whatsNewModal'), JSON.stringify(s));
        same(`${way}: and the whole disk is byte for byte what it was`, await diskBut(page), disk);
        if (way === 'dayFoot') {
            const onGlass = await page.evaluate(() => { const box = document.getElementById('journeyDayEntry').getBoundingClientRect(); return box.top >= 0 && box.bottom <= window.innerHeight; });
            check('dayFoot: the button is brought onto the glass - and not pressed: no journey was started',
                onGlass && await page.evaluate(() => localStorage.getItem('farkadSederJourney')) === null);
        }
        if (way === 'rides' && !rides) {
            same('rides, with הסעות off: he is shown the row where it is turned on, and it is NOT turned on',
                [await page.evaluate(() => transportEnabled()), await page.evaluate(() => localStorage.getItem('farkadTransport:enabled')),
                    await page.locator('#transportSwitch').isVisible()], [false, null, true]);
        }
        if (way === 'rides' && rides) {
            same('rides, with הסעות on: the screen itself, for the day on the screen',
                [await page.evaluate(() => document.getElementById('transportPanel').classList.contains('open')), await page.evaluate(() => State.date)], [true, DAY]);
        }
    }
    // From the sheet: the card AND the sheet step aside.
    await reset();
    await page.locator('#settingsBtn').tap();
    await page.waitForTimeout(150);
    await page.evaluate(() => { document.getElementById('settingsFoldUpdate').open = true; });
    await page.locator('#whatsNewRow').evaluate(node => node.scrollIntoView({ block: 'center' }));
    await page.locator('#whatsNewRow').tap();
    await page.waitForTimeout(200);
    const week = page.locator('#whatsNewList .whatsnew-show[data-go="week"]').first();
    await week.evaluate(node => node.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(150);
    await week.tap();
    await page.waitForTimeout(350);
    const after = await state();
    check('opened from ⋯, «הראה לי» puts the sheet away too: one layer at a time', after.view === 'week' && !after.settings && after.modals.length === 0, JSON.stringify(after));
    same('nothing went wrong on the page, and nothing was asked for off this machine', [errors, away], [[], []]);
    await context.close();
}

// ================================================================== 200% text

for (const [width, height] of [[440, 956], [375, 667]]) {
    const { page, context, errors } = await open(width, height, 'dark', { note: null });
    suite(`${width}x${height}: the line and the card with the text at 200%`);
    given('the line is up', await visible(page, '#whatsNewBanner'));
    given('the cascade was doubled', await doubleEveryFontSize(page) > 100);
    await page.evaluate(() => render());
    await page.waitForTimeout(300);
    await floors(page, '#whatsNewBanner', '200% the line');
    await page.locator('#whatsNewOpen').tap();
    await page.waitForTimeout(250);
    await floors(page, '#whatsNewModal', '200% the card');
    const big = await page.evaluate(() => {
        const content = document.querySelector('#whatsNewModal .modal-content');
        const rows = [...document.querySelectorAll('#whatsNewList .whatsnew-item-title, #whatsNewList .whatsnew-item-text, #whatsNewList .whatsnew-item-where, #whatsNewList .whatsnew-show')];
        const close = document.getElementById('whatsNewClose').getBoundingClientRect();
        return { fits: content.scrollWidth <= content.clientWidth + 1, scrolls: content.scrollHeight > content.clientHeight,
            whole: rows.every(node => node.scrollWidth <= node.clientWidth + 1), close: close.bottom <= window.innerHeight + 0.5 && close.height >= 48 };
    });
    same('every word wraps inside the card, the card scrolls down and not sideways, and «סגור» stays on the glass',
        big, { fits: true, scrolls: true, whole: true, close: true });
    same('nothing went wrong on the page', errors, []);
    await context.close();
}

await browser.close();
await server.close();
report();
