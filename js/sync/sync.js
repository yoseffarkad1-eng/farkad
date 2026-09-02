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

// Which slot `key` is, or -1. Built once: the scan below asks this of every key in the
// store, and rebuilding twenty-five strings per question was most of what a drain cost.
const SLOT_INDEX = (() => {
    const map = new Map();
    for (let i = 0; i < OUTBOX_SLOTS; i += 1) map.set(outboxSlotKey(i), i);
    return map;
})();

function slotIndexOf(key) {
    const found = SLOT_INDEX.get(key);
    return found === undefined ? -1 : found;
}

// ---------------------------------------------------------------- the operation log
//
// The queue is a LOG OF OPERATIONS, and the five things it has to keep straight are kept
// separately, because every bug this replaced came from two of them sharing a record:
//
//   1. the operations themselves   immutable, keyed by an id nothing else can wear
//   2. the current value per path  DERIVED, never stored
//   3. what supersedes what        recorded by the writer, not inferred from a clock
//   4. what the cloud has          its own small key per operation
//   5. what may be thrown away     a separate pass that cannot change any of the above
//
// The shape that came before this kept one record per PATH and reported the winner. The
// loser stayed on the disk, invisible: prune the winner and the loser became the winner,
// so a day somebody had corrected came back hours later, went to the cloud, and replaced
// the correction on all three phones. Reporting "nothing pending" was true of the
// projection and false of the disk.
//
//   <slot>:op:<batchId>   one user edit, or one bulk edit, written ONCE
//                         {batchId, at, ops:[{opId, path, value, seq, after}]}
//   <slot>:ack:<opId>     the cloud has this exact operation
//   <slot>                the sequence mark, and an older build's whole queue
//
// A batch is atomic because it is one verified write. There is no rollback to trust and
// nothing to undo: the record landed whole or it is not there. Two tabs mint two batch
// ids and never share bytes.
//
// `after` is what makes this work. A tab that writes a value for a path names every live
// operation it can see for that path, so "B supersedes A" is a fact B carries rather than
// a comparison of two clocks - which is what a random suffix inside one millisecond was
// deciding by coin toss. A superseded operation can never become current again, because
// the record that supersedes it is on the disk beside it, and garbage collection removes
// the superseded one FIRST or neither.
const OP_MARK = ':op:';
const ACK_MARK = ':ack:';

// An operation that LOST, written down.
//
// Two tabs that both write one path inside the window where neither can see the other
// name nothing in `after`: they are genuinely concurrent, so the projection decides
// between them by a rule - the sequence, then the id - and hides the loser. Hiding is not
// deciding. The loser was still on the disk, and the moment the winner was acknowledged
// and collected it was the only operation left for that path: it became current, went to
// the cloud over the top of the value the app had committed, and left the queue reporting
// empty and the status reporting synced.
//
// So the decision is a record. Before a winner may be collected, everything it beat is
// retired here - one small key per defeated operation, its own write, never rewritten -
// and a retired operation can never be current again. If the retirement cannot be
// written, the winner stays: it is the only thing keeping the loser defeated, and letting
// go of it while the loser is still readable is the whole of the fault.
const BEAT_MARK = ':beat:';

// AN OPERATION THAT LOST A RACE, written down.
//
// A same-field compare-and-set loser used to stay in the queue with a retry scheduled,
// which made it a live write - and the WINNER'S SNAPSHOT was what set it off: adopting
// the winner replaces the base this write is compared against, so the path it wanted no
// longer looks contested, and the next flush puts the old value back over the correction
// somebody else had just made. Both phones then reported synced.
//
// Losing is a decision about that operation, so it is written down the way a retirement
// is: one small key per held operation, its own write, read back before it is believed. A
// held operation is not sent by anything - not the timer, not a snapshot, not reconnect,
// not a direct flush, not a new adapter, not the next session - and it stays on the disk
// and stays owed. The way out is a person: a fresh explicit edit of the same path is a
// later operation and wins the path on its own.
const HOLD_MARK = ':hold:';

// What an acknowledgement record says, exactly. Compared rather than merely found: a
// disk that takes the write and hands back something else leaves a key that EXISTS and
// says nothing, and reading its presence alone was enough to make collection throw the
// operation away - so the only record of an edit went, on the strength of a byte that
// had already been proved wrong.
const ACK_VALUE = '1';

// Ids carry no colon, so a quarantine copy - <key>:damaged - can never be read back as
// one of these. That is not hygiene: the copy used to match the live scan, and every
// reopen quarantined the quarantine.
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

// A stable id for a record that has none - an item an older build left inside a slot.
// The same bytes must always produce the same id, or the item would look like a new
// operation at every open and never be superseded by anything.
function hashedId(text) {
    let value = 0;
    for (let i = 0; i < text.length; i += 1) {
        value = (Math.imul(value, 31) + text.charCodeAt(i)) | 0;
    }
    return (value >>> 0).toString(36);
}

function outboxOpKey(slotKey, batchId) { return slotKey + OP_MARK + batchId; }
function outboxAckKey(slotKey, opId) { return slotKey + ACK_MARK + opId; }

// The id in `key` if it is EXACTLY one of this slot's `mark` keys, else null.
function outboxIdIn(slotKey, mark, key) {
    const prefix = slotKey + mark;
    if (key.indexOf(prefix) !== 0) return null;
    const id = key.slice(prefix.length);
    return SAFE_ID.test(id) ? id : null;
}

// Unique, and ordered by when it was made - the millisecond first, base-36 and fixed
// width, so a plain string comparison of two ids is a comparison of two moments. The
// random tail is uniqueness inside one millisecond and NOTHING ELSE decides by it: two
// operations in the same millisecond are ordered by `after`, and only genuinely
// concurrent ones - neither having seen the other - fall through to the id.
function opIdNow() {
    const stamp = Date.now().toString(36);
    const padded = stamp.length >= 9 ? stamp : '0'.repeat(9 - stamp.length) + stamp;
    return padded + '_' + newEntityId('q').slice(2);
}

// One batch as it sits on the disk. Null when it cannot be read, which is never the same
// as "not there": the caller quarantines it and keeps the bytes.
function readOpBatch(raw, batchId) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        return null;
    }
    if (!isPlainObject(parsed)) return null;
    if (String(parsed.batchId) !== String(batchId)) return null;
    if (!Array.isArray(parsed.ops) || parsed.ops.length === 0) return null;

    const ops = [];
    for (let i = 0; i < parsed.ops.length; i += 1) {
        const op = parsed.ops[i];
        if (!isPlainObject(op)) return null;
        if (!SAFE_ID.test(String(op.opId || ''))) return null;
        if (!isSafeSeq(op.seq)) return null;
        if (!Object.prototype.hasOwnProperty.call(op, 'value')) return null;
        // `after` is the only record that one operation beat another, so it is validated
        // like everything else here rather than copied. An id that is not an id, an
        // operation naming ITSELF, or the same id twice are all records this app cannot
        // have written - and each of them suppresses work that was never superseded.
        if (op.after !== undefined && !Array.isArray(op.after)) return null;
        if (Array.isArray(op.after)) {
            const named = op.after.map(String);
            if (named.some(id => !SAFE_ID.test(id))) return null;
            if (named.indexOf(String(op.opId)) !== -1) return null;
            if (new Set(named).size !== named.length) return null;
        }
        // The path AND the value, against the families this app actually writes: a
        // structurally sound entry naming a layer nobody wrote poisons the schedule in
        // memory, and the next ordinary save puts that on the disk.
        if (journalEntryProblems(String(op.path), op.value).length > 0) return null;
        // WHAT THE EDIT WAS BUILT ON. A canonicalJson string, or null for "the server had
        // nothing at this path" - the two are different statements and both are recorded.
        // Validated and admitted by name like every other field: this function rebuilds
        // each operation from an allowlist rather than copying it, which is why a field
        // added to the writer without being added here is silently dropped on the way
        // back in. That is what happened to `base` on its first attempt, and the hold it
        // exists for went on failing open.
        if (op.base !== undefined && op.base !== null
            && typeof op.base !== 'string') return null;
        // EVERYTHING THE DEVICE HAD SEEN OR PRODUCED at the path when the edit was made,
        // as marks - see seenMarksAt. Admitted by name for the reason `base` is, and held
        // to the same standard: a list of words, or nothing at all.
        if (op.seen !== undefined && !(Array.isArray(op.seen)
            && op.seen.every(mark => typeof mark === 'string' && mark !== ''))) return null;
        const built = {
            opId: String(op.opId), path: String(op.path), value: op.value, seq: op.seq,
            after: Array.isArray(op.after) ? op.after.map(String) : []
        };
        if (Object.prototype.hasOwnProperty.call(op, 'base')) built.base = op.base;
        if (Array.isArray(op.seen)) built.seen = op.seen.slice();
        ops.push(built);
    }
    return { batchId: String(batchId), ops };
}

// ---------------------------------------------------------------- the one projector
//
// Every reader of this queue goes through the three functions below: the live device, the
// boot replay, and the rebuild of a rescue file exported off a phone that could not read
// itself. They take a plain map of key -> raw bytes and nothing else, so the SAME rules
// answer "whose day is on the sheet" wherever the bytes come from.
//
// The version this replaced had a second implementation inside the recovery import. It
// sorted storage keys lexically, sorted only inside each batch, threw away opId and
// `after`, and applied every operation it could parse. Batch ids are random, so which
// value a rescue file rebuilt depended on how two of them happened to sort: a coin toss,
// per file, over whose day is on the sheet - and the phone and its own rescue file could
// disagree about it.
//
// A key belongs to this queue only in an EXACT shape. Anything else on the origin is
// somebody else's record and is not read, not projected, and not exported.
function queueKeyKind(key) {
    if (slotIndexOf(key) !== -1) return 'slot';

    const opAt = key.lastIndexOf(OP_MARK);
    if (opAt > 0 && slotIndexOf(key.slice(0, opAt)) !== -1
        && SAFE_ID.test(key.slice(opAt + OP_MARK.length))) return 'batch';

    const ackAt = key.lastIndexOf(ACK_MARK);
    if (ackAt > 0 && slotIndexOf(key.slice(0, ackAt)) !== -1
        && SAFE_ID.test(key.slice(ackAt + ACK_MARK.length))) return 'ack';

    const beatAt = key.lastIndexOf(BEAT_MARK);
    if (beatAt > 0 && slotIndexOf(key.slice(0, beatAt)) !== -1
        && SAFE_ID.test(key.slice(beatAt + BEAT_MARK.length))) return 'beat';

    const holdAt = key.lastIndexOf(HOLD_MARK);
    if (holdAt > 0 && slotIndexOf(key.slice(0, holdAt)) !== -1
        && SAFE_ID.test(key.slice(holdAt + HOLD_MARK.length))) return 'hold';

    return null;
}

function outboxBeatKey(slotKey, opId) { return slotKey + BEAT_MARK + opId; }
function outboxHoldKey(slotKey, opId) { return slotKey + HOLD_MARK + opId; }

// The identity of an item an older build left inside a slot record.
//
// It used to be a 32-bit rolling hash of slot + path, and that was wrong in two ways at
// once. It was not INJECTIVE - days.2026-08-12.actual.w_1n and days.2026-08-12.actual.w_30
// are both ordinary valid paths and both hashed to legacy_8pu8nh, so two days became one
// operation and one of them was never sent. And it said nothing about the VALUE, so when
// an old tab rewrote the same path its correction wore the name of the value it replaced:
// an operation that had superseded the old one suppressed the new one too, and a
// correction somebody made never left the phone.
//
// The path is carried whole, in hex, which is injective by construction rather than by
// hope; the sequence and a digest of the value make a rewrite a LATER revision rather than
// the same operation wearing the same name. Nothing here is a proof of identity resting on
// a hash: the hash only distinguishes two different values under one path and sequence,
// and a collision there costs a re-send, not a day.
function hexOf(text) {
    let out = '';
    for (let i = 0; i < text.length; i += 1) {
        const code = text.charCodeAt(i);
        out += (code < 16 ? '000' : code < 256 ? '00' : code < 4096 ? '0' : '')
            + code.toString(16);
    }
    return out;
}

function digestOf(text) {
    let a = 0x811c9dc5;
    let b = 0x01000193;
    for (let i = 0; i < text.length; i += 1) {
        a = Math.imul(a ^ text.charCodeAt(i), 16777619) | 0;
        b = (Math.imul(b, 31) + text.charCodeAt(i) + (a & 0xff)) | 0;
    }
    return ((a >>> 0).toString(16) + '0000000').slice(0, 8)
        + ((b >>> 0).toString(16) + '0000000').slice(0, 8);
}

function legacyOpId(slotIndex, path, item) {
    return 'legacy_' + slotIndex
        + '_' + hexOf(String(path))
        + '_' + (Number(item.seq) || 0)
        + '_' + digestOf(canonicalJson(item.value));
}

// Parsed batches, kept against their own bytes. Collection, the projection and every
// acknowledgement ask for the same records over and over; a season's queue is not
// something to re-parse per question. Bounded, because a rescue file brings in keys that
// belong to another device and must not accumulate.
const BATCH_CACHE = new Map();
const BATCH_CACHE_MAX = 512;

function readBatchCached(key, raw, batchId) {
    const cached = BATCH_CACHE.get(key);
    if (cached && cached.raw === raw) return cached.batch;
    const batch = readOpBatch(raw, batchId);
    if (BATCH_CACHE.size >= BATCH_CACHE_MAX) BATCH_CACHE.clear();
    BATCH_CACHE.set(key, { raw, batch });
    return batch;
}

// EVERY physical operation in `records`, in an order that does not depend on how the
// browser enumerates keys - slot first, then batch id - so two contexts reading identical
// bytes build identical lists.
//
// A batch is atomic. One operation inside it that will not read makes the RECORD
// unreadable: the batch was written once and cannot be rewritten, so there is no such
// thing as most of it, and applying the readable half would put a roster on the screen
// with a person in it and no order naming him.
//
// Items an older build left inside a slot record are operations too. They carry no id and
// no `after`, so they get a stable synthetic id and compete on the sequence they were
// written with - assuming one is older merely because an operation exists beside it is
// how a newer edit from an old client gets overruled.
function decodeQueue(records) {
    const unreadable = [];
    const acknowledged = new Set();
    const retired = new Set();
    const holds = new Set();
    const batches = [];

    Object.keys(records).forEach(key => {
        const kind = queueKeyKind(key);
        if (kind === 'batch') {
            const opAt = key.lastIndexOf(OP_MARK);
            batches.push({
                key,
                slot: key.slice(0, opAt),
                batchId: key.slice(opAt + OP_MARK.length)
            });
            return;
        }
        if (kind === 'ack' && records[key] === ACK_VALUE) acknowledged.add(key);
        if (kind === 'beat' && records[key] === ACK_VALUE) retired.add(key);
        if (kind === 'hold' && records[key] === ACK_VALUE) holds.add(key);
    });

    batches.sort((one, two) => (slotIndexOf(one.slot) - slotIndexOf(two.slot))
        || (one.batchId < two.batchId ? -1 : one.batchId > two.batchId ? 1 : 0));

    const fromBatch = new Map();          // batch key -> its operations, or null
    batches.forEach(({ key, slot, batchId }) => {
        const raw = records[key];
        if (typeof raw !== 'string') return;
        const batch = readBatchCached(key, raw, batchId);
        if (!batch) { fromBatch.set(key, null); return; }
        fromBatch.set(key, batch.ops.map(op => Object.assign({}, op, {
            // CLONED. The cache hands out the same parsed object every time, and a value
            // that reaches State is a value ordinary app code edits in place before it
            // commits anything - so the "journal as the disk holds it" was reporting
            // whatever the screen had done to it, and a rollback put back what it had
            // been editing rather than what the disk said.
            value: cloneValue(op.value),
            after: (op.after || []).slice(),
            slot, batchKey: key, batchId,
            sent: acknowledged.has(outboxAckKey(slot, op.opId)),
            retired: retired.has(outboxBeatKey(slot, op.opId)),
            held: holds.has(outboxHoldKey(slot, op.opId))
        })));
    });

    // Now the two rules `after` has to obey that no single batch can check on its own.
    //
    // An operation may only supersede one on the SAME PATH: naming one on another path
    // suppresses work it never replaced. And a set of operations may not name each other
    // in a circle: every one of them is then superseded, so the path has no value at all
    // and nothing says so.
    //
    // A reference to an operation that is not here is ordinary and correct - it was
    // collected. So invalidating a batch can only relax the constraints on the others,
    // and this settles: bounded anyway, because a device with twenty-five slots of
    // circular records has a different problem.
    for (let pass = 0; pass < OUTBOX_SLOTS; pass += 1) {
        const present = new Map();
        fromBatch.forEach(ops => {
            if (!ops) return;
            ops.forEach(op => present.set(op.opId, op));
        });

        const guilty = new Set();
        present.forEach(op => {
            (op.after || []).forEach(id => {
                const named = present.get(String(id));
                if (named && named.path !== op.path) guilty.add(op.batchKey);
            });
        });

        // Cycles, over what is left after the cross-path check.
        const colour = new Map();
        const walk = op => {
            const state = colour.get(op.opId);
            if (state === 2) return false;
            if (state === 1) return true;
            colour.set(op.opId, 1);
            let looped = false;
            (op.after || []).forEach(id => {
                const named = present.get(String(id));
                if (named && walk(named)) { looped = true; guilty.add(named.batchKey); }
            });
            colour.set(op.opId, 2);
            if (looped) guilty.add(op.batchKey);
            return looped;
        };
        present.forEach(op => walk(op));

        if (guilty.size === 0) break;
        guilty.forEach(key => fromBatch.set(key, null));
    }

    const operations = [];
    fromBatch.forEach((ops, key) => {
        if (ops === null) { unreadable.push(key); return; }
        ops.forEach(op => operations.push(op));
    });

    for (let i = 0; i < OUTBOX_SLOTS; i += 1) {
        const slot = outboxSlotKey(i);
        const raw = records[slot];
        if (typeof raw !== 'string') continue;
        const record = readOutboxRecord(raw);
        if (!record) { unreadable.push(slot); continue; }
        Object.keys(record.items).sort().forEach(path => {
            const item = record.items[path];
            const opId = legacyOpId(i, path, item);
            operations.push({
                opId, path, value: cloneValue(item.value), seq: item.seq, after: [],
                slot, batchKey: slot, batchId: null, legacy: true,
                // A legacy item has an acknowledgement key of its own now. The flag inside
                // the record is still read, because an older build wrote it there - but
                // it is not the only answer, and it is not one this build has to rewrite
                // a shared record to change.
                sent: item.sent === true || acknowledged.has(outboxAckKey(slot, opId)),
                retired: retired.has(outboxBeatKey(slot, opId)),
                held: holds.has(outboxHoldKey(slot, opId))
            });
        });
    }

    return { operations, unreadable, acknowledged, retired, holds };
}

// A value on its way out of the parse cache. Plain JSON, so this is all it takes - and
// doing it here means no caller anywhere can be holding the cached parse.
function cloneValue(value) {
    if (Array.isArray(value)) return value.map(cloneValue);
    if (value && typeof value === 'object') {
        const out = {};
        Object.keys(value).forEach(key => { out[key] = cloneValue(value[key]); });
        return out;
    }
    return value;
}

// The current value per path, from the whole physical set.
//
// An operation another LIVE operation names in `after` is superseded and can never be
// current - not now, and not later when the one that superseded it is collected. That is
// what makes this a record rather than a comparison: B carries the fact that it saw A, so
// removing B does not make A the winner again.
// `envelope` is a restore that has not finished, or nothing. What it supersedes is taken
// out of the CANDIDATES, before a winner is chosen - not out of the answer afterwards.
//
// Filtering the answer could only ever remove the one winner the projection had already
// picked, and it could not promote what that winner was hiding. A named pre-restore
// operation with a higher sequence hid a post-restore one; the fence removed the named
// one; nothing was left, and the day somebody recorded after pressing the button was
// gone from the screen, the disk and the cloud.
function projectQueue(operations, envelope) {
    const candidates = fenceOperations(operations, envelope);

    const superseded = new Set();
    candidates.forEach(op => (op.after || []).forEach(id => superseded.add(String(id))));

    const byPath = new Map();
    candidates.forEach(op => {
        if (superseded.has(op.opId)) return;
        const already = byPath.get(op.path);
        if (!already || laterOperation(op, already)) byPath.set(op.path, op);
    });
    return byPath;
}

// The candidates: everything the restore did not supersede, and nothing that has been
// durably retired. A retired operation lost to another one for its path and the decision
// was written down; it can never be current again, whatever is collected around it.
function fenceOperations(operations, envelope) {
    const live = operations.filter(op => op.retired !== true);
    const named = supersededOpIds(envelope);
    const upTo = Number((envelope || {}).supersedesSeq) || 0;
    if (!envelope || (named === null && upTo <= 0)) return live;
    return live.filter(op => !supersededByRestore(op, named, upTo));
}

// The projection as a journal: oldest first, ready to be laid over a schedule.
function queueJournalEntries(operations, envelope) {
    return [...projectQueue(operations, envelope).entries()]
        .sort((a, b) => (Number(a[1].seq) || 0) - (Number(b[1].seq) || 0));
}

// Which of two operations for one path is the current one.
//
// Superseded is decided first and by NAME: if one names the other in `after`, the one
// that names it is later, full stop - it was written by somebody who had already read the
// other. Nothing about clocks enters into it.
//
// Only when neither has seen the other are they genuinely concurrent, and then the rule
// has to be deterministic so that three phones reading the same disk agree: the higher
// sequence number, and the id as the tie. An item from an older build has no id and no
// `after`, so it is compared on its sequence alone - which is the only thing it has, and
// assuming it is older merely because an operation exists beside it is how a newer edit
// from an old client gets overruled.
function laterOperation(candidate, already) {
    if (already.after && already.after.indexOf(candidate.opId) !== -1) return false;
    if (candidate.after && candidate.after.indexOf(already.opId) !== -1) return true;
    const a = Number(candidate.seq) || 0;
    const b = Number(already.seq) || 0;
    if (a !== b) return a > b;
    return String(candidate.opId) > String(already.opId);
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

// Where every worker and site on this device CAME FROM. See the provenance block below:
// it is the whole of what makes a permanent deletion safe to offer, so it is kept on disk
// rather than in memory - the question is asked in a later session than the one that
// answered it.
//
// A new key rather than the old farkad:sharedIds:v1, and deliberately so. That record
// answered "has this id left?", and its absence therefore read as "nothing has ever
// left" - which is exactly what an upgraded v78 phone looks like, and its whole crew
// would have been offered for deletion on the first offline open. The question has to be
// the other way round: "was this id made here?", whose absence answers no.
const PROVENANCE_KEY = 'farkad:provenance:v1';        // the v1 blob, read once and kept

// One durable key per FACT, and that is the whole design.
//
// The blob above was a single record read, mutated and written back. Two contexts on one
// phone - two tabs, or a tab and the installed app - share one localStorage, and the
// sequence that loses data needs no exotic timing: A reads, B reads, A writes {X sent},
// B writes {Y sent}. Both writes verify their own bytes perfectly, and the fact that X
// left the device is gone. X is then offered for permanent deletion while he is sitting
// on somebody else's phone. Re-reading before writing does not fix it; it only shortens
// the window, because read and write are two operations and nothing makes them one.
//
// So no record is ever rewritten. Each fact is its own key:
//
//   farkad:prov:sent:<kind>:<id>   this id has left the device. Written once, never
//                                  removed - which is what makes `sent` monotonic by
//                                  construction rather than by discipline.
//   farkad:prov:mine:<kind>:<id>   this id was minted here, and the value is the
//                                  GENERATION it was minted in.
//   farkad:prov:gen                the current generation, only ever increased.
//   farkad:prov:uncertain          something happened that this device cannot account
//                                  for. Never cleared except by a deliberate reset.
//   farkad:prov:migrated           the v1 blob has been carried over, verified.
//
// Two contexts writing about two different workers write two different keys and cannot
// collide. A generation reset - a restore, an export - moves one small key, and every
// mine fact minted under an older generation is invalidated at a stroke without being
// touched; an older context that writes a mine fact afterwards stamps it with the
// generation it read, so the fact arrives already invalid. There is no interleaving in
// which a safety fact is lost.
const PROV_PREFIX = 'farkad:prov:';
const PROV_GEN_KEY = PROV_PREFIX + 'gen';
const PROV_UNCERTAIN_KEY = PROV_PREFIX + 'uncertain';
const PROV_MIGRATED_KEY = PROV_PREFIX + 'migrated';
// Written and read back to find out whether this device can still record anything at all.
const PROV_PROBE_KEY = PROV_PREFIX + 'probe';
const provSentKey = (kind, id) => `${PROV_PREFIX}sent:${kind}:${id}`;
const provMineKey = (kind, id) => `${PROV_PREFIX}mine:${kind}:${id}`;

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
function replacementEnvelope(document, phase, transactionId, supersedesSeq, cloud, supersedes) {
    return {
        version: REPLACE_VERSION,
        phase,
        transactionId,
        supersedesSeq: Number(supersedesSeq) || 0,
        // Every operation on the disk when the restore was asked for, named one by one.
        // A number is a statement about one tab's counter, and an edit made in another
        // tab AFTER the request could be handed the same number as the last one before it
        // and be deleted by the restore. The work recorded after a restore request is
        // exactly the work a restore must not touch.
        supersedes: Array.isArray(supersedes) ? supersedes.map(String) : [],
        cloud: cloud !== false,
        document
    };
}

// The operations a restore replaces, or null when the envelope names none AT ALL - which
// is what an envelope written before this shape looks like, and the only case the old
// number is used for.
//
// An EMPTY list is a statement, not an absence: it says the restore supersedes nothing.
// Reading it as "nothing named, fall back to the number" is how {supersedes: [],
// supersedesSeq: 999} came to empty a queue.
function supersededOpIds(envelope) {
    if (!envelope || !Array.isArray(envelope.supersedes)) return null;
    return new Set(envelope.supersedes.map(String));
}

// Is this queued operation one the restore replaces?
//
// By NAME where the envelope has names: an edit made after the prepare carries an id the
// list cannot contain, whatever number it was handed. By number only for an envelope from
// a build that recorded nothing else.
function supersededByRestore(item, named, upTo) {
    if (named) return Boolean(item.opId) && named.has(String(item.opId));
    return (Number(item.seq) || 0) <= (Number(upTo) || 0);
}

function replacementId() {
    return 'r_' + Math.random().toString(36).slice(2, 10);
}

// Key order is not part of what a schedule IS, and two paths that build the same schedule
// can produce different orders. Comparing raw JSON would report a difference that is not
// one - and this comparison decides whether a restore is allowed to reach the cloud.
// One dotted path, read out of one document. Lifted out of contestedPaths so the conflict
// branch can ask the same question of the same document without a second copy of it.
function readPath(root, path) {
    let node = root;
    const parts = String(path).split('.');
    for (let at = 0; at < parts.length; at += 1) {
        if (!node || typeof node !== 'object') return undefined;
        node = node[parts[at]];
    }
    return node;
}

// The ordering fields, which are about WHEN a write lands rather than what it does. The
// fingerprint is deliberately independent of every one of them: a retry legitimately
// carries a different clock, and the revision is the number the fingerprint has to be able
// to outlive.
const ENVELOPE_FIELDS = ['protocol', 'revision', 'lastOpId', 'updatedAt', 'updatedBy',
    'opFingerprint'];

// WHAT THIS OPERATION DOES, in one comparable string.
//
// A receipt used to carry a revision and nothing else, so the pair {schedule, receipt}
// proved that SOME write wearing this name reached this revision - not what that write
// was. A second arrival carrying the same name and a different path and value was answered
// "already applied": the queue acknowledged and pruned, the status synced, the phone
// holding one value and the cloud another, and nothing anywhere recording it.
//
// So the name is bound to the semantics. `kind` separates a field merge from a
// whole-document replacement, which used to share an id; the paths and values are sorted
// so two devices computing it agree; and a restore adds the transaction it belongs to,
// because two restores that replace the same document are still two different decisions.
function operationFingerprint(kind, payload, extra) {
    const parts = Object.keys(payload || {})
        .filter(key => ENVELOPE_FIELDS.indexOf(key) === -1)
        .sort()
        .map(key => key + '=' + canonicalJson(payload[key]));
    return 'f' + digestOf([String(kind)].concat(String(extra || ''))
        .concat(parts).join('|'));
}

function canonicalJson(value) {
    if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
    if (value && typeof value === 'object') {
        return '{' + Object.keys(value).sort()
            .map(key => JSON.stringify(key) + ':' + canonicalJson(value[key]))
            .join(',') + '}';
    }
    return JSON.stringify(value === undefined ? null : value);
}

// What a device HELD at a path, in one comparable word.
//
// canonicalJson of the value, and VALUE_ABSENT for nothing. A path the document does not
// have and a null a deletion left behind are the same absence to the person looking at
// the screen, and neither is a record anybody loses by writing over it. canonicalJson
// never yields the word - its output is JSON, and the word is not - so a value and the
// absence of one cannot be confused, which a recorded `null` could be: it was also what
// a session that had heard nothing wrote down, and the two were read as one.
const VALUE_ABSENT = 'absent';

function valueMark(value) {
    return value === undefined || value === null ? VALUE_ABSENT : canonicalJson(value);
}

// A base an older build recorded: canonicalJson, which spells undefined and null alike.
function markOfRecorded(text) {
    return text === 'null' ? VALUE_ABSENT : text;
}

// The marks a server value answers to at `path`: its own and, for a worker's day, the
// form normaliseLayer rebuilds it in. The disk holds an adopted day as that rebuild left
// it, and a day written by an older build can carry a field the rebuild drops; compared
// on raw bytes alone, an edit would be held against a value nobody had changed.
function marksOf(path, value) {
    const marks = [valueMark(value)];
    const parts = String(path).split('.');
    if (parts.length === 4 && parts[0] === 'days' && value && typeof value === 'object'
        && typeof normaliseLayer === 'function') {
        try {
            const mark = valueMark(normaliseLayer({ one: value }).one);
            if (marks.indexOf(mark) === -1) marks.push(mark);
        } catch (error) { /* a day the rebuild refuses answers only to its own bytes */ }
    }
    return marks;
}

// The families where a queued value REPLACES what is there: a day, or a ledger entry.
// See the pre-send check in sendClaimed for why the roster is not one of them.
function replacesWhole(path) {
    return String(path).indexOf('days.') === 0 || String(path).indexOf('ledger.') === 0;
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
    if (parsed.supersedes !== undefined && !Array.isArray(parsed.supersedes)) {
        return ['bad supersede list'];
    }
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

// EVERY subtree of the document, not the four that were easy to serialise.
//
// This is the whole of what localDurableHolds asks, and localDurableHolds is the gate a
// restore passes before it is sent to the cloud, before the record of it is removed, and
// before the app says it is done. With the ledger and the vehicles left out of the
// comparison, a device holding the days and none of the money answered "yes, I have the
// replacement" - and the transaction closed over a phone that held part of it.
//
// It is also what binds a frozen v71 companion to the primary it belongs to, and a
// comparison that cannot see the ledger cannot see two restores that differ only there.
//
// updatedAt and updatedBy stay out, and they are the whole list: saving the replacement
// re-stamps it with this device and this clock, which is correct and is not a difference
// in the record. schemaVersion is in, because a document from another version is not the
// same document.
//
// And it is read off the SOURCE, not off the normalised copy. normaliseSchedule starts
// from emptySchedule(), which stamps SCHEMA_VERSION, and never copies the raw field - so
// both sides read 2 whatever the record says, and the sentence above described a
// guarantee this function did not provide: a stored record stamped with another version
// answered "yes, I hold the replacement".
//
// A record with NO version falls back to the stamp, and that is not a loophole - it is
// the v71 case, and the only one. A v71 record is the bare cloud document with no version
// on it at all, and the frozen companion it is bound to is an upgraded document carrying
// 2. Reading absence as a difference would hold every genuine v71 restore for ever.
function replacementContent(source) {
    const schedule = normaliseSchedule(source);
    const stated = source && typeof source === 'object' ? source.schemaVersion : undefined;
    return canonicalJson({
        schemaVersion: stated === undefined ? schedule.schemaVersion : stated,
        workers: schedule.workers,
        places: schedule.places,
        days: schedule.days,
        advances: schedule.advances,
        ledger: schedule.ledger,
        vehicles: schedule.vehicles
    });
}

// Retry, backing off. A device on a building site loses signal for minutes at a time and
// gets it back without anyone touching anything, so the queue has to drain on its own -
// but a phone that retries every second for an hour is a phone with no battery.
const RETRY_FIRST_MS = 2000;
const RETRY_MAX_MS = 60000;

// Most EDIT paths in one write. Someone can record for a month before they ever sign in -
// that is the ordinary way this app gets adopted - and the whole month is then waiting
// in the outbox. Sent as a single update it is one enormous write against Firestore's
// per-write limits, and if it is refused, NONE of it lands. In batches the queue drains
// steadily and a refusal costs one batch, which is still on disk to retry.
//
// The budget is about the WRITE, not about this number. Every write also carries
// updatedAt, updatedBy, and the three ordering fields - protocol, revision, lastOpId -
// so the cap on edits is the budget minus those six. It was 300 when there were two, 297
// when there were five, and 296 now that opFingerprint travels with them - each step keeps
// the write exactly the size it always was rather than quietly spending the margin that
// number was chosen to leave. A sixth envelope field is one fewer day per write, and that
// is the honest price of it.
const MAX_PATHS_PER_WRITE = 296;

// How many times one batch may be rebuilt against a newer revision before the device
// stops and says so. Three is enough for the ordinary case - two other phones writing the
// same evening - and small enough that a device which genuinely cannot get a word in
// reports it instead of spinning. See the conflict branch in sendNow.
const CAS_REBASE_LIMIT = 3;

// How long a write may stay open before the app says the connection is bad.
//
// It is a REPORTING threshold and nothing else. It used to be the point at which the
// next write was allowed to start regardless, which is how two writes to one field came
// to be open at once - see cloudWrite and flush.
const SEND_STUCK_MS = 30000;

// ---------------------------------------------------------------- one sender at a time
//
// Across TABS, not across function calls. The gate inside this object is a property of one
// JavaScript context, and two tabs of this app are two contexts sharing one disk and one
// cloud document: each was letting its own write out while the other's was still open, so
// the older of the two could land last and write a stale day over a correction on all
// three phones. Nothing in the queue can fix that afterwards - the overwrite has already
// happened server-side.
//
// So the right to send is a record on the disk. Taken by writing a token and reading it
// back AFTER a pause: two tabs that both find the claim free both write, and the pause is
// what lets each of them see whose token actually ended up there. The loser does not
// send; its retry ladder brings it back, by which time the winner has finished and the
// loser rebuilds its payload from a disk that now holds the newer value.
//
// Stale after this long, because a tab that was closed mid-send must not lock the other
// two out of the cloud for the rest of the evening.
//
// The staleness is measured from the last HEARTBEAT, not from acquisition, and that is
// the whole of the second fix here. It used to be measured from the moment the claim was
// taken and nothing ever renewed it, while the request it guarded had no matching bound
// at all - cloudWrite waits on the previous write settling and on nothing else, on
// purpose, because "a timeout may say the connection is bad; it may not let go of the
// lock". So a phone on one bar could hold a request open past twenty seconds, the second
// tab would find the claim stale, take it, send a CORRECTION, have it acknowledged and
// pruned - and then the first request would land its older value on top. The cloud held
// the value that had been corrected, the correction was republished to every screen and
// disk by the very snapshot that carried the mistake, and both tabs said synced with
// nothing owing. Nothing anywhere disagreed, and nothing could put the correction back.
//
// An owner that is still working says so. An owner that has stopped saying so is gone,
// and its claim is takeable exactly as before - which is the property that keeps a
// crashed tab from locking the other two out for the evening.
const SEND_CLAIM_KEY = 'farkad:sendClaim';
const SEND_CLAIM_STALE_MS = 20000;
const SEND_CLAIM_SETTLE_MS = 25;
// Comfortably inside the staleness window, so an owner that is alive is never mistaken
// for one that is gone, and short enough that a crashed owner is not waited on for long.
const SEND_CLAIM_BEAT_MS = 4000;
// How many refusals in a row before the person is told. One unreadable answer is a
// half-finished write in the other tab and heals by itself; five in a row, across the
// retry ladder, is a record that is not going to repair.
const CLAIM_DAMAGE_LIMIT = 5;

// Three answers, not two. A claim is HELD, FREE, or UNREADABLE - and unreadable is not
// free.
//
// This used to say so in a comment and do the opposite: bytes that would not parse came
// back as `{ by: '', token: '', at: Date.now() }`, and the one caller guards on
// `held.token` being truthy, so an empty token short-circuited to "nobody is sending" and
// the claim was taken over the top of a live one. Ten different byte-shapes did it -
// truncated JSON, an array, a string, a number, null, an object with no token, a
// timestamp that will not read, a timestamp that is not there, and bytes that are not
// JSON at all. A truncated claim over a live send produced the same overwrite as the
// expired one, in under a second, with the lease nowhere near running out.
//
// `at: Number(parsed.at) || 0` was the same fault wearing a different hat: a claim whose
// timestamp is missing or unreadable became fifty-six years old and read as ANCIENT
// rather than as uncertain, and that one survived a perfectly good token.
// A stored timestamp, or null. Deliberately narrow: a real `Date.now()` and nothing
// else. Anything from before this feature existed, and anything more than a minute ahead
// of this device's clock, is a record that cannot be reasoned about - and the one thing
// that must never happen is reasoning about it anyway and calling the cloud free.
const CLAIM_EPOCH_MS = 1735689600000;   // 2025-01-01
const CLAIM_SKEW_MS = 60000;

function momentOrNull(value) {
    if (typeof value !== 'number' || !isFinite(value)) return null;
    if (value < CLAIM_EPOCH_MS) return null;
    if (value > Date.now() + CLAIM_SKEW_MS) return null;
    return value;
}

function readSendClaim() {
    const raw = Store.durableGet(SEND_CLAIM_KEY);
    if (raw === null) return null;

    const unreadable = () => ({ by: '', token: '', at: Date.now(), unreadable: true });

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        return unreadable();
    }
    if (!isPlainObject(parsed)) return unreadable();
    if (typeof parsed.token !== 'string' || parsed.token === '') return unreadable();

    // A NUMBER, and a number that could be a moment. `Number()` alone is a coercion, not
    // a check: null, false, [], "" and " " all become 0, and 0 reads as an owner who last
    // said anything in 1970 - so a live token was taken over the top of. The comment above
    // says this fault was fixed; what went was the `|| 0`, and `Number()` coerces just as
    // well. Negatives do it too.
    //
    // The far end is the worse one: a beat in the FUTURE makes the age negative, so the
    // claim never expires at all - permanently, on that disk, for every tab, through every
    // reopen. A moment that has not happened yet is not a heartbeat.
    const at = momentOrNull(parsed.at);
    const beat = parsed.beat === undefined ? at : momentOrNull(parsed.beat);
    if (at === null || beat === null) return unreadable();

    return {
        by: String(parsed.by || ''),
        token: parsed.token,
        at,
        // A record written by a build that did not send heartbeats still has one: its
        // acquisition time. That is the old behaviour exactly, for the old shape only.
        beat
    };
}

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
        if (!isPlainObject(item)) return null;
        if (!isSafeSeq(item.seq)) return null;
        if (item.seq > parsed.seq) return null;      // an entry the mark never covered
        if (item.sent !== undefined && typeof item.sent !== 'boolean') return null;
        if (!Object.prototype.hasOwnProperty.call(item, 'value')) return null;
        // The path AND the value, against the families this app actually writes. A
        // structurally sound entry naming a layer nobody wrote poisons the schedule in
        // memory, and the next ordinary save puts that on the disk - where the reopen
        // after it quarantines the record and stops recording. See journalEntryProblems.
        if (journalEntryProblems(path, item.value).length > 0) return null;
        items[path] = item;
    }

    return { seq: parsed.seq, items };
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
    // A null is WRITTEN, not deleted - exactly as it lands server-side.
    //
    // updateDoc(ref, path, null) stores a null at that path. It does not remove the
    // field; only deleteField() does that, and this app has never sent one. The harness
    // used to delete instead, which made the fake kinder than production: a tombstone
    // vanished at the next reopen, so the stale legacy array was the only word left on
    // that person and he came back. The tombstone has to SURVIVE, which means it has to
    // be a value. mergeRoster reads it as "gone" and rosterProblems already allows it.
    node[last] = value;
}

const FarkadSync = {
    adapter: null,
    status: 'off',       // off | connecting | synced | offline | error | blocked
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

    // Paths held for THIS SESSION because the durable marker could not be written. Not a
    // substitute for the marker - it dies with the tab - but the difference between a
    // write that waits for the next open and a write that goes out over somebody's
    // correction in the next two seconds.
    _heldNow: new Set(),
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

        // Walk the slots. The first whose MARK is absent or readable becomes the one this
        // session writes to; a damaged mark is copied aside and left exactly where it is.
        //
        // "Reads as a queue" is not "parses". A record that parses into {} is not an
        // empty queue - the app never writes one - so it is something else that arrived
        // under this key, and treating it as empty means the next edit writes straight
        // over whatever it actually was.
        //
        // _activeKey starts as null and is only ever set to a slot that PASSED. The first
        // version assigned it at the top of each turn, so with every slot damaged it came
        // to rest on the last one and wrote the new journal straight over raw bytes it
        // had just finished quarantining.
        this._activeKey = null;
        let mark = null;

        for (let i = 0; i < OUTBOX_SLOTS; i += 1) {
            const key = outboxSlotKey(i);
            const candidate = Store.durableGet(key);

            if (candidate === null) {
                // A free slot as far as the MARK goes. Its operations are read below all
                // the same: the mark and the work are different records now, and losing
                // the mark is not losing the work.
                this._activeKey = key;
                break;
            }

            const read = readOutboxRecord(candidate);
            if (read) {
                this._activeKey = key;
                mark = read;
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

        // The high-water mark, and it is READ rather than recomputed.
        //
        // Deriving it from what is queued was G16.2: a restore prunes what it supersedes,
        // which can leave a mark with nothing under it. The next open then computed a
        // maximum over nothing, started again at zero, and handed the next edit a number
        // BELOW the boundary of a restore that was still pending - so the restore
        // superseded an edit made after it, and deleted it.
        this._seq = mark ? mark.seq : 0;
        this.physicalOperations().forEach(op => {
            this._seq = Math.max(this._seq, Number(op.seq) || 0);
        });
    },

    // EVERY operation on this device, from every slot, read fresh off the disk.
    //
    // The complete physical set - not a winner per path. Everything else here is derived
    // from this list, and the reason it exists at all is that a queue which reports a
    // projection cannot answer the only question that matters after a prune: is there
    // anything left on this disk that could become current again?
    //
    // Items an older build left inside a slot's record are operations too. They carry no
    // id and no `after`, so they are given a stable synthetic id and compete on the
    // sequence they were written with - assuming one is older merely because an operation
    // exists beside it is how a newer edit from an old client gets overruled.
    physicalOperations() {
        if (!this._activeKey && !this._loaded) return [];

        const decoded = decodeQueue(this.durableQueueRecords());

        // A record that will not read is held, not skipped. The mark of a slot is
        // handled by loadOutbox, which has to decide where recording continues; a BATCH
        // is quarantined here, because nothing else reads one.
        decoded.unreadable.forEach(key => {
            if (slotIndexOf(key) !== -1) return;
            console.error('Queued batch does not read as one, holding it:', key);
            this.outboxDamaged = true;
            Recovery.damaged(key, Store.durableGet(key),
                `קבוצת עריכות בתור השליחה לא נקראה: ${key}.`);
        });

        return decoded.operations;
    },

    // Every key this queue is written across, on THIS device, across every slot.
    //
    // Not the active slot's family. A damaged mark moves recording to the next slot
    // along, and the operations under the slot it left are their own records - still part
    // of what this device owes, and still the only copy of the edits inside them. An
    // export that walked one family left them behind, and a projection that read all
    // twenty-five slots while the export read one meant the rescue file could not rebuild
    // the week the phone it came from was showing.
    queueKeys() {
        return Store.keys().filter(key => queueKeyKind(key) !== null).sort();
    },

    // Whether `key` is one of this queue's, in the exact shape. Used by the recovery
    // export, which must not sweep up records that are not this app's.
    isQueueKey(key) {
        return queueKeyKind(String(key)) !== null;
    },

    // Those keys and their bytes, read the way the next session would read them.
    durableQueueRecords() {
        const records = {};
        this.queueKeys().forEach(key => {
            const raw = Store.durableGet(key);
            if (raw !== null) records[key] = raw;
        });
        return records;
    },

    // The current value per path, derived from the whole physical set.
    //
    // An operation that another live operation names in `after` is superseded and can
    // never be current - not now, and not later when the one that superseded it is
    // collected. That is the difference between this and what it replaced: the fact that
    // B came after A is written down in B, so removing B does not make A the winner
    // again. Garbage collection removes A first or neither; see collectQueueGarbage.
    projectedQueue() {
        return projectQueue(this.physicalOperations());
    },

    // What the rest of the app calls the queue: path -> the current operation for it.
    get _outbox() {
        if (!this._loaded) this.loadOutbox();
        return this.projectedQueue();
    },
    set _outbox(ignored) {
        // Derived, never assigned. The setter exists because a version of this file used
        // to hand memory a queue and let the disk disagree with it; anything still doing
        // that is asking for the wrong thing and gets nothing.
    },

    // The queue as it stands, written down. Nothing to do: the operations ARE the queue,
    // and they were written when they were made.
    saveOutbox() {
        this.loadOutbox();
        return !this.journalFailed;
    },

    // ------------------------------------------------------------ the one minting path

    // Several edits, or one, as a SINGLE record.
    //
    // The ONLY place an operation is created. Acknowledgement does not come here, nor
    // pruning, nor replay, nor a restore: an operation is a thing a person did, and
    // anything that mints one on their behalf is inventing work.
    //
    // One verified write, so the batch is atomic without a rollback anybody has to trust:
    // it landed whole or it is not there, and a process that dies at any moment leaves
    // one of those two states. Half a roster - a worker present and missing from the
    // order - cannot exist.
    queueOperations(entries) {
        this.loadOutbox();
        if (!entries || entries.length === 0) return true;
        if (farkadWritesBlocked() || !this._activeKey) return false;
        if (this.replaceHeld) return false;

        // What is live for each path RIGHT NOW, read off the disk. Naming them is what
        // makes this batch later than them - by record rather than by clock.
        const live = this.projectedQueue();
        const all = this.physicalOperations();
        const bySameId = new Map();
        all.forEach(op => {
            if (!bySameId.has(op.path)) bySameId.set(op.path, []);
            bySameId.get(op.path).push(op.opId);
        });

        let seq = this._seq;
        const ops = [];
        // What this device holds on the disk, read once for the batch.
        const stored = this.storedSchedule();
        const heard = this._baseDoc !== null;
        const inBatch = new Map();
        entries.forEach(entry => {
            if (!entry || !entry.path) return;
            seq += 1;
            // WHAT THIS EDIT WAS BUILT ON, written down with the edit itself.
            //
            // The conflict rule needs to know what the server held at this path when the
            // person made this change. It used to be frozen in memory at send time, which
            // is fine until the send loses and the marker recording that cannot be
            // written: after a reopen there was nothing left to compare, the base was
            // re-read from a document that by then already held the WINNER'S value,
            // nothing looked contested, and the loser rebased over somebody's correction.
            //
            // Recorded here it is exactly as durable as the operation - one verified
            // write, both or neither - so no disk failure can leave a queued edit whose
            // provenance is gone.
            //
            // AND WHAT THIS DEVICE HELD THERE, not only what the server was last heard
            // to hold. The base was the base document's value alone, and the base
            // document is memory, set only by a snapshot: an edit made before this
            // session had heard the cloud - an open with no signal, which on a building
            // site is the ordinary open - recorded null, null was read as "the server
            // had nothing here", and nothing holds a path the server had nothing at. The
            // phone came back, heard another phone's correction, flushed, and its stale
            // value went out at the current revision; both phones said synced. Measured:
            // cloud p_00,p_02 where the winner was p_00,p_01.
            //
            // So `seen` is every value this device has held or produced at the path -
            // the disk's, the last snapshot's, and the chain of its own queued values
            // this one supersedes - each as a mark, VALUE_ABSENT where there was
            // nothing. A server value outside that list at send time is somebody else's
            // correction, whatever the document's last writer says; a value inside it is
            // this device's own, or one the person was looking at, and their later
            // decision wins over it. Only the families a queued value replaces: the
            // roster merges per id and has its own rules.
            //
            // `base` stays beside it, as it was, for a tab of an older build sharing
            // this disk during a handover - what the server was last heard to hold, or
            // failing that what the disk holds, and null for nothing. Decided on the
            // VALUE, not on its serialisation: canonicalJson(undefined) is the STRING
            // "null", so testing the serialised form for absence never fires and every
            // fresh path was recorded as though the server had held a literal null
            // there. Measured: two phones reaching an empty project held each other's
            // whole roster.
            const previous = live.get(entry.path) || inBatch.get(entry.path) || null;
            const held = this.storedMarkAt(entry.path, stored);
            const seen = replacesWhole(entry.path)
                ? this.seenMarksAt(entry.path, held, previous) : null;
            const lastHeard = this.baseValueAt(entry.path);
            let built = lastHeard === undefined ? null : canonicalJson(lastHeard);
            if (!heard && seen) built = held && held !== VALUE_ABSENT ? held : null;
            const op = {
                opId: opIdNow(),
                path: entry.path,
                value: entry.value,
                seq,
                base: built,
                // Everything on the disk for this path, superseded by this one. Not only
                // the projected winner: a loser left behind by a failed collection is
                // still a record that could otherwise come back.
                after: (bySameId.get(entry.path) || []).slice()
            };
            if (seen) op.seen = seen;
            ops.push(op);
            inBatch.set(entry.path, op);
            live.delete(entry.path);
        });
        if (ops.length === 0) return true;

        const batchId = newEntityId('b').slice(2);
        const landed = Store.setVerified(outboxOpKey(this._activeKey, batchId),
            JSON.stringify({ batchId, at: new Date().toISOString(), ops }));

        this.journalFailed = !landed;
        if (!landed) {
            // Out of the session cache too. A batch that never reached the disk is not a
            // queued edit, and leaving it in memory would let this session read back an
            // operation the next one will never see.
            Store.forget(outboxOpKey(this._activeKey, batchId));
            if (typeof updateSyncNotice === 'function') updateSyncNotice();
            return false;
        }

        // The mark, raised and never lowered. Its own write, and its own failure: the
        // work is already down, and a mark that could not move costs a number, not a day.
        this._seq = seq;
        const onDisk = readOutboxRecord(Store.durableGet(this._activeKey));
        if (!onDisk || onDisk.seq < seq) {
            Store.setVerified(this._activeKey, JSON.stringify({
                seq, items: onDisk ? onDisk.items : {}
            }));
        }
        return true;
    },

    // ------------------------------------------------------------ what the cloud has

    // Marked, not removed. The cloud has it; this device may still not, and until a
    // schedule containing it is written here the operation is the only thing that can put
    // it back. Its own key per operation, so acknowledging one edit never rewrites the
    // record carrying the others - and a refused mark costs one re-send.
    markAcknowledged(opIds) {
        this.loadOutbox();
        if (!this._activeKey || this.replaceHeld) return false;
        if (farkadWritesBlocked()) return false;

        // Read the disk ONCE for the whole acknowledgement. Asking per operation was a
        // full scan per operation, and a batch of three hundred turned one answer from
        // the cloud into a stall long enough that the rest of the queue never went.
        // Legacy items included. They used to be skipped here and skipped again by the
        // collector, so an edit an older build left in the queue went to the cloud on
        // every flush for the rest of the phone's life - a hundred and eleven writes in
        // six rounds, with the count beside it never moving. An acknowledgement is its
        // own small key now, so saying the cloud has one costs no rewrite of the shared
        // record it lives in.
        const bySlot = new Map();
        this.physicalOperations().forEach(op => bySlot.set(op.opId, op.slot));

        let whole = true;
        opIds.forEach(opId => {
            const slot = bySlot.get(opId);
            if (slot === undefined) return;
            const key = outboxAckKey(slot, opId);
            if (Store.durableGet(key) === ACK_VALUE) return;
            if (Store.setVerified(key, ACK_VALUE)) return;
            // Same reason as the batch above: a proof that did not land is not a proof,
            // and it must not be readable as one for the rest of this session.
            Store.forget(key);
            whole = false;
        });
        // The queue could not be written. Same flag, same meaning, same consequence as a
        // refused edit: while this is true the device cannot record what the cloud has,
        // so it must not adopt a snapshot that would take local work off the screen with
        // nothing able to put it back.
        this.journalFailed = !whole;
        return whole;
    },

    // Named operations, removed. Used by a restore, which supersedes what it names by
    // definition, and by clearOutbox.
    //
    // Order matters for the same reason collection has an order: an operation that
    // supersedes another must not outlive it, or the older value becomes current again.
    // Everything named here goes together, so within this set the order is not a hazard -
    // but a batch is only removed when EVERY operation in it is named, because a batch
    // record is immutable and half a batch cannot be written.
    dropOperations(opIds) {
        this.loadOutbox();
        if (!this._activeKey || this.replaceHeld) return false;
        if (farkadWritesBlocked()) return false;

        const going = new Set((opIds || []).map(String));
        if (going.size === 0) return true;

        const all = this.physicalOperations();
        const byBatch = new Map();
        const legacy = [];
        all.forEach(op => {
            if (op.legacy) { legacy.push(op); return; }
            if (!byBatch.has(op.batchKey)) byBatch.set(op.batchKey, []);
            byBatch.get(op.batchKey).push(op);
        });

        let whole = true;
        byBatch.forEach((ops, key) => {
            if (!ops.every(op => going.has(op.opId))) {
                // A batch only some of whose operations are named. It cannot be rewritten
                // - the record is immutable - so the ones that are named are superseded
                // by the restore rather than removed, and collection takes the batch when
                // the rest of it is finished with too.
                if (ops.some(op => going.has(op.opId))) whole = false;
                return;
            }
            try { Store.remove(key); } catch (error) { whole = false; }
            Store.forget(key);
            // Same rule as the collector: a mark is taken off only a record that is
            // proved gone. See the note there.
            if (!Store.available || Store.durableGet(key) !== null) {
                whole = false;
                return;
            }
            ops.forEach(op => this.forgetQueueMarks(op));
        });

        // Items an older build left inside a slot record are rewritten out of it, one
        // slot at a time, because that record is not immutable and never was.
        //
        // The paths come from the OPERATIONS, never from a second computation of their
        // ids. This branch used to recompute one - 'legacy_' + hash(slot + '|' + path) -
        // and no other line in this file has computed a legacy id that way since the
        // identity became injective and revision-sensitive: the set never matched, the
        // record was never rewritten, and a restore left the item an older build had
        // queued sitting inside it. The next open replayed that item over the restore
        // and put the replaced day back on the screen. One reading of an identity, or
        // the two readings disagree exactly where it costs a day.
        const goingBySlot = new Map();
        legacy.forEach(op => {
            if (!going.has(op.opId)) return;
            if (!goingBySlot.has(op.slot)) goingBySlot.set(op.slot, new Set());
            goingBySlot.get(op.slot).add(op.path);
        });
        goingBySlot.forEach((paths, slot) => {
            const record = readOutboxRecord(Store.durableGet(slot));
            if (!record) { whole = false; return; }
            const items = {};
            Object.keys(record.items).forEach(path => {
                if (!paths.has(path)) items[path] = record.items[path];
            });
            if (Object.keys(items).length === Object.keys(record.items).length) return;
            if (!Store.setVerified(slot, JSON.stringify({ seq: record.seq, items }))) {
                whole = false;
            }
        });

        // And the marks those items collected go with them. An acknowledgement or a
        // retirement naming an operation nobody holds is a key no pass will ever look at
        // again - the projection reads them by the id of an operation that is gone - so
        // it is bytes that accumulate for the life of the device.
        legacy.forEach(op => {
            if (!going.has(op.opId)) return;
            const paths = goingBySlot.get(op.slot);
            if (!paths || !paths.has(op.path)) return;
            this.forgetQueueMarks(op);
        });
        return whole;
    },

    // ------------------------------------------------------------ what may be thrown away

    // The schedule as the NEXT session would read it, parsed once and cached on its own
    // bytes. Collection asks on every save and every acknowledgement, and queueing asks
    // on every edit; a season's record is not something to re-parse per question.
    //
    // Two absences, kept apart: `raw` is null when there is no record at all, and
    // `schedule` is null when there is one that will not parse. The one caller that reads
    // a VALUE out of it needs the difference - no record means the path held nothing,
    // an unreadable record means nothing is known, and nothing is not the same as
    // unknown anywhere in this file.
    storedSchedule() {
        const raw = Store.durableGet(SCHEDULE_KEY);
        if (raw === null) return { raw: null, schedule: null };
        if (this._storedCache && this._storedCache.raw === raw) {
            return { raw, schedule: this._storedCache.schedule };
        }
        let schedule = null;
        try { schedule = JSON.parse(raw); } catch (error) { schedule = null; }
        this._storedCache = { raw, schedule };
        return { raw, schedule };
    },

    // A separate pass, and it cannot change which value is current.
    //
    // Two rules, and the second is the one the old shape did not have:
    //
    //   an operation may go when the cloud has it AND a schedule holding it is on the
    //   disk, or when something else supersedes it;
    //
    //   and it may only go once everything it supersedes has ALREADY gone. Removing a
    //   superseding record before the record it superseded would make the old value
    //   current again - which is the day that came back.
    //
    // A batch is removed whole or not at all, because a batch record is immutable. Bytes
    // that could not be collected are bytes, and nothing more: the projection above does
    // not consult this pass at all.
    collectQueueGarbage() {
        this.loadOutbox();
        if (!this._activeKey || this.replaceHeld) return true;
        if (farkadWritesBlocked()) return true;

        const all = this.physicalOperations();
        const decodedUnreadable = decodeQueue(this.durableQueueRecords()).unreadable.length > 0;
        const present = new Set(all.map(op => op.opId));
        const superseded = new Set();
        all.forEach(op => (op.after || []).forEach(id => superseded.add(String(id))));

        // Who is CURRENT for each path right now, by the same rule everything else uses.
        // Everything else for that path lost - and losing has to be written down before
        // the winner can go, or the loser becomes current the moment it does.
        const current = projectQueue(all);

        // The schedule as the NEXT session would read it. See storedSchedule.
        const stored = this.storedSchedule().schedule;

        const finished = op => {
            if (op.retired) return true;
            if (superseded.has(op.opId)) return true;
            // The cloud has it AND the disk here holds it. Asked of the stored schedule
            // rather than of a counter - see scheduleHoldsEntry.
            return op.sent && scheduleHoldsEntry(stored, op.path, op.value);
        };

        // RETIREMENT, and it goes first.
        //
        // Every operation that is neither current for its path nor already superseded by
        // name is one the projection beat. While it is readable it can come back, so the
        // fact that it lost is written down - its own key, one small verified write - and
        // only then may the operation that beat it be collected. A retirement that could
        // not be written leaves the winner where it is, which is the only thing keeping
        // the loser defeated.
        let whole = true;
        const retired = new Set();
        all.forEach(op => {
            if (op.retired) { retired.add(op.opId); return; }
            if (superseded.has(op.opId)) return;
            const winner = current.get(op.path);
            if (!winner || winner.opId === op.opId) return;
            const key = outboxBeatKey(op.slot, op.opId);
            if (Store.durableGet(key) === ACK_VALUE) { retired.add(op.opId); return; }
            if (Store.setVerified(key, ACK_VALUE)) { retired.add(op.opId); return; }
            Store.forget(key);
            whole = false;
        });

        // A winner may only go once everything it beat has been retired, and once
        // everything it superseded by name has gone. Both are the same rule seen twice:
        // never remove the record that is keeping an older value out of the way.
        const beatenBy = new Map();
        all.forEach(op => {
            if (op.retired || retired.has(op.opId)) {
                const winner = current.get(op.path);
                if (winner) beatenBy.set(op.opId, winner.opId);
            }
        });
        const owedRetirements = new Set();
        beatenBy.forEach((winnerId, loserId) => {
            if (present.has(loserId)) owedRetirements.add(winnerId);
        });

        const byBatch = new Map();
        const legacyGone = [];
        all.forEach(op => {
            if (op.legacy) { legacyGone.push(op); return; }
            if (!op.batchId) return;
            if (!byBatch.has(op.batchKey)) byBatch.set(op.batchKey, []);
            byBatch.get(op.batchKey).push(op);
        });

        byBatch.forEach((ops, key) => {
            if (!ops.every(finished)) return;
            // Nothing this batch supersedes, and nothing it beat, may still be readable.
            const owes = ops.some(op => (op.after || []).some(id => present.has(String(id)))
                || owedRetirements.has(op.opId));
            if (owes) return;

            try { Store.remove(key); } catch (error) { whole = false; }
            Store.forget(key);
            // The marks go only once the record they describe is PROVED gone. A removal
            // localStorage quietly refused used to take the retirement with it while the
            // beaten value was still on the disk - and a retirement is the only thing
            // keeping that value out of the projection, so the loser read as an ordinary
            // live candidate again at the next open and the day came back. The
            // acknowledgement is the same loss going the other way: taken off over a
            // record that is still there, the edit the cloud had already answered for
            // went out again at every open, for as long as the disk kept refusing.
            if (!Store.available || Store.durableGet(key) !== null) {
                whole = false;
                return;
            }
            ops.forEach(op => this.forgetQueueMarks(op));
        });

        // An item an older build left inside a slot record is finished the same way, and
        // it is RETIRED rather than rewritten out: the slot record is shared with every
        // other tab, and reading it, changing it and writing it back is the lost update
        // this whole file is built to refuse. The bytes stay; the item stops being
        // current, for good, in one small write of its own.
        legacyGone.forEach(op => {
            if (op.retired) return;
            if (!finished(op)) return;
            const key = outboxBeatKey(op.slot, op.opId);
            if (Store.setVerified(key, ACK_VALUE)) return;
            Store.forget(key);
            whole = false;
        });

        // A mark naming an operation nobody holds.
        //
        // Two ways one appears, and both are ordinary. A phone that upgraded once before
        // carries marks minted under an identity this build cannot compute - the scheme
        // was abandoned for not being injective - and no operation will ever wear those
        // names again. And a rescue file brings in marks belonging to another device's
        // operations. Either way they are queue keys by shape, so every projection reads
        // them and every rescue export carries them, and forgetQueueMarks cannot reach
        // them: it removes the marks of an operation that exists.
        //
        // Only when the whole queue read. An operation inside a record that would not
        // parse is not absent - it is unreadable - and its marks are the truth about it.
        if (!this.outboxDamaged && !decodedUnreadable) {
            this.queueKeys().forEach(key => {
                const kind = queueKeyKind(key);
                if (kind !== 'ack' && kind !== 'beat') return;
                const mark = kind === 'ack' ? ACK_MARK : BEAT_MARK;
                const opId = key.slice(key.lastIndexOf(mark) + mark.length);
                if (present.has(opId)) return;
                try { Store.remove(key); } catch (error) { /* bytes, not truth */ }
                Store.forget(key);
            });
        }

        return whole;
    },

    // The small records that hang off one operation - the acknowledgement and the
    // retirement. Removed only once the operation itself is gone, and never a reason to
    // report a failure: they are bookkeeping about bytes that no longer exist.
    forgetQueueMarks(op) {
        [outboxAckKey(op.slot, op.opId), outboxBeatKey(op.slot, op.opId)].forEach(key => {
            if (Store.durableGet(key) === null) return;
            try { Store.remove(key); } catch (error) { /* bytes, not truth */ }
            Store.forget(key);
        });
    },

    // The journal as the DISK holds it, oldest first. Returns null when it cannot be
    // read, which is not the same as empty and must never be treated as one.
    //
    // Everything a replacement decides is decided against these bytes rather than
    // against _outbox: memory is what this session believes, and after a refused write
    // the two disagree in exactly the way that matters.
    durableJournalEntries(envelope) {
        this.loadOutbox();
        if (!this._activeKey) return null;
        if (this.outboxDamaged) return null;
        return queueJournalEntries(this.physicalOperations(), envelope);
    },

    // The durable journal, replayed over `schedule`. False when the disk could not be
    // read - in which case the caller has no idea what this device holds and must not
    // pretend otherwise.
    //
    // `envelope` is a pending replacement, or nothing. Where it names the operations it
    // supersedes, they are skipped BY NAME; a number is a statement about one tab's
    // counter and another tab numbering from the same stale mark could hand an edit made
    // after the restore the same number as one made before it.
    replayDurableJournal(schedule, envelope) {
        // The fence goes to the PROJECTOR, not over its answer - see projectQueue.
        const entries = this.durableJournalEntries(envelope);
        if (!entries) return false;
        entries.forEach(([path, item]) => applyJournalEntry(schedule, path, item.value));
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
    replayJournal(schedule, envelope) {
        this.loadOutbox();
        queueJournalEntries(this.physicalOperations(), envelope)
            .forEach(([path, item]) => applyJournalEntry(schedule, path, item.value));
    },

    // The schedule has just been written to disk, so everything queued up to now is in it.
    // Told by State.save, because only State knows whether the write actually landed.
    markSaved() {
        this._savedSeq = this._seq;
        return this.pruneJournal();
    },

    // Kept for the callers that ask by this name. Collection is a separate pass now and
    // its failure changes nothing about which value is current - see collectQueueGarbage.
    pruneJournal() {
        return this.collectQueueGarbage();
    },

    // An entry goes only when BOTH are true: the cloud has it, and a schedule containing
    // it has been written here. Either one alone leaves something that cannot be rebuilt.
    //
    // Returns whether the disk holds the pruned queue.


    // Is anything on this disk held because it lost a race?
    //
    // Asked of the physical set rather than of memory: the hold is a record on the disk,
    // and a session that has just opened has to know about it before it sends anything.
    holdingContested() {
        this.loadOutbox();
        if (this._heldNow.size > 0) {
            const live = new Set([...this._outbox.keys()]);
            if ([...this._heldNow].some(path => live.has(path))) return true;
        }
        return this.physicalOperations().some(op => op.held && !op.retired);
    },

    // Write the hold down, and read it back.
    //
    // Returns whether the disk holds it. A hold that cannot be made durable is the one
    // case where memory has to be enough for this session - the alternative is sending a
    // write the server has already refused once - so the caller keeps the operation out
    // of the payload either way and says so.
    holdContested(paths) {
        this.loadOutbox();
        const wanted = new Set((paths || []).map(String));
        let allDurable = true;
        let anyHeld = false;
        this.physicalOperations().forEach(op => {
            if (op.retired || op.held) return;
            if (!wanted.has(op.path)) return;
            anyHeld = true;
            const key = outboxHoldKey(op.slot, op.opId);
            if (Store.durableGet(key) === ACK_VALUE) return;
            if (!Store.setVerified(key, ACK_VALUE)) allDurable = false;
        });
        return { held: anyHeld, durable: allDurable };
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

    // Is a WORK entry still queued against this man?
    //
    // A queue entry is an edit that has not reached the other two phones yet. A day or an
    // advance naming somebody who is about to be deleted is the dangerous kind: it can
    // land after the roster that no longer has him, and the phone receiving both is left
    // with a day belonging to nobody - which its own validation then refuses, on a
    // document nothing can repair.
    //
    // Roster entries naming him are deliberately NOT counted. They are what put him in
    // the list, and the deletion queues a tombstone and a new list at a HIGHER sequence,
    // so the later word wins wherever the two arrive. Counting them would mean a device
    // that has never had a cloud - where nothing is ever acknowledged and the journal
    // keeps everything - could never delete a name typed by mistake, which is the one
    // case deleting exists for.
    //
    // Asked of the DISK, because that is what the next session will replay.
    queueNamesWorker(workerId) {
        const id = String(workerId);
        const entries = this.durableJournalEntries();
        // Unreadable is not "no references". It is "no idea", and no idea is not a reason
        // to delete somebody.
        if (!entries) return true;

        return entries.some(([path, item]) => {
            const parts = path.split('.');
            if (parts[0] === 'days' && parts.length === 4) return parts[3] === id;
            if (parts[0] === 'advances') {
                return Boolean(item && item.value && String(item.value.workerId) === id);
            }
            return false;
        });
    },

    // ------------------------------------------------------------ provenance
    //
    // A permanent deletion is offered for one kind of entity only: one this device can
    // PROVE it made and PROVE never left. Everything else is archived, because once an id
    // is on another phone there is no statement this device can make about the future -
    // that phone can be holding a day for him right now, recorded offline, and nothing
    // here can see it.
    //
    // Two facts, both written down when they happen, and BOTH required:
    //
    //   mine - the id was minted on this device, by this build, in State.nextWorkerId or
    //          nextPlaceId. That is the only way an id can be born here. A worker read out
    //          of a v78 schedule at upgrade, one that arrived in a backup file, one that
    //          came out of a restore - none of them pass through that function, so none of
    //          them is ever in this set.
    //
    //   sent - a payload naming the id has been handed to an adapter, or the id has been
    //          seen in a snapshot. Recorded at the HANDOVER, not on acknowledgment: a
    //          write can land on the server and its answer be lost, so "we sent it" is
    //          the honest line.
    //
    // The direction of the question is the whole point. The record this replaced asked
    // "has it left?", so a MISSING record answered "nothing has ever left" - and a phone
    // upgrading from v78 has no record at all, which would have offered its entire crew
    // for permanent deletion on the first offline open. Asking "was it made here?" makes
    // absence answer no. Unreadable, refused, half-written, missing, migrated, imported,
    // restored: every one of them fails closed, and closed means archive.
    //
    // What makes `sent` sound rather than hopeful is that the outbox is keyed by field
    // path: queueing roster.workers.w_x = null REPLACES the pending roster.workers.w_x
    // entry outright, and the legacy array beside it is replaced by the new array at the
    // same moment. So an id that is still unsent is not merely "probably unused" -
    // deleting it removes the only writes that would ever have carried it.
    // ------------------------------------------------------------ reading the facts
    //
    // Every question goes to the disk. There is no cache: the other context is writing to
    // the same storage this second, and a cached answer is a stale one by the time it
    // matters.

    provGeneration() {
        const raw = Store.durableGet(PROV_GEN_KEY);
        const value = Number(raw);
        return Number.isSafeInteger(value) && value >= 0 ? value : 0;
    },

    // Anything at all that this device cannot account for. Set once and left set: an
    // export whose record could not be written, a v1 blob that will not parse, a
    // migration that did not complete. Absence of evidence is never read as safety.
    provenanceUncertain() {
        if (this._uncertainNow) return true;
        if (Store.durableGet(PROV_UNCERTAIN_KEY) !== null) return true;

        // A v1 blob that is present, unmigrated and unreadable. It may name people who
        // HAVE left, and there is no way to tell from here.
        const blob = Store.durableGet(PROVENANCE_KEY);
        if (blob === null || Store.durableGet(PROV_MIGRATED_KEY) !== null) return false;
        try {
            const parsed = JSON.parse(blob);
            return !isPlainObject(parsed) || !isPlainObject(parsed.mine) || !isPlainObject(parsed.sent);
        } catch (error) {
            return true;
        }
    },

    // Written once, and its failure is a fact in itself: if this cannot be stored, the
    // device is refusing writes, and refusing every deletion is the only safe reading.
    noteProvenanceUncertain() {
        return Store.setVerified(PROV_UNCERTAIN_KEY, '1');
    },

    // Something HAS left this device and the record of it did not land.
    //
    // Not the same as a failed attempt to record one: a backup that is refused because
    // the bookkeeping write failed never leaves, so nothing about the device changed and
    // everybody on it is still provably local. This is for the one export that is handed
    // over anyway - the rescue file, which exists to get unreadable bytes off a phone and
    // is never refused. There the file is gone and the proof is not, so every question
    // about who was only ever here is answered "cannot tell" for as long as the app is
    // open, and the disk that refused this write refuses the probe in canRecordProvenance
    // too, so the refusal survives a reopen on the same broken device.
    noteHandoverUnrecorded() {
        this._uncertainNow = true;
        // Still tried, in case there is room now. Either way the answer above stands.
        return Store.setVerified(PROV_UNCERTAIN_KEY, '1');
    },

    // Set for this session only. Everything else about provenance is read off the disk.
    _uncertainNow: false,

    // Whether this device can record a provenance fact AT ALL, asked once and remembered.
    //
    // The question behind the question: a phone that cannot write down that somebody's
    // record left it cannot be trusted to have written it down the last time one did.
    // Permanent deletion is the one action here with nothing behind it, so on a device
    // whose disk is refusing, the answer to "can I prove this man never left?" is no -
    // and it is no again after the app is closed and reopened, because the disk is still
    // refusing.
    //
    // A probe rather than a flag: Store.full only knows about writes that have already
    // been tried, and the first thing a fresh session does is not a provenance write.
    _canRecord: null,

    canRecordProvenance() {
        if (this._canRecord !== null) return this._canRecord;
        // OPTIONAL, and read back by hand. setVerified would be the obvious call and it
        // is the wrong one: a write that is not optional runs Store's reclaim ladder, and
        // the only thing that ladder can delete is restore points. Drawing the roster
        // asks this question once per person, so the obvious call would have a screen
        // that merely SHOWS a crew quietly eating the history it exists to protect.
        //
        // The value MOVES every session, and that is the whole of the test. Writing a
        // constant and reading it back proves only that a previous session managed it:
        // a phone whose disk started refusing between then and now would read its own
        // old probe, call itself able to record, and go on offering to destroy people.
        const next = String((Number(Store.durableGet(PROV_PROBE_KEY)) || 0) + 1);
        Store.set(PROV_PROBE_KEY, next, { optional: true });
        this._canRecord = Store.durableGet(PROV_PROBE_KEY) === next;
        return this._canRecord;
    },

    // The v1 blob, carried across into per-fact keys. Non-destructive: the blob is left
    // exactly where it is, and the marker that says it has been carried over is written
    // only once EVERY fact in it has been read back off the disk. A partial migration is
    // therefore indistinguishable from none, and both fail closed.
    migrateProvenance() {
        if (Store.durableGet(PROV_MIGRATED_KEY) !== null) return true;
        const blob = Store.durableGet(PROVENANCE_KEY);
        if (blob === null || blob === '') return true;

        let parsed = null;
        try { parsed = JSON.parse(blob); } catch (error) { parsed = null; }
        const half = side => isPlainObject(side)
            && Array.isArray(side.workers) && Array.isArray(side.places);
        if (!isPlainObject(parsed) || !half(parsed.mine) || !half(parsed.sent)) {
            this.noteProvenanceUncertain();
            return false;
        }

        const gen = Number(parsed.gen) || 0;
        let whole = true;
        ['workers', 'places'].forEach(kind => {
            parsed.sent[kind].forEach(id => {
                if (!Store.setVerified(provSentKey(kind, String(id)), '1')) whole = false;
            });
            parsed.mine[kind].forEach(id => {
                if (!Store.setVerified(provMineKey(kind, String(id)), String(gen))) whole = false;
            });
        });
        if (gen > this.provGeneration() && !Store.setVerified(PROV_GEN_KEY, String(gen))) {
            whole = false;
        }
        if (!whole) {
            this.noteProvenanceUncertain();
            return false;
        }
        return Store.setVerified(PROV_MIGRATED_KEY, '1');
    },

    // An id born here, this second. The only door into a `mine` fact.
    //
    // Stamped with the generation it was minted in, so a restore or an export that moves
    // the generation on invalidates it without having to find it - and a context still
    // holding an older generation writes a fact that is already invalid.
    markLocallyMinted(kind, id) {
        if (kind !== 'workers' && kind !== 'places') return false;
        this.migrateProvenance();

        const gen = this.provGeneration();
        // Written out even when it is zero, so the recovery file says which generation
        // these facts belong to rather than leaving whoever opens it to infer it from an
        // absent key. Best effort: reading treats absence as zero either way.
        if (Store.durableGet(PROV_GEN_KEY) === null) Store.setVerified(PROV_GEN_KEY, String(gen));

        return Store.setVerified(provMineKey(kind, String(id)), String(gen));
    },

    // Every id a payload carries out of the device, in whichever form it carries it: the
    // per-entity paths, the legacy whole arrays, a day, an advance, or a whole document.
    //
    // A day path names a worker as surely as a roster entry does - days.<date>.<layer>.<id>
    // puts that id in the cloud, and the phone reading it needs him to exist. Leaving days
    // and advances out of this was the same mistake as leaving out the arrays.
    idsLeaving(payload) {
        const found = { workers: new Set(), places: new Set() };
        if (!isPlainObject(payload)) return found;

        const fromList = (kind, list) => {
            (Array.isArray(list) ? list : []).forEach(item => {
                if (item && item.id !== undefined && item.id !== null) {
                    found[kind].add(String(item.id));
                }
            });
        };
        const fromMap = (kind, map) => {
            if (!isPlainObject(map)) return;
            Object.keys(map).forEach(id => found[kind].add(String(id)));
        };
        const fromEntries = record => {
            const entries = (record && Array.isArray(record.entries)) ? record.entries : [];
            entries.forEach(entry => {
                if (entry && entry.placeId !== undefined && entry.placeId !== null) {
                    found.places.add(String(entry.placeId));
                }
            });
        };

        Object.keys(payload).forEach(path => {
            const parts = path.split('.');
            const value = payload[path];

            if (parts.length === 1 && (parts[0] === 'workers' || parts[0] === 'places')) {
                fromList(parts[0], value);
                return;
            }
            if (parts[0] === 'roster' && parts.length === 3
                && (parts[1] === 'workers' || parts[1] === 'places')) {
                // The tombstone too. A null names the id just as loudly as a record does,
                // and it is the write that tells the other phones he existed.
                found[parts[1]].add(String(parts[2]));
                return;
            }
            if (parts.length === 1 && parts[0] === 'roster' && isPlainObject(value)) {
                fromMap('workers', value.workers);
                fromMap('places', value.places);
                return;
            }
            if (parts[0] === 'days' && parts.length === 4) {
                found.workers.add(String(parts[3]));
                fromEntries(value);
                return;
            }
            if (parts[0] === 'advances' && parts.length === 2 && isPlainObject(value)) {
                if (value.workerId !== undefined && value.workerId !== null) {
                    found.workers.add(String(value.workerId));
                }
            }
        });

        // A whole document - a seed, a save, or a snapshot - rather than a patch.
        fromList('workers', payload.workers);
        fromList('places', payload.places);
        if (isPlainObject(payload.roster)) {
            fromMap('workers', payload.roster.workers);
            fromMap('places', payload.roster.places);
        }
        if (isPlainObject(payload.days) || isPlainObject(payload.advances)) {
            const referenced = referencedEntityIds(payload);
            referenced.workers.forEach(id => found.workers.add(id));
            referenced.places.forEach(id => found.places.add(id));
        }
        return found;
    },

    // Records that these ids are leaving, and says whether the caller may hand the
    // payload over. See the handover in flush(): a false here holds the write in the
    // queue rather than letting it out ahead of the proof that it went.
    //
    // One key per id, so two contexts marking two different workers cannot overwrite one
    // another - which was the whole of the lost update this replaced.
    markSent(payload) {
        this.migrateProvenance();
        const found = this.idsLeaving(payload);

        let whole = true;
        ['workers', 'places'].forEach(kind => {
            found[kind].forEach(id => {
                const key = provSentKey(kind, id);
                // Already on the disk. Written once and never rewritten, so there is
                // nothing to do and nothing that can go wrong.
                if (Store.durableGet(key) !== null) return;
                if (!Store.setVerified(key, '1')) whole = false;
            });
        });
        if (whole) return true;

        // The record of the send cannot be stored, so the send does not happen. The one
        // exception is a device that is already uncertain: nothing is deletable there, so
        // there is nothing for a missing record to endanger, and refusing to sync as well
        // would be a much larger failure than the one being guarded against.
        return this.provenanceUncertain();
    },

    // The generation bump: everything this device made stops being provably its own.
    //
    // A whole-document replacement puts a roster here that this device did not make, and
    // an export is the same event seen from the other end - the file can be opened on
    // another phone, so nothing in it can still be "never left here" afterwards.
    //
    // One key moves and every mine fact in the old generation is invalidated at once.
    // Two contexts doing this at the same time both write the same next number and both
    // get the effect they asked for; a context still holding the old number cannot undo
    // it, because a mine fact stamped with an older generation is already invalid.
    forgetLocalOrigin(payload) {
        this.migrateProvenance();

        const next = this.provGeneration() + 1;
        const moved = Store.setVerified(PROV_GEN_KEY, String(next));

        // Belt, braces, and string. If the generation will not move, the uncertainty flag
        // says the same thing in one byte; if that will not store either, the mine facts
        // themselves are removed one at a time. Any one of the three closes the hole, and
        // the caller is told whether one of them did.
        let closed = moved;
        if (!closed) closed = this.noteProvenanceUncertain();
        if (!closed) closed = this.dropLocalOriginFacts();

        if (payload) this.markSent(payload);
        return closed;
    },

    // Every mine fact, removed. Only ever a fallback for a device that will not take a
    // write - the generation is the ordinary mechanism.
    dropLocalOriginFacts() {
        const prefix = PROV_PREFIX + 'mine:';

        // A disk that cannot be read cannot report an absence. The version this replaced
        // called remove() and then asked durableGet - and remove() had just declared
        // storage unavailable, so durableGet answered null for everything and every fact
        // read as gone. The device then said the handover was recorded, went on claiming
        // that everybody on it was only ever its own, and offered to destroy them.
        if (!Store.available) return false;

        let gone = true;
        Store.keys().filter(key => key.startsWith(prefix)).forEach(key => {
            if (!Store.removeVerified(key)) gone = false;
        });
        // And it has to still be readable at the end of it, or "none left" is a statement
        // about a disk that stopped answering halfway through.
        return gone && Store.available;
    },

    // The whole question, asked in one place: can this id be destroyed for good?
    provenLocalOnly(kind, id) {
        if (kind !== 'workers' && kind !== 'places') return false;
        // A device that cannot write cannot prove anything. See canRecordProvenance.
        if (!this.canRecordProvenance()) return false;
        // A migration that has not completed leaves facts on the disk in a form this does
        // not read, so it is asked to finish first - and if it cannot, the device is
        // uncertain and the answer below is no.
        this.migrateProvenance();
        if (this.provenanceUncertain()) return false;

        const key = String(id);
        if (Store.durableGet(provSentKey(kind, key)) !== null) return false;

        const minted = Store.durableGet(provMineKey(kind, key));
        if (minted === null) return false;
        return Number(minted) === this.provGeneration();
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

    // EVERY key the queue is written across on this device - every slot's mark, every
    // batch, every acknowledgement - so that whoever is copying this device off it copies
    // all of it.
    //
    // It used to be the ACTIVE slot's family alone, which is a different set the moment a
    // damaged mark moves recording along: the operations under the slot that was left are
    // still in the journal, still owed, and existed nowhere but on that disk.
    activeQueueKeys() {
        this.loadOutbox();
        return this.queueKeys();
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
        return this.dropOperations(this.physicalOperations().map(op => op.opId));
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
        return this.queueOperations(entries);
    },

    // Called on acknowledgment, and only then. An entry whose seq has moved on was
    // edited again while the send was open, and that newer value has not been sent yet.
    acknowledge(sent) {
        this.loadOutbox();
        // By operation id and nothing else. An acknowledgement is a statement about the
        // exact edit that left this device: the path may have been corrected since, on
        // this tab or another, and marking whatever now occupies it would tell the queue
        // the cloud holds a value it has never seen.
        const marked = this.markAcknowledged([...sent.values()]
            .map(item => item && item.opId).filter(Boolean));
        // Collection is allowed to fail; the acknowledgement is not undone by it.
        this.collectQueueGarbage();
        return marked;
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
        if (this.pendingReplace()) return true;

        // A legacy record whose frozen boundary cannot be read. pendingReplace() answers
        // null for it, which is right - nothing may ACT on it - but null used to mean
        // "carry on as normal", and carrying on is the destructive half: an ordinary send
        // is acknowledged, an acknowledged entry inside a written schedule is pruned, and
        // the queue loses exactly the edits that transaction would have replayed once its
        // boundary was readable again. So it is outstanding too.
        return this.replaceHeld;
    },

    // The journal position an outstanding replacement has superseded, or 0.
    //
    // Entries at or below it describe the state that restore is replacing, so replaying
    // them - at boot, or over a snapshot that has just arrived - puts back precisely the
    // days it removed. That is the resurrection: the restore is on the disk, the queue
    // still holds the entries it superseded because the prune was refused, and the next
    // open lays them straight back on top of it.
    // The pending replacement itself, so the replay can skip what it NAMES rather than
    // what a number happens to cover.
    supersededFloor() {
        return this.pendingReplace();
    },






};
