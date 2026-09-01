// Two phones recording ONE fact under one deterministic id.
//
//   node tests/samefact.test.mjs
//
// Some records in this app are named after WHAT THEY ARE rather than by a random id: the
// carry approval is `cm_carry` because two phones approving the same plan must not write
// two approvals, and a period closure is `le_close_<advance>_<from>` for the same reason.
// recordCarryApproval says so in its own comment - "the second is the first, not a second
// approval" - and the model is right.
//
// The sync layer does not know that, and after the v91 repairs it stopped being able to
// find out.
//
// Two phones, both seeded, both approving the same migration. They write the same path
// with the same numbers and different `at` and `by`, because two different people pressed
// the button at two different moments. Measured against the real emulator at the merge
// commit, in tests/money.concurrency.test.mjs:
//
//     DIAG B status  : contested pending 1
//     DIAG B  farkad:outbox:hold:0mtig... = 1
//     DIAG B  ...ops":[{"path":"ledger.migrations.cm_carry", ...,"by":"d_b"}]
//
// The loser's approval is held on the disk FOR EVER. It is never sent, the phone never
// says synced, and the person is told there is a conflict about money - when both phones
// recorded the same approval of the same plan and nothing is in dispute at all.
//
// The same fault runs through the merge. mergeLedgerInto compares whole bytes, so one id
// arriving with a different `by` is "one immutable id with two different bodies" - which
// for a genuine disagreement about an amount is exactly right and is why that check
// exists, and here means both devices quarantine, block writing and stop.
//
// So there is ONE rule, in the model, for both: a record whose identity is deterministic
// is the SAME FACT when everything except who wrote it down and when agrees. The first
// writer's record stands - they did approve first - and the second phone's write is a
// no-op, not a conflict. Any difference in a FINANCIAL field is untouched by this and
// still holds, still quarantines, still stops the device.

import { makeDevice, makeCloud, settle, settleUntil } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const APPROVAL = by => ({ id: 'cm_carry', kind: 'carry', rows: 1,
    at: by === 'd_a' ? '2026-08-26T08:00:00.000Z' : '2026-08-26T08:00:07.000Z', by });

function phone(id, storage) {
    const device = makeDevice(storage
        ? { deviceId: id, storage, flags: { carryAdvances: true, ledgerWrites: true } }
        : { deviceId: id, flags: { carryAdvances: true, ledgerWrites: true } });
    device.Sync.pushDelayMs = 6;
    device.setToday('2026-08-26');
    device.ctx.askTell = () => Promise.resolve();
    if (storage) { device.State.load(); return device; }
    device.State.schedule.workers = [
        { id: 'w_01', name: 'עומר', active: true, dailyRate: 500, hourlyRate: 0 }];
    device.State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
    device.State.schedule.advances = { a_omer: { id: 'a_omer', workerId: 'w_01',
        date: '2026-08-10', amount: 5000, note: '' } };
    device.State.schedule.ledger = { advances: {}, unreadable: {},
        migrations: {}, unreadableMigrations: {} };
    device.State.save({ silent: true });
    return device;
}

// Through the real writer. State.commit persists a change the RECORDER has already
// applied to memory - a raw { path, value } commit returns true and leaves the schedule
// untouched, which is a fixture that measures nothing. recordCarryApproval is the
// function the button calls.
function approveOn(device, by, at) {
    const plan = device.call('planCarryMigration', device.State.schedule);
    if (!plan.needed) return null;
    const change = device.call('recordCarryApproval', device.State.schedule, plan,
        at, by);
    device.State.commit(change);
    return change;
}

// A phone that can write but cannot hear, so the race is a real one - the same gate
// tests/contested.test.mjs uses.
function tunnel(cloud) {
    const gate = { open: true, waiting: [], adapter: {} };
    Object.keys(cloud.adapter).forEach(name => {
        gate.adapter[name] = (...args) => cloud.adapter[name](...args);
    });
    gate.adapter.subscribe = (onNext, onError) => cloud.adapter.subscribe(
        snapshot => {
            if (gate.open) onNext(snapshot);
            else gate.waiting.push([onNext, snapshot]);
        }, onError);
    gate.close = () => { gate.open = false; };
    gate.release = () => {
        gate.open = true;
        const waiting = gate.waiting.slice();
        gate.waiting = [];
        waiting.forEach(([onNext, snapshot]) => onNext(snapshot));
    };
    return gate;
}

// ------------------------------------------------------------------ the model's own rule
{
    suite('one deterministic id, two signers, is one fact');

    const device = phone('d_rule');
    const mine = APPROVAL('d_a');
    const theirs = APPROVAL('d_b');
    given('the two records differ only in who wrote them and when',
        JSON.stringify(mine) !== JSON.stringify(theirs)
        && mine.rows === theirs.rows && mine.kind === theirs.kind,
        JSON.stringify([mine, theirs]));

    // Asked through a guard so a missing function REPORTS rather than throwing: at the
    // commit this suite was written for, neither exists, and a suite that dies on its
    // first line proves nothing about the fifteen checks under it.
    const defined = name => device.global(`typeof ${name} === 'function'`);
    const asks = (name, ...args) => (defined(name)
        ? device.call(name, ...args) : `${name} is not defined`);

    check('the model calls them the same fact',
        asks('sameLedgerFact', mine, theirs) === true,
        JSON.stringify(asks('sameLedgerFact', mine, theirs)));
    check('and a path carrying one is superseded by the other',
        asks('ledgerPathSupersededBy',
            'ledger.migrations.cm_carry', mine, theirs) === true,
        JSON.stringify(asks('ledgerPathSupersededBy',
            'ledger.migrations.cm_carry', mine, theirs)));

    // AND A REAL DISAGREEMENT IS STILL A REAL DISAGREEMENT. This is the whole reason the
    // check is on the FINANCIAL fields rather than on the id.
    const different = Object.assign(APPROVAL('d_b'), { rows: 9 });
    check('a different number of rows is not the same fact',
        asks('sameLedgerFact', mine, different) === false,
        JSON.stringify(asks('sameLedgerFact', mine, different)));
    const money = { id: 'le_1', advanceId: 'a_omer', kind: 'repaid', workerId: 'w_01',
        date: '2026-08-24', amount: 500, at: 'x', by: 'd_a' };
    check('nor is a different amount',
        asks('sameLedgerFact', money,
            Object.assign({}, money, { amount: 900, by: 'd_b' })) === false);
    check('while the same amount from another hand is',
        asks('sameLedgerFact', money,
            Object.assign({}, money, { at: 'y', by: 'd_b' })) === true,
        JSON.stringify(asks('sameLedgerFact', money,
            Object.assign({}, money, { at: 'y', by: 'd_b' }))));
    check('and a path this rule does not own is never superseded',
        asks('ledgerPathSupersededBy',
            'days.2026-08-12.actual.w_01', { a: 1 }, { a: 1 }) === false,
        JSON.stringify(asks('ledgerPathSupersededBy',
            'days.2026-08-12.actual.w_01', { a: 1 }, { a: 1 })));
}

// ----------------------------------------------------------- the merge does not quarantine
{
    suite('the same approval from two phones is not a conflict');

    const device = phone('d_merge');
    approveOn(device, 'd_a', '2026-08-26T08:00:00.000Z');
    given('the approval is on this phone',
        Object.keys(device.State.schedule.ledger.migrations).length === 1,
        JSON.stringify(device.State.schedule.ledger.migrations));
    const arriving = JSON.parse(JSON.stringify(device.State.schedule));
    arriving.ledger.migrations.cm_carry = APPROVAL('d_b');
    arriving.updatedAt = '2026-08-26T10:00:00.000Z';
    arriving.updatedBy = 'd_b';
    given('the arriving copy really is the other phone\'s',
        JSON.stringify(arriving.ledger.migrations.cm_carry)
            !== JSON.stringify(device.State.schedule.ledger.migrations.cm_carry));

    device.Sync.receive(arriving);
    await settle(30);

    check('there is exactly one approval', Object.keys(
        device.State.schedule.ledger.migrations).length === 1,
        JSON.stringify(device.State.schedule.ledger.migrations));
    // WHICH COPY STANDS is the merge's own answer, asked of the merge. Through receive()
    // the local write is still queued and unsent, and reapplyPending correctly puts it
    // back on top - losing somebody's unsent edit to an arriving snapshot is a different
    // fault entirely. The race suite below settles it end to end.
    const merged = device.call('mergeLedgerInto',
        JSON.parse(JSON.stringify(arriving)), device.State.schedule, []);
    check('the merge keeps the copy that got there first',
        merged.ledger.migrations.cm_carry.by === 'd_b',
        JSON.stringify(merged.ledger.migrations.cm_carry));
    check('nothing was held aside',
        JSON.stringify(device.State.schedule.ledger.conflicted || {}) === '{}',
        JSON.stringify(device.State.schedule.ledger.conflicted));
    check('the person is not told there is a problem',
        device.global('Recovery').problems.length === 0,
        JSON.stringify(device.global('Recovery').problems.map(p => p.key)));
    check('and the device is still writing',
        device.call('farkadWritesBlocked') === false);
    check('the gate is settled, once', device.call('carryMigrationSettled',
        device.State.schedule) === true);
}

// ------------------------------------------------- and a real disagreement still stops it
{
    suite('an approval of a DIFFERENT plan is still a disagreement');

    const device = phone('d_clash');
    approveOn(device, 'd_a', '2026-08-26T08:00:00.000Z');
    const arriving = JSON.parse(JSON.stringify(device.State.schedule));
    arriving.ledger.migrations.cm_carry = Object.assign(APPROVAL('d_b'), { rows: 9 });
    arriving.updatedAt = '2026-08-26T10:00:00.000Z';
    arriving.updatedBy = 'd_b';
    device.Sync.receive(arriving);
    await settle(30);

    check('the person is told', device.global('Recovery').problems.length > 0,
        JSON.stringify(device.global('Recovery').problems.map(p => p.key)));
    check('and the device stops writing',
        device.call('farkadWritesBlocked') === true);
}

// ------------------------------------------------------- the loser's write is a clean no-op
{
    suite('the phone that lost the race sends nothing, and owes nothing');

    const cloud = makeCloud();
    const a = phone('d_race_a');
    const b = phone('d_race_b');
    const gate = tunnel(cloud);
    a.Sync.connect(cloud.adapter);
    await settle(90);
    b.Sync.connect(gate.adapter);
    await settle(90);

    // B cannot hear. Both approve the same plan; A lands first.
    gate.close();
    approveOn(a, 'd_a', '2026-08-26T08:00:00.000Z');
    await settleUntil(() => Boolean((((cloud.doc || {}).ledger || {}).migrations || {})
        .cm_carry), 5000);
    const landedAt = cloud.doc.revision;
    const writes = cloud.writes.filter(write => !write.replayed).length;

    approveOn(b, 'd_b', '2026-08-26T08:00:07.000Z');
    b.Sync.flush();
    await settle(600);
    gate.release();
    await settle(600);

    check('the cloud holds one approval, the first one',
        JSON.stringify(Object.keys(cloud.doc.ledger.migrations)) === '["cm_carry"]'
        && cloud.doc.ledger.migrations.cm_carry.by === 'd_a',
        JSON.stringify(cloud.doc.ledger.migrations));
    check('the loser wrote nothing at all',
        cloud.writes.filter(write => !write.replayed).length === writes
        && cloud.doc.revision === landedAt,
        `${writes} writes at revision ${landedAt}, now `
        + `${cloud.writes.filter(write => !write.replayed).length} at ${cloud.doc.revision}`);
    check('and owes nothing', b.Sync.pendingCount() === 0,
        String(b.Sync.pendingCount()));
    check('nothing is held on its disk',
        Object.keys(b.dump()).every(key => key.indexOf(':hold:') === -1),
        JSON.stringify(Object.keys(b.dump()).filter(k => k.indexOf('outbox') !== -1)));
    check('it may say synced, because it is', b.Sync.status === 'synced', b.Sync.status);
    check('both phones read the same approval',
        JSON.stringify(a.State.schedule.ledger.migrations)
            === JSON.stringify(b.State.schedule.ledger.migrations),
        JSON.stringify([a.State.schedule.ledger.migrations,
            b.State.schedule.ledger.migrations]));

    // AND AFTER A REOPEN, because a hold that survives the session is the thing being
    // fixed here.
    const again = phone('d_race_b', b.dump());
    again.Sync.connect(gate.adapter);
    await settle(600);
    // NOT a count of every write: a reopening device legitimately writes the boot-time
    // ledger mirror, which is a different operation and has to go. What must never happen
    // again is THIS path leaving the phone a second time and putting d_b's name over the
    // approval d_a already made.
    const approvalWrites = () => cloud.writes.filter(write => !write.replayed)
        .filter(write => Object.prototype.hasOwnProperty.call(
            write.patch || write.data || {}, 'ledger.migrations.cm_carry')).length;
    check('a reopened loser owes nothing and never sends that approval again',
        again.Sync.pendingCount() === 0 && approvalWrites() === 1,
        `${again.Sync.pendingCount()} owed, ${approvalWrites()} writes of the approval`);
    check('and the cloud still holds the first writer\'s approval',
        cloud.doc.ledger.migrations.cm_carry.by === 'd_a',
        JSON.stringify(cloud.doc.ledger.migrations.cm_carry));
}

// ------------------------------------------------ a genuinely contested path still holds
{
    suite('a real correction of the same path is still held');

    // The control. Two phones putting a man on two different sites is a disagreement
    // about what happened, and it must still stop and ask - see tests/contested.test.mjs.
    const cloud = makeCloud();
    const a = phone('d_hold_a');
    const b = phone('d_hold_b');
    const gate = tunnel(cloud);
    a.Sync.connect(cloud.adapter);
    await settle(90);
    b.Sync.connect(gate.adapter);
    await settle(90);

    const site = (device, placeId) => device.State.commit(device.call('assignPlace',
        device.State.schedule, '2026-08-12', 'w_01', 'actual', placeId));
    site(a, 'p_01');
    await settleUntil(() => Boolean(((cloud.doc.days || {})['2026-08-12'] || {}).actual),
        5000);
    gate.close();
    site(a, 'p_02');
    await settle(400);
    site(b, 'p_01');
    b.Sync.flush();
    await settleUntil(() => b.Sync.status === 'contested', 5000);

    check('the loser is told, and holds', b.Sync.status === 'contested'
        && b.Sync.pendingCount() > 0, `${b.Sync.status} / ${b.Sync.pendingCount()}`);
    gate.release();
    await settle(600);
    check('and the winner is still the winner after the snapshot',
        b.Sync.status !== 'synced', b.Sync.status);
}

report();
