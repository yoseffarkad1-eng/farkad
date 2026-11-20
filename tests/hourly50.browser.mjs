// «שכר שעה נוספת 50 ₪», the undecided hourly stamp and the cycle form, in real Chromium.
//
//   node tests/hourly50.browser.mjs [--shots <dir>]
//
// The crew screen's button and its question, the new man's form at 50, Yosef's card in
// «דוחות» before and after (1000 «לא נכללו בסכום» -> 1200), the cycle question, «עכשיו:»,
// «מחיקת השינוי האחרון», and the floors on what is new: 44px, 16px, nothing off the side.
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {launchLocalBrowser} from './network-guard.mjs';
import {verifyServedAssets, expectedShaFor} from './treecheck.mjs';
import {suite, check, same, report} from './runner.mjs';
import {mkdirSync} from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const shotsAt = process.argv.indexOf('--shots');
const SHOTS = shotsAt > 0 ? process.argv[shotsAt + 1] : null;
if (SHOTS) mkdirSync(SHOTS, {recursive: true});

const server = await serve(root);
check('the suite runs the named tree', (await verifyServedAssets(server.url, root, expectedShaFor(root))).ok);
const browser = await launchLocalBrowser(chromium, {executablePath: process.env.CHROME_PATH});
const page = await browser.newPage({viewport: {width: 375, height: 812}, deviceScaleFactor: SHOTS ? 2 : 1});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const shot = async name => { if (SHOTS) await page.screenshot({path: `${SHOTS}/${name}.png`}); };

const seed = () => page.evaluate(() => {
    todayStr = () => '2026-11-20';
    State.schedule.workers = [
        {id: 'w_y', name: 'יוסף', active: true, dailyRate: 1000, hourlyRate: 0,
            payCycles: '2026-11-13=biweekly;2026-11-20=weekly'},
        {id: 'w_a', name: 'אחמד נסאר', active: true, dailyRate: 450, hourlyRate: 60},
        {id: 'w_m', name: 'מוחמד אבו ראס', active: true, dailyRate: 500}
    ];
    State.schedule.places = [{id: 'p_1', name: 'הרצליה - מגדל הים', active: true}];
    State.commitRoster();
    // Yosef's day as the owner recorded it: 1000 a day, 4 extra hours, stamped with no hourly rate.
    State.commit(assignPlace(State.schedule, '2026-11-16', 'w_y', 'actual', 'p_1', undefined, 4));
});

try {
    await page.goto(server.url);
    await seed();

    suite('the crew screen: the button, drawn while somebody has no rate');
    await page.evaluate(() => showView('roster'));
    const row = page.locator('#hourlyFillRow');
    await row.scrollIntoViewIfNeeded();
    check('the row is shown', await row.isVisible());
    same('its line', await row.locator('p').innerText(), 'ל-2 עובדים אין שכר לשעה נוספת.');
    const btn = row.getByRole('button', {name: 'שכר שעה נוספת 50 ₪ לכולם', exact: true});
    const box = await btn.boundingBox();
    check('the button is a finger tall and wide (44px)', box && box.height >= 44 && box.width >= 44, JSON.stringify(box));
    const size = await btn.evaluate(node => parseFloat(getComputedStyle(node).fontSize));
    check('its words are 16px or more', size >= 16, String(size));
    same('no sideways scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await shot('3-crew-button-375-light');

    suite('Yosef\'s card before');
    const card = async () => page.evaluate(() => {
        const rows = payrollReport(State.schedule, '2026-11-13', '2026-11-19');
        const y = rows.find(item => item.workerId === 'w_y');
        return [y.amount, Boolean(y.hoursUnpriced)];
    });
    same('1000, the hours unpriced', await card(), [1000, true]);
    await page.evaluate(() => { showView('reports'); });
    await page.waitForTimeout(400);
    await shot('1-yosef-before-375-light');

    suite('the question, and what it writes');
    await page.evaluate(() => showView('roster'));
    await row.getByRole('button', {name: 'שכר שעה נוספת 50 ₪ לכולם'}).click();
    await page.waitForSelector('#askModal', {state: 'visible'});
    same('askConfirm names how many', await page.locator('#askMessage').innerText(),
        'לקבוע 50 ₪ לשעה נוספת ל-2 עובדים שאין להם שכר שעה? מי שכבר יש לו שכר שעה נשאר כמו שהוא, ואפשר לשנות לכל עובד בפרטים שלו.');
    await shot('4-crew-question-375-light');
    await page.locator('#askOk').click();
    await page.waitForTimeout(200);
    await shot('5-crew-done-375-light');
    if (await page.locator('#askModal').isVisible()) await page.locator('#askOk').click();
    same('on the disk: יוסף 50, אחמד 60, מוחמד 50', await page.evaluate(() =>
        JSON.parse(localStorage.getItem('scheduleData:v2')).workers.map(w => [w.id, w.hourlyRate])),
        [['w_y', 50], ['w_a', 60], ['w_m', 50]]);
    check('and the row is gone', !(await row.isVisible()));

    suite('Yosef\'s card after');
    same('1000 + 4 × 50 = 1200, nothing unpriced', await card(), [1200, false]);
    await page.evaluate(() => { showView('reports'); });
    await page.waitForTimeout(400);
    await shot('2-yosef-after-375-light');

    suite('the new man\'s form opens at 50');
    await page.evaluate(() => { showView('roster'); showAddWorkerModal(); });
    same('«שכר לשעה נוספת» is 50', await page.locator('#workerFormHourly').inputValue(), '50');
    await page.evaluate(() => closeWorkerForm());

    suite('Yosef\'s cycle: «עכשיו:», the way back, and a real change asked first');
    await page.evaluate(() => editWorker('w_y'));
    await page.evaluate(() => { document.getElementById('workerFormMore').open = true; });
    const history = page.locator('#workerFormCycleHistory');
    await history.scrollIntoViewIfNeeded();
    check('«עכשיו:» before «רשום:»', (await history.innerText()).startsWith('עכשיו: כל שבוע. רשום:'));
    const undo = history.getByRole('button', {name: 'מחיקת השינוי האחרון (מ-20/11 שבועי)', exact: true});
    check('the way back is offered', await undo.isVisible());
    const ub = await undo.boundingBox();
    check('a finger tall', ub && ub.height >= 44, JSON.stringify(ub));
    await shot('6-form-now-and-undo-375-light');
    await undo.click();
    await page.waitForSelector('#askModal', {state: 'visible'});
    same('the undo question', await page.locator('#askMessage').innerText(),
        'יוסף: השינוי מ-20/11 לשבועי יימחק. מ-13/11 יחושב כל שבועיים. תקופות שכבר נסגרו לא משתנות.');
    await shot('7-undo-question-375-light');
    await page.locator('#askOk').click();
    await page.waitForTimeout(200);
    same('his history: 13/11 fortnightly only', await page.evaluate(() => State.worker('w_y').payCycles), '2026-11-13=biweekly');
    same('13/11 opens the whole fortnight', await page.evaluate(() => periodRangeFor(State.worker('w_y'), '2026-11-13')),
        {cycle: 'biweekly', from: '2026-11-13', to: '2026-11-26', transition: false});
    await page.evaluate(() => { closeWorkerForm(); showView('reports'); });
    await page.waitForTimeout(400);
    await shot('8-yosef-after-undo-375-light');

    await page.evaluate(() => editWorker('w_y'));
    await page.evaluate(() => { document.getElementById('workerFormMore').open = true; });
    await page.selectOption('#workerFormCycle', 'weekly');
    await page.fill('#workerFormCycleFrom', '2026-11-20');
    await page.evaluate(() => saveWorkerForm());
    await page.waitForSelector('#askModal', {state: 'visible'});
    same('a real change is asked in plain words', await page.locator('#askMessage').innerText(),
        'מ-20/11 יוסף יקבל כל שבוע. הימים 13/11–19/11 יחושבו כתקופה קצרה לחוד. תקופות שכבר נסגרו לא משתנות.');
    await shot('9-cycle-question-375-light');
    await page.locator('#askCancel').click();
    await page.waitForTimeout(200);
    check('«ביטול» keeps the form open', await page.locator('#workerFormModal').isVisible());
    same('and nothing written', await page.evaluate(() => State.worker('w_y').payCycles), '2026-11-13=biweekly');

    same('no page errors', errors, []);
} finally {
    await browser.close();
    await server.close();
}
report();
