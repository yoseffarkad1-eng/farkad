// A person's pace for a suite that is not about double taps (v194).
//
// The page's own rule (tapBefore, js/ui/sheet.js): a finger that comes down again on the same
// spot less than 300 ms after its last press, on a control that was not there, is that press
// again and does nothing. A driver taps the next thing 30 ms after the last - the answer of a
// question that has just come up over its own button, «המשך» as it is drawn again for the next
// station - and to the page that is exactly a double tap. A suite that walks screens the way a
// person does, and measures something else, calls this once: every Locator.tap() of the process
// then starts at least `gap` ms after the one before it ended. It changes nothing in the page
// and no check; a suite that MEASURES double taps (tests/doubletap.browser.mjs, usual, scroll,
// holiday) drives the touch screen itself and does not use it.
let last = 0;

// The same pause before a touch a suite sends by itself (a drag's first touch, over CDP).
export async function aPersonsPause(gap = 330) {
    const wait = last + gap - Date.now();
    if (wait > 0) await new Promise(done => setTimeout(done, wait));
}

export function tapsAtAPersonsPace(page, gap = 330) {
    const proto = Object.getPrototypeOf(page.locator('html'));
    if (proto.__personsPace) return;
    proto.__personsPace = true;
    const tap = proto.tap;
    proto.tap = async function (...args) {
        await aPersonsPause(gap);
        try {
            return await tap.apply(this, args);
        } finally {
            last = Date.now();
        }
    };
}
