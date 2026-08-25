// v1 -> v2 migration.
//
// The one rule here: NEVER GUESS. The manager confirmed there is no consistent separator
// between two site names written into a single cell - sometimes a plus, sometimes a
// comma, sometimes nothing. A migration that split on a best guess would silently
// misattribute work days, and those days become someone's pay.
//
// So anything that does not resolve to exactly one known place is reported as an issue
// for a human to decide, and the original text is preserved untouched until they do.

const MIGRATION_SEPARATORS = ['+', '/', ',', '،', '&', '-', '|'];

function slugId(prefix, index) {
    return `${prefix}_${String(index + 1).padStart(2, '0')}`;
}

// Stable ids for the roster. Order is preserved so the migrated board looks identical.
function migrateWorkers(v1Workers) {
    return (v1Workers || []).map((worker, index) => ({
        id: slugId('w', index),
        name: (typeof worker === 'string' ? worker : (worker && worker.name) || '').trim(),
        idNumber: typeof worker === 'string' ? '' : (worker && worker.id) || '',
        phone: typeof worker === 'string' ? '' : (worker && worker.phone) || '',
        active: true
    }));
}

function migratePlaces(v1Places) {
    return (v1Places || []).map((place, index) => ({
        id: slugId('p', index),
        // Trimmed: cell values are compared trimmed, so a place stored as "הרצליה " would
        // otherwise match nothing and turn every one of its days into an open question.
        name: (typeof place === 'string' ? place : (place && place.name) || '').trim(),
        active: true
    }));
}

// Offers a split only when EVERY part matches a known place exactly. A suggestion is
// still only a suggestion - it is attached to the issue and never applied on its own.
function suggestSplit(value, placesByName) {
    for (const separator of MIGRATION_SEPARATORS) {
        if (!value.includes(separator)) continue;

        const parts = value.split(separator).map(part => part.trim()).filter(Boolean);
        if (parts.length < 2) continue;

        const ids = parts.map(part => placesByName.get(part));
        if (ids.every(Boolean)) {
            return { separator, parts, placeIds: ids };
        }
    }
    return null;
}

function addDays(dateStr, days) {
    const base = parseLocalDate(dateStr);
    if (!base) return null;
    base.setDate(base.getDate() + days);
    return toLocalDateStr(base);
}

// v1 recorded assignments as flat cell indices into a 7-column grid, so the worker and
// the day are recovered arithmetically. weekStartDate is the only thing anchoring them
// to real dates; without it nothing can be placed in time.
function migrateV1(v1) {
    const issues = [];
    const schedule = emptySchedule();

    schedule.workers = migrateWorkers(v1 && v1.workers);
    schedule.places = migratePlaces(v1 && v1.places);

    // A name resolves to a place only while exactly ONE place carries it.
    //
    // The duplicate used to be reported and then ignored: the first place to claim the
    // name kept it, so every cell reading "הרצליה" was attached to whichever of the two
    // happened to be listed first. That is a guess, made silently, about which client is
    // invoiced for somebody's day - and the whole point of this file is that it does not
    // guess. An ambiguous name is removed from the map, so every cell using it becomes a
    // question for a person instead.
    const placesByName = new Map();
    const ambiguous = new Set();

    schedule.places.forEach(place => {
        if (ambiguous.has(place.name)) return;

        if (placesByName.has(place.name)) {
            placesByName.delete(place.name);
            ambiguous.add(place.name);
            issues.push({
                kind: 'duplicate-place-name',
                value: place.name,
                message: `שני אתרים בשם "${place.name}" - הימים שנרשמו בשם הזה לא שויכו ` +
                    'לאף אחד מהם, ומחכים להחלטה.'
            });
        } else {
            placesByName.set(place.name, place.id);
        }
    });

    // parseLocalDate returns null for anything that is not a date - a v1 save with a
    // hand-typed "שבוע 32" in this field used to throw here, and the throw escaped every
    // issue-reporting path below to leave the app blank with no message at all. A null
    // lands in the no-week-date branch, which says so properly.
    const parsedWeekStart = v1 && v1.weekStartDate ? parseLocalDate(v1.weekStartDate) : null;
    const weekStart = parsedWeekStart ? toLocalDateStr(parsedWeekStart) : null;
    const assignments = (v1 && Array.isArray(v1.assignments)) ? v1.assignments : [];

    if (!weekStart && assignments.length > 0) {
        issues.push({
            kind: 'no-week-date',
            message: 'לא נשמר תאריך שבוע, ולכן לא ניתן לשייך את ההקצאות לימים.'
        });
        return { schedule, issues };
    }

    assignments.forEach(assignment => {
        const index = assignment && assignment.index;
        const value = assignment && typeof assignment.value === 'string'
            ? assignment.value.trim()
            : '';

        // A cell with something written in it but no usable position is the one case
        // where "skip it" loses work without saying so. An empty cell is genuinely
        // nothing and is passed over.
        if (typeof index !== 'number' || index < 0) {
            if (value) {
                issues.push({
                    kind: 'unreadable-cell',
                    value,
                    message: `"${value}" נשמר בלי מיקום תקין, ולכן לא ניתן לשייך אותו לעובד או ליום.`
                });
            }
            return;
        }
        if (!value) return;

        const workerIndex = Math.floor(index / 7);
        const dayOffset = index % 7;
        const worker = schedule.workers[workerIndex];

        if (!worker) {
            issues.push({
                kind: 'index-out-of-range',
                index,
                value,
                message: `הקצאה במיקום ${index} אינה מתאימה לאף עובד ברשימה.`
            });
            return;
        }

        const date = addDays(weekStart, dayOffset);
        if (!date) return;

        const isHoliday = typeof assignment.holiday === 'boolean'
            ? assignment.holiday
            : isVacationValue(value);

        if (isHoliday) {
            markAbsent(schedule, date, worker.id, 'actual');
            return;
        }

        const placeId = placesByName.get(value);
        if (placeId) {
            assignPlace(schedule, date, worker.id, 'actual', placeId, RATE_NORMAL);
            return;
        }

        // Unresolved. Recorded, never guessed at.
        issues.push({
            kind: 'unknown-place',
            index,
            value,
            date,
            workerId: worker.id,
            workerName: worker.name,
            suggestion: suggestSplit(value, placesByName),
            message: ambiguous.has(value)
                ? `"${value}" הוא שם של יותר מאתר אחד - יש לבחור ידנית לאיזה מהם שייך היום.`
                : `"${value}" אינו שם של מקום קיים - יש להחליט ידנית.`
        });
    });

    schedule.updatedAt = (v1 && v1.updatedAt) || null;
    schedule.updatedBy = (v1 && v1.updatedBy) || null;

    return { schedule, issues };
}

// Applies one human decision about an unresolved cell. Called only after the person has
// looked at the issue and chosen; nothing here happens automatically.
//
// Returns the field changes it made, so the caller can send them - a decision taken here
// is a work day appearing in the record, and it has to reach the other two people like
// any other edit rather than living on whichever phone happened to answer the question.
function resolveIssue(schedule, issue, placeIds) {
    if (!issue || issue.kind !== 'unknown-place') return [];

    const valid = (placeIds || []).filter(id => schedule.places.some(place => place.id === id));
    if (valid.length === 0) return [];

    return valid.map(placeId =>
        assignPlace(schedule, issue.date, issue.workerId, 'actual', placeId, RATE_NORMAL));
}

// Counts that must match before and after, so a migration cannot quietly lose work.
function migrationTally(schedule) {
    let workDays = 0;
    let absences = 0;
    let entries = 0;

    Object.keys(schedule.days || {}).forEach(date => {
        schedule.workers.forEach(worker => {
            if (isAbsent(schedule, date, worker.id, 'actual')) {
                absences++;
                return;
            }
            const list = entriesFor(schedule, date, worker.id, 'actual');
            if (list.length > 0) {
                workDays++;
                entries += list.length;
            }
        });
    });

    return { workDays, absences, entries };
}
