// A fake IndexedDB for the Node suites, as faithful as the fake localStorage beside it in
// tests/harness.mjs is - in the ways the cold store (js/cold.js) can be hurt by.
//
// NOT A SUITE: it asserts nothing. tests/cold.test.mjs imports it, and
// tests/cold.browser.mjs runs the same questions against the real thing in Chromium -
// this file is an argument about a browser, and only a browser settles it.
//
// What is modelled, because each one is a way a phone loses data or hangs:
//
//   - EVERYTHING IS ASYNCHRONOUS. No request answers in the tick it was made in; events
//     are delivered one macrotask at a time, in the order the requests were made.
//   - A TRANSACTION IS ATOMIC AND COMMITS BY ITSELF. Writes are staged; they reach the
//     disk when the last request has been answered and no new one was made in its
//     callback - and `complete` fires only then. A page that is closed before `complete`
//     (a device the test simply stops using, or disk.kill()) leaves NOTHING of that
//     transaction behind. A request made after the transaction finished throws.
//   - VALUES ARE COPIED in and out (structured clone): what is read back is never the
//     object that was written.
//   - THE DISK CAN REFUSE. disk.quota = (key, value) => true makes that put fail with
//     QuotaExceededError and aborts its transaction, as a full origin does.
//   - THE DISK CAN BE EVICTED. disk.evict() is the browser deleting the origin's
//     databases between two sessions (iOS does, after days of disuse): the next open
//     finds no database and fires upgradeneeded from version 0, with every record gone.
//   - THE DISK CAN LIE. disk.corrupt(key, fn) hands back fn(value) for that key.
//   - OPEN CAN FAIL, HANG, OR BE BLOCKED. disk.failOpen = 'error' | 'hang';
//     disk.unavailable = true makes indexedDB.open throw (Firefox private windows did);
//     an open at a higher version while another connection is open fires `versionchange`
//     on that connection and `blocked` on the request until it closes.
//   - SEVERAL TABS: hand the same disk's factory to several devices.
//
// What is NOT modelled: indexes, cursors, key ranges, key paths, autoIncrement - the
// cold store uses none of them, and a fake that pretended to would be untested code.

const later = fn => setTimeout(fn, 0);
const copy = value => (value === undefined ? undefined : structuredClone(value));

function domError(name, message) {
    const error = new Error(message || name);
    error.name = name;
    return error;
}

function makeRequest() {
    return { result: undefined, error: null, readyState: 'pending',
        onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null };
}

export function makeIndexedDB() {
    // name -> { version, stores: { storeName: Map } }
    const databases = new Map();
    const connections = [];
    const disk = {
        opens: 0,            // how many times anything asked to open a database
        transactions: 0,     // how many transactions committed
        puts: 0,
        quota: null,
        failOpen: null,
        unavailable: false,
        killed: false,
        corrupted: new Map(),
        // Called just before a transaction's writes reach the disk; return false to lose
        // them (the page died at that instant).
        beforeCommit: null,
        evict() { databases.clear(); connections.splice(0).forEach(db => { db._closed = true; }); },
        // The page is gone: nothing in flight completes, no event is delivered again.
        kill() { disk.killed = true; },
        revive() { disk.killed = false; },
        corrupt(key, fn) { disk.corrupted.set(key, fn); },
        names() { return [...databases.keys()]; },
        // What is durably there, for assertions: { key: value } of one store.
        dump(name, store) {
            const db = databases.get(name);
            const out = {};
            if (db && db.stores[store]) db.stores[store].forEach((value, key) => { out[key] = copy(value); });
            return out;
        },
        // Put a raw record on the disk without a transaction (staging damage).
        putRaw(name, store, key, value) {
            const db = databases.get(name);
            if (db && db.stores[store]) db.stores[store].set(key, copy(value));
        },
        removeRaw(name, store, key) {
            const db = databases.get(name);
            if (db && db.stores[store]) db.stores[store].delete(key);
        }
    };

    const deliver = (target, type, extra) => {
        if (disk.killed) return;
        const handler = target['on' + type];
        if (typeof handler === 'function') handler(Object.assign({ type, target }, extra || {}));
    };

    function makeTransaction(db, names, mode) {
        const tx = { mode, error: null, oncomplete: null, onerror: null, onabort: null,
            _done: false, _pending: 0, _staged: new Map(), _db: db };
        names.forEach(name => {
            if (!db._data.stores[name]) throw domError('NotFoundError', 'no such object store: ' + name);
        });
        const view = name => {
            if (!tx._staged.has(name)) tx._staged.set(name, new Map(db._data.stores[name]));
            return tx._staged.get(name);
        };
        const finish = () => {
            if (tx._done || tx._pending > 0) return;
            tx._done = true;
            later(() => {
                if (disk.killed) return;
                if (typeof disk.beforeCommit === 'function' && disk.beforeCommit(tx) === false) return;
                if (mode !== 'readonly') {
                    tx._staged.forEach((map, name) => { db._data.stores[name] = map; });
                }
                disk.transactions += 1;
                deliver(tx, 'complete');
            });
        };
        const abort = error => {
            if (tx._done) return;
            tx._done = true;
            tx.error = error || domError('AbortError');
            later(() => deliver(tx, 'abort'));
        };
        const ask = (work) => {
            if (tx._done) throw domError('TransactionInactiveError', 'the transaction has finished');
            if (db._closed) throw domError('InvalidStateError', 'the connection is closed');
            const request = makeRequest();
            tx._pending += 1;
            later(() => {
                if (disk.killed || tx._done) return;
                tx._pending -= 1;
                try {
                    request.result = work();
                    request.readyState = 'done';
                    deliver(request, 'success');
                } catch (error) {
                    request.error = error;
                    request.readyState = 'done';
                    deliver(request, 'error');
                    deliver(tx, 'error', { target: request });
                    abort(error);
                    return;
                }
                finish();
            });
            return request;
        };
        tx.abort = () => abort(domError('AbortError'));
        tx.objectStore = name => {
            if (names.indexOf(name) === -1) throw domError('NotFoundError', 'not in this transaction: ' + name);
            const writable = () => {
                if (mode === 'readonly') throw domError('ReadOnlyError', 'a readonly transaction');
            };
            const handed = (key, value) => {
                const twist = disk.corrupted.get(key);
                return copy(typeof twist === 'function' ? twist(copy(value)) : value);
            };
            return {
                put(value, key) {
                    writable();
                    const held = copy(value);
                    return ask(() => {
                        if (typeof disk.quota === 'function' && disk.quota(key, held)) {
                            throw domError('QuotaExceededError', 'the origin is out of room');
                        }
                        disk.puts += 1;
                        view(name).set(key, held);
                        return key;
                    });
                },
                get(key) { return ask(() => (view(name).has(key) ? handed(key, view(name).get(key)) : undefined)); },
                getAllKeys() { return ask(() => [...view(name).keys()].sort()); },
                getAll() { return ask(() => [...view(name).keys()].sort().map(key => handed(key, view(name).get(key)))); },
                delete(key) { writable(); return ask(() => { view(name).delete(key); return undefined; }); },
                clear() { writable(); return ask(() => { view(name).clear(); return undefined; }); }
            };
        };
        // A transaction nobody asked anything of still completes.
        later(finish);
        return tx;
    }

    function makeConnection(name, data) {
        const db = { name, version: data.version, onversionchange: null, _closed: false, _data: data,
            objectStoreNames: { contains: store => Object.prototype.hasOwnProperty.call(data.stores, store) },
            close() { db._closed = true; const at = connections.indexOf(db); if (at !== -1) connections.splice(at, 1); },
            createObjectStore(store) {
                if (!db._upgrading) throw domError('InvalidStateError', 'not in an upgrade');
                data.stores[store] = new Map();
                return {};
            },
            transaction(names, mode) {
                if (db._closed) throw domError('InvalidStateError', 'the connection is closed');
                return makeTransaction(db, Array.isArray(names) ? names : [names], mode || 'readonly');
            } };
        connections.push(db);
        return db;
    }

    const factory = {
        open(name, version) {
            disk.opens += 1;
            if (disk.unavailable) throw domError('SecurityError', 'IndexedDB is not available here');
            const request = makeRequest();
            const proceed = () => {
                if (disk.killed || disk.failOpen === 'hang') return;
                if (disk.failOpen === 'error') {
                    request.error = domError('UnknownError', 'the database could not be opened');
                    deliver(request, 'error');
                    return;
                }
                let data = databases.get(name);
                const want = version === undefined ? (data ? data.version : 1) : version;
                if (data && want < data.version) {
                    request.error = domError('VersionError');
                    deliver(request, 'error');
                    return;
                }
                const upgrade = !data || want > data.version;
                if (upgrade) {
                    const open = connections.filter(db => db.name === name && !db._closed);
                    if (open.length > 0) {
                        open.forEach(db => deliver(db, 'versionchange', { oldVersion: db.version, newVersion: want }));
                        if (connections.some(db => db.name === name && !db._closed)) {
                            deliver(request, 'blocked');
                            later(proceed);          // asked again until the others close
                            return;
                        }
                    }
                    const old = data ? data.version : 0;
                    if (!data) { data = { version: want, stores: {} }; databases.set(name, data); }
                    data.version = want;
                    const db = makeConnection(name, data);
                    db._upgrading = true;
                    request.result = db;
                    deliver(request, 'upgradeneeded', { oldVersion: old, newVersion: want });
                    db._upgrading = false;
                    later(() => { request.readyState = 'done'; deliver(request, 'success'); });
                    return;
                }
                request.result = makeConnection(name, data);
                request.readyState = 'done';
                deliver(request, 'success');
            };
            later(proceed);
            return request;
        },
        deleteDatabase(name) {
            const request = makeRequest();
            later(() => {
                databases.delete(name);
                connections.filter(db => db.name === name).forEach(db => { db._closed = true; });
                deliver(request, 'success');
            });
            return request;
        }
    };
    return { indexedDB: factory, disk };
}
