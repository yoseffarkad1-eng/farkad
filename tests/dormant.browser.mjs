// tests/dormant.browser.mjs
//
// v190 IS, FOR A PERSON, THE BUILD IT WAS MADE ON - plus nothing visible.
//
//   npm run test:dormant-browser
//
// The owner's decision 71 (option B, 2026-11-11): nobody on any phone sees anything of the
// pay book until he says "activate". So the build that is served first carries all of it
// and shows none of it. This suite is that sentence, measured in Chromium by putting TWO
// TREES side by side on one seeded record:
//
//   BEFORE  the commit this build is made on (BASE, out of Git - main as it is served)
//   THIS    this tree, as it ships: no flag named through the seam
//
// and reading, screen by screen, every run of words on the glass and every control with
// its id, its words and its inline handler. What may differ is the version line and
// nothing else. Then the two things a comparison cannot say by itself: that no element of
// the pay book exists anywhere in the page, and that the offer is absent for a REASON
// (the flag) and not by accident - the same page with `paybookActivation: true` through
// the seam does draw the row.
//
// The other half - that this build HONOURS a record another phone turned on - is
// tests/activation.browser.mjs («the build as it ships is handed a record that is on»)
// and tests/activation.test.mjs, V13b.
//
// BASE moves with the commit this build is packaged on: it is the same commit
// tests/accounts.test.mjs compares js/ui/reports.js against, and that suite fails if the
// two ever name different commits (it reads this file).

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import { launch, openPhone, seed, bare, FORTNIGHT } from './accounts.world.mjs';

export const BASE = '9846d7f';

const root = new URL('..', import.meta.url).pathname;
const git = args => execFileSync('git', ['-C', root].concat(args), { maxBuffer: 256 * 1024 * 1024 });

let present = false;
try { present = git(['cat-file', '-t', BASE]).toString().trim() === 'commit'; } catch (error) { present = false; }
given('the commit this build is made on is in this repository', present, BASE);
const baseVersion = (/const APP_VERSION = '([^']+)'/.exec(git(['show', `${BASE}:js/app.js`]).toString('utf8')) || [])[1];
const thisVersion = (/const APP_VERSION = '([^']+)'/.exec(git(['show', 'HEAD:js/app.js']).toString('utf8')) || [])[1];

// The older tree, whole, as Git holds it - not a copy of this one with files taken out.
const work = mkdtempSync(join(tmpdir(), 'farkad-dormant-'));
execFileSync('tar', ['-x', '-C', work], { input: git(['archive', '--format=tar', BASE]), maxBuffer: 256 * 1024 * 1024 });
given('the older tree is on the disk', existsSync(join(work, 'index.html')) && existsSync(join(work, 'js/app.js')));
given('the older tree has never heard of the pay book\'s screens', !existsSync(join(work, 'js/ui/accounts.js')));

const serverThis = await serve(root);
const serverBase = await serve(work);
const served = await verifyServedAssets(serverThis.url, root, expectedShaFor(root));
check('the origin served this commit, byte for byte', served.ok,
    `${served.checked} assets; ${(served.wrong || []).slice(0, 3).join(' | ')}`);
const browser = await launch(chromium);

// What a person can read and press, on whatever is up right now.
const inventory = () => {
    const seen = node => {
        if (!node.isConnected) return false;
        for (let at = node; at && at.nodeType === 1; at = at.parentElement) {
            const style = getComputedStyle(at);
            if (style.display === 'none' || style.visibility === 'hidden' || at.hidden) return false;
            if (at.tagName === 'DETAILS' && !at.open && node !== at && !(node.closest('summary') && node.closest('summary').parentElement === at)) return false;
        }
        return true;
    };
    const clean = text => String(text || '').replace(/[⁦-⁩‎‏]/g, '').replace(/\s+/g, ' ').trim();
    const words = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const said = clean(node.nodeValue);
        if (said && node.parentElement && !/^(SCRIPT|STYLE|TEMPLATE)$/.test(node.parentElement.tagName) && seen(node.parentElement)) words.push(said);
    }
    const controls = [...document.querySelectorAll('button, input, select, textarea, a[href], summary, [role="tab"]')].filter(seen)
        .map(node => [node.tagName.toLowerCase(), node.id || '', node.type || '', clean(node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.tagName === 'SELECT' ? node.value : node.textContent).slice(0, 120),
            node.getAttribute('onclick') || '', node.disabled === true ? 'disabled' : ''].join(' | '));
    return { words, controls };
};
// The lines that say which build this is, or what the clock says - and nothing else.
const moving = (line, versions) => versions.some(version => line.includes(version));

// seed() waits for a cloud these phones do not have; the record itself is written
// synchronously before that wait, and is what is asked for here.
async function local(url, flags) {
    const phone = await openPhone(browser, url, flags ? { flags } : {});
    const done = seed(phone.page, { legacy: true });
    done.catch(() => null);
    await phone.page.waitForFunction(() => State.schedule.workers.length === 5
        && Object.keys(State.schedule.advances || {}).length === 4, null, { timeout: 20000 });
    await phone.page.waitForTimeout(300);
    return phone;
}

const before = await local(serverBase.url);
const now = await local(serverThis.url);
const versions = [baseVersion, thisVersion];

// THE SCREENS, each reached by the app's own function - the same call on both trees.
const SCREENS = [
    ['the day', () => { showView('day'); }],
    ['the week', () => { showView('week'); }],
    ['the crew and the sites', () => { showView('roster'); }],
    ['the «מקדמות» tab', () => { ADVANCE_WORKER = null; showView('advances'); }],
    ['one man\'s advances page', () => { showView('advances'); showWorkerAdvances('w_khaled'); }],
    ['the reports, over the open fortnight', range => { REPORT_RANGE.from = range.from; REPORT_RANGE.to = range.to; showView('reports'); }],
    ['one man\'s days, with the closure of his account', range => { REPORT_RANGE.from = range.from; REPORT_RANGE.to = range.to; showView('reports'); openWorkerDays('w_khaled'); }],
    ['one man\'s days, an account closed the old way', () => { REPORT_RANGE.from = '2026-09-18'; REPORT_RANGE.to = '2026-10-01'; showView('reports'); openWorkerDays('w_nasser'); }],
    ['the worker\'s card', () => { if (typeof closeWorkerDays === 'function') closeWorkerDays(); showView('roster'); openWorkerCard('w_khaled'); }],
    ['the ⋯ sheet', () => { if (typeof closeWorkerCard === 'function') closeWorkerCard(); showView('day'); openSettings(); }],
    ['the ⋯ sheet with every row open', () => { openSettings(); document.querySelectorAll('#settingsPanel details').forEach(row => { row.open = true; }); }]
];

{
    suite(`the two trees: ${baseVersion} out of Git, and this build as it ships`);

    same('the older tree names itself, and this one names another build', [typeof baseVersion, baseVersion !== thisVersion], ['string', true]);
    same('this page runs the build as it ships: the three switches false, the step not offered, the honouring on',
        await now.page.evaluate(() => [FARKAD_FLAGS.paybook, FARKAD_FLAGS.months, FARKAD_FLAGS.cold, FARKAD_FLAGS.paybookQueue, FARKAD_FLAGS.paybookActivation, FARKAD_FLAGS.paybookHonour,
            typeof FARKAD_FLAG_OVERRIDES]), [false, false, false, false, false, true, 'undefined']);
    same('both hold the same record: five men, the days, four advances, two closures made the old way',
        await Promise.all([before, now].map(phone => phone.page.evaluate(() => [State.schedule.workers.length, Object.keys(State.schedule.days).length,
            Object.keys(State.schedule.advances).length, Object.keys(closedPeriods(State.schedule, 'w_nasser')).length].join()))), ['5,14,4,1', '5,14,4,1']);
}

for (const [name, go] of SCREENS) {
    suite(`${name}: what is on the glass is what ${baseVersion} puts there`);

    const read = async phone => {
        await phone.page.evaluate(go, FORTNIGHT);
        await phone.page.waitForTimeout(350);
        return phone.page.evaluate(inventory);
    };
    const [was, is] = [await read(before), await read(now)];
    given('the older build draws something here', was.words.length > 3 && was.controls.length > 0, `${was.words.length} / ${was.controls.length}`);
    console.log(`  measured: ${was.words.length} runs of words and ${was.controls.length} controls on ${baseVersion}; ${is.words.length} and ${is.controls.length} on this build`);
    const steady = list => list.filter(line => !moving(line, versions));
    same('every run of words, in order - the same', steady(is.words), steady(was.words));
    same('every control, with its id, its words and its inline handler - the same', steady(is.controls), steady(was.controls));
    same('what differs at all is the line that names the build',
        [is.words.filter(line => moving(line, versions)).length, was.words.filter(line => moving(line, versions)).length].every(count => count <= 2)
        && is.words.length === was.words.length, true);
    same('no word of the pay book is on it', is.words.concat(is.controls).filter(line => /פנקס שכר|פנקס השכר|חשבונות עובדים|סגירת חשבון ואיפוס|ארכיון סגירות/.test(line)), []);
}

{
    suite('and in the whole page, whatever is up: no element of the pay book exists');

    await now.page.evaluate(() => { closeSettings(); showView('advances'); });
    await now.page.waitForTimeout(200);
    same('no box for the row, no accounts screen, no class of the pay book\'s on any element - through every screen above',
        await now.page.evaluate(() => [document.querySelectorAll('#paybookActivationBox').length, document.querySelectorAll('.acc-screen').length,
            [...document.querySelectorAll('[class]')].filter(node => /(^|\s)acc-/.test(node.getAttribute('class'))).length, typeof ACC === 'object' ? ACC.screen : null,
            accountsTakesTab(), accountsOpen()]), [0, 0, 0, 'list', false, false]);
    await now.page.evaluate(() => { openSettings(); renderSettings(); renderSettings(); });
    await now.page.waitForTimeout(200);
    same('a redraw of the ⋯ sheet, twice, draws no row', await now.page.locator('#paybookActivationBox').count(), 0);
    same('the model offers nothing either: no step to draw, and an opening is refused with `gate`',
        await now.page.evaluate(() => { const stamp = { at: new Date().toISOString(), by: String(syncDeviceId()), today: todayStr() };
            const drawn = planActivation(State.schedule, todayStr(), stamp);
            return [drawn.state, drawn.report, planOpening(State.schedule, todayStr(), stamp).reasons, paybookOn(State.schedule)]; }), ['off', null, ['gate'], false]);
    same('no page error on either tree', [before.errors, now.errors], [[], []]);
}

{
    suite('the row is absent BECAUSE OF THE FLAG: the same tree with the one line changed draws it');

    const next = await local(serverThis.url, { paybookActivation: true });
    await next.page.evaluate(() => { showView('day'); openSettings(); });
    await next.page.waitForTimeout(250);
    same('with `paybookActivation: true` through the seam - the build of the day he says "activate" - the sheet has the one row, its sentence and its button',
        [await next.page.locator('#paybookActivationBox').count(), bare(await next.page.locator('#paybookActivationBox .hint').textContent()),
            (await next.page.locator('#paybookActivationBox button').allTextContents()).map(bare)],
        [1, 'פנקס שכר (סגירת חשבון, תשלומים וארכיון): עוד לא הופעל ברישום הזה.', ['פנקס שכר - הכנה והפעלה']]);
    const [withRow, without] = [await next.page.evaluate(inventory), await (async () => { await now.page.evaluate(() => { showView('day'); openSettings(); });
        await now.page.waitForTimeout(250); return now.page.evaluate(inventory); })()];
    same('and that row is the WHOLE difference between the two on the ⋯ sheet: one sentence and one button',
        [withRow.words.filter(line => without.words.indexOf(line) === -1), withRow.words.length - without.words.length, withRow.controls.length - without.controls.length],
        [['פנקס שכר (סגירת חשבון, תשלומים וארכיון): עוד לא הופעל ברישום הזה.', 'פנקס שכר - הכנה והפעלה'], 2, 1]);
    await next.context.close();
}

await before.context.close();
await now.context.close();
await browser.close();
await serverThis.close();
await serverBase.close();
rmSync(work, { recursive: true, force: true });
report();
