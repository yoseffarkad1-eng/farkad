// «מה חדש» - what changed and where it is - in Node.
//
//   node tests/whatsnew.test.mjs
//
// js/ui/whatsnew.js tells a phone, once and quietly, what the builds since the last one
// it saw have added. What is its own is a data block of news, the rule that decides what
// a phone is owed, and ONE preference that says which build's news this phone has seen.
// Those are measured here, on real devices of the harness, each started ON A NAMED BUILD
// (makeDevice's appVersion - the stamp js/app.js would declare):
//
//   - the rule across builds: a phone that saw v181 and starts on v186 is owed v182..v186
//     and nothing else; nothing twice; nothing written ahead of the running build; an
//     older build opened later never makes old news new;
//   - a first install is told nothing, and is noted so that it hears of the NEXT build;
//   - a phone with a crew and no note - the three phones this was built for - is owed
//     everything the block holds up to its build, once;
//   - the preference: per phone, under its own key; never the record, the outbox, the
//     fence, the cloud, a backup or the rescue file; damaged, poisoned or absent it is
//     "nothing seen"; a disk that refuses it costs nothing but the note;
//   - every word: the card's own, and every item of every build, pinned;
//   - every «הראה לי» names a way the file has, and the file writes nothing but its key;
//   - THE GUARD FOR THE NEXT RELEASE: the build js/app.js declares must have an entry in
//     the block once docs/releases.md has written that build up.
//
// The line, the card, the row in ⋯ and where each «הראה לי» lands are
// tests/whatsnew.browser.mjs.

import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import { makeDevice, makeCloud, settle, settleUntil } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const read = path => {
    const file = new URL(path, import.meta.url);
    return existsSync(file) ? readFileSync(file, 'utf8') : '';
};
const WHATSNEW = read('../js/ui/whatsnew.js');
const RELEASES = read('../docs/releases.md');
const APP = read('../js/app.js');
const TICK = 6;
const KEY = 'farkadWhatsNewSeen';
const DAY = '2026-11-11';

const WORKERS = () => [
    { id: 'w_01', name: 'אחמד', active: true, dailyRate: 400, hourlyRate: 0, phone: '052-884-1930' },
    { id: 'w_02', name: 'מוחמד', active: true, dailyRate: 400, hourlyRate: 0, phone: '' }
];
const PLACES = () => [{ id: 'p_01', name: 'הרצליה', active: true }];

// A phone started on `build`. `crew: false` is a phone nobody has put a man on yet.
function phone(id, build, options = {}) {
    const device = makeDevice({ deviceId: id, storage: options.storage, appVersion: build });
    device.Sync.pushDelayMs = TICK;
    device.setToday('2026-11-10');
    device.ctx.askTell = () => Promise.resolve();
    vm.runInContext(WHATSNEW, device.ctx, { filename: 'js/ui/whatsnew.js' });
    if (options.storage) device.State.load();
    if (options.crew !== false && !options.storage) {
        device.State.schedule.workers = WORKERS();
        device.State.schedule.places = PLACES();
        device.State.save({ silent: true });
        device.State.commit(device.call('assignPlace', device.State.schedule, DAY, 'w_01', 'actual', 'p_01'));
    }
    return device;
}
// The same disk, opened again - by the same build or by another.
const reopen = (device, build) => phone(device.id, build, { storage: device.dump() });
const owed = device => device.call('whatsNewPending').news.map(entry => entry.build);
const kept = device => JSON.parse(device.raw(KEY));
const plain = value => JSON.parse(JSON.stringify(value));
const others = device => {
    const disk = device.dump();
    delete disk[KEY];
    return JSON.stringify(Object.keys(disk).sort().map(key => [key, disk[key]]));
};

async function block(name, body) {
    suite(name);
    try {
        await body();
    } catch (error) {
        check(`${name}: the block ran to its end`, false,
            String((error && error.stack) || error).split('\n').slice(0, 3).join(' | '));
    }
}

// THE NEWS, AS PINNED. Every word of every item; a change in js/ui/whatsnew.js moves the
// line here in the same commit (CLAUDE.md, law 6). PROPOSED Hebrew, not read by the owner.
const EXPECTED = [
    { build: 'v195', items: [
        { title: 'מקדמות: מי חייב כסף',
            text: 'בראש עמוד המקדמות רואים כמה העובדים חייבים, מי חייב וממתי, ואזהרה כשחשבון קודם לא נסגר או כשעברו שתי תקופות בלי ניכוי.',
            where: 'מקדמות', go: 'advances' }
    ] },
    { build: 'v194', items: [
        { title: 'הכל חופש: מאחורי «עוד ⋯» ועם שאלה',
            text: 'הכפתור הכל חופש עבר אל «עוד ⋯» בתחתית רשימת היום, ולפני הרישום יש שאלה עם שמות כל העובדים שיירשם להם חופש.',
            where: 'היום ← בתחתית הרשימה ← עוד ⋯', go: 'day' },
        { title: 'תיקון: ביטול לא דורס רישום ממכשיר אחר',
            text: 'ביטול פעולה (↶) כבר לא כותב רישום ישן מעל רישום שהשתנה בינתיים ממכשיר אחר, אלא אומר שהפעולה לא בוצעה.',
            where: 'היום ← בטל או ↶', go: 'day' },
        { title: 'תיקון: הסרת עובדים בזה אחר זה',
            text: 'אפשר להסיר עובדים מאתר, ולבטל היעדרויות, בזה אחר זה בקצב רגיל בלי שלחיצה תיבלע, וסרגל הביטול כבר לא עולה מתחת לאצבע.',
            where: 'היום ← ✕ ליד שם העובד', go: 'day' }
    ] },
    { build: 'v193', items: [] },
    { build: 'v192', items: [
        { title: 'דוחות: שמות בולטים וצבע לכל קבוצה',
            text: 'בכרטיס של כל עובד השם גדול ובולט, השבועיים בכתום והדו־שבועיים בכחול, ובראש כל קבוצה כתוב רק שבועי או דו־שבועי.',
            where: 'דוחות ← לפי עובד', go: 'payReport' }
    ] },
    { build: 'v191', items: [
        { title: 'תצוגה גדולה',
            text: 'מי שקשה לו לקרוא אותיות קטנות מפעיל תצוגה גדולה: האותיות, המספרים והכפתורים גדלים בכל המסכים, רק בטלפון שלו.',
            where: 'הגדרות ← כללי ← תצוגה גדולה', go: 'display' }
    ] },
    { build: 'v190', items: [
        { title: 'תיקון: נגיעה כפולה וחצות',
            text: 'נגיעה כפולה ליד שם עובד כבר לא מסמנת עובד אחר כנעדר, ושיבוץ שנפתח לפני חצות נשמר ליום שהיה כתוב במסך.',
            where: 'היום ← לא נרשמו', go: 'day' }
    ] },
    { build: 'v189', items: [
        { title: 'דוחות: כל קבוצה בתקופה שלה',
            text: 'הדוח נפתח כשהעובדים השבועיים בשבוע הנוכחי והדו־שבועיים בשבועיים שלהם, ושבוע קודם שעדיין פתוח כתוב מתחת לקבוצה.',
            where: 'דוחות ← לפי עובד', go: 'payReport' },
        { title: 'דוחות: שעות נוספות על הכרטיס',
            text: 'בכרטיס של כל עובד רואים את ימי העבודה, השעות הנוספות והחופש, ואחריהם מה נצבר וכמה נותר לתשלום.',
            where: 'דוחות ← לפי עובד', go: 'payReport' },
        { title: 'האתר הקבוע ליד השם',
            text: 'ליד עובד שעוד לא נרשם מופיע האתר שבו עבד בימים האחרונים, ונגיעה אחת משבצת אותו שם ליום רגיל.',
            where: 'היום ← לא נרשמו, ליד שם העובד', go: 'day' },
        { title: 'כרטיס אתר',
            text: 'אתר אחד במסך אחד, לקריאה בלבד: לוח החודש, כמה עובדים היו בו בכל יום, מי עבד בו, וסיכום החודש ללקוח.',
            where: 'צוות ← כרטיס אתר, ליד שם האתר', go: 'roster' }
    ] },
    { build: 'v188', items: [
        { title: 'בניית סידור ישר ממסך היום',
            text: 'בתחתית רשימת היום יש כפתור שפותח את בניית הסידור ליום הבא, או ממשיך מהשלב שבו עצרת.',
            where: 'היום ← בתחתית הרשימה', go: 'dayFoot' },
        { title: 'תלוש לכל עובד',
            text: 'כל עובד מקבל בוואטסאפ את החשבון שלו לתקופה שלו: הימים, מה נצבר, המקדמות וכמה נותר לתשלום.',
            where: 'דוחות ← לפי עובד ← הפקת דוח ← תלוש לכל עובד', go: 'payslipsMenu' },
        { title: 'כרטיס עובד: לוח החודש, התקשר, וואטסאפ',
            text: 'בכרטיס העובד יש עכשיו לוח של החודש, יום אחרי יום, וכפתורים להתקשר אליו או לפתוח איתו וואטסאפ.',
            where: 'צוות ← כרטיס עובד, ליד שם העובד', go: 'roster' },
        { title: 'חיפוש עובד',
            text: 'כפתור שמוצא עובד לפי שם או טלפון, ופותח את הכרטיס שלו, את השיבוץ שלו ליום או את המקדמות שלו.',
            where: 'היום ← בתחתית הרשימה ← חיפוש עובד', go: 'find' }
    ] },
    { build: 'v187', items: [
        { title: 'סיכום חודש',
            text: 'חודש שלם במסך אחד: העבודה לפי אתר, רימא ויוסף גבס, העובדים, הכסף, וההשוואה לחודש הקודם.',
            where: 'דוחות ← הפקת דוח ← סיכום חודש', go: 'reportsMenu' }
    ] },
    { build: 'v186', items: [
        { title: 'הסעות משותפות לכל הטלפונים',
            text: 'טלפון שהפעיל הסעות ומחובר לענן רואה את אותו שיבוץ לרכבים ואת אותה רשימת רכבים כמו הטלפונים האחרים.',
            where: 'שליחה לוואטסאפ ← הסעות – שיבוץ לרכבים', go: 'rides' },
        { title: 'השורה מתחת לכותרת במסך ההסעות',
            text: 'השורה אומרת אם השיבוץ משותף ומעודכן, או שמור במכשיר הזה בלבד ועדיין לא נראה בטלפונים האחרים.',
            where: 'מסך ההסעות ← מתחת לכותרת', go: 'rides' }
    ] },
    { build: 'v184', items: [
        { title: 'בניית סידור',
            text: 'הסידור של מחר במסלול אחד של חמישה שלבים: שיבוץ לאתרים, בדיקה, הסעות, מבט אחרון ושליחה.',
            where: 'שליחה לוואטסאפ ← בניית סידור', go: 'share' },
        { title: 'כרטיס עובד',
            text: 'עובד אחד במסך אחד, לקריאה בלבד: איפה עבד בשבועיים האחרונים, השכר בתקופה הפתוחה והמקדמות שלו.',
            where: 'צוות ← כרטיס עובד, ליד שם העובד', go: 'roster' },
        { title: 'רכב שלא יוצא כמה ימים',
            text: 'אפשר לכבות רכב ולהפעיל אותו שוב, כמו עובד בצוות, ורכב כבוי לא מופיע בשיבוץ.',
            where: 'מסך ההסעות ← רכבים', go: 'rides' }
    ] },
    { build: 'v183', items: [
        { title: 'עובדי יוסף גבס',
            text: 'בכל אתר, ליד רימא, יש תיבה לספירת עובדי יוסף גבס – רשימה נפרדת שלא נכנסת לשכר ולא לחשבון הלקוח.',
            where: 'היום ← בכרטיס של כל אתר, ליד רימא', go: 'day' },
        { title: 'לפני הספירה הראשונה של יוסף גבס',
            text: 'כל הטלפונים צריכים להתעדכן לפני שמקלידים ספירה ראשונה, כי טלפון עם גרסה ישנה לא שומר את הספירה.',
            where: 'הגדרות ← מכשיר ועזרה ← עדכון וגרסה', go: 'version' }
    ] },
    { build: 'v182', items: [
        { title: 'בדיקת היום',
            text: 'כפתור אחד שמראה מה אולי נשכח ביום לעומת יום העבודה הקודם, בלי לשנות שום רישום.',
            where: 'היום ← בתחתית הרשימה ← בדיקת היום', go: 'dayCheck' },
        { title: 'דוח הסעות לתקופה',
            text: 'כמה ימים יצא כל רכב ומי נהג בו, בתקופה שבוחרים.',
            where: 'מסך ההסעות ← דוח הסעות לתקופה', go: 'rides' }
    ] },
    { build: 'v181', items: [
        { title: 'שבוע: אות לכל אתר',
            text: 'בטלפון, כל משבצת צבע בטבלת השבוע מראה גם את האות הראשונה של שם האתר.',
            where: 'שבוע', go: 'week' },
        { title: 'מקדמות: מי שלא חייב נראה שקט',
            text: 'עובד שלא חייב כלום כתוב בצבע חלש יותר, כדי שמי שחייב יבלוט.',
            where: 'מקדמות', go: 'advances' },
        { title: 'מתי נשמר גיבוי אחרון',
            text: 'שורת הגיבוי בהגדרות אומרת מתי נשמר קובץ גיבוי, ומזכירה אחרי שבועיים בלי קובץ חדש.',
            where: 'הגדרות ← גיבוי ושחזור ← גיבוי', go: 'backup' }
    ] },
    { build: 'v180', items: [
        { title: 'יתרת זכות',
            text: 'עובד שהחזיר יותר ממה שהיה חייב – העודף נשמר לו כיתרת זכות, ויורד מהמקדמה הבאה שייקח.',
            where: 'מקדמות', go: 'advances' }
    ] },
    { build: 'v179', items: [
        { title: 'סיכום הסעות ליום',
            text: 'דף אחד עם כל רכב שיוצא, הנהג שלו והנוסעים, שאפשר לשלוח כטקסט או כתמונה.',
            where: 'מסך ההסעות ← סיכום הסעות ליום', go: 'rides' }
    ] },
    { build: 'v174', items: [
        { title: 'הסעות: הרכבים מצוירים מלמעלה',
            text: 'כל רכב מצויר מלמעלה עם המושבים שלו: גוררים עובד באצבע אל מושב, ומי שיושב במושב הנהג הוא הנהג.',
            where: 'שליחה לוואטסאפ ← הסעות – שיבוץ לרכבים', go: 'rides' }
    ] }
];
const BUILDS = EXPECTED.map(entry => entry.build);
const upTo = n => BUILDS.filter(build => Number(build.slice(1)) <= n);

await block('the rule across builds: what a phone is owed', async () => {
    const device = phone('d_rule', 'v186');
    const since = (seen, current) => device.call('whatsNewSince', seen, current).map(entry => entry.build);
    same('a build is a v and a number', ['v186', 'v9', 'v0186', '186', 'V186', 'v186a', '', null, undefined, 186, 'v-1', 'v1234567']
        .map(build => device.call('whatsNewNumber', build)), [186, 9, 186, null, null, null, null, null, null, null, null, null]);
    same('saw v181, starts on v186: owed v182 to v186, newest first', since(181, 186), ['v186', 'v184', 'v183', 'v182']);
    same('saw v186, on v186: nothing', since(186, 186), []);
    same('saw v183, on v184: the one build', since(183, 184), ['v184']);
    same('saw a build that had no news of its own (v178), on v181', since(178, 181), ['v181', 'v180', 'v179']);
    same('a build with no entry of its own tells nothing by itself', since(184, 185), []);
    same('seen nothing at all, on v186: everything up to v186', since(null, 186), upTo(186));
    same('an entry written AHEAD of the running build is not news yet', [since(null, 186).includes('v187'), since(null, 187).includes('v188')], [false, false]);
    same('and is, on the build it was written for', [since(186, 187), since(187, 188), since(186, 188)], [['v187'], ['v188'], ['v188', 'v187']]);
    same('a phone that saw a NEWER build than it runs is owed nothing', since(190, 186), []);
    same('with no build to speak of there is nothing to tell', [since(181, null), since(181, undefined)], [[], []]);
    same('the first-install rule: nothing seen and nobody on the phone',
        plain(device.call('whatsNewRead', null, 186, false)), { firstInstall: true, news: [] });
    same('nothing seen and a crew: the whole list', device.call('whatsNewRead', null, 186, true).news.map(entry => entry.build), upTo(186));
    same('something seen and no crew is not a first install',
        [device.call('whatsNewRead', 181, 186, false).firstInstall, device.call('whatsNewRead', 181, 186, false).news.length], [false, 4]);
});

await block('a first install is told nothing, and hears of the next build', async () => {
    const fresh = phone('d_fresh', 'v186', { crew: false });
    given('a phone nobody has used: no crew and no note', fresh.State.schedule.workers.length === 0 && fresh.raw(KEY) === null);
    const before = others(fresh);
    same('at its first start there is nothing to tell', [fresh.call('whatsNewBoot'), owed(fresh)], ['first', []]);
    same('and it is noted as having seen the build it started on', kept(fresh), { version: 1, build: 'v186' });
    same('which is the only key that start wrote', others(fresh), before);

    fresh.State.schedule.workers = WORKERS();
    fresh.State.save({ silent: true });
    const later = reopen(fresh, 'v186');
    same('with a crew, on the same build: still nothing', [later.call('whatsNewBoot'), owed(later)], ['none', []]);
    const updated = reopen(later, 'v187');
    same('on the next build it is told that build\'s news, and only that', [updated.call('whatsNewBoot'), owed(updated)], ['news', ['v187']]);
    same('and two builds on, both - newest first', owed(reopen(later, 'v188')), ['v188', 'v187']);
});

await block('a phone that was here before is told once, and then not again', async () => {
    // The three phones: a crew, days of work, and no note of anything seen.
    const old = phone('d_old', 'v186');
    given('a crew and no note', old.State.schedule.workers.length === 2 && old.raw(KEY) === null);
    same('it is owed everything the block holds up to its build', [old.call('whatsNewBoot'), owed(old)], ['news', upTo(186)]);
    same('offering wrote nothing: unread news is still unread after a restart', old.raw(KEY), null);
    same('so it is offered again by the next start', owed(reopen(old, 'v186')), upTo(186));
    same('seen - the card closed or the line put away - is one note', [old.call('whatsNewMarkSeen'), kept(old)], [true, { version: 1, build: 'v186' }]);
    same('and nothing is owed any more, in this session', owed(old), []);
    same('nor after a restart', [reopen(old, 'v186').call('whatsNewBoot'), owed(reopen(old, 'v186'))], ['none', []]);

    // Seen v181, then five builds arrive.
    const behind = phone('d_behind', 'v186');
    behind.putRaw(KEY, JSON.stringify({ version: 1, build: 'v181' }));
    const now = reopen(behind, 'v186');
    same('seen v181, started on v186: v182 to v186, newest first', [now.call('whatsNewBoot'), owed(now)],
        ['news', ['v186', 'v184', 'v183', 'v182']]);
    same('the card from ⋯ lists everything this build knows, seen or not',
        now.call('whatsNewEntries', 'all').map(entry => entry.build), upTo(186));
    same('and the card from the line lists what is owed', now.call('whatsNewEntries', 'new').map(entry => entry.build),
        ['v186', 'v184', 'v183', 'v182']);
    now.call('whatsNewMarkSeen');
    same('seen, the note moves to the running build', kept(now), { version: 1, build: 'v186' });
    same('⋯ still lists everything', now.call('whatsNewEntries', 'all').map(entry => entry.build), upTo(186));

    // An older build opened after a newer one: a second window that has not caught up.
    const ahead = phone('d_ahead', 'v186');
    ahead.putRaw(KEY, JSON.stringify({ version: 1, build: 'v190' }));
    const stale = reopen(ahead, 'v186');
    same('a phone that has seen a newer build is told nothing by an older one', [stale.call('whatsNewBoot'), owed(stale)], ['none', []]);
    stale.call('whatsNewMarkSeen');
    same('and the older build never lowers the note', kept(stale), { version: 1, build: 'v190' });
});

await block('a note that will not read is "nothing seen"', async () => {
    const cases = {
        'cut off mid-write': '{"version":1,"build":"v1',
        'not an object': '"v186"',
        'an array': '["v186"]',
        'null': 'null',
        'empty': '',
        'another version': JSON.stringify({ version: 2, build: 'v186' }),
        'a build that is not one': JSON.stringify({ version: 1, build: 'latest' }),
        'a build as a number': JSON.stringify({ version: 1, build: 186 }),
        'no build': JSON.stringify({ version: 1 }),
        'a poisoned name': '{"__proto__":{"version":1,"build":"v186"},"constructor":{"prototype":{"build":"v186"}}}'
    };
    for (const [name, raw] of Object.entries(cases)) {
        const device = phone(`d_bad_${Object.keys(cases).indexOf(name)}`, 'v186');
        device.putRaw(KEY, raw);
        const again = reopen(device, 'v186');
        const record = [JSON.stringify(again.State.schedule), again.raw('scheduleData:v2')];
        same(`${name}: read as nothing seen`, again.call('whatsNewSeen'), null);
        same(`${name}: on a phone with a crew the list is offered once more`, [again.call('whatsNewBoot'), owed(again)], ['news', upTo(186)]);
        again.call('whatsNewMarkSeen');
        same(`${name}: and seeing it writes a readable note over it`, kept(again), { version: 1, build: 'v186' });
        same(`${name}: the record is what it was, in memory and on the disk`,
            [JSON.stringify(again.State.schedule), again.raw('scheduleData:v2')], record);
    }
    check('nothing landed on a prototype', ({}).build === undefined && ({}).version === undefined);

    const empty = phone('d_bad_empty', 'v186', { crew: false });
    empty.putRaw(KEY, '{"version":1,"build":"v1');
    const again = reopen(empty, 'v186');
    same('a damaged note on a phone with no crew is a first install: told nothing, noted afresh',
        [again.call('whatsNewBoot'), owed(again), kept(again)], ['first', [], { version: 1, build: 'v186' }]);
});

await block('it is not the record: not the schedule, not the outbox, not the fence', async () => {
    const device = phone('d_record', 'v186');
    const schedule = JSON.stringify(device.State.schedule);
    const disk = device.raw('scheduleData:v2');
    const queued = JSON.stringify(device.Sync.pendingPaths());
    const fence = device.Store.fenceState();
    const before = others(device);
    given('the record is on the disk and the fence can be read', disk !== null && fence !== null);

    device.call('whatsNewBoot');
    device.call('whatsNewEntries', 'all');
    device.call('whatsNewEntries', 'new');
    same('offering and listing wrote no key at all', [device.raw(KEY), others(device)], [null, before]);
    device.call('whatsNewMarkSeen');
    same('the schedule in memory is byte for byte what it was', JSON.stringify(device.State.schedule), schedule);
    same('so is the record on the disk', device.raw('scheduleData:v2'), disk);
    same('nothing was queued for the cloud', JSON.stringify(device.Sync.pendingPaths()), queued);
    same('the write counter did not move: this is not a record the rescue file carries', device.Store.fenceState(), fence);
    same('every other key on the disk is byte for byte what it was', others(device), before);
    same('its own key has one shape', Object.keys(kept(device)).sort(), ['build', 'version']);
});

await block('none of it leaves the phone: no cloud, no backup, no rescue file', async () => {
    const cloud = makeCloud();
    const device = phone('d_cloud', 'v186');
    device.Sync.connect(cloud.adapter);
    const synced = await settleUntil(() => device.Sync.status === 'synced' && device.Sync.pendingCount() === 0, 5000);
    given('the phone is connected and has sent its record', synced, device.Sync.status);
    const attempts = cloud.attempts.length;
    const doc = JSON.stringify(cloud.doc);

    device.call('whatsNewBoot');
    device.call('whatsNewMarkSeen');
    await settle(TICK * 20);
    same('the cloud was not written to', cloud.attempts.length, attempts);
    same('and holds the document it held', JSON.stringify(cloud.doc), doc);

    // The control, so the silence above is about this feature and not a dead connection.
    device.State.commit(device.call('assignPlace', device.State.schedule, DAY, 'w_02', 'actual', 'p_01'));
    const travelled = await settleUntil(() => cloud.attempts.length > attempts, 5000);
    check('while an ordinary edit on the same phone still goes to the cloud', travelled, String(cloud.attempts.length - attempts));

    device.call('exportBackup');
    const backup = device.downloads[device.downloads.length - 1];
    given('the backup file was handed over', Boolean(backup && backup.text && /\.json$/.test(backup.name)), JSON.stringify(backup && backup.name));
    same('the backup is the record and only the record', JSON.parse(backup.text), JSON.parse(JSON.stringify(device.State.schedule)));
    check('with nothing of the note in it', !backup.text.includes(KEY) && !backup.text.includes('WhatsNew'));

    device.call('exportRecoveryData');
    const rescue = device.downloads[device.downloads.length - 1];
    given('the rescue file was handed over', Boolean(rescue && rescue.text && rescue.text.includes('farkad-recovery')), JSON.stringify(rescue && rescue.name));
    check('and the rescue file does not carry it either', !rescue.text.includes(KEY) && !rescue.text.includes('WhatsNew'));
    check('it is still on this phone', kept(device).build === 'v186');
});

await block('a disk that refuses the note costs the note and nothing else', async () => {
    const device = phone('d_full', 'v186');
    device.Store.set('scheduleData:snap:2026-11-01', JSON.stringify(device.State.schedule));
    given('there is a restore point a full disk could be tempted to spend',
        device.raw('scheduleData:snap:2026-11-01') !== null && typeof device.Store.reclaim === 'function');
    device.setQuota(key => key === KEY);
    same('a write the disk refuses is reported, not believed', device.call('whatsNewMarkSeen'), false);
    same('nothing is on the disk', device.raw(KEY), null);
    same('this session still knows it was seen: the line does not come back while the app is open', owed(device), []);
    check('no restore point was spent making room for it', device.raw('scheduleData:snap:2026-11-01') !== null);
    check('nor was the record touched', device.raw('scheduleData:v2') !== null
        && JSON.parse(device.raw('scheduleData:v2')).days[DAY].actual.w_01.entries.length === 1);
    same('after a restart it is simply offered again', owed(reopen(device, 'v186')), upTo(186));
});

await block('the news itself: every build, every item, every word', async () => {
    const device = phone('d_words', 'v186');
    const builds = plain(device.global('WHATSNEW_BUILDS'));
    same('the builds the block has, newest first', builds.map(entry => entry.build), BUILDS);
    const numbers = builds.map(entry => device.call('whatsNewNumber', entry.build));
    check('every one is a build, and each is older than the one above it',
        numbers.every(Number.isInteger) && numbers.every((n, i) => i === 0 || n < numbers[i - 1]), JSON.stringify(numbers));
    EXPECTED.forEach((expected, index) => {
        same(`${expected.build}: its items, word for word`, builds[index] && builds[index].items, expected.items);
    });
    same('and no build beyond those', builds.length, EXPECTED.length);

    const items = builds.flatMap(entry => entry.items.map(item => ({ build: entry.build, ...item })));
    const ways = Object.keys(device.global('WHATSNEW_GO')).sort();
    same('the ways «הראה לי» can go', ways, ['advances', 'backup', 'day', 'dayCheck', 'dayFoot', 'display', 'find', 'payReport', 'payslipsMenu', 'reportsMenu', 'rides', 'roster', 'share', 'version', 'week']);
    check('every item is a title, a sentence and a place, and nothing else',
        items.every(item => Object.keys(item).every(key => ['build', 'title', 'text', 'where', 'go'].includes(key))
            && [item.title, item.text, item.where].every(value => typeof value === 'string' && value.trim() === value && value.length > 0)));
    const sentences = items.filter(item => !(item.text.endsWith('.') && item.text.split('.').length === 2));
    check('each text is ONE sentence: it ends in its only full stop', sentences.length === 0, sentences.map(item => item.title).join(' | '));
    const long = items.filter(item => item.text.length > 120 || item.title.length > 40);
    check('short enough to read in ten seconds: a title of 40 characters, a sentence of 120', long.length === 0,
        long.map(item => `${item.title} (${item.text.length})`).join(' | '));
    check('every «הראה לי» names a way the file has', items.every(item => item.go === undefined || ways.includes(item.go)));
    check('and every way is used by some item', ways.every(way => items.some(item => item.go === way)));
    check('the block and every item in it are frozen: a screen cannot change the news',
        device.call('eval', 'Object.isFrozen(WHATSNEW_BUILDS) && WHATSNEW_BUILDS.every(e => Object.isFrozen(e) && Object.isFrozen(e.items) && e.items.every(Object.isFrozen))') === true);
    const words = JSON.stringify(builds);
    check('no word of it says that anything was «נשלח»', !words.includes('נשלח'));
});

await block('every word of the line and the card, and no other', async () => {
    const T = phone('d_text', 'v186').global('WHATSNEW_TEXT');
    same('the block holds exactly these words', Object.keys(T).sort(),
        ['all', 'build', 'close', 'line', 'none', 'open', 'show', 'since', 'title', 'where'].sort());
    same('the quiet line', T.line, '🆕 יש חדש באפליקציה');
    same('its button, and the row in ⋯', T.open, 'מה חדש');
    same('the card\'s title', T.title, 'מה חדש');
    same('under it, from the line', T.since, 'מה שנוסף מאז העדכון האחרון שראית, מהחדש לישן.');
    same('under it, from ⋯', T.all, 'כל מה שנוסף לאחרונה, מהחדש לישן.');
    same('with nothing to list', T.none, 'אין חדש להציג.');
    same('a build\'s heading', T.build('v186'), 'גרסה v186');
    same('where a thing is', T.where('שבוע'), 'איפה: שבוע');
    same('the button that goes there', T.show, 'הראה לי');
    same('close - the app\'s own word', T.close, 'סגור');

    const code = WHATSNEW.replace(/\/\/.*$/gm, '');
    check('the file calls none of the three dialogs the app forbids', !/\b(alert|confirm|prompt)\s*\(/.test(code));
    check('nor writes markup from a string', !/innerHTML|insertAdjacentHTML|outerHTML/.test(code));
    check('nor touches the record\'s writers', !/State\.(commit|commitMany|save|persist)\b|FarkadSync\./.test(code));
    // v191: «תצוגה גדולה» is a per-phone switch too - shown by its «הראה לי», never pressed.
    check('nor turns a per-phone switch on, nor starts a journey or a seder run',
        !/transportSetEnabled|displaySetLarge|journeyStart|journeyGo|sederMarkOpened|FarkadReminders\.enable/.test(code));
    check('nor opens a reading of money for a period by itself, nor a payslip run',
        !/openMonthSummary|openPayslips|payslipsMarkOpened|openWorkerCard/.test(code));
    same('it writes one key and only through Store, optional', [(code.match(/Store\.set\(/g) || []).length,
        /Store\.set\(WHATSNEW_KEY,[^;]*\{ optional: true \}\)/.test(code), /localStorage/.test(code)], [1, true, false]);
    same('whose name is', phone('d_key', 'v186').global('WHATSNEW_KEY'), KEY);
});

// ================================================================== the guard for the next release
//
// THE NEXT RELEASE MUST NOT FORGET ITS LINE. The rule is a pure function of three things -
// the build js/app.js declares, the builds the block has, and docs/releases.md - so it is
// first proved on written inputs (an instrument is not believed before it is made to fire),
// and then asked about the real three.
await block('the guard: a release that was written up has its line here', async () => {
    const device = phone('d_guard', 'v186');
    const guard = (app, builds, releases) => plain(device.call('whatsNewGuard', app, builds.map(build => ({ build })), releases));
    const notes = '## v190 — something new (served)\n\ntext\n\n## v189 — the one before\n';
    same('the running build has an entry', guard('v189', ['v189', 'v186'], notes), { state: 'listed', build: 'v189', newest: 'v189' });
    same('it has none, and the release notes have written it up: MISSING',
        guard('v190', ['v189', 'v186'], notes), { state: 'missing', build: 'v190', newest: 'v189' });
    same('it has none and no release entry either: nothing is claimed yet',
        guard('v191', ['v189', 'v186'], notes), { state: 'unwritten', build: 'v191', newest: 'v189' });
    same('the block is AHEAD of the running build - a branch whose stamps have not moved',
        guard('v189', ['v190', 'v189'], notes), { state: 'ahead', build: 'v189', newest: 'v190' });
    same('ahead even when the running build has no entry of its own', guard('v188', ['v190'], notes).state, 'ahead');
    same('a heading that only mentions the build inside another number does not count',
        guard('v19', ['v18'], notes).state, 'unwritten');
    same('a candidate heading counts: it is a release entry', guard('v105', ['v104'], '## CANDIDATE — v105 — two phones\n').state, 'missing');
    same('a stamp that is not a build is never "fine"', guard('dev', ['v186'], notes).state, 'missing');

    // The real three.
    const stamp = (/const APP_VERSION = '([^']+)'/.exec(APP) || [])[1] || '';
    given('js/app.js declares a build and docs/releases.md was read', /^v\d+$/.test(stamp) && RELEASES.length > 1000, stamp);
    const real = plain(device.call('whatsNewGuard', stamp, device.global('WHATSNEW_BUILDS'), RELEASES));
    if (real.state === 'ahead') {
        // NOT SILENT, and not a pass that reads like a measurement.
        console.log(`  SKIP  the release guard was NOT run: js/app.js is on ${real.build} and the newest entry in js/ui/whatsnew.js is `
            + `${real.newest} - the three stamps have not moved to it yet. It runs by itself once they do.`);
    } else if (real.state === 'unwritten') {
        console.log(`  SKIP  the release guard has nothing to hold ${real.build} to: it has no entry in js/ui/whatsnew.js and no `
            + 'heading in docs/releases.md either. It fails the moment the release is written up without its line here.');
    } else {
        check(`the build that is running (${real.build}) has its «מה חדש» entry`, real.state === 'listed',
            `docs/releases.md has an entry for ${real.build} and js/ui/whatsnew.js has none. Add `
            + `{ build: '${real.build}', items: [{ title, text, where, go? }] } at the TOP of WHATSNEW_BUILDS in js/ui/whatsnew.js `
            + `(one plain Hebrew sentence per item; items: [] if the build changes nothing a foreman would see), `
            + `and the same entry at the top of EXPECTED in tests/whatsnew.test.mjs.`);
    }
    // Whatever the stamps say, the running build is never shown news written for a later one.
    const now = device.call('whatsNewNumber', stamp);
    check('on the build js/app.js declares, nothing newer than it is offered',
        device.call('whatsNewSince', null, now).every(entry => device.call('whatsNewNumber', entry.build) <= now));
});

report();
