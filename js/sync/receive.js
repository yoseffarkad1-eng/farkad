// ---------------------------------------------------------------- the receive path
//
// Split out of js/sync/sync.js at v102. The code is unchanged: the same method bodies in
// the same order, added to the same object through Object.assign, plus the free functions
// that only this path uses. Nothing was renamed and nothing was tidied on the way past.
//
// WHAT THIS FILE OWNS: what happens when a document arrives from the server. Adopting the
// snapshot, merging it onto what this device holds, putting the queue back on top of it,
// the provenance of a name, and every door a poisoned or unreadable record can arrive by.
// The client half of the ordering protocol lives here too - the revision, the base
// document, and how a contest is told apart from a conflict.
//
// WHAT IT MUST NEVER DO:
//   - decide by comparing timestamps. Those stamps come from three phones' clocks, and a
//     device running a few minutes fast would judge every incoming snapshot older than its
//     own and quietly stop showing the other two people's work. The server document is
//     adopted; it is never argued with.
//   - treat anything it cannot read as absent. A ledger container, a name, a migration
//     that will not parse is held aside and the person is told - it is never coerced,
//     dropped, or written over.
//   - let a snapshot acknowledge work this device has not had answered. An entry leaves
//     the queue when the cloud names its operation, and never because a document arrived
//     that happens to contain the same value.

Object.assign(FarkadSync, {
    // Moved here from js/sync/sync.js at v102, with the code it describes. It is the
    // receive path's own state and the prose that explains it, and it was left behind
    // by the first pass of the split - forty-odd lines of reasoning about adopting a
    // snapshot, sitting above a queue file that does not adopt anything. A comment
    // that has drifted away from its code is worse than no comment: it is read as
    // describing whatever it now sits above.
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

    // What the disk holds at `path`, as a mark: VALUE_ABSENT for nothing, and null when
    // the record will not read - which is not nothing, and contributes nothing.
    storedMarkAt(path, stored) {
        if (stored.raw === null) return VALUE_ABSENT;
        if (!stored.schedule) return null;
        return valueMark(readPath(stored.schedule, path));
    },

    // Every value this device has held or produced at `path`, as marks. Recorded with
    // the operation - see queueOperations - and consulted by movedUnder and by the
    // conflict branch, which ask the same question of two documents.
    //
    //   the disk: the adopted document plus every edit made on this device since, in
    //   this tab or another - so a tab whose listener is behind the disk still knows the
    //   value its sibling put there;
    //   the last snapshot, when one was heard: a tab whose disk is AHEAD of its listener
    //   - the sibling wrote - must not read the server's older value as a correction;
    //   the operation this one supersedes: its own values, and everything it had seen.
    //   A superseded write may be in flight and land, and the server then holds this
    //   device's own value under a record that predates it.
    //
    // The disk is the device. Two contexts on one disk are one person, whatever they
    // signed their writes with, and the value one of them put there is a value the other
    // has held - which is why the person's later decision on one tab is never held
    // against their earlier one on another. See tests/probes.test.mjs, Q2 and Q3.
    seenMarksAt(path, held, previous) {
        const marks = [];
        const add = mark => {
            if (typeof mark === 'string' && mark !== '' && marks.indexOf(mark) === -1) {
                marks.push(mark);
            }
        };
        add(held);
        if (this._baseDoc !== null) add(valueMark(this.baseValueAt(path)));
        if (previous) {
            if (Array.isArray(previous.seen)) previous.seen.forEach(add);
            else if (typeof previous.base === 'string') add(markOfRecorded(previous.base));
            add(valueMark(previous.value));
        }
        return marks;
    },

    // Has somebody else changed what `document` holds at `path` since the values this
    // operation was built on? The pre-send half of the conflict rule: the same question
    // contestedPaths asks of a refusal's document, asked of the last snapshot BEFORE the
    // write leaves, because a phone that comes back, hears the winner and only then
    // flushes is refused by nothing - its revision is current - and the collision it is
    // about to lose already happened while it was away.
    movedUnder(item, path, document) {
        // Nothing heard: nothing to compare against, and nothing to decide here. The
        // write goes out against no revision, the server answers with its document, and
        // the conflict branch asks this question of that answer.
        if (!document || typeof document !== 'object') return false;
        const marks = marksOf(path, readPath(document, path));
        // A path the server holds nothing at is not a path anybody's record is lost on.
        // Two phones reaching an empty project are the ordinary case: one creates the
        // document, and the other's evening - on the days the first never wrote - goes.
        if (marks[0] === VALUE_ABSENT) return false;
        // Nor is a path the server already holds THIS VALUE at. An earlier attempt whose
        // answer was lost landed it, and the retry is answered from its receipt; or
        // another phone recorded the same thing. Either way, sending it changes nothing
        // and loses nothing - and holding it left a phone owing a day the cloud had.
        if (marks.indexOf(valueMark(item.value)) !== -1) return false;
        if (Array.isArray(item.seen)) {
            return !marks.some(mark => item.seen.indexOf(mark) !== -1);
        }
        // A QUEUE AN OLDER BUILD WROTE carries no record of what this device produced,
        // so the document's last writer is the only signal there is, and it is read as
        // that build read it: nothing this device signed is held against it. A recorded
        // base is compared. No base at all - that build could not tell a session that
        // had heard nothing from a path the server held nothing at, and wrote null for
        // both - is read as unheard, and held whenever somebody else now holds a value
        // there: it used to be read as nothing, and sent over the other phone's day.
        const wroteLast = String(document.updatedBy || '');
        if (wroteLast === '' || wroteLast === String(syncDeviceId())) return false;
        if (typeof item.base === 'string') {
            return canonicalJson(readPath(document, path)) !== item.base;
        }
        return true;
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
            // since. See stampProtocol. A path with no frozen base is one this client
            // cannot compare, and it is contested for that reason.
            const frozen = base[path];
            if (!frozen || !Array.isArray(frozen.seen)) return true;
            const marks = marksOf(path, read(current, path));
            // A path the document already holds this write's value at has not moved
            // away from it - see movedUnder.
            if (marks.indexOf(valueMark(patch[path])) !== -1) return false;
            return !marks.some(mark => frozen.seen.indexOf(mark) !== -1);
        });
    },

    // The envelope this write travels in, stamped onto the patch itself - which is how it
    // reaches the rules, since Firestore evaluates them against the document as it would
    // be after the merge.
    // `fingerprint`, when it is given, is the operation's own - see createDocument, the
    // one door where a single operation legitimately travels as two different sets of
    // bytes. Everywhere else it is computed from what is being sent, which is the same
    // thing said the short way.
    stampProtocol(patch, opId, kind, extra, fingerprint) {
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
                // THE QUEUE'S OWN RECORD FIRST. The operation wrote down what this device
                // had seen and produced at the path when the person made the edit, in the
                // same write that queued it, so it is still there after a reopen - which
                // is the whole point: reading it live at that moment gives the winner's
                // value and answers "nothing moved" to a question whose answer is
                // "somebody corrected this". `own` says the record can tell this device's
                // values from anybody else's, so the document's author is not needed.
                //
                // A queue written by an older build recorded the base alone, or nothing,
                // and then the document's author is the only signal there is and the
                // conflict branch reads it as it did. A recorded base is used only when
                // it RECORDS something: that build's `null` said the server held nothing
                // at this path when the edit was made, which is not evidence that
                // anybody corrected it - two phones reaching an empty project both record
                // null for everything, and treating that as a moved path made the loser
                // of the create race hold its whole roster.
                const queued = this._outbox.get(path);
                if (queued && Array.isArray(queued.seen)) {
                    this._sendBase[path] = { seen: queued.seen.slice(), own: true };
                    return;
                }
                if (queued && typeof queued.base === 'string') {
                    this._sendBase[path] = { seen: [markOfRecorded(queued.base)], own: false };
                    return;
                }
                this._sendBase[path] = {
                    seen: [valueMark(this.baseValueAt(path))], own: false
                };
            });
        }
        patch.protocol = this.PROTOCOL;
        patch.lastOpId = String(opId);
        // Computed BEFORE the ordering fields are read back out of the patch - they are
        // excluded by name, so the order does not matter, and computing it here means every
        // door that stamps a write stamps its fingerprint too.
        patch.opFingerprint = typeof fingerprint === 'string' && fingerprint
            ? fingerprint
            : operationFingerprint(kind || 'update', patch, extra);
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
    // legacyOpId (js/sync/sync.js - it was two hundred lines up until v102 split this file
    // out) already digests the value, with a comment explaining
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
        this._heldSnapshot = false;

        // A restore is waiting to go out. Everything arriving right now is, by
        // definition, the state the person asked to replace - adopting it would undo
        // their restore on the very device that asked for it, and it would look like
        // nothing happened at all. Push again instead.
        // A restore that has not landed, or a note about one that cannot be read. Either
        // way what is arriving is the state somebody asked to replace, and adopting it
        // would undo their restore on the device that asked for it.
        //
        // A snapshot dropped here for a hold is remembered as dropped, so the
        // acknowledgement that lifts the hold can run it - see releaseRecoveryHold.
        if (this.replaceDamaged || farkadWritesBlocked()) {
            if (farkadWritesBlocked()) this._heldSnapshot = true;
            return;
        }

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
        this._reappliedOver = new Set(this.reapplyPending(State.schedule, gone));

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
            // HELD IS NOT FULL. normaliseSchedule has just reported what this snapshot
            // carries, and Recovery blocked writing the moment it was told - so the
            // refusal is the hold, not the disk, and the disk is not what the next
            // attempt is waiting for. It is waiting for the person: written down as
            // such, and re-run when they acknowledge. Named as a full disk it was
            // waited out by nobody, and told nobody the truth.
            if (typeof farkadWritesBlocked === 'function' && farkadWritesBlocked()) {
                this._heldSnapshot = true;
                this.fail(new Error('the arriving record is held until a person has '
                    + 'looked at it; it was not adopted'));
                return;
            }
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

        // AND THE EVIDENCE THIS PHONE WAS ALREADY HOLDING, for the same reason and in the
        // same place.
        //
        // normaliseSchedule reports what the SNAPSHOT carries, and it runs before the
        // merge - so an entry this device had held aside, which the arriving document
        // knows nothing about, was carried back by mergeLedgerInto and then never
        // mentioned. The device adopted a document, said synced, and went on writing with
        // unreadable financial bytes on its own disk that nothing had reported since the
        // session that found them.
        //
        // Told after the persist, like the clash above: Recovery blocks writing the
        // moment it is told, and telling it first would refuse the write that puts the
        // evidence somewhere a person can reach it.
        const heldAside = Object.keys((State.schedule.ledger || {}).unreadable || {})
            .length + Object.keys((State.schedule.ledger || {}).unreadableMigrations || {})
            .length;
        if (heldAside > 0 && typeof Recovery !== 'undefined') {
            Recovery.damaged('scheduleData:v2:ledger',
                JSON.stringify({
                    unreadable: State.schedule.ledger.unreadable,
                    unreadableMigrations: State.schedule.ledger.unreadableMigrations
                }),
                'חלק מהיסטוריית המקדמות לא נקרא. הנתונים נשמרו כמו שהם ולא נמחק דבר, '
                + 'אבל אי אפשר לרשום עוד עד שתייצא גיבוי - כדי שלא ייחשב סכום שלא הצלחנו לקרוא.');
            // AND ONLY WHILE IT ACTUALLY BLOCKS. The entry is carried on this disk for
            // ever, by design, so this count is above zero on every snapshot for the rest
            // of the phone's life - including after the person has exported and
            // acknowledged, when the report above is deduplicated and writes have
            // resumed. Returning here regardless made every later snapshot an 'error'
            // (the same line a tunnel produces, while the cloud provably held this
            // phone's writes), and skipped the daily restore point, the identity repairs
            // and the post-snapshot flush below it, every time. honestStatusFor already
            // refuses 'synced' while writes are blocked; the return is for that case
            // alone. Measured in tests/status.test.mjs.
            if (typeof farkadWritesBlocked === 'function' && farkadWritesBlocked()) {
                this._heldSnapshot = true;
                this.fail(new Error('part of the advances history could not be read'));
                return;
            }
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
        // What was put back, so the acknowledgement that retires one of these can tell
        // that the screen is showing the queue's value there and not the snapshot's.
        return pending.map(([path]) => String(path));
    },
});

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

            // ledger.migrations.<approval id>. The same rule, for the same reason, and
            // it was missing: an approval still in the outbox was dropped by the first
            // snapshot to arrive from another phone, and the person was asked to approve
            // the migration again while their own approval was on its way out. An
            // approval is never removed either - recordCarryApproval refuses to overwrite
            // one, so a snapshot that has not heard of it has not disagreed with it.
            if (parts.length === 3 && parts[0] === 'ledger' && parts[1] === 'migrations') {
                if (value === null) return;
                schedule.ledger = schedule.ledger || { advances: {} };
                schedule.ledger.migrations = schedule.ledger.migrations || {};
                schedule.ledger.migrations[parts[2]] = value;
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

    // Nor is an approval, and without this the queue could never see one land: the edit
    // stayed pending against a document that already held it, and the device went on
    // retrying it for as long as it was open.
    if (parts.length === 3 && parts[0] === 'ledger' && parts[1] === 'migrations') {
        if (value === null) return true;
        const approvals = (schedule.ledger || {}).migrations || {};
        return Object.prototype.hasOwnProperty.call(approvals, parts[2])
            && same(approvals[parts[2]], value);
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
