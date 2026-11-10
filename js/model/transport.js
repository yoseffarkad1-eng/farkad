// הסעות: who rides to work in which vehicle, and in which seat - the pure half.
//
// No DOM, no storage, no clock, no randomness. The same input gives the same picture,
// byte for byte, and nothing here mutates what it is handed: every function that changes
// a plan RETURNS the new trips, so a refused change has changed nothing.
//
// v174 - THE PLAN IS A PICTURE. The owner tried v171's planner on his phone and sent it
// back (2026-11-10): he wants the car drawn from above and the men dragged to their
// seats. So this file no longer plans anything. `suggest`, pickup areas, who may drive,
// locks, accepted versions and their signatures are gone; what is left is the geometry -
// which seats a vehicle has and where they are - and the three rules of a seat:
//   - WHOEVER SITS IN SEAT 1 IS THE DRIVER. Nobody is "allowed" or "not allowed": the
//     owner decides by putting him there;
//   - a man dropped on a taken seat changes places with the man in it (or sends him back
//     to wait, when the dragged man was not sitting anywhere);
//   - a passenger a stored plan has no seat number for is given the first free one.
//
// THIS IS NOT THE RETIRED VEHICLES FEATURE, and shares nothing with it. That one
// (js/model/schema.js: the `vehicles` flag, ids `v_NN`, `vehicleRuns`, the «רכבים» panel)
// pays the OWNER of a vehicle and is part of payroll. This one seats men in cars, is kept
// in a store of its own on one phone (js/ui/transport.js), and cannot reach a pay sheet:
// it never reads a rate and never writes the record. Its vehicles are `tv_…`.
//
//   ctx = { workers:  [{id, name}],                                roster order
//           vehicles: [{id, name, seats, rows?: [2,2,2,3]}],       inventory order
//           sites:    [{id, name}],
//           attendance: {workerId: siteId} }      READ from the day record, never written
//   day = { unavailable: {vehicleId: true},
//           status: {workerId: 'private' | 'contractor' | 'other'},   absent = rides with us
//           trips: {vehicleId: {driver, passengers: [], seats: {workerId: n}}} }
//
// A trip is the shape v171 wrote, minus what v171's planner kept beside it, so a plan
// stored by v171 or v172 reads here as it is: `driver` is seat 1, `seats` names seats 2..n.
//
// The morning ride only (the owner, 2026-11-09): there is no return trip in this model.
const TransportEngine = (function () {
    'use strict';

    // How a man gets there when it is not with us. «ממתין» was in the first proposal and
    // the owner took it out (2026-11-09): a man is riding with us, or he is one of these.
    const STATUSES = Object.freeze(['private', 'contractor', 'other']);

    function indexOf(list) {
        const map = Object.create(null);
        list.forEach((item, i) => { map[item.id] = i; });
        return map;
    }
    function byId(list) {
        const map = Object.create(null);
        list.forEach(item => { map[item.id] = item; });
        return map;
    }

    // Who needs a seat: on a site in the day record, and not marked as getting there
    // some other way.
    function isRider(ctx, day, workerId) {
        return Boolean(ctx.attendance[workerId]) && !day.status[workerId];
    }
    function riders(ctx, day) {
        return ctx.workers.filter(w => isRider(ctx, day, w.id)).map(w => w.id);
    }
    function occupants(trip) {
        return (trip && trip.driver ? [trip.driver] : []).concat((trip && trip.passengers) || []);
    }
    // Where a vehicle is going: the sites of the men in it, in site order. Derived every
    // time and never stored - a stored destination is a second copy of the day record,
    // and the day record is the one that is right.
    function tripSites(ctx, trip) {
        const order = indexOf(ctx.sites);
        const seen = Object.create(null);
        const out = [];
        occupants(trip).forEach(id => {
            const site = ctx.attendance[id];
            if (site && !seen[site]) { seen[site] = true; out.push(site); }
        });
        return out.sort((a, b) => (order[a] === undefined ? 1e9 : order[a]) - (order[b] === undefined ? 1e9 : order[b]));
    }

    // ------------------------------------------------------------------ the seats
    //
    // The rows of a vehicle as the picture draws them: front row first, and each row
    // FROM THE LEFT OF THE CAR TO ITS RIGHT, the car seen from above with its front up.
    // Seat 1 is the driver's and is the first of the first row - the LEFT side, because
    // this is Israel and the wheel is on the left.
    //   - a vehicle with `rows` (the 9-seater: [2,2,2,3]) is laid out as they say;
    //   - a five-seater: two in front, three behind;
    //   - anything else: two in front, then rows of up to three.
    // The rows behind the front one are numbered from the RIGHT, because that is what
    // v171 called them («אחורי ימין» was seat 3, «אחורי שמאל» seat 5) and a man it seated
    // on the right must not be drawn on the left by the build that replaced it.
    // `rows` that do not add up to the seats are not believed: a layout that disagrees
    // with the count would draw a seat the vehicle does not have.
    function seatRows(vehicle) {
        const seats = vehicle && Number.isInteger(vehicle.seats) && vehicle.seats > 0 ? vehicle.seats : 0;
        let sizes = vehicle && Array.isArray(vehicle.rows)
            && vehicle.rows.every(n => Number.isInteger(n) && n > 0)
            && vehicle.rows.reduce((sum, n) => sum + n, 0) === seats && vehicle.rows[0] >= 2
            ? vehicle.rows.slice() : null;
        if (!sizes) {
            sizes = [];
            for (let left = seats; left > 0;) {
                const size = Math.min(left, sizes.length === 0 ? 2 : 3);
                sizes.push(size);
                left -= size;
            }
        }
        let n = 0;
        return sizes.map((size, r) => {
            const row = [];
            for (let i = 0; i < size; i += 1) { n += 1; row.push(n); }
            return r === 0 ? row : row.reverse();
        });
    }

    // Who is drawn in which seat. { cars: {vehicleId: [null, seat1, seat2, …]},
    //                               where: {workerId: {vehicle, n}} }
    // This is the ONE reading of a stored plan, and everything a screen shows or changes
    // goes through it, so what is drawn and what is kept cannot disagree:
    //   - a vehicle that does not go out today, or is no longer on the list, has no car
    //     here, and the men a stored plan left in it are waiting again;
    //   - a man marked as getting there another way is not in a seat - the mark wins;
    //   - a man named twice sits where the list of vehicles reaches him first;
    //   - a passenger with a good seat number keeps it; one with none (or with a number
    //     the vehicle does not have, or one already taken) gets the first free seat; a
    //     passenger there is no seat left for is waiting again, never squeezed in.
    // A seated man who is NOT on a site today stays in his seat: taking him out silently
    // would hide that the day changed under the plan. `validate` names him.
    function layout(ctx, day) {
        const cars = Object.create(null);
        const where = Object.create(null);
        ctx.vehicles.forEach(v => {
            if (day.unavailable[v.id]) return;
            const seats = [];
            for (let n = 0; n <= v.seats; n += 1) seats.push(null);
            const put = (id, n) => { seats[n] = id; where[id] = { vehicle: v.id, n }; };
            const free = id => typeof id === 'string' && id !== '' && !where[id] && !day.status[id];
            const trip = day.trips[v.id];
            if (trip) {
                if (free(trip.driver)) put(trip.driver, 1);
                const later = [];
                (trip.passengers || []).forEach(id => {
                    if (!free(id)) return;
                    const n = trip.seats ? trip.seats[id] : undefined;
                    if (Number.isInteger(n) && n >= 2 && n <= v.seats && !seats[n]) put(id, n);
                    else later.push(id);
                });
                later.forEach(id => {
                    if (where[id]) return;
                    for (let n = 2; n <= v.seats; n += 1) {
                        if (!seats[n]) { put(id, n); return; }
                    }
                });
            }
            cars[v.id] = seats;
        });
        return { cars, where };
    }

    // The picture, written down: every seated man with his seat number, the driver as
    // the driver, an empty vehicle not at all. What the store keeps after any change.
    function tripsOf(ctx, cars) {
        const trips = Object.create(null);
        ctx.vehicles.forEach(v => {
            const seats = cars[v.id];
            if (!seats) return;
            const passengers = [];
            const numbers = Object.create(null);
            for (let n = 2; n <= v.seats; n += 1) {
                if (seats[n]) { passengers.push(seats[n]); numbers[seats[n]] = n; }
            }
            if (seats[1] || passengers.length) trips[v.id] = { driver: seats[1] || null, passengers, seats: numbers };
        });
        return trips;
    }

    // The men who ride with us and are in no seat, in roster order: the tray.
    function waiting(ctx, day) {
        const where = layout(ctx, day).where;
        return riders(ctx, day).filter(id => !where[id]);
    }

    // A man put on seat `n` of a vehicle. Returns { trips, displaced } or null when it
    // is refused and nothing changes: a vehicle that is not going out, a seat it does
    // not have, a man who is not riding with us today, or the seat he is already in.
    // On a taken seat the two men change places; when the man came from the tray, the
    // one who was sitting goes back to it and is named in `displaced`.
    function place(ctx, day, workerId, vehicleId, n) {
        const vehicle = byId(ctx.vehicles)[vehicleId];
        if (!vehicle || day.unavailable[vehicleId]) return null;
        if (!Number.isInteger(n) || n < 1 || n > vehicle.seats) return null;
        if (!isRider(ctx, day, workerId)) return null;
        const now = layout(ctx, day);
        const from = now.where[workerId] || null;
        const sitting = now.cars[vehicleId][n];
        if (sitting === workerId) return null;
        if (from) now.cars[from.vehicle][from.n] = sitting || null;
        now.cars[vehicleId][n] = workerId;
        return { trips: tripsOf(ctx, now.cars), displaced: sitting && !from ? sitting : null };
    }

    // A man taken out of his seat, back to the tray. Returns the new trips, or null when
    // he was not sitting anywhere. Never refused for a man who is no longer on a site:
    // getting him out is the one thing that can be done about him.
    function remove(ctx, day, workerId) {
        const now = layout(ctx, day);
        const from = now.where[workerId];
        if (!from) return null;
        now.cars[from.vehicle][from.n] = null;
        return tripsOf(ctx, now.cars);
    }

    // ------------------------------------------------------------------ validate
    //
    // Returns [{code, vehicle?, worker?, n?}] for a plan AS IT IS STORED. The words live
    // with the screen, not here, and the screen shows at most one calm line per car - a
    // man seated who has no site today, or passengers with nobody in the driver's seat.
    // The rest (a man in two vehicles, more men than seats, a seat number the vehicle
    // does not have) are what `layout` repairs by drawing; they are still named here so
    // a stored plan can be asked what is wrong with it.
    function validate(ctx, day) {
        const issues = [];
        const workers = byId(ctx.workers);
        const vehicles = byId(ctx.vehicles);
        const seen = Object.create(null);
        ctx.vehicles.forEach(v => {
            const trip = day.trips[v.id];
            if (!trip) return;
            const all = occupants(trip);
            if (all.length === 0) return;
            if (day.unavailable[v.id]) issues.push({ code: 'vehicleUnavailable', vehicle: v.id });
            if (!trip.driver) issues.push({ code: 'noDriver', vehicle: v.id });
            if (all.length > v.seats) issues.push({ code: 'overCapacity', vehicle: v.id, n: all.length - v.seats });
            all.forEach(id => {
                if (seen[id]) issues.push({ code: 'twice', vehicle: v.id, worker: id });
                seen[id] = true;
                if (!workers[id]) {
                    issues.push({ code: 'unknownWorker', vehicle: v.id, worker: id });
                    return;
                }
                if (!ctx.attendance[id]) issues.push({ code: 'notWorking', vehicle: v.id, worker: id });
                else if (day.status[id]) issues.push({ code: 'hasStatus', vehicle: v.id, worker: id });
            });
            const used = Object.create(null);
            Object.keys(trip.seats || {}).forEach(id => {
                const n = trip.seats[id];
                const bad = (trip.passengers || []).indexOf(id) === -1
                    || !(Number.isInteger(n) && n >= 2 && n <= v.seats) || used[n];
                used[n] = true;
                if (bad) issues.push({ code: 'badSeat', vehicle: v.id, worker: id });
            });
        });
        Object.keys(day.trips).forEach(vehicleId => {
            if (!vehicles[vehicleId] && occupants(day.trips[vehicleId]).length) {
                issues.push({ code: 'unknownVehicle', vehicle: vehicleId });
            }
        });
        return issues;
    }

    return Object.freeze({ STATUSES, isRider, riders, occupants, tripSites, seatRows, layout, tripsOf, waiting,
        place, remove, validate });
}());
