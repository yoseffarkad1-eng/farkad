// The advances ledger. Append-only, and off by default.
//
// ---------------------------------------------------------------- why
//
// Today an advance is a record in schedule.advances, and every change to it is a
// mutation: an edit overwrites the amount, a removal deletes the key. That is fine for a
// diary and wrong for money. A man is handed 500 in cash on the 3rd. On the 12th somebody
// corrects the record to 300 - a typo, or an argument, or the wrong man - and from that
// moment there is nothing anywhere that says 500 was ever written down, who changed it,
// or when. On payday the one question that decides what somebody is handed - "what did I
// actually give him?" - is the one question the file can no longer answer.
//
// A deletion is worse: it leaves no trace at all. The pay sheet simply grows by 500 and
// nobody can tell whether that is a correction or a loss.
//
// So the ledger is a list of ENTRIES, and an entry is never rewritten and never removed:
//
//   { id, advanceId, kind, workerId, date, amount, note, at, by }
//
//   kind 'given'      - cash handed over
//        'corrected'  - what it should have said; carries the whole record again
//        'cancelled'  - it did not happen, or it was somebody else
//
// What the screens read is a FOLD over the entries. The fold is derived, never stored,
// and every entry that produced it is still there to be read out loud.
//
// ---------------------------------------------------------------- why it is off
//
// Three phones share this record and they do not update together. A v79 phone writes
// advances.<id> and knows nothing about ledger entries; if a v80 phone stopped writing
// the old field, every advance it recorded would be invisible on the other two - money
// handed over and not on the pay sheet, which is the failure this whole file exists to
// prevent.
//
// So this build ships the READER and the MIGRATION and writes nothing new. The gate below
// stays false until every phone is known to be past v79; with it false the ledger is
// still built from the existing advances, still folded, and still checked by the suite -
// so the day it is turned on, it is turned on over data that has been proven for weeks.

// The compatibility gate. False while any device may still be on a build that cannot read
// ledger entries. Nothing but a person deciding all three phones have updated may flip it.
const LEDGER_WRITES = false;

function ledgerWritesEnabled() {
    return LEDGER_WRITES === true;
}

function ledgerEntryId() {
    return 'le_' + newEntityId('x').slice(2);
}

function ledgerPath(entryId) {
    return `ledger.advances.${entryId}`;
}

// Every entry in the ledger, oldest first. The order is by `at` and then by id, so two
// entries written in the same millisecond on two phones still fold the same way on both.
function ledgerEntries(schedule) {
    const held = (schedule && schedule.ledger && schedule.ledger.advances) || {};
    return Object.keys(held)
        .map(id => held[id])
        .filter(entry => entry && entry.id && entry.advanceId)
        .sort((a, b) => {
            const at = String(a.at || '');
            const bt = String(b.at || '');
            if (at !== bt) return at < bt ? -1 : 1;
            return String(a.id) < String(b.id) ? -1 : 1;
        });
}

// The state of one advance, folded from its entries. Returns null for an advance that was
// cancelled, or that has no 'given' entry to stand on.
function foldAdvance(entries) {
    let state = null;
    entries.forEach(entry => {
        if (entry.kind === 'given') {
            state = {
                id: String(entry.advanceId),
                workerId: String(entry.workerId),
                date: String(entry.date),
                amount: Number(entry.amount) || 0,
                note: String(entry.note || '')
            };
            return;
        }
        if (!state) return;
        if (entry.kind === 'cancelled') { state = null; return; }
        if (entry.kind === 'corrected') {
            state = {
                id: state.id,
                // A correction may move it to another man or another day - that is the
                // commonest correction there is, and the one a mutation loses entirely.
                workerId: entry.workerId === undefined ? state.workerId : String(entry.workerId),
                date: entry.date === undefined ? state.date : String(entry.date),
                amount: entry.amount === undefined ? state.amount : (Number(entry.amount) || 0),
                note: entry.note === undefined ? state.note : String(entry.note || '')
            };
        }
    });
    return state;
}

// Every advance the ledger currently describes, keyed by advance id - the same shape
// schedule.advances has, so everything that reads advances today can read this.
function foldLedger(schedule) {
    const byAdvance = new Map();
    ledgerEntries(schedule).forEach(entry => {
        const key = String(entry.advanceId);
        if (!byAdvance.has(key)) byAdvance.set(key, []);
        byAdvance.get(key).push(entry);
    });

    const out = {};
    byAdvance.forEach((entries, advanceId) => {
        const state = foldAdvance(entries);
        if (state) out[advanceId] = state;
    });
    return out;
}

// What every screen should read: the ledger's answer, with anything only the old field
// knows about laid in beside it.
//
// The overlay is the whole of the compatibility story. A v79 phone writes advances.<id>
// and no entry; without this, an advance recorded on the other phone this evening would
// be missing from this one's pay sheet. An advance the ledger has CANCELLED is not
// resurrected by the old field, though: the cancellation is newer information, and it is
// this build that wrote it.
function currentAdvances(schedule) {
    const folded = foldLedger(schedule);
    const cancelled = new Set();
    ledgerEntries(schedule).forEach(entry => {
        if (entry.kind === 'cancelled') cancelled.add(String(entry.advanceId));
        if (entry.kind === 'given') cancelled.delete(String(entry.advanceId));
    });

    const legacy = (schedule && schedule.advances) || {};
    Object.keys(legacy).forEach(id => {
        const item = legacy[id];
        if (!item || typeof item !== 'object') return;
        if (folded[id] || cancelled.has(String(id))) return;
        folded[id] = {
            id: String(id),
            workerId: String(item.workerId),
            date: String(item.date),
            amount: Number(item.amount) || 0,
            note: String(item.note || '')
        };
    });
    return folded;
}

// The history of one advance, in the words of the entries themselves. This is what makes
// the ledger worth having: it can be read out to the person asking why the number moved.
function advanceHistory(schedule, advanceId) {
    return ledgerEntries(schedule).filter(entry => String(entry.advanceId) === String(advanceId));
}

// ---------------------------------------------------------------- writing
//
// All three take a schedule, append one entry, and hand back the field path so the caller
// can journal it exactly like any other edit. None of them mutates an entry that is
// already there, and none of them touches schedule.advances - the old field is written by
// the caller, in the same commit, for as long as the gate below is closed.

function appendLedgerEntry(schedule, entry) {
    // An entry may bring its own id. The migration must: two phones mirroring the same
    // advance have to mint the SAME key, or the union keeps both and the fold's winner
    // is decided by whichever random id sorts later.
    const id = entry.id ? String(entry.id) : ledgerEntryId();
    const record = Object.assign({}, entry, { id });
    schedule.ledger = schedule.ledger || { advances: {} };
    schedule.ledger.advances = schedule.ledger.advances || {};
    schedule.ledger.advances[id] = record;
    return { path: ledgerPath(id), value: record };
}

function recordAdvanceGiven(schedule, advanceId, workerId, date, amount, note, at, by) {
    return appendLedgerEntry(schedule, {
        advanceId: String(advanceId),
        kind: 'given',
        workerId: String(workerId),
        date: String(date),
        amount: Number(amount) || 0,
        note: String(note || ''),
        at: String(at || ''),
        by: String(by || '')
    });
}

function recordAdvanceCorrected(schedule, advanceId, changes, at, by) {
    const entry = {
        advanceId: String(advanceId),
        kind: 'corrected',
        at: String(at || ''),
        by: String(by || '')
    };
    ['workerId', 'date', 'note'].forEach(field => {
        if (changes && changes[field] !== undefined) entry[field] = String(changes[field]);
    });
    if (changes && changes.amount !== undefined) entry.amount = Number(changes.amount) || 0;
    return appendLedgerEntry(schedule, entry);
}

function recordAdvanceCancelled(schedule, advanceId, note, at, by) {
    return appendLedgerEntry(schedule, {
        advanceId: String(advanceId),
        kind: 'cancelled',
        note: String(note || ''),
        at: String(at || ''),
        by: String(by || '')
    });
}

// ---------------------------------------------------------------- migration
//
// Every advance already on the device becomes a 'given' entry, once. Non-destructive in
// both directions: schedule.advances is left exactly as it is - the other two phones read
// it, and it is the only copy until they update - and an advance that already has an
// entry is never given a second one.
//
// `at` is not invented. There is no timestamp on an old advance, so the entry says so
// with an empty `at` and an explicit origin of 'migration'; a fabricated date here would
// be the ledger's first lie.
function migrateAdvancesToLedger(schedule, deviceId) {
    if (!schedule) return { added: [], paths: {} };

    const known = new Set(ledgerEntries(schedule).map(entry => String(entry.advanceId)));
    const legacy = schedule.advances || {};
    const added = [];
    const paths = {};

    Object.keys(legacy).sort().forEach(id => {
        const item = legacy[id];
        if (!item || typeof item !== 'object') return;
        if (known.has(String(id))) return;
        if (!item.workerId || !/^\d{4}-\d{2}-\d{2}$/.test(String(item.date))) return;

        const written = appendLedgerEntry(schedule, {
            // Deterministic, derived from the advance: every phone that mirrors a_x
            // writes le_mig_a_x, and mergeLedgerInto collapses the copies into one.
            id: 'le_mig_' + String(id),
            advanceId: String(id),
            kind: 'given',
            workerId: String(item.workerId),
            date: String(item.date),
            amount: Number(item.amount) || 0,
            note: String(item.note || ''),
            at: '',
            by: String(deviceId || ''),
            origin: 'migration'
        });
        added.push(String(id));
        paths[written.path] = written.value;
    });

    return { added, paths };
}

// An arriving snapshot has not disagreed with an entry it has never heard of.
//
// Entries are append-only, and that has to hold against the OTHER phones as well as
// against this one: a v79 device writing a whole document knows nothing about a ledger
// and its snapshot carries none, so adopting it wholesale would delete the record of
// every correction ever made here. The two are unioned by id instead. Nothing here can
// remove an entry, and an id that exists on both sides keeps the copy that is already on
// this device - an entry is written once and never edited, so the two are the same entry.
function mergeLedgerInto(target, source) {
    if (!target || !source) return target;
    const held = (source.ledger && source.ledger.advances) || {};

    target.ledger = target.ledger || { advances: {} };
    target.ledger.advances = target.ledger.advances || {};
    Object.keys(held).forEach(id => {
        if (!target.ledger.advances[id]) target.ledger.advances[id] = held[id];
    });
    return target;
}

// Does the ledger say the same thing as the field it was built from?
//
// The question asked before anything is allowed to depend on the ledger, and the answer
// this build reports rather than assumes. Compared on the numbers that decide what
// somebody is handed: the man, the day, and the amount.
function ledgerAgreesWithAdvances(schedule) {
    const folded = foldLedger(schedule);
    const legacy = (schedule && schedule.advances) || {};
    const missing = [];
    const different = [];

    Object.keys(legacy).forEach(id => {
        const item = legacy[id];
        if (!item || typeof item !== 'object') return;
        const state = folded[id];
        if (!state) { missing.push(id); return; }
        if (state.workerId !== String(item.workerId)
            || state.date !== String(item.date)
            || state.amount !== (Number(item.amount) || 0)) {
            different.push(id);
        }
    });

    // The reverse pass. An entry whose advance no longer exists in the legacy field is
    // the ledger remembering money the record has withdrawn - the one state in which
    // flipping the write gate on would dock somebody for a cancelled advance - and a
    // check that walks only the legacy keys is structurally blind to it. Cancelled
    // advances fold to nothing and are rightly not orphans.
    const orphaned = Object.keys(folded).filter(id => {
        const item = legacy[id];
        return !item || typeof item !== 'object';
    });

    return {
        agrees: missing.length === 0 && different.length === 0 && orphaned.length === 0,
        missing, different, orphaned
    };
}
