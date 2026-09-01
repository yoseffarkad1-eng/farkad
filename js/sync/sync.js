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
        const built = {
            opId: String(op.opId), path: String(op.path), value: op.value, seq: op.seq,
            after: Array.isArray(op.after) ? op.after.map(String) : []
        };
        if (Object.prototype.hasOwnProperty.call(op, 'base')) built.base = op.base;
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
            // provenance is gone. `null` means the server had nothing at this path, which
            // is a different statement from "no base was recorded" and has to survive
            // JSON to stay different.
            const built = canonicalJson(this.baseValueAt(entry.path));
            ops.push({
                opId: opIdNow(),
                path: entry.path,
                value: entry.value,
                seq,
                base: built === undefined ? null : built,
                // Everything on the disk for this path, superseded by this one. Not only
                // the projected winner: a loser left behind by a failed collection is
                // still a record that could otherwise come back.
                after: (bySameId.get(entry.path) || []).slice()
            });
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

        // The schedule as the NEXT session would read it, parsed once. Cached on its own
        // bytes: collection runs on every save and every acknowledgement, and a season's
        // record is not something to re-parse per operation.
        const raw = Store.durableGet(SCHEDULE_KEY);
        let stored = null;
        if (raw !== null) {
            if (this._storedCache && this._storedCache.raw === raw) {
                stored = this._storedCache.schedule;
            } else {
                try { stored = JSON.parse(raw); } catch (error) { stored = null; }
                this._storedCache = { raw, schedule: stored };
            }
        }

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

    connect(adapter) {
        // One subscription per session, whatever calls this and however often.
        //
        // onAuthStateChanged fires again on a token refresh, on a re-sign-in, and after
        // Recovery is acknowledged and the cloud is started for the first time in a
        // session that booted blocked. Every one of those used to add a listener beside
        // the last one, so the same snapshot arrived twice and receive() ran twice on it
        // - two adoptions, two archive attempts, and two flushes racing each other with
        // the same queue behind them.
        this.stopListening();

        this.adapter = adapter;
        this.loadOutbox();
        this._recoveryHold = false;
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

        const stop = adapter.subscribe(
            snapshot => this.receive(snapshot),
            error => this.fail(error)
        );
        this._unsubscribe = typeof stop === 'function' ? stop : null;

        // Anything left over from a previous session goes out as soon as there is
        // somewhere to send it. The replacement goes first: the queued field edits
        // belong to a state it is about to replace.
        if (this.pendingReplace()) this.resumeReplace();
        else if (this.pendingCount() > 0) this.scheduleFlush();
    },

    disconnect() {
        this.adapter = null;
        // Whatever this session heard belonged to a connection that is gone. The next one
        // starts from silence, and the barrier closes again.
        this._heardFromCloud = false;
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

    // Whatever this session was listening to, stopped. Called before subscribing again,
    // never on sign-out: disconnect() deliberately leaves the connection alone, because
    // signing out is not a reason to stop hearing what the other phones are doing until
    // the page is gone.
    _unsubscribe: null,

    stopListening() {
        const stop = this._unsubscribe;
        this._unsubscribe = null;
        if (typeof stop !== 'function') return;
        try {
            stop();
        } catch (error) {
            console.error('Could not stop the previous subscription:', error);
        }
    },

    // ------------------------------------------------------- held back by Recovery
    //
    // A device that opened onto a damaged record does not start the cloud at all: the
    // import is skipped, so nothing connects, and until v79 nothing ever started it
    // again either. Acknowledging the damage turned writing back on and left this
    // device alone with them - recording all evening, saying "הנתונים נשמרים במכשיר
    // הזה בלבד", with the other two phones seeing none of it.
    //
    // So the state is named rather than left looking like an ordinary local-only app,
    // and acknowledging is what releases it.
    _recoveryHold: false,

    holdForRecovery() {
        this._recoveryHold = true;
        if (this.status === 'off') this.setStatus('blocked');
    },

    releaseRecoveryHold() {
        this._recoveryHold = false;
        // Back to 'off' and no further: the cloud is starting, not started. The adapter
        // says 'connecting' when it actually connects, and a project with no Firebase
        // configured never does - "מתחבר לענן…" for ever would be a worse lie than the
        // one this replaces.
        if (this.status === 'blocked') this.setStatus('off');
    },

    // WHAT 'synced' ACTUALLY CLAIMS, and why it is checked at one door.
    //
    // It says: everything this person recorded is on the other two phones. Six callers
    // could set it, and every one of them was right about its own half - a snapshot
    // adopted, a batch acknowledged, a restore finished - while being wrong about the
    // whole. Measured: a device with six roster operations held behind the initial
    // snapshot barrier sent one safe day patch, acknowledged it, and the line read
    // "מסונכרן" with six still on the disk. Then back to "מתחבר", then synced again. A
    // person watching that has been told the opposite of the truth, twice.
    //
    // So the claim is tested here rather than at six call sites, and it returns the
    // status that IS true instead. Nothing about this makes a status stickier: the moment
    // the queue empties the next setStatus('synced') is allowed through.
    honestStatusFor(status) {
        if (status !== 'synced') return status;
        // A record this device could not read. Nothing may be called finished while the
        // financial history is uncertain - see js/recovery.js.
        if (typeof farkadWritesBlocked === 'function' && farkadWritesBlocked()) return 'blocked';
        // A whole-document restore that has not reached the cloud. The most dangerous
        // thing this app queues, and the one a person is most likely to walk away from.
        if (this.pendingReplace()) return 'sending';
        // A write the server refused and this device has stopped offering. It is owed,
        // it is durable, and it is not going anywhere until a person looks at it - so it
        // is neither 'synced' nor the 'sending' that says something is on its way.
        if (this.holdingContested()) return 'contested';
        // Anything still owed, whatever went out beside it. A partial send is not a send.
        if (this.pendingCount() > 0) return 'sending';
        // And work the ladder is still going back for.
        if (this._retryTimer) return 'sending';
        return 'synced';
    },

    setStatus(status, error) {
        const said = this.honestStatusFor(status);
        this.status = said;
        this.lastError = error || null;
        if (said === 'synced') {
            this.lastSyncedAt = new Date();
        }
        updateSyncNotice();
    },

    fail(error) {
        console.error('Sync error:', error);
        // A HELD PATH IS NOT A FAILURE, and gets its own line.
        //
        // The server refusing to let an older write put back a value somebody else
        // corrected is the protocol working, and the edit is safe on this disk. Reported
        // as 'error' it wore the same sentence a tunnel produces - so the one situation a
        // person can actually resolve looked like the one they cannot.
        //
        // Decided HERE rather than at the throw site because a conflict reaches this
        // function by more than one route - the rebase ceiling, a second conflict on the
        // retry - and a status set on only one of them is a status that appears
        // sometimes.
        this.setStatus(error && error.contested && error.contested.length > 0
            ? 'contested' : 'error', error);
    },

    // The right to send is stuck, and a person can see it. See claimIsFree.
    noteClaimTrouble(why) {
        if (this._claimStuck) return;
        this._claimStuck = true;
        this.setStatus('claimstuck', new Error(why));
    },

    // Cleared the moment a claim is actually taken, so a fault that healed does not leave
    // the screen alarming about it.
    clearClaimTrouble() {
        if (!this._claimStuck) return;
        this._claimStuck = false;
        if (this.status === 'claimstuck') this.setStatus('connecting');
    },
    _claimStuck: false,

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

        // The daily copy is a whole document, so it takes the whole roster out of the
        // device just as a save does - and the same rule applies to it. Not marked as
        // archived-today either, so the next snapshot tries again once there is room.
        const document = cloudDocument(schedule);
        if (!this.markSent(document)) return;
        this._archivedOn = key;

        Promise.resolve(this.adapter.archive(key, document)).catch(error => {
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
    // all three devices are past v79 - not before.
    // `removed` names entities that are gone from the roster on purpose, so their
    // tombstones go out even when this device has never seen a snapshot and therefore has
    // no _remoteRoster to notice the absence against.
    editRoster(schedule, removed) {
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
            const gone = new Set(Object.keys(known).filter(id => !here.has(String(id))));
            ((removed && removed[kind]) || []).forEach(id => {
                if (!here.has(String(id))) gone.add(String(id));
            });
            gone.forEach(id => put(`roster.${kind}.${id}`, null));

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
            // Nothing is scheduled for a HELD one: there is nothing a retry could do
            // except come back and find the same unreadable record.
            if (!this._replacing && !this._retryTimer && !this.replaceHeld) {
                this.scheduleRetry();
            }
            return Promise.resolve();
        }

        // A roster edit that still names somebody the cloud has tombstoned. Nothing at
        // all goes out until the queue has been cleaned, because the entries travel
        // together and the whole array is in there with him.
        if (this.staleRosterHeld()) {
            this.scheduleRetry();
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
        if (this._sending.size > 0 || this._cloudOpen > 0 || this._claiming) {
            // Waiting on a write that has not answered. Said on screen if it goes on -
            // and said is all it does. See watchForStuck.
            this.watchForStuck();
            return Promise.resolve();
        }

        // The claim is asked for, and NOT WAITED FOR.
        //
        // It used to be a gate: a tab that could not get it did not send, and came back
        // later. That was the only thing standing between two tabs and a lost update,
        // because the server took whatever arrived and kept the last of it. It is not any
        // more - every write carries the revision it was built on, the server refuses one
        // built on a base that has moved, and a path another tab changed in between is
        // held rather than overwritten. See docs/sync-protocol.md.
        //
        // As a gate it had a failure with no floor. A tab suspended with its request still
        // open keeps the claim - correctly, because that request may yet land and stealing
        // it would risk sending the same edit twice - and every other tab then waits
        // behind it. Measured on two tabs of one browser: the second tab's day sat in its
        // queue, unsent, status "connecting", while the sleeping tab's write was the only
        // thing the cloud ever saw. A backgrounded client must not be able to lock the
        // others out, and under the old rule it could, for as long as it stayed asleep.
        //
        // So it is a courtesy now. Holding it keeps the ordinary case to one writer, which
        // costs the server fewer refusals; not holding it costs a rebase. Neither can lose
        // an edit, and that is the whole of the difference.
        this._claiming = true;
        return this.takeSendClaim()
            .then(() => this.sendClaimed())
            .then(
                value => { this.releaseSendClaim(); this._claiming = false; return value; },
                error => { this.releaseSendClaim(); this._claiming = false; throw error; }
            );
    },

    // The send itself, with the right to send already held. Split out of flush so that
    // every path back through it gives the claim up again - including the early returns.
    sendClaimed() {
        // Oldest first, so a queue too big for one write drains in the order it was
        // made rather than leaving the earliest days for last.
        // Nothing that carries a roster opinion until the first snapshot has arrived and
        // been sanitised - see the block above noteCloudHeard. The rest of the queue is
        // sent as usual, and `sent` is built from what ACTUALLY went out, so the entries
        // held back here are not acknowledged and not pruned.
        const held = !this._heardFromCloud;
        const patch = {};
        const sent = new Map();
        let holding = false;
        // A BATCH, not an operation. The hold names one operation, but a batch was written
        // once and is atomic - sending the rest of it would be splitting it to get part of
        // a write out, which is the one thing the batch record exists to prevent. A
        // DIFFERENT batch is untouched: a held write is not a broken connection, and the
        // rest of the evening still has to go.
        // FILLED BEFORE IT IS ASKED. This Set was created empty and never added to, so
        // the question below it always answered no and the guarantee in the paragraph
        // above was not enforced at all: the held path was skipped and its partner went
        // out alone, on the next trigger, and was acknowledged. Measured in
        // tests/contested.test.mjs - one batch, two days, one of them contested, and the
        // other landing by itself with the queue dropping to one.
        //
        // Read off the in-memory queue, which is the same map the send below walks, so
        // this costs one pass over what is already there rather than a read of the disk.
        // MOVED UNDER THIS EDIT, asked BEFORE the write goes out.
        //
        // The conflict branch cannot catch this one. A phone that comes back, hears the
        // winner's document and only then flushes is not refused by anything: its
        // revision is current, so its queued value is a perfectly valid next write and
        // the server takes it - straight over the correction somebody else made. Nothing
        // is contested because nothing collided; the collision already happened, while
        // this phone was away.
        //
        // So the question is asked of the record instead: the operation wrote down what
        // the server held at this path when the person made the edit, and if what the
        // server holds now is something else, somebody corrected it in between. That is a
        // decision, exactly as it is in the conflict branch, and it is held the same way.
        //
        // AND ONLY WHEN SOMEBODY ELSE PUT IT THERE - the same rule and for the same
        // reason: two tabs of one app share a device id, and the person's own later
        // correction must win rather than be held against them.
        const wroteLast = String((this._baseDoc || {}).updatedBy || '');
        const someoneElse = wroteLast !== '' && wroteLast !== String(syncDeviceId());
        const movedUnder = [];
        this._outbox.forEach((item, path) => {
            if (item.sent || item.held || this._heldNow.has(String(path))) return;
            if (!someoneElse || item.base === undefined) return;
            const built = item.base === null ? undefined : item.base;
            if (canonicalJson(this.baseValueAt(path)) === built) return;
            movedUnder.push(String(path));
        });
        if (movedUnder.length > 0) {
            const wrote = this.holdContested(movedUnder);
            if (!wrote.durable) {
                movedUnder.forEach(path => this._heldNow.add(String(path)));
            }
        }

        const heldBatches = new Set();
        this._outbox.forEach((item, path) => {
            if (item.sent) return;
            if (item.held || this._heldNow.has(String(path))
                || movedUnder.indexOf(String(path)) !== -1) {
                heldBatches.add(item.batchKey);
            }
        });
        [...this._outbox.entries()]
            .filter(([, item]) => !item.sent)
            .filter(([path, item]) => {
                if (!item.held && !heldBatches.has(item.batchKey)
                    && !this._heldNow.has(String(path))
                    && movedUnder.indexOf(String(path)) === -1) return true;
                holding = true;
                return false;
            })
            .sort((a, b) => a[1].seq - b[1].seq)
            .filter(([path]) => {
                if (held && this.rosterShaped(path)) { holding = true; return false; }
                return true;
            })
            .slice(0, MAX_PATHS_PER_WRITE)
            .forEach(([path, item]) => {
                patch[path] = item.value;
                // The OPERATION that went out, not the path. Two versions of one path are
                // two operations, and an acknowledgement naming only the path
                // acknowledged whichever one happened to be there when the answer came
                // back - which, after another tab had corrected the same day, was not the
                // one that was sent.
                sent.set(path, { opId: item.opId, seq: item.seq });
            });

        if (holding) {
            // Something is being kept back, so this device is not up to date whatever
            // else happens. The retry ladder comes round again, and the snapshot it is
            // waiting for usually arrives long before that.
            //
            // EXCEPT for a contested hold, which is not waiting for anything. The roster
            // barrier lifts when a snapshot arrives; a hold lifts when a person decides.
            // A ladder ticking against it would be the app asking the same refused
            // question every few seconds for the rest of the evening.
            if (!this.holdingContested()) this.scheduleRetry();
            if (this.status === 'synced') this.setStatus('connecting');
        }
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

        // BEFORE the handover, and it has to have reached the disk.
        //
        // The order is the guarantee. Marking after the send, or marking without reading
        // the answer, both leave the same hole: the write goes out and lands, the record
        // that says so is refused by a full disk, the queue is acknowledged and pruned,
        // and at the next open this device knows only that it has a worker with nothing
        // recorded against him and no proof he ever left - so it offers to delete a man
        // the other two phones are using. Nothing about that sequence looks like a fault
        // while it is happening.
        //
        // So the payload does not leave until the proof is durable. If it cannot be
        // stored the queue keeps everything, the failure is reported as what it is, and
        // the retry ladder tries again - by which time there may be room. Nothing local
        // is lost either way: the journal already holds the edits.
        if (!this.markSent(patch)) {
            this._sending = new Map();
            this.fail(new Error('the record of what has been sent could not be stored; the update is still queued'));
            this.scheduleRetry();
            return Promise.resolve();
        }

        // The claim moving is no longer a reason to stand down.
        //
        // It was, and it had to be: the payload was built from a disk another tab might
        // have written since, and there was nothing on the server able to catch a stale
        // write. Now there is. A payload built on a base that has moved is refused by its
        // revision, and a path the other tab changed is held rather than put back - so
        // standing down here buys nothing, and costs the one thing it cannot afford:
        // a tab that never sends because another one is asleep with a request open.

        this._sending = sent;
        this._stamp = null;

        // THE ORDERING ENVELOPE, stamped last, onto the patch that is about to leave.
        //
        // Computed from the batch every time rather than cached. It is already stable for
        // one batch by construction - the digest is over the operations themselves - so
        // caching it bought nothing and cost everything: a cached id carried from the
        // create of the document into the NEXT batch, the server found the receipt the
        // create had written, answered "already applied", and the day was silently
        // swallowed. Status said synced, the queue was pruned, and the evening was in no
        // document anywhere. Which is exactly the failure the receipt exists to prevent,
        // arriving through the receipt.
        this._sendOpId = this.operationIdFor(sent);
        this.stampProtocol(patch, this._sendOpId);

        // Through the chain, so that a whole-document replacement started after this one
        // cannot land before it. createDocument is inside the same slot on purpose - it
        // is this write, taking the other branch, not a second one.
        return this.cloudWrite(() => {
            // CUTOVER FIRST, when this device has never been told a revision.
            //
            // _revision is null in exactly two situations, and both are handled by asking
            // the server rather than guessing: the document does not exist yet, or it
            // exists and predates the protocol. In the second, the compare-and-set is
            // asleep - a document with no revision refuses nothing, so a patch built
            // months ago lands whole, business paths and all, over whatever another phone
            // corrected this evening.
            //
            // So nothing a person recorded goes out until there is a revision to send it
            // against. bootstrapCutover moves the document into the protocol without
            // touching a single business field, rereads it, and hands back the
            // authoritative document; the patch is then judged against that, and only
            // then sent. See bootstrap() in js/sync/firebase-adapter.js.
            const first = this._revision === null && this.adapter
                && typeof this.adapter.bootstrap === 'function'
                ? this.bootstrapCutover()
                : Promise.resolve();

            // Named, because it calls itself. A refusal that turns out to be a race is
            // re-entered here as the conflict it actually was, rather than left to the
            // retry ladder two seconds later.
            const onFailure = error => {
                // Not an edge case: this is the first write of every new project. Inside
                // the same slot on purpose - this write taking the other branch, not a
                // second one.
                if (error && error.code === 'not-found') return this.createDocument(patch);

                // A REFUSAL THAT IS REALLY A RACE, told apart by looking.
                //
                // The adapter's transaction reads the document, checks the revision, and
                // throws a conflict when it has moved. Between that read and the commit
                // another phone can land - and then the RULES refuse, at commit, as
                // permission-denied. Same situation, different word, and the difference
                // was the whole of the outcome: a conflict is rebased and merges, while
                // permission-denied went to the error status and sat on the retry ladder
                // showing "sync error" for what was an ordinary two-people-one-evening
                // merge. Measured with two phones racing the cutover.
                //
                // So the refusal is checked against the document rather than taken at its
                // word. If the revision has moved, this is the conflict the transaction
                // would have thrown a moment earlier, and it goes through the same
                // machinery - contested paths held, disjoint paths rebased, and the same
                // ceiling. If it has not moved, the refusal is about something else -
                // an address that is not on the list, a shape the rules reject - and it
                // stays exactly what it was.
                if (error && error.code === 'permission-denied'
                    && this.adapter && typeof this.adapter.read === 'function'
                    && Number.isInteger(patch.revision)) {
                    return Promise.resolve(this.adapter.read()).then(fresh => {
                        const held = fresh && fresh.revision;
                        if (!Number.isInteger(held) || held !== patch.revision - 1) {
                            const moved = new Error('the document moved while this write was in flight');
                            moved.code = 'conflict';
                            moved.revision = Number.isInteger(held) ? held : 0;
                            moved.document = fresh || null;
                            return onFailure(moved);
                        }
                        throw error;
                    }, () => { throw error; });
                }

                // THE DOCUMENT MOVED. Somebody else wrote between the base this write was
                // built on and the moment it arrived.
                //
                // Rebasing and sending the SAME operation again is not a retry that could
                // duplicate anything: the operation id is derived from the batch, so if
                // the first attempt did land, the server answers from its receipt. What
                // changes is only the revision the write claims.
                //
                // It is what keeps disjoint edits merging. Two people filling in one
                // evening write different field paths; the second is refused for being
                // built on a stale base, and without a rebase its day would be held for a
                // conflict that is not one. Bounded, because a device that cannot get a
                // word in after several tries is a device that should say so rather than
                // spin.
                if (error && error.code === 'conflict' && this._rebases < CAS_REBASE_LIMIT) {
                    // Only when nothing this write touches has moved. A path whose value
                    // on the server is still what the base held is a path nobody
                    // corrected, and rebasing it is the ordinary two-people-one-evening
                    // merge. A path that HAS moved is a contest, and the write built on
                    // the older base does not get to put the old value back.
                    // THE TRANSACTION'S OWN DOCUMENT, and nothing else.
                    //
                    // This read `error.document || this._latestRaw`, and the fallback was
                    // the fault. _latestRaw is the last thing onSnapshot delivered - a
                    // different channel from the transaction's read, with no ordering
                    // between them - so a refusal that arrived before its snapshot was
                    // compared against a document one revision behind, where the path
                    // somebody had just corrected still held the value this write was
                    // built on. Uncontested, rebased, and the correction overwritten.
                    //
                    // With no document there is nothing this client can honestly compare,
                    // so it compares nothing: contestedPaths answers "all of them" for a
                    // base it cannot read, the write is held, and the person is told. An
                    // adapter that does not carry the document costs a delay; one that
                    // lets a stale listener decide costs somebody's correction.
                    const contested = this.contestedPaths(patch, error.document);
                    if (contested.length === 0) {
                        if (!error.cutover) this._rebases += 1;
                        if (Number.isInteger(error.revision)) this._revision = error.revision;
                        this.stampProtocol(patch, this._sendOpId);
                        // Through the same handler, because a rebase can lose too. Two
                        // phones coming back at once take several passes to settle, and a
                        // second refusal used to escape to the retry ladder - correct, and
                        // two seconds of "sync error" for a merge that was one call away.
                        // Bounded by the same ceiling: _rebases is not reset here.
                        return Promise.resolve(this.adapter.update(patch)).catch(onFailure);
                    }
                    error.contested = contested;
                    // HELD, DURABLY, BY ITS OWN ID - and this is the line the whole of
                    // tests/contested.test.mjs exists for.
                    //
                    // Attaching the paths to the error set the status and nothing else.
                    // The operation stayed in the outbox with sent:false and a retry
                    // scheduled, so it was still a live write, and the WINNER'S SNAPSHOT
                    // was what set it off: adopting the winner replaces the base this
                    // write is compared against, the path stops looking contested, and
                    // the next flush puts the old value back over the correction somebody
                    // else had just made. Both phones then said synced.
                    //
                    // A hold that cannot be written down is not a reason to send the
                    // write. `_heldNow` keeps it out of the payload for this session even
                    // when the disk refuses the marker, and the failure is reported as
                    // itself - fail closed, because the alternative is offering the server
                    // a write it has already refused once, over somebody's correction.
                    // ONLY A PATH THIS DEVICE CAN SHOW HAS MOVED.
                    //
                    // contestedPaths deliberately answers "all of them" when it cannot
                    // compare - a refusal that arrived without its document, or a write
                    // whose frozen base was lost, or the cutover, where the base is `{}`
                    // at every path because this device had never seen the document at
                    // all. Refusing to send is the careful direction to be wrong in for
                    // ONE attempt. As a permanent decision it is a different thing
                    // entirely: it would hold the whole queue of a phone that has just
                    // met the document, for ever, and the cutover would never complete.
                    //
                    // So a hold is written down only where the base RECORDED a value for
                    // that path and the server's differs. That is somebody's correction,
                    // and it is a decision. Everything else goes on down the retry ladder
                    // exactly as it did, and the next attempt carries a real base and
                    // settles it either way.
                    //
                    // AND ONLY WHEN SOMEBODY ELSE PUT IT THERE. Two tabs of one app are
                    // one device sharing one disk and one device id: the older tab's write
                    // lands, the newer tab's is refused, and the path HAS moved - but it
                    // moved under this person's own earlier edit, and their correction has
                    // to win. Holding there would throw away the correction the same
                    // person just made, which is this defect inverted.
                    //
                    // The value's author is the only signal that survives: by the time the
                    // refusal is handled, the operation that produced it has usually been
                    // acknowledged and collected off this disk, so asking the queue whether
                    // it ever held that value answers no even when it did.
                    const base = this._sendBase;
                    const wroteIt = String((error.document || {}).updatedBy || '');
                    const someoneElse = wroteIt !== '' && wroteIt !== String(syncDeviceId());
                    const moved = (!error.cutover && someoneElse && error.document
                        && typeof error.document === 'object'
                        && base && typeof base === 'object')
                        ? contested.filter(path =>
                            Object.prototype.hasOwnProperty.call(base, String(path)))
                        : [];
                    if (moved.length > 0) {
                        const wrote = this.holdContested(moved);
                        if (!wrote.durable) {
                            moved.forEach(path => this._heldNow.add(String(path)));
                            console.error('a contested write could not be held on the '
                                + 'disk; it is held in memory for this session');
                        }
                    }
                    // SAID AS ITSELF, not as "something went wrong".
                    //
                    // A held path is not a failure - the server is doing exactly what it
                    // was built to do, refusing to let an older write put back a value
                    // somebody else corrected - and the edit is safe on this disk. But it
                    // reported as 'שגיאת סנכרון', the same line a tunnel produces, so the
                    // one situation a person can actually resolve looked like the one they
                    // cannot.
                    //
                    // A LINE, not the modal the design drew. A dialog raised from a
                    // background flush lands on whoever is mid-way through recording a
                    // day, and this app does not take the keyboard away from somebody to
                    // tell them something that can wait for them to look up. The words are
                    // the design's, and they say what happened, that nothing was lost, and
                    // what to do.
                }
                throw error;
            };

            return first
                .then(() => Promise.resolve(this.adapter.update(patch)))
                .catch(onFailure);
        })
            .then(() => {
                // Only now. Up to this point the edits were on disk and would have been
                // replayed by the next session; from here the cloud is holding them.
                const acked = this.acknowledge(sent);
                this._sending = new Map();
                this._retryAt = 0;
                // AND THE TIMER WITH IT. _retryAt was reset and the pending timer left
                // running, so a ladder scheduled before a successful send went on ticking
                // for work that had already landed - which is harmless on its own and is
                // not once the status asks whether a retry is outstanding.
                clearTimeout(this._retryTimer);
                this._retryTimer = null;
                this._rebases = 0;
                this._sendBase = null;

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
                this._sendBase = null;
                this.fail(error);
                this.scheduleRetry();
            });
    },

    // How long the claim is left to settle before it is read back. A property so the
    // suites can spell the same race in milliseconds instead of seconds.
    claimSettleMs: SEND_CLAIM_SETTLE_MS,
    _claimToken: null,
    // True from the moment the claim is asked for until the send it guards is answered.
    // Without it a second flush in this same tab would start while the first was still
    // waiting out the settle, and the two would race each other through one claim.
    _claiming: false,

    // The timer that keeps saying "still working". Null whenever nothing is owned.
    _claimBeat: null,

    // Is the claim on the disk free to take?
    //
    // Free means: nothing there, or an owner that has stopped saying it is alive. It does
    // NOT mean bytes nobody can read - those are somebody's live claim seen through a
    // half-finished write, and treating them as an empty cloud is the assumption this
    // whole section exists to refuse. A quarantined copy is kept, once, so the person who
    // eventually asks what happened has the evidence rather than a guess.
    claimIsFree(held) {
        if (!held) return true;
        if (held.unreadable) {
            const kept = this.quarantineSendClaim();
            this._claimDamage = (this._claimDamage || 0) + 1;

            if (this._claimDamage >= CLAIM_DAMAGE_LIMIT) {
                this.noteClaimTrouble(kept
                    ? 'the record that coordinates sending cannot be read'
                    : 'the record that coordinates sending cannot be read or copied');
            }
            return false;
        }
        if (held.token === this._claimToken) return true;
        return (Date.now() - held.beat) >= SEND_CLAIM_STALE_MS;
    },

    // Kept, not deleted, and only once: a second copy under one key would write over the
    // evidence the first one preserved.
    //
    // Deliberately NOT through Recovery.damaged. That path is for a record that is
    // somebody's WORK - it puts a problem on the screen and can hold every write on the
    // device until a person acknowledges it, which is right for a day nobody can read and
    // wrong for a coordination record. Losing the right to send costs a delay; being
    // unable to record costs the evening. The bytes are preserved under the same
    // :damaged suffix everything else uses, so the rescue file carries them and whoever
    // eventually asks what happened has the evidence rather than a guess.
    // Answers whether the bytes are safe somewhere other than the record they are in.
    // Every path used to answer nothing at all, so the caller's `kept` was always
    // undefined and the app recorded "cannot be read OR COPIED" over a copy it had just
    // made and verified. Telling somebody their bytes were lost when they were not is the
    // same untruth as a green tick over a failed save, pointed the other way.
    quarantineSendClaim() {
        const key = SEND_CLAIM_KEY + ':damaged';
        // Already done, or already there from an earlier session: the copy exists either
        // way, which is what the caller is asking about.
        if (this._claimQuarantined) return this._claimKept;
        this._claimQuarantined = true;
        const raw = Store.durableGet(SEND_CLAIM_KEY);
        // Nothing to copy is not a failure to copy. There is no record here to lose.
        if (raw === null) return (this._claimKept = true);
        if (Store.durableGet(key) !== null) return (this._claimKept = true);
        return (this._claimKept = Store.setVerified(key, raw) === true);
    },
    _claimQuarantined: false,
    _claimKept: false,

    // The raw bytes of the send claim, but only when nobody can read them.
    //
    // For the rescue export, which cannot ask readSendClaim itself: that function is not
    // exported and answering "unreadable" is the whole of the question. A claim that
    // parses is this session's lock and is deliberately NOT handed back - see the block
    // in js/recovery.js that calls this.
    unreadableSendClaim() {
        const held = readSendClaim();
        if (!held || !held.unreadable) return null;
        return Store.durableGet(SEND_CLAIM_KEY);
    },

    // Takes the right to send, or answers false. See SEND_CLAIM_KEY.
    takeSendClaim() {
        // A browser that stores nothing has no way to coordinate with anything, and
        // refusing to sync would be a far larger failure than the one being guarded
        // against - there is no second tab sharing a disk that does not exist.
        //
        // Unless there IS one, and this session has already read its claim. Storage can go
        // unavailable mid-session - a quota error routes through Store.fallback - and this
        // exception then reopened the uncoordinated door on a device that had just been
        // reading another tab's damaged claim off a disk that plainly does exist.
        if (!Store.available) {
            if (!this._claimDamage) return Promise.resolve(true);
            this.noteClaimTrouble('the disk stopped answering while another tab was sending');
            return Promise.resolve(false);
        }

        const now = Date.now();
        if (!this.claimIsFree(readSendClaim())) return Promise.resolve(false);

        const token = opIdNow();
        if (!Store.setVerified(SEND_CLAIM_KEY,
            JSON.stringify({ by: syncDeviceId(), token, at: now, beat: now }))) {
            // No room for the claim. Sending anyway would be sending uncoordinated, which
            // is the thing this exists to stop.
            Store.forget(SEND_CLAIM_KEY);
            return Promise.resolve(false);
        }

        return new Promise(resolve => {
            setTimeout(() => {
                const after = readSendClaim();
                const mine = Boolean(after) && !after.unreadable && after.token === token;
                this._claimToken = mine ? token : null;
                if (mine) {
                    this._claimDamage = 0;
                    this.clearClaimTrouble();
                    this.startClaimBeat();
                }
                resolve(mine);
            }, this.claimSettleMs);
        });
    },

    // While this tab owns the claim it says so, on a timer, for as long as the request it
    // guards is open. The other tab measures staleness from the last one of these - so an
    // owner whose write is slow is never mistaken for an owner that is gone, and an owner
    // that really has gone stops beating and is taken over exactly as before.
    startClaimBeat() {
        this.stopClaimBeat();
        if (typeof setInterval !== 'function') return;
        this._claimBeat = setInterval(() => {
            if (!this._claimToken) { this.stopClaimBeat(); return; }
            const held = readSendClaim();
            // Somebody else's now, or bytes nobody can read. Either way this tab has
            // stopped owning it and must not write over whatever is there.
            if (!held || held.unreadable || held.token !== this._claimToken) {
                this._claimToken = null;
                this.stopClaimBeat();
                return;
            }
            // The answer is read. A heartbeat the disk refused, or accepted and stored as
            // something else, used to leave this tab believing it still owned a claim the
            // other tab would take twenty seconds later. Ownership that cannot be renewed
            // has ended, and saying so here is what lets the other tab get on with it.
            if (!Store.setVerified(SEND_CLAIM_KEY, JSON.stringify({
                by: syncDeviceId(), token: this._claimToken, at: held.at, beat: Date.now()
            }))) {
                this._claimToken = null;
                this.stopClaimBeat();
                this.noteClaimTrouble('the right to send could not be renewed');
            }
        }, SEND_CLAIM_BEAT_MS);
        // Never a reason to hold a page open in Node or to keep a phone awake.
        if (this._claimBeat && typeof this._claimBeat.unref === 'function') {
            this._claimBeat.unref();
        }
    },

    stopClaimBeat() {
        if (this._claimBeat === null) return;
        clearInterval(this._claimBeat);
        this._claimBeat = null;
    },

    // Asked again, in the instant before the request is handed to the adapter.
    //
    // Everything between taking the claim and this line is time: the settle, building the
    // payload, reading the queue off the disk. A tab suspended across that gap woke up
    // still believing it owned a claim another tab had long since taken - and then handed
    // its stale payload to the cloud. The answer is read off the DISK, because that is
    // where the other tab wrote.
    stillOwnsSendClaim() {
        if (!Store.available) return true;
        if (!this._claimToken) return false;
        const held = readSendClaim();
        return Boolean(held) && !held.unreadable && held.token === this._claimToken;
    },

    // Given back the moment the send is answered, so the next tab does not wait out the
    // staleness window. A removal that will not happen costs a delay, never a write.
    releaseSendClaim() {
        this.stopClaimBeat();
        if (!this._claimToken) return;
        const held = readSendClaim();
        if (held && !held.unreadable && held.token === this._claimToken) {
            try { Store.remove(SEND_CLAIM_KEY); } catch (error) { /* bytes, not truth */ }
            Store.forget(SEND_CLAIM_KEY);
        }
        this._claimToken = null;
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

        // The seed carries the entire roster out of the device in one go, so the same
        // rule applies to it as to an update - and a create that cannot be proven is a
        // create that does not happen.
        if (!this.markSent(seed)) {
            return Promise.reject(
                new Error('the record of what has been sent could not be stored; the document was not created'));
        }

        // The ordering envelope, on the create as well. It is the first write of the
        // document, so its revision is one and the rules accept nothing else - and it
        // carries the same operation id as the update it is standing in for, because it
        // IS that write taking the other branch, not a second one. Sent twice, the second
        // attempt finds the receipt the first wrote.
        //
        // The patch is stamped too: when the create loses the race and comes back
        // 'already-exists', the update below goes out against a document another device
        // has just created, so its base is whatever that device left - which the snapshot
        // that create published has by then told us.
        // 'create' rather than 'update': the two used to share one id, so a receipt could
        // not tell a field merge from a whole-document replacement.
        this.stampProtocol(seed, this._sendOpId || this.operationIdFor(this._sending),
            'create');
        return Promise.resolve(this.adapter.create(seed))
            .catch(error => {
                if (error && error.code === 'already-exists') {
                    return this.adapter.update(
                        this.stampProtocol(patch, this._sendOpId
                            || this.operationIdFor(this._sending)));
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

        // Every operation on the disk RIGHT NOW, named. Read fresh and taken from the
        // whole physical set rather than from a projection: an operation the projection
        // does not show is still an operation, and one this tab has never seen is still
        // work the restore is replacing.
        const superseded = this.physicalOperations().map(op => op.opId);

        return this.rememberReplace(replacementEnvelope(
            document, 'prepared', replacementId(), this._seq, cloudOwed !== false,
            superseded));
    },

    // Says the device now holds it. Best effort on purpose: the phase is a hint, and the
    // gate on the cloud write is localDurableHolds, which reads the disk.
    confirmReplaceStored() {
        const envelope = this.pendingReplace();
        if (!envelope || envelope.phase === 'local-stored') return true;
        return this.rememberReplace(replacementEnvelope(
            envelope.document, 'local-stored', envelope.transactionId,
            envelope.supersedesSeq, envelope.cloud, envelope.supersedes));
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
        if (!this.replayDurableJournal(expected, envelope)) return false;
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
            const parsed = JSON.parse(raw);
            schedule = normaliseSchedule(parsed);
            // What the record SAYS it is, not what normalising it stamped on. This is the
            // one caller that has to know: normaliseSchedule starts from emptySchedule(),
            // which stamps SCHEMA_VERSION, so a stored record written by another version
            // read as this one - and localDurableHolds answered "yes, I hold the
            // replacement" over a document that is not the same document. A record with
            // no version at all keeps the stamp, which is the v71 case.
            if (parsed && typeof parsed === 'object' && parsed.schemaVersion !== undefined) {
                schedule.schemaVersion = parsed.schemaVersion;
            }
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
        if (!this.replayDurableJournal(next, envelope)) {
            // The queue cannot be read, so there is no way to know what this device is
            // still owed. Storing the bare document would drop it silently.
            return { stored: false, pruned: false };
        }

        // BEFORE the schedule is swapped, and its answer decides whether the swap happens
        // at all.
        //
        // This roster is not this device's any more: it came out of a backup file, a cloud
        // copy or another phone's export, and an id that happens to survive the swap
        // arrived inside somebody else's document - so its provenance is exactly as unknown
        // as everything else in there.
        //
        // Ignoring the refusal was a hole with a long fuse. The restore saved, reported
        // success and cleared its transaction; this session refused deletions because the
        // record it held said so; and the DISK still carried the old, perfectly valid list
        // of everything this device had minted. Reopen tomorrow and a worker who arrived
        // inside that backup is provably local again, with a delete button next to him.
        //
        // So it goes first, it is read back, and a refusal stops the replacement. The
        // pending transaction stays on the disk, deletion stays blocked by it through any
        // number of reopens, and the retry finishes the job once there is room.
        if (!this.forgetLocalOrigin()) return { stored: false, pruned: false };

        State.schedule = next;
        if (!State.save()) {
            State.schedule = previous;
            if (typeof render === 'function') render();
            return { stored: false, pruned: false };
        }

        const pruned = this.dropSupersededEntries(envelope);
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
    dropSupersededEntries(envelope) {
        this.loadOutbox();
        const named = supersededOpIds(envelope);
        const upTo = Number((envelope || {}).supersedesSeq) || 0;

        // Named, and the list may be empty - a restore that supersedes nothing.
        if (named) {
            if (named.size === 0) return true;
            return this.dropOperations([...named]);
        }
        if (upTo <= 0) return true;

        // An envelope from a build that named nothing has only its number to go on.
        // Asked of the whole physical set, not of a projection: an operation the
        // projection does not show is still an operation that could come back.
        const going = this.physicalOperations()
            .filter(op => (Number(op.seq) || 0) <= upTo)
            .map(op => op.opId);
        if (going.length === 0) return true;
        return this.dropOperations(going);
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
                // And ordered after every cloud write ANOTHER TAB started.
                //
                // cloudQuiet only knows about the writes this context began, and a second
                // tab on the same phone is a second context: its open field update is
                // invisible here. So the restore went out under it, the update landed on
                // top of the whole-document save, and the cloud held a day the restore had
                // removed - while the tab that asked for it had already been told "done",
                // and every phone subscribed at that moment adopted the day back.
                //
                // The right to send is the record both tabs read. Refused, the restore
                // simply does not go: it stays on the disk, the ladder picks it up, and
                // nothing has claimed to be finished.
                // _claiming for the whole of it, the same flag flush() sets. Without it
                // a debounced flush in THIS tab starts while the restore is still
                // waiting out the claim's settle, and the two race each other through
                // one claim - which is the failure the claim exists to stop, arriving
                // from inside rather than from the next tab along.
                this._claiming = true;
                return this.takeSendClaim();
            })
            .then(mine => {
                if (!mine) {
                    this._claiming = false;
                    throw new Error(
                        'another tab holds the right to send; the restore was not sent');
                }
                const done = value => {
                    this.releaseSendClaim();
                    this._claiming = false;
                    return value;
                };
                // A whole-document save takes everybody out at once.
                if (!this.markSent(document)) {
                    done();
                    return Promise.reject(new Error(
                        'the record of what has been sent could not be stored; the replacement was not sent'));
                }
                return this.cloudWrite(() => {
                    // Asked inside the task - see sendClaimed for why outside is the wrong
                    // moment.
                    if (!this.stillOwnsSendClaim()) {
                        return Promise.reject(new Error(
                            'the right to send moved to another tab; the restore was not sent'));
                    }
                    // The ordering envelope on the restore too. A whole-document
                    // replacement is a write like any other and takes the same fence -
                    // which is the point: a restore racing an ordinary edit used to have
                    // no ordering at all, and the loser was silent.
                    //
                    // The operation id is the transaction's own, so a restore that is
                    // retried after a request that may still have landed is recognised by
                    // its receipt rather than applied a second time over work that
                    // happened in between.
                    // And the transaction it belongs to, inside the fingerprint: two
                    // restores that replace the same document with the same bytes are
                    // still two different decisions, and a receipt for one must not answer
                    // the other.
                    this.stampProtocol(document,
                        'r' + digestOf(String(envelope && envelope.transactionId)),
                        'restore', String((envelope && envelope.transactionId) || ''));
                    return Promise.resolve(this.adapter.save(document)).then(value => {
                        // And AGAIN, on the far side of the request. Reading the disk and
                        // then acting on what it said is two steps, and the other tab
                        // writes between them: the claim was mine at the check and
                        // somebody else's at the call. No amount of reading harder closes
                        // that - the write itself has to carry the ownership so the CLOUD
                        // can refuse it, which is the versioned protocol and is not this.
                        // What IS closable here is the lie: a restore that went out under
                        // another tab's claim must not come back as done. The transaction
                        // record stays on the disk and the ladder picks it up.
                        if (!this.stillOwnsSendClaim()) {
                            throw new Error('the right to send moved while the restore was '
                                + 'in flight; it is not confirmed');
                        }
                        return value;
                    });
                }).then(done, error => { done(); throw error; });
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

        // The frozen companion goes with the transaction it belongs to.
        //
        // It is written first and normally dropped the moment the raw record is rewritten
        // over it - but on the path where the companion was ALREADY frozen on an earlier
        // open, the raw record is never rewritten and nothing else ever removed it. A
        // whole schedule document was left on a phone the app warns about running out of
        // room on: nothing would read it again, and every rescue export from then on
        // carried a finished restore. It is removed here, at the one point where the
        // transaction is over however it got there, and never reported as a failure -
        // the transaction ended, and this is bytes about a transaction that is done.
        try { Store.remove(LEGACY_UPGRADE_KEY); } catch (error) { /* bytes, not truth */ }
        Store.forget(LEGACY_UPGRADE_KEY);

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
            // The most dangerous thing this app queues has just become outstanding, and
            // the line was still reading "מסונכרן" from before it. See refreshStatus.
            this.refreshStatus();
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
        if (companion.state === 'frozen') return companion.envelope;
        if (companion.state === 'unusable') {
            // A companion that is there and cannot be trusted. Absence means "nothing has
            // been frozen yet"; this means "something was, and it no longer says what".
            //
            // The two were treated alike, and that was the whole of this bug: the
            // boundary was computed again - against a queue that had grown since - and
            // written over the companion, so a day recorded after the restore was outside
            // the boundary yesterday and inside it today, and the retry deleted it with
            // nothing anywhere reporting a fault.
            //
            // Nothing is recomputed, nothing is overwritten, and the bytes are kept.
            this.replaceHeld = true;
            // Held, not merely reported - see Recovery.damaged's fourth argument. A copy
            // of these bytes is not enough to make it safe to carry on: this record is
            // the boundary of a transaction that has not finished, and recording past it
            // is what empties the queue of the very entries that transaction still owes.
            Recovery.damaged(LEGACY_UPGRADE_KEY, companion.raw,
                'הרישום שמלווה שחזור ישן שממתין לשליחה אינו תקין. הרישום לא נמחק, ' +
                'והרישום מושבת עד שהנתונים הגולמיים ייוצאו.', true);
            return null;
        }

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

        // The operations queued at the moment of the freeze, named. A v71 record cannot
        // say what its own boundary was, so this is the most that can honestly be
        // claimed - and it is strictly safer than the number, which would sweep up
        // anything a second tab numbered the same way afterwards.
        const superseded = this.physicalOperations().map(op => op.opId);

        const frozen = replacementEnvelope(
            document, 'prepared', 'legacy_' + replacementId().slice(2), this._seq, true,
            superseded);

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

    // The frozen upgrade written on an earlier open. Three answers, not two:
    //
    //   absent   - nothing has been frozen yet, so freezing it now is the right move
    //   frozen   - it is here, it reads, and it describes THIS record: use it
    //   unusable - it is here and it does not: do not read past it, and do not write
    //              over it either
    //
    // The third case covers a companion whose bytes are damaged AND one that is perfectly
    // readable but belongs to a different restore. Reusing a stale-but-valid companion
    // would apply one transaction's boundary to another; overwriting it would destroy the
    // only record of that other transaction. Both are refused.
    readFrozenLegacy(parsed) {
        const raw = Store.durableGet(LEGACY_UPGRADE_KEY);
        if (raw === null) return { state: 'absent' };

        let frozen = null;
        try {
            frozen = readReplacementRecord(JSON.parse(raw));
        } catch (error) {
            frozen = null;
        }
        if (!frozen) return { state: 'unusable', raw };

        return replacementContent(frozen.document) === replacementContent(parsed)
            ? { state: 'frozen', envelope: frozen }
            : { state: 'unusable', raw };
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
    // ---------------------------------------------------------------- the ordering protocol
    //
    // The server orders the writes; this is the client's side of the same contract. See
    // docs/sync-protocol.md, firestore.rules which enforces it, and tests/cas.test.mjs
    // which measures this half.
    //
    // The base is READ, never assumed. It comes from the last snapshot the server sent -
    // the only revision this device can honestly claim to have seen - so a write built
    // against a base that has moved is refused rather than landing on somebody's evening.
    PROTOCOL: 1,
    _revision: null,
    _sendOpId: null,
    _rebases: 0,
    // The base values, per field path, that the write currently in flight was built on.
    // See stampProtocol for why it is frozen rather than read.
    _sendBase: null,

    // Every snapshot carries the revision it is. A document written by a build that
    // predates the protocol carries none, and null is the honest answer for "this device
    // has not been told" - it is not zero, and it is not a licence to guess.
    // The document this device's writes are built on, kept beside the revision.
    //
    // Without it a conflict cannot be told apart from a contest. Two people filling in one
    // evening write different field paths and both should land; two people correcting the
    // SAME entry must not both land, and the one built on the older base must not be
    // rebased on top of the correction. The only way to know which is which is to know
    // what the path held when this write was built.
    _baseDoc: null,

    // What the base document holds at a field path, or undefined.
    baseValueAt(path) {
        let node = this._baseDoc;
        const parts = String(path).split('.');
        for (let at = 0; at < parts.length; at += 1) {
            if (!node || typeof node !== 'object') return undefined;
            node = node[parts[at]];
        }
        return node;
    },

    noteRevision(raw) {
        const said = raw && raw.revision;
        if (!Number.isInteger(said) || said < 0) return;
        // MONOTONIC. A snapshot never lowers the base.
        //
        // Firestore delivers a cached snapshot first and the server's afterwards, and the
        // cached one can be behind. Taking whatever arrived last as the base meant a
        // device that had already seen revision 4 built its next write against the cached
        // 2 - which the rules refuse, correctly, and the edit never landed. Measured: the
        // cached-first suite in tests/data.test.mjs, where a site edit stopped reaching
        // the cloud at all.
        //
        // A revision only ever goes up: every accepted write increments it and a restore
        // increments it too, so the highest number this device has been shown is the
        // best base it has. Being too high is refused and rebased below; being too low
        // would be refused forever, because nothing would ever correct it.
        if (this._revision === null || said > this._revision) {
            this._revision = said;
            try {
                this._baseDoc = JSON.parse(JSON.stringify(raw));
            } catch (error) {
                // A document that will not copy is a document this device cannot use as a
                // base. Null means "no base", which makes every conflict a contest - the
                // careful direction to be wrong in.
                this._baseDoc = null;
            }
        }
    },

    // Which paths in this write somebody else has changed since the base it was built on.
    //
    // This is the whole of the difference between a merge and an overwrite. A path whose
    // value on the server is still what the base had is a path nobody has touched: this
    // write is simply late, and rebasing it onto the newer revision is exactly right -
    // that is two people filling in one evening, and it is the behaviour the field-path
    // design exists for.
    //
    // A path whose value has MOVED is a path somebody corrected while this write was in
    // flight. Rebasing there would put the corrected value back, which is the one thing
    // the ordering is for. Measured: a tab suspended with its request still open, whose
    // held write resurrected the site another person had already fixed.
    contestedPaths(patch, current) {
        if (!current || typeof current !== 'object') return Object.keys(patch);
        const read = readPath;
        const base = this._sendBase || {};
        return Object.keys(patch).filter(path => {
            // The envelope, by the one list. This used to name the fields inline, so the
            // fingerprint - added later, and by construction different on every write -
            // read as a path somebody else had corrected, and EVERY write came back
            // contested. Kept as one constant so a sixth ordering field cannot do it again.
            if (ENVELOPE_FIELDS.indexOf(path) !== -1) return false;
            // Against the base this write FROZE, not against whatever the base has become
            // since. See stampProtocol.
            return canonicalJson(read(current, path)) !== base[path];
        });
    },

    // The envelope this write travels in, stamped onto the patch itself - which is how it
    // reaches the rules, since Firestore evaluates them against the document as it would
    // be after the merge.
    stampProtocol(patch, opId, kind, extra) {
        // THE BASE THIS WRITE WAS BUILT ON, frozen here, path by path.
        //
        // It cannot be read live at conflict time. Snapshots keep arriving while a request
        // is open, and _baseDoc moves with them - so a write held open across another
        // tab's edit came back to find the base already updated to include that edit,
        // decided nothing had moved under it, rebased, and put its own older value back
        // over the newer one. The conflict rule was reading the answer AFTER the thing it
        // was meant to detect had already been absorbed.
        //
        // Frozen only the first time: a rebase re-stamps the same patch, and re-freezing
        // there would capture the state the rebase is reacting to.
        if (!this._sendBase) {
            this._sendBase = {};
            Object.keys(patch).forEach(path => {
                if (path === 'updatedAt' || path === 'updatedBy') return;
                if (path === 'protocol' || path === 'revision' || path === 'lastOpId') return;
                // THE QUEUE'S OWN BASE FIRST. The operation recorded what the server held
                // when the person made the edit, in the same write that queued it, so it
                // is still there after a reopen - which is the whole point: reading it
                // live at that moment gives the winner's value and answers "nothing
                // moved" to a question whose answer is "somebody corrected this".
                //
                // A queue written by an older build carries no base, and then the live
                // read is the only answer there is and this behaves as it did.
                const queued = this._outbox.get(path);
                if (queued && queued.base !== undefined) {
                    this._sendBase[path] = queued.base === null ? undefined : queued.base;
                    return;
                }
                this._sendBase[path] = canonicalJson(this.baseValueAt(path));
            });
        }
        patch.protocol = this.PROTOCOL;
        patch.lastOpId = String(opId);
        // Computed BEFORE the ordering fields are read back out of the patch - they are
        // excluded by name, so the order does not matter, and computing it here means every
        // door that stamps a write stamps its fingerprint too.
        patch.opFingerprint = operationFingerprint(kind || 'update', patch, extra);
        // No snapshot yet means no base. One is the only revision a document that does
        // not exist can be created at, and the rules refuse anything else - so a device
        // that guessed would simply be refused, which is the right failure.
        patch.revision = (this._revision === null ? 0 : this._revision) + 1;
        return patch;
    },

    // THE CUTOVER, and what it deliberately does NOT send.
    //
    // Called only when this device has never been told a revision. It moves the document
    // into the protocol with a write that carries protocol, revision, lastOpId and the
    // stamp - and not one field a person recorded - then hands the authoritative document
    // back to the caller as a CONFLICT.
    //
    // A conflict, on a write that succeeded, is the right shape and not a trick. What has
    // just happened is precisely what a conflict means here: the base this patch was built
    // on is not the base it is going to land against, and the machinery that already
    // exists knows what to do about that. contestedPaths compares the frozen base - which
    // for a device that had never seen the document is `undefined` at every path - against
    // the document as it actually is. A path that holds something is a path somebody else
    // wrote while this device was away: contested, held, and the person is told. A path
    // that holds nothing is disjoint: rebased onto revision 1 and merged, which is the
    // ordinary two-people-one-evening case and must keep working.
    //
    // Its operation id is its own, and that matters. Sharing the batch's id would write
    // the batch's receipt here, and the business write that followed would be answered
    // "already applied" from a receipt that applied nothing - the evening swallowed by
    // the very record that exists to stop it being sent twice. Stable per device, so a
    // retry of the bootstrap finds its own receipt and stops.
    bootstrapCutover() {
        const opId = 'boot' + digestOf(String(syncDeviceId()));
        return Promise.resolve(this.adapter.bootstrap({
            protocol: this.PROTOCOL,
            lastOpId: opId,
            updatedAt: new Date().toISOString(),
            updatedBy: syncDeviceId()
        })).catch(error => {
            // TWO PHONES BOOTSTRAPPING AT ONCE, and the loser is not told nicely.
            //
            // Both read a document with no revision and both prepare a write claiming
            // revision 1. The winner commits; the loser's transaction is then evaluated
            // against a document that HAS a revision, and the rules refuse it - as
            // permission-denied, not as a conflict, because from the server's side a
            // write claiming revision 1 over a document at revision 1 is simply not
            // allowed. Measured: the loser went to the error status and its evening sat
            // on the retry ladder behind a refusal that was never going to change.
            //
            // A refusal that means "somebody else already did this" is answered by
            // looking. If the document now carries a revision, the cutover happened and
            // this device has what it needs; if it does not, the refusal was about
            // something else and belongs to the caller.
            if (error && (error.code === 'not-found' || error.code === 'conflict')) throw error;
            if (!this.adapter || typeof this.adapter.read !== 'function') throw error;
            return Promise.resolve(this.adapter.read()).then(fresh => {
                if (fresh && Number.isInteger(fresh.revision)) return fresh;
                throw error;
            }, () => { throw error; });
        }).then(written => {
            // Reread where the adapter can. The bootstrap's own answer is the document as
            // its transaction left it, which is authoritative for that instant; a fresh
            // read is authoritative for this one, and between them a third phone may have
            // written. Prefer the newer.
            const reread = this.adapter && typeof this.adapter.read === 'function'
                ? Promise.resolve(this.adapter.read()).catch(() => null)
                : Promise.resolve(null);
            return reread.then(fresh => {
                const authoritative = fresh || written || null;
                const error = new Error('the document has just entered the protocol');
                error.code = 'conflict';
                // NOT A REBASE, and it must not spend the rebase budget.
                //
                // CAS_REBASE_LIMIT exists to stop a device chasing a document that keeps
                // moving under it. This refusal is not that: it happens exactly once per
                // device, on the one write that finds the document without a revision, and
                // it is this client's own doing. Charging it to the budget left a phone
                // that also lost a genuine race one rebase short, and its evening was held
                // for a conflict that was not one.
                error.cutover = true;
                error.revision = authoritative && Number.isInteger(authoritative.revision)
                    ? authoritative.revision : 1;
                error.document = authoritative;
                throw error;
            });
        });
    },

    // A stable name for one batch of operations.
    //
    // Built from the operations themselves - their paths, sequence numbers and operation
    // ids - so the same batch sent twice carries the same name, which is what lets the
    // server recognise the second attempt as a replay of the first rather than as a
    // second edit. A fresh id per attempt would turn one edit into two.
    // AND THE VALUE, which it did not carry.
    //
    // legacyOpId two hundred lines up already digests the value, with a comment explaining
    // that a value-blind name once wore the name of the value it replaced and suppressed a
    // correction. The batch name never got the same treatment: two different values for one
    // path at one sequence produced the identical name, so a disk handing a batch record
    // back with a different value, a rescue-file rebuild, or the create/update aliasing
    // could all present one name for two different operations.
    operationIdFor(sent) {
        const parts = [...sent.entries()]
            .map(([path, item]) => `${path}#${item && item.seq}#${item && item.opId}`
                + '#' + digestOf(canonicalJson(item && item.value)))
            .sort();
        return 'b' + digestOf(parts.join('|'));
    },

    // The money in the RAW bytes, before normalising touches them. True means refused.
    //
    // This door had no gate at all. The three restore doors validate the raw document and
    // refuse a bad one; receive() went straight to normaliseSchedule and adopted whatever
    // came back - and normaliseSchedule's `Number(item.amount) || 0` is a COERCION, so
    // "500" became five hundred payable shekels and anything unreadable became zero.
    // Which is also why nothing was ever quarantined here: that expression always yields
    // something readable, so there was never anything left to call damaged.
    //
    // Only the money, and only refusing to ADOPT. A snapshot carrying an advance this
    // build cannot pay against is not a reason to throw away the roster or the days in
    // it - and it is certainly not a reason to overwrite this device's own record with
    // one somebody would be paid wrongly from. The bytes are kept where a person can
    // still get at them and the queue is left exactly as it is.
    //
    // It is one function because it is asked TWICE now: once in the incomplete-document
    // branch, which used to answer synced before anything looked at the money, and once
    // on the ordinary path.
    refuseBadMoney(raw) {
        const money = advanceProblems({ advances: raw.advances }, null, true);
        if (money.length === 0) return false;
        Recovery.damaged('farkad:remoteAdvances', JSON.stringify(raw.advances),
            'הגיעה מקדמה שאינה תקינה מהענן. הרישום במכשיר לא שונה. ' + money[0]);
        this.fail(new Error('the arriving snapshot carries an advance this build '
            + 'cannot pay against; it was not adopted'));
        return true;
    },

    receive(raw) {
        // A malformed document must not wipe a good local schedule, so it is normalised
        // and sanity-checked before it is allowed anywhere near State.
        if (!raw || typeof raw !== 'object') {
            this.fail(new Error('remote document is not a schedule'));
            return;
        }

        // The base every write from here is built on, taken from the server's own answer
        // rather than from anything this device believes. Recorded FIRST, before any of
        // the branches below can return early: a snapshot this device refuses to ADOPT is
        // still a snapshot that tells it what revision the document is at, and writing
        // against a stale base is refused by the rules, which is a worse way to find out.
        this.noteRevision(raw);
        this._latestRaw = raw;

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
            // The money, before this branch is allowed to answer synced.
            //
            // This branch used to return first, so a document with no roster and an
            // advance of minus five hundred was reported as synced while the gate below
            // - on the very same bytes - was saying the amount was never handed over.
            // Unfinished is a reason to wait for the rest of the document; it has never
            // been a reason to stop looking at the part that is money.
            if (this.refuseBadMoney(raw)) return;
            // Authoritative: the document exists and has no roster in it, so there is
            // nothing tombstoned for a queued array to contradict.
            this.noteCloudHeard();
            if (State.schedule.workers.length > 0) this.editRoster(State.schedule);
            this.setStatus('synced');
            this.archiveDaily(State.schedule);
            if (this.pendingCount() > 0) this.scheduleFlush();
            return;
        }

        // The local roster is handed over as a name source: if this snapshot carries a
        // day for somebody it has itself forgotten, this device may be the last place
        // his name exists, and it is holding it right now.
        // The money in the RAW bytes, before normalising touches them.
        //
        // This door had no gate at all. The three restore doors validate the raw document
        // and refuse a bad one; receive() went straight to normaliseSchedule and adopted
        // whatever came back - and normaliseSchedule's `Number(item.amount) || 0` is a
        // COERCION, so "500" became five hundred payable shekels and anything unreadable
        // became zero. Which is also why nothing was ever quarantined here: that
        // expression always yields something readable, so there was never anything left
        // to call damaged.
        //
        // Only the money, and only refusing to ADOPT. A snapshot carrying an advance this
        // build cannot pay against is not a reason to throw away the roster or the days
        // in it - and it is certainly not a reason to overwrite this device's own record
        // with one somebody would be paid wrongly from. The bytes are kept where a person
        // can still get at them and the queue is left exactly as it is.
        // The raw container, handed over as it arrived. It used to be coerced to {} on
        // the way in - `(raw.advances && typeof ...) ? raw.advances : {}` - so an empty
        // array, a string and a null all reached the gate as an empty map, passed, and
        // took a valid local advance off this phone's disk on the way past. The gate
        // checks the container itself now, which it can only do if it is given one.
        //
        // `wire: true`: a null at an advance's path is this app's own deletion, sent by
        // removeAdvance. Treating it as damage put the phone that pressed delete into
        // recovery on the echo of its own write, and stopped every phone recording days.
        if (this.refuseBadMoney(raw)) return;

        const remote = normaliseSchedule(raw, rememberedEntities(State.schedule));
        this.rememberRemoteRoster(remote);

        // Who this snapshot says is gone, learned once and used four times below.
        const gone = tombstonedIds(raw);

        // Before anything else can flush it: the queue is the one copy of the old roster
        // that is still on its way OUT of this device.
        //
        // And its answer is read. A refused rewrite leaves the ORIGINAL entry on the disk
        // - which is right, the bytes are never destroyed - and that entry still carries
        // the removed man in a whole array. Carrying on from here would adopt the
        // snapshot, call the device synced, and then flush him back into the document,
        // where every v78 reader picks him up again. So the snapshot is not adopted, the
        // stale queue is barred from flushing, and the retry ladder comes back to it.
        if (!this.sanitiseQueuedRosters(gone)) {
            this.holdStaleRoster(gone);
            return;
        }
        this.releaseStaleRoster();
        // Heard, AND cleaned. Only now may a queued roster array leave this device: the
        // barrier is about knowing what the document says, and the sanitation is about
        // the queue agreeing with it. Either one alone is not enough.
        this.noteCloudHeard();

        // A document nobody has ever written to - a project connected for the first time.
        // Adopting it would empty this device to match an empty cloud, so this device's
        // roster seeds it instead.
        if (!remote.updatedAt) {
            // A document nobody has written to holds no tombstones either, and this is
            // the server saying so rather than a guess.
            this.noteCloudHeard();
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
            this.noteCloudHeard();
            this.setStatus('synced');
            this.archiveDaily(State.schedule);
            return;
        }

        // Keep what was on screen, so an unexpected remote change is recoverable.
        Store.set('scheduleData:v2backup', JSON.stringify(State.schedule));

        const previous = State.schedule;
        // Ledger entries are append-only against the other phones too: a device that has
        // never heard of one has not disagreed with it. See mergeLedgerInto.
        const ledgerClash = [];
        State.schedule = (typeof mergeLedgerInto === 'function')
            ? mergeLedgerInto(remote, previous, ledgerClash) : remote;
        // ONE IMMUTABLE ID, TWO DIFFERENT BODIES, and nothing here decides which is true.
        //
        // Both are kept - the arriving copy where it landed, this phone's beside it under
        // a name nothing folds - the bytes go to Recovery so the rescue file carries them,
        // and the device stops writing until a person has looked. Adopting one of the two
        // and reporting synced is how the other one leaves the record for good.
        if (ledgerClash.length > 0) {
            State.schedule.ledger.conflicted = State.schedule.ledger.conflicted || {};
            ledgerClash.forEach(clash => {
                State.schedule.ledger.conflicted[clash.id] = {
                    id: clash.id, family: clash.family,
                    here: clash.mine, arrived: clash.theirs
                };
            });
        }
        // And the vehicles, on the same rule and for the same reason - see
        // mergeVehiclesInto. They are dormant in this build, which means nothing writes
        // them and therefore nothing can be said to have deleted them.
        if (typeof mergeVehiclesInto === 'function') {
            mergeVehiclesInto(State.schedule, previous);
            mergeVehicleDaysInto(State.schedule, previous);
        }
        this.reapplyPending(State.schedule, gone);

        // AGAIN, after the pending edits are back on top.
        //
        // The first pass, inside normaliseSchedule, saw only what the snapshot carries -
        // and the work that gets orphaned by a deletion is by definition work the cloud
        // has not got yet: it is sitting in this device's own queue, which is what made
        // it invisible to the phone that did the deleting. reapplyPending is the moment
        // it comes back, so it is the moment the man it belongs to has to come back too.
        // Without this the queue would put the day on top of a roster that no longer has
        // him and send it that way, and the orphan the sequence is about would be one
        // this device created on its way past.
        reinstateReferenced(State.schedule, rememberedEntities(previous));

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
        // AFTER THE DISK HAS IT, because Recovery blocks writing the moment it is told -
        // and telling it first would have refused the very persist that puts the two
        // disputed bodies somewhere a person can still reach them.
        if (ledgerClash.length > 0) {
            if (typeof Recovery !== 'undefined') {
                Recovery.damaged('scheduleData:v2:ledger:conflict',
                    JSON.stringify(State.schedule.ledger.conflicted),
                    'הגיעה רשומת מקדמה עם אותו מזהה ותוכן אחר. שתי הגרסאות נשמרו כמו שהן '
                    + 'ולא נמחק דבר, אבל אי אפשר לרשום עוד עד שתייצא גיבוי ותבדוק איזו '
                    + 'מהן נכונה.');
            }
            this.fail(new Error('two ledger entries share one id and differ; both are held'));
            return;
        }
        this.setStatus('synced');

        // A day or an advance in that snapshot named somebody the snapshot's own roster
        // no longer grants, and normaliseSchedule gave him an identity back so the work
        // could be counted. Told to the cloud, not kept to ourselves: the document is one
        // fullScheduleProblems currently refuses, every other phone is reading the same
        // hole, and this device is the one holding the repair. The record it writes is a
        // real archived worker, so it settles the field rather than fighting the
        // tombstone - the next snapshot carries him and nothing here fires again.
        //
        // The second half is the v78 reader: the document's own whole array still names
        // somebody its map has tombstoned, so a frozen phone is still showing him. Either
        // way the answer is the same write - the roster as this device now holds it, in
        // both forms at once.
        if (this.repairsMissingIdentities(raw) || this.conflictsWithLegacyArray(raw, gone)) {
            this.editRoster(State.schedule);
        }

        // The copy is taken from what the server holds at the first sight of it today -
        // before this evening's editing, which is the state worth being able to go back to.
        this.archiveDaily(State.schedule);

        if (this.pendingCount() > 0) this.scheduleFlush();
    },

    // What the cloud last showed, so a roster edit can send only the people who actually
    // changed. Taken from the NORMALISED roster, not the raw document, so a device on the
    // old wire format and one on the new are compared on the same footing.
    rememberRemoteRoster(schedule) {
        // A COPY, taken now, and never a reference into the object the app is about to
        // work in.
        //
        // These same worker objects are what normaliseSchedule hands to State.schedule.
        // Keeping references meant archiving somebody mutated worker.active on the
        // baseline as well as on the man himself - so editRoster compared him against a
        // record that had already changed, found no difference, and sent nothing. The
        // phone that did the archiving showed him away and every other phone still had
        // him at work, with no error anywhere and no second chance to notice: the next
        // edit compared equal too.
        const byId = list => {
            const out = {};
            (list || []).forEach(item => {
                if (item && item.id) out[String(item.id)] = JSON.parse(JSON.stringify(item));
            });
            return out;
        };
        this._remoteRoster = {
            workers: byId(schedule.workers),
            places: byId(schedule.places)
        };
        // Everything in a snapshot has, by definition, been somewhere other than here.
        // Nothing is handed over on this path, so a refused write cannot hold anything
        // up - it just leaves the record undurable, which refuses every deletion.
        this.markSent(schedule);
    },

    // Whether the roster now on screen holds anybody the snapshot's roster did not
    // grant. That can only be somebody normaliseSchedule reinstated, because there is no
    // other way into the list at this point in receive().
    // ---------------------------------------------------------- the v78 reader
    //
    // A phone still on v78 does not read the per-entity map at all. It reads the whole
    // arrays, and nothing else - so a tombstone means nothing to it, and a man removed on
    // a v79 phone is still in its crew, on its day screen and in its reports. The keyed
    // form being right is not the same as the roster being right.
    //
    // Two things have to happen for that reader to converge, and both are here because
    // this is the moment the tombstone is learned about.

    // The queued whole array is this device's opinion of the roster from BEFORE it heard.
    // Flushing it as it stands puts the removed man back into the cloud's array, where the
    // v78 reader finds him - and the fix cannot be at replay time only, because replay is
    // in memory and the FLUSH reads what is stored. So the stored entry is rewritten, in
    // one atomic journal write, the same way every other queue change is made.
    sanitiseQueuedRosters(gone) {
        if (!gone || (gone.workers.size === 0 && gone.places.size === 0)) return true;
        this.loadOutbox();

        // Which queued path is a list of whom, in both of the forms a roster is queued
        // in: the whole array a v78 phone reads, and the order list this build sends.
        const listedKind = path => {
            if (path === 'workers' || path === 'places') return path;
            if (path === 'roster.workerOrder') return 'workers';
            if (path === 'roster.placeOrder') return 'places';
            return null;
        };

        // A CORRECTION, written as an operation of its own that supersedes the stale one.
        //
        // The queued array cannot be edited in place: a batch record is immutable, and
        // the version of this that rewrote the queue is what let a refused rewrite leave
        // the original entry sitting on the disk while memory believed it was clean. So
        // the sanitised list is minted the same way any other change to what this device
        // publishes is minted - one operation, naming the one it replaces - and if it
        // cannot be written the caller is told and the queue is barred from flushing.
        //
        // Not an invention on somebody's behalf either. Once this device has heard that
        // the man is gone, the sanitised array IS its opinion of the roster, and sending
        // the old one would put him back into the document for every v78 reader.
        const corrections = [];
        this.projectedQueue().forEach((item, path) => {
            const kind = listedKind(path);
            const removed = kind ? gone[kind] : null;
            if (!removed || removed.size === 0 || !Array.isArray(item.value)) return;
            // An array of records, or an array of bare ids - the same question either
            // way: is this the man the document says is gone?
            const kept = item.value.filter(entry => {
                const id = entry && typeof entry === 'object' ? entry.id : entry;
                return !removed.has(String(id));
            });
            if (kept.length !== item.value.length) corrections.push({ path, value: kept });
        });
        if (corrections.length === 0) return true;
        return this.queueOperations(corrections);
    },

    // ---------------------------------------------------------- the first snapshot
    //
    // A persisted queue is older than anything this session knows.
    //
    // Device B closes with workers=[A, doomed] sitting in its outbox, in the whole-array
    // form a v78 phone reads. Device A tombstones `doomed` in the meantime. B reopens:
    // connect() subscribes AND schedules the persisted queue, and those two are not
    // ordered with respect to each other. If the first snapshot is even slightly late -
    // a cold radio, a captive portal, a server taking its time - the old array goes out
    // first, and a v78 reader has the deleted man back in its crew. The device that did
    // the deleting is not involved and cannot see it happen.
    //
    // The hold in `staleRosterHeld` cannot help: it lives in memory, and this is the
    // first flush of a new session, so there is nothing in it to remember. What is needed
    // is the other way round - not "do I know of a tombstone?" but "have I heard from the
    // document at all yet?".
    //
    // So anything that could carry a roster opinion waits for the first authoritative
    // answer. Days and advances are not held: they name one field each, they cannot
    // resurrect anybody, and holding them would stop an evening's recording from leaving
    // a phone for no safety at all.
    _heardFromCloud: false,

    // Set by every route out of receive() that has actually seen what the server holds,
    // including a document that does not exist yet - "there is nothing there" is an
    // authoritative answer, and there are no tombstones in it.
    //
    // And the moment the barrier opens, whatever it was holding is sent. Otherwise the
    // held entries wait for the next thing that happens to schedule a flush, and if the
    // snapshot that opened the barrier is this device's own echo - which is exactly what
    // it is when a day was recorded while the roster waited - nothing ever does. The
    // queue then sits there, correct and unsent, until the person edits again: the one
    // failure this whole barrier exists to avoid asking of them.
    noteCloudHeard() {
        if (this._heardFromCloud) return;
        this._heardFromCloud = true;
        if (this.adapter && this.pendingCount() > 0) this.scheduleFlush();
    },

    // Whether this path may go out before the first snapshot has arrived.
    rosterShaped(path) {
        const parts = String(path).split('.');
        if (parts.length === 1 && (parts[0] === 'workers' || parts[0] === 'places')) return true;
        return parts[0] === 'roster';
    },

    // A queue that could not be cleaned is a queue that must not go out.
    //
    // Held in memory AND recomputed from the next snapshot: the tombstones are in the
    // document, so a device that is restarted learns them again the moment it reconnects.
    // What must not happen in between is a flush, and flush() asks this before sending.
    _staleRoster: null,

    holdStaleRoster(gone) {
        this._staleRoster = gone;
        this.fail(new Error(
            'a queued roster could not be cleaned of a removed worker; it is held back'));
        this.scheduleRetry();
    },

    releaseStaleRoster() {
        this._staleRoster = null;
    },

    // Tried again from the retry ladder, with no second snapshot needed: the tombstones
    // were learned once and are remembered until the rewrite lands.
    staleRosterHeld() {
        if (!this._staleRoster) return false;
        if (this.sanitiseQueuedRosters(this._staleRoster)) {
            this.releaseStaleRoster();
            // These tombstones came from a real snapshot, and the queue now agrees with
            // it. That is the whole of the first-snapshot barrier's question answered,
            // and it has to be recorded here: the snapshot that asked it was refused
            // half way through and never reached the route that would have said so, so
            // without this the roster waits for a snapshot that has already been and
            // gone.
            this.noteCloudHeard();
            return false;
        }
        return true;
    },

    // And the array already IN the document may name somebody the map has tombstoned -
    // written by a v78 phone, or by this one before it heard. The two forms disagree, the
    // v79 reader obeys the map and the v78 reader obeys the array, and they show different
    // crews until somebody says so out loud.
    //
    // It cannot loop: the repair writes the array WITHOUT him, so the next snapshot has
    // nothing to disagree about. If he has work behind him he is reinstated first, and
    // then both forms carry him - which is the same convergence from the other side.
    conflictsWithLegacyArray(raw, gone) {
        if (!gone) return false;
        return ['workers', 'places'].some(kind => {
            if (gone[kind].size === 0) return false;
            return (Array.isArray(raw[kind]) ? raw[kind] : [])
                .some(item => item && gone[kind].has(String(item.id)));
        });
    },

    // Only an identity this device can actually NAME is written back.
    //
    // A placeholder is what a device produces when it has no idea who this was - and
    // another phone, the one that recorded the work, usually does know. Pushing
    // "עובד שנמחק (w_x)" over the wire would land on that field and overwrite the real
    // name the moment it arrived, turning a repairable document into one where the name
    // is gone for good. So a device that does not know keeps its placeholder to itself:
    // the work still resolves and still gets counted here, and the phone that knows
    // repairs the document for everybody.
    repairsMissingIdentities(raw) {
        const referenced = referencedEntityIds(State.schedule);
        return ['workers', 'places'].some(kind => {
            const granted = rosterIds(raw, kind);
            return (State.schedule[kind] || []).some(item =>
                item && item.id
                && !granted.has(String(item.id))
                // Referenced by real work and ARCHIVED is what reinstateReferenced
                // produces, and the only thing this is allowed to write back. Without
                // both clauses it also matches a man another phone removed while this
                // one was away - and writing him back would be the resurrection this
                // round exists to stop, done by the repair itself.
                && referenced[kind].has(String(item.id))
                && item.active === false
                && String(item.name) !== recoveredEntityName(kind, String(item.id)));
        });
    },

    // Edits typed here in the last second or so, or queued after a failed send. They are
    // held as (path, value) pairs, so putting them back on top of a freshly adopted
    // document is a matter of writing each one in again - otherwise the person watches
    // what they just entered disappear when somebody else's change arrives.
    reapplyPending(schedule, tombstoned) {
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
            applyJournalEntry(schedule, path, item.value, perEntity, tombstoned);
        });
    },

    scheduleFlush() {
        clearTimeout(this._timer);
        this._timer = setTimeout(() => this.flush(), this.pushDelayMs);
        // AFTER the flush is scheduled, and that order is deliberate. The line going
        // honest is worth doing and it is not worth risking the send: anything this throws
        // - a disk that will not answer, a notice that will not draw - must not be able to
        // leave the queue with nothing scheduled to carry it.
        //
        // The window it closes: between an edit being journalled and the flush that takes
        // it, the status still read "מסונכרן" with the edit sitting on the disk.
        this.refreshStatus();
    },

    // Ask the gate again about the status this device is already showing.
    //
    // setStatus only tests the claim at the moment it is made, and owed-ness changes
    // underneath a status that has already been set: an edit is journalled, a restore is
    // prepared, a record turns out to be unreadable. Cheap enough to call at each of
    // those - it is once per event, not once per render - and it never promotes anything:
    // honestStatusFor leaves every status but 'synced' exactly as it found it.
    refreshStatus() {
        if (this.status === 'synced') this.setStatus('synced');
    }
};

// Who a document says is GONE, as opposed to who it merely does not mention. A null in
// the per-entity map is the only thing that says it.
function tombstonedIds(raw) {
    const out = { workers: new Set(), places: new Set() };
    const roster = (raw && isPlainObject(raw.roster)) ? raw.roster : {};
    ['workers', 'places'].forEach(kind => {
        if (!isPlainObject(roster[kind])) return;
        Object.keys(roster[kind]).forEach(id => {
            if (!roster[kind][id]) out[kind].add(String(id));
        });
    });
    return out;
}

// One journal entry, written into a schedule. Shared by the two things that need it: the
// boot rebuild, and putting local edits back on top of a snapshot that just arrived.
//
// `perEntity` names the roster lists that already have a per-person entry waiting, so the
// legacy whole-array entry queued beside them does not undo those.
function applyJournalEntry(schedule, path, value, perEntity, tombstoned) {
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

            // days.<date>.vehiclesOff - three segments, and about the day rather than
            // about a person. An empty list travels as null and is deleted rather than
            // stored: a field that is always there saying "nothing" is a field on every
            // device's document forever.
            if (parts.length === 3 && parts[0] === 'days' && parts[2] === 'vehiclesOff') {
                if (!schedule.days[parts[1]]) schedule.days[parts[1]] = { plan: {}, actual: {} };
                if (value === null) delete schedule.days[parts[1]].vehiclesOff;
                else schedule.days[parts[1]].vehiclesOff = value;
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

            // ledger.advances.<entry id>. Re-applied like anything else, and never
            // removed: an entry is the record that an amount was once written down, and
            // an arriving snapshot that does not have it yet has not disagreed with it.
            if (parts.length === 3 && parts[0] === 'ledger' && parts[1] === 'advances') {
                if (value === null) return;
                schedule.ledger = schedule.ledger || { advances: {} };
                schedule.ledger.advances = schedule.ledger.advances || {};
                schedule.ledger.advances[parts[2]] = value;
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
            //
            // And never over a tombstone. This array was built before the snapshot it is
            // being laid on top of: a man removed on another phone while this one was
            // away is still in it, and putting the array back whole was enough to stand
            // him up again on this device and then send him to everybody else. The
            // queued array is this device's own opinion of the roster from BEFORE it
            // heard; the tombstone is a statement about one man made after.
            if (parts.length === 1 && (parts[0] === 'workers' || parts[0] === 'places')) {
                if (perEntity && perEntity.has(parts[0])) return;
                const gone = tombstoned && tombstoned[parts[0]];
                schedule[parts[0]] = (!gone || gone.size === 0)
                    ? value
                    : (Array.isArray(value) ? value : [])
                        .filter(item => !(item && gone.has(String(item.id))));
            }
        }
    }
}

// Is this operation ALREADY in the schedule that is on the disk?
//
// The question collection used to answer with a sequence number, and a number could not
// answer it. `_savedSeq` is one JavaScript context's count of its own writes: it says
// nothing about an operation another tab minted, and nothing about which schedule
// actually reached the disk when a save was refused. So an operation whose value was
// never written anywhere was collected as though it had been, and the edit existed only
// in a cloud this device no longer had any record of.
//
// This asks the disk instead, per path family, mirroring applyJournalEntry. Where the
// answer is not obvious it is NO: a wrong "no" leaves bytes on the device, and a wrong
// "yes" loses somebody's day.
function scheduleHoldsEntry(schedule, path, value) {
    if (!schedule || typeof schedule !== 'object') return false;
    const parts = String(path).split('.');
    const same = (a, b) => canonicalJson(a) === canonicalJson(b);

    if (parts.length === 4 && parts[0] === 'days') {
        const [, date, layer, workerId] = parts;
        const day = (schedule.days || {})[date];
        const held = day && day[layer] ? day[layer][workerId] : undefined;
        return same(held, value);
    }

    if (parts.length === 2 && parts[0] === 'advances') {
        const advances = schedule.advances || {};
        const there = Object.prototype.hasOwnProperty.call(advances, parts[1]);
        if (value === null) return !there;
        return there && same(advances[parts[1]], value);
    }

    // A ledger entry is never removed by anything, so a null owes the schedule nothing.
    if (parts.length === 3 && parts[0] === 'ledger' && parts[1] === 'advances') {
        if (value === null) return true;
        const entries = (schedule.ledger || {}).advances || {};
        return Object.prototype.hasOwnProperty.call(entries, parts[2])
            && same(entries[parts[2]], value);
    }

    if (parts.length === 3 && parts[0] === 'roster'
        && (parts[1] === 'workers' || parts[1] === 'places')) {
        const list = schedule[parts[1]] || [];
        const found = list.find(item => item && String(item.id) === parts[2]);
        if (value === null) return found === undefined;
        return found !== undefined && same(found, value);
    }

    // An order is held when the people it names appear in the stored list in the order it
    // named them. Anybody it had not heard of is not its business - applyJournalEntry
    // leaves them where they are rather than dropping them.
    if (parts.length === 2 && parts[0] === 'roster'
        && (parts[1] === 'workerOrder' || parts[1] === 'placeOrder')) {
        const kind = parts[1] === 'workerOrder' ? 'workers' : 'places';
        const stored = (schedule[kind] || [])
            .filter(item => item && item.id).map(item => String(item.id));
        const wanted = (Array.isArray(value) ? value : []).map(String)
            .filter(id => stored.indexOf(id) !== -1);
        return wanted.every((id, at) => stored[at] === id);
    }

    if (parts.length === 1 && (parts[0] === 'workers' || parts[0] === 'places')) {
        return same(schedule[parts[0]], value);
    }

    return false;
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

    if (!text) {
        banner.style.display = 'none';
        // Forgotten as well as hidden: the next occurrence of the SAME failure must
        // show again, and the memo below would short-circuit it into permanent silence.
        delete banner.dataset.text;
        return;
    }
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
        blocked: 'הסנכרון מושהה עד שהנתונים הפגומים ייוצאו. הרישום שמור במכשיר הזה בלבד.',
        connecting: 'מתחבר לענן…',
        claimstuck: 'הרישום שמור במכשיר. השליחה תקועה - סגור את שאר החלונות של האפליקציה, '
            + 'ואם זה נמשך ייצא גיבוי ופתח מחדש.',
        synced: 'מסונכרן בין המכשירים.',
        // CONNECTED, AND NOT FINISHED. The state between them, which the line had no word
        // for: everything is on this disk, some of it has gone, and the rest has not. It
        // is not 'connecting' - the connection is made - and it is emphatically not
        // 'synced'. The queue count the line already appends says how much.
        sending: 'מחובר. יש רישומים שעדיין נשלחים.',
        offline: 'אין חיבור - השינויים יישלחו כשהחיבור יחזור.',
        error: 'שגיאת סנכרון - הנתונים שמורים במכשיר הזה.',
        contested: 'הנתונים השתנו במכשיר אחר. הפעולה שלך לא אבדה - '
            + 'רענן, בדוק את המסך, ואשר שוב.'
    };

    // The browser knows the signal is gone before the write watchdog does, and a line
    // still reading "מסונכרן" under the offline banner is the two of them disagreeing
    // in one glance. Only the cloud states defer to it - a device that never had a
    // cloud is off, not offline. 'error' defers too: a flush that died because the
    // signal died is not a sync error worth alarming anyone with, and that status is
    // sticky. With an empty queue the line must not promise sends that do not exist -
    // there is nothing to send, and saying so is the whole difference between "wait"
    // and "worry".
    const offlineNow = typeof navigator !== 'undefined' && navigator.onLine === false;
    const cloudState = FarkadSync.status === 'synced' || FarkadSync.status === 'connecting'
        || FarkadSync.status === 'error' || FarkadSync.status === 'sending';
    const status = offlineNow && cloudState
        ? (FarkadSync.pendingCount() > 0 ? 'offline' : 'offlineClean')
        : FarkadSync.status;
    let text = status === 'offlineClean'
        ? 'אין חיבור - הכל כבר נשלח.'
        : (messages[status] || messages.off);

    if ((status === 'synced' || status === 'offline' || status === 'offlineClean')
        && FarkadSync.lastSyncedAt) {
        // Hours and minutes: the default he-IL form appends seconds, and a status line
        // is not a stopwatch. Kept while offline - how stale the cloud copy is becomes
        // the one number that matters the moment the signal drops.
        text += ` · עודכן: ${FarkadSync.lastSyncedAt.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`;
    }

    // How many edits are written down here and not yet in the cloud. Said plainly,
    // because "synced" while a day is still sitting in the queue is the same lie as a
    // green tick over a failed save - and this is the number that tells the difference
    // between "the other two can see it" and "only this phone can".
    //
    // One waits in the singular. "1 ממתינים לשליחה" is not Hebrew, and it appears on the
    // line a person reads to decide whether the other two phones can see tonight's work -
    // the number is right and the sentence around it is wrong, which is the kind of thing
    // that makes somebody doubt the number.
    //
    // The design's handoff suggested "מקדמה אחת ממתינה" here. That word is not right for
    // this line: it counts EDITS - a day assigned, a name changed, a rate set - and
    // almost none of them are advances. The app's own word for one of those is רישום, so
    // the agreement is fixed and the noun is the one this line has always been about.
    const waiting = FarkadSync.pendingCount();
    if (waiting === 1) {
        text += ' (רישום אחד ממתין לשליחה)';
    } else if (waiting > 1) {
        text += ` (${waiting} ממתינים לשליחה)`;
    }

    // Deliberately not the banner. The banner is for a change that was NOT written down;
    // this is the opposite - everything is saved, and what has stopped is the ability to
    // keep a way back. Appended rather than substituted, because the sync state is the
    // other half of the same question and a device can sit in this condition for months:
    // hiding "מסונכרן" behind it for a year would be its own bug.
    if (typeof capacityState === 'function' && capacityState() === 'critical') {
        text += ' ⚠️ אין מקום לשמור מצב קודם - ייצא קובץ גיבוי.';
    }

    notice.textContent = text;
}
