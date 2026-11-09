// הסעות (v171): who rides to work in which vehicle, and a message to each driver - on one
// phone, by its own switch, in a store of its own.
//
//   node tests/transport.test.mjs
//
// The owner, 2026-11-09: seven vehicles (the 9-seater a Volkswagen, 2-2-2-3), one fixed
// pickup area per worker, he decides who may drive and what, a driver leaves from his own
// home, the morning ride only, no «ממתין» - and FIRST ON HIS PHONE ONLY: no cloud, and
// nothing in the record. Everything below follows from those sentences:
//
//   the engine (js/model/transport.js) is pure and gives the same plan for the same day:
//     not enough seats is said, never squeezed; a locked vehicle is left byte for byte; a
//     vehicle nobody may drive is flagged and never given an ineligible driver; a man with
//     no pickup area yet is still planned for;
//   the screen's words are one block, pinned here word for word, and the driver's message
//     is composed exactly;
//   a number is a wa.me number by the seder's own rule;
//   what it keeps is under its own keys, through Store - never the schedule, the outbox,
//     the write fence, a backup, a restore point, the rescue file or the cloud - a record
//     of it that will not read is copied aside and cannot block the day, and old days are
//     pruned;
//   and with the switch off there is no entry, and no transport key but the switch is read.
//
// The screen itself - the panel, the taps, the rectangles - is tests/transport.browser.mjs.

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
given('the engine loaded', Boolean(Core && typeof Core.suggest === 'function'));

// SYNTHETIC: invented names, sites and areas. Fourteen men, thirteen with a site; w11
// comes in his own car and w14 with another contractor, so eleven need a seat. w1, w6 and
// w11 may drive everything; w4 and w9 only v1, v2 and v6.
const Sample = (() => {
    const areas = [{ id: 'a1', name: 'אזור א' }, { id: 'a2', name: 'אזור ב' },
        { id: 'a3', name: 'אזור ג' }, { id: 'a4', name: 'אזור ד' }];
    const sites = [{ id: 's1', name: 'אתר 1' }, { id: 's2', name: 'אתר 2' }, { id: 's3', name: 'אתר 3' },
        { id: 's4', name: 'אתר 4' }, { id: 's5', name: 'אתר 5' }];
    const vehicles = [{ id: 'v1', name: 'רכב 1', seats: 5 }, { id: 'v2', name: 'רכב 2', seats: 5 },
        { id: 'v3', name: 'רכב 3', seats: 5 }, { id: 'v4', name: 'רכב 4', seats: 5 },
        { id: 'v5', name: 'רכב 5', seats: 9, rows: [2, 2, 2, 3] }, { id: 'v6', name: 'רכב 6', seats: 5 },
        { id: 'v7', name: 'רכב 7', seats: 5 }];
    const w = (id, area, canDrive, drives) => ({ id, name: `עובד ${id.slice(1)}`, area,
        canDrive: canDrive === true, drives: drives || (canDrive ? 'all' : []) });
    const workers = [w('w1', 'a1', true), w('w2', 'a1'), w('w3', 'a1'), w('w4', 'a1', true, ['v1', 'v2', 'v6']),
        w('w5', 'a1'), w('w6', 'a2', true), w('w7', 'a2'), w('w8', 'a2'), w('w9', 'a3', true, ['v1', 'v2', 'v6']),
        w('w10', 'a3'), w('w11', 'a3', true), w('w12', 'a4'), w('w13', 'a4'), w('w14', 'a2')];
    const attendance = { w1: 's1', w2: 's1', w3: 's1', w4: 's2', w5: 's2', w6: 's3', w7: 's3', w8: 's1',
        w9: 's4', w10: 's4', w11: 's5', w12: 's5', w14: 's2' };
    return {
        ctx: () => JSON.parse(JSON.stringify({ workers, vehicles, sites, areas, attendance })),
        day: () => ({ unavailable: {}, status: { w11: 'private', w14: 'contractor' }, trips: {}, workerLocks: {} })
    };
})();

const apply = (day, result) => Object.assign({}, day, { trips: result.trips });
const short = trips => Object.keys(trips).sort()
    .map(v => `${v}=${trips[v].driver || '?'}+[${trips[v].passengers.join(',')}]`).join(' ');
const codes = issues => issues.map(i => i.code + (i.vehicle ? ':' + i.vehicle : '') + (i.worker ? ':' + i.worker : '')).sort();
const noDouble = trips => {
    const seen = {};
    let ok = true;
    Object.values(trips).forEach(t => Core.occupants(t).forEach(id => { if (seen[id]) ok = false; seen[id] = 1; }));
    return ok;
};

await block('the engine: the sample day is planned whole, and the same on every run', async () => {
    const ctx = Sample.ctx();
    const day = Sample.day();
    const a = Core.suggest(ctx, day);
    const b = Core.suggest(Sample.ctx(), Sample.day());
    same('two runs give the same bytes', JSON.stringify(a), JSON.stringify(b));
    same('the pinned plan', short(a.trips), 'v1=w4+[w1,w2,w3,w5] v2=w6+[w7,w8] v6=w9+[w10,w12]');
    same('nobody is left without a seat', a.unseated, []);
    same('one warning - a man riding from another area - and no error',
        codes(Core.validate(ctx, apply(day, a))), ['otherArea:v6:w12']);
    check('the input was not mutated', JSON.stringify(day) === JSON.stringify(Sample.day()));
    check('the men coming another way are not seated',
        !Core.seatOf(apply(day, a), 'w11') && !Core.seatOf(apply(day, a), 'w14'));
    same('suggest on its own output is the same plan (idempotent)',
        short(Core.suggest(ctx, apply(day, a)).trips), short(a.trips));
    same('a pickup area starts as the driver\'s own',
        Object.keys(a.trips).sort().map(v => a.trips[v].area), ['a1', 'a2', 'a3']);
});

await block('the engine: not enough seats is said, never squeezed', async () => {
    const ctx = Sample.ctx();
    const day = Sample.day();
    ['v2', 'v3', 'v4', 'v5', 'v6', 'v7'].forEach(v => { day.unavailable[v] = true; });
    const r = Core.suggest(ctx, day);
    const issues = Core.validate(ctx, apply(day, r));
    same('one vehicle, full; of two drivers with one option each, the one whose site has more riders drives',
        short(r.trips), 'v1=w1+[w2,w3,w4,w5]');
    same('six men are left without a seat, in roster order', r.unseated, ['w6', 'w7', 'w8', 'w9', 'w10', 'w12']);
    same('each of them is an error', codes(issues),
        ['noSeat:w10', 'noSeat:w12', 'noSeat:w6', 'noSeat:w7', 'noSeat:w8', 'noSeat:w9']);
    check('the plan is incomplete', Core.isComplete(issues) === false);
    check('and the vehicle carries no more than it seats', Core.occupants(r.trips.v1).length <= 5);
});

await block('the engine: a locked vehicle is left exactly as a person left it', async () => {
    const ctx = Sample.ctx();
    const day = Sample.day();
    day.trips.v5 = { driver: 'w1', passengers: ['w3', 'w2', 'w12'], area: 'a1', locked: true, seats: { w3: 2 } };
    const before = JSON.stringify(day.trips.v5);
    const r = Core.suggest(ctx, day);
    const issues = Core.validate(ctx, apply(day, r));
    check('the locked vehicle is byte-identical - order and seat included', JSON.stringify(r.trips.v5) === before);
    check('nobody sits twice', noDouble(r.trips));
    same('nobody is left without a seat', r.unseated, []);
    same('the rest is planned around it', short(r.trips),
        'v1=w4+[w5] v2=w6+[w7,w8] v5=w1+[w3,w2,w12] v6=w9+[w10]');
    check('and the plan is complete (warnings only)', Core.isComplete(issues), codes(issues).join(' '));

    // A lock can cost seats: the only drivers of two areas frozen in the van, five seats empty.
    const stranded = Sample.day();
    stranded.trips.v5 = { driver: 'w6', passengers: ['w1', 'w12', 'w9'], area: 'a2', locked: true, seats: {} };
    const rc = Core.suggest(ctx, stranded);
    check('a locked vehicle is not filled by suggest', rc.trips.v5.passengers.join() === 'w1,w12,w9');
    same('and the men it strands are reported, not hidden', rc.unseated, ['w7', 'w10']);

    // A locked WORKER keeps his vehicle and his role.
    const pinned = Sample.day();
    pinned.trips.v7 = { driver: 'w1', passengers: ['w10'], area: 'a1', locked: false, seats: {} };
    pinned.workerLocks.w10 = true;
    const r2 = Core.suggest(ctx, pinned);
    check('a locked worker is still a passenger of his vehicle',
        Boolean(r2.trips.v7) && r2.trips.v7.passengers.indexOf('w10') !== -1);
    check('which was given a driver who may drive it',
        Boolean(r2.trips.v7) && Core.mayDrive(ctx.workers.find(w => w.id === r2.trips.v7.driver), ctx.vehicles[6]));
    check('and nobody sits twice or is left out', noDouble(r2.trips) && r2.unseated.length === 0);
});

await block('the engine: no eligible driver is flagged, never filled with a man who may not drive', async () => {
    const ctx = Sample.ctx();
    const day = Sample.day();
    ctx.workers.forEach(w => { if (w.canDrive) w.drives = ['v1', 'v2', 'v6']; });
    day.trips.v5 = { driver: null, passengers: ['w12'], area: 'a4', locked: false, seats: {} };
    day.workerLocks.w12 = true;
    const r = Core.suggest(ctx, day);
    const issues = Core.validate(ctx, apply(day, r));
    check('the vehicle keeps its locked passenger and has NO driver',
        r.trips.v5.driver === null && r.trips.v5.passengers.join() === 'w12');
    check('validation names it, and the plan is incomplete',
        codes(issues).indexOf('noDriver:v5') !== -1 && !Core.isComplete(issues), codes(issues).join(' '));
    check('nobody else was put into the driverless vehicle', r.trips.v5.passengers.length === 1);

    const nobody = Sample.ctx();
    nobody.workers.forEach(w => { w.canDrive = false; w.drives = []; });
    const r2 = Core.suggest(nobody, Sample.day());
    check('when nobody may drive anything, no vehicle is opened', Object.keys(r2.trips).length === 0);
    same('and all eleven riders are reported unseated', r2.unseated.length, 11);

    const manual = Sample.day();
    manual.trips.v3 = { driver: 'w4', passengers: [], area: 'a1', locked: false, seats: {} };
    check('a hand-made plan with a man driving a car not on his list is an error',
        codes(Core.validate(Sample.ctx(), manual)).indexOf('driverNotEligible:v3:w4') !== -1);
    const missing = Sample.ctx();
    delete missing.workers[0].canDrive;
    check('and a man whose permission is simply missing may not drive',
        Core.mayDrive(missing.workers[0], missing.vehicles[0]) === false);
});

await block('the engine: a driver riding as a passenger is moved to a vehicle that stands free', async () => {
    const ctx = Sample.ctx();
    const day = Sample.day();
    ['v2', 'v6', 'v4', 'v5', 'v7'].forEach(v => { day.unavailable[v] = true; });
    const r = Core.suggest(ctx, day);
    check('both vehicles are used, each with a driver who may drive it', Boolean(r.trips.v1) && Boolean(r.trips.v3)
        && Core.validate(ctx, apply(day, r)).every(i => i.code !== 'noDriver' && i.code !== 'driverNotEligible'));
    check('ten seats, eleven riders: exactly one man unseated, nobody twice',
        r.unseated.length === 1 && noDouble(r.trips), r.unseated.join(','));
});

await block('the engine: a man with no pickup area is still planned for', async () => {
    // The first evening on a new phone: the owner has typed no area yet.
    const ctx = Sample.ctx();
    ctx.areas = [];
    ctx.workers.forEach(w => { w.area = null; });
    const day = Sample.day();
    const r = Core.suggest(ctx, day);
    const issues = Core.validate(ctx, apply(day, r));
    same('with no areas at all, everybody is still seated', r.unseated, []);
    check('nobody twice, every vehicle with an eligible driver', noDouble(r.trips) && Core.isComplete(issues),
        codes(issues).join(' '));
    check('and nobody is "from another area" when no area is known',
        !issues.some(i => i.code === 'otherArea'));
    same('two runs are the same bytes', JSON.stringify(Core.suggest(ctx, day)), JSON.stringify(r));

    // Some with an area and some without, and one whose area was since removed.
    const mixed = Sample.ctx();
    mixed.workers.find(w => w.id === 'w12').area = null;
    mixed.workers.find(w => w.id === 'w10').area = 'gone';
    const r2 = Core.suggest(mixed, Sample.day());
    same('a man with no area, and one whose area is gone, take a seat with the rest', r2.unseated, []);
    check('nobody twice', noDouble(r2.trips));
});

await block('the engine: seats, and the statuses the owner kept', async () => {
    same('the statuses are private, contractor and other - «ממתין» is not one',
        [...Core.STATUSES], ['private', 'contractor', 'other']);
    const van = { id: 'v', seats: 9, rows: [2, 2, 2, 3] };
    same('the 9-seater: seat 1 is the driver\'s, the passengers\' are 2 to 9',
        Core.seatPlan(van).map(s => s.n), [2, 3, 4, 5, 6, 7, 8, 9]);
    same('laid out two in front, then rows of two, two and three',
        Core.seatPlan(van).map(s => `${s.kind}:${s.row}.${s.place}`),
        ['front:1.2', 'row:2.1', 'row:2.2', 'row:3.1', 'row:3.2', 'row:4.1', 'row:4.2', 'row:4.3']);
    same('a five-seater: beside the driver, then three behind',
        Core.seatPlan({ id: 'v', seats: 5 }).map(s => `${s.n}:${s.kind}`),
        ['2:front', '3:rearRight', '4:rearMiddle', '5:rearLeft']);
    same('any other count is numbered, with no claim about where a seat is',
        Core.seatPlan({ id: 'v', seats: 7 }).map(s => `${s.n}:${s.kind}`),
        ['2:number', '3:number', '4:number', '5:number', '6:number', '7:number']);
    same('rows that do not add up to the seats are not believed',
        Core.seatPlan({ id: 'v', seats: 7, rows: [2, 2, 2, 3] }).map(s => s.kind).join(), 'number,number,number,number,number,number');

    const ctx = Sample.ctx();
    const day = Sample.day();
    day.trips.v5 = { driver: 'w1', passengers: ['w2', 'w3'], area: 'a1', locked: false, seats: { w2: 9, w3: 10 } };
    same('a seat the vehicle does not have is an error; its last seat is not',
        codes(Core.validate(ctx, day)).filter(c => c.startsWith('badSeat')), ['badSeat:v5:w3']);
    day.trips.v5.seats = { w2: 4, w3: 4 };
    same('two men on one seat is an error for the second',
        codes(Core.validate(ctx, day)).filter(c => c.startsWith('badSeat')), ['badSeat:v5:w3']);
    day.trips.v5.seats = {};
    day.status.w2 = 'other';
    check('a man marked as coming another way and seated anyway is an error',
        codes(Core.validate(ctx, day)).indexOf('hasStatus:v5:w2') !== -1);
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

// The owner's own first evening, done by hand: two areas, who is picked up where, and
// who may drive what.
function setUp(device) {
    const north = device.call('transportAddArea', 'צפון');
    const south = device.call('transportAddArea', 'דרום');
    device.call('transportSetWorker', 'w_01', { area: north, canDrive: true });
    device.call('transportSetWorker', 'w_02', { area: north });
    device.call('transportSetWorker', 'w_03', { area: south });
    device.call('transportSetWorker', 'w_04', { area: south, canDrive: true, drives: ['tv_02'] });
    device.call('transportSetWorker', 'w_06', { area: south });
    return { north, south };
}

function reopen(device) {
    const again = bare(device.id, device.dump());
    load(again);
    again.State.load();
    return again;
}

const tripsOf = device => short(device.call('transportDayOf', DAY).trips);

await block('the seven vehicles, and a list the owner keeps himself', async () => {
    const device = crewPhone('d_list');
    const settings = device.call('transportSettings');
    same('the seven the owner confirmed, by the names he uses, in order',
        settings.vehicles.map(v => `${v.id} ${v.name} ${v.seats}`),
        ['tv_01 טויוטה קורולה 2013 5', 'tv_02 טויוטה קורולה 2016 5', 'tv_03 BYD סיל U 2025 5',
            'tv_04 BYD אטו 3 2025 5', 'tv_05 פולקסווגן 2018 9', 'tv_06 סוואנה 2010 5', 'tv_07 ליפמוטור C10 2026 5']);
    same('the 9-seater is laid out 2-2-2-3', settings.vehicles[4].rows, [2, 2, 2, 3]);
    same('the list of pickup areas starts EMPTY', settings.areas, []);
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
    same('a second site is told, not routed', JSON.parse(JSON.stringify(ctx.also)), { w_02: ['חיפה'] });
    same('areas and driving are this phone\'s settings laid over the roster - not roster fields',
        [Object.keys(device.State.schedule.workers[0]).sort().join(), ctx.workers[0].canDrive, ctx.workers[0].area],
        ['active,dailyRate,hourlyRate,id,name,phone', false, null]);
});

await block('the plan: suggest, move, driver, locks - and never the record', async () => {
    const device = crewPhone('d_plan');
    const { north, south } = setUp(device);
    const schedule = JSON.stringify(device.State.schedule);
    const disk = device.raw('scheduleData:v2');

    ['tv_03', 'tv_04', 'tv_05', 'tv_06', 'tv_07'].forEach(v => device.call('transportSetAvailable', DAY, v, false));
    const result = device.call('transportSuggest', DAY);
    same('two cars: each area\'s driver takes his own', tripsOf(device), 'tv_01=w_01+[w_02] tv_02=w_04+[w_03,w_06]');
    same('nobody left out', result.unseated, []);
    same('each car\'s pickup area is its driver\'s',
        [device.call('transportDayOf', DAY).trips.tv_01.area, device.call('transportDayOf', DAY).trips.tv_02.area],
        [north, south]);
    same('the plan is whole', device.call('transportErrors', DAY).length, 0);
    same('and suggesting again changes nothing', (device.call('transportSuggest', DAY), tripsOf(device)),
        'tv_01=w_01+[w_02] tv_02=w_04+[w_03,w_06]');

    check('a man is moved to another car', device.call('transportMove', DAY, 'w_06', 'tv_01') === true);
    same('and sits there', tripsOf(device), 'tv_01=w_01+[w_02,w_06] tv_02=w_04+[w_03]');
    check('a man who may NOT drive this car is refused as its driver, whoever asks',
        device.call('transportSetDriver', DAY, 'tv_01', 'w_04') === false
        && device.call('transportSetDriver', DAY, 'tv_01', 'w_02') === false);
    same('and nothing moved', tripsOf(device), 'tv_01=w_01+[w_02,w_06] tv_02=w_04+[w_03]');
    check('a man who may drive it is accepted', device.call('transportSetDriver', DAY, 'tv_02', 'w_01') === true);
    same('the old driver stays in the car as a passenger', tripsOf(device), 'tv_01=?+[w_02,w_06] tv_02=w_01+[w_03,w_04]');
    same('and the car left without a driver is named', device.call('transportErrors', DAY).map(i => i.code), ['noDriver']);

    device.call('transportSuggest', DAY);
    check('a vehicle is locked', device.call('transportToggleVehicleLock', DAY, 'tv_02') === true);
    check('nobody can be moved into it, out of it, or made its driver',
        device.call('transportMove', DAY, 'w_02', 'tv_02') === false
        && device.call('transportUnseat', DAY, 'w_03') === false
        && device.call('transportSetDriver', DAY, 'tv_02', null) === false);
    device.call('transportMove', DAY, 'w_02', 'tv_03');
    device.call('transportSetAvailable', DAY, 'tv_03', true);
    device.call('transportMove', DAY, 'w_02', 'tv_03');
    const locked = JSON.stringify(device.call('transportDayOf', DAY).trips.tv_02);
    device.call('transportSuggest', DAY);
    same('suggest leaves the locked vehicle byte for byte',
        JSON.stringify(device.call('transportDayOf', DAY).trips.tv_02), locked);
    check('a seated man is locked, and then he does not move',
        device.call('transportToggleWorkerLock', DAY, 'w_02') === true
        && device.call('transportMove', DAY, 'w_02', 'tv_03') === false
        && device.call('transportUnseat', DAY, 'w_02') === false);

    check('a status takes a man out of his seat', device.call('transportToggleWorkerLock', DAY, 'w_02') === true
        && device.call('transportSetStatus', DAY, 'w_02', 'private') === true
        && device.call('transportDayOf', DAY).status.w_02 === 'private'
        && Core.seatOf(device.call('transportDayOf', DAY), 'w_02') === null);
    check('«ממתין» is not a status that can be set', device.call('transportSetStatus', DAY, 'w_03', 'waiting') === false);

    same('through all of it the schedule in memory is byte for byte what it was',
        JSON.stringify(device.State.schedule), schedule);
    same('and so is the record on the disk', device.raw('scheduleData:v2'), disk);
});

await block('accepting: a whole plan, a partial one only with a typed reason, and versions', async () => {
    const device = crewPhone('d_accept');
    setUp(device);
    ['tv_02', 'tv_03', 'tv_04', 'tv_05', 'tv_06', 'tv_07'].forEach(v => device.call('transportSetAvailable', DAY, v, false));
    device.call('transportSuggest', DAY);
    same('one car for five men: it is full, and nobody else has a seat', tripsOf(device), 'tv_01=w_01+[w_02,w_03,w_04,w_06]');
    device.call('transportUnseat', DAY, 'w_06');
    same('with a man taken out, the plan is incomplete', device.call('transportErrors', DAY).map(i => `${i.code}:${i.worker}`),
        ['noSeat:w_06']);
    same('an incomplete plan is refused with no reason',
        JSON.parse(JSON.stringify(device.call('transportAccept', DAY, ''))), { ok: false, error: 'reason' });
    same('and with a reason of nothing but spaces',
        JSON.parse(JSON.stringify(device.call('transportAccept', DAY, '   '))), { ok: false, error: 'reason' });
    same('no version was made', device.call('transportDayOf', DAY).accepted.length, 0);
    same('with a typed reason it is accepted, as partial',
        JSON.parse(JSON.stringify(device.call('transportAccept', DAY, ' רכב אחד בלבד היום '))), { ok: true, n: 1 });
    const v1 = device.call('transportLastVersion', DAY);
    same('version 1 says so, and why', [v1.n, v1.complete, v1.errors, v1.reason, v1.moved],
        [1, false, 1, 'רכב אחד בלבד היום', null]);
    same('accepting again with nothing changed is refused',
        JSON.parse(JSON.stringify(device.call('transportAccept', DAY, 'x'))), { ok: false, error: 'unchanged' });

    device.call('transportSetAvailable', DAY, 'tv_02', true);
    device.call('transportMove', DAY, 'w_06', 'tv_02');
    device.call('transportMove', DAY, 'w_04', 'tv_02');
    device.call('transportSetDriver', DAY, 'tv_02', 'w_04');
    same('after an edit the plan is whole', device.call('transportErrors', DAY).length, 0);
    same('and is accepted with no reason asked', JSON.parse(JSON.stringify(device.call('transportAccept', DAY, ''))),
        { ok: true, n: 2 });
    const day = device.call('transportDayOf', DAY);
    same('version 2 is whole and counts the two men who moved',
        [day.accepted[1].n, day.accepted[1].complete, day.accepted[1].reason, day.accepted[1].moved], [2, true, '', 2]);
    same('version 1 is still what it was', short(day.accepted[0].trips), 'tv_01=w_01+[w_02,w_03,w_04]');
    device.call('transportMove', DAY, 'w_03', 'tv_02');
    same('a later edit of the draft does not touch an accepted version',
        short(day.accepted[1].trips), 'tv_01=w_01+[w_02,w_03] tv_02=w_04+[w_06]');

    const again = reopen(device);
    same('versions and the draft survive the app being closed - a man moved by hand sits where he was put',
        [again.call('transportDayOf', DAY).accepted.map(v => `${v.n}:${v.complete}:${v.reason}`).join(' | '), tripsOf(again)],
        ['1:false:רכב אחד בלבד היום | 2:true:', 'tv_01=w_01+[w_02] tv_02=w_04+[w_06,w_03]']);
});

await block('the driver\'s message, composed exactly, and the marks', async () => {
    const device = crewPhone('d_message');
    const { south } = setUp(device);
    device.call('transportRenameArea', south, 'כפר קרע');
    ['tv_01', 'tv_02', 'tv_04', 'tv_05', 'tv_06', 'tv_07'].forEach(v => device.call('transportSetAvailable', DAY, v, false));
    device.call('transportSetWorker', 'w_04', { drives: 'all' });
    device.call('transportSetWorker', 'w_01', { canDrive: false });
    device.call('transportSuggest', DAY);
    same('everybody rides in the BYD, driven by the one man who may', tripsOf(device), 'tv_03=w_04+[w_01,w_02,w_03,w_06]');
    device.call('transportAccept', DAY, '');
    const v1 = device.call('transportLastVersion', DAY);
    const text = device.call('transportDriverMessage', DAY, v1, 'tv_03');
    same('the message, line for line', text.split('\n'), [
        `שלום ${named('סמיר')},`,
        'הסעה ליום שלישי 10/11/2026:',
        `רכב: ${car('BYD סיל U 2025')}`,
        `איסוף: ${named('כפר קרע')}`,
        'נוסעים (4):',
        `- ${named('אחמד')} – ${named('הרצליה')}`,
        `- ${named('מוחמד')} – ${named('הרצליה')}`,
        `- ${named('יוסי')} – ${named('חיפה')}`,
        `- ${named('Ali Hassan')} – ${named('פרדסיה')}`,
        `יעדים: ${named('הרצליה')}, ${named('חיפה')}, ${named('פרדסיה')}`
    ]);
    check('the vehicle\'s name is held right-to-left, not first-strong: it begins with a Latin letter',
        text.includes(`${RLI}BYD`) && !text.includes(`${FSI}BYD`));
    same('the number is the seder\'s own rule', device.call('transportDriverNumber', DAY, v1, 'tv_03'), '972501112233');
    same('and so is the address a tap is given',
        device.call('sederUrl', device.call('transportDriverNumber', DAY, v1, 'tv_03'), text),
        `https://wa.me/972501112233?text=${encodeURIComponent(text)}`);

    same('nothing is marked to begin with', device.call('transportMarkState', DAY, 'tv_03'), 'none');
    device.call('transportMarkOpened', DAY, 'tv_03');
    same('a tap on the link is "opened" - never "sent"', device.call('transportMarkState', DAY, 'tv_03'), 'opened');
    device.call('transportMarkSent', DAY, 'tv_03', true);
    same('«סימנתי שנשלח» is the person\'s own mark', device.call('transportMarkState', DAY, 'tv_03'), 'sent');
    same('it survives the app being closed', reopen(device).call('transportMarkState', DAY, 'tv_03'), 'sent');
    device.call('transportMarkSent', DAY, 'tv_03', false);
    same('and can be taken back', device.call('transportMarkState', DAY, 'tv_03'), 'opened');
    device.call('transportMarkSent', DAY, 'tv_03', true);

    // A later version that changes this driver's words: the mark is no longer believed.
    device.call('transportSetStatus', DAY, 'w_06', 'contractor');
    device.call('transportAccept', DAY, '');
    const v2 = device.call('transportLastVersion', DAY);
    const text2 = device.call('transportDriverMessage', DAY, v2, 'tv_03');
    same('the second version says it is an update, and carries one man fewer', text2.split('\n').slice(1, 6), [
        'הסעה ליום שלישי 10/11/2026:', 'עדכון מספר 1 לתוכנית.', `רכב: ${car('BYD סיל U 2025')}`,
        `איסוף: ${named('כפר קרע')}`, 'נוסעים (3):']);
    same('a mark made on the old words is not believed for the new ones',
        device.call('transportMarkState', DAY, 'tv_03'), 'changed');
    device.call('transportMarkOpened', DAY, 'tv_03');
    same('opening the new message is a new mark, and not a sent one', device.call('transportMarkState', DAY, 'tv_03'), 'opened');
    device.State.schedule.workers.find(w => w.id === 'w_04').phone = '0501112234';
    same('a corrected number un-believes it too', device.call('transportMarkState', DAY, 'tv_03'), 'changed');
    device.State.schedule.workers.find(w => w.id === 'w_04').phone = 'אין';
    same('and a driver with no usable number is said to have none', device.call('transportMarkState', DAY, 'tv_03'), 'nophone');
    check('for him nothing can be marked', device.call('transportMarkSent', DAY, 'tv_03', true) === false);

    // A driver alone, with no area chosen: no pickup line, no passengers, his own site.
    const lone = crewPhone('d_alone');
    lone.call('transportSetWorker', 'w_06', { canDrive: true });
    ['w_01', 'w_02', 'w_03', 'w_04'].forEach(id => lone.call('transportSetStatus', DAY, id, 'private'));
    lone.call('transportSuggest', DAY);
    lone.call('transportAccept', DAY, '');
    same('a driver alone', lone.call('transportDriverMessage', DAY, lone.call('transportLastVersion', DAY), 'tv_01').split('\n'),
        [`שלום ${named('Ali Hassan')},`, 'הסעה ליום שלישי 10/11/2026:', `רכב: ${car('טויוטה קורולה 2013')}`,
            'בלי נוסעים.', `יעדים: ${named('פרדסיה')}`]);
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

await block('none of it is the record: not the schedule, not the outbox, not the fence', async () => {
    const device = crewPhone('d_record');
    const schedule = JSON.stringify(device.State.schedule);
    const disk = device.raw('scheduleData:v2');
    const queued = JSON.stringify(device.Sync.pendingPaths());
    const fence = device.Store.fenceState();
    given('the record is on the disk and the fence can be read', disk !== null && fence !== null);

    setUp(device);
    device.call('transportAddVehicle', 'מיניבוס', 12);
    device.call('transportSetAvailable', DAY, 'tv_07', false);
    device.call('transportSuggest', DAY);
    device.call('transportAccept', DAY, 'סיבה');
    device.call('transportMarkOpened', DAY, 'tv_01');
    device.call('transportMarkSent', DAY, 'tv_01', true);
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

    setUp(device);
    device.call('transportSuggest', DAY);
    device.call('transportAccept', DAY, 'סיבה');
    device.call('transportMarkOpened', DAY, 'tv_01');
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

    const foreign = text => /farkadTransport|tv_0\d|"ta_|canDrive|workerLocks/.test(String(text));
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
    setUp(device);
    device.call('transportSuggest', DAY);
    const brokenSettings = '{"version":1,"vehicles":[{"id":"tv_01","na';
    const brokenDay = '{"version":1,"trips":{"tv_01":{"driver":"w_0';
    device.putRaw(SETTINGS, brokenSettings);
    device.putRaw(DAY_KEY, brokenDay);

    const again = reopen(device);
    check('loading the screen\'s file did not throw, and the app is not held',
        again.call('farkadWritesBlocked') === false);
    same('unreadable settings start from the seven, with no areas',
        [again.call('transportSettings').vehicles.length, again.call('transportSettings').areas.length], [7, 0]);
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
    check('the next change writes a readable record over the broken one - the copy is aside',
        again.call('transportAddArea', 'צפון') !== null && JSON.parse(again.raw(SETTINGS)).areas.length === 1
        && again.raw(`${SETTINGS}:unreadable`) === brokenSettings);

    // No room to keep the copy: then nothing is written over the only copy there is.
    const full = crewPhone('d_broken_full');
    full.putRaw(SETTINGS, brokenSettings);
    const tight = reopen(full);
    tight.setQuota(key => /^farkadTransport:/.test(key));
    tight.call('transportSettings');
    check('with no room for a copy, a change is NOT written over the unreadable bytes',
        tight.call('transportAddArea', 'צפון') !== null && tight.raw(SETTINGS) === brokenSettings);
    check('and the screen is told it was not kept', tight.call('transportWasKept') === false);
    check('while the session still holds the change', tight.call('transportSettings').areas.length === 1);

    // Poison: names that would land on a prototype are not ids.
    const poisoned = crewPhone('d_poison');
    poisoned.putRaw(SETTINGS, '{"version":1,"seeded":true,"vehicles":[{"id":"__proto__","name":"x","seats":5},'
        + '{"id":"tv_ok","name":"טנדר","seats":5},{"id":"v_01","name":"ישן","seats":5}],"areas":[{"id":"constructor","name":"y"}],'
        + '"workers":{"__proto__":{"canDrive":true,"drives":"all"},"constructor":{"canDrive":true},"w_01":{"canDrive":true,"drives":"all"}}}');
    poisoned.putRaw(DAY_KEY, '{"version":1,"status":{"__proto__":"private","w_01":"waiting","w_02":"other"},'
        + '"trips":{"__proto__":{"driver":"w_01","passengers":[]},"tv_ok":{"driver":"constructor","passengers":["w_02","w_02","__proto__"]}}}');
    const safe = reopen(poisoned);
    const settings = safe.call('transportSettings');
    same('a poisoned name is not a vehicle, an area or a worker - and the retired feature\'s v_NN is not one of ours',
        [settings.vehicles.map(v => v.id), settings.areas.length, Object.keys(settings.workers)], [['tv_ok'], 0, ['w_01']]);
    const day = safe.call('transportDayOf', DAY);
    same('nor a status or a seat; «ממתין» left over from the proposal is dropped',
        [Object.keys(day.status), Object.keys(day.trips), day.trips.tv_ok.driver, day.trips.tv_ok.passengers],
        [['w_02'], ['tv_ok'], null, ['w_02']]);
    check('and nothing landed on a prototype', ({}).canDrive === undefined && ({}).driver === undefined
        && safe.global('Object').prototype.canDrive === undefined);
});

await block('a disk that refuses it keeps the session going, says so, and spends no restore point', async () => {
    const device = crewPhone('d_full');
    device.Store.set('scheduleData:snap:2026-11-01', JSON.stringify(device.State.schedule));
    given('there is a restore point a full disk could be tempted to spend',
        device.raw('scheduleData:snap:2026-11-01') !== null && typeof device.Store.reclaim === 'function');
    check('a disk that takes it says it was kept', device.call('transportAddArea', 'צפון') !== null
        && device.call('transportWasKept') === true);

    device.setQuota(key => /^farkadTransport:/.test(key));
    check('a change the disk refuses is still made for this session',
        device.call('transportAddArea', 'דרום') !== null && device.call('transportSettings').areas.length === 2);
    same('and is said not to have been kept', device.call('transportWasKept'), false);
    check('no restore point was spent making room for it', device.raw('scheduleData:snap:2026-11-01') !== null);
    check('nor was the record touched', device.raw('scheduleData:v2') !== null
        && JSON.parse(device.raw('scheduleData:v2')).days[DAY].actual.w_01.entries.length === 1);
    same('after a reopen only what reached the disk is there', reopen(device).call('transportSettings').areas.length, 1);
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
    const refused = [
        device.call('transportAddArea', 'צפון'), device.call('transportAddVehicle', 'רכב', 5),
        device.call('transportSetWorker', 'w_01', { canDrive: true }), device.call('transportSetAvailable', DAY, 'tv_01', false),
        device.call('transportSetStatus', DAY, 'w_01', 'private'), device.call('transportSuggest', DAY),
        device.call('transportMove', DAY, 'w_01', 'tv_01'), device.call('transportSetDriver', DAY, 'tv_01', 'w_01'),
        device.call('transportMarkOpened', DAY, 'tv_01'), device.call('transportPrune', DAY),
        device.call('transportSaveDay', DAY)];
    same('every change is refused', refused, [null, null, false, false, false, null, false, false, false, 0, false]);
    same('accepting is refused', JSON.parse(JSON.stringify(device.call('transportAccept', DAY, 'x'))), { ok: false, error: 'off' });
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
        (device.call('transportAddArea', 'צפון'), device.call('transportSetEnabled', false)) === false
        && device.raw(ENABLED) === null && device.raw(SETTINGS) !== null);
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
    setUp(device);
    device.call('transportSuggest', DAY);
    same('the schedule\'s own vehicles list is as it was', JSON.stringify(device.State.schedule.vehicles || []), '[]');
    check('no day of the record gained a transport or vehicle layer',
        !/transport|vehicleRuns/.test(device.raw('scheduleData:v2')));
    check('the screen\'s file never commits, saves or syncs',
        !/State\.(commit|commitMany|save|persist)\s*\(|FarkadSync\.|Recovery\./.test(SCREEN));
    check('and never asks with the browser\'s own dialogs', !/\b(alert|confirm|prompt)\s*\(/.test(SCREEN.replace(/askConfirm\(/g, '')));
    check('the engine touches no storage, no document and no clock',
        !/Store\.|localStorage|document\.|Date\.now|new Date|Math\.random/.test(ENGINE));
});

// Every word the feature shows or sends. PROPOSED: the owner gave blanket approval of the
// wording on 2026-11-09 and corrects on sight - and a correction moves the line here, in
// the same commit (CLAUDE.md, law 6).
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
        tabPlan: 'שיבוץ',
        tabVehicles: 'רכבים',
        tabWorkers: 'עובדים',
        tabMessages: 'הודעות',
        notKept: 'השינוי לא נשמר במכשיר. אם האפליקציה תיסגר, הוא יאבד.',
        unreadable: 'נתוני הסעות שנשמרו במכשיר לא נקראו. מתחילים מרשימה ריקה, והעותק שלא נקרא נשמר בצד.',
        nobody: 'אין ביום הזה עובדים עם אתר עבודה.',
        vehiclesLead: 'אילו רכבים יוצאים היום?',
        vehiclesSummary: [[6, 7, 34], 'זמינים 6 מתוך 7 · 34 מושבים'],
        seats: [[5], '5 מושבים'],
        available: 'זמין היום',
        unavailable: 'לא זמין היום',
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
        retireLead: 'הרכב לא יוצע עוד לשיבוץ. גרסאות שכבר אושרו אינן משתנות.',
        save: 'שמירה',
        workersLead: 'מי צריך הסעה היום? הרשימה נקראת מרישום היום ואינה משנה אותו.',
        statusLabel: [['אחמד'], 'איך אחמד מגיע'],
        statusRide: 'בהסעה שלנו',
        statusPrivate: 'רכב פרטי',
        statusContractor: 'נוסע עם קבלן אחר',
        statusOther: 'אחר',
        areaLabel: [['אחמד'], 'אזור האיסוף של אחמד'],
        noArea: 'בלי אזור',
        alsoAt: [['חיפה'], 'רשום היום גם בחיפה. ההסעה לאתר הראשון.'],
        canDrive: 'רשאי לנהוג',
        cannotDrive: 'לא נוהג',
        drivesAll: 'כל הרכבים',
        drivesSome: [[3], '3 רכבים'],
        drivesNone: 'לא נבחר רכב',
        drivesLabel: [['אחמד'], 'באילו רכבים אחמד רשאי לנהוג'],
        notWorkingToday: [[2], '2 עובדים בלי אתר היום – אינם בהסעות'],
        areasTitle: [[3], 'אזורי איסוף (3)'],
        areasLead: 'האזורים שמהם אוספים עובדים. לכל עובד אזור אחד קבוע.',
        noAreas: 'עדיין אין אזורים. מוסיפים אזור, ואז בוחרים אזור לכל עובד.',
        addArea: 'הוספת אזור',
        renameArea: 'שינוי שם',
        removeArea: 'מחיקה',
        areaNameTitle: 'שם האזור',
        areaNameTaken: 'כבר יש אזור בשם הזה',
        removeAreaTitle: [['צפון'], 'למחוק את האזור צפון?'],
        removeAreaLead: 'עובדים ששויכו לאזור הזה יישארו בלי אזור.',
        suggest: 'הצעת שיבוץ',
        accept: 'אישור התוכנית',
        draft: 'טיוטה – עדיין לא אושרה',
        acceptedVersion: [[2], 'גרסה 2 מאושרת'],
        changedSince: [[2], 'יש שינויים שלא אושרו מאז גרסה 2'],
        recordChanged: 'רישום היום השתנה מאז שאושרה הגרסה',
        seatedCount: [[10, 11], 'משובצים 10 מתוך 11'],
        planOk: 'התוכנית מלאה',
        errorsTitle: [[3], '3 דברים לתיקון'],
        warnTitle: 'לתשומת לב',
        unseatedTitle: [[2], 'בלי מקום ברכב (2)'],
        suggestDone: [[2], 'הוצע שיבוץ. 2 נשארו בלי מקום'],
        noDriver: [['סוואנה'], 'סוואנה: אין נהג'],
        driverNotEligible: [['סוואנה', 'אחמד'], 'סוואנה: אחמד אינו רשאי לנהוג ברכב הזה'],
        overCapacity: [['סוואנה', 1], 'סוואנה: 1 יותר ממספר המושבים'],
        twice: [['אחמד'], 'אחמד משובץ בשני רכבים'],
        hasStatus: [['אחמד', 'רכב פרטי'], 'אחמד משובץ ברכב אבל מסומן «רכב פרטי»'],
        notWorking: [['אחמד'], 'אחמד משובץ ברכב אבל אין לו אתר ברישום היום'],
        vehicleUnavailable: [['סוואנה'], 'סוואנה מסומן לא זמין היום ויש בו נוסעים'],
        unknownVehicle: 'רכב שהוצא מהרשימה ויש בו נוסעים',
        noSeat: [['אחמד'], 'אחמד בלי מקום ברכב'],
        badSeat: [['סוואנה', 'אחמד'], 'סוואנה: המושב של אחמד אינו תקין'],
        otherArea: [['סוואנה', 'אחמד'], 'אחמד נאסף מאזור אחר מזה של סוואנה'],
        deletedWorker: 'עובד שנמחק',
        deletedVehicle: 'רכב שהוצא מהרשימה',
        occupancy: [[3, 5], '3 מתוך 5'],
        notUsed: 'לא בשימוש',
        lockVehicle: 'נעילת הרכב',
        unlockVehicle: 'שחרור הרכב',
        vehicleLocked: 'הרכב נעול',
        pickup: 'אזור איסוף',
        destinations: 'יעדים',
        driver: [['אחמד'], 'נהג: אחמד'],
        chooseDriver: 'בחירת נהג',
        driverDialogTitle: [['סוואנה'], 'מי נוהג בסוואנה?'],
        driverDialogLead: 'מוצגים רק עובדים שרשאים לנהוג ברכב הזה.',
        driverNone: 'בלי נהג',
        noEligible: 'אין היום עובד שרשאי לנהוג ברכב הזה',
        lockWorker: [['אחמד'], 'נעילת השיבוץ של אחמד'],
        unlockWorker: [['אחמד'], 'שחרור השיבוץ של אחמד'],
        lock: 'נעילה',
        locked: 'נעול',
        moveHere: 'העברה לכאן',
        full: 'הרכב מלא',
        moving: [['אחמד'], 'מעבירים את אחמד – בוחרים רכב'],
        workerLockedNote: [['אחמד'], 'אחמד נעול – משחררים כדי להעביר'],
        cancel: 'ביטול',
        removeFromVehicle: 'הוצאה מהרכב',
        seat: 'מושב',
        seatNone: 'בלי מושב קבוע',
        seatFront: 'קדמי, ליד הנהג',
        seatRearRight: 'אחורי ימין',
        seatRearMiddle: 'אחורי אמצע',
        seatRearLeft: 'אחורי שמאל',
        seatRow: [[4, 3], 'שורה 4, מושב 3'],
        seatNumber: [[7], 'מושב 7'],
        acceptTitle: 'אישור התוכנית',
        acceptComplete: 'התוכנית מלאה. לאשר אותה?',
        acceptIncomplete: [[2], 'התוכנית חלקית: 2 דברים לא סגורים. אפשר לאשר רק עם סיבה.'],
        reasonLabel: 'למה מאשרים תוכנית חלקית?',
        reasonNeeded: 'צריך לכתוב סיבה',
        acceptYes: 'אישור',
        acceptPartial: 'אישור כתוכנית חלקית',
        nothingToAccept: 'אין שינויים לאשר',
        historyTitle: 'היסטוריית גרסאות',
        noVersions: 'עדיין אין גרסה מאושרת',
        versionLine: [[2, '21:40'], 'גרסה 2 · 21:40'],
        complete: 'מלאה',
        partial: [['חסר נהג'], 'חלקית – חסר נהג'],
        moved: [[3, 1], '3 עובדים שונו לעומת גרסה 1'],
        tripLine: [['סוואנה', 'אחמד', 3], 'סוואנה: אחמד + 3 נוסעים'],
        messagesLead: 'הודעה לכל נהג. וואטסאפ נפתח עם ההודעה מוכנה, ושם לוחצים על שליחה.',
        noAccepted: 'אין תוכנית מאושרת. מאשרים את השיבוץ, ואז שולחים לנהגים.',
        draftDiffers: [[2], 'ההודעות לפי גרסה 2. יש שינויים שלא אושרו.'],
        openWhatsapp: 'פתיחה בוואטסאפ',
        notOpened: 'עדיין לא נפתח',
        opened: 'נפתח בוואטסאפ',
        confirmSent: 'סימנתי שנשלח',
        sentMarked: [['21:45'], 'סומן כנשלח ב-21:45'],
        unmarkSent: 'ביטול הסימון',
        changedSinceMark: 'ההודעה השתנתה מאז שסומנה – כדאי לשלוח שוב',
        noPhone: 'אין מספר טלפון תקין',
        mHello: [['אחמד'], 'שלום אחמד,'],
        mHeading: [['יום שלישי', '10/11/2026'], 'הסעה ליום שלישי 10/11/2026:'],
        mUpdate: [[2], 'עדכון מספר 1 לתוכנית.'],
        mVehicle: [['סוואנה'], 'רכב: סוואנה'],
        mPickup: [['ערערה'], 'איסוף: ערערה'],
        mPassengers: [[2], 'נוסעים (2):'],
        mPassenger: [['ראמי', 'חדרה'], '- ראמי – חדרה'],
        mAlone: 'בלי נוסעים.',
        mDestinations: [['חיפה, חדרה'], 'יעדים: חיפה, חדרה']
    };
    same('the block holds exactly these words', Object.keys(T).sort(), Object.keys(W).sort());
    Object.keys(W).forEach(key => {
        const want = W[key];
        if (Array.isArray(want)) same(`${key}(${want[0].join(', ')})`, typeof T[key] === 'function' ? T[key](...want[0]) : T[key], want[1]);
        else same(key, T[key], want);
    });
    // The second form of each word that has two.
    same('one seat-less man', T.suggestDone(0), 'הוצע שיבוץ לכולם');
    same('one thing to fix', T.errorsTitle(1), 'דבר אחד לתיקון');
    same('one thing open', T.acceptIncomplete(1), 'התוכנית חלקית: דבר אחד לא סגור. אפשר לאשר רק עם סיבה.');
    same('one man moved', T.moved(1, 2), 'עובד אחד שונה לעומת גרסה 2');
    same('one man off', T.notWorkingToday(1), 'עובד אחד בלי אתר היום – אינו בהסעות');
    same('one vehicle', T.drivesSome(1), 'רכב אחד');
    check('«ממתין» is nowhere in the words', !Object.keys(T).some(key =>
        String(typeof T[key] === 'function' ? T[key]('x', 'y', 'z') : T[key]).includes('ממתין')));
    // No Hebrew outside the block: a word typed straight into the screen's code is a word
    // this suite does not pin. (The seven vehicle names are the owner's data, pinned above.)
    const code = SCREEN.slice(SCREEN.indexOf('// ================================================================== the store'))
        .split('\n').filter(line => !/^\s*\/\//.test(line)).join('\n')
        .replace(/\/\/.*$/gm, '').replace(/const TRANSPORT_SEED[\s\S]*?\]\);/, '');
    same('and no Hebrew is written anywhere else in the screen\'s code', code.match(/[֐-׿]+/g) || [], []);
});

report();
