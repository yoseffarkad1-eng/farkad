// «לסדר את המקדמה» (v201) - on the glass.
//
//   node tests/overpaidfix.browser.mjs [--shots <dir>]
//
// tests/overpaidfix.test.mjs holds which lines are corrected, the bytes written, every refusal
// and every word, in Node. This holds what only a screen can say, in a real Chromium, on the
// owner's four lines of one advance (2026-11-16; synthetic names):
//
//   - the button is ON THE SCREEN where the app used to dead-end: the closing box of his
//     account in «דוחות» and the over-settled card on «מקדמות» - 44px both ways, 16px words;
//   - a finger's tap opens the app's own question (#askModal): its title, the two lines by
//     name, «ביטול» focused, the confirming button the destructive kind;
//   - «כן, לסדר» (after the question's own hold) writes, and the screen redraws without the
//     warning or the button; «מקדמות» no longer says it is over-settled;
//   - «ביטול» writes nothing.
//
// With --shots <dir> it also leaves three pictures (375x812, deviceScaleFactor 2, light): the
// account's dialog with the button, the question, and the dialog after «כן». They assert
// nothing. NOT a real phone: emulated touch and Chromium's layout and fonts.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from './serve.mjs';
import { launchLocalBrowser } from './network-guard.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const root = new URL('..', import.meta.url).pathname;
const shotsAt = process.argv.indexOf('--shots');
const SHOTS = shotsAt !== -1 ? process.argv[shotsAt + 1] : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const server = await serve(root);
check('the browser is served the named tree', (await verifyServedAssets(server.url, root, expectedShaFor(root))).ok);
const browser = await launchLocalBrowser(chromium, { executablePath: process.env.CHROME_PATH });
const errors = [];
const plain = text => String(text).replace(/[‎‏⁦-⁩]/g, '').replace(/\s+/g, ' ').trim();
const NOON = '2026-11-16T12:00:00+02:00';
const OVERPAID_SENTENCE = 'יש עודף בהחזרי המקדמות של העובד הזה. אי אפשר לסגור חשבון שלא מסתדר - תקן קודם, ואז סגור.';

// THE OWNER'S FOUR LINES, written by the app's own model functions in the page, and put on the
// disk as the record a phone holds (the page reloads onto it).
function seedOwners() {
    const record = {
        schemaVersion: 2,
        workers: [{ id: 'w_s', name: 'סאמר', dailyRate: 550, hourlyRate: 0, active: true }],
        places: [{ id: 'p_x', name: 'אתר מערב', active: true }],
        days: {}, vehicles: [], advances: {},
        ledger: { advances: {}, unreadable: {}, migrations: { cm_carry: { id: 'cm_carry', kind: 'carry', rows: 0, at: '', by: 'd' } } }
    };
    for (let at = new Date(2026, 9, 16, 12); at <= new Date(2026, 10, 15, 12); at.setDate(at.getDate() + 1)) {
        if (at.getDay() === 6) continue;
        record.days[toLocalDateStr(at)] = { plan: {}, actual: { w_s: { entries: [{ placeId: 'p_x' }], rates: { daily: 550, hourly: 0 } } } };
    }
    const a1 = recordNewAdvance(record, 'w_s', '2026-10-23', 2200, '', '2026-10-23T07:00:00.000Z', 'd_owner', 'cash')[0].value.id;
    const wrote = [
        Boolean(recordAdvanceRepaid(record, a1, 2200, '2026-11-10', '', '2026-11-10T15:00:00.000Z', 'd_owner', 'cash')),
        closePeriodChanges(record, 'w_s', '2026-10-16', '2026-10-29', '2026-11-11T10:00:00.000Z', 'd_owner', 2200).length === 2,
        Boolean(recordAdvanceReversed(record, a1, 2200, '2026-10-23', 'העובד החזיר', '2026-11-12T10:00:00.000Z', 'd_owner'))
    ];
    localStorage.setItem('scheduleData:v2', JSON.stringify(record));
    return wrote;
}

async function phone(width, height, scheme) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true,
        hasTouch: true, colorScheme: scheme, serviceWorkers: 'block', timezoneId: 'Asia/Jerusalem', locale: 'he-IL' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
        const still = () => {
            if (document.getElementById('of-still') || !document.head) return;
            const style = document.createElement('style');
            style.id = 'of-still';
            style.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
            document.head.appendChild(style);
        };
        still();
        document.addEventListener('DOMContentLoaded', still);
    });
    await page.clock.install({ time: new Date(NOON) });
    await page.goto(`${server.url}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof State !== 'undefined' && typeof render === 'function' && typeof sortOverpaidAdvance === 'function');
    await page.waitForTimeout(250);
    const wrote = await page.evaluate(seedOwners);
    given(`${width} ${scheme}: the owner's four lines were written`, wrote.every(Boolean), JSON.stringify(wrote));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof State !== 'undefined' && typeof render === 'function');
    await page.waitForTimeout(250);
    given(`${width} ${scheme}: the phone holds him over-settled by 4,400`,
        await page.evaluate(() => overpaidAdvances(State.schedule, 'w_s').map(state => state.overpaid).join()) === '4400');
    await page.evaluate(() => {
        weeklyCloseShared = () => true;
        ['updateBanner', 'installBanner', 'whatsNewBanner'].forEach(id => {
            const node = document.getElementById(id);
            if (node) node.style.display = 'none';
        });
    });
    return page;
}

const disk = page => page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()
    .filter(key => key !== 'farkad:openBuilds' && key.indexOf('farkad:writeTick') !== 0)
    .map(key => [key, localStorage.getItem(key)])));
// His account's dialog, as a tap on his card in «דוחות» opens it.
const openAccount = page => page.evaluate(() => { showView('reports'); openWorkerDays('w_s'); });
const box = async (page, selector) => page.evaluate(sel => {
    const node = document.querySelector(sel);
    if (!node || !node.getClientRects().length) return null;
    const rect = node.getBoundingClientRect();
    return { w: rect.width, h: rect.height, size: parseFloat(getComputedStyle(node).fontSize), text: node.textContent };
}, selector);

// ================================================================== the account's dialog
{
    suite('the account\'s dialog: the button under the refusal, a finger\'s tap, the app\'s question, «כן» - and the warning gone');
    const page = await phone(375, 812, 'light');
    await openAccount(page);
    const body = plain(await page.textContent('#workerDaysBody'));
    check('the closing box says why it refuses', body.indexOf(OVERPAID_SENTENCE) !== -1, body.slice(0, 200));
    const button = '#workerDaysBody .period-closure .overpaid-fix';
    await page.locator(button).scrollIntoViewIfNeeded();
    const drawn = await box(page, button);
    given('the button is drawn', Boolean(drawn));
    same('it says «לסדר את המקדמה»', plain(drawn.text), 'לסדר את המקדמה');
    check('44px both ways, 16px words', drawn.w >= 44 && drawn.h >= 44 && drawn.size >= 16, JSON.stringify(drawn));
    if (SHOTS) {
        // The box at the top of the glass, so the picture shows the refusal and the button.
        await page.evaluate(() => {
            const content = document.querySelector('#workerDaysModal .modal-content');
            const target = document.querySelector('#workerDaysBody .period-closure');
            if (content && target) content.scrollTop = Math.max(0, target.offsetTop - 120);
        });
        await page.waitForTimeout(100);
        await page.screenshot({ path: join(SHOTS, '1-account-with-button.png') });
    }
    const before = await disk(page);
    await page.locator(button).tap();
    await page.waitForFunction(() => document.getElementById('askModal').style.display === 'flex');
    const asked = await page.evaluate(() => ({
        title: document.getElementById('askTitle').textContent,
        message: document.getElementById('askMessage').textContent,
        names: [...document.querySelectorAll('#askList li')].map(li => li.textContent),
        footer: document.getElementById('askFooter').textContent,
        ok: document.getElementById('askOk').textContent,
        danger: document.getElementById('askOk').classList.contains('btn-danger'),
        focused: document.activeElement && document.activeElement.id
    }));
    same('the question, as drawn', [asked.title, plain(asked.message), asked.names.map(plain), asked.footer, asked.ok], [
        'לסדר את המקדמה?',
        'המקדמה של 2200 ₪ מ-23/10/2026 נרשמה כמוחזרת יותר מפעם אחת, ולכן יש עודף של 4400 ₪. כדי לסדר, יבוטלו:',
        ['נוכה מהשכר · 29/10/2026 · 2200 ₪', 'הוחזר במזומן · 10/11/2026 · 2200 ₪'],
        'שום דבר לא נמחק: לצד כל רישום נכתב תיקון. התלוש של חשבון שכבר נסגר לא משתנה.',
        'כן, לסדר']);
    same('the destructive kind, «ביטול» holding the focus', [asked.danger, asked.focused], [true, 'askCancel']);
    const okBox = await box(page, '#askOk');
    check('its two answers are 44px both ways', okBox && okBox.w >= 44 && okBox.h >= 44, JSON.stringify(okBox));
    check('the question wrote nothing', (await disk(page)) === before);
    // Past the question's own hold (a double tap must not answer it), then «כן».
    await page.waitForTimeout(800);
    if (SHOTS) await page.screenshot({ path: join(SHOTS, '2-question.png') });
    await page.locator('#askOk').tap();
    await page.waitForFunction(() => document.getElementById('askModal').style.display !== 'flex' && !OVERPAID_FIX_BUSY);
    await page.waitForTimeout(200);
    same('over-settled by nothing now', await page.evaluate(() => overpaidAdvances(State.schedule, 'w_s').length), 0);
    same('two corrections written, the fixed reason on each', await page.evaluate(() => Object.values(State.schedule.ledger.advances)
        .filter(entry => entry.kind === 'reversed' && entry.targetId).map(entry => [entry.targetKind, entry.reason]).sort()),
    [['deducted', 'נרשם יותר מפעם אחת - סודר אוטומטית'], ['repaid', 'נרשם יותר מפעם אחת - סודר אוטומטית']]);
    const visible = await page.evaluate(() => document.getElementById('workerDaysModal').style.display);
    same('his account\'s dialog is still on the screen, drawn again', visible, 'flex');
    const after = plain(await page.textContent('#workerDaysBody'));
    check('the refusal is gone', after.indexOf(OVERPAID_SENTENCE) === -1, after.slice(0, 300));
    same('and so is the button', await page.locator('.overpaid-fix').count(), 0);
    check('the box offers the close instead', after.indexOf('כמה לקזז מהשכר הפעם?') !== -1);
    if (SHOTS) {
        await page.evaluate(() => {
            const content = document.querySelector('#workerDaysModal .modal-content');
            const target = document.querySelector('#workerDaysBody .period-closure');
            if (content && target) content.scrollTop = Math.max(0, target.offsetTop - 120);
        });
        await page.waitForTimeout(100);
        await page.screenshot({ path: join(SHOTS, '3-after.png') });
    }
    await page.evaluate(() => { closeWorkerDays(); showWorkerAdvances('w_s'); });
    const advances = plain(await page.textContent('#advancesView'));
    check('«מקדמות» no longer says he is over-settled', advances.indexOf('נרשמו החזרים עודפים') === -1
        && advances.indexOf('החשבון דורש בדיקה') === -1, advances.slice(0, 200));
    await page.context().close();
}

// ================================================================== «מקדמות», and «ביטול»
{
    suite('«מקדמות»: the over-settled card carries the button; «ביטול» writes nothing');
    const page = await phone(320, 568, 'dark');
    await page.evaluate(() => showWorkerAdvances('w_s'));
    const card = '#advancesView .advance-card .overpaid-fix';
    await page.locator(card).scrollIntoViewIfNeeded();
    const drawn = await box(page, card);
    given('the button is on the over-settled card', Boolean(drawn));
    check('44px both ways and 16px words at 320, dark', drawn.w >= 44 && drawn.h >= 44 && drawn.size >= 16, JSON.stringify(drawn));
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('no sideways scroll', wide <= 0, String(wide));
    const before = await disk(page);
    await page.locator(card).tap();
    await page.waitForFunction(() => document.getElementById('askModal').style.display === 'flex');
    // Past the question's hold: inside it no answer is taken, «ביטול» included.
    await page.waitForTimeout(800);
    await page.locator('#askCancel').tap();
    await page.waitForFunction(() => document.getElementById('askModal').style.display !== 'flex' && !OVERPAID_FIX_BUSY);
    check('«ביטול»: nothing written', (await disk(page)) === before);
    same('still over-settled, the button still there', [await page.evaluate(() => overpaidAdvances(State.schedule, 'w_s').length),
        await page.locator(card).count()], [1, 1]);
    await page.context().close();
}

check('no page error', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
await server.close();
report();
