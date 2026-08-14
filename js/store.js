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

const Store = {
    available: true,
    // Set when a write was refused for space. Distinct from `available`, which means the
    // browser will not let this page use storage at all.
    full: false,
    // Optional: returns true if it managed to delete something worth deleting. Registered
    // by whoever owns disposable data - Store itself must not decide what is expendable.
    reclaim: null,
    memory: {},

    get(key) {
        if (this.available) {
            try {
                return localStorage.getItem(key);
            } catch (error) {
                this.fallback(error);
            }
        }
        return Object.prototype.hasOwnProperty.call(this.memory, key) ? this.memory[key] : null;
    },

    set(key, value) {
        this.memory[key] = String(value);
        if (!this.available) return false;

        try {
            localStorage.setItem(key, value);
            this.full = false;
            return true;
        } catch (error) {
            if (!isQuotaError(error)) {
                this.fallback(error);
                return false;
            }

            // Out of space. Throw away something expendable and try the real write again
            // - the day's record is worth more than any number of old restore points.
            while (this.reclaim && this.reclaim()) {
                try {
                    localStorage.setItem(key, value);
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
            console.warn('Browser storage is full; this write did not land:', error);
            if (typeof updateSyncNotice === 'function') updateSyncNotice();
            return false;
        }
    },

    remove(key) {
        delete this.memory[key];
        if (!this.available) return;
        try {
            localStorage.removeItem(key);
        } catch (error) {
            this.fallback(error);
        }
    },

    keys() {
        if (this.available) {
            try {
                return Object.keys(localStorage);
            } catch (error) {
                this.fallback(error);
            }
        }
        return Object.keys(this.memory);
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
        Store.available = false;
        console.warn('Browser storage unavailable, holding data in memory only:', error);
    }
})();
