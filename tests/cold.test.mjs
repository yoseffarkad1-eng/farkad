// tests/cold.test.mjs
//
// PHASE 7: what has left the server's live document is kept on the phone in IndexedDB
// instead of in the localStorage record - and nothing is lost, nothing is claimed early,
// and a cold store that is gone is never read as "nothing was archived".
//
//   node tests/cold.test.mjs
//
//   K0  the flag and the words: shipped shut; shut, NO database is opened and every byte
//       written is the byte a phone without this code writes
//   K1  the move: the record shrinks, memory and every figure do not, across a reopen
//   K2  killed at every step of the move, and inside the cold store's own commits: never
//       both gone, and the next open finishes the job (law 3)
//   K3  a cold store that is evicted, empty, wrong, refusing to open, slow, or not there:
//       noticed, said, the right things refused, and made whole from the server (law 10)
//   K4  the files and the restore doors: everything, from both stores; the rescue file
//       with the main record quarantined
//   K5  two tabs on one disk
//   K6  the reclaim ladder cannot reach it; a full localStorage loses nothing
//   K7  a browser with no IndexedDB: everything stays where it is today, and ⋯ says so
//
// The IndexedDB here is tests/fake-indexeddb.mjs. The same questions are put to the real
// one in Chromium by tests/cold.browser.mjs.

import { makeCloud, settle, settleUntil } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import { makeIndexedDB } from './fake-indexeddb.mjs';
import {
    FORTNIGHT, WEEK1, WEEK2, TODAY, clone, stamp, canonical, payDevice, world, plan, openBook
} from './paybook.world.mjs';

const SCHEDULE = 'scheduleData:v2';
const MARK = 'farkad:cold:u:';
const DB = 'farkad-cold';
const UNITS = 'units';
const SEP = '2026-09';
const OCT = '2026-10';
const LATER = '2027-05-01';
const FLAGS_OFF = { paybookQueue: false, months: true };                 // Phase 6 as it stands
const FLAGS_ON = { paybookQueue: false, months: true, cold: true };

// The record of tests/months.test.mjs: the pay book's own fortnight in October, a Rima
// count inside it, a Rima count alone in September, one day in November nobody closes.
const baseOf = octoberRima => {
    const first = world();
    openBook(first, undefined, 'd_seed');
    const put = change => given('a base edit is committed', first.State.commit(change) === true, JSON.stringify(change));
    if (octoberRima) put(first.call('setRimaCount', first.State.schedule, '2026-10-05', 'p_a', 3));
    put(first.call('setRimaCount', first.State.schedule, '2026-09-28', 'p_b', 2));
    put(first.call('assignPlace', first.State.schedule, '2026-11-02', 'w_salim', 'actual', 'p_a', undefined, 0));
    const schedule = clone(first.State.schedule);
    return { schedule, wire: first.call('cloudDocument', schedule) };
};
const BASE = baseOf(true);

function phone(id, cloud, options = {}) {
    const device = payDevice(Object.assign({ deviceId: id, flags: FLAGS_OFF,
        storage: options.storage || { [SCHEDULE]: JSON.stringify(BASE.schedule) } }, options));
    device.Sync.pushDelayMs = 5;
    device.global('Cold').deadlineMs = options.deadlineMs || 150;
    // The move starts by itself once the boot read is over. A suite that wants to watch
    // its steps, or to stop it, says so BEFORE the app loads its record.
    if (typeof options.before === 'function') options.before(device);
    device.State.load();
    if (cloud) device.Sync.connect(cloud.adapter);
    return device;
}
const quiet = device => device.Sync.status === 'synced' && device.Sync.pendingCount() === 0;
const settled = (devices, limit = 8000) => settleUntil(() => devices.every(quiet), limit, 5);
const cold = device => device.global('Cold');
const ready = async device => { await cold(device).ready; await settle(5); return device; };

const RANGE = ['2026-09-01', '2026-11-30'];
const figures = device => {
    const S = device.State.schedule;
    return canonical({
        payroll: device.call('payrollReport', S, RANGE[0], RANGE[1]),
        invoice: device.call('invoiceReport', S, RANGE[0], RANGE[1]),
        each: S.workers.map(man => device.call('workerDaysReport', S, man, RANGE[0], RANGE[1])),
        rima: device.call('rimaReport', S, RANGE[0], RANGE[1]),
        accounts: device.call('accountsList', S, LATER),
        history: device.call('closureHistory', S, {}),
        days: S.days, ledger: S.ledger.advances, pay: S.pay
    });
};
// The whole of memory, as one string, without the two stamps a save moves.
const memory = device => canonical(Object.assign({}, device.State.schedule, { updatedAt: null, updatedBy: null }));
const onDisk = source => JSON.parse(typeof source === 'string' ? source : source.raw(SCHEDULE));
const daysIn = (record, month) => Object.keys((record && record.days) || {}).filter(date => date.slice(0, 7) === month).sort();
const marksOf = storage => Object.keys(storage).filter(key => key.indexOf(MARK) === 0).map(key => key.slice(MARK.length)).sort();

async function close(device, worker, period, choices = {}, hour = '10') {
    const draw = paid => plan(device, 'planClosure', worker, period,
        Object.assign({ method: 'cash' }, choices, paid === null ? {} : { paid, paidOn: TODAY }),
        stamp(TODAY, device.id, hour));
    const first = draw(null);
    given(`the closure of ${worker} is allowed`, first.ok === true, JSON.stringify(first.reasons));
    const drawn = draw(first.review.netDue);
    const answer = await device.Sync.transactPaybook(drawn);
    given(`the closure of ${worker} is on the server`, answer.state === 'closed', JSON.stringify(answer));
}

// THE WORLD: every man's October closed and paid; then the five closures and the two
// months (September, October) leave the server's live document. Built ONCE, on a phone
// with the cold store's flag shut - so what it holds is exactly what Phase 6 leaves on a
// phone: everything, in localStorage.
const makeWorld = async (base, id) => {
    const cloud = makeCloud({ payRules: true,
        doc: Object.assign(clone(base.wire), { protocol: 2, revision: 1, lastOpId: 'op_seed' }) });
    const fake = makeIndexedDB();
    const a = phone(id, cloud, { indexedDB: fake.indexedDB, storage: { [SCHEDULE]: JSON.stringify(base.schedule) } });
    await settled([a]);
    for (const man of ['w_khaled', 'w_salim', 'w_nasser']) await close(a, man, FORTNIGHT);
    await close(a, 'w_ahmad', WEEK1);
    await close(a, 'w_ahmad', WEEK2, {}, '11');
    await settled([a]);
    given('the closures left', (await a.Sync.archiveClosed({ today: LATER })).ok === true);
    await settled([a]);
    given('the months left', (await a.Sync.archiveMonths({ today: LATER })).ok === true);
    await settled([a]);
    const named = a.call('coldUnitsNamed', a.State.schedule).map(unit => unit.key).sort();
    given('the server\'s document names two months and five closures',
        named.length === 7 && named.filter(key => key[0] === 'm').join() === `m:${SEP},m:${OCT}`, JSON.stringify(named));
    given('and holds none of their days or entries', daysIn(cloud.doc, OCT).length === 0
        && Object.keys(cloud.doc.pay).filter(id => id !== 'po_open').length === 0);
    return { cloud, a, fake, named, storage: a.dump(), figures: figures(a), memory: memory(a),
        text: a.raw(SCHEDULE) };
};
const WORLD = await makeWorld(BASE, 'd_a');

// A phone holding that record, as Phase 6 left it, opened by a build with the flag ON and
// a cold store of its own. No cloud unless asked: everything in K1-K2 happens with no signal.
function coldPhone(id, options = {}) {
    const fake = options.fake || makeIndexedDB();
    const device = phone(id, options.cloud || null, Object.assign({ flags: FLAGS_ON,
        storage: options.storage || clone(WORLD.storage), indexedDB: fake.indexedDB }, options));
    return { device, fake };
}
const reopen = (from, fake, options = {}) => phone(from.id, options.cloud || null, Object.assign({ flags: FLAGS_ON,
    storage: from.dump ? from.dump() : from, indexedDB: fake ? fake.indexedDB : undefined }, options));

// Every unit is in the record, or in the cold store UNDER A MARK ON THE DISK whose digest
// the cold copy has (and, for a month, its index row's): the one invariant of the move.
// A copy with no mark does not count - nothing ever compared it.
function nowhereLost(storage, fake) {
    const record = onDisk(storage[SCHEDULE]);
    const probe = payDevice({ deviceId: 'd_probe', flags: FLAGS_ON });
    const held = fake.disk.dump(DB, UNITS);
    return probe.call('coldUnitsNamed', record).map(unit => {
        const inRecord = probe.call('coldUnitHeld', record, unit);
        const mark = storage[MARK + unit.key];
        const inCold = typeof mark === 'string' && Object.prototype.hasOwnProperty.call(held, unit.key)
            && probe.call('coldValueProblem', unit, held[unit.key], mark) === '';
        return inRecord || inCold ? null : unit.key;
    }).filter(Boolean);
}

const WORDS = {
    loading: 'טוען את הארכיון השמור במכשיר…',
    missing: 'חלק מהרישום הישן שהועבר לארכיון לא נמצא כרגע במכשיר הזה. הדוחות, החשבונות והגיבוי לא יוצגו עד שהוא יושלם מהשרת, כדי שלא יוצג סכום חסר. רישום הימים ממשיך כרגיל.',
    missingOffline: 'אין כרגע קליטה. כשתהיה, המכשיר ישלים את החסר בעצמו.',
    refusedTitle: 'הארכיון במכשיר לא שלם',
    refusedMoney: 'אי אפשר לרשום עכשיו מקדמה, החזר או סגירת חשבון: חלק מהרישום הישן לא נמצא במכשיר, והחישוב היה יוצא חסר. הרישום לא שונה ודבר לא נשמר. המכשיר ישלים את החסר מהשרת כשתהיה קליטה.',
    missingDay: 'היום הזה שייך לחודש שהועבר לארכיון, והעותק שלו לא נמצא כרגע במכשיר. הוא לא ריק - הוא חסר.',
    deviceWhole: 'ארכיון במכשיר: שלם ({n} פריטים)',
    deviceMissing: 'ארכיון במכשיר: חסרים {n} פריטים מתוך {of}',
    deviceLoading: 'ארכיון במכשיר: בטעינה',
    deviceNone: 'ארכיון במכשיר: אין בדפדפן הזה אחסון נפרד, ולכן הכול נשמר באחסון הרגיל'
};

// ------------------------------------------------------------------------------------
{
    suite('K0: the flag and the words');

    same('every Hebrew word of the cold store, word for word (proposed; law 6)',
        clone(WORLD.a.global('COLD_TEXT')), WORDS);
    const shipped = payDevice({ deviceId: 'd_shipped', shipped: true });
    same('as shipped the flag is false, the writer is off and the reader is not active',
        [shipped.global('FARKAD_FLAGS').cold, shipped.call('coldWriterEnabled'), shipped.call('coldReaderActive')],
        [false, false, false]);

    // The whole of the WORLD above was built on a phone with the flag shut and an
    // IndexedDB at hand: closures, both moves, adoptions, a hundred saves.
    same('FLAG SHUT: through closing, both archive moves and every save, no database was ever opened',
        [WORLD.fake.disk.opens, WORLD.fake.disk.names()], [0, []]);
    same('and nothing was marked', [marksOf(WORLD.storage), WORLD.storage['farkad:cold:any'] === undefined], [[], true]);
    same('and the record on the disk holds every archived day and every archived entry, as Phase 6 left it',
        [daysIn(onDisk(WORLD.text), OCT).length > 0, daysIn(onDisk(WORLD.text), SEP).length > 0,
            Object.keys(onDisk(WORLD.text).pay).length > 5], [true, true, true]);
    // Byte for byte: what a flag-shut phone writes is JSON.stringify of memory.
    const off = phone('d_off', null, { storage: clone(WORLD.storage), indexedDB: WORLD.fake.indexedDB });
    given('a day is recorded on the flag-shut phone', off.State.commit(off.call('assignPlace', off.State.schedule,
        '2026-11-03', 'w_salim', 'actual', 'p_a', undefined, 0)) === true);
    same('the record it writes is memory, byte for byte - nothing is left out', off.raw(SCHEDULE), JSON.stringify(off.State.schedule));
    same('its restore point and its undo slot are whole too',
        [off.State.coldForDisk() === off.State.schedule, off.State.coldStripSet()], [true, []]);
    same('still no database', WORLD.fake.disk.opens, 0);
    same('and ⋯ says nothing about a cold store', off.call('coldDeviceLine'), '');
}

// ------------------------------------------------------------------------------------
{
    suite('K1: the move - the record shrinks; memory, and every figure, do not');

    const { device: a, fake } = coldPhone('d_k1');
    await ready(a);
    same('before anything moves: memory is whole, nothing is missing, nothing is refused',
        [memory(a) === WORLD.memory, a.State.coldMissing(), a.State.coldRefusal()], [true, [], null]);
    const before = a.raw(SCHEDULE).length;
    const result = await cold(a).move();
    same('every unit the indexes name was moved, none failed, and the record was written again',
        [result.moved.slice().sort(), result.failed, result.dropped], [WORLD.named, [], true]);
    const record = onDisk(a);
    same('THE RECORD ON THE DISK no longer holds a day of September or October, or an archived entry',
        [daysIn(record, SEP), daysIn(record, OCT), Object.keys(record.pay).filter(id => id !== 'po_open'),
            Object.keys(record.ledger.advances).filter(id => /^le_(period|close)_/.test(id))], [[], [], [], []]);
    same('it still holds the indexes, the open days and the roster',
        [Object.keys(record.monthIndex.rows), Object.keys(record.payIndex.rows).length, daysIn(record, '2026-11').length > 0,
            record.workers.length], [[SEP, OCT], 5, true, a.State.schedule.workers.length]);
    check('and it is smaller', a.raw(SCHEDULE).length < before, `${before} -> ${a.raw(SCHEDULE).length} characters`);
    same('the cold store holds exactly the seven units', Object.keys(fake.disk.dump(DB, UNITS)).sort(), WORLD.named);
    same('each has its mark, and a month\'s mark is its index row\'s own digest',
        [marksOf(a.dump()), a.raw(MARK + 'm:' + OCT)], [WORLD.named, record.monthIndex.rows[OCT].h]);
    same('MEMORY DID NOT MOVE: the record in memory is what it was, to the byte', memory(a) === WORLD.memory, true);
    same('and so is every figure - pay, invoice, each man, Rima, accounts, history', figures(a) === WORLD.figures, true);
    same('a second move finds nothing to do', await cold(a).move(), { moved: [], failed: [], dropped: false });

    // A day recorded after the move: the write leaves the units out again.
    given('a day is recorded', a.State.commit(a.call('assignPlace', a.State.schedule, '2026-11-04', 'w_salim', 'actual', 'p_a', undefined, 0)) === true);
    same('an ordinary save after the move still leaves the units out', [daysIn(onDisk(a), OCT), daysIn(onDisk(a), '2026-11').length], [[], 2]);
    const live = memory(a);
    const liveFigures = figures(a);

    // REOPENED, with no signal.
    const b = reopen(a, fake);
    same('REOPENED, IN THE FIRST TICK: the days of October are not in memory yet - and the phone SAYS so',
        [daysIn(b.State.schedule, OCT), b.State.coldMissing().slice().sort(), b.State.coldRefusal(), cold(b).state],
        [[], WORLD.named, WORDS.loading, 'loading']);
    await ready(b);
    same('once the cold store has answered: nothing is missing, nothing is refused',
        [b.State.coldMissing(), b.State.coldRefusal(), cold(b).state], [[], null, 'ready']);
    same('MEMORY IS WHAT IT WAS BEFORE THE REOPEN, to the byte', memory(b) === live, true);
    same('and every figure', figures(b) === liveFigures, true);
    same('the record on the disk was not grown by the boot', b.raw(SCHEDULE) === a.raw(SCHEDULE), true);
    given('a day is recorded on the reopened phone', b.State.commit(b.call('assignPlace', b.State.schedule,
        '2026-11-05', 'w_salim', 'actual', 'p_a', undefined, 0)) === true);
    same('and a save on the reopened phone keeps the units out', daysIn(onDisk(b), OCT), []);
    same('⋯ says the archive is whole, with its count', b.call('coldDeviceLine'), WORDS.deviceWhole.replace('{n}', '7'));

    // An edit of an archived day is still refused, as Phase 6 refuses it.
    b.said.length = 0;
    same('an edit of an archived day is refused as before', b.State.commit(b.call('assignPlace', b.State.schedule,
        '2026-10-06', 'w_salim', 'actual', 'p_b', undefined, 0)), false);
    same('and memory is still whole after the refusal put it back', [b.State.coldMissing(), daysIn(b.State.schedule, OCT).length > 0], [[], true]);

    // THE READER IS NOT BEHIND THE FLAG once something has moved.
    const shut = phone('d_k1', null, { storage: b.dump(), indexedDB: fake.indexedDB, flags: FLAGS_OFF });
    await ready(shut);
    same('A BUILD WITH THE FLAG SHUT, on a disk a session has moved: it reads the cold store and is whole',
        [shut.call('coldWriterEnabled'), shut.call('coldReaderActive'), shut.State.coldMissing(), daysIn(shut.State.schedule, OCT).length > 0],
        [false, true, [], true]);
    same('and it moves nothing', await cold(shut).move(), { moved: [], failed: [], dropped: false });
}

// ------------------------------------------------------------------------------------
{
    suite('K2: killed at every step - never both gone, and the next open finishes (law 3)');

    // Learn the steps from a run that is not killed.
    const steps = [];
    const { device: first } = coldPhone('d_k2steps', { before: device => { cold(device).step = name => { steps.push(name); }; } });
    await ready(first);
    await cold(first).move();
    same('a move is copy, copied, read, marked for each unit - then drop, dropped',
        [steps.length, steps.slice(0, 4).map(name => name.split(':')[0]), steps.slice(-2)],
        [7 * 4 + 2, ['copy', 'copied', 'read', 'marked'], ['drop', 'dropped']]);

    const lost = [];
    const notWhole = [];
    const notFinished = [];
    const early = [];
    for (let at = 0; at < steps.length; at += 1) {
        let reached = false;
        // The page dies AT this step: the promise never settles, nothing after it runs.
        const { device, fake } = coldPhone('d_k2_' + at, { before: one => {
            cold(one).step = name => (name === steps[at] ? (reached = true, new Promise(() => {})) : undefined);
        } });
        await ready(device);
        await settleUntil(() => reached, 4000, 2);
        given(`the move reached ${steps[at]}`, reached === true);
        fake.disk.kill();
        const dead = device.dump();
        if (nowhereLost(dead, fake).length > 0) lost.push(steps[at]);
        // NOTHING WAS DROPPED BEFORE ITS MARK: a unit absent from the record has a mark.
        const marked = marksOf(dead);
        const probe = device.call('coldUnitsNamed', onDisk(dead[SCHEDULE]))
            .filter(unit => !device.call('coldUnitHeld', onDisk(dead[SCHEDULE]), unit) && marked.indexOf(unit.key) === -1);
        if (probe.length > 0) early.push(steps[at]);
        fake.disk.revive();
        const next = reopen(dead, fake);
        next.id = device.id;
        await ready(next);
        if (next.State.coldMissing().length > 0 || memory(next) !== WORLD.memory) notWhole.push(steps[at]);
        const done = await cold(next).move();
        if (done.failed.length > 0 || nowhereLost(next.dump(), fake).length > 0
            || daysIn(onDisk(next), OCT).length > 0 || memory(next) !== WORLD.memory) notFinished.push(steps[at]);
    }
    same(`at none of the ${steps.length} points is a unit in neither the record nor the cold store`, lost, []);
    same('at none of them was a unit left out of the record before its mark was on the disk', early, []);
    same('after each, the next open has the whole record in memory, with no signal', notWhole, []);
    same('and finishes the move: the record without the units, the cold store with them, memory unmoved', notFinished, []);

    // INSIDE the cold store's own commits: the page dies as a transaction is about to
    // reach the disk. Nothing of that transaction lands.
    const lostInside = [];
    const badInside = [];
    for (let nth = 1; nth <= 15; nth += 1) {    // the boot read, then a write and a read-back for each of seven units
        const fake = makeIndexedDB();
        let died = false;
        fake.disk.beforeCommit = () => {
            if (died || fake.disk.transactions + 1 < nth) return true;
            died = true;
            fake.disk.kill();
            return false;
        };
        const { device } = coldPhone('d_k2tx_' + nth, { fake });
        await settleUntil(() => died, 3000, 2);
        given(`transaction ${nth} was reached`, died === true);
        fake.disk.beforeCommit = null;
        const dead = device.dump();
        if (nowhereLost(dead, fake).length > 0) lostInside.push(nth);
        fake.disk.revive();
        const next = reopen(dead, fake);
        await ready(next);
        const done = await cold(next).move();
        if (next.State.coldMissing().length > 0 || memory(next) !== WORLD.memory || done.failed.length > 0
            || nowhereLost(next.dump(), fake).length > 0) badInside.push(nth);
    }
    same('killed as each of the fifteen cold-store transactions commits (the boot read, seven copies, seven read-backs): nothing is in neither place', lostInside, []);
    same('and the next open is whole and finishes', badInside, []);

    // A MARK IS NOT PROOF. Killed after every mark and before the drop - the record still
    // whole - and THEN the browser evicts the cold store. The marks say "moved"; nothing
    // holds the units but the record. The next session must not leave them out of it.
    {
        let reached = false;
        const { device, fake } = coldPhone('d_k2mark', { before: one => {
            cold(one).step = name => (name === 'drop' ? (reached = true, new Promise(() => {})) : undefined);
        } });
        await ready(device);
        await settleUntil(() => reached, 4000, 2);
        given('every unit is marked and the record still holds them all',
            marksOf(device.dump()).length === 7 && daysIn(onDisk(device), OCT).length > 0);
        fake.disk.kill();
        const dead = device.dump();
        fake.disk.revive();
        fake.disk.evict();
        // (This session is not allowed to move anything, so that the save below is
        // judged on what the session has READ BACK - nothing - and not on a fresh copy.)
        const next = reopen(dead, fake, { before: one => {
            cold(one).move = () => Promise.resolve({ moved: [], failed: [], dropped: false });
        } });
        await ready(next);
        await settle(30);
        same('MARKED, NOT YET DROPPED, AND THEN EVICTED: memory is whole from the record', next.State.coldMissing(), []);
        given('the cold store is empty and this session read nothing back',
            Object.keys(fake.disk.dump(DB, UNITS)).length === 0 && Object.keys(cold(next).verified).length === 0);
        given('a day is recorded', next.State.commit(next.call('assignPlace', next.State.schedule,
            '2026-11-19', 'w_salim', 'actual', 'p_a', undefined, 0)) === true);
        same('and nothing was left out of the record on the strength of a mark: every unit is still somewhere',
            nowhereLost(next.dump(), fake), []);
        const third = reopen(next, fake);
        await ready(third);
        same('and the open after that is whole', [third.State.coldMissing(), memory(third) === memory(next)], [[], true]);
    }

    // A COPY THAT COMES BACK WRONG IS NOT BELIEVED.
    const lying = makeIndexedDB();
    lying.disk.corrupt('m:' + OCT, value => { delete value.days[Object.keys(value.days)[0]]; return value; });
    const { device: liar } = coldPhone('d_k2liar', { fake: lying });
    await ready(liar);
    const lied = await cold(liar).move();
    same('a unit that reads back as something else is not marked',
        [lied.failed.map(one => one.unit), marksOf(liar.dump()).indexOf('m:' + OCT), lied.moved.length], [['m:' + OCT], -1, 6]);
    same('and it stays in the record, whole, while the others leave',
        [daysIn(onDisk(liar), OCT).length > 0, daysIn(onDisk(liar), SEP)], [true, []]);

    // A COLD STORE WITH NO ROOM.
    const tiny = makeIndexedDB();
    tiny.disk.quota = key => key === 'm:' + SEP;
    const { device: full } = coldPhone('d_k2full', { fake: tiny });
    await ready(full);
    const cramped = await cold(full).move();
    same('a unit the cold store has no room for stays in the record; nothing is claimed about it',
        [cramped.failed.map(one => one.unit), daysIn(onDisk(full), SEP).length > 0, marksOf(full.dump()).indexOf('m:' + SEP)],
        [['m:' + SEP], true, -1]);
    same('and memory is whole either way', [memory(liar) === WORLD.memory, memory(full) === WORLD.memory], [true, true]);
}

// ------------------------------------------------------------------------------------
{
    suite('K3: a cold store that is gone or wrong is NOT "nothing was archived" (law 10)');

    // One phone, moved, with the cloud at hand - then closed.
    const moved = async tag => {
        const { device, fake } = coldPhone('d_k3' + tag);
        await ready(device);
        given('the move finished', (await cold(device).move()).failed.length === 0);
        return { storage: device.dump(), fake, id: device.id };
    };
    const hurt = {
        'evicted by the browser between two sessions': fake => { fake.disk.evict(); return WORLD.named; },
        'one month\'s unit deleted': fake => { fake.disk.removeRaw(DB, UNITS, 'm:' + OCT); return ['m:' + OCT]; },
        'one month\'s unit with a day changed': fake => {
            const unit = fake.disk.dump(DB, UNITS)['m:' + OCT];
            unit.days[Object.keys(unit.days)[0]].rima = { p_a: 99 };
            fake.disk.putRaw(DB, UNITS, 'm:' + OCT, unit);
            return ['m:' + OCT];
        },
        'one closure\'s unit with an amount changed': fake => {
            const key = WORLD.named.filter(name => name[0] === 'c')[0];
            const unit = fake.disk.dump(DB, UNITS)[key];
            const path = Object.keys(unit.entries).filter(one => one.indexOf('pay.') === 0)[0];
            unit.entries[path] = Object.assign({}, unit.entries[path], { netDue: 1 });
            fake.disk.putRaw(DB, UNITS, key, unit);
            return [key];
        },
        'a closure\'s unit emptied to {}': fake => {
            const key = WORLD.named.filter(name => name[0] === 'c')[1];
            fake.disk.putRaw(DB, UNITS, key, {});
            return [key];
        },
        'the database refuses to open': fake => { fake.disk.failOpen = 'error'; return WORLD.named; },
        'the database never answers': fake => { fake.disk.failOpen = 'hang'; return WORLD.named; },
        'IndexedDB throws when asked (a private window)': fake => { fake.disk.unavailable = true; return WORLD.named; }
    };
    // A DOCUMENT THAT LOOKS LIKE THIS PHONE'S OWN ECHO. A second world, the same but with
    // no Rima count in October - so that nothing but the days themselves tells the
    // server's document from this phone's copy: the same stamps (this phone wrote last),
    // the same index rows, the same pay book, the same Rima layers. Everything that
    // tells a snapshot from an echo says "echo" - and an echo is not adopted.
    {
        const QUIET = await makeWorld(baseOf(false), 'd_q');
        const fake = makeIndexedDB();
        const device = phone('d_q', null, { flags: FLAGS_ON, storage: clone(QUIET.storage), indexedDB: fake.indexedDB });
        await ready(device);
        given('the move finished on the phone the cloud\'s document is stamped by',
            (await cold(device).move()).failed.length === 0 && device.State.schedule.updatedBy === QUIET.cloud.doc.updatedBy
            && device.State.schedule.updatedAt === QUIET.cloud.doc.updatedAt);
        fake.disk.removeRaw(DB, UNITS, 'm:' + OCT);
        const b = reopen({ id: 'd_q', dump: () => device.dump() }, fake);
        await ready(b);
        given('only October is missing', b.State.coldMissing().join() === 'm:' + OCT, JSON.stringify(b.State.coldMissing()));
        b.Sync.connect(QUIET.cloud.adapter);
        await settleUntil(() => b.State.coldMissing().length === 0 && quiet(b), 5000, 5);
        same('A DOCUMENT THAT LOOKS LIKE THIS PHONE\'S OWN ECHO is still adopted while a month is missing: October comes back, and only then «מסונכרן»',
            [b.State.coldMissing(), daysIn(b.State.schedule, OCT).length > 0, b.Sync.status], [[], true, 'synced']);
    }

    let n = 0;
    for (const [what, damage] of Object.entries(hurt)) {
        n += 1;
        const { storage, fake } = await moved(String(n));
        const want = damage(fake).slice().sort();
        // Opened with NO SIGNAL.
        const b = reopen(storage, fake);
        await ready(b);
        same(`${what}: exactly the affected units are MISSING - not empty, not skipped`, b.State.coldMissing().slice().sort(), want);
        check(`- the app opened, and shows what it has: the roster, November, the indexes`,
            b.State.schedule.workers.length > 0 && daysIn(b.State.schedule, '2026-11').length > 0
            && Object.keys(b.State.schedule.monthIndex.rows).length === 2);
        same(`- and says plainly what is not there`, b.State.coldRefusal(), WORDS.missing);
        same(`- ⋯ counts it`, b.call('coldDeviceLine'), cold(b).state === 'none' ? WORDS.deviceNone
            : WORDS.deviceMissing.replace('{n}', String(want.length)).replace('{of}', '7'));

        // What is refused, and what is not.
        b.said.length = 0;
        const disk = b.raw(SCHEDULE);
        const queued = b.Sync.pendingCount();
        const advance = b.call('recordNewAdvance', b.State.schedule, 'w_khaled', '2026-11-03', 200, '', '2026-11-03T09:00:00.000Z', b.id, 'cash');
        same(`- an advance is refused in the sentence, before the journal: nothing queued, the disk untouched`,
            [b.State.commitMany(advance), b.said.slice(-1)[0], b.Sync.pendingCount(), b.raw(SCHEDULE) === disk],
            [false, `${WORDS.refusedTitle} | ${WORDS.refusedMoney}`, queued, true]);
        b.downloads.length = 0;
        b.said.length = 0;
        b.call('exportBackup');
        same(`- the backup file is not made, and the reason is said`,
            [b.downloads.length, b.said[0]], [0, `${WORDS.refusedTitle} | ${WORDS.missing}`]);
        same(`- closing and paying are refused as for any phone that lacks detail`, b.Sync.payTransactRefusal(), 'waiting');
        if (want.indexOf('m:' + OCT) !== -1) {
            same(`- a day of the missing month is said to be MISSING, and a day of November is not`,
                [b.State.coldMissingDay('2026-10-06'), b.State.coldMissingDay('2026-11-02')], [true, false]);
        }
        same(`- recording today's day still works, and is on the disk`,
            [b.State.commit(b.call('assignPlace', b.State.schedule, '2026-11-06', 'w_nasser', 'actual', 'p_a', undefined, 0)),
                daysIn(onDisk(b), '2026-11').indexOf('2026-11-06') !== -1], [true, true]);
        check(`- and that save did not write a hole over anything: every unit is still somewhere, or was already gone`,
            nowhereLost(b.dump(), fake).every(key => want.indexOf(key) !== -1), JSON.stringify(nowhereLost(b.dump(), fake)));
        b.downloads.length = 0;
        b.call('exportRecoveryData');
        const rescue = JSON.parse(b.downloads[b.downloads.length - 1].text);
        same(`- the rescue file is still made, and names what is missing`,
            [rescue.aboutColdStore.missing.slice().sort(), typeof rescue.aboutColdStore.note], [want, 'string']);

        // THE SIGNAL COMES BACK: the server's closed/ and months/ documents make it whole.
        fake.disk.failOpen = null;
        fake.disk.unavailable = false;
        b.Sync.connect(WORLD.cloud.adapter);
        check(`- it does not say synced while anything is missing`, b.Sync.status !== 'synced' || b.State.coldMissing().length === 0);
        await settleUntil(() => b.State.coldMissing().length === 0 && quiet(b), 8000, 5);
        same(`- WITH SIGNAL: made whole from the server, nothing missing, nothing refused, synced`,
            [b.State.coldMissing(), b.State.coldRefusal(), b.Sync.status], [[], null, 'synced']);
        const pay = device => canonical({ payroll: device.call('payrollReport', device.State.schedule, RANGE[0], '2026-10-31'),
            accounts: device.call('accountsList', device.State.schedule, LATER),
            history: device.call('closureHistory', device.State.schedule, {}),
            october: daysIn(device.State.schedule, OCT).map(date => device.State.schedule.days[date]),
            september: daysIn(device.State.schedule, SEP).map(date => device.State.schedule.days[date]) });
        same(`- and the archived months and every account read exactly as they did`, pay(b) === pay(WORLD.a), true);
    }

    // AND THEN THE COLD STORE IS FILLED AGAIN, so the next open with no signal is whole.
    const { storage, fake } = await moved('again');
    fake.disk.evict();
    const b = reopen(storage, fake, { cloud: WORLD.cloud });
    await ready(b);
    await settleUntil(() => b.State.coldMissing().length === 0 && quiet(b), 8000, 5);
    const refilled = await cold(b).move();
    await settle(20);
    same('after an eviction and a refetch, the cold store is written again - every unit, read back',
        [Object.keys(fake.disk.dump(DB, UNITS)).sort(), refilled.failed], [WORLD.named, []]);
    same('and the refetched archive was never put into localStorage: the record still holds no day of October',
        daysIn(onDisk(b), OCT), []);
    const c = reopen(b, fake);
    await ready(c);
    same('the next open, with no signal, is whole', [c.State.coldMissing(), daysIn(c.State.schedule, OCT).length > 0], [[], true]);

    // A DATABASE THAT ANSWERS LATE is still an answer.
    const late = await moved('late');
    late.fake.disk.failOpen = 'hang';
    const slow = reopen(late.storage, late.fake);
    await ready(slow);
    same('a database slower than the deadline: the phone stops waiting, and says what is missing',
        [slow.State.coldMissing().length, slow.State.coldRefusal()], [7, WORDS.missing]);
}

// ------------------------------------------------------------------------------------
{
    suite('K4: the files and the restore doors carry everything, from both stores');

    const { device: a, fake } = coldPhone('d_k4');
    await ready(a);
    given('the move finished', (await cold(a).move()).failed.length === 0);
    const b = reopen(a, fake);
    await ready(b);

    // The backup file. `plain` is the same record on a phone with the flag shut.
    const plain = phone('d_k4plain', null, { storage: clone(WORLD.storage) });
    b.downloads.length = 0;
    b.call('exportBackup');
    const file = JSON.parse(b.downloads[0].text);
    same('THE BACKUP FILE holds every archived day and every archived entry, though the record on the disk holds none',
        [daysIn(file, OCT), daysIn(file, SEP), daysIn(onDisk(b), OCT)],
        [daysIn(WORLD.a.State.schedule, OCT), daysIn(WORLD.a.State.schedule, SEP), []]);
    same('it is the file a phone that keeps everything in one place writes',
        canonical(Object.assign({}, file, { updatedAt: null, updatedBy: null }))
            === canonical(Object.assign(JSON.parse(plain.call('backupFileText', plain.State.schedule)), { updatedAt: null, updatedBy: null })), true);

    // The rescue file, on a healthy phone: the record and the units, which lay back whole.
    b.downloads.length = 0;
    b.call('exportRecoveryData');
    const rescue = JSON.parse(b.downloads[0].text);
    const units = Object.keys(rescue.records).filter(key => key.indexOf('cold:') === 0).map(key => key.slice(5)).sort();
    same('THE RESCUE FILE carries every cold unit beside the record, and says what they are',
        [units, rescue.aboutColdStore.state, rescue.aboutColdStore.missing, rescue.aboutColdStore.marks], [WORLD.named, 'ready', [], WORLD.named]);
    const rebuilt = JSON.parse(rescue.records[SCHEDULE]);
    b.call('coldUnitsNamed', rebuilt).forEach(unit =>
        b.call('coldLayUnit', rebuilt, unit, JSON.parse(rescue.records['cold:' + unit.key])));
    same('laid back at their paths, the file\'s record is the whole record: every day, every ledger entry, every pay entry',
        canonical({ days: rebuilt.days, ledger: rebuilt.ledger.advances, pay: rebuilt.pay })
            === canonical({ days: b.State.schedule.days, ledger: b.State.schedule.ledger.advances, pay: b.State.schedule.pay }), true);

    // The rescue file when the MAIN RECORD IS QUARANTINED.
    const broken = b.dump();
    broken[SCHEDULE] = broken[SCHEDULE].slice(0, 400);
    const q = reopen(broken, fake);
    await ready(q);
    given('the phone is holding a damaged record and blocks writing', q.call('farkadWritesBlocked') === true);
    q.downloads.length = 0;
    q.call('exportRecoveryData');
    const saved = JSON.parse(q.downloads[q.downloads.length - 1].text);
    same('WITH THE MAIN RECORD QUARANTINED the rescue file still carries every cold unit, byte for byte',
        Object.keys(saved.records).filter(key => key.indexOf('cold:') === 0).sort().map(key => [key, saved.records[key]]),
        WORLD.named.map(key => ['cold:' + key, rescue.records['cold:' + key]]));
    check('and the damaged bytes themselves', Object.keys(saved.records).some(key => saved.records[key] === broken[SCHEDULE]));
    same('nothing was written to the cold store or the record by that boot',
        [Object.keys(fake.disk.dump(DB, UNITS)).sort(), q.raw(SCHEDULE) === broken[SCHEDULE]], [WORLD.named, true]);

    // A restore point, and the step back: written without the units, restored whole.
    b.ctx.askConfirm = said => { b.said.push(String(said && said.title)); return Promise.resolve(true); };
    b.setToday('2026-11-12');
    b.call('takeDailySnapshot');
    const point = b.raw('scheduleData:snap:2026-11-12');
    same('A RESTORE POINT is written as the record is - with no day of an archived month in it',
        [typeof point, point ? daysIn(JSON.parse(point), OCT) : null], ['string', []]);
    given('a day is recorded after the restore point', b.State.commit(b.call('assignPlace', b.State.schedule,
        '2026-11-10', 'w_nasser', 'actual', 'p_b', undefined, 0)) === true);
    const wholeBefore = canonical({ oct: daysIn(b.State.schedule, OCT).map(date => b.State.schedule.days[date]),
        pay: b.State.schedule.pay, ledger: b.State.schedule.ledger.advances });
    await b.call('restoreSnapshot', '2026-11-12');
    await settle(30);
    same('RESTORED from it: the day recorded since is gone, as asked - and the archive is all still there, in memory',
        [b.State.schedule.days['2026-11-10'] === undefined, b.State.coldMissing(),
            canonical({ oct: daysIn(b.State.schedule, OCT).map(date => b.State.schedule.days[date]),
                pay: b.State.schedule.pay, ledger: b.State.schedule.ledger.advances }) === wholeBefore], [true, [], true]);
    same('the record on the disk still holds no archived day, and the cold store was not touched',
        [daysIn(onDisk(b), OCT), Object.keys(fake.disk.dump(DB, UNITS)).sort()], [[], WORLD.named]);
    const after = reopen(b, fake);
    await ready(after);
    same('and a reopen after the restore is whole', [after.State.coldMissing(), figures(after) === figures(b)], [[], true]);

    // The backup file imported back on the same phone.
    after.ctx.askConfirm = () => Promise.resolve(true);
    const imported = after.call('acceptRestoreText', b.downloads.length ? JSON.stringify(file) : '', 'קובץ');
    check('the backup file is one this phone accepts back', Boolean(imported));
    const answer = await after.Sync.replaceEverything(after.call('normaliseSchedule', imported));
    await settle(30);
    same('IMPORTED: memory is whole, the record on the disk still without the units, both written consistently',
        [after.State.coldMissing(), daysIn(after.State.schedule, OCT).length > 0, daysIn(onDisk(after), OCT),
            nowhereLost(after.dump(), fake)], [[], true, [], []]);
    check('and the restore said it ran', Boolean(answer), JSON.stringify(answer));
}

// ------------------------------------------------------------------------------------
{
    suite('K5: two tabs of one phone, on one disk');

    const shared = payDevice({ deviceId: 'd_tabs', flags: FLAGS_ON }).ctx.localStorage;
    Object.keys(shared).forEach(key => shared.removeItem(key));
    Object.keys(WORLD.storage).forEach(key => shared.setItem(key, WORLD.storage[key]));
    const fake = makeIndexedDB();
    const tab = () => {
        const device = payDevice({ deviceId: 'd_tabs', flags: FLAGS_ON, sharedStorage: shared, indexedDB: fake.indexedDB });
        device.Sync.pushDelayMs = 5;
        device.State.load();
        return device;
    };
    const one = tab();
    const two = tab();
    await ready(one);
    await ready(two);

    // Both move at once, their steps interleaved by the event loop.
    const [first, second] = await Promise.all([cold(one).move(), cold(two).move()]);
    same('BOTH TABS MOVE AT ONCE: nothing fails in either, and every unit is in the cold store once',
        [first.failed, second.failed, Object.keys(fake.disk.dump(DB, UNITS)).sort()], [[], [], WORLD.named]);
    const store = () => { const out = {}; Object.keys(shared).forEach(key => { out[key] = shared[key]; }); return out; };
    same('nothing is in neither place, and both memories are whole',
        [nowhereLost(store(), fake), memory(one) === WORLD.memory, memory(two) === WORLD.memory], [[], true, true]);

    // One records a day; then the other, which has to rebase onto the first one's record.
    given('tab one records a day', one.State.commit(one.call('assignPlace', one.State.schedule, '2026-11-07', 'w_salim', 'actual', 'p_a', undefined, 0)) === true);
    given('tab two records another', two.State.commit(two.call('assignPlace', two.State.schedule, '2026-11-08', 'w_nasser', 'actual', 'p_a', undefined, 0)) === true);
    same('tab two rebased onto tab one\'s smaller record and still holds the whole archive - and both days',
        [two.State.coldMissing(), daysIn(two.State.schedule, OCT).length > 0,
            ['2026-11-07', '2026-11-08'].map(date => two.State.schedule.days[date] !== undefined)], [[], true, [true, true]]);
    same('the record on the disk has both days and no archived one', [daysIn(onDisk(store()[SCHEDULE]), OCT),
        ['2026-11-07', '2026-11-08'].map(date => onDisk(store()[SCHEDULE]).days[date] !== undefined)], [[], [true, true]]);

    // A tab that was open BEFORE the other moved, and never read the cold store itself.
    const shared2 = payDevice({ deviceId: 'd_tabs2', flags: FLAGS_ON }).ctx.localStorage;
    Object.keys(shared2).forEach(key => shared2.removeItem(key));
    Object.keys(WORLD.storage).forEach(key => shared2.setItem(key, WORLD.storage[key]));
    const fake2 = makeIndexedDB();
    const mk = watches => { const d = payDevice({ deviceId: 'd_tabs2', flags: FLAGS_ON, sharedStorage: shared2, indexedDB: fake2.indexedDB });
        d.Sync.pushDelayMs = 5;
        // This tab only watches: it never moves anything itself.
        if (watches) cold(d).move = () => Promise.resolve({ moved: [], failed: [], dropped: false });
        d.State.load(); return d; };
    const idle = mk(true);
    await ready(idle);
    const mover = mk(false);
    await ready(mover);
    given('the other tab moved everything', (await cold(mover).move()).failed.length === 0
        && daysIn(onDisk(shared2[SCHEDULE]), OCT).length === 0);
    same('the watching tab has read nothing back', Object.keys(cold(idle).verified), []);
    given('the watching tab records a day', idle.State.commit(idle.call('assignPlace', idle.State.schedule,
        '2026-11-09', 'w_salim', 'actual', 'p_a', undefined, 0)) === true);
    const store2 = () => { const out = {}; Object.keys(shared2).forEach(key => { out[key] = shared2[key]; }); return out; };
    same('A TAB THAT NEVER READ THE COLD STORE rebases onto the stripped record: its memory keeps the whole archive',
        [idle.State.coldMissing(), memory(idle) === memory(idle), daysIn(idle.State.schedule, OCT).length > 0], [[], true, true]);
    same('and its save does not put the archive back into localStorage, nor lose anything',
        [daysIn(onDisk(store2()[SCHEDULE]), OCT), nowhereLost(store2(), fake2)], [[], []]);
    same('told of a mark (the storage event), it reads the unit back for itself',
        [await cold(idle).noticeMark('m:' + OCT), cold(idle).verified['m:' + OCT]], [true, true]);
}

// ------------------------------------------------------------------------------------
{
    suite('K6: the reclaim ladder cannot reach it; a full localStorage loses nothing');

    const { device: a, fake } = coldPhone('d_k6');
    await ready(a);
    given('the move finished', (await cold(a).move()).failed.length === 0);
    // Three restore points, then a disk with no room for the record: the ladder runs.
    ['2026-11-13', '2026-11-14', '2026-11-15'].forEach(day => { a.setToday(day); a.call('takeDailySnapshot'); });
    const points = () => Object.keys(a.dump()).filter(key => key.indexOf('scheduleData:snap:') === 0).length;
    given('there are restore points to spend', points() === 3);
    const marks = marksOf(a.dump());
    const unitsBefore = canonical(fake.disk.dump(DB, UNITS));
    let refusals = 0;
    a.setQuota(key => (key === SCHEDULE && refusals++ < 2));
    const landed = a.State.commit(a.call('assignPlace', a.State.schedule, '2026-11-16', 'w_salim', 'actual', 'p_a', undefined, 0));
    same('a full disk: the ladder spent restore points and the day landed', [landed, points()], [true, 1]);
    same('THE LADDER TOOK NO MARK AND NOTHING FROM THE COLD STORE',
        [marksOf(a.dump()), a.raw('farkad:cold:any'), canonical(fake.disk.dump(DB, UNITS)) === unitsBefore], [marks, '1', true]);
    same('and the reclaim hook, asked until it has nothing left, still took neither',
        [(() => { let n = 0; while (a.Store.reclaim() && n < 50) n += 1; return points(); })(), marksOf(a.dump()).length,
            Object.keys(fake.disk.dump(DB, UNITS)).length], [0, 7, 7]);

    // A localStorage with no room for even a mark: the move stops before the drop.
    const { device: b, fake: fakeB } = coldPhone('d_k6full', { quota: key => key.indexOf('farkad:cold:') === 0 });
    await ready(b);
    const cramped = await cold(b).move();
    same('NO ROOM FOR A MARK: nothing is marked, nothing is dropped, the record is whole, memory is whole',
        [cramped.moved, cramped.failed.length, cramped.dropped, daysIn(onDisk(b), OCT).length > 0, memory(b) === WORLD.memory,
            b.State.coldMissing()], [[], 7, false, true, true, []]);
    same('full is not blocked: storage is still available and a day still records',
        [b.Store.available, b.State.commit(b.call('assignPlace', b.State.schedule, '2026-11-17', 'w_salim', 'actual', 'p_a', undefined, 0))], [true, true]);
    check('and nothing is in neither place', nowhereLost(b.dump(), fakeB).length === 0);
}

// ------------------------------------------------------------------------------------
{
    suite('K7: a browser with no IndexedDB - everything stays in localStorage, and ⋯ says so');

    const none = phone('d_k7', null, { flags: FLAGS_ON, storage: clone(WORLD.storage) });   // no indexedDB at all
    await ready(none);
    same('the flag is on and there is nowhere to move to: nothing is missing, nothing is refused',
        [cold(none).state, none.State.coldMissing(), none.State.coldRefusal(), memory(none) === WORLD.memory], ['none', [], null, true]);
    same('a move moves nothing', await cold(none).move(), { moved: [], failed: [], dropped: false });
    given('a day is recorded', none.State.commit(none.call('assignPlace', none.State.schedule, '2026-11-18', 'w_salim', 'actual', 'p_a', undefined, 0)) === true);
    same('the record on the disk keeps every archived day, as today', daysIn(onDisk(none), OCT), daysIn(WORLD.a.State.schedule, OCT));
    same('⋯ says where the archive is kept', none.call('coldDeviceLine'), WORDS.deviceNone);
    const next = phone('d_k7', null, { flags: FLAGS_ON, storage: none.dump() });
    await ready(next);
    same('and the next open is whole from localStorage alone', [next.State.coldMissing(), figures(next) === figures(none)], [[], true]);
}

report();
