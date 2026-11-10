// tests/archive.browser.mjs
//
// PHASE 5 through the screens, in Chromium, on a played cloud (tests/accounts.cloud.mjs):
//
//   the archive   the dry run a person reads, the move, and that no figure on any screen
//                 moved; no signal says so and changes nothing; a second phone and a phone
//                 installed afterwards read the closure whole
//   the detail    a phone that cannot fetch what the index names adopts nothing and says
//                 so, and adopts by itself when it can
//   «לבדיקה»      both bodies of a disagreement, which one is counted, and that the page
//                 writes nothing
//   a draft       what was typed into a closure survives a reload - and only against the
//                 account it was typed against
//   «נסגר»        on the weekly breakdown of «לפי עובד», and not with the gate shut
//
// The gate (`paybook`) is opened here through the test seam, before the scripts load. The
// last section opens the build as shipped.

import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import { makeBrowserCloud } from './accounts.cloud.mjs';
import { launch, openPhone, seed, settled, transact, showAccounts, bare, WEEK1, FORTNIGHT, TODAY } from './accounts.world.mjs';

const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
const served = await verifyServedAssets(server.url, root, expectedShaFor(root));
check('the origin served this commit, byte for byte', served.ok,
    `${served.checked} assets; ${(served.wrong || []).slice(0, 3).join(' | ')}`);
const browser = await launch(chromium);
const OPEN = { paybook: true };
const DRAFT = 'farkadPayDraft';

const T = {
    archive: 'ארכיון סגירות',
    lead: 'סגירה ששולמה במלואה עוברת מהרישום החי לארכיון בשרת, כדי שהרישום לא יתמלא. שום דבר לא נמחק: הסגירה נשארת במכשיר הזה ובהיסטוריה בדיוק כמו שהיא.',
    run: 'העבר לארכיון',
    offline: 'אין חיבור לשרת. ההעברה נעשית רק כשיש חיבור. שום דבר לא השתנה.',
    stopped: 'ההעברה נעצרה. מה שכבר הועבר נמצא בארכיון, ושום דבר לא אבד. אפשר לנסות שוב.',
    owed: 'עוד לא שולם במלואו',
    waiting: 'במכשיר הזה חסר הפירוט של סגירות שכבר בארכיון. עד שהוא יירד מהשרת המכשיר לא מתעדכן, ואי אפשר לרשום ממנו סגירה או תשלום. זה קורה מעצמו כשיש חיבור.',
    absent: 'הפירוט המלא של הסגירה הזאת עדיין לא במכשיר הזה. הסכומים נכונים; הפירוט יופיע כשיהיה חיבור.',
    look: 'מה לבדוק?',
    lookLead: 'הסכומים שבמסכים הם אלה שהשרת מחזיק. שום דבר לא נמחק. עד שזה ייפתר אי אפשר לרשום לעובד הזה סגירה או תשלום.',
    noFix: 'עדיין אין פתרון מהמסך הזה. הראה את המסך הזה למי שמתחזק את האפליקציה.',
    restored: 'מה שהוקלד לפני שהעמוד נטען מחדש שוחזר. בדוק את הסכומים לפני האישור.',
    closed: 'נסגר'
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
const screen = page => page.evaluate(() => ACC.screen);
const pay = net => (net.cloud.doc && net.cloud.doc.pay) || {};
const rowsOf = doc => Object.keys(((doc && doc.payIndex) || {}).rows || {}).sort();
const disk = page => page.evaluate(draft => JSON.stringify(Object.keys(localStorage).sort()
    .filter(key => key !== 'farkad:lastSeen' && key !== draft && !/heartbeat|claim|tick/i.test(key))
    .map(key => [key, localStorage.getItem(key)])), DRAFT);
const draftOf = page => page.evaluate(draft => JSON.parse(localStorage.getItem(draft) || 'null'), DRAFT);
// Every figure the list shows, as text - what a person would read off it.
const listed = page => page.evaluate(() => [...document.querySelectorAll('#advancesView .acc-row')]
    .map(card => card.textContent.replace(/[⁦-⁩‎‏]/g, '')).sort());
const money = page => page.evaluate(day => JSON.stringify({
    accounts: accountsList(State.schedule, day),
    history: closureHistory(State.schedule, {}),
    pay: Object.keys(State.schedule.pay).sort().map(id => [id, State.schedule.pay[id]]),
    ledger: Object.keys(State.schedule.ledger.advances).sort().map(id => [id, State.schedule.ledger.advances[id]])
}), TODAY);

async function geometry(page, label, filled) {
    const found = await page.evaluate(() => {
        const view = document.getElementById('advancesView');
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
    });
    same(`${label}: nothing a finger lands on is under 44px in either dimension`, found.small, []);
    same(`${label}: no field is under 16px`, found.tiny, []);
    check(`${label}: no sideways scroll`, found.sideways === false);
    same(`${label}: nothing is a fixed layer`, found.fixed, 0);
    same(`${label}: exactly ${filled} filled button`, found.filled, filled);
}

// The same phone after the app is closed and opened: the same storage, a fresh page.
async function reopen(phone) {
    await phone.page.reload({ waitUntil: 'load' });
    await phone.page.waitForTimeout(300);
    await phone.page.evaluate(day => { todayStr = () => day; }, TODAY);
    // The played cloud subscribes a page once; a reloaded page is the same page with a new
    // listener, so it is handed the document as a listener is on subscribing.
    await phone.page.waitForFunction(() => typeof window.__accSnapshot === 'function', null, { timeout: 15000 });
    await phone.page.evaluate(doc => window.__accSnapshot(doc), JSON.parse(JSON.stringify(net.cloud.doc)));
    await phone.page.waitForFunction(() => FarkadSync.adapter && FarkadSync._heardFromCloud === true, null, { timeout: 15000 });
}

const net = makeBrowserCloud({ payRules: true });
const a = await openPhone(browser, server.url, { cloud: net, flags: OPEN });
await seed(a.page, {});
const b = await openPhone(browser, server.url, { cloud: net, flags: OPEN });
await settled(b.page);
given('the crew is on the cloud', net.cloud.doc.workers.length === 5);
given('the book is opened', (await transact(a.page, 'planOpening', ['2026-10-02'])).ok);
given('Nasser\'s fortnight closes, paid in full', (await transact(a.page, 'planClosure',
    ['w_nasser', FORTNIGHT, { allocations: {}, paid: 3000, method: 'cash' }])).ok);
given('Ahmad\'s first week closes, paid in full', (await transact(a.page, 'planClosure',
    ['w_ahmad', WEEK1, { allocations: {}, paid: 1800, method: 'transfer' }], '2026-10-09')).ok);
const KHALED_ADV = await a.page.evaluate(() => {
    const held = currentAdvances(State.schedule);
    return Object.keys(held).filter(id => held[id].workerId === 'w_khaled').sort((x, y) => (held[x].date < held[y].date ? -1 : 1));
});
await a.page.waitForTimeout(200);

// =====================================================================================
{
    suite('a draft: what was typed into a closure survives a reload - against the same account only');

    await showAccounts(a.page);
    const before = await disk(a.page);
    const sent = net.cloud.writes.length;
    await tapText(a.page, 'סגירת חשבון ואיפוס', row('w_khaled'));
    same('the review is up, and OPENING it wrote nothing - no draft either',
        [await screen(a.page), await draftOf(a.page), await disk(a.page) === before], ['review', null, true]);
    same('the list offers no draft to continue', await a.page.evaluate(() => accDraftRead()), null);
    const first = a.page.locator(`${V} .acc-adv input`).nth(0);
    await type(a.page, first, '200');
    await tap(a.page, `${V} .acc-seg-btn[data-value="partial"]`);
    await type(a.page, a.page.locator(`${V} input[aria-label="כמה שולם?"]`), '1500');
    await tapText(a.page, '+ ניכוי נוסף');
    await type(a.page, a.page.locator(`${V} input[aria-label="סכום הניכוי"]`), '50');
    await type(a.page, a.page.locator(`${V} input[aria-label="סיבת הניכוי"]`), 'כלי עבודה');
    const typed = await draftOf(a.page);
    same('typing writes the draft: who, which period, the day, each field as typed',
        [typed.workerId, typed.from, typed.to, typed.day, typed.alloc[KHALED_ADV[0]], typed.paidMode, typed.paidText,
            typed.extras.map(extra => [extra.amount, extra.category, extra.reason])],
        ['w_khaled', FORTNIGHT.from, FORTNIGHT.to, TODAY, '200', 'partial', '1500', [['50', 'agreed', 'כלי עבודה']]]);
    same('and nothing else: not the record, not the cloud', [await disk(a.page) === before, net.cloud.writes.length], [true, sent]);
    check('the backup file does not carry it', !(await a.page.evaluate(() => backupFileText(State.schedule))).includes(DRAFT));

    await reopen(a);
    await showAccounts(a.page);
    same('AFTER A RELOAD the list offers to go on with it, by name',
        [await screen(a.page), await txt(a.page, `${V} .acc-draft-link`)], ['list', 'המשך סגירה שהתחלת: חאלד']);
    await tap(a.page, `${V} .acc-draft-link`);
    same('and the review opens with what was typed, and says it was put back',
        [await screen(a.page), await a.page.locator(`${V} .acc-adv input`).nth(0).inputValue(),
            await a.page.locator(`${V} input[aria-label="כמה שולם?"]`).inputValue(),
            await a.page.locator(`${V} input[aria-label="סכום הניכוי"]`).inputValue(),
            await a.page.locator(`${V} input[aria-label="סיבת הניכוי"]`).inputValue(), await txt(a.page, `${V} .acc-draft-restored`)],
        ['review', '200', '1500', '50', 'כלי עבודה', T.restored]);
    await geometry(a.page, 'a review with its draft put back', 1);
    same('still nothing of the record and nothing on the cloud', [await disk(a.page) === before, net.cloud.writes.length], [true, sent]);

    // The account changes under the draft: another advance is recorded for him.
    await a.page.evaluate(() => { accGo('list'); });
    given('a new advance is recorded for Khaled', await a.page.evaluate(() => State.commitMany(recordNewAdvance(State.schedule,
        'w_khaled', '2026-10-12', 100, 'בדיקה', '2026-10-12T09:00:00.000Z', syncDeviceId(), 'cash')) === true));
    await settled(a.page);
    await reopen(a);
    await showAccounts(a.page);
    await tapText(a.page, 'סגירת חשבון ואיפוס', row('w_khaled'));
    same('A DRAFT TYPED AGAINST ANOTHER ACCOUNT IS NOT PUT BACK: the page shows its own suggestion, says nothing, and the draft is gone',
        [await a.page.locator(`${V} .acc-adv input`).nth(0).inputValue(), await a.page.locator(`${V} .acc-draft-restored`).count(),
            await a.page.locator(`${V} .acc-extra`).count(), await draftOf(a.page)], ['500', 0, 0, null]);

    // And a draft from another day.
    await type(a.page, a.page.locator(`${V} .acc-adv input`).nth(0), '300');
    given('a draft is written again', (await draftOf(a.page)).alloc[KHALED_ADV[0]] === '300');
    await a.page.evaluate(draft => { const held = JSON.parse(localStorage.getItem(draft)); held.day = '2026-10-14';
        localStorage.setItem(draft, JSON.stringify(held)); accGo('list'); }, DRAFT);
    await a.page.waitForTimeout(120);
    same('a draft from another day is not offered on the list', await a.page.locator(`${V} .acc-draft-link`).isVisible(), false);
    await tapText(a.page, 'סגירת חשבון ואיפוס', row('w_khaled'));
    same('nor put back into the review', [await a.page.locator(`${V} .acc-adv input`).nth(0).inputValue(), await draftOf(a.page)], ['500', null]);

    // A closure that goes through takes its draft with it.
    await type(a.page, a.page.locator(`${V} .acc-adv input`).nth(0), '500');
    given('a draft exists before confirming', Boolean(await draftOf(a.page)));
    await tapText(a.page, 'אישור סגירה');
    await a.page.waitForFunction(() => ACC.screen === 'list', null, { timeout: 15000 });
    same('once the closure is on the server its draft is removed', [await draftOf(a.page), Boolean(pay(net).ps_w_khaled_20261002)], [null, true]);
    same('no page error on this phone so far', a.errors, []);
}

// =====================================================================================
{
    suite('the archive: read what would move, then move it - and no figure on any screen moves');

    await showAccounts(a.page);
    const before = { list: await listed(a.page), money: await money(a.page), size: JSON.stringify(net.cloud.doc).length,
        closed: [...net.cloud.closed.keys()].sort() };
    same('the list offers the archive and says how many closures may move', await txt(a.page, `${V} .acc-archive-link`), `${T.archive} (2)`);
    const sent = net.cloud.writes.length;
    const diskBefore = await disk(a.page);
    await tap(a.page, `${V} .acc-archive-link`);
    same('the page says in one paragraph what moving is, and that nothing is deleted',
        [await screen(a.page), await txt(a.page, `${V} .acc-archive-lead`)], ['archive', T.lead]);
    same('READY: the two closures paid in full, by name and period',
        [await txt(a.page, `${V} .acc-archive-ready h3`), await all(a.page, `${V} .acc-archive-ready .acc-archive-row .acc-name`)],
        ['מוכנות להעברה (2)', ['אחמד', 'נאסר']]);
    same('STAYING: Khaled\'s, with the reason - it is not paid in full',
        [await txt(a.page, `${V} .acc-archive-held h3`), await all(a.page, `${V} .acc-archive-held .acc-archive-row .acc-name`),
            await all(a.page, `${V} .acc-archive-held .acc-archive-why`)], ['נשארות ברישום (1)', ['חאלד'], [T.owed]]);
    const sizes = await all(a.page, `${V} .acc-archive-sizes .acc-num`);
    check('the size of the server\'s record now, out of the limit, and after', /^\d[\d,]* KB מתוך 1,024 KB$/.test(sizes[0]) && /^\d[\d,]* KB$/.test(sizes[1]), JSON.stringify(sizes));
    await geometry(a.page, 'the archive, before', 1);
    same('READING IT WROTE NOTHING: the disk and the cloud are what they were', [await disk(a.page) === diskBefore, net.cloud.writes.length], [true, sent]);

    // no signal
    a.phone.online = false;
    await tapText(a.page, T.run);
    await a.page.waitForFunction(() => document.querySelector('#advancesView .acc-message').textContent !== '', null, { timeout: 15000 });
    same('WITH NO SIGNAL it says so, in one sentence, and that nothing changed',
        await txt(a.page, `${V} .acc-message`), `${T.offline} ${T.stopped}`);
    same('and nothing did: no row on the server, both closures still ready', [rowsOf(net.cloud.doc), await txt(a.page, `${V} .acc-archive-ready h3`)],
        [[], 'מוכנות להעברה (2)']);
    a.phone.online = true;

    await tapText(a.page, T.run);
    await a.page.waitForFunction(() => Boolean(document.querySelector('#advancesView .acc-archive-moved')), null, { timeout: 20000 });
    same('THE MOVE: it says how many moved, nothing is left ready, and they are listed as archived',
        [await txt(a.page, `${V} .acc-archive-moved`), await a.page.locator(`${V} .acc-archive-ready`).count(),
            await txt(a.page, `${V} .acc-archive-archived h3`), await txt(a.page, `${V} .acc-message`),
            await a.page.locator(`${V} .acc-primary`).isVisible()],
        ['הועברו לארכיון: 2', 0, 'כבר בארכיון (2)', '', false]);
    await geometry(a.page, 'the archive, after', 0);
    same('the server\'s record names them and no longer holds their entries',
        [rowsOf(net.cloud.doc), Object.keys(pay(net)).filter(id => /nasser|ahmad/.test(id))],
        [['ps_w_ahmad_20261002', 'ps_w_nasser_20261002'], []]);
    check('it is smaller', JSON.stringify(net.cloud.doc).length < before.size, `${before.size} -> ${JSON.stringify(net.cloud.doc).length}`);
    same('no closed document was created or changed: both closures had theirs from birth', [...net.cloud.closed.keys()].sort(), before.closed);
    await tapText(a.page, 'חזרה');
    same('EVERY ROW OF THE LIST reads exactly as it did', await listed(a.page), before.list);
    same('and every fold of money on this phone is the same, byte for byte', await money(a.page) === before.money, true);
    same('the list still offers the archive - now with nothing to move', await txt(a.page, `${V} .acc-archive-link`), `${T.archive} (0)`);

    // the statement of an archived closure still has its detail
    await tapText(a.page, 'היסטוריית סגירות חשבון');
    await a.page.locator(`${V} .acc-row`, { hasText: 'נאסר' }).first().locator('button').first().click();
    await a.page.waitForTimeout(200);
    same('THE STATEMENT OF AN ARCHIVED CLOSURE has its day list, and does not say the detail is absent',
        [await screen(a.page), await a.page.locator(`${V} .acc-days .acc-day`).count() > 0,
            (await a.page.locator(V).textContent()).includes(T.absent)], ['statement', true, false]);
    await a.page.evaluate(() => accGo('list'));

    // the other phone
    await settled(b.page);
    await b.page.waitForFunction(() => Object.keys((State.schedule.payIndex || {}).rows || {}).length === 2, null, { timeout: 15000 });
    await showAccounts(b.page);
    same('THE PHONE THAT WATCHED holds the rows, every entry, and reads the same list',
        [await money(b.page) === before.money, await listed(b.page)], [true, before.list]);
    same('the second phone: no page error', b.errors, []);

    // a phone installed afterwards
    const c = await openPhone(browser, server.url, { cloud: net, flags: OPEN });
    await c.page.waitForFunction(() => State.schedule.workers.length === 5 && FarkadSync.status === 'synced', null, { timeout: 20000 });
    await showAccounts(c.page);
    same('A PHONE INSTALLED AFTER THE MOVE read the closed documents and shows the same list, from the same folds',
        [await money(c.page) === before.money, await listed(c.page), c.phone.calls.filter(call => call === 'readClosed').length],
        [true, before.list, 2]);
    same('the new phone: no page error, and nothing went off this origin', [c.errors, c.away], [[], []]);
    await c.context.close();
}

// =====================================================================================
{
    suite('a phone that lacks the detail adopts nothing, says so, and adopts by itself when it can');

    const context = await browser.newContext({ viewport: { width: 375, height: 667 }, colorScheme: 'light', hasTouch: true,
        isMobile: true, serviceWorkers: 'block' });
    const phone = await net.join(context);
    phone.online = false;                      // the snapshot arrives; nothing can be fetched
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(held => { window.FARKAD_FLAG_OVERRIDES = held; }, OPEN);
    await page.goto(`${server.url}/index.html`, { waitUntil: 'load' });
    await page.waitForTimeout(600);
    await page.evaluate(day => { todayStr = () => day; }, TODAY);
    await page.waitForFunction(() => FarkadSync.closedWaiting() !== null, null, { timeout: 15000 });
    await page.evaluate(() => { ADVANCE_WORKER = null; showView('advances'); });
    await page.waitForTimeout(150);
    same('IT ADOPTED NOTHING: no roster, no pay book, no row - not a record with a hole in it',
        await page.evaluate(() => [State.schedule.workers.length, Object.keys(State.schedule.pay || {}).length,
            Object.keys((State.schedule.payIndex || {}).rows || {}).length]), [0, 0, 0]);
    same('it does not say synced', await page.evaluate(() => FarkadSync.status === 'synced'), false);
    same('AND IT SAYS SO, on the accounts page, in these words', await txt(page, `${V} .acc-closed-waiting`), T.waiting);
    same('naming what it is waiting for', await page.evaluate(() => FarkadSync.closedWaiting().missing.slice().sort()),
        ['ps_w_ahmad_20261002', 'ps_w_nasser_20261002']);
    phone.online = true;
    await page.waitForFunction(() => State.schedule.workers.length === 5 && FarkadSync.closedWaiting() === null, null, { timeout: 30000 });
    await page.waitForTimeout(300);
    same('WHEN IT CAN FETCH it adopts by itself - nobody tapped anything - and the sentence is gone',
        [await page.locator(`${V} .acc-closed-waiting`).count(), await shown(page, row('w_khaled')),
            await page.evaluate(() => Object.keys(State.schedule.pay).filter(id => /nasser/.test(id)).length)], [0, true, 2]);
    same('that phone: no page error', errors, []);
    await context.close();
}

// =====================================================================================
{
    suite('«לבדיקה»: both sides of a disagreement, which one is counted, and nothing to tap that writes');

    // The state the union leaves when a file or another phone held a different body for
    // one id: the server's stands in `pay`, the other is kept beside it.
    await a.page.evaluate(() => {
        const other = Object.assign({}, State.schedule.pay.pp_ps_w_khaled_20261002 || State.schedule.pay.ps_w_khaled_20261002);
        other.by = 'd_other_phone';
        if (other.amount !== undefined) other.amount = 1234; else other.netDue = 1234;
        State.schedule.payConflicted = { [other.id]: [other] };
        State.persist();
        accGo('list');
    });
    await a.page.waitForTimeout(150);
    same('the man reads «לבדיקה», and his row now says what to do about it',
        [await txt(a.page, `${row('w_khaled')} .acc-chip`), await txt(a.page, `${row('w_khaled')} .acc-look`)], ['לבדיקה', T.look]);
    const sent = net.cloud.writes.length;
    const before = await disk(a.page);
    await tap(a.page, `${row('w_khaled')} .acc-look`);
    same('the page is his, and says first what is true: the server\'s figures are the ones shown, nothing was deleted',
        [await screen(a.page), await txt(a.page, `${V} .acc-title`), await txt(a.page, `${V} .acc-name`), await txt(a.page, `${V} .acc-look-body > .acc-note`)],
        ['look', 'לבדיקה', 'חאלד', T.lookLead]);
    same('BOTH BODIES are shown: the one that is counted, and the one kept beside it',
        [await txt(a.page, `${V} .acc-look-conflict h3`), await txt(a.page, `${V} .acc-look-counted .acc-hint`),
            await txt(a.page, `${V} .acc-look-beside .acc-hint`), await txt(a.page, `${V} .acc-look-beside .acc-num`)],
        ['שני טלפונים רשמו את אותו רישום בסכומים שונים', 'נספר - מה שהשרת מחזיק', 'נשמר בצד, לא נספר', '1234 ₪']);
    check('the two amounts differ on the page as they do on the record',
        await txt(a.page, `${V} .acc-look-counted .acc-num`) !== await txt(a.page, `${V} .acc-look-beside .acc-num`));
    same('and it says plainly that it cannot be settled from here', await txt(a.page, `${V} .acc-look-nofix`), T.noFix);
    same('the only button on the page is the way back', await all(a.page, `${V} button`), ['חזרה']);
    await geometry(a.page, 'what to look at', 0);
    same('LOOKING WROTE NOTHING', [await disk(a.page) === before, net.cloud.writes.length], [true, sent]);
    await a.page.evaluate(() => { delete State.schedule.payConflicted; State.persist(); accGo('list'); });
    await a.page.waitForTimeout(150);
    same('with the disagreement gone the row has no such button', await a.page.locator(`${row('w_khaled')} .acc-look`).count(), 0);
}

// =====================================================================================
{
    suite('«נסגר» on «לפי עובד»: a closed week is marked, an open one is not');

    await a.page.evaluate(() => { REPORT_RANGE.from = '2026-10-02'; REPORT_RANGE.to = '2026-10-15'; showView('reports'); });
    await a.page.waitForTimeout(200);
    await a.page.locator('#reportsView button', { hasText: 'לפי עובד' }).first().click();
    await a.page.waitForTimeout(200);
    const weeks = await a.page.evaluate(() => {
        const fold = document.querySelector('#reportsView .report-weekly-breakdown');
        if (!fold) return null;
        fold.open = true;
        return [...fold.querySelectorAll('.report-weekly-line:not(.report-weekly-total)')]
            .map(line => [line.querySelector('.report-weekly-when').textContent.replace(/[⁦-⁩‎‏]/g, ''),
                line.classList.contains('report-weekly-closed'), [...line.querySelectorAll('.report-weekly-mark')].map(node => node.textContent)]);
    });
    given('the weekly breakdown is drawn for the weekly man', Array.isArray(weeks) && weeks.length === 2, JSON.stringify(weeks));
    same('AHMAD\'S FIRST WEEK, closed, is marked «נסגר» - the owner\'s word; his second, still open, is not',
        weeks.map(week => [week[1], week[2]]), [[true, [T.closed]], [false, []]]);
    check('the mark is beside the week\'s dates and the dates are still there', /08.*נסגר$/.test(weeks[0][0]) && !/נסגר/.test(weeks[1][0]), weeks[0][0]);
    same('the figures of that line are what they were: the mark is a mark',
        await a.page.evaluate(() => [...document.querySelectorAll('#reportsView .report-weekly-breakdown .report-weekly-line')][0]
            .querySelector('.report-weekly-facts').textContent.includes('1800')), true);
    same('this phone, all the way through: no page error, nothing off this origin', [a.errors, a.away], [[], []]);
}

// =====================================================================================
{
    suite('with the gate shut none of it exists: no mark, no archive, no draft');

    const d = await openPhone(browser, server.url, { cloud: net });
    await d.page.waitForFunction(() => State.schedule.workers.length === 5 && FarkadSync.status === 'synced', null, { timeout: 20000 });
    same('the shipped build reads the same record whole - the closures that moved are in it',
        await d.page.evaluate(() => [FARKAD_FLAGS.paybook, Object.keys(closedPeriods(State.schedule, 'w_ahmad')).length,
            Object.keys((State.schedule.payIndex || {}).rows || {}).length]), [false, 1, 2]);
    await d.page.evaluate(() => { REPORT_RANGE.from = '2026-10-02'; REPORT_RANGE.to = '2026-10-15'; showView('reports'); });
    await d.page.waitForTimeout(200);
    await d.page.locator('#reportsView button', { hasText: 'לפי עובד' }).first().click();
    await d.page.waitForTimeout(200);
    same('its weekly breakdown has the two weeks and NO mark',
        await d.page.evaluate(() => [document.querySelectorAll('#reportsView .report-weekly-breakdown .report-weekly-line:not(.report-weekly-total)').length,
            document.querySelectorAll('.report-weekly-mark, .report-weekly-closed').length]), [2, 0]);
    await d.page.evaluate(() => showView('advances'));
    await d.page.waitForTimeout(150);
    same('its «מקדמות» tab has nothing of the accounts screens, and it moves nothing by itself',
        await d.page.evaluate(async () => [document.querySelectorAll('[class*="acc-"]').length, FarkadSync.archiveRefusal(),
            await FarkadSync.archiveDue('2026-12-01'), localStorage.getItem('farkadPayDraft')]), [0, 'gate', null, null]);
    same('the shipped phone: no page error', d.errors, []);
    await d.context.close();
}

await a.context.close();
await b.context.close();
await browser.close();
await server.close();
report();
