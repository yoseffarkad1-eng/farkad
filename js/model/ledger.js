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

// THE ONE SEAM, and it is the same seam every other gate in this app has.
//
// The const above is the shipped answer and stays where iron law 1 says it lives. What
// this adds is the ability for a SUITE to open the gate and measure the build somebody
// eventually ships - which was not possible before, so everything behind the gate was
// unmeasured, which is a poor way to keep a feature safe until the day it matters.
//
// FARKAD_FLAG_OVERRIDES is read once, into a frozen object, and tests/build.test.mjs
// fails if any file this app ships mentions it - the page included. So a browser cannot
// reach this, and neither can a phone: opening it needs a file that is not in the shell.
// That is a stronger gate than a bare const, which nothing enforces at all.
//
// The shipped default is unchanged and is still what every device runs. tests/smoke.mjs
// asks a real browser whether the gate is shut, and tests/data.test.mjs asks the model.
function ledgerWritesEnabled() {
    return LEDGER_WRITES === true || FARKAD_FLAGS.ledgerWrites === true;
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
            // How the money moved, only when the entry says. An absent method is not
            // 'cash': every entry written by this build's boot mirror before v87 says
            // nothing at all, and inventing a default here would put a word on the
            // statement the person handing the money over never chose.
            if (typeof entry.method === 'string' && entry.method) state.method = entry.method;
            // Explicit, not absent. A `repaid` that is missing and a `repaid` of zero are
            // the same money, and every reader downstream would otherwise have to
            // remember which one it is looking at.
            state.repaid = 0;
            state.reversed = 0;
            return;
        }
        if (!state) return;
        if (entry.kind === 'cancelled') { state = null; return; }
        // CASH HANDED BACK, against an advance that still stands.
        //
        // It accumulates rather than replacing: a man who pays back 200 twice has paid
        // back 400, and a fold that read the last entry would say 200 and hand him a
        // second deduction for money he no longer owes.
        //
        // It does not touch `amount`. What he was given is a fact about the day it
        // happened and never changes; what is still outstanding is the difference, and
        // keeping them apart is what lets a statement say "500 given, 200 back, 300 to
        // settle" instead of quietly reporting an advance of 300 nobody ever handed over.
        // Reversed money never left the tin. It reduces what is owed exactly as a
        // repayment does, and is kept apart from `repaid` because a statement that
        // called a clerical correction "הוחזר במזומן" would be telling a man he handed
        // back money he never touched.
        if (entry.kind === 'reversed') {
            state = Object.assign({}, state, {
                reversed: (Number(state.reversed) || 0) + (Number(entry.amount) || 0)
            });
            return;
        }
        if (entry.kind === 'repaid') {
            state = Object.assign({}, state, {
                repaid: (Number(state.repaid) || 0) + (Number(entry.amount) || 0)
            });
            return;
        }
        if (entry.kind === 'corrected') {
            const corrected = {
                id: state.id,
                // A correction may move it to another man or another day - that is the
                // commonest correction there is, and the one a mutation loses entirely.
                workerId: entry.workerId === undefined ? state.workerId : String(entry.workerId),
                date: entry.date === undefined ? state.date : String(entry.date),
                amount: entry.amount === undefined ? state.amount : (Number(entry.amount) || 0),
                note: entry.note === undefined ? state.note : String(entry.note || '')
            };
            // A correction that fixes the amount and says nothing about the method has
            // not retracted the method. The commonest correction there is mentions one
            // field; reading its silence as 'it was not cash after all' would rewrite a
            // fact nobody touched.
            const method = entry.method === undefined ? state.method : entry.method;
            if (typeof method === 'string' && method) corrected.method = method;
            // A correction to the amount, the man or the date says nothing about money
            // that was handed back. Dropping it here would resurrect a repayment as an
            // amount still owed, on the one operation somebody reaches for when the
            // record is already wrong.
            corrected.repaid = Number(state.repaid) || 0;
            corrected.reversed = Number(state.reversed) || 0;
            state = corrected;
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
        if (cancelled.has(String(id))) return;
        if (folded[id]) {
            // The overlay lays in what ONLY the old field knows, field by field - it
            // never overwrites the entry. Today every entry is silent about the method
            // and the legacy field is the only place the answer lives; the day an entry
            // does carry one, the entry is the newer statement and it wins.
            if (!folded[id].method && typeof item.method === 'string' && item.method) {
                folded[id].method = item.method;
            }
            return;
        }
        const state = {
            id: String(id),
            workerId: String(item.workerId),
            date: String(item.date),
            amount: Number(item.amount) || 0,
            note: String(item.note || '')
        };
        if (typeof item.method === 'string' && item.method) state.method = item.method;
        folded[id] = state;
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
    // BEFORE ANYTHING IS TOUCHED. A caller-supplied id reaches this function from the
    // migration, from a rescue import and from any build that ever writes an entry, and
    // the line below it writes straight into the live schedule. An id this app cannot
    // safely use as a map key is refused here rather than stored and discovered later:
    // `null` back means no change, no memory mutation, no disk write and no queued
    // operation, which is what State.commit reads as a refusal.
    if (!isSafeId(id)) return null;
    // Undefined fields are dropped, never stored. `method: undefined` survives
    // Object.assign as an own property, and an entry that carries the KEY without a
    // value reads as an entry that was asked how the money moved and answered
    // nothing - which is a different statement from never having been asked.
    const record = { id };
    Object.keys(entry).forEach(field => {
        if (field === 'id' || entry[field] === undefined) return;
        record[field] = entry[field];
    });
    schedule.ledger = schedule.ledger || { advances: {} };
    schedule.ledger.advances = schedule.ledger.advances || {};
    schedule.ledger.advances[id] = record;
    return { path: ledgerPath(id), value: record };
}

function recordAdvanceGiven(schedule, advanceId, workerId, date, amount, note, at, by, method) {
    return appendLedgerEntry(schedule, {
        advanceId: String(advanceId),
        kind: 'given',
        workerId: String(workerId),
        date: String(date),
        amount: Number(amount) || 0,
        note: String(note || ''),
        method: typeof method === 'string' && method ? method : undefined,
        at: String(at || ''),
        by: String(by || '')
    });
}

// THE DEDUCTION, WRITTEN DOWN, at the moment a period closes.
//
// Until this existed the deduction was computed on every read - correct arithmetic over
// the entries dated on or before the period's last day, and correct only for as long as
// that set never changed. It changes. The advance form clamps a repayment into the
// current account, but the wire does not: a phone that was offline for three weeks, an
// import, a restore all deliver entries dated inside a fortnight that was printed and
// paid, and the closing balance moves underneath a payslip somebody was handed.
//
// So a closed period carries a RECORD of what came off, and every later read of that
// period reports the record rather than doing the sum again. That is the difference
// between a period that happens not to have changed yet and one that cannot.
//
// `periodFrom` and `periodTo` name the account it closes, so the record can be found
// again without trusting a date range somebody passed in.
function recordPeriodClosed(schedule, advanceId, workerId, from, to, amount, at, by,
    balanceAfter) {
    return appendLedgerEntry(schedule, {
        advanceId: String(advanceId),
        kind: 'deducted',
        workerId: String(workerId),
        // What was still owed when the period shut - the "יתרה: 1,950" the ledger screen
        // prints beside the closure row. Recorded rather than recomputed for the same
        // reason the deduction is: it is the number the NEXT period was opened on and the
        // number a man was told he still owed.
        balanceAfter: balanceAfter === undefined ? undefined : (Number(balanceAfter) || 0),
        // The period's LAST day: the deduction happens at its close, and dating it there
        // is what puts it inside the period it belongs to on any timeline.
        date: String(to),
        periodFrom: String(from),
        periodTo: String(to),
        amount: Number(amount) || 0,
        at: String(at || ''),
        by: String(by || '')
    });
}

// Every closure recorded against this man, by the period they closed.
function closedPeriods(schedule, workerId) {
    const advances = (schedule && schedule.advances) || {};
    const held = (schedule && schedule.ledger && schedule.ledger.advances) || {};
    const out = {};
    Object.keys(held).map(id => held[id])
        .filter(entry => entry && entry.kind === 'deducted' && entry.periodFrom)
        .filter(entry => {
            const of = advances[entry.advanceId];
            const who = of ? of.workerId : entry.workerId;
            return String(who) === String(workerId);
        })
        .forEach(entry => {
            const key = String(entry.periodFrom);
            // Append, never replace: two advances can each be deducted at one close, and
            // a fold that kept the last would report half of what came off his wage.
            const at = out[key] || { deducted: 0, balanceAfter: undefined };
            at.deducted += Number(entry.amount) || 0;
            if (entry.balanceAfter !== undefined) {
                at.balanceAfter = (at.balanceAfter || 0) + (Number(entry.balanceAfter) || 0);
            }
            out[key] = at;
        });
    return out;
}

// Cash handed BACK against an advance. Its own entry, on its own date - which is the
// whole point: an account deducts what is dated inside it and nothing else, so a
// repayment in September cannot move a number on a fortnight somebody was paid from in
// August. See advanceAccount in js/model/schema.js for the arithmetic that rests on it.
function recordAdvanceRepaid(schedule, advanceId, amount, date, note, at, by, method) {
    return appendLedgerEntry(schedule, {
        advanceId: String(advanceId),
        kind: 'repaid',
        date: String(date),
        amount: Number(amount) || 0,
        note: String(note || ''),
        method: typeof method === 'string' && method ? method : undefined,
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
    ['workerId', 'date', 'note', 'method'].forEach(field => {
        if (changes && changes[field] !== undefined) entry[field] = String(changes[field]);
    });
    if (changes && changes.amount !== undefined) entry.amount = Number(changes.amount) || 0;
    return appendLedgerEntry(schedule, entry);
}

// A MISTAKE, COMPENSATED - never removed.
//
// The kind below this one, 'cancelled', drops the advance out of the fold entirely. That
// is a deletion wearing another word, and it is the one thing an append-only ledger
// exists to refuse: the row a person is looking for when they ask "what happened here"
// is the row that stopped being true, and a fold that hides it answers a different
// question than the one asked.
//
// So a correction is its own entry, of the opposite sign, and both lines stay on the
// screen. The reason is MANDATORY - an unexplained adjustment to money is the thing this
// whole file was written against - and the amount is bounded by what was given, because
// a reversal larger than its advance is not a correction, it is a second transaction
// nobody described.
function recordAdvanceReversed(schedule, advanceId, amount, date, reason, at, by) {
    return appendLedgerEntry(schedule, {
        advanceId: String(advanceId),
        kind: 'reversed',
        date: String(date),
        amount: Number(amount) || 0,
        reason: String(reason || ''),
        at: String(at || ''),
        by: String(by || '')
    });
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
            method: typeof item.method === 'string' && item.method ? item.method : undefined,
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
// The four maps this build knows are append-only. Every one of them is a record of
// something that happened, and nothing in this app removes an entry from any of them.
const LEDGER_FAMILIES = ['advances', 'migrations', 'unreadable', 'unreadableMigrations'];

// hasOwnProperty.call, never a bare lookup. `map[id]` answers truthy for an id of
// `toString` on an empty map, and toString is a legal id - so the bare form silently
// dropped entries that were named after something on the prototype chain.
function ownsKey(object, key) {
    return Object.prototype.hasOwnProperty.call(object || {}, key);
}

// AND NEVER A BARE ASSIGNMENT EITHER.
//
// `map[id] = value` for an id of `__proto__` creates no own property: it writes the
// prototype. So the one map whose job is to keep what could not be read - ledger.unreadable
// - lost its evidence on the next merge AND came back reparented, with `unreadable.amount`
// reading a number nobody put there, while the device reported synced.
//
// defineProperty creates the own property whatever the name is. The descriptor is the one
// an ordinary assignment would have produced, so nothing else about the map changes.
function putKey(object, key, value) {
    Object.defineProperty(object, key, {
        value, writable: true, enumerable: true, configurable: true
    });
}

// Two bodies compared as bodies, not as objects. Local, because js/sync/sync.js loads
// after this file and borrowing canonicalJson across that seam works right up until
// somebody reorders index.html.
function sameLedgerBytes(one, two) {
    const stable = value => {
        if (value === null || typeof value !== 'object') return JSON.stringify(value);
        if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
        return '{' + Object.keys(value).sort()
            .map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
    };
    return stable(one) === stable(two);
}

// `conflicts`, when given, collects every id whose two sides disagree. The caller reports
// them and holds; this function never resolves one, because there is no honest rule that
// could.
function mergeLedgerInto(target, source, conflicts) {
    if (!target || !source) return target;
    const mine = (source && source.ledger) || {};
    if (!mine || typeof mine !== 'object' || Array.isArray(mine)) return target;

    target.ledger = target.ledger || { advances: {} };

    // EVERY PART OF THE CONTAINER, not the one map this used to copy.
    //
    // `target` is the ARRIVING document and `source` is this phone - the comment here
    // used to say the opposite, which is how the direction went unnoticed. So everything
    // this phone held and the snapshot did not was discarded with the object it lived on,
    // and State.persist() then wrote that over the disk: a person's approval of the money
    // migration, the entries this build had held aside, the approvals it had held aside,
    // and any part of the container a later build adds. All four erased by a phone that
    // had simply never heard of them, with the status reporting synced.
    Object.keys(mine).forEach(key => {
        const held = mine[key];
        const isFamily = LEDGER_FAMILIES.indexOf(key) !== -1
            && held && typeof held === 'object' && !Array.isArray(held);
        if (isFamily) {
            if (!target.ledger[key] || typeof target.ledger[key] !== 'object'
                || Array.isArray(target.ledger[key])) {
                target.ledger[key] = {};
            }
            Object.keys(held).forEach(id => {
                if (!ownsKey(target.ledger[key], id)) {
                    putKey(target.ledger[key], id, held[id]);
                    return;
                }
                if (sameLedgerBytes(target.ledger[key][id], held[id])) return;
                // ONE ID, TWO BODIES. An entry is written once and never edited, so this
                // is not a merge - it is a disagreement about what happened to somebody's
                // money, and picking the copy that happened to arrive is picking at
                // random. Both are kept and a person is asked.
                if (conflicts) {
                    conflicts.push({ family: key, id: String(id),
                        mine: held[id], theirs: target.ledger[key][id] });
                }
            });
            return;
        }
        // A part of the container this build has no opinion about. Carried when the
        // snapshot lacks it; never overwritten when it has it; and a difference is the
        // same disagreement as above rather than a silent choice.
        if (!ownsKey(target.ledger, key)) { target.ledger[key] = held; return; }
        if (sameLedgerBytes(target.ledger[key], held)) return;
        if (conflicts) {
            conflicts.push({ family: null, id: String(key),
                mine: held, theirs: target.ledger[key] });
        }
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
