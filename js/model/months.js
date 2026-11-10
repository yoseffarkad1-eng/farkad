// ---------------------------------------------------------------- months that have left (Phase 6)
//
// A closed MONTH of days leaves the server's live document and stays in a document of
// its own.
//
// WHY. The schedule is one Firestore document, Firestore refuses one over a mebibyte, and
// once settled closures leave it (Phase 5) the days are what fills it: about two years for
// twenty men, after which every write on all three phones is refused
// (docs/payroll-closure.md, Phase 6).
//
// THE ONE INVARIANT, and it is Phase 5's: a phone's own record never has a hole.
//
//   the server's live document     the days of every month that has NOT left, and
//                                  `monthIndex` - one row per month that has, and the
//                                  calendar dates of those months
//   the server's month documents   schedules/{doc}/months/{YYYY-MM}_{digest}: one month's
//                                  days, verbatim, create-once
//   a phone's record               EVERY day at the path it was written at, and the index
//                                  exactly as the server holds it
//
// So nothing in this app reads the index to answer a question about work or money. The
// reports, the week, the exports and the pay sheet read `days` as they always have. The
// index is read at the boundary only: which month documents make the live document whole
// (monthsWhole, on the way in), which days a whole-document write leaves out
// (monthsStripCovered, on the way out), and which days may no longer be edited
// (monthArchivedPath).
//
// WHAT THIS FILE MUST NEVER DO:
//   - rebuild a day. A day moves as the bytes it is: every layer, every rate stamp, the
//     Rima count, and any layer this build has never heard of;
//   - call a month whole on the strength of a count. The digest is asked every time;
//   - treat a row it cannot read as a row that names nothing. For a closure that was
//     right (the entries are still found by other roads); for a month it would be a hole
//     of thirty days with nothing to say so. An unreadable row is `broken`, and held.
//
// Pure: no DOM, no storage, no clock, no network. SHIPPED SHUT - FARKAD_FLAGS.months is
// false, planMonths answers `gate`, and nothing calls the move.

const MONTH_INDEX_VERSION = 1;

// How long after the later of a month's last closure and its last day it may leave. Six
// calendar months: the default the owner was told on 2026-11-10.
const MONTHS_ARCHIVE_AFTER_MONTHS = 6;

// One month document must be one Firestore document. Twenty men for a month is about
// 34 KB; this is the size at which the plan says so instead of the server.
const MONTH_DOCUMENT_LIMIT_BYTES = 900000;

const MONTH_ROW_FIELDS = ['d', 'h', 'n', 'b', 'at'];
const MONTH_DOCUMENT_FIELDS = ['v', 'month', 'digest', 'n', 'dates', 'days', 'opId', 'revision'];

// ---------------------------------------------------------------- the words (PROPOSED)
//
// Hebrew strings are product decisions (CLAUDE.md, law 6). Every one of these is proposed,
// not approved; each is pinned word for word in tests/months.test.mjs and listed in
// docs/payroll-closure.md, Hebrew in Phase 6.
const MONTH_TEXT = {
    refusedTitle: 'החודש הזה בארכיון',
    refused: 'החודש הזה נסגר לכל העובדים והועבר לארכיון, ולכן אי אפשר לשנות בו ימים. '
        + 'הרישום לא שונה ודבר לא נשמר. לתיקון שכר של תקופה סגורה רושמים התאמה בחשבון העובד.',
    heldArchived: 'השינוי הזה נרשם במכשיר לפני שנודע לו שהחודש הועבר לארכיון. הוא לא נשלח '
        + 'ולא יישלח. מה שמופיע בארכיון הוא הרישום הקובע.',
    planTitle: 'העברת חודשים סגורים לארכיון - בדיקה בלבד, דבר לא הועבר',
    planSize: 'גודל הרישום בשרת עכשיו: {now} ק״ב מתוך 1,024. אחרי העברת החודשים המוכנים: {after} ק״ב.',
    planNothing: 'אין חודש שמוכן להעברה.',
    archived: 'בארכיון',
    ready: 'מוכן להעברה',
    waiting: 'סגור לכולם; יוכל לעבור החל מ-{date}',
    current: 'החודש עוד לא הסתיים',
    open: 'יש ימים שעוד לא נסגר עליהם חשבון: {names}',
    beforeOpening: 'יש בו ימים מלפני תחילת המעקב, ולא נסגר עליהם חשבון: {names}',
    unsettled: 'יש חשבון סגור שעוד לא הוסדר: {names}',
    unreadable: 'יש בו יום שאי אפשר לקרוא. הוא נשאר במקומו',
    tooLarge: 'החודש גדול מדי למסמך אחד. הוא נשאר במקומו',
    days: '{n} ימים',
    waitingForMonths: 'המכשיר עוד לא קיבל מהשרת את הימים של חודש שהועבר לארכיון, ולכן לא עדכן את הרישום. '
        + 'הוא ינסה שוב כשיהיה קליטה. עד אז מוצג הרישום שהיה במכשיר.'
};

// Does this BUILD move months? Both gates: a month is eligible only through closed and
// settled accounts, which only the pay book writes.
function monthWritesEnabled() {
    return typeof FARKAD_FLAGS !== 'undefined' && FARKAD_FLAGS.months === true
        && FARKAD_FLAGS.paybook === true;
}

function isMonthKey(value) {
    return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function isDayKey(value) {
    return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value);
}

// 'YYYY-MM' of a day, or null for anything that is not a day.
function monthOf(date) {
    return isDayKey(date) ? date.slice(0, 7) : null;
}

function monthLength(month) {
    const year = Number(month.slice(0, 4));
    const index = Number(month.slice(5, 7));
    return new Date(Date.UTC(year, index, 0)).getUTCDate();
}

// Every calendar date of a month, worked or not: what the server refuses writes to.
function monthCalendar(month) {
    const out = [];
    const length = monthLength(month);
    for (let day = 1; day <= length; day += 1) out.push(`${month}-${day < 10 ? '0' : ''}${day}`);
    return out;
}

// A day, `count` calendar months later; the 31st lands on the last day of a shorter month.
function monthStepDay(date, count) {
    const total = Number(date.slice(0, 4)) * 12 + (Number(date.slice(5, 7)) - 1) + count;
    const year = Math.floor(total / 12);
    const index = total - year * 12 + 1;
    const month = `${String(year).padStart(4, '0')}-${index < 10 ? '0' : ''}${index}`;
    const day = Math.min(Number(date.slice(8, 10)), monthLength(month));
    return `${month}-${day < 10 ? '0' : ''}${day}`;
}

// One way of writing a value down, whatever order its keys arrived in: Firestore hands a
// map back in its own order, and a digest of the bytes as they came would call the same
// month two different months.
function monthCanonical(value) {
    if (Array.isArray(value)) return '[' + value.map(monthCanonical).join(',') + ']';
    if (value && typeof value === 'object') {
        return '{' + Object.keys(value).filter(key => value[key] !== undefined).sort()
            .map(key => JSON.stringify(key) + ':' + monthCanonical(value[key])).join(',') + '}';
    }
    return JSON.stringify(value === undefined ? null : value);
}

// Two 32-bit walks over the text, sixteen hex digits. Not a secret and not a signature:
// it tells one month's days from another's, and from the same month after one edit.
function monthHash(text) {
    let a = 0x811c9dc5;
    let b = 0x01000193;
    for (let i = 0; i < text.length; i += 1) {
        const code = text.charCodeAt(i);
        a = Math.imul(a ^ code, 16777619) | 0;
        b = (Math.imul(b, 31) + code + (a & 0xff)) | 0;
    }
    return ('0000000' + (a >>> 0).toString(16)).slice(-8) + ('0000000' + (b >>> 0).toString(16)).slice(-8);
}

// The digest of one month's days. Asked on every snapshot of every archived month, so it
// is remembered by the month's own bytes as JSON.stringify writes them (cheap, and exact:
// the same string is the same days). Bounded by what it holds, not by how many.
const MONTH_DIGEST_MEMO = { held: new Map(), chars: 0 };
const MONTH_DIGEST_MEMO_CHARS = 8000000;

function monthDigest(days) {
    const raw = JSON.stringify(days);
    const known = MONTH_DIGEST_MEMO.held.get(raw);
    if (known !== undefined) return known;
    const digest = monthHash(monthCanonical(days));
    if (MONTH_DIGEST_MEMO.chars + raw.length > MONTH_DIGEST_MEMO_CHARS) {
        MONTH_DIGEST_MEMO.held.clear();
        MONTH_DIGEST_MEMO.chars = 0;
    }
    MONTH_DIGEST_MEMO.held.set(raw, digest);
    MONTH_DIGEST_MEMO.chars += raw.length;
    return digest;
}

function monthClone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function monthOwns(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
}

function monthIsRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// The days of one month in a record, as they lie: { date: day }. The values are the
// record's own objects - a caller that keeps them clones them.
function monthDaysOf(schedule, month) {
    const out = {};
    const days = schedule && monthIsRecord(schedule.days) ? schedule.days : {};
    Object.keys(days).forEach(date => {
        if (monthOf(date) === month && monthOwns(days, date)) out[date] = days[date];
    });
    return out;
}

function monthDocumentId(month, digest) {
    return `${month}_${digest}`;
}

// The month document, exactly as it is created: the days verbatim, the digest they have,
// the calendar the server will refuse writes to, and the operation and revision that
// created it (what the rules bind it to its schedule write by).
function monthDocument(month, days, opId, revision) {
    const held = monthClone(days);
    return { v: 1, month, digest: monthDigest(held), n: Object.keys(held).length,
        dates: monthCalendar(month), days: held, opId, revision };
}

// Everything wrong with a month document as fetched. Empty means it is one this build
// could have written and it holds what it says it holds.
function monthDocumentProblems(id, doc) {
    if (!monthIsRecord(doc)) return ['a month document that is not a record'];
    const out = [];
    Object.keys(doc).forEach(key => {
        if (MONTH_DOCUMENT_FIELDS.indexOf(key) === -1) out.push(`a month document with a field this build does not write (${key.slice(0, 20)})`);
    });
    if (doc.v !== 1) out.push('a month document of a version this build does not read');
    if (!isMonthKey(doc.month)) return out.concat(['a month document of no month']);
    if (!monthIsRecord(doc.days)) return out.concat(['a month document with no days']);
    const dates = Object.keys(doc.days);
    if (dates.length === 0) out.push('a month document that holds no day');
    if (dates.some(date => monthOf(date) !== doc.month)) out.push('a month document holding a day of another month');
    if (doc.n !== dates.length) out.push('a month document that miscounts its days');
    if (!Array.isArray(doc.dates) || monthCanonical(doc.dates) !== monthCanonical(monthCalendar(doc.month))) {
        out.push('a month document whose calendar is not its month\'s');
    }
    if (typeof doc.digest !== 'string' || doc.digest !== monthDigest(doc.days)) {
        out.push('a month document whose days are not the days it was made from');
    }
    if (out.length === 0 && String(id) !== monthDocumentId(doc.month, doc.digest)) {
        out.push('a month document filed under another name');
    }
    return out;
}

// Everything wrong with one stored row. A row is the only thing in the live document that
// says a month's days exist at all.
function monthRowProblems(month, row) {
    if (!isMonthKey(month)) return ['a row filed under something that is not a month'];
    if (!monthIsRecord(row)) return ['a row that is not a record'];
    const out = [];
    Object.keys(row).forEach(key => {
        if (MONTH_ROW_FIELDS.indexOf(key) === -1) out.push(`a row with a field this build does not write (${key.slice(0, 20)})`);
    });
    if (typeof row.h !== 'string' || !/^[0-9a-f]{16}$/.test(row.h)) out.push('a row with no digest');
    if (row.d !== monthDocumentId(month, row.h)) out.push('a row that names another document');
    if (!Number.isInteger(row.n) || row.n < 1 || row.n > 31) out.push('a row that counts no days');
    if (row.b !== undefined && !(Number.isInteger(row.b) && row.b >= 0)) out.push('a row whose size is not a number');
    if (row.at !== undefined && typeof row.at !== 'string') out.push('a row archived at no moment');
    return out;
}

// The row the drop writes: which document, its digest, how many days, how many bytes left.
function monthRow(month, days, at) {
    const digest = monthDigest(days);
    return { d: monthDocumentId(month, digest), h: digest, n: Object.keys(days).length,
        b: JSON.stringify(days).length, at };
}

// The index as this build reads it. `months` is EVERY month the index names, readable or
// not: a month whose row cannot be read has still left.
function monthStoredIndex(schedule) {
    const held = schedule && monthIsRecord(schedule.monthIndex) ? schedule.monthIndex : {};
    const stored = monthIsRecord(held.rows) ? held.rows : {};
    const rows = {};
    const unreadable = [];
    Object.keys(stored).sort().forEach(month => {
        if (!monthOwns(stored, month)) return;
        if (monthRowProblems(month, stored[month]).length === 0) rows[month] = stored[month];
        else unreadable.push(month);
    });
    const dates = Array.isArray(held.dates) ? held.dates.filter(isDayKey) : [];
    const months = Object.keys(rows).concat(unreadable);
    dates.forEach(date => { if (months.indexOf(date.slice(0, 7)) === -1) months.push(date.slice(0, 7)); });
    return { rows, unreadable, dates, months: months.sort(), any: months.length > 0 };
}

// Has this day left the live document? Asked of the record a phone holds, before an edit.
function monthArchivedDate(schedule, date) {
    const month = monthOf(date);
    if (month === null) return false;
    const held = schedule && monthIsRecord(schedule.monthIndex) ? schedule.monthIndex : null;
    if (!held) return false;
    if (monthIsRecord(held.rows) && monthOwns(held.rows, month)) return true;
    return Array.isArray(held.dates) && held.dates.indexOf(date) !== -1;
}

// The same, of a field path: days.<date> and anything under it.
function monthArchivedPath(schedule, path) {
    const parts = String(path).split('.');
    return parts[0] === 'days' && parts.length >= 2 && monthArchivedDate(schedule, parts[1]);
}

// monthsWhole(document, locals, fetched) -> { document, missing, broken, laid }
//
// The server's live document made whole: for every row of its month index, that month's
// days put back - from one of `locals` (this phone's own record, then the last server
// document it adopted) when the days it holds have the row's digest, and from `fetched`
// ({ documentId: month document }) when none does.
//
//   missing   month documents that have to be fetched before this can be whole
//   broken    'month:<YYYY-MM>' for a row nothing can make whole: one this build cannot
//             read, or a month the live document still holds a day of. Said, never
//             papered over - a hole of thirty days would be on every report
//   laid      how many days were put back
//
// `document` is returned AS IT CAME - the same object - when the index names nothing,
// which is every document there has ever been until the first month leaves.
function monthsWhole(document, locals, fetched) {
    const index = monthStoredIndex(document);
    if (!index.any) return { document, missing: [], broken: [], laid: 0 };
    const out = Object.assign({}, document);
    out.days = Object.assign({}, monthIsRecord(document.days) ? document.days : {});
    const sources = (Array.isArray(locals) ? locals : [locals]).filter(monthIsRecord);
    const have = monthIsRecord(fetched) ? fetched : {};
    const missing = [];
    const broken = [];
    let laid = 0;
    index.months.forEach(month => {
        if (!monthOwns(index.rows, month) || Object.keys(monthDaysOf(document, month)).length > 0) {
            broken.push('month:' + month);
            return;
        }
        const row = index.rows[month];
        let days = null;
        for (let i = 0; i < sources.length && days === null; i += 1) {
            const mine = monthDaysOf(sources[i], month);
            if (Object.keys(mine).length === row.n && monthDigest(mine) === row.h) days = mine;
        }
        if (days === null && monthOwns(have, row.d) && monthDocumentProblems(row.d, have[row.d]).length === 0
            && have[row.d].month === month && have[row.d].digest === row.h) {
            days = have[row.d].days;
        }
        if (days === null) {
            missing.push(row.d);
            return;
        }
        Object.keys(days).forEach(date => {
            out.days[date] = monthClone(days[date]);
            laid += 1;
        });
    });
    return { document: out, missing, broken, laid };
}

// The other direction: what a WHOLE-document write may carry. No day of a month the
// index names - the rules refuse a write that touches one, and putting them back would
// refill the document the move emptied. The index itself is carried. The same object
// when there is nothing to leave out.
function monthsStripCovered(document) {
    const index = monthStoredIndex(document);
    if (!index.any || !monthIsRecord(document.days)) return document;
    const covered = Object.keys(document.days).filter(date =>
        index.months.indexOf(String(date).slice(0, 7)) !== -1 && isDayKey(date));
    if (covered.length === 0) return document;
    const out = Object.assign({}, document);
    out.days = Object.assign({}, document.days);
    covered.forEach(date => { delete out.days[date]; });
    return out;
}

// A RESTORE NEVER CHANGES A MONTH THAT HAS LEFT.
//
// layMonthsKept(document, standing, sources) -> true, or false when it could not.
//
// `document` is what a restore is about to put on this phone and send: a backup file, a
// restore point, a cloud copy - written before the month left, after it, or by a build
// that has never heard of it. `standing` is what holds the index as the SERVER holds it
// (this phone's record). The document is given that index, and for every month it names,
// the archive's own days in place of whatever the file held for that month - taken from
// the first of `sources` whose days have the row's digest. With no such source the answer
// is false and the document is not to be used: a restore that cannot keep an archived
// month as it is does not run.
function layMonthsKept(document, standing, sources) {
    if (!monthIsRecord(document)) return false;
    const index = monthStoredIndex(standing);
    if (!index.any) {
        // The server has no month out. Whatever index the file carried describes another
        // state of another server; every day the file holds is simply a day.
        delete document.monthIndex;
        return true;
    }
    if (index.unreadable.length > 0) return false;
    const from = (Array.isArray(sources) ? sources : [sources]).filter(monthIsRecord);
    const kept = {};
    for (let m = 0; m < index.months.length; m += 1) {
        const month = index.months[m];
        if (!monthOwns(index.rows, month)) return false;
        const row = index.rows[month];
        let days = null;
        for (let i = 0; i < from.length && days === null; i += 1) {
            const mine = monthDaysOf(from[i], month);
            if (Object.keys(mine).length === row.n && monthDigest(mine) === row.h) days = mine;
        }
        if (days === null) return false;
        kept[month] = days;
    }
    if (!monthIsRecord(document.days)) document.days = {};
    Object.keys(document.days).forEach(date => {
        if (index.months.indexOf(String(date).slice(0, 7)) !== -1 && isDayKey(date)) delete document.days[date];
    });
    Object.keys(kept).forEach(month => Object.keys(kept[month]).forEach(date => {
        document.days[date] = monthClone(kept[month][date]);
    }));
    document.monthIndex = monthClone(standing.monthIndex);
    return true;
}

// Does `mine` know of every month `theirs` says has left? A snapshot naming a month this
// copy has no row for is not this phone's own echo, whatever its stamps say.
function monthIndexCovers(mine, theirs) {
    const rows = theirs && monthIsRecord(theirs.monthIndex) && monthIsRecord(theirs.monthIndex.rows)
        ? theirs.monthIndex.rows : {};
    const held = mine && monthIsRecord(mine.monthIndex) && monthIsRecord(mine.monthIndex.rows)
        ? mine.monthIndex.rows : {};
    return Object.keys(rows).every(month => monthOwns(held, month)
        && monthCanonical(held[month]) === monthCanonical(rows[month]));
}

// planMonths(schedule, today, options) -> { ok, reasons, months, totals, changes: [] }
//
// THE DRY RUN the owner reads before anything moves, and the list the move works from.
// It writes nothing. One row per calendar month that holds at least one day:
//
//   state 'archived'   it has left the live document (its row is in the index)
//   state 'ready'      every man's every day in it is inside a closed, settled account,
//                      and `options.afterMonths` calendar months have passed since the
//                      later of its last such closure and its last day
//   state 'waiting'    the same, and younger than that; `readyOn` is the day it may go
//   state 'held'       it stays, and `why` says why:
//     current      the month is not over
//     open         a man has a day in it that no closed account covers (`who`)
//     before-opening  the same, and every such day is from before the day account
//                  tracking began: no account will ever cover it. It stays unless
//                  `options.beforeOpening === true` says the opening settles what came
//                  before it - which is the owner's to decide (decision 55), and OFF
//     unsettled    a closure covering one of its days is not settled (`who`)
//     unreadable   it holds a day this build cannot read
//     too-large    it would not fit one document
//
// "Settled" is Phase 5's word, asked of Phase 5's function: a closure planArchive calls
// ready, waiting or archived. Nothing unsettled moves, ever.
function planMonths(schedule, today, options) {
    const want = monthIsRecord(options) ? options : {};
    const after = Number.isInteger(want.afterMonths) && want.afterMonths >= 0
        ? want.afterMonths : MONTHS_ARCHIVE_AFTER_MONTHS;
    const reasons = monthWritesEnabled() ? [] : ['gate'];
    const index = monthStoredIndex(schedule);
    const names = {};
    ((schedule && schedule.workers) || []).forEach(man => {
        if (man && man.id !== undefined) names[String(man.id)] = String(man.name || '');
    });
    // Every closed period of every man, with whether it is settled and when it was closed.
    const periods = {};
    const archive = planArchive(schedule, today, {});
    archive.bundles.forEach(bundle => {
        const id = String(bundle.workerId);
        if (!monthOwns(periods, id)) periods[id] = [];
        periods[id].push({ from: bundle.periodFrom, to: bundle.periodTo, settled: bundle.state !== 'held',
            why: bundle.why, closedOn: bundle.closedOn });
    });
    const allDays = schedule && monthIsRecord(schedule.days) ? schedule.days : {};
    const byMonth = {};
    Object.keys(allDays).forEach(date => {
        const month = monthOf(date);
        if (month !== null) (byMonth[month] = byMonth[month] || []).push(date);
    });
    // The day account tracking began, and the day that was recorded, or nulls.
    let opening = null;
    try { opening = paybookFold(schedule).opening; } catch (error) { opening = null; }
    const openingDate = opening && isDayKey(opening.date) ? opening.date : null;
    const openingOn = opening && typeof opening.at === 'string' && isDayKey(opening.at.slice(0, 10))
        ? opening.at.slice(0, 10) : null;
    const currentMonth = isDayKey(today) ? today.slice(0, 7) : null;
    const worked = record => monthIsRecord(record) && Array.isArray(record.entries) && record.entries.length > 0;
    const months = Object.keys(byMonth).sort().map(month => {
        const dates = byMonth[month].sort();
        const days = monthDaysOf(schedule, month);
        const base = { month, n: dates.length, bytes: JSON.stringify(days).length, who: [], names: [],
            lastClosedOn: '', readyOn: null, row: null };
        const held = (why, who) => Object.assign(base, { state: 'held', why, who: who || [],
            names: (who || []).map(id => (monthOwns(names, id) && names[id] ? names[id] : id)) });
        if (index.months.indexOf(month) !== -1) {
            return Object.assign(base, { state: 'archived', why: null, row: index.rows[month] || null });
        }
        if (currentMonth === null || month >= currentMonth) return held('current');
        const open = [];
        const before = [];
        const unsettled = [];
        let unreadable = false;
        let lastClosedOn = '';
        dates.forEach(date => {
            const day = days[date];
            if (!monthIsRecord(day)) { unreadable = true; return; }
            const workers = [];
            ['plan', 'actual'].forEach(layer => {
                if (day[layer] === undefined) return;
                if (!monthIsRecord(day[layer])) { unreadable = true; return; }
                Object.keys(day[layer]).forEach(id => {
                    const record = day[layer][id];
                    if (record !== null && !monthIsRecord(record)) { unreadable = true; return; }
                    if (worked(record) && workers.indexOf(id) === -1) workers.push(id);
                });
            });
            workers.forEach(id => {
                const covering = (periods[id] || []).filter(period =>
                    typeof period.from === 'string' && typeof period.to === 'string'
                    && period.from <= date && date <= period.to);
                if (covering.length === 0) {
                    if (openingDate !== null && openingOn !== null && date < openingDate) {
                        if (before.indexOf(id) === -1) before.push(id);
                        if (want.beforeOpening === true && openingOn > lastClosedOn) lastClosedOn = openingOn;
                    } else if (open.indexOf(id) === -1) open.push(id);
                    return;
                }
                if (covering.some(period => !period.settled || !period.closedOn)) {
                    if (unsettled.indexOf(id) === -1) unsettled.push(id);
                    return;
                }
                covering.forEach(period => { if (period.closedOn > lastClosedOn) lastClosedOn = period.closedOn; });
            });
        });
        if (unreadable) return held('unreadable');
        if (open.length > 0) return held('open', open.sort());
        if (before.length > 0 && want.beforeOpening !== true) return held('before-opening', before.sort());
        if (unsettled.length > 0) return held('unsettled', unsettled.sort());
        if (base.bytes > MONTH_DOCUMENT_LIMIT_BYTES) return held('too-large');
        const lastDay = monthCalendar(month).pop();
        const since = lastClosedOn > lastDay ? lastClosedOn : lastDay;
        const readyOn = monthStepDay(since, after);
        const row = monthRow(month, days, undefined);
        delete row.at;
        Object.assign(base, { lastClosedOn, readyOn, row, why: null });
        return Object.assign(base, { state: today >= readyOn ? 'ready' : 'waiting' });
    });
    const of = state => months.filter(one => one.state === state);
    const ready = of('ready');
    // What the SERVER's document weighs: this phone's record less what has already left
    // it. An index row and its calendar cost about half a kilobyte a month.
    let live = paybookStripCovered(schedule === undefined ? null : schedule) || null;
    live = live ? monthsStripCovered(live) : live;
    const liveNow = JSON.stringify(live).length;
    const rowCost = one => JSON.stringify(one.row).length + 12 + monthCalendar(one.month).length * 13;
    return {
        ok: reasons.length === 0,
        reasons,
        months,
        totals: {
            months: months.length,
            ready: ready.length,
            readyBytes: ready.reduce((sum, one) => sum + one.bytes, 0),
            waiting: of('waiting').length,
            held: of('held').length,
            archived: of('archived').length,
            unreadableRows: index.unreadable.length,
            liveBytes: liveNow,
            liveBytesAfter: liveNow - ready.reduce((sum, one) => sum + one.bytes, 0)
                + ready.reduce((sum, one) => sum + rowCost(one), 0),
            limitBytes: 1048576
        },
        changes: []
    };
}

// The dry run as lines a person reads. No DOM here: a screen, a test and a console print
// the same words.
function monthsPlanLines(plan) {
    const fill = (text, values) => Object.keys(values).reduce((out, key) =>
        out.split('{' + key + '}').join(String(values[key])), text);
    const kb = bytes => Math.round(bytes / 1024).toLocaleString('en-US');
    const lines = [MONTH_TEXT.planTitle,
        fill(MONTH_TEXT.planSize, { now: kb(plan.totals.liveBytes), after: kb(plan.totals.liveBytesAfter) })];
    if (plan.totals.ready === 0) lines.push(MONTH_TEXT.planNothing);
    plan.months.forEach(one => {
        let said;
        if (one.state === 'archived') said = MONTH_TEXT.archived;
        else if (one.state === 'ready') said = MONTH_TEXT.ready;
        else if (one.state === 'waiting') said = fill(MONTH_TEXT.waiting, { date: one.readyOn });
        else if (one.why === 'current') said = MONTH_TEXT.current;
        else if (one.why === 'open') said = fill(MONTH_TEXT.open, { names: one.names.join(', ') });
        else if (one.why === 'before-opening') said = fill(MONTH_TEXT.beforeOpening, { names: one.names.join(', ') });
        else if (one.why === 'unsettled') said = fill(MONTH_TEXT.unsettled, { names: one.names.join(', ') });
        else if (one.why === 'too-large') said = MONTH_TEXT.tooLarge;
        else said = MONTH_TEXT.unreadable;
        lines.push(`${one.month} · ${fill(MONTH_TEXT.days, { n: one.n })} · ${said}`);
    });
    return lines;
}
