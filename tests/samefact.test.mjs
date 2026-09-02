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


// -------------------------------------------- the same fact, on a project with no document
{
    suite('two phones approving one plan reach an empty project');

    // THE CREATE RACE ASKS A DIFFERENT QUESTION FROM THE CONFLICT BRANCH, and that was
    // the whole of it.
    //
    // The conflict branch above settles a path the server already holds as the same fact:
    // ledgerPathSupersededBy is asked, the path is dropped, the first writer's record
    // stands. createDocument's already-exists branch decides what to hold with
    // movedUnder, which compares VALUES - so one approval with a different `by` is a
    // value nobody here has seen, and it is held for a person.
    //
    // Both phones approve before they ever connect, which is what a person does: the
    // review screen is the first thing a new install shows once the gate is open, and
    // tests/money.concurrency.test.mjs's phone() approves in its constructor for exactly
    // that reason. Then both reach a project with no document and race to create it.
    // Measured on 4a4d277:
    //
    //     B outbox paths: ["ledger.migrations.cm_carry"]
    //     B HELD paths:   ["ledger.migrations.cm_carry"]
    //     B status: contested        same fact? true        same bytes? false
    //
    // That is the end state the storm hunt saw once in twenty-eight emulator runs under
    // load and could not place - "a refused approval write leaves the phone contested".
    // It is this, and on the fake cloud it happens every time.
    const cloud = makeCloud();
    const a = phone('d_empty_a');
    const b = phone('d_empty_b');
    approveOn(a, 'd_a', '2026-08-26T08:00:00.000Z');
    approveOn(b, 'd_b', '2026-08-26T08:00:07.000Z');
    given('neither phone has heard of a document yet', cloud.doc === null,
        JSON.stringify(cloud.doc));
    given('and each holds its own approval of the same plan',
        a.State.schedule.ledger.migrations.cm_carry.by === 'd_a'
        && b.State.schedule.ledger.migrations.cm_carry.by === 'd_b',
        JSON.stringify([a.State.schedule.ledger.migrations.cm_carry.by,
            b.State.schedule.ledger.migrations.cm_carry.by]));

    a.Sync.connect(cloud.adapter);
    b.Sync.connect(cloud.adapter);
    await settleUntil(() => a.Sync.pendingCount() === 0 && b.Sync.pendingCount() === 0,
        8000);
    await settle(600);

    const winner = ((cloud.doc || {}).ledger || {}).migrations || {};
    given('one of them created the document and its approval is on it',
        Object.keys(winner).length === 1, JSON.stringify(winner));

    check('neither phone owes anything',
        a.Sync.pendingCount() === 0 && b.Sync.pendingCount() === 0,
        `A ${a.Sync.pendingCount()} / B ${b.Sync.pendingCount()}`);
    check('neither is holding a conflict about money',
        a.Sync.holdingContested() === false && b.Sync.holdingContested() === false,
        `A ${a.Sync.status} / B ${b.Sync.status}`);
    check('and neither says anything but synced',
        a.Sync.status === 'synced' && b.Sync.status === 'synced',
        `A ${a.Sync.status} / B ${b.Sync.status}`);
    check('nothing is held on either disk',
        Object.keys(a.dump()).every(key => key.indexOf(':hold:') === -1)
        && Object.keys(b.dump()).every(key => key.indexOf(':hold:') === -1),
        JSON.stringify(Object.keys(a.dump()).concat(Object.keys(b.dump()))
            .filter(key => key.indexOf(':hold:') !== -1)));

    // ONE APPROVAL, IN THE FIRST WRITER'S HAND. Settling must not mean the loser sends
    // its copy anyway and puts its own name over the record - that is what the conflict
    // branch drops the path for.
    //
    // Asked of the DOCUMENT, not of a count of writes carrying the path: the winner's
    // approval travels inside the create's seed, where it is a nested object and not a
    // flat `ledger.migrations.cm_carry` key at all, so counting that key would count zero
    // and pass whatever the loser did afterwards.
    const signedBy = winner.cm_carry && winner.cm_carry.by;
    check('the cloud holds exactly one approval', Object.keys(winner).length === 1,
        JSON.stringify(winner));
    check('signed by one of the two phones, whichever created the document',
        signedBy === 'd_a' || signedBy === 'd_b', String(signedBy));
    check('and the loser never wrote its own name over it',
        cloud.writes.filter(write => !write.replayed)
            .filter(write => {
                const body = write.patch || write.data || {};
                const flat = body['ledger.migrations.cm_carry'];
                const nested = ((body.ledger || {}).migrations || {}).cm_carry;
                const sent = flat || nested;
                return sent && sent.by !== signedBy;
            }).length === 0,
        JSON.stringify(cloud.writes.filter(w => !w.replayed).map(w => w.kind)));

    // AND BOTH PHONES END UP READING THE ONE THE CLOUD KEPT. A phone that settled its own
    // write but went on holding its own copy locally would be two records again.
    check('both phones read the approval the cloud kept',
        a.State.schedule.ledger.migrations.cm_carry.by === signedBy
        && b.State.schedule.ledger.migrations.cm_carry.by === signedBy,
        JSON.stringify([a.State.schedule.ledger.migrations.cm_carry.by,
            b.State.schedule.ledger.migrations.cm_carry.by, signedBy]));

    // AND BOTH PHONES READ THE MIGRATION AS SETTLED, which is what the gate in front of
    // every financial writer asks before it lets anything through.
    check('both phones read the plan as approved',
        a.call('carryMigrationSettled', a.State.schedule) === true
        && b.call('carryMigrationSettled', b.State.schedule) === true,
        JSON.stringify([a.call('carryMigrationSettled', a.State.schedule),
            b.call('carryMigrationSettled', b.State.schedule)]));
}

// ------------------------------------------- what the same-fact rule must NEVER wave through
{
    suite('a closure of one fortnight is the same fact only when the fortnight is');

    // THE DECISION, PINNED. A v97 closure froze its days without the hours they were
    // priced with; a v98 closure records them. Two phones on those two builds, both with
    // the gates open - which no build a person can run has - closing one fortnight write
    // one id with two different bodies, and the second is held.
    //
    // It stays held. The frozen basis is not decoration: it is the evidence the payslip
    // was computed from, and two phones that disagree about which days a fortnight was
    // priced on disagree about something real. Settling that by "the first one wins"
    // would discard a record on the strength of who pressed first.
    //
    // The case cannot arise on a served build, and features/gate-flip/contract.md
    // requires all three phones on one build before either gate opens - which is the
    // reason it cannot arise later either.
    const device = phone('d_decide');
    const money = { id: 'le_close_a_omer_20260807', advanceId: 'a_omer', kind: 'deducted',
        workerId: 'w_01', date: '2026-08-20', periodFrom: '2026-08-07',
        periodTo: '2026-08-20', amount: 3050, balanceAfter: 1950, gross: 3050,
        carriedIn: 0, given: 5000, repaid: 0, reversed: 0, net: 0,
        basis: { normalDays: 5, doubleDays: 0, extraHours: 2, siteVisits: 5, absent: 0 } };
    const withDays = (hours, at, by) => Object.assign({}, money, {
        days: [{ date: '2026-08-10', amount: 610, absent: false,
            entries: [hours === null
                ? { placeId: 'p_01', rate: 'daily' }
                : { placeId: 'p_01', rate: 'daily', hours }] }],
        at, by });

    const asV97 = withDays(null, '2026-08-20T18:00:00.000Z', 'd_one');
    const asV98 = withDays(2, '2026-08-20T18:04:00.000Z', 'd_two');
    check('two builds that froze different days are NOT one fact',
        device.call('sameLedgerFact', asV97, asV98) === false,
        JSON.stringify([asV97.days, asV98.days]));
    check('so the sync layer does not settle one over the other',
        device.call('ledgerPathSupersededBy',
            'ledger.advances.le_close_a_omer_20260807', asV98, asV97) === false,
        'held for a person');

    // The two controls, either side of it.
    const otherHand = Object.assign({}, asV98, { at: '2026-08-20T19:00:00.000Z',
        by: 'd_three' });
    check('two hands on ONE build are one fact',
        device.call('sameLedgerFact', asV98, otherHand) === true,
        JSON.stringify([asV98.by, otherHand.by]));
    const otherSum = Object.assign({}, asV98, { amount: 2000, balanceAfter: 3000 });
    check('and a different sum is never one fact',
        device.call('sameLedgerFact', asV98, otherSum) === false,
        JSON.stringify([asV98.amount, otherSum.amount]));
}

report();
