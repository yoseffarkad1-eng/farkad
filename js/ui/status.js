// «תמונת מצב» - where the business stands, on one screen. Opened from the sync chip at the
// top of every screen (index.html, #statusDoor) and from nowhere else.
//
// The owner, 2026-11-19: real features that lift the app. This is the one he opens first:
// today, the next working day, the money, the last twelve weeks and the sites, in that
// order every time, and every line one tap from the screen that owns it.
//
// IT IS A READING, AND ONLY A READING. Nothing here commits, nothing here writes a Store
// key, and every button on it only navigates - it closes this dialog and calls the
// target's own opener, exactly as a person pressing that screen's own button would. The
// one byte any of them ever causes is the journey's own place key, written by the journey
// when its door starts it - the same byte a press of «בניית סידור» in the dock writes.
// tests/statusscreen.test.mjs and tests/statusscreen.browser.mjs hold the whole disk and the record
// byte for byte across opening, every redraw and every door.
//
// IT PRICES NOTHING AND COUNTS ONLY WHAT EXISTING FUNCTIONS RETURN. Every line, and the
// one function it is read from:
//
//   the sync sentence        #storageNotice, verbatim (updateSyncNotice, js/sync/status.js)
//   today's men, its words   journeyCrewStatus / journeyCrewWords        js/ui/journey.js
//   today's sites            workersAtPlace / rimaCount                  js/model/schema.js
//   the next working day     journeyDefaultDate, JOURNEY_TEXT.forDay     js/ui/journey.js
//   its rides                journeyRideStatus over the STORED day       js/ui/journey.js, transport.js
//   its messages             sederRun(sederCrew(...))                    js/ui/seder.js
//   the next payday          periodRangeFor and the days, no money       js/dates.js, js/model/schema.js
//   the accounts to close    the close reminder's line, MIRRORED         js/ui/closereminder.js
//   what the men owe         owesReadNow / owesCountLine / owesMoney     js/ui/owes.js
//   the pulse                invoiceByDate's workerIds per date          js/model/money.js
//   a site's month           invoiceWithoutRima / rimaReport             js/model/money.js, schema.js
//   a site's eight weeks     invoiceWithoutRima(...).countAt             js/model/money.js
//   «עובדי יוסף גבס»          yosefGevesReport, its own line, in no other number
//   the backup's age         backupAgeSentence / backupReminderDue       js/ui/backup.js
//
// What this file works out for itself is COUNTS of those answers: the men on a date, a
// week's sum, an average of men per working day, a site's weeks, and one word for a site
// that is rising, falling, new or quiet - a pure rule over the same counts, its constants
// in STATUS_PHASE and pinned.
//
// THE MONEY IS READ THE HOUSE WAY, AND IT IS ONE READING - THE BOARD'S. Never inside render(),
// never before the dialog has painted, in ONE synchronous call - owesReadNow inside
// reportReadOnce around weeklyCloseOnce, the nesting «סגירת שבוע» itself uses - kept by the
// board's own keeper under the record itself (OWES_KEPT under owesKey, js/ui/owes.js: the write
// tick, today, both gates and the record as text). A record that did not move reads nothing and
// its lines are in the first paint; until a moved one is read, the board's place says «מחשב את
// החשבונות…», and no figure of an older reading is ever shown as current. With the carry shut or
// the migration unapproved it is the board's own words, «מקדמות רשומות» and the sum handed over.
//
// THE CLOSE COUNT IS NEVER READ HERE. It is the close reminder's line, MIRRORED: while that line
// is up (closeReminderShown, js/ui/closereminder.js) this screen says its sentence, byte for
// byte, with its button; while it is down there is no close line here and «דוחות» is the way.
// weeklyCloseRead walks every man's history - a second and a half in Node on a season nobody
// closed - and after a write on the day screen the reminder keeps its count under an older key
// on purpose, so a screen that read whenever that key was stale would run it at nearly every
// opening. This file never calls weeklyCloseRead, closeReminderReadCount or closeReminderRefresh.
//
// It does not print and has no picture: a dialog never reaches paper (app.css), and nothing
// leaves the phone from here.

// ================================================================== THE WORDS
//
// Every Hebrew string this file adds, in one block. PROPOSED, not approved: the owner has not
// read them. Pinned word for word in tests/statusscreen.test.mjs (CLAUDE.md, law 6). A name inside
// a template is isolated by the caller, a range is dateRange's.
const STATUS_TEXT = Object.freeze({
    title: 'תמונת מצב',
    // The door, on a phone whose chip has nothing to say (local only), and its name when it does.
    door: 'תמונת מצב',
    doorName: label => `תמונת מצב · ${label}`,

    // --- 1. today
    heroLabel: n => (n === 1 ? 'עובד היום' : 'עובדים היום'),
    inSites: n => (n === 1 ? 'באתר אחד' : `ב-${n} אתרים`),
    nobodyToday: 'עוד אין היום אף עובד באתר.',
    // «רימא» is the day screen's own word (STATUS_REUSED.rima); the template is this file's.
    rima: n => `${STATUS_REUSED.rima} ${n}`,

    // --- 3. the money
    money: 'חשבונות ומקדמות',
    // «היום, » are the words «יום תשלום» (js/ui/payday.js) proposes for its own card.
    nextPayday: (day, date, isToday) => `יום התשלום הבא: ${isToday ? 'היום, ' : ''}${day} ${date}`,
    // The men who WORKED in that pay period so far - not the men to pay (the desk's «סה״כ
    // לתשלום · N עובדים» counts rows with a wage, which an advance alone keeps alive).
    worked: n => `עבדו בתקופה: ${n}`,
    // The cycles' own words (PAY_CYCLE_LABELS, js/ui/reports.js), never a number before a
    // singular adjective; the template is this file's.
    workedBoth: (weekly, biweekly) => `עבדו בתקופה: ${PAY_CYCLE_LABELS.weekly}: ${weekly} · ${PAY_CYCLE_LABELS.biweekly}: ${biweekly}`,

    // --- 4. the pulse
    pulse: '12 השבועות האחרונים',
    pulseCaption: (a, b) => `בממוצע ${a} עובדים ביום עבודה ב-4 השבועות האחרונים, ו-${b} ב-4 השבועות שלפניהם.`,
    pulseCaptionRecent: a => `בממוצע ${a} עובדים ביום עבודה ב-4 השבועות האחרונים.`,
    weekName: (range, total, days) => `שבוע ${range}: ${total === 1 ? 'יום נוכחות אחד' : `${total} ימי נוכחות`} · ${days}`,
    few: 'מעט',
    many: 'הרבה',
    pulseHint: 'לחיצה על שבוע פותחת אותו במסך השבוע.',

    // --- 5. the sites
    sites: 'האתרים',
    siteDays: 'ימי עובד־אתר החודש',
    // «בעלייה», not «עולה»: beside a number, on a screen that also shows money, «עולה» reads as
    // "costs".
    rising: 'בעלייה',
    falling: 'בירידה',
    fresh: 'חדש',
    quiet: 'שקט',
    siteName: (name, count, weeks) =>
        `${name}: ${count === 1 ? 'יום עובד־אתר אחד' : `${count} ימי עובד־אתר`} החודש · 8 השבועות האחרונים: ${weeks}`,
    // The numbers in it are STATUS_PHASE's; tests/statusscreen.test.mjs builds the sentence it
    // expects from those constants, so a constant changed alone fails.
    phaseNote: 'בעלייה או בירידה: כמה עובדים היו ביום עבודה ב-12 ימי העבודה האחרונים, לעומת 24 ימי העבודה שלפניהם. חדש: אתר שהתחיל לעבוד ב-12 ימי העבודה האחרונים. שקט: אתר פעיל שלא עבד בו אף עובד ב-5 ימי העבודה האחרונים.',
    // The list's own title (YOSEF_GEVES_TITLE, js/ui/reports.js); the template is this file's.
    yosef: n => `${YOSEF_GEVES_TITLE} החודש: ${n}`,
    noSites: 'לא נרשמה עבודה באתרים ב-8 השבועות האחרונים.',

    // --- 6. this phone
    device: 'המכשיר הזה'
});

// The words this screen borrows, each beside the screen that owns it. Repeated here only where
// the owner builds them inline; tests/statusscreen.test.mjs finds every one of them in its owner's
// source, so a word changed there and not here fails by name. JOURNEY_TEXT, SEDER_TEXT,
// CLOSE_REMINDER_TEXT, OWES_TEXT, OWES_REUSED, WEEKLY_CLOSE_TEXT, PAY_CYCLE_LABELS,
// YOSEF_GEVES_TITLE, YOSEF_GEVES_NOTE, BACKUP_REMINDER and HEBREW_DAY_LETTERS are not repeated
// at all - they are read from their blocks.
const STATUS_REUSED = Object.freeze({
    today: 'היום',                        // index.html, the tab
    openDay: 'פתיחת היום לעריכה',          // js/ui/week.js, a day of the week opened
    rima: 'רימא',                         // js/ui/day.js, the site's Rima box
    reports: 'דוחות',                     // index.html, the tab
    inactive: 'לא פעיל',                  // js/ui/roster.js, the site's row
    cloud: 'ענן וסנכרון',                  // index.html, the first card of ⋯
    backup: 'גיבוי',                      // index.html, the row of ⋯
    close: 'סגור'                         // index.html, every reading's last button
});

// ================================================================== THE RULES
//
// How far back the pulse and the sites look.
const STATUS_WEEKS = 12;
const STATUS_SITE_WEEKS = 8;
// How long the draws must have stopped before a moved record's money is read again - the
// close reminder's own pace (CLOSE_REMINDER_QUIET_MS, js/ui/closereminder.js).
const STATUS_QUIET_MS = 1500;

// THE PHASE WORD. One per site, and none for a steady one - the silence is the calm. Read
// over WORKING days (a date on which any man had a site, dayCheckIsWorkingDay,
// js/ui/daycheck.js), never calendar days, so a holiday week is not a site winding down.
// R is the last `recent` working days up to today, B the `before` working days ahead of R;
// own(d) is the site's own men on working day d (0 counts). First rule that applies wins:
//
//   «שקט»  the site is ACTIVE, had own men on some working day of B, and none on each of
//          the last `quietDays` working days;
//   «בירידה» mean(B) >= fallFrom, mean(R) <= fallShare x mean(B), mean(B) - mean(R) >= fallBy;
//   «חדש»   its first own day in the whole record is inside R, and it has had at least
//          `freshDays` own worker-site days since;
//   «בעלייה» mean(B) >= riseFrom, mean(R) >= riseShare x mean(B), mean(R) - mean(B) >= riseBy.
//
// Under `history` working days on the record, no site gets a word: there is no "before" to
// compare with. tests/statusscreen.test.mjs pins every one of these numbers.
const STATUS_PHASE = Object.freeze({
    history: 36,
    recent: 12,
    before: 24,
    quietDays: 5,
    fallFrom: 4,
    fallShare: 0.6,
    fallBy: 3,
    freshDays: 10,
    riseFrom: 2,
    riseShare: 1.6,
    riseBy: 3
});
// Means of whole counts, compared with a share: 2.5 against 0.6 x 4.1666… is equal, and
// binary floating point says it is not by one in the sixteenth place.
const STATUS_EPSILON = 1e-9;

// ================================================================== the reading (pure)

function statusDate(dateStr) {
    return parseLocalDate(dateStr);
}

// The sentence he tapped, verbatim. Never composed again: updateSyncNotice owns its words and
// the chip is read from it, so the two cannot disagree.
function statusSyncSentence() {
    const notice = typeof document !== 'undefined' && document.getElementById ? document.getElementById('storageNotice') : null;
    return notice ? String(notice.textContent || '') : '';
}

// 1. TODAY. `placed` is the journey's own count of men under an active site (sederCrew); the
// sites are each ACTIVE site with any of his men on it, in the roster's order, with the Rima
// count typed for it.
function statusToday(schedule, today, layer) {
    const crew = journeyCrewStatus(schedule, today, layer);
    const sites = ((schedule && schedule.places) || [])
        .filter(place => place && place.active !== false)
        .map(place => ({
            placeId: String(place.id),
            name: String(place.name || ''),
            count: workersAtPlace(schedule, today, place.id, layer).length,
            rima: rimaCount(schedule, today, place.id)
        }))
        .filter(site => site.count > 0);
    return { placed: crew.placed.length, words: journeyCrewWords(crew), sites };
}

// 2. THE NEXT WORKING DAY: the journey's own day (tomorrow, past an empty Saturday - never
// «מחר» on a Friday evening), its crew in the journey's words, its rides only on a phone that
// turned them on, and the seder's own progress when there is a list.
//
// THE RIDES ARE READ, NEVER LOADED - and never at the price of a write. Two guards, both reads:
//
//   THE VEHICLE LIST. transportContext asks transportSettings, which - on a session that has
//   not loaded the list yet - asks transportLoad, which copies bytes that will not read to a
//   key of their own before it starts empty (js/ui/transport.js). So when the list is not in
//   memory and its bytes on the disk will not read, there is no ride line at all. Absent bytes
//   and bytes that read are loaded as the journey loads them, and nothing is written.
//
//   THE DAY. The session's own copy when it has one - the one the journey sees, a change the
//   disk refused included; otherwise the day's bytes read the way transportPeekDay reads them
//   (transportJson, transportReadDay), but kept AS THEY ARE: a day with men going another way
//   or a vehicle kept home and nobody seated yet is still that day, where the peek would answer
//   no plan. No key is the empty day. Bytes that will not read: no ride line. transportDayOf,
//   transportLoad of a day, openTransport and transportPrune are never called from here.
function statusRideSettingsReadable() {
    if (typeof transportSettingsMemory !== 'undefined' && transportSettingsMemory) return true;
    let raw = null;
    // A disk that will not answer is "no bytes" to transportLoad too: it starts empty, writing nothing.
    try { raw = Store.get(TRANSPORT_SETTINGS_KEY); } catch (error) { return true; }
    return raw === null || raw === undefined || Boolean(transportJson(raw));
}

function statusRideDay(date) {
    if (typeof transportDays !== 'undefined' && transportDays[date]) return transportDays[date];
    let raw = null;
    try { raw = Store.get(TRANSPORT_DAY_PREFIX + date); } catch (error) { raw = null; }
    if (raw === null || raw === undefined) return transportEmptyDay();
    const parsed = transportJson(raw);
    return parsed ? transportReadDay(parsed) : null;
}

function statusRides(date) {
    if (typeof journeyRidesOn !== 'function' || !journeyRidesOn()) return null;
    if (!statusRideSettingsReadable()) return null;
    const day = statusRideDay(date);
    if (!day) return null;
    return journeyRideWords(journeyRideStatus(transportContext(date), day));
}

function statusNext(schedule, today, layer) {
    const date = journeyDefaultDate(today);
    const parsed = statusDate(date);
    const next = {
        date,
        heading: JOURNEY_TEXT.forDay(hebrewDayName(parsed), formatFullDate(parsed)),
        words: journeyCrewWords(journeyCrewStatus(schedule, date, layer)),
        rides: statusRides(date),
        seder: null
    };
    if (typeof sederRun === 'function' && typeof sederCrew === 'function') {
        const run = sederRun(sederCrew(schedule, date, layer), date);
        if (run.total > 0) next.seder = `${JOURNEY_TEXT.sendWorkers}: ${SEDER_TEXT.progress(run.done, run.total)}`;
    }
    return next;
}

// 3. THE NEXT PAYDAY, from the roster and the days, and no money. For every man of the roster -
// archived men too, whose days still count - his own period holding today (periodRangeFor: a
// history, so a cycle changed mid-fortnight is the stub it cuts). He is IN it when a date of it
// holds a site of his and no absence (entriesFor / isAbsent: the days payrollReport counts as
// attendance; a date to come already recorded, like tomorrow's seder, counts). The payday is the
// earliest end among the men in their period, and the men counted are those it ends for, by
// cycle: the men who WORKED in that pay period so far - not the men to pay, which the desk
// counts by a wage (an advance alone keeps a row of its alive). No man in his period: no line.
function statusWorkedIn(schedule, worker, period, layer) {
    for (let date = period.from; date && date <= period.to; date = addDays(date, 1)) {
        if (!isAbsent(schedule, date, worker.id, layer) && entriesFor(schedule, date, worker.id, layer).length > 0) return true;
    }
    return false;
}

function statusPayday(schedule, today, layer) {
    const men = ((schedule && schedule.workers) || [])
        .filter(worker => worker && worker.id)
        .map(worker => ({ worker, period: periodRangeFor(worker, today) }))
        .filter(one => one.period && statusWorkedIn(schedule, one.worker, one.period, layer));
    if (men.length === 0) return null;
    const date = men.reduce((first, one) => (one.period.to < first ? one.period.to : first), men[0].period.to);
    const on = men.filter(one => one.period.to === date);
    return {
        date,
        isToday: date === today,
        worked: on.length,
        weekly: on.filter(one => one.period.cycle === 'weekly').length,
        biweekly: on.filter(one => one.period.cycle === 'biweekly').length
    };
}

// The week's columns as day offsets from its Friday, in the order the app's week reads them
// (workerCardWeekdays, js/ui/workercard.js: Friday first, the Saturday left out) - and the
// Saturday put back in its place when one of the twelve weeks holds anything recorded on it.
function statusWeekColumns(saturday) {
    const weekdays = typeof workerCardWeekdays === 'function' ? workerCardWeekdays() : [5, 0, 1, 2, 3, 4];
    const offsets = weekdays.map(day => (day - 5 + 7) % 7);
    if (saturday) offsets.splice(1, 0, 1);
    return offsets;
}

function statusWeekdayOf(offset) {
    return (5 + offset) % 7;
}

// The shade of a cell: step ceil(5 x n / max) of the five-step ramp; nobody is the surface.
function statusStep(n, max) {
    if (n === null || n === undefined) return null;
    if (!(n > 0) || !(max > 0)) return 0;
    return Math.min(5, Math.ceil((5 * n) / max));
}

function statusAverage(counts) {
    const worked = counts.filter(n => n > 0);
    if (worked.length === 0) return null;
    return Math.round((worked.reduce((sum, n) => sum + n, 0) / worked.length) * 10) / 10;
}

// 4. THE PULSE: twelve weeks, newest on top, each cell the men with a site that date - each
// once however many sites he stood on, the union of the invoice's own workerIds, which is the
// week tab's «סה"כ עובדים» rule (renderWeekTotals, js/ui/week.js) and the month summary's
// `menOn` (js/ui/monthsummary.js). A date after today is null - drawn «·» and counted nowhere.
function statusPulse(schedule, today) {
    const thisWeek = toLocalDateStr(snapToWeekStart(statusDate(today)));
    const first = addDays(thisWeek, -7 * (STATUS_WEEKS - 1));
    const invoice = invoiceByDate(schedule, first, today);
    const menOn = {};
    invoice.places.forEach(place => place.days.forEach(day => {
        if (!menOn[day.date]) menOn[day.date] = new Set();
        day.workerIds.forEach(id => menOn[day.date].add(String(id)));
    }));
    const count = date => (date > today ? null : (menOn[date] ? menOn[date].size : 0));

    const fridays = [];
    for (let back = 0; back < STATUS_WEEKS; back += 1) fridays.push(addDays(thisWeek, -7 * back));
    // A Saturday with anything on it is never hidden: the column is there for every row when
    // one of the twelve holds a record - anyRecordOnRestDay (js/ui/day.js), the rule the day's
    // own arrows step by and «לוח חודשי» draws by, so the screens agree about Saturdays. One that
    // holds only an absence or only a Rima count is a column of cells at 0.
    const saturday = fridays.some(friday => {
        const date = addDays(friday, 1);
        return typeof anyRecordOnRestDay === 'function' ? anyRecordOnRestDay(date) : (count(date) || 0) > 0;
    });
    const columns = statusWeekColumns(saturday);

    let max = 0;
    const weeks = fridays.map(friday => {
        const days = columns.map(offset => {
            const date = addDays(friday, offset);
            const n = count(date);
            if (n !== null && n > max) max = n;
            return { date, n };
        });
        // Each row starts with its Friday, written, so a reader tells the weeks apart without
        // counting rows.
        return { from: friday, to: addDays(friday, 6), label: formatShortDate(statusDate(friday)), days,
            total: days.reduce((sum, day) => sum + (day.n || 0), 0) };
    });
    weeks.forEach(week => {
        week.days.forEach(day => { day.step = statusStep(day.n, max); });
        const said = week.days.filter(day => day.n !== null)
            .map(day => `${hebrewDayName(statusDate(day.date))} ${day.n}`).join(' · ');
        week.name = STATUS_TEXT.weekName(
            dateRange(formatShortDate(statusDate(week.from)), formatShortDate(statusDate(week.to))), week.total, said);
    });

    const recent = statusAverage(weeks.slice(0, 4).flatMap(week => week.days.map(day => day.n || 0)));
    const before = statusAverage(weeks.slice(4, 8).flatMap(week => week.days.map(day => day.n || 0)));
    let caption = null;
    if (before !== null) caption = STATUS_TEXT.pulseCaption(recent === null ? 0 : recent, before);
    else if (recent !== null) caption = STATUS_TEXT.pulseCaptionRecent(recent);

    return { weeks, columns: columns.map(statusWeekdayOf), saturday, max, caption };
}

// The working days up to today, oldest first, the latest `limit` of them.
function statusWorkingDays(schedule, today, layer, limit) {
    if (typeof dayCheckIsWorkingDay !== 'function') return [];
    const dates = Object.keys((schedule && schedule.days) || {})
        .filter(date => isRealDate(date) && date <= today)
        .sort();
    const out = [];
    for (let at = dates.length - 1; at >= 0 && out.length < limit; at -= 1) {
        if (dayCheckIsWorkingDay(schedule, dates[at], layer)) out.push(dates[at]);
    }
    return out.reverse();
}

// Had the site any of his men on a date before `before`? Asked only of a site whose B is
// empty, so the walk is short in the ordinary case and stops at the first day it finds.
function statusOwnBefore(schedule, placeId, before, layer) {
    return Object.keys((schedule && schedule.days) || {})
        .filter(date => isRealDate(date) && date < before)
        .some(date => workersAtPlace(schedule, date, placeId, layer).length > 0);
}

// THE PHASE WORDS, as { placeId: word | null } for the sites asked about.
function statusPhases(schedule, today, layer, places) {
    const P = STATUS_PHASE;
    const out = {};
    places.forEach(place => { out[String(place.id)] = null; });
    const days = statusWorkingDays(schedule, today, layer, P.history);
    if (days.length < P.history) return out;
    const B = days.slice(0, P.before);
    const R = days.slice(P.before);
    const own = invoiceWithoutRima(schedule, days[0], today);
    const sum = list => list.reduce((total, n) => total + n, 0);
    places.forEach(place => {
        const id = String(place.id);
        const b = B.map(date => own.countAt(place.id, date));
        const r = R.map(date => own.countAt(place.id, date));
        const meanB = sum(b) / b.length;
        const meanR = sum(r) / r.length;
        let word = null;
        if (place.active !== false && sum(b) > 0 && r.slice(-P.quietDays).every(n => n === 0)) {
            word = STATUS_TEXT.quiet;
        } else if (meanB >= P.fallFrom - STATUS_EPSILON && meanR <= P.fallShare * meanB + STATUS_EPSILON
            && meanB - meanR >= P.fallBy - STATUS_EPSILON) {
            word = STATUS_TEXT.falling;
        } else if (sum(b) === 0 && sum(r) >= P.freshDays && !statusOwnBefore(schedule, place.id, days[0], layer)) {
            word = STATUS_TEXT.fresh;
        } else if (meanB >= P.riseFrom - STATUS_EPSILON && meanR >= P.riseShare * meanB - STATUS_EPSILON
            && meanR - meanB >= P.riseBy - STATUS_EPSILON) {
            word = STATUS_TEXT.rising;
        }
        out[id] = word;
    });
    return out;
}

const STATUS_PHASE_KIND = Object.freeze({ 'בעלייה': 'rising', 'בירידה': 'falling', 'חדש': 'fresh', 'שקט': 'quiet' });

// 5. THE SITES: every site with any of his own men in the last eight weeks; active first, by
// this month's own count, then the archived, then a site the record names and the roster has
// not got («אתר שאינו ברשימה N», placeLabelsIn) - written the same way, as a plain row, since
// there is no card behind it. THE MONTH SO FAR, like the pulse and the strip: from the first of
// the month «סיכום חודש» reads (monthSummaryRange) up to today - a seder typed for tomorrow is
// not worked yet. Its count is his men's worker-site days there (the invoice without Rima), and
// Rima beside it: the two make the client's billing count of those days.
function statusSites(schedule, today, layer) {
    const monthFrom = monthSummaryRange(monthSummaryKeyOf(today)).from;
    const thisWeek = toLocalDateStr(snapToWeekStart(statusDate(today)));
    const from = addDays(thisWeek, -7 * (STATUS_SITE_WEEKS - 1));
    const eight = invoiceWithoutRima(schedule, from, today);
    const roster = (schedule && schedule.places) || [];
    const listed = id => roster.some(place => place && String(place.id) === id);
    const worked = eight.places.filter(row => row.workerDays > 0);
    const order = roster.filter(place => place && worked.some(row => String(row.placeId) === String(place.id)))
        .map(place => ({ id: place.id, name: String(place.name || ''), active: place.active !== false, listed: true }))
        .concat(worked.filter(row => !listed(String(row.placeId)))
            .map(row => ({ id: row.placeId, name: String(row.name || ''), active: false, listed: false })));
    const phases = statusPhases(schedule, today, layer, order);
    const weekOf = friday => {
        const dates = [];
        for (let offset = 0; offset < 7; offset += 1) {
            const date = addDays(friday, offset);
            if (date <= today) dates.push(date);
        }
        return dates;
    };
    const fridays = [];
    for (let back = STATUS_SITE_WEEKS - 1; back >= 0; back -= 1) fridays.push(addDays(thisWeek, -7 * back));

    const sites = order.map((place, rank) => {
        const id = String(place.id);
        const phase = phases[id] || null;
        return {
            placeId: id,
            name: place.name,
            active: place.active,
            listed: place.listed,
            month: invoiceWithoutRima(schedule, monthFrom, today, place.id).total,
            rima: rimaReport(schedule, monthFrom, today, place.id).total,
            // Oldest first: the strip reads the way the app's time does, right to left.
            weeks: fridays.map(friday => weekOf(friday).reduce((sum, date) => sum + eight.countAt(place.id, date), 0)),
            phase,
            phaseKind: phase ? STATUS_PHASE_KIND[phase] : null,
            rank
        };
    });
    const band = site => (site.listed ? (site.active ? 0 : 1) : 2);
    sites.sort((a, b) => (band(a) !== band(b) ? band(a) - band(b) : b.month !== a.month ? b.month - a.month : a.rank - b.rank));
    sites.forEach(site => { delete site.rank; });
    return { sites, yosef: typeof yosefGevesReport === 'function' ? yosefGevesReport(schedule, monthFrom, today).total : 0 };
}

// 6. THIS PHONE: the backup row's own sentence and its reminder (js/ui/backup.js).
function statusBackup(today) {
    let last = null;
    try { last = Store.get(LAST_BACKUP_KEY); } catch (error) { last = null; }
    const days = backupAgeDays(last, today);
    return {
        sentence: backupAgeSentence(last, today),
        reminder: backupReminderDue(last, today) ? BACKUP_REMINDER : null,
        warn: days === null || days >= 7
    };
}

// The close reminder's count, MIRRORED - the count its line on the glass says, or null when
// the line is down. Never read here (the top of this file).
function statusCloseShown() {
    const shown = typeof closeReminderShown !== 'undefined' ? closeReminderShown : null;
    return Number.isInteger(shown) && shown > 0 ? shown : null;
}

// EVERYTHING BUT THE BOARD'S MONEY, as plain data and nothing drawn - so the suite can hold
// every figure against the function it is read from without a browser. Cheap: a few invoices
// over weeks, no walk, no gate.
function statusFacts(today) {
    const day = today || todayStr();
    const schedule = State.schedule;
    const layer = State.layer;
    const sites = statusSites(schedule, day, layer);
    return {
        today: day,
        sync: statusSyncSentence(),
        crew: statusToday(schedule, day, layer),
        next: typeof journeyDefaultDate === 'function' ? statusNext(schedule, day, layer) : null,
        payday: statusPayday(schedule, day, layer),
        close: statusCloseShown(),
        pulse: statusPulse(schedule, day),
        sites: sites.sites,
        yosef: sites.yosef,
        backup: statusBackup(day)
    };
}

// ================================================================== the money
//
// THE BOARD'S, AND ONLY THE BOARD'S: `{ folded, total, countLine }`, or `{ none: true }` when
// nobody owes. Its words are the board's (renderOwesInto, js/ui/owes.js): the label by the
// gate, the sum, the count line.

// The board read at all: no advance and no close on the record, nobody can owe - renderOwesInto's
// own short cut, which reads nothing.
function statusOwesWanted(schedule) {
    return (typeof owesAnyAdvance === 'function' && owesAnyAdvance(schedule))
        || (typeof owesAnyClosure === 'function' && owesAnyClosure(schedule));
}

function statusMoneyFrom(read) {
    return read && Array.isArray(read.rows) && read.rows.length > 0
        ? { folded: read.folded === true, total: read.total, countLine: owesCountLine(read) }
        : { none: true };
}

// What can be said WITHOUT READING: nothing to read at all, or the board's own reading kept
// under this very record (OWES_KEPT, owesKeptNow). null when the board would have to be read.
function statusMoneyKept() {
    if (!statusOwesWanted(State.schedule)) return { none: true };
    const kept = typeof owesKeptNow === 'function' ? owesKeptNow() : null;
    return kept ? statusMoneyFrom(kept) : null;
}

// THE READING: ONE synchronous call, no write, no await - owesReadNow inside reportReadOnce and
// weeklyCloseOnce, so the gate is answered once (without planning on a record that carries the
// approval) and the ledger folded once, and the board's keeper keeps it. Called only after the
// dialog has painted (statusMoneyLater). A reading that throws is no line, never a crash (the
// close reminder's rule): the board's place is left empty, and «מקדמות» is one tap away.
function statusMoneyFacts() {
    const kept = statusMoneyKept();
    if (kept) return kept;
    const read = () => owesReadNow();
    const inner = () => (typeof weeklyCloseOnce === 'function' ? weeklyCloseOnce(read) : read());
    try {
        return statusMoneyFrom(typeof reportReadOnce === 'function' ? reportReadOnce(inner) : inner());
    } catch (error) {
        if (typeof console !== 'undefined' && console.warn) console.warn('status: the board was not read', error);
        return null;
    }
}

// ================================================================== the drawing

let statusMoneyWaiting = 0;       // which after-paint reading is the one still wanted
let statusQuiet = null;           // the wait for the draws to stop

function statusParts() {
    const get = id => (typeof document !== 'undefined' && document.getElementById ? document.getElementById(id) : null);
    return { modal: get('statusModal'), title: get('statusTitle'), body: get('statusBody'), close: get('statusClose'),
        door: get('statusDoor') };
}

function statusIsOpen() {
    const modal = statusParts().modal;
    return Boolean(modal && modal.style.display === 'flex');
}

function statusSection(kind, title) {
    const section = el('section', `status-sec status-${kind}`);
    section.appendChild(el('h4', 'status-head', title));
    return section;
}

// A door: a button that only navigates, keyed so a redraw gives the focus back to it.
function statusDoorButton(words, key, go, name) {
    const node = button(words, 'btn-secondary status-go', go, name);
    node.dataset.statusKey = key;
    return node;
}

function statusSwatch(placeId) {
    const swatch = el('span', 'status-swatch');
    swatch.style.background = siteColorVar(placeId);
    swatch.setAttribute('aria-hidden', 'true');
    return swatch;
}

function drawStatusToday(body, facts) {
    const T = STATUS_TEXT;
    const crew = facts.crew;
    const section = statusSection('today', STATUS_REUSED.today);
    if (crew.placed > 0) {
        const hero = el('div', 'status-hero');
        hero.appendChild(el('strong', 'status-hero-n', String(crew.placed)));
        const said = el('div', 'status-hero-said');
        said.appendChild(el('span', 'status-hero-label', T.heroLabel(crew.placed)));
        said.appendChild(el('span', 'status-hero-sites', T.inSites(crew.sites.length)));
        hero.appendChild(said);
        section.appendChild(hero);
    } else {
        section.appendChild(el('p', 'status-line status-empty', T.nobodyToday));
    }
    section.appendChild(el('p', 'status-line status-words', crew.words));
    if (crew.sites.length > 0) {
        // The bar draws the counts the lines under it write: a site's colour is identity only,
        // and on the dark grounds it is under 3:1 - never the one thing a number is told by.
        const bar = el('div', 'status-bar');
        bar.setAttribute('aria-hidden', 'true');
        crew.sites.forEach(site => {
            const part = el('span', 'status-bar-part');
            part.style.flex = `${site.count} 1 0`;
            part.style.background = siteColorVar(site.placeId);
            bar.appendChild(part);
        });
        section.appendChild(bar);
        const list = el('div', 'status-today-sites');
        crew.sites.forEach(site => {
            const line = el('div', 'status-today-site');
            line.dataset.placeId = site.placeId;
            line.appendChild(statusSwatch(site.placeId));
            line.appendChild(el('span', 'status-today-name', isolate(site.name)));
            line.appendChild(el('strong', 'status-today-count', String(site.count)));
            if (site.rima > 0) line.appendChild(el('span', 'status-today-rima', T.rima(site.rima)));
            list.appendChild(line);
        });
        section.appendChild(list);
    }
    section.appendChild(statusDoorButton(STATUS_REUSED.openDay, 'go:today', () => statusGoToday()));
    body.appendChild(section);
}

function drawStatusNext(body, facts) {
    const next = facts.next;
    if (!next) return;
    const section = statusSection('next', next.heading);
    section.appendChild(el('p', 'status-line status-words', next.words));
    if (next.rides) section.appendChild(el('p', 'status-line status-rides', next.rides));
    if (next.seder) section.appendChild(el('p', 'status-line status-seder', next.seder));
    // The dock button's own title and its own action (index.html, #journeyDockBtn).
    const words = typeof journeyDayEntryWords === 'function' ? journeyDayEntryWords(Date.now(), facts.today) : JOURNEY_TEXT.entry;
    section.appendChild(statusDoorButton(words, 'go:journey', () => statusGoJourney()));
    body.appendChild(section);
}

function statusPaydayWords() {
    return typeof openPayday === 'function' && typeof PAYDAY_TEXT !== 'undefined' && PAYDAY_TEXT && PAYDAY_TEXT.entry
        ? PAYDAY_TEXT.entry : STATUS_REUSED.reports;
}

// The payday's two lines: the day, then who worked in the period so far.
function statusPaydayLines(payday) {
    const parsed = statusDate(payday.date);
    return [STATUS_TEXT.nextPayday(hebrewDayName(parsed), formatShortDate(parsed), payday.isToday),
        payday.weekly > 0 && payday.biweekly > 0 ? STATUS_TEXT.workedBoth(payday.weekly, payday.biweekly)
            : STATUS_TEXT.worked(payday.worked)];
}

// The board's lines, or their placeholder: «מחשב את החשבונות…» in their place until they are
// read, and nothing of a reading of another record. `money` undefined is "not read yet", null a
// reading that threw (nothing said).
function drawStatusMoneyInto(node, money) {
    clear(node);
    if (money === undefined) {
        node.setAttribute('aria-busy', 'true');
        node.appendChild(el('p', 'status-line status-pending', WEEKLY_CLOSE_TEXT.reading));
        return;
    }
    node.removeAttribute('aria-busy');
    if (!money) return;
    if (money.none) {
        node.appendChild(el('p', 'status-line status-money-line status-money-none', OWES_TEXT.none));
        return;
    }
    const line = el('p', 'status-line status-money-line');
    line.appendChild(el('span', 'status-money-label', `${money.folded ? OWES_TEXT.total : OWES_REUSED.recorded}: `));
    line.appendChild(el('strong', 'status-money-amount', owesMoney(money.total)));
    node.appendChild(line);
    node.appendChild(el('p', 'status-line status-money-count', money.countLine));
    node.appendChild(statusDoorButton(OWES_TEXT.board, 'go:board', () => statusGoBoard()));
}

function drawStatusMoney(body, facts, money) {
    const section = statusSection('money', STATUS_TEXT.money);
    // Drawn at once - dates and counts, no money. The door stays when there is no line.
    const payday = el('div', 'status-money-row status-money-payday');
    if (facts.payday) statusPaydayLines(facts.payday).forEach(text => payday.appendChild(el('p', 'status-line status-money-line', text)));
    payday.appendChild(statusDoorButton(statusPaydayWords(), 'go:payday', () => statusGoPayday()));
    section.appendChild(payday);
    // The close reminder's own line, mirrored at once - only while it is up.
    if (facts.close) {
        const close = el('div', 'status-money-row status-money-close');
        close.appendChild(el('p', 'status-line status-money-line', CLOSE_REMINDER_TEXT.line(facts.close)));
        close.appendChild(statusDoorButton(CLOSE_REMINDER_TEXT.open, 'go:close', () => statusGoClose()));
        section.appendChild(close);
    }
    const lines = el('div', 'status-money-row status-money');
    lines.id = 'statusMoney';
    drawStatusMoneyInto(lines, money);
    section.appendChild(lines);
    body.appendChild(section);
}

function drawStatusPulse(body, facts) {
    const T = STATUS_TEXT;
    const pulse = facts.pulse;
    const section = statusSection('pulse', T.pulse);
    if (pulse.caption) section.appendChild(el('p', 'status-line status-caption', pulse.caption));
    const grid = el('div', `status-grid status-cols-${pulse.columns.length}`);
    const head = el('div', 'status-grid-head');
    head.setAttribute('aria-hidden', 'true');
    head.appendChild(el('span', 'status-grid-corner'));
    pulse.columns.forEach(weekday => head.appendChild(el('span', 'status-grid-day', HEBREW_DAY_LETTERS[weekday])));
    head.appendChild(el('span', 'status-grid-sum', OWES_TEXT.sum));
    grid.appendChild(head);
    pulse.weeks.forEach(week => {
        const row = button('', 'status-week', () => statusGoWeek(week.from), week.name);
        row.dataset.statusKey = `week:${week.from}`;
        row.dataset.week = week.from;
        row.appendChild(el('span', 'status-week-date', week.label));
        week.days.forEach(day => {
            const cell = el('span', `status-cell status-step-${day.n === null ? 'later' : day.step}`, day.n === null ? '·' : '');
            cell.dataset.date = day.date;
            row.appendChild(cell);
        });
        row.appendChild(el('span', 'status-week-total', String(week.total)));
        grid.appendChild(row);
    });
    section.appendChild(grid);
    const legend = el('div', 'status-legend');
    legend.setAttribute('aria-hidden', 'true');
    legend.appendChild(el('span', 'status-legend-word', T.few));
    for (let step = 1; step <= 5; step += 1) legend.appendChild(el('span', `status-legend-step status-step-${step}`));
    legend.appendChild(el('span', 'status-legend-word', T.many));
    section.appendChild(legend);
    section.appendChild(el('p', 'status-note', T.pulseHint));
    // «לוח חודשי» (track monthboard), when this build has it.
    if (typeof openMonthBoard === 'function' && typeof MONTH_BOARD_TEXT !== 'undefined' && MONTH_BOARD_TEXT && MONTH_BOARD_TEXT.door) {
        section.appendChild(statusDoorButton(MONTH_BOARD_TEXT.door, 'go:monthBoard', () => statusGoMonthBoard()));
    }
    body.appendChild(section);
}

function statusSiteName(site) {
    const T = STATUS_TEXT;
    const parts = [T.siteName(isolate(site.name), site.month, site.weeks.join(' · '))];
    if (site.rima > 0) parts.push(T.rima(site.rima));
    if (site.listed && !site.active) parts.push(STATUS_REUSED.inactive);
    if (site.phase) parts.push(site.phase);
    return parts.join(' · ');
}

function drawStatusSites(body, facts) {
    const T = STATUS_TEXT;
    const section = statusSection('sites', T.sites);
    if (facts.sites.length === 0) section.appendChild(el('p', 'status-line status-empty', T.noSites));
    facts.sites.forEach(site => {
        // A site of the roster is a button to its card; one the record names and the roster has
        // not got has no card (openSiteCard says nothing for it), so it is a plain row with the
        // same words - never a button that opens nothing.
        let row;
        if (site.listed) {
            row = button('', 'status-site', () => statusGoSite(site.placeId), statusSiteName(site));
            row.dataset.statusKey = `site:${site.placeId}`;
            row.setAttribute('aria-haspopup', 'dialog');
        } else {
            row = el('div', 'status-site status-site-unlisted');
            row.setAttribute('role', 'group');
            row.setAttribute('aria-label', statusSiteName(site));
        }
        row.dataset.placeId = site.placeId;
        const top = el('span', 'status-site-top');
        top.appendChild(statusSwatch(site.placeId));
        top.appendChild(el('span', 'status-site-name', isolate(site.name)));
        if (site.listed && !site.active) top.appendChild(el('span', 'status-site-off', STATUS_REUSED.inactive));
        if (site.phase) top.appendChild(el('span', `status-phase status-phase-${site.phaseKind}`, site.phase));
        row.appendChild(top);
        const mid = el('span', 'status-site-mid');
        mid.appendChild(el('strong', 'status-site-n', String(site.month)));
        mid.appendChild(el('span', 'status-site-label', T.siteDays));
        if (site.rima > 0) mid.appendChild(el('span', 'status-site-rima', T.rima(site.rima)));
        row.appendChild(mid);
        // Eight bars against the site's OWN largest week, the latest in the accent - emphasis,
        // not the site's colour, which is under 3:1 on the dark grounds. The numbers are in the
        // row's name.
        const strip = el('span', 'status-strip');
        strip.setAttribute('aria-hidden', 'true');
        const most = Math.max(...site.weeks, 0);
        site.weeks.forEach((n, at) => {
            const bar = el('span', 'status-strip-bar' + (at === site.weeks.length - 1 ? ' status-strip-now' : '')
                + (n === 0 ? ' status-strip-none' : ''));
            const fill = el('span', 'status-strip-fill');
            if (n > 0 && most > 0) fill.style.height = `${Math.max(12, Math.round((100 * n) / most))}%`;
            bar.appendChild(fill);
            strip.appendChild(bar);
        });
        row.appendChild(strip);
        section.appendChild(row);
    });
    // What the words mean, under the list - its numbers are the rule's constants.
    if (facts.sites.length > 0) section.appendChild(el('p', 'status-note', T.phaseNote));
    if (facts.yosef > 0) {
        const apart = el('div', 'status-yosef');
        apart.appendChild(el('p', 'status-line status-yosef-line', T.yosef(facts.yosef)));
        apart.appendChild(el('p', 'status-note', YOSEF_GEVES_NOTE));
        section.appendChild(apart);
    }
    body.appendChild(section);
}

function drawStatusDevice(body, facts) {
    const section = statusSection('device', STATUS_TEXT.device);
    section.appendChild(el('p', facts.backup.warn ? 'status-line status-backup status-warn' : 'status-line status-backup',
        facts.backup.sentence));
    if (facts.backup.reminder) section.appendChild(el('p', 'status-line status-warn status-reminder', facts.backup.reminder));
    const doors = el('div', 'status-doors');
    doors.appendChild(statusDoorButton(STATUS_REUSED.cloud, 'go:cloud', () => statusGoCloud()));
    doors.appendChild(statusDoorButton(STATUS_REUSED.backup, 'go:backup', () => statusGoBackup()));
    section.appendChild(doors);
    body.appendChild(section);
}

// The whole body, from the facts of this moment and the money kept for this record - or its
// placeholder. Answers whether the money still has to be read.
function drawStatus() {
    const parts = statusParts();
    if (!parts.body) return false;
    const active = document.activeElement;
    const held = active && active.dataset && parts.body.contains(active) ? active.dataset.statusKey : '';
    const facts = statusFacts(todayStr());
    const kept = statusMoneyKept();

    clear(parts.body);
    const sync = el('p', 'status-sync', facts.sync);
    sync.id = 'statusSync';
    sync.hidden = !facts.sync;
    parts.body.appendChild(sync);
    drawStatusToday(parts.body, facts);
    drawStatusNext(parts.body, facts);
    drawStatusMoney(parts.body, facts, kept || undefined);
    drawStatusPulse(parts.body, facts);
    drawStatusSites(parts.body, facts);
    drawStatusDevice(parts.body, facts);

    if (held) {
        const again = [...parts.body.querySelectorAll('button')].find(node => node.dataset && node.dataset.statusKey === held);
        if (again && again.focus) again.focus({ preventScroll: true });
    }
    return !kept;
}

// After the dialog has painted, never in the paint (owesAfterPaint's own pair: a frame, then a
// task; and a timer for a window given no frame). Where there is no frame at all - the suites'
// devices in Node - it is read in place.
function statusMoneyLater() {
    const ask = ++statusMoneyWaiting;
    const run = () => {
        if (ask !== statusMoneyWaiting || !statusIsOpen()) return;
        const money = statusMoneyFacts();
        const node = document.getElementById('statusMoney');
        if (node && statusIsOpen()) drawStatusMoneyInto(node, money);
    };
    if (typeof requestAnimationFrame !== 'function') { run(); return; }
    if (typeof owesAfterPaint === 'function') { owesAfterPaint(run); return; }
    let done = false;
    const once = () => { if (!done) { done = true; run(); } };
    requestAnimationFrame(() => setTimeout(once, 0));
    setTimeout(once, 400);
}

// ================================================================== the frame

function openStatus() {
    const parts = statusParts();
    if (!parts.modal || !parts.body || typeof State === 'undefined' || !State || !State.schedule) return false;
    if (parts.title) parts.title.textContent = STATUS_TEXT.title;
    if (parts.close) parts.close.textContent = STATUS_REUSED.close;
    // On an iPhone a tap focuses nothing, and the dialogs' keeper of the focus (js/ui/modal.js)
    // would then give it back to whatever was focused last. The door is what opened it.
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    if (parts.door && parts.door.focus && (!active || active === document.body)) parts.door.focus({ preventScroll: true });
    const unread = drawStatus();
    parts.modal.style.display = 'flex';
    const content = parts.modal.querySelector('.modal-content');
    if (content) content.scrollTop = 0;
    if (unread) statusMoneyLater();
    return true;
}

function closeStatus() {
    statusMoneyWaiting += 1;
    if (statusQuiet) { clearTimeout(statusQuiet); statusQuiet = null; }
    const parts = statusParts();
    if (parts.modal) parts.modal.style.display = 'none';
}

// render() calls this (js/app.js). Shut, it returns at its first line. Open, the cheap sections
// are drawn again from the record as it is - the place the reader had scrolled to kept - and a
// record the board moved under shows «מחשב את החשבונות…» again and is read once the draws have
// stopped for STATUS_QUIET_MS (the close reminder's rule): a snapshot adopted, a commit on
// another phone, is never read in the draw, and the board at most once for a run of them.
function renderStatusIfOpen() {
    if (!statusIsOpen()) return;
    const content = statusParts().modal.querySelector('.modal-content');
    const at = content ? content.scrollTop : 0;
    const unread = drawStatus();
    if (content) content.scrollTop = at;
    if (statusQuiet) { clearTimeout(statusQuiet); statusQuiet = null; }
    if (unread) {
        statusQuiet = setTimeout(() => {
            statusQuiet = null;
            if (statusIsOpen()) statusMoneyLater();
        }, STATUS_QUIET_MS);
    }
}

// renderSyncChip calls this at its end (js/app.js), with the chip it just wrote and its label.
// The door is named by the chip it holds - «תמונת מצב · מסונכרן» - and where the chip has
// nothing to say (local only) the door says its own words instead, so it is a worded button on
// every phone (the v122 rule). While the dialog is open its first line follows the chip.
function statusDoorSync(chip, label) {
    const door = typeof document !== 'undefined' && document.getElementById ? document.getElementById('statusDoor') : null;
    if (!door) return;
    const shown = Boolean(label) && Boolean(chip) && chip.hidden !== true;
    const words = door.querySelector ? door.querySelector('.status-door-words') : null;
    if (words) {
        if (words.textContent !== STATUS_TEXT.door) words.textContent = STATUS_TEXT.door;
        words.hidden = shown;
    }
    const name = shown ? STATUS_TEXT.doorName(label) : STATUS_TEXT.door;
    if (door.getAttribute('aria-label') !== name) door.setAttribute('aria-label', name);
    if (statusIsOpen()) {
        const line = document.getElementById('statusSync');
        const text = statusSyncSentence();
        if (line && line.textContent !== text) { line.textContent = text; line.hidden = !text; }
    }
}

// For «מה חדש»'s «הראה לי» (the integrator's): the door given the keyboard, NOT pressed.
function statusFocusDoor() {
    const door = statusParts().door;
    if (!door || !door.focus || door.offsetParent === null) return false;
    door.focus({ preventScroll: true });
    return true;
}

// ================================================================== the doors
//
// NAVIGATION ONLY. Each closes this dialog first and then calls the screen's own opener - and
// WHEN depends on what that screen is, because js/ui/modal.js gives the focus back to this
// dialog's opener (#statusDoor, always on the page) from a MutationObserver, at the microtask
// checkpoint AFTER the whole block that shut the last dialog:
//
//   A DIALOG (the site's card, «סגירת שבוע», «יום תשלום»): opened in the SAME task. modal.js then
//   never sees a moment with no dialog open and gives nothing back - so the new dialog's heading
//   is given the focus here, by hand (siteCardGoMan's rule, js/ui/sitecard.js), and closing it
//   later gives the focus back to this door.
//   ANYTHING ELSE (a view, the journey, ⋯, the month board): closed now, opened a task later
//   (whatsNewGo's rule, js/ui/whatsnew.js) - so modal.js's focus return lands first, and the
//   focus then ends where the target puts it: ⋯'s heading, the board's title.

function statusFocusNewDialog() {
    if (typeof topModal !== 'function') return;
    const top = topModal();
    if (!top || top.id === 'statusModal') return;
    if (top.contains(document.activeElement) && document.activeElement !== document.body) return;
    const heading = top.querySelector('.modal-content > h3[tabindex="-1"]');
    if (heading && heading.focus) heading.focus({ preventScroll: true });
}

function statusAfterClose(go) {
    setTimeout(go, 0);
}

// Today, on the day screen - a day chosen by hand, so a midnight follow still owed is settled
// by it (dayChosenByHand, js/app.js). Set in the task after the dialog shut: the follow made at
// the shut (watchDayRollover) comes first, and his choice after it.
function statusGoToday() {
    if (!statusIsOpen()) return false;
    closeStatus();
    statusAfterClose(() => {
        State.date = todayStr();
        if (typeof dayChosenByHand === 'function') dayChosenByHand();
        showView('day');
    });
    return true;
}

// The dock button's own action (journeyStart): a journey he left is continued, any other
// starts on its own day. It writes the journey's own place key - the dock's byte, no other.
function statusGoJourney() {
    if (!statusIsOpen() || typeof journeyStart !== 'function') return false;
    closeStatus();
    statusAfterClose(() => journeyStart());
    return true;
}

// «יום תשלום» where this build has it - a dialog, in this task; the pay sheet otherwise - a
// view, a task later.
function statusGoPayday() {
    if (!statusIsOpen()) return false;
    closeStatus();
    if (typeof openPayday === 'function') {
        openPayday();
        statusFocusNewDialog();
    } else {
        statusAfterClose(() => showView('reports'));
    }
    return true;
}

function statusGoClose() {
    if (!statusIsOpen() || typeof openWeeklyClose !== 'function') return false;
    closeStatus();
    openWeeklyClose();
    statusFocusNewDialog();
    return true;
}

// «מי חייב כסף», the board on top of «מקדמות», as it opens: no man's page, no inner page.
function statusGoBoard() {
    if (!statusIsOpen()) return false;
    closeStatus();
    statusAfterClose(() => {
        if (typeof OWES_PAGE !== 'undefined') OWES_PAGE = null;
        if (typeof ADVANCE_WORKER !== 'undefined') ADVANCE_WORKER = null;
        showView('advances');
    });
    return true;
}

// A week of the pulse, on the week screen. showView puts the week on today's (app.js); the
// week asked for is set after it, and drawn.
function statusGoWeek(friday) {
    if (!statusIsOpen() || !isRealDate(friday)) return false;
    closeStatus();
    statusAfterClose(() => {
        showView('week');
        setWeekFromDate(friday);
        render();
    });
    return true;
}

function statusGoMonthBoard() {
    if (!statusIsOpen() || typeof openMonthBoard !== 'function') return false;
    closeStatus();
    statusAfterClose(() => openMonthBoard(null, null));
    return true;
}

function statusGoSite(placeId) {
    if (!statusIsOpen() || typeof openSiteCard !== 'function') return false;
    closeStatus();
    openSiteCard(placeId);
    statusFocusNewDialog();
    return true;
}

function statusGoCloud() {
    if (!statusIsOpen() || typeof openSettings !== 'function') return false;
    closeStatus();
    statusAfterClose(() => {
        openSettings();
        if (typeof settingsJump === 'function') settingsJump('settingsDaily');
    });
    return true;
}

function statusGoBackup() {
    if (!statusIsOpen() || typeof openSettings !== 'function') return false;
    closeStatus();
    statusAfterClose(() => {
        openSettings();
        if (typeof openSettingsFold === 'function') openSettingsFold('settingsFoldBackup');
        if (typeof settingsJump === 'function') settingsJump('settingsBackups');
    });
    return true;
}
