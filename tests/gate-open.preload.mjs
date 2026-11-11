// tests/gate-open.preload.mjs
//
// RUN AN EXISTING SUITE AS A PHONE WITH THE PAY BOOK ON WOULD RUN IT, without changing the
// suite and without changing a shipped byte:
//
//     node --import ./tests/gate-open.preload.mjs tests/forms.browser.mjs
//     node --import ./tests/gate-open.preload.mjs tests/finance.test.mjs
//     npm run test:gate-open            # every suite, compared with the hand-kept list
//
// It is a measuring instrument and no gate runs it. `paybook`, `months` and `cold` are
// opened through the test seam (FARKAD_FLAG_OVERRIDES, js/model/schema.js) before the
// app's scripts load - in every page a browser suite opens, and in every device a node
// suite makes through tests/harness.mjs. What fails under it is the list of guarantees
// that are different once the pay book is on; docs/payroll-closure.md («The existing
// suites with the gates open») is that list as measured, each one read and sorted into
// "the gate's design" or "a defect", and tests/gate-open.expected.mjs is the same list
// in the form tests/gate-open.matrix.mjs compares against.
//
// ONE RULE, for pages and devices alike: A SUITE THAT NAMES A GATE KEEPS WHAT IT NAMED.
// A device or a page whose own flags mention `paybook`, `months`, `cold`, `paybookQueue`
// `paybookActivation` or `paybookHonour` is one the suite built on purpose - "the build with the pay book
// shut", "the queue's old door" - and opening a gate under it would measure nothing. Only
// a device given no word about the gates (which is every device of every suite written
// before the pay book) is opened.
//
// (Until Phase 8 this opened `paybook` alone, on browser pages alone.)
//
// Nothing here is loaded by the app, by a gate or by another suite.

const OPEN = Object.freeze({ paybook: true, months: true, cold: true });
const GATES = ['paybook', 'months', 'cold', 'paybookQueue', 'paybookActivation', 'paybookHonour'];

// tests/harness.mjs reads this when it makes a device.
globalThis.FARKAD_GATE_OPEN = OPEN;

let chromium = null;
try { ({ chromium } = await import('playwright')); } catch (error) { chromium = null; }

if (chromium) {
    const launch = chromium.launch.bind(chromium);
    chromium.launch = async options => {
        const browser = await launch(options);
        const open = context => context.addInitScript(([flags, gates]) => {
            let held = {};
            Object.defineProperty(window, 'FARKAD_FLAG_OVERRIDES', {
                configurable: true,
                get: () => (gates.some(gate => Object.prototype.hasOwnProperty.call(held, gate))
                    ? held : Object.assign({}, held, flags)),
                set: value => { held = value && typeof value === 'object' ? value : {}; }
            });
        }, [OPEN, GATES]);
        const newContext = browser.newContext.bind(browser);
        browser.newContext = async contextOptions => {
            const context = await newContext(contextOptions);
            await open(context);
            return context;
        };
        const newPage = browser.newPage.bind(browser);
        browser.newPage = async pageOptions => {
            const page = await newPage(pageOptions);
            await open(page.context());
            return page;
        };
        return browser;
    };
}
