// הסעות: who rides to work in which vehicle, and a message to each driver - the screen,
// and the store it keeps its own things in.
//
// v174 - THE SCREEN IS A PICTURE. The owner tried v171's four-tab planner on his phone
// and sent it back on 2026-11-10: "very hard and complicated and it will take us a lot of
// time. I want the car DRAWN, as if photographed from above, and on every seat written
// 'add worker', and I take the worker, drag him with my finger and distribute them over
// the cars." So there is ONE screen now: the men still waiting in a tray that stays at
// the top, and under it each vehicle that goes out today drawn from above with its seats
// in their rows. A man is put in a seat by dragging him there, by touching him and then
// the seat, or by touching the seat and choosing him. WHOEVER IS IN THE DRIVER'S SEAT IS
// THE DRIVER. There is no suggestion, no pickup area, no "may drive", no lock, nothing to
// accept and no version: every change is the plan, kept at once.
//
// The owner, 2026-11-09: seven vehicles, the morning ride only - and FIRST ON HIS PHONE
// ONLY. The other two phones come later, in a step of their own. So this file is built
// to be absent everywhere it was not asked for:
//
//   - IT IS OFF UNTIL THIS PHONE TURNS IT ON. One preference in Store
//     (farkadTransport:enabled), set from a card in ⋯. While it is off no entry is drawn,
//     nothing is computed, and nothing but that one preference is read. There is no
//     FARKAD_FLAGS entry: a flag is a constant in a commit and is the same on all three
//     phones, and the whole point of this gate is that it is NOT the same on all three.
//   - IT READS THE DAY AND NEVER WRITES IT. Who works where comes from the day record
//     through sederCrew (js/ui/seder.js) - the same reading the seder to each worker
//     makes, so a man is on this list exactly when he is under a site in the group
//     message. A man on two sites that day rides to the FIRST one his day holds. No
//     function here calls State.commit, State.save or anything in js/sync/.
//   - WHAT IT KEEPS IS THIS PHONE'S OWN, under keys of its own:
//       farkadTransport:settings       the vehicles
//       farkadTransport:day:<date>     who sits where that day, which vehicles stay, who
//                                      gets there another way, and which driver's
//                                      message was opened
//     None of it is in the record, so nothing that carries the record - the outbox, the
//     cloud, a backup file, a restore point - can carry it, and the rescue file takes
//     named records only (js/recovery.js). THE PRICE, said in docs/releases.md: a lost
//     phone loses the plans and the list of vehicles.
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
// wording on 2026-11-09 and corrects on sight (docs/releases.md, v174, lists them all).
// Hebrew strings are product decisions (CLAUDE.md, law 6): tests/transport.test.mjs pins
// every one, word for word, and changing one here moves the pinned line there in the
// same commit. A name in a template is already bidi-isolated by the caller.
const TRANSPORT_TEXT = Object.freeze({
    // --- the switch, in ⋯: the last row of «כללי»
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
    notKept: 'השינוי לא נשמר במכשיר. אם האפליקציה תיסגר, הוא יאבד.',
    unreadable: 'נתוני הסעות שנשמרו במכשיר לא נקראו. מתחילים מרשימה ריקה, והעותק שלא נקרא נשמר בצד.',
    nobody: 'אין ביום הזה עובדים עם אתר עבודה.',

    // --- the tray: the men who work today and are in no seat yet
    waiting: n => `ממתינים לשיבוץ (${n})`,
    allSeated: 'כל העובדים משובצים',
    hint: 'גוררים עובד אל מושב, או נוגעים בעובד ואז במושב. עובד שכבר יושב מזיזים בלחיצה ארוכה וגרירה.',
    // said to a screen reader, and to nobody else
    picked: name => `${name} נבחר. נוגעים במושב.`,
    seatedIn: (name, v) => `${name} שובץ ב${v}`,
    returned: name => `${name} חזר לממתינים`,

    // --- a seat
    addWorker: 'הוספת עובד',
    driverSeat: 'נהג',
    driver: name => `נהג: ${name}`,
    chooseTitle: 'מי יושב כאן?',
    driverDialogTitle: v => `מי נוהג ב${v}?`,
    removeFromVehicle: 'הוצאה מהרכב',
    cancel: 'ביטול',

    // --- one vehicle
    occupancy: (a, b) => `${a} מתוך ${b}`,
    available: 'זמין היום',
    unavailable: 'לא זמין היום',
    driverNone: 'בלי נהג',
    notWorking: w => `${w} משובץ ברכב אבל אין לו אתר ברישום היום`,
    deletedWorker: 'עובד שנמחק',

    // --- the men who do not ride with us
    notRiding: 'לא בהסעה שלנו',
    notRidingCount: n => `לא בהסעה שלנו (${n})`,
    notRidingTitle: 'מי לא נוסע בהסעה שלנו?',
    statusLabel: name => `איך ${name} מגיע`,
    statusPrivate: 'רכב פרטי',
    statusContractor: 'נוסע עם קבלן אחר',
    statusOther: 'אחר',
    bringBack: 'החזרה להסעה',

    // --- the list of vehicles: setup, at the bottom, not daily work
    vehiclesRow: 'רכבים',
    seats: n => `${n} מושבים`,
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
    retireLead: 'הרכב לא יופיע עוד בשיבוץ.',
    save: 'שמירה',

    // --- the driver's message: the button, and what the card says after it
    openWhatsapp: 'פתיחה בוואטסאפ',
    opened: 'נפתח בוואטסאפ',
    noPhone: 'אין מספר טלפון תקין',

    // --- the message a driver receives
    //   שלום סאמר,
    //   הסעה ליום שלישי 10/11/2026:
    //   רכב: טויוטה קורולה 2016
    //   נוסעים (2):
    //   - ראמי – חדרה
    //   - דוד – חיפה
    //   יעדים: חיפה, חדרה
    // No pickup line and no «עדכון מספר N» line any more: areas and versions are gone
    // (v174). No emoji: the proposal had none, and the owner may ask for the seder's.
    mHello: name => `שלום ${name},`,
    mHeading: (day, date) => `הסעה ל${day} ${date}:`,
    mVehicle: v => `רכב: ${v}`,
    mPassengers: n => `נוסעים (${n}):`,
    mPassenger: (name, site) => `- ${name} – ${site}`,
    // a passenger with no site in today's record: named, and no site invented for him
    mPassengerOnly: name => `- ${name}`,
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

// `areas` and `workers` are what v171's planner kept here - the pickup areas, and per
// worker his area and what he might drive. Nothing reads them any more (v174). They are
// carried through a save untouched rather than dropped: a list of vehicles renamed
// tonight is no reason to delete what the owner typed last week.
function transportEmptySettings() {
    return { version: 1, seeded: false, vehicles: [], areas: [], workers: transportMap() };
}

// What a day keeps (v174): which vehicles stay home, who gets there another way, who
// sits where, and which driver's message was opened.
function transportEmptyDay() {
    return { version: 1, unavailable: transportMap(), status: transportMap(), trips: transportMap(),
        marks: transportMap() };
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

// A trip as it is kept: the driver (seat 1), the passengers, and the seat number of each.
// v171 kept a pickup area and a lock beside these; they are not read.
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
    return { driver: isSafeId(item.driver) ? item.driver : null, passengers, seats };
}

// A DAY WRITTEN BY v171 OR v172 OPENS HERE AS IT IS. What still means something is read:
// the vehicles kept home, the statuses, each trip's driver, passengers and seat numbers,
// and a message's «opened» mark. What the picture has no use for - accepted versions,
// worker locks, a trip's lock and pickup area, the «sent» mark - is NOT READ, and is not
// touched on the disk either: reading writes nothing, so those bytes stay exactly as
// they were until somebody changes that day, and the first change writes the day in the
// shape above without them (transportKeep; docs/releases.md, v174).
function transportReadDay(parsed) {
    const out = transportEmptyDay();
    if (isPlainObject(parsed.unavailable)) {
        Object.keys(parsed.unavailable).forEach(id => {
            if (isSafeId(id) && parsed.unavailable[id] === true) out.unavailable[id] = true;
        });
    }
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
    if (isPlainObject(parsed.marks)) {
        Object.keys(parsed.marks).forEach(id => {
            const mark = parsed.marks[id];
            if (!isSafeId(id) || !isPlainObject(mark) || typeof mark.sig !== 'string'
                || !isFiniteNumber(mark.openedAt)) return;
            out.marks[id] = { sig: mark.sig, openedAt: mark.openedAt };
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
// this app has for a message), and this phone's vehicles.
function transportContext(date) {
    const settings = transportSettings();
    const schedule = State.schedule || {};
    const crew = sederCrew(schedule, date, State.layer);
    const attendance = transportMap();
    crew.forEach(row => {
        if (!isSafeId(row.workerId)) return;
        // A man on two sites rides to the first his day holds.
        attendance[row.workerId] = row.sites[0].placeId;
    });
    const workers = (schedule.workers || []).filter(worker => worker && isSafeId(worker.id))
        .map(worker => ({ id: worker.id, name: worker.name, phone: worker.phone }));
    return {
        workers,
        vehicles: settings.vehicles.filter(vehicle => vehicle.active),
        sites: (schedule.places || []).filter(place => place && place.active !== false)
            .map(place => ({ id: place.id, name: place.name })),
        attendance
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

function transportSiteName(ctx, id) {
    if (!id) return '';
    const site = transportFind(ctx.sites, id);
    if (site) return site.name;
    const place = ((State.schedule && State.schedule.places) || []).find(one => one && one.id === id);
    return place ? place.name : '';
}

function transportStatusText(status) {
    return { private: TRANSPORT_TEXT.statusPrivate, contractor: TRANSPORT_TEXT.statusContractor,
        other: TRANSPORT_TEXT.statusOther }[status] || '';
}

// ================================================================== the plan, changed
//
// Every change is made to this session's copy of the day and written to the day's own
// key at once - there is nothing to accept. Each answers whether it did anything; none
// of them touches the record.

// THE FIRST CHANGE TO A DAY IS WHAT REWRITES IT. What is kept from then on is the
// picture as TransportEngine.layout reads it - every seated man with a seat number, no
// trip for a vehicle that stays or has left the list - so whatever v171 stored beside
// that (versions, locks, a trip's pickup area, a «sent» mark) is on the disk until this
// runs for that day, and gone after (docs/releases.md, v174).
function transportKeep(date, day, trips) {
    const kept = transportMap();
    Object.keys(trips).forEach(vehicleId => {
        const trip = transportReadTrip(trips[vehicleId]);
        if (trip) kept[vehicleId] = trip;
    });
    day.trips = kept;
    // A mark belongs to a driver's message; with no driver there is no message.
    Object.keys(day.marks).forEach(vehicleId => {
        if (!kept[vehicleId] || !kept[vehicleId].driver) delete day.marks[vehicleId];
    });
    transportSaveDay(date);
    return true;
}

// After a vehicle is kept home or a man is marked as getting there another way: the
// picture as it now reads, written down - so the men that left it are waiting on the
// disk as well as on the glass.
function transportRedrawn(date, day) {
    const ctx = transportContext(date);
    return transportKeep(date, day, TransportEngine.tripsOf(ctx, TransportEngine.layout(ctx, day).cars));
}

function transportSetAvailable(date, vehicleId, available) {
    if (!transportEnabled() || !isSafeId(vehicleId)) return false;
    const day = transportDayOf(date);
    if (available) delete day.unavailable[vehicleId];
    else day.unavailable[vehicleId] = true;
    return transportRedrawn(date, day);
}

// `status` is one of TransportEngine.STATUSES, or nothing to bring the man back to the
// tray. A man given one leaves his seat: the mark is the newer fact.
function transportSetStatus(date, workerId, status) {
    if (!transportEnabled() || !isSafeId(workerId)) return false;
    const day = transportDayOf(date);
    if (status && TransportEngine.STATUSES.indexOf(status) === -1) return false;
    if (status) day.status[workerId] = status;
    else delete day.status[workerId];
    return transportRedrawn(date, day);
}

// A man onto seat `n` of a vehicle; seat 1 is the driver's, and whoever is put there
// drives. The rules - swap, the displaced man back to the tray, what is refused - are
// the engine's (TransportEngine.place), so a drag, a tap and a test all get the same.
function transportPlace(date, workerId, vehicleId, n) {
    if (!transportEnabled() || !isSafeId(workerId) || !isSafeId(vehicleId)) return false;
    const day = transportDayOf(date);
    const result = TransportEngine.place(transportContext(date), day, workerId, vehicleId, n);
    return result ? transportKeep(date, day, result.trips) : false;
}

function transportUnseat(date, workerId) {
    if (!transportEnabled() || !isSafeId(workerId)) return false;
    const day = transportDayOf(date);
    const trips = TransportEngine.remove(transportContext(date), day, workerId);
    return trips ? transportKeep(date, day, trips) : false;
}

// ================================================================== the driver's message

// What the driver of one vehicle is sent, composed from the picture as it is NOW - there
// is no accepted version to send from any more. Passengers in the order of their seats.
// Every name isolated - a person's by isolate(), a vehicle's by transportRli() (above).
function transportDriverMessage(date, vehicleId) {
    const T = TRANSPORT_TEXT;
    const ctx = transportContext(date);
    const vehicle = transportFind(ctx.vehicles, vehicleId);
    const seats = TransportEngine.layout(ctx, transportDayOf(date)).cars[vehicleId];
    if (!vehicle || !seats || !seats[1]) return '';
    const parsed = parseLocalDate(date);
    const passengers = seats.slice(2).filter(Boolean);
    const lines = [T.mHello(isolate(transportWorkerName(ctx, seats[1]))),
        T.mHeading(hebrewDayName(parsed), formatFullDate(parsed)),
        T.mVehicle(transportRli(vehicle.name))];
    if (passengers.length === 0) lines.push(T.mAlone);
    else {
        lines.push(T.mPassengers(passengers.length));
        passengers.forEach(id => {
            const name = isolate(transportWorkerName(ctx, id));
            const site = transportSiteName(ctx, ctx.attendance[id]);
            lines.push(site ? T.mPassenger(name, isolate(site)) : T.mPassengerOnly(name));
        });
    }
    const sites = TransportEngine.tripSites(ctx, { driver: seats[1], passengers })
        .map(id => isolate(transportSiteName(ctx, id)));
    if (sites.length) lines.push(T.mDestinations(sites.join(', ')));
    return lines.join('\n');
}

// The driver's number as wa.me takes it - the seder's own rule, not a second one: only a
// plain Israeli mobile, and anything else is NO NUMBER rather than a guess that opens a
// chat with a stranger (js/ui/seder.js, sederWaNumber).
function transportDriverNumber(date, vehicleId) {
    const ctx = transportContext(date);
    const seats = TransportEngine.layout(ctx, transportDayOf(date)).cars[vehicleId];
    const worker = seats && seats[1] ? transportFind(ctx.workers, seats[1]) : null;
    return worker ? sederWaNumber(worker.phone) : '';
}

// What a mark is checked against: the number and the words, by the seder's fingerprint.
function transportMessageSig(number, text) {
    return sederSig({ number }, text);
}

// 'nodriver' | 'nophone' | 'none' | 'opened'. A MARK IS BELIEVED ONLY WHILE THE MESSAGE
// IS THE ONE IT WAS MADE ON: a man moved into or out of that car, another driver, a
// corrected number, a renamed passenger - each is a different fingerprint, and the card
// stops saying a message was opened that is not the message there is.
function transportMarkState(date, vehicleId) {
    const text = transportDriverMessage(date, vehicleId);
    if (!text) return 'nodriver';
    const number = transportDriverNumber(date, vehicleId);
    if (!number) return 'nophone';
    const mark = transportDayOf(date).marks[vehicleId];
    return mark && mark.sig === transportMessageSig(number, text) ? 'opened' : 'none';
}

// The link was tapped. The app cannot see whether send was pressed in WhatsApp, so this
// says "opened" and never "sent".
function transportMarkOpened(date, vehicleId) {
    if (!transportEnabled() || !isSafeId(vehicleId)) return false;
    const text = transportDriverMessage(date, vehicleId);
    const number = text ? transportDriverNumber(date, vehicleId) : '';
    if (!number) return false;
    transportDayOf(date).marks[vehicleId] = { sig: transportMessageSig(number, text), openedAt: Date.now() };
    transportSaveDay(date);
    return true;
}

// ================================================================== the list of vehicles, changed

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
    // rows would draw seats the vehicle does not have, so they go, and the car is drawn
    // two in front and rows of three behind until somebody says otherwise.
    if (vehicle.seats !== seats) delete vehicle.rows;
    vehicle.seats = seats;
    transportSaveSettings();
    return true;
}

// Retired, not removed: it is no longer drawn, and the men a plan had in it are waiting
// again (TransportEngine.layout draws only the vehicles on the list).
function transportRetireVehicle(vehicleId) {
    if (!transportEnabled()) return false;
    const vehicle = transportFind(transportSettings().vehicles, vehicleId);
    if (!vehicle) return false;
    vehicle.active = false;
    transportSaveSettings();
    return true;
}

// ================================================================== the screen

let transportDate = null;        // the day the open panel is about; fixed while it is open
let transportPicked = null;      // the waiting man who was touched, until a seat is
let transportSaid = '';
let transportReturnFocus = null;
let transportLastKey = null;     // the last control used on the panel, by its data-tk
let transportAwayOpen = false;   // the two folded lines at the bottom, left open or shut
let transportFleetOpen = false;  // across redraws - and shut again at every opening

function transportParts() {
    const get = id => document.getElementById(id);
    return { panel: get('transportPanel'), title: get('transportTitle'), context: get('transportContext'),
        close: get('transportClose'), note: get('transportNote'), body: get('transportBody'),
        live: get('transportLive') };
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
    transportPicked = null;
    transportSaid = '';
    transportAwayOpen = false;
    transportFleetOpen = false;
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
        parts.panel.addEventListener('click', event => {
            // The click a browser makes out of the end of a drag (a mouse always does; a
            // finger does after a hold that never moved) is not a tap on what it landed
            // on: without this, a man dropped on a seat also opened that seat's question.
            if (Date.now() < transportSwallowUntil) {
                transportSwallowUntil = 0;
                event.stopPropagation();
                event.preventDefault();
                return;
            }
            // Which control was last used, recorded as it happens: after one of the app's
            // own questions closes, js/ui/modal.js gives the keyboard back to the button
            // that asked - and that button has just been redrawn, so the node it remembers
            // is no longer in the page. The redraw finds its successor by this key instead.
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
    transportDragEnd(false);
    parts.panel.classList.remove('open');
    parts.panel.setAttribute('aria-hidden', 'true');
    document.removeEventListener('keydown', transportKeydown);
    transportDate = null;
    transportPicked = null;
    const back = transportReturnFocus;
    transportReturnFocus = null;
    if (back && document.contains(back) && back.focus) back.focus({ preventScroll: true });
}

// The settings sheet's contract (js/ui/settings.js), by the pieces js/ui/modal.js already
// has: Escape steps back one thing at a time - the man being carried, the man who was
// touched, then the panel - and Tab stays inside. While one of the app's own dialogs is up
// over this panel (a question from js/ui/ask.js), the keyboard is that dialog's and this
// stands by.
//
// `defaultPrevented` is how an Escape that has ALREADY closed such a dialog is told from
// one that has not. js/ui/modal.js listens on the same document and was registered first:
// by the time this runs it has closed the question and no dialog is open any more - so
// asking "is a dialog open?" alone let one Escape answer the question AND close the panel
// behind it. modal.js marks the key it handled; a key it marked is not this panel's.
function transportKeydown(event) {
    if (event.defaultPrevented) return;
    if (typeof openModals === 'function' && openModals().length > 0) return;
    const parts = transportParts();
    if (event.key === 'Escape') {
        event.preventDefault();
        if (transportDrag) {
            transportDragEnd(true);
            renderTransport();
        } else if (transportPicked) {
            transportPicked = null;
            transportSaid = '';
            renderTransport();
        } else closeTransport();
        return;
    }
    if (event.key === 'Tab' && typeof trapTab === 'function' && parts.panel) trapTab(event, parts.panel);
}

function renderTransportIfOpen() {
    if (transportIsOpen() && transportEnabled()) renderTransport();
}

// A button of this panel, tonal: this screen has no filled button at all - the picture
// is the thing, and the one coloured control on it is WhatsApp's. `key` is what the
// keyboard is given back by after a redraw.
function transportButton(text, key, onClick) {
    const node = button(text, 'btn-secondary', onClick);
    if (key) node.dataset.tk = key;
    return node;
}

function transportBadge(text, kind) {
    return el('span', 'transport-badge' + (kind ? ' transport-badge-' + kind : ''), text);
}

function transportAct(change) {
    change();
    renderTransport();
}

// A site's own fixed colour (js/ui/sitecolor.js), handed to the stylesheet as a custom
// property: a dot on a waiting man, an edge on a seated one. The colour that already
// means that site on the day screen, and never a new one; no control borrows it.
function transportPaint(node, siteId) {
    if (siteId) node.style.setProperty('--seat-site', siteColorVar(siteId));
    return node;
}

function transportDot(siteId) {
    // Past ten sites the palette repeats, and the second lap carries the same mark it
    // carries everywhere else.
    return transportPaint(el('span', 'transport-dot', siteId ? siteMark(siteId) : ''), siteId);
}

// Drawn, not typed: a steering wheel for the driver's seat and a plus for an empty one.
// Strokes in the current colour, so both palettes and both states get them for free.
function transportGlyph(kind) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', `transport-glyph transport-glyph-${kind}`);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const shapes = kind === 'wheel'
        ? [['circle', { cx: 12, cy: 12, r: 9 }], ['circle', { cx: 12, cy: 12, r: 2.5 }],
            ['path', { d: 'M3 12h6.5M14.5 12H21M12 14.5V21' }]]
        : [['path', { d: 'M12 5v14M5 12h14' }]];
    shapes.forEach(([tag, attributes]) => {
        const shape = document.createElementNS(NS, tag);
        Object.keys(attributes).forEach(name => shape.setAttribute(name, String(attributes[name])));
        svg.appendChild(shape);
    });
    return svg;
}

function renderTransport() {
    const parts = transportParts();
    if (!parts.body || !transportDate) return;
    // NOT WHILE A FINGER IS DOWN ON A MAN. A redraw replaces every node on the panel, and
    // the node under the finger is the one the browser is sending the gesture to: taken
    // out of the page it loses the pointer, and the man being carried is dropped wherever
    // a snapshot from another phone happened to arrive. The redraw waits for the finger.
    if (transportDrag) { transportDrag.redraw = true; return; }
    const T = TRANSPORT_TEXT;
    const date = transportDate;
    const parsed = parseLocalDate(date);
    const ctx = transportContext(date);
    const day = transportDayOf(date);
    const picture = TransportEngine.layout(ctx, day);
    const waiting = TransportEngine.riders(ctx, day).filter(id => !picture.where[id]);
    if (transportPicked && waiting.indexOf(transportPicked) === -1) transportPicked = null;

    // The whole body is rebuilt; the control that had the keyboard gets it back, and the
    // list and the tray stay where they were scrolled to.
    const active = document.activeElement;
    const asking = typeof openModals === 'function' && openModals().length > 0;
    const focused = active && parts.panel.contains(active) ? (active.dataset.tk || null)
        : (!asking && transportIsOpen() ? transportLastKey : null);
    const scrolled = parts.body.scrollTop;
    const chipsBefore = document.getElementById('transportChips');
    const slid = chipsBefore ? chipsBefore.scrollLeft : 0;

    parts.title.textContent = T.title;
    parts.context.textContent = `${hebrewDayName(parsed)} ${formatFullDate(parsed)}`;
    parts.close.textContent = T.back;

    clear(parts.body);
    parts.body.appendChild(transportView(ctx, day, date, picture, waiting));

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
    const chipsAfter = document.getElementById('transportChips');
    if (chipsAfter) chipsAfter.scrollLeft = slid;
    // Found by comparing values, never by a selector built from an id.
    if (focused) {
        const again = [...parts.panel.querySelectorAll('[data-tk]')].find(node => node.dataset.tk === focused);
        if (again && !again.disabled && again !== document.activeElement) again.focus({ preventScroll: true });
    }
}

function transportView(ctx, day, date, picture, waiting) {
    const T = TRANSPORT_TEXT;
    const root = el('div', 'transport-view');
    root.appendChild(transportTray(ctx, date, waiting));
    // How it is done, said once: while nobody at all is seated. After the first man it
    // is a sentence in the way of the picture.
    if (waiting.length > 0 && Object.keys(picture.where).length === 0) {
        const hint = el('p', 'transport-hint', T.hint);
        hint.id = 'transportHint';
        root.appendChild(hint);
    }
    // What is wrong is asked of the plan as the picture reads it, so a line on a card is
    // about a man who is drawn on that card.
    const issues = TransportEngine.validate(ctx, { unavailable: day.unavailable, status: day.status,
        trips: TransportEngine.tripsOf(ctx, picture.cars) });
    if (ctx.vehicles.length === 0) root.appendChild(el('p', 'empty-hint', T.noVehicles));
    ctx.vehicles.forEach(vehicle => {
        root.appendChild(transportCard(ctx, date, vehicle, picture.cars[vehicle.id] || null, issues));
    });
    const away = ctx.workers.filter(worker => ctx.attendance[worker.id] && day.status[worker.id]);
    if (away.length > 0) root.appendChild(transportAway(ctx, day, date, away));
    root.appendChild(transportFleet());
    return root;
}

// ------------------------------------------------------------------ the tray

// The men who work today and are in no seat, kept at the top of the list while the cars
// scroll under it - sticky inside the panel's own scroller, not fixed, so it is no new
// layer for a stuck iPhone frame to leave behind. It is also where a seated man is
// dropped to take him out of his car.
function transportTray(ctx, date, waiting) {
    const T = TRANSPORT_TEXT;
    const tray = el('section', 'transport-tray');
    tray.id = 'transportTray';
    const head = el('div', 'transport-tray-head');
    const nobody = Object.keys(ctx.attendance).length === 0;
    const title = el('h3', 'transport-tray-title',
        nobody ? T.nobody : waiting.length === 0 ? T.allSeated : T.waiting(waiting.length));
    title.id = 'transportTrayTitle';
    head.appendChild(title);
    if (waiting.length > 0) {
        // One quiet control for the man who does not ride with us: touched after a man
        // (or with a man dropped on it) it asks how he gets there; touched alone it asks
        // who first.
        const away = transportButton(T.notRiding, 'notRiding', () => transportAskAway(date, transportPicked));
        away.id = 'transportNotRiding';
        away.classList.add('transport-quiet');
        head.appendChild(away);
    }
    tray.appendChild(head);
    if (waiting.length > 0) {
        const chips = el('div', 'transport-chips');
        chips.id = 'transportChips';
        waiting.forEach(id => chips.appendChild(transportChip(ctx, id)));
        tray.appendChild(chips);
    }
    return tray;
}

function transportChip(ctx, workerId) {
    const T = TRANSPORT_TEXT;
    const name = transportWorkerName(ctx, workerId);
    const site = ctx.attendance[workerId];
    const chip = transportButton('', 'chip:' + workerId, () => transportAct(() => {
        transportPicked = transportPicked === workerId ? null : workerId;
        transportSaid = transportPicked ? T.picked(isolate(name)) : '';
    }));
    chip.classList.add('transport-chip');
    chip.dataset.worker = workerId;
    chip.setAttribute('aria-pressed', transportPicked === workerId ? 'true' : 'false');
    chip.setAttribute('aria-label', [name, transportSiteName(ctx, site)].filter(Boolean).join(' · '));
    // On the chip itself, so the copy that floats under a finger can take it from there.
    transportPaint(chip, site);
    chip.appendChild(transportDot(site));
    chip.appendChild(el('span', 'transport-chip-name', name));
    transportDragBind(chip, workerId, 'tray');
    return chip;
}

// ------------------------------------------------------------------ one vehicle

function transportCard(ctx, date, vehicle, seats, issues) {
    const T = TRANSPORT_TEXT;
    const out = Boolean(seats);
    const card = el('section', 'transport-card' + (out ? '' : ' transport-card-folded'));
    card.dataset.car = vehicle.id;
    const head = el('div', 'transport-card-head');
    const titles = el('div', 'transport-grow');
    titles.appendChild(el('h3', 'transport-vehicle-name', vehicle.name));
    if (out) {
        titles.appendChild(el('div', 'transport-sub transport-occupancy',
            T.occupancy(seats.filter(Boolean).length, vehicle.seats)));
    }
    head.appendChild(titles);
    // The one thing said about a vehicle every day: does it go out. Kept home, the card
    // folds to this line and its men are waiting again.
    const toggle = transportButton(out ? T.available : T.unavailable, 'avail:' + vehicle.id,
        () => transportAct(() => transportSetAvailable(date, vehicle.id, !out)));
    toggle.classList.add('transport-quiet', 'transport-toggle');
    toggle.dataset.avail = vehicle.id;
    toggle.setAttribute('aria-pressed', out ? 'true' : 'false');
    toggle.setAttribute('aria-label', `${transportRli(vehicle.name)}: ${out ? T.available : T.unavailable}`);
    head.appendChild(toggle);
    card.appendChild(head);
    if (!out) return card;

    // AT MOST ONE CALM LINE: a man seated who has no site in today's record (the day
    // changed under the plan - he is drawn as needing attention and can be taken out),
    // or else passengers with nobody in the driver's seat.
    const wrong = issues.filter(issue => issue.vehicle === vehicle.id);
    const lost = wrong.find(issue => issue.code === 'notWorking' || issue.code === 'unknownWorker');
    const line = lost ? T.notWorking(isolate(transportWorkerName(ctx, lost.worker)))
        : (wrong.some(issue => issue.code === 'noDriver') ? T.driverNone : '');
    if (line) card.appendChild(el('p', 'transport-card-line', line));

    card.appendChild(transportCar(ctx, date, vehicle, seats));

    const state = transportMarkState(date, vehicle.id);
    card.dataset.mark = state;
    if (state === 'nophone') {
        const none = transportBadge(T.noPhone, 'bad');
        none.classList.add('transport-mark');
        card.appendChild(none);
    } else if (state !== 'nodriver') {
        const row = el('div', 'transport-door-row');
        row.appendChild(transportDoor(date, vehicle.id, transportDriverNumber(date, vehicle.id),
            transportDriverMessage(date, vehicle.id)));
        if (state === 'opened') {
            const mark = transportBadge(T.opened, 'ok');
            mark.classList.add('transport-mark');
            row.appendChild(mark);
        }
        card.appendChild(row);
    }
    return card;
}

// THE CAR, SEEN FROM ABOVE WITH ITS FRONT AT THE TOP. It is a picture, not text, and the
// page's right-to-left direction MUST NOT MIRROR IT: Israel drives on the right, so the
// wheel is on the LEFT of the car, and in a mirrored drawing the driver would sit on the
// passenger's side - on every card, with nothing looking wrong. So the drawing is laid
// out left-to-right by its own `dir`, whatever the document says, and the rows come from
// TransportEngine.seatRows already in left-to-right order. The names inside the seats
// are text again and take their own direction.
function transportCar(ctx, date, vehicle, seats) {
    const car = el('div', 'transport-car');
    car.dir = 'ltr';
    car.setAttribute('role', 'group');
    car.setAttribute('aria-label', transportRli(vehicle.name));
    ['fl', 'fr', 'rl', 'rr'].forEach(corner => {
        const wheel = el('span', `transport-wheel transport-wheel-${corner}`);
        wheel.setAttribute('aria-hidden', 'true');
        car.appendChild(wheel);
    });
    const shell = el('div', 'transport-car-body');
    const glass = el('div', 'transport-windscreen');
    glass.setAttribute('aria-hidden', 'true');
    shell.appendChild(glass);
    TransportEngine.seatRows(vehicle).forEach(row => {
        const line = el('div', 'transport-seat-row');
        line.style.gridTemplateColumns = `repeat(${row.length}, minmax(0, 1fr))`;
        row.forEach(n => line.appendChild(transportSeat(ctx, date, vehicle, n, seats[n] || null)));
        shell.appendChild(line);
    });
    car.appendChild(shell);
    return car;
}

function transportSeat(ctx, date, vehicle, n, sitting) {
    const T = TRANSPORT_TEXT;
    const tile = transportButton('', `seat:${vehicle.id}:${n}`, () => transportSeatTap(date, vehicle, n, sitting));
    tile.classList.add('transport-seat');
    tile.dataset.vehicle = vehicle.id;
    tile.dataset.seat = String(n);
    if (n === 1) {
        tile.classList.add('transport-seat-driver');
        tile.appendChild(transportGlyph('wheel'));
    }
    if (!sitting) {
        tile.classList.add('transport-seat-empty');
        if (n !== 1) tile.appendChild(transportGlyph('plus'));
        tile.appendChild(el('span', 'transport-seat-label', n === 1 ? T.driverSeat : T.addWorker));
        return tile;
    }
    const name = transportWorkerName(ctx, sitting);
    const site = ctx.attendance[sitting];
    tile.dataset.worker = sitting;
    tile.classList.add('transport-seat-taken');
    // No site in today's record: the day changed under the plan. He stays drawn, marked,
    // and can be dragged or tapped out - the card's line says why.
    if (!site) tile.classList.add('transport-seat-attn');
    transportPaint(tile, site);
    const label = el('span', 'transport-seat-name', name);
    label.dir = 'auto';
    tile.appendChild(label);
    // The whole name and the site, whatever the tile had room to draw.
    tile.setAttribute('aria-label', [n === 1 ? T.driver(isolate(name)) : name, transportSiteName(ctx, site)]
        .filter(Boolean).join(' · '));
    transportDragBind(tile, sitting, 'seat');
    return tile;
}

function transportSayPlaced(date, workerId, vehicle, placed) {
    if (!placed || !vehicle) return;
    transportSaid = TRANSPORT_TEXT.seatedIn(isolate(transportWorkerName(transportContext(date), workerId)),
        transportRli(vehicle.name));
}

// One of the app's own questions (js/ui/ask.js), listing men. Each row is a name and a
// site; two rows that would read the same are numbered, because the answer comes back as
// the row's words and two men called the same must not be one answer.
function transportChoose(title, ctx, ids) {
    const T = TRANSPORT_TEXT;
    const byLabel = transportMap();
    const labels = ids.map(id => {
        const base = [transportWorkerName(ctx, id), transportSiteName(ctx, ctx.attendance[id])].filter(Boolean).join(' · ');
        let label = base;
        for (let k = 2; byLabel[label] || label === T.cancel; k += 1) label = `${base} (${k})`;
        byLabel[label] = id;
        return label;
    });
    return askChoice({ title, choices: labels.concat([T.cancel]) })
        .then(answer => (answer && byLabel[answer]) || null);
}

// A touch on a seat. With a man already touched in the tray it is where he goes; on an
// empty seat it asks who; on a taken one it offers the one thing that needs no
// explaining - out of the car.
function transportSeatTap(date, vehicle, n, sitting) {
    const T = TRANSPORT_TEXT;
    if (transportPicked) {
        const id = transportPicked;
        transportPicked = null;
        transportSaid = '';
        transportAct(() => transportSayPlaced(date, id, vehicle, transportPlace(date, id, vehicle.id, n)));
        return;
    }
    const ctx = transportContext(date);
    if (sitting) {
        const name = transportWorkerName(ctx, sitting);
        askChoice({ title: name, choices: [T.removeFromVehicle, T.cancel] }).then(answer => {
            if (answer === T.removeFromVehicle && transportUnseat(date, sitting)) transportSaid = T.returned(isolate(name));
            renderTransportIfOpen();
        });
        return;
    }
    const waiting = TransportEngine.waiting(ctx, transportDayOf(date));
    if (waiting.length === 0) {
        // A TAP THAT CHANGES NOTHING SAYS WHY, ON THE GLASS. On v171 the suggest button
        // did nothing the owner could see (nobody had been marked as allowed to drive)
        // and he took it for broken. An empty seat with nobody left to put in it is the
        // one tap here that cannot do anything - so it answers in a sentence.
        askTell({ title: T.allSeated }).then(renderTransportIfOpen);
        return;
    }
    transportChoose(n === 1 ? T.driverDialogTitle(transportRli(vehicle.name)) : T.chooseTitle, ctx, waiting).then(id => {
        if (id) transportSayPlaced(date, id, vehicle, transportPlace(date, id, vehicle.id, n));
        renderTransportIfOpen();
    });
}

// ------------------------------------------------------------------ not with us

// How a man who does not ride with us gets there. `workerId` when it is already known
// who (he was touched, or dropped on the control); otherwise the waiting men are listed
// first.
function transportAskAway(date, workerId) {
    const T = TRANSPORT_TEXT;
    const ctx = transportContext(date);
    const day = transportDayOf(date);
    const who = workerId && TransportEngine.isRider(ctx, day, workerId) ? Promise.resolve(workerId)
        : transportChoose(T.notRidingTitle, ctx, TransportEngine.waiting(ctx, day));
    return who.then(id => {
        if (!id) return null;
        const options = [[T.statusPrivate, 'private'], [T.statusContractor, 'contractor'], [T.statusOther, 'other']];
        return askChoice({ title: T.statusLabel(isolate(transportWorkerName(ctx, id))),
            choices: options.map(option => option[0]).concat([T.cancel]) }).then(answer => {
            const chosen = options.find(option => option[0] === answer);
            if (!chosen) return;
            transportSetStatus(date, id, chosen[1]);
            if (transportPicked === id) { transportPicked = null; transportSaid = ''; }
        });
    }).then(renderTransportIfOpen);
}

function transportFold(id, key, title, open, onToggle) {
    const fold = document.createElement('details');
    fold.className = 'transport-card transport-fold';
    fold.id = id;
    fold.open = open;
    fold.addEventListener('toggle', () => onToggle(fold.open));
    const handle = el('summary', null, title);
    handle.dataset.tk = key;
    fold.appendChild(handle);
    return fold;
}

// The men marked as getting there another way: one folded line at the bottom, and from
// inside it each can be brought back to the tray.
function transportAway(ctx, day, date, away) {
    const T = TRANSPORT_TEXT;
    const fold = transportFold('transportAway', 'away', T.notRidingCount(away.length), transportAwayOpen,
        open => { transportAwayOpen = open; });
    away.forEach(worker => {
        const row = el('div', 'transport-row');
        row.dataset.away = worker.id;
        const titles = el('div', 'transport-grow');
        titles.appendChild(el('div', 'transport-name', worker.name));
        titles.appendChild(el('div', 'transport-sub', transportStatusText(day.status[worker.id])));
        row.appendChild(titles);
        const back = transportButton(T.bringBack, 'back:' + worker.id,
            () => transportAct(() => transportSetStatus(date, worker.id, null)));
        back.classList.add('transport-quiet');
        back.setAttribute('aria-label', `${T.bringBack}: ${isolate(worker.name)}`);
        row.appendChild(back);
        fold.appendChild(row);
    });
    return fold;
}

// ------------------------------------------------------------------ the list of vehicles

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

// The list is the owner's to keep, and keeping it is rare: SETUP, not daily work, so it
// is one folded row at the very bottom of the screen, and inside it each vehicle's three
// tools are behind a row of their own.
function transportFleet() {
    const T = TRANSPORT_TEXT;
    const fold = transportFold('transportFleet', 'fleet', T.vehiclesRow, transportFleetOpen,
        open => { transportFleetOpen = open; });
    const vehicles = transportSettings().vehicles.filter(vehicle => vehicle.active);
    if (vehicles.length === 0) fold.appendChild(el('p', 'empty-hint', T.noVehicles));
    vehicles.forEach(vehicle => {
        const item = el('div', 'transport-fleet-item');
        item.dataset.vehicle = vehicle.id;
        const titles = el('div', 'transport-row');
        titles.appendChild(el('div', 'transport-name transport-grow', vehicle.name));
        titles.appendChild(el('div', 'transport-sub', T.seats(vehicle.seats)));
        item.appendChild(titles);
        const more = document.createElement('details');
        more.className = 'transport-more';
        const handle = el('summary', null, T.editVehicle);
        handle.dataset.tk = 'more:' + vehicle.id;
        handle.setAttribute('aria-label', `${T.editVehicle}: ${transportRli(vehicle.name)}`);
        more.appendChild(handle);
        const tools = el('div', 'transport-row transport-wrap');
        tools.appendChild(transportButton(T.renameVehicle, 'rename:' + vehicle.id, () => {
            transportAskVehicleName(vehicle).then(name => {
                if (name) transportRenameVehicle(vehicle.id, name);
                renderTransportIfOpen();
            });
        }));
        tools.appendChild(transportButton(T.changeSeats, 'seats:' + vehicle.id, () => {
            transportAskSeats(vehicle.name, vehicle.seats).then(seats => {
                if (seats) transportSetVehicleSeats(vehicle.id, seats);
                renderTransportIfOpen();
            });
        }));
        tools.appendChild(transportButton(T.retireVehicle, 'retire:' + vehicle.id, () => {
            askConfirm({ title: T.retireTitle(transportRli(vehicle.name)), message: T.retireLead,
                ok: T.retireVehicle, cancel: T.cancel }).then(yes => {
                if (yes) transportRetireVehicle(vehicle.id);
                renderTransportIfOpen();
            });
        }));
        more.appendChild(tools);
        item.appendChild(more);
        fold.appendChild(item);
    });
    const add = transportButton(T.addVehicle, 'addVehicle', () => {
        transportAskVehicleName(null).then(name => {
            if (!name) return null;
            return transportAskSeats(name, 5).then(seats => {
                if (seats) transportAddVehicle(name, seats);
                renderTransportIfOpen();
            });
        });
    });
    add.id = 'transportAddVehicle';
    add.classList.add('transport-wide');
    fold.appendChild(add);
    return fold;
}

// ------------------------------------------------------------------ the door to WhatsApp

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

// ================================================================== carrying a man
//
// POINTER EVENTS, and never the HTML5 drag-and-drop API: on an iPhone that API starts
// only after its own long press, shows its own lifted picture, and inside a home-screen
// app is the thing most likely to do nothing at all. What is carried is a copy of the
// name floating over the finger; the seat under the finger is lit; the drop is one call
// to the same transportPlace a tap makes.
//
// TWO WAYS A MAN IS LIFTED, because the two places he is lifted from are not alike:
//
//   FROM THE TRAY, AT ONCE. A waiting man's chip has `touch-action: none` (css/design.css),
//   so the browser never takes the gesture for its own and every movement arrives here.
//   Past TRANSPORT_SLOP it is a drag - unless the movement is nearly level and the tray
//   has more men than fit, in which case it is the tray being slid sideways, and this
//   file slides it (the browser was told to keep out, so nobody else will). A finger
//   that goes down and comes up inside the slop is a tap, and the click is left alone.
//
//   FROM A SEAT, AFTER A HOLD. A filled car is mostly seats. If a seated man could be
//   lifted the instant a finger moved on him, the swipe that scrolls the list - which
//   starts on a seat more often than not - would carry a man off and drop him on
//   whatever seat the finger left the glass over: a plan changed by scrolling, with
//   nothing said. So a seat is left to the browser (`touch-action: manipulation`: it
//   scrolls), and a man is lifted from it only by a finger that stays put for
//   TRANSPORT_HOLD_MS. From then on this file's non-passive touchmove listener on that
//   one tile cancels the browser's scroll, and the gesture is a drag. The listener is on
//   the tile and nowhere else, and does nothing until a man is lifted, so the list
//   scrolls with passive handling everywhere a scroll can start. A mouse has no scroll
//   to confuse a drag with and lifts a seated man at once, like a waiting one.
//
// `pointercancel` - the browser took the gesture, a call came in, the app went to the
// background - puts everything back and changes nothing.
const TRANSPORT_SLOP = 8;            // px a finger may wander and still be a tap
const TRANSPORT_HOLD_MS = 300;       // a finger still on a seated man this long has lifted him
const TRANSPORT_EDGE = 64;           // px inside the top or bottom of the list where carrying scrolls it
const TRANSPORT_EDGE_STEP = 14;      // px a frame at the very edge
const TRANSPORT_EDGE_REST = 250;     // ms a finger must rest in that strip before it scrolls
const TRANSPORT_LEVEL = 2.5;         // across at least this many times down is the tray being slid

let transportDrag = null;
let transportSwallowUntil = 0;       // until when the click that ends a drag is not a tap

function transportDragBind(node, workerId, from) {
    node.classList.add('transport-draggable');
    node.addEventListener('pointerdown', event => transportDragDown(event, node, workerId, from));
    node.addEventListener('pointermove', transportDragMove);
    node.addEventListener('pointerup', transportDragUp);
    node.addEventListener('pointercancel', transportDragCancel);
    // A long press is how a man is lifted, so it must not ALSO be the browser's own long
    // press: no menu, and no native drag of the button's picture.
    node.addEventListener('contextmenu', event => event.preventDefault());
    node.addEventListener('dragstart', event => event.preventDefault());
    if (from === 'seat') {
        node.addEventListener('touchmove', event => {
            const drag = transportDrag;
            if (drag && drag.node === node && drag.phase === 'drag' && event.cancelable) event.preventDefault();
        }, { passive: false });
    }
}

function transportDragDown(event, node, workerId, from) {
    if ((event.pointerType === 'mouse' && event.button !== 0) || event.isPrimary === false) return;
    // A press that never got its release (the node was replaced under it) must not make
    // every later press a no-op.
    if (transportDrag && transportDrag.phase === 'down') transportDragEnd(false);
    if (transportDrag) return;
    const drag = { id: workerId, from, node, pointer: event.pointerId, touch: event.pointerType === 'touch',
        x0: event.clientX, y0: event.clientY, x: event.clientX, y: event.clientY, phase: 'down',
        timer: 0, frame: 0, ghost: null, over: null, overNode: null, redraw: false, chips: null, slide0: 0,
        speed: 0, movedAt: 0, zone: 0, zoneSince: 0 };
    transportDrag = drag;
    try { node.setPointerCapture(event.pointerId); } catch (error) { /* a pointer that has already gone */ }
    if (from === 'seat' && drag.touch) {
        drag.timer = setTimeout(() => {
            if (transportDrag === drag && drag.phase === 'down') transportDragLift(drag);
        }, TRANSPORT_HOLD_MS);
    }
}

function transportDragMove(event) {
    const drag = transportDrag;
    if (!drag || event.pointerId !== drag.pointer) return;
    const dx = event.clientX - drag.x0;
    const dy = event.clientY - drag.y0;
    if (drag.phase === 'down') {
        if (Math.hypot(dx, dy) <= TRANSPORT_SLOP) return;
        // A finger that moved on a seated man before the hold was up is scrolling the
        // list. It is the browser's from here, and nobody is lifted.
        if (drag.from === 'seat' && drag.touch) { transportDragEnd(false); return; }
        const chips = document.getElementById('transportChips');
        if (drag.from === 'tray' && chips && chips.scrollWidth > chips.clientWidth + 1
            && Math.abs(dx) >= TRANSPORT_LEVEL * Math.abs(dy)) {
            drag.phase = 'slide';
            drag.chips = chips;
            drag.slide0 = chips.scrollLeft + dx;
        } else transportDragLift(drag);
    }
    if (drag.phase === 'slide') {
        const now = Date.now();
        if (drag.movedAt) drag.speed = (event.clientX - drag.x) / Math.max(1, now - drag.movedAt);
        drag.movedAt = now;
        drag.x = event.clientX;
        // The men follow the finger: the same subtraction whichever way the tray's own
        // numbers run in a right-to-left page.
        drag.chips.scrollLeft = drag.slide0 - dx;
        return;
    }
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (drag.phase === 'drag') transportDragTrack(drag);
}

function transportDragLift(drag) {
    clearTimeout(drag.timer);
    drag.phase = 'drag';
    const parts = transportParts();
    drag.node.classList.add('transport-lifted');
    parts.panel.classList.add('transport-dragging');
    // The copy under the finger. Inside the panel and positioned by it, NOT fixed: every
    // fixed layer of this page is counted and brought down with a stuck iPhone frame
    // (css/app.css, body.frame-lowered), and this one would have been one more to forget.
    const ghost = el('div', 'transport-ghost');
    ghost.setAttribute('aria-hidden', 'true');
    const dot = el('span', 'transport-dot', '');
    const colour = drag.node.style.getPropertyValue('--seat-site');
    if (colour) dot.style.setProperty('--seat-site', colour);
    ghost.appendChild(dot);
    ghost.appendChild(el('span', null, transportWorkerName(transportContext(transportDate), drag.id)));
    parts.panel.appendChild(ghost);
    drag.ghost = ghost;
    transportDragTrack(drag);
    drag.frame = requestAnimationFrame(now => transportDragScroll(drag, now));
}

// What a man released at this point would land on: a seat, the control for men who do
// not ride with us, the tray - or nothing, and then nothing changes.
function transportDropAt(x, y) {
    const panel = transportParts().panel;
    const hit = document.elementFromPoint(x, y);
    if (!hit || !panel || !panel.contains(hit) || !hit.closest) return null;
    const seat = hit.closest('.transport-seat');
    if (seat) return { kind: 'seat', node: seat, vehicle: seat.dataset.vehicle, n: Number(seat.dataset.seat) };
    const away = hit.closest('#transportNotRiding');
    if (away) return { kind: 'away', node: away };
    const tray = hit.closest('#transportTray');
    return tray ? { kind: 'tray', node: tray } : null;
}

function transportDragTrack(drag) {
    const frame = transportParts().panel.getBoundingClientRect();
    // Above the finger, so the name is read and not covered.
    drag.ghost.style.transform = `translate(${Math.round(drag.x - frame.left)}px, ${Math.round(drag.y - frame.top)}px) translate(-50%, -135%)`;
    const over = transportDropAt(drag.x, drag.y);
    const node = over ? over.node : null;
    if (drag.overNode !== node) {
        if (drag.overNode) drag.overNode.classList.remove('transport-over');
        if (node) node.classList.add('transport-over');
        drag.overNode = node;
    }
    drag.over = over;
}

// A man carried to the bottom of the list (or to just under the tray) scrolls it, faster
// the nearer the edge, so he can be taken to a car that was off the screen. One frame at
// a time, and the seat under the finger is looked up again after each step - the finger
// has not moved, the seats have.
//
// ONLY A FINGER THAT STAYS IN THE ZONE SCROLLS. Every man carried out of the tray passes
// through the strip just under it on his way to a seat; when that strip scrolled at once,
// a list that was not at its top slid under the finger in mid-carry and the man landed
// beside the seat he was being taken to (measured at 375x667). So the zone has to be
// rested in for TRANSPORT_EDGE_REST first; passing through it does nothing.
function transportDragScroll(drag, time) {
    if (transportDrag !== drag || drag.phase !== 'drag') return;
    const body = transportParts().body;
    const box = body.getBoundingClientRect();
    const tray = document.getElementById('transportTray');
    const top = tray ? tray.getBoundingClientRect().bottom : box.top;
    let step = 0;
    if (drag.y > box.bottom - TRANSPORT_EDGE) {
        step = Math.ceil(TRANSPORT_EDGE_STEP * Math.min(1, (drag.y - (box.bottom - TRANSPORT_EDGE)) / TRANSPORT_EDGE));
    } else if (drag.y > top && drag.y < top + TRANSPORT_EDGE) {
        step = -Math.ceil(TRANSPORT_EDGE_STEP * Math.min(1, (top + TRANSPORT_EDGE - drag.y) / TRANSPORT_EDGE));
    }
    const zone = Math.sign(step);
    if (zone !== drag.zone) { drag.zone = zone; drag.zoneSince = time; }
    if (step && time - drag.zoneSince >= TRANSPORT_EDGE_REST) {
        const before = body.scrollTop;
        body.scrollTop = before + step;
        if (body.scrollTop !== before) transportDragTrack(drag);
    }
    drag.frame = requestAnimationFrame(now => transportDragScroll(drag, now));
}

// Everything a gesture put on the page, taken off it. `swallow`: the click the browser
// is about to make out of this release is not a tap.
function transportDragEnd(swallow) {
    const drag = transportDrag;
    if (!drag) return;
    transportDrag = null;
    clearTimeout(drag.timer);
    if (drag.frame) cancelAnimationFrame(drag.frame);
    try { drag.node.releasePointerCapture(drag.pointer); } catch (error) { /* already released */ }
    drag.node.classList.remove('transport-lifted');
    if (drag.overNode) drag.overNode.classList.remove('transport-over');
    if (drag.ghost && drag.ghost.parentNode) drag.ghost.parentNode.removeChild(drag.ghost);
    const panel = transportParts().panel;
    if (panel) panel.classList.remove('transport-dragging');
    if (swallow) transportSwallowUntil = Date.now() + 400;
    // The redraw that waited for the finger.
    if (drag.redraw) renderTransportIfOpen();
}

function transportDragUp(event) {
    const drag = transportDrag;
    if (!drag || event.pointerId !== drag.pointer) return;
    if (drag.phase === 'slide') {
        const chips = drag.chips;
        let speed = drag.speed;
        transportDragEnd(true);
        // The tray keeps going for a moment, the way a list the browser scrolls does.
        const glide = () => {
            if (Math.abs(speed) < 0.05 || !chips.isConnected) return;
            chips.scrollLeft -= speed * 16;
            speed *= 0.92;
            requestAnimationFrame(glide);
        };
        glide();
        return;
    }
    if (drag.phase !== 'drag') { transportDragEnd(false); return; }
    drag.x = event.clientX;
    drag.y = event.clientY;
    transportDragTrack(drag);
    const over = drag.over;
    // A mouse always clicks after its release; a finger does only when it never moved.
    transportDragEnd(!drag.touch || Math.hypot(drag.x - drag.x0, drag.y - drag.y0) <= TRANSPORT_SLOP);
    transportDrop(drag, over);
}

function transportDragCancel(event) {
    const drag = transportDrag;
    if (!drag || event.pointerId !== drag.pointer) return;
    const lifted = drag.phase === 'drag';
    transportDragEnd(false);
    if (lifted) renderTransportIfOpen();
}

// Released. On a seat: he sits there (and the man who sat there changes places with him,
// or goes back to wait). On the tray, from a seat: he is out of the car. On the control
// for men who do not ride with us: it asks how he gets there. Anywhere else: nothing.
function transportDrop(drag, over) {
    const date = transportDate;
    if (!date || !transportIsOpen()) return;
    const T = TRANSPORT_TEXT;
    if (over && over.kind === 'seat') {
        const vehicle = transportFind(transportSettings().vehicles, over.vehicle);
        transportSayPlaced(date, drag.id, vehicle, transportPlace(date, drag.id, over.vehicle, over.n));
    } else if (over && over.kind === 'tray' && drag.from === 'seat') {
        if (transportUnseat(date, drag.id)) {
            transportSaid = T.returned(isolate(transportWorkerName(transportContext(date), drag.id)));
        }
    } else if (over && over.kind === 'away'
        && TransportEngine.isRider(transportContext(date), transportDayOf(date), drag.id)) {
        transportAskAway(date, drag.id);
        return;
    }
    renderTransport();
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

// Back from WhatsApp, the marks are brought up to date. Gone to the background with a
// man in the air: he is put down where he was - the release will never arrive.
function transportWatch() {
    if (typeof document === 'undefined' || !document.addEventListener) return;
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') transportDragEnd(false);
        else renderTransportIfOpen();
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
