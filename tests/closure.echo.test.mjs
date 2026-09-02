// A ledger entry is the same fact as its own wire copy - and the phone that closed a
// fortnight is not held when its own closure comes back to it beside another phone's write.
//
//   node tests/closure.echo.test.mjs
//
// Found by tests/money.concurrency.test.mjs («an interleaved storm») going red once inside
// a release gate on a loaded machine - 43 of 50, all seven in that one suite - and green in
// nine isolated runs of the same commit. The closing phone ended 'error', blocked by
// Recovery under 'scheduleData:v2:ledger:conflict', with ledger.conflicted naming its OWN
// two closure entries and ledger.unreadable empty; the other phone said synced. On the
// reopen the persisted conflicted map held the phone again, and the boot mirror never ran.
//
// No race is needed to reach it. closureFacts built days[].entries[] with `rate: undefined`
// and `hours: undefined` as OWN keys; appendLedgerEntry dropped undefined at the top level
// and nowhere below it; so the schedule held the closure WITH those keys while the outbox,
// the disk and the wire held its JSON form, which has none. sameLedgerBytes rendered an own
// undefined key through JSON.stringify - the text `"rate":undefined` - and sameLedgerFact
// copied the key across too. One id, two bodies, on the phone that wrote it, from nothing
// but its own entry compared against its own echo.
//
// Which ordering shows it: the closure LANDS FIRST. The closer's own echo is skipped -
// updatedAt and updatedBy match - so its live objects are never replaced, and the next
// non-echo snapshot, the other phone's rebased write, carries the closure back into
// mergeLedgerInto beside the object closureFacts built. When the OTHER phone lands first
// the closer's write is refused, it adopts the snapshot, and reapplyPending puts the
// outbox's JSON-parsed copy over the live object - which is why the storm passed most of
// the time and failed 4 runs in 28 under load. The emulator decides that order; the fake
// cloud below is told it, so this is deterministic and needs no Java.
//
// Three claims. Every entry any writer produces compares equal to its own JSON round-trip
// - the closure and the deduction, the origin the mirror writes, an advance, a repayment,
// a correction, a carry approval - through both comparators the merge and the pre-send
// gate ask, and holds no own key whose value is undefined anywhere inside it. Two phones
// with the closure landing first converge with nobody held, on the phone and on its disk.
// And the other order still does.

import { makeDevice, makeCloud, settle, settleUntil } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const WORKERS = [{ id: 'w_01', name: 'עומר סעד', active: true, dailyRate: 500, hourlyRate: 50 }];
const PLACES = [{ id: 'p_01', name: 'הרצליה', active: true }];
const A = { from: '2026-08-07', to: '2026-08-20' };
const ADVANCE = 'a_omer';
const day = extra => ({ actual: { w_01: { entries: [Object.assign({ placeId: 'p_01' }, extra || {})],
    rates: { daily: 500, hourly: 50 } } } });

// The emulator suite's seed, with the carry approval ALREADY on the record. Against the
// fake cloud a second phone hears the first's approval before its own flush and holds
// its own copy as contested at the pre-send gate - a separate matter, not this one - so
// the only ledger writes in play here are the ones the storm makes.
const APPROVAL = { id: 'cm_carry', kind: 'carry', rows: 1, at: '2026-08-26T08:00:00.000Z', by: 'd_seed' };
const SEED = (options = {}) => ({
    schemaVersion: 2,
    workers: WORKERS.map(w => ({ ...w })),
    places: PLACES.map(p => ({ ...p })),
    days: {
        '2026-08-07': day(), '2026-08-10': day(), '2026-08-11': day(), '2026-08-12': day(),
        '2026-08-13': day(), '2026-08-14': day({ extraHours: 1 })
    },
    advances: { [ADVANCE]: { id: ADVANCE, workerId: 'w_01', date: '2026-08-10', amount: 5000, note: '' } },
    ledger: {
        advances: {
            ['le_mig_' + ADVANCE]: { id: 'le_mig_' + ADVANCE, advanceId: ADVANCE, kind: 'given',
                workerId: 'w_01', date: '2026-08-10', amount: 5000, note: '', at: '', by: 'd_seed',
                origin: 'migration' }
        },
        migrations: options.approved === false ? {} : { cm_carry: { ...APPROVAL } },
        unreadable: {}
    },
    updatedAt: '2026-08-15T18:00:00.000Z', updatedBy: 'd_seed',
    protocol: 1, revision: 1, lastOpId: 'op_seed'
});

function phone(id, cloud, options) {
    const device = makeDevice({ deviceId: id, flags: { carryAdvances: true, ledgerWrites: true } });
    device.Sync.pushDelayMs = 5;
    device.setToday('2026-08-26');
    device.ctx.askTell = () => Promise.resolve();
    const seed = SEED(options);
    device.State.schedule.workers = seed.workers;
    device.State.schedule.places = seed.places;
    device.State.schedule.days = seed.days;
    device.State.schedule.advances = seed.advances;
    device.State.schedule.ledger = seed.ledger;
    device.State.save({ silent: true });
    if (cloud) device.Sync.connect(cloud.adapter);
    return device;
}

// Every own key holding `undefined`, anywhere inside a value, as dotted paths. This is
// the thing JSON cannot carry and a comparator must therefore not see.
const undefinedKeys = (value, at, out) => {
    if (value && typeof value === 'object') {
        Object.keys(value).forEach(key => {
            if (value[key] === undefined) out.push(at + '.' + key);
            else undefinedKeys(value[key], at + '.' + key, out);
        });
    }
    return out;
};
const wireCopy = value => JSON.parse(JSON.stringify(value));

// CANONICAL, as the emulator suite compares: key order off the wire is not key order on
// the phone, and an `undefined` here is a `null` there.
const canonical = value => {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') {
        return '{' + Object.keys(value).sort()
            .map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
    }
    return JSON.stringify(value === undefined ? null : value);
};
const bodyOf = raw => canonical({ days: (raw || {}).days || {}, advances: (raw || {}).advances || {},
    workers: (raw || {}).workers || [], places: (raw || {}).places || [], ledger: (raw || {}).ledger || {} });
const entriesOf = raw => Object.values(((raw || {}).ledger || {}).advances || {});
const kindsOf = raw => entriesOf(raw).map(e => `${e.kind}:${e.amount}`).sort();
const recordOf = device => JSON.stringify([kindsOf(device.State.schedule),
    Object.keys(device.State.schedule.days || {}).sort()]);
const conflictedOn = device => Object.keys((device.State.schedule.ledger || {}).conflicted || {});
const unreadableOn = device => Object.keys((device.State.schedule.ledger || {}).unreadable || {});
const problemsOn = device => device.global('Recovery').problems.map(p => p.key);
const owed = device => device.Sync.physicalOperations().map(one => one.path).sort();
const moneyOn = device => JSON.stringify([
    device.call('advanceOutstanding', device.State.schedule, ADVANCE),
    device.call('advanceAccount', device.State.schedule, 'w_01', A.from, A.to)]);
const closureIds = ['le_close_a_omer_20260807', 'le_period_w_01_20260807'];
const holds = (raw, id) => Object.prototype.hasOwnProperty.call(((raw || {}).ledger || {}).advances || {}, id);

const reopenOf = (device, id) => {
    const made = makeDevice({ deviceId: id, storage: device.dump(),
        flags: { carryAdvances: true, ledgerWrites: true } });
    made.setToday('2026-08-26');
    made.ctx.askTell = () => Promise.resolve();
    made.State.load();
    return made;
};
async function bothSettled(a, b) {
    await settleUntil(() => a.Sync.pendingCount() === 0 && b.Sync.pendingCount() === 0
        && recordOf(a) === recordOf(b), 5000, 10);
    await settle(60);
}

// The storm's first half, exactly as the emulator suite runs it: A repays, B records a
// day and creates an advance, and both settle before anybody closes anything.
async function firstHalf(a, b) {
    const repay = a.call('recordAdvanceRepaid', a.State.schedule, ADVANCE, 400,
        '2026-08-18', '', '2026-08-20T09:00:00.000Z', a.id, 'cash');
    a.State.commit(repay);
    b.State.commit(b.call('assignPlace', b.State.schedule, '2026-08-18', 'w_01', 'actual', 'p_01'));
    const fresh = b.call('addAdvance', b.State.schedule, 'w_01', '2026-08-19', 700, '');
    b.State.commit(fresh);
    await bothSettled(a, b);
    given('the first half settled on both phones, both synced, neither held',
        recordOf(a) === recordOf(b) && a.Sync.status === 'synced' && b.Sync.status === 'synced'
        && a.call('farkadWritesBlocked') === false && b.call('farkadWritesBlocked') === false,
        JSON.stringify([recordOf(a), recordOf(b), a.Sync.status, b.Sync.status]));
    given('and B can see the repayment it is about to correct',
        Boolean(b.State.schedule.ledger.advances[repay.value.id]));
    return { repay, fresh };
}
const reverse = (b, repay) => b.State.commit(b.call('recordEventReversed', b.State.schedule,
    repay.value.id, 400, '2026-08-18', 'נרשם על האדם הלא נכון', '2026-08-21T09:00:00.000Z', b.id));
const close = a => a.State.commitMany(a.call('closePeriodChanges', a.State.schedule, 'w_01',
    A.from, A.to, '2026-08-20T18:00:00.000Z', a.id));

// What every phone has to be able to say after the storm, whichever order it landed in.
function converged(label, a, b, cloud, fresh) {
    check(`${label}: neither phone is holding work`,
        a.Sync.pendingCount() === 0 && b.Sync.pendingCount() === 0,
        `A ${a.Sync.pendingCount()} / B ${b.Sync.pendingCount()}`);
    check(`${label}: A says synced`, a.Sync.status === 'synced',
        `${a.Sync.status} — ${a.Sync.lastError && a.Sync.lastError.message}`);
    check(`${label}: and so does B`, b.Sync.status === 'synced',
        `${b.Sync.status} — ${b.Sync.lastError && b.Sync.lastError.message}`);
    check(`${label}: neither phone is refusing to write`,
        a.call('farkadWritesBlocked') === false && b.call('farkadWritesBlocked') === false,
        JSON.stringify([a.call('farkadWritesBlocked'), b.call('farkadWritesBlocked')]));
    same(`${label}: nothing is held as conflicted on A`, conflictedOn(a), []);
    same(`${label}: nor on B`, conflictedOn(b), []);
    same(`${label}: Recovery holds nothing on A`, problemsOn(a), []);
    same(`${label}: nor on B`, problemsOn(b), []);
    same(`${label}: nothing was held aside as unreadable on either`,
        [unreadableOn(a), unreadableOn(b)], [[], []]);
    check(`${label}: the two phones hold the same record, field for field`,
        bodyOf(a.State.schedule) === bodyOf(b.State.schedule),
        JSON.stringify([kindsOf(a.State.schedule), kindsOf(b.State.schedule)]));
    const readBack = a.call('normaliseSchedule', wireCopy(cloud.doc));
    check(`${label}: and it is the record the cloud holds`,
        bodyOf(readBack) === bodyOf(a.State.schedule),
        JSON.stringify([bodyOf(readBack).slice(0, 300), bodyOf(a.State.schedule).slice(0, 300)]));
    const kinds = entriesOf(cloud.doc).map(one => String(one.kind)).sort();
    check(`${label}: every event of the evening is on the record, once`,
        kinds.filter(one => one === 'repaid').length === 1
        && kinds.filter(one => one === 'reversed').length === 1
        && kinds.filter(one => one === 'deducted').length === 1
        && kinds.filter(one => one === 'closed').length === 1
        && kinds.filter(one => one === 'given').length === 1,
        JSON.stringify(kinds));
    check(`${label}: both phones read the same money out of it`, moneyOn(a) === moneyOn(b),
        JSON.stringify([moneyOn(a), moneyOn(b)]));
    // THE CLOSURE THE PHONE HOLDS is the closure it sent. The whole fault is one object
    // that says something JSON cannot say, so the live objects are asked directly.
    same(`${label}: the closure A holds in memory carries no key JSON would drop`,
        closureIds.map(id => undefinedKeys(a.State.schedule.ledger.advances[id], id, [])), [[], []]);
    check(`${label}: and it is, byte for byte, the closure on the cloud`,
        closureIds.every(id => a.call('sameLedgerBytes',
            a.State.schedule.ledger.advances[id], cloud.doc.ledger.advances[id]) === true),
        JSON.stringify(closureIds.map(id => [a.State.schedule.ledger.advances[id],
            cloud.doc.ledger.advances[id]])).slice(0, 400));

    // AND THE DISK. A conflicted map persisted with the schedule holds the phone at every
    // reopen from here on, the boot mirror is skipped while it stands, and the advance
    // created during the storm never gets its origin.
    check(`${label}: the conflicted map never reached A's disk`,
        String(a.raw('scheduleData:v2') || '').indexOf('"conflicted"') === -1);
    const againA = reopenOf(a, a.id + '_again');
    const againB = reopenOf(b, b.id + '_again');
    check(`${label}: a reopen of A is not held`, againA.call('farkadWritesBlocked') === false,
        JSON.stringify(problemsOn(againA)));
    same(`${label}: and holds nothing as conflicted`, conflictedOn(againA), []);
    same(`${label}: and Recovery holds nothing on it`, problemsOn(againA), []);
    check(`${label}: nor is a reopen of B held`, againB.call('farkadWritesBlocked') === false,
        JSON.stringify(problemsOn(againB)));
    const mirror = `ledger.advances.le_mig_${fresh.value.id}`;
    same(`${label}: each reopened phone owes the origin the boot mirror writes, and nothing else`,
        [owed(againA), owed(againB)], [[mirror], [mirror]]);
    check(`${label}: so the reopened record holds both advances' origins`,
        Object.keys(againA.State.schedule.ledger.advances)
            .filter(id => String(id).indexOf('le_mig_') === 0).length === 2,
        JSON.stringify(Object.keys(againA.State.schedule.ledger.advances)));
    check(`${label}: and a reopen of each reads the same money again`,
        moneyOn(againA) === moneyOn(a) && moneyOn(againB) === moneyOn(a),
        JSON.stringify([moneyOn(againA), moneyOn(againB), moneyOn(a)]));
}

// ============================================ every writer's entry, against its own wire copy
{
    suite('every ledger entry a phone writes is the same fact as its own wire copy');

    // Nothing here travels. The claim is about ONE object: the record a writer hands to
    // State.commit, which is the record the schedule then holds in memory, compared with
    // the record that comes back off the wire, the disk or the outbox - all three of which
    // are its JSON form. The fault is entirely in the difference between the two, and the
    // merge asks sameLedgerBytes first and sameLedgerFact second, so both are asked.
    const one = phone('d_unit', null, { approved: false });
    const AT = '2026-08-20T18:00:00.000Z';
    const written = [];
    const record = (name, change) => {
        given(`${name} was written`, Boolean(change && change.value && change.path), JSON.stringify(change));
        written.push({ name, change });
        return change;
    };

    const plan = one.call('planCarryMigration', one.State.schedule);
    given('the seed needs the carry approval, so the approval is a fresh write', plan.needed === true,
        JSON.stringify(plan));
    record('the carry approval', one.State.commit(one.call('recordCarryApproval',
        one.State.schedule, plan, AT, one.id)) && one.call('recordCarryApproval',
        one.State.schedule, plan, AT, one.id));
    // The origin the boot mirror writes for an advance that has none - a second advance,
    // planted the way a v79 phone would leave it.
    one.State.schedule.advances.a_two = { id: 'a_two', workerId: 'w_01', date: '2026-08-12', amount: 300, note: '' };
    const mirrored = one.call('migrateAdvancesToLedger', one.State.schedule, one.id);
    given('the mirror wrote exactly one origin', mirrored.added.length === 1
        && Object.keys(mirrored.paths).length === 1, JSON.stringify(mirrored));
    record('the origin the mirror writes', { path: Object.keys(mirrored.paths)[0],
        value: mirrored.paths[Object.keys(mirrored.paths)[0]] });
    const created = one.call('recordNewAdvance', one.State.schedule, 'w_01', '2026-08-19', 700, '', AT, one.id, 'cash');
    given('a new advance is two changes, the second its origin', created.length === 2
        && created[1] && created[1].value && created[1].value.kind === 'given', JSON.stringify(created));
    record('an advance created with its origin', created[1]);
    const repaid = record('a repayment', one.call('recordAdvanceRepaid', one.State.schedule,
        ADVANCE, 400, '2026-08-18', '', AT, one.id, 'cash'));
    record('a repayment that was not asked how', one.call('recordAdvanceRepaid', one.State.schedule,
        ADVANCE, 100, '2026-08-19', '', AT, one.id));
    record('a correction of a transaction', one.call('recordEventReversed', one.State.schedule,
        repaid.value.id, 400, '2026-08-18', 'נרשם על האדם הלא נכון', AT, one.id));
    record('a correction of an advance\'s note', one.call('recordAdvanceCorrected', one.State.schedule,
        ADVANCE, { note: 'מזומן' }, AT, one.id));
    const changes = one.call('closePeriodChanges', one.State.schedule, 'w_01', A.from, A.to, AT, one.id);
    given('the close writes the fortnight and the deduction', changes.length === 2
        && changes.map(c => c.value.kind).sort().join() === 'closed,deducted',
        JSON.stringify(changes.map(c => c && c.value && c.value.kind)));
    changes.forEach(change => record(`the closure's ${change.value.kind} entry`, change));

    written.forEach(({ name, change }) => {
        const mine = change.value;
        const wire = wireCopy(mine);
        const held = change.path.indexOf('ledger.migrations.') === 0
            ? one.State.schedule.ledger.migrations[mine.id]
            : one.State.schedule.ledger.advances[mine.id];
        given(`${name}: the schedule holds the very object the writer handed back`, held === mine);
        same(`${name}: holds no own key whose value is undefined, anywhere inside it`,
            undefinedKeys(mine, mine.id, []), []);
        check(`${name}: is the same fact as its own wire copy`,
            one.call('sameLedgerFact', mine, wire) === true && one.call('sameLedgerFact', wire, mine) === true);
        check(`${name}: and the same bytes`,
            one.call('sameLedgerBytes', mine, wire) === true && one.call('sameLedgerBytes', wire, mine) === true,
            JSON.stringify(Object.keys(mine)));
    });
    // AND THE COMPARATORS THEMSELVES, on the shape that broke them: a nested own key
    // holding undefined is not a byte, on either side, in either direction.
    const bare = { id: 'le_x', kind: 'closed', days: [{ date: '2026-08-10', entries: [{ placeId: 'p_01' }] }] };
    const laden = { id: 'le_x', kind: 'closed', days: [{ date: '2026-08-10',
        entries: [{ placeId: 'p_01', rate: undefined, hours: undefined }] }], note: undefined };
    check('sameLedgerBytes does not see a nested key JSON would drop',
        one.call('sameLedgerBytes', bare, laden) === true && one.call('sameLedgerBytes', laden, bare) === true);
    check('nor does sameLedgerFact',
        one.call('sameLedgerFact', bare, laden) === true && one.call('sameLedgerFact', laden, bare) === true);
    check('and neither is fooled into waving through a different value under that key',
        one.call('sameLedgerBytes', bare, { id: 'le_x', kind: 'closed', days: [{ date: '2026-08-10',
            entries: [{ placeId: 'p_01', hours: 1 }] }] }) === false
        && one.call('sameLedgerFact', bare, { id: 'le_x', kind: 'closed', days: [{ date: '2026-08-10',
            entries: [{ placeId: 'p_01', hours: 1 }] }] }) === false);
    check('a key holding null is still a byte, and still compared',
        one.call('sameLedgerBytes', bare, Object.assign({}, bare, { note: null })) === false);
}

// ======================================= the storm, the closure landing FIRST: the gate's red
{
    suite('the phone that closed a fortnight is not held when its closure comes back beside another write');

    const cloud = makeCloud({ doc: SEED() });
    const a = phone('d_storm_a', cloud);
    const b = phone('d_storm_b', cloud);
    await settleUntil(() => a.Sync.status === 'synced' && b.Sync.status === 'synced', 5000, 10);
    given('both phones are synced before anybody writes',
        a.Sync.status === 'synced' && b.Sync.status === 'synced', `${a.Sync.status} / ${b.Sync.status}`);
    const { repay, fresh } = await firstHalf(a, b);

    // A closes, and its write LANDS before anybody else moves. The loser-of-a-race path is
    // the one that hides the fault - reapplyPending rewrites the entry from the disk copy -
    // so the winner's path is the one being measured.
    close(a);
    await settleUntil(() => a.Sync.pendingCount() === 0
        && closureIds.every(id => holds(cloud.doc, id)), 5000, 10);
    given('A\'s closure landed on the cloud, first', closureIds.every(id => holds(cloud.doc, id)),
        JSON.stringify(Object.keys(cloud.doc.ledger.advances)));
    given('and A heard its own echo and is synced', a.Sync.pendingCount() === 0
        && a.Sync.status === 'synced' && a.call('farkadWritesBlocked') === false,
        `${a.Sync.status} blocked=${a.call('farkadWritesBlocked')}`);
    await settleUntil(() => closureIds.every(id => holds(b.State.schedule, id)), 5000, 10);
    given('and B heard it too', closureIds.every(id => holds(b.State.schedule, id)),
        JSON.stringify(Object.keys(b.State.schedule.ledger.advances)));
    const revisionAfterClose = cloud.doc.revision;

    // B corrects the repayment. Its snapshot is the first NON-ECHO snapshot A hears that
    // carries A's own closure back to it.
    reverse(b, repay);
    await bothSettled(a, b);
    check('B\'s correction landed one revision after the closure',
        cloud.doc.revision === revisionAfterClose + 1, `${revisionAfterClose} -> ${cloud.doc.revision}`);
    converged('closure first', a, b, cloud, fresh);
}

// ======================================= the same storm, the other order: still one record
{
    suite('and when the other phone lands first, the storm still converges');

    // The storm's usual order, and the one that hid the fault: B's correction is queued a
    // moment before A's closure, lands first, and A's closure - worked out BEFORE the
    // correction arrived, as one coherent evening has it - loses the race, is rebased
    // over B's document and lands second. reapplyPending puts the outbox's disk-parsed
    // copy of the closure over the object closureFacts built, which is why this order
    // never showed the two-bodies hold. It has to stay green all the same.
    const cloud = makeCloud({ doc: SEED() });
    const a = phone('d_ctl_a', cloud);
    const b = phone('d_ctl_b', cloud);
    await settleUntil(() => a.Sync.status === 'synced' && b.Sync.status === 'synced', 5000, 10);
    given('both phones are synced before anybody writes',
        a.Sync.status === 'synced' && b.Sync.status === 'synced', `${a.Sync.status} / ${b.Sync.status}`);
    const { repay, fresh } = await firstHalf(a, b);
    const landedBefore = cloud.writes.length;

    reverse(b, repay);
    close(a);
    await bothSettled(a, b);
    const landed = cloud.writes.slice(landedBefore)
        .map(one => Object.keys((one && (one.patch || one.data)) || {}).filter(key => key.indexOf('ledger.advances.') === 0));
    const first = landed.findIndex(keys => keys.indexOf('ledger.advances.le_rev_' + repay.value.id) !== -1);
    const second = landed.findIndex(keys => keys.indexOf('ledger.advances.le_close_a_omer_20260807') !== -1);
    check('B\'s correction landed first and A\'s closure after it',
        first !== -1 && second !== -1 && first < second, JSON.stringify(landed));
    converged('correction first', a, b, cloud, fresh);
}

report();
