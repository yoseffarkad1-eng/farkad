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

// The record is an ENVELOPE with a phase, not a bare document, because "a restore is
// owed" and "a restore has reached this device" are different states and only one of them
// makes it safe to write the cloud.
//
// The failure that forced this: prepare succeeded, the app closed before the new schedule
// was stored, and on reopening the pending record was sent to the cloud, the record and
// the queue were cleared, and the status read "synced" - while the device that had asked
// for the restore still held, and showed, the old schedule. The cloud and the phone
// disagreed, and the only thing that knew a restore was owed had just been deleted.
//
//   prepared      - the intent is written down. Nothing else has happened.
//   local-stored  - this device durably holds the replacement. The cloud may be written.
//   cancelled     - a tombstone for a cancellation whose delete could not be confirmed.
//
// The phase is a hint, not the guarantee. What actually gates the cloud write is reading
// scheduleData:v2 back off the disk and finding the replacement in it - see
// localDurableHolds. A phase can be stale after a crash; the bytes cannot.
// Where a genuine v71 record's frozen upgrade is written BEFORE the raw record is
// replaced by it, so that at no point is the only description of that restore in memory.
// See freezeLegacyReplacement.
const LEGACY_UPGRADE_KEY = 'farkad:pendingReplace:v71';

const REPLACE_VERSION = 2;
const SCHEDULE_KEY = 'scheduleData:v2';     // must match V2_KEY in state.js

// supersedesSeq is the journal position at the moment the restore was asked for. Every
// entry at or below it describes the state the restore is replacing, so replaying them
// afterwards would put the pre-restore days straight back on top of it - which is what
// happened when the app died between storing the restore and finishing the transaction.
// They are dropped only once the replacement is durably stored here, never while it is
// merely prepared or while its local save failed.
//
// `cloud` says whether a cloud write is still owed. A restore performed with no adapter
// connected has both halves - the schedule and the queue - and a crash between them
// leaves the second one owed, so it needs a durable transaction exactly as a cloud
// restore does. What it must NOT get is a trip to the cloud when somebody signs in
// weeks later: local-only means local-only, and a record that could not say so would
// turn every offline restore into a push the person never asked for.
function replacementEnvelope(document, phase, transactionId, supersedesSeq, cloud) {
    return {
        version: REPLACE_VERSION,
        phase,
        transactionId,
        supersedesSeq: Number(supersedesSeq) || 0,
        cloud: cloud !== false,
        document
    };
}

function replacementId() {
    return 'r_' + Math.random().toString(36).slice(2, 10);
}

// Key order is not part of what a schedule IS, and two paths that build the same schedule
// can produce different orders. Comparing raw JSON would report a difference that is not
// one - and this comparison decides whether a restore is allowed to reach the cloud.
function canonicalJson(value) {
    if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
    if (value && typeof value === 'object') {
        return '{' + Object.keys(value).sort()
            .map(key => JSON.stringify(key) + ':' + canonicalJson(value[key]))
            .join(',') + '}';
    }
    return JSON.stringify(value === undefined ? null : value);
}

// What two schedules have to agree on for one to BE the other.
//
// updatedAt and updatedBy are excluded, and that is the whole list of exclusions: saving
// the replacement here re-stamps it with this device and this clock, which is correct and
// is not a difference in the record. schemaVersion is constant, and the roster block is
// derived from workers and places.
// Reads whichever of the two formats is on the disk.
//
// v71 wrote the bare cloud document with no version and no phase. It wrote it BEFORE the
// local save in that ordering too, so reading it as 'prepared' is both the conservative
// interpretation and the accurate one - the device may or may not hold it. It is never
// deleted for being old: the recovery below applies it locally first, exactly as it would
// a new one.
const REPLACE_PHASES = ['prepared', 'local-stored', 'cancelled'];

// Is this actually a whole schedule? Anything that reaches applyReplacementLocally is
// about to become the entire record on this device AND on the other two phones, so the
// question is asked by the model, once, with the same list of rules the import uses -
// see fullScheduleProblems in js/model/schema.js.
//
// The shape check that used to live here accepted {"workers":[],"places":[]}, because it
// asked only whether the two rosters were present in one form or the other. That
// document has no days and no advances, normaliseSchedule turns it into an empty
// schedule without complaint, and the result is a restore that empties the screen, the
// disk and the cloud with nothing anywhere reporting a fault.
function isFullScheduleDocument(document) {
    return readReplacementDocument(document).document !== null;
}

// The envelope's own fields, checked exactly.
//
// A cancelled record is a tombstone and carries no document; everything else about it
// still has to be what it says it is. Anything failing this is quarantined, never
// repaired: a supersede point read leniently is a restore that supersedes the wrong half
// of the journal, which is somebody's day either deleted or resurrected.
function envelopeProblems(parsed) {
    if (!isPlainObject(parsed)) return ['not an envelope'];
    if (parsed.version !== REPLACE_VERSION) return ['unknown envelope version'];
    if (!REPLACE_PHASES.includes(parsed.phase)) return ['unknown phase'];
    // Named, because the id ties a resumed transaction to the one that started it. A
    // record that cannot say which transaction it belongs to cannot be resumed, only
    // guessed at.
    if (typeof parsed.transactionId !== 'string' || !parsed.transactionId) {
        return ['no transaction id'];
    }
    if (parsed.cloud !== undefined && typeof parsed.cloud !== 'boolean') {
        return ['cloud is not a boolean'];
    }

    if (parsed.phase === 'cancelled') {
        if (parsed.document !== null && parsed.document !== undefined) {
            return ['a cancelled record carries a document'];
        }
        if (parsed.supersedesSeq !== undefined && !isSafeSeq(parsed.supersedesSeq)) {
            return ['bad supersede point'];
        }
        return [];
    }

    if (!isSafeSeq(parsed.supersedesSeq)) return ['bad supersede point'];
    return readReplacementDocument(parsed.document).problems;
}

// Returns the envelope, or null when the record is not one. Null means "quarantine it";
// it never means "empty".
//
// The bare v71 format is deliberately NOT read here - see freezeLegacyReplacement. It
// used to be turned into an envelope on the spot, with a supersede boundary computed
// from whatever happened to be in the queue at that moment. Nothing was written down, so
// the next open computed it again against a longer queue: an edit made after the restore
// was asked for fell INSIDE the boundary on the second open, and the retry deleted it.
function readReplacementRecord(parsed) {
    if (!isPlainObject(parsed) || parsed.version !== REPLACE_VERSION) return null;
    if (envelopeProblems(parsed).length > 0) return null;
    // A v2 record written before the field existed always meant a cloud write.
    parsed.cloud = parsed.cloud !== false;
    return parsed;
}

// A genuine v71 record: the bare cloud document, no version, no phase, and - because
// v71 captured it before the schedule was stamped - quite possibly updatedAt: null,
// which today's Firestore rules refuse on every retry, forever.
//
// Recognised only in that exact shape. Anything else parseable is not a legacy restore,
// it is a damaged record, and the difference is the whole of G16.
function isLegacyReplacement(parsed) {
    if (!isPlainObject(parsed)) return false;
    if (parsed.version !== undefined || parsed.phase !== undefined) return false;
    return isFullScheduleDocument(parsed);
}

function replacementContent(source) {
    const schedule = normaliseSchedule(source);
    return canonicalJson({
        workers: schedule.workers,
        places: schedule.places,
        days: schedule.days,
        advances: schedule.advances
    });
}

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

// How long a write may stay open before the app says the connection is bad.
//
// It is a REPORTING threshold and nothing else. It used to be the point at which the
// next write was allowed to start regardless, which is how two writes to one field came
// to be open at once - see cloudWrite and flush.
const SEND_STUCK_MS = 30000;

// Resolves true when `promise` settles, false when `ms` goes by first. It never rejects:
// what the caller needs to know is whether the earlier write FINISHED, not how it went.
// A write that failed still finished, and the one that follows it is still in order.
function settledWithin(promise, ms) {
    return new Promise(resolve => {
        let answered = false;
        const answer = value => { if (!answered) { answered = true; resolve(value); } };
        const timer = setTimeout(() => answer(false), ms);
        promise.then(() => {}, () => {}).then(() => { clearTimeout(timer); answer(true); });
    });
}

// The queue record, read strictly. Returns { seq, items } or null.
//
// JSON.parse succeeding is not the question. The app writes exactly one shape here -
// {seq: <whole number>, items: {<path>: {value, seq, sent?}}} - so anything else under
// this key is not a queue this device wrote, and the one thing that must not happen to
// it is being read as "no pending edits" and written over by the next tap.
//
// Every sequence is checked with no coercion. Number(x) || 0 turned "3", true and null
// into numbers, so a record whose sequences were corrupted came back as a valid queue
// with the wrong ordering in it - and ordering is what decides which of two edits to the
// same field survives.
function readOutboxRecord(raw) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        return null;
    }

    if (!isPlainObject(parsed)) return null;
    if (!isSafeSeq(parsed.seq)) return null;
    if (!isPlainObject(parsed.items)) return null;

    const items = {};
    const paths = Object.keys(parsed.items);
    for (let i = 0; i < paths.length; i += 1) {
        const path = paths[i];
        const item = parsed.items[path];
        if (!isSafeJournalPath(path)) return null;
        if (!isPlainObject(item)) return null;
        if (!isSafeSeq(item.seq)) return null;
        if (item.seq > parsed.seq) return null;      // an entry the mark never covered
        if (item.sent !== undefined && typeof item.sent !== 'boolean') return null;
        if (!Object.prototype.hasOwnProperty.call(item, 'value')) return null;
        items[path] = item;
    }

    return { seq: parsed.seq, items };
}

// A field path this app writes: dotted segments, none of them empty, none of them
// carrying a character that would make the path mean something else on the way out.
function isSafeJournalPath(path) {
    if (typeof path !== 'string' || path.length === 0 || path.length > 300) return false;
    const parts = path.split('.');
    if (parts.length < 1 || parts.length > 4) return false;
    return parts.every(part => part.length > 0 && !/[`~*/[\]]/.test(part));
}

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
    _retryAt: 0,
    _retryTimer: null,
    // Every write to the shared cloud document, in the order it was started. See
    // cloudWrite: two writes that overlap can land in either order, and one of them is
    // allowed to erase the whole document.
    _cloudChain: null,
    _cloudOpen: 0,
    // How long a write may hold up the next one before it is taken for hung. A property
    // rather than the constant so the suite can make a stuck send finish in milliseconds
    // instead of half a minute.
    stuckMs: SEND_STUCK_MS,
    _stuckTimer: null,
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
    // A genuine v71 record whose frozen upgrade could not be written. Nothing may act on
    // it - not a resume, not an edit - because the boundary it needs has nowhere to live
    // and guessing it again on every open is the bug this replaced.
    replaceHeld: false,

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

        // Walk the slots. The first that is empty or READS AS A QUEUE becomes the live
        // one; every damaged one on the way is copied aside and left exactly where it is.
        //
        // "Reads as a queue" is not "parses". A record that parses into {} is not an
        // empty queue - the app never writes one, every write is {seq, items} - so it is
        // something else that arrived under this key, and treating it as empty means the
        // next edit writes straight over whatever it actually was.
        //
        // _activeKey starts as null and is only ever set to a slot that PASSED. The first
        // version assigned it at the top of each turn, so with every slot damaged it came
        // to rest on the last one and wrote the new journal straight over raw bytes it
        // had just finished quarantining.
        this._activeKey = null;
        let queue = null;

        for (let i = 0; i < OUTBOX_SLOTS; i += 1) {
            const key = outboxSlotKey(i);
            const candidate = Store.durableGet(key);

            if (candidate === null) {
                this._activeKey = key;                      // free slot, nothing to load
                return;
            }

            const read = readOutboxRecord(candidate);
            if (read) {
                this._activeKey = key;                      // a queue, this is the live one
                queue = read;
                break;
            }

            // NOT an empty queue. This is a list of edits that were made and never sent,
            // and the old behaviour - copy it optionally, carry on empty - meant the very
            // next edit wrote over the original. On a full device, which is where a
            // truncated write comes from in the first place, the copy had failed too, so
            // the recovery deleted the only trace of those edits.
            //
            // Recovery makes a verified copy, keeps the original exactly where it is, and
            // stops the app writing until somebody has been told.
            console.error('Queue does not read as a queue, holding it:', key);
            this.outboxDamaged = true;
            Recovery.damaged(key, candidate,
                `תור השליחה (עריכות שטרם נשלחו) לא נקרא: ${key}.`);
            // ...and on to the next slot, which is where recording may resume.
        }

        if (this._activeKey === null) {
            // Every slot damaged. There is nowhere a journal can go, so there is no way
            // to record anything that could be re-applied - and no acknowledgement should
            // be able to make it look otherwise.
            Recovery.halt('outbox-slots',
                'לא נמצא מקום תקין לתור השליחה. הרישום מושבת עד שהנתונים הגולמיים ייוצאו.');
            return;
        }
        if (!queue) return;

        Object.keys(queue.items).forEach(path => {
            const item = queue.items[path];
            this._outbox.set(path, {
                value: item.value,
                seq: item.seq,
                // Already in the cloud, still kept: it is only removed once the local
                // schedule holding it has also been written.
                sent: item.sent === true
            });
        });

        // The high-water mark, and it is READ rather than recomputed.
        //
        // Deriving it from the items alone was G16.2: a restore prunes the entries it
        // supersedes, which can leave {seq:N, items:{}} on the disk. The next open then
        // computed a maximum over nothing, started again at zero, and handed the next
        // edit a sequence number BELOW the boundary of the restore that was still
        // pending - so the restore superseded an edit made after it, and deleted it.
        //
        // Taken as the larger of the two, because a record written by a build that did
        // not persist the mark still has to load.
        this._seq = queue.seq;
        this._outbox.forEach(item => { this._seq = Math.max(this._seq, item.seq); });
    },

    // The queue as it stands in memory, written down. NOT optional: a restore point the
    // device has no room for is a loss the app can live with; a pending edit it has no
    // room for is the edit itself.
    saveOutbox() {
        this.loadOutbox();
        return this.adoptJournal(this._outbox);
    },

    // Every path that REMOVES something from the journal goes through here.
    //
    // The rule is the one queueBatch already follows: build the queue you want, write
    // it, read it back, and only then let memory believe it. The versions that deleted
    // from _outbox first and looked at the answer afterwards - or not at all - could
    // leave memory empty while the disk still held the entries. Everything downstream
    // then read the wrong queue: dropSupersededEntries reported a finished restore, the
    // invariant inspected a queue that only this session could see, the pending record
    // was removed, and the superseded days came back at the next open.
    //
    // Returns whether the disk now holds `candidate`.
    adoptJournal(candidate) {
        this.loadOutbox();
        if (!this._activeKey) return false;
        if (farkadWritesBlocked()) return false;

        const items = {};
        candidate.forEach((item, path) => { items[path] = item; });
        const landed = Store.setVerified(this._activeKey,
            JSON.stringify({ seq: this._seq, items }));

        this.journalFailed = !landed;
        if (!landed) {
            if (typeof updateSyncNotice === 'function') updateSyncNotice();
            return false;
        }

        this._outbox = candidate;
        return true;
    },

    // The journal as the DISK holds it, oldest first. Returns null when it cannot be
    // read, which is not the same as empty and must never be treated as one.
    //
    // Everything a replacement decides is decided against these bytes rather than
    // against _outbox: memory is what this session believes, and after a refused write
    // the two disagree in exactly the way that matters.
    durableJournalEntries() {
        this.loadOutbox();
        if (!this._activeKey) return null;

        const raw = Store.durableGet(this._activeKey);
        if (raw === null) return [];        // no queue on the disk is an empty queue

        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (error) {
            return null;
        }
        const items = (parsed && parsed.items) || {};
        return Object.keys(items)
            .map(path => [path, items[path]])
            .filter(([, item]) => item && typeof item === 'object')
            .sort((a, b) => (Number(a[1].seq) || 0) - (Number(b[1].seq) || 0));
    },

    // The durable journal, replayed over `schedule`. False when the disk could not be
    // read - in which case the caller has no idea what this device holds and must not
    // pretend otherwise.
    replayDurableJournal(schedule, after) {
        const entries = this.durableJournalEntries();
        if (!entries) return false;

        const floor = Number(after) || 0;
        entries.forEach(([path, item]) => {
            if ((Number(item.seq) || 0) > floor) applyJournalEntry(schedule, path, item.value);
        });
        return true;
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
    // `after` skips everything a replacement has superseded, which is what makes it
    // possible to say "the replacement, plus the work done since it was asked for".
    replayJournal(schedule, after) {
        this.loadOutbox();
        const floor = Number(after) || 0;
        [...this._outbox.entries()]
            .filter(([, item]) => item.seq > floor)
            .sort((a, b) => a[1].seq - b[1].seq)
            .forEach(([path, item]) => applyJournalEntry(schedule, path, item.value));
    },

    // The schedule has just been written to disk, so everything queued up to now is in it.
    // Told by State.save, because only State knows whether the write actually landed.
    markSaved() {
        this._savedSeq = this._seq;
        return this.pruneJournal();
    },

    // An entry goes only when BOTH are true: the cloud has it, and a schedule containing
    // it has been written here. Either one alone leaves something that cannot be rebuilt.
    //
    // Returns whether the disk holds the pruned queue.
    pruneJournal() {
        this.loadOutbox();

        const candidate = new Map();
        let changed = false;
        this._outbox.forEach((item, path) => {
            if (item.sent && item.seq <= this._savedSeq) changed = true;
            else candidate.set(path, item);
        });
        if (!changed) return true;
        return this.adoptJournal(candidate);
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
    // every pending field edit by definition. Returns whether the disk agrees.
    clearOutbox() {
        this.loadOutbox();
        this._sending = new Map();
        return this.adoptJournal(new Map());
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
        this.loadOutbox();

        // A COPY of each entry, not the live one. Marking the live object and writing
        // afterwards meant a refused write left memory saying the cloud held an entry
        // the disk still says it does not - and the next prune then dropped it for good.
        const candidate = new Map();
        let changed = false;
        this._outbox.forEach((item, path) => {
            if (sent.get(path) === item.seq && !item.sent) {
                // MARKED, not removed. The cloud has it; this device may still not, and
                // until a schedule containing it is written here the journal is the only
                // thing that can put it back. The prune below takes it when both are true.
                candidate.set(path, { value: item.value, seq: item.seq, sent: true });
                changed = true;
            } else {
                candidate.set(path, item);
            }
        });
        if (!changed) return true;

        // Marked and pruned in ONE write. Two writes here are two chances to leave the
        // two halves of the same fact disagreeing on the disk.
        const pruned = new Map();
        candidate.forEach((item, path) => {
            if (!(item.sent && item.seq <= this._savedSeq)) pruned.set(path, item);
        });
        return this.adoptJournal(pruned);
    },

    // ------------------------------------------------------------ one writer at a time

    // Every write to the shared cloud document goes through here, and they go through in
    // the order they were started.
    //
    // Two of them can be open at once - a field merge and a whole-document save - and
    // they are not interchangeable. `update` merges the fields it names; `save` replaces
    // the entire document. So an ordinary update that was started BEFORE a restore, and
    // that lands AFTER it, writes an old day back into a document the restore had just
    // removed it from. Screen, disk and cloud then agree on a day the person deliberately
    // restored away, and nothing anywhere reports a fault.
    //
    // Serialising them is the whole fix. The wait is bounded, because a request that
    // never settles - a hung socket, an adapter returning a promise nobody resolves -
    // must not wedge the queue for the rest of the session; past `stuckMs` the next
    // write goes anyway. That bound is for ORDINARY writes only. A replacement asks
    // cloudQuiet instead, which does not accept a timeout for an answer.
    cloudWrite(task) {
        const previous = this._cloudChain || Promise.resolve();
        this._cloudOpen += 1;

        // STRICT. The wait is on the previous write settling, and on nothing else.
        //
        // It used to be a race against a timer, so a request that had not answered
        // within half a minute let the next one start. Two writes to the same field were
        // then open at once, the newer one was acknowledged and pruned, the queue went
        // empty and the status said synced - and when the older one finally landed it
        // wrote its stale value over the newer one with nothing left anywhere to put it
        // back. A timeout may say the connection is bad. It may not let go of the lock.
        const run = previous.then(() => task(), () => task()).then(
            value => { this._cloudOpen -= 1; this.clearStuckWatch(); return value; },
            error => { this._cloudOpen -= 1; this.clearStuckWatch(); throw error; }
        );

        this._cloudChain = run.then(() => undefined, () => undefined);
        this.watchForStuck();
        return run;
    },

    // A write that has been open too long. It says so on screen - "no connection", which
    // is what it looks like from the outside - and does nothing else. The queue is on the
    // disk, the edits are safe, and the next write waits for this one however long it
    // takes.
    watchForStuck() {
        if (this._stuckTimer) return;
        this._stuckTimer = setTimeout(() => {
            this._stuckTimer = null;
            if (this._cloudOpen === 0) return;
            if (this.status === 'error') return;
            this.setStatus('offline');
        }, this.stuckMs);
    },

    clearStuckWatch() {
        if (this._cloudOpen > 0) return;
        clearTimeout(this._stuckTimer);
        this._stuckTimer = null;
    },

    // True once every cloud write started before now has actually settled.
    //
    // FALSE on a timeout, and that is the point: a whole-document replacement sent while
    // an older write is still open is a replacement that can be undone by it a moment
    // later. Better to leave the restore pending and say so than to report it done over
    // a document another request still has a pen to. Refusing is not the same as
    // unlocking - nothing else starts either.
    //
    // Counting open writes rather than reading _sending.size: a stamp-only refresh
    // carries no field paths at all, so _sending is empty while a real request is in
    // flight - and that is exactly the write a restore must not overtake.
    cloudQuiet() {
        if (this._cloudOpen === 0 && !this._cloudChain) return Promise.resolve(true);
        return settledWithin(this._cloudChain || Promise.resolve(), this.stuckMs)
            .then(settled => settled && this._cloudOpen === 0);
    },

    // ------------------------------------------------------------ the barrier

    // True while a whole-document replacement is outstanding.
    //
    // Nothing ordinary may be sent in that window. The queue is not the reason - it is
    // safe on the disk either way - the reason is what SENDING does to it: a field write
    // that goes out is acknowledged, and an acknowledged entry inside a written schedule
    // is pruned. Prune an entry made after the restore was asked for and the retry of
    // that restore no longer has it to replay, so a day the person recorded and was told
    // was saved is deleted from the screen, the disk and the cloud at once.
    //
    // A damaged pending record does not count here: pendingReplace() returns null for
    // one, Recovery has already stopped every write on the device, and a queue that can
    // never drain again would be a second failure on top of the first.
    replacementOutstanding() {
        if (this._replacing) return true;
        return Boolean(this.pendingReplace());
    },

    // The journal position an outstanding replacement has superseded, or 0.
    //
    // Entries at or below it describe the state that restore is replacing, so replaying
    // them - at boot, or over a snapshot that has just arrived - puts back precisely the
    // days it removed. That is the resurrection: the restore is on the disk, the queue
    // still holds the entries it superseded because the prune was refused, and the next
    // open lays them straight back on top of it.
    supersededFloor() {
        const envelope = this.pendingReplace();
        return envelope ? (Number(envelope.supersedesSeq) || 0) : 0;
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
                if (this.pendingReplace()) this.resumeReplace();
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
        if (this.pendingReplace()) this.resumeReplace();
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
    // all three devices are past v75 - not before.
    editRoster(schedule) {
        // Collected, then written once. This is the longest chain of entries in the app -
        // one path per person, plus the order, plus the legacy array - and a partial
        // result here is the hardest kind to notice: a worker present but missing from
        // the order, or an order naming somebody who is not in the list.
        const batch = [];
        const put = (path, value) => batch.push({ path, value });

        [['workers', 'workerOrder'], ['places', 'placeOrder']].forEach(([kind, orderKey]) => {
            const known = this._remoteRoster[kind] || {};
            const here = new Set();

            (schedule[kind] || []).forEach(item => {
                if (!item || !item.id) return;
                here.add(String(item.id));
                const before = known[item.id];
                if (before && JSON.stringify(before) === JSON.stringify(item)) return;
                put(`roster.${kind}.${item.id}`, item);
            });

            // Somebody the cloud's map still holds who is no longer in the crew.
            //
            // Removal used to travel in the whole array alone, and the map has no way to
            // hear that: normaliseSchedule merges the two, the array said he was gone and
            // the map said he was here, and the union put him back. So a worker retired
            // on one phone reappeared on all three at the next snapshot, with every day
            // and every shekel recorded against him back in the report - and the person
            // who removed him watched him return with nothing on screen to explain it.
            //
            // A null is how the wire says "not here any more": mergeRoster skips a falsy
            // entry, writeFieldPath deletes the field outright when seeding a new
            // document, and a phone still on the old build never reads `roster` at all.
            Object.keys(known).forEach(id => {
                if (!here.has(String(id))) put(`roster.${kind}.${id}`, null);
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

        if (!this.adapter) return Promise.resolve();
        this.loadOutbox();

        // THE BARRIER. A restore is outstanding, so nothing ordinary goes out until it
        // has finished - see replacementOutstanding.
        //
        // The retry timer is deliberately NOT cleared above this line any more. Clearing
        // it here was how the queue got past the barrier in the first place: an edit
        // arrived, its debounce called flush, flush cancelled the ladder that was going
        // to resume the restore, and the restore was left with nothing scheduled to pick
        // it up while the ordinary sends carried on over the top of it.
        if (this.replacementOutstanding()) {
            if (!this._replacing && !this._retryTimer) this.scheduleRetry();
            return Promise.resolve();
        }

        clearTimeout(this._retryTimer);
        this._retryTimer = null;

        if (this.pendingCount() === 0 && !this._stamp) return Promise.resolve();
        // One send at a time, and no clock anywhere near this decision.
        //
        // The time bound that used to be here was the whole of G16.1. A send that had
        // not answered in half a minute let the next one start; both were then open
        // against the same field; the newer one landed, was acknowledged and pruned, the
        // queue emptied and the status read synced - and the older one, arriving after
        // all that, wrote its stale value over the newer one with nothing left to put it
        // back. The seq check on acknowledgment does not help: it keeps a send from
        // acknowledging somebody else's entry, and says nothing about the ORDER two
        // writes reach the server in.
        //
        // A hung request now delays synchronisation for as long as it hangs. Every edit
        // is still on the disk, nothing claims to be synced, and the status says the
        // connection is bad - which is the truth, and a far better outcome than a
        // silent overwrite.
        if (this._sending.size > 0 || this._cloudOpen > 0) {
            // Waiting on a write that has not answered. Said on screen if it goes on -
            // and said is all it does. See watchForStuck.
            this.watchForStuck();
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
        this._stamp = null;

        // Through the chain, so that a whole-document replacement started after this one
        // cannot land before it. createDocument is inside the same slot on purpose - it
        // is this write, taking the other branch, not a second one.
        return this.cloudWrite(() => Promise.resolve(this.adapter.update(patch))
            .catch(error => {
                // Not an edge case: this is the first write of every new project.
                if (error && error.code === 'not-found') return this.createDocument(patch);
                throw error;
            }))
            .then(() => {
                // Only now. Up to this point the edits were on disk and would have been
                // replayed by the next session; from here the cloud is holding them.
                const acked = this.acknowledge(sent);
                this._sending = new Map();
                this._retryAt = 0;

                if (!acked) {
                    // The cloud has the batch and the queue could not be written to say
                    // so. Nothing is lost - the entries are still on the disk, and the
                    // next session sends them once more, which for a field write is
                    // sending them once. What must not happen is scheduling another
                    // flush: the disk is not going to have room in the next second, and
                    // the app would spend the evening re-sending the same batch.
                    this.fail(new Error(
                        'the batch reached the cloud but the queue could not record it'));
                    return;
                }

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
            if (this.pendingReplace()) this.resumeReplace();
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
    prepareReplace(schedule, cloudOwed) {
        // NOT subject to the private-mode exception. An ordinary edit is allowed on a
        // browser that stores nothing, because the app says plainly that nothing survives
        // and refusing would protect nobody. A whole-document restore changes what every
        // other device holds, and doing that with no durable record of the intent is a
        // different bargain entirely.
        this.loadOutbox();

        // Stamped HERE, not left to whatever the source had. A migrated v1 backup has no
        // timestamp at all, and the envelope captured the document before State.save
        // stamped the schedule - so every retry sent updatedAt: null, which the rules
        // reject on every attempt, forever.
        const document = cloudDocument(schedule);
        if (typeof document.updatedAt !== 'string' || !document.updatedAt) {
            document.updatedAt = new Date().toISOString();
        }
        if (typeof document.updatedBy !== 'string' || !document.updatedBy) {
            document.updatedBy = syncDeviceId();
        }

        // Checked before it is written down, not only when it is read back. A record
        // that would be quarantined on the next read is a record that should never have
        // been written: it would block every restore on the device and halt recording,
        // over a document this app built itself. Refusing here costs one restore and
        // says so.
        if (!isFullScheduleDocument(document)) return false;

        return this.rememberReplace(replacementEnvelope(
            document, 'prepared', replacementId(), this._seq, cloudOwed !== false));
    },

    // Says the device now holds it. Best effort on purpose: the phase is a hint, and the
    // gate on the cloud write is localDurableHolds, which reads the disk.
    confirmReplaceStored() {
        const envelope = this.pendingReplace();
        if (!envelope || envelope.phase === 'local-stored') return true;
        return this.rememberReplace(replacementEnvelope(
            envelope.document, 'local-stored', envelope.transactionId,
            envelope.supersedesSeq, envelope.cloud));
    },

    // Undoes a prepare when the caller could not store the new state. The restore is not
    // happening, so a record saying it is owed would make the next session send a state
    // this device never adopted. Returns whether that is now certain.
    cancelPreparedReplace() {
        return this.forgetReplace();
    },

    // THE INVARIANT. Does scheduleData:v2, read straight off the disk, already contain
    // the replacement?
    //
    // Not the phase, not what is in memory, not what a promise resolved to - the bytes
    // that the next session will open. Everything about a whole-document restore hangs
    // off this one question, and it is asked before the cloud is written and again before
    // anything is forgotten.
    localDurableHolds(envelope) {
        if (!envelope || !envelope.document) return false;

        const actual = this.durableLocalState();
        if (!actual) return false;

        // What the device SHOULD hold: the replacement, with the work done after it was
        // asked for laid back on top. Comparing against the bare document would call a
        // correct device wrong the moment anybody recorded anything mid-restore.
        //
        // Both sides read the journal off the DISK. Replaying the one in memory made the
        // comparison self-confirming: a prune that was refused left memory without the
        // superseded entries and the disk with them, so the two sides agreed on a state
        // the next open would not produce.
        const expected = normaliseSchedule(envelope.document);
        if (!this.replayDurableJournal(expected, envelope.supersedesSeq)) return false;
        return replacementContent(actual) === replacementContent(expected);
    },

    // The local state as the NEXT session would compute it: the schedule on the disk with
    // the durable journal replayed over it. Not scheduleData:v2 on its own - a journal
    // entry that is still queued is part of what this device holds, and a superseded one
    // that could not be pruned is exactly the difference that must be noticed.
    durableLocalState() {
        const raw = Store.durableGet(SCHEDULE_KEY);
        if (raw === null) return null;

        let schedule;
        try {
            schedule = normaliseSchedule(JSON.parse(raw));
        } catch (error) {
            return null;
        }
        if (!this.replayDurableJournal(schedule)) return null;
        return schedule;
    },

    // Puts the replacement on this device, durably, and on the screen. Returns false if
    // it could not be stored - in which case nothing at all has changed.
    // Returns { stored, pruned }.
    //
    // stored - the replacement, WITH the work done since it was asked for, is on the disk
    // pruned - the entries it supersedes are off the disk
    //
    // Both have to be true before anything is sent or forgotten. The schedule is written
    // first and the queue pruned second, so a failure between them leaves the superseded
    // entries queued rather than lost - they replay next session, the invariant notices,
    // and the transaction is retried.
    applyReplacementLocally(envelope) {
        const previous = State.schedule;

        // The replacement, then the newer work back on top of it. Dropping straight to
        // the document deleted every edit made after the restore was asked for - the
        // person recorded a day, was told it was saved, and the restore removed it from
        // the screen, the disk and the cloud at once.
        const next = normaliseSchedule(envelope.document);
        // The DURABLE journal, so that what is stored here is exactly what the invariant
        // will look for afterwards. Reading it out of memory let the two disagree.
        if (!this.replayDurableJournal(next, envelope.supersedesSeq)) {
            // The queue cannot be read, so there is no way to know what this device is
            // still owed. Storing the bare document would drop it silently.
            return { stored: false, pruned: false };
        }

        State.schedule = next;
        if (!State.save()) {
            State.schedule = previous;
            if (typeof render === 'function') render();
            return { stored: false, pruned: false };
        }

        const pruned = this.dropSupersededEntries(envelope.supersedesSeq);
        if (typeof render === 'function') render();
        return { stored: true, pruned };
    },

    // Journal entries the replacement has made obsolete. Anything newer was made after
    // the restore was asked for and is still owed, and is left alone.
    //
    // Built as a candidate and verified before it is adopted, like every other queue
    // write: the version that mutated the map and ignored saveOutbox's answer reported a
    // finished restore while the old journal sat on the disk, ready to put the superseded
    // days back at the next open.
    dropSupersededEntries(supersedesSeq) {
        const upTo = Number(supersedesSeq) || 0;
        if (upTo <= 0) return true;
        this.loadOutbox();

        const candidate = new Map();
        let changed = false;
        this._outbox.forEach((item, path) => {
            if (item.seq > upTo) candidate.set(path, item);
            else changed = true;
        });
        if (!changed) return true;
        return this.adoptJournal(candidate);
    },

    // Picking a restore back up - at connect, on the retry ladder, when the connection
    // returns, or when a snapshot arrives while one is outstanding.
    //
    // The order is the whole fix. THIS DEVICE FIRST. Sending first and adopting from the
    // echo was what left the cloud holding a restore the phone that asked for it had
    // never seen: the snapshot published during save() was ignored, because a replacement
    // was in flight, and then the record was deleted.
    resumeReplace() {
        const envelope = this.pendingReplace();
        if (!envelope || this._replacing) return Promise.resolve();

        // Applied unconditionally, not only when the disk disagrees. Writing the same
        // bytes again is harmless; SKIPPING it is not, because State.load has meanwhile
        // replayed the journal - including the entries this restore supersedes - so
        // memory can be ahead of a disk that already holds the replacement.
        const applied = this.applyReplacementLocally(envelope);
        if (!applied.stored) {
            // No room. Nothing is sent, nothing is cleared, nothing is forgotten, and
            // the status does not say synced.
            this.fail(new Error('no room to store the restored schedule; nothing was sent'));
            return Promise.resolve();
        }
        if (!applied.pruned) {
            // The schedule landed; the queue still holds entries this replacement
            // supersedes. Sending now would be sending a state the next open would not
            // reproduce, because those entries would replay over it.
            this.fail(new Error('the queue could not be finished; the restore is still pending'));
            this.scheduleRetry();
            return Promise.resolve();
        }

        // A restore made with no cloud connected owes the cloud nothing, now or later.
        // Both halves are on the disk, so the transaction is over. Sending it the first
        // time somebody signs in would push a state nobody asked to share.
        if (!envelope.cloud) {
            this.forgetReplace();
            return Promise.resolve();
        }

        this.confirmReplaceStored();
        return this.executePreparedReplace().catch(() => {});
    },

    // A restore that had no cloud to reach still has two halves, and a crash between them
    // leaves the second one owed. Nothing else will pick it up: connect(), the retry
    // ladder and the online handler are all cloud paths, and this device may never see a
    // cloud again. So it is finished here, at load, where the disk has just been read.
    //
    // Idempotent by construction - applying the same replacement twice is applying it
    // once - so a device that cannot finish it simply tries again at the next open.
    finishLocalReplace() {
        const envelope = this.pendingReplace();
        if (!envelope || envelope.cloud || this._replacing) return false;

        const applied = this.applyReplacementLocally(envelope);
        if (!applied.stored || !applied.pruned) return false;
        return this.forgetReplace();
    },

    executePreparedReplace() {
        const envelope = this.pendingReplace();
        if (!envelope) {
            return Promise.reject(new Error('no prepared replacement to send'));
        }

        const document = envelope.document;
        // The gate. A phase can be stale after a crash; the disk cannot.
        if (!this.localDurableHolds(envelope)) {
            return Promise.reject(
                new Error('the replacement is not stored on this device yet'));
        }
        if (!this.adapter) return Promise.resolve();

        this._stamp = null;
        this._replacing = true;

        // Ordered after every cloud write that was started before this one. A save
        // replaces the whole document, so an older update landing on top of it puts back
        // days this restore removed - and a device that reported "done" a moment earlier
        // has no idea it happened.
        //
        // A timeout is not good enough here. If an earlier write is still open the
        // restore simply does not go: it stays on the disk, the ladder picks it up, and
        // nothing has claimed to be finished.
        return this.cloudQuiet()
            .then(quiet => {
                if (!quiet) {
                    throw new Error(
                        'an earlier cloud write has not finished; the restore was not sent');
                }
                return this.cloudWrite(() => this.adapter.save(document));
            })
            .then(() => {
                this._replacing = false;

                // Asked AGAIN, after the cloud has it. A resolved cloud write is not a
                // reason to forget anything: the question is whether screen, disk and
                // cloud now describe the same schedule, and only the disk can answer it.
                // Anything else and this device would be left holding one schedule while
                // the other two phones hold another, with nothing recording the fact.
                //
                // It THROWS. Returning quietly here set the error status and then let
                // replaceEverything resolve, which reported the restore as done over a
                // device and a cloud that disagreed.
                if (!this.localDurableHolds(envelope)) {
                    const problem = new Error(
                        'the cloud has the restore but this device does not; keeping it pending');
                    this.fail(problem);
                    this.scheduleRetry();
                    throw problem;
                }

                // NOT clearOutbox. What is left in the queue at this point is work done
                // AFTER the restore was asked for - already in the local schedule, and
                // still owed to the other two phones. A blanket clear deleted it from the
                // cloud as well as the queue, which is the one thing a restore must not
                // do to work somebody did afterwards.
                if (!this.forgetReplace()) {
                    // The record is still on the disk and will be resumed. Saying synced
                    // would be claiming a transaction is over while it can still run.
                    const problem = new Error(
                        'the restore reached the cloud but its record could not be cleared');
                    this.fail(problem);
                    throw problem;
                }

                this.setStatus('synced');
                if (this.pendingCount() > 0) this.scheduleFlush();
            })
            .catch(error => {
                this._replacing = false;
                this.fail(error);
                this.scheduleRetry();
                // The prepared record stays on the disk. That is the whole point of it.
                throw error;
            });
    },

    // The whole restore, in one call, so the four places that perform one cannot each get
    // the ordering slightly wrong. Never rejects: it resolves with which STAGE failed, so
    // the caller can say the right thing without a try/catch around four outcomes.
    //
    //   1. write down the intent          fail -> nothing has changed
    //   2. store it on this device        fail -> memory reverted, intent cancelled
    //   3. mark the intent as stored
    //   4. send it to the cloud           fail -> the intent stays on disk and is resumed
    //
    // Step 2 before step 4 is the invariant this exists for. It is also the only order in
    // which a crash between any two steps recovers to something true.
    replaceEverything(schedule) {
        const previous = State.schedule;
        const cloudOn = Boolean(this.adapter) && this.status !== 'off';

        // Defence in depth. The four doors each check what they were handed, and this
        // checks it again on the way in - because the thing being asked for here is
        // "make this the entire record on three phones", and a caller that forgot is a
        // caller that empties them. cloudDocument of an unsound schedule would be
        // written down, refused on the way back in, and quarantine the device.
        if (readReplacementDocument(cloudDocument(schedule)).document === null) {
            return Promise.resolve({ ok: false, stage: 'invalid' });
        }

        // A durable record of the intent, cloud or no cloud.
        //
        // The local-only restore used to skip this and hold its envelope in a local
        // variable, which is fine right up to the moment one of the two halves fails.
        // The schedule would be written and the queue prune refused, and the method
        // reported stage "queue" over a device holding the restored blob, the old
        // journal, and nothing at all that could finish the job - so the next open
        // replayed the superseded days straight back on top of the restore.
        if (!this.prepareReplace(schedule, cloudOn)) {
            return Promise.resolve({ ok: false, stage: 'prepare' });
        }

        this.loadOutbox();
        const envelope = this.pendingReplace();

        const applied = this.applyReplacementLocally(envelope);
        if (!applied.stored) {
            State.schedule = previous;
            const cancelled = this.cancelPreparedReplace();
            if (typeof render === 'function') render();
            return Promise.resolve({ ok: false, stage: 'local', cancelled });
        }
        if (!applied.pruned) {
            // The replacement is on the disk, but the entries it supersedes are still
            // queued and would replay over it at the next open. Not a success, and the
            // transaction stays so a later attempt can finish it.
            this.fail(new Error('the queue could not be finished'));
            return Promise.resolve({ ok: false, stage: 'queue' });
        }

        if (!cloudOn) {
            // Both halves are down. Nothing is owed to a cloud that is not there, so the
            // transaction is over and its record goes.
            if (!this.forgetReplace()) {
                // The restore itself is complete and safe - the note saying one was owed
                // is what could not be taken off the disk. It will simply be replayed at
                // the next open, and applying the same replacement twice is applying it
                // once. Still not a finished transaction, and reporting "done" would be
                // saying the app has no more work to do about it.
                return Promise.resolve({ ok: false, stage: 'finalize' });
            }
            return Promise.resolve({ ok: true, stage: 'done' });
        }

        this.confirmReplaceStored();
        return this.executePreparedReplace()
            .then(() => ({ ok: true, stage: 'done' }))
            .catch(error => ({ ok: false, stage: 'cloud', error }));
    },

    // Kept for the paths and tests that manage their own ordering.
    replaceAll(data) {
        if (!this.prepareReplace(data)) {
            return Promise.reject(new Error('the restore could not be written down'));
        }
        this.confirmReplaceStored();
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
    // Returns whether the record is genuinely gone. A remove that quietly does nothing -
    // and localStorage can - would leave a restore nobody wants waiting to be resumed by
    // the next session, while this one reports it cancelled.
    forgetReplace() {
        this._replace = null;
        // remove() can throw; Store catches it and marks storage unavailable, which is
        // not the same as the bytes being gone.
        try { Store.remove(REPLACE_KEY); } catch (error) { /* checked below */ }
        Store.forget(REPLACE_KEY);

        // With no readable storage there is no way to prove anything left the disk, and
        // Store.available === false is not that proof.
        if (!Store.available) return false;
        if (Store.durableGet(REPLACE_KEY) === null) return true;

        // The delete did not take. A tombstone says the same thing in a way that only
        // needs a WRITE to work, which is a different failure mode.
        const tombstone = replacementEnvelope(null, 'cancelled', replacementId());
        if (Store.setVerified(REPLACE_KEY, JSON.stringify(tombstone))) {
            this._replace = tombstone;
            return true;
        }

        // Neither worked, so the record is still there and WILL be resumed. Saying
        // otherwise is the one answer that would let it surprise somebody later.
        try {
            this._replace = readReplacementRecord(JSON.parse(Store.durableGet(REPLACE_KEY)));
        } catch (error) {
            this._replace = null;
        }
        return false;
    },

    rememberReplace(envelope) {
        if (this.replaceDamaged || farkadWritesBlocked()) return false;
        if (!Store.available) return false;

        const landed = Store.setVerified(REPLACE_KEY, JSON.stringify(envelope));
        if (landed) {
            this._replace = envelope;
            return true;
        }

        // The write failed, and Store keeps required writes in its session cache so the
        // rest of this session can still read what it wrote. For THIS record that cache
        // is a phantom: a restore that was refused, readable all session, executed by
        // the next snapshot. Taken back out.
        Store.forget(REPLACE_KEY);
        this._replace = null;
        return false;
    },

    // The envelope, or null. Never the bare document - callers that want that ask for
    // pendingReplaceDocument().
    pendingReplace() {
        if (this._replace) {
            return this._replace.phase === 'cancelled' ? null : this._replace;
        }
        if (this.replaceDamaged || this.replaceHeld) return null;

        // durableGet, not get. A required write the disk refused still sits in the
        // session cache, so reading the pending record through get() found one that does
        // not exist on the disk - and a later snapshot then executed a restore this app
        // had already reported as refused.
        const raw = Store.durableGet(REPLACE_KEY);
        if (!raw) return null;

        let parsed;
        try {
            parsed = JSON.parse(raw);
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

        const envelope = readReplacementRecord(parsed)
            || this.freezeLegacyReplacement(parsed, raw);

        if (!envelope) {
            if (this.replaceHeld) return null;      // legacy, and the upgrade would not write
            // Parseable, and not a restore. Treated exactly like unreadable: the raw
            // bytes stay where they are, a copy is taken, and nothing is applied.
            console.error('Pending replacement is not a schedule; holding it.');
            this.replaceDamaged = true;
            Recovery.damaged(REPLACE_KEY, raw,
                'הרישום של שחזור שממתין לשליחה אינו תקין.');
            return null;
        }

        this._replace = envelope;
        return this._replace.phase === 'cancelled' ? null : this._replace;
    },

    // A genuine v71 record, turned into an envelope ONCE and written down.
    //
    // v71 stored the bare cloud document and cleared the whole queue on success, so the
    // record carries no supersede boundary. The equivalent without a blanket clear is
    // "everything queued at the moment this record is first read". Computing that in
    // memory and leaving the raw record alone - which is what the previous version did -
    // meant it was computed AGAIN at the next open, against a queue that had grown: an
    // edit made after the restore was asked for was outside the boundary on the first
    // open and inside it on the second, and the retry deleted it.
    //
    // So the boundary, the transaction id, the cloud flag and the stamp are frozen and
    // persisted before anything is allowed to depend on them. The order is the usual one:
    //
    //   1. write the upgrade to a SECOND key and read it back    - now two records exist
    //   2. write it over the raw record                          - now one, and it is v2
    //   3. drop the companion
    //
    // The raw v71 bytes are never overwritten until step 1 has been verified, so there
    // is no moment at which the only description of that restore is in memory.
    //
    // If step 1 will not write, nothing is upgraded and nothing is guessed at. The record
    // stays exactly as it is, recording stops, and the person is told what is actually
    // wrong - which is that the device is full.
    freezeLegacyReplacement(parsed, raw) {
        if (!isLegacyReplacement(parsed)) return null;

        const companion = this.readFrozenLegacy(parsed);
        if (companion) return companion;

        this.loadOutbox();
        const document = Object.assign({}, upgradeStoredSchedule(parsed));
        // v71 captured the document before State.save stamped it, so a genuine record
        // can carry updatedAt: null - which the rules refuse on every attempt, forever.
        if (typeof document.updatedAt !== 'string' || !document.updatedAt) {
            document.updatedAt = new Date().toISOString();
        }
        if (typeof document.updatedBy !== 'string' || !document.updatedBy) {
            document.updatedBy = syncDeviceId();
        }

        const frozen = replacementEnvelope(
            document, 'prepared', 'legacy_' + replacementId().slice(2), this._seq, true);

        if (!Store.setVerified(LEGACY_UPGRADE_KEY, JSON.stringify(frozen))) {
            // No second copy, so the raw record is still the only one there is. It is
            // left exactly where it is and nothing acts on it.
            this.replaceHeld = true;
            Store.forget(LEGACY_UPGRADE_KEY);
            Recovery.halt('replace-upgrade',
                'אין מקום במכשיר לסיים שחזור ישן שממתין לשליחה. הרישום לא נמחק. ' +
                'ייצא גיבוי, פנה מקום, ופתח מחדש.');
            return null;
        }

        // Two verified copies exist now, so the raw one may be replaced.
        if (Store.setVerified(REPLACE_KEY, JSON.stringify(frozen))) {
            Store.remove(LEGACY_UPGRADE_KEY);
            Store.forget(LEGACY_UPGRADE_KEY);
        }
        // If that second write failed, the companion is what the next open reads, and
        // the boundary it holds is the one frozen here. Either way it is never recomputed.
        return frozen;
    },

    // The frozen upgrade written on an earlier open, if it is still there and still
    // describes THIS record. Matched on content, so a companion left over from a
    // different restore cannot be applied to this one.
    readFrozenLegacy(parsed) {
        const raw = Store.durableGet(LEGACY_UPGRADE_KEY);
        if (!raw) return null;
        try {
            const frozen = readReplacementRecord(JSON.parse(raw));
            if (!frozen) return null;
            return replacementContent(frozen.document) === replacementContent(parsed)
                ? frozen : null;
        } catch (error) {
            return null;
        }
    },

    // retryReplace lived here, and it is where G13 was. It pushed the pending document to
    // the cloud from wherever the app happened to be, without ever asking whether THIS
    // device held it - so a crash between preparing a restore and storing it left the
    // cloud holding the restore, the phone holding the old schedule, the record deleted
    // and the status reading "synced". resumeReplace replaces it and puts this device
    // first.

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
            if (!this._replacing) this.resumeReplace();
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
                // A null is a removal in flight and stays one, the same as it does for
                // an advance. Writing it into the list instead would leave a hole where
                // a person used to be, which every screen that reads the roster then
                // has to survive.
                if (value === null) {
                    if (at !== -1) list.splice(at, 1);
                } else if (at === -1) {
                    list.push(value);
                } else {
                    list[at] = value;
                }
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
