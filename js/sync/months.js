// ---------------------------------------------------------------- a closed month leaves (Phase 6)
//
// The move of one closed month of days out of the server's live document into a document
// of its own. The model - what may move, the row, whole and stripped - is
// js/model/months.js; the gate every server document passes on the way in and the
// wrapper every whole-document write passes on the way out are Phase 5's own
// (closedGate, closedAware in js/sync/closed.js), which now do both.
//
// SHIPPED SHUT: FARKAD_FLAGS.months is false, archiveMonths answers `gate` before it
// reads anything, and no screen calls it.
//
// WHAT THIS FILE MUST NEVER DO:
//   - drop a day the server has not been seen to hold in a month document, byte for byte.
//     Compared three times: here against what was read; inside the adapter's transaction
//     against what that transaction read; and by the rules, which refuse a drop whose
//     days are not exactly the days the named document holds;
//   - touch this phone's own record. The phone keeps every day; the server's document
//     gets smaller, and this phone learns of the row by adopting it like any other phone;
//   - queue, or send anything twice. What became of a step is learned by READING the
//     server, never by assuming.
//
// IDEMPOTENT AND RESUMABLE BY CONSTRUCTION, as Phase 5's move is: nothing about a move in
// progress is written on this phone. Each step reads the server and does the next thing
// it calls for - so a reload, a lost answer or a second phone moving the same month in
// the same minute all end in the same place.

Object.assign(FarkadSync, {
    _archivingMonths: false,
    _monthsWant: { today: undefined, afterMonths: undefined },

    // Null, or the one word for why no month may be moved right now.
    monthArchiveRefusal() {
        if (typeof monthWritesEnabled !== 'function' || !monthWritesEnabled(State.schedule)) return 'gate';
        if (this._archivingMonths || this._archiving) return 'busy';
        if (this._closedWaiting) return 'waiting';
        if (!this.adapter || typeof this.adapter.archiveMonth !== 'function'
            || typeof this.adapter.copyMonth !== 'function' || typeof this.adapter.readMonth !== 'function') {
            return this.adapter ? 'unsupported' : 'offline';
        }
        return this.payTransactRefusal();
    },

    // archiveMonths(options) -> Promise<{ ok, state, reasons, moved, failed, left }>
    //
    //   options.today         the local day (required: eligibility is counted from it)
    //   options.afterMonths   the horizon, when not the default six
    //   options.limit         at most this many in one run
    //   options.only          only these months ('YYYY-MM')
    //
    //   state 'refused'   nothing was attempted; `reasons` says why
    //   state 'done'      every month attempted is in `moved` or in `failed` (with its
    //                     reason); `left` is how many were ready and not attempted
    //
    // Oldest first, one at a time, each its own transactions. A failure stops the run.
    archiveMonths(options) {
        const want = options && typeof options === 'object' ? options : {};
        const blocked = this.monthArchiveRefusal();
        if (blocked) {
            return Promise.resolve({ ok: false, state: 'refused', reasons: [blocked], moved: [], failed: [], left: 0 });
        }
        const plan = planMonths(State.schedule, want.today, { afterMonths: want.afterMonths });
        let ready = plan.months.filter(one => one.state === 'ready');
        if (Array.isArray(want.only)) ready = ready.filter(one => want.only.indexOf(one.month) !== -1);
        const todo = Number.isInteger(want.limit) && want.limit >= 0 ? ready.slice(0, want.limit) : ready;
        const moved = [];
        const failed = [];
        this._archivingMonths = true;
        this._monthsWant = { today: want.today, afterMonths: want.afterMonths };
        const step = at => {
            if (at >= todo.length || failed.length > 0) return Promise.resolve();
            return this.archiveMonthOne(todo[at].month, 0).then(result => {
                if (result.ok) moved.push(todo[at].month);
                else failed.push({ month: todo[at].month, reason: result.reason, detail: result.detail || null });
                if (typeof want.progress === 'function') {
                    try { want.progress({ moved: moved.slice(), failed: failed.slice(), of: todo.length }); } catch (error) { /* a screen */ }
                }
                return step(at + 1);
            });
        };
        const finish = () => {
            this._archivingMonths = false;
            return { ok: failed.length === 0, state: 'done', reasons: [], moved, failed,
                left: ready.length - moved.length - failed.length };
        };
        return step(0).then(finish, error => { this._archivingMonths = false; throw error; });
    },

    monthEnvelope(kind, month, revision) {
        const patch = {
            updatedAt: new Date().toISOString(),
            updatedBy: syncDeviceId(),
            protocol: this.PROTOCOL,
            lastOpId: 'mon' + digestOf([syncDeviceId(), kind, month, String(revision), String(Date.now()),
                String(Math.random())].join('|')),
            revision
        };
        patch.opFingerprint = operationFingerprint('month-' + kind, {}, month);
        return patch;
    },

    // One month: read the server, and do the next thing it calls for.
    //   { ok: true, already }      it is out of the live document, and this phone knows
    //   { ok: false, reason }      offline | differs | row | server | busy | unsettled
    archiveMonthOne(month, round, atLeast, last) {
        const fail = reason => ({ ok: false, reason, detail: last || null });
        const adapter = this.adapter;
        if (!adapter) return Promise.resolve(fail('offline'));
        const next = result => {
            const word = result && typeof result === 'object' ? result.word : result;
            const floor = result && typeof result === 'object' ? result.revision : undefined;
            const said = result && typeof result === 'object' ? (result.said || null) : null;
            if (word === 'again') return this.archiveMonthOne(month, round + 1, floor, said);
            if (word === 'denied') return round < 2 ? this.archiveMonthOne(month, round + 1, floor, said) : fail('server');
            return fail(word);
        };
        return this.readLiveAtLeast(atLeast).then(live => {
            if (!live || !Number.isInteger(live.revision)) return fail('offline');
            const stored = monthStoredIndex(live);
            const there = monthDaysOf(live, month);
            if (stored.months.indexOf(month) !== -1) {
                // Already out. Nothing is written; this phone learns of the row the way
                // it learns of anything - through the gate, which asks for the digest.
                if (Object.keys(there).length > 0 || !Object.prototype.hasOwnProperty.call(stored.rows, month)) return fail('row');
                try { this.receive(live); } catch (error) { /* a snapshot will follow */ }
                return { ok: true, already: true };
            }
            // THE SERVER'S OWN BYTES, and they must be this phone's: the eligibility was
            // judged on this phone's record, and what leaves is what the server holds.
            const mine = monthDaysOf(State.schedule, month);
            if (Object.keys(there).length === 0
                || monthCanonical(there) !== monthCanonical(mine)) return fail('differs');
            // And it must STILL be eligible, on the record as it is now.
            const now = planMonths(State.schedule, this._monthsWant.today,
                { afterMonths: this._monthsWant.afterMonths }).months.find(one => one.month === month);
            if (!now || now.state !== 'ready') return fail('unsettled');
            const digest = monthDigest(there);
            const docId = monthDocumentId(month, digest);
            return Promise.resolve().then(() => adapter.readMonth(docId)).then(copy => {
                if (round >= CLOSED_REBASE_LIMIT) return fail('busy');
                if (!copy) return this.monthCopy(month, docId, there, live.revision).then(next);
                // Named by its content, so a document of this name that does not hold
                // these days is not a stale copy - it is a broken one, and nothing may
                // leave on the strength of it.
                if (monthDocumentProblems(docId, copy).length > 0 || copy.month !== month
                    || monthCanonical(copy.days) !== monthCanonical(there)) return fail('row');
                const row = monthRow(month, there, new Date().toISOString());
                if (monthRowProblems(month, row).length > 0) return fail('row');
                return this.monthDrop(month, docId, row, live.revision).then(next);
            });
        // A read that failed is no signal, and nothing was written on the strength of
        // one. A read the SERVER refused is said as that: rules that know nothing of
        // months/ (the ones published before this) refuse it, and «no signal» would send
        // somebody looking for a connection that is fine.
        }).catch(error => fail(error && error.code === 'permission-denied' ? 'server' : 'offline'));
    },

    // AN EDIT HELD BECAUSE ITS MONTH HAS LEFT IS RETIRED BY A PERSON, and only that way.
    //
    // The edit was typed on a phone that had not heard; it was never sent and never will
    // be (the pre-send pass holds it, the server would refuse it). Here the person, having
    // been shown both values in ⋯, lets it go: the decision is written down first
    // (answerHold retires the operation before anything is unbarred), and then this
    // phone's record is given the archive's own value back at that path - from the last
    // server document it was shown, which the gate made whole. False, with nothing
    // changed, when the operation is not such a hold or the decision could not be kept.
    retireArchivedHold(opId) {
        this.loadOutbox();
        const op = this.physicalOperations().find(item => String(item.opId) === String(opId));
        if (!op || !this._baseDoc || typeof monthArchivedPath !== 'function'
            || !monthArchivedPath(this._baseDoc, op.path)) return false;
        if (!this.answerHold(opId, 'cloud')) return false;
        const parts = String(op.path).split('.');
        const theirs = readPath(this._baseDoc, op.path);
        let node = State.schedule;
        for (let i = 0; i < parts.length - 1 && node; i += 1) {
            if (theirs !== undefined && (node[parts[i]] === undefined || node[parts[i]] === null)) node[parts[i]] = {};
            node = node[parts[i]];
        }
        if (node && typeof node === 'object') {
            if (theirs === undefined) delete node[parts[parts.length - 1]];
            else node[parts[parts.length - 1]] = JSON.parse(JSON.stringify(theirs));
        }
        this.loadOutbox();
        State.persist();
        if (typeof render === 'function') render();
        // The line said «contested» over this hold; ask again now that it is answered.
        // setStatus works the whole chain out afresh - another hold, unsent work, a
        // restore that is owed - so this cannot say more than is true.
        if (this.status === 'contested') this.setStatus('synced');
        return true;
    },

    // THE COPY: the month document, created once, in a commit that moves the schedule's
    // revision and changes no business field.
    monthCopy(month, docId, days, revision) {
        const patch = this.monthEnvelope('copy', docId, revision + 1);
        const document = monthDocument(month, days, patch.lastOpId, patch.revision);
        return this.cloudWrite(() => this.adapter.copyMonth(patch, { id: docId, data: document }))
            .then(() => ({ word: 'again', revision: patch.revision, said: 'copied' }), error => {
                const code = error && error.code;
                if (code === 'conflict' || code === 'month-exists') {
                    return { word: 'again', revision: Number.isInteger(error.revision) ? error.revision : undefined, said: code };
                }
                if (code === 'permission-denied') return { word: 'denied', said: code };
                if (!(error && error.unsent === true)) {
                    return { word: 'again', said: String(code || (error && error.message) || 'no answer').slice(0, 120) };
                }
                return code === 'unavailable' ? 'offline' : { word: 'server', said: code };
            });
    },

    // THE DROP: the days leave the live document and the row arrives, in one commit - and
    // the adapter confirms, inside that same transaction, that the month document holds
    // exactly the days being removed.
    monthDrop(month, docId, row, revision) {
        const patch = this.monthEnvelope('drop', month, revision + 1);
        patch.archivedMonth = month;
        patch.monthDoc = docId;
        patch['monthIndex.v'] = MONTH_INDEX_VERSION;
        patch['monthIndex.rows.' + month] = row;
        return this.cloudWrite(() => this.adapter.archiveMonth(patch, month, docId))
            .then(() => ({ word: 'again', revision: patch.revision, said: 'dropped' }), error => {
                const code = error && error.code;
                if (code === 'conflict') {
                    return { word: 'again', revision: Number.isInteger(error.revision) ? error.revision : undefined, said: code };
                }
                if (code === 'permission-denied') return { word: 'denied', said: code };
                // A day of the month changed between the read and the drop: look again -
                // the next round reads the new days and names a new document.
                if (code === 'month-unconfirmed') return { word: 'again', said: code };
                if (['invalid-argument', 'failed-precondition', 'not-found', 'out-of-range',
                    'unauthenticated', 'no-month-document'].indexOf(code) !== -1) return { word: 'server', said: code };
                if (!(error && error.unsent === true)) {
                    return { word: 'again', said: String(code || (error && error.message) || 'no answer').slice(0, 120) };
                }
                return code === 'unavailable' ? 'offline' : 'server';
            });
    }
});
