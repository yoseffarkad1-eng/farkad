// tests/gate-open.preload.mjs
//
// RUN AN EXISTING BROWSER SUITE AS THE BUILD WITH THE PAY BOOK OPEN WOULD RUN IT, without
// changing the suite and without changing a shipped byte:
//
//     node --import ./tests/gate-open.preload.mjs tests/forms.browser.mjs
//
// It is a measuring instrument and no gate runs it. Every page any suite opens gets the
// test seam (FARKAD_FLAG_OVERRIDES, js/model/schema.js) with `paybook: true` in it before
// the app's scripts load - which is what a build with the flag on would be - and a suite
// that sets the seam for its own reasons keeps what it set, with the pay book open beside
// it. What fails under it is the list of expectations that move in the commit that opens
// the gate; docs/payroll-closure.md («The existing suites with the gate open») is that
// list as measured, each one read and sorted into "the gate's design" or "a defect".
//
// Nothing here is loaded by the app, by a gate or by another suite.

import { chromium } from 'playwright';

const launch = chromium.launch.bind(chromium);
chromium.launch = async options => {
    const browser = await launch(options);
    const open = context => context.addInitScript(() => {
        let held = {};
        Object.defineProperty(window, 'FARKAD_FLAG_OVERRIDES', {
            configurable: true,
            get: () => Object.assign({}, held, { paybook: true }),
            set: value => { held = value && typeof value === 'object' ? value : {}; }
        });
    });
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
