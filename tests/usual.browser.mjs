// The usual site - the chip beside a man in «לא נרשמו» - in a real Chromium.
//
//   node tests/usual.browser.mjs
//   USUAL_SHOTS=<dir> node tests/usual.browser.mjs     also writes JPEGs (440x956, dark)
//
// tests/usual.test.mjs holds the rule, the measured months and the bytes a tap leaves on
// the disk. What it cannot hold is the glass: that the chip is 48px tall with 18px words,
// in the site's own colour and readable on it; that it stands beside the name where there
// is room and goes UNDER it where there is not (a long name at 375px, doubled text),
// never over the name or over «נעדר»; that the two controls that were on the row are
// where a finger still finds them; that a real finger on it places the man and leaves the
// day where it was on the screen - mark for mark what a pick in his sheet leaves; that a
// double tap is one man although the next man's chip slides under the finger; that ↶
// takes it back; that the journey's first station, which is this same screen, shows it
// and counts by it; and that drawing it writes nothing. At 440x956 and 375x667, dark and
// light. NOT a real phone: emulated touch and Chromium's layout.

import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import { launchLocalBrowser } from './network-guard.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import { censusOnly } from './census.mjs';

const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
check('the browser is served the named tree',
    (await verifyServedAssets(server.url, root, expectedShaFor(root))).ok);
const browser = await launchLocalBrowser(chromium, { executablePath: process.env.CHROME_PATH });
const errors = [];
const SHOTS = process.env.USUAL_SHOTS || '';

const TODAY = '2026-11-10';     // a Tuesday evening
const DAY = '2026-11-11';       // tomorrow, the day on screen
const bare = text => String(text || '').replace(/[⁦-⁩‎]/g, '');

// Synthetic names. Who gets a chip, by the record seeded below:
//   אמיר, חסן -> הרצליה · בסאם -> תל אביב - מגדל הצפון · הלל (a long name) -> אשדוד ·
//   וליד -> נתניה (his days there were double) · טארק, יונס, כמאל -> הרצליה ·
//   גדי (sites in turns), דאוד and זיאד (never worked): none.
const NAMES = ['אמיר דוגמה', 'בסאם דוגמה', 'גדי דוגמה', 'דאוד דוגמה', 'הלל עם שם ארוך במיוחד לבדיקה',
    'וליד דוגמה', 'זיאד דוגמה', 'חסן דוגמה', 'טארק דוגמה', 'יונס דוגמה', 'כמאל דוגמה'];
const SITES = ['הרצליה', 'תל אביב - מגדל הצפון', 'אשדוד', 'נתניה'];

async function phone(width, height, scheme, mode = 'sites') {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2,
        isMobile: true, hasTouch: true, colorScheme: scheme, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.setFixedTime(`${TODAY}T18:00:00`);
    await page.goto(server.url);
    await page.waitForFunction(() => typeof usualSiteFor === 'function' && typeof State === 'object');
    await page.evaluate(([names, sites, today, day, mode]) => {
        todayStr = () => today;
        State.schedule.workers = names.map((name, at) => ({ id: 'w_' + String(at + 1).padStart(2, '0'), name, active: true, dailyRate: 400 + at }));
        State.schedule.places = sites.map((name, at) => ({ id: 'p_0' + (at + 1), name, active: true }));
        State.commitRoster();
        ['2026-11-05', '2026-11-08', '2026-11-09', '2026-11-10'].forEach((date, k) => {
            [['w_01', 'p_01'], ['w_02', 'p_02'], ['w_05', 'p_03'], ['w_08', 'p_01'], ['w_09', 'p_01'], ['w_10', 'p_01'], ['w_11', 'p_01']]
                .forEach(([id, site]) => State.commit(assignPlace(State.schedule, date, id, 'actual', site)));
            State.commit(assignPlace(State.schedule, date, 'w_06', 'actual', 'p_04', RATE_DOUBLE));
            State.commit(assignPlace(State.schedule, date, 'w_03', 'actual', k % 2 ? 'p_01' : 'p_03'));
        });
        hideUndo();
        State.date = day;
        showView('day'); setDayMode(mode); render();
        const banner = document.getElementById('accountBanner');
        const putAway = banner && banner.style.display !== 'none' && banner.querySelector(':scope > .btn-icon');
        if (putAway) putAway.click();
        window.__row = name => [...document.querySelectorAll('#dayView .tray-pending .chip')]
            .find(chip => chip.querySelector('.chip-main').textContent.startsWith(name)) || null;
        window.__offer = name => { const row = __row(name); return row ? row.querySelector('.chip-usual') : null; };
        window.__box = node => { const b = node.getBoundingClientRect();
            return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height }; };
        window.__marks = () => [...document.querySelectorAll('#dayView [data-anchor]')]
            .map(node => [node.dataset.anchor, Math.round(node.getBoundingClientRect().top)]);
        const lum = text => { const [r, g, b] = text.match(/[\d.]+/g).slice(0, 3).map(Number)
            .map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
            return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        window.__contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    }, [NAMES, SITES, TODAY, DAY, mode]);
    await frames(page);
    return { context, page };
}

const frames = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
const settle = (page, ms = 80) => page.evaluate(ms => new Promise(done =>
    setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(done)), ms)), ms);
// Without the service worker's census of open builds (tests/census.mjs says why).
const disk = page => page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()
    .filter(key => key !== 'farkad:openBuilds').map(key => [key, localStorage.getItem(key)])));
const dayOf = (page, id) => page.evaluate(([id, day]) => JSON.stringify(((State.schedule.days[day] || {}).actual || {})[id] || null), [id, DAY]);
const waiting = page => page.evaluate(() => State.unrecorded().map(worker => worker.name));
const undoSays = page => page.evaluate(() => { const bar = document.getElementById('undoBar');
    return bar && bar.style.display !== 'none' && bar.firstChild ? bar.firstChild.textContent : null; });
async function bring(page, name, fraction = 0.4) {
    for (let pass = 0; pass < 3; pass += 1) {
        await page.evaluate(([name, fraction]) => {
            const node = name ? __row(name) : document.querySelector('#dayView .tray-pending');
            if (node) window.scrollTo(0, Math.max(0, scrollY + node.getBoundingClientRect().top - innerHeight * fraction));
        }, [name, fraction]);
        await frames(page);
    }
}
async function tapOffer(page, name) {
    const point = await page.evaluate(name => { const node = __offer(name); if (!node) return null;
        const b = node.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, name);
    if (point) await page.touchscreen.tap(point.x, point.y);
    return point;
}

// Every row of the tray, measured.
const rows = page => page.evaluate(() => {
    const tray = document.querySelector('#dayView .tray-pending');
    const side = tray.getBoundingClientRect();
    return [...tray.querySelectorAll('.chip')].map(chip => {
        const main = chip.querySelector('.chip-main'), absent = chip.querySelector('.chip-side'), offer = chip.querySelector('.chip-usual');
        const style = offer ? getComputedStyle(offer) : null;
        const word = offer ? offer.querySelector('.site-name') : null;
        return { name: main.textContent, main: __box(main), absent: __box(absent), offer: offer ? __box(offer) : null,
            absentText: absent.textContent, order: [...chip.children].map(child => child.className).join(' '),
            font: style ? parseFloat(style.fontSize) : null, weight: style ? Number(style.fontWeight) : null,
            text: offer ? offer.textContent : null, aria: offer ? offer.getAttribute('aria-label') : null,
            wordHeight: word ? word.getBoundingClientRect().height : null,
            border: style ? style.borderTopStyle : null,
            contrast: style ? __contrast(style.color, style.backgroundColor) : null,
            ground: style ? style.backgroundColor : null,
            mainFont: parseFloat(getComputedStyle(main).fontSize),
            inside: !offer || (offer.getBoundingClientRect().left >= side.left - 0.5 && offer.getBoundingClientRect().right <= side.right + 0.5) };
    });
});
const apart = (a, b) => a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5;
const sideways = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

try {
    // ============================================================== on four screens
    for (const [width, height, scheme] of [[440, 956, 'dark'], [440, 956, 'light'], [375, 667, 'dark'], [375, 667, 'light']]) {
        const tag = `${width}x${height} ${scheme}`;
        suite(`${tag}: the chip on the glass`);
        const { context, page } = await phone(width, height, scheme);
        await bring(page, null, 0.2);
        const before = await disk(page);
        await censusOnly(check, page, before);
        const drawn = await rows(page);
        const of = name => drawn.find(row => row.name.startsWith(name));
        const offered = drawn.filter(row => row.offer);

        same(`${tag}: eleven men are not recorded`, drawn.length, 11);
        same(`${tag}: eight of them have a chip, and it says the site after the arrow`,
            offered.map(row => `${row.name.split(' ')[0]}${row.text}`).join(' | '),
            'אמיר←הרצליה | בסאם←תל אביב - מגדל הצפון | הלל←אשדוד | וליד←נתניה | חסן←הרצליה | טארק←הרצליה | יונס←הרצליה | כמאל←הרצליה');
        check(`${tag}: the men whose record is not plain have none`, ['גדי', 'דאוד', 'זיאד'].every(name => of(name) && !of(name).offer));
        check(`${tag}: every chip is 48px tall or more, and as wide`, offered.every(row => row.offer.height >= 48 && row.offer.width >= 48),
            JSON.stringify(offered.map(row => [Math.round(row.offer.width), Math.round(row.offer.height)])));
        check(`${tag}: its words are 18px, heavy`, offered.every(row => row.font >= 18 && row.weight >= 700),
            JSON.stringify(offered.map(row => [row.font, row.weight])));
        check(`${tag}: white on the site's own colour at 4.5:1 or better`, offered.every(row => row.contrast >= 4.5),
            JSON.stringify(offered.map(row => Number(row.contrast.toFixed(2)))));
        same(`${tag}: one colour per site - four sites, four colours`, new Set(offered.map(row => row.ground)).size, 4);
        check(`${tag}: the same site is the same colour on every row`, of('אמיר').ground === of('חסן').ground && of('אמיר').ground !== of('בסאם').ground);
        check(`${tag}: dashed - a suggestion, not a record`, offered.every(row => row.border === 'dashed'));
        check(`${tag}: it covers neither the name nor «נעדר»`, offered.every(row => apart(row.offer, row.main) && apart(row.offer, row.absent)));
        check(`${tag}: and stays inside the tray`, drawn.every(row => row.inside));
        check(`${tag}: the name and «נעדר» are still a finger wide and tall on every row`,
            drawn.every(row => row.main.height >= 44 && row.main.width >= 44 && row.absent.height >= 44 && row.absent.width >= 52 && row.absentText === 'נעדר'),
            JSON.stringify(drawn.map(row => [Math.round(row.main.height), Math.round(row.absent.width)])));
        same(`${tag}: the chip is the last of the three`, of('אמיר').order, 'chip-main chip-side chip-usual');
        same(`${tag}: its accessible name says the man and the site`, bare(of('בסאם').aria), 'שבץ את בסאם דוגמה בתל אביב - מגדל הצפון');
        check(`${tag}: a short name and a short site share one line`, Math.abs(of('אמיר').offer.top + of('אמיר').offer.height / 2
            - (of('אמיר').main.top + of('אמיר').main.height / 2)) < 6, JSON.stringify([of('אמיר').offer, of('אמיר').main]));
        check(`${tag}: a long name has its chip under it, not squeezed beside it`, of('הלל').offer.top >= of('הלל').main.bottom - 0.5,
            JSON.stringify([of('הלל').offer, of('הלל').main]));
        check(`${tag}: a site's name is on one line where it fits`, of('אמיר').wordHeight < 30, String(of('אמיר').wordHeight));
        const note = await page.evaluate(() => { const node = document.querySelector('#dayView .tray-pending .usual-note');
            return node ? { text: node.textContent, font: parseFloat(getComputedStyle(node).fontSize),
                contrast: __contrast(getComputedStyle(node).color, getComputedStyle(node.closest('.tray')).backgroundColor),
                afterHeading: node.previousElementSibling && node.previousElementSibling.tagName } : null; });
        same(`${tag}: one sentence over the rows`, note && note.text, 'האתר ליד השם הוא הצעה לפי הימים האחרונים. נגיעה בו משבצת.');
        check(`${tag}: 16px or more, 4.5:1, right under the tray's heading`, note && note.font >= 16 && note.contrast >= 4.5 && note.afterHeading === 'H4', JSON.stringify(note));
        same(`${tag}: the tray's heading is what it was`, await page.evaluate(() => document.querySelector('#dayView .tray-pending h4').textContent), 'לא נרשמו (11)');
        check(`${tag}: no sideways scroll`, (await sideways(page)) <= 1);
        check(`${tag}: nothing was added to the dock or to the header`, await page.evaluate(() =>
            !document.querySelector('.day-actions .chip-usual, .day-header .chip-usual, .day-actions .usual-note, .day-header .usual-note')
            && document.querySelectorAll('.chip-usual').length === document.querySelectorAll('#dayView .tray-pending .chip-usual').length));

        // Drawn again and again, scrolled: nothing is written.
        await page.evaluate(() => { render(); render(); window.scrollBy(0, 200); render(); });
        await frames(page);
        same(`${tag}: drawing it wrote nothing - the whole disk is the same bytes`, await disk(page), before);
        if (SHOTS && width === 440 && scheme === 'dark') {
            await bring(page, null, 0.12);
            await page.screenshot({ path: `${SHOTS}/usual-1-tray-440-dark.jpg`, type: 'jpeg', quality: 82 });
        }

        // ---- doubled text
        suite(`${tag}: at doubled text`);
        await page.evaluate(() => {
            const sizes = [...document.querySelectorAll('#dayView .tray-pending *')].map(node => [node, parseFloat(getComputedStyle(node).fontSize)]);
            sizes.forEach(([node, size]) => node.style.setProperty('font-size', `${size * 2}px`, 'important'));
        });
        await frames(page);
        const big = (await rows(page)).filter(row => row.offer);
        check(`${tag}: the chip's words are 36px`, big.every(row => row.font >= 36), JSON.stringify(big.map(row => row.font)));
        check(`${tag}: every chip is under its name now`, big.every(row => row.offer.top >= row.main.bottom - 0.5),
            JSON.stringify(big.map(row => [Math.round(row.offer.top), Math.round(row.main.bottom)])));
        check(`${tag}: over neither the name nor «נעדר»`, big.every(row => apart(row.offer, row.main) && apart(row.offer, row.absent)));
        check(`${tag}: inside the tray, the long site's name folded`, big.every(row => row.inside),
            JSON.stringify(big.filter(row => !row.inside).map(row => row.name)));
        check(`${tag}: still 48px tall or more`, big.every(row => row.offer.height >= 48));
        check(`${tag}: no sideways scroll`, (await sideways(page)) <= 1, String(await sideways(page)));
        await context.close();
    }

    // ============================================================== a finger on it
    for (const [width, height] of [[440, 956], [375, 667]]) {
        const tag = `${width}x${height}`;
        suite(`${tag}: a tap places the man, as a pick in his sheet does, and the day stays where it was`);
        const chip = await phone(width, height, 'dark');
        const sheet = await phone(width, height, 'dark');
        for (const page of [chip.page, sheet.page]) await bring(page, 'בסאם', 0.45);
        const y = await chip.page.evaluate(() => Math.round(scrollY));
        given(`${tag}: the day is scrolled, the tray on the screen`, y > 100 && y === await sheet.page.evaluate(() => Math.round(scrollY)), String(y));
        const marksBefore = await chip.page.evaluate(() => JSON.stringify(__marks()));

        await tapOffer(chip.page, 'בסאם');
        await settle(chip.page, 200);
        // The same man, the same site, by his sheet: opened, the site's tile pressed, closed.
        await sheet.page.evaluate(() => { openAssignSheet('w_02', { stay: true }); sheetGuardUntil = 0; });
        await sheet.page.locator('#assignSheet .sheet-place', { hasText: 'תל אביב - מגדל הצפון' }).click();
        await sheet.page.evaluate(() => closeAssignSheet());
        await settle(sheet.page, 200);

        const placed = await dayOf(chip.page, 'w_02');
        check(`${tag}: he is on the site, one entry`, JSON.parse(placed).entries.length === 1 && JSON.parse(placed).entries[0].placeId === 'p_02', placed);
        same(`${tag}: his day is what the sheet's pick wrote, rates and all`, placed, await dayOf(sheet.page, 'w_02'));
        check(`${tag}: stamped with his own daily rate`, placed.includes('401'), placed);
        same(`${tag}: the whole of that day in the record is the same on both phones`,
            await chip.page.evaluate(day => JSON.stringify(State.schedule.days[day]), DAY),
            await sheet.page.evaluate(day => JSON.stringify(State.schedule.days[day]), DAY));
        // Sorted: the queue's own order follows ids each phone draws at random.
        same(`${tag}: the queue holds the same paths`,
            JSON.stringify(await chip.page.evaluate(() => FarkadSync.pendingPaths().slice().sort())),
            JSON.stringify(await sheet.page.evaluate(() => FarkadSync.pendingPaths().slice().sort())));
        check(`${tag}: one field path`, (await chip.page.evaluate(() => FarkadSync.pendingPaths())).includes(`days.${DAY}.actual.w_02`));
        same(`${tag}: the undo bar says it in the sheet's words`, bare(await undoSays(chip.page)), 'בסאם דוגמה נרשם בתל אביב - מגדל הצפון');
        check(`${tag}: he is on the site's card and out of the tray`, await chip.page.evaluate(() =>
            !__row('בסאם') && [...document.querySelectorAll('#dayView .site-card')].some(card =>
                card.querySelector('.site-name').textContent === 'תל אביב - מגדל הצפון' && card.textContent.includes('בסאם דוגמה'))));
        same(`${tag}: the tray counts one fewer`, await chip.page.evaluate(() => document.querySelector('#dayView .tray-pending h4').textContent), 'לא נרשמו (10)');
        check(`${tag}: the page was not thrown to its top`, (await chip.page.evaluate(() => Math.round(scrollY))) > 100);
        same(`${tag}: every mark of the day is where the sheet's pick leaves it`,
            await chip.page.evaluate(() => JSON.stringify(__marks())), await sheet.page.evaluate(() => JSON.stringify(__marks())));
        same(`${tag}: and the page scrolled as far as it does after the sheet's pick`,
            await chip.page.evaluate(() => Math.round(scrollY)), await sheet.page.evaluate(() => Math.round(scrollY)));
        const first = JSON.parse(marksBefore).find(([, top]) => top > 110 && top < height);
        const now = JSON.parse(await chip.page.evaluate(() => JSON.stringify(__marks()))).find(([key]) => key === first[0]);
        check(`${tag}: the first thing that was on the screen is still where it was`, now && Math.abs(now[1] - first[1]) <= 1, JSON.stringify([first, now]));

        // ↶ in the header takes it back; ↷ puts it back.
        await chip.page.evaluate(() => document.getElementById('undoBtn').click());
        await settle(chip.page);
        check(`${tag}: ↶ takes him off the site and back into the tray, chip and all`,
            JSON.parse(await dayOf(chip.page, 'w_02') || '{"entries":[]}').entries.length === 0
            && await chip.page.evaluate(() => Boolean(__offer('בסאם'))));
        await chip.page.evaluate(() => document.getElementById('redoBtn').click());
        await settle(chip.page);
        same(`${tag}: ↷ puts back exactly what the tap wrote`, await dayOf(chip.page, 'w_02'), placed);
        if (SHOTS && width === 440) {
            await chip.page.evaluate(() => document.getElementById('undoBtn').click());
            await settle(chip.page);
            await tapOffer(chip.page, 'בסאם');
            await settle(chip.page, 200);
            await chip.page.screenshot({ path: `${SHOTS}/usual-2-after-tap-440-dark.jpg`, type: 'jpeg', quality: 82 });
        }

        // The double day he had yesterday is NOT carried: a regular day.
        await chip.page.clock.setFixedTime(`${TODAY}T18:01:00`);
        await chip.page.waitForTimeout(800);
        await bring(chip.page, 'וליד', 0.45);
        await tapOffer(chip.page, 'וליד');
        await settle(chip.page, 200);
        const regular = JSON.parse(await dayOf(chip.page, 'w_06'));
        check(`${tag}: a man whose last days were double is given a regular day`, regular.entries.length === 1
            && regular.entries[0].placeId === 'p_04' && (regular.entries[0].rate === undefined || regular.entries[0].rate === 'normal'),
            JSON.stringify(regular));
        check(`${tag}: and his row on the site carries no rate tag`, await chip.page.evaluate(() =>
            [...document.querySelectorAll('#dayView .assign-row')].some(row => row.textContent.includes('וליד דוגמה') && !row.querySelector('.assign-rate'))));
        await chip.context.close();
        await sheet.context.close();

        // ---- a double tap is one man
        suite(`${tag}: a double tap is one tap`);
        for (const gap of [120, 400]) {
            const { context, page } = await phone(width, height, 'dark');
            await bring(page, 'חסן', 0.4);
            const point = await tapOffer(page, 'חסן');
            await page.waitForTimeout(gap);
            const under = await page.evaluate(([x, y]) => { const node = document.elementFromPoint(x, y);
                const offer = node && node.closest('.chip-usual'); return offer ? offer.getAttribute('aria-label') : null; }, [point.x, point.y]);
            await page.touchscreen.tap(point.x, point.y);
            await settle(page, 250);
            given(`${tag}, ${gap}ms: the next man's chip had slid under the finger`, bare(under).startsWith('שבץ את טארק דוגמה'), String(under));
            check(`${tag}, ${gap}ms: the first man is placed`, JSON.parse(await dayOf(page, 'w_08')).entries[0].placeId === 'p_01');
            same(`${tag}, ${gap}ms: the man who slid under the finger is not`, await dayOf(page, 'w_09'), 'null');
            same(`${tag}, ${gap}ms: ten men are still waiting`, (await waiting(page)).length, 10);
            same(`${tag}, ${gap}ms: the undo bar still names the first man`, bare(await undoSays(page)), 'חסן דוגמה נרשם בהרצליה');
            // And once the guard has passed, the next man is one tap.
            await page.waitForTimeout(800);
            await tapOffer(page, 'טארק');
            await settle(page, 200);
            check(`${tag}, ${gap}ms: a tap after the guard places the next man`, JSON.parse(await dayOf(page, 'w_09') || '{"entries":[{}]}').entries[0].placeId === 'p_01');
            await context.close();
        }
    }

    // ============================================================== the next man has NO chip
    //
    // The case above is the one the chip's first guard was written for: the man after has
    // a chip of his own, and it slides into the place of the one tapped. The review of v189
    // (c0) measured the other one, which is the common one: a man with a chip takes a whole
    // line of the tray, the men after him have none, and when he is placed their small
    // rows flow up into his line - so the second tap of a double tap, 150 ms later, came
    // down on ANOTHER man's «נעדר»: he was marked absent, by a bare commit with no step of
    // its own on ↶, the undo bar still naming the first man, and ↶ pressed to take the
    // absence back took the first man's placement back instead. Or on another man's name,
    // opening «לאן הלך» for him; or - the last man waiting placed - on a ✕ of «נעדרים»
    // below, cancelling an absence. The layouts are the reviewers' (one site, the first man
    // the only one with a chip, at their sizes and with their names), and one more for
    // «נעדרים». Whatever a layout puts under the finger, the trays have one clock
    // (trayTapTooSoon, js/ui/day.js): exactly the first man is placed and nothing else on
    // the day moves. A pair the page saw 700 ms or more apart is not a double tap, and a
    // first tap the page did not deliver to the chip is not this case: each is tried again
    // in a fresh page, and a third such try fails.
    const SITE = 'הרצליה';
    async function crew(width, height, names, away, usual) {
        const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2,
            isMobile: true, hasTouch: true, colorScheme: 'dark', serviceWorkers: 'block' });
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        await page.clock.setFixedTime(`${TODAY}T18:00:00`);
        await page.goto(server.url);
        await page.waitForFunction(() => typeof usualSiteFor === 'function' && typeof State === 'object');
        await page.evaluate(([names, away, usual, site, today, day]) => {
            todayStr = () => today;
            const id = at => 'w_' + String(at + 1).padStart(2, '0');
            State.schedule.workers = names.concat(away).map((name, at) => ({ id: id(at), name, active: true, dailyRate: 400 }));
            State.schedule.places = [{ id: 'p_01', name: site, active: true }];
            State.commitRoster();
            ['2026-11-08', '2026-11-09', '2026-11-10'].forEach(date =>
                State.commit(assignPlace(State.schedule, date, id(usual), 'actual', 'p_01')));
            away.forEach((name, k) => State.commit(markAbsent(State.schedule, day, id(names.length + k), 'actual')));
            hideUndo();
            State.date = day;
            showView('day'); setDayMode('sites'); render();
            const banner = document.getElementById('accountBanner');
            const putAway = banner && banner.style.display !== 'none' && banner.querySelector(':scope > .btn-icon');
            if (putAway) putAway.click();
            // Which button each click reached, and when by the page's own clock - the one
            // the guard reads.
            window.__hits = [];
            document.addEventListener('click', event => {
                const hit = event.target && event.target.closest ? event.target.closest('button') : null;
                __hits.push({ at: performance.now(), cls: hit ? hit.className : null, aria: hit ? hit.getAttribute('aria-label') : null });
            }, true);
            window.__under = (x, y) => {
                const node = document.elementFromPoint(x, y);
                const hit = node && node.closest('button');
                const tray = hit && hit.closest('.tray');
                return hit ? { cls: hit.className, aria: hit.getAttribute('aria-label'), tray: tray ? tray.className : null } : null;
            };
            window.__centre = node => { const b = node.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; };
            window.__day = () => JSON.stringify(((State.schedule.days[day] || {}).actual) || {});
            window.__others = except => JSON.stringify(Object.entries(((State.schedule.days[day] || {}).actual) || {})
                .filter(([key]) => key !== except).sort());
        }, [names, away, usual, SITE, TODAY, DAY]);
        await frames(page);
        return { context, page, chipOf: 'w_' + String(usual + 1).padStart(2, '0'), first: names[usual] };
    }
    // Brought to the middle of the screen and left to settle: the bars are measured a frame
    // after a render, and the day's place is finished then (settleDayAnchor).
    async function centred(page, find) {
        for (let pass = 0; pass < 3; pass += 1) {
            await page.evaluate(find => { const node = (0, eval)(find)();
                window.scrollTo(0, Math.max(0, scrollY + node.getBoundingClientRect().top - innerHeight * 0.4)); }, find);
            await settle(page, 60);
        }
        await settle(page, 150);
        return page.evaluate(find => __centre((0, eval)(find)()), find);
    }
    const CHIP = `() => document.querySelector('#dayView .tray-pending .chip-usual')`;
    const N1 = ['אמיר', 'בסאם אבו', 'גדי', 'דאוד', 'הלל', 'וליד', 'זיאד', 'חסן', 'טארק', 'יונס'];
    const N2 = ['אמיר דוגמה', 'בסאם דוגמה', 'גדי דוגמה', 'דאוד דוגמה', 'הלל דוגמה', 'וליד דוגמה', 'זיאד דוגמה', 'חסן דוגמה'];
    const N3 = ['מוחמד', 'אחמד', 'עלי', 'יוסי', 'רמי', 'סאמר', 'נביל', 'פאדי'];
    const N4 = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י'];
    const AWAY = ['חיים לוי', 'מאיר כהן', 'שלמה פרץ', 'אהרון דהן'];
    const LAYOUTS = [
        [440, 956, N1, [], 0], [430, 932, N3, [], 0], [412, 915, N2, [], 0], [390, 844, N2, [], 0],
        [375, 667, N2, [], 0], [360, 740, N4, [], 0], [390, 844, N3, [], 0], [375, 667, N2.slice(0, 2), AWAY, 1]];
    const underFinger = [];
    suite('a double tap on the chip, the next man with no chip: one man, wherever the second tap lands');
    for (const [width, height, names, away, usual] of LAYOUTS) {
        const tag = `${width}x${height}, ${names[0]}…${away.length ? ' and «נעדרים»' : ''}`;
        let judged = null;
        for (let attempt = 1; attempt <= 3 && !judged; attempt += 1) {
            const one = await crew(width, height, names, away, usual);
            const { page } = one;
            const point = await centred(page, CHIP);
            const before = { day: await page.evaluate(() => __day()), paths: await page.evaluate(() => FarkadSync.pendingPaths().slice()) };
            await page.touchscreen.tap(point.x, point.y);
            await page.waitForTimeout(150);
            const under = await page.evaluate(([x, y]) => __under(x, y), [point.x, point.y]);
            await page.touchscreen.tap(point.x, point.y);
            await settle(page, 300);
            const hits = await page.evaluate(() => __hits);
            const pair = hits.length >= 2 ? Math.round(hits[1].at - hits[0].at) : null;
            const onChip = hits.length > 0 && /\bchip-usual\b/.test(hits[0].cls || '');
            if (!onChip || pair === null || pair >= 700) {
                if (attempt === 3) check(`${tag}: a double tap reached the chip in one of three fresh pages`, false,
                    JSON.stringify({ hits: hits.map(hit => [Math.round(hit.at), hit.cls, bare(hit.aria)]), pair }));
                await one.context.close();
                continue;
            }
            judged = { ...one, before, under, pair };
        }
        if (!judged) continue;
        const { page, context, chipOf, first, before, under, pair } = judged;
        underFinger.push(under);
        const placed = JSON.parse(await page.evaluate(id => JSON.stringify(((State.schedule.days[State.date] || {}).actual || {})[id] || null), chipOf));
        check(`${tag}: the man tapped is on the site (the pair ${pair} ms apart, the finger then on «${bare(under && under.aria)}»)`,
            placed && placed.entries.length === 1 && placed.entries[0].placeId === 'p_01', JSON.stringify(placed));
        same(`${tag}: nobody else's day moved - no man marked absent, no absence cancelled`,
            await page.evaluate(id => __others(id), chipOf), JSON.stringify(Object.entries(JSON.parse(before.day)).filter(([key]) => key !== chipOf).sort()));
        same(`${tag}: the queue holds his one field path more, and nothing else`,
            (await page.evaluate(() => FarkadSync.pendingPaths().slice())).filter(path => !before.paths.includes(path)), [`days.${DAY}.actual.${chipOf}`]);
        same(`${tag}: no dialog was opened`, await page.evaluate(() => [...document.querySelectorAll('.modal')].filter(modal => modal.style.display === 'flex').map(modal => modal.id)), []);
        same(`${tag}: the undo bar names him`, bare(await undoSays(page)), `${first} נרשם ב${SITE}`);
        await page.evaluate(() => runUndo());
        await settle(page);
        same(`${tag}: and ↶ takes back exactly that: he is waiting again and the rest of the day is what it was`,
            [await page.evaluate(id => JSON.stringify((((State.schedule.days[State.date] || {}).actual || {})[id] || { entries: [] }).entries), chipOf),
                await page.evaluate(id => __others(id), chipOf), (await waiting(page)).length],
            ['[]', JSON.stringify(Object.entries(JSON.parse(before.day)).filter(([key]) => key !== chipOf).sort()), names.length]);
        await context.close();
    }
    // The layouts measure what they say only if, on this machine, they put each of the three
    // under the finger at least once: another man's «נעדר», another man's name, and a ✕ of
    // «נעדרים». Judged after them, so it is a claim of its own and not a precondition.
    const saw = kind => underFinger.filter(Boolean).filter(kind).map(hit => bare(hit.aria));
    check('the layouts measured it: another man\'s «נעדר» came under the finger in at least one',
        saw(hit => /\bchip-side\b/.test(hit.cls) && /tray-pending/.test(hit.tray)).length > 0, JSON.stringify(underFinger));
    check('another man\'s name, in at least one', saw(hit => /\bchip-main\b/.test(hit.cls) && /tray-pending/.test(hit.tray)).length > 0,
        JSON.stringify(underFinger));
    check('and a ✕ of «נעדרים», in at least one', saw(hit => /\bchip-side\b/.test(hit.cls) && /tray-absent/.test(hit.tray)).length > 0,
        JSON.stringify(underFinger));

    // The same three, each tapped ON PURPOSE where it is after the first tap - so that what
    // is measured does not rest on where a layout happens to put it - inside the window and
    // then after it.
    suite('the trays\' one clock, control by control: inside 700 ms nothing, after it what the button says');
    // Each block is judged only on taps the page saw inside the window: a body that finds its
    // taps arrived 700 ms or more apart (a loaded machine) answers with why, and is tried
    // again in a fresh page - a third such try fails. A block that cannot finish - on a tree
    // with the defect the man it means to tap next is already somewhere else - says so as a
    // failure, and the suite goes on.
    async function guarded(name, open, body) {
        for (let attempt = 1; attempt <= 3; attempt += 1) {
            let made = null;
            try {
                made = await open();
                const late = await body(made);
                if (!late) return;
                if (attempt === 3) check(`${name}: its taps reached the page inside 700 ms in one of three fresh pages`, false, late);
            } catch (error) {
                check(`${name}: ran to its end`, false, String((error && error.message) || error).slice(0, 240));
                return;
            } finally { if (made) await made.context.close(); }
        }
    }
    await guarded('control by control', () => crew(440, 956, N1, [], 0), async ({ page }) => {
        const chip = await centred(page, CHIP);
        const ABSENT = `() => [...document.querySelectorAll('#dayView .tray-pending .chip')].find(chip => chip.querySelector('.chip-main').textContent === 'דאוד').querySelector('.chip-side')`;
        const NAME = `() => [...document.querySelectorAll('#dayView .tray-pending .chip')].find(chip => chip.querySelector('.chip-main').textContent === 'גדי').querySelector('.chip-main')`;
        await page.touchscreen.tap(chip.x, chip.y);
        await page.waitForTimeout(120);
        const absent = await page.evaluate(find => __centre((0, eval)(find)()), ABSENT);
        await page.touchscreen.tap(absent.x, absent.y);
        await page.waitForTimeout(120);
        const name = await page.evaluate(find => __centre((0, eval)(find)()), NAME);
        await page.touchscreen.tap(name.x, name.y);
        await settle(page, 200);
        const early = await page.evaluate(() => __hits.map(hit => Math.round(hit.at)));
        if (!(early.length === 3 && early[2] - early[0] < 700)) return JSON.stringify(early);
        same('«נעדר» of another man, tapped on purpose inside the window: he is not marked absent', await dayOf(page, 'w_04'), 'null');
        same('another man\'s name inside it: «לאן הלך» is not opened', await page.evaluate(() => document.getElementById('placePickerModal').style.display), '');
        same('the undo bar still names the man placed', bare(await undoSays(page)), `אמיר נרשם ב${SITE}`);

        // After the window, «נעדר» is one tap - through ↶ now, in the words of the sheet's own.
        await page.waitForTimeout(800);
        const again = await page.evaluate(find => __centre((0, eval)(find)()), ABSENT);
        await page.touchscreen.tap(again.x, again.y);
        await settle(page, 200);
        check('after the window «נעדר» marks him absent', await page.evaluate(day => isAbsent(State.schedule, day, 'w_04', 'actual'), DAY));
        same('and the undo bar says so, in the sheet\'s words for it', bare(await undoSays(page)), 'דאוד נרשם כנעדר');
        same('the header\'s ↶ is armed with that step and no other', bare(await page.evaluate(() => document.getElementById('undoBtn').getAttribute('aria-label'))), 'בטל: דאוד נרשם כנעדר');
        await page.evaluate(() => document.getElementById('undoBtn').click());
        await settle(page);
        check('↶ takes back his absence - he is waiting again', await page.evaluate(() => State.unrecorded().some(worker => worker.id === 'w_04')
            && !isAbsent(State.schedule, State.date, 'w_04', 'actual')));
        check('and leaves the man placed before him where he was', JSON.parse(await dayOf(page, 'w_01')).entries[0].placeId === 'p_01');
        await page.evaluate(() => document.getElementById('redoBtn').click());
        await settle(page);
        check('↷ marks him absent again', await page.evaluate(day => isAbsent(State.schedule, day, 'w_04', 'actual'), DAY));

        // After the window, the name opens «לאן הלך», as it always did.
        await page.waitForTimeout(800);
        const later = await page.evaluate(find => __centre((0, eval)(find)()), NAME);
        await page.touchscreen.tap(later.x, later.y);
        await settle(page, 150);
        same('after the window the name opens «לאן הלך» for him', [await page.evaluate(() => document.getElementById('placePickerModal').style.display),
            bare(await page.evaluate(() => document.getElementById('placePickerTitle').textContent))], ['flex', 'לאן הלך גדי?']);
        // And a site picked there has its own step on ↶ - it was a bare commit, and ↶ stayed
        // on the step before it.
        await page.locator('#placePickerList .place-btn', { hasText: SITE }).tap();
        await settle(page, 150);
        same('a site picked in «לאן הלך» has its own step on ↶, in the sheet\'s words',
            bare(await page.evaluate(() => document.getElementById('undoBtn').getAttribute('aria-label'))), `בטל: גדי נרשם ב${SITE}`);
        await page.evaluate(() => closePlacePicker());
        await page.evaluate(() => document.getElementById('undoBtn').click());
        await settle(page);
        same('and ↶ takes back that pick alone: the absence and the placement before it stand', [
            await page.evaluate(day => entriesFor(State.schedule, day, 'w_03', 'actual').length, DAY),
            await page.evaluate(day => isAbsent(State.schedule, day, 'w_04', 'actual'), DAY),
            JSON.parse(await dayOf(page, 'w_01')).entries[0].placeId], [0, true, 'p_01']);
    });
    // A double tap on «נעדר» itself: the next man's «נעדר» slides into its place.
    await guarded('a double tap on «נעדר»', () => crew(390, 844, N2, [], 0), async ({ page }) => {
        const FIRST = `() => [...document.querySelectorAll('#dayView .tray-pending .chip')].find(chip => chip.querySelector('.chip-main').textContent === 'גדי דוגמה').querySelector('.chip-side')`;
        const point = await centred(page, FIRST);
        const before = await page.evaluate(() => __day());
        await page.touchscreen.tap(point.x, point.y);
        await page.waitForTimeout(150);
        await page.touchscreen.tap(point.x, point.y);
        await settle(page, 250);
        const hits = await page.evaluate(() => __hits.map(hit => Math.round(hit.at)));
        if (!(hits.length === 2 && hits[1] - hits[0] < 700)) return JSON.stringify(hits);
        same('a double tap on «נעדר» marks one man absent - the one tapped',
            Object.entries(JSON.parse(await page.evaluate(() => __day()))).filter(([key, value]) => value.absent && !JSON.parse(before)[key]).map(([key]) => key), ['w_03']);
        same('and the undo bar names him', bare(await undoSays(page)), 'גדי דוגמה נרשם כנעדר');
    });
    // The last man waiting placed by his chip: «נעדרים» comes up under the finger. A ✕
    // there inside the window cancels nothing; after it, it cancels the absence it names.
    await guarded('a ✕ of «נעדרים» after the last man waiting', () => crew(375, 667, N2.slice(0, 2), AWAY, 1), async ({ page }) => {
        const chip = await centred(page, CHIP);
        const CANCEL = `() => [...document.querySelectorAll('#dayView .tray-absent .chip')].find(chip => chip.querySelector('.chip-main').textContent === 'מאיר כהן').querySelector('.chip-side')`;
        await page.touchscreen.tap(chip.x, chip.y);
        await page.waitForTimeout(150);
        const cancel = await page.evaluate(find => __centre((0, eval)(find)()), CANCEL);
        await page.touchscreen.tap(cancel.x, cancel.y);
        await settle(page, 200);
        const hits = await page.evaluate(() => __hits.map(hit => [Math.round(hit.at), hit.cls]));
        if (!(hits.length === 2 && /\bchip-usual\b/.test(hits[0][1] || '') && hits[1][0] - hits[0][0] < 700)) return JSON.stringify(hits);
        check('a ✕ of «נעדרים» inside the window cancels nothing', await page.evaluate(day => isAbsent(State.schedule, day, 'w_04', 'actual'), DAY));
        await page.waitForTimeout(800);
        const later = await page.evaluate(find => __centre((0, eval)(find)()), CANCEL);
        await page.touchscreen.tap(later.x, later.y);
        await settle(page, 200);
        check('after the window it cancels the absence it names', await page.evaluate(day => !isAbsent(State.schedule, day, 'w_04', 'actual'), DAY));
        same('and the undo bar names him', bare(await undoSays(page)), 'ההיעדרות של מאיר כהן בוטלה');
    });

    // ============================================================== the row's own two controls
    suite('the name and «נעדר» do what they did');
    {
        const { context, page } = await phone(440, 956, 'dark');
        await bring(page, 'אמיר', 0.4);
        const before = await disk(page);
        await censusOnly(check, page, before);
        await page.evaluate(() => __row('אמיר').querySelector('.chip-main').click());
        check('the name opens every site, as before', await page.evaluate(() =>
            document.getElementById('placePickerModal').style.display === 'flex'
            && document.querySelectorAll('#placePickerList .place-btn').length === 4));
        same('and writes nothing by opening', await disk(page), before);
        await page.evaluate(() => closePlacePicker());
        await page.evaluate(() => __row('אמיר').querySelector('.chip-side').click());
        await settle(page);
        check('«נעדר» marks him absent', await page.evaluate(day => isAbsent(State.schedule, day, 'w_01', 'actual'), DAY));
        check('and he is in «נעדרים», with no chip there', await page.evaluate(() =>
            document.querySelector('#dayView .tray-absent').textContent.includes('אמיר דוגמה')
            && !document.querySelector('#dayView .tray-absent .chip-usual')));

        // On paper a suggestion would read as where he worked: it is not there.
        await page.emulateMedia({ media: 'print' });
        check('under print the chip and its sentence are not laid out, while the row is', await page.evaluate(() =>
            [...document.querySelectorAll('.chip-usual, .usual-note')].every(node => getComputedStyle(node).display === 'none')
            && document.querySelectorAll('.chip-usual').length > 0 && __row('בסאם').getBoundingClientRect().height > 0));
        await page.emulateMedia({ media: 'screen' });

        // By workers: that tray is not drawn there, and neither is the chip.
        await page.evaluate(() => { setDayMode('workers'); });
        await frames(page);
        check('the by-worker list has no such tray and no chip', await page.evaluate(() =>
            !document.querySelector('#dayView .tray-pending') && !document.querySelector('#dayView .chip-usual')
            && document.querySelectorAll('#dayView .wrow').length === 11));
        await page.evaluate(() => { setDayMode('sites'); });

        // An archived site is not offered.
        await page.evaluate(() => { State.schedule.places.find(place => place.id === 'p_03').active = false; State.commitRoster(); render(); });
        await frames(page);
        check('a man whose site was archived has no chip', await page.evaluate(() => Boolean(__row('הלל')) && !__offer('הלל')));

        // While recording is held the chip records nothing.
        await page.evaluate(() => { window.__held = farkadWritesBlocked; farkadWritesBlocked = () => true; });
        const held = await dayOf(page, 'w_02');
        await page.waitForTimeout(800);
        await page.evaluate(() => __offer('בסאם').click());
        await settle(page);
        same('while recording is held a tap records nothing', await dayOf(page, 'w_02'), held);
        await page.evaluate(() => { farkadWritesBlocked = window.__held; });
        await context.close();
    }

    // ============================================================== the journey's first station
    suite('«בניית סידור», station 1: the same tray, and the counter follows a tap');
    {
        const { context, page } = await phone(440, 956, 'dark');
        await page.evaluate(() => { State.date = todayStr(); render(); journeyStart(); });
        await settle(page, 200);
        same('the journey opened the day screen on tomorrow', await page.evaluate(() => State.date), DAY);
        check('with its row in the dock', await page.evaluate(() => Boolean(document.getElementById('journeyDock'))));
        const count = () => page.evaluate(() => document.getElementById('journeyCount').textContent);
        check('the counter says eleven are not recorded', (await count()).includes('לא נרשמו: 11'), await count());
        await bring(page, 'כמאל', 0.35);
        check('the chips are there', (await page.evaluate(() => document.querySelectorAll('#dayView .tray-pending .chip-usual').length)) === 8);
        check('and whole above the dock', await page.evaluate(() => {
            const offer = __offer('כמאל').getBoundingClientRect(); const dock = document.querySelector('.day-actions').getBoundingClientRect();
            const header = document.querySelector('#dayView .day-header').getBoundingClientRect();
            return offer.bottom <= dock.top && offer.top >= header.bottom; }));
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/usual-3-journey-station1-440-dark.jpg`, type: 'jpeg', quality: 82 });
        await tapOffer(page, 'כמאל');
        await settle(page, 200);
        check('one tap, and he is placed', JSON.parse(await dayOf(page, 'w_11')).entries[0].placeId === 'p_01');
        check('the counter says ten, and one placed', (await count()).includes('לא נרשמו: 10') && (await count()).includes('שובצו: 1'), await count());
        same('the journey is still at its first station', await page.evaluate(() => journeyStation()), 1);
        await context.close();
    }

    suite('nothing broke on the way');
    same('no page error on any phone', errors.join(' | '), '');
} finally {
    await browser.close();
    await server.close();
}

report();
