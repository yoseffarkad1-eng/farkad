// בניית סידור - the seder's journey - in Node.
//
//   node tests/journey.test.mjs
//
// js/ui/journey.js walks the evening's seder through five stations: the day screen, the
// check, הסעות, a last look and the sending. It builds no second editor and writes no day;
// what is its own is what it READS of the record and of the ride plan, and one preference
// that says where he is. Those are what is measured here, on real devices of the harness:
//
//   - the readings, on a seeded record: who is placed, who is not recorded, who is away,
//     the man recorded only on an archived site; the journey's own check when no other is
//     there; the rides - no seat, no driver, a man seated with no site after the day
//     changed under the plan; the strip's five states; the step past הסעות where it is off;
//   - tomorrow, by the local calendar, across month, year and clock-change days, and past
//     an empty Saturday the way the day's own arrows go;
//   - the preference: per phone, under its own key; never the record, the outbox, the
//     fence, the cloud, a backup or the rescue file; a damaged, poisoned, absent or stale
//     one is simply no journey; a disk that refuses it costs nothing but the place;
//   - that walking the whole journey writes NOTHING but that key;
//   - the second pass: what the button at the foot of the day's list says - the day a new
//     journey opens on, or where he is in the one he left - and which drivers the sending
//     station names again among the workers;
//   - every Hebrew word the feature adds, pinned.
//
// The screens - the dock's row, the bar inside הסעות, the panel, the taps and a reload at
// every station - are tests/journey.browser.mjs.

import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import { makeDevice, makeCloud, settle, settleUntil } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const read = path => {
    const file = new URL(path, import.meta.url);
    return existsSync(file) ? readFileSync(file, 'utf8') : '';
};
const SEDER = read('../js/ui/seder.js');
const ENGINE = read('../js/model/transport.js');
const SCREEN = read('../js/ui/transport.js');
const JOURNEY = read('../js/ui/journey.js');
const TICK = 6;

const TODAY = '2026-11-10';     // a Tuesday - the evening he builds on
const DAY = '2026-11-11';       // the Wednesday he builds for
const KEY = 'farkadSederJourney';
const ENABLED = 'farkadTransport:enabled';
const RIDES = `farkadTransport:day:${DAY}`;
const HOUR = 60 * 60 * 1000;

const FSI = '⁨';
const PDI = '⁩';
const named = name => `${FSI}${name}${PDI}`;

const WORKERS = () => [
    { id: 'w_01', name: 'אחמד', active: true, dailyRate: 400, hourlyRate: 0, phone: '052-884-1930' },
    { id: 'w_02', name: 'מוחמד', active: true, dailyRate: 400, hourlyRate: 0, phone: '+972 54-123-4567' },
    { id: 'w_03', name: 'יוסי', active: true, dailyRate: 400, hourlyRate: 0, phone: '' },
    { id: 'w_04', name: 'סמיר', active: true, dailyRate: 400, hourlyRate: 0, phone: '0501112233' },
    { id: 'w_05', name: 'עלי', active: true, dailyRate: 400, hourlyRate: 0, phone: '0549998877' },
    { id: 'w_06', name: 'Ali Hassan', active: true, dailyRate: 400, hourlyRate: 0, phone: '0587654321' },
    { id: 'w_07', name: 'ראמי', active: true, dailyRate: 400, hourlyRate: 0, phone: '0521000007' },
    { id: 'w_08', name: 'דוד', active: false, dailyRate: 400, hourlyRate: 0, phone: '0521000008' },
    { id: 'w_09', name: 'נביל', active: true, dailyRate: 400, hourlyRate: 0, phone: '0521000009' }
];
const PLACES = () => [
    { id: 'p_01', name: 'הרצליה', active: true },
    { id: 'p_02', name: 'חיפה', active: true },
    { id: 'p_03', name: 'פרדסיה', active: true },
    { id: 'p_04', name: 'נתניה', active: true },
    { id: 'p_05', name: 'עכו', active: false }
];

function load(device) {
    vm.runInContext(SEDER, device.ctx, { filename: 'js/ui/seder.js' });
    vm.runInContext(ENGINE, device.ctx, { filename: 'js/model/transport.js' });
    vm.runInContext(SCREEN, device.ctx, { filename: 'js/ui/transport.js' });
    vm.runInContext(JOURNEY, device.ctx, { filename: 'js/ui/journey.js' });
    return device;
}

function bare(id, storage) {
    const device = makeDevice({ deviceId: id, storage });
    device.Sync.pushDelayMs = TICK;
    device.setToday(TODAY);
    device.ctx.askTell = () => Promise.resolve();
    device.ctx.askConfirm = () => Promise.resolve(true);
    return device;
}

// The evening this suite is about, built for DAY:
//   אחמד, מוחמד and סמיר at הרצליה; יוסי (no phone) and Ali Hassan at חיפה; עלי marked
//   נעדר; ראמי with nothing recorded; דוד archived, with nothing; נביל recorded only at
//   עכו, a site in the archive; פרדסיה and נתניה with nobody (Rima has two men at נתניה).
function crewPhone(id, options = {}) {
    const device = load(bare(id, options.rides === false ? undefined : { [ENABLED]: '1' }));
    device.State.schedule.workers = WORKERS();
    device.State.schedule.places = PLACES();
    device.State.save({ silent: true });
    const work = (workerId, placeId) => device.State.commit(device.call('assignPlace',
        device.State.schedule, DAY, workerId, 'actual', placeId));
    work('w_01', 'p_01');
    work('w_02', 'p_01');
    work('w_04', 'p_01');
    work('w_03', 'p_02');
    work('w_06', 'p_02');
    work('w_09', 'p_05');
    device.State.commit(device.call('markAbsent', device.State.schedule, DAY, 'w_05', 'actual'));
    device.State.commit(device.call('setRimaCount', device.State.schedule, DAY, 'p_04', 2));
    return device;
}

function reopen(device) {
    const again = load(bare(device.id, device.dump()));
    again.State.load();
    return again;
}

const ids = list => list.map(one => one.id);
const crewOf = (device, date) => device.call('journeyCrewStatus', device.State.schedule, date || DAY, device.State.layer);
const rideOf = (device, date) => device.call('journeyRideStatus',
    device.call('transportContext', date || DAY), device.call('transportDayOf', date || DAY));
const plain = value => JSON.parse(JSON.stringify(value));
const kept = device => JSON.parse(device.raw(KEY));
// Every key on the disk but the journey's own, as bytes.
const others = device => {
    const disk = device.dump();
    delete disk[KEY];
    return JSON.stringify(Object.keys(disk).sort().map(key => [key, disk[key]]));
};

async function block(name, body) {
    suite(name);
    try {
        await body();
    } catch (error) {
        check(`${name}: the block ran to its end`, false,
            String((error && error.stack) || error).split('\n').slice(0, 3).join(' | '));
    }
}

await block('tomorrow, by the local calendar', async () => {
    const device = crewPhone('d_tomorrow');
    const next = today => device.call('journeyDefaultDate', today);
    same('an ordinary evening', next('2026-11-10'), '2026-11-11');
    same('the last day of a month', next('2026-11-30'), '2026-12-01');
    same('the last day of a year', next('2026-12-31'), '2027-01-01');
    same('a leap day is a day', [next('2028-02-28'), next('2028-02-29')], ['2028-02-29', '2028-03-01']);
    // Israel puts its clocks forward on 2026-03-27 and back on 2026-10-25. The date is
    // stepped from local noon (js/dates.js), so the hour that is missing or doubled is
    // never the hour it stands on - in whatever zone this suite is run.
    same('the evening before the clocks go forward', next('2026-03-26'), '2026-03-27');
    same('the evening before they go back', next('2026-10-24'), '2026-10-25');
    same('and the evening of each', [next('2026-03-27'), next('2026-10-25')], ['2026-03-28', '2026-10-26']);

    // The day's arrows step past a Saturday with nothing on it (stepDay, js/ui/day.js).
    // That rule is the day screen's and is asked of it; it is not loaded on these devices,
    // so here it is stood in for - tests/journey.browser.mjs asks the real one.
    given('the day screen is not loaded on this device', typeof device.ctx.anyRecordOnRestDay === 'undefined');
    same('with no day screen to ask, a Saturday is the next day like any other', next('2026-11-13'), '2026-11-14');
    device.ctx.anyRecordOnRestDay = () => false;
    same('a Friday evening builds for Sunday when Saturday is empty', next('2026-11-13'), '2026-11-15');
    same('and no other day is stepped over', [next('2026-11-12'), next('2026-11-14')], ['2026-11-13', '2026-11-15']);
    device.ctx.anyRecordOnRestDay = () => true;
    same('a Saturday that holds something is opened', next('2026-11-13'), '2026-11-14');
});

await block('station 1: who is placed, who is not recorded, who is away', async () => {
    const device = crewPhone('d_crew');
    const crew = crewOf(device);
    same('the active crew, by the roster\'s own notion', crew.active, device.State.activeWorkers().length);
    same('placed is the seder\'s own list - the men who get a message and need a seat',
        ids(crew.placed), device.call('sederCrew', device.State.schedule, DAY, 'actual').map(row => row.workerId));
    same('which is these five', ids(crew.placed), ['w_01', 'w_02', 'w_03', 'w_04', 'w_06']);
    same('not recorded: the active man with no site and no absence', ids(crew.waiting), ['w_07']);
    device.State.date = DAY;
    same('which is the day screen\'s own «לא נרשמו» for that date', ids(crew.waiting), ids(device.State.unrecorded()));
    same('away: the man marked נעדר', ids(crew.absent), ['w_05']);
    same('recorded only on a site in the archive: in nobody\'s message, and not waiting either',
        ids(crew.elsewhere), ['w_09']);
    check('an archived worker with nothing that day is nowhere',
        !JSON.stringify(crew).includes('w_08'));
    same('the counter', device.call('journeyCrewWords', crew), 'שובצו: 5 · לא נרשמו: 1 · נעדרים: 1');

    same('another date is another answer', [ids(crewOf(device, TODAY).placed), crewOf(device, TODAY).waiting.length], [[], 8]);
    same('with nobody away and nobody waiting only the placed are counted',
        device.call('journeyCrewWords', { placed: [1, 2], waiting: [], absent: [] }), 'שובצו: 2');

    const before = JSON.stringify(device.State.schedule);
    crewOf(device);
    device.call('journeyOwnFindings', device.State.schedule, DAY, 'actual');
    same('reading changes nothing', JSON.stringify(device.State.schedule), before);
});

await block('station 2: the journey\'s own check, when no other is there', async () => {
    const device = crewPhone('d_check');
    given('js/ui/daycheck.js is not on this device', typeof device.ctx.dayCheckFindings === 'undefined'
        && typeof device.ctx.renderDayCheckInto === 'undefined');
    const findings = plain(device.call('journeyOwnFindings', device.State.schedule, DAY, 'actual'));
    same('three findings, each a kind and a sentence', findings, [
        { kind: 'unassigned', text: `לא נרשמו (1): ${named('ראמי')}` },
        { kind: 'emptySite', text: `אתרים בלי עובדים (2): ${named('פרדסיה')}, ${named('נתניה')}` },
        { kind: 'archivedSite', text: `רשומים באתר שבארכיון (1): ${named('נביל')}` }
    ]);
    check('Rima\'s men do not make a site "worked": the note is about his own crew',
        findings[1].text.includes('נתניה'));

    const work = (workerId, placeId) => device.State.commit(device.call('assignPlace',
        device.State.schedule, DAY, workerId, 'actual', placeId));
    work('w_07', 'p_03');
    work('w_09', 'p_04');
    same('a day with nothing lacking has no finding',
        plain(device.call('journeyOwnFindings', device.State.schedule, DAY, 'actual')), []);
});

await block('station 3: the rides - no seat, no driver, and a man the day moved under his seat', async () => {
    const device = crewPhone('d_ride');
    given('הסעות is on, on this phone', device.call('journeyRidesOn') === true);
    let ride = rideOf(device);
    same('five men with a site, none seated', [ride.crew, ride.riders, ride.seated, ride.waiting],
        [5, 5, 0, ['w_01', 'w_02', 'w_03', 'w_04', 'w_06']]);
    same('said in the journey\'s words', device.call('journeyRideWords', ride), 'בלי מושב: 5');
    same('and the station is not done', device.call('journeyRideOpen', ride), true);

    device.call('transportPlace', DAY, 'w_02', 'tv_01', 2);
    ride = rideOf(device);
    same('a passenger with nobody at the wheel', [ride.waiting.length, ride.noDriver], [4, ['tv_01']]);
    same('is counted', device.call('journeyRideWords', ride), 'בלי מושב: 4 · רכבים בלי נהג: 1');

    device.call('transportPlace', DAY, 'w_01', 'tv_01', 1);
    device.call('transportPlace', DAY, 'w_04', 'tv_01', 3);
    device.call('transportPlace', DAY, 'w_03', 'tv_02', 1);
    device.call('transportPlace', DAY, 'w_06', 'tv_02', 2);
    ride = rideOf(device);
    same('everybody seated, a driver in each car', [ride.waiting, ride.noDriver, ride.lost], [[], [], []]);
    same('is said in the הסעות screen\'s own words', device.call('journeyRideWords', ride),
        device.global('TRANSPORT_TEXT').allSeated);
    same('which are', device.call('journeyRideWords', ride), 'כל העובדים משובצים');
    same('and the station is done', device.call('journeyRideOpen', ride), false);

    // THE DAY CHANGES UNDER THE PLAN. סמיר is taken off his site after he was seated: he
    // stays drawn in his seat (TransportEngine.layout) and the journey counts him.
    const plan = device.raw(RIDES);
    device.State.commit(device.call('unassignPlace', device.State.schedule, DAY, 'w_04', 'actual', 'p_01'));
    ride = rideOf(device);
    same('a seated man with no site is named, with his car', plain(ride.lost), [{ worker: 'w_04', vehicle: 'tv_01' }]);
    same('and counted', device.call('journeyRideWords', ride), 'יושבים ברכב בלי אתר: 1');
    same('the station has something left again', device.call('journeyRideOpen', ride), true);
    same('nothing repaired the plan: it is on the disk as it was', device.raw(RIDES), plan);
    same('the words for him are the vehicle card\'s own',
        device.global('TRANSPORT_TEXT').notWorking('סמיר'), 'סמיר משובץ ברכב אבל אין לו אתר ברישום היום');

    // Moved to another site, he is simply a man with a site in a seat: his line in the
    // summary carries the new site, by the summary's own builder.
    device.State.commit(device.call('assignPlace', device.State.schedule, DAY, 'w_04', 'actual', 'p_03'));
    ride = rideOf(device);
    same('given a site again, nobody is lost', plain(ride.lost), []);
    const summary = device.call('transportSummaryText', DAY);
    check('and the summary names him at the site he was moved to',
        summary.includes(`- ${named('סמיר')} – ${named('פרדסיה')}`), summary);

    // A driver marked away: the car keeps its passengers and has nobody at the wheel.
    device.State.commit(device.call('markAbsent', device.State.schedule, DAY, 'w_01', 'actual'));
    ride = rideOf(device);
    same('the driver taken off the day is lost from the wheel he is still drawn at',
        [plain(ride.lost), ride.noDriver], [[{ worker: 'w_01', vehicle: 'tv_01' }], []]);

    const nobody = crewPhone('d_ride_empty');
    same('a day with nobody on a site says so, in the screen\'s words',
        nobody.call('journeyRideWords', rideOf(nobody, TODAY)), 'אין ביום הזה עובדים עם אתר עבודה.');
});

await block('the strip: where he is, and what is still left behind him', async () => {
    const device = crewPhone('d_strip');
    const strip = (station, crew, ride) => device.call('journeyStripStates', station, crew, ride);
    const clean = { waiting: [] };
    const short = { waiting: [{ id: 'w_07' }] };
    const seated = { waiting: [], noDriver: [], lost: [] };
    same('at the first station', strip(1, short, seated), ['now', 'todo', 'todo', 'todo', 'todo']);
    same('a station behind him with nothing left is done', strip(2, clean, seated), ['done', 'now', 'todo', 'todo', 'todo']);
    same('one with men still not recorded is not', strip(2, short, seated), ['open', 'now', 'todo', 'todo', 'todo']);
    same('at the last, all done', strip(5, clean, seated), ['done', 'done', 'done', 'done', 'now']);
    same('men without a seat leave the rides open', strip(5, clean, { waiting: ['w_01'], noDriver: [], lost: [] })[2], 'open');
    same('so does a car with no driver', strip(4, clean, { waiting: [], noDriver: ['tv_01'], lost: [] })[2], 'open');
    same('and a man seated with no site', strip(4, clean, { waiting: [], noDriver: [], lost: [{ worker: 'w_04' }] })[2], 'open');
    same('with הסעות off the third is skipped, wherever he stands',
        [strip(1, clean, null), strip(4, short, null)],
        [['now', 'todo', 'skipped', 'todo', 'todo'], ['open', 'done', 'skipped', 'now', 'todo']]);
    same('read from the record now, not remembered: the real day, at station 2',
        strip(2, crewOf(device), rideOf(device)), ['open', 'now', 'todo', 'todo', 'todo']);

    const step = (station, by, on) => device.call('journeyStep', station, by, on);
    same('onward, with הסעות on', [1, 2, 3, 4, 5].map(n => step(n, 1, true)), [2, 3, 4, 5, 6]);
    same('onward, with הסעות off: from the check to the last look', [1, 2, 4, 5].map(n => step(n, 1, false)), [2, 4, 5, 6]);
    same('back, with it on', [5, 4, 3, 2, 1].map(n => step(n, -1, true)), [4, 3, 2, 1, 0]);
    same('back, with it off', [5, 4, 2].map(n => step(n, -1, false)), [4, 2, 1]);
});

await block('the journey starts tomorrow at the first station, and walks', async () => {
    const device = crewPhone('d_walk');
    device.State.date = TODAY;
    given('nothing is kept yet', device.raw(KEY) === null && device.call('journeyStation') === 0);
    device.call('journeyStart');
    same('station 1, for tomorrow', [device.call('journeyStation'), device.call('journeyDate')], [1, DAY]);
    same('the day screen is put on that date - it is the editor', device.State.date, DAY);
    same('and it is kept under its own key', [kept(device).version, kept(device).date, kept(device).station, kept(device).open],
        [1, DAY, 1, true]);

    const walked = [];
    for (let n = 0; n < 4; n += 1) { device.call('journeyNext'); walked.push(device.call('journeyStation')); }
    same('onward through every station', walked, [2, 3, 4, 5]);
    same('each step is kept', kept(device).station, 5);
    device.call('journeyBack');
    device.call('journeyBack');
    same('and back', [device.call('journeyStation'), kept(device).station], [3, 3]);
    same('there is nothing before the first', (device.call('journeyGo', 1), device.call('journeyBack')), false);

    const off = crewPhone('d_walk_off', { rides: false });
    given('הסעות is off on this phone', off.call('journeyRidesOn') === false && off.raw(ENABLED) === null);
    off.call('journeyStart');
    off.call('journeyNext');
    off.call('journeyNext');
    same('with הסעות off the check hands over to the last look', off.call('journeyStation'), 4);
    off.call('journeyBack');
    same('and the last look hands back to the check', off.call('journeyStation'), 2);
    same('the journey did not turn הסעות on', [off.raw(ENABLED), off.call('transportEnabled')], [null, false]);
    check('nor write a ride plan or a list of vehicles',
        !Object.keys(off.dump()).some(key => key.startsWith('farkadTransport:')), Object.keys(off.dump()).join(' '));

    // The switch turned off under a journey that was kept at the rides.
    const turned = crewPhone('d_walk_turned');
    turned.call('journeyStart');
    turned.call('journeyGo', 3);
    turned.call('transportSetEnabled', false);
    const again = reopen(turned);
    again.call('journeyResume');
    same('a journey kept at a station that is no longer there comes back at the next one',
        again.call('journeyStation'), 4);
});

await block('leaving keeps the place; finishing keeps nothing and goes back to today', async () => {
    const device = crewPhone('d_leave');
    device.State.date = TODAY;
    device.call('journeyStart');
    device.call('journeyGo', 4);
    device.call('journeyLeave');
    same('left: no journey on the screen', device.call('journeyStation'), 0);
    same('the place is kept, marked as left on purpose', [kept(device).station, kept(device).date, kept(device).open], [4, DAY, false]);
    same('and the day stays the one he was building', device.State.date, DAY);

    const again = reopen(device);
    same('a reload does not bring back a journey he left', [again.call('journeyResume'), again.call('journeyStation')], [false, 0]);
    again.call('journeyStart');
    same('the entry continues it, at its station and on its date',
        [again.call('journeyStation'), again.call('journeyDate')], [4, DAY]);

    again.call('journeyGo', 5);
    again.call('journeyFinish');
    same('finished: nothing is kept', [again.call('journeyStation'), again.raw(KEY)], [0, null]);
    same('and the day screen is back on today, where the morning\'s record belongs', again.State.date, TODAY);
    again.call('journeyStart');
    same('the next one starts from the first station', again.call('journeyStation'), 1);
});

await block('the app closed in the middle: back at the same station, for the same date', async () => {
    for (const station of [1, 2, 3, 4, 5]) {
        const device = crewPhone(`d_resume_${station}`);
        device.State.date = TODAY;
        device.call('journeyStart');
        device.call('journeyGo', station);
        const again = reopen(device);
        again.State.date = TODAY;       // what the boot does before anything resumes
        same(`station ${station}: the boot brings it back`, again.call('journeyResume'), true);
        same(`station ${station}: at its station, on its date, the day screen with it`,
            [again.call('journeyStation'), again.call('journeyDate'), again.State.date], [station, DAY, DAY]);
    }

    // Across midnight: the journey was for "tomorrow" and tomorrow has become today.
    const late = crewPhone('d_resume_midnight');
    late.call('journeyStart');
    late.call('journeyGo', 3);
    const after = load(bare(late.id, late.dump()));
    after.setToday(DAY);
    after.State.load();
    after.State.date = DAY;
    after.call('journeyResume');
    same('a reload after midnight is still the same journey for the same date',
        [after.call('journeyStation'), after.call('journeyDate')], [3, DAY]);
});

await block('a journey left long ago is not the one he is in the middle of', async () => {
    const device = crewPhone('d_stale');
    const limit = device.global('JOURNEY_RESUME_MS');
    same('the window is three hours', limit, 3 * HOUR);
    const at = Date.now();
    const stored = age => {
        device.putRaw(KEY, JSON.stringify({ version: 1, date: DAY, station: 4, at: at - age, open: true }));
        return reopen(device);
    };
    const fresh = stored(2 * HOUR);
    same('two hours on, it is', [fresh.call('journeyResume'), fresh.call('journeyStation')], [true, 4]);
    const old = stored(limit + 60 * 1000);
    same('past the window a reload opens on the day, not inside last night\'s seder',
        [old.call('journeyResume'), old.call('journeyStation')], [false, 0]);
    old.call('journeyStart');
    same('and the entry starts a new one, for tomorrow, at the first station',
        [old.call('journeyStation'), old.call('journeyDate')], [1, DAY]);
    const ahead = stored(-10 * 60 * 1000);
    same('a clock put back is not "recently"', [ahead.call('journeyResume'), ahead.call('journeyStation')], [false, 0]);
    const touched = stored(2 * HOUR);
    touched.call('journeyResume');
    check('coming back is the journey being touched: the three hours start again',
        kept(touched).at >= at, String(kept(touched).at - at));
});

await block('a preference that will not read, or is not there, is simply no journey', async () => {
    const device = crewPhone('d_broken');
    const cases = {
        'cut off mid-write': '{"version":1,"date":"2026-11-11","stat',
        'not an object': '"station 3"',
        'an array': '[1,2,3]',
        'null': 'null',
        'empty': '',
        'another version': JSON.stringify({ version: 2, date: DAY, station: 3, at: Date.now(), open: true }),
        'a date that is not one': JSON.stringify({ version: 1, date: '2026-13-40', station: 3, at: Date.now(), open: true }),
        'a station that is not one': JSON.stringify({ version: 1, date: DAY, station: 9, at: Date.now(), open: true }),
        'half a station': JSON.stringify({ version: 1, date: DAY, station: 2.5, at: Date.now(), open: true }),
        'a station in words': JSON.stringify({ version: 1, date: DAY, station: '3', at: Date.now(), open: true }),
        'no time': JSON.stringify({ version: 1, date: DAY, station: 3, open: true }),
        'a poisoned name': '{"__proto__":{"version":1,"date":"2026-11-11","station":3,"at":1,"open":true},"constructor":{"prototype":{"open":true}}}'
    };
    for (const [name, raw] of Object.entries(cases)) {
        device.putRaw(KEY, raw);
        const again = reopen(device);
        const record = [JSON.stringify(again.State.schedule), again.raw('scheduleData:v2')];
        same(`${name}: nothing resumes`, [again.call('journeyResume'), again.call('journeyStation')], [false, 0]);
        again.call('journeyStart');
        same(`${name}: the journey starts fresh`, [again.call('journeyStation'), again.call('journeyDate')], [1, DAY]);
        check(`${name}: and the first step writes a readable preference over it`,
            kept(again).station === 1 && kept(again).version === 1, again.raw(KEY));
        same(`${name}: the record is what it was, in memory and on the disk`,
            [JSON.stringify(again.State.schedule), again.raw('scheduleData:v2')], record);
    }
    check('nothing landed on a prototype', ({}).station === undefined && ({}).open === undefined
        && device.global('Object').prototype.station === undefined);

    const none = crewPhone('d_absent');
    given('a phone that never walked one has no key', none.raw(KEY) === null);
    same('nothing resumes on it', none.call('journeyResume'), false);
    same('and reading that writes nothing', none.raw(KEY), null);
    check('"open" is believed only when it is exactly true',
        (none.putRaw(KEY, JSON.stringify({ version: 1, date: DAY, station: 2, at: Date.now(), open: 'yes' })),
        reopen(none).call('journeyResume')) === false);
});

await block('it is not the record: not the schedule, not the outbox, not the fence', async () => {
    const device = crewPhone('d_record');
    const schedule = JSON.stringify(device.State.schedule);
    const disk = device.raw('scheduleData:v2');
    const queued = JSON.stringify(device.Sync.pendingPaths());
    const fence = device.Store.fenceState();
    given('the record is on the disk and the fence can be read', disk !== null && fence !== null);

    device.State.date = DAY;        // as the journey would leave it; the date on screen is not the record
    device.call('journeyStart');
    [2, 3, 4, 5, 1].forEach(station => device.call('journeyGo', station));
    device.call('journeyLeave');
    device.call('journeyStart');

    same('the schedule in memory is byte for byte what it was', JSON.stringify(device.State.schedule), schedule);
    same('so is the record on the disk', device.raw('scheduleData:v2'), disk);
    same('nothing was queued for the cloud', JSON.stringify(device.Sync.pendingPaths()), queued);
    same('the write counter did not move: this is not a record the rescue file carries',
        device.Store.fenceState(), fence);
    same('it is on the disk under its own key and no other shape', Object.keys(kept(device)).sort(),
        ['at', 'date', 'open', 'station', 'version']);
});

await block('walking the whole journey writes nothing but its own key', async () => {
    const device = crewPhone('d_only');
    device.call('transportPlace', DAY, 'w_01', 'tv_01', 1);
    device.call('transportPlace', DAY, 'w_02', 'tv_01', 2);
    const w03 = device.call('sederCrew', device.State.schedule, DAY, 'actual').find(row => row.workerId === 'w_04');
    device.call('sederMarkOpened', DAY, w03, device.call('sederMessage', w03, DAY));
    device.call('transportMarkOpened', DAY, 'tv_01');
    const before = others(device);
    given('there is a ride plan, a seder mark and a record on the disk to disturb',
        device.raw(RIDES) !== null && device.raw('farkadSederProgress') !== null && device.raw('scheduleData:v2') !== null);

    device.State.date = DAY;
    device.call('journeyStart');
    for (let station = 1; station <= 5; station += 1) {
        device.call('journeyGo', station);
        // everything a station reads, read
        crewOf(device);
        rideOf(device);
        device.call('journeyOwnFindings', device.State.schedule, DAY, 'actual');
        device.call('transportSummaryText', DAY);
        device.call('dayMessage', DAY, 'actual');
        device.call('transportMarkState', DAY, 'tv_01');
        same(`station ${station}: every other key on the disk is byte for byte what it was`, others(device), before);
    }
    device.call('journeyFinish');
    device.State.date = DAY;
    same('finished: still nothing else was touched', others(device), before);
    same('and its own key is gone', device.raw(KEY), null);
});

await block('none of it leaves the phone: no cloud, no backup, no rescue file', async () => {
    const cloud = makeCloud();
    const device = crewPhone('d_cloud');
    device.Sync.connect(cloud.adapter);
    const synced = await settleUntil(() => device.Sync.status === 'synced' && device.Sync.pendingCount() === 0, 5000);
    given('the phone is connected and has sent its record', synced, device.Sync.status);
    const attempts = cloud.attempts.length;
    const doc = JSON.stringify(cloud.doc);

    device.State.date = DAY;
    device.call('journeyStart');
    [2, 3, 4, 5].forEach(station => device.call('journeyGo', station));
    await settle(TICK * 20);
    same('the cloud was not written to', cloud.attempts.length, attempts);
    same('and holds the document it held', JSON.stringify(cloud.doc), doc);

    // The control, so the silence above is about this feature and not a dead connection.
    device.State.commit(device.call('assignPlace', device.State.schedule, DAY, 'w_07', 'actual', 'p_03'));
    const travelled = await settleUntil(() => cloud.attempts.length > attempts, 5000);
    check('while an ordinary edit on the same phone still goes to the cloud', travelled,
        String(cloud.attempts.length - attempts));

    device.call('exportBackup');
    const backup = device.downloads[device.downloads.length - 1];
    given('the backup file was handed over', Boolean(backup && backup.text && /\.json$/.test(backup.name)),
        JSON.stringify(backup && backup.name));
    same('the backup is the record and only the record', JSON.parse(backup.text),
        JSON.parse(JSON.stringify(device.State.schedule)));
    check('with nothing of the journey in it', !backup.text.includes(KEY) && !backup.text.includes('"station"'));

    device.call('exportRecoveryData');
    const rescue = device.downloads[device.downloads.length - 1];
    given('the rescue file was handed over', Boolean(rescue && rescue.text && rescue.text.includes('farkad-recovery')),
        JSON.stringify(rescue && rescue.name));
    check('and the rescue file does not carry it either', !rescue.text.includes(KEY) && !rescue.text.includes('"station"'));
    check('it is still on this phone', kept(device).station === 5);
});

await block('a disk that refuses it costs the place and nothing else', async () => {
    const device = crewPhone('d_full');
    device.Store.set('scheduleData:snap:2026-11-01', JSON.stringify(device.State.schedule));
    given('there is a restore point a full disk could be tempted to spend',
        device.raw('scheduleData:snap:2026-11-01') !== null && typeof device.Store.reclaim === 'function');
    device.call('journeyStart');
    same('a disk that takes it says it was kept', device.call('journeyWasKept'), true);

    device.setQuota(key => key === KEY);
    device.call('journeyGo', 3);
    same('a write the disk refuses is reported, not believed', device.call('journeyWasKept'), false);
    same('this session still knows where he is', device.call('journeyStation'), 3);
    check('no restore point was spent making room for it', device.raw('scheduleData:snap:2026-11-01') !== null);
    check('nor was the record touched', device.raw('scheduleData:v2') !== null
        && JSON.parse(device.raw('scheduleData:v2')).days[DAY].actual.w_01.entries.length === 1);
    same('what the disk holds is the last place it took', kept(device).station, 1);

    device.setQuota(() => false);
    device.call('journeyGo', 4);
    same('a disk that takes it again is believed again', [device.call('journeyWasKept'), kept(device).station], [true, 4]);
});

await block('the button at the foot of the day: the day it opens on, or where he is', async () => {
    const device = crewPhone('d_foot');
    device.ctx.anyRecordOnRestDay = () => false;
    const words = (now, today) => device.call('journeyDayEntryWords', now === undefined ? Date.now() : now, today || TODAY);
    const disk = JSON.stringify(device.dump());
    same('with no journey it names the day a new one opens on', words(), 'בניית סידור ליום רביעי 11/11/2026');
    same('on a Friday evening that is Sunday - and so it never says «מחר»',
        words(undefined, '2026-11-13'), 'בניית סידור ליום ראשון 15/11/2026');
    same('which is the day the journey then opens on',
        device.call('journeyDefaultDate', '2026-11-13'), '2026-11-15');
    same('asking wrote nothing, not even the journey\'s own key', JSON.stringify(device.dump()), disk);

    device.call('journeyStart');
    device.call('journeyGo', 3);
    same('while the journey is on the screen its place is known', device.call('journeyStation'), 3);
    device.call('journeyLeave');
    same('left at the rides, the button says where he is', words(), 'המשך בניית הסידור · שלב 3 מתוך 5');
    const at = kept(device).at;
    same('for the three hours the journey is still his', words(at + 3 * HOUR), 'המשך בניית הסידור · שלב 3 מתוך 5');
    same('and a minute past them it offers a new one', words(at + 3 * HOUR + 60 * 1000), 'בניית סידור ליום רביעי 11/11/2026');
    same('the tap is the same door as the row in the WhatsApp dialog: it continues at that station',
        (device.call('journeyStart'), [device.call('journeyStation'), device.call('journeyDate')]), [3, DAY]);
    device.call('journeyFinish');
    same('finished, it offers a new one again', words(), 'בניית סידור ליום רביעי 11/11/2026');

    device.putRaw(KEY, '{"version":1,"date":"2026-11-11","stat');
    same('a preference that will not read is no journey here either',
        reopen(device).call('journeyDayEntryWords', Date.now(), TODAY), 'בניית סידור ליום רביעי 11/11/2026');
});

await block('station 5: a driver whose message was opened is named again among the workers', async () => {
    const device = crewPhone('d_twice');
    const crew = () => device.call('sederCrew', device.State.schedule, DAY, 'actual');
    const drivers = () => plain(device.call('journeyOpenedDrivers', DAY, crew()));
    same('nobody seated: nobody', drivers(), []);
    device.call('transportPlace', DAY, 'w_01', 'tv_01', 1);
    device.call('transportPlace', DAY, 'w_02', 'tv_01', 2);
    device.call('transportPlace', DAY, 'w_04', 'tv_02', 1);
    device.call('transportPlace', DAY, 'w_06', 'tv_02', 2);
    same('drivers nobody opened are not named', drivers(), []);
    device.call('transportMarkOpened', DAY, 'tv_01');
    given('the vehicle card\'s own mark stands', device.call('transportMarkState', DAY, 'tv_01') === 'opened');
    same('the driver whose message was opened, by the vehicle card\'s own mark', drivers(),
        [{ id: 'w_01', name: 'אחמד', vehicle: 'tv_01' }]);
    check('he is still on the seder\'s list - named, never skipped',
        crew().some(row => row.workerId === 'w_01'));
    const disk = JSON.stringify(device.dump());
    drivers();
    same('reading it writes nothing', JSON.stringify(device.dump()), disk);

    // The mark is believed only while the message is the one it was made on.
    device.call('transportPlace', DAY, 'w_03', 'tv_01', 3);
    given('a passenger added changed his message, and the mark no longer stands',
        device.call('transportMarkState', DAY, 'tv_01') === 'none');
    same('so he is no longer named as opened', drivers(), []);
    device.call('transportMarkOpened', DAY, 'tv_01');
    device.call('transportMarkOpened', DAY, 'tv_02');
    same('two opened drivers, in the vehicles\' order', drivers().map(one => one.id), ['w_01', 'w_04']);

    // A driver taken off his site is not on the seder's list, so there is no second message.
    device.State.commit(device.call('unassignPlace', device.State.schedule, DAY, 'w_04', 'actual', 'p_01'));
    check('a driver with no site that day gets no worker\'s message, and is not named',
        !drivers().some(one => one.id === 'w_04'), JSON.stringify(drivers()));

    const off = crewPhone('d_twice_off', { rides: false });
    same('with הסעות off there are no drivers to name',
        plain(off.call('journeyOpenedDrivers', DAY, off.call('sederCrew', off.State.schedule, DAY, 'actual'))), []);
    check('and asking did not turn it on', off.raw(ENABLED) === null);
});

await block('the rides\' bar says only what is left', async () => {
    // journeyRideWords still answers in the screen's words (pinned above); what the bar
    // DRAWS is decided by journeyRideOpen, and tests/journey.browser.mjs reads the glass.
    const code = JOURNEY.replace(/\/\/.*$/gm, '');
    check('the bar\'s sentence is drawn only when something is left',
        /const left = journeyRideOpen\(read\.ride\);[\s\S]{0,200}left \? journeyRideWords\(read\.ride\) : ''/.test(code));
    check('the summary at the sending station opens the summary\'s own dialog, for the journey\'s date',
        /openTransportSummary\(live\.date\)/.test(code) && !/shareTextOut\(/.test(code));
});

await block('every word the journey adds, and no other', async () => {
    const T = crewPhone('d_words').global('JOURNEY_TEXT');
    same('the block holds exactly these words', Object.keys(T).sort(),
        ['absent', 'back', 'checkArchived', 'checkClean', 'checkEmptySites', 'checkLead', 'checkWaiting', 'dayEntry',
            'dayResume', 'entry',
            'finish', 'forDay', 'leave', 'lookLead', 'lookRides', 'lookSites', 'next', 'notKept', 'pipDone',
            'pipOpen', 'pipSkipped', 'placed', 'rideLost', 'rideNoDriver', 'rideOff', 'rideWaiting', 'sendAll',
            'sendDayMessage', 'sendDrivers', 'sendDriversNone', 'sendLead', 'sendWorkers', 'stations', 'stepOf',
            'title', 'waiting'].sort());
    same('the way in', T.entry, 'בניית סידור');
    same('the title', T.title, 'בניית סידור');
    same('the five stations', [...T.stations], ['שיבוץ לאתרים', 'בדיקה', 'הסעות', 'מבט אחרון', 'שליחה']);
    same('where he is', T.stepOf(2, 'בדיקה'), 'שלב 2 מתוך 5 · בדיקה');
    same('which day', T.forDay('יום רביעי', '11/11/2026'), 'סידור ליום רביעי 11/11/2026');
    same('a station behind him, done', T.pipDone, 'נעשה');
    same('one with something left', T.pipOpen, 'נשאר מה להשלים');
    same('one that is skipped', T.pipSkipped, 'מדולג');
    same('onward', T.next('בדיקה'), 'המשך: בדיקה');
    same('back', T.back, 'חזרה');
    same('leave', T.leave, 'יציאה');
    same('finish', T.finish, 'סיום');
    same('the place was not kept', T.notKept,
        'המקום בבניית הסידור לא נשמר במכשיר. אם האפליקציה תיסגר, מתחילים מהשלב הראשון.');
    same('the button at the foot of the day', T.dayEntry('יום רביעי', '11/11/2026'), 'בניית סידור ליום רביעי 11/11/2026');
    same('the same button, in the middle of a journey', T.dayResume(3), 'המשך בניית הסידור · שלב 3 מתוך 5');
    same('placed', T.placed(12), 'שובצו: 12');
    same('not recorded', T.waiting(3), 'לא נרשמו: 3');
    same('away', T.absent(1), 'נעדרים: 1');
    same('the check\'s lead', T.checkLead, 'ההערות לא עוצרות: אפשר לחזור ולתקן, ואפשר להמשיך.');
    same('a clean check', T.checkClean, 'לא נמצאו הערות.');
    same('men not recorded', T.checkWaiting(2, 'א, ב'), 'לא נרשמו (2): א, ב');
    same('sites with nobody', T.checkEmptySites(1, 'נתניה'), 'אתרים בלי עובדים (1): נתניה');
    same('men on an archived site', T.checkArchived(1, 'נביל'), 'רשומים באתר שבארכיון (1): נביל');
    same('no seat', T.rideWaiting(3), 'בלי מושב: 3');
    same('no driver', T.rideNoDriver(1), 'רכבים בלי נהג: 1');
    same('seated with no site', T.rideLost(1), 'יושבים ברכב בלי אתר: 1');
    same('הסעות off, and where it is turned on', T.rideOff,
        'הסעות כבויות במכשיר הזה, ולכן השלב הזה מדולג. מפעילים אותן בהגדרות ← כללי ← הסעות.');
    same('the last look\'s lead', T.lookLead, 'כך הסידור נראה עכשיו. לתיקון חוזרים לשלב המתאים.');
    same('its two halves', [T.lookSites, T.lookRides], ['אתרים ועובדים', 'רכבים ונוסעים']);
    same('the sending\'s lead', T.sendLead,
        'בוחרים מה לשלוח. כל כפתור פותח את וואטסאפ עם ההודעה מוכנה, ושם לוחצים על שליחה. אפשר גם לסיים בלי לשלוח.');
    same('its three groups', [T.sendDrivers, T.sendWorkers, T.sendAll], ['הודעות לנהגים', 'הודעה לכל עובד', 'הודעה כללית']);
    same('no car has a driver', T.sendDriversNone, 'אין רכב עם נהג.');
    same('the day\'s message', T.sendDayMessage, 'הודעת הסידור של כל היום');

    // What the journey must never say, anywhere in its file: that something was SENT. The
    // app cannot see WhatsApp's send button (js/ui/seder.js), and v174 took «סימנתי
    // שנשלח» out of הסעות on purpose.
    const words = JSON.stringify(Object.values(T).map(value => typeof value === 'function'
        ? value('א', 'ב') : value));
    check('no word of it says «נשלח»', !words.includes('נשלח') && !/נשלח|סימנתי/.test(JOURNEY.replace(/\/\/.*$/gm, '')));
    check('and the file calls none of the three dialogs the app forbids',
        !/\b(alert|confirm|prompt)\s*\(/.test(JOURNEY));
    check('nor writes markup from a name', !/innerHTML|insertAdjacentHTML|outerHTML/.test(JOURNEY));
    check('nor touches the record\'s writers', !/State\.(commit|commitMany|save|persist)\b|FarkadSync\./.test(JOURNEY));
});

report();
