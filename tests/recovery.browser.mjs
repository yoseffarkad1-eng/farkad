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
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const EXEC = process.env.CHROME_PATH || undefined;

const server = process.env.SMOKE_URL
  ? { url: process.env.SMOKE_URL, close: () => {} }
  : await serve(new URL('..', import.meta.url).pathname);
const BASE = server.url;

// Whatever the ORIGIN handed the browser, hashed against the commit.
//
// SMOKE_URL points this suite at a server somebody is already running. Nothing checked
// what that server served, so an origin rooted at another tree passed every check in this
// file and the count meant nothing. Each shell path is fetched and compared with the Git
// blob at the commit under test - which is also the honest answer to "which bytes did
// these numbers come from".
const SERVED_ROOT = new URL('..', import.meta.url).pathname;
const SERVED_SHA = expectedShaFor(SERVED_ROOT);
const SERVED = await verifyServedAssets(BASE, SERVED_ROOT, SERVED_SHA);


const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? '  PASS' : '**FAIL**'}  ${name}${detail ? '  — ' + detail : ''}`);
};

check('the origin served this commit, byte for byte',
  SERVED.ok, `${SERVED.checked} assets; ${SERVED.wrong.slice(0, 3).join(' | ')}`);

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

// ------------------------------------- every record the file is required to carry, named
//
// The suites above take one family at a time: the queue from every slot, a quarantine made
// in an earlier session, a poisoned map, a pending restore. Each of them proves its own
// family and none of them asks the question a person holding a broken phone is actually
// asking, which is whether ALL of it came out.
//
// So this puts one record on the disk under every key the rescue file is required to carry
// - the app's own list is js/recovery.js, isFarkadSnapshotKey and the two arrays above it -
// presses the button in the settings panel, and asserts each one BY NAME and BY BYTES out
// of the file that came off the press. A key added to that list without being added here
// fails nothing; a key dropped from the sweep fails one check that names it.
//
// And the other half of the same rule: the two live records that are deliberately NOT in
// the file, and a record on this origin that is not this app's. A sweep that widened to
// catch everything would pass every check above and put another site's storage into a file
// a person forwards to whoever is helping them.
{
  const page = await open();
  await seed(page);

  // The keys, and a distinguishable byte string for each. Written straight to the disk:
  // several of these have no writer that can be called - a quarantine copy is made by
  // Recovery when a record will not parse, and a poison copy by js/state.js - and this is
  // asking what the SWEEP finds, not how the wreckage got there.
  const REQUIRED = {
    // The two schedules: what this build writes, and what an older build left.
    'scheduleData': '{"marker":"v1-legacy"}',
    'scheduleData:v2': '{"marker":"the live record"}',
    'scheduleData:migrationIssues': '[{"marker":"a decision nobody answered"}]',
    // A restore that was begun and not finished, and its frozen companion.
    'farkad:pendingReplace': '{"marker":"an unfinished restore"}',
    'farkad:pendingReplace:v71': '{"marker":"the v71 companion"}',
    // Provenance: the whole record, and one entity's own claim.
    'farkad:provenance:v1': '{"marker":"provenance"}',
    'farkad:prov:w_01': '{"marker":"one man\'s provenance"}',
    // The queue, across every key it is written on: two slots and the four marks.
    'farkad:outbox': '{"marker":"slot zero"}',
    'farkad:outbox:active1': '{"marker":"slot one"}',
    'farkad:outbox:op:b1': '{"marker":"a batch"}',
    'farkad:outbox:ack:b1': '{"marker":"an ack"}',
    'farkad:outbox:beat:b1': '{"marker":"a beat"}',
    'farkad:outbox:hold:b1': '{"marker":"a hold"}',
    // Quarantine copies. Every one of these is the ONLY account of bytes nobody could
    // read: the original under the same name has since been written over.
    'scheduleData:v2:damaged': '{"marker":"the first wreck',
    'scheduleData:v2:damaged:2': '{"marker":"the second wreck',
    'scheduleData:v2:ledger:damaged': '{"marker":"a damaged ledger',
    'scheduleData:v2:poison:days.2026-08-12.actual:damaged': '{"marker":"a poisoned day',
    'farkad:outbox:damaged': '{"marker":"a damaged slot',
    'farkad:provenance:v1:damaged': '{"marker":"damaged provenance',
    'farkad:sendClaim:damaged': '{"marker":"a damaged send claim',
    'farkad:deviceId:damaged': '{"marker":"a damaged device id'
  };

  // The send claim is the one record whose place in the file depends on whether it can be
  // READ. A claim that parses is this session's own lock, worthless a second later, and
  // putting it in a file somebody forwards over WhatsApp says nothing about anybody's
  // work - so it is left out. A claim that does NOT parse is the account of why a send
  // waited, and the disk that refused the quarantine copy is the same disk whose half
  // write left it in that state, so those bytes may be the only ones in existence. It is
  // named into the file for that case alone (FarkadSync.unreadableSendClaim).
  //
  // Both halves are asked, because a sweep that got either of them wrong is a sweep that
  // either leaks a lock token or loses the only evidence there is.
  const UNREADABLE_CLAIM = '{"token":"half a write';

  // Deliberately NOT in the file. The first two are live coordination records - one is
  // minted again by the sync layer on any device that has lost it, the other is rewritten
  // twice per send - and carrying either would hand the receiving phone this phone's
  // identity. The last two are not this app's records at all.
  const EXCLUDED = {
    'farkad:deviceId': 'd_this_phone',
    // A claim anybody can read: a token, and a moment that is a moment. This is the shape
    // readSendClaim accepts, and the shape that must never reach the file.
    'farkad:sendClaim': JSON.stringify({
      by: 'd_this_phone', token: 't1', at: Date.now(), beat: Date.now()
    }),
    'someoneelse:damaged': 'another site\'s wreckage',
    'someoneelse': 'another site\'s record'
  };

  await page.evaluate(([required, excluded]) => {
    Object.keys(required).forEach(key => localStorage.setItem(key, required[key]));
    Object.keys(excluded).forEach(key => localStorage.setItem(key, excluded[key]));
    window.__blobs = [];
    const real = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => { window.__blobs.push(blob); return real(blob); };
    window.askTell = () => Promise.resolve();
  }, [REQUIRED, EXCLUDED]);

  // THE REAL BUTTON, in the settings panel, by the onclick the page carries - not the
  // function name typed into evaluate. The panel has to be open for the button to be
  // there at all, which is also how a person reaches it.
  const pressed = await page.evaluate(() => {
    openSettings();
    const button = document.querySelector('button[onclick="exportRecoveryData()"]');
    if (!button) return null;
    button.click();
    return button.textContent;
  });
  check('the rescue export has a button on the settings panel, and it was pressed',
    typeof pressed === 'string' && pressed.length > 0, String(pressed));
  await page.waitForTimeout(500);

  const text = await page.evaluate(() => window.__blobs.length
    ? window.__blobs[window.__blobs.length - 1].text() : null);
  check('and a file came off the press', typeof text === 'string' && text.length > 0,
    String(text).slice(0, 40));

  const file = JSON.parse(text);
  const records = (file && file.records) || {};

  // One check per key, named, so a failure says which record did not come out.
  Object.keys(REQUIRED).forEach(key => {
    check(`the file carries ${key}, byte for byte`, records[key] === REQUIRED[key],
      records[key] === REQUIRED[key] ? ''
        : `${JSON.stringify(records[key])} !== ${JSON.stringify(REQUIRED[key])}`);
  });

  // And nothing may be quietly dropped by being counted rather than named.
  const missing = Object.keys(REQUIRED).filter(key => records[key] !== REQUIRED[key]);
  check('every required record is in the file, with none of them missing',
    missing.length === 0, JSON.stringify(missing));

  Object.keys(EXCLUDED).forEach(key => {
    check(`the file does NOT carry ${key}`, records[key] === undefined,
      JSON.stringify(records[key]));
  });

  // And the other half of the send claim: the same key, bytes nobody can read, exported
  // again. What changes is only whether the record parses.
  await page.evaluate(bytes => {
    localStorage.setItem('farkad:sendClaim', bytes);
    window.__blobs = [];
  }, UNREADABLE_CLAIM);
  await page.evaluate(() => {
    const button = document.querySelector('button[onclick="exportRecoveryData()"]');
    button.click();
  });
  await page.waitForTimeout(500);
  const second = JSON.parse(await page.evaluate(() =>
    window.__blobs[window.__blobs.length - 1].text()));
  check('but a send claim NOBODY CAN READ is carried - it is the only account of why a '
    + 'send waited',
    second.records['farkad:sendClaim'] === UNREADABLE_CLAIM,
    JSON.stringify(second.records['farkad:sendClaim']));

  // The file also has to say what it is and how it was taken, or the phone it is opened
  // on cannot tell a complete rescue from half of one.
  check('and the file says what it is, when it was taken and which build took it',
    file.kind === 'farkad-recovery' && typeof file.takenAt === 'string'
    && typeof file.appVersion === 'string',
    JSON.stringify({ kind: file.kind, takenAt: file.takenAt, appVersion: file.appVersion }));
  check('whether the disk was still answering, whether it was one moment, and whether the '
    + 'handover was written down',
    typeof file.storageReadable === 'boolean' && typeof file.stable === 'boolean'
    && typeof file.handoverRecorded === 'boolean',
    JSON.stringify({ readable: file.storageReadable, stable: file.stable,
      handover: file.handoverRecorded }));
  check('which keys the second reading could no longer see, named rather than implied',
    Array.isArray(file.unreadableKeys), JSON.stringify(file.unreadableKeys));
  check('the quarantines this session made, with the copy each one went to',
    Array.isArray(file.problems), JSON.stringify(file.problems).slice(0, 120));
  check('the decisions the migration refused to guess',
    Array.isArray(file.pendingDecisions), JSON.stringify(file.pendingDecisions).slice(0, 80));

  // The schedule AS THE APP IS HOLDING IT - which on the device this file exists for is
  // not any record on the disk, because scheduleData:v2 will not parse and the app is
  // running off a migrated v1 it deliberately never wrote down.
  check('and the live schedule beside the wreckage, marked as derived and not as a record',
    file.liveSchedule && Array.isArray(file.liveSchedule.workers)
    && file.liveSchedule.workers.some(worker => worker.id === 'w_01'),
    JSON.stringify(Object.keys(file.liveSchedule || {})));

  // NOTHING WAS TAKEN OFF THE PHONE to make the file. The rule the whole recovery path is
  // built on, asked of the disk after the press.
  const still = await page.evaluate(keys => {
    const gone = [];
    keys.forEach(key => { if (localStorage.getItem(key) === null) gone.push(key); });
    return gone;
  }, Object.keys(REQUIRED).concat(Object.keys(EXCLUDED)));
  check('and every record is still on the device afterwards - the export copies, never moves',
    still.length === 0, JSON.stringify(still));

  await page.context().close();
}

await browser.close();
await server.close();
const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
