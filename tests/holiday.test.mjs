// «הכל חופש», made safe (the owner, 2026-11-11), on devices in Node.
//
//   node tests/holiday.test.mjs
//
// His words: "the place of «כולם בחופש» is dangerous, it can be pressed by mistake; and if
// possible, after I press it, let it ask me whether I am sure that all of them are on
// holiday." The place - the foot of the day - and everything about the glass (the rectangles,
// the dialog, a real double tap, ↶ pressed with a finger) are in tests/holiday.browser.mjs.
// What is held here is what the record sees:
//
//   - every word, pinned: the question's, the button's, ↶'s - PROPOSED, the owner corrects;
//     the button's words, its accessible name and the two sentences v116 wrote are v116's;
//   - the question it asks: the day (weekday and date), how many, and every man it will
//     mark BY NAME, in the roster's order - never a man with work, an absence, a closed
//     account, or no longer active - with the confirming button the destructive kind, held
//     for DOUBLE_TAP_GUARD_MS, and told where the finger was;
//   - nobody to mark: v116's sentence, and nothing written;
//   - confirmed, the record is v190's to the byte: the days, the queue (path and value, in
//     order) and the disk, against v190's own js/ui/day.js out of Git on the same crew;
//   - ↶ takes the whole holiday back: every man's own day as it was before it - a day
//     that existed, byte for byte; a man who had none, the empty placeholder every ↶ in this
//     app writes for "no record" (a worker's day is never deleted, js/model/schema.js) -
//     and the day reads exactly as it read before: the same men unrecorded, the same pay;
//   - ↶ never takes back what came after: a man another phone has since put on a site keeps
//     his day, and an account closed since is not reopened;
//   - a man the question did not name is never marked, the date is the one it named, and
//     work arriving while it was asked is never replaced (v116's guarantee, kept);
//   - a cancelled question and a refused write offer no ↶ for a holiday that did not happen;
//   - ROUND TWO (the verifier of 9281f87): the button is drawn on no screen - the foot of the
//     day ends with «עוד ⋯», which opens the day's menu, the one way to the question: the menu
//     names the day, holds for DOUBLE_TAP_GUARD_MS, keeps «הכל חופש» a finger's width from
//     «סגור» and from the finger, and goes STRAIGHT ON to the question in the same turn, about
//     the day it named - and (v194, on v192) about that day still when the screen has left it.
//
// Synthetic names only; no real record is read.

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDevice } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = file => readFileSync(join(ROOT, file), 'utf8');
const DAY_JS = source('js/ui/day.js');
const UNDO_JS = source('js/ui/undo.js');

// v190, as it is on the phones: origin/main c33461b, served 2026-11-11 19:38 UTC. Read out of
// Git with the GIT_* environment taken away (tests/treecheck.mjs says why).
const V190 = 'c33461b';
const GIT_ENV = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^GIT_/i.test(name)));
let V190_DAY = '';
try {
    V190_DAY = execFileSync('git', ['-C', ROOT, 'show', `${V190}:js/ui/day.js`],
        { encoding: 'utf8', env: GIT_ENV, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
} catch (error) { V190_DAY = ''; }

const DATE = '2026-11-11';          // a Wednesday
const DAY_NAME = 'יום רביעי';
const SHOWN = '11/11/2026';
const OTHER = '2026-11-12';
const FSI = '⁨';
const PDI = '⁩';

// THE PINNED WORDS. Hebrew strings are product decisions (CLAUDE.md, law 6). PROPOSED on
// 2026-11-11; the owner corrects, and a correction moves the line here in the same commit.
const TITLE = `בטוח שכולם בחופש?\n${DAY_NAME} ${SHOWN}`;
const MESSAGE_ONE = 'לעובד אחד בלי רישום יירשם יום חופש ללא שכר:';
const MESSAGE = count => `ל-${count} העובדים בלי רישום יירשם יום חופש ללא שכר:`;
const OK = 'כן, כולם בחופש';
const UNDO_ONE = 'חופש נרשם לעובד אחד';
const UNDO = count => `חופש נרשם ל-${count} עובדים`;
// Round two (the verifier of 9281f87): the button is on no screen; «עוד ⋯» at the foot of the
// day opens the day's menu. Its words and the menu's close are the crew screen's own
// (js/ui/roster.js); its accessible name is the crew's «אפשרויות עבור …» said of the day -
// PROPOSED; the menu's title is the day, as the question's second line says it.
const MORE = 'עוד ⋯';
const MORE_LABEL = `אפשרויות עבור ${DAY_NAME} ${SHOWN}`;
const MENU_TITLE = `${DAY_NAME} ${SHOWN}`;
const CLOSE = 'סגור';
// v116's, unchanged.
const ENTRY = 'הכל חופש';
const ENTRY_LABEL = 'רשום חופש לעובדים בלי רישום ביום הנבחר';
const NOBODY = 'לכל העובדים כבר יש רישום ביום הזה. שום רישום לא שונה.';
const KEPT = 'עבודה, היעדרויות וחשבונות סגורים יישמרו.';

// The crew, each man the shape of one case, on DATE:
//   w_01 אחמד      at הרצליה                         - not marked
//   w_02 מוחמד     nothing                           - marked
//   w_03 יוסי      נעדר already                      - not marked
//   w_04 סמיר      put on a site and taken off again - the empty record with its rate
//                  stamp, {entries: [], rates}       - marked, and given that record back
//   w_05 עלי       nothing                           - marked
//   w_06 ח'אלד     no longer active                  - not marked
//   w_07 כרם       his account for the fortnight closed - not marked
//   w_08 נאסר      a planned site only (the other layer) - marked: the holiday reads the
//                  record of what happened, as v116's did
const CREW = [
    { id: 'w_01', name: 'אחמד', active: true, dailyRate: 400 },
    { id: 'w_02', name: 'מוחמד עבד אל רחמן', active: true, dailyRate: 420 },
    { id: 'w_03', name: 'יוסי', active: true, dailyRate: 400 },
    { id: 'w_04', name: 'סמיר', active: true, dailyRate: 450 },
    { id: 'w_05', name: 'עלי', active: true, dailyRate: 400 },
    { id: 'w_06', name: 'ח\'אלד', active: false, dailyRate: 400 },
    { id: 'w_07', name: 'כרם', active: true, dailyRate: 430 },
    { id: 'w_08', name: 'נאסר', active: true, dailyRate: 410 }
];
const PLACES = [{ id: 'p_01', name: 'הרצליה', active: true }, { id: 'p_02', name: 'חיפה', active: true }];
const NAMED = ['w_02', 'w_04', 'w_05', 'w_08'];

// A phone with the day screen's file in it - this tree's, or the one given (v190's) - and
// js/ui/undo.js before it, as index.html loads them.
function phone(id, dayCode = DAY_JS, label = 'js/ui/day.js') {
    const device = makeDevice({ deviceId: id });
    vm.runInContext(UNDO_JS, device.ctx, { filename: 'js/ui/undo.js' });
    vm.runInContext(dayCode, device.ctx, { filename: label });
    device.setToday(DATE);
    device.State.date = DATE;
    device.ctx.askTell = () => Promise.resolve(true);
    device.ctx.askConfirm = () => Promise.resolve(true);
    return device;
}

function seed(device) {
    const { State } = device;
    State.schedule.workers = CREW.map(worker => ({ ...worker }));
    State.schedule.places = PLACES.map(place => ({ ...place }));
    given('the crew is saved', State.commitRoster() === true);
    const commit = change => given(`seeded: ${change && change.path}`, State.commit(change) === true);
    commit(device.call('assignPlace', State.schedule, DATE, 'w_01', 'actual', 'p_01'));
    commit(device.call('markAbsent', State.schedule, DATE, 'w_03', 'actual'));
    commit(device.call('assignPlace', State.schedule, DATE, 'w_04', 'actual', 'p_02'));
    commit(device.call('unassignPlace', State.schedule, DATE, 'w_04', 'actual', 'p_02'));
    commit(device.call('assignPlace', State.schedule, DATE, 'w_08', 'plan', 'p_01'));
    // כרם worked earlier in the fortnight, and the fortnight is closed.
    commit(device.call('assignPlace', State.schedule, '2026-11-02', 'w_07', 'actual', 'p_01'));
    const range = device.call('periodRangeFor', State.worker('w_07'), DATE);
    const closing = device.call('closePeriodChanges', State.schedule, 'w_07', range.from, range.to,
        '2026-11-13T12:00:00Z', device.id);
    given('כרם\'s fortnight can be closed', closing.length > 0, JSON.stringify(range));
    given('and is', State.commitMany(closing) === true);
    given('and it covers the day', device.call('vehicleDateClosed', State.schedule, 'w_07', DATE) === true);
    device.call('hideUndo');
    return device;
}

const record = (device, id, date = DATE) => {
    const day = device.call('workerDay', device.State.schedule, date, id, 'actual');
    return day === null || day === undefined ? null : JSON.stringify(day);
};
const records = device => Object.fromEntries(CREW.map(worker => [worker.id, record(device, worker.id)]));
// The queue, operation by operation in the order they were queued (`_outbox` is only the
// latest operation per path): what a press queued is every operation after the last one
// standing before it.
const operations = device => device.Sync.physicalOperations().slice().sort((a, b) => a.seq - b.seq);
const lastSeq = device => operations(device).reduce((most, op) => Math.max(most, op.seq), 0);
const queuedSince = (device, seq) => operations(device).filter(op => op.seq > seq)
    .map(op => [op.path, JSON.stringify(op.value)]);
// Source with its comments taken out: a name in a sentence about it is not a use of it.
const code = text => text.replace(/<!--[^]*?-->/g, '').replace(/\/\*[^]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const diskDays = device => JSON.stringify(JSON.parse(device.dump()['scheduleData:v2']).days);
const unrecorded = device => device.State.unrecorded().map(worker => worker.id);
const undoLabel = device => device.global('undoLabel');
const armed = device => typeof device.global('undoAction') === 'function';
const payroll = device => JSON.stringify(device.call('payrollReport', device.State.schedule, '2026-10-30', '2026-11-12')
    .map(row => [row.workerId, row.days, row.absences, row.amount]));

// What the question was asked with, and how many times.
function asked(device, answer = true) {
    const seen = [];
    device.ctx.askConfirm = options => { seen.push(options); return Promise.resolve(answer); };
    return seen;
}

// ================================================================== the words
suite('every word, word for word');
{
    const device = phone('d_words');
    const text = device.global('HOLIDAY_TEXT');
    same('the question\'s title: the question, then the day on a line of its own',
        text.title(DAY_NAME, SHOWN), TITLE);
    same('how many, and that it is a day off without pay - for one man', text.message(1), MESSAGE_ONE);
    same('and for twelve', text.message(12), MESSAGE(12));
    same('the confirming button answers the question in his words', text.ok, OK);
    same('↶ says what it takes back - one man', text.undo(1), UNDO_ONE);
    same('and twelve', text.undo(12), UNDO(12));
    same('the button\'s words, its accessible name, and v116\'s two sentences, unchanged',
        [text.entry, text.entryLabel, text.nobody, text.kept], [ENTRY, ENTRY_LABEL, NOBODY, KEPT]);
    same('the foot\'s door: «עוד ⋯», named for the day, and its menu titled with the day and shut by «סגור»',
        [text.more, text.moreLabel(DAY_NAME, SHOWN), text.menuTitle(DAY_NAME, SHOWN), text.close],
        [MORE, MORE_LABEL, MENU_TITLE, CLOSE]);
    const roster = source('js/ui/roster.js');
    check('«עוד ⋯», «סגור» and «אפשרויות עבור» are the crew screen\'s own words, not new ones',
        roster.indexOf(`'${MORE}'`) !== -1 && roster.indexOf(`'${CLOSE}'`) !== -1 && roster.indexOf('`אפשרויות עבור ${') !== -1);
    same('nothing else in the block', Object.keys(text).sort(),
        ['close', 'entry', 'entryLabel', 'kept', 'menuTitle', 'message', 'more', 'moreLabel', 'nobody', 'ok', 'title', 'undo']);
    // No Hebrew in the holiday's code outside that block (comments aside): a word written
    // anywhere else is a word nobody pinned.
    const start = DAY_JS.indexOf('function dayMoreEntry(');
    const end = DAY_JS.indexOf('\n}\n', DAY_JS.indexOf('async function markAllHoliday(')) + 3;
    given('the holiday\'s code is found', start > 0 && end > start);
    const code = DAY_JS.slice(start, end).replace(/\/\/[^\n]*/g, '');
    same('and the holiday\'s code says nothing in Hebrew of its own', code.match(/[֐-׿]+/g), null);
    check('v190 said it otherwise: its title, message and button are gone',
        DAY_JS.indexOf('לרשום חופש ל-') === -1 && DAY_JS.indexOf(`ok: 'רשום חופש'`) === -1
        && V190_DAY.indexOf('לרשום חופש ל-') !== -1);
}

// ================================================================== the question
suite('the question: which day, how many, every man by name');
{
    const device = seed(phone('d_question'));
    const seen = asked(device, false);
    same('cancelled, it answers false', await device.call('markAllHoliday'), false);
    same('asked once', seen.length, 1);
    const options = seen[0];
    same('the title asks his question and names the day', options.title, TITLE);
    same('the message says how many and that it is unpaid', options.message, MESSAGE(4));
    same('every man it would mark, by name, in the roster\'s order - and nobody else',
        options.names, NAMED.map(id => CREW.find(worker => worker.id === id).name));
    same('what is kept, under the answers', options.footer, KEPT);
    same('the confirming button carries his answer', options.ok, OK);
    same('and is the destructive kind', options.danger, true);
    same('held for the day\'s double-tap guard', [options.hold, device.global('DOUBLE_TAP_GUARD_MS')], [700, 700]);
    same('with no page, there is no finger to keep it from', options.from, null);
    same('the cancel is the app\'s own', options.cancel, undefined);
    same('cancelled, nothing is written', records(device), records(seed(phone('d_question_control'))));
    check('and no ↶ is offered for it', !armed(device));

    const tapped = seed(phone('d_question_tap'));
    const tapSeen = asked(tapped, false);
    await tapped.call('markAllHoliday', { clientX: 64, clientY: 430, detail: 1 });
    same('a tap: the question is told where the finger was', tapSeen[0].from, { x: 64, y: 430 });
    await tapped.call('markAllHoliday', { clientX: 0, clientY: 0, detail: 0 });
    same('a key (no point, detail 0): no point is made up', tapSeen[1].from, null);

    const one = phone('d_question_one');
    one.State.schedule.workers = [{ id: 'w_01', name: 'אחמד', active: true }, { id: 'w_02', name: 'יוסי', active: true }];
    one.State.schedule.places = PLACES.map(place => ({ ...place }));
    one.State.commitRoster();
    one.State.commit(one.call('assignPlace', one.State.schedule, DATE, 'w_01', 'actual', 'p_01'));
    const oneSeen = asked(one, true);
    same('one man: confirmed', await one.call('markAllHoliday'), true);
    same('one man: named, in the singular', [oneSeen[0].names, oneSeen[0].message], [['יוסי'], MESSAGE_ONE]);
    same('and ↶ says so in the singular', undoLabel(one), UNDO_ONE);
}

// ================================================================== the menu
// «עוד ⋯» (openDayMore): the only way to the question since round two. On a device the menu is
// askChoice, stood in for here so its options can be read and its answers given.
function menus(device) {
    const opened = [];
    device.ctx.askChoice = options => new Promise(resolve => { opened.push({ options, resolve }); });
    device.closed = 0;
    device.ctx.askClose = result => { device.closed += 1; const last = opened[opened.length - 1]; if (last) last.resolve(result); };
    return opened;
}

suite('«עוד ⋯»: the menu names the day, holds, and goes straight on to the question');
{
    const device = seed(phone('d_menu'));
    const opened = menus(device);
    const seen = asked(device, false);
    const shut = device.call('openDayMore');
    same('one menu', opened.length, 1);
    const options = opened[0].options;
    same('titled with the day it is about', options.title, MENU_TITLE);
    same('its answers: «הכל חופש», with v116\'s accessible name, then «סגור»',
        options.choices.map(choice => (typeof choice === 'string' ? choice : [choice.label, choice.aria])), [[ENTRY, ENTRY_LABEL], CLOSE]);
    same('a finger\'s width apart and held for the day\'s double-tap guard; with no page, no finger is made up',
        [options.apart, options.hold, options.from], [true, 700, null]);
    same('nothing asked yet', seen.length, 0);
    opened[0].resolve(CLOSE);
    same('«סגור»: it answers false', await shut, false);
    const control = seed(phone('d_menu_control'));
    same('and nothing was asked or written', [seen.length, records(device)], [0, records(control)]);
    check('and no ↶ is offered', !armed(device));

    const tapped = seed(phone('d_menu_tap'));
    const tapMenus = menus(tapped);
    tapped.call('openDayMore', { clientX: 70, clientY: 512, detail: 1 });
    same('a tap: the menu is told where the finger was', tapMenus[0].options.from, { x: 70, y: 512 });

    // «הכל חופש»: STRAIGHT ON, in the same turn - the menu is never shut first (the day follows
    // the calendar the moment nothing is open: watchDayRollover, js/app.js).
    const going = device.call('openDayMore');
    opened[1].options.choices[0].next({ x: 120, y: 96 });
    same('chosen, it asks the question at once, nothing awaited between', seen.length, 1);
    same('about the day the menu named', seen[0].title, TITLE);
    same('told where the finger was on the menu', seen[0].from, { x: 120, y: 96 });
    same('and the menu was not shut to do it', device.closed, 0);
    opened[1].resolve(null);                       // the question displaces it (askResetExtras)
    same('answered no: false, and nothing written', [await going, records(device)], [false, records(control)]);

    const yes = seed(phone('d_menu_yes'));
    const yesMenus = menus(yes);
    const yesSeen = asked(yes, true);
    const done = yes.call('openDayMore');
    yesMenus[0].options.choices[0].next({ x: 120, y: 96 });
    yesMenus[0].resolve(null);
    same('confirmed through the menu: true', await done, true);
    same('the men the question named are on holiday, and only they',
        CREW.map(worker => yes.call('isAbsent', yes.State.schedule, DATE, worker.id, 'actual')),
        CREW.map(worker => NAMED.includes(worker.id) || worker.id === 'w_03'));
    same('and ↶ says so', undoLabel(yes), UNDO(4));
    same('asked once', yesSeen.length, 1);

    // MOVED ON PURPOSE (v194, the port onto v192): round two shut a menu whose day the screen
    // had left and asked nothing. v192 made every surface that names a day write THAT day,
    // whatever the calendar did meanwhile (the day's writes, docs/releases.md) - so the menu's
    // question is about the day the menu named, and the holiday is written there and nowhere else.
    const moved = seed(phone('d_menu_moved'));
    const movedMenus = menus(moved);
    const movedSeen = asked(moved, true);
    const left = moved.call('openDayMore');
    moved.State.date = OTHER;
    movedMenus[0].options.choices[0].next({ x: 120, y: 96 });
    movedMenus[0].resolve(null);
    same('the screen on another day: the question is still about the day the menu named, asked once',
        [movedSeen.length, movedSeen[0] && movedSeen[0].title, await left], [1, TITLE, true]);
    same('the men it named are on holiday on THAT day',
        CREW.map(worker => moved.call('isAbsent', moved.State.schedule, DATE, worker.id, 'actual')),
        CREW.map(worker => NAMED.includes(worker.id) || worker.id === 'w_03'));
    same('and nothing was written on the day the screen moved to', JSON.stringify(moved.State.schedule.days[OTHER] || null),
        JSON.stringify(control.State.schedule.days[OTHER] || null));
    moved.State.date = DATE;
}

suite('nobody without a record: v116\'s sentence, and nothing written');
{
    const device = phone('d_nobody');
    device.State.schedule.workers = [{ id: 'w_01', name: 'אחמד', active: true }];
    device.State.schedule.places = PLACES.map(place => ({ ...place }));
    device.State.commitRoster();
    device.State.commit(device.call('assignPlace', device.State.schedule, DATE, 'w_01', 'actual', 'p_01'));
    device.call('hideUndo');
    const told = [];
    device.ctx.askTell = message => { told.push(message); return Promise.resolve(true); };
    const seen = asked(device);
    const before = JSON.stringify(device.dump());
    same('it answers false', await device.call('markAllHoliday'), false);
    same('it says so in v116\'s words, and asks nothing', [told, seen.length], [[NOBODY], 0]);
    same('the disk is byte for byte what it was', JSON.stringify(device.dump()), before);
    check('no ↶', !armed(device));
}

// ================================================================== the record
suite('confirmed, the record is v190\'s to the byte');
{
    given('v190\'s day screen is in this repository', V190_DAY.length > 0, V190);
    given('and it is not the file under test', V190_DAY !== DAY_JS);
    given('and it is the holiday this suite replaced', V190_DAY.indexOf('לרשום חופש ל-') !== -1
        && V190_DAY.indexOf('HOLIDAY_TEXT') === -1);
    const old = seed(phone('d_v190', V190_DAY, `${V190}:js/ui/day.js`));
    const now = seed(phone('d_now'));
    same('the two phones start from the same day', records(old), records(now));
    const since = [lastSeq(old), lastSeq(now)];
    same('v190 records the holiday', await old.call('markAllHoliday'), true);
    same('so does this build', await now.call('markAllHoliday'), true);
    same('every man\'s day is the same', records(now), records(old));
    same('the whole day is the same', JSON.stringify(now.State.schedule.days), JSON.stringify(old.State.schedule.days));
    const queuedOld = queuedSince(old, since[0]);
    given('v190 queued one operation per man it marked', queuedOld.length === NAMED.length, JSON.stringify(queuedOld));
    same('the same paths queued with the same values, in the same order', queuedSince(now, since[1]), queuedOld);
    same('and the disk holds the same days', diskDays(now), diskDays(old));
    same('the men marked are exactly the men the question named', NAMED.map(id =>
        now.call('isAbsent', now.State.schedule, DATE, id, 'actual')), [true, true, true, true]);
    same('nobody else was touched', ['w_01', 'w_03', 'w_06', 'w_07'].map(id => record(now, id)),
        ['w_01', 'w_03', 'w_06', 'w_07'].map(id => record(seed(phone(`d_untouched_${id}`)), id)));
    same('סמיר\'s rate stamp went with his absence, as v190\'s did',
        JSON.parse(record(now, 'w_04')).rates, JSON.parse(record(old, 'w_04')).rates);
    same('and ↶ is offered, in its words', [armed(now), undoLabel(now)], [true, UNDO(4)]);
}

// ================================================================== ↶
suite('↶ takes the whole holiday back: every man\'s own day as it was');
{
    const device = seed(phone('d_undo'));
    const before = records(device);
    const reading = [unrecorded(device), payroll(device)];
    const queued = lastSeq(device);
    same('confirmed', await device.call('markAllHoliday'), true);
    device.call('runUndo');
    const after = records(device);
    same('a man whose day existed gets it back byte for byte - סמיר, rate stamp and all',
        after.w_04, before.w_04);
    same('a man who had no record gets the empty placeholder every ↶ in this app writes for "no record"',
        ['w_02', 'w_05', 'w_08'].map(id => [before[id], after[id]]),
        [[null, '{"entries":[]}'], [null, '{"entries":[]}'], [null, '{"entries":[]}']]);
    same('which js/model/schema.js calls an empty record', ['w_02', 'w_05', 'w_08'].map(id =>
        device.call('isEmptyWorkerRecord', device.call('workerDay', device.State.schedule, DATE, id, 'actual'))), [true, true, true]);
    same('everybody else is as they were', ['w_01', 'w_03', 'w_06', 'w_07'].map(id => after[id]),
        ['w_01', 'w_03', 'w_06', 'w_07'].map(id => before[id]));
    same('the day reads as it read before: the same men unrecorded, the same pay',
        [unrecorded(device), payroll(device)], reading);
    // The holiday's own operations are superseded by these and collected; what stands for
    // the cloud is each named man's day as ↶ put it back, and nobody else's.
    same('the queue holds, for each named man and nobody else, the day ↶ put back',
        queuedSince(device, queued), NAMED.map(id => [`days.${DATE}.actual.${id}`, after[id]]));
    same('the disk holds what memory holds', diskDays(device), JSON.stringify(device.State.schedule.days));
    check('and nothing is left to step back: the way back is spent, no step forward is offered (as for «🧹 רוקן אתר»)',
        !armed(device) && device.global('redoAction') === null);
}

suite('↶ never takes back what came after it');
{
    const device = seed(phone('d_undo_after'));
    same('confirmed', await device.call('markAllHoliday'), true);
    // What another phone's record does to this one's memory: עלי put on a site after all.
    const undo = device.global('undoAction');
    given('↶ is armed', typeof undo === 'function');
    given('עלי is put on a site', device.State.commit(device.call('assignPlace', device.State.schedule, DATE, 'w_05', 'actual', 'p_01')) === true);
    const worked = record(device, 'w_05');
    undo();
    same('עלי keeps the site he was put on', record(device, 'w_05'), worked);
    same('the others get their days back', ['w_02', 'w_04', 'w_08'].map(id => record(device, id)),
        ['{"entries":[]}', record(seed(phone('d_undo_after_control')), 'w_04'), '{"entries":[]}']);

    const closed = seed(phone('d_undo_closed'));
    same('confirmed', await closed.call('markAllHoliday'), true);
    const back = closed.global('undoAction');
    // מוחמד's fortnight closed after the holiday was recorded.
    const range = closed.call('periodRangeFor', closed.State.worker('w_02'), DATE);
    given('מוחמד\'s fortnight is closed', closed.State.commitMany(closed.call('closePeriodChanges', closed.State.schedule,
        'w_02', range.from, range.to, '2026-11-13T12:00:00Z', closed.id)) === true);
    back();
    same('a closed account is not reopened by ↶: מוחמד stays on holiday', closed.call('isAbsent', closed.State.schedule, DATE, 'w_02', 'actual'), true);
    same('the open ones go back', ['w_05', 'w_08'].map(id => record(closed, id)), ['{"entries":[]}', '{"entries":[]}']);
}

// ================================================================== while it is asked
suite('while the question is up: its day, its men, and nobody else');
{
    const device = seed(phone('d_race'));
    device.ctx.askConfirm = () => {
        // Another phone: עלי put on a site, אחמד's site taken off (so he has no record now),
        // and the screen moved to the next day - all while the question was on the glass.
        device.State.commit(device.call('assignPlace', device.State.schedule, DATE, 'w_05', 'actual', 'p_02'));
        device.State.commit(device.call('unassignPlace', device.State.schedule, DATE, 'w_01', 'actual', 'p_01'));
        device.State.date = OTHER;
        return Promise.resolve(true);
    };
    same('confirmed', await device.call('markAllHoliday'), true);
    same('the day it named is the day marked', ['w_02', 'w_04', 'w_08'].map(id =>
        device.call('isAbsent', device.State.schedule, DATE, id, 'actual')), [true, true, true]);
    same('work arriving while it was asked is never replaced', device.call('entriesFor', device.State.schedule, DATE, 'w_05', 'actual')
        .map(entry => entry.placeId), ['p_02']);
    same('a man the question did not name is never marked by it', device.call('isAbsent', device.State.schedule, DATE, 'w_01', 'actual'), false);
    same('the day the screen moved to is untouched', device.State.schedule.days[OTHER], undefined);
    // MOVED ON PURPOSE (v194, the port onto v192): round two offered ↶ here, over a day that was
    // no longer the one on the screen. v192's rule for every edit (editWithUndo, js/ui/undo.js): a
    // step back is offered over the day it restores into WHILE that day is on the screen; an edit
    // that landed on its surface's day after the screen moved on stood all the same, and no step
    // is offered for it, and none older is left armed over it.
    same('the screen had moved on: the holiday stood, and no ↶ is offered over a day that is not on the screen',
        [undoLabel(device), typeof device.global('undoAction') === 'function'], ['', false]);
}
{
    // On the day's own screen, the step counts the men it marked.
    const device = seed(phone('d_race_same_day'));
    device.ctx.askConfirm = () => {
        device.State.commit(device.call('assignPlace', device.State.schedule, DATE, 'w_05', 'actual', 'p_02'));
        device.State.commit(device.call('unassignPlace', device.State.schedule, DATE, 'w_01', 'actual', 'p_01'));
        return Promise.resolve(true);
    };
    same('confirmed, the screen still on its day', await device.call('markAllHoliday'), true);
    same('↶ counts the men it marked', undoLabel(device), UNDO(3));
}

suite('a write that did not stand offers no ↶ for a holiday that did not happen');
{
    const device = seed(phone('d_full'));
    // A step before it, armed: a man put on a site with ↶ - what the header's ↶ holds.
    device.call('editWithUndo', 'w_02', 'step before', () => device.call('assignPlace', device.State.schedule, DATE, 'w_02', 'actual', 'p_01'));
    given('the step before is armed', undoLabel(device) === 'step before' && armed(device));
    device.call('runUndo');
    device.call('editWithUndo', 'w_02', 'step before', () => device.call('assignPlace', device.State.schedule, DATE, 'w_02', 'actual', 'p_01'));
    device.call('runUndo');
    device.setQuota(() => true);
    same('a full disk: false', await device.call('markAllHoliday'), false);
    check('no ↶ names a holiday', undoLabel(device) !== UNDO(3) && undoLabel(device) !== UNDO(4));
    same('and nobody is on holiday', NAMED.map(id => device.call('isAbsent', device.State.schedule, DATE, id, 'actual')),
        [false, false, false, false]);
}

// ================================================================== where it is drawn
suite('on no screen: «עוד ⋯» ends the foot of the day, and the menu is the only way to it');
{
    // Round two (the verifier of 9281f87): a button at the end of the day stands wherever the
    // day's length puts it - on the dock's edge on some lengths of every phone as the day
    // opens, and sideways 15px from the last man. The button is drawn nowhere; the foot's
    // «עוד ⋯», which writes nothing, opens the menu that holds it (tests/holiday.browser.mjs
    // sweeps the place).
    // MOVED (v194, the port onto v192): the row is handed through v192's trayClock as it is appended.
    check('the foot row ends with «עוד ⋯»: after «חיפוש עובד» and «בדיקת היום», and the row is drawn whole',
        /const foot = typeof dayCheckEntry === 'function' \? dayCheckEntry\(\) : el\('div', 'daycheck-row'\);\s+if \(typeof findEntry === 'function'\) foot\.insertBefore\(findEntry\(\), foot\.firstChild\);\s+foot\.appendChild\(dayMoreEntry\(\)\);\s+foot\.classList\.add\('day-foot-more'\);\s+root\.appendChild\(trayClock\(foot\)\);/
            .test(DAY_JS));
    const day = code(DAY_JS);
    const modeSwitch = day.slice(day.indexOf('function appendModeSwitch('), day.indexOf('function openDayPicker('));
    check('the header\'s switch line draws no holiday', modeSwitch.length > 0 && !/holiday|dayMore/i.test(modeSwitch));
    const header = day.slice(day.indexOf('function renderDayHeader('), day.indexOf('function appendModeSwitch('));
    check('nor does any other part of the header', header.length > 0 && !/holiday|dayMore/i.test(header));
    const noSites = day.slice(day.indexOf('if (State.activePlaces().length === 0) {'), day.indexOf('const tools = root.querySelector(\'.day-tools\');'));
    check('with no site at all «עוד ⋯» is UNDER the setup card', noSites.indexOf('renderSetupCard(') !== -1
        && noSites.indexOf('dayMoreEntry()') > noSites.indexOf('renderSetupCard('));
    same('one door, drawn in those two places, by one function',
        [day.match(/[^ ]dayMoreEntry\(\)/g).length, day.match(/function dayMoreEntry\(\)/g).length], [2, 1]);
    same('no button is ever drawn with «הכל חופש» on it: the words are the menu\'s answer and nothing else\'s',
        [day.match(/button\(\s*HOLIDAY_TEXT\.entry/g), day.match(/HOLIDAY_TEXT\.entry\b/g).length], [null, 1]);
    same('the menu is opened by «עוד ⋯» alone', [day.match(/\bopenDayMore\b/g).length, // MOVED (v194): the door hands the menu the day it was drawn on (v192's rule for every surface that names a day).
        day.indexOf('button(HOLIDAY_TEXT.more, \'btn-secondary day-more-action\', event => openDayMore(event, drawnFor),') !== -1], [2, true]);
    same('and the question by the menu alone - markAllHoliday named once in the day\'s code outside its own definition',
        day.match(/\bmarkAllHoliday\b/g).length, 2);
    same('and its handler is reached from nowhere else in the app', ['index.html', 'js/app.js', 'js/ui/sheet.js', 'js/ui/daycheck.js',
        'js/ui/find.js', 'js/ui/journey.js', 'js/ui/usual.js', 'js/ui/settings.js', 'js/ui/ask.js'].filter(file =>
        code(source(file)).indexOf('markAllHoliday') !== -1 || code(source(file)).indexOf('openDayMore') !== -1), []);
    check('the dialog has its list, right under the question\'s sentence',
        /<p class="hint" id="askMessage"><\/p>\s+<!--[^]*?-->\s+<ul class="ask-list" id="askList" style="display:none"><\/ul>/.test(source('index.html')));
}

report();
