// What a deploy of this app actually consists of, read off the app rather than listed.
//
// Four browser suites serve a COPY of the tree, and each of them used to carry the same
// hand-written list: index.html, sw.js, the manifest, css, js, icons. It was correct for
// years and then it was not - the shell grew vendor/ and no list mentioned it.
//
// What that costs is out of all proportion to the mistake. The service worker installs
// all-or-none on purpose, so one missing file does not degrade anything: the worker never
// activates, no page is ever controlled, and the suite fails on a fifteen-second timeout
// that names neither the file nor the reason. A test that goes red for a reason it cannot
// state is worse than one that stays green, because somebody spends an afternoon looking
// at the app.
//
// So the list is derived, from the SHELL in that tree's own sw.js. Its own, not this
// checkout's: tests/handover.test.mjs serves two builds of different ages side by side,
// and the older one's shell is genuinely a different list.

import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The parse, over the text of one sw.js. Separated so a caller holding a git blob - an
// older build's worker, out of the object store - can ask the same question of it.
export function deployedFromSource(source, where = 'sw.js') {
    const block = /const SHELL = \[([\s\S]*?)\];/.exec(source);
    if (!block) throw new Error(`no SHELL array in ${where}`);

    const tops = [...new Set(
        [...block[1].matchAll(/'\.\/([^']*)'/g)]
            .map(match => match[1].split('/')[0])
            // './' is the page itself, which arrives as index.html.
            .filter(name => name !== '')
    )];
    if (tops.length < 2) throw new Error(`shell in ${where} names only ${tops.join(', ')}`);
    // sw.js is not in the shell - a worker does not cache itself - and is always deployed.
    return ['sw.js', ...tops];
}

export function deployedFromSync(root) {
    return deployedFromSource(readFileSync(join(root, 'sw.js'), 'utf8'), join(root, 'sw.js'));
}

// The top-level file or directory of every shell entry, deduped, plus sw.js - which the
// shell does not name because a worker does not cache itself.
export async function deployedFrom(root) {
    return deployedFromSource(await readFile(join(root, 'sw.js'), 'utf8'), join(root, 'sw.js'));
}
