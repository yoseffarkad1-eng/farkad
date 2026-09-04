// ---------------------------------------------------------------- the restore transaction
//
// Split out of js/sync/sync.js at v102. The code is unchanged: these are the same method
// bodies, in the same order, added to the same object. `Object.assign` rather than a second
// literal because a classic script cannot continue an object literal begun in another file,
// and there is no build step here to pretend otherwise.
//
// WHAT THIS FILE OWNS: putting a whole document in place of the record - a backup restored,
// a snapshot adopted, the legacy upgrade frozen. That is the ONE operation in this app
// allowed to write the whole document instead of one field path per edit, and everything
// here exists to make it survive being interrupted.
//
// WHAT IT MUST NEVER DO:
//   - land on the cloud before it has landed HERE. A crash between preparing a restore and
//     storing it once left the cloud holding the restore, the phone holding the old
//     schedule, the record deleted, and the status reading "synced". That is why
//     resumeReplace exists and why retryReplace does not.
//   - delete or overwrite anything it cannot read. A frozen legacy document that will not
//     parse is quarantined and kept, never treated as absent.
//   - be reached by an ordinary edit. One field path per edit is the rule; this file is the
//     documented exception and must stay the only one.

Object.assign(FarkadSync, {
    // A whole-document replacement - a restore, an import - in two halves, because the
    // order is the guarantee and one function cannot express it.
    //
    //   prepareReplace(schedule)         write the retry record, and read it back
    //   ...caller stores the new state locally, and gives up if it cannot...
    //   executePreparedReplace()         send it to the cloud
    //
    // Preparing FIRST is what makes the whole thing recoverable. replaceAll used to write
    // that record and ignore whether it landed: with no room for it and no network, the
    // restore was rejected, nothing was on the disk to say a restore was owed, and the
    // next older snapshot from another phone quietly finished undoing it.
    //
    // It is also the only order in which a crash between any two steps is safe. Before
    // step 1 nothing has happened. Between 1 and 2 there is a retry record and the old
    // state - the restore is re-attempted. After 2 the new state and the record agree.
    prepareReplace(schedule, cloudOwed) {
        // NOT subject to the private-mode exception. An ordinary edit is allowed on a
        // browser that stores nothing, because the app says plainly that nothing survives
        // and refusing would protect nobody. A whole-document restore changes what every
        // other device holds, and doing that with no durable record of the intent is a
        // different bargain entirely.
        this.loadOutbox();

        // Stamped HERE, not left to whatever the source had. A migrated v1 backup has no
        // timestamp at all, and the envelope captured the document before State.save
        // stamped the schedule - so every retry sent updatedAt: null, which the rules
        // reject on every attempt, forever.
        const document = cloudDocument(schedule);
        if (typeof document.updatedAt !== 'string' || !document.updatedAt) {
            document.updatedAt = new Date().toISOString();
        }
        if (typeof document.updatedBy !== 'string' || !document.updatedBy) {
            document.updatedBy = syncDeviceId();
        }

        // Checked before it is written down, not only when it is read back. A record
        // that would be quarantined on the next read is a record that should never have
        // been written: it would block every restore on the device and halt recording,
        // over a document this app built itself. Refusing here costs one restore and
        // says so.
        if (!isFullScheduleDocument(document)) return false;

        // Every operation on the disk RIGHT NOW, named. Read fresh and taken from the
        // whole physical set rather than from a projection: an operation the projection
        // does not show is still an operation, and one this tab has never seen is still
        // work the restore is replacing.
        const superseded = this.physicalOperations().map(op => op.opId);

        return this.rememberReplace(replacementEnvelope(
            document, 'prepared', replacementId(), this._seq, cloudOwed !== false,
            superseded));
    },

    // Says the device now holds it. Best effort on purpose: the phase is a hint, and the
    // gate on the cloud write is localDurableHolds, which reads the disk.
    confirmReplaceStored() {
        const envelope = this.pendingReplace();
        if (!envelope || envelope.phase === 'local-stored') return true;
        return this.rememberReplace(replacementEnvelope(
            envelope.document, 'local-stored', envelope.transactionId,
            envelope.supersedesSeq, envelope.cloud, envelope.supersedes));
    },

    // Undoes a prepare when the caller could not store the new state. The restore is not
    // happening, so a record saying it is owed would make the next session send a state
    // this device never adopted. Returns whether that is now certain.
    cancelPreparedReplace() {
        return this.forgetReplace();
    },

    // RULE A: A RESTORE REMOVES NO LEDGER ENTRY, ON ANY PHONE.
    //
    // The failure this prevents, end to end. Two phones online, nothing failing. A takes
    // a backup; B records a repayment of 500 which reaches the cloud and A; A restores
    // that backup through the ordinary door. The whole-document replacement carried the
    // ledger the backup was taken with, so A went back to owing 5,000, the cloud went
    // with it, and B - which had merged nothing and been told nothing - kept 4,500 for
    // ever and never sent it again. Both phones read "מסונכרן" over two different debts,
    // and a man is docked 500 shekels he has already handed over.
    //
    // Days, roster, places and everything else still REPLACE: a restore is still a
    // restore, and this narrows it in exactly one place. The ledger alone is unioned,
    // because it is append-only (law 1) and the two failures are not comparable. An entry
    // somebody wanted gone surviving a restore is VISIBLE - it is on the screen and in the
    // statement - and the ledger's own correction kinds are the designed answer to it. An
    // entry somebody else recorded, deleted from their phone by a restore they never asked
    // for, is invisible and recoverable only from a backup. See
    // features/restore-ledger/contract.md, which is where that was decided and why.
    //
    // Through mergeLedgerInto and nothing else - the SAME union receive() performs on an
    // arriving snapshot - so that a restore and a snapshot can never disagree about what
    // merging a ledger means. `conflicts`, when given, collects the ids whose two sides
    // say different things about money; nothing here resolves one.
    keepLedgerFrom(document, held, conflicts) {
        if (!document || !held) return document;
        // Feature-detected for the same reason advanceOutstanding detects its reader: a
        // build with js/model/ledger.js missing must not silently fall back to replacing
        // the ledger. There is nothing to union there, and nothing to lose either - a
        // build with no ledger file writes no ledger entries.
        if (typeof mergeLedgerInto !== 'function') return document;
        return mergeLedgerInto(document, held, conflicts);
    },

    // THE INVARIANT. Does scheduleData:v2, read straight off the disk, already contain
    // the replacement?
    //
    // Not the phase, not what is in memory, not what a promise resolved to - the bytes
    // that the next session will open. Everything about a whole-document restore hangs
    // off this one question, and it is asked before the cloud is written and again before
    // anything is forgotten.
    localDurableHolds(envelope) {
        if (!envelope || !envelope.document) return false;

        const actual = this.durableLocalState();
        if (!actual) return false;

        // What the device SHOULD hold: the replacement, with the work done after it was
        // asked for laid back on top. Comparing against the bare document would call a
        // correct device wrong the moment anybody recorded anything mid-restore.
        //
        // Both sides read the journal off the DISK. Replaying the one in memory made the
        // comparison self-confirming: a prune that was refused left memory without the
        // superseded entries and the disk with them, so the two sides agreed on a state
        // the next open would not produce.
        const expected = normaliseSchedule(envelope.document);
        if (!this.replayDurableJournal(expected, envelope)) return false;
        // RULE A, on the gate as well as on the write, or the gate wedges the transaction
        // it is supposed to protect: applyReplacementLocally now stores the document with
        // this device's ledger unioned into it, so a comparison against the bare document
        // would find entries on the disk the replacement never named and answer "this
        // device does not hold the restore" - for ever, after the person has already been
        // told the restore happened.
        //
        // It only ever ADDS to what is expected, and that is the whole of its effect on
        // the gate's strictness: a ledger entry the replacement carries and the disk does
        // NOT have is still missing, still noticed, and still stops the transaction.
        this.keepLedgerFrom(expected, actual);
        return replacementContent(actual) === replacementContent(expected);
    },

    // The local state as the NEXT session would compute it: the schedule on the disk with
    // the durable journal replayed over it. Not scheduleData:v2 on its own - a journal
    // entry that is still queued is part of what this device holds, and a superseded one
    // that could not be pruned is exactly the difference that must be noticed.
    durableLocalState() {
        const raw = Store.durableGet(SCHEDULE_KEY);
        if (raw === null) return null;

        let schedule;
        try {
            const parsed = JSON.parse(raw);
            schedule = normaliseSchedule(parsed);
            // What the record SAYS it is, not what normalising it stamped on. This is the
            // one caller that has to know: normaliseSchedule starts from emptySchedule(),
            // which stamps SCHEMA_VERSION, so a stored record written by another version
            // read as this one - and localDurableHolds answered "yes, I hold the
            // replacement" over a document that is not the same document. A record with
            // no version at all keeps the stamp, which is the v71 case.
            if (parsed && typeof parsed === 'object' && parsed.schemaVersion !== undefined) {
                schedule.schemaVersion = parsed.schemaVersion;
            }
        } catch (error) {
            return null;
        }
        if (!this.replayDurableJournal(schedule)) return null;
        return schedule;
    },

    // Puts the replacement on this device, durably, and on the screen. Returns false if
    // it could not be stored - in which case nothing at all has changed.
    // Returns { stored, pruned }.
    //
    // stored - the replacement, WITH the work done since it was asked for, is on the disk
    // pruned - the entries it supersedes are off the disk
    //
    // Both have to be true before anything is sent or forgotten. The schedule is written
    // first and the queue pruned second, so a failure between them leaves the superseded
    // entries queued rather than lost - they replay next session, the invariant notices,
    // and the transaction is retried.
    applyReplacementLocally(envelope) {
        const previous = State.schedule;

        // The replacement, then the newer work back on top of it. Dropping straight to
        // the document deleted every edit made after the restore was asked for - the
        // person recorded a day, was told it was saved, and the restore removed it from
        // the screen, the disk and the cloud at once.
        const next = normaliseSchedule(envelope.document);
        // The DURABLE journal, so that what is stored here is exactly what the invariant
        // will look for afterwards. Reading it out of memory let the two disagree.
        if (!this.replayDurableJournal(next, envelope)) {
            // The queue cannot be read, so there is no way to know what this device is
            // still owed. Storing the bare document would drop it silently.
            return { stored: false, pruned: false };
        }

        // RULE A: the ledger this device already holds goes back on top of the
        // replacement. See keepLedgerFrom for the failure and for why the ledger and
        // nothing else. Everything the four doors replace is still replaced.
        //
        // From BOTH the schedule in memory and the record on the disk, because they are
        // not always the same statement: a second tab of this app writes the disk without
        // touching this context's State.schedule, and its entry is exactly the kind that
        // would be lost with nobody watching. Unioning twice is unioning once - the merge
        // is by id and an id already present is left alone - so the extra read costs a
        // parse on a path taken a handful of times in a phone's life.
        const ledgerClash = [];
        this.keepLedgerFrom(next, previous, ledgerClash);
        const durable = this.durableLocalState();
        if (durable) this.keepLedgerFrom(next, durable, ledgerClash);

        // ONE IMMUTABLE ID, TWO DIFFERENT BODIES, and a restore decides which is true no
        // more than a snapshot does. Both are kept - the restore's copy where it landed,
        // this phone's beside it under a name nothing folds - exactly as receive() keeps
        // them, so the two doors leave the same evidence in the same place. Recovery is
        // told AFTER the write below, because it blocks writing the moment it is told and
        // telling it first would refuse the very save that puts the bytes somewhere a
        // person can reach them.
        if (ledgerClash.length > 0) {
            next.ledger = next.ledger || {};
            if (!next.ledger.conflicted || typeof next.ledger.conflicted !== 'object'
                || Array.isArray(next.ledger.conflicted)) {
                next.ledger.conflicted = {};
            }
            ledgerClash.forEach(clash => {
                // AN OWN PROPERTY, WHATEVER THE NAME IS. `map[id] = value` for an id of
                // `__proto__` writes the PROTOTYPE and creates nothing - see putKey in
                // js/model/ledger.js, which is the same rule for the merge. The doors
                // refuse a poisoned map before it gets this far, but the one map whose
                // job is to keep evidence must not be the one that loses it.
                Object.defineProperty(next.ledger.conflicted, clash.id, {
                    value: { id: clash.id, family: clash.family,
                        here: clash.mine, arrived: clash.theirs },
                    writable: true, enumerable: true, configurable: true
                });
            });
        }

        // BEFORE the schedule is swapped, and its answer decides whether the swap happens
        // at all.
        //
        // This roster is not this device's any more: it came out of a backup file, a cloud
        // copy or another phone's export, and an id that happens to survive the swap
        // arrived inside somebody else's document - so its provenance is exactly as unknown
        // as everything else in there.
        //
        // Ignoring the refusal was a hole with a long fuse. The restore saved, reported
        // success and cleared its transaction; this session refused deletions because the
        // record it held said so; and the DISK still carried the old, perfectly valid list
        // of everything this device had minted. Reopen tomorrow and a worker who arrived
        // inside that backup is provably local again, with a delete button next to him.
        //
        // So it goes first, it is read back, and a refusal stops the replacement. The
        // pending transaction stays on the disk, deletion stays blocked by it through any
        // number of reopens, and the retry finishes the job once there is room.
        if (!this.forgetLocalOrigin()) return { stored: false, pruned: false };

        State.schedule = next;
        if (!State.save()) {
            State.schedule = previous;
            if (typeof render === 'function') render();
            return { stored: false, pruned: false };
        }

        const pruned = this.dropSupersededEntries(envelope);
        if (typeof render === 'function') render();

        // Now that the bytes are durable. A disputed id is a disagreement about somebody's
        // money and the device stops writing until a person has looked at both copies -
        // the same sentence, the same key and the same hold receive() uses, because it is
        // the same trouble arriving through a different door.
        if (ledgerClash.length > 0 && typeof Recovery !== 'undefined') {
            Recovery.damaged('scheduleData:v2:ledger:conflict',
                JSON.stringify(next.ledger.conflicted),
                'הגיעה רשומת מקדמה עם אותו מזהה ותוכן אחר. שתי הגרסאות נשמרו כמו שהן '
                + 'ולא נמחק דבר, אבל אי אפשר לרשום עוד עד שתייצא גיבוי ותבדוק איזו '
                + 'מהן נכונה.');
        }
        return { stored: true, pruned };
    },

    // Journal entries the replacement has made obsolete. Anything newer was made after
    // the restore was asked for and is still owed, and is left alone.
    //
    // Built as a candidate and verified before it is adopted, like every other queue
    // write: the version that mutated the map and ignored saveOutbox's answer reported a
    // finished restore while the old journal sat on the disk, ready to put the superseded
    // days back at the next open.
    dropSupersededEntries(envelope) {
        this.loadOutbox();
        const named = supersededOpIds(envelope);
        const upTo = Number((envelope || {}).supersedesSeq) || 0;

        // Named, and the list may be empty - a restore that supersedes nothing.
        if (named) {
            if (named.size === 0) return true;
            return this.dropOperations([...named]);
        }
        if (upTo <= 0) return true;

        // An envelope from a build that named nothing has only its number to go on.
        // Asked of the whole physical set, not of a projection: an operation the
        // projection does not show is still an operation that could come back.
        const going = this.physicalOperations()
            .filter(op => (Number(op.seq) || 0) <= upTo)
            .map(op => op.opId);
        if (going.length === 0) return true;
        return this.dropOperations(going);
    },

    // Picking a restore back up - at connect, on the retry ladder, when the connection
    // returns, or when a snapshot arrives while one is outstanding.
    //
    // The order is the whole fix. THIS DEVICE FIRST. Sending first and adopting from the
    // echo was what left the cloud holding a restore the phone that asked for it had
    // never seen: the snapshot published during save() was ignored, because a replacement
    // was in flight, and then the record was deleted.
    resumeReplace() {
        const envelope = this.pendingReplace();
        if (!envelope || this._replacing) return Promise.resolve();

        // Applied unconditionally, not only when the disk disagrees. Writing the same
        // bytes again is harmless; SKIPPING it is not, because State.load has meanwhile
        // replayed the journal - including the entries this restore supersedes - so
        // memory can be ahead of a disk that already holds the replacement.
        const applied = this.applyReplacementLocally(envelope);
        if (!applied.stored) {
            // No room. Nothing is sent, nothing is cleared, nothing is forgotten, and
            // the status does not say synced.
            this.fail(new Error('no room to store the restored schedule; nothing was sent'));
            return Promise.resolve();
        }
        if (!applied.pruned) {
            // The schedule landed; the queue still holds entries this replacement
            // supersedes. Sending now would be sending a state the next open would not
            // reproduce, because those entries would replay over it.
            this.fail(new Error('the queue could not be finished; the restore is still pending'));
            this.scheduleRetry();
            return Promise.resolve();
        }

        // A restore made with no cloud connected owes the cloud nothing, now or later.
        // Both halves are on the disk, so the transaction is over. Sending it the first
        // time somebody signs in would push a state nobody asked to share.
        if (!envelope.cloud) {
            this.forgetReplace();
            return Promise.resolve();
        }

        this.confirmReplaceStored();
        return this.executePreparedReplace().catch(() => {});
    },

    // A restore that had no cloud to reach still has two halves, and a crash between them
    // leaves the second one owed. Nothing else will pick it up: connect(), the retry
    // ladder and the online handler are all cloud paths, and this device may never see a
    // cloud again. So it is finished here, at load, where the disk has just been read.
    //
    // Idempotent by construction - applying the same replacement twice is applying it
    // once - so a device that cannot finish it simply tries again at the next open.
    finishLocalReplace() {
        const envelope = this.pendingReplace();
        if (!envelope || envelope.cloud || this._replacing) return false;

        const applied = this.applyReplacementLocally(envelope);
        if (!applied.stored || !applied.pruned) return false;
        return this.forgetReplace();
    },

    // The replacement as it will go to the cloud: the document that was asked for, with
    // the ledger this device durably holds unioned into it. See keepLedgerFrom.
    //
    // A COPY, always. Mutating envelope.document would put the union into the record of
    // what was asked for - which readFrozenLegacy compares against the raw v71 bytes
    // beside it, and which would then stop binding on the next open, holding a genuine
    // restore for ever. Falls back to the document untouched if the disk cannot be read:
    // the gate above has already answered that case, and a copy that will not serialise
    // is not a reason to invent one.
    //
    // AND WHAT THIS DOES NOT COVER, said here because a reader of this function will
    // otherwise believe it does. It unions the ledger THIS DEVICE HOLDS, so an entry that
    // is in the cloud and has never reached this phone is not in it - and the save below
    // takes that entry off the cloud. It is reachable: a restore prepared while offline,
    // another phone's repayment landing and being confirmed meanwhile, and this phone
    // coming back. receive() records the arriving revision BEFORE the branch that declines
    // to adopt a snapshot while a restore is pending, so this device learns the number
    // without the content and its write is then accepted rather than refused. Not new,
    // not fixed here, and written up in full - with the two lines that produce it and the
    // three candidate fixes - under LIMIT in features/restore-ledger/contract.md.
    replacementToSend(envelope) {
        const document = (envelope || {}).document;
        const held = this.durableLocalState();
        if (!document || !held) return document;
        let copy;
        try {
            copy = JSON.parse(JSON.stringify(document));
        } catch (error) {
            return document;
        }
        return this.keepLedgerFrom(copy, held) || document;
    },

    executePreparedReplace() {
        const envelope = this.pendingReplace();
        if (!envelope) {
            return Promise.reject(new Error('no prepared replacement to send'));
        }

        // The gate. A phase can be stale after a crash; the disk cannot.
        if (!this.localDurableHolds(envelope)) {
            return Promise.reject(
                new Error('the replacement is not stored on this device yet'));
        }
        if (!this.adapter) return Promise.resolve();

        // RULE A ON THE WIRE, and this is the half the other two phones live or die by.
        //
        // The cloud write here is a whole-document save: whatever is not in the document
        // is not in the cloud afterwards. Sending the envelope's document as it arrived
        // therefore deleted from the cloud the very ledger entries the gate above has just
        // confirmed are on this disk - and every phone that adopted the snapshot after it
        // lost them too, silently, having asked for nothing.
        //
        // So what goes out is what this device HOLDS. envelope.document is left exactly as
        // it arrived, because it is the durable record of what was asked for and the
        // frozen v71 companion is bound to it byte for byte; the union is made on a copy,
        // at the moment of sending, out of the same durable state the gate just read.
        const document = this.replacementToSend(envelope);

        this._stamp = null;
        this._replacing = true;

        // Ordered after every cloud write that was started before this one. A save
        // replaces the whole document, so an older update landing on top of it puts back
        // days this restore removed - and a device that reported "done" a moment earlier
        // has no idea it happened.
        //
        // A timeout is not good enough here. If an earlier write is still open the
        // restore simply does not go: it stays on the disk, the ladder picks it up, and
        // nothing has claimed to be finished.
        return this.cloudQuiet()
            .then(quiet => {
                if (!quiet) {
                    throw new Error(
                        'an earlier cloud write has not finished; the restore was not sent');
                }
                // And ordered after every cloud write ANOTHER TAB started.
                //
                // cloudQuiet only knows about the writes this context began, and a second
                // tab on the same phone is a second context: its open field update is
                // invisible here. So the restore went out under it, the update landed on
                // top of the whole-document save, and the cloud held a day the restore had
                // removed - while the tab that asked for it had already been told "done",
                // and every phone subscribed at that moment adopted the day back.
                //
                // The right to send is the record both tabs read. Refused, the restore
                // simply does not go: it stays on the disk, the ladder picks it up, and
                // nothing has claimed to be finished.
                // _claiming for the whole of it, the same flag flush() sets. Without it
                // a debounced flush in THIS tab starts while the restore is still
                // waiting out the claim's settle, and the two race each other through
                // one claim - which is the failure the claim exists to stop, arriving
                // from inside rather than from the next tab along.
                this._claiming = true;
                return this.takeSendClaim();
            })
            .then(mine => {
                if (!mine) {
                    this._claiming = false;
                    throw new Error(
                        'another tab holds the right to send; the restore was not sent');
                }
                const done = value => {
                    this.releaseSendClaim();
                    this._claiming = false;
                    return value;
                };
                // A whole-document save takes everybody out at once.
                if (!this.markSent(document)) {
                    done();
                    return Promise.reject(new Error(
                        'the record of what has been sent could not be stored; the replacement was not sent'));
                }
                return this.cloudWrite(() => {
                    // Asked inside the task - see sendClaimed for why outside is the wrong
                    // moment.
                    if (!this.stillOwnsSendClaim()) {
                        return Promise.reject(new Error(
                            'the right to send moved to another tab; the restore was not sent'));
                    }
                    // The ordering envelope on the restore too. A whole-document
                    // replacement is a write like any other and takes the same fence -
                    // which is the point: a restore racing an ordinary edit used to have
                    // no ordering at all, and the loser was silent.
                    //
                    // The operation id is the transaction's own, so a restore that is
                    // retried after a request that may still have landed is recognised by
                    // its receipt rather than applied a second time over work that
                    // happened in between.
                    // And the transaction it belongs to, inside the fingerprint: two
                    // restores that replace the same document with the same bytes are
                    // still two different decisions, and a receipt for one must not answer
                    // the other.
                    this.stampProtocol(document,
                        'r' + digestOf(String(envelope && envelope.transactionId)),
                        'restore', String((envelope && envelope.transactionId) || ''));
                    return Promise.resolve(this.adapter.save(document)).then(value => {
                        // And AGAIN, on the far side of the request. Reading the disk and
                        // then acting on what it said is two steps, and the other tab
                        // writes between them: the claim was mine at the check and
                        // somebody else's at the call. No amount of reading harder closes
                        // that - the write itself has to carry the ownership so the CLOUD
                        // can refuse it, which is the versioned protocol and is not this.
                        // What IS closable here is the lie: a restore that went out under
                        // another tab's claim must not come back as done. The transaction
                        // record stays on the disk and the ladder picks it up.
                        if (!this.stillOwnsSendClaim()) {
                            throw new Error('the right to send moved while the restore was '
                                + 'in flight; it is not confirmed');
                        }
                        return value;
                    });
                }).then(done, error => { done(); throw error; });
            })
            .then(() => {
                this._replacing = false;

                // Asked AGAIN, after the cloud has it. A resolved cloud write is not a
                // reason to forget anything: the question is whether screen, disk and
                // cloud now describe the same schedule, and only the disk can answer it.
                // Anything else and this device would be left holding one schedule while
                // the other two phones hold another, with nothing recording the fact.
                //
                // It THROWS. Returning quietly here set the error status and then let
                // replaceEverything resolve, which reported the restore as done over a
                // device and a cloud that disagreed.
                if (!this.localDurableHolds(envelope)) {
                    const problem = new Error(
                        'the cloud has the restore but this device does not; keeping it pending');
                    this.fail(problem);
                    this.scheduleRetry();
                    throw problem;
                }

                // NOT clearOutbox. What is left in the queue at this point is work done
                // AFTER the restore was asked for - already in the local schedule, and
                // still owed to the other two phones. A blanket clear deleted it from the
                // cloud as well as the queue, which is the one thing a restore must not
                // do to work somebody did afterwards.
                if (!this.forgetReplace()) {
                    // The record is still on the disk and will be resumed. Saying synced
                    // would be claiming a transaction is over while it can still run.
                    const problem = new Error(
                        'the restore reached the cloud but its record could not be cleared');
                    this.fail(problem);
                    throw problem;
                }

                this.setStatus('synced');
                if (this.pendingCount() > 0) this.scheduleFlush();
            })
            .catch(error => {
                this._replacing = false;
                this.fail(error);
                this.scheduleRetry();
                // The prepared record stays on the disk. That is the whole point of it.
                throw error;
            });
    },

    // The whole restore, in one call, so the four places that perform one cannot each get
    // the ordering slightly wrong. Never rejects: it resolves with which STAGE failed, so
    // the caller can say the right thing without a try/catch around four outcomes.
    //
    //   1. write down the intent          fail -> nothing has changed
    //   2. store it on this device        fail -> memory reverted, intent cancelled
    //   3. mark the intent as stored
    //   4. send it to the cloud           fail -> the intent stays on disk and is resumed
    //
    // Step 2 before step 4 is the invariant this exists for. It is also the only order in
    // which a crash between any two steps recovers to something true.
    replaceEverything(schedule) {
        const previous = State.schedule;
        const cloudOn = Boolean(this.adapter) && this.status !== 'off';

        // Defence in depth. The four doors each check what they were handed, and this
        // checks it again on the way in - because the thing being asked for here is
        // "make this the entire record on three phones", and a caller that forgot is a
        // caller that empties them. cloudDocument of an unsound schedule would be
        // written down, refused on the way back in, and quarantine the device.
        if (readReplacementDocument(cloudDocument(schedule)).document === null) {
            return Promise.resolve({ ok: false, stage: 'invalid' });
        }

        // A durable record of the intent, cloud or no cloud.
        //
        // The local-only restore used to skip this and hold its envelope in a local
        // variable, which is fine right up to the moment one of the two halves fails.
        // The schedule would be written and the queue prune refused, and the method
        // reported stage "queue" over a device holding the restored blob, the old
        // journal, and nothing at all that could finish the job - so the next open
        // replayed the superseded days straight back on top of the restore.
        if (!this.prepareReplace(schedule, cloudOn)) {
            return Promise.resolve({ ok: false, stage: 'prepare' });
        }

        this.loadOutbox();
        const envelope = this.pendingReplace();

        const applied = this.applyReplacementLocally(envelope);
        if (!applied.stored) {
            State.schedule = previous;
            const cancelled = this.cancelPreparedReplace();
            if (typeof render === 'function') render();
            return Promise.resolve({ ok: false, stage: 'local', cancelled });
        }
        if (!applied.pruned) {
            // The replacement is on the disk, but the entries it supersedes are still
            // queued and would replay over it at the next open. Not a success, and the
            // transaction stays so a later attempt can finish it.
            this.fail(new Error('the queue could not be finished'));
            return Promise.resolve({ ok: false, stage: 'queue' });
        }

        if (!cloudOn) {
            // Both halves are down. Nothing is owed to a cloud that is not there, so the
            // transaction is over and its record goes.
            if (!this.forgetReplace()) {
                // The restore itself is complete and safe - the note saying one was owed
                // is what could not be taken off the disk. It will simply be replayed at
                // the next open, and applying the same replacement twice is applying it
                // once. Still not a finished transaction, and reporting "done" would be
                // saying the app has no more work to do about it.
                return Promise.resolve({ ok: false, stage: 'finalize' });
            }
            return Promise.resolve({ ok: true, stage: 'done' });
        }

        this.confirmReplaceStored();
        return this.executePreparedReplace()
            .then(() => ({ ok: true, stage: 'done' }))
            .catch(error => ({ ok: false, stage: 'cloud', error }));
    },

    // Kept for the paths and tests that manage their own ordering.
    replaceAll(data) {
        if (!this.prepareReplace(data)) {
            return Promise.reject(new Error('the restore could not be written down'));
        }
        this.confirmReplaceStored();
        return this.executePreparedReplace();
    },

    // ------------------------------------------------------------ pending replacement

    // Returns false when the note did not reach the disk, so the caller does not report
    // a restore as durable when nothing durable happened.
    //
    // And it does NOT adopt the document in memory unless the write landed. It used to
    // set _replace first, so a failed write left this device believing a restore was
    // pending that no other session would ever find - the worst of both: it refused to
    // adopt snapshots on account of a record that did not exist.
    // Returns whether the record is genuinely gone. A remove that quietly does nothing -
    // and localStorage can - would leave a restore nobody wants waiting to be resumed by
    // the next session, while this one reports it cancelled.
    forgetReplace() {
        this._replace = null;
        // remove() can throw; Store catches it and marks storage unavailable, which is
        // not the same as the bytes being gone.
        try { Store.remove(REPLACE_KEY); } catch (error) { /* checked below */ }
        Store.forget(REPLACE_KEY);

        // The frozen companion goes with the transaction it belongs to.
        //
        // It is written first and normally dropped the moment the raw record is rewritten
        // over it - but on the path where the companion was ALREADY frozen on an earlier
        // open, the raw record is never rewritten and nothing else ever removed it. A
        // whole schedule document was left on a phone the app warns about running out of
        // room on: nothing would read it again, and every rescue export from then on
        // carried a finished restore. It is removed here, at the one point where the
        // transaction is over however it got there, and never reported as a failure -
        // the transaction ended, and this is bytes about a transaction that is done.
        try { Store.remove(LEGACY_UPGRADE_KEY); } catch (error) { /* bytes, not truth */ }
        Store.forget(LEGACY_UPGRADE_KEY);

        // With no readable storage there is no way to prove anything left the disk, and
        // Store.available === false is not that proof.
        if (!Store.available) return false;
        if (Store.durableGet(REPLACE_KEY) === null) return true;

        // The delete did not take. A tombstone says the same thing in a way that only
        // needs a WRITE to work, which is a different failure mode.
        const tombstone = replacementEnvelope(null, 'cancelled', replacementId());
        if (Store.setVerified(REPLACE_KEY, JSON.stringify(tombstone))) {
            this._replace = tombstone;
            return true;
        }

        // Neither worked, so the record is still there and WILL be resumed. Saying
        // otherwise is the one answer that would let it surprise somebody later.
        try {
            this._replace = readReplacementRecord(JSON.parse(Store.durableGet(REPLACE_KEY)));
        } catch (error) {
            this._replace = null;
        }
        return false;
    },

    rememberReplace(envelope) {
        if (this.replaceDamaged || farkadWritesBlocked()) return false;
        if (!Store.available) return false;

        const landed = Store.setVerified(REPLACE_KEY, JSON.stringify(envelope));
        if (landed) {
            this._replace = envelope;
            // The most dangerous thing this app queues has just become outstanding, and
            // the line was still reading "מסונכרן" from before it. See refreshStatus.
            this.refreshStatus();
            return true;
        }

        // The write failed, and Store keeps required writes in its session cache so the
        // rest of this session can still read what it wrote. For THIS record that cache
        // is a phantom: a restore that was refused, readable all session, executed by
        // the next snapshot. Taken back out.
        Store.forget(REPLACE_KEY);
        this._replace = null;
        return false;
    },

    // The envelope, or null. Never the bare document - callers that want that ask for
    // pendingReplaceDocument().
    pendingReplace() {
        if (this._replace) {
            return this._replace.phase === 'cancelled' ? null : this._replace;
        }
        if (this.replaceDamaged || this.replaceHeld) return null;

        // durableGet, not get. A required write the disk refused still sits in the
        // session cache, so reading the pending record through get() found one that does
        // not exist on the disk - and a later snapshot then executed a restore this app
        // had already reported as refused.
        const raw = Store.durableGet(REPLACE_KEY);
        if (!raw) return null;

        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (error) {
            // It used to copy this optionally and then DELETE the original. That record
            // is a restore somebody asked for and was told had happened - the state they
            // are looking at - and deleting it removed the only description of what was
            // supposed to reach the other two phones.
            console.error('Pending replacement unreadable, holding it:', error);
            this.replaceDamaged = true;
            Recovery.damaged(REPLACE_KEY, raw,
                'שחזור שהמתין לשליחה לענן לא נקרא.');
            return null;
        }

        const envelope = readReplacementRecord(parsed)
            || this.freezeLegacyReplacement(parsed, raw);

        if (!envelope) {
            if (this.replaceHeld) return null;      // legacy, and the upgrade would not write
            // Parseable, and not a restore. Treated exactly like unreadable: the raw
            // bytes stay where they are, a copy is taken, and nothing is applied.
            console.error('Pending replacement is not a schedule; holding it.');
            this.replaceDamaged = true;
            Recovery.damaged(REPLACE_KEY, raw,
                'הרישום של שחזור שממתין לשליחה אינו תקין.');
            return null;
        }

        this._replace = envelope;
        return this._replace.phase === 'cancelled' ? null : this._replace;
    },

    // A genuine v71 record, turned into an envelope ONCE and written down.
    //
    // v71 stored the bare cloud document and cleared the whole queue on success, so the
    // record carries no supersede boundary. The equivalent without a blanket clear is
    // "everything queued at the moment this record is first read". Computing that in
    // memory and leaving the raw record alone - which is what the previous version did -
    // meant it was computed AGAIN at the next open, against a queue that had grown: an
    // edit made after the restore was asked for was outside the boundary on the first
    // open and inside it on the second, and the retry deleted it.
    //
    // So the boundary, the transaction id, the cloud flag and the stamp are frozen and
    // persisted before anything is allowed to depend on them. The order is the usual one:
    //
    //   1. write the upgrade to a SECOND key and read it back    - now two records exist
    //   2. write it over the raw record                          - now one, and it is v2
    //   3. drop the companion
    //
    // The raw v71 bytes are never overwritten until step 1 has been verified, so there
    // is no moment at which the only description of that restore is in memory.
    //
    // If step 1 will not write, nothing is upgraded and nothing is guessed at. The record
    // stays exactly as it is, recording stops, and the person is told what is actually
    // wrong - which is that the device is full.
    freezeLegacyReplacement(parsed, raw) {
        if (!isLegacyReplacement(parsed)) return null;

        const companion = this.readFrozenLegacy(parsed);
        if (companion.state === 'frozen') return companion.envelope;
        if (companion.state === 'unusable') {
            // A companion that is there and cannot be trusted. Absence means "nothing has
            // been frozen yet"; this means "something was, and it no longer says what".
            //
            // The two were treated alike, and that was the whole of this bug: the
            // boundary was computed again - against a queue that had grown since - and
            // written over the companion, so a day recorded after the restore was outside
            // the boundary yesterday and inside it today, and the retry deleted it with
            // nothing anywhere reporting a fault.
            //
            // Nothing is recomputed, nothing is overwritten, and the bytes are kept.
            this.replaceHeld = true;
            // Held, not merely reported - see Recovery.damaged's fourth argument. A copy
            // of these bytes is not enough to make it safe to carry on: this record is
            // the boundary of a transaction that has not finished, and recording past it
            // is what empties the queue of the very entries that transaction still owes.
            Recovery.damaged(LEGACY_UPGRADE_KEY, companion.raw,
                'הרישום שמלווה שחזור ישן שממתין לשליחה אינו תקין. הרישום לא נמחק, ' +
                'והרישום מושבת עד שהנתונים הגולמיים ייוצאו.', true);
            return null;
        }

        this.loadOutbox();
        const document = Object.assign({}, upgradeStoredSchedule(parsed));
        // v71 captured the document before State.save stamped it, so a genuine record
        // can carry updatedAt: null - which the rules refuse on every attempt, forever.
        if (typeof document.updatedAt !== 'string' || !document.updatedAt) {
            document.updatedAt = new Date().toISOString();
        }
        if (typeof document.updatedBy !== 'string' || !document.updatedBy) {
            document.updatedBy = syncDeviceId();
        }

        // The operations queued at the moment of the freeze, named. A v71 record cannot
        // say what its own boundary was, so this is the most that can honestly be
        // claimed - and it is strictly safer than the number, which would sweep up
        // anything a second tab numbered the same way afterwards.
        const superseded = this.physicalOperations().map(op => op.opId);

        const frozen = replacementEnvelope(
            document, 'prepared', 'legacy_' + replacementId().slice(2), this._seq, true,
            superseded);

        if (!Store.setVerified(LEGACY_UPGRADE_KEY, JSON.stringify(frozen))) {
            // No second copy, so the raw record is still the only one there is. It is
            // left exactly where it is and nothing acts on it.
            this.replaceHeld = true;
            Store.forget(LEGACY_UPGRADE_KEY);
            Recovery.halt('replace-upgrade',
                'אין מקום במכשיר לסיים שחזור ישן שממתין לשליחה. הרישום לא נמחק. ' +
                'ייצא גיבוי, פנה מקום, ופתח מחדש.');
            return null;
        }

        // Two verified copies exist now, so the raw one may be replaced.
        if (Store.setVerified(REPLACE_KEY, JSON.stringify(frozen))) {
            Store.remove(LEGACY_UPGRADE_KEY);
            Store.forget(LEGACY_UPGRADE_KEY);
        }
        // If that second write failed, the companion is what the next open reads, and
        // the boundary it holds is the one frozen here. Either way it is never recomputed.
        return frozen;
    },

    // The frozen upgrade written on an earlier open. Three answers, not two:
    //
    //   absent   - nothing has been frozen yet, so freezing it now is the right move
    //   frozen   - it is here, it reads, and it describes THIS record: use it
    //   unusable - it is here and it does not: do not read past it, and do not write
    //              over it either
    //
    // The third case covers a companion whose bytes are damaged AND one that is perfectly
    // readable but belongs to a different restore. Reusing a stale-but-valid companion
    // would apply one transaction's boundary to another; overwriting it would destroy the
    // only record of that other transaction. Both are refused.
    readFrozenLegacy(parsed) {
        const raw = Store.durableGet(LEGACY_UPGRADE_KEY);
        if (raw === null) return { state: 'absent' };

        let frozen = null;
        try {
            frozen = readReplacementRecord(JSON.parse(raw));
        } catch (error) {
            frozen = null;
        }
        if (!frozen) return { state: 'unusable', raw };

        return replacementContent(frozen.document) === replacementContent(parsed)
            ? { state: 'frozen', envelope: frozen }
            : { state: 'unusable', raw };
    },
});
