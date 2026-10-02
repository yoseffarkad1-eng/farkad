// Local calendar date as YYYY-MM-DD. Never use toISOString() for this: it converts to
// UTC first, so east of Greenwich every date between midnight and the UTC offset comes
// out one day early.
function toLocalDateStr(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Week starts are anchored at local noon, not midnight, so that adding days across a
// DST change can never land on an hour that does not exist.
function parseLocalDate(value) {
    if (!value) return null;

    // A bare YYYY-MM-DD is parsed as UTC by the Date constructor, so build it from its
    // components instead. Anything else (an ISO timestamp from an older save) is parsed
    // normally and then pinned to local noon.
    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (parts) {
        return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]), 12, 0, 0, 0);
    }

    // Everything that reaches the constructor must already be date-SHAPED. It is forgiving
    // to the point of danger otherwise: new Date('שבוע 32') is the first of January 2032,
    // so a hand-typed week label in an old save would move a whole week of work six years
    // into the future, where no report would ever show it again. A null is caught and
    // reported; a wrong date is not.
    if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return null;

    const date = new Date(value);
    if (isNaN(date)) return null;
    date.setHours(12, 0, 0, 0);
    return date;
}

// The FRIDAY of the week containing `date`. The working week runs Friday to Thursday:
// Friday opens it, Saturday rests, and the account below is two of these laid end to
// end. Every week start goes through here, so the grid can never open on a mid-week
// date.
function snapToWeekStart(date) {
    const start = new Date(date);
    // getDay(): Friday is 5. Distance back to the most recent Friday.
    start.setDate(date.getDate() - ((date.getDay() + 2) % 7));
    start.setHours(12, 0, 0, 0);
    return start;
}

// A pay account is FOURTEEN days, Friday through Thursday twice - twelve of them
// worked, with the Saturdays resting. WHICH Friday opens an account is a fact about
// the business, not the calendar, so it is anchored to one account start named by the
// owner; every other account sits a whole number of fortnights from it.
const ACCOUNT_ANCHOR = '2026-08-07';

// The Friday that opened the account containing `date`.
function accountStart(date) {
    const anchor = parseLocalDate(ACCOUNT_ANCHOR);
    // Both dates are pinned to local noon, so the difference is a whole number of days
    // give or take a DST hour - which the rounding absorbs.
    const days = Math.round((date - anchor) / 86400000);
    const into = ((days % 14) + 14) % 14;
    const start = new Date(date);
    start.setDate(date.getDate() - into);
    start.setHours(12, 0, 0, 0);
    return start;
}

// ---------------------------------------------------------------- one man's own period
//
// WHO IS PAID WHEN IS A FACT ABOUT THE MAN, NOT ABOUT THE CALENDAR.
//
// Four of the crew are settled every Thursday; the rest every second Thursday. Both weeks
// run Friday through Thursday - the same seam snapToWeekStart has always cut on - so a
// weekly period is exactly half a fortnight and never straddles one. That is what lets
// the two cycles share one ledger: no week contains a day from two different fortnights,
// so a day belongs to exactly one period whichever cycle pays the man.
//
// IT IS A HISTORY, NOT A SETTING. This was first written as a pair of fields holding the
// CURRENT cycle and the Friday it started, and that shape is wrong in three ways that all
// cost money:
//
//   1. It cannot say what governed a past day. Save "biweekly from 25 September" over
//      "weekly from 11 September" and the 16th of September - a day already worked, and
//      possibly already paid - silently stops being settled by the week it was settled by.
//      Measured: 09-11..09-17 became 09-04..09-17 with nothing said.
//   2. A closure written over a weekly period could not be validated later, because by
//      then the only record of that period's shape was gone.
//   3. Two fields are two wire paths. Phone A choosing (weekly, 25 Sep) and phone B
//      choosing (biweekly, 11 Sep) merged field by field into (biweekly, 25 Sep) - a
//      setting NEITHER phone ever chose, on both phones, both saying synced, with nothing
//      held for anybody to decide. Measured, through the real sync layer.
//
// So the record is the ordered list of boundaries, in ONE field, as one canonical string:
//
//      2026-09-11=weekly;2026-09-25=biweekly
//
// One field is one wire path: two phones writing different histories contest it and a
// person decides, which is what a disagreement about somebody's pay deserves. A string
// because an entity field may not be a container - see entityFieldProblems - and because
// a canonical spelling is a thing two devices can compare for equality.
const PAY_CYCLES = ['weekly', 'biweekly'];
const DEFAULT_PAY_CYCLE = 'biweekly';

function isPayCycle(value) {
    return PAY_CYCLES.indexOf(value) !== -1;
}

// Is this date string the Friday a period may open on?
//
// Asked of every boundary, because both cycles cut on a Friday: a change starting on a
// Wednesday would leave that week's Friday to Tuesday inside the old period and Wednesday
// to Thursday inside the new one - the same day counted twice or not at all depending on
// which reader you ask.
function isWeekStart(value) {
    if (typeof value !== 'string' || !value) return false;
    const day = parseLocalDate(value);
    if (!day || isNaN(day.getTime())) return false;
    return toLocalDateStr(snapToWeekStart(day)) === value;
}

// The history, parsed. Null - not an empty list - when the text is anything this reader
// does not fully understand.
//
// Null is the difference between "this man has no history" and "this man has a history I
// cannot read", and the two must never be confused: the first is settled fortnightly, the
// second is a record somebody wrote that this build cannot honour, and a caller that
// wants to refuse rather than guess needs to be able to tell them apart. Readers that
// only want to price a day treat both as the default; the validator does not.
function parsePayCycles(text) {
    if (text === undefined || text === null || text === '') return [];
    if (typeof text !== 'string') return null;

    const out = [];
    const parts = text.split(';');
    for (let i = 0; i < parts.length; i += 1) {
        const piece = parts[i];
        if (piece === '') return null;
        const at = piece.indexOf('=');
        if (at === -1) return null;
        const from = piece.slice(0, at);
        const cycle = piece.slice(at + 1);
        if (!isWeekStart(from) || !isPayCycle(cycle)) return null;
        // Strictly increasing. Two boundaries on one Friday is two answers to one
        // question, and an out-of-order list would make "the last one that applies"
        // depend on how somebody happened to type it.
        if (out.length > 0 && from <= out[out.length - 1].from) return null;
        out.push({ from, cycle });
    }
    return out;
}

// The canonical spelling of a history. Two devices that agree write identical bytes.
function formatPayCycles(entries) {
    if (!Array.isArray(entries) || entries.length === 0) return '';
    return entries.slice()
        .sort((a, b) => (a.from < b.from ? -1 : (a.from > b.from ? 1 : 0)))
        .map(entry => `${entry.from}=${entry.cycle}`)
        .join(';');
}

// The history a worker record carries, whatever shape it arrived in.
//
// The legacy pair is read and folded into a one-entry history: v113 wrote payCycle and
// payCycleFrom, that build was never merged or served, but a bundle of it exists and a
// record written by it must not be read as "no cycle at all" - that would settle a weekly
// man fortnightly and silently.
function payCycleHistory(worker) {
    if (!worker) return [];
    const parsed = parsePayCycles(worker.payCycles);
    if (parsed === null) return null;
    if (parsed.length > 0) return parsed;

    const legacyCycle = worker.payCycle;
    const legacyFrom = worker.payCycleFrom;
    if (isPayCycle(legacyCycle) && isWeekStart(legacyFrom)) {
        return [{ from: String(legacyFrom), cycle: String(legacyCycle) }];
    }
    return [];
}

// WHICH CYCLE GOVERNED `date` - the last boundary at or before it.
//
// A day before the first boundary is settled the way everybody was settled before any of
// this existed. That is what makes a record written last month open cut exactly the way
// it was cut when it was written, and it is why the default is never inferred from the
// man's newest setting.
function payCycleAt(worker, date) {
    const history = payCycleHistory(worker);
    if (!history || history.length === 0) return DEFAULT_PAY_CYCLE;
    const at = typeof date === 'string' ? date : toLocalDateStr(date);
    let cycle = DEFAULT_PAY_CYCLE;
    for (let i = 0; i < history.length; i += 1) {
        if (history[i].from <= at) cycle = history[i].cycle; else break;
    }
    return cycle;
}

// Every boundary strictly inside (from, to] - the days a period would be cut at.
function boundariesWithin(worker, from, to) {
    const history = payCycleHistory(worker);
    if (!history) return [];
    return history.filter(entry => entry.from > from && entry.from <= to)
        .map(entry => entry.from);
}

// The period containing `date` for this man: { from, to, cycle, transition }.
//
// `transition` marks a period a boundary cut short. A man who changes cycle on the second
// Friday of a fortnight has a seven-day stub behind him - days worked under the old cycle
// that nobody has settled - and it is reported as its own period rather than folded into
// either neighbour. Folding it forward would pay those days inside a week they do not
// belong to; folding it back would reopen a period that may already be closed.
function periodRangeFor(worker, date) {
    const day = typeof date === 'string' ? parseLocalDate(date) : date;
    const at = toLocalDateStr(day);
    const cycle = payCycleAt(worker, at);
    const from = cycle === 'weekly' ? snapToWeekStart(day) : accountStart(day);
    const last = new Date(from);
    last.setDate(from.getDate() + (cycle === 'weekly' ? 6 : 13));
    last.setHours(12, 0, 0, 0);

    const range = {
        cycle,
        from: toLocalDateStr(from),
        to: toLocalDateStr(last),
        transition: false
    };

    // Intersect the calendar period with the history segment containing this day.
    // Returning to fortnightly on its second Friday starts a short first period
    // THERE, not in the week just paid. Only a boundary AFTER the queried day
    // may cut the end. Otherwise nextPeriodFor returns its own predecessor and
    // the advance walk silently drops the last week's deduction.
    const cutting = boundariesWithin(worker, range.from, range.to);
    cutting.forEach(boundary => {
        if (boundary <= at) {
            range.from = boundary;
            range.transition = true;
        } else if (boundary <= range.to) {
            const before = parseLocalDate(boundary);
            before.setDate(before.getDate() - 1);
            range.to = toLocalDateStr(before);
            range.transition = true;
        }
    });
    return range;
}

// The period AFTER this one for the same man - where an advance this period could not
// settle is carried to. Derived by stepping one day past the end and asking again, so a
// carry lands in whatever cycle actually governs the next day, including across a
// boundary. Nothing here assumes the next period is the same length as this one.
function nextPeriodFor(worker, date) {
    const here = periodRangeFor(worker, date);
    const after = parseLocalDate(here.to);
    after.setDate(after.getDate() + 1);
    return periodRangeFor(worker, after);
}

// Is [from, to] a period this man is actually settled over?
//
// The question a closure has to pass. It is asked of the history, so a weekly period
// closed in September stays valid after he moves back to fortnightly in October - the
// boundary that governed it is still on the record, which is the whole reason the record
// is a history.
function isPeriodFor(worker, from, to) {
    if (typeof from !== 'string' || typeof to !== 'string') return false;
    const range = periodRangeFor(worker, from);
    return range.from === from && range.to === to;
}

function formatShortDate(date) {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${day}/${month}`;
}

// Cell values from v1 that meant "not a work day". 'יום עטלה' is a legacy misspelling
// kept here so schedules saved before the label was corrected still migrate as absences.
const VACATION_VALUES = ['חופש', 'יום עטלה'];

function isVacationValue(value) {
    return VACATION_VALUES.includes(value);
}
