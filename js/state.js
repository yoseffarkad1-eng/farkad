// The one place the schedule lives while the app is open, and the one place that decides
// when it is written down.
//
// v1 data is never modified. It is read, migrated into a new key, and left exactly where
// it was - so if anything about the migration turns out to be wrong, the original is
// still sitting there untouched.

const V1_KEY = 'scheduleData';
const V2_KEY = 'scheduleData:v2';
const ISSUES_KEY = 'scheduleData:migrationIssues';
// Where an unreadable v2 blob is put aside before anything overwrites it. It is the most
// recent copy of the record that exists, and a damaged one is still worth far more than
// no copy: the days inside it are plain text and can be read out by hand.
const V2_DAMAGED_KEY = 'scheduleData:v2damaged';

const State = {
    schedule: emptySchedule(),
    date: null,          // the day being viewed, YYYY-MM-DD
    // Always 'actual'. The seder is sent on WhatsApp and never lived comfortably in
    // here; the app records what HAPPENED, one thing only. The field itself stays -
    // the data model, the sync paths and old documents all still carry two layers,
    // and reading them must keep working.
    layer: 'actual',
    migrationIssues: [],

    load() {
        let damaged = false;
        const v2 = Store.get(V2_KEY);
        if (v2) {
            try {
                this.schedule = normaliseSchedule(JSON.parse(v2));
                this.migrationIssues = readIssues();
                return { migrated: false };
            } catch (error) {
                console.error('v2 schedule unreadable, falling back to v1:', error);
                // Set it aside BEFORE the fallback below, which ends in save() and would
                // otherwise overwrite the newest copy of the record with data from before
                // the migration - destroying the damaged blob and every day added since.
                Store.set(V2_DAMAGED_KEY, v2, { optional: true });
                damaged = true;
            }
        }

        const v1 = Store.get(V1_KEY);
        if (!v1) {
            this.schedule = emptySchedule();
            return { migrated: false, damaged };
        }

        let result;
        try {
            result = migrateV1(JSON.parse(v1));
        } catch (error) {
            console.error('v1 schedule unreadable:', error);
            this.schedule = emptySchedule();
            return { migrated: false, failed: true, damaged };
        }

        this.schedule = result.schedule;
        this.migrationIssues = result.issues;
        writeIssues(result.issues);
        this.save({ silent: true });

        return { migrated: true, issues: result.issues, damaged };
    },

    save(options) {
        this.schedule.updatedAt = new Date().toISOString();
        this.schedule.updatedBy = syncDeviceId();
        Store.set(V2_KEY, JSON.stringify(this.schedule));

        if (!(options && options.silent) && typeof FarkadSync !== 'undefined') {
            FarkadSync.onLocalChange(this.schedule);
        }
    },

    // A roster change: who exists, their rates, and the order they are read in. Saved and
    // SENT - a roster edit that only saved locally was overwritten by the next snapshot
    // from another phone, taking any days recorded against a new worker with it.
    commitRoster() {
        this.save();
        if (typeof FarkadSync !== 'undefined' && FarkadSync.editRoster) {
            FarkadSync.editRoster(this.schedule);
        }
    },

    // Every mutation goes through here: it writes locally and hands the sync layer the
    // single field path that changed, which is what keeps three people editing the same
    // evening from overwriting one another.
    commit(change) {
        this.save();
        if (change && change.path && typeof FarkadSync !== 'undefined') {
            FarkadSync.edit(change.path, change.value);
        }
        render();
    },

    // Writes what is in memory to the device WITHOUT re-stamping it. Used when a snapshot
    // that came from another device is adopted: stamping it here would relabel their work
    // as this device's, at this device's clock - and that stamp is what every later
    // comparison is made against.
    persist() {
        Store.set(V2_KEY, JSON.stringify(this.schedule));
    },

    // A bulk edit - copying a whole day across - saves once and renders once, but still
    // sends every path it touched. Saving alone only pushes a timestamp, so a copy that
    // skipped this landed on this device and nowhere else: the other two would keep
    // building the evening against a day they could not see.
    commitMany(changes) {
        this.save();
        if (typeof FarkadSync !== 'undefined') {
            changes.forEach(change => {
                if (change && change.path) FarkadSync.edit(change.path, change.value);
            });
        }
        render();
    },

    worker(id) {
        return this.schedule.workers.find(w => w.id === id) || null;
    },

    place(id) {
        return this.schedule.places.find(p => p.id === id) || null;
    },

    activeWorkers() {
        return this.schedule.workers.filter(w => w.active !== false);
    },

    activePlaces() {
        return this.schedule.places.filter(p => p.active !== false);
    },

    // Who to draw on a given day: the current crew, plus anyone archived who has
    // something recorded on that date. Otherwise the day somebody leaves, every past day
    // they worked loses their row - and with it any way to see or correct what they did,
    // while the payroll report keeps counting it.
    workersForDay(date, layer) {
        return this.schedule.workers.filter(worker => {
            if (worker.active !== false) return true;
            return isAbsent(this.schedule, date, worker.id, layer) ||
                entriesFor(this.schedule, date, worker.id, layer).length > 0;
        });
    },

    // Everyone with no entry and no absence on the current day. This is the number that
    // matters most on screen: a worker nobody recorded is a worker nobody pays.
    unrecorded() {
        return this.activeWorkers().filter(worker => {
            if (isAbsent(this.schedule, this.date, worker.id, this.layer)) return false;
            return entriesFor(this.schedule, this.date, worker.id, this.layer).length === 0;
        });
    },

    absentToday() {
        return this.activeWorkers()
            .filter(worker => isAbsent(this.schedule, this.date, worker.id, this.layer));
    },

    nextWorkerId() {
        return newEntityId('w');
    },

    nextPlaceId() {
        return newEntityId('p');
    }
};

// Accepts anything shaped roughly right and fills in what is missing, so a document
// written by an older build - or a half-finished remote write - cannot crash the app.
function normaliseSchedule(raw) {
    const schedule = emptySchedule();
    if (!raw || typeof raw !== 'object') return schedule;

    // The roster is read from the per-entity form when the document has one, and from
    // the plain arrays otherwise. Both shapes exist on purpose: the arrays are what a
    // device still on an older build writes and reads, and adopting a document written
    // by one of those must not empty the roster.
    const roster = (raw.roster && typeof raw.roster === 'object') ? raw.roster : null;
    const rawWorkers = (roster && roster.workers && typeof roster.workers === 'object')
        ? rosterList(roster.workers, roster.workerOrder)
        : raw.workers;
    const rawPlaces = (roster && roster.places && typeof roster.places === 'object')
        ? rosterList(roster.places, roster.placeOrder)
        : raw.places;

    schedule.workers = (Array.isArray(rawWorkers) ? rawWorkers : [])
        .filter(w => w && w.id)
        .map(w => ({
            id: String(w.id),
            name: String(w.name || ''),
            idNumber: String(w.idNumber || ''),
            phone: String(w.phone || ''),
            // Pay rates. Stored as numbers so a blank stays 0 rather than becoming the
            // string "0" and quietly multiplying to nothing.
            dailyRate: Number(w.dailyRate) || 0,
            hourlyRate: Number(w.hourlyRate) || 0,
            active: w.active !== false
        }));

    schedule.places = (Array.isArray(rawPlaces) ? rawPlaces : [])
        .filter(p => p && p.id)
        .map(p => ({
            id: String(p.id),
            name: String(p.name || ''),
            active: p.active !== false
        }));

    const days = (raw.days && typeof raw.days === 'object') ? raw.days : {};
    Object.keys(days).forEach(date => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
        const day = days[date] || {};
        schedule.days[date] = {
            plan: normaliseLayer(day.plan),
            actual: normaliseLayer(day.actual)
        };
    });

    // Advances arrive keyed by id. A null value is a deletion another device sent and
    // must not come back as a record; anything without a worker or a date cannot be
    // placed in an account and is dropped rather than counted against the wrong one.
    const advances = (raw.advances && typeof raw.advances === 'object') ? raw.advances : {};
    Object.keys(advances).forEach(id => {
        const item = advances[id];
        if (!item || typeof item !== 'object') return;
        if (!item.workerId || !/^\d{4}-\d{2}-\d{2}$/.test(String(item.date))) return;
        schedule.advances[id] = {
            id: String(id),
            workerId: String(item.workerId),
            date: String(item.date),
            amount: Number(item.amount) || 0,
            note: String(item.note || '')
        };
    });

    schedule.updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : null;
    schedule.updatedBy = typeof raw.updatedBy === 'string' ? raw.updatedBy : null;
    return schedule;
}

function normaliseLayer(side) {
    const out = {};
    if (!side || typeof side !== 'object') return out;

    Object.keys(side).forEach(workerId => {
        const record = side[workerId];
        if (!record || typeof record !== 'object') return;

        const entries = (Array.isArray(record.entries) ? record.entries : [])
            .filter(entry => entry && entry.placeId)
            .map(entry => makeEntry(entry.placeId, entry.rate, entry.extraHours));

        out[workerId] = record.absent ? { absent: true, entries: [] } : { entries };
    });

    return out;
}

function readIssues() {
    try {
        const raw = Store.get(ISSUES_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

function writeIssues(issues) {
    Store.set(ISSUES_KEY, JSON.stringify(issues || []));
}

// By identity, not by position: the list is rebuilt on every render, and an index
// captured when the card was drawn can point at a different issue by the time an answer
// comes back from a dialog.
function dismissIssue(issue) {
    const index = State.migrationIssues.indexOf(issue);
    if (index === -1) return;
    State.migrationIssues.splice(index, 1);
    writeIssues(State.migrationIssues);
}
