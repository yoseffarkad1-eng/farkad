// A device, in Node.
//
// The app is classic scripts sharing one global scope - no modules, no build step - so
// the way to test the data layer is to give it the scope it expects. Each device below
// is a fresh V8 context with its own localStorage, holding its own Store, State and
// FarkadSync. Two of them side by side is two phones.
//
// This exists because the failures that matter here cannot be reached through the
// browser suite: an edit made offline, the app closed, reopened against a cloud that is
// behind. That is three page lifetimes and two devices, and it has to be deterministic.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Load order is the order index.html loads them in, and it matters: state.js reads
// Store at definition time and sync.js reads State.
const FILES = [
    'js/dates.js',
    // For todayStr(), which the sync layer's daily cloud copy is keyed on. The rest of
    // this file builds DOM nodes and is harmless against the stub document below.
    'js/ui/dom.js',
    'js/store.js',
    'js/model/schema.js',
    'js/model/migrate.js',
    'js/state.js',
    'js/sync/sync.js'
];

const SOURCE = FILES.map(file => ({ file, code: readFileSync(join(ROOT, file), 'utf8') }));

// Store.keys() calls Object.keys(localStorage), which in a browser returns the stored
// keys - so the data has to sit on the object as own enumerable properties and the
// methods must not. A plain object with a Map inside would pass every other test here
// and fail that one.
function makeLocalStorage(initial) {
    const ls = {};
    const define = (name, value) => Object.defineProperty(ls, name, { value, enumerable: false });

    define('getItem', key =>
        (Object.prototype.hasOwnProperty.call(ls, key) ? ls[key] : null));
    define('setItem', (key, value) => {
        // A device with no room throws here, which is a real state this app handles and
        // therefore one the harness has to be able to produce.
        if (ls.__quota && ls.__quota(key, String(value))) {
            const error = new Error('quota');
            error.name = 'QuotaExceededError';
            throw error;
        }
        Object.defineProperty(ls, key, {
            value: String(value), enumerable: true, writable: true, configurable: true
        });
    });
    define('removeItem', key => { delete ls[key]; });
    define('__quota', null);

    Object.keys(initial || {}).forEach(key => ls.setItem(key, initial[key]));
    return ls;
}

// Enough DOM that the app's "is anything on screen?" guards take their null branch.
// Every one of them is written as `const node = document.getElementById(...); if (!node)
// return;`, so returning null everywhere disables the UI without disabling the logic.
function makeDocument() {
    return {
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener: () => {},
        createElement: () => ({ style: {}, setAttribute: () => {}, appendChild: () => {} })
    };
}

let deviceCount = 0;

// One phone. `storage` carries over a previous device's localStorage contents, which is
// how "close the app and open it again" is spelled: makeDevice({ storage: old.dump() }).
export function makeDevice(options = {}) {
    deviceCount += 1;

    const localStorage = makeLocalStorage(options.storage);
    const renders = { count: 0 };

    const sandbox = {
        localStorage,
        document: makeDocument(),
        console: options.quiet === false ? console : {
            log: () => {}, info: () => {}, warn: () => {}, error: () => {}
        },
        setTimeout, clearTimeout, setInterval, clearInterval,
        Date, Math, JSON, Object, Array, String, Number, Boolean,
        Promise, Map, Set, Error, RegExp, isNaN, isFinite, parseInt, parseFloat,
        // The app calls render() after every commit. Counting the calls is occasionally
        // the only way to tell "wrote and redrew" from "wrote and did not".
        render: () => { renders.count += 1; }
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    sandbox.self = sandbox;

    const context = vm.createContext(sandbox);
    SOURCE.forEach(({ file, code }) => {
        vm.runInContext(code, context, { filename: file });
    });

    // `const Store = {...}` at the top of a classic script creates a global BINDING, not
    // a property of the global object - the same distinction that once left the Firebase
    // module unable to see window.FarkadSync. So the sandbox object does not have these
    // on it, and reaching them means evaluating the name inside the context.
    const read = name => vm.runInContext(name, context, { filename: 'harness:read' });

    // A stable, distinct device id per device. The real one is random, and a test that
    // depends on which device wrote last cannot be built on a coin toss.
    const id = options.deviceId || `d_test${deviceCount}`;
    read('Store').set('farkad:deviceId', id);

    return {
        id,
        ctx: sandbox,
        renders,
        get Store() { return read('Store'); },
        get State() { return read('State'); },
        get Sync() { return read('FarkadSync'); },
        // Everything the schema exports, reached by name rather than re-exported one by
        // one - the list would go stale the first time the model grew a function.
        call(name, ...args) {
            const fn = read(name);
            if (typeof fn !== 'function') throw new Error(`no such global: ${name}`);
            return fn(...args);
        },
        global(name) { return read(name); },
        // The localStorage contents, as a plain object. This is the thing that survives
        // the app being closed, so it is the thing a "reopen" test carries across.
        dump() {
            const out = {};
            Object.keys(localStorage).forEach(key => { out[key] = localStorage[key]; });
            return out;
        },
        // A function DECLARATION does land on the global object - unlike const - so
        // todayStr can be replaced from out here. Tests that depend on the calendar are
        // otherwise fine until the day they are run on.
        setToday(dateStr) {
            sandbox.todayStr = () => dateStr;
        },
        setQuota(fn) {
            Object.defineProperty(localStorage, '__quota', { value: fn, enumerable: false });
        }
    };
}

// A cloud that can be offline, can fail, and can be inspected.
//
// Modelled on Firestore's actual behaviour rather than on what the adapter happens to
// call: update() merges by dotted field path and REJECTS if the document does not exist,
// which is the difference the first-sync bug lives in.
export function makeCloud(options = {}) {
    const cloud = {
        doc: options.doc || null,          // null = the document does not exist yet
        history: new Map(),
        online: options.online !== false,
        writes: [],                        // every accepted write, for counting retries
        attempts: [],                      // every attempted write, accepted or not
        subscribers: [],
        // Set to a function to reject specific writes: (kind, payload) => Error | null
        reject: options.reject || null
    };

    const offlineError = () => {
        const error = new Error('client is offline');
        error.code = 'unavailable';
        return error;
    };

    function guard(kind, payload) {
        cloud.attempts.push({ kind, payload });
        if (!cloud.online) return offlineError();
        if (cloud.reject) return cloud.reject(kind, payload) || null;
        return null;
    }

    function setByPath(target, path, value) {
        const parts = path.split('.');
        let node = target;
        for (let i = 0; i < parts.length - 1; i += 1) {
            const key = parts[i];
            if (!node[key] || typeof node[key] !== 'object') node[key] = {};
            node = node[key];
        }
        const last = parts[parts.length - 1];
        if (value === null) delete node[last];
        else node[last] = value;
    }

    // What the real adapter hands the sync layer when the document does not exist yet.
    // NOT null and not silence: an unstamped empty schedule, which is how sync.js is
    // told "the project is real, nobody has written to it". The harness has to speak the
    // adapter's contract or it is testing a different adapter.
    const EMPTY = () => ({ workers: [], places: [], days: {}, updatedAt: null });

    function publish() {
        const snapshot = cloud.doc ? JSON.parse(JSON.stringify(cloud.doc)) : EMPTY();
        cloud.subscribers.forEach(fn => fn(snapshot));
    }

    cloud.adapter = {
        update(patch) {
            const problem = guard('update', patch);
            if (problem) return Promise.reject(problem);
            // Firestore refuses to update a document that is not there. The adapter's
            // recovery from this is the thing under test, so it must be modelled.
            if (!cloud.doc) {
                const error = new Error('No document to update');
                error.code = 'not-found';
                return Promise.reject(error);
            }
            Object.keys(patch).forEach(path => setByPath(cloud.doc, path, patch[path]));
            cloud.writes.push({ kind: 'update', patch });
            publish();
            return Promise.resolve();
        },
        save(data) {
            const problem = guard('save', data);
            if (problem) return Promise.reject(problem);
            cloud.doc = JSON.parse(JSON.stringify(data));
            cloud.writes.push({ kind: 'save', data });
            publish();
            return Promise.resolve();
        },
        create(data) {
            const problem = guard('create', data);
            if (problem) return Promise.reject(problem);
            if (cloud.doc) {
                const error = new Error('Document already exists');
                error.code = 'already-exists';
                return Promise.reject(error);
            }
            cloud.doc = JSON.parse(JSON.stringify(data));
            cloud.writes.push({ kind: 'create', data });
            publish();
            return Promise.resolve();
        },
        archive(key, data) {
            const problem = guard('archive', { key, data });
            if (problem) return Promise.reject(problem);
            if (cloud.history.has(key)) {
                const error = new Error('Document already exists');
                error.code = 'already-exists';
                return Promise.reject(error);
            }
            cloud.history.set(key, JSON.parse(JSON.stringify(data)));
            return Promise.resolve();
        },
        archiveDates() {
            return Promise.resolve([...cloud.history.keys()].sort().reverse());
        },
        archiveRead(key) {
            return Promise.resolve(cloud.history.get(key) || null);
        },
        subscribe(onSnapshot, onError) {
            cloud.subscribers.push(onSnapshot);
            cloud.onError = onError;
            // Firestore delivers the current state on subscribe, and delivers it
            // asynchronously. Both matter: code that assumes it is synchronous passes
            // here and fails in the app.
            Promise.resolve().then(() => {
                onSnapshot(cloud.doc ? JSON.parse(JSON.stringify(cloud.doc)) : EMPTY());
            });
            return () => {
                cloud.subscribers = cloud.subscribers.filter(fn => fn !== onSnapshot);
            };
        }
    };

    return cloud;
}

// Let queued promises and the sync layer's debounce run. The push delay is real time in
// the app, so tests set FarkadSync.pushDelayMs low and wait a little longer than that.
export function settle(ms = 30) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
