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
// running app, and needs Playwright and a server to do it; this one is a file read and
// one question put to git, so it runs in a second, before a commit.
//
// The git question is the last suite, and it is the one the other four could not ask.
// Everything above compares the build's own strings with each other; agreement between
// three strings says nothing about whether they still describe the BYTES, and the failure
// law 5 exists to prevent is exactly that - a shell file changed and the stamps left
// where they were. So the last suite asks git what has moved since the stamps last did.

import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { suite, check, given, report } from './runner.mjs';

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
    suite('the diagnostic for a boot that failed is in the document, not in the code');

    // WHAT A PERSON GETS WHEN THE APP DOES NOT COME UP.
    //
    // Every other failure message in this app is assembled at runtime by el() and clear()
    // from js/ui/dom.js, drawn by render() out of js/app.js, and reached through Recovery
    // and Store. All of that is correct for a fault INSIDE a running app, and all of it is
    // useless for the fault that matters most at six in the morning: one of those files is
    // the thing that did not arrive. There the page is white, the phone says nothing, and
    // the person cannot tell a fortnight of records behind a blank screen from a fortnight
    // that is gone.
    //
    // So the sentence is IN THE DOCUMENT, and the only thing any code does is reveal it.
    // The checks below are what stops that quietly becoming untrue - the day somebody
    // "tidies" the banner into a call to el(), the sentence stops existing until the file
    // that defines el() has loaded, which is precisely when it is needed.
    //
    // tests/startup.blank.test.mjs measures the same guarantee from the other end, in a
    // real browser, with the file actually withheld. This is the one-second version that
    // runs in npm test, on a machine with no browser on it.
    const SENTENCE = '⚠️ האפליקציה לא נטענה במלואה. מה שכבר נשמר במכשיר לא נפגע ולא נמחק'
        + ' - רענן את הדף. אם זה חוזר, נסה שוב כשיש חיבור טוב יותר.';

    check('the sentence is written into the page, word for word',
        page.includes(SENTENCE), SENTENCE.slice(0, 36) + '…');

    const bannerAt = page.indexOf('id="bootBanner"');
    const sentinelAt = page.indexOf('window.farkadBootSentinel');
    const firstScriptAt = page.indexOf('<script src=');
    check('its element is parsed before the sentinel that reveals it',
        bannerAt > -1 && sentinelAt > bannerAt, `banner@${bannerAt} sentinel@${sentinelAt}`);
    check('and the sentinel is installed before the first script the page loads',
        firstScriptAt > -1 && sentinelAt < firstScriptAt,
        `sentinel@${sentinelAt} first <script src>@${firstScriptAt}`);

    // The sentinel's own body. It may call getElementById and nothing else this app
    // defines: el, clear, button, State, Store, Recovery and render are every one of them
    // in a file that may be the thing that failed.
    const sentinel = page.slice(page.lastIndexOf('<script>', sentinelAt),
        page.indexOf('</script>', sentinelAt));
    check('the sentinel calls nothing the app defines',
        /getElementById/.test(sentinel)
        && !/\b(el|clear|button|State|Store|Recovery|render|askTell)\s*\(/.test(sentinel),
        `${sentinel.length} chars`);
    // And it never touches the record. The only thing worse than a white screen is a
    // white screen that wrote something.
    check('and never reads or writes the record on the disk',
        !/localStorage|indexedDB|sessionStorage/.test(sentinel));
    // It hands over rather than competing: once the app installs its own crash handler
    // this one is silent, so a person never gets two banners about one failure.
    check('and it stands down when the app takes error reporting over',
        /standDown/.test(sentinel) && /standDown/.test(appCode));

    // NOTHING OFF THIS ORIGIN IS IN FRONT OF THE FIRST RENDER.
    //
    // One <script src="https://…"> in the head is all it takes to put a hanging request
    // between a person and their own record - and on a site the request does not fail, it
    // HANGS, which is the failure js/app.js was rebuilt around. The suite above walks the
    // page's local assets and checks each is precached; it FILTERS OUT anything off-origin
    // on its way there, so until now an absolute URL was not caught, it was skipped.
    const offOrigin = [...page.matchAll(/<(?:script|link)[^>]+(?:src|href)="(https?:\/\/[^"]+)"/g)]
        .map(match => match[1]);
    check('nothing on the page is fetched from another origin', offOrigin.length === 0,
        offOrigin.join(', '));
    // And no tag on the page is a module: a module tag is deferred, fetched before
    // DOMContentLoaded, and this app's one module reaches gstatic. It is imported by
    // js/app.js after the local boot instead, which is what the suite above pins.
    check('and no script tag on the page is a module',
        !/<script[^>]+type="module"/.test(page));
}

{
    suite('a cache name belongs to one build and to nothing else');

    // Two builds sharing a shelf is the mixed-build session by the shortest possible
    // route: one cache, two programs, whichever was written last. The name is therefore
    // DERIVED from the build stamp rather than chosen, so a build that differs by its
    // stamp differs by its shelf - and the three stamps moving together (the first suite
    // in this file) is what makes the stamp differ at all.
    const version = (app.match(/APP_VERSION = '(v\d+)'/) || [])[1];
    const cacheLine = (sw.match(/const VERSION = '([^']+)';/) || [])[1];
    check('the shelf is named for the build and by nothing else',
        cacheLine === 'farkad-' + version, `${cacheLine} vs farkad-${version}`);

    // The two bookkeeping caches are not shelves and must never be mistaken for one: the
    // reaper collects by a pattern, and a bookkeeping cache caught by that pattern is the
    // record of who is running what, deleted.
    const bookkeeping = [...code.matchAll(/const (?:SHELVES|CLIENTS) = '([^']+)';/g)]
        .map(match => match[1]);
    check('the bookkeeping caches are named, and there are two of them',
        bookkeeping.length === 2, bookkeeping.join(', '));
    check('no bookkeeping cache could ever be read as a shelf name',
        bookkeeping.every(name => !/^farkad-v/.test(name))
        && bookkeeping.every(name => name !== cacheLine),
        bookkeeping.join(', '));
    check('and the shelf this build serves from matches the pattern the reaper uses',
        /^farkad-v\d/.test(cacheLine) && /\/\^farkad-v\//.test(code), cacheLine);
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

// ------------------------------------------------- the stamps against the bytes they name
//
// IRON LAW 5, MEASURED RATHER THAN TRUSTED.
//
// "The three build stamps move together, in the same commit as any change to a cached
// file." The first suite in this file proves the first half - the three agree with each
// other - and it is blind to the second, which is the half that hurts. Three stamps
// reading v104 over a shell that is no longer v104's shell is not a disagreement anything
// above can see: the strings match perfectly, and they are describing bytes that have
// moved out from under them.
//
// What that costs is the whole point of the law. The cache is named for the stamp, so a
// phone already holding farkad-v104 has a complete, valid shelf under that name; sw.js is
// cache-first for every file in it, the browser has no reason to install anything, and
// the change is never offered. The fix ships, the gate is green, and the phone that needs
// it goes on running the code the fix replaced - which on this app is somebody's pay.
//
// Found on this branch, not imagined: 79d6210 moved the stamps to v104, and 696ee86 then
// changed js/sync/receive.js - a SHELL file - and left them there.
//
// The question is put to git and it is one question: which files in the shell have
// changed since the commit that last wrote these stamps. Two things it deliberately does
// NOT do, because either would make it worse than nothing:
//
//   - it does not look inside the stamp commit itself. A commit that bumps the stamps AND
//     changes shell files is the CORRECT pattern - it is what the law asks for - and a
//     check that fired on it would train everybody to ignore this one.
//   - it does not look at anything outside the shell. Docs, tools and tests do not reach a
//     phone, and a build stamp is not a commit counter.
//
// It reads HEAD, not the working tree. A dirty tree mid-edit is the ordinary state of
// somebody about to do the right thing; the gate is run from one clean detached worktree
// (see CLAUDE.md, "Running it"), and there HEAD is the whole of what is being asked about.
function git(args, root) {
    return execFileSync('git', ['-C', root || ROOT].concat(args),
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

// The commit that last WROTE each stamp line, found by the line itself rather than by the
// file: -S counts occurrences of the string and names the commit where the count last
// CHANGED. For a stamp that is still in the file - which is the only kind this is ever
// asked about - that is the commit which introduced it, whatever else that commit touched.
// Asked about a stamp that has since been replaced it would name the commit that removed
// it, which is why the caller always builds the needle out of the CURRENT stamp.
function stampCommitsIn(root, stamps) {
    const found = {};
    stamps.forEach(({ file, line }) => {
        try {
            found[file] = git(['log', '-1', '--format=%H', '-S', line, '--', file], root).trim();
        } catch (error) {
            found[file] = '';
        }
    });
    return found;
}

// Every shell file whose bytes differ between that commit and HEAD.
function shellMovedSince(root, since, paths) {
    if (!since) return null;
    const out = git(['diff', '--name-only', `${since}..HEAD`, '--'].concat(paths), root);
    return out.split('\n').map(name => name.trim()).filter(Boolean);
}

{
    suite('the stamps were moved by the commit that moved the bytes');

    let head = '';
    try { head = git(['rev-parse', 'HEAD']).trim(); } catch (error) { head = ''; }
    given('this checkout is a git worktree', /^[0-9a-f]{40}$/.test(head), head || '(none)');

    const version = (app.match(/APP_VERSION = '(v\d+)'/) || [])[1];
    const stamps = [
        { file: 'index.html', line: `<meta name="farkad-build" content="${version}">` },
        { file: 'js/app.js', line: `const APP_VERSION = '${version}';` },
        { file: 'sw.js', line: `const VERSION = 'farkad-${version}';` }
    ];
    const commits = stampCommitsIn(ROOT, stamps);
    const shas = Object.values(commits);
    check('git can say when each of the three stamps was last written',
        shas.every(sha => /^[0-9a-f]{40}$/.test(sha)),
        Object.entries(commits).map(([file, sha]) => `${file}=${sha.slice(0, 8) || '(none)'}`).join(' '));

    // The historical half of law 5, which no comparison of strings can reach: the three
    // did not merely end up equal, they were written by ONE commit.
    check('and all three were written by the same commit',
        new Set(shas).size === 1,
        Object.entries(commits).map(([file, sha]) => `${file}=${sha.slice(0, 8)}`).join(' '));

    const since = shas[0];
    // The shell, as paths, plus the page itself: './' in the SHELL list is index.html and
    // git has no such path.
    const watched = [...new Set(shellPaths.filter(Boolean).concat('index.html'))];
    const moved = shellMovedSince(ROOT, since, watched);
    check('and nothing in the shell has changed since',
        Array.isArray(moved) && moved.length === 0,
        moved === null ? '(no stamp commit found)'
            : moved.length === 0 ? `nothing since ${String(since).slice(0, 8)}`
                : `${moved.length} changed since ${String(since).slice(0, 8)}: ${moved.join(', ')}`);

    // sw.js is not in its own shell - a worker does not cache itself - and it is the file
    // that NAMES the shelf. A worker whose code changed while VERSION did not is a second
    // build opening the first build's cache and writing its own bytes into it, which is
    // the one thing the shelf name exists to make impossible.
    const workerMoved = shellMovedSince(ROOT, since, ['sw.js']);
    check('and neither has the worker that names the shelf',
        Array.isArray(workerMoved) && workerMoved.length === 0,
        (workerMoved || []).join(', '));
}

{
    suite('and that check is not vacuous: the fault, planted, is caught');

    // A check about git history cannot be proved by the history it is reading - this
    // repository is in one state, and a check that passes here would pass just as well if
    // it always answered "nothing changed". So a repository is BUILT, with the three
    // histories that matter written into it deliberately, and the same two functions the
    // suite above uses are run over it.
    const work = mkdtempSync(join(tmpdir(), 'farkad-stamps-'));
    const commit = message => git(['-c', 'user.name=t', '-c', 'user.email=t@t',
        'commit', '-q', '-m', message], work);
    const write = (path, text) => {
        mkdirSync(dirname(join(work, path)), { recursive: true });
        writeFileSync(join(work, path), text);
    };
    const stampsFor = stamp => [
        { file: 'index.html', line: `<meta name="farkad-build" content="${stamp}">` },
        { file: 'js/app.js', line: `const APP_VERSION = '${stamp}';` },
        { file: 'sw.js', line: `const VERSION = 'farkad-${stamp}';` }
    ];
    const layDown = stamp => {
        write('index.html', `<meta name="farkad-build" content="${stamp}">\n`);
        write('js/app.js', `const APP_VERSION = '${stamp}';\n`);
        write('sw.js', `const VERSION = 'farkad-${stamp}';\n`);
    };
    const watched = ['js/store.js', 'index.html', 'js/app.js'];

    let built = true;
    try {
        git(['init', '-q', '-b', 'main'], work);
        layDown('v1');
        write('js/store.js', 'const a = 1;\n');
        write('docs/notes.md', 'not shipped\n');
        git(['add', '-A'], work);
        commit('v1: the stamps and the shell together');
    } catch (error) {
        built = false;
    }
    given('a repository with a known history could be built', built, work);

    const at = stamp => stampCommitsIn(work, stampsFor(stamp))['sw.js'];

    // 1. The correct pattern: nothing has happened since the stamps moved.
    const quiet = shellMovedSince(work, at('v1'), watched);
    check('a tree where nothing moved since the bump reports nothing',
        Array.isArray(quiet) && quiet.length === 0, (quiet || []).join(', '));

    // 2. A file that does not ship. This is the false fire that would make the check
    //    worse than nothing, so it is planted on purpose.
    write('docs/notes.md', 'still not shipped, edited\n');
    write('tests/whatever.test.mjs', 'nothing\n');
    git(['add', '-A'], work);
    commit('docs and a test, which reach no phone');
    const offShell = shellMovedSince(work, at('v1'), watched);
    check('a change to something that is not in the shell does not fire it',
        Array.isArray(offShell) && offShell.length === 0, (offShell || []).join(', '));

    // 3. THE FAULT. A shell file changed, the stamps left where they were - which is
    //    exactly 696ee86 over 79d6210, in miniature.
    write('js/store.js', 'const a = 2;   // the fix that will never reach a phone\n');
    git(['add', '-A'], work);
    commit('a shell file changed, and the stamps did not');
    const caught = shellMovedSince(work, at('v1'), watched);
    check('a shell file changed without a bump IS caught, and named',
        Array.isArray(caught) && caught.length === 1 && caught[0] === 'js/store.js',
        (caught || []).join(', '));

    // 4. The repair: the bump, in the same commit as more shell work. The check must go
    //    quiet - and must not be quiet merely because it looks at nothing.
    layDown('v2');
    write('js/store.js', 'const a = 3;\n');
    git(['add', '-A'], work);
    commit('v2: the stamps, with the shell change that needed them');
    const repaired = shellMovedSince(work, at('v2'), watched);
    check('and bumping the stamps in the same commit as the change clears it',
        Array.isArray(repaired) && repaired.length === 0, (repaired || []).join(', '));

    // 5. And it is still LOOKING. The quiet answer above has to be an answer about this
    //    tree, not a function that has stopped asking - so the fault is planted a second
    //    time, on top of the repair, and it must come back.
    write('js/store.js', 'const a = 4;   // and again, after the bump\n');
    git(['add', '-A'], work);
    commit('another shell change with no bump');
    const again = shellMovedSince(work, at('v2'), watched);
    check('and the next shell change with no bump fires it all over again',
        Array.isArray(again) && again.length === 1 && again[0] === 'js/store.js',
        (again || []).join(', '));

    // 6. All three stamps written by one commit, and the case where they were not.
    const together = stampCommitsIn(work, stampsFor('v2'));
    check('the three stamps of a correct bump resolve to one commit',
        new Set(Object.values(together)).size === 1,
        Object.entries(together).map(([f, sha]) => `${f}=${sha.slice(0, 8)}`).join(' '));

    write('js/app.js', "const APP_VERSION = 'v3';\n");
    git(['add', '-A'], work);
    commit('one stamp moved on its own, which is the other half of law 5');
    const split = stampCommitsIn(work, [
        { file: 'index.html', line: '<meta name="farkad-build" content="v2">' },
        { file: 'js/app.js', line: "const APP_VERSION = 'v3';" },
        { file: 'sw.js', line: "const VERSION = 'farkad-v2';" }
    ]);
    check('and a stamp moved on its own resolves to a different one, which is caught',
        new Set(Object.values(split)).size === 2,
        Object.entries(split).map(([f, sha]) => `${f}=${sha.slice(0, 8)}`).join(' '));

    rmSync(work, { recursive: true, force: true });
}

report();
