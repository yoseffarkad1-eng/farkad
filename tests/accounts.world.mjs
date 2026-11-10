// The crew the pay book's browser suite closes accounts for, and the phone it does it on.
// (v176) Synthetic men, synthetic money - the owner's own examples, to the shekel:
//
//   AHMAD   weekly     300 a day, 50 an hour   week 1 = 1,800   week 2 = 1,800 + 4h = 2,000
//   KHALED  biweekly   350 a day, 50 an hour   2,100 + 2,300 = 4,400; advances 500 / 400 / 300
//   NASSER  biweekly   500 a day               week 1 only = 3,000
//   SALIM   biweekly   400 a day               9 days = 3,600; one advance of 5,000
//   ZIAD    biweekly   on the roster, never worked - the quiet row
//
// 2026-10-02 is a Friday and opens a fortnight; 2026-10-15 is its last day and the last
// day of the weekly man's second week. Everything is recorded through the app's own
// doors (commitRoster, commit, commitMany) and reaches the suite's cloud through the
// ordinary queue, so the document a closure is aimed at is one the shipped app produced.

import { launchLocalBrowser } from './network-guard.mjs';

export const W1 = ['2026-10-02', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'];
export const W2 = ['2026-10-09', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'];
export const WEEK1 = { from: '2026-10-02', to: '2026-10-08' };
export const WEEK2 = { from: '2026-10-09', to: '2026-10-15' };
export const FORTNIGHT = { from: '2026-10-02', to: '2026-10-15' };
export const TODAY = '2026-10-15';

export const bare = text => String(text || '').replace(/[⁦-⁩‎‏]/g, '');

export async function launch(chromium) {
    return launchLocalBrowser(chromium, { executablePath: process.env.CHROME_PATH });
}

// One phone: a context, joined to the cloud (or to none), with the gate set BEFORE any
// script loads - the one seam the app has (js/model/schema.js, FARKAD_FLAG_OVERRIDES).
export async function openPhone(browser, serverUrl, options = {}) {
    const context = await browser.newContext({
        viewport: { width: options.width || 440, height: options.height || 956 },
        colorScheme: options.scheme || 'dark', hasTouch: true, isMobile: true, serviceWorkers: 'block' });
    const phone = options.cloud ? await options.cloud.join(context) : null;
    const page = await context.newPage();
    const errors = [];
    const away = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
        if (message.type() !== 'error') return;
        const said = message.text();
        // The two known lines of a browser gate with no cloud: the SDK the network guard
        // refuses, and the sync layer's report of it.
        if (/ERR_BLOCKED_BY_CLIENT/.test(said) || /^Sync error: .*firebase-adapter\.js/.test(said)) return;
        if (/ERR_INTERNET_DISCONNECTED/.test(said)) return;
        errors.push(`console: ${said}`);
    });
    context.on('request', request => {
        const host = new URL(request.url()).hostname;
        if (!['127.0.0.1', 'localhost', '[::1]', ''].includes(host)
            && !/^https:\/\/www\.gstatic\.com\/firebasejs\//.test(request.url())) away.push(request.url());
    });
    if (options.flags) {
        await page.addInitScript(held => { window.FARKAD_FLAG_OVERRIDES = held; }, options.flags);
    }
    const today = options.today || TODAY;
    await page.goto(`${serverUrl}/index.html`, { waitUntil: 'load' });
    await page.waitForTimeout(300);
    await page.evaluate(day => { todayStr = () => day; }, today);
    if (phone) {
        await page.waitForFunction(() => FarkadSync.adapter && FarkadSync._heardFromCloud === true, null, { timeout: 15000 });
    }
    return { page, context, phone, errors, away };
}

export async function settled(page) {
    await page.waitForFunction(() => FarkadSync.pendingCount() === 0 && FarkadSync._sending.size === 0
        && FarkadSync._revision !== null, null, { timeout: 20000 });
}

// Records the crew on this phone and waits for the cloud to hold it.
export async function seed(page, options = {}) {
    const answer = await page.evaluate(([w1, w2, wanted]) => {
        const need = (what, ok) => { if (!ok) throw new Error('seed: ' + what); };
        State.schedule.workers = [
            { id: 'w_ahmad', name: 'אחמד', active: true, dailyRate: 300, hourlyRate: 50, payCycles: '2026-09-11=weekly' },
            { id: 'w_khaled', name: 'חאלד', active: true, dailyRate: 350, hourlyRate: 50 },
            { id: 'w_nasser', name: 'נאסר', active: true, dailyRate: 500, hourlyRate: 0 },
            { id: 'w_salim', name: 'סלים', active: true, dailyRate: 400, hourlyRate: 0 },
            { id: 'w_ziad', name: 'זיאד', active: true, dailyRate: 400, hourlyRate: 0 }
        ];
        State.schedule.places = [{ id: 'p_01', name: 'אילון', active: true }, { id: 'p_02', name: 'גבעתיים', active: true }];
        need('roster', State.commitRoster() === true);
        const put = (worker, day, place, hours) => need(`day ${worker} ${day}`,
            State.commit(assignPlace(State.schedule, day, worker, 'actual', place, undefined, hours)) === true);
        w1.forEach(day => ['w_ahmad', 'w_khaled', 'w_nasser', 'w_salim'].forEach(w => put(w, day, 'p_01', 0)));
        w2.forEach((day, at) => {
            put('w_ahmad', day, at < 3 ? 'p_01' : 'p_02', at === 0 ? 4 : 0);
            put('w_khaled', day, 'p_01', at === 0 ? 4 : 0);
            if (at < 3) put('w_salim', day, 'p_02', 0);
        });
        (wanted.advances || []).forEach(([worker, date, amount]) => need(`advance ${worker} ${amount}`,
            State.commitMany(recordNewAdvance(State.schedule, worker, date, amount, 'בדיקה',
                `${date}T09:00:00.000Z`, syncDeviceId(), 'cash')) === true));
        if (wanted.approveCarry !== false) {
            need('carry', State.commitMany([recordCarryApproval(State.schedule,
                planCarryMigration(State.schedule), '2026-10-01T08:00:00.000Z', syncDeviceId())]) === true);
        }
        return true;
    }, [W1, W2, { advances: options.advances || [['w_khaled', '2026-10-03', 500], ['w_khaled', '2026-10-06', 400],
        ['w_khaled', '2026-10-10', 300], ['w_salim', '2026-10-05', 5000]], approveCarry: options.approveCarry }]);
    await settled(page);
    return answer;
}

// One pay book operation through the REAL door, from the suite: how the fixtures that are
// not the subject of a check get onto the server (the opening, an earlier closure).
export async function transact(page, planner, args, today) {
    return page.evaluate(async ([name, list, day]) => {
        const stamp = { at: new Date().toISOString(), by: String(syncDeviceId()), today: day };
        const plan = window[name](State.schedule, ...list, stamp);
        if (!plan.ok) return { ok: false, state: 'plan', reasons: plan.reasons };
        const answer = await FarkadSync.transactPaybook(plan);
        return { ok: answer.ok, state: answer.state, reasons: answer.reasons };
    }, [planner, args, today || TODAY]);
}

export async function showAccounts(page) {
    await page.evaluate(() => { ADVANCE_WORKER = null; showView('advances'); });
    await page.waitForTimeout(80);
}
