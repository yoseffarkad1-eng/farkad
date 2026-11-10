// tests/activation.browser.mjs
//
// PHASE 8 through the screens, in Chromium, on a played cloud (tests/accounts.cloud.mjs),
// ON THE BUILD AS IT SHIPS - no flag is opened through the seam anywhere in this file:
//
//   shut        on a record nobody activated the «מקדמות» tab is the advances list main
//               serves, and the settings sheet has one new row
//   the screen  what a person reads before turning the pay book on, read off the glass;
//               reading it writes nothing and asks the server nothing
//   refused     the server still runs the rules published today: one sentence, nothing
//               written; the confirmation declined: nothing at all
//   on          the confirmation, the opening on the server, the accounts home - and the
//               other phone's tab changes with nobody touching it
//   «יתרת זכות» the credit named on the accounts row and on the review page (decision 67)
//   the months  the dry run on its page, the move, and the refusal of an edit afterwards
//
// The model, the fake rules and the money are in tests/activation.test.mjs; the real rules
// and the real older builds in tests/activation.emulator.test.mjs.

import { chromium } from 'playwright';
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

const T = {
    rowOff: 'פנקס שכר (סגירת חשבון, תשלומים וארכיון): עוד לא הופעל ברישום הזה.',
    rowOn: 'פנקס השכר פעיל ברישום הזה. יום תחילת המעקב:',
    entry: 'פנקס שכר - הכנה והפעלה',
    lead: 'כאן רואים מה ישתנה לפני שמפעילים. המסך הזה לא רושם ולא משנה דבר עד שלוחצים על הכפתור שבסופו ומאשרים.',
    debtTitle: 'חוב מקדמות שיוצג אחרת',
    now: 'היום',
    after: 'אחרי ההפעלה',
    legacy: 'סגירות שנעשו לפני פנקס השכר יופיעו ברשימה «סגירות ישנות לבדיקה», ועונים עליהן מתי שנוח:',
    size: 'גודל הרישום בשרת היום',
    noReturn: 'אחרי ההפעלה אי אפשר לכבות את פנקס השכר מהאפליקציה. עד הסגירה או התשלום הראשון לא נרשם שום דבר כספי חדש.',
    run: 'הפעל את פנקס השכר',
    confirmTitle: 'להפעיל את פנקס השכר?',
    confirm: 'ההפעלה חלה על כל הטלפונים שמחוברים לרישום הזה, ואי אפשר לכבות אותה מהאפליקציה. יום תחילת המעקב:',
    yes: 'הפעל',
    rules: 'השרת עדיין עובד עם הכללים הישנים. פנקס השכר לא הופעל ודבר לא נרשם. מפרסמים את הכללים החדשים ב-Firebase ומנסים שוב.',
    done: 'פנקס השכר הופעל.',
    elsewhere: 'פנקס השכר כבר הופעל מטלפון אחר. לא נרשם דבר נוסף.',
    title: 'חשבונות עובדים',
    credit: 'יתרת זכות',
    debt: 'חוב מקדמות',
    review: 'לבדיקה',
    archive: 'ארכיון סגירות',
    monthsEntry: 'ארכיון חודשים',
    monthsLead: 'חודש שכל ימי העבודה שבו נסגרו ושולמו, ועברה חצי שנה, יכול לעבור מהרישום החי לארכיון בשרת. הימים נשארים במכשיר הזה ובכל דוח בדיוק כמו שהם. אחרי ההעברה אי אפשר לשנות יום באותו חודש.',
    monthsRun: 'העבר את החודשים המוכנים לארכיון',
    monthsConfirmTitle: 'להעביר חודשים לארכיון?',
    monthsYes: 'העבר',
    monthsMoved: 'חודשים שהועברו לארכיון',
    planTitle: 'העברת חודשים סגורים לארכיון - בדיקה בלבד, דבר לא הועבר',
    ready: 'מוכן להעברה',
    archived: 'בארכיון',
    refusedTitle: 'החודש הזה בארכיון'
};

const V = '#advancesView';
// ACTIVATION_SHOTS=<folder>: a picture of each new screen, for a person to look at. Asserts nothing.
const SHOTS = process.env.ACTIVATION_SHOTS || '';
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };
const txt = async (page, selector) => bare(await page.locator(selector).first().textContent().catch(() => ''));
const all = async (page, selector) => (await page.locator(selector).allTextContents()).map(bare);
const shown = async (page, selector) => page.locator(selector).first().isVisible().catch(() => false);
const tapText = async (page, text, within = V) => {
    await page.locator(`${within} button`, { hasText: text }).first().click();
    await page.waitForTimeout(150);
};
const row = id => `${V} .acc-row[data-worker="${id}"]`;
const screen = page => page.evaluate(() => (document.querySelector('#advancesView .acc-screen') ? ACC.screen : null));
const disk = page => page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()
    .filter(key => key !== 'farkad:lastSeen' && !/heartbeat|claim|tick/i.test(key))
    .map(key => [key, localStorage.getItem(key)])));
const on = page => page.evaluate(() => paybookOn(State.schedule));
const openSheet = async page => { await page.evaluate(() => openSettings()); await page.waitForTimeout(200); };
const shutSheet = async page => { await page.evaluate(() => closeSettings()); await page.waitForTimeout(120); };
const ask = async page => ({ up: await page.locator('#askModal').isVisible(), title: await txt(page, '#askTitle'),
    message: await txt(page, '#askMessage'), ok: await txt(page, '#askOk') });

async function geometry(page, label, filled, scope = '#advancesView') {
    const found = await page.evaluate(selector => {
        const view = document.querySelector(selector);
        const seen = node => node.checkVisibility() && node.getBoundingClientRect().width > 0;
        const targets = [...view.querySelectorAll('button, input, select, summary')].filter(seen);
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
            fixed: [...view.querySelectorAll('*')].filter(node => getComputedStyle(node).position === 'fixed').length
        };
    }, scope);
    same(`${label}: nothing a finger lands on is under 44px in either dimension`, found.small, []);
    same(`${label}: no field is under 16px`, found.tiny, []);
    check(`${label}: no sideways scroll`, found.sideways === false);
    same(`${label}: nothing is a fixed layer`, found.fixed, 0);
    if (filled !== null) same(`${label}: exactly ${filled} filled button`, found.filled, filled);
}

// THE WORLD: the crew of tests/accounts.world.mjs, two closures made the old way, and
// one thing more - Khaled took 500 on 2026-09-06, in a fortnight nobody closed.
const net = makeBrowserCloud({ payRules: true });
const a = await openPhone(browser, server.url, { cloud: net });
await seed(a.page, { legacy: true, advances: [] });
given('the earlier fortnight and its advance are recorded', await a.page.evaluate(() => {
    ['2026-09-06', '2026-09-07'].forEach(day => State.commit(assignPlace(State.schedule, day, 'w_khaled', 'actual', 'p_01', undefined, 0)));
    return State.commitMany(recordNewAdvance(State.schedule, 'w_khaled', '2026-09-06', 500, 'בדיקה', '2026-09-06T09:00:00.000Z', syncDeviceId(), 'cash')) === true;
}));
await settled(a.page);
const b = await openPhone(browser, server.url, { cloud: net, width: 375, height: 667, scheme: 'light' });
await settled(b.page);
given('both phones run the build as it ships', (await Promise.all([a, b].map(phone => phone.page.evaluate(() =>
    [FARKAD_FLAGS.paybook, FARKAD_FLAGS.months, FARKAD_FLAGS.cold, FARKAD_FLAGS.paybookActivation].join())))).join('|')
    === 'false,false,false,true|false,false,false,true');

// =====================================================================================
{
    suite('shut: the «מקדמות» tab is the advances list, and the settings sheet has one new row');

    await showAccounts(a.page);
    same('the tab holds no accounts screen', [await screen(a.page), await on(a.page)], [null, false]);
    check('it is the advances list main serves: a card a man', await a.page.locator(`${V} .advance-card, ${V} .advance-row, ${V} [data-worker]`).count() > 0
        || (await txt(a.page, V)).includes('חאלד'));
    await openSheet(a.page);
    same('THE ROW: one sentence and one button', [await txt(a.page, '#paybookActivationBox .hint'), await all(a.page, '#paybookActivationBox button')],
        [T.rowOff, [T.entry]]);
    check('it is on the glass with the sheet open - on the first card\'s tier, not behind a shut row', await shown(a.page, '#paybookActivationBox button'));
    same('the sheet has ONE such box, and index.html holds none', [await a.page.locator('#paybookActivationBox').count(),
        await a.page.evaluate(() => fetch('index.html').then(answer => answer.text()).then(text => text.includes('paybookActivationBox')))], [1, false]);
    await geometry(a.page, 'the row in the settings sheet', null, '#paybookActivationBox');
    await shot(a.page, '1-settings-row');
    await a.page.evaluate(() => renderSettings());
    same('a redraw of the sheet does not draw it twice', await a.page.locator('#paybookActivationBox button').count(), 1);
    await shutSheet(a.page);
}

// =====================================================================================
{
    suite('the screen a person reads first - off the glass; and reading it writes nothing');

    const before = await disk(a.page);
    const wrote = net.cloud.writes.length;
    await openSheet(a.page);
    await a.page.locator('#paybookActivationBox button').click();
    await a.page.waitForTimeout(250);
    same('the button closes the sheet and opens the screen on the «מקדמות» tab',
        [await a.page.locator('#settingsPanel').isVisible(), await screen(a.page), await a.page.evaluate(() => currentView)], [false, 'activate', 'advances']);
    same('its title and its first sentence', [await txt(a.page, `${V} .acc-title`), await txt(a.page, `${V} .acc-activation-lead`)], [T.entry, T.lead]);
    same('WHAT THE ONE-DEBT RULING MOVES: Khaled, 0 today and 500 afterwards - and nobody else',
        [await all(a.page, `${V} .acc-activation-man .acc-name`), await txt(a.page, `${V} .acc-activation-man [data-line="old"]`),
            await txt(a.page, `${V} .acc-activation-man [data-line="new"]`)], [['חאלד'], `${T.now}0 ₪`, `${T.after}500 ₪`]);
    same('the two closures made the old way are counted', await txt(a.page, `${V} [data-line="legacy"]`), `${T.legacy}2`);
    check('the size of the record is said in KB out of 1,024', /^גודל הרישום בשרת היום\d+ KB מתוך 1,024 KB$/.test(await txt(a.page, `${V} [data-line="size"]`)),
        await txt(a.page, `${V} [data-line="size"]`));
    same('the carry is approved on this record: the screen does not ask for it', await a.page.locator(`${V} .acc-activation-carry`).count(), 0);
    same('the day offered is the first day of the fortnight that holds today', await a.page.locator(`${V} input[type="date"]`).inputValue(), '2026-10-02');
    same('three things to check first, and that it cannot be turned off', [await a.page.locator(`${V} .acc-activation-before li`).count(),
        await txt(a.page, `${V} .acc-activation-noreturn`)], [3, T.noReturn]);
    await geometry(a.page, 'the activation screen at 440', 1);
    await shot(a.page, '2-activation-440-dark');
    await a.page.waitForTimeout(200);
    same('ALL OF THAT WROTE NOTHING and asked the server nothing', [await disk(a.page) === before, net.cloud.writes.length - wrote, net.cloud.probes.length], [true, 0, 0]);

    // The small phone, light scheme.
    await openSheet(b.page);
    await b.page.locator('#paybookActivationBox button').click();
    await b.page.waitForTimeout(250);
    same('on the small phone the same screen', [await screen(b.page), await all(b.page, `${V} .acc-activation-man .acc-name`)], ['activate', ['חאלד']]);
    await geometry(b.page, 'the activation screen at 375, light', 1);
    await shot(b.page, '3-activation-375-light');
    await b.page.locator(`${V} .acc-back`).click();
    await b.page.waitForTimeout(200);
    same('«חזרה» gives the tab back to the advances list', [await screen(b.page), await b.page.evaluate(() => ACC.activating)], [null, false]);
}

// =====================================================================================
{
    suite('refused: the confirmation declined; and the server still on the rules published today');

    const before = await disk(a.page);
    const wrote = net.cloud.writes.length;
    await tapText(a.page, T.run);
    const asked = await ask(a.page);
    same('THE APP\'S OWN CONFIRMATION, saying it cannot be turned off and from which day',
        [asked.up, asked.title, asked.message, asked.ok], [true, T.confirmTitle, `${T.confirm} 02/10/2026`, T.yes]);
    await a.page.locator('#askCancel').click();
    await a.page.waitForTimeout(300);
    same('DECLINED: nothing written, nothing asked of the server, the screen as it was',
        [await disk(a.page) === before, net.cloud.writes.length - wrote, net.cloud.probes.length, await screen(a.page), await on(a.page)], [true, 0, 0, 'activate', false]);

    net.cloud.oldRules = true;
    await tapText(a.page, T.run);
    await a.page.locator('#askOk').click();
    await a.page.waitForFunction(text => (document.querySelector('#advancesView .acc-message') || {}).textContent === text, T.rules, { timeout: 15000 });
    same('OLDER RULES ON THE SERVER: one sentence, and the button is there to press again',
        [await txt(a.page, `${V} .acc-message`), await txt(a.page, `${V} .acc-primary`), await a.page.locator(`${V} .acc-primary`).isDisabled()], [T.rules, T.run, false]);
    same('nothing was written anywhere; the server was asked once, by a read; the record is not on',
        [await disk(a.page) === before, net.cloud.writes.length - wrote, net.cloud.probes, net.cloud.closed.size, await on(a.page)], [true, 0, ['paybook-8'], 0, false]);
    net.cloud.oldRules = false;
}

// =====================================================================================
{
    suite('on: the opening on the server, the accounts home - and the other phone changes with nobody touching it');

    given('the other phone is on the «מקדמות» tab, on the advances list', (await showAccounts(b.page), await screen(b.page)) === null);
    await tapText(a.page, T.run);
    await a.page.locator('#askOk').click();
    await a.page.waitForFunction(() => paybookOn(State.schedule) === true, null, { timeout: 20000 });
    await a.page.waitForTimeout(400);
    same('THE OPENING IS ON THE SERVER, as one transaction with its closed document',
        [net.cloud.doc.pay.po_open.date, net.cloud.closed.has('po_open'), net.cloud.writes.filter(write => write.kind === 'transact' && !write.replayed).length],
        ['2026-10-02', true, 1]);
    same('this phone is on the accounts home, and says so once', [await screen(a.page), await txt(a.page, `${V} .acc-title`), await all(a.page, `${V} .acc-banner .acc-note-ok`)],
        ['list', T.title, [T.done]]);
    same('the list is the pay book\'s: Khaled owes 500 - the debt today\'s walk hid', await all(a.page, `${row('w_khaled')} .acc-sum-debt`), [`${T.debt}500 ₪`]);
    await b.page.waitForFunction(() => paybookOn(State.schedule) === true, null, { timeout: 20000 });
    await b.page.waitForTimeout(400);
    same('THE OTHER PHONE\'S TAB IS THE ACCOUNTS HOME NOW, with nobody touching it - and it reads the same debt',
        [await screen(b.page), await all(b.page, `${row('w_khaled')} .acc-sum-debt`)], ['list', [`${T.debt}500 ₪`]]);
    await geometry(b.page, 'the accounts home at 375 after activation', 1);
    await shot(b.page, '4-accounts-home-375');
    await openSheet(a.page);
    same('the row in the settings sheet now says it is on, since which day, and offers nothing',
        [await txt(a.page, '#paybookActivationBox .hint'), await a.page.locator('#paybookActivationBox button').count()], [`${T.rowOn} 02/10/2026`, 0]);
    await shutSheet(a.page);
    same('no page error on either phone', [a.errors, b.errors], [[], []]);
}

// =====================================================================================
{
    suite('«יתרת זכות»: the credit named on the accounts row and on the review page (decision 67)');

    // Nasser takes 1,000 on the 3rd and hands back 1,500 on the 4th: 500 is his.
    given('the advance and the repayment are recorded', await a.page.evaluate(() => {
        const made = recordNewAdvance(State.schedule, 'w_nasser', '2026-10-03', 1000, 'בדיקה', '2026-10-03T09:00:00.000Z', syncDeviceId(), 'cash');
        if (State.commitMany(made) !== true) return false;
        const held = currentAdvances(State.schedule);
        const id = Object.keys(held).filter(key => held[key].workerId === 'w_nasser')[0];
        const back = recordAdvanceRepaid(State.schedule, id, 1500, '2026-10-04', '', '2026-10-04T10:00:00.000Z', syncDeviceId(), 'cash');
        return Boolean(back) && State.commitMany(Array.isArray(back) ? back : [back]) === true;
    }));
    await settled(a.page);
    await showAccounts(a.page);
    await a.page.waitForTimeout(200);
    same('NASSER\'S ROW names the credit, shows no debt, and reads «לבדיקה»',
        [await all(a.page, `${row('w_nasser')} .acc-sum-credit`), await a.page.locator(`${row('w_nasser')} .acc-sum-debt`).count(), await txt(a.page, `${row('w_nasser')} .acc-chip`)],
        [[`${T.credit}500 ₪`], 0, T.review]);
    await shot(a.page, '5-credit-row');
    same('a man with no credit has no such figure', await a.page.locator(`${row('w_khaled')} .acc-sum-credit`).count(), 0);
    await tapText(a.page, 'סגירת חשבון ואיפוס', row('w_nasser'));
    same('THE REVIEW PAGE names it too, as its own line', [await screen(a.page), await txt(a.page, `${V} [data-line="credit"]`),
        await a.page.locator(`${V} [data-line="credit"]`).isVisible()], ['review', `${T.credit}500 ₪`, true]);
    await geometry(a.page, 'the review page with a credit line', 1);
    await shot(a.page, '6-review-credit');
    await a.page.locator(`${V} .acc-back`).click();
    await a.page.waitForTimeout(150);
    await tapText(a.page, 'סגירת חשבון ואיפוס', row('w_khaled'));
    same('and on a man with none the line is not shown', await a.page.locator(`${V} [data-line="credit"]`).isVisible(), false);
    await a.page.locator(`${V} .acc-back`).click();
    await a.page.waitForTimeout(150);
}

// =====================================================================================
{
    suite('the months: the dry run on its page, the move, and the refusal of an edit afterwards (decision 57)');

    // A record of its own: the crew's October and nothing else, turned on from the app's
    // own planner on a build as it ships, every account closed and paid.
    const net2 = makeBrowserCloud({ payRules: true });
    const c = await openPhone(browser, server.url, { cloud: net2 });
    await seed(c.page, { advances: [] });
    given('turned on', (await transact(c.page, 'planOpening', ['2026-10-02'])).ok && await on(c.page));
    for (const [worker, period, paid, day] of [['w_nasser', FORTNIGHT, 3000], ['w_khaled', FORTNIGHT, 4400], ['w_salim', FORTNIGHT, 3600],
        ['w_ahmad', WEEK1, 1800, '2026-10-09'], ['w_ahmad', WEEK2, 2000]]) {
        const answer = await transact(c.page, 'planClosure', [worker, period, { allocations: {}, paid, method: 'cash' }], day);
        given(`the account of ${worker} ${period.from} is closed and paid`, answer.ok, JSON.stringify(answer));
    }
    // Seven months after the closures - which a transaction stamps with the real clock.
    const LATER = (() => {
        const then = new Date();
        then.setDate(15);
        then.setMonth(then.getMonth() + 7);
        return `${then.getFullYear()}-${String(then.getMonth() + 1).padStart(2, '0')}-15`;
    })();
    await c.page.evaluate(day => { todayStr = () => day; }, LATER);
    const moved = await c.page.evaluate(day => FarkadSync.archiveClosed({ today: day }).then(answer => [answer.ok, answer.failed.length]), LATER);
    given('the settled closures have left the live document', moved[0] === true && moved[1] === 0, JSON.stringify(moved));
    await settled(c.page);
    const figures = () => c.page.evaluate(() => JSON.stringify([payrollReport(State.schedule, '2026-10-01', '2026-10-31'),
        invoiceReport(State.schedule, '2026-10-01', '2026-10-31'), Object.keys(State.schedule.days).sort()]));
    const whole = await figures();

    await showAccounts(c.page);
    await tapText(c.page, T.archive);
    same('«ארכיון סגירות» offers the months, one page further', [await screen(c.page), await c.page.locator(`${V} .acc-months-link`).isVisible(),
        await txt(c.page, `${V} .acc-months-link`)], ['archive', true, T.monthsEntry]);
    const before = await disk(c.page);
    const wrote = net2.cloud.writes.length;
    await tapText(c.page, T.monthsEntry);
    same('THE DRY RUN, in Phase 6\'s own words: the title, the sizes, and October ready to leave',
        [await screen(c.page), await txt(c.page, `${V} .acc-months-lead`), await txt(c.page, `${V} .acc-months-list .acc-h3`),
            await c.page.evaluate(() => [...document.querySelectorAll('#advancesView .acc-months-line[data-month]')].map(node => [node.dataset.month, node.dataset.state]))],
        ['months', T.monthsLead, T.planTitle, [['2026-10', 'ready']]]);
    check('the line for October says how many days and that it is ready', /2026-10 · 12 ימים · מוכן להעברה/.test(bare(await c.page.locator(`${V} .acc-months-line[data-month="2026-10"]`).textContent())),
        await txt(c.page, `${V} .acc-months-line[data-month="2026-10"]`));
    await geometry(c.page, 'the months page', 1);
    await shot(c.page, '7-months');
    same('reading the page wrote nothing', [await disk(c.page) === before, net2.cloud.writes.length - wrote], [true, 0]);

    await tapText(c.page, T.monthsRun);
    const asked = await ask(c.page);
    same('the move asks first, in the app\'s own dialog, naming the month and that its days can no longer be changed',
        [asked.up, asked.title, asked.ok, asked.message.includes('2026-10'), asked.message.includes('אי אפשר לשנות')], [true, T.monthsConfirmTitle, T.monthsYes, true, true]);
    await c.page.locator('#askOk').click();
    await c.page.waitForFunction(() => Boolean(((State.schedule.monthIndex || {}).rows || {})['2026-10']), null, { timeout: 20000 });
    await c.page.waitForTimeout(500);
    same('OCTOBER HAS LEFT THE SERVER\'S LIVE DOCUMENT for a document of its own',
        [Object.keys(net2.cloud.doc.monthIndex.rows), Object.keys(net2.cloud.doc.days).filter(date => date.startsWith('2026-10')), net2.cloud.months.size], [['2026-10'], [], 1]);
    same('the page says what moved, the line now reads «בארכיון», and the button is gone',
        [await txt(c.page, `${V} .acc-months-moved`), await c.page.locator(`${V} .acc-months-line[data-month="2026-10"]`).getAttribute('data-state'),
            await c.page.locator(`${V} .acc-primary`).isVisible()], [`${T.monthsMoved}: 2026-10`, 'archived', false]);
    same('and no figure on this phone moved: the pay sheet, the invoice, every day', await figures() === whole, true);

    // An edit of a day of that month, from the day screen's own writer: refused, in a dialog.
    const refused = await c.page.evaluate(() => State.commit(assignPlace(State.schedule, '2026-10-06', 'w_nasser', 'actual', 'p_02', undefined, 0)));
    await c.page.waitForTimeout(250);
    const said = await ask(c.page);
    same('AN EDIT OF A DAY OF THAT MONTH IS REFUSED, in the app\'s own dialog, with the archive\'s title', [refused, said.up, said.title], [false, true, T.refusedTitle]);
    check('- and its sentence says nothing was saved and what to do instead', said.message.includes('דבר לא נשמר') && said.message.includes('התאמה'), said.message);
    await c.page.locator('#askOk').click();
    await c.page.waitForTimeout(150);
    same('no page error', c.errors, []);
    await c.context.close();
}

await a.context.close();
await b.context.close();
await browser.close();
await server.close();
report();
