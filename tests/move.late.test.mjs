// Add him to a site, take him off it, add him to another - and then wait.
//
//   node tests/move.late.test.mjs
//
// THE REPORT, 18 October 2026, in the owner's own order: from the by-site screen he adds
// a man to site A, REMOVES him from A, then adds him to B. A few seconds later the man
// is back at A, or shows at both sites at once. He asks what the save and the LATE
// RESPONSES do between the removal and the addition.
//
// WHY THE EXISTING SUITES DO NOT COVER IT. tests/snapshot.stale.test.mjs measures the
// same screen's moves but every one of its scenarios drains the queue first - it waits
// for pendingCount() === 0 and for the cloud to hold the new value - and only then
// delivers a late document. The owner's three taps happen inside a few seconds, which is
// inside the flush window, so the interesting state is the one that suite never enters:
// A WRITE IS STILL OPEN, carrying the value from BEFORE the latest tap, when a document
// is delivered. tests/move.browser.mjs (the click suite) drives the real buttons with no
// cloud at all, so it cannot see this either. Its passing proves nothing about this.
//
// THE MECHANISM UNDER TEST, read in the source first:
//
//   - all three taps write ONE field path, days.<date>.actual.<worker>, because
//     setWorkerDay returns fieldPath(date, layer, workerId) and the value is the whole
//     worker-day record (js/model/money.js, js/model/schema.js).
//   - assignPlace ADDS: `existing = entriesFor(...).filter(e => e.placeId !== placeId)`
//     and the new entries are `existing.concat([makeEntry(...)])`. So what it writes
//     depends on WHAT IS IN MEMORY at the instant of the tap. If memory has been put
//     back to "he is at A" by then, the third tap writes A AND B - which is the "shows
//     at both sites" half of the report, written durably and sent.
//   - receive() adopts a document whose revision is not strictly older than the one
//     already adopted (js/sync/receive.js) - so an EQUAL revision, which is the same
//     document delivered twice, is adopted.
//   - reapplyPending then puts the queue back on top of it, filtered `!item.sent`
//     (js/sync/receive.js:1278). An entry whose send is open is not re-applied.
//
// So the question this file asks is narrow and answerable: when a document is delivered
// while this phone's own write is still open, does the removal survive long enough for
// the next tap to be computed against it? Everything below is measured, not argued.
//
// SYNTHETIC ONLY: two invented men with fixed ids and fixed rates, three invented sites,
// one invented day, and the harness's fake Firestore. No network, no real project, no
// worker data. The two-sites rule is NOT touched: a man at two sites is legal here, and
// what is asked is only that the record says what the taps said.

import { makeDevice, makeCloud, sharedStore, settle, settleUntil, deferred } from './harness.mjs';
import { suite, check, given, report } from './runner.mjs';

const TICK = 6;
const DAY = '2026-09-15';
const W1 = 'w_mv_01';
const W2 = 'w_mv_02';
const A = 'p_mv_a';
const B = 'p_mv_b';
const PATH = `days.${DAY}.actual.${W1}`;

function phone(id, cloud, disk) {
    const device = makeDevice(disk ? { deviceId: id, sharedStorage: disk } : { deviceId: id });
    device.Sync.pushDelayMs = TICK;
    device.setToday(DAY);
    device.ctx.askTell = () => Promise.resolve();
    device.State.date = DAY;
    device.State.schedule.workers = [
        { id: W1, name: 'עובד ניסיון א', active: true, dailyRate: 400, hourlyRate: 0 },
        { id: W2, name: 'עובד ניסיון ב', active: true, dailyRate: 450, hourlyRate: 0 }];
    device.State.schedule.places = [
        { id: A, name: 'אתר ניסיון א', active: true },
        { id: B, name: 'אתר ניסיון ב', active: true },
        { id: 'p_mv_c', name: 'אתר ניסיון ג', active: true }];
    device.State.save({ silent: true });
    if (cloud) device.Sync.connect(cloud.adapter);
    return device;
}

// What the record says, in memory and on the disk - the two the person sees and the one
// a reopen would produce.
const sitesOn = (device, worker) =>
    device.call('entriesFor', device.State.schedule, DAY, worker, 'actual')
        .map(entry => entry.placeId).sort().join('+') || '-';

const sitesOnDisk = (device, worker) => {
    let stored = null;
    try { stored = JSON.parse(device.dump()['scheduleData:v2'] || 'null'); } catch (e) { stored = null; }
    const record = (((((stored || {}).days || {})[DAY]) || {}).actual || {})[worker];
    return (((record || {}).entries) || []).map(entry => entry.placeId).sort().join('+') || '-';
};

const sitesInCloud = (cloud, worker) => {
    const record = ((((cloud.doc || {}).days || {})[DAY] || {}).actual || {})[worker];
    return (((record || {}).entries) || []).map(entry => entry.placeId).sort().join('+') || '-';
};

// The two taps, exactly as js/ui/sheet.js and js/ui/day.js make them: the picker's
// «+ הוסף» and the card row's «✕», each one its own State.commit.
const addTap = (device, worker, place) => device.State.commit(
    device.call('assignPlace', device.State.schedule, DAY, worker, 'actual', place, 'normal'));
const removeTap = (device, worker, place) => device.State.commit(
    device.call('unassignPlace', device.State.schedule, DAY, worker, 'actual', place));

// A SECOND WINDOW of the app on a disk that already holds a record: it reads what is
// there and replays the journal over it, which is exactly what js/app.js:327 does at
// boot. Nothing is seeded - the roster and the days come off the disk.
function secondWindow(id, cloud, disk) {
    const device = makeDevice({ deviceId: id, sharedStorage: disk });
    device.Sync.pushDelayMs = TICK;
    device.setToday(DAY);
    device.ctx.askTell = () => Promise.resolve();
    device.State.load();
    device.State.date = DAY;
    if (cloud) device.Sync.connect(cloud.adapter);
    return device;
}

// A document delivered by the device's own listener, which is how Firestore hands over a
// cached copy, a reconnect's first snapshot, and a second listener's echo.
const deliver = (cloud, snapshot) =>
    cloud.subscribers.forEach(fn => fn(JSON.parse(JSON.stringify(snapshot))));

// Is the queue entry for this path marked as having left the device? This is the flag
// reapplyPending filters on, so it is the difference between "the removal is put back
// over an arriving document" and "it is not".
const queueMark = (device, path) => {
    const outbox = device.Sync._outbox;
    if (!outbox || typeof outbox.get !== 'function') return null;
    const item = outbox.get(path);
    return item ? { sent: item.sent === true, seq: item.seq } : null;
};

// ============================================================================ 1
// The plain case first: no hand-delivered document at all, just the three taps a few
// milliseconds apart and then a wait. If this is red the cause is local and the cloud
// is not involved at all.
{
    suite('three taps a moment apart, then a wait - with nothing delivered');

    const cloud = makeCloud();
    const a = phone('d_mv_plain', cloud);
    await settle(TICK * 10);

    addTap(a, W1, A);
    removeTap(a, W1, A);
    addTap(a, W1, B);
    given('the three taps left him at the second site',
        sitesOn(a, W1) === B, sitesOn(a, W1));

    // Several seconds of the app's own time: the flush window is pushDelayMs, the echo
    // of each write is published inside it, and the undo bar's timer is longer again.
    await settleUntil(() => a.Sync.pendingCount() === 0, 8000);
    await settle(TICK * 120);

    check('after the wait he is still at the second site, and only there',
        sitesOn(a, W1) === B, sitesOn(a, W1));
    check('the disk says the same thing', sitesOnDisk(a, W1) === B, sitesOnDisk(a, W1));
    check('and so does the cloud', sitesInCloud(cloud, W1) === B, sitesInCloud(cloud, W1));
    check('the other man was never recorded', sitesOn(a, W2) === '-', sitesOn(a, W2));
}

// ============================================================================ 2
// THE CASE THE REPORT DESCRIBES. The removal's write is still open - held, the way a
// phone on a building site holds one - when the server's current document is delivered
// again. That document is the one from BEFORE the removal, at the same revision this
// device has already adopted, so receive() adopts it. Then the third tap happens.
{
    suite('a document delivered while the removal is still being sent, then the add');

    const cloud = makeCloud();
    const a = phone('d_mv_open', cloud);
    await settle(TICK * 10);

    addTap(a, W1, A);
    const landed = await settleUntil(() => sitesInCloud(cloud, W1) === A
        && a.Sync.pendingCount() === 0, 8000);
    given('he is at the first site and the cloud has it',
        landed && sitesOn(a, W1) === A && sitesInCloud(cloud, W1) === A,
        `${sitesOn(a, W1)} / ${sitesInCloud(cloud, W1)}`);

    // The document as the server holds it right now: he is at A. This is what a
    // reconnecting listener, a resumed tab or a second listener hands back.
    const current = JSON.parse(JSON.stringify(cloud.doc));

    // The next write is held open rather than refused: it is in flight, which is the
    // state the report's few seconds are spent in.
    const gate = deferred();
    let held = null;
    cloud.hold = (kind, payload) => { cloud.hold = null; held = { kind, payload }; return gate.promise; };

    removeTap(a, W1, A);                       // the ✕ on the first card
    await settleUntil(() => held !== null, 4000);
    given('the removal is on the wire and still open',
        held !== null && sitesOn(a, W1) === '-', `${JSON.stringify(Boolean(held))} / ${sitesOn(a, W1)}`);
    const markWhileOpen = queueMark(a, PATH);
    given('and the queue carries it at this path', markWhileOpen !== null,
        JSON.stringify(markWhileOpen));

    // THE LATE RESPONSE. The same document, delivered again while this phone's own
    // removal has not landed yet.
    deliver(cloud, current);
    await settle(TICK * 8);
    const afterDelivery = sitesOn(a, W1);
    check('a document delivered while the removal is in flight does not put the man back',
        afterDelivery === '-', `${afterDelivery} (queue mark: ${JSON.stringify(markWhileOpen)})`);

    // The third tap, computed against whatever memory now holds - which is the whole
    // point: assignPlace concatenates onto what it finds.
    addTap(a, W1, B);
    const afterAdd = sitesOn(a, W1);
    check('the add then writes the new site ALONE, not the new one beside the old',
        afterAdd === B, afterAdd);

    gate.release();
    await settleUntil(() => a.Sync.pendingCount() === 0, 8000);
    await settle(TICK * 120);

    check('after the held write lands and several seconds pass, he is at the new site',
        sitesOn(a, W1) === B, sitesOn(a, W1));
    check('the disk agrees', sitesOnDisk(a, W1) === B, sitesOnDisk(a, W1));
    check('and the cloud ends up holding exactly that',
        sitesInCloud(cloud, W1) === B, sitesInCloud(cloud, W1));
}

// ============================================================================ 3
// The same shape, but the document is delivered BETWEEN the removal and the add with no
// write open at all - the removal has already landed. This separates "an open send" from
// "any delivery at all" as the thing that matters.
{
    suite('a document delivered between the taps with nothing in flight');

    const cloud = makeCloud();
    const a = phone('d_mv_idle', cloud);
    await settle(TICK * 10);

    addTap(a, W1, A);
    await settleUntil(() => sitesInCloud(cloud, W1) === A && a.Sync.pendingCount() === 0, 8000);
    const beforeRemoval = JSON.parse(JSON.stringify(cloud.doc));

    removeTap(a, W1, A);
    await settleUntil(() => sitesInCloud(cloud, W1) === '-' && a.Sync.pendingCount() === 0, 8000);
    given('the removal landed everywhere',
        sitesOn(a, W1) === '-' && sitesInCloud(cloud, W1) === '-',
        `${sitesOn(a, W1)} / ${sitesInCloud(cloud, W1)}`);
    given('and the pre-removal document really is older',
        Number(beforeRemoval.revision) < Number(cloud.doc.revision),
        `${beforeRemoval.revision} < ${cloud.doc.revision}`);

    deliver(cloud, beforeRemoval);
    await settle(TICK * 8);
    check('a strictly older document does not put the man back on the site',
        sitesOn(a, W1) === '-', sitesOn(a, W1));

    addTap(a, W1, B);
    await settleUntil(() => a.Sync.pendingCount() === 0, 8000);
    await settle(TICK * 120);
    check('and the add lands as the only site he holds', sitesOn(a, W1) === B, sitesOn(a, W1));
    check('on the disk too', sitesOnDisk(a, W1) === B, sitesOnDisk(a, W1));
    check('and in the cloud', sitesInCloud(cloud, W1) === B, sitesInCloud(cloud, W1));
}

// ============================================================================ 4
// The echo of the ADD arriving after it, late - the shape that made the October report:
// one phone, one cloud, a delivery that is behind. Here the delivery carries the man at
// A while the device has moved on to B.
{
    suite('the add lands, then a behind-the-times document arrives carrying the old site');

    const cloud = makeCloud();
    const a = phone('d_mv_echo', cloud);
    await settle(TICK * 10);

    addTap(a, W1, A);
    await settleUntil(() => sitesInCloud(cloud, W1) === A && a.Sync.pendingCount() === 0, 8000);
    const atA = JSON.parse(JSON.stringify(cloud.doc));

    removeTap(a, W1, A);
    addTap(a, W1, B);
    await settleUntil(() => sitesInCloud(cloud, W1) === B && a.Sync.pendingCount() === 0, 8000);
    given('the record is at the new site, everywhere',
        sitesOn(a, W1) === B && sitesInCloud(cloud, W1) === B,
        `${sitesOn(a, W1)} / ${sitesInCloud(cloud, W1)}`);

    deliver(cloud, atA);
    await settle(TICK * 40);
    check('the behind-the-times document does not take the move off the screen',
        sitesOn(a, W1) === B, sitesOn(a, W1));
    check('nor off the disk', sitesOnDisk(a, W1) === B, sitesOnDisk(a, W1));
    check('and nothing was queued to be sent again',
        a.Sync.pendingCount() === 0, String(a.Sync.pendingCount()));
}

// ============================================================================ 5
// The other order, for comparison: add A, add B, remove A - the sequence the click suite
// drove. Under the SAME late delivery, so the two orders are measured side by side and
// neither is taken on trust from the other.
{
    suite('the other order, under the same late delivery');

    const cloud = makeCloud();
    const a = phone('d_mv_order', cloud);
    await settle(TICK * 10);

    addTap(a, W1, A);
    await settleUntil(() => sitesInCloud(cloud, W1) === A && a.Sync.pendingCount() === 0, 8000);
    const current = JSON.parse(JSON.stringify(cloud.doc));

    const gate = deferred();
    let held = null;
    cloud.hold = (kind, payload) => { cloud.hold = null; held = { kind, payload }; return gate.promise; };

    addTap(a, W1, B);                          // ＋ on the second site: both, legally
    await settleUntil(() => held !== null, 4000);
    given('he is at both sites, which is allowed, and the write is open',
        sitesOn(a, W1) === [A, B].sort().join('+') && held !== null, sitesOn(a, W1));

    deliver(cloud, current);
    await settle(TICK * 8);
    check('the delivery does not drop the second site while its write is open',
        sitesOn(a, W1) === [A, B].sort().join('+'), sitesOn(a, W1));

    removeTap(a, W1, A);                       // ✕ on the first card
    check('and the removal then leaves the second site alone', sitesOn(a, W1) === B,
        sitesOn(a, W1));

    gate.release();
    await settleUntil(() => a.Sync.pendingCount() === 0, 8000);
    await settle(TICK * 120);
    check('after the wait, one site: the new one', sitesOn(a, W1) === B, sitesOn(a, W1));
    check('and the cloud holds it', sitesInCloud(cloud, W1) === B, sitesInCloud(cloud, W1));
}

// ============================================================================ 6
// TWO WINDOWS OF ONE APP ON ONE DISK - the save hazard, which is the other half of what
// the report asks to watch. State.save writes the WHOLE schedule with no comparison
// against what is on the disk, and there is no 'storage' listener anywhere in js/, so a
// window never learns that another one wrote. A second window holding the day from
// BEFORE the taps therefore writes its own copy of it back over them on its next
// ordinary edit - and its next ordinary edit is somebody recording another man.
//
// Two variants, because they are not the same situation: a second window that is
// LISTENING has adopted the move and cannot carry a stale copy of it, and one whose
// listener is not there - backgrounded, dropped, or an older build still being served
// from the cache (law 7) - has not.
{
    suite('a second window on the same disk, the taps, and its next ordinary edit');

    // ---- the listening window
    {
        const disk = sharedStore();
        const cloud = makeCloud();
        const one = phone('d_tab_one', cloud, disk);
        await settle(TICK * 10);
        addTap(one, W1, A);
        await settleUntil(() => sitesInCloud(cloud, W1) === A
            && one.Sync.pendingCount() === 0, 8000);
        // The second window opens on the record that is already there.
        const two = secondWindow('d_tab_two', cloud, disk);
        await settle(TICK * 10);
        given('both windows show him at the first site',
            sitesOn(one, W1) === A && sitesOn(two, W1) === A,
            `${sitesOn(one, W1)} / ${sitesOn(two, W1)}`);

        removeTap(one, W1, A);
        addTap(one, W1, B);
        await settleUntil(() => sitesInCloud(cloud, W1) === B
            && one.Sync.pendingCount() === 0, 8000);

        // The second window's own next piece of work: another man, at the first site.
        addTap(two, W2, A);
        await settleUntil(() => one.Sync.pendingCount() === 0
            && two.Sync.pendingCount() === 0, 8000);
        await settle(TICK * 120);

        check('a listening second window does not put the man back',
            sitesOn(one, W1) === B && sitesOn(two, W1) === B,
            `${sitesOn(one, W1)} / ${sitesOn(two, W1)}`);
        check('and the disk the two of them share says the same',
            sitesOnDisk(one, W1) === B, sitesOnDisk(one, W1));
        check('the other man is recorded where the second window put him',
            sitesOn(one, W2) === A, sitesOn(one, W2));
    }

    // ---- the window that is not hearing anything
    {
        const disk = sharedStore();
        const cloud = makeCloud();
        const one = phone('d_deaf_one', cloud, disk);
        await settle(TICK * 10);
        addTap(one, W1, A);
        await settleUntil(() => sitesInCloud(cloud, W1) === A
            && one.Sync.pendingCount() === 0, 8000);

        // A second window opened on this disk and never reached the cloud - no listener,
        // which is a backgrounded tab, a dropped socket, or a cached older build. It
        // loads what the disk held when it opened.
        const two = secondWindow('d_deaf_two', null, disk);
        given('the silent window opened on the same record',
            sitesOn(two, W1) === A, sitesOn(two, W1));

        removeTap(one, W1, A);
        addTap(one, W1, B);
        await settleUntil(() => sitesInCloud(cloud, W1) === B
            && one.Sync.pendingCount() === 0, 8000);
        given('the first window completed the move, everywhere it can reach',
            sitesOn(one, W1) === B && sitesOnDisk(one, W1) === B
            && sitesInCloud(cloud, W1) === B,
            `${sitesOn(one, W1)} / ${sitesOnDisk(one, W1)} / ${sitesInCloud(cloud, W1)}`);

        // The silent window records another man - an ordinary tap, which saves its WHOLE
        // schedule, and its whole schedule still has the first man at the old site.
        addTap(two, W2, A);
        await settle(TICK * 40);

        const diskNow = sitesOnDisk(two, W1);
        check('the silent window\'s ordinary edit does not put the man back on the disk',
            diskNow === B, `disk says ${diskNow}; window one still shows ${sitesOn(one, W1)}`);

        // And what a REOPEN of this device would then produce - the journal replayed over
        // whatever is on the disk, which is what the architecture promises is enough.
        const reopened = secondWindow('d_deaf_reopen', null, disk);
        check('and a reopen of the phone shows the site he was moved to',
            sitesOn(reopened, W1) === B,
            `reopen says ${sitesOn(reopened, W1)}; disk says ${diskNow}`);
        check('the man is never at both sites at once in any of the three',
            [sitesOn(one, W1), diskNow, sitesOn(reopened, W1)]
                .every(value => value.indexOf('+') === -1),
            JSON.stringify([sitesOn(one, W1), diskNow, sitesOn(reopened, W1)]));
    }
}

report();
