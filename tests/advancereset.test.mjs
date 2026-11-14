// «איפוס מקדמות» (js/ui/advancereset.js) on devices.
//
//   node tests/advancereset.test.mjs
//
// The owner, 2026-11-14: every man to zero on the advances side, and every old account
// closed - (1) the men really paid it back, or it was settled outside the app: a repayment;
// (2) every man was paid his full wage for the old open periods: each closed with nothing
// taken. He runs it once, from his own phone. This suite holds, on real devices of this build
// and on a crew shaped like his (both pay cycles, periods closed by hand and not, a man with
// nothing left to repay, an over-settled man, a man with no daily rate, a man with a later
// period closed in front of an open one, a man with nothing open):
//
//   R1  WHAT IT WILL DO, before anything is written: each man's ended open periods oldest
//       first, the amount the ledger still holds (the board's own figure), who is left as he
//       is and why - and the reading writes nothing.
//   R2  THE WRITE, through the screen's own buttons: every chosen man reads zero on the
//       ledger, every ended period of his is closed with nothing taken, nothing already on
//       the ledger changed by a byte (iron law 1), periods already closed read as they did,
//       the men left as they are untouched, the repayment is the form's kind and method,
//       dated today, the closes the per-man writer's, oldest first; the judge condemns
//       nothing; «מי חייב כסף» names only the men left.
//   R3  THE SECOND CALCULATOR (tests/oracle.mjs) agrees, period by period, and says nobody
//       chosen owes anything.
//   R4  A SECOND RUN does nothing: nothing left, one sentence, no write.
//   R5  NOT SYNCED: refused, the weekly close's own sentence, nothing written.
//   R6  THE RECORD MOVED between the look and the press: the whole pass stops, nothing
//       written, the man named.
//   R7  DOUBLE PRESS: one write.
//   R8  MORE THAN ONE COMMIT: men packed into several, never split; a commit that fails
//       stops the pass with the men before it done and named, and nothing of the rest; the
//       tool re-read then offers exactly the rest.
//   R9  THE GATES, and a crew with nobody held: the board after says «אף עובד לא חייב כסף
//       כרגע.»
//   R10 THE ONE WAY IN: a shut row of ⋯ that never opens by itself, and no other screen.
//   R11 THE WORDS, word for word; every borrowed one in its owner's source.
//
// Synthetic names and money throughout. No browser, no emulator.

import vm from 'node:vm';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDevice, settleUntil } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import * as oracle from './oracle.mjs';

process.env.TZ = 'Asia/Jerusalem';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = file => readFileSync(join(ROOT, file), 'utf8');
const RESET = source('js/ui/advancereset.js');

const OPEN = { carryAdvances: true, ledgerWrites: true };
const SHUT = { carryAdvances: false, ledgerWrites: false };
const TODAY = '2026-11-14';
const j = value => JSON.stringify(value);
const plain = text => String(text).replace(/[⁦-⁩‎‏]/g, '');
const addDays = (date, days) => {
    const [y, m, d] = date.split('-').map(Number);
    const at = new Date(y, m - 1, d + days, 12);
    return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
};
const workdays = (from, to) => {
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
        const parsed = step.match(/^([a-z0-9]*)((?:[.#][\w-]+)*)(\[data-worker="([^"]+)"\])?$/i);
        if (!parsed) return false;
        if (parsed[1] && item.tagName !== parsed[1].toUpperCase()) return false;
        if (parsed[4] && item.dataset.worker !== parsed[4]) return false;
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
            scrollTop: 0, offsetHeight: 0, clientHeight: 0,
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

// The dialog's frame, exactly as index.html has it (R11 holds the two to one list of ids).
const FRAME_IDS = ['advanceResetModal', 'advanceResetTitle', 'advanceResetMeta', 'advanceResetSteps', 'advanceResetStatus',
    'advanceResetBody', 'advanceResetTotals', 'advanceResetGo', 'advanceResetBack'];
function frame(doc) {
    const make = (tag, id, cls, parent) => {
        const made = doc.createElement(tag);
        if (id) made.id = id;
        if (cls) made.className = cls;
        if (parent) parent.appendChild(made);
        return made;
    };
    const modal = make('div', 'advanceResetModal', 'modal', doc.body);
    const content = make('div', null, 'modal-content weekly-close-content advance-reset-content', modal);
    make('h3', 'advanceResetTitle', null, content);
    make('p', 'advanceResetMeta', 'weekly-close-meta', content);
    make('div', 'advanceResetSteps', 'weekly-close-steps', content);
    make('p', 'advanceResetStatus', 'weekly-close-status', content).hidden = true;
    make('div', 'advanceResetBody', 'weekly-close-body', content);
    const foot = make('div', null, 'weekly-close-foot', content);
    make('div', 'advanceResetTotals', 'weekly-close-totals', foot).hidden = true;
    const actions = make('div', null, 'weekly-close-foot-actions', foot);
    make('button', 'advanceResetGo', 'weekly-close-go advance-reset-go', actions).hidden = true;
    make('button', 'advanceResetBack', 'btn-secondary weekly-close-back', actions);
    ['reportsView', 'advancesView', 'weeklyCloseModal'].forEach(name => make('div', name, null, doc.body));
}

// ---------------------------------------------------------------- phones
function phone({ today = TODAY, deviceId = 'd_owner', storage = null, flags = OPEN } = {}) {
    const options = { deviceId, flags };
    if (storage) options.storage = storage;
    const d = makeDevice(options);
    d.setToday(today);
    d.Sync.pushDelayMs = 5;
    const doc = makeDom();
    frame(doc);
    d.doc = doc;
    d.ctx.document = doc;
    d.run = code => vm.runInContext(code, d.ctx, { filename: 'advancereset-suite' });
    ['js/ui/sitecolor.js', 'js/ui/reports.js', 'js/ui/daycheck.js', 'js/ui/owes.js', 'js/ui/weeklyclose.js']
        .forEach(file => d.run(source(file)));
    d.run(RESET);
    // The two buttons of the foot, wired as index.html wires them (onclick on the global scope).
    doc.getElementById('advanceResetGo').addEventListener('click', () => d.run('advanceResetGo()'));
    doc.getElementById('advanceResetBack').addEventListener('click', () => d.run('advanceResetBack()'));
    d.told = [];
    d.asked = [];
    d.answer = true;
    d.ctx.askTell = said => { d.told.push(typeof said === 'string' ? said : (said && (said.message || said.title))); return Promise.resolve(true); };
    d.ctx.askConfirm = question => { d.asked.push(question); return Promise.resolve(d.answer); };
    d.ctx.render = () => {
        d.renders.count += 1;
        if (typeof d.ctx.renderAdvanceResetIfOpen === 'function') d.ctx.renderAdvanceResetIfOpen();
    };
    d.backups = 0;
    d.ctx.exportBackup = () => { d.backups += 1; };
    d.ctx.showView = () => {};
    d.run('var currentView = "advances";');
    if (storage) d.State.load();
    return d;
}
const shared = d => { d.run('weeklyCloseShared = () => true;'); return d; };
function freeze(d, iso) {
    const Real = Date;
    class Fixed extends Real {
        constructor(...args) { if (args.length) super(...args); else super(iso); }
        static now() { return new Real(iso).getTime(); }
    }
    d.ctx.Date = Fixed;
}

// ---------------------------------------------------------------- the crew, through the app's own writers
const PLACES = [{ id: 'p_01', name: 'אתר צפון', active: true }, { id: 'p_02', name: 'אתר דרום', active: true }];
const W = '2026-08-07=weekly';
function day(d, id, date) {
    const change = d.call('assignPlace', d.State.schedule, date, id, 'actual', 'p_01');
    if (!change || change.refused) throw new Error(`a day for ${id} on ${date}`);
}
function advance(d, id, date, amount) {
    return d.call('recordNewAdvance', d.State.schedule, id, date, amount, '', `${date}T07:00:00.000Z`, 'd_seed', 'cash')[0].value.id;
}
function repaid(d, advanceId, amount, date) {
    if (!d.call('recordAdvanceRepaid', d.State.schedule, advanceId, amount, date, '', `${date}T15:00:00.000Z`, 'd_seed', 'cash')) {
        throw new Error('a repayment was refused');
    }
}
function approve(d) {
    const plan = d.call('planCarryMigration', d.State.schedule);
    if (!d.call('carryMigrationApproved', d.State.schedule, plan)) {
        d.call('recordCarryApproval', d.State.schedule, plan, '2026-09-01T09:00:00.000Z', 'd_person');
    }
}
function byHand(d, id, from, to, deduction, at) {
    const made = d.call('closePeriodChanges', d.State.schedule, id, from, to, at, 'd_seed', deduction);
    if (!made.length) throw new Error(`a close by hand of ${id} ${from} was refused`);
}
function kept(d) {
    if (d.State.save({ silent: true }) !== true) throw new Error('the seeded record was not saved');
    return d;
}

// THE CREW, today Saturday 14 November 2026 (the fortnight 30/10-12/11 and the week to 12/11
// have ended; the fortnight and the week holding today are open):
//
//   w_a  עמיר      fortnightly 500  3,000 on 21/09; nothing closed - 4 periods, 3,000 back
//   w_b  בשיר      weekly 400       4,000 on 12/10; his first week closed by hand at the sheet's
//                                   figure (2,400 taken); 4 weeks open, 1,600 back
//   w_c  סלים      fortnightly 450  1,500 on 05/10, handed back 20/10; 3 periods, nothing back
//   w_d  דאוד      weekly 450       500 on 20/10, handed back twice (500 and 300): over-settled
//   w_e  איהאב     fortnightly, no daily rate, 1,000 on 05/10
//   w_f  פאדי      weekly 420       no advance: not on it
//   w_g  גמיל      weekly 400       5,000 on 19/10; that week left OPEN and the next closed by
//                                   hand taking from what was carried into it
//   w_h  חוסאם     fortnightly 500  1,000 on 05/10; every period closed by hand with nothing
//                                   taken - nothing open, 1,000 back
const NAMES = { w_a: 'עמיר', w_b: 'בשיר', w_c: 'סלים', w_d: 'דאוד', w_e: 'איהאב', w_f: 'פאדי', w_g: 'גמיל', w_h: 'חוסאם' };
function crew({ heldMen = true } = {}) {
    const d = phone();
    const all = [
        { id: 'w_a', name: NAMES.w_a, active: true, dailyRate: 500, hourlyRate: 0 },
        { id: 'w_b', name: NAMES.w_b, active: true, dailyRate: 400, hourlyRate: 0, payCycles: W },
        { id: 'w_c', name: NAMES.w_c, active: true, dailyRate: 450, hourlyRate: 0 },
        { id: 'w_d', name: NAMES.w_d, active: true, dailyRate: 450, hourlyRate: 0, payCycles: W },
        { id: 'w_e', name: NAMES.w_e, active: true, dailyRate: 0, hourlyRate: 0 },
        { id: 'w_f', name: NAMES.w_f, active: true, dailyRate: 420, hourlyRate: 0, payCycles: W },
        { id: 'w_g', name: NAMES.w_g, active: true, dailyRate: 400, hourlyRate: 0, payCycles: W },
        { id: 'w_h', name: NAMES.w_h, active: true, dailyRate: 500, hourlyRate: 0 }
    ];
    const ids = heldMen ? all.map(w => w.id) : ['w_a', 'w_b', 'w_c', 'w_f', 'w_h'];
    d.State.schedule.workers = all.filter(w => ids.includes(w.id));
    d.State.schedule.places = PLACES;
    workdays('2026-09-04', '2026-11-13').forEach(date => ids.forEach(id => day(d, id, date)));
    advance(d, 'w_a', '2026-09-21', 3000);
    advance(d, 'w_b', '2026-10-12', 4000);
    const c = advance(d, 'w_c', '2026-10-05', 1500);
    repaid(d, c, 1500, '2026-10-20');
    advance(d, 'w_h', '2026-10-05', 1000);
    if (heldMen) {
        const dd = advance(d, 'w_d', '2026-10-20', 500);
        repaid(d, dd, 500, '2026-10-21');
        repaid(d, dd, 300, '2026-10-22');
        advance(d, 'w_e', '2026-10-05', 1000);
        advance(d, 'w_g', '2026-10-19', 5000);
    }
    approve(d);
    byHand(d, 'w_b', '2026-10-09', '2026-10-15', undefined, '2026-10-16T16:00:00.000Z');
    byHand(d, 'w_h', '2026-10-02', '2026-10-15', 0, '2026-10-16T16:00:00.000Z');
    byHand(d, 'w_h', '2026-10-16', '2026-10-29', 0, '2026-10-30T16:00:00.000Z');
    byHand(d, 'w_h', '2026-10-30', '2026-11-12', 0, '2026-11-13T16:00:00.000Z');
    if (heldMen) {
        // Out of order: a close the v198 planner refuses ('earlierOpen') and every build up to
        // v197 wrote. Seeded the way an older build left it - with the order question asked
        // of nobody, where this tree has it at all - so the suite reads the same record on a
        // tree with that planner.
        const asked = d.run('typeof closureOrderFacts === "function"');
        if (asked) d.run('var realOrderFacts = closureOrderFacts; closureOrderFacts = (s, w, f, t) => Object.assign(realOrderFacts(s, w, f, t), { earlierOpen: null, laterClosed: false });');
        byHand(d, 'w_g', '2026-10-23', '2026-10-29', undefined, '2026-10-30T16:01:00.000Z');
        if (asked) d.run('closureOrderFacts = realOrderFacts;');
    }
    return kept(d);
}
const readOf = d => d.call('advanceResetRead', d.State.schedule, d.ctx.todayStr());
const manOf = (read, id) => read.men.filter(man => man.id === id)[0] || null;
const diskOf = d => {
    const out = d.dump();
    Object.keys(out).forEach(key => { if (key.indexOf('farkad:writeTick') === 0) delete out[key]; });
    return j(out);
};
const ledgerOf = d => (d.State.schedule.ledger || {}).advances || {};
const owedOf = (d, id) => { const open = d.call('openAdvanceBalance', d.State.schedule, id); return open ? open.total : 0; };

// The screen, pressed.
const fire = (target, type) => (target.listeners[type] || []).forEach(heard => heard({ preventDefault() {}, target }));
const press = target => fire(target, 'click');
const bodyText = d => plain(d.doc.getElementById('advanceResetBody').textContent);
const statusOf = d => plain(d.doc.getElementById('advanceResetStatus').textContent);
const goOf = d => d.doc.getElementById('advanceResetGo');
const cardOf = (d, id) => d.doc.getElementById('advanceResetBody').querySelectorAll('.advance-reset-card')
    .filter(card => card.dataset.worker === id)[0] || null;
const idle = d => settleUntil(() => d.run('!advanceResetBusy'), 60000, 5);
async function openRead(d) {
    d.call('openAdvanceReset');
    await settleUntil(() => d.run('ADVANCE_RESET && ADVANCE_RESET.read !== null'), 60000, 5);
}

const PERIODS = {
    w_a: [['2026-09-18', '2026-10-01'], ['2026-10-02', '2026-10-15'], ['2026-10-16', '2026-10-29'], ['2026-10-30', '2026-11-12']],
    w_b: [['2026-10-16', '2026-10-22'], ['2026-10-23', '2026-10-29'], ['2026-10-30', '2026-11-05'], ['2026-11-06', '2026-11-12']],
    w_c: [['2026-10-02', '2026-10-15'], ['2026-10-16', '2026-10-29'], ['2026-10-30', '2026-11-12']],
    w_h: []
};

// ================================================================== R1 what it will do
{
    suite('R1 before anything is written: each man\'s open periods oldest first, the ledger\'s figure, who is left and why');
    const d = shared(crew());
    const before = diskOf(d);
    const read = readOf(d);
    same('the men on it, in the roster\'s order (פאדי, with no advance, is not)', read.men.map(man => man.id),
        ['w_a', 'w_b', 'w_c', 'w_d', 'w_e', 'w_g', 'w_h']);
    same('each chosen man\'s ended open periods, oldest first', ['w_a', 'w_b', 'w_c', 'w_h'].map(id => [id,
        manOf(read, id).periods.map(period => [period.from, period.to])]),
    ['w_a', 'w_b', 'w_c', 'w_h'].map(id => [id, PERIODS[id]]));
    same('the amount to record as handed back is the ledger\'s balance, the board\'s own figure',
        ['w_a', 'w_b', 'w_c', 'w_h'].map(id => [id, manOf(read, id).repaid, owedOf(d, id)]),
        [['w_a', 3000, 3000], ['w_b', 1600, 1600], ['w_c', 0, 0], ['w_h', 1000, 1000]]);
    same('the board reads the same men as owing that amount', d.call('owesRead', d.State.schedule, TODAY).rows
        .filter(row => ['w_a', 'w_b', 'w_h'].includes(row.workerId)).map(row => [row.workerId, row.amount]).sort(),
    [['w_a', 3000], ['w_b', 1600], ['w_h', 1000]]);
    same('the men left as they are, each with the box\'s own reason', ['w_d', 'w_e', 'w_g'].map(id => [id, manOf(read, id).held.kind]),
        [['w_d', 'overpaid'], ['w_e', 'unpriced'], ['w_g', 'laterClosed']]);
    same('the others are not held', ['w_a', 'w_b', 'w_c', 'w_h'].map(id => manOf(read, id).held), [null, null, null, null]);
    same('the later close named for גמיל', [manOf(read, 'w_g').held.from, manOf(read, 'w_g').held.to], ['2026-10-23', '2026-10-29']);
    const presumedA = d.call('advanceAccount', d.State.schedule, 'w_a', '2026-09-18', '2026-10-01').deducted;
    given('the root cause on this crew: the sheet presumes עמיר\'s 3,000 came off a wage, the ledger does not', presumedA > 0
        && owedOf(d, 'w_a') === 3000, String(presumedA));
    check('reading wrote nothing', diskOf(d) === before);
}

// ================================================================== R2 the write, through the screen
async function runThrough(d, { skip = [] } = {}) {
    await openRead(d);
    skip.forEach(id => press(cardOf(d, id).querySelector('.advance-reset-skip')));
    press(goOf(d));
    press(goOf(d));
    await idle(d);
}
{
    suite('R2 the write: closes at 0 oldest first, then the repayment; everybody chosen at zero; nothing existing moved');
    const d = shared(crew());
    const at = '2026-11-14T10:00:00.000Z';
    freeze(d, at);
    const ledgerBefore = j(ledgerOf(d));
    const oldEntries = Object.assign({}, ledgerOf(d));
    const oldIds = Object.keys(oldEntries);
    const closedBefore = [['w_b', '2026-10-09', '2026-10-15'], ['w_h', '2026-10-02', '2026-10-15'], ['w_h', '2026-10-30', '2026-11-12'],
        ['w_g', '2026-10-23', '2026-10-29']].map(([id, from, to]) => j(d.call('advanceAccount', d.State.schedule, id, from, to)));
    const heldLedger = id => j(Object.values(ledgerOf(d)).filter(entry => entry.workerId === id
        || (d.State.schedule.advances[entry.advanceId] || {}).workerId === id));
    const heldBefore = ['w_d', 'w_e', 'w_g'].map(heldLedger);
    await openRead(d);
    check('the strong line about the backup, and its own button, on the first page',
        bodyText(d).indexOf(d.run('ADVANCE_RESET_TEXT.backupFirst')) !== -1
        && d.doc.getElementById('advanceResetBody').querySelectorAll('.advance-reset-backup-button').length === 1);
    press(d.doc.getElementById('advanceResetBody').querySelector('.advance-reset-backup-button'));
    same('the button is the backup\'s own door', d.backups, 1);
    const foot = d.doc.getElementById('advanceResetTotals').querySelectorAll('.weekly-close-total b').map(node => plain(node.textContent));
    same('the foot: four men, eleven accounts, 5,600 back', foot, ['4', '11', '5600 ₪']);
    press(goOf(d));
    same('«המשך לסיכום» goes to the summary and writes nothing', [d.run('ADVANCE_RESET.step'), j(ledgerOf(d)) === ledgerBefore], [2, true]);
    const summary = bodyText(d);
    check('the summary names the men left and why', ['דאוד', 'איהאב', 'גמיל'].every(name => summary.indexOf(name) !== -1)
        && summary.indexOf(d.run('ADVANCE_RESET_TEXT.heldList')) !== -1, summary.slice(0, 300));
    same('«אפס» says how many', goOf(d).textContent, 'אפס 4 עובדים');
    press(goOf(d));
    await idle(d);
    same('asked once, the destructive kind, with the count, the total and every name', d.asked.map(q => [q.title, plain(q.message), q.danger, q.names]),
        [['לאפס את המקדמות?', 'ייסגרו 11 חשבונות בלי ניכוי, ויירשם שהוחזרו 5600 ₪ מ-4 עובדים. אי אפשר לבטל.', true,
            ['עמיר', 'בשיר', 'סלים', 'חוסאם']]]);
    same('the third page', d.run('ADVANCE_RESET.step'), 3);
    same('every chosen man reads zero on the ledger', ['w_a', 'w_b', 'w_c', 'w_h'].map(id => owedOf(d, id)), [0, 0, 0, 0]);
    const closesOk = ['w_a', 'w_b', 'w_c'].every(id => PERIODS[id].every(([from, to]) => {
        const account = d.call('advanceAccount', d.State.schedule, id, from, to);
        return account.closed && account.deducted === 0 && account.net === account.gross;
    }));
    check('every ended period of theirs is closed with nothing taken - the full wage paid', closesOk);
    same('no ended open period is left to any of them', ['w_a', 'w_b', 'w_c', 'w_h'].map(id => manOf(readOf(d), id)), [null, null, null, null]);
    const unchanged = oldIds.filter(id => j(ledgerOf(d)[id]) !== j(oldEntries[id]));
    same('nothing already on the ledger changed by a byte, nothing gone (append-only)', [unchanged, oldIds.every(id => id in ledgerOf(d))], [[], true]);
    same('periods closed before read exactly as they did', [['w_b', '2026-10-09', '2026-10-15'], ['w_h', '2026-10-02', '2026-10-15'],
        ['w_h', '2026-10-30', '2026-11-12'], ['w_g', '2026-10-23', '2026-10-29']]
        .map(([id, from, to]) => j(d.call('advanceAccount', d.State.schedule, id, from, to))), closedBefore);
    same('the men left as they are: not one entry of theirs added or moved', ['w_d', 'w_e', 'w_g'].map(heldLedger), heldBefore);
    const fresh = Object.values(ledgerOf(d)).filter(entry => !oldIds.includes(entry.id));
    same('what was added: eleven payslips with no deduction beside them, and three repayments (סלים owed nothing)',
        [fresh.filter(e => e.kind === 'closed').length, fresh.filter(e => e.kind === 'deducted').length, fresh.filter(e => e.kind === 'repaid').length],
        [11, 0, 3]);
    same('every new entry at one moment, by this phone', [...new Set(fresh.map(e => `${e.at}|${e.by}`))], [`${at}|d_owner`]);
    const repays = fresh.filter(e => e.kind === 'repaid');
    same('the repayments: the form\'s kind and method, dated today, with the note', [...new Set(repays.map(e => j([e.date, e.method, e.note])))],
        [j([TODAY, 'cash', 'איפוס - הוחזר מחוץ לאפליקציה'])]);
    same('each against an advance of his, the amounts of R1', repays.map(e => [d.State.schedule.advances[e.advanceId].workerId, e.amount]).sort(),
        [['w_a', 3000], ['w_b', 1600], ['w_h', 1000]]);
    // Oldest first: each payslip of a man opens owing what the one before it left.
    const chain = ['w_a', 'w_b', 'w_c'].every(id => {
        const slips = fresh.filter(e => e.kind === 'closed' && e.workerId === id).sort((x, y) => (x.periodFrom < y.periodFrom ? -1 : 1));
        return slips.every((slip, i) => i === 0 || slip.carriedIn === slips[i - 1].balanceAfter);
    });
    check('oldest first: each payslip opens on what the one before it left', chain);
    same('the judge condemns nothing it wrote', d.call('impossibleClosures', d.State.schedule), []);
    // דאוד is over-settled: he owes nothing and the board never named him; he is left for a
    // person to look at, as the box leaves him.
    same('«מי חייב כסף» names only the men left as they are who owe', d.call('owesRead', d.State.schedule, TODAY).rows.map(r => r.workerId).sort(),
        ['w_e', 'w_g']);
    const done = bodyText(d);
    check('the result: the closes, the repayments by name, the men not reset, who still owes',
        done.indexOf('נסגרו 11 חשבונות בלי ניכוי · נרשם שהוחזרו 5600 ₪') !== -1 && done.indexOf('עמיר · 3000 ₪') !== -1
        && done.indexOf('לא אופסו:') !== -1 && done.indexOf('עדיין חייבים:') !== -1, done);
    const reopened = phone({ storage: d.dump() });
    same('the disk holds it: a phone opening on it reads the same zeros', ['w_a', 'w_b', 'w_c', 'w_h'].map(id => owedOf(reopened, id)), [0, 0, 0, 0]);
    same('nothing is queued unsent but the commit itself', d.Sync.pendingCount() >= 0, true);

    // ============================================================== R3 the second calculator
    suite('R3 the second calculator agrees, period by period, and says nobody chosen owes anything');
    const record = JSON.parse(j(d.State.schedule));
    const money = (app, agorot) => (agorot === null || agorot === undefined ? app === null || app === undefined
        : typeof app === 'number' && Math.abs(app * 100 - agorot) < 1e-6);
    same('nothing open by rule for any chosen man', ['w_a', 'w_b', 'w_c', 'w_h'].map(id => oracle.openBalance(record, id).total), [0, 0, 0, 0]);
    const wrong = [];
    ['w_a', 'w_b', 'w_c', 'w_h', 'w_d', 'w_g'].forEach(id => {
        const worker = d.State.worker(id);
        let period = d.call('periodRangeFor', worker, '2026-09-18');
        for (let n = 0; n < 30 && period.from <= TODAY; n += 1) {
            const app = d.call('advanceAccount', d.State.schedule, id, period.from, period.to);
            const want = oracle.accountOf(record, id, period.from, period.to);
            ['carriedIn', 'given', 'repaid', 'gross', 'deducted', 'carriedOut', 'carriedForward', 'net'].forEach(field => {
                if (!money(app[field], want[field])) wrong.push(`${id} ${period.from} ${field} app ${app[field]} rule ${want[field]}`);
            });
            if (app.closed !== want.closed) wrong.push(`${id} ${period.from} closed`);
            period = d.call('nextPeriodFor', worker, period.from);
        }
    });
    same('every period of six men, both cycles, the app and the rule to the agora', wrong, []);
    same('the current period opens owing nothing for the chosen men, by rule', ['w_a', 'w_b', 'w_c', 'w_h'].map(id => {
        const range = d.call('periodRangeFor', d.State.worker(id), TODAY);
        const want = oracle.accountOf(record, id, range.from, range.to);
        return [want.carriedForward, want.deducted];
    }), [[0, 0], [0, 0], [0, 0], [0, 0]]);

    // ============================================================== R4 a second run
    suite('R4 a second run does nothing');
    const again = readOf(d);
    same('only the men left as they are are on it', again.men.map(man => man.id), ['w_d', 'w_e', 'w_g']);
    const e = shared(phone({ storage: d.dump() }));
    e.State.schedule.workers = e.State.schedule.workers.filter(w => !['w_d', 'w_e', 'w_g'].includes(w.id));
    kept(e);
    const quiet = diskOf(e);
    await openRead(e);
    same('nothing left: one sentence, no button', [bodyText(e), goOf(e).hidden], ['אין מה לאפס: אף עובד לא חייב כסף ואין חשבון ישן פתוח.', true]);
    press(goOf(e));
    await idle(e);
    same('and nothing written', [diskOf(e) === quiet, e.asked.length], [true, 0]);
    const nothing = e.call('advanceResetWrite', []);
    same('the writer handed nobody writes nothing', [nothing.done, diskOf(e) === quiet], [[], true]);
}

// ================================================================== R5 not synced
{
    suite('R5 a phone that is not synced: refused, said, nothing written');
    const d = crew();
    const before = diskOf(d);
    await openRead(d);
    same('the weekly close\'s own sentence at the top', statusOf(d),
        'סוגרים חשבונות רק כשמופיע «מסונכרן בין המכשירים» - כך שני טלפונים לא יסגרו את אותו חשבון בסכומים שונים.');
    press(goOf(d));
    press(goOf(d));
    await idle(d);
    same('nothing asked and nothing written', [d.asked.length, diskOf(d) === before], [0, true]);
    const direct = d.call('advanceResetWrite', readOf(d).men.filter(man => !man.held));
    check('the writer itself refuses', Boolean(direct.notReady) && diskOf(d) === before);
    d.Sync.pendingCount = () => 2;
    d.Sync.adapter = {};
    same('a write still waiting: its own sentence', d.call('weeklyCloseReadyWord'),
        'יש בטלפון הזה רישום שעוד לא נשלח או שמחכה לבדיקה ב-⋯, ולכן לא סוגרים ממנו חשבונות עד שיופיע «מסונכרן בין המכשירים».');
}

// ================================================================== R6 the record moved
{
    suite('R6 the record moved between the look and the press: the whole pass stops');
    const d = shared(crew());
    await openRead(d);
    press(goOf(d));
    // Another advance for עמיר lands (another phone, adopted) while the summary is read.
    d.State.commitMany(d.call('recordNewAdvance', d.State.schedule, 'w_a', '2026-11-14', 200, '', '2026-11-14T09:00:00.000Z', 'd_other', 'cash'));
    const before = diskOf(d);
    check('the screen says the record moved', statusOf(d).indexOf('הרישום השתנה מאז שנפתח המסך') !== -1, statusOf(d));
    press(goOf(d));
    await idle(d);
    same('nothing written', diskOf(d) === before, true);
    same('back on the first page, the man named', [d.run('ADVANCE_RESET.step'), statusOf(d).indexOf('השתנה אצל: ⁦עמיר⁩'.replace(/[⁦⁩]/g, '')) !== -1],
        [1, true]);
    same('and read again: his new amount', manOf(d.run('ADVANCE_RESET.read'), 'w_a').repaid, 3200);
}

// ================================================================== R7 double press
{
    suite('R7 two presses of «אפס» write once');
    const d = shared(crew());
    await openRead(d);
    press(goOf(d));
    press(goOf(d));
    press(goOf(d));
    await idle(d);
    press(goOf(d));
    await idle(d);
    const repays = Object.values(ledgerOf(d)).filter(e => e.kind === 'repaid' && e.note === 'איפוס - הוחזר מחוץ לאפליקציה');
    same('one question, three repayments, everybody at zero', [d.asked.length, repays.length, ['w_a', 'w_b', 'w_h'].map(id => owedOf(d, id))],
        [1, 3, [0, 0, 0]]);
}

// ================================================================== R8 more than one commit
{
    suite('R8 men packed into several commits, never split; a failed commit stops the pass honestly');
    const d = shared(crew());
    d.run('advanceResetRoom = () => 6;');
    const commits = [];
    const real = d.State.commitMany.bind(d.State);
    d.State.commitMany = changes => { commits.push(changes.map(c => c.value.workerId || d.State.schedule.advances[c.value.advanceId]?.workerId || 'approval')); return real(changes); };
    await runThrough(d);
    same('four men in three commits, each man whole in one', commits.map(c => [...new Set(c)]), [['w_a'], ['w_b'], ['w_c', 'w_h']]);
    same('everybody chosen at zero', ['w_a', 'w_b', 'w_c', 'w_h'].map(id => owedOf(d, id)), [0, 0, 0, 0]);

    const f = shared(crew());
    f.run('advanceResetRoom = () => 6;');
    let calls = 0;
    const realF = f.State.commitMany.bind(f.State);
    f.State.commitMany = changes => { calls += 1; if (calls === 2) { f.State.rollback(); return false; } return realF(changes); };
    await runThrough(f);
    same('the first commit landed, the second was refused, nothing after it tried', calls, 2);
    same('עמיר done; בשיר, סלים and חוסאם untouched', ['w_a', 'w_b', 'w_h'].map(id => owedOf(f, id)), [0, 1600, 1000]);
    check('said: only part was written', statusOf(f).indexOf('נרשם רק חלק: 1 מתוך 4 עובדים') !== -1, statusOf(f));
    check('בשיר has no payslip from the pass', !Object.values(ledgerOf(f)).some(e => e.workerId === 'w_b' && e.note === undefined
        && e.kind === 'closed' && e.periodFrom === '2026-10-16'));
    f.State.commitMany = realF;
    same('re-read, the tool offers exactly the rest', readOf(f).men.filter(man => !man.held).map(man => man.id), ['w_b', 'w_c', 'w_h']);
    f.call('closeAdvanceReset');
    f.asked.length = 0;
    await runThrough(f);
    same('and a second run finishes them', ['w_a', 'w_b', 'w_c', 'w_h'].map(id => owedOf(f, id)), [0, 0, 0, 0]);
    same('the judge condemns nothing', f.call('impossibleClosures', f.State.schedule), []);
}

// ================================================================== R9 the gates; a crew with nobody held
{
    suite('R9 the gates, and the board after a crew with nobody held');
    const d = shared(phone({ flags: SHUT, storage: crew().dump() }));
    const before = diskOf(d);
    const read = readOf(d);
    same('the carry and the writer shut: no figure at all', [read.gate, read.men.length], [false, 0]);
    await openRead(d);
    check('the page says why', bodyText(d).indexOf('לפני רישום החזרים או קיזוז צריך לבדוק את יתרות המקדמות הקיימות.') !== -1);
    check('and nothing is written', diskOf(d) === before);

    const c = shared(crew({ heldMen: false }));
    await runThrough(c);
    same('the board after: nobody owes', c.call('owesRead', c.State.schedule, TODAY).rows.length, 0);
    check('the result page says the board\'s own sentence', bodyText(c).indexOf('אף עובד לא חייב כסף כרגע.') !== -1, bodyText(c));
    same('nobody owes on the ledger', c.State.schedule.workers.map(w => owedOf(c, w.id)), [0, 0, 0, 0, 0]);
    // «סגירות שנרשמו» has the pass as one close.
    const groups = c.call('owesClosures', c.State.schedule).filter(g => g.at === c.run('ADVANCE_RESET.result.key').split('|')[0]);
    same('«סגירות שנרשמו» has it as one close of eleven accounts, nothing deducted', groups.map(g => [g.items.length, g.totals.deducted]), [[11, 0]]);
}

// ================================================================== R10 the one way in
{
    suite('R10 the one way in: a shut row of ⋯, and no other screen');
    const html = source('index.html');
    const calls = (html.match(/openAdvanceReset\(\)/g) || []).length;
    const row = html.slice(html.indexOf('id="settingsFoldAdvanceReset"'), html.indexOf('</details>', html.indexOf('id="settingsFoldAdvanceReset"')));
    same('index.html calls it once, inside its own row', [calls, row.indexOf('onclick="openAdvanceReset()"') !== -1], [1, true]);
    const panel = html.slice(html.indexOf('id="settingsPanel"'));
    check('the row is inside ⋯, in «גיבוי ושחזור»', panel.indexOf('id="settingsFoldAdvanceReset"') !== -1
        && html.indexOf('id="settingsFoldAdvanceReset"') > html.indexOf('id="settingsBackups"')
        && html.indexOf('id="settingsFoldAdvanceReset"') < html.indexOf('id="settingsHelp"'));
    check('it is not written open', !/id="settingsFoldAdvanceReset"[^>]*\sopen/.test(html));
    const settings = source('js/ui/settings.js');
    check('no reason opens it by itself, and it is not among the rows open at every opening',
        settings.indexOf('settingsFoldAdvanceReset') === -1);
    const elsewhere = [];
    const walk = dir => readdirSync(join(ROOT, dir), { withFileTypes: true }).forEach(entry => {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith('.js') && path !== 'js/ui/advancereset.js' && /openAdvanceReset/.test(source(path))) elsewhere.push(path);
    });
    walk('js');
    same('no script but its own names it: not the advances page, not the reports, not the day', elsewhere, []);
    check('owes.js and reports.js draw no button for it', !/advanceReset/i.test(source('js/ui/owes.js')) && !/advanceReset/i.test(source('js/ui/reports.js'))
        && !/advanceReset/i.test(source('js/ui/day.js')));
}

// ================================================================== R11 the words
{
    suite('R11 the words, word for word (PROPOSED)');
    const d = phone();
    const T = name => d.run(`ADVANCE_RESET_TEXT.${name}`);
    same('the fixed words', ['entry', 'rowHint', 'rowLead', 'title', 'step1', 'step2', 'step3', 'reading', 'lead', 'backupFirst', 'nothing',
        'noPeriods', 'noWage', 'noRepay', 'chipReset', 'chipSkipped', 'chipHeld', 'skippedLine', 'heldTooMany', 'footClosed', 'footRepaid',
        'footMen', 'worker', 'accounts', 'repaid', 'noneChosen', 'skippedList', 'heldList', 'askTitle', 'askOk', 'saving', 'moved',
        'notWritten', 'doneHead', 'doneRepaid', 'notReset', 'note'].map(T), [
        'איפוס מקדמות', 'פעם אחת: כל העובדים לאפס',
        'סוגר כל חשבון ישן בלי ניכוי, ורושם שכל עובד החזיר את מה שהוא עוד חייב. לפני שמאשרים רואים הכל, ואפשר לדלג על עובד.',
        'איפוס מקדמות', '1 · בדיקה', '2 · סיכום', '3 · נרשם', 'בודק את החשבונות…',
        'פעם אחת, לכל העובדים: כל חשבון ישן שלא נסגר ייסגר בלי ניכוי (השכר שולם במלואו), ומה שהעובד עוד חייב יירשם כהוחזר היום. שום דבר לא נמחק.',
        'לפני שממשיכים - שמור קובץ גיבוי. אחרי האישור אי אפשר לבטל, רק לרשום תיקון לצד כל רישום.',
        'אין מה לאפס: אף עובד לא חייב כסף ואין חשבון ישן פתוח.',
        'אין לו חשבון ישן פתוח.', 'בלי שכר יומי', 'לא חייב כסף - לא יירשם החזר.', 'יאופס', 'דילגת', 'לא יאופס',
        'לא יאופס עכשיו. שום דבר שלו לא ישתנה.',
        'יש לו יותר מדי חשבונות פתוחים לפעם אחת. סגור חלק מהם בדוח, ואז פתח שוב את המסך.',
        'חשבונות שייסגרו', 'יירשם כהוחזר', 'עובדים', 'עובד', 'חשבונות', 'הוחזר', 'לא נבחר אף עובד לאיפוס.',
        'לא יאופס עכשיו (דילגת):', 'לא יאופס - צריך לבדוק קודם:', 'לאפס את המקדמות?', 'כן, לאפס', 'שומר…',
        'הרישום השתנה מאז הבדיקה. לא נרשם דבר. בדוק שוב ואשר.',
        'לא נשמר דבר. נסה שוב, ואם זה חוזר - סגור כל עובד מהחשבון שלו בדוח.',
        'נרשם', 'נרשם כהוחזר היום:', 'לא אופסו:', 'איפוס - הוחזר מחוץ לאפליקציה']);
    same('the words with a figure', [
        d.run('ADVANCE_RESET_TEXT.periodsHead(1)'), d.run('ADVANCE_RESET_TEXT.periodsHead(4)'), d.run('ADVANCE_RESET_TEXT.wage("2500")'),
        d.run('ADVANCE_RESET_TEXT.repayLine("3000")'), d.run('ADVANCE_RESET_TEXT.heldLaterClosed("23/10 - 29/10")'),
        d.run('ADVANCE_RESET_TEXT.willReset(1)'), d.run('ADVANCE_RESET_TEXT.willReset(4)'), d.run('ADVANCE_RESET_TEXT.confirm(1)'),
        d.run('ADVANCE_RESET_TEXT.confirm(4)'), d.run('ADVANCE_RESET_TEXT.askMessage(11, "5600", 4)'),
        d.run('ADVANCE_RESET_TEXT.partial(1, 4)'), d.run('ADVANCE_RESET_TEXT.doneLine(11, "5600")'), d.run('ADVANCE_RESET_TEXT.stillOwe("דאוד")')], [
        'ייסגר חשבון אחד בלי ניכוי:', 'ייסגרו 4 חשבונות בלי ניכוי:', 'שכר 2500 ₪', 'יירשם כהוחזר היום: 3000 ₪',
        'חשבון מאוחר יותר שלו (23/10 - 29/10) כבר נסגר עם ניכוי מחוב קודם. סגירה של החשבונות שלפניו עלולה לנכות את אותה מקדמה פעמיים - בדוק את עמוד המקדמות שלו.',
        'יאופס עובד אחד', 'יאופסו 4 עובדים', 'אפס עובד אחד', 'אפס 4 עובדים',
        'ייסגרו 11 חשבונות בלי ניכוי, ויירשם שהוחזרו 5600 ₪ מ-4 עובדים. אי אפשר לבטל.',
        'נרשם רק חלק: 1 מתוך 4 עובדים. השאר לא נרשמו - פתח שוב את המסך כדי להמשיך.',
        'נסגרו 11 חשבונות בלי ניכוי · נרשם שהוחזרו 5600 ₪', 'עדיין חייבים: דאוד.']);
    const html = source('index.html');
    check('the row\'s words are index.html\'s, word for word', ['entry', 'rowHint', 'rowLead'].every(name => html.indexOf(`>${T(name)}<`) !== -1));
    check('the backup button\'s words are index.html\'s own, on exportBackup', html.indexOf(`onclick="exportBackup()">${d.run('ADVANCE_RESET_REUSED.backup')}</button>`) !== -1);
    same('the repayment\'s method is the form\'s', [d.run('ADVANCE_RESET_METHOD'), /recordAdvanceRepaid\(State\.schedule, item\.id, amount, date,\s*noteInput\.value\.trim\(\), new Date\(\)\.toISOString\(\), syncDeviceId\(\), 'cash'\)/.test(source('js/ui/reports.js'))],
        ['cash', true]);
    same('the dialog\'s frame is index.html\'s', FRAME_IDS.filter(id => html.indexOf(`id="${id}"`) === -1), []);
    same('every Hebrew run in the file is in the words block', (() => {
        const outside = RESET.replace(/const ADVANCE_RESET_TEXT = Object\.freeze\(\{[\s\S]*?\n\}\);/, '')
            .replace(/const ADVANCE_RESET_REUSED = Object\.freeze\(\{[\s\S]*?\n\}\);/, '');
        return outside.split('\n').filter(line => !/^\s*\/\//.test(line) && /[֐-׿]/.test(line.replace(/\/\/.*$/, '')));
    })(), []);
}

report();
