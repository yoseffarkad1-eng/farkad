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
        ledger: { advances: {} },
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
function isSafeId(value) {
    return typeof value === 'string'
        && value.length > 0 && value.length <= 100
        && value === value.trim()
        && !UNSAFE_ID.test(value);
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
        if (item[field] === undefined) return;
        if (!isFiniteNumber(item[field]) || item[field] < 0) {
            problems.push(label + ' ' + item.id + ': השכר אינו מספר תקין.');
        }
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
        // The two sides the model has, and the vehicles that stayed in the yard. Anything
        // else is something this app did not write, and reading it as a day would be
        // reading somebody else's document.
        //
        // vehiclesOff was added to the writer in v83 and to nothing else. A record
        // carrying it failed here, was judged damaged and quarantined, and the day's work
        // did not load - so one tap on "לא יצא" cost somebody the evening he had just
        // recorded. The bytes were never overwritten, which is why teaching the reader
        // about the field is enough to open those records again.
        const extra = Object.keys(day)
            .filter(key => key !== 'plan' && key !== 'actual' && key !== 'vehiclesOff'
                && key !== 'vehicles');
        if (extra.length > 0) {
            problems.push('ליום ' + date + ' יש שכבה שאינה מוכרת: ' + extra[0] + '.');
            return;
        }
        if (day.vehiclesOff !== undefined) {
            const off = day.vehiclesOff;
            if (!Array.isArray(off)) {
                problems.push('רשימת הרכבים שלא יצאו ב-' + date + ' אינה תקינה.');
                return;
            }
            const bad = off.find(id => !isSafeSegment(id));
            if (bad !== undefined) {
                problems.push('ליום ' + date + ' יש רכב עם מזהה שאינו תקין.');
                return;
            }
        }
        if (day.vehicles !== undefined) {
            if (!isPlainObject(day.vehicles)) {
                problems.push('מצב הרכבים ב-' + date + ' אינו תקין.');
                return;
            }
            const badId = Object.keys(day.vehicles).find(id => !isSafeSegment(id));
            if (badId !== undefined) {
                problems.push('ליום ' + date + ' יש רכב עם מזהה שאינו תקין.');
                return;
            }
            const badState = Object.keys(day.vehicles).find(id => {
                const item = day.vehicles[id];
                return !isPlainObject(item) || typeof item.out !== 'boolean';
            });
            if (badState !== undefined) {
                problems.push('מצב הרכב ' + badState + ' ב-' + date + ' אינו תקין.');
                return;
            }
        }
        if (day.plan === undefined && day.actual === undefined
            && day.vehiclesOff === undefined && day.vehicles === undefined) {
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
            ['daily', 'hourly'].forEach(field => {
                if (record.rates[field] === undefined) return;
                if (!isFiniteNumber(record.rates[field]) || record.rates[field] < 0) {
                    problems.push('שכר שמור שאינו מספר תקין' + who);
                }
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

function advanceProblems(raw, known) {
    const problems = [];

    Object.keys(raw.advances).forEach(id => {
        if (!isSafeId(id)) {
            problems.push('מזהה מקדמה שאינו תקין: ' + id + '.');
            return;
        }
        const item = raw.advances[id];
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
        if (!isFiniteNumber(item.amount)) {
            problems.push('הסכום של המקדמה ' + id + ' אינו מספר תקין.');
        }
    });

    return problems;
}

// The gate the four restore doors and the sync layer share: the narrow migration first,
// then the complete check. Returns the document to use, and why not.
function readReplacementDocument(raw) {
    const upgraded = upgradeStoredSchedule(raw);
    if (!upgraded) {
        return { document: null, problems: ['הקובץ אינו מסמך של לוח עבודה.'] };
    }
    const problems = fullScheduleProblems(upgraded);
    return { document: problems.length === 0 ? upgraded : null, problems };
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

function isSafeSegment(value) {
    return isSafeId(value) && POISON_SEGMENTS.indexOf(value) === -1;
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
        // days.<date>.vehiclesOff - the vehicles that stayed in the yard that day, or a
        // null taking the whole list back. Three segments rather than four, and it was
        // refused here, so the edit was written to this phone's disk and never left it.
        // days.<date>.vehicles.<vehicleId> - one vehicle's state for one day.
        if (parts.length === 4 && parts[2] === 'vehicles') {
            if (!isRealDate(parts[1])) return ['a day path with a date that does not exist'];
            if (!isSafeSegment(parts[3])) return ['a vehicle path with an unusable id'];
            if (value === null) return [];
            if (!isPlainObject(value)) return ['a vehicle state that is not a record'];
            if (typeof value.out !== 'boolean') return ['a vehicle state that says nothing'];
            return [];
        }

        if (parts.length === 3 && parts[2] === 'vehiclesOff') {
            if (!isRealDate(parts[1])) return ['a day path with a date that does not exist'];
            if (value === null) return [];
            if (!Array.isArray(value)) return ['a vehicles-off list that is not a list'];
            if (value.some(id => !isSafeSegment(id))) {
                return ['a vehicles-off list naming an unusable id'];
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
        if (parts.length !== 3 || parts[1] !== 'advances') {
            return ['a ledger path nobody wrote'];
        }
        if (!isSafeSegment(parts[2])) return ['a ledger path with an unusable id'];
        return ledgerEntryProblems(parts[2], value);
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
            if (parts[1] !== 'workerOrder' && parts[1] !== 'placeOrder'
                && parts[1] !== 'vehicleOrder') {
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

        // roster.vehicles.<id>.<field> - one thing about one van, so two phones changing
        // its name and its price do not overwrite each other.
        if (parts.length === 4 && parts[1] === 'vehicles') {
            if (!isSafeSegment(parts[2])) return ['a roster path with an unusable id'];
            const field = parts[3];
            if (field === 'name' || field === 'ownerId') {
                if (typeof value !== 'string') return ['a vehicle field that is not text'];
                return [];
            }
            if (field === 'active') {
                if (typeof value !== 'boolean') return ['a vehicle field that is not a flag'];
                return [];
            }
            if (field === 'service') {
                if (!Array.isArray(value)) return ['a service history that is not a list'];
                const bad = value.find(entry => !isPlainObject(entry)
                    || typeof entry.from !== 'string' || !isRealDate(entry.from)
                    || typeof entry.active !== 'boolean');
                return bad === undefined ? [] : ['a service entry with no date or no state'];
            }
            if (field === 'rates') {
                if (!Array.isArray(value)) return ['a vehicle price history that is not a list'];
                const bad = value.find(entry => !isPlainObject(entry)
                    || typeof entry.from !== 'string' || !isFiniteNumber(entry.amount));
                return bad === undefined ? [] : ['a vehicle price with no date or no amount'];
            }
            return ['a vehicle field nobody wrote'];
        }

        // roster.workers.<id> / roster.places.<id> - one person or one site, or a
        // removal, which travels as null.
        if (parts.length !== 3) return ['a roster path with the wrong number of segments'];
        const kind = parts[1];
        if (kind !== 'workers' && kind !== 'places' && kind !== 'vehicles') {
            return ['a roster path nobody wrote'];
        }
        if (!isSafeSegment(parts[2])) return ['a roster path with an unusable id'];
        if (value === null) return [];
        if (!isPlainObject(value)) return ['a roster entry that is not a record'];
        if (String(value.id) !== parts[2]) return ['a roster entry filed under another id'];
        const label = kind === 'workers' ? 'עובד' : (kind === 'vehicles' ? 'רכב' : 'אתר');
        return entityProblems(value, kind, label);
    }

    // The legacy whole-array form. Still written on purpose, for a phone that has not
    // updated and reads nothing else - see editRoster.
    if (parts.length === 1
        && (parts[0] === 'workers' || parts[0] === 'places' || parts[0] === 'vehicles')) {
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

    return { days, advances };
}

// What still has to be settled with a man before he is put away, said in a sentence, or
// null when there is nothing. Not a bar on archiving - a debt is a reason to be told, not
// a reason to be stopped.
function openAdvanceBalance(schedule, workerId) {
    const advances = workerFootprint(schedule, workerId).advances;
    if (advances.length === 0) return null;

    const total = advances.reduce(
        (sum, id) => sum + (Number((schedule.advances[id] || {}).amount) || 0), 0);
    return total > 0 ? { count: advances.length, total } : null;
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
function ledgerEntryProblems(id, value) {
    if (value === null) return ['a ledger entry cannot be deleted'];
    if (!isPlainObject(value)) return ['a ledger entry that is not a record'];
    if (String(value.id || '') !== String(id)) return ['a ledger entry whose id does not match its path'];
    if (!value.advanceId || !isSafeSegment(String(value.advanceId))) {
        return ['a ledger entry with no advance behind it'];
    }
    if (!['given', 'corrected', 'cancelled'].includes(String(value.kind))) {
        return ['a ledger entry of a kind nobody wrote'];
    }
    if (value.kind === 'given') {
        if (!value.workerId || !isSafeSegment(String(value.workerId))) {
            return ['an advance given to nobody'];
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value.date))) {
            return ['an advance given on no date'];
        }
        if (!Number.isFinite(Number(value.amount))) return ['an advance of no amount'];
    }
    if (value.amount !== undefined && !Number.isFinite(Number(value.amount))) {
        return ['a ledger entry with an amount that is not a number'];
    }
    if (value.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(value.date))) {
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

// ---------------------------------------------------------------- vehicles
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
    if (!Array.isArray(schedule.vehicles) || schedule.vehicles.length === 0) return [];
    if (!anyWorkOn(schedule, date)) return [];

    const day = schedule.days[date] || {};

    // Two shapes, and the newer one wins per vehicle.
    //
    // vehiclesOff was one array, so it was one field on the wire: two phones marking two
    // different vans on the same evening each wrote the whole list, and whichever landed
    // second replaced the other's. One exception gone, and a van paid three hundred for a
    // day it spent in the yard. The canonical form is one field per vehicle - see
    // setVehicleOut - and the array is still READ because it is on phones and in
    // documents already.
    const perVehicle = isPlainObject(day.vehicles) ? day.vehicles : {};
    const legacy = Array.isArray(day.vehiclesOff) ? day.vehiclesOff : [];
    const stayedIn = id => {
        const said = perVehicle[id];
        if (said && typeof said === 'object' && said.out !== undefined) return said.out === false;
        return legacy.indexOf(id) !== -1;
    };

    return schedule.vehicles
        .filter(vehicle => vehicle && !vehicleRetiredOn(vehicle, date))
        .filter(vehicle => !stayedIn(vehicle.id))
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
// One field per vehicle per day, so two phones marking two different vans on the same
// evening never touch the same bytes. The whole-array form this replaced lost one of the
// two exceptions every time, which is a van paid for a day it spent in the yard.
//
// The state is written out rather than deleted when a vehicle goes back on the road: the
// old array may still say it stayed in, and on a day both shapes speak the newer one has
// to be able to say so. An evening where nothing unusual happened still writes nothing at
// all - this is only reached when somebody taps.
// Was this vehicle off the books on that date?
//
// `active` is a flag about TODAY, and it was being applied to every date in the record:
// archiving a van in September changed what August came to, from three hundred to nought,
// on a period that had been counted, printed and paid. It is the same mistake the day
// rates were stamped to prevent.
//
// So archiving writes the date it happened - `retiredFrom` - and only days from that date
// onward stop paying. Putting the van back clears it, and the days it spent off the road
// stay off the books, because the periods either side of them are what they were.
//
// A van marked inactive with no date on it is one archived by the build before this, and
// there is no way to know when. Guessing would restate a real period in one direction or
// the other, so it keeps the behaviour it was archived under - off the books everywhere -
// and it is the one case this cannot date. Nothing in production has been archived under
// that build; the feature and the fix are hours apart.
function vehicleRetiredOn(vehicle, date) {
    if (!vehicle) return true;

    // A dated history, the same shape as the price one above and for the same reason. A
    // single flag cannot say "off the road in September and back in October": clearing it
    // paid for the days in between, which is the past being restated in the other
    // direction. Each entry is what was true from that date onward.
    if (Array.isArray(vehicle.service) && vehicle.service.length > 0) {
        let active = true;
        vehicle.service
            .filter(entry => entry && typeof entry.from === 'string' && entry.from <= date)
            .sort((a, b) => (a.from < b.from ? -1 : 1))
            .forEach(entry => { active = entry.active !== false; });
        return !active;
    }

    return vehicle.active === false;
}

// Whether a vehicle is marked as having stayed in on a date, in either shape. The screen
// needs this on days with no work, where vehiclesOutOn says nothing about any of them.
function isVehicleHeldIn(schedule, date, vehicleId) {
    const day = (schedule.days || {})[date] || {};
    const said = isPlainObject(day.vehicles) ? day.vehicles[vehicleId] : null;
    if (said && typeof said.out === 'boolean') return said.out === false;
    return Array.isArray(day.vehiclesOff) && day.vehiclesOff.indexOf(vehicleId) !== -1;
}

function setVehicleOut(schedule, date, vehicleId, out) {
    if (!schedule.days[date]) schedule.days[date] = { plan: {}, actual: {} };
    const day = schedule.days[date];

    const said = isPlainObject(day.vehicles) ? day.vehicles[vehicleId] : null;
    const legacy = Array.isArray(day.vehiclesOff) && day.vehiclesOff.indexOf(vehicleId) !== -1;
    const before = (said && said.out !== undefined) ? said.out !== false : !legacy;
    if (before === Boolean(out)) return { path: null };

    if (!isPlainObject(day.vehicles)) day.vehicles = {};
    day.vehicles[vehicleId] = { out: Boolean(out) };
    return { path: `days.${date}.vehicles.${vehicleId}`, value: { out: Boolean(out) } };
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

        row.netAmount = row.amount === null ? null : row.amount - row.advances;

        return row;
    });
}

// One worker, day by day, with the same arithmetic the pay sheet totals - because the
// question this answers is "why is my pay this number", and an answer computed a second
// way is not an answer.
function workerDaysReport(schedule, worker, fromDate, toDate) {
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

    return schedule.places.map(place => {
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
