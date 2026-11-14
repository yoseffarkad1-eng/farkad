// «סגירת שבוע» (js/ui/weeklyclose.js) on devices.
//
//   node tests/weeklyclose.test.mjs
//
// The pass closes the week's accounts in one sitting, and it is the per-man close
// («סגור את החשבון», closeAccountFor in js/ui/reports.js) run for many men. So this suite
// holds, on real devices of this build:
//
//   W1  WHO IS ON IT: each man in his own last finished period (weekly, fortnightly, a
//       period that ends today only once today is recorded for him), nobody whose period
//       is closed or has no day of work in it (v198); the groups oldest first.
//   W2  EVERY FIGURE IS THE CLOSE'S OWN: the wage, what can come off, the debt, and for
//       every amount tried what is left to pay and what stays owed - planPeriodClosure's,
//       advanceAccount's and the per-man box's preview, word for word.
//   W3  THE SAME BYTES: twin phones from one disk, one closing three men through the pass
//       and the other through closeAccountFor man by man, at one moment - the same record
//       on the disk, byte for byte; and every change built inside the pass's memory equal
//       to the same change built with no memory at all.
//   W4  DOUBLE PRESS: a second press, and a second write of the same picks, write nothing.
//   W5  THE RECORD MOVED between the drawing and the press (an advance, a repayment, a
//       day, a close on another phone): nothing written, the disk byte for byte, the men
//       named, every other choice kept.
//   W6  NOT SYNCED (the owner's D4): the real predicate on real sync states, the two
//       sentences, and nothing written; the predicate held to the deletion's own.
//   W7  AN EARLIER PERIOD LEFT OPEN (D5): refused and named, with v195's button that only
//       navigates; and the finding behind it (L7, problem (a)) - since v198 the per-man
//       writer refuses it too (planPeriodClosure 'earlierOpen' / 'laterClosed'), a record an
//       older build wrote out of order cannot be completed into a double deduction, and the
//       pass says the model's two order reasons in the model's own words.
//   W8  THE GATES: the button and the reading under the carry shut, an unapproved record,
//       and the writer shut.
//   W9  THE SCREEN: the prefilled field (D2), «בלי ניכוי», «דלג על העובד» (D3: no reason
//       asked), a bad amount stopping «המשך», the summary naming every man left at 0,
//       skipped or held, the totals, the result page, and the disk unmoved by all of the
//       looking.
//   W10 WHAT IT COSTS: fourteen men on a season of days, read and written inside a bound.
//   W11 THE WORDS: every new string word for word; every borrowed one in its owner's source.
//   W13 THE OWNER'S ANSWERS (2026-11-14, v198): only a man who worked is in the pass, and
//       his earlier periods with a debt and no day of work closed first at 0 in the same
//       write (his decision on what that left open), a period with work never (1, 9); weekly men every week and the fortnightly men with
//       them every other week (2); no cap beyond his wage (5); after the close one door per
//       man to his own statement, byte for byte, never "sent" (7); and the way to a
//       correction of a closed deduction - navigation only, and all of it or nothing (8).
//
// Synthetic names and money throughout. No browser, no emulator.

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDevice, makeCloud, settle, settleUntil } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import * as oracle from './oracle.mjs';

process.env.TZ = 'Asia/Jerusalem';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = file => readFileSync(join(ROOT, file), 'utf8');
const WEEKLY = source('js/ui/weeklyclose.js');

const OPEN = { carryAdvances: true, ledgerWrites: true };
const SHUT = { carryAdvances: false, ledgerWrites: false };
const NOWRITE = { carryAdvances: true, ledgerWrites: false };
const j = value => JSON.stringify(value);
const plain = text => String(text).replace(/[⁦-⁩‎‏]/g, '');
const addDays = (date, days) => {
    const [y, m, d] = date.split('-').map(Number);
    const at = new Date(y, m - 1, d + days, 12);
    return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
};
const weekdays = (from, to) => {
    const out = [];
    for (let date = from; date <= to; date = addDays(date, 1)) {
        if (new Date(`${date}T12:00:00`).getDay() !== 6) out.push(date);
    }
    return out;
};

// ---------------------------------------------------------------- a DOM to read and press
function makeDom() {
    const byId = new Map();
    const doc = { activeElement: null };
    function matchesOne(item, step) {
        const parsed = step.match(/^([a-z0-9]*)((?:[.#][\w-]+)*)$/i);
        if (!parsed) return false;
        if (parsed[1] && item.tagName !== parsed[1].toUpperCase()) return false;
        return (parsed[2].match(/[.#][\w-]+/g) || []).every(part => (part[0] === '.'
            ? item.classList.contains(part.slice(1)) : item.id === part.slice(1)));
    }
    function descendants(root) {
        const out = [];
        root.children.forEach(child => { out.push(child); descendants(child).forEach(one => out.push(one)); });
        return out;
    }
    function query(root, selector) {
        const steps = String(selector).trim().split(/\s+/);
        let pool = descendants(root);
        steps.forEach((step, index) => {
            const matched = pool.filter(item => matchesOne(item, step));
            pool = index === steps.length - 1 ? matched
                : [...new Set(matched.reduce((all, item) => all.concat(descendants(item)), []))];
        });
        return pool;
    }
    function node(tag) {
        let text = '';
        let classes = '';
        let id = '';
        const self = {
            tagName: String(tag).toUpperCase(), nodeName: String(tag).toUpperCase(), children: [], parentNode: null,
            attributes: {}, dataset: {}, style: {}, listeners: {}, hidden: false, disabled: false, value: '', type: '',
            scrollTop: 0, offsetHeight: 0,
            classList: {
                add(name) { if (!self.classList.contains(name)) classes = `${classes} ${name}`.trim(); },
                remove(name) { classes = classes.split(/\s+/).filter(one => one && one !== name).join(' '); },
                contains(name) { return classes.split(/\s+/).indexOf(name) !== -1; },
                toggle(name, on) { if (on === undefined ? !self.classList.contains(name) : on) self.classList.add(name); else self.classList.remove(name); }
            },
            appendChild(child) {
                if (child.parentNode) child.parentNode.removeChild(child);
                self.children.push(child); child.parentNode = self; return child;
            },
            insertBefore(child, before) {
                if (child.parentNode) child.parentNode.removeChild(child);
                const at = self.children.indexOf(before);
                self.children.splice(at === -1 ? self.children.length : at, 0, child);
                child.parentNode = self; return child;
            },
            removeChild(child) {
                const at = self.children.indexOf(child);
                if (at !== -1) self.children.splice(at, 1);
                child.parentNode = null; return child;
            },
            replaceWith(other) { if (self.parentNode) { self.parentNode.insertBefore(other, self); self.parentNode.removeChild(self); } },
            remove() { if (self.parentNode) self.parentNode.removeChild(self); },
            setAttribute(name, value) { if (name === 'id') self.id = value; else self.attributes[name] = String(value); },
            getAttribute(name) { return Object.prototype.hasOwnProperty.call(self.attributes, name) ? self.attributes[name] : null; },
            removeAttribute(name) { delete self.attributes[name]; },
            addEventListener(type, heard) { (self.listeners[type] = self.listeners[type] || []).push(heard); },
            removeEventListener() {},
            focus() { doc.activeElement = self; },
            blur() { if (doc.activeElement === self) doc.activeElement = null; },
            getBoundingClientRect() { return { height: 0, width: 0, top: 0, left: 0 }; },
            querySelector(selector) { return query(self, selector)[0] || null; },
            querySelectorAll(selector) { return query(self, selector); }
        };
        Object.defineProperty(self, 'className', { get: () => classes, set: value => { classes = String(value); } });
        Object.defineProperty(self, 'id', { get: () => id, set: value => { id = String(value); byId.set(id, self); } });
        Object.defineProperty(self, 'textContent', {
            get() { return self.children.length === 0 ? text : text + self.children.map(child => child.textContent).join(''); },
            set(value) {
                self.children.forEach(child => { child.parentNode = null; });
                self.children.length = 0;
                text = value === null || value === undefined ? '' : String(value);
            }
        });
        Object.defineProperty(self, 'firstChild', { get: () => self.children[0] || null });
        // v198: the pay sheet's table, drawn for a man's door on the close's page, asks these.
        Object.defineProperty(self, 'firstElementChild', { get: () => self.children[0] || null });
        Object.defineProperty(self, 'lastElementChild', { get: () => self.children[self.children.length - 1] || null });
        Object.defineProperty(self, 'isConnected', { get: () => true });
        return self;
    }
    const body = node('body');
    Object.assign(doc, {
        body, head: node('head'), documentElement: node('html'), createElement: node,
        createTextNode: value => { const made = node('#text'); made.textContent = value; return made; },
        getElementById: name => byId.get(String(name)) || null,
        querySelector: selector => body.querySelector(selector),
        querySelectorAll: selector => body.querySelectorAll(selector),
        addEventListener() {}, removeEventListener() {}
    });
    return doc;
}

// The dialog's frame, exactly as index.html has it (W11 holds the two to one list of ids).
const FRAME_IDS = ['weeklyCloseModal', 'weeklyCloseTitle', 'weeklyCloseMeta', 'weeklyCloseSteps', 'weeklyCloseStatus',
    'weeklyCloseBody', 'weeklyCloseTotals', 'weeklyCloseGo', 'weeklyCloseBack'];
function frame(doc) {
    const make = (tag, id, cls, parent) => {
        const made = doc.createElement(tag);
        if (id) made.id = id;
        if (cls) made.className = cls;
        if (parent) parent.appendChild(made);
        return made;
    };
    const modal = make('div', 'weeklyCloseModal', 'modal', doc.body);
    const content = make('div', null, 'modal-content weekly-close-content', modal);
    make('h3', 'weeklyCloseTitle', null, content);
    make('p', 'weeklyCloseMeta', 'weekly-close-meta', content);
    make('div', 'weeklyCloseSteps', 'weekly-close-steps', content);
    make('p', 'weeklyCloseStatus', 'weekly-close-status', content).hidden = true;
    make('div', 'weeklyCloseBody', 'weekly-close-body', content);
    const foot = make('div', null, 'weekly-close-foot', content);
    make('div', 'weeklyCloseTotals', 'weekly-close-totals', foot).hidden = true;
    const actions = make('div', null, 'weekly-close-foot-actions', foot);
    make('button', 'weeklyCloseGo', 'weekly-close-go', actions).hidden = true;
    make('button', 'weeklyCloseBack', 'btn-secondary weekly-close-back', actions);
    ['reportsView', 'advancesView', 'workerDaysTitle', 'workerDaysMeta', 'workerDaysBody', 'workerDaysModal']
        .forEach(name => make('div', name, null, doc.body));
}

// ---------------------------------------------------------------- phones
function phone({ today = '2026-11-13', deviceId = 'd_office', storage = null, flags = OPEN } = {}) {
    const options = { deviceId, flags };
    if (storage) options.storage = storage;
    const d = makeDevice(options);
    d.setToday(today);
    d.Sync.pushDelayMs = 5;
    const doc = makeDom();
    frame(doc);
    d.doc = doc;
    d.ctx.document = doc;
    d.run = code => vm.runInContext(code, d.ctx, { filename: 'weeklyclose-suite' });
    // v198: seder.js and payslips.js too - the close's page draws each man's door from them.
    ['js/ui/sitecolor.js', 'js/ui/reports.js', 'js/ui/daycheck.js', 'js/ui/seder.js', 'js/ui/owes.js', 'js/ui/payslips.js']
        .forEach(file => d.run(source(file)));
    d.run(WEEKLY);
    // The two buttons of the foot, wired as index.html wires them (onclick on the global scope).
    doc.getElementById('weeklyCloseGo').addEventListener('click', () => d.run('weeklyCloseGo()'));
    doc.getElementById('weeklyCloseBack').addEventListener('click', () => d.run('weeklyCloseBack()'));
    d.told = [];
    d.asked = [];
    d.ctx.askTell = said => { d.told.push(typeof said === 'string' ? said : (said && (said.message || said.title))); return Promise.resolve(true); };
    d.ctx.askConfirm = question => { d.asked.push(question); return Promise.resolve(true); };
    d.ctx.render = () => {
        d.renders.count += 1;
        if (typeof d.ctx.renderWeeklyCloseIfOpen === 'function') d.ctx.renderWeeklyCloseIfOpen();
    };
    d.views = [];
    d.shown = [];
    d.ctx.showView = view => { d.views.push(view); };
    d.ctx.openWorkerDays = () => {};
    d.ctx.closeWorkerDays = () => {};
    d.ctx.showOtherAccount = span => { d.shown.push(span); };
    d.run('var currentView = "reports";');
    if (storage) d.State.load();
    return d;
}
// Shared and quiet, by the test's word - W6 asks the real predicate of real sync states.
const shared = d => { d.run('weeklyCloseShared = () => true;'); return d; };
// One moment for everything the device writes from here on.
function freeze(d, iso) {
    const Real = Date;
    class Fixed extends Real {
        constructor(...args) { if (args.length) super(...args); else super(iso); }
        static now() { return new Real(iso).getTime(); }
    }
    d.ctx.Date = Fixed;
}

// ---------------------------------------------------------------- seeding, through the
// app's own writers on the live schedule, saved once.
const PLACES = [{ id: 'p_01', name: 'אתר צפון', active: true }, { id: 'p_02', name: 'אתר דרום', active: true }];
function day(d, id, date, place = 'p_01') {
    const change = d.call('assignPlace', d.State.schedule, date, id, 'actual', place);
    if (!change || change.refused) throw new Error(`a day for ${id} on ${date}`);
}
function advance(d, id, date, amount, at) {
    return d.call('recordNewAdvance', d.State.schedule, id, date, amount, '', at || `${date}T07:00:00.000Z`, 'd_seed', 'cash')[0].value.id;
}
function approve(d) {
    const plan = d.call('planCarryMigration', d.State.schedule);
    if (!d.call('carryMigrationApproved', d.State.schedule, plan)) {
        d.call('recordCarryApproval', d.State.schedule, plan, '2026-10-01T09:00:00.000Z', 'd_person');
    }
}
function byHand(d, id, from, to, deduction, at) {
    return d.call('closePeriodChanges', d.State.schedule, id, from, to, at, 'd_seed', deduction);
}
function kept(d) {
    if (d.State.save({ silent: true }) !== true) throw new Error('the seeded record was not saved');
    return d;
}
const recordBytes = d => d.raw('scheduleData:v2');
const ledgerBytes = d => j((d.State.schedule.ledger || {}).advances || {});
const diskOf = d => {
    const out = d.dump();
    Object.keys(out).forEach(key => { if (key.indexOf('farkad:writeTick') === 0) delete out[key]; });
    return j(out);
};

// THREE MEN, today the Friday after the fortnight ends: פואד fortnightly with two advances,
// ואליד weekly with two, גסאן fortnightly with one. פואד's and ואליד's first advances fall
// in periods BEFORE their last finished one.
const NAMES = { w_f: 'פואד', w_w: 'ואליד', w_g: 'גסאן' };
function three(today = '2026-11-13') {
    const d = phone({ today });
    d.State.schedule.workers = [
        { id: 'w_f', name: 'פואד', active: true, dailyRate: 500, hourlyRate: 0 },
        { id: 'w_w', name: 'ואליד', active: true, dailyRate: 400, hourlyRate: 0, payCycles: '2026-10-16=weekly' },
        { id: 'w_g', name: 'גסאן', active: true, dailyRate: 450, hourlyRate: 0 }
    ];
    d.State.schedule.places = PLACES;
    weekdays('2026-10-16', '2026-11-12').forEach(date => ['w_f', 'w_w', 'w_g'].forEach(id => day(d, id, date)));
    advance(d, 'w_f', '2026-10-19', 1500);
    advance(d, 'w_f', '2026-11-02', 1000);
    advance(d, 'w_w', '2026-10-26', 800);
    advance(d, 'w_w', '2026-11-09', 600);
    advance(d, 'w_g', '2026-11-03', 900);
    approve(d);
    return kept(d);
}
// The same three after the earlier periods were closed BY HAND, oldest first, at the sheet's
// own figure - the owner's D5, done.
function threeInOrder(today) {
    const d = three(today);
    byHand(d, 'w_f', '2026-10-16', '2026-10-29', undefined, '2026-10-30T16:00:00.000Z');
    byHand(d, 'w_w', '2026-10-23', '2026-10-29', undefined, '2026-10-30T16:01:00.000Z');
    byHand(d, 'w_w', '2026-10-30', '2026-11-05', undefined, '2026-11-06T16:00:00.000Z');
    return kept(d);
}
const readOf = (d, at) => d.call('weeklyCloseRead', d.State.schedule, d.ctx.todayStr(), at || new Date().toISOString());
const manOf = (read, id) => read.men.filter(man => man.id === id)[0] || null;

// The screen, pressed.
const fire = (target, type) => (target.listeners[type] || []).forEach(heard => heard({ preventDefault() {}, target }));
const press = target => fire(target, 'click');
const cardOf = (d, id) => d.doc.getElementById('weeklyCloseBody').querySelectorAll('.weekly-close-card')
    .filter(card => card.dataset.worker === id)[0] || null;
function openCard(d, id) {
    const card = cardOf(d, id);
    if (!card.classList.contains('weekly-close-opened')) press(card.querySelector('.weekly-close-row'));
    return cardOf(d, id);
}
function typeInto(d, id, text) {
    const input = openCard(d, id).querySelector('.weekly-close-input');
    input.value = text;
    fire(input, 'input');
    return cardOf(d, id);
}
const statusOf = d => plain(d.doc.getElementById('weeklyCloseStatus').textContent);
const bodyText = d => plain(d.doc.getElementById('weeklyCloseBody').textContent);
const goOf = d => d.doc.getElementById('weeklyCloseGo');
const totalsOf = d => d.doc.getElementById('weeklyCloseTotals').querySelectorAll('.weekly-close-total b').map(node => plain(node.textContent));
const idle = d => settleUntil(() => d.run('!weeklyCloseBusy'), 60000, 5);

// Two phones on the harness's cloud, both synced by the real predicate (W12). Defined above
// the first suite, because its given() is the setup's, not a claim of the suite that calls it.
async function twoPhonesOnOneCloud() {
    const seed = shared(threeInOrder());
    seed.run('weeklyCloseShared = undefined;');
    const doc = JSON.parse(JSON.stringify(seed.State.schedule));
    Object.assign(doc, { protocol: 1, revision: 1, lastOpId: 'op_seed', updatedAt: '2026-11-13T06:00:00.000Z', updatedBy: 'd_seed' });
    const cloud = makeCloud({ doc });
    const gate = { open: true, waiting: [], adapter: {} };
    Object.keys(cloud.adapter).forEach(name => { gate.adapter[name] = (...args) => cloud.adapter[name](...args); });
    gate.adapter.subscribe = (next, error) => cloud.adapter.subscribe(snapshot => {
        if (gate.open) next(snapshot); else gate.waiting.push([next, snapshot]);
    }, error);
    const a = phone({ storage: seed.dump(), deviceId: 'd_A' });
    const b = phone({ storage: seed.dump(), deviceId: 'd_B' });
    a.Sync.connect(cloud.adapter);
    b.Sync.connect(gate.adapter);
    given('both phones are synced, by the real predicate',
        await settleUntil(() => a.call('weeklyCloseShared') && b.call('weeklyCloseShared'), 30000), j([a.Sync.status, b.Sync.status]));
    return { cloud, gate, a, b };
}
// ================================================================== W1 who is on it
{
    suite('W1 who is on the list: each man in his own last finished period, oldest first');
    const d = shared(three());
    const read = readOf(d);
    same('three men, in the roster\'s order', read.men.map(man => man.id), ['w_f', 'w_w', 'w_g']);
    same('each in his own period', read.men.map(man => [man.id, man.cycle, man.from, man.to]), [
        ['w_f', 'biweekly', '2026-10-30', '2026-11-12'],
        ['w_w', 'weekly', '2026-11-06', '2026-11-12'],
        ['w_g', 'biweekly', '2026-10-30', '2026-11-12']]);
    same('grouped: the fortnight that opened first, then the week', read.groups.map(group => [group.cycle, group.from, group.men.map(man => man.id)]), [
        ['biweekly', '2026-10-30', ['w_f', 'w_g']], ['weekly', '2026-11-06', ['w_w']]]);

    // A weekly man's week that ends TODAY: held until today is recorded for him, then his.
    const t = shared(threeInOrder('2026-11-12'));
    const held = manOf(readOf(t), 'w_w');
    same('on the Thursday the week ends, with today recorded, it is this week', [held.from, held.to, held.held], ['2026-11-06', '2026-11-12', null]);
    const u = phone({ today: '2026-11-19' });
    u.State.schedule.workers = [{ id: 'w_w', name: 'ואליד', active: true, dailyRate: 400, hourlyRate: 0, payCycles: '2026-10-16=weekly' }];
    u.State.schedule.places = PLACES;
    weekdays('2026-11-13', '2026-11-18').forEach(date => day(u, 'w_w', date));
    advance(u, 'w_w', '2026-11-16', 300);
    approve(u); kept(u); shared(u);
    same('the same Thursday with today not recorded: held, and why', [manOf(readOf(u), 'w_w').from, manOf(readOf(u), 'w_w').held],
        ['2026-11-13', { kind: 'endsToday' }]);
    u.State.commit(u.call('assignPlace', u.State.schedule, '2026-11-19', 'w_w', 'actual', 'p_01'));
    same('recorded, it is closable', manOf(readOf(u), 'w_w').held, null);

    // Nobody whose period is closed, or who has nothing in it.
    const e = phone({ today: '2026-11-13' });
    e.State.schedule.workers = [
        { id: 'w_a', name: 'אמיר', active: true, dailyRate: 400, hourlyRate: 0 },
        { id: 'w_b', name: 'באסל', active: true, dailyRate: 400, hourlyRate: 0 }];
    e.State.schedule.places = PLACES;
    weekdays('2026-10-30', '2026-11-12').forEach(date => day(e, 'w_a', date));
    approve(e); kept(e); shared(e);
    same('a man with no day, no advance and no debt in his period is not on it', readOf(e).men.map(man => man.id), ['w_a']);
    e.State.commitMany(byHand(e, 'w_a', '2026-10-30', '2026-11-12', 0, '2026-11-13T08:00:00.000Z'));
    same('his period closed: he is off it', readOf(e).men.map(man => man.id), []);
}

// ================================================================== W2 every figure is the close's own
{
    suite('W2 every figure is the per-man close\'s own, for every amount tried');
    const d = shared(threeInOrder());
    const at = '2026-11-13T15:00:00.000Z';
    const read = readOf(d, at);
    const rows = [];
    read.men.forEach(man => {
        const plan = d.call('planPeriodClosure', d.State.schedule, man.id, man.from, man.to, at);
        const account = d.call('advanceAccount', d.State.schedule, man.id, man.from, man.to);
        const row = d.call('payrollReport', d.State.schedule, man.from, man.to).filter(one => one.workerId === man.id)[0];
        rows.push([man.id, man.gross === plan.gross, man.max === plan.deducted, man.carriedIn === account.carriedIn,
            man.given === account.given, man.balance === Math.round((account.carriedForward + account.deducted) * 100) / 100,
            man.days === row.attendanceDays]);
        const tries = [0, 1, Math.floor(man.max / 3), Math.round(man.max / 2 * 100) / 100, man.max];
        tries.forEach(x => {
            const chosen = d.call('planPeriodClosure', d.State.schedule, man.id, man.from, man.to, at, x);
            const figures = d.call('weeklyCloseFigures', man, x);
            rows.push([man.id, x, figures.deducted === chosen.deducted, figures.net === chosen.gross - chosen.deducted,
                figures.left === chosen.carriedForward,
                // The box's own preview line (renderPeriodClosure), built from the plan.
                d.run('WEEKLY_CLOSE_REUSED.preview')(d.call('moneyText', figures.net), d.call('moneyText', figures.left))
                    === `לתשלום לעובד: ${d.call('moneyText', chosen.gross - chosen.deducted)} ₪ · יישאר חוב פתוח: ${d.call('moneyText', chosen.carriedForward)} ₪`]);
        });
    });
    check('wage, the most that can come off, carried in, handed over, the debt, the days: all the model\'s',
        rows.filter(row => row.length === 7).every(row => row.slice(1).every(Boolean)), j(rows.filter(row => row.length === 7)));
    check('for every amount: deducted, to pay and left owed are planPeriodClosure\'s, and the preview is the box\'s',
        rows.filter(row => row.length === 6).every(row => row.slice(2).every(Boolean)), j(rows.filter(row => row.length === 6 && !row.slice(2).every(Boolean))));
    same('the most each can lose from this wage', read.men.map(man => [man.id, man.max]), [['w_f', 1000], ['w_w', 600], ['w_g', 900]]);
    same('an amount above the most is refused, and one with a third decimal, and words',
        [d.call('weeklyCloseParse', '1001', 1000).ok, d.call('weeklyCloseParse', '10.555', 1000).ok,
            d.call('weeklyCloseParse', 'אלף', 1000).ok, d.call('weeklyCloseParse', '٥٠٠', 1000).value, d.call('weeklyCloseParse', ' 0 ', 1000).value],
        [false, false, false, 500, 0]);
}

// ================================================================== W3 the same bytes
async function twinsClose(choices) {
    const seed = shared(threeInOrder());
    const at = '2026-11-13T15:00:00.000Z';
    const a = shared(phone({ storage: seed.dump() }));
    const b = shared(phone({ storage: seed.dump() }));
    freeze(a, at); freeze(b, at);
    const read = readOf(a, at);
    const picks = read.men.map(man => ({ man, x: choices[man.id] }));
    const result = a.call('weeklyCloseWrite', picks);
    // The other phone, man by man, through the shipped button's own function.
    for (const pick of picks) {
        const worker = b.State.worker(pick.man.id);
        const plan = b.call('planPeriodClosure', b.State.schedule, pick.man.id, pick.man.from, pick.man.to, at, pick.x);
        await b.call('closeAccountFor', worker, plan);
    }
    return { a, b, result, picks };
}
{
    suite('W3 the record after a pass is the record after the same men closed one by one');
    const { a, b, result } = await twinsClose({ w_f: 400, w_w: 0, w_g: 900 });
    same('the pass wrote, at one moment, every man', [result.saved, result.closed], [true, ['w_f', 'w_w', 'w_g']]);
    check('the record on the disk is byte for byte the record closeAccountFor left',
        recordBytes(a) === recordBytes(b), `${recordBytes(a).length} vs ${recordBytes(b).length}`);
    const reopenedA = phone({ storage: a.dump() });
    const reopenedB = phone({ storage: b.dump() });
    check('and so is the record each phone opens on next', j(reopenedA.State.schedule) === j(reopenedB.State.schedule));
    same('the judge condemns nothing it wrote', a.call('impossibleClosures', a.State.schedule), []);
    same('what was taken off each wage is what was chosen', ['w_f', 'w_w', 'w_g'].map(id => {
        const read = a.call('advanceAccount', a.State.schedule, id, id === 'w_w' ? '2026-11-06' : '2026-10-30', '2026-11-12');
        return [id, read.closed, read.deducted];
    }), [['w_f', true, 400], ['w_w', true, 0], ['w_g', true, 900]]);
    const kinds = Object.values(a.State.schedule.ledger.advances).filter(entry => entry.at === '2026-11-13T15:00:00.000Z').map(entry => entry.kind).sort();
    same('three payslips and the deductions beside them - no repayment, no new kind', kinds, ['closed', 'closed', 'closed', 'deducted', 'deducted']);

    // Built inside the pass's memory, built with none: the same changes.
    const seed = shared(threeInOrder());
    const at = '2026-11-13T15:00:00.000Z';
    const built = (memo, x) => {
        const c = phone({ storage: seed.dump() });
        const read = readOf(c, at);
        const make = () => read.men.reduce((all, man) => all.concat(c.call('closePeriodChanges', c.State.schedule, man.id, man.from, man.to,
            at, 'd_x', x(man))), []);
        return j(memo ? c.call('weeklyCloseOnce', make) : make());
    };
    const xs = [man => man.max, man => 0, man => Math.round(man.max / 3)];
    check('every change built inside the memory equals the same change built without it, for three choices',
        xs.every(x => built(true, x) === built(false, x)));
    const r1 = phone({ storage: seed.dump() });
    const r2 = phone({ storage: seed.dump() });
    r2.run('weeklyCloseOnce = work => work();');
    check('and the reading with memory equals the reading without it', j(readOf(r1, at)) === j(readOf(r2, at)));
}

// ================================================================== W4 double press
{
    suite('W4 a second press, and a second write of the same choice, write nothing');
    const d = shared(threeInOrder());
    d.run('openWeeklyClose()');
    press(goOf(d));
    const before = recordBytes(d);
    press(goOf(d));
    press(goOf(d));
    await idle(d);
    const after = recordBytes(d);
    const closes = Object.values(d.State.schedule.ledger.advances).filter(entry => entry.kind === 'closed' && entry.periodTo === '2026-11-12');
    same('two presses of «סגור»: one close each, three in all', closes.length, 3);
    check('the record moved once', before !== after);
    same('and the screen is the closure\'s own page', d.views.slice(-1), ['advances']);
    const read = readOf(d);
    same('nothing is left to close for them', read.men.map(man => man.id), []);
    // The same picks written again, as a second phone that had not heard would.
    const e = shared(threeInOrder());
    const picks = readOf(e).men.map(man => ({ man, x: man.max }));
    given('the first write landed', e.call('weeklyCloseWrite', picks).saved === true);
    const once = ledgerBytes(e);
    const again = e.call('weeklyCloseWrite', picks);
    same('the second write of the same picks names them as moved and writes nothing', [again.saved, again.moved], [false, ['w_f', 'w_w', 'w_g']]);
    check('the ledger byte for byte', ledgerBytes(e) === once);
}

// ================================================================== W5 the record moved
async function movedBetween(change) {
    const d = shared(threeInOrder());
    d.run('openWeeklyClose()');
    typeInto(d, 'w_f', '300');
    press(goOf(d));
    change(d);
    const disk = diskOf(d);
    press(goOf(d));
    await idle(d);
    return { d, disk };
}
{
    suite('W5 the record moved between the drawing and the press: everybody stops, nothing is written');
    const cases = [
        ['an advance handed to גסאן inside his period', d => d.State.commitMany(d.call('recordNewAdvance', d.State.schedule, 'w_g', '2026-11-10', 200, '', '2026-11-13T10:00:00.000Z', 'd_other', 'cash')), ['w_g']],
        ['cash handed back by ואליד (his balance on the ledger)', d => d.State.commit(d.call('recordAdvanceRepaid', d.State.schedule,
            d.call('advancesFor', d.State.schedule, 'w_w', '2026-11-09', '2026-11-09')[0].id, 100, '2026-11-12', '', '2026-11-13T10:00:00.000Z', 'd_other', 'cash')), ['w_w']],
        ['a day of פואד marked absent', d => d.State.commit(d.call('markAbsent', d.State.schedule, '2026-11-11', 'w_f', 'actual')), ['w_f']],
        ['גסאן closed meanwhile on another phone', d => d.State.commitMany(d.call('closePeriodChanges', d.State.schedule, 'w_g', '2026-10-30', '2026-11-12',
            '2026-11-13T10:00:00.000Z', 'd_other', 0)), ['w_g']]
    ];
    for (const [what, change, who] of cases) {
        const { d, disk } = await movedBetween(change);
        check(`${what}: the disk byte for byte`, diskOf(d) === disk);
        check(`${what}: told, in the close's own words, and named`,
            statusOf(d).indexOf('החשבון השתנה בזמן האישור. לא נשמר ניכוי. בדוק את הסכומים ואשר שוב.') !== -1
                && who.every(id => statusOf(d).indexOf(NAMES[id]) !== -1), statusOf(d));
        check(`${what}: back on the list, the others' choices kept`, d.run('WEEKLY_CLOSE.step') === 1
            && (who.indexOf('w_f') !== -1 || d.run('WEEKLY_CLOSE.choices.w_f.text') === '300'));
    }
    // A redraw while the dialog is open: one line, nothing typed lost.
    const r = shared(threeInOrder());
    r.run('openWeeklyClose()');
    typeInto(r, 'w_g', '250');
    r.State.commit(r.call('assignPlace', r.State.schedule, '2026-11-13', 'w_f', 'actual', 'p_02'));
    r.ctx.render();
    check('a record that moved under the screen raises one line', statusOf(r).indexOf('הרישום השתנה מאז שנפתח המסך. הכל ייבדק שוב כשתאשר.') !== -1, statusOf(r));
    same('and keeps what was typed', r.run('WEEKLY_CLOSE.choices.w_g.text'), '250');
}

// ================================================================== W6 not synced
{
    suite('W6 only a phone that says «מסונכרן בין המכשירים» may close (D4)');
    const cloud = makeCloud({ doc: { schemaVersion: 2, protocol: 1, revision: 1, lastOpId: 'op_seed',
        updatedAt: '2026-11-12T06:00:00.000Z', updatedBy: 'd_seed',
        workers: [{ id: 'w_01', name: 'עומר', active: true, dailyRate: 500, hourlyRate: 0 }],
        places: [{ id: 'p_01', name: 'אתר', active: true }], days: {}, advances: {},
        ledger: { advances: {}, migrations: {}, unreadable: {} } } });
    const d = phone({ today: '2026-11-12', deviceId: 'd_A' });
    const T = d.run('WEEKLY_CLOSE_TEXT');
    const said = () => { const word = d.call('weeklyCloseReadyWord'); return word === null ? 'may' : word === T.notSynced ? 'not yet' : word === T.notSyncedPending ? 'owes' : word; };
    const rows = [];
    rows.push(['booted, the cloud not reached', said()]);
    d.Sync.connect(cloud.adapter);
    given('it reaches the cloud', await settleUntil(() => d.Sync.status === 'synced' && d.Sync.pendingCount() === 0, 30000));
    rows.push(['heard and sent', said()]);
    cloud.online = false;
    d.State.commit(d.call('assignPlace', d.State.schedule, '2026-11-11', 'w_01', 'actual', 'p_01'));
    await settle(400);
    rows.push(['offline with a day owed', said()]);
    cloud.online = true;
    given('it catches up', await settleUntil(() => d.Sync.status === 'synced' && d.Sync.pendingCount() === 0, 30000));
    rows.push(['back', said()]);
    const real = d.Sync.holdingContested;
    d.Sync.holdingContested = () => true;
    rows.push(['holding a contested write', said()]);
    d.Sync.holdingContested = real;
    d.ctx.navigator = { onLine: false };
    rows.push(['no signal', said()]);
    delete d.ctx.navigator;
    rows.push(['the signal back', said()]);
    same('the rule says yes only when heard and owing nothing', rows, [
        ['booted, the cloud not reached', 'not yet'], ['heard and sent', 'may'], ['offline with a day owed', 'owes'],
        ['back', 'may'], ['holding a contested write', 'owes'], ['no signal', 'not yet'], ['the signal back', 'may']]);
    // The deletion's own expression, word for word.
    const roster = source('js/ui/roster.js');
    const mine = source('js/ui/weeklyclose.js');
    const tail = text => text.replace(/\s+/g, ' ');
    check('the predicate is the permanent deletion\'s, word for word',
        tail(roster).indexOf('sync && sync.adapter && sync._heardFromCloud && Number.isInteger(sync._revision) && sync._revision >= 1 && sync.status === \'synced\' && sync.honestStatusFor(\'synced\') === \'synced\' && (typeof navigator === \'undefined\' || navigator.onLine !== false)') !== -1
        && tail(mine).indexOf('sync && sync.adapter && sync._heardFromCloud && Number.isInteger(sync._revision) && sync._revision >= 1 && sync.status === \'synced\' && sync.honestStatusFor(\'synced\') === \'synced\' && (typeof navigator === \'undefined\' || navigator.onLine !== false)') !== -1);

    // On the screen: the sentence at the top before anything, and «סגור» writing nothing.
    const t = threeInOrder();
    t.run('openWeeklyClose()');
    check('a phone with no cloud is told at the top of the first page', statusOf(t) === plain(T.notSynced), statusOf(t));
    const disk = diskOf(t);
    press(goOf(t));
    press(goOf(t));
    await idle(t);
    check('the summary can be read, and «סגור» writes nothing', diskOf(t) === disk && t.run('WEEKLY_CLOSE.step') === 2);
    same('and the write refuses by itself as its first line', t.call('weeklyCloseWrite', readOf(t).men.map(man => ({ man, x: man.max }))).notReady, T.notSynced);
}

// ================================================================== W7 an earlier period left open
{
    suite('W7 an earlier period left open is refused and named, oldest first (D5) - and finding L7 behind it');
    const d = shared(three());
    const read = readOf(d);
    same('פואד and ואליד are held, each on his oldest open period that a debt ran through', read.men.map(man => [man.id, man.held]), [
        ['w_f', { kind: 'earlier', from: '2026-10-16', to: '2026-10-29' }],
        ['w_w', { kind: 'earlier', from: '2026-10-23', to: '2026-10-29' }],
        ['w_g', null]]);
    d.run('openWeeklyClose()');
    const card = cardOf(d, 'w_f');
    check('his card says so in a sentence, with the dates', plain(card.textContent).indexOf('חשבון קודם שלו לא נסגר (16/10 - 29/10). סוגרים מהישן לחדש: סגור קודם את החשבון ההוא, ידנית.') !== -1,
        plain(card.textContent));
    check('and has no field', card.querySelector('.weekly-close-input') === null);
    const disk = diskOf(d);
    const show = card.querySelector('.weekly-close-show');
    same('v195\'s button, in its words', plain(show.textContent), 'הצג את החשבון 16/10 - 29/10');
    press(show);
    same('it only navigates: the pay sheet narrowed to him, pointed at that period', [d.shown, d.run('[...REPORT_WORKERS]'), d.run('REPORT_SECTION')],
        [[{ from: '2026-10-16', to: '2026-10-29' }], ['w_f'], 'workers']);
    check('and wrote nothing', diskOf(d) === disk);

    // THE FINDING (L7, problem (a)), reproduced on the per-man writer, and the pass at each step.
    const p = phone({ today: '2026-09-04' });
    p.State.schedule.workers = [{ id: 'w_1', name: 'ראמי', active: true, dailyRate: 610, hourlyRate: 0 }];
    p.State.schedule.places = PLACES;
    day(p, 'w_1', '2026-08-07');
    weekdays('2026-08-21', '2026-09-03').forEach(date => day(p, 'w_1', date));
    advance(p, 'w_1', '2026-08-07', 2000);
    approve(p); kept(p); shared(p);
    const P1 = ['2026-08-07', '2026-08-20'];
    const P2 = ['2026-08-21', '2026-09-03'];
    same('P1 (one day, 2,000 handed over) left open: the pass will not close P2 in front of it',
        manOf(readOf(p), 'w_1').held, { kind: 'earlier', from: P1[0], to: P1[1] });
    // MOVED ON PURPOSE (v198, the owner's fix (a), 2026-11-14): the per-man writer now refuses
    // the same close, by the model's own rule (planPeriodClosure 'earlierOpen'), naming P1 - so
    // the pass and the box agree, and the finding can no longer be completed on this build.
    // v197's lines here showed the box closing P2 at 1,390 and P1 afterwards at 1,220 (2,610
    // recorded against 2,000).
    const box = p.call('planPeriodClosure', p.State.schedule, 'w_1', P2[0], P2[1], '2026-09-04T10:00:00.000Z');
    same('the per-man writer (the shipped box) now refuses too, naming the same P1 - and the sheet\'s figure is still 1,390',
        [box.canClose, box.reasons.indexOf('earlierOpen') !== -1, box.earlierOpen, box.deducted], [false, true, { from: P1[0], to: P1[1] }, 1390]);
    same('and closePeriodChanges writes nothing for it', p.call('closePeriodChanges', p.State.schedule, 'w_1', P2[0], P2[1], '2026-09-04T10:00:00.000Z', 'd_hand').length, 0);
    // A record an OLDER build wrote out of order (v197 and before had no such refusal): P2
    // closed in front of P1 at the sheet's 1,390. Written here with the planner's order
    // question stood aside in memory for exactly that one write, then put back.
    p.run('globalThis.__orderFacts = closureOrderFacts; closureOrderFacts = function () { return Object.assign(__orderFacts.apply(null, arguments), { earlierOpen: null }); }; 1');
    p.State.commitMany(p.call('closePeriodChanges', p.State.schedule, 'w_1', P2[0], P2[1], '2026-09-04T10:00:00.000Z', 'd_hand'));
    p.run('closureOrderFacts = __orderFacts; delete globalThis.__orderFacts; 1');
    check('(the older build\'s close of P2 is on the record)', p.call('frozenPeriodFor', p.State.schedule, 'w_1', P2[0], P2[1]) !== undefined);
    p.State.commit(p.call('assignPlace', p.State.schedule, '2026-08-10', 'w_1', 'actual', 'p_01'));
    const P1plan = p.call('planPeriodClosure', p.State.schedule, 'w_1', P1[0], P1[1], '2026-09-05T10:00:00.000Z');
    same('a day typed into P1 behind that close: the box no longer offers 1,220 - it refuses, «laterClosed»',
        [P1plan.canClose, P1plan.reasons.indexOf('laterClosed') !== -1], [false, true]);
    same('and closePeriodChanges writes nothing for P1', p.call('closePeriodChanges', p.State.schedule, 'w_1', P1[0], P1[1], '2026-09-05T10:00:00.000Z', 'd_hand').length, 0);
    p.setToday('2026-09-18');
    // MOVED ON PURPOSE (v198, the owner's answer 1, 2026-11-14): only a man who worked in his
    // period is in the pass, so he is given a day of work in P3 - v197 listed him on his debt.
    p.State.commit(p.call('assignPlace', p.State.schedule, '2026-09-07', 'w_1', 'actual', 'p_01'));
    same('and the pass, for P3, refuses - naming P1 and the closed period after it', manOf(readOf(p), 'w_1').held,
        { kind: 'earlierBehind', from: P1[0], to: P1[1] });
    const recorded = Object.values(p.State.schedule.ledger.advances).filter(entry => entry.kind === 'deducted')
        .reduce((sum, entry) => sum + entry.amount, 0);
    same('recorded as deducted: the older build\'s 1,390 and nothing more - never 2,610 against a 2,000 advance', recorded, 1390);

    // THE PASS AND THE MODEL SAY THE SAME THING (v198): should the planner refuse for its order
    // where this screen's own walk did not, the man is held in the model's words, never
    // «אי אפשר לסגור אותו כאן». Asked by standing the planner's answer in for one reading.
    const q = phone();
    q.State.schedule.workers = [{ id: 'w_1', name: 'סמיר', active: true, dailyRate: 500, hourlyRate: 0 }];
    q.State.schedule.places = PLACES;
    weekdays('2026-10-30', '2026-11-12').forEach(date => day(q, 'w_1', date));
    approve(q); kept(q); shared(q);
    given('(a man the pass would close)', manOf(readOf(q), 'w_1').held === null);
    const stood = (reasons, earlierOpen) => {
        q.run(`globalThis.__plan = planPeriodClosure; planPeriodClosure = function () { return Object.assign(__plan.apply(null, arguments), { canClose: false, reasons: ${JSON.stringify(reasons)}, earlierOpen: ${JSON.stringify(earlierOpen)} }); }; 1`);
        try { return manOf(readOf(q), 'w_1').held; } finally { q.run('planPeriodClosure = __plan; delete globalThis.__plan; 1'); }
    };
    const early = stood(['earlierOpen'], { from: '2026-10-16', to: '2026-10-29' });
    same('the model\'s «earlierOpen» is held as this screen\'s «earlier», on the period the MODEL names', early, { kind: 'earlier', from: '2026-10-16', to: '2026-10-29' });
    const late = stood(['laterClosed'], null);
    same('the model\'s «laterClosed» is held as «laterClosed»', late, { kind: 'laterClosed' });
    same('and said in the per-man box\'s own sentence', q.call('weeklyCloseHeldText', { held: late }), q.run('CLOSURE_ORDER_TEXT.laterClosed'));
    check('which is the box\'s, in js/ui/reports.js', source('js/ui/reports.js').indexOf("'תקופה מאוחרת יותר של העובד הזה כבר נסגרה עם ניכוי, והחשבון הזה עדיין פתוח. '") !== -1);
}

// ================================================================== W8 the gates
{
    suite('W8 the gates: nothing to see on a record or a build that cannot write a close');
    const rows = [];
    [['carry shut', SHUT, true], ['writer shut', NOWRITE, true], ['open, approved', OPEN, true], ['open, not approved', OPEN, false]].forEach(([what, flags, approved]) => {
        const d = phone({ flags });
        d.State.schedule.workers = [{ id: 'w_1', name: 'סמיר', active: true, dailyRate: 500, hourlyRate: 0 }];
        d.State.schedule.places = PLACES;
        weekdays('2026-08-07', '2026-11-12').forEach(date => day(d, 'w_1', date));
        // An advance the old arithmetic and the carry read differently: the migration is needed.
        d.call('addAdvance', d.State.schedule, 'w_1', '2026-10-19', 9000, '');
        if (approved && flags.carryAdvances) {
            const plan = d.call('planCarryMigration', d.State.schedule);
            d.call('recordCarryApproval', d.State.schedule, plan, '2026-10-20T09:00:00.000Z', 'd_person');
        }
        kept(d); shared(d);
        const reopened = shared(phone({ flags, storage: d.dump() }));
        rows.push([what, reopened.call('weeklyCloseEntryButton') !== null, readOf(reopened).gate, readOf(reopened).men.length]);
    });
    same('the button and the reading open only on a record approved, on a build that writes', rows, [
        ['carry shut', false, false, 0], ['writer shut', false, false, 0], ['open, approved', true, true, 1], ['open, not approved', false, false, 0]]);
}

// ================================================================== W9 the screen
{
    suite('W9 the screen: prefilled (D2), part, none, skip (D3), the summary naming every man, the result');
    const d = shared(threeInOrder());
    const disk = diskOf(d);
    d.run('openWeeklyClose()');
    same('every field starts at the most the sheet proposes', ['w_f', 'w_w', 'w_g'].map(id => openCard(d, id).querySelector('.weekly-close-input').value), ['1000', '600', '900']);
    const men = d.run('WEEKLY_CLOSE.read.men');
    const sum = f => men.reduce((total, man) => total + f(man), 0);
    const shekels = value => `${value} ₪`;
    same('the foot: deducted, to pay, left owed - the rows added up', totalsOf(d),
        [shekels(sum(man => man.max)), shekels(sum(man => man.gross - man.max)), shekels(sum(man => man.balance - man.max))]);
    const fuad = men.filter(man => man.id === 'w_f')[0];
    let card = typeInto(d, 'w_f', '400');
    same('a part: the word, and the figures on his row', [plain(card.querySelector('.weekly-close-chip').textContent),
        card.querySelectorAll('.weekly-close-cell b').map(node => plain(node.textContent))],
        ['חלק', [String(fuad.gross), '400', String(fuad.gross - 400), String(fuad.balance - 400)]]);
    same('his preview, in the box\'s words', plain(card.querySelector('.weekly-close-preview').textContent),
        `לתשלום לעובד: ${fuad.gross - 400} ₪ · יישאר חוב פתוח: ${fuad.balance - 400} ₪`);
    same('and the foot moved with it', totalsOf(d), [shekels(sum(man => man.max) - fuad.max + 400),
        shekels(sum(man => man.gross - man.max) + fuad.max - 400), shekels(sum(man => man.balance - man.max) + fuad.max - 400)]);
    card = typeInto(d, 'w_f', '1200');
    same('above the most: said, and «המשך» goes to him instead of on', [plain(card.querySelector('.weekly-close-error').textContent)], ['כתוב סכום בספרות בין 0 ל-1000 ₪.']);
    press(goOf(d));
    same('still the first page', d.run('WEEKLY_CLOSE.step'), 1);
    typeInto(d, 'w_f', '400');
    press(openCard(d, 'w_w').querySelector('.weekly-close-none'));
    press(openCard(d, 'w_g').querySelector('.weekly-close-skip'));
    same('no reason is asked for skipping a man', d.asked.length + d.told.length, 0);
    same('the three words', ['w_f', 'w_w', 'w_g'].map(id => plain(cardOf(d, id).querySelector('.weekly-close-chip').textContent)), ['חלק', 'בלי ניכוי', 'דילגת']);
    press(goOf(d));
    same('the summary', d.run('WEEKLY_CLOSE.step'), 2);
    const text = bodyText(d);
    check('it says how many will close, and the table with the sum', text.indexOf('ייסגרו 2 חשבונות') !== -1 && text.indexOf('סה״כ') !== -1, text);
    check('it names, by name, the man closing with nothing taken', text.indexOf('בלי ניכוי הפעם, והחוב עובר הלאה:ואליד · יישאר חוב 600 ₪') !== -1, text);
    check('and the man skipped', text.indexOf('לא נסגר עכשיו (דילגת):גסאן · סה״כ חוב 900 ₪') !== -1, text);
    check('and that a close is final', text.indexOf('סגירה היא סופית - אי אפשר לבטל אותה, רק לרשום תיקון לצידה.') !== -1);
    same('its button says how many', plain(goOf(d).textContent), 'סגור 2 חשבונות');
    check('nothing has been written by any of the looking, typing or paging', diskOf(d) === disk);
    press(d.doc.getElementById('weeklyCloseBack'));
    same('«חזרה» from the summary is the list, with every choice kept', [d.run('WEEKLY_CLOSE.step'), d.run('WEEKLY_CLOSE.choices.w_f.text'), d.run('WEEKLY_CLOSE.choices.w_g.skip')], [1, '400', true]);
    press(goOf(d));
    press(goOf(d));
    await idle(d);
    const key = d.run('WEEKLY_CLOSE_LAST.key');
    same('written: the closure\'s own page in «סגירות שנרשמו»', [d.views.slice(-1)[0], d.run('OWES_PAGE') === key], ['advances', true]);
    d.dom = d.doc;
    d.run('renderAdvances()');
    const page = plain(d.doc.getElementById('advancesView').textContent);
    check('which lists the two men closed and names the one not closed in it', page.indexOf('פואד') !== -1 && page.indexOf('ואליד') !== -1
        && page.indexOf('לא נסגרו בסגירה הזאת:גסאן') !== -1, page);
    same('and גסאן is untouched: his period open, his ledger as it was', [d.call('frozenPeriodFor', d.State.schedule, 'w_g', '2026-10-30', '2026-11-12') === undefined,
        d.call('openAdvanceBalance', d.State.schedule, 'w_g').total], [true, 900]);
    // Held men are named in the summary too.
    const h = shared(three());
    h.run('openWeeklyClose()');
    press(goOf(h));
    check('the held men are named in the summary, with why', bodyText(h).indexOf('לא נסגר עכשיו - צריך לבדוק קודם:פואד · חשבון קודם שלו לא נסגר') !== -1, bodyText(h));
}

// ================================================================== W10 what it costs
{
    suite('W10 what it costs: fourteen men, a season of days, every earlier period closed');
    const d = phone({ today: '2026-11-13' });
    const workers = [];
    for (let i = 0; i < 14; i += 1) {
        workers.push(Object.assign({ id: `w_${String(i).padStart(2, '0')}`, name: `עובד ${i}`, active: true, dailyRate: 400 + i * 10, hourlyRate: 0 },
            i < 9 ? { payCycles: '2026-05-01=weekly' } : {}));
    }
    d.State.schedule.workers = workers;
    d.State.schedule.places = PLACES;
    for (let date = '2026-05-01'; date <= '2026-11-12'; date = addDays(date, 1)) {
        const dow = new Date(`${date}T12:00:00`).getDay();
        if (dow === 6) continue;
        workers.forEach(worker => day(d, worker.id, date));
        if (dow === 1) workers.forEach((worker, i) => { if (i % 2 === 0) advance(d, worker.id, date, 500); });
    }
    approve(d);
    d.call('weeklyCloseOnce', () => workers.forEach(worker => d.call('accountsBefore', d.State.schedule, worker.id, '2026-11-06')
        .forEach(period => byHand(d, worker.id, period.from, period.to, undefined, `${addDays(period.to, 1)}T16:00:00.000Z`))));
    kept(d); shared(d);
    const bytes = recordBytes(d).length;
    let started = Date.now();
    const read = readOf(d);
    const readMs = Date.now() - started;
    given('fourteen men to close', read.men.filter(man => !man.held).length === 14, j(read.men.map(man => man.held)));
    started = Date.now();
    const result = d.call('weeklyCloseWrite', read.men.map(man => ({ man, x: man.max })));
    const writeMs = Date.now() - started;
    console.log(`        record ${bytes} bytes; read ${readMs} ms; write (re-read, build, one commit) ${writeMs} ms`);
    same('all fourteen written in one commit', [result.saved, result.closed.length], [true, 14]);
    check('the reading inside 3 s', readMs < 3000, `${readMs} ms`);
    check('the write inside 6 s', writeMs < 6000, `${writeMs} ms`);
    // The page a pass lands on, «סגירות שנרשמו» (js/ui/owes.js): on a season of weekly closes
    // it is hundreds of accounts, and read inside the pass's scope it must say exactly what
    // v195's reading says.
    started = Date.now();
    const scoped = j(d.call('owesClosures', d.State.schedule));
    const scopedMs = Date.now() - started;
    started = Date.now();
    const bare = j(d.call('owesOnce', d.State.schedule, () => d.call('owesClosuresRead', d.State.schedule)));
    const bareMs = Date.now() - started;
    console.log(`        «סגירות שנרשמו» on this record: ${scopedMs} ms in the scope, ${bareMs} ms without it`);
    check('the closures read inside the scope are v195\'s reading, account for account', scoped === bare && JSON.parse(scoped).length > 20,
        `${JSON.parse(scoped).length} closes`);
}

// ================================================================== W12 two phones
//
// The owner's D4 is "close only when synced, and from one phone". Here, two phones on the
// harness's cloud, both synced: what the pass guarantees, and what it cannot - a phone that is
// synced by every test it can make and has not yet heard a close the other phone sent a
// second ago. The server keeps the first close; since v198 (repair (b)) the phone that lost
// adopts it and is not stuck, and that is pinned below (it was printed and not pinned in v197).
{
    suite('W12 two phones: a close the other phone has heard is never written twice; the race D4 cannot close, measured');
    const one = await twoPhonesOnOneCloud();
    const readA = readOf(one.a);
    const readB = readOf(one.b);
    given('phone A closed the three men at the sheet\'s figure', one.a.call('weeklyCloseWrite', readA.men.map(man => ({ man, x: man.max }))).saved === true);
    given('and phone B heard it', await settleUntil(() => one.b.call('frozenPeriodFor', one.b.State.schedule, 'w_g', '2026-10-30', '2026-11-12') !== undefined
        && one.b.call('weeklyCloseShared'), 30000));
    const disk = diskOf(one.b);
    const answer = one.b.call('weeklyCloseWrite', readB.men.map(man => ({ man, x: 0 })));
    same('phone B, still showing the list it read before, is refused at the press: every man moved', [answer.saved, answer.moved], [false, ['w_f', 'w_w', 'w_g']]);
    check('and its disk is byte for byte', diskOf(one.b) === disk);
    same('the cloud holds one close a man, phone A\'s', Object.values(one.cloud.doc.ledger.advances)
        .filter(entry => entry.kind === 'closed' && entry.periodTo === '2026-11-12').map(entry => [entry.workerId, entry.by]).sort(),
    [['w_f', 'd_A'], ['w_g', 'd_A'], ['w_w', 'd_A']]);
    one.a.Sync.disconnect(); one.b.Sync.disconnect();

    // THE RACE: B's snapshots held back, as on a phone whose listener is a second behind.
    const two = await twoPhonesOnOneCloud();
    const ra = readOf(two.a);
    const rb = readOf(two.b);
    two.gate.open = false;
    given('phone A closed גסאן with 900', two.a.call('weeklyCloseWrite', ra.men.filter(man => man.id === 'w_g').map(man => ({ man, x: man.max }))).saved === true);
    given('and A\'s write reached the cloud', await settleUntil(() => two.a.Sync.pendingCount() === 0 && two.a.Sync.status === 'synced', 30000));
    const stillShared = two.b.call('weeklyCloseShared');
    const raced = two.b.call('weeklyCloseWrite', rb.men.filter(man => man.id === 'w_g').map(man => ({ man, x: 0 })));
    await settle(1500);
    two.gate.open = true;
    two.gate.waiting.splice(0).forEach(([next, snapshot]) => next(snapshot));
    await settle(3000);
    const cloudCloses = Object.values(two.cloud.doc.ledger.advances).filter(entry => (entry.kind === 'closed' || entry.kind === 'deducted')
        && entry.workerId === 'w_g' || (entry.kind === 'deducted' && entry.at === ra.at)).map(entry => [entry.kind, entry.by, entry.amount]);
    console.log(`        MEASURED (problem (b), repaired in v198): phone B reported synced (${stillShared}) and wrote 0 (${raced.saved}); `
        + `afterwards B is '${two.b.Sync.status}', holds ${two.b.Sync.heldRecords().length} record(s) aside, owes ${two.b.Sync.pendingCount()}, `
        + `writes blocked: ${two.b.call('farkadWritesBlocked')}; the cloud: ${j(cloudCloses)}`);
    same('the server keeps the first close and only it', cloudCloses.filter(entry => entry[0] === 'deducted').map(entry => [entry[1], entry[2]]), [['d_A', 900]]);
    // v198, REPAIR (b) (the owner approved it 2026-11-14): the phone that lost is no longer
    // stuck. It adopts the close that landed first, holds nothing, owes nothing, writes, and
    // keeps its own losing close aside on itself only. Pinned now that it is the behaviour;
    // tests/closerace.test.mjs holds the repair in every shape.
    same('the phone that lost the race is not stuck: synced, nothing held, nothing owed, writes not blocked',
        [two.b.Sync.status, two.b.Sync.heldRecords().length, two.b.Sync.pendingCount(), two.b.call('farkadWritesBlocked')], ['synced', 0, 0, false]);
    same('and it holds the close that landed first, phone A\'s', Object.values(two.b.State.schedule.ledger.advances)
        .filter(entry => entry.workerId === 'w_g' && (entry.kind === 'closed' || entry.kind === 'deducted') && entry.periodTo === '2026-11-12')
        .map(entry => [entry.kind, entry.by, entry.kind === 'deducted' ? entry.amount : null]).sort(), [['closed', 'd_A', null], ['deducted', 'd_A', 900]]);
    check('its own close kept aside on itself only (farkad:closureAside:*)', Object.keys(two.b.dump()).some(key => key.indexOf('farkad:closureAside:') === 0));
    two.a.Sync.disconnect(); two.b.Sync.disconnect();
}

// ================================================================== W13 the owner's answers
//
// The owner answered ten questions about this screen on 2026-11-14. What each answer moved,
// or was checked to leave where it was, is held here; docs/releases.md (v198) says the
// answers and what was and was not done.
{
    suite('W13.1 only a man who WORKED in his period is in the pass (the owner, answers 1 and 9)');
    // Two weekly men with a debt: one worked last week, one did not come at all.
    const d = phone({ today: '2026-11-13' });
    const W = '2026-10-16=weekly';
    d.State.schedule.workers = [
        { id: 'w_a', name: 'עאמר', active: true, dailyRate: 400, hourlyRate: 0, payCycles: W },
        { id: 'w_b', name: 'באסם', active: true, dailyRate: 400, hourlyRate: 0, payCycles: W }];
    d.State.schedule.places = PLACES;
    weekdays('2026-10-30', '2026-11-05').forEach(date => { day(d, 'w_a', date); day(d, 'w_b', date); });
    weekdays('2026-11-06', '2026-11-12').forEach(date => day(d, 'w_a', date));
    advance(d, 'w_a', '2026-11-02', 700);
    advance(d, 'w_b', '2026-11-02', 900);
    advance(d, 'w_b', '2026-11-09', 300);            // handed over in a week he did not work
    approve(d);
    byHand(d, 'w_a', '2026-10-30', '2026-11-05', 0, '2026-11-06T16:00:00.000Z');
    byHand(d, 'w_b', '2026-10-30', '2026-11-05', 0, '2026-11-06T16:01:00.000Z');
    kept(d); shared(d);
    const read = readOf(d);
    same('the man who worked is on it; the man with a debt, an advance in the week and no day of work is not',
        read.men.map(man => man.id), ['w_a']);
    same('the one who did not come still owes on «מי חייב כסף» - where the owner looks for him (answer 9)',
        d.run('owesRead(State.schedule, todayStr()).rows.map(row => [row.workerId, row.amount])'), [['w_b', 1200], ['w_a', 700]]);
    // Before: v197 listed him on his money alone. The rule is the one line, measured by
    // giving him one day of work in the week.
    day(d, 'w_b', '2026-11-10'); kept(d);
    same('one day of work in it, and he is on it', readOf(d).men.map(man => man.id), ['w_a', 'w_b']);

    // THE CONSEQUENCE, AND THE OWNER'S ANSWER TO IT (2026-11-14, «1 = (b)»): a week with a debt
    // and no day of work is left open by the pass that week (he is not on it). The next pass
    // no longer holds him for it: it closes that week first, with nothing taken, in the same
    // write. MOVED ON PURPOSE: before this answer the next pass held him («earlier», the week
    // off named) until it was closed by hand.
    const n = phone({ today: '2026-11-20' });
    n.State.schedule.workers = [{ id: 'w_c', name: 'כמאל', active: true, dailyRate: 400, hourlyRate: 0, payCycles: W }];
    n.State.schedule.places = PLACES;
    weekdays('2026-10-30', '2026-11-05').forEach(date => day(n, 'w_c', date));
    weekdays('2026-11-13', '2026-11-19').forEach(date => day(n, 'w_c', date));
    advance(n, 'w_c', '2026-11-02', 2500);
    approve(n);
    byHand(n, 'w_c', '2026-10-30', '2026-11-05', 2000, '2026-11-06T16:00:00.000Z');
    kept(n); shared(n);
    const OFF = ['2026-11-06', '2026-11-12'];
    const ON = ['2026-11-13', '2026-11-19'];
    const before = JSON.parse(j(n.State.schedule));
    const plain0 = n.call('planPeriodClosure', n.State.schedule, 'w_c', ON[0], ON[1], '2026-11-20T10:00:00.000Z');
    same('the model on the record as it is: the week of work is refused in front of the week off (fix (a), «earlierOpen»)',
        [plain0.canClose, plain0.reasons.indexOf('earlierOpen') !== -1, plain0.earlierOpen], [false, true, { from: OFF[0], to: OFF[1] }]);
    same('and so is the second calculator', oracle.closePlan(before, 'w_c', ON[0], ON[1]).reasons.indexOf('earlierOpen') !== -1, true);
    same('the week off itself may be closed, by both', [n.call('planPeriodClosure', n.State.schedule, 'w_c', OFF[0], OFF[1], '2026-11-20T10:00:00.000Z', 0).canClose,
        oracle.closePlan(before, 'w_c', OFF[0], OFF[1], 0).reasons], [true, []]);
    const man = manOf(readOf(n), 'w_c');
    same('a week off with 500 still owed, then a week of work: NOT held - the week off is closed first, with nothing taken',
        [man.held, man.empties, man.from, man.to, man.max, man.balance], [null, [{ from: OFF[0], to: OFF[1] }], ON[0], ON[1], 500, 500]);
    same('his card says so', n.call('weeklyCloseEmptyLines', man).map(plain), ['שבוע בלי ימי עבודה (06/11 - 12/11) ייסגר קודם, בלי ניכוי.']);
    same('and reading it wrote nothing', j(n.State.schedule), j(before));
    const disk0 = n.dump();
    const wrote = n.call('weeklyCloseWrite', [{ man, x: man.max }]);
    same('the write: saved, him closed', [wrote.saved, wrote.closed, wrote.failure, wrote.moved], [true, ['w_c'], null, []]);
    const off = n.call('periodArtifactFor', n.State.schedule, 'w_c', OFF[0]);
    const on = n.call('periodArtifactFor', n.State.schedule, 'w_c', ON[0]);
    same('the week off: its one frozen payslip, at this write\'s moment, no wage, nothing taken, the 500 carried',
        [off.at === wrote.at && off.by === wrote.by, off.gross, off.balanceAfter], [true, 0, 500]);
    same('and no deduction recorded on it', Object.values(n.State.schedule.ledger.advances)
        .filter(entry => entry.kind === 'deducted' && entry.workerId === 'w_c' && entry.periodFrom === OFF[0]).length, 0);
    same('the week of work: closed in the same write, 500 taken, nothing left owed', [on.at === wrote.at, on.balanceAfter,
        Object.values(n.State.schedule.ledger.advances).filter(entry => entry.kind === 'deducted' && entry.periodFrom === ON[0])
            .reduce((sum, entry) => sum + entry.amount, 0)], [true, 0, 500]);
    same('nothing impossible on the record, and the ledger owes nothing', [n.call('impossibleClosures', n.State.schedule).length,
        n.call('openAdvanceBalance', n.State.schedule, 'w_c') ? n.call('openAdvanceBalance', n.State.schedule, 'w_c').total : 0], [0, 0]);
    const after = JSON.parse(j(n.State.schedule));
    same('THE SECOND CALCULATOR agrees: the week off closed taking 0, the week of work taking 500, nothing open by rule',
        [oracle.accountOf(after, 'w_c', OFF[0], OFF[1]).closed, oracle.accountOf(after, 'w_c', OFF[0], OFF[1]).deducted,
            oracle.accountOf(after, 'w_c', ON[0], ON[1]).closed, oracle.accountOf(after, 'w_c', ON[0], ON[1]).deducted,
            oracle.openBalance(after, 'w_c').total], [true, 0, true, 50000, 0]);
    same('and it is the record a person would have made by hand, oldest first: the week off at 0, then the week at 500',
        (() => {
            const twin = phone({ today: '2026-11-20', storage: disk0 });
            twin.State.commitMany(byHand(twin, 'w_c', OFF[0], OFF[1], 0, wrote.at));
            twin.State.commitMany(byHand(twin, 'w_c', ON[0], ON[1], 500, wrote.at));
            const strip = record => Object.values(record.ledger.advances).filter(entry => entry.workerId === 'w_c' && entry.at === wrote.at)
                .map(entry => j(Object.assign({}, entry, { id: null, by: null }))).sort();
            // Two payslips and one deduction, the same entries in both but for their ids and device.
            return j(strip(JSON.parse(j(twin.State.schedule)))) === j(strip(after)) && strip(after).length === 3;
        })(), true);

    // A WEEK OFF WITH A DAY OF WORK IN IT is not a week off: never closed by the pass (D5).
    const w = phone({ today: '2026-11-20' });
    w.State.schedule.workers = [{ id: 'w_c', name: 'כמאל', active: true, dailyRate: 400, hourlyRate: 0, payCycles: W }];
    w.State.schedule.places = PLACES;
    weekdays('2026-10-30', '2026-11-05').forEach(date => day(w, 'w_c', date));
    day(w, 'w_c', '2026-11-09');
    weekdays('2026-11-13', '2026-11-19').forEach(date => day(w, 'w_c', date));
    advance(w, 'w_c', '2026-11-02', 2500);
    approve(w);
    byHand(w, 'w_c', '2026-10-30', '2026-11-05', 2000, '2026-11-06T16:00:00.000Z');
    kept(w); shared(w);
    same('one day of work in the week behind: held, that week named, nothing closed for him', [manOf(readOf(w), 'w_c').held, manOf(readOf(w), 'w_c').empties],
        [{ kind: 'earlier', from: OFF[0], to: OFF[1] }, []]);

    // A week off BEHIND A LATER CLOSE that took a carried debt (an older build's close, out of
    // order): the writer will not close it (fix (a), «laterClosed»), so neither does the pass -
    // he is held on it, by name, exactly as before.
    const b = phone({ today: '2026-11-27' });
    b.State.schedule.workers = [{ id: 'w_c', name: 'כמאל', active: true, dailyRate: 400, hourlyRate: 0, payCycles: W }];
    b.State.schedule.places = PLACES;
    weekdays('2026-10-30', '2026-11-05').forEach(date => day(b, 'w_c', date));
    weekdays('2026-11-13', '2026-11-26').forEach(date => day(b, 'w_c', date));
    advance(b, 'w_c', '2026-11-02', 2500);
    approve(b);
    byHand(b, 'w_c', '2026-10-30', '2026-11-05', 2000, '2026-11-06T16:00:00.000Z');
    b.run('globalThis.__orderFacts = closureOrderFacts; closureOrderFacts = function () { return Object.assign(__orderFacts.apply(null, arguments), { earlierOpen: null }); }; 1');
    byHand(b, 'w_c', ON[0], ON[1], 300, '2026-11-20T16:00:00.000Z');
    b.run('closureOrderFacts = __orderFacts; delete globalThis.__orderFacts; 1');
    kept(b); shared(b);
    same('(the week off is refused by the writer: «laterClosed»)', b.call('planPeriodClosure', b.State.schedule, 'w_c', OFF[0], OFF[1], '2026-11-27T10:00:00.000Z', 0).reasons.indexOf('laterClosed') !== -1, true);
    same('so the pass holds him on it, behind the closed week, and closes nothing of his', [manOf(readOf(b), 'w_c').held, manOf(readOf(b), 'w_c').empties],
        [{ kind: 'earlierBehind', from: OFF[0], to: OFF[1] }, []]);
}

{
    suite('W13.2 weekly men every week, the fortnightly men with them every other week (answer 2)');
    const d = phone({ today: '2026-11-06' });
    d.State.schedule.workers = [
        { id: 'w_w', name: 'ואליד', active: true, dailyRate: 400, hourlyRate: 0, payCycles: '2026-10-16=weekly' },
        { id: 'w_f', name: 'פואד', active: true, dailyRate: 500, hourlyRate: 0 }];
    d.State.schedule.places = PLACES;
    weekdays('2026-10-16', '2026-11-12').forEach(date => ['w_w', 'w_f'].forEach(id => day(d, id, date)));
    advance(d, 'w_w', '2026-11-02', 600);
    advance(d, 'w_f', '2026-11-03', 900);
    approve(d);
    // Every earlier period closed, the way the passes before would have left it.
    byHand(d, 'w_f', '2026-10-16', '2026-10-29', 0, '2026-10-30T16:00:00.000Z');
    byHand(d, 'w_w', '2026-10-16', '2026-10-22', 0, '2026-10-23T16:00:00.000Z');
    byHand(d, 'w_w', '2026-10-23', '2026-10-29', 0, '2026-10-30T16:01:00.000Z');
    kept(d); shared(d);
    // Friday 6 November: a week ended, the fortnight did not.
    let read = readOf(d);
    same('the week between: the weekly man alone, in his week', read.groups.map(group => [group.cycle, group.from, group.to, group.men.map(man => man.id)]),
        [['weekly', '2026-10-30', '2026-11-05', ['w_w']]]);
    d.State.commitMany(byHand(d, 'w_w', '2026-10-30', '2026-11-05', 600, '2026-11-06T16:00:00.000Z'));
    // Friday 13 November: the week AND the fortnight ended on the same Thursday.
    d.setToday('2026-11-13');
    read = readOf(d);
    same('the week after: both, each in his own period, ending the same day',
        read.groups.map(group => [group.cycle, group.from, group.to, group.men.map(man => man.id)]),
        [['biweekly', '2026-10-30', '2026-11-12', ['w_f']], ['weekly', '2026-11-06', '2026-11-12', ['w_w']]]);
}

{
    suite('W13.5 no cap on the deduction beyond what he earned - the existing most, checked (answer 5)');
    const d = shared(threeInOrder());
    const read = readOf(d);
    const wrong = read.men.filter(man => !man.held).filter(man =>
        man.max !== Math.min(man.gross, man.balance)
        || d.call('weeklyCloseParse', String(man.max), man.max).ok !== true
        || d.call('weeklyCloseParse', String(man.max + 0.01), man.max).ok !== false);
    given('there are men to read', read.men.filter(man => !man.held).length === 3, j(read.men.map(man => man.id)));
    check('the most is the smaller of the wage and the debt, all of it can be typed, and not an agora more',
        wrong.length === 0, j(wrong.map(man => [man.id, man.max, man.gross, man.balance])));
    same('and a man owing more than his wage can have all of the wage taken', (() => {
        const big = phone({ today: '2026-11-13' });
        big.State.schedule.workers = [{ id: 'w_x', name: 'זיאד', active: true, dailyRate: 300, hourlyRate: 0, payCycles: '2026-10-16=weekly' }];
        big.State.schedule.places = PLACES;
        weekdays('2026-11-06', '2026-11-12').forEach(date => day(big, 'w_x', date));
        advance(big, 'w_x', '2026-11-09', 5000);
        approve(big); kept(big); shared(big);
        const man = manOf(readOf(big), 'w_x');
        return [man.gross, man.max, man.balance];
    })(), [1800, 1800, 5000]);
}

{
    suite('W13.7 after the close, each closed man\'s own statement, one door each (answer 7)');
    const d = shared(threeInOrder());
    d.State.schedule.workers.forEach((worker, i) => { worker.phone = ['050-1234567', '052-7654321', ''][i]; });
    kept(d);
    const disk = diskOf(d);
    d.run('openWeeklyClose()');
    press(openCard(d, 'w_w').querySelector('.weekly-close-none'));
    press(goOf(d));
    press(goOf(d));
    await idle(d);
    const key = d.run('WEEKLY_CLOSE_LAST.key');
    given('the pass wrote, and its page is open', d.run('OWES_PAGE') === key, d.run('OWES_PAGE'));
    const after = diskOf(d);
    d.dom = d.doc;
    d.run('renderAdvances()');
    const root = d.doc.getElementById('advancesView');
    const slips = root.querySelectorAll('.owes-closure-slip');
    const order = d.run(`owesClosures(State.schedule).filter(g => g.key === ${j(key)})[0].items.map(i => i.workerId)`);
    same('one block per closed man, in the close\'s own order', slips.map(node => node.dataset.worker), order);
    same('under the heading «תלוש לכל עובד»', root.querySelectorAll('.owes-closure-slips h3').map(node => node.textContent), ['תלוש לכל עובד']);
    // His statement, read here the way «שלח לעובד» reads it: the report pointed at his
    // closed period, narrowed to him, and put back.
    const statement = (id, from, to) => d.run(`(function () {
        const held = { from: REPORT_RANGE.from, to: REPORT_RANGE.to, workers: REPORT_WORKERS };
        try { REPORT_RANGE.from = ${j(from)}; REPORT_RANGE.to = ${j(to)}; REPORT_WORKERS = new Set([${j(id)}]);
            return workerStatementText(${j(id)}); }
        finally { REPORT_RANGE.from = held.from; REPORT_RANGE.to = held.to; REPORT_WORKERS = held.workers; }
    })()`);
    const items = d.run(`owesClosures(State.schedule).filter(g => g.key === ${j(key)})[0].items`);
    const doors = [];
    items.forEach(item => {
        const block = slips.filter(node => node.dataset.worker === item.workerId)[0];
        const door = block ? block.querySelector('a.payslips-door') || block.querySelector('.payslips-door') : null;
        const text = statement(item.workerId, item.from, item.to);
        const number = d.call('sederWaNumber', d.State.schedule.workers.filter(w => w.id === item.workerId)[0].phone);
        doors.push([item.workerId, Boolean(door), door ? door.href === d.call('sederUrl', number, text) : null,
            door ? plain(door.textContent) : null, block.querySelectorAll('textarea')[0].value === text]);
    });
    same('a door for each man with a number: his number, his statement byte for byte, his name on it', doors, items.map(item => {
        const name = NAMES[item.workerId];
        return item.workerId === 'w_g' ? [item.workerId, false, null, null, true]
            : [item.workerId, true, true, `💬 פתח בוואטסאפ: ${name}`, true];
    }));
    check('the statement says what the close froze: «נותר לתשלום» is the close\'s own «לתשלום»', items.every(item => {
        const text = statement(item.workerId, item.from, item.to);
        return item.net === null || plain(text).indexOf(`נותר לתשלום: ${item.net}`) !== -1;
    }), j(items.map(item => [item.workerId, item.net, plain(statement(item.workerId, item.from, item.to)).split('\n').filter(l => l.indexOf('נותר') !== -1)])));
    const noNumber = slips.filter(node => node.dataset.worker === 'w_g')[0];
    if (noNumber) {
        same('a man with no number: the list\'s own words and the copy', [noNumber.querySelectorAll('.payslips-warn').map(node => node.textContent),
            noNumber.querySelectorAll('.payslips-copy').map(node => node.textContent)], [['אין מספר טלפון תקין'], ['העתק']]);
    }
    check('no word of «נשלח» anywhere on the page', plain(root.textContent).indexOf('נשלח') === -1);
    // The page reads the doors inside the pass's scope (weeklyCloseOnce), for its cost; the
    // answers are the answers with no memory at all.
    same('the doors read inside the pass\'s scope are the doors read with no memory', d.run(`JSON.stringify(weeklyCloseOnce(() => payslipsClosedFacts(${j(items)})))`),
        d.run(`JSON.stringify(payslipsClosedFacts(${j(items)}))`));
    same('drawing the page wrote nothing', diskOf(d), after);
    // A door pressed: the payslips' own mark, and nothing else.
    const withDoor = slips.filter(node => node.querySelector('.payslips-door'))[0];
    press(withDoor.querySelector('.payslips-door'));
    const marks = JSON.parse(d.raw('farkadPayslipsProgress') || 'null');
    const keyOf = items.filter(item => item.workerId === withDoor.dataset.worker)[0];
    check('the tap marks him opened in the payslips\' own key, for his period', Boolean(marks && marks.periods
        && marks.periods[`${keyOf.from}~${keyOf.to}`] && marks.periods[`${keyOf.from}~${keyOf.to}`].opened[keyOf.workerId]), d.raw('farkadPayslipsProgress'));
    same('and the record is the record the close wrote', d.raw('scheduleData:v2'), JSON.parse(after)['scheduleData:v2']);
    d.run('renderAdvances()');
    same('drawn again: «נפתח בוואטסאפ» under him', d.doc.getElementById('advancesView').querySelectorAll('.owes-closure-slip')
        .filter(node => node.dataset.worker === keyOf.workerId)[0].querySelectorAll('.payslips-state').map(node => node.textContent), ['✓ נפתח בוואטסאפ']);
    check('the pass itself changed the disk (the precondition of everything above)', disk !== after);

    suite('W13.8 a mistake after confirm: a correction recorded later, the deduction kept - the way to it is on the page (answer 8)');
    const fixes = root.querySelectorAll('.owes-closure-fix');
    const taken = items.filter(item => item.deducted > 0);
    given('some men had a deduction taken by the pass', taken.length >= 1, j(items));
    same('one button per man a deduction was taken from, naming him', fixes.map(node => plain(node.textContent)),
        slips.map(node => node.dataset.worker).filter(id => taken.some(item => item.workerId === id)).map(id => `המקדמות של ${NAMES[id]}`));
    const man = taken[0];
    const before = diskOf(d);
    d.views.length = 0;
    press(fixes.filter(node => plain(node.textContent) === `המקדמות של ${NAMES[man.workerId]}`)[0]);
    same('it only navigates: his advances, nothing written', [d.run('ADVANCE_WORKER'), d.views.slice(-1)[0], diskOf(d) === before], [man.workerId, 'advances', true]);
    // And there the deduction this close wrote can be corrected, by the existing path.
    const deductions = Object.values(d.State.schedule.ledger.advances).filter(entry => entry.kind === 'deducted'
        && entry.at === key.split('|')[0] && String(entry.periodFrom) === man.from
        && d.State.schedule.advances[entry.advanceId] && d.State.schedule.advances[entry.advanceId].workerId === man.workerId);
    given('the close wrote his deduction', deductions.length >= 1);
    same('each is open to correction, all of it (eventReversalRoom), and a correction with a reason is accepted',
        deductions.map(entry => [d.call('eventReversalRoom', d.State.schedule, entry.id) === entry.amount,
            d.call('eventReversalProblems', d.State.schedule, entry.id, entry.amount, 'נוכה בטעות')]),
        deductions.map(() => [true, []]));
    same('but only all of it: a part of a deduction is refused (the model has no event for it - docs/releases.md, v198)',
        d.call('eventReversalProblems', d.State.schedule, deductions[0].id, Math.round(deductions[0].amount / 2), 'חלק'),
        ['a correction of part of a transaction, which strands the rest']);
    d.run('renderAdvances()');
    check('his page offers «תיקון» on that deduction in his history', d.doc.getElementById('advancesView').querySelectorAll('button')
        .some(node => node.textContent === 'תיקון'), plain(d.doc.getElementById('advancesView').textContent).slice(0, 400));
    same('and still nothing was written', diskOf(d), before);
}

// ================================================================== W11 the words
{
    suite('W11 the words: every new string word for word, every borrowed one where its owner keeps it');
    const d = phone();
    const T = d.run('WEEKLY_CLOSE_TEXT');
    const pins = [
        [T.entry, 'סגירת שבוע'], [T.title, 'סגירת שבוע'],
        [T.lead, 'כל עובד בתקופה שלו שנגמרה. הניכוי ממולא כמו בדוח - אפשר להקטין אותו, לבחור «בלי ניכוי», או לדלג על עובד.'],
        [T.step1, '1 · בדיקה'], [T.step2, '2 · סיכום'], [T.step3, '3 · נסגר'],
        [T.reading, 'מחשב את החשבונות…'], [T.nobody, 'אין עכשיו חשבונות לסגור.'],
        [T.stale, 'הרישום השתנה מאז שנפתח המסך. הכל ייבדק שוב כשתאשר.'],
        [T.wage, 'שכר'], [T.deduct, 'ניכוי'], [T.remain, 'יישאר חוב'],
        [T.stateAll, 'הכל'], [T.statePart, 'חלק'], [T.stateNone, 'בלי ניכוי'], [T.stateNoWage, 'אין שכר'], [T.stateNoDebt, 'בלי מקדמות'], [T.stateSkipped, 'דילגת'], [T.stateHeld, 'לא ייסגר'],
        [T.wageDays(1), 'שכר התקופה · יום אחד'], [T.wageDays(5), 'שכר התקופה · 5 ימים'],
        [T.carriedIn, 'יתרה מחשבון קודם'], [T.totalOwed, 'סה״כ חוב'], [T.allButton('900'), 'הכל · 900'],
        [T.noneButton, 'בלי ניכוי'], [T.skipButton, 'דלג על העובד'], [T.unskipButton, 'בטל דילוג'],
        [T.skippedLine, 'לא ייסגר עכשיו. שום דבר שלו לא ישתנה.'], [T.badAmount('900'), 'כתוב סכום בספרות בין 0 ל-900 ₪.'],
        [T.changedHere, 'הנתונים שלו השתנו מאז שנפתח המסך. הסכום חזר למה שהדוח מציע - בדוק אותו.'],
        [T.heldEndsToday, 'התקופה שלו נגמרת היום, והיום עוד לא נרשם לו. רשום את היום ואז סגור.'],
        [T.heldEarlier('DR'), 'חשבון קודם שלו לא נסגר (DR). סוגרים מהישן לחדש: סגור קודם את החשבון ההוא, ידנית.'],
        [T.heldEarlierBehind('DR'), 'חשבון קודם שלו לא נסגר (DR), ותקופה מאוחרת יותר שלו כבר נסגרה. סגירה של החשבון ההוא עלולה לנכות את אותה מקדמה פעמיים - בדוק את עמוד המקדמות שלו לפני שסוגרים אותו.'],
        [T.heldOther, 'אי אפשר לסגור אותו כאן. סגור אותו מהחשבון שלו בדוח.'],
        // v198, the owner's answer of 2026-11-14 (PROPOSED words): a period with no day of work closed first.
        [T.emptyNote('DR', true), 'שבוע בלי ימי עבודה (DR) ייסגר קודם, בלי ניכוי.'],
        [T.emptyNote('DR', false), 'תקופה בלי ימי עבודה (DR) תיסגר קודם, בלי ניכוי.'],
        [T.emptyList, 'ייסגרו קודם, בלי ניכוי - תקופות שלא היו בהן ימי עבודה:'],
        [T.footDeduct, 'ינוכה'], [T.next, 'המשך לסיכום'], [T.back, 'חזרה'],
        [T.willClose(1), 'ייסגר חשבון אחד'], [T.willClose(4), 'ייסגרו 4 חשבונות'], [T.worker, 'עובד'],
        [T.zeroList, 'בלי ניכוי הפעם, והחוב עובר הלאה:'], [T.skippedList, 'לא נסגר עכשיו (דילגת):'],
        [T.heldList, 'לא נסגר עכשיו - צריך לבדוק קודם:'], [T.noneChosen, 'לא נבחר אף עובד לסגירה.'],
        [T.confirm(1), 'סגור חשבון אחד'], [T.confirm(7), 'סגור 7 חשבונות'], [T.saving, 'שומר…'],
        [T.notSynced, 'סוגרים חשבונות רק כשמופיע «מסונכרן בין המכשירים» - כך שני טלפונים לא יסגרו את אותו חשבון בסכומים שונים.'],
        [T.notSyncedPending, 'יש בטלפון הזה רישום שעוד לא נשלח או שמחכה לבדיקה ב-⋯, ולכן לא סוגרים ממנו חשבונות עד שיופיע «מסונכרן בין המכשירים».'],
        [T.noDisk, 'הטלפון הזה לא מצליח כרגע לשמור את הרישום, ולכן לא סוגרים ממנו חשבונות. לא נרשם דבר.'],
        [T.otherWindow, 'הרישום בטלפון הזה השתנה מחלון אחר של האפליקציה. לא נרשם דבר. סגור את המסך הזה, חכה רגע ופתח אותו שוב.'],
        [T.movedNames('X'), 'השתנה אצל: X.'],
        [T.notWritten, 'לא נשמר דבר. נסה שוב, ואם זה חוזר - סגור כל עובד מהחשבון שלו בדוח.'],
        [T.tooMany(300, 295), 'זה יותר מדי רישומים לפעם אחת (300, ואפשר עד 295). דלג על חלק מהעובדים, סגור, ואז סגור את השאר.'],
        [T.tooLarge, 'הרישום המשותף קרוב לגודל המרבי שהענן מקבל, ולכן לא נרשם דבר. צריך לטפל בזה לפני שסוגרים עוד חשבונות.'],
        [T.notClosedHere, 'לא נסגרו בסגירה הזאת:']
    ];
    const wrong = pins.filter(([was, want]) => was !== want);
    check('every new string, word for word', wrong.length === 0, j(wrong));
    const pinned = new Set(pins.map(pin => pin[1]));
    const keys = Object.keys(T).filter(key => typeof T[key] === 'string');
    check('and no string of the block left unpinned', keys.every(key => pinned.has(T[key])), j(keys.filter(key => !pinned.has(T[key]))));
    const R = d.run('WEEKLY_CLOSE_REUSED');
    const reports = source('js/ui/reports.js');
    const borrowed = [R.toPay, R.givenHere, R.field, R.final, R.changed, R.overpaid, R.overlap, R.gateShut];
    check('every borrowed string is found in js/ui/reports.js as it is', borrowed.every(word => reports.indexOf(`'${word}'`) !== -1
        || reports.replace(/'\s*\+\s*'/g, '').indexOf(word) !== -1), j(borrowed.filter(word => reports.replace(/'\s*\+\s*'/g, '').indexOf(word) === -1)));
    check('and the preview is the box\'s own template', reports.indexOf('`לתשלום לעובד: ${moneyText(next.gross - next.deducted)} ₪ · יישאר חוב פתוח: ${moneyText(next.carriedForward)} ₪`') !== -1
        && R.preview('A', 'B') === 'לתשלום לעובד: A ₪ · יישאר חוב פתוח: B ₪');
    check('«מסונכרן בין המכשירים» is the status line\'s own', source('js/sync/status.js').indexOf('מסונכרן בין המכשירים') !== -1);
    const html = source('index.html');
    check('the frame in index.html has every id this suite builds', FRAME_IDS.every(id => html.indexOf(`id="${id}"`) !== -1));
    check('the file is loaded after owes.js and is in the shell', html.indexOf('<script src="js/ui/weeklyclose.js">') > html.indexOf('<script src="js/ui/owes.js">')
        && source('sw.js').indexOf("'./js/ui/weeklyclose.js'") !== -1);
    const code = WEEKLY.split('\n').filter(line => !/^\s*\/\//.test(line)).join('\n');
    // MOVED ON PURPOSE (v198, the owner's answer of 2026-11-14): the pass also closes a man's
    // periods with no day of work, first, with nothing taken - through the SAME writer. So
    // closePeriodChanges is called three times: twice on the record, both inside the write
    // (the period with no work, then his own), and once on the planner's COPY of the record.
    const writer = (code.match(/closePeriodChanges\([^,]*,/g) || []);
    const write = code.slice(code.indexOf('function weeklyCloseWrite('), code.indexOf('\n}\n', code.indexOf('function weeklyCloseWrite(')));
    check('the ONE writer: closePeriodChanges, twice on the record inside the write and once on the planner\'s copy - and no repayment, no commit of its own, no key',
        writer.length === 3 && writer.filter(call => call === 'closePeriodChanges(State.schedule,').length === 2
        && (write.match(/closePeriodChanges\(State\.schedule,/g) || []).length === 2
        && writer.filter(call => call === 'closePeriodChanges(copy,').length === 1 && code.indexOf('recordAdvanceRepaid') === -1
        && code.indexOf('State.commit') === -1 && code.indexOf('Store.set') === -1 && code.indexOf('localStorage') === -1);
    check('no browser dialog (law 11)', !/(^|[^.\w])(alert|confirm|prompt)\(/.test(code));
}

report();
