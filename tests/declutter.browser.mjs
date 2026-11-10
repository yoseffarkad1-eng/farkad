// The day screen, decluttered (v167): what the owner approved with «إيه، هيك منيح».
//
//   node tests/declutter.browser.mjs
//
// THE ROW. A man on a site card used to carry a rate <select> - «רגיל», «שעות נוספות»,
// «יום כפול» - on every row, and an hours box beside it for overtime: a column of «רגיל»
// down every card, read thirty times an evening to find the one day that was not. Now a
// row is the man's name, the ✕, and a tag ONLY when his day there is not regular, worded
// exactly as the rate is everywhere else (RATE_LABELS, js/model/schema.js). The name is
// the way in: it opens the assign sheet for him, where the rate chips and the hours box
// already were, undoable, and where the kind is now chosen.
//
// THE SHEET, OPENED FROM A ROW, STAYS ON HIM. It walks to the next unrecorded man when it
// is opened from the tally («נרשמו X מתוך Y») or from a row of the by-worker list - that
// is the evening's run down the roster. Opened from one man's row on a site it is about
// that man: «נעדר», or taking him off his site and putting him on another, leaves the
// sheet on him, and it has no forward button.
//
// A DOUBLE TAP ON A NAME IS ONE TAP. The sheet opens over the row at once, so the second
// tap lands on whatever the sheet put under the finger - a site's tile, a rate. For
// DOUBLE_TAP_GUARD_MS after a row opens it, a finger's tap on the sheet does nothing; the
// cases below that use the sheet after opening it from a row wait that moment out, as a
// person reading the sheet does.
//
// THE HEADER, COMPACT, IS ONE ROW (B1). v101 promised it; v116 put «הכל חופש» on the
// switch's line, and the line stayed on the screen when the rest of the tools row went.
//
// Measured in Chromium with touch, dark, at 3x: 440x894 (the owner's phone), 390x844 and
// 320x640. Not measured: a real iPhone.

import { chromium } from 'playwright';
import { launchLocalBrowser } from './network-guard.mjs';
import { serve } from './serve.mjs';
import { expectedShaFor, verifyServedAssets } from './treecheck.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
const served = await verifyServedAssets(server.url, root, expectedShaFor(root));
check('the origin served this commit, byte for byte', served.ok,
    `${served.checked} assets; ${(served.wrong || []).slice(0, 3).join(' | ')}`);
const browser = await launchLocalBrowser(chromium, { executablePath: process.env.CHROME_PATH });

// A Tuesday shaped like the mockup's: one long site with a double day, an overtime day
// (two hours, and an hourly rate behind them) and a man on two sites - regular on one,
// double on the other - a short second site, an empty third, two men nobody has placed
// yet and one away.
const DATE = '2026-11-03';
const HADAR = 'רחובות - הדר';
const NESS = 'נס ציונה';
const GIVAT = 'גבעת שמואל';
const LONG = 'מוחמד עבד אל רחמן מחאמיד';
const PLACES = [['p1', HADAR], ['p2', NESS], ['p3', GIVAT]];
const PLACED = [
    ['סאמר חלבי', 'p1', 'normal'], ['אבו נאדר', 'p1', 'normal'], ['מוחמד עודה', 'p1', 'double'],
    ["ח'אלד מנסור", 'p1', 'extra', 2], ['יוסי לוי', 'p1', 'normal'], ['ראאד כיוף', 'p1', 'normal'],
    [LONG, 'p1', 'double'], ['יוסי לוי', 'p2', 'double'], ['סלים חורי', 'p2', 'normal']];
const UNPLACED = ['עלי חסן', 'נאדר עלי'];
const AWAY = ['חוסיין דיב'];
// The exact words a tag may say - the rate's own label, and nothing new.
const WORDS = { normal: 'רגיל', extra: 'שעות נוספות', double: 'יום כפול' };
const bare = text => String(text || '').replace(/[⁦-⁩]/g, '');

async function open(width, height, mode = 'sites') {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 3,
        isMobile: true, hasTouch: true, colorScheme: 'dark', serviceWorkers: 'block' });
    await context.route('**/*', route => {
        const url = new URL(route.request().url());
        return ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
            || ['data:', 'blob:', 'about:'].includes(url.protocol) ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(server.url, { waitUntil: 'load' });
    await page.evaluate(([places, placed, unplaced, away, date, mode]) => {
        todayStr = () => date;
        const workers = [];
        const idOf = name => {
            let worker = workers.find(one => one.name === name);
            if (!worker) {
                worker = { id: 'w' + String(workers.length + 1).padStart(2, '0'), name, active: true, dailyRate: 400, hourlyRate: 50 };
                workers.push(worker);
            }
            return worker.id;
        };
        placed.forEach(([name]) => idOf(name));
        unplaced.forEach(idOf);
        away.forEach(idOf);
        State.schedule.workers = workers;
        State.schedule.places = places.map(([id, name]) => ({ id, name, active: true }));
        State.date = date;
        placed.forEach(([name, placeId, rate, hours]) =>
            assignPlace(State.schedule, date, idOf(name), 'actual', placeId, rate, hours || 0));
        away.forEach(name => markAbsent(State.schedule, date, idOf(name), 'actual'));
        setRimaCount(State.schedule, date, 'p1', 2);
        State.save();
        showView('day'); setDayMode(mode); render();
        const banner = document.getElementById('accountBanner');
        const putAway = banner && banner.style.display !== 'none' && banner.querySelector(':scope > .btn-icon');
        if (putAway) putAway.click();

        window.__idOf = name => (State.schedule.workers.find(worker => worker.name === name) || {}).id;
        window.__nameOf = node => (node && node.firstChild ? node.firstChild.textContent.trim() : null);
        window.__card = site => [...document.querySelectorAll('#dayView .site-card')]
            .find(card => card.querySelector('.site-name').textContent === site) || null;
        window.__row = (site, name) => {
            const card = __card(site);
            return card ? [...card.querySelectorAll('.assign-row')]
                .find(row => __nameOf(row.querySelector('.assign-name')) === name) || null : null;
        };
        // What a finger on the man's name lands on: the button around it, or the bare name.
        window.__name = (site, name) => {
            const row = __row(site, name);
            const node = row && row.querySelector('.assign-name');
            return node ? (node.closest('button') || node) : null;
        };
        // Every rate word the row shows - a tag's text, or the value a select displays.
        window.__words = row => {
            const labels = Object.values(RATE_LABELS);
            const out = [];
            row.querySelectorAll('*').forEach(node => {
                if (node.tagName === 'SELECT') {
                    const option = node.options[node.selectedIndex];
                    if (option) out.push(option.text.trim());
                    return;
                }
                if (node.closest('select') || node.children.length) return;
                const box = node.getBoundingClientRect();
                const text = node.textContent.trim();
                if (box.width >= 1 && box.height >= 1 && labels.includes(text)) out.push(text);
            });
            return out;
        };
        // One man at one site: what the screen says, what memory holds, what the disk holds.
        window.__truth = (site, name) => {
            const id = __idOf(name);
            const place = State.schedule.places.find(one => one.name === site);
            const disk = JSON.parse(Store.get('scheduleData:v2'));
            const at = schedule => entriesFor(schedule, State.date, id, 'actual').find(entry => entry.placeId === place.id);
            const mem = at(State.schedule), saved = at(disk);
            const row = __row(site, name);
            return { tags: row ? [...row.querySelectorAll('.assign-rate')].map(node => node.textContent.trim()) : null,
                memory: mem ? entryRate(mem) : null, disk: saved ? entryRate(saved) : null,
                hours: [mem ? entryExtraHours(mem) : null, saved ? entryExtraHours(saved) : null] };
        };
        window.__sheet = () => {
            const sheet = document.getElementById('assignSheet');
            return { open: sheet.style.display === 'flex', who: sheetWorkerId,
                title: document.getElementById('assignSheetTitle').textContent,
                forward: [...document.querySelectorAll('#assignSheetFoot .sheet-fwd')].map(node => bareText(node.textContent)),
                actions: [...document.querySelectorAll('#assignSheetFoot .sheet-actions button')].map(node => bareText(node.textContent)) };
        };
        window.bareText = text => String(text || '').replace(/[⁦-⁩]/g, '').trim();
        // Every commit, counted where every edit passes.
        window.__commits = 0;
        const commit = State.commit, many = State.commitMany;
        State.commit = function () { window.__commits += 1; return commit.apply(this, arguments); };
        State.commitMany = function () { window.__commits += 1; return many.apply(this, arguments); };
    }, [PLACES, PLACED, UNPLACED, AWAY, DATE, mode]);
    await frames(page);
    return { context, page, errors };
}

const frames = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
const settle = (page, ms = 80) => page.evaluate(ms => new Promise(done =>
    setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(done)), ms)), ms);

// The node a page-side expression names, brought to a fraction of the screen's height.
// Three passes, because the header compacts once the page is scrolled and everything under
// it moves up (a point measured before that lands on the row below). A node inside a
// dialog is scrolled into its own box instead.
async function bring(page, find, fraction = 0.5) {
    for (let pass = 0; pass < 3; pass++) {
        await page.evaluate(([find, fraction]) => {
            const node = (0, eval)(find)();
            if (!node) return;
            if (node.closest('.modal')) node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            else window.scrollTo(0, Math.max(0, scrollY + node.getBoundingClientRect().top - innerHeight * fraction));
        }, [find, fraction]);
        await settle(page, 30);
    }
}
const centre = (page, find) => page.evaluate(find => {
    const node = (0, eval)(find)();
    if (!node) return null;
    const box = node.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}, find);

// A finger on the middle of what the page-side expression names, brought on screen first.
// Null, and no tap, when there is nothing there.
async function tap(page, find, fraction = 0.5) {
    await bring(page, find, fraction);
    const point = await centre(page, find);
    if (point) {
        await page.touchscreen.tap(point.x, point.y);
        await settle(page);
    }
    return point;
}
// The name tapped, and the moment in which the sheet takes no finger waited out.
async function openFromRow(page, site, name) {
    const point = await tap(page, `() => __name(${JSON.stringify(site)}, ${JSON.stringify(name)})`);
    await page.waitForTimeout(750);
    return point;
}
const sheetChip = (site, word) => `() => { const row = [...document.querySelectorAll('#assignSheet .sheet-rate-row')]
    .find(one => one.querySelector('.sheet-rate-name').textContent.includes('${site}'));
    return row ? [...row.querySelectorAll('button')].find(one => one.textContent.trim() === '${word}') || null : null; }`;
const sheetAction = word => `() => [...document.querySelectorAll('#assignSheetFoot .sheet-actions button')]
    .find(one => bareText(one.textContent) === '${word}') || null`;
const sheetTile = site => `() => [...document.querySelectorAll('#assignSheet .sheet-place')]
    .find(one => one.textContent.includes('${site}')) || null`;

async function scenario(name, size, body, mode) {
    const { context, page, errors } = await open(size[0], size[1], mode);
    try {
        await body(page);
    } catch (error) {
        check(`${name} ran to its end`, false, String(error && error.message || error).split('\n')[0]);
    }
    same(`${name}: no page error`, errors, []);
    await context.close();
}

try {
    const PHONE = [440, 894];

    // ------------------------------------------------------------------ the row
    suite('a row on a site is the name, the ✕, and a tag only when the day is not regular');
    await scenario('the rows', PHONE, async page => {
        const rows = await page.evaluate(() => [...document.querySelectorAll('#dayView .site-grid .assign-row')].map(row => ({
            name: __nameOf(row.querySelector('.assign-name')),
            site: row.closest('.site-card').querySelector('.site-name').textContent,
            anchor: row.dataset.anchor,
            selects: row.querySelectorAll('select').length,
            boxes: row.querySelectorAll('input, textarea').length,
            buttons: [...row.querySelectorAll('button')].map(node => node.classList.contains('btn-icon') ? '✕' : 'name'),
            tags: [...row.querySelectorAll('.assign-rate')].map(node => node.textContent.trim()),
            words: __words(row),
            split: [...row.querySelectorAll('.badge-split')].map(node => node.textContent.trim())
        })));
        given('every placed man has his row', rows.length === PLACED.length, JSON.stringify(rows.map(row => row.name)));
        same('no select on any row of any site', rows.filter(row => row.selects > 0).map(row => row.name), []);
        same('and no select, rate control or hours box anywhere on the by-site day', await page.evaluate(() =>
            document.querySelectorAll('#dayView .site-grid select, #dayView .site-grid .rate-select, #dayView .site-grid .rate-control, #dayView .site-grid .rate-hours').length), 0);
        same('no box to type into on a row either', rows.filter(row => row.boxes > 0).map(row => row.name), []);
        same('a row has two buttons: the name, then the ✕', [...new Set(rows.map(row => row.buttons.join(',')))], ['name,✕']);
        for (const [name, placeId, rate] of PLACED) {
            const site = PLACES.find(([id]) => id === placeId)[1];
            const row = rows.find(one => one.name === name && one.site === site);
            const want = rate === 'normal' ? [] : [WORDS[rate]];
            same(`${name} at ${site} (${rate}): the tag says ${want.length ? want[0] : 'nothing'}`, row ? row.tags : null, want);
            same(`${name} at ${site}: and no other rate word is on his row`, row ? row.words : null, want);
            same(`${name} at ${site}: the row keeps its place key`, row ? row.anchor : null, `row:${placeId}:${await page.evaluate(n => __idOf(n), name)}`);
        }
        same('the tag is the rate\'s own label, word for word', await page.evaluate(() =>
            [RATE_LABELS[RATE_DOUBLE], RATE_LABELS[RATE_EXTRA], RATE_LABELS[RATE_NORMAL]]), [WORDS.double, WORDS.extra, WORDS.normal]);
        same('«2 אתרים» stays on both of יוסי לוי\'s rows', rows.filter(row => row.name === 'יוסי לוי').map(row => row.split), [['2 אתרים'], ['2 אתרים']]);
        same('the rate is per site: double at נס ציונה only', rows.filter(row => row.name === 'יוסי לוי').map(row => row.tags), [[], [WORDS.double]]);
        const label = await page.evaluate(([site, name]) => {
            const node = __name(site, name);
            const said = node ? node.getAttribute('aria-label') || '' : '';
            return { said: said.replace(/[⁦-⁩]/g, ''), isolated: (said.match(/⁨/g) || []).length === 2 && (said.match(/⁩/g) || []).length === 2 };
        }, [HADAR, 'מוחמד עודה']);
        same('the name says the man, the site and the rate to a screen reader', label.said, `מוחמד עודה ב${HADAR} · ${WORDS.double}`);
        check('with both names bidi-isolated, like every other name in every label', label.isolated, JSON.stringify(label));
        same('a regular day says so to a screen reader, where the eye needs no tag', await page.evaluate(([site, name]) => {
            const node = __name(site, name);
            return node ? (node.getAttribute('aria-label') || '').replace(/[⁦-⁩]/g, '') : null;
        }, [HADAR, 'אבו נאדר']), `אבו נאדר ב${HADAR} · ${WORDS.normal}`);
        // v183 MOVED: the last thing on a card is the LINE of counts (.site-counts), and the
        // רימא box is the first thing on that line - «יוסף גבס» sits beside it. Still one
        // box of hers on every card, still at the card's foot.
        same('every site card keeps its רימא box at its foot, first on the line of counts', await page.evaluate(() =>
            [...document.querySelectorAll('#dayView .site-card')].map(card => [card.querySelectorAll('.rima-field .rima-input').length,
                card.lastElementChild.classList.contains('site-counts')
                    && card.lastElementChild.firstElementChild.classList.contains('rima-field')])), [[1, true], [1, true], [1, true]]);
        same('and its count', await page.evaluate(site => __card(site).querySelector('.rima-input').value, HADAR), '2');
    });

    // ------------------------------------------------------------------ the name opens the sheet
    suite('the name opens the sheet for that man, and the kind is chosen there');
    await scenario('«יום כפול» from the sheet', PHONE, async page => {
        const before = await page.evaluate(site => __truth(site, 'אבו נאדר'), HADAR);
        given('אבו נאדר is regular at הדר, on the screen, in memory and on the disk',
            JSON.stringify([before.memory, before.disk]) === '["normal","normal"]', JSON.stringify(before));
        await openFromRow(page, HADAR, 'אבו נאדר');
        const opened = await page.evaluate(() => __sheet());
        same('a tap on the name opens the assign sheet', opened.open, true);
        same('for that man', [opened.who, opened.title], [await page.evaluate(() => __idOf('אבו נאדר')), 'אבו נאדר']);
        same('opening it commits nothing', await page.evaluate(() => __commits), 0);
        const chips = await page.evaluate(() => [...document.querySelectorAll('#assignSheet .sheet-rate-row button')].map(node => node.textContent.trim()));
        same('the sheet has the three rate chips', chips, [WORDS.normal, WORDS.extra, WORDS.double]);

        await tap(page, sheetChip(HADAR, WORDS.double));
        same('choosing «יום כפול» commits once', await page.evaluate(() => __commits), 1);
        const chosen = await page.evaluate(() => ({ sheet: __sheet(),
            on: [...document.querySelectorAll('#assignSheet .sheet-rate-row .chip-on')].map(node => node.textContent.trim()) }));
        same('the sheet is still on him, and says «יום כפול»', [chosen.sheet.open, chosen.sheet.title, chosen.on], [true, 'אבו נאדר', [WORDS.double]]);
        await tap(page, sheetAction('סגור'));
        const after = await page.evaluate(site => __truth(site, 'אבו נאדר'), HADAR);
        same('the tag appears on his row - and the screen, memory and the disk agree', after,
            { tags: [WORDS.double], memory: 'double', disk: 'double', hours: [0, 0] });
        const undo = await page.evaluate(() => bareText(document.getElementById('undoBtn').getAttribute('aria-label')));
        same('↶ holds that step, by name', undo, `בטל: אבו נאדר: ${WORDS.double}`);
        await page.evaluate(() => window.scrollTo(0, 0));
        await settle(page);
        await tap(page, `() => document.getElementById('undoBtn')`);
        same('↶ takes it back - the tag goes, memory and the disk are regular again',
            await page.evaluate(site => __truth(site, 'אבו נאדר'), HADAR), { tags: [], memory: 'normal', disk: 'normal', hours: [0, 0] });
        await tap(page, `() => document.getElementById('redoBtn')`);
        same('and ↷ puts it back', await page.evaluate(site => __truth(site, 'אבו נאדר'), HADAR),
            { tags: [WORDS.double], memory: 'double', disk: 'double', hours: [0, 0] });
        same('one commit each way, and no other', await page.evaluate(() => __commits), 3);
    });

    await scenario('the hours box, for overtime', PHONE, async page => {
        await openFromRow(page, HADAR, "ח'אלד מנסור");
        const box = await page.evaluate(() => {
            const node = document.querySelector('#assignSheet .rate-hours');
            return node ? { value: node.value, type: node.type, font: parseFloat(getComputedStyle(node).fontSize),
                said: bareText(node.getAttribute('aria-label')) } : null;
        });
        same('the hours box is in his sheet, holding his two hours', box,
            { value: '2', type: 'number', font: 16, said: `שעות נוספות ב${HADAR}` });
        await tap(page, `() => document.querySelector('#assignSheet .rate-hours')`);
        await page.keyboard.press('End');
        await page.keyboard.press('Backspace');
        await page.keyboard.type('3');
        await page.evaluate(() => document.querySelector('#assignSheet .rate-hours').blur());
        await settle(page);
        same('typed and left, it records three hours - once - in memory and on the disk',
            [await page.evaluate(() => __commits), (await page.evaluate(site => __truth(site, "ח'אלד מנסור"), HADAR)).hours], [1, [3, 3]]);
        await tap(page, sheetAction('סגור'));
        same('and his row says «שעות נוספות», nothing more', await page.evaluate(site => __truth(site, "ח'אלד מנסור"), HADAR),
            { tags: [WORDS.extra], memory: 'extra', disk: 'extra', hours: [3, 3] });
    });

    // Two taps 120 ms apart on a name: one where the sheet opens UNDER the finger (the second
    // tap lands on a tile or a chip), one where it opens below it (the second lands on the
    // dark backdrop above the sheet, which closes a dialog).
    // The sheet takes the lower half of a 440x894 phone. For the first case his name is
    // brought to where the sheet will put the גבעת שמואל tile, and the finger lands where
    // the two overlap - a second site for him if the tap went through; for the second, his
    // name is high on the screen, above the sheet.
    for (const [where, site, name, fraction] of [["on a site's tile", NESS, 'סלים חורי', null],
        ['on the backdrop above it', HADAR, 'אבו נאדר', 0.25]]) {
        await scenario(`a double tap on a name, the second ${where}`, PHONE, async page => {
            const was = await page.evaluate(() => JSON.stringify(State.schedule.days[State.date].actual));
            const find = `() => __name(${JSON.stringify(site)}, ${JSON.stringify(name)})`;
            let point;
            if (fraction === null) {
                // Where the tile will be: the sheet opened and closed again, off the record.
                const tile = await page.evaluate(([name, tileSite]) => {
                    openAssignSheet(__idOf(name), { stay: true });
                    const node = [...document.querySelectorAll('#assignSheet .sheet-place')].find(one => one.textContent.includes(tileSite));
                    const box = node.getBoundingClientRect();
                    closeAssignSheet();
                    return { top: box.top, bottom: box.bottom, left: box.left, right: box.right };
                }, [name, GIVAT]);
                for (let pass = 0; pass < 3; pass++) {
                    await page.evaluate(([find, y]) => {
                        const box = (0, eval)(find)().getBoundingClientRect();
                        window.scrollTo(0, Math.max(0, scrollY + (box.top + box.bottom) / 2 - y));
                    }, [find, (tile.top + tile.bottom) / 2]);
                    await settle(page, 30);
                }
                point = await page.evaluate(([find, tile]) => {
                    const box = (0, eval)(find)().getBoundingClientRect();
                    const left = Math.max(box.left, tile.left), right = Math.min(box.right, tile.right);
                    const top = Math.max(box.top, tile.top), bottom = Math.min(box.bottom, tile.bottom);
                    return right - left > 4 && bottom - top > 4 ? { x: (left + right) / 2, y: (top + bottom) / 2 } : null;
                }, [find, tile]);
            } else {
                await bring(page, find, fraction);
                point = await centre(page, find);
            }
            check(`the finger has a place to land (${where})`, point !== null);
            if (point) {
                await page.touchscreen.tap(point.x, point.y);
                await page.waitForTimeout(120);
                await page.touchscreen.tap(point.x, point.y);
                await settle(page, 200);
            }
            // What the second tap landed on: the sheet holds still while the guard holds, so
            // what is under the finger now is what was under it then.
            const under = point ? await page.evaluate(([x, y]) => {
                const node = document.elementFromPoint(x, y);
                if (!node || !node.closest('#assignSheet')) return null;
                if (node.id === 'assignSheet') return 'backdrop';
                const hit = node.closest('.sheet-place');
                return hit ? 'tile' : 'sheet';
            }, [point.x, point.y]) : null;
            same(`the second tap landed ${where}`, under, fraction === null ? 'tile' : 'backdrop');
            const after = await page.evaluate(was => ({ sheet: __sheet(), commits: __commits,
                same: JSON.stringify(State.schedule.days[State.date].actual) === was,
                disk: JSON.stringify(JSON.parse(Store.get('scheduleData:v2')).days[State.date].actual) === was }), was);
            same(`two taps 120 ms apart on a name (${where}): his sheet is open, and nothing was changed`,
                [after.sheet.open, after.sheet.title, after.commits, after.same, after.disk], [true, name, 0, true, true]);
            await page.waitForTimeout(750);
            await tap(page, sheetChip(site, WORDS.extra));
            same(`the moment over (${where}), a tap on the sheet is a tap`,
                await page.evaluate(([site, name]) => [__commits, __truth(site, name).memory], [site, name]), [1, 'extra']);
        });
    }

    // ------------------------------------------------------------------ it stays on him
    suite('opened from a site\'s row, the sheet stays on that man');
    await scenario('«נעדר» and a re-place', PHONE, async page => {
        const man = await page.evaluate(() => __idOf('ראאד כיוף'));
        await openFromRow(page, HADAR, 'ראאד כיוף');
        const opened = await page.evaluate(() => __sheet());
        same('the sheet is open on him', [opened.open, opened.who], [true, man]);
        same('with no forward button', opened.forward, []);
        same('its buttons are «נעדר» and «סגור»', opened.actions, ['נעדר', 'סגור']);

        await tap(page, sheetAction('נעדר'));
        const absent = await page.evaluate(() => ({ sheet: __sheet(), status: document.querySelector('#assignSheet .sheet-status').textContent,
            memory: isAbsent(State.schedule, State.date, sheetWorkerId, 'actual'),
            disk: isAbsent(JSON.parse(Store.get('scheduleData:v2')), State.date, sheetWorkerId, 'actual') }));
        same('«נעדר» records him away, in memory and on the disk', [absent.memory, absent.disk], [true, true]);
        same('and the sheet stays on him - it does not walk on', [absent.sheet.open, absent.sheet.who, absent.sheet.title, absent.status],
            [true, man, 'ראאד כיוף', 'נעדר ביום הזה']);
        same('still no forward button', absent.sheet.forward, []);

        await tap(page, sheetTile(NESS));
        const placed = await page.evaluate(() => ({ sheet: __sheet(), at: entriesFor(State.schedule, State.date, sheetWorkerId, 'actual').map(e => e.placeId),
            disk: entriesFor(JSON.parse(Store.get('scheduleData:v2')), State.date, sheetWorkerId, 'actual').map(e => e.placeId) }));
        same('placed again, on נס ציונה - in memory and on the disk', [placed.at, placed.disk], [['p2'], ['p2']]);
        same('and the sheet is still on him', [placed.sheet.open, placed.sheet.who], [true, man]);
        same('with no forward button', placed.sheet.forward, []);

        // Taken off his site and put on another: the other road to a first site.
        await tap(page, sheetTile(NESS));
        same('taken off נס ציונה, the sheet stays on him', await page.evaluate(() => [__sheet().who,
            entriesFor(State.schedule, State.date, sheetWorkerId, 'actual').length]), [man, 0]);
        await tap(page, sheetTile(GIVAT));
        const moved = await page.evaluate(() => ({ sheet: __sheet(), at: entriesFor(State.schedule, State.date, sheetWorkerId, 'actual').map(e => e.placeId) }));
        same('put on גבעת שמואל, the sheet is still on him', [moved.sheet.open, moved.sheet.who, moved.at], [true, man, ['p3']]);
        same('and still without a forward button', moved.sheet.forward, []);
        same('four edits, four commits', await page.evaluate(() => __commits), 4);
        await tap(page, sheetAction('סגור'));
        same('closed, the day shows him on גבעת שמואל', await page.evaluate(site => Boolean(__row(site, 'ראאד כיוף')), GIVAT), true);
    });

    // ------------------------------------------------------------------ the walk-through
    suite('opened any other way, the sheet walks the evening as it always did');
    await scenario('from the tally, and after a row', PHONE, async page => {
        const unrecorded = await page.evaluate(() => State.unrecorded().map(worker => worker.id));
        given('two men are not recorded yet', unrecorded.length === 2, JSON.stringify(unrecorded));
        // The row first: what it changes must not outlive it.
        await openFromRow(page, NESS, 'סלים חורי');
        await tap(page, sheetAction('סגור'));
        await page.evaluate(() => window.scrollTo(0, 0));
        await settle(page);
        await tap(page, `() => document.querySelector('#dayView .day-header button.now-count')`);
        const first = await page.evaluate(() => __sheet());
        same('«נרשמו X מתוך Y» opens the sheet on the first man not recorded', [first.open, first.who], [true, unrecorded[0]]);
        same('with the forward button, which skips him', first.forward, ['דלג']);
        await tap(page, sheetAction('נעדר'));
        const next = await page.evaluate(id => ({ sheet: __sheet(), away: isAbsent(State.schedule, State.date, id, 'actual') }), unrecorded[0]);
        same('«נעדר» records him and walks on to the next', [next.away, next.sheet.who], [true, unrecorded[1]]);
        await tap(page, sheetTile(GIVAT));
        same('a site for the last man closes the run', await page.evaluate(() => [__sheet().open,
            entriesFor(State.schedule, State.date, __idOf('נאדר עלי'), 'actual').map(e => e.placeId)]), [false, ['p3']]);
    });

    await scenario('from a row of the by-worker list', PHONE, async page => {
        await tap(page, `() => [...document.querySelectorAll('#dayView .wrow')].find(row => row.querySelector('.wrow-name').firstChild.textContent.trim() === 'סאמר חלבי').querySelector('.wrow-main')`);
        const sheet = await page.evaluate(() => __sheet());
        same('by worker, a row opens the sheet on that man', [sheet.open, sheet.title], [true, 'סאמר חלבי']);
        same('and it offers to go on to the next man not recorded', sheet.forward, ['המשך אל עלי חסן']);
        same('the by-worker list still has no select', await page.evaluate(() => document.querySelectorAll('#dayView select').length), 0);
        same('and still marks a double day on the man\'s site tag', await page.evaluate(() =>
            [...document.querySelectorAll('#dayView .wrow')].find(row => row.querySelector('.wrow-name').firstChild.textContent.trim() === 'מוחמד עודה')
                .querySelector('.tag-rate').textContent), 'כפול');
    }, 'workers');

    await scenario('from the tray', PHONE, async page => {
        await tap(page, `() => document.querySelector('#dayView .tray-pending .chip-main')`);
        same('a name in the tray opens the place picker, as it did - not the sheet', await page.evaluate(() =>
            [document.getElementById('placePickerModal').style.display, __sheet().open]), ['flex', false]);
    });

    // ------------------------------------------------------------------ B1
    suite('the compact header is one row (B1)');
    for (const size of [[440, 894], [390, 844], [320, 640]]) {
        await scenario(`${size[0]}x${size[1]}: the header`, size, async page => {
            const rows = () => page.evaluate(() => {
                const header = document.querySelector('#dayView .day-header');
                const nav = header.querySelector('.day-nav').getBoundingClientRect();
                const below = [];
                header.querySelectorAll('button, strong, .day-date').forEach(node => {
                    const box = node.getBoundingClientRect();
                    if (box.width <= 1 || box.height <= 1 || getComputedStyle(node).visibility === 'hidden') return;
                    if (box.top >= nav.bottom - 1) below.push((bareText(node.textContent) || bareText(node.getAttribute('aria-label'))).slice(0, 24));
                });
                const line = header.querySelector('.day-switch');
                return { compact: document.body.classList.contains('day-compact'),
                    switchShown: line ? getComputedStyle(line).display !== 'none' : null,
                    below, header: Math.round(header.getBoundingClientRect().height), nav: Math.round(nav.height) };
            });
            const top = await rows();
            same(`${size[0]}: at the top the header is full, and the switch and «הכל חופש» are on it`,
                [top.compact, top.switchShown, top.below.includes('הכל חופש')], [false, true, true]);
            await page.evaluate(() => window.scrollTo(0, 200));
            await settle(page, 120);
            const down = await rows();
            same(`${size[0]}: scrolled, it is compact`, down.compact, true);
            same(`${size[0]}: and the switch's line is gone with the rest of the tools row`, down.switchShown, false);
            same(`${size[0]}: nothing under the date's row - one row`, down.below, []);
            check(`${size[0]}: as tall as that row and its padding`, down.header - down.nav <= 16, JSON.stringify(down));
            await page.evaluate(() => window.scrollTo(0, 0));
            await settle(page, 120);
            same(`${size[0]}: back at the top, the switch is back`, (await rows()).switchShown, true);
        });
    }

    // ------------------------------------------------------------------ fingers and widths
    suite('44px targets, and nothing over the edge at 320px');
    for (const size of [[440, 894], [320, 640]]) {
        await scenario(`${size[0]}x${size[1]}: the rows`, size, async page => {
            const m = await page.evaluate(() => {
                const rows = [...document.querySelectorAll('#dayView .site-grid .assign-row')];
                const box = node => node ? node.getBoundingClientRect() : null;
                return {
                    doc: document.documentElement.scrollWidth, client: document.documentElement.clientWidth,
                    targets: rows.map(row => {
                        const name = row.querySelector('.assign-name');
                        const target = name && name.closest('button');
                        const x = row.querySelector(':scope > .btn-icon');
                        const t = box(target), b = box(x), r = box(row), card = box(row.closest('.site-card'));
                        const tag = row.querySelector('.assign-rate');
                        return { who: __nameOf(name), target: t ? [Math.round(t.width), Math.round(t.height)] : null,
                            x: b ? [Math.round(b.width), Math.round(b.height)] : null,
                            inside: Boolean(t && b && r && t.left >= r.left - 1 && t.right <= r.right + 1 && b.left >= r.left - 1 && b.right <= r.right + 1
                                && r.left >= card.left - 1 && r.right <= card.right + 1),
                            tagInside: !tag || Boolean(t && box(tag).left >= t.left - 1 && box(tag).right <= t.right + 1),
                            tagFont: tag ? parseFloat(getComputedStyle(tag).fontSize) : null,
                            oneLine: Boolean(t && b && Math.abs((t.top + t.bottom) / 2 - (b.top + b.bottom) / 2) <= 4),
                            nameWidth: name ? Math.round(box(name).width) : 0 };
                    })
                };
            });
            given(`${size[0]}: the rows were drawn`, m.targets.length === PLACED.length, JSON.stringify(m.targets.length));
            same(`${size[0]}: every name is a target at least 44px wide and 44px tall`,
                m.targets.filter(one => !one.target || one.target[0] < 44 || one.target[1] < 44).map(one => [one.who, one.target]), []);
            same(`${size[0]}: every ✕ too`, m.targets.filter(one => !one.x || one.x[0] < 44 || one.x[1] < 44).map(one => [one.who, one.x]), []);
            same(`${size[0]}: the name, its tag and the ✕ stay inside the row and the card`, m.targets.filter(one => !one.inside || !one.tagInside).map(one => one.who), []);
            same(`${size[0]}: the ✕ stays on its man's line, the longest name and its tag included`, m.targets.filter(one => !one.oneLine).map(one => one.who), []);
            same(`${size[0]}: a tag is no smaller than the app's 14px text`, m.targets.filter(one => one.tagFont !== null && one.tagFont < 14).map(one => [one.who, one.tagFont]), []);
            same(`${size[0]}: and every name still has a box to be read in`, m.targets.filter(one => one.nameWidth < 60).map(one => [one.who, one.nameWidth]), []);
            check(`${size[0]}: the day fits across`, m.doc <= m.client + 1, JSON.stringify([m.doc, m.client]));
        });
    }
} finally {
    await browser.close();
    server.close();
}
report();
