// The write fence, measured against the build that is actually in the field.
//
//   node tests/fence.legacy.test.mjs
//
// The rescue export's `stable: true` is a claim about a DISK, not about a tab: it says the
// readings in the file are one moment of this device, so whoever opens the file is looking
// at a coherent evening rather than half of one. Everything downstream trusts it.
//
// The fence that backs the claim is a counter in localStorage that this build bumps on
// every write to a record the file carries. Two equal readings around the file mean
// nothing moved. That reasoning has one hole and it is the size of the whole rollout:
//
//   A BUILD THAT PREDATES THE COUNTER DOES NOT MOVE IT.
//
// v86 is on every phone in the field. It writes scheduleData:v2, the journal, the outbox -
// every record the rescue file carries - and it has never heard of farkad:writeTick. So a
// v87 tab exporting while a v86 tab is writing sees the counter it moved itself, twice,
// unchanged, and calls the file a quiet moment of a disk that was being rewritten under it.
//
// The current answer is a second key: farkad:writeTick:build, the stamp of the build that
// last kept the fence. It cannot work, and this file measures that rather than arguing it.
// A writer that never touches the counter never touches the stamp either, so the stamp
// keeps saying v87 - written by the exporting tab itself - through every v86 write on the
// disk. Detecting a writer by a record that writer does not write is not detection.
//
// Nothing here is synthetic. The older device below runs the REAL bytes of the released
// build, read out of Git at the verified main commit and checked against the commit's own
// blobs before a single line of it is executed. A hand-written "old writer" would be
// written by somebody who has read the fence, and would therefore avoid it politely; v86
// does not know the fence exists, which is the entire point.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { makeDevice, sharedStore, loadOrder, sourceRoot, appStamp } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

// The released build, by its full SHA. Not a tag, not a branch, not HEAD~n.
const RELEASED = '880d7bb3ce58affd5fb285095c73c54435e5c7e7';
const ROOT = sourceRoot();

const git = args => execFileSync('git', ['-C', ROOT, ...args], {
    encoding: 'buffer', maxBuffer: 64 * 1024 * 1024
});
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

suite('the bytes the older device runs are the released build\'s, out of Git');

const FILES = loadOrder();
given('the released commit is in this repository',
    git(['cat-file', '-t', RELEASED]).toString().trim() === 'commit', RELEASED);

// Read as BLOBS, and verified as blobs. `git show` renders a file; `git rev-parse
// <sha>:<path>` names the object Git itself stores, and hashing the bytes we loaded
// against `git cat-file blob` proves the two are the same object rather than the same
// path read twice through a filesystem that could be a symlink, an overlay or a mount.
const LEGACY = FILES.map(file => {
    const code = git(['show', `${RELEASED}:${file}`]);
    const blob = git(['rev-parse', `${RELEASED}:${file}`]).toString().trim();
    const bytes = git(['cat-file', 'blob', blob]);
    return { file, code: code.toString('utf8'), blob, matches: sha(code) === sha(bytes) };
});
given('every file of the older build came out of the commit intact',
    LEGACY.every(entry => entry.matches), `${LEGACY.length} files`);
check('the older device publishes the hash of every file it runs',
    LEGACY.every(entry => /^[0-9a-f]{40}$/.test(entry.blob)),
    LEGACY.map(entry => `${entry.file}@${entry.blob.slice(0, 8)}`).join(' '));

const legacyApp = git(['show', `${RELEASED}:js/app.js`]).toString('utf8');
const LEGACY_STAMP = (/const APP_VERSION = '([^']+)'/.exec(legacyApp) || [])[1];
given('the older build names itself', Boolean(LEGACY_STAMP), String(LEGACY_STAMP));

// And that it really is the build without the fence. If a later main ever ships one, this
// suite is measuring nothing and must say so rather than passing quietly.
const legacyStore = LEGACY.find(entry => entry.file === 'js/store.js').code;
check('the released build has no write fence at all - it is a genuine legacy writer',
    !/writeTick/.test(legacyStore) && !/fenceBroken/.test(legacyStore),
    `writeTick mentions: ${(legacyStore.match(/writeTick/g) || []).length}`);

const sources = LEGACY.map(entry => ({ file: entry.file, code: entry.code }));

// ---------------------------------------------------------------- the shared disk

const WORKERS = [{ id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 }];
const PLACES = [{ id: 'p_01', name: 'הרצליה', active: true }];

function schedule(days) {
    return JSON.stringify({
        schemaVersion: 2,
        workers: WORKERS, places: PLACES,
        days: days || {}, advances: {},
        updatedAt: '2026-08-01T00:00:00.000Z', updatedBy: 'd_old'
    });
}
const day = placeId => ({ plan: {}, actual: { w_01: { entries: [{ placeId }] } } });

// The interleave hook fires once, on the NEXT read of any key, and then clears itself -
// so aiming it at one record means re-arming it every time some other key goes past. This
// keeps it armed until the wanted key has been read `times` times, and runs the body then.
function onReadOf(disk, wanted, times, body) {
    let fired = 0;
    const arm = () => disk.interleave(key => {
        if (key === wanted) {
            fired += 1;
            body(fired);
            if (fired >= times) return;
        }
        arm();
    });
    arm();
    return () => fired;
}

// One disk, two builds. This is a phone with the app open in two tabs during a rollout -
// or, just as ordinary, the installed app and the same site in a browser tab.
function twoBuilds() {
    const disk = sharedStore({ 'scheduleData:v2': schedule({ '2026-08-03': day('p_01') }) });
    const old = makeDevice({ sharedStorage: disk, sources, deviceId: 'd_v86',
        appVersion: LEGACY_STAMP });
    const now = makeDevice({ sharedStorage: disk, deviceId: 'd_v87' });
    return { disk, old, now };
}

{
    suite('a v86 tab writing while a v87 tab takes a rescue snapshot');

    const { disk, old, now } = twoBuilds();
    given('the older device is running the older build',
        old.global('APP_VERSION') === LEGACY_STAMP, String(old.global('APP_VERSION')));
    given('this device is running this build',
        now.global('APP_VERSION') !== LEGACY_STAMP, String(now.global('APP_VERSION')));

    // A page a service worker is in charge of, which is the only way two builds can be
    // running on one origin at all: an uncontrolled tab is served by the network and the
    // network hands every tab the same deploy. So this is the real configuration, and the
    // census is the answer the worker's own client enrollment provides.
    now.ctx.navigator = { serviceWorker: { controller: {} } };
    given('the worker\'s census names a window of the older build',
        now.Store.noteOpenBuilds([`farkad-${LEGACY_STAMP}`,
            `farkad-${now.global('APP_VERSION')}`], false));

    // The v87 tab writes once, so the counter exists and the keeper stamp says v87 - which
    // is the state every one of these devices is in the moment this build is opened.
    // A record the rescue file carries: the counter only moves for those, by design.
    now.Store.set('scheduleData:v2', schedule({ '2026-08-03': day('p_01') }));
    const tickBefore = now.Store.readWriteTick();
    given('the fence is up and this build is keeping it',
        tickBefore !== null && tickBefore > 0, String(tickBefore));

    // Now the older tab writes the record the rescue file carries, and puts it back -
    // twice, straddling the snapshot's two readings. Every write is a real Store.set from
    // the released build; nothing here reaches into localStorage behind its back.
    const before = schedule({ '2026-08-03': day('p_01') });
    const during = schedule({ '2026-08-03': day('p_01'), '2026-08-04': day('p_01') });
    const writes = onReadOf(disk, 'scheduleData:v2', 2, () => {
        old.Store.set('scheduleData:v2', during);
        old.Store.set('scheduleData:v2', before);
    });

    const snapshot = now.global('Recovery').rawSnapshot();
    const tickAfter = now.Store.readWriteTick();

    given('the older tab really did write during the snapshot', writes() >= 2, String(writes()));
    check('a legacy writer does not move the counter, which is why it cannot be seen',
        tickAfter === tickBefore, `${tickBefore} -> ${tickAfter}`);
    check('nor the keeper stamp, which still names the tab doing the exporting',
        disk.getItem('farkad:writeTick:build') === now.global('APP_VERSION'),
        String(disk.getItem('farkad:writeTick:build')));

    // The claim. A file taken across two rewrites of the record it carries is not one
    // moment of this disk, and must not say it is.
    check('the snapshot must not call this a quiet moment',
        snapshot.stable !== true,
        `stable=${snapshot.stable} captures=${snapshot.captures.length}`);

    // And the device can say WHY, rather than only declining to make a claim.
    check('a window of an older build is recognised as a writer this fence cannot see',
        now.Store.foreignWriterOpen() === true,
        `foreignWriterOpen=${now.Store.foreignWriterOpen()}`);
    const told = now.global('Recovery').rawSnapshot();
    check('and the snapshot says so in words a person can be shown',
        told.stable !== true
        && told.unstableBecause.some(why => /another build/.test(why)),
        `stable=${told.stable} because ${JSON.stringify(told.unstableBecause)}`);
}

{
    suite('a live window running a build that keeps no fence at all');

    // The repair the check above needs is not another key that a legacy writer also does
    // not write. It is the identity work: the service worker knows which build every open
    // window is running, durably, because it enrolled them. A window running a build that
    // does not keep the fence is an unfenced writer whether or not it has written yet, and
    // the export can be told so before it claims anything.
    const { disk, old, now } = twoBuilds();
    // A record the rescue file carries: the counter only moves for those, by design.
    now.Store.set('scheduleData:v2', schedule({ '2026-08-03': day('p_01') }));
    now.ctx.navigator = { serviceWorker: { controller: {} } };
    given('the worker\'s census names a window of the older build',
        now.Store.noteOpenBuilds([`farkad-${LEGACY_STAMP}`,
            `farkad-${now.global('APP_VERSION')}`], false));

    // Nothing has been written by the old tab. It is merely OPEN, which is enough: it may
    // write at any point during the export, and the export cannot wait to find out.
    const snapshot = now.global('Recovery').rawSnapshot();
    check('an export cannot claim stability while a window of an older build is open',
        snapshot.stable !== true,
        `stable=${snapshot.stable}; the ${LEGACY_STAMP} tab is open and has written nothing yet`);

    // And a controlled page that has never been told anything is not entitled to assume it
    // is alone. "Nobody has reported" is not "nobody is there".
    const quiet = makeDevice({ deviceId: 'd_quiet' });
    quiet.ctx.navigator = { serviceWorker: { controller: {} } };
    quiet.Store.set('scheduleData:v2', schedule({ '2026-08-03': day('p_01') }));
    check('and a page with a worker but no census does not assume it is alone',
        quiet.Store.foreignWriterOpen() === null
        && quiet.global('Recovery').rawSnapshot().stable !== true,
        `foreignWriterOpen=${quiet.Store.foreignWriterOpen()}`);
}

{
    suite('the counter put back by a tab that was paused mid-write');

    // 1 -> peak 3 -> landed 2. Two tabs both read 1, both compute 2, and the second write
    // lands on top of a 3 that a third write had already reached. The counter ends LOWER
    // than it went, which is the one thing two equal readings cannot detect - and no mark
    // is left anywhere.
    const disk = sharedStore({});
    const a = makeDevice({ sharedStorage: disk, deviceId: 'd_a' });
    const b = makeDevice({ sharedStorage: disk, deviceId: 'd_b' });

    a.Store.set('scheduleData:v2', schedule({}));
    const start = a.Store.readWriteTick();
    given('the counter is at a known value', start !== null, String(start));

    let peak = start;
    // On the SECOND read, which is the last one before the write lands. This build reads
    // the counter twice - once to see where it is and once immediately before writing - so
    // a tab that gets in before the first read is caught by the second. The gap that is
    // still open is the one after the last read, and that is the gap a preempted tab
    // actually resumes into.
    onReadOf(disk, 'farkad:writeTick', 2, at => {
        if (at !== 2) return;
        b.Store.set('scheduleData:v2', schedule({ '2026-08-05': day('p_01') }));
        b.Store.set('scheduleData:v2', schedule({ '2026-08-06': day('p_01') }));
        peak = b.Store.readWriteTick();
    });
    const fenceBefore = a.Store.fenceState();
    a.Store.set('scheduleData:v2', schedule({ '2026-08-07': day('p_01') }));
    const landed = a.Store.readWriteTick();

    given('the shared counter really did go up and come back down', peak > landed,
        `${start} -> peak ${peak} -> landed ${landed}`);

    // The shared counter is still a read-modify-write and still goes backwards - it is
    // kept only because a build in the field reads it. What must not go backwards is the
    // EVIDENCE, and the evidence is now every tab's own counter together. For that set to
    // read the same across those writes, a tab would have to lower its own count, and no
    // tab ever writes another's key or lowers its own.
    given('the evidence was readable throughout',
        fenceBefore !== null && a.Store.fenceState() !== null,
        `${fenceBefore} -> ${a.Store.fenceState()}`);
    const valuesOf = text => String(text).split(' ').filter(Boolean)
        .map(part => Number(part.split('=')[1]));
    const wasValues = valuesOf(fenceBefore);
    const nowValues = valuesOf(a.Store.fenceState());
    check('the evidence a snapshot compares moved, and every part of it moved forward',
        a.Store.fenceState() !== fenceBefore
        && nowValues.length >= wasValues.length
        && wasValues.every((value, at) => nowValues[at] >= value),
        `before ${fenceBefore} / after ${a.Store.fenceState()}`);
    check('and each tab\'s evidence has exactly one author, so none can be put back',
        Object.keys(disk).filter(key => key.indexOf('farkad:writeTick:tab:') === 0).length === 2,
        Object.keys(disk).filter(key => key.indexOf('farkad:writeTick:tab:') === 0).join(' '));
}

{
    suite('the counter that goes away and comes back around a snapshot');

    // ABA on the counter itself: before 2, up to 4 while the file is being read, back to 2
    // by the time the second reading is taken. Equal endpoints, equal records, and an
    // evening rewritten in between.
    const disk = sharedStore({ 'scheduleData:v2': schedule({ '2026-08-03': day('p_01') }) });
    const now = makeDevice({ sharedStorage: disk, deviceId: 'd_now' });
    // A record the rescue file carries: the counter only moves for those, by design.
    now.Store.set('scheduleData:v2', schedule({ '2026-08-03': day('p_01') }));

    // Another TAB writes the record and puts it back, between the snapshot's two readings.
    // The bytes are identical at both ends, so comparing records sees nothing, and the
    // shared counter is identical at both ends too because it was read-modify-written up
    // and then set back. What survives this is the other tab's OWN counter, which only
    // that tab writes and which only ever goes up.
    const other = makeDevice({ sharedStorage: disk, deviceId: 'd_other' });
    const original = String(disk.getItem('scheduleData:v2'));
    const shared = now.Store.readWriteTick();
    // On EVERY reading, not one. rawSnapshot retries up to five times and returns as soon
    // as it finds a quiet pass - which is right, and means a single perturbation proves
    // nothing: the second attempt would be quiet and the file would be stable, correctly.
    // The scenario is a tab that is actively working while somebody exports, so it writes
    // through all of them.
    onReadOf(disk, 'scheduleData:v2', 40, () => {
        other.Store.set('scheduleData:v2',
            schedule({ '2026-08-03': day('p_01'), '2026-08-04': day('p_01') }));
        other.Store.set('scheduleData:v2', original);
        disk.setItem('farkad:writeTick', String(shared));
    });
    const snapshot = now.global('Recovery').rawSnapshot();

    given('the record was rewritten and put back, byte for byte',
        String(disk.getItem('scheduleData:v2')) === original,
        'both readings of the record are identical');
    given('and the shared counter reads the same at both ends',
        now.Store.readWriteTick() === shared, `${shared} -> ${now.Store.readWriteTick()}`);
    check('a disk that was written under the snapshot is not a quiet moment',
        snapshot.stable !== true, `stable=${snapshot.stable}`);
}

{
    suite('a disk with room for the record but not for the evidence');

    // The schedule write succeeds; the counter write and the broken mark are both refused.
    // The tab that hit it knows in memory. Another tab - the one doing the export - has
    // nothing on the disk to read, and says the file is one quiet moment.
    const disk = sharedStore({});
    const writer = makeDevice({ sharedStorage: disk, deviceId: 'd_w' });
    writer.Store.set('scheduleData:v2', schedule({}));
    const exporter = makeDevice({ sharedStorage: disk, deviceId: 'd_x' });

    // Every key the fence writes: the shared counter, this tab's own counter, and the
    // broken mark itself. The record has room; its evidence does not.
    disk.__quota = key => String(key).indexOf('farkad:writeTick') === 0;
    writer.Store.set('scheduleData:v2', schedule({ '2026-08-08': day('p_01') }));

    given('the record landed while its evidence did not',
        JSON.parse(disk.getItem('scheduleData:v2')).days['2026-08-08'] !== undefined
        && disk.getItem('farkad:writeTick:broken') === null,
        `broken=${JSON.stringify(disk.getItem('farkad:writeTick:broken'))}`);
    check('the tab that could not store its evidence knows',
        writer.Store.fenceBroken() === true);
    check('and while the disk refuses the evidence, no tab claims a quiet moment either',
        exporter.global('Recovery').rawSnapshot().stable !== true,
        'the exporting tab cannot prove its own fence while the disk is refusing it');

    // The phone does not stop after one edit. The next write - once an archive or a
    // cleared quarantine has made room - carries the mark that could not be stored
    // earlier, because the reason was held in memory and re-offered rather than dropped.
    disk.__quota = null;
    writer.Store.set('scheduleData:v2', schedule({ '2026-08-09': day('p_01') }));
    check('the mark that could not be stored is written the moment there is room',
        disk.getItem('farkad:writeTick:broken') !== null,
        `broken=${JSON.stringify(disk.getItem('farkad:writeTick:broken'))}`);
    check('and then every other tab can see it, which is why it is written down at all',
        exporter.Store.fenceBroken() === true,
        `exporter.fenceBroken=${exporter.Store.fenceBroken()}`);
}

{
    suite('the counter at the top of what a number can hold');

    const disk = sharedStore({ 'farkad:writeTick': String(Number.MAX_SAFE_INTEGER) });
    const device = makeDevice({ sharedStorage: disk, deviceId: 'd_max' });
    device.Store.set('scheduleData:v2', schedule({}));

    const stored = disk.getItem('farkad:writeTick');
    check('the counter never stores a value it cannot read back as an integer',
        /^[0-9]+$/.test(String(stored)) && Number.isSafeInteger(Number(stored)),
        `stored=${JSON.stringify(stored)}`);
    check('and the fence still works afterwards rather than freezing for good',
        device.Store.readWriteTick() !== null,
        `readWriteTick=${device.Store.readWriteTick()}`);
}

{
    suite('choosing between two readings of a damaged disk');

    // Two captures of one phone, neither a superset of the other:
    //
    //   A  the schedule record holding the 1st and the 2nd
    //   B  the schedule record holding the 1st, and the durable queue holding the 3rd
    //
    // Replayed, B yields the 1st and the 3rd. A yields the 1st and the 2nd. Nobody can
    // pick between them by counting, and the current rule counts: days in the schedule
    // record times a thousand, plus the number of records. A scores 2000-odd, B scores
    // 1000-odd, A wins, and the 3rd - an evening somebody worked - is silently gone from
    // the file the whole exercise exists to produce.
    //
    // The queue is not a lesser kind of evidence. It is the edits this phone made and had
    // not yet folded in, which on a phone being rescued is exactly the part that is not
    // anywhere else.
    const device = makeDevice({ deviceId: 'd_pick' });
    const share = device.ctx;
    device.Store.set('scheduleData:v2', schedule({ '2026-08-01': day('p_01') }));
    device.State.load();

    // A real queued edit, made the way one is made: the 3rd is recorded while there is
    // nowhere to send it, so it lives in the durable queue and not yet in the schedule
    // record. That is the state a phone being rescued is actually in.
    device.State.commit(device.call('assignPlace',
        device.State.schedule, '2026-08-03', 'w_01', 'actual', 'p_01'));

    // A capture taken MID-COMMIT: the queue record had landed, the schedule record had
    // not yet been read back. That is not a contrivance - it is what a reading of a disk
    // being written looks like, and it is the reason the rescue file carries several.
    const B = device.global('Recovery').rawRecords();
    const queueKeys = Object.keys(B).filter(key => device.Sync.isQueueKey(key));
    B['scheduleData:v2'] = schedule({ '2026-08-01': day('p_01') });
    given('one capture holds the third of August only in its queue',
        queueKeys.length > 0
        && !Object.keys(JSON.parse(B['scheduleData:v2']).days).includes('2026-08-03'),
        `queue keys: ${queueKeys.join(' ')}`);

    // The other capture is the same phone read a moment earlier or later: its schedule
    // record has the 1st and the 2nd, and its queue has already been folded away. Neither
    // reading contains the other.
    const A = Object.assign({}, B);
    queueKeys.forEach(key => { delete A[key]; });
    A['scheduleData:v2'] = schedule({ '2026-08-01': day('p_01'), '2026-08-02': day('p_01') });

    const chosen = share.dominantRecovery(A, [A, B], null);
    const daysIn = records => {
        try { return Object.keys(JSON.parse(records['scheduleData:v2']).days || {}).sort(); }
        catch (error) { return []; }
    };
    const queued = records =>
        Object.keys(records).filter(key => device.Sync.isQueueKey(key)).length;

    given('neither capture contains the other',
        daysIn(A).join() !== daysIn(B).join() && queued(A) === 0 && queued(B) > 0,
        `A ${daysIn(A).join()} +${queued(A)} queued / B ${daysIn(B).join()} +${queued(B)} queued`);

    const picked = chosen.records;
    const accountsForBoth = picked
        && daysIn(picked).includes('2026-08-01')
        && daysIn(picked).includes('2026-08-02')
        && queued(picked) > 0;
    check('an incomparable pair is not resolved by a score that ignores the queue',
        chosen.asked === true || accountsForBoth,
        chosen.asked
            ? 'the person is asked'
            : `chose the one holding ${daysIn(picked).join()} and ${queued(picked)} queued `
                + 'edits; the third of August is in the other one and is now in no file at all');
    check('and when it cannot be settled, every reading is kept to choose between',
        chosen.asked !== true || chosen.candidates.length === 2,
        `asked=${chosen.asked} candidates=${(chosen.candidates || []).length}`);
}

{
    suite('what the export says about a payload it has already called unstable');

    // The file records `stable: snapshot.stable && evidence.stable && readable` - the
    // whole payload. The sentence the person reads is chosen from `snapshot.stable`
    // alone. So a payload the file itself marks unstable is announced with the ordinary
    // healthy title, and the one moment the app has to say "this file was taken while
    // something was changing" goes by in silence.
    const disk = sharedStore({ 'scheduleData:v2': schedule({ '2026-08-03': day('p_01') }) });
    const device = makeDevice({ sharedStorage: disk, deviceId: 'd_say' });
    device.Store.set('scheduleData:v2', schedule({ '2026-08-03': day('p_01') }));

    const said = [];
    device.ctx.askTell = message => { said.push(message); };

    // The FIRST snapshot is taken across a change; the second is quiet. That is the
    // ordinary shape of it: the disk settles while the export is being assembled.
    let calls = 0;
    const realSnapshot = device.global('Recovery').rawSnapshot;
    device.global('Recovery').rawSnapshot = function () {
        calls += 1;
        const out = realSnapshot.call(this);
        if (calls === 1) out.stable = false;
        return out;
    };

    device.ctx.exportRecoveryData();
    const file = JSON.parse(device.downloads[device.downloads.length - 1].text);

    given('the export ran and the file marks itself unstable',
        file.kind === 'farkad-recovery' && file.stable === false,
        `stable=${file.stable}`);
    given('something was said to the person', said.length === 1, String(said.length));
    check('the sentence the person reads matches the file they were handed',
        said[0].title !== 'הקובץ נמסר לדפדפן',
        `file says stable=${file.stable}, the person was told: "${said[0].title}"`);
}

report();
