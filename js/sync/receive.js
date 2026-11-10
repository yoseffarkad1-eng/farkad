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

// The highest revision this device has ADOPTED, kept where a reopen can find it. See
// loadRevision: in memory alone it was forgotten the moment the app closed, and a
// forgotten revision reads as "never seen one", which is the single state that makes a
// document without a revision adoptable.
const REVISION_KEY = 'farkad:revision';

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
    //
    // TWO SINCE v175, and the number is what the rules read. Nothing in the envelope
    // changed shape: a build that says 2 is saying "I keep the pay book" - it carries
    // `pay` through every whole-document write and never rewrites an entry of it. The
    // rules (firestore.rules, payGuard) let only such a build change that map, which is
    // what turns "no phone on an older build may restore" from a promise into a refusal.
    // Every other write of an older build - protocol 1 - is accepted exactly as before.
    PROTOCOL: 2,
    _revision: null,

    // THE REVISION THIS DEVICE HAS ADOPTED SURVIVES THE APP BEING CLOSED.
    //
    // It used to live only here, in memory. A reopen therefore started at null - "this
    // device has never seen a revision" - which is the one state that makes a document
    // WITHOUT a revision adoptable. So the F5 repair held only until the app was closed:
    // the next open would take a legacy delivery and put the record back to whatever it
    // carried, exactly as before. A guard that forgets is not a guard.
    //
    // Its own key, written by whoever adopts, read before the first delivery can arrive.
    // A device that genuinely has never seen one finds nothing here and keeps null - the
    // legacy transition is untouched, which is the whole reason the field is nullable.
    _revisionLoaded: false,

    // Read once at the start of a session, and re-read whenever the question is asked
    // again with `fresh` - which is what the adoption test does, because another window
    // of this app may have heard more since. The session cache is kept for the hot path
    // (every delivery asks), and the one decision that must not be made on a stale number
    // asks for the disk. See rememberRevision.
    loadRevision(fresh) {
        if (this._revisionLoaded && !fresh) return this._revision;
        this._revisionLoaded = true;
        let stored = null;
        try { stored = Store.durableGet(REVISION_KEY); } catch (error) { stored = null; }
        const said = stored === null || stored === undefined ? NaN : Number(stored);
        // Only a whole number counts. Anything else is treated as "never seen one",
        // which is the direction that keeps a pre-protocol project working rather than
        // the one that would cut it off.
        if (Number.isInteger(said) && said >= 0) this._revision = said;
        return this._revision;
    },

    // MONOTONIC AT THE DISK, not only in this window's memory.
    //
    // v163 wrote String(said) unconditionally, and loadRevision cached for the session
    // behind _revisionLoaded. Both together are a way back down: window A reaches 9 and
    // writes it; window B read 7 when it opened and never looks again; B adopts a
    // snapshot at 8 and writes 8 OVER 9. The next window to open then presents itself to
    // the cloud as a device that is behind, and the key exists precisely so that it does
    // not. The server cannot be talked into this - firestore.rules' nextRevision()
    // requires exactly one more, and legacyWrite() is gated on noRevisionYet() - so this
    // key was the only place the shared number could go backwards. Measured in
    // tests/codex3.probes.test.mjs, D6.
    //
    // The read also HEALS the stale cache: a number on the disk higher than this window's
    // is adopted into memory, which is the honest answer to "another window has heard
    // more recently than I have".
    rememberRevision(said) {
        if (!Number.isInteger(said) || said < 0) return;
        let held = null;
        try { held = Store.durableGet(REVISION_KEY); } catch (error) { held = null; }
        const onDisk = held === null || held === undefined ? NaN : Number(held);
        if (Number.isInteger(onDisk) && onDisk >= said) {
            // Somebody else has been further. Take their number rather than our own, and
            // write nothing: the disk is already right and a write could only lower it.
            if (onDisk > (this._revision === null ? -1 : this._revision)) this._revision = onDisk;
            return;
        }
        try { Store.setVerified(REVISION_KEY, String(said)); }
        catch (error) {
            // A revision that cannot be written down is still the one in memory for this
            // session. What is lost is its survival of a reopen, and the next adoption
            // will try again.
        }
    },
    // How many deliveries were older than a document this device had already been shown.
    // Counted rather than merely dropped: a listener that keeps handing back the past is
    // worth seeing in the diagnostic, and a count is the only honest way to notice it.
    _staleSnapshots: 0,
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
    //
    // `roster.*` IS NOT A KEY ON THE DISK. A schedule this app saves carries
    //
    //     advances, days, ledger, places, schemaVersion, updatedAt, updatedBy, vehicles, workers
    //
    // and nothing named `roster`: the roster lives in the two arrays. `roster.<kind>.<id>`
    // is the WIRE shape. So readPath walks a key that is not there, the operation is
    // written down as having seen NOTHING, and the provenance is false at the moment it
    // is journalled - see rosterMarkFromArrays for what that costs.
    storedMarkAt(path, stored) {
        if (stored.raw === null) return VALUE_ABSENT;
        if (!stored.schedule) return null;
        const direct = readPath(stored.schedule, path);
        if (direct !== undefined) return valueMark(direct);
        const carried = this.rosterMarkFromArrays(path, stored);
        if (carried !== undefined) return carried;
        return valueMark(direct);
    },

    // THE SAME FACT, WHERE AN UPGRADED DISK ACTUALLY KEEPS IT.
    //
    // Measured on c7afe7f: a disk whose roster is only in the arrays - every disk this
    // build opens that was written before the keyed map existed, and every disk that has
    // not yet adopted a snapshot - records a per-field roster write with seen: ["absent"]
    // while `places[0].name` on that same disk says "site". The first snapshot then
    // arrives holding "site", movedUnder finds the server's mark outside the operation's
    // seen list, reads it as another phone's correction this device has never seen, and
    // holds the write. The person's rename is stranded for ever, the phone says
    // «contested», and nothing anywhere is actually wrong except the record of what the
    // device had seen.
    //
    // This is the mirror of O2 and it must not be fixed by loosening the rule that closed
    // O2. Treating every absent keyed path as seen would let a genuinely stale value, or
    // an invented field, walk over another phone's edit - which is the failure O2 was.
    // So the fallback answers only when this device can prove it holds the fact:
    //
    //   the path is a roster entity or one of ITS OWN declared fields (ENTITY_FIELDS,
    //   the same list the wire validator uses, so the two cannot drift apart);
    //   the id is a safe segment;
    //   the keyed map does not already say something - a tombstone there is read by
    //   readPath above and is never inherited from the array underneath it;
    //   the entity is REALLY in the durable roster. A missing one is not synthesized
    //   from a fragment, so a new person still travels as a whole entity and a phone
    //   that has never heard of somebody still records that it has not;
    //   and the record reads. One that does not answers null - contributes nothing,
    //   which leaves the write held. Fail-closed, deliberately: a wrong "seen" loses
    //   somebody's edit to another phone, and that is worse than a hold somebody can see.
    //
    // Returns undefined for "no opinion, use the direct read".
    rosterMarkFromArrays(path, stored) {
        const parts = String(path).split('.');
        if (parts[0] !== 'roster') return undefined;
        if (parts.length !== 3 && parts.length !== 4) return undefined;
        const kind = parts[1];
        if (kind !== 'workers' && kind !== 'places') return undefined;
        const id = parts[2];
        if (typeof isSafeSegment !== 'function' || !isSafeSegment(id)) return undefined;
        if (parts.length === 4) {
            const known = (typeof ENTITY_FIELDS === 'object' && ENTITY_FIELDS
                && ENTITY_FIELDS[kind]) || [];
            if (known.indexOf(parts[3]) === -1) return undefined;
        }
        const index = this.durableRosterIndex(stored);
        if (index === null) return null;
        const entity = index[kind] && index[kind][id];
        if (!entity) return undefined;
        return parts.length === 3 ? valueMark(entity) : valueMark(entity[parts[3]]);
    },

    // The durable roster, normalised and keyed, cached against the exact bytes it was
    // built from. Normalised because that is the footing the wire uses: editRoster sends
    // entities out of State.schedule, which is always normaliseSchedule's output, so a
    // mark built any other way would not match the one the server holds and the fallback
    // would silently do nothing. Null when the record will not normalise.
    durableRosterIndex(stored) {
        if (this._durableRoster && this._durableRoster.raw === stored.raw) {
            return this._durableRoster.index;
        }
        let index = null;
        try {
            const normal = normaliseSchedule(stored.schedule);
            // Object.create(null), not {}.
            //
            // A plain object answers `index.workers['toString']` with a Function, and the
            // guard this index exists for - `if (!entity) return undefined`, the line that
            // makes "the entity is REALLY in the durable roster" true - is satisfied by a
            // method inherited from Object.prototype. Six ids do it: toString, valueOf,
            // hasOwnProperty, isPrototypeOf, toLocaleString, propertyIsEnumerable. The
            // mark then built is a fact about a worker nobody ever recorded, written into
            // an operation as something this device has held - where the same path under
            // an id that is merely unknown correctly records `absent` and is held.
            //
            // isSafeSegment stops __proto__, prototype and constructor, and it should not
            // have to carry the rest. A null-prototype object has nothing to inherit, so
            // the question cannot be asked wrongly rather than being asked and defended.
            const byId = list => {
                const out = Object.create(null);
                (list || []).forEach(item => {
                    if (item && item.id) out[String(item.id)] = item;
                });
                return out;
            };
            index = { workers: byId(normal.workers), places: byId(normal.places) };
        } catch (error) {
            index = null;
        }
        this._durableRoster = { raw: stored.raw, index };
        return index;
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
    //
    // A RIMA COUNT THIS DEVICE MAY ALREADY HAVE PUT ON THE SERVER (v166) is where a
    // 'nothing' in that list can be wrong about the present. A count's clear is a deleted
    // field, so once an earlier count here was handed over - its answer lost, or answered
    // with its snapshot not yet heard - the nothing that count was built on, and a
    // snapshot from before it landed, say what the server held BEFORE it; the server's
    // nothing now can be another phone's clear of it. Read as this device's own, that
    // nothing sent a correction over the clear, or a moved count back to the old site,
    // with both phones saying synced. So for a count `options.handedOver` keeps the
    // inherited nothing out, and a base below a revision an unanswered attempt claimed
    // keeps its nothing out too - unless `options.decided`: the person is answering a
    // held row in ⋯, looking at the cloud's side, and the base is what they saw.
    seenMarksAt(path, held, previous, options) {
        const marks = [];
        const add = mark => {
            if (typeof mark === 'string' && mark !== '' && marks.indexOf(mark) === -1) {
                marks.push(mark);
            }
        };
        const said = options || {};
        const rima = isRimaFieldPath(path);
        const inherit = mark => {
            if (rima && said.handedOver && mark === VALUE_ABSENT) return;
            add(mark);
        };
        add(held);
        if (this._baseDoc !== null) {
            const mark = valueMark(this.baseValueAt(path));
            if (!(rima && mark === VALUE_ABSENT && !said.decided && this.baseBelowAttempt(path))) {
                add(mark);
            }
        }
        if (previous) {
            if (Array.isArray(previous.seen)) previous.seen.forEach(inherit);
            else if (typeof previous.base === 'string') inherit(markOfRecorded(previous.base));
            add(valueMark(previous.value));
        }
        return marks;
    },

    // Is the base older than an attempt at a count's `path` that has not been answered?
    // A write lands at the revision it claims, so a base at or above every such claim
    // carries the write or something after it; one below may be from before it.
    baseBelowAttempt(path) {
        if (this._baseDoc === null || !isRimaFieldPath(path)) return false;
        const claim = this.claimAt(path);
        if (claim === null) return false;
        const revision = Number(this._baseDoc.revision);
        return !(Number.isSafeInteger(revision) && revision >= claim);
    },

    // Has somebody else changed what `document` holds at `path` since the values this
    // operation was built on? The pre-send half of the conflict rule: the same question
    // contestedPaths asks of a refusal's document, asked of the last snapshot BEFORE the
    // write leaves, because a phone that comes back, hears the winner and only then
    // flushes is refused by nothing - its revision is current - and the collision it is
    // about to lose already happened while it was away.
    movedUnder(item, path, document, mayHaveLanded) {
        // Nothing heard: nothing to compare against, and nothing to decide here. The
        // write goes out against no revision, the server answers with its document, and
        // the conflict branch asks this question of that answer.
        if (!document || typeof document !== 'object') return false;
        const rima = isRimaFieldPath(path);
        // A COUNT, AND A BASE OLDER THAN THIS DEVICE'S OWN UNANSWERED ATTEMPT AT IT (v166).
        // That base cannot say what the server holds now - the attempt may have landed
        // after it - so it decides nothing, exactly like no base at all: the write claims
        // the revision this device last adopted, a landed attempt has moved past it, and
        // the conflict branch asks the question of the server's own document.
        if (rima && document === this._baseDoc && this.baseBelowAttempt(path)) return false;
        const marks = marksOf(path, readPath(document, path));
        // A path the server holds nothing at is not a path anybody's record is lost on.
        // Two phones reaching an empty project are the ordinary case: one creates the
        // document, and the other's evening - on the days the first never wrote - goes.
        //
        // EXCEPT A RIMA COUNT (v166), whose clear IS nothing there: setRimaCount deletes the
        // field where a worker-day clear leaves a placeholder value. At a count's path the
        // server's nothing can be another phone's deliberate clear, and waving it through
        // sent a count changed offline straight over it - the cloud said 4 where somebody
        // had decided nobody came, a count moved to the right site was billed at both, and
        // every phone said synced. For a count the seen marks below decide, as they do for
        // any value: a write built on having seen nothing there - a new count, one typed
        // after the clear arrived - still goes, and so does this phone's own clear, which
        // is the same nothing.
        if (marks[0] === VALUE_ABSENT && !isRimaFieldPath(path)) return false;
        // Nor is a path the server already holds THIS VALUE at. An earlier attempt whose
        // answer was lost landed it, and the retry is answered from its receipt; or
        // another phone recorded the same thing. Either way, sending it changes nothing
        // and loses nothing - and holding it left a phone owing a day the cloud had.
        if (marks.indexOf(valueMark(item.value)) !== -1) return false;
        if (Array.isArray(item.seen)) {
            // A COUNT HANDED TO THE CLOUD BEFORE ITSELF, and not being sent again under its
            // own name (v166). What it had seen is what the server held before that attempt;
            // if the attempt landed, the nothing there now is somebody's clear of it. (One
            // that only supersedes such an attempt left that nothing out when it was made -
            // see seenMarksAt - so whatever nothing it carries is one it did see.) See
            // TRY_MARK in js/sync/sync.js.
            const handed = typeof mayHaveLanded === 'function'
                ? mayHaveLanded(item) : this.triedNameFor(item) !== null;
            const seen = rima && handed
                ? item.seen.filter(mark => mark !== VALUE_ABSENT) : item.seen;
            return !marks.some(mark => seen.indexOf(mark) !== -1);
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
        // What a reopen left behind counts as "already shown", so the comparison below is
        // made against the highest this device has ever adopted rather than the highest
        // it has adopted since the app was last opened.
        this.loadRevision();
        // A SESSION HOLDING NO DOCUMENT TAKES THIS ONE, even at the number it already
        // remembers.
        //
        // The monotonic test compares revisions, and that was exact while the revision
        // lived only in memory: a session that knew a number had, by construction,
        // adopted the document the number came from. Remembering the number across a
        // reopen broke that pairing. The reopened session knew revision N and held no
        // document at all, so the first delivery - the current one, at exactly N - failed
        // `said > _revision` and was not adopted; `_baseDoc` stayed null, which every
        // pre-send hold reads as "nothing heard, nothing to compare"; and the queued write
        // nobody had decided about went out over the other phone's correction on the first
        // flush. Measured in tests/contested.test.mjs, which is the record of that send.
        //
        // An EQUAL revision is not a delivery from behind - it is the document as it
        // stands - so adopting it lowers no base. The cached-first hazard the paragraph
        // above exists for is a delivery at a LOWER number, and that is refused here
        // exactly as it was.
        const unbased = this._baseDoc === null && said === this._revision;
        if (this._revision === null || said > this._revision || unbased) {
            this._revision = said;
            this.rememberRevision(said);
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
                    // A count first handed over under ANOTHER name (v166) may be on the
                    // server already, and the nothing it was built on is not evidence that
                    // a nothing there now is its own - see movedUnder. Under THIS name a
                    // refusal is itself the proof that the batch never landed: the server
                    // answers a batch it has from the receipt, before any revision.
                    const name = isRimaFieldPath(path) ? this.triedNameFor(queued) : null;
                    const elsewhere = name !== null && name !== String(opId);
                    this._sendBase[path] = {
                        seen: elsewhere ? queued.seen.filter(mark => mark !== VALUE_ABSENT)
                            : queued.seen.slice(),
                        own: true
                    };
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
        // A count's attempt rebased: the revision it may land at has moved - see TRY_MARK.
        this.noteClaimed(patch);
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
        const ledger = typeof ledgerProblems === 'function' ? ledgerProblems(raw) : [];
        Object.keys(raw.days || {}).forEach(date => {
            const runs = (raw.days[date] || {}).vehicleRuns;
            if (runs === undefined) return;
            if (!isPlainObject(runs) || Object.keys(runs).some(id => !isSafeId(id)
                || (runs[id] !== null && vehicleRunProblems(runs[id]).length > 0)))
                ledger.push('רישום נסיעת רכב אינו תקין.');
        });
        // A RIMA COUNT this build cannot read (v166), refused on the same terms and for
        // the same reason as a vehicle run: it is what the other company is billed from,
        // and normaliseSchedule carries it as it arrived - so adopting it would put on
        // this disk a record dayProblems refuses at the next open, and the phone would
        // open held over a number. Refused here, the snapshot is kept whole as evidence
        // and nothing on the device is replaced. Only v166 and later write this layer,
        // through journalEntryProblems, so this is a guard against a future build or a
        // hand edit, not a state the app produces.
        if (typeof rimaWireProblems === 'function') {
            rimaWireProblems(raw).forEach(problem => ledger.push(problem));
        }
        if (ledger.length > 0) {
            // Keep the whole snapshot: valid payments beside the malformed one are
            // evidence too, and none of this snapshot may replace the good local record.
            Recovery.evidence('farkad:refusedSnapshot', JSON.stringify(raw),
                'נתונים מהענן לא נקלטו בגלל רישום כספי שאינו תקין. ייתכן שחסרות כאן תנועות. '
                + 'עותק מלא נשמר לייצוא חילוץ ולבדיקה; הנתונים במכשיר לא הוחלפו.');
            this.fail(new Error('unreadable cloud ledger; complete snapshot retained for review'));
            return true;
        }
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

        // A DOCUMENT OLDER THAN ONE THIS DEVICE HAS ALREADY BEEN SHOWN IS NOT ADOPTED.
        //
        // noteRevision above has refused to LOWER the write base since the cached-first
        // suite proved a stale base gets every later write refused. Nothing did the same
        // for the RECORD. receive() replaced State.schedule with whatever turned up, and
        // reapplyPending puts back only what the cloud has NOT acknowledged - so an edit
        // that had LANDED was reverted on the screen by any later delivery of an older
        // document, with the line still saying «מסונכרן».
        //
        // That is not a race between two people. Firestore delivers a cached snapshot
        // before the server's and the cached one can be behind - the comment above
        // noteRevision says so in this repository's own words - and the same shape
        // arrives when a listener reconnects after a resume and when a write's own echo
        // is delivered late. One phone, one cloud, one late delivery: the move goes back
        // to the site it came from, the person does it again, it lands, and the next
        // delivery takes it off again. Measured in tests/snapshot.stale.test.mjs.
        //
        // STRICTLY older, and only when the arriving document says what it is: equal is
        // the same document delivered twice and is adopted as before, and a document
        // with no revision at all is a phone that has not reached the protocol, which
        // this must not cut off. Nothing else is skipped and nothing is thrown away: the
        // document is not adopted, the queue is untouched, the status is left exactly as
        // the last real snapshot set it, and `_latestRaw` keeps the NEWER document so
        // the held-snapshot replay and readoptAfter still have the right one to re-run.
        // A DOCUMENT WITH NO REVISION AT ALL IS THE SAME HAZARD, and it walked past this
        // guard because the guard asked for an integer before it asked anything else.
        //
        // Once this device has been shown a revision it is past the protocol, and every
        // document the cloud holds from then on carries one. A delivery with the field
        // missing is a cached copy from before the cutover, or a write by a phone that
        // has not reached the protocol - and adopting it undoes, in one delivery,
        // everything this device has accepted since. The symptom is the stale one
        // exactly: the move goes back to the site it came from.
        //
        // THE LEGACY PATH STAYS OPEN where it is still the truth. A device that has never
        // seen a revision has `_revision === null`, and for it a document without one is
        // the only kind there is; nothing about that case changes here.
        const said = Number.isInteger(raw.revision) ? raw.revision : null;
        // Read off the disk if this session has not been told one yet - a reopen must not
        // present itself to a legacy document as a device that has never seen a revision.
        this.loadRevision();
        if (this._revision !== null && (said === null || said < this._revision)) {
            this._staleSnapshots += 1;
            // A delivery is still a sighting of the cloud, and the barrier it opens is
            // what sends anything this device still owes.
            this.noteCloudHeard();
            return;
        }

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
            if (State.schedule.workers.length > 0) this.editRoster(State.schedule, null, { whole: true });
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
        if (!this.sanitiseQueuedRosters(gone, remote)) {
            this.holdStaleRoster(gone, remote);
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
            if (State.schedule.workers.length > 0) this.editRoster(State.schedule, null, { whole: true });
            this.setStatus('synced');
            this.archiveDaily(State.schedule);
            if (this.pendingCount() > 0) this.scheduleFlush();
            return;
        }

        // This device's own write, echoed back. Both halves are needed: the timestamp
        // alone said "somebody wrote at this instant", and after this device adopted
        // another phone's document that was a stamp it did not own - so the next write
        // from THAT phone looked like an echo of this one and was skipped.
        //
        // AND THE SAME RIMA COUNTS (v166). The stamps say who wrote last, not what this copy
        // holds. A phone that wrote last on v145 or v165 carries that build's copy - which
        // never kept `rima` - under exactly the cloud's stamps, so when it updated, its
        // first snapshot was skipped as an echo: no count on the screen while the line said
        // synced, and the day's cloud copy below written without them, until another phone
        // happened to write. Where the counts differ the snapshot is adopted like any other.
        //
        // EXCEPT WHERE THIS COPY HOLDS A COUNT THE QUEUE STILL OWES - unsent, or held for a
        // person. There this copy differs from the cloud by design, and adopting changes
        // nothing at those sites: the owed value is laid straight back over the snapshot
        // (reapplyPending). Compared, a held count made every echo of this phone's own
        // saves differ, and each one was adopted - two redraws a save, under the finger of
        // somebody typing the next site's count, for as long as the hold stood.
        //
        // AND ONLY WHILE THIS COPY SHOWS WHAT IS OWED. A copy that has lost the count - an
        // older build's window writing the shared disk, the price of keeping counts out of
        // the kept ring - was looked away from all the same, so the snapshot that would
        // have laid it back was skipped as this phone's echo: the held count gone from the
        // screen and the Rima table, the line saying contested over nothing visible, until
        // somebody decided it in ⋯ or the other phone wrote.
        const owed = this._outbox;
        const owes = (date, placeId) => {
            const item = owed.get(`days.${date}.rima.${placeId}`);
            if (!item || item.sent) return false;
            const wanted = isRimaCount(item.value) ? item.value : 0;
            return rimaCount(State.schedule, date, placeId) === wanted;
        };
        //
        // AND NOTHING IN THE PAY BOOK THIS COPY LACKS (v173) - the same trap, one map
        // over. A phone that wrote last on v171 or earlier carries that build's copy,
        // which never kept `pay`, under exactly the cloud's stamps; opened on this build
        // its first snapshot read as its own echo and was skipped, so a closure and a
        // payment another phone had recorded were on no screen of this one while the
        // line said synced - until somebody else happened to write. Measured against
        // v167, v169 and v171 in tests/paybook.oldbuilds.test.mjs. Asked one way only:
        // an entry THIS copy holds and the snapshot does not is this phone's own unsent
        // work, which is what an echo looks like, and adopting changes nothing about it.
        if (remote.updatedAt === State.schedule.updatedAt
            && remote.updatedBy === syncDeviceId()
            && sameRimaLayers(remote, State.schedule, owes)
            && (typeof paybookCovers !== 'function' || paybookCovers(State.schedule, remote))) {
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
        // THE PAY BOOK, UNIONED (v173) - append-only against the other phones exactly as
        // the ledger is. A snapshot from a phone that has not updated carries no `pay`
        // at all, and that is a phone that has never heard of one, not one that has
        // removed it: nothing this device holds leaves. See paybookUnion.
        //
        // THE CLOUD'S COPY STANDS where the two disagree about an id, and this phone's
        // is kept beside it under `payConflicted` - on the record, so it survives the
        // persist below and every reopen. Nothing is told to Recovery and nothing stops:
        // both bodies are readable, the fold counts the one every other phone counts,
        // the planners refuse that man, and the queued write that lost is held by the
        // pre-send pass (replacesWhole) and listed in ⋯ like any contested write. The
        // ledger half of the same disagreement, if there is one, is the block above this
        // one and stops the device exactly as it always has.
        if (typeof layPaybookUnion === 'function') {
            layPaybookUnion(State.schedule, remote, previous);
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
            this.editRoster(State.schedule, null, { whole: true });
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
    sanitiseQueuedRosters(gone, remote) {
        const buried = gone && (gone.workers.size > 0 || gone.places.size > 0);
        // `remote` arrived at v104 and the two passes below are one job: making the queue
        // agree with what has just been heard. A tombstone is one way the queue can be
        // out of date about a man; his WAGE is the other, and the second one costs money.
        if (!buried && !remote) return true;
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
        // AND THE SECOND WAY THE QUEUE CAN BE OUT OF DATE: A STALE WAGE.
        //
        // The whole array is this device's opinion of the ENTIRE roster, so it carries
        // every man this device has not reconciled - not only the one the person touched.
        // Measured on c7afe7f: A opens on an upgraded disk holding the man at 500, renames
        // a SITE, and the array goes out with him at 500 in it. Every v79+ reader takes
        // the keyed map and converges on 600, so nothing looks wrong; the document's own
        // array is left saying 500, which is the one place the reader it exists for looks.
        //
        // Which ids this device is actually speaking about, so its own edit is never
        // overwritten by the thing meant to correct somebody else's copy. A per-entity or
        // per-field write for a man IS this device's opinion of him and stands.
        const speakingFor = { workers: new Set(), places: new Set() };
        this.projectedQueue().forEach((item, path) => {
            const parts = String(path).split('.');
            if (parts[0] !== 'roster' || (parts.length !== 3 && parts.length !== 4)) return;
            if (parts[1] !== 'workers' && parts[1] !== 'places') return;
            speakingFor[parts[1]].add(String(parts[2]));
        });

        const heardEntity = (kind, id) => {
            if (!remote) return null;
            const found = (remote[kind] || []).find(item =>
                item && String(item.id) === String(id));
            return found || null;
        };

        // ONE CORRECTION PER PATH. An operation may only supersede one on the SAME path -
        // decodeQueue enforces that on the bytes - so the two passes are folded into a
        // single value per path rather than each minting its own.
        const corrections = [];
        this.projectedQueue().forEach((item, path) => {
            const kind = listedKind(path);
            if (!kind || !Array.isArray(item.value)) return;
            const removed = (gone && gone[kind]) || null;

            let next = item.value;
            if (removed && removed.size > 0) {
                // An array of records, or an array of bare ids - the same question either
                // way: is this the man the document says is gone?
                next = next.filter(entry => {
                    const id = entry && typeof entry === 'object' ? entry.id : entry;
                    return !removed.has(String(id));
                });
            }
            // The order list is bare ids and carries no wage, so there is nothing here to
            // refresh - it is only ever shortened by the pass above.
            if (remote) {
                next = next.map(entry => {
                    if (!entry || typeof entry !== 'object' || !entry.id) return entry;
                    const id = String(entry.id);
                    if (speakingFor[kind] && speakingFor[kind].has(id)) return entry;
                    const heard = heardEntity(kind, id);
                    if (!heard) return entry;
                    return canonicalJson(heard) === canonicalJson(entry) ? entry : heard;
                });
            }
            const changed = next.length !== item.value.length
                || next.some((entry, at) => entry !== item.value[at]);
            if (changed) corrections.push({ path, value: next });
        });

        // AND THE WRITE THAT NAMES HIM ON HIS OWN.
        //
        // The lists are not the only queued opinion of a removed man. A whole-entity write
        // for him - `roster.workers.w_01` with a record in it - lands straight on top of
        // the null the tombstone is, and since v104 so does one FIELD of him: Firestore
        // stores `roster.workers.w_01.phone` by replacing that null with `{ phone: … }`.
        // Either way the tombstone is gone from the document, and the tombstone is the
        // only thing telling the third phone - which still has him in its own stale whole
        // array - that he was removed. Merged against that array, the record or the
        // fragment stands him back up, with every day and every shekel recorded against
        // him back in the report.
        //
        // So this device's queued opinion of him becomes the one it has just heard: gone.
        // No more an invention than the sanitised array is - the same sentence, about one
        // man rather than about a list.
        //
        // TWO SHAPES, TWO MECHANISMS, because an operation may only supersede one on the
        // SAME path - decodeQueue enforces that on the bytes, and it is right to: naming
        // an operation on another path suppresses work that was never replaced.
        //
        //   the whole-entity write is corrected AT ITS OWN PATH, to the tombstone. One
        //   ordinary operation, superseding the one it replaces, exactly as the arrays are.
        //
        //   a field write has no such correction to make - every value that could go in it
        //   stands the man back up, a null included, because Firestore stores
        //   `roster.workers.w_01.phone = null` by replacing the tombstone with a record.
        //   So it is RETIRED instead: the mark that says an operation lost, written to its
        //   own key, which is how every other defeated operation in this queue is put out
        //   of the way. The field the person typed is discarded with him, which is the
        //   same thing the sanitised whole array does and for the same reason.
        //
        // If the work says otherwise, the work still wins: a man with a day behind him is
        // reinstated by reinstateReferenced and written back whole by the repair at the
        // foot of receive(), which is minted after this and supersedes it in turn.
        const standingUp = new Set();
        const retiring = [];
        this.projectedQueue().forEach((item, path) => {
            const parts = String(path).split('.');
            if (parts[0] !== 'roster') return;
            if (parts.length !== 3 && parts.length !== 4) return;
            const kind = parts[1];
            if (kind !== 'workers' && kind !== 'places') return;
            if (!gone[kind] || !gone[kind].has(String(parts[2]))) return;
            if (parts.length === 4) { retiring.push(item); return; }
            // A tombstone already queued for him says exactly what this would say.
            if (item.value === null) return;
            standingUp.add(`roster.${kind}.${parts[2]}`);
        });
        standingUp.forEach(path => corrections.push({ path, value: null }));

        // The marks go first. A correction that landed while a resurrecting field write
        // stayed live would be a queue that says two things about one man, and the field
        // write is the one that reaches the document last.
        let retired = true;
        retiring.forEach(item => {
            const key = outboxBeatKey(item.slot, item.opId);
            if (Store.durableGet(key) === ACK_VALUE) return;
            if (Store.setVerified(key, ACK_VALUE)) return;
            Store.forget(key);
            retired = false;
        });
        if (!retired) return false;

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
        // A pay book operation left in doubt by a reload or a lost signal can be
        // settled now - by looking, never by sending again. js/sync/transact.js.
        if (typeof this.payCloudHeard === 'function') this.payCloudHeard();
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
    // THE OTHER HALF OF THE JOB, held with it.
    //
    // This used to store `gone` alone. `sanitiseQueuedRosters` does two things - it drops
    // people the document buried, and it REFRESHES the value of people it did not - and
    // only the first half was remembered. So a retry called it with `remote === undefined`
    // and hit its own first line, `if (!buried && !remote) return true;`, which in the
    // ordinary shape of this failure (a raised wage, nobody removed) is every time: no
    // tombstones, no remote, "nothing to do". The hold was released, noteCloudHeard() was
    // recorded, and the queue flushed the array it had never been cleaned of.
    //
    // What that costs: B raises a man 500 -> 600, A holds an upgraded disk whose queued
    // legacy `workers` array still says 500, one refused journal write takes the hold, and
    // a moment later A writes 500 back into the document and calls itself synced. The
    // keyed map keeps 600 and the whole array - the one place a v78 reader looks - says
    // 500. That is the exact failure the `remote` pass was added to close, reached one
    // refused write later.
    //
    // `_staleRoster` being a truthy object of two empty sets was the smell: a hold that
    // carried no information about what it was holding.
    _staleRemote: null,

    holdStaleRoster(gone, remote) {
        this._staleRoster = gone;
        this._staleRemote = remote || null;
        this.fail(new Error(
            'a queued roster could not be cleaned of a removed worker; it is held back'));
        this.scheduleRetry();
    },

    releaseStaleRoster() {
        this._staleRoster = null;
        this._staleRemote = null;
    },

    // Tried again from the retry ladder, with no second snapshot needed: the tombstones
    // were learned once and are remembered until the rewrite lands.
    staleRosterHeld() {
        if (!this._staleRoster) return false;
        if (this.sanitiseQueuedRosters(this._staleRoster, this._staleRemote)) {
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
        // AND NOT A CONFLICT WITH THIS DEVICE'S OWN OTHER WINDOW. See holdIsLocal: the
        // other side of that one is on this disk already, so putting our undecided value
        // back on top and persisting it - which is what this function's caller does next
        // - writes it over the answer the other window wrote. The third replay path, and
        // the one that was missed: the journal replays were taught to withhold a held
        // operation and this was not, so the value nobody had agreed to reached the record
        // by way of a snapshot. Measured in tests/codex3.probes.test.mjs, D3.
        const pending = [...this._outbox.entries()]
            .filter(([, item]) => !item.sent)
            .filter(([, item]) => !this.heldAgainstOwnDisk(item))
            .sort((a, b) => a[1].seq - b[1].seq);

        // Which lists already have a per-person edit waiting. The legacy whole-array
        // entry is queued next to them and would otherwise be applied last and undo them.
        const perEntity = new Set();
        pending.forEach(([path]) => {
            const parts = path.split('.');
            // Both per-person shapes count: the whole entity, and one field of it. A
            // queue holding only `roster.workers.w_01.phone` is still a queue that has
            // spoken for the workers list, and the legacy array beside it must not undo
            // it at boot replay, where this same set is what stops it.
            if (parts[0] === 'roster' && (parts.length === 3 || parts.length === 4)) {
                perEntity.add(parts[1]);
            }
        });

        pending.forEach(([path, item]) => {
            // THE LEGACY WHOLE ARRAY IS NEVER LAID BACK OVER AN ADOPTED SNAPSHOT.
            //
            // `perEntity` above was meant to stop exactly this and only half does: it
            // fires when a per-person edit for the SAME list is waiting, so renaming a
            // SITE leaves the queued `workers` array unguarded. Measured: B raises a
            // man's rate to 600 and it lands; A - which has already adopted a snapshot,
            // so the memory baseline everyone blamed is present and correct - renames a
            // site; A adopts 600 and this loop puts its own pre-snapshot `workers` array
            // straight back on top. A holds 500, B and the cloud hold 600, and it
            // survives A's reopen. A's next ordinary roster edit then finds its w_01
            // differing from the baseline and sends 500 to everybody, where the map
            // outranks the array in mergeRoster. All three converge on the stale value
            // and nothing on any screen says so. A day recorded on A in between is
            // stamped at 500 while the man is paid 600 - law 2 reached from the wrong end.
            //
            // The array carries nothing this queue does not already carry per person:
            // every real roster change also queues `roster.<kind>.<id>`, the order, or a
            // tombstone, and the entities it holds that none of those name are the
            // unchanged ones the cloud already has. It exists to be READ by a phone still
            // on v78 and for no other reason - see editRoster. A projection is not a
            // record, and re-applying one over a newer truth can only lose.
            //
            // Filtered HERE and not inside applyJournalEntry, because the boot replay
            // (js/sync/sync.js) and the rescue-file rebuild (js/ui/backup.js) call it
            // too, and there the array IS this device's own latest opinion with no
            // snapshot to contradict it.
            const parts = String(path).split('.');
            if (parts.length === 1 && (parts[0] === 'workers' || parts[0] === 'places')) {
                return;
            }
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
                // A cleared Rima count is a deletion, like a worker-day removal - and the
                // map goes with its last count, the way setRimaCount leaves it.
                if (value === null && layer === 'rima') {
                    const rima = schedule.days[date].rima;
                    if (rima && typeof rima === 'object') {
                        delete rima[workerId];
                        if (Object.keys(rima).length === 0) delete schedule.days[date].rima;
                    }
                    return;
                }
                if (!schedule.days[date][layer]) schedule.days[date][layer] = {};
                if (value === null && (layer === 'plan' || layer === 'actual')) {
                    delete schedule.days[date][layer][workerId];
                } else schedule.days[date][layer][workerId] = value;
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

            // pay.<entry id> (v173). Put back when the schedule does not have it - an
            // arriving snapshot that has not heard of an entry has not disagreed with it
            // - and NEVER laid over one it does have: see layPaybookEntry in
            // js/model/payroll.js, which owns the rule. Asked at run time; a queue that
            // holds a pay path was read through that same file.
            if (parts.length === 2 && parts[0] === 'pay') {
                if (typeof layPaybookEntry === 'function') layPaybookEntry(schedule, parts[1], value);
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

            // ONE FIELD of one person - the unit an ordinary roster edit travels in, so
            // that a phone number typed here does not carry this device's stale copy of
            // his daily rate with it.
            //
            // And only onto somebody who is THERE. A field of a man this schedule does
            // not have is not a man: pushing a row built out of it would invent a person
            // with no name, and when the snapshot that has just been adopted is the one
            // that removed him, it would stand him back up - the resurrection the
            // tombstones exist to stop, done by the re-apply. The person's own field is
            // not lost by that: whoever still holds a record for him writes it, and the
            // write that gives him one is the whole-entity write editRoster keeps for an
            // entity nobody has yet.
            if (parts.length === 4 && parts[0] === 'roster'
                && (parts[1] === 'workers' || parts[1] === 'places')) {
                const list = schedule[parts[1]] || [];
                const at = list.findIndex(item => item && String(item.id) === parts[2]);
                // The gate that admits an operation refuses a poison segment anywhere in
                // its path, so this cannot be reached with one. Asked again here anyway:
                // this is the one arm that writes a segment straight into a record as a
                // KEY, and `row.__proto__ = value` does not add a field, it moves the
                // prototype. One comparison against a decision that already exists.
                if (at !== -1 && isPlainObject(list[at])
                    && POISON_SEGMENTS.indexOf(parts[3]) === -1) {
                    list[at][parts[3]] = value;
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
        if (value === null && (layer === 'plan' || layer === 'actual' || layer === 'rima')) {
            return held === undefined;
        }
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

    // A pay book entry (v173) is never removed either, so a null owes nothing; and it is
    // HELD when the record has that id saying the same thing, whoever signed the copy
    // that stands - see paybookHoldsEntry for why bytes are the wrong question here.
    if (parts.length === 2 && parts[0] === 'pay') {
        if (value === null) return true;
        return typeof paybookHoldsEntry === 'function'
            && paybookHoldsEntry(schedule, parts[1], value);
    }

    if (parts.length === 3 && parts[0] === 'roster'
        && (parts[1] === 'workers' || parts[1] === 'places')) {
        const list = schedule[parts[1]] || [];
        const found = list.find(item => item && String(item.id) === parts[2]);
        if (value === null) return found === undefined;
        return found !== undefined && same(found, value);
    }

    // ONE FIELD of one person. Held when the man is on the disk AND his record there
    // already says this.
    //
    // A man who is NOT on the disk answers no, and that is the rule at the top of this
    // function rather than an oversight: the write may still be owed - he can be absent
    // because this device has not adopted the snapshot that carries him yet - and a wrong
    // "yes" would take the person's edit off the queue with nowhere it had landed. A
    // wrong "no" costs one path's bytes and one more attempt, which is the direction to
    // be wrong in.
    if (parts.length === 4 && parts[0] === 'roster'
        && (parts[1] === 'workers' || parts[1] === 'places')) {
        const list = schedule[parts[1]] || [];
        const found = list.find(item => item && String(item.id) === parts[2]);
        if (!found || typeof found !== 'object') return false;
        return same(found[parts[3]], value);
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

    // THE LEGACY WHOLE ARRAY, once it has been sent, owes the disk nothing.
    //
    // This used to ask whether the stored list equalled the queued array, and that
    // question stopped having an answer the moment reapplyPending stopped laying the
    // array back over an adopted snapshot: the disk holds the snapshot's roster, the
    // queued array holds this device's older opinion, and they differ for ever. Measured
    // with only the reapply guarded: one operation on the disk became seven, five paths
    // still listed by pendingPaths() while pendingCount() read 0 - sent work that could
    // never be collected, growing on every roster edit.
    //
    // The honest answer is yes, and it is yes for the same reason the array is not
    // re-applied: it is a wire-compat projection for a v78 reader, not a record. Every
    // entity it names that this device actually changed is also queued at
    // `roster.<kind>.<id>`, and those are asked the real question above; the rest were
    // never this device's to say. So there is nothing in it that a "yes" could lose,
    // which is the test this function is written against - a wrong yes loses somebody's
    // day, and this one cannot, because the day is not in here.
    //
    // The caller only reaches this for an operation already `sent` (js/sync/sync.js).
    if (parts.length === 1 && (parts[0] === 'workers' || parts[0] === 'places')) {
        return true;
    }

    return false;
}
