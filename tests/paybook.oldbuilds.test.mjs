// What a phone that has NOT updated does with a pay book - measured on the real bytes.
//
//   node tests/paybook.oldbuilds.test.mjs
//
// Three phones share one document and do not update together, so for some days after the
// pay book's writer is first opened there will be a phone in the field that has never
// heard of `pay`. This suite is that phone: v167, v169 and v171, each built out of Git
// (`git show <commit>:<file>`, the way tests/rima.test.mjs builds v145 and v165) and run
// on the fake cloud beside a phone of this build. A synthetic "old phone" written in this
// checkout would be written by somebody who has read the new code, and is not evidence.
//
// The questions, each answered as a measurement and pinned:
//
//   does it keep working?                          status, Recovery, its own writes
//   what does its own copy hold?                   `pay` - dropped, or kept
//   does an ORDINARY write of its remove `pay`     a day, a closure made the old way,
//     from the cloud?                              an adopted snapshot
//   does a RESTORE from it remove `pay`            every door is one function there:
//     from the cloud?                              a whole-document write
//   what do its files carry?                       the backup file, the rescue file
//   what happens when it updates?                  its disk, opened by this build
//   and two windows on one disk?                   an old one beside a new one
//
// THE ROLLOUT RULE in docs/payroll-closure.md is derived from the answers below and from
// nothing else. Where an answer is a hazard it is pinned as «TODAY:» - present behaviour,
// not a guarantee - so that the phase which closes it has to move the check on purpose.
//
// Synthetic data only.

import { execFileSync } from 'node:child_process';
import { makeDevice, makeCloud, settle, settleUntil, loadOrder, sourceRoot, sharedStore } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import {
    FORTNIGHT, TODAY, clone, stamp, canonical, payDevice, world, advancesOf, plan, openBook, bookOf
} from './paybook.world.mjs';

const ROOT = sourceRoot();
const SCHEDULE = 'scheduleData:v2';
const TICK = 6;
const git = args => execFileSync('git', ['-C', ROOT].concat(args),
    { maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });

// The builds in the field when the pay book's storage was written, newest last. v167 is
// the money code main was audited at; v169 is what is served; v171 is main.
const OLDER = [
    ['v167', 'a25566f'],
    ['v169', 'bd59a68'],
    ['v171', '0acaceb']
];
// What this build loads that none of them had. Named, not filtered by whatever happens to
// be there - see NOT_IN_V165 in tests/rima.test.mjs for why.
// v175 adds js/sync/transact.js, the pay book's server-first door: no older build has it,
// and none of them needs it to do what is measured here.
const NEW_HERE = ['js/model/payroll.js', 'js/sync/transact.js'];
const olderOrder = loadOrder().filter(file => NEW_HERE.indexOf(file) === -1);

function sourcesOf(name, sha) {
    let present = false;
    try { present = git(['cat-file', '-t', sha]).toString().trim() === 'commit'; } catch (error) { present = false; }
    given(`the ${name} commit is in this repository`, present, sha);
    const files = olderOrder.filter(file => {
        try { git(['cat-file', '-e', `${sha}:${file}`]); return true; } catch (error) { return false; }
    });
    given(`${name} has every file this build loads that it could have had`, files.length === olderOrder.length,
        `${files.length} of ${olderOrder.length}`);
    const sources = files.map(file => ({ file, code: git(['show', `${sha}:${file}`]).toString('utf8') }));
    const said = (/const APP_VERSION = '([^']+)'/.exec(git(['show', `${sha}:js/app.js`]).toString('utf8')) || [])[1];
    given(`the older build names itself ${name}`, said === name, String(said));
    given(`${name} has never heard of the pay book`,
        !sources.some(source => /payConflicted|paybook|layPaybookEntry/.test(source.code)));
    return sources;
}

// ONE RECORD everybody starts from - see BASE in tests/paybook.sync.test.mjs. The cloud
// already carries the pay book's opening; an old phone's own disk does not, because an
// old phone never keeps one.
const BASE = (() => {
    const first = world({ advances: [['w_khaled', '2026-10-03', 500], ['w_khaled', '2026-10-06', 400]] });
    openBook(first, undefined, 'd_seed');
    const schedule = clone(first.State.schedule);
    const wire = first.call('cloudDocument', schedule);
    const bare = clone(schedule);
    delete bare.pay;
    return { schedule, wire, bare, advances: advancesOf(first, 'w_khaled') };
})();
const [K1, K2] = BASE.advances;
const cloudWith = () => makeCloud({ doc: Object.assign(clone(BASE.wire), { protocol: 1, revision: 1, lastOpId: 'op_seed' }) });

function newPhone(id, cloud, options = {}) {
    const device = payDevice(Object.assign({ deviceId: id,
        storage: options.storage || { [SCHEDULE]: JSON.stringify(BASE.schedule) } }, options));
    device.Sync.pushDelayMs = 5;
    device.State.load();
    if (cloud) device.Sync.connect(cloud.adapter);
    return device;
}
function oldPhone(name, sources, id, cloud, options = {}) {
    const device = makeDevice(Object.assign({ sources, appVersion: name, deviceId: id,
        storage: { [SCHEDULE]: JSON.stringify(BASE.bare) } }, options));
    device.setToday(TODAY);
    device.said = [];
    device.ctx.askTell = said => { device.said.push(said); return Promise.resolve(); };
    device.ctx.askConfirm = said => { device.said.push(said); return Promise.resolve(true); };
    device.Sync.pushDelayMs = 5;
    device.State.load();
    if (cloud) device.Sync.connect(cloud.adapter);
    return device;
}
const quiet = device => device.Sync.status === 'synced' && device.Sync.pendingCount() === 0;
const settled = (devices, limit = 8000) => settleUntil(() => devices.every(quiet), limit, 5);
const payIds = source => Object.keys((source && source.pay) || {}).sort();
const cloudBook = cloud => canonical((cloud.doc && cloud.doc.pay) || {});
const khaled = device => plan(device, 'planClosure', 'w_khaled', FORTNIGHT,
    { allocations: { [K1]: 500, [K2]: 100 }, paid: 2000, paidOn: TODAY, method: 'cash' }, stamp(TODAY, device.id));
const KHALED_PAY = ['po_open', 'pp_ps_w_khaled_20261002', 'ps_w_khaled_20261002'];
// Every write a device made, as the fake cloud recorded it.
const writesBy = (cloud, id) => cloud.writes.filter(write => (write.patch || write.data || write.payload || {}).updatedBy === id);
const touchesPay = write => Object.keys(write.patch || write.data || {}).some(key => key === 'pay' || key.indexOf('pay.') === 0
    || key.indexOf('payConflicted') === 0);

const answers = {};

for (const [name, sha] of OLDER) {
    const sources = sourcesOf(name, sha);
    const found = answers[name] = {};

    // ------------------------------------------------------------------ an ordinary evening
    suite(`${name}, beside a phone that writes the pay book: an ordinary evening`);
    {
        const cloud = cloudWith();
        const n = newPhone(`d_new_${name}`, cloud);
        const old = oldPhone(name, sources, `d_old_${name}`, cloud);
        await settled([n, old]);
        given('the new phone closes Khaled\'s account and it lands', (drawn => drawn.ok && n.State.commitPaybook(drawn.changes).ok)(khaled(n)));
        await settled([n, old]);
        given('the cloud holds the statement and the payment', canonical(payIds(cloud.doc)) === canonical(KHALED_PAY));
        const cloudPay = cloudBook(cloud);

        found.keepsWorking = old.Sync.status === 'synced' && old.call('farkadWritesBlocked') === false
            && old.global('Recovery').problems.length === 0;
        check('IT KEEPS WORKING: synced, writing not blocked, no Recovery problem - a document with `pay` on it does not stop it',
            found.keepsWorking, JSON.stringify([old.Sync.status, old.call('farkadWritesBlocked'), old.global('Recovery').problems.map(p => p.key)]));

        found.dropsFromOwnCopy = old.State.schedule.pay === undefined && JSON.parse(old.raw(SCHEDULE)).pay === undefined;
        check('IT DROPS `pay` FROM ITS OWN COPY: nothing in memory, nothing on its disk', found.dropsFromOwnCopy,
            JSON.stringify([old.State.schedule.pay, JSON.parse(old.raw(SCHEDULE)).pay]));
        same('it does see the closure itself - the frozen payslip and the deductions are ledger entries it reads',
            [[K1, K2].map(id => old.call('advanceOutstanding', old.State.schedule, id).left),
                Object.keys(old.call('closedPeriods', old.State.schedule, 'w_khaled'))], [[0, 300], ['2026-10-02']]);
        same('and refuses to close that period a second time',
            old.call('planPeriodClosure', old.State.schedule, 'w_khaled', FORTNIGHT.from, FORTNIGHT.to, '2026-10-16T12:00:00.000Z', 0).canClose, false);

        // An ordinary write: a day.
        given('the old phone records a day', old.State.commit(
            old.call('assignPlace', old.State.schedule, '2026-10-18', 'w_nasser', 'actual', 'p_a')) === true);
        await settled([n, old]);
        // And a closure made the only way it knows: the ledger entries, no statement.
        given('the old phone closes Salim\'s account its own way', old.State.commitMany(old.call('closePeriodChanges',
            old.State.schedule, 'w_salim', FORTNIGHT.from, FORTNIGHT.to, '2026-10-16T12:00:00.000Z', old.id, 0)) === true);
        await settled([n, old]);
        const mine = writesBy(cloud, old.id);
        given('the old phone\'s writes reached the cloud', mine.length >= 2
            && Boolean(cloud.doc.days['2026-10-18'].actual.w_nasser) && Boolean(cloud.doc.ledger.advances.le_period_w_salim_20261002));
        found.ordinaryWriteKeepsPay = cloudBook(cloud) === cloudPay && mine.every(write => write.kind === 'update' && !touchesPay(write));
        check('NO ORDINARY WRITE OF ITS REMOVES `pay` FROM THE CLOUD: a day and a closure went out as field paths, and the pay book there is byte for byte what it was',
            found.ordinaryWriteKeepsPay, JSON.stringify(mine.map(write => [write.kind, Object.keys(write.patch || write.data).length])));
        same('the new phone receives both, and still holds the whole pay book',
            [Boolean(n.State.schedule.days['2026-10-18'].actual.w_nasser), payIds(n.State.schedule), bookOf(n) === cloudPay], [true, KHALED_PAY, true]);
        // What the old phone's closure looks like from the new one: a closure with no statement.
        same('the old phone\'s closure reads, on the new phone, as a closure nobody recorded a payment for',
            (account => [account.paymentUnknown.map(row => row.periodFrom), account.wageDue])(
                n.call('accountFor', n.State.schedule, 'w_salim', TODAY)), [['2026-10-02'], 0]);
        same('and nothing about it holds or blocks the new phone',
            [n.call('farkadWritesBlocked'), n.State.schedule.payConflicted, n.call('paybookFold', n.State.schedule).held], [false, undefined, []]);

        // Its files.
        old.call('exportBackup');
        const backup = JSON.parse(old.downloads[old.downloads.length - 1].text);
        old.call('exportRecoveryData');
        const rescue = JSON.parse(old.downloads[old.downloads.length - 1].text);
        found.filesCarryPay = backup.pay !== undefined || JSON.parse(rescue.records[SCHEDULE]).pay !== undefined;
        check('ITS FILES DO NOT CARRY THE PAY BOOK: neither its backup file nor its rescue file has a `pay`',
            found.filesCarryPay === false, JSON.stringify([backup.pay, JSON.parse(rescue.records[SCHEDULE]).pay]));

        // ---- WHEN IT UPDATES. The old phone wrote last, so the cloud carries ITS stamps;
        // opened on this build, its first snapshot must not be mistaken for its own echo.
        given('the old phone wrote last', cloud.doc.updatedBy === old.id);
        const updated = newPhone(old.id, cloud, { storage: old.dump() });
        given('opened on this build, before it has heard anything, its own disk has no pay entry', payIds(updated.State.schedule).length === 0);
        await settleUntil(() => payIds(updated.State.schedule).length === 3, 8000, 5);
        found.updateAdoptsAtOnce = bookOf(updated) === cloudPay;
        check('WHEN IT UPDATES, its first snapshot gives it the whole pay book - not skipped as its own echo',
            found.updateAdoptsAtOnce, JSON.stringify(payIds(updated.State.schedule)));
        same('and it is not blocked, holds nothing beside, and reads Khaled\'s account',
            [updated.call('farkadWritesBlocked'), updated.State.schedule.payConflicted,
                updated.call('accountFor', updated.State.schedule, 'w_khaled', TODAY).wageDue], [false, undefined, 1800]);
    }

    // ------------------------------------------------------------------ the dangerous one
    suite(`${name}: a whole-document restore FROM the phone that has not updated`);
    {
        const cloud = cloudWith();
        const n = newPhone(`d_new2_${name}`, cloud);
        const old = oldPhone(name, sources, `d_old2_${name}`, cloud);
        await settled([n, old]);
        given('the new phone closes Khaled\'s account and it lands', (drawn => drawn.ok && n.State.commitPaybook(drawn.changes).ok)(khaled(n)));
        await settled([n, old]);
        const cloudPay = cloudBook(cloud);
        given('the cloud holds the pay book', payIds(cloud.doc).length === 3);

        // Its own restore point, taken now, restored a moment later - the mildest restore
        // there is: the same record, put back. Every restore door on that build ends in
        // the same call.
        const result = await old.Sync.replaceEverything(old.call('normaliseSchedule', clone(old.State.schedule)));
        await settleUntil(() => cloud.writes.some(write => write.kind === 'save'), 8000, 5);
        await settle(TICK * 20);
        given('the old phone\'s restore reached the cloud', result.ok === true && cloud.writes.some(write => write.kind === 'save'));
        found.restoreErasesPay = cloud.doc.pay === undefined;
        check('TODAY: A RESTORE FROM IT ERASES THE PAY BOOK FROM THE CLOUD - the document it writes has no `pay` at all',
            found.restoreErasesPay, JSON.stringify(payIds(cloud.doc)));
        same('the closure\'s LEDGER entries survive that restore - the old build unions those',
            Object.keys(cloud.doc.ledger.advances).filter(id => /^le_(period|close)_/.test(id)).length, 3);
        found.newPhoneKeepsAfterRestore = bookOf(n) === cloudPay;
        check('the phone that has updated STILL HOLDS every entry - a snapshot with no `pay` removes nothing from it',
            found.newPhoneKeepsAfterRestore, JSON.stringify(payIds(n.State.schedule)));
        same('but nothing puts them back on the cloud, and a phone installing now is not told of them',
            [payIds(cloud.doc), n.Sync.pendingCount()], [[], 0]);
        // The way back, measured: a restore from a phone that DOES hold them.
        const healed = await n.Sync.replaceEverything(n.call('normaliseSchedule', clone(n.State.schedule)));
        await settled([n], 20000);
        same('a restore from an UPDATED phone that holds them puts the whole pay book back',
            [healed.ok, cloudBook(cloud)], [true, cloudPay]);
    }

    // ------------------------------------------------------------------ two windows, one disk
    suite(`${name}: a window of the old build open beside a window of this one, on one disk`);
    {
        const windowOf = disk => {
            const stale = makeDevice({ sources, appVersion: name, sharedStorage: disk, deviceId: `d_two_${name}` });
            stale.setToday(TODAY);
            stale.ctx.askTell = () => Promise.resolve();
            stale.ctx.askConfirm = () => Promise.resolve(false);
            stale.State.load();
            return stale;
        };
        const aDay = (device, date) => device.State.commit(
            device.call('assignPlace', device.State.schedule, date, 'w_nasser', 'actual', 'p_a'));

        // --- (A) the pay book is on the record and in no queue: a phone that is synced.
        // The cloud holds it too, and this build's window is open and holds it in memory.
        const cloud = cloudWith();
        const disk = sharedStore({ [SCHEDULE]: JSON.stringify(BASE.schedule), 'farkad:deviceId': `d_two_${name}` });
        const current = payDevice({ sharedStorage: disk, deviceId: `d_two_${name}` });
        current.Sync.pushDelayMs = 5;
        current.State.load();
        current.Sync.connect(cloud.adapter);
        await settled([current]);
        given('this build\'s window closes Khaled\'s account and the cloud has it',
            (drawn => drawn.ok && current.State.commitPaybook(drawn.changes).ok)(khaled(current)));
        await settled([current]);
        given('the pay book is on the shared disk, on the cloud, and in no queue',
            payIds(JSON.parse(disk.getItem(SCHEDULE))).length === 3 && payIds(cloud.doc).length === 3 && current.Sync.pendingCount() === 0);
        const cloudPay = cloudBook(cloud);

        const stale = windowOf(disk);
        given('the old window opens that disk without complaint', stale.call('farkadWritesBlocked') === false);
        const saved = aDay(stale, '2026-10-18');
        found.oldWindowWipesDisk = saved === true && JSON.parse(disk.getItem(SCHEDULE)).pay === undefined;
        check('TODAY: THE OLD WINDOW\'S NEXT SAVE WRITES THE RECORD WITHOUT `pay` - on the disk both windows share',
            found.oldWindowWipesDisk, JSON.stringify([saved, payIds(JSON.parse(disk.getItem(SCHEDULE)))]));
        // This build's window still has the book in memory. Its next save finds the disk
        // has moved, rebases onto what the other window wrote - and takes the wipe with it.
        given('this build\'s window records a day of its own', aDay(current, '2026-10-19') === true);
        found.newWindowLosesMemory = payIds(current.State.schedule).length === 0;
        check('TODAY: and this build\'s OWN window then loses the book from memory too, rebasing onto that record',
            found.newWindowLosesMemory, JSON.stringify(payIds(current.State.schedule)));
        same('the cloud is untouched by any of it', cloudBook(cloud), cloudPay);
        // What gives it back: the next snapshot this window adopts. It is NOT read as an
        // echo of this phone's own write - the snapshot carries pay entries this copy lacks.
        await settleUntil(() => payIds(current.State.schedule).length === 3, 8000, 5);
        found.cloudGivesBack = bookOf(current) === cloudPay && canonical(JSON.parse(disk.getItem(SCHEDULE)).pay) === cloudPay;
        check('the cloud gives the whole pay book back at the next snapshot this window hears - memory and disk',
            found.cloudGivesBack, JSON.stringify([payIds(current.State.schedule), payIds(JSON.parse(disk.getItem(SCHEDULE)))]));
        same('with both windows\' days intact, and the cloud\'s pay book still untouched',
            [Boolean(current.State.schedule.days['2026-10-18']), Boolean(current.State.schedule.days['2026-10-19']), cloudBook(cloud)],
            [true, true, cloudPay]);

        // --- (B) a closure still in the QUEUE: a phone with no signal, or no cloud at all.
        const lone = sharedStore({ [SCHEDULE]: JSON.stringify(BASE.schedule), 'farkad:deviceId': `d_lone_${name}` });
        const writer = payDevice({ sharedStorage: lone, deviceId: `d_lone_${name}` });
        writer.State.load();
        given('this build\'s window closes Khaled\'s account, with no cloud',
            (drawn => drawn.ok && writer.State.commitPaybook(drawn.changes).ok)(khaled(writer)));
        const reader = windowOf(lone);
        found.oldWindowHeldByQueue = reader.call('farkadWritesBlocked') === true
            && reader.global('Recovery').problems.length === 1
            && /^farkad:outbox:op:/.test(reader.global('Recovery').problems[0].key);
        check('TODAY: an old window that opens a disk whose QUEUE holds a pay path cannot read that batch, quarantines a copy of it, and is held',
            found.oldWindowHeldByQueue, JSON.stringify(reader.global('Recovery').problems.map(problem => problem.key)));
        same('held, it writes nothing: its day is refused and the pay book on the disk is whole',
            [aDay(reader, '2026-10-18'), payIds(JSON.parse(lone.getItem(SCHEDULE)))], [false, KHALED_PAY]);
        same('the batch it could not read is still on the disk, untouched, beside the quarantined copy of it',
            (keys => [keys.filter(key => /:op:[^:]+$/.test(key)).length >= 1, keys.filter(key => /:op:.*:damaged$/.test(key)).length])(
                Object.keys(lone)), [true, 1]);
        // The person presses «הבנתי, המשך לרשום» in the old window, and records.
        reader.global('Recovery').acknowledge();
        given('after acknowledging, the old window records a day', aDay(reader, '2026-10-18') === true);
        same('TODAY: and that save writes the record without `pay`', JSON.parse(lone.getItem(SCHEDULE)).pay, undefined);
        const again = payDevice({ sharedStorage: lone, deviceId: `d_lone_${name}` });
        again.State.load();
        found.journalRebuilds = canonical(payIds(again.State.schedule)) === canonical(['pp_ps_w_khaled_20261002', 'ps_w_khaled_20261002'])
            && Boolean(again.State.schedule.ledger.advances.le_period_w_khaled_20261002);
        check('this build, reopened on that disk, rebuilds the closure whole from its journal - the batch was never deleted',
            found.journalRebuilds, JSON.stringify(payIds(again.State.schedule)));
        found.unqueuedEntryLost = again.State.schedule.pay.po_open === undefined;
        check('TODAY: but an entry that was on the record and in NO queue - the opening - is gone from a phone with no cloud to give it back',
            found.unqueuedEntryLost, JSON.stringify(again.State.schedule.pay.po_open));
        same('and nothing on that phone says so: not blocked, nothing held', [again.call('farkadWritesBlocked'),
            again.call('paybookFold', again.State.schedule).held.map(row => row.id)], [false, []]);
    }
}

// ====================================================================================
suite('THE ANSWERS, side by side - what the rollout rule is derived from');
{
    const table = OLDER.map(([name]) => [name, answers[name]]);
    table.forEach(([name, found]) => console.log(`        ${name}: ${JSON.stringify(found)}`));
    const EXPECTED = {
        keepsWorking: true,                 // a document carrying `pay` does not stop it
        dropsFromOwnCopy: true,             // and it keeps none of it
        ordinaryWriteKeepsPay: true,        // field-path writes never touch the cloud's pay book
        filesCarryPay: false,               // its backup and rescue files have none
        updateAdoptsAtOnce: true,           // updating heals the phone itself, at the first snapshot
        restoreErasesPay: true,             // HAZARD 1: its whole-document write removes it from the cloud
        newPhoneKeepsAfterRestore: true,    //   updated phones keep theirs; the cloud is not healed by itself
        oldWindowWipesDisk: true,           // HAZARD 2: one disk, two builds - its save drops `pay`
        newWindowLosesMemory: true,         //   and this build's own window follows it
        cloudGivesBack: true,               //   until the next snapshot, where there is a cloud
        oldWindowHeldByQueue: true,         // an unsent pay path stops the old window before it writes
        journalRebuilds: true,              //   and the journal rebuilds what was queued
        unqueuedEntryLost: true             //   but not what was only on the record, on a phone with no cloud
    };
    same('all three older builds answer every question the same way', table.map(([, found]) => found),
        OLDER.map(() => EXPECTED));
    // Both hazards are the same act: a WHOLE-RECORD write by a build that does not keep
    // `pay` - to the cloud (a restore) or to a disk it shares (a second window). The rule
    // in docs/payroll-closure.md forbids exactly those two, and nothing else.
    same('the two hazards are both present on every older build',
        OLDER.map(([name]) => [answers[name].restoreErasesPay, answers[name].oldWindowWipesDisk]), OLDER.map(() => [true, true]));
}

report();
