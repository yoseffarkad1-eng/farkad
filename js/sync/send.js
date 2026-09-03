// ---------------------------------------------------------------- the send path
//
// Split out of js/sync/sync.js at v102. The code is unchanged: the same method bodies in
// the same order, added to the same object through Object.assign. Nothing was renamed and
// nothing was tidied on the way past.
//
// WHAT THIS FILE OWNS: getting this device's work to the cloud. The edit that enters the
// queue, the flush, the claim that stops two tabs of one app sending at once, the pre-send
// hold, the create race for the very first document, the retry ladder, and every gate that
// can decide a write must not go out yet.
//
// WHAT IT MUST NEVER DO:
//   - send the whole document. One field path per edit is the rule; the only exception is
//     the restore transaction, and it lives in js/sync/restore.js where it can be seen.
//   - report a write as landed because it was sent. An entry leaves the queue when the
//     cloud names its operation, and never before.
//   - send a write built on a base that has moved. A stale write is refused, rebased when
//     it is disjoint, and HELD when it is contested - durably, across a reopen, so a phone
//     that loses a race about somebody's pay does not quietly try again over the winner.
//   - hold a write over a fact the cloud already agrees with. The same-fact rule is asked
//     at every gate here, because two phones recording the same evening are not a conflict.

Object.assign(FarkadSync, {
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

    // What a roster edit is measured against - and the answer when this session has not
    // heard from the cloud yet.
    //
    // A per-entity roster write is a CLAIM: I changed this man. Only this device's own
    // record can justify one. The baseline used to be _remoteRoster alone, which is
    // memory and starts empty at every app start, so a phone that edited the roster
    // before its first snapshot arrived found every entity different from nothing and
    // sent all of them - including a man whose rate another phone had raised while this
    // one was away. That write is an ordinary per-entity write, it wins on the server,
    // every phone adopts it, and no line on any screen says a word. A day recorded
    // afterwards is then priced at the resurrected rate: law 2 reached from the wrong
    // end. It needs no race - open the app, change a site, and the write can leave before
    // the listener delivers.
    //
    // So there is no such thing as a phone with no baseline. A phone that has heard
    // nothing this session still has its own last durable record on its own disk, and an
    // entity it has not itself just changed is not news it is entitled to broadcast.
    // State.durableText is exactly those bytes - the last schedule this device wrote and
    // read back - and editRoster runs BEFORE commitRoster's save(), so at that moment
    // they are the roster as it stood before this edit.
    //
    // Normalised through the app's own normaliseSchedule, because _remoteRoster is: the
    // two sides have to be compared on the same footing or every entity looks changed and
    // the baseline does nothing. Only the roster is handed over, not the days - this is a
    // question about people, and a season of days is not cheap to walk.
    //
    // If those bytes cannot be read there is no local record either, so there is nothing
    // this device could be stale ABOUT: the old behaviour stands and the whole roster
    // goes up.
    rosterBaseline() {
        if (this._remoteRosterKnown) return this._remoteRoster;

        const text = (typeof State !== 'undefined' && typeof State.durableText === 'string')
            ? State.durableText : null;
        if (!text) return this._remoteRoster;
        if (this._localRosterBaselineText === text && this._localRosterBaseline) {
            return this._localRosterBaseline;
        }

        let roster;
        try {
            const parsed = JSON.parse(text);
            if (!parsed || typeof parsed !== 'object') return this._remoteRoster;
            roster = normaliseSchedule({
                workers: parsed.workers, places: parsed.places, roster: parsed.roster
            });
        } catch (error) {
            return this._remoteRoster;
        }

        const byId = list => {
            const out = {};
            (list || []).forEach(item => {
                if (item && item.id) out[String(item.id)] = item;
            });
            return out;
        };
        this._localRosterBaselineText = text;
        this._localRosterBaseline = {
            workers: byId(roster.workers), places: byId(roster.places)
        };
        return this._localRosterBaseline;
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
    //
    // `options.all` is the seeding case and says so out loud: the cloud has no roster at
    // all, this device's roster is what goes into it, and every entity is genuinely news.
    // It used to be spelled as an empty baseline, which is the same words as "this
    // session has not heard from the cloud yet" - and one emptiness meaning two opposite
    // things is exactly how O2's first carrier got in. See rosterBaseline().
    editRoster(schedule, removed, options) {
        const sendAll = Boolean(options && options.all);
        // Collected, then written once. This is the longest chain of entries in the app -
        // one path per person, plus the order, plus the legacy array - and a partial
        // result here is the hardest kind to notice: a worker present but missing from
        // the order, or an order naming somebody who is not in the list.
        const batch = [];
        const put = (path, value) => batch.push({ path, value });

        [['workers', 'workerOrder'], ['places', 'placeOrder']].forEach(([kind, orderKey]) => {
            const known = sendAll ? {} : (this.rosterBaseline()[kind] || {});
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
        // ASKED OF THE PATH, not of the document's signature.
        //
        // "Somebody else put it there" used to be decided on the whole document's
        // updatedBy, and skipped the pass entirely when that was this device. One
        // unrelated write of this device's own - another day, in its own batch, which
        // must go - signed the document with its name; with the hold marker refused by
        // the disk and the session closed, nothing else remembered the hold, and the
        // reopened phone sent the contested edit over the other phone's correction. The
        // base recorded with the edit was on the disk throughout and never consulted.
        // Measured in tests/contested.test.mjs.
        //
        // The record answers the question the signature could not: whether what the
        // server holds now is something this device has seen or produced there. Two tabs
        // of one app share a disk, and the disk is in the record - so the person's own
        // later correction still wins, and somebody else's still holds.
        // THE SAME FACT, ALREADY ON THE RECORD - asked BEFORE the hold, not after.
        //
        // A deterministic id under `ledger.` is one decision: `cm_carry` is the carry
        // approval, `le_close_<advance>_<from>` is one period's closure. Two phones write
        // it with the same numbers and a different hand, and the model calls that one
        // fact (sameLedgerFact). The conflict branch has asked that question since v91 -
        // but a phone whose queued write has not gone out yet never reaches the conflict
        // branch. It hears the winner's snapshot, adopts it, and then this pass compares
        // VALUES and holds its own copy as a contest.
        //
        // Two phones each approving the carry plan before they connect - which is what a
        // person does, the review screen being the first thing a new install shows - then
        // both reaching a project with no document. The loser held
        // ledger.migrations.cm_carry for ever, said 'contested', and a person was told
        // there was a conflict about money when both phones had recorded the same
        // approval of the same plan. It never sent a byte: measured on the fake cloud in
        // tests/samefact.test.mjs, one create attempted and the loser's write held at
        // this gate. The emulator hit it once in twenty-eight runs under load and it was
        // written down as an open item of its own.
        //
        // Acknowledged rather than sent. The fact is on the server, under this id, with
        // the first writer's name on it - which is what the record should say, since they
        // did decide first. Sending it would replace their hand with this one's for no
        // change in the money. Any difference in a FINANCIAL field is not the same fact,
        // is not settled here, and falls through to the hold exactly as before.
        const settledHere = new Map();
        if (this._baseDoc && typeof ledgerPathSupersededBy === 'function') {
            this._outbox.forEach((item, path) => {
                if (item.sent || item.held || this._heldNow.has(String(path))) return;
                if (ledgerPathSupersededBy(path, item.value,
                    readPath(this._baseDoc, path))) {
                    settledHere.set(String(path), { opId: item.opId, seq: item.seq });
                }
            });
        }
        if (settledHere.size > 0) this.acknowledge(settledHere);

        const movedUnder = [];
        this._outbox.forEach((item, path) => {
            if (item.sent || item.held || this._heldNow.has(String(path))) return;
            // Settled above: on the server already, under this id, as the same fact.
            // Collection may not have taken it off the disk yet - it is allowed to fail -
            // and a settled path must not then be held as a contest on the way past.
            if (settledHere.has(String(path))) return;
            // A DAY OR A LEDGER ENTRY, and nothing else.
            //
            // Those are the two families where a queued value REPLACES what is there, so
            // sending one over somebody's correction loses recorded work or money - which
            // is the whole of what this hold is for. The roster is not like that: it
            // merges per id, an added worker is additive rather than a correction of a
            // value somebody was looking at, and the ordering of a roster change against a
            // restore is its own transaction with its own rules (G12-G14). Holding roster
            // paths here would have stopped a worker added after a prepared restore from
            // ever reaching the cloud - a guarantee that already has a suite of its own.
            if (!replacesWhole(path)) return;
            if (this.movedUnder(item, path, this._baseDoc)) movedUnder.push(String(path));
        });
        if (movedUnder.length > 0) {
            const wrote = this.holdContested(movedUnder);
            if (!wrote.durable) {
                movedUnder.forEach(path => this._heldNow.add(String(path)));
            }
            // SAID AS ITSELF, and said HERE.
            //
            // The conflict branch reports a hold by throwing an error that carries the
            // held paths, and fail() turns that into 'contested' and its line. This
            // branch has nothing to throw - it decided before anything left - and it used
            // to set nothing at all. The holding branch below schedules no retry for a
            // contested hold, deliberately, and re-asks the status only when it currently
            // reads 'synced'; at this moment it reads 'sending', because the snapshot
            // that has just been adopted found the queue not empty. So the line said
            // "still sending" for the rest of the evening, over a queue nothing was
            // sending and nothing would retry - and the one person who could resolve a
            // hold was not told there was anything to resolve. Measured in
            // tests/contested.test.mjs: a hold on an idle phone, polled past the first
            // rung of the ladder.
            const held = new Error('a queued edit was built on a value another device '
                + 'has since corrected; it is held until a person looks');
            held.contested = movedUnder.slice();
            this.fail(held);
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
            .filter(([path]) => !settledHere.has(String(path)))
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
                if (error && error.code === 'not-found') {
                    return this.createDocument(patch, onFailure);
                }

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

                    // ALREADY DONE, BY SOMEBODY ELSE'S HAND.
                    //
                    // A few records in this app are named after WHAT THEY ARE rather than
                    // by a random id - the carry approval, a period closure, a correction
                    // of one transaction - precisely so that two phones cannot write two
                    // of them. The consequence is that two phones legitimately send the
                    // same path with the same numbers and a different `at` and `by`.
                    //
                    // To everything below this line that is one path with two bodies, and
                    // it was held for ever: the loser's approval sat in the outbox, the
                    // phone never said synced, and a person was told there was a conflict
                    // about money when both phones had recorded the same fact. Measured
                    // against the emulator, it took out twelve checks of
                    // tests/money.concurrency.test.mjs at the v91 merge.
                    //
                    // So the model is asked - it owns what a ledger record is - and a path
                    // whose value the server already holds as the SAME FACT is dropped
                    // from this write. The server's copy stands, which is first-writer-
                    // wins with the document as the arbiter. Any difference in a financial
                    // field is not the same fact and falls straight through to the hold.
                    const settled = (error.document && typeof error.document === 'object'
                        && typeof ledgerPathSupersededBy === 'function')
                        ? contested.filter(path => ledgerPathSupersededBy(
                            path, patch[path], readPath(error.document, path)))
                        : [];
                    settled.forEach(path => { delete patch[path]; });
                    const live = contested.filter(path => settled.indexOf(path) === -1);

                    // Nothing of this operation is left to send. Resolving here takes it
                    // through the ordinary success path, so the batch is acknowledged and
                    // collected exactly as if it had landed - which is the truth: every
                    // fact it carried is on the server. Sending it again would replace the
                    // first writer's name with this one's.
                    if (live.length === 0 && settled.length > 0
                        && Object.keys(patch).every(key =>
                            ENVELOPE_FIELDS.indexOf(key) !== -1)) {
                        if (Number.isInteger(error.revision)) this._revision = error.revision;
                        return;
                    }
                    if (live.length === 0) {
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
                    error.contested = live;
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
                    // The operation's own record answers that now: it carries every value
                    // this device had seen or produced at the path, the older tab's
                    // included, so a path that is contested against it moved under
                    // somebody else, whoever signed the document. The document's author
                    // decides only for a queue an older build wrote, where the record
                    // carries no such values and, by the time the refusal is handled, the
                    // operation that produced the older tab's value has usually been
                    // acknowledged and collected off this disk.
                    const base = this._sendBase;
                    const wroteIt = String((error.document || {}).updatedBy || '');
                    const someoneElse = wroteIt !== '' && wroteIt !== String(syncDeviceId());
                    const moved = (!error.cutover && error.document
                        && typeof error.document === 'object'
                        && base && typeof base === 'object')
                        ? live.filter(path => {
                            const frozen = base[String(path)];
                            return Boolean(frozen) && (frozen.own || someoneElse);
                        })
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
            .then(answer => {
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

                // THE SNAPSHOT AGAIN, now that these paths are no longer owed.
                //
                // Answered from its receipt, a retry performs no write and no snapshot
                // follows it. If another phone corrected one of these paths while the
                // write was owed, that snapshot has already been adopted here with the
                // owed value put back on top of it - and the acknowledgement was the
                // last word: screen and disk kept the older value, the cloud the
                // correction, and the line said synced. See readoptAfter.
                if (this.readoptAfter(sent, patch, answer)) return;

                // ASKED FOR, whatever the line said before. This read
                // `if (this.status !== 'error')`, and the guard outlived its reason: a
                // send that has just been answered is the recovery from whatever error
                // the line was showing, and honestStatusFor is the one door that decides
                // whether 'synced' may be said. A retry answered from its receipt was
                // where it showed: the answer was lost (status 'error'), the ladder
                // retried, the replay performed no write so no snapshot followed, the
                // queue emptied - and the phone read «שגיאת סנכרון - הנתונים שמורים
                // במכשיר הזה.» with nothing owed until the next real write from anyone.
                this.setStatus('synced');
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

    // The paths reapplyPending last put back on top of an adopted snapshot - the queued
    // values the screen is showing INSTEAD of what that snapshot held at them. Emptied
    // as they are acknowledged, since an acknowledged path shows the snapshot's value at
    // the next adoption anyway.
    _reappliedOver: new Set(),

    // After an acknowledgement: does the latest snapshot need adopting again?
    //
    // The answer is yes when both hold: the snapshot already INCLUDES the write that was
    // just acknowledged - otherwise adopting it would take the write off this screen
    // until its own echo arrives, which on a transaction is after the answer - and the
    // snapshot was adopted with one of these paths' owed values reapplied over it, so
    // what the screen shows at that path is not what the snapshot held.
    //
    // Which revision the write reached is the whole question, and it is not the same on
    // the two answers a send can get. A write that landed reached the revision it
    // claimed. A REPLAY - the operation had already landed and the server answered from
    // its receipt - reached the receipt's revision, which is older, and the retry's
    // claimed revision says nothing about it; that is why the adapter hands the receipt's
    // revision back with the answer. Without it a replay acknowledged against a snapshot
    // that already carried another phone's correction left the older value on this
    // screen and on this disk, saying synced. Returns whether the snapshot was re-run,
    // in which case receive() has set the status and scheduled anything still owed.
    readoptAfter(sent, patch, answer) {
        const replayed = Boolean(answer && typeof answer === 'object'
            && answer.replayed === true);
        const reached = replayed && Number.isInteger(answer.revision)
            ? answer.revision : patch.revision;
        const latest = this._latestRaw;
        const over = this._reappliedOver;
        let stale = false;
        sent.forEach((item, path) => {
            if (over.has(String(path))) { stale = true; over.delete(String(path)); }
        });
        if (!stale) return false;
        if (!latest || typeof latest !== 'object' || !Number.isInteger(reached)
            || !Number.isInteger(latest.revision) || latest.revision < reached) return false;
        this.receive(latest);
        return true;
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
    createDocument(patch, onFailure) {
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
        //
        // AND THE FINGERPRINT IS THE OPERATION'S, not the seed's.
        //
        // The id is the same on purpose - this is one operation, taking the branch the
        // missing document forces on it - so the receipt it leaves is the receipt the
        // retry will find. Stamped over the seed with kind 'create' it named something
        // else: the seed is the whole local schedule, the patch is the person's edit, and
        // the two digest differently by construction. The server committed the create,
        // the answer was lost, and the retry - which by then finds the document there and
        // so goes out as the update it always was - was told for ever that a receipt of
        // this name describes a different operation. Eight paths owed, status error,
        // unchanged by closing the app, with the day already safe in the cloud.
        //
        // The kinds it still has to separate are the ones that are genuinely different
        // decisions: an ordinary merge and a whole-document restore, which carry different
        // ids anyway. A create and the update it stands in for are not two decisions. The
        // seed's extra fields are DERIVED - normaliseSchedule of what this device already
        // holds - and there is nothing under them to overwrite, because the document does
        // not exist.
        const operation = typeof patch.opFingerprint === 'string' && patch.opFingerprint
            ? patch.opFingerprint
            : operationFingerprint('update', patch);
        this.stampProtocol(seed, this._sendOpId || this.operationIdFor(this._sending),
            'create', '', operation);
        return Promise.resolve(this.adapter.create(seed))
            .catch(error => {
                if (error && error.code === 'already-exists') {
                    // THE WINNER'S REVISION, LEARNED BY LOOKING - not waited for.
                    //
                    // The comment above says the winner's snapshot "has by then told
                    // us" the base. It has not, necessarily: the transaction's refusal
                    // and the listener are two channels with no ordering between them,
                    // and when the refusal arrives first this device has still been told
                    // no revision at all. The update then went out claiming revision 1
                    // against a document already at revision 1, the conflict was not
                    // handed to the handler every other write gets, and it escaped to
                    // the outer catch: «שגיאת סנכרון (N ממתינים לשליחה)» on the loser's
                    // screen for as long as its listener took, over an ordinary
                    // two-people-one-evening merge. Measured with the listener held
                    // 150 ms behind the transaction, tests/cas.test.mjs.
                    //
                    // So the document is read, the same way bootstrapCutover rereads,
                    // and its revision noted before the update is stamped. A read that
                    // fails costs nothing: the stamp falls back to what this device
                    // knows, exactly as before.
                    const learn = this.adapter && typeof this.adapter.read === 'function'
                        ? Promise.resolve(this.adapter.read()).then(fresh => {
                            if (!fresh || typeof fresh !== 'object') return null;
                            this.noteRevision(fresh);
                            return fresh;
                        }, () => null)
                        : Promise.resolve(null);
                    return learn.then(fresh => {
                        // AND ASKED THE PRE-SEND QUESTION, of the document just read.
                        //
                        // Learning the revision made the update VALID, which is the
                        // whole of the trouble. The pre-send hold in sendClaimed ran
                        // before the create left, against nothing heard, and decided
                        // nothing - "the conflict branch asks this question of that
                        // answer" - and then no conflict followed: the update went out
                        // at the revision it had just learned, the server had no
                        // reason to refuse it, and the winner's day was replaced whole
                        // by a phone that had never seen it. Two phones opening with no
                        // signal on a new project, the same worker on the same day
                        // recorded differently: the winner's half gone from the cloud,
                        // then from the winner, both phones saying synced. Measured on
                        // both listener timings in tests/cas.test.mjs.
                        //
                        // So the document the refusal made this device read is the
                        // document the queued values are held against - the same
                        // question, the same families, the same hold as the pre-send
                        // pass, and reported the same way. A day or a ledger entry the
                        // winner holds a different value at, one this device has neither
                        // seen nor produced, is somebody's record; it is held for a
                        // person, and the rest of the batch goes on down the ladder as
                        // the merge it is. A read that failed compares nothing, exactly
                        // as before: the update then meets the conflict branch, which
                        // carries the server's own document.
                        // AND THE SAME-FACT RULE, ASKED HERE TOO.
                        //
                        // movedUnder compares VALUES, so an approval or a closure the
                        // winner already holds under the same deterministic id, with the
                        // same numbers and another hand on it, is a value this device has
                        // never seen - and it was held for a person as a conflict about
                        // money that nobody was having. The conflict branch above settles
                        // exactly that case with ledgerPathSupersededBy; this branch is
                        // the same situation reached by the other road, and it did not
                        // ask.
                        //
                        // Two phones each approving the carry plan before they ever
                        // connect - which is what a person does, the review screen being
                        // the first thing a new install shows - then both reaching a
                        // project with no document. The loser held
                        // ledger.migrations.cm_carry for ever and reported 'contested'.
                        // Measured on the fake cloud in tests/samefact.test.mjs; the
                        // emulator hit it once in twenty-eight runs under load and it was
                        // written down as a separate open item.
                        //
                        // Settled paths are DROPPED from the patch, as the conflict
                        // branch drops them: the server's copy stands, first-writer-wins
                        // with the document as the arbiter, and the loser does not put
                        // its own name over an approval somebody else made first. A path
                        // the rule does not settle - any difference in a financial field -
                        // is held exactly as before.
                        const settled = (fresh
                            && typeof ledgerPathSupersededBy === 'function')
                            ? Object.keys(patch).filter(path => ledgerPathSupersededBy(
                                path, patch[path], readPath(fresh, path)))
                            : [];
                        settled.forEach(path => { delete patch[path]; });

                        const moved = [];
                        if (fresh) {
                            Object.keys(patch).forEach(path => {
                                if (!replacesWhole(path)) return;
                                const item = this._outbox.get(path);
                                if (!item || item.held || this._heldNow.has(String(path))) return;
                                if (this.movedUnder(item, path, fresh)) moved.push(String(path));
                            });
                        }
                        if (moved.length > 0) {
                            const wrote = this.holdContested(moved);
                            if (!wrote.durable) {
                                moved.forEach(path => this._heldNow.add(String(path)));
                                console.error('a contested write could not be held on the '
                                    + 'disk; it is held in memory for this session');
                            }
                            const held = new Error('another device created the document '
                                + 'while this write was on its way, and it holds a different '
                                + 'value at a path this write replaces; the edit is held '
                                + 'until a person looks');
                            held.contested = moved.slice();
                            throw held;
                        }
                        // NOTHING LEFT TO SEND. Every fact this operation carried is
                        // already on the document the winner created, under the same id
                        // and with the same numbers. Sending the envelope alone would
                        // bump the revision for a write that changes nothing; resolving
                        // here takes the batch through the ordinary success path, which
                        // is the truth. The conflict branch settles the same case the
                        // same way.
                        if (settled.length > 0 && Object.keys(patch).every(key =>
                            ENVELOPE_FIELDS.indexOf(key) !== -1)) {
                            if (fresh && Number.isInteger(fresh.revision)) {
                                this._revision = fresh.revision;
                            }
                            return;
                        }
                        const follow = Promise.resolve(this.adapter.update(
                            this.stampProtocol(patch, this._sendOpId
                                || this.operationIdFor(this._sending))));
                        // AND THROUGH THE SAME HANDLER, because a third phone can land
                        // between that read and this write. That is the in-flight
                        // conflict every other write is rebased or held from, and this
                        // one was left to the retry ladder.
                        return typeof onFailure === 'function'
                            ? follow.catch(onFailure) : follow;
                    });
                }
                throw error;
            });
    },
});
