// «חיפוש עובד» - the finder at the foot of the day - on devices.
//
//   node tests/find.test.mjs
//
// The finder (js/ui/find.js) is one field and, for each man found, three doors: his card,
// the sheet of the day on screen, his advances. What this suite holds:
//
//   1. WHO IS FOUND. Any part of the name, the words in any order, a final letter typed
//      as a plain one, a name with or without its geresh, a phone number however it is
//      written, an identity number; the men turned off in a group of their own and never
//      among the others; the roster's own order; and what is deliberately NOT done - a
//      Latin spelling is not read as a Hebrew name.
//   2. WHAT IS DRAWN. The rows, the three doors by their words, the door to the day named
//      after the day ON SCREEN, the count once something is typed, the sentence when
//      nobody is found.
//   3. WHERE THE DOORS GO. Each to the function the screen it names already has, with the
//      man's id and nothing else; a man who is turned off has no door to a day; a man who
//      left the record opens nothing.
//   4. IT WRITES NOTHING. Every key on the disk, byte for byte, across opening it, typing
//      in it and leaving by every door - with a recorder that is then shown to notice a
//      real write - and nothing in its code that could.
//   5. THE WORDS, word for word; the borrowed ones found where their owners keep them.
//   6. THE SHELL: on the page in order, in the offline shell, closed by Escape, redrawn
//      by render(), entered from the day's foot beside «בדיקת היום» and from nowhere else.

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDevice } from './harness.mjs';
import { makeDom } from './moneydom.mjs';
import { suite, check, same, given, report } from './runner.mjs';

process.env.TZ = 'Asia/Jerusalem';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = file => readFileSync(join(ROOT, file), 'utf8');
const FIND = source('js/ui/find.js');
const TODAY = '2026-11-10';
const bare = text => String(text).replace(/[⁦-⁩‎]/g, '');

// Synthetic names throughout.
const CREW = [
    { id: 'w_01', name: 'יוסי כהן', active: true, phone: '052-884-1930', idNumber: '123456782' },
    { id: 'w_02', name: 'אברהם לוי', active: true, phone: '+972 54 111 2233' },
    { id: 'w_03', name: "ג'אבר אבו-חסן", active: true },
    { id: 'w_04', name: 'מוּחמד נאסר', active: true, phone: '00972-58-7654321' },
    { id: 'w_05', name: 'Ahmad Saleh', active: true },
    { id: 'w_06', name: 'כהן דוד', active: false, phone: '050-0000006' },
    { id: 'w_07', name: 'יוסי ב2', active: false },
    { id: 'w_08', name: 'סלים', active: true, phone: '٠٥٢٨٨٤١٩٣١' }
];

function phone(crew) {
    const device = makeDevice({ deviceId: 'd_find' });
    const dom = makeDom();
    ['reportsView', 'advancesView', 'workerDaysTitle', 'workerDaysMeta', 'workerDaysBody', 'workerDaysModal',
        'workerCardModal', 'workerCardTitle', 'workerCardBody', 'workerCardReport', 'workerCardAdvances',
        'findModal', 'findTitle', 'findInput', 'findClear', 'findClose', 'findStatus', 'findList']
        .forEach(id => dom.register(id));
    const make = dom.createElement;
    dom.createElement = tag => { const node = make(tag); node.dataset = {}; return node; };
    device.ctx.document = dom;
    device.dom = dom;
    device.run = code => vm.runInContext(code, device.ctx, { filename: 'harness:find' });
    ['js/ui/sitecolor.js', 'js/ui/reports.js', 'js/ui/week.js', 'js/ui/seder.js', 'js/ui/workercard.js']
        .forEach(file => device.run(source(file)));
    device.run(FIND);
    device.views = [];
    device.sheets = [];
    device.ctx.showView = view => { device.views.push(view); };
    device.ctx.openAssignSheet = (id, options) => { device.sheets.push([id, options]); };
    device.setToday(TODAY);
    device.State.schedule.workers = JSON.parse(JSON.stringify(crew || CREW));
    device.State.schedule.places = [{ id: 'p_01', name: 'אתר צפון', active: true }];
    device.State.date = TODAY;
    device.State.save({ silent: true });
    device.read = query => JSON.parse(device.run(`(function (q) { const found = findRead(State.schedule, q);
        return JSON.stringify({ active: found.active.map(w => w.id), archived: found.archived.map(w => w.id), total: found.total });
    })(${JSON.stringify(query)})`));
    device.type = text => { dom.getElementById('findInput').value = text; device.run('renderFind()'); };
    device.rows = () => dom.getElementById('findList').querySelectorAll('.find-row').map(row => ({
        id: row.dataset.workerId, name: row.querySelector('.find-name').textContent,
        off: row.classList.contains('find-row-off'),
        badge: row.querySelectorAll('.badge').map(node => node.textContent),
        doors: row.querySelectorAll('.find-door').map(node => [node.dataset.findDoor, node.textContent, bare(node.getAttribute('aria-label'))])
    }));
    return device;
}

// ---------------------------------------------------------------- 1. who is found
{
    suite('who is found: any part of the name, a number however it is written');

    const device = phone();
    const ids = query => { const found = device.read(query); return [found.active, found.archived]; };
    const everyone = [['w_01', 'w_02', 'w_03', 'w_04', 'w_05', 'w_08'], ['w_06', 'w_07']];

    same('nothing typed is everyone: the daily list in the roster\'s order, the men turned off after it',
        ids(''), everyone);
    same('spaces alone are nothing typed', ids('   '), everyone);
    same('the start of a name', ids('יוס'), [['w_01'], ['w_07']]);
    same('the middle of a name', ids('וסי'), [['w_01'], ['w_07']]);
    same('the family name, wherever it stands in the name', ids('כהן'), [['w_01'], ['w_06']]);
    same('two words in the other order', ids('כהן יוסי'), [['w_01'], []]);
    same('a second word narrows, it never widens', ids('יוסי לוי'), [[], []]);
    same('a final letter typed as a plain one', ids('אברהמ'), [['w_02'], []]);
    same('and a plain one typed as final', ids('כהנ'), [['w_01'], ['w_06']]);
    same('a name with a geresh, typed without it', ids('גאבר'), [['w_03'], []]);
    same('and with it', ids("ג'אבר"), [['w_03'], []]);
    same('a dashed name, typed with a space', ids('אבו חסן'), [['w_03'], []]);
    same('and typed as one word', ids('אבוחסן'), [['w_03'], []]);
    same('a pointed name is found by its letters', ids('מוחמד'), [['w_04'], []]);
    same('a Latin name whatever the case', ids('AHMAD'), [['w_05'], []]);
    same('NOT DONE: a Latin spelling is not read as a Hebrew name, nor the other way', [ids('yossi'), ids('אחמד')],
        [[[], []], [[], []]]);
    same('a digit that is part of a name', ids('ב2'), [[], ['w_07']]);

    same('a phone number as it is written', ids('052-884-1930'), [['w_01'], []]);
    same('with no dashes', ids('0528841930'), [['w_01'], []]);
    same('part of it', ids('8841'), [['w_01', 'w_08'], []]);
    same('in groups', ids('052 884 1930'), [['w_01'], []]);
    same('written internationally, for a number kept locally', ids('+972 52 884 1930'), [['w_01'], []]);
    same('and +972528841930 in one piece', ids('+972528841930'), [['w_01'], []]);
    same('written locally, for a number kept internationally', ids('0541112233'), [['w_02'], []]);
    same('and for one kept with 00972', ids('058-7654321'), [['w_04'], []]);
    same('Arabic-Indic digits are digits, typed or kept', [ids('٠٥٢٨٨٤١٩٣٠'), ids('0528841931')],
        [[['w_01'], []], [['w_08'], []]]);
    same('an identity number', ids('123456782'), [['w_01'], []]);
    same('a name and a number together', ids('יוסי 052'), [['w_01'], []]);
    same('a man turned off is found by his number too, in his own group', ids('0500000006'), [[], ['w_06']]);
    same('nobody', [ids('זזזז'), device.read('זזזז').total], [[[], []], 0]);

    same('what is compared: letters and digits, the same whatever was typed around them',
        ['  יוסי   כהן ', 'כֹּהֵן', 'O\'Neil-Smith', '‏יוסי‎', 'אבו־חסן'].map(text => device.call('findFold', text)),
        ['יוסי כהנ', 'כהנ', 'oneilsmith', 'יוסי', 'אבוחסנ']);
    same('a damaged roster entry is passed over, not thrown on', JSON.parse(device.run(
        'JSON.stringify(findRead({ workers: [null, { id: "w_x" }, { id: "w_y", name: "דוגמה" }] }, "דוג").active.map(w => w.id))')),
        ['w_y']);
    same('and no roster at all is nobody', JSON.parse(device.run('JSON.stringify(findRead(null, "x"))')),
        { active: [], archived: [], total: 0 });
    check('the reading is pure: no DOM, no storage, no clock in it',
        !/document|Store|localStorage|Date|todayStr|State/.test(
            FIND.slice(FIND.indexOf('const FIND_FINALS'), FIND.indexOf('// ================================================================== the dialog'))
                .split('\n').filter(line => line.trim().indexOf('//') !== 0).join('\n')));
}

// ---------------------------------------------------------------- 2. what is drawn
{
    suite('the dialog: every man with his doors, the day named, the count once something is typed');

    const device = phone();
    const dom = device.dom;
    same('it opens', [device.run('openFind()'), dom.getElementById('findModal').style.display, device.run('findIsOpen()')],
        [true, 'flex', true]);
    same('under the crew screen\'s own words, with its own placeholder, «נקה» and «סגור»',
        [dom.getElementById('findTitle').textContent, dom.getElementById('findInput').placeholder,
            dom.getElementById('findClear').textContent, dom.getElementById('findClose').textContent],
        ['חיפוש עובד', 'חיפוש לפי שם, טלפון או זהות', 'נקה', 'סגור']);
    same('empty, with nothing to clear and no count yet',
        [dom.getElementById('findInput').value, dom.getElementById('findClear').hidden, dom.getElementById('findStatus').hidden,
            dom.getElementById('findStatus').textContent], ['', true, true, '']);
    const rows = device.rows();
    same('every man is there before a letter is typed: the daily list, then the men turned off',
        rows.map(row => [row.id, row.off]), [['w_01', false], ['w_02', false], ['w_03', false], ['w_04', false],
            ['w_05', false], ['w_08', false], ['w_06', true], ['w_07', true]]);
    same('a man on the daily list has three doors, by their words, each named for him',
        rows[0].doors, [['card', 'כרטיס עובד', 'כרטיס עובד · יוסי כהן'], ['sheet', 'שיבוץ להיום', 'שיבוץ להיום · יוסי כהן'],
            ['advances', 'מקדמות', 'מקדמות · יוסי כהן']]);
    same('a man turned off has his card and his advances, the crew row\'s badge, and no door to a day',
        [rows[6].doors.map(door => door[0]), rows[6].badge], [['card', 'advances'], ['לא פעיל']]);
    same('they stand under the crew screen\'s own heading for them, with their number',
        dom.getElementById('findList').querySelectorAll('.find-group').map(node => node.textContent), ['עובדים כבויים (2)']);
    check('a name is text, isolated in the label', dom.getElementById('findList').querySelectorAll('.find-door')[0]
        .getAttribute('aria-label') === 'כרטיס עובד · ⁨יוסי כהן⁩');

    device.type('כהן');
    same('typing narrows the list as it is typed', device.rows().map(row => row.id), ['w_01', 'w_06']);
    same('and says how many, in the crew screen\'s sentence, with «נקה» now offered',
        [dom.getElementById('findStatus').textContent, dom.getElementById('findStatus').hidden, dom.getElementById('findClear').hidden],
        ['נמצאו 2 עובדים', false, false]);
    same('the group of men turned off counts the ones found',
        dom.getElementById('findList').querySelectorAll('.find-group').map(node => node.textContent), ['עובדים כבויים (1)']);
    device.type('אברהם');
    same('with nobody turned off among them there is no such heading',
        [device.rows().map(row => row.id), dom.getElementById('findList').querySelectorAll('.find-group').length], [['w_02'], 0]);
    device.type('זזזז');
    same('nobody found: the crew screen\'s own sentence, and a count of none',
        [device.rows().length, dom.getElementById('findList').textContent, dom.getElementById('findStatus').textContent],
        [0, 'לא נמצאו עובדים. נסה שם או מספר אחר.', 'נמצאו 0 עובדים']);
    device.run('clearFind()');
    same('«נקה» empties the field and brings everyone back',
        [dom.getElementById('findInput').value, device.rows().length, dom.getElementById('findStatus').hidden], ['', 8, true]);

    // THE DAY ON SCREEN is the day the door opens - and the door says which.
    device.State.date = '2026-11-12';
    device.run('renderFind()');
    same('with another day on the screen behind it, the door names that day',
        device.rows()[0].doors[1], ['sheet', 'שיבוץ ליום חמישי 12/11', 'שיבוץ ליום חמישי 12/11 · יוסי כהן']);
    device.State.date = TODAY;
    device.run('renderFind()');
    same('and on today it says today', device.rows()[0].doors[1][1], 'שיבוץ להיום');

    // A RECORD THAT CHANGES UNDER IT.
    device.type('דוגמה');
    given('nobody by that name yet', device.rows().length === 0);
    device.State.schedule.workers.push({ id: 'w_09', name: 'דוגמה חדש', active: true });
    device.run('renderFindIfOpen()');
    same('a man added on another phone while it is open is found at the next render, with what was typed kept',
        [device.rows().map(row => row.id), dom.getElementById('findInput').value], [['w_09'], 'דוגמה']);
    device.State.schedule.workers.filter(worker => worker.id === 'w_09')[0].active = false;
    device.run('renderFindIfOpen()');
    same('and a man turned off under it moves to the other group', device.rows().map(row => [row.id, row.off]), [['w_09', true]]);
    check('render() is where that redraw is asked for',
        source('js/app.js').indexOf("if (typeof renderFindIfOpen === 'function') renderFindIfOpen();") !== -1);

    device.run('closeFind()');
    same('closing hides it and keeps nothing of what was typed',
        [dom.getElementById('findModal').style.display, dom.getElementById('findInput').value, device.run('findIsOpen()')],
        ['none', '', false]);
    device.State.schedule.workers.push({ id: 'w_10', name: 'דוגמה נוסף', active: true });
    const drawn = dom.getElementById('findList').textContent;
    device.run('renderFindIfOpen()');
    check('a render while it is shut draws nothing', dom.getElementById('findList').textContent === drawn);
    device.run('openFind()');
    same('and the next opening starts from the whole crew again', device.rows().length, 10);
    device.run('closeFind()');
}

// ---------------------------------------------------------------- 3. where the doors go
{
    suite('the three doors: his card, the sheet of the day on screen, his advances');

    const device = phone();
    const dom = device.dom;
    const shut = () => dom.getElementById('findModal').style.display === 'none' && dom.getElementById('findInput').value === '';

    device.run('openFind()'); device.type('יוסי');
    device.run('findGo("card", "w_01")');
    same('«כרטיס עובד» closes the finder and opens his card',
        [shut(), dom.getElementById('workerCardModal').style.display, device.run('WORKER_CARD_ID'),
            dom.getElementById('workerCardTitle').textContent], [true, 'flex', 'w_01', 'כרטיס עובד · יוסי כהן']);
    device.run('closeWorkerCard()');

    device.State.date = '2026-11-12';
    device.run('openFind()');
    device.run('findGo("sheet", "w_02")');
    same('the day\'s door closes the finder and opens his sheet, the way «בדיקת היום» opens one',
        [shut(), device.sheets], [true, [['w_02', { stay: true }]]]);
    same('on the day that was on screen - the finder chose no date', [device.State.date, device.views], ['2026-11-12', []]);
    check('it is the day\'s own sheet that is asked', FIND.indexOf('openAssignSheet(worker.id, { stay: true });') !== -1
        && source('js/ui/daycheck.js').indexOf('openAssignSheet(workerId, { stay: true });') !== -1);

    device.run('openFind()');
    device.run('findGo("advances", "w_06")');
    same('«מקדמות» closes the finder and opens the advances screen on him - a man turned off too',
        [shut(), device.views, device.run('ADVANCE_WORKER')], [true, ['advances'], 'w_06']);

    device.sheets.length = 0; device.views.length = 0;
    device.run('openFind()');
    device.run('findGo("sheet", "w_06")');
    same('a man turned off is given no day, whatever asks', [shut(), device.sheets, device.views], [true, [], []]);
    device.run('openFind()');
    device.run('findGo("card", "w_nobody"); findGo("sheet", "w_nobody"); findGo("advances", "w_nobody")');
    same('a man who left the record between the list and the tap opens nothing',
        [shut(), device.sheets, device.views, dom.getElementById('workerCardModal').style.display, device.run('WORKER_CARD_ID')],
        [true, [], [], 'none', null]);
    same('none of it asked for a redraw of its own', device.renders.count, 0);
}

// ---------------------------------------------------------------- 4. it writes nothing
{
    suite('opening it, typing in it and leaving by every door leaves every byte on the disk where it was');

    const device = phone();
    device.State.commit(device.call('assignPlace', device.State.schedule, TODAY, 'w_01', 'actual', 'p_01'));
    device.State.commit(device.call('addAdvance', device.State.schedule, 'w_01', TODAY, 500, ''));
    const disk = JSON.stringify(device.dump());
    const record = JSON.stringify(device.State.schedule);
    given('there is a record on the disk', Object.keys(device.dump()).length > 0);
    const touched = [];
    device.setQuota(key => { touched.push(`set ${key}`); return false; });
    device.blockRemoval(key => { touched.push(`remove ${key}`); return false; });

    device.State.schedule.workers.map(worker => worker.id).forEach(id => {
        ['', 'יוסי', '052', 'זזזז', 'כהן יוסי'].forEach(text => {
            device.run('openFind()');
            device.type(text);
            device.run('renderFindIfOpen(); clearFind(); closeFind();');
        });
        ['card', 'sheet', 'advances'].forEach(door => {
            device.run(`openFind(); findGo(${JSON.stringify(door)}, ${JSON.stringify(id)}); closeWorkerCard();`);
        });
    });
    check('not one write reached the disk', touched.length === 0, touched.slice(0, 5).join(', '));
    check('every key holds the bytes it held', JSON.stringify(device.dump()) === disk);
    check('the record in memory is the record it was', JSON.stringify(device.State.schedule) === record);
    same('nothing was queued for the cloud',
        Object.keys(device.dump()).filter(key => key.indexOf('farkad:outbox') === 0).length,
        Object.keys(JSON.parse(disk)).filter(key => key.indexOf('farkad:outbox') === 0).length);

    device.State.commit(device.call('assignPlace', device.State.schedule, TODAY, 'w_02', 'actual', 'p_01'));
    check('the same recorder notices a real commit', touched.length > 0 && JSON.stringify(device.dump()) !== disk);

    const code = FIND.split('\n').filter(line => line.trim().indexOf('//') !== 0)
        .map(line => line.replace(/\s\/\/ .*$/, '')).join('\n');
    const writers = code.match(new RegExp([
        '\\bStore\\b', 'localStorage', 'sessionStorage', 'indexedDB', '\\.commit', 'commitMany', 'commitRoster',
        '\\.save\\(', '\\.persist\\(', 'FarkadSync', '\\bfetch\\(', 'window\\.open', '\\brecord[A-Z]\\w*\\(',
        'addAdvance', 'removeAdvance', 'assignPlace', 'markAbsent', 'setWorkerDay', 'State\\.date\\s*=',
        'innerHTML', 'createElement', '\\balert\\(', '\\bconfirm\\(', '\\bprompt\\('
    ].join('|'), 'g')) || [];
    same('its code calls nothing that writes, sets no date, and puts no name into markup', writers, []);
}

// ---------------------------------------------------------------- 5. the words
{
    suite('every new word, word for word - proposed, for the owner to approve');

    const device = phone();
    same('the door to the day, on today', device.run('FIND_TEXT.sheetToday'), 'שיבוץ להיום');
    same('and on another day, naming it', device.run('FIND_TEXT.sheetDay("יום חמישי", "12/11")'), 'שיבוץ ליום חמישי 12/11');
    same('a door read aloud: its words, then the man', device.run('FIND_TEXT.doorFor("מקדמות", "דוגמה")'), 'מקדמות · דוגמה');
    same('and those three are all it adds', device.run('Object.keys(FIND_TEXT).join()'), 'sheetToday,sheetDay,doorFor');

    const reused = JSON.parse(device.run(`JSON.stringify({ title: FIND_REUSED.title, placeholder: FIND_REUSED.placeholder,
        found: FIND_REUSED.found(3), none: FIND_REUSED.none, archived: FIND_REUSED.archived(2),
        inactive: FIND_REUSED.inactive, advances: FIND_REUSED.advances, clear: FIND_REUSED.clear, close: FIND_REUSED.close })`));
    same('the borrowed words are exactly these', device.run('Object.keys(FIND_REUSED).sort().join()'),
        Object.keys(reused).sort().join());
    // Each in its owner's source, as that screen says it.
    const owners = {
        title: ['index.html', '<label for="rosterWorkerSearch">חיפוש עובד</label>', 'חיפוש עובד'],
        placeholder: ['index.html', 'placeholder="חיפוש לפי שם, טלפון או זהות" oninput="renderWorkerList()"', 'חיפוש לפי שם, טלפון או זהות'],
        found: ['js/ui/roster.js', '`נמצאו ${active.length + archived.length} עובדים`', 'נמצאו 3 עובדים'],
        none: ['js/ui/roster.js', "emptyHint('לא נמצאו עובדים. נסה שם או מספר אחר.')", 'לא נמצאו עובדים. נסה שם או מספר אחר.'],
        archived: ['js/ui/roster.js', '`עובדים כבויים (${archived.length})`', 'עובדים כבויים (2)'],
        inactive: ['js/ui/roster.js', "el('span', 'badge', 'לא פעיל')", 'לא פעיל'],
        advances: ['js/ui/reports.js', "el('h2', null, 'מקדמות')", 'מקדמות'],
        clear: ['index.html', 'id="rosterSearchClear" onclick="clearRosterSearch()" hidden>נקה</button>', 'נקה'],
        close: ['index.html', 'onclick="closeWorkerDays()">סגור</button>', 'סגור']
    };
    same('each is in its owner\'s source, and says here what it says there',
        Object.keys(owners).filter(key => source(owners[key][0]).indexOf(owners[key][1]) === -1 || reused[key] !== owners[key][2]), []);
    check('the card\'s door is the card\'s own word, read from the card',
        FIND.indexOf("door('card', WORKER_CARD_TEXT.title)") !== -1);

    const blocks = /const FIND_TEXT = Object\.freeze\(\{[\s\S]*?\n\}\);|const FIND_REUSED = Object\.freeze\(\{[\s\S]*?\n\}\);/g;
    given('both blocks are found', (FIND.match(blocks) || []).length === 2);
    const loose = FIND.replace(blocks, '').split('\n').filter(line => line.trim().indexOf('//') !== 0)
        .map(line => line.replace(/\s\/\/ .*$/, ''))
        // The table of final letters and the two character classes of the fold are letters, not words.
        .filter(line => line.indexOf('FIND_FINALS') === -1)
        .filter(line => /[֐-׿]/.test(line));
    same('outside its two blocks the finder\'s code holds no Hebrew word', loose, []);
    check('nothing in it says anything was sent', FIND.indexOf('נשלח') === -1);
    check('and no existing string moved: the crew screen\'s search is as it was',
        source('index.html').indexOf('<input id="rosterWorkerSearch" type="search" placeholder="חיפוש לפי שם, טלפון או זהות" oninput="renderWorkerList()" autocomplete="off"/>') !== -1
        && source('js/ui/roster.js').indexOf(".some(value => String(value || '').toLocaleLowerCase().includes(query));") !== -1);
}

// ---------------------------------------------------------------- 6. the shell
{
    suite('the file is on the page, in order, in the offline shell, and entered from one place');

    const page = source('index.html');
    const scripts = [...page.matchAll(/<script src="([^"]+)"><\/script>/g)].map(match => match[1]);
    const at = scripts.indexOf('js/ui/find.js');
    check('index.html loads it once, as a classic script',
        scripts.filter(src => src === 'js/ui/find.js').length === 1 && page.indexOf('type="module" src="js/ui/find.js"') === -1);
    check('after everything it opens or draws with',
        ['js/ui/dom.js', 'js/ui/modal.js', 'js/ui/day.js', 'js/ui/sheet.js', 'js/ui/roster.js', 'js/ui/reports.js',
            'js/ui/workercard.js', 'js/state.js'].every(src => scripts.indexOf(src) !== -1 && scripts.indexOf(src) < at), String(at));
    check('and before boot', at !== -1 && at < scripts.indexOf('js/app.js'));
    check('the service worker\'s shell names it', source('sw.js').indexOf("'./js/ui/find.js',") !== -1);
    check('its frame is one of the app\'s dialogs: a heading, a search field that names it, the list',
        /<div class="modal" id="findModal">\s+<div class="modal-content find-content">\s+<div class="find-head">\s+<h3 id="findTitle" tabindex="-1"><\/h3>/.test(page)
        && page.indexOf('<input type="search" id="findInput" aria-labelledby="findTitle" autocomplete="off" oninput="renderFind()">') !== -1
        && page.indexOf('<div id="findList"></div>') !== -1);
    check('Escape and the backdrop reach its own closer (js/ui/modal.js)',
        source('js/ui/modal.js').indexOf('findModal: () => closeFind()') !== -1);
    check('the day draws its entry at the foot of the list, first in the row «בדיקת היום» stands in',
        // v188, MOVED: the closure now begins with the journey's own row, appended ABOVE this
        // one (js/ui/journey.js); the row «חיפוש עובד» stands in is built exactly as it was.
        // MOVED AGAIN (the second review of the hotfix): each row is handed through trayClock
        // as it is appended - the trays' one clock, so the second tap of a double tap on the
        // last man's chip starts nothing from the foot. The rows themselves are as they were.
        /const check = \(\) => \{\s+const journey = typeof journeyDayEntry === 'function' \? journeyDayEntry\(\) : null;\s+if \(journey\) root\.appendChild\(trayClock\(journey\)\);\s+const foot = typeof dayCheckEntry === 'function' \? dayCheckEntry\(\) : el\('div', 'daycheck-row'\);\s+if \(typeof findEntry === 'function'\) foot\.insertBefore\(findEntry\(\), foot\.firstChild\);\s+if \(foot\.firstChild\) root\.appendChild\(trayClock\(foot\)\);\s+\};/
            .test(source('js/ui/day.js')));
    same('and nothing else in the app opens it', ['index.html', 'js/app.js', 'js/ui/day.js', 'js/ui/sheet.js', 'js/ui/roster.js',
        'js/ui/reports.js', 'js/ui/share.js', 'js/ui/week.js', 'js/ui/settings.js', 'js/ui/workercard.js']
        .filter(file => source(file).indexOf('openFind(') !== -1), []);
    const device = phone();
    const entry = JSON.parse(device.run(`(function () { const one = findEntry();
        return JSON.stringify([one.className, one.tagName, one.textContent, one.attributes.id || one.id,
            one.getAttribute('aria-haspopup')]); })()`));
    same('the entry is one worded button, announced as opening a dialog',
        entry, ['btn-secondary find-entry', 'BUTTON', 'חיפוש עובד', 'findEntry', 'dialog']);
    check('its look is in the design layer and nowhere else, the field at 16px or more',
        /\.find-field input \{[^}]*font-size: 18px;/.test(source('css/design.css'))
        && source('css/app.css').indexOf('.find-') === -1 && source('css/readability.css').indexOf('.find-') === -1);
    check('and it gives the keyboard\'s measured height back, like the sheet',
        /#findModal \.find-content \{[^}]*max-height: calc\(100dvh - 32px - var\(--kb-h, 0px\)\);/.test(source('css/design.css'))
        && source('js/ui/bars.js').indexOf("root.style.setProperty('--kb-h'") !== -1);
}

report();
