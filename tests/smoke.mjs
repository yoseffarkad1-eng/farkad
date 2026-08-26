// Dev-only smoke tests. Nothing here ships to production and the app still has no
// build step.
//
//   npm ci
//   npx playwright install chromium      (or: npm run browsers)
//   npm run test:smoke
//
// It serves the app itself. It used to need a second terminal running python3 -m
// http.server, so `npm ci && npm run test:smoke` from a fresh clone did nothing but
// fail - and a service worker, which is half of what this file tests, does not register
// over file://.
//
// Override with SMOKE_URL to point at a server you are already running, CHROME_PATH for
// a browser binary, and PLAYWRIGHT_MODULE for a playwright installed somewhere else.

import { serve } from './serve.mjs';

// ESM ignores NODE_PATH, so allow an explicit path to a global playwright install.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

const EXEC = process.env.CHROME_PATH || undefined;
// Read from the app rather than hard-coded, so bumping a version does not mean editing
// a test - what is asserted is that the two version strings agree with each other.
const APP_VERSION_EXPECTED = (await import('node:fs'))
  .readFileSync(new URL('../js/app.js', import.meta.url), 'utf8')
  .match(/APP_VERSION = '(v\d+)'/)[1];

const server = process.env.SMOKE_URL
  ? { url: process.env.SMOKE_URL, close: () => {} }
  : await serve(new URL('..', import.meta.url).pathname);
const BASE = server.url;

const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? '  PASS' : '**FAIL**'}  ${name}${detail ? '  — ' + detail : ''}`);
};

async function newPage(opts = {}) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  return page;
}

async function open(opts = {}) {
  const page = await newPage(opts);
  await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  return page;
}

// Two workers, two sites, nothing assigned yet.
async function seedRoster(page) {
  await page.evaluate(() => {
    State.schedule.workers = [
      { id: 'w_01', name: 'דוד', idNumber: '111', phone: '050-1', active: true,
        dailyRate: 400, hourlyRate: 50 },
      { id: 'w_02', name: 'שרה', idNumber: '222', phone: '050-2', active: true,
        dailyRate: 350, hourlyRate: 0 },
      // no rate on purpose: the reports have to say "unknown", not "nothing owed"
      { id: 'w_03', name: 'עלי', idNumber: '', phone: '', active: true }
    ];
    State.schedule.places = [
      { id: 'p_01', name: 'הרצליה', active: true },
      { id: 'p_02', name: 'תל אביב', active: true }
    ];
    State.date = '2026-08-12';
    State.save();
    render();
  });
  await page.waitForTimeout(200);
}

// ---------------------------------------------------------------- boot
{
  const page = await open();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  check('the app boots with the day view showing',
    (await page.evaluate(() => document.getElementById('dayView').children.length > 0)));
  check('all four views exist',
    (await page.evaluate(() => ['day', 'week', 'roster', 'reports']
      .every(v => document.getElementById(v + 'View') !== null))));
  check('the day view is the only one visible at boot',
    (await page.evaluate(() => ['week', 'roster', 'reports']
      .every(v => document.getElementById(v + 'View').style.display === 'none'))));
  check('with no data the app welcomes rather than rendering an empty grid',
    (await page.textContent('#dayView')).includes('ברוך הבא'));

  // The ☰ must be findable on the very first visit - it lives in the header, which
  // renders with or without data, not on the progress bar that needs workers to exist.
  check('the ☰ is on screen even before any data',
    await page.locator('.day-nav .drawer-btn').isVisible());
  await page.locator('.day-nav .drawer-btn').click();
  await page.waitForTimeout(300);
  check('and it opens the days drawer on an empty app too',
    await page.locator('.day-drawer.drawer-open').isVisible());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);

  check('no page errors on boot', errors.length === 0, errors.join('; '));
  await page.context().close();
}

// ---------------------------------------------------------------- day screen: by site
// The by-site view is the one for reviewing or fixing a single site; it is no longer the
// default, so these switch into it explicitly.
{
  const page = await open();
  await seedRoster(page);
  await page.evaluate(() => setDayMode('sites'));
  await page.waitForTimeout(200);

  check('every site gets a card', (await page.locator('.site-card').count()) === 2);
  check('everyone unrecorded is counted',
    (await page.textContent('.progress-line')).includes('0 מתוך 3'));

  // assign through the site picker, which stays open for a run of names
  await page.locator('.site-card').first().getByText('+ הוסף עובד').click();
  await page.waitForTimeout(200);
  check('the picker lists every active worker',
    (await page.locator('#workerPickerList .picker-row').count()) === 3);

  await page.locator('#workerPickerList .picker-row').filter({ hasText: 'דוד' }).getByRole('button').click();
  await page.waitForTimeout(200);
  await page.locator('#workerPickerList .picker-row').filter({ hasText: 'שרה' }).getByRole('button').click();
  await page.waitForTimeout(200);
  check('the picker stays open between picks',
    await page.isVisible('#workerPickerModal'));
  check('a picked worker is marked as already here',
    (await page.textContent('#workerPickerList')).includes('✓ נמצא'));

  // The list used to re-sort on every tap, so a name jumped the moment it was touched -
  // a mis-tap removed someone AND threw them to the top, leaving no way to see who moved.
  const orderBefore = await page.evaluate(() =>
    [...document.querySelectorAll('#workerPickerList .picker-name')].map(n => n.firstChild.textContent));
  await page.locator('#workerPickerList .picker-row').filter({ hasText: 'שרה' }).getByRole('button').click();
  await page.waitForTimeout(200);
  const orderAfter = await page.evaluate(() =>
    [...document.querySelectorAll('#workerPickerList .picker-name')].map(n => n.firstChild.textContent));
  check('removing someone by mistake leaves them exactly where they were',
    orderBefore.join() === orderAfter.join(), JSON.stringify({ orderBefore, orderAfter }));
  check('and the mistake is undoable from the header',
    !(await page.locator('#undoBtn').isDisabled()));

  // put שרה back, in place, with the same button
  await page.locator('#workerPickerList .picker-row').filter({ hasText: 'שרה' }).getByRole('button').click();
  await page.waitForTimeout(200);
  check('tapping the same row again puts them back',
    (await page.textContent('#workerPickerList')).includes('✓ נמצא'));
  check('the title says how many are recorded here',
    (await page.textContent('#workerPickerTitle')).includes('רשומים'));

  await page.locator('#workerPickerModal').getByRole('button', { name: 'סגור' }).click();
  await page.waitForTimeout(200);

  check('the site card counts its workers',
    (await page.locator('.site-card').first().locator('.site-count').textContent()) === '2');
  check('the count rises as people are recorded',
    (await page.textContent('.progress-line')).includes('2 מתוך 3'));

  // the whole point of the model: a second site ADDS, it does not replace
  await page.locator('.site-card').nth(1).getByText('+ הוסף עובד').click();
  await page.waitForTimeout(200);
  await page.locator('#workerPickerList .picker-row').filter({ hasText: 'דוד' }).getByRole('button').click();
  await page.waitForTimeout(200);
  await page.locator('#workerPickerModal').getByRole('button', { name: 'סגור' }).click();
  await page.waitForTimeout(200);

  const davidEntries = await page.evaluate(() =>
    entriesFor(State.schedule, State.date, 'w_01', 'actual').map(e => e.placeId));
  check('a second site is added, not substituted',
    JSON.stringify(davidEntries) === '["p_01","p_02"]', JSON.stringify(davidEntries));
  check('a two-site worker is badged on both cards',
    (await page.locator('.badge-split').count()) === 2);
  await page.context().close();
}

// ---------------------------------------------------------------- rates
{
  const page = await open();
  await seedRoster(page);
  await page.evaluate(() => {
    setDayMode('sites');
    assignPlace(State.schedule, State.date, 'w_01', 'actual', 'p_01', RATE_NORMAL);
    assignPlace(State.schedule, State.date, 'w_01', 'actual', 'p_02', RATE_NORMAL);
    State.save(); render();
  });
  await page.waitForTimeout(200);

  // "on Tel Aviv only" - the rate belongs to the site, not to the person's whole day
  await page.locator('.site-card').nth(1).locator('.rate-select').selectOption('double');
  await page.waitForTimeout(300);

  const rates = await page.evaluate(() =>
    entriesFor(State.schedule, State.date, 'w_01', 'actual')
      .map(e => `${e.placeId}:${e.rate || 'normal'}`));
  check('a rate set on one site leaves the other alone',
    JSON.stringify(rates) === '["p_01:normal","p_02:double"]', JSON.stringify(rates));

  await page.locator('.site-card').first().locator('.rate-select').selectOption('extra');
  await page.waitForTimeout(300);
  check('choosing extra hours reveals the hours field',
    (await page.locator('.rate-hours').count()) === 1);

  await page.locator('.rate-hours').fill('3');
  await page.locator('.rate-hours').dispatchEvent('change');
  await page.waitForTimeout(300);
  check('the hours number is stored on that assignment',
    (await page.evaluate(() => entriesFor(State.schedule, State.date, 'w_01', 'actual')
      .find(e => e.placeId === 'p_01').extraHours)) === 3);
  await page.context().close();
}

// ---------------------------------------------------------------- absence
{
  const page = await open();
  await seedRoster(page);
  await page.evaluate(() => setDayMode('sites'));
  await page.waitForTimeout(200);

  await page.locator('.tray').first().locator('.chip').filter({ hasText: 'דוד' })
    .getByText('נעדר').click();
  await page.waitForTimeout(300);

  check('absence is recorded explicitly, not left blank',
    (await page.evaluate(() => isAbsent(State.schedule, State.date, 'w_01', 'actual'))));
  check('an absent worker moves to the absent tray',
    (await page.locator('.chip-absent').count()) === 1);
  check('an absent worker counts as handled, not outstanding',
    (await page.textContent('.progress-line')).includes('1 מתוך 3'));
  await page.context().close();
}

// ---------------------------------------------------------------- copy previous day
{
  const page = await open();
  await seedRoster(page);
  await page.evaluate(() => {
    assignPlace(State.schedule, '2026-08-11', 'w_01', 'actual', 'p_01', RATE_DOUBLE);
    assignPlace(State.schedule, '2026-08-11', 'w_02', 'actual', 'p_02');
    markAbsent(State.schedule, '2026-08-11', 'w_03', 'actual');
    // someone already recorded on the target day must not be touched
    assignPlace(State.schedule, '2026-08-12', 'w_02', 'actual', 'p_01');
    State.save(); render();
  });
  await page.waitForTimeout(200);

  // The button names the day it will copy from rather than saying "the previous day"
  // and leaving the person to work out which one that was.
  check('the copy button names the day it will copy from',
    (await page.textContent('#copyDayBtn')).includes('11/08'),
    await page.textContent('#copyDayBtn'));

  await page.locator('#copyDayBtn').click();
  await page.waitForTimeout(400);

  check('copying carries the rate across',
    (await page.evaluate(() => entriesFor(State.schedule, '2026-08-12', 'w_01', 'actual')[0].rate)) === 'double');
  check('copying carries an absence across',
    (await page.evaluate(() => isAbsent(State.schedule, '2026-08-12', 'w_03', 'actual'))));
  check('copying never overwrites someone already recorded',
    (await page.evaluate(() => entriesFor(State.schedule, '2026-08-12', 'w_02', 'actual')
      .map(e => e.placeId).join())) === 'p_01');

  // the copy reports what it did; clear it before carrying on
  await page.click('#askOk');
  await page.waitForTimeout(200);

  // Yesterday is the wrong source often enough to matter: a rest day, a run of empty
  // days after a holiday, or a day being fixed weeks later. It skips back to the last
  // day anything was actually recorded on.
  await page.evaluate(() => { State.date = '2026-08-18'; render(); });
  await page.waitForTimeout(300);
  check('an empty run in between is stepped over, not reported as nothing to copy',
    (await page.textContent('#copyDayBtn')).includes('12/08'),
    await page.textContent('#copyDayBtn'));

  await page.locator('#copyDayBtn').click();
  await page.waitForTimeout(400);
  check('and it copies that day, days later',
    (await page.evaluate(() =>
      entriesFor(State.schedule, '2026-08-18', 'w_01', 'actual').length)) === 1);
  // Sites carry across any gap; an absence does not. A copied absence looks exactly
  // like a real one, and one carried over a six-day gap costs a man a paid day.
  check('but an absence does not travel across a gap',
    !(await page.evaluate(() => isAbsent(State.schedule, '2026-08-18', 'w_03', 'actual'))));
  await page.click('#askOk');
  await page.waitForTimeout(200);

  // Before the first record there is genuinely nothing behind it.
  await page.evaluate(() => { State.date = '2026-08-01'; render(); });
  await page.waitForTimeout(300);
  check('with nothing behind it the button is dimmed rather than misleading',
    await page.locator('#copyDayBtn').isDisabled());
  await page.context().close();
}

// ---------------------------------------------------------------- week view
{
  const page = await open();
  await seedRoster(page);
  await page.evaluate(() => {
    assignPlace(State.schedule, '2026-08-12', 'w_01', 'actual', 'p_01');
    assignPlace(State.schedule, '2026-08-12', 'w_01', 'actual', 'p_02', RATE_DOUBLE);
    State.save();
  });
  await page.click('#tab-week');
  await page.waitForTimeout(400);

  check('the week has eight columns',
    (await page.locator('.week-table thead th').count()) === 8);
  check('the week starts on Friday, the way the accounts run',
    (await page.locator('.week-table thead th').nth(1).textContent()).includes('שישי'));
  check('and Saturday rests, greyed but keeping its place',
    (await page.locator('.week-table thead th.col-rest').count()) === 1);
  check('a cell shows both sites rather than hiding one',
    (await page.locator('.week-cell.cell-filled').first().locator('.cell-line').count()) === 2);
  check('a doubled site is marked inside its own badge',
    (await page.locator('.week-cell .tag-rate').filter({ hasText: 'כפול' }).count()) === 1);
  check('each site in the cell carries its own colour',
    (await page.locator('.week-cell.cell-filled').first().locator('.cell-line')
      .evaluateAll(nodes => new Set(nodes.map(n => getComputedStyle(n).backgroundColor)).size)) === 2);

  // read-only on purpose: a grid cell cannot edit two sites and a rate without losing data
  await page.locator('.week-cell.cell-filled').first().click();
  await page.waitForTimeout(300);
  check('clicking a day jumps to it in the day view',
    (await page.evaluate(() => currentView)) === 'day');
  check('and lands on the right date',
    (await page.evaluate(() => State.date)) === '2026-08-12');
  await page.context().close();
}

// ---------------------------------------------------------------- reports
{
  const page = await open();
  await seedRoster(page);
  await page.evaluate(() => {
    assignPlace(State.schedule, '2026-08-10', 'w_01', 'actual', 'p_01');
    assignPlace(State.schedule, '2026-08-10', 'w_01', 'actual', 'p_02', RATE_DOUBLE);
    assignPlace(State.schedule, '2026-08-11', 'w_01', 'actual', 'p_01', RATE_EXTRA, 2);
    assignPlace(State.schedule, '2026-08-11', 'w_02', 'actual', 'p_01');
    markAbsent(State.schedule, '2026-08-11', 'w_03', 'actual');
    State.save();
    REPORT_RANGE.from = '2026-08-01';
    REPORT_RANGE.to = '2026-08-31';
  });
  await page.click('#tab-reports');
  await page.waitForTimeout(400);

  const payroll = await page.evaluate(() => payrollRows());
  const david = payroll.find(r => r.workerId === 'w_01');
  check('two sites in one day is still one day of attendance',
    david.attendanceDays === 2, JSON.stringify(david));
  check('the day is counted, not the site visit',
    david.siteVisits === 3 && david.normalDays + david.doubleDays === 2, JSON.stringify(david));
  check('a day with any doubled site is a double day',
    david.doubleDays === 1 && david.normalDays === 1, JSON.stringify(david));
  check('extra hours are totalled', david.extraHours === 2);
  check('absence is counted apart from work',
    payroll.find(r => r.workerId === 'w_03').absent === 1);

  // 400 for the normal day, 800 for the double, 100 for two hours at 50
  check('pay is the daily rate, the double day twice over, and the hours on top',
    david.amount === 1300, JSON.stringify(david));
  check('a worker with no rate is owed an unknown amount, not nothing',
    payroll.find(r => r.workerId === 'w_03').amount === null);

  const invoice = await page.evaluate(() => invoiceRows());
  check('the invoice counts worker-days per site',
    invoice.find(r => r.placeId === 'p_01').workerDays === 3,
    JSON.stringify(invoice));

  const byDate = await page.evaluate(() =>
    invoiceByDate(State.schedule, REPORT_RANGE.from, REPORT_RANGE.to).dates);
  check('the invoice is broken out day by day',
    byDate.length === 2 && byDate[0] === '2026-08-10', JSON.stringify(byDate));
  check('the printed invoice is a date-by-site grid',
    (await page.locator('.report-invoice tbody tr').count()) === 2);
  check('and its columns are the sites',
    (await page.locator('.report-invoice thead th').count()) === 4);

  // the counts themselves, not just the shape: an empty grid has the right shape too
  const grid = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.report-invoice tbody tr'))
      .map(tr => Array.from(tr.children).map(td => td.textContent)));
  check('each day carries the number of workers at each site',
    JSON.stringify(grid[1].slice(1)) === JSON.stringify(['2', '', '2']), JSON.stringify(grid));
  check('and the earlier day splits across both sites',
    JSON.stringify(grid[0].slice(1)) === JSON.stringify(['1', '1', '2']), JSON.stringify(grid));

  const payText = await page.textContent('.report-payroll');
  check('the amount owed is on screen, not left to be worked out on paper',
    payText.includes('1300') && payText.includes('לתשלום'), payText);
  // A dash in the pay column is easy to read past, and the total is then short by a
  // whole fortnight of someone's work with nothing saying so.
  check('workers with no rate are named under the sheet, not left as a dash to notice',
    (await page.textContent('.report-payroll')).includes('בלי שכר יומי') &&
    (await page.textContent('.report-payroll')).includes('עלי'));

  check('a worker without a rate shows a dash rather than a zero',
    payText.includes('—'));

  // hours at a rate nobody entered are worth 0 in the sum - a total that looks finished
  // and is not, which is the one way this sheet could quietly underpay someone
  await page.evaluate(() => {
    State.worker('w_02').hourlyRate = 0;
    assignPlace(State.schedule, '2026-08-11', 'w_02', 'actual', 'p_01', RATE_EXTRA, 3);
    State.save(); render();
  });
  const flagged = await page.evaluate(() =>
    payrollRows().find(r => r.workerId === 'w_02').hoursUnpriced);
  check('hours with no hourly rate are flagged, not silently dropped', flagged === true);
  check('and the sheet says so where the money is', (await page.textContent('.report-payroll'))
    .includes('שעות נוספות בלי שכר שעה'));

  // The period used to print and nothing more, which left the phone with no answer to
  // the one question this screen provokes: why is a day I recorded not in the count?
  check('the sheet states the period it covers',
    (await page.textContent('.report-payroll .report-period'))
      .includes('01/08/2026 - 31/08/2026'));
  check('and says how long it is, so a short period is obvious',
    (await page.textContent('.report-payroll .report-period')).includes('31 ימים'));
  check('on the screen, not only on paper',
    (await page.evaluate(() =>
      getComputedStyle(document.querySelector('.report-period')).display)) !== 'none');

  const bodyText = await page.textContent('#reportsView');
  check('neither report shows an ID number or a phone',
    !bodyText.includes('111') && !bodyText.includes('050-1'));
  await page.context().close();
}

// ------------------------------------------------- four screens, one pair of numbers
//
// The account that started this: four dates on site, two of them double, at 450 a day,
// less a 100 advance. 2700 gross, 2600 net.
//
// The money was always right. What was wrong was "4 ימי עבודה" printed beside it, with
// no way to get from 4 to 2700. The pay sheet, the worker's detail screen, the message
// he receives and the exported file all have to say the same two numbers - and this is
// the test that they do, because four places kept by hand do not stay in step.
{
  const page = await open();
  await seedRoster(page);

  await page.evaluate(() => {
    State.schedule.workers = [
      { id: 'w_01', name: 'דוד', active: true, dailyRate: 450, hourlyRate: 0 }
    ];
    State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
    assignPlace(State.schedule, '2026-08-10', 'w_01', 'actual', 'p_01');
    assignPlace(State.schedule, '2026-08-11', 'w_01', 'actual', 'p_01', RATE_DOUBLE);
    assignPlace(State.schedule, '2026-08-12', 'w_01', 'actual', 'p_01', RATE_DOUBLE);
    assignPlace(State.schedule, '2026-08-13', 'w_01', 'actual', 'p_01');
    addAdvance(State.schedule, 'w_01', '2026-08-13', 100, '');
    State.save();
    REPORT_RANGE.from = '2026-08-01';
    REPORT_RANGE.to = '2026-08-31';
    showView('reports');
  });
  await page.waitForTimeout(400);

  // 1. The pay sheet.
  const sheet = await page.evaluate(() => {
    const table = document.querySelector('#reportsView .report-table');
    const heads = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
    const cells = [...table.querySelectorAll('tbody tr')]
      .find(tr => tr.textContent.includes('דוד'))
      .querySelectorAll('td, th');
    return { heads, cells: [...cells].map(cell => cell.textContent.trim()) };
  });
  const at = name => sheet.heads.indexOf(name);

  check('the sheet has a column for the dates he was on site',
    at('ימי נוכחות') !== -1, JSON.stringify(sheet.heads));
  check('and a separate one for the days he is paid for',
    at('ימי שכר') !== -1, JSON.stringify(sheet.heads));
  check('it no longer prints one count as if it explained the total',
    !sheet.heads.includes('ימי עבודה'), JSON.stringify(sheet.heads));
  check('four dates on site', sheet.cells[at('ימי נוכחות')] === '4',
    JSON.stringify(sheet.cells));
  check('six days of pay', sheet.cells[at('ימי שכר')] === '6', JSON.stringify(sheet.cells));
  check('two of them double', sheet.cells[at('מתוכם כפולים')] === '2',
    JSON.stringify(sheet.cells));
  check('and the money is the real arithmetic, unchanged',
    sheet.cells[at('נצבר')] === '2700' && sheet.cells[at('לתשלום')] === '2600',
    JSON.stringify(sheet.cells));

  // 2. His detail screen, reached from the number itself.
  const detail = await page.evaluate(() => {
    openWorkerDays('w_01');
    const total = document.querySelector('#workerDaysModal .wday-total');
    return total.textContent;
  });
  check('the detail screen says the same about the dates',
    detail.includes('4 ימי נוכחות'), detail);
  check('and the same about the days of pay',
    detail.includes('6 ימי שכר') && detail.includes('מתוכם 2 ימים כפולים'), detail);
  await page.evaluate(() => closeWorkerDays());

  // 3. The message he is handed.
  const statement = await page.evaluate(() => workerStatementText('w_01'));
  check('the message he receives says both, in the same words',
    statement.includes('4 ימי נוכחות') && statement.includes('6 ימי שכר')
    && statement.includes('מתוכם 2 ימים כפולים'), statement);
  check('and the number he is paid is still the real one',
    statement.includes('נותר לתשלום: 2600'), statement);

  // 4. The file the bookkeeper opens - same headings, same numbers.
  const exported = await page.evaluate(() => {
    const rows = reportSheets().payroll;
    return { head: rows[0], row: rows.find(line => line && line[0] === 'דוד') };
  });
  check('the export uses the same two headings',
    exported.head.includes('ימי נוכחות') && exported.head.includes('ימי שכר')
    && !exported.head.includes('ימי עבודה'), JSON.stringify(exported.head));
  check('with the same numbers under them',
    exported.row[exported.head.indexOf('ימי נוכחות')] === 4
    && exported.row[exported.head.indexOf('ימי שכר')] === 6
    && exported.row[exported.head.indexOf('מתוכם כפולים')] === 2,
    JSON.stringify(exported.row));
  check('and the same money',
    exported.row[exported.head.indexOf('נצבר')] === 2700
    && exported.row[exported.head.indexOf('לתשלום')] === 2600,
    JSON.stringify(exported.row));

  await page.context().close();
}

// ---------------------------------------------------------------- roster
{
  const page = await open();
  await seedRoster(page);
  await page.evaluate(() => {
    assignPlace(State.schedule, '2026-08-12', 'w_01', 'actual', 'p_01');
    State.save();
  });
  await page.click('#tab-roster');
  await page.waitForTimeout(300);

  check('workers are listed', (await page.locator('#workerList .roster-row').count()) === 3);
  check('sites are listed', (await page.locator('#placeList .roster-row').count()) === 2);
  check('the site list shows the names, not just buttons',
    (await page.textContent('#placeList')).includes('הרצליה'));

  // Every dialog is the app's own. The browser's prompt/confirm are ignored inside an
  // embedded frame, so driving them here would test something the app no longer uses.
  const rename = async value => {
    await page.locator('#placeList .roster-row').first().getByRole('button').first().click();
    await page.waitForTimeout(200);
    await page.fill('#askInput', value);
    await page.click('#askOk');
    await page.waitForTimeout(250);
  };

  // renaming is safe now: assignments point at the id, the name is only a label
  await rename('הרצליה מערב');
  check('renaming a site keeps its assignments',
    (await page.evaluate(() => entriesFor(State.schedule, '2026-08-12', 'w_01', 'actual')[0].placeId)) === 'p_01');
  check('the new name is shown', (await page.textContent('#placeList')).includes('הרצליה מערב'));

  // whitespace and duplicates are still refused, without throwing away the typing
  await rename('   ');
  check('a whitespace-only rename is refused',
    (await page.evaluate(() => State.place('p_01').name)) === 'הרצליה מערב');
  check('and the dialog stays open with the reason under the field',
    (await page.locator('#askModal').isVisible()) &&
    (await page.textContent('#askError')).length > 0, await page.textContent('#askError'));

  await page.fill('#askInput', 'תל אביב');
  await page.click('#askOk');
  await page.waitForTimeout(200);
  check('a duplicate name is refused',
    (await page.evaluate(() => State.place('p_01').name)) === 'הרצליה מערב');
  check('the typed name is still there to correct',
    (await page.inputValue('#askInput')) === 'תל אביב');
  await page.click('#askCancel');
  await page.waitForTimeout(200);
  check('cancelling changes nothing',
    (await page.evaluate(() => State.place('p_01').name)) === 'הרצליה מערב');

  // adding a site, the way a new user does it
  await page.getByRole('button', { name: '+ הוסף אתר' }).click();
  await page.waitForTimeout(200);
  await page.fill('#askInput', 'נתניה');
  await page.click('#askOk');
  await page.waitForTimeout(250);
  check('a site can be added and appears in the list',
    (await page.evaluate(() => State.schedule.places.length)) === 3 &&
    (await page.textContent('#placeList')).includes('נתניה'));

  // Archive, never delete: history has to keep resolving. The action is inside the
  // worker's own screen now, not an icon beside every name in the list.
  check('the list no longer carries an archive icon next to every name',
    (await page.locator('#workerList .roster-row').first()
      .getByRole('button', { name: /לארכיון/ }).count()) === 0);

  await page.locator('#workerList .roster-row').first()
    .getByRole('button', { name: /ערוך/ }).click();
  await page.waitForTimeout(250);
  check('his own screen offers the archive',
    await page.locator('#workerFormDanger').getByRole('button', { name: /לארכיון/ }).isVisible());
  // He has a day recorded, so deleting him is not on offer at all.
  check('and does not offer to delete a worker who has days recorded',
    (await page.locator('#workerFormDanger').getByRole('button', { name: /מחק/ }).count()) === 0);
  check('saying why, rather than leaving a button that does nothing',
    (await page.textContent('#workerFormDanger')).includes('ימים רשומים'),
    await page.textContent('#workerFormDanger'));

  await page.locator('#workerFormDanger').getByRole('button', { name: /לארכיון/ }).click();
  await page.waitForTimeout(250);
  await page.click('#askOk');
  await page.waitForTimeout(300);
  check('archiving keeps the worker in the data',
    (await page.evaluate(() => State.schedule.workers.length)) === 3);
  check('an archived worker drops out of the active list',
    (await page.evaluate(() => State.activeWorkers().length)) === 2);
  check('their recorded history survives',
    (await page.evaluate(() => entriesFor(State.schedule, '2026-08-12', 'w_01', 'actual').length)) === 1);
  check('and he is under the archive fold rather than in the working list',
    (await page.textContent('.roster-archive')).includes('דוד'),
    await page.textContent('.roster-archive'));

  // A name typed by mistake, with nothing recorded against it, IS deletable - and the
  // button for it is in his own screen, behind a dialog carrying his name.
  await page.evaluate(() => {
    State.schedule.workers.push({
      id: State.nextWorkerId(), name: 'טעות', active: true, dailyRate: 0, hourlyRate: 0
    });
    State.commitRoster();
    render();
  });
  await page.waitForTimeout(250);
  const before = await page.evaluate(() => State.schedule.workers.length);

  await page.locator('#workerList .roster-row').filter({ hasText: 'טעות' })
    .getByRole('button', { name: /ערוך/ }).click();
  await page.waitForTimeout(250);
  check('a worker with nothing recorded is offered a delete',
    await page.locator('#workerFormDanger').getByRole('button', { name: /מחק/ }).isVisible());

  await page.locator('#workerFormDanger').getByRole('button', { name: /מחק/ }).click();
  await page.waitForTimeout(250);
  check('the dialog names the man before he goes',
    (await page.textContent('#askTitle')).includes('טעות'),
    await page.textContent('#askTitle'));
  await page.click('#askOk');
  await page.waitForTimeout(300);

  check('and he is gone',
    (await page.evaluate(() => State.schedule.workers.length)) === before - 1,
    String(await page.evaluate(() => State.schedule.workers.length)));
  check('gone from the list too',
    !(await page.textContent('#workerList')).includes('טעות'));
  check('and gone from the disk, not only the screen',
    !(await page.evaluate(() => localStorage.getItem('scheduleData:v2') || '')).includes('טעות'));

  // A new worker must never reuse an archived id - and must not be one past the highest
  // either. Two phones holding the same roster used to hand the same next id to two
  // different men, and every day recorded against it then belonged to whichever of them
  // the reading device happened to have.
  const minted = await page.evaluate(() => {
    State.schedule.workers = [{ id: 'w_09', name: 'ותיק', active: false }];
    return [State.nextWorkerId(), State.nextWorkerId(), State.nextWorkerId()];
  });
  check('ids are never recycled',
    !minted.includes('w_09'), JSON.stringify(minted));
  // Not "does it look random" - a random hex id can come out all digits, which is what
  // the first version of this check tripped over. The property that matters is that it
  // is not DERIVED from the roster: two phones holding the same list must not both
  // arrive at the same next id.
  check('and never derived from the roster, so two phones cannot collide',
    !minted.includes('w_10') && new Set(minted).size === 3
    && minted.every(id => id.length > 8),
    JSON.stringify(minted));
  await page.context().close();
}

// ---------------------------------------------------------------- whatsapp message
{
  const page = await open();
  await seedRoster(page);
  await page.evaluate(() => {
    assignPlace(State.schedule, '2026-08-12', 'w_01', 'actual', 'p_01');
    assignPlace(State.schedule, '2026-08-12', 'w_02', 'actual', 'p_01', RATE_DOUBLE);
    assignPlace(State.schedule, '2026-08-12', 'w_02', 'actual', 'p_02', RATE_EXTRA, 2);
    markAbsent(State.schedule, '2026-08-12', 'w_03', 'actual');
    State.save(); render();
  });
  await page.getByText('💬 וואטסאפ').click();
  await page.waitForTimeout(300);

  const text = await page.inputValue('#shareText');
  // the owner's own template, character for character: 📅 heading, 📍 per site, 🚫 line
  check('the message opens exactly like the group is used to',
    text.startsWith('📅 סидור עבודה – יום רביעי 12/08/2026'.replace('סидור','סידור')), text.split('\n')[0]);
  check('it groups workers under their site', text.includes('📍 הרצליה') && text.includes('• דוד'));
  check('a doubled day is marked', text.includes('שרה (כפול)'), text);
  check('extra hours are spelled out', text.includes('+2'), text);
  check('absences are listed', text.includes('🚫 נעדרים:') && text.includes('עלי'));
  check('and with nobody absent the line still says so',
    (await page.evaluate(() => {
      State.commit(markAbsent(State.schedule, '2026-08-12', 'w_03', 'actual'));
      return dayMessage('2026-08-12', 'actual', 'pin');
    })).includes('🚫 נעדרים: עלי'));

  // three templates from the owner's own group, switchable and remembered
  check('the share dialog offers all three looks',
    (await page.locator('#shareStyles button').count()) === 3);

  await page.locator('#shareStyles').getByRole('button', { name: /אתרים/ }).click();
  await page.waitForTimeout(200);
  const crane = await page.inputValue('#shareText');
  check('the builder style opens its own way',
    crane.startsWith('סидור עובדים ליום'.replace('ид','יד')) && crane.includes('🏗️ הרצליה') && crane.includes('– דוד'),
    crane.split('\n')[0]);

  await page.locator('#shareStyles').getByRole('button', { name: /בוקר טוב/ }).click();
  await page.waitForTimeout(200);
  const morning = await page.inputValue('#shareText');
  check('the morning style greets first and uses the worker emoji',
    morning.startsWith('בוקר טוב,') && morning.includes('👷 דוד') && morning.includes('❌ נעדרים:'),
    morning.split('\n')[0]);

  // the choice survives closing and reopening
  await page.locator('#shareModal').getByRole('button', { name: 'סגור' }).click();
  await page.waitForTimeout(200);
  await page.getByText('💬 וואטסאפ').click();
  await page.waitForTimeout(250);
  check('and the chosen look is remembered for next time',
    (await page.inputValue('#shareText')).startsWith('בוקר טוב,'));
  check('no ID numbers or phones leak into the message',
    !text.includes('111') && !text.includes('050-1'));

  // Everyone is recorded in this day, so there is nothing to warn about yet.
  check('with the whole crew recorded the dialog says nothing extra',
    !(await page.locator('#shareWarning').isVisible()));

  // The button goes to WhatsApp rather than to the clipboard and a walk between apps.
  const shared = await page.evaluate(() => {
    window.__shared = null;
    navigator.share = data => { window.__shared = data; return Promise.resolve(); };
    sendDayMessage();
    return new Promise(resolve => setTimeout(() => resolve(window.__shared), 200));
  });
  check('sending hands the message straight to the phone\'s share sheet',
    shared && typeof shared.text === 'string' && shared.text.startsWith('בוקר טוב,'),
    JSON.stringify(shared && shared.text ? shared.text.split('\n')[0] : shared));
  check('and the dialog steps out of the way once it is sent',
    !(await page.locator('#shareModal').isVisible()));

  // A cancelled share sheet is not a failure and must not be treated as one.
  await page.evaluate(() => {
    navigator.share = () => Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' }));
    window.__opened = null;
    window.open = url => { window.__opened = url; };
    showDayMessage();
    sendDayMessage();
  });
  await page.waitForTimeout(250);
  check('backing out of the share sheet does not fall through to anything',
    (await page.evaluate(() => window.__opened)) === null);

  // A share that FAILS (not cancelled) lands after the tap is over, where window.open
  // is popup-blocked - so the old fallback closed the modal over a message that had
  // gone nowhere. Now it stays open and says to use the copy button.
  await page.evaluate(() => {
    navigator.share = () => Promise.reject(new Error('boom'));
    window.__opened = null;
    sendDayMessage();
  });
  await page.waitForTimeout(250);
  check('a failed share keeps the message on screen instead of losing it',
    (await page.locator('#shareModal').isVisible()) &&
    (await page.evaluate(() => window.__opened)) === null &&
    (await page.textContent('#shareStatus')).includes('העתק'),
    await page.textContent('#shareStatus'));

  // Without a share sheet at all, WhatsApp is opened directly with the text in it.
  await page.evaluate(() => {
    delete navigator.share;
    window.__opened = null;
    sendDayMessage();
  });
  await page.waitForTimeout(250);
  const opened = await page.evaluate(() => window.__opened);
  check('with no share sheet it opens WhatsApp itself, message already written',
    typeof opened === 'string' && opened.startsWith('https://wa.me/?text=') &&
    decodeURIComponent(opened.split('text=')[1]).startsWith('בוקר טוב,'), opened);

  // The seder omits anyone not recorded, which the message itself cannot show.
  await page.evaluate(() => {
    State.schedule.workers.push({ id: 'w_04', name: 'סמיר', active: true });
    State.save(); render();
    showDayMessage();
  });
  await page.waitForTimeout(250);
  check('someone still unrecorded is named before the message can be sent',
    (await page.locator('#shareWarning').isVisible()) &&
    (await page.textContent('#shareWarning')).includes('סמיר'));
  await page.context().close();
}

// ---------------------------------------------------------------- a copy that failed
{
  // The status line used to say "copied" whichever way it went. On a browser that
  // refuses the clipboard the person then switched to WhatsApp, pasted whatever was
  // there from this morning, and sent that.
  const page = await open();
  await seedRoster(page);
  await page.evaluate(() => {
    assignPlace(State.schedule, '2026-08-12', 'w_01', 'actual', 'p_01');
    State.save(); render(); showDayMessage();
  });
  await page.waitForTimeout(250);

  await page.evaluate(() => {
    navigator.clipboard.writeText = () => Promise.reject(new Error('blocked'));
    document.execCommand = () => false;
    copyDayMessage();
  });
  await page.waitForTimeout(300);
  check('a refused copy says so instead of claiming success',
    (await page.textContent('#shareStatus')).includes('נחסמה'),
    await page.textContent('#shareStatus'));

  await page.evaluate(() => {
    navigator.clipboard.writeText = () => Promise.resolve();
    copyDayMessage();
  });
  await page.waitForTimeout(300);
  check('and a real copy still reports itself',
    (await page.textContent('#shareStatus')).includes('הועתק'));
  await page.context().close();
}

// ---------------------------------------------------------------- v1 migration
{
  const page = await newPage();
  await page.addInitScript(() => {
    localStorage.setItem('scheduleData', JSON.stringify({
      workers: ['דוד', { name: 'שרה', id: '22', phone: '050' }],
      places: ['הרצליה', 'תל אביב'],
      weekStartDate: '2026-08-09',
      assignments: [
        { index: 0, value: 'הרצליה', holiday: false },
        { index: 1, value: 'חופש', holiday: true },
        { index: 7, value: 'הרצליה + תל אביב' },
        { index: 8, value: 'מקום שנעלם' }
      ]
    }));
  });
  await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(700);

  check('v1 data is migrated on first load',
    (await page.evaluate(() => State.schedule.workers.length)) === 2);
  check('the original v1 key is left untouched',
    (await page.evaluate(() => localStorage.getItem('scheduleData'))) !== null);
  check('a clean assignment lands on the right worker and date',
    (await page.evaluate(() => entriesFor(State.schedule, '2026-08-09', 'w_01', 'actual')[0].placeId)) === 'p_01');
  check('a vacation becomes an absence',
    (await page.evaluate(() => isAbsent(State.schedule, '2026-08-10', 'w_01', 'actual'))));

  check('ambiguous cells are held back, not guessed',
    (await page.evaluate(() => entriesFor(State.schedule, '2026-08-09', 'w_02', 'actual').length)) === 0);
  check('they are surfaced as decisions to make',
    (await page.evaluate(() => State.migrationIssues.length)) === 2);
  check('the banner tells the user there is something to decide',
    (await page.isVisible('#migrationBanner')));

  // The boot notice comes first and the list opens behind it on purpose: dismissing the
  // notice is what hands the person over to the decisions.
  check('the migration is announced before anything else',
    await page.locator('#askModal').isVisible() &&
    (await page.textContent('#askMessage')).includes('2'));
  await page.click('#askOk');
  await page.waitForTimeout(400);
  check('and closing the notice opens the list of decisions',
    await page.locator('#migrationModal').isVisible());
  check('the original text is shown verbatim',
    (await page.textContent('#migrationList')).includes('הרצליה + תל אביב'));
  check('a split is offered only as a suggestion',
    (await page.textContent('#migrationList')).includes('פצל ל:'));

  // a decision here is a work day appearing in the record: it has to travel like one
  await page.evaluate(() => {
    FarkadSync.adapter = { update: () => Promise.resolve(), save: () => Promise.resolve() };
    FarkadSync.pushDelayMs = 100000;
    FarkadSync.clearOutbox();
  });

  await page.locator('#migrationList .issue').filter({ hasText: 'הרצליה + תל אביב' })
    .getByText(/פצל ל:/).click();
  await page.waitForTimeout(300);
  check('accepting the suggestion writes both sites',
    (await page.evaluate(() => entriesFor(State.schedule, '2026-08-09', 'w_02', 'actual')
      .map(e => e.placeId).join())) === 'p_01,p_02');
  check('and the decision is sent, not left on the phone that answered it',
    (await page.evaluate(() => FarkadSync.pendingPaths()))
      .includes('days.2026-08-09.actual.w_02'),
    JSON.stringify(await page.evaluate(() => FarkadSync.pendingPaths())));
  await page.evaluate(() => { FarkadSync.adapter = null; FarkadSync.clearOutbox(); });

  check('the resolved issue leaves the list',
    (await page.evaluate(() => State.migrationIssues.length)) === 1);

  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(600);
  check('the remaining decision survives a reload',
    (await page.evaluate(() => State.migrationIssues.length)) === 1);
  check('migration does not run twice',
    (await page.evaluate(() => entriesFor(State.schedule, '2026-08-09', 'w_02', 'actual').length)) === 2);
  await page.context().close();
}

// ---------------------------------------------------------------- backup file
{
  const page = await open({ acceptDownloads: true });
  await seedRoster(page);
  await page.evaluate(() => {
    assignPlace(State.schedule, '2026-08-12', 'w_01', 'actual', 'p_01');
    State.save();
  });
  await page.click('#tab-roster');
  await page.waitForTimeout(300);

  const download = await Promise.all([
    page.waitForEvent('download'),
    page.getByText('💾 שמור קובץ גיבוי').click()
  ]).then(([d]) => d);
  const fs = await import('node:fs');
  const saved = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  check('the backup file carries the whole schedule',
    saved.workers.length === 3 && saved.days['2026-08-12'] !== undefined);

  // a file that is not a backup must not touch the data
  const before = await page.evaluate(() => State.schedule.workers.length);
  await page.evaluate(() => {
    const file = new File([JSON.stringify({ hello: 'world' })], 'junk.json', { type: 'application/json' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const input = document.getElementById('importInput');
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(400);
  check('a bad import leaves the roster untouched',
    (await page.evaluate(() => State.schedule.workers.length)) === before);
  await page.context().close();
}

// ---------------------------------------------------------------- sync
{
  const page = await open();
  await seedRoster(page);

  check('the app runs local-only with nothing connected',
    (await page.evaluate(() => FarkadSync.status)) === 'off');
  check('and says so under the board',
    (await page.textContent('#storageNotice')).includes('במכשיר הזה'));

  await page.evaluate(() => {
    window.__fake = { patches: [], saved: [], onSnapshot: null };
    FarkadSync.pushDelayMs = 20;
    FarkadSync.connect({
      update(patch) { window.__fake.patches.push(patch); return Promise.resolve(); },
      save(data) { window.__fake.saved.push(data); return Promise.resolve(); },
      subscribe(cb) { window.__fake.onSnapshot = cb; return () => {}; }
    });
    State.commit(assignPlace(State.schedule, State.date, 'w_01', 'actual', 'p_01'));
  });
  await page.waitForTimeout(300);

  const patch = await page.evaluate(() => window.__fake.patches[0]);
  check('an edit is sent as one narrow field path',
    Object.keys(patch).includes('days.2026-08-12.actual.w_01'), JSON.stringify(Object.keys(patch)));
  check('an edit never sends the whole document',
    !('workers' in patch) && !('places' in patch));

  // The Firebase adapter rebuilds each dotted path as FieldPath segments, because a raw
  // string path with a date in it is invalid to Firestore. That split assumes exactly
  // four dot-separated segments with none of Firestore's forbidden characters - so the
  // assumption is pinned here, where the paths are made.
  const madePaths = await page.evaluate(() => {
    const s = emptySchedule();
    return [
      assignPlace(s, '2026-08-12', 'w_01', 'plan', 'p_01').path,
      markAbsent(s, '2026-08-12', 'w_02', 'actual').path,
      clearWorkerDay(s, '2026-08-12', 'w_03', 'plan').path,
      setRate(s, '2026-08-12', 'w_01', 'plan', 'p_01', RATE_DOUBLE).path,
      unassignPlace(s, '2026-08-12', 'w_01', 'plan', 'p_01').path
    ];
  });
  check('every sync path is four clean segments, as the adapter assumes',
    madePaths.every(p => p.split('.').length === 4 && !/[~*/\[\]]/.test(p)),
    JSON.stringify(madePaths));
  check('every write is stamped', typeof patch.updatedAt === 'string');
  check('status turns synced', (await page.evaluate(() => FarkadSync.status)) === 'synced');

  // the case this design exists for: three people building the same evening at once
  const merged = await page.evaluate(async () => {
    const server = {};
    const apply = p => Object.keys(p).forEach(k => { server[k] = p[k]; });
    ['w_01', 'w_02', 'w_03'].forEach((workerId, i) => {
      const sync = Object.create(FarkadSync);
      // Own queue, and no writing to storage. Without these the three stand-ins inherit
      // the real one's outbox through the prototype and queue into it - which is not
      // three phones, it is one phone with nine pending edits.
      sync._outbox = new Map();
      sync._sending = new Map();
      sync._loaded = true;
      sync.adoptJournal = candidate => { sync._outbox = candidate; return true; };
      sync._stamp = { updatedAt: `2026-08-12T18:0${i}:00.000Z`, updatedBy: `d${i}` };
      sync.adapter = { update(p) { apply(p); return Promise.resolve(); } };
      sync.setStatus = () => {};
      sync.edit(`days.2026-08-12.plan.${workerId}`, { entries: [{ placeId: 'p_01' }] });
      sync.flush();
    });
    // Cloud writes are serialised now, so the request goes out on the next microtask
    // rather than inside flush(). Reading the server synchronously would be reading it
    // before any of the three had been sent.
    await new Promise(done => setTimeout(done, 100));
    return Object.keys(server);
  });
  check('three people editing different workers all survive',
    ['w_01', 'w_02', 'w_03'].every(id => merged.includes(`days.2026-08-12.plan.${id}`)),
    JSON.stringify(merged));

  // debounce
  await page.evaluate(() => {
    window.__fake.patches.length = 0;
    ['w_01', 'w_02', 'w_03'].forEach(id =>
      State.commit(assignPlace(State.schedule, State.date, id, 'actual', 'p_02')));
  });
  await page.waitForTimeout(300);
  check('rapid edits collapse into one round trip',
    (await page.evaluate(() => window.__fake.patches.length)) === 1);
  check('but every one of them is in it',
    (await page.evaluate(() => Object.keys(window.__fake.patches[0])
      .filter(k => k.startsWith('days.')).length)) === 3);

  // The server document is the truth: every write is a field-level merge into it, so it
  // already holds everyone's work.
  await page.evaluate(() => {
    window.__fake.onSnapshot({
      workers: [{ id: 'w_09', name: 'מהטלפון', active: true }],
      places: [], days: {},
      updatedAt: '2099-01-01T00:00:00.000Z', updatedBy: 'other'
    });
  });
  await page.waitForTimeout(300);
  check('a remote snapshot is adopted',
    (await page.evaluate(() => State.schedule.workers[0].name)) === 'מהטלפון');
  check('adopting one keeps the previous state recoverable',
    (await page.evaluate(() => localStorage.getItem('scheduleData:v2backup'))) !== null);
  check('and adopting it does not re-stamp their work as this device\'s',
    (await page.evaluate(() => State.schedule.updatedAt)) === '2099-01-01T00:00:00.000Z' &&
    (await page.evaluate(() => State.schedule.updatedBy)) === 'other');

  // A phone whose clock runs a few minutes fast used to judge every incoming snapshot
  // "older than mine" and quietly stop showing the other two people's work.
  await page.evaluate(() => {
    window.__fake.onSnapshot({
      workers: [{ id: 'w_08', name: 'משעון אחר', active: true }],
      places: [], days: {},
      updatedAt: '2000-01-01T00:00:00.000Z', updatedBy: 'skewed-clock'
    });
  });
  await page.waitForTimeout(300);
  check('a snapshot from a phone with a slow clock is still shown',
    (await page.evaluate(() => State.schedule.workers[0].name)) === 'משעון אחר');

  // An empty cloud document is not a schedule anyone wrote - adopting it empties the phone
  await page.evaluate(() => {
    window.__fake.onSnapshot({ workers: [], places: [], days: {} });
  });
  await page.waitForTimeout(300);
  check('a cloud document nobody has written to is not adopted',
    (await page.evaluate(() => State.schedule.workers.length)) === 1);

  // an edit typed in the last second must not vanish when somebody else's change lands
  const survived = await page.evaluate(() => {
    FarkadSync.adapter.update = () => new Promise(() => {});     // never completes
    State.commit(assignPlace(State.schedule, '2026-08-12', 'w_09', 'actual', 'p_01'));
    FarkadSync.flush();
    window.__fake.onSnapshot({
      workers: [{ id: 'w_09', name: 'משעון אחר', active: true }],
      places: [{ id: 'p_01', name: 'הרצליה', active: true }],
      days: { '2026-08-12': { plan: {}, actual: { w_05: { entries: [{ placeId: 'p_01' }] } } } },
      updatedAt: '2030-01-01T00:00:00.000Z', updatedBy: 'other'
    });
    return {
      mine: entriesFor(State.schedule, '2026-08-12', 'w_09', 'actual').length,
      theirs: entriesFor(State.schedule, '2026-08-12', 'w_05', 'actual').length
    };
  });
  check('an edit still in the queue survives a snapshot landing on top of it',
    survived.mine === 1 && survived.theirs === 1, JSON.stringify(survived));

  await page.evaluate(() => { window.__fake.onSnapshot({ nonsense: true }); });
  await page.waitForTimeout(200);
  check('a malformed remote document cannot wipe the schedule',
    (await page.evaluate(() => State.schedule.workers.length)) === 1);
  check('and is reported as an error',
    (await page.evaluate(() => FarkadSync.status)) === 'error');

  await page.evaluate(() => {
    FarkadSync.setStatus('synced');
    // The check above deliberately left a send open that never completes. Clearing it
    // is the test tidying up after itself: a hung send is allowed to block the next one
    // for a while, which is the point of that guard.
    FarkadSync._sending = new Map();
    // And the same for the write chain, which is the other thing a never-settling
    // request holds up. In the app that resolves itself after stuckMs; here the point
    // of the next check is the failure it reports, not how long the wait was.
    FarkadSync._cloudChain = null;
    FarkadSync._cloudOpen = 0;
    FarkadSync.adapter.update = () => Promise.reject(new Error('offline'));
    FarkadSync.edit('days.2026-08-12.actual.w_09', { entries: [] });
  });
  await page.waitForTimeout(300);
  check('a failed push is reported',
    (await page.evaluate(() => FarkadSync.status)) === 'error');
  check('a failed push keeps the edit for retry',
    (await page.evaluate(() => FarkadSync.pendingPaths()))
      .includes('days.2026-08-12.actual.w_09'));
  await page.context().close();
}

// ---------------------------------------------------------------- dates
{
  const page = await open({ timezoneId: 'Asia/Jerusalem' });
  await page.clock.install({ time: new Date('2026-08-12T22:30:00Z') }); // 01:30 local, next day
  await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(500);

  const info = await page.evaluate(() => ({
    date: State.date,
    oldWay: new Date().toISOString().split('T')[0]
  }));
  check('the date is the local one, not the UTC one',
    info.date === '2026-08-13', `state=${info.date} utc=${info.oldWay}`);
  check('and toISOString would have been a day out here',
    info.oldWay !== info.date, `utc=${info.oldWay}`);

  await page.evaluate(() => { State.date = '2026-08-13'; render(); });
  await page.getByRole('button', { name: 'יום קודם', exact: true }).click();
  await page.waitForTimeout(300);
  check('stepping back a day works', (await page.evaluate(() => State.date)) === '2026-08-12');

  // a DST boundary must not drop or repeat a day
  const dst = await page.evaluate(() => {
    const out = [];
    let cursor = parseLocalDate('2026-10-23');
    for (let i = 0; i < 7; i++) {
      out.push(toLocalDateStr(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  });
  check('stepping across the DST change gives seven distinct days',
    new Set(dst).size === 7 && dst[6] === '2026-10-29', JSON.stringify(dst));
  await page.context().close();
}

// ---------------------------------------------------------------- names are text
{
  const page = await open();
  await page.evaluate(() => {
    State.schedule.workers = [{ id: 'w_01', name: '<img src=x onerror="window.__pwned=1">', active: true }];
    State.schedule.places = [{ id: 'p_01', name: '<b>אתר</b>', active: true }];
    State.date = '2026-08-12';
    // assign, so the site name is rendered on the worker row too
    assignPlace(State.schedule, State.date, 'w_01', 'actual', 'p_01');
    State.save(); render();
  });
  await page.waitForTimeout(300);
  check('markup in a name is never executed',
    (await page.evaluate(() => window.__pwned)) === undefined);
  check('markup in a name renders as text',
    (await page.textContent('#dayView')).includes('<b>אתר</b>'));
  await page.context().close();
}

// ---------------------------------------------------------------- view chrome
{
  const page = await open();
  await seedRoster(page);

  check('the day actions are shown on the day view',
    await page.isVisible('.day-actions'));

  await page.click('#tab-reports');
  await page.waitForTimeout(300);
  check('day actions are hidden where they have no meaning',
    await page.isHidden('.day-actions'));

  await page.click('#tab-roster');
  await page.waitForTimeout(300);
  check('and stay hidden on the roster', await page.isHidden('.day-actions'));

  await page.click('#tab-day');
  await page.waitForTimeout(300);
  check('and come back on the day view', await page.isVisible('.day-actions'));
  await page.context().close();
}

// ---------------------------------------------------------------- contrast
// Every button label must be readable on its own background. A theme rule that outranks
// the .btn-* classes paints secondary buttons white on white, which is invisible rather
// than merely ugly, so it is worth asserting.
{
  for (const scheme of ['light', 'dark']) {
    const page = await open({ colorScheme: scheme });
    await seedRoster(page);

    const worst = await page.evaluate(() => {
      const parse = c => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
      const lum = ([r, g, b]) => {
        const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const solidBg = node => {
        let el = node;
        while (el) {
          const bg = getComputedStyle(el).backgroundColor;
          const parts = (bg.match(/[\d.]+/g) || []).map(Number);
          if (parts.length < 4 || parts[3] > 0) return parse(bg);
          el = el.parentElement;
        }
        return [255, 255, 255];
      };

      let lowest = { ratio: 99, text: '' };
      document.querySelectorAll('button').forEach(btn => {
        if (!btn.textContent.trim() || !btn.offsetParent) return;
        const fg = lum(parse(getComputedStyle(btn).color));
        const bg = lum(solidBg(btn));
        const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
        if (ratio < lowest.ratio) lowest = { ratio: Number(ratio.toFixed(2)), text: btn.textContent.trim() };
      });
      return lowest;
    });

    check(`every button label is legible in ${scheme} mode`,
      worst.ratio >= 4.5, `worst ${worst.ratio}:1 on "${worst.text}"`);
    await page.context().close();
  }
}

// ---------------------------------------------------------------- offline
// The claim worth testing is not "a service worker registered" but "the app opens with
// the network switched off", because that is what happens on a site.
{
  const page = await open();
  await page.waitForTimeout(1200);

  const active = await page.evaluate(() =>
    navigator.serviceWorker.ready.then(r => Boolean(r.active)).catch(() => false));
  check('a service worker takes control', active);

  const cached = await page.evaluate(() =>
    caches.keys().then(keys => Promise.all(keys.map(k =>
      caches.open(k).then(c => c.keys().then(reqs => reqs.map(r => new URL(r.url).pathname)))
    )).then(all => all.flat())));
  check('the whole shell is cached, not just the page',
    ['/index.html', '/css/app.css', '/js/app.js', '/js/ui/day.js', '/js/model/schema.js']
      .every(p => cached.some(c => c.endsWith(p))),
    `${cached.length} entries`);
  check('the icons are cached too',
    cached.some(c => c.endsWith('/icons/icon-192.png')));
  check('the third-party CDN is NOT cached',
    !cached.some(c => c.includes('xlsx')));

  await seedRoster(page);
  await page.evaluate(() => {
    assignPlace(State.schedule, State.date, 'w_01', 'actual', 'p_01');
    State.save();
  });

  // pull the plug
  await page.context().setOffline(true);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(800);

  check('the app opens with the network off',
    (await page.evaluate(() => document.getElementById('dayView').children.length > 0)));
  check('the recorded day is still there offline',
    (await page.evaluate(() => entriesFor(State.schedule, '2026-08-12', 'w_01', 'actual').length)) === 1);
  // A reload resets the viewed date to today, so point it back before editing.
  await page.evaluate(() => { State.date = '2026-08-12'; render(); });
  await page.evaluate(() => {
    State.commit(assignPlace(State.schedule, State.date, 'w_02', 'actual', 'p_02'));
  });
  await page.waitForTimeout(300);
  check('it can still be edited offline',
    (await page.evaluate(() => entriesFor(State.schedule, '2026-08-12', 'w_02', 'actual').length)) === 1);
  check('the offline edit is persisted, not just on screen',
    (await page.evaluate(() => JSON.parse(localStorage.getItem('scheduleData:v2'))
      .days['2026-08-12'].actual.w_02.entries.length)) === 1);
  check('and the offline state is announced rather than looking normal',
    await page.isVisible('#offlineBanner'));

  // The worse case than no signal: a signal that is connected and going nowhere. The
  // document request hangs, and without a deadline the person watches a blank screen
  // while a perfectly good copy of the app sits in the cache. The server really does
  // hold this response - intercepting it in the test would not reach the worker.
  await page.context().setOffline(false);

  const started = Date.now();
  await page.goto(`${BASE}/index.html?slow=12`, { waitUntil: 'load' });
  const took = Date.now() - started;
  await page.waitForTimeout(400);

  check('a stalled network does not hold the app hostage',
    took < 8000, `${(took / 1000).toFixed(1)}s`);
  check('and what opens is the real app, from the cache',
    (await page.evaluate(() => document.getElementById('dayView').children.length > 0)));

  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForTimeout(200);
  check('the offline notice clears when the signal comes back',
    await page.isHidden('#offlineBanner'));
  await page.context().close();
}

// ---------------------------------------------------------------- manifest
{
  const page = await open();
  const manifest = await page.evaluate(() =>
    fetch('manifest.webmanifest').then(r => r.json()));
  check('the manifest is installable', manifest.display === 'standalone' && !!manifest.start_url);
  check('it declares an RTL Hebrew app', manifest.dir === 'rtl' && manifest.lang === 'he');
  check('it ships both icon sizes',
    manifest.icons.some(i => i.sizes === '192x192') && manifest.icons.some(i => i.sizes === '512x512'));
  check('and a maskable icon for Android',
    manifest.icons.some(i => (i.purpose || '').includes('maskable')));

  // every file the service worker precaches must actually exist, or install half-fails
  // and the app is silently only partly available offline
  const missing = await page.evaluate(async () => {
    const source = await fetch('sw.js').then(r => r.text());
    const list = source.slice(source.indexOf('const SHELL'), source.indexOf('];'))
      .match(/'\.\/[^']*'/g).map(s => s.slice(1, -1));
    const out = [];
    for (const url of list) {
      const res = await fetch(url, { method: 'HEAD' });
      if (!res.ok) out.push(url);
    }
    return out;
  });
  check('every precached path exists', missing.length === 0, missing.join(', '));

  // The invariant that actually matters: nothing the page loads may be absent from the
  // precache list. A missing entry still works online - the runtime cache picks it up -
  // so the gap only shows up on a site with no signal, which is the one place it must not.
  const notPrecached = await page.evaluate(async () => {
    const [swSource, pageSource] = await Promise.all([
      fetch('sw.js').then(r => r.text()),
      fetch('index.html').then(r => r.text())
    ]);
    const shell = swSource.slice(swSource.indexOf('const SHELL'), swSource.indexOf('];'))
      .match(/'\.\/[^']*'/g).map(s => s.slice(1, -1).replace('./', ''));

    const referenced = [...pageSource.matchAll(/<script src="([^"]+)"/g)].map(m => m[1])
      .concat([...pageSource.matchAll(/<link[^>]+href="([^"]+)"/g)].map(m => m[1]))
      .filter(src => !src.startsWith('http'));

    return referenced.filter(src => !shell.includes(src));
  });
  check('every script and stylesheet the page loads is precached',
    notPrecached.length === 0, notPrecached.join(', '));
  await page.context().close();
}

// ---------------------------------------------------------------- one build per session
{
  // The page used to be network-first while the scripts were cache-first. Deploy a new
  // version while a phone is running the old one and the next navigation fetched the NEW
  // page against the OLD scripts - and wrote that page into the old version's cache, so
  // every offline launch afterwards opened the mismatch too. A page and a sync layer from
  // different builds is a data failure, not a rendering one.
  const page = await open();
  await page.waitForTimeout(1500);

  const build = await page.evaluate(() => {
    const tag = document.querySelector('meta[name="farkad-build"]');
    return tag && tag.getAttribute('content');
  });
  check('the page says which build it is', build === APP_VERSION_EXPECTED,
    `page=${build} app=${APP_VERSION_EXPECTED}`);

  // The document must come from the cache the current worker owns, and must not be
  // replaced there by whatever the network happens to be serving.
  const served = await page.evaluate(async () => {
    const keys = await caches.keys();
    const cache = await caches.open(keys[0]);
    const before = await cache.match('./index.html').then(r => r && r.text());

    // A navigation, the way a reload is one.
    await fetch('index.html', { mode: 'navigate' }).then(r => r.text()).catch(() => '');
    const after = await cache.match('./index.html').then(r => r && r.text());

    return { cached: Boolean(before), unchanged: before === after, caches: keys.length };
  });
  check('the document is served from this version\'s cache', served.cached);
  check('and a navigation does not overwrite it', served.unchanged);
  check('exactly one version cache exists at a time', served.caches === 1,
    String(served.caches));

  // A build mismatch is noticed and stops the app writing, rather than saving an edit in
  // a shape the other half of the app does not read.
  const blocked = await page.evaluate(() => {
    document.querySelector('meta[name="farkad-build"]').setAttribute('content', 'v1');
    checkBuildConsistency();
    const before = Store.get('scheduleData:v2');
    State.schedule.workers.push({ id: 'w_zz', name: 'לא אמור להישמר', active: true });
    State.save();
    return {
      banner: document.getElementById('crashBanner').style.display !== 'none',
      text: document.getElementById('crashBanner').textContent,
      unchanged: Store.get('scheduleData:v2') === before
    };
  });
  check('a page and scripts from different builds is noticed', blocked.banner);
  check('and named, with both versions', blocked.text.includes('v1'), blocked.text.slice(0, 90));
  check('and nothing is written while they disagree', blocked.unchanged);

  await page.context().close();
}

// ---------------------------------------------------------------- day: by worker
// The paper being copied from is a grid: names down the side, the site written in the
// middle. So the default view is the roster in its own fixed order, and the order never
// changes under the reader - only how an unfilled row looks.
{
  const page = await open();
  await seedRoster(page);

  check('the day opens by site, the way the seder is read out',
    (await page.evaluate(() => dayMode)) === 'sites');

  await page.evaluate(() => setDayMode('workers'));
  await page.waitForTimeout(200);
  check('every worker has a row', (await page.locator('.wrow').count()) === 3);
  check('rows keep roster order',
    (await page.evaluate(() => [...document.querySelectorAll('.wrow-name')].map(n => n.textContent).join(','))) === 'דוד,שרה,עלי');
  check('unfilled rows are marked', (await page.locator('.wrow-empty').count()) === 3);
  check('progress starts at zero', (await page.textContent('.progress-line')).includes('0 מתוך 3'));

  // one tap per worker: the sheet advances by itself
  await page.getByText('המשך (3)').click();
  await page.waitForTimeout(250);
  check('the continue button opens the first unfilled worker',
    (await page.textContent('#assignSheetTitle')) === 'דוד');
  check('opening the sheet is calm, with no advance animation',
    (await page.locator('#assignSheet .sheet-content.sheet-swap').count()) === 0);

  await page.locator('.sheet-place').filter({ hasText: 'הרצליה' }).click();
  await page.waitForTimeout(250);
  check('picking a site advances to the next unfilled worker',
    (await page.textContent('#assignSheetTitle')) === 'שרה');
  check('and the move to a new name announces itself',
    (await page.locator('#assignSheet .sheet-content.sheet-swap').count()) === 1);
  check('the sheet stays open through the run', await page.isVisible('#assignSheet'));

  await page.locator('.sheet-place').filter({ hasText: 'תל אביב' }).click();
  await page.waitForTimeout(250);
  check('and again', (await page.textContent('#assignSheetTitle')) === 'עלי');

  // absence also advances - it is a complete answer for that worker
  await page.locator('.sheet-actions').getByText('נעדר', { exact: true }).click();
  await page.waitForTimeout(250);
  check('the sheet closes when nobody is left', await page.isHidden('#assignSheet'));
  check('every worker ended up recorded',
    (await page.evaluate(() => State.unrecorded().length)) === 0);
  check('progress reads complete', (await page.textContent('.progress-line')).includes('3 מתוך 3'));
  check('no row is left marked unfilled', (await page.locator('.wrow-empty').count()) === 0);
  await page.context().close();
}

// ---------------------------------------------------------------- tap count
// The number that decides whether this is worth using: taps to record a full day.
{
  const page = await open();
  await page.evaluate(() => {
    State.schedule.workers = Array.from({ length: 12 }, (_, i) =>
      ({ id: `w_${i + 1}`, name: `עובד ${i + 1}`, active: true }));
    State.schedule.places = [
      { id: 'p_01', name: 'הרצליה', active: true },
      { id: 'p_02', name: 'תל אביב', active: true }
    ];
    State.date = '2026-08-12';
    State.save(); render();
  });
  await page.waitForTimeout(200);

  let taps = 0;
  await page.getByText('המשך (12)').click(); taps++;
  await page.waitForTimeout(200);

  for (let i = 0; i < 12; i++) {
    await page.locator('.sheet-place').first().click();
    taps++;
    await page.waitForTimeout(90);
  }
  await page.waitForTimeout(200);

  check('twelve workers recorded in thirteen taps', taps === 13, `${taps} taps`);
  check('and all twelve actually landed',
    (await page.evaluate(() => State.unrecorded().length)) === 0);
  check('the sheet closed itself at the end', await page.isHidden('#assignSheet'));
  await page.context().close();
}

// ---------------------------------------------------------------- two sites in a day
{
  const page = await open();
  await seedRoster(page);
  await page.evaluate(() => openAssignSheet('w_01'));
  await page.waitForTimeout(250);

  await page.locator('.sheet-place').filter({ hasText: 'הרצליה' }).click();
  await page.waitForTimeout(250);
  check('a first site moves the run along',
    (await page.textContent('#assignSheetTitle')) === 'שרה');

  // going back to add a second site must NOT advance - two sites in a day is normal
  await page.evaluate(() => openAssignSheet('w_01'));
  await page.waitForTimeout(250);
  await page.locator('.sheet-place').filter({ hasText: 'תל אביב' }).click();
  await page.waitForTimeout(250);
  check('a second site keeps the sheet on the same worker',
    (await page.textContent('#assignSheetTitle')) === 'דוד');
  check('and both sites are stored',
    (await page.evaluate(() => entriesFor(State.schedule, State.date, 'w_01', 'actual').length)) === 2);
  check('the rate control appears once a site is chosen',
    (await page.locator('.sheet-rate-row').count()) === 2);

  // rate is per site
  await page.locator('.sheet-rate-row').filter({ hasText: 'תל אביב' }).getByText('יום כפול').click();
  await page.waitForTimeout(250);
  const rates = await page.evaluate(() => entriesFor(State.schedule, State.date, 'w_01', 'actual')
    .map(e => `${e.placeId}:${e.rate || 'normal'}`).join());
  check('the rate lands on that site only', rates === 'p_01:normal,p_02:double', rates);

  await page.evaluate(() => { closeAssignSheet(); setDayMode('workers'); });
  await page.waitForTimeout(250);
  check('the worker row shows both sites',
    (await page.locator('.wrow').first().locator('.tag-place').count()) === 2);
  await page.context().close();
}

// ---------------------------------------------------------------- mode toggle
{
  const page = await open();
  await seedRoster(page);
  check('by-site is what the day opens on', (await page.locator('.site-card').count()) === 2);
  await page.getByText('לפי עובדים').click();
  await page.waitForTimeout(250);
  check('by-worker is one tap away', (await page.locator('.wrow').count()) === 3);

  // A way of working, not a decision to make every morning.
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(500);
  check('and the choice is still there on the next visit',
    (await page.evaluate(() => dayMode)) === 'workers' &&
    (await page.locator('.wrow').count()) === 3);

  await page.getByText('לפי אתרים').click();
  await page.waitForTimeout(250);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(500);
  check('switching back sticks too',
    (await page.locator('.site-card').count()) === 2);
  await page.context().close();
}

// ---------------------------------------------------------------- the detail sheet
{
  // The summary sheets answer "how much". A month later the question is "which days",
  // and by then nobody is reopening the app to scroll a fortnight.
  const page = await open();
  await seedRoster(page);
  await page.evaluate(() => {
    assignPlace(State.schedule, '2026-08-10', 'w_01', 'actual', 'p_01');
    assignPlace(State.schedule, '2026-08-10', 'w_01', 'actual', 'p_02', RATE_DOUBLE);
    assignPlace(State.schedule, '2026-08-11', 'w_01', 'actual', 'p_01', RATE_EXTRA, 2);
    markAbsent(State.schedule, '2026-08-12', 'w_01', 'actual');
    State.save();
    REPORT_RANGE.from = '2026-08-01';
    REPORT_RANGE.to = '2026-08-31';
  });
  await page.click('#tab-reports');
  await page.waitForTimeout(300);

  const detail = await page.evaluate(() => reportSheets().detail);
  check('the export carries a row per site worked, not just totals',
    detail.length === 5, JSON.stringify(detail.map(r => r.join('|'))));
  check('each row names the day, the worker and the site',
    detail[1][1] === 'שני' && detail[1][2] === 'דוד' && detail[1][3] === 'הרצליה',
    JSON.stringify(detail[1]));
  check('the rate of each site is spelled out rather than coded',
    detail[2][4] === 'יום כפול' && detail[3][4] === 'שעות נוספות', JSON.stringify(detail));
  check('an absence appears as a row, so a missing day is not ambiguous',
    detail[4][4] === 'נעדר');

  // the money column must be summable: a two-site day pays once
  const paid = detail.slice(1).map(row => Number(row[6]) || 0).reduce((a, b) => a + b, 0);
  check('summing the pay column gives exactly what the pay sheet says',
    paid === (await page.evaluate(() =>
      Math.round(payrollRows().find(r => r.workerId === 'w_01').amount))),
    `${paid}`);
  await page.context().close();
}

// ---------------------------------------------------------------- a day someone has left
{
  // The same failure as the week grid, and worse: a past day loses the row of anyone who
  // has since left, so their record cannot be seen or corrected - while the pay report
  // goes on counting it.
  const page = await open();
  await seedRoster(page);
  await page.evaluate(() => {
    assignPlace(State.schedule, '2026-08-12', 'w_01', 'actual', 'p_01', RATE_DOUBLE);
    assignPlace(State.schedule, '2026-08-12', 'w_02', 'actual', 'p_02');
    State.worker('w_01').active = false;
    State.save(); setDayMode('workers');
  });
  await page.waitForTimeout(300);

  check('a day still shows someone who has left but worked it',
    (await page.textContent('.worker-list')).includes('דוד'));
  check('and says they are no longer on the roster',
    (await page.locator('.wrow .badge').count()) === 1);
  check('their record is still editable, not just visible',
    (await page.locator('.wrow').first().locator('.tag-place').count()) === 1);

  check('but they are not counted as part of today\'s crew',
    (await page.textContent('.progress-line')).includes('1 מתוך 2'),
    await page.textContent('.progress-line'));

  await page.evaluate(() => { State.date = '2026-08-20'; render(); });
  await page.waitForTimeout(300);
  check('and a day they did not work does not list them',
    !(await page.textContent('.worker-list')).includes('דוד'));

  // and the pay report was always counting them - that is why the row has to be reachable
  const paid = await page.evaluate(() =>
    payrollReport(State.schedule, '2026-08-01', '2026-08-31')
      .find(row => row.workerId === 'w_01').attendanceDays);
  check('the pay report counts the day either way', paid === 1);
  await page.context().close();
}

// ---------------------------------------------------------------- the week as history
{
  // Archiving somebody used to remove them from weeks they had already worked. The record
  // underneath was intact, and the picture of that week silently stopped matching it.
  const page = await open();
  await seedRoster(page);
  await page.evaluate(() => {
    assignPlace(State.schedule, '2026-08-10', 'w_01', 'actual', 'p_01');
    assignPlace(State.schedule, '2026-08-10', 'w_02', 'actual', 'p_02');
    assignPlace(State.schedule, '2026-08-11', 'w_01', 'actual', 'p_01');
    markAbsent(State.schedule, '2026-08-11', 'w_02', 'actual');
    State.schedule.worker = null;
    State.save();
  });
  await page.click('#tab-week');
  await page.waitForTimeout(400);
  check('everyone on the roster has a row', (await page.locator('.week-table tbody tr').count()) === 3);

  await page.evaluate(() => {
    State.worker('w_01').active = false;      // left the crew
    State.save(); render();
  });
  await page.waitForTimeout(300);
  check('someone who has left still appears in the weeks they worked',
    (await page.locator('.week-table tbody tr').count()) === 3 &&
    (await page.textContent('.week-table tbody')).includes('דוד'));
  check('and is marked as no longer on the roster',
    (await page.locator('.week-table tbody .badge').count()) === 1);

  await page.evaluate(() => { setWeekFromDate('2026-09-07'); render(); });
  await page.waitForTimeout(300);
  check('but not in a week they did not work',
    (await page.locator('.week-table tbody tr').count()) === 2);

  await page.evaluate(() => { setWeekFromDate('2026-08-12'); render(); });
  await page.waitForTimeout(300);
  const totals = await page.locator('.week-table tfoot td')
    .evaluateAll(nodes => nodes.map(n => n.textContent.trim()));
  check('the week counts how many people were out each day',
    totals[4] === '2' && totals[5] === '1', JSON.stringify(totals));
  check('and an absence is not counted as a day worked',
    totals[5] === '1', JSON.stringify(totals));
  await page.context().close();
}

// ---------------------------------------------------------------- emptying a site
{
  // Building a site up name by name is the normal case; taking it apart one ✓ at a time
  // when the crew moved elsewhere is the same work twice.
  const page = await open();
  await seedRoster(page);
  await page.evaluate(() => {
    assignPlace(State.schedule, '2026-08-12', 'w_01', 'actual', 'p_01');
    assignPlace(State.schedule, '2026-08-12', 'w_02', 'actual', 'p_01');
    assignPlace(State.schedule, '2026-08-12', 'w_03', 'actual', 'p_02');
    State.save(); render();
    openWorkerPicker('p_01');
  });
  await page.waitForTimeout(250);

  await page.locator('#workerPickerModal').getByRole('button', { name: /רוקן אתר/ }).click();
  await page.waitForTimeout(250);
  check('emptying a site asks first, naming the site and the count',
    (await page.textContent('#askModal')).includes('הרצליה') &&
    (await page.textContent('#askModal')).includes('2'));

  await page.locator('#askOk').click();
  await page.waitForTimeout(300);
  check('everyone recorded at that site is removed',
    (await page.evaluate(() =>
      workersAtPlace(State.schedule, '2026-08-12', 'p_01', 'actual').length)) === 0);
  check('and the other site is untouched',
    (await page.evaluate(() =>
      workersAtPlace(State.schedule, '2026-08-12', 'p_02', 'actual').length)) === 1);

  await page.evaluate(() => { closeWorkerPicker(); render(); });
  await page.waitForTimeout(200);
  await page.locator('#undoBtn').click();
  await page.waitForTimeout(300);
  check('emptying a site is one press away from being taken back',
    (await page.evaluate(() =>
      workersAtPlace(State.schedule, '2026-08-12', 'p_01', 'actual').length)) === 2);
  await page.context().close();
}

// ---------------------------------------------------------------- the header undo
{
  // The bar expires after twelve seconds; the mistake is often noticed two names later.
  const page = await open();
  await seedRoster(page);
  await page.waitForTimeout(200);
  check('with nothing done yet the undo is dimmed, not hidden',
    (await page.locator('#undoBtn').isVisible()) &&
    (await page.locator('#undoBtn').isDisabled()));

  await page.evaluate(() => openAssignSheet('w_01'));
  await page.waitForTimeout(200);
  await page.locator('.sheet-place').filter({ hasText: 'הרצליה' }).click();
  await page.waitForTimeout(250);
  await page.evaluate(() => closeAssignSheet());
  await page.waitForTimeout(200);
  check('recording a site arms the undo',
    !(await page.locator('#undoBtn').isDisabled()));

  await page.evaluate(() => dismissUndoBar());
  await page.waitForTimeout(150);
  check('the bar can go without taking the undo with it',
    !(await page.locator('#undoBar').isVisible()) &&
    !(await page.locator('#undoBtn').isDisabled()));

  check('the buttons say what they do rather than leaving an arrow to be guessed at',
    (await page.textContent('#undoBtn')).includes('בטל') &&
    (await page.textContent('#redoBtn')).includes('שוב'));

  await page.locator('#undoBtn').click();
  await page.waitForTimeout(250);
  check('and it still undoes the right thing long after the bar is gone',
    (await page.evaluate(() =>
      entriesFor(State.schedule, '2026-08-12', 'w_01', 'actual').length)) === 0);
  check('then goes quiet again',
    await page.locator('#undoBtn').isDisabled());

  // Undo on a phone shows a screen much like the one before it. If it undid the wrong
  // thing, redo is the only way back to the edit that was just thrown away.
  check('undoing arms the way forward',
    !(await page.locator('#redoBtn').isDisabled()));
  await page.locator('#redoBtn').click();
  await page.waitForTimeout(250);
  check('and redo puts the record back exactly as the edit left it',
    (await page.evaluate(() =>
      entriesFor(State.schedule, '2026-08-12', 'w_01', 'actual').length)) === 1);
  check('after which there is nothing further forward',
    await page.locator('#redoBtn').isDisabled());
  check('while the way back is open again',
    !(await page.locator('#undoBtn').isDisabled()));

  // changing day must forget it: the undo restores into the day it was made on
  await page.evaluate(() => { openAssignSheet('w_01'); });
  await page.waitForTimeout(200);
  await page.locator('.sheet-place').first().click();
  await page.waitForTimeout(250);
  await page.evaluate(() => { closeAssignSheet(); stepDay(-1); });
  await page.waitForTimeout(250);
  check('stepping to another day clears it rather than aiming it at the wrong date',
    (await page.locator('#undoBtn').isDisabled()) &&
    (await page.locator('#redoBtn').isDisabled()));

  // The two other ways of leaving a day used to keep the undo armed - and the header ↶
  // then silently rewrote the day just left while the screen showed nothing at all.
  await page.evaluate(() => {
    openAssignSheet('w_01');
  });
  await page.waitForTimeout(200);
  await page.locator('.sheet-place').first().click();
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    closeAssignSheet();
    const picker = document.getElementById('dayPicker');
    picker.value = '2026-08-05';
    picker.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(250);
  check('the date picker clears it too',
    await page.locator('#undoBtn').isDisabled());

  await page.evaluate(() => {
    openAssignSheet('w_01');
  });
  await page.waitForTimeout(200);
  await page.locator('.sheet-place').first().click();
  await page.waitForTimeout(250);
  await page.evaluate(() => closeAssignSheet());
  await page.locator('.btn-today').click();
  await page.waitForTimeout(250);
  check('and so does the today button',
    await page.locator('#undoBtn').isDisabled());
  await page.context().close();
}

// ---------------------------------------------------------------- the day name fits
{
  // Reported from a phone with a screenshot: "יום ראשון" broken across two lines and
  // lying on top of the buttons beside it. Six controls shared that row - the ☰, undo,
  // redo, both arrows and the date - which left the day name about sixty pixels, and an
  // unbreakable Hebrew word given sixty pixels does not fold, it spills sideways.
  //
  // Checked on every day of the week, because the names are not the same length and the
  // one that broke is not the one anybody would test by hand.
  for (const width of [320, 360, 390, 430]) {
    const page = await open({ viewport: { width, height: 800 } });
    await seedRoster(page);

    for (const date of ['2026-08-23', '2026-08-24', '2026-08-25', '2026-08-26',
                        '2026-08-27', '2026-08-28', '2026-08-29']) {
      const seen = await page.evaluate(d => {
        State.date = d;
        render();
        const name = document.querySelector('.day-label strong');
        const box = name.getBoundingClientRect();
        const near = [...document.querySelectorAll('.day-nav > *')]
          .filter(node => !node.contains(name))
          .map(node => node.getBoundingClientRect());
        return {
          text: name.textContent,
          // scrollWidth past clientWidth is the word being cut; the ellipsis backstop
          // catches the spill, but a shortened day name is still a failure.
          cut: name.scrollWidth > name.clientWidth + 1,
          lines: Math.round(box.height / parseFloat(getComputedStyle(name).lineHeight || 24)),
          over: near.some(other => box.right > other.left + 1 && box.left < other.right - 1)
        };
      }, date);

      check(`${seen.text} fits whole at ${width}px`, !seen.cut, JSON.stringify(seen));
      check(`${seen.text} does not lie over a button at ${width}px`, !seen.over, JSON.stringify(seen));
    }

    const wide = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth,
      viewport: window.innerWidth
    }));
    check(`and the header does not widen the page at ${width}px`,
      wide.page <= wide.viewport + 1, JSON.stringify(wide));

    await page.context().close();
  }
}

// ---------------------------------------------------------------- notices that go away
{
  // A notice that cannot be put away is read once and then looked past for good - and
  // both of these have to keep working on the day they actually matter.
  const page = await open();
  await seedRoster(page);
  await page.evaluate(() => {
    todayStr = () => '2026-08-12';
    State.date = '2026-08-12';
    assignPlace(State.schedule, '2026-08-12', 'w_01', 'actual', 'p_01');
    State.save(); render();
  });
  await page.waitForTimeout(300);
  check('the account notice is there when something is outstanding',
    await page.locator('#accountBanner').isVisible());

  await page.locator('#accountBanner').getByRole('button', { name: /הסתר/ }).click();
  await page.waitForTimeout(250);
  check('and it can be put away',
    !(await page.locator('#accountBanner').isVisible()));

  await page.evaluate(() => render());
  await page.waitForTimeout(250);
  check('it stays away for the rest of the day rather than coming back on every render',
    !(await page.locator('#accountBanner').isVisible()));

  // but a DIFFERENT warning on the same day still gets through
  await page.evaluate(() => { todayStr = () => '2026-08-20'; State.date = '2026-08-20'; render(); });
  await page.waitForTimeout(250);
  check('while a new warning is not silenced by yesterday\'s dismissal',
    await page.locator('#accountBanner').isVisible());

  // the crash banner: it names the error, and it closes
  await page.evaluate(() => {
    window.dispatchEvent(new ErrorEvent('error', { message: 'boom: something specific' }));
  });
  await page.waitForTimeout(300);
  check('a crash says what actually broke, not only that something did',
    (await page.textContent('#crashBanner')).includes('boom: something specific'),
    await page.textContent('#crashBanner'));
  await page.locator('#crashBanner').getByRole('button', { name: 'סגור' }).click();
  await page.waitForTimeout(200);
  check('and it can be dismissed without reloading',
    !(await page.locator('#crashBanner').isVisible()));
  await page.context().close();
}

// ---------------------------------------------------------------- no accidental zoom
{
  const page = await open();
  const viewport = await page.getAttribute('meta[name="viewport"]', 'content');
  check('the page refuses to zoom under a stray pinch',
    viewport.includes('maximum-scale=1') && viewport.includes('user-scalable=no'), viewport);

  await seedRoster(page);
  await page.evaluate(() => {
    assignPlace(State.schedule, '2026-08-12', 'w_01', 'actual', 'p_01');
    State.save(); render(); openAssignSheet('w_01');
  });
  await page.waitForTimeout(250);
  await page.locator('.sheet-rate-row').first().getByText('שעות נוספות').click();
  await page.waitForTimeout(250);

  // 16px is the threshold below which iOS magnifies the whole page on focus
  const sizes = await page.evaluate(() =>
    [...document.querySelectorAll('input, select')]
      .filter(node => node.offsetParent !== null)
      .map(node => ({ id: node.className || node.type, px: parseFloat(getComputedStyle(node).fontSize) })));
  check('and every field on screen is at or above the size that triggers it',
    sizes.every(item => item.px >= 16), JSON.stringify(sizes));
  await page.context().close();
}

// ---------------------------------------------------------------- damaged save file
{
  // The newest copy of the record is the one that just failed to parse. The old recovery
  // path read v1 instead and then SAVED over the damaged blob, destroying the only copy
  // of every day added since the migration - and said nothing at all about it.
  const page = await open();
  await page.evaluate(() => {
    localStorage.setItem('scheduleData', JSON.stringify({
      workers: [{ id: 'w_01', name: 'דוד' }], places: [{ id: 'p_01', name: 'הרצליה' }],
      weekStartDate: '2026-08-07', assignments: []
    }));
    localStorage.setItem('scheduleData:v2', '{"workers":[{"id":"w_01","name":"דוד"}],,BROKEN');
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(600);

  const kept = await page.evaluate(() => ({
    copy: localStorage.getItem('scheduleData:v2:damaged'),
    v2: localStorage.getItem('scheduleData:v2'),
    workers: State.schedule.workers.length,
    blocked: farkadWritesBlocked()
  }));
  check('an unreadable save file is copied somewhere safe',
    typeof kept.copy === 'string' && kept.copy.includes('BROKEN'),
    JSON.stringify({ copy: (kept.copy || '').slice(0, 30) }));

  // This used to assert the OPPOSITE - that the v1 fallback was saved over the damaged
  // blob, leaving the raw bytes only in the second copy. That copy was written with
  // `optional: true` and its result was never looked at, so on a full device it failed
  // and the save succeeded: the recovery destroyed the thing it was recovering.
  check('and the damaged original is left exactly where it was',
    typeof kept.v2 === 'string' && kept.v2.includes('BROKEN'),
    JSON.stringify((kept.v2 || '').slice(0, 30)));
  check('the older readable data is on screen, so the week can still be read',
    kept.workers === 1, String(kept.workers));
  check('but writing is stopped, so nothing can be saved over it',
    kept.blocked === true);
  check('the person is told the file was damaged rather than left to guess',
    (await page.textContent('#askModal')).includes('נפגם'));

  // And the banner offers the way to get the raw bytes off the phone.
  await page.click('#askOk');
  await page.waitForTimeout(300);
  // Scoped to the buttons: the banner's own sentence also contains the word, so a plain
  // getByText matches two things and the count is not what it looks like.
  check('a banner offers the raw export',
    (await page.locator('#recoveryBanner').isVisible())
    && (await page.locator('#recoveryBanner button').filter({ hasText: 'ייצא' }).count()) === 1,
    await page.textContent('#recoveryBanner'));
  check('and a way to resume once it has been taken',
    (await page.locator('#recoveryBanner button').filter({ hasText: 'הבנתי' }).count()) === 1);

  await page.locator('#recoveryBanner button').filter({ hasText: 'הבנתי' }).click();
  await page.waitForTimeout(200);
  check('acknowledging resumes recording, the copy having been confirmed',
    (await page.evaluate(() => farkadWritesBlocked())) === false);
  await page.context().close();
}

// ---------------------------------------------------------------- an undated v1 week
{
  // A hand-typed week field used to throw inside the migration, and the throw escaped
  // every issue-reporting path: the app came up blank with no message, while the whole
  // record sat untouched in the old key.
  const page = await open();
  await page.evaluate(() => {
    localStorage.removeItem('scheduleData:v2');
    localStorage.setItem('scheduleData', JSON.stringify({
      workers: [{ id: 'w_01', name: 'דוד' }],
      places: [{ id: 'p_01', name: 'הרצליה' }],
      weekStartDate: 'שבוע 32',
      assignments: [{ index: 0, value: 'הרצליה' }]
    }));
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(600);

  const migrated = await page.evaluate(() => ({
    workers: State.schedule.workers.length,
    issues: State.migrationIssues.map(issue => issue.kind),
    days: Object.keys(State.schedule.days)
  }));
  check('a week with an unreadable date still migrates the roster',
    migrated.workers === 1, JSON.stringify(migrated));
  check('and says why the assignments could not be placed',
    migrated.issues.includes('no-week-date'), JSON.stringify(migrated));
  check('rather than filing them under a date nobody will look at',
    migrated.days.length === 0, JSON.stringify(migrated));

  // the constructor's forgiveness is the danger: 'שבוע 32' parses as 1 Jan 2032
  const loose = await page.evaluate(() => [
    String(parseLocalDate('שבוע 32')),
    String(parseLocalDate('לא ידוע')),
    String(parseLocalDate('2026-08-14')).slice(0, 15)
  ]);
  check('a label that is not a date is refused, not read as a year',
    loose[0] === 'null' && loose[1] === 'null', JSON.stringify(loose));
  check('while a real date still parses',
    loose[2] === 'Fri Aug 14 2026', JSON.stringify(loose));
  await page.context().close();
}

// ---------------------------------------------------------------- a full device
{
  // Storage that is FULL is not storage that is blocked: everything already written is
  // still there and still readable, and it accepts writes again once something is
  // deleted. Treating the two alike sent the rest of the evening's work to memory, where
  // the next refresh ended it.
  const page = await open();
  await seedRoster(page);

  const result = await page.evaluate(() => {
    // an old restore point, big enough that dropping it is what makes room
    Store.set('scheduleData:snap:2020-01-01', 'o'.repeat(400 * 1024));

    // then fill the rest of the quota, in small pieces so it ends up close to the brim
    let filled = 0;
    try {
      for (let i = 0; i < 400; i++) { localStorage.setItem('junk:' + i, 'x'.repeat(64 * 1024)); filled++; }
    } catch (error) { /* full, which is the point */ }

    const wrote = Store.set('scheduleData:probe', 'p'.repeat(300 * 1024));
    return {
      filled,
      wrote,
      stillAvailable: Store.available,
      full: Store.full,
      snapshotGone: Store.get('scheduleData:snap:2020-01-01') === null
    };
  });

  check('running out of space does not declare storage dead',
    result.stillAvailable === true, JSON.stringify(result));
  check('an old restore point is dropped to make room for the record',
    result.wrote === true && result.snapshotGone === true, JSON.stringify(result));

  // now fill it with nothing expendable left
  const stuck = await page.evaluate(() => {
    const junk = 'x'.repeat(256 * 1024);
    try {
      for (let i = 200; i < 400; i++) localStorage.setItem('junk:' + i, junk);
    } catch (error) { /* full again */ }
    const wrote = Store.set('scheduleData:probe2', 'y'.repeat(400 * 1024));
    return { wrote, full: Store.full, available: Store.available };
  });
  check('when nothing can be freed the write is reported as failed, not silently lost',
    stuck.wrote === false && stuck.full === true && stuck.available === true,
    JSON.stringify(stuck));
  check('and the notice says the device is full rather than blocking',
    (await page.textContent('#storageNotice')).includes('אין מקום פנוי'),
    await page.textContent('#storageNotice'));

  // a failed save is the one thing that must not hide under the fold
  check('a failed save is announced in a banner, not only in the grey line',
    (await page.locator('#storageBanner').isVisible()) &&
    (await page.textContent('#storageBanner')).includes('אין מקום פנוי'));
  check('and the banner offers the backup that rescues the day',
    (await page.locator('#storageBanner').getByText('שמור גיבוי').count()) === 1);

  // an optional write must not buy its own space by eating the restore points
  const optional = await page.evaluate(() => {
    Store.set('scheduleData:snap:2021-01-01', 'a'.repeat(80 * 1024));
    Store.set('scheduleData:snap:2021-01-02', 'b'.repeat(80 * 1024));
    const before = snapshotDates().length;
    const wrote = Store.set('scheduleData:snap:2021-06-06', 'c'.repeat(400 * 1024), { optional: true });
    return { before, wrote, after: snapshotDates().length };
  });
  check('an optional write that will not fit is refused, not paid for with older copies',
    optional.wrote === false && optional.after === optional.before,
    JSON.stringify(optional));

  await page.evaluate(() => {
    Object.keys(localStorage).filter(k => k.startsWith('junk:') || k.startsWith('scheduleData:probe'))
      .forEach(k => localStorage.removeItem(k));
    Store.set('scheduleData:cleanup', '1');
  });
  check('and it clears itself once there is room again',
    (await page.evaluate(() => Store.full)) === false);
  await page.context().close();
}

// ---------------------------------------------------------------- the whole crew, one tap
{
  // The commonest day of all: everyone in one place. That day is one tap.
  const page = await open();
  await seedRoster(page);

  check('the bulk row offers every site as a chip',
    (await page.locator('.bulk-row .bulk-chip').count()) === 2);
  check('and says how many people it will write',
    (await page.textContent('.bulk-label')).includes('3'));

  // one already recorded by hand - the bulk tap must not touch them
  await page.evaluate(() => {
    State.commit(assignPlace(State.schedule, '2026-08-12', 'w_02', 'actual', 'p_02'));
  });
  await page.waitForTimeout(250);

  await page.locator('.bulk-chip').first().click();
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({
    one: entriesFor(State.schedule, '2026-08-12', 'w_01', 'actual').map(e => e.placeId),
    two: entriesFor(State.schedule, '2026-08-12', 'w_02', 'actual').map(e => e.placeId),
    three: entriesFor(State.schedule, '2026-08-12', 'w_03', 'actual').map(e => e.placeId)
  }));
  check('one tap records everyone still unrecorded',
    after.one[0] === 'p_01' && after.three[0] === 'p_01', JSON.stringify(after));
  check('and never touches someone already recorded',
    after.two.join() === 'p_02', JSON.stringify(after));
  check('the row disappears once there is nobody left for it',
    (await page.locator('.bulk-row').count()) === 0);

  // one press takes the whole thing back
  check('the undo bar offers the whole tap back',
    (await page.textContent('#undoBar')).includes('2 עובדים'));
  await page.locator('#undoBar').getByRole('button', { name: 'בטל' }).click();
  await page.waitForTimeout(300);
  const undone = await page.evaluate(() => ({
    one: entriesFor(State.schedule, '2026-08-12', 'w_01', 'actual').length,
    two: entriesFor(State.schedule, '2026-08-12', 'w_02', 'actual').length
  }));
  check('undo clears exactly the people the tap wrote',
    undone.one === 0 && undone.two === 1, JSON.stringify(undone));

  // with one person left the chips would be noise next to their row
  await page.evaluate(() => {
    State.commit(assignPlace(State.schedule, '2026-08-12', 'w_01', 'actual', 'p_01'));
  });
  await page.waitForTimeout(250);
  check('a single remaining worker does not get a bulk row',
    (await page.locator('.bulk-row').count()) === 0);
  await page.context().close();
}

// ---------------------------------------------------------------- the sheet on a keyboard
{
  // Three people around one screen in the evening. On a keyboard the sheet was
  // Tab-Tab-Tab-Enter per worker; a digit is the whole interaction.
  const page = await open();
  await seedRoster(page);
  await page.evaluate(() => openAssignSheet('w_01'));
  await page.waitForTimeout(250);

  await page.keyboard.press('2');
  await page.waitForTimeout(300);
  check('a digit picks the site in that position',
    (await page.evaluate(() =>
      entriesFor(State.schedule, '2026-08-12', 'w_01', 'actual')[0].placeId)) === 'p_02');
  check('and the sheet moves on to the next name by itself',
    (await page.evaluate(() => sheetWorkerId)) === 'w_02');

  await page.keyboard.press('1');
  await page.waitForTimeout(300);
  check('so a roster is a run of single keystrokes',
    (await page.evaluate(() =>
      entriesFor(State.schedule, '2026-08-12', 'w_02', 'actual')[0].placeId)) === 'p_01');

  // a digit with no site behind it does nothing at all
  await page.keyboard.press('9');
  await page.waitForTimeout(200);
  check('a number past the end of the list is ignored',
    (await page.evaluate(() =>
      entriesFor(State.schedule, '2026-08-12', 'w_03', 'actual').length)) === 0);

  // filling the last one closes the sheet by itself, which is the existing behaviour
  await page.keyboard.press('1');
  await page.waitForTimeout(300);
  check('and the sheet closes itself when nobody is left',
    !(await page.locator('#assignSheet').isVisible()));

  // typing hours must never be read as a shortcut
  await page.evaluate(() => openAssignSheet('w_03'));
  await page.waitForTimeout(250);
  await page.locator('.sheet-rate-row').first().getByText('שעות נוספות').click();
  await page.waitForTimeout(250);
  await page.locator('.rate-hours').first().fill('2');
  await page.waitForTimeout(250);
  check('typing a number into the hours field is not a site shortcut',
    (await page.evaluate(() =>
      entriesFor(State.schedule, '2026-08-12', 'w_03', 'actual').length)) === 1);

  await page.evaluate(() => closeAssignSheet());
  await page.waitForTimeout(200);
  await page.keyboard.press('1');
  await page.waitForTimeout(200);
  check('and the shortcut stops working once the sheet is closed',
    (await page.evaluate(() => State.unrecorded().length)) === 0);
  await page.context().close();
}

// ---------------------------------------------------------------- restore points
{
  // The failures that lose a fortnight are quiet: a bad import noticed two days later, a
  // run of edits made on the wrong date. Those need a copy from before the day it began.
  const page = await open();
  await seedRoster(page);
  await page.evaluate(() => {
    assignPlace(State.schedule, '2026-08-12', 'w_01', 'actual', 'p_01');
    State.save();
  });

  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(500);
  check('opening the app leaves a dated restore point behind',
    (await page.evaluate(() => snapshotDates().length)) === 1);

  const before = await page.evaluate(() => snapshotDates()[0]);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(400);
  check('opening it again the same day does not overwrite it with the newer state',
    (await page.evaluate(() => snapshotDates().length)) === 1 &&
    (await page.evaluate(() => snapshotDates()[0])) === before);

  // now lose the day, the way an accident does
  await page.evaluate(() => {
    State.schedule.workers = [];
    State.schedule.days = {};
    State.save(); render();
  });
  await page.click('#tab-roster');
  await page.waitForTimeout(300);
  check('the restore point is offered where the backups are',
    (await page.locator('#restorePoints button').count()) === 1);

  await page.locator('#restorePoints button').first().click();
  await page.waitForTimeout(300);
  await page.click('#askOk');
  await page.waitForTimeout(400);
  check('restoring brings the roster and the recorded days back',
    (await page.evaluate(() => State.schedule.workers.length)) === 3 &&
    (await page.evaluate(() =>
      entriesFor(State.schedule, '2026-08-12', 'w_01', 'actual').length)) === 1);
  await page.click('#askOk');
  await page.waitForTimeout(200);

  // A restore whose cloud write failed used to say "שוחזר." all the same. That is the
  // worst thing this app can print: the person stops looking, and the next snapshot from
  // another phone puts the old state back on the very device that asked for the restore.
  await page.evaluate(() => {
    FarkadSync.adapter = {
      update: () => Promise.resolve(),
      save: () => Promise.reject(Object.assign(new Error('permission denied'),
        { code: 'permission-denied' })),
      subscribe: () => () => {}
    };
    FarkadSync.setStatus('synced');
    State.schedule.workers = [];
    State.save(); render();
  });
  await page.click('#tab-roster');
  await page.waitForTimeout(300);
  await page.locator('#restorePoints button').first().click();
  await page.waitForTimeout(300);
  await page.click('#askOk');
  await page.waitForTimeout(600);

  const told = await page.textContent('#askMessage');
  check('a restore the cloud refused does not report plain success',
    !/^שוחזר\.$/.test((await page.textContent('#askTitle')) || ''), JSON.stringify(told));
  check('it says the other devices have not got it yet',
    told.includes('עדיין לא הגיע לענן'), JSON.stringify(told));
  check('and the restore is written down so it can still go out',
    (await page.evaluate(() => FarkadSync.pendingReplace() !== null)));
  check('while the restored state is what is on this device',
    (await page.evaluate(() => State.schedule.workers.length)) === 3);
  await page.click('#askOk');
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    FarkadSync.forgetReplace();
    FarkadSync.adapter = null;
    FarkadSync.setStatus('off');
  });

  // No room to write the way back. Going ahead would leave the person holding the state
  // they restored, no route to the one they had, and nothing saying so until they look.
  const noRoom = await page.evaluate(async () => {
    const before = Store.get('scheduleData:v2');
    const realSet = Store.set.bind(Store);
    Store.set = (key, value, options) =>
      (String(key).startsWith('scheduleData:undo') || key === 'scheduleData:v2backup'
        ? false
        : realSet(key, value, options));

    const date = snapshotDates()[0];
    const restoring = restoreSnapshot(date);
    await new Promise(done => setTimeout(done, 250));
    document.getElementById('askOk').click();
    await restoring;

    Store.set = realSet;
    return { before, after: Store.get('scheduleData:v2'), told: document.getElementById('askMessage').textContent };
  });
  check('a restore with nowhere to put the way back does not happen',
    noRoom.before === noRoom.after);
  check('and says why, rather than reporting a restore',
    noRoom.told.includes('לא שינינו כלום'), JSON.stringify(noRoom.told.slice(0, 80)));
  await page.click('#askOk');
  await page.waitForTimeout(200);

  // The other half, and the one the previous round did not cover: the way back writes
  // FINE and the restored state is what cannot be stored. Going ahead there leaves the
  // restored week on the screen and the old one on the disk - a restore that looks like
  // it worked until the app is closed.
  const newStateFails = await page.evaluate(async () => {
    const before = Store.get('scheduleData:v2');
    const onScreen = Object.keys(State.schedule.days).join();
    const realSet = Store.set.bind(Store);
    Store.set = (key, value, options) =>
      (key === 'scheduleData:v2' ? false : realSet(key, value, options));

    const restoring = restoreSnapshot(snapshotDates()[0]);
    await new Promise(done => setTimeout(done, 250));
    document.getElementById('askOk').click();
    await restoring;

    Store.set = realSet;
    return {
      same: Store.get('scheduleData:v2') === before,
      screen: Object.keys(State.schedule.days).join() === onScreen,
      told: document.getElementById('askMessage').textContent
    };
  });
  check('a restore whose new state cannot be stored does not happen either',
    newStateFails.same);
  check('and the screen is put back rather than showing a restore that is not stored',
    newStateFails.screen);
  check('with a message that says nothing changed',
    newStateFails.told.includes('לא שינינו כלום'),
    JSON.stringify(newStateFails.told.slice(0, 80)));
  await page.click('#askOk');
  await page.waitForTimeout(200);

  // And the third: the retry record itself cannot be written. That record is what makes a
  // restore survivable - with it on the disk, a restore whose cloud write fails is re-sent
  // by the next session; without it the restore exists only on this screen, and the next
  // older snapshot from another phone finishes undoing it. So the restore must not start.
  const noRetryRecord = await page.evaluate(async () => {
    const saves = [];
    FarkadSync.adapter = {
      update: () => Promise.resolve(),
      save: data => { saves.push(data); return Promise.resolve(); },
      subscribe: () => () => {}
    };
    FarkadSync.setStatus('synced');

    const before = Store.get('scheduleData:v2');
    const realSet = Store.set.bind(Store);
    Store.set = (key, value, options) =>
      (key === 'farkad:pendingReplace' ? false : realSet(key, value, options));

    const restoring = restoreSnapshot(snapshotDates()[0]);
    await new Promise(done => setTimeout(done, 250));
    document.getElementById('askOk').click();
    await restoring;

    Store.set = realSet;
    const result = {
      same: Store.get('scheduleData:v2') === before,
      cloudCalls: saves.length,
      pending: Store.get('farkad:pendingReplace'),
      told: document.getElementById('askMessage').textContent
    };
    FarkadSync.adapter = null;
    FarkadSync.setStatus('off');
    return result;
  });
  check('a restore with nowhere to record the retry does not start',
    noRetryRecord.same);
  check('and the cloud is never asked to save',
    noRetryRecord.cloudCalls === 0, String(noRetryRecord.cloudCalls));
  check('nothing claims a restore is waiting',
    noRetryRecord.pending === null, String(noRetryRecord.pending));
  check('and the reason names the retry record',
    noRetryRecord.told.includes('ממתין לשליחה'),
    JSON.stringify(noRetryRecord.told.slice(0, 90)));
  await page.click('#askOk');
  await page.waitForTimeout(200);

  // three days kept, not every day since the app was installed. The boot snapshot is
  // dated with the REAL today, so it is cleared first: leaving it in made this check
  // pass or fail depending on the date the suite was run on, and on 20/08 the stand-in
  // today below collided with it and took the whole assertion with it.
  const kept = await page.evaluate(() => {
    snapshotDates().forEach(date => Store.remove('scheduleData:snap:' + date));
    ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04'].forEach(date =>
      Store.set('scheduleData:snap:' + date, JSON.stringify(State.schedule)));
    todayStr = () => '2026-08-20';
    takeDailySnapshot();
    return snapshotDates();
  });
  check('only the newest three restore points are kept',
    kept.length === 3 && kept[0] === '2026-08-20', JSON.stringify(kept));
  await page.context().close();
}

// ------------------------------------------------- what a half-finished restore says
//
// G16.6. Four screens perform a whole-document restore, and every one of them reports
// the outcome through tellRestoreResult. What must never come out of any of them is the
// plain "done" line over a transaction that has not finished.
//
// Every failure below is produced by breaking the thing that actually breaks - a write
// the disk refuses, a delete it will not perform, a request that has not answered - and
// not by standing in for replaceEverything with a function that returns a shape. A stub
// proves the sentence the app would print IF the transaction stopped there; it proves
// nothing about whether it stops there.
{
  const page = await open();
  await seedRoster(page);
  await page.click('#tab-roster');
  await page.waitForTimeout(300);

  // Everything the four doors read from, and a cloud that answers.
  //
  // The restore point is FROZEN - written out here rather than taken from
  // State.schedule - so that what these tests restore is a fixed document and not
  // whatever today's builder happens to produce.
  const RESTORE_POINT = JSON.stringify({
    schemaVersion: 2,
    workers: [{ id: 'w_01', name: 'דוד', idNumber: '111', phone: '050-1', active: true,
      dailyRate: 400, hourlyRate: 50 }],
    places: [{ id: 'p_01', name: 'הרצליה', active: true }],
    days: { '2026-07-01': { plan: {}, actual: { w_01: { entries: [{ placeId: 'p_01' }] } } } },
    advances: {},
    updatedAt: '2026-07-01T06:00:00.000Z',
    updatedBy: 'd_backup'
  });

  // Re-installed after every reload: a page that navigates loses everything on window,
  // and the reopen cycles below are real reloads.
  const installHelpers = () => page.evaluate(([restorePoint]) => {
    window.__cloud = { saves: [], updates: [], hold: null, doc: null };
    window.__installCloud = () => {
      FarkadSync.adapter = {
        update(patch) {
          window.__cloud.updates.push(patch);
          return window.__cloud.hold || Promise.resolve();
        },
        save(data) {
          window.__cloud.saves.push(data);
          return Promise.resolve();
        },
        subscribe() { return () => {}; }
      };
      FarkadSync.setStatus('synced');
    };
    window.__removeCloud = () => {
      FarkadSync.adapter = null;
      FarkadSync.setStatus('off');
    };

    // A clean slate between cases: the record, the queue, the way back, the restore
    // point, and whatever the last case left in Store's session cache.
    window.__reset = () => {
      FarkadSync.forgetReplace();
      FarkadSync._replace = null;
      FarkadSync.replaceDamaged = false;
      FarkadSync.replaceHeld = false;
      FarkadSync.clearOutbox();
      FarkadSync._cloudChain = null;
      FarkadSync._cloudOpen = 0;
      FarkadSync.stuckMs = 30000;
      window.__cloud.saves.length = 0;
      window.__cloud.updates.length = 0;
      window.__cloud.hold = null;
      Store.remove('scheduleData:undoStack');
      Store.remove('scheduleData:v2backup');
      Store.set('scheduleData:snap:2026-08-01', restorePoint);
      Store.set('scheduleData:undoStack', JSON.stringify(
        [{ at: '2026-08-01T06:00:00.000Z', schedule: restorePoint }]));
      window.__archive = JSON.parse(restorePoint);
      FarkadSync.archiveRead = () => Promise.resolve(window.__archive);
    };
    window.__restorePoint = restorePoint;
  }, [RESTORE_POINT]);

  await installHelpers();

  // Runs one door with one real fault installed, and reports exactly what the app said
  // and what it did.
  const attempt = async (door, fault) => {
    const state = await page.evaluate(async ([door, fault]) => {
      window.__reset();
      if (fault !== 'no-cloud') window.__installCloud();
      else window.__removeCloud();

      const realSet = Store.set.bind(Store);
      const realRemove = Store.remove.bind(Store);
      const refuse = test => {
        Store.set = (key, value, options) =>
          (test(String(key), String(value)) ? false : realSet(key, value, options));
      };

      // A day recorded before the restore, so a prune has something to supersede.
      State.commit(assignPlace(State.schedule, '2026-08-18', 'w_02', 'actual', 'p_02'));

      if (fault === 'prepare') refuse(key => key === 'farkad:pendingReplace');
      if (fault === 'local-save') refuse(key => key === 'scheduleData:v2');
      if (fault === 'queue-prune') refuse(key => key.indexOf('farkad:outbox') === 0);
      if (fault === 'finalize') {
        refuse((key, value) =>
          key === 'farkad:pendingReplace' && value.indexOf('"cancelled"') !== -1);
        Store.remove = key => (key === 'farkad:pendingReplace' ? undefined : realRemove(key));
      }
      if (fault === 'ordering') {
        // A write that was started first and has not answered. The restore must not
        // overtake it, and must not report itself done while it has not.
        FarkadSync.stuckMs = 60;
        window.__cloud.hold = new Promise(() => {});
        FarkadSync.flush();
        await new Promise(done => setTimeout(done, 150));
      }
      if (fault === 'malformed') {
        const rubbish = JSON.stringify({ workers: [], places: [] });
        Store.set('scheduleData:snap:2026-08-01', rubbish);
        Store.set('scheduleData:undoStack', JSON.stringify(
          [{ at: '2026-08-01T06:00:00.000Z', schedule: rubbish }]));
        window.__archive = JSON.parse(rubbish);
      }
      if (fault === 'unparseable') {
        Store.set('scheduleData:snap:2026-08-01', '{"workers":[');
      }

      const before = {
        disk: localStorage.getItem('scheduleData:v2'),
        queue: localStorage.getItem(FarkadSync.activeOutboxKey()),
        undo: localStorage.getItem('scheduleData:undoStack'),
        saves: window.__cloud.saves.length
      };

      let running;
      if (door === 'restore point') running = restoreSnapshot('2026-08-01');
      else if (door === 'cloud copy') running = restoreFromCloud('2026-08-01');
      else if (door === 'way back') running = restoreLocalBackup();
      else {
        running = importBackup({
          target: {
            value: 'x',
            files: [new File([window.__restorePoint], 'b.json', { type: 'application/json' })]
          }
        });
      }

      // Two dialogs at most: the "are you sure", then the result. Clicking OK on a modal
      // that is not open would dismiss the result before it could be read.
      for (let i = 0; i < 2; i += 1) {
        await new Promise(done => setTimeout(done, 250));
        const modal = document.getElementById('askModal');
        const isResult = document.getElementById('askCancel').style.display === 'none';
        if (modal.style.display !== 'none' && !isResult) document.getElementById('askOk').click();
      }
      await running;
      await new Promise(done => setTimeout(done, 200));

      const modal = document.getElementById('askModal');
      const said = {
        visible: modal.style.display !== 'none',
        title: document.getElementById('askTitle').textContent,
        message: document.getElementById('askMessage').textContent
      };
      document.getElementById('askOk').click();

      Store.set = realSet;
      Store.remove = realRemove;

      return {
        said,
        before,
        screen: Object.keys(State.schedule.days).sort().join(),
        disk: localStorage.getItem('scheduleData:v2'),
        diskDays: Object.keys(
          JSON.parse(localStorage.getItem('scheduleData:v2') || '{}').days || {}).sort().join(),
        queue: localStorage.getItem(FarkadSync.activeOutboxKey()),
        undo: localStorage.getItem('scheduleData:undoStack'),
        pending: localStorage.getItem('farkad:pendingReplace'),
        pendingRead: FarkadSync.pendingReplace() !== null,
        queued: FarkadSync.pendingPaths(),
        saves: window.__cloud.saves.length,
        status: FarkadSync.status
      };
    }, [door, fault]);
    await page.waitForTimeout(150);
    return state;
  };

  const DOORS = ['restore point', 'cloud copy', 'way back', 'imported file'];
  const SUCCESS_LINES = ['שוחזר.', 'שוחזר מהענן.', 'הגיבוי נטען.'];

  // ---------------------------------------------------------- malformed, at every door
  for (const door of DOORS) {
    const fault = door === 'imported file' ? 'malformed-import' : 'malformed';
    if (fault === 'malformed-import') {
      // The import reads the file itself, so the malformed one is handed to it directly.
      const said = await page.evaluate(async () => {
        window.__reset();
        window.__installCloud();
        const before = localStorage.getItem('scheduleData:v2');
        const running = importBackup({
          target: {
            value: 'x',
            files: [new File([JSON.stringify({ workers: [], places: [] })], 'b.json',
              { type: 'application/json' })]
          }
        });
        await new Promise(done => setTimeout(done, 400));
        const modal = document.getElementById('askModal');
        const told = {
          visible: modal.style.display !== 'none',
          title: document.getElementById('askTitle').textContent,
          message: document.getElementById('askMessage').textContent
        };
        document.getElementById('askOk').click();
        await new Promise(done => setTimeout(done, 200));
        await running;
        return { told, same: localStorage.getItem('scheduleData:v2') === before,
          pending: localStorage.getItem('farkad:pendingReplace'),
          saves: window.__cloud.saves.length };
      });
      check('a malformed file: the modal is on screen', said.told.visible);
      check('a malformed file: it is not reported as loaded',
        !SUCCESS_LINES.includes(said.told.title) && !SUCCESS_LINES.includes(said.told.message),
        JSON.stringify(said.told));
      check('a malformed file: it says the file could not be read',
        said.told.title === 'הקובץ לא נטען', JSON.stringify(said.told));
      check('a malformed file: the disk is untouched', said.same);
      check('a malformed file: nothing was written down', said.pending === null,
        String(said.pending));
      check('a malformed file: and nothing was sent', said.saves === 0, String(said.saves));
      await page.waitForTimeout(150);
      continue;
    }

    const out = await attempt(door, 'malformed');
    check(`${door}, malformed: the result modal is on screen`, out.said.visible,
      JSON.stringify(out.said));
    check(`${door}, malformed: it says exactly "לא בוצע שחזור"`,
      out.said.title === 'לא בוצע שחזור', JSON.stringify(out.said));
    check(`${door}, malformed: and names it as not a whole record`,
      out.said.message.indexOf('אינו רישום שלם') !== -1, JSON.stringify(out.said));
    check(`${door}, malformed: the disk is byte-for-byte what it was`,
      out.disk === out.before.disk);
    check(`${door}, malformed: the queue is byte-for-byte what it was`,
      out.queue === out.before.queue);
    check(`${door}, malformed: nothing was written down`, out.pending === null,
      String(out.pending));
    check(`${door}, malformed: nothing was sent`, out.saves === out.before.saves,
      `${out.before.saves} -> ${out.saves}`);
    if (door === 'way back') {
      check('way back, malformed: the way back is still on the stack',
        out.undo === out.before.undo, String(out.undo));
    }
  }

  // ---------------------------------------------------------- a restore point that will not parse
  {
    const out = await attempt('restore point', 'unparseable');
    check('unreadable restore point: the modal is on screen, not silence', out.said.visible,
      JSON.stringify(out.said));
    check('unreadable restore point: it says exactly "לא בוצע שחזור"',
      out.said.title === 'לא בוצע שחזור', JSON.stringify(out.said));
    check('unreadable restore point: and says it could not be read',
      out.said.message.indexOf('לא נקרא') !== -1, JSON.stringify(out.said));
    check('unreadable restore point: the disk is untouched', out.disk === out.before.disk);
  }

  // ---------------------------------------------------------- the real transaction faults
  const FAULTS = [
    ['cloud copy', 'prepare', 'לא בוצע שחזור', 'ממתין לשליחה'],
    ['restore point', 'local-save', 'לא בוצע שחזור', 'לא שינינו כלום'],
    ['way back', 'queue-prune', 'השחזור לא הושלם', 'תור השליחה'],
    ['restore point', 'finalize', 'שוחזר במכשיר הזה', 'עדיין לא הגיע לענן'],
    ['cloud copy', 'ordering', 'שוחזר במכשיר הזה', 'עדיין לא הגיע לענן']
  ];

  for (const [door, fault, title, phrase] of FAULTS) {
    const out = await attempt(door, fault);
    const where = `${door}, ${fault}`;

    check(`${where}: the result modal is on screen`, out.said.visible, JSON.stringify(out.said));
    check(`${where}: it never reports a plain success`,
      !SUCCESS_LINES.includes(out.said.title) && !SUCCESS_LINES.includes(out.said.message),
      JSON.stringify(out.said));
    check(`${where}: it says exactly "${title}"`, out.said.title === title,
      JSON.stringify(out.said));
    check(`${where}: and names what happened`, out.said.message.indexOf(phrase) !== -1,
      JSON.stringify(out.said));

    if (fault === 'prepare' || fault === 'local-save') {
      check(`${where}: nothing on the disk changed`, out.disk === out.before.disk);
      check(`${where}: no restore was written down`, out.pending === null, String(out.pending));
      check(`${where}: and nothing was sent`, out.saves === out.before.saves,
        `${out.before.saves} -> ${out.saves}`);
    }
    if (fault === 'queue-prune') {
      check(`${where}: the restored state IS on the disk`,
        out.diskDays === '2026-07-01', out.diskDays);
      check(`${where}: the transaction is still on the disk to finish it`,
        out.pending !== null && out.pendingRead === true, String(out.pending));
      check(`${where}: the superseded entry is still queued, not lost`,
        out.queued.indexOf('days.2026-08-18.actual.w_02') !== -1, JSON.stringify(out.queued));
      check(`${where}: and nothing was sent`, out.saves === out.before.saves,
        `${out.before.saves} -> ${out.saves}`);
    }
    if (fault === 'finalize') {
      check(`${where}: the restored state is on the disk`,
        out.diskDays === '2026-07-01', out.diskDays);
      check(`${where}: it did reach the cloud`, out.saves > out.before.saves,
        `${out.before.saves} -> ${out.saves}`);
      check(`${where}: and the record is kept because it could not be cleared`,
        out.pending !== null, String(out.pending));
    }
    if (fault === 'ordering') {
      check(`${where}: the restore was NOT sent past the open write`,
        out.saves === out.before.saves, `${out.before.saves} -> ${out.saves}`);
      check(`${where}: the restored state is on this device, as it was told`,
        out.diskDays === '2026-07-01', out.diskDays);
      check(`${where}: the transaction is kept so it can still run`,
        out.pending !== null && out.pendingRead === true, String(out.pending));
      check(`${where}: and nothing claims to be synced`, out.status !== 'synced', out.status);
    }
    check(`${where}: the status does not claim synced`,
      fault === 'prepare' || fault === 'local-save' || out.status !== 'synced', out.status);
  }

  // ---------------------------------------------------------- two close-and-reopen cycles
  //
  // The queue-prune failure, followed by the app being closed and opened twice, with the
  // fault gone. The transaction has to finish itself and lose nothing on the way.
  await attempt('way back', 'queue-prune');
  for (const round of ['first', 'second']) {
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => ({
      screen: Object.keys(State.schedule.days).sort().join(),
      disk: Object.keys(
        JSON.parse(localStorage.getItem('scheduleData:v2') || '{}').days || {}).sort().join(),
      pending: localStorage.getItem('farkad:pendingReplace'),
      blocked: farkadWritesBlocked()
    }));
    check(`after the ${round} reopen the superseded day has not come back`,
      after.screen === '2026-07-01', after.screen);
    check(`after the ${round} reopen the disk says the same`,
      after.disk === '2026-07-01', after.disk);
    check(`after the ${round} reopen recording is not blocked`, after.blocked === false);
  }

  // ---------------------------------------------------------- and the control
  //
  // Without this, every check above would pass on an app that never reports success at
  // all.
  await installHelpers();
  {
    const done = await page.evaluate(async () => {
      window.__reset();
      window.__installCloud();
      const running = restoreSnapshot('2026-08-01');
      await new Promise(wait => setTimeout(wait, 250));
      document.getElementById('askOk').click();
      await running;
      await new Promise(wait => setTimeout(wait, 200));
      const told = {
        visible: document.getElementById('askModal').style.display !== 'none',
        // A plain string reaches askTell as the message, not the title, which is why
        // the checks above compare both fields against the success lines.
        said: document.getElementById('askTitle').textContent
          + document.getElementById('askMessage').textContent
      };
      document.getElementById('askOk').click();
      return {
        told,
        days: Object.keys(State.schedule.days).sort().join(),
        saves: window.__cloud.saves.length,
        pending: localStorage.getItem('farkad:pendingReplace')
      };
    });
    check('a restore that finished says exactly "שוחזר."', done.told.said === 'שוחזר.',
      JSON.stringify(done.told));
    check('and the modal is on screen saying it', done.told.visible);
    check('and it really did happen', done.days === '2026-07-01', done.days);
    check('reaching the cloud', done.saves > 0, String(done.saves));
    check('with nothing left pending', done.pending === null, String(done.pending));
  }

  await page.context().close();
}

// ---------------------------------------------------------------- importing an old file
{
  // A backup saved by the OLD app passes a naive "has workers and places" check and then
  // normalises to nothing, because its workers are bare names with no ids. That import
  // reported success and left an empty app.
  const page = await open();
  await seedRoster(page);
  await page.click('#tab-roster');
  await page.waitForTimeout(300);

  const v1File = JSON.stringify({
    workers: ['דוד', { name: 'שרה', id: '22', phone: '050' }],
    places: ['הרצליה', 'תל אביב'],
    weekStartDate: '2026-08-09',
    assignments: [
      { index: 0, value: 'הרצליה' },
      { index: 1, value: 'חופש', holiday: true },
      { index: 7, value: 'הרצליה + תל אביב' }
    ]
  });

  await page.setInputFiles('#importInput',
    { name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(v1File, 'utf8') });
  await page.waitForTimeout(400);
  check('an old backup is recognised rather than imported as nothing',
    (await page.textContent('#askMessage')).includes('מהגרסה הישנה'));
  check('and the dialog says what is actually in it before replacing anything',
    (await page.textContent('#askMessage')).includes('1 ימי עבודה'),
    await page.textContent('#askMessage'));

  await page.click('#askOk');
  await page.waitForTimeout(500);
  check('it is migrated on the way in, not dropped',
    (await page.evaluate(() => State.schedule.workers.length)) === 2 &&
    (await page.evaluate(() => State.schedule.workers[0].id)) === 'w_01');
  check('a vacation in the old file is an absence in the new one',
    (await page.evaluate(() => isAbsent(State.schedule, '2026-08-10', 'w_01', 'actual'))));
  check('and what it refused to guess still waits for a decision',
    (await page.evaluate(() => State.migrationIssues.length)) === 1);
  await page.click('#askOk');
  await page.waitForTimeout(400);
  check('which it opens rather than leaving to be found',
    await page.locator('#migrationModal').isVisible());
  await page.click('#migrationModal .btn-secondary');
  await page.waitForTimeout(200);

  // a file that empties out is refused outright
  const broken = JSON.stringify({ workers: [{ name: 'בלי מזהה' }], places: [], days: {} });
  await page.setInputFiles('#importInput',
    { name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from(broken, 'utf8') });
  await page.waitForTimeout(400);
  check('a file whose roster does not survive reading is refused, not imported empty',
    (await page.textContent('#askMessage')).includes('לא השתנו'));
  // And it says WHAT is wrong with it. "Not a valid backup" is true and useless when the
  // file reads perfectly and the trouble is a man with no id.
  check('and names the problem rather than calling the file unreadable',
    (await page.textContent('#askMessage')).includes('בלי מזהה'),
    await page.textContent('#askMessage'));
  await page.click('#askOk');
  await page.waitForTimeout(200);
  check('and the existing data is untouched',
    (await page.evaluate(() => State.schedule.workers.length)) === 2);
  await page.context().close();
}

// ---------------------------------------------------------------- nothing widens the page
{
  // Reported from a phone: opening the week shoved the whole app off-screen sideways.
  // The reports' card rule had unwrapped the week table's scroll container too, and a
  // 720px grid blew the page open. Wide content scrolls inside its OWN container; the
  // page itself never scrolls sideways - checked on every view, because the next wide
  // element will not announce itself either.
  const page = await open({ viewport: { width: 390, height: 844 } });
  await seedRoster(page);
  await page.evaluate(() => {
    assignPlace(State.schedule, '2026-08-12', 'w_01', 'actual', 'p_01', RATE_DOUBLE);
    assignPlace(State.schedule, '2026-08-12', 'w_01', 'actual', 'p_02');
    State.save();
    REPORT_RANGE.from = '2026-08-01';
    REPORT_RANGE.to = '2026-08-31';
  });

  for (const view of ['day', 'week', 'roster', 'reports']) {
    await page.evaluate(v => showView(v), view);
    await page.waitForTimeout(250);
    const width = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth,
      viewport: window.innerWidth
    }));
    check(`the ${view} view does not widen the page sideways`,
      width.page <= width.viewport + 1, JSON.stringify(width));
  }

  // on a phone the week is a colour map: seven days on one screen, no sideways scroll
  await page.evaluate(() => showView('week'));
  await page.waitForTimeout(250);
  const week = await page.evaluate(() => {
    const wrap = document.querySelector('#weekView .table-scroll');
    const name = document.querySelector('.week-cell .cell-line .site-name');
    const legend = document.querySelector('.week-legend');
    return {
      inner: wrap.scrollWidth,
      box: wrap.clientWidth,
      cols: document.querySelectorAll('.week-table thead th').length,
      nameHidden: name ? getComputedStyle(name).display === 'none' : false,
      legendShown: legend ? getComputedStyle(legend).display !== 'none' : false
    };
  });
  check('the whole week fits on one phone screen, all seven days',
    week.inner <= week.box + 1 && week.cols === 8, JSON.stringify(week));
  check('cells shrink to the site colour alone', week.nameHidden, JSON.stringify(week));

  // the shrunk headers use the calendar letters א׳-ש׳, not first letters - four of the
  // seven day names start with ש or ר, which told nobody anything
  const initials = await page.evaluate(() =>
    [...document.querySelectorAll('.week-table thead .day-initial')].map(n => n.textContent));
  check('every shrunk day letter is distinct',
    new Set(initials).size === 7, JSON.stringify(initials));
  check('and Friday reads ו׳ the way a calendar writes it',
    initials.includes('ו׳'), JSON.stringify(initials));
  check('and the legend maps each colour back to its name', week.legendShown);

  // rate marks survive the shrink: the word is gone, the mark stands in for it
  const marks = await page.evaluate(() => {
    const double = document.querySelector('.week-cell .cell-double');
    const note = document.querySelector('.week-legend-note');
    return {
      dot: double ? getComputedStyle(double, '::after').backgroundColor : null,
      noteShown: note ? getComputedStyle(note).display !== 'none' : false
    };
  });
  check('a doubled day keeps a mark in the colour map',
    marks.dot === 'rgb(255, 255, 255)', JSON.stringify(marks));
  check('and the legend note explains the marks', marks.noteShown);
  await page.context().close();
}

// ------------------------------------------------- nothing hides under the bottom bars
//
// The complaint this answers: the tab bar and the copy/WhatsApp pair sat on top of the
// last men in the list. Visible, and impossible to tap - the tap lands on the bar.
//
// Measured with bounding boxes rather than by reading the stylesheet, because the
// stylesheet was never the thing that was wrong: it said 150px, and the bars were 168.
// The question is whether the last row can be scrolled clear of them, and that is a
// question about rectangles.
for (const [label, width, height] of [['390x844', 390, 844], ['430x932', 430, 932]]) {
  const page = await open({ viewport: { width, height }, deviceScaleFactor: 3 });

  // Thirty men, which is a real crew for this app and long enough that the end of the
  // list is well past the fold.
  await page.evaluate(() => {
    State.schedule.workers = Array.from({ length: 30 }, (unused, i) => ({
      id: `w_${String(i + 1).padStart(2, '0')}`,
      name: `עובד ${i + 1}`, active: true, dailyRate: 400, hourlyRate: 50
    }));
    State.schedule.places = [
      { id: 'p_01', name: 'הרצליה', active: true },
      { id: 'p_02', name: 'תל אביב', active: true }
    ];
    State.date = '2026-08-12';
    State.save();
    // By worker, which is the list the complaint was about: thirty names, and the last
    // of them under the bars.
    setDayMode('workers');
    showView('day');
  });
  await page.waitForTimeout(400);

  // What is actually covering the bottom of this viewport.
  const bars = await page.evaluate(() => {
    const boxes = ['.tabs', '.day-actions']
      .map(sel => document.querySelector(sel))
      .filter(node => node && getComputedStyle(node).position === 'fixed'
        && getComputedStyle(node).display !== 'none')
      .map(node => node.getBoundingClientRect());
    return { top: Math.min(...boxes.map(box => box.top)), count: boxes.length };
  });
  check(`${label}: both bottom bars are floating over the day screen`,
    bars.count === 2, JSON.stringify(bars));

  // Scrolled to the very end, the last row must clear them.
  const lastRow = await page.evaluate(async () => {
    // Scrolled to the end of the page, which is what a thumb does. Not
    // scrollIntoView({block:'end'}) - that pins the row's bottom to the viewport's
    // bottom whatever the page reserves, so it would report a failure on a page that is
    // perfectly correct and hide the one that is not.
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise(done => setTimeout(done, 300));
    const rows = document.querySelectorAll('#dayView .worker-list .wrow');
    const last = rows[rows.length - 1];
    const box = last.getBoundingClientRect();
    const style = getComputedStyle(document.documentElement);
    return {
      bottom: box.bottom, height: box.height, text: last.textContent.slice(0, 20),
      atEnd: Math.abs(window.scrollY + window.innerHeight - document.body.scrollHeight) < 3,
      navVar: style.getPropertyValue('--nav-h').trim(),
      actionsVar: style.getPropertyValue('--day-actions-h').trim()
    };
  });
  check(`${label}: the page really is scrolled to its end`,
    lastRow.atEnd === true, JSON.stringify(lastRow));
  check(`${label}: and both bars were measured, not guessed at`,
    lastRow.navVar !== '0px' && lastRow.actionsVar !== '0px', JSON.stringify(lastRow));

  // The fix itself, stated directly: whatever is scrolling reserves at least as much
  // room at its foot as the bars are covering. Every version of this that wrote a number
  // into the stylesheet failed here on one phone or another.
  const reserved = await page.evaluate(() => {
    const covered = ['.tabs', '.day-actions']
      .map(sel => document.querySelector(sel))
      .filter(node => node && getComputedStyle(node).position === 'fixed'
        && getComputedStyle(node).display !== 'none')
      .reduce((sum, node) => sum + node.getBoundingClientRect().height, 0);
    return {
      covered: Math.round(covered),
      pad: Math.round(parseFloat(getComputedStyle(document.querySelector('.app')).paddingBottom))
    };
  });
  check(`${label}: the page reserves at least what the bars cover`,
    reserved.pad >= reserved.covered, JSON.stringify(reserved));
  check(`${label}: the last worker is the thirtieth`,
    lastRow.text.includes('30'), JSON.stringify(lastRow));
  check(`${label}: and its whole row is above the bars, not under them`,
    lastRow.bottom <= bars.top, JSON.stringify({ lastRow, bars }));

  // Not just visible - reachable. The point at the centre of the row has to belong to
  // the row, and not to a bar drawn over it.
  const reachable = await page.evaluate(() => {
    const rows = document.querySelectorAll('#dayView .worker-list .wrow');
    const last = rows[rows.length - 1];
    const box = last.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return { inside: last.contains(hit), hit: hit ? hit.className : null };
  });
  check(`${label}: a tap in the middle of the last row lands on the row`,
    reachable.inside === true, JSON.stringify(reachable));

  // The same for the roster screen, whose last item is a button rather than a row - and
  // where the day bar must not be floating at all.
  await page.evaluate(async () => {
    showView('roster');
    await new Promise(done => setTimeout(done, 250));
    window.scrollTo(0, document.body.scrollHeight);
  });
  await page.waitForTimeout(400);

  const roster = await page.evaluate(() => {
    const dayBar = document.querySelector('.day-actions');
    const tabs = document.querySelector('.tabs').getBoundingClientRect();
    const buttons = [...document.querySelectorAll('#rosterView button')]
      .filter(node => node.offsetParent !== null);
    const last = buttons[buttons.length - 1];
    const box = last.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return {
      dayBarShown: getComputedStyle(dayBar).display !== 'none',
      clear: box.bottom <= tabs.top,
      reachable: last.contains(hit) || last === hit,
      label: last.textContent.slice(0, 24)
    };
  });
  check(`${label}: the day screen's bar does not float over the roster`,
    roster.dayBarShown === false, JSON.stringify(roster));
  check(`${label}: the last button on the roster clears the tab bar`,
    roster.clear === true, JSON.stringify(roster));
  check(`${label}: and can actually be pressed`,
    roster.reachable === true, JSON.stringify(roster));

  // A sheet opened over all of it: the tab bar must not be drawn on top of it, and its
  // own last button has to be reachable above the home indicator.
  const sheet = await page.evaluate(async () => {
    showView('day');
    await new Promise(done => setTimeout(done, 250));
    const row = document.querySelector('#dayView .worker-list .wrow');
    const opener = row.querySelector('button') || row;
    opener.click();
    await new Promise(done => setTimeout(done, 350));

    const open = [...document.querySelectorAll('.modal')]
      .find(node => getComputedStyle(node).display !== 'none');
    if (!open) return { opened: false };

    const content = open.querySelector('.modal-content');
    const box = content.getBoundingClientRect();
    const tabs = document.querySelector('.tabs').getBoundingClientRect();
    const buttons = [...content.querySelectorAll('button')].filter(b => b.offsetParent !== null);
    const last = buttons[buttons.length - 1];
    const lastBox = last.getBoundingClientRect();
    const hit = document.elementFromPoint(
      lastBox.left + lastBox.width / 2, lastBox.top + lastBox.height / 2);

    return {
      opened: true,
      aboveTabs: Number(getComputedStyle(open).zIndex) > Number(getComputedStyle(
        document.querySelector('.tabs')).zIndex),
      fitsOnScreen: box.bottom <= window.innerHeight + 1,
      scrollable: content.scrollHeight > content.clientHeight
        ? getComputedStyle(content).overflowY === 'auto' : true,
      lastReachable: last.contains(hit) || last === hit,
      lastClearOfTabs: lastBox.bottom <= Math.max(tabs.top, lastBox.bottom)
    };
  });
  check(`${label}: a sheet opens over the day screen`, sheet.opened === true,
    JSON.stringify(sheet));
  check(`${label}: the tab bar is not drawn on top of it`, sheet.aboveTabs === true,
    JSON.stringify(sheet));
  check(`${label}: it fits inside the viewport`, sheet.fitsOnScreen === true,
    JSON.stringify(sheet));
  check(`${label}: its contents scroll when there are more than fit`,
    sheet.scrollable === true, JSON.stringify(sheet));
  check(`${label}: and its last button can be pressed`, sheet.lastReachable === true,
    JSON.stringify(sheet));

  await page.context().close();
}

// ---------------------------------------------------------------- the bottom of an iPhone
{
  // An installed app draws under the home indicator. Anything pinned to the bottom edge
  // without the inset sits beneath the bar the system draws over it - reachable only by
  // a tap that also swipes the app away.
  const page = await open();
  await seedRoster(page);

  const insets = await page.evaluate(() => {
    // env() resolves to 0 in a desktop browser, so the declaration is checked by
    // substituting a real inset and seeing the padding move.
    document.documentElement.style.setProperty('--probe', '34px');
    const read = selector => getComputedStyle(document.querySelector(selector)).paddingBottom;
    return {
      actions: read('.day-actions'),
      app: read('.app'),
      declared: Array.from(document.styleSheets)
        .flatMap(sheet => Array.from(sheet.cssRules || []))
        .map(rule => rule.cssText || '')
        .filter(text => text.includes('safe-area-inset-bottom')).length
    };
  });
  check('the fixed bars reserve the iPhone home-indicator strip',
    insets.declared >= 3, `${insets.declared} rules`);

  // The page reserves exactly what the bars are taking, and no longer a number somebody
  // wrote down once. On a wide screen the tabs are part of the header rather than a bar,
  // so only the day pair is covering anything.
  const reserved = await page.evaluate(() => {
    const bar = document.querySelector('.day-actions');
    const style = getComputedStyle(document.documentElement);
    return {
      navVar: style.getPropertyValue('--nav-h').trim(),
      actionsVar: style.getPropertyValue('--day-actions-h').trim(),
      actionsReal: Math.round(bar.getBoundingClientRect().height),
      appPad: parseFloat(getComputedStyle(document.querySelector('.app')).paddingBottom)
    };
  });
  check('the tab bar is not a floating bar on a wide screen',
    reserved.navVar === '0px', JSON.stringify(reserved));
  check('the day bar is measured rather than guessed at',
    reserved.actionsVar === `${reserved.actionsReal}px`, JSON.stringify(reserved));
  check('and the page leaves room for exactly that, plus a gap',
    reserved.appPad >= reserved.actionsReal && reserved.appPad <= reserved.actionsReal + 40,
    JSON.stringify(reserved));

  check('the page opts into drawing under the system bars at all',
    (await page.getAttribute('meta[name="viewport"]', 'content')).includes('viewport-fit=cover'));
  await page.context().close();
}

// ---------------------------------------------------------------- dialogs and the keyboard
{
  // The seder is often written on a desktop with both hands on the keyboard.
  const page = await open();
  await seedRoster(page);
  await page.click('#tab-roster');
  await page.waitForTimeout(300);

  await page.getByRole('button', { name: '+ הוסף עובד' }).click();
  await page.waitForTimeout(250);
  check('opening a dialog puts the cursor inside it',
    (await page.evaluate(() => document.activeElement.closest('.modal')?.id)) === 'workerFormModal');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check('Escape closes it', !(await page.locator('#workerFormModal').isVisible()));
  check('and the keyboard goes back where it was',
    (await page.evaluate(() => document.activeElement.textContent)).includes('הוסף עובד'));

  // Tab must not wander out into the page behind the dialog
  await page.getByRole('button', { name: '+ הוסף עובד' }).click();
  await page.waitForTimeout(250);
  for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
  check('Tab stays inside the dialog instead of walking into the page behind it',
    (await page.evaluate(() => document.activeElement.closest('.modal')?.id)) === 'workerFormModal');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // the backdrop, for a mouse
  await page.evaluate(() => showAddWorkerModal());
  await page.waitForTimeout(250);
  await page.locator('#workerFormModal').click({ position: { x: 5, y: 5 } });
  await page.waitForTimeout(250);
  check('clicking the backdrop closes it too',
    !(await page.locator('#workerFormModal').isVisible()));

  // Escape closes the topmost only - the question, not the form it was asked from
  await page.evaluate(() => showAddWorkerModal());
  await page.waitForTimeout(200);
  await page.fill('#workerFormName', 'דוד');
  await page.getByRole('button', { name: 'שמור', exact: true }).click();
  await page.waitForTimeout(300);
  check('a question asked from inside a form sits on top of it',
    await page.locator('#askModal').isVisible());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check('Escape answers the question and leaves the form open',
    !(await page.locator('#askModal').isVisible()) &&
    await page.locator('#workerFormModal').isVisible());
  check('and answering it that way counts as "no"',
    (await page.evaluate(() => State.schedule.workers.length)) === 3);
  await page.context().close();
}

// ---------------------------------------------------------------- quick start
{
  // Fourteen names through fourteen dialogs is where a first evening dies. A pasted
  // list is thirty seconds, and the crew list already exists somewhere.
  const page = await open();
  check('an empty app leads with quick start',
    (await page.locator('.setup-card').getByRole('button', { name: /התחלה מהירה/ }).isVisible()));

  await page.locator('.setup-card').getByRole('button', { name: /התחלה מהירה/ }).click();
  await page.waitForTimeout(250);
  check('step one asks for the workers', (await page.textContent('#quickTitle')).includes('שלב 1'));

  await page.fill('#quickText', 'דוד כהן\n  שרה לוי  \n\nעלי חסן\n');
  await page.getByRole('button', { name: 'המשך', exact: true }).click();
  await page.waitForTimeout(250);
  check('step two asks for the sites', (await page.textContent('#quickTitle')).includes('שלב 2'));

  await page.fill('#quickText', 'הרצליה\nתל אביב');
  await page.getByRole('button', { name: 'סיום', exact: true }).click();
  await page.waitForTimeout(400);
  await page.click('#askOk');
  await page.waitForTimeout(300);

  const built = await page.evaluate(() => ({
    workers: State.schedule.workers.map(w => w.name),
    places: State.schedule.places.map(p => p.name),
    rows: (setDayMode('workers'), document.querySelectorAll('.wrow').length)
  }));
  check('the pasted names become the roster, blanks and spaces cleaned',
    JSON.stringify(built.workers) === JSON.stringify(['דוד כהן', 'שרה לוי', 'עלי חסן']),
    JSON.stringify(built.workers));
  check('the sites arrive with their colours ready',
    JSON.stringify(built.places) === JSON.stringify(['הרצליה', 'תל אביב']));
  check('and the day screen is immediately ready to record', built.rows === 3);

  // an empty step refuses politely instead of building half a roster
  await page.evaluate(() => openQuickStart());
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'המשך', exact: true }).click();
  await page.waitForTimeout(200);
  check('an empty list is refused with the reason under the box',
    (await page.textContent('#quickError')).includes('לפחות'));

  // running it again ADDS - it must never replace a roster that exists
  await page.fill('#quickText', 'מוחמד אבו');
  await page.getByRole('button', { name: 'המשך', exact: true }).click();
  await page.waitForTimeout(200);
  await page.fill('#quickText', 'הרצליה');
  await page.getByRole('button', { name: 'סיום', exact: true }).click();
  await page.waitForTimeout(300);
  await page.click('#askOk');
  await page.waitForTimeout(200);
  const again = await page.evaluate(() => ({
    workers: State.schedule.workers.length,
    places: State.schedule.places.length
  }));
  check('a second run adds workers and never duplicates a site',
    again.workers === 4 && again.places === 2, JSON.stringify(again));
  await page.context().close();
}

// ---------------------------------------------------------------- the simple form
{
  // Two fields answer ninety percent of evenings; the rest fold away so the form fits
  // above a phone keyboard. Editing someone whose folded fields hold data opens the
  // fold, because hidden data reads as lost data.
  const page = await open();
  await seedRoster(page);
  await page.click('#tab-roster');
  await page.waitForTimeout(300);

  await page.getByRole('button', { name: '+ הוסף עובד' }).click();
  await page.waitForTimeout(250);
  check('a new worker form starts folded to name and daily rate',
    (await page.evaluate(() => document.getElementById('workerFormMore').open)) === false);
  check('but the folded fields are one press away',
    await page.locator('#workerFormMore summary').isVisible());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  await page.locator('#workerList .roster-row').first().getByRole('button', { name: /^ערוך/ }).click();
  await page.waitForTimeout(250);
  check('editing someone with a phone number opens the fold',
    (await page.evaluate(() => document.getElementById('workerFormMore').open)) === true);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.context().close();
}

// ---------------------------------------------------------------- the period chips
{
  const page = await open();
  await seedRoster(page);
  await page.click('#tab-reports');
  await page.waitForTimeout(300);

  check('the period is chosen by chips, not typed into calendars',
    (await page.locator('.range-chips button').count()) === 4);
  check('the raw date inputs stay folded away',
    (await page.locator('.range-bar input[type="date"]').count()) === 0);
  check('and the chosen period is written out in full',
    /\d{2}\/\d{2}\/\d{4} - \d{2}\/\d{2}\/\d{4}/.test(await page.textContent('.range-current')));

  await page.getByRole('button', { name: 'תאריכים אחרים' }).click();
  await page.waitForTimeout(250);
  check('asking for other dates reveals the two calendars',
    (await page.locator('.range-bar input[type="date"]').count()) === 2);
  await page.context().close();
}

// ---------------------------------------------------------------- two of the same name
{
  // The day screen shows nothing but names. Two identical ones and nobody can tell which
  // row is whose - including when their pay is worked out.
  const page = await open();
  await seedRoster(page);
  await page.click('#tab-roster');
  await page.waitForTimeout(300);

  const addWorker = async name => {
    await page.getByRole('button', { name: '+ הוסף עובד' }).click();
    await page.waitForTimeout(200);
    await page.fill('#workerFormName', name);
    await page.getByRole('button', { name: 'שמור', exact: true }).click();
    await page.waitForTimeout(250);
  };

  await addWorker('דוד');
  check('a second worker with the same name is questioned, not silently added',
    await page.locator('#askModal').isVisible() &&
    (await page.textContent('#askTitle')).includes('דוד'));

  await page.click('#askCancel');
  await page.waitForTimeout(250);
  check('backing out leaves the roster alone',
    (await page.evaluate(() => State.schedule.workers.length)) === 3);
  check('and the form is still open with the name to correct',
    await page.locator('#workerFormModal').isVisible() &&
    (await page.inputValue('#workerFormName')) === 'דוד');

  await page.fill('#workerFormName', 'דוד לוי');
  await page.getByRole('button', { name: 'שמור', exact: true }).click();
  await page.waitForTimeout(300);
  check('a distinguishable name goes straight in',
    (await page.evaluate(() => State.schedule.workers.length)) === 4);

  // it stays a warning, never a refusal - the manager knows their own crew
  await addWorker('דוד');
  await page.click('#askOk');
  await page.waitForTimeout(300);
  check('but it can still be done deliberately',
    (await page.evaluate(() => State.schedule.workers.length)) === 5);
  check('and the pair is marked in the roster from then on',
    (await page.locator('#workerList .badge-warn').count()) === 2);

  // an archived namesake is not a clash: they are not on any day screen
  await page.evaluate(() => {
    State.schedule.workers.forEach(w => { if (w.name === 'דוד') w.active = false; });
    State.save(); render();
  });
  await addWorker('דוד');
  check('an archived namesake raises nothing',
    !(await page.locator('#askModal').isVisible()) &&
    (await page.evaluate(() => State.schedule.workers.length)) === 6);
  await page.context().close();
}

// ---------------------------------------------------------------- when it breaks
{
  // On a phone a crash looks like nothing at all: half a screen, no console, and no way
  // to tell whether what was just typed survived.
  const page = await open();
  page.on('pageerror', () => {});
  await seedRoster(page);

  await page.evaluate(() => {
    setTimeout(() => { throw new Error('deliberate test failure'); }, 0);
  });
  await page.waitForTimeout(300);
  check('an uncaught error is shown instead of leaving a half-drawn screen',
    await page.locator('#crashBanner').isVisible());
  check('and it says the saved record is not the casualty',
    (await page.textContent('#crashBanner')).includes('לא נפגע'));
  check('with the one action that helps',
    await page.locator('#crashBanner').getByRole('button', { name: 'רענן' }).isVisible());

  // a failed image or script is not a crash and must not cry wolf
  const quiet = await open();
  await quiet.evaluate(() => {
    const img = document.createElement('img');
    img.src = 'does-not-exist.png';
    document.body.appendChild(img);
  });
  await quiet.waitForTimeout(400);
  check('a missing file is not reported as a crash',
    !(await quiet.locator('#crashBanner').isVisible()));
  await quiet.context().close();
  await page.context().close();
}

// ---------------------------------------------------------------- one client's invoice
{
  // A printed invoice goes to one client, and every other site on the page is somebody
  // else's business.
  const page = await open();
  await seedRoster(page);
  await page.evaluate(() => {
    assignPlace(State.schedule, '2026-08-10', 'w_01', 'actual', 'p_01');
    assignPlace(State.schedule, '2026-08-10', 'w_02', 'actual', 'p_02');
    assignPlace(State.schedule, '2026-08-11', 'w_01', 'actual', 'p_01');
    assignPlace(State.schedule, '2026-08-11', 'w_02', 'actual', 'p_01');
    assignPlace(State.schedule, '2026-08-12', 'w_03', 'actual', 'p_02');
    State.save();
    REPORT_RANGE.from = '2026-08-01';
    REPORT_RANGE.to = '2026-08-31';
  });
  await page.click('#tab-reports');
  await page.waitForTimeout(400);

  check('by default the invoice shows every site, for working from',
    (await page.locator('.report-invoice thead th').count()) === 4);

  await page.locator('.invoice-picker').getByRole('button', { name: 'הרצליה' }).click();
  await page.waitForTimeout(300);
  check('choosing a site narrows the page to that client alone',
    (await page.locator('.report-invoice thead th').count()) === 3 &&
    !(await page.textContent('.report-invoice thead')).includes('תל אביב'));
  check('and the heading names them, since the chips are not printed',
    (await page.textContent('.report-invoice h2')).includes('הרצליה'));
  check('days their site did not work are left out, not shown as empty rows',
    (await page.locator('.report-invoice tbody tr').count()) === 2);
  check('the total is that site\'s alone',
    (await page.textContent('.report-invoice tfoot')).includes('3'));

  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(200);
  check('the site chooser is not on the printed page',
    !(await page.locator('.invoice-picker').isVisible()));
  await page.emulateMedia({ media: 'screen' });

  const sheets = await page.evaluate(() => reportSheets().invoice);
  check('and the export follows the same choice as the screen',
    sheets[0].length === 3 && !JSON.stringify(sheets).includes('תל אביב'),
    JSON.stringify(sheets[0]));

  await page.locator('.invoice-picker').getByRole('button', { name: 'כל האתרים' }).click();
  await page.waitForTimeout(300);
  check('and it goes back to every site',
    (await page.locator('.report-invoice thead th').count()) === 4);
  await page.context().close();
}

// ---------------------------------------------------------------- the account period
{
  // An account is fourteen days, Friday through Thursday twice, and WHICH fortnight is
  // anchored to the owner's own seam (2026-08-07) - not to whatever week today is in.
  // The default range is the account containing today, whole.
  const page = await open();
  const rangeOn = day => page.evaluate(d => {
    todayStr = () => d;
    return defaultPayrollRange();
  }, day);

  const midAccount = await rangeOn('2026-08-14');   // a Friday, day 7 of the account
  check('mid-account the range is the running account, whole',
    midAccount.from === '2026-08-07' && midAccount.to === '2026-08-20',
    JSON.stringify(midAccount));

  const closingDay = await rangeOn('2026-08-20');   // the account's last Thursday
  check('on the closing Thursday it is still the same account',
    closingDay.from === '2026-08-07' && closingDay.to === '2026-08-20',
    JSON.stringify(closingDay));

  const nextOpen = await rangeOn('2026-08-21');     // the next account's first Friday
  check('the Friday after that opens the next account',
    nextOpen.from === '2026-08-21' && nextOpen.to === '2026-09-03',
    JSON.stringify(nextOpen));

  const beforeAnchor = await rangeOn('2026-08-06');
  check('an account before the anchor still lands on its own Friday',
    beforeAnchor.from === '2026-07-24' && beforeAnchor.to === '2026-08-06',
    JSON.stringify(beforeAnchor));

  check('and every account runs Friday to Thursday',
    (await page.evaluate(() => {
      const r = defaultPayrollRange();
      return [parseLocalDate(r.from).getDay(), parseLocalDate(r.to).getDay()];
    })).join() === '5,4');
  await page.context().close();
}

// ---------------------------------------------------------------- advances
{
  // The one number that turns a correct pay sheet into the wrong one: the days are
  // right, the rate is right, and the man was handed 500 of it a week ago.
  const page = await open();
  await seedRoster(page);
  await page.evaluate(() => {
    ['2026-08-07', '2026-08-09', '2026-08-10', '2026-08-11'].forEach(date =>
      assignPlace(State.schedule, date, 'w_01', 'actual', 'p_01'));
    State.save();
    REPORT_RANGE.from = '2026-08-07';
    REPORT_RANGE.to = '2026-08-20';
    showView('reports');
  });
  await page.waitForTimeout(300);

  const before = await page.evaluate(() => payrollRows().find(r => r.workerId === 'w_01'));
  check('four days at 400 is 1600 before anything is taken off',
    before.amount === 1600 && before.advances === 0 && before.netAmount === 1600,
    JSON.stringify(before));

  const after = await page.evaluate(() => {
    State.commit(addAdvance(State.schedule, 'w_01', '2026-08-10', 500, ''));
    return payrollRows().find(r => r.workerId === 'w_01');
  });
  check('an advance comes off what is still owed, not off what was earned',
    after.amount === 1600 && after.advances === 500 && after.netAmount === 1100,
    JSON.stringify(after));

  // An advance dated outside the period belongs to a different account entirely.
  const outside = await page.evaluate(() => {
    State.commit(addAdvance(State.schedule, 'w_01', '2026-07-30', 900, ''));
    return payrollRows().find(r => r.workerId === 'w_01');
  });
  check('an advance from another account is not deducted from this one',
    outside.advances === 500, JSON.stringify(outside));

  check('the sheet grows the columns once an advance exists',
    (await page.textContent('.report-payroll')).includes('מקדמות') &&
    (await page.textContent('.report-payroll')).includes('נצבר'));

  // Deleting is a written null, so the other devices receive the deletion itself.
  const removed = await page.evaluate(() => {
    const id = Object.keys(State.schedule.advances).find(key =>
      State.schedule.advances[key].amount === 500);
    const change = removeAdvance(State.schedule, id);
    return { path: change.path, value: change.value,
             advances: payrollRows().find(r => r.workerId === 'w_01').advances };
  });
  check('deleting an advance is sent as a field, not as a key that quietly vanished',
    removed.value === null && removed.path.startsWith('advances.') && removed.advances === 0,
    JSON.stringify(removed));

  // A man who took cash and then worked nothing must not vanish from the sheet - with
  // him goes the 500, which next period is out of range too and never deducted at all.
  const ghost = await page.evaluate(() => {
    State.commit(addAdvance(State.schedule, 'w_03', '2026-08-12', 250, ''));
    return payrollRows().find(r => r.workerId === 'w_03');
  });
  check('an advance keeps a worker on the sheet even with no days recorded',
    ghost && ghost.attendanceDays === 0 && ghost.advances === 250, JSON.stringify(ghost));

  // The three money columns must reconcile on the same rows: נצבר − מקדמות = לתשלום.
  // w_03 has no daily rate, so his 250 used to land in one column and not the other.
  const foot = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('.report-payroll tfoot td')]
      .map(node => node.textContent.trim());
    return cells;
  });
  const num = value => Number(String(value).replace(/[^\d-]/g, ''));
  check('the footer reconciles: earned minus advances equals to-pay',
    num(foot[foot.length - 3]) - Math.abs(num(foot[foot.length - 2])) === num(foot[foot.length - 1]),
    JSON.stringify(foot));

  // The exported file goes to the bookkeeper; it must say what the screen says, under
  // the same headings. It used to write the GROSS amount under 'לתשלום'.
  const sheet = await page.evaluate(() => reportSheets().payroll);
  const head = sheet[0];
  const w1 = sheet.find(row => row[0] === 'דוד');
  check('the export carries the same money columns as the screen',
    head.includes('נצבר') && head.includes('מקדמות') && head.includes('לתשלום'),
    JSON.stringify(head));
  check('and its לתשלום is net of advances, like the screen',
    w1[head.indexOf('לתשלום')] === 1600 && w1[head.indexOf('מקדמות')] === 0,
    JSON.stringify(w1));

  // The minus sign in Hebrew text lays out on the wrong side of the digits without a
  // direction mark - the worker read "500-" on the one number that says money was taken.
  const advCell = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.report-payroll tbody tr')];
    const row = rows.find(tr => tr.textContent.includes('עלי'));
    return [...row.querySelectorAll('td')].map(td => td.textContent).join('|');
  });
  check('a shown advance carries the mark that pins the minus before the digits',
    advCell.includes('‎-250'), JSON.stringify(advCell));

  // An advance typed while another phone's snapshot is landing must survive the swap -
  // day edits already did; advance paths were dropped on the floor.
  const survived = await page.evaluate(() => {
    const record = { id: 'a_pending1', workerId: 'w_02', date: '2026-08-12', amount: 111, note: '' };
    FarkadSync.clearOutbox();
    FarkadSync.queue('advances.a_pending1', record);
    FarkadSync.queue('advances.a_gone', null);
    const incoming = { workers: [], places: [], days: {},
      advances: { a_gone: { id: 'a_gone', workerId: 'w_01', date: '2026-08-12', amount: 999, note: '' } } };
    FarkadSync.reapplyPending(incoming);
    FarkadSync.clearOutbox();
    return { kept: incoming.advances.a_pending1, tombstoned: 'a_gone' in incoming.advances };
  });
  check('a pending advance is re-applied on top of an arriving snapshot',
    survived.kept && survived.kept.amount === 111, JSON.stringify(survived));
  check('and a pending deletion stays deleted rather than resurrecting',
    survived.tombstoned === false, JSON.stringify(survived));
  await page.context().close();
}

// ---------------------------------------------------------------- the roster travels
{
  // The roster was saved locally and never sent, while an arriving snapshot replaced it
  // wholesale: add a worker on one phone, record him for a week, and the next edit from
  // another phone deleted him - and the week of pay with him, because every report walks
  // the roster.
  const page = await open();
  await seedRoster(page);

  const sent = await page.evaluate(() => {
    const paths = [];
    FarkadSync.adapter = { update: patch => { paths.push(...Object.keys(patch)); return Promise.resolve(); } };
    FarkadSync.pushDelayMs = 0;

    State.schedule.workers.push({ id: 'w_09', name: 'יוסי', active: true, dailyRate: 400, hourlyRate: 0 });
    State.commitRoster();
    return FarkadSync.flush().then(() => paths);
  });
  check('adding a worker sends the roster, not only the timestamp',
    sent.includes('workers') && sent.includes('places'), JSON.stringify(sent));

  // and a roster edit in flight is not dropped by a snapshot landing on top of it
  const kept = await page.evaluate(() => {
    FarkadSync.clearOutbox();
    FarkadSync.queue('workers', State.schedule.workers);
    const incoming = { workers: [{ id: 'w_01', name: 'דוד', active: true }], places: [], days: {} };
    FarkadSync.reapplyPending(incoming);
    FarkadSync.clearOutbox();
    return incoming.workers.map(w => w.id);
  });
  check('a just-added worker survives the snapshot that arrives mid-send',
    kept.includes('w_09'), JSON.stringify(kept));

  // A brand-new project: the first write is a day edit, so the server document has days
  // and a stamp but no roster. That is unfinished, not broken - it used to lock the
  // status on "sync error" for good while writes were in fact landing.
  const fresh = await page.evaluate(() => {
    FarkadSync.clearOutbox();
    FarkadSync.setStatus('connecting');
    FarkadSync.receive({ days: { '2026-08-12': { actual: {} } }, updatedAt: '2026-08-12T10:00:00Z' });
    return { status: FarkadSync.status, queued: FarkadSync.pendingPaths() };
  });
  check('a server document with no roster yet is not treated as a failure',
    fresh.status === 'synced', JSON.stringify(fresh));
  check('and this device seeds it with the roster it has',
    fresh.queued.includes('workers'), JSON.stringify(fresh));

  // A document that is not ours at all still refuses to overwrite anything.
  const junk = await page.evaluate(() => {
    FarkadSync.receive(null);
    return FarkadSync.status;
  });
  check('while real rubbish is still refused', junk === 'error', junk);
  await page.context().close();
}

// ---------------------------------------------------------------- the sign-in sheet
{
  // Google sign-in cannot work in an installed app on an iPhone: a home-screen web app
  // has its own storage, and popup or redirect alike hand the flow to Safari, where it
  // completes in a different store and comes back signed-out. Email and password never
  // leaves the page.
  const page = await open();
  check('the sign-in sheet is closed until it is asked for',
    !(await page.locator('#signInModal').isVisible()));

  await page.evaluate(() => openSignInModal());
  await page.waitForTimeout(250);
  check('it asks for a mail and a password, in the page',
    (await page.locator('#signInEmail').isVisible()) &&
    (await page.locator('#signInPassword').isVisible()));
  check('the password field is a password field',
    (await page.getAttribute('#signInPassword', 'type')) === 'password');
  check('and both read left to right, whatever the page direction',
    (await page.getAttribute('#signInEmail', 'dir')) === 'ltr' &&
    (await page.getAttribute('#signInPassword', 'dir')) === 'ltr');
  check('the phone offers a mail keyboard and does not capitalise the address',
    (await page.getAttribute('#signInEmail', 'inputmode')) === 'email' &&
    (await page.getAttribute('#signInEmail', 'autocapitalize')) === 'none');

  // 16px or iOS magnifies the page the moment the field is focused
  const sizes = await page.evaluate(() =>
    ['signInEmail', 'signInPassword'].map(id =>
      parseFloat(getComputedStyle(document.getElementById(id)).fontSize)));
  check('neither field is small enough to zoom the page',
    sizes.every(px => px >= 16), JSON.stringify(sizes));

  await page.evaluate(() => closeSignInModal());
  await page.waitForTimeout(200);
  check('and it closes again', !(await page.locator('#signInModal').isVisible()));

  // the password must not be left sitting in the field behind a closed sheet
  await page.evaluate(() => {
    openSignInModal();
    document.getElementById('signInPassword').value = 'secret';
    closeSignInModal();
    openSignInModal();
  });
  await page.waitForTimeout(200);
  check('the password is not left behind when the sheet is closed',
    (await page.inputValue('#signInPassword')) === '');
  await page.context().close();
}

// ---------------------------------------------------------------- which version is this
{
  // An installed app can sit on a cached build for a long time, and nothing on any
  // screen said which one. "Close it and open it twice" is not an instruction anybody
  // can verify the result of.
  const page = await open();
  await page.click('#tab-roster');
  await page.waitForTimeout(300);
  check('the running version is on the screen, next to the backups',
    (await page.textContent('#appVersion')).includes(APP_VERSION_EXPECTED),
    await page.textContent('#appVersion'));
  check('and the version shown is the one the scripts were built with',
    (await page.evaluate(() => window.APP_VERSION || APP_VERSION)) === APP_VERSION_EXPECTED);
  check('with a way to go and fetch a newer one',
    (await page.locator('.app-version button').count()) === 1);

  // the service worker's cache name and the displayed version must not drift apart -
  // one of them says what is cached and the other says what is running
  const swVersion = await page.evaluate(() =>
    fetch('sw.js').then(r => r.text()).then(t => (t.match(/farkad-(v\d+)/) || [])[1]));
  check('the shell version and the app version agree',
    swVersion === APP_VERSION_EXPECTED, `sw=${swVersion} app=${APP_VERSION_EXPECTED}`);

  // Three strings now say which build this is - the cache name, the scripts, and the
  // page - and the whole point of the third is that a session where they disagree is
  // running two builds at once. Bumping two of the three is exactly the mistake this
  // catches, and it would otherwise show up as the app refusing to record.
  const pageVersion = await page.evaluate(() =>
    fetch('index.html').then(r => r.text())
      .then(t => (t.match(/name="farkad-build" content="(v\d+)"/) || [])[1]));
  check('and so does the build stamped on the page',
    pageVersion === APP_VERSION_EXPECTED,
    `page=${pageVersion} app=${APP_VERSION_EXPECTED}`);
  await page.context().close();
}

// ---------------------------------------------------------------- the module boundary
{
  // The Firebase adapter is the one ES module in an app of classic scripts, and it can
  // only reach the rest through the global object. A `const` at the top of a classic
  // script makes a global BINDING and not a property of window - so every classic file
  // could say FarkadSync while the module could not, and the first line it ran threw
  // "undefined is not an object". Sync could never have connected.
  const page = await open();
  const reach = await page.evaluate(() => ({
    sync: typeof window.FarkadSync,
    connect: typeof (window.FarkadSync || {}).connect,
    disconnect: typeof (window.FarkadSync || {}).disconnect,
    // the module calls this one as a bare name; a function declaration does land on
    // the global object, unlike const
    tell: typeof window.askTell
  }));
  check('the sync layer is reachable the way the module reaches it',
    reach.sync === 'object' && reach.connect === 'function' && reach.disconnect === 'function',
    JSON.stringify(reach));
  check('and so is the dialog it reports failures through',
    reach.tell === 'function', JSON.stringify(reach));
  await page.context().close();
}

// ---------------------------------------------------------------- the sign-in door
{
  // The button ships hidden, because with no Firebase project it is a door onto
  // nothing. It was hidden by a style attribute in the HTML and NOTHING anywhere ever
  // removed it - so the evening sync was switched on, the whole feature was invisible
  // and there was no way in at all.
  const page = await open();
  const button = page.locator('#syncAuthBtn');
  check('with no cloud project the sign-in button stays out of the way',
    !(await button.isVisible()));

  // the adapter reaches this on its first auth callback, which only happens once a
  // Firebase project has actually answered
  await page.evaluate(() => {
    const node = document.getElementById('syncAuthBtn');
    node.style.display = '';
    node.textContent = '☁️ התחבר לענן';
  });
  await page.waitForTimeout(200);
  check('and appears once a project answers',
    (await button.isVisible()) &&
    (await button.textContent()).includes('התחבר לענן'));
  check('it sits in the header, where it is found without hunting',
    (await page.evaluate(() =>
      Boolean(document.querySelector('.topbar #syncAuthBtn')))) === true);
  await page.context().close();
}

// ---------------------------------------------------------------- the cloud copies
{
  // Sync is a mirror: a deletion travels as faithfully as a correction, and the local
  // restore points are three deep and only as old as the last three openings of THIS
  // phone. These copies are the one thing a mistake cannot follow.
  const page = await open();
  await seedRoster(page);

  const written = await page.evaluate(() => {
    window.__archive = {};
    FarkadSync.adapter = {
      update: () => Promise.resolve(),
      save: () => Promise.resolve(),
      archive: (key, data) => { window.__archive[key] = JSON.parse(JSON.stringify(data)); return Promise.resolve(); },
      archiveDates: () => Promise.resolve(Object.keys(window.__archive).sort().reverse()),
      archiveRead: key => Promise.resolve(window.__archive[key] || null)
    };
    todayStr = () => '2026-08-12';
    FarkadSync.archiveDaily(State.schedule);
    FarkadSync.archiveDaily(State.schedule);   // same day again
    return { keys: Object.keys(window.__archive), workers: window.__archive['2026-08-12'].workers.length };
  });
  check('a copy is written once a day, not on every snapshot',
    written.keys.length === 1 && written.keys[0] === '2026-08-12', JSON.stringify(written.keys));
  check('and it holds the whole roster', written.workers === 3, JSON.stringify(written));

  // now lose the day the way an accident does, and come back from the cloud
  const restored = await page.evaluate(() => {
    State.schedule.workers = [];
    State.schedule.days = {};
    State.save();
    return { before: State.schedule.workers.length };
  });
  check('the accident empties the schedule everywhere', restored.before === 0);

  await page.click('#tab-roster');
  await page.waitForTimeout(300);
  await page.evaluate(() => { FarkadSync.setStatus('synced'); renderCloudRestorePoints(); });
  await page.waitForTimeout(300);
  check('the cloud copies are offered where the backups are',
    (await page.locator('#cloudRestorePoints button').count()) === 1 &&
    (await page.textContent('#cloudRestorePoints')).includes('מהענן'));

  await page.locator('#cloudRestorePoints button').first().click();
  await page.waitForTimeout(300);
  await page.click('#askOk');
  await page.waitForTimeout(400);
  check('restoring from the cloud brings the roster back',
    (await page.evaluate(() => State.schedule.workers.length)) === 3);
  check('and keeps the state it replaced, so the restore itself is reversible',
    (await page.evaluate(() =>
      JSON.parse(Store.get('scheduleData:v2backup')).workers.length)) === 0);

  // nothing is offered while sync is off - these copies only exist in the cloud
  await page.evaluate(() => { FarkadSync.setStatus('off'); renderCloudRestorePoints(); });
  await page.waitForTimeout(250);
  check('with sync off the cloud row is not there to mislead',
    (await page.locator('#cloudRestorePoints button').count()) === 0);
  await page.context().close();
}

// ---------------------------------------------------------------- the worker statement
{
  // What the man is handed on payday. The question it answers is "why is it this
  // number", so it is the days, then the total, then what he already took.
  const page = await open();
  await seedRoster(page);
  await page.evaluate(() => {
    assignPlace(State.schedule, '2026-08-07', 'w_01', 'actual', 'p_01');
    assignPlace(State.schedule, '2026-08-09', 'w_01', 'actual', 'p_02', RATE_DOUBLE);
    markAbsent(State.schedule, '2026-08-10', 'w_01', 'actual');
    addAdvance(State.schedule, 'w_01', '2026-08-11', 300, '');
    State.save();
    REPORT_RANGE.from = '2026-08-07';
    REPORT_RANGE.to = '2026-08-20';
    showView('reports');
  });
  await page.waitForTimeout(300);

  const statement = await page.evaluate(() => workerStatementText('w_01'));
  check('the statement names the worker and the period',
    statement.includes('דוד') && statement.includes('07/08/2026') && statement.includes('20/08/2026'),
    statement.split('\n')[0]);
  check('it lists every day with where he was',
    statement.includes('הרצליה') && statement.includes('תל אביב'), statement);
  check('a doubled day says so', statement.includes('(כפול)'), statement);
  check('an absence is on it too, rather than a gap to wonder about',
    statement.includes('נעדר'), statement);
  // Two counts, because one could not explain the total: he was on site on two dates,
  // and one of them was double, so he is paid for three days. 2 x 400 would be 800 and
  // the 1200 below it would read as a mistake.
  check('it says how many dates he was on site',
    statement.includes('2 ימי נוכחות'), statement);
  check('and how many days he is actually paid for',
    statement.includes('3 ימי שכר'), statement);
  check('naming the double day that makes up the difference',
    statement.includes('מתוכם יום כפול אחד'), statement);
  check('the advance is named with its date',
    statement.includes('מקדמה') && statement.includes('-300'), statement);
  // 400 + 800 = 1200 earned, less 300 = 900
  check('and the last line is the number he is actually paid',
    statement.includes('נותר לתשלום: 900'), statement);

  // the same route the seder takes
  const shared = await page.evaluate(() => {
    window.__shared = null;
    navigator.share = data => { window.__shared = data; return Promise.resolve(); };
    shareWorkerStatement('w_01');
    return new Promise(resolve => setTimeout(() => resolve(window.__shared), 200));
  });
  check('the statement goes out the way the seder does',
    shared && shared.text.includes('נותר לתשלום'), JSON.stringify(shared && shared.text ? 'ok' : shared));

  // and it is reachable from the number that raised the question
  await page.evaluate(() => openWorkerDays('w_01'));
  await page.waitForTimeout(250);
  check('the days screen shows the advance as money going the other way',
    (await page.locator('.wday-advance').count()) === 1);
  check('and states what is left after it',
    (await page.textContent('.wday-net')).includes('900'),
    await page.textContent('.wday-net'));
  await page.context().close();
}

// ---------------------------------------------------------------- roster order
{
  // Roster order is the order every other screen reads in, so setting it puts the men
  // recorded every single day at the top where they are reached first.
  const page = await open();
  await seedRoster(page);
  await page.click('#tab-roster');
  await page.waitForTimeout(300);

  const names = () => page.evaluate(() =>
    State.schedule.workers.map(worker => worker.name).join(','));
  check('the roster starts in the order it was built', (await names()) === 'דוד,שרה,עלי');

  await page.locator('#workerList .roster-row').nth(2)
    .getByRole('button', { name: /העלה/ }).click();
  await page.waitForTimeout(250);
  check('a name can be moved up', (await names()) === 'דוד,עלי,שרה');

  await page.locator('#workerList .roster-row').first()
    .getByRole('button', { name: /הורד/ }).click();
  await page.waitForTimeout(250);
  check('and down', (await names()) === 'עלי,דוד,שרה');

  check('the first row cannot be moved up past the top',
    await page.locator('#workerList .roster-row').first()
      .getByRole('button', { name: /העלה/ }).isDisabled());
  check('nor the last down past the bottom',
    await page.locator('#workerList .roster-row').last()
      .getByRole('button', { name: /הורד/ }).isDisabled());

  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(500);
  check('the order is kept, being the point of setting it',
    (await names()) === 'עלי,דוד,שרה');

  await page.click('#tab-day');
  await page.evaluate(() => setDayMode('workers'));
  await page.waitForTimeout(300);
  check('and the day screen reads in that order',
    (await page.evaluate(() =>
      [...document.querySelectorAll('.wrow-name')].map(n => n.textContent).join(','))) === 'עלי,דוד,שרה');
  await page.context().close();
}

// ---------------------------------------------------------------- what the account needs
{
  // An installed web app on an iPhone cannot schedule a local notification, so the
  // reminder is on the screen the person opens every evening anyway.
  const page = await open();
  await seedRoster(page);

  // mid-account, with two working days gone by and nothing on them
  await page.evaluate(() => {
    todayStr = () => '2026-08-12';
    State.date = '2026-08-12';
    assignPlace(State.schedule, '2026-08-12', 'w_01', 'actual', 'p_01');
    State.save(); render();
  });
  await page.waitForTimeout(300);
  const text = await page.textContent('#accountBanner');
  check('working days with nothing recorded on them are named',
    (await page.locator('#accountBanner').isVisible()) &&
    text.includes('07/08') && text.includes('09/08') && text.includes('11/08'), text);
  check('the rest day is not counted as a missing day', !text.includes('08/08'), text);
  check('nor is today, which is still being worked on', !text.includes('12/08'), text);

  // two days before settlement it says so
  await page.evaluate(() => {
    todayStr = () => '2026-08-19';
    State.date = '2026-08-19';
    render();
  });
  await page.waitForTimeout(300);
  check('and the day before settlement it says the account closes tomorrow',
    (await page.textContent('#accountBanner')).includes('נסגר מחר'),
    await page.textContent('#accountBanner'));

  // a fully recorded account mid-run says nothing at all
  await page.evaluate(() => {
    todayStr = () => '2026-08-10';
    State.date = '2026-08-10';
    ['2026-08-07', '2026-08-09'].forEach(date =>
      assignPlace(State.schedule, date, 'w_01', 'actual', 'p_01'));
    State.save(); render();
  });
  await page.waitForTimeout(300);
  check('with nothing outstanding it stays quiet',
    !(await page.locator('#accountBanner').isVisible()));
  await page.context().close();
}

// ---------------------------------------------------------------- month presets
{
  const page = await open({ });
  await page.evaluate(() => {
    // fixed "today" so the assertion is not a moving target
    todayStr = () => '2026-03-05';
    showView('reports');
  });
  await page.waitForTimeout(300);

  await page.getByRole('button', { name: 'חודש שעבר' }).click();
  await page.waitForTimeout(300);
  const range = await page.evaluate(() => ({ ...REPORT_RANGE }));
  check('last month runs from the first to the last of the month before',
    range.from === '2026-02-01' && range.to === '2026-02-28', JSON.stringify(range));

  await page.getByRole('button', { name: 'החודש' }).click();
  await page.waitForTimeout(300);
  const now = await page.evaluate(() => ({ ...REPORT_RANGE }));
  check('and this month covers the whole of it',
    now.from === '2026-03-01' && now.to === '2026-03-31', JSON.stringify(now));

  // December is where a month arithmetic bug shows up
  await page.evaluate(() => { todayStr = () => '2026-01-04'; setMonthRange(-1); });
  await page.waitForTimeout(200);
  const december = await page.evaluate(() => ({ ...REPORT_RANGE }));
  check('and December of the previous year is handled, not skipped',
    december.from === '2025-12-01' && december.to === '2025-12-31', JSON.stringify(december));
  await page.context().close();
}

// ---------------------------------------------------------------- one worker's days
{
  // Payday question: "why is my pay this number". The answer has to be reachable from
  // the number itself, and it has to add up to the same total.
  const page = await open();
  await seedRoster(page);
  await page.evaluate(() => {
    assignPlace(State.schedule, '2026-08-10', 'w_01', 'actual', 'p_01');
    assignPlace(State.schedule, '2026-08-10', 'w_01', 'actual', 'p_02', RATE_DOUBLE);
    assignPlace(State.schedule, '2026-08-11', 'w_01', 'actual', 'p_01', RATE_EXTRA, 2);
    markAbsent(State.schedule, '2026-08-12', 'w_01', 'actual');
    State.save();
    REPORT_RANGE.from = '2026-08-01';
    REPORT_RANGE.to = '2026-08-31';
  });
  await page.click('#tab-reports');
  await page.waitForTimeout(400);

  await page.locator('.report-payroll .link-cell').first().click();
  await page.waitForTimeout(300);
  check('a name in the pay sheet opens that worker\'s days',
    await page.locator('#workerDaysModal').isVisible() &&
    (await page.textContent('#workerDaysTitle')) === 'דוד');
  check('every day in the range is listed, absences included',
    (await page.locator('#workerDaysBody .wday').count()) === 4);   // 2 worked, 1 absent, 1 total

  const amounts = await page.locator('#workerDaysBody .wday-money')
    .evaluateAll(nodes => nodes.map(n => n.textContent.trim()));
  check('a doubled day is shown at twice the daily rate',
    amounts[0] === '800', JSON.stringify(amounts));
  check('and a day with extra hours adds them at the hourly rate',
    amounts[1] === '500', JSON.stringify(amounts));
  check('an absent day is left blank rather than shown as zero owed',
    amounts[2] === '');

  check('the breakdown totals exactly what the pay sheet says',
    amounts[3] === (await page.evaluate(() =>
      String(Math.round(payrollRows().find(r => r.workerId === 'w_01').amount)))),
    JSON.stringify(amounts));
  check('and it says out loud that two sites are one day',
    (await page.textContent('#workerDaysBody')).includes('שני אתרים - יום אחד'));

  await page.locator('#workerDaysModal').getByRole('button', { name: 'סגור' }).click();
  await page.waitForTimeout(200);
  check('closing it goes back to the report',
    !(await page.locator('#workerDaysModal').isVisible()));
  await page.context().close();
}

// ---------------------------------------------------------------- backup age
{
  // While sync is off, this file is the only copy that survives losing the phone - and
  // an iPhone that was never added to the home screen clears its storage after a week.
  const page = await open();
  await seedRoster(page);
  await page.click('#tab-roster');
  await page.waitForTimeout(300);
  check('with no backup ever saved, the app says so',
    (await page.textContent('#backupAge')).includes('עוד לא נשמר'));
  check('and says it as a warning while nothing else holds a copy',
    (await page.locator('#backupAge').getAttribute('class')).includes('hint-warn'));

  await page.evaluate(() => { Store.set('scheduleData:lastBackup', todayStr()); render(); });
  await page.waitForTimeout(200);
  check('after a backup it reads as today, quietly',
    (await page.textContent('#backupAge')).includes('היום') &&
    !(await page.locator('#backupAge').getAttribute('class')).includes('hint-warn'));

  await page.evaluate(() => {
    const old = parseLocalDate(todayStr());
    old.setDate(old.getDate() - 9);
    Store.set('scheduleData:lastBackup', toLocalDateStr(old));
    render();
  });
  await page.waitForTimeout(200);
  check('nine days later it counts the days and warns again',
    (await page.textContent('#backupAge')).includes('9') &&
    (await page.locator('#backupAge').getAttribute('class')).includes('hint-warn'));

  await page.evaluate(() => { FarkadSync.status = 'synced'; render(); });
  await page.waitForTimeout(200);
  check('but not while the cloud holds a second copy',
    !(await page.locator('#backupAge').getAttribute('class')).includes('hint-warn'));
  await page.context().close();
}

// ---------------------------------------------------------------- printed in colour
{
  // Site colours are inline styles, and by default a browser prints backgrounds only if
  // the person ticks the box. print-color-adjust ticks it from the stylesheet, so the
  // printed week - and the PDF that reaches WhatsApp - keeps its colours.
  const page = await open();
  await seedRoster(page);
  await page.evaluate(() => {
    assignPlace(State.schedule, '2026-08-12', 'w_01', 'actual', 'p_01');
    State.save(); showView('week');
  });
  await page.waitForTimeout(300);
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(200);

  const printed = await page.locator('.cell-line').first().evaluate(node => {
    const style = getComputedStyle(node);
    return {
      colour: style.color,
      background: style.backgroundColor,
      adjust: style.webkitPrintColorAdjust || style.printColorAdjust
    };
  });
  check('on paper the site badge keeps its colour instead of going blank',
    printed.background !== 'rgba(0, 0, 0, 0)' &&
    printed.colour === 'rgb(255, 255, 255)' &&
    printed.adjust === 'exact', JSON.stringify(printed));
  await page.emulateMedia({ media: 'screen' });
  await page.context().close();
}

// ---------------------------------------------------------------- undo
{
  // Clearing a row is one tap among twelve, on a phone, at night. It will be the wrong
  // row sometimes, and without this the only trace is a day that quietly went blank.
  const page = await open();
  await seedRoster(page);
  await page.evaluate(() => {
    assignPlace(State.schedule, '2026-08-12', 'w_01', 'actual', 'p_01', RATE_DOUBLE);
    assignPlace(State.schedule, '2026-08-12', 'w_01', 'actual', 'p_02', RATE_EXTRA, 2);
    State.save(); setDayMode('workers');
  });
  await page.waitForTimeout(200);

  await page.locator('.wrow').first().getByRole('button', { name: /נקה/ }).click();
  await page.waitForTimeout(250);
  check('clearing a row happens immediately, with no dialog in the way',
    (await page.evaluate(() =>
      entriesFor(State.schedule, '2026-08-12', 'w_01', 'actual').length)) === 0);
  check('but it says what it just did, and offers to take it back',
    await page.locator('#undoBar').isVisible() &&
    (await page.textContent('#undoBar')).includes('דוד'));

  await page.locator('#undoBar').getByRole('button', { name: 'בטל' }).click();
  await page.waitForTimeout(300);
  const restored = await page.evaluate(() =>
    entriesFor(State.schedule, '2026-08-12', 'w_01', 'actual')
      .map(e => `${e.placeId}:${e.rate || 'normal'}:${e.extraHours || 0}`));
  check('undo restores both sites, with their rates and hours intact',
    JSON.stringify(restored) === '["p_01:double:0","p_02:extra:2"]', JSON.stringify(restored));
  check('and the bar goes away once used', !(await page.locator('#undoBar').isVisible()));

  // an undo taken to a different day would be a second mistake, not a fix
  await page.locator('.wrow').first().getByRole('button', { name: /נקה/ }).click();
  await page.waitForTimeout(250);
  await page.evaluate(() => { State.date = '2026-08-05'; render(); });
  await page.locator('#undoBar').getByRole('button', { name: 'בטל' }).click();
  await page.waitForTimeout(300);
  check('undo restores into the day the change was made on, not the one on screen',
    (await page.evaluate(() =>
      entriesFor(State.schedule, '2026-08-12', 'w_01', 'actual').length)) === 2 &&
    (await page.evaluate(() =>
      entriesFor(State.schedule, '2026-08-05', 'w_01', 'actual').length)) === 0);

  // an absence cancelled by mistake is the same kind of loss
  await page.evaluate(() => {
    State.date = '2026-08-12';
    State.commit(markAbsent(State.schedule, '2026-08-12', 'w_03', 'actual'));
    setDayMode('sites');
  });
  await page.waitForTimeout(300);
  await page.locator('.chip-absent').getByRole('button').click();
  await page.waitForTimeout(250);
  await page.locator('#undoBar').getByRole('button', { name: 'בטל' }).click();
  await page.waitForTimeout(300);
  check('cancelling an absence is undoable too',
    (await page.evaluate(() => isAbsent(State.schedule, '2026-08-12', 'w_03', 'actual'))));
  await page.context().close();
}

// ---------------------------------------------------------------- site colours
{
  const page = await open();
  await page.evaluate(() => {
    State.schedule.workers = [{ id: 'w_01', name: 'דוד', active: true }];
    State.schedule.places = Array.from({ length: 12 }, (unused, i) => ({
      id: `p_${String(i + 1).padStart(2, '0')}`, name: `אתר ${i + 1}`, active: true
    }));
    State.date = '2026-08-12';
    assignPlace(State.schedule, State.date, 'w_01', 'actual', 'p_03');
    State.save(); setDayMode('workers');
  });
  await page.waitForTimeout(200);

  const badge = page.locator('.wrow .tag-place').first();
  const colourOf = locator => locator.evaluate(node => getComputedStyle(node).backgroundColor);
  const badgeColour = await colourOf(badge);
  check('an assignment badge carries the site colour, not the accent',
    badgeColour === 'rgb(21, 128, 61)', badgeColour);
  check('the badge text is white on it',
    (await badge.evaluate(node => getComputedStyle(node).color)) === 'rgb(255, 255, 255)');

  await page.evaluate(() => openAssignSheet('w_01'));
  await page.waitForTimeout(250);
  const tile = page.locator('.sheet-place').nth(2);
  check('the picker button for a site is the same colour as its badge',
    (await colourOf(tile)) === badgeColour);
  check('and it is filled, not outlined',
    (await tile.evaluate(node => getComputedStyle(node).color)) === 'rgb(255, 255, 255)');

  // the colour belongs to the site for as long as the site exists
  const before = await page.evaluate(() =>
    State.schedule.places.map(p => siteColorVar(p.id)));
  await page.evaluate(() => {
    State.place('p_01').active = false;                      // archive the first
    State.schedule.places.reverse();                         // and re-order the list
    State.schedule.places.push({ id: 'p_13', name: 'חדש', active: true });
    State.save(); render();
  });
  const after = await page.evaluate(() =>
    ['p_01', 'p_02', 'p_03', 'p_12'].map(id => siteColorVar(id)));
  check('archiving, re-ordering and adding sites never repaints an existing one',
    JSON.stringify(after) === JSON.stringify([before[0], before[1], before[2], before[11]]),
    JSON.stringify(after));

  check('the palette is ten colours, then it wraps',
    (await page.evaluate(() => siteColorVar('p_11'))) ===
    (await page.evaluate(() => siteColorVar('p_01'))));
  check('a wrapped site is marked so the repeat is visible',
    (await page.evaluate(() => siteMark('p_11'))) === '◆' &&
    (await page.evaluate(() => siteMark('p_01'))) === '');
  check('the name is still written out in full, colour or no colour',
    (await page.locator('.sheet-place').nth(10).textContent()).includes('אתר 11'));

  // white on every one of the ten, in both themes - the palette is useless if a label
  // cannot be read on the tile it sits on
  const worst = await page.evaluate(() => {
    const lum = c => {
      const [r, g, b] = c.map(v => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const parse = value => value.match(/\d+/g).slice(0, 3).map(Number);
    const probe = document.createElement('div');
    document.body.appendChild(probe);
    let low = 99, which = '';
    for (let i = 1; i <= 10; i++) {
      probe.style.background = `var(--site-${i})`;
      const bg = lum(parse(getComputedStyle(probe).backgroundColor));
      const ratio = (1 + 0.05) / (bg + 0.05);
      if (ratio < low) { low = ratio; which = `site-${i}`; }
    }
    probe.remove();
    return { low: Math.round(low * 100) / 100, which };
  });
  check('white text clears 4.5:1 on every site colour',
    worst.low >= 4.5, `worst ${worst.low}:1 on ${worst.which}`);
  await page.context().close();
}

{
  const page = await open({ colorScheme: 'dark' });
  const worst = await page.evaluate(() => {
    const lum = c => {
      const [r, g, b] = c.map(v => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const parse = value => value.match(/\d+/g).slice(0, 3).map(Number);
    const probe = document.createElement('div');
    document.body.appendChild(probe);
    let low = 99, which = '';
    for (let i = 1; i <= 10; i++) {
      probe.style.background = `var(--site-${i})`;
      const bg = lum(parse(getComputedStyle(probe).backgroundColor));
      const ratio = (1 + 0.05) / (bg + 0.05);
      if (ratio < low) { low = ratio; which = `site-${i}`; }
    }
    probe.remove();
    return { low: Math.round(low * 100) / 100, which };
  });
  check('and clears it again on the dark palette',
    worst.low >= 4.5, `worst ${worst.low}:1 on ${worst.which}`);
  await page.context().close();
}

// ---------------------------------------------------------------- catching up
{
  // The week is usually entered days later, off paper. Navigation is the arrows, the
  // tappable date title, and the week map - the strip carousel was removed on request.
  const page = await open();
  await seedRoster(page);
  await page.evaluate(() => {
    // Pinned: the drawer shows exactly two accounts anchored at 2026-08-07, so on the
    // real clock these fixtures roll out of view on 2026-09-04 and the block starts
    // failing for a reason that has nothing to do with the app.
    todayStr = () => '2026-08-12';
    assignPlace(State.schedule, '2026-08-10', 'w_01', 'actual', 'p_01');
    assignPlace(State.schedule, '2026-08-10', 'w_02', 'actual', 'p_01');
    markAbsent(State.schedule, '2026-08-10', 'w_03', 'actual');
    State.save(); render();
  });

  check('the carousel is gone from the main screen',
    (await page.locator('.day-strip').count()) === 0);

  // its replacement, the way the owner asked: a ☰ in the header corner opens a side
  // list of the working days, full names, newest first
  await page.locator('.day-nav .drawer-btn').click();
  await page.waitForTimeout(300);
  check('the ☰ opens the days drawer',
    await page.locator('.day-drawer.drawer-open').isVisible());
  check('two whole accounts: twenty-four working days, no Saturdays',
    (await page.locator('.drawer-day').count()) === 24 &&
    !(await page.textContent('#dayDrawerList')).includes('שבת'));
  check('grouped as the running account and the one before it',
    (await page.textContent('#dayDrawerList')).includes('החשבון הנוכחי') &&
    (await page.textContent('#dayDrawerList')).includes('החשבון הקודם'));
  check('each account opens on Friday, its first working day',
    (await page.locator('.drawer-day .dd-name').first().textContent()).includes('שישי'));
  check('a finished day wears a check mark',
    (await page.locator('.drawer-day.dd-full .dd-count').first().textContent()) === '✓ 3/3');
  check('and today is named as such',
    (await page.locator('.dd-today').count()) === 1);
  check('the jump-home button names today\'s date',
    (await page.locator('.drawer-today').textContent()).includes('חזרה להיום'));

  await page.locator('.drawer-day').filter({ hasText: '10/08' }).click();
  await page.waitForTimeout(300);
  check('tapping a day goes there and the drawer steps aside',
    (await page.evaluate(() => State.date)) === '2026-08-10' &&
    !(await page.locator('.day-drawer.drawer-open').count()));
  await page.evaluate(() => { State.date = '2026-08-12'; render(); });

  await page.locator('.day-nav .drawer-btn').click();
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check('Escape closes the drawer like any other layer',
    (await page.locator('.day-drawer.drawer-open').count()) === 0);

  // the one input error that costs money is the wrong date; the bar that says which
  // day is being edited is pinned and never scrolls away
  check('the now-editing line names the day and date together',
    (await page.textContent('.now-editing')).includes('12/08'));
  check('and it is pinned, not scrolled away',
    (await page.locator('.progress').evaluate(n => getComputedStyle(n).position)) === 'sticky');

  await page.getByRole('button', { name: 'יום קודם', exact: true }).click();
  await page.getByRole('button', { name: 'יום קודם', exact: true }).click();
  await page.waitForTimeout(300);
  check('the arrows still walk to any day',
    (await page.evaluate(() => State.date)) === '2026-08-10');
  check('stepping a day blinks the now-editing line once',
    (await page.locator('.progress.now-flash').count()) === 1);
  check('and the line follows to the new day',
    (await page.textContent('.now-editing')).includes('10/08'));
  check('and the days recorded there are on screen',
    (await page.textContent('.progress-line')).includes('3 מתוך 3'));

  // a mistake found a week later still has to be fixable: nothing is closed off by age
  await page.evaluate(() => { State.date = '2026-08-04'; render(); });
  await page.evaluate(() => openAssignSheet('w_01'));
  await page.waitForTimeout(250);
  await page.locator('.sheet-place').first().click();
  await page.waitForTimeout(250);
  check('a day from last week can still be recorded',
    (await page.evaluate(() =>
      entriesFor(State.schedule, '2026-08-04', 'w_01', 'actual').length)) === 1);

  await page.evaluate(() => {
    State.commit(clearWorkerDay(State.schedule, '2026-08-10', 'w_01', 'actual'));
  });
  await page.waitForTimeout(200);
  check('and a wrong entry from days ago can be taken back',
    (await page.evaluate(() =>
      entriesFor(State.schedule, '2026-08-10', 'w_01', 'actual').length)) === 0);

  await page.context().close();
}

// ---------------------------------------------------------------- install prompt
{
  // An iPhone in Safari: no install event exists, and the storage is wiped after a week
  // unless the site is on the home screen - so the instructions have to be spelled out.
  const page = await open({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  });
  const banner = page.locator('#installBanner');
  check('an empty first visit is not warned about losing nothing',
    !(await banner.isVisible()));
  await seedRoster(page);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(500);
  check('an iPhone is told how to install, by hand',
    await banner.isVisible() &&
    (await banner.textContent()).includes('הוסף למסך הבית'));
  check('and told why it matters, not just asked',
    (await banner.textContent()).includes('מוחק את הנתונים'));

  await banner.getByRole('button').last().click();
  await page.waitForTimeout(200);
  check('dismissing it hides it', !(await banner.isVisible()));
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(400);
  check('and it stays dismissed on the next visit',
    !(await page.locator('#installBanner').isVisible()));
  await page.context().close();
}

{
  // Android/Chrome: the browser can install it in one tap, so the banner offers that
  // instead of a paragraph of instructions.
  const page = await open();
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt');
    event.prompt = () => { window.__prompted = true; };
    event.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(event);
  });
  await page.waitForTimeout(200);
  const banner = page.locator('#installBanner');
  check('a browser that can install offers a button', await banner.isVisible());
  await banner.getByRole('button', { name: 'התקן', exact: true }).click();
  await page.waitForTimeout(250);
  check('the button hands off to the browser',
    (await page.evaluate(() => window.__prompted)) === true);
  check('and the banner steps out of the way afterwards', !(await banner.isVisible()));
  await page.context().close();
}

{
  const page = await open();
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const cache = await caches.open(names[0]);
    return (await cache.keys()).map(r => new URL(r.url).pathname);
  });
  check('the install prompt is part of the offline shell',
    cached.some(p => p.endsWith('/js/ui/install.js')), String(cached.length));
  await page.context().close();
}

// ---------------------------------------------------------------- inside a frame
{
  // A preview or an embed runs the app in a sandboxed frame, where prompt/confirm/alert
  // are ignored, localStorage throws on access, and reading navigator.serviceWorker
  // throws too. All three fail silently, so this is checked rather than assumed.
  const page = await newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/tests/embedded.html`, { waitUntil: 'load' });
  await page.waitForTimeout(800);

  const app = page.frames().find(frame => frame.url().includes('index.html'));
  check('the app runs inside a sandboxed frame at all', Boolean(app));
  check('and boots without an uncaught error', errors.length === 0, errors.join(' | '));

  await app.click('#tab-roster');
  await app.waitForTimeout(200);
  await app.getByRole('button', { name: '+ הוסף עובד' }).click();
  await app.fill('#workerFormName', 'מוחמד');
  await app.getByRole('button', { name: 'שמור', exact: true }).click();
  await app.waitForTimeout(300);
  check('a worker can be added with no browser storage at all',
    (await app.locator('#workerList .roster-row').count()) === 1);

  // the one that was actually broken: prompt() is ignored here, so the old button did
  // nothing at all and said nothing about it
  await app.getByRole('button', { name: '+ הוסף אתר' }).click();
  await app.waitForTimeout(200);
  await app.fill('#askInput', 'הרצליה');
  await app.click('#askOk');
  await app.waitForTimeout(300);
  check('and so can a site',
    (await app.locator('#placeList .roster-row').count()) === 1);

  await app.click('#tab-day');
  await app.waitForTimeout(300);
  // whichever view the day opens on, the new worker has to be reachable from it
  check('the day screen then has the worker on it',
    (await app.textContent('#dayView')).includes('מוחמד'));

  // and the empty states lead somewhere instead of just stating a fact
  const fresh = await newPage();
  await fresh.goto(`${BASE}/tests/embedded.html`, { waitUntil: 'load' });
  await fresh.waitForTimeout(700);
  const blank = fresh.frames().find(frame => frame.url().includes('index.html'));
  check('an empty app offers the button that fixes it',
    await blank.locator('.setup-card').getByRole('button', { name: '+ הוסף עובד' }).isVisible());
  await blank.locator('.setup-card').getByRole('button', { name: '+ הוסף עובד' }).click();
  await blank.waitForTimeout(300);
  check('and it opens the form on the right screen',
    await blank.locator('#workerFormModal').isVisible() &&
    (await blank.evaluate(() => currentView)) === 'roster');

  await fresh.context().close();
  await page.context().close();
}

await browser.close();
await server.close();
const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
