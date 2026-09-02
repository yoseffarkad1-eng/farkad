// ---------------------------------------------------------------- the connection and the status line
//
// Split out of js/sync/sync.js at v102. The code is unchanged: the same method bodies in
// the same order, added to the same object through Object.assign, plus the two functions
// that write the app's own notices. Nothing was renamed and nothing was tidied on the way
// past.
//
// WHAT THIS FILE OWNS: being connected, and saying so truthfully. Attaching the adapter,
// the listener and its re-attachment after a failure, the recovery hold, and the ONE
// sentence the person actually reads - the sync line in the ⋯ panel and the banner above
// the board.
//
// WHAT IT MUST NEVER DO:
//   - say «מסונכרן» while anything is owed, held, unreadable or unheard. honestStatusFor
//     is the gate and it only ever demotes: it can turn a claimed 'synced' into the truth,
//     and it can never promote anything into it. Six places in this app could once make
//     that claim and each was right about its own half; this is where they were made to
//     agree, and tests/status.test.mjs is the record of every way it was wrong.
//   - report a state without a reason a person can act on. A refusal names whether the
//     cloud refuses this phone's writes, whether the sign-in is gone, or whether there is
//     simply no reach - because the three have three different answers on a building site.

Object.assign(FarkadSync, {
    connect(adapter) {
        // One subscription per session, whatever calls this and however often.
        //
        // onAuthStateChanged fires again on a token refresh, on a re-sign-in, and after
        // Recovery is acknowledged and the cloud is started for the first time in a
        // session that booted blocked. Every one of those used to add a listener beside
        // the last one, so the same snapshot arrived twice and receive() ran twice on it
        // - two adoptions, two archive attempts, and two flushes racing each other with
        // the same queue behind them.
        this.stopListening();

        this.adapter = adapter;
        this.loadOutbox();
        this._recoveryHold = false;
        this.setStatus('connecting');

        // A site loses signal for minutes at a time and gets it back with nobody
        // touching anything. Without this the queue waits for the next edit to notice.
        if (!this._watchingConnection && typeof window !== 'undefined'
            && typeof window.addEventListener === 'function') {
            this._watchingConnection = true;
            window.addEventListener('online', () => {
                this._retryAt = 0;
                // A listener that died while the signal was gone is tried again the
                // moment it is back, rather than left to its own ladder.
                if (this._listenerDead) this.relisten();
                if (this.pendingReplace()) this.resumeReplace();
                else this.flush();
            });
        }

        // A fresh subscription; whatever an earlier one was going back for is moot.
        clearTimeout(this._relistenTimer);
        this._relistenTimer = null;
        this._relistenAt = 0;
        this.listen();

        // Anything left over from a previous session goes out as soon as there is
        // somewhere to send it. The replacement goes first: the queued field edits
        // belong to a state it is about to replace.
        if (this.pendingReplace()) this.resumeReplace();
        else if (this.pendingCount() > 0) this.scheduleFlush();
    },

    disconnect() {
        this.adapter = null;
        // Whatever this session heard belonged to a connection that is gone. The next one
        // starts from silence, and the barrier closes again.
        this._heardFromCloud = false;
        this._archivedOn = null;
        clearTimeout(this._timer);
        clearTimeout(this._retryTimer);
        clearTimeout(this._relistenTimer);
        this._timer = null;
        this._retryTimer = null;
        this._relistenTimer = null;
        this._sending = new Map();
        this._stamp = null;
        // The outbox and any pending replacement are deliberately NOT cleared. Signing
        // out, or the auth token expiring, must not be a way to lose edits that were
        // never sent - they are still true, and the next sign-in is where they go.
        this.setStatus('off');
    },

    // Whatever this session was listening to, stopped. Called before subscribing again,
    // never on sign-out: disconnect() deliberately leaves the connection alone, because
    // signing out is not a reason to stop hearing what the other phones are doing until
    // the page is gone.
    _unsubscribe: null,

    stopListening() {
        const stop = this._unsubscribe;
        this._unsubscribe = null;
        if (typeof stop !== 'function') return;
        try {
            stop();
        } catch (error) {
            console.error('Could not stop the previous subscription:', error);
        }
    },

    // A LISTENER THAT HAS DIED, and why it is a fact the status has to know.
    //
    // A Firestore onSnapshot listener whose error callback has fired delivers nothing
    // further: the subscription is over, and only a new one hears again. The adapter's
    // onError used to be routed into fail() and left there - 'error' on the line, which
    // was right, and nothing subscribing again, which meant the line stayed right only
    // until this phone's next send. A send that lands is the recovery from whatever the
    // line was showing, so the status went to 'synced' - over a phone that could not
    // hear the other two. Mis-deployed rules, an address dropped and restored, any
    // terminal listener error mid-evening: the phone keeps recording, each write lands,
    // the line says «מסונכרן», and a day the other phone corrected is priced here at the
    // old site with the status vouching for it. Measured in tests/status.test.mjs.
    //
    // So the death is written down, the status refuses 'synced' while it stands (see
    // honestStatusFor), a new subscription is tried on a ladder of its own, and the flag
    // is cleared by exactly one thing: a snapshot delivered by a listener - which is the
    // only proof there is that this phone hears again.
    _listenerDead: false,
    // The error the listener died ON, kept until a listener delivers again. lastError is
    // overwritten by every setStatus - a write of this phone's own that lands asks for
    // 'synced', honestStatusFor answers 'error' for the dead listener, and the refusal
    // that killed it is replaced with null. The status stayed right and the reason was
    // gone: the panel could say the sync had failed and nothing about the cloud
    // refusing this phone, one write after it had said so. Measured in
    // tests/status.test.mjs.
    _listenerError: null,
    _relistenTimer: null,
    _relistenAt: 0,

    listen() {
        const stop = this.adapter.subscribe(
            snapshot => {
                if (this._listenerDead) {
                    this._listenerDead = false;
                    this._listenerError = null;
                    this._relistenAt = 0;
                    clearTimeout(this._relistenTimer);
                    this._relistenTimer = null;
                }
                this.receive(snapshot);
            },
            error => this.listenerFailed(error)
        );
        this._unsubscribe = typeof stop === 'function' ? stop : null;
    },

    listenerFailed(error) {
        this._listenerDead = true;
        this._listenerError = error || null;
        this.fail(error);
        this.scheduleRelisten();
    },

    // Its own ladder, not the send ladder. The send ladder is cleared by a send that
    // lands - correctly, there is nothing left to go back for - and it is the one thing
    // honestStatusFor reads as "still sending": a dead listener riding on it would have
    // been cancelled by the very write that made the line lie, or would have had the
    // line say something was being sent when nothing was.
    scheduleRelisten() {
        if (!this.adapter) return;
        this._relistenAt = this._relistenAt
            ? Math.min(this._relistenAt * 2, RETRY_MAX_MS)
            : RETRY_FIRST_MS;
        clearTimeout(this._relistenTimer);
        this._relistenTimer = setTimeout(() => {
            this._relistenTimer = null;
            this.relisten();
        }, this._relistenAt);
    },

    relisten() {
        if (!this.adapter) return;
        this.stopListening();
        this.listen();
    },

    // ------------------------------------------------------- held back by Recovery
    //
    // A device that opened onto a damaged record does not start the cloud at all: the
    // import is skipped, so nothing connects, and until v79 nothing ever started it
    // again either. Acknowledging the damage turned writing back on and left this
    // device alone with them - recording all evening, saying "הנתונים נשמרים במכשיר
    // הזה בלבד", with the other two phones seeing none of it.
    //
    // So the state is named rather than left looking like an ordinary local-only app,
    // and acknowledging is what releases it.
    _recoveryHold: false,

    holdForRecovery() {
        this._recoveryHold = true;
        if (this.status === 'off') this.setStatus('blocked');
    },

    releaseRecoveryHold() {
        this._recoveryHold = false;
        // Back to 'off' and no further: the cloud is starting, not started. The adapter
        // says 'connecting' when it actually connects, and a project with no Firebase
        // configured never does - "מתחבר לענן…" for ever would be a worse lie than the
        // one this replaces.
        if (this.status === 'blocked') this.setStatus('off');

        // AND THE SNAPSHOT THE HOLD REFUSED, run again now that it may be adopted.
        //
        // A sighting that arrives mid-session - a poisoned layer in another phone's
        // document, beside that phone's perfectly readable evening - blocks writing
        // inside normaliseSchedule, so receive() cannot persist and rolls back. Right.
        // Then the person exported and acknowledged, and nothing happened: this method
        // reset a status, connectCloudLater found the cloud already started, the
        // listener does not fire again for a document that has not changed, and the
        // snapshot receive() had already been handed sat in _latestRaw unread. The
        // readable day stayed off the screen and the disk, the line said error, until
        // another phone happened to write - and with the other phones idle, never.
        // Measured in tests/snapshot.poison.test.mjs.
        //
        // The same bytes are the same sighting: Recovery.evidence answers a second
        // report of them from the first copy and does not block again, so the re-run
        // lands, the status is re-derived, and anything owed is scheduled - exactly
        // what readoptAfter does with the same snapshot after an acknowledgement.
        if (this._heldSnapshot && this._latestRaw && typeof this._latestRaw === 'object') {
            this._heldSnapshot = false;
            this.receive(this._latestRaw);
        }
    },

    // True while the last snapshot heard was refused because writing was blocked - by
    // a record this device could not read, or by one it had just been handed. Cleared
    // by the next snapshot, and by the re-run above.
    _heldSnapshot: false,

    // WHAT 'synced' ACTUALLY CLAIMS, and why it is checked at one door.
    //
    // It says: everything this person recorded is on the other two phones. Six callers
    // could set it, and every one of them was right about its own half - a snapshot
    // adopted, a batch acknowledged, a restore finished - while being wrong about the
    // whole. Measured: a device with six roster operations held behind the initial
    // snapshot barrier sent one safe day patch, acknowledged it, and the line read
    // "מסונכרן" with six still on the disk. Then back to "מתחבר", then synced again. A
    // person watching that has been told the opposite of the truth, twice.
    //
    // So the claim is tested here rather than at six call sites, and it returns the
    // status that IS true instead. Nothing about this makes a status stickier: the moment
    // the queue empties the next setStatus('synced') is allowed through.
    honestStatusFor(status) {
        if (status !== 'synced') return status;
        // A record this device could not read. Nothing may be called finished while the
        // financial history is uncertain - see js/recovery.js.
        if (typeof farkadWritesBlocked === 'function' && farkadWritesBlocked()) return 'blocked';
        // A whole-document restore that has not reached the cloud. The most dangerous
        // thing this app queues, and the one a person is most likely to walk away from.
        if (this.pendingReplace()) return 'sending';
        // A write the server refused and this device has stopped offering. It is owed,
        // it is durable, and it is not going anywhere until a person looks at it - so it
        // is neither 'synced' nor the 'sending' that says something is on its way.
        if (this.holdingContested()) return 'contested';
        // Anything still owed, whatever went out beside it. A partial send is not a send.
        if (this.pendingCount() > 0) return 'sending';
        // And work the ladder is still going back for.
        if (this._retryTimer) return 'sending';
        // A phone that cannot hear. Everything it recorded may well be on the other two
        // phones; what they corrected is not on this one, and 'synced' claims both.
        // 'error' is what the listener's own failure set, and it stays until a listener
        // delivers again - see listen().
        if (this._listenerDead) return 'error';
        // THE SAME DEAFNESS, REACHED BY THE OTHER ROAD.
        //
        // receive() refuses every arriving snapshot while a pending restore will not
        // parse: nobody can say what that restore was meant to replace, so adopting
        // anything over it could undo it. That is right, and it is permanent - law 10
        // means the unreadable record is never deleted, so this state survives every
        // reopen.
        //
        // What was wrong is that it said nothing. It sets no status, and it is
        // deliberately NOT the _heldSnapshot the recovery release re-runs; pendingReplace()
        // answers null while it stands, so the restore guard above is satisfied too. So
        // the person acknowledged the quarantine, writing resumed, and the phone's own
        // next write put «מסונכרן» under a device that had stopped adopting anything at
        // all. Its own writes still land, so the other two phones look healthy - only
        // this one is blind, and it is the one vouching for itself.
        //
        // The listener is alive here, which is why this is not 'offline': the connection
        // is fine and the phone is the problem. tests/status.test.mjs, «a phone whose
        // pending restore will not parse is not finished either».
        if (this.replaceDamaged) return 'error';
        return 'synced';
    },

    setStatus(status, error) {
        const said = this.honestStatusFor(status);
        this.status = said;
        this.lastError = error || null;
        if (said === 'synced') {
            this.lastSyncedAt = new Date();
        }
        updateSyncNotice();
    },

    fail(error) {
        console.error('Sync error:', error);
        // A HELD PATH IS NOT A FAILURE, and gets its own line.
        //
        // The server refusing to let an older write put back a value somebody else
        // corrected is the protocol working, and the edit is safe on this disk. Reported
        // as 'error' it wore the same sentence a tunnel produces - so the one situation a
        // person can actually resolve looked like the one they cannot.
        //
        // Decided HERE rather than at the throw site because a conflict reaches this
        // function by more than one route - the rebase ceiling, a second conflict on the
        // retry - and a status set on only one of them is a status that appears
        // sometimes.
        this.setStatus(error && error.contested && error.contested.length > 0
            ? 'contested' : 'error', error);
    },

    // The right to send is stuck, and a person can see it. See claimIsFree.
    noteClaimTrouble(why) {
        if (this._claimStuck) return;
        this._claimStuck = true;
        this.setStatus('claimstuck', new Error(why));
    },

    // Cleared the moment a claim is actually taken, so a fault that healed does not leave
    // the screen alarming about it.
    clearClaimTrouble() {
        if (!this._claimStuck) return;
        this._claimStuck = false;
        if (this.status === 'claimstuck') this.setStatus('connecting');
    },
    _claimStuck: false,
});

Object.assign(FarkadSync, {
    scheduleFlush() {
        clearTimeout(this._timer);
        this._timer = setTimeout(() => this.flush(), this.pushDelayMs);
        // AFTER the flush is scheduled, and that order is deliberate. The line going
        // honest is worth doing and it is not worth risking the send: anything this throws
        // - a disk that will not answer, a notice that will not draw - must not be able to
        // leave the queue with nothing scheduled to carry it.
        //
        // The window it closes: between an edit being journalled and the flush that takes
        // it, the status still read "מסונכרן" with the edit sitting on the disk.
        this.refreshStatus();
    },

    // Ask the gate again about the status this device is already showing.
    //
    // setStatus only tests the claim at the moment it is made, and owed-ness changes
    // underneath a status that has already been set: an edit is journalled, a restore is
    // prepared, a record turns out to be unreadable. Cheap enough to call at each of
    // those - it is once per event, not once per render - and it never promotes anything:
    // honestStatusFor leaves every status but 'synced' exactly as it found it.
    refreshStatus() {
        if (this.status === 'synced') this.setStatus('synced');
    }
});

// One line under the board covering both questions the manager actually has: where the
// The two storage failures - blocked, and full - are the only states where a change the
// person just made is NOT written down. That cannot be a grey line under the fold, below
// two fixed bottom bars: it goes in a banner at the top, with the one button that turns
// the situation around. `text` of null clears it.
function showStorageBanner(text) {
    const banner = document.getElementById('storageBanner');
    if (!banner) return;

    if (!text) {
        banner.style.display = 'none';
        // Forgotten as well as hidden: the next occurrence of the SAME failure must
        // show again, and the memo below would short-circuit it into permanent silence.
        delete banner.dataset.text;
        return;
    }
    if (banner.dataset.text === text) return;   // already saying exactly this

    banner.dataset.text = text;
    clear(banner);
    banner.appendChild(el('span', null, text));
    banner.appendChild(button('💾 שמור גיבוי', 'btn-secondary', () => exportBackup()));
    banner.style.display = '';
}

// data lives, and whether the other device is seeing the same thing.
function updateSyncNotice() {
    const notice = document.getElementById('storageNotice');
    if (!notice) return;

    // Data held only in memory must never look like data that survives a refresh.
    if (typeof Store !== 'undefined' && !Store.available) {
        const text = '⚠️ הדפדפן חוסם שמירה. הנתונים יימחקו ברענון - ייצא קובץ גיבוי.';
        notice.textContent = text;
        showStorageBanner(text);
        return;
    }

    // Full is not blocked: what is already saved is safe, but the last change is not.
    if (typeof Store !== 'undefined' && Store.full) {
        const text = '⚠️ אין מקום פנוי במכשיר והשינוי האחרון לא נשמר - ייצא קובץ גיבוי ופנה מקום.';
        notice.textContent = text;
        showStorageBanner(text);
        return;
    }

    // A write that neither threw nor came back as written. Rarer than a full device and
    // worse, because nothing anywhere reports it - the only way to know is that the save
    // read back as something else, which is exactly what State.save now checks.
    if (typeof State !== 'undefined' && State.saveFailed) {
        const text = '⚠️ השינוי האחרון לא נשמר במכשיר. ייצא קובץ גיבוי עכשיו.';
        notice.textContent = text;
        showStorageBanner(text);
        return;
    }

    showStorageBanner(null);

    const messages = {
        off: 'הנתונים נשמרים במכשיר הזה בלבד.',
        blocked: 'הסנכרון מושהה עד שהנתונים הפגומים ייוצאו. הרישום שמור במכשיר הזה בלבד.',
        connecting: 'מתחבר לענן…',
        claimstuck: 'הרישום שמור במכשיר. השליחה תקועה - סגור את שאר החלונות של האפליקציה, '
            + 'ואם זה נמשך ייצא גיבוי ופתח מחדש.',
        synced: 'מסונכרן בין המכשירים.',
        // CONNECTED, AND NOT FINISHED. The state between them, which the line had no word
        // for: everything is on this disk, some of it has gone, and the rest has not. It
        // is not 'connecting' - the connection is made - and it is emphatically not
        // 'synced'. The queue count the line already appends says how much.
        sending: 'מחובר. יש רישומים שעדיין נשלחים.',
        offline: 'אין חיבור - השינויים יישלחו כשהחיבור יחזור.',
        error: 'שגיאת סנכרון - הנתונים שמורים במכשיר הזה.',
        contested: 'הנתונים השתנו במכשיר אחר. הפעולה שלך לא אבדה - '
            + 'רענן, בדוק את המסך, ואשר שוב.'
    };

    // The browser knows the signal is gone before the write watchdog does, and a line
    // still reading "מסונכרן" under the offline banner is the two of them disagreeing
    // in one glance. Only the cloud states defer to it - a device that never had a
    // cloud is off, not offline. 'error' defers too: a flush that died because the
    // signal died is not a sync error worth alarming anyone with, and that status is
    // sticky. With an empty queue the line must not promise sends that do not exist -
    // there is nothing to send, and saying so is the whole difference between "wait"
    // and "worry".
    const offlineNow = typeof navigator !== 'undefined' && navigator.onLine === false;
    const cloudState = FarkadSync.status === 'synced' || FarkadSync.status === 'connecting'
        || FarkadSync.status === 'error' || FarkadSync.status === 'sending';
    const status = offlineNow && cloudState
        ? (FarkadSync.pendingCount() > 0 ? 'offline' : 'offlineClean')
        : FarkadSync.status;
    let text = status === 'offlineClean'
        ? 'אין חיבור - הכל כבר נשלח.'
        : (messages[status] || messages.off);

    if ((status === 'synced' || status === 'offline' || status === 'offlineClean')
        && FarkadSync.lastSyncedAt) {
        // Hours and minutes: the default he-IL form appends seconds, and a status line
        // is not a stopwatch. Kept while offline - how stale the cloud copy is becomes
        // the one number that matters the moment the signal drops.
        text += ` · עודכן: ${FarkadSync.lastSyncedAt.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`;
    }

    // How many edits are written down here and not yet in the cloud. Said plainly,
    // because "synced" while a day is still sitting in the queue is the same lie as a
    // green tick over a failed save - and this is the number that tells the difference
    // between "the other two can see it" and "only this phone can".
    //
    // One waits in the singular. "1 ממתינים לשליחה" is not Hebrew, and it appears on the
    // line a person reads to decide whether the other two phones can see tonight's work -
    // the number is right and the sentence around it is wrong, which is the kind of thing
    // that makes somebody doubt the number.
    //
    // The design's handoff suggested "מקדמה אחת ממתינה" here. That word is not right for
    // this line: it counts EDITS - a day assigned, a name changed, a rate set - and
    // almost none of them are advances. The app's own word for one of those is רישום, so
    // the agreement is fixed and the noun is the one this line has always been about.
    const waiting = FarkadSync.pendingCount();
    if (waiting === 1) {
        text += ' (רישום אחד ממתין לשליחה)';
    } else if (waiting > 1) {
        text += ` (${waiting} ממתינים לשליחה)`;
    }

    // Deliberately not the banner. The banner is for a change that was NOT written down;
    // this is the opposite - everything is saved, and what has stopped is the ability to
    // keep a way back. Appended rather than substituted, because the sync state is the
    // other half of the same question and a device can sit in this condition for months:
    // hiding "מסונכרן" behind it for a year would be its own bug.
    if (typeof capacityState === 'function' && capacityState() === 'critical') {
        text += ' ⚠️ אין מקום לשמור מצב קודם - ייצא קובץ גיבוי.';
    }

    notice.textContent = text;
}
