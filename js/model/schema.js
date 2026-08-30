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
    vehicles: false
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
    vehicleProblems(raw).forEach(problem => problems.push(problem));
    return problems;
}

// The vehicles, checked BEFORE anything normalises them.
//
// This gate never mentioned them, so five different malformed shapes passed every
// restore door - and js/state.js then turned three of them into an EMPTY ARRAY. A
// subtree nobody could read became a subtree that said there were no vehicles, which is
// a different and much more confident statement, and it is the one that got written to
// the disk. Law 10 says nothing unreadable is deleted, overwritten or treated as empty;
// this is the door it was walking through.
//
// The asymmetry that gave it away: a duplicate WORKER id is refused outright, and a
// duplicate vehicle id was admitted. The feature is off - none of this is drawn or paid
// - but the bytes are somebody's record of a van, and the day the gate opens they are
// what the arithmetic runs on.
function vehicleProblems(raw) {
    if (raw.vehicles === undefined) return [];
    if (!Array.isArray(raw.vehicles)) return ['רשימת הרכבים ברישום אינה תקינה.'];

    const problems = [];
    const seen = new Set();
    raw.vehicles.forEach((item, at) => {
        if (!isPlainObject(item)) {
            problems.push('רכב ' + (at + 1) + ' ברישום אינו תקין.');
            return;
        }
        if (!isSafeId(item.id)) {
            problems.push('לרכב ' + (at + 1) + ' אין מזהה תקין.');
            return;
        }
        if (seen.has(String(item.id))) {
            problems.push('הרכב ' + item.id + ' רשום פעמיים.');
            return;
        }
        seen.add(String(item.id));
        if (item.name !== undefined && typeof item.name !== 'string') {
            problems.push('לרכב ' + item.id + ' יש שם שאינו טקסט.');
        }
        if (item.ownerId !== undefined && item.ownerId !== null && !isSafeId(item.ownerId)) {
            problems.push('הרכב ' + item.id + ' משויך לבעלים שאינו תקין.');
        }
        if (item.rates !== undefined) {
            if (!Array.isArray(item.rates)) {
                problems.push('היסטוריית המחירים של הרכב ' + item.id + ' אינה תקינה.');
            } else {
                item.rates.forEach(rate => {
                    if (!isPlainObject(rate)) {
                        problems.push('מחיר ברכב ' + item.id + ' אינו תקין.');
                    } else if (rate.amount !== undefined && !isFiniteNumber(rate.amount)) {
                        problems.push('מחיר ברכב ' + item.id + ' אינו מספר.');
                    }
                });
            }
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
    if (!Number.isSafeInteger(Math.round(amount * 100))) {
        return ['הסכום של המקדמה ' + id + ' אינו סכום שאפשר לחשב.'];
    }
    return [];
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
        problems.push(...advanceAmountProblems(id, item.amount));
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
// Two vehicle records, compared by their content and not by their identity.
//
// schema.js is the pure layer and loads BEFORE js/sync/sync.js, so it cannot borrow that
// file's canonicalJson: at call time the global happens to be there, and one day the
// script order moves and this silently starts comparing undefined to undefined - which
// answers "the same" for every pair, and quietly drops one of the two records.
function stableJson(value) {
    if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
    if (isPlainObject(value)) {
        return '{' + Object.keys(value).sort()
            .map(key => JSON.stringify(key) + ':' + stableJson(value[key]))
            .join(',') + '}';
    }
    return JSON.stringify(value === undefined ? null : value);
}

// A record's held disagreements are not part of what the record SAYS about its van, so
// they are left out of the comparison. Without this, a record that has already absorbed
// one conflict never again looks equal to the plain record it came from, and the pair
// re-merges forever.
function stripConflict(item) {
    if (!isPlainObject(item)) return item;
    const copy = Object.assign({}, item);
    delete copy.conflict;
    return copy;
}

function sameRecord(a, b) {
    return stableJson(stripConflict(a)) === stableJson(stripConflict(b));
}

function mergeVehiclesInto(target, source) {
    if (!target || !source) return target;
    const held = Array.isArray(source.vehicles) ? source.vehicles : [];
    if (held.length === 0) return target;

    const merged = Array.isArray(target.vehicles) ? target.vehicles.slice() : [];
    const byId = new Map(merged.filter(item => item && item.id)
        .map((item, at) => [String(item.id), at]));

    held.forEach(item => {
        if (!item || !item.id) return;
        const id = String(item.id);
        if (!byId.has(id)) {
            byId.set(id, merged.push(item) - 1);
            return;
        }

        // ONE ID, TWO DIFFERENT RECORDS. This used to skip the local copy silently, and
        // at the call site the target is the REMOTE snapshot - so name, ownerId, plate,
        // every unknown field and the WHOLE RATE HISTORY went together, on a comment that
        // called it "an ordinary field merge". It is a record merge, and a dropped rate
        // stamp is iron law 2 read from the vehicle side: a day keeps the rate it was
        // worked at, and the history is where that rate lives.
        //
        // Vehicle ids are still "one past the highest" - the pre-v79 scheme newEntityId's
        // own comment calls a pay-sheet bug - so two phones offline on the same evening
        // really do mint the same id for two different vans. Choosing between them is
        // choosing which van somebody is paid for.
        //
        // Neither is chosen. Both are kept: the difference is written onto the record
        // that survives, so whoever eventually looks has the other one rather than a
        // guess, and nothing anywhere can call this settled.
        const at = byId.get(id);
        const theirs = merged[at];
        if (sameRecord(theirs, item)) return;

        // `item` is THIS DEVICE'S record and `theirs` is the arriving one - the call site
        // merges the previous local schedule INTO the remote snapshot, so the array being
        // built started life as the remote's. The local copy is kept as the record, not
        // because it is more likely to be right but because it is the one this device can
        // still be asked about: the other phone still has its own, and nothing here has
        // to guess which van somebody was paid for.
        //
        // The rate history is UNIONED rather than chosen. Rates are append-only - a day
        // keeps the rate it was worked at - so two histories of one vehicle are two
        // halves of one record, and dropping either restates a period that was already
        // settled. Same stamp on both sides keeps this device's amount and the
        // disagreement is on the record beside it.
        const stamps = new Map();
        (Array.isArray(theirs.rates) ? theirs.rates : []).forEach(rate => {
            if (isPlainObject(rate) && rate.from !== undefined) stamps.set(String(rate.from), rate);
        });
        (Array.isArray(item.rates) ? item.rates : []).forEach(rate => {
            if (isPlainObject(rate) && rate.from !== undefined) stamps.set(String(rate.from), rate);
        });
        const rates = Array.from(stamps.keys()).sort().map(from => stamps.get(from));

        // Held disagreements are a SET, not a log. receive() runs on every snapshot, and
        // the same two records meet again on every one of them; appending each time would
        // grow one van's record without bound until the document stopped fitting. A
        // record already held is already the evidence - it is not more true twice.
        const before = (Array.isArray(item.conflict) ? item.conflict : [])
            .filter(isPlainObject);
        const kept = before.some(other => sameRecord(other, theirs))
            ? before
            : before.concat([stripConflict(theirs)]);
        merged[at] = Object.assign({}, item, { rates, conflict: kept });
    });

    target.vehicles = merged;
    return target;
}

// Is any vehicle on this record holding a disagreement nobody has settled?
function vehicleConflicts(schedule) {
    return ((schedule && schedule.vehicles) || [])
        .filter(item => item && Array.isArray(item.conflict) && item.conflict.length > 0);
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
