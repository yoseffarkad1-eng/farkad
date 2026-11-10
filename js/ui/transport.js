// הסעות (v171): who rides to work in which vehicle, and a message to each driver - the
// screen, and the store it keeps its own things in.
//
// The owner, 2026-11-09: seven vehicles, a pickup area per worker, he decides who may
// drive what, the morning ride only - and FIRST ON HIS PHONE ONLY. The other two phones
// come later, in a step of their own. So this file is built to be absent everywhere it
// was not asked for:
//
//   - IT IS OFF UNTIL THIS PHONE TURNS IT ON. One preference in Store
//     (farkadTransport:enabled), set from a card in ⋯. While it is off no entry is drawn,
//     nothing is computed, and nothing but that one preference is read. There is no
//     FARKAD_FLAGS entry: a flag is a constant in a commit and is the same on all three
//     phones, and the whole point of this gate is that it is NOT the same on all three.
//   - IT READS THE DAY AND NEVER WRITES IT. Who works where comes from the day record
//     through sederCrew (js/ui/seder.js) - the same reading the seder to each worker
//     makes, so a man is on this list exactly when he is under a site in the group
//     message. A man on two sites that day rides to the FIRST one his day holds; the
//     other is said on his card and not routed. No function here calls State.commit,
//     State.save or anything in js/sync/.
//   - WHAT IT KEEPS IS THIS PHONE'S OWN, under keys of its own:
//       farkadTransport:settings       the vehicles, the pickup areas, and per worker his
//                                      area and whether (and what) he may drive - these
//                                      are NOT roster fields, and no other phone has them
//       farkadTransport:day:<date>     that day's draft, its accepted versions, and which
//                                      driver's message was opened or marked sent
//     None of it is in the record, so nothing that carries the record - the outbox, the
//     cloud, a backup file, a restore point - can carry it, and the rescue file takes
//     named records only (js/recovery.js). THE PRICE, said in docs/releases.md: a lost
//     phone loses the plans and the per-worker transport settings.
//   - A DAMAGED TRANSPORT RECORD CANNOT HOLD THE DAY. Recovery is not involved and
//     farkadWritesBlocked() is never raised from here: a ride plan that will not parse
//     must not stop anybody recording who worked. What will not read is copied aside,
//     said on the screen, and started again from empty (below, "the store").
//
// Entered from the WhatsApp dialog (#shareModal), under the seder's own row, and from
// nowhere on the day screen - the owner had said that screen has too many buttons.
//
// THIS IS NOT THE RETIRED «רכבים» FEATURE (js/model/schema.js, the `vehicles` flag): that
// one pays a vehicle's owner and is payroll. Nothing here touches it, its ids or its panel.

// ================================================================== THE WORDS
//
// EVERY HEBREW STRING THIS FEATURE SHOWS OR SENDS, AND NOTHING ELSE, IN ONE BLOCK.
// PROPOSED, NOT APPROVED WORD BY WORD: the owner gave blanket approval of professional
// wording on 2026-11-09 and corrects on sight (docs/releases.md, v171, lists them all).
// Hebrew strings are product decisions (CLAUDE.md, law 6): tests/transport.test.mjs pins
// every one, word for word, and changing one here moves the pinned line there in the
// same commit. A name in a template is already bidi-isolated by the caller.
const TRANSPORT_TEXT = Object.freeze({
    // --- the switch, in ⋯: the last row of «כללי» (v172; under «מכשיר ועזרה» until then)
    switchTitle: 'הסעות',
    switchSub: 'שיבוץ עובדים לרכבים',
    switchLead: 'שיבוץ העובדים לרכבים והודעה לכל נהג. פועל במכשיר הזה בלבד: לא מסונכרן, לא משותף עם הטלפונים האחרים, ולא נכלל בגיבוי.',
    switchStateOn: 'מופעל במכשיר הזה',
    switchStateOff: 'כבוי',
    switchOn: 'הפעלת הסעות במכשיר הזה',
    switchOff: 'כיבוי הסעות במכשיר הזה',

    // --- the way in: a row in the WhatsApp dialog, under the seder's
    entry: 'הסעות – שיבוץ לרכבים',

    // --- the frame
    title: 'הסעות',
    back: 'חזרה',
    tabPlan: 'שיבוץ',
    tabVehicles: 'רכבים',
    tabWorkers: 'עובדים',
    tabMessages: 'הודעות',
    notKept: 'השינוי לא נשמר במכשיר. אם האפליקציה תיסגר, הוא יאבד.',
    unreadable: 'נתוני הסעות שנשמרו במכשיר לא נקראו. מתחילים מרשימה ריקה, והעותק שלא נקרא נשמר בצד.',
    nobody: 'אין ביום הזה עובדים עם אתר עבודה.',

    // --- vehicles: which go out today, and the list itself
    vehiclesLead: 'אילו רכבים יוצאים היום?',
    vehiclesSummary: (n, total, seats) => `זמינים ${n} מתוך ${total} · ${seats} מושבים`,
    seats: n => `${n} מושבים`,
    available: 'זמין היום',
    unavailable: 'לא זמין היום',
    noVehicles: 'אין רכבים ברשימה.',
    editVehicle: 'עריכת הרכב',
    addVehicle: 'הוספת רכב',
    renameVehicle: 'שינוי שם',
    changeSeats: 'שינוי מושבים',
    retireVehicle: 'הוצאה מהרשימה',
    vehicleNameTitle: 'שם הרכב',
    nameNeeded: 'צריך לכתוב שם',
    vehicleNameTaken: 'כבר יש רכב בשם הזה',
    seatsTitle: name => `כמה מושבים יש ב${name}? כולל הנהג.`,
    seatsBad: 'מספר בין 2 ל-20',
    retireTitle: name => `להוציא את ${name} מהרשימה?`,
    retireLead: 'הרכב לא יוצע עוד לשיבוץ. גרסאות שכבר אושרו אינן משתנות.',
    save: 'שמירה',

    // --- workers: how each man gets there, where he is picked up, what he may drive
    workersLead: 'מי צריך הסעה היום? הרשימה נקראת מרישום היום ואינה משנה אותו.',
    statusLabel: name => `איך ${name} מגיע`,
    statusRide: 'בהסעה שלנו',
    statusPrivate: 'רכב פרטי',
    statusContractor: 'נוסע עם קבלן אחר',
    statusOther: 'אחר',
    areaLabel: name => `אזור האיסוף של ${name}`,
    noArea: 'בלי אזור',
    alsoAt: sites => `רשום היום גם ב${sites}. ההסעה לאתר הראשון.`,
    canDrive: 'רשאי לנהוג',
    cannotDrive: 'לא נוהג',
    drivesAll: 'כל הרכבים',
    drivesSome: n => (n === 1 ? 'רכב אחד' : `${n} רכבים`),
    drivesNone: 'לא נבחר רכב',
    drivesLabel: name => `באילו רכבים ${name} רשאי לנהוג`,
    notWorkingToday: n => (n === 1 ? 'עובד אחד בלי אתר היום – אינו בהסעות'
        : `${n} עובדים בלי אתר היום – אינם בהסעות`),
    areasTitle: n => `אזורי איסוף (${n})`,
    areasLead: 'האזורים שמהם אוספים עובדים. לכל עובד אזור אחד קבוע.',
    noAreas: 'עדיין אין אזורים. מוסיפים אזור, ואז בוחרים אזור לכל עובד.',
    addArea: 'הוספת אזור',
    renameArea: 'שינוי שם',
    removeArea: 'מחיקה',
    areaNameTitle: 'שם האזור',
    areaNameTaken: 'כבר יש אזור בשם הזה',
    removeAreaTitle: name => `למחוק את האזור ${name}?`,
    removeAreaLead: 'עובדים ששויכו לאזור הזה יישארו בלי אזור.',

    // --- the plan
    suggest: 'הצעת שיבוץ',
    accept: 'אישור התוכנית',
    draft: 'טיוטה – עדיין לא אושרה',
    acceptedVersion: n => `גרסה ${n} מאושרת`,
    changedSince: n => `יש שינויים שלא אושרו מאז גרסה ${n}`,
    recordChanged: 'רישום היום השתנה מאז שאושרה הגרסה',
    seatedCount: (a, b) => `משובצים ${a} מתוך ${b}`,
    planOk: 'התוכנית מלאה',
    errorsTitle: n => (n === 1 ? 'דבר אחד לתיקון' : `${n} דברים לתיקון`),
    warnTitle: 'לתשומת לב',
    unseatedTitle: n => `בלי מקום ברכב (${n})`,
    suggestDone: n => (n === 0 ? 'הוצע שיבוץ לכולם' : `הוצע שיבוץ. ${n} נשארו בלי מקום`),

    // --- what is wrong with a plan
    noDriver: v => `${v}: אין נהג`,
    driverNotEligible: (v, w) => `${v}: ${w} אינו רשאי לנהוג ברכב הזה`,
    overCapacity: (v, n) => `${v}: ${n} יותר ממספר המושבים`,
    twice: w => `${w} משובץ בשני רכבים`,
    hasStatus: (w, s) => `${w} משובץ ברכב אבל מסומן «${s}»`,
    notWorking: w => `${w} משובץ ברכב אבל אין לו אתר ברישום היום`,
    vehicleUnavailable: v => `${v} מסומן לא זמין היום ויש בו נוסעים`,
    unknownVehicle: 'רכב שהוצא מהרשימה ויש בו נוסעים',
    noSeat: w => `${w} בלי מקום ברכב`,
    badSeat: (v, w) => `${v}: המושב של ${w} אינו תקין`,
    otherArea: (v, w) => `${w} נאסף מאזור אחר מזה של ${v}`,
    deletedWorker: 'עובד שנמחק',
    deletedVehicle: 'רכב שהוצא מהרשימה',

    // --- one vehicle
    occupancy: (a, b) => `${a} מתוך ${b}`,
    notUsed: 'לא בשימוש',
    lockVehicle: 'נעילת הרכב',
    unlockVehicle: 'שחרור הרכב',
    vehicleLocked: 'הרכב נעול',
    pickup: 'אזור איסוף',
    destinations: 'יעדים',
    driver: name => `נהג: ${name}`,
    chooseDriver: 'בחירת נהג',
    driverDialogTitle: v => `מי נוהג ב${v}?`,
    driverDialogLead: 'מוצגים רק עובדים שרשאים לנהוג ברכב הזה.',
    driverNone: 'בלי נהג',
    noEligible: 'אין היום עובד שרשאי לנהוג ברכב הזה',
    lockWorker: name => `נעילת השיבוץ של ${name}`,
    unlockWorker: name => `שחרור השיבוץ של ${name}`,
    lock: 'נעילה',
    locked: 'נעול',
    moveHere: 'העברה לכאן',
    full: 'הרכב מלא',

    // --- moving a man
    moving: name => `מעבירים את ${name} – בוחרים רכב`,
    workerLockedNote: name => `${name} נעול – משחררים כדי להעביר`,
    cancel: 'ביטול',
    removeFromVehicle: 'הוצאה מהרכב',
    seat: 'מושב',
    seatNone: 'בלי מושב קבוע',
    seatFront: 'קדמי, ליד הנהג',
    seatRearRight: 'אחורי ימין',
    seatRearMiddle: 'אחורי אמצע',
    seatRearLeft: 'אחורי שמאל',
    seatRow: (row, place) => `שורה ${row}, מושב ${place}`,
    seatNumber: n => `מושב ${n}`,

    // --- accepting
    acceptTitle: 'אישור התוכנית',
    acceptComplete: 'התוכנית מלאה. לאשר אותה?',
    acceptIncomplete: n => (n === 1 ? 'התוכנית חלקית: דבר אחד לא סגור. אפשר לאשר רק עם סיבה.'
        : `התוכנית חלקית: ${n} דברים לא סגורים. אפשר לאשר רק עם סיבה.`),
    reasonLabel: 'למה מאשרים תוכנית חלקית?',
    reasonNeeded: 'צריך לכתוב סיבה',
    acceptYes: 'אישור',
    acceptPartial: 'אישור כתוכנית חלקית',
    nothingToAccept: 'אין שינויים לאשר',

    // --- versions
    historyTitle: 'היסטוריית גרסאות',
    noVersions: 'עדיין אין גרסה מאושרת',
    versionLine: (n, time) => `גרסה ${n} · ${time}`,
    complete: 'מלאה',
    partial: reason => `חלקית – ${reason}`,
    moved: (n, prev) => (n === 1 ? `עובד אחד שונה לעומת גרסה ${prev}` : `${n} עובדים שונו לעומת גרסה ${prev}`),
    tripLine: (vehicle, driver, n) => `${vehicle}: ${driver} + ${n} נוסעים`,

    // --- messages to the drivers
    messagesLead: 'הודעה לכל נהג. וואטסאפ נפתח עם ההודעה מוכנה, ושם לוחצים על שליחה.',
    noAccepted: 'אין תוכנית מאושרת. מאשרים את השיבוץ, ואז שולחים לנהגים.',
    draftDiffers: n => `ההודעות לפי גרסה ${n}. יש שינויים שלא אושרו.`,
    openWhatsapp: 'פתיחה בוואטסאפ',
    notOpened: 'עדיין לא נפתח',
    opened: 'נפתח בוואטסאפ',
    confirmSent: 'סימנתי שנשלח',
    sentMarked: time => `סומן כנשלח ב-${time}`,
    unmarkSent: 'ביטול הסימון',
    changedSinceMark: 'ההודעה השתנתה מאז שסומנה – כדאי לשלוח שוב',
    noPhone: 'אין מספר טלפון תקין',

    // --- the message a driver receives
    //   שלום סאמר,
    //   הסעה ליום שלישי 10/11/2026:
    //   רכב: טויוטה קורולה 2016
    //   איסוף: ערערה
    //   נוסעים (2):
    //   - ראמי – חדרה
    //   - דוד – חיפה
    //   יעדים: חיפה, חדרה
    // From the second accepted version on, a line «עדכון מספר N לתוכנית.» follows the
    // heading. No emoji: the proposal had none, and the owner may ask for the seder's.
    mHello: name => `שלום ${name},`,
    mHeading: (day, date) => `הסעה ל${day} ${date}:`,
    mUpdate: n => `עדכון מספר ${n - 1} לתוכנית.`,
    mVehicle: v => `רכב: ${v}`,
    mPickup: a => `איסוף: ${a}`,
    mPassengers: n => `נוסעים (${n}):`,
    mPassenger: (name, site) => `- ${name} – ${site}`,
    mAlone: 'בלי נוסעים.',
    mDestinations: sites => `יעדים: ${sites}`
});

// ================================================================== the store
//
// PREFERENCES AND PLANS, NOT THE RECORD. Written OPTIONAL and VERIFIED: optional, so on a
// full disk this never spends a payroll restore point to make room for a ride plan (that
// is what a required write does - js/store.js); verified, so a write the disk swallowed
// is not called kept (law 3). A write that did not land stays in this session's memory
// and the screen says so.
const TRANSPORT_ENABLED_KEY = 'farkadTransport:enabled';
const TRANSPORT_SETTINGS_KEY = 'farkadTransport:settings';
const TRANSPORT_DAY_PREFIX = 'farkadTransport:day:';
// Where bytes that would not read are put before anything is written over them.
const TRANSPORT_UNREADABLE = ':unreadable';
// Five weeks of plans. Older days are removed when the screen is opened: nobody sends
// last month's ride, and a store that only grows is a full disk on the phone that does
// the payroll. (Pruning is deletion, so it is said in docs/releases.md.)
const TRANSPORT_KEEP_DAYS = 35;
const TRANSPORT_MAX_SEATS = 20;
const TRANSPORT_NAME_MAX = 60;

// The seven the owner confirmed on 2026-11-09, by the names he uses. Put on the phone
// once, the first time the feature is opened there; after that the list is his - he
// adds, renames, re-seats and retires - and it is never re-seeded over his edits.
// The 9-seater is a Volkswagen: two in front (the driver one of them), then rows of
// two, two and three.
const TRANSPORT_SEED = Object.freeze([
    { id: 'tv_01', name: 'טויוטה קורולה 2013', seats: 5 },
    { id: 'tv_02', name: 'טויוטה קורולה 2016', seats: 5 },
    { id: 'tv_03', name: 'BYD סיל U 2025', seats: 5 },
    { id: 'tv_04', name: 'BYD אטו 3 2025', seats: 5 },
    { id: 'tv_05', name: 'פולקסווגן 2018', seats: 9, rows: [2, 2, 2, 3] },
    { id: 'tv_06', name: 'סוואנה 2010', seats: 5 },
    { id: 'tv_07', name: 'ליפמוטור C10 2026', seats: 5 }
]);

let transportOn = null;                       // the switch, once read
let transportSettingsMemory = null;
const transportDays = Object.create(null);    // date -> the day, as this session holds it
let transportKept = true;                     // did the last write reach the disk
let transportUnreadableSeen = false;          // something would not read, this session
// Keys whose unreadable bytes could NOT be copied aside. Nothing is written over those:
// the screen works from memory and says it is not being kept (law 10 - what will not
// read is never overwritten while it is the only copy).
const transportHeld = Object.create(null);

// The gate. Read once per session; the only transport key a phone with the feature off
// ever reads.
function transportEnabled() {
    if (transportOn === null) {
        let raw = null;
        try { raw = Store.get(TRANSPORT_ENABLED_KEY); } catch (error) { raw = null; }
        transportOn = raw === '1';
    }
    return transportOn;
}

function transportSetEnabled(on) {
    transportOn = Boolean(on);
    if (transportOn) Store.setVerified(TRANSPORT_ENABLED_KEY, '1', { optional: true });
    else Store.remove(TRANSPORT_ENABLED_KEY);
    if (!transportOn) closeTransport();
    transportInstallEntry();
    transportRenderSwitch();
    return transportOn;
}

function transportMap() { return Object.create(null); }

function transportCleanName(value) {
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, TRANSPORT_NAME_MAX) : '';
}

function transportEmptySettings() {
    return { version: 1, seeded: false, vehicles: [], areas: [], workers: transportMap() };
}

function transportEmptyDay() {
    return { version: 1, unavailable: transportMap(), status: transportMap(), trips: transportMap(),
        workerLocks: transportMap(), accepted: [], marks: transportMap() };
}

// JSON that is an object of this version, or null. Everything inside is then read
// leniently and validated strictly, one item at a time: an id that could land on a
// prototype, a seat count that is not one, a status nobody offers - each is dropped on
// its own, into maps with no prototype at all.
function transportJson(raw) {
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch (error) { return null; }
    return isPlainObject(parsed) && parsed.version === 1 ? parsed : null;
}

function transportReadVehicle(item) {
    if (!isPlainObject(item) || !isSafeId(item.id) || !/^tv_/.test(item.id)) return null;
    const name = transportCleanName(item.name);
    const seats = item.seats;
    if (!name || !Number.isInteger(seats) || seats < 2 || seats > TRANSPORT_MAX_SEATS) return null;
    const vehicle = { id: item.id, name, seats, active: item.active !== false };
    if (Array.isArray(item.rows) && item.rows.every(n => Number.isInteger(n) && n > 0)
        && item.rows.reduce((sum, n) => sum + n, 0) === seats) vehicle.rows = item.rows.slice();
    return vehicle;
}

function transportReadSettings(parsed) {
    const out = transportEmptySettings();
    out.seeded = parsed.seeded === true;
    const seen = transportMap();
    (Array.isArray(parsed.vehicles) ? parsed.vehicles : []).forEach(item => {
        const vehicle = transportReadVehicle(item);
        if (vehicle && !seen[vehicle.id]) { seen[vehicle.id] = true; out.vehicles.push(vehicle); }
    });
    (Array.isArray(parsed.areas) ? parsed.areas : []).forEach(item => {
        const name = isPlainObject(item) ? transportCleanName(item.name) : '';
        if (!name || !isSafeId(item.id) || !/^ta_/.test(item.id) || seen[item.id]) return;
        seen[item.id] = true;
        out.areas.push({ id: item.id, name });
    });
    if (isPlainObject(parsed.workers)) {
        Object.keys(parsed.workers).forEach(id => {
            const item = parsed.workers[id];
            if (!isSafeId(id) || !isPlainObject(item)) return;
            out.workers[id] = {
                area: isSafeId(item.area) ? item.area : null,
                canDrive: item.canDrive === true,
                drives: item.drives === 'all' ? 'all'
                    : (Array.isArray(item.drives) ? item.drives.filter(isSafeId) : [])
            };
        });
    }
    return out;
}

function transportReadTrip(item) {
    if (!isPlainObject(item)) return null;
    const passengers = [];
    (Array.isArray(item.passengers) ? item.passengers : []).forEach(id => {
        if (isSafeId(id) && passengers.indexOf(id) === -1) passengers.push(id);
    });
    const seats = transportMap();
    if (isPlainObject(item.seats)) {
        Object.keys(item.seats).forEach(id => {
            if (isSafeId(id) && Number.isInteger(item.seats[id])) seats[id] = item.seats[id];
        });
    }
    return { driver: isSafeId(item.driver) ? item.driver : null, passengers,
        area: isSafeId(item.area) ? item.area : null, locked: item.locked === true, seats };
}

function transportReadPlan(parsed, out) {
    const flags = (source, target) => {
        if (!isPlainObject(source)) return;
        Object.keys(source).forEach(id => { if (isSafeId(id) && source[id] === true) target[id] = true; });
    };
    flags(parsed.unavailable, out.unavailable);
    flags(parsed.workerLocks, out.workerLocks);
    if (isPlainObject(parsed.status)) {
        Object.keys(parsed.status).forEach(id => {
            // «ממתין» was in the proposal and is not a status (the owner, 2026-11-09): a
            // value nobody offers is dropped, and the man rides with us again.
            if (isSafeId(id) && TransportEngine.STATUSES.indexOf(parsed.status[id]) !== -1) {
                out.status[id] = parsed.status[id];
            }
        });
    }
    if (isPlainObject(parsed.trips)) {
        Object.keys(parsed.trips).forEach(id => {
            const trip = isSafeId(id) ? transportReadTrip(parsed.trips[id]) : null;
            if (trip) out.trips[id] = trip;
        });
    }
    return out;
}

function transportReadDay(parsed) {
    const out = transportReadPlan(parsed, transportEmptyDay());
    (Array.isArray(parsed.accepted) ? parsed.accepted : []).forEach(item => {
        if (!isPlainObject(item) || !isFiniteNumber(item.at) || typeof item.sig !== 'string') return;
        const plan = transportReadPlan(item, transportEmptyDay());
        const attendance = transportMap();
        if (isPlainObject(item.attendance)) {
            Object.keys(item.attendance).forEach(id => {
                if (isSafeId(id) && isSafeId(item.attendance[id])) attendance[id] = item.attendance[id];
            });
        }
        // Numbered by where it stands, never by what the bytes claim: versions are
        // append-only and a number read off a damaged record could repeat one.
        out.accepted.push({ n: out.accepted.length + 1, at: item.at, complete: item.complete === true,
            errors: Number.isInteger(item.errors) ? item.errors : 0,
            reason: typeof item.reason === 'string' ? item.reason.slice(0, 300) : '',
            sig: item.sig, moved: Number.isInteger(item.moved) ? item.moved : null,
            unavailable: plan.unavailable, status: plan.status, trips: plan.trips, attendance });
    });
    if (isPlainObject(parsed.marks)) {
        Object.keys(parsed.marks).forEach(id => {
            const mark = parsed.marks[id];
            if (!isSafeId(id) || !isPlainObject(mark) || typeof mark.sig !== 'string') return;
            out.marks[id] = { sig: mark.sig, openedAt: isFiniteNumber(mark.openedAt) ? mark.openedAt : null,
                sentAt: isFiniteNumber(mark.sentAt) ? mark.sentAt : null };
        });
    }
    return out;
}

// One key, read. Absent is empty and says nothing. Bytes that will not read are copied
// to <key>:unreadable (or :unreadable:2…5 beside an earlier, different copy) BEFORE the
// empty start can be saved over them, and the screen says so. If no copy could be kept,
// the key is held: this session works from memory and never writes over it.
function transportLoad(key, read, empty) {
    let raw = null;
    try { raw = Store.get(key); } catch (error) { raw = null; }
    if (raw === null || raw === undefined) return empty();
    const parsed = transportJson(raw);
    if (parsed) return read(parsed);

    transportUnreadableSeen = true;
    let copied = false;
    for (let n = 1; n <= 5 && !copied; n += 1) {
        const target = key + TRANSPORT_UNREADABLE + (n === 1 ? '' : ':' + n);
        const there = Store.get(target);
        if (there === raw) copied = true;
        else if (there === null) copied = Store.setVerified(target, raw, { optional: true }) === true;
    }
    if (!copied) transportHeld[key] = true;
    return empty();
}

function transportWrite(key, value) {
    if (transportHeld[key]) { transportKept = false; return false; }
    transportKept = Store.setVerified(key, JSON.stringify(value), { optional: true }) === true;
    return transportKept;
}

function transportSettings() {
    if (!transportEnabled()) return transportEmptySettings();
    if (!transportSettingsMemory) {
        transportSettingsMemory = transportLoad(TRANSPORT_SETTINGS_KEY, transportReadSettings, transportEmptySettings);
        if (!transportSettingsMemory.seeded) {
            // In memory now, on the disk with the first thing the person changes: opening
            // the screen to look is not a write.
            transportSettingsMemory.seeded = true;
            const have = transportMap();
            transportSettingsMemory.vehicles.forEach(vehicle => { have[vehicle.id] = true; });
            TRANSPORT_SEED.forEach(seed => {
                if (have[seed.id]) return;
                const vehicle = { id: seed.id, name: seed.name, seats: seed.seats, active: true };
                if (seed.rows) vehicle.rows = seed.rows.slice();
                transportSettingsMemory.vehicles.push(vehicle);
            });
        }
    }
    return transportSettingsMemory;
}

function transportSaveSettings() {
    return transportWrite(TRANSPORT_SETTINGS_KEY, transportSettings());
}

function transportDayOf(date) {
    if (!transportEnabled() || !isRealDate(date)) return transportEmptyDay();
    if (!transportDays[date]) {
        transportDays[date] = transportLoad(TRANSPORT_DAY_PREFIX + date, transportReadDay, transportEmptyDay);
    }
    return transportDays[date];
}

function transportSaveDay(date) {
    if (!transportEnabled() || !isRealDate(date)) return false;
    return transportWrite(TRANSPORT_DAY_PREFIX + date, transportDayOf(date));
}

function transportWasKept() { return transportKept; }
function transportSawUnreadable() { return transportUnreadableSeen; }

// Day records (and the copies of unreadable ones) older than TRANSPORT_KEEP_DAYS before
// `today`. A key under the prefix that does not carry a real date is left alone: it is
// not this function's to judge.
function transportPrune(today) {
    if (!transportEnabled() || !isRealDate(today)) return 0;
    const cutoff = addDays(today, -TRANSPORT_KEEP_DAYS);
    let removed = 0;
    Store.keys().forEach(key => {
        if (key.indexOf(TRANSPORT_DAY_PREFIX) !== 0) return;
        const date = key.slice(TRANSPORT_DAY_PREFIX.length, TRANSPORT_DAY_PREFIX.length + 10);
        if (!isRealDate(date) || !(date < cutoff)) return;
        Store.remove(key);
        delete transportDays[date];
        removed += 1;
    });
    return removed;
}

// ================================================================== what the day says
//
// The engine's input, read at the moment it is needed and never kept: the roster, the
// active sites, who is on which site (sederCrew - the one reading of "who is working"
// this app has for a message), and this phone's transport settings laid over the roster.
function transportContext(date) {
    const settings = transportSettings();
    const schedule = State.schedule || {};
    const crew = sederCrew(schedule, date, State.layer);
    const attendance = transportMap();
    const also = transportMap();
    crew.forEach(row => {
        if (!isSafeId(row.workerId)) return;
        // A man on two sites rides to the first his day holds; the rest are told, not routed.
        attendance[row.workerId] = row.sites[0].placeId;
        if (row.sites.length > 1) also[row.workerId] = row.sites.slice(1).map(site => site.name);
    });
    const workers = (schedule.workers || []).filter(worker => worker && isSafeId(worker.id)).map(worker => {
        const own = settings.workers[worker.id] || {};
        return { id: worker.id, name: worker.name, phone: worker.phone, area: own.area || null,
            canDrive: own.canDrive === true, drives: own.drives === 'all' ? 'all' : (own.drives || []).slice() };
    });
    return {
        workers,
        vehicles: settings.vehicles.filter(vehicle => vehicle.active),
        sites: (schedule.places || []).filter(place => place && place.active !== false)
            .map(place => ({ id: place.id, name: place.name })),
        areas: settings.areas,
        attendance,
        also
    };
}

function transportFind(list, id) {
    for (let i = 0; i < list.length; i += 1) if (list[i].id === id) return list[i];
    return null;
}

// RLI…PDI for a vehicle, where a person's name gets isolate()'s FSI…PDI. First-strong
// lets the text choose its own direction, which is right for «Ali Hassan» and wrong for
// «BYD סיל U 2025»: that name BEGINS with a Latin letter, takes a left-to-right base,
// and comes out as «U 2025 סיל BYD» in the middle of a Hebrew sentence - a different
// car, read aloud (measured on the prototype). A vehicle here is always named in a
// Hebrew sentence, so its base is right-to-left, whatever its first letter.
function transportRli(name) {
    return `⁧${name === null || name === undefined ? '' : String(name)}⁩`;
}

function transportWorkerName(ctx, id) {
    const worker = transportFind(ctx.workers, id);
    return worker ? worker.name : TRANSPORT_TEXT.deletedWorker;
}

// Every vehicle the list has ever had, retired ones too: an accepted version names the
// car it was accepted with.
function transportVehicleName(id) {
    const vehicle = transportFind(transportSettings().vehicles, id);
    return vehicle ? vehicle.name : TRANSPORT_TEXT.deletedVehicle;
}

function transportSiteName(ctx, id) {
    const site = transportFind(ctx.sites, id);
    if (site) return site.name;
    const place = ((State.schedule && State.schedule.places) || []).find(one => one && one.id === id);
    return place ? place.name : '';
}

function transportAreaName(ctx, id) {
    const area = transportFind(ctx.areas, id);
    return area ? area.name : '';
}

// The vehicles of a plan in the order of the list - never the order the trips happen to
// have been written in, which is whatever order a suggestion opened them.
function transportTripOrder(trips) {
    const rank = transportMap();
    transportSettings().vehicles.forEach((vehicle, index) => { rank[vehicle.id] = index; });
    const at = id => (rank[id] === undefined ? 1e9 : rank[id]);
    return Object.keys(trips).sort((a, b) => (at(a) - at(b)) || (a < b ? -1 : a > b ? 1 : 0));
}

function transportClock(ms) {
    const at = new Date(ms);
    return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
}

function transportStatusText(status) {
    return { private: TRANSPORT_TEXT.statusPrivate, contractor: TRANSPORT_TEXT.statusContractor,
        other: TRANSPORT_TEXT.statusOther }[status] || TRANSPORT_TEXT.statusRide;
}

function transportSeatText(vehicle, n) {
    const seat = TransportEngine.seatPlan(vehicle).find(one => one.n === n);
    if (!seat) return '';
    return { front: TRANSPORT_TEXT.seatFront, rearRight: TRANSPORT_TEXT.seatRearRight,
        rearMiddle: TRANSPORT_TEXT.seatRearMiddle, rearLeft: TRANSPORT_TEXT.seatRearLeft,
        row: TRANSPORT_TEXT.seatRow(seat.row, seat.place) }[seat.kind] || TRANSPORT_TEXT.seatNumber(n);
}

function transportIssueText(ctx, day, issue) {
    const T = TRANSPORT_TEXT;
    const v = issue.vehicle ? transportRli(transportVehicleName(issue.vehicle)) : '';
    const w = issue.worker ? isolate(transportWorkerName(ctx, issue.worker)) : '';
    switch (issue.code) {
    case 'noDriver': return T.noDriver(v);
    case 'driverNotEligible': return T.driverNotEligible(v, w);
    case 'overCapacity': return T.overCapacity(v, issue.n);
    case 'twice': return T.twice(w);
    case 'hasStatus': return T.hasStatus(w, transportStatusText(day.status[issue.worker]));
    case 'notWorking': case 'unknownWorker': return T.notWorking(w);
    case 'vehicleUnavailable': return T.vehicleUnavailable(v);
    case 'unknownVehicle': return T.unknownVehicle;
    case 'noSeat': return T.noSeat(w);
    case 'badSeat': return T.badSeat(v, w);
    case 'otherArea': return T.otherArea(v, w);
    default: return String(issue.code);
    }
}

// ================================================================== the plan, changed
//
// Every change is made to this session's copy of the day, tidied, and written to the
// day's own key. Each answers whether it did anything; none of them touches the record.

function transportTidy(day) {
    Object.keys(day.trips).forEach(vehicleId => {
        const trip = day.trips[vehicleId];
        Object.keys(trip.seats).forEach(id => { if (trip.passengers.indexOf(id) === -1) delete trip.seats[id]; });
        if (!trip.locked && TransportEngine.occupants(trip).length === 0) delete day.trips[vehicleId];
    });
    Object.keys(day.workerLocks).forEach(id => {
        if (!TransportEngine.seatOf(day, id)) delete day.workerLocks[id];
    });
}

function transportTrip(day, vehicleId, make) {
    if (!day.trips[vehicleId] && make) {
        day.trips[vehicleId] = { driver: null, passengers: [], area: null, locked: false, seats: transportMap() };
    }
    return day.trips[vehicleId] || null;
}

function transportVehicleLockedFor(day, workerId) {
    const at = TransportEngine.seatOf(day, workerId);
    return Boolean(at && day.trips[at].locked);
}

// Locked himself, or sitting in a locked vehicle: either way he does not move until a
// person unlocks - that is what a lock is for.
function transportFrozen(day, workerId) {
    return Boolean(day.workerLocks[workerId]) || transportVehicleLockedFor(day, workerId);
}

function transportUnseatIn(day, workerId) {
    const at = TransportEngine.seatOf(day, workerId);
    if (!at) return;
    const trip = day.trips[at];
    if (trip.driver === workerId) trip.driver = null;
    trip.passengers = trip.passengers.filter(id => id !== workerId);
    delete trip.seats[workerId];
}

function transportDone(date, day) {
    transportTidy(day);
    transportSaveDay(date);
    return true;
}

function transportSetAvailable(date, vehicleId, available) {
    if (!transportEnabled() || !isSafeId(vehicleId)) return false;
    const day = transportDayOf(date);
    if (available) delete day.unavailable[vehicleId];
    else day.unavailable[vehicleId] = true;
    return transportDone(date, day);
}

function transportSetStatus(date, workerId, status) {
    if (!transportEnabled() || !isSafeId(workerId)) return false;
    const day = transportDayOf(date);
    if (status && TransportEngine.STATUSES.indexOf(status) === -1) return false;
    if (status) {
        day.status[workerId] = status;
        // Out of his seat - unless a person locked the vehicle he is in: then the lock
        // wins, and validation says the two disagree.
        if (!transportVehicleLockedFor(day, workerId)) transportUnseatIn(day, workerId);
    } else delete day.status[workerId];
    return transportDone(date, day);
}

function transportSuggest(date) {
    if (!transportEnabled()) return null;
    const day = transportDayOf(date);
    const result = TransportEngine.suggest(transportContext(date), day);
    const trips = transportMap();
    Object.keys(result.trips).forEach(vehicleId => {
        trips[vehicleId] = transportReadTrip(result.trips[vehicleId]);
    });
    day.trips = trips;
    transportDone(date, day);
    return result;
}

function transportMove(date, workerId, vehicleId) {
    if (!transportEnabled() || !isSafeId(workerId) || !isSafeId(vehicleId)) return false;
    const day = transportDayOf(date);
    const ctx = transportContext(date);
    const vehicle = transportFind(ctx.vehicles, vehicleId);
    if (!vehicle || transportFrozen(day, workerId)) return false;
    if (TransportEngine.seatOf(day, workerId) === vehicleId) return false;
    const existing = transportTrip(day, vehicleId, false);
    if (existing && (existing.locked || TransportEngine.occupants(existing).length >= vehicle.seats)) return false;
    transportUnseatIn(day, workerId);
    const target = transportTrip(day, vehicleId, true);
    target.passengers.push(workerId);
    const worker = transportFind(ctx.workers, workerId);
    if (!target.area && worker) target.area = worker.area;
    return transportDone(date, day);
}

function transportUnseat(date, workerId) {
    if (!transportEnabled() || !isSafeId(workerId)) return false;
    const day = transportDayOf(date);
    if (transportFrozen(day, workerId) || !TransportEngine.seatOf(day, workerId)) return false;
    transportUnseatIn(day, workerId);
    return transportDone(date, day);
}

// The driver of a vehicle. ONLY a man who may drive it: the list on the screen offers
// nobody else, and this refuses anybody else whoever asks - a hand-made plan is the one
// place an ineligible driver could otherwise get in. `null` takes the driver out.
function transportSetDriver(date, vehicleId, workerId) {
    if (!transportEnabled() || !isSafeId(vehicleId)) return false;
    const day = transportDayOf(date);
    const ctx = transportContext(date);
    const vehicle = transportFind(ctx.vehicles, vehicleId);
    if (!vehicle) return false;
    const existing = transportTrip(day, vehicleId, false);
    if (existing && existing.locked) return false;
    if (workerId) {
        const worker = transportFind(ctx.workers, workerId);
        if (!TransportEngine.mayDrive(worker, vehicle) || !TransportEngine.isRider(ctx, day, workerId)) return false;
        if (transportFrozen(day, workerId) && TransportEngine.seatOf(day, workerId) !== vehicleId) return false;
        transportUnseatIn(day, workerId);
    }
    const trip = transportTrip(day, vehicleId, true);
    const old = trip.driver;
    // The man who was driving stays in the car, as a passenger.
    if (old && old !== workerId) { trip.driver = null; trip.passengers.push(old); }
    trip.driver = workerId || null;
    if (workerId) {
        // He leaves from his own home: the pickup area starts as the driver's.
        const worker = transportFind(ctx.workers, workerId);
        if (!trip.area || TransportEngine.occupants(trip).length === 1) trip.area = worker.area;
    }
    return transportDone(date, day);
}

function transportSetTripArea(date, vehicleId, areaId) {
    if (!transportEnabled()) return false;
    const day = transportDayOf(date);
    const trip = transportTrip(day, vehicleId, false);
    if (!trip || trip.locked) return false;
    trip.area = areaId && transportFind(transportSettings().areas, areaId) ? areaId : null;
    return transportDone(date, day);
}

function transportSetSeat(date, workerId, n) {
    if (!transportEnabled()) return false;
    const day = transportDayOf(date);
    const at = TransportEngine.seatOf(day, workerId);
    const trip = at ? day.trips[at] : null;
    if (!trip || trip.locked || trip.driver === workerId) return false;
    if (n) {
        const vehicle = transportFind(transportSettings().vehicles, at);
        if (!vehicle || !TransportEngine.seatPlan(vehicle).some(seat => seat.n === n)) return false;
        Object.keys(trip.seats).forEach(other => { if (trip.seats[other] === n) delete trip.seats[other]; });
        trip.seats[workerId] = n;
    } else delete trip.seats[workerId];
    return transportDone(date, day);
}

function transportToggleVehicleLock(date, vehicleId) {
    if (!transportEnabled() || !isSafeId(vehicleId)) return false;
    const day = transportDayOf(date);
    const trip = transportTrip(day, vehicleId, true);
    trip.locked = !trip.locked;
    return transportDone(date, day);
}

function transportToggleWorkerLock(date, workerId) {
    if (!transportEnabled() || !isSafeId(workerId)) return false;
    const day = transportDayOf(date);
    if (!TransportEngine.seatOf(day, workerId) || transportVehicleLockedFor(day, workerId)) return false;
    if (day.workerLocks[workerId]) delete day.workerLocks[workerId];
    else day.workerLocks[workerId] = true;
    return transportDone(date, day);
}

function transportLastVersion(date) {
    const accepted = transportDayOf(date).accepted;
    return accepted.length ? accepted[accepted.length - 1] : null;
}

function transportSignature(date) {
    return TransportEngine.planSignature(transportContext(date), transportDayOf(date));
}

function transportErrors(date) {
    return TransportEngine.validate(transportContext(date), transportDayOf(date))
        .filter(issue => issue.level === 'error');
}

// Accepting makes a version: a frozen copy of the plan and of who was on which site
// when it was accepted. Versions are append-only on this phone - never edited, never
// removed, except with their whole day when it ages out.
//   { ok: true, n }  |  { ok: false, error: 'unchanged' | 'reason' | 'off' }
// AN INCOMPLETE PLAN IS ACCEPTED ONLY WITH A TYPED REASON. The evening a car is short
// is a real evening and the plan still has to go out - but "partial" with no word why
// is what the next person to open it cannot act on.
function transportAccept(date, reason) {
    if (!transportEnabled() || !isRealDate(date)) return { ok: false, error: 'off' };
    const day = transportDayOf(date);
    const ctx = transportContext(date);
    const sig = TransportEngine.planSignature(ctx, day);
    const last = transportLastVersion(date);
    if (last && last.sig === sig) return { ok: false, error: 'unchanged' };
    const errors = TransportEngine.validate(ctx, day).filter(issue => issue.level === 'error').length;
    const why = typeof reason === 'string' ? reason.replace(/\s+/g, ' ').trim().slice(0, 300) : '';
    if (errors > 0 && why.length < 2) return { ok: false, error: 'reason' };
    const frozen = transportReadPlan(JSON.parse(JSON.stringify(
        { unavailable: day.unavailable, status: day.status, trips: day.trips })), transportEmptyDay());
    const attendance = transportMap();
    Object.keys(ctx.attendance).forEach(id => { attendance[id] = ctx.attendance[id]; });
    day.accepted.push({ n: day.accepted.length + 1, at: Date.now(), complete: errors === 0, errors,
        reason: errors === 0 ? '' : why, sig,
        moved: last ? TransportEngine.movedBetween(ctx, last, day) : null,
        unavailable: frozen.unavailable, status: frozen.status, trips: frozen.trips, attendance });
    transportSaveDay(date);
    return { ok: true, n: day.accepted.length };
}

// Whether the day record has moved since a version was accepted - a man taken off a
// site, another put on one. The version is not changed by that (it is frozen); the
// screen says the two no longer agree.
function transportRecordChanged(date, version) {
    const now = transportContext(date).attendance;
    const ids = Object.keys(now);
    return ids.length !== Object.keys(version.attendance).length
        || ids.some(id => version.attendance[id] !== now[id]);
}

// ================================================================== the driver's message

// What one driver is sent for one accepted version. Names are read from the roster and
// the vehicle list as they are NOW; who sits where and who goes to which site are the
// version's own, frozen. Every name isolated - a person's by isolate(), a vehicle's by
// transportRli() (above).
function transportDriverMessage(date, version, vehicleId) {
    const T = TRANSPORT_TEXT;
    const ctx = transportContext(date);
    const trip = version.trips[vehicleId];
    if (!trip || !trip.driver) return '';
    const parsed = parseLocalDate(date);
    const siteOf = id => isolate(transportSiteName(ctx, version.attendance[id]));
    const lines = [T.mHello(isolate(transportWorkerName(ctx, trip.driver))),
        T.mHeading(hebrewDayName(parsed), formatFullDate(parsed))];
    if (version.n > 1) lines.push(T.mUpdate(version.n));
    lines.push(T.mVehicle(transportRli(transportVehicleName(vehicleId))));
    const area = transportAreaName(ctx, trip.area);
    if (area) lines.push(T.mPickup(isolate(area)));
    if (trip.passengers.length === 0) lines.push(T.mAlone);
    else {
        lines.push(T.mPassengers(trip.passengers.length));
        trip.passengers.forEach(id => {
            lines.push(T.mPassenger(isolate(transportWorkerName(ctx, id)), siteOf(id)));
        });
    }
    const sites = TransportEngine.tripSites({ sites: ctx.sites, attendance: version.attendance }, trip)
        .map(id => isolate(transportSiteName(ctx, id)));
    if (sites.length) lines.push(T.mDestinations(sites.join(', ')));
    return lines.join('\n');
}

// The driver's number as wa.me takes it - the seder's own rule, not a second one: only a
// plain Israeli mobile, and anything else is NO NUMBER rather than a guess that opens a
// chat with a stranger (js/ui/seder.js, sederWaNumber).
function transportDriverNumber(date, version, vehicleId) {
    const trip = version.trips[vehicleId];
    const worker = trip && trip.driver ? transportFind(transportContext(date).workers, trip.driver) : null;
    return worker ? sederWaNumber(worker.phone) : '';
}

// What a mark is checked against: the number and the words, by the seder's fingerprint.
function transportMessageSig(number, text) {
    return sederSig({ number }, text);
}

// 'nophone' | 'none' | 'opened' | 'sent' | 'changed'. A MARK IS BELIEVED ONLY WHILE THE
// MESSAGE IS THE ONE IT WAS MADE ON: a later version that changes this driver's words,
// a corrected number, a renamed passenger - each is a different fingerprint, and the
// card stops saying a message went out that is not the message there is.
function transportMarkState(date, vehicleId) {
    const version = transportLastVersion(date);
    if (!version) return 'none';
    const number = transportDriverNumber(date, version, vehicleId);
    if (!number) return 'nophone';
    const mark = transportDayOf(date).marks[vehicleId];
    if (!mark) return 'none';
    if (mark.sig !== transportMessageSig(number, transportDriverMessage(date, version, vehicleId))) return 'changed';
    return mark.sentAt ? 'sent' : 'opened';
}

function transportMark(date, vehicleId, change) {
    if (!transportEnabled() || !isSafeId(vehicleId)) return false;
    const version = transportLastVersion(date);
    const number = version ? transportDriverNumber(date, version, vehicleId) : '';
    if (!number) return false;
    const day = transportDayOf(date);
    const sig = transportMessageSig(number, transportDriverMessage(date, version, vehicleId));
    const old = day.marks[vehicleId];
    const mark = old && old.sig === sig ? old : { sig, openedAt: null, sentAt: null };
    change(mark);
    if (mark.openedAt === null && mark.sentAt === null) delete day.marks[vehicleId];
    else day.marks[vehicleId] = mark;
    transportSaveDay(date);
    return true;
}

// The link was tapped. The app cannot see whether send was pressed in WhatsApp, so this
// says "opened" and never "sent".
function transportMarkOpened(date, vehicleId) {
    return transportMark(date, vehicleId, mark => { mark.openedAt = Date.now(); });
}

// «סימנתי שנשלח» is the PERSON'S statement, made by his own tap, and is worded as his.
function transportMarkSent(date, vehicleId, sent) {
    return transportMark(date, vehicleId, mark => { mark.sentAt = sent ? Date.now() : null; });
}

// ================================================================== the lists, changed

function transportNameProblem(name, list, selfId, taken) {
    if (!name) return TRANSPORT_TEXT.nameNeeded;
    return list.some(item => item.id !== selfId && item.active !== false && item.name === name) ? taken : null;
}

function transportAddVehicle(name, seats) {
    if (!transportEnabled()) return null;
    const settings = transportSettings();
    const clean = transportCleanName(name);
    if (transportNameProblem(clean, settings.vehicles, null, TRANSPORT_TEXT.vehicleNameTaken)) return null;
    if (!Number.isInteger(seats) || seats < 2 || seats > TRANSPORT_MAX_SEATS) return null;
    const vehicle = { id: newEntityId('tv'), name: clean, seats, active: true };
    settings.vehicles.push(vehicle);
    transportSaveSettings();
    return vehicle.id;
}

function transportRenameVehicle(vehicleId, name) {
    if (!transportEnabled()) return false;
    const settings = transportSettings();
    const vehicle = transportFind(settings.vehicles, vehicleId);
    const clean = transportCleanName(name);
    if (!vehicle || transportNameProblem(clean, settings.vehicles, vehicleId, TRANSPORT_TEXT.vehicleNameTaken)) return false;
    vehicle.name = clean;
    transportSaveSettings();
    return true;
}

function transportSetVehicleSeats(vehicleId, seats) {
    if (!transportEnabled()) return false;
    const vehicle = transportFind(transportSettings().vehicles, vehicleId);
    if (!vehicle || !Number.isInteger(seats) || seats < 2 || seats > TRANSPORT_MAX_SEATS) return false;
    // A row layout belongs to the seat count it was drawn for. A different count and the
    // rows would name seats the vehicle does not have, so they go, and the seats are
    // numbered until somebody says how they are arranged.
    if (vehicle.seats !== seats) delete vehicle.rows;
    vehicle.seats = seats;
    transportSaveSettings();
    return true;
}

// Retired, not removed: it is no longer offered or suggested, and an accepted version
// that named it still does.
function transportRetireVehicle(vehicleId) {
    if (!transportEnabled()) return false;
    const vehicle = transportFind(transportSettings().vehicles, vehicleId);
    if (!vehicle) return false;
    vehicle.active = false;
    transportSaveSettings();
    return true;
}

function transportAddArea(name) {
    if (!transportEnabled()) return null;
    const settings = transportSettings();
    const clean = transportCleanName(name);
    if (transportNameProblem(clean, settings.areas, null, TRANSPORT_TEXT.areaNameTaken)) return null;
    const area = { id: newEntityId('ta'), name: clean };
    settings.areas.push(area);
    transportSaveSettings();
    return area.id;
}

function transportRenameArea(areaId, name) {
    if (!transportEnabled()) return false;
    const settings = transportSettings();
    const area = transportFind(settings.areas, areaId);
    const clean = transportCleanName(name);
    if (!area || transportNameProblem(clean, settings.areas, areaId, TRANSPORT_TEXT.areaNameTaken)) return false;
    area.name = clean;
    transportSaveSettings();
    return true;
}

function transportRemoveArea(areaId) {
    if (!transportEnabled()) return false;
    const settings = transportSettings();
    if (!transportFind(settings.areas, areaId)) return false;
    settings.areas = settings.areas.filter(area => area.id !== areaId);
    Object.keys(settings.workers).forEach(id => {
        if (settings.workers[id].area === areaId) settings.workers[id].area = null;
    });
    transportSaveSettings();
    return true;
}

// One worker's transport settings on this phone: { area, canDrive, drives }. Keyed by
// the roster's id and nothing of the roster is copied - no name, no phone, no rate - so
// renaming or deleting a man is never blocked by a plan that names him, and nothing
// here can bring him back.
function transportSetWorker(workerId, patch) {
    if (!transportEnabled() || !isSafeId(workerId) || !isPlainObject(patch)) return false;
    const settings = transportSettings();
    const own = settings.workers[workerId] || { area: null, canDrive: false, drives: [] };
    if (Object.prototype.hasOwnProperty.call(patch, 'area')) {
        own.area = patch.area && transportFind(settings.areas, patch.area) ? patch.area : null;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'canDrive')) {
        own.canDrive = patch.canDrive === true;
        // Turned on with nothing chosen is "every vehicle": the common case, one tap.
        if (own.canDrive && own.drives !== 'all' && own.drives.length === 0) own.drives = 'all';
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'drives')) {
        own.drives = patch.drives === 'all' ? 'all'
            : (Array.isArray(patch.drives) ? patch.drives.filter(id => transportFind(settings.vehicles, id)) : []);
    }
    settings.workers[workerId] = own;
    transportSaveSettings();
    return true;
}

// ================================================================== the screen

let transportDate = null;        // the day the open panel is about; fixed while it is open
let transportTab = 'plan';
let transportSelected = null;    // the man being moved
let transportPicking = null;     // the vehicle whose driver list is open
let transportSaid = '';
let transportReturnFocus = null;
let transportLastKey = null;     // the last control used on the panel, by its data-tk
let transportAreasOpen = false; // the areas editor, left open or shut across redraws

function transportParts() {
    const get = id => document.getElementById(id);
    return { panel: get('transportPanel'), title: get('transportTitle'), context: get('transportContext'),
        close: get('transportClose'), tabs: get('transportTabs'), note: get('transportNote'),
        body: get('transportBody'), live: get('transportLive') };
}

function transportIsOpen() {
    const panel = typeof document !== 'undefined' ? document.getElementById('transportPanel') : null;
    return Boolean(panel && panel.classList && panel.classList.contains('open'));
}

function openTransport(date) {
    if (!transportEnabled()) return false;
    const parts = transportParts();
    if (!parts.panel || !parts.body) return false;
    transportDate = isRealDate(date) ? date : State.date;
    transportTab = 'plan';
    transportSelected = null;
    transportPicking = null;
    transportSaid = '';
    transportPrune(todayStr());
    // One dialog at a time: the WhatsApp dialog this was entered from steps aside.
    if (typeof closeShareModal === 'function') closeShareModal();
    renderTransport();
    parts.panel.classList.add('open');
    parts.panel.setAttribute('aria-hidden', 'false');
    parts.body.scrollTop = 0;
    document.addEventListener('keydown', transportKeydown);
    if (!parts.panel.dataset.watched) {
        parts.panel.dataset.watched = '1';
        // Which control was last used, recorded as it happens: after one of the app's own
        // questions closes, js/ui/modal.js gives the keyboard back to the button that
        // asked - and that button has just been redrawn, so the node it remembers is no
        // longer in the page. The redraw finds its successor by this key instead.
        parts.panel.addEventListener('click', event => {
            const node = event.target && event.target.closest ? event.target.closest('[data-tk]') : null;
            if (node) transportLastKey = node.dataset.tk;
        }, true);
    }
    transportLastKey = null;
    // AFTER js/ui/modal.js has given focus back for the dialog that just closed. That
    // hand-back runs from a MutationObserver, at the end of this task - later than
    // anything done here - so a heading focused now would lose the keyboard to the
    // WhatsApp button a moment after. What it gives focus back TO is where this panel
    // returns it on the way out.
    setTimeout(() => {
        if (!transportIsOpen()) return;
        const active = document.activeElement;
        transportReturnFocus = active && active !== document.body && !parts.panel.contains(active) ? active : null;
        void parts.panel.offsetHeight;
        if (parts.title && parts.title.focus) parts.title.focus({ preventScroll: true });
    }, 0);
    return true;
}

function closeTransport() {
    const parts = transportParts();
    if (!parts.panel || !transportIsOpen()) return;
    parts.panel.classList.remove('open');
    parts.panel.setAttribute('aria-hidden', 'true');
    document.removeEventListener('keydown', transportKeydown);
    transportDate = null;
    transportSelected = null;
    transportPicking = null;
    const back = transportReturnFocus;
    transportReturnFocus = null;
    if (back && document.contains(back) && back.focus) back.focus({ preventScroll: true });
}

// The settings sheet's contract (js/ui/settings.js), by the pieces js/ui/modal.js already
// has: Escape steps back one thing at a time - the man being moved, the driver list, then
// the panel - and Tab stays inside. While one of the app's own dialogs is up over this
// panel (a question from js/ui/ask.js), the keyboard is that dialog's and this stands by.
//
// `defaultPrevented` is how an Escape that has ALREADY closed such a dialog is told from
// one that has not. js/ui/modal.js listens on the same document and was registered first:
// by the time this runs it has closed the question and no dialog is open any more - so
// asking "is a dialog open?" alone let one Escape answer the question AND close the panel
// behind it, and the plan somebody was in the middle of accepting was gone from the
// screen. modal.js marks the key it handled; a key it marked is not this panel's.
function transportKeydown(event) {
    if (event.defaultPrevented) return;
    if (typeof openModals === 'function' && openModals().length > 0) return;
    const parts = transportParts();
    if (event.key === 'Escape') {
        event.preventDefault();
        if (transportSelected || transportPicking) {
            transportSelected = null;
            transportPicking = null;
            renderTransport();
        } else closeTransport();
        return;
    }
    if (event.key === 'Tab' && typeof trapTab === 'function' && parts.panel) trapTab(event, parts.panel);
}

function renderTransportIfOpen() {
    if (transportIsOpen() && transportEnabled()) renderTransport();
}

// A button of this panel. Tonal unless it is THE button of the view (`primary`): the
// base <button> of css/app.css is the filled one, and a screen where every button is
// filled has no first button. `key` is what the keyboard is given back by after a redraw.
function transportButton(text, key, onClick, primary) {
    const node = button(text, primary ? 'transport-primary' : 'btn-secondary', onClick);
    if (key) node.dataset.tk = key;
    return node;
}

function transportToggle(text, key, pressed, onClick) {
    const node = transportButton(text, key, onClick, false);
    node.classList.add('transport-toggle');
    node.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    return node;
}

function transportSelect(key, label, options, value, onChange) {
    const select = document.createElement('select');
    select.className = 'transport-select';
    select.dataset.tk = key;
    select.setAttribute('aria-label', label);
    options.forEach(([optionValue, text]) => {
        const option = document.createElement('option');
        option.value = optionValue;
        option.textContent = text;
        if (optionValue === value) option.selected = true;
        select.appendChild(option);
    });
    select.addEventListener('change', () => onChange(select.value));
    return select;
}

// A site, in the site's own fixed colour (js/ui/sitecolor.js) - the colour that already
// means that site on the day screen. No button here borrows it.
function transportSiteChip(ctx, siteId) {
    const chip = el('span', 'transport-site');
    paintSite(chip, siteId);
    appendSiteName(chip, siteId, transportSiteName(ctx, siteId));
    return chip;
}

function transportBadge(text, kind) {
    return el('span', 'transport-badge' + (kind ? ' transport-badge-' + kind : ''), text);
}

function transportAct(change) {
    change();
    renderTransport();
}

function renderTransport() {
    const parts = transportParts();
    if (!parts.body || !transportDate) return;
    const T = TRANSPORT_TEXT;
    const date = transportDate;
    const parsed = parseLocalDate(date);
    const ctx = transportContext(date);
    const day = transportDayOf(date);
    if (transportSelected && !ctx.attendance[transportSelected]) transportSelected = null;

    // The whole body is rebuilt; the control that had the keyboard gets it back, and the
    // list stays where it was scrolled to.
    const active = document.activeElement;
    const asking = typeof openModals === 'function' && openModals().length > 0;
    const focused = active && parts.panel.contains(active) ? (active.dataset.tk || null)
        : (!asking && transportIsOpen() ? transportLastKey : null);
    const scrolled = parts.body.scrollTop;

    parts.title.textContent = T.title;
    parts.context.textContent = `${hebrewDayName(parsed)} ${formatFullDate(parsed)}`;
    parts.close.textContent = T.back;

    clear(parts.tabs);
    [['plan', T.tabPlan], ['vehicles', T.tabVehicles], ['workers', T.tabWorkers], ['messages', T.tabMessages]]
        .forEach(([id, label]) => {
            const tab = transportButton(label, 'tab:' + id, () => {
                transportTab = id;
                transportSelected = null;
                transportPicking = null;
                transportSaid = '';
                renderTransport();
                parts.body.scrollTop = 0;
            }, false);
            tab.classList.add('transport-tab');
            tab.setAttribute('role', 'tab');
            tab.setAttribute('aria-selected', transportTab === id ? 'true' : 'false');
            parts.tabs.appendChild(tab);
        });

    clear(parts.body);
    const draw = { plan: transportPlanView, vehicles: transportVehiclesView, workers: transportWorkersView,
        messages: transportMessagesView }[transportTab];
    parts.body.appendChild(draw(ctx, day, date));

    // After the view is drawn: reading a record is what finds out it will not read.
    const notes = [];
    if (transportUnreadableSeen) notes.push(T.unreadable);
    if (!transportKept) notes.push(T.notKept);
    parts.note.textContent = notes.join(' ');
    parts.note.hidden = notes.length === 0;

    // A live region outside the rebuilt body, written only when its sentence changes
    // (sayOnce, js/sync/status.js): one that is destroyed and rebuilt announces nothing.
    if (typeof sayOnce === 'function') sayOnce(parts.live, transportSaid);
    else if (parts.live.textContent !== transportSaid) parts.live.textContent = transportSaid;

    parts.body.scrollTop = scrolled;
    // Found by comparing values, never by a selector built from an id.
    if (focused) {
        const again = [...parts.panel.querySelectorAll('[data-tk]')].find(node => node.dataset.tk === focused);
        if (again && !again.disabled && again !== document.activeElement) again.focus({ preventScroll: true });
    }
}

// ------------------------------------------------------------------ שיבוץ

function transportPersonRow(ctx, day, workerId, seatText) {
    const T = TRANSPORT_TEXT;
    const row = transportButton('', 'w:' + workerId, () => transportAct(() => {
        transportSelected = transportSelected === workerId ? null : workerId;
        transportPicking = null;
    }), false);
    row.classList.add('transport-person');
    row.setAttribute('aria-pressed', transportSelected === workerId ? 'true' : 'false');
    row.appendChild(el('span', 'transport-name', transportWorkerName(ctx, workerId)));
    const tags = el('span', 'transport-tags');
    if (seatText) tags.appendChild(transportBadge(seatText));
    if (day.workerLocks[workerId]) tags.appendChild(transportBadge(T.locked, 'lock'));
    if (ctx.attendance[workerId]) tags.appendChild(transportSiteChip(ctx, ctx.attendance[workerId]));
    row.appendChild(tags);
    return row;
}

function transportDriverPicker(ctx, day, date, vehicle) {
    const T = TRANSPORT_TEXT;
    const trip = day.trips[vehicle.id] || null;
    const box = el('div', 'transport-picker');
    box.appendChild(el('h4', 'transport-picker-title', T.driverDialogTitle(transportRli(vehicle.name))));
    box.appendChild(el('p', 'hint', T.driverDialogLead));
    // ONLY the men who may drive THIS vehicle and are riding today. Nobody else is on
    // the list to be tapped by mistake.
    const eligible = TransportEngine.riders(ctx, day)
        .filter(id => TransportEngine.mayDrive(transportFind(ctx.workers, id), vehicle));
    if (eligible.length === 0) box.appendChild(el('p', 'transport-error', T.noEligible));
    eligible.forEach(id => {
        const at = TransportEngine.seatOf(day, id);
        const current = Boolean(trip && trip.driver === id);
        const blocked = !current && transportFrozen(day, id) && at !== vehicle.id;
        const pick = transportButton('', 'pick:' + id, () => transportAct(() => {
            transportSetDriver(date, vehicle.id, id);
            transportPicking = null;
        }), false);
        pick.classList.add('transport-person');
        pick.dataset.pick = id;
        pick.disabled = blocked;
        pick.setAttribute('aria-pressed', current ? 'true' : 'false');
        pick.appendChild(el('span', 'transport-name', transportWorkerName(ctx, id)));
        const tags = el('span', 'transport-tags');
        if (blocked) tags.appendChild(transportBadge(T.locked, 'lock'));
        if (at && at !== vehicle.id) tags.appendChild(transportBadge(transportVehicleName(at)));
        tags.appendChild(transportSiteChip(ctx, ctx.attendance[id]));
        pick.appendChild(tags);
        box.appendChild(pick);
    });
    const foot = el('div', 'transport-row');
    if (trip && trip.driver) {
        const none = transportButton(T.driverNone, 'pick:none', () => transportAct(() => {
            transportSetDriver(date, vehicle.id, null);
            transportPicking = null;
        }), false);
        none.dataset.pick = '';
        foot.appendChild(none);
    }
    foot.appendChild(transportButton(T.cancel, 'pick:cancel', () => transportAct(() => { transportPicking = null; }), false));
    box.appendChild(foot);
    return box;
}

function transportVehicleCard(ctx, day, date, vehicle) {
    const T = TRANSPORT_TEXT;
    const trip = day.trips[vehicle.id] || null;
    const people = trip ? TransportEngine.occupants(trip) : [];
    const locked = Boolean(trip && trip.locked);
    const card = el('section', 'transport-card');
    card.dataset.vehicle = vehicle.id;

    const head = el('div', 'transport-row');
    const titles = el('div', 'transport-grow');
    titles.appendChild(el('h3', 'transport-vehicle-name', vehicle.name));
    const sub = el('div', 'transport-row transport-wrap');
    sub.appendChild(transportBadge(people.length ? T.occupancy(people.length, vehicle.seats) : T.notUsed,
        people.length > vehicle.seats ? 'bad' : ''));
    if (locked) sub.appendChild(transportBadge(T.vehicleLocked, 'lock'));
    titles.appendChild(sub);
    head.appendChild(titles);
    const lock = transportToggle(locked ? T.unlockVehicle : T.lockVehicle, 'lockV:' + vehicle.id, locked,
        () => transportAct(() => transportToggleVehicleLock(date, vehicle.id)));
    lock.dataset.lockVehicle = vehicle.id;
    head.appendChild(lock);
    card.appendChild(head);

    if (people.length > 0) {
        if (ctx.areas.length > 0) {
            const options = [['', `${T.pickup}: ${T.noArea}`]]
                .concat(ctx.areas.map(area => [area.id, `${T.pickup}: ${area.name}`]));
            const area = transportSelect('area:' + vehicle.id, `${T.pickup} – ${vehicle.name}`, options,
                trip.area && transportFind(ctx.areas, trip.area) ? trip.area : '',
                value => transportAct(() => transportSetTripArea(date, vehicle.id, value || null)));
            area.disabled = locked;
            card.appendChild(area);
        }
        const sites = TransportEngine.tripSites(ctx, trip);
        if (sites.length > 0) {
            const line = el('div', 'transport-row transport-wrap');
            line.appendChild(el('span', 'transport-sub', `${T.destinations}:`));
            sites.forEach(siteId => line.appendChild(transportSiteChip(ctx, siteId)));
            card.appendChild(line);
        }
    }

    const driverRow = el('div', 'transport-row');
    const driverBtn = transportButton('', 'driver:' + vehicle.id, () => transportAct(() => {
        transportPicking = transportPicking === vehicle.id ? null : vehicle.id;
        transportSelected = null;
    }), false);
    driverBtn.classList.add('transport-person', 'transport-grow');
    if (people.length > 0 && !(trip && trip.driver)) driverBtn.classList.add('transport-missing');
    driverBtn.dataset.driver = vehicle.id;
    driverBtn.disabled = locked;
    driverBtn.setAttribute('aria-expanded', transportPicking === vehicle.id ? 'true' : 'false');
    driverBtn.appendChild(el('span', 'transport-name', trip && trip.driver
        ? T.driver(isolate(transportWorkerName(ctx, trip.driver))) : T.chooseDriver));
    if (trip && trip.driver && ctx.attendance[trip.driver]) {
        const tags = el('span', 'transport-tags');
        tags.appendChild(transportSiteChip(ctx, ctx.attendance[trip.driver]));
        driverBtn.appendChild(tags);
    }
    driverRow.appendChild(driverBtn);
    if (trip && trip.driver) {
        const driverLocked = Boolean(day.workerLocks[trip.driver]);
        const name = isolate(transportWorkerName(ctx, trip.driver));
        const lockDriver = transportToggle(driverLocked ? T.locked : T.lock, 'lockW:' + trip.driver, driverLocked,
            () => transportAct(() => transportToggleWorkerLock(date, trip.driver)));
        lockDriver.setAttribute('aria-label', driverLocked ? T.unlockWorker(name) : T.lockWorker(name));
        lockDriver.disabled = locked;
        driverRow.appendChild(lockDriver);
    }
    card.appendChild(driverRow);
    if (transportPicking === vehicle.id && !locked) card.appendChild(transportDriverPicker(ctx, day, date, vehicle));

    if (trip) {
        trip.passengers.forEach(id => {
            card.appendChild(transportPersonRow(ctx, day, id,
                trip.seats[id] ? transportSeatText(vehicle, trip.seats[id]) : ''));
        });
    }
    if (transportSelected && TransportEngine.seatOf(day, transportSelected) !== vehicle.id) {
        const isFull = people.length >= vehicle.seats;
        const here = transportButton(locked ? T.vehicleLocked : isFull ? T.full : T.moveHere, 'moveTo:' + vehicle.id,
            () => transportAct(() => {
                if (transportMove(date, transportSelected, vehicle.id)) transportSelected = null;
            }), false);
        here.classList.add('transport-move-here');
        here.dataset.moveTo = vehicle.id;
        here.disabled = locked || isFull || transportFrozen(day, transportSelected);
        card.appendChild(here);
    }
    return card;
}

// A trip in a vehicle the list no longer has (retired after the plan was drawn). Its men
// are still shown, and can be tapped and moved out; nothing can be moved in.
function transportOrphanCard(ctx, day, vehicleId) {
    const card = el('section', 'transport-card');
    card.dataset.vehicle = vehicleId;
    card.appendChild(el('h3', 'transport-vehicle-name', transportVehicleName(vehicleId)));
    card.appendChild(transportBadge(TRANSPORT_TEXT.deletedVehicle, 'bad'));
    TransportEngine.occupants(day.trips[vehicleId]).forEach(id => card.appendChild(transportPersonRow(ctx, day, id, '')));
    return card;
}

function transportMoveBar(ctx, day, date) {
    const T = TRANSPORT_TEXT;
    const id = transportSelected;
    const name = isolate(transportWorkerName(ctx, id));
    const at = TransportEngine.seatOf(day, id);
    const trip = at ? day.trips[at] : null;
    const inLockedVehicle = transportVehicleLockedFor(day, id);
    const bar = el('div', 'transport-movebar');
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', T.moving(name));
    bar.appendChild(el('p', 'transport-name', inLockedVehicle ? T.vehicleLocked
        : day.workerLocks[id] ? T.workerLockedNote(name) : T.moving(name)));

    const vehicle = at ? transportFind(ctx.vehicles, at) : null;
    if (trip && vehicle && trip.driver !== id && !trip.locked) {
        const options = [['', `${T.seat}: ${T.seatNone}`]].concat(TransportEngine.seatPlan(vehicle)
            .map(seat => [String(seat.n), `${T.seat}: ${transportSeatText(vehicle, seat.n)}`]));
        bar.appendChild(transportSelect('seat', `${T.seat} – ${name}`, options,
            trip.seats[id] ? String(trip.seats[id]) : '',
            value => transportAct(() => transportSetSeat(date, id, Number(value) || 0))));
    }
    const buttons = el('div', 'transport-row transport-wrap');
    buttons.appendChild(transportButton(T.cancel, 'cancelMove', () => transportAct(() => { transportSelected = null; }), false));
    if (at && !inLockedVehicle) {
        const isLocked = Boolean(day.workerLocks[id]);
        buttons.appendChild(transportToggle(isLocked ? T.unlockWorker(name) : T.lockWorker(name), 'lockSel', isLocked,
            () => transportAct(() => transportToggleWorkerLock(date, id))));
        if (!isLocked) {
            buttons.appendChild(transportButton(T.removeFromVehicle, 'unseat', () => transportAct(() => {
                if (transportUnseat(date, id)) transportSelected = null;
            }), false));
        }
    }
    bar.appendChild(buttons);
    return bar;
}

// An incomplete plan is accepted only with a typed reason: the question stays open, with
// the error under the field, until something is written or the person backs out.
function transportAskAccept(date) {
    const T = TRANSPORT_TEXT;
    const ctx = transportContext(date);
    const day = transportDayOf(date);
    const errors = transportErrors(date);
    const done = reason => {
        const result = transportAccept(date, reason);
        if (result.ok) transportSaid = T.acceptedVersion(result.n);
        renderTransportIfOpen();
    };
    if (errors.length === 0) {
        return askConfirm({ title: T.acceptTitle, message: T.acceptComplete, ok: T.acceptYes, cancel: T.cancel })
            .then(yes => { if (yes) done(''); });
    }
    return askText({
        title: T.acceptTitle,
        message: [T.acceptIncomplete(errors.length)]
            .concat(errors.map(issue => `• ${transportIssueText(ctx, day, issue)}`), ['', T.reasonLabel]).join('\n'),
        ok: T.acceptPartial,
        validate: value => (transportCleanName(value).length < 2 ? T.reasonNeeded : null)
    }).then(reason => { if (reason) done(reason); });
}

function transportPlanView(ctx, day, date) {
    const T = TRANSPORT_TEXT;
    const root = el('div', 'transport-view');
    const issues = TransportEngine.validate(ctx, day);
    const errors = issues.filter(issue => issue.level === 'error');
    const warns = issues.filter(issue => issue.level === 'warn');
    const riders = TransportEngine.riders(ctx, day);
    const seated = riders.filter(id => TransportEngine.seatOf(day, id));
    const last = transportLastVersion(date);
    const unchanged = Boolean(last) && last.sig === TransportEngine.planSignature(ctx, day);
    const anybody = Object.keys(day.trips).some(id => TransportEngine.occupants(day.trips[id]).length > 0);

    const status = el('div', 'transport-card transport-status');
    status.id = 'transportPlanStatus';
    status.dataset.state = !last ? 'draft' : unchanged ? 'accepted' : 'changed';
    status.appendChild(el('strong', null, !last ? T.draft : unchanged ? T.acceptedVersion(last.n) : T.changedSince(last.n)));
    status.appendChild(el('span', 'transport-sub',
        T.seatedCount(seated.length, riders.length) + (errors.length === 0 && riders.length > 0 ? ` · ${T.planOk}` : '')));
    if (last && transportRecordChanged(date, last)) status.appendChild(el('span', 'transport-warn-text', T.recordChanged));
    root.appendChild(status);

    if (riders.length === 0 && Object.keys(ctx.attendance).length === 0) {
        root.appendChild(el('p', 'empty-hint', T.nobody));
    }

    // ONE filled button at a time: «הצעת שיבוץ» while nobody is seated, «אישור התוכנית»
    // once there is a plan that has not been accepted.
    const actions = el('div', 'transport-actions');
    const suggest = transportButton(T.suggest, 'suggest', () => transportAct(() => {
        const result = transportSuggest(date);
        transportSelected = null;
        transportPicking = null;
        if (result) transportSaid = T.suggestDone(result.unseated.length);
    }), !anybody);
    suggest.id = 'transportSuggest';
    const accept = transportButton(unchanged ? T.nothingToAccept : T.accept, 'accept',
        () => { transportAskAccept(date); }, anybody && !unchanged);
    accept.id = 'transportAccept';
    accept.disabled = unchanged;
    actions.appendChild(suggest);
    actions.appendChild(accept);
    root.appendChild(actions);

    const box = (id, kind, title, list) => {
        const node = el('div', `transport-box transport-box-${kind}`);
        node.id = id;
        node.appendChild(el('h3', null, title));
        const items = el('ul');
        list.forEach(issue => items.appendChild(el('li', null, transportIssueText(ctx, day, issue))));
        node.appendChild(items);
        return node;
    };
    if (errors.length > 0) root.appendChild(box('transportErrors', 'err', T.errorsTitle(errors.length), errors));
    if (warns.length > 0) root.appendChild(box('transportWarnings', 'warn', T.warnTitle, warns));

    const unseated = riders.filter(id => !TransportEngine.seatOf(day, id));
    if (unseated.length > 0) {
        const tray = el('section', 'transport-card');
        tray.id = 'transportUnseated';
        tray.appendChild(el('h3', null, T.unseatedTitle(unseated.length)));
        unseated.forEach(id => tray.appendChild(transportPersonRow(ctx, day, id, '')));
        root.appendChild(tray);
    }

    ctx.vehicles.forEach(vehicle => {
        const trip = day.trips[vehicle.id];
        if (day.unavailable[vehicle.id] && !(trip && TransportEngine.occupants(trip).length > 0)) return;
        root.appendChild(transportVehicleCard(ctx, day, date, vehicle));
    });
    Object.keys(day.trips).forEach(vehicleId => {
        if (!transportFind(ctx.vehicles, vehicleId) && TransportEngine.occupants(day.trips[vehicleId]).length > 0) {
            root.appendChild(transportOrphanCard(ctx, day, vehicleId));
        }
    });

    const history = el('section', 'transport-card');
    history.id = 'transportHistory';
    history.appendChild(el('h3', null, T.historyTitle));
    if (day.accepted.length === 0) history.appendChild(el('p', 'hint', T.noVersions));
    day.accepted.slice().reverse().forEach(version => {
        const item = el('div', 'transport-version');
        item.dataset.version = String(version.n);
        const line = el('div', 'transport-row transport-wrap');
        line.appendChild(el('span', 'transport-name', T.versionLine(version.n, transportClock(version.at))));
        line.appendChild(transportBadge(version.complete ? T.complete : T.partial(version.reason),
            version.complete ? 'ok' : 'bad'));
        item.appendChild(line);
        if (version.moved !== null) item.appendChild(el('p', 'transport-sub', T.moved(version.moved, version.n - 1)));
        transportTripOrder(version.trips).forEach(vehicleId => {
            const trip = version.trips[vehicleId];
            if (TransportEngine.occupants(trip).length === 0) return;
            item.appendChild(el('p', 'transport-sub', T.tripLine(transportRli(transportVehicleName(vehicleId)),
                trip.driver ? isolate(transportWorkerName(ctx, trip.driver)) : T.driverNone, trip.passengers.length)));
        });
        history.appendChild(item);
    });
    root.appendChild(history);

    if (transportSelected) root.appendChild(transportMoveBar(ctx, day, date));
    return root;
}

// ------------------------------------------------------------------ רכבים

function transportAskSeats(name, value) {
    const T = TRANSPORT_TEXT;
    return askText({
        title: T.seatsTitle(transportRli(name)), value: value ? String(value) : '', inputmode: 'numeric', ok: T.save,
        validate: text => (/^\d{1,2}$/.test(text) && Number(text) >= 2 && Number(text) <= TRANSPORT_MAX_SEATS
            ? null : T.seatsBad)
    }).then(text => (text ? Number(text) : null));
}

function transportAskVehicleName(vehicle) {
    const T = TRANSPORT_TEXT;
    return askText({
        title: T.vehicleNameTitle, value: vehicle ? vehicle.name : '', ok: T.save,
        validate: text => transportNameProblem(transportCleanName(text), transportSettings().vehicles,
            vehicle ? vehicle.id : null, T.vehicleNameTaken)
    });
}

function transportVehiclesView(ctx, day, date) {
    const T = TRANSPORT_TEXT;
    const root = el('div', 'transport-view');
    const out = ctx.vehicles.filter(vehicle => !day.unavailable[vehicle.id]);
    root.appendChild(el('p', 'transport-lead', T.vehiclesLead));
    const summary = el('p', 'transport-name', T.vehiclesSummary(out.length, ctx.vehicles.length,
        out.reduce((sum, vehicle) => sum + vehicle.seats, 0)));
    summary.id = 'transportVehiclesSummary';
    root.appendChild(summary);
    if (ctx.vehicles.length === 0) root.appendChild(el('p', 'empty-hint', T.noVehicles));

    ctx.vehicles.forEach(vehicle => {
        const isOut = !day.unavailable[vehicle.id];
        const card = el('section', 'transport-card');
        card.dataset.vehicle = vehicle.id;
        const head = el('div', 'transport-row');
        const titles = el('div', 'transport-grow');
        titles.appendChild(el('h3', 'transport-vehicle-name', vehicle.name));
        titles.appendChild(el('div', 'transport-sub', T.seats(vehicle.seats)));
        head.appendChild(titles);
        const toggle = transportToggle(isOut ? T.available : T.unavailable, 'avail:' + vehicle.id, isOut,
            () => transportAct(() => transportSetAvailable(date, vehicle.id, !isOut)));
        toggle.classList.add('transport-toggle-ok');
        toggle.dataset.avail = vehicle.id;
        toggle.setAttribute('aria-label', `${transportRli(vehicle.name)}: ${isOut ? T.available : T.unavailable}`);
        head.appendChild(toggle);
        card.appendChild(head);

        // The list is the owner's to keep, and keeping it is rare: behind one row, so the
        // daily question - which cars go out - is the only thing on the card.
        const more = document.createElement('details');
        more.className = 'transport-more';
        const handle = el('summary', null, T.editVehicle);
        handle.dataset.tk = 'more:' + vehicle.id;
        more.appendChild(handle);
        const tools = el('div', 'transport-row transport-wrap');
        tools.appendChild(transportButton(T.renameVehicle, 'rename:' + vehicle.id, () => {
            transportAskVehicleName(vehicle).then(name => {
                if (name) transportRenameVehicle(vehicle.id, name);
                renderTransportIfOpen();
            });
        }, false));
        tools.appendChild(transportButton(T.changeSeats, 'seats:' + vehicle.id, () => {
            transportAskSeats(vehicle.name, vehicle.seats).then(seats => {
                if (seats) transportSetVehicleSeats(vehicle.id, seats);
                renderTransportIfOpen();
            });
        }, false));
        tools.appendChild(transportButton(T.retireVehicle, 'retire:' + vehicle.id, () => {
            askConfirm({ title: T.retireTitle(transportRli(vehicle.name)), message: T.retireLead,
                ok: T.retireVehicle, cancel: T.cancel }).then(yes => {
                if (yes) transportRetireVehicle(vehicle.id);
                renderTransportIfOpen();
            });
        }, false));
        more.appendChild(tools);
        card.appendChild(more);
        root.appendChild(card);
    });

    const add = transportButton(T.addVehicle, 'addVehicle', () => {
        transportAskVehicleName(null).then(name => {
            if (!name) return null;
            return transportAskSeats(name, 5).then(seats => {
                if (seats) transportAddVehicle(name, seats);
                renderTransportIfOpen();
            });
        });
    }, false);
    add.id = 'transportAddVehicle';
    add.classList.add('transport-wide');
    root.appendChild(add);
    return root;
}

// ------------------------------------------------------------------ עובדים

function transportAreasEditor(ctx) {
    const T = TRANSPORT_TEXT;
    const box = document.createElement('details');
    box.className = 'transport-card transport-more';
    box.id = 'transportAreas';
    // Open while the list is empty: the first evening, this is the first thing to do.
    box.open = ctx.areas.length === 0 || transportAreasOpen;
    box.addEventListener('toggle', () => { transportAreasOpen = box.open; });
    const handle = el('summary', null, T.areasTitle(ctx.areas.length));
    handle.dataset.tk = 'areas';
    box.appendChild(handle);
    box.appendChild(el('p', 'hint', ctx.areas.length === 0 ? T.noAreas : T.areasLead));
    const ask = area => askText({
        title: T.areaNameTitle, value: area ? area.name : '', ok: T.save,
        validate: text => transportNameProblem(transportCleanName(text), transportSettings().areas,
            area ? area.id : null, T.areaNameTaken)
    });
    ctx.areas.forEach(area => {
        const row = el('div', 'transport-row transport-area');
        row.dataset.area = area.id;
        row.appendChild(el('span', 'transport-name transport-grow', area.name));
        row.appendChild(transportButton(T.renameArea, 'areaRename:' + area.id, () => {
            ask(area).then(name => {
                if (name) transportRenameArea(area.id, name);
                renderTransportIfOpen();
            });
        }, false));
        row.appendChild(transportButton(T.removeArea, 'areaRemove:' + area.id, () => {
            askConfirm({ title: T.removeAreaTitle(isolate(area.name)), message: T.removeAreaLead,
                ok: T.removeArea, cancel: T.cancel }).then(yes => {
                if (yes) transportRemoveArea(area.id);
                renderTransportIfOpen();
            });
        }, false));
        box.appendChild(row);
    });
    const add = transportButton(T.addArea, 'addArea', () => {
        ask(null).then(name => {
            if (name) transportAddArea(name);
            renderTransportIfOpen();
        });
    }, false);
    add.id = 'transportAddArea';
    add.classList.add('transport-wide');
    box.appendChild(add);
    return box;
}

function transportWorkersView(ctx, day, date) {
    const T = TRANSPORT_TEXT;
    const root = el('div', 'transport-view');
    root.appendChild(el('p', 'transport-lead', T.workersLead));
    root.appendChild(transportAreasEditor(ctx));

    let off = 0;
    ctx.workers.forEach(worker => {
        if (!ctx.attendance[worker.id]) { off += 1; return; }
        const name = isolate(worker.name);
        const card = el('section', 'transport-card');
        card.dataset.worker = worker.id;
        const head = el('div', 'transport-row transport-wrap');
        head.appendChild(el('span', 'transport-name transport-grow', worker.name));
        head.appendChild(transportSiteChip(ctx, ctx.attendance[worker.id]));
        card.appendChild(head);
        if (ctx.also[worker.id]) {
            card.appendChild(el('p', 'transport-sub', T.alsoAt(ctx.also[worker.id].map(isolate).join(', '))));
        }

        card.appendChild(transportSelect('status:' + worker.id, T.statusLabel(name),
            [['', T.statusRide]].concat(TransportEngine.STATUSES.map(status => [status, transportStatusText(status)])),
            day.status[worker.id] || '',
            value => transportAct(() => transportSetStatus(date, worker.id, value || null))));

        const area = transportSelect('workerArea:' + worker.id, T.areaLabel(name),
            [['', `${T.pickup}: ${T.noArea}`]].concat(ctx.areas.map(one => [one.id, `${T.pickup}: ${one.name}`])),
            worker.area && transportFind(ctx.areas, worker.area) ? worker.area : '',
            value => transportAct(() => transportSetWorker(worker.id, { area: value || null })));
        area.dataset.workerArea = worker.id;
        card.appendChild(area);

        const all = worker.drives === 'all';
        const drive = transportToggle(!worker.canDrive ? T.cannotDrive
            : `${T.canDrive} · ${all ? T.drivesAll : worker.drives.length ? T.drivesSome(worker.drives.length) : T.drivesNone}`,
        'drive:' + worker.id, worker.canDrive,
        () => transportAct(() => transportSetWorker(worker.id, { canDrive: !worker.canDrive })));
        drive.classList.add('transport-wide', 'transport-toggle-ok');
        drive.dataset.drive = worker.id;
        card.appendChild(drive);

        if (worker.canDrive) {
            // WHICH vehicles. «כל הרכבים», or each one by name - the 9-seater is the one a
            // man may not be allowed, and it is the owner who says.
            const which = el('div', 'transport-row transport-wrap transport-drives');
            which.setAttribute('role', 'group');
            which.setAttribute('aria-label', T.drivesLabel(name));
            const everything = transportToggle(T.drivesAll, 'drivesAll:' + worker.id, all,
                () => transportAct(() => transportSetWorker(worker.id, { drives: all ? [] : 'all' })));
            everything.dataset.drivesAll = worker.id;
            which.appendChild(everything);
            if (!all) {
                ctx.vehicles.forEach(vehicle => {
                    const on = worker.drives.indexOf(vehicle.id) !== -1;
                    const one = transportToggle(vehicle.name, `drives:${worker.id}:${vehicle.id}`, on,
                        () => transportAct(() => transportSetWorker(worker.id, {
                            drives: on ? worker.drives.filter(id => id !== vehicle.id) : worker.drives.concat(vehicle.id)
                        })));
                    one.dataset.drives = vehicle.id;
                    which.appendChild(one);
                });
            }
            card.appendChild(which);
        }
        root.appendChild(card);
    });
    if (Object.keys(ctx.attendance).length === 0) root.appendChild(el('p', 'empty-hint', T.nobody));
    if (off > 0) root.appendChild(el('p', 'hint', T.notWorkingToday(off)));
    return root;
}

// ------------------------------------------------------------------ הודעות

// A real link with the whole address already on it, so the tap IS the navigation: iOS
// opens nothing for a navigation that does not come from a tap (js/ui/seder.js, where
// this was learned). The mark is made inside the same tap and the list is NOT redrawn by
// it - the link being followed must not be rewritten under the finger; the redraw comes
// a moment later, and when the person is back from WhatsApp.
function transportDoor(date, vehicleId, number, text) {
    const door = document.createElement('a');
    door.className = 'transport-wa';
    door.href = sederUrl(number, text);
    door.target = '_blank';
    door.rel = 'noopener noreferrer';
    door.dataset.tk = 'wa:' + vehicleId;
    door.dataset.wa = vehicleId;
    door.textContent = TRANSPORT_TEXT.openWhatsapp;
    door.addEventListener('click', () => {
        transportMarkOpened(date, vehicleId);
        setTimeout(renderTransportIfOpen, 1500);
    });
    return door;
}

function transportMessagesView(ctx, day, date) {
    const T = TRANSPORT_TEXT;
    const root = el('div', 'transport-view');
    root.appendChild(el('p', 'transport-lead', T.messagesLead));
    const last = transportLastVersion(date);
    // ONLY an accepted version is ever sent. A draft is somebody still thinking.
    if (!last) {
        const none = el('div', 'transport-card');
        none.id = 'transportNoAccepted';
        none.appendChild(el('p', null, T.noAccepted));
        root.appendChild(none);
        return root;
    }
    if (last.sig !== TransportEngine.planSignature(ctx, day)) {
        const differs = el('div', 'transport-box transport-box-warn');
        differs.id = 'transportDraftDiffers';
        differs.appendChild(el('h3', null, T.draftDiffers(last.n)));
        root.appendChild(differs);
    } else root.appendChild(el('p', 'transport-name', T.acceptedVersion(last.n)));
    if (transportRecordChanged(date, last)) root.appendChild(el('p', 'transport-warn-text', T.recordChanged));

    transportTripOrder(last.trips).forEach(vehicleId => {
        const trip = last.trips[vehicleId];
        const people = TransportEngine.occupants(trip);
        if (people.length === 0) return;
        const vehicle = transportFind(transportSettings().vehicles, vehicleId);
        const card = el('section', 'transport-card');
        card.dataset.message = vehicleId;
        const head = el('div', 'transport-row transport-wrap');
        const titles = el('div', 'transport-grow');
        titles.appendChild(el('div', 'transport-name', trip.driver ? transportWorkerName(ctx, trip.driver) : T.driverNone));
        titles.appendChild(el('div', 'transport-sub', `${transportRli(transportVehicleName(vehicleId))} · `
            + T.occupancy(people.length, vehicle ? vehicle.seats : people.length)));
        head.appendChild(titles);
        card.appendChild(head);
        if (!trip.driver) {
            card.dataset.mark = 'nodriver';
            card.appendChild(transportBadge(T.driverNone, 'bad'));
            root.appendChild(card);
            return;
        }

        const state = transportMarkState(date, vehicleId);
        const mark = day.marks[vehicleId];
        card.dataset.mark = state;
        const badge = state === 'nophone' ? transportBadge(T.noPhone, 'bad')
            : state === 'sent' ? transportBadge(T.sentMarked(transportClock(mark.sentAt)), 'ok')
                : state === 'opened' ? transportBadge(T.opened, 'ok')
                    : state === 'changed' ? transportBadge(T.changedSinceMark, 'bad')
                        : transportBadge(T.notOpened);
        badge.classList.add('transport-mark');
        card.appendChild(badge);

        const text = transportDriverMessage(date, last, vehicleId);
        const shown = el('pre', 'transport-message', text);
        shown.dir = 'rtl';
        card.appendChild(shown);

        const number = transportDriverNumber(date, last, vehicleId);
        if (number) {
            const buttons = el('div', 'transport-row transport-wrap');
            buttons.appendChild(transportDoor(date, vehicleId, number, text));
            const sent = state === 'sent'
                ? transportButton(T.unmarkSent, 'sent:' + vehicleId, () => transportAct(() => transportMarkSent(date, vehicleId, false)), false)
                : transportButton(T.confirmSent, 'sent:' + vehicleId, () => transportAct(() => transportMarkSent(date, vehicleId, true)), false);
            sent.dataset.sent = vehicleId;
            buttons.appendChild(sent);
            card.appendChild(buttons);
        }
        root.appendChild(card);
    });
    return root;
}

// ================================================================== the way in, and the switch

// The row in the WhatsApp dialog, under the seder's own. THERE ONLY WHILE THE SWITCH IS
// ON: built when it is turned on and taken out of the document when it is turned off, so
// a phone that never asked for this has no button for it anywhere.
function transportInstallEntry() {
    if (typeof document === 'undefined' || !document.querySelector) return;
    const actions = document.querySelector('#shareModal .modal-actions');
    if (!actions) return;
    const existing = document.getElementById('transportEntry');
    if (!transportEnabled()) {
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
        return;
    }
    if (existing) return;
    const entry = button(TRANSPORT_TEXT.entry, 'btn-secondary transport-entry', () => openTransport(State.date));
    entry.id = 'transportEntry';
    const after = document.getElementById('sederEntry') || actions.querySelector('.btn-success');
    actions.insertBefore(entry, after ? after.nextSibling : actions.firstChild);
}

// The row in ⋯, the last of «כללי» (v172; it was a card at the foot of «מכשיר ועזרה», after
// the technical report, which is not where a person looks for something they switch on).
// Built here rather than written into index.html because every word on it is one of the
// words above. It is the same thing as every other row on that sheet - a <details> with
// the card head as its <summary> - and it is shut when the sheet opens: nothing on it is
// ever something a person has to be shown, so nothing opens it but a tap.
function transportInstallSwitch() {
    if (typeof document === 'undefined' || !document.getElementById) return;
    const host = document.getElementById('settingsDailySection');
    if (!host || document.getElementById('transportSwitchCard')) return;
    const T = TRANSPORT_TEXT;
    const card = el('details', 'settings-group settings-fold transport-switch');
    card.id = 'transportSwitchCard';
    const head = el('summary', 'settings-card-head');
    if (typeof FarkadIcons !== 'undefined' && FarkadIcons.card) head.appendChild(FarkadIcons.card('van'));
    const titles = el('div');
    titles.appendChild(el('h3', null, T.switchTitle));
    titles.appendChild(el('p', 'hint', T.switchSub));
    head.appendChild(titles);
    card.appendChild(head);
    const body = el('div', 'settings-fold-body');
    body.appendChild(el('p', 'hint', T.switchLead));
    const state = el('p', 'hint settings-status');
    state.id = 'transportSwitchState';
    body.appendChild(state);
    const toggle = button('', 'btn-secondary', () => transportSetEnabled(!transportEnabled()));
    toggle.id = 'transportSwitch';
    body.appendChild(toggle);
    card.appendChild(body);
    host.appendChild(card);
    transportRenderSwitch();
}

function transportRenderSwitch() {
    if (typeof document === 'undefined' || !document.getElementById) return;
    const toggle = document.getElementById('transportSwitch');
    const state = document.getElementById('transportSwitchState');
    if (!toggle || !state) return;
    const on = transportEnabled();
    toggle.textContent = on ? TRANSPORT_TEXT.switchOff : TRANSPORT_TEXT.switchOn;
    toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    state.textContent = on ? TRANSPORT_TEXT.switchStateOn : TRANSPORT_TEXT.switchStateOff;
}

// Back from WhatsApp, the marks are brought up to date.
function transportWatch() {
    if (typeof document === 'undefined' || !document.addEventListener) return;
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') renderTransportIfOpen();
    });
}

// At load: the switch card (which reads the one preference), the entry if the switch is
// on, and nothing else. Never allowed to throw into the boot: a transport store that
// cannot be read is a transport screen that says so, not an app that does not start.
try {
    transportInstallSwitch();
    transportInstallEntry();
    transportWatch();
} catch (error) {
    if (typeof console !== 'undefined' && console.warn) console.warn('transport: not installed', error);
}
