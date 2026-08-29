// The rescue file, through a real browser and a real <input type="file">.
//
//   npm ci
//   npx playwright install chromium      (or: npm run browsers)
//   npm run test:recovery-browser
//
// The data suite drives the same production functions in Node, which is where the
// arithmetic and the disk behaviour are pinned. What it CANNOT say is whether the file a
// person is holding actually reaches importBackup: it hands the handler a plain object
// with a string on it, and a real change event carries a File, read by a real FileReader,
// off a real input the person tapped. Every fault in between is invisible to it.
//
// What this deliberately does NOT claim: nothing here proves anything about iOS, Files,
// or whether a download was saved. A headless Chromium is a browser, not a phone.
//
// Override with SMOKE_URL for a server you are already running, CHROME_PATH for a
// browser binary, and PLAYWRIGHT_MODULE for a playwright installed somewhere else.

import { serve } from './serve.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const EXEC = process.env.CHROME_PATH || undefined;

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

async function open() {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  return page;
}

// A crew, and one day recorded against it, written the way the app writes.
async function seed(page) {
  await page.evaluate(() => {
    State.schedule.workers = [
      { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 },
      { id: 'w_02', name: 'שרה', active: true, dailyRate: 350, hourlyRate: 0 }
    ];
    State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
    State.save({ silent: true });
  });
}

// The app's own dialogs, answered from the test - and every question recorded, so a run
// can say whether anything was asked BEFORE the data changed.
async function answerDialogs(page, confirmWith = true) {
  await page.evaluate(answer => {
    window.__asked = [];
    window.__told = [];
    window.askConfirm = question => {
      window.__asked.push(question && question.title ? String(question.title) : String(question));
      return Promise.resolve(answer);
    };
    window.askTell = message => {
      window.__told.push(typeof message === 'string' ? message : JSON.stringify(message));
      return Promise.resolve();
    };
    window.askText = question => Promise.resolve(String((question || {}).title || ''));
  }, confirmWith);
}

// Through the input the person taps. setInputFiles gives the element a real File; the
// change event, the FileReader and the handler are the app's own.
async function importThrough(page, name, text) {
  await page.setInputFiles('#importInput', {
    name, mimeType: 'application/json', buffer: Buffer.from(text, 'utf8')
  });
  await page.waitForTimeout(700);
}

// ---------------------------------------------------------------- a rescue file opens
{
  const source = await open();
  await seed(source);

  // THE REAL EXPORT. exportRecoveryData builds the Blob and presses an anchor at it;
  // createObjectURL is where those exact bytes pass, so that is where they are taken.
  // A test that assembles the payload itself proves the reader works and nothing about
  // what the writer writes.
  await source.evaluate(() => {
    window.__blobs = [];
    const real = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => { window.__blobs.push(blob); return real(blob); };
    window.askTell = () => Promise.resolve();
  });

  await source.evaluate(() => {
    State.commit(assignPlace(State.schedule, '2026-08-10', 'w_01', 'actual', 'p_01'));
    FarkadSync.queueBatch([{
      path: 'days.2026-08-11.actual.w_02',
      value: { entries: [{ placeId: 'p_01' }] }
    }]);
    exportRecoveryData();
  });
  await source.waitForTimeout(400);

  const file = await source.evaluate(() => window.__blobs.length
    ? window.__blobs[window.__blobs.length - 1].text()
    : null);
  check('the real export produced a file', typeof file === 'string' && file.length > 0,
    String(file).slice(0, 40));
  const parsed = JSON.parse(file);
  check('and it says what it is and how it was taken',
    parsed.kind === 'farkad-recovery' && typeof parsed.stable === 'boolean'
    && typeof parsed.handoverRecorded === 'boolean'
    && typeof parsed.storageReadable === 'boolean',
    JSON.stringify({ kind: parsed.kind, stable: parsed.stable,
      handover: parsed.handoverRecorded, readable: parsed.storageReadable }));
  check('with the day that was on the disk and the edit that was only in the queue',
    file.includes('2026-08-10') && file.includes('2026-08-11'));
  await source.context().close();

  const page = await open();
  await seed(page);

  // The confirmation is HELD, so what the disk holds while the question is on screen can
  // be read. Nothing may have moved before the person has answered.
  await page.evaluate(() => {
    window.__asked = [];
    window.__told = [];
    window.__release = null;
    window.askConfirm = question => {
      window.__asked.push(String((question && question.title) || question));
      window.__diskWhileAsking = localStorage.getItem('scheduleData:v2');
      return new Promise(done => { window.__release = () => done(true); });
    };
    window.askTell = message => {
      window.__told.push(typeof message === 'string' ? message : JSON.stringify(message));
      return Promise.resolve();
    };
    window.askText = question => Promise.resolve(String((question || {}).title || ''));
  });
  const before = await page.evaluate(() => localStorage.getItem('scheduleData:v2'));

  // THAT EXACT FILE, through the input a person taps.
  await page.setInputFiles('#importInput', {
    name: 'farkad-recovery-2026-08-29.json',
    mimeType: 'application/json',
    buffer: Buffer.from(file, 'utf8')
  });
  await page.waitForTimeout(600);

  const held = await page.evaluate(() => ({
    asked: window.__asked, disk: window.__diskWhileAsking
  }));
  check('the app asked before replacing anything, and said it was a rescue file',
    held.asked.length === 1 && held.asked[0].includes('חילוץ'),
    JSON.stringify(held.asked));
  check('and nothing on the disk had moved while the question was on screen',
    held.disk === before);

  await page.evaluate(() => window.__release());
  await page.waitForTimeout(600);

  const state = await page.evaluate(() => ({
    told: window.__told,
    days: Object.keys(State.schedule.days || {}).sort(),
    stored: localStorage.getItem('scheduleData:v2')
  }));
  check('the day that was on the disk arrived', state.days.includes('2026-08-10'),
    JSON.stringify(state.days));
  check('and so did the edit that was only in the queue',
    state.days.includes('2026-08-11'), JSON.stringify(state.days));
  check('the record on disk is the rescued one, not what was there before',
    state.stored !== before && String(state.stored).includes('2026-08-11'));

  // A real reload, through the service worker, reading its own storage.
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(500);
  const after = await page.evaluate(() =>
    Object.keys(State.schedule.days || {}).sort());
  check('and it is still there after a real reload',
    after.includes('2026-08-10') && after.includes('2026-08-11'), JSON.stringify(after));
  await page.context().close();
}

// ------------------------------------------------- a file the source could not vouch for
{
  // The two things a rescue file can say about itself that change what the person should
  // do, produced by the REAL export on a phone in each state - not written by hand.
  const source = await open();
  await seed(source);
  await source.evaluate(() => {
    window.__blobs = [];
    const real = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => { window.__blobs.push(blob); return real(blob); };
    window.askTell = () => Promise.resolve();

    // Somebody made HERE, so there is a claim for the handover to retire. Without one,
    // there is nothing to fail at and reporting the handover as recorded is the truth.
    State.schedule.workers.push({
      id: State.nextWorkerId(), name: 'חדש', active: true, dailyRate: 300, hourlyRate: 0
    });
    State.commitRoster();

    // A disk that refuses every provenance write and every removal: the handover cannot
    // be written down, and the export must still happen.
    const set = Storage.prototype.setItem;
    const remove = Storage.prototype.removeItem;
    Storage.prototype.setItem = function (key, value) {
      if (String(key).indexOf('farkad:prov:') === 0) {
        const error = new Error('quota'); error.name = 'QuotaExceededError'; throw error;
      }
      return set.call(this, key, value);
    };
    Storage.prototype.removeItem = function (key) {
      if (String(key).indexOf('farkad:prov:') === 0) return undefined;
      return remove.call(this, key);
    };
    State.commit(assignPlace(State.schedule, '2026-08-10', 'w_01', 'actual', 'p_01'));
    exportRecoveryData();
  });
  await source.waitForTimeout(400);
  const file = await source.evaluate(() => window.__blobs[window.__blobs.length - 1].text());
  const parsed = JSON.parse(file);
  check('the export happened even though the handover could not be recorded',
    typeof file === 'string' && file.length > 0);
  check('and the file says so', parsed.handoverRecorded === false,
    String(parsed.handoverRecorded));
  await source.context().close();

  const page = await open();
  await seed(page);
  await answerDialogs(page, true);
  await importThrough(page, 'farkad-recovery.json', file);
  const told = await page.evaluate(() => window.__told);
  check('the receiving phone is warned about it',
    told.some(message => message.includes('לא נרשם')), JSON.stringify(told));
  await page.context().close();

  // And a file that could not be taken from one moment.
  const shaky = await open();
  await seed(shaky);
  await answerDialogs(shaky, true);
  await importThrough(shaky, 'unstable.json', JSON.stringify(Object.assign({}, parsed,
    { handoverRecorded: true, stable: false })));
  const shakyTold = await shaky.evaluate(() => window.__told);
  check('an unstable rescue says it may be missing the last of it',
    shakyTold.some(message => message.includes('נלקח בזמן')), JSON.stringify(shakyTold));
  await shaky.context().close();
}

// ---------------------------------------------------------------- the ways it goes wrong
{
  const page = await open();
  await seed(page);
  await answerDialogs(page, true);
  const before = await page.evaluate(() => localStorage.getItem('scheduleData:v2'));

  await importThrough(page, 'broken.json', '{"kind":"farkad-recovery","records":');

  const state = await page.evaluate(() => ({
    asked: window.__asked, told: window.__told,
    stored: localStorage.getItem('scheduleData:v2')
  }));
  check('a file that is not JSON changes nothing', state.stored === before);
  check('and nothing was asked, because there was nothing to ask about',
    state.asked.length === 0, JSON.stringify(state.asked));
  check('the person is told the file was not loaded',
    state.told.some(message => message.includes('לא נטען') || message.includes('אינו קובץ')),
    JSON.stringify(state.told));
  await page.context().close();
}

{
  const page = await open();
  await seed(page);
  await answerDialogs(page, true);
  const before = await page.evaluate(() => localStorage.getItem('scheduleData:v2'));

  // A rescue file with nothing readable in it.
  await importThrough(page, 'empty.json', JSON.stringify({
    kind: 'farkad-recovery',
    records: { 'scheduleData:v2': '{"workers":[{"id":"w_0' }
  }));

  const state = await page.evaluate(() => ({
    asked: window.__asked, stored: localStorage.getItem('scheduleData:v2')
  }));
  check('a rescue file with no usable schedule changes nothing',
    state.stored === before);
  check('and is refused before the question is asked',
    state.asked.length === 0, JSON.stringify(state.asked));
  await page.context().close();
}

{
  const page = await open();
  await seed(page);
  await answerDialogs(page, false);          // the person says no
  const before = await page.evaluate(() => localStorage.getItem('scheduleData:v2'));

  await importThrough(page, 'rescue.json', JSON.stringify({
    kind: 'farkad-recovery',
    records: {
      'scheduleData:v2': JSON.stringify({
        schemaVersion: 2,
        workers: [{ id: 'w_09', name: 'אחר', active: true, dailyRate: 1, hourlyRate: 0 }],
        places: [{ id: 'p_09', name: 'אחר', active: true }],
        days: { '2026-01-01': { plan: {}, actual: { w_09: { entries: [{ placeId: 'p_09' }] } } } },
        advances: {}, updatedAt: '2026-01-01T00:00:00.000Z', updatedBy: 'd_other'
      })
    }
  }));

  const state = await page.evaluate(() => ({
    asked: window.__asked,
    stored: localStorage.getItem('scheduleData:v2'),
    workers: (State.schedule.workers || []).map(worker => worker.id)
  }));
  check('the question was asked', state.asked.length === 1, JSON.stringify(state.asked));
  check('saying no leaves the disk exactly as it was', state.stored === before);
  check('and the crew on screen is still this phone’s',
    !state.workers.includes('w_09'), JSON.stringify(state.workers));
  await page.context().close();
}

{
  const page = await open();
  await seed(page);
  await answerDialogs(page, true);
  const before = await page.evaluate(() => localStorage.getItem('scheduleData:v2'));

  // A FileReader that fails. The browser does this when the file is gone from under it -
  // a photo deleted from the picker, a file on a share that dropped - and the handler
  // must not be left half-way through with the screen already changed.
  await page.evaluate(() => {
    const Real = window.FileReader;
    window.FileReader = function () {
      const reader = new Real();
      reader.readAsText = () => {
        setTimeout(() => {
          if (typeof reader.onerror === 'function') {
            reader.onerror(new Error('the file could not be read'));
          }
        }, 0);
      };
      return reader;
    };
  });

  await importThrough(page, 'rescue.json', JSON.stringify({
    kind: 'farkad-recovery', records: {}
  }));

  const state = await page.evaluate(() => ({
    asked: window.__asked,
    told: window.__told,
    stored: localStorage.getItem('scheduleData:v2')
  }));
  check('a file that cannot be read changes nothing', state.stored === before);
  check('and does not ask to replace anything', state.asked.length === 0,
    JSON.stringify(state.asked));
  check('the person is told rather than left looking at a screen that did nothing',
    state.told.length > 0, JSON.stringify(state.told));
  await page.context().close();
}

await browser.close();
await server.close();
const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
