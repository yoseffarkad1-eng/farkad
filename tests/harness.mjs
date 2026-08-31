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
import { createHash } from 'node:crypto';
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
    'js/recovery.js',
    'js/model/schema.js',
    'js/model/migrate.js',
    'js/model/ledger.js',
    'js/state.js',
    'js/sync/sync.js',
    // For the backup, snapshot and undo-stack machinery. It builds DOM nodes and calls
    // askTell, but only inside functions - nothing at its top level touches either, and
    // registering Store.reclaim is exactly the behaviour a full-disk test needs.
    'js/ui/share.js',
    // For deleting and archiving a worker. Those two decide what happens to somebody's
    // record, so they are tested the way the data layer is - across a close and reopen,
    // and against a second phone - rather than only through a browser. Same as the file
    // above: DOM and dialogs are touched inside functions only, and the tests that call
    // them answer askConfirm themselves.
    'js/ui/roster.js'
];

const SOURCE = FILES.map(file => ({ file, code: readFileSync(join(ROOT, file), 'utf8') }));

// The build stamp, as js/app.js declares it.
//
// app.js is not in the list above - it is boot and view switching, and a device here has
// no views - but the stamp it declares is read by the DATA layer: store.js records which
// build last kept the write fence, and recovery decides what a snapshot may claim partly
// from that. With no APP_VERSION in the context, `typeof APP_VERSION === 'string'` was
// false in every device in every suite, so that half of the fence was never once executed
// in Node while being fully live in the app. Devices get the real stamp; a device standing
// in for another build is given that build's.
const APP_STAMP = (/const APP_VERSION = '([^']+)'/
    .exec(readFileSync(join(ROOT, 'js/app.js'), 'utf8')) || [])[1] || null;

export function appStamp() {
    return APP_STAMP;
}

// The load order, published so a suite can build the same device out of a DIFFERENT tree.
//
// One question needs that and cannot be faked: what happens on a disk two builds are
// sharing. The build in the field writes the records this build's rescue file carries and
// knows nothing about the fence that file's stability claim rests on - and a synthetic
// "old writer" written in this checkout is not evidence, because it is written by somebody
// who has read the fence. tests/fence.legacy.test.mjs loads the real bytes of the released
// build out of Git and runs them beside this one, on one localStorage.
export function loadOrder() {
    return FILES.slice();
}

// The bytes every device in every suite is actually running, named and hashed.
//
// A suite that reads production code by an absolute path tests whatever tree happened to
// be at that path - and two of them did, so a verification gate that materialised an
// exact SHA was, for those two files, reading the checkout next door and reporting a
// result about a tree it never opened. ROOT above is derived from this file, so the
// devices were always right; what was missing was any way for a suite to SAY so. This is
// that way: tests/isolation.test.mjs compares these hashes against the files in its own
// checkout, and a suite may assert them itself when the answer would otherwise rest on a
// path nobody re-reads.
export function loadedSources() {
    return SOURCE.map(entry => ({
        file: entry.file,
        bytes: entry.code.length,
        sha256: createHash('sha256').update(entry.code).digest('hex')
    }));
}

export function sourceRoot() {
    return ROOT;
}

// Store.keys() calls Object.keys(localStorage), which in a browser returns the stored
// keys - so the data has to sit on the object as own enumerable properties and the
// methods must not. A plain object with a Map inside would pass every other test here
// and fail that one.
function makeLocalStorage(initial) {
    const ls = {};
    const define = (name, value) => Object.defineProperty(ls, name, { value, enumerable: false });

    define('getItem', key => {
        const value = Object.prototype.hasOwnProperty.call(ls, key) ? ls[key] : null;
        // The only way to spell the moment BETWEEN a read and the write that depends on
        // it. Two tabs are two threads: one can be preempted after it has read a record
        // and before it writes the record back, and everything the other tab did in that
        // gap is then overwritten by a value computed from stale bytes. Inside one Node
        // thread that moment cannot happen by itself, so a test that needs it asks for it:
        //
        //   shared.interleave(key => { ...the other tab writes here... });
        //
        // Fired after the value is taken and before the caller can act on it, once - it
        // clears itself, because a hook that fired on every read would recurse.
        if (ls.__hook) {
            const hook = ls.__hook;
            ls.__hook = null;
            hook(key, value);
        }
        return value;
    });
    define('setItem', (key, value) => {
        // A write the browser refuses for a reason that is NOT lack of room - Safari in
        // private mode, a blocked frame, storage the browser has revoked. Store treats
        // this differently from a full disk: it takes the whole of localStorage away for
        // the rest of the session, which is a state the app has to survive and therefore
        // one the harness has to be able to produce.
        if (ls.__failWrite && ls.__failWrite(key, String(value))) {
            const error = new Error('storage is not available');
            error.name = 'SecurityError';
            throw error;
        }
        // A device with no room throws here, which is a real state this app handles and
        // therefore one the harness has to be able to produce.
        if (ls.__quota && ls.__quota(key, String(value))) {
            const error = new Error('quota');
            error.name = 'QuotaExceededError';
            throw error;
        }
        const stored = (ls.__corrupt && ls.__corrupt(key, String(value)))
            ? String(value) + '\u0000corrupted'
            : String(value);
        Object.defineProperty(ls, key, {
            value: stored, enumerable: true, writable: true, configurable: true
        });
    });
    // See getItem. Non-enumerable, like every other method here, because Store.keys()
    // reads Object.keys(localStorage) and a hook is not a record.
    Object.defineProperty(ls, '__hook', { value: null, enumerable: false, writable: true });
    define('interleave', hook => { ls.__hook = hook; });
    define('removeItem', key => {
        // A remove the browser refuses. Rare, and the reason cancellation cannot be
        // assumed to have worked just because it was asked for.
        if (ls.__throwOnRemove && ls.__throwOnRemove(key)) {
            throw new Error('removeItem refused');
        }
        if (ls.__blockRemoval && ls.__blockRemoval(key)) return;
        delete ls[key];
    });
    // Writable, because a test switches the fault on partway through a run.
    Object.defineProperty(ls, '__quota', {
        value: null, enumerable: false, writable: true, configurable: true
    });
    Object.defineProperty(ls, '__failWrite', {
        value: null, enumerable: false, writable: true, configurable: true
    });
    // A disk that ACCEPTS a write and then hands back something else. Rarer than a full
    // one and worse, because nothing throws - the only way to find out is to read back.
    Object.defineProperty(ls, '__corrupt', {
        value: null, enumerable: false, writable: true, configurable: true
    });
    Object.defineProperty(ls, '__blockRemoval', {
        value: null, enumerable: false, writable: true, configurable: true
    });
    Object.defineProperty(ls, '__throwOnRemove', {
        value: null, enumerable: false, writable: true, configurable: true
    });

    Object.keys(initial || {}).forEach(key => ls.setItem(key, initial[key]));
    return ls;
}

// Enough DOM that the app's "is anything on screen?" guards take their null branch.
// Every one of them is written as `const node = document.getElementById(...); if (!node)
// return;`, so returning null everywhere disables the UI without disabling the logic.
function makeDocument(downloads) {
    return {
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener: () => {},
        removeEventListener: () => {},
        // The export paths build an anchor, set href and download on it, and press it.
        // What comes off that press is the FILE - the one thing a person in trouble
        // actually ends up holding - so pressing it records the name and the bytes here
        // rather than throwing them away. A test that only wants the device's own state
        // ignores the record; a test about the rescue file reads it.
        createElement: () => {
            const node = {
                style: {}, setAttribute: () => {}, appendChild: () => {},
                href: '', download: '',
                click() {
                    downloads.push({
                        name: String(node.download),
                        text: OBJECT_URLS.get(node.href) || null
                    });
                }
            };
            return node;
        }
    };
}

// The blob store behind URL.createObjectURL. A Blob in this harness is its text, because
// every one this app makes is a JSON string it just serialised.
const OBJECT_URLS = new Map();
let objectUrlCount = 0;

function makeBlob() {
    return function Blob(parts) {
        this.__text = (parts || []).map(String).join('');
    };
}

function makeUrl() {
    return {
        createObjectURL(blob) {
            objectUrlCount += 1;
            const url = `blob:farkad/${objectUrlCount}`;
            OBJECT_URLS.set(url, blob && blob.__text);
            return url;
        },
        revokeObjectURL() { /* the bytes are kept: a test reads them after the press */ }
    };
}

// A file the way the import handler is given one - through a real <input type="file">
// change event and a real FileReader. Tests used to reach past both and hand the app a
// storage object, which proved the parser worked and nothing about whether the app could
// open the file a person is actually holding.
function makeFileReader() {
    return function FileReader() {
        this.onload = null;
        this.onerror = null;
        this.readAsText = file => {
            const text = file && typeof file.text === 'string' ? file.text : String(file);
            setTimeout(() => {
                if (this.onload) this.onload({ target: { result: text } });
            }, 0);
        };
    };
}

let deviceCount = 0;

// Ids in this app are random by design - two phones offline cannot agree on a counter -
// and a suite built on them is a suite whose failing run cannot be repeated. With
// FARKAD_SEED set, every device gets the same stream of numbers it got last time, so a
// failure that took nine hundred writes to produce can be produced again.
//
// Without it, Math is the real one: the default run stays adversarial, and an id
// collision that only happens on real randomness is not hidden by a fixed seed.
function seededMath(index) {
    const seed = process.env.FARKAD_SEED;
    if (!seed) return Math;

    // mulberry32: small, fast, and good enough for ids in a test. The device index is
    // mixed in so two devices in one run do not mint the same id.
    let state = (Number(seed) || hashOf(String(seed))) + index * 0x9e3779b9;
    const random = () => {
        state |= 0;
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const copy = Object.create(Math);
    Object.defineProperty(copy, 'random', { value: random, enumerable: true });
    return copy;
}

function hashOf(text) {
    let value = 0;
    for (let i = 0; i < text.length; i += 1) value = (Math.imul(value, 31) + text.charCodeAt(i)) | 0;
    return value;
}

// One phone. `storage` carries over a previous device's localStorage contents, which is
// how "close the app and open it again" is spelled: makeDevice({ storage: old.dump() }).
//
// `sharedStorage` is a different thing entirely and the only way to spell TWO TABS. A
// reopen copies the bytes; two tabs of the same site are two JavaScript worlds looking at
// ONE localStorage, and a lost update between them is invisible to every test built on
// copies. Pass the same object to two devices and they share it, the way two tabs do:
//
//   const shared = sharedStore();
//   const tabA = makeDevice({ sharedStorage: shared });
//   const tabB = makeDevice({ sharedStorage: shared });
export function makeDevice(options = {}) {
    deviceCount += 1;

    const localStorage = options.sharedStorage || makeLocalStorage(options.storage);
    const renders = { count: 0 };

    // Installed BEFORE the app's scripts run. sync.js reads its outbox the moment it
    // loads, so a fault switched on after makeDevice() returns is switched on too late
    // to affect it - which quietly turned "no room for the copy" into "copy made fine".
    if (options.quota) localStorage.__quota = options.quota;

    const downloads = [];
    const sandbox = {
        localStorage,
        // See APP_STAMP. A classic script's top-level `const` is a binding rather than a
        // property, so this is spelled as a sandbox global on purpose: it is what
        // `typeof APP_VERSION` resolves against inside store.js.
        APP_VERSION: options.appVersion || APP_STAMP,
        // The test seam for the shipped feature gates. Defined BEFORE the app's scripts
        // run, which is the only moment it can be read - schema.js freezes the flags at
        // definition time. A device given no flags gets exactly what a person installs.
        FARKAD_FLAG_OVERRIDES: options.flags || null,
        document: makeDocument(downloads),
        Blob: makeBlob(),
        URL: makeUrl(),
        FileReader: makeFileReader(),
        console: options.quiet === false ? console : {
            log: () => {}, info: () => {}, warn: () => {}, error: () => {}
        },
        setTimeout, clearTimeout, setInterval, clearInterval,
        Date, Math: seededMath(deviceCount), JSON, Object, Array, String, Number, Boolean,
        Promise, Map, Set, Error, RegExp, isNaN, isFinite, parseInt, parseFloat,
        // The app calls render() after every commit. Counting the calls is occasionally
        // the only way to tell "wrote and redrew" from "wrote and did not".
        render: () => { renders.count += 1; }
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    sandbox.self = sandbox;

    const context = vm.createContext(sandbox);
    // options.sources runs a device on bytes from somewhere other than this checkout -
    // the released build, read out of Git - so that "an older window writing this disk"
    // is the real older window. A suite that uses it publishes the hashes of what it
    // loaded, the same way loadedSources() publishes these.
    const running = options.sources || SOURCE;
    running.forEach(({ file, code }) => {
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

    // The cross-tab send claim settles before it is read back, so that two tabs which
    // both found it free can each see whose token actually landed. In the app that pause
    // is tens of milliseconds; here everything else is measured in single ones, so the
    // pause is scaled to match. The race it guards is the SCHEDULING of the two tabs, not
    // the length of the wait - a suite that wants a longer one sets claimSettleMs itself.
    read('FarkadSync').claimSettleMs = options.claimSettleMs === undefined
        ? 1 : options.claimSettleMs;

    return {
        id,
        ctx: sandbox,
        renders,
        // Every file this device has handed to the browser, oldest first: { name, text }.
        downloads,
        // The change event an <input type="file"> fires, with a real file on it. Handed
        // to importBackup exactly as the DOM would hand it over.
        fileEvent(name, text) {
            const target = { files: [{ name, text }], value: name };
            return { target };
        },
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
        // (key, value) => true to refuse that write, the way a full disk does.
        setQuota(fn) {
            localStorage.__quota = fn;
        },
        // The same, for a refusal that is not about room. Store answers a full disk by
        // keeping the value in memory and reporting the failure; it answers this by
        // deciding there is no storage at all, for the rest of the session.
        failWrite(fn) {
            localStorage.__failWrite = fn;
        },
        // Make writes to `key` land as something other than what was written.
        corruptOnWrite(key) {
            localStorage.__corrupt = (written) => written === key;
        },
        // The same, for a family of keys. The queue is a set of keys since v87, so "the
        // disk takes the write and gives back something else" is a statement about all of
        // them rather than about one.
        corruptWhen(matches) {
            localStorage.__corrupt = (written) => matches(written);
        },
        // Make removeItem silently do nothing for the matching keys.
        blockRemoval(fn) {
            localStorage.__blockRemoval = fn;
        },
        // Make removeItem throw for the matching keys.
        throwOnRemove(fn) {
            localStorage.__throwOnRemove = fn;
        },
        // Put a raw value on disk without going through Store, so a test can stage a
        // damaged record the way a half-finished write leaves one.
        putRaw(key, value) {
            localStorage.setItem(key, value);
        },
        raw(key) {
            return Object.prototype.hasOwnProperty.call(localStorage, key)
                ? localStorage[key] : null;
        }
    };
}

// A cloud that can be offline, can fail, and can be inspected.
//
// Modelled on Firestore's actual behaviour rather than on what the adapter happens to
// call: update() merges by dotted field path and REJECTS if the document does not exist,
// which is the difference the first-sync bug lives in.
// One localStorage that several devices can be handed, for the two-tab case above.
export function sharedStore(initial) {
    return makeLocalStorage(initial);
}

export function makeCloud(options = {}) {
    const cloud = {
        doc: options.doc || null,          // null = the document does not exist yet
        history: new Map(),
        online: options.online !== false,
        writes: [],                        // every accepted write, for counting retries
        attempts: [],                      // every attempted write, accepted or not
        subscribers: [],
        // Set to a function to reject specific writes: (kind, payload) => Error | null
        reject: options.reject || null,
        // Whether this server enforces the ordering protocol. On by default; a suite
        // sets false to model the unordered server the released build talks to.
        protocol: options.protocol !== false,
        // Set to a function to HOLD a write open: (kind, payload) => Promise | null.
        // The call is made and counted immediately, as it is in the app, and the write
        // does not land until the returned promise resolves. That gap is where a
        // whole-document replacement can overtake an ordinary update, so it has to be
        // something a test can open on purpose.
        hold: options.hold || null
    };

    const offlineError = () => {
        const error = new Error('client is offline');
        error.code = 'unavailable';
        return error;
    };

    // Runs `apply` - the part that actually changes the document - either now or when
    // whatever `hold` returned resolves.
    //
    // With no hold it runs SYNCHRONOUSLY, before the returned promise settles, because
    // that is what Firestore does: the local echo is published inside the call. Making
    // every write asynchronous here would quietly retire the tests that measure it.
    //
    // Called after guard(), so an attempt is still counted when the call is made rather
    // than when it lands - which is what the app sees.
    function landing(kind, payload, apply) {
        const wait = cloud.hold ? cloud.hold(kind, payload) : null;
        if (!wait) {
            try { apply(); } catch (error) { return Promise.reject(error); }
            return Promise.resolve();
        }
        return Promise.resolve(wait).then(apply);
    }

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
        // STORED, not deleted. updateDoc(ref, path, null) writes a null at that path;
        // removing the field takes deleteField(), which this app has never sent.
        //
        // Deleting here made the fake kinder than the thing it stands in for, and that
        // is the one thing a fake must never be: a tombstone disappeared from the
        // document, so the stale legacy array was the last word on that person and the
        // suite reported a resurrection bug as fixed while it was live in production.
        node[last] = value;
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

    // THE ORDERING PROTOCOL, modelled the way firestore.rules enforces it.
    //
    // The fake has to speak the same contract as the rules or it is testing a different
    // server. See docs/sync-protocol.md and the protocol suites in tests/rules.test.mjs,
    // which run these same properties against the real rules on the emulator.
    //
    //   a write without a protocol version is refused;
    //   a write whose revision is not exactly one more than the stored one is refused -
    //     that is the compare-and-set, and it is what stops a stale writer overwriting a
    //     newer document;
    //   a write must carry lastOpId and land its receipt in the same commit;
    //   receipts are immutable, and finding one is how a retry learns it already won.
    //
    // `cloud.protocol` is on by default. A suite that wants the old unordered server -
    // to model a build in the field, or to check that this build refuses to write to
    // one - sets makeCloud({ protocol: false }).
    cloud.receipts = new Map();

    function refuse(code, message) {
        const error = new Error(message);
        error.code = code;
        return error;
    }

    // Returns an Error to throw, or null. `creating` allows revision 1 against nothing.
    function protocolProblem(data, creating) {
        if (!cloud.protocol) return null;
        if (!Number.isInteger(data.protocol) || data.protocol < 1) {
            return refuse('permission-denied', 'a write with no protocol version');
        }
        if (typeof data.lastOpId !== 'string' || data.lastOpId.length === 0) {
            return refuse('permission-denied', 'a write with no operation id');
        }
        const held = creating ? 0 : ((cloud.doc && cloud.doc.revision) || 0);
        if (!Number.isInteger(data.revision) || data.revision !== held + 1) {
            // The compare-and-set failing is not an error in the ordinary sense - it
            // means somebody else got there first, and the caller has to decide what to
            // do about it rather than retry blindly.
            const said = refuse('conflict',
                `the document moved: expected revision ${held + 1}, the write said ${data.revision}`);
            // The authoritative base, handed back with the refusal. A client that is told
            // only "no" can do nothing but guess; a client told what the revision actually
            // is can rebuild its write against it and send the same operation again.
            said.revision = held;
            // And the document as it stands, so the client can tell a path nobody touched
            // from a path somebody corrected while this write was in flight.
            said.document = cloud.doc ? JSON.parse(JSON.stringify(cloud.doc)) : null;
            return said;
        }
        return null;
    }

    // The receipt this operation would have written, if it already has one. A retry of a
    // request that may still have landed finds it and stops.
    function receiptFor(opId) {
        return cloud.receipts.has(opId) ? cloud.receipts.get(opId) : null;
    }

    function landReceipt(data) {
        if (!cloud.protocol) return;
        // Immutable: created once, never changed. The rules enforce this with
        // `allow update, delete: if false`.
        if (!cloud.receipts.has(data.lastOpId)) {
            cloud.receipts.set(data.lastOpId, { revision: data.revision });
        }
    }

    cloud.adapter = {
        // The envelope travels IN the patch, exactly as it does on the wire: the client
        // sets protocol, revision and lastOpId as ordinary fields of the same write.
        update(patch) {
            const problem = guard('update', patch);
            if (problem) return Promise.reject(problem);
            return landing('update', patch, () => {
                // Firestore refuses to update a document that is not there. The adapter's
                // recovery from this is the thing under test, so it must be modelled.
                if (!cloud.doc) {
                    throw refuse('not-found', 'No document to update');
                }
                // Idempotent success. The operation is already recorded, so this is a
                // retry of a request that did land - answering it with a conflict would
                // make the caller hold work the cloud is already holding.
                if (cloud.protocol && receiptFor(patch.lastOpId)) {
                    cloud.writes.push({ kind: 'update', patch, replayed: true });
                    return;
                }
                const said = protocolProblem(patch, false);
                if (said) throw said;
                Object.keys(patch).forEach(path => setByPath(cloud.doc, path, patch[path]));
                landReceipt(patch);
                cloud.writes.push({ kind: 'update', patch });
                publish();
            });
        },
        save(data) {
            const problem = guard('save', data);
            if (problem) return Promise.reject(problem);
            return landing('save', data, () => {
                if (cloud.protocol && receiptFor(data.lastOpId)) {
                    cloud.writes.push({ kind: 'save', data, replayed: true });
                    return;
                }
                const said = protocolProblem(data, !cloud.doc);
                if (said) throw said;
                cloud.doc = JSON.parse(JSON.stringify(data));
                landReceipt(data);
                cloud.writes.push({ kind: 'save', data });
                publish();
            });
        },
        // THE CUTOVER WRITE, modelled here for the same reason everything else is: a
        // contract the harness does not speak is a contract the node suites cannot catch a
        // regression in. Protocol fields only, its own receipt, and a refusal that carries
        // the authoritative document.
        bootstrap(payload) {
            const problem = guard('bootstrap', payload);
            if (problem) return Promise.reject(problem);
            return landing('bootstrap', payload, () => {
                if (!cloud.doc) throw refuse('not-found', 'No document to bootstrap');
                if (cloud.protocol && receiptFor(payload.lastOpId)) return cloud.doc;
                if (Number.isInteger(cloud.doc.revision)) {
                    const said = refuse('conflict', 'the document is already in the protocol');
                    said.revision = cloud.doc.revision;
                    said.document = JSON.parse(JSON.stringify(cloud.doc));
                    throw said;
                }
                cloud.doc.protocol = payload.protocol;
                cloud.doc.revision = 1;
                cloud.doc.lastOpId = payload.lastOpId;
                cloud.doc.updatedAt = payload.updatedAt;
                cloud.doc.updatedBy = payload.updatedBy || null;
                landReceipt({ lastOpId: payload.lastOpId, revision: 1 });
                cloud.writes.push({ kind: 'bootstrap', payload });
                publish();
                return JSON.parse(JSON.stringify(cloud.doc));
            });
        },
        // The authoritative document, outside any transaction.
        read() {
            return Promise.resolve(cloud.doc ? JSON.parse(JSON.stringify(cloud.doc)) : null);
        },
        create(data) {
            const problem = guard('create', data);
            if (problem) return Promise.reject(problem);
            return landing('create', data, () => {
                if (cloud.doc) {
                    throw refuse('already-exists', 'Document already exists');
                }
                if (cloud.protocol && receiptFor(data.lastOpId)) {
                    cloud.writes.push({ kind: 'create', data, replayed: true });
                    return;
                }
                const said = protocolProblem(data, true);
                if (said) throw said;
                cloud.doc = JSON.parse(JSON.stringify(data));
                landReceipt(data);
                cloud.writes.push({ kind: 'create', data });
                publish();
            });
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
// A barrier on the CONDITION, not on the clock.
//
// A sleep long enough on an idle host is a red check on a loaded one, and how many
// milliseconds a debounce takes to drain a queue is a fact about the machine, not about
// the app. Worse than red: a precondition that has not come true yet aborts the run, so
// one loaded moment on one line loses the thousand checks below it, and a resumed restore
// that had not been written yet threw on a document that was not there and took four
// hundred with it.
//
// Resolves true the moment `ready()` answers true, false if `limitMs` goes by first. The
// budget is deliberately far larger than any sleep it replaces: it is not a timing
// tolerance, it is the line between "slow host" and "this will never finish", and only
// the second one is a fault worth reporting.
//
// It does NOT replace every settle(). Some of them are a sampling WINDOW rather than a
// wait - the span over which a test counts what the other tab attempted - and returning
// early from one of those moves the sample and changes what is measured. The rule is:
// if the next line asks "has it happened yet", this is the barrier; if the next line asks
// "how many happened while I waited", the sleep is the point.
export async function settleUntil(ready, limitMs = 5000, stepMs = 5) {
    const deadline = Date.now() + limitMs;
    for (;;) {
        if (ready()) return true;
        if (Date.now() >= deadline) return false;
        await new Promise(resolve => setTimeout(resolve, stepMs));
    }
}

export function settle(ms = 30) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// A promise somebody else decides the fate of. How "an older write that is still open"
// is spelled.
export function deferred() {
    let release;
    let refuse;
    const promise = new Promise((resolve, reject) => { release = resolve; refuse = reject; });
    // Nothing is waiting on the rejection path until a test asks for one, and an
    // unhandled rejection would take the run down with it.
    promise.catch(() => {});
    return { promise, release, refuse };
}
