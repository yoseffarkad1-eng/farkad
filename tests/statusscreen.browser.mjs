// «תמונת מצב» (js/ui/status.js) in a real Chromium.
//
//   node tests/statusscreen.browser.mjs
//
// The screen the sync chip opens. Held here, on the seeded app of tests/screens.mjs (the
// contract's criteria 12-21; the figures themselves are tests/statusscreen.test.mjs's):
//
//   B12 THE DOOR costs the strip nothing: at 320x568, 375x667 and 440x956, both schemes, the
//       large display off and on, with the chip saying «שגיאת סנכרון», «מסונכרן», «38 ממתינים
//       לשליחה» and with no chip at all, the strip is exactly as tall as the same page with the
//       button taken off the chip (52px or less, 60 with the mode - but the longest chip at 320
//       with the mode, which wraps that strip already); the same sideways and on a wide window;
//       the door 44px both ways (52 with the mode), named «תמונת מצב · <the chip's word>»,
//       worded where there is no chip; «הגדרות» whole on the glass.
//   B13 A TAP opens the dialog at its title; Escape, the backdrop and «סגור» close it and give
//       the keyboard back to the door; Tab stays inside.
//   B14 THE MONEY: a reading that is not kept is never in the first paint - «מחשב את
//       החשבונות…» is, and no figure; its lines replace it; a kept one is in the first paint.
//   B15 THE RAMP: the five --pulse colours, computed, step by step in lightness, the light end
//       2:1 and more on a surface, in both schemes.
//   B16 EVERY DOOR lands where it says - today, the pay sheet (or «יום תשלום» where a build has
//       it), «סגירת שבוע», «מי חייב כסף», a week, «לוח חודשי» where a build has it, a site's
//       card, ⋯'s cloud and backup - a new dialog entered at its title.
//   B17 A COMMIT under the open dialog draws it again where the reader was, and the money is
//       read once, after the draws have stopped for a second and a half.
//   B18 THE FLOORS on every phone, scheme and mode, and with the text doubled: the ruler of
//       tests/screens.mjs, no sideways scroll, nothing cut, the last button reachable.
//   B19 WHAT IT COSTS: opened on a season with the processor slowed four times, the dialog is
//       painted - sections and the money's place - within 1.2 s.
//   B20 No uncaught error anywhere.
//   B21 NOTHING WRITTEN: the disk and the record byte for byte across opening, redrawing and
//       every door - but the journey's, whose one byte is the journey's own key, the same as
//       a press of «בניית סידור» in the dock on a twin page under the same clock.
//
// STATUS_SHOTS=<dir> also writes pictures (asserts nothing). Chromium with emulated touch -
// NOT a real phone.
import { chromium } from 'playwright';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { serve } from './serve.mjs';
import { launchLocalBrowser } from './network-guard.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import { censusOnly } from './census.mjs';
import { tapsAtAPersonsPace } from './pace.mjs';
import { PHONES, SCHEMES, openApp, measureInPage } from './screens.mjs';

const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
const served = await verifyServedAssets(server.url, root, expectedShaFor(root));
check('the browser is served the named tree', served.ok, `${served.checked} assets; ${(served.wrong || []).slice(0, 3).join(' | ')}`);
const browser = await launchLocalBrowser(chromium, { executablePath: process.env.CHROME_PATH });
const SHOTS = process.env.STATUS_SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const errors = [];
const keep = list => { errors.push(list); return list; };

const brief = (rows, say) => rows.slice(0, 5).map(say).join(' | ') + (rows.length > 5 ? ` … +${rows.length - 5}` : '');
const says = t => `${t.size}px w${t.weight} ${t.contrast}:1 «${t.words}» ${t.where}`;
const LETTER = /[\p{L}\p{N}]/u;

// The chip's four states, by the line it is read from (renderSyncChip, js/app.js).
const CHIPS = [
    ['שגיאת סנכרון', 'שגיאת סנכרון - הנתונים שמורים במכשיר הזה. (38 ממתינים לשליחה)'],
    ['מסונכרן', 'מסונכרן בין המכשירים. · עודכן: 19:42'],
    ['38 ממתינים לשליחה', 'מחובר. יש רישומים שעדיין נשלחים. (38 ממתינים לשליחה)'],
    ['', 'הנתונים נשמרים במכשיר הזה בלבד.']
];

// The strip with the chip saying what it is told, and the same strip with the button taken off
// the chip and the chip put back where it stood before v206 - measured one after the other.
// The live sync line is held still meanwhile (it writes the line at every status).
const stripWith = (page, line) => page.evaluate(line => {
    if (!window.__statusNotice) { window.__statusNotice = updateSyncNotice; updateSyncNotice = function () {}; }
    const notice = document.getElementById('storageNotice');
    notice.textContent = line;
    renderSyncChip();
    const bar = () => Math.round(document.querySelector('.topbar').getBoundingClientRect().height * 10) / 10;
    const door = document.getElementById('statusDoor');
    const chip = document.getElementById('syncChip');
    const box = node => { const r = node.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
    const settings = box(document.getElementById('settingsBtn'));
    const out = { wrapped: bar(), door: box(door), name: door.getAttribute('aria-label'), chipShown: !chip.hidden,
        words: getComputedStyle(door.querySelector('.status-door-words')).display !== 'none',
        chevron: getComputedStyle(door.querySelector('.status-door-chevron')).display !== 'none',
        settings, settingsWhole: settings.l >= -0.5 && settings.r <= innerWidth + 0.5 && settings.t >= -0.5 && settings.b <= innerHeight + 0.5,
        width: innerWidth, large: document.documentElement.classList.contains('display-large') };
    door.parentNode.insertBefore(chip, door);
    door.style.display = 'none';
    out.unwrapped = bar();
    door.insertBefore(chip, door.firstChild);
    door.style.display = '';
    out.again = bar();
    return out;
}, line);
const stripBack = page => page.evaluate(() => {
    if (window.__statusNotice) { updateSyncNotice = window.__statusNotice; window.__statusNotice = null; }
    updateSyncNotice();
    renderSyncChip();
});

// The dialog, opened and read: the money waited for.
const openRead = async page => {
    await page.evaluate(() => openStatus());
    await page.waitForFunction(() => statusIsOpen() && !document.querySelector('#statusModal .status-pending'));
    await page.waitForTimeout(120);
};
const dialogOpen = page => page.evaluate(() => statusIsOpen());
const focusId = page => page.evaluate(() => (document.activeElement && document.activeElement.id) || '');

async function floors(page, label, large, width) {
    const read = await page.evaluate(measureInPage, ['#statusModal']);
    const live = read.texts.filter(t => !t.off && LETTER.test(t.words));
    const min = large ? 18 : 14;
    const small = live.filter(t => t.size < min);
    check(`${label}: no letter or digit under ${min}px`, small.length === 0, brief(small, says));
    if (large) {
        const thin = live.filter(t => t.weight < 500);
        check(`${label}: nothing lighter than 500`, thin.length === 0, brief(thin, says));
        const tight = live.filter(t => t.lines > 1 && t.lineHeight !== null && t.lineHeight < 1.4);
        check(`${label}: no wrapped text tighter than 1.4`, tight.length === 0, brief(tight, says));
    }
    const ratio = large ? 7 : 4.5;
    const weak = read.texts.filter(t => !t.off && t.contrast !== null && t.contrast < ratio);
    check(`${label}: every text at ${ratio}:1 or better on the ground under it`, weak.length === 0,
        brief(weak, t => `${t.ink} on ${t.ground} ${says(t)}`));
    const floor = large ? 51.5 : 43.5;
    const fingers = read.targets.filter(t => t.w < floor || t.h < floor);
    check(`${label}: every target ${large ? 52 : 44}px both ways`, fingers.length === 0, brief(fingers, t => `${t.w}x${t.h} «${t.words}» ${t.where}`));
    check(`${label}: no two controls over each other`, read.overlaps.length === 0, brief(read.overlaps, o => `${o.by} «${o.words}» ${o.where}`));
    check(`${label}: no control's words past its edge`, read.spills.length === 0, brief(read.spills, o => `${o.by} «${o.words}» ${o.where}`));
    same(`${label}: the page exactly as wide as the phone`, read.page.scrollWidth, width);
    check(`${label}: nothing off the side`, read.offside.length === 0, brief(read.offside, o => `${o.left}..${o.right} ${o.where}`));
    check(`${label}: nothing cut`, read.cut.length === 0, brief(read.cut, c => `${c.by} «${c.words}» ${c.where}`));
    check(`${label}: nothing out of reach`, read.unreachable.length === 0, brief(read.unreachable, u => `${u.top}..${u.bottom} «${u.words}» ${u.where}`));
    const last = await page.evaluate(() => {
        const close = document.getElementById('statusClose');
        close.scrollIntoView({ block: 'nearest' });
        const r = close.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: innerHeight, words: close.textContent };
    });
    check(`${label}: the last button, «סגור», brought onto the glass`, last.top >= 0 && last.bottom <= last.height && last.words === 'סגור', JSON.stringify(last));
    await page.evaluate(() => { document.querySelector('#statusModal .modal-content').scrollTop = 0; });
}

// ============================================================ B12 + B18: every phone, scheme and mode
for (const [width, height] of PHONES) {
    for (const scheme of SCHEMES) {
        for (const large of [false, true]) {
            const label = `${width}x${height} ${scheme}${large ? ' large' : ''}`;
            const { context, page, errors: seen } = await openApp(browser, server.url, { width, height, scheme, large });
            keep(seen);
            suite(`B12 ${label}: the door costs the strip nothing`);
            given(`${label}: the mode is ${large ? 'on' : 'off'}`, await page.evaluate(() => document.documentElement.classList.contains('display-large')) === large);
            for (const [word, line] of CHIPS) {
                const m = await stripWith(page, line);
                const which = word || 'no chip';
                const wraps = large && width <= 320 && word === '38 ממתינים לשליחה';
                if (!wraps) {
                    same(`${label}, «${which}»: the strip is the height it is without the door`, m.wrapped, m.unwrapped);
                    check(`${label}, «${which}»: ${large ? 60 : 52}px or less`, m.wrapped <= (large ? 60 : 52), String(m.wrapped));
                } else {
                    // The one case the strip wraps already (scout-ui (a)): said, not held.
                    console.log(`        ${label}, «${which}»: the strip wraps already - ${m.unwrapped}px without the door, ${m.wrapped}px with it`);
                }
                same(`${label}, «${which}»: the door put back, the strip is what it was with it`, m.again, m.wrapped);
                const floor = large ? 51.5 : 43.5;
                check(`${label}, «${which}»: the door ${large ? 52 : 44}px both ways`, m.door.w >= floor && m.door.h >= floor,
                    `${m.door.w}x${m.door.h}`);
                same(`${label}, «${which}»: its name`, m.name, word ? `תמונת מצב · ${word}` : 'תמונת מצב');
                same(`${label}, «${which}»: the chip, or the door's own words - one of them, and a chevron beside it`,
                    [m.chipShown, m.words, m.chevron], [Boolean(word), !word, true]);
                check(`${label}, «${which}»: «הגדרות» whole on the glass`, m.settingsWhole, JSON.stringify(m.settings));
            }
            await stripBack(page);

            suite(`B18 ${label}: the floors of the open dialog`);
            await openRead(page);
            await floors(page, label, large, width);
            if (SHOTS && ((width === 440 && scheme === 'dark' && !large) || (width === 320 && large))) {
                await page.screenshot({ path: join(SHOTS, `status-${width}-${scheme}${large ? '-large' : ''}.jpg`), type: 'jpeg', quality: 80 });
            }
            await page.evaluate(() => closeStatus());
            await context.close();
        }
    }
}

// ============================================================ B12 sideways and wide
for (const [width, height] of [[667, 375], [844, 390], [1024, 768]]) {
    const label = `${width}x${height}`;
    const { context, page, errors: seen } = await openApp(browser, server.url, { width, height, scheme: 'light' });
    keep(seen);
    suite(`B12 ${label}: the door costs the strip nothing, the tabs in it or under it`);
    for (const [word, line] of CHIPS) {
        const m = await stripWith(page, line);
        const which = word || 'no chip';
        same(`${label}, «${which}»: the strip is the height it is without the door`, m.wrapped, m.unwrapped);
        check(`${label}, «${which}»: the door 44px both ways, named for the chip`, m.door.w >= 43.5 && m.door.h >= 43.5
            && m.name === (word ? `תמונת מצב · ${word}` : 'תמונת מצב'), `${m.door.w}x${m.door.h} ${m.name}`);
        check(`${label}, «${which}»: «הגדרות» whole on the glass`, m.settingsWhole, JSON.stringify(m.settings));
    }
    await stripBack(page);
    await context.close();
}

// ============================================================ B13, B14, B16, B17, B21
{
    const { context, page, errors: seen } = await openApp(browser, server.url, { width: 440, height: 956, scheme: 'dark' });
    keep(seen);
    tapsAtAPersonsPace(page);
    const before = await page.evaluate(() => ({
        disk: JSON.stringify(Object.keys(localStorage).filter(key => key !== 'farkad:openBuilds').sort().map(key => [key, localStorage.getItem(key)])),
        record: JSON.stringify(State.schedule)
    }));

    suite('B13 a tap opens it at its title; Escape, the backdrop and «סגור» give the keyboard back to the door');
    await page.locator('#statusDoor').tap();
    await page.waitForFunction(() => statusIsOpen());
    same('a tap on the chip opens «תמונת מצב», entered at its title', [await dialogOpen(page), await focusId(page),
        await page.evaluate(() => document.getElementById('statusTitle').textContent)], [true, 'statusTitle', 'תמונת מצב']);
    same('its first line is the sentence the chip was read from, whole', await page.evaluate(() => document.getElementById('statusSync').textContent),
        await page.evaluate(() => document.getElementById('storageNotice').textContent));
    let outside = 0;
    for (let n = 0; n < 50; n += 1) {
        await page.keyboard.press(n % 7 === 6 ? 'Shift+Tab' : 'Tab');
        if (!(await page.evaluate(() => document.getElementById('statusModal').contains(document.activeElement)))) outside += 1;
    }
    same('fifty presses of Tab and Shift+Tab never leave the dialog', outside, 0);
    await page.keyboard.press('Escape');
    same('Escape closes it, and the keyboard is back on the door', [await dialogOpen(page), await focusId(page)], [false, 'statusDoor']);
    await page.locator('#statusDoor').tap();
    await page.waitForFunction(() => statusIsOpen());
    await page.mouse.click(4, 480);
    same('the backdrop closes it, and the keyboard is back on the door', [await dialogOpen(page), await focusId(page)], [false, 'statusDoor']);
    await page.locator('#statusDoor').tap();
    await page.waitForFunction(() => statusIsOpen());
    await page.locator('#statusClose').tap();
    same('«סגור» closes it, and the keyboard is back on the door', [await dialogOpen(page), await focusId(page)], [false, 'statusDoor']);

    suite('B14 the money: never in the first paint unless it is kept; then the board\'s and the reminder\'s own lines');
    const first = await page.evaluate(() => new Promise(done => {
        STATUS_MONEY_KEPT = null; OWES_KEPT = null; CLOSE_REMINDER_KEPT = null;
        openStatus();
        requestAnimationFrame(() => {
            const money = document.getElementById('statusMoney');
            done({ text: money.textContent, busy: money.getAttribute('aria-busy'),
                sections: [...document.querySelectorAll('#statusBody > .status-sec')].map(node => node.className.replace('status-sec ', '')) });
        });
    }));
    same('nothing kept: the first paint says «מחשב את החשבונות…» where the money will be, and no figure', [first.text, first.busy, /\d/.test(first.text)],
        ['מחשב את החשבונות…', 'true', false]);
    same('and every other section is there already', first.sections, ['status-today', 'status-next', 'status-money', 'status-pulse', 'status-sites', 'status-device']);
    await page.waitForFunction(() => !document.querySelector('#statusModal .status-pending'));
    const lines = await page.evaluate(() => {
        const today = todayStr();
        const count = closeReminderCount(weeklyCloseRead(State.schedule, today, new Date().toISOString()));
        const read = owesRead(State.schedule, today);
        return { seen: [...document.querySelectorAll('#statusMoney p')].map(node => node.textContent),
            want: [CLOSE_REMINDER_TEXT.line(count), `${OWES_TEXT.total}: ${owesMoney(read.total)}`, owesCountLine(read)] };
    });
    same('then the lines: the reminder\'s own sentence and the board\'s own figures', lines.seen, lines.want);
    await page.evaluate(() => closeStatus());
    const again = await page.evaluate(() => new Promise(done => {
        openStatus();
        requestAnimationFrame(() => done([...document.querySelectorAll('#statusMoney p')].map(node => node.textContent)));
    }));
    same('kept: the lines are in the first paint', again, lines.want);
    await page.evaluate(() => closeStatus());
    const opened = await page.evaluate(() => ({
        disk: JSON.stringify(Object.keys(localStorage).filter(key => key !== 'farkad:openBuilds').sort().map(key => [key, localStorage.getItem(key)])),
        record: JSON.stringify(State.schedule)
    }));
    same('B21: opened four times, tabbed through, closed every way and read twice - the disk byte for byte', opened.disk, before.disk);
    same('B21: and the record', opened.record, before.record);

    suite('B17 a commit under the open dialog: drawn again where he was; the money read once the draws stop');
    await openRead(page);
    await page.evaluate(() => {
        window.__moneyReads = 0;
        const real = weeklyCloseRead;
        weeklyCloseRead = function () { window.__moneyReads += 1; return real.apply(this, arguments); };
        document.querySelector('#statusModal .modal-content').scrollTop = 900;
    });
    const was = await page.evaluate(() => ({ hero: document.querySelector('.status-hero-n').textContent,
        scroll: document.querySelector('#statusModal .modal-content').scrollTop }));
    // נועם פרץ is not recorded today on the screens' record: he is put on רמת גן.
    await page.evaluate(() => State.commit(assignPlace(State.schedule, todayStr(), 'w11', 'actual', 'p3')));
    const now = await page.evaluate(() => ({ hero: document.querySelector('.status-hero-n').textContent,
        scroll: document.querySelector('#statusModal .modal-content').scrollTop,
        pending: Boolean(document.querySelector('#statusModal .status-pending')) }));
    same('the commit is on the screen at once: one more man today', Number(now.hero), Number(was.hero) + 1);
    same('where he was reading: the place kept', now.scroll, was.scroll);
    same('the money of the record before it is not shown as current', now.pending, true);
    await page.waitForTimeout(500);
    await page.evaluate(() => State.commit(assignPlace(State.schedule, todayStr(), 'w12', 'actual', 'p3')));
    await page.waitForTimeout(500);
    await page.evaluate(() => State.commit(assignPlace(State.schedule, todayStr(), 'w13', 'actual', 'p3')));
    same('no reading while the draws go on', await page.evaluate(() => window.__moneyReads), 0);
    await page.waitForFunction(() => !document.querySelector('#statusModal .status-pending'), null, { timeout: 6000 });
    await page.waitForTimeout(1800);
    same('read once, after the draws stopped for a second and a half', await page.evaluate(() => window.__moneyReads), 1);
    await page.evaluate(() => { State.commit(clearWorkerDay(State.schedule, todayStr(), 'w11', 'actual'));
        State.commit(clearWorkerDay(State.schedule, todayStr(), 'w12', 'actual')); State.commit(clearWorkerDay(State.schedule, todayStr(), 'w13', 'actual')); });
    await page.evaluate(() => closeStatus());
    const after17 = await page.evaluate(() => ({
        disk: JSON.stringify(Object.keys(localStorage).filter(key => key !== 'farkad:openBuilds').sort().map(key => [key, localStorage.getItem(key)])),
        record: JSON.stringify(State.schedule)
    }));

    suite('B16 every door lands where it says');
    const door = async key => {
        if (!(await dialogOpen(page))) {
            await page.locator('#statusDoor').tap();
            await page.waitForFunction(() => statusIsOpen() && !document.querySelector('#statusModal .status-pending'));
        }
        const node = page.locator(`#statusBody [data-status-key="${key}"]`);
        await node.scrollIntoViewIfNeeded();
        const words = (await node.textContent()).trim();
        await node.tap();
        await page.waitForTimeout(250);
        return words;
    };
    await page.evaluate(() => { State.date = '2026-11-03'; render(); });
    same('«פתיחת היום לעריכה»: today on the day screen', [await door('go:today'), await page.evaluate(() => [currentView, State.date === todayStr(), statusIsOpen()])],
        ['פתיחת היום לעריכה', ['day', true, false]]);
    same('no «יום תשלום» on this build: «דוחות», the pay sheet', [await door('go:payday'), await page.evaluate(() => currentView)],
        ['דוחות', 'reports']);
    same('«לסגירת שבוע»: the dialog, entered at its title', [await door('go:close'), await page.evaluate(() => weeklyCloseIsOpen()), await focusId(page)],
        ['לסגירת שבוע', true, 'weeklyCloseTitle']);
    await page.evaluate(() => closeWeeklyClose());
    await page.waitForTimeout(150);
    same('and shut, the keyboard is back on the door', await focusId(page), 'statusDoor');
    await page.evaluate(() => { ADVANCE_WORKER = 'w02'; });
    same('«מי חייב כסף»: «מקדמות» as it opens, no man\'s page', [await door('go:board'),
        await page.evaluate(() => [currentView, ADVANCE_WORKER, OWES_PAGE, Boolean(document.querySelector('#advancesView .owes'))])],
    ['מי חייב כסף', ['advances', null, null, true]]);
    const week = await page.evaluate(() => statusFacts(todayStr()).pulse.weeks[2].from);
    await door(`week:${week}`);
    same('a week of the pulse: the week screen on that week', await page.evaluate(() => [currentView, weekStart, weekPhoneMode]), ['week', week, 'grid']);
    const site = await page.evaluate(() => statusFacts(todayStr()).sites[1].placeId);
    await door(`site:${site}`);
    same('a site: its card, entered at its title', await page.evaluate(() => [siteCardIsOpen(), SITE_CARD_ID, document.activeElement.id]),
        [true, site, 'siteCardTitle']);
    await page.evaluate(() => closeSiteCard());
    await page.waitForTimeout(150);
    same('«ענן וסנכרון»: ⋯ at its first section', [await door('go:cloud'), await page.evaluate(() => [settingsOpen, document.activeElement.id])],
        ['ענן וסנכרון', [true, 'settingsDaily']]);
    await page.evaluate(() => closeSettings());
    same('«גיבוי»: ⋯ at the backup, its row open', [await door('go:backup'),
        await page.evaluate(() => [settingsOpen, document.getElementById('settingsFoldBackup').open, document.activeElement.id])],
    ['גיבוי', [true, true, 'settingsBackups']]);
    await page.evaluate(() => closeSettings());
    same('no «לוח חודשי» on this build: no door to it', await page.evaluate(() => { openStatus(); return Boolean(document.querySelector('[data-status-key="go:monthBoard"]')); }), false);
    await page.evaluate(() => closeStatus());

    suite('B21 nothing written: the disk and the record, across opening, every redraw and every door');
    const end = await page.evaluate(() => ({
        disk: JSON.stringify(Object.keys(localStorage).filter(key => key !== 'farkad:openBuilds').sort().map(key => [key, localStorage.getItem(key)])),
        record: JSON.stringify(State.schedule)
    }));
    same('every door, every opening and every redraw: the disk byte for byte as the commits left it', end.disk, after17.disk);
    same('and the record', end.record, after17.record);
    await censusOnly(check, page, end.disk);

    suite('B16 the other tracks\' doors, where a build has them: called once, with what they are owed');
    await page.evaluate(() => {
        window.__payday = []; window.__board = [];
        window.PAYDAY_TEXT = { entry: 'יום תשלום' };
        window.openPayday = function () { window.__payday.push([...arguments]); return true; };
        window.MONTH_BOARD_TEXT = { door: 'לוח חודשי' };
        window.openMonthBoard = function (key, placeId) { window.__board.push([key, placeId]); return true; };
    });
    same('«יום תשלום»: its own opener, once, after this dialog closed', [await door('go:payday'), await page.evaluate(() => [window.__payday, statusIsOpen()])],
        ['יום תשלום', [[[]], false]]);
    same('«לוח חודשי»: under the pulse; its own opener once, on this month and every site', [await door('go:monthBoard'),
        await page.evaluate(() => [window.__board, statusIsOpen()])], ['לוח חודשי', [[[null, null]], false]]);
    await page.evaluate(() => { delete window.openPayday; delete window.PAYDAY_TEXT; delete window.openMonthBoard; delete window.MONTH_BOARD_TEXT; });
    await context.close();
}

// ============================================================ B21 the journey's door, against the dock's own button
{
    suite('B21 the journey\'s door writes the journey\'s own key - and only that, as the dock\'s button does');
    const at = new Date('2026-11-10T19:41:00+02:00');
    const one = await openApp(browser, server.url, { width: 375, height: 667, scheme: 'light' });
    const two = await openApp(browser, server.url, { width: 375, height: 667, scheme: 'light' });
    keep(one.errors); keep(two.errors);
    tapsAtAPersonsPace(one.page);
    const read = page => page.evaluate(() => Object.fromEntries(Object.keys(localStorage)
        .filter(key => key !== 'farkad:openBuilds').map(key => [key, localStorage.getItem(key)])));
    await one.page.clock.setFixedTime(at);
    await two.page.clock.setFixedTime(at);
    const before = await read(one.page);
    const record = await one.page.evaluate(() => JSON.stringify(State.schedule));
    given('no journey kept on either phone', before.farkadSederJourney === undefined
        && (await read(two.page)).farkadSederJourney === undefined);
    await one.page.locator('#statusDoor').tap();
    await one.page.waitForFunction(() => statusIsOpen());
    const words = (await one.page.locator('#statusBody [data-status-key="go:journey"]').textContent()).trim();
    same('the door says the dock button\'s own title', words, await one.page.evaluate(() => journeyDayEntryWords(Date.now(), todayStr())));
    same('which names the next working day', words, 'בניית סידור ליום רביעי 11/11/2026');
    await one.page.locator('#statusBody [data-status-key="go:journey"]').tap();
    await one.page.waitForTimeout(500);
    await two.page.locator('#journeyDockBtn').tap();
    await two.page.waitForTimeout(500);
    const after = await read(one.page);
    const moved = Object.keys(after).filter(key => after[key] !== before[key]).concat(Object.keys(before).filter(key => !(key in after)));
    same('the one key the door caused is the journey\'s', moved, ['farkadSederJourney']);
    same('byte for byte what a press of «בניית סידור» in the dock writes', after.farkadSederJourney, (await read(two.page)).farkadSederJourney);
    same('and the journey is on its first station, as from the dock', await one.page.evaluate(() => [journeyStation(), journeyDate(), State.date]),
        await two.page.evaluate(() => [journeyStation(), journeyDate(), State.date]));
    same('the record untouched', await one.page.evaluate(() => JSON.stringify(State.schedule)), record);
    await one.context.close();
    await two.context.close();
}

// ============================================================ B15 the ramp
{
    suite('B15 the ramp: one hue, step by step, the light end 2:1 on a surface, in both schemes');
    for (const scheme of SCHEMES) {
        const { context, page, errors: seen } = await openApp(browser, server.url, { width: 375, height: 667, scheme, seeded: false });
        keep(seen);
        const ramp = await page.evaluate(() => {
            const css = getComputedStyle(document.documentElement);
            const hex = name => css.getPropertyValue(name).trim();
            const lum = value => {
                const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
                if (!m) return null;
                return [m[1], m[2], m[3]].map(part => parseInt(part, 16) / 255)
                    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
                    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
            };
            const steps = [1, 2, 3, 4, 5].map(n => hex(`--pulse-${n}`));
            const surface = lum(hex('--surface'));
            const l = steps.map(lum);
            const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
            return { steps, l, surface, first: Math.round(ratio(l[0], surface) * 100) / 100 };
        });
        given(`${scheme}: five colours read`, ramp.l.every(v => v !== null), JSON.stringify(ramp.steps));
        const darker = ramp.l.every((v, i) => i === 0 || v < ramp.l[i - 1]);
        const brighter = ramp.l.every((v, i) => i === 0 || v > ramp.l[i - 1]);
        check(`${scheme}: few to many, each step further from the surface than the one before (${scheme === 'dark' ? 'brighter' : 'darker'})`,
            scheme === 'dark' ? brighter : darker, JSON.stringify(ramp.l.map(v => Math.round(v * 1000) / 1000)));
        check(`${scheme}: the step nearest the surface still 2:1 on it`, ramp.first >= 2, String(ramp.first));
        await context.close();
    }
}

// ============================================================ B18 with the text doubled
{
    suite('B18 the text doubled: no sideways scroll, nothing cut, the last button reachable');
    for (const [width, height] of [[320, 568], [375, 667]]) {
        const { context, page, errors: seen } = await openApp(browser, server.url, { width, height, scheme: 'light' });
        keep(seen);
        await page.evaluate(() => {
            const out = [];
            const walk = (rules, wrap) => {
                for (const rule of rules) {
                    if (rule.type === 4 || rule.type === 12) {
                        const head = rule.type === 4 ? `@media ${rule.media.mediaText}` : `@supports ${rule.conditionText}`;
                        walk(rule.cssRules, text => wrap(`${head}{${text}}`));
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
                if (rules) walk(rules, text => out.push(text));
            }
            out.unshift('html{font-size:32px !important;}');
            const style = document.createElement('style');
            style.id = 'ax2-cascade';
            style.textContent = out.join('\n');
            document.head.appendChild(style);
        });
        await openRead(page);
        const label = `${width}x${height}, text doubled`;
        const m = await page.evaluate(measureInPage, ['#statusModal']);
        const hero = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.status-hero-n')).fontSize));
        given(`${label}: the text is doubled`, hero >= 96, String(hero));
        same(`${label}: no sideways scroll`, m.page.scrollWidth, width);
        check(`${label}: nothing off the side`, m.offside.length === 0, brief(m.offside, o => `${o.left}..${o.right} ${o.where}`));
        check(`${label}: nothing cut`, m.cut.length === 0, brief(m.cut, c => `${c.by} «${c.words}» ${c.where}`));
        check(`${label}: no control's words past its edge`, m.spills.length === 0, brief(m.spills, o => `${o.by} «${o.words}» ${o.where}`));
        const last = await page.evaluate(() => {
            const close = document.getElementById('statusClose');
            close.scrollIntoView({ block: 'nearest' });
            const r = close.getBoundingClientRect();
            return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: innerHeight };
        });
        check(`${label}: the last button reachable`, last.top >= 0 && last.bottom <= last.height, JSON.stringify(last));
        await context.close();
    }
}

// ============================================================ B19 what opening costs, on a season, four times slower
{
    suite('B19 opened on a season with the processor slowed four times: painted within 1.2 s');
    const context = await browser.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true,
        hasTouch: true, serviceWorkers: 'block', timezoneId: 'Asia/Jerusalem', locale: 'he-IL' });
    const page = await context.newPage();
    const seen = [];
    page.on('pageerror', error => seen.push(error.message));
    keep(seen);
    await page.goto(`${server.url}/index.html`);
    await page.waitForFunction(() => typeof State === 'object' && State.schedule && typeof render === 'function');
    const size = await page.evaluate(() => {
        // removepace's season: thirty men, eight sites, a year of days to today, Rima, advances.
        const today = todayStr();
        State.schedule.workers = Array.from({ length: 30 }, (_, i) => ({ id: 'w_' + String(i + 1).padStart(2, '0'),
            name: 'דוגמה ' + (i + 1), active: i < 28, dailyRate: 380 + 10 * (i % 6), hourlyRate: 50,
            ...(i < 10 ? { payCycles: '2025-11-14=weekly' } : {}) }));
        State.schedule.places = Array.from({ length: 8 }, (_, i) => ({ id: 'p_0' + (i + 1), name: 'אתר ' + (i + 1), active: true }));
        const active = State.schedule.workers.filter(worker => worker.active);
        const day = new Date(today + 'T12:00:00');
        day.setDate(day.getDate() - 368);
        const last = new Date(today + 'T12:00:00');
        let at = 0;
        for (; day <= last; day.setDate(day.getDate() + 1), at += 1) {
            const date = toLocalDateStr(day);
            if (day.getDay() === 6 && date !== today) continue;
            active.forEach((worker, i) => {
                if ((i + at) % 11 === 0) { markAbsent(State.schedule, date, worker.id, 'actual'); return; }
                if ((i * 3 + at) % 17 === 0) return;
                assignPlace(State.schedule, date, worker.id, 'actual', 'p_0' + (((i + (at % 5)) % 8) + 1));
            });
            if (at % 2 === 0) setRimaCount(State.schedule, date, 'p_01', 3);
        }
        const back = n => { const d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() - n); return toLocalDateStr(d); };
        [200, 150, 120, 90, 60, 45, 30, 17, 10, 3].forEach((ago, i) =>
            addAdvance(State.schedule, active[(i * 2) % active.length].id, back(ago), 300 + 100 * (i % 5), ''));
        State.save();
        const plan = { id: carryMigrationId(), rows: [] };
        State.commit(recordCarryApproval(State.schedule, plan, new Date().toISOString(), syncDeviceId()));
        render();
        return { days: Object.keys(State.schedule.days).length, bytes: JSON.stringify(State.schedule).length };
    });
    given('a season on the phone: a year of days', size.days >= 300, JSON.stringify(size));
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const opened = await page.evaluate(() => new Promise(done => {
        STATUS_MONEY_KEPT = null; OWES_KEPT = null; CLOSE_REMINDER_KEPT = null;
        const began = performance.now();
        openStatus();
        requestAnimationFrame(() => done({ ms: Math.round(performance.now() - began),
            pending: Boolean(document.querySelector('#statusModal .status-pending')),
            sections: document.querySelectorAll('#statusBody > .status-sec').length,
            weeks: document.querySelectorAll('.status-week').length, sites: document.querySelectorAll('.status-site').length }));
    }));
    console.log(`        opened on the season at 4x: ${opened.ms} ms to the first frame`);
    check('the first frame within 1.2 s', opened.ms <= 1200, `${opened.ms} ms`);
    same('and on it: six sections, twelve weeks, the sites, and the money\'s place waiting', [opened.sections, opened.weeks, opened.sites > 0, opened.pending],
        [6, 12, true, true]);
    await page.waitForFunction(() => !document.querySelector('#statusModal .status-pending'), null, { timeout: 30000 });
    check('and the money read after it', await page.evaluate(() => document.getElementById('statusMoney').textContent.length > 0));
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await context.close();
}

suite('B20 no uncaught error');
const all = errors.flat();
same('not one, on any page of this suite', all, []);

await browser.close();
server.close();
report();
