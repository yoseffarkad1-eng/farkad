import { launchLocalBrowser } from './network-guard.mjs';
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

const browser = await launchLocalBrowser(chromium, EXEC ? { executablePath: EXEC } : {});

// Every uncaught error and every console error, collected for the whole session. A form
// that throws on Save and leaves the page otherwise intact is exactly the failure this
// file exists to catch, and it is invisible to an assertion about the DOM.
const errors = [];      // uncaught page errors - the signal
const noise = [];       // console errors, filtered: see below

async function open() {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    // BOTH MONEY GATES, opened before the app loads and only for this page, through the
    // one seam js/model/schema.js reads at definition time. The shipped defaults are
    // closed - a phone offers neither form - and this suite drives the build a person
    // would ship with them open. An init script survives the reload below, which an
    // assignment into the frozen FARKAD_FLAGS never did: that line was a silent no-op
    // that only looked like it worked because the branch shipped the flag open.
    await page.addInitScript(() => {
        window.FARKAD_FLAG_OVERRIDES = { carryAdvances: true, ledgerWrites: true, vehicles: true };
    });
    // An UNCAUGHT PAGE ERROR is the thing this file exists to catch. Console errors are
    // not: this origin cannot reach the Firebase SDK at all, so every run logs several
    // ERR_TUNNEL_CONNECTION_FAILED lines, and treating those as failures would make the
    // suite red for the network rather than for the app. The adapter is meant to fail
    // soft - see js/app.js - and that it does so is asserted elsewhere.
    //
    // THE SAME EVENT LEARNED A THIRD SPELLING. A cloud that could not be LOADED used to
    // be a console.info and nothing else, which made it indistinguishable on every screen
    // from a phone with no project configured - a phone recording all evening while the
    // line under the board calls it local-only. It is reported properly now, through
    // FarkadSync.fail, which writes «Sync error:» to the console on its way past.
    //
    // So the unreachable SDK reaches this filter under a name it did not know, and two
    // checks that mean "pressing Save threw nothing" went red for the network. Same event,
    // same reason, same filter - and deliberately narrow: it is matched by the adapter's
    // OWN path, so a module that fails to import for any other reason is still a failure,
    // and so is any other TypeError.
    const ADAPTER_UNREACHABLE = /Failed to fetch dynamically imported module:.*js\/sync\/firebase-adapter\.js/;
    page.on('pageerror', error => errors.push(String(error && error.message)));
    page.on('console', message => {
        if (message.type() !== 'error') return;
        const text = message.text();
        if (text.indexOf('ERR_') !== -1 || text.indexOf('Failed to load resource') !== -1
            || ADAPTER_UNREACHABLE.test(text)) {
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
        // AND NEITHER IS THE DATE. A correction belongs on the day of the transaction it
        // corrects; a date input is a fortnight somebody can type, and left blank it
        // wrote an entry this build's own reader refuses.
        const dates = inputs.filter(node => node.type === 'date').length;
        const shown = form.textContent;
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
            dates,
            shown,
            corrections: made.length,
            date: (made[0] || {}).date,
            targetDate: (made[0] || {}).targetDate,
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
    check('the form offers no date to type',
        done.dates === 0, JSON.stringify(done.dates));
    check('but shows the one the correction will carry',
        typeof done.shown === 'string'
        && done.shown.indexOf('\u05dc\u05e4\u05d9 \u05d9\u05d5\u05dd \u05d4\u05ea\u05e0\u05d5\u05e2\u05d4') !== -1,
        JSON.stringify(String(done.shown || '').slice(0, 200)));
    check('and the correction is dated on the transaction it corrects',
        done.date === '2026-08-26' && done.date === done.targetDate,
        JSON.stringify([done.date, done.targetDate]));

    await page.context().close();
}


{
    suite('vehicle departure form: explicit sites and failed save keeps the draft');
    const page = await open();
    await page.evaluate(() => {
        State.date = '2026-08-26';
        State.schedule.vehicles = [{ id: 'v_test', name: 'רכב בדיקה', ownerId: 'w_01',
            active: true, rates: [{ from: '2026-01-01', amount: 300 }] }];
        State.schedule.places.push({ id: 'p_second', name: 'אתר שני', active: true });
        State.save(); render();
    });
    await page.evaluate(() => { editVehicleDeparture('v_test'); });
    await page.locator('#askChoices label').filter({ hasText: 'אתר שני' }).locator('input').check();
    const firstSite = page.locator('#askChoices input').nth(1);
    await firstSite.check();
    await page.evaluate(() => {
        const commit = State.commit;
        State.commit = function(change) { State.commit = commit; State.schedule = normaliseSchedule(JSON.parse(localStorage.getItem('scheduleData:v2'))); return false; };
    });
    await page.locator('#askOk').click();
    await page.waitForTimeout(100);
    check('a refused commit keeps the modal and both selected sites',
        await page.locator('#askModal').isVisible()
        && await page.locator('#askChoices input:checked').count() === 3);
    check('a refused commit shows no durable departure', await page.evaluate(() =>
        !JSON.parse(localStorage.getItem('scheduleData:v2')).days['2026-08-26'].vehicleRuns));
    await page.locator('#askOk').click();
    await page.waitForTimeout(100);
    const run = await page.evaluate(() => JSON.parse(localStorage.getItem('scheduleData:v2'))
        .days['2026-08-26'].vehicleRuns.v_test);
    check('one successful click stores both sites and only one flat charge',
        run && run.out && run.amount === 300 && run.ownerId === 'w_01' && run.siteIds.length === 2,
        JSON.stringify(run));
    check('successful save closes the form', !await page.locator('#askModal').isVisible());
    await page.evaluate(() => { State.date = '2026-08-27'; editVehicleDeparture('v_test'); });
    await page.locator('#askChoices input').nth(1).check();
    await page.evaluate(() => { State.schedule.vehicles[0].rates[0].amount = 900; });
    await page.locator('#askOk').click();
    await page.waitForTimeout(100);
    check('a roster price change while the form was open requires a fresh review',
        (await page.locator('#askMessage').textContent()).includes('השתנה'));
    check('a stale quote creates no departure', await page.evaluate(() =>
        !((State.schedule.days['2026-08-27'] || {}).vehicleRuns || {}).v_test));
    await page.reload();
    check('the departure survives a real page reload', await page.evaluate(() =>
        State.schedule.days['2026-08-26'].vehicleRuns.v_test.amount === 300));
    await page.evaluate(() => {
        const run = State.schedule.days['2026-08-26'].vehicleRuns.v_test;
        FarkadSync.heldRecords = () => [{ path: 'days.2026-08-26.vehicleRuns.v_test',
            heard: true, mine: run, cloud: null }];
        renderHeldRecords();
    });
    const held = page.locator('#heldRecords');
    check('a vehicle conflict renders both sides and decision buttons in the real panel',
        (await held.textContent()).includes('רכב בדיקה')
        && (await held.textContent()).includes('300')
        && await held.locator('.held-side').count() === 2
        && await held.locator('button').count() === 2);
    await page.context().close();
}


// v116: real mobile controls with SHIPPED defaults, not a feature-flag override.
{
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const faults=[]; page.on('pageerror',error=>faults.push(error.message));
    await page.goto(`${server.url}/index.html`, {waitUntil:'load'});
    await page.evaluate(()=>{
        todayStr=()=> '2026-10-02';
        State.date='2026-10-02';
        State.schedule.workers=[{id:'w_a',name:'עובד קיים',active:true,dailyRate:500}];
        State.schedule.places=[{id:'p_a',name:'אתר',active:true}];
        State.commitRoster();showView('roster');showAddWorkerModal();
    });
    await page.fill('#workerFormName','עובד שבועי');
    await page.fill('#workerFormDaily','500');
    await page.locator('#workerFormModal').getByRole('button',{name:'שמור',exact:true}).click();
    check('new worker must choose how often he is paid',
        (await page.textContent('#workerFormError')).includes('כל שבוע'));
    await page.selectOption('#workerFormCycle','weekly');
    check('new worker starts on current Friday by default',await page.inputValue('#workerFormCycleFrom')==='2026-10-02');
    await page.locator('#workerFormModal').getByRole('button',{name:'שמור',exact:true}).click();
    const row=page.locator('#workerList .roster-row').filter({hasText:'עובד שבועי'});
    const toggle=row.getByRole('switch');
    const rect=await toggle.boundingBox();
    check('worker switch is a finger-sized target',rect.width>=44 && rect.height>=44);
    await toggle.click();
    check('one tap turns worker off, still visible in roster',await toggle.getAttribute('aria-checked')==='false');
    await toggle.click();
    check('one tap turns worker back on',await toggle.getAttribute('aria-checked')==='true');
    await page.evaluate(()=>showView('day'));
    await page.getByRole('button',{name:'רשום חופש לעובדים בלי רישום ביום הנבחר'}).click();
    check('holiday confirmation names the selected date', (await page.textContent('#askTitle')).includes('02/10'));
    await page.locator('#askOk').click();
    check('holiday recorded for both active workers',await page.evaluate(()=>State.activeWorkers().every(w=>isAbsent(State.schedule,'2026-10-02',w.id,'actual'))));
    await page.evaluate(()=>{
        const w=State.schedule.workers.find(w=>w.name==='עובד שבועי');
        State.commit(assignPlace(State.schedule,'2026-10-03',w.id,'actual','p_a'));
        Object.assign(REPORT_RANGE,{from:'2026-10-02',to:'2026-10-08'});
        openWorkerDays(w.id);
    });
    await page.getByRole('button',{name:'+ מקדמה',exact:true}).click();
    const date=page.locator('.advance-form input[type=date]');
    check('weekly advance form ends on Thursday',await date.getAttribute('max')==='2026-10-08');
    await page.locator('.advance-form input').first().fill('300');
    await page.getByRole('button',{name:'שמור מקדמה',exact:true}).click();
    check('repayment is available without a test override',await page.getByRole('button',{name:'רישום החזר מזומן'}).isVisible());
    await page.getByRole('button',{name:'רישום החזר מזומן'}).click();
    check('weekly repayment form ends on Thursday',await page.locator('.advance-form input[type=date]').getAttribute('max')==='2026-10-08');
    check('mobile controls produce no uncaught errors',faults.length===0,JSON.stringify(faults));
    await context.close();
}

await browser.close();
server.close();
report();
