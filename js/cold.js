// ---------------------------------------------------------------- the phone's cold store
//
// What has LEFT the server's live document - the days of an archived month, the entries
// of an archived closure - is kept on the phone in IndexedDB instead of in the
// localStorage record, and laid back into memory at boot.
//
// WHY. Phases 5 and 6 shrink the server's document and keep every archived day and entry
// on the phone, so that no fold has a hole to read around. A phone's localStorage is
// five megabytes at two bytes a character: measured for 20 men closing fortnightly, the
// record and one copy of it stop fitting after about eight months and the record alone
// after about a year and a half (docs/payroll-closure.md, Phases 6 and 7). IndexedDB on
// the same phones holds hundreds of megabytes.
//
// WHAT THIS FILE OWNS:
//   - which things are cold (coldUnitsNamed): exactly what a row of `payIndex` or
//     `monthIndex` stands for, and nothing else. Both indexes only grow and what a row
//     stands for never changes, which is what makes every step here repeatable;
//   - the move: copy, read back, compare, mark - and only then may a write of the record
//     leave the unit out (law 3);
//   - what a write of the record may leave out (coldStripSet);
//   - laying units back into a record read off the disk (coldLayInto);
//   - the boot read, with a deadline, and what is still missing afterwards.
//
// WHAT IT MUST NEVER DO:
//   - treat a cold store that is absent, empty, evicted, slow or wrong as "nothing was
//     archived" (law 10). A unit that cannot be produced with the right digest is
//     MISSING: it is named, the phone says so, everything computed over the archive is
//     refused (State.coldRefusal), and the server's closed/ and months/ documents are the
//     way back - through closedGate (js/sync/closed.js), which already makes a document
//     whole for a phone that lacks detail;
//   - leave a unit out of the record on the strength of a mark alone. A mark says the
//     cold store held it ONCE; only a read-back in THIS session says it holds it now;
//   - open a database at all with the flag shut and no mark on the disk;
//   - be reachable by Store's reclaim ladder. It deletes restore points; nothing here is
//     one.
//
// A classic script like every other (index.html); `indexedDB` is read off the global
// scope so the Node suites can hand in a fake (tests/fake-indexeddb.mjs).

const COLD_DB = 'farkad-cold';
const COLD_DB_VERSION = 1;
const COLD_STORE = 'units';
// One small key per unit: "the cold store was read back holding this unit, with this
// digest". One key per unit, never a list - two tabs of one phone would otherwise
// read-modify-write the same value, and a mark lost that way is a unit this phone thinks
// it never moved.
const COLD_MARK_PREFIX = 'farkad:cold:u:';
// Written before the first mark and never removed: from then on this disk has units a
// build must read, whatever its flag says.
const COLD_ANY_KEY = 'farkad:cold:any';
// How long the first render's follow-up waits for a database that does not answer. It
// keeps trying after that; the deadline is only when the phone stops saying «טוען».
const COLD_OPEN_DEADLINE_MS = 4000;

// Every Hebrew word of this file, in one block. PROPOSED - the owner has not read them -
// and pinned word for word in tests/cold.test.mjs (law 6).
const COLD_TEXT = {
    loading: 'טוען את הארכיון השמור במכשיר…',
    missing: 'חלק מהרישום הישן שהועבר לארכיון לא נמצא כרגע במכשיר הזה. הדוחות, החשבונות והגיבוי לא יוצגו עד שהוא יושלם מהשרת, כדי שלא יוצג סכום חסר. רישום הימים ממשיך כרגיל.',
    missingOffline: 'אין כרגע קליטה. כשתהיה, המכשיר ישלים את החסר בעצמו.',
    refusedTitle: 'הארכיון במכשיר לא שלם',
    refusedMoney: 'אי אפשר לרשום עכשיו מקדמה, החזר או סגירת חשבון: חלק מהרישום הישן לא נמצא במכשיר, והחישוב היה יוצא חסר. הרישום לא שונה ודבר לא נשמר. המכשיר ישלים את החסר מהשרת כשתהיה קליטה.',
    missingDay: 'היום הזה שייך לחודש שהועבר לארכיון, והעותק שלו לא נמצא כרגע במכשיר. הוא לא ריק - הוא חסר.',
    deviceWhole: 'ארכיון במכשיר: שלם ({n} פריטים)',
    deviceMissing: 'ארכיון במכשיר: חסרים {n} פריטים מתוך {of}',
    deviceLoading: 'ארכיון במכשיר: בטעינה',
    deviceNone: 'ארכיון במכשיר: אין בדפדפן הזה אחסון נפרד, ולכן הכול נשמר באחסון הרגיל'
};

// PER RECORD since Phase 8 (coldOn, js/model/schema.js): the flag through the test seam,
// or the record this phone holds has been activated. Before the record is loaded there
// is nothing to move, and the answer is the flag's.
function coldWriterEnabled() {
    const schedule = (typeof State !== 'undefined' && State && State.schedule) ? State.schedule : null;
    return typeof coldOn === 'function' ? coldOn(schedule) === true
        : (typeof FARKAD_FLAGS !== 'undefined' && FARKAD_FLAGS.cold === true);
}

// Is there anything this build must read from the cold store, or may write to it?
function coldReaderActive() {
    if (coldWriterEnabled()) return true;
    try { return Store.durableGet(COLD_ANY_KEY) !== null; } catch (error) { return false; }
}

function coldIsRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function coldOwns(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
}

// A field path read strictly: own keys only, nothing through a prototype.
function coldReadAt(document, path) {
    let node = document;
    const parts = String(path).split('.');
    for (let i = 0; i < parts.length; i += 1) {
        if (!coldIsRecord(node) || !coldOwns(node, parts[i])) return undefined;
        node = node[parts[i]];
    }
    return node;
}

// Every unit a record's indexes name. A row this build cannot read names no unit here:
// closedGate already holds such a document as `broken`, loudly, and nothing of it is
// ever moved.
//
//   { key: 'm:2026-03', kind: 'month', month, row }
//   { key: 'c:<rowId>', kind: 'closure', id, row, paths }
function coldUnitsNamed(schedule) {
    const out = [];
    if (!coldIsRecord(schedule)) return out;
    if (typeof monthStoredIndex === 'function') {
        const months = monthStoredIndex(schedule);
        Object.keys(months.rows).forEach(month => {
            out.push({ key: 'm:' + month, kind: 'month', month, row: months.rows[month] });
        });
    }
    if (typeof paybookStoredIndex === 'function') {
        const closures = paybookStoredIndex(schedule);
        Object.keys(closures.rows).forEach(id => {
            out.push({ key: 'c:' + id, kind: 'closure', id, row: closures.rows[id],
                paths: paybookRowPaths(id, closures.rows[id]) });
        });
    }
    return out;
}

// How many days of each month a record holds - one pass, for every month question below.
function coldDayCounts(schedule) {
    const counts = {};
    const days = coldIsRecord(schedule) && coldIsRecord(schedule.days) ? schedule.days : {};
    Object.keys(days).forEach(date => {
        const month = String(date).slice(0, 7);
        counts[month] = (counts[month] || 0) + 1;
    });
    return counts;
}

// Does this record hold the unit - all of it? Cheap on purpose (asked on every save): a
// month by its count of days, a closure by every path being there. Whether the bytes are
// the RIGHT bytes is the digest's question, asked where a unit changes hands.
function coldUnitHeld(schedule, unit, counts) {
    if (unit.kind === 'month') {
        const have = counts || coldDayCounts(schedule);
        return (have[unit.month] || 0) === unit.row.n;
    }
    return unit.paths.every(path => coldReadAt(schedule, path) !== undefined);
}

// The unit as it lies in a record: the record's own objects, not copies.
function coldUnitValue(schedule, unit) {
    if (unit.kind === 'month') return { days: monthDaysOf(schedule, unit.month) };
    const entries = {};
    unit.paths.forEach(path => { entries[path] = coldReadAt(schedule, path); });
    return { entries };
}

// One way of naming a unit's content. A month's is its index row's own `h` when the
// content is right - the server's digest, so a cold copy is checked against the live
// document and not only against itself.
function coldDigest(unit, value) {
    if (unit.kind === 'month') return monthDigest(coldIsRecord(value && value.days) ? value.days : {});
    return monthHash(monthCanonical(coldIsRecord(value && value.entries) ? value.entries : {}));
}

// Is this value a whole copy of that unit? Shape first, digest second.
function coldValueProblem(unit, value, wantDigest) {
    if (!coldIsRecord(value)) return 'not a record';
    if (unit.kind === 'month') {
        if (!coldIsRecord(value.days)) return 'no days';
        const dates = Object.keys(value.days);
        if (dates.length !== unit.row.n) return 'another count of days';
        if (dates.some(date => String(date).slice(0, 7) !== unit.month)) return 'a day of another month';
        if (monthDigest(value.days) !== unit.row.h) return 'another digest than the index row';
        return '';
    }
    if (!coldIsRecord(value.entries)) return 'no entries';
    const held = Object.keys(value.entries).sort();
    const want = unit.paths.slice().sort();
    if (held.length !== want.length || held.some((path, at) => path !== want[at])) return 'other paths than the row stands for';
    if (held.some(path => value.entries[path] === undefined || value.entries[path] === null)) return 'an empty entry';
    if (typeof wantDigest === 'string' && coldDigest(unit, value) !== wantDigest) return 'another digest than the mark';
    return '';
}

function coldClone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

// Lay one unit into a record (raw, as parsed off the disk - before normaliseSchedule).
// Only where the record holds nothing: a unit never changes, so anything already there
// is the same thing.
function coldLayUnit(target, unit, value) {
    if (unit.kind === 'month') {
        if (!coldIsRecord(target.days)) target.days = {};
        Object.keys(value.days).forEach(date => {
            if (!coldOwns(target.days, date)) target.days[date] = coldClone(value.days[date]);
        });
        return;
    }
    Object.keys(value.entries).forEach(path => {
        if (coldReadAt(target, path) !== undefined) return;
        const parts = path.split('.');
        let node = target;
        for (let i = 0; i < parts.length - 1; i += 1) {
            if (!coldOwns(node, parts[i]) || !coldIsRecord(node[parts[i]])) {
                Object.defineProperty(node, parts[i], { value: {}, enumerable: true, writable: true, configurable: true });
            }
            node = node[parts[i]];
        }
        Object.defineProperty(node, parts[parts.length - 1], { value: coldClone(value.entries[path]),
            enumerable: true, writable: true, configurable: true });
    });
}

// The record without the units named in `keys` - a shallow copy down to the maps it
// takes from, never a deep clone of a record that is megabytes (this runs on every save).
// The same object when there is nothing to leave out.
function coldStrip(schedule, keys) {
    if (!keys || keys.length === 0) return schedule;
    const units = coldUnitsNamed(schedule).filter(unit => keys.indexOf(unit.key) !== -1);
    if (units.length === 0) return schedule;
    const out = Object.assign({}, schedule);
    const months = units.filter(unit => unit.kind === 'month').map(unit => unit.month);
    if (months.length > 0 && coldIsRecord(schedule.days)) {
        out.days = {};
        Object.keys(schedule.days).forEach(date => {
            if (months.indexOf(String(date).slice(0, 7)) === -1) out.days[date] = schedule.days[date];
        });
    }
    const copied = {};
    const own = (root, parts) => {
        // A private copy of each map on the way down, made once.
        let node = root;
        let trail = '';
        for (let i = 0; i < parts.length; i += 1) {
            if (!coldIsRecord(node[parts[i]])) return null;
            trail += '.' + parts[i];
            if (!copied[trail]) { node[parts[i]] = Object.assign({}, node[parts[i]]); copied[trail] = true; }
            node = node[parts[i]];
        }
        return node;
    };
    units.filter(unit => unit.kind === 'closure').forEach(unit => unit.paths.forEach(path => {
        const parts = path.split('.');
        const map = own(out, parts.slice(0, -1));
        if (map) delete map[parts[parts.length - 1]];
    }));
    return out;
}

const Cold = {
    // 'off'      nothing to read and nothing may be written: no database is opened
    // 'loading'  the boot read is in flight
    // 'ready'    the boot read finished (what is still missing is State.coldMissing())
    // 'slow'     the database has not answered within the deadline; it may yet
    // 'none'     this browser has no IndexedDB, or it refused to open: nothing moves
    state: 'off',
    // Unit keys this SESSION has read back from the cold store with the right digest.
    verified: {},
    // Unit key -> JSON text of the unit, for everything the cold store handed this
    // session - verified or not. The rescue file reads this (it is made synchronously,
    // inside a tap), and coldLayInto reads the verified ones.
    raw: {},
    // Why a unit could not be produced, by unit key. For ⋯ and for whoever debugs.
    problems: {},
    ready: null,
    // How long the boot waits for a database that does not answer before it stops
    // saying «טוען». A property so that a suite does not have to wait four seconds.
    deadlineMs: COLD_OPEN_DEADLINE_MS,
    _db: null,
    _moving: null,
    // Test seam: called with the name of each step of a move; may return a promise.
    // No shipped file sets it.
    step: null,

    factory() {
        try {
            const idb = typeof indexedDB !== 'undefined' ? indexedDB : null;
            return idb && typeof idb.open === 'function' ? idb : null;
        } catch (error) {
            return null;
        }
    },

    // Open, once. Rejects - never hangs for ever on its own account: the caller races it
    // with a deadline, and a connection that arrives late is still kept.
    open() {
        if (this._db) return Promise.resolve(this._db);
        if (this._opening) return this._opening;
        const factory = this.factory();
        if (!factory) return Promise.reject(new Error('no IndexedDB'));
        this._opening = new Promise((resolve, reject) => {
            let request;
            try { request = factory.open(COLD_DB, COLD_DB_VERSION); } catch (error) { reject(error); return; }
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(COLD_STORE)) db.createObjectStore(COLD_STORE);
            };
            request.onsuccess = () => {
                const db = request.result;
                // Another tab on a later build wants to upgrade: let it, and reopen on
                // the next use. Holding the connection would block that tab's boot.
                db.onversionchange = () => { try { db.close(); } catch (error) { /* closed */ } this._db = null; };
                this._db = db;
                resolve(db);
            };
            request.onerror = () => reject(request.error || new Error('IndexedDB would not open'));
            request.onblocked = () => { /* an older connection is open elsewhere; success follows when it closes */ };
        }).then(db => { this._opening = null; return db; }, error => { this._opening = null; throw error; });
        return this._opening;
    },

    // One transaction, answered only on `complete` - a write is not believed before the
    // transaction that made it has finished.
    tx(mode, work) {
        return this.open().then(db => new Promise((resolve, reject) => {
            let answer;
            let tx;
            try {
                tx = db.transaction([COLD_STORE], mode, mode === 'readwrite' ? { durability: 'strict' } : undefined);
            } catch (error) { this._db = null; reject(error); return; }
            tx.oncomplete = () => resolve(answer);
            tx.onabort = () => reject(tx.error || new Error('the cold store aborted the transaction'));
            tx.onerror = () => { /* onabort follows */ };
            try { work(tx.objectStore(COLD_STORE), value => { answer = value; }); } catch (error) { reject(error); }
        }));
    },

    readUnit(key) {
        return this.tx('readonly', (store, done) => {
            const request = store.get(key);
            request.onsuccess = () => done(request.result);
        });
    },

    readAll() {
        return this.tx('readonly', (store, done) => {
            const keys = store.getAllKeys();
            const values = store.getAll();
            keys.onsuccess = () => {
                values.onsuccess = () => {
                    const out = {};
                    keys.result.forEach((key, at) => { out[key] = values.result[at]; });
                    done(out);
                };
            };
        });
    },

    writeUnit(key, value) {
        return this.tx('readwrite', store => { store.put(value, key); });
    },

    mark(key) {
        try { return Store.durableGet(COLD_MARK_PREFIX + key); } catch (error) { return null; }
    },

    marks() {
        try {
            return Store.keys().filter(key => key.indexOf(COLD_MARK_PREFIX) === 0)
                .map(key => key.slice(COLD_MARK_PREFIX.length)).sort();
        } catch (error) {
            return [];
        }
    },

    // ------------------------------------------------------------ boot
    //
    // Called by State.load, synchronously; the reading itself is not. Returns the promise
    // that settles when the boot read has done everything it can for now.
    begin() {
        this.verified = {};
        this.problems = {};
        if (!coldReaderActive()) {
            this.state = 'off';
            this.ready = Promise.resolve('off');
            return this.ready;
        }
        if (!this.factory()) {
            this.state = 'none';
            this.ready = Promise.resolve('none').then(word => this.settled(word));
            return this.ready;
        }
        this.state = 'loading';
        let late = false;
        const deadline = new Promise(resolve => setTimeout(() => { late = true; resolve('slow'); }, this.deadlineMs));
        const reading = this.readAll().then(units => {
            this.absorb(units);
            // A database that answered after the deadline is still an answer.
            if (late) this.settled('ready');
            return 'ready';
        }, error => {
            this.problems['*'] = String((error && (error.name || error.message)) || error).slice(0, 120);
            if (late) this.settled('none');
            return 'none';
        });
        this.ready = Promise.race([reading, deadline]).then(word => this.settled(word));
        // For a suite (and for nobody else) that wants the late answer too.
        this.reading = reading;
        return this.ready;
    },

    // What the cold store handed over: kept raw for the rescue file, and judged.
    absorb(units) {
        Object.keys(units || {}).forEach(key => {
            let text = null;
            try { text = JSON.stringify(units[key]); } catch (error) { text = null; }
            if (typeof text === 'string') this.raw[key] = text;
        });
        const named = typeof State !== 'undefined' ? coldUnitsNamed(State.schedule) : [];
        named.forEach(unit => {
            if (!coldOwns(this.raw, unit.key)) return;
            let value = null;
            try { value = JSON.parse(this.raw[unit.key]); } catch (error) { value = null; }
            // ONLY AGAINST ITS MARK. A unit with no mark is a copy whose move was cut
            // short before the read-back was written down (found in Chromium, by closing
            // the page between the copy and the mark): the record still holds it, the
            // move makes the copy again and marks it. Believing it by its shape alone
            // would let a closure's entries be left out of the record on the strength of
            // a copy nobody ever compared.
            const mark = this.mark(unit.key);
            const problem = mark === null ? 'no mark' : coldValueProblem(unit, value, mark);
            if (problem === '') this.verified[unit.key] = true;
            else this.problems[unit.key] = problem;
        });
    },

    // The boot read is over (or late). Lay what verified into memory, say what is
    // missing, and start a move if this build makes them.
    settled(word) {
        this.state = word === 'none' ? 'none' : (word === 'slow' ? 'slow' : 'ready');
        if (typeof State !== 'undefined' && typeof State.coldRebuild === 'function') {
            try { State.coldRebuild(); } catch (error) { /* memory stays as it was; missing says so */ }
        }
        if (typeof render === 'function') { try { render(); } catch (error) { /* a screen */ } }
        if (typeof updateSyncNotice === 'function') { try { updateSyncNotice(); } catch (error) { /* a notice */ } }
        if (word === 'ready') this.moveSoon();
        return word;
    },

    // Lay every unit the cold store produced into a record just parsed off the disk -
    // and, failing that, from the memory this session already holds (`standing`): a unit
    // never changes, so a whole one in memory is always the right one.
    layInto(raw, standing) {
        if (!coldIsRecord(raw) || !coldReaderActive()) return raw;
        const counts = coldDayCounts(raw);
        let standingCounts = null;
        coldUnitsNamed(raw).forEach(unit => {
            if (coldUnitHeld(raw, unit, counts)) return;
            if (this.verified[unit.key] && coldOwns(this.raw, unit.key)) {
                try { coldLayUnit(raw, unit, JSON.parse(this.raw[unit.key])); return; } catch (error) { /* fall through */ }
            }
            if (!coldIsRecord(standing)) return;
            standingCounts = standingCounts || coldDayCounts(standing);
            if (!coldUnitHeld(standing, unit, standingCounts)) return;
            const value = coldUnitValue(standing, unit);
            if (coldValueProblem(unit, value) === '') coldLayUnit(raw, unit, value);
        });
        return raw;
    },

    // ------------------------------------------------------------ the move
    //
    // Every unit memory holds whole and this session has not read back from the cold
    // store: copy, read back, compare, mark. Then ONE write of the record, which leaves
    // out everything verified. Resolves to { moved, failed, dropped }.
    move() {
        if (this._moving) return this._moving;
        if (!coldWriterEnabled() || !this.factory() || typeof State === 'undefined') {
            return Promise.resolve({ moved: [], failed: [], dropped: false });
        }
        if (typeof farkadWritesBlocked === 'function' && farkadWritesBlocked()) {
            return Promise.resolve({ moved: [], failed: [], dropped: false });
        }
        const moved = [];
        const failed = [];
        const at = name => Promise.resolve(typeof this.step === 'function' ? this.step(name) : undefined);
        const counts = coldDayCounts(State.schedule);
        const todo = coldUnitsNamed(State.schedule).filter(unit =>
            !this.verified[unit.key] && coldUnitHeld(State.schedule, unit, counts));
        if (todo.length === 0 && !State.coldDropOwed()) {
            return Promise.resolve({ moved: [], failed: [], dropped: false });
        }
        const one = unit => {
            // Taken from memory NOW, and judged before it goes anywhere: a month must
            // have its row's digest, a closure every path its row stands for.
            const value = coldClone(coldUnitValue(State.schedule, unit));
            if (coldValueProblem(unit, value) !== '') {
                failed.push({ unit: unit.key, why: 'memory: ' + coldValueProblem(unit, value) });
                return Promise.resolve();
            }
            const digest = coldDigest(unit, value);
            return at('copy:' + unit.key)
                .then(() => this.writeUnit(unit.key, value))                     // THE COPY
                .then(() => at('copied:' + unit.key))
                .then(() => this.readUnit(unit.key))                             // READ BACK
                .then(back => {
                    const problem = coldValueProblem(unit, back, digest);        // COMPARE
                    if (problem !== '') throw new Error('read back: ' + problem);
                    return at('read:' + unit.key).then(() => back);
                })
                .then(back => {
                    // THE MARK. Not landed: the unit stays in the record, whole.
                    if (Store.durableGet(COLD_ANY_KEY) === null && !Store.setVerified(COLD_ANY_KEY, '1')) {
                        throw new Error('the mark could not be written');
                    }
                    if (!Store.setVerified(COLD_MARK_PREFIX + unit.key, digest)) {
                        Store.forget(COLD_MARK_PREFIX + unit.key);
                        throw new Error('the mark could not be written');
                    }
                    this.raw[unit.key] = JSON.stringify(back);
                    this.verified[unit.key] = true;
                    delete this.problems[unit.key];
                    moved.push(unit.key);
                    return at('marked:' + unit.key);
                })
                .catch(error => {
                    failed.push({ unit: unit.key, why: String((error && (error.name || error.message)) || error).slice(0, 120) });
                });
        };
        const chain = todo.reduce((before, unit) => before.then(() => one(unit)), Promise.resolve());
        this._moving = chain.then(() => at('drop')).then(() => {
            // THE DROP: the record is written without what was read back, and read back
            // itself as every record write is. Refused (a second tab moved the disk, a
            // blocked device): nothing is lost - the units are in both places until the
            // next write of the record.
            let dropped = false;
            if (moved.length > 0 || State.coldDropOwed()) {
                try { dropped = State.coldDrop() === true; } catch (error) { dropped = false; }
            }
            this._moving = null;
            if (typeof updateSyncNotice === 'function') { try { updateSyncNotice(); } catch (error) { /* a notice */ } }
            return at('dropped').then(() => ({ moved, failed, dropped }));
        }, error => { this._moving = null; throw error; });
        return this._moving;
    },

    // After boot and after a snapshot is adopted. Never awaited by a screen.
    moveSoon() {
        if (!coldWriterEnabled() || this._soon) return;
        this._soon = setTimeout(() => {
            this._soon = null;
            // Ask the browser not to evict this origin. Granted silently where the app
            // is installed; a refusal changes nothing here.
            try {
                if (typeof navigator !== 'undefined' && navigator.storage
                    && typeof navigator.storage.persist === 'function') navigator.storage.persist().catch(() => undefined);
            } catch (error) { /* not this browser */ }
            this.move().catch(() => undefined);
        }, 0);
    },

    // Another tab marked a unit: read it back here too, so this tab stops writing it
    // into the record again.
    noticeMark(unitKey) {
        if (!coldReaderActive() || this.verified[unitKey] || typeof State === 'undefined') return Promise.resolve(false);
        const unit = coldUnitsNamed(State.schedule).filter(one => one.key === unitKey)[0];
        if (!unit) return Promise.resolve(false);
        return this.readUnit(unitKey).then(back => {
            const mark = this.mark(unitKey);
            if (mark === null || coldValueProblem(unit, back, mark) !== '') return false;
            this.raw[unitKey] = JSON.stringify(back);
            this.verified[unitKey] = true;
            return true;
        }, () => false);
    },

    // What the rescue file carries of the cold store, and what it says about it.
    rescue() {
        const records = {};
        Object.keys(this.raw).sort().forEach(key => { records['cold:' + key] = this.raw[key]; });
        const named = typeof State !== 'undefined' ? coldUnitsNamed(State.schedule).map(unit => unit.key) : [];
        return { records, about: { state: this.state, unitsRead: Object.keys(this.raw).length,
            unitsNamed: named.length, verified: Object.keys(this.verified).sort(),
            missing: typeof State !== 'undefined' && State.coldMissing ? State.coldMissing() : [],
            problems: Object.assign({}, this.problems),
            note: 'cold:<unit> records are what this phone keeps in IndexedDB instead of in scheduleData:v2: '
                + 'm:<YYYY-MM> is the days of an archived month, c:<rowId> the entries of an archived closure, '
                + 'by field path. Lay them back at those paths to rebuild the whole record. A unit listed as '
                + 'missing is in neither place on this phone; the server\'s months/ and closed/ documents hold it.' } };
    }
};

// The line in ⋯ → מצב המכשיר. '' while no cold store is in use, which is every phone today.
function coldDeviceLine() {
    if (!coldReaderActive() || typeof State === 'undefined') return '';
    if (Cold.state === 'none') return COLD_TEXT.deviceNone;
    if (Cold.state === 'loading') return COLD_TEXT.deviceLoading;
    const named = coldUnitsNamed(State.schedule).length;
    const missing = State.coldMissing().length;
    if (missing > 0) return COLD_TEXT.deviceMissing.replace('{n}', String(missing)).replace('{of}', String(named));
    const kept = Object.keys(Cold.verified).length;
    return kept > 0 ? COLD_TEXT.deviceWhole.replace('{n}', String(kept)) : '';
}

// A mark written by another tab of this phone.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('storage', event => {
        const key = event && typeof event.key === 'string' ? event.key : '';
        if (key.indexOf(COLD_MARK_PREFIX) === 0 && event.newValue !== null) {
            Cold.noticeMark(key.slice(COLD_MARK_PREFIX.length)).catch(() => undefined);
        }
    });
}
