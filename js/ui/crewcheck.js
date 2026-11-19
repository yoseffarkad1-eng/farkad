// «בדיקת הצוות» - the crew's housekeeping, asked for.
//
// The crew screen already says three of these things, one row at a time: «בלי טלפון» on a
// man's meta line, «שם כפול» and «מספר משותף» as badges (js/ui/roster.js). On a crew of forty
// they are read by nobody - and three of the facts that cost the most are not on the row at
// all: a number that is typed but will never open in WhatsApp (the row shows it like any
// other, "📞 03-5551234"), a man with no daily rate (the row simply leaves «יומי» out), and a
// man or a site that stopped working weeks ago and is still on the active list - in «לא
// נרשמו» every evening, a card on the day screen every day. Each of them, said every evening
// as news, would cry wolf; asked for, on the crew screen, they are a checklist. So: ONE
// button at the foot of the crew screen, after the sites, and ONE dialog.
//
// IT WRITES NOTHING. No commit, no Store key, nothing to the record, the outbox, the cloud,
// a backup, a restore point or the rescue file, and it marks nothing "seen" or "ignored": a
// mark would be a claim that somebody looked, and the next opening reads the record again
// and says what it says. The reading is a pure function of (schedule, today, layer, asOf) -
// no DOM, no Store, no State, no clock - and tests/crewcheck.test.mjs holds the whole disk
// byte for byte across it and across every door. A name or a site only NAVIGATES: to the
// man's own details form, the field that is wrong focused, or to the man's or the site's row,
// where «פעיל» and «עוד ⋯» already are. The dialog archives, renames, edits and deletes
// nobody; the screens it leads to keep their own questions.
//
// IT DOES NOT SAY A MAN LEFT. The record says only that it holds no work for him in the last
// CREW_CHECK_IDLE_DAYS working days, and when his last one was; an occasional man is named
// while he is away that long, and the owner decides. None of its words says «עזב», «סיים» or
// «הפסיק», and none says «נשלח».
//
// The rules, the thresholds and every number behind them are features/crewcheck/contract.md
// (revision 2); the suite holds each rule, each agreement with the screens that already say
// the same thing, and the noise on seeded seasons.

// ================================================================== THE WORDS
//
// EVERY HEBREW STRING THIS FEATURE SHOWS, AND NOTHING ELSE, IN ONE BLOCK. Proposed, not
// approved word by word: the owner corrects them. Hebrew strings are product decisions
// (CLAUDE.md, law 6) - tests/crewcheck.test.mjs pins every one, word for word, and changing
// one here moves the pinned line there in the same commit. The words that already existed
// are borrowed (CREW_CHECK_REUSED, below) and not said again. A name in a template is
// already bidi-isolated by the caller, a number LTR-isolated. Nothing here is ever sent
// anywhere: the dialog is on the screen only.
const CREW_CHECK_TEXT = Object.freeze({
    // --- the way in, at the foot of the crew screen; and the dialog's title
    entry: 'בדיקת הצוות',
    title: 'בדיקת הצוות',
    // under the title, after the day and its date:
    // «יום חמישי 19/11/2026 · עובדים פעילים: 40 · אתרים פעילים: 6»
    counts: (men, sites) => `עובדים פעילים: ${men} · אתרים פעילים: ${sites}`,
    // first in the list while the record holds fewer working days than the long-idle rules
    // need - so the calm line under it is not read as "nobody has been away"
    tooFew: days => `עדיין אין ${days} ימי עבודה רשומים, ולכן לא נבדקו עובדים ואתרים בלי עבודה זמן רב.`,
    clean: '✓ לא נמצא בצוות דבר שכדאי לבדוק.',

    // --- what a name or a site does, read aloud
    goForm: name => `עריכת הפרטים של ${name}`,
    goRow: name => `הצג את ${name} ברשימת העובדים`,
    goSite: name => `הצג את ${name} ברשימת האתרים`,

    // --- כדאי לבדוק
    // Of a man none of whose recorded days carries a daily rate: true of those days and of the
    // days to come, while he has no rate.
    noRate: count => (count === 1
        ? 'בלי שכר יומי - ימי העבודה שלו לא יחושבו בשכר:'
        : 'בלי שכר יומי - ימי העבודה שלהם לא יחושבו בשכר:'),
    // Of a man whose rate was cleared AFTER days of his were stamped with it: the pay sheet
    // prices those at their stamp (iron law 2), so only the days to come are said.
    noRateFromNow: count => (count === 1
        ? 'בלי שכר יומי - ימי עבודה שיירשמו לו מעכשיו לא יחושבו בשכר:'
        : 'בלי שכר יומי - ימי עבודה שיירשמו להם מעכשיו לא יחושבו בשכר:'),
    // around the seder's own words for the same fact, «אין מספר טלפון תקין»
    badPhone: count => (count === 1
        ? `${CREW_CHECK_REUSED.noPhone} - המספר שנרשם לו לא ייפתח בוואטסאפ:`
        : `${CREW_CHECK_REUSED.noPhone} - המספרים שנרשמו להם לא ייפתחו בוואטסאפ:`),
    // around the row's own badge: «מספר משותף - 052-000-0010 רשום אצל 2 עובדים פעילים:»
    sharedPhone: (number, count) => `${CREW_CHECK_REUSED.shared} - ${number} רשום אצל ${count} עובדים פעילים:`,
    // around the row's own badge, and what the number beside each of them is (twin, below):
    // «שם כפול - 2 עובדים פעילים בשם וליד זועבי, ממוספרים לפי הסדר ברשימת העובדים:»
    sameName: (count, name) => `${CREW_CHECK_REUSED.sameName} - ${count} עובדים פעילים בשם ${name}, ממוספרים לפי הסדר ברשימת העובדים:`,
    idle: (count, days, since) => (count === 1
        ? `לא עבד ב-${days} ימי העבודה האחרונים (מאז ${since}), ועדיין פעיל:`
        : `לא עבדו ב-${days} ימי העבודה האחרונים (מאז ${since}), ועדיין פעילים:`),
    // Under the idle men, quiet, and then the archive question's own sentence: the row he is
    // taken to switches a man off with no question, so what that does is said before he gets
    // there. «פעיל» is the switch's own word (js/ui/roster.js). Alone, the borrowed sentence -
    // the body of «להסתיר זמנית את X?» - read as a fact about the men above it ("the check took
    // them off the list"); the condition makes it the answer to its own question.
    archiveIf: 'אם מכבים עובד בכפתור «פעיל»:',
    idleSites: (count, days, since) => (count === 1
        ? `אתר שלא נרשמה בו עבודה ב-${days} ימי העבודה האחרונים (מאז ${since}), ועדיין פעיל:`
        : `אתרים שלא נרשמה בהם עבודה ב-${days} ימי העבודה האחרונים (מאז ${since}), ועדיין פעילים:`),

    // --- לידיעה, never counted
    // It is the APP that will not open it - the seder refuses another country's number on
    // purpose (sederWaNumber) - and not WhatsApp, where the owner may write to him every day.
    otherPhone: count => (count === 1
        ? 'מספר שאינו נייד ישראלי - האפליקציה לא תפתח לו הודעה בוואטסאפ:'
        : 'מספרים שאינם ניידים ישראליים - האפליקציה לא תפתח להם הודעה בוואטסאפ:'),
    // around the row's own «בלי טלפון»
    noPhone: count => (count === 1
        ? `${CREW_CHECK_REUSED.noPhoneRow} - אי אפשר לפתוח לו הודעה בוואטסאפ:`
        : `${CREW_CHECK_REUSED.noPhoneRow} - אי אפשר לפתוח להם הודעה בוואטסאפ:`),
    // days recorded while his roster had an hourly rate and no daily one: their stamp is for
    // ever (iron law 2), so this promises nothing and asks for nothing - it is the reason the
    // pay sheet can still say «בלי שכר יומי - הנצבר לא חושב» about him after his rate is typed,
    // for the WHOLE account period that holds one, the days at the new rate in it too (one
    // unpriced day and payrollReport gives the period no amount); said in the sheet's words
    zeroStamped: count => (count === 1
        ? 'ימים שנרשמו לו בלי שכר יומי - בתקופת החשבון שלהם הנצבר לא יחושב, גם אחרי שיוזן שכר:'
        : 'ימים שנרשמו להם בלי שכר יומי - בתקופת החשבון שלהם הנצבר לא יחושב, גם אחרי שיוזן שכר:'),
    // the man named as the subject, as the sites' line names the site
    never: count => (count === 1 ? 'עובד פעיל בלי אף יום עבודה רשום:' : 'עובדים פעילים בלי אף יום עבודה רשום:'),
    neverSites: count => (count === 1 ? 'אתר פעיל בלי אף יום עבודה רשום:' : 'אתרים פעילים בלי אף יום עבודה רשום:'),

    // --- a chip that says more than the name: «ראמי חורי · 11/10», «יוסי מזרחי · +970
    // 59-123-4567», «עלי חסן · יום אחד». Not the day check's «N ימים» template: it is never
    // asked for one day, and «1 ימים» is not Hebrew.
    chip: (name, more) => `${name} · ${more}`,
    oneDay: 'יום אחד',
    days: n => `${n} ימים`,
    // A name two or more active men hold, with his place among them in the crew list's order -
    // the same on every line he is on, in the words and read aloud: «וליד זועבי (2)». Brackets,
    // not « · 2», which would read like a chip's day or count.
    twin: (name, n) => `${name} (${n})`
});

// The words it borrows, each beside the screen that owns it. Read from their owners' blocks
// at load where the owner keeps a block (the day check's and the seder's - index.html puts
// this file after both); repeated here where the owner keeps them inline (js/ui/roster.js).
// tests/crewcheck.test.mjs finds every one in its owner's source, so a word changed there and
// not here fails by name.
const CREW_CHECK_REUSED = Object.freeze({
    headCheck: DAY_CHECK_TEXT.headCheck,          // «כדאי לבדוק»
    headInfo: DAY_CHECK_TEXT.headInfo,            // «לידיעה»
    lead: DAY_CHECK_TEXT.lead,                    // «הבדיקה רק מראה מה כדאי לבדוק. היא לא משנה ולא שומרת דבר.»
    close: DAY_CHECK_TEXT.close,                  // «סגור»
    noPhone: SEDER_TEXT.noPhone,                  // «אין מספר טלפון תקין», a man's row in the seder
    noPhoneRow: 'בלי טלפון',                      // js/ui/roster.js, a man's meta line
    shared: 'מספר משותף',                         // js/ui/roster.js, the badge
    sameName: 'שם כפול',                          // js/ui/roster.js, the badge
    // js/ui/roster.js, the body of «להסתיר זמנית את X?» (setWorkerArchived)
    archiveSays: 'הימים שכבר נרשמו יישמרו, והעובד לא יופיע ברשימה היומית.'
});

// ================================================================== the reading
//
// Pure, all of it: (schedule, today, layer, asOf) in, a plain object out. Nothing below this
// line and above "the screen" touches the DOM, Store, State or the clock.

// 25 WORKING DAYS - "a month", honestly counted: with Saturdays off it is never less than 29
// calendar days, so «לא עבד ב-25 ימי העבודה האחרונים» is true however many holidays fell inside
// it. Measured on the contract's turnover model, each evening read as of itself: 29.6% of the
// men it names work again later (48.6% at the day check's 13, 23.7% at 30), and a man who left
// is first named a median 31 calendar days after his last day, 42 at most.
const CREW_CHECK_IDLE_DAYS = 25;

// A digit, exactly as the seder's rule reads one (sederWaNumber, js/ui/seder.js): ASCII,
// Arabic-Indic (U+0660-0669) and Extended Arabic-Indic (U+06F0-06F9).
const CREW_CHECK_DIGIT = /[0-9٠-٩۰-۹]/;

function crewCheckTyped(phone) {
    return String(phone === undefined || phone === null ? '' : phone).trim();
}

// ANOTHER COUNTRY'S NUMBER, AS TYPED: a `+` or a `00` the owner wrote first, and after it a
// country that is not 972. Only a prefix that was typed makes a number foreign - a bare
// string of digits with no 0 is an Israeli number gone wrong (a dropped 0, a landline with
// no area code), and it belongs with the typos, where it is mended in one field. Digits after
// the prefix that start with 0 are a local number behind a stray plus: no country code
// starts with 0.
//
// AND ONE NUMBER. A field with two in it - a man with two SIMs, his West Bank number typed
// before his Israeli one - is two numbers whichever comes first: the seder refuses the field,
// and deleting one of the two mends it, so it is counted with the typos, exactly as the same
// two numbers the other way round are. One number has no second `+`, and no more digits after
// its prefix than a whole international number can have: 15, its country code included
// (ITU-T E.164). Two numbers never fit in 15 - the shortest pair is 17 - so the count alone
// tells them apart, however they were separated: a slash, a comma, a word or a space.
const CREW_CHECK_ONE_NUMBER_DIGITS = 15;
function crewCheckForeign(typed) {
    const text = String(typed)
        .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
        .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0))
        .replace(/[^0-9+]/g, '');
    let rest = null;
    if (text.startsWith('+')) rest = text.slice(1);
    else if (text.startsWith('00')) rest = text.slice(2);
    if (rest === null || rest.includes('+')) return false;
    return rest !== '' && rest.length <= CREW_CHECK_ONE_NUMBER_DIGITS && !rest.startsWith('972') && !rest.startsWith('0');
}

// What the phone field is, of four: 'none' (no digit typed at all - empty, spaces, «אין», a
// lone `+`), 'ok' (the seder opens it), 'other' (another country's, as typed) or 'bad' (a
// number written as an Israeli one that will not open). The last three are exactly the men
// the seder says «אין מספר טלפון תקין» about, and they are disjoint by construction.
function crewCheckPhoneKind(phone) {
    const typed = crewCheckTyped(phone);
    if (!CREW_CHECK_DIGIT.test(typed)) return 'none';
    if (sederWaNumber(typed) !== '') return 'ok';
    return crewCheckForeign(typed) ? 'other' : 'bad';
}

// Everything the check has to say about the roster, in ONE forward pass over the sorted day
// keys:
//
//   { today, since, counts: { men, sites },
//     check: { noRate, badPhone, sharedPhone, sameName, idle, idleSites },
//     info: { otherPhone, noPhone, zeroStamped, never, neverSites } }
//
// every list in roster order, a man as { id, name } (with `phone`, `last` or `days` where the
// line says one; on `noRate`, `priced`: how many of his recorded days carry a daily rate in
// their stamp - the days the pay sheet prices whatever the roster says now), a site as
// { id, name } (with `last`). `since` is the first of the last CREW_CHECK_IDLE_DAYS working
// days, or null while the record holds fewer.
//
// THE CALENDAR is the day check's own: a working day is a key on or before `today` on which
// any man the record holds, archived included, has a site (dayCheckIsWorkingDay) - absences
// alone, a Rima count alone and a יוסף גבס count alone are not; a Saturday with work is. A
// man's last day is the latest key on which he has a site, after today too (tomorrow's seder
// counts); a site's is the latest on which anybody has a site there or Rima's or יוסף גבס's
// men are counted on it.
//
// `asOf`, when it is given, is the evening the record is read as of: the pass stops at the
// first key after it, as if nothing later had been written yet. The app passes nothing -
// every key is read - and the suite reads each seeded evening as of itself, which is the only
// way "of the men it named, how many came back" measures anything: read on the whole record,
// a man who comes back later is never idle on an evening before he does.
function crewCheckRead(schedule, today, layer, asOf) {
    const read = {
        today, since: null, counts: { men: 0, sites: 0 },
        check: { noRate: [], badPhone: [], sharedPhone: [], sameName: [], idle: [], idleSites: [] },
        info: { otherPhone: [], noPhone: [], zeroStamped: [], never: [], neverSites: [] }
    };
    if (!schedule) return read;
    const side = layer || 'actual';
    const workers = (schedule.workers || []).filter(Boolean);
    const active = workers.filter(worker => worker.active !== false);
    const places = (schedule.places || []).filter(place => place && place.active !== false);
    read.counts = { men: active.length, sites: places.length };
    const activeById = new Map(active.map(worker => [worker.id, worker]));
    const placeIds = new Set(places.map(place => place.id));
    const bound = isRealDate(asOf) ? asOf : null;
    const dates = Object.keys(schedule.days || {}).filter(isRealDate).sort();

    const working = [];
    const lastMan = new Map();
    const lastSite = new Map();
    const zero = new Map();
    const priced = new Map();
    for (const date of dates) {
        if (bound !== null && date > bound) break;
        if (date <= today && dayCheckIsWorkingDay(schedule, date, side)) working.push(date);
        const records = dayCheckSide(schedule, date, side);
        if (records) {
            Object.keys(records).forEach(id => {
                if (!dayCheckHasSite(schedule, date, id, side)) return;
                lastMan.set(id, date);
                records[id].entries.forEach(entry => {
                    if (entry && placeIds.has(entry.placeId)) lastSite.set(entry.placeId, date);
                });
                // A day whose STAMP has no daily rate: the pay sheet never prices it, and no
                // rate typed now changes that. A day whose stamp HAS one is priced at it, the
                // roster's rate cleared or not (iron law 2) - what «בלי שכר יומי» may not deny.
                // The pay report reads the 'actual' layer and no other (ratesForDay), so this
                // does too - the day check's own call. One fact each, and no figure.
                const worker = activeById.get(id);
                if (worker && side === 'actual') {
                    const rates = ratesForDay(schedule, date, id, worker);
                    if (rates.stamped && rates.daily <= 0) zero.set(id, (zero.get(id) || 0) + 1);
                    if (rates.stamped && rates.daily > 0) priced.set(id, (priced.get(id) || 0) + 1);
                }
            });
        }
        // A site Rima's men or יוסף גבס's men are counted on is in use.
        places.forEach(place => {
            if (rimaCount(schedule, date, place.id) > 0 || yosefGevesCount(schedule, date, place.id) > 0) {
                lastSite.set(place.id, date);
            }
        });
    }
    if (working.length >= CREW_CHECK_IDLE_DAYS) read.since = working[working.length - CREW_CHECK_IDLE_DAYS];
    // At least CREW_CHECK_IDLE_DAYS working days after `last`: the calendar is sorted, so
    // that is exactly `last` before the first of the last CREW_CHECK_IDLE_DAYS of them.
    const idle = last => last !== null && read.since !== null && last <= today && last < read.since;

    active.forEach(worker => {
        const who = { id: worker.id, name: worker.name };
        const last = lastMan.has(worker.id) ? lastMan.get(worker.id) : null;
        const kind = crewCheckPhoneKind(worker.phone);
        // '' / 0 / '0' / undefined / negative - and an hourly rate alone, which stamps
        // daily: 0 onto his days (currentRates, js/model/money.js) and is never priced.
        if ((Number(worker.dailyRate) || 0) <= 0) read.check.noRate.push({ id: who.id, name: who.name, priced: priced.get(worker.id) || 0 });
        if (kind === 'bad') read.check.badPhone.push({ id: who.id, name: who.name, phone: crewCheckTyped(worker.phone) });
        if (kind === 'other') read.info.otherPhone.push({ id: who.id, name: who.name, phone: crewCheckTyped(worker.phone) });
        if (last === null) read.info.never.push(who);
        else if (idle(last)) read.check.idle.push({ id: who.id, name: who.name, last });
        // No number at all, for a man working these days: the one a message would be opened for.
        else if (kind === 'none') read.info.noPhone.push(who);
        if (zero.has(worker.id)) read.info.zeroStamped.push({ id: who.id, name: who.name, days: zero.get(worker.id) });
    });

    places.forEach(place => {
        const last = lastSite.has(place.id) ? lastSite.get(place.id) : null;
        if (last === null) read.info.neverSites.push({ id: place.id, name: place.name });
        else if (idle(last)) read.check.idleSites.push({ id: place.id, name: place.name, last });
    });

    // ONE NUMBER ON TWO ACTIVE ROWS, compared the way the roster's badge compares them
    // (normalisePhone: 052-884-1930 and +972 52 884 1930 are one number). A group in which
    // every number opens is compared again by the number the seder hands wa.me: normalisePhone
    // reads ASCII digits only, so '٠٥٢-884-1930' and '٠٥٣-884-1930' - two usable and
    // different numbers - are one number there, and the seder's own comparison keeps them
    // apart. Only the sub-groups of two or more stand.
    const order = new Map(workers.map((worker, at) => [worker.id, at]));
    const byNumber = new Map();
    active.forEach(worker => {
        const key = normalisePhone(worker.phone);
        if (!key) return;
        if (!byNumber.has(key)) byNumber.set(key, []);
        byNumber.get(key).push(worker);
    });
    const shared = [];
    byNumber.forEach((men, key) => {
        if (men.length < 2) return;
        const numbers = men.map(worker => sederWaNumber(worker.phone));
        let groups = [men];
        if (numbers.every(number => number !== '')) {
            const again = new Map();
            men.forEach((worker, at) => {
                if (!again.has(numbers[at])) again.set(numbers[at], []);
                again.get(numbers[at]).push(worker);
            });
            groups = [...again.values()];
        }
        groups.filter(group => group.length > 1).forEach(group => shared.push({
            number: crewCheckTyped(group[0].phone), key,
            men: group.map(worker => ({ id: worker.id, name: worker.name }))
        }));
    });
    read.check.sharedPhone = shared.sort((a, b) => order.get(a.men[0].id) - order.get(b.men[0].id));

    // ONE NAME ON TWO ACTIVE ROWS, compared exactly as the row's «שם כפול» compares them
    // (hasDuplicateName, js/ui/roster.js): the same string, active men only.
    const byName = new Map();
    active.forEach(worker => {
        if (!byName.has(worker.name)) byName.set(worker.name, []);
        byName.get(worker.name).push(worker);
    });
    byName.forEach((men, name) => {
        if (men.length > 1) read.check.sameName.push({ name, men: men.map(worker => ({ id: worker.id, name: worker.name })) });
    });
    return read;
}

// A date the way the dialog says it: «11/10» in today's year, «28/12/2025» in another.
function crewCheckDateWord(date, today) {
    const parsed = parseLocalDate(date);
    if (!parsed) return String(date);
    const year = isRealDate(today) ? today.slice(0, 4) : null;
    return date.slice(0, 4) === year ? formatShortDate(parsed) : formatFullDate(parsed);
}

// The line under the title: «יום חמישי 19/11/2026 · עובדים פעילים: 40 · אתרים פעילים: 6».
function crewCheckContext(read) {
    const parsed = parseLocalDate(read.today);
    const day = parsed ? `${hebrewDayName(parsed)} ${formatFullDate(parsed)} · ` : '';
    return day + CREW_CHECK_TEXT.counts(read.counts.men, read.counts.sites);
}

// WHERE A LINE MAY BREAK (fix round 1). On a narrow phone the line under the title broke
// inside «label: n», leaving the men's count at the head of the sites' line, and a typed
// number broke at its hyphen - «… · 03-» and then «5551234», two numbers to the eye, when the
// number is the one fact the line is there to show. So each piece that must be read whole is
// ONE inline block (.crewcheck-whole, css/design.css - .report-dates' rule): it goes to the
// next line whole, and wraps inside itself only when no line can hold it at all (320px at
// doubled text). The words are the same words: textContent is one sentence, as before.
//
// The line under the title, drawn as its three pieces - the day, the men, the sites - with
// the separators between them, where it may break.
function crewCheckContextInto(node, read) {
    node.textContent = '';
    crewCheckContext(read).split(' · ').forEach((part, at) => {
        if (at > 0) node.appendChild(el('span', null, ' · '));
        node.appendChild(el('span', 'crewcheck-whole', part));
    });
    return node;
}

// Words that may hold a typed number - an LTR isolate, LRI…PDI (isolateLtr) - as `node`'s
// own text up to the first number, and after it each number one block of its own, laid out
// left to right (.crewcheck-number), and the words between and after it as they were.
const CREW_CHECK_NUMBER = /(\u2066[^\u2069]*\u2069)/;
function crewCheckWordsInto(node, words) {
    const parts = String(words).split(CREW_CHECK_NUMBER);
    node.textContent = parts[0];
    parts.slice(1).forEach((part, at) => {
        if (part === '') return;
        node.appendChild(el('span', at % 2 === 0 ? 'crewcheck-whole crewcheck-number' : null, part));
    });
    return node;
}

// A man's chip: what it says, what it says aloud, and where it goes. Read aloud, a chip that
// says more than his name says that first (dayCheckWorkerChip's rule, js/ui/daycheck.js).
// `twins`: each active man whose name another active man holds too, to his place among them
// (crewCheckTwins) - his number goes after his name on every chip of his, so that two men
// with one name are never two identical buttons read aloud alike.
function crewCheckManChip(worker, door, field, more, twins) {
    const mark = twins && twins.has(worker.id) ? twins.get(worker.id) : null;
    const name = isolate(worker.name);
    const said = mark === null ? name : CREW_CHECK_TEXT.twin(name, mark);
    const plain = more === undefined && mark === null;
    const text = plain ? worker.name : (more === undefined ? said : CREW_CHECK_TEXT.chip(said, more));
    const go = door === 'form' ? CREW_CHECK_TEXT.goForm(name) : CREW_CHECK_TEXT.goRow(name);
    const chip = { text, aria: plain ? go : `${text} - ${go}`, door, workerId: worker.id };
    if (field) chip.field = field;
    return chip;
}

// The namesakes' numbers: each active man in a «שם כפול» finding to his place in it, 1, 2, …
// - the finding lists them in roster order, the order of the crew list.
function crewCheckTwins(read) {
    const twins = new Map();
    read.check.sameName.forEach(group => group.men.forEach((man, at) => twins.set(man.id, at + 1)));
    return twins;
}

function crewCheckSiteChip(place, more) {
    const name = isolate(place.name);
    const text = more === undefined ? place.name : CREW_CHECK_TEXT.chip(name, more);
    const go = CREW_CHECK_TEXT.goSite(name);
    return { text, aria: more === undefined ? go : `${text} - ${go}`, door: 'site', placeId: place.id };
}

// What the dialog draws, as a flat list - what to check first, then what is for information:
//
//   [{ kind, tier: 'check' | 'info', say, note | null,
//      chips: [{ text, aria, door: 'form' | 'row' | 'site', workerId? | placeId?, field? }] }]
//
// `say` is the finding's sentence, `note` the quiet line under its chips (only the idle men
// have one), and each chip one man or one site with the one door it opens. A kind is one
// finding, but for one number or one name on two rows (one finding each) and «בלי שכר יומי»
// (two at most: the men none of whose days is priced, then the men with days that still are).
// Pure: the reading and today's date in, words out.
function crewCheckFindings(read, today) {
    const out = [];
    if (!read || !read.check || !read.info) return out;
    const day = isRealDate(today) ? today : read.today;
    const T = CREW_CHECK_TEXT;
    const since = read.since ? crewCheckDateWord(read.since, day) : '';
    const push = (kind, tier, say, chips, note) => out.push({ kind, tier, say, note: note || null, chips });
    const c = read.check;
    const i = read.info;
    const twins = crewCheckTwins(read);
    const man = (worker, door, field, more) => crewCheckManChip(worker, door, field, more, twins);

    // «בלי שכר יומי» in the words true of each man: «ימי העבודה שלו לא יחושבו בשכר» only of a
    // man none of whose recorded days carries a daily rate (no stamp - priced by the roster's
    // nothing - or a stamp of 0), and of a man with days the sheet still prices at their stamp
    // only what is true of him - the days recorded from now on. Two lines when both are there.
    const unpriced = c.noRate.filter(worker => !(worker.priced > 0));
    const stillPriced = c.noRate.filter(worker => worker.priced > 0);
    if (unpriced.length > 0) push('noRate', 'check', T.noRate(unpriced.length), unpriced.map(worker => man(worker, 'form', 'daily')));
    if (stillPriced.length > 0) {
        push('noRate', 'check', T.noRateFromNow(stillPriced.length), stillPriced.map(worker => man(worker, 'form', 'daily')));
    }
    if (c.badPhone.length > 0) {
        push('badPhone', 'check', T.badPhone(c.badPhone.length),
            c.badPhone.map(worker => man(worker, 'form', 'phone', isolateLtr(worker.phone))));
    }
    c.sharedPhone.forEach(group => push('sharedPhone', 'check', T.sharedPhone(isolateLtr(group.number), group.men.length),
        group.men.map(worker => man(worker, 'form', 'phone'))));
    c.sameName.forEach(group => push('sameName', 'check', T.sameName(group.men.length, isolate(group.name)),
        group.men.map(worker => man(worker, 'form', 'name'))));
    if (c.idle.length > 0) {
        push('idle', 'check', T.idle(c.idle.length, CREW_CHECK_IDLE_DAYS, since),
            c.idle.map(worker => man(worker, 'row', null, crewCheckDateWord(worker.last, day))),
            `${T.archiveIf} ${CREW_CHECK_REUSED.archiveSays}`);
    }
    if (c.idleSites.length > 0) {
        push('idleSites', 'check', T.idleSites(c.idleSites.length, CREW_CHECK_IDLE_DAYS, since),
            c.idleSites.map(place => crewCheckSiteChip(place, crewCheckDateWord(place.last, day))));
    }

    if (i.otherPhone.length > 0) {
        push('otherPhone', 'info', T.otherPhone(i.otherPhone.length),
            i.otherPhone.map(worker => man(worker, 'form', 'phone', isolateLtr(worker.phone))));
    }
    if (i.noPhone.length > 0) {
        push('noPhone', 'info', T.noPhone(i.noPhone.length), i.noPhone.map(worker => man(worker, 'form', 'phone')));
    }
    if (i.zeroStamped.length > 0) {
        push('zeroStamped', 'info', T.zeroStamped(i.zeroStamped.length),
            i.zeroStamped.map(worker => man(worker, 'row', null, worker.days === 1 ? T.oneDay : T.days(worker.days))));
    }
    if (i.never.length > 0) {
        push('never', 'info', T.never(i.never.length), i.never.map(worker => man(worker, 'row')));
    }
    if (i.neverSites.length > 0) {
        push('neverSites', 'info', T.neverSites(i.neverSites.length), i.neverSites.map(place => crewCheckSiteChip(place)));
    }
    return out;
}

// ================================================================== the screen

function crewCheckParts() {
    const get = id => document.getElementById(id);
    return { host: get('crewCheckFoot'), modal: get('crewCheckModal'), title: get('crewCheckTitle'),
        context: get('crewCheckContext'), list: get('crewCheckList'), lead: get('crewCheckLead'),
        close: get('crewCheckClose') };
}

// THE ONE WAY IN, at the foot of the crew screen after the sites - where nothing that was
// measured before it moves (the first man stands 3px inside the lead the crew list is held
// to; contract.md, Entry and navigation). Built ONCE and kept, the same node through every
// later draw: js/ui/modal.js gives the focus back to the node that opened a dialog, and a
// button drawn again would no longer be on the page when the dialog it led to closes. An
// empty crew keeps exactly the three buttons that start one: the row is hidden, never removed.
function renderCrewCheckEntry() {
    const host = document.getElementById('crewCheckFoot');
    if (!host) return;
    let entry = host.firstChild;
    if (!entry || entry.id !== 'crewCheckEntry') {
        clear(host);
        entry = button(CREW_CHECK_TEXT.entry, 'btn-secondary crewcheck-entry', () => openCrewCheck());
        entry.id = 'crewCheckEntry';
        entry.setAttribute('aria-haspopup', 'dialog');
        host.appendChild(entry);
    }
    host.hidden = !(State.schedule && State.schedule.workers && State.schedule.workers.length > 0);
}

function crewCheckIsOpen() {
    const modal = document.getElementById('crewCheckModal');
    return Boolean(modal && modal.style.display === 'flex');
}

// Read in the tap - single milliseconds, so no placeholder and nothing after paint - drawn,
// shown, and entered at its heading. Opened at its top: a second opening does not begin where
// the last one was read to.
function openCrewCheck() {
    const parts = crewCheckParts();
    if (!parts.modal || !parts.list) return false;
    renderCrewCheck();
    parts.modal.style.display = 'flex';
    const content = parts.modal.querySelector('.modal-content');
    if (content) content.scrollTop = 0;
    // Forced into effect first: an element that was display:none a line ago cannot take focus.
    void parts.modal.offsetHeight;
    if (parts.title && parts.title.focus) parts.title.focus({ preventScroll: true });
    return true;
}

function closeCrewCheck() {
    const modal = document.getElementById('crewCheckModal');
    if (!modal || modal.style.display !== 'flex') return;
    modal.style.display = 'none';
    // THE WAY BACK (closeDayCheck's rule, js/ui/daycheck.js). js/ui/modal.js gives the focus
    // back to the button that opened the dialog; once that has had its turn, and only if
    // nothing else took the focus (the form a name opens, the row a name lands on), the
    // button that stands there now takes it. Focus only, never a scroll.
    setTimeout(() => {
        // "Nothing" is <body> - or a chip of the dialog just hidden, which a browser goes on
        // calling the active element until it next lays the page out.
        const active = document.activeElement;
        const lost = !active || active === document.body || modal.contains(active);
        const entry = document.getElementById('crewCheckEntry');
        const open = [...document.querySelectorAll('.modal')].some(node => node.style.display === 'flex');
        if (lost && entry && !open) entry.focus({ preventScroll: true });
    }, 0);
}

// Called by every draw of the crew screen (renderRoster, js/ui/roster.js), and the dialog is
// open only over that screen: a roster adopted from another phone - a rate set, a man
// switched off - is read again here. The scroll is kept; the chip that had the keyboard gets
// it back while it stands.
function renderCrewCheckIfOpen() {
    if (!crewCheckIsOpen()) return;
    const content = document.querySelector('#crewCheckModal .modal-content');
    const at = content ? content.scrollTop : 0;
    renderCrewCheck();
    if (content) content.scrollTop = at;
}

// The dialog: its frame's words, and the list - ONE reading per draw.
function renderCrewCheck() {
    const parts = crewCheckParts();
    if (!parts.list) return;
    const today = todayStr();
    const read = crewCheckRead(State.schedule, today, State.layer);
    if (parts.title) parts.title.textContent = CREW_CHECK_TEXT.title;
    if (parts.context) crewCheckContextInto(parts.context, read);
    if (parts.lead) parts.lead.textContent = CREW_CHECK_REUSED.lead;
    if (parts.close) parts.close.textContent = CREW_CHECK_REUSED.close;
    crewCheckDraw(parts.list, read, today, crewCheckLive());
}

// The names are doors only while the crew screen is the view: the rows they land on are
// that screen's. For a later screen that embeds the check they are names (the day check's
// rule for another date, js/ui/daycheck.js).
function crewCheckLive() {
    return typeof currentView !== 'undefined' && currentView === 'roster';
}

// ------------------------------------------------------------------ the door for other screens
//
// renderCrewCheckInto(container, today) -> the number of findings drawn
//
// The same list the dialog shows, drawn into `container` (emptied first), reading the live
// record; the dialog is drawn through crewCheckDraw and through nothing else, so a screen
// that embeds it shows the same findings in the same words. The too-few line is not a finding
// and is not counted; 0 is a container holding the calm line alone.
function renderCrewCheckInto(container, today) {
    if (!container) return 0;
    const day = isRealDate(today) ? today : todayStr();
    return crewCheckDraw(container, crewCheckRead(State.schedule, day, State.layer), day, crewCheckLive());
}

function crewCheckDraw(container, read, today, live) {
    const findings = crewCheckFindings(read, today);
    // The list is rebuilt; the chip that had the keyboard gets it back - found by comparing
    // the values, never by a selector built from an id.
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    const focused = active && active.dataset && container.contains && container.contains(active)
        ? active.dataset.crewcheckFocus : null;

    clear(container);
    if (read.since === null) container.appendChild(el('p', 'crewcheck-note', CREW_CHECK_TEXT.tooFew(CREW_CHECK_IDLE_DAYS)));
    // The calm line is about what is worth checking, and stands whenever nothing of that kind
    // was found - with the «לידיעה» lines under it when there are any.
    if (!findings.some(finding => finding.tier === 'check')) container.appendChild(el('p', 'daycheck-clean', CREW_CHECK_TEXT.clean));
    [['check', CREW_CHECK_REUSED.headCheck, 'daycheck-group daycheck-check'],
        ['info', CREW_CHECK_REUSED.headInfo, 'daycheck-group daycheck-info']].forEach(([tier, head, className]) => {
        const mine = findings.filter(finding => finding.tier === tier);
        if (mine.length === 0) return;
        const group = el('section', className);
        group.appendChild(el('h4', 'daycheck-head', head));
        mine.forEach(finding => group.appendChild(crewCheckFindingNode(finding, live)));
        container.appendChild(group);
    });

    if (focused && container.querySelectorAll) {
        const again = [...container.querySelectorAll('[data-crewcheck-focus]')]
            .find(node => node.dataset.crewcheckFocus === focused);
        if (again && again !== document.activeElement && again.focus) again.focus({ preventScroll: true });
    }
    return findings.length;
}

function crewCheckFindingNode(finding, live) {
    const node = el('div', 'daycheck-finding');
    node.dataset.kind = finding.kind;
    node.appendChild(crewCheckWordsInto(el('p', 'daycheck-say'), finding.say));
    const chips = el('div', 'daycheck-chips');
    finding.chips.forEach(chip => chips.appendChild(crewCheckChipNode(finding, chip, live)));
    node.appendChild(chips);
    if (finding.note) node.appendChild(el('p', 'crewcheck-note', finding.note));
    return node;
}

// A man or a site: a button that only navigates, or - not on the crew screen - a name. A
// site carries the day check's drawn square before its name, never the site's own colour,
// which no button borrows.
function crewCheckChipNode(finding, chip, live) {
    const site = chip.door === 'site';
    if (!live) return crewCheckWordsInto(el('span', site ? 'daycheck-site daycheck-plain' : 'daycheck-plain'), chip.text);
    const node = button(chip.text, site ? 'btn-secondary daycheck-go daycheck-site' : 'btn-secondary daycheck-go daycheck-man',
        () => crewCheckGo(chip), chip.aria);
    crewCheckWordsInto(node, chip.text);
    if (chip.door === 'form') node.setAttribute('aria-haspopup', 'dialog');
    node.dataset.crewcheckFocus = site ? `${finding.kind}:p:${chip.placeId}` : `${finding.kind}:w:${chip.workerId}`;
    return node;
}

// ------------------------------------------------------------------ the doors
//
// NAVIGATION ONLY. Each closes the dialog first; what follows depends on what the target is,
// because js/ui/modal.js gives the focus back to the dialog's opener at the microtask after
// the block that shut the last dialog:
//
//   THE FORM (a rate, a number, a name) is a dialog: opened in the SAME task, so modal.js
//   never sees a moment with no dialog and does not enter it - the field he came to mend is
//   focused here, by hand, inside his tap, which is what raises the keys on iOS. Nothing is
//   written unless he presses «שמור» (saveWorkerForm asks its own questions); «ביטול» writes
//   nothing, and modal.js then gives the focus to the entry.
//   A ROW is not a dialog: ONE TASK LATER (whatsNewGo's rule), after modal.js has had its
//   turn, his row is brought to the middle of the screen, marked for a moment, and its
//   «כרטיס עובד» (or «כרטיס אתר») takes the keyboard - NEVER the «פעיל» switch: a press there
//   is the archive itself, and it is what he is taken to, not given.
//
// A man or a site no longer in the record when the chip is pressed: the dialog closes and
// nothing opens (findGo's rule, js/ui/find.js).

// THE SLOW SECOND TAP. The page's own rule spends a press that repeats the one before it only
// under WALK_BOUNCE_MS (js/ui/sheet.js). A second touch 300-700 ms after a chip comes down on
// whatever the door put there: after a row or a site door has scrolled the crew list, about
// one press in twenty-two on the glass is a «פעיל» switch, most of them OTHER men's, and one
// press there archives a man with no question and no undo; after the form door the same
// touch can land on its «שמור», which saves the row as the form reads it. And on what writes
// nothing but undoes the door all the same (fix round 1, the review's last finding): after the
// last site's door, «בדיקת הצוות» stands at the foot right under it and the touch opened the
// check again - on a smaller phone «כרטיס אתר» opened the card; in the form, «ביטול» shut it
// and «עוד פרטים» folded away the number it had been opened for. So every door holds, for
// DOUBLE_TAP_GUARD_MS (js/ui/day.js) from the chip's own press, every control of the crew
// screen and every button, fold and choice of the form - with the house's own guard
// (guardFingersOn), judged on each later PRESS's own time: a touch that comes down at 650 ms
// is clicked after 700, and a test of the clock at its click would let it through. A
// keyboard's click is never held; a press that comes down later is what it always was. A box
// of the form to type in is not held: a touch there only moves the caret. Memory only, never
// kept.
let crewCheckHoldUntil = 0;
let crewCheckMarked = null;
const CREW_CHECK_HELD_ON_ROSTER = 'button, input, select, summary';
const CREW_CHECK_HELD_ON_FORM = 'button, summary, select';

function crewCheckArmHold() {
    if (typeof document === 'undefined' || typeof guardFingersOn !== 'function'
        || typeof sheetClock !== 'function' || typeof DOUBLE_TAP_GUARD_MS !== 'number') return false;
    const press = typeof openPress === 'function' ? openPress() : null;
    crewCheckHoldUntil = (press ? press.stamp : sheetClock()) + DOUBLE_TAP_GUARD_MS;
    const held = pressed => Boolean(pressed) && pressed.stamp < crewCheckHoldUntil;
    // The crew screen: «פעיל» and an archived row's «כבוי» restore (.worker-active-toggle),
    // «בדיקת הצוות» itself, the cards' buttons, «עוד ⋯», the adding buttons, the crew search,
    // the fold of the men switched off. The form: «שמור», «ביטול», the buttons under them, its
    // two folds and the pay cycle's choice. Installed once each (guardFingersOn keeps the
    // list); nothing else guards either surface.
    guardFingersOn(document.getElementById('rosterView'), CREW_CHECK_HELD_ON_ROSTER, held);
    guardFingersOn(document.getElementById('workerFormModal'), CREW_CHECK_HELD_ON_FORM, held);
    return true;
}

function crewCheckGo(chip) {
    if (!chip) return false;
    crewCheckArmHold();
    if (chip.door === 'form') return crewCheckGoForm(chip.workerId, chip.field);
    if (chip.door === 'row') return crewCheckGoRow(chip.workerId);
    if (chip.door === 'site') return crewCheckGoSite(chip.placeId);
    return false;
}

const CREW_CHECK_FIELDS = Object.freeze({ daily: 'workerFormDaily', phone: 'workerFormPhone', name: 'workerFormName' });

function crewCheckGoForm(workerId, field) {
    const worker = State.worker(workerId);
    closeCrewCheck();
    if (!worker || typeof editWorker !== 'function') return false;
    // The form «עריכת עובד», exactly as «עוד ⋯» ← «עריכת פרטים» opens it.
    editWorker(worker.id);
    const modal = document.getElementById('workerFormModal');
    if (!modal || modal.style.display !== 'flex') return false;
    // The fold editWorker leaves shut for a man with no number holds the phone field.
    if (field === 'phone') {
        const more = document.getElementById('workerFormMore');
        if (more) more.open = true;
    }
    // A field that was display:none a line ago cannot take the focus.
    void modal.offsetHeight;
    const target = document.getElementById(CREW_CHECK_FIELDS[field] || CREW_CHECK_FIELDS.daily);
    if (target && target.focus) {
        target.focus({ preventScroll: true });
        if (target.scrollIntoView) target.scrollIntoView({ block: 'nearest' });
    }
    return true;
}

function crewCheckGoRow(workerId) {
    const worker = State.worker(workerId);
    closeCrewCheck();
    if (!worker) return false;
    setTimeout(() => crewCheckLandRow(worker.id), 0);
    return true;
}

function crewCheckGoSite(placeId) {
    const place = (State.schedule.places || []).find(item => item && item.id === placeId);
    closeCrewCheck();
    if (!place) return false;
    setTimeout(() => crewCheckLandSite(place.id), 0);
    return true;
}

// A row, found by comparing its key: an id is never put into a selector.
function crewCheckWorkerRow(workerId) {
    return [...document.querySelectorAll('#workerList .roster-row')].find(row => row.dataset.workerId === workerId) || null;
}

function crewCheckPlaceRow(placeId) {
    return [...document.querySelectorAll('#placeList .roster-row')].find(row => row.dataset.placeId === placeId) || null;
}

function crewCheckLandRow(workerId) {
    if (!State.worker(workerId)) return false;
    let row = crewCheckWorkerRow(workerId);
    // Words in the crew search that hide him: the field is emptied WITHOUT the focus -
    // clearRosterSearch focuses it, and on a phone that raises the keys over the row.
    const search = document.getElementById('rosterWorkerSearch');
    if (!row && search && search.value && typeof renderWorkerList === 'function') {
        search.value = '';
        renderWorkerList();
        row = crewCheckWorkerRow(workerId);
    }
    if (!row) return false;
    // Switched off meanwhile: his row is under the fold, which is opened for him.
    const fold = row.closest ? row.closest('details') : null;
    if (fold && !fold.open) fold.open = true;
    return crewCheckLand(row, row.querySelector('.worker-card-open') || row.querySelector('.crew-edit'));
}

function crewCheckLandSite(placeId) {
    const row = crewCheckPlaceRow(placeId);
    if (!row) return false;
    return crewCheckLand(row, row.querySelector('.site-card-open') || row.querySelector('.crew-edit'));
}

// The row to the middle of the screen, clear of both bars, marked for 2.5 s, and its card's
// button - or «עוד ⋯» on a build without the card - given the keyboard without a scroll.
function crewCheckLand(row, target) {
    row.scrollIntoView({ block: 'center' });
    if (crewCheckMarked && crewCheckMarked.row && crewCheckMarked.row.classList) {
        crewCheckMarked.row.classList.remove('crewcheck-here');
        clearTimeout(crewCheckMarked.timer);
    }
    row.classList.add('crewcheck-here');
    const marked = { row, timer: setTimeout(() => {
        row.classList.remove('crewcheck-here');
        if (crewCheckMarked === marked) crewCheckMarked = null;
    }, 2500) };
    crewCheckMarked = marked;
    if (target && target.focus) target.focus({ preventScroll: true });
    return true;
}

// For «מה חדש»'s «הראה לי» (the integrator's, js/ui/whatsnew.js): the entry brought to the
// middle of the crew screen and given the keyboard - NOT pressed. False when it is not drawn
// (no men on the crew: the screen alone).
function crewCheckFocusEntry() {
    const entry = document.getElementById('crewCheckEntry');
    const host = document.getElementById('crewCheckFoot');
    if (!entry || !host || host.hidden || entry.offsetParent === null) return false;
    entry.scrollIntoView({ block: 'center' });
    entry.focus({ preventScroll: true });
    return true;
}
