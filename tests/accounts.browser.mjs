// Worker accounts in a real Chromium, with the gate opened through the test seam (v176):
// the owner's examples END TO END through the screens, to the shekel on the glass.
//
//   PLAYWRIGHT_BROWSERS_PATH=... node tests/accounts.browser.mjs
//
// THE GATE IS SHUT IN EVERYTHING THIS REPOSITORY SHIPS. Every phone here but the last is
// built with `FARKAD_FLAG_OVERRIDES = { paybook: true }` set before any script loads -
// the one seam js/model/schema.js has, which tests/build.test.mjs bans from shipped files.
// The last phone is built as shipped, and its «מקדמות» tab must be today's.
//
// THE CLOUD IS PLAYED, and what plays it is tests/accounts.cloud.mjs: the harness's fake
// Firestore in this process, reached through the one module the app imports after boot.
// The page, the sync layer and the server-first door (js/sync/transact.js) are the real
// ones. The rules are not run here - tests/paybook.split.emulator.test.mjs does that.
//
// The arithmetic is tests/payroll.test.mjs's; the words are tests/accounts.test.mjs's.
// This is what only a page can answer: that the figure a person reads is the model's,
// that a refusal is a sentence beside the field that caused it, that a tap offline writes
// NOTHING, that two taps are one closure, that a second phone's closure is said plainly,
// and that nothing a finger lands on is under 44px or a number clipped at 200% text.
//
// ACCOUNTS_SHOTS=<directory> also writes the owner's screenshots (JPEG, synthetic names).

import { chromium } from 'playwright';
import { join } from 'node:path';
import { serve } from './serve.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import { makeBrowserCloud } from './accounts.cloud.mjs';
import { launch, openPhone, seed, settled, transact, showAccounts, bare, WEEK1, WEEK2, FORTNIGHT, TODAY } from './accounts.world.mjs';

const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
const served = await verifyServedAssets(server.url, root, expectedShaFor(root));
check('the origin served this commit, byte for byte', served.ok,
    `${served.checked} assets; ${(served.wrong || []).slice(0, 3).join(' | ')}`);
const browser = await launch(chromium);
const SHOTS = process.env.ACCOUNTS_SHOTS || '';
const OPEN = { paybook: true };

// The pinned words this file reads off the glass (all pinned in tests/accounts.test.mjs).
const T = {
    closeOne: 'סגירת חשבון ואיפוס', wageDue: 'יתרת שכר לתשלום', groupAll: 'סגירת חשבונות עובדים',
    groupBiweekly: 'סגירת חשבון דו-שבועי', history: 'היסטוריית סגירות חשבון', payment: 'תשלום בפועל',
    weekly: 'עובד שבועי', biweekly: 'עובד דו-שבועי', waiting: 'ממתין לסגירה', closed: 'נסגר', paid: 'שולם',
    partial: 'שולם חלקית', open: 'יתרה פתוחה', none: 'אין חשבון פתוח', debt: 'חוב מקדמות',
    missing: 'לא נבחר סכום למקדמה הזאת. הכנס סכום, גם 0 אפשרי.',
    overAdvance: 'אי אפשר לקזז יותר ממה שנשאר במקדמה.',
    overWage: 'הניכויים גבוהים מהשכר של התקופה.',
    early: 'אי אפשר לסגור לפני היום האחרון של התקופה.',
    overpay: 'אי אפשר לרשום תשלום גבוה מהסכום לתשלום.',
    extra: 'בניכוי נוסף חסר סכום או סיבה.',
    offline: 'אין חיבור לשרת. סגירת חשבון ותשלום נרשמים רק כשיש חיבור. לא נרשם דבר.',
    stale: 'החשבון השתנה בזמן האישור. לא נשמר דבר. בדוק את הסכומים ואשר שוב.',
    staleClosed: 'החשבון כבר נסגר בטלפון אחר. לא נרשם דבר נוסף.',
    unknown: 'הרישום נשלח, ועדיין לא ידוע אם השרת קיבל אותו. אל תרשום שוב - הבדיקה תיעשה מעצמה כשיהיה חיבור.',
    committed: 'הרישום שהיה בבדיקה התקבל בשרת.',
    carry: 'כדי לקזז רק חלק ממקדמה צריך לאשר פעם אחת שיתרת מקדמה עוברת לחשבון הבא.',
    reason: 'חובה לכתוב סיבה.',
    batchUnpaid: 'התשלום לא נרשם: כל החשבונות ייסגרו כ״עוד לא שולם״. אפשר לרשום תשלום אחר כך.',
    server: 'השרת לא קיבל את הרישום. לא נרשם דבר. נסה שוב.',
    absent: 'הפירוט המלא של הסגירה הזאת עדיין לא במכשיר הזה. הסכומים נכונים; הפירוט יופיע כשיהיה חיבור.',
    payOver: 'אי אפשר לרשום תשלום גבוה מהסכום לתשלום.'
};

const V = '#advancesView';
const txt = async (page, selector) => bare(await page.locator(selector).first().textContent().catch(() => ''));
const all = async (page, selector) => (await page.locator(selector).allTextContents()).map(bare);
const shown = async (page, selector) => page.locator(selector).first().isVisible().catch(() => false);
const tap = async (page, selector) => { await page.locator(selector).first().click(); await page.waitForTimeout(120); };
const tapText = async (page, text, within = V) => {
    await page.locator(`${within} button`, { hasText: text }).first().click();
    await page.waitForTimeout(120);
};
const type = async (page, locator, value) => { await locator.fill(value); await page.waitForTimeout(260); };
const row = id => `${V} .acc-row[data-worker="${id}"]`;
const line = key => `${V} .acc-line[data-line="${key}"] .acc-num`;
const advInput = (page, n) => page.locator(`${V} .acc-adv input`).nth(n);
const screen = page => page.evaluate(() => ACC.screen);
const writes = (net, kind) => net.cloud.writes.filter(write => write.kind === kind && !write.replayed);
const pay = net => (net.cloud.doc && net.cloud.doc.pay) || {};
// The disk, without the one key a review may write while somebody types: the draft
// (Phase 5), which is asked about by name wherever it matters.
const DRAFT = 'farkadPayDraft';
const disk = page => page.evaluate(draft => JSON.stringify(Object.keys(localStorage).sort()
    .filter(key => key !== 'farkad:lastSeen' && key !== draft && !/heartbeat|claim|tick/i.test(key))
    .map(key => [key, localStorage.getItem(key)])), DRAFT);
const draftOf = page => page.evaluate(draft => JSON.parse(localStorage.getItem(draft) || 'null'), DRAFT);
const shot = async (page, name) => {
    if (!SHOTS) return;
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: join(SHOTS, name), type: 'jpeg', quality: 80, fullPage: true });
};

// THE FLOORS, measured on whatever screen is up: 44px in both dimensions for everything a
// finger lands on, 16px for every field, no sideways scroll, and exactly `filled` buttons
// in the screen's one filled look.
async function geometry(page, label, filled) {
    const found = await page.evaluate(() => {
        const view = document.getElementById('advancesView');
        const seen = node => node.checkVisibility() && node.getBoundingClientRect().width > 0;
        // A checkbox is pressed through its LABEL, which is the 44px target; the box drawn
        // inside it is not one of its own.
        const targets = [...view.querySelectorAll('button, input, select, summary, label.acc-check')]
            .filter(node => !node.closest('label.acc-check') || node.matches('label.acc-check')).filter(seen);
        const primary = view.querySelector('.acc-primary');
        const fill = primary ? getComputedStyle(primary).backgroundColor : null;
        return {
            small: targets.filter(node => { const r = node.getBoundingClientRect(); return r.width < 44 || r.height < 44; })
                .map(node => `${node.tagName}.${node.className}:${Math.round(node.getBoundingClientRect().width)}x${Math.round(node.getBoundingClientRect().height)}`),
            tiny: [...view.querySelectorAll('input, select, textarea')].filter(seen)
                .filter(node => parseFloat(getComputedStyle(node).fontSize) < 16).map(node => node.className),
            sideways: document.documentElement.scrollWidth > innerWidth + 1 || view.scrollWidth > view.clientWidth + 1,
            filled: [...view.querySelectorAll('button')].filter(seen)
                .filter(node => fill && getComputedStyle(node).backgroundColor === fill).length,
            off: [...view.querySelectorAll('.acc-num')].filter(seen).filter(node => {
                const r = node.getBoundingClientRect();
                return r.left < -1 || r.right > innerWidth + 1;
            }).map(node => node.textContent)
        };
    });
    same(`${label}: nothing a finger lands on is under 44px in either dimension`, found.small, []);
    same(`${label}: no field is under 16px`, found.tiny, []);
    check(`${label}: no sideways scroll`, found.sideways === false);
    same(`${label}: no amount is off the glass`, found.off, []);
    if (filled !== undefined) same(`${label}: exactly ${filled} filled button`, found.filled, filled);
}

// 200% TEXT: the words double and the boxes must make room. A number that is cut off is a
// wrong number, so every amount on the screen must still be whole and on the glass.
async function doubled(page, label) {
    const found = await page.evaluate(() => {
        const view = document.getElementById('advancesView');
        const nodes = [...view.querySelectorAll('*')].map(node => [node, parseFloat(getComputedStyle(node).fontSize)]);
        nodes.forEach(([node, size]) => node.style.setProperty('font-size', `${size * 2}px`, 'important'));
        const clipped = [...view.querySelectorAll('.acc-num, .acc-name, .acc-chip')].filter(node => node.checkVisibility()).filter(node => {
            const r = node.getBoundingClientRect();
            let cut = node.scrollWidth > node.clientWidth + 1 && getComputedStyle(node).overflow !== 'visible';
            for (let up = node.parentElement; up && up !== view.parentElement; up = up.parentElement) {
                const style = getComputedStyle(up);
                const box = up.getBoundingClientRect();
                if (style.overflowX !== 'visible' && (r.left < box.left - 1 || r.right > box.right + 1)) cut = true;
            }
            return cut || r.left < -1 || r.right > innerWidth + 1;
        }).map(node => node.textContent);
        const sideways = document.documentElement.scrollWidth > innerWidth + 1;
        nodes.forEach(([node]) => node.style.removeProperty('font-size'));
        return { clipped, sideways };
    });
    same(`${label}, 200% text: no amount, name or status is clipped`, found.clipped, []);
    check(`${label}, 200% text: no sideways scroll`, found.sideways === false);
}

// =====================================================================================
// THE MAIN PHONE: 440x956, dark - first run, the list, one closure from start to finish
// =====================================================================================
const net = makeBrowserCloud();
const a = await openPhone(browser, server.url, { cloud: net, flags: OPEN });
await seed(a.page, { legacy: true });
const [K1, K2, K3] = await a.page.evaluate(() => {
    const given = currentAdvances(State.schedule);
    return Object.keys(given).filter(id => given[id].workerId === 'w_khaled')
        .sort((x, y) => (given[x].date < given[y].date ? -1 : 1));
});
given('the crew is on the cloud and Khaled has three advances', Boolean(K1 && K2 && K3) && net.cloud.doc.workers.length === 5);

{
    suite('first run: one sentence, one day, one button');
    const before = await disk(a.page);
    const sent = net.cloud.writes.length;
    await showAccounts(a.page);
    check('the «מקדמות» tab is the accounts home', await shown(a.page, `${V} .acc-screen`));
    same('it says in one sentence what activation means',
        await txt(a.page, `${V} .acc-note`), 'מהיום שתבחר, כל סגירת חשבון ותשלום נרשמים כאן. מה שנסגר לפני כן לא משתנה.');
    same('the day offered is the first day of the fortnight that holds today',
        await a.page.locator(`${V} input[type="date"]`).inputValue(), '2026-10-02');
    await geometry(a.page, 'activation', 1);
    same('opening the screen wrote nothing - not to the disk, not to the cloud',
        [await disk(a.page) === before, net.cloud.writes.length], [true, sent]);
    await tapText(a.page, 'התחל מעקב');
    await a.page.waitForFunction(() => Boolean(paybookFold(State.schedule).opening), null, { timeout: 15000 });
    await a.page.waitForTimeout(200);
    same('the opening is on the SERVER, as one transaction with its closed document',
        [pay(net).po_open && pay(net).po_open.date, net.cloud.closed.has('po_open'), writes(net, 'transact').length],
        ['2026-10-02', true, 1]);
    check('and the list is up', await shown(a.page, row('w_khaled')));
}

{
    suite('the unified list: one row a man, his open period only, two balances apart');
    // Ahmad's first week, closed and paid in full on the Friday after it - a fixture,
    // through the real door.
    given('week 1 of the weekly man closes, paid in full', (await transact(a.page, 'planClosure',
        ['w_ahmad', WEEK1, { allocations: {}, paid: 1800, method: 'cash' }], '2026-10-09')).ok);
    await a.page.waitForTimeout(200);
    same('AHMAD, weekly, 1,800 closed and paid: his row shows the open week - 2,000 - and nothing else',
        [await txt(a.page, `${row('w_ahmad')} .acc-row-wage`), await txt(a.page, `${row('w_ahmad')} .acc-cycle`),
            await txt(a.page, `${row('w_ahmad')} .acc-row-period`), await a.page.locator(`${row('w_ahmad')} .acc-sum`).count()],
        ['2000 ₪', T.weekly, '09/10 - 15/10', 0]);
    same('KHALED, biweekly, 2,100 + 2,300: 4,400',
        [await txt(a.page, `${row('w_khaled')} .acc-row-wage`), await txt(a.page, `${row('w_khaled')} .acc-cycle`),
            await txt(a.page, `${row('w_khaled')} .acc-row-period`), await txt(a.page, `${row('w_khaled')} .acc-chip`)],
        ['4400 ₪', T.biweekly, '02/10 - 15/10', T.waiting]);
    same('his advance debt is its own small figure, named, and no wage balance is shown beside it',
        [await all(a.page, `${row('w_khaled')} .acc-sum-debt`), await a.page.locator(`${row('w_khaled')} .acc-sum-due`).count()],
        [[`${T.debt}1200 ₪`], 0]);
    same('a man with nothing to close is one quiet line', [await txt(a.page, `${row('w_ziad')} .acc-chip`),
        await a.page.locator(`${row('w_ziad')} .acc-row-wage`).count(),
        await a.page.locator(`${row('w_ziad')}.acc-row-quiet`).count()], [T.none, 0, 1]);
    const ranks = await a.page.evaluate(() => [...document.querySelectorAll('#advancesView .acc-row')].map(node => Number(node.dataset.rank)));
    check('rows that need a person come first, the quiet ones last', ranks.every((rank, at) => at === 0 || ranks[at - 1] <= rank)
        && ranks[ranks.length - 1] === 6, JSON.stringify(ranks));
    same('the top of the screen: the two group actions in his words, and the history',
        (await all(a.page, `${V} .acc-actions > button, ${V} .acc-links > button:not([hidden])`)).slice(0, 3),
        [T.groupAll, T.groupBiweekly, T.history]);
    await geometry(a.page, 'list 440 dark', 1);
    await shot(a.page, 'list-440-dark.jpg');

    await tap(a.page, `${V} .acc-seg-btn[data-value="weekly"]`);
    same('the weekly filter leaves the weekly man', await a.page.evaluate(() =>
        [...document.querySelectorAll('#advancesView .acc-row')].map(node => node.dataset.worker)), ['w_ahmad']);
    await tap(a.page, `${V} .acc-seg-btn[data-value="biweekly"]`);
    check('the biweekly filter leaves everybody else', !(await shown(a.page, row('w_ahmad'))) && await shown(a.page, row('w_khaled')));
    await tap(a.page, `${V} .acc-seg-btn[data-value="all"]`);
    await type(a.page, a.page.locator(`${V} .acc-search`), 'חאל');
    same('searching a name leaves that man', await a.page.evaluate(() =>
        [...document.querySelectorAll('#advancesView .acc-row')].map(node => node.dataset.worker)), ['w_khaled']);
    await type(a.page, a.page.locator(`${V} .acc-search`), '');
    await doubled(a.page, 'list 440 dark');
}

{
    suite('the review page: every advance answered, the net computed by the model');
    const before = await disk(a.page);
    const sent = net.cloud.writes.length;
    await tap(a.page, `${row('w_khaled')} .acc-close`);
    same('«סגירת חשבון ואיפוס» opens his review', await screen(a.page), 'review');
    same('his period, his days and his wage', [await txt(a.page, `${V} .acc-sub .acc-row-period`),
        await txt(a.page, `${V} .acc-count:nth-child(1) strong`), await txt(a.page, line('gross'))],
        ['02/10/2026 - 15/10/2026', '12', '4400 ₪']);
    same('each open advance is a row with its date, what was given and what is left',
        await all(a.page, `${V} .acc-adv-info`),
        ['03/10/2026 · ניתנה 500 ₪ · נשאר 500 ₪', '06/10/2026 · ניתנה 400 ₪ · נשאר 400 ₪', '10/10/2026 · ניתנה 300 ₪ · נשאר 300 ₪']);
    same('prefilled with a suggestion: all of each, oldest first',
        [await advInput(a.page, 0).inputValue(), await advInput(a.page, 1).inputValue(), await advInput(a.page, 2).inputValue()],
        ['500', '400', '300']);
    same('opening the page wrote nothing', [await disk(a.page) === before, net.cloud.writes.length], [true, sent]);

    await type(a.page, advInput(a.page, 0), '300');
    await type(a.page, advInput(a.page, 1), '200');
    await type(a.page, advInput(a.page, 2), '200');
    same('he types 300 / 200 / 200: 700 deducted, each advance\'s remaining beside it, 500 carried',
        [await txt(a.page, line('advances')), await all(a.page, `${V} .acc-adv-after .acc-num`), await txt(a.page, line('debt')),
            await txt(a.page, line('net'))],
        ['-700 ₪', ['200 ₪', '200 ₪', '100 ₪'], '500 ₪', '3700 ₪']);
    await shot(a.page, 'review-440-dark.jpg');
    await geometry(a.page, 'review 440 dark', 1);

    // A BLANK IS A MISSING ANSWER, said on its own row.
    await type(a.page, advInput(a.page, 1), '');
    same('a blank field shows no "remaining" and, until he confirms, no complaint',
        [(await all(a.page, `${V} .acc-adv-after .acc-num`))[1], await txt(a.page, `${V} .acc-adv:nth-child(2) .acc-error`)], ['—', '']);
    await tapText(a.page, 'אישור סגירה');
    same('confirming with a blank advance refuses with its sentence ON THAT ROW, and on no other',
        await all(a.page, `${V} .acc-adv .acc-error`), ['', T.missing, '']);
    same('and nothing was written', [net.cloud.writes.length, await screen(a.page)], [sent, 'review']);
    await tap(a.page, `${V} .acc-adv:nth-child(2) .acc-adv-zero`);
    same('«0» is one tap, and it is an answer', [await advInput(a.page, 1).inputValue(),
        (await all(a.page, `${V} .acc-adv .acc-error`))[1], (await all(a.page, `${V} .acc-adv-after .acc-num`))[1]], ['0', '', '400 ₪']);

    // OVER-DEDUCTION: more than the advance has left.
    await type(a.page, advInput(a.page, 0), '600');
    same('more than is left on an advance is refused on its row, at once',
        (await all(a.page, `${V} .acc-adv .acc-error`))[0], T.overAdvance);
    await tapText(a.page, 'אישור סגירה');
    same('and confirming writes nothing', net.cloud.writes.length, sent);
    await type(a.page, advInput(a.page, 0), '300');
    await type(a.page, advInput(a.page, 1), '200');

    // AN EXTRA DEDUCTION: amount, category, reason.
    await tapText(a.page, '+ ניכוי נוסף');
    await type(a.page, a.page.locator(`${V} .acc-extra input`).nth(0), '700');
    await tapText(a.page, 'אישור סגירה');
    same('an extra deduction with no reason is refused beside the extras', await txt(a.page, `${V} .acc-extras + .acc-error`), T.extra);
    await type(a.page, a.page.locator(`${V} .acc-extra input`).nth(1), 'ציוד');
    same('with its reason: 4,400 - 700 advances - 700 = 3,000 net',
        [await txt(a.page, line('extras')), await txt(a.page, line('net')), await txt(a.page, `${V} .acc-extras + .acc-error`)],
        ['-700 ₪', '3000 ₪', '']);
    await type(a.page, a.page.locator(`${V} .acc-extra input`).nth(0), '5000');
    same('deductions above the wage are refused beside the net', await txt(a.page, `${V} .acc-result + .acc-error`), T.overWage);
    await type(a.page, a.page.locator(`${V} .acc-extra input`).nth(0), '700');

    // PAID: three one-tap choices.
    same('nothing is assumed about payment: «עוד לא שולם» is what stands until he says otherwise',
        [await a.page.locator(`${V} .acc-seg-btn[data-value="none"]`).getAttribute('aria-pressed'), await txt(a.page, line('paid')),
            await txt(a.page, line('balance'))], ['true', '0 ₪', '3000 ₪']);
    await tap(a.page, `${V} .acc-seg-btn[data-value="full"]`);
    same('«שולם הכול» is one tap: 3,000 paid, nothing left', [await txt(a.page, line('paid')), await txt(a.page, line('balance'))],
        ['3000 ₪', '0 ₪']);
    await tap(a.page, `${V} .acc-seg-btn[data-value="partial"]`);
    await type(a.page, a.page.locator(`${V} input[aria-label="כמה שולם?"]`), '5000');
    same('more paid than the net is refused beside the paid field', await txt(a.page, `${V} .acc-method + .acc-error`), T.overpay);
    await type(a.page, a.page.locator(`${V} input[aria-label="כמה שולם?"]`), '2000');
    same('net 3,000, paid 2,000: «יתרת שכר לתשלום» 1,000',
        [await txt(a.page, line('net')), await txt(a.page, line('paid')), await txt(a.page, line('balance')),
            await txt(a.page, `${V} .acc-line[data-line="balance"] .acc-line-label`)], ['3000 ₪', '2000 ₪', '1000 ₪', T.wageDue]);
    await shot(a.page, 'review-paid-440-dark.jpg');
    await geometry(a.page, 'review with a partial payment', 1);
    await doubled(a.page, 'review 440 dark');
    // MOVED AT PHASE 5, on purpose: «all of that typing wrote nothing» was true while a
    // draft lived in memory. It is now kept across a reload - so typing writes ONE key,
    // the draft, and still nothing of the record and nothing to the cloud.
    same('all of that typing wrote nothing of the record and nothing to the cloud', [await disk(a.page) === before, net.cloud.writes.length], [true, sent]);
    same('it wrote the draft, under its own key: who, which period, and what was typed',
        (draft => [draft.workerId, draft.from, draft.to, draft.paidMode, draft.paidText, draft.day])(await draftOf(a.page)),
        ['w_khaled', FORTNIGHT.from, FORTNIGHT.to, 'partial', '2000', TODAY]);
}

{
    suite('offline: refused in a sentence, and NOTHING is written or queued');
    const before = await disk(a.page);
    const sent = net.cloud.writes.length;
    const tried = net.cloud.attempts.length;
    await a.context.setOffline(true);
    await tapText(a.page, 'אישור סגירה');
    await a.page.waitForTimeout(300);
    same('the sentence', await txt(a.page, `${V} .acc-message`), T.offline);
    same('the record, the outbox and every other key on the disk are byte for byte what they were',
        await disk(a.page) === before, true);
    same('nothing reached the cloud and nothing was attempted', [net.cloud.writes.length, net.cloud.attempts.length], [sent, tried]);
    same('no intent is left behind, and nothing waits to be sent later',
        await a.page.evaluate(() => [FarkadSync.payIntent(), FarkadSync.pendingCount()]), [null, 0]);
    same('his entries are still on the page', [await advInput(a.page, 0).inputValue(), await advInput(a.page, 2).inputValue()], ['300', '200']);
    await shot(a.page, 'offline-440-dark.jpg');
    await a.context.setOffline(false);
    await a.page.waitForTimeout(400);
    same('and when the signal returns nothing is sent by itself', net.cloud.writes.length, sent);
}

{
    suite('confirm: one closure for two taps, and the row says what happened');
    const sent = writes(net, 'transact').length;
    await a.page.evaluate(() => {
        const button = [...document.querySelectorAll('#advancesView .acc-primary')][0];
        button.click();
        button.click();
    });
    await a.page.waitForFunction(() => ACC.screen === 'list', null, { timeout: 15000 });
    await a.page.waitForTimeout(250);
    same('two taps, ONE transaction and one closed document', [writes(net, 'transact').length - sent,
        net.cloud.closed.has('ps_w_khaled_20261002'), Object.keys(pay(net)).filter(id => /khaled/.test(id)).sort()],
        [1, true, ['pd_w_khaled_20261002_1', 'pp_ps_w_khaled_20261002', 'ps_w_khaled_20261002']]);
    same('the server holds his choices: 300 / 200 / 200, the extra 700, the net 3,000, 2,000 paid',
        (s => [s.advanceDeductions.map(one => one.amount), s.extraDeducted, s.netDue, pay(net).pp_ps_w_khaled_20261002.amount])(pay(net).ps_w_khaled_20261002),
        [[300, 200, 200], 700, 3000, 2000]);
    check('a calm line says so', /החשבון נסגר ונרשם\./.test(await txt(a.page, `${V} .acc-banner`)));
    same('his row: «שולם חלקית», «יתרת שכר לתשלום» 1,000 and the advance debt 500 - two figures, never one',
        [await txt(a.page, `${row('w_khaled')} .acc-chip`), await all(a.page, `${row('w_khaled')} .acc-sum-due`),
            await all(a.page, `${row('w_khaled')} .acc-sum-debt`), await a.page.locator(`${row('w_khaled')} .acc-row-wage`).count()],
        [T.partial, [`${T.wageDue}1000 ₪`], [`${T.debt}500 ₪`], 0]);
    check('no figure anywhere on his row is their difference', !/(^|\D)500 ₪.*1000 ₪.*(^|\D)(-500|1500) ₪/.test(await txt(a.page, row('w_khaled')))
        && (await all(a.page, `${row('w_khaled')} .acc-num`)).every(text => !['1500 ₪', '-500 ₪'].includes(text)));
    same('each advance is reduced once on this phone\'s record', await a.page.evaluate(ids =>
        ids.map(id => advanceOutstanding(State.schedule, id).left), [K1, K2, K3]), [200, 200, 100]);
}

{
    suite('a later payment against «יתרת שכר לתשלום»');
    await tap(a.page, `${row('w_khaled')} .acc-pay`);
    same('«תשלום בפועל» opens the form with what is owed, and the whole of it offered',
        [await screen(a.page), await txt(a.page, line('owed')), await a.page.locator(`${V} input[aria-label="סכום התשלום"]`).inputValue(),
            await a.page.locator(`${V} input[type="date"]`).inputValue()], ['pay', '1000 ₪', '1000', TODAY]);
    await geometry(a.page, 'payment 440 dark', 1);
    await type(a.page, a.page.locator(`${V} input[aria-label="סכום התשלום"]`), '1500');
    same('more than is owed is refused beside the amount', await txt(a.page, `${V} .acc-form .acc-error`), 'אי אפשר לרשום תשלום גבוה מהסכום לתשלום.');
    await type(a.page, a.page.locator(`${V} input[aria-label="סכום התשלום"]`), '600');
    same('600 of 1,000 leaves 400', await txt(a.page, line('after')), '400 ₪');
    const sent = writes(net, 'transact').length;
    await a.page.evaluate(() => { const b = document.querySelector('#advancesView .acc-primary'); b.click(); b.click(); });
    await a.page.waitForFunction(() => ACC.screen === 'list', null, { timeout: 15000 });
    await a.page.waitForTimeout(250);
    const later = Object.keys(pay(net)).filter(id => /^pp_/.test(id) && id !== 'pp_ps_w_khaled_20261002' && pay(net)[id].statementId === 'ps_w_khaled_20261002');
    same('two taps are ONE payment of 600', [writes(net, 'transact').length - sent, later.length, pay(net)[later[0]].amount, pay(net)[later[0]].method],
        [1, 1, 600, 'cash']);
    same('and his «יתרת שכר לתשלום» is 400', await all(a.page, `${row('w_khaled')} .acc-sum-due`), [`${T.wageDue}400 ₪`]);
}

{
    suite('closing before the last day is refused, in a sentence');
    await a.page.evaluate(() => { todayStr = () => '2026-10-14'; render(); });
    const sent = net.cloud.writes.length;
    await tap(a.page, `${row('w_salim')} .acc-close`);
    same('the page says why at the top', await all(a.page, `${V} .acc-page-reasons .acc-note`), [T.early]);
    await tapText(a.page, 'אישור סגירה');
    same('the button says it too, and writes nothing', [await txt(a.page, `${V} .acc-message`), net.cloud.writes.length], [T.early, sent]);
    await a.page.evaluate(day => { todayStr = () => day; }, TODAY);
    await tapText(a.page, 'חזרה');
}

// =====================================================================================
// A SECOND PHONE on the same cloud: the conflict, said plainly, with the fresh numbers
// =====================================================================================
const b = await openPhone(browser, server.url, { cloud: net, flags: OPEN, width: 375, height: 667, scheme: 'light' });
await b.page.waitForFunction(() => Boolean(paybookFold(State.schedule).opening) && State.schedule.workers.length === 5, null, { timeout: 15000 });
const SALIM = await a.page.evaluate(() => Object.keys(currentAdvances(State.schedule)).filter(id => currentAdvances(State.schedule)[id].workerId === 'w_salim')[0]);

{
    suite('another phone changed the account during the review');
    await tap(a.page, `${row('w_nasser')} .acc-close`);
    same('Nasser: 3,000, no advances', [await txt(a.page, line('gross')), await a.page.locator(`${V} .acc-adv`).count()], ['3000 ₪', 0]);
    a.phone.deliver = false;
    // The other phone hands him an advance while this page is open.
    await b.page.evaluate(() => State.commitMany(recordNewAdvance(State.schedule, 'w_nasser', '2026-10-06', 250, 'בדיקה',
        '2026-10-06T09:00:00.000Z', syncDeviceId(), 'cash')));
    await settled(b.page);
    const sent = writes(net, 'transact').length;
    await tap(a.page, `${V} .acc-seg-btn[data-value="full"]`);
    await tapText(a.page, 'אישור סגירה');
    await a.page.waitForFunction(() => document.querySelector('#advancesView .acc-message').textContent !== ''
        && !ACC.review.busy, null, { timeout: 15000 });
    same('the conflict sentence, and nothing written', [await txt(a.page, `${V} .acc-message`), writes(net, 'transact').length], [T.stale, sent]);
    same('the page is re-planned from the fresh record: the new advance is a row, unanswered, and says so',
        [await all(a.page, `${V} .acc-adv-info`), await advInput(a.page, 0).inputValue(), await all(a.page, `${V} .acc-adv .acc-error`)],
        [['06/10/2026 · ניתנה 250 ₪ · נשאר 250 ₪'], '', [T.missing]]);
    same('and what he had chosen is kept: «שולם הכול» is still pressed',
        await a.page.locator(`${V} .acc-seg-btn[data-value="full"]`).getAttribute('aria-pressed'), 'true');
    a.phone.deliver = true;
    await a.phone.flush();
    await tap(a.page, `${V} .acc-adv-all`);
    same('«הכול» is one tap: 250 off, 2,750 net, paid in full', [await advInput(a.page, 0).inputValue(), await txt(a.page, line('net')),
        await txt(a.page, line('paid'))], ['250', '2750 ₪', '2750 ₪']);
    await tapText(a.page, 'אישור סגירה');
    await a.page.waitForFunction(() => ACC.screen === 'list', null, { timeout: 15000 });
    same('and now it closes: «שולם»', await txt(a.page, `${row('w_nasser')} .acc-chip`), T.paid);
}

{
    suite('another phone closed the account first');
    await tap(a.page, `${row('w_salim')} .acc-close`);
    same('Salim: 3,600 of wage and 5,000 of advance - the suggestion stops at the wage',
        [await txt(a.page, line('gross')), await advInput(a.page, 0).inputValue(), await txt(a.page, line('net')),
            await txt(a.page, `${V} .acc-adv-after .acc-num`)], ['3600 ₪', '3600', '0 ₪', '1400 ₪']);
    a.phone.deliver = false;
    given('the second phone closes him first, with 1,000 off', (await transact(b.page, 'planClosure',
        ['w_salim', FORTNIGHT, { allocations: { [SALIM]: 1000 } }])).ok);
    const sent = writes(net, 'transact').length;
    await tapText(a.page, 'אישור סגירה');
    await a.page.waitForFunction(() => document.querySelector('#advancesView .acc-message').textContent !== ''
        && !ACC.review.busy, null, { timeout: 15000 });
    same('it is said plainly, and nothing more was written', [await txt(a.page, `${V} .acc-message`), writes(net, 'transact').length],
        [T.staleClosed, sent]);
    same('with the numbers it was closed on - the other phone\'s 1,000, not this page\'s 3,600',
        await all(a.page, `${V} .acc-fresh .acc-num`), ['3600 ₪', '-1000 ₪', '2600 ₪', '0 ₪', '2600 ₪']);
    same('one statement, one deduction: the advance is reduced once',
        [Object.keys(pay(net)).filter(id => /^ps_w_salim/.test(id)).length,
            await a.page.evaluate(id => advanceOutstanding(State.schedule, id).left, SALIM)], [1, 4000]);
    same('this phone is not stopped, holds no intent and queued nothing',
        await a.page.evaluate(() => [FarkadSync.payIntent(), FarkadSync.pendingCount(), Recovery.blocked()]), [null, 0, false]);
    a.phone.deliver = true;
    await a.phone.flush();
    await tapText(a.page, 'חזרה');
    same('his row on the first phone', [await txt(a.page, `${row('w_salim')} .acc-chip`), await all(a.page, `${row('w_salim')} .acc-sum-due`),
        await all(a.page, `${row('w_salim')} .acc-sum-debt`)], [T.closed, [`${T.wageDue}2600 ₪`], [`${T.debt}4000 ₪`]]);
    await showAccounts(b.page);
    await geometry(b.page, 'list 375 light', 1);
    await shot(b.page, 'list-375-light.jpg');
    await doubled(b.page, 'list 375 light');
}

{
    suite('sent, and the answer never came: said honestly, and it resolves by itself');
    await tap(a.page, `${row('w_ahmad')} .acc-close`);
    same('Ahmad\'s open week', [await txt(a.page, line('gross')), await txt(a.page, `${V} .acc-sub .acc-row-period`)],
        ['2000 ₪', '09/10/2026 - 15/10/2026']);
    const sent = writes(net, 'transact').length;
    // The write lands; the connection drops before the answer, and stays down.
    net.cloud.loseAnswer = () => { a.phone.online = false; net.cloud.loseAnswer = null; return true; };
    await tapText(a.page, 'אישור סגירה');
    await a.page.waitForFunction(() => document.querySelector('#advancesView .acc-message').textContent !== ''
        && !ACC.review.busy, null, { timeout: 20000 });
    same('"not known yet, do not repeat"', await txt(a.page, `${V} .acc-message`), T.unknown);
    await tapText(a.page, 'אישור סגירה');
    await a.page.waitForTimeout(400);
    same('a second press sends nothing', writes(net, 'transact').length - sent, 1);
    check('the same sentence stands at the top of every accounts screen', (await txt(a.page, `${V} .acc-banner`)).includes(T.unknown));
    a.phone.online = true;
    await a.page.waitForFunction(() => FarkadSync.payIntent() === null, null, { timeout: 20000 });
    await a.page.waitForTimeout(300);
    check('with the signal back it is settled by LOOKING, and says so', (await txt(a.page, `${V} .acc-banner`)).includes(T.committed));
    same('one closure, never a second', [writes(net, 'transact').length - sent, Object.keys(pay(net)).filter(id => /^ps_w_ahmad/.test(id)).length], [1, 2]);
    await tapText(a.page, 'הבנתי');
    check('«הבנתי» puts the line away', !(await txt(a.page, `${V} .acc-banner`)).includes(T.committed));
    await a.page.evaluate(() => accGo('list', { flash: '' }));
}

{
    suite('the history: every closure, searchable five ways, each with its whole statement');
    await tapText(a.page, T.history);
    same('«היסטוריית סגירות חשבון»', [await screen(a.page), await txt(a.page, `${V} .acc-title`)], ['history', T.history]);
    const rows = () => a.page.evaluate(() => [...document.querySelectorAll('#advancesView .acc-history-row')]
        .map(node => `${node.dataset.worker}:${node.dataset.from}`));
    const everything = await rows();
    same('seven closures: five through the pay book, two from before it', everything.length, 7);
    await geometry(a.page, 'history 440 dark', 0);
    await shot(a.page, 'history-440-dark.jpg');
    await type(a.page, a.page.locator(`${V} .acc-search`), 'אחמ');
    same('by WORKER', await rows(), ['w_ahmad:2026-10-09', 'w_ahmad:2026-10-02']);
    await type(a.page, a.page.locator(`${V} .acc-search`), '');
    await tap(a.page, `${V} .acc-seg-btn[data-value="weekly"]`);
    same('by CYCLE TYPE', await rows(), ['w_ahmad:2026-10-09', 'w_ahmad:2026-10-02']);
    await tap(a.page, `${V} .acc-seg-btn[data-value="all"]`);
    await a.page.locator(`${V} select`).selectOption('partial');
    await a.page.waitForTimeout(100);
    same('by PAYMENT STATUS: «שולם חלקית»', await rows(), ['w_khaled:2026-10-02']);
    await a.page.locator(`${V} select`).selectOption('unknown');
    await a.page.waitForTimeout(100);
    same('and the two older closures nobody recorded a payment for', await rows(), ['w_nasser:2026-09-18', 'w_salim:2026-09-18']);
    await a.page.locator(`${V} select`).selectOption('');
    await tap(a.page, `${V} .acc-date-filters > summary`);
    const setDate = async (key, value) => {
        await a.page.locator(`${V} input[data-key="${key}"]`).fill(value);
        await a.page.waitForTimeout(100);
    };
    await setDate('periodTo', '2026-10-01');
    same('by WORK PERIOD', await rows(), ['w_nasser:2026-09-18', 'w_salim:2026-09-18']);
    await setDate('periodTo', '');
    const realToday = await a.page.evaluate(() => toLocalDateStr(new Date()));
    await setDate('closedFrom', realToday);
    same('by CLOSURE DATE: the five closed today', (await rows()).length, 5);
    await setDate('closedFrom', '');
    await setDate('closedTo', '2026-10-05');
    same('and the two closed on 2 October', await rows(), ['w_nasser:2026-09-18', 'w_salim:2026-09-18']);
    await setDate('closedTo', '');

    await tap(a.page, `${V} .acc-history-row[data-worker="w_khaled"]`);
    same('Khaled\'s statement: which advance, how much came off it, how much remained',
        [await screen(a.page), await all(a.page, `${V} .acc-adv[data-advance] .acc-line[data-line="deducted"] .acc-num`),
            await all(a.page, `${V} .acc-adv[data-advance] .acc-line[data-line="left-then"] .acc-num`)],
        ['statement', ['300 ₪', '200 ₪', '200 ₪'], ['200 ₪', '200 ₪', '100 ₪']]);
    same('the wage, the deductions and the net as they were frozen',
        [await txt(a.page, line('gross')), await txt(a.page, line('advances')), await txt(a.page, line('extras')), await txt(a.page, line('net'))],
        ['4400 ₪', '-700 ₪', '-700 ₪', '3000 ₪']);
    same('both payments, and what is still owed', [await a.page.locator(`${V} .acc-adv[data-payment]`).count(),
        await txt(a.page, line('paid')), await txt(a.page, line('due'))], [2, '2600 ₪', '400 ₪']);
    await tap(a.page, `${V} .acc-days > summary`);
    same('the day list is the frozen payslip\'s: twelve days', await a.page.locator(`${V} .acc-days .acc-day`).count(), 12);
    await geometry(a.page, 'statement 440 dark', 1);
    await shot(a.page, 'statement-440-dark.jpg');
    await doubled(a.page, 'statement 440 dark');

    // THE DETAIL NOT ON THIS PHONE: said, and no day list in its place.
    await a.page.evaluate(() => { window.__detail = paybookDetail; paybookDetail = (s, c, id) => ({ state: 'absent', closedId: id, entries: null }); render(); });
    same('when the detail is not on this phone the page says so and shows no day list - the balances stay',
        [(await all(a.page, `${V} .acc-statement > .acc-note`)).includes(T.absent), await a.page.locator(`${V} .acc-days`).count(), await txt(a.page, line('due'))],
        [true, 0, '400 ₪']);
    await a.page.evaluate(() => { paybookDetail = window.__detail; render(); });
}

{
    suite('a correction is a new linked record, and needs a reason');
    const later = Object.keys(pay(net)).filter(id => /^pp_/.test(id) && pay(net)[id].amount === 600)[0];
    await tap(a.page, `${V} .acc-adv[data-payment="${later}"] .acc-void`);
    same('«ביטול רישום» opens its own page', [await screen(a.page), await txt(a.page, `${V} .acc-title`)], ['correct', 'ביטול רישום']);
    await geometry(a.page, 'correction 440 dark', 1);
    const sent = writes(net, 'transact').length;
    await tapText(a.page, 'רשום תיקון');
    same('without a reason: refused beside the reason, nothing written',
        [(await all(a.page, `${V} .acc-error`)).includes(T.reason), writes(net, 'transact').length], [true, sent]);
    await type(a.page, a.page.locator(`${V} input[aria-label="סיבת הביטול"]`), 'נרשם פעמיים');
    same('with one, the page shows what he will be owed again', await txt(a.page, line('after')), '1000 ₪');
    await tapText(a.page, 'רשום תיקון');
    await a.page.waitForFunction(() => ACC.screen === 'statement', null, { timeout: 15000 });
    await a.page.waitForTimeout(200);
    same('the void is a NEW entry naming the payment; the payment itself is untouched',
        [pay(net)[`pv_${later}`].targetId, pay(net)[`pv_${later}`].reason, pay(net)[later].amount], [later, 'נרשם פעמיים', 600]);
    check('the statement shows the correction under what it corrects', /בוטל 600 ₪ .* נרשם פעמיים/.test(await txt(a.page, `${V} .acc-adv[data-payment="${later}"]`)));
    same('and he is owed 1,000 again', await txt(a.page, line('due')), '1000 ₪');

    await tap(a.page, `${V} .acc-adjust`);
    await type(a.page, a.page.locator(`${V} input[aria-label="סכום התיקון"]`), '100');
    await tapText(a.page, 'רשום תיקון');
    same('an adjustment without a reason is refused the same way', (await all(a.page, `${V} .acc-error`)).includes(T.reason), true);
    await type(a.page, a.page.locator(`${V} input[aria-label="סיבת התיקון"]`), 'יום שנשכח');
    await tapText(a.page, 'רשום תיקון');
    await a.page.waitForFunction(() => ACC.screen === 'statement', null, { timeout: 15000 });
    await a.page.waitForTimeout(200);
    same('with one: a linked adjustment of +100, and 1,100 owed',
        [pay(net).pa_ps_w_khaled_20261002_1.delta, pay(net).pa_ps_w_khaled_20261002_1.statementId, await txt(a.page, line('due'))],
        [100, 'ps_w_khaled_20261002', '1100 ₪']);
    same('the statement itself was never rewritten', pay(net).ps_w_khaled_20261002.netDue, 3000);
    await tapText(a.page, T.payment);
    same('from the record: «תשלום בפועל» for what is still owed', [await screen(a.page), await txt(a.page, line('owed'))], ['pay', '1100 ₪']);
    await a.page.evaluate(() => accGo('list', { flash: '' }));
}

{
    suite('the older closures: each answered in one tap, or left, and never in the way');
    same('the list says how many are waiting, and is not blocked by them',
        [await txt(a.page, `${V} .acc-links > button:nth-child(2)`), await shown(a.page, row('w_khaled'))], ['סגירות ישנות לבדיקה (2)', true]);
    await tap(a.page, `${V} .acc-links > button:nth-child(2)`);
    same('two closures from before the pay book, each with its net', [await screen(a.page),
        await all(a.page, `${V} .acc-row .acc-line .acc-num`)], ['legacy', ['1000 ₪', '800 ₪']]);
    await geometry(a.page, 'older closures 440 dark', 0);
    const sent = net.cloud.writes.length;
    await tapText(a.page, 'לא ידוע', `${V} .acc-row[data-artifact="le_period_w_salim_20260918"]`);
    same('«לא ידוע» writes nothing and leaves it listed', [net.cloud.writes.length, await a.page.locator(`${V} .acc-row`).count()], [sent, 2]);
    await tapText(a.page, 'שולם', `${V} .acc-row[data-artifact="le_period_w_nasser_20260918"]`);
    await a.page.waitForFunction(() => document.querySelectorAll('#advancesView .acc-row').length === 1, null, { timeout: 15000 });
    same('«שולם» is one tap and one entry', pay(net).pl_le_period_w_nasser_20260918.state, 'paid');
    await tapText(a.page, 'נשאר חוב', `${V} .acc-row[data-artifact="le_period_w_salim_20260918"]`);
    await type(a.page, a.page.locator(`${V} input[aria-label="כמה נשאר לשלם?"]`), '300');
    await tapText(a.page, 'רשום', `${V} .acc-row[data-artifact="le_period_w_salim_20260918"] .acc-adv-line`);
    await a.page.waitForFunction(() => document.querySelectorAll('#advancesView .acc-row').length === 0, null, { timeout: 15000 });
    same('«נשאר חוב» with its sum: owed 300', [pay(net).pl_le_period_w_salim_20260918.state, pay(net).pl_le_period_w_salim_20260918.due], ['due', 300]);
    await tapText(a.page, 'חזרה');
    same('which joins his «יתרת שכר לתשלום»: 2,600 + 300', await all(a.page, `${row('w_salim')} .acc-sum-due`), [`${T.wageDue}2900 ₪`]);
}

{
    suite('one way to close: the old dialog and «קיזוז מהשכר» lead to the review page');
    await a.page.evaluate(() => { REPORT_RANGE.from = '2026-10-16'; REPORT_RANGE.to = '2026-10-29'; openWorkerSettlement('w_khaled'); });
    await a.page.waitForTimeout(150);
    same('the old settlement dialog routes to the review, and its modal is not up',
        [await screen(a.page), await a.page.evaluate(() => currentView), await a.page.evaluate(() => document.getElementById('workerDaysModal').style.display !== 'flex')],
        ['review', 'advances', true]);
    await tapText(a.page, 'חזרה');
    await tap(a.page, `${row('w_khaled')} .acc-advances`);
    check('«מקדמות» on a row is still the existing advances page of that man',
        (await txt(a.page, `${V} h2`)).includes('מקדמות') && !(await shown(a.page, `${V} .acc-screen`)));
    await tapText(a.page, 'קיזוז מהשכר');
    same('and its «קיזוז מהשכר» is the review page too', [await screen(a.page), await a.page.evaluate(() => currentView), await shown(a.page, `${V} .acc-screen-review`)],
        ['review', 'advances', true]);
    check('nothing here offers the old «סגור את החשבון»', await a.page.locator('button', { hasText: 'סגור את החשבון' }).count() === 0);
}
same('the first phone: no page error, nothing asked for off this machine', [a.errors, a.away], [[], []]);
same('the second phone: the same', [b.errors, b.away], [[], []]);
await a.context.close();
await b.context.close();

// =====================================================================================
// THE GROUP WALK, on its own crew: close one, skip one, come back; prepare three
// =====================================================================================
{
    const net2 = makeBrowserCloud();
    const c = await openPhone(browser, server.url, { cloud: net2, flags: OPEN });
    await seed(c.page);
    suite('the group walk: one by one, skip and return');
    given('tracking is opened', (await transact(c.page, 'planOpening', ['2026-10-02'], '2026-10-09')).ok);
    await showAccounts(c.page);
    const sent = () => writes(net2, 'transact').map(write => write.patch.closedId);
    const start = sent().length;
    same('Ahmad\'s first week, which nobody closed, is a quiet line of its own - not added to his 2,000',
        [await txt(c.page, `${row('w_ahmad')} .acc-row-wage`), await txt(c.page, `${row('w_ahmad')} .acc-pending`)],
        ['2000 ₪', `${T.waiting}02/10 - 08/101800 ₪`]);
    await tapText(c.page, T.groupBiweekly);
    same('«סגירת חשבון דו-שבועי» lists the biweekly men only', [await txt(c.page, `${V} .acc-title`),
        await c.page.evaluate(() => [...document.querySelectorAll('#advancesView .acc-group-row')].map(node => node.dataset.worker))],
        [T.groupBiweekly, ['w_khaled', 'w_nasser', 'w_salim']]);
    await tapText(c.page, 'חזרה');
    await tapText(c.page, T.groupAll);
    same('«סגירת חשבונות עובדים»: five accounts waiting, each with its status, and how far along',
        [await c.page.locator(`${V} .acc-group-row`).count(), [...new Set(await all(c.page, `${V} .acc-group-row .acc-chip`))],
            await txt(c.page, `${V} .acc-progress`)], [5, [T.waiting], '0 מתוך 5 · נשארו 5']);
    await geometry(c.page, 'group 440 dark', 1);
    await tapText(c.page, 'התחל');
    same('the walk opens the first: Ahmad\'s older week', [await screen(c.page), await txt(c.page, line('gross')),
        await txt(c.page, `${V} .acc-walk .acc-progress`)], ['review', '1800 ₪', '0 מתוך 5 · נשארו 5']);
    await tapText(c.page, 'אישור סגירה');
    await c.page.waitForFunction(() => ACC.screen === 'review' && ACC.review.from === '2026-10-09', null, { timeout: 15000 });
    await c.page.waitForTimeout(200);
    same('confirm moves straight to the next: his open week, one done',
        [await txt(c.page, line('gross')), await txt(c.page, `${V} .acc-walk .acc-progress`)], ['2000 ₪', '1 מתוך 5 · נשארו 4']);
    await tapText(c.page, 'דלג');
    same('«דלג» moves on without closing: Khaled is next', [await txt(c.page, `${V} .acc-sub .acc-name`), sent().length - start], ['חאלד', 1]);
    await tapText(c.page, 'חזרה');
    same('back on the list: one closed, one skipped, the rest waiting',
        await all(c.page, `${V} .acc-group-row .acc-chip`), [T.closed, 'דולג', T.waiting, T.waiting, T.waiting]);
    await shot(c.page, 'group-440-dark.jpg');

    suite('prepare several: a summary first, then one transaction each');
    await tapText(c.page, 'הכן סגירה לנבחרים');
    same('with nobody selected the button says what to do', await txt(c.page, `${V} .acc-message`), 'בחר עובדים קודם: סמן את התיבה ליד כל עובד.');
    for (const id of ['w_khaled', 'w_nasser', 'w_salim']) await c.page.locator(`${V} .acc-group-row[data-worker="${id}"] .acc-check`).click();
    const before = sent().length;
    await tapText(c.page, 'הכן סגירה לנבחרים');
    same('the summary: three men, pre-answered, and totals per column',
        [await screen(c.page), await c.page.evaluate(() => [...document.querySelectorAll('#advancesView .acc-table-card[data-worker]')]
            .map(node => [...node.querySelectorAll('.acc-table-row .acc-num')].map(cell => cell.textContent))),
        await all(c.page, `${V} .acc-table-total .acc-num`)],
        ['summary', [['4400 ₪', '1200 ₪', '3200 ₪', '0 ₪'], ['3000 ₪', '0 ₪', '3000 ₪', '0 ₪'], ['3600 ₪', '3600 ₪', '0 ₪', '0 ₪']],
            ['11000 ₪', '4800 ₪', '6200 ₪', '0 ₪']]);
    same('payment is NOT assumed from having been selected, and the page says so',
        [await txt(c.page, `${V} > .acc-screen > .acc-note`), await c.page.locator(`${V} .acc-seg-btn[data-value="none"]`).getAttribute('aria-pressed')],
        [T.batchUnpaid, 'true']);
    same('nothing is written by preparing', sent().length, before);
    await geometry(c.page, 'summary 440 dark', 1);
    await shot(c.page, 'summary-440-dark.jpg');
    await doubled(c.page, 'summary 440 dark');

    // The server refuses ONE of the three.
    net2.cloud.reject = (kind, payload) => {
        if (kind !== 'transact' || payload.closedId !== 'ps_w_nasser_20261002') return null;
        const error = new Error('refused by the suite');
        error.code = 'failed-precondition';
        return error;
    };
    await tapText(c.page, 'אישור סגירה לכל הרשימה');
    await c.page.waitForFunction(() => ACC.group.ran && !ACC.group.busy, null, { timeout: 30000 });
    await c.page.waitForTimeout(200);
    same('each man is his own transaction: two landed, one was refused, with the reason on his row',
        [sent().slice(before), await all(c.page, `${V} .acc-table-card[data-worker] .acc-chip`),
            await all(c.page, `${V} .acc-table-card[data-worker="w_nasser"] .acc-error`)],
        [['ps_w_khaled_20261002', 'ps_w_salim_20261002'], [T.closed, 'לא נסגר', T.closed], [T.server]]);
    await geometry(c.page, 'results 440 dark', 1);
    net2.cloud.reject = null;
    await tapText(c.page, 'נסה שוב לנכשלים');
    await c.page.waitForFunction(() => !ACC.group.busy && accItemState(ACC.group.items.filter(item => item.workerId === 'w_nasser')[0]) === 'done',
        null, { timeout: 30000 });
    await c.page.waitForTimeout(200);
    same('the retry sends the refused one and never repeats the ones done',
        [sent().slice(before), await all(c.page, `${V} .acc-table-card[data-worker] .acc-chip`)],
        [['ps_w_khaled_20261002', 'ps_w_salim_20261002', 'ps_w_nasser_20261002'], [T.closed, T.closed, T.closed]]);
    same('all three closed as «עוד לא שולם»: no payment entry exists',
        Object.keys(pay(net2)).filter(id => /^pp_/.test(id)).length, 0);
    await geometry(c.page, 'all done 440 dark', 1);
    await tapText(c.page, 'חזרה');
    same('the walk still remembers the one that was skipped', await txt(c.page, `${V} .acc-progress`), '4 מתוך 5 · נשארו 1');
    await tapText(c.page, 'המשך');
    same('«המשך» returns to it', [await screen(c.page), await txt(c.page, `${V} .acc-sub .acc-name`), await txt(c.page, line('gross'))],
        ['review', 'אחמד', '2000 ₪']);
    await tapText(c.page, 'אישור סגירה');
    await c.page.waitForFunction(() => ACC.screen === 'group', null, { timeout: 15000 });
    await c.page.waitForTimeout(200);
    same('and the walk is finished: five of five', [await txt(c.page, `${V} .acc-progress`), sent().length - start], ['5 מתוך 5 · נשארו 0', 5]);
    await tapText(c.page, 'המשך');
    same('a tap with nothing left to do says so', await txt(c.page, `${V} .acc-message`), 'כל החשבונות שאפשר לסגור נסגרו.');
    same('the group phone: no page error, nothing off this machine', [c.errors, c.away], [[], []]);
    await c.context.close();
}

// =====================================================================================
// THE CARRY APPROVAL, asked on the spot
// =====================================================================================
{
    suite('the carry approval: one sentence and its button, never a locked page');
    const net3 = makeBrowserCloud();
    const e = await openPhone(browser, server.url, { cloud: net3, flags: OPEN, width: 375, height: 667 });
    await seed(e.page, { approveCarry: false });
    await showAccounts(e.page);
    await geometry(e.page, 'activation 375 dark', 1);
    // On a record whose carry nobody approved, a debt that stays (the owner's ruling) is a
    // change to approve - so the very first financial act meets the question.
    same('the sentence and its button are there before anything is pressed, and nothing is disabled',
        [await txt(e.page, `${V} .acc-carry p`), await txt(e.page, `${V} .acc-carry button`),
            await e.page.locator(`${V} input:disabled, ${V} button:disabled`).count()], [T.carry, 'אשר את המעבר', 0]);
    const sent = writes(net3, 'transact').length;
    await tapText(e.page, 'התחל מעקב');
    await e.page.waitForTimeout(200);
    same('activating before approving writes nothing, and the sentence still stands',
        [writes(net3, 'transact').length, await shown(e.page, `${V} .acc-carry`)], [sent, true]);
    await tap(e.page, `${V} .acc-carry button`);
    same('one tap approves, and says so', [await txt(e.page, `${V} .acc-message`), await shown(e.page, `${V} .acc-carry`),
        await e.page.evaluate(() => Boolean(State.schedule.ledger.migrations && State.schedule.ledger.migrations.cm_carry))],
        ['המעבר אושר. אפשר להמשיך.', false, true]);
    await settled(e.page);
    await tapText(e.page, 'התחל מעקב');
    await e.page.waitForFunction(() => Boolean(paybookFold(State.schedule).opening), null, { timeout: 15000 });
    await e.page.waitForTimeout(200);
    same('and the activation goes through', [pay(net3).po_open.date, await shown(e.page, row('w_khaled'))], ['2026-10-02', true]);
    await tap(e.page, `${row('w_khaled')} .acc-close`);
    await geometry(e.page, 'review 375 dark', 1);
    await shot(e.page, 'review-375-dark.jpg');
    await doubled(e.page, 'review 375 dark');
    await type(e.page, advInput(e.page, 0), '200');
    check('a partial deduction on the approved record asks nothing more', !(await shown(e.page, `${V} .acc-carry`)));
    await tapText(e.page, 'אישור סגירה');
    await e.page.waitForFunction(() => ACC.screen === 'list', null, { timeout: 15000 });
    same('and the closure goes through: 200 off the first advance', pay(net3).ps_w_khaled_20261002.advanceDeductions[0].amount, 200);
    await tap(e.page, `${row('w_khaled')} .acc-pay`);
    await geometry(e.page, 'payment 375 dark', 1);
    await doubled(e.page, 'payment 375 dark');
    same('the small phone: no page error, nothing off this machine', [e.errors, e.away], [[], []]);
    await e.context.close();
}

// =====================================================================================
// THE FLOORS, on the other three screens of the matrix: 440 light, 375 dark, 375 light
// =====================================================================================
{
    const net4 = makeBrowserCloud();
    const first = await openPhone(browser, server.url, { cloud: net4, flags: OPEN, scheme: 'light' });
    await seed(first.page);
    suite('the floors: one crew, one account closed and owed, on three phones');
    given('tracking is opened', (await transact(first.page, 'planOpening', ['2026-10-02'], '2026-10-09')).ok);
    given('one account is closed and owed', (await transact(first.page, 'planClosure', ['w_nasser', FORTNIGHT, { allocations: {} }])).ok);
    const phones = [[first, '440 light']];
    for (const [width, height, scheme] of [[375, 667, 'dark'], [375, 667, 'light']]) {
        const next = await openPhone(browser, server.url, { cloud: net4, flags: OPEN, width, height, scheme });
        await next.page.waitForFunction(() => Boolean((State.schedule.pay || {}).ps_w_nasser_20261002), null, { timeout: 15000 });
        phones.push([next, `${width} ${scheme}`]);
    }
    same('every phone holds the same book', await Promise.all(phones.map(([phone]) =>
        phone.page.evaluate(() => Object.keys(State.schedule.pay).sort().join(' ')))),
        Array(3).fill('po_open ps_w_nasser_20261002'));
    for (const [phone, label] of phones) {
        suite(`the floors at ${label}: every screen`);
        const page = phone.page;
        await showAccounts(page);
        await geometry(page, `${label} list`, 1);
        await tap(page, `${row('w_khaled')} .acc-close`);
        await tapText(page, '+ ניכוי נוסף');
        await tap(page, `${V} .acc-seg-btn[data-value="partial"]`);
        await geometry(page, `${label} review, everything open`, 1);
        await doubled(page, `${label} review`);
        await tapText(page, 'חזרה');
        await tap(page, `${row('w_nasser')} .acc-pay`);
        await geometry(page, `${label} payment`, 1);
        await tapText(page, 'חזרה');
        await tapText(page, T.groupAll);
        await geometry(page, `${label} group`, 1);
        await doubled(page, `${label} group`);
        await page.locator(`${V} .acc-group-row[data-worker="w_khaled"] .acc-check`).click();
        await page.locator(`${V} .acc-group-row[data-worker="w_salim"] .acc-check`).click();
        await tapText(page, 'הכן סגירה לנבחרים');
        await geometry(page, `${label} summary`, 1);
        await doubled(page, `${label} summary`);
        await page.evaluate(() => accGo('history', { group: null }));
        await geometry(page, `${label} history`, 0);
        await doubled(page, `${label} history`);
        await tap(page, `${V} .acc-history-row`);
        await geometry(page, `${label} statement`, 1);
        await doubled(page, `${label} statement`);
        await tap(page, `${V} .acc-adjust`);
        await geometry(page, `${label} correction`, 1);
        same(`${label}: no page error, nothing off this machine`, [phone.errors, phone.away], [[], []]);
    }
    same('all of that looking wrote nothing more', writes(net4, 'transact').length, 2);
    for (const [phone] of phones) await phone.context.close();
}

// =====================================================================================
// THE GATE SHUT: the build as shipped
// =====================================================================================
{
    suite('with the gate shut the «מקדמות» tab is today\'s');
    const d = await openPhone(browser, server.url, {});
    await d.page.evaluate(() => {
        State.schedule.workers = [{ id: 'w_01', name: 'אחמד', active: true, dailyRate: 300 }, { id: 'w_02', name: 'חאלד', active: true, dailyRate: 350 }];
        State.save();
        showView('advances');
    });
    await d.page.waitForTimeout(150);
    same('the shipped flag is false', await d.page.evaluate(() => [FARKAD_FLAGS.paybook, accountsOpen(), accountsTakesTab()]), [false, false, false]);
    same('the tab is the advances page as it was: its title, its hint, its search, a card a man',
        [await all(d.page, `${V} > h2`), await all(d.page, `${V} > p.hint`), await d.page.locator(`${V} > input[type="search"]`).count(),
            await d.page.locator(`${V} .advance-worker-card`).count()],
        [['מקדמות'], ['בחר עובד כדי להוסיף מקדמה, לרשום החזר או לבדוק כמה נשאר.'], 1, 2]);
    same('nothing of the accounts screens exists anywhere in the page',
        await d.page.evaluate(() => [document.querySelectorAll('[class*="acc-"]').length,
            /סגירת חשבונות עובדים|היסטוריית סגירות חשבון|סגירת חשבון ואיפוס|יתרת שכר לתשלום/.test(document.body.textContent)]), [0, false]);
    await d.page.locator(`${V} .advance-worker-card`).first().click();
    await d.page.waitForTimeout(120);
    await d.page.locator(`${V} button`, { hasText: 'קיזוז מהשכר' }).click();
    await d.page.waitForTimeout(200);
    same('«קיזוז מהשכר» still opens the old dialog on the reports tab',
        [await d.page.evaluate(() => currentView), await d.page.evaluate(() => document.getElementById('workerDaysModal').style.display),
            await d.page.evaluate(() => document.querySelectorAll('[class*="acc-"]').length)], ['reports', 'flex', 0]);
    same('the tab bar has its five tabs and the same label', await d.page.evaluate(() =>
        [...document.querySelectorAll('.tabs .tab')].map(tab => tab.textContent.trim())).then(list => [list.length, list[3]]), [5, 'מקדמות']);
    same('the shipped phone: no page error', d.errors, []);
    await d.context.close();
}

await browser.close();
await server.close();
report();
