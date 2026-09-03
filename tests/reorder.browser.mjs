// The reorder mode, driven by real pointers in a real browser.
//
//   npm run test:reorder
//
// The mode is the one screen in this app built on pointer events and a timer, and
// neither exists in the node harness: `makeDevice` loads js/ui/roster.js against a
// document of nulls, so `startReorderDrag`, `onReorderDrag`, the 16ms autoscroll
// interval and `endReorderDrag` have never once been executed by a suite. Everything
// they hold - a drag in the air, three document listeners, an interval - is state that
// outlives the function that made it, which is the kind of state a screenshot cannot
// see and a data suite cannot reach.
//
// Two claims are measured here, both found by reading js/ui/roster.js and both
// reproduced through the shipped functions before anything was changed:
//
//   the mode's exits leave nothing armed. `closeReorder` used to clear the draft and
//   walk away from the drag: `reorderDragging` stayed non-null, the autoscroll interval
//   went on ticking every 16ms, and the three document listeners stayed attached. The
//   harm is not the leak, it is the NEXT open of the panel - `save.disabled =
//   Boolean(reorderDragging)` - which is the exact failure the comment in
//   `startReorderDrag` was written about, reached through a door that comment does not
//   cover.
//
//   the list scrolls the way the finger went. `autoScrollWhileDragging` captured the
//   step in the interval's closure, so the direction was decided by the first sample
//   that landed in a band and never revised. A drag from the top band to the bottom band
//   with no sample in the dead zone between them - a flick, or two pointermoves
//   coalesced into one - left the list running UP while the finger was holding the
//   bottom edge.
//
// Any uncaught page error fails the run, whatever else passes.

import { serve } from './serve.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { suite, check, given, report } from './runner.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const EXEC = process.env.CHROME_PATH || undefined;
const server = process.env.SMOKE_URL
    ? { url: process.env.SMOKE_URL, close: () => {} }
    : await serve(new URL('..', import.meta.url).pathname);

// WHATEVER THE ORIGIN HANDED THE BROWSER, hashed against the commit. SMOKE_URL points
// this suite at a server somebody is already running, and without this a run rooted at
// another tree would pass every check below and the count would mean nothing.
const SERVED_ROOT = new URL('..', import.meta.url).pathname;
const SERVED_SHA = expectedShaFor(SERVED_ROOT);
const SERVED = await verifyServedAssets(server.url, SERVED_ROOT, SERVED_SHA);
check('the origin served this commit, byte for byte',
    SERVED.ok, `${SERVED.checked} assets; ${SERVED.wrong.slice(0, 3).join(' | ')}`);

const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});

const errors = [];      // uncaught page errors - the signal
const noise = [];       // console errors from the unreachable SDK - see forms.browser.mjs

// A crew of forty, so the panel's list is taller than the panel and the autoscroll has
// somewhere to go. Opened on the roster with the reorder panel up and nothing dragged.
async function open() {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(String(error && error.message)));
    page.on('console', message => {
        if (message.type() !== 'error') return;
        const text = message.text();
        if (text.indexOf('ERR_') !== -1 || text.indexOf('Failed to load resource') !== -1) {
            noise.push(text);
            return;
        }
        errors.push(text);
    });
    page.on('dialog', dialog => dialog.accept());
    await page.goto(`${server.url}/index.html`, { waitUntil: 'load' });
    await page.waitForTimeout(400);

    await page.evaluate(async () => {
        State.schedule.workers = [];
        for (let n = 1; n <= 40; n += 1) {
            State.schedule.workers.push({ id: 'w_' + n, name: 'עובד ' + n,
                active: true, dailyRate: 400, hourlyRate: 0 });
        }
        State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
        State.save({ silent: true });
        showView('roster');
        await new Promise(done => setTimeout(done, 150));
        openReorder();
        await new Promise(done => setTimeout(done, 250));
    });
    return page;
}

// ------------------------------------------------------- the exit under a held finger
{
    suite('the mode closes under a held finger and leaves nothing armed');

    const page = await open();

    // The names are read off the identifiers, not off window: a classic script's
    // top-level `let` is a binding rather than a property, so `window.reorderDragging`
    // is undefined however armed the drag is - which is a probe that always answers
    // "nothing is armed" and would pass this file whatever the code did.
    const armed = await page.evaluate(async () => {
        const rows = [...document.querySelectorAll('#reorderList .reorder-row')];
        if (rows.length === 0) return { rows: 0 };
        const box = document.getElementById('reorderScroll');
        // Parked halfway down the list, so an autoscroll running the wrong way or
        // running on after the panel has closed has somewhere to go and can be SEEN to
        // have gone there. At scrollTop 0 a list scrolling up moves nothing, and a
        // check that reads it proves nothing.
        box.scrollTop = Math.round((box.scrollHeight - box.clientHeight) / 2);

        // Every tick of every interval MADE FROM HERE counted, and the wrapper taken off
        // again the moment the drag is armed, so the only timer it can be counting is
        // the autoscroll one. The list is emptied when the panel closes, which clamps
        // scrollTop to zero - so after the exit the scroll position can no longer say
        // whether the interval is still running, and something else has to.
        const real = window.setInterval;
        window.__reorderTicks = 0;
        window.setInterval = function (fn, ms) {
            return real(function () {
                window.__reorderTicks += 1;
                return fn.apply(this, arguments);
            }, ms);
        };

        const handle = rows[0].querySelector('.reorder-handle');
        const grip = handle.getBoundingClientRect();
        handle.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true, button: 0, clientX: grip.left + 5, clientY: grip.top + 5 }));
        await new Promise(done => setTimeout(done, 40));

        // Held against the bottom edge: inside the band, so the 16ms interval starts.
        const frame = box.getBoundingClientRect();
        document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true,
            clientX: frame.left + frame.width / 2, clientY: frame.bottom - 8 }));
        const at = box.scrollTop;
        await new Promise(done => setTimeout(done, 150));
        window.setInterval = real;

        return {
            rows: rows.length,
            dragging: Boolean(reorderDragging),
            scrolling: Boolean(reorderDragging && reorderDragging.scrolling),
            ran: box.scrollTop - at,
            ticks: window.__reorderTicks,
            body: document.body.classList.contains('reorder-dragging')
        };
    });
    given('the panel drew a row for every man in the crew', armed.rows === 40,
        String(armed.rows));
    given('the handle arms a drag and the list is scrolling under it',
        armed.dragging === true && armed.scrolling === true
        && armed.ran > 0 && armed.ticks > 0,
        JSON.stringify(armed));

    // Escape with unsaved work asks the three-answer question, and the answer is
    // pressed the way a person presses it - with the other hand still holding the row.
    // A press, not a real tap: a tap ends with a pointerup, and a pointerup is what
    // endReorderDrag hangs off. The finger is still down.
    const after = await page.evaluate(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await new Promise(done => setTimeout(done, 150));
        const leave = [...document.querySelectorAll('#askChoices button')]
            .find(node => node.textContent === 'יציאה בלי לשמור');
        if (!leave) return { asked: false };
        leave.click();
        await new Promise(done => setTimeout(done, 150));
        const closed = window.__reorderTicks;
        // Long enough for a dozen ticks of a 16ms interval to show themselves.
        await new Promise(done => setTimeout(done, 250));
        return {
            asked: true,
            panel: document.getElementById('reorderPanel').classList.contains('open'),
            draft: reorderDraft === null,
            dragging: reorderDragging === null,
            body: document.body.classList.contains('reorder-dragging'),
            ticksAfterClosing: window.__reorderTicks - closed
        };
    });
    given('Escape asked the exit question, and leaving without saving closed the panel',
        after.asked === true && after.panel === false && after.draft === true,
        JSON.stringify(after));

    check('the drag is not left standing when the mode closes under it',
        after.dragging === true, JSON.stringify(after.dragging));
    check('the autoscroll interval is not still ticking after the panel is gone',
        after.ticksAfterClosing === 0, String(after.ticksAfterClosing));
    check('and the body no longer wears the class that paints the drag bands',
        after.body === false, String(after.body));

    // The harm, and the reason this is not merely untidy: the save button reads
    // reorderDragging, so a drag left standing disables the save on the NEXT open.
    const reopened = await page.evaluate(async () => {
        openReorder();
        await new Promise(done => setTimeout(done, 250));
        const save = [...document.querySelectorAll('#reorderFoot button')]
            .find(node => node.textContent.indexOf('שמירה') !== -1);
        return { found: Boolean(save), disabled: save ? save.disabled : null };
    });
    given('the panel opens again and offers its save button', reopened.found === true,
        JSON.stringify(reopened));
    check('the save button on the next open of the panel is pressable',
        reopened.disabled === false, JSON.stringify(reopened));

    await page.context().close();
}

// ------------------------------------------------------------ which way the list goes
{
    suite('the list scrolls the way the finger went, not the way it first went');

    const page = await open();
    const before = errors.length;

    const walk = await page.evaluate(async () => {
        const box = document.getElementById('reorderScroll');
        const frame = box.getBoundingClientRect();
        const room = box.scrollHeight - box.clientHeight;
        // Parked halfway, so the list has somewhere to go in either direction.
        box.scrollTop = Math.round(room / 2);
        const parked = box.scrollTop;

        const rows = [...document.querySelectorAll('#reorderList .reorder-row')];
        const handle = rows[0].querySelector('.reorder-handle');
        const grip = handle.getBoundingClientRect();
        handle.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true, button: 0, clientX: grip.left + 5, clientY: grip.top + 5 }));
        await new Promise(done => setTimeout(done, 40));

        const move = y => document.dispatchEvent(new PointerEvent('pointermove', {
            bubbles: true, clientX: frame.left + frame.width / 2, clientY: y }));

        move(frame.top + 10);
        await new Promise(done => setTimeout(done, 150));
        const atTop = box.scrollTop;

        // Straight into the far band with nothing in the dead zone between them. A
        // pointermove is delivered once a frame at best and the browser coalesces the
        // rest, so a flick down the length of the panel is exactly this: two samples.
        move(frame.bottom - 10);
        await new Promise(done => setTimeout(done, 300));
        const atBottom = box.scrollTop;

        document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
        await new Promise(done => setTimeout(done, 60));
        return { room, parked, atTop, atBottom, height: Math.round(frame.height) };
    });
    given('the list is longer than the panel and was parked in the middle of it',
        walk.room > 200 && walk.parked > 0, JSON.stringify(walk));
    given('the panel is tall enough to have a dead zone between its two bands',
        walk.height > 180, String(walk.height));
    given('a finger held at the top edge scrolls the list up',
        walk.atTop < walk.parked, JSON.stringify(walk));

    check('a finger that has moved to the bottom edge scrolls the list down',
        walk.atBottom > walk.atTop, JSON.stringify(walk));
    check('nothing threw while the list was dragged from one edge to the other',
        errors.length === before, JSON.stringify(errors.slice(before, before + 3)));

    await page.context().close();
}

await browser.close();
server.close();
report();
