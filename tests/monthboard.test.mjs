// «לוח חודשי» - the crew's month on one board, on devices.
//
//   node tests/monthboard.test.mjs
//
// The board (js/ui/monthboard.js) is one more surface showing what the week, the pay sheet
// and «לפי אתר» already show - one row per man, one column per date, the men per day, Rima
// and «עובדי יוסף גבס», and narrowed to one site the invoice's own counts. So what this
// suite holds is not that the board is right. It is that it CANNOT BE DIFFERENT:
//
//   1. THE ROWS are the week's rule over the month: every active man, a man who is not
//      active only where he has a record in it, in the roster's order; narrowed to one
//      site, the men with an entry there.
//   2. A CELL IS THE WEEK'S CELL. Every cell, every board, built node for node as
//      renderWeekCell builds the same man's same day - classes, blocks, words, marks, the
//      spoken label - but for the board's two letters where two of its sites share one;
//      narrowed, only that site's block.
//   3. A MAN'S «נוכחות» is payrollReport's attendanceDays over the month and the number of
//      his filled cells; narrowed, his days at that site, read off the invoice's workerIds.
//   4. THE FOOT. «סה"כ עובדים» is the week's own foot, drawn by renderWeekTotals over the
//      same days, and its busiest day is «סיכום חודש»'s; Rima and יוסף גבס are their
//      reports' and in no total. Narrowed: own + Rima = billed on every date, billed is the
//      invoice's count, and the three totals are «לפי אתר»'s; יוסף גבס in none of them.
//   5. A SATURDAY is a column exactly when something is recorded on it; a weekday with
//      nothing is a column of empty cells.
//   6. TWO LETTERS only where two sites of the board share one; siteInitial unchanged.
//   7. IT WRITES NOTHING: every key on the disk, byte for byte, across the facts, the draw,
//      the arrows, the filter, the picture's reading, a cell's and a name's navigation.
//   8. THE WORDS: every new one pinned, every borrowed one found in its owner; no word
//      mixing Hebrew and Arabic letters.
//   9. THE COST: a season's month (40 men x 31 days) read in well under its budget, and the
//      reports asked a counted number of times.
//  10. THE PICTURE'S READING is the facts it was drawn from, and the plan draws every row,
//      every block and every legend swatch.
//
// Over a month written out by hand (every figure spelled here), and over seeded records:
// both pay cycles, two sites in one day, doubles, extra hours with and without hours,
// absences, a man archived who worked and one who did not, an archived site, Rima on two
// sites, יוסף גבס on one, a Saturday with work, a Saturday with only a Rima count, and two
// sites sharing a first letter. SYNTHETIC NAMES ONLY.

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { makeDevice } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

process.env.TZ = 'Asia/Jerusalem';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = file => readFileSync(join(ROOT, file), 'utf8');
const BOARD = source('js/ui/monthboard.js');
const WEEK = source('js/ui/week.js');
const REPORTS = source('js/ui/reports.js');
const PRINTOUT = source('js/ui/printout.js');

const TODAY = '2026-11-10';
const FSI = '⁨';
const PDI = '⁩';
const iso = name => `${FSI}${name}${PDI}`;
// The marks the app pins direction with, taken off where a line is compared as words.
const plain = text => String(text).replace(/[‎⁦-⁩]/g, '');

const addDays = (date, days) => {
    const [y, m, d] = date.split('-').map(Number);
    const at = new Date(y, m - 1, d + days, 12);
    return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
};
const datesOf = key => {
    const [y, m] = key.split('-').map(Number);
    const out = [];
    for (let d = 1; d <= new Date(y, m, 0, 12).getDate(); d += 1) out.push(`${key}-${String(d).padStart(2, '0')}`);
    return out;
};
const weekday = date => new Date(`${date}T12:00:00`).getDay();

// ---------------------------------------------------------------- a DOM that answers back
//
// The harness's document is a set of nulls, and tests/moneydom.mjs reads one class per step.
// The board is read the way a browser reads it: by compound selectors with attributes
// (`th[data-date]`, `[data-month-board="prev"]`), by `closest`, and by a click that BUBBLES
// to the one listener its grid has - so the board's own code runs here unchanged.
function makeBoardDom() {
    const doc = { _active: null };
    const camel = name => name.replace(/-([a-z])/g, (all, ch) => ch.toUpperCase());

    function splitList(selector) {
        const out = [];
        let depth = 0;
        let quote = null;
        let cur = '';
        for (const ch of selector) {
            if (quote) { if (ch === quote) quote = null; cur += ch; continue; }
            if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
            if (ch === '[' || ch === '(') depth += 1;
            if (ch === ']' || ch === ')') depth -= 1;
            if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
            cur += ch;
        }
        if (cur.trim()) out.push(cur.trim());
        return out;
    }
    // One complex selector into compounds and the combinators between them.
    function parseComplex(selector) {
        const parts = [];
        let cur = '';
        let depth = 0;
        let quote = null;
        let combinator = ' ';
        const flush = () => { if (cur.trim()) { parts.push({ compound: parseCompound(cur.trim()), combinator }); } cur = ''; };
        for (let i = 0; i < selector.length; i += 1) {
            const ch = selector[i];
            if (quote) { if (ch === quote) quote = null; cur += ch; continue; }
            if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
            if (ch === '[') depth += 1;
            if (ch === ']') depth -= 1;
            if (depth === 0 && (ch === ' ' || ch === '>')) {
                if (cur.trim()) { flush(); combinator = ' '; }
                if (ch === '>') combinator = '>';
                continue;
            }
            cur += ch;
        }
        flush();
        return parts;
    }
    function parseCompound(text) {
        const compound = { tag: null, ids: [], classes: [], attrs: [] };
        const re = /([a-zA-Z][\w-]*)|#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]/g;
        let m;
        while ((m = re.exec(text)) !== null) {
            if (m[1] && m.index === 0) compound.tag = m[1].toUpperCase();
            else if (m[2]) compound.ids.push(m[2]);
            else if (m[3]) compound.classes.push(m[3]);
            else if (m[4]) compound.attrs.push({ name: m[4], value: m[5] !== undefined ? m[5] : m[6] !== undefined ? m[6] : m[7] });
        }
        return compound;
    }
    function matchCompound(node, compound) {
        if (!node || node.nodeType !== 1) return false;
        if (compound.tag && node.tagName !== compound.tag) return false;
        if (compound.ids.some(id => node.id !== id)) return false;
        if (compound.classes.some(cls => !node.classList.contains(cls))) return false;
        return compound.attrs.every(({ name, value }) => {
            const got = node.getAttribute(name);
            return value === undefined ? got !== null : got === value;
        });
    }
    function matchParts(node, parts, at) {
        if (!matchCompound(node, parts[at].compound)) return false;
        if (at === 0) return true;
        if (parts[at].combinator === '>') return matchParts(node.parentNode, parts, at - 1);
        for (let up = node.parentNode; up && up.nodeType === 1; up = up.parentNode) {
            if (matchParts(up, parts, at - 1)) return true;
        }
        return false;
    }
    function matches(node, selector) {
        return splitList(selector).some(one => { const parts = parseComplex(one); return matchParts(node, parts, parts.length - 1); });
    }
    function descendants(root) {
        const out = [];
        root.children.forEach(child => { out.push(child); descendants(child).forEach(n => out.push(n)); });
        return out;
    }

    function node(tag) {
        const self = {
            nodeType: 1,
            tagName: String(tag).toUpperCase(),
            children: [],
            parentNode: null,
            attributes: {},
            dataset: {},
            style: {},
            className: '',
            _text: '',
            listeners: {},
            tabIndex: 0,
            hidden: false,
            value: '',
            title: '',
            type: '',
            id: '',
            classList: {
                add(name) { if (!self.classList.contains(name)) self.className = (self.className + ' ' + name).trim(); },
                remove(name) { self.className = self.className.split(/\s+/).filter(c => c && c !== name).join(' '); },
                contains(name) { return self.className.split(/\s+/).indexOf(name) !== -1; },
                toggle(name, on) { const want = on === undefined ? !self.classList.contains(name) : on;
                    if (want) self.classList.add(name); else self.classList.remove(name); return want; }
            },
            appendChild(child) { if (child.parentNode) child.parentNode.removeChild(child); self.children.push(child); child.parentNode = self; return child; },
            insertBefore(child, before) {
                if (child.parentNode) child.parentNode.removeChild(child);
                const at = self.children.indexOf(before);
                self.children.splice(at === -1 ? self.children.length : at, 0, child);
                child.parentNode = self;
                return child;
            },
            removeChild(child) { const at = self.children.indexOf(child); if (at !== -1) self.children.splice(at, 1); child.parentNode = null; return child; },
            remove() { if (self.parentNode) self.parentNode.removeChild(self); },
            setAttribute(name, value) {
                if (name === 'id') self.id = String(value);
                else if (name === 'class') self.className = String(value);
                else if (name.startsWith('data-')) self.dataset[camel(name.slice(5))] = String(value);
                else self.attributes[name] = String(value);
            },
            getAttribute(name) {
                if (name === 'id') return self.id || null;
                if (name === 'class') return self.className || null;
                if (name.startsWith('data-')) {
                    const value = self.dataset[camel(name.slice(5))];
                    return value === undefined ? null : String(value);
                }
                return Object.prototype.hasOwnProperty.call(self.attributes, name) ? self.attributes[name] : null;
            },
            hasAttribute(name) { return self.getAttribute(name) !== null; },
            removeAttribute(name) { delete self.attributes[name]; },
            addEventListener(type, fn) { (self.listeners[type] = self.listeners[type] || []).push(fn); },
            removeEventListener(type, fn) { self.listeners[type] = (self.listeners[type] || []).filter(one => one !== fn); },
            dispatch(type, extra) {
                const event = Object.assign({ type, target: self, defaultPrevented: false, stopped: false,
                    preventDefault() { event.defaultPrevented = true; }, stopPropagation() { event.stopped = true; } }, extra || {});
                for (let at = self; at && !event.stopped; at = at.parentNode) (at.listeners[type] || []).slice().forEach(fn => fn(event));
                return event;
            },
            click() { return self.dispatch('click'); },
            focus() { doc._active = self; },
            closest(selector) { for (let at = self; at && at.nodeType === 1; at = at.parentNode) if (matches(at, selector)) return at; return null; },
            contains(other) { for (let at = other; at; at = at.parentNode) if (at === self) return true; return false; },
            matches(selector) { return matches(self, selector); },
            querySelector(selector) { return self.querySelectorAll(selector)[0] || null; },
            querySelectorAll(selector) { return descendants(self).filter(n => matches(n, selector)); }
        };
        Object.defineProperty(self, 'firstChild', { get: () => self.children[0] || null });
        Object.defineProperty(self, 'lastElementChild', { get: () => self.children[self.children.length - 1] || null });
        Object.defineProperty(self, 'childNodes', { get: () => self.children });
        Object.defineProperty(self, 'textContent', {
            get() { return self._text + self.children.map(child => child.textContent).join(''); },
            set(value) { self.children.forEach(child => { child.parentNode = null; }); self.children.length = 0;
                self._text = value === null || value === undefined ? '' : String(value); }
        });
        return self;
    }

    const html = node('html');
    const body = node('body');
    html.appendChild(body);
    Object.assign(doc, {
        documentElement: html,
        body,
        createElement: node,
        createElementNS: (ns, tag) => node(tag),
        getElementById: id => descendants(html).find(n => n.id === id) || null,
        querySelector: selector => html.querySelector(selector),
        querySelectorAll: selector => html.querySelectorAll(selector),
        addEventListener() {},
        removeEventListener() {},
        contains: other => html.contains(other),
        register(id, tag) { const made = node(tag || 'div'); made.id = id; body.appendChild(made); return made; }
    });
    Object.defineProperty(doc, 'activeElement', { get: () => doc._active || body });
    return doc;
}

// The board, the week, the day's Saturday rule, the reports' counts and the picture's
// reader, in the device's own context, over that DOM.
function withBoard(device) {
    const dom = makeBoardDom();
    dom.register('weekView', 'section');
    device.ctx.document = dom;
    device.ctx.getComputedStyle = node => ({ backgroundColor: (node.style && node.style.background) || '', direction: 'rtl' });
    device.dom = dom;
    device.run = code => vm.runInContext(code, device.ctx, { filename: 'harness:monthboard' });
    ['js/ui/sitecolor.js', 'js/ui/reports.js', 'js/ui/week.js', 'js/ui/undo.js', 'js/ui/day.js',
        'js/ui/monthsummary.js', 'js/ui/printout.js'].forEach(file => vm.runInContext(source(file), device.ctx, { filename: file }));
    vm.runInContext(BOARD, device.ctx, { filename: 'js/ui/monthboard.js' });
    device.views = [];
    device.cards = [];
    device.chosen = 0;
    device.ctx.__views = device.views;
    device.ctx.__cards = device.cards;
    // showView as js/app.js has it for the week: the grid, the week of the day on screen.
    device.run(`showView = function (view) {
        __views.push(view);
        if (view === 'week') { weekPhoneMode = 'grid'; weekPhoneDate = null; setWeekFromDate(State.date); renderWeek(); }
    };
    openWorkerCard = function (id) { __cards.push(String(id)); };`);
    device.ctx.dayChosenByHand = () => { device.chosen += 1; };
    device.setToday(TODAY);
    device.run(`State.date = ${JSON.stringify(TODAY)};`);
    device.facts = (key, place) => JSON.parse(device.run(
        `JSON.stringify(monthBoardFacts(${JSON.stringify(key)}, ${JSON.stringify(place === undefined ? null : place)}))`));
    return device;
}

// A node as a shape: what it is, what it says and what it carries - the things one cell can
// differ from another by. `skip` names what the board adds on purpose.
function shapeOf(node, skip = {}) {
    if (!node) return null;
    const data = Object.keys(node.dataset).filter(key => !(skip.data || []).includes(key)).sort()
        .map(key => [key, node.dataset[key]]);
    return {
        tag: node.tagName, cls: node.className, text: node._text,
        attrs: Object.keys(node.attributes).sort().map(key => [key, node.attributes[key]]),
        data,
        children: node.children.map(child => shapeOf(child, skip))
    };
}

// ---------------------------------------------------------------- the month written out by hand
//
// October 2026: 31 days, its Saturdays the 3rd, 10th, 17th, 24th and 31st.
//   p_1 הרצליה, p_2 הוד השרון   - two sites sharing «ה»: on this board «הר» and «הו»
//   p_3 רמת גן                   - archived, and worked at in October
//   p_4 נתניה                    - only a יוסף גבס count; never billed
//   p_5 פתח תקווה                - nothing in October
//   w_1 אבי טסט     fortnightly, at two sites on the 1st, absent on the 2nd
//   w_2 בני טסט     weekly, doubled on the 1st, 2.5 extra hours on the 2nd, a Saturday's work
//   w_3 גיל טסט     archived, worked twice in October
//   w_4 דני טסט     archived, worked in September only - not a row of October
//   w_5 הדר טסט     active, never recorded - a row of empty cells
const HAND = {
    places: [
        { id: 'p_1', name: 'הרצליה', active: true },
        { id: 'p_2', name: 'הוד השרון', active: true },
        { id: 'p_3', name: 'רמת גן', active: false },
        { id: 'p_4', name: 'נתניה', active: true },
        { id: 'p_5', name: 'פתח תקווה', active: true }
    ],
    workers: [
        { id: 'w_1', name: 'אבי טסט', active: true, dailyRate: 400, hourlyRate: 50 },
        { id: 'w_2', name: 'בני טסט', active: true, dailyRate: 420, hourlyRate: 50, payCycles: '2026-08-07=weekly' },
        { id: 'w_3', name: 'גיל טסט', active: false, dailyRate: 380, hourlyRate: 50 },
        { id: 'w_4', name: 'דני טסט', active: false, dailyRate: 380, hourlyRate: 50 },
        { id: 'w_5', name: 'הדר טסט', active: true, dailyRate: 400, hourlyRate: 50 }
    ]
};

function handPhone() {
    const device = withBoard(makeDevice({ deviceId: 'd_monthboard_hand' }));
    const s = device.State.schedule;
    s.places = HAND.places.map(place => ({ ...place }));
    s.workers = HAND.workers.map(worker => ({ ...worker }));
    const put = (date, worker, place, rate, hours) => device.call('assignPlace', s, date, worker, 'actual', place, rate, hours);
    put('2026-09-15', 'w_4', 'p_1');
    put('2026-10-01', 'w_1', 'p_1');
    put('2026-10-01', 'w_1', 'p_2');
    put('2026-10-01', 'w_2', 'p_1', 'double');
    put('2026-10-01', 'w_3', 'p_3');
    device.call('markAbsent', s, '2026-10-02', 'w_1', 'actual');
    put('2026-10-02', 'w_2', 'p_2', 'extra', 2.5);
    put('2026-10-03', 'w_2', 'p_1');                                   // a Saturday with work
    put('2026-10-05', 'w_1', 'p_1');
    device.call('setRimaCount', s, '2026-10-05', 'p_1', 3);
    device.call('setYosefGevesCount', s, '2026-10-05', 'p_4', 2);
    put('2026-10-06', 'w_1', 'p_1', 'extra');                          // extra, no hours typed
    put('2026-10-06', 'w_3', 'p_3');
    device.call('setRimaCount', s, '2026-10-10', 'p_2', 4);            // a Saturday with only Rima
    device.State.save({ silent: true });
    return device;
}

// ---------------------------------------------------------------- seeded records
function mulberry(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const SEED_SITES = ['הרצליה', 'הוד השרון', 'נתניה', 'רמת גן', 'פתח תקווה', 'כפר סבא'];

function seededPhone(seed) {
    const rand = mulberry(seed);
    const pick = list => list[Math.floor(rand() * list.length)];
    const device = withBoard(makeDevice({ deviceId: `d_monthboard${seed}` }));
    const s = device.State.schedule;
    const crew = 6 + Math.floor(rand() * 5);
    s.workers = [];
    for (let n = 1; n <= crew; n += 1) {
        s.workers.push({ id: `w_${n}`, name: `עובד ${seed}-${n}`, active: true, dailyRate: 400, hourlyRate: 50,
            ...(rand() < 0.35 ? { payCycles: '2026-08-07=weekly' } : {}) });
    }
    // One man who worked and has since left, one who left before, one never recorded.
    const left = s.workers[crew - 3];
    const before = s.workers[crew - 2];
    const never = s.workers[crew - 1];
    const sites = 4 + Math.floor(rand() * 3);
    s.places = SEED_SITES.slice(0, sites).map((name, i) => ({ id: `p_${i + 1}`, name: `${name} ${seed}`, active: true }));
    s.places[2].active = false;                                       // an archived site, worked at
    const ids = s.places.map(place => place.id);
    for (let date = '2026-09-01'; date <= TODAY; date = addDays(date, 1)) {
        const saturday = weekday(date) === 6;
        s.workers.forEach(worker => {
            if (worker === never) return;
            if (worker === before && date >= '2026-10-01') return;
            if (worker === left && date >= '2026-10-20') return;
            const roll = rand();
            if (roll < (saturday ? 0.93 : 0.25)) return;
            if (roll < (saturday ? 0.95 : 0.32)) { device.call('markAbsent', s, date, worker.id, 'actual'); return; }
            const one = pick(ids);
            const band = rand();
            const rate = band < 0.1 ? 'double' : band < 0.2 ? 'extra' : undefined;
            const hours = rate === 'extra' ? pick([0, 1, 2.5]) : 0;
            device.call('assignPlace', s, date, worker.id, 'actual', one, rate, hours || undefined);
            if (roll > 0.92) device.call('assignPlace', s, date, worker.id, 'actual', pick(ids.filter(id => id !== one)));
        });
        // Rima on the first two sites, יוסף גבס on the fourth; and on a Saturday in six, a
        // Rima count with nobody of his - a Saturday with only Rima on it.
        if (rand() < 0.25) device.call('setRimaCount', s, date, pick(['p_1', 'p_2']), 1 + Math.floor(rand() * 4));
        if (rand() < 0.15) device.call('setYosefGevesCount', s, date, 'p_4', 1 + Math.floor(rand() * 3));
    }
    left.active = false;
    before.active = false;
    device.State.save({ silent: true });
    return { device, left, before, never };
}

// ---------------------------------------------------------------- what the board must equal

// The week's own foot rule, drawn by the week's own function over the board's days.
function weekFoot(device, key, drawn) {
    return JSON.parse(device.run(`(function () {
        const foot = renderWeekTotals(${JSON.stringify(drawn)}, weekWorkers(${JSON.stringify(datesOf(key))}));
        return JSON.stringify(foot.querySelectorAll('td').slice(1).map(td => td.textContent));
    })()`));
}

function payroll(device, key) {
    const dates = datesOf(key);
    return JSON.parse(device.run(`JSON.stringify(payrollReport(State.schedule, ${JSON.stringify(dates[0])}, ${JSON.stringify(dates[dates.length - 1])})
        .map(row => ({ id: String(row.workerId), days: row.attendanceDays })))`));
}

function invoiceOf(device, key) {
    const dates = datesOf(key);
    return JSON.parse(device.run(`(function (from, to) {
        const invoice = invoiceByDate(State.schedule, from, to);
        return JSON.stringify(invoice.places.map(row => ({ id: String(row.placeId), workerDays: row.workerDays,
            days: row.days.map(day => ({ date: day.date, count: day.count, men: day.workerIds.map(String) })) })));
    })(${JSON.stringify(dates[0])}, ${JSON.stringify(dates[dates.length - 1])})`));
}

function countsOf(device, key, fn, place) {
    const dates = datesOf(key);
    return JSON.parse(device.run(`(function (from, to, only) {
        const report = ${fn}(State.schedule, from, to, only === null ? undefined : only);
        const byDate = {};
        ${JSON.stringify(dates)}.forEach(date => { byDate[date] = only === null ? report.dayTotal(date) : report.countAt(only, date); });
        return JSON.stringify({ byDate, total: report.total });
    })(${JSON.stringify(dates[0])}, ${JSON.stringify(dates[dates.length - 1])}, ${JSON.stringify(place === undefined ? null : place)})`));
}

// The board drawn into the fake #weekView by the week's own draw, in the board's mode.
function drawBoard(device, key, place) {
    device.run(`MONTH_BOARD_KEY = ${JSON.stringify(key)}; MONTH_BOARD_PLACE = ${JSON.stringify(place === undefined ? null : place)};
        weekPhoneMode = 'month'; renderWeek();`);
    return device.dom.getElementById('weekView');
}

// Every check of criteria 1-6 over one board.
function holdBoard(device, key, place, label, extra = {}) {
    const facts = device.facts(key, place);
    const drawn = facts.dates.map(day => day.date);
    const workers = device.State.schedule.workers;
    const layer = 'actual';
    const entries = (date, id) => device.call('isAbsent', device.State.schedule, date, id, layer) ? []
        : device.call('entriesFor', device.State.schedule, date, id, layer);
    const recordOn = (date, id) => device.call('isAbsent', device.State.schedule, date, id, layer)
        || device.call('entriesFor', device.State.schedule, date, id, layer).length > 0;
    const all = datesOf(key);

    // 1. THE ROWS.
    const wantRows = place === null
        ? workers.filter(worker => worker.active !== false || all.some(date => recordOn(date, worker.id))).map(w => String(w.id))
        : workers.filter(worker => all.some(date => entries(date, worker.id).some(e => String(e.placeId) === place))).map(w => String(w.id));
    same(`${label}: the rows are ${place === null ? 'the week\'s rule over the month' : 'the men with an entry at that site'}, in the roster's order`,
        facts.rows.map(row => row.workerId), wantRows);

    // 5. THE COLUMNS.
    const siteRecord = date => workers.some(worker => entries(date, worker.id).some(e => String(e.placeId) === place))
        || device.call('rimaCount', device.State.schedule, date, place) > 0
        || device.call('yosefGevesCount', device.State.schedule, date, place) > 0;
    const wantDates = all.filter(date => weekday(date) !== 6
        || (place === null ? device.run(`anyRecordOnRestDay(${JSON.stringify(date)})`) : siteRecord(date)));
    same(`${label}: a column for every weekday, and a Saturday only where something is recorded`, drawn, wantDates);
    same(`${label}: the Saturdays are marked as Saturdays`, facts.dates.filter(day => day.saturday).map(day => day.date),
        wantDates.filter(date => weekday(date) === 6));

    // 3. «נוכחות».
    const pay = payroll(device, key);
    const invoice = invoiceOf(device, key);
    const wrongTotals = facts.rows.filter(row => {
        const filled = row.cells.filter(cell => !cell.absent && cell.lines.length > 0).length;
        if (place === null) {
            const sheet = pay.find(one => one.id === row.workerId);
            return !(sheet && sheet.days === row.total && filled === row.total);
        }
        const site = invoice.find(one => one.id === place);
        const atSite = site ? site.days.filter(day => day.men.includes(row.workerId)).length : 0;
        return !(atSite === row.total && filled === row.total);
    });
    same(`${label}: every man's «נוכחות» is ${place === null ? 'payrollReport\'s attendanceDays' : 'his days at that site on the invoice'} and the count of his filled cells`,
        wrongTotals.map(row => row.workerId), []);
    if (place === null) {
        same(`${label}: a man who is not a row has no attendance in the month`,
            pay.filter(one => !facts.rows.some(row => row.workerId === one.id) && one.days > 0).map(one => one.id), []);
    }

    // 4. THE FOOT.
    const foot = Object.fromEntries(facts.foot.map(row => [row.kind, row]));
    const counts = row => drawn.map(date => row.byDate[date]);
    if (place === null) {
        same(`${label}: the foot's rows`, facts.foot.map(row => row.kind),
            ['men'].concat(countsOf(device, key, 'rimaReport').total > 0 ? ['rima'] : [])
                .concat(countsOf(device, key, 'yosefGevesReport').total > 0 ? ['yosef'] : []));
        same(`${label}: «סה"כ עובדים» is the week's own foot, day by day`,
            counts(foot.men).map(n => (n > 0 ? String(n) : '')), weekFoot(device, key, drawn));
        same(`${label}: and its total is the men's «נוכחות» added - no count of Rima or יוסף גבס in it`,
            foot.men.total, facts.rows.reduce((sum, row) => sum + row.total, 0));
        const busiest = JSON.parse(device.run(`JSON.stringify(monthSummaryScope(() => monthSummaryRead(${JSON.stringify(key)})).busiest)`));
        let mine = null;
        drawn.forEach(date => { if (foot.men.byDate[date] > 0 && (!mine || foot.men.byDate[date] > mine.men)) mine = { date, men: foot.men.byDate[date] }; });
        same(`${label}: its busiest day is «סיכום חודש»'s, men and date`, mine, busiest);
        const rima = countsOf(device, key, 'rimaReport');
        if (foot.rima) {
            same(`${label}: «רישום לרימא» is rimaReport's dayTotal on every day, and its total`,
                [counts(foot.rima), foot.rima.total], [drawn.map(date => rima.byDate[date]), rima.total]);
        }
        const yosef = countsOf(device, key, 'yosefGevesReport');
        if (foot.yosef) {
            same(`${label}: «עובדי יוסף גבס» is yosefGevesReport's dayTotal on every day, and its total`,
                [counts(foot.yosef), foot.yosef.total], [drawn.map(date => yosef.byDate[date]), yosef.total]);
        }
        same(`${label}: the two counts are under their own titles, with their own notes`,
            facts.notes.map(note => note.kind), facts.foot.filter(row => row.kind !== 'men').map(row => row.kind));
    } else {
        const site = invoice.find(one => one.id === place);
        const own = countsOf(device, key, 'invoiceWithoutRima', place);
        const rima = countsOf(device, key, 'rimaReport', place);
        const yosef = countsOf(device, key, 'yosefGevesReport', place);
        same(`${label}: the foot's rows`, facts.foot.map(row => row.kind),
            (rima.total > 0 ? ['own', 'rima'] : []).concat(['billed']).concat(yosef.total > 0 ? ['yosef'] : []));
        const billedByDate = drawn.map(date => {
            const day = site ? site.days.find(one => one.date === date) : null;
            return day ? day.count : 0;
        });
        same(`${label}: «סה״כ ימי עובד־אתר» is the invoice's count on every day, and its total`,
            [counts(foot.billed), foot.billed.total], [billedByDate, site ? site.workerDays : 0]);
        if (foot.own) {
            same(`${label}: «בלי עובדי רימא» + «רישום לרימא» = billed, on every day`,
                drawn.filter(date => foot.own.byDate[date] + foot.rima.byDate[date] !== foot.billed.byDate[date]), []);
            same(`${label}: and the three totals are «לפי אתר»'s (invoiceWithoutRima, rimaReport, invoiceByDate)`,
                [foot.own.total, foot.rima.total, foot.billed.total], [own.total, rima.total, site ? site.workerDays : 0]);
            same(`${label}: his men's row is the count of the men drawn there, day by day`,
                counts(foot.own), drawn.map(date => facts.rows.filter(row => row.cells.find(c => c.date === date).lines.length > 0).length));
        } else {
            same(`${label}: with no Rima there, billed is his men alone, day by day`,
                counts(foot.billed), drawn.map(date => own.byDate[date]));
        }
        if (foot.yosef) {
            same(`${label}: «עובדי יוסף גבס» is its report's count for the site, in no total`,
                [counts(foot.yosef), foot.yosef.total, foot.billed.total], [drawn.map(date => yosef.byDate[date]), yosef.total,
                    (foot.own ? foot.own.total + foot.rima.total : own.total)]);
        }
    }

    // 2. A CELL IS THE WEEK'S CELL.
    const root = drawBoard(device, key, place);
    const board = root.querySelector('.month-board');
    given(`${label}: the board was drawn`, Boolean(board) && board.dataset.key === key, board ? board.dataset.key : 'none');
    const letterOf = new Map(facts.legend.map(site => [site.placeId, site.letters]));
    const wrongCells = [];
    let compared = 0;
    if (!facts.empty) {
        facts.rows.forEach(row => {
            const tr = board.querySelector(`tbody tr[data-worker-id="${row.workerId}"]`);
            const cells = tr ? tr.querySelectorAll('td.week-cell') : [];
            drawn.forEach((date, i) => {
                const mine = cells[i];
                const week = device.run(`renderWeekCell(State.worker(${JSON.stringify(row.workerId)}), ${JSON.stringify(date)})`);
                compared += 1;
                const expect = place === null ? weekShape(device, week, letterOf) : siteShape(device, row, date, place, letterOf);
                const got = shapeOf(mine, { data: ['date', 'place'] });
                if (JSON.stringify(got) !== JSON.stringify(expect)) wrongCells.push({ row: row.workerId, date, got, expect });
                // The board's own additions, on purpose: out of the Tab order, its date, its sites.
                if (!mine || mine.tabIndex !== -1 || mine.dataset.date !== date
                    || mine.querySelectorAll('.cell-line').some(line => !line.dataset.place)) wrongCells.push({ row: row.workerId, date, extra: true });
            });
        });
    }
    same(`${label}: every cell is renderWeekCell's for the same man and day${place === null ? '' : ', narrowed to that site'} (${compared} cells)`,
        wrongCells.slice(0, 2), []);
    if (extra.cells) given(`${label}: there were cells to compare`, compared >= extra.cells, String(compared));
    return facts;
}

// The week cell as the board must draw it on every site: the week's own cell, its letter
// given the board's letters where two sites of the board share one.
function weekShape(device, week, letterOf) {
    const shape = shapeOf(week, { data: [] });
    week.querySelectorAll('.cell-line').forEach((line, i) => {
        const block = shape.children.filter(child => /\bcell-line\b/.test(child.cls))[i];
        const name = line.querySelector('.site-name').textContent;
        const placeId = device.run(`(function () { const labels = placeLabelsIn(State.schedule);
            return [...labels.keys()].find(id => labels.get(id) === ${JSON.stringify(name)}) || ''; })()`);
        block.data = block.data.map(([key, value]) => key === 'initial' ? [key, letterOf.get(placeId) || value] : [key, value]);
    });
    return shape;
}

// The same, narrowed to one site: the week cell's construction over that site's entries only.
function siteShape(device, row, date, place, letterOf) {
    const cell = JSON.parse(device.run(`(function () {
        const worker = State.worker(${JSON.stringify(row.workerId)});
        const keep = State.schedule.days[${JSON.stringify(date)}];
        const record = keep && keep.actual && keep.actual[worker.id];
        if (!record || record.absent) return JSON.stringify({ lines: [] });
        return JSON.stringify({ lines: (record.entries || []).filter(entry => String(entry.placeId) === ${JSON.stringify(place)}) });
    })()`));
    // Build it with the week's own function over a record holding only that site's entries.
    const shape = JSON.parse(device.run(`(function () {
        const date = ${JSON.stringify(date)};
        const worker = State.worker(${JSON.stringify(row.workerId)});
        const real = State.schedule;
        const days = {}; days[date] = { actual: {} };
        days[date].actual[worker.id] = { entries: ${JSON.stringify(cell.lines)} };
        State.schedule = Object.assign({}, real, { days });
        try {
            const node = renderWeekCell(worker, date);
            const shape = n => ({ tag: n.tagName, cls: n.className, text: n._text,
                attrs: Object.keys(n.attributes).sort().map(k => [k, n.attributes[k]]),
                data: Object.keys(n.dataset).sort().map(k => [k, n.dataset[k]]),
                children: n.children.map(shape) });
            return JSON.stringify(shape(node));
        } finally { State.schedule = real; }
    })()`));
    // The site names come from the whole record's labels in both (placeLabelsIn(State.schedule)
    // over the stand-in record names the same listed sites), and the letters are the board's.
    const blocks = shape.children.filter(child => /\bcell-line\b/.test(child.cls));
    blocks.forEach(block => {
        block.data = block.data.map(([key, value]) => key === 'initial' ? [key, letterOf.get(place) || value] : [key, value]);
    });
    return shape;
}

// ============================================================ 1-6 on the month written out
{
    suite('the month written out by hand: October 2026, every board');
    const device = handPhone();
    const facts = holdBoard(device, '2026-10', null, 'October, every site', { cells: 100 });
    same('the title', facts.title, 'לוח חודשי · אוקטובר 2026');
    same('28 columns: 26 weekdays, and the 3rd (worked) and the 10th (only Rima) of the five Saturdays',
        [facts.dates.length, facts.dates.filter(day => day.saturday).map(day => day.date)], [28, ['2026-10-03', '2026-10-10']]);
    same('the rows: the two active men who worked, the archived man who worked, the active man never recorded - not the man who left in September',
        facts.rows.map(row => [row.workerId, row.name, row.active, row.total]),
        [['w_1', 'אבי טסט', true, 3], ['w_2', 'בני טסט', true, 3], ['w_3', 'גיל טסט', false, 2], ['w_5', 'הדר טסט', true, 0]]);
    const cell = (worker, date) => facts.rows.find(row => row.workerId === worker).cells.find(c => c.date === date);
    same('two sites in one day: two blocks, each with the board\'s two letters', cell('w_1', '2026-10-01').lines.map(line => [line.placeId, line.initial]),
        [['p_1', 'הר'], ['p_2', 'הו']]);
    same('a doubled day', [cell('w_2', '2026-10-01').lines[0].double, cell('w_2', '2026-10-01').lines[0].word], [true, 'כפול']);
    same('extra hours with their hours, and without', [plain(cell('w_2', '2026-10-02').lines[0].word), cell('w_1', '2026-10-06').lines[0].word],
        ['+2.5', 'נוספות']);
    same('an absence', [cell('w_1', '2026-10-02').absent, cell('w_1', '2026-10-02').lines.length], [true, 0]);
    same('the Saturday\'s work is in its cell', cell('w_2', '2026-10-03').lines.map(line => line.placeId), ['p_1']);
    same('the archived site, worked at, is on the board with its own letter', cell('w_3', '2026-10-01').lines.map(line => [line.placeId, line.initial]),
        [['p_3', 'ר']]);
    same('«סה"כ עובדים», day by day where anybody was out, and its total',
        [Object.entries(facts.foot[0].byDate).filter(([, n]) => n > 0), facts.foot[0].total],
        [[['2026-10-01', 3], ['2026-10-02', 1], ['2026-10-03', 1], ['2026-10-05', 1], ['2026-10-06', 2]], 8]);
    same('Rima: the 5th on הרצליה and the 10th on הוד השרון', [Object.entries(facts.foot[1].byDate).filter(([, n]) => n > 0), facts.foot[1].total],
        [[['2026-10-05', 3], ['2026-10-10', 4]], 7]);
    same('יוסף גבס: the 5th on נתניה', [Object.entries(facts.foot[2].byDate).filter(([, n]) => n > 0), facts.foot[2].total],
        [[['2026-10-05', 2]], 2]);
    same('the legend: the three sites drawn, in the roster\'s order - not נתניה, which only has a יוסף גבס count',
        facts.legend.map(site => [site.placeId, site.letters, site.name]), [['p_1', 'הר', 'הרצליה'], ['p_2', 'הו', 'הוד השרון'], ['p_3', 'ר', 'רמת גן']]);
    same('the filter: the sites billed in October, in the invoice\'s order - the archived one included',
        facts.sites.map(site => site.id), ['p_1', 'p_2', 'p_3']);
    same('the week keeps its one letter (siteInitial is untouched)', ['הרצליה', 'הוד השרון'].map(name => device.call('siteInitial', name)), ['ה', 'ה']);
    same('neither the empty month nor today on it', [facts.empty, facts.today, facts.thisMonth], [false, null, false]);

    suite('the month written out by hand: one site');
    const one = holdBoard(device, '2026-10', 'p_1', 'October, הרצליה');
    same('its title names the site, isolated', one.title, `לוח חודשי · אוקטובר 2026 · ${iso('הרצליה')}`);
    same('its rows and their days there', one.rows.map(row => [row.workerId, row.total]), [['w_1', 3], ['w_2', 2]]);
    same('its Saturday: the 3rd (his man there), not the 10th (Rima at the other site)',
        one.dates.filter(day => day.saturday).map(day => day.date), ['2026-10-03']);
    same('his men, Rima and billed: 2+0=2, 1+0=1, 1+3=4, 1+0=1', ['2026-10-01', '2026-10-03', '2026-10-05', '2026-10-06']
        .map(date => one.foot.map(row => row.byDate[date])), [[2, 0, 2], [1, 0, 1], [1, 3, 4], [1, 0, 1]]);
    same('and the totals 5 + 3 = 8', one.foot.map(row => [row.kind, row.label, row.total]),
        [['own', 'בלי עובדי רימא', 5], ['rima', 'רישום לרימא', 3], ['billed', 'סה״כ ימי עובד־אתר', 8]]);
    same('only that site\'s block, and nobody\'s absence', one.rows[0].cells.find(c => c.date === '2026-10-01').lines.map(line => line.placeId)
        .concat(one.rows[0].cells.filter(c => c.absent).map(c => c.date)), ['p_1']);
    same('one site on the board: its own letter alone', one.legend.map(site => [site.placeId, site.letters]), [['p_1', 'ה']]);

    const two = holdBoard(device, '2026-10', 'p_2', 'October, הוד השרון');
    same('הוד השרון: the Saturday of its Rima is a column, at 4 billed and none of his', [two.dates.some(day => day.date === '2026-10-10'),
        two.foot.map(row => row.byDate['2026-10-10'])], [true, [0, 4, 4]]);
    holdBoard(device, '2026-10', 'p_3', 'October, רמת גן (archived)');
    const yosefOnly = holdBoard(device, '2026-10', 'p_4', 'October, נתניה (only a יוסף גבס count)');
    same('a site with only a יוסף גבס count: no man, billed nothing, its own row in no total, and still a board',
        [yosefOnly.rows.length, yosefOnly.foot.map(row => [row.kind, row.total]), yosefOnly.empty], [0, [['billed', 0], ['yosef', 2]], false]);
    same('and the site chosen stays in the filter although nothing was billed there', yosefOnly.sites.map(site => site.id), ['p_1', 'p_2', 'p_3', 'p_4']);
    const nothing = device.facts('2026-10', 'p_5');
    same('a site with nothing that month is the empty board', [nothing.empty, nothing.rows.length], [true, 0]);

    suite('the month written out by hand: a month with nobody on it');
    const empty = device.facts('2026-12');
    same('December: empty, its columns still the month\'s weekdays, its rows the active men with nothing drawn',
        [empty.empty, empty.dates.length, empty.rows.map(row => row.workerId), empty.foot.map(row => row.total)],
        [true, 27, ['w_1', 'w_2', 'w_5'], [0]]);
    const root = drawBoard(device, '2026-12', null);
    same('the board says the month summary\'s sentence and draws no grid, but its header stays',
        [root.querySelector('.month-board .empty-hint') ? root.querySelector('.month-board .empty-hint').textContent : null,
            root.querySelectorAll('.month-board-table').length, Boolean(root.querySelector('#monthBoardTitle')),
            root.querySelectorAll('.month-board-print, .month-board-share').length],
        [device.global('MONTH_SUMMARY_TEXT').empty, 0, true, 0]);
}

// ============================================================ 1-6 on seeded records
for (const seed of [11, 23, 37]) {
    suite(`seed ${seed}: every board of four months, and every site of each`);
    const { device, left, before } = seededPhone(seed);
    for (const key of ['2026-09', '2026-10', '2026-11', '2026-12']) {
        const facts = holdBoard(device, key, null, `seed ${seed} ${key}`);
        if (key === '2026-10') {
            check(`seed ${seed} ${key}: the man who left on the 20th is a row of the month he worked, marked`,
                facts.rows.some(row => row.workerId === left.id && row.active === false && row.total > 0));
            check(`seed ${seed} ${key}: the man who left before it is not`, !facts.rows.some(row => row.workerId === before.id));
        }
        // 6. TWO LETTERS only where two sites of this board share one.
        const firsts = facts.legend.map(site => device.call('siteInitial', site.name));
        const wrongLetters = facts.legend.filter((site, i) => {
            const shared = firsts.filter(letter => letter === firsts[i]).length > 1;
            return site.letters !== (shared ? plain(site.name).match(/[\p{L}\p{N}]/gu).slice(0, 2).join('') : firsts[i]);
        });
        same(`seed ${seed} ${key}: two letters exactly where two sites of the board share one`, wrongLetters, []);
        facts.sites.forEach(site => holdBoard(device, key, site.id, `seed ${seed} ${key} site ${site.id}`));
    }
    const october = device.facts('2026-10');
    check(`seed ${seed}: the seeded record really holds what it is for - two sites sharing «ה», an archived site, Rima, יוסף גבס, a Saturday`,
        october.legend.filter(site => site.letters.length === 2).length >= 2
        && october.legend.some(site => site.placeId === 'p_3')
        && october.foot.some(row => row.kind === 'rima') && october.foot.some(row => row.kind === 'yosef')
        && october.dates.some(day => day.saturday),
        JSON.stringify(october.legend.map(site => site.letters)));
}

// ============================================================ 7. it writes nothing
{
    suite('it writes nothing: every key on the disk, byte for byte');
    const device = handPhone();
    device.run('State.date = "2026-10-06";');
    const before = JSON.stringify(device.dump());
    given('there is a record on the disk to keep', before.includes('scheduleData'), before.slice(0, 80));
    // The facts, every month and site; the draw; the arrows, the chip and the filter, through
    // the board's own controls; the picture's reading; a cell's and a name's navigation.
    ['2026-09', '2026-10', '2026-11'].forEach(key => { device.facts(key); ['p_1', 'p_2', 'p_3', 'p_4'].forEach(id => device.facts(key, id)); });
    device.run('showView("week"); setWeekFromDate("2026-10-06");');
    const door = device.dom.getElementById('monthBoardDoor');
    given('the week\'s grid has the door in its corner', Boolean(door) && door.closest('th.corner') !== null);
    door.click();
    same('the door opens the board on the month of the week on screen, every site, entered at its title',
        [device.run('weekPhoneMode'), device.run('MONTH_BOARD_KEY'), device.run('MONTH_BOARD_PLACE'), device.dom.activeElement.id],
        ['month', '2026-10', null, 'monthBoardTitle']);
    const press = name => device.dom.querySelector(`#weekView [data-month-board="${name}"]`).click();
    press('next');
    same('«חודש הבא» steps to November and keeps its own focus', [device.run('MONTH_BOARD_KEY'),
        device.dom.activeElement.getAttribute('data-month-board')], ['2026-11', 'next']);
    same('on this month there is no «החודש»', device.dom.querySelectorAll('#weekView [data-month-board="home"]').length, 0);
    press('prev'); press('prev');
    same('«חודש קודם» twice: September, and «החודש» is back', [device.run('MONTH_BOARD_KEY'),
        device.dom.querySelectorAll('#weekView [data-month-board="home"]').length], ['2026-09', 1]);
    press('home');
    same('«החודש» goes to this month and leaves the focus on the title, the chip being gone',
        [device.run('MONTH_BOARD_KEY'), device.dom.activeElement.id], ['2026-11', 'monthBoardTitle']);
    press('prev');
    const select = device.dom.getElementById('monthBoardPlace');
    same('the filter lists every site of the month after «כל האתרים»', select.children.map(option => [option.value, option.textContent]),
        [['', 'כל האתרים'], ['p_1', 'הרצליה'], ['p_2', 'הוד השרון'], ['p_3', 'רמת גן']]);
    select.value = 'p_2';
    select.dispatch('change');
    same('choosing a site narrows the board to it and keeps the focus on the list', [device.run('MONTH_BOARD_PLACE'),
        device.dom.getElementById('monthBoardTitle').textContent, device.dom.activeElement.id],
        ['p_2', `לוח חודשי · אוקטובר 2026 · ${iso('הוד השרון')}`, 'monthBoardPlace']);
    const spec = device.run('JSON.stringify(readMonthPrintout())');
    given('the picture\'s reading read the board', JSON.parse(spec).rows.length === 2, spec.slice(0, 120));
    device.dom.getElementById('monthBoardPlace').value = '';
    device.dom.getElementById('monthBoardPlace').dispatch('change');
    const name = device.dom.querySelector('#weekView tbody tr[data-worker-id="w_2"] .month-board-who');
    name.click();
    same('a name opens that man\'s card, and nothing else', [device.cards, device.views.slice(-1)], [['w_2'], ['week']]);
    same('the name button is named by his name and his month', name.getAttribute('aria-label'), `${iso('בני טסט')} · 3 ימי נוכחות`);
    const cellNode = device.dom.querySelector('#weekView tbody tr[data-worker-id="w_1"] td.week-cell[data-date="2026-10-05"]');
    const block = cellNode.querySelector('.cell-line');
    block.click();
    same('a tap on a cell (on its block) opens that day: the date chosen by hand, the day screen',
        [device.run('State.date'), device.chosen, device.views.slice(-1)], ['2026-10-05', 1, ['day']]);
    device.run('showView("week"); setWeekPhoneMode("month");');
    const enter = device.dom.querySelector('#weekView tbody tr[data-worker-id="w_1"] td.week-cell[data-date="2026-10-02"]')
        .dispatch('keydown', { key: 'Enter' });
    same('Enter on a cell does the same, and is taken', [device.run('State.date'), enter.defaultPrevented], ['2026-10-02', true]);
    device.run('showView("week"); setWeekPhoneMode("month");');
    device.dom.querySelector('#weekView th[data-date="2026-10-06"] .month-board-day').click();
    same('a date\'s button opens that day', [device.run('State.date'), device.views.slice(-1)], ['2026-10-06', ['day']]);
    device.run('showView("week"); setWeekPhoneMode("month");');
    press('back');
    same('«חזרה לטבלת השבוע» goes back to the grid and leaves the focus on the door', [device.run('weekPhoneMode'), device.dom.activeElement.id],
        ['grid', 'monthBoardDoor']);
    same('openMonthBoard(key, site) shows the week tab on that board and answers true', [device.run('openMonthBoard("2026-10", "p_1")'),
        device.run('weekPhoneMode'), device.run('MONTH_BOARD_KEY'), device.run('MONTH_BOARD_PLACE'), device.dom.activeElement.id],
        [true, 'month', '2026-10', 'p_1', 'monthBoardTitle']);
    same('openMonthBoard(null, null): this month, every site', [device.run('openMonthBoard(null, null)'), device.run('MONTH_BOARD_KEY'), device.run('MONTH_BOARD_PLACE')],
        [true, '2026-11', null]);
    same('leaving the tab and coming back shows the grid', (device.run('showView("week")'), device.run('weekPhoneMode')), 'grid');
    same('NOTHING ON THE DISK MOVED', JSON.stringify(device.dump()), before);
    // And the comparison can see a write.
    device.State.commit(device.call('setRimaCount', device.State.schedule, '2026-10-07', 'p_1', 2));
    check('a real write is seen by the same comparison', JSON.stringify(device.dump()) !== before);
}

// ============================================================ 8. the words
{
    suite('the words: every new one pinned, every borrowed one in its owner');
    const device = handPhone();
    const T = device.global('MONTH_BOARD_TEXT');
    const R = device.global('MONTH_BOARD_REUSED');
    same('the door', T.door, 'לוח חודשי');
    same('the title, every site and one site', [T.title('נובמבר', 2026, ''), T.title('נובמבר', 2026, iso('הרצליה'))],
        ['לוח חודשי · נובמבר 2026', `לוח חודשי · נובמבר 2026 · ${iso('הרצליה')}`]);
    same('the filter\'s label', T.filter, 'אתר');
    same('a name button, one day and many', [T.rowName(iso('אבי'), 1), T.rowName(iso('אבי'), 0), T.rowName(iso('אבי'), 12)],
        [`${iso('אבי')} · יום נוכחות אחד`, `${iso('אבי')} · 0 ימי נוכחות`, `${iso('אבי')} · 12 ימי נוכחות`]);
    same('the picture\'s file', T.file('2026-11'), 'farkad-לוח-חודשי-2026-11.png');
    same('the new words are exactly these five', Object.keys(T).sort(), ['door', 'file', 'filter', 'rowName', 'title']);
    check('the block is frozen', Object.isFrozen(T) && Object.isFrozen(R));
    check('«יום נוכחות אחד» and «ימי נוכחות» are the statement\'s own', REPORTS.includes("countedIn(summary.attendanceDays, 'יום נוכחות אחד', 'ימי נוכחות')"));

    // The borrowed words, each where its owner says it: the week drawn by the week's own
    // functions, and the reports' source.
    device.run('showView("week"); setWeekFromDate("2026-10-01"); setWeekPhoneMode("grid");');
    const week = device.dom.getElementById('weekView');
    const archived = device.run('renderWeekCell(State.worker("w_3"), "2026-10-01")');
    const absent = device.run('renderWeekCell(State.worker("w_1"), "2026-10-02")');
    same('the corner, the foot, the badge, the marks and the tap, as the week draws them',
        [week.querySelector('.week-table .corner .name-clip').textContent, week.querySelector('.week-table tfoot .name-clip').textContent,
            week.querySelector('.week-table tbody .badge').textContent, week.querySelector('.week-legend-note').textContent,
            week.querySelector('.week-grid-hint').textContent],
        [R.corner, R.men, R.inactive, R.marks, R.tap]);
    same('print and share, as the week\'s header says them', week.querySelectorAll('.week-header button').map(b => b.textContent).slice(-2), [R.print, R.share]);
    same('an absent cell\'s word', absent.textContent, R.absent);
    check('the cell\'s two rate words are the week cell\'s', WEEK.includes(`word = '${R.double}';`) && WEEK.includes(`hours ? plusAmount(hours) : '${R.extra}'`));
    check('and an archived man is drawn with the week\'s badge too', archived.className.includes('cell-filled'));
    device.run('setWeekPhoneMode("days");');
    same('the way back from the days, as the week says it', week.querySelector('.week-phone-back').textContent, R.back);
    check('«נוכחות», the pay sheet\'s column', REPORTS.includes("{ header: 'נוכחות', value: row => row.attendanceDays, always: true }") && R.attendance === 'נוכחות');
    check('«החודש», the reports\' chip', REPORTS.includes(`presetChip('month', '${R.thisMonth}'`));
    check('«כל האתרים», the billing filter', REPORTS.includes(`chip('${R.allSites}', null)`));
    same('the borrowed block is exactly these fourteen', Object.keys(R).sort(),
        ['absent', 'allSites', 'attendance', 'back', 'corner', 'double', 'extra', 'inactive', 'marks', 'men', 'print', 'share', 'tap', 'thisMonth']);

    // The words read from their owners when the board is drawn - never repeated here.
    const root = drawBoard(device, '2026-10', 'p_1');
    const M = device.global('MONTH_SUMMARY_TEXT');
    same('«חודש קודם» / «חודש הבא», read off «סיכום חודש»', ['prev', 'next'].map(key =>
        root.querySelector(`[data-month-board="${key}"]`).textContent), [M.prev, M.next]);
    same('the month\'s name is «סיכום חודש»\'s', device.facts('2026-10').title.split(' · ')[1], `${M.months[9]} 2026`);
    same('the foot\'s titles are the reports\' constants', root.querySelectorAll('tfoot .month-board-foot-label').map(node => node.textContent),
        [device.global('NO_RIMA_TITLE'), device.global('RIMA_TITLE'), device.global('NO_RIMA_TOTAL')]);
    same('the Rima note is «סיכום חודש»\'s, without «שלמעלה»', root.querySelector('.month-board-note-rima').textContent, M.rimaNote);
    const full = drawBoard(device, '2026-10', null);
    same('and יוסף גבס\'s title and note are the reports\'', [full.querySelector('.month-board-foot-yosef .month-board-foot-label').textContent,
        full.querySelector('.month-board-note-yosef').textContent], [device.global('YOSEF_GEVES_TITLE'), device.global('YOSEF_GEVES_NOTE')]);
    same('the corner and the total column\'s head, on the board', [full.querySelector('.month-board-corner').textContent,
        full.querySelector('.month-board-total-head').textContent], [R.corner, R.attendance]);

    // No word that mixes Hebrew and Arabic letters (tests/reportnames.test.mjs scans all of js/).
    const mixed = (BOARD.match(/[\p{L}׳״]+/gu) || []).filter(word => /[֐-׿]/.test(word) && /[؀-ۿ]/.test(word));
    same('no word of the file mixes Hebrew and Arabic letters', mixed, []);
    check('and the board never says «נשלח»', !BOARD.includes('נשלח'));
}

// ============================================================ the file's promises, read as text
{
    suite('it reads, prices nothing, and is wired where the contract says');
    const code = BOARD.replace(/\/\/[^\n]*/g, '');
    const money = ['payrollReport', 'payrollRows', 'payrollBandTotals', 'workerAccountFor', 'moneyText', 'agora(', 'ratesForDay',
        'dailyRate', 'hourlyRate', 'reportReadOnce', 'carryReportingEnabled'];
    same('no money function and no rate is named in it', money.filter(name => code.includes(name)), []);
    same('no writer, no Store, no disk, no browser dialog', ['State.commit', 'State.save', 'commitMany', 'Store.', 'localStorage',
        'sessionStorage', 'indexedDB', 'alert(', 'confirm(', 'prompt('].filter(name => code.includes(name)), []);
    const page = source('index.html');
    const scripts = [...page.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    same('index.html loads it straight after find.js, after everything it reads', scripts.slice(scripts.indexOf('js/ui/find.js'), scripts.indexOf('js/ui/find.js') + 2),
        ['js/ui/find.js', 'js/ui/monthboard.js']);
    check('…and before printout.js, which asks for its picture by name',
        scripts.indexOf('js/ui/monthboard.js') > scripts.indexOf('js/ui/week.js') && scripts.indexOf('js/ui/monthboard.js') > scripts.indexOf('js/ui/monthsummary.js')
        && scripts.indexOf('js/ui/monthboard.js') > scripts.indexOf('js/ui/workercard.js') && scripts.indexOf('js/ui/monthboard.js') < scripts.indexOf('js/app.js'));
    const sw = source('sw.js');
    check('sw.js keeps it in the shell, after find.js', sw.includes("'./js/ui/find.js',\n    './js/ui/monthboard.js',"));
    const branch = "if (weekPhoneMode === 'month' && typeof renderMonthBoard === 'function' && State.schedule.workers.length > 0) {\n        renderMonthBoard(root);\n        return;\n    }";
    const draw = WEEK.slice(WEEK.indexOf('function renderWeek() {'));
    check('week.js asks for the door and the board through typeof, and nothing else of it',
        WEEK.includes("if (typeof monthBoardDoor === 'function') corner.appendChild(monthBoardDoor());")
        && WEEK.includes(branch) && !/MONTH_BOARD_/.test(WEEK));
    check('and the board\'s branch stands before the week clears its section: the board reads where the reader was first',
        draw.indexOf(branch) > 0 && draw.indexOf(branch) < draw.indexOf('clear(root);'));
    check('printout.js dispatches the kind \'month\' in two lines and names nothing else of it',
        PRINTOUT.includes("kind === 'month' ? (typeof readMonthPrintout === 'function' ? readMonthPrintout() : null)")
        && PRINTOUT.includes("kind === 'month' ? planMonthPrintout(spec, probe, family)")
        && (PRINTOUT.match(/Month/g) || []).length === 3);
    check('nothing in the board runs at load: no top-level call', !/^[A-Za-z_$][\w$]*\(/m.test(BOARD));
}

// ============================================================ one map of names per draw, and no week cell
{
    suite('a draw: one whole-record map of site names, and renderWeekCell never called');
    const device = handPhone();
    device.run(`window.__whole = 0; window.__weekCells = 0;
        const realLabels = placeLabelsIn;
        placeLabelsIn = function (schedule, from, to) { if (from === undefined) __whole += 1; return realLabels.apply(this, arguments); };
        const realCell = renderWeekCell;
        renderWeekCell = function () { __weekCells += 1; return realCell.apply(this, arguments); };`);
    const draws = [['2026-10', null], ['2026-10', 'p_1'], ['2026-10', 'p_2'], ['2026-11', null], ['2026-12', null]];
    const counted = draws.map(([key, place]) => {
        device.run('__whole = 0; __weekCells = 0;');
        drawBoard(device, key, place);
        return [key, place, device.run('__whole'), device.run('__weekCells')];
    });
    same('every draw builds the names\' map over the whole record once - the map the week\'s cell uses - and calls the week\'s cell never',
        counted, draws.map(([key, place]) => [key, place, 1, 0]));
    device.run('__weekCells = 0;');
    device.run('renderWeekCell(State.worker("w_1"), "2026-10-01")');
    same('(and the spy does count the week\'s cell when it is called)', device.run('__weekCells'), 1);
}

// ============================================================ 3's one exception: an older closure
//
// A closure an older build wrote carries no periodTo, and frozenPeriodFor matches it to ANY
// range that starts on its first day (js/model/schema.js) - so on a month whose first day is
// that Friday, payrollReport answers the closure's frozen counts for the whole month. The
// board follows the live record. May 2026 opens on a Friday.
{
    suite('the one exception: a month opening on a closed week recorded with no periodTo');
    const device = withBoard(makeDevice({ deviceId: 'd_monthboard_legacy' }));
    const s = device.State.schedule;
    s.places = [{ id: 'p_1', name: 'הרצליה', active: true }];
    s.workers = [
        { id: 'w_1', name: 'אבי שבועי', active: true, dailyRate: 400, hourlyRate: 50, payCycles: '2026-04-03=weekly' },
        { id: 'w_2', name: 'בני דו שבועי', active: true, dailyRate: 400, hourlyRate: 50 }
    ];
    ['2026-05-01', '2026-05-03', '2026-05-04', '2026-05-05'].forEach(date => device.call('assignPlace', s, date, 'w_1', 'actual', 'p_1'));
    ['2026-05-04', '2026-05-11', '2026-05-12'].forEach(date => device.call('assignPlace', s, date, 'w_2', 'actual', 'p_1'));
    // His week, closed by an older build on the 8th: four days, and no periodTo.
    s.ledger = s.ledger || {};
    s.ledger.advances = s.ledger.advances || {};
    s.ledger.advances.l_legacy_close = { id: 'l_legacy_close', kind: 'closed', workerId: 'w_1', periodFrom: '2026-05-01',
        at: '2026-05-08T09:00:00.000Z', by: 'd_older_build', gross: 1600,
        basis: { attendanceDays: 4, payUnits: 4, normalDays: 4, doubleDays: 0, extraHours: 0, siteVisits: 4, absent: 0 } };
    // Then a day of that week put right: he also worked the 6th.
    device.call('assignPlace', s, '2026-05-06', 'w_1', 'actual', 'p_1');
    given('May 2026 opens on a Friday', weekday('2026-05-01') === 5);
    const facts = device.facts('2026-05');
    const pay = payroll(device, '2026-05');
    const board = id => facts.rows.find(row => row.workerId === id);
    const filled = id => board(id).cells.filter(cell => cell.lines.length > 0).length;
    same('payrollReport answers the closure\'s frozen four for the whole month', pay.find(one => one.id === 'w_1').days, 4);
    same('the board answers the live record: five, his filled cells', [board('w_1').total, filled('w_1')], [5, 5]);
    same('and the two differ by exactly the day put right', board('w_1').total - pay.find(one => one.id === 'w_1').days, 1);
    same('the man with no such closure is payrollReport\'s exactly', [board('w_2').total, filled('w_2')], [pay.find(one => one.id === 'w_2').days, 3]);
    // The same closure as this build writes it - with its periodTo - is frozen for its own week
    // and no other, and the month is the live record on both.
    s.ledger.advances.l_legacy_close.periodTo = '2026-05-07';
    same('with its periodTo the closure freezes its own week only, and the month agrees with the board',
        payroll(device, '2026-05').find(one => one.id === 'w_1').days, device.facts('2026-05').rows.find(row => row.workerId === 'w_1').total);
}

// ============================================================ 9. the cost
{
    suite('the cost: a season\'s month, 40 men by 31 days');
    const device = withBoard(makeDevice({ deviceId: 'd_monthboard_season' }));
    const s = device.State.schedule;
    const rand = mulberry(4242);
    s.workers = Array.from({ length: 40 }, (_, i) => ({ id: `w_${i + 1}`, name: `עובד עונה ${i + 1}`, active: i < 37, dailyRate: 400, hourlyRate: 50 }));
    s.places = Array.from({ length: 8 }, (_, i) => ({ id: `p_${i + 1}`, name: `${SEED_SITES[i % SEED_SITES.length]} ${i + 1}`, active: true }));
    for (let date = '2026-08-01'; date <= '2026-10-31'; date = addDays(date, 1)) {
        s.workers.forEach(worker => {
            const roll = rand();
            if (roll < 0.22) return;
            if (roll < 0.27) { device.call('markAbsent', s, date, worker.id, 'actual'); return; }
            device.call('assignPlace', s, date, worker.id, 'actual', `p_${1 + Math.floor(rand() * 8)}`, rand() < 0.1 ? 'double' : undefined);
        });
        if (rand() < 0.5) device.call('setRimaCount', s, date, 'p_1', 2);
        if (rand() < 0.3) device.call('setYosefGevesCount', s, date, 'p_2', 1);
    }
    device.State.save({ silent: true });
    // The reports this reading asks, counted.
    device.run(`window.__asked = {};
        ['invoiceByDate', 'invoiceWithoutRima', 'rimaReport', 'yosefGevesReport', 'placeLabelsIn', 'payrollReport', 'anyRecordOnRestDay']
            .forEach(name => { const real = window[name]; window[name] = function () { __asked[name] = (__asked[name] || 0) + 1; return real.apply(this, arguments); }; });`);
    const time = place => {
        const runs = [];
        for (let n = 0; n < 5; n += 1) {
            const t0 = performance.now();
            device.run(`monthBoardFacts('2026-10', ${JSON.stringify(place)})`);
            runs.push(performance.now() - t0);
        }
        return runs.sort((a, b) => a - b)[2];
    };
    device.run('__asked = {};');
    const facts = device.facts('2026-10');
    const sorted = text => Object.fromEntries(Object.entries(JSON.parse(text)).sort(([a], [b]) => (a < b ? -1 : 1)));
    const askedAll = sorted(device.run('JSON.stringify(__asked)'));
    device.run('__asked = {};');
    device.facts('2026-10', 'p_1');
    const askedOne = sorted(device.run('JSON.stringify(__asked)'));
    given('the season is a season: 40 men and 27 days on the board', facts.rows.length === 40 && facts.dates.length >= 27, `${facts.rows.length} x ${facts.dates.length}`);
    const all = time(null);
    const one = time('p_1');
    console.log(`        monthBoardFacts, median of 5: every site ${all.toFixed(2)} ms, one site ${one.toFixed(2)} ms`);
    check(`every site: ${all.toFixed(2)} ms, within 25 ms`, all <= 25, `${all}`);
    check(`one site: ${one.toFixed(2)} ms, within 25 ms`, one <= 25, `${one}`);
    // placeLabelsIn: the board's one map, and the three reports' own (each asks it for itself);
    // anyRecordOnRestDay: once for each of October's five Saturdays.
    same('every site asks the invoice once, Rima and יוסף גבס once each, the names once - and never the pay sheet',
        askedAll, { anyRecordOnRestDay: 5, invoiceByDate: 1, placeLabelsIn: 4, rimaReport: 1, yosefGevesReport: 1 });
    same('one site asks its own three counts on top - and never the pay sheet', askedOne,
        { invoiceByDate: 2, invoiceWithoutRima: 1, placeLabelsIn: 5, rimaReport: 1, yosefGevesReport: 1 });
}

// ============================================================ 10. the picture's reading
{
    suite('the picture: what it reads off the board is what the facts said');
    const device = handPhone();
    for (const place of [null, 'p_1', 'p_2']) {
        const facts = device.facts('2026-10', place);
        drawBoard(device, '2026-10', place);
        const spec = JSON.parse(device.run('JSON.stringify(readMonthPrintout())'));
        const label = place === null ? 'every site' : place;
        same(`${label}: the title and the file`, [spec.title, spec.name], [plain(facts.title).replace(/\s+/g, ' '), 'farkad-לוח-חודשי-2026-10.png']);
        same(`${label}: the dates, their letters and their days`, spec.days.map(day => [day.date, day.letter, day.day, day.saturday]),
            facts.dates.map(day => [day.date, device.global('HEBREW_DAY_LETTERS')[weekday(day.date)], day.date.slice(8), day.saturday]));
        same(`${label}: every man, his badge and his total`, spec.rows.map(row => [row.workerId, row.name, row.badge, row.total]),
            facts.rows.map(row => [row.workerId, row.name, row.active ? '' : 'לא פעיל', String(row.total)]));
        same(`${label}: every cell - absent, and each block's site, letters, mark and rate`,
            spec.rows.map(row => row.cells.map(cell => [cell.date, cell.absent, cell.lines.map(line => [line.placeId, line.initial, line.mark, line.double, line.extra])])),
            facts.rows.map(row => row.cells.map(cell => [cell.date, cell.absent, cell.lines.map(line => [line.placeId, line.initial, line.mark, line.double, line.extra])])));
        same(`${label}: each block's colour is the one the screen painted it`,
            spec.rows.flatMap(row => row.cells.flatMap(cell => cell.lines.map(line => line.color))),
            facts.rows.flatMap(row => row.cells.flatMap(cell => cell.lines.map(line => device.call('siteColorVar', line.placeId)))));
        // NOT «בלי עובדי רימא»: the owner's figure, screen and workbook only (v167).
        same(`${label}: every foot row says whether it leaves the phone - all but the site's own men`,
            facts.foot.map(row => [row.kind, row.paper]), facts.foot.map(row => [row.kind, row.kind !== 'own']));
        same(`${label}: the foot rows read off the board are the ones that leave it`, spec.foot.map(row => [row.kind, row.label, row.counts, row.total]),
            facts.foot.filter(row => row.paper).map(row => [row.kind, row.label,
                facts.dates.map(day => (row.byDate[day.date] > 0 ? String(row.byDate[day.date]) : '')), String(row.total)]));
        same(`${label}: no «בלי עובדי רימא» row and no second worker-site-day line in the picture`,
            [spec.foot.filter(row => row.label === device.global('NO_RIMA_TITLE')).length,
                spec.foot.filter(row => row.label === device.global('NO_RIMA_TOTAL')).length],
            [0, place === null ? 0 : 1]);
        same(`${label}: the legend`, spec.legend.map(site => [site.placeId, site.letters, site.mark, site.name]),
            facts.legend.map(site => [site.placeId, site.letters, site.mark, site.name]));
        same(`${label}: the notes - the marks, then each count's`, spec.notes,
            [device.global('MONTH_BOARD_REUSED').marks].concat(facts.notes.map(note => note.text)));

        // The plan, on a stand-in canvas: a row per man then per foot row, a block per site
        // block then per legend swatch, and every one of them inside the picture.
        const plan = JSON.parse(device.run(`(function () {
            const spec = readMonthPrintout();
            const said = [];
            const probe = { font: '', measureText: text => ({ width: String(text).length * 7 }) };
            const ctx = new Proxy({ font: '', fillStyle: '', textAlign: '', globalAlpha: 1 }, { get(target, key) {
                if (key in target) return target[key];
                if (key === 'fillText') return (text, x, y) => said.push([String(text), x, y]);
                if (key === 'measureText') return text => ({ width: String(text).length * 7 });
                return () => {};
            } });
            const made = planMonthPrintout(spec, probe, 'sans-serif');
            const layout = made.draw(ctx);
            return JSON.stringify({ width: made.width, height: made.height, rows: layout.rows, chips: layout.chips, said });
        })()`));
        const lines = facts.rows.reduce((sum, row) => sum + row.cells.reduce((n, cell) => n + cell.lines.length, 0), 0);
        same(`${label}: the plan draws a row per man and per foot row, a block per site block and per legend swatch`,
            [plan.rows.length, plan.chips.length], [facts.rows.length + spec.foot.length, lines + facts.legend.length]);
        check(`${label}: and every one of them inside the picture`, plan.rows.concat(plan.chips)
            .every(box => box.x >= 0 && box.y >= 0 && box.x + box.w <= plan.width && box.y + box.h <= plan.height), JSON.stringify([plan.width, plan.height]));
        const words = plan.said.map(([text]) => text);
        check(`${label}: every man's name and every block's letters are written`,
            facts.rows.every(row => words.includes(row.name))
            && facts.rows.every(row => row.cells.every(cell => cell.lines.every(line => words.includes(`${line.mark}${line.initial}`)))),
            JSON.stringify(words.slice(0, 12)));
    }
    const empty = drawBoard(device, '2026-12', null);
    same('a month with nobody on it has no picture to draw', [device.run('readMonthPrintout()'), empty.querySelectorAll('.month-board').length], [null, 1]);
}

report();
