// What the boot SAYS, in order, on a disk it had to make two decisions about.
//
//   npm run test:boot
//
// Asserts the SEQUENCE, not the final state, and for the reason tests/status.test.mjs
// was written down: a claim made and withdrawn is invisible to a check that only looks
// at what is on screen when the dust settles, and that claim is the defect. Both of
// js/app.js's boot branches fire synchronously off one `result`, and the app's dialogs
// displace one another - askResetExtras resolves the question it is covering as a
// dismissal - so a false sentence raised over a true one leaves no trace at all.
//
// It has to be a browser. `boot()` is not reachable from tests/harness.mjs: the harness
// does not load js/app.js and could not run it if it did, because boot() calls into a
// dozen files a device does not have. Standing in a fake boot here would measure a
// paraphrase of the sequence rather than the sequence.
//
// The instrument is the same idea as watchStatus in tests/status.test.mjs, moved to the
// one function the boot speaks through: askTell is wrapped and every call recorded, in
// order, with what it was asked to say. The wrapper is installed from a DOMContentLoaded
// listener registered in an init script - init scripts run before every page script, and
// listeners fire in registration order, so this one is in place before js/app.js's own
// listener calls boot(). It cannot be installed any earlier: askTell is a function
// declaration in a classic script and does not exist until js/ui/ask.js is evaluated.

import { serve } from './serve.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { suite, check, given, report } from './runner.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const EXEC = process.env.CHROME_PATH || undefined;
const server = process.env.SMOKE_URL
    ? { url: process.env.SMOKE_URL, close: () => {} }
    : await serve(new URL('..', import.meta.url).pathname);

const SERVED_ROOT = new URL('..', import.meta.url).pathname;
const SERVED_SHA = expectedShaFor(SERVED_ROOT);
const SERVED = await verifyServedAssets(server.url, SERVED_ROOT, SERVED_SHA);
check('the origin served this commit, byte for byte',
    SERVED.ok, `${SERVED.checked} assets; ${SERVED.wrong.slice(0, 3).join(' | ')}`);

const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});
const errors = [];

// The v2 record, truncated mid-name the way a write that ran out of room leaves it, and
// the v1 record underneath it - the same fixture tests/data.test.mjs stages for this
// boot. Two places share a name, so the migration raises questions and the app takes the
// branch that also opens the decisions modal.
const BROKEN_V2 = '{"schemaVersion":2,"workers":[{"id":"w_01","name":"דו';
const V1 = JSON.stringify({
    workers: ['דוד', 'שרה'], places: ['הרצליה', 'הרצליה'],
    weekStartDate: '2026-08-07',
    assignments: [{ index: 0, value: 'הרצליה' }]
});

// One boot, on a disk staged before the first script runs. Returns everything the boot
// said, in the order it said it, what the screen holds afterwards, and the page - so the
// caller can answer the dialog and look at what is behind it.
async function boot(storage) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(String(error && error.message)));
    page.on('dialog', dialog => dialog.accept());

    await page.addInitScript(disk => {
        Object.keys(disk).forEach(key => {
            try { localStorage.setItem(key, disk[key]); } catch (error) { /* nothing */ }
        });
        window.__said = [];
        document.addEventListener('DOMContentLoaded', () => {
            const real = window.askTell;
            window.askTell = function (options) {
                window.__said.push(String(
                    typeof options === 'string' ? options : (options && options.title)));
                return real.apply(this, arguments);
            };
        });
    }, storage);

    await page.goto(`${server.url}/index.html`, { waitUntil: 'load' });
    await page.waitForTimeout(700);

    const seen = await page.evaluate(() => ({
        said: window.__said,
        onScreen: String((document.getElementById('askTitle') || {}).textContent || ''),
        // What the SCREEN does, not what the inline style says: a modal that was never
        // opened has no inline display at all, and comparing that empty string with
        // 'none' is a check that reads the same for "shut" and "never touched".
        migrationModal: (node => node ? getComputedStyle(node).display : 'no such node')(
            document.getElementById('migrationModal')),
        questions: State.migrationIssues.length,
        blocked: typeof farkadWritesBlocked === 'function' && farkadWritesBlocked(),
        crew: State.schedule.workers.length,
        v2: localStorage.getItem('scheduleData:v2')
    }));
    seen.page = page;
    return seen;
}

// The dialog answered the way a person answers it, and what the screen holds a moment
// later. The migration branch chains openMigrationModal onto its own dialog, so the
// questions arrive only once the sentence in front of them has been read.
async function dismiss(page) {
    return page.evaluate(async () => {
        const ok = document.getElementById('askOk');
        if (ok) ok.click();
        await new Promise(done => setTimeout(done, 250));
        return {
            migrationModal: (node => node ? getComputedStyle(node).display : 'no such node')(
                document.getElementById('migrationModal')),
            onScreen: String((document.getElementById('askTitle') || {}).textContent || '')
        };
    });
}

const MIGRATED = 'הנתונים הועברו לגרסה החדשה';
const DAMAGED = 'הקובץ השמור נפגם';

// ------------------------------------------- the boot that both migrates and is damaged
{
    suite('a boot that migrates because it is damaged says only the true half');

    const seen = await boot({ 'scheduleData:v2': BROKEN_V2, scheduleData: V1 });

    given('the v1 record was read, so there is a week on screen',
        seen.crew === 2 && seen.questions > 0, JSON.stringify(seen));
    given('and it is the held boot: the damaged bytes kept, writing stopped',
        seen.v2 === BROKEN_V2 && seen.blocked === true,
        JSON.stringify({ v2: seen.v2, blocked: seen.blocked }));

    // js/state.js:120-122 is deliberate: the migrated week is SHOWN and not written
    // down, because saving it would put pre-migration data over the newest record there
    // is. The sentence «הנתונים הועברו לגרסה החדשה» describes a migration that happened
    // to this device's disk. On this boot nothing happened to the disk.
    check('the boot does not claim a migration it deliberately did not write down',
        seen.said.indexOf(MIGRATED) === -1, JSON.stringify(seen.said));
    check('it says one thing, and it is that the record is damaged',
        seen.said.length === 1 && seen.said[0] === DAMAGED, JSON.stringify(seen.said));
    check('and the damage notice is the sentence left on the screen',
        seen.onScreen === DAMAGED, JSON.stringify(seen.onScreen));

    // The other half of the same claim, and the one a person can actually see: the
    // migration branch chains openMigrationModal onto its dialog, and a DISPLACED dialog
    // resolves - as a dismissal - so on this boot the modal opened by itself, over the
    // damage notice. The person was asked to answer questions about a migration that was
    // never recorded, on a device that cannot record the answers either.
    check('and it does not open questions the device could not record the answers to',
        seen.migrationModal === 'none', JSON.stringify(seen.migrationModal));

    const after = await dismiss(seen.page);
    check('nor when the damage notice itself is read and closed',
        after.migrationModal === 'none', JSON.stringify(after));

    check('nothing threw on the way through that boot', errors.length === 0,
        JSON.stringify(errors.slice(0, 3)));
    await seen.page.context().close();
}

// ------------------------------------------------------- the ordinary migration boot
//
// The control. A guard that silenced the honest migration too would pass every check
// above and take with it the one sentence that tells somebody their old board was read.
{
    suite('an ordinary migration still says so, and still asks its questions');

    const before = errors.length;
    const seen = await boot({ scheduleData: V1 });

    given('the migration ran and left questions behind',
        seen.crew === 2 && seen.questions > 0, JSON.stringify(seen));
    given('nothing was damaged, so nothing is held',
        seen.blocked === false && seen.v2 !== BROKEN_V2,
        JSON.stringify({ blocked: seen.blocked }));

    const after = await dismiss(seen.page);

    check('the boot says the data was moved to the new version',
        seen.said.indexOf(MIGRATED) !== -1, JSON.stringify(seen.said));
    check('and puts the unanswered questions in front of the person who read that',
        after.migrationModal === 'flex', JSON.stringify(after));
    check('nothing threw on the way through that boot either',
        errors.length === before, JSON.stringify(errors.slice(before, before + 3)));
    await seen.page.context().close();
}

await browser.close();
server.close();
report();
