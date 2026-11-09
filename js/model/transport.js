// הסעות (v171): who rides to work in which vehicle - the pure half.
//
// No DOM, no storage, no clock, no randomness. The same input gives the same plan, byte
// for byte, and nothing here mutates what it is handed: a suggestion the person cannot
// reproduce is a suggestion he cannot argue with, and a planner that edits its input
// has changed the draft before anybody accepted anything.
//
// THIS IS NOT THE RETIRED VEHICLES FEATURE, and shares nothing with it. That one
// (js/model/schema.js: the `vehicles` flag, ids `v_NN`, `vehicleRuns`, the «רכבים» panel)
// pays the OWNER of a vehicle and is part of payroll. This one seats men in cars, is kept
// in a store of its own on one phone (js/ui/transport.js), and cannot reach a pay sheet:
// it never reads a rate and never writes the record. Its vehicles are `tv_…`.
//
//   ctx = { workers:  [{id, name, area, canDrive, drives: 'all' | [vehicleId]}],   roster order
//           vehicles: [{id, name, seats, rows?: [2,2,2,3]}],                        inventory order
//           sites:    [{id, name}],
//           areas:    [{id, name}],                                                 pickup areas
//           attendance: {workerId: siteId} }      READ from the day record, never written
//   day = { unavailable: {vehicleId: true},
//           status: {workerId: 'private' | 'contractor' | 'other'},   absent = rides with us
//           trips: {vehicleId: {driver, passengers: [], area, locked, seats: {workerId: n}}},
//           workerLocks: {workerId: true} }
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
    function clone(value) { return JSON.parse(JSON.stringify(value)); }

    // Tuples compared left to right. The last element is always a unique index, so two
    // candidates never tie and the order of the input lists is the only tie-breaker -
    // which is what makes two runs the same bytes.
    function lessThan(a, b) {
        for (let i = 0; i < a.length; i += 1) {
            if (a[i] < b[i]) return true;
            if (a[i] > b[i]) return false;
        }
        return false;
    }
    function best(candidates, key) {
        let winner = null;
        let winnerKey = null;
        candidates.forEach(candidate => {
            const k = key(candidate);
            if (winner === null || lessThan(k, winnerKey)) { winner = candidate; winnerKey = k; }
        });
        return winner;
    }

    // The owner decides per worker who may drive, and which vehicles. Anything short of
    // an explicit yes is a no: a man put behind a wheel by a missing field is the one
    // mistake here that is not about a seat.
    function mayDrive(worker, vehicle) {
        if (!worker || !vehicle || worker.canDrive !== true) return false;
        if (worker.drives === 'all') return true;
        return Array.isArray(worker.drives) && worker.drives.indexOf(vehicle.id) !== -1;
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
    function seatOf(day, workerId) {
        let found = null;
        Object.keys(day.trips).forEach(vehicleId => {
            if (found === null && occupants(day.trips[vehicleId]).indexOf(workerId) !== -1) found = vehicleId;
        });
        return found;
    }

    // The seats a passenger can be given, 2..n - seat 1 is the driver's. Each with where
    // it is: { n, row, place, kind }.
    //   - a vehicle with `rows` (the 9-seater: [2,2,2,3] - two in front, the driver one of
    //     them, then rows of two, two and three): 'front' for the seat beside the driver,
    //     'row' for the rest, numbered across the rows front to back;
    //   - a five-seater with none: two in front, three behind - 'front', 'rearRight',
    //     'rearMiddle', 'rearLeft';
    //   - anything else: 'number', and no claim about where the seat is.
    // `rows` that do not add up to the seats are not believed: a layout that disagrees
    // with the count would name a seat the vehicle does not have.
    function seatPlan(vehicle) {
        const seats = vehicle && Number.isInteger(vehicle.seats) ? vehicle.seats : 0;
        const rows = vehicle && Array.isArray(vehicle.rows)
            && vehicle.rows.every(n => Number.isInteger(n) && n > 0)
            && vehicle.rows.reduce((sum, n) => sum + n, 0) === seats && vehicle.rows[0] >= 2
            ? vehicle.rows : null;
        const out = [];
        if (rows) {
            let n = 0;
            rows.forEach((size, r) => {
                for (let place = 1; place <= size; place += 1) {
                    n += 1;
                    if (n === 1) continue;
                    out.push({ n, row: r + 1, place, kind: r === 0 ? 'front' : 'row' });
                }
            });
            return out;
        }
        if (seats === 5) {
            return [{ n: 2, row: 1, place: 2, kind: 'front' }, { n: 3, row: 2, place: 1, kind: 'rearRight' },
                { n: 4, row: 2, place: 2, kind: 'rearMiddle' }, { n: 5, row: 2, place: 3, kind: 'rearLeft' }];
        }
        for (let n = 2; n <= seats; n += 1) out.push({ n, row: 0, place: 0, kind: 'number' });
        return out;
    }

    // ------------------------------------------------------------------ suggest
    //
    // The owner's order of priorities: pickup area, destination site, who may drive,
    // capacity, convenience, less unnecessary travel. It does NOT try to use fewer
    // vehicles. Greedy, not optimal, and it knows no distances - said in the release note
    // rather than hidden behind a number.
    //
    // Returns { trips, unseated: [workerId], log: [{step, ...}] }.
    function suggest(ctx, day) {
        const W = indexOf(ctx.workers);
        const V = indexOf(ctx.vehicles);
        const S = indexOf(ctx.sites);
        const A = indexOf(ctx.areas);
        const workers = byId(ctx.workers);
        const vehicles = byId(ctx.vehicles);
        const trips = {};
        const placed = Object.create(null);
        const log = [];
        // A MAN WITH NO AREA IS A MAN WITH NO AREA, not a man the planner cannot see. The
        // list of areas starts empty on a new phone and the owner types his own; until he
        // has, every man's area is null - and an engine that walked only the named areas
        // opened no vehicle at all on the first evening. So "no area" (and an area that
        // has since been removed) is one more group, taken after the named ones.
        const areaOf = id => {
            const area = workers[id] ? workers[id].area : null;
            return area !== null && area !== undefined && A[area] !== undefined ? area : null;
        };
        const areaIds = ctx.areas.map(area => area.id).concat([null]);
        const areaRank = area => (area === null ? ctx.areas.length : A[area]);
        const siteOf = id => ctx.attendance[id];
        const siteRank = site => (S[site] === undefined ? 1e9 : S[site]);
        const rider = id => isRider(ctx, day, id);
        const free = (trip, vehicleId) => vehicles[vehicleId].seats - occupants(trip).length;
        const unplaced = () => riders(ctx, day).filter(id => !placed[id]);
        const freeVehicles = () => ctx.vehicles.filter(v => !day.unavailable[v.id] && !trips[v.id]);
        const keptSeats = (old, ids) => {
            const seats = {};
            ids.forEach(id => { if (old.seats && old.seats[id]) seats[id] = old.seats[id]; });
            return seats;
        };

        // STEP 0 - what is kept. A locked vehicle is kept exactly as it is, even when it is
        // wrong: validation says so, and suggest does not repair what a person froze. A
        // locked worker keeps his vehicle and his role. Everything else is cleared.
        ctx.vehicles.forEach(v => {
            const old = day.trips[v.id];
            if (!old) return;
            if (old.locked) {
                trips[v.id] = clone(old);
                occupants(old).forEach(id => { placed[id] = true; });
                log.push({ step: 0, kept: 'vehicle', vehicle: v.id });
                return;
            }
            if (day.unavailable[v.id]) return;
            const keep = id => day.workerLocks[id] && rider(id) && !placed[id];
            const driver = old.driver && keep(old.driver) ? old.driver : null;
            if (driver) placed[driver] = true;
            const passengers = (old.passengers || []).filter(id => {
                if (!keep(id)) return false;
                placed[id] = true;
                return true;
            });
            if (!driver && passengers.length === 0) return;
            trips[v.id] = { driver, passengers, area: driver ? areaOf(driver) : areaOf(passengers[0]),
                locked: false, seats: keptSeats(old, passengers) };
            log.push({ step: 0, kept: 'workers', vehicle: v.id });
        });

        // STEP 1 - a kept vehicle with no driver gets one: an unplaced rider who MAY drive
        // it, same pickup area first, then same destination, then roster order. When
        // nobody may, it stays without a driver and validation names it - an ineligible
        // man is never put behind the wheel to make a plan look whole.
        ctx.vehicles.forEach(v => {
            const trip = trips[v.id];
            if (!trip || trip.locked || trip.driver) return;
            const sites = tripSites(ctx, trip);
            const pick = best(unplaced().filter(id => mayDrive(workers[id], v)),
                id => [areaOf(id) === trip.area ? 0 : 1, sites.indexOf(siteOf(id)) !== -1 ? 0 : 1, W[id]]);
            if (!pick) { log.push({ step: 1, vehicle: v.id, driver: null }); return; }
            trip.driver = pick;
            placed[pick] = true;
            log.push({ step: 1, vehicle: v.id, driver: pick });
        });

        // STEP 2 - per pickup area, in the order of the area list: open vehicles until the
        // area's riders have seats. A driver leaves from his own home, so a vehicle's
        // pickup area is its driver's. Each round picks one (vehicle, driver) pair:
        //   a. the best-fitting vehicle: the smallest that seats everyone still uncovered,
        //      else the largest there is;
        //   b. among the men of this area who may drive it, the one with the fewest other
        //      vehicles he could drive (the man who can drive only one car gets it);
        //   c. then the one whose destination has the most of this area's riders;
        //   d. then roster order, then inventory order.
        areaIds.forEach(areaId => {
            for (;;) {
                const here = unplaced().filter(id => areaOf(id) === areaId);
                let spare = 0;
                Object.keys(trips).forEach(vehicleId => {
                    const trip = trips[vehicleId];
                    if (!trip.locked && trip.driver && trip.area === areaId) spare += free(trip, vehicleId);
                });
                const need = here.length - spare;
                if (need <= 0) return;
                const vehiclesFree = freeVehicles();
                const pairs = [];
                here.forEach(id => {
                    const options = vehiclesFree.filter(v => mayDrive(workers[id], v));
                    const group = here.filter(other => siteOf(other) === siteOf(id)).length;
                    options.forEach(v => pairs.push({ driver: id, vehicle: v, flex: options.length, group }));
                });
                const pick = best(pairs, p => {
                    const fit = p.vehicle.seats >= need ? p.vehicle.seats : 1000 - p.vehicle.seats;
                    return [fit, p.flex, -p.group, W[p.driver], V[p.vehicle.id]];
                });
                if (!pick) return;
                trips[pick.vehicle.id] = { driver: pick.driver, passengers: [], area: areaId, locked: false, seats: {} };
                placed[pick.driver] = true;
                log.push({ step: 2, area: areaId, vehicle: pick.vehicle.id, driver: pick.driver, need });
            }
        });

        // Seats a list of riders into the best open vehicle, as many as fit; returns the rest.
        function seatGroup(ids, site, candidateTrips, step) {
            const rest = ids.slice();
            while (rest.length > 0) {
                const open = candidateTrips().filter(vehicleId => {
                    const trip = trips[vehicleId];
                    return !trip.locked && trip.driver && free(trip, vehicleId) > 0;
                });
                const target = best(open, vehicleId => {
                    const trip = trips[vehicleId];
                    const sites = tripSites(ctx, trip);
                    const room = free(trip, vehicleId);
                    return [sites.indexOf(site) !== -1 ? 0 : 1,    // already going to this site
                        room >= rest.length ? 0 : 1,               // the whole group fits
                        sites.length,                              // fewer destinations
                        -room, V[vehicleId]];
                });
                if (!target) break;
                const n = Math.min(free(trips[target], target), rest.length);
                rest.splice(0, n).forEach(id => {
                    trips[target].passengers.push(id);
                    placed[id] = true;
                });
                log.push({ step, vehicle: target, site, seated: n });
            }
            return rest;
        }
        function siteGroups(ids) {
            const groups = Object.create(null);
            ids.forEach(id => { (groups[siteOf(id)] = groups[siteOf(id)] || []).push(id); });
            return Object.keys(groups)
                .sort((a, b) => (groups[b].length - groups[a].length) || (siteRank(a) - siteRank(b)))
                .map(site => ({ site, ids: groups[site] }));
        }

        // STEP 3 - passengers into the vehicles of THEIR OWN pickup area, one destination
        // group at a time, the largest group first, so men going to one site ride together.
        areaIds.forEach(areaId => {
            const here = unplaced().filter(id => areaOf(id) === areaId);
            siteGroups(here).forEach(group => {
                seatGroup(group.ids, group.site,
                    () => Object.keys(trips).filter(vehicleId => trips[vehicleId].area === areaId)
                        .sort((a, b) => V[a] - V[b]), 3);
            });
        });

        // STEP 4 - whoever is left (his area had no driver, or no seats) takes a free seat
        // in any vehicle, one already going to his site first. Area, then site, then roster.
        function leftovers() {
            const left = unplaced().sort((a, b) => (areaRank(areaOf(a)) - areaRank(areaOf(b)))
                || (siteRank(siteOf(a)) - siteRank(siteOf(b))) || (W[a] - W[b]));
            left.forEach(id => {
                if (placed[id]) return;
                seatGroup([id], siteOf(id), () => Object.keys(trips).sort((a, b) => V[a] - V[b]), 4);
            });
        }
        leftovers();

        // STEP 5 - men still without a seat while a vehicle stands free: an eligible man
        // riding as an unlocked passenger is moved to drive it (one sharing a destination
        // with the men left behind first), and step 4 runs again. One vehicle per round,
        // so it ends.
        for (;;) {
            const left = unplaced();
            if (left.length === 0) break;
            const leftSites = left.map(siteOf);
            const options = [];
            freeVehicles().forEach(v => {
                Object.keys(trips).forEach(vehicleId => {
                    const trip = trips[vehicleId];
                    if (trip.locked) return;
                    trip.passengers.forEach(id => {
                        if (day.workerLocks[id] || !mayDrive(workers[id], v)) return;
                        options.push({ driver: id, from: vehicleId, vehicle: v });
                    });
                });
            });
            const move = best(options, o => {
                const fit = o.vehicle.seats >= left.length + 1 ? o.vehicle.seats : 1000 - o.vehicle.seats;
                return [leftSites.indexOf(siteOf(o.driver)) !== -1 ? 0 : 1, fit, W[o.driver], V[o.vehicle.id]];
            });
            if (!move) break;
            const from = trips[move.from];
            from.passengers.splice(from.passengers.indexOf(move.driver), 1);
            if (from.seats) delete from.seats[move.driver];
            trips[move.vehicle.id] = { driver: move.driver, passengers: [], area: areaOf(move.driver),
                locked: false, seats: {} };
            placed[move.driver] = true;
            log.push({ step: 5, vehicle: move.vehicle.id, driver: move.driver, from: move.from });
            leftovers();
        }

        // Last: the passengers of every vehicle suggest filled are listed in roster order,
        // so the same plan always reads the same way. A locked vehicle keeps the order it
        // was left in.
        Object.keys(trips).forEach(vehicleId => {
            if (!trips[vehicleId].locked) trips[vehicleId].passengers.sort((a, b) => W[a] - W[b]);
        });
        return { trips, unseated: unplaced(), log };
    }

    // ------------------------------------------------------------------ validate
    //
    // Returns [{code, level: 'error' | 'warn', vehicle?, worker?, n?}]. An error makes the
    // plan incomplete; a warning never does. The words live with the screen, not here.
    function validate(ctx, day) {
        const issues = [];
        const workers = byId(ctx.workers);
        const vehicles = byId(ctx.vehicles);
        const A = indexOf(ctx.areas);
        const seen = Object.create(null);
        const known = area => (area !== null && area !== undefined && A[area] !== undefined ? area : null);
        ctx.vehicles.forEach(v => {
            const trip = day.trips[v.id];
            if (!trip) return;
            const all = occupants(trip);
            if (all.length === 0) return;
            if (day.unavailable[v.id]) issues.push({ code: 'vehicleUnavailable', level: 'error', vehicle: v.id });
            if (!trip.driver) issues.push({ code: 'noDriver', level: 'error', vehicle: v.id });
            else if (!mayDrive(workers[trip.driver], v)) {
                issues.push({ code: 'driverNotEligible', level: 'error', vehicle: v.id, worker: trip.driver });
            }
            if (all.length > v.seats) {
                issues.push({ code: 'overCapacity', level: 'error', vehicle: v.id, n: all.length - v.seats });
            }
            all.forEach(id => {
                if (seen[id]) issues.push({ code: 'twice', level: 'error', vehicle: v.id, worker: id });
                seen[id] = true;
                if (!workers[id]) {
                    issues.push({ code: 'unknownWorker', level: 'error', vehicle: v.id, worker: id });
                    return;
                }
                if (!ctx.attendance[id]) issues.push({ code: 'notWorking', level: 'error', vehicle: v.id, worker: id });
                else if (day.status[id]) issues.push({ code: 'hasStatus', level: 'error', vehicle: v.id, worker: id });
                // Only when both sides HAVE an area: a man whose area nobody has typed yet
                // is not "from another area", he is from an unknown one.
                else if (known(trip.area) && known(workers[id].area) && workers[id].area !== trip.area) {
                    issues.push({ code: 'otherArea', level: 'warn', vehicle: v.id, worker: id });
                }
            });
            const used = Object.create(null);
            Object.keys(trip.seats || {}).forEach(id => {
                const n = trip.seats[id];
                const bad = (trip.passengers || []).indexOf(id) === -1
                    || !(Number.isInteger(n) && n >= 2 && n <= v.seats) || used[n];
                used[n] = true;
                if (bad) issues.push({ code: 'badSeat', level: 'error', vehicle: v.id, worker: id });
            });
        });
        Object.keys(day.trips).forEach(vehicleId => {
            if (!vehicles[vehicleId] && occupants(day.trips[vehicleId]).length) {
                issues.push({ code: 'unknownVehicle', level: 'error', vehicle: vehicleId });
                // Seated in a vehicle the list no longer has is still seated: he is not
                // ALSO reported as having no seat, and a second vehicle holding him is twice.
                occupants(day.trips[vehicleId]).forEach(id => { seen[id] = true; });
            }
        });
        riders(ctx, day).forEach(id => {
            if (!seen[id]) issues.push({ code: 'noSeat', level: 'error', worker: id });
        });
        return issues;
    }
    function isComplete(issues) {
        return !issues.some(issue => issue.level === 'error');
    }

    // What a version is compared by: the trips that carry anybody, in inventory order,
    // and who is getting there another way. Locks are not part of the plan a driver is
    // told, so they are not part of this.
    function planSignature(ctx, day) {
        const known = Object.create(null);
        const carrying = ctx.vehicles.filter(v => {
            known[v.id] = true;
            return day.trips[v.id] && occupants(day.trips[v.id]).length > 0;
        }).map(v => v.id).concat(Object.keys(day.trips)
            .filter(id => !known[id] && occupants(day.trips[id]).length > 0).sort());
        return JSON.stringify(carrying.map(vehicleId => {
            const trip = day.trips[vehicleId];
            const seats = Object.keys(trip.seats || {}).sort().map(id => id + ':' + trip.seats[id]);
            return [vehicleId, trip.driver || '', (trip.passengers || []).slice(), trip.area || '', seats];
        }).concat([ctx.workers.filter(w => ctx.attendance[w.id] && day.status[w.id])
            .map(w => w.id + ':' + day.status[w.id])]));
    }

    // How many men sit somewhere else (or in another role) than in the earlier plan.
    function movedBetween(ctx, before, after) {
        const where = (day, id) => {
            const vehicleId = seatOf(day, id);
            return vehicleId ? vehicleId + (day.trips[vehicleId].driver === id ? ':d' : ':p') : '-';
        };
        return ctx.workers.filter(w => where(before, w.id) !== where(after, w.id)).length;
    }

    return Object.freeze({ STATUSES, mayDrive, isRider, riders, occupants, tripSites, seatOf, seatPlan,
        suggest, validate, isComplete, planSignature, movedBetween });
}());
