// THE CREW AS CARDS, in a real Chromium with a touch screen.
//
// The owner, 2026-11-27: make each card of «צוות» square, two side by side, pretty and tidy.
// css/design.css (its last block) draws a man and a site as a card, two to a line on a phone;
// js/ui/roster.js gained two wrappers and no word. This suite holds what a picture cannot:
//
//   - two cards on every line at 320, 375 and 440 in both schemes, the same width, the same
//     height, read right to left and top to bottom in ROSTER order;
//   - each name whole (wrapped, never cut), first in its card and the largest thing in it;
//   - every control inside its own card, 44px both ways, no two over each other, and the
//     feet of a pair on one line whatever the names above them cost;
//   - the page never scrolls sideways, nothing stands out of its card, no letter under 14px,
//     every word at 4.5:1 - measured by the ruler of tests/screens.mjs;
//   - the same at doubled text; «תצוגה גדולה»: one card to a line under 420px, two from there,
//     with that mode's own floors (52px, 18px);
//   - an archived man is the same card inside the fold, and a shut fold draws none;
//   - «סדר מחדש» is still one man to a line in roster order, and its arrows still move him;
//   - a tap on each control does what it did: the card, the switch, «עוד ⋯», for a man and a site;
//   - the words of the phone-and-rates line are character for character what they were;
//   - none of it reaches paper.
//
// NOT a real phone.
import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import { launchLocalBrowser } from './network-guard.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import { measureInPage, LARGE_KEY } from './screens.mjs';

const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
check('the browser is served the named tree', (await verifyServedAssets(server.url, root, expectedShaFor(root))).ok);
const browser = await launchLocalBrowser(chromium, { executablePath: process.env.CHROME_PATH });

const LONG = 'עבד אל רחמן אבו אלהיג׳א מוסטפא';
const WORKERS = [
    { id: 'w_01', name: 'מוחמד אבו ראס', active: true, dailyRate: 450, hourlyRate: 60, phone: '0501234567', payCycles: '2026-10-02=weekly' },
    { id: 'w_02', name: 'אחמד חסן', active: true, dailyRate: 400, hourlyRate: 50, phone: '0522345678' },
    { id: 'w_03', name: LONG, active: true, dailyRate: 420, hourlyRate: 55, phone: '0543456789', idNumber: '123456789' },
    { id: 'w_04', name: 'עלי מנסור', active: true, dailyRate: 380, phone: '0504567890', payCycles: '2026-10-02=weekly' },
    { id: 'w_05', name: 'סאמר חורי', active: true },
    { id: 'w_06', name: 'דוד כהן', active: true, dailyRate: 500, hourlyRate: 65, phone: '0507890123' },
    { id: 'w_07', name: 'דוד כהן', active: true, dailyRate: 410, hourlyRate: 50, phone: '0507890123' },
    { id: 'w_08', name: 'ראמי סלימאן', active: true, dailyRate: 400, hourlyRate: 50, phone: '0549012345' },
    { id: 'w_09', name: 'נביל ח׳טיב', active: false, dailyRate: 360, hourlyRate: 45, phone: '0501122334' },
    { id: 'w_10', name: 'וליד שחאדה עם שם ארוך מאוד', active: false, dailyRate: 410, phone: '0522233445' }
];
const PLACES = [
    { id: 'p_01', name: 'הרצליה פיתוח', active: true },
    { id: 'p_02', name: 'תל אביב - מגדל המרכז עם שם ארוך מאוד', active: true },
    { id: 'p_03', name: 'רמת גן', active: true },
    { id: 'p_04', name: 'נתניה', active: true },
    { id: 'p_05', name: 'פתח תקווה', active: false }
];
const ACTIVE = WORKERS.filter(worker => worker.active).map(worker => worker.id);

async function phone(width, scheme, { large = false, height = 800 } = {}) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true,
        hasTouch: true, colorScheme: scheme, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(([key, on]) => {
        try { if (on) localStorage.setItem(key, '1'); } catch (error) { /* a disk that refuses */ }
        const still = () => {
            if (!document.head || document.getElementById('cards-still')) return;
            const style = document.createElement('style');
            style.id = 'cards-still';
            style.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; scroll-behavior: auto !important; }';
            document.head.appendChild(style);
        };
        still();
        document.addEventListener('DOMContentLoaded', still);
    }, [LARGE_KEY, large]);
    await page.goto(`${server.url}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof State !== 'undefined' && typeof render === 'function');
    await page.evaluate(([workers, places]) => {
        todayStr = () => '2026-10-03';
        State.schedule.workers = workers;
        State.schedule.places = places;
        State.commitRoster();
        showView('roster');
        document.querySelector('#workerList .roster-archive').open = true;
    }, [WORKERS, PLACES]);
    await page.waitForTimeout(250);
    given(`${width}/${scheme}: the mode is ${large ? 'on' : 'off'}`,
        await page.evaluate(() => document.documentElement.classList.contains('display-large')) === large);
    return { context, page, errors };
}

// Every card of one list as it is drawn: its rectangle, its name, its controls, and anything
// inside it that stands outside it.
const cardsOf = (page, list) => page.evaluate(list => {
    const box = node => { const r = node.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
    return [...document.querySelectorAll(list)].filter(card => card.offsetParent !== null).map(card => {
        const at = box(card);
        const name = card.querySelector('.roster-details > strong');
        const range = document.createRange();
        range.selectNodeContents(name);
        const words = [...range.getClientRects()];
        const controls = [...card.querySelectorAll('button')].map(node => ({ words: node.textContent, cls: node.className, ...box(node),
            cut: node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1 }));
        const out = [...card.querySelectorAll('*')].filter(node => {
            const r = node.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) return false;
            return r.left < at.l - 0.5 || r.right > at.r + 0.5 || r.top < at.t - 0.5 || r.bottom > at.b + 0.5;
        }).map(node => `${node.tagName}.${node.className}`);
        const sizes = [...card.querySelectorAll('*')].filter(node => [...node.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim()))
            .map(node => parseFloat(getComputedStyle(node).fontSize));
        const firstText = [...card.querySelectorAll('.roster-details > *')].filter(node => node.tagName !== 'BUTTON')
            .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
        return { id: card.dataset.workerId || card.dataset.placeId, ...at, name: name.textContent,
            nameWhole: words.length > 0 && words.every(r => r.left >= at.l - 0.5 && r.right <= at.r + 0.5 && r.top >= at.t && r.bottom <= at.b)
                && name.scrollWidth <= name.clientWidth + 1 && getComputedStyle(name).overflow === 'visible'
                && getComputedStyle(name).textOverflow !== 'ellipsis' && getComputedStyle(name).webkitLineClamp === 'none',
            nameFirst: firstText === name, nameSize: parseFloat(getComputedStyle(name).fontSize), maxSize: Math.max(...sizes), minSize: Math.min(...sizes),
            controls, out, fill: getComputedStyle(card).backgroundColor, radius: parseFloat(getComputedStyle(card).borderTopLeftRadius) };
    });
}, list);
const lines = cards => {
    const out = [];
    cards.forEach(card => { const line = out.find(l => Math.abs(l[0].t - card.t) < 2); if (line) line.push(card); else out.push([card]); });
    return out.map(line => line.sort((a, b) => b.l - a.l));       // right to left: the page is RTL
};
const overlap = controls => {
    const hits = [];
    for (let i = 0; i < controls.length; i += 1) for (let j = i + 1; j < controls.length; j += 1) {
        const [a, b] = [controls[i], controls[j]];
        if (Math.min(a.r, b.r) - Math.max(a.l, b.l) > 1 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 1) hits.push(`${a.words}×${b.words}`);
    }
    return hits;
};
const round = n => Math.round(n * 10) / 10;

// The claims every list of cards must meet, at any width, with `columns` cards to a line.
function cardClaims(name, cards, order, columns, floor) {
    const rows = lines(cards);
    same(`${name}: ${columns === 2 ? 'two cards on every line (the last line may hold one)' : 'one card to a line'}`,
        rows.map(line => line.length), order.map((id, i) => i).filter(i => i % columns === 0).map(i => Math.min(columns, order.length - i)));
    same(`${name}: read right to left, top to bottom, in roster order`, rows.flat().map(card => card.id), order);
    const widths = cards.map(card => round(card.w));
    check(`${name}: every card the same width`, Math.max(...widths) - Math.min(...widths) <= 1, JSON.stringify(widths));
    check(`${name}: the cards of a line are the same height, with the same gap between every two`,
        rows.every(line => line.every(card => Math.abs(card.h - line[0].h) <= 1 && Math.abs(card.t - line[0].t) <= 1))
        && rows.filter(line => line.length === 2).every(line => Math.abs((line[0].l - line[1].r) - (rows[0][0].l - rows[0][1].r)) <= 1),
        JSON.stringify(rows.map(line => line.map(card => [round(card.t), round(card.h)]))));
    check(`${name}: each name whole - wrapped inside its card, never cut`, cards.every(card => card.nameWhole),
        JSON.stringify(cards.filter(card => !card.nameWhole).map(card => card.name)));
    check(`${name}: the name is the first thing on its card and nothing on it is larger`,
        cards.every(card => card.nameFirst && card.nameSize >= card.maxSize), JSON.stringify(cards.map(card => [card.nameFirst, card.nameSize, card.maxSize])));
    check(`${name}: no letter under ${floor.text}px`, cards.every(card => card.minSize >= floor.text), JSON.stringify(cards.map(card => card.minSize)));
    const controls = cards.flatMap(card => card.controls.map(control => ({ ...control, card })));
    check(`${name}: every control inside its own card`, controls.every(c => c.l >= c.card.l && c.r <= c.card.r && c.t >= c.card.t && c.b <= c.card.b));
    const small = controls.filter(c => c.w < floor.target - 0.5 || c.h < floor.target - 0.5);
    check(`${name}: every control ${floor.target}px both ways`, small.length === 0, JSON.stringify(small.map(c => [c.words, round(c.w), round(c.h)])));
    check(`${name}: no control's words cut or past its edge`, controls.every(c => !c.cut), JSON.stringify(controls.filter(c => c.cut).map(c => c.words)));
    same(`${name}: no two controls over each other`, overlap(controls), []);
    same(`${name}: nothing stands out of its card`, cards.flatMap(card => card.out), []);
    // The foot: the controls of a pair on the same lines, and nothing under them but the card's edge.
    check(`${name}: the two feet of a line stand on one line, control for control`,
        rows.filter(line => line.length === 2).every(line => line[0].controls.every((control, i) => {
            const twin = line[1].controls.find(other => other.cls === control.cls);
            return !twin || (Math.abs(twin.t - control.t) <= 1 && Math.abs(twin.h - control.h) <= 1);
        })), JSON.stringify(rows.map(line => line.map(card => card.controls.map(c => round(c.t))))));
    check(`${name}: the controls are the card's foot - the last of them ends at the card's own inset`,
        cards.every(card => { const last = Math.max(...card.controls.map(c => c.b)); return card.b - last >= 6 && card.b - last <= 16; }),
        JSON.stringify(cards.map(card => round(card.b - Math.max(...card.controls.map(c => c.b))))));
}
const ruler = async (page, name, floorContrast = 4.5) => {
    const read = await page.evaluate(measureInPage, ['#rosterView']);
    check(`${name}: the page does not scroll sideways`, read.page.scrollWidth <= read.page.width + 1, JSON.stringify(read.page));
    const faint = read.texts.filter(t => !t.off && t.contrast !== null && t.contrast < floorContrast);
    check(`${name}: every word at ${floorContrast}:1 or better`, faint.length === 0, JSON.stringify(faint.slice(0, 4).map(t => [t.words, t.ink, t.ground, t.contrast])));
    same(`${name}: nothing cut, nothing off the side, no words past their control`,
        [read.cut.length, read.offside.length, read.spills.length], [0, 0, 0]);
    same(`${name}: no two controls of the screen over each other`, read.overlaps.map(o => o.words), []);
    return read;
};

try {
    // ------------------------------------------------------------------ the cards
    for (const width of [320, 375, 440]) {
        for (const scheme of ['light', 'dark']) {
            const { context, page, errors } = await phone(width, scheme);
            const name = `${width}/${scheme}`;
            suite(`${name}: the men are cards, two side by side`);
            const men = await cardsOf(page, '#workerList > .roster-row');
            cardClaims(`${name} men`, men, ACTIVE, 2, { text: 14, target: 44 });
            same(`${name} men: each card's controls, in the order they are drawn`,
                [...new Set(men.map(card => JSON.stringify(card.controls.sort((a, b) => a.t - b.t || b.l - a.l).map(c => c.words))))],
                [JSON.stringify(['כרטיס עובד', 'פעיל', 'עוד ⋯'])]);
            check(`${name} men: «כרטיס עובד» goes across the card and the switch and «עוד ⋯» share the line under it`,
                men.every(card => { const [open, toggle, more] = card.controls;
                    return open.w > card.w * 0.8 && Math.abs(toggle.t - more.t) <= 1 && toggle.t >= open.b && toggle.l > more.r; }));
            check(`${name} men: a card is a surface with a rounded edge`, men.every(card => card.radius >= 10 && card.fill !== 'rgba(0, 0, 0, 0)'));
            if (width >= 375) {
                const ordinary = lines(men)[0][0];       // w_01: a name on one line, a phone, two rates
                check(`${name} men: an ordinary line of two is within 250px - 125px a man, what a row of one man was held to`,
                    ordinary.h <= 250, String(ordinary.h));
                check(`${name} men: an ordinary card is no more than one and a half times as tall as it is wide`,
                    ordinary.h <= ordinary.w * 1.5, `${round(ordinary.w)}x${round(ordinary.h)}`);
            }
            // The facts: the phone on its own line, the rates beside each other where they fit, no dot drawn.
            const facts = await page.evaluate(() => {
                const line = document.querySelector('[data-worker-id="w_01"] .crew-facts');
                const tops = [...line.querySelectorAll('.crew-fact')].map(node => Math.round(node.getBoundingClientRect().top));
                return { text: line.textContent, tops, seps: [...line.querySelectorAll('.crew-sep')].map(node => node.getBoundingClientRect().width),
                    none: document.querySelector('[data-worker-id="w_05"] .crew-facts').textContent,
                    id: document.querySelector('[data-worker-id="w_03"] .roster-meta').textContent };
            });
            same(`${name} men: the phone-and-rates line says what it said, character for character`,
                [facts.text, facts.none, facts.id], ['📞 0501234567 · יומי: 450 · שעה: 60', 'בלי טלפון', 'זהות: 123456789']);
            check(`${name} men: the phone has a line of its own and the two rates one line under it`,
                facts.tops[1] > facts.tops[0] && facts.tops[2] === facts.tops[1], JSON.stringify(facts.tops));
            same(`${name} men: no « · » is drawn at the end of a line`, facts.seps, [0, 0]);
            same(`${name} men: the badges are on the cards they were on the rows`,
                await page.evaluate(() => [...document.querySelectorAll('#workerList .roster-row')].map(card =>
                    [...card.querySelectorAll('.badge')].map(node => node.textContent).join('+')).filter(Boolean)),
                ['שם כפול+מספר משותף', 'שם כפול+מספר משותף', 'לא פעיל', 'לא פעיל']);

            suite(`${name}: an archived man is the same card, inside the fold`);
            const off = await cardsOf(page, '#workerList .roster-archive .roster-row');
            cardClaims(`${name} archived`, off, ['w_09', 'w_10'], 2, { text: 14, target: 44 });
            same(`${name} archived: the switch says «כבוי»`, off.map(card => card.controls.map(c => c.words)[1]), ['כבוי', 'כבוי']);
            check(`${name} archived: as wide as a working man's card`, Math.abs(off[0].w - men[0].w) <= 1, `${off[0].w} / ${men[0].w}`);
            check(`${name} archived: not faded`, await page.evaluate(() => getComputedStyle(document.querySelector('.roster-off')).opacity === '1'));

            suite(`${name}: the sites are cards, two side by side`);
            const sites = await cardsOf(page, '#placeList > .roster-row');
            cardClaims(`${name} sites`, sites, PLACES.map(place => place.id), 2, { text: 14, target: 44 });
            same(`${name} sites: each card's controls, top to bottom`,
                [...new Set(sites.map(card => JSON.stringify(card.controls.sort((a, b) => a.t - b.t).map(c => c.words))))],
                [JSON.stringify(['כרטיס אתר', 'עוד ⋯'])]);
            check(`${name} sites: a site keeps its own colour on its name`, await page.evaluate(() =>
                new Set([...document.querySelectorAll('#placeList .tag')].map(node => getComputedStyle(node).backgroundColor)).size === 5));

            suite(`${name}: the whole screen by the ruler`);
            await ruler(page, name);
            check(`${name}: no uncaught errors`, errors.length === 0, JSON.stringify(errors));

            if (scheme === 'light') {
                suite(`${name}: the fold shut draws no card`);
                await page.evaluate(() => { document.querySelector('#workerList .roster-archive').open = false; });
                same(`${name}: no archived card is laid out`, (await cardsOf(page, '#workerList .roster-archive .roster-row')).length, 0);
                await page.evaluate(() => { document.querySelector('#workerList .roster-archive').open = true; });

                suite(`${name}: at doubled text`);
                await page.evaluate(() => {
                    const sizes = [...document.querySelectorAll('#rosterView *')].map(node => [node, parseFloat(getComputedStyle(node).fontSize)]);
                    sizes.forEach(([node, size]) => node.style.setProperty('font-size', `${size * 2}px`, 'important'));
                });
                await page.waitForTimeout(150);
                for (const [what, list] of [['men', '#workerList .roster-row'], ['sites', '#placeList > .roster-row']]) {
                    const big = await cardsOf(page, list);
                    check(`${name} x2 ${what}: each name whole`, big.every(card => card.nameWhole), JSON.stringify(big.filter(card => !card.nameWhole).map(card => card.name)));
                    const controls = big.flatMap(card => card.controls.map(control => ({ ...control, card })));
                    check(`${name} x2 ${what}: every control inside its card, 44px both ways, its words inside it`,
                        controls.every(c => c.l >= c.card.l && c.r <= c.card.r && c.t >= c.card.t && c.b <= c.card.b && c.w >= 43.5 && c.h >= 43.5 && !c.cut),
                        JSON.stringify(controls.filter(c => c.cut || c.w < 43.5 || c.h < 43.5 || c.l < c.card.l || c.r > c.card.r).map(c => [c.words, round(c.w), round(c.h), c.cut])));
                    same(`${name} x2 ${what}: no two controls over each other`, overlap(controls), []);
                    same(`${name} x2 ${what}: nothing stands out of its card`, big.flatMap(card => card.out), []);
                }
                check(`${name} x2: the page does not scroll sideways`,
                    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
            }
            await context.close();
        }
    }

    // ------------------------------------------------------------------ the large display
    for (const [width, columns] of [[320, 1], [375, 1], [440, 2]]) {
        const { context, page, errors } = await phone(width, 'light', { large: true });
        const name = `${width}/«תצוגה גדולה»`;
        suite(`${name}: ${columns === 1 ? 'one card to a line - the mode\'s sizes do not fit half this screen' : 'two side by side'}`);
        const floor = { text: 18, target: 52 };
        cardClaims(`${name} men`, await cardsOf(page, '#workerList > .roster-row'), ACTIVE, columns, floor);
        cardClaims(`${name} archived`, await cardsOf(page, '#workerList .roster-archive .roster-row'), ['w_09', 'w_10'], columns, floor);
        cardClaims(`${name} sites`, await cardsOf(page, '#placeList > .roster-row'), PLACES.map(place => place.id), columns, floor);
        same(`${name}: a phone number is on one line beside its 📞`, await page.evaluate(() => {
            const fact = document.querySelector('[data-worker-id="w_01"] .crew-fact-phone');
            const range = document.createRange(); range.selectNodeContents(fact);
            return new Set([...range.getClientRects()].map(r => Math.round(r.bottom))).size;
        }), 1);
        await ruler(page, name, 7);
        check(`${name}: no uncaught errors`, errors.length === 0, JSON.stringify(errors));
        await context.close();
    }

    // ------------------------------------------------------------------ the reorder mode
    {
        const { context, page, errors } = await phone(375, 'light');
        suite('«סדר מחדש» is one man to a line, in roster order, and its arrows move him');
        await page.locator('#reorderOpenBtn').tap();
        await page.waitForTimeout(350);
        const rows = () => page.evaluate(() => [...document.querySelectorAll('#reorderList .reorder-row')].map(row => {
            const r = row.getBoundingClientRect();
            return { id: row.dataset.workerId, top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width) };
        }));
        const first = await rows();
        check('the panel is open over the crew', await page.evaluate(() => document.getElementById('reorderPanel').classList.contains('open')));
        same('every active man, in roster order', first.map(row => row.id), ACTIVE);
        check('one to a line: each row under the one before it, every row as wide as the list',
            first.every((row, i) => i === 0 || row.top > first[i - 1].top) && new Set(first.map(row => `${row.left}/${row.width}`)).size === 1
            && first[0].width > 300, JSON.stringify(first.slice(0, 3)));
        await page.locator('#reorderList .reorder-row[data-worker-id="w_02"]').getByRole('button', { name: /העלה את/ }).tap();
        await page.waitForTimeout(350);
        same('▲ on the second man makes him the first', (await rows()).map(row => row.id).slice(0, 3), ['w_02', 'w_01', 'w_03']);
        await page.getByRole('button', { name: 'שמירה ויציאה', exact: true }).tap();
        await page.waitForTimeout(450);
        same('saved: the record is in the new order', await page.evaluate(() => State.schedule.workers.filter(w => w.active !== false).map(w => w.id).slice(0, 3)),
            ['w_02', 'w_01', 'w_03']);
        const after = lines(await cardsOf(page, '#workerList > .roster-row'));
        same('and the cards read in it: the man moved up is the first card, on the right', after.flat().map(card => card.id).slice(0, 3), ['w_02', 'w_01', 'w_03']);
        check('the reorder panel is shut again', await page.evaluate(() => !document.getElementById('reorderPanel').classList.contains('open')));
        check('no uncaught errors', errors.length === 0, JSON.stringify(errors));
        await context.close();
    }

    // ------------------------------------------------------------------ the taps
    {
        const { context, page, errors } = await phone(375, 'dark');
        const pace = () => page.waitForTimeout(800);
        const shown = id => page.evaluate(id => document.getElementById(id).style.display === 'flex', id);
        suite('a tap on each control does what it did');
        const card = page.locator('#workerList [data-worker-id="w_04"]');
        await card.scrollIntoViewIfNeeded();
        await card.locator('.worker-card-open').tap();
        await pace();
        check('«כרטיס עובד» opens his card', await shown('workerCardModal')
            && (await page.locator('#workerCardModal').innerText()).includes('עלי מנסור'));
        await page.evaluate(() => closeWorkerCard());
        await pace();
        await card.locator('.crew-edit').tap();
        await pace();
        same('«עוד ⋯» opens his menu, the same choices', [await page.locator('#askModal h3').first().innerText(),
            (await page.locator('#askChoices button').allInnerTexts()).filter(text => text !== 'מחיקת עובד')], ['עלי מנסור', ['עריכת פרטים', 'סגור']]);
        await page.evaluate(() => askCancel());
        await pace();
        const before = await page.evaluate(() => JSON.stringify(State.schedule));
        await card.locator('.worker-active-toggle').tap();
        await pace();
        same('«פעיל» switches him off: he is in the fold, his switch says «כבוי», and nothing else of the record moved',
            await page.evaluate(before => {
                const was = JSON.parse(before); const now = JSON.parse(JSON.stringify(State.schedule));
                const him = now.workers.find(w => w.id === 'w_04');
                const others = JSON.stringify(now.workers.filter(w => w.id !== 'w_04')) === JSON.stringify(was.workers.filter(w => w.id !== 'w_04'));
                const node = document.querySelector('#workerList .roster-archive [data-worker-id="w_04"] .worker-active-toggle');
                return [him.active, others, JSON.stringify(now.places) === JSON.stringify(was.places), node && node.textContent, node && node.getAttribute('aria-checked')];
            }, before), [false, true, true, 'כבוי', 'false']);
        await page.evaluate(() => { document.querySelector('#workerList .roster-archive').open = true; });
        await page.locator('#workerList .roster-archive [data-worker-id="w_04"] .worker-active-toggle').tap();
        await pace();
        same('«כבוי» puts him back among the working cards',
            await page.evaluate(() => [State.worker('w_04').active !== false,
                Boolean(document.querySelector('#workerList > [data-worker-id="w_04"] .worker-active-toggle.is-active'))]), [true, true]);

        const site = page.locator('#placeList [data-place-id="p_03"]');
        await site.scrollIntoViewIfNeeded();
        await site.locator('.site-card-open').tap();
        await pace();
        check('«כרטיס אתר» opens the site\'s card', await shown('siteCardModal') && (await page.locator('#siteCardModal').innerText()).includes('רמת גן'));
        await page.evaluate(() => closeSiteCard());
        await pace();
        await site.locator('.crew-edit').tap();
        await pace();
        same('a site\'s «עוד ⋯» opens its menu, the same choices', [await page.locator('#askModal h3').first().innerText(),
            await page.locator('#askChoices button').allInnerTexts()], ['רמת גן', ['שינוי שם האתר', 'הסתרת האתר מהרשימה', 'סגור']]);
        await page.evaluate(() => askCancel());
        await pace();

        suite('a search narrows the cards and they stay two to a line');
        await page.locator('#rosterWorkerSearch').fill('050');
        await page.waitForTimeout(200);
        const found = lines(await cardsOf(page, '#workerList > .roster-row'));
        same('the men whose number has 050, two to a line', found.map(line => line.map(c => c.id)), [['w_01', 'w_04'], ['w_06', 'w_07']]);
        await page.locator('#rosterWorkerSearch').fill('');

        suite('none of it reaches paper');
        await page.emulateMedia({ media: 'print' });
        same('on paper the lists are not grids and a man is not a card',
            await page.evaluate(() => [getComputedStyle(document.getElementById('workerList')).display === 'grid',
                getComputedStyle(document.getElementById('placeList')).display === 'grid',
                getComputedStyle(document.querySelector('.crew-sep')).display === 'none']), [false, false, false]);
        await page.emulateMedia({ media: 'screen' });
        check('no uncaught errors', errors.length === 0, JSON.stringify(errors));
        await context.close();
    }
} finally { await browser.close(); await server.close(); }
report();
