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

// The outbox. Every edit is written HERE, on the device, before it is called done - and
// it stays until the cloud says it has it.
//
// Holding the queue in memory was the quiet hole under everything else: a day recorded
// on a site with no signal lived in a Map, the app was closed the way a phone app always
// is, and the edit was gone. Nothing said so. The next morning the first snapshot from
// another phone was adopted whole, and the day was not in it - so the record went
// backwards, silently, at the one moment nobody was watching.
const OUTBOX_KEY = 'farkad:outbox';

// Where an active queue can live. The first is the ordinary one; the rest exist because a
// damaged queue is never overwritten, so recording after one has to continue somewhere
// else.
//
// A slot counts as ACTIVE only if it is absent, or present and readable as a queue. A
// damaged one never does.
//
// Bounded, and generously: twenty-five damaged queues on one device is not a storage
// problem any more, and an unbounded search would spin on a device that cannot write.
const OUTBOX_SLOTS = 25;

function outboxSlotKey(index) {
    return index === 0 ? OUTBOX_KEY : `farkad:outbox:active${index}`;
}

// A whole-document replacement - a backup restored, a file imported - that has not
// reached the cloud yet. Kept on disk for the same reason the outbox is: the person was
// TOLD it worked, and the state they asked for is now the only one they can see. If the
// save failed and nothing remembered that, the next snapshot from another phone would
// quietly put the old state back, on the device that asked for the restore.
const REPLACE_KEY = 'farkad:pendingReplace';

// Retry, backing off. A device on a building site loses signal for minutes at a time and
// gets it back without anyone touching anything, so the queue has to drain on its own -
// but a phone that retries every second for an hour is a phone with no battery.
const RETRY_FIRST_MS = 2000;
const RETRY_MAX_MS = 60000;

// Most fields in one write. Someone can record for a month before they ever sign in -
// that is the ordinary way this app gets adopted - and the whole month is then waiting
// in the outbox. Sent as a single update it is one enormous write against Firestore's
// per-write limits, and if it is refused, NONE of it lands. In batches the queue drains
// steadily and a refusal costs one batch, which is still on disk to retry.
const MAX_PATHS_PER_WRITE = 300;

// How long an open send may block the next one. Past this it is assumed hung rather than
// slow - a request that never settles must not be able to stop the queue draining.
const SEND_STUCK_MS = 30000;

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

// Writes one dotted field path into a plain object, the way Firestore merges one. Used
// to fold the pending patch into a document that is about to be created, so that the
// edits which triggered the creation are part of it rather than a second write that
// might not happen.
function writeFieldPath(target, path, value) {
    const parts = path.split('.');
    let node = target;

    for (let i = 0; i < parts.length - 1; i += 1) {
        const key = parts[i];
        if (!node[key] || typeof node[key] !== 'object') node[key] = {};
        node = node[key];
    }

    const last = parts[parts.length - 1];
    // A null is a deletion in flight and stays one, exactly as it would server-side.
    if (value === null) delete node[last];
    else node[last] = value;
}

const FarkadSync = {
    adapter: null,
    status: 'off',       // off | connecting | synced | offline | error
    lastError: null,
    lastSyncedAt: null,
    pushDelayMs: 1200,

    _timer: null,
    // path -> { value, seq }. The queue itself, mirrored to storage on every change.
    // Keyed by path because the value IS the whole record for that field: editing the
    // same worker twice before a flush is one pending write, not two.
    _outbox: new Map(),
    _seq: 0,
    // The seq numbers currently being sent. An entry is NOT removed from the outbox when
    // it goes out - only when the cloud acknowledges it, and only if the seq still
    // matches. An edit made while the send was open has a higher seq and stays.
    _sending: new Map(),
    _sendingSince: 0,
    _retryAt: 0,
    _retryTimer: null,
    _loaded: false,
    // Which key the live queue is written to. Not always OUTBOX_KEY: a damaged queue is
    // never overwritten, so recording continues in the next slot along. null until
    // loadOutbox has found a slot that is safe to write - and it stays null if there
    // isn't one, which is what stops a write landing on a damaged record.
    _activeKey: null,
    // The highest seq that is known to be inside a schedule successfully written to disk.
    // A journal entry at or below this is already in the record, so once the cloud has it
    // too there is nothing left for it to protect.
    _savedSeq: 0,
    // The queue on disk will not parse. Not the same as an empty queue, and the
    // difference is whether writing over it is allowed.
    outboxDamaged: false,
    // The last attempt to write the queue did not reach the disk. While this is true the
    // device cannot record what it would need to re-apply, so it must not accept a
    // snapshot that would overwrite local work.
    journalFailed: false,
    _stamp: null,
    // The roster as the cloud last showed it, keyed by id. What a roster edit is compared
    // against to work out which people actually changed.
    _remoteRoster: { workers: {}, places: {} },
    // A whole-document replacement that has not been acknowledged yet. Mirrored to disk.
    _replace: null,
    _replacing: false,
    // The pending-restore note on disk will not parse. Adopting anything from the cloud
    // while that is true would silently finish undoing a restore nobody can describe.
    replaceDamaged: false,

    // adapter: {
    //   update(patchByFieldPath) -> Promise   merge these fields, leave the rest alone
    //   save(wholeDocument)      -> Promise   replace everything
    //   subscribe(onSnapshot, onError)        -> unsubscribe
    // }
    // ------------------------------------------------------------ the outbox

    // Read back at load, before anything can ask what is pending. Corrupt contents are
    // kept, not discarded: they are the only record that those edits were ever made, and
    // a JSON file that will not parse can still be read by a person.
    loadOutbox() {
        if (this._loaded) return;
        this._loaded = true;

        // Walk the slots. The first that is empty or readable becomes the live queue;
        // every damaged one on the way is copied aside and left exactly where it is.
        //
        // _activeKey starts as null and is only ever set to a slot that PASSED. The first
        // version assigned it at the top of each turn, so with every slot damaged it came
        // to rest on the last one and wrote the new journal straight over raw bytes it
        // had just finished quarantining.
        this._activeKey = null;
        let raw = null;

        for (let i = 0; i < OUTBOX_SLOTS; i += 1) {
            const key = outboxSlotKey(i);
            const candidate = Store.durableGet(key);

            if (candidate === null) {
                this._activeKey = key;                      // free slot, nothing to load
                return;
            }

            try {
                JSON.parse(candidate);
                this._activeKey = key;                      // readable, this is the queue
                raw = candidate;
                break;
            } catch (error) {
                console.error('Queue unreadable, holding it:', key, error);
                this.outboxDamaged = true;
                Recovery.damaged(key, candidate,
                    `תור השליחה (עריכות שטרם נשלחו) לא נקרא: ${key}.`);
                // ...and on to the next slot, which is where recording may resume.
            }
        }

        if (this._activeKey === null) {
            // Every slot damaged. There is nowhere a journal can go, so there is no way
            // to record anything that could be re-applied - and no acknowledgement should
            // be able to make it look otherwise.
            Recovery.halt('outbox-slots',
                'לא נמצא מקום תקין לתור השליחה. הרישום מושבת עד שהנתונים הגולמיים ייוצאו.');
            return;
        }
        if (raw === null) return;

        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (error) {
            // NOT an empty queue. This is a list of edits that were made and never sent,
            // and the old behaviour - copy it optionally, carry on empty - meant the very
            // next edit wrote over the original. On a full device, which is where a
            // truncated write comes from in the first place, the copy had failed too, so
            // the recovery deleted the only trace of those edits.
            //
            // Recovery makes a verified copy, keeps the original exactly where it is, and
            // stops the app writing until somebody has been told.
            // Unreachable: the loop above already parsed it. Kept because a queue that
            // parses on one read and not the next is exactly the kind of thing that
            // should stop the app rather than be shrugged off.
            console.error('Queue unreadable on second read:', error);
            this.outboxDamaged = true;
            Recovery.damaged(this._activeKey, raw, 'תור השליחה לא נקרא.');
            return;
        }

        const items = (parsed && parsed.items) || {};
        Object.keys(items).forEach(path => {
            const item = items[path];
            if (!item || typeof item !== 'object') return;
            this._outbox.set(path, {
                value: item.value,
                seq: Number(item.seq) || 0,
                // Already in the cloud, still kept: it is only removed once the local
                // schedule holding it has also been written.
                sent: item.sent === true
            });
            this._seq = Math.max(this._seq, Number(item.seq) || 0);
        });
    },

    // NOT optional. A restore point the device has no room for is a loss the app can
    // live with; a pending edit it has no room for is the edit itself.
    saveOutbox() {
        this.loadOutbox();
        // No safe slot anywhere. Writing now would mean writing over a damaged record.
        if (!this._activeKey) return false;
        if (farkadWritesBlocked()) return false;

        const items = {};
        this._outbox.forEach((item, path) => { items[path] = item; });
        // The ACTIVE key, which is not the damaged one. Verified: an edit that did not
        // reach the disk is an edit the next session will not replay, and the caller has
        // to be able to find that out.
        const landed = Store.setVerified(this._activeKey,
            JSON.stringify({ seq: this._seq, items }));
        this.journalFailed = !landed;
        if (!landed && typeof updateSyncNotice === 'function') updateSyncNotice();
        return landed;
    },

    // Throw away what is in memory and read the journal back off the disk.
    //
    // A queue write that failed leaves entries in memory that no reopen will ever see.
    // Two things then go wrong if they are left there: a rollback replays them and puts
    // the refused edit straight back on screen, and the next flush SENDS them - telling
    // the other two phones about an edit this one has just told its owner did not happen.
    reloadJournal() {
        this._loaded = false;
        this._outbox = new Map();
        this._seq = 0;
        this._sending = new Map();
        this.loadOutbox();
    },

    // Every entry, applied to a schedule. This is the journal doing the job it exists for:
    // rebuilding edits at boot from the device alone, with no cloud anywhere.
    //
    // An entry that is still here has NOT been shown to be in a written schedule, so
    // re-applying it is right even when it has already reached the cloud. Each value is
    // the whole record for its field, so applying it twice is applying it once.
    replayJournal(schedule) {
        this.loadOutbox();
        [...this._outbox.entries()]
            .sort((a, b) => a[1].seq - b[1].seq)
            .forEach(([path, item]) => applyJournalEntry(schedule, path, item.value));
    },

    // The schedule has just been written to disk, so everything queued up to now is in it.
    // Told by State.save, because only State knows whether the write actually landed.
    markSaved() {
        this._savedSeq = this._seq;
        this.pruneJournal();
    },

    // An entry goes only when BOTH are true: the cloud has it, and a schedule containing
    // it has been written here. Either one alone leaves something that cannot be rebuilt.
    pruneJournal() {
        let changed = false;
        [...this._outbox.entries()].forEach(([path, item]) => {
            if (item.sent && item.seq <= this._savedSeq) {
                this._outbox.delete(path);
                changed = true;
            }
        });
        if (changed) this.saveOutbox();
    },

    // Waiting to be SENT. Not the journal's size: an entry the cloud already has is kept
    // until the local schedule holding it is written, and telling somebody it is waiting
    // to go out would be untrue.
    pendingCount() {
        this.loadOutbox();
        let waiting = 0;
        this._outbox.forEach(item => { if (!item.sent) waiting += 1; });
        return waiting;
    },

    // Which fields are waiting. Not used on screen - the count is what a person needs -
    // but it is what makes "is that edit still queued?" answerable from outside without
    // reaching into the queue itself.
    // Which key the live queue is under. Not always the obvious one: after a damaged
    // queue, recording continues in the next slot along, and the recovery export has to
    // carry whichever it is.
    activeOutboxKey() {
        this.loadOutbox();
        return this._activeKey;
    },

    pendingPaths() {
        this.loadOutbox();
        return [...this._outbox.keys()];
    },

    // Empty the queue. Only for a deliberate whole-document replacement, which supersedes
    // every pending field edit by definition.
    clearOutbox() {
        this.loadOutbox();
        this._outbox = new Map();
        this._sending = new Map();
        this.saveOutbox();
    },

    // Returns whether the entry is now on the disk. The caller needs to know: a queue
    // held only in memory rebuilds nothing after the app is closed.
    queue(path, value) {
        return this.queueBatch([{ path, value }]);
    },

    // Several entries, or one, as a SINGLE write.
    //
    // Chaining queue() looked equivalent and was not. Each call rewrites the whole queue,
    // so a bulk operation was a run of writes each larger than the last - and the second
    // one running out of room left the FIRST one durable. commitMany then reported that
    // nothing had happened while half of it was on the disk and came back at the next
    // open, which is worse than either outcome on its own: the app and the device
    // disagreeing about what was recorded, with the app the one that is wrong.
    //
    // So the batch is built on a copy, written once, and only adopted after the write has
    // been read back. Nothing partial can survive, because nothing partial is ever
    // written - there is no prefix to clean up afterwards.
    queueBatch(entries) {
        this.loadOutbox();
        if (!entries || entries.length === 0) return true;
        if (farkadWritesBlocked() || !this._activeKey) return false;

        // The copy. Entries are Map values shared with _outbox, so a shallow clone of
        // each is enough: nothing here mutates one in place.
        const candidate = new Map(this._outbox);
        let seq = this._seq;

        entries.forEach(entry => {
            if (!entry || !entry.path) return;
            seq += 1;
            // The same path twice in one batch is the later value, at the later seq -
            // set() on a Map replaces, so this falls out rather than needing a rule.
            candidate.set(entry.path, { value: entry.value, seq });
        });

        const items = {};
        candidate.forEach((item, path) => { items[path] = item; });
        const landed = Store.setVerified(this._activeKey, JSON.stringify({ seq, items }));

        this.journalFailed = !landed;
        if (!landed) {
            if (typeof updateSyncNotice === 'function') updateSyncNotice();
            return false;
        }

        // Adopted only now.
        this._outbox = candidate;
        this._seq = seq;
        return true;
    },

    // Called on acknowledgment, and only then. An entry whose seq has moved on was
    // edited again while the send was open, and that newer value has not been sent yet.
    acknowledge(sent) {
        let changed = false;
        sent.forEach((seq, path) => {
            const item = this._outbox.get(path);
            if (item && item.seq === seq && !item.sent) {
                // MARKED, not removed. The cloud has it; this device may still not, and
                // until a schedule containing it is written here the journal is the only
                // thing that can put it back. pruneJournal takes it when both are true.
                item.sent = true;
                changed = true;
            }
        });
        if (changed) {
            this.pruneJournal();
            this.saveOutbox();
        }
    },

    connect(adapter) {
        this.adapter = adapter;
        this.loadOutbox();
        this.setStatus('connecting');

        // A site loses signal for minutes at a time and gets it back with nobody
        // touching anything. Without this the queue waits for the next edit to notice.
        if (!this._watchingConnection && typeof window !== 'undefined'
            && typeof window.addEventListener === 'function') {
            this._watchingConnection = true;
            window.addEventListener('online', () => {
                this._retryAt = 0;
                if (this.pendingReplace()) this.retryReplace();
                else this.flush();
            });
        }

        adapter.subscribe(
            snapshot => this.receive(snapshot),
            error => this.fail(error)
        );

        // Anything left over from a previous session goes out as soon as there is
        // somewhere to send it. The replacement goes first: the queued field edits
        // belong to a state it is about to replace.
        if (this.pendingReplace()) this.retryReplace();
        else if (this.pendingCount() > 0) this.scheduleFlush();
    },

    disconnect() {
        this.adapter = null;
        this._archivedOn = null;
        clearTimeout(this._timer);
        clearTimeout(this._retryTimer);
        this._timer = null;
        this._retryTimer = null;
        this._sending = new Map();
        this._stamp = null;
        // The outbox and any pending replacement are deliberately NOT cleared. Signing
        // out, or the auth token expiring, must not be a way to lose edits that were
        // never sent - they are still true, and the next sign-in is where they go.
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
    // Returns whether the edit is now recorded somewhere that survives the app closing.
    edit(path, value) {
        // Queued whether or not there is a cloud. Returning early when no adapter was
        // connected is what made a week of local-only recording invisible to the sync
        // layer: the moment someone signed in, the first snapshot was adopted whole and
        // the week was not in it. An edit nobody can send yet is still an edit.
        const journalled = this.queue(path, value);
        if (!this.adapter) return journalled;

        clearTimeout(this._timer);
        this._timer = setTimeout(() => this.flush(), this.pushDelayMs);
        return journalled;
    },

    // One copy per day, kept where a deletion cannot follow it.
    //
    // Everything else here is a mirror: the schedule, the other two phones, and the local
    // restore points, which are only three deep and only as old as the last three times
    // THIS device was opened. A worker cleared by mistake on Sunday and noticed on
    // Wednesday is gone from all of them. This is the one place it is not.
    //
    // Written at most once a day, and by whichever device opens first - the earliest
    // state of the day is the one worth keeping, since the mistake has not happened yet.
    // A failure is swallowed on purpose: an archive that cannot be written must never be
    // the reason the evening's recording does not start.
    archiveDaily(schedule) {
        if (!this.adapter || !this.adapter.archive) return;
        if (!schedule || schedule.workers.length === 0) return;

        const key = todayStr();
        if (this._archivedOn === key) return;
        this._archivedOn = key;

        Promise.resolve(this.adapter.archive(key, cloudDocument(schedule))).catch(error => {
            // 'already-exists'/'permission-denied' here means another device got there
            // first, which is the intended outcome, not a fault worth reporting.
            console.info('Daily cloud copy not written:', error && error.code);
        });
    },

    archiveDates() {
        if (!this.adapter || !this.adapter.archiveDates) return Promise.resolve([]);
        return Promise.resolve(this.adapter.archiveDates()).catch(() => []);
    },

    archiveRead(key) {
        if (!this.adapter || !this.adapter.archiveRead) return Promise.resolve(null);
        return Promise.resolve(this.adapter.archiveRead(key));
    },

    // The roster - who exists, where they work, and what they are paid.
    //
    // It used to travel as two whole arrays, and an array cannot be merged element by
    // element: two phones each sending their own whole roster meant the second erased the
    // first one's new man. His days stayed in the document and his row left the report,
    // so a week of somebody's pay went missing with nothing on screen to say so.
    //
    // One path per person now, so two phones adding two people write two different
    // fields. Order is its own field, and last-write-wins on the order costs nothing -
    // the worst case is a list in somebody else's preferred order.
    //
    // Only what CHANGED is queued, measured against the last roster this device received
    // from the cloud. Sending everyone on every roster edit would let a device that has
    // not yet seen a rate change put its stale copy of that man back.
    //
    // The whole arrays are still sent alongside, and that is deliberate: a phone that has
    // not updated reads them and sees a correct roster. They can stop being written once
    // all three devices are past v71 - not before.
    editRoster(schedule) {
        // Collected, then written once. This is the longest chain of entries in the app -
        // one path per person, plus the order, plus the legacy array - and a partial
        // result here is the hardest kind to notice: a worker present but missing from
        // the order, or an order naming somebody who is not in the list.
        const batch = [];
        const put = (path, value) => batch.push({ path, value });

        [['workers', 'workerOrder'], ['places', 'placeOrder']].forEach(([kind, orderKey]) => {
            const known = this._remoteRoster[kind] || {};

            (schedule[kind] || []).forEach(item => {
                if (!item || !item.id) return;
                const before = known[item.id];
                if (before && JSON.stringify(before) === JSON.stringify(item)) return;
                put(`roster.${kind}.${item.id}`, item);
            });

            put(`roster.${orderKey}`,
                (schedule[kind] || []).filter(item => item && item.id).map(item => String(item.id)));
            put(kind, schedule[kind]);
        });

        const journalled = this.queueBatch(batch);
        if (journalled && this.adapter) this.scheduleFlush();
        return journalled;
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
        clearTimeout(this._retryTimer);
        this._retryTimer = null;

        if (!this.adapter) return Promise.resolve();
        this.loadOutbox();
        if (this.pendingCount() === 0 && !this._stamp) return Promise.resolve();
        // One send at a time, so a bad connection does not pile up a request per edit.
        //
        // Time-bounded on purpose. A request that never settles - a hung socket, an
        // adapter that returns a promise nobody resolves - must not wedge the queue for
        // the rest of the session. Correctness does not rest on this lock anyway: an
        // acknowledgment only removes a path whose seq still matches what that send
        // carried, so two overlapping sends cannot acknowledge each other's work.
        if (this._sending.size > 0 && Date.now() - this._sendingSince < SEND_STUCK_MS) {
            return Promise.resolve();
        }

        // Oldest first, so a queue too big for one write drains in the order it was
        // made rather than leaving the earliest days for last.
        const patch = {};
        const sent = new Map();
        [...this._outbox.entries()]
            .filter(([, item]) => !item.sent)
            .sort((a, b) => a[1].seq - b[1].seq)
            .slice(0, MAX_PATHS_PER_WRITE)
            .forEach(([path, item]) => {
                patch[path] = item.value;
                sent.set(path, item.seq);
            });
        if (Object.keys(patch).length === 0 && !this._stamp) return Promise.resolve();

        // EVERY write carries a stamp, not only the ones a local save happened to queue.
        // A retry after a failed send used to go out with none - and the rules let it
        // through, because in an update request.resource.data is the MERGED document and
        // still holds the old timestamp. So the write landed and left the document
        // looking older than it is, which is the one thing the stamp exists to prevent.
        //
        // Falling back to the LOCAL schedule's stamp rather than to now(): that is the
        // truth about when this device last changed anything, and it is also what
        // receive() compares against to recognise the echo of its own write. A fresh
        // timestamp here would make every device adopt its own writes as if they had
        // come from somewhere else.
        // updatedBy is ALWAYS this device. It used to fall back to
        // State.schedule.updatedBy, which after adopting somebody else's snapshot is
        // THEIR id - so this device's next write went out signed with their name, and
        // carrying their timestamp. The other phone then saw its own stamp come back,
        // took the write for its own echo, and never showed the work. Two people
        // recording the same evening each stopped seeing the other's entries, silently.
        const stamp = this._stamp || {};
        patch.updatedAt = typeof stamp.updatedAt === 'string'
            ? stamp.updatedAt : new Date().toISOString();
        patch.updatedBy = syncDeviceId();

        this._sending = sent;
        this._sendingSince = Date.now();
        this._stamp = null;

        return Promise.resolve(this.adapter.update(patch))
            .catch(error => {
                // Not an edge case: this is the first write of every new project.
                if (error && error.code === 'not-found') return this.createDocument(patch);
                throw error;
            })
            .then(() => {
                // Only now. Up to this point the edits were on disk and would have been
                // replayed by the next session; from here the cloud is holding them.
                this.acknowledge(sent);
                this._sending = new Map();
                this._retryAt = 0;
                if (this.status !== 'error') this.setStatus('synced');
                // Something was edited while the send was open.
                if (this.pendingCount() > 0) this.scheduleFlush();
            })
            .catch(error => {
                // Nothing is removed. The queue is still on disk exactly as it was, so
                // this survives the app being closed as well as the network coming back.
                this._sending = new Map();
                this.fail(error);
                this.scheduleRetry();
            });
    },

    // Doubling, capped. Reset to the first interval by a successful send and by the
    // browser reporting the connection back.
    scheduleRetry() {
        if (!this.adapter) return;
        this._retryAt = this._retryAt
            ? Math.min(this._retryAt * 2, RETRY_MAX_MS)
            : RETRY_FIRST_MS;

        clearTimeout(this._retryTimer);
        this._retryTimer = setTimeout(() => {
            this._retryTimer = null;
            if (this.pendingReplace()) this.retryReplace();
            else this.flush();
        }, this._retryAt);
    },

    // Firestore refuses to update a document that does not exist, and every project
    // starts in exactly that state - so the first write of a new project came back
    // 'not-found' and the recovery for it was to write an empty {}. The rules refuse a
    // document with no updatedAt, so that was denied too. Between them, the first sync of
    // a fresh project could never land, and the only sign of it anywhere was a status
    // line reading "sync error".
    //
    // The document is created COMPLETE instead - the whole local schedule, stamped, with
    // the pending patch written on top so nothing queued is dropped on the way. That also
    // satisfies the rules' shape check for a full write, which an {} never could.
    //
    // And it is created atomically. Two phones opened on the same evening are both told
    // the document is missing and both try to make it; the second must not overwrite the
    // first. The adapter does that with a transaction, and the loser is handed
    // 'already-exists' - at which point its edits are an ordinary field merge, which is
    // what they were always meant to be.
    createDocument(patch) {
        if (!this.adapter || typeof this.adapter.create !== 'function') {
            return Promise.reject(new Error('the cloud document does not exist and this adapter cannot create it'));
        }

        // normaliseSchedule rather than the live object: it returns a clean copy of a
        // known shape, so a stray field picked up locally cannot be what the rules reject.
        const seed = cloudDocument(normaliseSchedule(State.schedule));
        Object.keys(patch).forEach(path => writeFieldPath(seed, path, patch[path]));

        // The rules require a timestamp on every write, and the merge rule depends on it.
        if (typeof seed.updatedAt !== 'string') seed.updatedAt = new Date().toISOString();
        if (typeof seed.updatedBy !== 'string') seed.updatedBy = syncDeviceId();

        return Promise.resolve(this.adapter.create(seed))
            .catch(error => {
                if (error && error.code === 'already-exists') {
                    return this.adapter.update(patch);
                }
                throw error;
            });
    },

    // A whole-document replacement - a restore, an import - in two halves, because the
    // order is the guarantee and one function cannot express it.
    //
    //   prepareReplace(schedule)         write the retry record, and read it back
    //   ...caller stores the new state locally, and gives up if it cannot...
    //   executePreparedReplace()         send it to the cloud
    //
    // Preparing FIRST is what makes the whole thing recoverable. replaceAll used to write
    // that record and ignore whether it landed: with no room for it and no network, the
    // restore was rejected, nothing was on the disk to say a restore was owed, and the
    // next older snapshot from another phone quietly finished undoing it.
    //
    // It is also the only order in which a crash between any two steps is safe. Before
    // step 1 nothing has happened. Between 1 and 2 there is a retry record and the old
    // state - the restore is re-attempted. After 2 the new state and the record agree.
    prepareReplace(schedule) {
        // NOT subject to the private-mode exception. An ordinary edit is allowed on a
        // browser that stores nothing, because the app says plainly that nothing survives
        // and refusing would protect nobody. A whole-document restore changes what every
        // other device holds, and doing that with no durable record of the intent is a
        // different bargain entirely.
        return this.rememberReplace(cloudDocument(schedule));
    },

    // Undoes a prepare when the caller could not store the new state. The restore is not
    // happening, so a record saying it is owed would make the next session send a state
    // this device never adopted.
    cancelPreparedReplace() {
        this.forgetReplace();
    },

    executePreparedReplace() {
        const document = this.pendingReplace();
        if (!document) {
            return Promise.reject(new Error('no prepared replacement to send'));
        }
        if (!this.adapter) return Promise.resolve();

        const superseded = this._outbox;
        this._stamp = null;
        this._replacing = true;

        return Promise.resolve(this.adapter.save(document))
            .then(() => {
                this._replacing = false;
                // Cleared only now. The pending edits belong to the state that was just
                // replaced on purpose, so they are genuinely superseded - but only once
                // the replacement has actually landed. Clearing them first meant a
                // restore that failed took the unsent edits with it.
                // Only when the replacement is durable HERE too. The journal is what
                // rebuilds local edits at boot, and clearing it while the schedule that
                // supersedes them never reached the disk throws away the only copy of
                // them that exists. Found by the suite: schedule write refused, cloud
                // write accepted, journal cleared, edit gone at the next open.
                const localIsDurable = typeof State === 'undefined' || !State.saveFailed;
                if (this._outbox === superseded && localIsDurable) this.clearOutbox();
                this.forgetReplace();
                this.setStatus('synced');
            })
            .catch(error => {
                this._replacing = false;
                this.fail(error);
                this.scheduleRetry();
                // The prepared record stays on the disk. That is the whole point of it.
                throw error;
            });
    },

    // The old single call, kept for callers that have their own ordering - the tests, and
    // any path that has already stored its new state. Prepare and execute in one go.
    replaceAll(data) {
        if (!this.prepareReplace(data)) {
            return Promise.reject(new Error('the restore could not be written down'));
        }
        return this.executePreparedReplace();
    },

    // ------------------------------------------------------------ pending replacement

    // Returns false when the note did not reach the disk, so the caller does not report
    // a restore as durable when nothing durable happened.
    //
    // And it does NOT adopt the document in memory unless the write landed. It used to
    // set _replace first, so a failed write left this device believing a restore was
    // pending that no other session would ever find - the worst of both: it refused to
    // adopt snapshots on account of a record that did not exist.
    rememberReplace(document) {
        if (this.replaceDamaged || farkadWritesBlocked()) return false;
        if (!Store.available) return false;

        const landed = Store.setVerified(REPLACE_KEY, JSON.stringify(document));
        if (landed) this._replace = document;
        return landed;
    },

    forgetReplace() {
        this._replace = null;
        Store.remove(REPLACE_KEY);
    },

    pendingReplace() {
        if (this._replace) return this._replace;
        if (this.replaceDamaged) return null;

        const raw = Store.get(REPLACE_KEY);
        if (!raw) return null;
        try {
            this._replace = JSON.parse(raw);
            return this._replace;
        } catch (error) {
            // It used to copy this optionally and then DELETE the original. That record
            // is a restore somebody asked for and was told had happened - the state they
            // are looking at - and deleting it removed the only description of what was
            // supposed to reach the other two phones.
            console.error('Pending replacement unreadable, holding it:', error);
            this.replaceDamaged = true;
            Recovery.damaged(REPLACE_KEY, raw,
                'שחזור שהמתין לשליחה לענן לא נקרא.');
            return null;
        }
    },

    // Push it again, from wherever the app got to. Called on connect and by the retry
    // ladder, so a restore made on a train reaches the other two phones by itself.
    retryReplace() {
        const document = this.pendingReplace();
        if (!document || !this.adapter) return Promise.resolve();

        // The save publishes the new document straight back as a snapshot, and the
        // replacement is not forgotten until the save RESOLVES - so without this guard
        // receive() sees it still pending and saves again, for as long as the stack
        // holds out. Found by the suite doing exactly that.
        if (this._replacing) return Promise.resolve();
        this._replacing = true;

        return Promise.resolve(this.adapter.save(document))
            .then(() => {
                this._replacing = false;
                this.clearOutbox();
                this.forgetReplace();
                this.setStatus('synced');
            })
            .catch(error => {
                this._replacing = false;
                this.fail(error);
                this.scheduleRetry();
            });
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
        if (!raw || typeof raw !== 'object') {
            this.fail(new Error('remote document is not a schedule'));
            return;
        }

        // A restore is waiting to go out. Everything arriving right now is, by
        // definition, the state the person asked to replace - adopting it would undo
        // their restore on the very device that asked for it, and it would look like
        // nothing happened at all. Push again instead.
        // A restore that has not landed, or a note about one that cannot be read. Either
        // way what is arriving is the state somebody asked to replace, and adopting it
        // would undo their restore on the device that asked for it.
        if (this.replaceDamaged || farkadWritesBlocked()) return;

        // The journal cannot be written. Local edits are then held by the schedule alone,
        // and the journal is the only thing that puts them back on top of an arriving
        // snapshot - so adopting one now would take today's work off the device with
        // nothing to restore it from. Hold what is here and say the storage is the
        // problem, which it is.
        if (this.journalFailed) {
            this.fail(new Error('no room to record pending edits; snapshot not adopted'));
            return;
        }
        if (this.pendingReplace()) {
            if (!this._replacing) this.retryReplace();
            return;
        }

        // No roster on the server yet. On a brand-new project the first write is usually
        // a day edit, which creates the document with days and a timestamp and nothing
        // else - and treating that as a broken document left the status stuck on
        // "sync error" forever while writes were in fact landing. It is not broken, it
        // is unfinished: send the roster up and let the next snapshot be complete.
        //
        // Unfinished is not the same as unrecognisable, though. A document carrying days
        // or a stamp is ours mid-creation; anything else is still refused, because the
        // one thing that must never happen here is a stranger's document being adopted.
        if (!Array.isArray(raw.workers)) {
            const ours = (raw.days && typeof raw.days === 'object')
                || typeof raw.updatedAt === 'string';
            if (!ours) {
                this.fail(new Error('remote document is not a schedule'));
                return;
            }
            if (State.schedule.workers.length > 0) this.editRoster(State.schedule);
            this.setStatus('synced');
            this.archiveDaily(State.schedule);
            return;
        }

        const remote = normaliseSchedule(raw);
        this.rememberRemoteRoster(remote);

        // A document nobody has ever written to - a project connected for the first time.
        // Adopting it would empty this device to match an empty cloud, so this device's
        // roster seeds it instead.
        if (!remote.updatedAt) {
            if (State.schedule.workers.length > 0) this.editRoster(State.schedule);
            this.setStatus('synced');
            this.archiveDaily(State.schedule);
            if (this.pendingCount() > 0) this.scheduleFlush();
            return;
        }

        // This device's own write, echoed back. Both halves are needed: the timestamp
        // alone said "somebody wrote at this instant", and after this device adopted
        // another phone's document that was a stamp it did not own - so the next write
        // from THAT phone looked like an echo of this one and was skipped.
        if (remote.updatedAt === State.schedule.updatedAt
            && remote.updatedBy === syncDeviceId()) {
            this.setStatus('synced');
            this.archiveDaily(State.schedule);
            return;
        }

        // Keep what was on screen, so an unexpected remote change is recoverable.
        Store.set('scheduleData:v2backup', JSON.stringify(State.schedule));

        const previous = State.schedule;
        State.schedule = remote;
        this.reapplyPending(State.schedule);

        // persist, not save: save() would re-stamp the document as this device's, at this
        // device's clock, which is exactly the stamp everything else is compared against.
        //
        // And its answer is READ. It used to be ignored, so a device with no room drew
        // the other phone's roster, called itself synced, and put the old one back at the
        // next open - the screen and the disk describing two different crews, with
        // nothing anywhere saying which was real.
        if (!State.persist()) {
            State.schedule = previous;
            if (typeof render === 'function') render();
            // Not 'synced'. Nothing about this device is up to date, and the storage
            // notice already names the actual problem. The next snapshot - or the next
            // reconnect - tries again, by which time there may be room.
            this.fail(new Error('no room to store the update; it was not adopted'));
            return;
        }

        if (typeof render === 'function') render();
        this.setStatus('synced');

        // The copy is taken from what the server holds at the first sight of it today -
        // before this evening's editing, which is the state worth being able to go back to.
        this.archiveDaily(State.schedule);

        if (this.pendingCount() > 0) this.scheduleFlush();
    },

    // What the cloud last showed, so a roster edit can send only the people who actually
    // changed. Taken from the NORMALISED roster, not the raw document, so a device on the
    // old wire format and one on the new are compared on the same footing.
    rememberRemoteRoster(schedule) {
        const byId = list => {
            const out = {};
            (list || []).forEach(item => { if (item && item.id) out[String(item.id)] = item; });
            return out;
        };
        this._remoteRoster = {
            workers: byId(schedule.workers),
            places: byId(schedule.places)
        };
    },

    // Edits typed here in the last second or so, or queued after a failed send. They are
    // held as (path, value) pairs, so putting them back on top of a freshly adopted
    // document is a matter of writing each one in again - otherwise the person watches
    // what they just entered disappear when somebody else's change arrives.
    reapplyPending(schedule) {
        this.loadOutbox();

        // The outbox is the whole answer now, in seq order: an entry stays in it from
        // the moment it is made until the cloud acknowledges it, so anything not yet
        // acknowledged - including a send that is open right this second - is here.
        // Unsent only. An entry the cloud has already acknowledged is IN the snapshot
        // that just arrived, and putting it back on top would undo whatever another
        // phone has changed since.
        const pending = [...this._outbox.entries()]
            .filter(([, item]) => !item.sent)
            .sort((a, b) => a[1].seq - b[1].seq);

        // Which lists already have a per-person edit waiting. The legacy whole-array
        // entry is queued next to them and would otherwise be applied last and undo them.
        const perEntity = new Set();
        pending.forEach(([path]) => {
            const parts = path.split('.');
            if (parts.length === 3 && parts[0] === 'roster') perEntity.add(parts[1]);
        });

        pending.forEach(([path, item]) => {
            applyJournalEntry(schedule, path, item.value, perEntity);
        });
    },

    scheduleFlush() {
        clearTimeout(this._timer);
        this._timer = setTimeout(() => this.flush(), this.pushDelayMs);
    }
};

// One journal entry, written into a schedule. Shared by the two things that need it: the
// boot rebuild, and putting local edits back on top of a snapshot that just arrived.
//
// `perEntity` names the roster lists that already have a per-person entry waiting, so the
// legacy whole-array entry queued beside them does not undo those.
function applyJournalEntry(schedule, path, value, perEntity) {
    {
        {
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
                return;
            }

            // One person, queued by id. A worker added seconds ago must not be dropped by
            // the snapshot that arrives before the send completes.
            if (parts.length === 3 && parts[0] === 'roster'
                && (parts[1] === 'workers' || parts[1] === 'places')) {
                const list = schedule[parts[1]] || [];
                const at = list.findIndex(item => item && String(item.id) === parts[2]);
                if (at === -1) list.push(value);
                else list[at] = value;
                schedule[parts[1]] = list;
                return;
            }

            if (parts.length === 2 && parts[0] === 'roster'
                && (parts[1] === 'workerOrder' || parts[1] === 'placeOrder')) {
                const kind = parts[1] === 'workerOrder' ? 'workers' : 'places';
                const byId = new Map((schedule[kind] || [])
                    .filter(item => item && item.id)
                    .map(item => [String(item.id), item]));
                const ordered = [];
                (Array.isArray(value) ? value : []).forEach(id => {
                    const item = byId.get(String(id));
                    if (item) { ordered.push(item); byId.delete(String(id)); }
                });
                // Anyone the pending order had not heard of yet keeps his place rather
                // than being dropped by it.
                byId.forEach(item => ordered.push(item));
                schedule[kind] = ordered;
                return;
            }

            // The legacy whole-array form, still queued for devices that only read it.
            // Applied only when nothing per-entity has already spoken for this list -
            // otherwise a stale array would undo the per-person edits above.
            if (parts.length === 1 && (parts[0] === 'workers' || parts[0] === 'places')) {
                if (!perEntity || !perEntity.has(parts[0])) schedule[parts[0]] = value;
            }
        }
    }
}

// `const` at the top level of a classic script creates a global BINDING, not a property
// of window - so every other classic file here can say FarkadSync, and the Firebase
// adapter, which is the one ES module in the app, cannot: window.FarkadSync was
// undefined and the very first line it ran threw. Sync could never have connected.
// Published deliberately, and by the name the module expects.
window.FarkadSync = FarkadSync;

// Read back immediately, not at connect: pendingCount() has to be truthful on a device
// that has never had a cloud, and the answer lives on disk.
FarkadSync.loadOutbox();

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

    // A write that neither threw nor came back as written. Rarer than a full device and
    // worse, because nothing anywhere reports it - the only way to know is that the save
    // read back as something else, which is exactly what State.save now checks.
    if (typeof State !== 'undefined' && State.saveFailed) {
        const text = '⚠️ השינוי האחרון לא נשמר במכשיר. ייצא קובץ גיבוי עכשיו.';
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

    // How many edits are written down here and not yet in the cloud. Said plainly,
    // because "synced" while a day is still sitting in the queue is the same lie as a
    // green tick over a failed save - and this is the number that tells the difference
    // between "the other two can see it" and "only this phone can".
    const waiting = FarkadSync.pendingCount();
    if (waiting > 0) {
        text += ` (${waiting} ממתינים לשליחה)`;
    }

    notice.textContent = text;
}
