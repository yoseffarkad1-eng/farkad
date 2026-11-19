// מי עבד איפה - who worked where, on any day of the record: one man or everyone, one site or
// every site, over a range, the matching days newest first as the day screen words them, with
// the counts on top. Entered from the finder's door «איפה עבד» (js/ui/find.js), and from
// nowhere else.
//
// The questions it answers come by telephone. A man rings: "I worked on the 12th and it was a
// double day". A client writes: "who did you bill me for at Ramat Gan in March?". The answer
// was always on the record and never in one place - the day screen shows one date, the
// worker's card one month, the pay sheet a period in money, «כרטיס אתר» one month of one
// site. Here it is one dialog that asks the record three things - which man, which site,
// which range - and lists what matches.
//
// IT IS A READING, AND ONLY A READING. Nothing here commits, touches Store or keeps a
// preference: the three choices change what is READ, a day goes to that date on the day
// screen, and the text leaves by the day message's own two doors. What is chosen lives in
// memory and is gone at a close or a reload. tests/history.test.mjs holds every key on the
// disk byte for byte across all of it.
//
// THE ONE KEY THAT CAN MOVE WHILE IT IS OPEN IS NOT ITS OWN. At the first station of «בניית
// סידור» the day screen is the journey's editor and the journey follows the date on it
// (js/ui/journey.js); a day opened from here would have dragged the evening's journey to a
// day in October and written its key. So while a journey is open a day's door ASKS first,
// and the confirming answer leaves the journey by the journey's own journeyLeave - exactly
// what its «יציאה» does, its place kept for «בניית סידור» to bring back - and only then
// opens the day. «ביטול» moves nothing.
//
// AND IT IS COUNTS, NOT MONEY. There is not a shekel here and no money function, gate or
// ledger reader is asked anything: nothing gated is read. Each count is the count an existing
// report makes of the same days (tests/history.test.mjs pins every one to its source):
//
//   ימי נוכחות, ימי עובד־אתר,   payrollReport's attendanceDays, siteVisits,   js/model/money.js
//   כפולים, שעות נוספות, נעדר  doubleDays, extraHours, absent - summed over the men listed
//   a man's days at one site     his count in that site's invoice workerIds   invoiceByDate
//   סה״כ ימי עובד־אתר (billed)    the site's row of invoiceByDate              js/model/money.js
//   בלי עובדי רימא               invoiceWithoutRima                           js/model/money.js
//   סה״כ עובדי רימא              rimaReport                                   js/model/schema.js
//   עובדי יוסף גבס               yosefGevesReport - in no other figure        js/model/schema.js
//
// A day reads as the day screen reads it, through the model's own primitives: isAbsent and
// entriesFor on the 'actual' layer, the kind by the pay's own rule (a double day is double
// whatever else it holds), the hours the pay counts, and every site named from ONE map over
// the whole record - the map the day screen and the week draw a day with - so a site the
// roster no longer has is «אתר שאינו ברשימה N» with the same N as on the day its row opens.
// With a site chosen a row is THAT site's own entry, as the day screen's row under the site
// reads it, and «2 אתרים» when he was at another site too; nothing of the other site is
// counted or named.
//
// THE LIVE RECORD, NOT THE FROZEN ONE. A day corrected after its period was closed reads as
// corrected here, as it does on the day screen a row opens; the payslip in «דוחות» keeps what
// was paid. So over exactly a closed period the pay sheet's counts and these can differ, by
// exactly the correction - and that is said, not hidden (tests/history.test.mjs, criterion 4).
//
// NOTHING AFTER TODAY. Tomorrow's seder typed in the evening is a plan, not history: every
// range is read up to today and says so in its dates.
//
// THE COST IS BOUNDED, BECAUSE A REDRAW PAYS FOR WHAT IS DRAWN. Every moved record redraws the
// open dialog, so the screen never holds more than HISTORY_SHOWN_MAX rows (a chunk at a time),
// the text is built only while its fold is open or at a door, and a redraw of a record that
// did not move changes no node at all.

// ================================================================== THE WORDS
//
// The strings this file ADDS, in one block. PROPOSED, not approved: the owner has not read
// them. Pinned word for word in tests/history.test.mjs, so changing one is a decision.
const HISTORY_TEXT = Object.freeze({
    // The head of the dialog, and the finder's door to it. Not «היסטוריה»: in this app that is
    // a man's MONEY record - «היסטוריה מלאה» on his «מקדמות» page, which the app's own sentences
    // send the owner to - and a door of that name opening attendance would be the wrong door.
    title: 'מי עבד איפה',
    door: 'איפה עבד',
    // The labels over the first two choices.
    man: 'עובד',
    site: 'אתר',
    // The three ranges the reports screen has no chip for.
    last3: '3 החודשים האחרונים',
    thisYear: 'השנה',
    all: 'מתחילת הרישום',
    // The choice in words, under the three fields - the one place the chosen name is always
    // written whole, whatever a closed <select> has room for.
    now: (who, where, range) => `${who} · ${where} · ${range}`,
    // The fold that holds the text and its two doors.
    asText: 'הרשימה כטקסט',
    // With everyone and every site: this «ימי עובד־אתר» is his men's, and must not be read as
    // the invoice's total, which counts Rima's men in.
    noRima: 'עובדי רימא לא נספרים כאן. כדי לראות גם אותם, בחר אתר.',
    // A man's dates at one site, under «מי עבד באתר».
    dayOne: 'יום אחד',
    dayMany: 'ימים',
    empty: 'לא נמצא אף יום שמתאים לבחירה.',
    // A month's heading: its name and year, and - with no site chosen - its days of
    // attendance. With a site there is no count beside it (the billing above counts Rima's
    // men in under the same words).
    month: (name, year, count) => (count === null || count === undefined
        ? `${name} ${year}` : `${name} ${year} · ${count}`),
    who: (name, count) => `${name} · ${count}`,
    // A row read aloud. A part with nothing in it - the sites of an absence - is left out
    // rather than said as an empty « · ».
    rowName: (when, name, sites, kind) => [when, name, sites, kind].filter(part => part !== '').join(' · '),
    shown: (n, total) => `מוצגות ${n} שורות מתוך ${total}.`,
    more: n => `הצג עוד ${n}`,
    capped: (n, total) => `מוצגות ${n} השורות החדשות ביותר מתוך ${total}. כדי לראות את השאר, בחר טווח קצר יותר, אתר או עובד.`,
    // The text's first line.
    textHead: (who, where) => `📄 ${who} · ${where}`,
    textCut: (n, total) => `ההודעה כוללת רק את ${n} השורות החדשות ביותר מתוך ${total}, כי כל הרשימה ארוכה מדי להודעה אחת. כדי לקבל את כולן, בחר טווח קצר יותר, אתר או עובד.`,
    // The share door's own sentence (js/ui/share.js), its first half changed: with no share
    // sheet the text would travel inside a link, and a long one is not put in a link at all.
    tooLongForLink: '⚠️ הרשימה ארוכה מדי לקישור של וואטסאפ - השתמש בהעתק ושלח ידנית',
    // A day's door while «בניית סידור» is open: it asks before it leaves the journey.
    leaveTitle: 'לצאת מבניית הסידור?',
    leaveMessage: (day, sederDay) => `כדי לפתוח את ${day} צריך לצאת מבניית הסידור ל${sederDay}. אפשר לחזור אליה אחר כך מ«בניית סידור».`,
    leaveOk: 'צא ופתח את היום'
});

// The words it borrows, each beside the screen that owns it. Repeated here because those
// screens keep them inline; tests/history.test.mjs finds every one in its owner's source, so
// a word changed there and not here fails by name. The words that ARE constants elsewhere -
// RATE_LABELS, the Rima and יוסף גבס titles, totals and notes, «חיוב -», «מי עבד באתר», the
// month names, «לחיצה על יום פותחת אותו במסך היום.», the doors' «💬 שלח בוואטסאפ», «העתק» and
// «סגור» - are not repeated at all: they are read from their blocks when they are used.
const HISTORY_REUSED = Object.freeze({
    allMen: 'כל העובדים',                         // js/ui/reports.js, the worker picker
    allSites: 'כל האתרים',                        // js/ui/reports.js, the client's chips
    inactive: 'לא פעיל',                          // js/ui/roster.js, the crew row
    range: 'תקופה',                               // js/ui/reports.js, the workbook's overview
    thisMonth: 'החודש',                           // js/ui/reports.js, the range chips
    lastMonth: 'חודש שעבר',                       // js/ui/reports.js, the range chips
    custom: 'תאריכים אחרים',                      // js/ui/reports.js, the range chips
    from: 'מתאריך',                               // js/ui/reports.js, the custom range
    to: 'עד תאריך',                               // js/ui/reports.js, the custom range
    // js/ui/reports.js, the custom range refusing an inverted pair
    invertedTitle: 'הטווח הפוך',
    invertedMessage: 'תאריך ההתחלה מאוחר מתאריך הסיום, ולכן הוא לא שונה. בחר קודם את תאריך ההתחלה ואז את הסיום.',
    attendance: 'ימי נוכחות',                     // js/ui/reports.js, the statement
    attendanceOne: 'יום נוכחות אחד',              // js/ui/reports.js, the statement
    siteDays: 'ימי עובד־אתר',                     // js/ui/reports.js, the workbook's overview
    doubles: 'כפולים',                            // js/ui/reports.js, the sheet's column
    extraHours: 'שעות נוספות',                    // js/ui/reports.js, the sheet's column
    absent: 'נעדר',                               // js/ui/reports.js, the sheet's column; js/ui/day.js
    // js/ui/reports.js, the billing page: the counting rule, word for word
    twoSites: 'עובד בשני אתרים נספר פעם אחת בכל אתר; ימי עובד־אתר אינם ימי נוכחות ואינם ימי שכר — אין לצפות שהסכומים יתאימו.',
    split: '2 אתרים',                             // js/ui/day.js, the badge on a site's row
    hours: hours => `${plusAmount(hours)} ש׳`      // js/ui/reports.js, the statement
});

// How many rows the screen draws at a time, and never more than: every moved record redraws
// the open dialog with what was unfolded kept, so an unbounded list made each redraw cost
// what the person had asked to see (measured: 1,000 rows 607-677ms at 4x CPU; 600 rows
// 175-286ms). The text carries further, to its own cap; a longer list is narrowed.
const HISTORY_CHUNK = 200;
const HISTORY_SHOWN_MAX = 600;
// The text: whole rows, newest first, while it stays within this many characters (WhatsApp's
// own limit for one message is 65,536 - documented, not tried on a phone).
const HISTORY_TEXT_MAX = 60000;
// With no share sheet the text travels in a wa.me link (shareTextOut, js/ui/share.js), and a
// list of 60,000 characters is a link of 295,220. Past this many encoded characters nothing
// is opened and «העתק» does the rest. A common ceiling of one request line - NOT measured
// against WhatsApp.
const HISTORY_LINK_MAX = 8000;

// What is being read, or null while it is shut. Memory only: a reload closes it, and nothing
// about it is kept anywhere.
//   { workerId: string|null, placeId: string|null,
//     range: 'thisMonth'|'lastMonth'|'last3'|'thisYear'|'all'|'custom',
//     from, to,      - for 'custom' only
//     shown,         - rows drawn, never more than HISTORY_SHOWN_MAX
//     textOpen }     - the fold is open
let HISTORY = null;
// The facts the screen was last drawn from - what a door sends - and the drawing's own
// fingerprint, so a redraw of a record that did not move touches nothing.
let HISTORY_FACTS = null;
let HISTORY_DRAWN = null;
// What each <select> was last filled with, so its options are rebuilt only when the roster
// itself changes.
let HISTORY_OPTIONS = {};
// A day's question is up (a journey is open): a second door is not asked on top of it.
let HISTORY_ASKING = false;

const HISTORY_RANGES = ['thisMonth', 'lastMonth', 'last3', 'thisYear', 'all', 'custom'];
const HISTORY_TILES = ['attendance', 'siteDays', 'doubleDays', 'extraHours', 'absent'];

// ================================================================== the reading
//
// Pure: a record, a question and today in; the matching days and their counts out. No DOM,
// no storage, no clock - today is handed in, so the suite can hold every range on every edge
// of the calendar.

// The record's first day, or null when it holds none: the start of «מתחילת הרישום».
function historyFirstDay(schedule) {
    return Object.keys((schedule && schedule.days) || {}).filter(isRealDate).sort()[0] || null;
}

// The month `months` away from the one `date` is in: its first and last day, at local noon,
// day 0 of the next month being the last of this one (setMonthRange's own step,
// js/ui/reports.js) - never toISOString, which moves a day across midnight in Israel.
function historyMonth(date, months) {
    const parsed = parseLocalDate(date);
    const year = parsed.getFullYear();
    const month = parsed.getMonth() + months;
    return {
        from: toLocalDateStr(new Date(year, month, 1, 12)),
        to: toLocalDateStr(new Date(year, month + 1, 0, 12))
    };
}

// THE RANGE: `{ from, to }` as chosen, BEFORE the cut to today - or null for a range that
// cannot be read. Calendar months and the calendar year, the current one in progress, like
// «החודש» on the reports screen: on the 1st of a month «3 החודשים האחרונים» is two months and a
// day, and on 1 January «השנה» is one day. The range line says the dates read, and «מתחילת
// הרישום» is the range that crosses a year's turn. `chosen` is the two dates of «תאריכים
// אחרים»; `firstDay` the record's first day (historyFirstDay).
function historyRange(key, today, chosen, firstDay) {
    if (!isRealDate(today)) return null;
    if (key === 'thisMonth') return historyMonth(today, 0);
    if (key === 'lastMonth') return historyMonth(today, -1);
    if (key === 'last3') return { from: historyMonth(today, -2).from, to: historyMonth(today, 0).to };
    if (key === 'thisYear') {
        const year = today.slice(0, 4);
        return { from: `${year}-01-01`, to: `${year}-12-31` };
    }
    if (key === 'all') {
        return { from: isRealDate(firstDay) && firstDay < today ? firstDay : today, to: today };
    }
    if (key === 'custom') {
        const from = chosen && chosen.from;
        const to = chosen && chosen.to;
        if (!isRealDate(from) || !isRealDate(to)) return null;
        // A start after the last day that would be read is the inverted range the reports
        // refuse; the end read is at the latest today, so a start after today is one too.
        if (from > (to < today ? to : today)) return null;
        return { from, to };
    }
    return null;
}

// The day's kind by the pay's own rule (payrollReport): a double day is double whatever else
// it holds; then extra hours; then a regular day.
function historyKindOf(entries) {
    if (entries.some(entry => entryRate(entry) === RATE_DOUBLE)) return 'double';
    if (entries.some(entry => entryRate(entry) === RATE_EXTRA)) return 'extra';
    return 'normal';
}

// The dates a question READS: its range, cut to today - nothing after today is read, whatever
// the range runs to. Null for a range that cannot be read.
function historyDatesRead(schedule, query, today) {
    const ask = query || {};
    const range = historyRange(ask.range, today, { from: ask.from, to: ask.to }, historyFirstDay(schedule));
    if (!range) return null;
    return { from: range.from, to: range.to < today ? range.to : today };
}

// THE READING. `query` is { workerId, placeId, range, from, to } - the dialog's own state; a
// man or a site the record no longer has reads as everyone, or every site. Returns null for
// a range that cannot be read (historyRange). Otherwise:
//
//   { from, to,          the dates READ - `to` cut to today
//     rows: [{ date, workerId, kind: 'normal'|'extra'|'double'|'absent', hours, split,
//              sites: [{ id, name }] }],                newest first, roster order in a date
//     months: [{ key, rows, attendance }],             newest first; attendance null with a site
//     tiles: [{ id, value }],                          by what is chosen
//     site: null | { placeId, name, own, rima, billed, yosef, men: [{ id, name, days }] },
//     rimaInRange }                                    with nobody and nowhere chosen only
function historyRead(schedule, query, today) {
    const ask = query || {};
    const dates = historyDatesRead(schedule, ask, today);
    if (!dates) return null;
    const from = dates.from;
    const to = dates.to;

    const workers = ((schedule && schedule.workers) || []).filter(Boolean);
    const places = ((schedule && schedule.places) || []).filter(Boolean);
    const man = ask.workerId === null || ask.workerId === undefined ? null
        : workers.find(worker => String(worker.id) === String(ask.workerId)) || null;
    const place = ask.placeId === null || ask.placeId === undefined ? null
        : places.find(one => String(one.id) === String(ask.placeId)) || null;
    const men = man ? [man] : workers;
    // ONE map over the WHOLE record: the day screen's and the week's (js/ui/day.js,
    // js/ui/week.js), so an unlisted site carries the number it has where its row opens.
    const labels = placeLabelsIn(schedule);

    // The key set every report walks (payrollReport), newest first.
    const days = Object.keys((schedule && schedule.days) || {})
        .filter(date => date >= from && date <= to).sort().reverse();

    const rows = [];
    const months = [];
    const sum = { attendance: 0, siteDays: 0, doubleDays: 0, extraHours: 0, absent: 0 };
    let month = null;
    days.forEach(date => {
        men.forEach(worker => {
            let row = null;
            if (isAbsent(schedule, date, worker.id, 'actual')) {
                // An absence has no site: it is listed only when no site is chosen.
                if (place) return;
                row = { date, workerId: String(worker.id), kind: 'absent', hours: 0, split: false, sites: [] };
                sum.absent += 1;
            } else {
                const entries = entriesFor(schedule, date, worker.id, 'actual');
                if (entries.length === 0) return;
                if (place) {
                    // THAT site's entry and nothing else of the day: the one the day screen's
                    // row under the site reads (renderAssignmentRow, js/ui/day.js).
                    const entry = entries.find(one => one.placeId === place.id);
                    if (!entry) return;
                    row = { date, workerId: String(worker.id), kind: entryRate(entry),
                        hours: entryExtraHours(entry), split: entries.length > 1,
                        sites: [{ id: String(place.id), name: placeLabelFrom(labels, place.id) }] };
                    sum.siteDays += 1;
                } else {
                    const ids = [];
                    entries.forEach(entry => {
                        const id = String(entry.placeId);
                        if (ids.indexOf(id) === -1) ids.push(id);
                    });
                    const hours = entries.reduce((total, entry) => total + entryExtraHours(entry), 0);
                    row = { date, workerId: String(worker.id), kind: historyKindOf(entries), hours, split: false,
                        sites: ids.map(id => ({ id, name: placeLabelFrom(labels, id) })) };
                    sum.attendance += 1;
                    sum.siteDays += ids.length;
                    if (row.kind === 'double') sum.doubleDays += 1;
                    sum.extraHours += hours;
                }
            }
            rows.push(row);
            const key = date.slice(0, 7);
            if (!month || month.key !== key) {
                month = { key, rows: 0, attendance: place ? null : 0 };
                months.push(month);
            }
            month.rows += 1;
            if (!place && row.kind !== 'absent') month.attendance += 1;
        });
    });

    let tiles;
    if (!place) tiles = HISTORY_TILES.map(id => ({ id, value: sum[id] }));
    else if (man) tiles = [{ id: 'siteDays', value: sum.siteDays }];
    else tiles = [];

    // A SITE AND EVERYONE: the site's billing IS the count - its four reports, each asked
    // once, as the site card asks them, over the dates read. Never on one man's reading: it
    // is the list a man in a dispute is handed, and the statement the app sends a man carries
    // none of the client's billing.
    let site = null;
    if (place && !man) {
        const id = String(place.id);
        const invoice = invoiceByDate(schedule, from, to);
        const billedRow = invoice.places.find(item => String(item.placeId) === id) || null;
        // Who worked there: the invoice's own workerIds, each man once per date, by days,
        // the roster's order kept among equals (the site card's rule, js/ui/sitecard.js).
        const perMan = {};
        (billedRow ? billedRow.days : []).forEach(day => day.workerIds.forEach(worker => {
            perMan[String(worker)] = (perMan[String(worker)] || 0) + 1;
        }));
        site = {
            placeId: id,
            name: place.name,
            own: invoiceWithoutRima(schedule, from, to, id).total,
            rima: rimaReport(schedule, from, to, id).total,
            billed: billedRow ? billedRow.workerDays : 0,
            yosef: yosefGevesReport(schedule, from, to, id).total,
            men: workers.filter(worker => perMan[String(worker.id)] > 0)
                .map(worker => ({ id: String(worker.id), name: worker.name, days: perMan[String(worker.id)] }))
                .sort((a, b) => b.days - a.days)
        };
    }

    // Only to decide whether the Rima sentence is said: with nobody and nowhere chosen.
    const rimaInRange = !place && !man ? rimaReport(schedule, from, to).total : 0;
    return { from, to, rows, months, tiles, site, rimaInRange };
}

// ================================================================== the facts
//
// What the screen and the text say, read once per draw: the reading of the record as it
// stands, and the words for it. The one function here that reads State.

function historyFacts() {
    const schedule = State.schedule;
    const today = todayStr();
    // A man or a site that left the record under the open dialog: everyone, every site.
    const workers = (schedule.workers || []).filter(Boolean);
    const places = (schedule.places || []).filter(Boolean);
    if (HISTORY.workerId !== null && !workers.some(worker => String(worker.id) === HISTORY.workerId)) {
        HISTORY.workerId = null;
    }
    if (HISTORY.placeId !== null && !places.some(one => String(one.id) === HISTORY.placeId)) {
        HISTORY.placeId = null;
    }
    let read = historyRead(schedule, HISTORY, today);
    if (!read) {
        // Two dates that no longer make a range - a clock put back under them: the range the
        // dialog opens on, rather than a screen of nothing.
        HISTORY.range = 'last3';
        HISTORY.from = null;
        HISTORY.to = null;
        read = historyRead(schedule, HISTORY, today);
    }
    const man = HISTORY.workerId === null ? null : workers.find(worker => String(worker.id) === HISTORY.workerId);
    const place = HISTORY.placeId === null ? null : places.find(one => String(one.id) === HISTORY.placeId);
    const R = HISTORY_REUSED;
    const who = man ? isolate(man.name) : R.allMen;
    const where = place ? isolate(place.name) : R.allSites;
    const rangeText = dateRange(formatFullDate(parseLocalDate(read.from)), formatFullDate(parseLocalDate(read.to)));
    const names = {};
    workers.forEach(worker => { names[String(worker.id)] = worker.name; });
    // The men: everyone, then the daily list in the roster's order, then the men turned off.
    // The sites: every site, then the active ones, then the archived ones. A site a day names
    // that the roster has not got is not offered - it has no name to choose it by - and its
    // days are listed, and named, with no site chosen.
    const listed = (items, all) => [{ value: '', text: all }]
        .concat(items.filter(item => item.active !== false).map(item => ({ value: String(item.id), text: item.name })))
        .concat(items.filter(item => item.active === false)
            .map(item => ({ value: String(item.id), text: `${isolate(item.name)} · ${R.inactive}` })));
    return Object.assign(read, {
        today,
        workerId: man ? String(man.id) : null,
        placeId: place ? String(place.id) : null,
        range: HISTORY.range,
        who,
        where,
        rangeText,
        now: HISTORY_TEXT.now(who, where, rangeText),
        names,
        manOptions: listed(workers, R.allMen),
        siteOptions: listed(places, R.allSites)
    });
}

// The words of one tile, by its id.
function historyTileLabel(id) {
    const R = HISTORY_REUSED;
    return { attendance: R.attendance, siteDays: R.siteDays, doubleDays: R.doubles,
        extraHours: R.extraHours, absent: R.absent }[id];
}

// The sentences under the tiles, each only when it applies: worker-site days are not days of
// attendance (a man at two sites in a day), and - with everyone and every site - Rima's men
// are not in this count.
function historyNotes(facts) {
    const notes = [];
    if (facts.placeId !== null) return notes;
    const value = id => (facts.tiles.find(tile => tile.id === id) || { value: 0 }).value;
    if (value('siteDays') !== value('attendance')) notes.push(HISTORY_REUSED.twoSites);
    if (facts.workerId === null && facts.rimaInRange > 0) notes.push(HISTORY_TEXT.noRima);
    return notes;
}

// The site's billing, in the site card's order and words (siteCardNumbers, without the two
// counts that card makes for itself), each figure once. `yosef` is apart, and never in the
// text.
function historySiteLines(site) {
    const lines = [{ id: 'billed', label: NO_RIMA_TOTAL, value: String(site.billed) }];
    if (site.rima > 0) {
        lines.push({ id: 'own', label: NO_RIMA_TITLE, value: String(site.own) });
        lines.push({ id: 'rima', label: RIMA_TOTAL, value: String(site.rima), note: RIMA_NOTE });
    }
    if (site.yosef > 0) {
        lines.push({ id: 'yosef', label: YOSEF_GEVES_TOTAL, value: String(site.yosef),
            note: YOSEF_GEVES_NOTE, apart: true });
    }
    return lines;
}

// «אחמד נסאר · 12 ימים» - a man's dates at the site.
function historyManLine(man) {
    return HISTORY_TEXT.who(isolate(man.name), countedIn(man.days, HISTORY_TEXT.dayOne, HISTORY_TEXT.dayMany));
}

// A month's heading. With no site, the month's whole count of attendance, whatever is drawn
// of it yet.
function historyMonthHeading(month) {
    const [year, number] = month.key.split('-').map(Number);
    const count = month.attendance === null ? null
        : countedIn(month.attendance, HISTORY_REUSED.attendanceOne, HISTORY_REUSED.attendance);
    return HISTORY_TEXT.month(MONTH_SUMMARY_TEXT.months[number - 1], year, count);
}

// One row's words: the date as the statement writes it (the year is on the month's heading),
// the date in full for the row's name, the man, the kind with its hours and, with a site,
// «2 אתרים».
function historyRowWords(row, facts) {
    const R = HISTORY_REUSED;
    const parsed = parseLocalDate(row.date);
    const name = facts.names[row.workerId] !== undefined ? facts.names[row.workerId] : row.workerId;
    const kind = row.kind === 'absent' ? R.absent : RATE_LABELS[row.kind];
    const marks = [];
    if (row.kind !== 'absent' && row.hours > 0) marks.push(R.hours(row.hours));
    if (row.split) marks.push(R.split);
    const sites = row.sites.map(site => isolate(site.name));
    return {
        when: `${HEBREW_DAY_NAMES[parsed.getDay()]} ${formatShortDate(parsed)}`,
        full: `${hebrewDayName(parsed)} ${formatFullDate(parsed)}`,
        name,
        kind,
        marks,
        label: HISTORY_TEXT.rowName(`${hebrewDayName(parsed)} ${formatFullDate(parsed)}`, isolate(name),
            sites.join(' · '), [kind].concat(marks).join(' · '))
    };
}

// ================================================================== the text
//
// Pure over the facts. The same answer as the screen, in words: its first line names the
// question, then the dates, the counts, the site's billing (a site and everyone only, and
// never «עובדי יוסף גבס» - the client's text leaves it out, js/ui/sitecard.js), then the days
// in the statement's own bullet and dash (workerStatementText, js/ui/reports.js). Whole rows,
// newest first, while it stays within HISTORY_TEXT_MAX; when rows were left out it says how
// many of how many. Built only while the fold is open, or when a door is pressed.

function historyTextHead(facts) {
    const T = HISTORY_TEXT;
    const lines = [T.textHead(facts.who, facts.where), facts.rangeText, ''];
    facts.tiles.forEach(tile => lines.push(`${historyTileLabel(tile.id)}: ${tile.value}`));
    historyNotes(facts).forEach(note => lines.push(note));
    if (facts.site) {
        lines.push(`${SITE_CARD_REUSED.billing} ${isolate(facts.site.name)}`);
        historySiteLines(facts.site).filter(line => !line.apart).forEach(line => {
            lines.push(`${line.label}: ${line.value}`);
            if (line.note) lines.push(line.note);
        });
        if (facts.site.men.length > 0) {
            lines.push('', SITE_CARD_TEXT.men);
            facts.site.men.forEach(man => lines.push(historyManLine(man)));
        }
    }
    return lines;
}

function historyRowLine(row, facts) {
    const words = historyRowWords(row, facts);
    const who = facts.workerId === null ? `${isolate(words.name)} - ` : '';
    if (row.kind === 'absent') return `• ${words.when} - ${who}${words.kind}`;
    const where = row.sites.map(site => isolate(site.name)).join(' + ');
    return `• ${words.when} - ${who}${where} · ${[words.kind].concat(words.marks).join(' · ')}`;
}

function historyText(facts) {
    const T = HISTORY_TEXT;
    let text = historyTextHead(facts).join('\n');
    if (facts.rows.length === 0) return `${text}\n\n${T.empty}`;
    const total = facts.rows.length;
    // Room kept for the line that says rows were left out, at its longest.
    const room = HISTORY_TEXT_MAX - `\n\n${T.textCut(total, total)}`.length;
    const heading = {};
    facts.months.forEach(month => { heading[month.key] = historyMonthHeading(month); });
    let month = null;
    let kept = 0;
    for (let at = 0; at < total; at += 1) {
        const row = facts.rows[at];
        const key = row.date.slice(0, 7);
        const add = (key !== month ? `\n\n${heading[key]}` : '') + `\n${historyRowLine(row, facts)}`;
        // A row is never cut in half: it is in whole, with its month's heading, or not at all.
        if (text.length + add.length > (at === total - 1 ? HISTORY_TEXT_MAX : room)) break;
        text += add;
        month = key;
        kept += 1;
    }
    if (kept < total) text += `\n\n${T.textCut(kept, total)}`;
    return text;
}

// ================================================================== the drawing
//
// textContent only, like every other screen: a name is text. The choices, the fold and its
// doors are in the frame (index.html) and are not rebuilt by a redraw, so the focus stays on
// the select a choice was made in; the totals and the rows are, and a row carries a key so
// the one drawn again under it takes the focus back.

function historyParts() {
    const get = id => (typeof document !== 'undefined' && document.getElementById ? document.getElementById(id) : null);
    return { modal: get('historyModal'), title: get('historyTitle'), close: get('historyClose'),
        scroll: get('historyScroll'), man: get('historyMan'), site: get('historySite'), range: get('historyRange'),
        dates: get('historyDates'), from: get('historyFrom'), to: get('historyTo'), now: get('historyRangeNow'),
        totals: get('historyTotals'), fold: get('historyFoldLabel'), foldBody: get('historyFoldBody'),
        text: get('historyText'), send: get('historySend'), copy: get('historyCopy'), status: get('historyStatus'),
        list: get('historyList') };
}

// Words set only where they differ: a redraw that writes the same text still replaces the
// node's children, and a record that did not move must change nothing on the screen.
function historySay(node, text) {
    if (node && node.textContent !== text) node.textContent = text;
}

function historySetAttribute(node, name, value) {
    if (node && node.getAttribute(name) !== value) node.setAttribute(name, value);
}

// The options of one select, rebuilt only when they are not what it already holds.
function historyOptionsInto(select, name, options, value) {
    if (!select) return;
    const signature = JSON.stringify(options);
    if (HISTORY_OPTIONS[name] !== signature) {
        HISTORY_OPTIONS[name] = signature;
        clear(select);
        options.forEach(one => {
            const option = el('option', null, one.text);
            option.value = one.value;
            select.appendChild(option);
        });
    }
    if (select.value !== value) select.value = value;
}

function historyRangeOptions() {
    const T = HISTORY_TEXT;
    const R = HISTORY_REUSED;
    const words = { thisMonth: R.thisMonth, lastMonth: R.lastMonth, last3: T.last3, thisYear: T.thisYear,
        all: T.all, custom: R.custom };
    return HISTORY_RANGES.map(key => ({ value: key, text: words[key] }));
}

// The drawing's fingerprint: everything the screen shows, and nothing it does not - the rows
// past what is drawn are not in it, but the counts they make are.
function historySignature(facts, shown) {
    return JSON.stringify([HISTORY.workerId, HISTORY.placeId, HISTORY.range, HISTORY.from, HISTORY.to,
        facts.manOptions, facts.siteOptions, facts.from, facts.to, facts.now, facts.tiles, facts.site,
        facts.rimaInRange, facts.months, facts.rows.length, facts.rows.slice(0, shown),
        facts.rows.slice(0, shown).map(row => facts.names[row.workerId])]);
}

function historyShownNow(facts) {
    return Math.min(HISTORY.shown, facts.rows.length, HISTORY_SHOWN_MAX);
}

function historyDrawChoices(facts) {
    const parts = historyParts();
    historyOptionsInto(parts.man, 'man', facts.manOptions, HISTORY.workerId === null ? '' : HISTORY.workerId);
    historyOptionsInto(parts.site, 'site', facts.siteOptions, HISTORY.placeId === null ? '' : HISTORY.placeId);
    historyOptionsInto(parts.range, 'range', historyRangeOptions(), HISTORY.range);
    const custom = HISTORY.range === 'custom';
    if (parts.dates && parts.dates.hidden !== !custom) parts.dates.hidden = !custom;
    if (custom && parts.from && parts.to) {
        // The fields say the dates READ; the browser's own guard rails keep a start after its
        // end and a day after today out of them, and historyChoose refuses what gets past.
        if (parts.from.value !== facts.from) parts.from.value = facts.from;
        if (parts.to.value !== facts.to) parts.to.value = facts.to;
        historySetAttribute(parts.from, 'max', facts.to);
        historySetAttribute(parts.to, 'min', facts.from);
        historySetAttribute(parts.to, 'max', facts.today);
    }
    historySay(parts.now, facts.now);
}

function historyTile(tile) {
    const node = el('div', 'history-tile');
    node.dataset.tile = tile.id;
    node.appendChild(el('span', 'history-tile-label', historyTileLabel(tile.id)));
    node.appendChild(el('strong', 'history-tile-value', String(tile.value)));
    return node;
}

function historyDrawTotals(facts) {
    const box = historyParts().totals;
    if (!box) return;
    clear(box);
    if (facts.tiles.length > 0) {
        const tiles = el('div', 'history-tiles');
        facts.tiles.forEach(tile => tiles.appendChild(historyTile(tile)));
        box.appendChild(tiles);
    }
    historyNotes(facts).forEach(note => box.appendChild(el('p', 'history-note', note)));
    if (!facts.site) return;
    // A SITE AND EVERYONE: the billing, then who worked there. Plain text, no buttons.
    const site = el('section', 'history-site');
    site.appendChild(el('h4', 'history-site-head', `${SITE_CARD_REUSED.billing} ${isolate(facts.site.name)}`));
    historySiteLines(facts.site).forEach(line => {
        const pair = el('div', line.apart ? 'history-pair history-pair-apart' : 'history-pair');
        pair.dataset.figure = line.id;
        pair.appendChild(el('span', 'history-pair-label', line.label));
        pair.appendChild(el('strong', 'history-pair-value', line.value));
        if (line.note) pair.appendChild(el('p', 'history-note history-pair-note', line.note));
        site.appendChild(pair);
    });
    if (facts.site.men.length > 0) {
        site.appendChild(el('h4', 'history-men-head', SITE_CARD_TEXT.men));
        facts.site.men.forEach(man => {
            const line = el('p', 'history-man', historyManLine(man));
            line.dataset.workerId = man.id;
            site.appendChild(line);
        });
    }
    box.appendChild(site);
}

// One day, as a button: it opens that date on the day screen and does nothing else. With no
// site, every site of his day as the day screen draws it - in its colour, its name always
// written - and the day's kind; with a site, that site's own entry and «2 אתרים».
function historyRowNode(row, facts) {
    const words = historyRowWords(row, facts);
    const key = `row:${row.date}:${row.workerId}`;
    const node = button('', 'btn-secondary history-row', () => historyGoDay(row.date, key), words.label);
    node.dataset.historyKey = key;
    node.dataset.date = row.date;
    node.appendChild(el('span', 'history-when', words.when));
    // The man only when everyone is chosen: with one man his name is on the line under the
    // choices, and in every row's name.
    if (facts.workerId === null) node.appendChild(el('strong', 'history-name', words.name));
    const day = el('span', 'history-day');
    if (row.kind === 'absent') {
        day.appendChild(el('span', 'tag tag-absent', words.kind));
    } else {
        row.sites.forEach(site => {
            const tag = el('span', 'tag tag-place');
            appendSiteName(tag, site.id, site.name);
            paintSite(tag, site.id);
            day.appendChild(tag);
        });
        // A WORD, never only a colour: a double day may be heavier, and still says what it is.
        day.appendChild(el('span', row.kind === 'double' ? 'history-kind history-kind-double' : 'history-kind', words.kind));
        if (row.hours > 0) day.appendChild(el('span', 'history-hours', HISTORY_REUSED.hours(row.hours)));
        if (row.split) day.appendChild(el('span', 'badge badge-split', HISTORY_REUSED.split));
    }
    node.appendChild(day);
    return node;
}

// What each node of the list was drawn from - the key it is found by and the words it says -
// so that a redraw passes over what did not move. A WeakMap: nothing is written on the node.
const HISTORY_NODES = new WeakMap();

// The list as the sequence it is drawn in - each month's heading before its first day, the
// days, the foot - every item with its key, the words it is drawn from, and how to build it.
// A day's words are the row and the man's name and whether names are shown: its colour is
// its site's id (js/ui/sitecolor.js) and moves with nothing else.
function historyListItems(facts, shown) {
    const heading = {};
    facts.months.forEach(month => { heading[month.key] = month; });
    const everyone = facts.workerId === null;
    const items = [];
    let month = null;
    for (let at = 0; at < shown; at += 1) {
        const row = facts.rows[at];
        const key = row.date.slice(0, 7);
        if (key !== month) {
            const words = historyMonthHeading(heading[key]);
            const monthKey = key;
            items.push({ key: `month:${key}`, words, build: () => {
                const head = el('h4', 'history-month', words);
                head.dataset.month = monthKey;
                return head;
            } });
            month = key;
        }
        items.push({ key: `row:${row.date}:${row.workerId}`, words: JSON.stringify([row, facts.names[row.workerId], everyone]),
            build: () => historyRowNode(row, facts) });
    }
    items.push({ key: 'foot', words: JSON.stringify([facts.rows.length, shown]), build: () => historyFootNode(facts, shown) });
    return items;
}

// Under the rows: what a tap does, and - with more rows than drawn - how many of how many and
// the way to the next chunk, or, at the screen's cap, the sentence that says to narrow it.
function historyFootNode(facts, shown) {
    const T = HISTORY_TEXT;
    const total = facts.rows.length;
    const foot = el('div', 'history-foot');
    foot.appendChild(el('p', 'history-note', WORKER_CARD_TEXT.openDay));
    if (total > shown) {
        if (shown >= HISTORY_SHOWN_MAX) {
            foot.appendChild(el('p', 'history-note history-count', T.capped(shown, total)));
        } else {
            foot.appendChild(el('p', 'history-note history-count', T.shown(shown, total)));
            const next = Math.min(HISTORY_CHUNK, total - shown, HISTORY_SHOWN_MAX - shown);
            const more = button(T.more(next), 'btn-secondary history-more', () => historyMore());
            more.dataset.historyKey = 'more';
            foot.appendChild(more);
        }
    }
    return foot;
}

// The focused row or button of the list, by its key; and the one drawn again under it.
function historyFocusedKey(list) {
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    if (!active || !list || typeof list.contains !== 'function' || !list.contains(active)) return '';
    return (active.dataset && active.dataset.historyKey) || '';
}

function historyFocusKey(list, key) {
    if (!key || !list || typeof list.querySelectorAll !== 'function') return false;
    const again = [...list.querySelectorAll('button')].find(node => node.dataset && node.dataset.historyKey === key);
    if (!again || !again.focus) return false;
    again.focus({ preventScroll: true });
    return true;
}

// THE LIST, built again only where it moved. A commit or a snapshot from another phone under
// six hundred drawn days changes a day or two: what no longer stands, or no longer says what
// it said, is taken out; every other node stays the node it was - in its place, the focus
// still on it - and only the new and the changed are built and put in where they go. The
// answer is the list a fresh draw would make, node for node (tests/history.test.mjs).
function historyDrawList(facts) {
    const list = historyParts().list;
    if (!list) return;
    const held = historyFocusedKey(list);
    if (facts.rows.length === 0) {
        clear(list);
        list.appendChild(emptyHint(HISTORY_TEXT.empty));
        return;
    }
    const items = historyListItems(facts, historyShownNow(facts));
    const wanted = new Map(items.map(item => [item.key, item.words]));
    const kept = new Map();
    [...list.children].forEach(node => {
        const drawn = HISTORY_NODES.get(node);
        if (drawn && wanted.get(drawn.key) === drawn.words && !kept.has(drawn.key)) kept.set(drawn.key, node);
        else list.removeChild(node);
    });
    items.forEach((item, at) => {
        let node = kept.get(item.key);
        if (!node) {
            node = item.build();
            HISTORY_NODES.set(node, { key: item.key, words: item.words });
        }
        const here = list.children[at] || null;
        if (here === node) return;
        if (node.parentNode === list) list.removeChild(node);
        list.insertBefore(node, here);
    });
    if (held && !historyFocusedKey(list)) historyFocusKey(list, held);
}

// THE ONE DRAW: the facts read once, and the screen touched only where they moved.
function historyDraw(read) {
    if (!HISTORY) return;
    const facts = read || historyFacts();
    HISTORY_FACTS = facts;
    const signature = historySignature(facts, historyShownNow(facts));
    if (signature !== HISTORY_DRAWN) {
        HISTORY_DRAWN = signature;
        historyDrawChoices(facts);
        historyDrawTotals(facts);
        historyDrawList(facts);
    }
    if (HISTORY.textOpen) historyFillText(facts);
}

// ================================================================== the frame

function historyIsOpen() {
    if (HISTORY === null || typeof document === 'undefined' || !document.getElementById) return false;
    const modal = document.getElementById('historyModal');
    return Boolean(modal && modal.style.display === 'flex');
}

// Opened on one man (the finder's door) or on everyone: every site, «3 החודשים האחרונים» - on
// the first of a month «החודש» would open on nothing, and three months cover the last pay
// periods of both cycles. A man who left the record between the list and the tap opens
// nothing. The dialog enters at its own heading, by hand: js/ui/modal.js enters at a heading
// only when it stands directly in .modal-content, and this one stands beside «סגור».
function openHistory(workerId) {
    const parts = historyParts();
    if (!parts.modal) return false;
    const workers = (State.schedule.workers || []).filter(Boolean);
    const man = workerId === null || workerId === undefined ? null
        : workers.find(worker => String(worker.id) === String(workerId)) || null;
    if (workerId !== null && workerId !== undefined && !man) return false;

    HISTORY = { workerId: man ? String(man.id) : null, placeId: null, range: 'last3', from: null, to: null,
        shown: HISTORY_CHUNK, textOpen: false };
    HISTORY_DRAWN = null;
    HISTORY_ASKING = false;
    const T = HISTORY_TEXT;
    const R = HISTORY_REUSED;
    const say = (node, text) => historySay(node, text);
    const get = id => document.getElementById(id);
    say(parts.title, T.title);
    say(parts.close, MONTH_SUMMARY_REUSED.close);
    say(get('historyManLabel'), T.man);
    say(get('historySiteLabel'), T.site);
    say(get('historyRangeLabel'), R.range);
    say(get('historyFromLabel'), R.from);
    say(get('historyToLabel'), R.to);
    say(parts.fold, T.asText);
    say(parts.send, MONTH_SUMMARY_REUSED.send);
    say(parts.copy, MONTH_SUMMARY_REUSED.copy);
    say(parts.status, '');
    if (parts.text) historySetAttribute(parts.text, 'aria-label', T.asText);
    historyShowText(false);
    if (parts.text) parts.text.value = '';

    historyDraw();
    if (parts.scroll) parts.scroll.scrollTop = 0;
    parts.modal.style.display = 'flex';
    // Forced into effect first: an element that was display:none a line ago cannot focus.
    void parts.modal.offsetHeight;
    if (parts.title && parts.title.focus) parts.title.focus({ preventScroll: true });
    return true;
}

// Closed by «סגור», Escape or the backdrop (js/ui/modal.js), or by a day's door. Nothing is
// kept: the question, the drawn rows and the text all go with it.
function closeHistory() {
    const parts = historyParts();
    HISTORY = null;
    HISTORY_FACTS = null;
    HISTORY_DRAWN = null;
    HISTORY_OPTIONS = {};
    if (!parts.modal || parts.modal.style.display !== 'flex') return;
    parts.modal.style.display = 'none';
    historyShowText(false);
    if (parts.text) parts.text.value = '';
    historySay(parts.status, '');
    if (parts.totals) clear(parts.totals);
    if (parts.list) clear(parts.list);
    // THE WAY BACK, as the finder takes it (closeFind): js/ui/modal.js gives the focus back to
    // what opened the finder, but the day is drawn again from nothing whenever the record
    // changes under the dialog, and that button is then off the page. Once that has had its
    // turn, and only if nothing else took the focus, the finder's button standing there now
    // takes it. Focus only, never a scroll.
    setTimeout(() => {
        const active = document.activeElement;
        const lost = !active || active === document.body || parts.modal.contains(active);
        const entry = document.getElementById('findEntry');
        const open = [...document.querySelectorAll('.modal')].some(node => node.style.display === 'flex');
        if (lost && entry && !open) entry.focus({ preventScroll: true });
    }, 0);
}

// render() calls this (js/app.js): a commit, or a snapshot adopted from another phone, while
// it is open must move its counts and its rows. Where the reader had scrolled to is kept, and
// a record that did not move changes nothing.
function renderHistoryIfOpen() {
    if (!historyIsOpen()) return;
    const scroll = historyParts().scroll;
    const at = scroll ? scroll.scrollTop : 0;
    historyDraw();
    if (scroll && scroll.scrollTop !== at) scroll.scrollTop = at;
}

// A choice changed: the man, the site, the range, or one of the two dates. Only what is read
// moves; the focus stays on the field the choice was made in.
function historyChoose(which) {
    if (!historyIsOpen()) return;
    const parts = historyParts();
    if (which === 'man' && parts.man) {
        HISTORY.workerId = parts.man.value ? String(parts.man.value) : null;
    } else if (which === 'site' && parts.site) {
        HISTORY.placeId = parts.site.value ? String(parts.site.value) : null;
    } else if (which === 'range' && parts.range) {
        const key = parts.range.value;
        if (HISTORY_RANGES.indexOf(key) === -1) return;
        if (key === 'custom' && HISTORY.range !== 'custom') {
            // Filled in with the dates the range before it READ - never a day after today.
            const today = todayStr();
            const read = historyDatesRead(State.schedule, HISTORY, today) || { from: today, to: today };
            HISTORY.from = read.from;
            HISTORY.to = read.to;
        }
        HISTORY.range = key;
        if (key !== 'custom') {
            HISTORY.from = null;
            HISTORY.to = null;
        }
    } else if (which === 'dates' && parts.from && parts.to) {
        if (!historyChooseDates(parts)) return;
    } else {
        return;
    }
    HISTORY.shown = HISTORY_CHUNK;
    historyDraw();
}

// The two fields of «תאריכים אחרים». A date that is not a date is put back; an end after today
// is read as today - the cut - and written back as today, so the field and the line say the
// same day; a start after the last day that would be read is REFUSED, not swapped, in the
// reports' own words (dateInput, js/ui/reports.js): a swap answers a question nobody asked.
function historyChooseDates(parts) {
    const today = todayStr();
    const putBack = () => {
        if (parts.from.value !== HISTORY.from) parts.from.value = HISTORY.from;
        if (parts.to.value !== HISTORY.to) parts.to.value = HISTORY.to;
    };
    const from = parts.from.value;
    let to = parts.to.value;
    if (!isRealDate(from) || !isRealDate(to)) { putBack(); return false; }
    if (to > today) {
        to = today;
        parts.to.value = today;
    }
    if (from > to) {
        putBack();
        if (typeof askTell === 'function') {
            askTell({ title: HISTORY_REUSED.invertedTitle, message: HISTORY_REUSED.invertedMessage });
        }
        return false;
    }
    HISTORY.from = from;
    HISTORY.to = to;
    return true;
}

// «הצג עוד»: the next chunk drawn UNDER the drawn rows - the list is built again only where it
// moved (historyDrawList), so the days already unfolded stay as they are - and never past
// HISTORY_SHOWN_MAX. The focus goes to the first new row.
function historyMore() {
    if (!historyIsOpen()) return;
    const parts = historyParts();
    const facts = historyFacts();
    const before = historyShownNow(facts);
    HISTORY.shown = Math.min(before + HISTORY_CHUNK, HISTORY_SHOWN_MAX);
    const after = historyShownNow(facts);
    historyDraw(facts);
    if (after > before) historyFocusKey(parts.list, `row:${facts.rows[before].date}:${facts.rows[before].workerId}`);
}

// The text, folded away until asked for: a button and not a <details>, because the dialogs'
// Tab trap (js/ui/modal.js) knows buttons and fields. The two doors are inside the fold, so
// the text is on the screen before it can leave.
function historyShowText(show) {
    const parts = historyParts();
    if (parts.foldBody && parts.foldBody.hidden !== !show) parts.foldBody.hidden = !show;
    if (parts.fold) historySetAttribute(parts.fold, 'aria-expanded', show ? 'true' : 'false');
}

function historyFillText(facts) {
    const field = historyParts().text;
    const text = historyText(facts);
    if (field && field.value !== text) field.value = text;
    return text;
}

function historyToggleText() {
    if (!historyIsOpen()) return;
    HISTORY.textOpen = !HISTORY.textOpen;
    historyShowText(HISTORY.textOpen);
    const field = historyParts().text;
    if (HISTORY.textOpen) historyFillText(HISTORY_FACTS || historyFacts());
    else if (field) field.value = '';
}

// The two doors any composed text leaves by (js/ui/share.js), each with the text built at the
// press. The dialog stays open behind the share sheet: it is a screen being read, not a
// message being written. Neither door answers while the fold is shut.
function historySend() {
    if (!historyIsOpen() || !HISTORY.textOpen) return;
    const parts = historyParts();
    const text = historyFillText(historyFacts());
    // With no share sheet the whole text would be put in a wa.me link. A long one is not: the
    // field is shown with the text selected and the line says to copy it.
    const sheet = typeof navigator !== 'undefined' && navigator && navigator.share;
    if (!sheet && encodeURIComponent(text).length > HISTORY_LINK_MAX) {
        if (parts.text) {
            parts.text.focus({ preventScroll: true });
            parts.text.select();
        }
        if (parts.status) {
            parts.status.textContent = HISTORY_TEXT.tooLongForLink;
            setTimeout(() => { if (parts.status.textContent === HISTORY_TEXT.tooLongForLink) parts.status.textContent = ''; }, 6000);
        }
        return;
    }
    shareTextOut(text, parts.status, () => { setTimeout(() => { parts.status.textContent = ''; }, 4000); });
}

function historyCopy() {
    if (!historyIsOpen() || !HISTORY.textOpen) return;
    const parts = historyParts();
    historyFillText(historyFacts());
    copyTextOut(parts.text, parts.status);
}

// A DAY'S DOOR NAVIGATES: the dialog closes and the day screen opens on that date - what a day
// of the site's card does (siteCardGoDay), a follow still owed from midnight settled by his
// choice (dayChosenByHand, js/app.js). A day the record no longer holds is still a date and
// opens empty, as the week's cell does.
//
// WHILE «בניית סידור» IS OPEN it asks first (the head of this file says why). «ביטול», Escape
// or the backdrop change nothing - no date, no key - and the focus goes back to the row that
// asked; the confirming answer leaves the journey by its own journeyLeave and then opens the
// day. Asked again after the answer: the journey may have ended meanwhile, and then no
// question is owed and the plain steps run. `key` is the asking row's, for the way back.
function historyGoDay(date, key) {
    if (!historyIsOpen() || !isRealDate(date) || HISTORY_ASKING) return Promise.resolve(false);
    const journeyOpen = () => typeof journeyStation === 'function' && journeyStation() > 0;
    // `leave`: only on the person's own yes, and only if the journey is still there to leave.
    const go = leave => {
        closeHistory();
        if (leave && journeyOpen() && typeof journeyLeave === 'function') journeyLeave();
        State.date = date;
        if (typeof dayChosenByHand === 'function') dayChosenByHand();
        showView('day');
        return true;
    };
    if (!journeyOpen()) return Promise.resolve(go(false));
    // A journey open and no way to ask: nothing opens, rather than the journey moved unasked.
    if (typeof askConfirm !== 'function') return Promise.resolve(false);
    const T = HISTORY_TEXT;
    const named = day => { const parsed = parseLocalDate(day); return `${hebrewDayName(parsed)} ${formatFullDate(parsed)}`; };
    const sederDay = typeof journeyDate === 'function' && isRealDate(journeyDate()) ? journeyDate() : State.date;
    HISTORY_ASKING = true;
    return askConfirm({ title: T.leaveTitle, message: T.leaveMessage(named(date), named(sederDay)), ok: T.leaveOk })
        .then(yes => {
            HISTORY_ASKING = false;
            if (!historyIsOpen()) return false;
            if (!yes) {
                historyFocusKey(historyParts().list, key);
                return false;
            }
            return go(true);
        });
}
