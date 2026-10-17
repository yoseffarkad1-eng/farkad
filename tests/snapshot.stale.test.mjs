// A snapshot older than the one already adopted must not take a landed edit off the
// screen.
//
//   node tests/snapshot.stale.test.mjs
//
// THE REPORT, 17 October 2026: moving a worker from one site to another "looks right and
// then changes", names or sites come out mixed, and the person has to do it several
// times before it sticks.
//
// THE MECHANISM THIS SUITE MEASURES. receive() records the revision monotonically -
// noteRevision has refused to lower `_revision` since the cached-first suite proved a
// stale base gets every later write refused - but NOTHING anywhere compares the arriving
// document's revision with the one this device has already ADOPTED. The schedule is
// replaced by whatever snapshot turns up, and reapplyPending puts back only the entries
// the cloud has NOT acknowledged. An edit that landed - acknowledged, retired from the
// queue, correct on every phone - is therefore reverted on this screen by any later
// delivery of an older document, and the line goes on saying «מסונכרן».
//
// Firestore delivers a cached snapshot before the server's and the cached one can be
// behind: the comment above noteRevision says so in this repository's own words. The
// same shape arrives when a listener reconnects, when two listeners race after a
// resume, and when a write's own echo is delivered after a newer one.
//
// It needs no second phone, no second person and no clock skew: one phone, one cloud,
// one late delivery. The person then repeats the move, it lands, and the next stale
// delivery takes it off again - which is the report, exactly.
//
// What this suite does NOT claim: that this is what happened on the owner's phone in
// October. It is a mechanism that produces that symptom, reproduced here on the
// harness; features/held/findings.md is a different incident from September and is read
// as history, not as a diagnosis of this one.

import { makeDevice, makeCloud, settle, settleUntil } from './harness.mjs';
import { suite, check, given, report } from './runner.mjs';

const TICK = 6;
const DAY = '2026-10-15';
const PATH = `days.${DAY}.actual.w_01`;

// Two men whose names a person reads at a glance and whose ids differ by one character:
// the "names got mixed" half of the report is measured against these.
function phone(id, cloud) {
    const device = makeDevice({ deviceId: id });
    device.Sync.pushDelayMs = TICK;
    device.setToday('2026-10-20');
    device.ctx.askTell = () => Promise.resolve();
    device.State.schedule.workers = [
        { id: 'w_01', name: 'אחמד מחמוד', active: true, dailyRate: 450, hourlyRate: 0 },
        { id: 'w_02', name: 'אחמד מכלוף', active: true, dailyRate: 550, hourlyRate: 0 }];
    device.State.schedule.places = [
        { id: 'p_01', name: 'פרסדיה', active: true },
        { id: 'p_02', name: 'אילון', active: true },
        { id: 'p_03', name: 'גדרה', active: true }];
    device.State.save({ silent: true });
    if (cloud) device.Sync.connect(cloud.adapter);
    return device;
}

const sitesOn = (device, workerId) =>
    device.call('entriesFor', device.State.schedule, DAY, workerId, 'actual')
        .map(entry => entry.placeId).sort().join();

const sitesInCloud = (cloud, workerId) => {
    const held = ((((cloud.doc || {}).days || {})[DAY] || {}).actual || {})[workerId];
    return ((held && held.entries) || []).map(item => item.placeId).sort().join();
};

// One move, the way the place picker does it: off the old site, on to the new one.
// Two commits, because that is what two taps are.
function move(device, workerId, fromPlace, toPlace) {
    if (fromPlace) {
        device.State.commit(device.call('unassignPlace',
            device.State.schedule, DAY, workerId, 'actual', fromPlace));
    }
    device.State.commit(device.call('assignPlace',
        device.State.schedule, DAY, workerId, 'actual', toPlace, 'normal'));
}

// A snapshot delivered to the device by hand, the way Firestore delivers a cached or a
// late one: the device's own listener, called with a document it has already passed.
const deliver = (cloud, snapshot) =>
    cloud.subscribers.forEach(fn => fn(JSON.parse(JSON.stringify(snapshot))));

// --------------------------------------------------------- the move that comes back
{
    suite('a stale snapshot does not undo a move the cloud has already accepted');

    const cloud = makeCloud();
    const a = phone('d_stale_a', cloud);
    await settle(TICK * 10);

    move(a, 'w_01', null, 'p_01');
    await settleUntil(() => sitesInCloud(cloud, 'w_01') === 'p_01', 5000);
    given('the man is recorded at his first site, and the cloud has it',
        sitesOn(a, 'w_01') === 'p_01' && sitesInCloud(cloud, 'w_01') === 'p_01',
        `${sitesOn(a, 'w_01')} / ${sitesInCloud(cloud, 'w_01')}`);

    // The document as it stands now. This is what a cached listener, a reconnecting
    // listener or a late echo hands back later.
    const stale = JSON.parse(JSON.stringify(cloud.doc));
    const staleRevision = stale.revision;

    // The person moves him to the other site. It lands.
    move(a, 'w_01', 'p_01', 'p_02');
    await settleUntil(() => sitesInCloud(cloud, 'w_01') === 'p_02'
        && a.Sync.pendingCount() === 0, 8000);
    given('the move landed and the queue is empty',
        sitesOn(a, 'w_01') === 'p_02' && sitesInCloud(cloud, 'w_01') === 'p_02'
        && a.Sync.pendingCount() === 0,
        `${sitesOn(a, 'w_01')} / ${sitesInCloud(cloud, 'w_01')} / ${a.Sync.pendingCount()}`);
    given('and the stale copy really is older',
        Number(staleRevision) < Number(cloud.doc.revision),
        `${staleRevision} < ${cloud.doc.revision}`);

    // The late delivery.
    deliver(cloud, stale);
    await settle(TICK * 20);

    check('the screen still shows the site the man was moved to',
        sitesOn(a, 'w_01') === 'p_02', sitesOn(a, 'w_01'));
    check('the cloud is untouched by the stale delivery',
        sitesInCloud(cloud, 'w_01') === 'p_02', sitesInCloud(cloud, 'w_01'));
    check('and nothing was queued to be sent again',
        a.Sync.pendingCount() === 0, String(a.Sync.pendingCount()));
}

// ------------------------------------------------------------- the other man's day
{
    suite('a stale snapshot does not move a second man either');

    const cloud = makeCloud();
    const a = phone('d_stale_b', cloud);
    await settle(TICK * 10);

    move(a, 'w_01', null, 'p_01');
    move(a, 'w_02', null, 'p_01');
    await settleUntil(() => sitesInCloud(cloud, 'w_01') === 'p_01'
        && sitesInCloud(cloud, 'w_02') === 'p_01', 8000);
    const stale = JSON.parse(JSON.stringify(cloud.doc));

    // Both men move, to two different sites, one after the other.
    move(a, 'w_01', 'p_01', 'p_02');
    move(a, 'w_02', 'p_01', 'p_03');
    await settleUntil(() => sitesInCloud(cloud, 'w_01') === 'p_02'
        && sitesInCloud(cloud, 'w_02') === 'p_03' && a.Sync.pendingCount() === 0, 8000);
    given('both moves landed', sitesOn(a, 'w_01') === 'p_02' && sitesOn(a, 'w_02') === 'p_03',
        `${sitesOn(a, 'w_01')} / ${sitesOn(a, 'w_02')}`);

    deliver(cloud, stale);
    await settle(TICK * 20);

    check('the first man keeps his new site', sitesOn(a, 'w_01') === 'p_02',
        sitesOn(a, 'w_01'));
    check('and so does the second', sitesOn(a, 'w_02') === 'p_03', sitesOn(a, 'w_02'));
}

// ----------------------------------------------------- what must still be adopted
{
    suite('a newer snapshot is still adopted, and a document with no revision too');

    const cloud = makeCloud();
    const a = phone('d_fresh', cloud);
    await settle(TICK * 10);

    move(a, 'w_01', null, 'p_01');
    await settleUntil(() => sitesInCloud(cloud, 'w_01') === 'p_01', 5000);

    // Somebody else's newer document: the same shape the other phone's write produces,
    // one revision up, with the man at a third site.
    const newer = JSON.parse(JSON.stringify(cloud.doc));
    newer.revision = Number(newer.revision) + 1;
    newer.updatedBy = 'd_other_phone';
    newer.updatedAt = new Date(Date.parse(newer.updatedAt || '2026-10-15T10:00:00.000Z')
        + 60000).toISOString();
    newer.days[DAY].actual.w_01 = { entries: [{ placeId: 'p_03' }],
        rates: { daily: 450, hourly: 0 } };
    deliver(cloud, newer);
    await settle(TICK * 20);
    check('a newer document from another phone is adopted',
        sitesOn(a, 'w_01') === 'p_03', sitesOn(a, 'w_01'));

    // A legacy document carries no revision at all. Refusing those would cut off every
    // phone that has not reached the protocol, which is the opposite of the point.
    const legacy = JSON.parse(JSON.stringify(cloud.doc));
    delete legacy.revision;
    delete legacy.protocol;
    legacy.updatedBy = 'd_old_phone';
    legacy.updatedAt = new Date(Date.parse(newer.updatedAt) + 60000).toISOString();
    legacy.days[DAY].actual.w_01 = { entries: [{ placeId: 'p_01' }],
        rates: { daily: 450, hourly: 0 } };
    deliver(cloud, legacy);
    await settle(TICK * 20);
    check('and a document with no revision is adopted as before',
        sitesOn(a, 'w_01') === 'p_01', sitesOn(a, 'w_01'));
}

// ------------------------------------------------- the same delivery, with work queued
{
    suite('a stale snapshot does not disturb an edit still waiting to be sent');

    const cloud = makeCloud();
    const a = phone('d_stale_q', cloud);
    await settle(TICK * 10);

    move(a, 'w_01', null, 'p_01');
    await settleUntil(() => sitesInCloud(cloud, 'w_01') === 'p_01', 5000);
    const stale = JSON.parse(JSON.stringify(cloud.doc));

    // The signal goes. The person moves the man anyway - which is the ordinary evening.
    cloud.online = false;
    move(a, 'w_01', 'p_01', 'p_02');
    await settle(TICK * 20);
    given('the move is on the screen and owed to the cloud',
        sitesOn(a, 'w_01') === 'p_02' && a.Sync.pendingCount() > 0,
        `${sitesOn(a, 'w_01')} / ${a.Sync.pendingCount()} pending`);

    deliver(cloud, stale);
    await settle(TICK * 20);

    check('the unsent move is still on the screen', sitesOn(a, 'w_01') === 'p_02',
        sitesOn(a, 'w_01'));
    check('and still owed', a.Sync.pendingCount() > 0, String(a.Sync.pendingCount()));
}

// ---------------------------------- two phones, a man at two sites, switched fast
{
    suite('two phones, a man at two sites, switched fast, and a reopen');

    const cloud = makeCloud();
    const a = phone('d_two_a', cloud);
    const b = phone('d_two_b', cloud);
    await settle(TICK * 10);

    // Two sites in one day is the cap this app allows and the normal case here, so it is
    // also the shape "the sites come out mixed" is most likely to be about: half of a
    // stale copy and half of the real document reads exactly like that.
    a.State.commit(a.call('assignPlace', a.State.schedule, DAY, 'w_01', 'actual', 'p_01', 'normal'));
    a.State.commit(a.call('assignPlace', a.State.schedule, DAY, 'w_01', 'actual', 'p_02', 'normal'));
    a.State.commit(a.call('assignPlace', a.State.schedule, DAY, 'w_02', 'actual', 'p_01', 'normal'));
    await settleUntil(() => sitesInCloud(cloud, 'w_01') === 'p_01,p_02'
        && sitesOn(b, 'w_01') === 'p_01,p_02' && sitesOn(b, 'w_02') === 'p_01', 8000);
    given('one phone records two sites and the other phone sees them',
        sitesOn(a, 'w_01') === 'p_01,p_02' && sitesOn(b, 'w_01') === 'p_01,p_02',
        `${sitesOn(a, 'w_01')} / ${sitesOn(b, 'w_01')}`);

    const stale = JSON.parse(JSON.stringify(cloud.doc));

    // The SECOND phone corrects one of the two sites: off p_01, on to p_03.
    move(b, 'w_01', 'p_01', 'p_03');
    await settleUntil(() => sitesInCloud(cloud, 'w_01') === 'p_02,p_03'
        && sitesOn(a, 'w_01') === 'p_02,p_03', 8000);
    given('the correction reached the first phone', sitesOn(a, 'w_01') === 'p_02,p_03',
        sitesOn(a, 'w_01'));

    // A late delivery of the document as it stood before the correction, to BOTH phones.
    deliver(cloud, stale);
    await settle(TICK * 20);
    check('the phone that made the correction keeps it',
        sitesOn(b, 'w_01') === 'p_02,p_03', sitesOn(b, 'w_01'));
    check('and the phone that only heard about it keeps it too',
        sitesOn(a, 'w_01') === 'p_02,p_03', sitesOn(a, 'w_01'));
    check('the other man is not mixed into it either',
        sitesOn(a, 'w_02') === 'p_01' && sitesOn(b, 'w_02') === 'p_01',
        `${sitesOn(a, 'w_02')} / ${sitesOn(b, 'w_02')}`);

    // Fast switching: four taps with no pause between them, the way a thumb does it when
    // the first one "did not take".
    b.State.commit(b.call('unassignPlace', b.State.schedule, DAY, 'w_02', 'actual', 'p_01'));
    b.State.commit(b.call('assignPlace', b.State.schedule, DAY, 'w_02', 'actual', 'p_02', 'normal'));
    b.State.commit(b.call('unassignPlace', b.State.schedule, DAY, 'w_02', 'actual', 'p_02'));
    b.State.commit(b.call('assignPlace', b.State.schedule, DAY, 'w_02', 'actual', 'p_03', 'normal'));
    await settleUntil(() => sitesInCloud(cloud, 'w_02') === 'p_03'
        && b.Sync.pendingCount() === 0 && sitesOn(a, 'w_02') === 'p_03', 8000);
    check('fast switching ends where the last tap left it, on both phones',
        sitesOn(b, 'w_02') === 'p_03' && sitesOn(a, 'w_02') === 'p_03'
        && sitesInCloud(cloud, 'w_02') === 'p_03',
        `${sitesOn(b, 'w_02')} / ${sitesOn(a, 'w_02')} / ${sitesInCloud(cloud, 'w_02')}`);

    deliver(cloud, stale);
    await settle(TICK * 20);
    check('and a stale delivery does not take it back',
        sitesOn(b, 'w_02') === 'p_03' && sitesOn(a, 'w_02') === 'p_03',
        `${sitesOn(b, 'w_02')} / ${sitesOn(a, 'w_02')}`);

    // The app closed and opened again, off its own disk: what is on that disk is what the
    // person sees in the morning, and a stale delivery must not have written itself there.
    const again = makeDevice({ deviceId: 'd_two_b', storage: b.dump() });
    again.Sync.pushDelayMs = TICK;
    again.setToday('2026-10-20');
    again.ctx.askTell = () => Promise.resolve();
    again.State.load();
    check('a reopen shows what the last tap left',
        sitesOn(again, 'w_02') === 'p_03' && sitesOn(again, 'w_01') === 'p_02,p_03',
        `${sitesOn(again, 'w_02')} / ${sitesOn(again, 'w_01')}`);
}

report();
