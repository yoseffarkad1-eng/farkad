// עובדי יוסף גבס (v183): a second count per site, per day - in no account at all.
//
//   node tests/yosefgeves.test.mjs
//
// The owner, 2026-11-10: "next to the Rima workers, workers who are OUTSIDE ANY ACCOUNT. A
// list of their own that has nothing to do with any account, but I want them recorded with
// me. The list's name is «עובדי יוסף גבס», at every project like the Rima workers ... I just
// write their NUMBER and that's it." Everything this suite measures follows from that:
//
//   the count is stored, validated, journalled, synced, held and cleared EXACTLY as the
//     Rima count is - this file is tests/rima.test.mjs section by section, on the other
//     layer (`days.<date>.yosefGeves.<placeId>`), with every sync road of that suite run
//     again here;
//   and it is IN NO ARITHMETIC AT ALL - not in pay, like Rima, and NOT on the client's
//     invoice either, unlike Rima. Every figure of every surface - the pay sheet, the
//     accounts, the invoice, «בלי עובדי רימא», the Rima table, every sheet of the real
//     workbook, every WhatsApp message and every man's seder - is byte for byte the same
//     with and without these counts on the record;
//   the two lists do not touch: neither count writes, clears, reads or holds the other;
//   its own table and its own sheet, and no column in anybody else's;
//   and a phone that has not updated - v180, v179, and v165 from before Rima - does not
//     take it off the cloud by an ordinary edit, does not keep it in its own copy, refuses
//     this build's record at a restore, and ERASES it by restoring its own. Measured
//     against those builds' REAL bytes, read out of Git.
//
// The screen is in tests/yosefgeves.browser.mjs; the independent calculator is
// tests/oracle.test.mjs, whose generated records carry these counts too.

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { makeDevice, makeCloud, settle, settleUntil, loadOrder, sourceRoot } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const ROOT = sourceRoot();
const REPORTS = readFileSync(new URL('../js/ui/reports.js', import.meta.url), 'utf8');
const SETTINGS = readFileSync(new URL('../js/ui/settings.js', import.meta.url), 'utf8');
const SEDER = readFileSync(new URL('../js/ui/seder.js', import.meta.url), 'utf8');
const DAY_UI = readFileSync(new URL('../js/ui/day.js', import.meta.url), 'utf8');
const DAY_CHECK = readFileSync(new URL('../js/ui/daycheck.js', import.meta.url), 'utf8');
const TICK = 6;

// THE PINNED WORDS (CLAUDE.md, law 6). The list's name is the OWNER'S, verbatim, 2026-11-10.
// Every other string is PROPOSED - its Rima neighbour's wording with the name changed - and
// is pinned here word for word so that correcting one is a deliberate change.
const GEVES_TITLE = 'עובדי יוסף גבס';
const GEVES_SHEET = 'עובדי יוסף גבס';
const GEVES_TOTAL = 'סה״כ עובדי יוסף גבס';
const GEVES_NOTE = 'עובדי יוסף גבס בלבד. אינם נכללים בשכר ואינם נכללים בחיוב.';
const GEVES_LABEL = 'יוסף גבס';
const REFUSED = 'אפשר לרשום ליוסף גבס רק מספר שלם בין 0 ל-99.';

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
const run = (device, code) => vm.runInContext(code, device.ctx, { filename: 'harness:yosefgeves' });

const geves = (device, date, placeId, count) =>
    device.State.commit(device.call('setYosefGevesCount', device.State.schedule, date, placeId, count));
const work = (device, date, workerId, placeId, rate) =>
    device.State.commit(device.call('assignPlace', device.State.schedule, date, workerId,
        'actual', placeId, rate));
const cloudGeves = (cloud, date) =>
    ((((cloud.doc || {}).days || {})[date]) || {}).yosefGeves;

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
    const set = d.call('setYosefGevesCount', d.State.schedule, '2026-10-12', 'p_01', 3);
    same('the edit names exactly one path', set.path, 'days.2026-10-12.yosefGeves.p_01');
    same('and carries the count as a number', set.value, 3);
    same('the day holds it under yosefGeves, by site', d.State.schedule.days['2026-10-12'].yosefGeves, { p_01: 3 });
    same('a day with Yosef Geves alone still has the two worker layers, empty',
        [d.State.schedule.days['2026-10-12'].plan, d.State.schedule.days['2026-10-12'].actual], [{}, {}]);

    // The sentences a person reads when a count will not read - the restore refusal and the
    // unreadable-record banner both print dayProblems - pinned like every other one (law 6).
    // The wire sentence is never shown (receive() reads only that there was one) and is
    // pinned all the same, so it cannot drift into a different word for the same refusal.
    const known = { places: new Set(['p_01', 'p_02', 'p_03']) };
    same('a map that is not a map, in its words',
        d.call('yosefGevesProblems', [3], '2026-10-12', known), ['ליום 2026-10-12 יש רישום יוסף גבס שאינו תקין.']);
    same('a site id that is not an id, in its words',
        d.call('yosefGevesProblems', { ' p_01': 3 }, '2026-10-12', known), ['ביום 2026-10-12 יש רישום יוסף גבס תחת מזהה שאינו תקין.']);
    same('a count that is not a count, in its words',
        d.call('yosefGevesProblems', { p_01: 'three' }, '2026-10-12', known),
        ['ביום 2026-10-12 יש מספר עובדי יוסף גבס שאינו תקין באתר p_01.']);
    same('a site that is not on the roster, in its words',
        d.call('yosefGevesProblems', { p_gone: 3 }, '2026-10-12', known),
        ['ביום 2026-10-12 יש רישום יוסף גבס באתר p_gone שאינו ברשימה.']);
    same('and the refusal on the wire, in its words',
        d.call('yosefGevesWireProblems', { days: { '2026-10-12': { yosefGeves: { p_01: 'three' } } } }), ['רישום יוסף גבס אינו תקין.']);
    // Written twice in yosefGevesWireProblems - a map that is not a map, and a value that is not a
    // count - and the same sentence at both.
    same('and on the wire a map that is not a map, in the same words',
        d.call('yosefGevesWireProblems', { days: { '2026-10-12': { yosefGeves: [3] } } }), ['רישום יוסף גבס אינו תקין.']);

    same('10 is a guide, not a cap', d.call('setYosefGevesCount', d.State.schedule, '2026-10-12', 'p_02', 14).value, 14);
    same('99 is accepted', d.call('setYosefGevesCount', d.State.schedule, '2026-10-12', 'p_03', 99).value, 99);
    for (const [label, value] of [['100', 100], ['a fraction', 2.5], ['a negative', -1],
        ['a string', '3'], ['NaN', NaN], ['Infinity', Infinity], ['true', true]]) {
        const refused = d.call('setYosefGevesCount', d.State.schedule, '2026-10-13', 'p_01', value);
        check(`${label} is refused, with the pinned sentence`, refused.refused === true
            && refused.reason === REFUSED, JSON.stringify(refused));
    }
    check('a refused count wrote nothing', d.State.schedule.days['2026-10-13'] === undefined,
        JSON.stringify(d.State.schedule.days['2026-10-13']));
    same('the pinned refusal is the one the model says', d.global('YOSEF_GEVES_REFUSED'), REFUSED);
    check('a date that does not exist is refused',
        d.call('setYosefGevesCount', d.State.schedule, '2026-02-30', 'p_01', 3).refused === true);
    check('a site id that cannot be half of a path is refused',
        d.call('setYosefGevesCount', d.State.schedule, '2026-10-12', 'p.01', 3).refused === true);

    const clear = d.call('setYosefGevesCount', d.State.schedule, '2026-10-12', 'p_02', 0);
    same('0 clears: the same one path, with null', [clear.path, clear.value], ['days.2026-10-12.yosefGeves.p_02', null]);
    same('and the count is gone from the day', d.State.schedule.days['2026-10-12'].yosefGeves, { p_01: 3, p_03: 99 });
    d.call('setYosefGevesCount', d.State.schedule, '2026-10-12', 'p_01', null);
    d.call('setYosefGevesCount', d.State.schedule, '2026-10-12', 'p_03', '');
    check('clearing the last count takes the map with it, not an empty one left standing',
        d.State.schedule.days['2026-10-12'].yosefGeves === undefined,
        JSON.stringify(d.State.schedule.days['2026-10-12']));

    suite('the queue accepts exactly the edits the model makes');
    const q = (path, value) => d.call('journalEntryProblems', path, value);
    same('a count', q('days.2026-10-12.yosefGeves.p_01', 3), []);
    same('a clear', q('days.2026-10-12.yosefGeves.p_01', null), []);
    check('0 is not a count on the wire', q('days.2026-10-12.yosefGeves.p_01', 0).length > 0);
    check('100 is not', q('days.2026-10-12.yosefGeves.p_01', 100).length > 0);
    check('a fraction is not', q('days.2026-10-12.yosefGeves.p_01', 1.5).length > 0);
    check('a string is not', q('days.2026-10-12.yosefGeves.p_01', '3').length > 0);
    check('an object is not', q('days.2026-10-12.yosefGeves.p_01', { count: 3 }).length > 0);
    check('a poisoned site name is not', q('days.2026-10-12.yosefGeves.__proto__', 3).length > 0);
    check('a date that does not exist is not', q('days.2026-02-30.yosefGeves.p_01', 3).length > 0);
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
// null under `yosefGeves` while every Node suite stays green against the harness's copy; only
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
    // v183 MOVED: the second count per site, «עובדי יוסף גבס», is cleared the same way.
    same('the production adapter deletes a cleared plan, actual, Yosef Geves and Yosef Geves field', adapter,
        ['actual', 'plan', 'rima', 'yosefGeves']);
    same('and the sync layer and the fake cloud say exactly the same', [sync, fake], [adapter, adapter]);
    // And each copy ACTS on what it names. A rule computed and then not used names the
    // right layers and deletes nothing: the adapter would send a null under `yosefGeves` again,
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
    suite('a stored record with Yosef Geves on it is a record this build opens');

    const d = phone('d_doors');
    geves(d, '2026-10-12', 'p_01', 3);
    work(d, '2026-10-13', 'w_01', 'p_02');
    geves(d, '2026-10-13', 'p_02', 2);
    const stored = JSON.parse(d.raw('scheduleData:v2'));
    same('the disk holds the counts', [stored.days['2026-10-12'].yosefGeves, stored.days['2026-10-13'].yosefGeves],
        [{ p_01: 3 }, { p_02: 2 }]);
    same('and the record is clean to this build', d.call('storedScheduleProblems', stored), []);
    same('and clean as a whole document for a restore', d.call('fullScheduleProblems',
        d.call('cloudDocument', d.State.schedule)), []);

    const reopened = makeDevice({ deviceId: 'd_doors', storage: d.dump() });
    reopened.State.load();
    same('a reopen reads them back', [reopened.call('yosefGevesCount', reopened.State.schedule, '2026-10-12', 'p_01'),
        reopened.call('yosefGevesCount', reopened.State.schedule, '2026-10-13', 'p_02')], [3, 2]);
    same('and is not held', reopened.call('farkadWritesBlocked'), false);

    const onlyRima = { schemaVersion: 2, workers: WORKERS(), places: PLACES(), advances: {},
        days: { '2026-10-12': { yosefGeves: { p_01: 4 } } } };
    same('a day carrying Yosef Geves and nothing else is a day, not an empty record',
        d.call('storedScheduleProblems', onlyRima), []);

    const bad = value => d.call('storedScheduleProblems', { schemaVersion: 2, workers: WORKERS(),
        places: PLACES(), advances: {}, days: { '2026-10-12': { plan: {}, actual: {}, yosefGeves: value } } });
    check('an unreadable count is refused, not read as nothing', bad({ p_01: 'three' }).length > 0,
        JSON.stringify(bad({ p_01: 'three' })));
    check('so is 0 stored as a count', bad({ p_01: 0 }).length > 0);
    check('so is a map that is not a map', bad([3]).length > 0 && bad('3').length > 0);
    check('a replacement naming a site its roster has not got is refused',
        d.call('fullScheduleProblems', { schemaVersion: 2, workers: WORKERS(), places: PLACES(),
            advances: {}, days: { '2026-10-12': { yosefGeves: { p_gone: 2 } } } }).length > 0);

    suite('every read keeps every count');
    const raw = { schemaVersion: 2, workers: WORKERS(), places: PLACES(), advances: {},
        days: { '2026-10-12': { yosefGeves: { p_01: 4, p_02: null } } } };
    const read = d.call('normaliseSchedule', raw);
    same('a count arrives as it was, a null as nothing', read.days['2026-10-12'].yosefGeves, { p_01: 4 });
    const tomb = { ...raw, roster: { places: { p_03: null } },
        days: { '2026-10-12': { yosefGeves: { p_03: 6 } } } };
    const back = d.call('normaliseSchedule', tomb);
    check('a site with a count on it outlives its tombstone, archived',
        back.places.some(place => place.id === 'p_03' && place.active === false),
        JSON.stringify(back.places));
    same('and its count with it', back.days['2026-10-12'].yosefGeves, { p_03: 6 });
    const poisoned = JSON.parse('{"schemaVersion":2,"workers":[],"places":[],"advances":{},'
        + '"days":{"2026-10-12":{"yosefGeves":{"__proto__":{"x":1},"p_01":2}}}}');
    const found = d.call('poisonedContainers', poisoned).map(item => item.at);
    same('a poisoned site name under yosefGeves is reported where it sits', found, ['days.2026-10-12.yosefGeves.__proto__']);

    suite('the rescue file compares captures by their counts too');
    const facts = d.call('recoveryFacts', d.State.schedule);
    check('each count is its own fact', facts['yosefGeves:2026-10-12:p_01'] === '3'
        && facts['yosefGeves:2026-10-13:p_02'] === '2', JSON.stringify(Object.keys(facts).filter(k => k.startsWith('yosefGeves'))));
}

// ---------------------------------------------------------------- the journal
{
    suite('a count is journalled before it is called saved, and survives a reopen offline');

    const d = phone('d_journal');
    given('the count commits', geves(d, '2026-10-14', 'p_03', 5) === true);
    const queued = d.Sync.pendingPaths ? d.Sync.pendingPaths() : [...d.Sync._outbox.keys()];
    check('the queue holds exactly the one path', queued.includes('days.2026-10-14.yosefGeves.p_03'),
        JSON.stringify(queued));
    const reopened = makeDevice({ deviceId: 'd_journal', storage: d.dump() });
    reopened.State.load();
    same('the reopen rebuilds it with no cloud anywhere',
        reopened.call('yosefGevesCount', reopened.State.schedule, '2026-10-14', 'p_03'), 5);
    given('and a clear commits', geves(reopened, '2026-10-14', 'p_03', 0) === true);
    const again = makeDevice({ deviceId: 'd_journal', storage: reopened.dump() });
    again.State.load();
    same('the clear survives the next reopen', again.call('yosefGevesCount', again.State.schedule, '2026-10-14', 'p_03'), 0);
    check('with no map left behind on that day',
        !again.State.schedule.days['2026-10-14'] || again.State.schedule.days['2026-10-14'].yosefGeves === undefined);
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
    geves(a, '2026-10-15', 'p_01', 3);
    await settleUntil(() => (cloudGeves(cloud, '2026-10-15') || {}).p_01 === 3);
    const sent = cloud.writes.slice(before).map(write => Object.keys(write.patch || {})
        .filter(path => path.startsWith('days.')));
    same('the write carried that one path and no other day path', sent.flat(), ['days.2026-10-15.yosefGeves.p_01']);
    await settleUntil(() => b.call('yosefGevesCount', b.State.schedule, '2026-10-15', 'p_01') === 3);
    same('the other phone has it', b.call('yosefGevesCount', b.State.schedule, '2026-10-15', 'p_01'), 3);

    // Two people, two sites, the same evening: two fields, both kept.
    geves(a, '2026-10-15', 'p_02', 4);
    geves(b, '2026-10-15', 'p_03', 2);
    await settleUntil(() => {
        const held = cloudGeves(cloud, '2026-10-15') || {};
        return held.p_02 === 4 && held.p_03 === 2;
    });
    await settleUntil(() => a.call('yosefGevesCount', a.State.schedule, '2026-10-15', 'p_03') === 2
        && b.call('yosefGevesCount', b.State.schedule, '2026-10-15', 'p_02') === 4);
    same('two sites typed on two phones are both in the cloud', cloudGeves(cloud, '2026-10-15'),
        { p_01: 3, p_02: 4, p_03: 2 });
    same('and on both phones', [a.State.schedule.days['2026-10-15'].yosefGeves, b.State.schedule.days['2026-10-15'].yosefGeves],
        [{ p_01: 3, p_02: 4, p_03: 2 }, { p_01: 3, p_02: 4, p_03: 2 }]);

    geves(b, '2026-10-15', 'p_01', 0);
    await settleUntil(() => !Object.prototype.hasOwnProperty.call(cloudGeves(cloud, '2026-10-15') || {}, 'p_01'));
    check('a clear removes the field from the cloud, it does not store a null',
        !Object.prototype.hasOwnProperty.call(cloudGeves(cloud, '2026-10-15') || {}, 'p_01'),
        JSON.stringify(cloudGeves(cloud, '2026-10-15')));
    await settleUntil(() => a.call('yosefGevesCount', a.State.schedule, '2026-10-15', 'p_01') === 0);
    same('and the first phone sees it cleared', a.State.schedule.days['2026-10-15'].yosefGeves, { p_02: 4, p_03: 2 });
    same('both phones say synced, neither is held', [a.Sync.status, b.Sync.status,
        a.call('farkadWritesBlocked'), b.call('farkadWritesBlocked')], ['synced', 'synced', false, false]);

    suite('a count-only day reaches the other phone as a day');
    geves(a, '2026-10-16', 'p_02', 6);
    await settleUntil(() => b.call('yosefGevesCount', b.State.schedule, '2026-10-16', 'p_02') === 6);
    same('the cloud holds a day with Yosef Geves and no worker', cloud.doc.days['2026-10-16'].yosefGeves, { p_02: 6 });
    same('the other phone reads it', b.call('yosefGevesCount', b.State.schedule, '2026-10-16', 'p_02'), 6);
    same('and its disk is clean to this build',
        b.call('storedScheduleProblems', JSON.parse(b.raw('scheduleData:v2'))), []);

    suite('a malformed count from the cloud is refused, kept, and replaces nothing');
    const held = JSON.stringify(b.State.schedule);
    const raw = JSON.parse(JSON.stringify(cloud.doc));
    raw.days['2026-10-16'].yosefGeves.p_02 = 'six';
    raw.revision = cloud.doc.revision + 1;
    b.Sync.receive(raw);
    same('the schedule on the phone is unchanged', JSON.stringify(b.State.schedule), held);
    check('the snapshot is held as evidence', b.global('Recovery').problems
        .some(problem => problem.key === 'farkad:refusedSnapshot'), JSON.stringify(b.global('Recovery').problems.map(p => p.key)));
    check('and the phone stops writing until somebody has looked', b.call('farkadWritesBlocked') === true);
    a.Sync.stopListening(); a.Sync.disconnect();
    b.Sync.stopListening(); b.Sync.disconnect();
}

// ---------------------------------------------------------------- IN NO ARITHMETIC AT ALL
//
// The one thing this list is that Rima's is not. A fortnight with every kind of day in it -
// a double at two sites, extra hours, an absence, a weekly man and a fortnightly one, an
// advance, a closed week, AND Rima counts - is read off every surface the app has, then
// «עובדי יוסף גבס» counts are typed on top of all of it: on a site and a day his men
// worked, on a site and a day Rima was counted, on a site nobody was on, on a day with
// nobody at all, inside the closed week, on the absence. Every surface is read again and
// compared byte for byte. Nothing may have moved - not a shekel, and not a COUNT: the
// invoice bills exactly what it billed, which is the difference from Rima.
{
    suite('a «עובדי יוסף גבס» count moves no shekel - pay sheet, advances, closure, statement');

    const FROM = '2026-10-02';
    const TO = '2026-10-15';
    const d = withReports(phone('d_money'), FROM, TO);
    vm.runInContext(SEDER, d.ctx, { filename: 'js/ui/seder.js' });
    vm.runInContext(DAY_CHECK, d.ctx, { filename: 'js/ui/daycheck.js' });
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
    // Rima is on the record first, so that her table, her share of the invoice and the
    // invoice without her are among the things that must not move.
    const rima = (date, placeId, count) =>
        d.State.commit(d.call('setRimaCount', d.State.schedule, date, placeId, count));
    rima('2026-10-04', 'p_01', 3);
    rima('2026-10-09', 'p_02', 5);
    rima('2026-10-12', 'p_03', 2);

    const DATES = ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-09', '2026-10-10', '2026-10-12', '2026-10-13'];
    const STYLES = d.global('MESSAGE_STYLES').map(style => style.key);
    const SITES = [null].concat(PLACES().map(place => place.id));
    // A report object carries functions; its cells are read out through them, every site
    // against every date, so nothing it can answer is left unasked.
    const grid = table => ({
        dates: table.dates,
        places: JSON.parse(JSON.stringify(table.places)),
        total: table.total,
        cells: table.dates.map(date => PLACES().map(place => table.countAt(place.id, date))),
        days: typeof table.dayTotal === 'function' ? table.dates.map(date => table.dayTotal(date)) : null
    });
    const scopes = [
        ['the full export', "REPORT_SECTION = 'workers'; INVOICE_PLACE = null; REPORT_WORKERS = null;"],
        ['the billing side, every site', "REPORT_SECTION = 'sites'; INVOICE_PLACE = null; REPORT_WORKERS = null;"],
        ['one client, p_01', "REPORT_SECTION = 'sites'; INVOICE_PLACE = 'p_01'; REPORT_WORKERS = null;"],
        ['one client, p_03', "REPORT_SECTION = 'sites'; INVOICE_PLACE = 'p_03'; REPORT_WORKERS = null;"],
        ['chosen workers', "REPORT_SECTION = 'workers'; INVOICE_PLACE = null; REPORT_WORKERS = new Set(['w_01']);"]
    ];
    const sheetsIn = code => {
        run(d, code);
        const sheets = run(d, 'reportSheets()');
        const out = {};
        Object.keys(sheets).forEach(key => { if (key !== 'yosefGeves') out[key] = sheets[key]; });
        run(d, scopes[0][1]);
        return out;
    };
    // The real workbook, written by the shipped SheetJS: every sheet but the list's own,
    // cell for cell as the library holds it (value, type, formatted text), and the order.
    vm.runInContext(readFileSync(new URL('../vendor/xlsx-0.18.5.min.js', import.meta.url), 'utf8'), d.ctx,
        { filename: 'vendor/xlsx-0.18.5.min.js' });
    const books = [];
    d.ctx.__books = books;
    run(d, 'XLSX.writeFile = function (wb, filename) { __books.push({ filename, names: wb.SheetNames.slice(),'
        + ' sheets: JSON.parse(JSON.stringify(wb.Sheets)), views: JSON.parse(JSON.stringify(wb.Workbook || null)) }); };');
    const workbookIn = async code => {
        run(d, code);
        books.length = 0;
        await run(d, 'exportReports()');
        run(d, scopes[0][1]);
        const book = books[0] || null;
        if (!book) return null;
        const sheets = {};
        book.names.filter(name => name !== GEVES_SHEET).forEach(name => { sheets[name] = book.sheets[name]; });
        return { filename: book.filename, names: book.names.filter(name => name !== GEVES_SHEET), sheets, views: book.views };
    };
    const surfaces = async () => {
        const out = {
            payroll: d.call('payrollReport', d.State.schedule, FROM, TO),
            days: WORKERS().map(w => d.call('workerDaysReport', d.State.schedule, d.State.worker(w.id), FROM, TO)),
            accounts: WORKERS().map(w => d.call('advanceAccount', d.State.schedule, w.id, FROM, TO)),
            rows: run(d, 'payrollRows()'),
            paySheet: run(d, 'payrollSheetRows()'),
            detail: run(d, 'detailRows()'),
            advances: d.State.schedule.advances,
            ledger: d.State.schedule.ledger,
            footprints: WORKERS().map(w => d.call('workerFootprint', d.State.schedule, w.id)),
            invoice: grid(d.call('invoiceByDate', d.State.schedule, FROM, TO)),
            withoutRimaOne: PLACES().map(place => grid(run(d, `invoiceWithoutRima(State.schedule, '${FROM}', '${TO}', '${place.id}')`))),
            invoiceSheet: run(d, 'invoiceSheetRows()'),
            withoutRima: grid(run(d, `invoiceWithoutRima(State.schedule, '${FROM}', '${TO}')`)),
            withoutRimaSheet: run(d, 'withoutRimaSheetRows()'),
            rima: grid(d.call('rimaReport', d.State.schedule, FROM, TO)),
            rimaOne: PLACES().map(place => grid(d.call('rimaReport', d.State.schedule, FROM, TO, place.id))),
            rimaSheet: run(d, 'rimaSheetRows()'),
            labels: [...d.call('placeLabelsIn', d.State.schedule, FROM, TO)],
            unlisted: d.call('unlistedPlaceIds', d.State.schedule, FROM, TO),
            messages: DATES.flatMap(date => ['actual', 'plan'].flatMap(layer => STYLES.flatMap(style =>
                SITES.map(site => d.call('dayMessage', date, layer, style, site))))),
            seder: DATES.map(date => d.call('sederCrew', d.State.schedule, date, 'actual')
                .map(row => [row, d.call('sederMessage', row, date)])),
            // «בדיקת היום» (v182): what it finds on each of those days, its Rima rule included.
            dayCheck: DATES.concat(['2026-10-08', '2026-10-11', '2026-10-14']).map(date =>
                d.call('dayCheckRead', d.State.schedule, date, 'actual', '2026-10-20')),
            sheets: scopes.map(([, code]) => sheetsIn(code)),
            roster: [d.State.schedule.workers, d.State.schedule.places]
        };
        out.workbooks = [];
        for (const [, code] of scopes) out.workbooks.push(await workbookIn(code));
        return JSON.stringify(out);
    };

    const before = await surfaces();
    given('the fortnight has pay in it, an invoice, a Rima table and messages',
        /"amount":[1-9]/.test(before) && JSON.parse(before).invoice.total === 15
            && JSON.parse(before).rima.total === 10 && JSON.parse(before).seder.flat().length > 0
            && JSON.parse(before).workbooks.every(book => book && book.names.length > 0),
        JSON.stringify([JSON.parse(before).invoice.total, JSON.parse(before).rima.total,
            JSON.parse(before).workbooks.map(book => book && book.names)]));
    const daysBefore = JSON.parse(JSON.stringify(d.State.schedule.days));

    // On a site and day his men worked; on the site and day Rima's three were counted; on
    // a site nobody was on that day; on a day with nobody at all (the 10th and the 13th);
    // inside the closed week; on the day of the absence; and on a Rima-only day.
    geves(d, '2026-10-04', 'p_01', 2);
    geves(d, '2026-10-05', 'p_03', 7);
    geves(d, '2026-10-06', 'p_01', 4);
    geves(d, '2026-10-07', 'p_01', 9);
    geves(d, '2026-10-09', 'p_02', 1);
    geves(d, '2026-10-10', 'p_02', 6);
    geves(d, '2026-10-12', 'p_03', 12);
    geves(d, '2026-10-13', 'p_01', 99);
    const table = d.call('yosefGevesReport', d.State.schedule, FROM, TO);
    given('the counts are really on the record', table.total === 140, String(table.total));
    const after = await surfaces();
    same('every figure on every surface is byte for byte what it was', after === before, true);
    // Named one by one as well, so a failure says WHICH surface moved.
    const [was, is] = [JSON.parse(before), JSON.parse(after)];
    same('surface by surface: none moved',
        Object.keys(was).filter(key => JSON.stringify(was[key]) !== JSON.stringify(is[key])), []);
    same('the pay sheet, the worker-days and the accounts', [is.payroll, is.days, is.accounts],
        [was.payroll, was.days, was.accounts]);
    same('the advances and the ledger', [is.advances, is.ledger], [was.advances, was.ledger]);

    suite('and it is on NO invoice - the difference from Rima');
    same('the invoice bills exactly what it billed: every site, every day, every total', is.invoice, was.invoice);
    same('the grand total is his five and Rima\'s ten, and not one of the 140',
        d.call('invoiceByDate', d.State.schedule, FROM, TO).total, 15);
    const bill = d.call('invoiceByDate', d.State.schedule, FROM, TO);
    check('a day with only this list\'s men is NOT a billed day', !bill.dates.includes('2026-10-10')
        && !bill.dates.includes('2026-10-13'), JSON.stringify(bill.dates));
    same('a site and day his man and the list\'s two were both on is billed for his man and Rima\'s three',
        bill.countAt('p_01', '2026-10-04'), 4);
    same('the חיוב sheet did not move by a cell', is.invoiceSheet, was.invoiceSheet);
    same('nor «בלי עובדי רימא», the table or the sheet', [is.withoutRima, is.withoutRimaSheet],
        [was.withoutRima, was.withoutRimaSheet]);
    same('nor the Rima table, the whole of it or one site, nor the רימא sheet',
        [is.rima, is.rimaOne, is.rimaSheet], [was.rima, was.rimaOne, was.rimaSheet]);
    same('no site was renamed or renumbered for it', [is.labels, is.unlisted], [was.labels, was.unlisted]);
    check('nobody is created to hold them: the same two men, the same three sites',
        d.State.schedule.workers.length === 2 && d.State.schedule.places.length === 3);
    same('and no worker\'s day was touched: plan and actual are what they were, every day',
        Object.keys(d.State.schedule.days).sort().map(date => [date,
            d.State.schedule.days[date].plan, d.State.schedule.days[date].actual])
            .filter(([date, plan, actual]) => daysBefore[date]
                && (JSON.stringify(plan) !== JSON.stringify(daysBefore[date].plan)
                    || JSON.stringify(actual) !== JSON.stringify(daysBefore[date].actual)))
            .map(([date]) => date), []);
    // No function of the money model reads the layer: said by the source, as a guard on the
    // measurement above (a reader added later, behind a condition this record never meets).
    const MONEY = readFileSync(new URL('../js/model/money.js', import.meta.url), 'utf8');
    check('js/model/money.js does not name the layer or any of its functions',
        !/yosefGeves|YOSEF_GEVES|siteCountAt|SITE_COUNT_LAYERS/i.test(MONEY));
    const LEDGER = readFileSync(new URL('../js/model/ledger.js', import.meta.url), 'utf8');
    check('nor does js/model/ledger.js', !/yosefGeves|YOSEF_GEVES|siteCountAt/i.test(LEDGER));

    suite('the messages: the day\'s, every template and site, and the seder to each man');
    same('every WhatsApp message is byte for byte what it was', is.messages, was.messages);
    same('and so is every man\'s seder, and who is on the list', is.seder, was.seder);
    same('not one of them says גבס', is.messages.concat(is.seder.flat().map(pair => pair[1]))
        .filter(text => /גבס/.test(text)), []);

    same('and «בדיקת היום» finds on every day exactly what it found - no rule reads the list', is.dayCheck, was.dayCheck);
    check('it was finding something: the comparison is not of two empty readings',
        JSON.stringify(was.dayCheck).length > 200, JSON.stringify(was.dayCheck).slice(0, 200));

    suite('the workbook, written by the shipped library: every sheet that existed, cell for cell');
    scopes.forEach(([name], at) => same(`${name}: the same sheets, in the same order, with the same cells`,
        is.workbooks[at], was.workbooks[at]));
    scopes.forEach(([name], at) => same(`${name}: reportSheets, every key but the list's own`, is.sheets[at], was.sheets[at]));

    suite('the «עובדי יוסף גבס» table: its own dates, only its sites, its own total');
    same('one row per date that HAS a count, the days with nobody else included', table.dates,
        ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-09', '2026-10-10', '2026-10-12', '2026-10-13']);
    same('one column per site that had one, in roster order', table.places.map(p => [p.placeId, p.name, p.total]),
        [['p_01', 'הרצליה', 114], ['p_02', 'תל אביב', 7], ['p_03', 'פרדסיה', 19]]);
    same('a day\'s total is that day\'s sites added', table.dayTotal('2026-10-05'), 7);
    same('the whole total', table.total, 140);
    same('one site narrows it to that site alone',
        (t => ({ dates: t.dates, total: t.total, columns: t.places.length }))(
            d.call('yosefGevesReport', d.State.schedule, FROM, TO, 'p_03')),
        { dates: ['2026-10-05', '2026-10-12'], total: 19, columns: 1 });
    same('a range with no count has no table',
        d.call('yosefGevesReport', d.State.schedule, '2026-09-01', '2026-09-30').places, []);
    check('and it does not read Rima\'s counts: Rima\'s ten are nowhere in it',
        table.countAt('p_02', '2026-10-09') === 1 && table.countAt('p_03', '2026-10-12') === 12);

    suite('the workbook: its own LAST sheet, of the full export and of no other file');
    const sheets = run(d, 'reportSheets()');
    same('the sheets: pay, billing, the billing without Rima, detail, רימא, then this one', Object.keys(sheets),
        ['payroll', 'invoice', 'withoutRima', 'detail', 'rima', 'yosefGeves']);
    const sheet = sheets.yosefGeves;
    same('header: date, the sites that had a count, total', sheet[0], ['תאריך', 'הרצליה', 'תל אביב', 'פרדסיה', 'סה״כ']);
    same('a day with nobody else is a row, with its full date', sheet.find(r => r[0] === '2026-10-10'), ['2026-10-10', 0, 6, 0, 6]);
    same('the last row of numbers is the pinned total line', sheet[sheet.length - 3], [GEVES_TOTAL, 114, 7, 19, 140]);
    same('then an empty row, then the note in the first column', sheet.slice(-2), [[], [GEVES_NOTE]]);
    check('every count is a number, so a SUM works', sheet.slice(1, -2).every(r => r.slice(1).every(cell => typeof cell === 'number')),
        JSON.stringify(sheet));
    const body = sheet.slice(1, -3);
    same('the date rows add up to the total row, column by column',
        [1, 2, 3, 4].map(col => body.reduce((sum, r) => sum + r[col], 0)), [114, 7, 19, 140]);
    same('and each row\'s own total is its sites added', body.map(r => r[1] + r[2] + r[3] === r[4]), body.map(() => true));
    same('the pinned words are the ones reports.js says', [d.global('YOSEF_GEVES_TITLE'), d.global('YOSEF_GEVES_NOTE'),
        d.global('YOSEF_GEVES_TOTAL'), d.global('YOSEF_GEVES_SHEET')], [GEVES_TITLE, GEVES_NOTE, GEVES_TOTAL, GEVES_SHEET]);
    same('and the word on the site card\'s box is the list\'s name without «עובדי», as the day screen says it',
        (/const YOSEF_GEVES_LABEL = '([^']+)';/.exec(DAY_UI) || [])[1], GEVES_LABEL);
    same('the list\'s name is in the owner\'s words, and the sheet is named for the list', [GEVES_TITLE, GEVES_SHEET],
        ['עובדי יוסף גבס', 'עובדי יוסף גבס']);
    const names = WORKERS().map(w => w.name).concat(['דוד', 'סמיר']);
    check('it names nobody and pays nobody', !names.some(name => JSON.stringify(sheet).includes(name))
        && !/400|350|500/.test(JSON.stringify(sheet)), JSON.stringify(sheet));

    books.length = 0;
    await run(d, 'exportReports()');
    same('in the real workbook it is the last sheet, under the list\'s own name',
        [books.length, books[0] && books[0].names], [1, ['שכר', 'חיוב', 'בלי עובדי רימא', 'פירוט', 'רימא', GEVES_SHEET]]);
    run(d, "REPORT_SECTION = 'sites'; INVOICE_PLACE = 'p_01';");
    same('one client\'s file does not carry it: the billing grid, it without Rima, that site\'s Rima',
        Object.keys(run(d, 'reportSheets()')), ['invoice', 'withoutRima', 'rima']);
    books.length = 0;
    await run(d, 'exportReports()');
    same('nor does the client\'s real workbook', books[0] && books[0].names, ['חיוב', 'בלי עובדי רימא', 'רימא']);
    run(d, "REPORT_SECTION = 'workers'; INVOICE_PLACE = null; REPORT_WORKERS = new Set(['w_01']);");
    same('a chosen-workers export is about those men\'s pay and does not carry it',
        Object.keys(run(d, 'reportSheets()')), ['payroll', 'detail']);
    run(d, 'REPORT_WORKERS = null;');
    run(d, `REPORT_RANGE.from = '2026-09-01'; REPORT_RANGE.to = '2026-09-30';`);
    same('a range with no count: no such sheet', Object.keys(run(d, 'reportSheets()')), ['payroll', 'invoice', 'detail']);
    run(d, `REPORT_RANGE.from = '${FROM}'; REPORT_RANGE.to = '${TO}';`);

    suite('the CSV fallback: its own file, in the full export only');
    const fallback = async code => {
        run(d, code);
        const XLSX = d.ctx.XLSX;
        run(d, 'var __xlsx = XLSX; XLSX = undefined;');
        const names = [];
        const downloadCsv = d.ctx.downloadCsv;
        d.ctx.downloadCsv = (rows, filename) => { names.push([filename, rows]); return true; };
        // With no library the app first tries to fetch it; say at once that it is not there.
        d.ctx.document.head = { appendChild(tag) { if (tag && typeof tag.onerror === 'function') tag.onerror(); } };
        try { await run(d, 'exportReports()'); } finally {
            d.ctx.downloadCsv = downloadCsv;
            run(d, 'XLSX = __xlsx;');
            d.ctx.document.head = { appendChild() {} };
            run(d, scopes[0][1]);
        }
        return names;
    };
    const csv = await fallback(scopes[0][1]);
    same('the full export hands six files, the list\'s own last',
        csv.map(([filename]) => filename.replace(/_.*$/, '')),
        ['farkad-payroll', 'farkad-invoice', 'farkad-invoice-without-rima', 'farkad-detail', 'farkad-rima', 'farkad-yosef-geves']);
    same('its file is the sheet, row for row', (csv.find(([filename]) => filename.startsWith('farkad-yosef-geves')) || [])[1], sheet);
    const clientCsv = await fallback(scopes[2][1]);
    same('one client\'s fallback does not hand it', clientCsv.map(([filename]) => filename.replace(/_.*$/, '')),
        ['farkad-invoice', 'farkad-invoice-without-rima', 'farkad-rima']);

    suite('ten sites, a count on two: two columns, and the invoice above keeps its ten');
    const ten = Array.from({ length: 10 }, (_, i) => ({ id: `p_${i}`, name: `אתר מספר ${i + 1}`, active: true }));
    const wide = withReports(phone('d_ten', { places: ten }), '2026-10-01', '2026-10-31');
    ten.forEach((place, i) => work(wide, `2026-10-${String(i + 10)}`, 'w_01', place.id));
    const billedTen = JSON.stringify(run(wide, 'invoiceSheetRows()'));
    geves(wide, '2026-10-05', 'p_3', 2);
    geves(wide, '2026-10-06', 'p_8', 4);
    same('only the two sites with a count are columns',
        wide.call('yosefGevesReport', wide.State.schedule, '2026-10-01', '2026-10-31').places.map(p => p.placeId), ['p_3', 'p_8']);
    same('the sheet is four columns wide - date, two sites, total', run(wide, 'reportSheets()').yosefGeves[0].length, 4);
    same('and the invoice still has all ten, cell for cell what it was', JSON.stringify(run(wide, 'invoiceSheetRows()')), billedTen);

    suite('a site the roster has not got: named, never numbered, and the invoice\'s numbering unmoved');
    const lost = withReports(phone('d_unlisted'), FROM, TO);
    work(lost, '2026-10-05', 'w_01', 'p_01');
    lost.State.schedule.days['2026-10-06'] = { plan: {}, actual: { w_02: { entries: [{ placeId: 'p_zz' }] } } };
    const numbered = JSON.stringify([[...lost.call('placeLabelsIn', lost.State.schedule, FROM, TO)],
        run(lost, 'invoiceSheetRows()')]);
    lost.State.schedule.days['2026-10-06'].yosefGeves = { p_aa: 3 };
    same('the invoice\'s unlisted site keeps its number, and its sheet its cells',
        JSON.stringify([[...lost.call('placeLabelsIn', lost.State.schedule, FROM, TO)], run(lost, 'invoiceSheetRows()')]), numbered);
    same('and the list\'s own table names the site for what it is',
        lost.call('yosefGevesReport', lost.State.schedule, FROM, TO).places.map(p => [p.placeId, p.name, p.total]),
        [['p_aa', 'אתר שאינו ברשימה', 3]]);
}

// ---------------------------------------------------------------- the two lists do not touch
{
    suite('the two counts of one site are two fields: neither writes, clears or reads the other');

    const d = phone('d_two');
    const DAY = '2026-10-12';
    d.State.commit(d.call('setRimaCount', d.State.schedule, DAY, 'p_01', 3));
    geves(d, DAY, 'p_01', 5);
    same('both on the day, each under its own layer',
        [d.State.schedule.days[DAY].rima, d.State.schedule.days[DAY].yosefGeves], [{ p_01: 3 }, { p_01: 5 }]);
    same('each read by its own reader', [d.call('rimaCount', d.State.schedule, DAY, 'p_01'),
        d.call('yosefGevesCount', d.State.schedule, DAY, 'p_01')], [3, 5]);
    geves(d, DAY, 'p_01', 0);
    same('clearing this list\'s count leaves Rima\'s', [d.State.schedule.days[DAY].rima, d.State.schedule.days[DAY].yosefGeves],
        [{ p_01: 3 }, undefined]);
    geves(d, DAY, 'p_01', 7);
    d.State.commit(d.call('setRimaCount', d.State.schedule, DAY, 'p_01', 0));
    same('and clearing Rima\'s leaves this list\'s', [d.State.schedule.days[DAY].rima, d.State.schedule.days[DAY].yosefGeves],
        [undefined, { p_01: 7 }]);
    const is = name => path => d.call(name, path);
    same('a path of one list is not a path of the other',
        [is('isRimaFieldPath')(`days.${DAY}.yosefGeves.p_01`), is('isYosefGevesFieldPath')(`days.${DAY}.rima.p_01`),
            is('isYosefGevesFieldPath')(`days.${DAY}.yosefGeves.p_01`)], [false, false, true]);
    same('and the sync layer knows both as counts, each by its layer',
        [d.call('siteCountLayerOf', `days.${DAY}.rima.p_01`), d.call('siteCountLayerOf', `days.${DAY}.yosefGeves.p_01`),
            d.call('siteCountLayerOf', `days.${DAY}.actual.w_01`), d.call('siteCountLayerOf', `days.${DAY}.yosefGeves`),
            d.call('siteCountLayerOf', `ledger.${DAY}.yosefGeves.p_01`)],
        ['rima', 'yosefGeves', null, null, null]);
    same('sameRimaLayers does not see this list, nor sameYosefGevesLayers Rima\'s',
        [d.call('sameRimaLayers', { days: { [DAY]: { yosefGeves: { p_01: 1 } } } }, { days: {} }),
            d.call('sameYosefGevesLayers', { days: { [DAY]: { rima: { p_01: 1 } } } }, { days: {} }),
            d.call('sameYosefGevesLayers', { days: { [DAY]: { yosefGeves: { p_01: 1 } } } }, { days: {} })],
        [true, true, false]);

    suite('a held count of one list does not hold the other list\'s count of that day');
    const cloud = makeCloud();
    const air = radio(cloud);
    const a = phone('d_two_a');
    const b = phone('d_two_b');
    a.Sync.connect(air.adapter);
    await settle(TICK * 10);
    b.Sync.connect(cloud.adapter);
    await settle(TICK * 10);
    geves(a, DAY, 'p_01', 3);
    await settleUntil(() => b.call('yosefGevesCount', b.State.schedule, DAY, 'p_01') === 3
        && a.Sync.pendingCount() === 0 && a.Sync._revision === cloud.doc.revision);
    given('both phones read 3 at one revision', b.call('yosefGevesCount', b.State.schedule, DAY, 'p_01') === 3
        && a.Sync._revision === cloud.doc.revision);
    air.down = true;
    geves(a, DAY, 'p_01', 4);
    a.State.commit(a.call('setRimaCount', a.State.schedule, DAY, 'p_02', 6));
    geves(a, DAY, 'p_03', 8);
    await settle(TICK * 10);
    geves(b, DAY, 'p_01', 0);
    await settleUntil(() => !Object.prototype.hasOwnProperty.call(cloudGeves(cloud, DAY) || {}, 'p_01')
        && b.Sync.pendingCount() === 0);
    air.up();
    await settleUntil(() => a.Sync.holdingContested() && (((cloud.doc.days[DAY] || {}).rima) || {}).p_02 === 6, 6000);
    await settle(TICK * 30);
    same('the correction is held, and this list\'s other count of that day with it - Rima\'s is not',
        a.Sync.heldRecords().map(row => row.path).sort(), [`days.${DAY}.yosefGeves.p_01`, `days.${DAY}.yosefGeves.p_03`]);
    same('Rima\'s count, typed in the same minute, went up', ((cloud.doc.days[DAY] || {}).rima || {}).p_02, 6);
    same('and the cloud holds nothing of this list for the day: the clear stands until a person decides',
        Object.keys(cloudGeves(cloud, DAY) || {}), []);
    a.Sync.stopListening(); a.Sync.disconnect();
    b.Sync.stopListening(); b.Sync.disconnect();
}

// ---------------------------------------------------------------- the WhatsApp message
//
// NO «עובדי יוסף גבס» IN IT, as there is no Rima in it: the day's message is the seder for
// his own crew. Measured as Rima's suite measures it - against what the same phone wrote
// before a count was typed, and against what v165, a build that knows neither list, writes
// for the same crew on its own bytes out of Git.
{
    suite('the WhatsApp message carries no «עובדי יוסף גבס» - every template, the whole day and each site');

    const d = phone('d_share');
    const say = (date, style, placeId) => d.call('dayMessage', date, 'actual', style, placeId);
    const STYLES = d.global('MESSAGE_STYLES').map(style => style.key);
    given('every template the app offers is measured - the owner\'s three', STYLES.join(' ') === 'pin crane morning',
        JSON.stringify(STYLES));
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
    geves(d, '2026-10-12', 'p_01', 3);
    geves(d, '2026-10-12', 'p_03', 2);
    geves(d, '2026-10-13', 'p_02', 4);
    geves(d, '2026-10-15', 'p_01', 1);
    given('the counts are on the record', d.call('yosefGevesReport', d.State.schedule, '2026-10-12', '2026-10-15').total === 10,
        JSON.stringify(d.State.schedule.days));
    const after = messages(d);
    given('every one of those messages was written',
        after.length === DATES.length * LAYERS.length * STYLES.length * SITES.length
            && after.every(([, text]) => typeof text === 'string' && text.length > 0), String(after.length));
    same('every one of them is byte for byte what it was before a count was typed',
        after.filter(([, text], i) => text !== before[i][1]).map(([key]) => key), []);
    same('not one carries the list\'s name, or the word גבס at all',
        after.filter(([, text]) => text.includes('גבס')).map(([key]) => key), []);
    same('word for word: the site, his man, the absentee line - and nothing after it', say('2026-10-12', 'pin'),
        '📅 סידור עבודה – יום שני 12/10/2026\n\n📍 ⁨הרצליה⁩\n• ⁨דוד לוי⁩\n\n🚫 נעדרים: אין');
    const NONE = 'אין שיבוצים ליום הזה.';
    const heading = (style, date) => d.global('MESSAGE_STYLES').find(item => item.key === style)
        .heading(d.call('parseLocalDate', date));
    same('a day with only the list\'s men says nobody of his is assigned, and nothing else - in every template',
        STYLES.map(style => say('2026-10-13', style)),
        STYLES.map(style => `${heading(style, '2026-10-13')}\n\n${NONE}`));

    const V165 = 'e34fb66e4beb19804f631257e0b29d4d9e32eda3';
    const show = file => execFileSync('git', ['-C', ROOT, 'show', `${V165}:${file}`],
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    let sources = [];
    try { sources = loadOrder().map(file => ({ file, code: show(file) })); } catch (error) { sources = []; }
    given('v165 is in this repository, with every file this build loads', sources.length === loadOrder().length,
        `${sources.length} of ${loadOrder().length}`);
    const stamp = (/const APP_VERSION = '([^']+)'/.exec(show('js/app.js')) || [])[1];
    given('the older build is v165 and knows neither list',
        stamp === 'v165' && !sources.some(source => /\brima\b|yosefGeves/i.test(source.code)), String(stamp));
    const old = makeDevice({ sources, appVersion: stamp, deviceId: 'd_share_v165' });
    old.setToday('2026-10-20');
    old.State.schedule.workers = WORKERS();
    old.State.schedule.places = PLACES();
    old.State.save({ silent: true });
    crew(old);
    const older = messages(old);
    same('and every one of them is what v165 writes for the same crew',
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
    geves(a, DAY, 'p_01', 3);
    await settleUntil(() => (cloudGeves(cloud, DAY) || {}).p_01 === 3 && b.Sync._revision === cloud.doc.revision);
    given('both phones read 3 at the same revision', b.call('yosefGevesCount', b.State.schedule, DAY, 'p_01') === 3);
    gate.close();
    geves(a, DAY, 'p_01', 4);
    await settleUntil(() => (cloudGeves(cloud, DAY) || {}).p_01 === 4);
    geves(b, DAY, 'p_01', 5);
    b.Sync.flush();
    await settleUntil(() => b.Sync.status === 'contested');
    given('the second phone lost the race and holds', b.Sync.holdingContested() === true, b.Sync.status);
    gate.release();
    await settleUntil(() => b.Sync._revision === cloud.doc.revision);
    await settle(TICK * 20);
    const rows = b.Sync.heldRecords();
    same('one row, on the Yosef Geves path', rows.map(row => row.path), [`days.${DAY}.yosefGeves.p_01`]);
    const said = b.call('describeHeldRecord', rows[0], b.State.schedule);
    same('titled with the day, יוסף גבס and the site - not a man', said.title, 'יום שני 12/10 · יוסף גבס · ⁨הרצליה⁩');
    same('each side is the number it says', [said.mine, said.cloud], ['5', '4']);
    check('and a decision is offered', said.kind === 'yosefGeves' && said.decidable === true && said.takeable === true,
        JSON.stringify(said));
    check('the cloud still says 4: listing it sent nothing', (cloudGeves(cloud, DAY) || {}).p_01 === 4);

    b.ctx.askConfirm = () => Promise.resolve(true);
    const took = await b.call('resolveHeldRecord', rows[0], true);
    check('taking the cloud\'s count commits it', took === true, String(took));
    await settleUntil(() => b.Sync.heldRecords().length === 0 && b.Sync.pendingCount() === 0, 8000);
    same('the phone now says 4, like the cloud', [b.call('yosefGevesCount', b.State.schedule, DAY, 'p_01'), (cloudGeves(cloud, DAY) || {}).p_01], [4, 4]);
    check('and nothing is held any more', b.Sync.holdingContested() === false);
    a.Sync.stopListening(); a.Sync.disconnect();
    b.Sync.stopListening(); b.Sync.disconnect();
}

// ---------------------------------------------------------------- the kept ring
//
// The bounded ring (KEPT_PREFIX, js/sync/sync.js) lays a collected field back over a disk
// that holds NOTHING there, because that nothing is what an older build's copy looks
// like. A Yosef Geves clear is exactly that nothing - setYosefGevesCount deletes the field, and so does
// the snapshot carrying another phone's clear - so a count this phone sent and another
// phone then cleared came back at every open with no signal: on the field, on every Yosef Geves
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
    const PATH = `days.${DAY}.yosefGeves.p_01`;
    const count = device => device.call('yosefGevesCount', device.State.schedule, DAY, 'p_01');
    const kept = device => Object.keys(device.dump()).filter(key => key.startsWith('farkad:kept:')).sort();
    // Collected: the cloud has it, and the operation's own bytes are off this disk.
    const drained = device => device.Sync.pendingCount() === 0
        && !Object.keys(device.dump()).some(key => key.includes(':op:'));

    geves(a, DAY, 'p_01', 3);
    await settleUntil(() => (cloudGeves(cloud, DAY) || {}).p_01 === 3 && drained(a));
    work(a, DAY, 'w_01', 'p_01');
    await settleUntil(() => Boolean(((cloud.doc.days[DAY] || {}).actual || {}).w_01) && drained(a));
    given('the count and a worker-day reached the cloud and were collected off this phone',
        drained(a) && (cloudGeves(cloud, DAY) || {}).p_01 === 3, JSON.stringify(Object.keys(a.dump())));
    same('the ring keeps the worker-day and not the count: a count takes no slot from a pay record',
        kept(a), [`farkad:kept:days.${DAY}.actual.w_01`]);
    check('and the ring is not short of the worker-day it exists for', a.Sync.keptIncomplete() === false);

    geves(b, DAY, 'p_01', 0);
    await settleUntil(() => !Object.prototype.hasOwnProperty.call(cloudGeves(cloud, DAY) || {}, 'p_01')
        && count(a) === 0 && a.Sync.status === 'synced');
    given('this phone adopted the other phone\'s clear', count(a) === 0 && a.Sync.status === 'synced',
        a.Sync.status);
    // The day as this phone holds it after the clear: the worker-day, and no count.
    const adopted = a.call('canonicalJson', a.State.schedule.days[DAY]);
    a.Sync.stopListening(); a.Sync.disconnect();
    const cleared = a.dump();

    const offline = reopen('d_ka', cleared);
    same('opened with no signal, the field shows the clear', count(offline), 0);
    same('and so does the Yosef Geves table',
        offline.call('yosefGevesReport', offline.State.schedule, '2026-10-01', '2026-10-31').total, 0);
    check('nothing claims an older build replaced the record', offline.State.recordWasReplaced === false,
        JSON.stringify(offline.State.recovered));
    same('the day is exactly as this phone adopted it, the worker-day in it',
        [Boolean(((offline.State.schedule.days[DAY] || {}).actual || {}).w_01),
            offline.call('canonicalJson', offline.State.schedule.days[DAY])], [true, adopted]);
    same('a correction to 2 commits', geves(offline, DAY, 'p_01', 2), true);
    same('and nothing is held against this phone\'s own disk',
        offline.Sync.heldRecords().map(row => row.path), []);
    same('the field says 2', count(offline), 2);
    offline.Sync.connect(cloud.adapter);
    await settleUntil(() => (cloudGeves(cloud, DAY) || {}).p_01 === 2 && count(b) === 2
        && offline.Sync.pendingCount() === 0 && offline.Sync.status === 'synced', 4000);
    same('with signal back, the correction reaches the cloud and the other phone',
        [(cloudGeves(cloud, DAY) || {}).p_01, count(b), offline.Sync.status], [2, 2, 'synced']);
    offline.Sync.stopListening(); offline.Sync.disconnect();

    suite('a Yosef Geves entry already in the ring is not laid back over the disk either');
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
    same('a correction commits', geves(ringed, DAY, 'p_01', 2), true);
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
// while every clear was a placeholder value. A Yosef Geves clear is an absence: a stale offline
// count walked over the other phone's clear, a moved count was counted twice, and both
// phones said synced.
{
    const DAY = '2026-10-15';
    const PATH = `days.${DAY}.yosefGeves.p_01`;
    const has = (map, key) => Object.prototype.hasOwnProperty.call(map || {}, key);
    const count = (device, placeId) => device.call('yosefGevesCount', device.State.schedule, DAY, placeId);
    const cloudDay = cloud => ((((cloud.doc || {}).days || {})[DAY]) || {});
    const counts = cloud => Object.keys(cloudDay(cloud).yosefGeves || {}).sort()
        .map(placeId => [placeId, cloudDay(cloud).yosefGeves[placeId]]);
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
        geves(a, DAY, 'p_01', 3);
        await settleUntil(() => count(b, 'p_01') === 3);
        need('the other phone heard the 3', count(b, 'p_01') === 3, String(count(b, 'p_01')));
    };

    for (const [index, order] of ORDERS.entries()) {
        suite(`a count changed offline while the other phone cleared it is held (${order})`);
        const race = await evening(`rc${index}`, order, {
            before: seenThree,
            offline: a => geves(a, DAY, 'p_01', 4),
            online: b => geves(b, DAY, 'p_01', 0),
            landed: cloud => !has(cloudDay(cloud).yosefGeves, 'p_01')
        });
        given('both phones began at one record, and the other phone\'s clear landed while this one was away',
            race.ready, race.missed);
        check('this phone\'s stale 4 is held for a person, not sent over the clear',
            race.a.Sync.holdingContested() === true, race.a.Sync.status);
        check('the cloud stays cleared', !has(cloudDay(race.cloud).yosefGeves, 'p_01'),
            JSON.stringify(cloudDay(race.cloud).yosefGeves));
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
                [count(race.a, 'p_01'), count(race.b, 'p_01'), has(cloudDay(race.cloud).yosefGeves, 'p_01'),
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
            offline: a => geves(a, DAY, 'p_01', 4),
            online: b => { geves(b, DAY, 'p_01', 0); geves(b, DAY, 'p_02', 3); },
            landed: cloud => (cloudDay(cloud).yosefGeves || {}).p_02 === 3 && !has(cloudDay(cloud).yosefGeves, 'p_01')
        });
        given('both phones began at one record, and the other phone\'s move landed', moved.ready, moved.missed);
        check('the correction of the old site is held', moved.a.Sync.holdingContested() === true,
            moved.a.Sync.status);
        same('the cloud holds the move and only the move', counts(moved.cloud), [['p_02', 3]]);
        same('so the other phone\'s Yosef Geves table counts three men, not seven',
            moved.b.call('yosefGevesReport', moved.b.State.schedule, '2026-10-01', '2026-10-31').total, 3);
        same('and the held row is the old site\'s', moved.a.Sync.heldRecords().map(row => row.path), [PATH]);

        // THE PHONE HOLDING THE CORRECTION bills what its own copy says: its 4 at the old
        // site and the 3 the snapshot put at the new one. A hold names one path, and a move
        // is two, so the row in ⋯ said «4 against nothing» and nothing of the 3 now at Tel
        // Aviv - keeping it, unwarned, billed the same men at both sites on every phone. The
        // day's other sites are drawn under the row now, on both sides, in its own words, so
        // what this phone bills while it waits is the row the person is asked about.
        const billedHere = moved.a.call('yosefGevesReport', moved.a.State.schedule, '2026-10-01', '2026-10-31');
        same('while it is held, this phone lists its own 4 and the moved 3',
            [billedHere.countAt('p_01', DAY), billedHere.countAt('p_02', DAY), billedHere.total], [4, 3, 7]);
        vm.runInContext(SETTINGS, moved.a.ctx, { filename: 'js/ui/settings.js' });
        moved.a.ctx.askConfirm = () => Promise.resolve(true);
        const [MINE, CLOUD, NOTHING] = ['HELD_MINE', 'HELD_CLOUD', 'HELD_NOTHING'].map(name => moved.a.global(name));
        const { box, document } = panelDocument();
        moved.a.ctx.document = document;
        moved.a.call('renderHeldRecords');
        const drawn = heldCards(box);
        same('the row in ⋯ is the old site, mine against nothing',
            drawn.map(card => [bareText(card.title), card.sides]),
            [['יום חמישי 15/10 · יוסף גבס · הרצליה', [`${MINE} 4`, `${CLOUD} ${NOTHING}`]]]);
        same('and under it the site the count went to, on both sides',
            drawn.map(card => card.context.map(lines => [bareText(lines[0]), ...lines.slice(1)])),
            [[['יום חמישי 15/10 · יוסף גבס · תל אביב', `${MINE} 3`, `${CLOUD} 3`]]]);
        // Decided by pressing the drawn button, as the person does.
        const take = index === 1;
        const label = moved.a.global(take ? 'HELD_TAKE' : 'HELD_KEEP');
        const press = drawn.length ? drawn[0].buttons.find(node => node.textContent === label) : null;
        check(take ? 'the row offers to take the cloud\'s side' : 'the row offers to keep this phone\'s side',
            Boolean(press), JSON.stringify(drawn.length ? drawn[0].buttons.map(node => node.textContent) : []));
        if (press) press.press();
        await settleUntil(() => moved.a.Sync.heldRecords().length === 0 && moved.a.Sync.pendingCount() === 0
            && moved.a.Sync.status === 'synced' && moved.b.call('yosefGevesReport', moved.b.State.schedule,
                '2026-10-01', '2026-10-31').total === (take ? 3 : 7), 4000);
        same(take ? 'taken: three men, once, at the new site, on both phones'
            : 'kept, the person having seen both sites: both counts stand, on both phones',
        [counts(moved.cloud), [moved.a, moved.b].map(device =>
            device.call('yosefGevesReport', device.State.schedule, '2026-10-01', '2026-10-31').total), moved.a.Sync.status],
        [take ? [['p_02', 3]] : [['p_01', 4], ['p_02', 3]], take ? [3, 3] : [7, 7], 'synced']);
        done(moved);

        suite(`no hold where nobody else touched what this phone wrote (${order})`);
        const fresh = await evening(`nf${index}a`, order, {
            offline: a => geves(a, DAY, 'p_01', 3)
        });
        given('both phones began at one record', fresh.ready, fresh.missed);
        same('a new count recorded offline goes up',
            [counts(fresh.cloud), fresh.a.Sync.status, fresh.a.Sync.heldRecords().length],
            [[['p_01', 3]], 'synced', 0]);
        done(fresh);

        const later = await evening(`nf${index}b`, order, {
            before: async (a, b, cloud, need) => {
                await seenThree(a, b, cloud, need);
                geves(b, DAY, 'p_01', 0);
                await settleUntil(() => count(a, 'p_01') === 0 && !has(cloudDay(cloud).yosefGeves, 'p_01'));
                need('this phone heard the clear before it lost signal',
                    count(a, 'p_01') === 0 && !has(cloudDay(cloud).yosefGeves, 'p_01'), String(count(a, 'p_01')));
            },
            offline: a => geves(a, DAY, 'p_01', 5)
        });
        given('both phones began at one record, after this phone heard the clear', later.ready, later.missed);
        same('a count set after this phone heard the clear goes up',
            [counts(later.cloud), later.a.Sync.status, later.a.Sync.heldRecords().length],
            [[['p_01', 5]], 'synced', 0]);
        done(later);

        const two = await evening(`nf${index}c`, order, {
            offline: a => geves(a, DAY, 'p_01', 3),
            online: b => geves(b, DAY, 'p_02', 2),
            landed: cloud => (cloudDay(cloud).yosefGeves || {}).p_02 === 2
        });
        given('both phones began at one record, and the other phone\'s count for its own site landed',
            two.ready, two.missed);
        same('two sites typed on two phones the same evening are both kept',
            [counts(two.cloud), two.a.Sync.status, two.a.Sync.heldRecords().length],
            [[['p_01', 3], ['p_02', 2]], 'synced', 0]);
        done(two);

        const own = await evening(`nf${index}d`, order, {
            before: seenThree,
            offline: a => geves(a, DAY, 'p_01', 0)
        });
        given('both phones began at one record', own.ready, own.missed);
        same('this phone\'s own clear, made offline, goes up',
            [has(cloudDay(own.cloud).yosefGeves, 'p_01'), own.a.Sync.status, own.a.Sync.heldRecords().length],
            [false, 'synced', 0]);
        done(own);

        const both = await evening(`nf${index}e`, order, {
            before: seenThree,
            offline: a => geves(a, DAY, 'p_01', 0),
            online: b => geves(b, DAY, 'p_01', 0),
            landed: cloud => !has(cloudDay(cloud).yosefGeves, 'p_01')
        });
        given('both phones began at one record, and the other phone\'s clear landed', both.ready, both.missed);
        same('both phones clearing the same count is one fact, not a conflict',
            [has(cloudDay(both.cloud).yosefGeves, 'p_01'), both.a.Sync.status, both.a.Sync.heldRecords().length],
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
    const PATH = `days.${DAY}.yosefGeves.p_01`;
    const has = (map, key) => Object.prototype.hasOwnProperty.call(map || {}, key);
    const count = (device, placeId) => device.call('yosefGevesCount', device.State.schedule, DAY, placeId);
    const cloudDay = cloud => ((((cloud.doc || {}).days || {})[DAY]) || {});
    const counts = cloud => Object.keys(cloudDay(cloud).yosefGeves || {}).sort()
        .map(placeId => [placeId, cloudDay(cloud).yosefGeves[placeId]]);
    // What a phone's own «עובדי יוסף גבס» table says of the day: the old site, the new
    // site, the total. (Rima's suite reads the invoice here; this list is on no invoice,
    // so its table is the only place a count moved twice would show.)
    const billed = device => {
        const table = device.call('yosefGevesReport', device.State.schedule, '2026-10-01', '2026-10-31');
        return [table.countAt('p_01', DAY), table.countAt('p_02', DAY), table.total];
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
        else geves(a, DAY, 'p_01', 3);
        const heardIt = () => (steps.heard ? steps.heard(b) : count(b, 'p_01') === 3);
        if (steps.refuse) {
            await settleUntil(() => air.lost === 1);
            need('the first attempt was refused before it landed', air.lost === 1 && !has(cloudDay(cloud).yosefGeves, 'p_01'),
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
    const clear = { online: b => geves(b, DAY, 'p_01', 0), landed: cloud => !has(cloudDay(cloud).yosefGeves, 'p_01') };
    const move = {
        online: b => { geves(b, DAY, 'p_01', 0); geves(b, DAY, 'p_02', 3); },
        landed: cloud => (cloudDay(cloud).yosefGeves || {}).p_02 === 3 && !has(cloudDay(cloud).yosefGeves, 'p_01')
    };

    for (const [t, trigger] of TRIGGERS.entries()) {
        for (const [o, order] of RETURNS.entries()) {
            suite(`a count whose first write ${trigger}, corrected offline over the other phone's clear: held (${order})`);
            const race = await lostEvening(`la${t}${o}`, trigger, order,
                Object.assign({ offline: a => geves(a, DAY, 'p_01', 4) }, clear));
            given('the count landed, the other phone cleared it while this one was away', race.ready, race.missed);
            check('this phone\'s 4 is held for a person, not sent over the clear',
                race.a.Sync.holdingContested() === true, race.a.Sync.status);
            same('the cloud stays cleared, and the other phone with it',
                [has(cloudDay(race.cloud).yosefGeves, 'p_01'), count(race.b, 'p_01'), race.b.Sync.status],
                [false, 0, 'synced']);
            same('the held row is the count, mine against nothing',
                race.a.Sync.heldRecords().map(row => [row.path, row.mine,
                    row.cloud === undefined ? null : row.cloud]), [[PATH, 4, null]]);
            done(race);

            suite(`a count whose first write ${trigger}, corrected offline while the other phone moved it: held (${order})`);
            const moved = await lostEvening(`lm${t}${o}`, trigger, order,
                Object.assign({ offline: a => geves(a, DAY, 'p_01', 4) }, move));
            given('the count landed, the other phone moved it while this one was away', moved.ready, moved.missed);
            check('the correction of the old site is held', moved.a.Sync.holdingContested() === true,
                moved.a.Sync.status);
            same('the cloud holds the move and only the move', counts(moved.cloud), [['p_02', 3]]);
            same('the other phone lists three men, once',
                billed(moved.b), [0, 3, 3]);
            done(moved);

            suite(`a count whose first write ${trigger}, then an unrelated day recorded offline (${order})`);
            const beside = await lostEvening(`lb${t}${o}`, trigger, order,
                Object.assign({ offline: a => work(a, '2026-10-16', 'w_02', 'p_03') }, clear));
            given('the count landed, the other phone cleared it while this one was away',
                beside.ready, beside.missed);
            check('the cleared count does not come back', !has(cloudDay(beside.cloud).yosefGeves, 'p_01'),
                JSON.stringify(cloudDay(beside.cloud).yosefGeves));
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
                [[['p_02', 3]], [0, 3, 3], [0, 3, 3]]);
            done(besideMove);

            suite(`no hold where nobody touched the count whose first write ${trigger} (${order})`);
            const alone = await lostEvening(`ln${t}${o}`, trigger, order, { offline: a => geves(a, DAY, 'p_01', 4) });
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
                geves(a, DAY, 'p_02', 2);
                geves(a, DAY, 'p_03', 1);
            },
            later: async a => {
                await settle(TICK * 20);
                geves(a, DAY, 'p_03', 6);
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
            { refuse: true, offline: a => { geves(a, DAY, 'p_01', 4); geves(a, DAY, 'p_01', 5); } });
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
            Object.assign({ offline: a => geves(a, DAY, 'p_01', 4) }, clear));
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
            offline: a => { geves(a, DAY, 'p_01', 0); geves(a, DAY, 'p_02', 3); },
            online: b => geves(b, DAY, 'p_01', 4),
            landed: cloud => (cloudDay(cloud).yosefGeves || {}).p_01 === 4
        });
        given('the count was heard by both, and the other phone\'s correction landed', mirror.ready, mirror.missed);
        same('both halves of the move are held, the new site with the old',
            [mirror.a.Sync.holdingContested(), mirror.a.Sync.heldRecords().map(row => row.path)],
            [true, [PATH, `days.${DAY}.yosefGeves.p_02`]]);
        same('the cloud holds the correction and nothing of the move', counts(mirror.cloud), [['p_01', 4]]);
        same('so the other phone bills its four, once, and says so honestly',
            [billed(mirror.b), mirror.b.Sync.status], [[4, 0, 4], 'synced']);
        vm.runInContext(SETTINGS, mirror.a.ctx, { filename: 'js/ui/settings.js' });
        mirror.a.ctx.askConfirm = () => Promise.resolve(true);
        const [MINE, CLOUD, NOTHING] = ['HELD_MINE', 'HELD_CLOUD', 'HELD_NOTHING'].map(name => mirror.a.global(name));
        const { box, document } = panelDocument();
        mirror.a.ctx.document = document;
        mirror.a.call('renderHeldRecords');
        same('each row in ⋯ shows the day\'s other site, both sides',
            heldCards(box).map(card => [bareText(card.title), card.sides,
                card.context.map(lines => [bareText(lines[0]), ...lines.slice(1)])]),
            [['יום חמישי 15/10 · יוסף גבס · הרצליה', [`${MINE} ${NOTHING}`, `${CLOUD} 4`],
                [['יום חמישי 15/10 · יוסף גבס · תל אביב', `${MINE} 3`, `${CLOUD} ${NOTHING}`]]],
            ['יום חמישי 15/10 · יוסף גבס · תל אביב', [`${MINE} 3`, `${CLOUD} ${NOTHING}`],
                [['יום חמישי 15/10 · יוסף גבס · הרצליה', `${MINE} ${NOTHING}`, `${CLOUD} 4`]]]]);
        // Decided one row at a time, as a person does: the first answer is not held again
        // for the second row still waiting on the same day.
        const take = o !== 1;
        for (const path of [PATH, `days.${DAY}.yosefGeves.p_02`]) {
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
        take ? [[['p_01', 4]], [4, 0, 4], [4, 0, 4], 'synced']
            : [[['p_02', 3]], [0, 3, 3], [0, 3, 3], 'synced']);
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
        const PATH2 = `days.${DAY2}.yosefGeves.p_03`;
        const count2 = device => device.call('yosefGevesCount', device.State.schedule, DAY2, 'p_03');
        const cloudDay2 = cloud => ((((cloud.doc || {}).days || {})[DAY2]) || {});
        const first = a => { geves(a, DAY, 'p_01', 3); geves(a, DAY2, 'p_03', 2); };
        const heard = b => count(b, 'p_01') === 3 && count2(b) === 2;
        const VARIANTS = [
            ['records a site the other phone also recorded', {
                online: b => { geves(b, DAY2, 'p_03', 0); geves(b, DAY, 'p_03', 1); },
                landed: cloud => !has(cloudDay2(cloud).yosefGeves, 'p_03')
                    && (cloudDay(cloud).yosefGeves || {}).p_03 === 1,
                offline: a => geves(a, DAY, 'p_03', 5),
                stands: [['p_01', 3], ['p_03', 1]]
            }],
            ['records the site the other phone moved the first count to', {
                online: b => { geves(b, DAY2, 'p_03', 0); geves(b, DAY, 'p_01', 0); geves(b, DAY, 'p_02', 3); },
                landed: cloud => !has(cloudDay2(cloud).yosefGeves, 'p_03')
                    && (cloudDay(cloud).yosefGeves || {}).p_02 === 3 && !has(cloudDay(cloud).yosefGeves, 'p_01'),
                offline: a => geves(a, DAY, 'p_02', 1),
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
                        [has(cloudDay2(split.cloud).yosefGeves, 'p_03'), count2(split.b), split.b.Sync.status],
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
            offline: a => { geves(a, DAY, 'p_01', 0); geves(a, DAY, 'p_02', 3); },
            online: b => { geves(b, DAY, 'p_01', 0); geves(b, DAY, 'p_02', 4); },
            landed: cloud => (cloudDay(cloud).yosefGeves || {}).p_02 === 4 && !has(cloudDay(cloud).yosefGeves, 'p_01')
        });
        given('the count was heard by both, and the other phone\'s move landed', both.ready, both.missed);
        same('the one site the phones disagree on is held, and nothing else',
            both.a.Sync.heldRecords().map(row => [row.path, row.mine, row.cloud === undefined ? null : row.cloud]),
            [[`days.${DAY}.yosefGeves.p_02`, 3, 4]]);
        vm.runInContext(SETTINGS, both.a.ctx, { filename: 'js/ui/settings.js' });
        both.a.ctx.askConfirm = () => Promise.resolve(true);
        const row = both.a.Sync.heldRecords().find(item => item.path === `days.${DAY}.yosefGeves.p_02`);
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
        Object.assign({ offline: a => geves(a, DAY, 'p_01', 4), keepMuted: true }, clear));
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
    geves(b, DAY, 'p_02', 2);
    await settleUntil(() => b.Sync.pendingCount() === 0);
    const air = radio(cloud);
    air.down = true;
    const a = phone('d_fresh_a');
    a.Sync.connect(air.adapter);
    await settle(TICK * 10);
    geves(a, DAY, 'p_01', 3);
    await settle(TICK * 20);
    geves(a, DAY, 'p_01', 4);
    await settle(TICK * 20);
    given('this phone was never told a revision, and its attempts went the cutover road',
        a.Sync._revision === null && air.calls.indexOf('bootstrap') !== -1 && air.calls.indexOf('update') === -1,
        JSON.stringify([a.Sync._revision, air.calls.slice(0, 6)]));
    air.up();
    a.Sync._retryAt = 0;
    a.Sync.flush();
    await settleUntil(() => (a.Sync.pendingCount() === 0 && a.Sync.status === 'synced')
        || a.Sync.holdingContested(), 6000);
    await settleUntil(() => b.call('yosefGevesCount', b.State.schedule, DAY, 'p_01') === 4, 3000);
    same('the correction goes up and nothing is held',
        [Object.entries(cloudGeves(cloud, DAY) || {}).sort(), a.Sync.status, a.Sync.heldRecords().length,
            b.call('yosefGevesCount', b.State.schedule, DAY, 'p_01')],
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
    const PATH = `days.${DAY}.yosefGeves.p_01`;
    const count = device => device.call('yosefGevesCount', device.State.schedule, DAY, 'p_01');
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
    geves(a, DAY, 'p_01', 3);
    await settleUntil(() => (cloudGeves(cloud, DAY) || {}).p_01 === 3 && b.Sync._revision === cloud.doc.revision);
    gate.close();
    geves(a, DAY, 'p_01', 4);
    await settleUntil(() => (cloudGeves(cloud, DAY) || {}).p_01 === 4);
    geves(b, DAY, 'p_01', 5);
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
            ['a count at another site', () => geves(b, '2026-10-13', 'p_02', 2)],
            ['a count on a third site', () => geves(b, '2026-10-13', 'p_03', 1)],
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
        // out of the Yosef Geves table, until somebody decided it or the other phone wrote. And only
        // that site on that day: a lost count beside it, or at the same site on another day,
        // comes back as it always did.
        geves(b, DAY, 'p_02', 2);
        geves(b, '2026-10-14', 'p_01', 6);
        await settleUntil(() => (cloudGeves(cloud, DAY) || {}).p_02 === 2
            && (cloudGeves(cloud, '2026-10-14') || {}).p_01 === 6 && b.Sync._revision === cloud.doc.revision, 4000);
        await settle(TICK * 20);
        given('this phone wrote last, its own stamps on the cloud\'s copy, the hold still standing',
            cloud.doc.updatedBy === b.id && cloud.doc.updatedAt === b.State.schedule.updatedAt
                && b.Sync.heldRecords().length === 1, JSON.stringify([cloud.doc.updatedBy, b.Sync.heldRecords().length]));
        for (const [what, date, site, want] of [['the held count itself', DAY, 'p_01', 5],
            ['another site on the held day', DAY, 'p_02', 2], ['the held site on another day', '2026-10-14', 'p_01', 6]]) {
            const disk = b.dump();
            const record = JSON.parse(disk['scheduleData:v2']);
            delete record.days[date].yosefGeves[site];
            const lost = reopen(b.id, Object.assign({}, disk, { 'scheduleData:v2': JSON.stringify(record) }));
            given(`${what}: opened again, this copy has lost it`,
                lost.call('yosefGevesCount', lost.State.schedule, date, site) === 0, JSON.stringify(lost.State.schedule.days[date]));
            lost.Sync.connect(cloud.adapter);
            await settleUntil(() => lost.call('yosefGevesCount', lost.State.schedule, date, site) === want, 3000);
            await settle(TICK * 20);
            same(`${what}: back on the screen at the first snapshot, the hold where it was`,
                [lost.call('yosefGevesCount', lost.State.schedule, date, site), lost.Sync.status,
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
    const writer = b.ctx.setYosefGevesCount;
    given('the Yosef Geves writer can be watched', typeof writer === 'function');
    b.ctx.setYosefGevesCount = (schedule, date, placeId, value) => {
        wrote.push([date, placeId, value]);
        return writer(schedule, date, placeId, value);
    };
    b.ctx.askConfirm = () => Promise.resolve(true);
    const press = card ? card.buttons.find(node => node.textContent === (takeCloud ? TAKE : KEEP)) : null;
    if (press) press.press();
    const want = takeCloud ? 4 : 5;
    await settleUntil(() => b.Sync.heldRecords().length === 0 && b.Sync.pendingCount() === 0
        && (cloudGeves(cloud, DAY) || {}).p_01 === want && count(a) === want, 8000);
    same('the button wrote the count through the Yosef Geves writer, once', wrote, [[DAY, 'p_01', want]]);
    same(`this phone, the other phone and the cloud all say ${want}`,
        [count(b), count(a), (cloudGeves(cloud, DAY) || {}).p_01], [want, want, want]);
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
        [again.Sync.heldRecords().length, again.Sync.status, count(again), (cloudGeves(cloud, DAY) || {}).p_01],
        [0, 'synced', want, want]);
    again.Sync.stopListening(); again.Sync.disconnect();
    a.Sync.stopListening(); a.Sync.disconnect();
}

// ---------------------------------------------------------------- the phones not yet updated
//
// v180 is the build before this one and v179 the one served before it; both know Rima and
// neither knows `yosefGeves`. v165 is the last build from before Rima, and knows neither.
// Each is run here on its own bytes out of Git, beside this build, on one cloud.
const git = args => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
const OLDER = [
    ['v165', 'e34fb66e4beb19804f631257e0b29d4d9e32eda3'],
    ['v179', '17788f8e1e5e78be8f105769624f97e7fe051886'],
    ['v180', 'd3103d622677726de133526b4411e00aedc14a3b']
];

for (const [name, sha] of OLDER) {
    suite(`${name}, adopting a document with Yosef Geves on it, does not take it off the cloud`);

    let present = false;
    try { present = git(['cat-file', '-t', sha]).toString().trim() === 'commit'; } catch (error) { present = false; }
    given(`the ${name} commit is in this repository`, present, sha);
    const files = loadOrder().filter(file => {
        try { git(['cat-file', '-e', `${sha}:${file}`]); return true; } catch (error) { return false; }
    });
    given(`${name} has every file this build loads`, files.length === loadOrder().length,
        `${files.length} of ${loadOrder().length}`);
    const sources = files.map(file => ({ file, code: git(['show', `${sha}:${file}`]).toString('utf8') }));
    const stamp = (/const APP_VERSION = '([^']+)'/.exec(git(['show', `${sha}:js/app.js`]).toString('utf8')) || [])[1];
    given(`the older build names itself ${name}`, stamp === name, String(stamp));
    check(`${name} really does not know the layer`, !sources.some(source => /yosefGeves/.test(source.code)));

    const cloud = makeCloud();
    const now = phone(`d_now_${name}`);
    now.State.schedule.workers.push({ id: 'w_typo', name: 'שם בטעות', active: true, dailyRate: 0, hourlyRate: 0 });
    now.State.commitRoster();
    now.Sync.connect(cloud.adapter);
    await settle(TICK * 10);
    work(now, '2026-10-12', 'w_01', 'p_01');
    geves(now, '2026-10-12', 'p_01', 3);
    geves(now, '2026-10-13', 'p_02', 5);
    // An empty placeholder for the accidental name on the count-only day - the one thing an
    // older build is allowed to remove from a day.
    now.State.commit(now.call('clearWorkerDay', now.State.schedule, '2026-10-13', 'w_typo', 'actual'));
    await settleUntil(() => (cloudGeves(cloud, '2026-10-13') || {}).p_02 === 5
        && Boolean((((cloud.doc.days || {})['2026-10-13'] || {}).actual || {}).w_typo));
    given('the cloud holds both counts and the placeholder', JSON.stringify([cloudGeves(cloud, '2026-10-12'),
        cloudGeves(cloud, '2026-10-13')]) === JSON.stringify([{ p_01: 3 }, { p_02: 5 }]),
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
        old.State.schedule.days['2026-10-12'].yosefGeves === undefined);

    // An ordinary evening on the older phone: work on both days, one of them count-only.
    old.State.commit(old.call('assignPlace', old.State.schedule, '2026-10-12', 'w_02', 'actual', 'p_01'));
    old.State.commit(old.call('assignPlace', old.State.schedule, '2026-10-13', 'w_01', 'actual', 'p_02'));
    await settleUntil(() => Boolean(((cloud.doc.days['2026-10-13'] || {}).actual || {}).w_01));
    given(`${name}'s edits landed`, Boolean(cloud.doc.days['2026-10-13'].actual.w_01)
        && Boolean(cloud.doc.days['2026-10-12'].actual.w_02));
    same(`after ${name}'s edits the cloud still holds both counts`,
        [cloudGeves(cloud, '2026-10-12'), cloudGeves(cloud, '2026-10-13')], [{ p_01: 3 }, { p_02: 5 }]);

    // And the deletion of an unused name, which removes its empty placeholder from the
    // count-only day in the same transaction.
    given(`${name} may delete the accidental name`, old.call('deletionBlockers', 'w_typo').length === 0,
        JSON.stringify(old.call('deletionBlockers', 'w_typo')));
    await old.call('deleteWorker', 'w_typo');
    await settleUntil(() => !Object.prototype.hasOwnProperty.call(cloud.doc.days['2026-10-13'].actual, 'w_typo'));
    check(`${name}'s deletion took the placeholder off the cloud`,
        !Object.prototype.hasOwnProperty.call(cloud.doc.days['2026-10-13'].actual, 'w_typo'));
    same('and left the Yosef Geves count on that day where it was', cloudGeves(cloud, '2026-10-13'), { p_02: 5 });

    await settleUntil(() => Boolean(((now.State.schedule.days['2026-10-13'] || {}).actual || {}).w_01)
        && !now.State.worker('w_typo'));
    same(`this build, after adopting ${name}'s writes, still has both counts`,
        [now.call('yosefGevesCount', now.State.schedule, '2026-10-12', 'p_01'),
            now.call('yosefGevesCount', now.State.schedule, '2026-10-13', 'p_02')], [3, 5]);
    same('and every phone is writing', [now.call('farkadWritesBlocked'), old.call('farkadWritesBlocked')], [false, false]);

    suite(`${name}, handed this build's record to restore, refuses it out loud`);
    const offered = old.call('readReplacementDocument', JSON.parse(JSON.stringify(now.call('cloudDocument', now.State.schedule))));
    check(`${name} does not restore a v183 record without its counts - it refuses it`,
        offered.document === null && offered.problems.some(problem => problem.includes('yosefGeves')),
        JSON.stringify(offered.problems));
    same(`in ${name}'s own words: an unknown layer, named`, offered.problems,
        ['ליום 2026-10-12 יש שכבה שאינה מוכרת: yosefGeves.', 'ליום 2026-10-13 יש שכבה שאינה מוכרת: yosefGeves.']);

    // THE ROLLOUT RULE'S REASON, MEASURED. The older phone's own copy has no counts (above),
    // so anything it restores from - a restore point it wrote, its backup file, a cloud copy
    // it wrote - has none either; and a restore is the one whole-document write there is.
    suite(`${name}, restoring a restore point of its own, erases every count for every phone`);
    const point = JSON.stringify(old.State.schedule);
    given(`${name}'s restore point is its own copy: the worker-days, and no count`,
        !point.includes('yosefGeves') && point.includes('"w_02"'), point.slice(0, 200));
    old.Store.set('scheduleData:snap:2026-10-19', point);
    const oldSaid = [];
    old.ctx.askConfirm = () => Promise.resolve(true);
    old.ctx.askTell = message => { oldSaid.push(typeof message === 'string' ? message : String(message.message || '')); return Promise.resolve(); };
    await old.call('restoreSnapshot', '2026-10-19');
    await settleUntil(() => cloudGeves(cloud, '2026-10-12') === undefined && cloudGeves(cloud, '2026-10-13') === undefined
        && now.call('yosefGevesCount', now.State.schedule, '2026-10-12', 'p_01') === 0, 8000);
    same(`the cloud has lost both counts to ${name}'s restore`,
        [cloudGeves(cloud, '2026-10-12'), cloudGeves(cloud, '2026-10-13')], [undefined, undefined]);
    same('and so has this build, on a phone that never restored anything',
        [now.call('yosefGevesCount', now.State.schedule, '2026-10-12', 'p_01'),
            now.call('yosefGevesCount', now.State.schedule, '2026-10-13', 'p_02')], [0, 0]);
    same(`${name} said only that it restored`, oldSaid.slice(-1), ['שוחזר.']);
    check('the worker-days survived it: only the layer the older build never kept is gone',
        Boolean(((cloud.doc.days['2026-10-12'] || {}).actual || {}).w_01)
        && Boolean(((cloud.doc.days['2026-10-13'] || {}).actual || {}).w_01), JSON.stringify(cloud.doc.days));

    // And from THIS side: a restore point the older build wrote, restored by this build.
    // A missing layer is not a problem to the restore gate, so it goes through without a word.
    suite(`this build, restoring a restore point ${name} wrote, erases every count too - and says only «שוחזר.»`);
    await settleUntil(() => now.Sync.pendingCount() === 0 && now.Sync.status === 'synced'
        && now.Sync._revision === cloud.doc.revision, 8000);
    geves(now, '2026-10-12', 'p_01', 3);
    geves(now, '2026-10-14', 'p_03', 8);
    await settleUntil(() => (cloudGeves(cloud, '2026-10-12') || {}).p_01 === 3
        && (cloudGeves(cloud, '2026-10-14') || {}).p_03 === 8 && now.Sync.pendingCount() === 0, 8000);
    given('the counts are typed again and in the cloud', (cloudGeves(cloud, '2026-10-14') || {}).p_03 === 8,
        JSON.stringify(cloud.doc.days));
    now.Store.set('scheduleData:snap:2026-10-19', point);
    const nowSaid = [];
    now.ctx.askConfirm = () => Promise.resolve(true);
    now.ctx.askTell = message => { nowSaid.push(typeof message === 'string' ? message : String(message.message || '')); return Promise.resolve(); };
    await now.call('restoreSnapshot', '2026-10-19');
    await settleUntil(() => cloudGeves(cloud, '2026-10-12') === undefined && cloudGeves(cloud, '2026-10-14') === undefined, 8000);
    same('the cloud has lost every count, on every date',
        Object.keys(cloud.doc.days).filter(date => cloud.doc.days[date].yosefGeves !== undefined), []);
    same('this phone was told only that it restored', nowSaid.slice(-1), ['שוחזר.']);
    same('and the way back is this phone\'s own state from before the restore, counts and all',
        (() => {
            const stack = JSON.parse(now.raw('scheduleData:undoStack') || '[]');
            const kept = stack[0] && JSON.parse(stack[0].schedule);
            return kept ? [((kept.days['2026-10-12'] || {}).yosefGeves || {}).p_01,
                ((kept.days['2026-10-14'] || {}).yosefGeves || {}).p_03] : null;
        })(), [3, 8]);

    now.Sync.stopListening(); now.Sync.disconnect();
    old.Sync.stopListening(); old.Sync.disconnect();

    // ONE PHONE, TWO BUILDS, ONE DISK: a window of the older build still open - or opened
    // again - on a phone where this build has typed a count. The disk now holds a layer the
    // older build's own check refuses, and a count still queued is an edit it cannot read.
    suite(`${name}, opened on a disk this build wrote a count to, is held out loud and replaces nothing`);
    const shared = phone(`d_disk_${name}`);
    work(shared, '2026-10-12', 'w_01', 'p_01');
    geves(shared, '2026-10-12', 'p_01', 3);
    const diskBefore = shared.dump();
    const window = makeDevice({ sources, appVersion: stamp, deviceId: shared.id, storage: shared.dump() });
    window.setToday('2026-10-20');
    window.State.load();
    same(`${name} stops writing until somebody has looked`, window.call('farkadWritesBlocked'), true);
    same('it says why, naming the layer, and that a queued edit was not read',
        window.global('Recovery').problems.map(problem => [problem.key.replace(/:op:.*$/, ':op:*'),
            String(problem.message || problem.reason || '').replace(/farkad:outbox:op:\S+/, 'farkad:outbox:op:*')]).sort(),
        [['farkad:outbox:op:*', 'קבוצת עריכות בתור השליחה לא נקראה: farkad:outbox:op:*'],
            ['scheduleData:v2', 'הרישום השמור במכשיר לא נקרא: ליום 2026-10-12 יש שכבה שאינה מוכרת: yosefGeves.']]);
    same('the record on the disk is byte for byte what this build wrote', window.raw('scheduleData:v2'), diskBefore['scheduleData:v2']);
    same('and so is every queued edit', Object.keys(diskBefore).filter(key => key.includes(':op:'))
        .filter(key => window.raw(key) !== diskBefore[key]), []);
    const back = reopen(shared.id, window.dump());
    same('opened again on this build, the phone has everything and is not held',
        [back.call('yosefGevesCount', back.State.schedule, '2026-10-12', 'p_01'), back.call('farkadWritesBlocked'),
            back.Sync.pendingCount() > 0], [3, false, true]);
}

// ---------------------------------------------------------------- the phone that updates
//
// The rollout itself. The father's phone wrote last on the older build - an ordinary day of
// its own, which makes it the document's last writer - and that build's copy has no `yosefGeves`.
// The next morning the same phone opens this build on the same disk, and the first snapshot
// carries exactly the stamps its own copy carries. Read as its own echo it was skipped: no
// count on the screen while the line said synced, and the day's cloud copy - the restore
// point every phone can go back to - written without them, until somebody else wrote.
for (const [name, sha] of OLDER) {
    suite(`a phone that wrote last on ${name}, opened on this build, shows the cloud's count at once`);

    const files = loadOrder().filter(file => {
        try { git(['cat-file', '-e', `${sha}:${file}`]); return true; } catch (error) { return false; }
    });
    given(`${name} has every file this build loads`, files.length === loadOrder().length,
        `${files.length} of ${loadOrder().length}`);
    const sources = files.map(file => ({ file, code: git(['show', `${sha}:${file}`]).toString('utf8') }));
    const stamp = (/const APP_VERSION = '([^']+)'/.exec(git(['show', `${sha}:js/app.js`]).toString('utf8')) || [])[1];
    given(`the older build is ${name} and does not know the layer`,
        stamp === name && !sources.some(source => /yosefGeves/.test(source.code)), String(stamp));

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

    geves(owner, '2026-10-12', 'p_01', 3);
    await settleUntil(() => (cloudGeves(cloud, '2026-10-12') || {}).p_01 === 3
        && father.Sync._revision === cloud.doc.revision, 8000);
    father.State.commit(father.call('assignPlace', father.State.schedule, '2026-10-13', 'w_01', 'actual', 'p_02'));
    await settleUntil(() => Boolean(((cloud.doc.days['2026-10-13'] || {}).actual || {}).w_01)
        && father.Sync.pendingCount() === 0 && father.Sync.status === 'synced', 8000);
    await settle(TICK * 20);
    const disk = JSON.parse(father.raw('scheduleData:v2'));
    given(`${name} wrote last, under the stamps its own copy carries, and that copy has no count`,
        cloud.doc.updatedBy === father.id && disk.updatedBy === father.id
            && disk.updatedAt === cloud.doc.updatedAt
            && (((disk.days || {})['2026-10-12']) || {}).yosefGeves === undefined
            && (cloudGeves(cloud, '2026-10-12') || {}).p_01 === 3,
        JSON.stringify({ cloud: [cloud.doc.updatedBy, cloud.doc.updatedAt], disk: [disk.updatedBy, disk.updatedAt] }));
    father.Sync.stopListening(); father.Sync.disconnect();

    // The next morning: this build, the same disk, the same device id.
    const updated = reopen(father.id, father.dump(), { today: '2026-10-21' });
    const countNow = () => updated.call('yosefGevesCount', updated.State.schedule, '2026-10-12', 'p_01');
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
    same('and in the Yosef Geves table',
        updated.call('yosefGevesReport', updated.State.schedule, '2026-10-01', '2026-10-31').total, 3);
    check('the line never said synced over a copy missing the count',
        syncedWith.length > 0 && syncedWith.every(value => value === 3), JSON.stringify(syncedWith));
    same('the day\'s cloud copy carries it',
        ((((cloud.history.get('2026-10-21') || {}).days || {})['2026-10-12']) || {}).yosefGeves, { p_01: 3 });
    same('and so does this phone\'s disk',
        (((JSON.parse(updated.raw('scheduleData:v2')).days || {})['2026-10-12']) || {}).yosefGeves, { p_01: 3 });
    same(`this phone now holds every day the cloud holds, the day ${name} wrote among them`,
        [Boolean(((updated.State.schedule.days['2026-10-13'] || {}).actual || {}).w_01),
            updated.call('canonicalJson', updated.State.schedule.days)],
        [true, updated.call('canonicalJson',
            updated.call('normaliseSchedule', JSON.parse(JSON.stringify(cloud.doc))).days)]);
    same('nothing held, nothing blocked, and the cloud as it was',
        [updated.Sync.holdingContested(), updated.call('farkadWritesBlocked'), cloudGeves(cloud, '2026-10-12')],
        [false, false, { p_01: 3 }]);

    // And no wider than that. Its own next count comes back carrying the counts this copy
    // holds, and is skipped as its own echo, as before: adopting every echo would redraw the
    // day screen under the person's finger each time a count is saved.
    geves(updated, '2026-10-14', 'p_03', 2);
    const drawn = updated.renders.count;
    await settleUntil(() => (cloudGeves(cloud, '2026-10-14') || {}).p_03 === 2
        && updated.Sync.pendingCount() === 0 && updated.Sync.status === 'synced', 4000);
    await settle(TICK * 20);
    same('its own next count is heard as its own echo, and nothing is redrawn',
        [(cloudGeves(cloud, '2026-10-14') || {}).p_03, updated.renders.count - drawn], [2, 0]);
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
    geves(solo, '2026-10-12', 'p_01', 3);
    geves(solo, second[0], second[1], 5);
    await settleUntil(() => (cloudGeves(cloud, second[0]) || {})[second[1]] === 5 && solo.Sync.pendingCount() === 0
        && solo.Sync._revision === cloud.doc.revision, 4000);
    await settle(TICK * 20);
    solo.Sync.stopListening(); solo.Sync.disconnect();
    const disk = solo.dump();
    const record = JSON.parse(disk['scheduleData:v2']);
    delete record.days['2026-10-12'].yosefGeves.p_01;
    given('this phone wrote last, and its copy has lost the first count and kept the second',
        cloud.doc.updatedBy === solo.id && record.updatedAt === cloud.doc.updatedAt
            && (cloudGeves(cloud, '2026-10-12') || {}).p_01 === 3
            && ((record.days[second[0]] || {}).yosefGeves || {})[second[1]] === 5
            && !Object.prototype.hasOwnProperty.call(record.days['2026-10-12'].yosefGeves, 'p_01'),
        JSON.stringify(record.days));
    const behind = reopen(solo.id, Object.assign({}, disk, { 'scheduleData:v2': JSON.stringify(record) }));
    given('opened again, it holds the second count and not the first',
        behind.call('yosefGevesCount', behind.State.schedule, '2026-10-12', 'p_01') === 0
            && behind.call('yosefGevesCount', behind.State.schedule, second[0], second[1]) === 5,
        JSON.stringify(behind.State.schedule.days));
    behind.Sync.connect(cloud.adapter);
    await settleUntil(() => behind.Sync.status === 'synced'
        && behind.call('yosefGevesCount', behind.State.schedule, '2026-10-12', 'p_01') === 3, 4000);
    same('the first count is back on the screen and in the Yosef Geves table, with signal',
        [behind.call('yosefGevesCount', behind.State.schedule, '2026-10-12', 'p_01'),
            behind.call('yosefGevesReport', behind.State.schedule, '2026-10-01', '2026-10-31').total, behind.Sync.status],
        [3, 8, 'synced']);
    same('and on the disk', (((JSON.parse(behind.raw('scheduleData:v2')).days || {})['2026-10-12']) || {}).yosefGeves,
        second[0] === '2026-10-12' ? { p_01: 3, p_02: 5 } : { p_01: 3 });
    behind.Sync.stopListening(); behind.Sync.disconnect();
}

suite('sameYosefGevesLayers: the same counts, site by site, and nothing else');
{
    const probe = phone('d_same');
    const days = map => ({ days: map });
    const compare = (one, other, skip) => probe.call('sameYosefGevesLayers', one, other, skip);
    const D1 = '2026-10-12';
    const D2 = '2026-10-13';
    same('the same counts are the same', compare(days({ [D1]: { yosefGeves: { p_01: 3, p_02: 1 } } }),
        days({ [D1]: { yosefGeves: { p_02: 1, p_01: 3 } } })), true);
    same('a different count on one site is not', compare(days({ [D1]: { yosefGeves: { p_01: 3 } } }),
        days({ [D1]: { yosefGeves: { p_01: 4 } } })), false);
    same('an extra site is not', compare(days({ [D1]: { yosefGeves: { p_01: 3 } } }),
        days({ [D1]: { yosefGeves: { p_01: 3, p_02: 2 } } })), false);
    same('an extra date is not', compare(days({ [D1]: { yosefGeves: { p_01: 3 } } }),
        days({ [D1]: { yosefGeves: { p_01: 3 } }, [D2]: { yosefGeves: { p_01: 1 } } })), false);
    same('a null, a clear in flight, is no count', compare(days({ [D1]: { yosefGeves: { p_01: null } } }),
        days({ [D1]: { plan: {}, actual: {} } })), true);
    same('an empty map is no count', compare(days({ [D1]: { yosefGeves: {} } }), days({})), true);
    same('a map that is not a map is not the same as none', compare(days({ [D1]: { yosefGeves: [3] } }), days({})), false);
    // Compared as it stands, byte for byte - never read as an empty map, nor as the map it
    // looks like.
    same('nor is a number where the map should be', compare(days({ [D1]: { yosefGeves: 5 } }), days({})), false);
    same('nor an empty list', compare(days({ [D1]: { yosefGeves: [] } }), days({})), false);
    same('and a list is not the map with the same keys', compare(days({ [D1]: { yosefGeves: { 0: 3 } } }),
        days({ [D1]: { yosefGeves: [3] } })), false);
    same('nor is a count that is not a number', compare(days({ [D1]: { yosefGeves: { p_01: '3' } } }),
        days({ [D1]: { yosefGeves: { p_01: 3 } } })), false);
    const skipFirst = (date, placeId) => date === D1 && placeId === 'p_01';
    same('a difference only where the caller says to look away is no difference',
        compare(days({ [D1]: { yosefGeves: { p_01: 5, p_02: 1 } } }), days({ [D1]: { yosefGeves: { p_01: 4, p_02: 1 } } }),
            skipFirst), true);
    same('and one anywhere else still is',
        compare(days({ [D1]: { yosefGeves: { p_01: 5, p_02: 1 } } }), days({ [D1]: { yosefGeves: { p_01: 4, p_02: 2 } } }),
            skipFirst), false);
}

// The question every sync rule for a count starts from: is this field path one site's count
// on one day? Asked of the paths the queue and the wire carry, and of nothing longer or
// shorter - a count's clear is a deleted field, a worker-day's is not, and the two are told
// apart here alone.
suite('isYosefGevesFieldPath: one site\'s count on one day, and nothing else');
{
    const probe = phone('d_ispath');
    const is = path => probe.call('isYosefGevesFieldPath', path);
    same('a count\'s path is', is('days.2026-10-12.yosefGeves.p_01'), true);
    same('the day\'s whole map is not', is('days.2026-10-12.yosefGeves'), false);
    same('nor anything under a count', is('days.2026-10-12.yosefGeves.p_01.extra'), false);
    same('nor a worker\'s day', is('days.2026-10-12.actual.w_01'), false);
    same('nor the same words outside the days', is('ledger.2026-10-12.yosefGeves.p_01'), false);
}

report();
