// «תמונת מצב» (js/ui/status.js) in a real Chromium.
//
//   node tests/statusscreen.browser.mjs
//
// The screen the sync chip opens. Held here, on the seeded app of tests/screens.mjs (the
// contract's criteria 12-21; the figures themselves are tests/statusscreen.test.mjs's):
//
//   B12 THE DOOR costs the strip nothing: at 320x568, 375x667 and 440x956, both schemes, and at
//       340, 360, 390 and 412 wide, the large display off and on, with the chip saying «שגיאת
//       סנכרון», «מסונכרן», a count waiting to be sent of one to four digits («9», «38», «138»,
//       «1234 ממתינים לשליחה») and with no chip at all, the strip is exactly as tall as the same
//       page with the button taken off the chip - also where the strip already puts the chip on
//       a line of its own - and the pill exactly where it was (52px or less, 60 with the mode, but
//       where the base wraps); the same sideways and on wide windows, the mode off and on; the
//       door 44px both ways (52 with the mode) and its pill all door, «הגדרות» all its own; named
//       «תמונת מצב · <the chip's word>», worded where there is no chip; no chevron; «הגדרות»
//       whole on the glass.
//   B13 A TAP opens the dialog at its title; Escape, the backdrop and «סגור» close it and give
//       the keyboard back to the door; Tab stays inside; midEdit() is true while it is open -
//       the moment v205's automatic update waits for - and false once it is shut.
//   B14 THE MONEY: with the board's reading stale the first paint says «מחשב את החשבונות…» and
//       no figure of the board, and the board's own lines replace it; with it fresh the lines
//       are in the first paint; the close line - the reminder's own, while its line is up - is
//       in the first paint either way.
//   B15 THE RAMP: the five --pulse colours, computed, strictly monotone in lightness, the step
//       nearest the surface 3:1 and more on it (WCAG 1.4.11), each 1.25:1 and more from its
//       neighbour, in both schemes - the values and their ratios printed.
//   B16 EVERY DOOR lands where it says - today, the pay sheet (or «יום תשלום» where a build has
//       it), «סגירת שבוע», «מי חייב כסף», a week, «לוח חודשי» where a build has it, a site's
//       card, ⋯'s cloud and backup. A door to a dialog ends on the new dialog's title; a door to
//       anything else ends - after setTimeout(0) and the task after it - where the target put
//       the focus (⋯'s heading, the board's title), never on the door. The other tracks' openers,
//       stood in for: «יום תשלום» once, in the task that shut this dialog; «לוח חודשי» once,
//       with (null, null), in a later one.
//   B17 A COMMIT under the open dialog draws it again where the reader was - the row he was
//       looking at where it stood on the glass, before the money is read again and after - and
//       the board is read once, after the draws have stopped for a second and a half; the close
//       count never; the keyboard on «מי חייב כסף» waits in the money's place and is given back.
//   B18 THE FLOORS on every phone, scheme and mode, and with the text doubled: the ruler of
//       tests/screens.mjs, no sideways scroll, nothing cut, the last button reachable.
//   B19 WHAT IT COSTS, the processor slowed four times: opened on a year's season, the dialog
//       painted - sections and the money's place - within 1.2 s; and on a season NOBODY closed
//       (forty-one men, an advance every few weeks), after a write on the day screen, the door
//       tapped: painted within 1.2 s of the tap, the board's lines within 4 s of that paint, ONE
//       reading of the board and none of the close count.
//   B20 No uncaught error anywhere.
//   B21 NOTHING WRITTEN: the disk and the record byte for byte across opening, redrawing and
//       every door - but the journey's, whose one byte is the journey's own key, the same as
//       a press of «בניית סידור» in the dock on a twin page under the same clock; and with a
//       journey building tomorrow on the day screen, no door to today, and every other door
//       pressed leaves the disk and the journey's day where they were.
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

// The chip's states, by the line it is read from (renderSyncChip, js/app.js): a count waiting to
// be sent of one to four digits - a day or two offline is three - the longest words it says.
const waiting = n => [`${n} ממתינים לשליחה`, `מחובר. יש רישומים שעדיין נשלחים. (${n} ממתינים לשליחה)`];
const CHIPS = [
    ['שגיאת סנכרון', 'שגיאת סנכרון - הנתונים שמורים במכשיר הזה. (38 ממתינים לשליחה)'],
    ['מסונכרן', 'מסונכרן בין המכשירים. · עודכן: 19:42'],
    waiting(9), waiting(38), waiting(138), waiting(1234),
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
    const settingsBtn = document.getElementById('settingsBtn');
    const settings = box(settingsBtn);
    const pillNode = chip.hidden ? door.querySelector('.status-door-words') : chip;
    const pill = box(pillNode);
    const at = (x, y) => document.elementFromPoint(x, y);
    // The pill's own points - its centre and four corners, 2px in - are all the door's; and the
    // door's reach, down the pill's centre line, on the glass.
    const inner = [[pill.l + pill.w / 2, pill.t + pill.h / 2], [pill.l + 2, pill.t + 2], [pill.r - 2, pill.t + 2],
        [pill.l + 2, pill.b - 2], [pill.r - 2, pill.b - 2]];
    const pillIsDoor = inner.every(([x, y]) => { const hit = at(x, y); return Boolean(hit) && door.contains(hit); });
    let reach = 0;
    for (let y = Math.max(0, Math.floor(box(door).t)); y < Math.min(innerHeight, Math.ceil(box(door).b)); y += 1) {
        const hit = at(pill.l + pill.w / 2, y);
        if (hit && door.contains(hit)) reach += 1;
    }
    // «הגדרות» its own: its centre and corners, 2px in, are never the door's.
    const settingsOwn = [[settings.l + settings.w / 2, settings.t + settings.h / 2], [settings.l + 2, settings.t + 2],
        [settings.r - 2, settings.t + 2], [settings.l + 2, settings.b - 2], [settings.r - 2, settings.b - 2]]
        .every(([x, y]) => { const hit = at(x, y); return Boolean(hit) && settingsBtn.contains(hit); });
    const out = { wrapped: bar(), door: box(door), name: door.getAttribute('aria-label'), chipShown: !chip.hidden,
        words: getComputedStyle(door.querySelector('.status-door-words')).display !== 'none',
        chevron: Boolean(door.querySelector('svg')), pill, pillIsDoor, reach, settingsOwn,
        settings, settingsWhole: settings.l >= -0.5 && settings.r <= innerWidth + 0.5 && settings.t >= -0.5 && settings.b <= innerHeight + 0.5,
        width: innerWidth, large: document.documentElement.classList.contains('display-large') };
    door.parentNode.insertBefore(chip, door);
    door.style.display = 'none';
    out.unwrapped = bar();
    out.basePill = chip.hidden ? null : box(chip);
    // The strip as v204 drew it puts the chip on a line of its own when the chip and «הגדרות» do
    // not fit side by side: the chip's line is then above «הגדרות»'s.
    out.alone = !chip.hidden && box(chip).b <= box(settingsBtn).t + 0.5;
    door.insertBefore(chip, door.firstChild);
    door.style.display = '';
    out.again = bar();
    return out;
}, line);
// The pill where v204 drew it, to the half pixel.
const samePlace = (a, b) => !a || !b || (Math.abs(a.l - b.l) <= 0.5 && Math.abs(a.t - b.t) <= 0.5 && Math.abs(a.w - b.w) <= 0.5 && Math.abs(a.h - b.h) <= 0.5);
// What one width, scheme and mode holds for every chip.
function stripChecks(label, m, word, large, bound) {
    const which = word || 'no chip';
    same(`${label}, «${which}»: the strip is the height it is without the door`, m.wrapped, m.unwrapped);
    if (bound && !m.alone) check(`${label}, «${which}»: ${large ? 60 : 52}px or less`, m.wrapped <= (large ? 60 : 52), String(m.wrapped));
    same(`${label}, «${which}»: the door put back, the strip is what it was with it`, m.again, m.wrapped);
    check(`${label}, «${which}»: the pill where it was drawn without the door`, samePlace(m.pill, m.basePill),
        `${JSON.stringify(m.basePill)} -> ${JSON.stringify(m.pill)}`);
    const floor = large ? 51.5 : 43.5;
    check(`${label}, «${which}»: the door ${large ? 52 : 44}px both ways`, m.door.w >= floor && m.door.h >= floor, `${m.door.w}x${m.door.h}`);
    check(`${label}, «${which}»: every point of the pill is the door's, and every point of «הגדרות» its own`, m.pillIsDoor && m.settingsOwn,
        JSON.stringify({ pill: m.pillIsDoor, settings: m.settingsOwn }));
    // Its reach down the pill's centre line: the whole floor where the chip shares a line with
    // «הגדרות»; where the strip puts the chip on a line of its own, all the room the strip has
    // above «הגדרות»'s line - the strip is not made taller for it (the price is said in
    // features/status/handoff.md).
    if (m.alone) {
        console.log(`        ${label}, «${which}»: the chip on a line of its own - the door reaches ${m.reach}px down the pill (the strip has ${Math.round(m.settings.t)}px above «הגדרות»)`);
        check(`${label}, «${which}»: on a line of its own, the door reaches from the top of the glass to «הגדרות»`,
            m.reach >= Math.floor(m.settings.t) - 1, `${m.reach}px of ${Math.round(m.settings.t)}`);
    } else {
        check(`${label}, «${which}»: the door's reach down the pill, ${large ? 52 : 44}px`, m.reach >= floor, `${m.reach}px`);
    }
    same(`${label}, «${which}»: its name`, m.name, word ? `תמונת מצב · ${word}` : 'תמונת מצב');
    same(`${label}, «${which}»: the chip, or the door's own words - one of them; no chevron`,
        [m.chipShown, m.words, m.chevron], [Boolean(word), !word, false]);
    check(`${label}, «${which}»: «הגדרות» whole on the glass`, m.settingsWhole, JSON.stringify(m.settings));
}
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
            for (const [word, line] of CHIPS) stripChecks(label, await stripWith(page, line), word, large, true);
            await stripBack(page);

            suite(`B18 ${label}: the floors of the open dialog`);
            // The reminder's line up (its own function), so the close row is on the dialog too.
            await page.evaluate(() => closeReminderShow(4));
            await openRead(page);
            check(`${label}: the reminder's line up, the close row is on the dialog, its own sentence`, await page.evaluate(() => {
                const row = document.querySelector('#statusBody .status-money-close');
                return Boolean(row) && row.querySelector('p').textContent === CLOSE_REMINDER_TEXT.line(4);
            }));
            await floors(page, label, large, width);
            if (SHOTS && ((width === 440 && scheme === 'dark' && !large) || (width === 320 && large))) {
                await page.screenshot({ path: join(SHOTS, `status-${width}-${scheme}${large ? '-large' : ''}.jpg`), type: 'jpeg', quality: 80 });
            }
            await page.evaluate(() => { closeStatus(); closeReminderHide(); });
            await context.close();
        }
    }
}

// ============================================================ B12 the widths between, sideways and wide
// The phones between the three (340-412 wide), where a long count put the chip on a line of its
// own with the mode on; and sideways and wide windows, the tabs in the strip or under it - each
// with the mode off and on.
for (const [width, height] of [[340, 640], [360, 640], [390, 844], [412, 892], [667, 375], [736, 414], [768, 1024], [844, 390],
    [960, 600], [1024, 768]]) {
    for (const large of [false, true]) {
        const label = `${width}x${height}${large ? ' large' : ''}`;
        const { context, page, errors: seen } = await openApp(browser, server.url, { width, height, scheme: 'light', large, seeded: false });
        keep(seen);
        suite(`B12 ${label}: the door costs the strip nothing${width > 700 ? ', the tabs in it' : ''}`);
        for (const [word, line] of CHIPS) stripChecks(label, await stripWith(page, line), word, large, width <= 700 && height > 500);
        await stripBack(page);
        await context.close();
    }
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
    same('while it is open the app is mid-edit (midEdit, js/ui/offline.js): no update is put in under it',
        await page.evaluate(() => [midEdit(), document.getElementById('statusModal').style.display]), [true, 'flex']);
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
    same('and shut, the app is not mid-edit any more', await page.evaluate(() => midEdit()), false);
    await page.locator('#statusDoor').tap();
    await page.waitForFunction(() => statusIsOpen());
    await page.mouse.click(4, 480);
    same('the backdrop closes it, and the keyboard is back on the door', [await dialogOpen(page), await focusId(page)], [false, 'statusDoor']);
    await page.locator('#statusDoor').tap();
    await page.waitForFunction(() => statusIsOpen());
    await page.locator('#statusClose').tap();
    same('«סגור» closes it, and the keyboard is back on the door', [await dialogOpen(page), await focusId(page)], [false, 'statusDoor']);
    same('and the app is not mid-edit', await page.evaluate(() => midEdit()), false);

    suite('B14 the money: a stale reading never in the first paint, a fresh one in it; the close line mirrored in it either way');
    // The reminder's line, put up by its own function with its own count (the reading behind a
    // count is tests/closereminder.*'s) - this screen only mirrors it.
    await page.evaluate(() => closeReminderShow(4));
    const firstPaint = () => page.evaluate(() => new Promise(done => {
        openStatus();
        requestAnimationFrame(() => {
            const money = document.getElementById('statusMoney');
            const close = document.querySelector('#statusBody .status-money-close');
            done({ text: money.textContent, busy: money.getAttribute('aria-busy'),
                lines: [...money.querySelectorAll('p')].map(node => node.textContent),
                close: close ? [[...close.querySelectorAll('p')].map(node => node.textContent), close.querySelector('button').textContent] : null,
                sections: [...document.querySelectorAll('#statusBody > .status-sec')].map(node => node.className.replace('status-sec ', '')) });
        });
    }));
    const closeLine = await page.evaluate(() => [[CLOSE_REMINDER_TEXT.line(4)], CLOSE_REMINDER_TEXT.open]);
    await page.evaluate(() => { OWES_KEPT = null; });
    const stale = await firstPaint();
    same('stale: the first paint says «מחשב את החשבונות…» where the board will be, and no figure of it', [stale.text, stale.busy, /\d/.test(stale.text)],
        ['מחשב את החשבונות…', 'true', false]);
    same('and every other section is there already', stale.sections, ['status-today', 'status-next', 'status-money', 'status-pulse', 'status-sites', 'status-device']);
    same('the close line is in the first paint: the reminder\'s own sentence, byte for byte, and its button', stale.close, closeLine);
    check('which is the sentence on the reminder\'s line', await page.evaluate(() => document.getElementById('closeReminderLine').textContent === CLOSE_REMINDER_TEXT.line(4)));
    await page.waitForFunction(() => !document.querySelector('#statusModal .status-pending'));
    const lines = await page.evaluate(() => {
        const read = owesRead(State.schedule, todayStr());
        return { seen: [...document.querySelectorAll('#statusMoney p')].map(node => node.textContent),
            want: [`${OWES_TEXT.total}: ${owesMoney(read.total)}`, owesCountLine(read)] };
    });
    same('then the board\'s own lines replace it', lines.seen, lines.want);
    await page.evaluate(() => closeStatus());
    const fresh = await firstPaint();
    same('fresh: the board\'s lines are in the first paint', [fresh.lines, fresh.busy], [lines.want, null]);
    same('and the close line again', fresh.close, closeLine);
    await page.evaluate(() => closeStatus());
    await page.evaluate(() => closeReminderHide());
    const down = await firstPaint();
    same('the reminder\'s line down: no close line here', down.close, null);
    await page.evaluate(() => closeStatus());
    const opened = await page.evaluate(() => ({
        disk: JSON.stringify(Object.keys(localStorage).filter(key => key !== 'farkad:openBuilds').sort().map(key => [key, localStorage.getItem(key)])),
        record: JSON.stringify(State.schedule)
    }));
    same('B21: opened six times, tabbed through, closed every way and read three times - the disk byte for byte', opened.disk, before.disk);
    same('B21: and the record', opened.record, before.record);

    suite('B17 a commit under the open dialog: drawn again where he was; the money read once the draws stop');
    await openRead(page);
    // Where every keyed row and door of the dialog stands on the glass, by its key.
    const rows = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#statusBody [data-status-key]')]
        .map(node => [node.dataset.statusKey, Math.round(node.getBoundingClientRect().top * 10) / 10])));
    // He reads the pulse: its third week at the top of the glass.
    await page.evaluate(() => {
        window.__moneyReads = 0;
        window.__closeReads = 0;
        const real = owesRead;
        owesRead = function () { window.__moneyReads += 1; return real.apply(this, arguments); };
        const close = weeklyCloseRead;
        weeklyCloseRead = function () { window.__closeReads += 1; return close.apply(this, arguments); };
        const content = document.querySelector('#statusModal .modal-content');
        const row = document.querySelectorAll('#statusBody .status-week')[2];
        content.scrollTop += row.getBoundingClientRect().top - content.getBoundingClientRect().top - 40;
    });
    const was = await page.evaluate(() => ({ hero: document.querySelector('.status-hero-n').textContent,
        money: Math.round(document.getElementById('statusMoney').getBoundingClientRect().height) }));
    const wasRows = await rows();
    const looking = Object.keys(wasRows).filter(key => key.startsWith('week:') || key.startsWith('site:'));
    const onGlass = (at, keys) => keys.filter(key => at[key] !== undefined && at[key] >= 0 && at[key] < 956).map(key => [key, at[key]]);
    given('he is reading the weeks and the sites', onGlass(wasRows, looking).length >= 6, JSON.stringify(onGlass(wasRows, looking)));
    // נועם פרץ is not recorded today on the screens' record: he is put on רמת גן.
    await page.evaluate(() => State.commit(assignPlace(State.schedule, todayStr(), 'w11', 'actual', 'p3')));
    const now = await page.evaluate(() => ({ hero: document.querySelector('.status-hero-n').textContent,
        pending: Boolean(document.querySelector('#statusModal .status-pending')),
        money: Math.round(document.getElementById('statusMoney').getBoundingClientRect().height) }));
    same('the commit is on the screen at once: one more man today', Number(now.hero), Number(was.hero) + 1);
    same('the money of the record before it is not shown as current', now.pending, true);
    same('and its place keeps the height its lines had, so nothing under it moves', now.money, was.money);
    same('every week and site he was looking at stands where it stood on the glass', onGlass(await rows(), looking), onGlass(wasRows, looking));
    await page.waitForFunction(() => !document.querySelector('#statusModal .status-pending'), null, { timeout: 6000 });
    await page.waitForTimeout(100);
    same('the money read again: still where they stood', onGlass(await rows(), looking), onGlass(wasRows, looking));
    // Another phone takes the one man of נתניה off today: today's section loses that site's line,
    // above him - and what he is looking at does not move for it.
    await page.evaluate(() => State.commit(clearWorkerDay(State.schedule, todayStr(), 'w04', 'actual')));
    same('a site\'s line gone from today, above him: every row he was looking at where it stood',
        onGlass(await rows(), looking), onGlass(wasRows, looking));
    await page.waitForFunction(() => !document.querySelector('#statusModal .status-pending'), null, { timeout: 6000 });
    await page.waitForTimeout(100);
    same('and after the money is read again', onGlass(await rows(), looking), onGlass(wasRows, looking));
    await page.evaluate(() => State.commit(assignPlace(State.schedule, todayStr(), 'w04', 'actual', 'p4')));
    await page.waitForFunction(() => !document.querySelector('#statusModal .status-pending'), null, { timeout: 6000 });
    await page.waitForTimeout(1800);
    await page.evaluate(() => { window.__moneyReads = 0; });
    await page.waitForTimeout(500);
    await page.evaluate(() => State.commit(assignPlace(State.schedule, todayStr(), 'w12', 'actual', 'p3')));
    await page.waitForTimeout(500);
    await page.evaluate(() => State.commit(assignPlace(State.schedule, todayStr(), 'w13', 'actual', 'p3')));
    same('no reading while the draws go on', await page.evaluate(() => window.__moneyReads), 0);
    await page.waitForFunction(() => !document.querySelector('#statusModal .status-pending'), null, { timeout: 6000 });
    await page.waitForTimeout(1800);
    same('read once, after the draws stopped for a second and a half', await page.evaluate(() => window.__moneyReads), 1);
    same('and the close count never read under the open dialog', await page.evaluate(() => window.__closeReads), 0);
    // The keyboard on «מי חייב כסף»: a commit takes that button away while the money waits. The
    // keyboard waits in the money's place - inside the dialog, never on the page behind it, where
    // the next Tab would throw it to the dialog's top - and is given the button back once drawn.
    await page.evaluate(() => document.querySelector('#statusBody [data-status-key="go:board"]').focus({ preventScroll: true }));
    await page.evaluate(() => State.commit(assignPlace(State.schedule, todayStr(), 'w14', 'actual', 'p3')));
    const heldFocus = await page.evaluate(() => ({ id: document.activeElement.id, key: document.activeElement.dataset.statusKey || '',
        inside: document.getElementById('statusModal').contains(document.activeElement),
        pending: Boolean(document.querySelector('#statusModal .status-pending')) }));
    same('while the money waits, the keyboard waits in its place, inside the dialog', heldFocus,
        { id: 'statusMoney', key: '', inside: true, pending: true });
    await page.waitForFunction(() => !document.querySelector('#statusModal .status-pending'), null, { timeout: 6000 });
    await page.waitForTimeout(100);
    same('and is on «מי חייב כסף» again once the board is drawn', await page.evaluate(() => document.activeElement.dataset.statusKey || document.activeElement.id),
        'go:board');
    await page.keyboard.press('Tab');
    check('the next Tab goes on from there, not from the dialog\'s top', await page.evaluate(() => {
        const keys = [...document.querySelectorAll('#statusBody button')];
        const at = keys.indexOf(document.activeElement);
        return at > keys.findIndex(node => node.dataset.statusKey === 'go:board');
    }));
    await page.evaluate(() => { State.commit(clearWorkerDay(State.schedule, todayStr(), 'w11', 'actual'));
        State.commit(clearWorkerDay(State.schedule, todayStr(), 'w12', 'actual')); State.commit(clearWorkerDay(State.schedule, todayStr(), 'w13', 'actual'));
        State.commit(clearWorkerDay(State.schedule, todayStr(), 'w14', 'actual')); });
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
    // A door pressed from inside the page, and where the focus is after setTimeout(0) and the
    // task after it - the moment the contract names.
    const pressed = key => page.evaluate(key => new Promise(done => {
        const node = document.querySelector(`#statusBody [data-status-key="${key}"]`);
        const words = node.textContent.trim();
        node.click();
        setTimeout(() => setTimeout(() => done({ words, focus: (document.activeElement && document.activeElement.id) || '',
            open: statusIsOpen() }), 0), 0);
    }), key);
    const openNow = async () => { if (!(await dialogOpen(page))) await openRead(page); };
    await page.evaluate(() => { State.date = '2026-11-03'; render(); });
    same('«פתיחת היום לעריכה»: today on the day screen', [await door('go:today'), await page.evaluate(() => [currentView, State.date === todayStr(), statusIsOpen()])],
        ['פתיחת היום לעריכה', ['day', true, false]]);
    same('no «יום תשלום» on this build: «דוחות», the pay sheet', [await door('go:payday'), await page.evaluate(() => currentView)],
        ['דוחות', 'reports']);
    same('the reminder\'s line down: no close line, so no door to «סגירת שבוע» here', await page.evaluate(() => {
        closeReminderHide(); openStatus(); const there = Boolean(document.querySelector('[data-status-key="go:close"]')); closeStatus(); return there;
    }), false);
    await page.evaluate(() => closeReminderShow(4));
    same('its line up: «לסגירת שבוע», the dialog, entered at its title', [await door('go:close'), await page.evaluate(() => weeklyCloseIsOpen()), await focusId(page)],
        ['לסגירת שבוע', true, 'weeklyCloseTitle']);
    await page.evaluate(() => closeWeeklyClose());
    await page.waitForTimeout(150);
    same('and shut, the keyboard is back on the door', await focusId(page), 'statusDoor');
    await page.evaluate(() => closeReminderHide());
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
    // ⋯ is not a dialog: opened a task after this one shut, so the focus modal.js hands back to
    // the door comes first and settingsJump's after it.
    await openNow();
    same('«ענן וסנכרון»: ⋯ at its first section; after the shut task and the one after it, the focus on its heading, not the door',
        [await pressed('go:cloud'), await page.evaluate(() => settingsOpen)], [{ words: 'ענן וסנכרון', focus: 'settingsDaily', open: false }, true]);
    await page.waitForTimeout(250);
    same('and still there a moment later', await focusId(page), 'settingsDaily');
    await page.evaluate(() => closeSettings());
    await openNow();
    same('«גיבוי»: ⋯ at the backup, its row open, the focus on its heading, not the door',
        [await pressed('go:backup'), await page.evaluate(() => [settingsOpen, document.getElementById('settingsFoldBackup').open])],
        [{ words: 'גיבוי', focus: 'settingsBackups', open: false }, [true, true]]);
    await page.waitForTimeout(250);
    same('and still there a moment later', await focusId(page), 'settingsBackups');
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

    suite('B16 the other tracks\' doors, stood in for: when they are called, with what, and where the focus ends');
    await page.evaluate(() => {
        window.__payday = [];
        window.__board = [];
        // "The task that shut this dialog": true from closeStatus until the next task.
        window.__shutTask = false;
        window.__closeStatus = closeStatus;
        closeStatus = function () {
            window.__shutTask = true;
            setTimeout(() => { window.__shutTask = false; }, 0);
            return window.__closeStatus.apply(this, arguments);
        };
        // «יום תשלום» is a dialog: a .modal with its title.
        window.PAYDAY_TEXT = { entry: 'יום תשלום' };
        window.openPayday = function () {
            window.__payday.push({ args: [...arguments], sameTask: window.__shutTask, statusOpen: statusIsOpen() });
            let modal = document.getElementById('paydayStandIn');
            if (!modal) {
                modal = document.createElement('div');
                modal.className = 'modal';
                modal.id = 'paydayStandIn';
                const content = document.createElement('div');
                content.className = 'modal-content';
                const title = document.createElement('h3');
                title.id = 'paydayStandInTitle';
                title.tabIndex = -1;
                title.textContent = 'יום תשלום';
                content.appendChild(title);
                modal.appendChild(content);
                document.body.appendChild(modal);
            }
            modal.style.display = 'flex';
            return true;
        };
        // «לוח חודשי» is not: it gives the focus to a title of its own.
        window.MONTH_BOARD_TEXT = { door: 'לוח חודשי' };
        window.openMonthBoard = function (key, placeId) {
            window.__board.push({ args: [key, placeId], sameTask: window.__shutTask, statusOpen: statusIsOpen() });
            let title = document.getElementById('monthBoardStandIn');
            if (!title) {
                title = document.createElement('h3');
                title.id = 'monthBoardStandIn';
                title.tabIndex = -1;
                title.textContent = 'לוח חודשי';
                document.body.appendChild(title);
            }
            title.focus({ preventScroll: true });
            return true;
        };
    });
    await openNow();
    same('«יום תשלום»: its own opener, once, IN the task that shut this dialog; the new dialog\'s title focused',
        [await pressed('go:payday'), await page.evaluate(() => window.__payday)],
        [{ words: 'יום תשלום', focus: 'paydayStandInTitle', open: false }, [{ args: [], sameTask: true, statusOpen: false }]]);
    // Shut as modal.js would shut a dialog it watches: the focus back where it was before.
    await page.evaluate(() => {
        document.getElementById('paydayStandIn').style.display = 'none';
        if (focusBeforeModal && document.contains(focusBeforeModal)) focusBeforeModal.focus({ preventScroll: true });
        focusBeforeModal = null;
    });
    await openNow();
    same('«לוח חודשי»: under the pulse; its own opener, once, with (null, null), NOT in the task that shut this dialog; the focus on its title, never on the door',
        [await pressed('go:monthBoard'), await page.evaluate(() => window.__board)],
        [{ words: 'לוח חודשי', focus: 'monthBoardStandIn', open: false }, [{ args: [null, null], sameTask: false, statusOpen: false }]]);
    await page.waitForTimeout(250);
    same('and still there a moment later', await focusId(page), 'monthBoardStandIn');
    await page.evaluate(() => {
        closeStatus = window.__closeStatus;
        ['paydayStandIn', 'monthBoardStandIn'].forEach(id => { const node = document.getElementById(id); if (node) node.remove(); });
    });
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

// ============================================================ B21 a journey building tomorrow, and every door
// THE DAY SCREEN IS THE JOURNEY'S AT ITS FIRST STATION, its date the journey's: a door that put
// today on it carried tomorrow's seder to today and wrote the journey's place to say so (the
// review of 135bdb1). With the journey on, there is no door to today, and every other door
// leaves the disk and the journey's day where they were.
{
    suite('B21 a journey building tomorrow on the day screen: no door to today, and no door moves it or writes a byte');
    const { context, page, errors: seen } = await openApp(browser, server.url, { width: 375, height: 667, scheme: 'light' });
    keep(seen);
    tapsAtAPersonsPace(page);
    const read = () => page.evaluate(() => JSON.stringify(Object.keys(localStorage).filter(key => key !== 'farkad:openBuilds').sort()
        .map(key => [key, localStorage.getItem(key)])));
    const journey = () => page.evaluate(() => [journeyStation(), journeyDate()]);
    // He starts tomorrow's seder from the dock's own button, as he does.
    await page.locator('#journeyDockBtn').tap();
    await page.waitForTimeout(500);
    const building = await journey();
    given('the journey at its first station, on tomorrow', building[0] === 1 && building[1] === '2026-11-11', JSON.stringify(building));
    await page.evaluate(() => closeReminderShow(4));
    const disk = await read();
    const record = await page.evaluate(() => JSON.stringify(State.schedule));
    const offered = async () => {
        if (!(await dialogOpen(page))) {
            await page.locator('#statusDoor').tap();
            await page.waitForFunction(() => statusIsOpen() && !document.querySelector('#statusModal .status-pending'));
        }
        return page.evaluate(() => [...document.querySelectorAll('#statusBody [data-status-key]')].map(node => node.dataset.statusKey));
    };
    const keys = await offered();
    same('no «פתיחת היום לעריכה» while the journey builds another day; the journey\'s own door is there',
        [keys.includes('go:today'), keys.includes('go:journey'), await page.evaluate(() => [...document.querySelectorAll('#statusBody button')]
            .some(node => node.textContent.trim() === 'פתיחת היום לעריכה'))], [false, true, false]);
    const week = keys.find(key => key.startsWith('week:'));
    const site = keys.find(key => key.startsWith('site:'));
    // «לסגירת שבוע» first: the reminder's line is up by its own function, and the first render
    // after it (a door to a view) takes it down - the record's reminder was put away for the day.
    for (const key of ['go:close', 'go:payday', 'go:board', week, site, 'go:cloud', 'go:backup']) {
        await offered();
        const node = page.locator(`#statusBody [data-status-key="${key}"]`);
        await node.scrollIntoViewIfNeeded();
        await node.tap();
        await page.waitForTimeout(400);
        same(`«${key}»: the journey on its day, its station; the disk and the record byte for byte`,
            [await journey(), (await read()) === disk, (await page.evaluate(() => JSON.stringify(State.schedule))) === record],
            [building, true, true]);
        // Back from wherever the door went: the dialog it opened shut, ⋯ shut.
        await page.evaluate(() => {
            if (typeof weeklyCloseIsOpen === 'function' && weeklyCloseIsOpen()) closeWeeklyClose();
            if (typeof siteCardIsOpen === 'function' && siteCardIsOpen()) closeSiteCard();
            if (typeof settingsOpen !== 'undefined' && settingsOpen) closeSettings();
        });
        await page.waitForTimeout(200);
    }
    // And with the journey's day today itself, the door to today is there: it moves nothing.
    await page.evaluate(() => { State.date = todayStr(); render(); });
    same('the journey moved to today by the day\'s own header: the door to today is offered again', (await offered()).includes('go:today'), true);
    await page.evaluate(() => closeStatus());
    await context.close();
}

// ============================================================ B15 the ramp
{
    suite('B15 the ramp: one hue, step by step, the step nearest the surface 3:1 on it and 1.25:1 between neighbours, in both schemes');
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
            const ground = hex('--surface');
            const surface = lum(ground);
            const l = steps.map(lum);
            const ratio = (a, b) => Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
            return { steps, l, ground, surface, onSurface: l.map(v => ratio(v, surface)),
                neighbours: l.slice(1).map((v, i) => ratio(v, l[i])) };
        });
        console.log(`        ${scheme}: ${ramp.steps.join(' ')} on ${ramp.ground} - ${ramp.onSurface.join(', ')}:1; neighbours ${ramp.neighbours.join(', ')}:1`);
        given(`${scheme}: five colours read`, ramp.l.every(v => v !== null), JSON.stringify(ramp.steps));
        const darker = ramp.l.every((v, i) => i === 0 || v < ramp.l[i - 1]);
        const brighter = ramp.l.every((v, i) => i === 0 || v > ramp.l[i - 1]);
        check(`${scheme}: few to many, each step further from the surface than the one before (${scheme === 'dark' ? 'brighter' : 'darker'})`,
            scheme === 'dark' ? brighter : darker, JSON.stringify(ramp.l.map(v => Math.round(v * 1000) / 1000)));
        check(`${scheme}: the step nearest the surface 3:1 or more on it (WCAG 1.4.11): an empty day, the surface, is told from a slow one`,
            ramp.onSurface[0] >= 3, String(ramp.onSurface[0]));
        check(`${scheme}: each step 1.25:1 or more from its neighbour`, ramp.neighbours.every(r => r >= 1.25), ramp.neighbours.join(', '));
        await context.close();
    }
}

// ============================================================ B18 with the text doubled
// Every px font-size of every sheet, twice over (tests/mobile.test.mjs's cascade rewrite).
const doubleText = page => page.evaluate(() => {
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
{
    suite('B18 the text doubled: no sideways scroll, nothing cut, the last button reachable');
    for (const [width, height] of [[320, 568], [375, 667]]) {
        const { context, page, errors: seen } = await openApp(browser, server.url, { width, height, scheme: 'light' });
        keep(seen);
        await doubleText(page);
        const label = `${width}x${height}, text doubled`;
        // The door's own words (a phone with no chip) at twice the size: taller than the pill,
        // so the door's line is as tall as they are - never words standing out of the strip
        // above it or over «הגדרות» beside or under it.
        const strip = await stripWith(page, CHIPS[CHIPS.length - 1][1]);
        const words = await page.evaluate(() => {
            const box = node => { const r = node.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; };
            const range = document.createRange();
            range.selectNodeContents(document.querySelector('#statusDoor .status-door-words'));
            const text = range.getBoundingClientRect();
            return { text: { l: text.left, r: text.right, t: text.top, b: text.bottom }, bar: box(document.querySelector('.topbar')),
                settings: box(document.getElementById('settingsBtn')) };
        });
        await stripBack(page);
        const apart = (a, b) => a.r <= b.l + 0.5 || b.r <= a.l + 0.5 || a.b <= b.t + 0.5 || b.b <= a.t + 0.5;
        check(`${label}: the door's own words inside the strip, top to bottom, and clear of «הגדרות»`,
            strip.wordsShown !== false && words.text.t >= words.bar.t - 0.5 && words.text.b <= words.bar.b + 0.5 && apart(words.text, words.settings),
            JSON.stringify(words));
        await openRead(page);
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

// ============================================================ B18 the pulse's day letters
// The head of the pulse: a letter per day. With a Saturday among the twelve weeks there are seven
// columns, and at 320 with «תצוגה גדולה» «ש׳» was wider than its column - the letters ran into
// each other (the review of 135bdb1). A column too narrow for the geresh keeps the letter; one too
// narrow for the letter shows none.
{
    suite('B18 the pulse\'s day letters: never one into the next - seven columns with the mode, and the text doubled');
    for (const [width, height, large, doubled] of [[320, 568, true, false], [375, 667, true, false], [440, 956, true, false],
        [320, 568, false, false], [320, 568, false, true], [375, 667, false, true]]) {
        const label = `${width}x${height}${large ? ' large' : ''}${doubled ? ', text doubled' : ''}`;
        const { context, page, errors: seen } = await openApp(browser, server.url, { width, height, scheme: 'light', large });
        keep(seen);
        // A Saturday among the twelve weeks with a day's work on it: the seventh column.
        await page.evaluate(() => State.commit(assignPlace(State.schedule, '2026-10-31', 'w01', 'actual', 'p1')));
        if (doubled) await doubleText(page);
        await openRead(page);
        const m = await page.evaluate(() => {
            const cells = [...document.querySelectorAll('#statusBody .status-grid-head .status-grid-day')];
            const shown = cells.map(cell => [...cell.children].filter(part => getComputedStyle(part).display !== 'none'
                && getComputedStyle(part).visibility === 'visible'));
            const box = parts => {
                if (!parts.length) return null;
                const range = document.createRange();
                range.setStartBefore(parts[0]);
                range.setEndAfter(parts[parts.length - 1]);
                const r = range.getBoundingClientRect();
                return { l: r.left, r: r.right };
            };
            const boxes = shown.map(box);
            const gaps = [];
            for (let i = 1; i < boxes.length; i += 1) {
                if (boxes[i] && boxes[i - 1]) gaps.push(Math.round((boxes[i - 1].l - boxes[i].r) * 10) / 10);
            }
            return { cols: cells.length, cell: Math.round(cells[0].getBoundingClientRect().width * 10) / 10,
                said: shown.map(parts => parts.map(part => part.textContent).join('')),
                words: cells.map(cell => cell.textContent), gaps,
                font: parseFloat(getComputedStyle(cells[0]).fontSize) };
        });
        console.log(`        ${label}: ${m.cols} columns of ${m.cell}px, ${m.font}px letters, drawn ${JSON.stringify(m.said)}, gaps ${m.gaps.join(', ')}px`);
        same(`${label}: seven columns, each the day's own word (HEBREW_DAY_LETTERS)`, m.words, ['ו׳', 'ש׳', 'א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳']);
        check(`${label}: no letter drawn into the next`, m.gaps.every(gap => gap >= 1), m.gaps.join(', '));
        if (!doubled) {
            same(`${label}: every column still says its day - the letter, with its mark where there is room`,
                m.said.map(word => word.slice(0, 1)), ['ו', 'ש', 'א', 'ב', 'ג', 'ד', 'ה']);
        }
        await context.close();
    }
}

// ============================================================ B18 a site's row: off the roster, and a long name
{
    suite('B18 a site\'s row: one outside the roster is not drawn as a button; a long name keeps its swatch');
    for (const [width, height, large] of [[320, 568, true], [440, 956, false]]) {
        const label = `${width}x${height}${large ? ' large' : ''}`;
        const { context, page, errors: seen } = await openApp(browser, server.url, { width, height, scheme: 'dark', large });
        keep(seen);
        // In memory only, and put back: a day at a site the roster has not got (the record names
        // it «אתר שאינו ברשימה 1»), and a long name on the first site of the roster.
        await page.evaluate(() => {
            window.__places = JSON.stringify(State.schedule.places);
            State.schedule.places.push({ id: 'p9', name: 'זמני', active: true });
            assignPlace(State.schedule, todayStr(), 'w12', 'actual', 'p9');
            State.schedule.places = State.schedule.places.filter(place => place.id !== 'p9');
            State.schedule.places[0].name = 'הרצליה פיתוח - מגדלי הים התיכון שלב ב׳ ומרכז המסחר';
        });
        await openRead(page);
        const m = await page.evaluate(() => {
            const content = document.querySelector('#statusModal .modal-content');
            const unlisted = document.querySelector('#statusBody .status-site-unlisted');
            const listed = document.querySelector('#statusBody button.status-site');
            const look = node => { const cs = getComputedStyle(node); return { ground: cs.backgroundColor, border: cs.borderTopStyle }; };
            const named = [...document.querySelectorAll('#statusBody button.status-site')]
                .find(node => node.querySelector('.status-site-name').textContent.includes('מגדלי הים'));
            const swatch = named.querySelector('.status-swatch').getBoundingClientRect();
            const name = named.querySelector('.status-site-name');
            const range = document.createRange();
            range.selectNodeContents(name);
            const first = range.getClientRects()[0];
            unlisted.scrollIntoView({ block: 'center' });
            const r = unlisted.getBoundingClientRect();
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return { unlisted: look(unlisted), listed: look(listed), tag: unlisted.tagName, role: unlisted.getAttribute('role'),
                hitButton: Boolean(hit && hit.closest('button')),
                swatch: { top: swatch.top, bottom: swatch.bottom }, line: { top: first.top, bottom: first.bottom },
                lines: [...range.getClientRects()].length, scroll: content.scrollTop };
        });
        same(`${label}: the site outside the roster is a plain row - no button under the finger, no ground of one`,
            [m.tag, m.role, m.hitButton, m.unlisted.ground === m.listed.ground, m.unlisted.border], ['DIV', 'group', false, false, 'dashed']);
        check(`${label}: a long name wraps beside its swatch - the swatch on its first line, never alone on a line of its own`,
            m.lines > 1 && m.swatch.bottom > m.line.top && m.swatch.top < m.line.bottom, JSON.stringify({ swatch: m.swatch, line: m.line, lines: m.lines }));
        await floors(page, `${label}, the long name and the site off the roster`, large, width);
        await page.evaluate(() => { State.schedule.places = JSON.parse(window.__places); });
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
        OWES_KEPT = null;
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

// ============================================================ B19 a write on the day screen, then the door, on a season nobody closed
{
    suite('B19 a season NOBODY closed, a write on the day screen, the door tapped at 4x: painted in 1.2 s, the board in 4 s more, read once');
    const context = await browser.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true,
        hasTouch: true, serviceWorkers: 'block', timezoneId: 'Asia/Jerusalem', locale: 'he-IL' });
    const page = await context.newPage();
    const seen = [];
    page.on('pageerror', error => seen.push(error.message));
    keep(seen);
    await page.goto(`${server.url}/index.html`);
    await page.waitForFunction(() => typeof State === 'object' && State.schedule && typeof render === 'function');
    // scout-api 7.2 "B", seeded in the page through the model's own writers with a seeded
    // generator: forty-one men (sixteen weekly), six sites, every day but Saturday from the
    // first of the year to today, an advance for every man every two to four weeks, no close.
    const size = await page.evaluate(() => {
        let a = 2026;
        const rand = () => {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        const today = todayStr();
        const s = State.schedule;
        s.places = Array.from({ length: 6 }, (_, i) => ({ id: 'p_' + (i + 1), name: 'אתר ' + (i + 1), active: i < 5 }));
        s.workers = Array.from({ length: 41 }, (_, i) => Object.assign({ id: 'w_' + String(i + 1).padStart(2, '0'),
            name: 'דוגמה ' + (i + 1), active: true, dailyRate: 380 + 20 * (i % 8), hourlyRate: 50 },
        i < 16 ? { payCycles: '2026-01-02=weekly' } : {}));
        const next = date => { const d = parseLocalDate(date); d.setDate(d.getDate() + 1); return toLocalDateStr(d); };
        const first = today.slice(0, 4) + '-01-01';
        for (let date = first; date <= today; date = next(date)) {
            if (parseLocalDate(date).getDay() === 6) continue;
            s.workers.forEach((worker, i) => {
                if (rand() > 0.85) return;
                if (rand() < 0.03) { markAbsent(s, date, worker.id, 'actual'); return; }
                const home = 'p_' + (1 + (i % 5));
                if (rand() < 0.04) assignPlace(s, date, worker.id, 'actual', home, 'double');
                else assignPlace(s, date, worker.id, 'actual', home);
            });
            if (rand() < 0.45) setRimaCount(s, date, 'p_1', 1 + Math.floor(rand() * 4));
            if (rand() < 0.3) setYosefGevesCount(s, date, 'p_2', 1 + Math.floor(rand() * 5));
        }
        let advances = 0;
        s.workers.forEach(worker => {
            const d = parseLocalDate(first);
            d.setDate(d.getDate() + Math.floor(rand() * 20));
            for (; toLocalDateStr(d) <= today; d.setDate(d.getDate() + 14 + Math.floor(rand() * 14))) {
                const date = toLocalDateStr(d);
                recordNewAdvance(s, worker.id, date, [200, 300, 500, 800, 1000][Math.floor(rand() * 5)], '', date + 'T07:00:00.000Z',
                    syncDeviceId(), 'cash');
                advances += 1;
            }
        });
        State.save();
        State.commit(recordCarryApproval(State.schedule, { id: carryMigrationId(), rows: [] }, new Date().toISOString(), syncDeviceId()));
        render();
        return { men: s.workers.length, days: Object.keys(s.days).length, advances, kib: Math.round(JSON.stringify(s).length / 1024) };
    });
    console.log(`        season B in the page: ${JSON.stringify(size)}`);
    given('a season nobody closed: forty-one men, the year\'s days, an advance every few weeks', size.men === 41 && size.days >= 250
        && size.advances >= 500, JSON.stringify(size));
    // The reminder reads ITS count first, at full speed, as it does after a boot. On a season
    // nobody closed every man has an earlier open period a debt ran through, so «סגירת שבוע»
    // holds him and offers nobody (v198, D5): the line stays down, and this screen - which only
    // mirrors it - has no close line either. Its reading is the reminder's, made before the
    // measurement; nothing of it is this screen's.
    await page.evaluate(() => closeReminderRefresh('boot'));
    await page.waitForTimeout(2000);
    const shown = await page.evaluate(() => closeReminderShown);
    console.log(`        the reminder's own reading on that season: ${shown === null ? 'its line down (every man held)' : `its line up, ${shown}`}`);
    // Every reading counted from here on, and the time of the open taken from inside the page.
    await page.evaluate(() => {
        window.__reads = { owes: 0, close: 0 };
        const owes = owesRead;
        owesRead = function () { window.__reads.owes += 1; return owes.apply(this, arguments); };
        const close = weeklyCloseRead;
        weeklyCloseRead = function () { window.__reads.close += 1; return close.apply(this, arguments); };
        window.__open = null;
        const open = openStatus;
        openStatus = function () {
            const t0 = performance.now();
            const out = open.apply(this, arguments);
            requestAnimationFrame(() => {
                const node = document.getElementById('statusMoney');
                window.__open = { t0, t1: performance.now(), t2: null, pending: Boolean(node.querySelector('.status-pending')),
                    close: Boolean(document.querySelector('#statusBody .status-money-close')),
                    sections: document.querySelectorAll('#statusBody > .status-sec').length,
                    weeks: document.querySelectorAll('.status-week').length };
                const read = () => {
                    if (node.querySelector('.status-pending')) return false;
                    window.__open.t2 = performance.now();
                    return true;
                };
                if (!read()) new MutationObserver((list, watch) => { if (read()) watch.disconnect(); }).observe(node, { childList: true, subtree: true });
            });
            return out;
        };
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    // A write ON THE DAY SCREEN: a man with nothing today put on a site, through State.
    const wrote = await page.evaluate(() => {
        const today = todayStr();
        const free = State.schedule.workers.find(worker => entriesFor(State.schedule, today, worker.id, 'actual').length === 0
            && !isAbsent(State.schedule, today, worker.id, 'actual'));
        const before = JSON.stringify(State.schedule).length;
        State.commit(assignPlace(State.schedule, today, free.id, 'actual', 'p_4'));
        return { view: currentView, moved: JSON.stringify(State.schedule).length !== before, who: free.id };
    });
    given('the write was made on the day screen, and went in', wrote.view === 'day' && wrote.moved, JSON.stringify(wrote));
    await page.locator('#statusDoor').tap();
    await page.waitForFunction(() => window.__open && window.__open.t2 !== null, null, { timeout: 60000 });
    await page.waitForTimeout(1000);
    const open = await page.evaluate(() => Object.assign({}, window.__open, { reads: window.__reads, still: statusIsOpen() }));
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const painted = Math.round(open.t1 - open.t0);
    const board = Math.round(open.t2 - open.t1);
    console.log(`        at 4x: painted ${painted} ms after the tap, the board's lines ${board} ms after that paint; owesRead ${open.reads.owes}, weeklyCloseRead ${open.reads.close}`);
    check('painted within 1.2 s of the tap', painted <= 1200, `${painted} ms`);
    same('with six sections, twelve weeks, the close line exactly as the reminder\'s is, and the board\'s place waiting',
        [open.sections, open.weeks, open.close, open.pending], [6, 12, Number.isInteger(shown) && shown > 0, true]);
    check('the board\'s lines within 4 s of that paint', board <= 4000, `${board} ms`);
    same('exactly ONE reading of the board, and NONE of the close count', [open.reads.owes, open.reads.close], [1, 0]);
    check('and the dialog still open over it all', open.still === true);
    await context.close();
}

suite('B20 no uncaught error');
const all = errors.flat();
same('not one, on any page of this suite', all, []);

await browser.close();
server.close();
report();
