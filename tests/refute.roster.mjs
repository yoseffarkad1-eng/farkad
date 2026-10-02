// ATTACKS ON THE ROSTER PROVENANCE FALLBACK AND THE QUEUED-ARRAY RECONCILIATION.
//
//   node tests/refute.roster.mjs
//
// This file refutes rather than describes. Every check below is an attempt to make the
// v104 roster work say something that is not true; a PASS here means the attack was
// tried and the guard held, and is written down so nobody re-attempts it.
//
// Two of them are not attempts. R1.1 and R2.2 REPRODUCE, and each is left failing on
// purpose - a refutation that is repaired in the same file is a refutation nobody can
// read afterwards.

import { makeDevice, makeCloud, settle, settleUntil, deferred } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const TICK = 6;
const settled = () => settle(TICK * 40);

// The disk this whole area is about: the roster in the ARRAYS, with no keyed map -
// every disk this build opens that was written before the map existed. Built through
// State.save so it is the record a boot actually leaves behind.
function diskWith(build) {
    const device = makeDevice({ deviceId: 'd_seed' });
    device.State.load();
    device.State.schedule.workers = [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: 500, hourlyRate: 0 }
    ];
    device.State.schedule.places = [{ id: 'p_01', name: 'site', active: true }];
    if (typeof build === 'function') build(device.State.schedule);
    device.State.save({ silent: true });
    return device.dump();
}

function openOn(disk, deviceId) {
    const device = makeDevice({ deviceId, storage: JSON.parse(JSON.stringify(disk)) });
    device.State.load();
    return device;
}

async function online(device, cloud) {
    device.Sync.pushDelayMs = TICK;
    device.Sync.connect(cloud.adapter);
    await settle(TICK * 10);
}

const marker = device => {
    const stored = device.Sync.storedSchedule();
    return path => device.Sync.storedMarkAt(path, stored);
};

// What a phone that has NOT updated reads: the legacy whole array in the document.
const arrayRate = doc => {
    const found = ((doc && doc.workers) || []).find(item => item && item.id === 'w_01');
    return found ? found.dailyRate : null;
};
// What every reader past v79 reads: the keyed map.
const mapRate = doc => {
    const held = doc && doc.roster && doc.roster.workers && doc.roster.workers.w_01;
    return held ? held.dailyRate : null;
};
const arrayName = (doc, id) => {
    const found = ((doc && doc.places) || []).find(item => item && item.id === id);
    return found ? found.name : null;
};

// ================================================================ R1  the mark itself
//
// storedMarkAt decides what an operation records as having been SEEN, and that record is
// the only thing standing between a stale value and another phone's edit. tests/
// roster-upgrade.test.mjs U4 pins what the fallback must refuse to vouch for. These are
// the shapes U4 does not name.
{
    suite('R1: what the provenance fallback can be made to vouch for');

    const mark = marker(openOn(diskWith(), 'd_probe'));
    given('the control still holds - a stranger is not synthesized',
        mark('roster.workers.w_99.name') === 'absent',
        String(mark('roster.workers.w_99.name')));

    // R1.1  AN ENTITY BUILT OUT OF Object.prototype.
    //
    // durableRosterIndex indexes the roster into a plain `{}` and then asks
    // `index[kind][id]` with no own-key check. Six ids answer out of the prototype
    // chain: the lookup returns a Function, `!entity` is false, and the guard that says
    // "the entity is REALLY in the durable roster" is satisfied by a method. The field
    // read off it is the function's own `name`, so the device writes down that it has
    // seen the string "toString" at roster.workers.toString.name - on a disk that has
    // never held a worker at all under that id.
    //
    // isSafeSegment stops __proto__, prototype and constructor. It does not stop these,
    // and it should not have to: the fix is an own-key check in durableRosterIndex, the
    // same one js/sync/send.js already makes in durableRosterBaseline
    // (Object.prototype.hasOwnProperty.call(before, id)) and tests/merge.test.mjs
    // already requires of the merge.
    const inherited = ['toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf',
        'toLocaleString', 'propertyIsEnumerable'];
    const vouched = inherited.filter(id => mark(`roster.workers.${id}.name`) !== 'absent');
    check('R1.1 no id resolves out of Object.prototype into a vouched-for value',
        vouched.length === 0,
        vouched.map(id => `${id} -> ${mark(`roster.workers.${id}.name`)}`).join(', '));

    // AND IT REACHES THE RECORD, through the one door that writes provenance down.
    //
    // journalEntryProblems accepts `roster.workers.toString.name` - it is a safe segment
    // and `name` is a real entity field - so queueOperations writes the operation, and
    // with it the seen list the send path will later judge another phone's value
    // against. A stranger under an ordinary id records `absent` and is held; a stranger
    // under an inherited name records the method's own name and is not.
    const writer = openOn(diskWith(), 'd_writer');
    writer.Sync.connect(makeCloud({ doc: null }).adapter);
    await settle(TICK * 10);
    given('the wire validator accepts the path',
        writer.call('journalEntryProblems', 'roster.workers.toString.name', 'Z').length === 0,
        JSON.stringify(writer.call('journalEntryProblems', 'roster.workers.toString.name', 'Z')));
    given('and the operation is written down',
        writer.Sync.queueOperations([
            { path: 'roster.workers.toString.name', value: 'Z' },
            { path: 'roster.workers.w_99.name', value: 'Z' }
        ]) === true);
    const seenAt = path => {
        const found = writer.Sync.physicalOperations().find(op => op.path === path);
        return found ? found.seen : null;
    };
    check('R1.1b and the operation records nothing this device never held',
        JSON.stringify(seenAt('roster.workers.toString.name'))
            === JSON.stringify(seenAt('roster.workers.w_99.name')),
        `toString ${JSON.stringify(seenAt('roster.workers.toString.name'))} `
        + `vs w_99 ${JSON.stringify(seenAt('roster.workers.w_99.name'))}`);

    // The names isSafeSegment does catch, kept beside them so the difference is visible.
    same('R1.2 the three poison ids are still refused',
        ['__proto__', 'prototype', 'constructor'].map(id => mark(`roster.workers.${id}.name`)),
        ['absent', 'absent', 'absent']);

    // A field name off the prototype: ENTITY_FIELDS is asked with indexOf on an array,
    // so nothing inherited can pass as a field.
    same('R1.3 a field that only exists on the prototype is refused',
        ['toString', 'constructor', 'hasOwnProperty', '__proto__']
            .map(field => mark(`roster.workers.w_01.${field}`)),
        ['absent', 'absent', 'absent', 'absent']);
}

{
    suite('R1b: values normaliseSchedule invents');

    // A worker the disk holds with no rate, no phone and no `active`. normaliseSchedule
    // fills those in - 0, "" and true - and the fallback answers off the normalised
    // record, so the device vouches for three values nobody wrote.
    //
    // This is NOT a defect, and the check says why: the mark has to answer for what the
    // PERSON WAS LOOKING AT, and the screen is drawn off the same normalisation. A mark
    // that disagreed with the screen would hold an edit the person made deliberately.
    // The claim worth pinning is that the two agree.
    const device = openOn(diskWith(schedule => {
        schedule.workers = [{ id: 'w_02', name: 'חדש' }];
    }), 'd_default');
    const mark = marker(device);
    const onScreen = device.State.schedule.workers.find(item => item.id === 'w_02');

    check('R1.4 an invented default is vouched for only where the screen shows it too',
        mark('roster.workers.w_02.dailyRate') === JSON.stringify(onScreen.dailyRate)
        && mark('roster.workers.w_02.phone') === JSON.stringify(onScreen.phone)
        && mark('roster.workers.w_02.active') === JSON.stringify(onScreen.active),
        `mark=${mark('roster.workers.w_02.dailyRate')}/${mark('roster.workers.w_02.phone')}`
        + `/${mark('roster.workers.w_02.active')} screen=${JSON.stringify(onScreen)}`);
}

{
    suite('R1c: shapes the array can arrive in');

    // A tombstone in the keyed map, in every falsy shape the wire can carry it in.
    // mergeRoster deletes on any of them, so the array underneath is never inherited.
    const tombstones = [null, false, 0, ''].map(value => {
        const device = openOn(diskWith(schedule => {
            schedule.roster = { workers: { w_01: value }, places: {} };
        }), 'd_tomb');
        return marker(device)('roster.workers.w_01.name');
    });
    same('R1.5 a tombstone is never inherited from the array, in any falsy shape',
        tombstones, ['absent', 'absent', 'absent', 'absent']);

    // Two entries under one id. byId is last-wins and so is mergeRoster, so the two
    // could have disagreed - but the record never gets that far: rosterProblems refuses
    // it at load, the schedule is quarantined, and there is no roster to vouch from.
    const twins = openOn(diskWith(schedule => {
        schedule.workers = [
            { id: 'w_01', name: 'A', dailyRate: 500, hourlyRate: 0, active: true },
            { id: 'w_01', name: 'B', dailyRate: 900, hourlyRate: 0, active: true }
        ];
    }), 'd_twins');
    check('R1.6 a duplicated id never reaches the roster at all',
        twins.State.schedule.workers.length === 0,
        `${twins.State.schedule.workers.length} workers on screen`);

    // A RECORD THE APP ITSELF REFUSED TO LOAD.
    //
    // durableRosterIndex asks only whether normaliseSchedule throws. A numeric id and a
    // duplicated id both normalise perfectly and are both refused by rosterProblems, so
    // the index answers off a roster that is not on the screen: the mark for the numeric
    // id is "five" while the roster the person sees is empty.
    //
    // It cannot be reached. Refusing the record quarantines it, farkadWritesBlocked() is
    // then true, and queueOperations returns false before any mark is written down - so
    // no operation can carry it. That is the guarantee worth pinning, because it is the
    // one that holds.
    const numbered = openOn(diskWith(schedule => {
        schedule.workers = [{ id: 5, name: 'five', dailyRate: 7, hourlyRate: 0, active: true }];
    }), 'd_number');
    given('the record was refused: nobody is on the screen',
        numbered.State.schedule.workers.length === 0,
        `${numbered.State.schedule.workers.length} workers`);
    check('R1.7 a mark off a refused record cannot reach an operation',
        numbered.call('farkadWritesBlocked') === true
        && numbered.Sync.queueOperations([
            { path: 'roster.workers.5.name', value: 'Z' }]) === false,
        `blocked=${numbered.call('farkadWritesBlocked')} `
        + `mark=${marker(numbered)('roster.workers.5.name')}`);

    const bare = openOn(diskWith(schedule => {
        schedule.workers = ['w_01'];
    }), 'd_bare');
    check('R1.8 an array entry that is not a record vouches for nothing',
        marker(bare)('roster.workers.w_01.name') === 'absent',
        String(marker(bare)('roster.workers.w_01.name')));
}

// ================================================================ R2  the reconciliation
//
// sanitiseQueuedRosters(gone, remote). The `remote` half arrived at v104 and is the one
// that costs money: the queued whole array carries every man this device has not
// reconciled, and the document's own array is the one place a phone that has not updated
// looks.

// B raises the man to 600 from the same old disk, so the cloud holds 600 in BOTH forms.
async function cloudRaisedTo600(disk) {
    const cloud = makeCloud({ doc: null });
    const b = openOn(disk, 'd_b');
    await online(b, cloud);
    await settled();
    b.State.worker('w_01').dailyRate = 600;
    b.State.commitRoster();
    await settled();
    return { cloud, b };
}

{
    suite('R2: the queued array against a wage it has not heard');

    const disk = diskWith();
    const { cloud, b } = await cloudRaisedTo600(disk);
    given('B\'s raise is in both forms in the cloud',
        arrayRate(cloud.doc) === 600 && mapRate(cloud.doc) === 600,
        `array=${arrayRate(cloud.doc)} map=${mapRate(cloud.doc)}`);

    // A opens on the OLD disk, renames a site, and its queued `workers` array still
    // carries the man at 500. This is the ordinary path, and it is the control.
    const a = openOn(disk, 'd_a');
    a.State.place('p_01').name = 'renamed site';
    given('A\'s rename is queued with the whole array beside it',
        a.State.commitRoster() === true
        && a.Sync.pendingPaths().indexOf('workers') !== -1,
        JSON.stringify(a.Sync.pendingPaths()));

    await online(a, cloud);
    await settleUntil(() => a.Sync.pendingCount() === 0, 6000, 10);
    await settled();

    check('R2.1 the queue is refreshed, and the legacy array keeps the raise',
        arrayRate(cloud.doc) === 600 && mapRate(cloud.doc) === 600,
        `array=${arrayRate(cloud.doc)} map=${mapRate(cloud.doc)}`);
    check('and the person\'s own rename still reached the document',
        arrayName(cloud.doc, 'p_01') === 'renamed site',
        String(arrayName(cloud.doc, 'p_01')));
    check('and nothing was minted twice: one operation per path in the queue',
        (() => {
            const seen = a.Sync.physicalOperations().map(op => op.path);
            return seen.length === new Set(seen).size || seen.length === 0;
        })(), JSON.stringify(a.Sync.physicalOperations().map(op => op.path)));
    check('both phones say they are finished',
        a.Sync.status === 'synced' && b.Sync.status === 'synced',
        `${a.Sync.status} / ${b.Sync.status}`);
}

{
    suite('R2.2: one refused journal write, and the stale wage goes out anyway');

    // THE REPRODUCTION.
    //
    // sanitiseQueuedRosters mints the correction through queueOperations, and a disk
    // with no room refuses it. receive() then calls holdStaleRoster(gone) - with the
    // TOMBSTONES only. `remote` is not remembered anywhere.
    //
    // flush() asks staleRosterHeld() a few milliseconds later. That calls
    // sanitiseQueuedRosters(this._staleRoster) with no remote at all, and the first line
    // of the function is `if (!buried && !remote) return true;` - there are no
    // tombstones in this scenario, so the whole job is declared done, the hold is
    // released, noteCloudHeard() is recorded, and the queue flushes with the wage that
    // was never refreshed.
    //
    // The keyed map keeps B's 600 and the document's own array is left saying 500. That
    // array is the one thing a phone still on v78 reads, and it is the only reason the
    // array is still written at all.
    const disk = diskWith();
    const { cloud, b } = await cloudRaisedTo600(disk);

    const a = openOn(disk, 'd_a');
    a.State.place('p_01').name = 'renamed site';
    given('A queued the rename and the stale array with it',
        a.State.commitRoster() === true
        && a.Sync.pendingPaths().indexOf('workers') !== -1,
        JSON.stringify(a.Sync.pendingPaths()));

    // No room for one more operation record, which is all the correction is.
    a.setQuota(key => String(key).indexOf('farkad:outbox:op:') === 0);
    await online(a, cloud);
    await settled();
    // And the disk has room again - the point is that nothing ever asks a second time.
    a.setQuota(null);
    await settleUntil(() => a.Sync.pendingCount() === 0, 6000, 10);
    await settled();

    check('R2.2 the wage the person never touched is not written backwards in the legacy array',
        arrayRate(cloud.doc) === 600,
        `array=${arrayRate(cloud.doc)} map=${mapRate(cloud.doc)} `
        + `statusA=${a.Sync.status} statusB=${b.Sync.status} pendingA=${a.Sync.pendingCount()}`);
    check('and if it is, the phone does not call that synced',
        arrayRate(cloud.doc) === 600 || a.Sync.status !== 'synced',
        `array=${arrayRate(cloud.doc)} statusA=${a.Sync.status}`);
    // The hold is the mechanism that was supposed to stop it, so its state is reported
    // beside the outcome rather than left to be inferred.
    check('and the hold that was taken is not released without the job being done',
        arrayRate(cloud.doc) === 600 || Boolean(a.Sync._staleRoster),
        `staleRoster=${a.Sync._staleRoster ? 'held' : 'released'}`);
}

{
    suite('R2.3: the refresh against the person\'s own edit, and against a tombstone');

    const disk = diskWith(schedule => {
        schedule.workers.push({ id: 'w_02', name: 'שני', active: true, dailyRate: 400, hourlyRate: 0 });
    });
    const { cloud } = await cloudRaisedTo600(disk);

    // A raises w_02 to 450 offline. That is A's OWN opinion of him, and the refresh must
    // not put the cloud's 400 back over it - which is the whole of attack (a).
    const a = openOn(disk, 'd_a');
    a.State.worker('w_02').dailyRate = 450;
    given('A\'s own raise is queued', a.State.commitRoster() === true,
        JSON.stringify(a.Sync.pendingPaths()));

    await online(a, cloud);
    await settleUntil(() => a.Sync.pendingCount() === 0, 6000, 10);
    await settled();

    const second = doc => {
        const found = ((doc && doc.workers) || []).find(item => item && item.id === 'w_02');
        return found ? found.dailyRate : null;
    };
    check('R2.3 the reconciliation never discards the person\'s own edit',
        second(cloud.doc) === 450,
        `array w_02=${second(cloud.doc)} array w_01=${arrayRate(cloud.doc)}`);
    check('and it still refreshes the man the person did not touch',
        arrayRate(cloud.doc) === 600, `array w_01=${arrayRate(cloud.doc)}`);
}

{
    suite('R2.4: a man the document has buried is not stood back up by the refresh');

    const disk = diskWith(schedule => {
        schedule.workers.push({ id: 'w_02', name: 'שני', active: true, dailyRate: 400, hourlyRate: 0 });
    });
    const cloud = makeCloud({ doc: null });
    const b = openOn(disk, 'd_b');
    await online(b, cloud);
    await settled();
    // B removes him for good. The tombstone is the keyed null.
    b.ctx.askConfirm = () => Promise.resolve(true);
    b.State.schedule.workers = b.State.schedule.workers.filter(item => item.id !== 'w_02');
    b.State.commitRoster({ removed: { workers: ['w_02'], places: [] } });
    await settled();
    given('the cloud carries the tombstone',
        cloud.doc && cloud.doc.roster && cloud.doc.roster.workers
        && cloud.doc.roster.workers.w_02 === null,
        JSON.stringify(cloud.doc && cloud.doc.roster && cloud.doc.roster.workers));

    // A has never heard of the removal and edits somebody else.
    const a = openOn(disk, 'd_a');
    a.State.place('p_01').name = 'renamed site';
    given('A queued its whole array, with the removed man still in it',
        a.State.commitRoster() === true
        && a.Sync.pendingPaths().indexOf('workers') !== -1,
        JSON.stringify(a.Sync.pendingPaths()));

    await online(a, cloud);
    await settleUntil(() => a.Sync.pendingCount() === 0, 6000, 10);
    await settled();

    const stillThere = ((cloud.doc && cloud.doc.workers) || [])
        .some(item => item && item.id === 'w_02');
    check('R2.4 the refresh does not resurrect him in the array a v78 phone reads',
        !stillThere, JSON.stringify((cloud.doc.workers || []).map(item => item.id)));
    check('and the tombstone in the map survives it',
        cloud.doc.roster.workers.w_02 === null,
        JSON.stringify(cloud.doc.roster.workers.w_02));
}

{
    suite('R2.5: repeated snapshots, and a snapshot that lands mid-send');

    const disk = diskWith();
    const { cloud } = await cloudRaisedTo600(disk);
    const a = openOn(disk, 'd_a');
    a.State.place('p_01').name = 'renamed site';
    given('A is queued', a.State.commitRoster() === true,
        JSON.stringify(a.Sync.pendingPaths()));

    // Count every operation this device ever writes down, so a correction minted once per
    // snapshot - attack (f) - shows up as a number that keeps climbing.
    let minted = 0;
    const queueOperations = a.Sync.queueOperations;
    a.Sync.queueOperations = function (entries) {
        minted += (entries || []).length;
        return queueOperations.apply(this, [entries]);
    };

    // The array write is HELD OPEN while three more snapshots arrive - attack (d): the
    // bytes of an operation a receipt will be issued for must not change under it.
    const gate = deferred();
    let updates = 0;
    cloud.hold = (kind, payload) => {
        if (kind !== 'update' || !payload || payload.updatedBy !== a.id) return null;
        updates += 1;
        return updates === 1 ? gate.promise : null;
    };

    await online(a, cloud);
    await settleUntil(() => updates > 0, 4000, 5);
    // Three snapshots while that write is in flight, from a device that is not involved.
    for (let round = 0; round < 3; round += 1) {
        const other = openOn(disk, `d_c${round}`);
        await online(other, cloud);
        await settled();
    }
    gate.release();
    cloud.hold = null;
    await settleUntil(() => a.Sync.pendingCount() === 0, 8000, 10);
    await settled();

    check('R2.5 the reconciliation does not mint a correction per snapshot',
        minted <= 4, `${minted} operations written down`);
    check('and it converges: the array and the map agree on the raise',
        arrayRate(cloud.doc) === 600 && mapRate(cloud.doc) === 600,
        `array=${arrayRate(cloud.doc)} map=${mapRate(cloud.doc)}`);
    check('and the rename is still there afterwards',
        arrayName(cloud.doc, 'p_01') === 'renamed site',
        String(arrayName(cloud.doc, 'p_01')));
    check('and the queue is empty and the phone says so',
        a.Sync.pendingCount() === 0 && a.Sync.status === 'synced',
        `${a.Sync.pendingCount()} / ${a.Sync.status}`);
}

report();
