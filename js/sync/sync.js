// Cloud sync, and it is optional by design: with no adapter connected the app behaves
// exactly as it always has, storing everything in this browser only. Nothing below runs
// until connect() is called.
//
// There are two very different write patterns here, and they need two different rules.
//
//   The seder, in the evening: all three people build it together, at the same time.
//   The record, after work:    generally one person enters what happened.
//
// Whole-document "newest wins" is fine for the second and WRONG for the first. Three
// people each sending the entire schedule means the last save silently erases the other
// two people's work - they would watch their own entries disappear with no error.
//
// So a local edit sends only the field it touched: days.<date>.<layer>.<workerId>.
// Two people assigning different workers write different paths and never collide. Two
// people editing the SAME worker on the same date is genuinely ambiguous, and there the
// later write wins - but that is one cell, not the whole evening's work.
//
// Whole-document replacement still exists for import and backup restore, where replacing
// everything is exactly what was asked for. It is a separate, explicit call.

const SYNC_DEVICE_KEY = 'farkad:deviceId';

// Stable per-browser id. Lets a device recognise the echo of its own write and lets the
// status line say which device last changed the schedule.
function syncDeviceId() {
    let id = Store.get(SYNC_DEVICE_KEY);
    if (!id) {
        id = 'd_' + Math.random().toString(36).slice(2, 10);
        Store.set(SYNC_DEVICE_KEY, id);
    }
    return id;
}

const FarkadSync = {
    adapter: null,
    status: 'off',       // off | connecting | synced | offline | error
    lastError: null,
    lastSyncedAt: null,
    pushDelayMs: 1200,

    _timer: null,
    _edits: new Map(),
    // Edits handed to the adapter and not yet acknowledged. They are out of _edits by
    // then, so without holding them here a snapshot arriving mid-send would take them off
    // the screen - the one moment a person is most likely to be looking at it.
    _inflight: new Map(),
    _stamp: null,

    // adapter: {
    //   update(patchByFieldPath) -> Promise   merge these fields, leave the rest alone
    //   save(wholeDocument)      -> Promise   replace everything
    //   subscribe(onSnapshot, onError)        -> unsubscribe
    // }
    connect(adapter) {
        this.adapter = adapter;
        this.setStatus('connecting');

        adapter.subscribe(
            snapshot => this.receive(snapshot),
            error => this.fail(error)
        );
    },

    disconnect() {
        this.adapter = null;
        clearTimeout(this._timer);
        this._timer = null;
        this._edits = new Map();
        this._inflight = new Map();
        this._stamp = null;
        this.setStatus('off');
    },

    setStatus(status, error) {
        this.status = status;
        this.lastError = error || null;
        if (status === 'synced') {
            this.lastSyncedAt = new Date();
        }
        updateSyncNotice();
    },

    fail(error) {
        console.error('Sync error:', error);
        this.setStatus('error', error);
    },

    // One changed field, e.g. days.2026-08-12.plan.w_03. Queued by path so that editing
    // the same worker twice before the flush sends one write, while edits to different
    // workers all survive.
    edit(path, value) {
        if (!this.adapter) return;

        this._edits.set(path, value);
        clearTimeout(this._timer);
        this._timer = setTimeout(() => this.flush(), this.pushDelayMs);
    },

    // Called by autoSaveSchedule. Carries no field paths, so it only refreshes the
    // stamp - the actual content went out through edit().
    onLocalChange(data) {
        if (!this.adapter) return;
        this._stamp = { updatedAt: data.updatedAt, updatedBy: data.updatedBy };
        clearTimeout(this._timer);
        this._timer = setTimeout(() => this.flush(), this.pushDelayMs);
    },

    flush() {
        clearTimeout(this._timer);
        this._timer = null;

        if (!this.adapter) return Promise.resolve();
        if (this._edits.size === 0 && !this._stamp) return Promise.resolve();

        const patch = {};
        this._edits.forEach((value, path) => { patch[path] = value; });
        if (this._stamp) {
            patch.updatedAt = this._stamp.updatedAt;
            patch.updatedBy = this._stamp.updatedBy;
        }

        const sent = this._edits;
        this._edits = new Map();
        this._inflight = sent;
        this._stamp = null;

        return Promise.resolve(this.adapter.update(patch))
            .then(() => {
                if (this._inflight === sent) this._inflight = new Map();
                if (this.status !== 'error') this.setStatus('synced');
            })
            .catch(error => {
                // Put the unsent edits back rather than dropping them. Anything written
                // since keeps priority, so a retry can never resurrect a stale value.
                sent.forEach((value, path) => {
                    if (!this._edits.has(path)) this._edits.set(path, value);
                });
                if (this._inflight === sent) this._inflight = new Map();
                this.fail(error);
            });
    },

    // Import and backup restore only. Replaces the entire remote document on purpose.
    replaceAll(data) {
        if (!this.adapter) return Promise.resolve();

        this._edits = new Map();
        this._inflight = new Map();
        this._stamp = null;

        return Promise.resolve(this.adapter.save(data))
            .then(() => this.setStatus('synced'))
            .catch(error => this.fail(error));
    },

    // An update arrived from the server - either another device wrote, or this is the
    // first read after connecting.
    //
    // The server document is the truth, because every write is a field-level merge into
    // it: it already contains everyone's edits, including this device's once they have
    // been sent. So it is adopted, and the edits still sitting in the queue here are
    // re-applied on top of it.
    //
    // It is deliberately NOT decided by comparing timestamps. Those stamps come from
    // three separate phones' clocks, and a device running a few minutes fast would judge
    // every incoming snapshot "older than mine" and quietly stop showing the other two
    // people's work - with no error, and nothing on screen to suggest it.
    receive(raw) {
        // A malformed document must not wipe a good local schedule, so it is normalised
        // and sanity-checked before it is allowed anywhere near State.
        if (!raw || typeof raw !== 'object' || !Array.isArray(raw.workers)) {
            this.fail(new Error('remote document is not a schedule'));
            return;
        }

        const remote = normaliseSchedule(raw);

        // A document nobody has ever written to - a project connected for the first time.
        // Adopting it would empty this device to match an empty cloud.
        if (!remote.updatedAt) {
            this.setStatus('synced');
            if (this._edits.size > 0) this.scheduleFlush();
            return;
        }

        // This device's own write, echoed back.
        if (remote.updatedAt === State.schedule.updatedAt) {
            this.setStatus('synced');
            return;
        }

        // Keep what was on screen, so an unexpected remote change is recoverable.
        Store.set('scheduleData:v2backup', JSON.stringify(State.schedule));

        State.schedule = remote;
        this.reapplyPending(State.schedule);

        // persist, not save: save() would re-stamp the document as this device's, at this
        // device's clock, which is exactly the stamp everything else is compared against.
        State.persist();
        if (typeof render === 'function') render();
        this.setStatus('synced');

        if (this._edits.size > 0) this.scheduleFlush();
    },

    // Edits typed here in the last second or so, or queued after a failed send. They are
    // held as (path, value) pairs, so putting them back on top of a freshly adopted
    // document is a matter of writing each one in again - otherwise the person watches
    // what they just entered disappear when somebody else's change arrives.
    reapplyPending(schedule) {
        // In-flight first, queued second: a path edited again while the first send was
        // still open must end up with the newer value.
        const pending = new Map(this._inflight);
        this._edits.forEach((value, path) => pending.set(path, value));

        pending.forEach((value, path) => {
            const parts = path.split('.');

            if (parts.length === 4 && parts[0] === 'days') {
                const [, date, layer, workerId] = parts;
                if (!schedule.days[date]) schedule.days[date] = { plan: {}, actual: {} };
                if (!schedule.days[date][layer]) schedule.days[date][layer] = {};
                schedule.days[date][layer][workerId] = value;
                return;
            }

            // Advances travel as advances.<id>, two segments. Skipping them here made a
            // just-typed advance vanish the moment another phone's snapshot arrived -
            // exactly the class of loss this function exists to prevent. A null value is
            // a deletion in flight and stays a deletion.
            if (parts.length === 2 && parts[0] === 'advances') {
                schedule.advances = schedule.advances || {};
                if (value === null) delete schedule.advances[parts[1]];
                else schedule.advances[parts[1]] = value;
            }
        });
    },

    scheduleFlush() {
        clearTimeout(this._timer);
        this._timer = setTimeout(() => this.flush(), this.pushDelayMs);
    }
};

// One line under the board covering both questions the manager actually has: where the
// The two storage failures - blocked, and full - are the only states where a change the
// person just made is NOT written down. That cannot be a grey line under the fold, below
// two fixed bottom bars: it goes in a banner at the top, with the one button that turns
// the situation around. `text` of null clears it.
function showStorageBanner(text) {
    const banner = document.getElementById('storageBanner');
    if (!banner) return;

    if (!text) { banner.style.display = 'none'; return; }
    if (banner.dataset.text === text) return;   // already saying exactly this

    banner.dataset.text = text;
    clear(banner);
    banner.appendChild(el('span', null, text));
    banner.appendChild(button('💾 שמור גיבוי', 'btn-secondary', () => exportBackup()));
    banner.style.display = '';
}

// data lives, and whether the other device is seeing the same thing.
function updateSyncNotice() {
    const notice = document.getElementById('storageNotice');
    if (!notice) return;

    // Data held only in memory must never look like data that survives a refresh.
    if (typeof Store !== 'undefined' && !Store.available) {
        const text = '⚠️ הדפדפן חוסם שמירה. הנתונים יימחקו ברענון - ייצא קובץ גיבוי.';
        notice.textContent = text;
        showStorageBanner(text);
        return;
    }

    // Full is not blocked: what is already saved is safe, but the last change is not.
    if (typeof Store !== 'undefined' && Store.full) {
        const text = '⚠️ אין מקום פנוי במכשיר והשינוי האחרון לא נשמר - ייצא קובץ גיבוי ופנה מקום.';
        notice.textContent = text;
        showStorageBanner(text);
        return;
    }

    showStorageBanner(null);

    const messages = {
        off: 'הנתונים נשמרים במכשיר הזה בלבד.',
        connecting: 'מתחבר לענן…',
        synced: 'מסונכרן בין המכשירים.',
        offline: 'אין חיבור - השינויים יישלחו כשהחיבור יחזור.',
        error: 'שגיאת סנכרון - הנתונים שמורים במכשיר הזה.'
    };

    let text = messages[FarkadSync.status] || messages.off;

    if (FarkadSync.status === 'synced' && FarkadSync.lastSyncedAt) {
        text += ` עודכן: ${FarkadSync.lastSyncedAt.toLocaleTimeString('he-IL')}`;
    }

    notice.textContent = text;
}
