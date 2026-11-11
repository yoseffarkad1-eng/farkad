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
    // The phone's cold store (Phase 7). After recovery.js, as in index.html.
    'js/cold.js',
    'js/model/schema.js',
    'js/model/money.js',
    'js/model/migrate.js',
    'js/model/ledger.js',
    // The pay book's model (v173): after the ledger it builds on, and before anything that
    // reads a queue - a queued `pay.<id>` is validated by payEntryProblems in this file.
    'js/model/payroll.js',
    // Phase 6: closed months leaving the live document. Pure; asks planArchive.
    'js/model/months.js',
    'js/state.js',
    'js/sync/sync.js',
    'js/sync/restore.js',
    'js/sync/receive.js',
    'js/sync/send.js',
    'js/sync/status.js',
    // The pay book's server-first door (v175). Above boot.js, like every split.
    'js/sync/transact.js',
    'js/sync/closed.js',
    'js/sync/months.js',
    // Last of the sync group, and last for a reason - see the file's own header.
    'js/sync/boot.js',
    // For the backup, snapshot and undo-stack machinery. It builds DOM nodes and calls
    // askTell, but only inside functions - nothing at its top level touches either, and
    // registering Store.reclaim is exactly the behaviour a full-disk test needs.
    'js/ui/share.js',
    'js/ui/backup.js',
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
// THE GATE-OPEN INSTRUMENT (tests/gate-open.preload.mjs, tests/gate-open.matrix.mjs).
//
// Run by no gate. When that preload is loaded it leaves the three flags to open in
// globalThis.FARKAD_GATE_OPEN, and a device whose suite named NONE of the pay book's gates
// is made with them open - which is every device of every suite written before the pay
// book. A device whose flags name a gate is one its suite built on purpose and is left
// exactly as named. Without the preload this returns what it was handed, untouched: a
// device given no flags gets exactly what a person installs.
const GATE_FLAGS = ['paybook', 'months', 'cold', 'paybookQueue', 'paybookActivation'];
function gateOpenFlags(named) {
    const open = globalThis.FARKAD_GATE_OPEN;
    if (!open || typeof open !== 'object') return named || null;
    if (named && GATE_FLAGS.some(flag => Object.prototype.hasOwnProperty.call(named, flag))) return named;
    return Object.assign({}, named || {}, open);
}

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
        // A device has NO IndexedDB unless a suite hands it one (tests/fake-indexeddb.mjs,
        // the `indexedDB` of makeIndexedDB()) - which is also how "this browser has none"
        // is staged, and how two tabs or two sessions share one.
        indexedDB: options.indexedDB || undefined,
        // See APP_STAMP. A classic script's top-level `const` is a binding rather than a
        // property, so this is spelled as a sandbox global on purpose: it is what
        // `typeof APP_VERSION` resolves against inside store.js.
        APP_VERSION: options.appVersion || APP_STAMP,
        // The test seam for the shipped feature gates. Defined BEFORE the app's scripts
        // run, which is the only moment it can be read - schema.js freezes the flags at
        // definition time. A device given no flags gets exactly what a person installs.
        // (Under tests/gate-open.preload.mjs - the instrument, never a gate - a device
        // whose suite said nothing about the pay book's gates is opened: see gateOpenFlags.)
        FARKAD_FLAG_OVERRIDES: gateOpenFlags(options.flags),
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

    // `unsent`: nothing left the device, which the production adapter says the same way
    // when its transaction failed before it had written anything - and says ONLY THERE, in
    // withReceipt (update, save). Its cutover (bootstrap) and its create say nothing of the
    // kind, so neither does this. A fake that tagged every offline failure proved the client
    // right about a word the production adapter never says: a phone never told a revision
    // goes the cutover road, and its attempts there kept their try marks in the field while
    // every suite here took them back off.
    const offlineError = kind => {
        const error = new Error('client is offline');
        error.code = 'unavailable';
        if (kind === 'update' || kind === 'save') error.unsent = true;
        return error;
    };
    // The same for a refusal: withReceipt throws it before it stages a write and says so;
    // the cutover and the create do not.
    const untagged = error => {
        if (error && typeof error === 'object') delete error.unsent;
        throw error;
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
    //
    // And it ANSWERS with whatever `apply` returned. The production adapter hands the
    // client a value on two paths - the cutover's document, and a replay's `{ replayed,
    // revision }` - and a fake that swallowed them proved the client right about a
    // contract the client was never actually being told.
    function landing(kind, payload, apply) {
        const wait = cloud.hold ? cloud.hold(kind, payload) : null;
        if (!wait) {
            let answer;
            try { answer = apply(); } catch (error) { return Promise.reject(error); }
            return Promise.resolve(answer);
        }
        return Promise.resolve(wait).then(apply);
    }

    function guard(kind, payload) {
        cloud.attempts.push({ kind, payload });
        if (!cloud.online) return offlineError(kind);
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
        // Match patchToUpdateArgs: worker-day and Rima-count nulls remove the field; all
        // other nulls, including roster tombstones, remain literal values.
        if (value === null && parts.length === 4 && parts[0] === 'days'
            && (parts[2] === 'plan' || parts[2] === 'actual' || parts[2] === 'rima'
                || parts[2] === 'yosefGeves')) delete node[last];
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
    // schedules/{doc}/closed/{id}: created once, never changed - see transact below.
    cloud.closed = new Map();
    // Set to (kind, payload) => true to let a write LAND and lose its answer.
    cloud.loseAnswer = options.loseAnswer || null;

    function refuse(code, message) {
        const error = new Error(message);
        error.code = code;
        // Refused before anything was applied, so nothing of it is on the document.
        error.unsent = true;
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
            cloud.receipts.set(data.lastOpId, { revision: data.revision,
                opFingerprint: data.opFingerprint || null });
        }
    }

    // A receipt of this name that describes a DIFFERENT operation.
    //
    // The production adapter refuses this in withReceipt; the fake cloud has to refuse it
    // too, or every suite that runs against the harness proves the binding holds while
    // measuring a cloud that does not have it. Returns the refusal, or null.
    function receiptDisagrees(data) {
        const receipt = receiptFor(data.lastOpId);
        if (!receipt) return null;
        const named = receipt.opFingerprint;
        if (typeof named !== 'string' || named === (data.opFingerprint || null)) return null;
        return refuse('receipt-mismatch',
            'a receipt of this name describes a different operation');
    }

    // WHAT firestore.rules SAY ABOUT THE PAY BOOK AND ITS INDEX, for a whole-document
    // write (Phase 3 and Phase 5). Opt-in (`payRules: true`): the Phase 2 suites write pay
    // entries through the ordinary queue on purpose, which these rules refuse. A whole
    // document may not change the `pay` map at all (it cannot create a closed document),
    // may not change the index, and - once an index exists - must speak protocol 2.
    cloud.payRules = options.payRules === true;
    // THE RULES PUBLISHED TODAY (main's file), for the one thing Phase 8 asks of them:
    // they have no closed/ and no probe/, so a pay book transaction is refused whole and
    // the question "which rules are these" is refused too.
    cloud.oldRules = options.oldRules === true;
    cloud.probes = [];
    function payRulesProblem(data) {
        if (!cloud.payRules || !cloud.doc) return null;
        const flat = value => JSON.stringify(Object.keys(value || {}).sort().map(key => [key, value[key]]));
        const rowsOf = doc => ((doc && doc.payIndex) || {}).rows || {};
        const deny = why => { const error = new Error(why); error.code = 'permission-denied'; return error; };
        if (flat(data.pay) !== flat(cloud.doc.pay)) return deny('a whole document may not change the pay book');
        if (flat(rowsOf(data)) !== flat(rowsOf(cloud.doc))) return deny('a whole document may not change the index');
        if (Object.keys(rowsOf(cloud.doc)).length > 0 && !(data.protocol >= 2)) {
            return deny('a build that does not keep the pay book may not write over an index');
        }
        return activatedProblem(data);
    }
    // activatedNeedsPaybook (Phase 8): once the document holds a pay book at all, a write
    // of ANY shape from a build that does not speak protocol 2 is refused.
    function activatedProblem(data) {
        if (!cloud.payRules || !cloud.doc) return null;
        if (Object.keys(cloud.doc.pay || {}).length > 0 && !(data.protocol >= 2)) {
            const error = new Error('once the pay book is on, a build that does not keep it may not write');
            error.code = 'permission-denied';
            return error;
        }
        return null;
    }

    // WHAT firestore.rules SAY ABOUT THE MONTHS THAT HAVE LEFT (Phase 6), under the same
    // opt-in: no write of any shape may add, change or remove a day whose date is in the
    // index (daysGuard); nothing but the one archiving write may change the index
    // (monthGuard); and once a month has left, only protocol 2 writes (monthsNeedPaybook).
    // `whole` is a whole-document write; otherwise `data` is a field-path patch.
    cloud.months = new Map();
    function monthRulesProblem(data, whole) {
        if (!cloud.payRules || !cloud.doc) return null;
        const deny = why => { const error = new Error(why); error.code = 'permission-denied'; return error; };
        const index = cloud.doc.monthIndex || {};
        const rows = index.rows || {};
        const dates = Array.isArray(index.dates) ? index.dates : [];
        const stable = value => JSON.stringify(value === undefined ? null : value, (key, inner) =>
            (inner && typeof inner === 'object' && !Array.isArray(inner)
                ? Object.keys(inner).sort().reduce((out, name) => { out[name] = inner[name]; return out; }, {}) : inner));
        if (Object.keys(rows).length > 0 && !(data.protocol >= 2)) {
            return deny('a build that does not keep the pay book may not write once a month has left');
        }
        if (whole) {
            if (stable(data.monthIndex || {}) !== stable(cloud.doc.monthIndex || {})
                && !(Object.keys(rows).length === 0 && dates.length === 0
                    && Object.keys((data.monthIndex || {}).rows || {}).length === 0
                    && ((data.monthIndex || {}).dates || []).length === 0)) {
                return deny('a whole document may not change the month index');
            }
            const before = cloud.doc.days || {};
            const after = data.days || {};
            const touched = Object.keys(Object.assign({}, before, after))
                .filter(date => stable(before[date]) !== stable(after[date]));
            if (touched.some(date => dates.indexOf(date) !== -1)) return deny('a day of a month that has left');
            return null;
        }
        if (Object.keys(data).some(path => path === 'monthIndex' || path.indexOf('monthIndex.') === 0)) {
            return deny('only the archiving write may change the month index');
        }
        if (Object.keys(data).some(path => path.indexOf('days.') === 0 && dates.indexOf(path.split('.')[1]) !== -1)) {
            return deny('a day of a month that has left');
        }
        return null;
    }

    cloud.adapter = {
        // THE COPY OF A MONTH (Phase 6), modelled on the production adapter's copyMonth and
        // on the rules for months/{id}: created once, in a commit that moves the revision,
        // naming that operation and revision, under the name its month and digest give it.
        copyMonth(patch, month) {
            if (!month || typeof month.id !== 'string' || !month.data) {
                return Promise.reject(refuse('no-month-document', 'a month copy with no month document'));
            }
            const problem = guard('copyMonth', patch);
            if (problem) {
                if (problem.code === 'unavailable') problem.unsent = true;
                return Promise.reject(problem);
            }
            return landing('copyMonth', patch, () => {
                if (!cloud.doc) throw refuse('not-found', 'No document to update');
                if (cloud.protocol && receiptFor(patch.lastOpId)) {
                    cloud.writes.push({ kind: 'copyMonth', patch, replayed: true });
                    return { replayed: true, revision: receiptFor(patch.lastOpId).revision };
                }
                const said = protocolProblem(patch, false);
                if (said) throw said;
                if (cloud.months.has(month.id)) {
                    const exists = refuse('month-exists', 'this month already has a document of that name');
                    exists.revision = (cloud.doc && cloud.doc.revision) || 0;
                    throw exists;
                }
                const data = month.data;
                const denied = monthRulesProblem(patch, false);
                if (denied) throw denied;
                if (patch.protocol < 2 || data.opId !== patch.lastOpId || data.revision !== patch.revision
                    || month.id !== `${data.month}_${data.digest}` || !Array.isArray(data.dates)
                    || !data.days || Object.keys(data.days).some(date => data.dates.indexOf(date) === -1)) {
                    const unpaired = new Error('the rules refuse this month document');
                    unpaired.code = 'permission-denied';
                    throw unpaired;
                }
                Object.keys(patch).forEach(path => setByPath(cloud.doc, path, patch[path]));
                cloud.months.set(month.id, JSON.parse(JSON.stringify(data)));
                landReceipt(patch);
                cloud.writes.push({ kind: 'copyMonth', patch, month: month.id });
                publish();
                if (cloud.loseAnswer && cloud.loseAnswer('copyMonth', patch)) {
                    const lost = new Error('the connection dropped before the answer');
                    lost.code = 'unavailable';
                    throw lost;
                }
            });
        },
        // THE DROP OF A MONTH (Phase 6), modelled on the production adapter's archiveMonth
        // (the confirmation inside the transaction) and on archivesMonth in the rules.
        archiveMonth(patch, month, monthDocId) {
            if (typeof month !== 'string' || typeof monthDocId !== 'string') {
                return Promise.reject(refuse('no-month-document', 'nothing may leave without a month document'));
            }
            const problem = guard('archiveMonth', patch);
            if (problem) {
                if (problem.code === 'unavailable') problem.unsent = true;
                return Promise.reject(problem);
            }
            return landing('archiveMonth', patch, () => {
                if (!cloud.doc) throw refuse('not-found', 'No document to update');
                if (cloud.protocol && receiptFor(patch.lastOpId)) {
                    cloud.writes.push({ kind: 'archiveMonth', patch, replayed: true });
                    return { replayed: true, revision: receiptFor(patch.lastOpId).revision };
                }
                const said = protocolProblem(patch, false);
                if (said) throw said;
                const stable = value => {
                    if (value === null || value === undefined || typeof value !== 'object') {
                        return JSON.stringify(value === undefined ? null : value);
                    }
                    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
                    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
                };
                const copy = cloud.months.has(monthDocId) ? cloud.months.get(monthDocId) : null;
                const days = cloud.doc.days || {};
                const mine = Object.keys(days).filter(date => date.slice(0, 7) === month && date.length === 10).sort();
                const held = copy ? (copy.days || {}) : {};
                const index = cloud.doc.monthIndex || {};
                const already = Array.isArray(index.dates) ? index.dates : [];
                const calendar = copy && Array.isArray(copy.dates) ? copy.dates : [];
                if (!copy || copy.month !== month || mine.length === 0
                    || stable(mine) !== stable(Object.keys(held).sort())
                    || !mine.every(date => stable(days[date]) === stable(held[date]))
                    || calendar.some(date => already.indexOf(date) !== -1)) {
                    throw refuse('month-unconfirmed', 'the month document does not hold what would leave');
                }
                // The rules' half.
                const rowKeys = Object.keys(patch).filter(key => key.indexOf('monthIndex.rows.') === 0);
                const row = patch['monthIndex.rows.' + month];
                if (patch.protocol < 2 || patch.archivedMonth !== month || patch.monthDoc !== monthDocId
                    || rowKeys.length !== 1 || !row || row.d !== monthDocId || row.h !== copy.digest
                    || Object.prototype.hasOwnProperty.call(index.rows || {}, month)
                    || Object.keys(patch).some(key => key.indexOf('days.') === 0 || key.indexOf('pay.') === 0)) {
                    const denied = new Error('the rules refuse this month archive write');
                    denied.code = 'permission-denied';
                    throw denied;
                }
                Object.keys(patch).forEach(path => setByPath(cloud.doc, path, patch[path]));
                mine.forEach(date => { delete cloud.doc.days[date]; });
                cloud.doc.monthIndex.dates = already.concat(calendar);
                landReceipt(patch);
                cloud.writes.push({ kind: 'archiveMonth', patch, month, removed: mine.slice() });
                publish();
                if (cloud.loseAnswer && cloud.loseAnswer('archiveMonth', patch)) {
                    const lost = new Error('the connection dropped before the answer');
                    lost.code = 'unavailable';
                    throw lost;
                }
            });
        },
        readMonth(id) {
            if (!cloud.online) return Promise.reject(offlineError('read'));
            return Promise.resolve(cloud.months.has(String(id))
                ? JSON.parse(JSON.stringify(cloud.months.get(String(id)))) : null);
        },
        // Which rules the server runs (Phase 8): a read of probe/<generation>. A cloud
        // made with `oldRules: true` is the rules published today - it has no such path.
        probeRules(generation) {
            if (!cloud.online) return Promise.reject(offlineError('read'));
            cloud.probes.push(String(generation));
            return Promise.resolve(cloud.oldRules !== true && String(generation) === 'paybook-8');
        },
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
                    const disagrees = receiptDisagrees(patch);
                    if (disagrees) throw disagrees;
                    cloud.writes.push({ kind: 'update', patch, replayed: true });
                    // As the production adapter answers it: a replay, and the revision
                    // the operation reached - see withReceipt in firebase-adapter.js.
                    return { replayed: true, revision: receiptFor(patch.lastOpId).revision };
                }
                const said = protocolProblem(patch, false);
                if (said) throw said;
                const refused = monthRulesProblem(patch, false) || activatedProblem(patch);
                if (refused) throw refused;
                Object.keys(patch).forEach(path => setByPath(cloud.doc, path, patch[path]));
                landReceipt(patch);
                cloud.writes.push({ kind: 'update', patch });
                publish();
            });
        },
        // THE SERVER-FIRST DOOR (v175), modelled on the production adapter's transact and
        // on what firestore.rules require of it: the same receipt-then-revision order as
        // update, protocol 2, a closed document that does not exist yet, and BOTH writes
        // or neither. `cloud.loseAnswer(kind, payload)` returning true lets the write land
        // and then fails the call the way a dropped connection does - no `unsent`, because
        // by then something was staged.
        transact(patch, closed) {
            const docs = Array.isArray(closed) ? closed : [];
            if (docs.length === 0) {
                const none = refuse('no-closed-document', 'a pay book operation with no closed document');
                return Promise.reject(none);
            }
            const problem = guard('transact', patch);
            if (problem) {
                if (problem.code === 'unavailable') problem.unsent = true;
                return Promise.reject(problem);
            }
            return landing('transact', patch, () => {
                if (!cloud.doc) throw refuse('not-found', 'No document to update');
                if (cloud.protocol && receiptFor(patch.lastOpId)) {
                    const disagrees = receiptDisagrees(patch);
                    if (disagrees) throw disagrees;
                    cloud.writes.push({ kind: 'transact', patch, replayed: true });
                    return { replayed: true, revision: receiptFor(patch.lastOpId).revision };
                }
                const said = protocolProblem(patch, false);
                if (said) throw said;
                if (cloud.protocol && patch.protocol < 2) {
                    throw refuse('permission-denied', 'the pay book needs protocol 2');
                }
                // The rules published today have no closed/: the pair is refused whole.
                if (cloud.oldRules === true) {
                    throw refuse('permission-denied', 'these rules have no closed documents');
                }
                const there = docs.filter(one => cloud.closed.has(String(one.id))).map(one => String(one.id));
                if (there.length > 0) {
                    const exists = refuse('closed-exists', 'this account already has a closed document');
                    exists.closed = there;
                    exists.revision = (cloud.doc && cloud.doc.revision) || 0;
                    exists.document = JSON.parse(JSON.stringify(cloud.doc));
                    throw exists;
                }
                // What the rules ask of the pair: the closed document names this very
                // operation and revision, and the schedule names the closed document.
                if (docs.some(one => !one.data || one.data.opId !== patch.lastOpId
                    || one.data.revision !== patch.revision) || patch.closedId !== String(docs[0].id)) {
                    const unpaired = new Error('the closed document and the schedule do not name each other');
                    unpaired.code = 'permission-denied';
                    throw unpaired;
                }
                Object.keys(patch).forEach(path => setByPath(cloud.doc, path, patch[path]));
                docs.forEach(one => cloud.closed.set(String(one.id), JSON.parse(JSON.stringify(one.data))));
                landReceipt(patch);
                cloud.writes.push({ kind: 'transact', patch, closed: docs.map(one => String(one.id)) });
                publish();
                if (cloud.loseAnswer && cloud.loseAnswer('transact', patch)) {
                    const lost = new Error('the connection dropped before the answer');
                    lost.code = 'unavailable';
                    throw lost;
                }
            });
        },
        // A SETTLED CLOSURE LEAVING THE LIVE DOCUMENT (Phase 5), modelled on the production
        // adapter's archiveClosed and on firestore.rules: protocol 2, the closed documents
        // exist and hold every entry being removed exactly as the live document does, the
        // write names the one index row it adds and that row's closed document exists,
        // and the index only grows.
        archiveClosed(patch, removals, closedIds) {
            const paths = Array.isArray(removals) ? removals : [];
            const ids = Array.isArray(closedIds) ? closedIds : [];
            if (paths.length === 0 || ids.length === 0) {
                return Promise.reject(refuse('no-closed-document', 'nothing may leave without a closed document'));
            }
            const problem = guard('archiveClosed', patch);
            if (problem) {
                if (problem.code === 'unavailable') problem.unsent = true;
                return Promise.reject(problem);
            }
            return landing('archiveClosed', patch, () => {
                if (!cloud.doc) throw refuse('not-found', 'No document to update');
                if (cloud.protocol && receiptFor(patch.lastOpId)) {
                    cloud.writes.push({ kind: 'archiveClosed', patch, replayed: true });
                    return { replayed: true, revision: receiptFor(patch.lastOpId).revision };
                }
                const said = protocolProblem(patch, false);
                if (said) throw said;
                // Firestore refuses a list directly inside a list, anywhere in a write.
                // The first shape of the index row had one, and only the emulator said so.
                const nested = value => (Array.isArray(value) ? value.some(one => Array.isArray(one) || nested(one))
                    : (value && typeof value === 'object' ? Object.keys(value).some(key => nested(value[key])) : false));
                if (nested(patch)) {
                    const invalid = new Error('Nested arrays are not supported');
                    invalid.code = 'invalid-argument';
                    throw invalid;
                }
                const stable = value => {
                    if (value === null || value === undefined || typeof value !== 'object') {
                        return JSON.stringify(value === undefined ? null : value);
                    }
                    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
                    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
                };
                const at = (root, path) => path.split('.').reduce((node, key) =>
                    (node && typeof node === 'object' && Object.prototype.hasOwnProperty.call(node, key) ? node[key] : undefined), root);
                const held = {};
                ids.forEach(id => {
                    const entries = cloud.closed.has(String(id)) ? (cloud.closed.get(String(id)).entries || {}) : {};
                    Object.keys(entries).forEach(path => { if (!(path in held)) held[path] = entries[path]; });
                });
                const unconfirmed = paths.filter(path => !Object.prototype.hasOwnProperty.call(held, path)
                    || at(cloud.doc, path) === undefined || stable(held[path]) !== stable(at(cloud.doc, path)));
                if (!ids.every(id => cloud.closed.has(String(id))) || unconfirmed.length > 0) {
                    const none = refuse('closed-unconfirmed', 'a closed document does not hold what would leave');
                    none.paths = unconfirmed;
                    throw none;
                }
                // The rules' half.
                const rowKeys = Object.keys(patch).filter(key => key.indexOf('payIndex.rows.') === 0);
                const before = ((cloud.doc.payIndex || {}).rows) || {};
                if (patch.protocol < 2 || typeof patch.archivedId !== 'string'
                    || rowKeys.length !== 1 || rowKeys[0] !== 'payIndex.rows.' + patch.archivedId
                    || Object.prototype.hasOwnProperty.call(before, patch.archivedId)
                    || !cloud.closed.has(patch.archivedId)
                    || Object.keys(patch).some(key => key.indexOf('pay.') === 0)) {
                    const denied = new Error('the rules refuse this archive write');
                    denied.code = 'permission-denied';
                    throw denied;
                }
                Object.keys(patch).forEach(path => setByPath(cloud.doc, path, patch[path]));
                paths.forEach(path => {
                    const parts = path.split('.');
                    let node = cloud.doc;
                    for (let i = 0; i < parts.length - 1 && node; i += 1) node = node[parts[i]];
                    if (node) delete node[parts[parts.length - 1]];
                });
                landReceipt(patch);
                cloud.writes.push({ kind: 'archiveClosed', patch, removed: paths.slice(), closed: ids.map(String) });
                publish();
                if (cloud.loseAnswer && cloud.loseAnswer('archiveClosed', patch)) {
                    const lost = new Error('the connection dropped before the answer');
                    lost.code = 'unavailable';
                    throw lost;
                }
            });
        },
        readClosed(id) {
            if (!cloud.online) return Promise.reject(offlineError('read'));
            return Promise.resolve(cloud.closed.has(String(id))
                ? JSON.parse(JSON.stringify(cloud.closed.get(String(id)))) : null);
        },
        readReceipt(opId) {
            if (!cloud.online) return Promise.reject(offlineError('read'));
            const held = receiptFor(String(opId));
            return Promise.resolve(held ? JSON.parse(JSON.stringify(held)) : null);
        },
        save(data) {
            const problem = guard('save', data);
            if (problem) return Promise.reject(problem);
            return landing('save', data, () => {
                if (cloud.protocol && receiptFor(data.lastOpId)) {
                    const disagrees = receiptDisagrees(data);
                    if (disagrees) throw disagrees;
                    cloud.writes.push({ kind: 'save', data, replayed: true });
                    return { replayed: true, revision: receiptFor(data.lastOpId).revision };
                }
                const said = protocolProblem(data, !cloud.doc);
                if (said) throw said;
                const denied = payRulesProblem(data) || monthRulesProblem(data, true);
                if (denied) throw denied;
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
            }).catch(untagged);
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
                    return { replayed: true, revision: receiptFor(data.lastOpId).revision };
                }
                const said = protocolProblem(data, true);
                if (said) throw said;
                // payGuardOnCreate / indexGuardOnCreate: a project may not begin with a
                // pay book (no closed document can be created beside it here) or an index.
                if (cloud.payRules && (Object.keys(data.pay || {}).length > 0
                    || Object.keys(((data.payIndex || {}).rows) || {}).length > 0
                    || Object.keys(((data.monthIndex || {}).rows) || {}).length > 0)) {
                    const denied = new Error('a project may not begin with a pay book or an index');
                    denied.code = 'permission-denied';
                    throw denied;
                }
                cloud.doc = JSON.parse(JSON.stringify(data));
                landReceipt(data);
                cloud.writes.push({ kind: 'create', data });
                publish();
            }).catch(untagged);
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

    cloud.transport = makeTransportCloud(options.transport || {});

    return cloud;
}

// הסעות, shared: the documents beside the schedule (schedules/<doc>/transport/<name>), and
// the object js/sync/firebase-adapter.js hands js/ui/transport-share.js (transportOps).
//
// SEPARATE FROM THE SCHEDULE ON PURPOSE - its own documents, its own attempts, its own
// online switch - because that is the claim under test: a suite can refuse every call
// here and count that the record's cloud above was never asked for anything.
//
// Faithful to what the production adapter and the rules were MEASURED to do on the
// emulator (tests/transport.emulator.test.mjs), and each line below names its fact:
//   - a write is a transaction: it answers asynchronously, and of two built on the same
//     revision one lands and the other is thrown `conflict` with the document that won
//     (the SERVER's word to the one that loses at the commit is permission-denied; the
//     production adapter reads again and says conflict - measured there, modelled here);
//   - the rules refuse (permission-denied) a document whose shape, name or revision is
//     not what firestore.rules allows - mirrored here key for key - and, with
//     `rules: 'old'`, refuse everything: the rules in the field today have no such path;
//   - a listener delivers the whole list from `from` on, asynchronously, and says
//     `live: false` when it speaks from its cache (offline); under the old rules it is
//     refused through its error callback and delivers nothing;
//   - a write made offline fails `unavailable` - a transaction needs the server.
export function makeTransportCloud(options = {}) {
    const transport = {
        docs: new Map(),
        online: options.online !== false,
        rules: options.rules || 'new',
        attempts: [],            // every call made: { kind, name, base, data }
        writes: [],              // every write that landed
        subscribers: [],
        reject: options.reject || null,     // (kind, name) => Error | null
        hold: options.hold || null          // (name, data) => Promise | null: a write held open
    };
    const copy = value => JSON.parse(JSON.stringify(value));
    const denied = () => Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
    const isMap = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

    // firestore.rules, transportOk(name), line for line.
    transport.allows = (name, data, existing) => {
        if (transport.rules === 'old') return false;
        if (!isMap(data) || data.v !== 1 || !Number.isInteger(data.revision)) return false;
        if (typeof data.updatedAt !== 'string' || data.updatedAt.length >= 64) return false;
        if (typeof data.updatedBy !== 'string' || data.updatedBy.length >= 128) return false;
        const only = keys => Object.keys(data).every(key => keys.includes(key));
        if (name === 'settings') {
            if (!only(['v', 'revision', 'updatedAt', 'updatedBy', 'vehicles'])) return false;
            if (!Array.isArray(data.vehicles) || data.vehicles.length > 60) return false;
        } else {
            if (!/^day_[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(name)) return false;
            if (!only(['v', 'revision', 'updatedAt', 'updatedBy', 'date', 'unavailable', 'status', 'trips'])) return false;
            if (typeof data.date !== 'string' || name !== 'day_' + data.date) return false;
            if (!isMap(data.unavailable) || Object.keys(data.unavailable).length > 60) return false;
            if (!isMap(data.status) || Object.keys(data.status).length > 300) return false;
            if (!isMap(data.trips) || Object.keys(data.trips).length > 60) return false;
        }
        return existing ? data.revision === existing.revision + 1 : data.revision === 1;
    };

    const listFor = from => [...transport.docs.keys()].filter(name => name >= from).sort()
        .map(name => ({ name, data: copy(transport.docs.get(name)) }));
    // Every listener of every phone that has a signal is told, live. `muted` holds the
    // news back: the moment in which a refused write's answer arrives BEFORE the snapshot
    // that explains it - two channels with no ordering between them.
    transport.muted = false;
    transport.publish = () => {
        if (transport.muted || transport.rules === 'old') return;
        transport.subscribers.slice().forEach(one => {
            if (!one.phone.online) return;
            one.last = listFor(one.from);
            one.onDocs(copy(one.last), { live: true });
        });
    };
    // Another phone's write, put straight on the server: checked by the same rules.
    transport.put = (name, data) => {
        if (!transport.allows(name, data, transport.docs.get(name) || null)) throw denied();
        transport.docs.set(name, copy(data));
        transport.writes.push({ name, data: copy(data), by: 'put' });
        Promise.resolve().then(transport.publish);
    };

    // One phone's connection: its own signal, the same server. Two phones, one of them in
    // a tunnel, is two of these.
    transport.phone = (start = {}) => {
        const phone = { online: start.online !== false && transport.online };
        // The signal going and coming back. A listener hears both: its cache (what it was
        // last told, marked as not live), then the server.
        phone.setOnline = online => {
            phone.online = online;
            Promise.resolve().then(() => {
                transport.subscribers.filter(one => one.phone === phone).forEach(one => {
                    if (transport.rules === 'old') return;
                    if (!online) { if (one.last) one.onDocs(copy(one.last), { live: false }); return; }
                    one.last = listFor(one.from);
                    one.onDocs(copy(one.last), { live: true });
                });
            });
        };
        phone.adapter = {
            write(name, base, data) {
                transport.attempts.push({ kind: 'write', name, base, data: copy(data) });
                const refusal = transport.reject ? transport.reject('write', name) : null;
                if (refusal) return Promise.reject(refusal);
                const land = () => {
                    if (!phone.online) throw Object.assign(new Error('client is offline'), { code: 'unavailable' });
                    // The transaction READS first, and the old rules refuse the read.
                    if (transport.rules === 'old') throw denied();
                    const existing = transport.docs.get(name) || null;
                    const held = existing ? existing.revision : 0;
                    // Then the transaction's own check, as in transportOps: a moved
                    // document is a conflict carrying the document.
                    if (held !== base || data.revision !== base + 1) {
                        throw Object.assign(new Error('the transport document moved'), {
                            code: 'conflict', revision: held, document: existing ? copy(existing) : null
                        });
                    }
                    if (!transport.allows(name, data, existing)) throw denied();
                    transport.docs.set(name, copy(data));
                    transport.writes.push({ name, data: copy(data), by: 'adapter' });
                    Promise.resolve().then(transport.publish);
                    return { revision: data.revision };
                };
                const held = transport.hold ? transport.hold(name, data) : null;
                return Promise.resolve(held).then(land);
            },
            subscribe(from, onDocs, onError) {
                transport.attempts.push({ kind: 'subscribe', name: from });
                const one = { from, onDocs, onError, phone, last: null };
                const refusal = transport.reject ? transport.reject('subscribe', from) : null;
                Promise.resolve().then(() => {
                    if (refusal) { onError(refusal); return; }
                    if (transport.rules === 'old') { onError(denied()); return; }
                    transport.subscribers.push(one);
                    // Offline at the start the SDK has nothing cached and says so only
                    // after its own timeout; here it stays silent until there is a
                    // signal - the client must not need the cache's word.
                    if (phone.online) { one.last = listFor(from); onDocs(copy(one.last), { live: true }); }
                });
                return () => { transport.subscribers = transport.subscribers.filter(other => other !== one); };
            }
        };
        return phone;
    };
    transport.adapter = transport.phone().adapter;
    return transport;
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
// AWAITED, because a predicate that reads the cloud is the ordinary case and the old
// shape could not express it.
//
// This used to ask `if (ready())`. A synchronous predicate answers a boolean and that is
// fine; an ASYNC one answers a Promise, and a Promise is truthy - so the barrier returned
// true on its first turn, having waited for nothing, and the limit beside it was
// decoration. Measured: five barriers in tests/bootstrap.emulator.test.mjs, each written
// `await settleUntil(async () => { const raw = await readDoc(); ... }, 8000, 100)`, each
// returning on turn one. Whatever those five suites then proved, they did not prove it
// after the condition they name.
//
// `await` on a plain boolean is a microtask and changes nothing for the ninety-eight
// synchronous call sites; for the five it is the difference between a barrier and a
// comment. Supporting the async predicate properly is the fix - refusing it would have
// left the same five tests to be rewritten by somebody who did not know why.
export async function settleUntil(ready, limitMs = 5000, stepMs = 5) {
    const deadline = Date.now() + limitMs;
    for (;;) {
        if (await ready()) return true;
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
