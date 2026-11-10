// A CLOUD FOR A BROWSER SUITE: the harness's fake Firestore, in this process, with the
// page's adapter bridged to it. (v176)
//
// The pay book's screens write through FarkadSync.transactPaybook and through nothing
// else, and that door refuses - rightly - on a phone with no cloud. A browser suite of
// those screens therefore needs a server, and it may not be the real one: every browser
// gate here is confined to loopback (tests/network-guard.mjs).
//
// WHAT IS REAL: the page, every script it loads, the sync layer, the server-first door.
// WHAT IS PLAYED: the one ES module the app imports after boot, js/sync/firebase-adapter.js.
// The request for it is answered with the module below, which hands FarkadSync an adapter
// whose every method is a call into THIS process - into tests/harness.mjs's makeCloud(),
// the same fake the node suites measure the protocol on (revision compare-and-set,
// receipts, the create-once closed document, both writes or neither). So two pages are
// two phones on one server, and a suite can take one of them off the air or hold its
// snapshots back.
//
// What it is not: Firestore. The rules are modelled, not run - that is the emulator
// suites' business (tests/paybook.split.emulator.test.mjs).

import { makeCloud } from './harness.mjs';

const MODULE = `
const call = (method, args) => window.__accCloud(method, args).then(answer => {
    if (answer && answer.error) {
        const error = new Error(answer.error.message);
        Object.assign(error, answer.error.fields);
        throw error;
    }
    return answer ? answer.value : undefined;
});
window.FarkadSync.connect({
    update: patch => call('update', [patch]),
    save: data => call('save', [data]),
    create: data => call('create', [data]),
    bootstrap: payload => call('bootstrap', [payload]),
    read: () => call('read', []),
    transact: (patch, closed) => call('transact', [patch, closed]),
    readClosed: id => call('readClosed', [id]),
    readReceipt: id => call('readReceipt', [id]),
    archiveClosed: (patch, removals, ids) => call('archiveClosed', [patch, removals, ids]),
    copyMonth: (patch, month) => call('copyMonth', [patch, month]),
    archiveMonth: (patch, month, id) => call('archiveMonth', [patch, month, id]),
    readMonth: id => call('readMonth', [id]),
    probeRules: generation => call('probeRules', [generation]),
    archive: () => Promise.resolve(),
    archiveDates: () => Promise.resolve([]),
    archiveRead: () => Promise.resolve(null),
    subscribe(onSnapshot) {
        window.__accSnapshot = onSnapshot;
        call('subscribe', []);
        return () => { window.__accSnapshot = null; };
    }
});
`;

export function makeBrowserCloud(options = {}) {
    const cloud = makeCloud(options);
    const phones = [];

    // Joins one browser context to the cloud as one phone. Call it BEFORE the page loads.
    async function join(context) {
        const phone = { online: true, deliver: true, waiting: [], pages: new Set(), calls: [] };
        phones.push(phone);
        const push = (page, doc) => page.evaluate(held => {
            if (typeof window.__accSnapshot === 'function') window.__accSnapshot(held);
        }, doc).catch(() => undefined);
        phone.flush = async () => {
            const held = phone.waiting.splice(0);
            for (const [page, doc] of held) await push(page, doc);
        };
        await context.exposeBinding('__accCloud', async ({ page }, method, args) => {
            phone.calls.push(method);
            if (method === 'subscribe') {
                if (phone.pages.has(page)) return { value: null };
                phone.pages.add(page);
                cloud.adapter.subscribe(doc => {
                    if (page.isClosed()) return;
                    if (phone.deliver) push(page, doc);
                    else phone.waiting.push([page, doc]);
                });
                return { value: null };
            }
            if (!phone.online) {
                const fields = { code: 'unavailable' };
                if (['update', 'save', 'transact', 'archiveClosed', 'copyMonth', 'archiveMonth'].includes(method)) fields.unsent = true;
                return { error: { message: 'client is offline', fields } };
            }
            try {
                return { value: await cloud.adapter[method](...(args || [])) };
            } catch (error) {
                const fields = {};
                ['code', 'unsent', 'revision', 'document', 'closed', 'paths'].forEach(key => {
                    if (error && error[key] !== undefined) fields[key] = error[key];
                });
                return { error: { message: String((error && error.message) || error), fields } };
            }
        });
        // Registered after the network guard's catch-all, so it is asked first.
        await context.route('**/js/sync/firebase-adapter.js', route => route.fulfill({
            status: 200, contentType: 'text/javascript; charset=utf-8', body: MODULE }));
        return phone;
    }

    return { cloud, join, phones };
}
