// The build identity suite: does this build agree with itself?
//
//   node tests/build.test.mjs
//
// Three strings say which build a session is running - the <meta> in the page, the
// APP_VERSION the scripts were built with, and the name of the cache the service worker
// serves from - and a session where they disagree is a session running two builds at
// once, which is how an edit gets written in a shape the other half does not read.
// Bumping two of the three is exactly the mistake that catches nobody until a phone in
// somebody's pocket refuses to record.
//
// The fourth thing is the shell list: anything the page loads that the service worker
// does not precache still works online, so the gap only appears on a site with no
// signal - the one place it must not.
//
// No browser here on purpose. The smoke suite checks the same invariants against a
// running app, and needs Playwright and a server to do it; this one is a file read, so
// it runs in a second, before a commit, on any machine.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { suite, check, report } from './runner.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = name => readFileSync(join(ROOT, name), 'utf8');

const page = read('index.html');
const app = read('js/app.js');
const sw = read('sw.js');
const adapter = read('js/sync/firebase-adapter.js');

// The worker with its prose taken out. Every comment in this app explains the failure
// the code below it is there to prevent, so they NAME the calls they warn against - and
// a rule read off the source text has to be read off the code, not off the warning.
const stripComments = text =>
    text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const appCode = stripComments(app);
const code = sw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const shellSource = sw.slice(sw.indexOf('const SHELL'), sw.indexOf('];'));
const SHELL = (shellSource.match(/'\.\/[^']*'/g) || []).map(entry => entry.slice(1, -1));
const shellPaths = SHELL.map(entry => entry.replace('./', ''));

{
    suite('the three build markers agree');

    const meta = (page.match(/name="farkad-build" content="(v\d+)"/) || [])[1];
    const version = (app.match(/APP_VERSION = '(v\d+)'/) || [])[1];
    const cache = (sw.match(/VERSION = 'farkad-(v\d+)'/) || [])[1];

    check('the page names a build', Boolean(meta), String(meta));
    check('the scripts name a build', Boolean(version), String(version));
    check('the shell cache names a build', Boolean(cache), String(cache));
    check('and all three are the same build',
        Boolean(meta) && meta === version && version === cache,
        `page=${meta} app=${version} cache=${cache}`);
}

{
    suite('every local asset the app loads is in the shell');

    // What the document itself pulls in.
    const referenced = [...page.matchAll(/<script src="([^"]+)"/g)].map(m => m[1])
        .concat([...page.matchAll(/<link[^>]+href="([^"]+)"/g)].map(m => m[1]))
        .filter(src => !/^https?:/.test(src));

    check('the page loads at least the shell scripts', referenced.length > 10,
        String(referenced.length));
    const strayTags = referenced.filter(src => !shellPaths.includes(src));
    check('and every one of them is precached', strayTags.length === 0, strayTags.join(', '));

    // And what the scripts pull in at RUNTIME, which no tag on the page mentions: the
    // cloud adapter is imported by app.js after boot, and it imports its own config. An
    // installed app that cannot fetch those signs nobody in and says nothing about why.
    const dynamic = [...app.matchAll(/ADAPTER_URL = '([^']+)'/g)].map(m => m[1])
        .map(src => src.replace(/^\.\//, ''));
    check('the adapter path is not spelled relative to the script that imports it',
        !/import\('\.\//.test(appCode),
        (appCode.match(/import\('[^']*'\)/) || [''])[0]);
    check('app.js imports the adapter at runtime', dynamic.length === 1, dynamic.join(', '));
    const strayDynamic = dynamic.filter(src => !shellPaths.includes(src));
    check('and the runtime import is precached too', strayDynamic.length === 0,
        strayDynamic.join(', '));

    const adapterLocal = [...adapter.matchAll(/from ['"](\.[^'"]+)['"]/g)]
        .map(m => m[1].replace(/^\.\//, 'js/sync/'));
    check('the adapter imports its config from this origin', adapterLocal.length >= 1,
        adapterLocal.join(', '));
    const strayAdapter = adapterLocal.filter(src => !shellPaths.includes(src));
    check('and that is precached as well', strayAdapter.length === 0, strayAdapter.join(', '));
}

{
    suite('every shell entry is a file that exists');

    // A shell entry that 404s fails the install - correctly, because half a build is not
    // a build - and the phone then keeps running the previous version with nothing on
    // screen saying why the update never arrived.
    const missing = SHELL
        .filter(entry => entry !== './')
        .map(entry => entry.replace('./', ''))
        .filter(path => !existsSync(join(ROOT, path)));
    check('nothing in the shell list is missing from the repository',
        missing.length === 0, missing.join(', '));

    const duplicates = shellPaths.filter((path, at) => shellPaths.indexOf(path) !== at);
    check('and nothing is listed twice', duplicates.length === 0, duplicates.join(', '));
}

{
    suite('an older cache is never written to');

    // Nothing is ever WRITTEN into another build's cache, and the one place another
    // build's cache is opened at all is the read path that serves a window still running
    // it. This rule used to be "every cache opened is this version's" - and it was right
    // until clients.claim() started handing a page from the old build the new build's
    // bytes, which is the same mixed-build failure arriving from the other direction. So
    // the shape it pins moved with the behaviour: read another build's cache for a window
    // that is running it, write only this one's.
    // Two caches are bookkeeping rather than shelves: CLIENTS holds which window runs
    // which build, SHELVES holds each shelf's lifecycle state and which build is active.
    // Neither is ever served out of as a shelf, and both are excluded here for that
    // reason rather than to make room.
    const opens = [...code.matchAll(/caches\.open\(([^)]*)\)/g)].map(m => m[1].trim());
    const shelves = opens.filter(argument => argument !== 'CLIENTS' && argument !== 'SHELVES');
    const foreign = shelves.filter(argument => argument !== 'VERSION');
    // `cacheName` is serveFrom's one named shelf; `name` is shelfUsable's, which reads a
    // shelf to check its inventory and never serves out of it. Two names, both singular,
    // neither a search.
    check('a page is only ever served out of one named shelf, never a search across them',
        foreign.every(argument => argument === 'cacheName' || argument === 'name')
        && /function serveFrom\(cacheName, request, allowNetwork\) \{[\s\S]{0,200}?caches\.open\(cacheName\)/.test(code),
        foreign.join(', '));
    check('and no page bytes are written into a shelf that is not this build\'s',
        [...code.matchAll(/caches\.open\(([^)]*)\)[\s\S]{0,300}?cache\.(?:put|add)\(/g)]
            .every(match => ['VERSION', 'CLIENTS', 'SHELVES', 'cache'].indexOf(match[1].trim()) !== -1));

    // The one cache that is not a build shelf. It holds which window is running which
    // build - the record a worker restart used to lose, after which this build's own
    // window was served the oldest shelf on the device. It is never a shelf itself: not
    // reaped as one, not served out of as one.
    check('the client bookkeeping is not treated as a build shelf',
        /key !== VERSION && key !== CLIENTS/.test(code)
        && !/serveFrom\(CLIENTS/.test(code));

    check('no cache is searched across every version',
        !/caches\.match\(/.test(code));

    // A failed install must leave the old cache serving. The shape that guarantees it:
    // the install handler counts what could not be cached and throws, rather than
    // swallowing the failure and letting a half-fetched build activate.
    // To the end of the HANDLER, not to the next listener: the helpers the reap is built
    // from sit between the two, and slicing to the activate listener swept them into the
    // install handler and reported a delete inside it that is not there.
    const installAt = code.indexOf("addEventListener('install'");
    const install = code.slice(installAt, code.indexOf('\n});', installAt) + 4);
    check('a half-fetched shell fails the install rather than activating',
        /throw new Error\('shell incomplete/.test(install));

    // And nothing in the install handler deletes a cache at all: reaping is reachable
    // only from activate and from a navigation, and the browser runs neither unless the
    // install succeeded.
    check('the old cache is deleted only after a successful install',
        /caches\.delete/.test(code) && !/caches\.delete/.test(install));
    // And only shelves something explicitly RETIRED.
    //
    // This used to pin `!isNewerShelf(key)` - a shelf was protected if its version number
    // was higher, or on a tie if its name sorted later. Both are guesses about lifecycle
    // made from a string, and both delete a complete waiting shelf in ordinary cases: a
    // rollback installs a lower name, a same-version candidate ties and loses. Measured in
    // tests/swidentity.test.mjs, on a real browser, with a real install.
    //
    // Lifecycle is written down instead. `installing` is being filled, `complete` has been
    // installed and is waiting, `retired` was replaced by the worker that took over its
    // windows - and only the last of those is collectable. A shelf with no mark at all
    // predates the registry, and an unmarked shelf is not evidence that it is disposable.
    const reapable = code.slice(code.indexOf('function reapableShelves()'),
        code.indexOf('function strangerOpen()'));
    check('and only shelves a worker explicitly retired after taking over their windows',
        /if \(state === 'retired'\) return name;/.test(reapable)
        && /if \(state !== null\) return null;/.test(reapable)
        && /key !== VERSION && key !== CLIENTS && key !== SHELVES/.test(code)
        && !/isNewerShelf/.test(code)
        && [...code.matchAll(/caches\.delete\(([^)]*)\)/g)]
            .every(match => ['key', 'request'].indexOf(match[1].trim()) !== -1),
        reapable.length ? 'reapableShelves found' : 'reapableShelves NOT found');
    // The one shelf with no mark that must still be protected: a build that predates the
    // registry, installing or waiting RIGHT NOW - which is what a rollback to such a build
    // looks like. That is answered from the browser's own lifecycle state, never from the
    // shelf's name.
    check('and never an unmarked shelf while anything is installing or waiting',
        /self\.registration\.installing \|\| self\.registration\.waiting/.test(reapable)
        && /return busy \? null : name;/.test(reapable));

    // The reap is guarded by what every open window is RUNNING. It used to reap and then
    // claim, so the old build's cache went while a window was still executing the old
    // build - and after the claim that window had nowhere of its own left to be served
    // from. A window whose build nobody wrote down holds EVERY shelf: it is running
    // something, and until it is gone nothing here can be proved unused.
    check('and not while a window is still running one of them',
        /function reapUnusedCaches\(\) \{\s*return buildsInUse\(\)/.test(code)
        && /if \(state\.unknown\) return undefined;/.test(code)
        && /\.filter\(key => !state\.held\.has\(key\)\)/.test(code));
    // Enroll, then claim, then retire, then reap - and the order is the guarantee.
    //
    // Claiming first is what made a legacy window unidentifiable: the instant the claim
    // lands, the evidence of which worker was serving it is gone. So the windows the
    // outgoing worker was controlling are written down while that is still a fact, and the
    // claim only happens if the write was read back. Retiring the replaced build comes
    // after the claim, because a retired shelf is a collectable one and it must not become
    // collectable until its windows have somewhere else to be identified from.
    const activate = code.slice(code.indexOf("addEventListener('activate'"));
    check('the windows are enrolled before the claim, and the claim before the reap',
        /enrollLegacyClients\(\)/.test(activate)
        && activate.indexOf('enrollLegacyClients()') < activate.indexOf('self.clients.claim()')
        && activate.indexOf('self.clients.claim()') < activate.indexOf('reapUnusedCaches()')
        && /if \(!enrollment\.ok\)/.test(activate));
    check('and a worker that could not record them does not claim them',
        /if \(!enrollment\.ok\) \{[\s\S]{0,200}?return undefined;/.test(activate));
}

{
    suite('the shipped feature flags are frozen, and nothing shipped can open one');

    // FARKAD_FLAGS decides whether this build does permanent deletion and whether it does
    // vehicles. Both are off, and both are off because turning one on is a decision about
    // somebody's record or somebody's money that has not been made.
    //
    // `const` binds the NAME, not the object - so a gate that is only a const is a gate a
    // stray line can open. It is frozen, and the one seam that can change it is a test
    // seam: FARKAD_FLAG_OVERRIDES, read once at definition time. No file this app ships
    // may define it, and that is what the second check below is for. Nothing in a browser
    // can create it either: index.html loads only the scripts in the offline shell.
    const schema = readFileSync(join(ROOT, 'js/model/schema.js'), 'utf8');

    check('the flags object is frozen', /const FARKAD_FLAGS = Object\.freeze\(/.test(schema));
    check('and both gates are shut in the shipped defaults',
        /permanentDeletion: false/.test(schema) && /vehicles: false/.test(schema),
        schema.slice(schema.indexOf('const FARKAD_SHIPPED_FLAGS'),
            schema.indexOf('const FARKAD_FLAGS')).match(/\w+: (true|false)/g).join(', '));

    // Every file the service worker caches - which is every file that reaches a phone.
    const shell = readFileSync(join(ROOT, 'sw.js'), 'utf8');
    const cached = [...shell.matchAll(/'\.\/(js\/[^']+\.js)'/g)].map(match => match[1]);
    check('the shell names the scripts it caches', cached.length > 10, String(cached.length));

    const setsOverride = cached.filter(file => {
        const code = readFileSync(join(ROOT, file), 'utf8');
        // Reading it is what schema.js does. WRITING it is what nothing may do.
        return /FARKAD_FLAG_OVERRIDES\s*=[^=]/.test(code)
            || /(var|let|const)\s+FARKAD_FLAG_OVERRIDES/.test(code);
    });
    check('no file that reaches a phone defines the test seam',
        setsOverride.length === 0, setsOverride.join(', '));

    const page = readFileSync(join(ROOT, 'index.html'), 'utf8');
    check('nor does the page itself',
        !/FARKAD_FLAG_OVERRIDES/.test(page));
}

report();
