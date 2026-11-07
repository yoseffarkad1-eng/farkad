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

// ONE KEY PER HELD OPERATION. See holdHere: a conflict nobody has answered has to still
// be a conflict after the app is closed, so the hold is on the disk rather than in a Set
// that dies with the tab. One key per operation means no two windows ever write the same
// one, which is the only kind of write this store makes safely.
const HOLD_PREFIX = 'farkad:hold:';

// A PERSON'S ANSWER TO ONE HELD OPERATION, written before the send it authorises. Its own
// key, one per operation, so no two windows write the same bytes and a crash cannot leave
// the answer half made. See answerHold.
const ANSWER_PREFIX = 'farkad:holdanswer:';

// THE LAST CONFIRMED VALUE OF EACH OF THE N MOST RECENTLY COLLECTED FIELDS.
//
// A BOUNDED LOCAL RING, approved as that and not as an unlimited G2 - see
// features/stale-window/contract.md §5a. What it is for: the collector takes an operation
// off the queue only once `op.sent` is true and the disk holds it, and after that the
// device had no copy of its own. An older build - code already on a phone, which cannot
// be given a new rule - then writes its own stale memory over the record, and on a device
// that has lost its cloud for good there was nothing left to put the day back.
//
// THE BOUND IS TWO NUMBERS AND BOTH ARE ENFORCED, because a count alone is not a byte
// limit. MEASURED on a realistic crew - 20 workers, 12 sites, one man on two sites - a
// count-only ring of 32 came to 17,520 bytes against a 5,786-byte record: THREE TIMES the
// record it was insuring, because the biggest entries were whole-roster paths that grow
// with the crew rather than with N. Both halves of that are fixed here.
//
//   N      = KEPT_LIMIT: 32 field paths.
//   bytes  = a quarter of the record, with a 32 KB ceiling AND a floor of one entry.
//
// Whichever of the two binds first, binds. Measured: a worker-day entry is about 440
// bytes, so the quarter rule lets the COUNT bind only once the record passes about 56 KB -
// a season - and below that the BYTES bind. On the 5,786-byte record measured above the
// cap is 1,446 bytes, which is three days of entries.
//
// THE FLOOR IS ONE ENTRY, and it is there because without it the guarantee was empty
// where it was needed most: on a 1,500-byte record a quarter is 375 bytes and a single
// day entry is 440, so nothing at all was insured. The newest confirmed field is always
// kept. The worst case is therefore stated honestly as max(one entry, a quarter of the
// record), capped at 32 KB - which on a tiny record is one entry, around 440 bytes.
//
// WHAT THAT BUYS, as a guarantee rather than an estimate: past the floor, the ring can
// never shift a capacity verdict by more than a quarter of one threshold step, because a
// threshold step is one record copy. A single entry that alone exceeds the cap AND is not
// the only one is not kept, so one large value cannot evict the ring to make room for
// itself.
//
// AND ONLY THE FAMILIES WHERE A QUEUED VALUE REPLACES WHAT IS THERE - replacesWhole, the
// same classification the pre-send hold uses, for the same reason. A day, a ledger entry,
// one field of one person. A whole-roster array merges per id and an added worker is
// additive rather than a correction, so keeping those cost 15 KB of the 17.5 and bought
// nothing the snapshot merge does not already do.
//
// WHAT IS RECOVERED: the newest confirmed value of each of the last 32 collected field
// paths, from the device alone, with no network. WHAT IS NOT GUARANTEED: anything that
// has fallen off the end - the 33rd path back and older. For those the recovery is still
// the cloud, and on a device that has permanently lost its cloud they are not recoverable
// locally. That is the residual, written down rather than closed.
//
// One key per PATH, so each entry is written by a single setItem - ownership per key, no
// lock - and a second confirmation of the same field replaces its own entry instead of
// adding one. Written ONLY at collection, which is why it costs nothing on a device with
// no cloud: nothing is ever `sent` there, so nothing is ever collected. That is also what
// keeps it clear of the capacity suites, whose devices are offline - the whole-record
// copy this replaced was written on every save and broke both of them.
//
// NEVER LADDER CURRENCY. Store.reclaim sells restore points and nothing else: a device
// with none refuses the write that does not fit and moves not one byte, and
// tests/capacity.test.mjs says so.
const KEPT_PREFIX = 'farkad:kept:';
const KEPT_LIMIT = 32;
// OUTSIDE the ring's own prefix, deliberately: anything that wipes or refuses the ring -
// a quota rule, a cleanup, a person clearing site data for that family - would otherwise
// take the flag that says the ring is incomplete with it, and the device would go back to
// claiming a protection it has lost.
const KEPT_INCOMPLETE_KEY = 'farkad:keptgap';
const KEPT_BYTES_CEILING = 32 * 1024;
const KEPT_BYTES_SHARE = 4;        // a quarter of the record

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

// A COUNT THAT MAY ALREADY BE ON THE SERVER, written down (v166).
//
// A write can land and its answer be lost; the retry of the same batch is answered from
// its receipt, which is how that ordinary failure costs nothing. A RIMA COUNT is the one
// value where it could cost a record. Its clear is a deleted field, so once the count had
// landed and another phone cleared or moved it, the server held the very nothing this
// phone's write had been built on - and the snapshot this phone last heard, from before
// the write, said nothing too. The next attempt went out under another name (a later
// edit beside it renamed the batch, or a correction superseded it), the receipt was never
// asked, and the count somebody had cleared went back over the clear with both phones
// saying synced. The same happened to a correction made after an answer whose snapshot
// had not arrived yet.
//
// One small key per operation: `<name>~<claim>`. The name is the batch - the receipt -
// this operation was FIRST handed over under ('-' when it never was itself), so the
// batch can be sent again under that name; the claim is the highest revision an
// attempt at its path has claimed while unanswered, carried over to the operation that
// supersedes it, so that a snapshot below it is known to be from before the write may
// have landed. Written only for a batch that carries a count: a worker-day clear leaves
// a value, and none of this was ever needed for it. An older build reads the key as
// somebody else's record and leaves it alone.
const TRY_MARK = ':try:';

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

function outboxOpKey(slotKey, batchId) { return slotKey + OP_MARK + batchId; }
function outboxAckKey(slotKey, opId) { return slotKey + ACK_MARK + opId; }

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

    const tryAt = key.lastIndexOf(TRY_MARK);
    if (tryAt > 0 && slotIndexOf(key.slice(0, tryAt)) !== -1
        && SAFE_ID.test(key.slice(tryAt + TRY_MARK.length))) return 'try';

    return null;
}

function outboxBeatKey(slotKey, opId) { return slotKey + BEAT_MARK + opId; }
function outboxHoldKey(slotKey, opId) { return slotKey + HOLD_MARK + opId; }
function outboxTryKey(slotKey, opId) { return slotKey + TRY_MARK + opId; }

// A try mark's bytes, read. Bytes that do not read still say something was handed to
// the cloud: a name that matches no batch, and a claim no snapshot reaches - the careful
// reading on both counts.
function readTryMark(raw) {
    if (typeof raw !== 'string') return null;
    const at = raw.lastIndexOf('~');
    const name = at === -1 ? '' : raw.slice(0, at);
    const claim = at === -1 ? NaN : Number(raw.slice(at + 1));
    const named = name === '-' || (name !== '' && name.length <= 64 && SAFE_ID.test(name));
    if (!named || !Number.isSafeInteger(claim) || claim < 0) {
        return { name: '?', claim: Number.MAX_SAFE_INTEGER };
    }
    return { name: name === '-' ? null : name, claim };
}

function tryMarkText(mark) {
    return `${mark.name || '-'}~${Number.isSafeInteger(mark.claim) ? mark.claim : 0}`;
}

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
    const tries = new Map();
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
        if (kind === 'try') tries.set(key, readTryMark(records[key]));
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
            held: holds.has(outboxHoldKey(slot, op.opId)),
            tried: tries.get(outboxTryKey(slot, op.opId)) || null
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
                held: holds.has(outboxHoldKey(slot, opId)),
                tried: tries.get(outboxTryKey(slot, opId)) || null
            });
        });
    }

    return { operations, unreadable, acknowledged, retired, holds };
}

// Two readings of this device's queue keys, compared by key and by byte.
//
// The whole of `decodedQueue`'s honesty rests here, so it is written to fail towards
// re-decoding: any key on one side and not the other, any value that differs, any
// difference in how many keys there are at all, and the answer is no. A key can only be
// one of this queue's exact shapes (`queueKeyKind`), so nothing that lands in one of these
// maps can name a property of Object.prototype and read as present when it is absent.
//
// Comparing the VALUES rather than counting the keys is the point of it. An operation the
// other tab acknowledged adds a key; an operation it retired adds a key; a slot mark it
// raised changes bytes under a key that was already there and moves no count at all - and
// that last one is why nothing here may be a length or a tick.
function sameQueueRecords(before, after) {
    if (before === after) return true;
    if (!before || !after) return false;
    const keys = Object.keys(before);
    if (keys.length !== Object.keys(after).length) return false;
    for (let i = 0; i < keys.length; i += 1) {
        if (before[keys[i]] !== after[keys[i]]) return false;
    }
    return true;
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
//
// `knownAdvances` is the last of the frozen facts, and the newest. It names every advance
// this device could see AT THE MOMENT THE RESTORE WAS ASKED FOR, so that absorbCloudLedger
// can tell the two reasons an advance can be in the cloud and not in the backup apart:
//
//   it was there before, and the backup does not have it   -> the restore is removing it,
//                                                             which is what a restore is
//   it arrived after the person chose the backup           -> it is money somebody was
//                                                             handed in the window, and
//                                                             the restore never meant it
//
// Without the list the two are the same shape and the second was silently lost - 800
// shekels handed over while a restore was on the wire, gone from all three phones, every
// one of them saying synced. See tests/overlap.restore.test.mjs O8b.
//
// null means an envelope written before this field existed. Absence is read as "this
// device cannot tell the two apart", and nothing is absorbed - the behaviour that shipped
// - rather than guessing in either direction over somebody's wages.
function replacementEnvelope(document, phase, transactionId, supersedesSeq, cloud, supersedes,
    knownAdvances) {
    return {
        version: REPLACE_VERSION,
        phase,
        transactionId,
        supersedesSeq: Number(supersedesSeq) || 0,
        knownAdvances: Array.isArray(knownAdvances) ? knownAdvances.map(String) : null,
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

// The families where a queued value REPLACES what is there: a day, a ledger entry, or -
// since v104 - one field of one person. See the pre-send check in sendClaimed, and the
// paragraph below for why a WHOLE roster record is still not one of them.
function replacesWhole(path) {
    const text = String(path);
    if (text.indexOf('days.') === 0 || text.indexOf('ledger.') === 0) return true;
    // ONE FIELD OF ONE PERSON, and it is in this family for the same reason a day is.
    //
    // The roster used to be excluded whole, and the reason given was that it merges per
    // id and that an added worker is additive rather than a correction of a value
    // somebody was looking at. That is still exactly true of `roster.workers.<id>` - a
    // whole record, usually a man who has just been added, and holding those is what
    // would have stopped a worker added after a prepared restore from ever reaching the
    // cloud (G12-G14).
    //
    // It is not true of `roster.workers.<id>.dailyRate`. That path names one value, it
    // REPLACES what is there, and what is there is what somebody is paid. Two phones
    // disagreeing about it is not a merge and there is no arithmetic that resolves it:
    // one of the two numbers is wrong and only a person knows which. So it is recorded
    // with what this device had seen there, asked before it goes out, and HELD when the
    // server holds something this device never saw - the same treatment a day gets, for
    // the same reason. A phone number and a rate are held alike; the field that is
    // contested is the only one held, because the paths are one field wide.
    return text.indexOf('roster.') === 0 && text.split('.').length === 4;
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
    // Only worker-day and Rima-count nulls become deleteField() in the production
    // adapter. Roster nulls are persistent tombstones, including when creating a document.
    if (value === null && parts.length === 4 && parts[0] === 'days'
        && (parts[2] === 'plan' || parts[2] === 'actual' || parts[2] === 'rima')) delete node[last];
    else node[last] = value;
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
    // A count's try marks for THIS SESSION, beside the keys - for when the disk would not
    // take one (v166, TRY_MARK). opId -> { name, claim }.
    _triedNow: new Map(),
    // Paths whose next edit is a person's answer to a held row in ⋯, made looking at the
    // cloud's side: the base IS what they saw, whatever came before it. See seenMarksAt.
    _decidedAt: new Set(),
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
    // The last decode of this device's queue, and the exact bytes it was made from. Not a
    // record of what this tab did - a record of what the disk said, checked against the
    // disk again before it is used. See decodedQueue.
    _queueCache: null,
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

        // The conflicts this disk is still holding an answer for, before anything else -
        // a window that has just opened must know about them before it can send. See
        // holdHere: without this the hold died with the tab that made it, and the
        // operation nobody had decided about went out on the next flush.
        this.loadHolds();

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
        return this.operationsFrom(this.decodedQueue());
    },

    // THE DECODE, KEPT AGAINST THE EXACT BYTES IT WAS MADE FROM.
    //
    // The disk is read here on every call, every time, through `durableQueueRecords` and
    // therefore through `Store.durableGet` - the accessor that deliberately bypasses
    // `Store.memory` so that what ANOTHER TAB wrote is what comes back. Nothing about that
    // read is skipped or shortened, and nothing here consults a counter, an event or this
    // tab's belief about what it did last. The cached decode is discarded the moment the
    // freshly-read records differ from the ones it was built from, by so much as one byte
    // under one key - so a second tab's edit, acknowledgement, retirement or removal
    // invalidates it by arithmetic rather than by notification. There is no signal being
    // trusted, and so no signal to get wrong; see features/queue-cost/contract.md and
    // tests/queuecost.test.mjs, which asks the other tab all four questions.
    //
    // Same pattern as `storedSchedule` below and `_localRosterBaselineText` above: the
    // bytes are the key. What it buys is that the queue is DECODED once per change rather
    // than once per question, and the questions are many - `queueOperations` asks twice
    // before a single edit can be written, `collectQueueGarbage` asks on the save that
    // follows, and `pendingCount` asks for the number on the status line on every render.
    // On the phone this was written for that was four full rebuilds of every operation on
    // the disk per tap, growing by one operation per edit for as long as the writes are
    // being refused. NOTHING IS FORGOTTEN TO PAY FOR IT: this changes how often the queue
    // is read, and not by one entry what the queue holds.
    //
    // `decodeQueue` is a pure function of the record map - `queueKeyKind`,
    // `readBatchCached`, `legacyOpId` and the two orderings are all deterministic in it -
    // so reusing one decode of some bytes in place of another decode of the same bytes is
    // not a claim about anything.
    //
    // Unbounded on purpose, unlike BATCH_CACHE above: it holds exactly one decode of one
    // disk, and a disk is bounded by the browser's own quota. A ceiling here would mean
    // the deepest queues - the only ones this is for - were the ones it stopped helping.
    decodedQueue() {
        const records = this.durableQueueRecords();
        const cached = this._queueCache;
        if (cached && sameQueueRecords(cached.records, records)) return cached.decoded;
        const decoded = decodeQueue(records);
        this._queueCache = { records, decoded };
        return decoded;
    },

    // The operations out of a decode, held aside first and copied on the way out.
    //
    // COPIED, and that is not a detail. `decodeQueue` clones each value out of the parse
    // cache because a value that reaches State is a value ordinary app code edits in place
    // before it commits anything; a cached decode handed straight to two callers would put
    // that guarantee back exactly where it was. So the cached operations never leave: each
    // call gets its own shallow copy of every operation, its own clone of the value, and
    // its own copy of `after`. Measured at six hundred operations that is 0.4ms against
    // the 4ms it replaces.
    operationsFrom(decoded) {
        // A record that will not read is held, not skipped. The mark of a slot is
        // handled by loadOutbox, which has to decide where recording continues; a BATCH
        // is quarantined here, because nothing else reads one. Asked on every call, not
        // once per decode: what this reports about a damaged record must not depend on
        // whether the bytes beside it happened to move.
        decoded.unreadable.forEach(key => {
            if (slotIndexOf(key) !== -1) return;
            console.error('Queued batch does not read as one, holding it:', key);
            this.outboxDamaged = true;
            Recovery.damaged(key, Store.durableGet(key),
                `קבוצת עריכות בתור השליחה לא נקראה: ${key}.`);
        });

        return decoded.operations.map(op => Object.assign({}, op, {
            value: cloneValue(op.value),
            after: (op.after || []).slice()
        }));
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
        //
        // TWO READINGS, DELIBERATELY, and collapsing them into one is a change to
        // something other than speed. The gap between them is the window in which the
        // other tab's write lands unseen by this one, so that neither names the other and
        // the two are GENUINELY concurrent - which is the state A1 and C1-C5 are about,
        // and both suites open their races on the second of these two reads
        // (`twoTabsRace`, tests/adversarial.test.mjs and tests/concurrency.test.mjs).
        // Narrowing that window narrows the only case where the projection has to decide
        // between two operations by rule rather than by record, and this file is not the
        // place to make a race rarer instead of correct. It costs a re-read of the disk,
        // which is what it was always for; the decode behind it is shared - see
        // decodedQueue.
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
        // A COUNT THIS DEVICE MAY ALREADY HAVE PUT ON THE SERVER (v166): an operation for
        // the path has been handed to the cloud, or answered for. What that operation had
        // seen - the nothing before it - is not what the server held after it; and the
        // claim of one still unanswered passes to the operation that supersedes it.
        const handedOver = path => isRimaFieldPath(path)
            && all.some(op => op.path === path && (op.sent || this.tryMarkOf(op) !== null));
        const inherited = new Map();
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
                ? this.seenMarksAt(entry.path, held, previous, {
                    handedOver: handedOver(entry.path),
                    decided: this._decidedAt.has(String(entry.path))
                }) : null;
            if (isRimaFieldPath(entry.path)) {
                const claim = this.claimAt(entry.path);
                if (claim !== null) inherited.set(entry.path, claim);
            }
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

        // A PATH HELD IN MEMORY IS RELEASED BY THE FRESH OPERATION THAT LANDED ON IT.
        //
        // _heldNow is the hold the disk refused to write down - the loser's operation is
        // still on the disk unmarked, so for this session the PATH was withheld by name
        // (send.js). Nothing ever removed a path from it, so the way out of a hold - a
        // fresh explicit edit of the same path - was blocked until a reopen: the button in
        // the ⋯ panel committed, sent nothing, and re-listed the row; a day-screen edit had
        // the same session-long block. Measured in tests/held.test.mjs «a hold the disk
        // would not take is released by the same decision, in the same session».
        //
        // Safe to release HERE and only here: the batch above is on the disk, its
        // operations name every live operation on the path in `after` - the loser
        // included - and carry the current base in `seen`, so the loser is superseded by
        // record and can never be sent, and the pre-send pass asks movedUnder of the
        // fresh operation on its own evidence.
        ops.forEach(op => this._heldNow.delete(String(op.path)));
        ops.forEach(op => this._decidedAt.delete(String(op.path)));
        // The claim of an unanswered attempt, carried by what superseded it - see TRY_MARK.
        ops.forEach(op => {
            if (!inherited.has(op.path) || inBatch.get(op.path) !== op) return;
            this.writeTryMark({ opId: op.opId, slot: this._activeKey },
                { name: null, claim: inherited.get(op.path) });
        });

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

    // ------------------------------------------------------------ a count's attempts

    // What is written down about this operation having been handed to the cloud, or null
    // if nothing is. See TRY_MARK.
    tryMarkOf(op) {
        if (!op) return null;
        const disk = op.tried && typeof op.tried === 'object' ? op.tried : null;
        const session = this._triedNow.get(String(op.opId)) || null;
        if (!session) return disk;
        if (!disk) return session;
        return { name: disk.name || session.name, claim: Math.max(disk.claim, session.claim) };
    },

    // The batch name this operation was first handed over under itself, or null.
    triedNameFor(op) {
        const mark = this.tryMarkOf(op);
        return mark ? mark.name : null;
    },

    // A mark is kept for the session whatever the disk says; the send is never refused
    // for one, because the alternative to this record is the behaviour before it, not a
    // lost edit.
    writeTryMark(op, mark) {
        if (!op || !op.slot) return;
        this._triedNow.set(String(op.opId), { name: mark.name || null, claim: mark.claim || 0 });
        const key = outboxTryKey(op.slot, op.opId);
        if (!Store.setVerified(key, tryMarkText(mark))) Store.forget(key);
    },

    // The highest revision an attempt at `path` has claimed and not been answered for.
    claimAt(path) {
        let claim = null;
        this.physicalOperations().forEach(op => {
            if (op.path !== String(path) || op.sent) return;
            const mark = this.tryMarkOf(op);
            if (!mark || !(mark.claim > 0)) return;
            claim = claim === null ? mark.claim : Math.max(claim, mark.claim);
        });
        return claim;
    },

    // BEFORE THE HANDOVER, after the stamp: every operation of a batch that carries a
    // count is written down under this batch's name - unless it already has one, since
    // the FIRST name is the one a receipt may exist for - and under the revision it
    // claims.
    //
    // Returns the operations whose mark this attempt wrote for the first time, so that an
    // attempt the adapter says never left the device takes them back off (forgetHandedOver).
    noteHandedOver(sent, batchName, claim) {
        const fresh = [];
        if (!sent || sent.size === 0 || typeof batchName !== 'string') return fresh;
        if (![...sent.keys()].some(path => isRimaFieldPath(path))) return fresh;
        const live = this._outbox;
        sent.forEach((entry, path) => {
            const op = live.get(path);
            if (!op || op.opId !== entry.opId) return;
            const mark = this.tryMarkOf(op);
            const next = {
                name: (mark && mark.name) || batchName,
                claim: Math.max(mark ? mark.claim : 0, Number.isSafeInteger(claim) ? claim : 0)
            };
            if (mark && mark.name === next.name && mark.claim === next.claim) return;
            if (!mark) fresh.push({ opId: op.opId, slot: op.slot });
            this.writeTryMark(op, next);
        });
        return fresh;
    },

    // AN ATTEMPT THAT NEVER LEFT THE DEVICE, taken back off (v166). With no signal at all the
    // request fails before it is sent, and the adapter says so (`unsent`). Left written
    // down, it made every count in that batch one that "may already be on the server", and
    // correcting one of them held the others at the next signal over a cloud that had never
    // seen them. Only the marks this attempt wrote: one from an earlier attempt stays.
    forgetHandedOver(fresh) {
        (fresh || []).forEach(op => {
            this._triedNow.delete(String(op.opId));
            const key = outboxTryKey(op.slot, op.opId);
            if (Store.durableGet(key) === null) return;
            try { Store.remove(key); } catch (error) { /* bytes, not truth */ }
            Store.forget(key);
        });
    },

    // A REBASE claims a higher revision for the same attempt; the mark follows it.
    noteClaimed(patch) {
        if (!patch || !Number.isSafeInteger(patch.revision)) return;
        Object.keys(patch).forEach(path => {
            if (!isRimaFieldPath(path)) return;
            const op = this._outbox.get(path);
            const mark = this.tryMarkOf(op);
            if (!mark || mark.claim >= patch.revision) return;
            this.writeTryMark(op, { name: mark.name, claim: patch.revision });
        });
    },

    // The person is answering a held row in ⋯ - see _decidedAt.
    noteDecision(path, deciding) {
        if (deciding) this._decidedAt.add(String(path));
        else this._decidedAt.delete(String(path));
    },

    // THE ATTEMPT THAT MAY HAVE LANDED, sent again exactly as it went.
    //
    // A batch name is a digest of what it carries, so whether a set of operations IS that
    // batch can be computed rather than assumed. When every operation first handed over
    // under one name is still the current, sendable one for its path and their digest is
    // that name, the batch is sent again ALONE: if it landed, the server answers from its
    // receipt and writes nothing, whatever has happened at the path since; if it did not,
    // it lands now. Anything beside it would rename it, and the receipt would never be
    // asked. Returns name -> the paths it carries.
    replayableAttempts(sendable) {
        const groups = new Map();
        this.physicalOperations().forEach(op => {
            const name = this.triedNameFor(op);
            if (name === null || name === '?' || op.sent) return;
            if (!groups.has(name)) groups.set(name, []);
            groups.get(name).push(op);
        });
        const out = new Map();
        const live = this._outbox;
        groups.forEach((ops, name) => {
            const whole = ops.every(op => {
                const current = live.get(op.path);
                return current && current.opId === op.opId && sendable(current, String(op.path));
            });
            if (!whole) return;
            const named = new Map(ops.map(op => [op.path, { opId: op.opId, seq: op.seq }]));
            if (this.operationIdFor(named) !== name) return;
            out.set(name, ops.map(op => String(op.path)));
        });
        return out;
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

        // One reading of the disk, two questions of it: what this device holds, and
        // whether anything on it would not read. They were two readings and two decodes,
        // which is the one arrangement where the answers can be about different disks.
        const decoded = this.decodedQueue();
        const all = this.operationsFrom(decoded);
        const decodedUnreadable = decoded.unreadable.length > 0;
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

        // A winner may only go once everything it beat is GONE, and once everything it
        // superseded by name has gone. Both are the same rule seen twice: never remove
        // the record that is keeping an older value out of the way.
        //
        // EVERY LOSER THAT IS STILL READABLE, retired or not - and the "or not" is the
        // whole of this. It used to be built from the retired ones alone: a loser whose
        // retirement the disk had just refused was not in the set, so its winner owed
        // nothing and was collected in the same pass that had failed to write the one
        // record keeping that loser defeated. The loser was then the only operation left
        // for its path, became current at the next projection, went to the cloud, and
        // replaced the value it had lost to. The paragraph above the retirement pass says
        // the winner stays in exactly this case; it was the only thing that did not.
        //
        // Measured in tests/races.tabs.test.mjs, R14: two tabs racing one day, the disk
        // refusing the retirement, and the beaten value current again on the next reopen -
        // on a device whose only sign of trouble was a pass that returned false.
        //
        // Superseded-by-name is deliberately not counted here: the batch check below owes
        // on `after` directly, which is the same guarantee written where that relationship
        // lives.
        const owedRetirements = new Set();
        all.forEach(op => {
            if (superseded.has(op.opId)) return;
            const winner = current.get(op.path);
            if (!winner || winner.opId === op.opId) return;
            owedRetirements.add(winner.opId);
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

            // Before the bytes go: the last confirmed value of each field in this batch,
            // into the bounded ring. See KEPT_PREFIX. Best effort and optional - an entry
            // that will not fit costs the recovery of that one field and nothing else,
            // and the operation is leaving either way because the cloud has it.
            // A RING WRITE THAT FAILED IS WRITTEN DOWN, not shrugged off. The operation
            // leaves either way - the cloud has it, which is what let it be collected -
            // but the offline protection for that field is gone, and the guarantee in
            // contract.md §5a is about exactly that protection. Silently dropping one
            // means the panel keeps claiming a recovery this device can no longer make.
            // The flag is one key, written once, and `⋯` reads it.
            ops.forEach(op => {
                if (!replacesWhole(op.path)) return;
                // NOT A RIMA COUNT (v166). What the ring keeps is laid back at boot over a
                // disk that holds NOTHING at its path - see lostFields in js/state.js - and a
                // count's clear is exactly that nothing: setRimaCount deletes the field, and
                // so does the snapshot carrying another phone's clear. Kept here, a count
                // this phone sent and somebody else then cleared came back at every open
                // with no signal, and correcting it was refused as a conflict with this
                // phone's own disk - while every count took a ring slot from a pay record.
                // The price, accepted: a count an OLDER build's window wiped off this disk
                // is not put back offline at boot. The cloud still has it, and the next
                // snapshot brings it back (receive's own-echo rule compares the counts).
                // replacesWhole itself is unchanged: the pre-send hold and the seen marks
                // need a count to be a value that replaces what is there.
                if (isRimaFieldPath(op.path)) return;
                if (!this.keepConfirmed(op)) this.noteKeptIncomplete(op.path);
            });

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
                if (kind !== 'ack' && kind !== 'beat' && kind !== 'try') return;
                const mark = kind === 'ack' ? ACK_MARK : kind === 'beat' ? BEAT_MARK : TRY_MARK;
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
        this._triedNow.delete(String(op.opId));
        [outboxAckKey(op.slot, op.opId), outboxBeatKey(op.slot, op.opId),
            outboxTryKey(op.slot, op.opId)].forEach(key => {
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
        return queueJournalEntries(this.replayable(), envelope);
    },

    // THE OPERATIONS A REPLAY MAY LAY BACK OVER THE RECORD.
    //
    // A held operation is not one of them: it is the value nobody has agreed to, and
    // laying it back on the schedule is how v163's hold came to be cosmetic - kept out of
    // the send, correctly, and then put straight back on the record by the next replay.
    //
    // WITHHELD BEFORE THE PROJECTION, which is the part that took two goes to get right.
    // Filtering the projection's ANSWER by path threw away the whole path, and the other
    // window's correction was at that path too - so holding this window's edit also held
    // the record it was being held in favour of, and the man's day came back empty.
    // Removing the held operation first lets the projection fall back to the best
    // operation that IS answerable for the path, which is exactly the other window's
    // correction. Measured in tests/codex3.probes.test.mjs, D3.
    //
    // A SENT operation is replayable whether or not it carries a mark. Its value is in
    // the cloud and in the record already; the mark on it says a path was contested, not
    // that this device should forget what it has already published.
    //
    // AND THE SESSION-ONLY HOLD COUNTS HERE TOO. `op.held` reads the durable mark, and the
    // mark is one of the things a full disk refuses - so on the one device where the hold
    // could not be written down, this filter answered "replayable" about an operation the
    // send was correctly refusing, and a rollback or a boot replay laid the undecided
    // value straight back onto the schedule. Only the snapshot path had been taught;
    // these two had not. _heldLocalNow is the same session set holdHere adds to when
    // holdContested reports the mark undurable.
    //
    // Asked as `op.held || _heldLocalNow`, deliberately, and NOT as heldAgainstOwnDisk:
    // that question answers false for the cloud kind, which would make a write that lost
    // a race to another PHONE replayable again - and what that phone keeps on its own
    // screen while the panel offers the choice is what tests/contested.test.mjs and
    // tests/held.test.mjs pin.
    replayable() {
        return this.physicalOperations().filter(op => op.sent
            || !(op.held || this._heldLocalNow.has(String(op.opId))))
            .filter(op => !this.answeredAway(op));
    },

    // DID A PERSON DECIDE AGAINST THIS EXACT OPERATION?
    //
    // holdAnswer was written and then read by nothing, which made the durable record of a
    // decision worth nothing: after a reopen the marks were gone, the queue looked
    // ordinary, and the value the person had rejected was an ordinary candidate again.
    // This is the consumer. Belt and braces with the retirement written in answerHold:
    // the retirement is what the projection reads, and this is what holds if that write
    // was later lost to a wipe of one key - a decision against a value is not something
    // to re-derive from bookkeeping that can go missing.
    answeredAway(op) {
        if (!op || !op.opId) return false;
        const answer = this.holdAnswer(op.opId);
        return Boolean(answer) && answer.choice && answer.choice !== 'mine';
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

    // Is this path one a person still owes an answer about?
    //
    // A HELD OPERATION IS NOT REPLAYED OVER THE RECORD, and leaving that out made the
    // hold cosmetic: the operation was kept out of the SEND, correctly, and then laid
    // straight back onto the schedule by the next replay - so the reopened screen showed
    // the value nobody had agreed to, and the next ordinary save carried it to the disk
    // and to the cloud from there. The hold has to mean both things or it means neither.
    //
    // The person's side is not lost by this: it is in the queue, it is in the durable
    // hold with the three sides beside it, and ⋯ shows the pair. Releasing it is what
    // puts it back.
    // ASKED OF THE OPERATION, AND ASKED OF THE DISK.
    //
    // v163 asked this of a Set of PATHS in this window's memory, and both halves of that
    // were wrong. A path is not the question: a hold is about the exact edit that lost,
    // and the person's own later decision is a NEW operation at the SAME path - so a
    // path-shaped filter suppressed the answer along with the question, at every reopen,
    // for as long as the hold record existed. And memory is not the place: the window
    // that wrote the hold was the only one that knew, while the queue beside it was being
    // re-read off the disk on every call, so the OTHER window saw an ordinary operation
    // and sent it. Measured in tests/codex3.probes.test.mjs, D2 and D4.
    //
    // `op.held` is the answer, and it was already there. The hold mark is one small key
    // per operation (outboxHoldKey) written by holdContested, and the decode reads it off
    // the disk every time it rebuilds the queue - which is the rule the queue has obeyed
    // since v102 and the four families in contract.md did not. Nothing new is invented
    // here; the two-window hold stops keeping its own parallel bookkeeping and uses it.
    isHeldHere(path) {
        const key = String(path);
        let current = null;
        try { current = this.projectedQueue().get(key) || null; } catch (error) { return false; }
        if (current) return Boolean(current.held) && !current.sent;
        // No current operation for the path: nothing is being held about it. A mark left
        // over from an operation that has since been superseded and collected is not a
        // hold on the path - see the paragraph above.
        return this._heldNow.has(key);
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
        // See replayable: a conflict nobody has answered is not laid back over the record
        // by a replay any more than it is sent - and withholding it must not withhold the
        // correction it is being held in favour of.
        queueJournalEntries(this.replayable(), envelope)
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
    // Asked of the PROJECTION, which is read off the disk too - a session that has just
    // opened sees the hold before it sends anything. It used to ask the physical set
    // (any operation carrying the mark, not retired), and the two disagree exactly when
    // a held operation has been superseded by a fresh edit whose batch is on the disk
    // while the collection of the held one's batch is refused: superseded, it is out of
    // the projection and can never be sent, but it is still physical, so the line said
    // «contested» over a panel that listed nothing. Measured in tests/held.test.mjs «the
    // status line and the panel answer from the same set».
    holdingContested() {
        this.loadOutbox();
        const live = this._outbox;
        if (this._heldNow.size > 0) {
            if ([...this._heldNow].some(path => live.has(path))) return true;
        }
        return [...live.values()].some(item => item.held && !item.sent);
    },

    // Every held record, for a person to look at: the path, what this device recorded
    // there, and what the cloud was last heard to hold there.
    //
    // A hold is this layer refusing to decide - somebody else changed the record while
    // this phone was away - and until v105 the only trace of it on the screen was the
    // count in «(6 ממתינים לשליחה)» and one sentence: refresh, check the screen, confirm
    // again. But the screen shows THIS device's value: the held operation is current on
    // the disk and the journal lays it over every snapshot. So the person could not see
    // what the other phone had recorded, and re-recording the cell as advised would have
    // sent their own value over it, blind. The owner's phone held six cells of one
    // Thursday for a day before a rescue export, read on a laptop, named them.
    //
    // Read off the projection: a path whose held operation has been superseded by a
    // fresh edit is not listed, because the fresh edit IS the decision and goes out on
    // its own. `cloud` is the base document's value at the path - undefined where the
    // cloud holds nothing there - and `heard` says whether there is a base document to
    // read at all: an open with no signal has none, and a row without its other side is
    // shown without a decision, since a decision offered against nothing is a coin toss.
    // Values are cloned on the way out, like everything the queue hands to the app: a
    // row the panel holds must not be a handle on the parsed queue.
    // Hold one path for THIS SESSION, because another writer of the same disk changed it
    // under us and both answers are now real.
    //
    // The cloud half of this file already holds a path when a write loses a race; this is
    // the same hold reached from the local half, where the other writer is a second
    // WINDOW of this app rather than another phone. A held operation is not sent and is
    // listed in ⋯ with both sides for a person to release one at a time - which is the
    // only honest answer when two people have changed the same worker-day, because the
    // value is the whole record and there is no field left to merge.
    //
    // Nothing is deleted and nothing is zeroed: the operation stays in the queue exactly
    // as it was.
    //
    // THE HOLD IS DURABLE, AND IT HAS TO BE.
    //
    // It used to live only in _heldNow, a Set that dies with the tab - so closing the app
    // released every conflict it was protecting. The next open knew nothing, the queue
    // looked ordinary, and the operation the person had never decided about went out on
    // the first flush. The independent review's F3 asks for the opposite and is right:
    // a conflict nobody has answered is still a conflict tomorrow.
    //
    // One key per held OPERATION, not per path: the hold is about the exact edit that
    // lost, and a later edit at the same path is a different question. The key is written
    // once and is never removed by the app - only a person releasing it from ⋯ removes
    // one - so no code path here can drop a side.
    //
    // THE THREE SIDES ARE KEPT APART, because conflating them is how the fault began:
    //   seen  - the record as this window last agreed the disk held it, which is what the
    //           person was looking at when they made the edit.
    //   mine  - what this window wrote, as the queue holds it.
    //   disk  - what the other writer had put there by the time we looked.
    // A newer value on the disk is not the person agreeing to be replaced by it, and with
    // the three apart there is no way to mistake one for the other.
    holdHere(path, sides) {
        if (!path) return false;
        const key = String(path);

        // The operation this hold is about: the one this window has just queued, which is
        // the current one for the path. Without one there is nothing to name, and a hold
        // on a path with no queued operation would be a hold on nothing.
        this.loadOutbox();
        let op = null;
        try { op = this.projectedQueue().get(key) || null; } catch (error) { op = null; }
        if (!op || !op.opId) return true;

        // ONE OPERATION, AND IT IS THIS WINDOW'S.
        //
        // The mark is the same per-operation mark the cloud half uses, and the decode
        // reads it off the disk on every rebuild, so every window of this app sees it and
        // a reopen sees it. But it is written HERE rather than through holdContested,
        // because holdContested marks every unsent operation at the path - which is the
        // cloud half's rule, where everything pending at a contested path has lost - and
        // for a two-window conflict the other window's operation is the one being ADOPTED,
        // not held. Marking it too meant its correction was never sendable and never
        // replayable: holding this window's edit silently held the record it was being
        // held in favour of. Measured in tests/codex3.probes.test.mjs, R4.
        const mark = outboxHoldKey(op.slot, op.opId);
        if (Store.durableGet(mark) !== ACK_VALUE && !Store.setVerified(mark, ACK_VALUE)) {
            Store.forget(mark);
            // A mark the disk refuses leaves the operation unmarked, so this session
            // carries it instead - the PATH for the status line, and the OPERATION for
            // every decision, because a path-shaped answer is what held the other
            // window's correction. The honest limit is unchanged: a disk that will not
            // take a decision to withhold cannot be made to remember it across a reopen.
            this._heldNow.add(key);
            this._heldLocalNow.add(String(op.opId));
        }

        const already = Store.durableGet(HOLD_PREFIX + op.opId);
        if (already) return true;           // decided once; a second look does not rewrite it

        try {
            Store.setVerified(HOLD_PREFIX + op.opId, JSON.stringify({
                opId: op.opId,
                path: key,
                seen: (sides && sides.seen) === undefined ? null : sides.seen,
                mine: cloneValue(op.value),
                disk: (sides && sides.disk) === undefined ? null : sides.disk,
                at: new Date().toISOString(),
                by: typeof syncDeviceId === 'function' ? syncDeviceId() : null
            }));
        } catch (error) {
            // A hold that cannot be written down is still a hold for this session, and
            // the operation still is not sent. What is lost is only its survival of a
            // reopen, and saying so is honestStatusFor's job, not this function's.
        }
        return true;
    },

    // Every conflict this disk is still holding an answer for, read back off the disk.
    // Called by loadOutbox, so a window that has just opened knows about them before it
    // can send anything.
    // THE THREE SIDES ARE DESCRIPTIVE, AND THEY ARE NOT WHAT HOLDS THE OPERATION.
    //
    // What holds it is the mark on its own key, which the decode reads off the disk every
    // time - see isHeldHere. These records exist so the ⋯ panel can show a person the
    // pair they are deciding between instead of one value and a blank. That separation is
    // the point: a descriptive record the disk refuses costs the person an explanation,
    // not a guarantee, and it must never be the thing a send consults. v163 had it the
    // other way round.
    //
    // Unreadable is still noted: the panel says so rather than drawing a row with a side
    // missing, and the bytes are left exactly where they are.
    loadHolds() {
        let keys = [];
        try { keys = Store.keys ? Store.keys() : []; } catch (error) { keys = []; }
        keys.filter(key => String(key).indexOf(HOLD_PREFIX) === 0).forEach(key => {
            let record = null;
            try { record = JSON.parse(Store.durableGet(key)); } catch (error) { record = null; }
            if (!record || !record.path) this._heldUnreadable = true;
        });
    },

    // What the disk is holding for one operation, or null. The ⋯ panel reads this so the
    // person is shown the three sides rather than one of them.
    durableHold(opId) {
        if (!opId) return null;
        try { return JSON.parse(Store.durableGet(HOLD_PREFIX + opId)); }
        catch (error) { return null; }
    },

    // A person's decision, and the only thing that takes a hold off. The operation is
    // untouched: releasing says "send mine after all", it never discards either side.
    releaseHold(opId) {
        const record = this.durableHold(opId);
        if (!record) return false;
        this._heldNow.delete(String(record.path));
        Store.remove(HOLD_PREFIX + opId);
        return true;
    },

    // THE PERSON'S DECISION, WRITTEN DOWN BEFORE IT IS ACTED ON.
    //
    // v163 had no caller for releaseHold anywhere in js/, and the ⋯ panel answered a hold
    // by issuing a fresh operation and leaving the hold where it was. So the decision
    // existed only as a side effect, nothing on the disk said a person had made it, and a
    // crash between the answer and the send left no evidence either way.
    //
    // The order here is the whole of it: the decision is written and read back FIRST, and
    // only then is the mark that bars the send taken off. A decision that cannot be
    // written down does not unbar anything - the operation stays held, which is the
    // direction that cannot lose work - and the caller is told so it can say so.
    //
    // Bound to the OPERATION, by its id. A later edit at the same path is a different
    // question and gets its own answer; this one is about the edit that lost.
    answerHold(opId, choice) {
        if (!opId) return false;
        const id = String(opId);
        const picked = choice === 'disk' || choice === 'cloud' ? String(choice) : 'mine';
        this.loadOutbox();

        const op = this.physicalOperations().find(item => String(item.opId) === id) || null;
        if (!op) return false;

        const record = JSON.stringify({ opId: id, choice: picked,
            path: String(op.path),
            at: new Date().toISOString(),
            by: typeof syncDeviceId === 'function' ? syncDeviceId() : null });
        if (!Store.setVerified(ANSWER_PREFIX + id, record)) return false;

        // THE REJECTED VALUE IS RETIRED BEFORE ANYTHING IS UNBARRED.
        //
        // Taking the mark off was the FIRST thing this used to do after writing the
        // answer, and between that and the caller's commit the operation was unheld and
        // unsent - so a crash in the gap sent `mine`, which when the person had chosen
        // the other side is the value they had just rejected. An inversion, not a delay.
        //
        // Retirement is the mechanism that already exists for "this operation lost and
        // must never be current again" (see collectQueueGarbage), it is one verified
        // write of its own key, and it is read off the disk by every projection. Written
        // FIRST, and if it cannot be written the hold stands: nothing is unbarred, the
        // answer record stays, and the caller is told.
        if (picked !== 'mine') {
            if (!Store.setVerified(outboxBeatKey(op.slot, id), ACK_VALUE)) {
                Store.forget(outboxBeatKey(op.slot, id));
                return false;
            }
        }

        // Only now, and only for the side that keeps its own value. Both marks: the one
        // that bars the send, and the descriptive pair the panel was drawing.
        Store.forget(outboxHoldKey(op.slot, id));
        Store.remove(outboxHoldKey(op.slot, id));
        Store.remove(HOLD_PREFIX + id);
        this._heldNow.delete(String(op.path));
        this._heldLocalNow.delete(String(id));
        return true;
    },

    // What a person decided about one operation, or null. Read rather than remembered,
    // for the same reason as everything else in contract.md.
    // IS THIS HOLD ABOUT THIS DEVICE'S OWN DISK, rather than about the cloud?
    //
    // The two kinds behave differently on purpose and the difference is one sentence: a
    // write that lost a race to another PHONE keeps its value on this phone's own screen
    // while the panel offers the choice - tests/held.test.mjs and tests/contested.test.mjs
    // are the record of that, and it is right, because the other side of that conflict is
    // somebody else's document. A write that lost to another WINDOW of this same app has
    // its other side on this very disk, already written; laying our undecided value back
    // over an adopted snapshot and persisting it erases the answer the other window
    // wrote, on the one device both of them are.
    //
    // The descriptive three-sides record is what tells them apart, and it is written by
    // holdHere alone. Where it is missing the answer is "treat it as the cloud kind",
    // which keeps the long-settled behaviour and never sends - the send is barred by the
    // mark either way.
    holdIsLocal(opId) {
        if (this.durableHold(opId)) return true;
        return this._heldLocalNow.has(String(opId));
    },

    // Asked of the OPERATION ITSELF, because the mark is one of the things a full disk
    // refuses. `item.held` reads the mark, and when the mark could not be written the
    // answer is false while the hold is perfectly real - so asking only that let the
    // undecided value reach the local record by way of a snapshot, which is the thing
    // this question exists to stop. The session set is the other half of the answer, and
    // it is the whole answer in exactly the case the disk refused.
    heldAgainstOwnDisk(item) {
        if (!item || item.sent) return false;
        if (this._heldLocalNow.has(String(item.opId))) return true;
        return Boolean(item.held) && Boolean(this.durableHold(item.opId));
    },

    // OPERATION ids held against this device's OWN other window where the disk refused to
    // record it. By id and not by path: a path carries both windows' operations, and the
    // other window's is the one being adopted. See holdHere. Session-scoped, like
    // _heldNow beside it and for the same reason.
    _heldLocalNow: new Set(),

    // The enforced byte cap, read off the record it is insuring. Zero when there is no
    // record to measure, which means nothing is kept - there is nothing to insure yet.
    keptBudget() {
        const held = typeof State !== 'undefined' && typeof State.durableText === 'string'
            ? State.durableText : null;
        if (held === null) return 0;
        return Math.min(KEPT_BYTES_CEILING, Math.floor((held.length * 2) / KEPT_BYTES_SHARE));
    },

    keptBytes() {
        return this.keptEntries(true).reduce((bytes, row) => {
            let value = null;
            try { value = Store.durableGet(row.key); } catch (error) { value = null; }
            return value === null ? bytes : bytes + (row.key.length + String(value).length) * 2;
        }, 0);
    },

    // One field's last confirmed value, written as the operation leaves the queue.
    keepConfirmed(op) {
        if (!op || !op.path || !op.sent) return false;
        // Only the families where a queued value REPLACES what is there. See KEPT_PREFIX:
        // the whole-roster paths were 15 KB of a 17.5 KB ring and bought nothing.
        if (typeof replacesWhole === 'function' && !replacesWhole(op.path)) return false;
        let wrote = false;
        try {
            wrote = Store.setVerified(KEPT_PREFIX + String(op.path), JSON.stringify({
                path: String(op.path),
                value: cloneValue(op.value),
                at: new Date().toISOString(),
                // THE OPERATION'S OWN SEQUENCE, because a timestamp is not an order.
                // Thirty-three collections inside one millisecond all carry the same
                // `at`, and sorting on it alone let the trim drop the NEWEST entry and
                // keep the oldest - measured, and exactly backwards. seq only ever goes
                // up on a device, which is what the bound needs.
                seq: Number(op.seq) || 0,
                by: typeof syncDeviceId === 'function' ? syncDeviceId() : null
            }), { optional: true }) === true;
        } catch (error) { wrote = false; }
        if (!wrote) return false;
        // A SINGLE VALUE BIGGER THAN THE WHOLE CAP IS NOT KEPT, rather than kept by
        // evicting everything to make room for itself. Taken straight back out, so the
        // ring is never worse off for having tried.
        const cap = this.keptBudget();
        const key = KEPT_PREFIX + String(op.path);
        let alone = 0;
        try {
            const value = Store.durableGet(key);
            alone = value === null ? 0 : (key.length + String(value).length) * 2;
        } catch (error) { alone = 0; }
        // ...unless it is the only thing in the ring, which is the floor above.
        if (cap > 0 && alone > cap && this.keptEntries(true).length > 1) {
            Store.remove(key);
            return false;
        }
        this.trimKept();
        return wrote;
    },

    // THE BOUND, applied after the write rather than before it, so the newest confirmation
    // is never the one refused. Oldest first, ordered by the operation's own `seq` - a
    // timestamp is not an order, and thirty-three collections inside one millisecond all
    // carry the same `at`, which let the trim drop the newest and keep the oldest. An
    // entry that will not read sorts first and goes first: an unreadable entry is a byte
    // cost with no recovery in it.
    //
    // BOTH LIMITS, in one pass: the count, and the bytes the cap allows. Either one can be
    // what binds - see KEPT_PREFIX.
    trimKept() {
        const rows = this.keptEntries(true);
        const sized = rows.map(row => {
            let value = null;
            try { value = Store.durableGet(row.key); } catch (error) { value = null; }
            return Object.assign({}, row, {
                bytes: value === null ? 0 : (row.key.length + String(value).length) * 2
            });
        });
        sized.sort((one, other) => {
            const seq = row => (row.record && Number.isFinite(Number(row.record.seq))
                ? Number(row.record.seq) : -1);
            if (seq(one) !== seq(other)) return seq(one) - seq(other);
            const a = one.record && one.record.at ? String(one.record.at) : '';
            const b = other.record && other.record.at ? String(other.record.at) : '';
            return a < b ? -1 : a > b ? 1 : 0;
        });

        const cap = this.keptBudget();
        let total = sized.reduce((bytes, row) => bytes + row.bytes, 0);
        let count = sized.length;
        sized.forEach(row => {
            if (count <= KEPT_LIMIT && total <= cap) return;
            // THE FLOOR. Never evict down to nothing: the newest confirmed field is kept
            // whatever the cap says, because on a small record a quarter of it is less
            // than one entry and a guarantee that applies to no device is not one. See
            // KEPT_PREFIX for the worst case this admits.
            if (count <= 1) return;
            Store.remove(row.key);
            total -= row.bytes;
            count -= 1;
        });
    },

    // What this device kept of fields the collector has already taken. Read off the disk
    // every time, like everything else in contract.md.
    // THE RING IS NOT COMPLETE, and the device says so rather than letting a panel claim
    // a protection it has lost. One key, not a list: the person needs to know the ring has
    // a hole in it, and the field names would be a list nobody can act on.
    noteKeptIncomplete(path) {
        try { Store.setVerified(KEPT_INCOMPLETE_KEY, String(path), { optional: true }); }
        catch (error) { /* a flag that cannot be written is the same situation twice */ }
    },

    keptIncomplete() {
        try { return typeof Store.durableGet(KEPT_INCOMPLETE_KEY) === 'string'; }
        catch (error) { return false; }
    },

    // THE WHOLE RING GOES WHEN THE WHOLE RECORD IS REPLACED ON PURPOSE.
    //
    // A restore is the one transaction whose point is to replace everything, and after it
    // this device's earlier confirmations are not the truth any more - they are what the
    // person just asked to be rid of. Left in place they are absences in the new record,
    // which is precisely what the ring's trigger looks for, so the next reopen put the
    // restored-away days back. Measured by tests/data.test.mjs ("after a close and reopen
    // it still does") and tests/concurrency.test.mjs ("a reopen does not put the
    // restored-away day back") - two suites that already existed and were right.
    //
    // Dropping the ring costs insurance and never a record: everything the restore kept is
    // in the restored record, and everything queued after it is in the journal.
    forgetKept() {
        this.keptEntries(true).forEach(row => Store.remove(row.key));
        Store.remove(KEPT_INCOMPLETE_KEY);
        return true;
    },

    keptEntries(withKeys) {
        let keys = [];
        try { keys = Store.keys ? Store.keys() : []; } catch (error) { return []; }
        const rows = [];
        keys.filter(key => String(key).indexOf(KEPT_PREFIX) === 0).forEach(key => {
            let record = null;
            try { record = JSON.parse(Store.durableGet(key)); } catch (error) { record = null; }
            if (withKeys) rows.push({ key, record });
            else if (record && record.path) rows.push(record);
        });
        return rows;
    },

    holdAnswer(opId) {
        if (!opId) return null;
        try { return JSON.parse(Store.durableGet(ANSWER_PREFIX + String(opId))); }
        catch (error) { return null; }
    },

    heldRecords() {
        this.loadOutbox();
        const heard = this._baseDoc !== null;
        const rows = [];
        this._outbox.forEach((item, path) => {
            if (item.sent) return;
            if (!item.held && !this._heldNow.has(String(path))) return;
            // THE THREE SIDES, kept apart. `cloud` is the shared document's value and is
            // undefined where there is no base to read. `seen` and `disk` come off the
            // durable hold when the conflict was with another WINDOW rather than with
            // the cloud - the version the person was looking at, and what the other
            // writer had put there - so the panel can show a pair instead of asking
            // somebody to decide against nothing.
            const hold = this.durableHold(item.opId);
            const row = {
                path: String(path),
                opId: item.opId,
                mine: cloneValue(item.value),
                cloud: heard ? cloneValue(this.baseValueAt(path)) : undefined,
                seen: hold ? hold.seen : undefined,
                disk: hold ? hold.disk : undefined,
                durable: Boolean(hold),
                // IS THERE A DECISION TO OFFER? Not the same question as `heard`.
                //
                // The panel used to offer one only when the CLOUD's side was known, and
                // v163 added a family where the other side is this device's own disk -
                // so on a phone where sync was never configured a two-window conflict
                // could never be answered at all. The record diverged and there was no
                // way out of it, which is a hold that has become a trap. Either side
                // being knowable is enough to ask somebody. Measured in
                // tests/codex3.probes.test.mjs, D4b.
                answerable: !item.sent && (heard || Boolean(hold)),
                heard
            };
            // A COUNT (v166) carries the cloud's counts for its whole day: a move is two
            // paths and a hold names one, so the panel shows the day's other sites beside it.
            if (isRimaFieldPath(path)) {
                row.cloudDay = heard
                    ? cloneValue(this.baseValueAt(`days.${String(path).split('.')[1]}.rima`)) : undefined;
            }
            rows.push(row);
        });
        return rows.sort((one, other) => (one.path < other.path ? -1 : one.path > other.path ? 1 : 0));
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
            if (parts[0] === 'advances' || parts[0] === 'ledger') {
                return Boolean(item && item.value && String(item.value.workerId) === id);
            }
            return false;
        });
    },

    // ------------------------------------------------------------ provenance
    //
    // This proof permits deleting a local typo without cloud sync. Since v119 a shared
    // unused worker may also be deleted, but only after protocol sync has completed.
    // Neither case licenses destroying later offline work: that restores the identity
    // as inactive through reinstateReferenced.
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
            if (parts[0] === 'roster' && (parts.length === 3 || parts.length === 4)
                && (parts[1] === 'workers' || parts[1] === 'places')) {
                // The tombstone too. A null names the id just as loudly as a record does,
                // and it is the write that tells the other phones he existed.
                //
                // And one FIELD of him names him just as loudly again - four segments,
                // the ordinary shape of a roster edit since v104. Missing it here would
                // let a man leave this device with no record that he ever did, and the
                // permanent-deletion offer reads exactly that record: he would be offered
                // for deletion as though he had never been anywhere but here.
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
