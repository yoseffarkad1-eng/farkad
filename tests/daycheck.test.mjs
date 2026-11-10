// «בדיקת היום» - the day's check: what may have been forgotten on the day on screen, said
// in one dialog before the day goes out on WhatsApp.
//
//   node tests/daycheck.test.mjs
//   DAYCHECK_NOISE=1 node tests/daycheck.test.mjs     also prints the seeded seasons' table
//
// The feature is one sentence long - "tell him what he may have forgotten, and never cry
// wolf" - and everything below follows from the two halves of it:
//
//   the rules are pure functions of (schedule, date, layer, today), so every one of them
//     is asked here on a record written by hand: an empty record, the first day ever, a
//     day after a gap, a Friday, a holiday, a man archived, a man deleted, a man archived
//     today, a date in the past and one in the future;
//   "the previous working day" comes from the record and never from the calendar;
//   an archived or deleted man is never reported as forgotten;
//   the Rima line is never said about a date that has not happened yet;
//   a day that will not price is read exactly the way the pay report reads it;
//   every Hebrew word is pinned, word for word, and none of them is outside its block;
//   it WRITES NOTHING: the whole disk, the record in memory, the outbox, the write fence,
//     the cloud, a backup file and the rescue file are compared across it;
//   and it is quiet: seeded seasons of plausible days on which NOTHING was forgotten are
//     read day by day, and the share of evenings the check speaks on is held under a
//     ceiling - with the share of really forgotten things it still catches held over a
//     floor, so that "quiet" cannot be bought by saying nothing.
//
// The screen - the one button at the foot of the day, the dialog, the navigation, the
// rectangles - is in tests/daycheck.browser.mjs.

import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import { makeDevice, makeCloud, settle, settleUntil } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const FILE = new URL('../js/ui/daycheck.js', import.meta.url);
const SOURCE = existsSync(FILE) ? readFileSync(FILE, 'utf8') : '';
const TICK = 6;

const FSI = '⁨';
const PDI = '⁩';
const LRM = '‎';
const named = name => `${FSI}${name}${PDI}`;

// Two weeks of dates. 2026-11-05 is a Thursday.
const PREV_THU = '2026-10-29';
const PREV_FRI = '2026-10-30';
const WED = '2026-11-04';
const THU = '2026-11-05';
const FRI = '2026-11-06';
const SAT = '2026-11-07';
const SUN = '2026-11-08';
const MON = '2026-11-09';

function load(device) {
    vm.runInContext(SOURCE, device.ctx, { filename: 'js/ui/daycheck.js' });
    return device;
}

function bare(id, storage) {
    const device = makeDevice({ deviceId: id, storage });
    device.Sync.pushDelayMs = TICK;
    device.setToday(SUN);
    device.ctx.askTell = () => Promise.resolve();
    device.ctx.askConfirm = () => Promise.resolve(true);
    return device;
}

// One device for every pure question: the rules are handed their record, and read
// nothing else.
const pure = load(bare('d_pure'));
given('js/ui/daycheck.js is there and defines the rules', SOURCE.length > 0
    && typeof pure.global('dayCheckRead') === 'function');

// The crew every hand-written record below is about.
//   אחמד, מוחמד, יוסי, סמיר, עלי - active, 400 a day and 50 an hour;
//   Dan Levi - active, a Latin name, NO daily rate;
//   ח'אלד - archived;   and w_99 - on some days, on no roster: a man who was deleted.
//   הרצליה, חיפה, פרדסיה - active;  נתניה - archived.
const crew = () => ({
    workers: [
        { id: 'w_01', name: 'אחמד', active: true, dailyRate: 400, hourlyRate: 50 },
        { id: 'w_02', name: 'מוחמד', active: true, dailyRate: 400, hourlyRate: 50 },
        { id: 'w_03', name: 'יוסי', active: true, dailyRate: 400, hourlyRate: 50 },
        { id: 'w_04', name: 'סמיר', active: true, dailyRate: 400, hourlyRate: 50 },
        { id: 'w_05', name: 'עלי', active: true, dailyRate: 400, hourlyRate: 50 },
        { id: 'w_06', name: 'Dan Levi', active: true, dailyRate: 0, hourlyRate: 0 },
        { id: 'w_07', name: 'ח\'אלד', active: false, dailyRate: 400, hourlyRate: 50 }
    ],
    places: [
        { id: 'p_01', name: 'הרצליה', active: true },
        { id: 'p_02', name: 'חיפה', active: true },
        { id: 'p_03', name: 'פרדסיה', active: true },
        { id: 'p_04', name: 'נתניה', active: false }
    ]
});
const at = (...sites) => ({ entries: sites.map(site => (typeof site === 'string' ? { placeId: site } : site)) });
const gone = () => ({ absent: true, entries: [] });
const record = (days, change) => {
    const schedule = { ...crew(), days };
    if (change) change(schedule);
    return schedule;
};

const find = (schedule, date, today) => JSON.parse(JSON.stringify(
    pure.call('dayCheckRead', schedule, date, 'actual', today || date)));
const all = found => found.check.concat(found.info);
const of = (found, kind) => all(found).filter(finding => finding.kind === kind);
const kinds = found => ({ check: found.check.map(f => f.kind), info: found.info.map(f => f.kind) });
const names = finding => (finding ? finding.workers.map(worker => worker.name) : null);
const sentence = (found, finding) => pure.call('dayCheckSentence', finding, found.previous);
const QUIET = { check: [], info: [] };

async function block(name, body) {
    suite(name);
    try {
        await body();
    } catch (error) {
        check(`${name}: the block ran to its end`, false,
            String((error && error.stack) || error).split('\n').slice(0, 3).join(' | '));
    }
}

// ================================================================== the previous working day

await block('the previous working day comes from the record, never from the calendar', async () => {
    const previous = (days, date) => pure.call('dayCheckPrevious', record(days), date, 'actual');

    same('an empty record has none', previous({}, SUN), null);
    same('and the check of an empty record says nothing at all', kinds(find(record({}), SUN)), QUIET);
    same('the first day ever recorded has none', previous({ [SUN]: { actual: { w_01: at('p_01') } } }, SUN), null);
    same('a day is never its own previous day, and a later day is not an earlier one',
        previous({ [SUN]: { actual: { w_01: at('p_01') } }, [MON]: { actual: { w_01: at('p_01') } } }, SUN), null);

    const week = {
        [WED]: { actual: { w_01: at('p_01') } },
        [THU]: { actual: { w_01: at('p_01'), w_02: at('p_02') } }
    };
    same('on a Sunday with nothing on Friday or Saturday it is Thursday', previous(week, SUN), THU);
    same('a Friday that was worked is the previous day of the Sunday after it',
        previous({ ...week, [FRI]: { actual: { w_01: at('p_01') } } }, SUN), FRI);
    same('a «הכל חופש» day - absences and nothing else - is stepped over',
        previous({ ...week, [FRI]: { actual: { w_01: gone(), w_02: gone() } } }, SUN), THU);
    same('so is a day that holds only a Rima count',
        previous({ ...week, [SAT]: { rima: { p_01: 3 } } }, SUN), THU);
    same('and a day whose only record is a man with his sites taken off again',
        previous({ ...week, [FRI]: { actual: { w_01: { entries: [] } } } }, SUN), THU);
    same('a day worked only by a man who has since been archived is still a day that was worked',
        previous({ ...week, [FRI]: { actual: { w_07: at('p_01') } } }, SUN), FRI);
    same('the other layer is not read', previous({ ...week, [FRI]: { plan: { w_01: at('p_01') } } }, SUN), THU);
    same('a key that is not a date is not a day',
        previous({ ...week, 'garbage': { actual: { w_01: at('p_01') } }, '2026-11-31': { actual: { w_01: at('p_01') } } }, SUN), THU);

    // The gap. Thursday the 5th to Thursday the 19th is fourteen days; to the 20th, fifteen.
    same('a previous working day fourteen days back is still compared with', previous(week, '2026-11-19'), THU);
    same('one fifteen days back is not', previous(week, '2026-11-20'), null);
    const stale = find(record(week), '2026-11-20');
    same('and then nobody is called forgotten', kinds(stale), QUIET);
    const context = pure.call('dayCheckContext', '2026-11-20', stale.previous);
    same('the dialog says there is nothing near to compare with',
        context, 'יום שישי 20/11/2026 · אין יום עבודה קרוב להשוות אליו.');
    same('and names the day it compares with when there is one',
        pure.call('dayCheckContext', SUN, THU), 'יום ראשון 08/11/2026 · בהשוואה ליום חמישי 05/11');
});

// ================================================================== 1. not recorded

await block('1. a man who worked the previous working day and has no record today', async () => {
    const thursday = { actual: { w_01: at('p_01'), w_02: at('p_01'), w_03: at('p_02'), w_04: at('p_02'),
        w_07: at('p_02'), w_99: at('p_02') } };
    // Sunday: אחמד and יוסי recorded; מוחמד marked נעדר; סמיר has nothing; עלי has nothing
    // and did not work on Thursday; ח'אלד (archived) and w_99 (deleted) worked on Thursday
    // and have nothing.
    const sunday = { actual: { w_01: at('p_01'), w_02: gone(), w_03: at('p_02') } };
    const found = find(record({ [THU]: thursday, [SUN]: sunday }), SUN);

    same('only the man with nothing said about him is named', names(of(found, 'forgot')[0]), ['סמיר']);
    same('and it is the only thing to check', kinds(found).check, ['forgot']);
    same('one man is one man', sentence(found, of(found, 'forgot')[0]), 'עבד ביום חמישי 05/11 ועדיין לא נרשם:');
    check('a man marked נעדר was answered', !names(of(found, 'forgot')[0]).includes('מוחמד'));
    check('a man who did not work the day before is not guessed at', !names(of(found, 'forgot')[0]).includes('עלי'));
    check('an archived man is never forgotten', !JSON.stringify(found).includes('ח\'אלד'));
    check('and a deleted one is nowhere', !JSON.stringify(found).includes('w_99'));

    const two = find(record({ [THU]: thursday, [SUN]: { actual: { w_01: at('p_01'), w_03: at('p_02') } } }), SUN);
    same('two men, in roster order', names(of(two, 'forgot')[0]), ['מוחמד', 'סמיר']);
    same('and the sentence is plural', sentence(two, of(two, 'forgot')[0]), 'עבדו ביום חמישי 05/11 ועדיין לא נרשמו:');

    const cleared = find(record({ [THU]: thursday,
        [SUN]: { actual: { w_01: at('p_01'), w_02: gone(), w_03: at('p_02'), w_04: { entries: [] } } } }), SUN);
    same('a man whose site was taken off again has no record', names(of(cleared, 'forgot')[0]), ['סמיר']);

    const archivedToday = find(record({ [THU]: thursday, [SUN]: sunday },
        schedule => { schedule.workers.find(worker => worker.id === 'w_04').active = false; }), SUN);
    same('a man archived today is not forgotten either', kinds(archivedToday), QUIET);

    const nothingYet = find(record({ [THU]: thursday }), SUN);
    same('a day with nothing on it yet: every active man of the day before, and nobody else',
        all(nothingYet).flatMap(names).sort(), ['אחמד', 'יוסי', 'מוחמד', 'סמיר'].sort());

    const allDone = find(record({ [THU]: thursday,
        [SUN]: { actual: { w_01: at('p_01'), w_02: gone(), w_03: at('p_02'), w_04: at('p_03') } } }), SUN);
    same('everybody answered: nothing', kinds(allDone), QUIET);
});

// ================================================================== 2. a site left empty

await block('2. a site left empty is said only when it explains who is missing', async () => {
    const thursday = { actual: { w_01: at('p_01'), w_02: at('p_01'), w_03: at('p_02'), w_04: at('p_02', 'p_03') } };

    // הרצליה has nobody today and neither of its two men has a record.
    const forgotten = find(record({ [THU]: thursday, [SUN]: { actual: { w_03: at('p_02'), w_04: at('p_02') } } }), SUN);
    const site = of(forgotten, 'emptySite');
    same('one site is said', site.map(f => f.place.name), ['הרצליה']);
    same('with its men of the day before', names(site[0]), ['אחמד', 'מוחמד']);
    same('who are not named a second time', of(forgotten, 'forgot'), []);
    same('in one sentence', sentence(forgotten, site[0]),
        `ב${named('הרצליה')} אין אף עובד. עבדו שם ביום חמישי 05/11 ועדיין לא נרשמו:`);
    check('פרדסיה is empty too, but its one man of Thursday is recorded today: not said',
        !site.some(f => f.place.name === 'פרדסיה'));

    // The same site emptied on purpose: one man moved, the other marked נעדר.
    const moved = find(record({ [THU]: thursday,
        [SUN]: { actual: { w_01: at('p_02'), w_02: gone(), w_03: at('p_02'), w_04: at('p_02') } } }), SUN);
    same('a site whose men were moved or marked נעדר was emptied on purpose', kinds(moved), QUIET);

    // One of its two men moved, the other has nothing.
    const half = find(record({ [THU]: thursday,
        [SUN]: { actual: { w_01: at('p_02'), w_03: at('p_02'), w_04: at('p_02') } } }), SUN);
    same('one of its men still with no record: the site, and him alone', names(of(half, 'emptySite')[0]), ['מוחמד']);
    same('in the singular', sentence(half, of(half, 'emptySite')[0]),
        `ב${named('הרצליה')} אין אף עובד. עבד שם ביום חמישי 05/11 ועדיין לא נרשם:`);

    // The site still has somebody today, so it is not "empty": its missing man is rule 1's.
    const partly = find(record({ [THU]: thursday,
        [SUN]: { actual: { w_01: at('p_01'), w_03: at('p_02'), w_04: at('p_02') } } }), SUN);
    same('a site that still has somebody is not empty', of(partly, 'emptySite'), []);
    same('and its missing man is simply not recorded', names(of(partly, 'forgot')[0]), ['מוחמד']);

    // A man on two sites the day before, both empty today: named once.
    const both = find(record({ [THU]: thursday, [SUN]: { actual: { w_01: at('p_01'), w_02: at('p_01') } } }), SUN);
    same('two sites are empty; the first holds both missing men, so the second has nobody left to name and is not said',
        of(both, 'emptySite').map(f => [f.place.name, names(f)]), [['חיפה', ['יוסי', 'סמיר']]]);
    same('a man who was on both is named once',
        all(both).flatMap(names).filter(name => name === 'סמיר'), ['סמיר']);

    // An archived site is not a site of today: its men are rule 1's.
    const archivedSite = find(record({ [THU]: { actual: { w_01: at('p_04') } }, [SUN]: { actual: { w_02: at('p_01') } } }), SUN);
    same('an archived site is not said to be empty', of(archivedSite, 'emptySite'), []);
    same('its man of the day before is still asked about', names(of(archivedSite, 'forgot')[0]), ['אחמד']);
});

// ================================================================== the same as last week

await block('a short Friday that looked the same a week ago is a habit, not a slip', async () => {
    // Thursday: four men. Friday: only אחמד works, and nobody else is marked anything.
    const thursday = { actual: { w_01: at('p_01'), w_02: at('p_01'), w_03: at('p_02'), w_04: at('p_02') } };
    const friday = { actual: { w_01: at('p_01') } };
    const first = find(record({ [THU]: thursday, [FRI]: friday }), FRI);
    same('the first such Friday asks about the three who worked on Thursday',
        all(first).flatMap(names).sort(), ['יוסי', 'מוחמד', 'סמיר'].sort());

    const second = find(record({ [PREV_THU]: thursday, [PREV_FRI]: friday, [THU]: thursday, [FRI]: friday }), FRI);
    same('the Friday after it, the same in every way, asks nothing', kinds(second), QUIET);

    // Last Friday יוסי DID work; this Friday he has nothing.
    const changed = find(record({ [PREV_THU]: thursday, [PREV_FRI]: { actual: { w_01: at('p_01'), w_03: at('p_02') } },
        [THU]: thursday, [FRI]: friday }), FRI);
    same('a man who worked last Friday and has nothing this Friday is asked about',
        all(changed).flatMap(names), ['יוסי']);

    // Last Friday was not a working day at all: nothing to call a habit.
    const noFriday = find(record({ [PREV_THU]: thursday, [THU]: thursday, [FRI]: friday }), FRI);
    same('with no Friday worked the week before, there is no habit to read',
        all(noFriday).flatMap(names).sort(), ['יוסי', 'מוחמד', 'סמיר'].sort());

    // He did not work the day before last Friday either: last week says nothing about him.
    const away = find(record({ [PREV_THU]: { actual: { w_01: at('p_01') } }, [PREV_FRI]: friday,
        [THU]: thursday, [FRI]: friday }), FRI);
    same('a man who was away all of last week is still asked about',
        all(away).flatMap(names).sort(), ['יוסי', 'מוחמד', 'סמיר'].sort());
});

// ================================================================== 3. Rima

await block('3. Rima: a site that had a count on the previous working day and has none today', async () => {
    const thursday = { actual: { w_01: at('p_01') }, rima: { p_01: 3, p_02: 2, p_04: 5 } };
    const sunday = { actual: { w_01: at('p_01') }, rima: { p_02: 2 } };
    const found = find(record({ [THU]: thursday, [SUN]: sunday }), SUN);
    same('the site with no count today', of(found, 'rima')[0].places.map(place => place.name), ['הרצליה']);
    same('it is something to check', kinds(found), { check: ['rima'], info: [] });
    same('and names the day it had one', sentence(found, of(found, 'rima')[0]),
        'רימא: היה רישום ביום חמישי 05/11, ואין רישום ביום הזה:');
    check('the site that has a count today is not said', !JSON.stringify(found).includes('חיפה'));
    check('an archived site is not said', !JSON.stringify(found).includes('נתניה'));

    same('a count of any size today answers it',
        kinds(find(record({ [THU]: thursday, [SUN]: { actual: { w_01: at('p_01') }, rima: { p_01: 1, p_02: 2 } } }), SUN)), QUIET);
    same('a site with no count on the previous working day is not expected to have one',
        kinds(find(record({ [THU]: { actual: { w_01: at('p_01') } }, [SUN]: { actual: { w_01: at('p_01') } } }), SUN)), QUIET);
    same('a count the day BEFORE the previous working day is not enough',
        kinds(find(record({ [WED]: thursday, [THU]: { actual: { w_01: at('p_01') }, rima: { p_02: 2 } }, [SUN]: sunday }), SUN)), QUIET);
    same('a count on a day nobody of the owner\'s worked is not a previous working day\'s count',
        kinds(find(record({ [THU]: { actual: { w_01: at('p_01') } }, [SAT]: { rima: { p_01: 4 } }, [SUN]: sunday }), SUN)), QUIET);

    // A DATE AFTER TODAY: tomorrow's seder is written tonight.
    same('it is never said about a date after today',
        kinds(find(record({ [THU]: thursday, [SUN]: sunday }), SUN, SAT)), QUIET);
    same('it is said about today', kinds(find(record({ [THU]: thursday, [SUN]: sunday }), SUN, SUN)).check, ['rima']);
    same('and about a day in the past', kinds(find(record({ [THU]: thursday, [SUN]: sunday }), SUN, '2026-12-01')).check, ['rima']);
    same('with no today to compare with it is not said',
        kinds(JSON.parse(JSON.stringify(pure.call('dayCheckRead', record({ [THU]: thursday, [SUN]: sunday }), SUN, 'actual', undefined)))), QUIET);

    // The same as last week: a count on Thursday and none on Friday, twice.
    const fri = { actual: { w_01: at('p_01') } };
    const thu = { actual: { w_01: at('p_01') }, rima: { p_01: 3 } };
    same('Rima does not come on Fridays: the second such Friday is not asked about',
        kinds(find(record({ [PREV_THU]: thu, [PREV_FRI]: fri, [THU]: thu, [FRI]: fri }), FRI)), QUIET);
    same('the first one is', kinds(find(record({ [THU]: thu, [FRI]: fri }), FRI)).check, ['rima']);
    same('and so is a Friday after a Friday that had a count',
        kinds(find(record({ [PREV_THU]: thu, [PREV_FRI]: thu, [THU]: thu, [FRI]: fri }), FRI)).check, ['rima']);
});

// ================================================================== 4. a day that will not price

await block('4. a day that will not price, read the way the pay report reads it', async () => {
    const today = { actual: {
        w_01: at('p_01'),                                                   // priced
        w_02: at({ placeId: 'p_01', rate: 'extra', extraHours: 2 }),        // priced, 50 an hour
        w_03: at({ placeId: 'p_02', rate: 'extra' }),                       // «שעות נוספות», no hours
        w_06: at('p_02'),                                                   // no daily rate
        w_07: at('p_03')                                                    // archived, priced
    } };
    const found = find(record({ [SUN]: today }), SUN);
    same('the man with no daily rate', names(of(found, 'noDaily')[0]), ['Dan Levi']);
    same('the man with «שעות נוספות» and no hours', names(of(found, 'extraNoHours')[0]), ['יוסי']);
    same('nobody with unpriced hours', of(found, 'noHourly'), []);
    same('in that order, with no day before it to compare with', kinds(found).check, ['extraNoHours', 'noDaily']);

    const noHourly = record({ [SUN]: { actual: { w_02: at({ placeId: 'p_01', rate: 'extra', extraHours: 2 }) } } },
        schedule => { schedule.workers.find(worker => worker.id === 'w_02').hourlyRate = 0; });
    same('extra hours with no hourly rate', names(of(find(noHourly, SUN), 'noHourly')[0]), ['מוחמד']);

    // A STAMPED day keeps its stamp (law 2): the roster's rate today is not what it is read at.
    const stamped = record({ [SUN]: { actual: {
        w_06: { entries: [{ placeId: 'p_01' }], rates: { daily: 380, hourly: 0 } },
        w_01: { entries: [{ placeId: 'p_01' }], rates: { daily: 0, hourly: 0 } }
    } } });
    same('a day stamped with a rate prices, whatever the roster says now; one stamped with none does not',
        names(of(find(stamped, SUN), 'noDaily')[0]), ['אחמד']);

    const archived = record({ [SUN]: { actual: { w_07: at('p_03') } } },
        schedule => { schedule.workers.find(worker => worker.id === 'w_07').dailyRate = 0; });
    same('an archived man with a site today is read too - this is about the day, not about who is missing',
        names(of(find(archived, SUN), 'noDaily')[0]), ['ח\'אלד']);
    same('a man marked נעדר has no day to price',
        kinds(find(record({ [SUN]: { actual: { w_06: gone() } } }), SUN)), QUIET);

    // THE REPORT'S OWN ANSWER, on one mixed day: the two readings may not part.
    const mixed = record({ [SUN]: { actual: {
        w_01: at('p_01'), w_02: at({ placeId: 'p_01', rate: 'extra', extraHours: 3 }), w_03: at('p_02'),
        w_04: at({ placeId: 'p_02', rate: 'double' }), w_05: at({ placeId: 'p_03', rate: 'extra', extraHours: 1 }),
        w_06: at({ placeId: 'p_03', rate: 'extra', extraHours: 2 })
    } } }, schedule => {
        schedule.workers.find(worker => worker.id === 'w_03').dailyRate = 0;
        schedule.workers.find(worker => worker.id === 'w_05').hourlyRate = 0;
    });
    const rows = JSON.parse(JSON.stringify(pure.call('payrollReport', mixed, SUN, SUN)));
    const mine = find(mixed, SUN);
    same('«בלי שכר יומי» is exactly the rows the pay report could not price',
        names(of(mine, 'noDaily')[0]), rows.filter(row => row.attendanceDays > 0 && row.amount === null).map(row => row.name));
    same('«שעות נוספות בלי שכר שעה» is exactly the rows it marks hoursUnpriced',
        names(of(mine, 'noHourly')[0]), rows.filter(row => row.hoursUnpriced).map(row => row.name));
    given('and both lists have somebody on them', rows.some(row => row.hoursUnpriced)
        && rows.some(row => row.attendanceDays > 0 && row.amount === null));
});

// ================================================================== 5. for information

await block('5. for information: a working week with no site, and days that are not regular', async () => {
    // אחמד works every day; יוסי worked on the first day and never again. `n` working days
    // after that first one, the last of them the day on screen.
    const days = n => {
        const out = { '2026-10-11': { actual: { w_01: at('p_01'), w_03: at('p_02') } } };
        const start = new Date(2026, 9, 12, 12);
        for (let i = 0; i < n; i += 1) {
            const date = new Date(start);
            date.setDate(start.getDate() + i);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            out[key] = { actual: { w_01: at('p_01'), w_03: gone() } };
        }
        return out;
    };
    const last = n => Object.keys(days(n)).sort().pop();
    const awayAfter = n => of(find(record(days(n)), last(n)), 'away');

    same('four working days with no site is not news yet', awayAfter(4), []);
    same('five is', awayAfter(5).map(f => f.workers), [[{ id: 'w_03', name: 'יוסי', days: 5 }]]);
    same('twelve is', awayAfter(12)[0].workers[0].days, 12);
    same('thirteen is a question about the roster, and is not said every evening', awayAfter(13), []);
    same('it is for information, never something to check', kinds(find(record(days(6)), last(6))), { check: [], info: ['away'] });
    same('his chip says how long',
        pure.call('dayCheckChipText', awayAfter(6)[0], awayAfter(6)[0].workers[0]), `${named('יוסי')} · 6 ימים`);

    same('a man who never had a site is not counted at all',
        of(find(record(days(8)), last(8)), 'away').flatMap(names).includes('עלי'), false);
    const archived = find(record(days(8), schedule => { schedule.workers.find(worker => worker.id === 'w_03').active = false; }), last(8));
    same('an archived man is not said to be away', kinds(archived), QUIET);

    // The day on screen counts only once somebody has a site on it.
    const before = days(5);
    const screen = '2026-10-18';
    given('five working days stand before the day on screen', Object.keys(before).length === 6 && last(5) < screen);
    same('a day with nothing on it yet does not add to the count',
        of(find(record(before), screen), 'away')[0].workers[0].days, 5);
    same('and does once somebody has a site on it',
        of(find(record({ ...before, [screen]: { actual: { w_01: at('p_01') } } }), screen), 'away')[0].workers[0].days, 6);
    same('a man with a site on the day on screen is not away',
        of(find(record({ ...before, [screen]: { actual: { w_01: at('p_01'), w_03: at('p_02') } } }), screen), 'away'), []);

    // Days that are not regular, on one line.
    const today = { actual: {
        w_01: at('p_01'),
        w_02: at('p_01', 'p_02'),
        w_03: at({ placeId: 'p_02', rate: 'double' }),
        w_04: at({ placeId: 'p_02', rate: 'extra', extraHours: 2 }, { placeId: 'p_03', rate: 'extra', extraHours: 1.5 }),
        w_05: at({ placeId: 'p_03', rate: 'extra' }),
        w_07: at({ placeId: 'p_03', rate: 'double' })
    } };
    const found = find(record({ [SUN]: today }), SUN);
    const line = of(found, 'unusual');
    same('one line for all of them', line.length, 1);
    same('a regular day is not on it; «שעות נוספות» with no hours is on the other list',
        names(line[0]), ['מוחמד', 'יוסי', 'סמיר', 'ח\'אלד']);
    same('the line', sentence(found, line[0]), 'לא יום רגיל - לאישור:');
    const chips = line[0].workers.map(worker => pure.call('dayCheckChipText', line[0], worker));
    same('each chip says what is not regular, in the day\'s own words', chips, [
        `${named('מוחמד')} · 2 אתרים`,
        `${named('יוסי')} · יום כפול`,
        `${named('סמיר')} · 2 אתרים · ${LRM}+3.5 ש׳`,
        `${named('ח\'אלד')} · יום כפול`
    ]);
    same('«יום כפול» is the rate\'s own label, not a second copy of it',
        chips[1].endsWith(pure.global('RATE_LABELS').double), true);
    same('the same site entered twice is one site',
        of(find(record({ [SUN]: { actual: { w_01: at('p_01', 'p_01') } } }), SUN), 'unusual'), []);
});

// ================================================================== past, future, purity

await block('a past date and a future date are read against themselves, and nothing is changed by reading', async () => {
    const thursday = { actual: { w_01: at('p_01'), w_02: at('p_01'), w_03: at('p_02') }, rima: { p_01: 3 } };
    const sunday = { actual: { w_01: at('p_01'), w_03: at('p_02') } };
    const monday = { actual: { w_01: at('p_01'), w_02: at('p_01'), w_03: at('p_02') }, rima: { p_01: 3 } };
    const whole = record({ [THU]: thursday, [SUN]: sunday, [MON]: monday });

    // A PAST date: Sunday, looked at a month later. What came after it changes nothing.
    const then = find(record({ [THU]: thursday, [SUN]: sunday }), SUN, '2026-12-10');
    const later = find(whole, SUN, '2026-12-10');
    same('a past day is compared with the day before IT', later.previous, THU);
    same('and reads the same with or without the days after it', later, then);
    same('saying who had no record on it', names(of(later, 'forgot')[0]), ['מוחמד']);

    // A FUTURE date: Tuesday, with nothing on it, looked at on Monday evening.
    const tomorrow = find(whole, '2026-11-10', MON);
    same('a future day is compared with the last day that was worked', tomorrow.previous, MON);
    same('it asks about the men, who can be planned', all(tomorrow).flatMap(names).sort(), ['אחמד', 'יוסי', 'מוחמד'].sort());
    same('and not about Rima, who cannot be counted yet', of(tomorrow, 'rima'), []);

    same('a date that is not a date reads as nothing',
        JSON.parse(JSON.stringify(pure.call('dayCheckRead', whole, 'tomorrow', 'actual', MON))),
        { date: 'tomorrow', previous: null, check: [], info: [] });
    same('and so does no record at all',
        JSON.parse(JSON.stringify(pure.call('dayCheckRead', null, SUN, 'actual', SUN))),
        { date: SUN, previous: null, check: [], info: [] });
    same('a roster with a hole in it, and days with none, do not throw',
        kinds(find({ workers: [null, { id: 'w_01', name: 'אחמד' }], places: [null], days: { [SUN]: null, [THU]: { actual: null } } }, SUN)), QUIET);

    const before = JSON.stringify(whole);
    const once = JSON.stringify(find(whole, SUN));
    const twice = JSON.stringify(find(whole, SUN));
    same('the record it was handed is byte for byte what it was', JSON.stringify(whole), before);
    same('two readings are the same bytes', twice, once);

    // The rules half of the file, with its comments taken out, names nothing it could
    // change or wait on.
    const code = SOURCE.split('\n').map(line => line.replace(/\/\/.*$/, '')).join('\n');
    const rules = code.slice(0, code.indexOf('function dayCheckParts'));
    given('the rules and the screen are both in the file', rules.length > 2000 && code.length > rules.length + 1000);
    const impure = ['Store', 'State', 'document', 'window', 'localStorage', 'Date.now', 'new Date', 'todayStr', 'Math.random']
        .filter(word => rules.includes(word));
    same('the rules touch no storage, no state, no DOM and no clock', impure, []);
    const writers = ['Store.', 'localStorage', 'sessionStorage', 'indexedDB', '.commit', 'commitMany', '.save(', '.persist(',
        'setVerified', 'FarkadSync', 'fetch(', 'navigator.', 'setDayMode', 'assignPlace', 'markAbsent', 'setRimaCount',
        'clearWorkerDay', 'setWorkerDay', 'prompt(', 'confirm(', 'alert(', 'innerHTML']
        .filter(word => code.includes(word));
    same('and nothing in the whole file names a writer, a store, the cloud or a browser dialog', writers, []);
});

// ================================================================== the words

await block('every Hebrew word of it, word for word', async () => {
    const T = pure.global('DAY_CHECK_TEXT');
    const said = {};
    Object.keys(T).forEach(key => {
        said[key] = typeof T[key] === 'function' ? null : T[key];
    });
    same('the fixed words', said, {
        entry: 'בדיקת היום',
        title: 'בדיקת היום',
        compared: null,
        noPrevious: 'אין יום עבודה קרוב להשוות אליו.',
        lead: 'הבדיקה רק מראה מה כדאי לבדוק. היא לא משנה ולא שומרת דבר.',
        clean: '✓ לא נמצא דבר שנראה שנשכח.',
        headCheck: 'כדאי לבדוק',
        headInfo: 'לידיעה',
        close: 'סגור',
        goWorker: null,
        goSite: null,
        forgot: null,
        emptySite: null,
        rima: null,
        noDaily: 'בלי שכר יומי - היום הזה לא יחושב בשכר:',
        noHourly: 'שעות נוספות בלי שכר שעה - לא ייכללו בסכום:',
        extraNoHours: 'שעות נוספות בלי מספר שעות - ישולם יום רגיל:',
        away: 'פעילים שלא עבדו שבוע עבודה או יותר:',
        awayDays: null,
        unusual: 'לא יום רגיל - לאישור:',
        sites: null,
        hours: null
    });
    same('the words with a name or a number in them', [
        T.compared('יום חמישי 05/11'),
        T.goWorker(named('אחמד')),
        T.goSite(named('הרצליה')),
        T.forgot(1, 'יום חמישי 05/11'),
        T.forgot(2, 'יום חמישי 05/11'),
        T.emptySite(named('הרצליה'), 1, 'יום חמישי 05/11'),
        T.emptySite(named('הרצליה'), 3, 'יום חמישי 05/11'),
        T.rima('יום חמישי 05/11'),
        T.awayDays(named('אחמד'), 6),
        T.sites(2),
        T.hours(`${LRM}+2`)
    ], [
        'בהשוואה ליום חמישי 05/11',
        `פתח את הרישום של ${named('אחמד')}`,
        `הצג את האתר ${named('הרצליה')}`,
        'עבד ביום חמישי 05/11 ועדיין לא נרשם:',
        'עבדו ביום חמישי 05/11 ועדיין לא נרשמו:',
        `ב${named('הרצליה')} אין אף עובד. עבד שם ביום חמישי 05/11 ועדיין לא נרשם:`,
        `ב${named('הרצליה')} אין אף עובד. עבדו שם ביום חמישי 05/11 ועדיין לא נרשמו:`,
        'רימא: היה רישום ביום חמישי 05/11, ואין רישום ביום הזה:',
        `${named('אחמד')} · 6 ימים`,
        '2 אתרים',
        `${LRM}+2 ש׳`
    ]);
    check('the block is frozen: a word cannot be changed from outside it', Object.isFrozen(T));

    // It never claims the day was checked, sent or saved, and nothing in it is a message.
    const everything = Object.keys(T).map(key => (typeof T[key] === 'function' ? T[key]('', 2, '') : T[key])).join('\n');
    check('nothing in it says the day was checked, approved, sent or saved',
        everything.length > 300 && !/נבדק|אושר|נשלח|נשמר/.test(everything));

    // No Hebrew outside the block: a word typed straight into the code is a word no test pins.
    const code = SOURCE.split('\n').map(line => line.replace(/\/\/.*$/, '')).join('\n');
    const from = code.indexOf('const DAY_CHECK_TEXT');
    const to = code.indexOf('});', from);
    given('the block of words is in the file', from !== -1 && to > from);
    const outside = (code.slice(0, from) + code.slice(to)).match(/[֐-׿]+/g) || [];
    same('and there is no Hebrew in the code outside the block', outside, []);
});

// ================================================================== it writes nothing

const DAYS = [WED, THU, FRI, SAT, SUN, MON, '2026-11-10', '2026-12-20'];

function phone(id) {
    const device = load(bare(id));
    const roster = crew();
    device.State.schedule.workers = roster.workers;
    device.State.schedule.places = roster.places;
    device.State.save({ silent: true });
    const work = (date, workerId, placeId, rate, hours) => device.State.commit(device.call('assignPlace',
        device.State.schedule, date, workerId, 'actual', placeId, rate, hours));
    work(WED, 'w_01', 'p_01');
    work(THU, 'w_01', 'p_01');
    work(THU, 'w_02', 'p_01');
    work(THU, 'w_03', 'p_02');
    work(THU, 'w_04', 'p_02');
    device.State.commit(device.call('setRimaCount', device.State.schedule, THU, 'p_01', 3));
    work(SUN, 'w_01', 'p_01', 'extra');
    work(SUN, 'w_06', 'p_02');
    device.State.commit(device.call('markAbsent', device.State.schedule, SUN, 'w_02', 'actual'));
    return device;
}

// Everything the check can be asked, on every day - the findings, every sentence, every
// chip and the line under the title. Returns how much it said, so that a comparison of the
// disk after it is a comparison across real work.
function readEverything(device) {
    let said = 0;
    DAYS.forEach(date => {
        ['actual', 'plan'].forEach(layer => {
            const found = device.call('dayCheckRead', device.State.schedule, date, layer, SUN);
            device.call('dayCheckContext', date, found.previous);
            found.check.concat(found.info).forEach(finding => {
                said += device.call('dayCheckSentence', finding, found.previous).length;
                finding.workers.forEach(worker => { said += device.call('dayCheckChipText', finding, worker).length; });
            });
        });
    });
    // The screen's own doors, as a phone with no dialog in the page meets them.
    // The two doors another screen embeds the check through.
    DAYS.forEach(date => {
        said += device.call('dayCheckFindings', date).map(finding => finding.text).join('').length;
        device.call('renderDayCheckInto', null, date);
    });
    device.call('renderDayCheckIfOpen');
    device.call('closeDayCheck');
    return said;
}

await block('it writes nothing: the whole disk, byte for byte', async () => {
    const device = phone('d_disk');
    const disk = JSON.stringify(device.dump());
    const memory = JSON.stringify(device.State.schedule);
    const queued = JSON.stringify(device.Sync.pendingPaths());
    const fence = JSON.stringify(device.Store.fenceState());
    given('there is a record on the disk, and a fence to read', device.raw('scheduleData:v2') !== null && fence !== 'null');

    const found = JSON.parse(JSON.stringify(device.call('dayCheckRead', device.State.schedule, SUN, 'actual', SUN)));
    given('and the check has things to say on it', found.check.length >= 3,
        JSON.stringify(kinds(found)));
    const said = readEverything(device);
    given('every sentence and chip of every day was composed', said > 100, String(said));

    same('every key on the disk holds the bytes it held, and there is no new key', JSON.stringify(device.dump()), disk);
    same('the record in memory is byte for byte what it was', JSON.stringify(device.State.schedule), memory);
    same('nothing was queued for the cloud', JSON.stringify(device.Sync.pendingPaths()), queued);
    same('the write fence did not move', JSON.stringify(device.Store.fenceState()), fence);
    check('no key on the disk is the check\'s: it marks no day as checked',
        Object.keys(device.dump()).every(key => !/check/i.test(key)), Object.keys(device.dump()).join(', '));

    // The control: the comparison above is able to fail.
    device.State.commit(device.call('markAbsent', device.State.schedule, SUN, 'w_04', 'actual'));
    check('while an ordinary edit on the same phone does change the disk', JSON.stringify(device.dump()) !== disk);

    // Across a reopen: nothing of it was kept anywhere to come back.
    const again = load(bare(device.id, device.dump()));
    again.State.load();
    same('and after closing and opening the app the check reads the record the same way',
        JSON.parse(JSON.stringify(again.call('dayCheckRead', again.State.schedule, THU, 'actual', SUN))),
        JSON.parse(JSON.stringify(device.call('dayCheckRead', device.State.schedule, THU, 'actual', SUN))));
});

await block('none of it leaves the phone: no cloud write, no backup, no rescue file', async () => {
    const cloud = makeCloud();
    const device = phone('d_cloud');
    device.Sync.connect(cloud.adapter);
    const synced = await settleUntil(() => device.Sync.status === 'synced' && device.Sync.pendingCount() === 0, 5000);
    given('the phone is connected and has sent its record', synced, device.Sync.status);
    const attempts = cloud.attempts.length;
    const doc = JSON.stringify(cloud.doc);
    const disk = JSON.stringify(device.dump());

    readEverything(device);
    await settle(TICK * 20);
    same('the cloud was not written to', cloud.attempts.length, attempts);
    same('and holds the document it held', JSON.stringify(cloud.doc), doc);
    same('nor was the disk', JSON.stringify(device.dump()), disk);

    device.State.commit(device.call('assignPlace', device.State.schedule, MON, 'w_05', 'actual', 'p_02'));
    const travelled = await settleUntil(() => cloud.attempts.length > attempts, 5000);
    check('while an ordinary edit on the same phone still goes to the cloud', travelled,
        String(cloud.attempts.length - attempts));

    readEverything(device);
    device.call('exportBackup');
    const backup = device.downloads[device.downloads.length - 1];
    given('the backup file was handed over', Boolean(backup && backup.text && /\.json$/.test(backup.name)),
        JSON.stringify(backup && backup.name));
    same('the backup is the record and only the record', JSON.parse(backup.text),
        JSON.parse(JSON.stringify(device.State.schedule)));
    device.call('exportRecoveryData');
    const rescue = device.downloads[device.downloads.length - 1];
    given('the rescue file was handed over', Boolean(rescue && rescue.text && rescue.text.includes('farkad-recovery')),
        JSON.stringify(rescue && rescue.name));
    check('and neither file has a word of the check in it',
        !/daycheck|dayCheck|כדאי לבדוק|שנשכח/.test(backup.text + rescue.text));
});

// ================================================================== the two doors

await block('the two doors another screen embeds the check through: dayCheckFindings(date), renderDayCheckInto(container, date)', async () => {
    const device = phone('d_doors');
    device.setToday(SUN);
    device.State.date = SUN;
    same('both are globals, by these names, taking one argument and two',
        [typeof device.global('dayCheckFindings'), device.global('dayCheckFindings').length,
            typeof device.global('renderDayCheckInto'), device.global('renderDayCheckInto').length],
        ['function', 1, 'function', 2]);

    const plain = value => JSON.parse(JSON.stringify(value));
    const list = plain(device.call('dayCheckFindings', SUN));
    const read = plain(device.call('dayCheckRead', device.State.schedule, SUN, 'actual', SUN));
    check('dayCheckFindings(date) answers with an array', Array.isArray(device.call('dayCheckFindings', SUN)) || Array.isArray(list));
    same('the same findings the rules read off the live record, what to check first and then what is for information',
        list.map(finding => [finding.tier, finding.kind]),
        read.check.map(finding => ['check', finding.kind]).concat(read.info.map(finding => ['info', finding.kind])));
    given('with something of both kinds on this evening', list.some(f => f.tier === 'check') && list.length >= 4,
        JSON.stringify(list.map(f => f.kind)));
    check('every finding has a kind and its text', list.every(finding => typeof finding.kind === 'string'
        && typeof finding.text === 'string' && finding.text.length > 0));
    same('the text is the sentence and the names under it, as one line', list.map(finding => finding.text), [
        `עבדו ביום חמישי 05/11 ועדיין לא נרשמו: ${named('יוסי')}, ${named('סמיר')}`,
        `רימא: היה רישום ביום חמישי 05/11, ואין רישום ביום הזה: ${named('הרצליה')}`,
        `שעות נוספות בלי מספר שעות - ישולם יום רגיל: ${named('אחמד')}`,
        `בלי שכר יומי - היום הזה לא יחושב בשכר: ${named('Dan Levi')}`
    ]);
    same('each chip says whose it is - a man, or a site', [list[0].chips, list[1].chips],
        [[{ text: 'יוסי', workerId: 'w_03' }, { text: 'סמיר', workerId: 'w_04' }], [{ text: 'הרצליה', placeId: 'p_01' }]]);

    same('a day with nothing to say is an empty array', plain(device.call('dayCheckFindings', WED)), []);
    same('anything that is not a date means the day on screen',
        plain(device.call('dayCheckFindings', undefined)), list);
    device.State.date = WED;
    same('which follows the day on screen', plain(device.call('dayCheckFindings', 'x')), []);
    same('with no container there is nothing to draw into, and the answer is 0', device.call('renderDayCheckInto', null, SUN), 0);

    // ONE IMPLEMENTATION: the dialog has no reading or drawing of its own.
    const code = SOURCE.split('\n').map(line => line.replace(/\/\/.*$/, '')).join('\n');
    const dialog = code.slice(code.indexOf('function renderDayCheck()'), code.indexOf('function dayCheckFindingNode'));
    given('the dialog\'s own render is in the file', dialog.length > 100 && dialog.length < 1200, String(dialog.length));
    check('the dialog draws its list through renderDayCheckInto', dialog.includes('renderDayCheckInto(parts.list, State.date)'));
    same('renderDayCheckInto reads through dayCheckFindings, and nothing else in the screen calls the rules directly',
        (code.slice(code.indexOf('function dayCheckParts')).match(/dayCheckRead\(/g) || []).length, 1);
    check('and that one call is inside dayCheckFindings', code.slice(code.indexOf('function dayCheckFindings(date)'),
        code.indexOf('function renderDayCheckInto')).includes('dayCheckRead('));
    check('renderDayCheckInto calls dayCheckFindings', code.slice(code.indexOf('function renderDayCheckInto'),
        code.indexOf('function renderDayCheck()')).includes('dayCheckFindings(day)'));
});

// ================================================================== it is quiet
//
// SEEDED SEASONS (mulberry32 - the same numbers on every machine and in every run). A
// season as it plausibly runs: fourteen men who work, three on the roster who never do,
// one archived; five sites that open and finish; Sunday to Thursday nearly everybody,
// Friday a short day or none, Saturday nothing, two holidays; spells of absence; Rima's
// men on two sites for weeks at a time, missing a day now and then; a double day, extra
// hours and a second site now and then. Two ways the evening is closed:
//   'full'  - everyone who did not work is marked נעדר (what «הכל חופש» does);
//   'sites' - only the men who worked are recorded; nobody is ever marked נעדר.
// and Rima's men either come on the short Fridays or do not.
//
// Each day is read TWICE. As it is - nothing on it was forgotten, so every line under
// «כדאי לבדוק» is a false alarm. And with one thing taken off it - a man who worked
// yesterday and today, or a Rima count that was there - to see whether the check says so.
// The model is a model: the rates in it (a spell of absence starts on 3.5% of man-days,
// Rima's men miss 8% of their days, 15% of man-days are not regular) are guesses, and the
// shares below are true of the model, not of anybody's real year.

function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function season(seed, habit, rimaFriday) {
    const rand = rng(seed);
    const pick = list => list[Math.floor(rand() * list.length)];
    const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const workers = [];
    for (let i = 1; i <= 14; i += 1) workers.push({ id: `w_${String(i).padStart(2, '0')}`, name: `עובד ${i}`, active: true, dailyRate: 400, hourlyRate: 50 });
    for (let i = 15; i <= 17; i += 1) workers.push({ id: `w_${i}`, name: `רדום ${i}`, active: true, dailyRate: 400, hourlyRate: 50 });
    workers.push({ id: 'w_18', name: 'בארכיון', active: false, dailyRate: 400, hourlyRate: 50 });
    const places = [1, 2, 3, 4, 5].map(i => ({ id: `p_0${i}`, name: `אתר ${i}`, active: true }));
    const schedule = { workers, places, days: {} };
    const working14 = workers.slice(0, 14);
    const fridayMen = new Set(working14.slice(0, 5).map(worker => worker.id));
    const home = new Map(working14.map((worker, i) => [worker.id, places[i % 4].id]));
    const awayLeft = new Map();
    const rima = new Map([[places[0].id, { left: 0, rest: 5, count: 3 }], [places[2].id, { left: 0, rest: 20, count: 4 }]]);
    let openSites = places.slice(0, 4).map(place => place.id);
    const truth = [];
    const start = new Date(2026, 5, 7, 12);     // a Sunday
    const holidays = new Set();
    [[40, 4], [85, 8]].forEach(([from, length]) => { for (let k = 0; k < length; k += 1) holidays.add(from + k); });

    for (let offset = 0; offset < 120; offset += 1) {
        const date = new Date(start);
        date.setDate(start.getDate() + offset);
        const weekday = date.getDay();
        if (weekday === 6 || holidays.has(offset)) continue;
        const friday = weekday === 5;
        if (friday && rand() < 0.25) continue;
        // A site finishes and another opens.
        if (!friday && rand() < 0.04) {
            const closing = pick(openSites);
            const opening = places.find(place => !openSites.includes(place.id));
            if (opening) {
                openSites = openSites.filter(id => id !== closing).concat([opening.id]);
                working14.forEach(worker => { if (home.get(worker.id) === closing) home.set(worker.id, opening.id); });
            }
        }
        const side = {};
        const working = [];
        working14.forEach(worker => {
            let left = awayLeft.get(worker.id) || 0;
            if (left === 0 && rand() < 0.035) left = 1 + Math.floor(rand() * 5);
            if (left > 0) { awayLeft.set(worker.id, left - 1); return; }
            if (friday && !(fridayMen.has(worker.id) || rand() < 0.1)) return;
            if (rand() < 0.03) return;
            if (rand() < 0.06) home.set(worker.id, pick(openSites));
            const entry = { placeId: home.get(worker.id) };
            const roll = rand();
            if (roll < 0.02) entry.rate = 'double';
            else if (roll < 0.10) { entry.rate = 'extra'; entry.extraHours = 1 + Math.floor(rand() * 3); }
            const entries = [entry];
            if (rand() < 0.05) {
                const second = pick(openSites.filter(id => id !== entry.placeId));
                if (second) entries.push({ placeId: second });
            }
            side[worker.id] = { entries, rates: { daily: 400, hourly: 50 } };
            working.push(worker.id);
        });
        if (working.length === 0) continue;
        if (habit === 'full') {
            workers.filter(worker => worker.active !== false && !side[worker.id])
                .forEach(worker => { side[worker.id] = { absent: true, entries: [] }; });
        }
        const day = { actual: side };
        const counts = {};
        rima.forEach((state, placeId) => {
            if (state.left === 0) {
                state.rest -= 1;
                if (state.rest <= 0) { state.left = 10 + Math.floor(rand() * 12); state.count = 2 + Math.floor(rand() * 5); }
                return;
            }
            state.left -= 1;
            if (state.left === 0) state.rest = 6 + Math.floor(rand() * 12);
            if (friday && !rimaFriday) return;
            if (rand() < 0.08) return;
            if (rand() < 0.15) state.count = Math.max(1, state.count + (rand() < 0.5 ? -1 : 1));
            counts[placeId] = state.count;
        });
        if (Object.keys(counts).length > 0) day.rima = counts;
        schedule.days[iso(date)] = day;
        truth.push({ date: iso(date), working, rima: Object.keys(counts) });
    }
    return { schedule, truth };
}

function measure(habit, rimaFriday) {
    const sum = { days: 0, anyCheck: 0, manDays: 0, manNames: 0, rimaDays: 0, awayDays: 0, unusualDays: 0,
        pricing: 0, manTried: 0, manSaid: 0, rimaTried: 0, rimaSaid: 0, dormantOrArchived: 0 };
    [11, 22, 33, 44, 55].forEach(seed => {
        const { schedule, truth } = season(seed, habit, rimaFriday);
        const rand = rng(seed ^ 0x9e3779b9);
        truth.forEach((day, index) => {
            if (index < 5) return;                          // the first week has nothing behind it
            const found = find(schedule, day.date);
            const men = found.check.filter(f => f.kind === 'forgot' || f.kind === 'emptySite');
            sum.days += 1;
            if (found.check.length > 0) sum.anyCheck += 1;
            if (men.length > 0) sum.manDays += 1;
            sum.manNames += men.reduce((count, f) => count + f.workers.length, 0);
            if (of(found, 'rima').length > 0) sum.rimaDays += 1;
            if (of(found, 'away').length > 0) sum.awayDays += 1;
            if (of(found, 'unusual').length > 0) sum.unusualDays += 1;
            sum.pricing += found.check.filter(f => ['noDaily', 'noHourly', 'extraNoHours'].includes(f.kind)).length;
            // The three who never work and the archived man: in no list about who is missing.
            sum.dormantOrArchived += men.concat(of(found, 'away')).flatMap(f => f.workers)
                .filter(worker => ['w_15', 'w_16', 'w_17', 'w_18'].includes(worker.id)).length;

            const before = truth[index - 1];
            const both = day.working.filter(id => before.working.includes(id));
            if (both.length > 0) {
                const dropped = both[Math.floor(rand() * both.length)];
                const copy = JSON.parse(JSON.stringify(schedule));
                delete copy.days[day.date].actual[dropped];
                sum.manTried += 1;
                if (find(copy, day.date).check.filter(f => f.kind === 'forgot' || f.kind === 'emptySite')
                    .some(f => f.workers.some(worker => worker.id === dropped))) sum.manSaid += 1;
            }
            if (day.rima.length > 0) {
                const site = day.rima[Math.floor(rand() * day.rima.length)];
                const copy = JSON.parse(JSON.stringify(schedule));
                delete copy.days[day.date].rima[site];
                sum.rimaTried += 1;
                if (of(find(copy, day.date), 'rima').some(f => f.places.some(place => place.id === site))) sum.rimaSaid += 1;
            }
        });
    });
    return sum;
}

await block('it is quiet: seeded seasons with nothing forgotten, and with one thing forgotten', async () => {
    const share = (part, whole) => (whole === 0 ? 0 : part / whole);
    const pct = (part, whole) => `${(100 * share(part, whole)).toFixed(1)}% (${part}/${whole})`;
    const table = [];

    for (const habit of ['full', 'sites']) {
        for (const rimaFriday of [true, false]) {
            const m = measure(habit, rimaFriday);
            const label = `${habit === 'full' ? 'everyone answered each evening' : 'only the men who worked are recorded'}, `
                + `Rima ${rimaFriday ? 'comes' : 'does not come'} on Fridays`;
            table.push({ habit, rimaFriday, ...m });
            given(`${label}: a season's worth of evenings was read`, m.days > 350 && m.manTried > 300 && m.rimaTried > 200,
                JSON.stringify(m));

            same(`${label}: a man who never works, and the archived man, are never said to be missing`, m.dormantOrArchived, 0);
            same(`${label}: no priced day is called unpriced`, m.pricing, 0);
            check(`${label}: a man really left off is said on at least 95% of the evenings it happens`,
                share(m.manSaid, m.manTried) >= 0.95, pct(m.manSaid, m.manTried));
            check(`${label}: a Rima count really left off is said on at least 65% of them`,
                share(m.rimaSaid, m.rimaTried) >= 0.65, pct(m.rimaSaid, m.rimaTried));
            check(`${label}: with nothing forgotten, the Rima line is on fewer than one evening in six`,
                share(m.rimaDays, m.days) < 1 / 6, pct(m.rimaDays, m.days));
            check(`${label}: «פעילים שלא עבדו» is on fewer than one evening in five`,
                share(m.awayDays, m.days) < 0.2, pct(m.awayDays, m.days));
            if (habit === 'full') {
                same(`${label}: with nothing forgotten, nobody is ever said to be not recorded`, m.manNames, 0);
                check(`${label}: and «כדאי לבדוק» is empty on more than five evenings in six`,
                    share(m.anyCheck, m.days) < 1 / 6, pct(m.anyCheck, m.days));
            } else {
                // The habit the rule cannot see through: a man off today who worked yesterday
                // and a man forgotten today are the same bytes. Held so it cannot get worse.
                check(`${label}: it asks about a man on fewer than two evenings in three`,
                    share(m.manDays, m.days) < 2 / 3, pct(m.manDays, m.days));
                check(`${label}: and about fewer than 1.3 men an evening on average`,
                    m.manNames / m.days < 1.3, (m.manNames / m.days).toFixed(2));
            }
        }
    }
    if (process.env.DAYCHECK_NOISE) table.forEach(row => console.log(JSON.stringify(row)));
});

report();
