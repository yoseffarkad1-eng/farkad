// ---------------------------------------------------------------- the server-first door
//
// A closure, a payment, a void: ONE transaction on the server, or nothing. (v175)
//
// WHY IT IS NOT THE QUEUE. Every other edit in this app is journalled, shown, and sent when
// there is signal - which is right for a day somebody worked, and wrong for a closure.
// Phase 2 measured the queue doing two things to one (docs/payroll-closure.md, «On the
// wire»): accepting it with no signal at all, so that a phone says «נסגר» about an account
// the other two phones have never heard of; and cutting it in two at the 296-path limit
// when a long queue is ahead of it, so that the deductions land and the payment does not.
// The owner's rule is the opposite of both: no financial closure is confirmed while
// offline, and a closure is whole.
//
// WHAT THIS FILE OWNS: sending one pay book operation as one transaction of its own -
// the schedule's field paths and the create-once closed document, together - and saying
// truthfully what became of it.
//
// WHAT IT MUST NEVER DO:
//   - queue. With no signal the answer is a refusal and nothing is kept to send later.
//   - say «נסגר» on a write it sent. Closed means: the transaction committed, the closed
//     document was read back from the server and is what was sent, the schedule the server
//     holds carries every path, and this phone's own record has adopted them.
//   - write a pay path into the journal or the outbox. What lands in this phone's record
//     arrives the way everybody else's work does: by adopting the server's document.
//   - send twice. The operation's name is its idempotency key; a retry finds its own
//     receipt, and an answer that was lost is settled by LOOKING, never by sending again.
//
// THE INTENT. Before anything leaves, the whole operation is written to this phone's disk
// under one key - its name, its exact bytes, the revision it was built on. It is not a
// queue: nothing ever sends it again. It is what lets a phone that was reloaded, or lost
// its signal between sending and hearing back, find out what happened instead of guessing:
//
//   the receipt is there        it committed. Read it back, adopt it, say so.
//   no receipt, document moved  it can never commit (its revision is spent). Nothing
//                               happened, and the person is told.
//   no receipt, document still  it MIGHT still be in flight. So the revision it was aimed
//   where it was                at is spent on purpose - one write that changes no
//                               business field - and then it can never commit either.
//
// While an intent is unresolved every further operation is refused (`pending`): two
// closures in doubt at once is two accounts nobody can answer for.

const PAY_INTENT_KEY = 'farkad:payIntent';
const PAY_OUTCOME_KEY = 'farkad:payOutcome';

// How many times one press is re-aimed after the document moved for a reason that has
// nothing to do with the account - somebody recording a day on another phone. Each time
// the fresh document is adopted and the plan is judged again against it first.
const PAY_REBASE_LIMIT = 3;

// Codes a failed transaction can carry that mean NOTHING WAS APPLIED, definitely: the
// server refused, or the request never got as far as its writes.
const PAY_DEFINITE_REFUSALS = ['permission-denied', 'not-found', 'failed-precondition',
    'invalid-argument', 'unauthenticated', 'out-of-range', 'no-closed-document', 'receipt-mismatch'];

Object.assign(FarkadSync, {
    _payBusy: false,

    // ------------------------------------------------------------ the intent on the disk
    payIntent() {
        let raw = null;
        try { raw = Store.durableGet(PAY_INTENT_KEY); } catch (error) { return { unreadable: true }; }
        if (raw === null || raw === undefined || raw === '') return null;
        try {
            const held = JSON.parse(raw);
            if (held && typeof held === 'object' && typeof held.id === 'string'
                && held.patch && typeof held.patch === 'object'
                && held.closed && typeof held.closed === 'object') return held;
        } catch (error) { /* falls through */ }
        // An intent that cannot be read is an operation nobody can name. It is not
        // deleted and it is not ignored: everything financial waits until a person has
        // been told (iron law 10), and the bytes stay where they are.
        return { unreadable: true };
    },

    storePayIntent(intent) {
        try { return Store.setVerified(PAY_INTENT_KEY, JSON.stringify(intent)) === true; }
        catch (error) { return false; }
    },

    clearPayIntent() {
        try { Store.remove(PAY_INTENT_KEY); } catch (error) { /* bytes, not truth */ }
        try { Store.forget(PAY_INTENT_KEY); } catch (error) { /* the same */ }
        try { return Store.durableGet(PAY_INTENT_KEY) === null; } catch (error) { return false; }
    },

    // What became of the last intent that had to be RESOLVED rather than answered - the
    // one a reload or a lost signal interrupted. Kept until a screen has shown it:
    // { id, kind, closedId, workerId, outcome: 'committed' | 'nothing', at }.
    payOutcome() {
        try {
            const raw = Store.durableGet(PAY_OUTCOME_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (error) { return null; }
    },

    acknowledgePayOutcome() {
        try { Store.remove(PAY_OUTCOME_KEY); } catch (error) { /* bytes, not truth */ }
        try { Store.forget(PAY_OUTCOME_KEY); } catch (error) { /* the same */ }
    },

    notePayOutcome(intent, outcome) {
        try {
            Store.setVerified(PAY_OUTCOME_KEY, JSON.stringify({ id: intent.id, kind: intent.kind,
                closedId: intent.closedId, workerId: intent.workerId, outcome,
                at: new Date().toISOString() }));
        } catch (error) { /* the outcome is also the return value of whoever asked */ }
    },

    // ------------------------------------------------------------ may anything be sent
    //
    // Null, or the one-word reason nothing can be: every one of them is a state in which
    // "the server has it" could not be said truthfully afterwards.
    //
    //   offline       no cloud, no signal, or the server's document has not been heard yet
    //   unsupported   the connected adapter has no transaction for this (an older one)
    //   restoring     a whole-document restore is outstanding; it goes first
    //   unsent-work   this phone holds edits the server does not. A closure priced from a
    //                 day the cloud has never seen freezes a wage two phones cannot agree
    //                 on; the queue drains first, and it is asked to now
    //   pending       an earlier operation's fate is not known yet - see resolvePayIntent
    //   busy          one is in flight in this window right now
    payTransactRefusal() {
        if (this._payBusy) return 'busy';
        const held = this.payIntent();
        if (held) return 'pending';
        if (!this.adapter) return 'offline';
        if (typeof this.adapter.transact !== 'function' || typeof this.adapter.readClosed !== 'function'
            || typeof this.adapter.read !== 'function') return 'unsupported';
        if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) return 'offline';
        if (!this._heardFromCloud || this._revision === null || this._baseDoc === null) return 'offline';
        if (this.replacementOutstanding()) return 'restoring';
        if (this.pendingCount() > 0 || this._sending.size > 0) {
            try { this.flush(); } catch (error) { /* the ladder will come round */ }
            return 'unsent-work';
        }
        return null;
    },

    // The envelope, stamped onto a copy. NOT stampProtocol: that freezes the queue's own
    // send base, and this write is not the queue's.
    payPayload(intent, revision) {
        const patch = JSON.parse(JSON.stringify(intent.entries));
        patch.closedId = intent.closedId;
        patch.updatedAt = intent.at;
        patch.updatedBy = syncDeviceId();
        patch.protocol = this.PROTOCOL;
        patch.lastOpId = intent.id;
        patch.opFingerprint = operationFingerprint('paybook', intent.entries, intent.closedId);
        patch.revision = revision;
        const closed = Object.assign(JSON.parse(JSON.stringify(intent.document)), {
            opId: intent.id, revision
        });
        return { patch, closed };
    },

    // ------------------------------------------------------------ the door
    //
    // transactPaybook(plan) -> Promise<{ ok, state, reasons, ... }>
    //
    //   state 'closed'    committed, read back, adopted. The only state that means done.
    //   state 'done'      the same fact was already on the server (another phone closed
    //                     this account with the same choices). Nothing was written.
    //   state 'refused'   nothing was sent, or the server refused it. `reasons` says why:
    //                     payTransactRefusal's word, or 'plan', 'storage', 'server'.
    //   state 'stale'     the account changed - somebody closed it, repaid, recorded a
    //                     day in it. The fresh document is adopted, nothing was written,
    //                     and `fresh` is the plan as it stands now (or its refusal).
    //   state 'unknown'   it was sent and the answer never came, and the server cannot
    //                     be reached to ask. The intent stays; resolvePayIntent settles
    //                     it at the next signal, and until then nothing else may be sent.
    transactPaybook(plan) {
        const refused = (state, reasons, extra) => Promise.resolve(Object.assign(
            { ok: false, state, reasons }, extra || {}));
        const operation = typeof paybookOperation === 'function' ? paybookOperation(plan) : null;
        if (!operation || !operation.ok) return refused('refused', ['plan']);
        const blocked = this.payTransactRefusal();
        if (blocked) return refused('refused', [blocked]);

        // The record as it is NOW, not as it was when the review page was drawn.
        const now = stillValid(State.schedule, plan);
        if (!now.ok) {
            return now.reasons.indexOf('done') !== -1
                ? Promise.resolve({ ok: true, state: 'done', reasons: [] })
                : refused('stale', now.reasons, { fresh: now.fresh || null });
        }

        const at = new Date().toISOString();
        const intent = {
            v: 1,
            // The name is the idempotency key: this device, this closed document, these
            // exact entries. A second phone closing the same account gets another name -
            // and loses the revision race instead of being answered from the first
            // phone's receipt for an operation that was not its own.
            id: 'pay' + digestOf([syncDeviceId(), operation.closedId,
                canonicalJson(operation.entries)].join('|')),
            kind: operation.kind,
            closedId: operation.closedId,
            workerId: operation.workerId,
            entries: operation.entries,
            document: paybookClosedDocument(operation, 'pending', 1),
            input: plan.input || null,
            planKind: plan.kind || null,
            base: this._revision,
            at
        };
        this._payBusy = true;
        const finish = answer => { this._payBusy = false; return answer; };
        return this.sendPayIntent(intent, plan, 0).then(finish, error => { this._payBusy = false; throw error; });
    },

    sendPayIntent(intent, plan, rebases) {
        const built = this.payPayload(intent, this._revision + 1);
        intent.base = this._revision;
        intent.patch = built.patch;
        intent.closed = built.closed;
        // DURABLE BEFORE IT LEAVES. An operation that is in flight and written down
        // nowhere is the one a reload turns into a guess.
        if (!this.storePayIntent(intent)) {
            this.clearPayIntent();
            return Promise.resolve({ ok: false, state: 'refused', reasons: ['storage'] });
        }
        const queuedBefore = this.pendingCount();
        return this.cloudWrite(() => this.adapter.transact(
            JSON.parse(JSON.stringify(built.patch)), [{ id: intent.closedId,
                data: JSON.parse(JSON.stringify(built.closed)) }]))
            .then(answer => this.confirmPayIntent(intent,
                answer && answer.replayed && Number.isInteger(answer.revision)
                    ? answer.revision : built.patch.revision))
            .then(result => {
                // NOTHING OF IT WENT NEAR THE QUEUE - checked, because the day somebody
                // routes an adoption through the journal this is the line that says so.
                if (this.pendingCount() !== queuedBefore) {
                    return Object.assign({}, result, { ok: false, state: 'unknown',
                        reasons: ['queued'] });
                }
                return result;
            }, error => this.failedPayIntent(intent, plan, rebases, error));
    },

    // Committed, says the server. Now make it true on this phone, and check.
    confirmPayIntent(intent, revision) {
        const want = Object.assign({}, intent.closed, { revision });
        return Promise.all([
            Promise.resolve(this.adapter.readClosed(intent.closedId)),
            Promise.resolve(this.adapter.read())
        ]).then(([closed, live]) => {
            const copyOk = closed && canonicalJson(closed) === canonicalJson(want);
            const liveOk = live && Object.keys(intent.entries).every(path =>
                canonicalJson(readPath(live, path)) === canonicalJson(intent.entries[path]));
            if (!copyOk || !liveOk) {
                // It committed and what the server holds is not what was sent. Nothing
                // here can repair that and nothing here may hide it: the intent stays, so
                // nothing further is sent on top of it, and the caller is told.
                return { ok: false, state: 'unknown', reasons: ['unverified'], revision,
                    closedId: intent.closedId };
            }
            // Adopted through the door every other phone's work comes through. The
            // snapshot for this revision may already have arrived; then this is a no-op.
            try { this.receive(live); } catch (error) { /* judged just below */ }
            const held = Object.keys(intent.entries).every(path =>
                canonicalJson(readPath(State.schedule, path)) === canonicalJson(intent.entries[path]));
            if (!held) {
                return { ok: false, state: 'unknown', reasons: ['unadopted'], revision,
                    closedId: intent.closedId };
            }
            this.clearPayIntent();
            return { ok: true, state: 'closed', reasons: [], revision, closedId: intent.closedId,
                opId: intent.id };
        }, () => ({ ok: false, state: 'unknown', reasons: ['unconfirmed'], revision,
            closedId: intent.closedId }));
    },

    failedPayIntent(intent, plan, rebases, error) {
        const code = error && error.code;
        // THE DOCUMENT MOVED, or the account already has its closed document. Nothing of
        // this operation was applied - the transaction threw before its first write - so
        // the intent is over. The fresh document is adopted, and the plan is asked again
        // of the record as it now is.
        if (code === 'conflict' || code === 'closed-exists') {
            this.clearPayIntent();
            if (error.document) {
                try { this.receive(error.document); } catch (ignored) { /* judged below */ }
            }
            const fresh = plan ? stillValid(State.schedule, plan) : { ok: false, reasons: ['stale'] };
            if (!fresh.ok && fresh.reasons.indexOf('done') !== -1) {
                return { ok: true, state: 'done', reasons: [] };
            }
            const blocked = fresh.ok ? this.payTransactRefusalAfterAdopt() : null;
            if (fresh.ok && code === 'conflict' && !blocked && rebases < PAY_REBASE_LIMIT) {
                // Somebody recorded a day; the account is as it was reviewed. The same
                // operation, under the same name, aimed at the revision that is there.
                return this.sendPayIntent(intent, plan, rebases + 1);
            }
            return { ok: false, state: 'stale', reasons: fresh.ok ? [blocked || 'stale'] : fresh.reasons,
                fresh: fresh.fresh || null };
        }
        if (error && error.unsent === true) {
            // Never got as far as its writes: no signal for the first read.
            this.clearPayIntent();
            return { ok: false, state: 'refused', reasons: [code === 'unavailable' ? 'offline' : 'server'],
                code: code || null };
        }
        if (PAY_DEFINITE_REFUSALS.indexOf(code) !== -1) {
            this.clearPayIntent();
            return { ok: false, state: 'refused', reasons: ['server'], code };
        }
        // SENT, AND NO ANSWER. It may have landed. Ask, do not send again.
        return this.resolvePayIntent().then(outcome => {
            if (outcome === 'committed') {
                return { ok: true, state: 'closed', reasons: [], closedId: intent.closedId,
                    opId: intent.id, resolved: true };
            }
            if (outcome === 'nothing') {
                return { ok: false, state: 'refused', reasons: ['offline'], resolved: true };
            }
            return { ok: false, state: 'unknown', reasons: ['unconfirmed'], closedId: intent.closedId };
        });
    },

    // After adopting a conflict's document: is this phone still in a state to send?
    payTransactRefusalAfterAdopt() {
        if (!this.adapter || this._revision === null) return 'offline';
        if (this.replacementOutstanding()) return 'restoring';
        if (this.pendingCount() > 0 || this._sending.size > 0) return 'unsent-work';
        return null;
    },

    // ------------------------------------------------------------ an intent in doubt
    //
    // resolvePayIntent() -> Promise<'committed' | 'nothing' | 'unknown' | 'none'>
    //
    // Called when the cloud is first heard after an open, and after an answer was lost.
    // It LOOKS: the receipt of the operation's own name is the server's record that it
    // was applied. It never sends the operation again.
    resolvePayIntent() {
        const intent = this.payIntent();
        if (!intent) return Promise.resolve('none');
        if (intent.unreadable) return Promise.resolve('unknown');
        if (this._payResolving) return this._payResolving;
        if (!this.adapter || typeof this.adapter.readReceipt !== 'function'
            || typeof this.adapter.read !== 'function') return Promise.resolve('unknown');
        const settle = outcome => {
            if (outcome === 'committed' || outcome === 'nothing') this.notePayOutcome(intent, outcome);
            return outcome;
        };
        const look = round => Promise.resolve(this.adapter.readReceipt(intent.id)).then(receipt => {
            if (receipt && Number.isInteger(receipt.revision)) {
                return this.confirmPayIntent(intent, receipt.revision)
                    .then(result => (result.ok ? 'committed' : 'unknown'));
            }
            return Promise.resolve(this.adapter.read()).then(live => {
                const held = live && Number.isInteger(live.revision) ? live.revision : null;
                if (held === null) return 'unknown';
                if (held > intent.base) {
                    // Its revision is spent and its receipt is not there: it was never
                    // applied and never can be. One more look at the receipt first - the
                    // write that moved the document may have been this very operation,
                    // landing between the two reads above.
                    return Promise.resolve(this.adapter.readReceipt(intent.id)).then(again => {
                        if (again && Number.isInteger(again.revision)) {
                            return this.confirmPayIntent(intent, again.revision)
                                .then(result => (result.ok ? 'committed' : 'unknown'));
                        }
                        this.clearPayIntent();
                        try { this.receive(live); } catch (error) { /* a snapshot will follow */ }
                        return 'nothing';
                    });
                }
                if (round >= PAY_REBASE_LIMIT) return 'unknown';
                // STILL WHERE IT WAS. The request may yet arrive - so the revision it is
                // aimed at is taken away from it: one write at that revision that changes
                // no business field. Whichever of the two lands, the next look is certain.
                const spend = { updatedAt: new Date().toISOString(), updatedBy: syncDeviceId(),
                    protocol: this.PROTOCOL, lastOpId: intent.id + 'x', revision: held + 1 };
                spend.opFingerprint = operationFingerprint('paybook-cancel', {}, intent.id);
                return this.cloudWrite(() => this.adapter.update(spend))
                    .then(() => look(round + 1), error => (error && error.code === 'conflict'
                        ? look(round + 1) : 'unknown'));
            });
        }, () => 'unknown');
        this._payResolving = look(0).then(settle, () => 'unknown').then(outcome => {
            this._payResolving = null;
            return outcome;
        });
        return this._payResolving;
    },

    // The first authoritative word from the server in this session: if an operation was
    // left in doubt, this is the moment it can be settled.
    payCloudHeard() {
        if (!this.payIntent()) return;
        Promise.resolve().then(() => this.resolvePayIntent()).catch(() => undefined);
    }
});
