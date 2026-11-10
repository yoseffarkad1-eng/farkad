// הסעות: who rides to work in which vehicle, and a message to each driver - on one phone,
// by its own switch, in a store of its own. Since v174 the plan is a PICTURE: the cars
// drawn from above and the men put on their seats.
//
//   node tests/transport.test.mjs
//
// The owner, 2026-11-09: seven vehicles (the 9-seater a Volkswagen, 2-2-2-3), the morning
// ride only, no «ממתין» - and FIRST ON HIS PHONE ONLY: no cloud, and nothing in the record.
// The owner, 2026-11-10, having tried v171's planner: too hard - draw the car, write "add
// worker" on every seat, and let him drag the men to them. Everything below follows:
//
//   the engine (js/model/transport.js) is pure and is now the geometry and the three rules
//     of a seat: the rows of each vehicle with the driver on the left; a passenger with no
//     seat number given the first free one; a man dropped on a taken seat changing places
//     with the man in it; whoever is in seat 1 the driver. What v171's engine did - suggest
//     a plan, pickup areas, who may drive, locks - is gone, and so are its tests;
//   a day and a list written by v171 open as they are, and are not rewritten until
//     somebody changes them;
//   the screen's words are one block, pinned here word for word, and the driver's message
//     is composed exactly;
//   the summary of the day (v179) is every car that goes out with its driver and its men
//     in the order of their seats, then the men waiting, the empty vehicles and the ones
//     kept home - composed exactly, and a READING: no key on the disk moves for it;
//   a number is a wa.me number by the seder's own rule;
//   what it keeps is under its own keys, through Store - never the schedule, the outbox,
//     the write fence, a backup, a restore point, the rescue file or the cloud - a record
//     of it that will not read is copied aside and cannot block the day, and old days are
//     pruned;
//   and with the switch off there is no entry, and no transport key but the switch is read.
//
// The screen itself - the drawing, the drags, the taps, the rectangles - is
// tests/transport.browser.mjs.

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
const TICK = 6;

const DAY = '2026-11-10';       // a Tuesday
const ENABLED = 'farkadTransport:enabled';
const SETTINGS = 'farkadTransport:settings';
const DAY_KEY = `farkadTransport:day:${DAY}`;

const FSI = '⁨';
const RLI = '⁧';
const PDI = '⁩';
const named = name => `${FSI}${name}${PDI}`;
const car = name => `${RLI}${name}${PDI}`;

async function block(name, body) {
    suite(name);
    try {
        await body();
    } catch (error) {
        check(`${name}: the block ran to its end`, false,
            String((error && error.stack) || error).split('\n').slice(0, 3).join(' | '));
    }
}

// ================================================================== the engine
//
// A device is only a place to run a classic script: the engine reads nothing of it.
const engineHost = makeDevice({ deviceId: 'd_engine' });
vm.runInContext(ENGINE, engineHost.ctx, { filename: 'js/model/transport.js' });
const Core = engineHost.global('TransportEngine');
given('the engine loaded', Boolean(Core && typeof Core.layout === 'function'));

// SYNTHETIC: invented names and sites. Eight men, seven with a site (w8 has none today);
// two five-seaters and the nine-seater.
const Sample = (() => {
    const sites = [{ id: 's1', name: 'אתר 1' }, { id: 's2', name: 'אתר 2' }, { id: 's3', name: 'אתר 3' }];
    const vehicles = [{ id: 'v1', name: 'רכב 1', seats: 5 }, { id: 'v2', name: 'רכב 2', seats: 5 },
        { id: 'v5', name: 'רכב 5', seats: 9, rows: [2, 2, 2, 3] }];
    const workers = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8'].map(id => ({ id, name: `עובד ${id.slice(1)}` }));
    const attendance = { w1: 's1', w2: 's1', w3: 's2', w4: 's2', w5: 's3', w6: 's3', w7: 's1' };
    return {
        ctx: () => JSON.parse(JSON.stringify({ workers, vehicles, sites, attendance })),
        day: trips => ({ unavailable: {}, status: {}, trips: trips || {} })
    };
})();

const short = trips => Object.keys(trips).sort()
    .map(v => `${v}=${trips[v].driver || '?'}+[${trips[v].passengers.join(',')}]`).join(' ');
// A car as it is drawn: seat 1 first, «-» for an empty seat.
const drawn = (ctx, day, vehicleId) => Core.layout(ctx, day).cars[vehicleId].slice(1).map(id => id || '-').join(' ');
const withSeats = trips => Object.keys(trips).sort().map(v => `${v}:${trips[v].driver || '-'}`
    + trips[v].passengers.map(id => ` ${id}@${trips[v].seats[id]}`).join('')).join(' | ');
const codes = issues => issues.map(i => i.code + (i.vehicle ? ':' + i.vehicle : '') + (i.worker ? ':' + i.worker : '')).sort();
const plain = value => JSON.parse(JSON.stringify(value));

await block('the engine: the rows of a vehicle, the driver on the LEFT', async () => {
    same('the statuses are private, contractor and other - «ממתין» is not one',
        [...Core.STATUSES], ['private', 'contractor', 'other']);
    same('a five-seater: two in front - the driver first, on the left - and three behind',
        plain(Core.seatRows({ id: 'v', seats: 5 })), [[1, 2], [5, 4, 3]]);
    same('the 9-seater: rows of two, two, two and three', plain(Core.seatRows({ id: 'v', seats: 9, rows: [2, 2, 2, 3] })),
        [[1, 2], [4, 3], [6, 5], [9, 8, 7]]);
    same('any other count: two in front, then rows of up to three',
        [7, 4, 2, 12].map(seats => Core.seatRows({ id: 'v', seats }).map(row => row.length).join('-')),
        ['2-3-2', '2-2', '2', '2-3-3-3-1']);
    same('every seat is drawn exactly once, whatever the count', [2, 3, 5, 6, 9, 13, 20].map(seats =>
        [].concat(...Core.seatRows({ id: 'v', seats })).sort((a, b) => a - b).join() === Array.from({ length: seats }, (_, i) => i + 1).join()),
    [true, true, true, true, true, true, true]);
    same('rows that do not add up to the seats are not believed',
        plain(Core.seatRows({ id: 'v', seats: 7, rows: [2, 2, 2, 3] })), [[1, 2], [5, 4, 3], [7, 6]]);
    // v171 called seat 3 «אחורי ימין» and seat 5 «אחורי שמאל». The picture keeps that: in
    // every row behind the front one the numbers run from the right of the car.
    check('a rear row is numbered from the RIGHT, as v171 named its seats',
        Core.seatRows({ id: 'v', seats: 5 })[1][0] === 5 && Core.seatRows({ id: 'v', seats: 5 })[1][2] === 3);
    same('a vehicle with no seats draws nothing', plain(Core.seatRows({ id: 'v' })), []);
});

await block('the engine: a stored plan, read as a picture', async () => {
    const ctx = Sample.ctx();
    const day = Sample.day({ v1: { driver: 'w1', passengers: ['w2', 'w3', 'w4'], seats: { w3: 5 } } });
    const before = JSON.stringify(day);
    same('a seat number is kept; a passenger without one is given the FIRST FREE seat, in order',
        drawn(ctx, day, 'v1'), 'w1 w2 w4 - w3');
    same('the driver is whoever is in seat 1', plain(Core.layout(ctx, day).where.w1), { vehicle: 'v1', n: 1 });
    same('two readings are the same bytes', JSON.stringify(Core.layout(ctx, day)), JSON.stringify(Core.layout(Sample.ctx(), JSON.parse(before))));
    check('and reading does not change what it read', JSON.stringify(day) === before);
    same('the men with a site and no seat are waiting, in roster order', plain(Core.waiting(ctx, day)), ['w5', 'w6', 'w7']);

    const crowded = Sample.day({ v1: { driver: 'w1', passengers: ['w2', 'w3', 'w4', 'w5', 'w6', 'w7'], seats: {} } });
    same('more men than seats: nobody is squeezed in', drawn(ctx, crowded, 'v1'), 'w1 w2 w3 w4 w5');
    same('the men there was no seat for are waiting again', plain(Core.waiting(ctx, crowded)), ['w6', 'w7']);

    const twice = Sample.day({ v1: { driver: 'w1', passengers: ['w2'], seats: {} }, v2: { driver: 'w2', passengers: ['w1', 'w3'], seats: {} } });
    same('a man named in two vehicles sits where the list reaches him first',
        [drawn(ctx, twice, 'v1'), drawn(ctx, twice, 'v2')], ['w1 w2 - - -', '- w3 - - -']);

    const clash = Sample.day({ v1: { driver: 'w1', passengers: ['w2', 'w3', 'w4'], seats: { w2: 4, w3: 4, w4: 12 } } });
    same('two men on one number, and a number the vehicle does not have: the first keeps it, the others get free seats',
        drawn(ctx, clash, 'v1'), 'w1 w3 w4 w2 -');

    const home = Sample.day({ v1: { driver: 'w1', passengers: ['w2'], seats: {} } });
    home.unavailable.v1 = true;
    check('a vehicle that stays home has no car', Core.layout(ctx, home).cars.v1 === undefined);
    same('and the men a plan left in it are waiting', plain(Core.waiting(ctx, home)).slice(0, 2), ['w1', 'w2']);

    const gone = Sample.day({ v9: { driver: 'w1', passengers: ['w2'], seats: {} } });
    same('so are the men of a vehicle no longer on the list', plain(Core.waiting(ctx, gone)).slice(0, 2), ['w1', 'w2']);

    const marked = Sample.day({ v1: { driver: 'w1', passengers: ['w2'], seats: {} } });
    marked.status.w2 = 'private';
    same('a man marked as getting there another way is in no seat - the mark wins', drawn(ctx, marked, 'v1'), 'w1 - - - -');
    check('and he is not waiting either', Core.waiting(ctx, marked).indexOf('w2') === -1);

    const off = Sample.day({ v1: { driver: 'w1', passengers: ['w8'], seats: {} } });
    same('a seated man with NO site today stays drawn', drawn(ctx, off, 'v1'), 'w1 w8 - - -');
    same('and is named', codes(Core.validate(ctx, off)), ['notWorking:v1:w8']);
    same('the picture written down gives every passenger his seat number',
        withSeats(Core.tripsOf(ctx, Core.layout(ctx, day).cars)), 'v1:w1 w2@2 w4@3 w3@5');
    same('an empty vehicle is not written at all', short(Core.tripsOf(ctx, Core.layout(ctx, Sample.day()).cars)), '');
});

await block('the engine: putting a man on a seat - first free, swap, and the driver\'s seat', async () => {
    const ctx = Sample.ctx();
    let day = Sample.day();
    const put = (id, vehicle, n) => {
        const before = JSON.stringify(day);
        const result = Core.place(ctx, day, id, vehicle, n);
        check(`placing ${id} did not mutate the day it was handed`, JSON.stringify(day) === before);
        if (result) day = Object.assign({}, day, { trips: result.trips });
        return result;
    };
    check('a waiting man onto an empty seat', Boolean(put('w2', 'v1', 3)));
    same('he sits there', withSeats(day.trips), 'v1:- w2@3');
    same('with passengers and nobody in seat 1, the car has no driver', codes(Core.validate(ctx, day)), ['noDriver:v1']);
    check('a waiting man onto the driver\'s seat', Boolean(put('w1', 'v1', 1)));
    same('WHOEVER SITS IN SEAT 1 IS THE DRIVER - nobody is asked whether he may', withSeats(day.trips), 'v1:w1 w2@3');
    same('and the plan has nothing wrong with it', codes(Core.validate(ctx, day)), []);

    const displaced = put('w3', 'v1', 3);
    same('a waiting man dropped on a TAKEN seat takes it, and the man who sat there goes back to wait',
        [withSeats(day.trips), displaced.displaced, plain(Core.waiting(ctx, day))], ['v1:w1 w3@3', 'w2', ['w2', 'w4', 'w5', 'w6', 'w7']]);

    put('w4', 'v2', 4);
    const swap = put('w3', 'v2', 4);
    same('a SEATED man dropped on a taken seat changes places with the man in it - between two cars',
        [withSeats(day.trips), swap.displaced], ['v1:w1 w4@3 | v2:- w3@4', null]);
    put('w4', 'v1', 1);
    same('a passenger dropped on the driver\'s seat becomes the driver, and the driver takes his seat',
        withSeats(day.trips), 'v1:w4 w1@3 | v2:- w3@4');
    put('w3', 'v5', 9);
    same('a seated man to an empty seat of another car leaves the first empty - and gone from the plan',
        withSeats(day.trips), 'v1:w4 w1@3 | v5:- w3@9');

    const frozen = JSON.stringify(day);
    same('refused, and nothing changes: his own seat, a seat the car does not have, half a seat, a car that is not on the list',
        [Core.place(ctx, day, 'w3', 'v5', 9), Core.place(ctx, day, 'w2', 'v1', 6), Core.place(ctx, day, 'w2', 'v1', 0),
            Core.place(ctx, day, 'w2', 'v1', 1.5), Core.place(ctx, day, 'w2', 'v9', 2)], [null, null, null, null, null]);
    check('a man with no site today cannot be seated', Core.place(ctx, day, 'w8', 'v1', 2) === null);
    const away = Object.assign({}, day, { status: { w2: 'contractor' } });
    check('nor a man marked as getting there another way', Core.place(ctx, away, 'w2', 'v1', 2) === null);
    const home = Object.assign({}, day, { unavailable: { v2: true } });
    check('nor anybody in a vehicle that stays home', Core.place(ctx, home, 'w2', 'v2', 2) === null);
    check('none of those changed the day', JSON.stringify(day) === frozen);

    same('a man taken out is waiting again', withSeats(Core.remove(ctx, day, 'w1')), 'v1:w4 | v5:- w3@9');
    check('taking out a man who is in no seat is refused', Core.remove(ctx, day, 'w2') === null);
    const off = Sample.day({ v1: { driver: 'w1', passengers: ['w8'], seats: {} } });
    same('a seated man with no site today CAN be taken out - it is the one thing to do about him',
        withSeats(Core.remove(ctx, off, 'w8')), 'v1:w1');
});

await block('the engine: what is wrong with a plan as it is stored', async () => {
    const ctx = Sample.ctx();
    const day = Sample.day({
        v1: { driver: null, passengers: ['w1', 'w2', 'w3', 'w4', 'w5', 'w6'], seats: { w2: 9, w3: 3, w4: 3 } },
        v2: { driver: 'w1', passengers: ['gone'], seats: {} },
        v9: { driver: 'w7', passengers: [], seats: {} }
    });
    day.status.w6 = 'other';
    day.unavailable.v2 = true;
    same('every kind is named', codes(Core.validate(ctx, day)), ['badSeat:v1:w2', 'badSeat:v1:w4', 'hasStatus:v1:w6', 'noDriver:v1',
        'overCapacity:v1', 'twice:v2:w1', 'unknownVehicle:v9', 'unknownWorker:v2:gone', 'vehicleUnavailable:v2']);
    same('and the same plan read as a picture has none of them left but the missing driver',
        codes(Core.validate(ctx, { unavailable: day.unavailable, status: day.status,
            trips: Core.tripsOf(ctx, Core.layout(ctx, day).cars) })), ['noDriver:v1']);
    check('the engine no longer plans, and no longer asks who may drive',
        ['suggest', 'mayDrive', 'planSignature', 'movedBetween', 'seatPlan'].every(name => Core[name] === undefined));
});

// ================================================================== a phone

const WORKERS = () => [
    { id: 'w_01', name: 'אחמד', active: true, dailyRate: 400, hourlyRate: 0, phone: '052-884-1930' },
    { id: 'w_02', name: 'מוחמד', active: true, dailyRate: 400, hourlyRate: 0, phone: '+972 54-123-4567' },
    { id: 'w_03', name: 'יוסי', active: true, dailyRate: 400, hourlyRate: 0, phone: '' },
    { id: 'w_04', name: 'סמיר', active: true, dailyRate: 400, hourlyRate: 0, phone: '0501112233' },
    { id: 'w_05', name: 'עלי', active: true, dailyRate: 400, hourlyRate: 0, phone: '0549998877' },
    { id: 'w_06', name: 'Ali Hassan', active: true, dailyRate: 400, hourlyRate: 0, phone: '0587654321' }
];
const PLACES = () => [
    { id: 'p_01', name: 'הרצליה', active: true },
    { id: 'p_02', name: 'חיפה', active: true },
    { id: 'p_03', name: 'פרדסיה', active: true }
];

function load(device) {
    vm.runInContext(SEDER, device.ctx, { filename: 'js/ui/seder.js' });
    vm.runInContext(ENGINE, device.ctx, { filename: 'js/model/transport.js' });
    vm.runInContext(SCREEN, device.ctx, { filename: 'js/ui/transport.js' });
    return device;
}

function bare(id, storage) {
    const device = makeDevice({ deviceId: id, storage });
    device.Sync.pushDelayMs = TICK;
    device.setToday(DAY);
    device.ctx.askTell = () => Promise.resolve();
    device.ctx.askConfirm = () => Promise.resolve(true);
    return device;
}

// The day this suite is about: אחמד and מוחמד at הרצליה (מוחמד at חיפה too - his second
// site), יוסי (no phone) and סמיר at חיפה, Ali Hassan at פרדסיה, עלי marked נעדר.
function crewPhone(id, options = {}) {
    const device = bare(id, options.on === false ? undefined : { [ENABLED]: '1' });
    load(device);
    device.State.schedule.workers = WORKERS();
    device.State.schedule.places = PLACES();
    device.State.save({ silent: true });
    const work = (workerId, placeId) => device.State.commit(device.call('assignPlace',
        device.State.schedule, DAY, workerId, 'actual', placeId));
    work('w_01', 'p_01');
    work('w_02', 'p_01');
    work('w_02', 'p_02');
    work('w_03', 'p_02');
    work('w_04', 'p_02');
    work('w_06', 'p_03');
    device.State.commit(device.call('markAbsent', device.State.schedule, DAY, 'w_05', 'actual'));
    return device;
}

function reopen(device) {
    const again = bare(device.id, device.dump());
    load(again);
    again.State.load();
    return again;
}

const tripsOf = device => short(device.call('transportDayOf', DAY).trips);

const car5 = (device, vehicleId) => {
    const ctx = device.call('transportContext', DAY);
    return Core.layout(plain(ctx), plain(device.call('transportDayOf', DAY))).cars[vehicleId].slice(1).map(id => id || '-').join(' ');
};
const keptDay = device => JSON.parse(device.raw(DAY_KEY));

await block('the seven vehicles, and a list the owner keeps himself', async () => {
    const device = crewPhone('d_list');
    const settings = device.call('transportSettings');
    same('the seven the owner confirmed, by the names he uses, in order',
        settings.vehicles.map(v => `${v.id} ${v.name} ${v.seats}`),
        ['tv_01 טויוטה קורולה 2013 5', 'tv_02 טויוטה קורולה 2016 5', 'tv_03 BYD סיל U 2025 5',
            'tv_04 BYD אטו 3 2025 5', 'tv_05 פולקסווגן 2018 9', 'tv_06 סוואנה 2010 5', 'tv_07 ליפמוטור C10 2026 5']);
    same('the 9-seater is laid out 2-2-2-3', settings.vehicles[4].rows, [2, 2, 2, 3]);
    same('and is drawn that way, the driver first',
        plain(Core.seatRows(plain(settings.vehicles[4]))), [[1, 2], [4, 3], [6, 5], [9, 8, 7]]);
    check('looking is not a write: nothing is on the disk until something is changed',
        device.raw(SETTINGS) === null);
    check('none of the ids is the retired feature\'s v_NN', settings.vehicles.every(v => /^tv_/.test(v.id)));

    const added = device.call('transportAddVehicle', '  מיניבוס   חדש ', 12);
    check('a vehicle is added, its name tidied', /^tv_/.test(String(added))
        && settings.vehicles.find(v => v.id === added).name === 'מיניבוס חדש');
    check('a second vehicle by a name already on the list is refused',
        device.call('transportAddVehicle', 'סוואנה 2010', 5) === null);
    check('so is a seat count that is not one',
        device.call('transportAddVehicle', 'אחר', 1) === null && device.call('transportAddVehicle', 'אחר', 4.5) === null);
    check('a vehicle is renamed', device.call('transportRenameVehicle', 'tv_06', 'סוואנה') === true
        && settings.vehicles[5].name === 'סוואנה');
    check('changing the seats of the 9-seater drops the row layout drawn for nine',
        device.call('transportSetVehicleSeats', 'tv_05', 8) === true && settings.vehicles[4].rows === undefined);
    same('and it is then drawn two in front and rows of three', Core.seatRows(plain(settings.vehicles[4])).map(row => row.length), [2, 3, 3]);
    check('a retired vehicle leaves the day\'s list and stays in the settings',
        device.call('transportRetireVehicle', 'tv_07') === true
        && !device.call('transportContext', DAY).vehicles.some(v => v.id === 'tv_07')
        && settings.vehicles.some(v => v.id === 'tv_07' && v.active === false));

    const again = reopen(device);
    same('the list survives the app being closed, and is not seeded over',
        again.call('transportSettings').vehicles.map(v => `${v.name}/${v.seats}/${v.active}`),
        ['טויוטה קורולה 2013/5/true', 'טויוטה קורולה 2016/5/true', 'BYD סיל U 2025/5/true', 'BYD אטו 3 2025/5/true',
            'פולקסווגן 2018/8/true', 'סוואנה/5/true', 'ליפמוטור C10 2026/5/false', 'מיניבוס חדש/12/true']);
});

await block('who works where is READ from the day, the way the seder reads it', async () => {
    const device = crewPhone('d_read');
    const ctx = device.call('transportContext', DAY);
    same('the men with a site, each going to the FIRST site his day holds',
        JSON.parse(JSON.stringify(ctx.attendance)),
        { w_01: 'p_01', w_02: 'p_01', w_03: 'p_02', w_04: 'p_02', w_06: 'p_03' });
    same('it is exactly the seder\'s own list',
        Object.keys(ctx.attendance), device.call('sederCrew', device.State.schedule, DAY, device.State.layer)
            .map(row => row.workerId));
    check('a man marked נעדר needs no ride', ctx.attendance.w_05 === undefined);
    // MOVED IN v174: v171 also handed the screen `also` (a man's second site, said on his
    // card in the עובדים tab) and laid `area`/`canDrive` over each roster row. That tab,
    // pickup areas and "may drive" are gone with the planner the owner sent back, so the
    // context carries a name and a number for each man and nothing of this phone's own.
    same('a man is his id, his name and his number - nothing of the roster is copied but those, and nothing is added',
        [Object.keys(device.State.schedule.workers[0]).sort().join(), Object.keys(ctx.workers[0]).sort().join(), Object.keys(ctx).sort().join()],
        ['active,dailyRate,hourlyRate,id,name,phone', 'id,name,phone', 'attendance,sites,vehicles,workers']);
    same('the waiting men are the men with a site, in roster order',
        plain(Core.waiting(plain(ctx), plain(device.call('transportDayOf', DAY)))), ['w_01', 'w_02', 'w_03', 'w_04', 'w_06']);
});

// REPLACES v171's «the plan: suggest, move, driver, locks» and «accepting: … versions»
// blocks. There is no suggestion, no lock, nothing to accept and no version any more
// (the owner, 2026-11-10); what a person does now is put a man on a seat, and that is
// what is measured - through the same functions a drag and a tap call.
await block('the plan: a man on a seat, kept at once - and never the record', async () => {
    const device = crewPhone('d_plan');
    const schedule = JSON.stringify(device.State.schedule);
    const disk = device.raw('scheduleData:v2');

    check('nothing is kept before anything is done', device.raw(DAY_KEY) === null);
    check('a waiting man is put on the driver\'s seat', device.call('transportPlace', DAY, 'w_01', 'tv_01', 1) === true);
    same('and that is on the disk at once - there is nothing to accept',
        plain(keptDay(device).trips), { tv_01: { driver: 'w_01', passengers: [], seats: {} } });
    same('what a day keeps: these and no more', Object.keys(keptDay(device)).sort(), ['marks', 'status', 'trips', 'unavailable', 'version']);
    device.call('transportPlace', DAY, 'w_02', 'tv_01', 5);
    device.call('transportPlace', DAY, 'w_03', 'tv_01', 3);
    same('two passengers, each on the seat he was put on', car5(device, 'tv_01'), 'w_01 - w_03 - w_02');
    check('a waiting man dropped on a taken seat takes it', device.call('transportPlace', DAY, 'w_04', 'tv_01', 5) === true);
    same('and the man who sat there is waiting again', [car5(device, 'tv_01'), tripsOf(device)],
        ['w_01 - w_03 - w_04', 'tv_01=w_01+[w_03,w_04]']);
    device.call('transportPlace', DAY, 'w_02', 'tv_02', 1);
    check('a seated man dropped on a taken seat of another car', device.call('transportPlace', DAY, 'w_04', 'tv_02', 1) === true);
    same('changes places with the man in it - and so becomes that car\'s driver',
        [car5(device, 'tv_01'), car5(device, 'tv_02')], ['w_01 - w_03 - w_02', 'w_04 - - - -']);
    same('refused, with nothing changed: his own seat, a seat the car does not have, a man marked נעדר, an unknown car',
        [device.call('transportPlace', DAY, 'w_04', 'tv_02', 1), device.call('transportPlace', DAY, 'w_06', 'tv_02', 6),
            device.call('transportPlace', DAY, 'w_05', 'tv_02', 2), device.call('transportPlace', DAY, 'w_06', 'tv_99', 2), tripsOf(device)],
        [false, false, false, false, 'tv_01=w_01+[w_03,w_02] tv_02=w_04+[]']);

    check('a man is taken out of his car', device.call('transportUnseat', DAY, 'w_03') === true
        && device.call('transportUnseat', DAY, 'w_03') === false);
    same('and is waiting', car5(device, 'tv_01'), 'w_01 - - - w_02');

    check('a vehicle is kept home', device.call('transportSetAvailable', DAY, 'tv_01', false) === true);
    same('its men are waiting again - on the disk too, not only on the glass',
        [tripsOf(device), plain(keptDay(device).unavailable), plain(keptDay(device).trips.tv_01 || null)],
        ['tv_02=w_04+[]', { tv_01: true }, null]);
    check('nobody can be put in it', device.call('transportPlace', DAY, 'w_01', 'tv_01', 1) === false);
    check('and it goes out again, empty', device.call('transportSetAvailable', DAY, 'tv_01', true) === true
        && car5(device, 'tv_01') === '- - - - -');

    check('a status takes a man out of his seat', device.call('transportSetStatus', DAY, 'w_04', 'private') === true
        && device.call('transportDayOf', DAY).status.w_04 === 'private' && tripsOf(device) === '');
    check('he cannot be seated while he has it', device.call('transportPlace', DAY, 'w_04', 'tv_02', 1) === false);
    check('brought back, he is waiting and can be', device.call('transportSetStatus', DAY, 'w_04', null) === true
        && device.call('transportPlace', DAY, 'w_04', 'tv_02', 1) === true);
    check('«ממתין» is not a status that can be set', device.call('transportSetStatus', DAY, 'w_03', 'waiting') === false);

    const again = reopen(device);
    same('the plan survives the app being closed', [tripsOf(again), car5(again, 'tv_02')], ['tv_02=w_04+[]', 'w_04 - - - -']);

    // The day changes under the plan: the driver is marked נעדר after he was seated.
    again.call('transportPlace', DAY, 'w_06', 'tv_02', 2);
    again.State.commit(again.call('markAbsent', again.State.schedule, DAY, 'w_04', 'actual'));
    same('a seated man who no longer has a site today stays drawn, and is named',
        [car5(again, 'tv_02'), codes(Core.validate(plain(again.call('transportContext', DAY)), plain(again.call('transportDayOf', DAY))))],
        ['w_04 w_06 - - -', ['notWorking:tv_02:w_04']]);
    check('he cannot be moved to another seat, only out', again.call('transportPlace', DAY, 'w_04', 'tv_01', 1) === false
        && again.call('transportUnseat', DAY, 'w_04') === true && car5(again, 'tv_02') === '- w_06 - - -');

    same('through all of it the schedule in memory is byte for byte what it was',
        JSON.stringify(device.State.schedule), schedule);
    same('and so is the record on the disk', device.raw('scheduleData:v2'), disk);
});

// A phone that had v171 or v172 on it. These are the bytes those builds wrote: a draft
// with a pickup area and a lock on each trip, a seat for one passenger only, a locked
// worker, an accepted version, and a message marked opened and sent; and the settings
// with two pickup areas and who may drive what.
const V171_DAY = JSON.stringify({ version: 1, unavailable: { tv_03: true }, status: { w_06: 'contractor' },
    trips: { tv_01: { driver: 'w_01', passengers: ['w_02', 'w_03'], area: 'ta_n', locked: true, seats: { w_03: 5 } },
        tv_03: { driver: null, passengers: ['w_04'], area: null, locked: true, seats: {} } },
    workerLocks: { w_02: true },
    accepted: [{ n: 1, at: 1794000000000, complete: true, errors: 0, reason: '', sig: '[]', moved: null,
        unavailable: {}, status: {}, trips: { tv_01: { driver: 'w_01', passengers: ['w_02'], area: 'ta_n', locked: false, seats: {} } },
        attendance: { w_01: 'p_01', w_02: 'p_01' } }],
    marks: { tv_01: { sig: 'deadbeef', openedAt: 1794000000001, sentAt: 1794000000002 } } });
const V171_SETTINGS = JSON.stringify({ version: 1, seeded: true,
    vehicles: [{ id: 'tv_01', name: 'טויוטה קורולה 2013', seats: 5, active: true },
        { id: 'tv_03', name: 'BYD סיל U 2025', seats: 5, active: true },
        { id: 'tv_05', name: 'פולקסווגן 2018', seats: 9, active: true, rows: [2, 2, 2, 3] }],
    areas: [{ id: 'ta_n', name: 'צפון' }, { id: 'ta_s', name: 'דרום' }],
    workers: { w_01: { area: 'ta_n', canDrive: true, drives: 'all' }, w_04: { area: 'ta_s', canDrive: true, drives: ['tv_03'] } } });

await block('a day and a list written by v171 open cleanly, and are not rewritten until changed', async () => {
    const old = crewPhone('d_v171');
    old.putRaw(DAY_KEY, V171_DAY);
    old.putRaw(SETTINGS, V171_SETTINGS);
    const device = reopen(old);

    same('the list is the three vehicles that phone had - not seeded over',
        device.call('transportSettings').vehicles.map(v => v.id), ['tv_01', 'tv_03', 'tv_05']);
    same('the car is drawn as v171 left it: the driver, the man with a seat on his seat («אחורי שמאל» was 5), the other on the first free one',
        car5(device, 'tv_01'), 'w_01 w_02 - - w_03');
    check('the vehicle v171 had marked unavailable is still kept home, and the man a lock had left in it is waiting',
        device.call('transportDayOf', DAY).unavailable.tv_03 === true
        && plain(Core.waiting(plain(device.call('transportContext', DAY)), plain(device.call('transportDayOf', DAY)))).join() === 'w_04');
    same('the status is read', device.call('transportDayOf', DAY).status.w_06, 'contractor');
    same('a mark made on v171\'s message is not believed for the message there is now',
        device.call('transportMarkState', DAY, 'tv_01'), 'none');
    check('nothing was said to be unreadable', device.call('transportSawUnreadable') === false);
    device.call('transportDriverMessage', DAY, 'tv_01');
    device.call('transportPrune', DAY);
    same('READING REWRITES NOTHING: the day is byte for byte what v171 wrote', device.raw(DAY_KEY), V171_DAY);
    same('and so is the list', device.raw(SETTINGS), V171_SETTINGS);

    check('the first change to that day', device.call('transportPlace', DAY, 'w_04', 'tv_01', 3) === true);
    const kept = keptDay(device);
    same('writes the picture: every passenger with his seat, nothing for the vehicle that stays home',
        plain(kept.trips), { tv_01: { driver: 'w_01', passengers: ['w_02', 'w_04', 'w_03'], seats: { w_02: 2, w_04: 3, w_03: 5 } } });
    same('and what the picture has no use for is gone from that day: versions, locks, pickup areas, the «sent» mark',
        [Object.keys(kept).sort(), /accepted|workerLocks|locked|area|sentAt/.test(device.raw(DAY_KEY))],
        [['marks', 'status', 'trips', 'unavailable', 'version'], false]);
    same('what still means something is still there', [plain(kept.unavailable), plain(kept.status)], [{ tv_03: true }, { w_06: 'contractor' }]);
    same('a change to a DAY does not touch the list', device.raw(SETTINGS), V171_SETTINGS);

    device.call('transportRenameVehicle', 'tv_05', 'פולקסווגן');
    const list = JSON.parse(device.raw(SETTINGS));
    same('a change to the list keeps what v171 had typed into it - the pickup areas and who may drive - unread and untouched',
        [list.vehicles[2].name, list.areas, list.workers],
        ['פולקסווגן', [{ id: 'ta_n', name: 'צפון' }, { id: 'ta_s', name: 'דרום' }],
            { w_01: { area: 'ta_n', canDrive: true, drives: 'all' }, w_04: { area: 'ta_s', canDrive: true, drives: ['tv_03'] } }]);
    check('a day v174 wrote is one v171 would still have read: the same version, the same trip fields',
        kept.version === 1 && Object.keys(kept.trips.tv_01).sort().join() === 'driver,passengers,seats');
});

await block('the driver\'s message, composed exactly, and the mark', async () => {
    const device = crewPhone('d_message');
    same('a car with nobody in the driver\'s seat has no message', [device.call('transportDriverMessage', DAY, 'tv_03'),
        device.call('transportMarkState', DAY, 'tv_03'), device.call('transportMarkOpened', DAY, 'tv_03')], ['', 'nodriver', false]);
    device.call('transportPlace', DAY, 'w_06', 'tv_03', 5);
    device.call('transportPlace', DAY, 'w_03', 'tv_03', 4);
    device.call('transportPlace', DAY, 'w_02', 'tv_03', 3);
    device.call('transportPlace', DAY, 'w_01', 'tv_03', 2);
    same('passengers and no driver: still no message', device.call('transportMarkState', DAY, 'tv_03'), 'nodriver');
    device.call('transportPlace', DAY, 'w_04', 'tv_03', 1);
    const text = device.call('transportDriverMessage', DAY, 'tv_03');
    // MOVED IN v174: the «איסוף: …» line is gone with pickup areas, and the passengers are
    // listed in the order of their SEATS (they were put in back to front above).
    same('the message, line for line', text.split('\n'), [
        `שלום ${named('סמיר')},`,
        'הסעה ליום שלישי 10/11/2026:',
        `רכב: ${car('BYD סיל U 2025')}`,
        'נוסעים (4):',
        `- ${named('אחמד')} – ${named('הרצליה')}`,
        `- ${named('מוחמד')} – ${named('הרצליה')}`,
        `- ${named('יוסי')} – ${named('חיפה')}`,
        `- ${named('Ali Hassan')} – ${named('פרדסיה')}`,
        `יעדים: ${named('הרצליה')}, ${named('חיפה')}, ${named('פרדסיה')}`
    ]);
    check('the vehicle\'s name is held right-to-left, not first-strong: it begins with a Latin letter',
        text.includes(`${RLI}BYD`) && !text.includes(`${FSI}BYD`));
    same('the number is the seder\'s own rule', device.call('transportDriverNumber', DAY, 'tv_03'), '972501112233');
    same('and so is the address a tap is given',
        device.call('sederUrl', device.call('transportDriverNumber', DAY, 'tv_03'), text),
        `https://wa.me/972501112233?text=${encodeURIComponent(text)}`);

    same('nothing is marked to begin with', device.call('transportMarkState', DAY, 'tv_03'), 'none');
    device.call('transportMarkOpened', DAY, 'tv_03');
    same('a tap on the link is "opened" - never "sent"', device.call('transportMarkState', DAY, 'tv_03'), 'opened');
    check('there is no "sent" anywhere in what is kept', !/sent/i.test(device.raw(DAY_KEY)));
    same('it survives the app being closed', reopen(device).call('transportMarkState', DAY, 'tv_03'), 'opened');

    // The car's message changes: the mark is no longer believed.
    device.call('transportUnseat', DAY, 'w_06');
    same('with a man out of the car the message carries one man fewer',
        device.call('transportDriverMessage', DAY, 'tv_03').split('\n').slice(3, 4), ['נוסעים (3):']);
    same('and a mark made on the old words is not believed for the new ones', device.call('transportMarkState', DAY, 'tv_03'), 'none');
    device.call('transportMarkOpened', DAY, 'tv_03');
    same('opening the new message is a new mark', device.call('transportMarkState', DAY, 'tv_03'), 'opened');
    device.State.schedule.workers.find(w => w.id === 'w_04').phone = '0501112234';
    same('a corrected number un-believes it too', device.call('transportMarkState', DAY, 'tv_03'), 'none');
    device.State.schedule.workers.find(w => w.id === 'w_04').phone = 'אין';
    same('and a driver with no usable number is said to have none', device.call('transportMarkState', DAY, 'tv_03'), 'nophone');
    check('for him nothing can be marked', device.call('transportMarkOpened', DAY, 'tv_03') === false);
    device.State.schedule.workers.find(w => w.id === 'w_04').phone = '0501112233';
    device.call('transportMarkOpened', DAY, 'tv_03');
    device.call('transportPlace', DAY, 'w_01', 'tv_03', 1);
    same('another man in the driver\'s seat is another message to another number',
        [device.call('transportDriverNumber', DAY, 'tv_03'), device.call('transportMarkState', DAY, 'tv_03'),
            device.call('transportDriverMessage', DAY, 'tv_03').split('\n')[0]], ['972528841930', 'none', `שלום ${named('אחמד')},`]);
    device.call('transportUnseat', DAY, 'w_01');
    check('and with the driver\'s seat empty the mark is gone from the disk', keptDay(device).marks.tv_03 === undefined);

    // A driver alone: no passengers, his own site.
    const lone = crewPhone('d_alone');
    lone.call('transportPlace', DAY, 'w_06', 'tv_01', 1);
    same('a driver alone', lone.call('transportDriverMessage', DAY, 'tv_01').split('\n'),
        [`שלום ${named('Ali Hassan')},`, 'הסעה ליום שלישי 10/11/2026:', `רכב: ${car('טויוטה קורולה 2013')}`,
            'בלי נוסעים.', `יעדים: ${named('פרדסיה')}`]);
    // A passenger whose site left the day after he was seated: named, and no site made up.
    lone.call('transportPlace', DAY, 'w_03', 'tv_01', 2);
    lone.State.commit(lone.call('markAbsent', lone.State.schedule, DAY, 'w_03', 'actual'));
    same('a passenger with no site today is named with no site', lone.call('transportDriverMessage', DAY, 'tv_01').split('\n').slice(3),
        ['נוסעים (1):', `- ${named('יוסי')}`, `יעדים: ${named('פרדסיה')}`]);
});

// v179. The owner, 2026-11-10: "is there a report for the cars?" - the whole day on one
// page. Composed line for line here; the dialog it is shown in, its three ways out and the
// picture are tests/transport.browser.mjs.
await block('the summary of the day: every car, its driver, its men, who waits and what stays home', async () => {
    const device = crewPhone('d_summary');
    const lines = (date = DAY) => device.call('transportSummaryText', date).split('\n');
    const HEAD = 'סיכום הסעות ליום שלישי 10/11/2026:';
    const man = (name, site) => `- ${named(name)} – ${named(site)}`;

    same('nobody seated yet: it says so, lists the men waiting in roster order, and does not list seven empty vehicles',
        lines(), [HEAD, '', 'אף עובד לא שובץ לרכב.', '',
            'ממתינים לשיבוץ (5):', man('אחמד', 'הרצליה'), man('מוחמד', 'הרצליה'), man('יוסי', 'חיפה'), man('סמיר', 'חיפה'),
            man('Ali Hassan', 'פרדסיה')]);
    check('a man on two sites is named with the first his day holds, as on the screen',
        lines().includes(man('מוחמד', 'הרצליה')) && !lines().some(line => line.includes('מוחמד') && line.includes('חיפה')));
    check('and the man marked נעדר is nowhere in it', !lines().join('\n').includes('עלי'));

    // The third vehicle of the list gets a driver and two men put in back to front; the
    // first gets a passenger and nobody at the wheel; two are kept home.
    device.call('transportPlace', DAY, 'w_01', 'tv_03', 3);
    device.call('transportPlace', DAY, 'w_02', 'tv_03', 2);
    device.call('transportPlace', DAY, 'w_04', 'tv_03', 1);
    device.call('transportPlace', DAY, 'w_06', 'tv_01', 4);
    device.call('transportSetAvailable', DAY, 'tv_05', false);
    device.call('transportSetAvailable', DAY, 'tv_07', false);
    const disk = JSON.stringify(device.dump());
    const fence = device.Store.fenceState();
    const queued = JSON.stringify(device.Sync.pendingPaths());
    const schedule = JSON.stringify(device.State.schedule);
    const full = lines();
    same('the whole day, line for line: the vehicles in the order of the list, the driver first, the men in the order of their SEATS',
        full, [HEAD, '',
            `רכב: ${car('טויוטה קורולה 2013')} – 1 מתוך 5`, 'בלי נהג', man('Ali Hassan', 'פרדסיה'), '',
            `רכב: ${car('BYD סיל U 2025')} – 3 מתוך 5`, `נהג: ${named('סמיר')} – ${named('חיפה')}`,
            man('מוחמד', 'הרצליה'), man('אחמד', 'הרצליה'), '',
            'ממתינים לשיבוץ (1):', man('יוסי', 'חיפה'), '',
            `רכבים ריקים: ${car('טויוטה קורולה 2016')}, ${car('BYD אטו 3 2025')}, ${car('סוואנה 2010')}`, '',
            `רכבים שלא זמינים היום: ${car('פולקסווגן 2018')}, ${car('ליפמוטור C10 2026')}`]);
    check('a vehicle is always named after a Hebrew word and held right-to-left: no line begins with its name',
        full.every(line => !line.startsWith(RLI) && !/^[A-Za-z]/.test(line))
        && full.join('\n').includes(`${RLI}BYD`) && !full.join('\n').includes(`${FSI}BYD`));
    same('every car in it is what the screen draws: the same picture, asked of the same engine',
        ['tv_01', 'tv_03'].map(id => car5(device, id)), ['- - - w_06 -', 'w_04 w_02 w_01 - -']);

    // IT IS A READING. Composing it - twice - moved nothing: not a transport key, not the
    // record, not the queue, not the write counter, not a mark.
    lines();
    device.call('transportSummaryBlocks', device.call('transportContext', DAY), device.call('transportDayOf', DAY), DAY);
    same('composing it wrote nothing: every key on the disk is byte for byte what it was', JSON.stringify(device.dump()), disk);
    same('the write counter did not move', device.Store.fenceState(), fence);
    same('nothing was queued for the cloud', JSON.stringify(device.Sync.pendingPaths()), queued);
    same('the schedule in memory is what it was', JSON.stringify(device.State.schedule), schedule);
    same('and no car was marked as opened by it', device.call('transportMarkState', DAY, 'tv_03'), 'none');
    check('nothing in it says «נשלח», of the summary or of anything else', !/נשלח|sent/i.test(full.join('\n')));

    // PURE: the same input, the same blocks; and the input is not changed.
    const ctx = plain(device.call('transportContext', DAY));
    const day = plain(device.call('transportDayOf', DAY));
    const before = JSON.stringify([ctx, day]);
    const once = JSON.stringify(device.call('transportSummaryBlocks', ctx, day, DAY));
    same('the builder is pure: two readings are the same bytes', JSON.stringify(device.call('transportSummaryBlocks', ctx, day, DAY)), once);
    check('and it does not change what it was handed', JSON.stringify([ctx, day]) === before);
    same('the text is the blocks, a blank line between them',
        JSON.parse(once).map(block => block.join('\n')).join('\n\n'), full.join('\n'));

    // A driver alone, and everybody seated: no «ממתינים» block at all.
    device.call('transportPlace', DAY, 'w_03', 'tv_02', 1);
    const seated = lines();
    same('a driver alone has his own block, with his site and «בלי נוסעים.»',
        seated.slice(seated.indexOf(`רכב: ${car('טויוטה קורולה 2016')} – 1 מתוך 5`)).slice(0, 3),
        [`רכב: ${car('טויוטה קורולה 2016')} – 1 מתוך 5`, `נהג: ${named('יוסי')} – ${named('חיפה')}`, 'בלי נוסעים.']);
    check('with everybody seated there is no waiting block', !seated.some(line => line.startsWith('ממתינים')));
    same('and that vehicle has left the empty ones',
        seated.filter(line => line.startsWith('רכבים ריקים')), [`רכבים ריקים: ${car('BYD אטו 3 2025')}, ${car('סוואנה 2010')}`]);

    // The day changed under the plan: a seated man, and a driver, with no site today.
    device.State.commit(device.call('markAbsent', device.State.schedule, DAY, 'w_01', 'actual'));
    device.State.commit(device.call('markAbsent', device.State.schedule, DAY, 'w_04', 'actual'));
    const changed = lines();
    same('a seated man with no site today is named in his seat with no site made up - passenger and driver alike',
        changed.slice(changed.indexOf(`רכב: ${car('BYD סיל U 2025')} – 3 מתוך 5`)).slice(0, 4),
        [`רכב: ${car('BYD סיל U 2025')} – 3 מתוך 5`, `נהג: ${named('סמיר')}`, man('מוחמד', 'הרצליה'), `- ${named('אחמד')}`]);

    // A man who gets there another way is in no car and waits for none.
    device.call('transportUnseat', DAY, 'w_06');
    same('taken out of his car a man is waiting again, and a car left with nobody in it is an empty one',
        [lines().includes('ממתינים לשיבוץ (1):'), lines().some(line => line.startsWith('רכבים ריקים') && line.includes('2013'))], [true, true]);
    device.call('transportSetStatus', DAY, 'w_06', 'private');
    check('marked «לא בהסעה שלנו» he is not in the summary at all', !lines().join('\n').includes('Ali Hassan'));

    // A day nobody works on, and a day that is not one.
    same('a day with nobody on a site says so and nothing more', lines('2026-11-12'),
        ['סיכום הסעות ליום חמישי 12/11/2026:', '', 'אין ביום הזה עובדים עם אתר עבודה.']);
    same('a date that is not a date has no summary', device.call('transportSummaryText', '2026-13-40'), '');
    check('asking about another day wrote nothing either', device.raw('farkadTransport:day:2026-11-12') === null);

    // A DAY WRITTEN BY v171: read as the screen reads it, and not rewritten by being read.
    const old = crewPhone('d_summary_v171');
    old.putRaw(DAY_KEY, V171_DAY);
    old.putRaw(SETTINGS, V171_SETTINGS);
    const elder = reopen(old);
    same('a day v171 wrote: its car with the driver, the man it gave a seat and the man it did not; the man its lock left in a vehicle kept home is waiting; the contractor\'s man is absent from it',
        elder.call('transportSummaryText', DAY).split('\n'), [HEAD, '',
            `רכב: ${car('טויוטה קורולה 2013')} – 3 מתוך 5`, `נהג: ${named('אחמד')} – ${named('הרצליה')}`,
            man('מוחמד', 'הרצליה'), man('יוסי', 'חיפה'), '',
            'ממתינים לשיבוץ (1):', man('סמיר', 'חיפה'), '',
            `רכבים ריקים: ${car('פולקסווגן 2018')}`, '',
            `רכבים שלא זמינים היום: ${car('BYD סיל U 2025')}`]);
    same('READING REWRITES NOTHING: that day is byte for byte what v171 wrote', elder.raw(DAY_KEY), V171_DAY);
    same('and so is its list', elder.raw(SETTINGS), V171_SETTINGS);

    // With the switch off there is no summary, and nothing is read to find that out.
    const reads = [];
    const off = bare('d_summary_off');
    const get = off.Store.get.bind(off.Store);
    off.Store.get = key => { reads.push(String(key)); return get(key); };
    load(off);
    same('with the switch off there is no summary and no dialog', [off.call('transportSummaryText', DAY), off.call('openTransportSummary')], ['', false]);
    same('and the only transport key read is the switch', [...new Set(reads.filter(key => /transport/i.test(key)))], [ENABLED]);

    // The code that composes, shows, sends and copies it calls nothing that writes.
    const section = (from, to) => SCREEN.slice(SCREEN.indexOf(from), SCREEN.indexOf(to))
        .split('\n').filter(line => !/^\s*\/\//.test(line)).join('\n');
    const code = section('== the summary of the day', '== the list of vehicles, changed')
        + section('== the summary\'s dialog', '== carrying a man');
    given('the summary\'s two sections were found in the screen\'s file', /function transportSummaryBlocks/.test(code)
        && /function openTransportSummary/.test(code) && /function planTransportPrintout/.test(code));
    same('nothing in them writes, marks, commits or touches the store',
        code.match(/transportKeep|transportSaveDay|transportSaveSettings|transportWrite|transportMarkOpened|transportRedrawn|Store\.|localStorage|State\.(commit|commitMany|save|persist)|FarkadSync|window\.print/g) || [], []);
    check('the text goes out by the day message\'s own two doors, and the picture by the printout\'s',
        /shareTextOut\(/.test(code) && /copyTextOut\(/.test(code) && /sharePrintout\('transport'\)/.test(code)
        && !/navigator\.share|wa\.me|clipboard|execCommand|window\.open/.test(code));
});

await block('a number becomes a wa.me number only by the seder\'s rule', async () => {
    const device = crewPhone('d_numbers');
    const number = phone => {
        device.State.schedule.workers[0].phone = phone;
        return device.call('transportContext', DAY).workers[0].phone === phone ? device.call('sederWaNumber', phone) : 'x';
    };
    same('a local mobile', number('052-884-1930'), '972528841930');
    same('an international one, trunk zero and all', number('+972 (0)52-884-1930'), '972528841930');
    same('00972', number('00972528841930'), '972528841930');
    same('a landline is no number', number('04-8123456'), '');
    same('too short is no number', number('1234'), '');
    same('two numbers in one field is no number', number('0528841930 / 0541234567'), '');
    same('nothing is no number', number(''), '');
});

// An evening's worth of what the screen can do, by the functions its drags and taps call.
function evening(device) {
    device.call('transportPlace', DAY, 'w_01', 'tv_01', 1);
    device.call('transportPlace', DAY, 'w_02', 'tv_01', 2);
    device.call('transportPlace', DAY, 'w_04', 'tv_05', 1);
    device.call('transportPlace', DAY, 'w_03', 'tv_05', 9);
    device.call('transportSetStatus', DAY, 'w_06', 'private');
    device.call('transportSetAvailable', DAY, 'tv_07', false);
}

await block('none of it is the record: not the schedule, not the outbox, not the fence', async () => {
    const device = crewPhone('d_record');
    const schedule = JSON.stringify(device.State.schedule);
    const disk = device.raw('scheduleData:v2');
    const queued = JSON.stringify(device.Sync.pendingPaths());
    const fence = device.Store.fenceState();
    given('the record is on the disk and the fence can be read', disk !== null && fence !== null);

    evening(device);
    device.call('transportAddVehicle', 'מיניבוס', 12);
    device.call('transportMarkOpened', DAY, 'tv_01');
    device.call('transportUnseat', DAY, 'w_03');
    device.call('transportPrune', DAY);
    device.call('transportSetEnabled', false);
    device.call('transportSetEnabled', true);

    given('the feature did write: its settings and its day are on the disk',
        device.raw(SETTINGS) !== null && device.raw(DAY_KEY) !== null && device.raw(ENABLED) === '1');
    same('the schedule in memory is byte for byte what it was', JSON.stringify(device.State.schedule), schedule);
    same('so is the record on the disk', device.raw('scheduleData:v2'), disk);
    same('nothing was queued for the cloud', JSON.stringify(device.Sync.pendingPaths()), queued);
    same('the write counter did not move: none of these is a record the rescue file carries',
        device.Store.fenceState(), fence);
    same('every key it wrote is under its own name',
        Object.keys(device.dump()).filter(key => /transport/i.test(key)).sort(), [DAY_KEY, ENABLED, SETTINGS].sort());
    check('and none of them is a key the rescue file or the queue knows',
        [DAY_KEY, ENABLED, SETTINGS].every(key => device.call('isFarkadSnapshotKey', key) === false
            && device.call('isFarkadRecordKey', key) === false));
});

await block('none of it leaves the phone: no cloud, no backup, no restore point, no rescue file', async () => {
    const cloud = makeCloud();
    const device = crewPhone('d_cloud');
    device.Sync.connect(cloud.adapter);
    const synced = await settleUntil(() => device.Sync.status === 'synced' && device.Sync.pendingCount() === 0, 5000);
    given('the phone is connected and has sent its record', synced, device.Sync.status);
    const attempts = cloud.attempts.length;
    const doc = JSON.stringify(cloud.doc);

    evening(device);
    device.call('transportAddVehicle', 'מיניבוס', 12);
    device.call('transportMarkOpened', DAY, 'tv_01');
    given('the plan is on this phone', device.raw(DAY_KEY) !== null && device.raw(SETTINGS) !== null);
    await settle(TICK * 20);
    same('the cloud was not written to', cloud.attempts.length, attempts);
    same('and holds the document it held', JSON.stringify(cloud.doc), doc);
    check('which has no word of transport in it', !/transport|tv_0|ta_/i.test(JSON.stringify(cloud.doc)));

    // The control, so the silence above is about this feature and not a dead connection.
    device.State.commit(device.call('assignPlace', device.State.schedule, '2026-11-11', 'w_01', 'actual', 'p_02'));
    const travelled = await settleUntil(() => cloud.attempts.length > attempts, 5000);
    check('while an ordinary edit on the same phone still goes to the cloud', travelled);
    await settleUntil(() => device.Sync.pendingCount() === 0, 5000);
    check('and what it sent has no word of transport either',
        !/transport|tv_0|ta_/i.test(JSON.stringify(cloud.doc)) && !/transport|tv_0/i.test(JSON.stringify(cloud.attempts)));

    const foreign = text => /farkadTransport|tv_0\d|"ta_|"passengers"|"unavailable"|openedAt/.test(String(text));
    given('the detector would see a plan if one were there', foreign(device.raw(DAY_KEY)) && foreign(device.raw(SETTINGS)));
    device.call('exportBackup');
    const backup = device.downloads[device.downloads.length - 1];
    given('the backup file was handed over', Boolean(backup && backup.text && /\.json$/.test(backup.name)),
        JSON.stringify(backup && backup.name));
    same('the backup is the record and only the record', JSON.parse(backup.text),
        JSON.parse(JSON.stringify(device.State.schedule)));
    check('with nothing of transport in it', !foreign(backup.text));

    device.call('takeDailySnapshot');
    const points = Object.keys(device.dump()).filter(key => key.startsWith('scheduleData:snap:'));
    given('a restore point was taken', points.length >= 1, points.join(','));
    check('no restore point carries anything of it', points.every(key => !foreign(device.raw(key))));

    device.call('exportRecoveryData');
    const rescue = device.downloads[device.downloads.length - 1];
    given('the rescue file was handed over', Boolean(rescue && rescue.text && rescue.text.includes('farkad-recovery')),
        JSON.stringify(rescue && rescue.name));
    check('and the rescue file does not carry it either', !foreign(rescue.text));
});

await block('a transport record that will not read cannot block the day', async () => {
    const device = crewPhone('d_broken');
    evening(device);
    device.call('transportAddVehicle', 'מיניבוס', 12);
    const brokenSettings = '{"version":1,"vehicles":[{"id":"tv_01","na';
    const brokenDay = '{"version":1,"trips":{"tv_01":{"driver":"w_0';
    device.putRaw(SETTINGS, brokenSettings);
    device.putRaw(DAY_KEY, brokenDay);

    const again = reopen(device);
    check('loading the screen\'s file did not throw, and the app is not held',
        again.call('farkadWritesBlocked') === false);
    same('unreadable settings start from the seven', again.call('transportSettings').vehicles.length, 7);
    same('an unreadable day starts empty', Object.keys(again.call('transportDayOf', DAY).trips).length, 0);
    check('and the screen is told to say so', again.call('transportSawUnreadable') === true);
    same('the bytes that would not read are kept aside, both of them',
        [again.raw(`${SETTINGS}:unreadable`), again.raw(`${DAY_KEY}:unreadable`)], [brokenSettings, brokenDay]);
    check('the originals are still there until something is saved', again.raw(SETTINGS) === brokenSettings);
    check('Recovery was not involved: nothing was quarantined under the record\'s names',
        !Object.keys(again.dump()).some(key => /:damaged/.test(key)) && again.call('farkadWritesBlocked') === false);

    const before = again.raw('scheduleData:v2');
    again.State.commit(again.call('assignPlace', again.State.schedule, DAY, 'w_05', 'actual', 'p_03'));
    check('a day edit still commits, to memory and to the disk',
        again.raw('scheduleData:v2') !== before
        && JSON.parse(again.raw('scheduleData:v2')).days[DAY].actual.w_05.entries.length === 1);
    check('and the plan then counts the man it added', again.call('transportContext', DAY).attendance.w_05 === 'p_03');
    // MOVED IN v174: the change used to be «הוספת אזור». Areas are gone; a vehicle added
    // to the list is the same kind of write to the same key.
    check('the next change writes a readable record over the broken one - the copy is aside',
        again.call('transportAddVehicle', 'טנדר', 5) !== null && JSON.parse(again.raw(SETTINGS)).vehicles.length === 8
        && again.raw(`${SETTINGS}:unreadable`) === brokenSettings);

    // No room to keep the copy: then nothing is written over the only copy there is.
    const full = crewPhone('d_broken_full');
    full.putRaw(SETTINGS, brokenSettings);
    const tight = reopen(full);
    tight.setQuota(key => /^farkadTransport:/.test(key));
    tight.call('transportSettings');
    check('with no room for a copy, a change is NOT written over the unreadable bytes',
        tight.call('transportAddVehicle', 'טנדר', 5) !== null && tight.raw(SETTINGS) === brokenSettings);
    check('and the screen is told it was not kept', tight.call('transportWasKept') === false);
    check('while the session still holds the change', tight.call('transportSettings').vehicles.length === 8);

    // Poison: names that would land on a prototype are not ids.
    const poisoned = crewPhone('d_poison');
    poisoned.putRaw(SETTINGS, '{"version":1,"seeded":true,"vehicles":[{"id":"__proto__","name":"x","seats":5},'
        + '{"id":"tv_ok","name":"טנדר","seats":5},{"id":"v_01","name":"ישן","seats":5}],"areas":[{"id":"constructor","name":"y"}],'
        + '"workers":{"__proto__":{"canDrive":true,"drives":"all"},"constructor":{"canDrive":true},"w_01":{"canDrive":true,"drives":"all"}}}');
    poisoned.putRaw(DAY_KEY, '{"version":1,"status":{"__proto__":"private","w_01":"waiting","w_02":"other"},'
        + '"trips":{"__proto__":{"driver":"w_01","passengers":[]},"tv_ok":{"driver":"constructor","passengers":["w_02","w_02","__proto__"],'
        + '"seats":{"__proto__":2,"w_02":"3"}}},"marks":{"__proto__":{"sig":"x","openedAt":1},"tv_ok":{"sig":"y","openedAt":"soon"}}}');
    const safe = reopen(poisoned);
    const settings = safe.call('transportSettings');
    same('a poisoned name is not a vehicle - and the retired feature\'s v_NN is not one of ours; what is carried for v171 is carried clean',
        [settings.vehicles.map(v => v.id), settings.areas.length, Object.keys(settings.workers)], [['tv_ok'], 0, ['w_01']]);
    const day = safe.call('transportDayOf', DAY);
    same('nor a status, a trip, a seat or a mark; «ממתין» left over from the proposal is dropped',
        [Object.keys(day.status), Object.keys(day.trips), day.trips.tv_ok.driver, day.trips.tv_ok.passengers,
            Object.keys(day.trips.tv_ok.seats), Object.keys(day.marks)],
        [['w_02'], ['tv_ok'], null, ['w_02'], [], []]);
    check('and nothing landed on a prototype', ({}).canDrive === undefined && ({}).driver === undefined
        && safe.global('Object').prototype.canDrive === undefined && safe.global('Object').prototype.sig === undefined);
});

await block('a disk that refuses it keeps the session going, says so, and spends no restore point', async () => {
    const device = crewPhone('d_full');
    device.Store.set('scheduleData:snap:2026-11-01', JSON.stringify(device.State.schedule));
    given('there is a restore point a full disk could be tempted to spend',
        device.raw('scheduleData:snap:2026-11-01') !== null && typeof device.Store.reclaim === 'function');
    check('a disk that takes it says it was kept', device.call('transportPlace', DAY, 'w_01', 'tv_01', 1) === true
        && device.call('transportWasKept') === true);

    device.setQuota(key => /^farkadTransport:/.test(key));
    check('a change the disk refuses is still made for this session',
        device.call('transportPlace', DAY, 'w_02', 'tv_01', 2) === true && tripsOf(device) === 'tv_01=w_01+[w_02]');
    same('and is said not to have been kept', device.call('transportWasKept'), false);
    check('no restore point was spent making room for it', device.raw('scheduleData:snap:2026-11-01') !== null);
    check('nor was the record touched', device.raw('scheduleData:v2') !== null
        && JSON.parse(device.raw('scheduleData:v2')).days[DAY].actual.w_01.entries.length === 1);
    same('after a reopen only what reached the disk is there', tripsOf(reopen(device)), 'tv_01=w_01+[]');
});

await block('it keeps five weeks of days, not every day for ever', async () => {
    const device = crewPhone('d_prune');
    const keep = device.global('TRANSPORT_KEEP_DAYS');
    same('the limit is 35 days', keep, 35);
    const stage = (date, tail = '') => device.putRaw(`farkadTransport:day:${date}${tail}`, '{"version":1}');
    stage('2026-10-05');                 // 36 days before DAY
    stage('2026-10-05', ':unreadable');  // and the copy of an unreadable one
    stage('2026-10-06');                 // 35 days before: the edge, kept
    stage('2026-11-09');
    stage('2026-11-20');                 // a plan for next week
    device.putRaw('farkadTransport:day:not-a-date', '{"version":1}');
    device.putRaw('scheduleData:snap:2026-08-01', '{}');
    same('opening removes the days older than the limit, with their copies', device.call('transportPrune', DAY), 2);
    same('and leaves everything else exactly where it was',
        Object.keys(device.dump()).filter(key => key.startsWith('farkadTransport:day:')).sort(),
        ['farkadTransport:day:2026-10-06', 'farkadTransport:day:2026-11-09', 'farkadTransport:day:2026-11-20',
            'farkadTransport:day:not-a-date']);
    check('a restore point of the same age is not this feature\'s to remove',
        device.raw('scheduleData:snap:2026-08-01') === '{}');
});

await block('the switch: off is no entry, no reads and no writes', async () => {
    const reads = [];
    const device = bare('d_off');
    const get = device.Store.get.bind(device.Store);
    device.Store.get = key => { reads.push(String(key)); return get(key); };
    load(device);
    device.State.schedule.workers = WORKERS();
    device.State.schedule.places = PLACES();
    device.State.save({ silent: true });
    device.State.commit(device.call('assignPlace', device.State.schedule, DAY, 'w_01', 'actual', 'p_01'));

    same('it is off until this phone turns it on', device.call('transportEnabled'), false);
    check('opening it does nothing', device.call('openTransport', DAY) === false);
    // MOVED IN v174 with the functions themselves: areas, per-worker settings, suggest,
    // move, set-driver and accept no longer exist; place and unseat are what a person does.
    const refused = [
        device.call('transportAddVehicle', 'רכב', 5), device.call('transportRenameVehicle', 'tv_01', 'רכב'),
        device.call('transportSetVehicleSeats', 'tv_01', 7), device.call('transportRetireVehicle', 'tv_01'),
        device.call('transportSetAvailable', DAY, 'tv_01', false), device.call('transportSetStatus', DAY, 'w_01', 'private'),
        device.call('transportPlace', DAY, 'w_01', 'tv_01', 1), device.call('transportUnseat', DAY, 'w_01'),
        device.call('transportMarkOpened', DAY, 'tv_01'), device.call('transportPrune', DAY),
        device.call('transportSaveDay', DAY)];
    same('every change is refused', refused, [null, false, false, false, false, false, false, false, false, 0, false]);
    device.call('renderTransportIfOpen');
    device.call('transportInstallEntry');
    same('the only transport key that was ever read is the switch itself',
        [...new Set(reads.filter(key => /transport/i.test(key)))], [ENABLED]);
    same('and no transport key was written', Object.keys(device.dump()).filter(key => /transport/i.test(key)), []);
    same('with it off even the seven vehicles are not computed', device.call('transportSettings').vehicles.length, 0);

    check('turned on, it is on', device.call('transportSetEnabled', true) === true && device.raw(ENABLED) === '1');
    same('and has the seven', device.call('transportSettings').vehicles.length, 7);
    check('it stays on across the app being closed', reopen(device).call('transportEnabled') === true);
    check('turned off again, the preference is removed and the plans stay on the disk',
        (device.call('transportPlace', DAY, 'w_01', 'tv_01', 1), device.call('transportSetEnabled', false)) === false
        && device.raw(ENABLED) === null && device.raw(DAY_KEY) !== null);
    check('and after a reopen it is off', reopen(device).call('transportEnabled') === false);

    // The entry is a row in the WhatsApp dialog: drawn while the switch is on, taken out
    // of the document when it is off. A document just real enough to hold one row.
    const made = [];
    const actions = {
        children: [],
        querySelector: () => null,
        insertBefore(node) { this.children.push(node); node.parentNode = this; },
        removeChild(node) { this.children = this.children.filter(one => one !== node); node.parentNode = null; }
    };
    const page = bare('d_entry');
    page.ctx.document.querySelector = selector => (selector === '#shareModal .modal-actions' ? actions : null);
    page.ctx.document.getElementById = id => actions.children.find(node => node.id === id) || null;
    page.ctx.document.createElement = () => {
        const node = { style: {}, dataset: {}, setAttribute() {}, addEventListener() {}, appendChild() {},
            classList: { add() {}, remove() {}, contains: () => false } };
        made.push(node);
        return node;
    };
    load(page);
    // The seder's own row is in that dialog too; these are about this feature's.
    const entries = () => actions.children.filter(node => node.id !== 'sederEntry');
    same('off: no entry is drawn in the WhatsApp dialog', entries().length, 0);
    page.call('transportSetEnabled', true);
    same('on: one entry, by its word', entries().map(node => `${node.id}:${node.textContent}`),
        ['transportEntry:הסעות – שיבוץ לרכבים']);
    page.call('transportInstallEntry');
    same('and only one, however often it is asked for', entries().length, 1);
    page.call('transportSetEnabled', false);
    same('off again: the entry is taken out of the document', entries().length, 0);
});

await block('the retired «רכבים» feature is not touched, and nothing here shares its names', async () => {
    const device = crewPhone('d_vehicles');
    same('the vehicles flag is as shipped: off', device.global('FARKAD_FLAGS').vehicles, false);
    check('there is no transport flag: the gate is the per-phone switch',
        !Object.prototype.hasOwnProperty.call(device.global('FARKAD_FLAGS'), 'transport'));
    evening(device);
    same('the schedule\'s own vehicles list is as it was', JSON.stringify(device.State.schedule.vehicles || []), '[]');
    check('no day of the record gained a transport or vehicle layer',
        !/transport|vehicleRuns/.test(device.raw('scheduleData:v2')));
    check('the screen\'s file never commits, saves or syncs',
        !/State\.(commit|commitMany|save|persist)\s*\(|FarkadSync\.|Recovery\./.test(SCREEN));
    check('and never asks with the browser\'s own dialogs', !/\b(alert|confirm|prompt)\s*\(/.test(SCREEN.replace(/askConfirm\(/g, '')));
    check('the engine touches no storage, no document and no clock',
        !/Store\.|localStorage|document\.|Date\.now|new Date|Math\.random/.test(ENGINE));
    // v174: a man is carried with Pointer Events. The HTML5 drag-and-drop API does nothing
    // useful under a finger on an iPhone, and the only mention of it allowed in the
    // screen's code is the line that stops the browser starting one of its own.
    const code = SCREEN.split('\n').filter(line => !/^\s*\/\//.test(line)).join('\n');
    check('the screen carries a man with pointer events, and has no HTML5 drag-and-drop in it',
        /addEventListener\('pointerdown'/.test(code) && /addEventListener\('pointercancel'/.test(code)
        && /setPointerCapture/.test(code) && !/dataTransfer|'dragover'|'drop'|'dragenter'|\.draggable\s*=/.test(code));
    check('and what v171\'s planner was made of is not in it any more',
        !/transportSuggest|transportAccept|transportSetDriver|transportToggle\w*Lock|transportSetWorker|transportAddArea|transportMarkSent/.test(SCREEN));
});

// Every word the feature shows or sends. PROPOSED: the owner gave blanket approval of the
// wording on 2026-11-09 and corrects on sight - and a correction moves the line here, in
// the same commit (CLAUDE.md, law 6).
//
// MOVED IN v174, and the move is the point: the owner sent v171's planner back, so every
// word of its four tabs, its pickup areas, its "may drive", its suggestion, its locks, its
// acceptance, its versions and its «סימנתי שנשלח» is REMOVED from the block and from here
// (ninety-odd keys), the words of the picture are added, and two are changed:
// `tabVehicles` is now `vehiclesRow` (the same word, on a row instead of a tab), and
// `retireLead` no longer speaks of accepted versions, because there are none.
await block('the words, every one of them, and no other', async () => {
    const T = crewPhone('d_words').global('TRANSPORT_TEXT');
    const W = {
        switchTitle: 'הסעות',
        switchSub: 'שיבוץ עובדים לרכבים',
        switchLead: 'שיבוץ העובדים לרכבים והודעה לכל נהג. פועל במכשיר הזה בלבד: לא מסונכרן, לא משותף עם הטלפונים האחרים, ולא נכלל בגיבוי.',
        switchStateOn: 'מופעל במכשיר הזה',
        switchStateOff: 'כבוי',
        switchOn: 'הפעלת הסעות במכשיר הזה',
        switchOff: 'כיבוי הסעות במכשיר הזה',
        entry: 'הסעות – שיבוץ לרכבים',
        title: 'הסעות',
        back: 'חזרה',
        notKept: 'השינוי לא נשמר במכשיר. אם האפליקציה תיסגר, הוא יאבד.',
        unreadable: 'נתוני הסעות שנשמרו במכשיר לא נקראו. מתחילים מרשימה ריקה, והעותק שלא נקרא נשמר בצד.',
        nobody: 'אין ביום הזה עובדים עם אתר עבודה.',
        waiting: [[7], 'ממתינים לשיבוץ (7)'],
        allSeated: 'כל העובדים משובצים',
        hint: 'גוררים עובד אל מושב, או נוגעים בעובד ואז במושב. עובד שכבר יושב מזיזים בלחיצה ארוכה וגרירה.',
        picked: [['אחמד'], 'אחמד נבחר. נוגעים במושב.'],
        seatedIn: [['אחמד', 'סוואנה'], 'אחמד שובץ בסוואנה'],
        returned: [['אחמד'], 'אחמד חזר לממתינים'],
        addWorker: 'הוספת עובד',
        driverSeat: 'נהג',
        driver: [['אחמד'], 'נהג: אחמד'],
        chooseTitle: 'מי יושב כאן?',
        driverDialogTitle: [['סוואנה'], 'מי נוהג בסוואנה?'],
        removeFromVehicle: 'הוצאה מהרכב',
        cancel: 'ביטול',
        occupancy: [[3, 5], '3 מתוך 5'],
        available: 'זמין היום',
        unavailable: 'לא זמין היום',
        driverNone: 'בלי נהג',
        notWorking: [['אחמד'], 'אחמד משובץ ברכב אבל אין לו אתר ברישום היום'],
        deletedWorker: 'עובד שנמחק',
        notRiding: 'לא בהסעה שלנו',
        notRidingCount: [[2], 'לא בהסעה שלנו (2)'],
        notRidingTitle: 'מי לא נוסע בהסעה שלנו?',
        statusLabel: [['אחמד'], 'איך אחמד מגיע'],
        statusPrivate: 'רכב פרטי',
        statusContractor: 'נוסע עם קבלן אחר',
        statusOther: 'אחר',
        bringBack: 'החזרה להסעה',
        vehiclesRow: 'רכבים',
        seats: [[5], '5 מושבים'],
        noVehicles: 'אין רכבים ברשימה.',
        editVehicle: 'עריכת הרכב',
        addVehicle: 'הוספת רכב',
        renameVehicle: 'שינוי שם',
        changeSeats: 'שינוי מושבים',
        retireVehicle: 'הוצאה מהרשימה',
        vehicleNameTitle: 'שם הרכב',
        nameNeeded: 'צריך לכתוב שם',
        vehicleNameTaken: 'כבר יש רכב בשם הזה',
        seatsTitle: [['סוואנה'], 'כמה מושבים יש בסוואנה? כולל הנהג.'],
        seatsBad: 'מספר בין 2 ל-20',
        retireTitle: [['סוואנה'], 'להוציא את סוואנה מהרשימה?'],
        retireLead: 'הרכב לא יופיע עוד בשיבוץ.',
        save: 'שמירה',
        openWhatsapp: 'פתיחה בוואטסאפ',
        opened: 'נפתח בוואטסאפ',
        noPhone: 'אין מספר טלפון תקין',
        mHello: [['אחמד'], 'שלום אחמד,'],
        mHeading: [['יום שלישי', '10/11/2026'], 'הסעה ליום שלישי 10/11/2026:'],
        mVehicle: [['סוואנה'], 'רכב: סוואנה'],
        mPassengers: [[2], 'נוסעים (2):'],
        mPassenger: [['ראמי', 'חדרה'], '- ראמי – חדרה'],
        mPassengerOnly: [['ראמי'], '- ראמי'],
        mAlone: 'בלי נוסעים.',
        mDestinations: [['חיפה, חדרה'], 'יעדים: חיפה, חדרה'],
        // v179: the summary of the day - the button, the dialog, the picture's file, and
        // the lines the summary does not borrow from the driver's message.
        summaryButton: 'סיכום הסעות ליום',
        summaryTitle: 'סיכום הסעות',
        summaryLabel: 'תצוגה מקדימה של הסיכום',
        summarySend: 'שליחה בוואטסאפ',
        summaryCopy: 'העתקה',
        summaryPicture: 'שיתוף כתמונה',
        summaryClose: 'סגירה',
        summaryFile: [['2026-11-10'], 'farkad-הסעות-2026-11-10.png'],
        sHeading: [['יום שלישי', '10/11/2026'], 'סיכום הסעות ליום שלישי 10/11/2026:'],
        sVehicle: [['סוואנה', 3, 5], 'רכב: סוואנה – 3 מתוך 5'],
        sDriver: [['אחמד', 'חדרה'], 'נהג: אחמד – חדרה'],
        sNoneSeated: 'אף עובד לא שובץ לרכב.',
        sWaiting: [[2], 'ממתינים לשיבוץ (2):'],
        sEmpty: [['סוואנה, קורולה'], 'רכבים ריקים: סוואנה, קורולה'],
        sHome: [['סוואנה, קורולה'], 'רכבים שלא זמינים היום: סוואנה, קורולה']
    };
    same('the block holds exactly these words', Object.keys(T).sort(), Object.keys(W).sort());
    Object.keys(W).forEach(key => {
        const want = W[key];
        if (Array.isArray(want)) same(`${key}(${want[0].join(', ')})`, typeof T[key] === 'function' ? T[key](...want[0]) : T[key], want[1]);
        else same(key, T[key], want);
    });
    check('«ממתין» is nowhere in the words', !Object.keys(T).some(key =>
        String(typeof T[key] === 'function' ? T[key]('x', 'y', 'z') : T[key]).includes('ממתין')));
    // What the owner was shown on v171 and sent back must not come back by a side door.
    const all = Object.keys(T).map(key => String(typeof T[key] === 'function' ? T[key]('x', 'y', 'z') : T[key])).join('\n');
    same('and nothing of the planner he sent back is in them',
        ['הצעת שיבוץ', 'אישור התוכנית', 'גרסה', 'נעיל', 'אזור', 'רשאי לנהוג', 'סימנתי שנשלח', 'טיוטה'].filter(word => all.includes(word)), []);
    // No Hebrew outside the block: a word typed straight into the screen's code is a word
    // this suite does not pin. (The seven vehicle names are the owner's data, pinned above.)
    const code = SCREEN.slice(SCREEN.indexOf('// ================================================================== the store'))
        .split('\n').filter(line => !/^\s*\/\//.test(line)).join('\n')
        .replace(/\/\/.*$/gm, '').replace(/const TRANSPORT_SEED[\s\S]*?\]\);/, '');
    same('and no Hebrew is written anywhere else in the screen\'s code', code.match(/[֐-׿]+/g) || [], []);
});

report();
