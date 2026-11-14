// מה חדש: what changed in the app, and where it is - told once, quietly, after an update.
//
// Thirteen builds reached the three phones in two days (v174-v186) and nobody was told
// what any of them changed or where to find it. A feature nobody knows about is a feature
// that does not exist, and a rule nobody was told («every phone updates before the first
// count is typed») is a rule that will be broken. So:
//
//   - AFTER A PHONE STARTS ON A BUILD NEWER THAN THE LAST ONE WHOSE NEWS IT HAS SEEN, one
//     quiet line appears in the banner area under the top bar - where «גרסה חדשה זמינה»
//     stood a moment before the update - with one button. It is not a dialog, it covers
//     nothing and stops nothing, and it is never put up under somebody's hands: while
//     something is being typed or a dialog is open (midEdit, js/ui/offline.js) it waits.
//   - THE BUTTON OPENS A CARD: everything since the build this phone last saw, newest
//     first. Each item is a title, ONE plain sentence, WHERE it is in the app's own words,
//     and for most a «הראה לי» button that goes there.
//   - CLOSING THE CARD - OR THE LINE - IS HAVING SEEN IT: the line does not come back until
//     the next build that has something to tell. A line that returns every morning is how
//     a line stops being read (js/ui/install.js says the same of its own).
//   - ALWAYS REACHABLE LATER: ⋯ ← מכשיר ועזרה ← עדכון וגרסה ← «מה חדש» lists everything this
//     build knows, seen or not.
//   - A FIRST INSTALL IS TOLD NOTHING. A phone with no crew and no note of ever having seen
//     news is a new phone: there is no "new" for somebody to whom all of it is new. It is
//     noted as having seen this build, silently, and hears about the next one.
//
// «הראה לי» ONLY NAVIGATES. Each one closes the card and calls a screen's own opener - the
// tab, the settings sheet, the day's check, the הסעות screen. None changes the record,
// none starts anything, and NONE TURNS A PER-PHONE SWITCH ON: on a phone where הסעות is
// off, the rides' items lead to the row in ⋯ where the owner turns it on himself.
//
// WHAT THIS PHONE HAS SEEN IS A PREFERENCE, NOT A RECORD: one key of its own through
// Store, written optional like the seder's progress - never in the schedule, so never in
// the outbox, the cloud, a backup or a restore point, and the rescue file takes named
// records only (js/recovery.js). A value that will not read is "nothing seen": on a phone
// with a crew the whole list is offered once more, which costs one tap; nobody's work is
// in it.
//
// FOR WHOEVER CUTS THE NEXT RELEASE: add the build's items to WHATSNEW_BUILDS below, at
// the TOP, in the same commit that moves the three stamps - tests/whatsnew.test.mjs fails
// when APP_VERSION has a release entry in docs/releases.md and no entry here. A build with
// nothing a foreman would notice gets `items: []`, on purpose and in writing.

// ================================================================== THE WORDS
//
// EVERY HEBREW STRING THIS FEATURE ADDS, AND NOTHING ELSE, IN THE TWO BLOCKS BELOW.
// PROPOSED, NOT APPROVED: the owner corrects on sight. Hebrew strings are product decisions
// (CLAUDE.md, law 6): tests/whatsnew.test.mjs pins every one, word for word, and changing
// one here moves the pinned line there in the same commit.
//
// «סגור» is the word every other dialog and banner of the app closes with; «גרסה» is the
// settings sheet's own («עדכון וגרסה»). The paths under `where` are spelled with the names
// the screens themselves carry - the tab, the button, the row - joined by the arrow the
// app already uses for a path («הגדרות ← כללי ← הסעות», js/ui/journey.js).
const WHATSNEW_TEXT = Object.freeze({
    // --- the quiet line, and the button on it
    line: '🆕 יש חדש באפליקציה',
    open: 'מה חדש',
    // --- the card
    title: 'מה חדש',
    since: 'מה שנוסף מאז העדכון האחרון שראית, מהחדש לישן.',
    all: 'כל מה שנוסף לאחרונה, מהחדש לישן.',
    none: 'אין חדש להציג.',
    build: version => `גרסה ${version}`,
    where: path => `איפה: ${path}`,
    show: 'הראה לי',
    close: 'סגור'
});

// THE NEWS, ONE DATA BLOCK. Newest build first. Per item: `title`, ONE sentence (`text`),
// `where` (the path, without the «איפה:»), and optionally `go` - a key of WHATSNEW_GO.
//
// Written from docs/releases.md for a foreman who reads it in ten seconds: what he will
// SEE, never how it is built. A build with nothing he would notice (v175-v178, v185 - the
// shared rides shipped shut) has no entry. «מה חדש» itself is not an item: it is the thing
// he is reading.
const WHATSNEW_BUILDS = Object.freeze([
    { build: 'v197', items: [
        { title: 'סגירת שבוע',
            text: 'כל העובדים שהתקופה שלהם הסתיימה נסגרים בפעם אחת: הניכוי כבר ממולא ואפשר לשנות אותו, ושום דבר לא נסגר לפני הסיכום.',
            where: 'דוחות ← לפי עובד ← סגירת שבוע', go: 'payReport' }
    ] },
    { build: 'v196', items: [
        { title: 'דוחות נפתחים מהר יותר',
            text: 'עמוד הדוחות ועמוד המקדמות נפתחים הרבה יותר מהר, וכל הסכומים בהם נשארו בדיוק כמו שהיו.',
            where: 'דוחות ← לפי עובד', go: 'payReport' }
    ] },
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
    // v193: repairs found by an audit of v192 - nothing a foreman would see on a screen.
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
].map(entry => Object.freeze({ build: entry.build, items: Object.freeze(entry.items.map(item => Object.freeze(item))) })));

// ================================================================== the readings
//
// PURE, every one: builds and numbers in, a plain answer out. tests/whatsnew.test.mjs asks
// them across builds.

// 'v186' -> 186. Anything else is no build at all.
function whatsNewNumber(build) {
    const found = /^v(\d{1,5})$/.exec(typeof build === 'string' ? build : '');
    return found ? Number(found[1]) : null;
}

// The entries a phone that last saw build number `seen` is owed on build number `current`:
// newer than what it saw, and not newer than what it is running - an entry written ahead
// of its build is not news yet. Newest first, as the block is written.
function whatsNewSince(seen, current) {
    if (!Number.isInteger(current)) return [];
    const from = Number.isInteger(seen) ? seen : 0;
    return WHATSNEW_BUILDS.filter(entry => {
        const n = whatsNewNumber(entry.build);
        return n !== null && n > from && n <= current && entry.items.length > 0;
    });
}

// What the release must not forget. PURE: the build that is running, the builds this block
// has, and the text of docs/releases.md in; one of four answers out -
//   'ahead'   the block already holds an entry NEWER than the running build: the stamps
//             have not moved to it yet (a feature branch), and there is nothing to check;
//   'listed'  the running build has its entry;
//   'missing' it has none, and docs/releases.md has a heading for it - the release was
//             written up and its line here was forgotten;
//   'unwritten' it has none and no release entry either: nothing is claimed yet.
function whatsNewGuard(appVersion, builds, releases) {
    const current = whatsNewNumber(appVersion);
    const listed = (builds || []).map(entry => whatsNewNumber(entry && entry.build)).filter(Number.isInteger);
    if (current === null) return { state: 'missing', build: String(appVersion), newest: null };
    const newest = listed.length > 0 ? Math.max(...listed) : null;
    const answer = state => ({ state, build: `v${current}`, newest: newest === null ? null : `v${newest}` });
    if (newest !== null && newest > current) return answer('ahead');
    if (listed.includes(current)) return answer('listed');
    const heading = new RegExp(`^##[^\\n]*\\bv${current}\\b`, 'm');
    return answer(heading.test(String(releases || '')) ? 'missing' : 'unwritten');
}

// ================================================================== what this phone has seen
//
// One key:  { "version": 1, "build": "v186" }
//
// A PREFERENCE (the top of this file). Written OPTIONAL: on a full disk this must never
// spend a restore point to make room for itself. A write the disk refused is still held
// for this session, so the line does not come back while the app stays open.
const WHATSNEW_KEY = 'farkadWhatsNewSeen';

let whatsNewMemory;         // undefined until read; then the build number seen, or null
let whatsNewMode = 'new';   // what the open card lists: 'new' (since seen) or 'all'
let whatsNewWaiting = null; // the timer that offers the line again once nobody is typing

// Read leniently, validated strictly: anything that is not exactly this is nothing seen.
function whatsNewParse(raw) {
    let parsed = null;
    try {
        parsed = raw ? JSON.parse(raw) : null;
    } catch (error) {
        parsed = null;
    }
    if (!isPlainObject(parsed) || parsed.version !== 1) return null;
    return whatsNewNumber(parsed.build);
}

function whatsNewSeen() {
    if (whatsNewMemory === undefined) {
        let raw = null;
        try { raw = Store.get(WHATSNEW_KEY); } catch (error) { raw = null; }
        whatsNewMemory = whatsNewParse(raw);
    }
    return whatsNewMemory;
}

function whatsNewCurrent() {
    return whatsNewNumber(typeof APP_VERSION === 'string' ? APP_VERSION : '');
}

// This build's news is seen. NEVER LOWERED: an older build opened after a newer one (a
// second window that has not caught up yet) must not make the newer one's news new again.
function whatsNewMarkSeen() {
    const current = whatsNewCurrent();
    if (current === null) return false;
    const seen = whatsNewSeen();
    if (Number.isInteger(seen) && seen >= current) return true;
    whatsNewMemory = current;
    try {
        return Store.set(WHATSNEW_KEY, JSON.stringify({ version: 1, build: `v${current}` }), { optional: true }) === true;
    } catch (error) {
        return false;
    }
}

// What this phone has not been told yet. Asked with the crew as it stands: `hasCrew` is
// install.js's own notion of "there is something here" (a phone with nobody on it is new).
//   { firstInstall: true }  - nothing seen and nobody on the phone: tell nothing, note it
//   { news: [entries] }     - what the line is for; empty when there is nothing to tell
function whatsNewRead(seen, current, hasCrew) {
    if (!Number.isInteger(seen) && !hasCrew) return { firstInstall: true, news: [] };
    return { firstInstall: false, news: whatsNewSince(seen, current) };
}

function whatsNewPending() {
    const hasCrew = typeof State !== 'undefined' && State.schedule && Array.isArray(State.schedule.workers)
        && State.schedule.workers.length > 0;
    return whatsNewRead(whatsNewSeen(), whatsNewCurrent(), hasCrew);
}

// ================================================================== the quiet line

function whatsNewBusy() {
    return typeof midEdit === 'function' ? Boolean(midEdit()) : false;
}

// At boot (js/app.js), after the first draw and after anything the boot itself reopens.
// A first install is noted and told nothing. Otherwise, with something to tell, the line
// is put up - now, or at the first moment nobody is in the middle of something. The
// answer is the DECISION ('first', 'none', 'news'), whatever the page then drew.
function whatsNewBoot() {
    const read = whatsNewPending();
    if (read.firstInstall) {
        whatsNewMarkSeen();
        return 'first';
    }
    if (read.news.length === 0) return 'none';
    whatsNewOffer();
    return 'news';
}

function whatsNewOffer() {
    if (whatsNewWaiting) { clearTimeout(whatsNewWaiting); whatsNewWaiting = null; }
    if (whatsNewPending().news.length === 0) return false;
    if (whatsNewBusy()) {
        // Not under somebody's hands: the banner area is above the list, and a line that
        // appears there moves everything under a finger that is about to land.
        whatsNewWaiting = setTimeout(whatsNewOffer, 1500);
        return false;
    }
    return whatsNewShowLine();
}

function whatsNewShowLine() {
    const banner = typeof document !== 'undefined' && document.getElementById ? document.getElementById('whatsNewBanner') : null;
    if (!banner) return false;
    const T = WHATSNEW_TEXT;
    clear(banner);
    banner.appendChild(el('span', null, T.line));
    const open = button(T.open, 'btn-secondary', () => openWhatsNew('new'));
    open.id = 'whatsNewOpen';
    banner.appendChild(open);
    // Put away without reading is still "I was told": it is in ⋯ whenever he wants it.
    const away = button('✕', 'btn-icon', () => { whatsNewMarkSeen(); whatsNewHideLine(); }, T.close);
    away.id = 'whatsNewDismiss';
    banner.appendChild(away);
    banner.style.display = '';
    return true;
}

function whatsNewHideLine() {
    if (whatsNewWaiting) { clearTimeout(whatsNewWaiting); whatsNewWaiting = null; }
    const banner = typeof document !== 'undefined' && document.getElementById ? document.getElementById('whatsNewBanner') : null;
    if (banner) banner.style.display = 'none';
}

// ================================================================== the card

function whatsNewParts() {
    const get = id => document.getElementById(id);
    return { modal: get('whatsNewModal'), title: get('whatsNewTitle'), context: get('whatsNewContext'),
        list: get('whatsNewList'), close: get('whatsNewClose') };
}

function whatsNewIsOpen() {
    const modal = typeof document !== 'undefined' && document.getElementById ? document.getElementById('whatsNewModal') : null;
    return Boolean(modal && modal.style.display === 'flex');
}

// 'new' - from the line: what this phone has not seen. 'all' - from ⋯: everything this
// build knows of, seen or not (never an entry written ahead of the running build).
function whatsNewEntries(mode) {
    return mode === 'all' ? whatsNewSince(0, whatsNewCurrent()) : whatsNewPending().news;
}

function openWhatsNew(mode) {
    const parts = whatsNewParts();
    if (!parts.modal || !parts.list) return false;
    whatsNewMode = mode === 'all' ? 'all' : 'new';
    const T = WHATSNEW_TEXT;
    const entries = whatsNewEntries(whatsNewMode);
    parts.title.textContent = T.title;
    parts.context.textContent = entries.length === 0 ? T.none : (whatsNewMode === 'all' ? T.all : T.since);
    parts.close.textContent = T.close;
    clear(parts.list);
    entries.forEach(entry => {
        const group = el('section', 'whatsnew-build');
        group.dataset.build = entry.build;
        group.appendChild(el('h4', 'whatsnew-build-name', T.build(entry.build)));
        entry.items.forEach((item, index) => {
            const row = el('div', 'whatsnew-item');
            row.appendChild(el('p', 'whatsnew-item-title', item.title));
            row.appendChild(el('p', 'whatsnew-item-text', item.text));
            row.appendChild(el('p', 'whatsnew-item-where', T.where(item.where)));
            if (item.go && typeof WHATSNEW_GO[item.go] === 'function') {
                const show = button(T.show, 'btn-secondary whatsnew-show', () => whatsNewGo(item.go));
                show.dataset.go = item.go;
                show.dataset.item = `${entry.build}:${index}`;
                // Six buttons that all say «הראה לי» are six of the same thing to a screen
                // reader: each is named with the thing it shows.
                show.setAttribute('aria-label', `${T.show}: ${item.title}`);
                row.appendChild(show);
            }
            group.appendChild(row);
        });
        parts.list.appendChild(group);
    });
    parts.modal.style.display = 'flex';
    const content = parts.modal.querySelector('.modal-content');
    if (content) content.scrollTop = 0;
    // Entered at its heading, like every dialog that has one (js/ui/modal.js).
    void parts.modal.offsetHeight;
    if (parts.title && parts.title.focus) parts.title.focus({ preventScroll: true });
    return true;
}

// Closed is seen - by its button, by Escape, by the backdrop, or on the way to «הראה לי».
function closeWhatsNew() {
    const modal = typeof document !== 'undefined' && document.getElementById ? document.getElementById('whatsNewModal') : null;
    if (!modal || modal.style.display !== 'flex') return;
    modal.style.display = 'none';
    whatsNewMarkSeen();
    whatsNewHideLine();
}

// ================================================================== «הראה לי»
//
// NAVIGATION ONLY, each through the screen's own opener. Nothing here writes the record,
// starts a journey, or turns הסעות on.
function whatsNewSettings(foldId, sectionId) {
    if (typeof openSettings !== 'function') return false;
    openSettings();
    if (foldId && typeof openSettingsFold === 'function') openSettingsFold(foldId);
    if (sectionId && typeof settingsJump === 'function') settingsJump(sectionId);
    const fold = foldId ? document.getElementById(foldId) : null;
    if (fold && fold.scrollIntoView) fold.scrollIntoView({ block: 'center', behavior: 'instant' });
    return true;
}

function whatsNewDay() {
    if (typeof showView === 'function') showView('day');
    return true;
}

// The reports screen, its «הפקת דוח» menu opened and brought onto the glass. `workers`
// first puts the screen on «לפי עובד» - the two-button switch at its top, which is kept in
// memory only (REPORT_SECTION, js/ui/reports.js) and is the same as pressing it.
function whatsNewReportsMenu(workers) {
    if (workers && typeof REPORT_SECTION !== 'undefined' && REPORT_SECTION !== 'workers') REPORT_SECTION = 'workers';
    showView('reports');
    const menu = document.querySelector('#reportsView details.report-output-actions');
    if (!menu) return false;
    menu.open = true;
    const trigger = menu.querySelector('summary');
    menu.scrollIntoView({ block: 'center', behavior: 'instant' });
    if (trigger && trigger.focus) trigger.focus({ preventScroll: true });
    return true;
}

const WHATSNEW_GO = Object.freeze({
    day: () => whatsNewDay(),
    // The foot of the day's list: brought onto the glass and given the keyboard. Not
    // pressed - starting a journey is his tap, not this one.
    dayFoot: () => {
        whatsNewDay();
        // On a short screen the journey's button is not drawn there (css/design.css says
        // why) and the foot is «בדיקת היום»: he is still brought to the foot.
        const entry = ['journeyDayEntry', 'dayCheckEntry'].map(id => document.getElementById(id))
            .find(node => node && node.offsetParent !== null);
        if (!entry) return false;
        entry.scrollIntoView({ block: 'center', behavior: 'instant' });
        entry.focus({ preventScroll: true });
        return true;
    },
    dayCheck: () => { whatsNewDay(); return typeof openDayCheck === 'function' ? openDayCheck() : false; },
    // The WhatsApp dialog, where the rows of the seder, of הסעות and of the journey are.
    share: () => { whatsNewDay(); if (typeof showDayMessage === 'function') showDayMessage(); return true; },
    roster: () => { showView('roster'); return true; },
    // The reports screen with its «הפקת דוח» menu OPEN, the rows it holds on the glass. The
    // row itself is not pressed: «סיכום חודש» and «תלוש לכל עובד» each open a reading of
    // money for a period, and which period is his to choose.
    reportsMenu: () => whatsNewReportsMenu(false),
    // The pay sheet itself, on «לפי עובד», as it opens - nothing on it pressed, and the range
    // left wherever he had it (v189: the groups in their own periods are what he is shown).
    payReport: () => {
        if (typeof REPORT_SECTION !== 'undefined' && REPORT_SECTION !== 'workers') REPORT_SECTION = 'workers';
        showView('reports');
        return true;
    },
    // The same, on «לפי עובד» - the only side of the reports whose menu has the payslips' row.
    payslipsMenu: () => whatsNewReportsMenu(true),
    // «חיפוש עובד»: its dialog over the day, empty, the field waiting. It finds and writes nothing.
    find: () => { whatsNewDay(); return typeof openFind === 'function' ? openFind() : false; },
    advances: () => { showView('advances'); return true; },
    week: () => { showView('week'); return true; },
    backup: () => whatsNewSettings('settingsFoldBackup', 'settingsBackups'),
    version: () => whatsNewSettings('settingsFoldUpdate', 'settingsHelp'),
    // THE הסעות SCREEN, ON A PHONE THAT TURNED IT ON - for the day on the screen. On a
    // phone that did not, the row in ⋯ where it is turned on, shown and not pressed: that
    // switch is the owner's, per phone (js/ui/transport.js).
    rides: () => {
        if (typeof transportEnabled === 'function' && transportEnabled() && typeof openTransport === 'function') {
            whatsNewDay();
            return openTransport(State.date);
        }
        return whatsNewSettings('transportSwitchCard', 'settingsDaily');
    },
    // v191: «תצוגה גדולה» - the row in ⋯ where it is turned on, opened and shown, and NOT
    // pressed. The mode is one man's choice for his own phone (js/ui/display.js): being told
    // about it is no reason for anybody's screen to change size.
    display: () => whatsNewSettings('displayLargeCard', 'settingsDaily')
});

// The card steps aside first (which is also "seen"), and the settings sheet with it when
// that is where the card was opened from: one layer at a time. Then, a task later - after
// js/ui/modal.js has given the focus back for the dialog that just closed, which it does
// from an observer at the end of this task - the screen is opened and takes the keyboard.
function whatsNewGo(key) {
    const go = WHATSNEW_GO[key];
    if (typeof go !== 'function') return false;
    closeWhatsNew();
    const settings = typeof document !== 'undefined' ? document.getElementById('settingsPanel') : null;
    if (settings && settings.classList.contains('open') && typeof closeSettings === 'function') closeSettings();
    setTimeout(() => {
        try { go(); } catch (error) {
            if (typeof console !== 'undefined' && console.warn) console.warn('whatsnew: could not show', key, error);
        }
    }, 0);
    return true;
}

// ================================================================== at load
//
// The row in ⋯ carries one of the words above, so its label is written here and not in
// index.html. Never allowed to throw into the boot.
try {
    if (typeof document !== 'undefined' && document.getElementById) {
        const row = document.getElementById('whatsNewRow');
        if (row) row.textContent = WHATSNEW_TEXT.open;
    }
} catch (error) {
    if (typeof console !== 'undefined' && console.warn) console.warn('whatsnew: the row was not labelled', error);
}
