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

    // Every cache this worker opens is THIS version's. Opening any other - or falling
    // through to caches.match() across all of them - serves or overwrites an asset from
    // the build before this one, which is the mixed-build failure by another route.
    const opens = [...code.matchAll(/caches\.open\(([^)]*)\)/g)].map(m => m[1].trim());
    const foreign = opens.filter(argument => argument !== 'VERSION');
    check('every cache opened is this version\'s', foreign.length === 0, foreign.join(', '));

    check('no cache is searched across every version',
        !/caches\.match\(/.test(code));

    // A failed install must leave the old cache serving. The shape that guarantees it:
    // the install handler counts what could not be cached and throws, rather than
    // swallowing the failure and letting a half-fetched build activate.
    const install = code.slice(code.indexOf("addEventListener('install'"),
        code.indexOf("addEventListener('activate'"));
    check('a half-fetched shell fails the install rather than activating',
        /throw new Error\('shell incomplete/.test(install));

    // And deleting the previous cache happens only in activate, which the browser does
    // not run unless install succeeded.
    const activate = code.slice(code.indexOf("addEventListener('activate'"));
    check('the old cache is deleted only after a successful install',
        /caches\.delete/.test(activate) && !/caches\.delete/.test(install));
    check('and only caches that are not this version',
        /keys\.filter\(key => key !== VERSION\)/.test(activate));
}

report();
