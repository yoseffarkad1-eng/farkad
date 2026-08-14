// Dev-only smoke tests. Nothing here ships to production and the app still has no
// build step.
//
//   python3 -m http.server 8802 --directory .
//   node tests/smoke.mjs
//
// Override with SMOKE_URL, CHROME_PATH and PLAYWRIGHT_MODULE if your paths differ.

// ESM ignores NODE_PATH, so allow an explicit path to a global playwright install.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

const EXEC = process.env.CHROME_PATH || undefined;
const BASE = process.env.SMOKE_URL || 'http://127.0.0.1:8802';

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

  await page.click('#workerPickerModal button.btn-secondary');
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
  await page.click('#workerPickerModal button.btn-secondary');
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

  await page.getByText('↧ מהיום הקודם').click();
  await page.waitForTimeout(400);

  check('copying carries the rate across',
    (await page.evaluate(() => entriesFor(State.schedule, '2026-08-12', 'w_01', 'actual')[0].rate)) === 'double');
  check('copying carries an absence across',
    (await page.evaluate(() => isAbsent(State.schedule, '2026-08-12', 'w_03', 'actual'))));
  check('copying never overwrites someone already recorded',
    (await page.evaluate(() => entriesFor(State.schedule, '2026-08-12', 'w_02', 'actual')
      .map(e => e.placeId).join())) === 'p_01');
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
  check('two sites in one day is still one day worked',
    david.daysWorked === 2, JSON.stringify(david));
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

  check('the printed sheet states the period it covers',
    (await page.getAttribute('.report-payroll .print-period', 'data-period'))
      === '01/08/2026 - 31/08/2026');
  check('but the period line stays off the screen',
    (await page.evaluate(() =>
      getComputedStyle(document.querySelector('.print-period')).display)) === 'none');

  const bodyText = await page.textContent('#reportsView');
  check('neither report shows an ID number or a phone',
    !bodyText.includes('111') && !bodyText.includes('050-1'));
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

  // archive, never delete: history has to keep resolving
  await page.locator('#workerList .roster-row').first().getByRole('button').nth(1).click();
  await page.waitForTimeout(200);
  await page.click('#askOk');
  await page.waitForTimeout(300);
  check('archiving keeps the worker in the data',
    (await page.evaluate(() => State.schedule.workers.length)) === 3);
  check('an archived worker drops out of the active list',
    (await page.evaluate(() => State.activeWorkers().length)) === 2);
  check('their recorded history survives',
    (await page.evaluate(() => entriesFor(State.schedule, '2026-08-12', 'w_01', 'actual').length)) === 1);

  // a new worker must never reuse an archived id
  await page.evaluate(() => {
    State.schedule.workers = [{ id: 'w_09', name: 'ותיק', active: false }];
  });
  check('ids are never recycled',
    (await page.evaluate(() => State.nextWorkerId())) === 'w_10');
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
    FarkadSync._edits = new Map();
  });

  await page.locator('#migrationList .issue').filter({ hasText: 'הרצליה + תל אביב' })
    .getByText(/פצל ל:/).click();
  await page.waitForTimeout(300);
  check('accepting the suggestion writes both sites',
    (await page.evaluate(() => entriesFor(State.schedule, '2026-08-09', 'w_02', 'actual')
      .map(e => e.placeId).join())) === 'p_01,p_02');
  check('and the decision is sent, not left on the phone that answered it',
    (await page.evaluate(() => Array.from(FarkadSync._edits.keys())))
      .includes('days.2026-08-09.actual.w_02'),
    JSON.stringify(await page.evaluate(() => Array.from(FarkadSync._edits.keys()))));
  await page.evaluate(() => { FarkadSync.adapter = null; FarkadSync._edits = new Map(); });

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
  const merged = await page.evaluate(() => {
    const server = {};
    const apply = p => Object.keys(p).forEach(k => { server[k] = p[k]; });
    ['w_01', 'w_02', 'w_03'].forEach((workerId, i) => {
      const sync = Object.create(FarkadSync);
      sync._edits = new Map();
      sync._stamp = { updatedAt: `2026-08-12T18:0${i}:00.000Z`, updatedBy: `d${i}` };
      sync.adapter = { update(p) { apply(p); return Promise.resolve(); } };
      sync.setStatus = () => {};
      sync.edit(`days.2026-08-12.plan.${workerId}`, { entries: [{ placeId: 'p_01' }] });
      sync.flush();
    });
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
    FarkadSync.adapter.update = () => Promise.reject(new Error('offline'));
    FarkadSync.edit('days.2026-08-12.actual.w_09', { entries: [] });
  });
  await page.waitForTimeout(300);
  check('a failed push is reported',
    (await page.evaluate(() => FarkadSync.status)) === 'error');
  check('a failed push keeps the edit for retry',
    (await page.evaluate(() => FarkadSync._edits.has('days.2026-08-12.actual.w_09'))));
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

// ---------------------------------------------------------------- day: by worker
// The paper being copied from is a grid: names down the side, the site written in the
// middle. So the default view is the roster in its own fixed order, and the order never
// changes under the reader - only how an unfilled row looks.
{
  const page = await open();
  await seedRoster(page);

  check('the day opens by worker, matching the paper',
    (await page.evaluate(() => dayMode)) === 'workers');
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

  await page.locator('.sheet-place').filter({ hasText: 'הרצליה' }).click();
  await page.waitForTimeout(250);
  check('picking a site advances to the next unfilled worker',
    (await page.textContent('#assignSheetTitle')) === 'שרה');
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

  await page.evaluate(() => closeAssignSheet());
  await page.waitForTimeout(200);
  check('the worker row shows both sites',
    (await page.locator('.wrow').first().locator('.tag-place').count()) === 2);
  await page.context().close();
}

// ---------------------------------------------------------------- mode toggle
{
  const page = await open();
  await seedRoster(page);
  await page.getByText('לפי אתרים').click();
  await page.waitForTimeout(250);
  check('by-site view still available', (await page.locator('.site-card').count()) === 2);
  await page.getByText('לפי עובדים').click();
  await page.waitForTimeout(250);
  check('and switches back', (await page.locator('.wrow').count()) === 3);
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
    State.save(); render();
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
      .find(row => row.workerId === 'w_01').daysWorked);
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

  // three days kept, not every day since the app was installed
  const kept = await page.evaluate(() => {
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
    (await page.textContent('#askMessage')).includes('אינו קובץ גיבוי תקין'));
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
  check('and fall back to the plain padding where there is no inset',
    insets.actions === '10px' && insets.app === '120px',
    JSON.stringify(insets));

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
    rows: document.querySelectorAll('.wrow').length
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

  await page.locator('#workerList .roster-row').first().getByRole('button').first().click();
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
  // Pay is settled every second Thursday: a period is Friday through Thursday, twice.
  // The default range is the fortnight ending on the most recent Thursday.
  const page = await open();
  const rangeOn = day => page.evaluate(d => {
    todayStr = () => d;
    return defaultPayrollRange();
  }, day);

  const onThursday = await rangeOn('2026-08-13');   // a Thursday: settlement day
  check('on a Thursday the account ends today',
    onThursday.from === '2026-07-31' && onThursday.to === '2026-08-13',
    JSON.stringify(onThursday));

  const onFriday = await rangeOn('2026-08-14');     // the day after settlement
  check('on a Friday it still shows the account just settled',
    onFriday.to === '2026-08-13', JSON.stringify(onFriday));

  const onWednesday = await rangeOn('2026-08-12');
  check('mid-week it reaches back to the previous Thursday',
    onWednesday.to === '2026-08-06' && onWednesday.from === '2026-07-24',
    JSON.stringify(onWednesday));

  check('and every account runs Friday to Thursday',
    (await page.evaluate(() => {
      const r = defaultPayrollRange();
      return [parseLocalDate(r.from).getDay(), parseLocalDate(r.to).getDay()];
    })).join() === '5,4');
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

  await page.click('#workerDaysModal .btn-secondary');
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
  // Site colours are inline styles, and a browser prints backgrounds only if the person
  // ticks the box. White text on an unprinted background is a blank page.
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
    return { colour: style.color, background: style.backgroundColor };
  });
  check('on paper the site badge is black text, not white on nothing',
    printed.colour === 'rgb(0, 0, 0)' &&
    printed.background === 'rgba(0, 0, 0, 0)', JSON.stringify(printed));
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
    State.save(); render();
  });

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
    State.save(); render();
  });

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
  check('two working weeks: twelve days, no Saturdays',
    (await page.locator('.drawer-day').count()) === 12 &&
    !(await page.textContent('#dayDrawerList')).includes('שבת'));
  check('grouped as this week and last week',
    (await page.textContent('#dayDrawerList')).includes('השבוע') &&
    (await page.textContent('#dayDrawerList')).includes('שבוע שעבר'));
  check('each week opens on Friday, the first working day',
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
  check('the day screen then has the worker on it',
    (await app.locator('.wrow').count()) === 1);

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
const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
