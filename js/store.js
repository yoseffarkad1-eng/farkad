// Every read and write of browser storage goes through here.
//
// localStorage is not always available: Safari private mode throws on write, some
// browsers block it inside an embedded frame, and a full disk throws QuotaExceededError
// mid-session. Touching it directly means one of those turns into an uncaught error
// during boot and the app renders nothing at all.
//
// When it is unavailable the app still runs, holding the day in memory - which is worth
// far more than a blank screen - and says so, because data that will not survive a
// refresh must never look like data that will.

// A full disk is not the same failure as a blocked one, and treating them alike is what
// makes it dangerous: storage that is merely FULL still holds everything already written
// and still accepts smaller writes once something is deleted. Declaring it dead sends the
// rest of the evening's work to memory, where the next refresh ends it.
function isQuotaError(error) {
    return error && (
        error.name === 'QuotaExceededError' ||
        error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        error.code === 22 || error.code === 1014
    );
}

// The counter every durable write moves. Its own key, outside every record family this
// app reads, so nothing that enumerates the app's records has to know about it.
const WRITE_TICK_KEY = 'farkad:writeTick';
// Written next to the counter when the fence stops working, and read by every context on
// the origin. See breakWriteFence.
const WRITE_FENCE_BROKEN_KEY = 'farkad:writeTick:broken';
// The build that last kept the fence. See bumpWriteTick.
const WRITE_FENCE_BUILD_KEY = 'farkad:writeTick:build';

const Store = {
    available: true,
    // Set when a write was refused for space. Distinct from `available`, which means the
    // browser will not let this page use storage at all.
    full: false,
    // Optional: returns true if it managed to delete something worth deleting. Registered
    // by whoever owns disposable data - Store itself must not decide what is expendable.
    reclaim: null,
    memory: {},

    // Memory first, disk second - and that order is the whole point.
    //
    // set() writes to memory and then tries the disk. Reading the disk first meant that
    // on a full device every write went to memory, every read came back null, and the
    // caller was told its own write had never happened. syncDeviceId() minted a new id on
    // every single call: each write signed by a different device, and the echo check that
    // keeps a phone from adopting its own writes with nothing stable to compare against.
    //
    // The stale case is worse than the null one. A disk holding the queue from before the
    // last edit, with the newer queue sitting in memory because the write was refused,
    // would hand back the OLD queue - so an edit that was made, and is still in this
    // session, reads as though it was not.
    //
    // memory is therefore what this session has written, and it wins. Anything not
    // written this session comes off the disk as before.
    get(key) {
        if (Object.prototype.hasOwnProperty.call(this.memory, key)) return this.memory[key];

        if (this.available) {
            try {
                return localStorage.getItem(key);
            } catch (error) {
                this.fallback(error);
            }
        }
        return null;
    },

    // What the NEXT session would see.
    //
    // Bypasses the session cache deliberately. memory holds writes the disk refused,
    // which is right for reading back something written a moment ago and exactly wrong
    // for anything whose whole job is to survive the app being closed. The journal is
    // read through this, so "what is durably queued" cannot be answered with an entry
    // that never reached the disk.
    durableGet(key) {
        if (!this.available) return null;
        try {
            return localStorage.getItem(key);
        } catch (error) {
            this.fallback(error);
            return null;
        }
    },

    // A write that is not believed until it can be read back.
    //
    // For the records where losing the write silently is the failure - the schedule, the
    // outbox, a pending restore, a quarantined copy. set() reports a refusal it was told
    // about; this also catches a disk that accepts a write and hands back something else,
    // which throws nothing and is only visible if somebody looks.
    //
    // It deliberately does NOT consult memory: reading through Store.get would find the
    // value this call just put there and confirm every write, including the ones that
    // never reached the disk. This has to ask the disk itself.
    setVerified(key, value) {
        const text = String(value);
        if (!this.set(key, text)) return false;
        if (!this.available) return false;

        try {
            return localStorage.getItem(key) === text;
        } catch (error) {
            this.fallback(error);
            return false;
        }
    },

    // `options.optional` marks a write the app can live without - a restore point, not a
    // day's record. An optional write never reclaims, because the only thing reclaim can
    // delete is other restore points: letting one buy space by eating the rest turns a
    // full device into a device with a single copy of today and no history at all. It
    // also never raises `full`, which is reserved for a write that actually mattered.
    // A counter every durable write moves, so that a reader can tell "nothing happened"
    // from "something happened and came back".
    //
    // Two readings of the same records being equal is not proof that they were taken at
    // one moment: a record can leave the disk and return between them, and the recovery
    // export was calling exactly that stable. Comparing values cannot see a value that
    // came back, so the snapshot is bracketed by something that only ever goes forward.
    //
    // Best effort, and deliberately so. A tick that cannot be written is not a reason to
    // refuse somebody's edit - it is a reason for the next snapshot to say it cannot
    // prove it was one moment, which is what unfenced() below is for.
    tick: 0,
    _ticking: false,
    unfenced: false,

    bumpWriteTick(key) {
        if (this._ticking) return;
        if (key === WRITE_TICK_KEY || key === WRITE_FENCE_BROKEN_KEY) return;
        if (key === WRITE_FENCE_BUILD_KEY) return;
        if (!this.available) return;
        // Only for a record the rescue file carries. The counter exists to prove that
        // the file's readings were one moment of this disk, and a write to a record the
        // file does not contain cannot have moved anything under it: a restore point, an
        // undo stack, a preference and the device id each cost a second synchronous write
        // to prove a quiet moment for a file none of them appear in, and a second tab
        // merely rewriting its send claim made every snapshot report itself unprovable.
        //
        // Guarded on the function existing because store.js loads before recovery.js:
        // during that window the fence is wider than it needs to be, which is the safe
        // direction to be wrong in.
        if (typeof isFarkadSnapshotKey === 'function' && !isFarkadSnapshotKey(key)) return;
        this._ticking = true;
        // Which build is participating in the fence. A build that predates it writes the
        // records the file carries and never moves the counter at all - so the OTHER
        // window, for the whole length of a rollout, is an unfenced writer that two equal
        // readings cannot see. Every phone in the field is that window today. This build
        // cannot make an older one announce itself; what it can do is record that the
        // fence is being kept by THIS build, so a snapshot can tell whether the build
        // that last wrote is one that participates at all.
        try {
            const stamp = typeof APP_VERSION === 'string' ? APP_VERSION : '';
            if (stamp && localStorage.getItem(WRITE_FENCE_BUILD_KEY) !== stamp) {
                localStorage.setItem(WRITE_FENCE_BUILD_KEY, stamp);
            }
        } catch (error) {
            // The stamp is a hint, never a gate. Its absence is handled where it is read.
        }
        try {
            const was = this.readWriteTick();

            // Unreadable, or past the point where adding one still moves it. The fence is
            // broken and the file has to be told - but the counter is RESET rather than
            // left stuck, because a counter that never moves again is a device where
            // nothing can ever be fenced, and the next honest snapshot deserves a working
            // one. The broken mark stays: this build never clears it, so no export on
            // this device claims a quiet moment again without somebody looking.
            if (was === null) {
                this.breakWriteFence('the counter could not be read');
                localStorage.setItem(WRITE_TICK_KEY, String(this.tick + 1));
                this.tick += 1;
                return;
            }

            // Backwards. The counter is a read-modify-write across two calls, so a paused
            // context resumes and puts an older value back over a newer one - measured
            // going 7 to 5 on a disk with no fault in it at all. Two equal readings across
            // that are not one quiet moment, they are a moment that was undone, and the
            // snapshot cannot see the difference by comparing values.
            if (was < this.tick) {
                this.breakWriteFence('the counter went backwards');
            }
            // Read ONCE MORE, immediately before writing. Everything between the first
            // read and the write is a window another tab can write in, and a value
            // computed from the earlier read then lands ON TOP of theirs - which is the
            // put-back this guard is about. Two reads do not close the window; they
            // narrow it, and the read-back below catches what is left.
            const fresh = this.readWriteTick();
            const base = Math.max(was, fresh === null ? was : fresh, this.tick);
            if (base > was) this.breakWriteFence('the counter moved under this write');
            const next = base + 1;
            const text = String(next);
            localStorage.setItem(WRITE_TICK_KEY, text);
            // READ BACK. This is the one write the whole stability claim rests on, and it
            // was the one write nobody looked at - on a disk this app never trusts
            // otherwise. A disk that accepts a write and hands back something else pinned
            // the counter for the life of the device with nothing flagged anywhere, and
            // every export afterwards said it was one moment of a disk it could not see.
            if (localStorage.getItem(WRITE_TICK_KEY) !== text) {
                this.breakWriteFence('the counter did not read back');
                return;
            }
            this.tick = next;
        } catch (error) {
            // No room for the counter, or no storage at all. The write itself is not the
            // counter's business; what is lost is the ability to PROVE a quiet moment.
            this.breakWriteFence('the counter could not be written');
        } finally {
            this._ticking = false;
        }
    },

    // The fence is broken, and every context on this origin has to know.
    //
    // `unfenced` was a boolean in the memory of the TAB THAT FAILED, and the exporter
    // reads its own: two tabs are two JavaScript worlds sharing one disk, so a counter
    // that stopped moving in one of them was invisible to the other, which then declared
    // its file a single quiet moment of a disk that had been written under it.
    //
    // So it is written DOWN, next to the counter. A mark that cannot itself be written is
    // the same answer once more - this tab knows, and says so in memory - and the export
    // is refused a stable verdict either way. The mark is never cleared by this build: a
    // fence that has failed once on this device cannot be trusted again without somebody
    // looking, and the cost of being wrong is a file that says an evening is in it.
    breakWriteFence(why) {
        this.unfenced = true;
        try {
            localStorage.setItem(WRITE_FENCE_BROKEN_KEY, String(why || '1'));
        } catch (error) {
            // Nothing more to do: this context knows, and a snapshot taken HERE will say
            // so. A snapshot taken in the other tab cannot know, which is exactly the
            // failure this mark exists to prevent and cannot prevent on a full disk.
        }
    },

    // Whether anything on this origin has reported the fence broken - this tab's own
    // memory, or the durable mark another tab left.
    fenceBroken() {
        if (this.unfenced) return true;
        if (!this.available) return false;
        try {
            if (localStorage.getItem(WRITE_FENCE_BROKEN_KEY) !== null) return true;
            // A counter that exists but has never been kept by a build that says so. On a
            // device where an older window is writing the records this file carries, the
            // counter simply does not move for those writes - two equal readings across
            // them mean nothing at all, and the file would call that a quiet moment.
            const stamp = typeof APP_VERSION === 'string' ? APP_VERSION : '';
            if (!stamp) return false;
            const kept = localStorage.getItem(WRITE_FENCE_BUILD_KEY);
            return kept !== null && kept !== stamp;
        } catch (error) {
            return true;
        }
    },

    // What the disk says the counter is. Read durably, because the question is about
    // what every context on this origin can see, not about what this one wrote.
    // The counter, or NULL. Null means "there is no usable fence", which the snapshot
    // already knows how to answer; it is not the same as zero.
    //
    // `Number(raw) || 0` was a coercion that failed OPEN: "abc", "", "{}", "null" and any
    // corrupted value all came back as a counter genuinely at zero, so a disk that had
    // damaged this record read as a quiet one. And there was no ceiling, so past 2^53 an
    // increment rounds away and a long digit string is Infinity - which round-trips
    // through String and Number and freezes the counter for good.
    readWriteTick() {
        if (!this.available) return null;
        try {
            const raw = localStorage.getItem(WRITE_TICK_KEY);
            if (raw === null) return 0;
            if (!/^[0-9]+$/.test(raw)) return null;
            const value = Number(raw);
            return Number.isSafeInteger(value) ? value : null;
        } catch (error) {
            return null;
        }
    },

    set(key, value, options) {
        const optional = !!(options && options.optional);

        // Kept so an optional write that the disk refuses can be taken back out again.
        const had = Object.prototype.hasOwnProperty.call(this.memory, key);
        const was = this.memory[key];
        const forget = () => { if (had) this.memory[key] = was; else delete this.memory[key]; };

        this.memory[key] = String(value);

        // No disk at all. Memory is the whole of storage here, so even an optional write
        // stays - there is nothing better for it to be.
        if (!this.available) return false;

        try {
            localStorage.setItem(key, value);
            this.bumpWriteTick(key);
            if (!optional) this.full = false;
            return true;
        } catch (error) {
            if (!isQuotaError(error)) {
                this.fallback(error);
                return false;
            }
            // An OPTIONAL write the disk refused is taken back out of memory. It is
            // optional precisely because the app can live without it, and leaving it
            // would make a restore point that will not survive a reload appear in the
            // list beside ones that will. A required write stays: this session made it,
            // this session has to keep seeing it, and the caller is told it did not land.
            if (optional) { forget(); return false; }

            // Out of space. Throw away something expendable and try the real write again
            // - the day's record is worth more than any number of old restore points.
            while (this.reclaim && this.reclaim()) {
                try {
                    localStorage.setItem(key, value);
                    this.bumpWriteTick(key);
                    this.full = false;
                    return true;
                } catch (retryError) {
                    if (!isQuotaError(retryError)) {
                        this.fallback(retryError);
                        return false;
                    }
                }
            }

            this.full = true;
            console.warn('Browser storage is full; this write did not land on disk:', error);
            if (typeof updateSyncNotice === 'function') updateSyncNotice();
            return false;
        }
    },

    // Drops a key from the session cache without touching the disk.
    //
    // For a required write that the disk refused: memory keeps it so the rest of the
    // session can read what it wrote, which is right for the schedule and wrong for a
    // record whose whole meaning is "this is on the device". The caller decides which.
    forget(key) {
        delete this.memory[key];
    },

    remove(key) {
        delete this.memory[key];
        if (!this.available) return;
        try {
            localStorage.removeItem(key);
            this.bumpWriteTick(key);
        } catch (error) {
            // NOT a reason to declare storage gone. This used to call fallback, which
            // sets available = false - and from that moment durableGet answered null for
            // every key on the device. Anything asking "is this record still there?" was
            // told no, by a disk that had simply stopped answering, and one caller read
            // that as "confirmed absent". See removeVerified.
            console.warn('Browser storage refused a removal:', key, error);
        }
    },

    // A removal that is not believed until the key is READ BACK as gone.
    //
    // For the records where "it is no longer there" is a claim somebody acts on - the
    // provenance facts that decide whether a man can be destroyed for good. A removal
    // that threw, and a removal onto a disk that will not answer, are both FALSE here:
    // being unable to read a key has never been proof that it is absent, and treating it
    // as proof is how a device came back from a failed handover still claiming that
    // everybody on it was only ever its own.
    removeVerified(key) {
        delete this.memory[key];
        if (!this.available) return false;

        try {
            localStorage.removeItem(key);
            this.bumpWriteTick(key);
        } catch (error) {
            console.warn('Browser storage refused a removal:', key, error);
            return false;
        }

        try {
            return localStorage.getItem(key) === null;
        } catch (error) {
            this.fallback(error);
            return false;
        }
    },

    // What the browser will let this origin hold, in bytes.
    //
    // Nobody publishes this number in a form a page can read: navigator.storage.estimate()
    // answers for the origin's whole quota - IndexedDB, caches, everything - and reports
    // gigabytes on a phone whose localStorage stops at five megabytes. So it is a constant,
    // and it is the SMALLEST of the ones that matter: Safari and iOS Safari give 5 MiB per
    // origin, Chrome about twice that. This app is for a phone in a pocket on a building
    // site, so the phone's number is the one to plan against - and warning a little early
    // on a roomier browser costs nothing, while warning late on the small one costs the
    // evening's records.
    budget: 5 * 1024 * 1024,

    // How much of that this app is already holding.
    //
    // Browsers charge in UTF-16 code units - two bytes a character - and charge for the
    // key as well as the value. Counting characters and calling them bytes understates a
    // Hebrew record by half, and it is exactly that half which decides whether the next
    // copy still fits.
    used() {
        let bytes = 0;
        this.keys().forEach(key => {
            const value = this.get(key);
            if (value === null) return;
            bytes += (key.length + String(value).length) * 2;
        });
        return bytes;
    },

    // Everything this session can see: what is on the disk, plus anything written this
    // session that did not reach it. A restore point held only in memory is still a
    // restore point, and the list that offers them reads this.
    keys() {
        const seen = new Set(Object.keys(this.memory));

        if (this.available) {
            try {
                Object.keys(localStorage).forEach(key => seen.add(key));
            } catch (error) {
                this.fallback(error);
            }
        }
        return [...seen];
    },

    fallback(error) {
        if (!this.available) return;
        this.available = false;
        console.warn('Browser storage unavailable, holding data in memory only:', error);
        if (typeof updateSyncNotice === 'function') updateSyncNotice();
    }
};

// Probe once at load rather than discovering it mid-edit.
(function probeStorage() {
    try {
        const probe = '__farkad_probe__';
        localStorage.setItem(probe, '1');
        localStorage.removeItem(probe);
    } catch (error) {
        // A device with no free space throws here too, and that is the misdiagnosis this
        // file opens by warning about: storage that is merely FULL still holds every day
        // already recorded and still accepts writes once something is deleted. Calling it
        // unavailable would skip the reclaim ladder in set() and send the whole evening
        // to memory, where the next refresh ends it.
        if (isQuotaError(error)) {
            Store.full = true;
            console.warn('Browser storage is full; writes will make room first:', error);
            return;
        }
        Store.available = false;
        console.warn('Browser storage unavailable, holding data in memory only:', error);
    }
})();
