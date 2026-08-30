// The ledger is append-only, and the boot path deletes it.
//
//   node tests/money.history.test.mjs
//
// Iron law 1 says ledger entries are never edited and never deleted. Iron law 10 says
// nothing unreadable is ever deleted, overwritten or treated as empty. This file measures
// the boot path against both, and at the commit it was written it fails.
//
// The shape of the loss, in order, all of it inside one State.load():
//
//   1. scheduleData:v2 is read. Its bytes hold the only copy of a ledger entry that this
//      build cannot use - one with no advanceId, which nothing shipped can mint, and which
//      arrives from a partial sync write, a truncated merge, a newer build or a restore.
//   2. storedScheduleProblems() says the record is clean. It checks workers, places, days
//      and advances. It has never looked at the ledger at all.
//   3. normaliseSchedule() copies every entry EXCEPT that one. Its own comment says the
//      entry is "DROPPED from the fold" - but the object it is building IS State.schedule,
//      which is what save() serialises. The drop is from the record.
//   4. migrateLedger() mints the mirror entry for the legacy advance and calls save().
//   5. The only copy of the entry is gone from the disk. No quarantine. Writes are not
//      blocked. ledgerParity() reports that everything agrees, because its orphan pass
//      walks the already-normalised ledger and is blind to what was removed before it.
//
// And two things that make it worse than the walk above suggests:
//
//   - The rescue export cannot recover it either. Recovery.rawRecords() reads the disk,
//      and by the time anybody presses the button the disk has been overwritten.
//   - The same boot enqueues an outbox operation for the minted entry while
//      LEDGER_WRITES is false, so a phone with a signal publishes the migration on the
//      same boot on which it destroyed the entry.
//
// migrateLedger is not the only trigger; it is the unattended one. With no legacy advance
// to mirror, the entry survives the boot - and then the first ordinary edit saves the
// normalised schedule and destroys it anyway. Both are measured below.

import { makeDevice } from './harness.mjs';
import { suite, check, given, report } from './runner.mjs';

const V2 = 'scheduleData:v2';

const WORKER = { id: 'w_1', name: 'יוסף', active: true, dailyRate: 400, hourlyRate: 50 };
const PLACE = { id: 'p_1', name: 'אתר א', active: true };

// An entry this build cannot mint and cannot read: no advanceId. It is the only copy of
// somebody's correction - three hundred shekels, said once.
const ORPHAN = {
    id: 'le_bad',
    kind: 'corrected',
    workerId: 'w_1',
    date: '2026-08-03',
    amount: 300,
    note: 'תוקן ל-300',
    at: '2026-08-12T10:00:00.000Z',
    by: 'd_phone2'
};

function staged(extra) {
    return Object.assign({
        schemaVersion: 2,
        workers: [Object.assign({}, WORKER)],
        places: [Object.assign({}, PLACE)],
        days: {},
        advances: {},
        ledger: { advances: { le_bad: Object.assign({}, ORPHAN) } },
        updatedAt: '2026-08-12T10:00:00.000Z',
        updatedBy: 'd_phone2'
    }, extra || {});
}

const LEGACY_ADVANCE = {
    a_1: { id: 'a_1', workerId: 'w_1', date: '2026-08-03', amount: 500, note: 'מזומן' }
};

const holdsOrphan = text => String(text).includes('le_bad');

// ============================================================ the unattended loss
{
    suite('a boot that mirrors a legacy advance over the only copy of a ledger entry');

    const disk = { [V2]: JSON.stringify(staged({ advances: LEGACY_ADVANCE })) };
    const device = makeDevice({ storage: disk });

    given('the disk holds the only copy of the entry', holdsOrphan(device.raw(V2)));
    given('and a legacy advance for the mirror to act on',
        JSON.parse(device.raw(V2)).advances.a_1 !== undefined);

    const loaded = device.State.load();
    const after = device.raw(V2);

    // What the app believed about the record it had just read.
    check('a record holding an unreadable ledger entry is not reported as clean',
        device.call('storedScheduleProblems', staged({ advances: LEGACY_ADVANCE })).length > 0,
        JSON.stringify(device.call('storedScheduleProblems', staged({ advances: LEGACY_ADVANCE }))));

    // The claim that matters, and it is about bytes.
    check('the only copy of a ledger entry is still on the disk after a boot',
        holdsOrphan(after),
        `load() -> ${JSON.stringify(loaded)}; the entry is ${holdsOrphan(after) ? 'there' : 'gone'}`);

    check('or it was quarantined and writing was blocked, which is the other allowed answer',
        holdsOrphan(after)
        || (Object.keys(device.dump()).some(key => key.indexOf('damaged') !== -1)
            && device.call('farkadWritesBlocked') === true),
        `quarantine keys ${JSON.stringify(Object.keys(device.dump()).filter(k => k.indexOf('damaged') !== -1))}, `
        + `writes blocked ${device.call('farkadWritesBlocked')}`);

    // A rescue export reads the disk. If the disk has already been overwritten there is
    // nothing left for the file to carry, which is the one door this app promises stays
    // open when everything else has failed.
    const rescue = device.global('Recovery').rawRecords();
    check('and the rescue export can still find it',
        holdsOrphan(JSON.stringify(rescue)),
        `records: ${Object.keys(rescue).join(', ')}`);

    // The settings screen's own health check, over the same record.
    const parity = device.State.ledgerParity();
    check('the parity check does not bless a ledger an entry was removed from',
        holdsOrphan(after) || parity.agrees === false,
        JSON.stringify(parity));

    // The gate is closed, and the boot mirror is the one sanctioned write. What it must
    // not do is publish a migration on the same boot it destroyed evidence.
    const queued = Object.keys(device.dump())
        .filter(key => device.Sync.isQueueKey(key))
        .map(key => String(device.raw(key)))
        .join(' ');
    check('nothing is queued for the cloud while a ledger entry is being lost locally',
        holdsOrphan(after) || !queued.includes('ledger.advances.'),
        `ledger writes enabled: ${device.call('ledgerWritesEnabled')}; `
        + `queued ledger paths: ${queued.includes('ledger.advances.') ? 'yes' : 'no'}`);
}

// ============================================================ the deferred loss
{
    suite('the same entry, with no legacy advance, destroyed by the first ordinary edit');

    const disk = { [V2]: JSON.stringify(staged()) };
    const device = makeDevice({ storage: disk });
    device.State.load();

    given('with nothing to mirror, the boot leaves the entry alone',
        holdsOrphan(device.raw(V2)), 'the entry survived load()');

    // One tap. Not a ledger operation, not an advance - a day of work.
    device.State.commit(device.call('assignPlace',
        device.State.schedule, '2026-08-05', 'w_1', 'actual', 'p_1'));

    check('an ordinary day edit does not delete a ledger entry it never touched',
        holdsOrphan(device.raw(V2)),
        `the entry is ${holdsOrphan(device.raw(V2)) ? 'there' : 'gone'} after one assignment`);
}

// ============================================================ what may still be dropped
{
    suite('the entries this build can read are unchanged by all of the above');

    const good = {
        le_ok: {
            id: 'le_ok', advanceId: 'a_1', kind: 'given', workerId: 'w_1',
            date: '2026-08-03', amount: 500, note: 'מזומן',
            at: '2026-08-12T10:00:00.000Z', by: 'd_phone2'
        }
    };
    const disk = {
        [V2]: JSON.stringify(staged({
            advances: LEGACY_ADVANCE,
            ledger: { advances: good }
        }))
    };
    const device = makeDevice({ storage: disk });
    const loaded = device.State.load();

    check('a readable ledger survives the boot untouched',
        String(device.raw(V2)).includes('le_ok'), JSON.stringify(loaded));
    check('and the record is not put into recovery for being ordinary',
        device.call('farkadWritesBlocked') === false
        && device.call('storedScheduleProblems',
            JSON.parse(device.raw(V2))).length === 0,
        `blocked ${device.call('farkadWritesBlocked')}`);
}

report();
