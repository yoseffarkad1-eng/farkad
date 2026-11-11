// בניית סידור: the evening's seder as ONE journey of five stations, from who works where
// to the message each driver gets.
//
// The owner, 2026-11-10: "Focus on building the seder. I want a complete loop: we start
// from distributing the workers, then move to the cars - the whole thing as one journey,
// so I have something complete, with nothing left to chance." He builds it in the evening
// for TOMORROW, and at the sending step HE chooses what goes - mostly only the drivers.
//
// Every piece of that already existed and none of them knew about the others: the day
// screen, the WhatsApp dialog, the seder to each worker, the הסעות screen and its summary.
// What was missing is the thing that says what is left. So THIS FILE BUILDS NO SECOND
// EDITOR AND WRITES NO DAY. It is a frame around the screens that exist:
//
//   1  שיבוץ לאתרים  - the day screen itself, on the journey's date, with the journey's
//                      row riding in the day's own dock: where he is, how many men are
//                      placed and how many are not, and the one button onward. Every
//                      record written here is written by the day screen's own code.
//   2  בדיקה         - what the day still lacks. js/ui/daycheck.js is asked when it is
//                      there (typeof guards - it is built on another branch); when it is
//                      not, this file's own short reading. Nothing here blocks the way on.
//   3  הסעות         - the הסעות screen itself (openTransport), with the journey's bar
//                      inside its panel. ON A PHONE THAT DID NOT TURN הסעות ON THIS
//                      STATION IS SKIPPED, with one sentence saying where it is turned on.
//                      The journey never turns it on: that switch is the owner's, per
//                      phone (js/ui/transport.js).
//   4  מבט אחרון     - one page that only reads: the day's message and the summary of the
//                      rides, by the builders that already compose them (dayMessage,
//                      transportSummaryBlocks). Not a second composition, so it cannot
//                      disagree with what is sent.
//   5  שליחה         - three groups and none of them is a duty: a door to each DRIVER
//                      first (transportDoor - the link the vehicle's own card carries),
//                      the seder to each worker (openSederList), the day's message and the
//                      rides' summary (showDayMessage, shareTextOut). Each opens WhatsApp
//                      by his own tap. The app sends nothing, and nothing here says «נשלח»:
//                      the only marks are the ones those screens already keep - «נפתח
//                      בוואטסאפ», believed only while the message is the one it was made on.
//
// WHERE HE IS, AND NOTHING ELSE, IS KEPT - the date and the station, under one key of its
// own through Store, the way the seder keeps its progress: never in the record, so never
// in the outbox, the cloud, a backup or a restore point, and the rescue file takes named
// records only (js/recovery.js). A value that will not read is no journey, and the next
// one starts from the first station: nobody's work is in it. Everything that IS somebody's
// work - the day, the seats, the seder's marks - is kept by the screen that made it, so a
// journey started again loses nothing but its place.
//
// A CHANGE UNDER THE PLAN IS SHOWN, NEVER REPAIRED. A man moved to another site, or taken
// off the day, after he was given a seat stays in that seat (TransportEngine.layout says
// why): station 3's bar counts him, the strip marks that station as having something left,
// and the last look names him in the words the vehicle's own card uses.
//
// TWO WAYS IN, and they are the same door (journeyStart). The row in the WhatsApp dialog
// (#shareModal), under the seder's and הסעות's rows, is v184's. Since the second pass there
// is also ONE button at the FOOT of the day's list, above «בדיקת היום» (journeyDayEntry,
// asked for by js/ui/day.js): the owner asked for this as his main evening tool and it was
// two taps deep in a dialog about something else. The foot, and not the header or the dock:
// those two are measured to the pixel (tests/mobile.test.mjs, tests/design.browser.mjs -
// eleven whole names at 440x956), and the foot is under the last name. It says the day it
// will open on, and while a journey he left is still his (JOURNEY_RESUME_MS) it says where
// he is in it instead. With the journey's own row in the dock it is not drawn at all, and
// on a screen under 580px tall the stylesheet does not show it (css/design.css: there the
// last man of the list must stay reachable at the list's end, and one more row costs him).
//
// THE SECOND PASS, the rest of it (each measured in tests/journey.browser.mjs):
//   - at station 1 the dock's «שליחה לוואטסאפ» is put away (css/design.css) - sending is
//     station 5 - and «מהיום הקודם» stays: copying the last day is how a seder is begun;
//   - a driver whose message was opened is named again in the workers' group at station 5
//     with that same mark, so nobody messages him twice without meaning to - he is not
//     taken off the seder's list, that choice is the owner's;
//   - the rides' summary at station 5 opens the summary's own dialog (openTransportSummary)
//     to be read first, where it used to go straight to the share sheet;
//   - with nothing left to do on the rides the journey's bar there says nothing: the
//     screen's own line already says «כל העובדים משובצים», and twice is noise.

// ================================================================== THE WORDS
//
// EVERY HEBREW STRING THIS FEATURE ADDS, AND NOTHING ELSE, IN ONE BLOCK. PROPOSED, NOT
// APPROVED: the owner corrects on sight. Hebrew strings are product decisions (CLAUDE.md,
// law 6): tests/journey.test.mjs pins every one, word for word, and changing one here
// moves the pinned line there in the same commit.
//
// What is NOT here is borrowed, on purpose, so a thing reads the same wherever it is met:
// «כל העובדים משובצים», «אין ביום הזה עובדים עם אתר עבודה.», «בלי נהג», «פתיחה בוואטסאפ»,
// «נפתח בוואטסאפ», «אין מספר טלפון תקין», «… משובץ ברכב אבל אין לו אתר ברישום היום» and
// «סיכום הסעות ליום» are TRANSPORT_TEXT's; «👷 לכל עובד בנפרד», the count of workers and
// «נפתחו N מתוך M» are SEDER_TEXT's. A name in a template is already isolated by the caller.
const JOURNEY_TEXT = Object.freeze({
    // --- the way in: a row in the WhatsApp dialog; and the frame's own title
    entry: 'בניית סידור',
    title: 'בניית סידור',
    // «שיבוץ» is the app's own word for putting a man somewhere («שיבוץ לרכבים», «אין
    // שיבוצים ליום הזה»); «הסעות» is the screen's own name.
    stations: Object.freeze(['שיבוץ לאתרים', 'בדיקה', 'הסעות', 'מבט אחרון', 'שליחה']),
    stepOf: (n, name) => `שלב ${n} מתוך 5 · ${name}`,
    forDay: (day, date) => `סידור ל${day} ${date}`,
    // what a station's mark on the strip means, read aloud after its name
    pipDone: 'נעשה',
    pipOpen: 'נשאר מה להשלים',
    pipSkipped: 'מדולג',
    next: name => `המשך: ${name}`,
    back: 'חזרה',
    leave: 'יציאה',
    finish: 'סיום',
    notKept: 'המקום בבניית הסידור לא נשמר במכשיר. אם האפליקציה תיסגר, מתחילים מהשלב הראשון.',
    // --- the button at the foot of the day's list: the day a new journey opens on -
    // «בניית סידור ליום רביעי 11/11/2026» (never «מחר»: on a Friday evening it is Sunday) -
    // or, with a journey he left still his, where he is in it.
    dayEntry: (day, date) => `בניית סידור ל${day} ${date}`,
    dayResume: n => `המשך בניית הסידור · שלב ${n} מתוך 5`,

    // --- 1: the counter in the day's dock. «לא נרשמו» and «נעדרים» are the day screen's
    // own headings for those two groups.
    placed: n => `שובצו: ${n}`,
    waiting: n => `לא נרשמו: ${n}`,
    absent: n => `נעדרים: ${n}`,

    // --- 2: this file's own reading when js/ui/daycheck.js is not there; and, above that
    // check when it is, the men not recorded whom it does not name (checkWaiting) and the
    // men recorded only on an archived site (checkArchived)
    checkLead: 'ההערות לא עוצרות: אפשר לחזור ולתקן, ואפשר להמשיך.',
    checkClean: 'לא נמצאו הערות.',
    checkWaiting: (n, names) => `לא נרשמו (${n}): ${names}`,
    checkEmptySites: (n, names) => `אתרים בלי עובדים (${n}): ${names}`,
    checkArchived: (n, names) => `רשומים באתר שבארכיון (${n}): ${names}`,

    // --- 3: the bar inside the הסעות screen, and the sentence where it is off
    rideWaiting: n => `בלי מושב: ${n}`,
    rideNoDriver: n => `רכבים בלי נהג: ${n}`,
    rideLost: n => `יושבים ברכב בלי אתר: ${n}`,
    rideOff: 'הסעות כבויות במכשיר הזה, ולכן השלב הזה מדולג. מפעילים אותן בהגדרות ← כללי ← הסעות.',

    // --- 4
    lookLead: 'כך הסידור נראה עכשיו. לתיקון חוזרים לשלב המתאים.',
    lookSites: 'אתרים ועובדים',
    lookRides: 'רכבים ונוסעים',

    // --- 5
    sendLead: 'בוחרים מה לשלוח. כל כפתור פותח את וואטסאפ עם ההודעה מוכנה, ושם לוחצים על שליחה. אפשר גם לסיים בלי לשלוח.',
    sendDrivers: 'הודעות לנהגים',
    sendDriversNone: 'אין רכב עם נהג.',
    sendWorkers: 'הודעה לכל עובד',
    sendAll: 'הודעה כללית',
    sendDayMessage: 'הודעת הסידור של כל היום'
});

const JOURNEY_STATIONS = 5;
const JOURNEY_RIDE = 3;

// ================================================================== the readings
//
// PURE, every one: a schedule (or a transport context) in, a plain answer out, nothing
// kept and nothing changed. tests/journey.test.mjs asks them on seeded records.

// The day the journey opens on: tomorrow by the LOCAL calendar - addDays works from local
// noon (js/dates.js), so neither midnight nor a clock change can land it a day off - and
// past an empty Saturday the way the day's own arrows step past one (stepDay, js/ui/day.js):
// on a Friday evening "tomorrow's seder" is Sunday's. A Saturday that already holds
// something is opened, exactly as the arrows open it.
function journeyDefaultDate(today) {
    const next = addDays(today, 1);
    if (!next) return today;
    const parsed = parseLocalDate(next);
    const empty = typeof anyRecordOnRestDay === 'function' ? !anyRecordOnRestDay(next) : false;
    return parsed.getDay() === 6 && empty ? addDays(next, 1) : next;
}

// Station 1. `placed` is the seder's own list (sederCrew) - the men the group message puts
// under a site, who are also the men the הסעות tray offers - so the number here is the
// number of messages and of seats to find. `waiting` is the day screen's «לא נרשמו»: an
// ACTIVE worker with no site and no absence, by the roster's notion of active
// (State.activeWorkers / State.unrecorded, asked here for any date). `elsewhere` is the
// crack between the two: an active man whose only site that day is one in the archive -
// recorded, so not waiting, and in nobody's message.
function journeyCrewStatus(schedule, date, layer) {
    const workers = ((schedule && schedule.workers) || []).filter(worker => worker && worker.active !== false);
    const crew = typeof sederCrew === 'function' ? sederCrew(schedule, date, layer) : [];
    const listed = new Set(crew.map(row => row.workerId));
    const out = { active: workers.length,
        placed: crew.map(row => ({ id: row.workerId, name: row.name })), absent: [], waiting: [], elsewhere: [] };
    workers.forEach(worker => {
        const who = { id: worker.id, name: worker.name };
        if (isAbsent(schedule, date, worker.id, layer)) out.absent.push(who);
        else if (listed.has(worker.id)) return;
        else if (entriesFor(schedule, date, worker.id, layer).length === 0) out.waiting.push(who);
        else out.elsewhere.push(who);
    });
    return out;
}

// «שובצו: 12 · לא נרשמו: 3 · נעדרים: 1». The two that are nothing are not said.
function journeyCrewWords(crew) {
    const T = JOURNEY_TEXT;
    const parts = [T.placed(crew.placed.length)];
    if (crew.waiting.length > 0) parts.push(T.waiting(crew.waiting.length));
    if (crew.absent.length > 0) parts.push(T.absent(crew.absent.length));
    return parts.join(' · ');
}

// Station 2, when nobody else answers: what the day lacks, as [{kind, text}] - the shape
// js/ui/daycheck.js gives, so the station draws either the same way.
function journeyOwnFindings(schedule, date, layer) {
    const T = JOURNEY_TEXT;
    const crew = journeyCrewStatus(schedule, date, layer);
    const names = list => list.map(one => isolate(one.name)).join(', ');
    const findings = [];
    if (crew.waiting.length > 0) {
        findings.push({ kind: 'unassigned', text: T.checkWaiting(crew.waiting.length, names(crew.waiting)) });
    }
    const empty = ((schedule && schedule.places) || [])
        .filter(place => place && place.active !== false)
        .filter(place => workersAtPlace(schedule, date, place.id, layer).length === 0);
    if (empty.length > 0) {
        findings.push({ kind: 'emptySite', text: T.checkEmptySites(empty.length, names(empty)) });
    }
    if (crew.elsewhere.length > 0) {
        findings.push({ kind: 'archivedSite', text: T.checkArchived(crew.elsewhere.length, names(crew.elsewhere)) });
    }
    return findings;
}

// Station 3: the picture as the הסעות screen draws it (TransportEngine.layout), asked the
// three things the journey says about it - who rides with us and has no seat, which
// vehicles carry men and have nobody at the wheel, and who is drawn in a seat with no site
// in today's record (the day changed under the plan). The last two are the engine's own
// `validate`, asked the way the screen asks it, so a line here is about a man who is drawn.
function journeyRideStatus(ctx, day) {
    const picture = TransportEngine.layout(ctx, day);
    const riders = TransportEngine.riders(ctx, day);
    const issues = TransportEngine.validate(ctx, { unavailable: day.unavailable, status: day.status,
        trips: TransportEngine.tripsOf(ctx, picture.cars) });
    return {
        crew: Object.keys(ctx.attendance).length,
        riders: riders.length,
        seated: Object.keys(picture.where).length,
        waiting: riders.filter(id => !picture.where[id]),
        noDriver: issues.filter(issue => issue.code === 'noDriver').map(issue => issue.vehicle),
        lost: issues.filter(issue => issue.code === 'notWorking' || issue.code === 'unknownWorker')
            .map(issue => ({ worker: issue.worker, vehicle: issue.vehicle }))
    };
}

function journeyRideOpen(ride) {
    return Boolean(ride) && (ride.waiting.length > 0 || ride.noDriver.length > 0 || ride.lost.length > 0);
}

// «כל העובדים משובצים», or what is left: «בלי מושב: 3 · רכבים בלי נהג: 1».
function journeyRideWords(ride) {
    const T = JOURNEY_TEXT;
    if (ride.crew === 0 && ride.seated === 0) return TRANSPORT_TEXT.nobody;
    const parts = [];
    if (ride.waiting.length > 0) parts.push(T.rideWaiting(ride.waiting.length));
    if (ride.noDriver.length > 0) parts.push(T.rideNoDriver(ride.noDriver.length));
    if (ride.lost.length > 0) parts.push(T.rideLost(ride.lost.length));
    return parts.length > 0 ? parts.join(' · ') : TRANSPORT_TEXT.allSeated;
}

// The strip: one state per station. 'now' is where he is, 'todo' is ahead. A station
// behind him is 'done' - or 'open' when the thing it was for still has something left,
// read NOW and not remembered: three men unplaced when he walked on are three men
// unplaced on the strip, until they are placed. `ride` is null on a phone with הסעות off,
// and station 3 is then 'skipped' wherever he stands.
function journeyStripStates(station, crew, ride) {
    const states = [];
    for (let n = 1; n <= JOURNEY_STATIONS; n += 1) {
        if (n === JOURNEY_RIDE && !ride) states.push('skipped');
        else if (n === station) states.push('now');
        else if (n > station) states.push('todo');
        else if (n === 1 && crew && crew.waiting.length > 0) states.push('open');
        else if (n === JOURNEY_RIDE && journeyRideOpen(ride)) states.push('open');
        else states.push('done');
    }
    return states;
}

// The station after (step 1) or before (step -1) `station`, past הסעות where it is off.
// 0 before the first, 6 after the last.
function journeyStep(station, step, ridesOn) {
    let next = station + step;
    if (next === JOURNEY_RIDE && !ridesOn) next += step;
    return next;
}

// A composed text as blocks of lines, a blank line between blocks - the shape
// transportSummaryBlocks already has, given to the day's message too so the last look
// draws both the same way.
function journeyTextBlocks(text) {
    return String(text || '').split(/\n{2,}/).map(block => block.split('\n')).filter(block => block.join('').trim() !== '');
}

// ================================================================== where he is, kept
//
// One key:  { version: 1, date: "2026-11-11", station: 3, at: <ms>, open: true }
// `at` is when the journey was last touched and `open` whether it was on the screen then.
//
// A PREFERENCE, NOT A RECORD (the top of this file). Written OPTIONAL, like the seder's
// progress: on a full disk this must never spend a restore point to make room for itself.
// A write the disk refused is still held for this session, and the journey says so.
//
// JOURNEY_RESUME_MS is how long a journey that was left is still "the one he is in the
// middle of": long enough for a call, a WhatsApp detour or supper; short enough that the
// morning's app - which is for recording what HAPPENED - does not open inside last
// night's seder. Within it a reload puts him back at his station by itself (if the journey
// was on the screen) and the entry continues it; past it the entry starts a new one. What
// he built is not in here and is not lost either way.
const JOURNEY_KEY = 'farkadSederJourney';
const JOURNEY_RESUME_MS = 3 * 60 * 60 * 1000;

let journeyMemory;          // undefined until read; then the kept journey, or null
let journeyKept = true;     // did the last write reach the disk
let journeyLive = null;     // the journey being walked on this screen now, or null
let journeyMoving = false;  // the journey itself is closing the הסעות screen

// Read leniently, validated strictly: anything that is not exactly a journey is none.
function journeyParse(raw) {
    let parsed = null;
    try {
        parsed = raw ? JSON.parse(raw) : null;
    } catch (error) {
        parsed = null;
    }
    if (!isPlainObject(parsed) || parsed.version !== 1) return null;
    if (!isRealDate(parsed.date) || !Number.isInteger(parsed.station)
        || parsed.station < 1 || parsed.station > JOURNEY_STATIONS || !isFiniteNumber(parsed.at)) return null;
    return { version: 1, date: parsed.date, station: parsed.station, at: parsed.at, open: parsed.open === true };
}

// The journey this phone is in the middle of, or null: none kept, one that will not read,
// or one left longer ago than JOURNEY_RESUME_MS. A clock put back is not "recently".
function journeyStored(now) {
    if (journeyMemory === undefined) {
        let raw = null;
        try { raw = Store.get(JOURNEY_KEY); } catch (error) { raw = null; }
        journeyMemory = journeyParse(raw);
    }
    if (!journeyMemory) return null;
    const age = now - journeyMemory.at;
    return age >= 0 && age <= JOURNEY_RESUME_MS ? journeyMemory : null;
}

function journeySave() {
    if (!journeyMemory) return false;
    journeyKept = Store.set(JOURNEY_KEY, JSON.stringify(journeyMemory), { optional: true }) === true;
    return journeyKept;
}

function journeyForget() {
    journeyMemory = null;
    journeyKept = true;
    try { Store.remove(JOURNEY_KEY); } catch (error) { /* a key that would not go is a stale journey, read as none */ }
}

function journeyWasKept() { return journeyKept; }
function journeyStation() { return journeyLive ? journeyLive.station : 0; }
function journeyDate() { return journeyLive ? journeyLive.date : null; }

function journeyTouch() {
    if (!journeyLive) return false;
    journeyLive.at = Date.now();
    return journeySave();
}

function journeyRidesOn() {
    return typeof transportEnabled === 'function' && typeof TransportEngine !== 'undefined' && transportEnabled();
}

// ================================================================== the walk

// From the entry. The journey he is in the middle of is continued where he left it;
// otherwise a new one, for tomorrow, at the first station.
function journeyStart() {
    // The dialog the entry lives in steps aside: one layer at a time.
    const share = typeof document !== 'undefined' && document.getElementById ? document.getElementById('shareModal') : null;
    if (share && typeof closeShareModal === 'function') closeShareModal();
    const now = Date.now();
    const kept = journeyStored(now);
    journeyMemory = kept || { version: 1, date: journeyDefaultDate(todayStr()), station: 1, at: now, open: true };
    journeyLive = journeyMemory;
    journeyLive.open = true;
    journeyTouch();
    journeyShow(true);
    return true;
}

// At boot (js/app.js), after the first draw: a journey that was on the screen when the
// app went away - a call, iOS killing the home-screen app behind WhatsApp, a reload -
// comes back at its station, on its date. Not when a reminder is what opened the app
// (that tap is going to today, and it wins - the seder's own rule), and not over a dialog
// the boot itself put up.
function journeyResume() {
    try {
        if (typeof location !== 'undefined'
            && new URL(location.href).searchParams.has('farkad-reminder')) return false;
    } catch (error) {
        return false;
    }
    if (typeof document === 'undefined' || !document.querySelectorAll) return false;
    if ([...document.querySelectorAll('.modal')].some(modal => modal.style.display === 'flex')) return false;
    const kept = journeyStored(Date.now());
    if (!kept || !kept.open) return false;
    journeyLive = kept;
    journeyTouch();
    journeyShow(true);
    return true;
}

function journeyGo(station) {
    if (!journeyLive || !Number.isInteger(station) || station < 1 || station > JOURNEY_STATIONS) return false;
    journeyLive.station = station;
    journeyTouch();
    journeyShow(true);
    return true;
}

function journeyNext() {
    if (!journeyLive) return false;
    const next = journeyStep(journeyLive.station, 1, journeyRidesOn());
    return next > JOURNEY_STATIONS ? journeyFinish() : journeyGo(next);
}

function journeyBack() {
    if (!journeyLive) return false;
    const before = journeyStep(journeyLive.station, -1, journeyRidesOn());
    return before < 1 ? false : journeyGo(before);
}

// Left, not finished: the frame goes and the place is kept, so the entry brings him back
// to this station. A reload does NOT - he left on purpose (the seder's list has the same
// rule). He stays on the day he was building, with the day's own header saying which.
function journeyLeave() {
    if (!journeyLive) return false;
    journeyLive.open = false;
    journeyTouch();
    journeyLive = null;
    journeyShow(false);
    return true;
}

// Finished, whether or not anything was sent: nothing is kept, and the day screen goes
// back to TODAY. The costliest mistake this app knows is a record on the wrong date
// (watchDayRollover, js/app.js), and the morning's record must not land on the day he
// was building the night before because that is where the screen was left.
function journeyFinish() {
    if (!journeyLive) return false;
    journeyLive = null;
    journeyForget();
    const today = todayStr();
    if (State.date !== today) {
        if (typeof hideUndo === 'function') hideUndo();
        State.date = today;
    }
    journeyShow(false);
    return true;
}

// The record's date brought to the journey's, before anything that reads State.date is
// opened from a station (the day's message, the day screen itself). The midnight follow
// can move the one and not the other.
function journeyAlignDate() {
    if (!journeyLive || State.date === journeyLive.date) return;
    if (typeof hideUndo === 'function') hideUndo();
    State.date = journeyLive.date;
}

// THE ONE PLACE THE SCREEN IS MADE TO MATCH THE JOURNEY: which of the existing screens is
// in front, then one render() - which draws the journey's own parts (renderJourneyIfOpen).
function journeyShow(focus) {
    if (typeof document === 'undefined' || !document.getElementById) return;
    const live = journeyLive;
    // The switch turned off under a kept station: the station that is not there is passed.
    if (live && live.station === JOURNEY_RIDE && !journeyRidesOn()) live.station = JOURNEY_RIDE + 1;
    const riding = Boolean(live) && live.station === JOURNEY_RIDE;
    journeyAlignDate();
    if (!riding && typeof transportIsOpen === 'function' && transportIsOpen()) {
        journeyMoving = true;
        try { closeTransport(); } finally { journeyMoving = false; }
    }
    if (live && typeof closeSederList === 'function' && live.station !== JOURNEY_STATIONS) {
        const seder = document.getElementById('sederModal');
        if (seder && seder.style.display === 'flex') closeSederList();
    }
    if (live && live.station === 1 && typeof currentView !== 'undefined' && currentView !== 'day'
        && typeof showView === 'function') showView('day');
    else if (typeof render === 'function') render();
    if (riding && !transportIsOpen()) {
        openTransport(live.date);
        // openTransport draws its picture BEFORE it puts the panel on the screen, so the
        // draw's own call found no open screen to put the bar in. Asked again now it is.
        journeyTransportDrawn();
    }
    if (focus && live) journeyFocus();
}

// Where the keyboard and a screen reader arrive after a move: the panel's heading on a
// station the panel draws; on the day screen and on הסעות, the journey's onward button -
// the one control there that is the journey's.
function journeyFocus() {
    const parts = journeyParts();
    if (!journeyLive || !parts.panel) return;
    if (journeyPanelIsOpen()) {
        void parts.panel.offsetHeight;
        if (parts.title && parts.title.focus) parts.title.focus({ preventScroll: true });
        if (parts.body) parts.body.scrollTop = 0;
        return;
    }
    // On הסעות the screen takes the keyboard to its own heading (openTransport).
    const onward = journeyLive.station === 1 ? document.getElementById('journeyNext') : null;
    if (onward && onward.focus) onward.focus({ preventScroll: true });
}

// ================================================================== the screen

function journeyParts() {
    const get = id => (typeof document !== 'undefined' && document.getElementById ? document.getElementById(id) : null);
    return { panel: get('journeyPanel'), title: get('journeyTitle'), context: get('journeyContext'),
        leave: get('journeyLeave'), strip: get('journeyStripSlot'), note: get('journeyNote'),
        body: get('journeyBody'), foot: get('journeyFoot'), live: get('journeyLive') };
}

function journeyPanelIsOpen() {
    const panel = typeof document !== 'undefined' && document.getElementById ? document.getElementById('journeyPanel') : null;
    return Boolean(panel && panel.classList && panel.classList.contains('open'));
}

// A button of the journey. `key` is what the keyboard is given back by after a redraw.
function journeyButton(text, className, key, onClick) {
    const node = button(text, className, onClick);
    if (key) node.dataset.jk = key;
    return node;
}

function journeyNextButton(station) {
    const T = JOURNEY_TEXT;
    const next = journeyStep(station, 1, journeyRidesOn());
    const node = journeyButton(next > JOURNEY_STATIONS ? T.finish : T.next(T.stations[next - 1]),
        'journey-next', 'next', () => { next > JOURNEY_STATIONS ? journeyFinish() : journeyNext(); });
    node.id = 'journeyNext';
    return node;
}

// What the journey reads of the day and of the rides, once per draw.
function journeyReadings(live) {
    const crew = journeyCrewStatus(State.schedule, live.date, State.layer);
    const ride = journeyRidesOn() ? journeyRideStatus(transportContext(live.date), transportDayOf(live.date)) : null;
    return { crew, ride, states: journeyStripStates(live.station, crew, ride) };
}

// The strip: five marks in a row and the name of the station he is on. A list, so a
// screen reader says "2 of 5"; each mark carries its station's name and what its state
// means, and the whole thing is named «שלב 2 מתוך 5 · בדיקה».
function journeyStripNode(live, states) {
    const T = JOURNEY_TEXT;
    const strip = el('ol', 'journey-strip');
    strip.setAttribute('aria-label', T.stepOf(live.station, T.stations[live.station - 1]));
    states.forEach((state, index) => {
        const item = el('li', `journey-pip journey-pip-${state}`);
        item.dataset.station = String(index + 1);
        item.dataset.state = state;
        const said = { done: T.pipDone, open: T.pipOpen, skipped: T.pipSkipped }[state];
        item.setAttribute('aria-label', said ? `${T.stations[index]}: ${said}` : T.stations[index]);
        if (state === 'now') item.setAttribute('aria-current', 'step');
        const mark = el('span', 'journey-pip-mark',
            { done: '✓', open: '!', skipped: '–' }[state] || String(index + 1));
        mark.setAttribute('aria-hidden', 'true');
        item.appendChild(mark);
        if (state === 'now') item.appendChild(el('span', 'journey-pip-name', T.stations[index]));
        strip.appendChild(item);
    });
    return strip;
}

// Called by render() (js/app.js) and by nobody who is not also a render: the journey's
// own parts, brought up to date with the record and with where he is. With no journey on
// the screen it takes its parts away and does nothing else.
function renderJourneyIfOpen() {
    if (typeof document === 'undefined' || !document.getElementById || !document.body) return;
    const live = journeyLive;
    const onDay = Boolean(live) && live.station === 1
        && (typeof currentView === 'undefined' || currentView === 'day');
    document.body.classList.toggle('journey-on', Boolean(live));
    document.body.classList.toggle('journey-day', onDay);
    if (!live) {
        journeyDrawDock(null);
        journeyDrawPanel(null);
        journeyDrawRideBar(null);
        return;
    }
    // AT STATION 1 THE DAY SCREEN IS THE EDITOR, AND ITS DATE IS THE JOURNEY'S. The date is
    // changed by the day's own header - arrows, picker, drawer - and the journey follows
    // it; there is no second date control to disagree with the first.
    if (live.station === 1 && isRealDate(State.date) && State.date !== live.date) {
        live.date = State.date;
        journeyTouch();
    }
    const read = journeyReadings(live);
    journeyDrawDock(onDay ? live : null, read);
    journeyDrawPanel(live.station !== 1 && live.station !== JOURNEY_RIDE ? live : null, read);
    journeyDrawRideBar(live.station === JOURNEY_RIDE ? live : null, read);
    // The summary's dialog, when station 5 opened it: a man moved under it shows as moved.
    if (typeof transportSummaryRefresh === 'function') transportSummaryRefresh();
}

// Put `node`'s children back the way they were focused: the control with the same key.
function journeyRefocus(root, key) {
    if (!key) return;
    const again = [...root.querySelectorAll('[data-jk]')].find(node => node.dataset.jk === key);
    if (again && !again.disabled && again !== document.activeElement) again.focus({ preventScroll: true });
}

function journeyFocusedKey(root) {
    const active = document.activeElement;
    return active && root.contains(active) && active.dataset ? (active.dataset.jk || null) : null;
}

// ------------------------------------------------------------------ 1: the row in the day's dock
//
// INSIDE .day-actions, not a bar of its own. That dock is already a fixed layer the app
// knows how to live with: js/ui/bars.js measures it as it stands and the page keeps room
// for whatever height it has, the keyboard hides it, a stuck iPhone frame brings it down
// with the others, and paper never sees it. A second bar would have needed every one of
// those again. The dock's own two buttons stay where they were, under this row.
function journeyDrawDock(live, read) {
    const dock = document.querySelector('.day-actions');
    let row = document.getElementById('journeyDock');
    if (!live || !dock) {
        if (row && row.parentNode) row.parentNode.removeChild(row);
        return;
    }
    if (!row) {
        row = el('div', 'journey-dock');
        row.id = 'journeyDock';
        dock.insertBefore(row, dock.firstChild);
    }
    const T = JOURNEY_TEXT;
    const focused = journeyFocusedKey(row);
    clear(row);
    const top = el('div', 'journey-dock-top');
    top.appendChild(journeyStripNode(live, read.states));
    // WHO is not recorded yet, not only how many: with men still waiting the counter is a
    // button, and it names them in one of the app's own dialogs - read at the tap, so it
    // is today's answer. The day screen's «לא נרשמו» tray names them too, but only in the
    // by-site view and only once it is scrolled to. With nobody waiting it is a sentence.
    const count = read.crew.waiting.length === 0
        ? el('span', 'journey-count', journeyCrewWords(read.crew))
        : journeyButton(journeyCrewWords(read.crew), 'btn-secondary journey-count', 'count', () => {
            const waiting = journeyLive
                ? journeyCrewStatus(State.schedule, journeyLive.date, State.layer).waiting : [];
            if (waiting.length === 0 || typeof askTell !== 'function') return;
            askTell({ title: T.waiting(waiting.length), message: waiting.map(one => isolate(one.name)).join(', ') });
        });
    count.id = 'journeyCount';
    top.appendChild(count);
    row.appendChild(top);
    if (!journeyKept) row.appendChild(el('p', 'journey-note', T.notKept));
    const actions = el('div', 'journey-dock-row');
    actions.appendChild(journeyButton(T.leave, 'btn-secondary journey-quiet', 'leave', () => journeyLeave()));
    actions.appendChild(journeyNextButton(1));
    row.appendChild(actions);
    journeyRefocus(row, focused);
}

// ------------------------------------------------------------------ 3: the bar in the הסעות screen
//
// A child of #transportPanel, between its note and its list - an item of the panel's own
// column, so it takes its height from its words and the list takes the rest. Nothing
// fixed, nothing measured. The screen's own «חזרה» is the way back (journeyTransportClosed).
function journeyDrawRideBar(live, read) {
    const body = document.getElementById('transportBody');
    let bar = document.getElementById('journeyRide');
    const open = typeof transportIsOpen === 'function' && transportIsOpen();
    if (!live || !body || !open || !read || !read.ride) {
        if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
        return;
    }
    if (!bar) {
        bar = el('div', 'journey-ride');
        bar.id = 'journeyRide';
        body.parentNode.insertBefore(bar, body);
    }
    const focused = journeyFocusedKey(bar);
    clear(bar);
    bar.appendChild(journeyStripNode(live, read.states));
    const row = el('div', 'journey-ride-row');
    // ONLY WHAT IS LEFT. With nothing left the tray's own title, a finger above this bar,
    // already says «כל העובדים משובצים» (or that nobody has a site): said twice it is noise
    // on the one screen where every line is read. The node stays, empty, so the redraw
    // and a screen reader find the same element when something is left again.
    const left = journeyRideOpen(read.ride);
    const status = el('span', 'journey-ride-status' + (left ? ' journey-ride-left' : ''),
        left ? journeyRideWords(read.ride) : '');
    status.id = 'journeyRideStatus';
    row.appendChild(status);
    row.appendChild(journeyNextButton(JOURNEY_RIDE));
    bar.appendChild(row);
    journeyRefocus(bar, focused);
}

// renderTransport's last line (js/ui/transport.js): the picture was just redrawn - a man
// seated, a vehicle kept home, a snapshot that moved somebody - and the bar says what the
// picture now says. It draws nothing of the screen's own and never calls it back.
function journeyTransportDrawn() {
    if (!journeyLive || journeyLive.station !== JOURNEY_RIDE) {
        journeyDrawRideBar(null);
        return;
    }
    journeyDrawRideBar(journeyLive, journeyReadings(journeyLive));
}

// closeTransport's last line: the screen's own «חזרה», or Escape. Inside the journey that
// is one station back. Not when the journey itself closed it on the way to somewhere.
function journeyTransportClosed() {
    journeyDrawRideBar(null);
    if (journeyMoving || !journeyLive || journeyLive.station !== JOURNEY_RIDE) return;
    journeyGo(journeyStep(JOURNEY_RIDE, -1, true));
}

// ------------------------------------------------------------------ 2, 4, 5: the panel

function journeyDrawPanel(live, read) {
    const parts = journeyParts();
    if (!parts.panel || !parts.body) return;
    if (!live) {
        if (journeyPanelIsOpen()) {
            parts.panel.classList.remove('open');
            parts.panel.setAttribute('aria-hidden', 'true');
        }
        // Emptied, not only hidden: the way onward exists once on the page, wherever
        // the journey is, and a stale copy of it in a shut panel is a second one.
        clear(parts.strip);
        clear(parts.body);
        clear(parts.foot);
        delete parts.panel.dataset.station;
        return;
    }
    const T = JOURNEY_TEXT;
    const parsed = parseLocalDate(live.date);
    const wasOpen = journeyPanelIsOpen();
    const sameStation = parts.panel.dataset.station === String(live.station);
    const focused = journeyFocusedKey(parts.panel);
    const scrolled = parts.body.scrollTop;

    parts.title.textContent = T.title;
    parts.context.textContent = T.forDay(hebrewDayName(parsed), formatFullDate(parsed));
    parts.leave.textContent = T.leave;
    parts.note.textContent = T.notKept;
    parts.note.hidden = journeyKept;
    clear(parts.strip);
    parts.strip.appendChild(journeyStripNode(live, read.states));

    clear(parts.body);
    const view = el('div', 'journey-view');
    view.dataset.station = String(live.station);
    const heading = el('h3', 'journey-station', T.stations[live.station - 1]);
    heading.id = 'journeyStation';
    view.appendChild(heading);
    if (live.station === 2) journeyCheckInto(view, live, read);
    else if (live.station === 4) journeyLookInto(view, live, read);
    else journeySendInto(view, live, read);
    parts.body.appendChild(view);

    clear(parts.foot);
    const back = journeyButton(T.back, 'btn-secondary', 'back', () => journeyBack());
    back.id = 'journeyBack';
    parts.foot.appendChild(back);
    parts.foot.appendChild(journeyNextButton(live.station));

    parts.panel.dataset.station = String(live.station);
    if (!wasOpen) {
        parts.panel.classList.add('open');
        parts.panel.setAttribute('aria-hidden', 'false');
    }
    // A live region outside the rebuilt body, written only when its sentence changes.
    const said = T.stepOf(live.station, T.stations[live.station - 1]);
    if (typeof sayOnce === 'function') sayOnce(parts.live, said);
    else if (parts.live.textContent !== said) parts.live.textContent = said;

    // The same station redrawn under him (a snapshot, a mark) keeps its place and its
    // focus; a new station starts at its top (journeyFocus).
    if (wasOpen && sameStation) {
        parts.body.scrollTop = scrolled;
        journeyRefocus(parts.panel, focused);
    }
}

function journeyWarn(text, kind) {
    const node = el('p', 'journey-warn' + (kind ? ' journey-finding-' + kind : ''), text);
    return node;
}

// Blocks of lines as a card each: a block of several lines is headed by its first.
function journeyBlocksInto(host, blocks) {
    blocks.forEach(lines => {
        const block = el('div', 'journey-block');
        lines.forEach((line, index) => {
            block.appendChild(el('p', index === 0 && lines.length > 1 ? 'journey-block-head' : 'journey-block-line', line));
        });
        host.appendChild(block);
    });
}

// ---- 2: the check. FINDINGS NEVER BLOCK: the button onward is the same button, enabled,
// whatever is listed - the owner decides what a note is worth.
//
// THE DAY'S OWN CHECK (js/ui/daycheck.js) IS THE CHECK, drawn by its own door into a host
// of its own, for the journey's date. It is asked ONLY through typeof, and a throw inside
// it must not cost him the journey: the station then falls back to this file's reading.
//
// WHAT THE JOURNEY ADDS ABOVE IT, AND WHY. That check compares the day with the last
// working day: it names a man who worked then and is not recorded now. A man who is not
// recorded and did NOT work then - new, back from leave - is nobody it knows about, and
// "nothing left to chance" is exactly him. So the men not recorded whom the check does
// not name are listed here, each man once: a man the check names is not said twice. And
// the man recorded only on an archived site, whom nothing else in the app mentions.
//
// A NAME IN THE CHECK IS A WAY TO THE DAY SCREEN. The check's chips open the man's sheet,
// or scroll to the site's card - on the day screen, which at this station is under the
// panel: the sheet opened BEHIND it and the tap looked dead (found when the two were first
// run together). The day screen is this journey's editor and it is one station back, so a
// tap on a chip first goes there (journeyGo(1), in the capture phase, before the chip's
// own handler), and the chip then does what it always does, on a screen that can show it.
function journeyCheckInto(view, live, read) {
    const T = JOURNEY_TEXT;
    view.appendChild(el('p', 'journey-lead', T.checkLead));
    const host = el('div', 'journey-card journey-check');
    host.id = 'journeyCheck';
    const warn = finding => journeyWarn(finding.text, String(finding.kind || '').replace(/[^A-Za-z0-9_-]/g, ''));

    // What the day's check found, when there is one that answers: asked before anything
    // is drawn, so what it counts and whom it names are known whichever way it is shown.
    let findings = null;
    if (typeof dayCheckFindings === 'function') {
        try {
            const answered = dayCheckFindings(live.date);
            if (Array.isArray(answered)) findings = answered.filter(one => one && typeof one.text === 'string');
        } catch (error) {
            if (typeof console !== 'undefined' && console.warn) console.warn('journey: the day check did not answer', error);
        }
    }
    let drawn = null;
    const real = el('div', 'journey-check-real daycheck-list');
    real.id = 'journeyCheckReal';
    if (typeof renderDayCheckInto === 'function') {
        try {
            const answered = renderDayCheckInto(real, live.date);
            if (Number.isInteger(answered) && answered >= 0) drawn = answered;
        } catch (error) {
            if (typeof console !== 'undefined' && console.warn) console.warn('journey: the day check did not draw', error);
        }
    }

    let count = 0;
    if (drawn === null && !findings) {
        // No check on this build, or one that failed both ways: the journey's own reading.
        const own = journeyOwnFindings(State.schedule, live.date, State.layer);
        own.forEach(finding => host.appendChild(warn(finding)));
        count = own.length;
        if (count === 0) host.appendChild(el('p', 'journey-ok', T.checkClean));
    } else {
        const named = new Set();
        (findings || []).forEach(finding => (Array.isArray(finding.workers) ? finding.workers : [])
            .forEach(worker => { if (worker && worker.id) named.add(worker.id); }));
        const names = list => list.map(one => isolate(one.name)).join(', ');
        const unnamed = read.crew.waiting.filter(one => !named.has(one.id));
        const extra = [];
        if (unnamed.length > 0) extra.push({ kind: 'unassigned', text: T.checkWaiting(unnamed.length, names(unnamed)) });
        if (read.crew.elsewhere.length > 0) {
            extra.push({ kind: 'archivedSite', text: T.checkArchived(read.crew.elsewhere.length, names(read.crew.elsewhere)) });
        }
        extra.forEach(finding => host.appendChild(warn(finding)));
        // SOMETHING TO LOOK AT is what the journey added and what the check put under
        // «כדאי לבדוק». Its «לידיעה» lines are drawn, and are not counted.
        const toCheck = findings
            ? findings.filter(one => one.tier === undefined || one.tier === 'check').length : drawn;
        count = extra.length + toCheck;
        if (drawn !== null) {
            real.addEventListener('click', event => {
                const chip = event.target && event.target.closest ? event.target.closest('button, a[href]') : null;
                if (chip && real.contains(chip) && journeyLive && journeyLive.station === 2) journeyGo(1);
            }, true);
            host.appendChild(real);
        } else {
            findings.forEach(finding => host.appendChild(warn(finding)));
            if (extra.length === 0 && findings.length === 0) host.appendChild(el('p', 'journey-ok', T.checkClean));
        }
    }
    host.dataset.count = String(count);
    view.appendChild(host);
    if (!journeyRidesOn()) view.appendChild(el('p', 'journey-lead journey-ride-off', T.rideOff));
}

// ---- 4: the last look. READ-ONLY, and read through the builders that compose what is
// sent: the day's message (dayMessage, js/ui/share.js - in the wording he chose for the
// group) and the summary of the rides (transportSummaryBlocks). Each without its own
// heading line: the panel already says the day. What neither of them says on its own is
// said above them - the men not recorded yet (who are simply missing from a message), and
// a man drawn in a seat with no site, in the vehicle card's own words.
function journeyLookInto(view, live, read) {
    const T = JOURNEY_TEXT;
    view.appendChild(el('p', 'journey-lead', T.lookLead));

    const sites = el('section', 'journey-card');
    sites.id = 'journeyLookSites';
    sites.appendChild(el('h4', null, T.lookSites));
    if (read.crew.waiting.length > 0) {
        sites.appendChild(journeyWarn(T.checkWaiting(read.crew.waiting.length,
            read.crew.waiting.map(one => isolate(one.name)).join(', ')), 'unassigned'));
    }
    journeyBlocksInto(sites, journeyTextBlocks(dayMessage(live.date, State.layer)).slice(1));
    view.appendChild(sites);

    const rides = el('section', 'journey-card');
    rides.id = 'journeyLookRides';
    rides.appendChild(el('h4', null, T.lookRides));
    if (!read.ride) rides.appendChild(el('p', 'journey-lead journey-ride-off', T.rideOff));
    else {
        const ctx = transportContext(live.date);
        read.ride.lost.forEach(lost => rides.appendChild(journeyWarn(
            TRANSPORT_TEXT.notWorking(isolate(transportWorkerName(ctx, lost.worker))), 'lost')));
        journeyBlocksInto(rides, transportSummaryBlocks(ctx, transportDayOf(live.date), live.date).slice(1));
    }
    view.appendChild(rides);
}

// The drivers whose own message was opened and still stands (the vehicle card's mark), who
// are also on the seder's list for that day: [{ id, name, vehicle }], in the vehicles' order.
function journeyOpenedDrivers(date, crew) {
    if (!journeyRidesOn()) return [];
    const listed = new Set((crew || []).map(row => row.workerId));
    const ctx = transportContext(date);
    const cars = TransportEngine.layout(ctx, transportDayOf(date)).cars;
    const out = [];
    ctx.vehicles.forEach(vehicle => {
        const seats = cars[vehicle.id];
        const driver = seats ? seats[1] : null;
        if (!driver || !listed.has(driver) || out.some(one => one.id === driver)) return;
        if (transportMarkState(date, vehicle.id) !== 'opened') return;
        out.push({ id: driver, name: transportWorkerName(ctx, driver), vehicle: vehicle.id });
    });
    return out;
}

// ---- 5: sending. HE CHOOSES; nothing is ticked for him and nothing must be sent.
function journeySendInto(view, live, read) {
    const T = JOURNEY_TEXT;
    view.appendChild(el('p', 'journey-lead', T.sendLead));

    // The drivers, first: what he mostly sends. One row per vehicle that has a man at the
    // wheel, and on it THE VEHICLE CARD'S OWN LINK (transportDoor) - the same address, the
    // same mark made inside the same tap, the same «נפתח בוואטסאפ» believed only while the
    // message is the one it was made on (transportMarkState). No mark of this file's own.
    const drivers = el('section', 'journey-card journey-send');
    drivers.id = 'journeySendDrivers';
    drivers.appendChild(el('h4', null, T.sendDrivers));
    if (!read.ride) drivers.appendChild(el('p', 'journey-lead journey-ride-off', T.rideOff));
    else {
        const ctx = transportContext(live.date);
        const cars = TransportEngine.layout(ctx, transportDayOf(live.date)).cars;
        let rows = 0;
        ctx.vehicles.forEach(vehicle => {
            const seats = cars[vehicle.id];
            if (!seats || seats.filter(Boolean).length === 0) return;
            rows += 1;
            const row = el('div', 'journey-send-row');
            row.dataset.vehicle = vehicle.id;
            const who = el('div', 'journey-send-who');
            const state = transportMarkState(live.date, vehicle.id);
            row.dataset.mark = state;
            who.appendChild(el('strong', null, seats[1] ? transportWorkerName(ctx, seats[1]) : TRANSPORT_TEXT.driverNone));
            const name = el('span', 'journey-send-sub', vehicle.name);
            name.dir = 'rtl';
            who.appendChild(name);
            row.appendChild(who);
            if (state === 'nophone') row.appendChild(transportBadge(TRANSPORT_TEXT.noPhone, 'bad'));
            else if (state !== 'nodriver') {
                const door = transportDoor(live.date, vehicle.id, transportDriverNumber(live.date, vehicle.id),
                    transportDriverMessage(live.date, vehicle.id));
                door.dataset.jk = 'wa:' + vehicle.id;
                // The link being followed must not be rewritten under the finger: the
                // redraw that shows the mark comes a moment later, as on the card.
                door.addEventListener('click', () => setTimeout(renderJourneyIfOpen, 1500));
                row.appendChild(door);
                if (state === 'opened') row.appendChild(transportBadge(TRANSPORT_TEXT.opened, 'ok'));
            }
            drivers.appendChild(row);
        });
        if (rows === 0) drivers.appendChild(el('p', 'journey-lead', T.sendDriversNone));
    }
    view.appendChild(drivers);

    // The seder to each worker: the existing list and its run, opened over this panel. Its
    // marks and who was left out are its own (js/ui/seder.js), per date.
    const workers = el('section', 'journey-card journey-send');
    workers.id = 'journeySendWorkers';
    workers.appendChild(el('h4', null, T.sendWorkers));
    if (typeof sederCrew === 'function' && typeof openSederList === 'function') {
        const crew = sederCrew(State.schedule, live.date, State.layer);
        if (crew.length === 0) workers.appendChild(el('p', 'journey-lead', SEDER_TEXT.nobody));
        else {
            const run = sederRun(crew, live.date);
            workers.appendChild(el('p', 'journey-lead', run.done > 0
                ? `${SEDER_TEXT.count(crew.length)} · ${SEDER_TEXT.progress(run.done, run.total)}`
                : SEDER_TEXT.count(crew.length)));
            // A DRIVER IS ALSO A MAN WITH A SITE, so he is on this list too, and a message
            // to each driver followed by a message to each worker is two messages to him.
            // He is NOT taken off the list - which of the two he gets is the owner's choice
            // - but he is named here, before the list is opened, with the mark his own row
            // above carries and the name of the group it was made in. Read at the draw
            // (transportMarkState), so it is believed exactly as long as the mark is.
            journeyOpenedDrivers(live.date, crew).forEach(driver => {
                const row = el('div', 'journey-send-row journey-send-driver');
                row.dataset.worker = driver.id;
                const who = el('div', 'journey-send-who');
                who.appendChild(el('strong', null, driver.name));
                who.appendChild(el('span', 'journey-send-sub', T.sendDrivers));
                row.appendChild(who);
                row.appendChild(transportBadge(TRANSPORT_TEXT.opened, 'ok'));
                workers.appendChild(row);
            });
            const open = journeyButton(SEDER_TEXT.entry, 'btn-secondary journey-wide', 'seder', () => {
                journeyAlignDate();
                openSederList(live.date);
            });
            open.id = 'journeySederOpen';
            workers.appendChild(open);
        }
    }
    view.appendChild(workers);

    // Everything at once: the day's own message in its own dialog (the wording chips, the
    // warning about men not recorded, send and copy - all as they are), and the summary of
    // the rides by the same two doors every composed text leaves by (shareTextOut).
    const all = el('section', 'journey-card journey-send');
    all.id = 'journeySendAll';
    all.appendChild(el('h4', null, T.sendAll));
    const day = journeyButton(T.sendDayMessage, 'btn-secondary journey-wide', 'day', () => {
        journeyAlignDate();
        showDayMessage();
    });
    day.id = 'journeyDayMessage';
    all.appendChild(day);
    if (read.ride) {
        // THE SUMMARY'S OWN DIALOG (v179), for the journey's date: the words are read
        // before they leave, and they leave by that dialog's own doors - the share sheet
        // or wa.me with no number, the copy, the picture. It used to go from this button
        // straight to the share sheet, unread.
        const summary = journeyButton(TRANSPORT_TEXT.summaryButton, 'btn-secondary journey-wide', 'summary', () => {
            openTransportSummary(live.date);
        });
        summary.id = 'journeySummary';
        all.appendChild(summary);
    }
    view.appendChild(all);
}

// ------------------------------------------------------------------ the keyboard
//
// The settings sheet's contract, as the הסעות panel keeps it: Tab stays inside, Escape is
// the way out - here «יציאה», which keeps his place. While one of the app's dialogs is up
// over the panel (the day's message, the seder's list, a question) the keyboard is that
// dialog's, and while the הסעות screen is in front it is that screen's; this stands by.
// Registered at load, so it runs BEFORE js/ui/modal.js's listener and before the הסעות
// panel's: at that moment a dialog one of them is about to close still reads as open.
function journeyKeydown(event) {
    if (event.defaultPrevented || !journeyPanelIsOpen()) return;
    if (typeof openModals === 'function' && openModals().length > 0) return;
    if (typeof transportIsOpen === 'function' && transportIsOpen()) return;
    const panel = document.getElementById('journeyPanel');
    if (event.key === 'Escape') {
        event.preventDefault();
        journeyLeave();
        return;
    }
    if (event.key === 'Tab' && typeof trapTab === 'function' && panel) trapTab(event, panel);
}

// ================================================================== the way in

// The row in the WhatsApp dialog, after the seder's and הסעות's. Built here rather than
// written into index.html because its label is one of the words above. «הסעות» puts its
// own row straight after the seder's whenever it is switched on, so this one is always
// the last of the three, whichever order they were built in.
function journeyInstallEntry() {
    if (typeof document === 'undefined' || !document.querySelector) return;
    const actions = document.querySelector('#shareModal .modal-actions');
    if (!actions || document.getElementById('journeyEntry')) return;
    const entry = button(JOURNEY_TEXT.entry, 'btn-secondary journey-entry', () => journeyStart());
    entry.id = 'journeyEntry';
    const after = document.getElementById('transportEntry') || document.getElementById('sederEntry')
        || actions.querySelector('.btn-success');
    actions.insertBefore(entry, after ? after.nextSibling : actions.firstChild);
}

// THE BUTTON AT THE FOOT OF THE DAY'S LIST (js/ui/day.js asks for it on every draw of the
// day, through typeof). A new node each time, like everything the day draws. Not drawn
// while the journey is on the screen: its own row is then in the dock, a thumb below.
// Pressing it is journeyStart - the same door as the row in the WhatsApp dialog - so a
// journey he left is continued and anything else starts a new one; if the three hours ran
// out between the draw and the tap, the tap starts a new one and the label was a minute old.
function journeyDayEntryWords(now, today) {
    const T = JOURNEY_TEXT;
    const kept = journeyStored(now);
    if (kept) return T.dayResume(kept.station);
    const parsed = parseLocalDate(journeyDefaultDate(today));
    return T.dayEntry(hebrewDayName(parsed), formatFullDate(parsed));
}

function journeyDayEntry() {
    if (journeyLive) return null;
    const row = el('div', 'journey-day-row');
    const entry = button(journeyDayEntryWords(Date.now(), todayStr()), 'btn-secondary journey-day-entry', () => journeyStart());
    entry.id = 'journeyDayEntry';
    entry.dataset.resume = journeyStored(Date.now()) ? '1' : '0';
    row.appendChild(entry);
    return row;
}

// Away and back - a call, WhatsApp - is the journey being touched: the three hours are
// counted from when he was last here, not from when he started. And the marks a detour
// to WhatsApp made are on the screen when he is back.
function journeyWatch() {
    if (typeof document === 'undefined' || !document.addEventListener) return;
    document.addEventListener('keydown', journeyKeydown);
    document.addEventListener('visibilitychange', () => {
        if (!journeyLive) return;
        journeyTouch();
        if (document.visibilityState === 'visible') renderJourneyIfOpen();
    });
}

// At load: the entry and the two listeners. Never allowed to throw into the boot.
try {
    journeyInstallEntry();
    journeyWatch();
} catch (error) {
    if (typeof console !== 'undefined' && console.warn) console.warn('journey: not installed', error);
}
