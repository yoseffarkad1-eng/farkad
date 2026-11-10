// ---------------------------------------------------------------- what has left the live document
//
// A settled closure leaves the server's one document and stays in its closed documents.
//
// WHY. The schedule is one Firestore document, Firestore refuses one over a mebibyte, and
// a closure is the heaviest thing in it (docs/payroll-closure.md, Capacity). Every closure
// written since the server-first door has a create-once copy under closed/; a closure from
// before it gets one here. Once the copy is CONFIRMED BY THE SERVER, the live document
// gives up its own copy and keeps one row of `payIndex` in its place.
//
// WHAT THIS FILE OWNS:
//   - the gate every server document passes before this phone adopts it (closedGate):
//     the entries an index row stands for are laid back at their paths, from this phone's
//     own record or from the closed documents, so that the record a phone folds its money
//     from NEVER HAS A HOLE. A document that cannot be made whole is not adopted;
//   - what a whole-document write leaves out (closedAware): the entries a row stands for;
//   - the move itself (archiveClosed): copy, read back, compare, and only then drop.
//
// WHAT IT MUST NEVER DO:
//   - drop an entry the server has not been seen to hold in a closed document, byte for
//     byte. The comparison is made three times: here against what was read, inside the
//     adapter's transaction against what that transaction read, and the rules refuse a
//     drop that names no existing closed document;
//   - adopt a document with a hole in it. A period would read as open, an advance as
//     never deducted, on every money screen, and nothing would say so;
//   - touch this phone's own record. The phone keeps every entry; only the server's live
//     document gets smaller;
//   - queue, or send anything again. Like the closure itself the move is refused with no
//     signal, and what became of it is learned by READING the server, never by assuming.
//
// IDEMPOTENT AND RESUMABLE BY CONSTRUCTION: nothing about a move in progress is written
// down on this phone. Each step begins by reading the server's document and its closed
// documents and does the next thing they call for - so a reload, a lost answer or a
// second phone doing the same move in the same minute all end in the same place.

// How many times one bundle is re-aimed after the document moved under it for somebody
// else's reason (a day recorded on another phone).
const CLOSED_REBASE_LIMIT = 4;

// How long before a document that could not be made whole is tried again, in turn.
const CLOSED_RETRY_MS = [1500, 4000, 10000, 30000, 60000];

Object.assign(FarkadSync, {
    // Closed documents fetched in this session, by id. Never written to the disk: once a
    // document made whole has been adopted, the entries are in the record itself.
    _closedDocs: {},
    // The newest server document that could not be made whole yet, or null.
    _closedHeld: null,
    // { missing: [closed ids], broken: [row ids], since, tries } while one is held.
    _closedWaiting: null,
    _closedFetching: null,
    _closedTimer: null,
    _closedRetrying: false,
    _archiving: false,

    // ------------------------------------------------------------ on the way in
    //
    // closedGate(document) -> the document made whole, or null when it cannot be yet.
    //
    // Called at the top of receive(), which is the one door every server document comes
    // through - the listener's snapshot, the document a lost race hands back, a direct
    // read. Synchronous and free when the index names nothing: the same object goes back.
    closedGate(remote) {
        if (!remote || typeof remote !== 'object' || typeof paybookWhole !== 'function') return remote;
        let whole;
        try {
            whole = paybookWhole(remote, typeof State !== 'undefined' ? State.schedule : null, this._closedDocs);
        } catch (error) {
            // A row this build cannot even walk is not a reason to stop hearing the cloud:
            // paybookStoredIndex skips what it cannot read. This is belt and braces.
            return remote;
        }
        if (whole.missing.length === 0 && whole.broken.length === 0) {
            if (this._closedWaiting) this.closedSettled();
            return whole.document;
        }
        const newer = !this._closedHeld || !Number.isInteger(this._closedHeld.revision)
            || !Number.isInteger(remote.revision) || remote.revision >= this._closedHeld.revision;
        if (newer) this._closedHeld = remote;
        const tries = this._closedWaiting ? this._closedWaiting.tries : 0;
        this._closedWaiting = { missing: whole.missing.slice(), broken: whole.broken.slice(),
            since: this._closedWaiting ? this._closedWaiting.since : new Date().toISOString(), tries };
        // «מסונכרן» over a document this phone has not adopted would be the lie the whole
        // status line exists to prevent.
        if (this.status === 'synced') this.setStatus('connecting');
        // Not from inside the retry itself: a fetch that failed is tried again on the
        // ladder, never at once - a phone with no signal would otherwise spin.
        if (!this._closedRetrying) this.fetchClosed();
        if (typeof renderAccountsNotice === 'function') {
            try { renderAccountsNotice(); } catch (error) { /* a notice, not the record */ }
        }
        return null;
    },

    // What a screen may say: null, or what this phone is still waiting for.
    closedWaiting() {
        return this._closedWaiting ? { missing: this._closedWaiting.missing.slice(),
            broken: this._closedWaiting.broken.slice(), since: this._closedWaiting.since } : null;
    },

    closedSettled() {
        this._closedWaiting = null;
        this._closedHeld = null;
        clearTimeout(this._closedTimer);
        this._closedTimer = null;
        if (typeof renderAccountsNotice === 'function') {
            try { renderAccountsNotice(); } catch (error) { /* a notice, not the record */ }
        }
    },

    // Fetch what is missing, then hand the held document to receive() again. One fetch at
    // a time; a failure is tried again on a ladder and at the next signal.
    fetchClosed() {
        if (this._closedFetching || !this._closedWaiting) return this._closedFetching;
        const reader = this.adapter && typeof this.adapter.readClosed === 'function' ? this.adapter : null;
        const ids = this._closedWaiting.missing.slice();
        const again = () => {
            this._closedFetching = null;
            const held = this._closedHeld;
            if (!held) return;
            // Through the front door, so the gate judges it afresh with what was fetched.
            this._closedHeld = null;
            const before = this._closedWaiting ? this._closedWaiting.tries : 0;
            this._closedRetrying = true;
            try { this.receive(held); } catch (error) { /* receive reports its own trouble */ }
            this._closedRetrying = false;
            if (this._closedWaiting) {
                this._closedWaiting.tries = before + 1;
                const wait = CLOSED_RETRY_MS[Math.min(before, CLOSED_RETRY_MS.length - 1)];
                clearTimeout(this._closedTimer);
                this._closedTimer = setTimeout(() => { this._closedTimer = null; this.fetchClosed(); }, wait);
            }
        };
        if (!reader || ids.length === 0) {
            // Nothing to fetch (a broken row), or nothing to fetch with: wait and look again.
            this._closedFetching = Promise.resolve().then(again);
            return this._closedFetching;
        }
        this._closedFetching = Promise.all(ids.map(id =>
            Promise.resolve().then(() => reader.readClosed(id)).then(doc => {
                if (doc && paybookClosedProblems(id, doc).length === 0) this._closedDocs[id] = doc;
            }, () => undefined))).then(again, again);
        return this._closedFetching;
    },

    // ------------------------------------------------------------ on the way out
    //
    // The adapter as this phone uses it: the same object underneath, with the three
    // whole-document writes leaving out what an index row stands for. Everything else -
    // every field-path edit, every read - is the adapter's own function, untouched.
    closedAware(adapter) {
        if (!adapter || typeof adapter !== 'object' || typeof paybookStripCovered !== 'function') return adapter;
        const aware = Object.create(adapter);
        const strip = data => {
            try { return paybookStripCovered(data); } catch (error) { return data; }
        };
        if (typeof adapter.save === 'function') aware.save = data => adapter.save(strip(data));
        if (typeof adapter.create === 'function') aware.create = data => adapter.create(strip(data));
        if (typeof adapter.archive === 'function') aware.archive = (key, data) => adapter.archive(key, strip(data));
        return aware;
    },

    // ------------------------------------------------------------ the move
    //
    // Null, or the one word for why nothing may be moved right now.
    archiveRefusal() {
        if (typeof paybookWritesEnabled !== 'function' || !paybookWritesEnabled()) return 'gate';
        if (this._archiving) return 'busy';
        if (this._closedWaiting) return 'waiting';
        if (!this.adapter || typeof this.adapter.archiveClosed !== 'function') {
            return this.adapter ? 'unsupported' : 'offline';
        }
        return this.payTransactRefusal();
    },

    // archiveClosed(options) -> Promise<{ ok, state, reasons, moved, failed, left }>
    //
    //   options.olderThanDays   only closures closed at least this many days ago
    //   options.limit           at most this many in one run
    //   options.only            only these row ids
    //   options.today           the local day (the screens pass it)
    //
    //   state 'refused'   nothing was attempted; `reasons` says why
    //   state 'done'      every bundle attempted is in `moved` or in `failed` (with its
    //                     reason). `left` is how many were ready and not attempted.
    //
    // One bundle at a time, each its own transactions. A failure stops the run: what
    // failed once for a reason of the connection will fail again for the next man.
    archiveClosed(options) {
        const want = options && typeof options === 'object' ? options : {};
        const blocked = this.archiveRefusal();
        if (blocked) {
            return Promise.resolve({ ok: false, state: 'refused', reasons: [blocked], moved: [], failed: [], left: 0 });
        }
        const plan = planArchive(State.schedule, want.today, { olderThanDays: want.olderThanDays });
        let ready = plan.bundles.filter(bundle => bundle.state === 'ready');
        if (Array.isArray(want.only)) ready = ready.filter(bundle => want.only.indexOf(bundle.rowId) !== -1);
        const todo = Number.isInteger(want.limit) && want.limit >= 0 ? ready.slice(0, want.limit) : ready;
        const moved = [];
        const failed = [];
        this._archiving = true;
        const step = at => {
            if (at >= todo.length || failed.length > 0) return Promise.resolve();
            return this.archiveOne(todo[at], 0).then(result => {
                if (result.ok) moved.push(todo[at].rowId);
                else failed.push({ rowId: todo[at].rowId, reason: result.reason });
                if (typeof want.progress === 'function') {
                    try { want.progress({ moved: moved.slice(), failed: failed.slice(), of: todo.length }); } catch (error) { /* a screen */ }
                }
                return step(at + 1);
            });
        };
        const finish = () => {
            this._archiving = false;
            return { ok: failed.length === 0, state: 'done', reasons: [], moved, failed,
                left: ready.length - moved.length - failed.length };
        };
        return step(0).then(finish, error => { this._archiving = false; throw error; });
    },

    archiveEnvelope(kind, rowId, revision) {
        const patch = {
            updatedAt: new Date().toISOString(),
            updatedBy: syncDeviceId(),
            protocol: this.PROTOCOL,
            // A name of its own for every attempt: what became of an attempt is learned
            // by reading the document, never from a receipt, so no two may share one.
            lastOpId: 'arc' + digestOf([syncDeviceId(), kind, rowId, String(revision), String(Date.now()),
                String(Math.random())].join('|')),
            revision
        };
        patch.opFingerprint = operationFingerprint('paybook-' + kind, {}, rowId);
        return patch;
    },

    // One bundle: read the server, and do the next thing it calls for.
    //   { ok: true, already }      it is out of the live document, and this phone knows
    //   { ok: false, reason }      offline | differs | copy-differs | row | server | busy
    archiveOne(bundle, round) {
        const fail = reason => ({ ok: false, reason });
        const same = (one, two) => canonicalJson(one === undefined ? null : one) === canonicalJson(two === undefined ? null : two);
        const adapter = this.adapter;
        if (!adapter) return Promise.resolve(fail('offline'));
        // 'again': look at the server afresh - which is also how a success is confirmed.
        // 'denied': the server refused. The first time that is most likely a revision
        // race the rules answered in their own words (see failedPayIntent); a second
        // time running it is a refusal, and is said as one.
        const next = result => {
            if (result === 'again') return this.archiveOne(bundle, round + 1);
            if (result === 'denied') return round < 2 ? this.archiveOne(bundle, round + 1) : fail('server');
            return fail(result);
        };
        return Promise.resolve().then(() => adapter.read()).then(live => {
            if (!live || !Number.isInteger(live.revision)) return fail('offline');
            const stored = paybookStoredIndex(live);
            if (ownsKey(stored.rows, bundle.rowId)) {
                // Already out. Nothing is written; this phone learns of the row the way it
                // learns of anything.
                const gone = bundle.paths.every(path => readPath(live, path) === undefined);
                if (!gone) return fail('row');
                try { this.receive(live); } catch (error) { /* a snapshot will follow */ }
                return { ok: true, already: true };
            }
            // THE SERVER'S OWN BYTES, and they must be this phone's. A bundle is planned
            // from this phone's record; what leaves is what the server holds. If the two
            // differ at any path, somebody knows something this phone does not.
            const values = {};
            for (let i = 0; i < bundle.paths.length; i += 1) {
                const path = bundle.paths[i];
                const held = readPath(live, path);
                if (held === undefined || !same(held, readPath(State.schedule, path))) return fail('differs');
                values[path] = held;
            }
            const artifactId = periodArtifactId(bundle.workerId, bundle.periodFrom);
            const candidates = [bundle.rowId];
            bundle.paths.filter(isPaybookPath).map(path => path.split('.')[1])
                .concat([artifactId]).forEach(id => { if (candidates.indexOf(id) === -1) candidates.push(id); });
            return Promise.all(candidates.map(id => Promise.resolve().then(() => adapter.readClosed(id))))
                .then(found => {
                    const docs = {};
                    found.forEach((doc, at) => {
                        if (doc && paybookClosedProblems(candidates[at], doc).length === 0) docs[candidates[at]] = doc;
                    });
                    const covered = {};
                    let differs = false;
                    candidates.filter(id => ownsKey(docs, id)).forEach(id => bundle.paths.forEach(path => {
                        if (!ownsKey(docs[id].entries, path)) return;
                        if (!same(docs[id].entries[path], values[path])) differs = true;
                        if (!ownsKey(covered, path)) covered[path] = id;
                    }));
                    // A closed document is create-once. One that holds another figure for
                    // an entry of this closure can never be made to agree, and the live
                    // copy is then the only true one: it stays.
                    if (differs) return fail('copy-differs');
                    const remainder = bundle.paths.filter(path => !ownsKey(covered, path));
                    if (remainder.length > 0) {
                        if (round >= CLOSED_REBASE_LIMIT) return fail('busy');
                        const target = !found[0] ? bundle.rowId : artifactId;
                        if (found[candidates.indexOf(target)]) return fail('copy-differs');
                        return this.archiveCopy(bundle, target, remainder, values, live.revision).then(next);
                    }
                    const used = [];
                    bundle.paths.forEach(path => { if (used.indexOf(covered[path]) === -1) used.push(covered[path]); });
                    if (used.indexOf(bundle.rowId) === -1) return fail('copy-differs');
                    const row = JSON.parse(JSON.stringify(bundle.row));
                    const others = used.filter(id => id !== bundle.rowId).sort();
                    if (others.length > 0) row.d = others;
                    if (paybookIndexRowProblems(bundle.rowId, row).length > 0) return fail('row');
                    if (round >= CLOSED_REBASE_LIMIT) return fail('busy');
                    return this.archiveDrop(bundle, row, used, live.revision).then(next);
                });
        // A read that failed - of the document or of any closed document - is no signal.
        // Nothing was written on the strength of a read that did not come back.
        }).catch(() => fail('offline'));
    },

    // THE COPY: one create-once closed document holding the entries no closed document
    // holds yet, in a commit that moves the schedule's revision and changes no business
    // field. Answers 'again' (look at the server afresh) or a failure's word.
    archiveCopy(bundle, target, paths, values, revision) {
        const entries = {};
        paths.forEach(path => { entries[path] = JSON.parse(JSON.stringify(values[path])); });
        const patch = this.archiveEnvelope('copy', target, revision + 1);
        patch.closedId = target;
        const document = paybookClosedDocument({ closedId: target, kind: 'history',
            workerId: bundle.workerId, entries }, patch.lastOpId, patch.revision);
        return this.cloudWrite(() => this.adapter.transact(patch, [{ id: target, data: document }]))
            .then(() => 'again', error => {
                const code = error && error.code;
                // Moved under it, or somebody made the same copy first: both are answered
                // by looking again.
                if (code === 'conflict' || code === 'closed-exists') return 'again';
                if (code === 'permission-denied') return 'denied';
                return error && error.unsent === true && code === 'unavailable' ? 'offline' : 'server';
            });
    },

    // THE DROP: the entries leave the live document and the row arrives, in one commit -
    // and the adapter confirms, inside that same transaction, that every closed document
    // exists and holds each entry exactly as the live document does.
    archiveDrop(bundle, row, docs, revision) {
        const patch = this.archiveEnvelope('drop', bundle.rowId, revision + 1);
        patch.archivedId = bundle.rowId;
        patch['payIndex.v'] = PAYBOOK_INDEX_VERSION;
        patch['payIndex.rows.' + bundle.rowId] = row;
        return this.cloudWrite(() => this.adapter.archiveClosed(patch, bundle.paths.slice(), docs.slice()))
            .then(() => 'again', error => {
                const code = error && error.code;
                if (code === 'conflict') return 'again';
                if (code === 'permission-denied') return 'denied';
                if (code === 'closed-unconfirmed') return 'copy-differs';
                // No answer: it may have landed. The next look says.
                if (!(error && error.unsent === true)) return 'again';
                return code === 'unavailable' ? 'offline' : 'server';
            });
    },

    // The closures that have been settled long enough, moved without being asked - a few
    // at a time, after a closure or a payment has just gone through (so the connection
    // is known to be good and the queue empty). Refused quietly whenever anything at all
    // is in the way; the screen in ⋯ shows what is waiting.
    archiveDue(today) {
        if (this.archiveRefusal()) return Promise.resolve(null);
        return this.archiveClosed({ today, olderThanDays: PAYBOOK_ARCHIVE_AFTER_DAYS, limit: 3 })
            .catch(() => null);
    }
});
