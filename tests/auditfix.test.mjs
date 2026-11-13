// What a read-only audit of v192 found on the backup and restore doors, each one written
// down as the check that was red on v192 (origin/main ae6e1a0) before its repair.
//
//   node tests/auditfix.test.mjs
//
// Devices in Node (tests/harness.mjs): the real js/ files over a fake localStorage and a
// fake cloud. The half that needs a browser - the frame, the quick-start box, the two
// wa.me doors, the date a correction was written - is tests/auditfix.browser.mjs.

import { makeDevice, makeCloud, settle, settleUntil } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

function seed(device, extra) {
    const s = device.State.schedule;
    s.workers = [
        { id: 'w_01', name: 'דוגמה אלף', idNumber: '', phone: '', active: true, dailyRate: 500, hourlyRate: 60, payCycles: '' },
        { id: 'w_02', name: 'דוגמה בית', idNumber: '', phone: '', active: true, dailyRate: 400, hourlyRate: 50, payCycles: '' }];
    s.places = [{ id: 'p_01', name: 'אתר צפון', active: true }, { id: 'p_02', name: 'אתר דרום', active: true }];
    if (extra) extra(s);
    given('the seeded record is kept', device.State.save({ silent: true }));
}

// Every dialog answered yes, and every sentence said kept.
function dialogs(device) {
    const said = [];
    device.ctx.askTell = message => {
        said.push(typeof message === 'string' ? message : `${message.title} | ${message.message}`);
        return Promise.resolve();
    };
    device.ctx.askConfirm = () => Promise.resolve(true);
    return said;
}

const daysOf = device => JSON.stringify(device.State.schedule.days);
const stackOf = device => JSON.parse(device.raw('scheduleData:undoStack') || '[]');
const holds = (device, days) => stackOf(device)
    .some(entry => JSON.stringify(JSON.parse(entry.schedule).days) === days);
const slotIs = (device, days) => {
    const slot = device.raw('scheduleData:v2backup');
    return slot ? JSON.stringify(JSON.parse(slot).days) === days : null;
};
const assign = (device, date, worker, place) => given(`a day is recorded (${date} ${worker})`,
    device.State.commit(device.call('assignPlace', device.State.schedule, date, worker, 'actual', place, 'normal', 0)));

// ---------------------------------------------------------------------------------------
// 1. «לשחזר את המצב שלפני הטעינה האחרונה» and the way back from it.
//
// State A is on the stack, the evening is recorded on top of it (state B), and the button
// is pressed. Whatever replaceEverything answers, ONE thing has to hold afterwards: when
// the record on this phone is A, the stack still holds B - the only copy of the evening.
// v192 asked `result.ok` and nothing else, so with no signal (stage 'cloud': A already on
// the disk, not yet in the cloud) it took B off the stack and the slot and kept A, the
// state already on screen.
// ---------------------------------------------------------------------------------------
async function wayBack(label, arrange) {
    const cloud = makeCloud();
    const device = makeDevice({ deviceId: `d_${label}` });
    device.setToday('2026-11-13');
    const said = dialogs(device);
    device.Sync.pushDelayMs = 5;
    seed(device);
    device.Sync.connect(cloud.adapter);
    await settleUntil(() => device.Sync.status === 'synced', 3000);
    assign(device, '2026-11-12', 'w_01', 'p_01');
    await settleUntil(() => device.Sync.pendingCount() === 0, 3000);
    const A = daysOf(device);
    given('a way back to A is written', device.call('pushUndoState', device.State.schedule));
    assign(device, '2026-11-13', 'w_01', 'p_02');
    assign(device, '2026-11-13', 'w_02', 'p_02');
    await settleUntil(() => device.Sync.pendingCount() === 0, 3000);
    const B = daysOf(device);
    given('B is not A', A !== B);
    const stackBefore = device.raw('scheduleData:undoStack');
    arrange({ cloud, device });
    await device.call('restoreLocalBackup');
    await settle(60);
    return { device, said, A, B, stackBefore };
}

suite('1. the way back from «לשחזר את המצב שלפני הטעינה האחרונה»');
{
    const online = await wayBack('online', () => {});
    check('control, the cloud answering: the record is A and it says «שוחזר.»',
        daysOf(online.device) === online.A && online.said[online.said.length - 1] === 'שוחזר.',
        JSON.stringify(online.said));
    check('control: the state just left (B) is the way back, on the stack and in the slot',
        holds(online.device, online.B) && slotIs(online.device, online.B) === true);
    check('control: and A, now on screen, is no longer offered as a way back',
        !holds(online.device, online.A));

    const offline = await wayBack('offline', ({ cloud }) => { cloud.online = false; });
    const last = offline.said[offline.said.length - 1] || '';
    given('no signal: the restore is on this phone (stage cloud), and that is what is said',
        daysOf(offline.device) === offline.A && last.includes('עדיין לא הגיע לענן'), last);
    check('no signal: the record is A, so the stack still holds B - the evening just left',
        holds(offline.device, offline.B), `${stackOf(offline.device).length} entries`);
    check('no signal: the single slot holds B too',
        slotIs(offline.device, offline.B) === true, String(slotIs(offline.device, offline.B)));
    check('no signal: A, already on screen, is not what the next press would "restore"',
        !holds(offline.device, offline.A));
    check('no signal: the sentence never says nothing changed',
        !last.includes('לא שינינו') && !last.includes('לא בוצע'), last);

    // A second press with the signal still gone walks BACK to B: nothing is lost in
    // either direction.
    await offline.device.call('restoreLocalBackup');
    await settle(60);
    check('no signal, pressed again: the evening is back on the record',
        daysOf(offline.device) === offline.B);

    // The schedule write refused: nothing was replaced, and the stack is what it was.
    const refused = await wayBack('refused', ({ device }) => {
        device.setQuota(key => key === 'scheduleData:v2');
    });
    const refusedSaid = refused.said[refused.said.length - 1] || '';
    given('a disk that refuses the record: the restore did not happen (and says so)',
        daysOf(refused.device) === refused.B && /לא בוצע|לא שינינו|לא נשמר/.test(refusedSaid), refusedSaid);
    check('a restore that did not happen leaves the stack exactly what it was',
        refused.device.raw('scheduleData:undoStack') === refused.stackBefore);
    check('and A is still the way back the next press reaches',
        refused.device.call('peekUndoState') !== null
        && JSON.stringify(JSON.parse(refused.device.call('peekUndoState')).days) === refused.A);
}

// ---------------------------------------------------------------------------------------
// 2. The daily pruning of restore points and one it cannot read (law 10).
//
// Three mornings, the oldest a cut-off write - the only bytes of that morning there are.
// On the fourth morning v192 removed whatever sorted oldest without reading it. The
// reclaim ladder in the same file steps over such a key; the pruning does the same now,
// and three READABLE restore points are what it keeps.
// ---------------------------------------------------------------------------------------
suite('2. the daily pruning steps over a restore point it cannot read');
{
    const SNAP = 'scheduleData:snap:';
    const snaps = device => Object.keys(device.dump()).filter(key => key.startsWith(SNAP))
        .map(key => key.slice(SNAP.length)).sort();
    const first = makeDevice({ deviceId: 'd_prune' });
    dialogs(first);
    seed(first);
    ['2026-11-10', '2026-11-11', '2026-11-12'].forEach(day => {
        first.setToday(day);
        first.call('takeDailySnapshot');
    });
    given('three mornings, three restore points', snaps(first).length === 3, snaps(first).join());
    const whole = first.raw(SNAP + '2026-11-10');
    const cut = whole.slice(0, Math.floor(whole.length * 0.7));
    first.putRaw(SNAP + '2026-11-10', cut);

    // The next morning is a fresh open of the same disk.
    const device = makeDevice({ deviceId: 'd_prune', storage: first.dump() });
    dialogs(device);
    device.setToday('2026-11-13');
    device.State.load();
    given('the cut-off restore point will not parse', (() => {
        try { JSON.parse(device.raw(SNAP + '2026-11-10')); return false; } catch (error) { return true; }
    })());
    device.call('takeDailySnapshot');
    check('the fourth morning is photographed', snaps(device).includes('2026-11-13'), snaps(device).join());
    check('the restore point that cannot be read is still on the phone, byte for byte',
        device.raw(SNAP + '2026-11-10') === cut, snaps(device).join());
    same('and the three readable ones are all kept',
        snaps(device).filter(day => day !== '2026-11-10'), ['2026-11-11', '2026-11-12', '2026-11-13']);

    // And it is still an album of three: a fifth morning drops the oldest READABLE one.
    device.setToday('2026-11-14');
    device.call('takeDailySnapshot');
    same('a fifth morning: the oldest readable one goes, the unreadable one stays',
        snaps(device), ['2026-11-10', '2026-11-12', '2026-11-13', '2026-11-14']);
    check('still byte for byte', device.raw(SNAP + '2026-11-10') === cut);

    // Control: with nothing damaged the album is the three newest, as it always was.
    const plain = makeDevice({ deviceId: 'd_prune_plain' });
    dialogs(plain);
    seed(plain);
    ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'].forEach(day => {
        plain.setToday(day);
        plain.call('takeDailySnapshot');
    });
    same('control, nothing damaged: the three newest', snaps(plain), ['2026-11-11', '2026-11-12', '2026-11-13']);
}

// ---------------------------------------------------------------------------------------
// 3. A backup file says nothing about the questions the migration left open - and loading
//    one wrote an EMPTY list over the ones this phone was holding.
//
// The file is the schedule and nothing else (its format is not changed here, so every
// build that loads a backup today loads this build's). A file that cannot speak for the
// questions leaves the phone's list alone - the rule restoreLocalBackup already keeps for
// a way back that predates them - and the list is written again against the record now
// on the disk, so the next open does not judge it stale.
// ---------------------------------------------------------------------------------------
suite('3. loading a backup file leaves the open migration questions standing');
{
    const ISSUE = { kind: 'unknown-place', value: 'אתר לא מזוהה', date: '2026-11-01',
        workerId: 'w_02', workerName: 'דוגמה בית', message: 'לא זוהה אתר' };

    const source = makeDevice({ deviceId: 'd_file' });
    source.setToday('2026-11-13');
    dialogs(source);
    seed(source);
    assign(source, '2026-11-12', 'w_01', 'p_01');
    source.call('exportBackup');
    const file = source.downloads[source.downloads.length - 1];
    given('a backup file was written', file && typeof file.text === 'string' && file.text.length > 100);
    same('the file is the schedule and carries no list of questions (format unchanged)',
        ['migrationIssues', 'issues', 'pendingDecisions'].filter(key => key in JSON.parse(file.text)), []);

    const device = makeDevice({ deviceId: 'd_asks' });
    device.setToday('2026-11-13');
    const said = dialogs(device);
    seed(device);
    device.State.migrationIssues = [ISSUE];
    given('a question is open and written down', device.call('writeIssues', [ISSUE]) === true);

    device.call('importBackup', device.fileEvent(file.name, file.text));
    await settle(80);
    given('the file was loaded', said.some(line => line.includes('הגיבוי נטען'))
        && JSON.stringify(device.State.schedule.days).includes('2026-11-12'), JSON.stringify(said));
    check('the question this phone was holding is still open after the load',
        device.State.migrationIssues.length === 1 && device.State.migrationIssues[0].value === ISSUE.value,
        JSON.stringify(device.State.migrationIssues));
    check('and it is on the disk, not an empty list',
        String(device.raw('scheduleData:migrationIssues')).includes(ISSUE.value),
        String(device.raw('scheduleData:migrationIssues')));
    const reopened = makeDevice({ deviceId: 'd_asks', storage: device.dump() });
    dialogs(reopened);
    reopened.State.load();
    check('and it is still there at the next open',
        reopened.State.migrationIssues.length === 1, JSON.stringify(reopened.State.migrationIssues));

    // Control: a phone with no question open has none after the load either.
    const quiet = makeDevice({ deviceId: 'd_quiet' });
    quiet.setToday('2026-11-13');
    dialogs(quiet);
    seed(quiet);
    quiet.call('importBackup', quiet.fileEvent(file.name, file.text));
    await settle(80);
    check('control: a phone with no question open has none after the load',
        quiet.State.migrationIssues.length === 0);

    // Control: the way back written by the load still carries the question, as before.
    check('control: the way back written by the load carries the question too',
        stackOf(device).some(entry => typeof entry.decisions === 'string' && entry.decisions.includes(ISSUE.value)));
}

// ---------------------------------------------------------------------------------------
// 6. A backup file has bounds, and one past them is REFUSED - whole, with a sentence, and
//    with nothing on the phone changed. Never cut down to fit.
//
// v192 asked a file nothing about its size: a 3,000,000-character name and a roster of
// five thousand were loaded after the ordinary confirm. The bounds are far above any crew
// (64 MB of file, 3,000 workers, 3,000 sites, a name of 300 characters). The Hebrew is
// PROPOSED and pinned here; the quick-start half is tests/auditfix.browser.mjs.
// ---------------------------------------------------------------------------------------
suite('6. a backup file past the bounds is refused, and nothing changes');
{
    const fileOf = change => {
        const source = makeDevice({ deviceId: 'd_big_source' });
        source.setToday('2026-11-13');
        dialogs(source);
        seed(source);
        assign(source, '2026-11-12', 'w_01', 'p_01');
        source.call('exportBackup');
        const parsed = JSON.parse(source.downloads[source.downloads.length - 1].text);
        change(parsed);
        return JSON.stringify(parsed);
    };
    const load = async (text, size) => {
        const device = makeDevice({ deviceId: 'd_big' });
        device.setToday('2026-11-13');
        const said = dialogs(device);
        seed(device, schedule => { schedule.workers[0].name = 'מי שהיה כאן'; });
        const before = JSON.stringify(device.dump());
        const event = device.fileEvent('backup.json', text);
        if (size !== undefined) event.target.files[0].size = size;
        device.call('importBackup', event);
        await settle(120);
        return { device, said, unchanged: JSON.stringify(device.dump()) === before,
            names: device.State.schedule.workers.map(worker => worker.name), event };
    };
    const HEAD = 'הקובץ לא נטען | הקובץ חורג ממה שפרקד מקבלת, ולכן לא נטען. הנתונים הקיימים לא השתנו.\n\n';

    const longName = await load(fileOf(file => { file.workers[0].name = 'א'.repeat(3000000); }));
    same('a worker name of 3,000,000 characters: refused, and the sentence says which bound',
        longName.said, [HEAD + 'שם של עובד באורך 3000000 תווים - יותר מ-300.']);
    check('and the phone is byte for byte what it was', longName.unchanged && longName.names[0] === 'מי שהיה כאן');
    check('and the file field is cleared, so the same file can be chosen again', longName.event.target.value === '');

    const longSite = await load(fileOf(file => { file.places[0].name = 'ב'.repeat(301); }));
    same('a site name of 301 characters: refused', longSite.said, [HEAD + 'שם של אתר באורך 301 תווים - יותר מ-300.']);
    check('nothing changed', longSite.unchanged);

    const crowd = await load(fileOf(file => {
        for (let at = 3; at <= 3001; at += 1) {
            file.workers.push({ id: `w_${String(at).padStart(4, '0')}`, name: `דוגמה ${at}`, idNumber: '', phone: '',
                active: true, dailyRate: 0, hourlyRate: 0, payCycles: '' });
        }
    }));
    same('3,001 workers: refused', crowd.said, [HEAD + '3001 עובדים בקובץ - יותר מ-3000.']);
    check('nothing changed', crowd.unchanged);

    const sites = await load(fileOf(file => {
        for (let at = 3; at <= 3001; at += 1) file.places.push({ id: `p_${String(at).padStart(4, '0')}`, name: `אתר ${at}`, active: true });
    }));
    same('3,001 sites: refused', sites.said, [HEAD + '3001 אתרים בקובץ - יותר מ-3000.']);
    check('nothing changed', sites.unchanged);

    const heavy = await load(fileOf(() => {}), 65 * 1024 * 1024);
    same('a file of 65 MB: refused before it is read',
        heavy.said, ['הקובץ לא נטען | הקובץ גדול מדי: 65 MB, יותר מ-64 MB. קובץ גיבוי של פרקד קטן מזה בהרבה, '
            + 'ולכן הוא לא נקרא. הנתונים הקיימים לא השתנו.']);
    check('nothing changed', heavy.unchanged && heavy.event.target.value === '');

    // Control: exactly at the bounds, and a big honest crew, load as they always did.
    const atBounds = await load(fileOf(file => {
        file.workers[0].name = 'א'.repeat(300);
        file.places[0].name = 'ב'.repeat(300);
        for (let at = 3; at <= 400; at += 1) {
            file.workers.push({ id: `w_${String(at).padStart(4, '0')}`, name: `דוגמה ${at}`, idNumber: '', phone: '',
                active: true, dailyRate: 0, hourlyRate: 0, payCycles: '' });
        }
    }), 64 * 1024 * 1024);
    check('control: 400 workers, names of exactly 300, a size of exactly 64 MB - loaded',
        atBounds.said.some(line => line.includes('הגיבוי נטען')) && atBounds.names.length === 400
        && atBounds.names[0].length === 300, JSON.stringify(atBounds.said).slice(0, 200));
}

report();
