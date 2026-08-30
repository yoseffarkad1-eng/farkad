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
// One counter PER TAB, and the fence is all of them together.
//
// A single shared counter is a read-modify-write across two calls, which means one tab can
// put an older value back over a newer one - measured going 1 to 3 to 2, with two equal
// readings around it and no mark anywhere. Guarding it with a second read narrows the gap
// and cannot close it: whatever the last read saw, another tab can still write between
// that read and this write.
//
// So no tab writes a value another tab owns. Each writes only its own key, only ever
// upward, and the evidence a snapshot compares is the whole set. A put-back is then
// impossible by construction rather than by timing: for the set to look unchanged, every
// tab that wrote would have to lower its own counter, and no tab ever lowers its own.
//
// The shared counter stays, written alongside, because a build in the field reads it and
// because it costs nothing. Nothing here decides anything from it any more.
const WRITE_TICK_TAB_PREFIX = 'farkad:writeTick:tab:';
// Written next to the counter when the fence stops working, and read by every context on
// the origin. See breakWriteFence.
const WRITE_FENCE_BROKEN_KEY = 'farkad:writeTick:broken';
// Far below 2^53, so a counter approaching it rolls to a new key long before an increment
// can round away. See bumpWriteTick.
const COUNTER_CEILING = 9007199254740000;

// One counter, read strictly: digits only, and a safe integer, or null. `Number(raw) || 0`
// failed OPEN - "abc", "", "{}" and every corrupted value came back as a counter genuinely
// at zero, so a disk that had damaged this record read as a quiet one.
function readCounter(key) {
    try {
        const raw = localStorage.getItem(key);
        if (raw === null) return 0;
        if (!/^[0-9]+$/.test(raw)) return null;
        const value = Number(raw);
        return Number.isSafeInteger(value) ? value : null;
    } catch (error) {
        return null;
    }
}

// Is a service worker in charge of this page? Only then can two builds be running on one
// origin at once, and only then is a census of open builds a thing that can be missing.
function hasServiceWorker() {
    try {
        return typeof navigator !== 'undefined'
            && Boolean(navigator.serviceWorker)
            && Boolean(navigator.serviceWorker.controller);
    } catch (error) {
        return false;
    }
}

// The census of which builds have a window open, as the service worker reported it. See
// noteOpenBuilds.
const OPEN_BUILDS_KEY = 'farkad:openBuilds';
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
        if (String(key).indexOf(WRITE_TICK_TAB_PREFIX) === 0) return;
        if (key === OPEN_BUILDS_KEY) return;
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
        this._retryBrokenMark();
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
            // THIS TAB'S OWN COUNTER, which no other tab ever writes.
            //
            // Read, add one, write, read back. The read-modify-write is still there and it
            // no longer matters: the only writer of this key is this tab, and this tab is
            // one thread. What used to make it dangerous was that the value was shared.
            const mine = this._tabKey();
            const was = readCounter(mine);
            if (was === null) {
                // Unreadable, or a value this build cannot use. The fence is broken and
                // stays broken - but the counter is reset rather than left stuck, so the
                // next honest snapshot has a working one.
                this.breakWriteFence('this tab\'s counter could not be read');
                this._writeCounter(mine, 1);
                this.tick = 1;
                return;
            }

            // The ceiling, handled rather than hit.
            //
            // Adding one past 2^53 rounds away, and String(Number(huge)) is '1e+300' or
            // 'Infinity' - neither of which reads back as a counter, so the fence froze
            // for the life of the device and the claimed reset never happened. Long before
            // that, this tab starts a NEW key with a fresh epoch and counts from one in
            // it. The old key stays where it is: it is still evidence of writes that
            // happened, and the set the snapshot compares simply grows by one member.
            if (was >= COUNTER_CEILING) {
                this._epoch += 1;
                const next = this._tabKey();
                this._writeCounter(next, 1);
                this.tick = 1;
                return;
            }

            if (!this._writeCounter(mine, was + 1)) {
                this.breakWriteFence('this tab\'s counter did not read back');
                return;
            }
            this.tick = was + 1;

            // The shared counter, kept for a build in the field that reads it. Nothing
            // here decides anything from it, and it is written last so a failure to write
            // it cannot cost this tab its own evidence.
            try {
                const shared = this.readWriteTick();
                if (shared !== null && shared < COUNTER_CEILING) {
                    localStorage.setItem(WRITE_TICK_KEY, String(shared + 1));
                }
            } catch (error) {
                // A shared counter nothing reads is not worth breaking the fence over.
            }
        } catch (error) {
            // No room for the counter, or no storage at all. The write itself is not the
            // counter's business; what is lost is the ability to PROVE a quiet moment.
            this.breakWriteFence('the counter could not be written');
        } finally {
            this._ticking = false;
        }
    },

    // This tab's identity within the fence. Random, per page lifetime, and deliberately
    // not the device id: two tabs of one device are two writers, and the whole point of
    // the per-tab counters is that each has exactly one author.
    _tab: null,
    _epoch: 0,

    _tabKey() {
        if (!this._tab) {
            this._tab = Math.random().toString(36).slice(2, 10)
                + Math.random().toString(36).slice(2, 6);
        }
        return WRITE_TICK_TAB_PREFIX + this._tab + ':' + this._epoch;
    },

    // Written, then READ BACK. This is the write the whole stability claim rests on, and
    // it used to be the one write nobody looked at - on a disk this app never trusts
    // otherwise. A disk that accepts a write and hands back something else pinned the
    // counter for the life of the device with nothing flagged anywhere.
    _writeCounter(key, value) {
        const text = String(value);
        localStorage.setItem(key, text);
        return localStorage.getItem(key) === text;
    },

    // Exercise the fence, now, before anything claims it is holding.
    //
    // Everything else here is passive: it compares readings and trusts that a write which
    // did not happen would have left a mark. On a disk with room for the record and none
    // for its evidence, that is exactly backwards - the schedule write lands, the counter
    // and the broken mark are both refused, and the tab that hit it knows in memory while
    // every OTHER tab reads a disk with no trace of any of it and calls the file quiet.
    //
    // So the tab about to make the claim writes its own counter and reads it back first.
    // If its own evidence cannot be stored, the fence is not working on this device for
    // anybody, and the mark - which may itself be unstorable - is beside the point,
    // because this tab has just found out for itself.
    proveFence() {
        if (!this.available) return false;
        this._retryBrokenMark();
        if (this.unfenced) return false;
        try {
            const mine = this._tabKey();
            const was = readCounter(mine);
            if (was === null) {
                this.breakWriteFence('this tab\'s counter could not be read');
                return false;
            }
            if (was >= COUNTER_CEILING) {
                this._epoch += 1;
                return this._writeCounter(this._tabKey(), 1);
            }
            if (!this._writeCounter(mine, was + 1)) {
                this.breakWriteFence('this tab\'s counter did not read back');
                return false;
            }
            this.tick = was + 1;
            return true;
        } catch (error) {
            this.breakWriteFence('the fence could not be exercised');
            return false;
        }
    },

    // THE WHOLE FENCE, as one comparable value.
    //
    // Every tab's counter, by key, sorted. A snapshot takes this before its readings and
    // again after; equal means no tab on this disk moved, and no tab can make the set look
    // unchanged by putting a value back, because a tab only ever writes its own key and
    // only ever upward.
    //
    // Null means the fence cannot be read at all, which is not the same as a fence at
    // zero and must never be treated as one.
    fenceState() {
        if (!this.available) return null;
        let keys;
        try {
            keys = Object.keys(localStorage).filter(key =>
                String(key).indexOf(WRITE_TICK_TAB_PREFIX) === 0);
        } catch (error) {
            return null;
        }
        keys.sort();
        const parts = [];
        for (let at = 0; at < keys.length; at += 1) {
            let raw;
            try {
                raw = localStorage.getItem(keys[at]);
            } catch (error) {
                return null;
            }
            // Compared as BYTES, not as numbers. This function only ever asks whether the
            // evidence is the same at both ends, and equality of digit strings answers
            // that exactly - while Number() drags in a ceiling that has nothing to do with
            // the question. A counter of four hundred digits is not readable as an
            // integer and is a perfectly good constant: if it is the same at both ends,
            // that tab did not write. The tab that OWNS such a counter rolls to a fresh
            // key when it next writes (see bumpWriteTick), so the set changes and the
            // fence moves - which is the recovery the old code claimed and did not do.
            //
            // Anything that is not a run of digits is damage, and one damaged counter
            // makes the whole reading unusable: it is a tab that has written and whose
            // evidence cannot be compared, which is the state a snapshot must not paper
            // over.
            if (raw === null || !/^[0-9]+$/.test(raw)) return null;
            parts.push(keys[at] + '=' + raw);
        }
        return parts.join(' ');
    },

    // Which builds have a window open on this origin, as the service worker reported it.
    //
    // A build that predates the fence writes every record the rescue file carries and
    // moves no counter at all - so two equal readings across a v86 write are equal and
    // mean nothing. No key can catch that, because catching it by a key means the writer
    // writing a key it has never heard of. The only party that knows a v86 window is open
    // is the service worker, which enrolled it: see the identity work in sw.js.
    //
    // The page hands the census over here. Absence is not health: a census that is
    // missing, stale or unreadable ON A DEVICE THAT HAS A SERVICE WORKER means nobody
    // asked, or the answer was lost, and the honest reading of "we do not know who is
    // writing this disk" is that we do not know.
    noteOpenBuilds(builds, unknown) {
        const stamp = typeof APP_VERSION === 'string' ? APP_VERSION : '';
        const list = Array.isArray(builds) ? builds.map(String) : [];
        const foreign = unknown === true || list.some(build => build.indexOf(stamp) === -1);
        const record = JSON.stringify({ at: Date.now(), builds: list, foreign });
        this._census = { at: Date.now(), foreign };
        try {
            localStorage.setItem(OPEN_BUILDS_KEY, record);
            return localStorage.getItem(OPEN_BUILDS_KEY) === record;
        } catch (error) {
            // The census could not be stored, so another tab cannot read it. This tab
            // knows; the fence is broken for the ones that do not.
            this.breakWriteFence('the census of open builds could not be stored');
            return false;
        }
    },

    _breakReason: null,

    // The mark that could not be written, tried again.
    //
    // A full disk is the case where the fence fails AND its failure cannot be recorded, so
    // this tab knows and no other one can. Giving up there leaves the worst state the fence
    // has: every other tab reading a disk with no trace of any of it. The reason is held in
    // memory and re-offered to the disk on every later write, so the moment there is room -
    // an archive, a cleared quarantine, anything - the mark lands and every tab sees it.
    // It is only ever re-offered, never cleared: this build does not clear it at all.
    _retryBrokenMark() {
        if (!this.unfenced || !this.available) return;
        try {
            if (localStorage.getItem(WRITE_FENCE_BROKEN_KEY) !== null) return;
            localStorage.setItem(WRITE_FENCE_BROKEN_KEY, String(this._breakReason || '1'));
        } catch (error) {
            // Still no room. It will be offered again on the next write.
        }
    },

    _census: null,
    // How long a census is worth anything. A window can be opened at any moment, so an
    // old answer is not an answer - it is what the disk looked like a while ago.
    CENSUS_FRESH_MS: 60000,

    // Is a window of some OTHER build - or a window nothing can identify - open right now?
    //
    // Three answers, and the third is the one that matters: true, false, and null for "no
    // service worker has ever reported, so nothing on this device can say". Null is not
    // false. The caller decides what to do with not knowing; what it may not do is read it
    // as nobody being there.
    foreignWriterOpen() {
        if (this._census && Date.now() - this._census.at <= this.CENSUS_FRESH_MS) {
            return this._census.foreign;
        }
        // No service worker controlling this page, so there is no OTHER build to be open.
        //
        // Two builds in one session is a service-worker phenomenon and nothing else: an
        // uncontrolled page is served by the network, which hands every tab whatever is
        // deployed now, so every uncontrolled tab of this origin is running the same
        // program. That is the whole reason sw.js exists and the whole reason it is
        // careful. Where there is no worker there is no census to be missing, and
        // treating its absence as "we do not know" would make the rescue export
        // permanently unable to claim anything on the one configuration that cannot have
        // the problem.
        if (!hasServiceWorker()) return false;
        if (!this.available) return null;
        let raw;
        try {
            raw = localStorage.getItem(OPEN_BUILDS_KEY);
        } catch (error) {
            return null;
        }
        if (raw === null) return null;
        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (error) {
            return null;
        }
        if (!parsed || typeof parsed !== 'object') return null;
        if (typeof parsed.at !== 'number' || !Number.isFinite(parsed.at)) return null;
        if (Date.now() - parsed.at > this.CENSUS_FRESH_MS) return null;
        return parsed.foreign === true;
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
        this._breakReason = this._breakReason || String(why || '1');
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
