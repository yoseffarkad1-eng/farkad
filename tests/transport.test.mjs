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
//     the journal, the write fence, a backup, a restore point or the rescue file, and
//     never the RECORD's document in the cloud. MOVED with the shared plan
//     (js/ui/transport-share.js): this used to end "or the cloud". The cloud is now
//     reached ONLY under the transport paths, ONLY where that file's gate is open and
//     ONLY on a phone whose switch is on - and in this build the gate is shut, so here
//     the transport cloud is counted too and the count is nought. What the open gate
//     does is tests/transport.share.test.mjs. A record of it that will not read is
//     copied aside and cannot block the day, and old days are pruned;
//   a vehicle turned OFF (the lasting switch) is not one of the day's vehicles from the day
//     it is off from: the list is written and NO day is - the men its stored plans seat are
//     waiting by a reading, and are in their seats again, byte for byte, when it is turned
//     on; a day changed in between has let go of it; a day before it is history; and v180,
//     run on its own bytes out of Git, does not know the field and drops it at its next
//     write of the list;
//   and with the switch off there is no entry, and no transport key but the switch is read.
//
// The screen itself - the drawing, the drags, the taps, the rectangles - is
// tests/transport.browser.mjs.

import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { makeDevice, makeCloud, settle, settleUntil } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const read = path => {
    const file = new URL(path, import.meta.url);
    return existsSync(file) ? readFileSync(file, 'utf8') : '';
};
const SEDER = read('../js/ui/seder.js');
const ENGINE = read('../js/model/transport.js');
const SCREEN = read('../js/ui/transport.js');
// Loaded after the screen, as index.html loads it: every block below runs with the share
// file PRESENT and its gate as shipped (shut), so what they pin is this build.
const SHARE = read('../js/ui/transport-share.js');
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
    vm.runInContext(SHARE, device.ctx, { filename: 'js/ui/transport-share.js' });
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

// The report of a period. The owner asked for "a report for the cars"; v179 gave him one
// day. This is the week and the month - counted from the plans THIS phone kept, with every
// day it has no plan for said as such. The dialog, the range buttons, the ways out and the
// picture are tests/transport.browser.mjs.
await block('the report of a period: each vehicle, each driver, and every day this phone has no plan for', async () => {
    const device = crewPhone('d_report');
    const text = (key, today = DAY) => device.call('transportReportText', key, today);
    const lines = (key, today = DAY) => text(key, today).split('\n');
    const range = (key, today = DAY) => { const r = device.call('transportReportRange', key, today); return r ? `${r.from}..${r.to}` : null; };
    const dayKey = date => `farkadTransport:day:${date}`;

    // --- the four ranges. DAY is Tuesday 2026-11-10; the week is the app's own, Friday
    // through Thursday.
    same('this week is the Friday before through the Thursday after', range('thisWeek'), '2026-11-06..2026-11-12');
    same('last week is the seven days before it', range('lastWeek'), '2026-10-30..2026-11-05');
    same('this month is the calendar month', range('thisMonth'), '2026-11-01..2026-11-30');
    same('last month is the one before', range('lastMonth'), '2026-10-01..2026-10-31');
    same('on a Friday the week starts that day, and on a Thursday it ends that day',
        [range('thisWeek', '2026-11-06'), range('thisWeek', '2026-11-12'), range('thisWeek', '2026-11-13')],
        ['2026-11-06..2026-11-12', '2026-11-06..2026-11-12', '2026-11-13..2026-11-19']);
    same('in January last month is December of the year before; in March it is the whole of February',
        [range('lastMonth', '2027-01-03'), range('lastMonth', '2027-03-31'), range('thisMonth', '2028-02-10')],
        ['2026-12-01..2026-12-31', '2027-02-01..2027-02-28', '2028-02-01..2028-02-29']);
    same('a range nobody offers, or a day that is not one, is no range', [range('year'), range('thisWeek', '2026-13-40'),
        text('year'), text('thisWeek', 'tomorrow')], [null, null, '', '']);

    // --- nothing kept yet
    same('with no plan on the phone it says so for every day, and names no vehicle at all', lines('thisWeek'),
        ['דוח הסעות – השבוע, 06/11/2026 עד 12/11/2026:', '',
            'ימים עם שיבוץ שמור במכשיר הזה: 0 מתוך 7', 'ב-7 ימים אין שיבוץ שמור במכשיר הזה.']);

    // --- a week of plans. The crew works on four more days; then:
    //   Fri 06  a vehicle kept home and nobody seated          -> NOT a plan
    //   Sat 07  nothing                                         -> no plan
    //   Sun 08  קורולה 2013: אחמד drives מוחמד; BYD: סמיר alone
    //   Mon 09  קורולה 2013: סמיר drives אחמד and יוסי         (a driver in a second vehicle)
    //   Tue 10  קורולה 2013: אחמד alone; פולקסווגן: Ali Hassan and nobody at the wheel; BYD kept home
    //   Wed 11  the bytes v171 wrote                           (אחמד drives two; BYD kept home)
    //   Thu 12  bytes that will not read
    ['2026-11-06', '2026-11-08', '2026-11-09', '2026-11-11'].forEach(date => {
        ['w_01', 'w_02', 'w_03', 'w_04', 'w_06'].forEach(id => device.State.commit(device.call('assignPlace',
            device.State.schedule, date, id, 'actual', 'p_01')));
    });
    device.call('transportSetAvailable', '2026-11-06', 'tv_02', false);
    device.call('transportPlace', '2026-11-08', 'w_01', 'tv_01', 1);
    device.call('transportPlace', '2026-11-08', 'w_02', 'tv_01', 2);
    device.call('transportPlace', '2026-11-08', 'w_04', 'tv_03', 1);
    device.call('transportPlace', '2026-11-09', 'w_04', 'tv_01', 1);
    device.call('transportPlace', '2026-11-09', 'w_01', 'tv_01', 4);
    device.call('transportPlace', '2026-11-09', 'w_03', 'tv_01', 2);
    device.call('transportPlace', DAY, 'w_01', 'tv_01', 1);
    device.call('transportPlace', DAY, 'w_06', 'tv_05', 2);
    device.call('transportSetAvailable', DAY, 'tv_03', false);
    const BROKEN = '{"version":1,"trips":{"tv_01":{"driver":"w_0';
    device.putRaw(dayKey('2026-11-11'), V171_DAY);
    device.putRaw(dayKey('2026-11-12'), BROKEN);
    // A month ago, inside the five weeks the store keeps: one car, one driver.
    device.putRaw(dayKey('2026-10-20'), JSON.stringify({ version: 1, trips: { tv_05: { driver: 'w_02', passengers: ['w_03'], seats: { w_03: 9 } } } }));
    given('the days are on the disk as staged', device.raw(dayKey('2026-11-06')) !== null && device.raw(dayKey('2026-11-07')) === null
        && device.raw(dayKey('2026-11-09')) !== null && device.raw(dayKey('2026-11-11')) === V171_DAY);

    const again = reopen(device);
    const disk = JSON.stringify(again.dump());
    const fence = again.Store.fenceState();
    const queued = JSON.stringify(again.Sync.pendingPaths());
    const schedule = JSON.stringify(again.State.schedule);
    const held = Object.keys(again.global('transportDays')).sort().join();
    const week = again.call('transportReportText', 'thisWeek', DAY).split('\n');
    same('THE WEEK, line for line: the days counted, each vehicle that went out - its days, its drivers and how often each, its seats - the ones that did not, then each driver and his vehicles',
        week, ['דוח הסעות – השבוע, 06/11/2026 עד 12/11/2026:', '',
            'ימים עם שיבוץ שמור במכשיר הזה: 4 מתוך 7',
            'ב-2 ימים אין שיבוץ שמור במכשיר הזה.',
            'שיבוץ של יום אחד שמור במכשיר ולא נקרא, ולא נספר.', '',
            `רכב: ${car('טויוטה קורולה 2013')} – יצא ב-4 ימים`,
            `נהג: ${named('אחמד')} – 3 ימים`,
            `נהג: ${named('סמיר')} – יום אחד`,
            'מושבים תפוסים: 9 בסך הכול, 2.3 בממוצע ליום', '',
            `רכב: ${car('BYD סיל U 2025')} – יצא ביום אחד`,
            `נהג: ${named('סמיר')} – יום אחד`,
            'מושבים תפוסים: 1 בסך הכול, 1 בממוצע ליום', '',
            `רכב: ${car('פולקסווגן 2018')} – יצא ביום אחד`,
            'בלי נהג – יום אחד',
            'מושבים תפוסים: 1 בסך הכול, 1 בממוצע ליום', '',
            `רכבים בלי עובדים בימים עם שיבוץ: ${car('טויוטה קורולה 2016')}, ${car('BYD אטו 3 2025')}, ${car('סוואנה 2010')}, ${car('ליפמוטור C10 2026')}`, '',
            'נהגים בתקופה:',
            `- ${named('אחמד')} – 3 ימים: ${car('טויוטה קורולה 2013')} (3)`,
            `- ${named('סמיר')} – 2 ימים: ${car('טויוטה קורולה 2013')} (1), ${car('BYD סיל U 2025')} (1)`]);
    check('a vehicle is always named after a Hebrew word and held right-to-left: no line begins with its name',
        week.every(line => !line.startsWith(RLI) && !/^[A-Za-z]/.test(line))
        && week.join('\n').includes(`${RLI}BYD`) && !week.join('\n').includes(`${FSI}BYD`));

    // The counting itself, with no word in it.
    const days = again.call('transportReportDays', '2026-11-06', '2026-11-12');
    same('each day of the range is one of three things: a plan, no plan, or bytes that will not read',
        plain(days).map(one => `${one.date.slice(8)}:${one.state}`),
        ['06:none', '07:none', '08:plan', '09:plan', '10:plan', '11:plan', '12:unreadable']);
    const count = plain(again.call('transportReportCount', days));
    same('the days add up to the range', [count.total, count.planned, count.missing, count.unreadable], [7, 4, 2, 1]);
    same('per vehicle: days out, seats filled, days with nobody at the wheel - a vehicle that never went out has zeros, in the order of the list',
        count.vehicles.map(v => `${v.id}:${v.days}:${v.seats}:${v.noDriver}`),
        ['tv_01:4:9:0', 'tv_02:0:0:0', 'tv_03:1:1:0', 'tv_04:0:0:0', 'tv_05:1:1:1', 'tv_06:0:0:0', 'tv_07:0:0:0']);
    same('who drove each, most days first', count.vehicles.filter(v => v.days > 0).map(v => v.drivers.map(d => `${d.id}x${d.days}`).join('+')),
        ['w_01x3+w_04x1', 'w_04x1', '']);
    same('per driver: his days, and each vehicle with its days - a driver across two vehicles is one driver',
        count.drivers.map(d => `${d.id}:${d.days}:${d.vehicles.map(v => `${v.id}x${v.days}`).join('+')}`),
        ['w_01:3:tv_01x3', 'w_04:2:tv_01x1+tv_03x1']);
    check('a vehicle kept home that day is not counted as out, even with a man its old plan left in it (v171, the 11th)',
        count.vehicles[2].days === 1);
    check('a seat count is the men DRAWN in the car: v171\'s day is its driver and two men',
        plain(Core.layout(plain(days[5].ctx), plain(days[5].day))).cars.tv_01.filter(Boolean).length === 3);

    // A DAY WITH NO PLAN IS NEVER "THE VEHICLE STAYED HOME".
    check('the Friday on which a vehicle was kept home and nobody seated is a day with no plan, not a day nothing went out',
        days[0].state === 'none' && again.raw(dayKey('2026-11-06')) !== null);
    check('nothing in the report calls a vehicle unavailable, at home or not going out',
        !/לא זמין|נשאר|בבית|לא יצא/.test(week.join('\n')));
    check('and the vehicles named as carrying nobody are named only for «ימים עם שיבוץ»',
        week.filter(line => line.includes('סוואנה')).every(line => line.startsWith('רכבים בלי עובדים בימים עם שיבוץ: ')));

    // --- the month, and the month before it against the store's horizon.
    same('this month: the same four days out of thirty, twenty-five with no plan, and nothing said about deletion - it is all inside the five weeks',
        again.call('transportReportText', 'thisMonth', DAY).split('\n').slice(0, 5),
        ['דוח הסעות – החודש, 01/11/2026 עד 30/11/2026:', '',
            'ימים עם שיבוץ שמור במכשיר הזה: 4 מתוך 30', 'ב-25 ימים אין שיבוץ שמור במכשיר הזה.',
            'שיבוץ של יום אחד שמור במכשיר ולא נקרא, ולא נספר.']);
    same('LAST MONTH ON THE 10TH CANNOT BE WHOLE, AND SAYS WHY: the store keeps 35 days, so the first five days of October are gone - counted, dated, explained',
        again.call('transportReportText', 'lastMonth', DAY).split('\n'),
        ['דוח הסעות – חודש שעבר, 01/10/2026 עד 31/10/2026:', '',
            'ימים עם שיבוץ שמור במכשיר הזה: 1 מתוך 31',
            'ב-30 ימים אין שיבוץ שמור במכשיר הזה.',
            'מתוכם 5 ימים לפני 06/10/2026: שיבוצים ישנים מ-35 ימים נמחקים מהמכשיר הזה.', '',
            `רכב: ${car('פולקסווגן 2018')} – יצא ביום אחד`,
            `נהג: ${named('מוחמד')} – יום אחד`,
            'מושבים תפוסים: 2 בסך הכול, 2 בממוצע ליום', '',
            `רכבים בלי עובדים בימים עם שיבוץ: ${car('טויוטה קורולה 2013')}, ${car('טויוטה קורולה 2016')}, ${car('BYD סיל U 2025')}, ${car('BYD אטו 3 2025')}, ${car('סוואנה 2010')}, ${car('ליפמוטור C10 2026')}`, '',
            'נהגים בתקופה:',
            `- ${named('מוחמד')} – יום אחד: ${car('פולקסווגן 2018')} (1)`]);
    const pruned = today => again.call('transportReportText', 'lastMonth', today).split('\n').filter(line => line.startsWith('מתוכם'));
    same('the date in that line is the horizon the store itself prunes at', again.call('addDays', DAY, -again.global('TRANSPORT_KEEP_DAYS')), '2026-10-06');
    same('on the 5th the whole of October is still inside the five weeks and nothing is said; on the 6th one day is gone; at the end of the month, every day before the 26th that is not on the disk (the 20th still is - it is read, not presumed gone)',
        [pruned('2026-11-05'), pruned('2026-11-06'), pruned('2026-11-30')],
        [[], ['מתוכם יום אחד לפני 02/10/2026: שיבוצים ישנים מ-35 ימים נמחקים מהמכשיר הזה.'],
            ['מתוכם 24 ימים לפני 26/10/2026: שיבוצים ישנים מ-35 ימים נמחקים מהמכשיר הזה.']]);
    check('this week, last week and this month are never past the horizon, on any day of a year',
        (() => {
            for (let date = '2026-11-01'; date < '2027-11-01'; date = again.call('addDays', date, 1)) {
                if (['thisWeek', 'lastWeek', 'thisMonth'].some(key => again.call('transportReportRange', key, date).from
                    < again.call('addDays', date, -35))) return false;
            }
            return true;
        })());

    // --- IT IS A READING. Four ranges, twice, the counting and the days: nothing moved.
    ['thisWeek', 'lastWeek', 'thisMonth', 'lastMonth', 'thisWeek', 'lastMonth'].forEach(key => again.call('transportReportText', key, DAY));
    same('composing it wrote nothing: every key on the disk is byte for byte what it was', JSON.stringify(again.dump()), disk);
    check('the day that would not read is where it was, and NO copy of it was put aside - a copy is a write',
        again.raw(dayKey('2026-11-12')) === BROKEN && again.raw(`${dayKey('2026-11-12')}:unreadable`) === null);
    same('the day v171 wrote is byte for byte what v171 wrote', again.raw(dayKey('2026-11-11')), V171_DAY);
    same('the write counter did not move', again.Store.fenceState(), fence);
    same('nothing was queued for the cloud', JSON.stringify(again.Sync.pendingPaths()), queued);
    same('the schedule in memory is what it was', JSON.stringify(again.State.schedule), schedule);
    same('and no day was loaded into the session by being counted', Object.keys(again.global('transportDays')).sort().join(), held);
    check('reading it did not tell the screen that something is unreadable either', again.call('transportSawUnreadable') === false);
    check('nothing in it says «נשלח»', !/נשלח|sent/i.test(week.join('\n')));

    // PURE: the same input, the same blocks; and the input is not changed.
    const spec = plain({ label: 'השבוע', from: '2026-11-06', to: '2026-11-12', days, cutoff: '2026-10-06', keep: 35 });
    const before = JSON.stringify(spec);
    const once = JSON.stringify(again.call('transportReportBlocks', spec));
    same('the builder is pure: two readings are the same bytes', JSON.stringify(again.call('transportReportBlocks', spec)), once);
    check('and it does not change what it was handed', JSON.stringify(spec) === before);
    same('the text is the blocks, a blank line between them', JSON.parse(once).map(block => block.join('\n')).join('\n\n'), week.join('\n'));

    // A change the disk refused is in the session and on the screen - and so in the report.
    again.setQuota(key => /^farkadTransport:/.test(key));
    again.call('transportPlace', DAY, 'w_04', 'tv_02', 1);
    given('the disk refused that change', again.call('transportWasKept') === false);
    check('a change this session holds and the disk refused is counted as the screen shows it',
        again.call('transportReportText', 'thisWeek', DAY).includes(`רכב: ${car('טויוטה קורולה 2016')} – יצא ביום אחד`));

    // --- a day with a plan on which no vehicle carries anybody: the only man seated sits
    // in a vehicle that is kept home.
    const idle = crewPhone('d_report_idle');
    idle.putRaw(DAY_KEY, JSON.stringify({ version: 1, unavailable: { tv_01: true }, trips: { tv_01: { driver: 'w_01', passengers: [], seats: {} } } }));
    same('a plan in which nobody is drawn in any vehicle says so, once, and lists no vehicle', reopen(idle).call('transportReportText', 'thisWeek', DAY).split('\n'),
        ['דוח הסעות – השבוע, 06/11/2026 עד 12/11/2026:', '',
            'ימים עם שיבוץ שמור במכשיר הזה: 1 מתוך 7', 'ב-6 ימים אין שיבוץ שמור במכשיר הזה.', '',
            'בימים עם שיבוץ אף רכב לא יצא עם עובדים.']);

    // --- a driver who has left the roster is still a driver, under the name the screen gives him.
    const gone = crewPhone('d_report_gone');
    gone.putRaw(DAY_KEY, JSON.stringify({ version: 1, trips: { tv_01: { driver: 'w_99', passengers: ['w_01'], seats: { w_01: 2 } } } }));
    check('a driver no longer on the roster is counted, as «עובד שנמחק»',
        reopen(gone).call('transportReportText', 'thisWeek', DAY).split('\n').includes(`נהג: ${named('עובד שנמחק')} – יום אחד`));

    // --- with the switch off there is no report, and nothing is read to find that out.
    const reads = [];
    const off = bare('d_report_off');
    const get = off.Store.get.bind(off.Store);
    off.Store.get = key => { reads.push(String(key)); return get(key); };
    load(off);
    same('with the switch off there is no report, no days and no dialog',
        [off.call('transportReportText', 'thisWeek', DAY), plain(off.call('transportReportDays', '2026-11-06', '2026-11-12')), off.call('openTransportReport')],
        ['', [], false]);
    same('and the only transport key read is the switch', [...new Set(reads.filter(key => /transport/i.test(key)))], [ENABLED]);

    // --- the code that counts, composes, shows, sends and copies it calls nothing that
    // writes, loads or prunes; the one function that touches the store only reads it.
    const section = (from, to) => SCREEN.slice(SCREEN.indexOf(from), SCREEN.indexOf(to))
        .split('\n').filter(line => !/^\s*\/\//.test(line)).join('\n');
    const code = section('== the report of a period', '== the summary\'s dialog');
    given('the report\'s section was found in the screen\'s file', /function transportReportCount/.test(code)
        && /function transportReportBlocks/.test(code) && /function openTransportReport/.test(code) && /function transportReportPick/.test(code));
    same('nothing in it writes, marks, loads, prunes, commits or touches the store',
        code.match(/transportKeep|transportSaveDay|transportSaveSettings|transportWrite|transportMarkOpened|transportRedrawn|transportDayOf|transportLoad|transportPrune|transportPlace|transportUnseat|transportSet\w+|Store\.|localStorage|State\.(commit|commitMany|save|persist)|FarkadSync|window\.print/g) || [], []);
    check('the text goes out by the day message\'s own two doors, and the picture by the printout\'s',
        /shareTextOut\(/.test(code) && /copyTextOut\(/.test(code) && /sharePrintout\('transport'\)/.test(code)
        && !/navigator\.share|wa\.me|clipboard|execCommand|window\.open/.test(code));
    const peek = section('function transportPeekDay', 'function transportSaveDay');
    given('the function that looks at a day was found', /Store\.get\(TRANSPORT_DAY_PREFIX \+ date\)/.test(peek));
    same('the one function that looks at a day asks the store to READ and nothing else',
        peek.match(/Store\.\w+|transportLoad|transportWrite|transportDays\[date\]\s*=|transportUnreadableSeen\s*=|transportHeld\[/g) || [], ['Store.get']);
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

// MOVED (the shared plan). Was: 'none of it leaves the phone: no cloud, no backup, no
// restore point, no rescue file'. The four things it says about the RECORD's cloud are
// unchanged and still measured; added: with the gate as shipped, the transport documents
// are not reached either, though the adapter hands the share file a way to them.
await block('none of it is in the record\'s cloud, a backup, a restore point or the rescue file - and, the gate shut, none of it leaves the phone', async () => {
    const cloud = makeCloud();
    const device = crewPhone('d_cloud');
    device.Sync.connect(cloud.adapter);
    same('the share file is there, and its gate is shut', device.global('TransportShare').on(), false);
    device.global('TransportShare').connect(cloud.transport.adapter);
    const synced = await settleUntil(() => device.Sync.status === 'synced' && device.Sync.pendingCount() === 0, 5000);
    given('the phone is connected and has sent its record', synced, device.Sync.status);
    const attempts = cloud.attempts.length;
    const doc = JSON.stringify(cloud.doc);

    evening(device);
    device.call('transportAddVehicle', 'מיניבוס', 12);
    device.call('transportMarkOpened', DAY, 'tv_01');
    given('the plan is on this phone', device.raw(DAY_KEY) !== null && device.raw(SETTINGS) !== null);
    await settle(TICK * 20);
    same('the record\'s cloud was not written to', cloud.attempts.length, attempts);
    same('and holds the document it held', JSON.stringify(cloud.doc), doc);
    same('the transport documents were not asked for, read or written', cloud.transport.attempts.length, 0);
    same('and the phone holds no key of a shared plan',
        Object.keys(device.dump()).filter(key => /:shared:|:aside:/.test(key)), []);
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
// ================================================================== a vehicle turned off
//
// The owner, 2026-11-10: "sometimes cars break down, or I don't want them to show in the
// list. Like I have workers whom I turn off from the list and turn back on in the צוות
// page - because sometimes the car sits for more than a day." The lasting switch: one
// field on the vehicle (`off`, the day it is off from) in this phone's own list.
const PREV = '2026-11-09';
const NEXT = '2026-11-11';
const dayKeyOf = date => `farkadTransport:day:${date}`;
const carOn = (device, date, vehicleId) => {
    const seats = Core.layout(plain(device.call('transportContext', date)), plain(device.call('transportDayOf', date))).cars[vehicleId];
    return seats ? seats.slice(1).map(id => id || '-').join(' ') : null;
};
const waitingOn = (device, date) => plain(Core.waiting(plain(device.call('transportContext', date)),
    plain(device.call('transportDayOf', date)))).join(' ');
const threeDays = device => [PREV, DAY, NEXT].map(date => device.raw(dayKeyOf(date)));

// Three days of plans with קורולה 2016 (tv_02) in each:
//   Mon 09  tv_02: אחמד drives מוחמד
//   Tue 10  tv_02: אחמד drives, מוחמד behind him (seat 4) - and its message opened;
//           tv_01: סמיר alone
//   Wed 11  tv_02: יוסי drives, סמיר on seat 3
function threeDayPhone(id) {
    const device = crewPhone(id);
    [PREV, NEXT].forEach(date => ['w_01', 'w_02', 'w_03', 'w_04', 'w_06'].forEach(worker =>
        device.State.commit(device.call('assignPlace', device.State.schedule, date, worker, 'actual', 'p_01'))));
    device.call('transportPlace', PREV, 'w_01', 'tv_02', 1);
    device.call('transportPlace', PREV, 'w_02', 'tv_02', 2);
    device.call('transportPlace', DAY, 'w_01', 'tv_02', 1);
    device.call('transportPlace', DAY, 'w_02', 'tv_02', 4);
    device.call('transportPlace', DAY, 'w_04', 'tv_01', 1);
    device.call('transportMarkOpened', DAY, 'tv_02');
    device.call('transportPlace', NEXT, 'w_03', 'tv_02', 1);
    device.call('transportPlace', NEXT, 'w_04', 'tv_02', 3);
    return device;
}

await block('a vehicle turned off: gone from its day on, the list written and no day rewritten - and back, byte for byte', async () => {
    const device = threeDayPhone('d_vehicle_off');
    const days = threeDays(device);
    const schedule = JSON.stringify(device.State.schedule);
    const record = device.raw('scheduleData:v2');
    const queued = JSON.stringify(device.Sync.pendingPaths());
    const fence = device.Store.fenceState();
    given('the three days are on the disk, each with men in that car, and the list has never been written',
        days.every(raw => raw !== null && /"tv_02"/.test(raw)) && device.raw(SETTINGS) === null);
    given('as staged: the car on each day, and its message on the day on the screen marked opened',
        [carOn(device, PREV, 'tv_02'), carOn(device, DAY, 'tv_02'), carOn(device, NEXT, 'tv_02'),
            device.call('transportMarkState', DAY, 'tv_02')].join(' | ')
        === 'w_01 w_02 - - - | w_01 - - w_02 - | w_03 - w_04 - - | opened');
    const message = device.call('transportDriverMessage', DAY, 'tv_02');

    same('refused, with nothing changed: a vehicle that is not on the list, a day that is not one, turning on what is on, a retired vehicle',
        [device.call('transportSetVehicleOff', 'tv_99', DAY), device.call('transportSetVehicleOff', 'tv_02', 'tomorrow'),
            device.call('transportSetVehicleOff', 'tv_02', true), device.call('transportSetVehicleOff', 'tv_02', null),
            (device.call('transportSettings').vehicles[6].active = false, device.call('transportSetVehicleOff', 'tv_07', DAY)),
            device.raw(SETTINGS)],
        [false, false, false, false, false, null]);
    device.call('transportSettings').vehicles[6].active = true;
    same('what he is told: how many men are drawn in it on the day on the screen', device.call('transportSeatedIn', DAY, 'tv_02'), 2);

    check('turned off from the day on the screen', device.call('transportSetVehicleOff', 'tv_02', DAY) === true);
    const list = JSON.parse(device.raw(SETTINGS));
    same('THE LIST IS WRITTEN: that one vehicle carries the day it is off from, and no other vehicle carries the field at all',
        list.vehicles.map(v => `${v.id}:${'off' in v ? v.off : 'on'}`),
        ['tv_01:on', `tv_02:${DAY}`, 'tv_03:on', 'tv_04:on', 'tv_05:on', 'tv_06:on', 'tv_07:on']);
    check('it is still on the list - off, not retired', list.vehicles[1].active === true);
    same('NO DAY IS REWRITTEN: the day on the screen, the day before and tomorrow\'s plan are byte for byte what they were',
        threeDays(device), days);
    same('from that day on it is not one of the day\'s vehicles; the day before, it still is',
        [PREV, DAY, NEXT, '2026-12-25'].map(date => device.call('transportContext', date).vehicles.some(v => v.id === 'tv_02')),
        [true, false, false, false]);
    same('its men are waiting, on the day on the screen and in tomorrow\'s plan - a reading',
        [carOn(device, DAY, 'tv_02'), waitingOn(device, DAY), carOn(device, NEXT, 'tv_02'), waitingOn(device, NEXT)],
        [null, 'w_01 w_02 w_03 w_06', null, 'w_01 w_02 w_03 w_04 w_06']);
    same('the other car of that day is as it was', carOn(device, DAY, 'tv_01'), 'w_04 - - - -');
    same('the day before is history and is drawn as it was stored', carOn(device, PREV, 'tv_02'), 'w_01 w_02 - - -');
    same('there is no driver\'s message for it, no mark, and no man can be put in it',
        [device.call('transportDriverMessage', DAY, 'tv_02'), device.call('transportMarkState', DAY, 'tv_02'),
            device.call('transportMarkOpened', DAY, 'tv_02'), device.call('transportPlace', DAY, 'w_03', 'tv_02', 2)],
        ['', 'nodriver', false, false]);
    check('while the day before still has its message', device.call('transportDriverMessage', PREV, 'tv_02') !== '');
    same('turned off again from another day is refused: it keeps the day it has been off from',
        [device.call('transportSetVehicleOff', 'tv_02', PREV), device.call('transportSettings').vehicles[1].off], [false, DAY]);

    // THE SUMMARY OF THE DAY. An off vehicle is not today's choice, so it is not in
    // «רכבים שלא זמינים היום» - and it is in no other line either: the summary is sent to
    // people about one morning, and a car that has stood for a week is not that morning's
    // news. Its men are in it, where they are: waiting.
    const summary = device.call('transportSummaryText', DAY).split('\n');
    check('the summary of the day does not name it anywhere - not as a car, not as empty, not as kept home',
        !summary.some(line => line.includes('קורולה 2016')));
    same('and says its men are waiting', summary.slice(summary.indexOf('ממתינים לשיבוץ (4):')).slice(0, 5),
        ['ממתינים לשיבוץ (4):', `- ${named('אחמד')} – ${named('הרצליה')}`, `- ${named('מוחמד')} – ${named('הרצליה')}`,
            `- ${named('יוסי')} – ${named('חיפה')}`, `- ${named('Ali Hassan')} – ${named('פרדסיה')}`]);
    check('the day before, its summary still has the car', device.call('transportSummaryText', PREV)
        .includes(`רכב: ${car('טויוטה קורולה 2016')} – 2 מתוך 5`));

    // THE REPORT OF A PERIOD: the day before it was turned off counts as it was stored;
    // the two days from then on, whose stored plans still seat men in it, do not.
    const week = device.call('transportReportText', 'thisWeek', DAY).split('\n');
    same('the report counts it on the day before it was turned off, and on no day since',
        week.slice(week.indexOf(`רכב: ${car('טויוטה קורולה 2016')} – יצא ביום אחד`)).slice(0, 3),
        [`רכב: ${car('טויוטה קורולה 2016')} – יצא ביום אחד`, `נהג: ${named('אחמד')} – יום אחד`, 'מושבים תפוסים: 2 בסך הכול, 2 בממוצע ליום']);
    same('the days with a plan are still the days somebody is DRAWN in a car: tomorrow, where only that car was filled, is not one',
        week[2], 'ימים עם שיבוץ שמור במכשיר הזה: 3 מתוך 7');

    same('and all of that reading moved no day', threeDays(device), days);

    same('and the schedule in memory is byte for byte what it was', JSON.stringify(device.State.schedule), schedule);

    // The app closed and opened: off is kept.
    const again = reopen(device);
    const reopened = JSON.stringify(again.State.schedule);
    same('it is still off after the app is closed and opened, from the same day',
        [again.call('transportSettings').vehicles[1].off, carOn(again, DAY, 'tv_02'), carOn(again, PREV, 'tv_02')],
        [DAY, null, 'w_01 w_02 - - -']);
    again.call('transportPrune', DAY);
    again.call('transportSummaryText', NEXT);
    same('and opening those days there rewrote none of them', threeDays(again), days);

    // ON AGAIN. Nobody changed a day in between, so every man is where he sat.
    check('turned on again', again.call('transportSetVehicleOff', 'tv_02', null) === true);
    check('the field is gone from the list, not set to something', !/"off"/.test(again.raw(SETTINGS))
        && JSON.parse(again.raw(SETTINGS)).vehicles.length === 7);
    same('THE ROUND TRIP: the three days are byte for byte what they were before it was ever turned off', threeDays(again), days);
    same('and each man is in his seat again, on the day on the screen and in tomorrow\'s plan',
        [carOn(again, DAY, 'tv_02'), waitingOn(again, DAY), carOn(again, NEXT, 'tv_02'), waitingOn(again, NEXT)],
        ['w_01 - - w_02 -', 'w_03 w_06', 'w_03 - w_04 - -', 'w_01 w_02 w_06']);
    same('the driver\'s message is the one it was, and the mark made on it is believed again',
        [again.call('transportDriverMessage', DAY, 'tv_02'), again.call('transportMarkState', DAY, 'tv_02')], [message, 'opened']);
    const weekAfter = again.call('transportReportText', 'thisWeek', DAY).split('\n');
    check('and the report counts it on all three days again', weekAfter.includes(`רכב: ${car('טויוטה קורולה 2016')} – יצא ב-3 ימים`));

    // None of it is the record.
    same('the schedule in memory is byte for byte what it was when the app was opened', JSON.stringify(again.State.schedule), reopened);
    same('the record on the disk is what it was before any of this', again.raw('scheduleData:v2'), record);
    same('nothing was queued for the cloud', JSON.stringify(again.Sync.pendingPaths()), queued);
    same('the write counter did not move', again.Store.fenceState(), fence);
    same('every key it wrote is under its own name', Object.keys(again.dump()).filter(key => /transport/i.test(key)).sort(),
        [dayKeyOf(PREV), DAY_KEY, dayKeyOf(NEXT), ENABLED, SETTINGS].sort());
});

await block('a day changed while its vehicle was off has let go of it; a day nobody touched has not', async () => {
    const device = threeDayPhone('d_vehicle_off_changed');
    const next = device.raw(dayKeyOf(NEXT));
    device.call('transportSetVehicleOff', 'tv_02', DAY);
    // He gives one of the two waiting men another seat. That is a change to the day, and
    // the day is written as the picture then reads - which has no such car (v174's rule).
    check('a man who was in the off car is seated elsewhere', device.call('transportPlace', DAY, 'w_01', 'tv_01', 2) === true);
    same('THAT day is rewritten by its own change, without the car', plain(keptDay(device).trips),
        { tv_01: { driver: 'w_04', passengers: ['w_01'], seats: { w_01: 2 } } });
    same('tomorrow\'s plan, which nobody changed, is byte for byte what it was', device.raw(dayKeyOf(NEXT)), next);
    device.call('transportSetVehicleOff', 'tv_02', null);
    same('turned on again: on the changed day the car is empty and the man who was given another seat has NOT jumped back; the other waits',
        [carOn(device, DAY, 'tv_02'), carOn(device, DAY, 'tv_01'), waitingOn(device, DAY)],
        ['- - - - -', 'w_04 w_01 - - -', 'w_02 w_03 w_06']);
    same('and the day nobody touched has its men in their seats', carOn(device, NEXT, 'tv_02'), 'w_03 - w_04 - -');

    // «לא זמין היום» is untouched for a vehicle that is on.
    const other = crewPhone('d_vehicle_off_perday');
    other.call('transportSetVehicleOff', 'tv_03', DAY);
    check('the per-day answer still works for a vehicle that is on, and is kept in that day',
        other.call('transportSetAvailable', DAY, 'tv_01', false) === true && keptDay(other).unavailable.tv_01 === true
        && !('tv_03' in keptDay(other).unavailable));
    const told = other.call('transportSummaryText', DAY).split('\n');
    same('the summary\'s «kept home» line is the vehicle kept home TODAY and not the one that is off',
        told.filter(line => line.startsWith('רכבים שלא זמינים היום')), [`רכבים שלא זמינים היום: ${car('טויוטה קורולה 2013')}`]);
    check('the off one is nowhere in it', !told.join('\n').includes('BYD סיל'));
    same('a vehicle can be retired while it is off, and is then on neither list',
        [other.call('transportRetireVehicle', 'tv_03'), other.call('transportSetVehicleOff', 'tv_03', null),
            other.call('transportContext', PREV).vehicles.some(v => v.id === 'tv_03')], [true, false, false]);
});

await block('the field, read: a list without it is all on, a value that is not a day is on, and it leaves the phone by no road', async () => {
    const old = crewPhone('d_vehicle_off_old_list');
    old.putRaw(SETTINGS, V171_SETTINGS);
    const elder = reopen(old);
    check('A LIST WRITTEN BY v171-v180 HAS NO SUCH FIELD AND READS AS ALL ON',
        elder.call('transportSettings').vehicles.every(v => !('off' in v))
        && elder.call('transportContext', DAY).vehicles.map(v => v.id).join() === 'tv_01,tv_03,tv_05');
    same('and reading it rewrote nothing', elder.raw(SETTINGS), V171_SETTINGS);
    check('turning one off keeps what v171 had typed into that list, untouched',
        elder.call('transportSetVehicleOff', 'tv_03', DAY) === true
        && JSON.stringify(JSON.parse(elder.raw(SETTINGS)).areas) === JSON.stringify(JSON.parse(V171_SETTINGS).areas)
        && JSON.stringify(JSON.parse(elder.raw(SETTINGS)).workers) === JSON.stringify(JSON.parse(V171_SETTINGS).workers));

    const odd = crewPhone('d_vehicle_off_odd');
    odd.putRaw(SETTINGS, JSON.stringify({ version: 1, seeded: true, vehicles: [
        { id: 'tv_01', name: 'א', seats: 5, active: true, off: true },
        { id: 'tv_02', name: 'ב', seats: 5, active: true, off: '2026-13-40' },
        { id: 'tv_03', name: 'ג', seats: 5, active: true, off: 20261110 },
        { id: 'tv_04', name: 'ד', seats: 5, active: true, off: '' },
        { id: 'tv_05', name: 'ה', seats: 5, active: true, off: { __proto__: null, constructor: 'x' } },
        { id: 'tv_06', name: 'ו', seats: 5, active: true, off: '2026-11-10' }] }));
    const read6 = reopen(odd);
    same('only a real date is a day a vehicle can be off from: anything else is not believed, and the vehicle is ON, where it is seen',
        read6.call('transportSettings').vehicles.map(v => ('off' in v ? v.off : 'on')), ['on', 'on', 'on', 'on', 'on', '2026-11-10']);
    same('so five go out that day and one does not', read6.call('transportContext', DAY).vehicles.map(v => v.id),
        ['tv_01', 'tv_02', 'tv_03', 'tv_04', 'tv_05']);

    // It leaves the phone by no road: the same four doors the plans are kept from.
    const cloud = makeCloud();
    const device = crewPhone('d_vehicle_off_cloud');
    device.Sync.connect(cloud.adapter);
    const synced = await settleUntil(() => device.Sync.status === 'synced' && device.Sync.pendingCount() === 0, 5000);
    given('the phone is connected and has sent its record', synced, device.Sync.status);
    const attempts = cloud.attempts.length;
    const doc = JSON.stringify(cloud.doc);
    const fence = device.Store.fenceState();
    evening(device);
    device.call('transportSetVehicleOff', 'tv_01', DAY);
    const carries = text => /"off"|farkadTransport|tv_0\d/.test(String(text));
    given('the off vehicle is on this phone\'s list, and the detector sees it there',
        JSON.parse(device.raw(SETTINGS)).vehicles[0].off === DAY && carries(device.raw(SETTINGS)));
    await settle(TICK * 20);
    same('the cloud was not written to, and holds the document it held', [cloud.attempts.length, JSON.stringify(cloud.doc)], [attempts, doc]);
    same('the write counter did not move', device.Store.fenceState(), fence);
    device.call('exportBackup');
    const backup = device.downloads[device.downloads.length - 1];
    given('the backup file was handed over', Boolean(backup && backup.text && /\.json$/.test(backup.name)));
    check('the backup does not carry it', !carries(backup.text));
    device.call('takeDailySnapshot');
    const points = Object.keys(device.dump()).filter(key => key.startsWith('scheduleData:snap:'));
    given('a restore point was taken', points.length >= 1);
    check('no restore point carries it', points.every(key => !carries(device.raw(key))));
    device.call('exportRecoveryData');
    const rescue = device.downloads[device.downloads.length - 1];
    given('the rescue file was handed over', Boolean(rescue && rescue.text && rescue.text.includes('farkad-recovery')));
    check('nor does the rescue file', !carries(rescue.text));
    check('the list\'s key is not one the rescue file or the queue knows',
        device.call('isFarkadSnapshotKey', SETTINGS) === false && device.call('isFarkadRecordKey', SETTINGS) === false);

    const offPhone = bare('d_vehicle_off_switch');
    load(offPhone);
    same('with הסעות off on this phone the switch of a vehicle is refused and counts nobody',
        [offPhone.call('transportSetVehicleOff', 'tv_01', DAY), offPhone.call('transportSeatedIn', DAY, 'tv_01'),
            Object.keys(offPhone.dump()).filter(key => /transport/i.test(key))], [false, 0, []]);
});

// WHAT v180 DOES WITH THE FIELD, MEASURED ON v180'S OWN BYTES OUT OF GIT. v180 is the
// build this one was cut from, and a phone can have a window of it open beside the new
// one. It does not know `off`.
await block('v180, on its own bytes, opening a list with a vehicle turned off: it does not know the field, and drops it at its next write of the list', async () => {
    const V180 = 'd3103d622677726de133526b4411e00aedc14a3b';
    const ROOT = new URL('..', import.meta.url).pathname;
    const git = args => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
    let present = false;
    try { present = git(['cat-file', '-t', V180]).toString().trim() === 'commit'; } catch (error) { present = false; }
    given('the v180 commit is in this repository', present, V180);
    const old = file => git(['show', `${V180}:${file}`]).toString('utf8');
    const stamp = (/const APP_VERSION = '([^']+)'/.exec(old('js/app.js')) || [])[1];
    given('that commit names itself v180', stamp === 'v180', String(stamp));
    const OLD = { seder: old('js/ui/seder.js'), engine: old('js/model/transport.js'), screen: old('js/ui/transport.js') };
    check('v180 really does not know the field', !/\.off\b/.test(OLD.screen) && !/transportSetVehicleOff/.test(OLD.screen));
    same('and the engine is, byte for byte, the engine v180 had: it was not taught about an off vehicle', ENGINE, OLD.engine);

    const now = threeDayPhone('d_v180_now');
    now.call('transportSetVehicleOff', 'tv_02', DAY);
    const list = now.raw(SETTINGS);
    const days = threeDays(now);
    given('this build wrote a list with the vehicle off', JSON.parse(list).vehicles[1].off === DAY);

    // The same disk, opened by v180.
    const elder = bare('d_v180_now', now.dump());
    vm.runInContext(OLD.seder, elder.ctx, { filename: 'v180/js/ui/seder.js' });
    vm.runInContext(OLD.engine, elder.ctx, { filename: 'v180/js/model/transport.js' });
    vm.runInContext(OLD.screen, elder.ctx, { filename: 'v180/js/ui/transport.js' });
    elder.State.load();
    const seen = elder.call('transportSettings').vehicles;
    same('v180 reads the list whole: seven vehicles, none lost, nothing said to be unreadable',
        [seen.map(v => v.id).join(), elder.call('transportSawUnreadable')], ['tv_01,tv_02,tv_03,tv_04,tv_05,tv_06,tv_07', false]);
    check('IT DOES NOT SEE THE SWITCH: in a v180 window the vehicle is on, and is one of the day\'s vehicles',
        !('off' in seen[1]) && elder.call('transportContext', DAY).vehicles.some(v => v.id === 'tv_02'));
    same('so there its men are drawn in their seats - which they can be, because no day was rewritten',
        carOn(elder, DAY, 'tv_02'), 'w_01 - - w_02 -');
    elder.call('transportSummaryText', DAY);
    elder.call('transportPrune', DAY);
    same('LOOKING, v180 writes nothing: the list on the disk still carries the field', elder.raw(SETTINGS), list);
    check('a change to a DAY on v180 does not touch the list either',
        elder.call('transportPlace', DAY, 'w_03', 'tv_01', 3) === true && elder.raw(SETTINGS) === list);
    check('ITS NEXT WRITE OF THE LIST DROPS THE FIELD: a vehicle renamed on v180',
        elder.call('transportRenameVehicle', 'tv_06', 'סוואנה') === true && !/"off"/.test(elder.raw(SETTINGS)));
    same('and nothing else of the list is lost by it', JSON.parse(elder.raw(SETTINGS)).vehicles.map(v => `${v.id}/${v.seats}/${v.active}`),
        JSON.parse(list).vehicles.map(v => `${v.id}/${v.seats}/${v.active}`));
    same('the two days v180 did not change are byte for byte what they were', [elder.raw(dayKeyOf(PREV)), elder.raw(dayKeyOf(NEXT))], [days[0], days[2]]);

    // Back on this build: the off state has been forgotten, and nothing else.
    const back = reopen(elder);
    same('back on this build after that: the vehicle is on again - forgotten, not broken - and the day v180 wrote reads',
        ['off' in back.call('transportSettings').vehicles[1], carOn(back, DAY, 'tv_02'), carOn(back, DAY, 'tv_01'),
            carOn(back, NEXT, 'tv_02'), back.call('transportSawUnreadable')],
        [false, 'w_01 - - w_02 -', 'w_04 - w_03 - -', 'w_03 - w_04 - -', false]);
});

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
        // A vehicle turned off and on again. The first four are the roster's own words
        // for a worker (js/ui/roster.js) and are compared with that file below; the rest
        // are PROPOSED.
        vehicleOn: 'פעיל',
        vehicleOff: 'כבוי',
        turnOffLabel: [['סוואנה'], 'הסתר זמנית את סוואנה'],
        turnOnLabel: [['סוואנה'], 'הפעל את סוואנה'],
        offVehicles: [[2], 'רכבים כבויים (2)'],
        offFrom: [['10/11/2026'], 'כבוי החל מ-10/11/2026'],
        allOff: 'כל הרכבים כבויים כרגע. אפשר להפעיל אותם בכפתור ליד השם.',
        offToldTitle: [['סוואנה'], 'הרכב כבוי: סוואנה'],
        offReturned: [[3], '3 עובדים שישבו בו חזרו לממתינים.'],
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
        sHome: [['סוואנה, קורולה'], 'רכבים שלא זמינים היום: סוואנה, קורולה'],
        // The report of a period: the button, the dialog and its four ranges (the pay
        // report's own words), the picture's file, and the lines of the report.
        reportButton: 'דוח הסעות לתקופה',
        reportTitle: 'דוח הסעות',
        reportRanges: 'בחירת תקופה',
        reportThisWeek: 'השבוע',
        reportLastWeek: 'שבוע קודם',
        reportThisMonth: 'החודש',
        reportLastMonth: 'חודש שעבר',
        reportLabel: 'תצוגה מקדימה של הדוח',
        reportFile: [['2026-11-06', '2026-11-12'], 'farkad-דוח-הסעות-2026-11-06_2026-11-12.png'],
        rCount: [[3], '3 ימים'],
        rIn: [[3], 'ב-3 ימים'],
        rHeading: [['השבוע', '06/11/2026', '12/11/2026'], 'דוח הסעות – השבוע, 06/11/2026 עד 12/11/2026:'],
        rDays: [[3, 7], 'ימים עם שיבוץ שמור במכשיר הזה: 3 מתוך 7'],
        rMissing: [[4], 'ב-4 ימים אין שיבוץ שמור במכשיר הזה.'],
        rPruned: [['5 ימים', '06/10/2026', 35], 'מתוכם 5 ימים לפני 06/10/2026: שיבוצים ישנים מ-35 ימים נמחקים מהמכשיר הזה.'],
        rUnreadable: [[2], 'שיבוצים של 2 ימים שמורים במכשיר ולא נקראו, ולא נספרו.'],
        rVehicle: [['סוואנה', 'ב-3 ימים'], 'רכב: סוואנה – יצא ב-3 ימים'],
        rDriverDays: [['אחמד', '2 ימים'], 'נהג: אחמד – 2 ימים'],
        rNoDriverDays: [['יום אחד'], 'בלי נהג – יום אחד'],
        rSeats: [[11, '3.7'], 'מושבים תפוסים: 11 בסך הכול, 3.7 בממוצע ליום'],
        rNoneOut: 'בימים עם שיבוץ אף רכב לא יצא עם עובדים.',
        rIdle: [['סוואנה, קורולה'], 'רכבים בלי עובדים בימים עם שיבוץ: סוואנה, קורולה'],
        rDriversTitle: 'נהגים בתקופה:',
        rDriver: [['אחמד', '3 ימים', 'סוואנה (2), קורולה (1)'], '- אחמד – 3 ימים: סוואנה (2), קורולה (1)'],
        rDriverVehicle: [['סוואנה', 2], 'סוואנה (2)'],
        // MOVED (the shared plan): eighteen keys added, none changed. Shown only where
        // the gate of js/ui/transport-share.js is open; `switchLead` above stays the
        // sentence of a build where it is shut.
        switchLeadShared: 'שיבוץ העובדים לרכבים והודעה לכל נהג. מופעל בכל מכשיר בנפרד. במכשיר שמחובר לענן, השיבוץ ורשימת הרכבים משותפים עם הטלפונים האחרים שהפעילו הסעות. לא נכלל בגיבוי.',
        shareChecking: 'בודק את השיבוץ המשותף…',
        shareShared: 'השיבוץ משותף עם הטלפונים האחרים ומעודכן.',
        shareWaiting: 'השינוי שמור במכשיר הזה ועדיין לא התעדכן בענן.',
        shareUnchecked: 'אין חיבור: לא ניתן לבדוק אם השיבוץ מעודכן. מוצג מה ששמור במכשיר הזה.',
        shareNotShared: 'השיבוץ עדיין לא משותף: הענן אינו מאפשר זאת כרגע. הוא שמור במכשיר הזה בלבד.',
        shareNoRoom: 'אין מקום במכשיר לשמור בצד את השיבוץ שלך, ולכן השיבוץ המשותף לא הוצג. מוצג מה ששמור במכשיר הזה.',
        shareChangedDay: 'השיבוץ של היום הזה שונה בטלפון אחר. מוצג השיבוץ המשותף, והשיבוץ שלך נשמר בצד.',
        shareChangedList: 'רשימת הרכבים שונתה בטלפון אחר. מוצגת הרשימה המשותפת, והרשימה שלך נשמרה בצד.',
        shareFirstDay: 'במכשיר הזה היה ליום הזה שיבוץ שונה מהמשותף. מוצג השיבוץ המשותף, והשיבוץ של המכשיר נשמר בצד.',
        shareFirstList: 'במכשיר הזה הייתה רשימת רכבים שונה מהמשותפת. מוצגת הרשימה המשותפת, והרשימה של המכשיר נשמרה בצד.',
        shareUseMineDay: 'להשתמש בשיבוץ שלי',
        shareUseMineList: 'להשתמש ברשימה שלי',
        shareKeepShared: 'להשאיר את המשותף',
        shareUseMineDayTitle: 'להחליף את השיבוץ המשותף בשיבוץ שלך?',
        shareUseMineListTitle: 'להחליף את רשימת הרכבים המשותפת ברשימה שלך?',
        shareUseMineLead: 'הטלפונים האחרים יראו את שלך במקום מה שמוצג עכשיו.',
        shareUseMineOk: 'להחליף'
    };
    same('the block holds exactly these words', Object.keys(T).sort(), Object.keys(W).sort());
    Object.keys(W).forEach(key => {
        const want = W[key];
        if (Array.isArray(want)) same(`${key}(${want[0].join(', ')})`, typeof T[key] === 'function' ? T[key](...want[0]) : T[key], want[1]);
        else same(key, T[key], want);
    });
    // One day is a word of its own in Hebrew, not «1 ימים».
    same('one day is said as one day, in each of the four places a number of days is said',
        [T.rCount(1), T.rIn(1), T.rMissing(1), T.rUnreadable(1)],
        ['יום אחד', 'ביום אחד', 'ביום אחד אין שיבוץ שמור במכשיר הזה.', 'שיבוץ של יום אחד שמור במכשיר ולא נקרא, ולא נספר.']);
    same('one man is said as one man', T.offReturned(1), 'עובד אחד שישב בו חזר לממתינים.');
    // The switch is said as the roster says a worker's: the same four words, read out of
    // that file, so a change there is seen here.
    const ROSTER = read('../js/ui/roster.js');
    check('the switch\'s words are the roster\'s own for a worker: «פעיל», «כבוי», «הסתר זמנית את», «הפעל את»',
        ROSTER.includes(`enabled ? '${T.vehicleOn}' : '${T.vehicleOff}'`)
        && ROSTER.includes(`enabled ? '${T.turnOffLabel('').trim()}' : '${T.turnOnLabel('').trim()}'`));
    check('and no word of the report says «נשלח»', !Object.keys(T).some(key =>
        String(typeof T[key] === 'function' ? T[key]('x', 'y', 'z') : T[key]).includes('נשלח')));
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
