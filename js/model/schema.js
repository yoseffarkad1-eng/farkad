// The v2 data model.
//
// v1 stored one flat list of {index, value} where index was a cell's position in the DOM.
// That could not express what actually happens: a worker at two sites in one day, a rate
// per site, or any day outside the single week on screen. It also made every write a
// whole-document replacement, which is unsafe now that three people build the roster
// together in the evening.
//
// v2 is keyed by date and worker id:
//
//   days["2026-08-12"].plan["w_01"]   = { entries: [{ placeId }] }
//   days["2026-08-12"].actual["w_01"] = { entries: [{ placeId, rate, extraHours }] }
//   days["2026-08-12"].actual["w_02"] = { absent: true, entries: [] }
//
// plan   = the seder written the night before, by whoever is doing it
// actual = what really happened, recorded after work; this is what pay and invoices
//          are calculated from
//
// Because every value hangs off a (date, worker) path, two people editing different
// workers touch different fields and never collide.

// ---------------------------------------------------------------- what this build does
//
// Features that are OFF, in one place, so that "is it on?" is a question with one answer
// and not a guess made separately by four screens.
//
// Both of these are off because turning them on would be a decision about somebody's
// money or somebody's record, and neither decision has been made. Every path behind them
// is still here and still tested - a gate that rots while it is shut is not a gate - and
// the suites that prove they work turn the flag on deliberately. Nothing in the app ever
// writes to this object; there is no setting, no URL parameter and no dialog that reaches
// it. It is changed by editing this line, in a commit, with the reason in the message.
const FARKAD_SHIPPED_FLAGS = {
    // The one action with nothing behind it. Off because the proof it depends on - "made
    // here and never sent anywhere" - is a statement about what two OTHER phones hold,
    // and the evidence for it lives on this one. Getting it wrong deletes a man the other
    // two are still recording days against. The archive does everything this was for.
    permanentDeletion: false,

    // Vehicles. Off because the owner cancelled the feature, and because the shape it had
    // assumed that every active vehicle went out on every worked day - so one day with no
    // vehicle state recorded quietly added the daily vehicle charge to somebody's pay.
    // The stored vehicle records are NOT removed by this; see the retirement below.
    vehicles: false,

    // Carrying an unsettled advance from one account to the next. OFF, and not because
    // the arithmetic is in doubt - it is in advanceAccount below, and tested - but
    // because switching it on RESTATES fortnights that have already been paid. A man who
    // took 5,000 against 3,200 earned is currently shown a net of -1,800 and a next
    // account that starts from nothing; with the carry, the first account deducts 3,200
    // and the second deducts the rest, so both change what they say.
    //
    // This app does not know which fortnights have been handed over, and a report that
    // reprints differently from the copy somebody was paid against is the one thing the
    // owner ruled out. So the switch belongs to a person who knows, and planAdvanceCarry
    // tells them exactly which accounts and which men it would move before they touch it
    // - the same courtesy planRateStamping gives before stamping old days.
    //
    // AND IT MOVES WITH LEDGER_WRITES (js/model/ledger.js), in the same commit, in the
    // same direction. The repayment control needs both gates: with the carry shut nothing
    // reads a repayment, and a man who hands back 200 is still deducted 500. A build that
    // opened one without the other would ship that, so tests/data.test.mjs pins the pair.
    carryAdvances: false
};

// FROZEN. `const` binds the name, not the object: anything holding a reference could set
// a field on it, and a feature gate that a stray line can open is not a gate. The suites
// were doing exactly that, which meant the shipped default was never actually read by the
// tests that claimed to be reading it.
//
// The one seam is FARKAD_FLAG_OVERRIDES, and it is a TEST seam. No file this app ships
// defines it - tests/build.test.mjs fails if one ever does - and nothing in a browser can
// create it, because index.html loads only the scripts in that shell. A suite that needs
// the machinery behind a shut gate sets it in the sandbox before the app loads, which is
// the same thing a build with the flag on would do, and then it is testing that build.
const FARKAD_FLAGS = Object.freeze(Object.assign(
    {},
    FARKAD_SHIPPED_FLAGS,
    (typeof FARKAD_FLAG_OVERRIDES !== 'undefined' && FARKAD_FLAG_OVERRIDES
        && typeof FARKAD_FLAG_OVERRIDES === 'object') ? FARKAD_FLAG_OVERRIDES : {}
));

const SCHEMA_VERSION = 2;

const RATE_NORMAL = 'normal';
const RATE_EXTRA = 'extra';
const RATE_DOUBLE = 'double';
const RATES = [RATE_NORMAL, RATE_EXTRA, RATE_DOUBLE];

const RATE_LABELS = {
    [RATE_NORMAL]: 'רגיל',
    [RATE_EXTRA]: 'שעות נוספות',
    [RATE_DOUBLE]: 'יום כפול'
};

// A worker can be at two sites in one day. This is the ceiling the manager confirmed;
// it exists so the UI can size itself, not to reject data that is already stored.
const MAX_ENTRIES_PER_DAY = 2;

// The dot, because every edit travels as a dotted field path and an id containing one
// splits that path into a different one. The rest are Firestore's field-path
// metacharacters, kept out for the same reason the sync paths keep them out.
const UNSAFE_ID = /[.`~*/\[\]]/;

const ROSTER_KINDS = [
    ['workers', 'workerOrder', 'עובד'],
    ['places', 'placeOrder', 'אתר']
];

function emptySchedule() {
    return {
        schemaVersion: SCHEMA_VERSION,
        workers: [],
        places: [],
        days: {},
        // The crew's vehicles. One each for two of the men and three for a third, and a
        // vehicle earns for the person who OWNS it, not the one who drives it.
        //
        // See vehiclesOutOn() below for why nothing is written on an ordinary evening.
        vehicles: [],
        // Money handed over before settlement day, keyed by its own id so two people
        // recording an advance at the same moment write to different fields.
        advances: {},
        // The append-only history of those same advances - see js/model/ledger.js. Read
        // by this build, written by nothing yet: three phones share this record and the
        // other two cannot read entries, so the old field above is still the one every
        // device writes until they have all updated.
        // `unreadable` holds ledger entries this build cannot fold, kept verbatim.
        //
        // Nothing reads it for arithmetic and nothing repairs what is in it - a repaired
        // entry is a claim about money that nobody made. It exists so that the read path
        // has somewhere to put an entry it does not understand OTHER than the floor.
        // Before it, normaliseSchedule left such an entry out of the object it built,
        // save() serialised that object over the record, and the only copy was gone.
        ledger: { advances: {}, unreadable: {} },
        updatedAt: null,
        updatedBy: null
    };
}

// ---------------------------------------------------------------- advances
//
// An advance is cash given mid-account, and it is the one number that turns a pay sheet
// into the wrong pay sheet: the days are right, the rate is right, and the man was
// already paid 500 of it a week ago. Kept as its own record rather than folded into the
// total, so the statement can show what was earned AND what is left.

function advanceId() {
    return 'a_' + Math.random().toString(36).slice(2, 10);
}

// ---------------------------------------------------------------- identity
//
// Ids used to be one past the highest in the list. Two phones holding the same roster -
// which is the normal state of three people sharing one record - therefore handed the
// same id to two different men, and from that moment every day recorded against it
// belonged to whichever of them the reading device happened to have. That is a pay
// sheet, not a display glitch, and nothing anywhere would have said so.
//
// A random id cannot collide by construction, so no coordination is needed and it works
// offline, which is where the two additions actually happen.
//
// Ids ALREADY ISSUED are never touched. w_01 stays w_01: every day, advance and archived
// copy in existence points at it, and renaming an id is the one operation that would
// detach a man from his own history.
function newEntityId(prefix) {
    const bytes = (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function')
        ? crypto.randomUUID().replace(/-/g, '')
        : Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
    return `${prefix}_${bytes.slice(0, 12)}`;
}

// What is wrong with a roster, said in sentences rather than repaired.
//
// A duplicate id in an imported file is genuinely ambiguous: two rows claim to be the
// same person, their days are already merged under one id, and there is no way to tell
// from here which day belonged to whom. Renumbering one of them silently would invent an
// answer and hide the question. So the import stops and the file is left alone.
function validateRosterIds(raw) {
    const problems = [];

    [['workers', 'עובד'], ['places', 'אתר']].forEach(([kind, label]) => {
        const list = Array.isArray(raw && raw[kind]) ? raw[kind] : [];
        const seen = new Set();

        list.forEach((item, index) => {
            const id = item && item.id !== undefined && item.id !== null ? String(item.id) : '';
            const name = (item && item.name) ? String(item.name) : `#${index + 1}`;

            if (!id) {
                problems.push(`${label} "${name}" בקובץ בלי מזהה.`);
                return;
            }
            if (seen.has(id)) {
                problems.push(`המזהה ${id} מופיע ביותר מ${label} אחד ("${name}").`);
                return;
            }
            seen.add(id);
        });
    });

    return problems;
}

// ---------------------------------------------------------------- is it a schedule?
//
// Three questions, and they are not the same question:
//
//   storedScheduleProblems  - is this a record this device wrote for itself? Structure
//                             and types only. A live record is a merge in progress and
//                             may name a worker whose roster field has not arrived yet.
//   fullScheduleProblems    - is this a whole schedule somebody is asking to replace
//                             EVERYTHING with? Everything above, plus every reference
//                             resolving, because this one overwrites three phones.
//   upgradeStoredSchedule   - the one narrow step between a genuinely old record and
//                             today's shape. Not a repair kit.
//
// All three run on the RAW parsed content, before normaliseSchedule. That order is the
// point: normaliseSchedule is deliberately forgiving - it has to be, a half-finished
// remote write should be read for what is in it rather than crash the app - so it turns
// {}, null, [] and {"workers":[],"places":[]} into an empty schedule without a word.
// Forgiving is right for a document arriving from the cloud and catastrophic for one
// about to replace the screen, the disk and the other two phones.

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// A whole number of things, at or above zero, with no coercion anywhere.
//
// Number(x) || 0 read "3" as 3, true as 1, 1.5 as 1.5 and null as 0 - so a corrupt
// record became a valid one on the way in, and the sequence number that decides which
// half of the journal a restore supersedes is not a field to be lenient about.
function isSafeSeq(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

// An id that can be half of a field path.
//
// Every edit travels as days.<date>.<layer>.<workerId>, so a dot inside an id splits
// that path into a different one: the write lands somewhere else in the document and the
// entry it was meant to be arrives against a stranger. The rest are Firestore's own
// field-path metacharacters, refused for the same reason.
// ONE PREDICATE, and it knows about prototypes.
//
// This used to accept `__proto__`, `prototype` and `constructor`, and every map key in
// this app is checked by it: the ledger's entries, the legacy advances field every phone
// still writes, the day records, the roster. Assigning into a plain object under the
// first of those three does not store a value - it RE-PARENTS the map. Object.keys()
// then answers [], the record is in no map anybody reads, `unreadable` never hears of
// it, Recovery is never told, writes are not blocked, and the next ordinary save writes
// the emptiness over the only record that money changed hands.
//
// It is not prototype pollution: Object.prototype is untouched, and a check for that
// would have passed while the money vanished. It is a deletion performed by a read,
// which is the one thing iron law 10 exists to make impossible.
//
// The wire predicate below - isSafeSegment - already knew the three names, because
// journalEntryProblems asks it. So the app looked like it had thought about this, and
// half of it had. The two predicates are now the same answer about the same question,
// and isSafeSegment is kept as the name the path code reads.
//
// POISON_SEGMENTS is declared further down the file, beside the path checks it was
// written for; this function is only ever called at run time, so the order is fine and
// the list stays where its own reasoning lives.
function isSafeId(value) {
    return typeof value === 'string'
        && value.length > 0 && value.length <= 100
        && value === value.trim()
        && !UNSAFE_ID.test(value)
        && POISON_SEGMENTS.indexOf(value) === -1;
}

// A date that exists. The regex on its own accepts 2026-02-30 and 2025-02-29, which are
// not days anybody worked, and a payroll report that sums them is a report of a month
// that did not happen.
function isRealDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7));
    const day = Number(value.slice(8, 10));
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;

    const made = new Date(Date.UTC(year, month - 1, day));
    return made.getUTCFullYear() === year
        && made.getUTCMonth() === month - 1
        && made.getUTCDate() === day;
}

function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

// The one narrow, deterministic step between a genuinely old record and today's shape.
//
// Builds before advances existed wrote no `advances` block at all, and there is exactly
// one right answer for what a record from that build holds: none. That is the whole
// migration. Nothing else is filled in, because "fill in whatever is missing" is how
// {"workers":[],"places":[]} became a valid empty schedule in the first place. A record
// missing anything else is not an old record, it is a damaged one, and telling those two
// apart is what this section exists for.
//
// Returns the record to read, or null when it is not a record from a build we know.
function upgradeStoredSchedule(parsed) {
    if (!isPlainObject(parsed)) return null;
    if (!Array.isArray(parsed.workers) || !Array.isArray(parsed.places)) return null;
    if (!isPlainObject(parsed.days)) return null;

    if (parsed.advances !== undefined) return parsed;

    const upgraded = Object.assign({}, parsed);
    upgraded.advances = {};
    return upgraded;
}

// Structure and types. Run on the record this device wrote for itself.
function storedScheduleProblems(raw) {
    if (!isPlainObject(raw)) return ['הרישום אינו מסמך של לוח עבודה.'];

    const problems = [];
    if (!Array.isArray(raw.workers)) problems.push('רשימת העובדים חסרה מהרישום.');
    if (!Array.isArray(raw.places)) problems.push('רשימת האתרים חסרה מהרישום.');
    if (!isPlainObject(raw.days)) problems.push('רשימת הימים חסרה מהרישום.');
    if (!isPlainObject(raw.advances)) problems.push('רשימת המקדמות חסרה מהרישום.');
    if (problems.length > 0) return problems;

    rosterProblems(raw).forEach(problem => problems.push(problem));
    dayProblems(raw, null).forEach(problem => problems.push(problem));
    advanceProblems(raw, null).forEach(problem => problems.push(problem));
    // The ledger is deliberately NOT a reason to refuse the whole record.
    //
    // It was, briefly, and that was the wrong shape: the rescue file's whole purpose is to
    // salvage what can be read and NAME what cannot, so refusing the document for one
    // unreadable line of history turned the last door into another wall. The entry is
    // carried through normaliseSchedule verbatim instead - see the note there - which is
    // what stops it being deleted, and ledgerProblems below is what lets a caller say so.
    return problems;
}

// The ledger, checked at the door - which it never was.
//
// This gate asked about workers, places, days and advances, and the file's own comment
// says all three run on the RAW parsed content before normaliseSchedule. The ledger was
// not among them, while ledgerEntryProblems - the strict validator, in this same file,
// which refuses exactly the entries that were being lost - had one caller, on the sync
// path, guarding edits arriving from another phone.
//
// So a record whose ledger held an entry this build cannot fold was reported CLEAN, and
// normaliseSchedule then quietly left the entry out of the object that save() writes.
// The append-only history was deleted by a read.
//
// Refusing here sends the record to Recovery, which quarantines the bytes and blocks
// writing until a person is told - which is what iron law 10 requires of anything
// unreadable, and the ledger is the one record in this app that is never allowed to lose
// an entry at all.
// THE CONTAINER ITSELF, which nothing checked.
//
// Every check below this one is about an ENTRY inside the map. There has to be a map for
// that to mean anything, and there is not always one. Reproduced: `ledger` arriving as a
// string, as an array, or with `advances` as either - at which point normaliseSchedule
// read `typeof raw.ledger === 'object'`, fell back to {} for anything else, and produced
// a schedule with an EMPTY history. The first ordinary save then wrote that empty history
// over the only copy of somebody's advances, with the load reporting clean and nothing
// blocked.
//
// The entry checks could not catch it: there were no entries to check. A container this
// build cannot read is not an absent container, and the difference is a man's money.
//
// Returns a reason, or null. English, like every other diagnostic in this file - the
// screen says it in Hebrew in its own words.
// EVERY MAP THIS APP READS BY ID, scanned for a name it cannot safely use as a key.
//
// isSafeId refuses `__proto__`, `prototype` and `constructor` at every WRITER. This is the
// same question asked of a document arriving from somewhere else - the cloud, a backup, a
// rescue file - where the key is already an own property of a parsed object and assigning
// it into an ordinary map either reparents that map or silently does nothing.
//
// Measured before this existed: a day layer arriving with an own `__proto__` came out the
// other side with the key simply gone, nobody told, the device still writing, and the
// normalised schedule written over the record that had it. Iron law 10, exactly inverted.
//
// Returns one entry per poisoned NAME: where it sits, and the bytes UNDER that name
// exactly as they arrived, so the evidence can be quarantined rather than described.
//
// Under the name, not the whole map, because the bytes are the sighting's identity -
// Recovery.evidence answers identical bytes from the first copy and calls anything else
// new evidence. The whole map's bytes change whenever anybody edits any OTHER row of it,
// and nothing ever removes a poisoned layer from the cloud document; so with the map as
// the identity every ordinary edit beside the poisoned name - for a poisoned days map,
// every day anybody recorded - was a new sighting: a new copy, the acknowledgement
// withdrawn, writing blocked, the snapshot refused. The phone never adopted the crew's
// work on that day and the quarantine ladder ran out at twenty, blaming a full disk.
// The readable rows are adopted onto the record like any other; only what could not be
// read is held, and a sibling edit is then the same sighting.
//
// `at` names the poisoned key itself (`days.2026-08-12.actual.__proto__`), so two
// poisoned names in one map are two problems with two sets of bytes rather than one
// entry that a person acknowledges having seen half of.
function poisonedContainers(raw) {
    const out = [];
    const look = (map, where) => {
        if (!isPlainObject(map)) return;
        POISON_SEGMENTS.forEach(name => {
            if (!Object.prototype.hasOwnProperty.call(map, name)) return;
            out.push({ at: where + '.' + name, name, json: JSON.stringify(map[name]) });
        });
    };

    const days = raw && raw.days;
    // THE MAP OF DAYS ITSELF, not only each day inside it. This looked into every day and
    // never at the container holding them, so a days map with an own `__proto__` passed,
    // and normaliseSchedule dropped the key without a word - a whole day gone, one level
    // up from the layer this was written to catch.
    look(days, 'days');
    if (isPlainObject(days)) {
        Object.keys(days).forEach(date => {
            const day = days[date];
            if (!isPlainObject(day)) return;
            look(day, `days.${date}`);
            ['plan', 'actual'].forEach(layer => look(day[layer], `days.${date}.${layer}`));
        });
    }
    look(raw && raw.advances, 'advances');
    const roster = raw && raw.roster;
    if (isPlainObject(roster)) {
        look(roster.workers, 'roster.workers');
        look(roster.places, 'roster.places');
    }
    const ledger = raw && raw.ledger;
    if (isPlainObject(ledger)) {
        ['advances', 'migrations', 'unreadable', 'unreadableMigrations'].forEach(family =>
            look(ledger[family], `ledger.${family}`));
    }
    return out;
}

// EVERY DAY UNDER A NAME THIS APP CANNOT READ AS A DATE - the rest of the same question.
//
// normaliseSchedule adopts a day only under a YYYY-MM-DD key and used to skip anything
// else in silence. The three poison names are one way a key can be unreadable;
// `not-a-date`, `2026-8-12` and `constructor` are others, and a snapshot carrying any
// of them lost that day on the way in with nothing reported, nothing quarantined, the
// device still writing and the status saying synced. A day nobody can find is somebody's
// pay either way, so each one is named here, with its own bytes, for Recovery to hold.
//
// The poison names are left to poisonedContainers, which reports the whole map for them;
// the entries here are the OTHER keys, one per day, so the two never say one thing twice.
function unreadableDays(raw) {
    const days = raw && raw.days;
    if (!isPlainObject(days)) return [];
    const out = [];
    Object.keys(days).forEach(key => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
        if (POISON_SEGMENTS.indexOf(key) !== -1) return;
        out.push({ at: 'days.' + key, name: key, json: JSON.stringify(days[key]) });
    });
    return out;
}

function ledgerContainerProblem(raw) {
    const ledger = raw && raw.ledger;
    // Absent is not malformed. Every device that has never recorded an advance has none,
    // and a build that predates the ledger writes none.
    if (ledger === undefined || ledger === null) return null;
    if (!isPlainObject(ledger)) return 'the advances history is not a record';
    if (ledger.advances !== undefined && ledger.advances !== null
        && !isPlainObject(ledger.advances)) {
        return 'the entries of the advances history are not a record';
    }
    // An array here would read as a record with numeric keys, which is how a list of
    // entries would arrive from a build that stored them differently - readable-looking
    // and not this build's shape.
    if (ledger.unreadable !== undefined && ledger.unreadable !== null
        && !isPlainObject(ledger.unreadable)) {
        return 'the held-aside part of the advances history is not a record';
    }
    // The approvals are the third map under this container, and they decide whether this
    // device may write money at all. A `migrations` that is a string or an array read as
    // no approvals - which is not the same statement as "nobody approved" and would put a
    // migration screen in front of a person who has already answered it.
    //
    // AND NULL IS NOT AN ABSENCE HERE. Everywhere else in this function null is waved
    // through, and rightly: a device that has never recorded an advance has no ledger and
    // no entries, and the absent case has to stay cheap. This map is different because of
    // what reading it wrongly COSTS. An absent `migrations` is a device that was never
    // asked; a null is a value something wrote, and the only reading available for it is
    // "nobody approved" - which either re-asks a person who has already answered, or, on
    // the other side of the same coin, lets a record claim an approval it does not hold.
    // Neither is a guess this build is entitled to make about somebody's money.
    if (ledger.migrations !== undefined && !isPlainObject(ledger.migrations)) {
        return 'the approvals of the advances history are not a record';
    }
    return null;
}

function ledgerProblems(raw) {
    if (raw.ledger === undefined || raw.ledger === null) return [];
    if (ledgerContainerProblem(raw) !== null) {
        return ['היסטוריית המקדמות ברישום אינה תקינה.'];
    }
    if (!isPlainObject(raw.ledger)) return ['היסטוריית המקדמות ברישום אינה תקינה.'];

    const entries = raw.ledger.advances;
    if (entries === undefined || entries === null) return [];
    if (!isPlainObject(entries)) return ['היסטוריית המקדמות ברישום אינה רשימה.'];

    const problems = [];
    Object.keys(entries).forEach(id => {
        if (!isSafeId(id)) {
            problems.push('מזהה רשומת היסטוריה שאינו תקין: ' + id + '.');
            return;
        }
        // ledgerEntryProblems answers in English - it was written for the sync layer's
        // own log, where nobody reads it. What comes out of THIS function is shown to a
        // person, in a dialog, in Hebrew. So the entry is named and the reason is not
        // translated word for word: what the person needs is that a line of the history
        // cannot be read and that nothing was deleted, which is what the recovery banner
        // goes on to say.
        if (ledgerEntryProblems(id, entries[id]).length > 0) {
            problems.push('רשומת היסטוריה ' + id + ' אינה קריאה.');
        }
    });
    return problems;
}

// Everything above, and every reference resolving. The gate on a replacement.
function fullScheduleProblems(raw) {
    const problems = storedScheduleProblems(raw);
    if (problems.length > 0) return problems;

    // Who the document says exists, in both forms at once - the arrays a phone on an
    // older build reads, and the per-person map today's builds merge on top of them.
    // A reference is satisfied by either, because mergeRoster reads both.
    const known = {
        workers: rosterIds(raw, 'workers'),
        places: rosterIds(raw, 'places')
    };
    dayProblems(raw, known).forEach(problem => problems.push(problem));
    advanceProblems(raw, known).forEach(problem => problems.push(problem));

    // A REPLACEMENT WHOSE FINANCIAL HISTORY CANNOT BE READ IS NOT ACCEPTED - and this is
    // the one gate where refusing is right.
    //
    // storedScheduleProblems deliberately does not refuse such a record: the rescue file's
    // whole purpose is to open what can be opened and name what cannot, so a document that
    // will not open is a wall where the last door should be. That reasoning is about
    // READING.
    //
    // This is the other thing. A replacement is a deliberate act that overwrites the
    // record on every phone - a restore, an imported backup, the v71 upgrade - and
    // accepting one whose ledger container is a string or a list would propagate an
    // unreadable financial history to all three of them, from a button whose promise is
    // the opposite. An unreadable ENTRY is carried through and held aside; an unreadable
    // container has nothing to hold entries in, and the honest answer at this door is no.
    if (typeof ledgerContainerProblem === 'function' && ledgerContainerProblem(raw) !== null) {
        problems.push('היסטוריית המקדמות בקובץ אינה בצורה שאפשר לקרוא.');
    }
    // A NAME NOBODY CAN USE AS A KEY is deliberately NOT asked here.
    //
    // It was, for one commit. The refusal is right at the doors where a document is
    // about to REPLACE this phone's record - see poisonedMapProblems below - and this
    // gate looked like the place to put it, because every one of those doors runs it.
    // So does the rescue rebuild in js/ui/share.js, which reads every candidate in a
    // rescue file through readReplacementDocument: scheduleData:v2, its quarantined
    // copies, the legacy record, the liveSchedule fallback. A phone holding a poisoned
    // map keeps the map on its record on purpose, so that the hold outlives the session
    // that found it - and its rescue file, the one door it has left, was refused for
    // the very key the hold exists to carry: "no usable schedule in the rescue file".
    //
    // The rescue door opens such a file and holds what it carries; the replacement
    // doors ask the extra question themselves. This gate answers whether the document
    // is a whole schedule, and a held map does not make it less of one.
    return problems;
}

function rosterIds(raw, kind) {
    const ids = new Set();
    (Array.isArray(raw[kind]) ? raw[kind] : []).forEach(item => {
        if (item && item.id !== undefined && item.id !== null) ids.add(String(item.id));
    });

    const roster = isPlainObject(raw.roster) ? raw.roster : {};
    if (isPlainObject(roster[kind])) {
        Object.keys(roster[kind]).forEach(id => {
            if (roster[kind][id]) ids.add(String(id));
        });
    }
    return ids;
}

function rosterProblems(raw) {
    const problems = [];
    if (raw.roster !== undefined && !isPlainObject(raw.roster)) {
        problems.push('גוש הרוסטר ברישום אינו תקין.');
        return problems;
    }
    const roster = isPlainObject(raw.roster) ? raw.roster : null;

    ROSTER_KINDS.forEach(([kind, orderKey, label]) => {
        const seen = new Set();

        raw[kind].forEach((item, index) => {
            const name = (item && item.name) ? String(item.name) : '#' + (index + 1);
            if (!isPlainObject(item)) {
                problems.push(label + ' "' + name + '" ברישום אינו תקין.');
                return;
            }
            if (!isSafeId(item.id)) {
                problems.push(label + ' "' + name + '" בלי מזהה תקין.');
                return;
            }
            // Two rows claiming to be the same person is genuinely ambiguous: their days
            // are already merged under one id and there is no way to tell from here which
            // day belonged to whom. Renumbering one silently would invent an answer.
            if (seen.has(item.id)) {
                problems.push('המזהה ' + item.id + ' מופיע ביותר מ' + label + ' אחד.');
                return;
            }
            seen.add(item.id);
            entityProblems(item, kind, label).forEach(problem => problems.push(problem));
        });

        if (!roster) return;

        if (roster[kind] !== undefined) {
            if (!isPlainObject(roster[kind])) {
                problems.push('רשימת ה' + label + 'ים בגוש הרוסטר אינה תקינה.');
            } else {
                Object.keys(roster[kind]).forEach(id => {
                    const item = roster[kind][id];
                    if (item === null) return;              // a removal, on the wire
                    if (!isSafeId(id)) {
                        problems.push('המזהה ' + id + ' בגוש הרוסטר אינו תקין.');
                        return;
                    }
                    if (!isPlainObject(item)) {
                        problems.push(label + ' ' + id + ' בגוש הרוסטר אינו תקין.');
                        return;
                    }
                    // The key IS the id. A map whose key and whose record disagree says
                    // two things about one person, and every reader picks a different one.
                    if (String(item.id) !== String(id)) {
                        problems.push(label + ' ' + id + ' בגוש הרוסטר רשום תחת מזהה אחר.');
                        return;
                    }
                    entityProblems(item, kind, label).forEach(p => problems.push(p));
                });
            }
        }

        if (roster[orderKey] === undefined) return;
        if (!Array.isArray(roster[orderKey])) {
            problems.push('הסדר של ה' + label + 'ים ברישום אינו רשימה.');
            return;
        }
        const ordered = new Set();
        roster[orderKey].forEach(id => {
            if (!isSafeId(id)) {
                problems.push('הסדר של ה' + label + 'ים כולל מזהה שאינו תקין.');
                return;
            }
            if (ordered.has(id)) {
                problems.push('המזהה ' + id + ' מופיע פעמיים בסדר.');
                return;
            }
            ordered.add(id);
        });
    });

    return problems;
}

function entityProblems(item, kind, label) {
    const problems = [];
    if (item.active !== undefined && typeof item.active !== 'boolean') {
        problems.push(label + ' ' + item.id + ': הסימון "פעיל" אינו תקין.');
    }
    if (kind !== 'workers') return problems;

    ['dailyRate', 'hourlyRate'].forEach(field => {
        rateProblems(item[field], 'השכר של', label + ' ' + item.id)
            .forEach(problem => problems.push(problem));
    });
    return problems;
}

// `known` names the ids that have to resolve, or null to skip the reference checks.
function dayProblems(raw, known) {
    const problems = [];

    Object.keys(raw.days).forEach(date => {
        if (!isRealDate(date)) {
            problems.push('התאריך "' + date + '" ברישום אינו תאריך אמיתי.');
            return;
        }
        const day = raw.days[date];
        if (!isPlainObject(day)) {
            problems.push('היום ' + date + ' ברישום אינו תקין.');
            return;
        }
        // Only the two sides the model has, plus the one field a day can carry beside
        // them. A key that is neither is something this app did not write, and reading it
        // as a day would be reading somebody else's document.
        //
        // vehiclesOff is accepted whether or not this build DOES vehicles. It is on real
        // devices - written by a build that did - and refusing it here would quarantine
        // the whole record: the app would open on a phone whose schedule it will not
        // read, hold every write, and tell somebody their data is unreadable, over a
        // field naming a van that stayed in the yard one evening in June.
        const extra = Object.keys(day).filter(key =>
            key !== 'plan' && key !== 'actual' && key !== 'vehiclesOff');
        if (extra.length > 0) {
            problems.push('ליום ' + date + ' יש שכבה שאינה מוכרת: ' + extra[0] + '.');
            return;
        }
        if (day.vehiclesOff !== undefined
            && !(Array.isArray(day.vehiclesOff)
                && day.vehiclesOff.every(id => typeof id === 'string'))) {
            problems.push('ליום ' + date + ' יש רישום רכבים שאינו תקין.');
            return;
        }
        if (day.plan === undefined && day.actual === undefined) {
            problems.push('ליום ' + date + ' אין רישום כלל.');
            return;
        }

        ['plan', 'actual'].forEach(layer => {
            if (day[layer] === undefined) return;
            if (!isPlainObject(day[layer])) {
                problems.push('הרישום של ' + date + ' אינו תקין.');
                return;
            }
            Object.keys(day[layer]).forEach(workerId => {
                if (!isSafeId(workerId)) {
                    problems.push('ביום ' + date + ' יש רישום תחת מזהה שאינו תקין.');
                    return;
                }
                if (known && !known.workers.has(workerId)) {
                    problems.push('ביום ' + date + ' יש רישום לעובד ' + workerId
                        + ' שאינו ברשימה.');
                    return;
                }
                recordProblems(known, date, workerId, day[layer][workerId])
                    .forEach(problem => problems.push(problem));
            });
        });
    });

    return problems;
}

function recordProblems(known, date, workerId, record) {
    const problems = [];
    const who = ' אצל ' + workerId + ' ביום ' + date + '.';

    if (!isPlainObject(record)) {
        problems.push('רישום שאינו תקין' + who);
        return problems;
    }
    if (record.absent !== undefined && typeof record.absent !== 'boolean') {
        problems.push('סימון היעדרות שאינו תקין' + who);
    }

    // The rate the day was WORKED at, frozen onto it. Quietly rounding or defaulting one
    // of these rewrites what somebody was paid, so it is refused instead of repaired.
    if (record.rates !== undefined) {
        if (!isPlainObject(record.rates)) {
            problems.push('שכר שמור שאינו תקין' + who);
        } else {
            // Stamped rates get the same ceiling as live ones. A stamped day is never
            // restated - iron law 2 - but a stamp that is not a number anybody could be
            // paid was never a rate, and admitting it makes every total downstream of it
            // Infinity.
            ['daily', 'hourly'].forEach(field => {
                rateProblems(record.rates[field], 'שכר שמור', who.replace(/^ /, ''))
                    .forEach(problem => problems.push(problem));
            });
        }
    }

    if (record.entries === undefined) return problems;
    if (!Array.isArray(record.entries)) {
        problems.push('רשימת רישומים שאינה רשימה' + who);
        return problems;
    }

    record.entries.forEach(entry => {
        if (!isPlainObject(entry)) {
            problems.push('רישום שאינו תקין' + who);
            return;
        }
        if (!isSafeId(entry.placeId)) {
            problems.push('רישום בלי אתר תקין' + who);
            return;
        }
        if (known && !known.places.has(String(entry.placeId))) {
            problems.push('רישום באתר ' + entry.placeId + ' שאינו ברשימה' + who);
            return;
        }
        if (entry.rate !== undefined && !RATES.includes(entry.rate)) {
            problems.push('תעריף שאינו מוכר' + who);
        }
        if (entry.extraHours !== undefined
            && (!isFiniteNumber(entry.extraHours) || entry.extraHours < 0)) {
            problems.push('שעות נוספות שאינן מספר תקין' + who);
        }
    });

    return problems;
}

// What an advance amount may be, in ONE place.
//
// This used to be `isFiniteNumber` and nothing else - no sign, no zero, no magnitude -
// while the real rule lived in the advance form and nowhere else: digits only, greater
// than zero, at most ten million. So nothing on the wire, in a file, or out of a restore
// was held to any part of it, and gross 400 with an advance of -500 reported a man as
// owed 900. payrollReport does gross minus advances, which is correct arithmetic on a
// value that should never have been admitted.
//
// The domain, stated rather than assumed:
//
//   a positive amount of money, in shekels, that a person actually handed over;
//   at most ten million, which is the form's own ceiling and is already far past any
//     real day's cash;
//   never zero - handing over nothing is not an advance, and the form refuses it, so a
//     zero arriving from anywhere else is a record of something that did not happen;
//   never negative - money going the other way is a repayment, which this build does
//     not have and must not silently pay for by INCREASING what is owed;
//   never more precise than an agora, because three surfaces round it independently and
//     a value they cannot all represent is a value they will disagree about.
//
// Fractions that are already on somebody's disk are NOT refused: refusing them would
// quarantine a record that exists and has been paid against. Only what arrives is held
// to the agora rule.
const ADVANCE_MAX = 10000000;

function advanceAmountProblems(id, amount) {
    if (typeof amount !== 'number' || !isFinite(amount)) {
        return ['הסכום של המקדמה ' + id + ' אינו מספר תקין.'];
    }
    if (amount <= 0) {
        return ['הסכום של המקדמה ' + id + ' אינו סכום שנמסר.'];
    }
    if (amount > ADVANCE_MAX) {
        return ['הסכום של המקדמה ' + id + ' גדול מהמותר.'];
    }
    // AN EXACT NUMBER OF AGOROT, which is what the comment above has always said and
    // what the line here never checked.
    //
    // It used to be `!Number.isSafeInteger(Math.round(amount * 100))`, and that branch
    // could not fire. The three guards above already require 0 < amount <= ADVANCE_MAX,
    // and ADVANCE_MAX is ten million - so amount * 100 is at most a billion, five orders
    // of magnitude below MAX_SAFE_INTEGER, and Math.round of it is always a safe integer.
    // The rule had no implementation, its sentence had never been shown to anybody, and
    // no test named it. An advance of 0.001 was accepted, stored verbatim, netted into
    // 399.999, and displayed as 0 while the sheet said 400.
    //
    // The tolerance is not slack, it is arithmetic: 0.29 * 100 is 28.999999999999996 in
    // binary floating point, and 0.29 is a real amount somebody can hand over. What is
    // refused is a value that is not an agora at all - a thousandth of a shekel, which no
    // surface in this app can show and which three of them would round three ways.
    const agorot = amount * 100;
    if (Math.abs(agorot - Math.round(agorot)) > 1e-6) {
        return ['הסכום של המקדמה ' + id + ' מדויק מאגורה, ואי אפשר להציג אותו.'];
    }
    return [];
}

// The ceiling a rate never had.
//
// dailyRate and hourlyRate were checked for being finite and not negative, and nothing
// else. A daily rate of 1e308 passed every door, and two days of it made a pay sheet row
// of Infinity - which is not a wage anybody can be paid, and which then propagates into
// every total, every export and every printed sheet.
//
// The bound is the same ten million the advance gate uses. Nobody is paid ten million
// shekels for a day, and a value above it is a mistake or a corrupted byte, not a rate.
const RATE_MAX = ADVANCE_MAX;

function rateProblems(value, what, who) {
    if (value === undefined || value === null) return [];
    if (!isFiniteNumber(value) || value < 0) {
        return [what + ' ' + who + ' אינו מספר תקין.'];
    }
    if (value > RATE_MAX) {
        return [what + ' ' + who + ' גדול מכל שכר.'];
    }
    return [];
}

// `wire` marks a document that arrived from the cloud, where a null at an advance's path
// is the app's own DELETION and not damage.
//
// removeAdvance sends `advances.<id> = null`, and the queue-path validator in this same
// file agrees: `if (value === null) return []`. This function did not, so a person
// pressing delete put every phone into recovery - the deleting one on the echo of its own
// write - and neither could record a day afterwards. Two halves of one app disagreeing
// about what a null means, and the disagreement cost the whole record.
//
// It stays damage for a STORED document. A null sitting in scheduleData:v2 is not a
// deletion in flight; it is a record with a hole in it, and the restore doors are right to
// refuse one.
function advanceProblems(raw, known, wire) {
    const problems = [];

    // THE CONTAINER, before anything in it.
    //
    // Every caller reached this function through
    // `(raw.advances && typeof raw.advances === 'object') ? raw.advances : {}` - and an
    // empty ARRAY is truthy and typeof 'object', so it arrived as a map with nothing in
    // it, while a string and a null fell through to {}. Either way the gate validated an
    // empty container, found nothing wrong, and let the device adopt a document with no
    // advances - which deleted a valid, already acknowledged advance from memory and from
    // the disk, quietly, with the status line reading synced.
    //
    // A container that is present and is not a map is damage. Absent is a different thing
    // and is fine: a document that has never had an advance has no advances field.
    if (raw.advances !== undefined && raw.advances !== null && !isPlainObject(raw.advances)) {
        return ['רשימת המקדמות שהגיעה אינה רשימה.'];
    }
    if (raw.advances === null) return ['רשימת המקדמות שהגיעה ריקה מסוג שאינו רשימה.'];

    Object.keys(raw.advances || {}).forEach(id => {
        if (!isSafeId(id)) {
            problems.push('מזהה מקדמה שאינו תקין: ' + id + '.');
            return;
        }
        const item = raw.advances[id];
        // A deletion in flight, on the wire only. See the note above the function.
        if (wire && item === null) return;
        if (!isPlainObject(item)) {
            problems.push('המקדמה ' + id + ' ברישום אינה תקינה.');
            return;
        }
        if (item.id !== undefined && String(item.id) !== String(id)) {
            problems.push('המקדמה ' + id + ' רשומה תחת מזהה אחר.');
            return;
        }
        if (!isSafeId(item.workerId)) {
            problems.push('המקדמה ' + id + ' אינה משויכת לעובד.');
        } else if (known && !known.workers.has(String(item.workerId))) {
            problems.push('המקדמה ' + id + ' משויכת לעובד שאינו ברשימה.');
        }
        if (!isRealDate(item.date)) {
            problems.push('למקדמה ' + id + ' אין תאריך אמיתי.');
        }
        problems.push(...advanceAmountProblems(id, item.amount));
    });

    return problems;
}

// The gate the four restore doors and the sync layer share: the narrow migration first,
// then the complete check. Returns the document to use, and why not.
//
// It does NOT ask poisonedMapProblems, and the rescue door depends on that. The rescue
// rebuild reads every candidate in a rescue file through this function, and then reads
// its own answer through it again after the queue replay - a schedule that legitimately
// carries held evidence under ledger.unreadable, because normaliseSchedule keeps the
// key there so the hold survives the session. The sync layer's own re-check in
// replaceEverything reads that same rebuilt schedule on its way to the disk, after the
// person has acknowledged the hold. A poison refusal in here would turn the rescue
// file into a wall and stop an acknowledged rescue from landing; the doors that must
// refuse ask the question one line after this one.
function readReplacementDocument(raw) {
    const upgraded = upgradeStoredSchedule(raw);
    if (!upgraded) {
        return { document: null, problems: ['הקובץ אינו מסמך של לוח עבודה.'] };
    }
    const problems = fullScheduleProblems(upgraded);
    return { document: problems.length === 0 ? upgraded : null, problems };
}

// A name nobody can use as a key, asked at the doors where a document is about to
// REPLACE this phone's record - and only there.
//
// The doors are acceptRestoreSource and the backup half of readBackupFile in
// js/ui/share.js: the cloud copy, the restore point, the way back, the imported backup.
// Before this existed they passed such a file through fullScheduleProblems, and the door
// then ran normaliseSchedule on it, which - correctly, for a document that is being READ
// - handed the map to Recovery: a quarantine copy was written and writing was blocked on
// the phone, before replaceEverything had run. replaceEverything then refused because
// writing was blocked, and the door reported THAT as no room on the device to record the
// restore. The device was not full, freeing space changed nothing, and the phone somebody
// was recording on stayed held, across a reopen, by a file they had only tried to
// restore.
//
// A replacement is refused with its own sentence and touches nothing. The rescue door
// never asks this: a rescue file is the evidence of a phone that could not read its own
// records, and a poisoned map inside it is carried as held evidence through Recovery -
// see scheduleFromRecoveryRecords in js/ui/share.js.
function poisonedMapProblems(raw) {
    if (typeof poisonedContainers !== 'function') return [];
    return poisonedContainers(raw).map(found =>
        'ברישום יש שם שאי אפשר להשתמש בו כמפתח (' + found.at + ').');
}

// ---------------------------------------------------------------- the journal, exactly
//
// A queue entry is a (path, value) pair that will be written into a schedule at boot and
// merged into the cloud document on the way out. Both of those happen with no further
// checking, so this is where an entry has to be recognised as one this app wrote.
//
// Shape is not enough. `days.2026-08-12.estimate.w_01` is four dotted segments of safe
// characters and passes any structural test - and replaying it puts a layer called
// `estimate` into the schedule in memory. The next ordinary edit writes that schedule to
// the disk, and the reopen after THAT quarantines scheduleData:v2 and stops recording
// altogether: a single bad queue entry, three steps later, is an app that will not take
// another day's work.
//
// So the families are named, one by one, and everything else is refused.

// A segment that would land on Object.prototype rather than in the record.
const POISON_SEGMENTS = ['__proto__', 'prototype', 'constructor'];

// The same answer, kept under the name the path code reads. isSafeId refuses the poison
// names itself now - see the block over it - so this is one call rather than two, and the
// two can no longer drift apart.
function isSafeSegment(value) {
    return isSafeId(value);
}

// Everything wrong with one journal entry. Empty means it is one.
function journalEntryProblems(path, value) {
    if (typeof path !== 'string' || path.length === 0 || path.length > 300) {
        return ['a path that is not a path'];
    }
    const parts = path.split('.');
    if (parts.some(part => part.length === 0)) return ['a path with an empty segment'];
    if (parts.some(part => POISON_SEGMENTS.indexOf(part) !== -1)) {
        return ['a path that would land on the prototype'];
    }

    // days.<date>.<layer>.<workerId> - one person, one day, one side of it.
    if (parts[0] === 'days') {
        // days.<date>.vehiclesOff - the one field on a day that is about the day rather
        // than about a person, so it is three segments and not four. The wire has to
        // accept it or the app's own edit is quarantined on its way to the queue and
        // recording stops on the phone; the feature is retired, but the shape the day it
        // is turned back on has to be one the queue already understands.
        if (parts.length === 3 && parts[2] === 'vehiclesOff') {
            if (!isRealDate(parts[1])) return ['a day path with a date that does not exist'];
            if (value === null) return [];
            if (!Array.isArray(value)) return ['a stayed-in list that is not a list'];
            const seen = new Set();
            for (let i = 0; i < value.length; i += 1) {
                if (!isSafeSegment(value[i])) return ['a stayed-in list naming an unusable id'];
                if (seen.has(value[i])) return ['a stayed-in list naming the same one twice'];
                seen.add(value[i]);
            }
            return [];
        }
        if (parts.length !== 4) return ['a day path with the wrong number of segments'];
        if (!isRealDate(parts[1])) return ['a day path with a date that does not exist'];
        if (parts[2] !== 'plan' && parts[2] !== 'actual') return ['a layer nobody wrote'];
        if (!isSafeSegment(parts[3])) return ['a day path with an unusable worker id'];
        // `known` is null: the queue is a list of edits, not a document, and the roster
        // they belong to may still be arriving.
        return recordProblems(null, parts[1], parts[3], value);
    }

    // ledger.advances.<entry id>. Append-only on the wire as well as on the disk: an
    // entry may be created and nothing else, so a null here - a deletion in flight - is
    // refused rather than applied. The ledger's whole value is that nothing leaves it.
    if (parts[0] === 'ledger') {
        if (parts.length !== 3) return ['a ledger path nobody wrote'];
        if (!isSafeSegment(parts[2])) return ['a ledger path with an unusable id'];
        if (parts[1] === 'advances') return ledgerEntryProblems(parts[2], value);
        // ledger.migrations.<plan id> - somebody's approval of the carry migration.
        //
        // Not an entry, and not money: it is a person saying they read the rows and
        // accepted what would move. It travels because the other two phones must not be
        // asked to approve the same numbers again - and it is append-only for the same
        // reason an entry is, because an approval that could be taken back is a decision
        // nobody made. See planCarryMigration in js/model/ledger.js.
        if (parts[1] === 'migrations') return migrationApprovalProblems(parts[2], value);
        return ['a ledger path nobody wrote'];
    }

    // advances.<id> - or a deletion of one, which travels as null.
    if (parts[0] === 'advances') {
        if (parts.length !== 2) return ['an advance path with the wrong number of segments'];
        if (!isSafeSegment(parts[1])) return ['an advance path with an unusable id'];
        if (value === null) return [];
        return advanceProblems({ advances: { [parts[1]]: value } }, null);
    }

    if (parts[0] === 'roster') {
        // roster.workerOrder / roster.placeOrder - the order the lists are read in.
        if (parts.length === 2) {
            if (parts[1] !== 'workerOrder' && parts[1] !== 'placeOrder') {
                return ['a roster path nobody wrote'];
            }
            if (!Array.isArray(value)) return ['an order that is not a list'];
            const seen = new Set();
            for (let i = 0; i < value.length; i += 1) {
                if (!isSafeSegment(value[i])) return ['an order naming an unusable id'];
                if (seen.has(value[i])) return ['an order naming the same one twice'];
                seen.add(value[i]);
            }
            return [];
        }

        // roster.workers.<id> / roster.places.<id> - one person or one site, or a
        // removal, which travels as null.
        if (parts.length !== 3) return ['a roster path with the wrong number of segments'];
        const kind = parts[1];
        if (kind !== 'workers' && kind !== 'places') return ['a roster path nobody wrote'];
        if (!isSafeSegment(parts[2])) return ['a roster path with an unusable id'];
        if (value === null) return [];
        if (!isPlainObject(value)) return ['a roster entry that is not a record'];
        if (String(value.id) !== parts[2]) return ['a roster entry filed under another id'];
        return entityProblems(value, kind, kind === 'workers' ? 'עובד' : 'אתר');
    }

    // The legacy whole-array form. Still written on purpose, for a phone that has not
    // updated and reads nothing else - see editRoster.
    if (parts.length === 1 && (parts[0] === 'workers' || parts[0] === 'places')) {
        if (!Array.isArray(value)) return ['a roster array that is not an array'];
        const seen = new Set();
        for (let i = 0; i < value.length; i += 1) {
            const item = value[i];
            if (!isPlainObject(item)) return ['a roster array holding something else'];
            if (!isSafeSegment(item.id)) return ['a roster array entry with an unusable id'];
            if (seen.has(item.id)) return ['a roster array naming the same id twice'];
            seen.add(item.id);
            const problems = entityProblems(item, parts[0], parts[0] === 'workers' ? 'עובד' : 'אתר');
            if (problems.length > 0) return problems;
        }
        return [];
    }

    return ['a path root nobody wrote'];
}

// ---------------------------------------------------------------- removing a worker
//
// Archiving and deleting are two different things and only one of them is ever safe.
//
// A worker with anything recorded against him is ARCHIVED: he leaves the daily screen and
// the active list, and every day, every rate and every advance stays exactly where it is.
// The reports still resolve his name, including on days already invoiced.
//
// Deleting is for the other case, and only that one: a name typed in by mistake, or a man
// added twice, before anything was recorded. Nothing points at him, so nothing is left
// pointing at nobody.
//
// The difference is not a matter of judgement. It is this function.

// ---------------------------------------------------------------- one man, one number
//
// The phone number is in the roster because two men called the same thing is ordinary on
// a site, and the number is the thing that tells them apart - so the same number twice
// almost always means the same man entered twice, which is how a day gets recorded
// against the row nobody is looking at.
//
// Comparing the typed strings finds none of that. The same number is written 052-884-1930
// here, 052 884 1930 there, and +972-52-884-1930 by whoever copied it out of WhatsApp.
// Reduced to digits, with the Israeli country code folded back to the leading zero it
// stands in for, all three are one number.
function normalisePhone(value) {
    let digits = String(value === undefined || value === null ? '' : value)
        .replace(/[^0-9]/g, '');
    if (!digits) return '';

    // 00972-... is the same call as +972-... - the two ways of writing an international
    // prefix, one of them left over from a landline habit and both of them in real rosters.
    if (digits.startsWith('00')) digits = digits.slice(2);

    if (digits.startsWith('972') && digits.length > 9) {
        // +972 (0) 52-... keeps the trunk zero the country code is standing in for, so it
        // arrives with both. Whatever leading zeros are left after the code come off, and
        // the one this country writes goes back on.
        const rest = digits.slice(3).replace(/^0+/, '');
        return rest ? '0' + rest : '';
    }

    // A number typed without its leading zero: 52-884-1930.
    if (!digits.startsWith('0') && digits.length === 9) return '0' + digits;

    // Too short to be anybody's phone - a country code on its own, or a couple of digits
    // typed into the wrong field. Treated as no number at all, so it cannot match another
    // one like it and report two men as the same man.
    if (digits.length < 7) return '';
    return digits;
}

function samePhone(one, other) {
    const a = normalisePhone(one);
    return a !== '' && a === normalisePhone(other);
}

// Everybody else already carrying this number - ARCHIVED INCLUDED. A man put away last
// month is exactly the man somebody is about to enter again, and he is the one the daily
// list is not showing.
function workersSharingPhone(schedule, phone, exceptId) {
    if (normalisePhone(phone) === '') return [];
    return ((schedule && schedule.workers) || []).filter(worker =>
        worker && String(worker.id) !== String(exceptId) && samePhone(worker.phone, phone));
}

// Everything in the record that names this worker. Empty means he can go.
//
// A day record counts even when it is empty. `{entries: []}` is not "no day" - it is a
// day somebody opened and cleared, written down, and sitting in the document. Deleting
// the man under it would leave the whole schedule failing its own validation, and every
// restore on the device refused from then on.
function workerFootprint(schedule, workerId) {
    const id = String(workerId);
    const days = [];
    const advances = [];

    const allDays = (schedule && schedule.days) || {};
    Object.keys(allDays).forEach(date => {
        ['plan', 'actual'].forEach(layer => {
            const side = (allDays[date] || {})[layer];
            if (!side || typeof side !== 'object') return;
            if (Object.prototype.hasOwnProperty.call(side, id)) days.push({ date, layer });
        });
    });

    const allAdvances = (schedule && schedule.advances) || {};
    Object.keys(allAdvances).forEach(advance => {
        const item = allAdvances[advance];
        if (item && String(item.workerId) === id) advances.push(advance);
    });

    // AND THE LEDGER'S OWN ADVANCES, which are not always the same set.
    //
    // schedule.advances is what a v79 phone writes and it is still the field every device
    // reads. It is not the whole record: a correction can move an advance to another man,
    // and the fold - not the old field - is who it belongs to afterwards. A footprint
    // taken from the old field alone would say a man has no advances while the ledger
    // says he owes for one, and this footprint is what stands between him and permanent
    // deletion. Feature-detected, because the ledger file may not be loaded.
    if (typeof foldLedger === 'function') {
        const folded = foldLedger(schedule);
        Object.keys(folded).forEach(advance => {
            if (String(folded[advance].workerId) !== id) return;
            if (advances.indexOf(advance) === -1) advances.push(advance);
        });
    }

    return { days, advances };
}

// What still has to be settled with a man before he is put away, said in a sentence, or
// null when there is nothing. Not a bar on archiving - a debt is a reason to be told, not
// a reason to be stopped.
function openAdvanceBalance(schedule, workerId) {
    const advances = workerFootprint(schedule, workerId).advances;
    if (advances.length === 0) return null;

    // WHAT IS STILL OWED, not what was ever handed over.
    //
    // This summed the amount of every advance the man has ever had, and nothing else -
    // no repayment, no reversal, and no money already taken off his wage. So the sentence
    // that decides whether somebody may be put away said 5,000 about a man who owed 1,750,
    // on a screen whose whole purpose is to be the last word before he is archived.
    //
    // advanceOutstanding is the one fold; it is feature-detected because the ledger file
    // may not be loaded, and gated on the carry because with it shut there are no
    // repayments to read and the gross IS the answer - which is what this build has always
    // said and what a phone that cannot read entries needs it to keep saying.
    //
    // carryReportingEnabled rather than the flag alone: this sentence is the last thing
    // somebody reads before a man is put away, and until the migration on THIS record has
    // been approved it must keep saying what it has always said. Feature-detected for the
    // same reason the fold is - ledger.js loads after this file.
    const folded = typeof advanceOutstanding === 'function'
        && typeof carryReportingEnabled === 'function'
        && carryReportingEnabled(schedule);
    const total = advances.reduce((sum, id) => (folded
        ? sum + advanceOutstanding(schedule, id).left
        : sum + (Number((schedule.advances[id] || {}).amount) || 0)), 0);
    return total > 0 ? { count: advances.length, total: agoraRound(total) } : null;
}

// ---------------------------------------------------------------- the wire form
//
// The document as it is stored in the cloud. It is the local schedule plus the roster a
// SECOND time, keyed by id.
//
// The arrays alone were the problem: an array cannot be merged element by element, so a
// roster change had to send the whole thing, and two phones each sending their own whole
// roster meant the second one erased the first one's new man. His days stayed in the
// document and his row left the report, so a week of somebody's pay went missing with
// nothing on screen to say it had.
//
// Keyed by id, each man is his own field and two phones adding two men write two
// different paths. Order is a field of its own, because the order IS meaningful - it is
// the order every screen reads in - and it is the one part where last-write-wins costs
// nothing: the worst case is a list in somebody else's preferred order.
//
// The arrays are still written, and that is deliberate. A phone that has not updated yet
// reads them and sees a correct roster; it cannot see `roster` and never writes to it.
// They can be dropped once all three devices are past v79 - not before.
function cloudDocument(schedule) {
    const wire = JSON.parse(JSON.stringify(schedule));
    wire.roster = rosterDocument(schedule);
    return wire;
}

function rosterDocument(schedule) {
    const byId = list => {
        const out = {};
        (list || []).forEach(item => { if (item && item.id) out[String(item.id)] = item; });
        return out;
    };
    const ids = list => (list || []).filter(item => item && item.id).map(item => String(item.id));

    return {
        workers: byId(schedule.workers),
        places: byId(schedule.places),
        workerOrder: ids(schedule.workers),
        placeOrder: ids(schedule.places)
    };
}

// The reverse: the two forms of the roster, back into the one ordered array the app works
// in. They are MERGED, not chosen between, and that is the whole of it.
//
// Reading the per-entity map alone looks right and is catastrophic. Only the people who
// CHANGED are written into it - that is the point, so a stale copy of somebody cannot be
// put back - so a document that has always held plain arrays and then receives its first
// per-entity write ends up with exactly one person in the map. A device reading the map
// alone would see a roster of one and adopt it, deleting everybody else from every phone,
// and every report walks the roster. The suite caught this before it shipped.
//
// So the array is the floor and the map is laid over it: the map wins per person, because
// it is the authoritative per-entity form, and nobody is dropped for being absent from
// it.
//
// And a NULL in the map is a removal that wins over the array.
//
// Skipping the nulls was the older reading, and it rested on "nothing is ever removed
// from a roster anyway". That stopped being true the moment deleting shipped, and the
// consequence was measured: a phone that had been offline still had the man in its whole
// array, sent that array on reconnecting, and the union put him back on every device -
// days, rates and all - with nothing on screen to explain the return. The array is the
// stale form by construction: it is whole, so it is always somebody's whole opinion from
// whenever they last looked. A tombstone is a statement about ONE person made at a known
// moment, and it has to outrank an array that merely has not heard.
//
// Removed here rather than skipped, so a stale array entry cannot be the floor the
// tombstone is laid over.
//
// Order: the order field first, then anyone it had not heard of, in the order the array
// had them. An order written by a device that has not yet seen a new man must not remove
// him.
function mergeRoster(list, map, order) {
    const byId = new Map();
    (Array.isArray(list) ? list : []).forEach(item => {
        if (item && item.id) byId.set(String(item.id), item);
    });

    const entries = (map && typeof map === 'object') ? map : {};
    Object.keys(entries).forEach(id => {
        if (entries[id]) byId.set(String(id), entries[id]);
        else byId.delete(String(id));
    });

    const out = [];
    const used = new Set();

    (Array.isArray(order) ? order : []).forEach(id => {
        const key = String(id);
        if (byId.has(key) && !used.has(key)) {
            used.add(key);
            out.push(byId.get(key));
        }
    });
    byId.forEach((item, id) => {
        if (!used.has(id)) out.push(item);
    });

    return out;
}

// ---------------------------------------------------------------- work outranks a tombstone
//
// The invariant: no day and no advance may exist without a worker the app can name.
//
// A tombstone says "this man is not in the crew". It does not say "this man never
// existed", and it cannot, because the evidence is not all in one place at one time:
// a second phone can be holding a day for him recorded while it was offline, and that
// day arrives AFTER the deletion. Discarding the day to keep the deletion tidy would
// throw away somebody's work - a real day on a real site that somebody has to be paid
// for. Keeping the day with nobody attached is no better: the reports walk the roster,
// so the day and its pay simply stop being counted, and the document fails its own
// validation with nothing able to repair it.
//
// So the work wins, and it wins by RESTORING AN IDENTITY rather than by cancelling the
// removal: the man comes back archived, out of the daily list, present in every report
// the day belongs to. His name comes back with him when anything still remembers it;
// when nothing does, the id is shown, which is the honest thing to put in front of
// somebody who then has to say who this was.
//
// Note what does NOT come back: an id with no day and no advance behind it. That is the
// whole difference between this and the resurrection bug - a stale array is not work.
function referencedEntityIds(schedule) {
    const workers = new Set();
    const places = new Set();

    const days = (schedule && schedule.days) || {};
    Object.keys(days).forEach(date => {
        ['plan', 'actual'].forEach(layer => {
            const side = (days[date] || {})[layer];
            if (!side || typeof side !== 'object') return;
            Object.keys(side).forEach(workerId => {
                workers.add(String(workerId));
                const record = side[workerId];
                const entries = (record && Array.isArray(record.entries)) ? record.entries : [];
                entries.forEach(entry => {
                    if (entry && entry.placeId !== undefined && entry.placeId !== null) {
                        places.add(String(entry.placeId));
                    }
                });
            });
        });
    });

    const advances = (schedule && schedule.advances) || {};
    Object.keys(advances).forEach(id => {
        const item = advances[id];
        if (item && item.workerId !== undefined && item.workerId !== null) {
            workers.add(String(item.workerId));
        }
    });

    return { workers, places };
}

// What a recovered identity is called when NOBODY still has the name - not this device,
// not the document. Built by a function rather than written out where it is used, so the
// sync layer can ask "is this a real name or a placeholder?" without matching strings:
// a placeholder must never be pushed over a name another phone still knows.
function recoveredEntityName(kind, id) {
    return (kind === 'workers' ? 'עובד שנמחק (' : 'אתר שנמחק (') + id + ')';
}

// A site a day names and the roster has not got.
//
// Not exotic: days and roster entries travel as separate field paths, so an edit made on
// another phone lands here while the write that would have introduced the site is still
// queued behind it or was refused for room. The day is real, somebody worked it, and it
// is paid for on the pay sheet - so it has to be billed to somebody and it has to be
// called something on paper.
//
// The name is NOT recoveredEntityName: that one carries the record id, which is right
// where the app is talking to itself about a record it is repairing, and wrong in a file
// a bookkeeper opens - an id is not a site name, is not translatable, and is the one
// place an internal key would reach a person outside the app. So they are numbered, in
// the order the ids sort, which is the same order on every phone reading the same days.
function unlistedPlaceIds(schedule, fromDate, toDate) {
    const known = new Set(((schedule && schedule.places) || []).map(place => String(place.id)));
    const days = (schedule && schedule.days) || {};
    const found = new Set();
    Object.keys(days).forEach(date => {
        if (fromDate !== undefined && (date < fromDate || date > toDate)) return;
        const layers = days[date] || {};
        Object.keys(layers).forEach(layer => {
            const byWorker = layers[layer] || {};
            if (layer === 'vehiclesOff') return;
            Object.keys(byWorker).forEach(workerId => {
                const record = byWorker[workerId];
                const entries = (record && record.entries) || [];
                entries.forEach(entry => {
                    const id = entry && entry.placeId !== undefined ? String(entry.placeId) : '';
                    if (id && !known.has(id)) found.add(id);
                });
            });
        });
    });
    return Array.from(found).sort();
}

// What every site is called, over one span of days: a MAP, built once and handed to every
// consumer of it.
//
// It was a function each caller invoked for itself, and two callers scoped it differently
// - the invoice sheet over the report range, the detail sheet over the whole schedule - so
// one missing site was 'אתר שאינו ברשימה 1' on one sheet and '2' on the other, in the same
// export, for the same day. Three more surfaces printed the raw record id instead. One
// site had three names in one file.
//
// So the numbering happens once, for a span, and the map is the only reading. Everything
// that shows a site over that span asks the same map, or it is not showing the same
// report. Two spans exist deliberately - a report is drawn over its range, a day or a
// week screen over what it shows - and no artefact ever mixes them.
function placeLabelsIn(schedule, fromDate, toDate) {
    const labels = new Map();
    ((schedule && schedule.places) || []).forEach(place => {
        if (place && place.id !== undefined) labels.set(String(place.id), place.name);
    });
    unlistedPlaceIds(schedule, fromDate, toDate).forEach((id, at) => {
        labels.set(id, 'אתר שאינו ברשימה ' + (at + 1));
    });
    return labels;
}

// One site out of that map. A site the map has never heard of - a day outside the span,
// an entry arriving mid-render - still never shows its record id: it is named for what it
// is, which is a site this report does not cover.
function placeLabelFrom(labels, placeId) {
    const id = String(placeId);
    if (labels && labels.has(id)) return labels.get(id);
    return 'אתר שאינו ברשימה';
}

// Whatever is referenced and missing, put back - archived, and as WHOLE as anything
// still remembers him.
//
// Restoring a name and blanking everything else looked like a small compromise and is
// not one. The phone number and the identity number are how a man is told apart from the
// other man with the same name, and the two rates are what his days are worth: a day
// recorded before rate-stamping shipped carries no rate of its own and is priced from
// the roster, so zeroing the roster silently reprices his week to nothing. The record
// this reinstates is the most complete one anybody still has - the document's own
// arrays, its keyed map, or the roster of the phone doing the reinstating - and the only
// field this function is entitled to decide is `active`.
//
// Returns which ids it had to reinstate, so a caller can say so; the sync layer works out
// the same set from the snapshot it just adopted rather than threading it through.
function reinstateReferenced(schedule, remembered) {
    const known = {
        workers: new Set((schedule.workers || []).map(item => String(item.id))),
        places: new Set((schedule.places || []).map(item => String(item.id)))
    };
    const referenced = referencedEntityIds(schedule);
    const recovered = { workers: [], places: [] };
    const held = (remembered && typeof remembered === 'object') ? remembered : {};

    const recordFor = (kind, id) => {
        const was = (held[kind] && held[kind][id]) || null;
        const name = (was && was.name) ? String(was.name) : recoveredEntityName(kind, id);
        if (kind === 'places') return { id, name, active: false };
        return {
            id,
            name,
            idNumber: String((was && was.idNumber) || ''),
            phone: String((was && was.phone) || ''),
            dailyRate: Number(was && was.dailyRate) || 0,
            hourlyRate: Number(was && was.hourlyRate) || 0,
            active: false
        };
    };

    referenced.workers.forEach(id => {
        if (known.workers.has(id)) return;
        schedule.workers.push(recordFor('workers', id));
        recovered.workers.push(id);
    });
    referenced.places.forEach(id => {
        if (known.places.has(id)) return;
        schedule.places.push(recordFor('places', id));
        recovered.places.push(id);
    });

    return recovered;
}

// What is wrong with a ledger entry, said in sentences. Strict on purpose: this is the
// record that outlives every correction, and an entry nobody can read is an entry that
// makes the fold below it wrong for ever.
// An approval of the carry migration, checked at the door like everything else.
function migrationApprovalProblems(id, value) {
    if (value === null) return ['an approval cannot be deleted'];
    if (!isPlainObject(value)) return ['an approval that is not a record'];
    if (String(value.id || '') !== String(id)) {
        return ['an approval whose id does not match its path'];
    }
    if (String(value.kind) !== 'carry') return ['an approval of a kind nobody wrote'];
    if (!Number.isInteger(value.rows) || value.rows < 0) {
        return ['an approval that does not say how much it approved'];
    }
    return [];
}

function ledgerEntryProblems(id, value) {
    if (value === null) return ['a ledger entry cannot be deleted'];
    if (!isPlainObject(value)) return ['a ledger entry that is not a record'];
    if (String(value.id || '') !== String(id)) return ['a ledger entry whose id does not match its path'];
    // THE PERIOD ARTIFACT NAMES NO ADVANCE, and that is what it is for.
    //
    // A closed fortnight is a fact about a man and a window, not a movement against a
    // debt - and most men have no debt. Hanging the record on an advance meant their
    // payslips could never be frozen at all. So this one kind names a worker and a
    // period instead, and carries no amount.
    if (String(value.kind) === 'closed') {
        if (!value.workerId || !isSafeSegment(String(value.workerId))) {
            return ['a closed period belonging to nobody'];
        }
        if (!isRealDate(String(value.periodFrom)) || !isRealDate(String(value.periodTo))) {
            return ['a closed period over no period'];
        }
        if (String(value.periodTo) < String(value.periodFrom)) {
            return ['a period that closed before it opened'];
        }
        if (!isRealDate(String(value.date))) return ['a closed period on no date'];
        // It moves no money. An amount here would be a deduction wearing the wrong kind,
        // and the fold would never see it - which is money that leaves the sum.
        if (value.amount !== undefined && Number(value.amount) !== 0) {
            return ['a closed period carrying an amount'];
        }
        if (value.advanceId !== undefined && !isSafeSegment(String(value.advanceId))) {
            return ['a closed period naming an advance id nobody could write'];
        }
    } else if (!value.advanceId || !isSafeSegment(String(value.advanceId))) {
        return ['a ledger entry with no advance behind it'];
    }
    if (!['given', 'corrected', 'cancelled', 'repaid', 'deducted', 'reversed', 'closed']
        .includes(String(value.kind))) {
        return ['a ledger entry of a kind nobody wrote'];
    }
    if (value.kind === 'given') {
        if (!value.workerId || !isSafeSegment(String(value.workerId))) {
            return ['an advance given to nobody'];
        }
        if (!isRealDate(String(value.date))) return ['an advance given on no date'];
        const out = Number(value.amount);
        if (!Number.isFinite(out)) return ['an advance of no amount'];
        // Money handed over is not negative. A negative "given" is a repayment wearing
        // the wrong kind, and folding it as an advance credits a man for cash nobody
        // gave him.
        if (out < 0) return ['an advance given of less than nothing'];
        if (out > ADVANCE_MAX) return ['an advance beyond any wage'];
    }
    // A correction restates the record, so what it restates has to be readable money.
    if (value.kind === 'corrected' && value.amount !== undefined) {
        const fixed = Number(value.amount);
        if (!Number.isFinite(fixed)) return ['a correction to no amount'];
        if (fixed < 0) return ['a correction to less than nothing'];
        if (fixed > ADVANCE_MAX) return ['a correction beyond any wage'];
    }
    // A closure's carried balance is the number the NEXT period opens on. Unreadable, it
    // is the whole debt gone or invented.
    if (value.balanceAfter !== undefined) {
        const left = Number(value.balanceAfter);
        if (!Number.isFinite(left)) return ['a closure whose carried balance is not a number'];
        if (left < 0) return ['a closure carrying less than nothing'];
        if (left > ADVANCE_MAX) return ['a closure carrying beyond any wage'];
    }
    // CASH HANDED BACK, which is money and is checked like money.
    //
    // A repayment with no date lands in no account, so it reduces nothing and is
    // invisible - and the balance it should have cleared goes on being deducted from
    // somebody's wage. A NEGATIVE one is worse than invisible: it is a second advance
    // wearing the wrong name, adding to what the man owes through a form whose whole
    // meaning is that he paid.
    // A CLOSURE is money coming off a wage, and is checked like money. It also has to
    // name the period it closes, or it cannot be found again and cannot freeze anything.
    if (String(value.kind) === 'deducted') {
        if (!isRealDate(String(value.periodFrom)) || !isRealDate(String(value.periodTo))) {
            return ['a period closed over no period'];
        }
        if (String(value.periodTo) < String(value.periodFrom)) {
            return ['a period that closed before it opened'];
        }
        const off = Number(value.amount);
        if (!Number.isFinite(off)) return ['a deduction of no amount'];
        if (off < 0) return ['a deduction of less than nothing'];
        if (off > ADVANCE_MAX) return ['a deduction beyond any wage'];
        const agorot = off * 100;
        if (Math.abs(agorot - Math.round(agorot)) > 1e-6) {
            return ['a deduction finer than an agora'];
        }
    }
    // THE FROZEN FORTNIGHT, read as money and as counts rather than taken on trust.
    //
    // A closure carries the payslip it froze - the wage, what the period opened on, and
    // what it was priced at. Every one of those numbers came off ANOTHER PHONE, and the
    // fold read them with `Number(entry.gross)`: `Number("not-money")` is NaN, NaN is not
    // undefined, so it won the "is it there" test and became the fortnight's wage. A
    // payslip reading NaN, from a record this validator called clean - while it already
    // refused an unreadable amount and an unreadable balanceAfter on the same entry.
    //
    // Not `|| 0`. A number nobody can read is not zero: zero is a statement about
    // somebody's wage that no byte on the disk makes. The entry is unreadable, held
    // aside like any other, and the account falls back to the live figure and says so.
    const snapshot = ['gross', 'carriedIn', 'given', 'repaid', 'reversed', 'net'];
    for (let at = 0; at < snapshot.length; at += 1) {
        const field = snapshot[at];
        if (value[field] === undefined || value[field] === null) continue;
        const held = Number(value[field]);
        if (!Number.isFinite(held)) {
            return ['a closure whose ' + field + ' is not a number'];
        }
        if (Math.abs(held) > ADVANCE_MAX) {
            return ['a closure whose ' + field + ' is beyond any wage'];
        }
    }
    if (value.basis !== undefined && value.basis !== null) {
        if (!isPlainObject(value.basis)) return ['a closure whose basis is not a record'];
        const counts = ['dailyRate', 'hourlyRate', 'payUnits', 'attendanceDays',
            'normalDays', 'doubleDays', 'extraHours', 'siteVisits', 'absent'];
        for (let at = 0; at < counts.length; at += 1) {
            const field = counts[at];
            if (value.basis[field] === undefined) continue;
            const held = Number(value.basis[field]);
            if (!Number.isFinite(held) || held < 0) {
                return ['a closure whose ' + field + ' is not a count'];
            }
        }
        if (value.basis.workerName !== undefined
            && typeof value.basis.workerName !== 'string') {
            return ['a closure naming a worker in something that is not a name'];
        }
    }
    // AND THE DAYS IT WAS PAID FOR, when it carries them. The list is what the man was
    // asked to agree with, so a list nobody can read is not a list to print beside a
    // number he was paid.
    if (value.days !== undefined && value.days !== null) {
        if (!Array.isArray(value.days)) return ['a closure whose days are not a list'];
        for (let at = 0; at < value.days.length; at += 1) {
            const day = value.days[at];
            if (!isPlainObject(day)) return ['a closure with a day that is not a record'];
            if (!isRealDate(String(day.date))) return ['a closure with a day on no date'];
            const paid = Number(day.amount);
            if (!Number.isFinite(paid) || paid < 0 || paid > ADVANCE_MAX) {
                return ['a closure with a day priced at nothing readable'];
            }
        }
    }
    // A CORRECTION, and the reason it was made. An unexplained adjustment to money is
    // the thing an append-only ledger exists to refuse, so the reason is not optional -
    // "somebody changed a number and nobody wrote down why" is the state this prevents.
    if (String(value.kind) === 'reversed') {
        if (!isRealDate(String(value.date))) return ['a reversal on no date'];
        // The transaction it corrects, when it names one. An entry written before
        // corrections targeted a transaction names none, and means "this advance was
        // recorded in error" - which is what it has always meant.
        if (value.targetId !== undefined && !isSafeSegment(String(value.targetId))) {
            return ['a reversal naming a transaction id nobody could write'];
        }
        if (value.targetKind !== undefined
            && ['given', 'repaid', 'deducted'].indexOf(String(value.targetKind)) === -1) {
            return ['a reversal of a kind of entry that carries no money'];
        }
        if (typeof value.reason !== 'string' || value.reason.trim() === '') {
            return ['a reversal with no reason'];
        }
        const back = Number(value.amount);
        if (!Number.isFinite(back)) return ['a reversal of no amount'];
        if (back <= 0) return ['a reversal of nothing, or of less than nothing'];
        if (back > ADVANCE_MAX) return ['a reversal beyond any wage'];
        const agorot = back * 100;
        if (Math.abs(agorot - Math.round(agorot)) > 1e-6) {
            return ['a reversal finer than an agora'];
        }
    }
    if (String(value.kind) === 'repaid') {
        if (!isRealDate(String(value.date))) return ['money handed back on no date'];
        const back = Number(value.amount);
        if (!Number.isFinite(back)) return ['money handed back of no amount'];
        if (back < 0) return ['money handed back of less than nothing'];
        if (back > ADVANCE_MAX) return ['money handed back beyond any wage'];
        // The agora, like every other amount this app holds - see advanceProblems. A
        // value the surfaces cannot all represent is a value they will disagree about,
        // and this one is subtracted from somebody's pay.
        const agorot = back * 100;
        if (Math.abs(agorot - Math.round(agorot)) > 1e-6) {
            return ['money handed back that is finer than an agora'];
        }
    }
    if (value.amount !== undefined && !Number.isFinite(Number(value.amount))) {
        return ['a ledger entry with an amount that is not a number'];
    }
    // isRealDate, not the regex: 2026-02-30 is well shaped and is not a day. A
    // transaction filed on a date that never happened lands in no account, so it reduces
    // nothing and is invisible.
    if (value.date !== undefined && !isRealDate(String(value.date))) {
        return ['a ledger entry with a date that is not a date'];
    }
    return [];
}

function advancePath(id) {
    return `advances.${id}`;
}

function addAdvance(schedule, workerId, date, amount, note) {
    const id = advanceId();
    const record = {
        id,
        workerId: String(workerId),
        date: String(date),
        amount: Number(amount) || 0,
        note: String(note || '')
    };
    schedule.advances = schedule.advances || {};
    schedule.advances[id] = record;
    return { path: advancePath(id), value: record };
}

// Removed by writing null rather than deleting, so the deletion itself is a field the
// other devices receive - a key that simply vanished locally would be re-added by the
// next snapshot that still had it.
function removeAdvance(schedule, id) {
    if (schedule.advances) delete schedule.advances[id];
    return { path: advancePath(id), value: null };
}

function advancesFor(schedule, workerId, fromDate, toDate) {
    const all = schedule.advances || {};
    return Object.keys(all)
        .map(id => all[id])
        .filter(item => item && item.workerId === workerId &&
            item.date >= fromDate && item.date <= toDate)
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function advancesTotal(schedule, workerId, fromDate, toDate) {
    return advancesFor(schedule, workerId, fromDate, toDate)
        .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
}

// ------------------------------------------------- an advance bigger than its fortnight

function advanceCarryEnabled() {
    return FARKAD_FLAGS.carryAdvances === true;
}

// Local, on purpose, both of them.
//
// js/model/migrate.js has an addDays and it loads AFTER this file; borrowing a name
// across that seam works right up until somebody reorders index.html, and then it fails
// at boot with a message about a function nobody was reading. The same rule that keeps
// canonicalJson out of this file.
//
// The rounding is the agora, which is the precision the record can hold - see the block
// over `agora` in js/ui/reports.js. A walk that carries binary float error from one
// account into the next turns 1,800 into 1,799.9999999999998 and prints it.
function advanceDayStep(dateStr, days) {
    const at = parseLocalDate(dateStr);
    at.setDate(at.getDate() + days);
    at.setHours(12, 0, 0, 0);
    return toLocalDateStr(at);
}

function agoraRound(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}

// Every repayment recorded against this man, dated inside [fromDate, toDate].
//
// Read off the LEDGER, because that is where a repayment lives - schedule.advances has
// one number per advance and no room for a second event about it. A build whose ledger
// is empty answers zero, which is the truth for every device that has never recorded one.
// Corrections, and WHICH WAY THEY MOVE THE MONEY.
//
// This used to be one number that was always subtracted, because a correction used to be
// aimed at the advance: money recorded in error and never handed over, which is money not
// owed. Corrections now name the TRANSACTION they correct - a repayment written against
// the wrong man is the case the whole of L4 exists for - and a correction runs against its
// target's own direction, not against a fixed sign.
//
// Undoing money handed over reduces the debt. Undoing a repayment puts it back: the cash
// was never handed back, so it is still owed. Undoing a deduction is the same statement
// about a wage - it did not come off, so the man still owes it.
//
// Called with no target kind it answers the total, which is what the statement prints
// under תיקון-היפוך: both halves of what happened stay on his copy.
function advanceReversalsFor(schedule, workerId, fromDate, toDate, targetKind) {
    return advanceLedgerSum(schedule, workerId, fromDate, toDate, 'reversed', targetKind);
}

function advanceRepaymentsFor(schedule, workerId, fromDate, toDate) {
    return advanceLedgerSum(schedule, workerId, fromDate, toDate, 'repaid');
}

// The one walk over the ledger both of the above use. Whose entry it is comes from the
// ADVANCE, not from the entry: a correction that moved the advance to another man would
// otherwise leave its repayments behind, crediting one person for another's money.
function advanceLedgerSum(schedule, workerId, fromDate, toDate, kind, targetKind) {
    const advances = (schedule && schedule.advances) || {};
    const held = (schedule && schedule.ledger && schedule.ledger.advances) || {};
    return Object.keys(held)
        .map(id => held[id])
        .filter(entry => entry && entry.kind === kind && entry.advanceId)
        // A correction is read by WHAT IT CORRECTS - see advanceReversalsFor. The target
        // is resolved from the record, exactly as advanceOutstanding resolves it, rather
        // than trusted from the correction's own denormalised copy: the two have to agree
        // or the screens and the ledger fold part company again. A correction carrying no
        // target at all was written before L4, when the only thing one could mean was
        // "this advance was recorded in error", and it goes on meaning that.
        .filter(entry => {
            if (!targetKind) return true;
            const target = entry.targetId ? held[String(entry.targetId)] : null;
            const of = target ? String(target.kind)
                : String(entry.targetKind || 'given');
            return of === String(targetKind);
        })
        .filter(entry => {
            const of = advances[entry.advanceId] || foldLedger(schedule)[entry.advanceId];
            return Boolean(of) && of.workerId === workerId;
        })
        .filter(entry => entry.date >= fromDate && entry.date <= toDate)
        .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
}

// The account [fromDate, toDate] runs from a Friday and lasts a fortnight - see
// js/dates.js. This walks the accounts that came BEFORE it, so it can say what this one
// starts out owing.
function accountsBefore(schedule, workerId, fromDate) {
    const advances = advancesFor(schedule, workerId, '0000-01-01', '9999-12-31');
    if (advances.length === 0) return [];

    const first = toLocalDateStr(accountStart(parseLocalDate(advances[0].date)));
    const out = [];
    let at = first;
    // Bounded by the target, and by a ceiling that cannot be reached in a working life:
    // a walk driven by dates on a record is a walk a damaged date could send forever.
    for (let n = 0; at < fromDate && n < 4000; n += 1) {
        const end = advanceDayStep(at, 13);
        out.push({ from: at, to: end });
        at = advanceDayStep(at, 14);
    }
    return out;
}

// What this man owes at the MOMENT the account beginning `fromDate` opens.
//
// Derived by walking every account before it, never stored. That is the property the
// whole feature rests on: the answer for a given account depends only on what is dated
// on or before its own last day, so an entry made in September cannot move a number on a
// fortnight somebody was already paid from in August.
function advanceCarryInto(schedule, workerId, fromDate) {
    let balance = 0;
    accountsBefore(schedule, workerId, fromDate).forEach(account => {
        // carriedForward, not carriedOut: the payslip is frozen, the money is not. See
        // the two-balance block in advanceWalk.
        balance = advanceWalk(schedule, workerId, account.from, account.to, balance)
            .carriedForward;
    });
    return agoraRound(balance);
}

// One account, given what it started out owing. Split out so the walk above and the
// report below cannot disagree about the order of operations - and the order matters:
// money handed back reduces what is owed BEFORE the wage is asked to cover the rest, or a
// man who settled in cash is deducted for it a second time out of his pay.
function advanceWalk(schedule, workerId, fromDate, toDate, carriedIn) {
    const given = advancesTotal(schedule, workerId, fromDate, toDate);
    const repaid = advanceRepaymentsFor(schedule, workerId, fromDate, toDate);
    // Reported whole, so a statement can name the corrections without calling any of them
    // "הוחזר במזומן" - and applied below by what each of them corrects.
    const reversed = advanceReversalsFor(schedule, workerId, fromDate, toDate);
    const undoneGiven = advanceReversalsFor(schedule, workerId, fromDate, toDate, 'given');
    const undoneRepaid = advanceReversalsFor(schedule, workerId, fromDate, toDate, 'repaid');
    const undoneDeducted = advanceReversalsFor(schedule, workerId, fromDate, toDate,
        'deducted');

    // A CLOSED PERIOD REPORTS ITS RECORD, and does not do the sum again.
    //
    // Recomputing is correct arithmetic over the entries dated on or before this
    // period's last day - and correct only while that set never changes. It changes: the
    // advance form clamps a repayment into the current account, but the wire does not,
    // and a phone offline for three weeks, an import or a restore all deliver entries
    // dated inside a fortnight that was printed and paid. Measured before this: a
    // back-dated repayment of 400 moved a closed period's closing balance from 1,950 to
    // 1,550, without moving either of the two figures on the payslip itself.
    //
    // See recordPeriodClosed in js/model/ledger.js. With no closure recorded - every
    // device today, since the writer gate is shut - this is absent and the walk below
    // runs exactly as it did.
    const closed = typeof closedPeriods === 'function'
        ? closedPeriods(schedule, workerId)[String(fromDate)] : undefined;

    const row = payrollReport(schedule, fromDate, toDate)
        .find(item => item.workerId === workerId);
    // A man with no rate is owed an UNKNOWN amount, which is not zero - see moneyOf in
    // js/ui/reports.js. Nothing can be deducted from a number nobody knows, so the
    // balance passes through him untouched rather than being written off against a wage
    // this app cannot price.
    // A CLOSED PERIOD REPORTS THE WAGE IT WAS CLOSED ON, not the wage the schedule
    // happens to price today. Recomputing it meant a day corrected off a paid fortnight,
    // or a rate fixed, rewrote a payslip somebody was already handed - measured at
    // 3,050 -> 2,440 on a row whose deduction stayed 3,050, so it stopped adding up.
    // A closure written before this carries no gross, and then the live figure is the
    // only answer there is; nothing is invented for it.
    const liveGross = row && row.amount !== null ? Number(row.amount) : null;
    const gross = (closed !== undefined && closed.gross !== undefined
        && closed.gross !== null)
        ? Number(closed.gross)
        : liveGross;

    // ONE fold, and it agrees with advanceOutstanding in js/model/ledger.js entry for
    // entry. Measured before this: a repayment of 400 recorded against the wrong man and
    // then corrected took 800 off his debt here - 400 for the repayment that did not
    // happen and 400 again for saying so - while the ledger fold said the whole advance
    // was still owed. Two folds of one record, disagreeing by twice the money, on the
    // screens and the files somebody is paid from.
    let balance = agoraRound((Number(carriedIn) || 0) + given
        - agoraRound(repaid - undoneRepaid) - undoneGiven + undoneDeducted);
    // Never below zero: a man who hands back more than he owes has overpaid, and turning
    // that into a negative balance would quietly ADD it to his next wage as though the
    // firm owed him for it. It is his money and he should have it back, but that is a
    // conversation, not an arithmetic result this app may reach on its own.
    if (balance < 0) balance = 0;

    // MORE SETTLED THAN WAS EVER GIVEN, on at least one of this man's advances.
    //
    // Two phones, both offline, each recording the same 500 handed back. Both entries
    // land and both are real records of something; the fold then reads 1,000 settled
    // against 500 given. Before this, `balance` clamped at zero, the deduction came out
    // as zero, the pay sheet printed a clean net and nothing on any screen said a word.
    //
    // A number that is wrong and silent is worse than one that is wrong and loud, and
    // this one is somebody's pay. So the automatic deduction STOPS while it stands: the
    // balance is carried rather than taken, both entries are kept, and the screen says
    // the account needs looking at. Correcting it is a deliberate act with a reason
    // attached - see reversalProblems in js/model/ledger.js - not an average this app
    // takes on its own.
    const overpaid = typeof overpaidAdvances === 'function'
        ? agoraRound(overpaidAdvances(schedule, workerId)
            .reduce((sum, state) => sum + (Number(state.overpaid) || 0), 0))
        : 0;

    // The record wins where there is one. It is what came off that man's wage on the day
    // the period closed, and no later entry gets to revise it - an overpayment noticed
    // today does not reach back into a payslip somebody was already handed.
    const deducted = closed !== undefined
        ? agoraRound(closed.deducted)
        : (gross === null || overpaid > 0
            ? 0
            : agoraRound(Math.min(balance, Math.max(gross, 0))));

    // TWO BALANCES OUT OF A CLOSED PERIOD, and the difference between them is the whole
    // point.
    //
    // `carriedOut` is what the payslip says and says forever: the figure the period was
    // closed on. `carriedForward` is what the NEXT period actually opens owing, which
    // includes anything that arrived dated into this period after it shut.
    //
    // They have to be two numbers. Freezing only the payslip would lose a late
    // repayment entirely - a man hands back 400, it is dated into a fortnight that has
    // closed, and it reduces nothing anywhere - and that is money vanishing from the
    // sum, which is the failure this whole area exists to prevent. Freezing neither
    // rewrites a payslip somebody was already paid from.
    //
    // So the payslip is frozen and the money still moves, into the period that is open.
    const live = agoraRound(balance - deducted);
    const frozen = closed !== undefined && closed.balanceAfter !== undefined
        ? agoraRound(closed.balanceAfter)
        : live;
    // The opening balance is frozen with the wage, for the same reason: it is a figure
    // the payslip states. `given`, `repaid` and `reversed` are deliberately NOT frozen -
    // they are what the record holds for this window today, and the sheet's late-movement
    // note is built from them. Freezing those would make a repayment that arrived after
    // the close vanish off the page, which is the money-losing half of this same fault.
    const openedOn = (closed !== undefined && closed.carriedIn !== undefined)
        ? agoraRound(Number(closed.carriedIn) || 0)
        : agoraRound(Number(carriedIn) || 0);
    return {
        from: fromDate,
        to: toDate,
        carriedIn: openedOn,
        given: agoraRound(given),
        repaid: agoraRound(repaid),
        reversed: agoraRound(reversed),
        gross,
        deducted,
        // What the payslip says, forever.
        carriedOut: frozen,
        // What the next period opens owing. Equal to carriedOut unless something arrived
        // dated into this period after it closed.
        carriedForward: live,
        // Named so a screen can say "הגיעה תנועה אחרי סגירת התקופה" rather than leaving
        // two numbers on the page with nothing explaining why they differ.
        lateSinceClose: agoraRound(live - frozen),
        // More has been settled against this man's advances than was ever handed to him.
        // Named so the screen can say so instead of printing a quiet zero.
        overpaid,
        // Whether this row's deduction was HELD rather than computed. Only ever true on
        // an open period: a closed one reports its record and is not revised.
        review: overpaid > 0 && closed === undefined,
        net: gross === null ? null : agoraRound(gross - deducted),
        // Whether this row is a record or a reckoning, said out loud - the screen shows
        // "החשבון נסגר ולא ישתנה" only where it is true.
        closed: closed !== undefined
    };
}

// The account, start to finish, with what came before it already walked.
function advanceAccount(schedule, workerId, fromDate, toDate) {
    return advanceWalk(schedule, workerId, fromDate, toDate,
        advanceCarryInto(schedule, workerId, fromDate));
}

// WHAT SWITCHING THE CARRY ON WOULD DO, without doing any of it.
//
// One row per account and man whose numbers would move, with both answers side by side.
// The same shape and the same refusal as planRateStamping: this app cannot know which
// fortnights have been paid, so it will not silently restate one - it reports, and a
// person decides.
function planAdvanceCarry(schedule) {
    const out = [];
    const workers = (schedule.workers || []).map(worker => worker.id);

    workers.forEach(workerId => {
        const advances = advancesFor(schedule, workerId, '0000-01-01', '9999-12-31');
        if (advances.length === 0) return;

        const first = toLocalDateStr(accountStart(parseLocalDate(advances[0].date)));
        const lastDated = advances[advances.length - 1].date;
        let at = first;
        let balance = 0;
        for (let n = 0; n < 4000; n += 1) {
            const to = advanceDayStep(at, 13);
            const walked = advanceWalk(schedule, workerId, at, to, balance);
            // What the report says TODAY, with the carry off: every advance dated in the
            // account is deducted in it, and nothing is remembered afterwards.
            const now = walked.given;
            if (agoraRound(now) !== walked.deducted) {
                out.push({
                    workerId,
                    from: at,
                    to,
                    now: agoraRound(now),
                    deducted: walked.deducted,
                    carriedIn: walked.carriedIn,
                    carriedOut: walked.carriedOut
                });
            }
            balance = walked.carriedForward;
            at = advanceDayStep(at, 14);
            // Stop once nothing is left owed and no advance remains to be reached. A
            // balance that never clears - a man with no rate - is why the date is a
            // condition too.
            if (balance === 0 && at > lastDated) break;
        }
    });

    return out;
}

// ---------------------------------------------------------------- vehicles

// Whether this build does vehicles at all. Read at every entry point rather than at one -
// a gate on the screen while the arithmetic went on running is what let a cancelled
// feature go on charging people.
function vehiclesEnabled() {
    return FARKAD_FLAGS.vehicles === true;
}

// A snapshot's vehicles, laid on top of the ones this device is holding.
//
// The same rule the ledger already follows: a phone that has never heard of a record has
// not DISAGREED with it. While the feature is retired nothing on any phone writes a
// vehicle, so a document with an empty array is not a document saying they were deleted -
// it is a document written by a build that does not carry them. Adopting it wholesale
// took a crew's vehicles, their rate history and the evenings that named them off the one
// device that still had them, and the snapshot that did it could not be undone.
//
// The remote copy wins where both have the same id: that is an ordinary field merge, and
// it is what would happen if anybody were editing them. What it may not do is remove.
function mergeVehiclesInto(target, source) {
    if (!target || !source) return target;
    const held = Array.isArray(source.vehicles) ? source.vehicles : [];
    if (held.length === 0) return target;

    const merged = Array.isArray(target.vehicles) ? target.vehicles.slice() : [];
    const known = new Set(merged.filter(item => item && item.id).map(item => String(item.id)));
    held.forEach(item => {
        if (!item || !item.id || known.has(String(item.id))) return;
        merged.push(item);
        known.add(String(item.id));
    });
    target.vehicles = merged;
    return target;
}

// The other half of the same fact: which vehicles stayed in the yard on a given evening.
//
// It lives on the day record, and a build that does not do vehicles does not write it -
// so a snapshot arriving without one is not a snapshot saying the evening has changed its
// mind. Carried forward for every day the snapshot DOES carry and says nothing about; a
// day the snapshot has removed is the days rule, not this one.
function mergeVehicleDaysInto(target, source) {
    if (!target || !source) return target;
    const held = (source && source.days) || {};
    Object.keys(held).forEach(date => {
        const was = held[date];
        const now = (target.days || {})[date];
        if (!was || !Array.isArray(was.vehiclesOff)) return;
        if (!now || Array.isArray(now.vehiclesOff)) return;
        now.vehiclesOff = was.vehiclesOff.slice();
    });
    return target;
}
//
// A vehicle is paid a flat amount for a day it went out. Not per trip, not per site, and
// not scaled by whether the man driving it worked a full day - three hundred is three
// hundred. It is paid to the person who OWNS the vehicle, and he is paid it whether or
// not he was on a site himself: three of these belong to one man, and on a day all three
// go out without him he is owed for all three.
//
// The rare case of somebody taking his own car needs no second mechanism. He owns a
// vehicle, and owning one is the whole of what this pays for.

// What a vehicle was worth on a given date.
//
// The rate lives in a short history on the vehicle rather than as one number, for the
// same reason a worker's day rate is stamped into the day: raising it must not repay
// last month. Each entry is the amount from that date onward; before the first one the
// vehicle earns nothing, which is what keeps adding a vehicle today from rewriting a
// period that has already been settled.
function vehicleRateOn(vehicle, date) {
    if (!vehicle || !Array.isArray(vehicle.rates)) return 0;

    let amount = 0;
    vehicle.rates
        .filter(entry => entry && typeof entry.from === 'string' && entry.from <= date)
        .sort((a, b) => (a.from < b.from ? -1 : 1))
        .forEach(entry => { amount = Number(entry.amount) || 0; });
    return amount;
}

// Did anybody actually work on this date?
//
// A vehicle goes out because there is work. A day with nobody on a site - a Saturday, a
// day of rain, a date opened by mistake - is not a day five vehicles earned fifteen
// hundred shekels between them. An absence is not work either: a man marked absent is
// the reason the vehicle stayed where it was.
function anyWorkOn(schedule, date) {
    const side = (schedule.days[date] || {}).actual || {};
    return Object.keys(side).some(workerId => {
        const record = side[workerId];
        return record && !record.absent && Array.isArray(record.entries) && record.entries.length > 0;
    });
}

// The vehicles that count on a date, with what each was worth.
//
// The default is that they all went out, and only the EXCEPTION is written down. Five
// vehicles leaving the yard every morning is the ordinary day, and asking somebody to
// confirm it five times every evening is asking him to stop using the app. So an evening
// with nothing said about vehicles is an evening they all went; days[date].vehiclesOff
// names the ones that did not, and it is empty almost always.
//
// The cost of that choice is that a vehicle added today would otherwise earn for every
// day in the record, including months already paid. The rate history is what stops it:
// no rate before the day it was added means no money before the day it was added.
function vehiclesOutOn(schedule, date) {
    // THE RETIREMENT, at the one place every vehicle number in this app comes from.
    //
    // The owner cancelled the feature. Gating the screens alone would have left this
    // function answering, and the answer is the whole hazard: the default here is that
    // every active vehicle went out on every worked day, so one evening recorded with
    // nothing said about vehicles added the daily charge to somebody's pay by itself.
    // A retired feature that still moves money is not retired.
    //
    // The stored records are NOT touched by this. Whoever turns it back on gets the same
    // vehicles, the same owners and the same rate history - see normaliseSchedule, which
    // goes on carrying every one of those fields through load, sync, backup and restore.
    if (!vehiclesEnabled()) return [];

    if (!Array.isArray(schedule.vehicles) || schedule.vehicles.length === 0) return [];
    if (!anyWorkOn(schedule, date)) return [];

    const off = (schedule.days[date] || {}).vehiclesOff;
    const stayed = Array.isArray(off) ? off : [];

    return schedule.vehicles
        .filter(vehicle => vehicle && vehicle.active !== false)
        .filter(vehicle => !stayed.includes(vehicle.id))
        .map(vehicle => ({ vehicle, amount: vehicleRateOn(vehicle, date) }))
        .filter(item => item.amount > 0);
}

// What one person is owed for his vehicles across a period.
function vehiclePayFor(schedule, workerId, fromDate, toDate) {
    let days = 0;
    let amount = 0;

    Object.keys(schedule.days || {})
        .filter(date => date >= fromDate && date <= toDate)
        .forEach(date => {
            vehiclesOutOn(schedule, date)
                .filter(item => item.vehicle.ownerId === workerId)
                .forEach(item => { days += 1; amount += item.amount; });
        });

    return { days, amount };
}

// Mark a vehicle as having stayed in the yard, or take that mark back. Returns the change
// for State.commit, the same shape every other edit here returns.
function setVehicleOut(schedule, date, vehicleId, out) {
    // No mutation path while the feature is off. Nothing draws the control that calls
    // this, but a stale screen, an undo held from before a reload, or a queued edit from
    // another build could still reach it - and every one of those writes a day record.
    if (!vehiclesEnabled()) return { path: null, value: null };

    if (!schedule.days[date]) schedule.days[date] = { plan: {}, actual: {} };
    const day = schedule.days[date];

    const stayed = Array.isArray(day.vehiclesOff) ? day.vehiclesOff.slice() : [];
    const at = stayed.indexOf(vehicleId);

    // Nothing to do - already in the state being asked for. A change with no path is
    // journalled as nothing and sent as nothing, which is what State.commit does with it.
    if (out && at >= 0) stayed.splice(at, 1);
    else if (!out && at < 0) stayed.push(vehicleId);
    else return { path: null };

    // An empty list is deleted rather than stored: the ordinary evening writes nothing,
    // and a field that is always there saying "nothing" is a field on every device's
    // document forever.
    if (stayed.length === 0) {
        delete day.vehiclesOff;
        return { path: `days.${date}.vehiclesOff`, value: null };
    }

    day.vehiclesOff = stayed;
    return { path: `days.${date}.vehiclesOff`, value: stayed };
}

function nextVehicleId(schedule) {
    const used = new Set((schedule.vehicles || []).map(vehicle => String(vehicle.id)));
    let n = 1;
    while (used.has(`v_${String(n).padStart(2, '0')}`)) n += 1;
    return `v_${String(n).padStart(2, '0')}`;
}

function makeEntry(placeId, rate, extraHours) {
    const entry = { placeId: String(placeId) };

    if (RATES.includes(rate) && rate !== RATE_NORMAL) {
        entry.rate = rate;
    }
    // Only stored when it carries information. An absent field reads as "no extra hours"
    // everywhere, so writing 0 would just be noise in every document.
    const hours = Number(extraHours);
    if (Number.isFinite(hours) && hours > 0) {
        entry.extraHours = hours;
    }

    return entry;
}

function entryRate(entry) {
    return entry && RATES.includes(entry.rate) ? entry.rate : RATE_NORMAL;
}

function entryExtraHours(entry) {
    const hours = entry && Number(entry.extraHours);
    return Number.isFinite(hours) && hours > 0 ? hours : 0;
}

// ---------------------------------------------------------------- reading

function dayRecord(schedule, date) {
    return (schedule.days && schedule.days[date]) || null;
}

function workerDay(schedule, date, workerId, layer) {
    const day = dayRecord(schedule, date);
    const side = day && day[layer];
    return (side && side[workerId]) || null;
}

function entriesFor(schedule, date, workerId, layer) {
    const record = workerDay(schedule, date, workerId, layer);
    return record && Array.isArray(record.entries) ? record.entries : [];
}

function isAbsent(schedule, date, workerId, layer) {
    const record = workerDay(schedule, date, workerId, layer);
    return Boolean(record && record.absent);
}

// Everyone assigned to one place on one date, in roster order.
function workersAtPlace(schedule, date, placeId, layer) {
    const day = dayRecord(schedule, date);
    const side = (day && day[layer]) || {};

    return schedule.workers
        .filter(worker => {
            const record = side[worker.id];
            return record && !record.absent && (record.entries || [])
                .some(entry => entry.placeId === placeId);
        })
        .map(worker => worker.id);
}

// ---------------------------------------------------------------- writing
//
// Each of these returns the single field path it changed, so the sync layer can send that
// path alone instead of the whole document. That is what keeps three people editing the
// same evening from overwriting each other.

function fieldPath(date, layer, workerId) {
    return `days.${date}.${layer}.${workerId}`;
}

function ensureDay(schedule, date, layer) {
    if (!schedule.days) schedule.days = {};
    if (!schedule.days[date]) schedule.days[date] = { plan: {}, actual: {} };
    if (!schedule.days[date][layer]) schedule.days[date][layer] = {};
    return schedule.days[date][layer];
}

// ---------------------------------------------------------------- what a day was worth
//
// The rate a day was worked at belongs to the DAY, not to the worker's row in the roster.
//
// It used to be read from the roster at report time, so raising somebody's daily rate
// silently restated every day they had ever worked - including days already invoiced to
// a client and already paid. Correcting a typo in a rate did the same thing. The number
// on last account's pay sheet would simply be different the next time it was opened, with
// nothing to say it had changed.
//
// So a day records what it was worth when it was recorded, and keeps it through every
// later edit to that day.
function currentRates(schedule, workerId) {
    const worker = (schedule.workers || []).find(w => w && w.id === workerId);
    if (!worker) return null;

    const daily = Number(worker.dailyRate) || 0;
    const hourly = Number(worker.hourlyRate) || 0;
    // Nothing worth stamping. A worker with no rate yet is a rate that has not been
    // decided, and freezing "no rate" onto the day would make it permanent.
    if (daily <= 0 && hourly <= 0) return null;

    return { daily, hourly };
}

// What a given day should be paid at. The stamp if it has one; the roster otherwise.
//
// The fallback is what makes this safe to ship over data that already exists: every day
// recorded before this carries no stamp and goes on behaving exactly as it did. Stamping
// those retroactively would be inventing what somebody was paid, which is not a decision
// this code is allowed to take - see planRateStamping.
function ratesForDay(schedule, date, workerId, worker) {
    const record = workerDay(schedule, date, workerId, 'actual');
    if (record && record.rates) {
        return {
            daily: Number(record.rates.daily) || 0,
            hourly: Number(record.rates.hourly) || 0,
            stamped: true
        };
    }
    return {
        daily: Number(worker.dailyRate) || 0,
        hourly: Number(worker.hourlyRate) || 0,
        stamped: false
    };
}

function setWorkerDay(schedule, date, workerId, layer, record) {
    const previous = workerDay(schedule, date, workerId, layer);
    const side = ensureDay(schedule, date, layer);

    const next = {};
    Object.keys(record).forEach(key => { next[key] = record[key]; });

    if (previous && previous.rates) {
        // Already stamped. Removing one of two sites, changing a rate band, correcting a
        // site - none of those are a reason to restate what the day was worth.
        next.rates = previous.rates;
    } else if (layer === 'actual' && !record.absent && (record.entries || []).length > 0) {
        const rates = currentRates(schedule, workerId);
        if (rates) next.rates = rates;
    }

    side[workerId] = next;
    return { path: fieldPath(date, layer, workerId), value: next };
}

// What stamping the days that carry no rate WOULD do. It does not do it.
//
// Every day recorded before rates were stamped has no confirmed historical rate: the
// roster holds today's number, and whether that is what the man was actually paid in
// March is not something anyone can read out of this data. Writing today's rate onto
// those days would freeze a guess into the pay record and make it look confirmed.
//
// So this reports the change and stops. The decision is the owner's.
function planRateStamping(schedule) {
    const changes = [];

    Object.keys(schedule.days || {}).sort().forEach(date => {
        const side = (schedule.days[date] || {}).actual || {};
        Object.keys(side).forEach(workerId => {
            const record = side[workerId];
            if (!record || record.rates) return;
            if (record.absent || (record.entries || []).length === 0) return;

            const rates = currentRates(schedule, workerId);
            if (!rates) return;

            const worker = (schedule.workers || []).find(w => w && w.id === workerId);
            changes.push({
                date,
                workerId,
                name: worker ? worker.name : workerId,
                daily: rates.daily,
                hourly: rates.hourly
            });
        });
    });

    return { days: changes.length, changes };
}

function assignPlace(schedule, date, workerId, layer, placeId, rate, extraHours) {
    const existing = entriesFor(schedule, date, workerId, layer)
        .filter(entry => entry.placeId !== placeId);

    // The cap is enforced HERE, not only on the screen that knows about it. A third site
    // can arrive from a copy-yesterday, from a migration decision, or from another phone
    // - none of which go through that screen. A day with three sites is still paid as one
    // day, so it does not overpay anybody; it means somebody's day is recorded wrong, and
    // recording it wrong quietly is what this refuses.
    //
    // The refusal is RETURNED. Swallowing it would leave a caller believing it wrote.
    if (existing.length >= MAX_ENTRIES_PER_DAY) {
        return {
            refused: true,
            reason: `אפשר לרשום עד ${MAX_ENTRIES_PER_DAY} אתרים ליום לעובד.`
        };
    }

    // Adding, not replacing: two sites in a day is the normal case here, so a second
    // assignment must not silently discard the first.
    const entries = existing.concat([makeEntry(placeId, rate, extraHours)]);

    return setWorkerDay(schedule, date, workerId, layer, { entries });
}

// Days already recorded above the cap. Reported, never trimmed: those entries are days
// somebody worked, and deleting data to satisfy a rule written afterwards is the one
// thing a record of pay must not do. They are surfaced so a person can look and decide.
function daysOverCap(schedule) {
    const over = [];

    Object.keys(schedule.days || {}).sort().forEach(date => {
        ['plan', 'actual'].forEach(layer => {
            const side = (schedule.days[date] || {})[layer] || {};
            Object.keys(side).forEach(workerId => {
                const entries = (side[workerId] && side[workerId].entries) || [];
                if (entries.length > MAX_ENTRIES_PER_DAY) {
                    over.push({ date, layer, workerId, count: entries.length });
                }
            });
        });
    });

    return over;
}

function unassignPlace(schedule, date, workerId, layer, placeId) {
    const entries = entriesFor(schedule, date, workerId, layer)
        .filter(entry => entry.placeId !== placeId);

    return setWorkerDay(schedule, date, workerId, layer, { entries });
}

function setRate(schedule, date, workerId, layer, placeId, rate, extraHours) {
    const entries = entriesFor(schedule, date, workerId, layer)
        .map(entry => entry.placeId === placeId
            ? makeEntry(placeId, rate, extraHours)
            : entry);

    return setWorkerDay(schedule, date, workerId, layer, { entries });
}

function markAbsent(schedule, date, workerId, layer) {
    return setWorkerDay(schedule, date, workerId, layer, { absent: true, entries: [] });
}

function clearWorkerDay(schedule, date, workerId, layer) {
    return setWorkerDay(schedule, date, workerId, layer, { entries: [] });
}

// ---------------------------------------------------------------- reports

// Per worker, over a date range: the sheet pay is calculated from.
//
// The unit is the DAY, not the assignment. Two sites in one day is one day's pay - the
// travelling does not earn more - so counting assignments here would overpay every time
// someone moved between sites, which happens most days.
//
// The rules, as given:
//   a normal day        = the daily rate
//   a double day        = twice the daily rate, exactly
//   extra hours         = the worker's hourly rate, per hour, on top
//   two sites in a day  = still one day
//
// A day where one site was normal and another was double is paid as a double day: the
// person worked the longer day, and it is paid once at the highest level worked.
function payrollReport(schedule, fromDate, toDate) {
    const dates = Object.keys(schedule.days || {})
        .filter(date => date >= fromDate && date <= toDate)
        .sort();

    return schedule.workers.map(worker => {
        // Two counts, deliberately, because they answer two different questions and one
        // number was being made to answer both.
        //
        //   attendanceDays - how many DATES this man was on a site. Two sites on one
        //                    date is one day; he was there once.
        //   payUnits       - how many days he is PAID for. A double day is two of them.
        //
        // The sheet used to print only the first, next to a total computed from the
        // second, so four days at 450 came out as 2700 and looked like an arithmetic
        // mistake. Neither number was wrong; the sheet was only showing one of them.
        const row = {
            workerId: worker.id,
            name: worker.name,
            attendanceDays: 0,
            payUnits: 0,
            normalDays: 0,
            doubleDays: 0,
            extraHours: 0,
            siteVisits: 0,
            absent: 0
        };

        // Summed day by day, because each day is paid at the rate it was RECORDED at.
        // Multiplying a day count by today's rate is what silently restated the past
        // every time somebody's rate was corrected or raised.
        let total = 0;
        let unpriced = false;
        const dailyRatesUsed = new Set();

        dates.forEach(date => {
            if (isAbsent(schedule, date, worker.id, 'actual')) {
                row.absent++;
                return;
            }

            const entries = entriesFor(schedule, date, worker.id, 'actual');
            if (entries.length === 0) return;

            // Once per DATE, whatever is on it. Two sites in one day is two entries and
            // one day of work - counting the entries would pay a man twice for standing
            // in two places.
            row.attendanceDays++;
            row.siteVisits += entries.length;

            // `some`, not a count: a double day is double whether it carries one site or
            // two, so two sites on a double day is two pay units and never four.
            const doubled = entries.some(entry => entryRate(entry) === RATE_DOUBLE);
            if (doubled) row.doubleDays++;
            else row.normalDays++;
            row.payUnits += doubled ? 2 : 1;

            const hours = entries.reduce((sum, entry) => sum + entryExtraHours(entry), 0);
            row.extraHours += hours;

            const rates = ratesForDay(schedule, date, worker.id, worker);
            dailyRatesUsed.add(rates.daily);

            if (rates.daily <= 0) {
                unpriced = true;
                return;
            }
            if (hours > 0 && rates.hourly <= 0) row.hoursUnpriced = true;

            total += rates.daily * (doubled ? 2 : 1) + rates.hourly * hours;
        });

        const daily = Number(worker.dailyRate) || 0;
        const hourly = Number(worker.hourlyRate) || 0;

        row.dailyRate = daily;
        row.hourlyRate = hourly;
        // Only a number when there is a rate to multiply by. Showing 0 for a worker whose
        // rate has not been entered would read as "owed nothing", which is a different
        // thing entirely.
        if (row.attendanceDays === 0) row.amount = daily > 0 ? 0 : null;
        else row.amount = unpriced ? null : total;

        // A sheet whose total cannot be checked against the rate printed beside it has to
        // say so, or it reads as an arithmetic mistake. Two ways that happens:
        //
        //   more than one rate inside the period - a raise partway through it; or
        //   every day at one rate that is no longer the rate on the roster today.
        //
        // The second was missed. All the days would be stamped 450, the column would
        // print today's 900, and nothing anywhere said why 7 days came to 3270 - which is
        // the same complaint that split this count in two: a number printed next to a
        // total it does not explain.
        row.mixedRates = dailyRatesUsed.size > 1
            || (daily > 0 && row.attendanceDays > 0 && !dailyRatesUsed.has(daily));
        row.hoursUnpriced = Boolean(row.hoursUnpriced);

        // What was earned and what is still owed are two different numbers, and paying
        // the first one twice is the whole reason advances are recorded at all.
        row.advances = advancesTotal(schedule, worker.id, fromDate, toDate);

        // What his vehicles earned, kept as its own number rather than folded into the
        // day rate. It is a different thing being paid for - the vehicle went out, and
        // whether he went with it is not the question - so a sheet that added the two
        // together would show a man 5 days at 450 coming to 3750 and explain nothing.
        const vehicles = vehiclePayFor(schedule, worker.id, fromDate, toDate);
        row.vehicleDays = vehicles.days;
        row.vehicleAmount = vehicles.amount;

        // A man who did not work but whose vehicle did is still owed. amount is null only
        // when a rate is missing for days he DID work; nothing here is unpriced.
        if (row.vehicleAmount > 0 && row.amount === null && row.attendanceDays === 0) {
            row.amount = 0;
        }
        if (row.amount !== null) row.amount += row.vehicleAmount;

        // Only a POSITIVE advance is money that was handed over, and only that is netted.
        // A negative one is not a repayment this build knows how to account for; netting
        // it reports a man as owed MORE than he earned, which is exactly how gross 400
        // with an advance of -500 came out as 900 - on a document that passed every gate
        // this build had. The amount stays in `advances` so the screen can show it and a
        // person can see there is money here the app is refusing to account for.
        const netted = row.advances > 0 ? row.advances : 0;
        row.netAmount = row.amount === null ? null : row.amount - netted;

        // A CLOSED FORTNIGHT REPORTS THE ROW IT WAS CLOSED ON.
        //
        // C4 froze the three money columns and left the counts and the day list beside
        // them live, so removing one historical day from a paid fortnight moved
        // attendanceDays 5 -> 4, payUnits 5 -> 4 and this amount 3,050 -> 2,440 while the
        // deduction column stayed 3,050 - a row that no longer adds up, on the sheet the
        // crew is paid from. Half a frozen payslip is not a payslip.
        //
        // Only where the closure RECORDED them: a closure from before this carries no
        // basis and nothing is invented for it. See closedPeriods, which never coerces.
        //
        // AND WITH NO GATE IN FRONT OF IT, deliberately. The carry flag says what this
        // build may write and how it reads an account; a closure is a fact on the shared
        // record, and a phone whose gate is still shut recomputing a fortnight that the
        // phone with the gate open closed is two phones printing different money for
        // one payday. Pinned in tests/closure.test.mjs, «a fortnight closed on one
        // phone is frozen on a phone whose gate is shut».
        const frozen = typeof closedPeriods === 'function'
            ? closedPeriods(schedule, worker.id)[fromDate] : undefined;
        if (frozen !== undefined) {
            if (Number.isFinite(frozen.gross)) {
                row.amount = frozen.gross;
                row.netAmount = frozen.gross - netted;
            }
            if (isPlainObject(frozen.basis)) {
                // Every count the sheet prints, where the closure recorded it. A closure
                // from before a given field exists carries none, and that column is the
                // live one - which is the same fallback the wage takes.
                ['attendanceDays', 'payUnits', 'normalDays', 'doubleDays', 'extraHours',
                    'siteVisits', 'absent'].forEach(field => {
                        if (Number.isFinite(Number(frozen.basis[field]))) {
                            row[field] = Number(frozen.basis[field]);
                        }
                    });
            }
        }

        return row;
    });
}

// One worker, day by day, with the same arithmetic the pay sheet totals - because the
// question this answers is "why is my pay this number", and an answer computed a second
// way is not an answer.
function workerDaysReport(schedule, worker, fromDate, toDate) {
    // THE DAYS A CLOSED FORTNIGHT WAS PAID FOR, as it recorded them.
    //
    // This list is what the man is handed and asked to agree with - it is the answer to
    // "why is my pay this number" - and it was recomputed from the live schedule on every
    // read, so a day corrected off a paid fortnight quietly disappeared from a statement
    // whose total, by then, was frozen. The two halves of one document disagreeing.
    //
    // Only where the closure carries them: an older closure has no list and this behaves
    // as it always did.
    const frozen = typeof closedPeriods === 'function'
        ? closedPeriods(schedule, worker.id)[fromDate] : undefined;
    if (frozen !== undefined && Array.isArray(frozen.days)) {
        return frozen.days.map(day => ({
            date: String(day.date),
            absent: Boolean(day.absent),
            entries: Array.isArray(day.entries) ? day.entries.map(one => {
                const entry = { placeId: String(one.placeId || '') };
                if (one.rate !== undefined) entry.rate = one.rate;
                if (one.hours !== undefined) entry.hours = one.hours;
                return entry;
            }) : [],
            doubled: Array.isArray(day.entries)
                && day.entries.some(one => String(one.rate) === String(RATE_DOUBLE)),
            extraHours: Array.isArray(day.entries)
                ? day.entries.reduce((sum, one) => sum + (Number(one.hours) || 0), 0) : 0,
            amount: Number(day.amount) || 0
        }));
    }
    return Object.keys(schedule.days || {})
        .filter(date => date >= fromDate && date <= toDate)
        .sort()
        .map(date => {
            if (isAbsent(schedule, date, worker.id, 'actual')) {
                return { date, absent: true, entries: [], doubled: false, extraHours: 0, amount: 0 };
            }

            const entries = entriesFor(schedule, date, worker.id, 'actual');
            if (entries.length === 0) return null;

            const doubled = entries.some(entry => entryRate(entry) === RATE_DOUBLE);
            const extraHours = entries.reduce((sum, entry) => sum + entryExtraHours(entry), 0);
            const rates = ratesForDay(schedule, date, worker.id, worker);

            return {
                date,
                absent: false,
                entries,
                doubled,
                extraHours,
                dailyRate: rates.daily,
                // True when this day is not at the rate the roster shows today, so the
                // line can say why it does not match.
                historic: rates.stamped && rates.daily !== (Number(worker.dailyRate) || 0),
                amount: rates.daily > 0
                    ? rates.daily * (doubled ? 2 : 1) + rates.hourly * extraHours
                    : null
            };
        })
        .filter(Boolean);
}

// Per place, over a date range: worker-days at each site, which is what the client
// invoice is built from.
// The same two counts, over the day rows one worker's detail screen is built from.
//
// It exists so that the pay sheet, the detail modal, the message sent to the worker and
// the exported file cannot disagree: every one of them asks THIS, and none of them counts
// anything for itself. The bug that started this was one screen printing a count of dates
// beside a total computed from pay units, and there is no way to keep four places in step
// by hand.
//
// Absences are not attendance. A man who was away was not on a site, and paying him for
// the day he was away is the one arithmetic nobody wants to explain.
function workerDaysSummary(days) {
    const worked = (days || []).filter(day => day && !day.absent);

    return {
        attendanceDays: worked.length,
        payUnits: worked.reduce((sum, day) => sum + (day.doubled ? 2 : 1), 0),
        doubleDays: worked.filter(day => day.doubled).length,
        // Reported beside the days and never folded into them: extra hours are paid at
        // the hourly rate, and adding them to a day count would restate the day itself.
        extraHours: worked.reduce((sum, day) => sum + (Number(day.extraHours) || 0), 0),
        absent: (days || []).filter(day => day && day.absent).length,
        // The real sum of what each day was worth at the rate it was RECORDED at - never
        // payUnits times today's rate, which quietly repays the past at the new price.
        amount: worked.some(day => day.amount === null)
            ? null
            : worked.reduce((sum, day) => sum + (day.amount || 0), 0)
    };
}

function invoiceReport(schedule, fromDate, toDate) {
    const dates = Object.keys(schedule.days || {})
        .filter(date => date >= fromDate && date <= toDate)
        .sort();

    // The roster first, then every site the days name that the roster has not got. A
    // sheet built by walking the roster alone drops those days off the invoice while the
    // pay sheet still pays for them - three sheets in one file, and the money in them not
    // adding up to the same fortnight.
    const labels = placeLabelsIn(schedule, fromDate, toDate);
    const columns = schedule.places.map(place => ({ id: place.id, name: place.name }))
        .concat(unlistedPlaceIds(schedule, fromDate, toDate)
            .map(id => ({ id, name: placeLabelFrom(labels, id) })));

    return columns.map(place => {
        const row = { placeId: place.id, name: place.name, workerDays: 0, byDate: {}, days: [] };

        dates.forEach(date => {
            const workerIds = workersAtPlace(schedule, date, place.id, 'actual');
            if (workerIds.length === 0) return;

            row.byDate[date] = workerIds.length;
            row.workerDays += workerIds.length;
            // The client is invoiced day by day, so the detail has to survive the
            // aggregation rather than be recomputed by whoever reads the total.
            row.days.push({ date, count: workerIds.length, workerIds });
        });

        return row;
    });
}

// Every date in the range that had any work, with each site's count. This is the shape
// the printed invoice reads down: one row per day, one column per site.
function invoiceByDate(schedule, fromDate, toDate) {
    const rows = invoiceReport(schedule, fromDate, toDate).filter(row => row.workerDays > 0);

    const dates = new Set();
    rows.forEach(row => row.days.forEach(day => dates.add(day.date)));

    return {
        places: rows,
        dates: Array.from(dates).sort(),
        countAt(placeId, date) {
            const place = rows.find(row => row.placeId === placeId);
            return (place && place.byDate[date]) || 0;
        },
        total: rows.reduce((sum, row) => sum + row.workerDays, 0)
    };
}
