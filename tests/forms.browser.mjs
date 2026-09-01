// The two correction forms, driven by real clicks in a real browser.
//
//   npm run test:forms
//
// Both of these write money and both are reached only through a modal, a row and a
// button, so nothing in the node suites ever executes their save handler. That is how a
// ReferenceError shipped: a repair to the transaction-level form was applied to the
// ADVANCE-level one as well - the two shared an identical run of lines - and
// openReversalForm's Save was left reading `entry.id` in a function whose parameter is
// `item`. Every model check stayed green, because the model was fine. The button threw.
//
// So this suite does what a person does: open the worker's history, press תיקון, type a
// reason, press שמור, and look at what the record holds afterwards. Any uncaught page
// error fails the run, whatever else passes.

import { serve } from './serve.mjs';
import { suite, check, given, report } from './runner.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const EXEC = process.env.CHROME_PATH || undefined;
const server = process.env.SMOKE_URL
    ? { url: process.env.SMOKE_URL, close: () => {} }
    : await serve(new URL('..', import.meta.url).pathname);

const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});

// Every uncaught error and every console error, collected for the whole session. A form
// that throws on Save and leaves the page otherwise intact is exactly the failure this
// file exists to catch, and it is invisible to an assertion about the DOM.
const errors = [];      // uncaught page errors - the signal
const noise = [];       // console errors, filtered: see below

async function open() {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    // An UNCAUGHT PAGE ERROR is the thing this file exists to catch. Console errors are
    // not: this origin cannot reach the Firebase SDK at all, so every run logs several
    // ERR_TUNNEL_CONNECTION_FAILED lines, and treating those as failures would make the
    // suite red for the network rather than for the app. The adapter is meant to fail
    // soft - see js/app.js - and that it does so is asserted elsewhere.
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

    // A man, a fortnight, an advance he was handed, and a repayment recorded against it -
    // which is the record both forms are offered on.
    await page.evaluate(async () => {
        FARKAD_FLAGS.carryAdvances = true;
        State.schedule.workers = [{ id: 'w_01', name: 'עומר', active: true,
            dailyRate: 500, hourlyRate: 0 }];
        State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
        State.date = '2026-08-24';
        State.save();
        ['2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27'].forEach(date =>
            assignPlace(State.schedule, date, 'w_01', 'actual', 'p_01'));
        State.save();
        addAdvance(State.schedule, 'w_01', '2026-08-24', 5000, '');
        State.save();
    });
    // RELOADED, because the history fold is built from ledger ENTRIES and the origin
    // entry for a legacy advance is written by the boot mirror - the one sanctioned
    // write in state.js. Seeding and rendering in the same session leaves the fold with
    // nothing to draw, which is a fixture that measures nothing rather than a defect.
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(500);
    return page;
}

// Whether the app will even offer the buttons. financialWritingEnabled is the gate, and
// with it shut there is no form to drive - a run that quietly measured nothing would be
// worse than a red one.
const canWrite = page => page.evaluate(() =>
    typeof financialWritingEnabled === 'function'
    && financialWritingEnabled(State.schedule));

// ------------------------------------------------------------------ the advance-level form
{
    suite('correcting an advance, through the button');

    const page = await open();
    const gated = await page.evaluate(async () => {
        // The ledger writer and the approval, so the buttons are drawn at all.
        const plan = planCarryMigration(State.schedule);
        if (plan.needed) {
            State.commit(recordCarryApproval(State.schedule, plan,
                new Date().toISOString(), syncDeviceId()));
        }
        return typeof financialWritingEnabled === 'function'
            && financialWritingEnabled(State.schedule);
    });
    given('this build may write money, so the form is offered', gated === true,
        String(gated));

    const opened = await page.evaluate(async () => {
        REPORT_RANGE.from = '2026-08-21'; REPORT_RANGE.to = '2026-09-03';
        showView('reports');
        await new Promise(done => setTimeout(done, 250));
        openWorkerDays('w_01');
        await new Promise(done => setTimeout(done, 350));
        const buttons = [...document.querySelectorAll('button')]
            .filter(node => node.textContent.trim() === 'תיקון');
        if (!buttons.length) return { buttons: 0 };
        buttons[0].click();
        await new Promise(done => setTimeout(done, 250));
        const form = document.querySelector('.advance-form');
        return {
            buttons: buttons.length,
            form: Boolean(form),
            inputs: form ? form.querySelectorAll('input').length : 0
        };
    });
    given('the history offers a correction and it opens a form',
        opened.buttons > 0 && opened.form === true, JSON.stringify(opened));

    const saved = await page.evaluate(async () => {
        const form = document.querySelector('.advance-form');
        const inputs = [...form.querySelectorAll('input')];
        const reason = inputs[inputs.length - 1];
        reason.value = 'נרשמה פעמיים';
        reason.dispatchEvent(new Event('input', { bubbles: true }));
        const save = [...form.querySelectorAll('button')]
            .find(node => node.textContent.indexOf('שמור') !== -1);
        if (!save) return { save: false };
        save.click();
        await new Promise(done => setTimeout(done, 400));
        const reversals = Object.keys((State.schedule.ledger || {}).advances || {})
            .map(id => State.schedule.ledger.advances[id])
            .filter(item => String(item.kind) === 'reversed');
        return {
            save: true,
            reversals: reversals.length,
            reason: (reversals[0] || {}).reason || null,
            error: String((form.querySelector('.field-error') || {}).textContent || '')
        };
    });

    check('the Save button is there and pressing it throws nothing',
        saved.save === true && errors.length === 0, JSON.stringify(errors.slice(0, 3)));
    check('and the correction is on the record, with the reason typed into it',
        saved.reversals === 1 && saved.reason === 'נרשמה פעמיים',
        JSON.stringify(saved));

    await page.context().close();
}

// -------------------------------------------------------------- the transaction-level form
{
    suite('correcting one transaction, through the button');

    const before = errors.length;
    const page = await open();
    const ready = await page.evaluate(async () => {
        const plan = planCarryMigration(State.schedule);
        if (plan.needed) {
            State.commit(recordCarryApproval(State.schedule, plan,
                new Date().toISOString(), syncDeviceId()));
        }
        // A repayment to correct - the case L4 exists for.
        const id = Object.keys(State.schedule.advances)[0];
        State.commit(recordAdvanceRepaid(State.schedule, id, 400, '2026-08-26', '',
            new Date().toISOString(), syncDeviceId(), 'cash'));
        return Object.keys(State.schedule.ledger.advances)
            .map(key => State.schedule.ledger.advances[key])
            .filter(entry => entry.kind === 'repaid').length;
    });
    given('there is a repayment on the record to correct', ready === 1, String(ready));

    const done = await page.evaluate(async () => {
        REPORT_RANGE.from = '2026-08-21'; REPORT_RANGE.to = '2026-09-03';
        showView('reports');
        await new Promise(wait => setTimeout(wait, 250));
        openWorkerDays('w_01');
        await new Promise(wait => setTimeout(wait, 350));
        // The transaction rows live in the ledger history, under their own class.
        // The fold is a <details>; its rows exist in the DOM whether or not it is open.
        const row = [...document.querySelectorAll('.ledger-entry')]
            .find(node => node.textContent.indexOf('הוחזר במזומן') !== -1);
        if (!row) return { row: false,
            entries: [...document.querySelectorAll('.ledger-entry')]
                .map(node => node.textContent.slice(0, 40)) };
        const button = [...row.querySelectorAll('button')]
            .find(node => node.textContent.trim() === 'תיקון');
        if (!button) return { row: true, button: false };
        button.click();
        await new Promise(wait => setTimeout(wait, 250));
        const form = document.querySelector('.advance-form');
        if (!form) return { row: true, button: true, form: false };

        // THE AMOUNT IS NOT A FIELD on this form - a correction takes the whole
        // transaction - so the only thing to fill in is the reason.
        const inputs = [...form.querySelectorAll('input')];
        const reason = inputs[inputs.length - 1];
        reason.value = 'נרשם על האדם הלא נכון';
        reason.dispatchEvent(new Event('input', { bubbles: true }));
        const save = [...form.querySelectorAll('button')]
            .find(node => node.textContent.indexOf('שמור') !== -1);
        save.click();
        await new Promise(wait => setTimeout(wait, 400));
        const made = Object.keys(State.schedule.ledger.advances)
            .map(key => State.schedule.ledger.advances[key])
            .filter(entry => entry.kind === 'reversed');
        return {
            row: true, button: true, form: true,
            amountFields: inputs.length,
            corrections: made.length,
            targetKind: (made[0] || {}).targetKind || null,
            amount: (made[0] || {}).amount,
            reason: (made[0] || {}).reason || null
        };
    });

    check('the transaction row offers a correction and it opens',
        done.row === true && done.button === true && done.form === true,
        JSON.stringify(done));
    check('pressing Save throws nothing',
        errors.length === before, JSON.stringify(errors.slice(before, before + 3)));
    check('the correction names the repayment and takes all of it',
        done.corrections === 1 && done.targetKind === 'repaid' && done.amount === 400,
        JSON.stringify(done));
    check('and carries the reason the person typed',
        done.reason === 'נרשם על האדם הלא נכון', JSON.stringify(done.reason));

    await page.context().close();
}

await browser.close();
server.close();
report();
