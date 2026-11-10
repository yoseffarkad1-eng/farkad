// רישום לרימא (v166): the other company's men, counted per site, per day.
//
//   node tests/rima.test.mjs
//
// The owner records HOW MANY of Rima's workers came to each of his sites, so that he can
// bill that company. They are not his workers. Everything this suite measures follows
// from that one sentence:
//
//   a count moves no shekel of pay - not on the pay sheet, not in an advance, not in a
//     closed account - and on the client's invoice each of Rima's men is one worker-site
//     day, like his own (the owner's ruling, 2026-11-01);
//   a day with Rima and none of his men is a real day, and it reaches every surface the
//     count belongs on - and never the day's WhatsApp message, which is the seder for his
//     own crew and carries no Rima at all (the owner's decision, 2026-11-02);
//   the Rima table names nobody, so the file a company is handed names nobody;
//   ten sites with Rima on two of them is a table with two columns;
//   the count travels as one field path, and a phone that has not updated - v165, the
//     build on the owner's phones, or v145 before it - does not take it off the cloud.
//     That last one is measured against those builds' REAL bytes, read out of Git, never
//     against a copy of them written by somebody who already knows about the new field.
//
// The screen and the paper are in tests/rima.browser.mjs; the real .xlsx is in
// tests/xlsx.test.mjs; the production adapter and the real rules are in
// tests/cas.emulator.test.mjs.

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { makeDevice, makeCloud, settle, settleUntil, loadOrder, sourceRoot } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const ROOT = sourceRoot();

// THE OLDER BUILDS' OWN FILE LIST (moved at v173, deliberately).
//
// Three places below build v145 and v165 out of Git and demanded "every file this build
// loads". That was true only while this build loaded nothing those builds lacked. v173
// puts js/model/payroll.js in the load order - a file neither of them ever had - and a
// demand that the past contain the present refused to build either one, with every check
// about what they do to a Rima count going unasked. tests/fence.legacy.test.mjs met the
// same thing at the v102 split and answers it the same way.
//
// NAMED, not filtered by "whatever happens to be there": a list that quietly shrinks is
// how a suite stops testing. Anything this build loads that is not on this list must
// still be in the older commit, and the three `given`s still stop the run if it is not.
const NOT_IN_V165 = ['js/model/payroll.js'];
const olderOrder = () => loadOrder().filter(file => NOT_IN_V165.indexOf(file) === -1);
const REPORTS = readFileSync(new URL('../js/ui/reports.js', import.meta.url), 'utf8');
const SETTINGS = readFileSync(new URL('../js/ui/settings.js', import.meta.url), 'utf8');
const TICK = 6;

// The pinned words. Hebrew strings are product decisions - CLAUDE.md, law 6.
const TITLE = 'רישום לרימא';
const NOTE = 'עובדי רימא בלבד. אינם נכללים בשכר. בחיוב שלמעלה כל אחד מהם נספר כיום עובד־אתר אחד.';
const TOTAL = 'סה״כ עובדי רימא';
const SHEET = 'רימא';
// v167, the owner's yes to both (2026-11-07, «ممكن تضيفها نعم»): the paper's line under the
// Rima table, on the workbook's רימא sheet with «בחיוב שלמעלה» made «בגיליון החיוב»; and the
// invoice without Rima's men, on the billing page and as a sheet, titled and totalled in
// words the page already had.
const SHEET_NOTE = 'עובדי רימא בלבד. אינם נכללים בשכר. בגיליון החיוב כל אחד מהם נספר כיום עובד־אתר אחד.';
const NO_RIMA = 'בלי עובדי רימא';
const NO_RIMA_TOTAL = 'סה״כ ימי עובד־אתר';
const REFUSED = 'אפשר לרשום לרימא רק מספר שלם בין 0 ל-99.';

const WORKERS = () => [
    { id: 'w_01', name: 'דוד לוי', active: true, dailyRate: 400, hourlyRate: 50 },
    { id: 'w_02', name: 'סמיר חוסיין', active: true, dailyRate: 350, hourlyRate: 0,
        payCycles: '2026-10-02=weekly' }
];
const PLACES = () => [
    { id: 'p_01', name: 'הרצליה', active: true },
    { id: 'p_02', name: 'תל אביב', active: true },
    { id: 'p_03', name: 'פרדסיה', active: true }
];

function phone(id, options = {}) {
    const device = makeDevice({ deviceId: id });
    device.Sync.pushDelayMs = TICK;
    device.setToday(options.today || '2026-10-20');
    device.ctx.askTell = message => { (device.told = device.told || []).push(message); return Promise.resolve(); };
    device.ctx.askText = async question => question.placeholder;
    device.State.schedule.workers = options.workers || WORKERS();
    device.State.schedule.places = options.places || PLACES();
    device.State.save({ silent: true });
    return device;
}

// reports.js is a classic script; its functions are reached by loading it into the
// device's scope - the seam tests/xlsx.test.mjs and tests/data.test.mjs use.
function withReports(device, from, to) {
    device.ctx.document.head = { appendChild() {} };
    vm.runInContext(REPORTS, device.ctx, { filename: 'js/ui/reports.js' });
    vm.runInContext(`REPORT_RANGE.from = '${from}'; REPORT_RANGE.to = '${to}';`
        + ` REPORT_SECTION = 'workers'; INVOICE_PLACE = null; REPORT_WORKERS = null;`,
    device.ctx, { filename: 'harness:range' });
    return device;
}
const run = (device, code) => vm.runInContext(code, device.ctx, { filename: 'harness:rima' });

const rima = (device, date, placeId, count) =>
    device.State.commit(device.call('setRimaCount', device.State.schedule, date, placeId, count));
const work = (device, date, workerId, placeId, rate) =>
    device.State.commit(device.call('assignPlace', device.State.schedule, date, workerId,
        'actual', placeId, rate));
const cloudRima = (cloud, date) =>
    ((((cloud.doc || {}).days || {})[date]) || {}).rima;

// The same phone opened again from what its disk holds: the app closed and opened, which
// on a building site is the ordinary way back. No adapter - it opens with no signal until
// a test connects it.
function reopen(id, storage, options = {}) {
    const device = makeDevice({ deviceId: id, storage });
    device.Sync.pushDelayMs = TICK;
    device.setToday(options.today || '2026-10-20');
    device.ctx.askTell = message => { (device.told = device.told || []).push(message); return Promise.resolve(); };
    device.ctx.askText = async question => question.placeholder;
    device.State.load();
    return device;
}

// A phone's radio. While it is down every call to the cloud fails the way a tunnel fails
// it and the snapshot is held back; coming up delivers the latest one at once, before
// anything this phone queued can be flushed - the ordinary way back into signal, and the
// order tests/contested.test.mjs built the pre-send hold for.
function radio(cloud) {
    const air = { down: false, waiting: null, adapter: {}, calls: [] };
    Object.keys(cloud.adapter).forEach(name => {
        air.adapter[name] = (...args) => {
            if (name !== 'subscribe') air.calls.push(name);
            if (!air.down) return cloud.adapter[name](...args);
            const error = new Error('client is offline');
            error.code = 'unavailable';
            // No signal: the request never left, and the production adapter says so where
            // it does - update and save - and nowhere else. See `unsent` in tests/harness.mjs.
            if (name === 'update' || name === 'save') error.unsent = true;
            return Promise.reject(error);
        };
    });
    air.adapter.subscribe = (onNext, onError) => cloud.adapter.subscribe(snapshot => {
        if (air.down) air.waiting = [onNext, snapshot];
        else onNext(snapshot);
    }, onError);
    air.up = () => {
        air.down = false;
        const waiting = air.waiting;
        air.waiting = null;
        if (waiting) waiting[0](waiting[1]);
    };
    return air;
}

// The ⋯ panel as the person reads it. renderHeldRecords draws into the page, so it is given
// a document just rich enough to hold what it builds - children, attributes, a click - and
// the rows asserted are the ones drawn, not the two functions they are drawn from.
function panelDocument() {
    const make = tag => ({
        tagName: String(tag).toUpperCase(), className: '', textContent: '', type: '',
        hidden: false, children: [], attributes: {}, listeners: {},
        appendChild(child) { this.children.push(child); return child; },
        removeChild(child) { this.children.splice(this.children.indexOf(child), 1); return child; },
        get firstChild() { return this.children[0] || null; },
        setAttribute(name, value) { this.attributes[name] = String(value); },
        getAttribute(name) {
            return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
        },
        addEventListener(type, listener) { (this.listeners[type] = this.listeners[type] || []).push(listener); },
        removeEventListener() {},
        press() { (this.listeners.click || []).forEach(listener => listener({ target: this, type: 'click' })); }
    });
    const box = make('div');
    return {
        box,
        document: {
            getElementById: id => (id === 'heldRecords' ? box : null),
            querySelector: () => null,
            querySelectorAll: () => [],
            addEventListener() {},
            removeEventListener() {},
            createElement: make,
            head: { appendChild() {} }
        }
    };
}
const textOf = node => String(node.textContent || '') + (node.children || []).map(textOf).join('');
const bareText = text => String(text || '').replace(/[⁦-⁩]/g, '');

function heldCards(box) {
    const list = box.children.find(node => node.className === 'held-list');
    return (list ? list.children : []).map(card => ({
        title: textOf(card.children.find(node => node.className === 'held-title') || {}),
        sides: card.children.filter(node => node.className === 'held-side').map(textOf),
        // The day's other sites, drawn under a held count: each a title and its two sides.
        context: card.children.filter(node => node.className === 'held-context').map(block => [
            textOf(block.children.find(node => node.className === 'held-context-title') || {}),
            ...block.children.filter(node => node.className === 'held-side').map(textOf)]),
        buttons: card.children.filter(node => node.className === 'held-actions')
            .flatMap(node => node.children)
    }));
}

// ---------------------------------------------------------------- the path and the value
{
    suite('a count is one field path, a whole number from 1 to 99, and nothing else');

    const d = phone('d_model');
    const set = d.call('setRimaCount', d.State.schedule, '2026-10-12', 'p_01', 3);
    same('the edit names exactly one path', set.path, 'days.2026-10-12.rima.p_01');
    same('and carries the count as a number', set.value, 3);
    same('the day holds it under rima, by site', d.State.schedule.days['2026-10-12'].rima, { p_01: 3 });
    same('a day with Rima alone still has the two worker layers, empty',
        [d.State.schedule.days['2026-10-12'].plan, d.State.schedule.days['2026-10-12'].actual], [{}, {}]);

    // The sentences a person reads when a count will not read - the restore refusal and the
    // unreadable-record banner both print dayProblems - pinned like every other one (law 6).
    // The wire sentence is never shown (receive() reads only that there was one) and is
    // pinned all the same, so it cannot drift into a different word for the same refusal.
    const known = { places: new Set(['p_01', 'p_02', 'p_03']) };
    same('a map that is not a map, in its words',
        d.call('rimaProblems', [3], '2026-10-12', known), ['ליום 2026-10-12 יש רישום רימא שאינו תקין.']);
    same('a site id that is not an id, in its words',
        d.call('rimaProblems', { ' p_01': 3 }, '2026-10-12', known), ['ביום 2026-10-12 יש רישום רימא תחת מזהה שאינו תקין.']);
    same('a count that is not a count, in its words',
        d.call('rimaProblems', { p_01: 'three' }, '2026-10-12', known),
        ['ביום 2026-10-12 יש מספר עובדי רימא שאינו תקין באתר p_01.']);
    same('a site that is not on the roster, in its words',
        d.call('rimaProblems', { p_gone: 3 }, '2026-10-12', known),
        ['ביום 2026-10-12 יש רישום רימא באתר p_gone שאינו ברשימה.']);
    same('and the refusal on the wire, in its words',
        d.call('rimaWireProblems', { days: { '2026-10-12': { rima: { p_01: 'three' } } } }), ['רישום רימא אינו תקין.']);
    // Written twice in rimaWireProblems - a map that is not a map, and a value that is not a
    // count - and the same sentence at both.
    same('and on the wire a map that is not a map, in the same words',
        d.call('rimaWireProblems', { days: { '2026-10-12': { rima: [3] } } }), ['רישום רימא אינו תקין.']);

    same('10 is a guide, not a cap', d.call('setRimaCount', d.State.schedule, '2026-10-12', 'p_02', 14).value, 14);
    same('99 is accepted', d.call('setRimaCount', d.State.schedule, '2026-10-12', 'p_03', 99).value, 99);
    for (const [label, value] of [['100', 100], ['a fraction', 2.5], ['a negative', -1],
        ['a string', '3'], ['NaN', NaN], ['Infinity', Infinity], ['true', true]]) {
        const refused = d.call('setRimaCount', d.State.schedule, '2026-10-13', 'p_01', value);
        check(`${label} is refused, with the pinned sentence`, refused.refused === true
            && refused.reason === REFUSED, JSON.stringify(refused));
    }
    check('a refused count wrote nothing', d.State.schedule.days['2026-10-13'] === undefined,
        JSON.stringify(d.State.schedule.days['2026-10-13']));
    same('the pinned refusal is the one the model says', d.global('RIMA_REFUSED'), REFUSED);
    check('a date that does not exist is refused',
        d.call('setRimaCount', d.State.schedule, '2026-02-30', 'p_01', 3).refused === true);
    check('a site id that cannot be half of a path is refused',
        d.call('setRimaCount', d.State.schedule, '2026-10-12', 'p.01', 3).refused === true);

    const clear = d.call('setRimaCount', d.State.schedule, '2026-10-12', 'p_02', 0);
    same('0 clears: the same one path, with null', [clear.path, clear.value], ['days.2026-10-12.rima.p_02', null]);
    same('and the count is gone from the day', d.State.schedule.days['2026-10-12'].rima, { p_01: 3, p_03: 99 });
    d.call('setRimaCount', d.State.schedule, '2026-10-12', 'p_01', null);
    d.call('setRimaCount', d.State.schedule, '2026-10-12', 'p_03', '');
    check('clearing the last count takes the map with it, not an empty one left standing',
        d.State.schedule.days['2026-10-12'].rima === undefined,
        JSON.stringify(d.State.schedule.days['2026-10-12']));

    suite('the queue accepts exactly the edits the model makes');
    const q = (path, value) => d.call('journalEntryProblems', path, value);
    same('a count', q('days.2026-10-12.rima.p_01', 3), []);
    same('a clear', q('days.2026-10-12.rima.p_01', null), []);
    check('0 is not a count on the wire', q('days.2026-10-12.rima.p_01', 0).length > 0);
    check('100 is not', q('days.2026-10-12.rima.p_01', 100).length > 0);
    check('a fraction is not', q('days.2026-10-12.rima.p_01', 1.5).length > 0);
    check('a string is not', q('days.2026-10-12.rima.p_01', '3').length > 0);
    check('an object is not', q('days.2026-10-12.rima.p_01', { count: 3 }).length > 0);
    check('a poisoned site name is not', q('days.2026-10-12.rima.__proto__', 3).length > 0);
    check('a date that does not exist is not', q('days.2026-02-30.rima.p_01', 3).length > 0);
    check('and the worker layers are judged as before',
        q('days.2026-10-12.actual.w_01', { entries: [{ placeId: 'p_01' }] }).length === 0
        && q('days.2026-10-12.estimate.w_01', 3).length > 0);
}

// ---------------------------------------------------------------- one rule, three copies
//
// A cleared count is a DELETED field, and the rule saying so is written three times: in
// the production adapter (patchToUpdateArgs - the only file that knows Firebase exists),
// in writeFieldPath (js/sync/sync.js), and in the harness's fake cloud, which every Node
// suite here writes through. Drop the layer from the adapter alone and Firestore keeps a
// null under `rima` while every Node suite stays green against the harness's copy; only
// the emulator would see it. So the three are read off the source and compared.
{
    suite('the field-deletion rule names the same layers in the adapter, the sync layer and the fake cloud');

    const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    const layersIn = (text, anchor) => {
        const at = text.indexOf(anchor);
        if (at === -1) return null;
        const clause = text.slice(at, text.indexOf(';', at));
        return [...clause.matchAll(/parts\[2\] === '([a-zA-Z]+)'/g)].map(match => match[1]).sort();
    };
    const adapter = layersIn(source('js/sync/firebase-adapter.js'), "const removeDay = patch[path] === null");
    const sync = layersIn(source('js/sync/sync.js'), "if (value === null && parts.length === 4 && parts[0] === 'days'");
    const fake = layersIn(source('tests/harness.mjs'), "if (value === null && parts.length === 4 && parts[0] === 'days'");
    given('each of the three is found where it is written', Boolean(adapter && sync && fake),
        JSON.stringify([adapter, sync, fake]));
    same('the production adapter deletes a cleared plan, actual and Rima field', adapter, ['actual', 'plan', 'rima']);
    same('and the sync layer and the fake cloud say exactly the same', [sync, fake], [adapter, adapter]);
    // And each copy ACTS on what it names. A rule computed and then not used names the
    // right layers and deletes nothing: the adapter would send a null under `rima` again,
    // and only the emulator would see it.
    const clauseAt = (text, anchor) => {
        const at = text.indexOf(anchor);
        return at === -1 ? '' : text.slice(at, text.indexOf(';', at));
    };
    check('the adapter sends deleteField() for what the rule names',
        /args\.push\(new FieldPath\(\.\.\.parts\), removeDay \? deleteField\(\) : patch\[path\]\)/
            .test(source('js/sync/firebase-adapter.js')));
    check('and the sync layer and the fake cloud take the field off for it',
        [source('js/sync/sync.js'), source('tests/harness.mjs')].every(text => clauseAt(text,
            "if (value === null && parts.length === 4 && parts[0] === 'days'").endsWith('delete node[last]')));
}

// ---------------------------------------------------------------- the record's own doors
{
    suite('a stored record with Rima on it is a record this build opens');

    const d = phone('d_doors');
    rima(d, '2026-10-12', 'p_01', 3);
    work(d, '2026-10-13', 'w_01', 'p_02');
    rima(d, '2026-10-13', 'p_02', 2);
    const stored = JSON.parse(d.raw('scheduleData:v2'));
    same('the disk holds the counts', [stored.days['2026-10-12'].rima, stored.days['2026-10-13'].rima],
        [{ p_01: 3 }, { p_02: 2 }]);
    same('and the record is clean to this build', d.call('storedScheduleProblems', stored), []);
    same('and clean as a whole document for a restore', d.call('fullScheduleProblems',
        d.call('cloudDocument', d.State.schedule)), []);

    const reopened = makeDevice({ deviceId: 'd_doors', storage: d.dump() });
    reopened.State.load();
    same('a reopen reads them back', [reopened.call('rimaCount', reopened.State.schedule, '2026-10-12', 'p_01'),
        reopened.call('rimaCount', reopened.State.schedule, '2026-10-13', 'p_02')], [3, 2]);
    same('and is not held', reopened.call('farkadWritesBlocked'), false);

    const onlyRima = { schemaVersion: 2, workers: WORKERS(), places: PLACES(), advances: {},
        days: { '2026-10-12': { rima: { p_01: 4 } } } };
    same('a day carrying Rima and nothing else is a day, not an empty record',
        d.call('storedScheduleProblems', onlyRima), []);

    const bad = value => d.call('storedScheduleProblems', { schemaVersion: 2, workers: WORKERS(),
        places: PLACES(), advances: {}, days: { '2026-10-12': { plan: {}, actual: {}, rima: value } } });
    check('an unreadable count is refused, not read as nothing', bad({ p_01: 'three' }).length > 0,
        JSON.stringify(bad({ p_01: 'three' })));
    check('so is 0 stored as a count', bad({ p_01: 0 }).length > 0);
    check('so is a map that is not a map', bad([3]).length > 0 && bad('3').length > 0);
    check('a replacement naming a site its roster has not got is refused',
        d.call('fullScheduleProblems', { schemaVersion: 2, workers: WORKERS(), places: PLACES(),
            advances: {}, days: { '2026-10-12': { rima: { p_gone: 2 } } } }).length > 0);

    suite('every read keeps every count');
    const raw = { schemaVersion: 2, workers: WORKERS(), places: PLACES(), advances: {},
        days: { '2026-10-12': { rima: { p_01: 4, p_02: null } } } };
    const read = d.call('normaliseSchedule', raw);
    same('a count arrives as it was, a null as nothing', read.days['2026-10-12'].rima, { p_01: 4 });
    const tomb = { ...raw, roster: { places: { p_03: null } },
        days: { '2026-10-12': { rima: { p_03: 6 } } } };
    const back = d.call('normaliseSchedule', tomb);
    check('a site with a count on it outlives its tombstone, archived',
        back.places.some(place => place.id === 'p_03' && place.active === false),
        JSON.stringify(back.places));
    same('and its count with it', back.days['2026-10-12'].rima, { p_03: 6 });
    const poisoned = JSON.parse('{"schemaVersion":2,"workers":[],"places":[],"advances":{},'
        + '"days":{"2026-10-12":{"rima":{"__proto__":{"x":1},"p_01":2}}}}');
    const found = d.call('poisonedContainers', poisoned).map(item => item.at);
    same('a poisoned site name under rima is reported where it sits', found, ['days.2026-10-12.rima.__proto__']);

    suite('the rescue file compares captures by their counts too');
    const facts = d.call('recoveryFacts', d.State.schedule);
    check('each count is its own fact', facts['rima:2026-10-12:p_01'] === '3'
        && facts['rima:2026-10-13:p_02'] === '2', JSON.stringify(Object.keys(facts).filter(k => k.startsWith('rima'))));
}

// ---------------------------------------------------------------- the journal
{
    suite('a count is journalled before it is called saved, and survives a reopen offline');

    const d = phone('d_journal');
    given('the count commits', rima(d, '2026-10-14', 'p_03', 5) === true);
    const queued = d.Sync.pendingPaths ? d.Sync.pendingPaths() : [...d.Sync._outbox.keys()];
    check('the queue holds exactly the one path', queued.includes('days.2026-10-14.rima.p_03'),
        JSON.stringify(queued));
    const reopened = makeDevice({ deviceId: 'd_journal', storage: d.dump() });
    reopened.State.load();
    same('the reopen rebuilds it with no cloud anywhere',
        reopened.call('rimaCount', reopened.State.schedule, '2026-10-14', 'p_03'), 5);
    given('and a clear commits', rima(reopened, '2026-10-14', 'p_03', 0) === true);
    const again = makeDevice({ deviceId: 'd_journal', storage: reopened.dump() });
    again.State.load();
    same('the clear survives the next reopen', again.call('rimaCount', again.State.schedule, '2026-10-14', 'p_03'), 0);
    check('with no map left behind on that day',
        !again.State.schedule.days['2026-10-14'] || again.State.schedule.days['2026-10-14'].rima === undefined);
}

// ---------------------------------------------------------------- two phones, one cloud
{
    suite('two phones: the count travels as one path, a clear as a deletion');

    const cloud = makeCloud();
    const a = phone('d_a');
    const b = phone('d_b');
    a.Sync.connect(cloud.adapter);
    await settle(TICK * 10);
    b.Sync.connect(cloud.adapter);
    await settle(TICK * 10);

    const before = cloud.writes.length;
    rima(a, '2026-10-15', 'p_01', 3);
    await settleUntil(() => (cloudRima(cloud, '2026-10-15') || {}).p_01 === 3);
    const sent = cloud.writes.slice(before).map(write => Object.keys(write.patch || {})
        .filter(path => path.startsWith('days.')));
    same('the write carried that one path and no other day path', sent.flat(), ['days.2026-10-15.rima.p_01']);
    await settleUntil(() => b.call('rimaCount', b.State.schedule, '2026-10-15', 'p_01') === 3);
    same('the other phone has it', b.call('rimaCount', b.State.schedule, '2026-10-15', 'p_01'), 3);

    // Two people, two sites, the same evening: two fields, both kept.
    rima(a, '2026-10-15', 'p_02', 4);
    rima(b, '2026-10-15', 'p_03', 2);
    await settleUntil(() => {
        const held = cloudRima(cloud, '2026-10-15') || {};
        return held.p_02 === 4 && held.p_03 === 2;
    });
    await settleUntil(() => a.call('rimaCount', a.State.schedule, '2026-10-15', 'p_03') === 2
        && b.call('rimaCount', b.State.schedule, '2026-10-15', 'p_02') === 4);
    same('two sites typed on two phones are both in the cloud', cloudRima(cloud, '2026-10-15'),
        { p_01: 3, p_02: 4, p_03: 2 });
    same('and on both phones', [a.State.schedule.days['2026-10-15'].rima, b.State.schedule.days['2026-10-15'].rima],
        [{ p_01: 3, p_02: 4, p_03: 2 }, { p_01: 3, p_02: 4, p_03: 2 }]);

    rima(b, '2026-10-15', 'p_01', 0);
    await settleUntil(() => !Object.prototype.hasOwnProperty.call(cloudRima(cloud, '2026-10-15') || {}, 'p_01'));
    check('a clear removes the field from the cloud, it does not store a null',
        !Object.prototype.hasOwnProperty.call(cloudRima(cloud, '2026-10-15') || {}, 'p_01'),
        JSON.stringify(cloudRima(cloud, '2026-10-15')));
    await settleUntil(() => a.call('rimaCount', a.State.schedule, '2026-10-15', 'p_01') === 0);
    same('and the first phone sees it cleared', a.State.schedule.days['2026-10-15'].rima, { p_02: 4, p_03: 2 });
    same('both phones say synced, neither is held', [a.Sync.status, b.Sync.status,
        a.call('farkadWritesBlocked'), b.call('farkadWritesBlocked')], ['synced', 'synced', false, false]);

    suite('a Rima-only day reaches the other phone as a day');
    rima(a, '2026-10-16', 'p_02', 6);
    await settleUntil(() => b.call('rimaCount', b.State.schedule, '2026-10-16', 'p_02') === 6);
    same('the cloud holds a day with Rima and no worker', cloud.doc.days['2026-10-16'].rima, { p_02: 6 });
    same('the other phone reads it', b.call('rimaCount', b.State.schedule, '2026-10-16', 'p_02'), 6);
    same('and its disk is clean to this build',
        b.call('storedScheduleProblems', JSON.parse(b.raw('scheduleData:v2'))), []);

    suite('a malformed count from the cloud is refused, kept, and replaces nothing');
    const held = JSON.stringify(b.State.schedule);
    const raw = JSON.parse(JSON.stringify(cloud.doc));
    raw.days['2026-10-16'].rima.p_02 = 'six';
    raw.revision = cloud.doc.revision + 1;
    b.Sync.receive(raw);
    same('the schedule on the phone is unchanged', JSON.stringify(b.State.schedule), held);
    check('the snapshot is held as evidence', b.global('Recovery').problems
        .some(problem => problem.key === 'farkad:refusedSnapshot'), JSON.stringify(b.global('Recovery').problems.map(p => p.key)));
    check('and the phone stops writing until somebody has looked', b.call('farkadWritesBlocked') === true);
    a.Sync.stopListening(); a.Sync.disconnect();
    b.Sync.stopListening(); b.Sync.disconnect();
}

// ---------------------------------------------------------------- not one shekel
{
    suite('a Rima count moves no shekel - pay sheet, advances, closure, statement');

    const FROM = '2026-10-02';
    const TO = '2026-10-15';
    const d = withReports(phone('d_money'), FROM, TO);
    // A fortnight with every kind of day in it: a double at two sites, extra hours, an
    // absence, a weekly man and a fortnightly one, an advance, and a closed week.
    work(d, '2026-10-04', 'w_01', 'p_01', 'double');
    work(d, '2026-10-04', 'w_01', 'p_02', 'double');
    d.State.commit(d.call('assignPlace', d.State.schedule, '2026-10-05', 'w_01', 'actual', 'p_01', 'extra', 2));
    work(d, '2026-10-05', 'w_02', 'p_02');
    work(d, '2026-10-06', 'w_02', 'p_01');
    d.State.commit(d.call('markAbsent', d.State.schedule, '2026-10-07', 'w_01', 'actual'));
    d.State.commit(d.call('addAdvance', d.State.schedule, 'w_01', '2026-10-05', 500, ''));
    const closure = d.call('closePeriodChanges', d.State.schedule, 'w_02', '2026-10-02', '2026-10-08',
        '2026-10-09T12:00:00Z', d.id);
    given('a weekly account is closed', d.State.commitMany(closure) === true);

    // Every surface somebody is PAID from. The client's invoice is not on this list: it
    // is a count of people billed, and the owner ruled that Rima's men are in it - see
    // the suite after this one.
    const money = () => JSON.stringify({
        payroll: d.call('payrollReport', d.State.schedule, FROM, TO),
        days: WORKERS().map(w => d.call('workerDaysReport', d.State.schedule, d.State.worker(w.id), FROM, TO)),
        accounts: WORKERS().map(w => d.call('advanceAccount', d.State.schedule, w.id, FROM, TO)),
        rows: run(d, 'payrollRows()'),
        sheet: run(d, 'payrollSheetRows()'),
        detail: run(d, 'detailRows()'),
        advances: d.State.schedule.advances,
        ledger: d.State.schedule.ledger,
        footprints: WORKERS().map(w => d.call('workerFootprint', d.State.schedule, w.id))
    });
    const invoiceNow = () => d.call('invoiceByDate', d.State.schedule, FROM, TO);
    const billedBefore = invoiceNow();
    const sheetBefore = run(d, 'invoiceSheetRows()');
    const before = money();
    given('the fortnight has pay in it', /"amount":[1-9]/.test(before));

    // On a day both men worked, at the site they worked; at a site nobody of his was on;
    // on a day with nobody of his at all; inside the closed week; and on the absence.
    rima(d, '2026-10-04', 'p_01', 3);
    rima(d, '2026-10-05', 'p_03', 7);
    rima(d, '2026-10-09', 'p_02', 5);
    rima(d, '2026-10-06', 'p_01', 2);
    rima(d, '2026-10-07', 'p_01', 9);
    rima(d, '2026-10-12', 'p_03', 12);
    const after = money();
    same('every figure on every money surface is byte-for-byte what it was', after, before);
    check('and the counts are really there', d.call('rimaReport', d.State.schedule, FROM, TO).total === 38,
        String(d.call('rimaReport', d.State.schedule, FROM, TO).total));
    const row = d.call('payrollReport', d.State.schedule, FROM, TO).find(item => item.workerId === 'w_01');
    same('the man with a double at two sites is still one double day', [row.attendanceDays, row.doubleDays], [2, 1]);
    check('nobody is created to hold them: the crew is the same two men',
        d.State.schedule.workers.length === 2, JSON.stringify(d.State.schedule.workers.map(w => w.id)));

    suite('the client\'s invoice counts each of Rima\'s men as one worker-site day, like his own');
    // The owner's ruling, 2026-11-01: three of his and two of Rima's on a site is five.
    const billed = invoiceNow();
    const added = d.call('rimaReport', d.State.schedule, FROM, TO);
    const cells = [];
    billed.dates.forEach(date => d.State.schedule.places.forEach(place => {
        cells.push([date, place.id, billed.countAt(place.id, date),
            billedBefore.countAt(place.id, date) + added.countAt(place.id, date)]);
    }));
    same('every site, every day: his men plus Rima\'s, nothing else',
        cells.filter(([, , got, want]) => got !== want), []);
    same('a day with his men and Rima\'s on the same site', billed.countAt('p_01', '2026-10-04'), 4);
    same('the whole invoice is his worker-site days plus every Rima count', billed.total,
        billedBefore.total + 38);
    check('a Rima-only day is now a billed day', billed.dates.includes('2026-10-09')
        && !billedBefore.dates.includes('2026-10-09') && billed.countAt('p_02', '2026-10-09') === 5,
        JSON.stringify(billed.dates));
    check('a site billed only for Rima appears on the invoice',
        billed.places.some(place => place.placeId === 'p_03'), JSON.stringify(billed.places.map(p => p.placeId)));
    const sheetNow = run(d, 'invoiceSheetRows()');
    same('the חיוב sheet\'s grand total moved by exactly the Rima total',
        sheetNow[sheetNow.length - 1].slice(-1)[0] - sheetBefore[sheetBefore.length - 1].slice(-1)[0], 38);
    const day = billed.places.find(place => place.placeId === 'p_01').days.find(item => item.date === '2026-10-04');
    same('the day says how much of it was Rima\'s', [day.count, day.workerIds.length, day.rima], [4, 1, 3]);
    check('and a day with no Rima reads exactly as it did',
        !Object.prototype.hasOwnProperty.call(billed.places.find(place => place.placeId === 'p_02')
            .days.find(item => item.date === '2026-10-05'), 'rima'));

    suite('the Rima table: its own dates, only its sites, its own total');
    const report2 = d.call('rimaReport', d.State.schedule, FROM, TO);
    same('one row per date that HAS Rima, the Rima-only days included', report2.dates,
        ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-09', '2026-10-12']);
    same('one column per site that had Rima, in roster order', report2.places.map(p => [p.placeId, p.name, p.total]),
        [['p_01', 'הרצליה', 14], ['p_02', 'תל אביב', 5], ['p_03', 'פרדסיה', 19]]);
    same('a day\'s total is that day\'s sites added', report2.dayTotal('2026-10-05'), 7);
    same('the whole total', report2.total, 38);
    same('one client\'s site narrows it to that site alone',
        (({ dates, total }) => ({ dates, total, columns: d.call('rimaReport', d.State.schedule, FROM, TO, 'p_03').places.length }))(
            d.call('rimaReport', d.State.schedule, FROM, TO, 'p_03')),
        { dates: ['2026-10-05', '2026-10-12'], total: 19, columns: 1 });
    same('a range with no Rima has no table', d.call('rimaReport', d.State.schedule, '2026-09-01', '2026-09-30').places, []);

    suite('the workbook: a last sheet of real numbers, and the first sheet untouched');
    const sheets = run(d, 'reportSheets()');
    // v167 MOVED: «בלי עובדי רימא» rides right after the billing grid whenever there is Rima.
    same('the sheets: pay, billing, the billing without Rima, detail, then רימא', Object.keys(sheets),
        ['payroll', 'invoice', 'withoutRima', 'detail', 'rima']);
    const sheet = sheets.rima;
    same('header: date, the Rima sites, total', sheet[0], ['תאריך', 'הרצליה', 'תל אביב', 'פרדסיה', 'סה״כ']);
    same('a Rima-only day is a row, with its full date', sheet.find(r => r[0] === '2026-10-09'), ['2026-10-09', 0, 5, 0, 5]);
    // v167 MOVED: the total line is the last row of NUMBERS; an empty row and the note follow.
    same('the last row of numbers is the pinned total line', sheet[sheet.length - 3], [TOTAL, 14, 5, 19, 38]);
    same('then an empty row, then the note in the first column', sheet.slice(-2), [[], [SHEET_NOTE]]);
    check('every count is a number, so a SUM works', sheet.slice(1, -2).every(r => r.slice(1).every(cell => typeof cell === 'number')),
        JSON.stringify(sheet));
    const body = sheet.slice(1, -3);
    same('the date rows add up to the total row, column by column',
        [1, 2, 3, 4].map(col => body.reduce((sum, r) => sum + r[col], 0)), [14, 5, 19, 38]);
    same('and each row\'s own total is its sites added', body.map(r => r[1] + r[2] + r[3] === r[4]), body.map(() => true));
    same('the pay sheet\'s header did not gain a column', sheets.payroll[0], JSON.parse(before).sheet[0]);
    same('the pinned words are the ones reports.js says', [d.global('RIMA_TITLE'), d.global('RIMA_NOTE'),
        d.global('RIMA_TOTAL'), d.global('RIMA_SHEET')], [TITLE, NOTE, TOTAL, SHEET]);
    same('and the sheet\'s note is the paper\'s line, «בחיוב שלמעלה» made «בגיליון החיוב», word for word',
        [(() => { try { return d.global('RIMA_SHEET_NOTE'); } catch (error) { return null; } })(),
            NOTE.replace('בחיוב שלמעלה', 'בגיליון החיוב')], [SHEET_NOTE, SHEET_NOTE]);

    suite('the company file names nobody');
    run(d, "REPORT_SECTION = 'sites'; INVOICE_PLACE = 'p_01';");
    const client = run(d, 'reportSheets()');
    same('one client\'s file is the billing grid, it without Rima, and that site\'s Rima, nothing else', Object.keys(client),
        ['invoice', 'withoutRima', 'rima']);
    same('narrowed to that client\'s site', client.rima[0], ['תאריך', 'הרצליה', 'סה״כ']);
    const text = JSON.stringify(client);
    const names = WORKERS().map(w => w.name).concat(['דוד', 'סמיר']);
    same('no worker\'s name appears anywhere in it', names.filter(name => text.includes(name)), []);
    check('nor any wage', !/400|350|500/.test(JSON.stringify(client.rima)), JSON.stringify(client.rima));
    run(d, "REPORT_SECTION = 'workers'; INVOICE_PLACE = null;");
    same('the רימא sheet of the full workbook names nobody either',
        names.filter(name => JSON.stringify(run(d, 'reportSheets()').rima).includes(name)), []);
    run(d, "REPORT_WORKERS = new Set(['w_01']);");
    same('a selected-worker export is about those men\'s pay and carries no Rima sheet',
        Object.keys(run(d, 'reportSheets()')), ['payroll', 'detail']);
    run(d, 'REPORT_WORKERS = null;');

    // ------------------------------------------------------------ בלי עובדי רימא (v167)
    //
    // The owner, 2026-11-07: "a list without Rima's men on the same page". The invoice's
    // own grid - its dates, its sites - counting only his men. ONE function builds it for
    // the screen and the sheet; here it is held against the invoice and the Rima table, cell
    // by cell: his men plus Rima's IS the invoice, everywhere, and nothing else is in it.
    suite('בלי עובדי רימא: the invoice\'s grid with his men only - and with the Rima table, the invoice');
    const tryRun = code => { try { return run(d, code); } catch (error) { return { threw: String(error && error.message) }; } };
    check('one model function builds it', tryRun("typeof invoiceWithoutRima") === 'function');
    const own = tryRun(`invoiceWithoutRima(State.schedule, '${FROM}', '${TO}')`) || {};
    const bill = d.call('invoiceByDate', d.State.schedule, FROM, TO);
    const counted = d.call('rimaReport', d.State.schedule, FROM, TO);
    same('the invoice\'s own dates', own.dates, bill.dates);
    same('the invoice\'s own sites, in its order', (own.places || []).map(p => [p.placeId, p.name]),
        bill.places.map(p => [p.placeId, p.name]));
    const cellsOf = fn => bill.dates.flatMap(date => bill.places.map(p => [date, p.placeId, fn(p.placeId, date)]));
    const ownAt = (placeId, date) => (typeof own.countAt === 'function' ? own.countAt(placeId, date) : NaN);
    same('every site, every day: his men only - the men the record puts on that site',
        cellsOf(ownAt).filter(([date, placeId, got]) =>
            got !== d.call('workersAtPlace', d.State.schedule, date, placeId, 'actual').length), []);
    same('every site, every day: this plus the Rima count is the invoice\'s count',
        cellsOf((placeId, date) => ownAt(placeId, date) + counted.countAt(placeId, date) - bill.countAt(placeId, date))
            .filter(([, , diff]) => diff !== 0), []);
    same('every day: its total plus that day\'s Rima is the invoice\'s day',
        bill.dates.filter(date => (typeof own.dayTotal === 'function' ? own.dayTotal(date) : NaN) + counted.dayTotal(date)
            !== bill.places.reduce((sum, p) => sum + bill.countAt(p.placeId, date), 0)), []);
    same('every site: its worker-site days plus its Rima total is the invoice\'s',
        bill.places.filter(p => (((own.places || []).find(o => o.placeId === p.placeId) || {}).workerDays)
            + ((counted.places.find(r => r.placeId === p.placeId) || { total: 0 }).total) !== p.workerDays).map(p => p.placeId), []);
    same('and the totals: his 5 and Rima\'s 38 are the invoice\'s 43', [own.total, counted.total, bill.total], [5, 38, 43]);
    same('one client\'s site narrows it to that site and the dates it was billed',
        (o => o && o.places ? { columns: o.places.map(p => p.placeId), dates: o.dates, total: o.total } : o)(
            tryRun(`invoiceWithoutRima(State.schedule, '${FROM}', '${TO}', 'p_01')`)),
        { columns: ['p_01'], dates: ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07'], total: 3 });

    suite('בלי עובדי רימא in the workbook: right after חיוב, numbers, the same as the screen');
    const own2 = run(d, 'reportSheets()').withoutRima || null;
    same('header: the date, the invoice\'s sites, the total', own2 && own2[0], ['תאריך', 'הרצליה', 'תל אביב', 'פרדסיה', 'סה״כ']);
    same('a row per invoice date, full dates, every count a number - Rima-only days included, at nothing',
        own2 && own2.slice(1, -1), [
            ['2026-10-04', 1, 1, 0, 2], ['2026-10-05', 1, 1, 0, 2], ['2026-10-06', 1, 0, 0, 1],
            ['2026-10-07', 0, 0, 0, 0], ['2026-10-09', 0, 0, 0, 0], ['2026-10-12', 0, 0, 0, 0]]);
    same('its total line, in the invoice\'s own words', own2 && own2[own2.length - 1], [NO_RIMA_TOTAL, 3, 2, 0, 5]);
    same('the sheet is the model\'s table, cell for cell', own2 && own2.slice(1, -1).map(r => r.slice(1, -1)),
        bill.dates.map(date => bill.places.map(p => ownAt(p.placeId, date))));
    same('the pinned words are the ones reports.js says', [tryRun('NO_RIMA_TITLE'), tryRun('NO_RIMA_TOTAL')], [NO_RIMA, NO_RIMA_TOTAL]);
    check('it names nobody and pays nobody', own2 !== null && !names.some(name => JSON.stringify(own2).includes(name))
        && !/400|350|500/.test(JSON.stringify(own2)), JSON.stringify(own2));
    run(d, "REPORT_SECTION = 'sites'; INVOICE_PLACE = 'p_01';");
    const scopedOwn = run(d, 'reportSheets()').withoutRima || null;
    same('one client\'s site: narrowed to it', scopedOwn, [['תאריך', 'הרצליה', 'סה״כ'],
        ['2026-10-04', 1, 1], ['2026-10-05', 1, 1], ['2026-10-06', 1, 1], ['2026-10-07', 0, 0], [NO_RIMA_TOTAL, 3, 3]]);
    run(d, `REPORT_SECTION = 'workers'; INVOICE_PLACE = null; REPORT_RANGE.from = '2026-09-01'; REPORT_RANGE.to = '2026-09-30';`);
    same('a range with no Rima: no such sheet - it would be the invoice again', Object.keys(run(d, 'reportSheets()')),
        ['payroll', 'invoice', 'detail']);
    run(d, `REPORT_RANGE.from = '${FROM}'; REPORT_RANGE.to = '${TO}';`);
    same('and building it moved no shekel', money(), after);
}

// ---------------------------------------------------------------- ten sites
{
    suite('ten sites, Rima on two: two columns, and the other eight are nowhere');

    const ten = Array.from({ length: 10 }, (_, i) => ({ id: `p_${i}`, name: `אתר מספר ${i + 1}`, active: true }));
    const d = withReports(phone('d_ten', { places: ten }), '2026-10-01', '2026-10-31');
    // One site a day for one man: the two-site cap would otherwise refuse most of them.
    ten.forEach((place, i) => work(d, `2026-10-${String(i + 10)}`, 'w_01', place.id));
    rima(d, '2026-10-05', 'p_3', 2);
    rima(d, '2026-10-06', 'p_8', 4);
    const table = d.call('rimaReport', d.State.schedule, '2026-10-01', '2026-10-31');
    same('only the two sites with Rima are columns', table.places.map(p => p.placeId), ['p_3', 'p_8']);
    same('the sheet is four columns wide - date, two sites, total - not twelve',
        run(d, 'reportSheets()').rima[0].length, 4);
    same('and the invoice above still has all ten', d.call('invoiceByDate', d.State.schedule, '2026-10-01', '2026-10-31').places.length, 10);
}

// ---------------------------------------------------------------- the WhatsApp message
//
// NO RIMA IN IT - the owner's decision, 2026-11-02. The day's message is the seder, in
// Hebrew, for his own crew; Rima's men are counted for the client's bill and for nothing
// else. So no heading, no site line and no total, in any template, for the whole day or
// for one site, and a day with only Rima's men reads exactly as a day with nobody of his
// assigned - which, to the men the message goes to, is what it is. Measured twice: against
// what the same phone wrote about the same days before a count was typed, and against
// what v165 - the build that never heard of Rima, on its own bytes out of Git - writes for
// the same crew.
{
    suite('the WhatsApp message carries no Rima - every template, the whole day and each site (owner, 2026-11-02)');

    const d = phone('d_share');
    const say = (date, style, placeId) => d.call('dayMessage', date, 'actual', style, placeId);
    const STYLES = d.global('MESSAGE_STYLES').map(style => style.key);
    given('every template the app offers is measured - the owner\'s three', STYLES.join(' ') === 'pin crane morning',
        JSON.stringify(STYLES));
    // Every message the app can write about four days: each template, each layer, the whole
    // day and each site alone. The 12th has his man on הרצליה and counts on his site and on
    // a site with nobody of his; the 13th has Rima's men and nobody of his; the 15th has his
    // man away and a count; the 14th has nothing at all.
    const DATES = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'];
    const LAYERS = ['actual', 'plan'];
    const SITES = [null].concat(PLACES().map(place => place.id));
    const messages = device => DATES.flatMap(date => LAYERS.flatMap(layer => STYLES.flatMap(style =>
        SITES.map(site => [`${date} ${layer} ${style} ${site || 'whole day'}`,
            device.call('dayMessage', date, layer, style, site)]))));
    const crew = device => {
        device.State.commit(device.call('assignPlace', device.State.schedule, '2026-10-12', 'w_01', 'actual', 'p_01'));
        device.State.commit(device.call('markAbsent', device.State.schedule, '2026-10-15', 'w_01', 'actual'));
    };

    crew(d);
    const before = messages(d);
    const plain = say('2026-10-12', 'pin');
    rima(d, '2026-10-12', 'p_01', 3);
    rima(d, '2026-10-12', 'p_03', 2);
    rima(d, '2026-10-13', 'p_02', 4);
    rima(d, '2026-10-15', 'p_01', 1);
    given('the counts are on the record - for the day screen, the bill and the Rima table',
        d.call('rimaReport', d.State.schedule, '2026-10-12', '2026-10-15').total === 10,
        JSON.stringify(d.State.schedule.days));
    const after = messages(d);
    given('every one of those messages was written',
        after.length === DATES.length * LAYERS.length * STYLES.length * SITES.length
            && after.every(([, text]) => typeof text === 'string' && text.length > 0), String(after.length));

    same('every one of them is byte for byte what it was before a count was typed',
        after.filter(([, text], i) => text !== before[i][1]).map(([key]) => key), []);
    same('not one carries the Rima heading, a Rima total, or the word רימא at all',
        after.filter(([, text]) => text.includes('רימא')).map(([key]) => key), []);

    const withRima = say('2026-10-12', 'pin');
    same('his crew\'s day is untouched by the counts', withRima, plain);
    same('word for word: the site, his man, the absentee line - and nothing after it', withRima,
        '📅 סידור עבודה – יום שני 12/10/2026\n\n📍 ⁨הרצליה⁩\n• ⁨דוד לוי⁩\n\n🚫 נעדרים: אין');
    const one = say('2026-10-12', 'pin', 'p_01');
    same('one site, his man and Rima\'s three on it: the site and his man, and nothing after',
        one.split('\n').slice(2), ['📍 ⁨הרצליה⁩', '• ⁨דוד לוי⁩']);
    check('and not the other site\'s', !one.includes('פרדסיה'), one);

    const NONE = 'אין שיבוצים ליום הזה.';
    const heading = (style, date) => d.global('MESSAGE_STYLES').find(item => item.key === style)
        .heading(d.call('parseLocalDate', date));
    const alone = say('2026-10-13', 'pin');
    check('a day with Rima and none of his men still says nobody of his is assigned',
        alone.includes('אין שיבוצים ליום הזה.'), alone);
    same('and says nothing else - the heading and that line, in every template',
        STYLES.map(style => say('2026-10-13', style)),
        STYLES.map(style => `${heading(style, '2026-10-13')}\n\n${NONE}`));
    same('a site with Rima\'s men and none of his, alone, is the one-site form of it - on either day',
        STYLES.flatMap(style => [say('2026-10-13', style, 'p_02'), say('2026-10-12', style, 'p_03')]),
        STYLES.flatMap(style => [`${heading(style, '2026-10-13')}\n\n⁨תל אביב⁩: ${NONE}`,
            `${heading(style, '2026-10-12')}\n\n⁨פרדסיה⁩: ${NONE}`]));
    same('and names nobody', WORKERS().map(w => w.name).filter(name => alone.includes(name)), []);
    same('a day with his man away and Rima\'s men on site says who is away, and stops',
        say('2026-10-15', 'pin').split('\n').slice(1), ['', '🚫 נעדרים: ⁨דוד לוי⁩']);
    same('a day with nothing at all is the message it always was', say('2026-10-14', 'pin').split('\n').slice(-1),
        ['אין שיבוצים ליום הזה.']);

    // v165, the build before this one, given the same crew. Its share.js is the message as
    // it was before Rima existed, so whatever it writes is what this one must write.
    const V165 = 'e34fb66e4beb19804f631257e0b29d4d9e32eda3';
    const show = file => execFileSync('git', ['-C', ROOT, 'show', `${V165}:${file}`],
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    let sources = [];
    try { sources = olderOrder().map(file => ({ file, code: show(file) })); } catch (error) { sources = []; }
    given('v165 is in this repository, with every file this build loads that it had', sources.length === olderOrder().length,
        `${sources.length} of ${olderOrder().length}`);
    const stamp = (/const APP_VERSION = '([^']+)'/.exec(show('js/app.js')) || [])[1];
    given('the older build is v165 and does not know the layer',
        stamp === 'v165' && !sources.some(source => /\brima\b/i.test(source.code)), String(stamp));
    const old = makeDevice({ sources, appVersion: stamp, deviceId: 'd_share_v165' });
    old.setToday('2026-10-20');
    old.State.schedule.workers = WORKERS();
    old.State.schedule.places = PLACES();
    old.State.save({ silent: true });
    crew(old);
    const older = messages(old);
    same('and every one of them is what v165 writes for the same crew - every template, the whole day and each site',
        after.filter(([key, text], i) => key !== older[i][0] || text !== older[i][1]).map(([key]) => key), []);
}

// ---------------------------------------------------------------- the held record
{
    suite('two counts for one site, typed at once: held, shown with both, decided');

    // A phone that can write but cannot hear - see tests/held.test.mjs.
    const tunnel = cloud => {
        const gate = { open: true, waiting: [], adapter: {} };
        Object.keys(cloud.adapter).forEach(name => { gate.adapter[name] = (...args) => cloud.adapter[name](...args); });
        gate.adapter.subscribe = (onNext, onError) => cloud.adapter.subscribe(snapshot => {
            if (gate.open) onNext(snapshot); else gate.waiting.push([onNext, snapshot]);
        }, onError);
        gate.close = () => { gate.open = false; };
        gate.release = () => {
            gate.open = true;
            const waiting = gate.waiting.slice();
            gate.waiting = [];
            waiting.forEach(([onNext, snapshot]) => onNext(snapshot));
        };
        return gate;
    };
    const cloud = makeCloud();
    const a = phone('d_ha');
    const b = phone('d_hb');
    vm.runInContext(SETTINGS, b.ctx, { filename: 'js/ui/settings.js' });
    const gate = tunnel(cloud);
    a.Sync.connect(cloud.adapter);
    await settle(TICK * 10);
    b.Sync.connect(gate.adapter);
    await settle(TICK * 10);

    const DAY = '2026-10-12';
    rima(a, DAY, 'p_01', 3);
    await settleUntil(() => (cloudRima(cloud, DAY) || {}).p_01 === 3 && b.Sync._revision === cloud.doc.revision);
    given('both phones read 3 at the same revision', b.call('rimaCount', b.State.schedule, DAY, 'p_01') === 3);
    gate.close();
    rima(a, DAY, 'p_01', 4);
    await settleUntil(() => (cloudRima(cloud, DAY) || {}).p_01 === 4);
    rima(b, DAY, 'p_01', 5);
    b.Sync.flush();
    await settleUntil(() => b.Sync.status === 'contested');
    given('the second phone lost the race and holds', b.Sync.holdingContested() === true, b.Sync.status);
    gate.release();
    await settleUntil(() => b.Sync._revision === cloud.doc.revision);
    await settle(TICK * 20);
    const rows = b.Sync.heldRecords();
    same('one row, on the Rima path', rows.map(row => row.path), [`days.${DAY}.rima.p_01`]);
    const said = b.call('describeHeldRecord', rows[0], b.State.schedule);
    same('titled with the day, רימא and the site - not a man', said.title, 'יום שני 12/10 · רימא · ⁨הרצליה⁩');
    same('each side is the number it says', [said.mine, said.cloud], ['5', '4']);
    check('and a decision is offered', said.kind === 'rima' && said.decidable === true && said.takeable === true,
        JSON.stringify(said));
    check('the cloud still says 4: listing it sent nothing', (cloudRima(cloud, DAY) || {}).p_01 === 4);

    b.ctx.askConfirm = () => Promise.resolve(true);
    const took = await b.call('resolveHeldRecord', rows[0], true);
    check('taking the cloud\'s count commits it', took === true, String(took));
    await settleUntil(() => b.Sync.heldRecords().length === 0 && b.Sync.pendingCount() === 0, 8000);
    same('the phone now says 4, like the cloud', [b.call('rimaCount', b.State.schedule, DAY, 'p_01'), (cloudRima(cloud, DAY) || {}).p_01], [4, 4]);
    check('and nothing is held any more', b.Sync.holdingContested() === false);
    a.Sync.stopListening(); a.Sync.disconnect();
    b.Sync.stopListening(); b.Sync.disconnect();
}

// ---------------------------------------------------------------- the kept ring
//
// The bounded ring (KEPT_PREFIX, js/sync/sync.js) lays a collected field back over a disk
// that holds NOTHING there, because that nothing is what an older build's copy looks
// like. A Rima clear is exactly that nothing - setRimaCount deletes the field, and so does
// the snapshot carrying another phone's clear - so a count this phone sent and another
// phone then cleared came back at every open with no signal: on the field, on every Rima
// surface, and as a correction refused against this phone's own disk.
{
    suite('a count another phone cleared stays cleared when this phone opens with no signal');

    const cloud = makeCloud();
    const a = phone('d_ka');
    const b = phone('d_kb');
    a.Sync.connect(cloud.adapter);
    await settle(TICK * 10);
    b.Sync.connect(cloud.adapter);
    await settle(TICK * 10);

    const DAY = '2026-10-15';
    const PATH = `days.${DAY}.rima.p_01`;
    const count = device => device.call('rimaCount', device.State.schedule, DAY, 'p_01');
    const kept = device => Object.keys(device.dump()).filter(key => key.startsWith('farkad:kept:')).sort();
    // Collected: the cloud has it, and the operation's own bytes are off this disk.
    const drained = device => device.Sync.pendingCount() === 0
        && !Object.keys(device.dump()).some(key => key.includes(':op:'));

    rima(a, DAY, 'p_01', 3);
    await settleUntil(() => (cloudRima(cloud, DAY) || {}).p_01 === 3 && drained(a));
    work(a, DAY, 'w_01', 'p_01');
    await settleUntil(() => Boolean(((cloud.doc.days[DAY] || {}).actual || {}).w_01) && drained(a));
    given('the count and a worker-day reached the cloud and were collected off this phone',
        drained(a) && (cloudRima(cloud, DAY) || {}).p_01 === 3, JSON.stringify(Object.keys(a.dump())));
    same('the ring keeps the worker-day and not the count: a count takes no slot from a pay record',
        kept(a), [`farkad:kept:days.${DAY}.actual.w_01`]);
    check('and the ring is not short of the worker-day it exists for', a.Sync.keptIncomplete() === false);

    rima(b, DAY, 'p_01', 0);
    await settleUntil(() => !Object.prototype.hasOwnProperty.call(cloudRima(cloud, DAY) || {}, 'p_01')
        && count(a) === 0 && a.Sync.status === 'synced');
    given('this phone adopted the other phone\'s clear', count(a) === 0 && a.Sync.status === 'synced',
        a.Sync.status);
    // The day as this phone holds it after the clear: the worker-day, and no count.
    const adopted = a.call('canonicalJson', a.State.schedule.days[DAY]);
    a.Sync.stopListening(); a.Sync.disconnect();
    const cleared = a.dump();

    const offline = reopen('d_ka', cleared);
    same('opened with no signal, the field shows the clear', count(offline), 0);
    same('and so does the Rima table',
        offline.call('rimaReport', offline.State.schedule, '2026-10-01', '2026-10-31').total, 0);
    check('nothing claims an older build replaced the record', offline.State.recordWasReplaced === false,
        JSON.stringify(offline.State.recovered));
    same('the day is exactly as this phone adopted it, the worker-day in it',
        [Boolean(((offline.State.schedule.days[DAY] || {}).actual || {}).w_01),
            offline.call('canonicalJson', offline.State.schedule.days[DAY])], [true, adopted]);
    same('a correction to 2 commits', rima(offline, DAY, 'p_01', 2), true);
    same('and nothing is held against this phone\'s own disk',
        offline.Sync.heldRecords().map(row => row.path), []);
    same('the field says 2', count(offline), 2);
    offline.Sync.connect(cloud.adapter);
    await settleUntil(() => (cloudRima(cloud, DAY) || {}).p_01 === 2 && count(b) === 2
        && offline.Sync.pendingCount() === 0 && offline.Sync.status === 'synced', 4000);
    same('with signal back, the correction reaches the cloud and the other phone',
        [(cloudRima(cloud, DAY) || {}).p_01, count(b), offline.Sync.status], [2, 2, 'synced']);
    offline.Sync.stopListening(); offline.Sync.disconnect();

    suite('a Rima entry already in the ring is not laid back over the disk either');
    // The keep loop writes none now; boot reads the ring, not the loop, so an entry already
    // there - planted the way an earlier candidate of this build left one - is asked too.
    const planted = Object.assign({}, cleared, {
        [`farkad:kept:${PATH}`]: JSON.stringify({ path: PATH, value: 3,
            at: '2026-10-15T18:00:00.000Z', seq: 1, by: 'd_ka' })
    });
    const ringed = reopen('d_ka', planted);
    same('the planted count is not put back', count(ringed), 0);
    check('and nothing claims the record was replaced', ringed.State.recordWasReplaced === false,
        JSON.stringify(ringed.State.recovered));
    same('a correction commits', rima(ringed, DAY, 'p_01', 2), true);
    same('and nothing is held', ringed.Sync.heldRecords().map(row => row.path), []);

    suite('an older copy without the worker-day: the ring puts that back, and never a count');
    // The fix is that narrow. A build that cannot be given new code writes its stale memory
    // over the record, and what this phone confirmed comes back from the ring with no signal -
    // the worker-day, as before. A count it never puts back: the price of the fix, accepted.
    // The cloud keeps a count, and the next snapshot brings it back - even one carrying this
    // copy's own stamps, which is measured below on the phone that updates.
    const stale = JSON.parse(cleared['scheduleData:v2']);
    delete stale.days[DAY].actual.w_01;
    const behind = reopen('d_ka', Object.assign({}, cleared, { 'scheduleData:v2': JSON.stringify(stale) }));
    same('the worker-day is put back from the ring, and only the worker-day',
        [behind.State.recordWasReplaced, behind.State.recovered], [true, [`days.${DAY}.actual.w_01`]]);
    check('so the day has its worker again',
        Boolean(((behind.State.schedule.days[DAY] || {}).actual || {}).w_01));
    same('and the count stays cleared', count(behind), 0);
    b.Sync.stopListening(); b.Sync.disconnect();
}

// ---------------------------------------------------------------- a stale count against a clear
//
// movedUnder (js/sync/receive.js) is the pre-send half of the conflict rule. A phone that
// comes back, hears the other phone first and only then flushes is refused by nothing -
// its revision is current - so the question is asked of the snapshot before the write
// leaves. It used to wave through any path the server holds nothing at, which was true
// while every clear was a placeholder value. A Rima clear is an absence: a stale offline
// count walked over the other phone's clear, a moved count was counted twice, and both
// phones said synced.
{
    const DAY = '2026-10-15';
    const PATH = `days.${DAY}.rima.p_01`;
    const has = (map, key) => Object.prototype.hasOwnProperty.call(map || {}, key);
    const count = (device, placeId) => device.call('rimaCount', device.State.schedule, DAY, placeId);
    const cloudDay = cloud => ((((cloud.doc || {}).days || {})[DAY]) || {});
    const counts = cloud => Object.keys(cloudDay(cloud).rima || {}).sort()
        .map(placeId => [placeId, cloudDay(cloud).rima[placeId]]);
    const ORDERS = ['the snapshot arrives before the flush', 'reopened with signal, the snapshot first'];

    // Two phones on one cloud, A behind a radio. `before` brings both to one record at one
    // revision; A loses signal and makes `offline`; B makes `online` and it lands; A comes
    // back the way `order` says. What the evening needed and did not get comes back in
    // `missed`, and every caller asserts it, in its own suite, above the checks it protects.
    async function evening(tag, order, steps) {
        const missed = [];
        const need = (what, ok, detail) => { if (!ok) missed.push(`${tag}: ${what} - ${detail}`); };
        const cloud = makeCloud();
        const air = radio(cloud);
        let a = phone(`d_${tag}_a`);
        const b = phone(`d_${tag}_b`);
        a.Sync.connect(air.adapter);
        await settle(TICK * 10);
        b.Sync.connect(cloud.adapter);
        await settle(TICK * 10);
        if (steps.before) await steps.before(a, b, cloud, need);
        await settleUntil(() => a.Sync.pendingCount() === 0 && b.Sync.pendingCount() === 0
            && a.Sync._revision === cloud.doc.revision && b.Sync._revision === cloud.doc.revision);
        need('both phones start from one record at one revision',
            a.Sync._revision === cloud.doc.revision && b.Sync._revision === cloud.doc.revision,
            JSON.stringify([a.Sync._revision, b.Sync._revision, cloud.doc.revision]));
        air.down = true;
        steps.offline(a);
        await settle(TICK * 10);
        if (steps.online) {
            steps.online(b);
            await settleUntil(() => steps.landed(cloud) && b.Sync.pendingCount() === 0);
            need('the other phone\'s edit landed', steps.landed(cloud), JSON.stringify(cloudDay(cloud)));
        }
        if (order === ORDERS[0]) {
            air.up();
        } else {
            const disk = a.dump();
            a.Sync.stopListening(); a.Sync.disconnect();
            a = reopen(a.id, disk);
            a.Sync.connect(cloud.adapter);
        }
        await settleUntil(() => (a.Sync.pendingCount() === 0 && a.Sync.status === 'synced')
            || a.Sync.holdingContested(), 6000);
        await settle(TICK * 30);
        return { cloud, a, b, ready: missed.length === 0, missed: missed.join(' | ') };
    }
    const done = ({ a, b }) => {
        a.Sync.stopListening(); a.Sync.disconnect();
        b.Sync.stopListening(); b.Sync.disconnect();
    };
    const seenThree = async (a, b, cloud, need) => {
        rima(a, DAY, 'p_01', 3);
        await settleUntil(() => count(b, 'p_01') === 3);
        need('the other phone heard the 3', count(b, 'p_01') === 3, String(count(b, 'p_01')));
    };

    for (const [index, order] of ORDERS.entries()) {
        suite(`a count changed offline while the other phone cleared it is held (${order})`);
        const race = await evening(`rc${index}`, order, {
            before: seenThree,
            offline: a => rima(a, DAY, 'p_01', 4),
            online: b => rima(b, DAY, 'p_01', 0),
            landed: cloud => !has(cloudDay(cloud).rima, 'p_01')
        });
        given('both phones began at one record, and the other phone\'s clear landed while this one was away',
            race.ready, race.missed);
        check('this phone\'s stale 4 is held for a person, not sent over the clear',
            race.a.Sync.holdingContested() === true, race.a.Sync.status);
        check('the cloud stays cleared', !has(cloudDay(race.cloud).rima, 'p_01'),
            JSON.stringify(cloudDay(race.cloud).rima));
        same('and the other phone still shows the clear', count(race.b, 'p_01'), 0);
        same('the held row is the count, with nothing on the cloud\'s side',
            race.a.Sync.heldRecords().map(row => [row.path, row.mine,
                row.cloud === undefined ? null : row.cloud, row.heard]), [[PATH, 4, null, true]]);
        if (index === 0) {
            vm.runInContext(SETTINGS, race.a.ctx, { filename: 'js/ui/settings.js' });
            race.a.ctx.askConfirm = () => Promise.resolve(true);
            const row = race.a.Sync.heldRecords()[0];
            const said = row ? race.a.call('describeHeldRecord', row, race.a.State.schedule) : {};
            same('the row offers the other phone\'s clear as a side to take',
                [said.mine, said.cloud, said.decidable, said.takeable],
                ['4', race.a.global('HELD_NOTHING'), true, true]);
            const took = row ? await race.a.call('resolveHeldRecord', row, true) : false;
            check('taking it commits', took === true, String(took));
            await settleUntil(() => race.a.Sync.heldRecords().length === 0
                && race.a.Sync.pendingCount() === 0, 4000);
            same('and then this phone, the other phone and the cloud all hold the clear',
                [count(race.a, 'p_01'), count(race.b, 'p_01'), has(cloudDay(race.cloud).rima, 'p_01'),
                    race.a.Sync.holdingContested(), race.a.Sync.status], [0, 0, false, false, 'synced']);
        }
        done(race);

        const control = await evening(`wc${index}`, order, {
            before: async (a, b) => {
                work(a, DAY, 'w_01', 'p_01');
                await settleUntil(() => Boolean(((b.State.schedule.days[DAY] || {}).actual || {}).w_01));
            },
            offline: a => work(a, DAY, 'w_01', 'p_02'),
            online: b => b.State.commit(b.call('clearWorkerDay', b.State.schedule, DAY, 'w_01', 'actual')),
            landed: cloud => JSON.stringify((((cloudDay(cloud).actual || {}).w_01) || {}).entries) === '[]'
        });
        given('both phones began at one record, and the other phone\'s clear of the worker-day landed',
            control.ready, control.missed);
        check('the worker-day race beside it is held, as it always was',
            control.a.Sync.holdingContested() === true, control.a.Sync.status);
        done(control);

        suite(`a count moved to another site while this phone corrected the old one (${order})`);
        const moved = await evening(`mv${index}`, order, {
            before: seenThree,
            offline: a => rima(a, DAY, 'p_01', 4),
            online: b => { rima(b, DAY, 'p_01', 0); rima(b, DAY, 'p_02', 3); },
            landed: cloud => (cloudDay(cloud).rima || {}).p_02 === 3 && !has(cloudDay(cloud).rima, 'p_01')
        });
        given('both phones began at one record, and the other phone\'s move landed', moved.ready, moved.missed);
        check('the correction of the old site is held', moved.a.Sync.holdingContested() === true,
            moved.a.Sync.status);
        same('the cloud holds the move and only the move', counts(moved.cloud), [['p_02', 3]]);
        same('so the other phone\'s Rima table counts three men, not seven',
            moved.b.call('rimaReport', moved.b.State.schedule, '2026-10-01', '2026-10-31').total, 3);
        same('and the held row is the old site\'s', moved.a.Sync.heldRecords().map(row => row.path), [PATH]);

        // THE PHONE HOLDING THE CORRECTION bills what its own copy says: its 4 at the old
        // site and the 3 the snapshot put at the new one. A hold names one path, and a move
        // is two, so the row in ⋯ said «4 against nothing» and nothing of the 3 now at Tel
        // Aviv - keeping it, unwarned, billed the same men at both sites on every phone. The
        // day's other sites are drawn under the row now, on both sides, in its own words, so
        // what this phone bills while it waits is the row the person is asked about.
        const billedHere = moved.a.call('invoiceByDate', moved.a.State.schedule, '2026-10-01', '2026-10-31');
        same('while it is held, this phone bills its own 4 and the moved 3',
            [billedHere.countAt('p_01', DAY), billedHere.countAt('p_02', DAY), billedHere.total,
                moved.a.call('rimaReport', moved.a.State.schedule, '2026-10-01', '2026-10-31').total], [4, 3, 7, 7]);
        vm.runInContext(SETTINGS, moved.a.ctx, { filename: 'js/ui/settings.js' });
        moved.a.ctx.askConfirm = () => Promise.resolve(true);
        const [MINE, CLOUD, NOTHING] = ['HELD_MINE', 'HELD_CLOUD', 'HELD_NOTHING'].map(name => moved.a.global(name));
        const { box, document } = panelDocument();
        moved.a.ctx.document = document;
        moved.a.call('renderHeldRecords');
        const drawn = heldCards(box);
        same('the row in ⋯ is the old site, mine against nothing',
            drawn.map(card => [bareText(card.title), card.sides]),
            [['יום חמישי 15/10 · רימא · הרצליה', [`${MINE} 4`, `${CLOUD} ${NOTHING}`]]]);
        same('and under it the site the count went to, on both sides',
            drawn.map(card => card.context.map(lines => [bareText(lines[0]), ...lines.slice(1)])),
            [[['יום חמישי 15/10 · רימא · תל אביב', `${MINE} 3`, `${CLOUD} 3`]]]);
        // Decided by pressing the drawn button, as the person does.
        const take = index === 1;
        const label = moved.a.global(take ? 'HELD_TAKE' : 'HELD_KEEP');
        const press = drawn.length ? drawn[0].buttons.find(node => node.textContent === label) : null;
        check(take ? 'the row offers to take the cloud\'s side' : 'the row offers to keep this phone\'s side',
            Boolean(press), JSON.stringify(drawn.length ? drawn[0].buttons.map(node => node.textContent) : []));
        if (press) press.press();
        await settleUntil(() => moved.a.Sync.heldRecords().length === 0 && moved.a.Sync.pendingCount() === 0
            && moved.a.Sync.status === 'synced' && moved.b.call('rimaReport', moved.b.State.schedule,
                '2026-10-01', '2026-10-31').total === (take ? 3 : 7), 4000);
        same(take ? 'taken: three men, once, at the new site, on both phones'
            : 'kept, the person having seen both sites: both counts stand, on both phones',
        [counts(moved.cloud), [moved.a, moved.b].map(device =>
            device.call('rimaReport', device.State.schedule, '2026-10-01', '2026-10-31').total), moved.a.Sync.status],
        [take ? [['p_02', 3]] : [['p_01', 4], ['p_02', 3]], take ? [3, 3] : [7, 7], 'synced']);
        done(moved);

        suite(`no hold where nobody else touched what this phone wrote (${order})`);
        const fresh = await evening(`nf${index}a`, order, {
            offline: a => rima(a, DAY, 'p_01', 3)
        });
        given('both phones began at one record', fresh.ready, fresh.missed);
        same('a new count recorded offline goes up',
            [counts(fresh.cloud), fresh.a.Sync.status, fresh.a.Sync.heldRecords().length],
            [[['p_01', 3]], 'synced', 0]);
        done(fresh);

        const later = await evening(`nf${index}b`, order, {
            before: async (a, b, cloud, need) => {
                await seenThree(a, b, cloud, need);
                rima(b, DAY, 'p_01', 0);
                await settleUntil(() => count(a, 'p_01') === 0 && !has(cloudDay(cloud).rima, 'p_01'));
                need('this phone heard the clear before it lost signal',
                    count(a, 'p_01') === 0 && !has(cloudDay(cloud).rima, 'p_01'), String(count(a, 'p_01')));
            },
            offline: a => rima(a, DAY, 'p_01', 5)
        });
        given('both phones began at one record, after this phone heard the clear', later.ready, later.missed);
        same('a count set after this phone heard the clear goes up',
            [counts(later.cloud), later.a.Sync.status, later.a.Sync.heldRecords().length],
            [[['p_01', 5]], 'synced', 0]);
        done(later);

        const two = await evening(`nf${index}c`, order, {
            offline: a => rima(a, DAY, 'p_01', 3),
            online: b => rima(b, DAY, 'p_02', 2),
            landed: cloud => (cloudDay(cloud).rima || {}).p_02 === 2
        });
        given('both phones began at one record, and the other phone\'s count for its own site landed',
            two.ready, two.missed);
        same('two sites typed on two phones the same evening are both kept',
            [counts(two.cloud), two.a.Sync.status, two.a.Sync.heldRecords().length],
            [[['p_01', 3], ['p_02', 2]], 'synced', 0]);
        done(two);

        const own = await evening(`nf${index}d`, order, {
            before: seenThree,
            offline: a => rima(a, DAY, 'p_01', 0)
        });
        given('both phones began at one record', own.ready, own.missed);
        same('this phone\'s own clear, made offline, goes up',
            [has(cloudDay(own.cloud).rima, 'p_01'), own.a.Sync.status, own.a.Sync.heldRecords().length],
            [false, 'synced', 0]);
        done(own);

        const both = await evening(`nf${index}e`, order, {
            before: seenThree,
            offline: a => rima(a, DAY, 'p_01', 0),
            online: b => rima(b, DAY, 'p_01', 0),
            landed: cloud => !has(cloudDay(cloud).rima, 'p_01')
        });
        given('both phones began at one record, and the other phone\'s clear landed', both.ready, both.missed);
        same('both phones clearing the same count is one fact, not a conflict',
            [has(cloudDay(both.cloud).rima, 'p_01'), both.a.Sync.status, both.a.Sync.heldRecords().length],
            [false, 'synced', 0]);
        done(both);
    }
}

// ---------------------------------------------------------------- a count whose own answer went missing
//
// The suites above reach the clear only after this phone HEARD its own count come back:
// both revisions equal before the signal goes. A write can land and its answer be lost
// - the receipt exists for exactly that - or be answered while the snapshot carrying it
// is still on its way, the signal dropping in between. In both the phone kept reading
// the nothing its first count was built on, and the snapshot from before it, as the
// nothing it had seen; the other phone's clear is that same nothing, so the correction,
// or the count itself sent again beside a later edit, went over the clear or the move,
// and both phones said synced. A worker-day is held on every one of these roads: its
// clear leaves a value. See TRY_MARK in js/sync/sync.js.
{
    const DAY = '2026-10-15';
    const PATH = `days.${DAY}.rima.p_01`;
    const has = (map, key) => Object.prototype.hasOwnProperty.call(map || {}, key);
    const count = (device, placeId) => device.call('rimaCount', device.State.schedule, DAY, placeId);
    const cloudDay = cloud => ((((cloud.doc || {}).days || {})[DAY]) || {});
    const counts = cloud => Object.keys(cloudDay(cloud).rima || {}).sort()
        .map(placeId => [placeId, cloudDay(cloud).rima[placeId]]);
    const billed = device => {
        const invoice = device.call('invoiceByDate', device.State.schedule, '2026-10-01', '2026-10-31');
        return [invoice.countAt('p_01', DAY), invoice.countAt('p_02', DAY), invoice.total,
            device.call('rimaReport', device.State.schedule, '2026-10-01', '2026-10-31').total];
    };

    // A radio that can also lose one answer - the update lands, and the phone is told the
    // network failed - and can withhold the snapshots while the line is up.
    function radio2(cloud) {
        const air = { down: false, mute: false, refuse: false, waiting: null, loseFor: null,
            lost: 0, adapter: {} };
        // Down, the request never leaves and the phone is told so (`unsent`) - where the
        // production adapter says it: update and save. A lost answer, or a refusal the phone
        // cannot place, is the same word with no such proof.
        const offline = unsent => Object.assign(new Error('client is offline'),
            unsent ? { code: 'unavailable', unsent: true } : { code: 'unavailable' });
        Object.keys(cloud.adapter).forEach(name => {
            if (name === 'subscribe') return;
            air.adapter[name] = (...args) => {
                if (air.down) return Promise.reject(offline(name === 'update' || name === 'save'));
                if (name === 'update' && air.refuse && has(args[0], air.loseFor)) {
                    air.refuse = false;
                    air.loseFor = null;
                    air.lost += 1;
                    return Promise.reject(offline());
                }
                const answer = cloud.adapter[name](...args);
                if (name === 'update' && air.loseFor && has(args[0], air.loseFor)) {
                    air.loseFor = null;
                    return Promise.resolve(answer).then(() => { air.lost += 1; throw offline(); });
                }
                return answer;
            };
        });
        air.adapter.subscribe = (onNext, onError) => cloud.adapter.subscribe(snapshot => {
            if (air.down || air.mute) air.waiting = [onNext, snapshot];
            else onNext(snapshot);
        }, onError);
        air.up = () => {
            air.down = false;
            air.mute = false;
            const waiting = air.waiting;
            air.waiting = null;
            if (waiting) waiting[0](waiting[1]);
        };
        return air;
    }

    const TRIGGERS = ['its answer was lost, its echo heard', 'its answer was lost, its echo never came',
        'it was answered, its echo never came'];
    // The ordinary road, for the suites that need the first count heard before anything else.
    const HEARD = 'it was answered and its echo heard';
    const RETURNS = ['the snapshot arrives before the flush', 'reopened with signal, the snapshot first',
        'the flush leaves before the snapshot arrives'];

    // A records 3 at Herzliya the way `trigger` says, loses signal, and does `offline`; B,
    // online, does `online`; A comes back the way `order` says.
    async function lostEvening(tag, trigger, order, steps) {
        const missed = [];
        const need = (what, ok, detail) => { if (!ok) missed.push(`${tag}: ${what} - ${detail}`); };
        const cloud = makeCloud();
        const air = radio2(cloud);
        let a = phone(`d_${tag}_a`);
        const b = phone(`d_${tag}_b`);
        a.Sync.connect(air.adapter);
        await settle(TICK * 10);
        b.Sync.connect(cloud.adapter);
        await settle(TICK * 10);
        await settleUntil(() => a.Sync.pendingCount() === 0 && b.Sync.pendingCount() === 0
            && a.Sync._revision === cloud.doc.revision && b.Sync._revision === cloud.doc.revision);
        need('both phones start from one record at one revision',
            a.Sync._revision === cloud.doc.revision && b.Sync._revision === cloud.doc.revision,
            JSON.stringify([a.Sync._revision, b.Sync._revision, cloud.doc.revision]));
        const lose = trigger === TRIGGERS[0] || trigger === TRIGGERS[1];
        if (lose) air.loseFor = PATH;
        if (trigger === TRIGGERS[1] || trigger === TRIGGERS[2]) air.mute = true;
        if (steps.refuse) air.refuse = true;
        // `first`, when given, is what this phone records for that first attempt instead of
        // the one count, and `heard` is what the other phone then has to show.
        if (steps.first) steps.first(a);
        else rima(a, DAY, 'p_01', 3);
        const heardIt = () => (steps.heard ? steps.heard(b) : count(b, 'p_01') === 3);
        if (steps.refuse) {
            await settleUntil(() => air.lost === 1);
            need('the first attempt was refused before it landed', air.lost === 1 && !has(cloudDay(cloud).rima, 'p_01'),
                JSON.stringify(counts(cloud)));
        } else {
            await settleUntil(() => heardIt()
                && (lose ? air.lost === 1 : a.Sync.pendingCount() === 0));
            need('the count landed and the other phone heard it', heardIt(), String(count(b, 'p_01')));
            need(lose ? 'and this phone was told it failed' : 'and this phone was answered',
                lose ? air.lost === 1 && a.Sync.pendingCount() > 0 : a.Sync.pendingCount() === 0,
                JSON.stringify([air.lost, a.Sync.pendingCount()]));
            if (trigger === TRIGGERS[0] || trigger === HEARD) {
                await settleUntil(() => a.Sync.baseValueAt(PATH) === 3);
                need('and heard its own echo', a.Sync.baseValueAt(PATH) === 3, String(a.Sync.baseValueAt(PATH)));
            } else {
                need('and has not heard its echo', air.waiting !== null
                    && a.Sync._revision < cloud.doc.revision,
                    JSON.stringify([a.Sync._revision, cloud.doc.revision]));
            }
        }
        await settle(TICK * 5);
        air.down = true;
        if (steps.online) {
            steps.online(b);
            await settleUntil(() => steps.landed(cloud) && b.Sync.pendingCount() === 0);
            need('the other phone\'s edit landed', steps.landed(cloud), JSON.stringify(cloudDay(cloud)));
        }
        steps.offline(a);
        await settle(TICK * 10);
        if (steps.later) await steps.later(a);
        if (order === RETURNS[0]) {
            air.up();
        } else if (order === RETURNS[1]) {
            const disk = a.dump();
            a.Sync.stopListening(); a.Sync.disconnect();
            a = reopen(a.id, disk);
            a.Sync.connect(cloud.adapter);
        } else {
            air.down = false;
            air.mute = true;
            a.Sync._retryAt = 0;
            a.Sync.flush();
            await settle(TICK * 30);
            if (!steps.keepMuted) air.up();
        }
        await settleUntil(() => (a.Sync.pendingCount() === 0 && a.Sync.status === 'synced')
            || a.Sync.holdingContested(), 6000);
        await settle(TICK * 30);
        return { cloud, a, b, air, ready: missed.length === 0, missed: missed.join(' | ') };
    }
    const done = ({ a, b }) => {
        a.Sync.stopListening(); a.Sync.disconnect();
        b.Sync.stopListening(); b.Sync.disconnect();
    };
    const clear = { online: b => rima(b, DAY, 'p_01', 0), landed: cloud => !has(cloudDay(cloud).rima, 'p_01') };
    const move = {
        online: b => { rima(b, DAY, 'p_01', 0); rima(b, DAY, 'p_02', 3); },
        landed: cloud => (cloudDay(cloud).rima || {}).p_02 === 3 && !has(cloudDay(cloud).rima, 'p_01')
    };

    for (const [t, trigger] of TRIGGERS.entries()) {
        for (const [o, order] of RETURNS.entries()) {
            suite(`a count whose first write ${trigger}, corrected offline over the other phone's clear: held (${order})`);
            const race = await lostEvening(`la${t}${o}`, trigger, order,
                Object.assign({ offline: a => rima(a, DAY, 'p_01', 4) }, clear));
            given('the count landed, the other phone cleared it while this one was away', race.ready, race.missed);
            check('this phone\'s 4 is held for a person, not sent over the clear',
                race.a.Sync.holdingContested() === true, race.a.Sync.status);
            same('the cloud stays cleared, and the other phone with it',
                [has(cloudDay(race.cloud).rima, 'p_01'), count(race.b, 'p_01'), race.b.Sync.status],
                [false, 0, 'synced']);
            same('the held row is the count, mine against nothing',
                race.a.Sync.heldRecords().map(row => [row.path, row.mine,
                    row.cloud === undefined ? null : row.cloud]), [[PATH, 4, null]]);
            done(race);

            suite(`a count whose first write ${trigger}, corrected offline while the other phone moved it: held (${order})`);
            const moved = await lostEvening(`lm${t}${o}`, trigger, order,
                Object.assign({ offline: a => rima(a, DAY, 'p_01', 4) }, move));
            given('the count landed, the other phone moved it while this one was away', moved.ready, moved.missed);
            check('the correction of the old site is held', moved.a.Sync.holdingContested() === true,
                moved.a.Sync.status);
            same('the cloud holds the move and only the move', counts(moved.cloud), [['p_02', 3]]);
            same('the other phone bills three men, once: the invoice and the Rima table',
                billed(moved.b), [0, 3, 3, 3]);
            done(moved);

            suite(`a count whose first write ${trigger}, then an unrelated day recorded offline (${order})`);
            const beside = await lostEvening(`lb${t}${o}`, trigger, order,
                Object.assign({ offline: a => work(a, '2026-10-16', 'w_02', 'p_03') }, clear));
            given('the count landed, the other phone cleared it while this one was away',
                beside.ready, beside.missed);
            check('the cleared count does not come back', !has(cloudDay(beside.cloud).rima, 'p_01'),
                JSON.stringify(cloudDay(beside.cloud).rima));
            same('on either phone', [count(beside.a, 'p_01'), count(beside.b, 'p_01')], [0, 0]);
            check('and the day recorded beside it reached the cloud', Boolean(((((beside.cloud.doc || {})
                .days || {})['2026-10-16'] || {}).actual || {}).w_02), JSON.stringify(beside.cloud.doc.days));
            done(beside);

            suite(`a count whose first write ${trigger}, then moved by the other phone, an unrelated day beside it (${order})`);
            const besideMove = await lostEvening(`lv${t}${o}`, trigger, order,
                Object.assign({ offline: a => work(a, '2026-10-16', 'w_02', 'p_03') }, move));
            given('the count landed, the other phone moved it while this one was away',
                besideMove.ready, besideMove.missed);
            same('the moved count is billed once, at the new site, on both phones',
                [counts(besideMove.cloud), billed(besideMove.a), billed(besideMove.b)],
                [[['p_02', 3]], [0, 3, 4, 3], [0, 3, 4, 3]]);
            done(besideMove);

            suite(`no hold where nobody touched the count whose first write ${trigger} (${order})`);
            const alone = await lostEvening(`ln${t}${o}`, trigger, order, { offline: a => rima(a, DAY, 'p_01', 4) });
            given('the count landed and this phone corrected it offline', alone.ready, alone.missed);
            same('the correction goes up and nothing is held',
                [counts(alone.cloud), alone.a.Sync.status, alone.a.Sync.heldRecords().length, count(alone.b, 'p_01')],
                [[['p_01', 4]], 'synced', 0, 4]);
            done(alone);
        }
    }

    // An attempt made with no signal at all never left the phone, and the adapter says so.
    // Written down as handed over anyway, it made every count of that batch a count that
    // "may already be on the server": correct one of them and the others were held at the
    // next signal, mine against nothing, over a cloud that had never seen any of them.
    for (const [o, order] of RETURNS.entries()) {
        suite(`counts typed with no signal at all, one of them corrected: nothing held (${order})`);
        const quiet = await lostEvening(`lq${o}`, HEARD, order, {
            online: b => work(b, '2026-10-16', 'w_01', 'p_03'),
            landed: cloud => Boolean(((((cloud.doc || {}).days || {})['2026-10-16'] || {}).actual || {}).w_01),
            offline: a => {
                rima(a, DAY, 'p_02', 2);
                rima(a, DAY, 'p_03', 1);
            },
            later: async a => {
                await settle(TICK * 20);
                rima(a, DAY, 'p_03', 6);
            }
        });
        given('both phones began at one record, and the other phone wrote while this one was away',
            quiet.ready, quiet.missed);
        same('every count goes up as typed, and nothing is held',
            [counts(quiet.cloud), quiet.a.Sync.status, quiet.a.Sync.heldRecords().length],
            [[['p_01', 3], ['p_02', 2], ['p_03', 6]], 'synced', 0]);
        done(quiet);
    }

    for (const [o, order] of RETURNS.entries()) {
        suite(`a first write refused before it landed, an unrelated day recorded beside it: both go (${order})`);
        const refused = await lostEvening(`lr${o}`, TRIGGERS[1], order,
            { refuse: true, offline: a => work(a, '2026-10-16', 'w_02', 'p_03') });
        given('the first attempt never reached the cloud', refused.ready, refused.missed);
        same('the count and the day both reach the cloud, and nothing is held',
            [counts(refused.cloud), Boolean(((((refused.cloud.doc || {}).days || {})['2026-10-16'] || {})
                .actual || {}).w_02), refused.a.Sync.status, refused.a.Sync.heldRecords().length],
            [[['p_01', 3]], true, 'synced', 0]);
        done(refused);

        suite(`a count typed and corrected before any signal goes up as the correction (${order})`);
        const twice = await lostEvening(`lt${o}`, TRIGGERS[1], order,
            { refuse: true, offline: a => { rima(a, DAY, 'p_01', 4); rima(a, DAY, 'p_01', 5); } });
        given('the first attempt never reached the cloud', twice.ready, twice.missed);
        same('the last count goes up and nothing is held',
            [counts(twice.cloud), twice.a.Sync.status, twice.a.Sync.heldRecords().length],
            [[['p_01', 5]], 'synced', 0]);
        done(twice);
    }

    for (const takeCloud of [false, true]) {
        suite(`a count held because its own answer was lost is decided in ⋯: ${takeCloud
            ? 'taking the cloud\'s clear' : 'keeping this phone\'s count'}, once`);
        const held = await lostEvening(`ld${takeCloud ? 't' : 'k'}`, TRIGGERS[1], RETURNS[0],
            Object.assign({ offline: a => rima(a, DAY, 'p_01', 4) }, clear));
        given('the count landed, the other phone cleared it while this one was away', held.ready, held.missed);
        given('and this phone holds its correction', held.a.Sync.holdingContested() === true, held.a.Sync.status);
        vm.runInContext(SETTINGS, held.a.ctx, { filename: 'js/ui/settings.js' });
        held.a.ctx.askConfirm = () => Promise.resolve(true);
        const row = held.a.Sync.heldRecords()[0];
        const decided = row ? await held.a.call('resolveHeldRecord', row, takeCloud) : false;
        check('the decision commits', decided === true, String(decided));
        await settleUntil(() => held.a.Sync.heldRecords().length === 0 && held.a.Sync.pendingCount() === 0
            && held.a.Sync.status === 'synced', 4000);
        await settle(TICK * 20);
        same('and it is not held again: both phones and the cloud agree, synced',
            [counts(held.cloud), count(held.a, 'p_01'), count(held.b, 'p_01'), held.a.Sync.status,
                held.a.Sync.heldRecords().length], takeCloud ? [[], 0, 0, 'synced', 0]
                : [[['p_01', 4]], 4, 4, 'synced', 0]);
        done(held);
    }

    // THE MIRROR OF A MOVE. This phone, offline, moves the count - Herzliya cleared, three at
    // Tel Aviv - while the other phone, online, corrects Herzliya to 4. The clear is held
    // (the 4 is not what it was built on); the new site's count was built on nothing and
    // found nothing, and went up on its own, so the cloud said 4 + 3 and the other phone
    // billed seven with nothing pending and nothing said, for as long as this phone's hold
    // stood. A day's counts are held together now: one held count holds the day's others
    // that are still owed, and each is decided in ⋯ with the day's other sites beside it.
    for (const [o, order] of RETURNS.entries()) {
        suite(`a count moved offline while the other phone corrected the old site: the day held together (${order})`);
        const mirror = await lostEvening(`mi${o}`, HEARD, order, {
            offline: a => { rima(a, DAY, 'p_01', 0); rima(a, DAY, 'p_02', 3); },
            online: b => rima(b, DAY, 'p_01', 4),
            landed: cloud => (cloudDay(cloud).rima || {}).p_01 === 4
        });
        given('the count was heard by both, and the other phone\'s correction landed', mirror.ready, mirror.missed);
        same('both halves of the move are held, the new site with the old',
            [mirror.a.Sync.holdingContested(), mirror.a.Sync.heldRecords().map(row => row.path)],
            [true, [PATH, `days.${DAY}.rima.p_02`]]);
        same('the cloud holds the correction and nothing of the move', counts(mirror.cloud), [['p_01', 4]]);
        same('so the other phone bills its four, once, and says so honestly',
            [billed(mirror.b), mirror.b.Sync.status], [[4, 0, 4, 4], 'synced']);
        vm.runInContext(SETTINGS, mirror.a.ctx, { filename: 'js/ui/settings.js' });
        mirror.a.ctx.askConfirm = () => Promise.resolve(true);
        const [MINE, CLOUD, NOTHING] = ['HELD_MINE', 'HELD_CLOUD', 'HELD_NOTHING'].map(name => mirror.a.global(name));
        const { box, document } = panelDocument();
        mirror.a.ctx.document = document;
        mirror.a.call('renderHeldRecords');
        same('each row in ⋯ shows the day\'s other site, both sides',
            heldCards(box).map(card => [bareText(card.title), card.sides,
                card.context.map(lines => [bareText(lines[0]), ...lines.slice(1)])]),
            [['יום חמישי 15/10 · רימא · הרצליה', [`${MINE} ${NOTHING}`, `${CLOUD} 4`],
                [['יום חמישי 15/10 · רימא · תל אביב', `${MINE} 3`, `${CLOUD} ${NOTHING}`]]],
            ['יום חמישי 15/10 · רימא · תל אביב', [`${MINE} 3`, `${CLOUD} ${NOTHING}`],
                [['יום חמישי 15/10 · רימא · הרצליה', `${MINE} ${NOTHING}`, `${CLOUD} 4`]]]]);
        // Decided one row at a time, as a person does: the first answer is not held again
        // for the second row still waiting on the same day.
        const take = o !== 1;
        for (const path of [PATH, `days.${DAY}.rima.p_02`]) {
            const row = mirror.a.Sync.heldRecords().find(item => item.path === path);
            const answered = row ? await mirror.a.call('resolveHeldRecord', row, take) : false;
            check(`${path.split('.').pop()}: ${take ? 'taking the cloud\'s side' : 'keeping this phone\'s side'} commits`,
                answered === true, String(answered));
            await settleUntil(() => mirror.a.Sync.pendingCount() === 0, 4000);
        }
        await settleUntil(() => mirror.a.Sync.heldRecords().length === 0 && mirror.a.Sync.status === 'synced'
            && billed(mirror.b)[2] === (take ? 4 : 3), 4000);
        same(take ? 'taken twice: the correction stands, on both phones'
            : 'kept twice: the move stands, on both phones',
        [counts(mirror.cloud), billed(mirror.a), billed(mirror.b), mirror.a.Sync.status],
        take ? [[['p_01', 4]], [4, 0, 4, 4], [4, 0, 4, 4], 'synced']
            : [[['p_02', 3]], [0, 3, 3, 3], [0, 3, 3, 3], 'synced']);
        done(mirror);
    }

    // ONE ATTEMPT, TWO DAYS. A flush carries a count for each of two days; it lands and its
    // answer is lost, so the pair is one attempt that may be on the server, to go out again
    // alone under its own name for the receipt to answer. A hold on one of the two days then
    // held that day's other owed counts with it (see rimaCompanions) - this attempt's own
    // count among them - AFTER the attempt had been judged whole and its counts asked as a
    // replay's, 'nothing' and all. It could no longer go out alone, so its other day's count
    // went out under a new name, its own nothing believed, straight over the other phone's
    // clear: the cleared count back in the cloud and on the other phone's invoice, both
    // phones saying synced, and nothing anywhere naming that day.
    {
        const DAY2 = '2026-10-14';
        const PATH2 = `days.${DAY2}.rima.p_03`;
        const count2 = device => device.call('rimaCount', device.State.schedule, DAY2, 'p_03');
        const cloudDay2 = cloud => ((((cloud.doc || {}).days || {})[DAY2]) || {});
        const first = a => { rima(a, DAY, 'p_01', 3); rima(a, DAY2, 'p_03', 2); };
        const heard = b => count(b, 'p_01') === 3 && count2(b) === 2;
        const VARIANTS = [
            ['records a site the other phone also recorded', {
                online: b => { rima(b, DAY2, 'p_03', 0); rima(b, DAY, 'p_03', 1); },
                landed: cloud => !has(cloudDay2(cloud).rima, 'p_03')
                    && (cloudDay(cloud).rima || {}).p_03 === 1,
                offline: a => rima(a, DAY, 'p_03', 5),
                stands: [['p_01', 3], ['p_03', 1]]
            }],
            ['records the site the other phone moved the first count to', {
                online: b => { rima(b, DAY2, 'p_03', 0); rima(b, DAY, 'p_01', 0); rima(b, DAY, 'p_02', 3); },
                landed: cloud => !has(cloudDay2(cloud).rima, 'p_03')
                    && (cloudDay(cloud).rima || {}).p_02 === 3 && !has(cloudDay(cloud).rima, 'p_01'),
                offline: a => rima(a, DAY, 'p_02', 1),
                stands: [['p_02', 3]]
            }]];
        for (const [v, [what, steps]] of VARIANTS.entries()) {
            for (const [t, trigger] of TRIGGERS.slice(0, 2).entries()) {
                for (const [o, order] of RETURNS.entries()) {
                    suite(`one attempt carrying two days' counts, ${trigger}; the other day cleared, and this phone ${what}: the clear stands (${order})`);
                    const split = await lostEvening(`sp${v}${t}${o}`, trigger, order,
                        Object.assign({ first, heard }, steps));
                    given('both counts landed in one attempt, and the other phone cleared one and wrote the other day',
                        split.ready, split.missed);
                    same('the other day\'s clear stands, in the cloud and on the other phone',
                        [has(cloudDay2(split.cloud).rima, 'p_03'), count2(split.b), split.b.Sync.status],
                        [false, 0, 'synced']);
                    check('and this phone holds that count for a person or shows it cleared - it is not sent',
                        split.a.Sync.heldRecords().some(row => row.path === PATH2) || count2(split.a) === 0,
                        JSON.stringify([count2(split.a), split.a.Sync.heldRecords().map(row => row.path)]));
                    same('the day the hold is on keeps the other phone\'s record', counts(split.cloud), steps.stands);
                    check('and this phone holds its own count there for a person', split.a.Sync.holdingContested() === true,
                        split.a.Sync.status);
                    same('nothing is held that the cloud already holds exactly as this phone does',
                        split.a.Sync.heldRecords().filter(row => (row.mine === undefined ? null : row.mine)
                            === (row.cloud === undefined ? null : row.cloud)).map(row => row.path), []);
                    done(split);
                }
            }
        }
    }

    // BOTH PHONES MOVE THE COUNT, TO THE SAME NEW SITE, with different numbers. The new site
    // is a real disagreement and is held. The old site's clear is the same nothing on both
    // phones and in the cloud - sending it changes nothing - yet it was held with the day as
    // a companion, drawn «אין רישום» against «אין רישום» with no button but keep, and after
    // the real row was decided the phone still said there was something to decide.
    for (const [o, order] of RETURNS.entries()) {
        suite(`both phones move the count to the same new site: only the new site is held, and deciding it ends the hold (${order})`);
        const both = await lostEvening(`bm${o}`, HEARD, order, {
            offline: a => { rima(a, DAY, 'p_01', 0); rima(a, DAY, 'p_02', 3); },
            online: b => { rima(b, DAY, 'p_01', 0); rima(b, DAY, 'p_02', 4); },
            landed: cloud => (cloudDay(cloud).rima || {}).p_02 === 4 && !has(cloudDay(cloud).rima, 'p_01')
        });
        given('the count was heard by both, and the other phone\'s move landed', both.ready, both.missed);
        same('the one site the phones disagree on is held, and nothing else',
            both.a.Sync.heldRecords().map(row => [row.path, row.mine, row.cloud === undefined ? null : row.cloud]),
            [[`days.${DAY}.rima.p_02`, 3, 4]]);
        vm.runInContext(SETTINGS, both.a.ctx, { filename: 'js/ui/settings.js' });
        both.a.ctx.askConfirm = () => Promise.resolve(true);
        const row = both.a.Sync.heldRecords().find(item => item.path === `days.${DAY}.rima.p_02`);
        const answered = row ? await both.a.call('resolveHeldRecord', row, o !== 1) : false;
        check('deciding it commits', answered === true, String(answered));
        await settleUntil(() => both.a.Sync.heldRecords().length === 0 && both.a.Sync.pendingCount() === 0
            && both.a.Sync.status === 'synced' && count(both.b, 'p_02') === (o !== 1 ? 4 : 3), 4000);
        same('and then nothing is left to decide: both phones agree, synced',
            [both.a.Sync.heldRecords().length, both.a.Sync.status, counts(both.cloud), count(both.a, 'p_02'),
                count(both.b, 'p_02')],
            [0, 'synced', [['p_02', o !== 1 ? 4 : 3]], o !== 1 ? 4 : 3, o !== 1 ? 4 : 3]);
        done(both);
    }

    // The same decision made before the snapshot that carries the clear has arrived: the
    // hold came from the server's refusal, and the base this phone holds is still from
    // before its own first write. The answer is given looking at the row, and the row is
    // what the person saw - kept, it goes, and is not held again over the same clear.
    suite('a count held by the server\'s refusal, kept in ⋯ before the snapshot arrives, goes once');
    const early = await lostEvening('lde', TRIGGERS[1], RETURNS[2],
        Object.assign({ offline: a => rima(a, DAY, 'p_01', 4), keepMuted: true }, clear));
    given('the count landed, the other phone cleared it while this one was away', early.ready, early.missed);
    given('and this phone holds its correction, the snapshot still on its way',
        early.a.Sync.holdingContested() === true && early.air.waiting !== null, early.a.Sync.status);
    vm.runInContext(SETTINGS, early.a.ctx, { filename: 'js/ui/settings.js' });
    const earlyRow = early.a.Sync.heldRecords()[0];
    const kept = earlyRow ? await early.a.call('resolveHeldRecord', earlyRow, false) : false;
    check('keeping this phone\'s count commits', kept === true, String(kept));
    await settleUntil(() => early.a.Sync.heldRecords().length === 0 && early.a.Sync.pendingCount() === 0, 4000);
    early.air.up();
    await settleUntil(() => early.a.Sync.status === 'synced' && count(early.b, 'p_01') === 4, 4000);
    same('and it goes up, held no more, on both phones',
        [counts(early.cloud), count(early.a, 'p_01'), count(early.b, 'p_01'), early.a.Sync.status,
            early.a.Sync.heldRecords().length], [[['p_01', 4]], 4, 4, 'synced', 0]);
    done(early);

    suite('a worker-day on every one of these roads is held, as it always was');
    for (const [t, trigger] of TRIGGERS.entries()) {
        const cloud = makeCloud();
        const air = radio2(cloud);
        const a = phone(`d_lw${t}_a`);
        const b = phone(`d_lw${t}_b`);
        a.Sync.connect(air.adapter);
        await settle(TICK * 10);
        b.Sync.connect(cloud.adapter);
        await settle(TICK * 10);
        await settleUntil(() => a.Sync._revision === cloud.doc.revision && b.Sync._revision === cloud.doc.revision);
        const wpath = `days.${DAY}.actual.w_01`;
        if (trigger !== TRIGGERS[2]) air.loseFor = wpath;
        if (trigger !== TRIGGERS[0]) air.mute = true;
        work(a, DAY, 'w_01', 'p_01');
        await settleUntil(() => Boolean(((b.State.schedule.days[DAY] || {}).actual || {}).w_01)
            && (trigger !== TRIGGERS[2] ? air.lost === 1 : a.Sync.pendingCount() === 0));
        await settle(TICK * 5);
        air.down = true;
        b.State.commit(b.call('clearWorkerDay', b.State.schedule, DAY, 'w_01', 'actual'));
        await settleUntil(() => b.Sync.pendingCount() === 0);
        work(a, DAY, 'w_01', 'p_02');
        air.up();
        await settleUntil(() => a.Sync.holdingContested() || (a.Sync.pendingCount() === 0
            && a.Sync.status === 'synced'), 6000);
        check(`${trigger}: the worker-day correction is held`, a.Sync.holdingContested() === true, a.Sync.status);
        a.Sync.stopListening(); a.Sync.disconnect();
        b.Sync.stopListening(); b.Sync.disconnect();
    }
}

// ---------------------------------------------------------------- a phone never told a revision
//
// A new install, a reinstall, storage the browser evicted: a phone that has never been told
// a revision sends its first write through the cutover (bootstrapCutover), which moves the
// document into the protocol and carries no business data at all. With no signal that
// attempt fails in the bootstrap, before the edit ever leaves - and the production adapter
// says nothing about it, `unsent` being withReceipt's word alone. The count's try mark was
// kept, so the count was one that "may already be on the server", and its correction was
// held at the next signal against a cloud that had never seen it: mine against nothing, the
// cloud and the other phone's invoice without it until somebody kept it in ⋯.
{
    suite('a phone never told a revision, with no signal from the start: a count typed and corrected goes up, nothing held');
    const DAY = '2026-10-15';
    const cloud = makeCloud();
    const b = phone('d_fresh_b');
    b.Sync.connect(cloud.adapter);
    await settle(TICK * 10);
    await settleUntil(() => cloud.doc && b.Sync._revision === cloud.doc.revision && b.Sync.pendingCount() === 0);
    rima(b, DAY, 'p_02', 2);
    await settleUntil(() => b.Sync.pendingCount() === 0);
    const air = radio(cloud);
    air.down = true;
    const a = phone('d_fresh_a');
    a.Sync.connect(air.adapter);
    await settle(TICK * 10);
    rima(a, DAY, 'p_01', 3);
    await settle(TICK * 20);
    rima(a, DAY, 'p_01', 4);
    await settle(TICK * 20);
    given('this phone was never told a revision, and its attempts went the cutover road',
        a.Sync._revision === null && air.calls.indexOf('bootstrap') !== -1 && air.calls.indexOf('update') === -1,
        JSON.stringify([a.Sync._revision, air.calls.slice(0, 6)]));
    air.up();
    a.Sync._retryAt = 0;
    a.Sync.flush();
    await settleUntil(() => (a.Sync.pendingCount() === 0 && a.Sync.status === 'synced')
        || a.Sync.holdingContested(), 6000);
    await settleUntil(() => b.call('rimaCount', b.State.schedule, DAY, 'p_01') === 4, 3000);
    same('the correction goes up and nothing is held',
        [Object.entries(cloudRima(cloud, DAY) || {}).sort(), a.Sync.status, a.Sync.heldRecords().length,
            b.call('rimaCount', b.State.schedule, DAY, 'p_01')],
        [[['p_01', 4], ['p_02', 2]], 'synced', 0, 4]);
    a.Sync.stopListening(); a.Sync.disconnect();
    b.Sync.stopListening(); b.Sync.disconnect();
}

// ---------------------------------------------------------------- the held row, drawn
//
// The suite above asks describeHeldRecord and resolveHeldRecord directly, which is how a
// held count drawn with no sides and no buttons passed it. The panel the person reads is
// renderHeldRecords, and it drew both sides and a decision only for a day and a vehicle;
// every other kind went down the branch that prints the row's note - empty for a count -
// so the hold could not be answered from the screen, and the field could not release it
// either: retyping the held number is no change at all.
for (const takeCloud of [false, true]) {
    suite(`a held count drawn in ⋯: both sides, both buttons, and ${takeCloud
        ? 'taking the cloud\'s' : 'keeping this phone\'s'} decides it`);

    const DAY = '2026-10-12';
    const PATH = `days.${DAY}.rima.p_01`;
    const count = device => device.call('rimaCount', device.State.schedule, DAY, 'p_01');
    // A phone that can write but cannot hear - see tests/held.test.mjs.
    const stairwell = cloud => {
        const gate = { open: true, waiting: [], adapter: {} };
        Object.keys(cloud.adapter).forEach(name => { gate.adapter[name] = (...args) => cloud.adapter[name](...args); });
        gate.adapter.subscribe = (onNext, onError) => cloud.adapter.subscribe(snapshot => {
            if (gate.open) onNext(snapshot); else gate.waiting.push([onNext, snapshot]);
        }, onError);
        gate.close = () => { gate.open = false; };
        gate.release = () => {
            gate.open = true;
            const waiting = gate.waiting.slice();
            gate.waiting = [];
            waiting.forEach(([onNext, snapshot]) => onNext(snapshot));
        };
        return gate;
    };
    const cloud = makeCloud();
    const a = phone(`d_pa${Number(takeCloud)}`);
    const b = phone(`d_pb${Number(takeCloud)}`);
    vm.runInContext(SETTINGS, b.ctx, { filename: 'js/ui/settings.js' });
    const gate = stairwell(cloud);
    a.Sync.connect(cloud.adapter);
    await settle(TICK * 10);
    b.Sync.connect(gate.adapter);
    await settle(TICK * 10);
    rima(a, DAY, 'p_01', 3);
    await settleUntil(() => (cloudRima(cloud, DAY) || {}).p_01 === 3 && b.Sync._revision === cloud.doc.revision);
    gate.close();
    rima(a, DAY, 'p_01', 4);
    await settleUntil(() => (cloudRima(cloud, DAY) || {}).p_01 === 4);
    rima(b, DAY, 'p_01', 5);
    b.Sync.flush();
    await settleUntil(() => b.Sync.status === 'contested');
    gate.release();
    await settleUntil(() => b.Sync._revision === cloud.doc.revision);
    await settle(TICK * 20);
    const rows = b.Sync.heldRecords();
    given('the second phone lost the race and holds its 5 against the cloud\'s 4',
        JSON.stringify(rows.map(row => [row.path, row.mine, row.cloud])) === JSON.stringify([[PATH, 5, 4]]),
        JSON.stringify(rows));

    // WHILE THE HOLD STANDS, the phone's own echoes are still its own. Its copy holds its
    // held 5 where the cloud holds 4, so the echo rule that compares the counts (F4) found
    // them different on every save and adopted each echo - two redraws a save, landing as
    // the person types the next site's count in the box the focus has just moved to.
    if (!takeCloud) {
        const redrawn = [];
        for (const [what, save] of [
            ['a count at another site', () => rima(b, '2026-10-13', 'p_02', 2)],
            ['a count on a third site', () => rima(b, '2026-10-13', 'p_03', 1)],
            ['a worker-day', () => work(b, '2026-10-13', 'w_01', 'p_01')]
        ]) {
            save();
            const before = b.renders.count;
            await settleUntil(() => b.Sync.pendingCount() === 0 && b.Sync._revision === cloud.doc.revision, 4000);
            await settle(TICK * 20);
            redrawn.push([what, b.Sync._revision === cloud.doc.revision, b.renders.count - before]);
        }
        same('each of its own saves lands and is heard as its own echo, redrawing nothing',
            redrawn, [['a count at another site', true, 0], ['a count on a third site', true, 0],
                ['a worker-day', true, 0]]);
        same('and the hold is exactly where it was',
            [b.Sync.heldRecords().map(row => [row.path, row.mine, row.cloud]), count(b), b.Sync.status],
            [[[PATH, 5, 4]], 5, 'contested']);

        // AND NO WIDER THAN WHAT THIS COPY SHOWS. Looking away from a count the queue owes is
        // right only while this copy shows it: adopting would lay the same value straight
        // back. A copy that has LOST it - an older build's window writing the shared disk,
        // the price of F1 - was looked away from all the same, and the first snapshot under
        // this phone's own stamps was skipped as its echo: the held count off the screen and
        // out of the Rima table, until somebody decided it or the other phone wrote. And only
        // that site on that day: a lost count beside it, or at the same site on another day,
        // comes back as it always did.
        rima(b, DAY, 'p_02', 2);
        rima(b, '2026-10-14', 'p_01', 6);
        await settleUntil(() => (cloudRima(cloud, DAY) || {}).p_02 === 2
            && (cloudRima(cloud, '2026-10-14') || {}).p_01 === 6 && b.Sync._revision === cloud.doc.revision, 4000);
        await settle(TICK * 20);
        given('this phone wrote last, its own stamps on the cloud\'s copy, the hold still standing',
            cloud.doc.updatedBy === b.id && cloud.doc.updatedAt === b.State.schedule.updatedAt
                && b.Sync.heldRecords().length === 1, JSON.stringify([cloud.doc.updatedBy, b.Sync.heldRecords().length]));
        for (const [what, date, site, want] of [['the held count itself', DAY, 'p_01', 5],
            ['another site on the held day', DAY, 'p_02', 2], ['the held site on another day', '2026-10-14', 'p_01', 6]]) {
            const disk = b.dump();
            const record = JSON.parse(disk['scheduleData:v2']);
            delete record.days[date].rima[site];
            const lost = reopen(b.id, Object.assign({}, disk, { 'scheduleData:v2': JSON.stringify(record) }));
            given(`${what}: opened again, this copy has lost it`,
                lost.call('rimaCount', lost.State.schedule, date, site) === 0, JSON.stringify(lost.State.schedule.days[date]));
            lost.Sync.connect(cloud.adapter);
            await settleUntil(() => lost.call('rimaCount', lost.State.schedule, date, site) === want, 3000);
            await settle(TICK * 20);
            same(`${what}: back on the screen at the first snapshot, the hold where it was`,
                [lost.call('rimaCount', lost.State.schedule, date, site), lost.Sync.status,
                    lost.Sync.heldRecords().map(row => [row.path, row.mine, row.cloud])],
                [want, 'contested', [[PATH, 5, 4]]]);
            lost.Sync.stopListening(); lost.Sync.disconnect();
        }
    }

    const [KEEP, TAKE, MINE, CLOUD] = ['HELD_KEEP', 'HELD_TAKE', 'HELD_MINE', 'HELD_CLOUD'].map(name => b.global(name));
    const said = b.call('describeHeldRecord', rows[0], b.State.schedule);
    const { box, document } = panelDocument();
    b.ctx.document = document;
    b.call('renderHeldRecords');
    const card = heldCards(box).find(item => item.title === said.title);
    check('the row is drawn under its title', Boolean(card) && box.hidden === false,
        JSON.stringify(heldCards(box).map(item => item.title)));
    same('with both sides, each the number it says', card ? card.sides : null, [`${MINE} 5`, `${CLOUD} 4`]);
    same('and both decisions', card ? card.buttons.map(node => node.textContent) : null, [KEEP, TAKE]);

    const wrote = [];
    const writer = b.ctx.setRimaCount;
    given('the Rima writer can be watched', typeof writer === 'function');
    b.ctx.setRimaCount = (schedule, date, placeId, value) => {
        wrote.push([date, placeId, value]);
        return writer(schedule, date, placeId, value);
    };
    b.ctx.askConfirm = () => Promise.resolve(true);
    const press = card ? card.buttons.find(node => node.textContent === (takeCloud ? TAKE : KEEP)) : null;
    if (press) press.press();
    const want = takeCloud ? 4 : 5;
    await settleUntil(() => b.Sync.heldRecords().length === 0 && b.Sync.pendingCount() === 0
        && (cloudRima(cloud, DAY) || {}).p_01 === want && count(a) === want, 8000);
    same('the button wrote the count through the Rima writer, once', wrote, [[DAY, 'p_01', want]]);
    same(`this phone, the other phone and the cloud all say ${want}`,
        [count(b), count(a), (cloudRima(cloud, DAY) || {}).p_01], [want, want, want]);
    same('nothing is held and the line says synced',
        [b.Sync.holdingContested(), b.Sync.heldRecords().length, b.Sync.status], [false, 0, 'synced']);
    b.call('renderHeldRecords');
    check('and the panel has nothing left to show', box.hidden === true && heldCards(box).length === 0,
        JSON.stringify(heldCards(box).map(item => item.title)));

    b.Sync.stopListening(); b.Sync.disconnect();
    const again = reopen(b.id, b.dump());
    same('opened again with no signal, it is still decided',
        [again.Sync.heldRecords().length, again.Sync.holdingContested(), count(again)], [0, false, want]);
    again.Sync.connect(cloud.adapter);
    await settleUntil(() => again.Sync.status === 'synced' && again.Sync._revision === cloud.doc.revision, 4000);
    await settle(TICK * 20);
    same('and with signal back it stays decided',
        [again.Sync.heldRecords().length, again.Sync.status, count(again), (cloudRima(cloud, DAY) || {}).p_01],
        [0, 'synced', want, want]);
    again.Sync.stopListening(); again.Sync.disconnect();
    a.Sync.stopListening(); a.Sync.disconnect();
}

// ---------------------------------------------------------------- the phones not yet updated
//
// v165 is the build on the owner's phones, and v145 the one before it. Neither knows `rima`.
// Each is run here on its own bytes out of Git, beside this build, on one cloud.
const git = args => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
const OLDER = [
    ['v145', 'a71e8e7dc84042263391fad12ec374c316dbc8ea'],
    ['v165', 'e34fb66e4beb19804f631257e0b29d4d9e32eda3']
];

for (const [name, sha] of OLDER) {
    suite(`${name}, adopting a document with Rima on it, does not take it off the cloud`);

    let present = false;
    try { present = git(['cat-file', '-t', sha]).toString().trim() === 'commit'; } catch (error) { present = false; }
    given(`the ${name} commit is in this repository`, present, sha);
    const files = olderOrder().filter(file => {
        try { git(['cat-file', '-e', `${sha}:${file}`]); return true; } catch (error) { return false; }
    });
    given(`${name} has every file this build loads that it had`, files.length === olderOrder().length,
        `${files.length} of ${olderOrder().length}`);
    const sources = files.map(file => ({ file, code: git(['show', `${sha}:${file}`]).toString('utf8') }));
    const stamp = (/const APP_VERSION = '([^']+)'/.exec(git(['show', `${sha}:js/app.js`]).toString('utf8')) || [])[1];
    given(`the older build names itself ${name}`, stamp === name, String(stamp));
    check(`${name} really does not know the layer`, !sources.some(source => /\brima\b/i.test(source.code)));

    const cloud = makeCloud();
    const now = phone(`d_now_${name}`);
    now.State.schedule.workers.push({ id: 'w_typo', name: 'שם בטעות', active: true, dailyRate: 0, hourlyRate: 0 });
    now.State.commitRoster();
    now.Sync.connect(cloud.adapter);
    await settle(TICK * 10);
    work(now, '2026-10-12', 'w_01', 'p_01');
    rima(now, '2026-10-12', 'p_01', 3);
    rima(now, '2026-10-13', 'p_02', 5);
    // An empty placeholder for the accidental name on the Rima-only day - the one thing an
    // older build is allowed to remove from a day.
    now.State.commit(now.call('clearWorkerDay', now.State.schedule, '2026-10-13', 'w_typo', 'actual'));
    await settleUntil(() => (cloudRima(cloud, '2026-10-13') || {}).p_02 === 5
        && Boolean((((cloud.doc.days || {})['2026-10-13'] || {}).actual || {}).w_typo));
    given('the cloud holds both counts and the placeholder', JSON.stringify([cloudRima(cloud, '2026-10-12'),
        cloudRima(cloud, '2026-10-13')]) === JSON.stringify([{ p_01: 3 }, { p_02: 5 }]),
    JSON.stringify(cloud.doc.days));

    const old = makeDevice({ sources, appVersion: stamp, deviceId: `d_${name}` });
    old.Sync.pushDelayMs = TICK;
    old.setToday('2026-10-20');
    old.ctx.askTell = () => Promise.resolve();
    old.ctx.askText = async question => question.placeholder;
    old.Sync.connect(cloud.adapter);
    await settleUntil(() => old.State.schedule.workers.length === 3 && old.Sync.status === 'synced', 8000);
    same(`${name} adopted the document and says synced`, old.Sync.status, 'synced');
    same(`${name} is not held over a layer it has never heard of`, old.call('farkadWritesBlocked'), false);
    check(`${name} does not keep the count in its own copy - the documented gap`,
        old.State.schedule.days['2026-10-12'].rima === undefined);

    // An ordinary evening on the older phone: work on both days, one of them Rima-only.
    old.State.commit(old.call('assignPlace', old.State.schedule, '2026-10-12', 'w_02', 'actual', 'p_01'));
    old.State.commit(old.call('assignPlace', old.State.schedule, '2026-10-13', 'w_01', 'actual', 'p_02'));
    await settleUntil(() => Boolean(((cloud.doc.days['2026-10-13'] || {}).actual || {}).w_01));
    given(`${name}'s edits landed`, Boolean(cloud.doc.days['2026-10-13'].actual.w_01)
        && Boolean(cloud.doc.days['2026-10-12'].actual.w_02));
    same(`after ${name}'s edits the cloud still holds both counts`,
        [cloudRima(cloud, '2026-10-12'), cloudRima(cloud, '2026-10-13')], [{ p_01: 3 }, { p_02: 5 }]);

    // And the deletion of an unused name, which removes its empty placeholder from the
    // Rima-only day in the same transaction.
    given(`${name} may delete the accidental name`, old.call('deletionBlockers', 'w_typo').length === 0,
        JSON.stringify(old.call('deletionBlockers', 'w_typo')));
    await old.call('deleteWorker', 'w_typo');
    await settleUntil(() => !Object.prototype.hasOwnProperty.call(cloud.doc.days['2026-10-13'].actual, 'w_typo'));
    check(`${name}'s deletion took the placeholder off the cloud`,
        !Object.prototype.hasOwnProperty.call(cloud.doc.days['2026-10-13'].actual, 'w_typo'));
    same('and left the Rima count on that day where it was', cloudRima(cloud, '2026-10-13'), { p_02: 5 });

    await settleUntil(() => Boolean(((now.State.schedule.days['2026-10-13'] || {}).actual || {}).w_01)
        && !now.State.worker('w_typo'));
    same(`this build, after adopting ${name}'s writes, still has both counts`,
        [now.call('rimaCount', now.State.schedule, '2026-10-12', 'p_01'),
            now.call('rimaCount', now.State.schedule, '2026-10-13', 'p_02')], [3, 5]);
    same('and every phone is writing', [now.call('farkadWritesBlocked'), old.call('farkadWritesBlocked')], [false, false]);

    suite(`${name}, handed this build's record to restore, refuses it out loud`);
    const offered = old.call('readReplacementDocument', JSON.parse(JSON.stringify(now.call('cloudDocument', now.State.schedule))));
    check(`${name} does not restore a v166 record without its counts - it refuses it`,
        offered.document === null && offered.problems.some(problem => problem.includes('rima')),
        JSON.stringify(offered.problems));

    now.Sync.stopListening(); now.Sync.disconnect();
    old.Sync.stopListening(); old.Sync.disconnect();
}

// ---------------------------------------------------------------- the phone that updates
//
// The rollout itself. The father's phone wrote last on the older build - an ordinary day of
// its own, which makes it the document's last writer - and that build's copy has no `rima`.
// The next morning the same phone opens this build on the same disk, and the first snapshot
// carries exactly the stamps its own copy carries. Read as its own echo it was skipped: no
// count on the screen while the line said synced, and the day's cloud copy - the restore
// point every phone can go back to - written without them, until somebody else wrote.
for (const [name, sha] of OLDER) {
    suite(`a phone that wrote last on ${name}, opened on this build, shows the cloud's count at once`);

    const files = olderOrder().filter(file => {
        try { git(['cat-file', '-e', `${sha}:${file}`]); return true; } catch (error) { return false; }
    });
    given(`${name} has every file this build loads that it had`, files.length === olderOrder().length,
        `${files.length} of ${olderOrder().length}`);
    const sources = files.map(file => ({ file, code: git(['show', `${sha}:${file}`]).toString('utf8') }));
    const stamp = (/const APP_VERSION = '([^']+)'/.exec(git(['show', `${sha}:js/app.js`]).toString('utf8')) || [])[1];
    given(`the older build is ${name} and does not know the layer`,
        stamp === name && !sources.some(source => /\brima\b/i.test(source.code)), String(stamp));

    const cloud = makeCloud();
    const owner = phone(`d_owner_${name}`);
    owner.Sync.connect(cloud.adapter);
    await settle(TICK * 10);
    const father = makeDevice({ sources, appVersion: stamp, deviceId: `d_father_${name}` });
    father.Sync.pushDelayMs = TICK;
    father.setToday('2026-10-20');
    father.ctx.askTell = () => Promise.resolve();
    father.ctx.askText = async question => question.placeholder;
    father.Sync.connect(cloud.adapter);
    await settleUntil(() => father.State.schedule.workers.length === 2 && father.Sync.status === 'synced', 8000);

    rima(owner, '2026-10-12', 'p_01', 3);
    await settleUntil(() => (cloudRima(cloud, '2026-10-12') || {}).p_01 === 3
        && father.Sync._revision === cloud.doc.revision, 8000);
    father.State.commit(father.call('assignPlace', father.State.schedule, '2026-10-13', 'w_01', 'actual', 'p_02'));
    await settleUntil(() => Boolean(((cloud.doc.days['2026-10-13'] || {}).actual || {}).w_01)
        && father.Sync.pendingCount() === 0 && father.Sync.status === 'synced', 8000);
    await settle(TICK * 20);
    const disk = JSON.parse(father.raw('scheduleData:v2'));
    given(`${name} wrote last, under the stamps its own copy carries, and that copy has no count`,
        cloud.doc.updatedBy === father.id && disk.updatedBy === father.id
            && disk.updatedAt === cloud.doc.updatedAt
            && (((disk.days || {})['2026-10-12']) || {}).rima === undefined
            && (cloudRima(cloud, '2026-10-12') || {}).p_01 === 3,
        JSON.stringify({ cloud: [cloud.doc.updatedBy, cloud.doc.updatedAt], disk: [disk.updatedBy, disk.updatedAt] }));
    father.Sync.stopListening(); father.Sync.disconnect();

    // The next morning: this build, the same disk, the same device id.
    const updated = reopen(father.id, father.dump(), { today: '2026-10-21' });
    const countNow = () => updated.call('rimaCount', updated.State.schedule, '2026-10-12', 'p_01');
    const syncedWith = [];
    const setStatus = updated.Sync.setStatus;
    updated.Sync.setStatus = function (status, error) {
        setStatus.call(this, status, error);
        if (this.status === 'synced') syncedWith.push(countNow());
    };
    updated.Sync.connect(cloud.adapter);
    await settleUntil(() => updated.Sync.status === 'synced' && cloud.history.has('2026-10-21'), 8000);
    await settle(TICK * 20);
    same('the count is on the screen at once, before anybody writes again', countNow(), 3);
    same('and in the Rima table',
        updated.call('rimaReport', updated.State.schedule, '2026-10-01', '2026-10-31').total, 3);
    check('the line never said synced over a copy missing the count',
        syncedWith.length > 0 && syncedWith.every(value => value === 3), JSON.stringify(syncedWith));
    same('the day\'s cloud copy carries it',
        ((((cloud.history.get('2026-10-21') || {}).days || {})['2026-10-12']) || {}).rima, { p_01: 3 });
    same('and so does this phone\'s disk',
        (((JSON.parse(updated.raw('scheduleData:v2')).days || {})['2026-10-12']) || {}).rima, { p_01: 3 });
    same(`this phone now holds every day the cloud holds, the day ${name} wrote among them`,
        [Boolean(((updated.State.schedule.days['2026-10-13'] || {}).actual || {}).w_01),
            updated.call('canonicalJson', updated.State.schedule.days)],
        [true, updated.call('canonicalJson',
            updated.call('normaliseSchedule', JSON.parse(JSON.stringify(cloud.doc))).days)]);
    same('nothing held, nothing blocked, and the cloud as it was',
        [updated.Sync.holdingContested(), updated.call('farkadWritesBlocked'), cloudRima(cloud, '2026-10-12')],
        [false, false, { p_01: 3 }]);

    // And no wider than that. Its own next count comes back carrying the counts this copy
    // holds, and is skipped as its own echo, as before: adopting every echo would redraw the
    // day screen under the person's finger each time a count is saved.
    rima(updated, '2026-10-14', 'p_03', 2);
    const drawn = updated.renders.count;
    await settleUntil(() => (cloudRima(cloud, '2026-10-14') || {}).p_03 === 2
        && updated.Sync.pendingCount() === 0 && updated.Sync.status === 'synced', 4000);
    await settle(TICK * 20);
    same('its own next count is heard as its own echo, and nothing is redrawn',
        [(cloudRima(cloud, '2026-10-14') || {}).p_03, updated.renders.count - drawn], [2, 0]);
    updated.Sync.stopListening(); updated.Sync.disconnect();
    owner.Sync.stopListening(); owner.Sync.disconnect();
}

// The echo rule compares the counts site by site, and the two cases above - a copy with
// no count at all, a copy with every count - cannot tell that from a rule that only asks
// whether either side has any. A copy that holds ONE of two counts under its own stamps
// can: a count wiped off this disk (the price of F1) comes back with the first snapshot.
for (const [where, second] of [['on the same day', ['2026-10-12', 'p_02']], ['on another day', ['2026-10-14', 'p_02']]]) {
    suite(`a copy holding one of its two counts, the other ${where}, takes the cloud's at the first snapshot`);
    const cloud = makeCloud();
    const solo = phone(`d_part_${second[0]}`);
    solo.Sync.connect(cloud.adapter);
    await settle(TICK * 10);
    rima(solo, '2026-10-12', 'p_01', 3);
    rima(solo, second[0], second[1], 5);
    await settleUntil(() => (cloudRima(cloud, second[0]) || {})[second[1]] === 5 && solo.Sync.pendingCount() === 0
        && solo.Sync._revision === cloud.doc.revision, 4000);
    await settle(TICK * 20);
    solo.Sync.stopListening(); solo.Sync.disconnect();
    const disk = solo.dump();
    const record = JSON.parse(disk['scheduleData:v2']);
    delete record.days['2026-10-12'].rima.p_01;
    given('this phone wrote last, and its copy has lost the first count and kept the second',
        cloud.doc.updatedBy === solo.id && record.updatedAt === cloud.doc.updatedAt
            && (cloudRima(cloud, '2026-10-12') || {}).p_01 === 3
            && ((record.days[second[0]] || {}).rima || {})[second[1]] === 5
            && !Object.prototype.hasOwnProperty.call(record.days['2026-10-12'].rima, 'p_01'),
        JSON.stringify(record.days));
    const behind = reopen(solo.id, Object.assign({}, disk, { 'scheduleData:v2': JSON.stringify(record) }));
    given('opened again, it holds the second count and not the first',
        behind.call('rimaCount', behind.State.schedule, '2026-10-12', 'p_01') === 0
            && behind.call('rimaCount', behind.State.schedule, second[0], second[1]) === 5,
        JSON.stringify(behind.State.schedule.days));
    behind.Sync.connect(cloud.adapter);
    await settleUntil(() => behind.Sync.status === 'synced'
        && behind.call('rimaCount', behind.State.schedule, '2026-10-12', 'p_01') === 3, 4000);
    same('the first count is back on the screen and in the Rima table, with signal',
        [behind.call('rimaCount', behind.State.schedule, '2026-10-12', 'p_01'),
            behind.call('rimaReport', behind.State.schedule, '2026-10-01', '2026-10-31').total, behind.Sync.status],
        [3, 8, 'synced']);
    same('and on the disk', (((JSON.parse(behind.raw('scheduleData:v2')).days || {})['2026-10-12']) || {}).rima,
        second[0] === '2026-10-12' ? { p_01: 3, p_02: 5 } : { p_01: 3 });
    behind.Sync.stopListening(); behind.Sync.disconnect();
}

suite('sameRimaLayers: the same counts, site by site, and nothing else');
{
    const probe = phone('d_same');
    const days = map => ({ days: map });
    const compare = (one, other, skip) => probe.call('sameRimaLayers', one, other, skip);
    const D1 = '2026-10-12';
    const D2 = '2026-10-13';
    same('the same counts are the same', compare(days({ [D1]: { rima: { p_01: 3, p_02: 1 } } }),
        days({ [D1]: { rima: { p_02: 1, p_01: 3 } } })), true);
    same('a different count on one site is not', compare(days({ [D1]: { rima: { p_01: 3 } } }),
        days({ [D1]: { rima: { p_01: 4 } } })), false);
    same('an extra site is not', compare(days({ [D1]: { rima: { p_01: 3 } } }),
        days({ [D1]: { rima: { p_01: 3, p_02: 2 } } })), false);
    same('an extra date is not', compare(days({ [D1]: { rima: { p_01: 3 } } }),
        days({ [D1]: { rima: { p_01: 3 } }, [D2]: { rima: { p_01: 1 } } })), false);
    same('a null, a clear in flight, is no count', compare(days({ [D1]: { rima: { p_01: null } } }),
        days({ [D1]: { plan: {}, actual: {} } })), true);
    same('an empty map is no count', compare(days({ [D1]: { rima: {} } }), days({})), true);
    same('a map that is not a map is not the same as none', compare(days({ [D1]: { rima: [3] } }), days({})), false);
    // Compared as it stands, byte for byte - never read as an empty map, nor as the map it
    // looks like.
    same('nor is a number where the map should be', compare(days({ [D1]: { rima: 5 } }), days({})), false);
    same('nor an empty list', compare(days({ [D1]: { rima: [] } }), days({})), false);
    same('and a list is not the map with the same keys', compare(days({ [D1]: { rima: { 0: 3 } } }),
        days({ [D1]: { rima: [3] } })), false);
    same('nor is a count that is not a number', compare(days({ [D1]: { rima: { p_01: '3' } } }),
        days({ [D1]: { rima: { p_01: 3 } } })), false);
    const skipFirst = (date, placeId) => date === D1 && placeId === 'p_01';
    same('a difference only where the caller says to look away is no difference',
        compare(days({ [D1]: { rima: { p_01: 5, p_02: 1 } } }), days({ [D1]: { rima: { p_01: 4, p_02: 1 } } }),
            skipFirst), true);
    same('and one anywhere else still is',
        compare(days({ [D1]: { rima: { p_01: 5, p_02: 1 } } }), days({ [D1]: { rima: { p_01: 4, p_02: 2 } } }),
            skipFirst), false);
}

// The question every sync rule for a count starts from: is this field path one site's count
// on one day? Asked of the paths the queue and the wire carry, and of nothing longer or
// shorter - a count's clear is a deleted field, a worker-day's is not, and the two are told
// apart here alone.
suite('isRimaFieldPath: one site\'s count on one day, and nothing else');
{
    const probe = phone('d_ispath');
    const is = path => probe.call('isRimaFieldPath', path);
    same('a count\'s path is', is('days.2026-10-12.rima.p_01'), true);
    same('the day\'s whole map is not', is('days.2026-10-12.rima'), false);
    same('nor anything under a count', is('days.2026-10-12.rima.p_01.extra'), false);
    same('nor a worker\'s day', is('days.2026-10-12.actual.w_01'), false);
    same('nor the same words outside the days', is('ledger.2026-10-12.rima.p_01'), false);
}

report();
