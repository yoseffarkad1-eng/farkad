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
//
// ON THIS BRANCH IT IS TRUE, and this branch is not main and has not been merged.
// claude/farkad-ledger-enable-ready exists so that the build somebody eventually ships
// can be run end to end before anybody commits to it - see the commit that flipped it.
// Merging this is the decision iron law 1 reserves for a person, and it is only theirs to
// make once all three phones are known to be past v79.
const LEDGER_WRITES = true;

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

// ---------------------------------------------------------------- what is still owed
//
// THE ONE ANSWER. Every surface that prints a number for one advance reads this and
// nothing else: the worker screen, the repayment form, the payroll row, the ledger
// overview, the exports, the printed sheet and the WhatsApp message.
//
// It exists because there were two answers and they disagreed. The screen computed
// `given - repaid` - cash in, cash back - and stopped there. Three kinds of entry reduce
// what a man owes and only one of them was counted:
//
//   repaid    cash handed back
//   reversed  an advance recorded in error and compensated; the money never left the tin
//   deducted  money that came off his WAGE when a period closed
//
// So a 500 advance with 400 already taken off his pay showed "חוב פתוח 500", the
// repayment form offered a ceiling of 500, and a man could hand back 500 in cash against
// a debt of 100. That is not a rounding disagreement between two screens; it is the app
// collecting money twice.
//
// `left` never goes below zero and `overpaid` carries the remainder instead. A negative
// debt read as a number would be ADDED to his next wage as though the firm owed him for
// it, which is a decision this app may not reach on its own - see the overpayment block
// below.
function advanceOutstanding(schedule, advanceId) {
    const id = String(advanceId);
    // FEATURE-DETECTED, and it is not ceremony. This is on the render path of the worker
    // screen, and that screen has to open on a build where the ledger file is not loaded
    // at all - a half-fetched install, a file taken out to bisect something. Without the
    // reader the honest answer is what the OLD field says and nothing settled against it,
    // which is exactly what a build with no ledger knows. Caught by tests/smoke.mjs,
    // which nulls the reader and asks the modal to open anyway.
    const readable = typeof foldLedger === 'function'
        && typeof advanceHistory === 'function';
    const folded = readable ? foldLedger(schedule)[id] : null;
    const legacy = ((schedule && schedule.advances) || {})[id];
    // The ledger's answer where there is one; the old field otherwise, because until all
    // three phones are past v79 it is the only place an advance recorded this evening on
    // another phone exists at all.
    const given = folded ? Number(folded.amount) || 0
        : Number((legacy || {}).amount) || 0;

    const events = readable ? advanceHistory(schedule, id) : [];
    let repaid = 0;
    let reversed = 0;
    let deducted = 0;
    // WHAT EACH REVERSAL UNDOES, kept apart by the KIND of the event it corrects.
    //
    // A reversal used to net one way for everything: it reduced what the man owed, always.
    // That is right for a wrongly recorded ADVANCE - he never got the money - and it is
    // exactly backwards for a wrongly recorded REPAYMENT. If the cash he was said to have
    // handed back never arrived, his debt goes UP, not down; netting it the other way
    // credited him twice for money that was never there.
    let undoneGiven = 0;
    let undoneRepaid = 0;
    let undoneDeducted = 0;
    const byId = {};
    events.forEach(entry => { byId[String(entry.id)] = entry; });
    events.forEach(entry => {
        const sum = Number(entry.amount) || 0;
        if (entry.kind === 'repaid') repaid += sum;
        else if (entry.kind === 'deducted') deducted += sum;
        else if (entry.kind === 'reversed') {
            reversed += sum;
            // A reversal written before this build carries no target. It meant "this
            // advance was recorded in error", because that is the only thing it could
            // mean, and it goes on meaning it.
            const target = entry.targetId ? byId[String(entry.targetId)] : null;
            const kind = target ? String(target.kind) : 'given';
            if (kind === 'repaid') undoneRepaid += sum;
            else if (kind === 'deducted') undoneDeducted += sum;
            else undoneGiven += sum;
        }
    });

    const effectiveGiven = agoraRound(given - undoneGiven);
    const effectiveRepaid = agoraRound(repaid - undoneRepaid);
    const effectiveDeducted = agoraRound(deducted - undoneDeducted);
    const settled = agoraRound(effectiveRepaid + effectiveDeducted);
    return {
        id,
        // What was handed over, less anything a correction says was never handed over.
        given: effectiveGiven,
        // Cash back and wage deductions, each less the corrections against them.
        repaid: effectiveRepaid,
        reversed: agoraRound(reversed),
        deducted: effectiveDeducted,
        // The gross figures, before any correction - what the history actually says
        // happened, which a statement has to be able to print beside the corrections.
        givenGross: agoraRound(given),
        repaidGross: agoraRound(repaid),
        deductedGross: agoraRound(deducted),
        settled,
        left: agoraRound(Math.max(0, effectiveGiven - settled)),
        // More has come off this advance than was ever put on it. Kept as its own number
        // rather than a negative `left`, so no screen can print it as a debt of the
        // opposite sign and no wage can be quietly increased by it.
        overpaid: agoraRound(Math.max(0, settled - effectiveGiven))
    };
}

// ------------------------------------------------ a closure, against accounting reality
//
// ledgerEntryProblems checks the SHAPE of a closure: a real date, a real amount, an end
// that is not before its beginning. Every one of those can hold while the entry is a lie.
//
//   a closure deducting 4,000 from an advance with 500 left on it
//   a closure deducting 3,000 from a fortnight the man earned 900 in
//   a closure whose balanceAfter says 400 when the record leaves 1,950
//   a closure over "2026-08-09 to 2026-08-31", which is not an account at all
//
// None of those is damage. Each is a well-formed entry that is not true, and every one of
// them arrives the same way: from another phone, from an import, from a restore. The
// amount and the balanceAfter are numbers somebody else computed, and this device has no
// reason to believe either of them - it has the record they were computed FROM.
//
// So they are checked against it. What cannot be true is held aside rather than folded -
// see normaliseSchedule, which is where every door meets.

// What an advance stands at, ignoring ONE entry - which is how a closure is judged
// against the debt as it was before that closure.
// WHAT AN ADVANCE STOOD AT, as of a given day, ignoring ONE entry.
//
// Both halves matter and the second one was learned the hard way. Ignoring the closure
// itself is obvious: a closure is judged against the debt as it was BEFORE it. The date
// is the half that is not obvious, and without it the check was wrong in a way that only
// showed up under a race.
//
// A closure freezes a figure. Entries dated AFTER the period it closed go on arriving -
// a repayment from a phone that was offline, an import - and they move the LIVE balance,
// never the frozen one; that is the whole two-balance design in advanceWalk. Judging a
// closure's balanceAfter against everything on the record therefore condemned a perfectly
// honest closure the moment a later repayment landed: the arithmetic it was written from
// no longer existed. Measured with two phones, one closing while the other recorded cash.
function outstandingWithout(schedule, advanceId, ignoreId, onOrBefore, recordedBy) {
    const copy = { advances: (schedule && schedule.advances) || {},
        ledger: { advances: {} } };
    const held = (schedule && schedule.ledger && schedule.ledger.advances) || {};
    Object.keys(held).forEach(id => {
        if (String(id) === String(ignoreId)) return;
        const entry = held[id];
        // The origin always counts: it is what the advance IS, not something that happened
        // to it, and a 'given' carries the advance's own date rather than an event's.
        if (onOrBefore && entry && String(entry.kind) !== 'given'
            && String(entry.date || '') > String(onOrBefore)) return;
        // AND RECORDED BEFORE. Two dates matter and they are different questions: `date`
        // is the day money moved, `at` is the moment somebody wrote it down.
        //
        // A closure freezes the arithmetic as it stood when it was written. A repayment
        // dated INTO the fortnight but recorded after it closed is an ordinary event -
        // advanceWalk carries it into the next period and names it lateSinceClose - and
        // judging the closure against it made a true closure look like a lie, held it
        // aside on every device, and put the phone that wrote it into recovery.
        //
        // Both conditions, not either: dropping the date test would let a phone justify
        // any figure by dating its own repayment after the period, and dropping this one
        // is the bug above. An entry with no `at` at all is counted - it predates the
        // stamp and there is nothing to order it by.
        if (recordedBy && entry && String(entry.kind) !== 'given'
            && String(entry.at || '') !== ''
            && String(entry.at) > String(recordedBy)) return;
        copy.ledger.advances[id] = entry;
    });
    return advanceOutstanding(copy, advanceId);
}

function closureProblems(schedule, entry) {
    const out = [];
    if (!entry || String(entry.kind) !== 'deducted') return out;

    // THE PERIOD HAS TO BE AN ACCOUNT. A closure over a hand-picked window freezes a
    // figure for a fortnight nobody is paid on, and every later read of that period
    // reports the record rather than doing the sum - so a wrong window is wrong forever.
    const from = String(entry.periodFrom);
    const to = String(entry.periodTo);
    const start = parseLocalDate(from);
    if (!start || toLocalDateStr(accountStart(start)) !== from) {
        out.push('a closure over a period that does not start an account');
    } else if (advanceDayStep(from, 13) !== to) {
        out.push('a closure whose last day is not its own account\'s');
    }

    const off = Number(entry.amount) || 0;
    const before = outstandingWithout(schedule, entry.advanceId, entry.id, to, entry.at);

    // MORE THAN WAS OWED. The man is recorded as having had money taken off his wage
    // against a debt that was not there.
    if (off > before.left + 1e-6) {
        out.push('a closure deducting more than the advance had left on it');
    }

    // MORE THAN HE EARNED. A deduction is money coming off a wage; it cannot exceed the
    // wage, and it cannot leave one below zero - a man does not owe his employer his
    // labour back.
    //
    // JUDGED AGAINST THE WAGE THE CLOSURE ITSELF RECORDS, not against the wage the
    // schedule prices today. This asked payrollReport every time, so removing one
    // historical day from a fortnight that had been closed correctly made this report
    // "a closure deducting more than the wage it came off" and put the entry into
    // impossibleClosures - the list a person is shown when they ask whether their books
    // are sound. A closure that was exactly right when it was written was accused because
    // the schedule moved underneath it.
    //
    // A closure that records NO wage is judged against the live one, because that is the
    // only evidence there is - and it is the case that matters most. A closure claiming
    // 4,000 off a wage of 3,050 arriving from another phone carries no recorded wage
    // either, and holding it aside at the door is what stops a number this device never
    // computed being frozen onto somebody's pay. Dropping the check for want of a
    // snapshot would open exactly the hole L5 closed.
    //
    // So the live wage is a fallback, not the rule: from this build on, every closure
    // this app writes carries the wage it was closed on, and is judged against that. The
    // drift - a day corrected off a paid fortnight turning an honest closure into an
    // accusation - is fixed for every closure written from here. For the older ones the
    // live wage is all anybody has, and protecting money on imperfect evidence beats
    // silence on none.
    const gross = entry.gross !== undefined && entry.gross !== null
        ? Number(entry.gross)
        : (function () {
            const advance = ((schedule && schedule.advances) || {})[String(entry.advanceId)];
            const who = String(entry.workerId || (advance || {}).workerId || '');
            const row = who && typeof payrollReport === 'function'
                ? payrollReport(schedule, from, to).find(item => item.workerId === who)
                : null;
            return row && row.amount !== null ? Number(row.amount) : null;
        }());
    if (gross !== null && off > gross + 1e-6) {
        out.push('a closure deducting more than the wage it came off');
    }
    if (gross !== null && agoraRound(gross - off) < 0) {
        out.push('a closure leaving a wage below zero');
    }

    // AND THE CARRIED BALANCE HAS TO BE THE ARITHMETIC. It is the number the NEXT period
    // opens on and the number a man was told he still owed; taken on trust from whoever
    // sent it, one wrong figure propagates to every later account.
    if (entry.balanceAfter !== undefined) {
        const expected = agoraRound(Math.max(0, before.left - off));
        if (Math.abs((Number(entry.balanceAfter) || 0) - expected) > 1e-6) {
            out.push('a closure whose carried balance is not what the record leaves');
        }
    }
    return out;
}

// Every closure on this device that cannot be true, by entry id.
function impossibleClosures(schedule) {
    const held = (schedule && schedule.ledger && schedule.ledger.advances) || {};
    return Object.keys(held)
        .filter(id => held[id] && String(held[id].kind) === 'deducted')
        .filter(id => closureProblems(schedule, held[id]).length > 0)
        .sort();
}

// EVERY ADVANCE OF THIS MAN'S THAT HAS BEEN OVER-SETTLED, and it is not a rounding error.
//
// Two phones, one advance of 500, both offline. Each records a repayment of 500 against
// it. Both land - and both are RIGHT to land, because an append-only ledger that dropped
// one of them would be losing the record of money somebody actually handed over. The
// fold then says 1,000 settled against 500 given.
//
// What must not happen is the app deciding on its own what that means. It is one of at
// least three different real events - the same cash entered twice, two men paying for
// each other, or a genuine overpayment the firm owes back - and they are settled by
// asking, not by arithmetic. So both entries stay, the state is named on the screen, the
// automatic deduction stops until somebody looks, and the correction is a deliberate act
// with a reason attached.
// WHAT REFUSES A REVERSAL, before one is written.
//
// ledgerEntryProblems checks the SHAPE of an entry - it is handed one record and knows
// nothing about the advance behind it, so it cannot tell a reversal of 301 against an
// advance of 300 from a reversal of 301 against an advance of 5,000. Both are well-formed
// and one of them is money invented out of nothing. This is the other half, and it needs
// the schedule.
//
// English, like every other *Problems in the model: these are diagnostics, and the screen
// that refuses says so in Hebrew in its own words - see openReversalForm.
function reversalProblems(schedule, advanceId, amount, reason) {
    const out = [];
    const id = String(advanceId);
    const known = ((schedule && schedule.advances) || {})[id] || foldLedger(schedule)[id];
    if (!known) return ['a reversal of an advance that is not there'];

    const state = advanceOutstanding(schedule, id);
    const back = Number(amount);
    if (!Number.isFinite(back) || back <= 0) {
        out.push('a reversal of nothing, or of less than nothing');
    } else {
        const agorot = back * 100;
        if (Math.abs(agorot - Math.round(agorot)) > 1e-6) {
            out.push('a reversal finer than an agora');
        }
        // ALREADY REVERSED IS ALREADY GONE. A second reversal of the same advance strikes
        // the same money off twice, and after it the man is credited with a debt that was
        // never his. The ceiling is what is left UNREVERSED, so reversing 300 of a 300
        // leaves a ceiling of zero and the next attempt is refused rather than folded.
        const room = agoraRound(state.given - state.reversed);
        if (room <= 0) out.push('a second reversal of an advance already reversed in full');
        else if (back > room + 1e-6) out.push('a reversal larger than the advance it corrects');
    }

    if (typeof reason !== 'string' || reason.trim() === '') {
        out.push('a reversal with no reason');
    }
    return out;
}

// What is still open to reversal on this advance, for the form that offers a ceiling.
function reversalRoom(schedule, advanceId) {
    const state = advanceOutstanding(schedule, advanceId);
    return agoraRound(Math.max(0, state.given - state.reversed));
}

function overpaidAdvances(schedule, workerId) {
    const advances = (schedule && schedule.advances) || {};
    const folded = foldLedger(schedule);
    const ids = Object.keys(advances).concat(Object.keys(folded))
        .filter((id, at, all) => all.indexOf(id) === at);
    return ids
        .filter(id => {
            const of = folded[id] || advances[id];
            return Boolean(of) && String(of.workerId) === String(workerId);
        })
        .map(id => advanceOutstanding(schedule, id))
        .filter(state => state.overpaid > 0);
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
    // AND THE WHOLE PROPOSED ENTRY, READ BY THE READER THAT WILL HAVE TO READ IT BACK.
    //
    // ledgerEntryProblems is what every door applies to an entry ARRIVING - the disk, a
    // snapshot, a backup, the rescue import - and nothing applied it on the way OUT. So a
    // recorder could write an entry this build's own reader refuses, and did: a correction
    // saved with an empty date went into the record as `{"date":""}`, was held aside as
    // unreadable at the next boot, and blocked the phone - with the money it was undoing
    // still gone and the person who pressed Save the cause of it.
    //
    // Judged with the id that is actually going to be used, so the path-and-body rule is
    // the same one the reader will ask. `null` back means no change, no memory mutation,
    // no disk write and no queued operation, which is what State.commit reads as a
    // refusal - and it is the same answer an unsafe id already gets above.
    if (ledgerEntryProblems(id, record).length > 0) return null;
    schedule.ledger = schedule.ledger || { advances: {} };
    schedule.ledger.advances = schedule.ledger.advances || {};
    schedule.ledger.advances[id] = record;
    return { path: ledgerPath(id), value: record };
}

// THE NAME OF AN ADVANCE'S ORIGIN, derived from the advance and from nothing else.
//
// Two phones holding the same advance must mint the SAME entry id or the union keeps both
// and the record says a man was handed the money twice. The migration has always done this
// - `le_mig_a_x` - and CREATION now has to agree with it, because the two write the same
// fact and either can happen first: this phone creates the advance and writes the origin,
// that phone receives the advance through the field every build reads and migrates it.
// One id, one entry, whichever arrives.
//
// The prefix still says `mig`, which is now half a lie, and it stays: every origin already
// written on every phone carries it, and a new scheme would orphan all of them into
// duplicates - which is the exact failure this function exists to prevent.
function originEntryId(advanceId) {
    return 'le_mig_' + String(advanceId);
}

// Whether this advance has an origin the fold can stand on.
//
// Not "has an entry". A 'given' the validator refuses is not an origin - it is a line
// nobody can price - and treating it as one is how an advance ends up with a repayment
// against money no record says was handed over.
function advanceHasOrigin(schedule, advanceId) {
    return advanceHistory(schedule, advanceId).some(entry =>
        String(entry.kind) === 'given'
        && ledgerEntryProblems(String(entry.id), entry).length === 0);
}

// Every advance on this device carrying events but no origin, named rather than repaired.
//
// Nothing is invented here. An advance whose only entry is a repayment is a real question
// about real money - somebody handed some back against something - and the answer is a
// person's, not an average. This is what lets a screen ask it.
function advancesWithoutOrigin(schedule) {
    const legacy = (schedule && schedule.advances) || {};
    const seen = {};
    ledgerEntries(schedule).forEach(entry => { seen[String(entry.advanceId)] = true; });
    return Object.keys(seen)
        .filter(id => legacy[id] !== undefined || foldLedger(schedule)[id] !== undefined
            || seen[id])
        .filter(id => !advanceHasOrigin(schedule, id))
        .sort();
}

// CREATING AN ADVANCE: the record every phone reads, and the origin it will be folded
// from, as ONE logical operation.
//
// openAdvanceForm called addAdvance and nothing else, and recordAdvanceGiven had no caller
// anywhere in the app. So an advance made today lived only in schedule.advances - which is
// correct and is not enough - and the ledger learned about it at the next boot, from the
// migration, if it ever ran.
//
// It did not stay invisible until then. A repayment recorded in the same session wrote a
// 'repaid' entry standing on nothing: foldAdvance builds its state from the 'given' and
// ignores everything that arrives before one, so the fold answered undefined for the whole
// advance. And the migration then looked at that repayment, saw an entry with this
// advance's id, and concluded the advance was already migrated - so the origin was never
// written by the one mechanism that exists to write it.
//
// The two changes go back as a list on purpose. The caller commits them with commitMany,
// which is all-or-nothing: a disk that takes one and refuses the other would leave either
// an advance no fold can price, or an origin for money no phone reads.
//
// With the writer gate shut this returns the legacy change alone - which is exactly what
// the build has always done, and what a phone that cannot read entries needs.
function recordNewAdvance(schedule, workerId, date, amount, note, at, by, method) {
    const change = addAdvance(schedule, workerId, date, amount, note);
    if (typeof method === 'string' && method) change.value.method = method;
    if (!ledgerWritesEnabled()) return [change];
    return [change, appendLedgerEntry(schedule, {
        id: originEntryId(change.value.id),
        advanceId: String(change.value.id),
        kind: 'given',
        workerId: String(workerId),
        date: String(date),
        amount: Number(amount) || 0,
        note: String(note || ''),
        method: typeof method === 'string' && method ? method : undefined,
        at: String(at || ''),
        by: String(by || '')
    })];
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
//
// ITS IDENTITY IS THE THING IT CLOSES, not a random id and not the moment somebody
// pressed a button. `le_close_<advanceId>_<periodFrom>` and nothing else.
//
// That is the whole of the double-close defence, and it is the only one that works across
// three phones with no coordination. Measured before this: two phones each closed the
// same account, each wrote a closure of 100 with a balanceAfter of 400, the union kept
// both entries because their random ids differed, and closedPeriods added them up - 200
// off his wage and a carried balance of 800, from one closure pressed twice. With the id
// derived from the period, the second write lands on the SAME field path with the same
// money in it, so the union holds one entry and the fold reads one closure.
//
// The two entries would still differ in `at` and `by` - the device and the moment - and
// last-write-wins on those is the right answer: they say who recorded it, not what came
// off. Every figure a person is paid from is a function of the period, not of the device.
function closureId(advanceId, periodFrom) {
    return `le_close_${String(advanceId)}_${String(periodFrom).replace(/-/g, '')}`;
}

// Whether this exact account has already been closed against this exact advance.
function periodClosureFor(schedule, advanceId, periodFrom) {
    const held = (schedule && schedule.ledger && schedule.ledger.advances) || {};
    return held[closureId(advanceId, periodFrom)] || null;
}

// EVERY FACT THE PAYSLIP WAS MADE OF, worked out once, at the moment of closing.
//
// A closure used to record what came off the wage and the balance it left, and nothing
// else - so the wage itself, and therefore the net, were worked out again from the live
// schedule on every later read. A day corrected off a fortnight that had been paid, a
// rate fixed, an import from a phone that was in a tunnel: any of them rewrote a payslip
// somebody had already been handed. Measured before this: removing one historical day
// moved a closed row from 3,050/-3,050/0 to 2,440/-3,050/-610, a row that does not add
// up, on the sheet the crew is paid from.
//
// The basis travels too - the rate and the days it was priced at - because a payslip that
// cannot say how it reached its own number is a number without a reason.
function closureFacts(schedule, workerId, from, to, carriedIn) {
    if (typeof advanceWalk !== 'function') return null;
    const walk = advanceWalk(schedule, workerId, from, to, carriedIn || 0);
    const row = typeof payrollReport === 'function'
        ? payrollReport(schedule, from, to).find(item => item.workerId === workerId)
        : null;
    const worker = ((schedule && schedule.workers) || [])
        .find(item => String(item.id) === String(workerId));
    return {
        gross: walk.gross,
        carriedIn: walk.carriedIn,
        given: walk.given,
        repaid: walk.repaid,
        reversed: walk.reversed,
        net: walk.net,
        // What it was priced at, so the number can be explained without the schedule.
        basis: {
            dailyRate: worker ? Number(worker.dailyRate) || 0 : 0,
            hourlyRate: worker ? Number(worker.hourlyRate) || 0 : 0,
            payUnits: row ? Number(row.payUnits) || 0 : 0,
            attendanceDays: row ? Number(row.attendanceDays) || 0 : 0,
            workerName: worker ? String(worker.name || '') : ''
        }
    };
}

function recordPeriodClosed(schedule, advanceId, workerId, from, to, amount, at, by,
    balanceAfter, facts) {
    // ALREADY CLOSED IS CLOSED. Returning null rather than a second write is what makes
    // the flow idempotent on ONE phone; the deterministic id above is what makes it
    // idempotent across three. A closed period is a record and iron law 1 says a record
    // is never rewritten, so this refuses rather than restating.
    if (periodClosureFor(schedule, advanceId, from)) return null;
    // Worked out HERE when the caller did not bring them, so a closure written by any
    // route carries them. A caller that has already walked the account passes its own
    // walk in rather than making this repeat it.
    const held = facts || closureFacts(schedule, workerId, from, to, undefined);
    return appendLedgerEntry(schedule, Object.assign({}, held && {
        gross: held.gross,
        carriedIn: held.carriedIn,
        given: held.given,
        repaid: held.repaid,
        reversed: held.reversed,
        net: held.net,
        basis: held.basis
    }, {
        id: closureId(advanceId, from),
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
    }));
}

// CLOSING AN ACCOUNT, spelled out before anything is written.
//
// One row per advance this close would touch, with what comes off it and what is left on
// it afterwards. Nothing is committed here - the same courtesy planRateStamping and
// planAdvanceCarry give, and for the same reason: this freezes a number a man is paid
// from, and a person should be able to read it first.
//
// The split is oldest advance first. A period's deduction is one number for the man and
// the ledger records it per advance, so it has to be apportioned somehow; oldest first is
// the order money is settled in everywhere else in this app, and it is the order the
// history reads in.
function planPeriodClosure(schedule, workerId, from, to) {
    const walk = advanceAccount(schedule, workerId, from, to);
    const reasons = [];
    if (walk.closed) reasons.push('closed');
    if (walk.review) reasons.push('overpaid');
    if (walk.gross === null) reasons.push('unpriced');

    const advances = (schedule && schedule.advances) || {};
    const folded = foldLedger(schedule);
    const ids = Object.keys(advances).concat(Object.keys(folded))
        .filter((id, at, all) => all.indexOf(id) === at)
        .filter(id => {
            const of = folded[id] || advances[id];
            return Boolean(of) && String(of.workerId) === String(workerId);
        })
        .map(id => ({ id, state: advanceOutstanding(schedule, id),
            date: String((folded[id] || advances[id]).date || '') }))
        .filter(row => row.state.left > 0)
        .sort((a, b) => (a.date < b.date ? -1 : (a.date > b.date ? 1 : (a.id < b.id ? -1 : 1))));

    let room = walk.deducted;
    const rows = [];
    ids.forEach(row => {
        if (room <= 0) return;
        const off = agoraRound(Math.min(room, row.state.left));
        if (off <= 0) return;
        room = agoraRound(room - off);
        rows.push({
            advanceId: row.id,
            amount: off,
            balanceAfter: agoraRound(row.state.left - off),
            alreadyClosed: Boolean(periodClosureFor(schedule, row.id, from))
        });
    });

    return { from, to, workerId, deducted: walk.deducted, gross: walk.gross,
        carriedForward: walk.carriedForward, rows, reasons,
        canClose: reasons.length === 0 && rows.length > 0 };
}

// The changes that close it. An empty list means nothing to do - which is what a second
// press must produce, and what a second PHONE must produce once the first has landed.
function closePeriodChanges(schedule, workerId, from, to, at, by) {
    const plan = planPeriodClosure(schedule, workerId, from, to);
    if (!plan.canClose) return [];
    return plan.rows
        .filter(row => !row.alreadyClosed)
        .map(row => recordPeriodClosed(schedule, row.advanceId, workerId, from, to,
            row.amount, at, by, row.balanceAfter))
        .filter(Boolean);
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
            // THE ACCOUNT-LEVEL FACTS, which are per PERIOD and not per advance.
            //
            // deducted and balanceAfter are summed above because one close can touch
            // several advances and each writes its own entry. The wage is not like that:
            // every entry from one close records the SAME fortnight's gross, so summing
            // would multiply a man's wage by the number of advances he happened to hold.
            // Taken from the first entry that carries them, and left undefined when none
            // does - a closure written before closures recorded their wage has nothing
            // here, and the walk falls back to the live figure rather than inventing one.
            if (at.gross === undefined && entry.gross !== undefined && entry.gross !== null) {
                at.gross = Number(entry.gross);
            }
            if (at.carriedIn === undefined && entry.carriedIn !== undefined) {
                at.carriedIn = Number(entry.carriedIn) || 0;
            }
            if (at.basis === undefined && entry.basis !== undefined) at.basis = entry.basis;
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
// THE DATE IS DERIVED, AND EVERY RULE IS ASKED HERE.
//
// `date` is still in the signature - every caller passes the advance's own day, which is
// what it now becomes - and it is no longer what gets written. The entry says this advance
// was never handed over, so it belongs in the account the advance is in; a date carried in
// from a form was a fortnight somebody could type, and this function wrote whatever it was
// handed. So did the amount and the reason: reversalProblems existed and only the form
// consulted it, which makes it a document rather than a guard.
function recordAdvanceReversed(schedule, advanceId, amount, date, reason, at, by) {
    const advance = ((schedule && schedule.advances) || {});
    const known = ownsKey(advance, String(advanceId))
        ? advance[String(advanceId)]
        : foldLedger(schedule)[String(advanceId)];
    if (!known || !isRealDate(String(known.date))) return null;
    if (reversalProblems(schedule, advanceId, amount, reason).length > 0) return null;
    const record = {
        advanceId: String(advanceId),
        kind: 'reversed',
        // The advance's own day. Not the caller's.
        date: String(known.date),
        amount: Number(amount) || 0,
        reason: String(reason || ''),
        at: String(at || ''),
        by: String(by || '')
    };
    return appendLedgerEntry(schedule, record);
}

// ------------------------------------------------ correcting ONE transaction, by its id
//
// recordAdvanceReversed targets the ADVANCE. That is the right shape for the thing it was
// written for - an advance recorded by mistake - and it is the wrong shape for everything
// else, because it cannot name WHICH event was wrong. A cash repayment entered twice, a
// repayment for the wrong amount, a closure taken against the wrong fortnight: all real,
// all common, and none of them expressible as "reverse the advance".
//
// So a correction names an immutable transaction id, and its financial sign follows the
// kind of the event it corrects:
//
//   a wrongly recorded ADVANCE     the man never got the money      debt goes DOWN
//   a wrongly recorded REPAYMENT   the cash never came back         debt goes UP
//   a wrongly recorded DEDUCTION   it never came off his wage       debt goes UP
//
// Reversing a repayment with the old shape reduced the debt, which credited him twice for
// money that was never there. See the fold in advanceOutstanding.

// One correction per event, named after the event. Two phones correcting the same mistake
// write the same field path, so the union keeps one - a correction applied twice is money
// moved twice.
function eventReversalId(targetId) {
    return 'le_rev_' + String(targetId);
}

// The entry this correction is against, or null.
function reversalTarget(schedule, targetId) {
    const held = (schedule && schedule.ledger && schedule.ledger.advances) || {};
    // OWNED. A bare lookup answers from the prototype, and this is the function that
    // decides whether there is a transaction to correct at all.
    return ownsKey(held, String(targetId)) ? (held[String(targetId)] || null) : null;
}

// WHAT REFUSES A CORRECTION, before one is written.
//
// English, like every other *Problems in the model - the screen says it in Hebrew in its
// own words.
function eventReversalProblems(schedule, targetId, amount, reason) {
    const out = [];
    const target = reversalTarget(schedule, targetId);
    if (!target) return ['a correction of a transaction that is not there'];
    if (ledgerEntryProblems(String(target.id), target).length > 0) {
        return ['a correction of a transaction nobody can read'];
    }
    // A CORRECTION OF A CORRECTION is not a correction; it is a second story about the
    // same money, and there is no arithmetic that makes it one number.
    if (String(target.kind) === 'reversed') {
        return ['a correction of a correction'];
    }
    if (['given', 'repaid', 'deducted'].indexOf(String(target.kind)) === -1) {
        return ['a correction of a kind of entry that carries no money'];
    }
    // AND IT HAS TO HAVE A DAY. The correction is dated on the transaction, so a
    // transaction with no readable date leaves nowhere to put it - and inventing one puts
    // money in a fortnight nobody chose.
    if (!isRealDate(String(target.date))) {
        return ['a correction of a transaction with no readable date'];
    }
    // ONCE. The same event cannot be corrected twice - after the second the record says
    // the money moved in a direction nobody chose.
    if (reversalTarget(schedule, eventReversalId(targetId))) {
        return ['a second correction of a transaction already corrected'];
    }

    const back = Number(amount);
    const held = Number(target.amount) || 0;
    if (!Number.isFinite(back) || back <= 0) {
        out.push('a correction of nothing, or of less than nothing');
    } else {
        const agorot = back * 100;
        if (Math.abs(agorot - Math.round(agorot)) > 1e-6) {
            out.push('a correction finer than an agora');
        }
        // ALL OF IT, OR NONE OF IT.
        //
        // This refused only a correction LARGER than its target, so 100 against a 400
        // repayment was accepted and the record then said that 300 of that repayment
        // still happened. It did not: this model has no event for part of a payment - the
        // man handed over 400 or he did not - and the difference is not recoverable
        // afterwards, because the correction's id is derived from the target and the
        // second attempt is refused as a second correction of a transaction already
        // corrected. A partial strands money where no button in this app can reach it.
        //
        // Compared in agorot, against the target's own agorot, so a rate that produced
        // 412.50 is matched exactly and no binary-float slack is left for 412.4999 to
        // slip through. eventReversalRoom has always said this in words.
        if (Math.round(agorot) !== Math.round(held * 100)) {
            out.push('a correction of part of a transaction, which strands the rest');
        }
    }
    if (typeof reason !== 'string' || reason.trim() === '') {
        out.push('a correction with no reason');
    }
    return out;
}

// How much of this transaction is still open to correction: all of it, or none.
function eventReversalRoom(schedule, targetId) {
    const target = reversalTarget(schedule, targetId);
    if (!target) return 0;
    if (reversalTarget(schedule, eventReversalId(targetId))) return 0;
    return agoraRound(Number(target.amount) || 0);
}

function recordEventReversed(schedule, targetId, amount, date, reason, at, by) {
    const target = reversalTarget(schedule, targetId);
    if (!target) return null;
    // Already corrected. Returning null rather than a second write is what makes the flow
    // idempotent on ONE phone; the deterministic id is what makes it idempotent across
    // three.
    if (reversalTarget(schedule, eventReversalId(targetId))) return null;
    // AND EVERY OTHER RULE, ASKED HERE, because here is where the writing happens.
    //
    // This function used to check only the two conditions above and then write whatever
    // amount it was handed. Every rule about what a correction may be - the whole amount,
    // an agora at worst, a reason, a target that carries money and is not itself a
    // correction - lived in a validator that only the form consulted. A validator the
    // writer does not call is a document, not a guard: any other caller, now or later,
    // wrote past all of it. Refused before memory, disk or outbox move.
    if (eventReversalProblems(schedule, targetId, amount, reason).length > 0) return null;
    return appendLedgerEntry(schedule, {
        id: eventReversalId(targetId),
        advanceId: String(target.advanceId),
        kind: 'reversed',
        // The immutable transaction this corrects, and what that transaction WAS - kept
        // on the entry so a fold never has to guess at the sign, and so a statement can
        // say which line stopped being true.
        targetId: String(targetId),
        targetKind: String(target.kind),
        // AND WHAT THE CORRECTED TRANSACTION WAS, on the correction itself.
        //
        // targetId and targetKind say which entry and what sort; they do not say what it
        // WAS. A manager reading "תיקון-היפוך 500" had to go and find the entry it names
        // before they could tell whether the correction was right - on a statement, in a
        // workbook or in a backup, where the other entry may not be beside it at all.
        // Copied rather than looked up because the entry is immutable and this is the
        // record somebody answers for.
        targetDate: String(target.date || ''),
        targetAmount: Number(target.amount) || 0,
        // THE TRANSACTION'S OWN DAY, derived rather than carried. `date` stays in the
        // signature because every caller passes exactly this, and it is no longer what
        // decides: a correction dated anywhere else moves money between two fortnights to
        // undo something that happened in one of them, and a correction dated NOWHERE is
        // an entry this build's own reader refuses - held aside at the next boot, with
        // the money it was undoing still gone and the phone blocked.
        date: String(target.date),
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

// ---------------------------------------------- the carry migration, and who approves it
//
// WHY THERE IS A SCREEN FOR THIS AT ALL.
//
// planAdvanceCarry has always been able to say exactly which accounts and which men would
// move if the carry were switched on. Nothing called it. So the switch was a constant in a
// file, and flipping it would have restated fortnights that had already been printed and
// paid - silently, on every phone, at the next open.
//
// v88 wrote no closure records. That is the whole difficulty: this app cannot tell a
// fortnight that was settled and paid from one that merely has no closure entry, because
// before v89 nothing wrote one either way. It must not guess. So it does the only honest
// thing - it lays out every row that would move, with the number as it reads today beside
// the number it would read afterwards, and asks.
//
// The approval is a record, not a preference. It lives in the schedule, so it reaches the
// other two phones; its id is derived from the PLAN, so two phones that compute the same
// migration write the same field path and the union keeps one; and financial writing stays
// shut until it is there and matches.

// ONE NAME, FOR ONE DECISION.
//
// This was derived from the rows the migration would move, on the reasoning that a record
// which changed underneath should produce a different id and stop matching the old
// approval. That reasoning is wrong in the only way that matters: the rows move whenever
// anybody records a DAY, so an ordinary evening's work would have re-locked every
// financial control on all three phones, over and over, for a decision that had already
// been taken. Measured with one phone approving while the other recorded a day.
//
// What is being approved is not a snapshot of numbers. It is the answer to one question -
// does this record carry advances forward - and it is asked once. The rows are what the
// person reads before answering; the dialog re-reads them at the moment of the answer so
// nobody approves a screen they are no longer looking at.
function carryMigrationId() {
    return 'cm_carry';
}

// WHAT SWITCHING THE CARRY ON WOULD DO, per row, with both numbers side by side.
//
// `now` is what the sheet prints today; `after` is what it would print. `closureRecorded`
// says whether this period carries a closure entry - and it is reported rather than
// assumed, because a period with no entry is not a period that was never paid. That is
// exactly the thing this app cannot know and the person can.
function planCarryMigration(schedule) {
    const rows = (typeof planAdvanceCarry === 'function' ? planAdvanceCarry(schedule) : [])
        .map(row => Object.assign({}, row, {
            after: row.deducted,
            // REPORTED, NEVER ASSUMED. A period with no closure entry is not a period
            // that was never paid - v88 wrote no closure records at all, so absence says
            // nothing. This is exactly the fact the app cannot know and the person can.
            closureRecorded: Object.keys(closedPeriods(schedule, row.workerId) || {})
                .indexOf(String(row.from)) !== -1
        }));
    return { id: carryMigrationId(), rows, needed: rows.length > 0 };
}

function migrationPath(id) {
    return `ledger.migrations.${id}`;
}

// The approval itself. One field path, named for the plan it approves.
function recordCarryApproval(schedule, plan, at, by) {
    const record = {
        id: String(plan.id),
        kind: 'carry',
        rows: plan.rows.length,
        at: String(at || ''),
        by: String(by || '')
    };
    schedule.ledger = schedule.ledger || { advances: {} };
    schedule.ledger.migrations = schedule.ledger.migrations || {};
    // NEVER OVERWRITTEN. Two phones approving the same plan write the same path with the
    // same numbers in it; the second is the first, not a second approval. A phone that
    // approved it first keeps its own `at` and `by`, because that is who actually decided.
    //
    // OWNED, not merely reachable. A bare lookup answers from the prototype, so a name
    // nothing in the record owns reported "already approved" and this returned without
    // writing anything - the person presses the button, is told it is done, and no byte
    // anywhere says so.
    if (ownsKey(schedule.ledger.migrations, record.id)) {
        return { path: migrationPath(record.id),
            value: schedule.ledger.migrations[record.id], already: true };
    }
    schedule.ledger.migrations[record.id] = record;
    return { path: migrationPath(record.id), value: record };
}

function carryMigrationApproved(schedule, plan) {
    const held = (schedule && schedule.ledger && schedule.ledger.migrations) || {};
    // OWNED. This is the whole of the gate that decides whether three phones may write
    // money, and `held[id]` answers from the prototype - so a value nothing in the record
    // owns opened it.
    return ownsKey(held, String(plan.id)) && Boolean(held[String(plan.id)]);
}

// Nothing to restate, or somebody has approved restating it. Either is settled.
function carryMigrationSettled(schedule) {
    const plan = planCarryMigration(schedule);
    if (!plan.needed) return true;
    return carryMigrationApproved(schedule, plan);
}

// THE GATE EVERY FINANCIAL CONTROL ASKS, and the reason it is not just the two flags.
//
// The flags say what this BUILD does. This says whether this RECORD is ready for it: a
// device whose accounts would be restated by the carry has money on the line that nobody
// has looked at, and no button here may write against it until somebody has.
function financialWritingEnabled(schedule) {
    return ledgerWritesEnabled() && carryReportingEnabled(schedule);
}

// AND THE SAME QUESTION FOR EVERY SURFACE THAT MERELY READS.
//
// This is the half that was missing, and it was missing everywhere at once. Three callers
// asked advanceCarryEnabled() on its own - the payroll rows, the worker account behind
// the statement and the net line, and openAdvanceBalance behind the archive warning - so
// with the flag open and nobody having approved anything, the sheet, the WhatsApp message
// and the dialog that decides whether a man may be put away were all printing the
// post-migration arithmetic. The screen was still asking the question; every surface
// behind it had answered.
//
// A report is not a lesser thing than a write. Somebody is paid from the sheet.
//
// It does NOT include ledgerWritesEnabled: whether this build may APPEND to the ledger is
// a different question from whether the accounts on it may be READ the new way. A build
// with the writer shut and the carry open still has to show a record that another phone
// has already approved and written against, or the two phones print different money.
function carryReportingEnabled(schedule) {
    return advanceCarryEnabled() && carryMigrationSettled(schedule);
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

    // A VALID ORIGIN, not any entry at all.
    //
    // This read every entry's advanceId, whatever the entry was. An advance whose only
    // entry was a repayment therefore looked migrated: the migration skipped it, and the
    // origin the repayment was standing on was never written. An unreadable 'given' counts
    // for nothing here either - a line the validator refuses is not something a fold can
    // stand on, and letting it stop the migration would freeze the gap in place.
    const known = new Set(ledgerEntries(schedule)
        .filter(entry => String(entry.kind) === 'given'
            && ledgerEntryProblems(String(entry.id), entry).length === 0)
        .map(entry => String(entry.advanceId)));
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
            // writes the same id, and mergeLedgerInto collapses the copies into one.
            // Shared with recordNewAdvance, because the two write the same fact and
            // either can happen first - see originEntryId.
            id: originEntryId(id),
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

// WHO WROTE IT DOWN, AND WHEN. Everything else on a ledger record is the record.
const LEDGER_AUDIT_FIELDS = ['at', 'by'];

// ONE FACT, TWO SIGNERS.
//
// Some ids in this app are deterministic on purpose. `cm_carry` names one decision;
// `le_close_<advance>_<from>` names one closure; `le_rev_<target>` names one correction.
// That is what stops two phones writing two approvals of the same plan - and it means two
// phones legitimately write the SAME path with the same numbers and a different `at` and
// `by`, because two people pressed the button at two moments.
//
// Compared as whole bytes, that is one id with two bodies, which everywhere else in this
// file is a disagreement about money and is right to stop the device. Here it is not a
// disagreement at all: both phones recorded the same fact, and the only difference is
// whose hand and which second. The first writer's record stands - they did approve first -
// and the second is a no-op.
//
// The comparison is on the FINANCIAL fields, never on the id, so this can never be used
// to wave through two different amounts under one name: an approval of a different number
// of rows, a closure of a different sum, a correction of a different transaction all still
// differ here and are still held, quarantined and reported exactly as before.
function sameLedgerFact(one, two) {
    if (!one || typeof one !== 'object' || Array.isArray(one)) return false;
    if (!two || typeof two !== 'object' || Array.isArray(two)) return false;
    const facts = record => {
        const out = {};
        Object.keys(record).forEach(field => {
            if (LEDGER_AUDIT_FIELDS.indexOf(field) !== -1) return;
            out[field] = record[field];
        });
        return out;
    };
    return sameLedgerBytes(facts(one), facts(two));
}

// The same question asked of a WIRE PATH, for js/sync/sync.js - which must not learn what
// a ledger family is, and must be able to ask whether a refused write is a disagreement or
// a fact the server already holds.
//
// Only the two append-only maps whose ids are records, and only a leaf: a path naming a
// whole family, or a day, or a roster entry, is never superseded by this rule.
function ledgerPathSupersededBy(path, mine, theirs) {
    const parts = String(path).split('.');
    if (parts.length !== 3 || parts[0] !== 'ledger') return false;
    if (parts[1] !== 'advances' && parts[1] !== 'migrations') return false;
    return sameLedgerFact(mine, theirs);
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
                // ONE FACT, TWO SIGNERS: the arriving copy stands and nothing is asked.
                // Two phones approving the same plan, closing the same period or
                // correcting the same transaction write one deterministic id with the
                // same numbers and a different hand on it. `target` is the document that
                // got there first, so its copy is the record; keeping it is the whole
                // rule, and it is not a choice between two answers because there is only
                // one answer. See sameLedgerFact.
                if (sameLedgerFact(target.ledger[key][id], held[id])) return;
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
