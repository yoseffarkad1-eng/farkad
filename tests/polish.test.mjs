// The polish pack, decided in Node: four small things on four screens, none of which
// touches a number, a data path or a file that leaves the phone.
//
//   node tests/polish.test.mjs
//
//   1. THE QUIET ZERO. On the advances page a man who owes nothing is drawn quieter than
//      one who owes. Which man that is, is a rule - and an account that has been settled
//      by MORE than was handed over also has nothing "left", and is the opposite of quiet.
//   2. AN EMPTY SCREEN says one sentence. The sentences are pinned here word for word
//      (CLAUDE.md, law 6): two are the app's own, reused; one is new and PROPOSED.
//   3. THE SITE'S LETTER in its colour block on the phone's week. The letter is read off
//      the name every time and nothing about a site's colour moves.
//   4. THE BACKUP ROW. How old the last backup FILE is was already known to this phone -
//      `scheduleData:lastBackup`, written by exportBackup when the browser takes the file -
//      and already said inside the row. What is new is one quiet line after fourteen days,
//      and the same age on the row itself while the row is shut. Neither writes anything.
//
// The glass - inks, contrast, rectangles, what is and is not drawn - is
// tests/polish.browser.mjs.

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { makeDevice } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const REPORTS = read('js/ui/reports.js');
const WEEK = read('js/ui/week.js');
const SITECOLOR = read('js/ui/sitecolor.js');
const BACKUP = read('js/ui/backup.js');
const ROSTER = read('js/ui/roster.js');
const INDEX = read('index.html');
// What a person can be shown: the source without its comment lines.
const spoken = text => text.split('\n').filter(line => line.trim().indexOf('//') !== 0).join('\n');

const TODAY = '2026-11-09';

// THE PINNED WORDS.
const NO_WORKERS = 'אין עובדים. הוסף עובד כדי להתחיל.';                   // the roster's own
const WEEK_NO_WORKERS = 'אין עובדים להצגה. הוסף עובד במסך עובדים ואתרים.';  // the week's own
const ADD_WORKER = '+ הוסף עובד';                                           // the roster's own button
const WEEK_BLANK = 'אין רישומים בשבוע הזה.';                                // PROPOSED
const BACKUP_REMINDER = 'שבועיים ויותר בלי קובץ גיבוי חדש מהמכשיר הזה.';    // PROPOSED

function phone() {
    const device = makeDevice();
    device.setToday(TODAY);
    vm.runInContext(SITECOLOR, device.ctx, { filename: 'harness:sitecolor' });
    vm.runInContext(REPORTS, device.ctx, { filename: 'harness:reports' });
    vm.runInContext(WEEK, device.ctx, { filename: 'harness:week' });
    return device;
}
const run = (device, code) => vm.runInContext(code, device.ctx, { filename: 'harness:polish' });

// ---------------------------------------------------------------- 1. the quiet zero
{
    suite('the advances page: who is drawn quieter');

    const device = phone();
    const quiet = summary => run(device, `advanceSettledQuiet(${JSON.stringify(summary)})`);

    same('a man with nothing handed to him', quiet({ given: 0, repaid: 0, deducted: 0, left: 0, overpaid: 0 }), true);
    same('a man who gave it all back', quiet({ given: 500, repaid: 500, deducted: 0, left: 0, overpaid: 0 }), true);
    same('a man who owes one agora is not quiet', quiet({ given: 500, repaid: 499.99, deducted: 0, left: 0.01, overpaid: 0 }), false);
    same('a man who owes is not quiet', quiet({ given: 500, repaid: 0, deducted: 0, left: 500, overpaid: 0 }), false);
    same('an over-settled account has nothing left and is NOT quiet: it asks to be looked at',
        quiet({ given: 500, repaid: 700, deducted: 0, left: 0, overpaid: 200 }), false);

    // And on a real record, through the page's own summary.
    run(device, `
        State.schedule.workers = [
            { id: 'w_01', name: 'דוד כהן', active: true, dailyRate: 400, hourlyRate: 50 },
            { id: 'w_02', name: 'עלי חסן', active: true, dailyRate: 400, hourlyRate: 50 }];
        addAdvance(State.schedule, 'w_02', '${TODAY}', 500, '');
    `);
    same('the record: the man with no advance is quiet',
        run(device, `advanceSettledQuiet(workerAdvanceSummary('w_01'))`), true);
    same('the record: the man holding 500 is not',
        run(device, `advanceSettledQuiet(workerAdvanceSummary('w_02'))`), false);
    same('and the figure itself is what it was', run(device, `workerAdvanceSummary('w_02').left`), 500);

    // The class is the whole of the change: the words on the row are built on the lines
    // they were always built on, with no branch on the quiet rule.
    const shown = spoken(REPORTS);
    check('the row still says «נשארו» after the figure, for everybody',
        shown.includes("`${moneyText(summary.left)} ₪ נשארו`"));
    check('and an account in question still says «דורש בדיקה»', shown.includes("'דורש בדיקה'"));
    check('the man\'s own page still says «נשאר להחזיר»', shown.includes("'נשאר להחזיר'"));
    check('nobody is filtered off the list by a balance',
        !/filter\([^)]*summary/.test(shown) && !/filter\([^)]*advanceSettledQuiet/.test(shown));
}

// ---------------------------------------------------------------- 2. empty screens
{
    suite('an empty screen: one sentence, pinned word for word');

    check('the advances screen says the roster\'s own sentence',
        spoken(REPORTS).includes(`'${NO_WORKERS}'`), NO_WORKERS);
    check('which is still the roster\'s, unchanged', spoken(ROSTER).includes(`'${NO_WORKERS}'`));
    check('the week still says its own', spoken(WEEK).includes(`'${WEEK_NO_WORKERS}'`));
    check('the button is the roster\'s own «+ הוסף עובד», letter for letter',
        spoken(REPORTS).includes(`'${ADD_WORKER}'`) && spoken(WEEK).includes(`'${ADD_WORKER}'`)
        && INDEX.includes(`onclick="showAddWorkerModal()">${ADD_WORKER}</button>`));
    check('a week nobody is on says the proposed sentence',
        spoken(WEEK).includes(`'${WEEK_BLANK}'`), WEEK_BLANK);
    check('the reports\' empty RANGE keeps the sentence it had',
        (spoken(REPORTS).match(/'אין רישומים בטווח הזה\.'/g) || []).length === 3);

    suite('a week nobody is on: the rule');
    const device = phone();
    run(device, `
        State.schedule.workers = [
            { id: 'w_01', name: 'דוד כהן', active: true, dailyRate: 400, hourlyRate: 50 },
            { id: 'w_02', name: 'עלי חסן', active: true, dailyRate: 400, hourlyRate: 50 }];
        State.schedule.places = [{ id: 'p_01', name: 'רמת גן', active: true }];
        State.date = '${TODAY}';
        setWeekFromDate('${TODAY}');
    `);
    const blank = () => run(device, 'weekIsBlank()');
    same('no day and no absence: blank', blank(), true);
    // The app's week runs Friday to Thursday, and the grid does not draw its Saturday.
    given('the second day of the week is the Saturday the grid leaves out',
        run(device, `parseLocalDate(weekDates()[1]).getDay()`) === 6);
    run(device, `markAbsent(State.schedule, weekDates()[2], 'w_01', 'actual')`);
    same('one absence is a record: not blank', blank(), false);
    run(device, `
        delete State.schedule.days[weekDates()[2]];
        assignPlace(State.schedule, weekDates()[3], 'w_02', 'actual', 'p_01');`);
    same('one day worked: not blank', blank(), false);
    run(device, `
        delete State.schedule.days[weekDates()[3]];
        assignPlace(State.schedule, weekDates()[1], 'w_02', 'actual', 'p_01');`);
    same('work on the Saturday the grid hides is still a record of this week: the sentence stays away',
        blank(), false);
    run(device, `
        delete State.schedule.days[weekDates()[1]];
        State.schedule.workers[1].active = false;
        assignPlace(State.schedule, weekDates()[3], 'w_02', 'actual', 'p_01');`);
    same('and so is the day of a man who has since been archived', blank(), false);
}

// ---------------------------------------------------------------- 3. the site's letter
{
    suite('the site\'s letter: read off the name, and nothing else moves');

    const device = phone();
    const letter = name => run(device, `siteInitial(${JSON.stringify(name)})`);

    same('a Hebrew name', letter('הרצליה - מגדל הים'), 'ה');
    same('a Latin name', letter('B7'), 'B');
    same('a name that starts with a digit', letter('12 רוטשילד'), '1');
    same('leading quotes, dashes and spaces are skipped', letter(' "- תל אביב'), 'ת');
    same('the label of a site that is not on the list', letter('אתר שאינו ברשימה'), 'א');
    same('a name with no letter at all has no letter', letter('--- ***'), '');
    same('nothing', letter(''), '');
    same('not a string', letter(null), '');

    // The colour is the site's id and only its id, before and after.
    const slots = run(device, `JSON.stringify(['p_01','p_02','p_10','p_11','p_23','odd'].map(id =>
        [siteColorVar(id), siteMark(id)]))`);
    same('every colour and every cycle mark is what the id always gave', JSON.parse(slots), [
        ['var(--site-1)', ''], ['var(--site-2)', ''], ['var(--site-10)', ''],
        ['var(--site-1)', '◆'], ['var(--site-3)', '◆'],
        JSON.parse(run(device, `JSON.stringify([siteColorVar('odd'), siteMark('odd')])`))]);
    check('the letter is an attribute on the block, never a child of it',
        spoken(WEEK).includes('line.dataset.initial = initial') && !/el\('span', 'site-initial'/.test(WEEK));
    check('and siteInitial writes nothing and paints nothing',
        !/Store\.|style\./.test(SITECOLOR.slice(SITECOLOR.indexOf('function siteInitial'))));
}

// ---------------------------------------------------------------- 4. the backup row
{
    suite('the backup row: when the reminder is due');

    const device = phone();
    const due = (last, today = TODAY) =>
        run(device, `backupReminderDue(${JSON.stringify(last)}, ${JSON.stringify(today)})`);

    same('a file today', due('2026-11-09'), false);
    same('thirteen days', due('2026-10-27'), false);
    same('fourteen days', due('2026-10-26'), true);
    same('a season', due('2026-05-01'), true);
    same('no record of a file is not a count of days', due(null), false);
    same('a date that is not a date', due('2026-13-45'), false);
    same('garbage', due('yesterday'), false);
    same('a file from the future (the clock moved)', due('2026-11-20'), false);
    same('the threshold is the one the release says', run(device, 'BACKUP_REMINDER_DAYS'), 14);
    same('the sentence, word for word', run(device, 'BACKUP_REMINDER'), BACKUP_REMINDER);
    check('it claims no more than this phone knows: «מהמכשיר הזה»', BACKUP_REMINDER.includes('מהמכשיר הזה'));

    suite('the backup row: drawn off the key the export already keeps, and writing nothing');

    // The age line, as a plain object the stub document hands back. The harness has no
    // row to hang the other two on, so what the ROW says is asked of the pure half.
    const nodes = { backupAge: { textContent: '', className: '' } };
    device.ctx.document.getElementById = id => nodes[id] || null;

    const draw = (last, open = true) => {
        if (last === null) run(device, `Store.remove('scheduleData:lastBackup')`);
        else run(device, `Store.set('scheduleData:lastBackup', ${JSON.stringify(last)})`);
        const before = JSON.stringify(device.dump());
        run(device, 'renderBackupAge()');
        const lines = JSON.parse(run(device, `JSON.stringify(backupRowLines(Store.get('scheduleData:lastBackup'),
            todayStr(), ${JSON.stringify(nodes.backupAge.textContent)}, ${open}))`));
        return { wrote: JSON.stringify(device.dump()) !== before,
            age: nodes.backupAge.textContent, row: lines.age,
            reminder: lines.reminder || null, warn: nodes.backupAge.className };
    };

    let drawn = draw(null);
    same('never: the sentence the row always had', drawn.age, 'אין במכשיר הזה רישום של ייצוא קובץ גיבוי.');
    same('never, open: the row does not say it twice', drawn.row, '');
    same('never, shut: the same sentence on the row', draw(null, false).row, drawn.age);
    same('never: no reminder - there is no age to count', drawn.reminder, null);
    same('never: nothing written', drawn.wrote, false);

    drawn = draw('2026-11-09');
    same('today: the sentence it always had', drawn.age, 'קובץ גיבוי נמסר לדפדפן: היום.');
    same('today: no reminder', drawn.reminder, null);

    drawn = draw('2026-10-31');
    same('nine days: the sentence it always had', drawn.age, 'קובץ גיבוי נמסר לדפדפן: לפני 9 ימים.');
    same('nine days: the warning ink it always had from seven', drawn.warn, 'hint hint-warn');
    same('nine days: no reminder yet', drawn.reminder, null);

    drawn = draw('2026-10-24', false);
    same('sixteen days: the age', drawn.age, 'קובץ גיבוי נמסר לדפדפן: לפני 16 ימים.');
    same('sixteen days, shut: the same on the row', drawn.row, drawn.age);
    same('sixteen days: the reminder, one sentence', drawn.reminder, BACKUP_REMINDER);
    same('sixteen days, open: the reminder holds', draw('2026-10-24').reminder, BACKUP_REMINDER);
    same('sixteen days: nothing written by drawing it', drawn.wrote, false);

    drawn = draw('2026-13-45');
    same('an unreadable date: said as unknown, as before', drawn.age, 'מועד מסירת קובץ הגיבוי לדפדפן אינו ידוע.');
    same('an unreadable date: no reminder', drawn.reminder, null);

    drawn = draw('2026-10-24');
    given('the reminder is up before the file is made', drawn.reminder === BACKUP_REMINDER);
    run(device, `
        State.schedule.workers = [{ id: 'w_01', name: 'דוד כהן', active: true, dailyRate: 400, hourlyRate: 50 }];
        askConfirm = () => new Promise(() => {});
        askTell = () => {};
        exportBackup();`);
    same('a new file: the age reads today', nodes.backupAge.textContent, 'קובץ גיבוי נמסר לדפדפן: היום.');
    same('and takes the reminder away at once',
        run(device, `backupRowLines(Store.get('scheduleData:lastBackup'), todayStr(), '', true).reminder`), '');

    // NO NEW KEY. The age is the export's own stamp; the row adds no preference of its own.
    const keys = Object.keys(device.dump());
    check('the only backup-age key on the disk is the one the export always wrote',
        keys.filter(key => /backup/i.test(key) && !/v2backup/.test(key)).join() === 'scheduleData:lastBackup',
        keys.join(' '));
    const file = device.downloads[device.downloads.length - 1];
    given('the backup file was handed over', file && /^farkad-.*\.json$/.test(file.name), JSON.stringify(file && file.name));
    check('and the stamp is not in the backup file', !file.text.includes('lastBackup'));
    check('nor in the record', !JSON.stringify(run(device, 'State.schedule')).includes('lastBackup'));
    check('nor in what would go to the cloud',
        !JSON.stringify(run(device, 'cloudDocument(State.schedule)')).includes('lastBackup'));

    suite('the backup row: where the two lines are');
    const row = INDEX.slice(INDEX.indexOf('id="settingsFoldBackup"'), INDEX.indexOf('id="settingsFoldRestore"'));
    const head = row.slice(row.indexOf('<summary'), row.indexOf('</summary>'));
    check('the row keeps its title and its own line, word for word, and nothing else in its head',
        head.includes('<div><h3>גיבוי</h3><p class="hint">שמירת עותק של הנתונים בקובץ</p></div>'));
    check('the age line inside the fold is where it was',
        row.includes('<p class="hint" id="backupAge"></p>'));
    check('the two lines are put on the row\'s own head - its <summary> - by the code that knows the age',
        spoken(BACKUP).includes("fold.querySelector(':scope > summary > div')"));
    check('and taken off it when they have nothing to say, never left there hidden',
        spoken(BACKUP).includes('if (!text) { if (node) node.remove(); return; }')
        && !INDEX.includes('backupReminder') && !INDEX.includes('backupAgeRow'));
    check('no dialog and no banner: the reminder calls none of them',
        !/askTell|askConfirm|askChoice|Banner/.test(BACKUP.slice(BACKUP.indexOf('// THE ROW ITSELF'),
            BACKUP.indexOf('function daysBetween'))));
}

report();
