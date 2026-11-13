// v169, the one look, in a real Chromium: what css/design.css and js/ui/icons.js promise,
// measured on the glass rather than read off the stylesheet.
//
// Every claim here is something a person would otherwise find out on a building site:
//
//   - the day shows eleven of a fourteen-man crew at 440x956 (it showed eight), every row
//     56px;
//   - the strip above the day is one line of 52px or less, and the settings button on it
//     still says «הגדרות» (v122) and still opens and closes the panel the way it did;
//   - a button's words are character for character what they were (law 6): the emoji is
//     still in the label, it is just not drawn, and a stroke glyph stands beside it;
//   - a button relabelled later is dressed again, and one that never had an emoji is left
//     alone;
//   - the WhatsApp message a person is about to SEND keeps every emoji it had - this file
//     must never reach into a textarea;
//   - the palette is as readable as its header says, in both schemes, and no site colour
//     was touched;
//   - nothing a finger lands on fell under 44px, and no field under 16px, on any of the
//     five screens in either scheme.
//
// It asserts nothing about paper. tests/print.test.mjs reads a real PDF and stays green
// because every rule in css/design.css is inside `@media screen`.
import { chromium } from 'playwright';
import { launchLocalBrowser } from './network-guard.mjs';
import { serve } from './serve.mjs';
import { expectedShaFor, verifyServedAssets } from './treecheck.mjs';
import { suite, check, same, report } from './runner.mjs';

const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
const served = await verifyServedAssets(server.url, root, expectedShaFor(root));
check('the origin served this commit, byte for byte', served.ok,
    `${served.checked} assets; ${(served.wrong || []).slice(0, 3).join(' | ')}`);
const browser = await launchLocalBrowser(chromium, { executablePath: process.env.CHROME_PATH });

const DATE = '2026-11-09';
const CREW = ['דוד כהן', 'עלי חסן', 'מוחמד אבו ראס', 'יוסי מזרחי', 'אחמד נסאר', "סאמר ח'טיב", 'רון לוי',
    'איברהים עודה', 'מאיר ביטון', 'חאלד סלאמה', 'נועם פרץ', 'וליד זועבי', 'אבי דהן', 'ראמי חורי'];
// Site names that share a line with a name at 440. The row's own rule (app.css, «HALF»)
// gives a name half the row and wraps the badge under it when the badge needs more than
// the other half - a 194px badge like «תל אביב - רוטשילד 12» does, on v167 as on this
// build, and that man's row is taller by design. The twelve-row claim is about rows of
// one line, so the fixture is made of them.
const SITES = ['הרצליה - מגדל הים', 'תל אביב - רוטשילד', 'רמת גן', 'נתניה - עיר ימים', 'פתח תקווה'];

async function open(width, height, scheme, seeded = true) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2,
        isMobile: true, hasTouch: true, colorScheme: scheme, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(server.url, { waitUntil: 'load' });
    if (seeded) {
        await page.evaluate(([crew, sites, date]) => {
            todayStr = () => date;
            State.schedule.workers = crew.map((name, i) => ({ id: 'w' + String(i + 1).padStart(2, '0'),
                name, active: true, dailyRate: 400, hourlyRate: 50, phone: i < 4 ? '052000000' + i : '' }));
            State.schedule.places = sites.map((name, i) => ({ id: 'p' + (i + 1), name, active: true }));
            State.date = date;
            State.schedule.workers.forEach((worker, i) => {
                if (i >= 11) return;                                   // three not recorded yet
                if (i === 8) { markAbsent(State.schedule, date, worker.id, 'actual'); return; }
                assignPlace(State.schedule, date, worker.id, 'actual', 'p' + ((i % 5) + 1));
            });
            addAdvance(State.schedule, 'w02', date, 500, '');
            State.save();
            showView('day'); setDayMode('workers'); render();
            const banner = document.getElementById('accountBanner');
            const putAway = banner && banner.style.display !== 'none' && banner.querySelector(':scope > .btn-icon');
            if (putAway) putAway.click();
        }, [CREW, SITES, DATE]);
    }
    await page.waitForTimeout(250);
    return { context, page, errors };
}

const box = (page, selector) => page.evaluate(selector => {
    const node = document.querySelector(selector);
    if (!node) return null;
    const r = node.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height, shown: node.offsetParent !== null };
}, selector);

// ------------------------------------------------------------------ the day, on the big phone
{
    suite('440x956: the day shows eleven of fourteen (it showed eight)');
    const { context, page, errors } = await open(440, 956, 'dark');

    const rows = await page.evaluate(() => {
        const top = document.querySelector('.day-header').getBoundingClientRect().bottom;
        const bottom = document.querySelector('.day-actions').getBoundingClientRect().top;
        const all = [...document.querySelectorAll('#dayView .wrow')].map(row => row.getBoundingClientRect());
        return { count: all.filter(r => r.top >= top - 1 && r.bottom <= bottom + 1).length,
            heights: [...new Set(all.map(r => Math.round(r.height)))],
            detail: `header ends ${top}, dock starts ${bottom}, rows ${all.slice(0, 13).map(r => Math.round(r.top)).join(' ')}` };
    });
    check('eleven whole worker rows between the header and the dock', rows.count >= 11, `${rows.count}: ${rows.detail}`);
    same('every one of them 56px: a 44px target with six above and six below', rows.heights, [56]);

    suite('the strip above the day: one line, and the settings button keeps its word');
    const strip = await box(page, '.topbar');
    check('52px or less, as the mobile suite holds it', strip.h <= 52, String(strip.h));
    same('the button still says what it opens (v122: not an unexplained icon)',
        (await page.locator('#settingsBtn').innerText()).trim(), 'הגדרות');
    const door = await box(page, '#settingsBtn');
    check('44px in both dimensions', door.shown && door.w >= 44 && door.h >= 44, `${door.w}x${door.h}`);
    check("the app's name is not drawn on it", await page.evaluate(() => {
        const brand = document.querySelector('.topbar .brand');
        return !brand || brand.offsetParent === null;
    }));
    await page.click('#settingsBtn');
    await page.waitForTimeout(250);
    check('a tap opens the settings panel', await page.evaluate(() => document.getElementById('settingsPanel').classList.contains('open')));
    await page.evaluate(() => closeSettings());
    check('and closing it puts the focus back on the button',
        await page.evaluate(() => document.activeElement === document.getElementById('settingsBtn')));

    // ---------------------------------------------------------------- the glyphs
    suite('a button keeps its words; the emoji is in the label and is not drawn');
    const dock = await page.evaluate(() => {
        const node = document.querySelector('.day-actions .btn-success');
        const kept = node.querySelector('.btn-emoji');
        return { text: node.textContent, kept: kept && kept.textContent,
            keptBox: kept && Math.round(kept.getBoundingClientRect().width * kept.getBoundingClientRect().height),
            glyph: !!node.querySelector('svg.btn-ico'),
            glyphBox: node.querySelector('svg.btn-ico').getBoundingClientRect().width };
    });
    same('the WhatsApp button says exactly what it said', dock.text, '💬 שליחה לוואטסאפ');
    same('the emoji is kept, in a span of its own', dock.kept, '💬');
    check('clipped to a pixel, so it is not drawn', dock.keptBox <= 1, String(dock.keptBox));
    check('and still part of the name a screen reader announces and a suite looks it up by',
        await page.getByRole('button', { name: '💬 שליחה לוואטסאפ' }).count() === 1);
    check('a drawn glyph stands in its place', dock.glyph && dock.glyphBox >= 16 && dock.glyphBox <= 28, String(dock.glyphBox));

    const copy = await page.evaluate(() => {
        const node = document.getElementById('copyDayBtn');
        const before = node.textContent;
        node.textContent = '↧ מיום שישי 06/11';                        // what a render does to it
        return new Promise(resolve => setTimeout(() => resolve({ before, after: node.textContent,
            glyphs: node.querySelectorAll('svg.btn-ico').length, kept: node.querySelectorAll('.btn-emoji').length }), 50));
    });
    check('the copy button was dressed when it was drawn', copy.before.startsWith('↧ '), copy.before);
    same('relabelled, it reads what it was given', copy.after, '↧ מיום שישי 06/11');
    same('and is dressed again, once', [copy.glyphs, copy.kept], [1, 1]);

    // MOVED (round two of the owner's «הכל חופש», 2026-11-11): that button is on no screen now;
    // the plain button read here is the one in its place at the foot of the day, «עוד ⋯».
    const plain = await page.evaluate(() => {
        const node = document.querySelector('.day-more-action');
        return { text: node.textContent, glyphs: node.querySelectorAll('svg.btn-ico').length };
    });
    same('a button with no emoji is left exactly alone', plain, { text: 'עוד ⋯', glyphs: 0 });

    await page.evaluate(() => showDayMessage());
    await page.waitForTimeout(250);
    const message = await page.evaluate(() => {
        const area = document.getElementById('shareText');
        const send = document.querySelector('#shareModal .btn-success');
        return { value: area.value, children: area.children.length, send: send.textContent,
            sendGlyph: send.querySelectorAll('svg.btn-ico').length };
    });
    check('the message about to be sent still carries its own emoji', /📅|📍|👷/u.test(message.value), message.value.slice(0, 40));
    same('and nothing was put inside the textarea', message.children, 0);
    same('the send button keeps its words', message.send, '💬 שלח בוואטסאפ');
    same('with one glyph', message.sendGlyph, 1);
    await page.evaluate(() => closeShareModal());

    const drawn = await page.evaluate(() => {
        const marks = /^(💬|🖨|🖼|📊|🔄|💾|📂|↩️|☁|📋|↕|🧹|↧|🚀|👷|📅|🏗)/u;
        return [...document.querySelectorAll('button, summary')].filter(node =>
            node.firstChild && node.firstChild.nodeType === 3 && marks.test(node.firstChild.nodeValue))
            .map(node => node.textContent.trim().slice(0, 20));
    });
    same('no button anywhere in the document still draws an emoji as its picture', drawn, []);

    check('nothing threw', errors.length === 0, errors.join(' | '));
    await context.close();
}

// ------------------------------------------------------------------ the small phones
for (const [width, height] of [[375, 667], [320, 568]]) {
    suite(`${width}x${height}: nothing is cut and nothing scrolls sideways`);
    const { context, page } = await open(width, height, 'dark');
    check('neither line of the date is cut', await page.evaluate(() =>
        [...document.querySelector('.day-label').children].every(child => child.scrollWidth <= child.clientWidth + 1)));
    same('the page is as wide as the phone', await page.evaluate(() => document.documentElement.scrollWidth), width);
    await context.close();
}

// ------------------------------------------------------------------ the palette, both schemes
const contrast = (a, b) => {
    const lum = ([r, g, bl]) => [r, g, bl].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
        .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    const [x, y] = [lum(a), lum(b)];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const SITE_TOKENS = { '--site-1': '#1e40af', '--site-2': '#9a3412', '--site-3': '#166534', '--site-4': '#6b21a8',
    '--site-5': '#78450c', '--site-6': '#155e75', '--site-7': '#991b1b', '--site-8': '#9d174d',
    '--site-9': '#115e59', '--site-10': '#3730a3' };

for (const scheme of ['dark', 'light']) {
    suite(`${scheme}: the palette is as readable as css/design.css says`);
    const { context, page, errors } = await open(440, 956, scheme);
    const tokens = await page.evaluate(names => {
        const probe = document.createElement('span');
        document.body.appendChild(probe);
        const out = {};
        names.forEach(name => {
            probe.style.color = `var(${name})`;
            out[name] = getComputedStyle(probe).color.match(/\d+/g).slice(0, 3).map(Number);
        });
        probe.remove();
        return out;
    }, ['--paper', '--surface', '--surface-2', '--ink', '--ink-2', '--ink-3', '--accent', '--on-accent', '--wa', '--on-wa',
        '--ok', '--ok-bg', '--danger', '--danger-bg', '--warn', '--warn-bg', ...Object.keys(SITE_TOKENS)]);

    const pairs = [['--ink', '--paper', 15], ['--ink', '--surface', 15], ['--ink-2', '--surface', 7], ['--ink-3', '--surface-2', 7],
        ['--on-accent', '--accent', 4.5], ['--accent', '--surface', 7], ['--on-wa', '--wa', 7],
        ['--ok', '--ok-bg', 4.5], ['--danger', '--danger-bg', 4.5], ['--warn', '--warn-bg', 4.5]];
    pairs.forEach(([fg, bg, floor]) => {
        const ratio = contrast(tokens[fg], tokens[bg]);
        check(`${fg} on ${bg} is at least ${floor}:1`, ratio >= floor, ratio.toFixed(2));
    });

    const hex = rgb => '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
    same('and not one site colour moved', Object.fromEntries(Object.keys(SITE_TOKENS).map(name => [name, hex(tokens[name])])), SITE_TOKENS);

    suite(`${scheme}: nothing a finger lands on shrank, on any screen`);
    for (const view of ['day', 'week', 'roster', 'advances', 'reports']) {
        await page.click('#tab-' + view);
        await page.waitForTimeout(250);
        const small = await page.evaluate(() => [...document.querySelectorAll('button, a[href], select, summary, input:not([type=hidden])')]
            .filter(node => {
                if (node.offsetParent === null || node.getAttribute('aria-hidden') === 'true' || node.tabIndex === -1) return false;
                const r = node.getBoundingClientRect();
                return r.width > 0 && (r.width < 43.5 || r.height < 43.5);
            }).map(node => `${(node.textContent || node.id || node.tagName).trim().slice(0, 16)} ${Math.round(node.getBoundingClientRect().width)}x${Math.round(node.getBoundingClientRect().height)}`));
        same(`${view}: every target is 44px in both dimensions`, small, []);
        const fields = await page.evaluate(() => [...document.querySelectorAll('input:not([type=hidden]), select, textarea')]
            .filter(node => node.offsetParent !== null && node.tabIndex !== -1 && parseFloat(getComputedStyle(node).fontSize) < 16)
            .map(node => node.id || node.className));
        same(`${view}: every field is 16px or more`, fields, []);
    }
    check('nothing threw', errors.length === 0, errors.join(' | '));
    await context.close();
}

await browser.close();
server.close();
report();
