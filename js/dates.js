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
