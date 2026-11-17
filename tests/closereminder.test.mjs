// «תזכורת לסגירת חשבונות» (js/ui/closereminder.js) on devices.
//
//   node tests/closereminder.test.mjs
//
// The owner (2026-11-17): "on Thursday, 'there are 4 men whose account is still not closed',
// so I don't forget to close accounts". An in-app line, not a notification. This suite holds,
// on real devices of this build:
//
//   R1  THE COUNT IS «סגירת שבוע»'S OWN: on seeded records - both cycles, a man held, a man
//       closed, an earlier period forgotten, the gate shut, the writer shut - the line counts
//       exactly the men weeklyCloseRead would OFFER (held null), and nobody else.
//   R2  WHICH DAYS: a week walked day by day - nothing Friday to Wednesday while last week's
//       accounts are closed, nothing on Thursday before today is recorded, the count once it
//       is, and every day after (a forgotten close) until the account is closed; the
//       fortnightly man only on his own Thursday.
//   R3  THE LINE: its words for one and for many, its button calling «סגירת שבוע»'s own
//       opener, its ✕; no line with no crew, with the count 0, while somebody is typing or a
//       dialog is open (it comes when that ends), or when the reading throws.
//   R4  THE ✕: not again today, without reading anything; back tomorrow; a damaged note is no
//       note; a disk that refuses it keeps it for the session.
//   R5  THE SWITCH IN ⋯: on by default, exactly '1' is off, the row's place and words, off
//       reads nothing and takes the line down, on puts it back.
//   R6  ONLY THE PHONE: two keys and no other byte of the disk; never the record, the outbox,
//       the fence, the cloud, a backup or the rescue file.
//   R7  WHAT IT COSTS: a reading kept under the record; an unmoved record read once; a write
//       on the day screen not read again except on a day that ends somebody's period;
//       «דוחות», a new date and another screen read again.
//   R8  THE WORDS: every string word for word; the file writes no record and calls no browser
//       dialog.
//
// Synthetic names and money throughout. No browser, no emulator.

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDevice, makeCloud, settle, settleUntil } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

process.env.TZ = 'Asia/Jerusalem';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = file => readFileSync(join(ROOT, file), 'utf8');
const REMINDER = source('js/ui/closereminder.js');

const OPEN = { carryAdvances: true, ledgerWrites: true };
const SHUT = { carryAdvances: false, ledgerWrites: false };
const NOWRITE = { carryAdvances: true, ledgerWrites: false };
const OFF_KEY = 'farkadCloseReminder:off';
const GONE_KEY = 'farkadCloseReminder:dismissed';
const j = value => JSON.stringify(value);
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
const dow = date => new Date(`${date}T12:00:00`).getDay();

async function block(name, body) {
    suite(name);
    try {
        await body();
    } catch (error) {
        check(`${name}: the block ran to its end`, false,
            String((error && error.stack) || error).split('\n').slice(0, 3).join(' | '));
    }
}

// ---------------------------------------------------------------- a DOM small enough to read
function makeDom() {
    const byId = new Map();
    const doc = { activeElement: null };
    function node(tag) {
        let text = '';
        let classes = '';
        let id = '';
        const self = {
            tagName: String(tag).toUpperCase(), children: [], parentNode: null, attributes: {}, dataset: {},
            style: {}, listeners: {}, hidden: false, open: false, value: '', type: '',
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
            setAttribute(name, value) { if (name === 'id') self.id = value; else self.attributes[name] = String(value); },
            getAttribute(name) { return Object.prototype.hasOwnProperty.call(self.attributes, name) ? self.attributes[name] : null; },
            addEventListener(type, heard) { (self.listeners[type] = self.listeners[type] || []).push(heard); },
            removeEventListener() {}
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
        return self;
    }
    const body = node('body');
    Object.assign(doc, {
        body, createElement: node, createElementNS: (ns, tag) => node(tag),
        getElementById: name => byId.get(String(name)) || null,
        querySelectorAll: () => [],
        addEventListener() {}, removeEventListener() {}
    });
    return doc;
}

// The banner and the «כללי» section as index.html has them, «תצוגה גדולה»'s row in it.
function frame(doc) {
    const banner = doc.createElement('div');
    banner.id = 'closeReminderBanner';
    banner.className = 'banner banner-info';
    banner.style.display = 'none';
    doc.body.appendChild(banner);
    const section = doc.createElement('section');
    section.id = 'settingsDailySection';
    doc.body.appendChild(section);
    ['settingsFoldReminders', 'displayLargeCard', 'transportSwitchCard'].forEach(name => {
        const row = doc.createElement('details');
        row.id = name;
        section.appendChild(row);
    });
}

// ---------------------------------------------------------------- phones
function phone({ today = '2026-11-13', deviceId = 'd_office', storage = null, flags = OPEN, view = 'day' } = {}) {
    const options = { deviceId, flags };
    if (storage) options.storage = storage;
    const d = makeDevice(options);
    d.setToday(today);
    d.Sync.pushDelayMs = 5;
    d.harnessDoc = d.ctx.document;
    const doc = makeDom();
    frame(doc);
    d.doc = doc;
    d.ctx.document = doc;
    d.run = code => vm.runInContext(code, d.ctx, { filename: 'closereminder-suite' });
    ['js/ui/sitecolor.js', 'js/ui/reports.js', 'js/ui/daycheck.js', 'js/ui/seder.js', 'js/ui/owes.js', 'js/ui/payslips.js',
        'js/ui/weeklyclose.js'].forEach(file => d.run(source(file)));
    d.run(REMINDER);
    d.run(`var currentView = ${JSON.stringify(view)};`);
    // The reading, counted: every call of «סגירת שבוע»'s list goes through this.
    d.run('var __reads = 0; var __realRead = weeklyCloseRead; weeklyCloseRead = function () { __reads += 1; return __realRead.apply(this, arguments); };');
    d.run('var __opened = 0; openWeeklyClose = function () { __opened += 1; return true; };');
    if (storage) d.State.load();
    return d;
}
const reads = d => d.global('__reads');
const banner = d => d.doc.getElementById('closeReminderBanner');
const lineShown = d => banner(d).style.display !== 'none';
const lineText = d => (d.doc.getElementById('closeReminderLine') || { textContent: null }).textContent;
const press = target => (target.listeners.click || []).forEach(heard => heard({ preventDefault() {}, target }));
const refresh = (d, reason = 'boot') => d.call('closeReminderRefresh', reason);
const offered = d => {
    const read = d.call('weeklyCloseRead', d.State.schedule, d.ctx.todayStr(), new Date().toISOString());
    return read.gate ? read.men.filter(man => !man.held).map(man => man.id) : [];
};
const diskBut = (d, ...skip) => {
    const out = d.dump();
    Object.keys(out).forEach(key => { if (key.indexOf('farkad:writeTick') === 0 || skip.includes(key)) delete out[key]; });
    return j(out);
};

// ---------------------------------------------------------------- seeding through the app's own writers
const PLACES = [{ id: 'p_01', name: 'אתר צפון', active: true }, { id: 'p_02', name: 'אתר דרום', active: true }];
function day(d, id, date, place = 'p_01') {
    const change = d.call('assignPlace', d.State.schedule, date, id, 'actual', place);
    if (!change || change.refused) throw new Error(`a day for ${id} on ${date}`);
}
function advance(d, id, date, amount) {
    return d.call('recordNewAdvance', d.State.schedule, id, date, amount, '', `${date}T07:00:00.000Z`, 'd_seed', 'cash')[0].value.id;
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

// THREE MEN, as tests/weeklyclose.test.mjs has them: פואד fortnightly, ואליד weekly, גסאן
// fortnightly, days from 2026-10-16 to Thursday 2026-11-12, advances in and before the last
// finished period. `inOrder` closes their earlier periods by hand, oldest first.
function three({ today = '2026-11-13', flags = OPEN, inOrder = true, view = 'day', until = '2026-11-12' } = {}) {
    const d = phone({ today, flags, view });
    d.State.schedule.workers = [
        { id: 'w_f', name: 'פואד', active: true, dailyRate: 500, hourlyRate: 0 },
        { id: 'w_w', name: 'ואליד', active: true, dailyRate: 400, hourlyRate: 0, payCycles: '2026-10-16=weekly' },
        { id: 'w_g', name: 'גסאן', active: true, dailyRate: 450, hourlyRate: 0 }
    ];
    d.State.schedule.places = PLACES;
    weekdays('2026-10-16', until).forEach(date => ['w_f', 'w_w', 'w_g'].forEach(id => day(d, id, date)));
    advance(d, 'w_f', '2026-10-19', 1500);
    advance(d, 'w_f', '2026-11-02', 1000);
    advance(d, 'w_w', '2026-10-26', 800);
    advance(d, 'w_w', '2026-11-09', 600);
    advance(d, 'w_g', '2026-11-03', 900);
    approve(d);
    if (inOrder) {
        byHand(d, 'w_f', '2026-10-16', '2026-10-29', undefined, '2026-10-30T16:00:00.000Z');
        byHand(d, 'w_w', '2026-10-23', '2026-10-29', undefined, '2026-10-30T16:01:00.000Z');
        byHand(d, 'w_w', '2026-10-30', '2026-11-05', undefined, '2026-11-06T16:00:00.000Z');
    }
    return kept(d);
}

// ================================================================== R1 the count
await block('R1 the count is «סגירת שבוע»\'s own: the men it would offer, and nobody else', async () => {
    const d = three();
    same('three men, both cycles, each in his own last finished period, none held', offered(d), ['w_f', 'w_w', 'w_g']);
    same('the reading counts three', d.call('closeReminderReadCount', d.State.schedule, '2026-11-13', new Date().toISOString()), 3);
    const decision = refresh(d);
    same('and the line says three', [decision.show, decision.count, lineText(d)], [true, 3, 'יש 3 עובדים שהחשבון שלהם עוד לא נסגר']);

    // A man held: his earlier periods with work left open (D5). The dialog shows him as «לא ייסגר»; the line does not count him.
    const h = three({ inOrder: false });
    const read = h.call('weeklyCloseRead', h.State.schedule, '2026-11-13', new Date().toISOString());
    const held = read.men.filter(man => man.held).map(man => man.id);
    given('the record out of order has men the dialog holds', held.length > 0 && read.men.length === 3, j(read.men.map(man => [man.id, man.held])));
    same('the count is exactly the men not held', refresh(h).count || 0, read.men.length - held.length);
    same('which is «סגירת שבוע»\'s own list, man for man', offered(h), read.men.filter(man => !man.held).map(man => man.id));

    // A man closed: off the count.
    const c = three();
    c.State.commitMany(byHand(c, 'w_w', '2026-11-06', '2026-11-12', 0, '2026-11-13T08:00:00.000Z'));
    same('his week closed: two', [offered(c), refresh(c).count], [['w_f', 'w_g'], 2]);
    c.State.commitMany(byHand(c, 'w_f', '2026-10-30', '2026-11-12', undefined, '2026-11-13T08:01:00.000Z'));
    same('one more closed: one, in the singular', [refresh(c).count, lineText(c)], [1, 'יש עובד אחד שהחשבון שלו עוד לא נסגר']);
    c.State.commitMany(byHand(c, 'w_g', '2026-10-30', '2026-11-12', undefined, '2026-11-13T08:02:00.000Z'));
    same('all closed: no line', [refresh(c).show, lineShown(c), offered(c)], [false, false, []]);

    // A man who did not work in his last finished period is not on the list, and not counted.
    const a = phone();
    a.State.schedule.workers = [{ id: 'w_a', name: 'אמיר', active: true, dailyRate: 400, hourlyRate: 0 },
        { id: 'w_b', name: 'באסל', active: true, dailyRate: 400, hourlyRate: 0 }];
    a.State.schedule.places = PLACES;
    weekdays('2026-10-30', '2026-11-12').forEach(date => day(a, 'w_a', date));
    advance(a, 'w_b', '2026-11-02', 300);
    approve(a); kept(a);
    same('the man with no day of work is not counted', [offered(a), refresh(a).count], [['w_a'], 1]);

    // The gates: a record whose carry is shut, a build whose writer is shut.
    const s = three({ flags: SHUT });
    same('carry and writer shut: the dialog has no list, and there is no line', [offered(s), refresh(s).show, lineShown(s)], [[], false, false]);
    const w = three({ flags: NOWRITE });
    same('the writer shut: no line either', [refresh(w).show, lineShown(w)], [false, false]);
    // An unapproved record: the dialog reads gate false.
    const u = phone();
    u.State.schedule.workers = [{ id: 'w_u', name: 'עומר', active: true, dailyRate: 400, hourlyRate: 0 }];
    u.State.schedule.places = PLACES;
    weekdays('2026-08-07', '2026-11-12').forEach(date => day(u, 'w_u', date));
    // An advance the old arithmetic and the carry read differently: the migration is needed
    // (tests/weeklyclose.test.mjs, W8).
    u.call('addAdvance', u.State.schedule, 'w_u', '2026-10-19', 9000, '');
    kept(u);
    const unapproved = phone({ storage: u.dump() });
    const gate = unapproved.call('weeklyCloseRead', unapproved.State.schedule, '2026-11-13', new Date().toISOString()).gate;
    same('a record with a legacy advance nobody approved: the dialog\'s gate is shut, and there is no line', [gate, refresh(unapproved).show, lineShown(unapproved)], [false, false, false]);
});

// ================================================================== R2 which days
await block('R2 which days: from Thursday once today is written, and every day after until closed', async () => {
    // Every account up to Thursday 2026-11-12 closed; the week of 2026-11-13..19 walked day by day.
    const d = three();
    const at = n => `2026-11-13T0${n}:00:00.000Z`;
    d.State.commitMany(byHand(d, 'w_w', '2026-11-06', '2026-11-12', undefined, at(8)));
    d.State.commitMany(byHand(d, 'w_f', '2026-10-30', '2026-11-12', undefined, at(8)));
    d.State.commitMany(byHand(d, 'w_g', '2026-10-30', '2026-11-12', undefined, at(8)));
    advance(d, 'w_w', '2026-11-16', 300);
    kept(d);
    const seen = [];
    for (const date of ['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18']) {
        d.setToday(date);
        if (dow(date) !== 6) {
            d.State.commitMany(['w_f', 'w_w', 'w_g'].map(id => d.call('assignPlace', d.State.schedule, date, id, 'actual', 'p_01')));
        }
        const decision = refresh(d, 'return');
        seen.push([date, decision.show, decision.count]);
    }
    same('Friday to Wednesday, last week closed: no line on any day', seen, [
        ['2026-11-13', false, 0], ['2026-11-14', false, 0], ['2026-11-15', false, 0],
        ['2026-11-16', false, 0], ['2026-11-17', false, 0], ['2026-11-18', false, 0]]);

    // Thursday: the weekly man's week ends today.
    d.setToday('2026-11-19');
    const morning = refresh(d, 'return');
    const heldWhy = d.call('weeklyCloseRead', d.State.schedule, '2026-11-19', new Date().toISOString()).men
        .filter(man => man.id === 'w_w').map(man => man.held)[0];
    same('Thursday before today is written: the dialog holds him («נגמרת היום»), and there is no line',
        [morning.show, heldWhy], [false, { kind: 'endsToday' }]);
    d.State.commitMany(['w_f', 'w_w', 'w_g'].map(id => d.call('assignPlace', d.State.schedule, '2026-11-19', id, 'actual', 'p_01')));
    const evening = refresh(d, 'return');
    same('Thursday once today is written: one man - the weekly one; the fortnightly men\'s fortnight ends next Thursday',
        [evening.show, evening.count, lineText(d), offered(d)], [true, 1, 'יש עובד אחד שהחשבון שלו עוד לא נסגר', ['w_w']]);

    // Not closed: every day after, a forgotten close.
    const after = [];
    for (const date of ['2026-11-20', '2026-11-22', '2026-11-24', '2026-11-25']) {
        d.setToday(date);
        if (dow(date) !== 6) d.State.commitMany(['w_f', 'w_w', 'w_g'].map(id => d.call('assignPlace', d.State.schedule, date, id, 'actual', 'p_01')));
        const decision = refresh(d, 'return');
        after.push([date, decision.show, decision.count]);
    }
    same('Friday to Wednesday after it, still open: the line every day, one man', after,
        [['2026-11-20', true, 1], ['2026-11-22', true, 1], ['2026-11-24', true, 1], ['2026-11-25', true, 1]]);

    // The next Thursday, recorded: the fortnight ends too - three, the forgotten week held behind the new one.
    d.setToday('2026-11-26');
    d.State.commitMany(['w_f', 'w_w', 'w_g'].map(id => d.call('assignPlace', d.State.schedule, '2026-11-26', id, 'actual', 'p_01')));
    const read = d.call('weeklyCloseRead', d.State.schedule, '2026-11-26', new Date().toISOString());
    same('the fortnight\'s own Thursday: the line counts what the dialog offers, both fortnightly men among them',
        [refresh(d, 'return').count, offered(d).filter(id => id !== 'w_w')], [read.men.filter(man => !man.held).length, ['w_f', 'w_g']]);

    // Closed: gone the same evening.
    d.setToday('2026-11-25');
    d.State.commitMany(byHand(d, 'w_w', '2026-11-13', '2026-11-19', undefined, '2026-11-25T18:00:00.000Z'));
    same('his week closed on Wednesday: no line', [refresh(d, 'return').show, lineShown(d)], [false, false]);
});

// ================================================================== R3 the line
await block('R3 the line: its words, its button, its ✕, and when it is not put up', async () => {
    const d = three();
    refresh(d);
    given('the line is up', lineShown(d));
    const parts = banner(d).children;
    same('a sentence, a button and a ✕, in that order', parts.map(node => [node.tagName, node.id]),
        [['SPAN', 'closeReminderLine'], ['BUTTON', 'closeReminderOpen'], ['BUTTON', 'closeReminderDismiss']]);
    same('the button\'s words', parts[1].textContent, 'לסגירת שבוע');
    same('the ✕ and its name', [parts[2].textContent, parts[2].getAttribute('aria-label')], ['✕', 'הסתר עד מחר']);
    const disk = diskBut(d);
    press(parts[1]);
    same('the button opens «סגירת שבוע» - its own opener, once', d.global('__opened'), 1);
    same('and writes nothing', diskBut(d), disk);
    const shown = banner(d).children;
    refresh(d);
    check('the same count drawn again does not build the line again (nothing under a finger is replaced)',
        banner(d).children[1] === shown[1]);

    // No crew: a first install says nothing.
    const empty = phone();
    same('no crew: no line, and nothing read', [refresh(empty).show, lineShown(empty), reads(empty)], [false, false, 0]);

    // Somebody typing, or a dialog open: it waits, and comes when that ends.
    const t = three();
    t.run('var __busy = true; midEdit = function () { return __busy; };');
    const waiting = refresh(t);
    same('while somebody is in the middle of something: not up, nothing read, waiting', [waiting.show, waiting.waiting, lineShown(t), reads(t)], [false, true, false, 0]);
    t.run('__busy = false;');
    await settleUntil(() => lineShown(t), 4000, 20);
    same('when that ends, it comes up by itself', [lineShown(t), lineText(t)], [true, 'יש 3 עובדים שהחשבון שלהם עוד לא נסגר']);

    // A reading that throws shows nothing and throws nothing.
    const x = three();
    x.run('weeklyCloseRead = function () { throw new Error("a reading that cannot be read"); };');
    let threw = null;
    let decision = null;
    try { decision = refresh(x); } catch (error) { threw = error; }
    same('a reading that throws: no line, no throw', [threw, decision && decision.show, lineShown(x)], [null, false, false]);
    // Nor does a draw or a boot that reaches it.
    threw = null;
    try { x.call('closeReminderAfterRender'); x.call('closeReminderBoot'); } catch (error) { threw = error; }
    same('and a draw or a boot that reaches it throws nothing', threw, null);
});

// ================================================================== R4 the ✕
await block('R4 the ✕: not again today, back tomorrow', async () => {
    const d = three();
    refresh(d);
    const before = diskBut(d, GONE_KEY);
    const readsBefore = reads(d);
    press(d.doc.getElementById('closeReminderDismiss'));
    same('pressed: the line is down and today is written down', [lineShown(d), d.raw(GONE_KEY)], [false, '2026-11-13']);
    same('and no other byte of the disk moved', diskBut(d, GONE_KEY), before);
    same('the rest of the day: no line, and nothing is read for it', [refresh(d).show, refresh(d, 'draw').show, lineShown(d), reads(d) - readsBefore], [false, false, false, 0]);
    d.call('closeReminderAfterRender');
    same('a draw takes nothing back up', lineShown(d), false);
    const reopened = phone({ storage: d.dump() });
    same('closed and opened the same day: still put away', [refresh(reopened).show, lineShown(reopened)], [false, false]);
    reopened.setToday('2026-11-14');
    same('the next day it is back', [refresh(reopened).show, lineText(reopened)], [true, 'יש 3 עובדים שהחשבון שלהם עוד לא נסגר']);

    const damaged = three();
    damaged.putRaw(GONE_KEY, '{"date":"2026-11-13"}');
    same('a note that is not a date is no note', refresh(damaged).show, true);
    damaged.putRaw(GONE_KEY, '2026-11-12');
    same('yesterday\'s note is no note', refresh(damaged).show, true);

    const full = three();
    refresh(full);
    full.setQuota(key => key === GONE_KEY);
    const record = full.raw('scheduleData:v2');
    let threw = null;
    try { full.call('closeReminderDismiss'); } catch (error) { threw = error; }
    same('a disk that refuses the note: no throw, nothing on the disk, the line down for this session',
        [threw, full.raw(GONE_KEY), lineShown(full), refresh(full).show], [null, null, false, false]);
    same('and the record was not touched to make room for it', full.raw('scheduleData:v2'), record);
});

// ================================================================== R5 the switch
await block('R5 the switch in ⋯: on by default, one byte when off', async () => {
    const d = three();
    const section = d.doc.getElementById('settingsDailySection');
    same('the row is in «כללי», after «תזכורות בטלפון» and before «תצוגה גדולה»', section.children.map(node => node.id),
        ['settingsFoldReminders', 'closeReminderCard', 'displayLargeCard', 'transportSwitchCard']);
    const card = d.doc.getElementById('closeReminderCard');
    same('a row like every other of the sheet: a shut <details> with a summary', [card.tagName, card.open, card.children[0].tagName,
        card.classList.contains('settings-fold')], ['DETAILS', false, 'SUMMARY', true]);
    same('its title and line', [card.children[0].children[1].children[0].textContent, card.children[0].children[1].children[1].textContent],
        ['תזכורת לסגירת חשבונות', 'שורה כשיש חשבונות שלא נסגרו']);
    same('its lead', d.doc.getElementById('closeReminderLead').textContent,
        'מיום חמישי, כשהשבוע נגמר, ועד שהחשבונות נסגרים, מופיעה למעלה שורה עם מספר העובדים שהחשבון שלהם עוד לא נסגר. ✕ מסתיר אותה עד מחר. פועל במכשיר הזה בלבד.');
    const toggle = d.doc.getElementById('closeReminderSwitch');
    same('on by default, with no key on the disk', [d.raw(OFF_KEY), d.call('closeReminderOff'), toggle.textContent,
        d.doc.getElementById('closeReminderState').textContent, toggle.getAttribute('aria-pressed')],
    [null, false, 'כיבוי התזכורת במכשיר הזה', 'מופעלת במכשיר הזה', 'true']);

    refresh(d);
    given('the line is up', lineShown(d));
    const before = diskBut(d, OFF_KEY);
    const readsBefore = reads(d);
    press(toggle);
    same('off: the one byte, the line down, the row says so', [d.raw(OFF_KEY), lineShown(d), toggle.textContent,
        d.doc.getElementById('closeReminderState').textContent, toggle.getAttribute('aria-pressed')],
    ['1', false, 'הפעלת התזכורת במכשיר הזה', 'כבויה במכשיר הזה', 'false']);
    same('off: nothing is read, by a start, a return or a draw', [refresh(d, 'boot').show, refresh(d, 'return').show, d.call('closeReminderBoot'),
        reads(d) - readsBefore], [false, false, 'none', 0]);
    same('off: no other byte of the disk moved', diskBut(d, OFF_KEY), before);
    same('closed and opened: still off', phone({ storage: d.dump() }).call('closeReminderOff'), true);
    press(toggle);
    same('on again: the key is GONE, and the line is back', [d.raw(OFF_KEY), lineShown(d), toggle.textContent], [null, true, 'כיבוי התזכורת במכשיר הזה']);
    same('on: still no other byte of the disk moved', diskBut(d, OFF_KEY), before);
    for (const value of ['0', 'true', 'off', '{}', '11', ' 1']) {
        d.putRaw(OFF_KEY, value);
        check(`'${value}' on the disk is ON - only exactly '1' is off`, d.call('closeReminderOff') === false);
    }
    // The switch has no reason to open its row by itself (js/ui/settings.js names none).
    check('the settings sheet names no reason to open this row by itself', !source('js/ui/settings.js').includes('closeReminderCard'));
});

// ================================================================== R6 only the phone
await block('R6 two keys and nothing else: not the record, the outbox, the fence, the cloud, a backup or the rescue file', async () => {
    const cloud = makeCloud();
    const d = three();
    d.Sync.connect(cloud.adapter);
    const synced = await settleUntil(() => d.Sync.status === 'synced' && d.Sync.pendingCount() === 0, 8000);
    given('the phone is connected and has sent its record', synced, d.Sync.status);
    const attempts = cloud.attempts.length;
    const docBytes = JSON.stringify(cloud.doc);
    const schedule = JSON.stringify(d.State.schedule);
    const record = d.raw('scheduleData:v2');
    const queued = JSON.stringify(d.Sync.pendingPaths());
    const fence = d.Store.fenceState();
    const disk = diskBut(d, OFF_KEY, GONE_KEY);

    refresh(d);
    press(d.doc.getElementById('closeReminderOpen'));
    press(d.doc.getElementById('closeReminderDismiss'));
    press(d.doc.getElementById('closeReminderSwitch'));
    press(d.doc.getElementById('closeReminderSwitch'));
    press(d.doc.getElementById('closeReminderSwitch'));
    d.setToday('2026-11-14');
    refresh(d, 'return');
    await settle(100);
    same('the two keys are the only bytes of the disk that moved', diskBut(d, OFF_KEY, GONE_KEY), disk);
    same('which hold what they say', [d.raw(OFF_KEY), d.raw(GONE_KEY)], ['1', '2026-11-13']);
    same('the schedule in memory is byte for byte what it was', JSON.stringify(d.State.schedule), schedule);
    same('so is the record on the disk', d.raw('scheduleData:v2'), record);
    same('nothing was queued for the cloud', JSON.stringify(d.Sync.pendingPaths()), queued);
    same('the write counter did not move', d.Store.fenceState(), fence);
    same('the cloud was not written to', [cloud.attempts.length, JSON.stringify(cloud.doc)], [attempts, docBytes]);
    same('the rescue file\'s own rule counts neither key as a record', [d.call('isFarkadSnapshotKey', OFF_KEY), d.call('isFarkadSnapshotKey', GONE_KEY)], [false, false]);

    d.ctx.document = d.harnessDoc;
    d.call('exportBackup');
    const backup = d.downloads[d.downloads.length - 1];
    given('the backup file was handed over', Boolean(backup && backup.text && /\.json$/.test(backup.name)), j(backup && backup.name));
    check('the backup carries neither key', !backup.text.includes('farkadCloseReminder'));
    d.call('exportRecoveryData');
    const rescue = d.downloads[d.downloads.length - 1];
    given('the rescue file was handed over', Boolean(rescue && rescue.text && rescue.text.includes('farkad-recovery')), j(rescue && rescue.name));
    check('nor does the rescue file', !rescue.text.includes('farkadCloseReminder'));
});

// ================================================================== R7 what it costs
await block('R7 what it costs: read after the paint, kept under the record, not after every tap', async () => {
    const d = three();
    refresh(d, 'boot');
    same('a start reads once', reads(d), 1);
    refresh(d, 'boot'); refresh(d, 'return'); refresh(d, 'draw');
    same('the record unmoved: nothing more is read, whatever asks', reads(d), 1);

    // Friday: no period of anybody's ends today. A write on the day screen is not read again.
    d.State.commit(d.call('assignPlace', d.State.schedule, '2026-11-13', 'w_f', 'actual', 'p_02'));
    refresh(d, 'draw');
    same('on the day screen, on a day that ends nobody\'s period, a write is not read again', [reads(d), lineText(d)], [1, 'יש 3 עובדים שהחשבון שלהם עוד לא נסגר']);
    refresh(d, 'return');
    same('a return to the app reads the moved record', reads(d), 2);

    // Another screen: «דוחות».
    d.run('currentView = "reports";');
    d.State.commit(d.call('assignPlace', d.State.schedule, '2026-11-13', 'w_f', 'actual', 'p_01'));
    refresh(d, 'draw');
    same('on «דוחות» a settled draw of a moved record reads again', reads(d), 3);
    d.State.commitMany(byHand(d, 'w_w', '2026-11-06', '2026-11-12', undefined, '2026-11-13T09:00:00.000Z'));
    refresh(d, 'draw');
    same('so a close made there is counted at once', [reads(d), lineText(d)], [4, 'יש 2 עובדים שהחשבון שלהם עוד לא נסגר']);

    // Thursday on the day screen: the one day a write to today moves the count.
    const t = three({ today: '2026-11-19', until: '2026-11-18' });
    t.State.commitMany(byHand(t, 'w_w', '2026-11-06', '2026-11-12', undefined, '2026-11-13T08:00:00.000Z'));
    t.State.commitMany(byHand(t, 'w_f', '2026-10-30', '2026-11-12', undefined, '2026-11-13T08:00:00.000Z'));
    t.State.commitMany(byHand(t, 'w_g', '2026-10-30', '2026-11-12', undefined, '2026-11-13T08:00:00.000Z'));
    kept(t);
    same('Thursday morning, today not written: no line', refresh(t, 'boot').show, false);
    t.State.commit(t.call('assignPlace', t.State.schedule, '2026-11-19', 'w_w', 'actual', 'p_01'));
    same('a period ends today, so the write on the day screen is read: the line comes up', [refresh(t, 'draw').show, lineText(t)],
        [true, 'יש עובד אחד שהחשבון שלו עוד לא נסגר']);

    // A new day is read even from the day screen.
    const n = three();
    refresh(n, 'boot');
    n.setToday('2026-11-14');
    n.State.commit(n.call('assignPlace', n.State.schedule, '2026-11-13', 'w_f', 'actual', 'p_02'));
    refresh(n, 'draw');
    same('a new calendar day is read, from any screen', reads(n), 2);

    // After a draw, nothing is read until the draws stop for the quiet time.
    const q = three({ view: 'reports' });
    q.call('closeReminderAfterRender');
    q.call('closeReminderAfterRender');
    same('nothing is read inside a draw', reads(q), 0);
    await settle(q.global('CLOSE_REMINDER_QUIET_MS') + 300);
    same('once the draws stop: one reading, and the line', [reads(q), lineShown(q)], [1, true]);

    // A season: fourteen men, half a year of days, each read once inside a bound.
    const s = phone({ today: '2026-11-13' });
    const workers = [];
    for (let i = 0; i < 14; i += 1) {
        workers.push(Object.assign({ id: `w_${String(i).padStart(2, '0')}`, name: `עובד ${i}`, active: true, dailyRate: 400 + i * 10, hourlyRate: 0 },
            i < 9 ? { payCycles: '2026-05-01=weekly' } : {}));
    }
    s.State.schedule.workers = workers;
    s.State.schedule.places = PLACES;
    for (let date = '2026-05-01'; date <= '2026-11-12'; date = addDays(date, 1)) {
        if (dow(date) === 6) continue;
        workers.forEach(worker => day(s, worker.id, date));
        if (dow(date) === 1) workers.forEach((worker, i) => { if (i % 2 === 0) advance(s, worker.id, date, 500); });
    }
    approve(s);
    s.call('weeklyCloseOnce', () => workers.forEach(worker => s.call('accountsBefore', s.State.schedule, worker.id, '2026-11-06')
        .forEach(period => byHand(s, worker.id, period.from, period.to, undefined, `${addDays(period.to, 1)}T16:00:00.000Z`))));
    kept(s);
    let started = Date.now();
    const count = refresh(s, 'boot').count;
    const firstMs = Date.now() - started;
    started = Date.now();
    refresh(s, 'draw');
    const keptMs = Date.now() - started;
    console.log(`        a season of fourteen men: first reading ${firstMs} ms, an unmoved record ${keptMs} ms`);
    same('fourteen men counted', count, 14);
    check('the reading inside 3 s (the dialog\'s own bound)', firstMs < 3000, `${firstMs} ms`);
    check('an unmoved record answered from what was kept, inside 100 ms', keptMs < 100 && reads(s) === 1, `${keptMs} ms, ${reads(s)} readings`);
});

// ================================================================== R8 the words
await block('R8 every word, and nothing the file may not do', async () => {
    const d = phone();
    const T = d.global('CLOSE_REMINDER_TEXT');
    same('the block holds exactly these words', Object.keys(T).sort(),
        ['dismiss', 'lead', 'line', 'open', 'stateOff', 'stateOn', 'sub', 'switchOff', 'switchOn', 'title'].sort());
    same('the line, for one man', T.line(1), 'יש עובד אחד שהחשבון שלו עוד לא נסגר');
    same('the line, for two', T.line(2), 'יש 2 עובדים שהחשבון שלהם עוד לא נסגר');
    same('the line, for four - the owner\'s own sentence', T.line(4), 'יש 4 עובדים שהחשבון שלהם עוד לא נסגר');
    same('its button', T.open, 'לסגירת שבוע');
    same('its ✕', T.dismiss, 'הסתר עד מחר');
    same('the row\'s title', T.title, 'תזכורת לסגירת חשבונות');
    same('under it', T.sub, 'שורה כשיש חשבונות שלא נסגרו');
    same('the lead', T.lead, 'מיום חמישי, כשהשבוע נגמר, ועד שהחשבונות נסגרים, מופיעה למעלה שורה עם מספר העובדים שהחשבון שלהם עוד לא נסגר. ✕ מסתיר אותה עד מחר. פועל במכשיר הזה בלבד.');
    same('on', T.stateOn, 'מופעלת במכשיר הזה');
    same('off', T.stateOff, 'כבויה במכשיר הזה');
    same('the switch, to turn it on', T.switchOn, 'הפעלת התזכורת במכשיר הזה');
    same('the switch, to turn it off', T.switchOff, 'כיבוי התזכורת במכשיר הזה');
    same('the button is the dialog\'s own name, after «ל»', T.open.slice(1), d.global('WEEKLY_CLOSE_TEXT').entry);
    check('the block is frozen', d.call('eval', 'Object.isFrozen(CLOSE_REMINDER_TEXT)') === true);
    same('the two keys', [d.global('CLOSE_REMINDER_OFF_KEY'), d.global('CLOSE_REMINDER_DISMISSED_KEY')], [OFF_KEY, GONE_KEY]);

    const code = REMINDER.replace(/\/\/.*$/gm, '');
    check('no browser dialog (law 11)', !/\b(alert|confirm|prompt)\s*\(/.test(code));
    check('no markup from a string', !/innerHTML|insertAdjacentHTML|outerHTML/.test(code));
    check('no writer of the record, the ledger or the cloud', !/State\.(commit|commitMany|save|persist)\b|FarkadSync\.|saveFinancialAction|closePeriodChanges|appendLedgerEntry|weeklyCloseWrite/.test(code));
    check('the disk only through Store', !/localStorage|sessionStorage|indexedDB/.test(code));
    same('it writes two keys, optional, and removes one', [(code.match(/Store\.set(Verified)?\(/g) || []).length,
        /Store\.set\(CLOSE_REMINDER_DISMISSED_KEY, today, \{ optional: true \}\)/.test(code),
        /Store\.setVerified\(CLOSE_REMINDER_OFF_KEY, '1', \{ optional: true \}\)/.test(code),
        (code.match(/Store\.remove\(/g) || []).length], [2, true, true, 1]);
    // In the page: loaded after the files it asks, before app.js, and in the shell.
    const page = source('index.html');
    const scripts = [...page.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    const at = name => scripts.indexOf(name);
    check('index.html loads it after weeklyclose.js, owes.js, offline.js, display.js and whatsnew.js, and before app.js',
        at('js/ui/closereminder.js') > Math.max(at('js/ui/weeklyclose.js'), at('js/ui/owes.js'), at('js/ui/offline.js'),
            at('js/ui/display.js'), at('js/ui/whatsnew.js')) && at('js/ui/closereminder.js') < at('js/app.js'), j(scripts.slice(-8)));
    check('the banner is in the page, shut, before «מה חדש»\'s', /id="closeReminderBanner"[^>]*style="display:none"/.test(page)
        && page.indexOf('id="closeReminderBanner"') < page.indexOf('id="whatsNewBanner"'));
    check('and the service worker\'s shell has it', source('sw.js').includes("'./js/ui/closereminder.js'"));
    const app = source('js/app.js');
    check('app.js asks it after every draw and at boot, through typeof',
        app.includes("if (typeof closeReminderAfterRender === 'function') closeReminderAfterRender();")
        && app.includes("if (typeof closeReminderBoot === 'function') closeReminderBoot();"));
});

report();
