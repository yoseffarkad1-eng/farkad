// A correction undoes a transaction. All of it, or none of it.
//
//   node tests/correction.test.mjs
//
// L4 made a correction name the immutable transaction it corrects rather than the advance
// behind it - a repayment written against the wrong man is the case it exists for. What it
// left behind is the amount. eventReversalProblems refuses a correction LARGER than its
// target and accepts anything smaller:
//
//     if (back > held + 1e-6) out.push('a correction larger than the transaction it corrects');
//
// So 100 against a 400 repayment is accepted, and the record then says that 300 of that
// repayment still happened. It did not. The man handed over 400 or he did not; there is no
// event in this app's model for "some of a payment", and eventReversalRoom's own comment
// already says the answer out loud - "How much of this transaction is still open to
// correction: all of it, or none" - while returning a number the form then offers as a
// ceiling to type under.
//
// A partial leaves money stranded. The correction is dated on the target's own day and its
// id is derived from the target, so the remaining 300 can never be corrected: the second
// attempt is refused as `a second correction of a transaction already corrected`. The
// difference is not recoverable by any button in this app.
//
// AND THE RECORDER DOES NOT ASK. recordEventReversed checks that the target exists and
// that it has not already been corrected, and then writes:
//
//     function recordEventReversed(schedule, targetId, amount, date, reason, at, by) {
//         const target = reversalTarget(schedule, targetId);
//         if (!target) return null;
//         if (reversalTarget(schedule, eventReversalId(targetId))) return null;
//         return appendLedgerEntry(schedule, { ... amount: Number(amount) || 0, ... });
//
// Not one call to eventReversalProblems. Every rule about what a correction may be lives
// in a validator that only the form consults, so anything that writes without going
// through that form - another screen, a later caller, a restore path - writes whatever it
// is handed. A validator the writer does not call is a document, not a guard.
//
// The acceptance case, on a readable 400:  100 refused · 399.99 refused · 400 accepted ·
// 401 refused. And a refused attempt must leave NOTHING behind - no entry, no mutation, no
// disk write, no queued operation, no request.

import { makeDevice, makeCloud, settle } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const TARGET = 400;

// A man, an advance, and a repayment of exactly 400 to correct.
function withRepayment(deviceId) {
    const device = makeDevice({ deviceId,
        flags: { carryAdvances: true, ledgerWrites: true } });
    device.setToday('2026-08-26');
    device.ctx.askTell = () => Promise.resolve();
    device.State.schedule.workers = [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 0 }];
    device.State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
    device.State.save({ silent: true });
    device.State.commit(device.call('assignPlace', device.State.schedule,
        '2026-08-10', 'w_01', 'actual', 'p_01'));
    device.State.commit(device.call('addAdvance', device.State.schedule,
        'w_01', '2026-08-10', 5000, ''));

    const advanceId = Object.keys(device.State.schedule.advances)[0];
    device.State.commit(device.call('recordAdvanceRepaid', device.State.schedule,
        advanceId, TARGET, '2026-08-18', '', '2026-08-18T09:00:00.000Z', deviceId, 'cash'));
    return device;
}

const repaymentIn = device => Object.keys(device.State.schedule.ledger.advances)
    .map(id => device.State.schedule.ledger.advances[id])
    .find(entry => String(entry.kind) === 'repaid');

// ------------------------------------------------------------------- what may be corrected
{
    suite('a correction is the whole transaction, or it is refused');

    const device = withRepayment('d_amounts');
    const target = repaymentIn(device);
    given('there is a readable repayment of 400 to correct',
        Boolean(target) && Number(target.amount) === TARGET
        && device.call('ledgerEntryProblems', String(target.id), target).length === 0,
        JSON.stringify(target));

    const refuses = amount => device.call('eventReversalProblems',
        device.State.schedule, target.id, amount, 'טעות').length > 0;

    check('100 against a 400 transaction is refused', refuses(100) === true);
    check('399.99 is refused', refuses(399.99) === true);
    check('400 is accepted', refuses(TARGET) === false,
        JSON.stringify(device.call('eventReversalProblems',
            device.State.schedule, target.id, TARGET, 'טעות')));
    check('401 is refused', refuses(401) === true);

    // A correction still needs a reason, whatever its amount. The rule being added here
    // must not quietly replace the rules already in place.
    check('and the full amount with no reason is still refused',
        device.call('eventReversalProblems',
            device.State.schedule, target.id, TARGET, '   ').length > 0);
}

// ------------------------------------------------- the recorder enforces it, not the form
{
    suite('the writer refuses a partial even when nothing asked the validator');

    const device = withRepayment('d_writer');
    const target = repaymentIn(device);

    // Everything a refused attempt must not touch, captured first.
    const beforeMemory = JSON.stringify(device.State.schedule);
    const beforeDisk = device.dump()['scheduleData:v2'];
    const beforeQueue = device.Sync.pendingCount();
    const beforeKeys = Object.keys(device.State.schedule.ledger.advances).length;

    // Straight at the recorder, with no form and no validator in front of it - which is
    // what any future caller looks like.
    const change = device.call('recordEventReversed', device.State.schedule,
        target.id, 100, '2026-08-18', 'טעות', '2026-08-19T09:00:00.000Z', 'd_writer');

    check('it writes nothing and says so', change === null, JSON.stringify(change));
    check('no ledger entry was appended',
        Object.keys(device.State.schedule.ledger.advances).length === beforeKeys,
        JSON.stringify(Object.keys(device.State.schedule.ledger.advances)));
    check('memory is byte-identical',
        JSON.stringify(device.State.schedule) === beforeMemory);
    check('the disk is byte-identical',
        device.dump()['scheduleData:v2'] === beforeDisk);
    check('and nothing was queued to send',
        device.Sync.pendingCount() === beforeQueue,
        `${beforeQueue} -> ${device.Sync.pendingCount()}`);

    // AND THE WHOLE AMOUNT STILL WORKS, through the same door. A guard that refuses
    // everything is not a guard.
    //
    // On a FRESH record: on the tree this was written against the partial above lands,
    // and a second correction of an already-corrected transaction is refused for a
    // different reason entirely. Reusing the device would prove the wrong thing.
    const clean = withRepayment('d_writer_ok');
    const cleanTarget = repaymentIn(clean);
    const good = clean.call('recordEventReversed', clean.State.schedule,
        cleanTarget.id, TARGET, '2026-08-18', 'טעות', '2026-08-19T09:00:00.000Z', 'd_ok');
    check('the full amount is written',
        good !== null && Boolean(good.value) && Number(good.value.amount) === TARGET,
        JSON.stringify(good));
    check('and it names the transaction it corrects',
        good !== null && Boolean(good.value)
        && String(good.value.targetId) === String(cleanTarget.id)
        && String(good.value.targetKind) === 'repaid',
        JSON.stringify((good || {}).value));
}

// --------------------------------------------------------- and nothing reaches the cloud
{
    suite('a refused correction sends no request');

    const cloud = makeCloud();
    const device = withRepayment('d_cloud');
    device.Sync.pushDelayMs = 5;
    device.Sync.connect(cloud.adapter);
    await settle(80);

    const target = repaymentIn(device);
    const writesBefore = cloud.writes.length;
    const docBefore = JSON.stringify(cloud.doc);

    const change = device.call('recordEventReversed', device.State.schedule,
        target.id, 399.99, '2026-08-18', 'טעות', '2026-08-19T09:00:00.000Z', 'd_cloud');
    if (change) device.State.commit(change);
    await settle(200);

    check('the recorder refused', change === null, JSON.stringify(change));
    check('no request was made', cloud.writes.length === writesBefore,
        `${writesBefore} -> ${cloud.writes.length}`);
    check('and the document is untouched', JSON.stringify(cloud.doc) === docBefore);
}

// ------------------------------------------------------ two phones correcting at once
{
    suite('two phones correcting the same transaction move the money once');

    // The id is derived from the target, so both phones write the same field path and the
    // union keeps one. This is the property that makes the all-or-nothing rule safe: with
    // partials allowed, two phones could correct 300 and 100 of the same 400 under two
    // different ids and take it twice.
    const one = withRepayment('d_race');
    const target = repaymentIn(one);
    const two = makeDevice({ deviceId: 'd_race_b', storage: one.dump(),
        flags: { carryAdvances: true, ledgerWrites: true } });
    two.setToday('2026-08-26');
    two.ctx.askTell = () => Promise.resolve();
    two.State.load();

    const a = one.call('recordEventReversed', one.State.schedule, target.id, TARGET,
        '2026-08-18', 'טעות', '2026-08-19T09:00:00.000Z', 'd_race');
    const b = two.call('recordEventReversed', two.State.schedule, target.id, TARGET,
        '2026-08-18', 'טעות שנייה', '2026-08-19T09:05:00.000Z', 'd_race_b');
    one.State.commit(a);
    two.State.commit(b);

    same('both phones wrote the same field path', [a.path], [b.path]);
    one.Sync.receive(Object.assign(JSON.parse(JSON.stringify(two.State.schedule)),
        { updatedAt: '2026-08-26T10:00:00.000Z', updatedBy: 'd_race_b' }));
    await settle(30);

    const corrections = Object.keys(one.State.schedule.ledger.advances)
        .map(id => one.State.schedule.ledger.advances[id])
        .filter(entry => String(entry.kind) === 'reversed');
    check('and after they meet there is exactly one correction',
        corrections.length === 1, JSON.stringify(corrections.map(c => c.id)));
    check('for the whole amount, once',
        corrections.length === 1 && Number(corrections[0].amount) === TARGET,
        JSON.stringify(corrections[0]));
}

// ------------------------------------------- the legacy reversal keeps its own meaning
{
    suite('an untargeted reversal still means what it always meant');

    // A reversal written before L4 carries no targetId: it meant "this ADVANCE was never
    // handed over", and it may legitimately be partial - reversalProblems has always
    // allowed that and the fold reads it that way. The rule being added here is about
    // corrections that name a TRANSACTION, and it must not reach back and restate those.
    const device = withRepayment('d_legacy');
    const advanceId = Object.keys(device.State.schedule.advances)[0];

    const problems = device.call('reversalProblems', device.State.schedule,
        advanceId, 1200, 'הוחזר חלקית');
    check('a partial reversal of an advance is still allowed',
        problems.length === 0, JSON.stringify(problems));
    check('and one larger than the advance is still refused',
        device.call('reversalProblems', device.State.schedule,
            advanceId, 6000, 'יותר מדי').length > 0);
}

// ---------------------------------------------------------- the date is not a question
{
    suite('a correction is dated on the transaction it corrects, and on nothing else');

    // WHERE A CORRECTION LANDS IS NOT A CHOICE. The entry says a transaction did not
    // happen, so it belongs where that transaction is. Both forms' comments say exactly
    // this - "Dating it today would move money between two fortnights to undo something
    // that happened in one of them" - above an editable date input whose value goes
    // straight into the record.
    //
    // recordEventReversed writes `date: String(date)` and never asks. Measured on the
    // commit this was written against, correcting a 400 repayment dated 2026-08-18:
    //
    //   ''             -> written {"date":""}            ledgerEntryProblems: a reversal on no date
    //   'not-a-date'   -> written {"date":"not-a-date"}  ledgerEntryProblems: a reversal on no date
    //   '2026-11-30'   -> written, readable, in November - three months from the money
    //   '2020-01-01'   -> written, readable, six years before the advance
    //
    // The first two are the worse pair: the recorder writes an entry its OWN reader
    // refuses, so the next boot holds that correction aside as unreadable and blocks the
    // phone - the man's 400 never comes back, and the person who pressed Save caused it.
    // The last two are quieter and just as wrong: money moved out of the fortnight it
    // belongs to, into one that has already been paid or has not happened yet.
    let made = 0;
    const target = () => {
        made += 1;
        const device = withRepayment('d_date' + made);
        return { device, entry: repaymentIn(device) };
    };

    for (const [what, given_] of [['no date at all', ''], ['a date nobody can read', 'not-a-date'],
        ['another fortnight', '2026-11-30'], ['before the advance existed', '2020-01-01']]) {
        const { device, entry } = target();
        const change = device.call('recordEventReversed', device.State.schedule,
            entry.id, TARGET, given_, 'נרשם על האדם הלא נכון',
            '2026-08-26T00:00:00.000Z', device.id);
        const written = change ? change.value : null;
        check(`${what}: the correction is dated on the transaction`,
            written !== null && written.date === entry.date,
            JSON.stringify([given_, written && written.date, entry.date]));
        check(`${what}: and what is written is readable by the model that wrote it`,
            written !== null
            && device.call('ledgerEntryProblems', written.id, written).length === 0,
            JSON.stringify(written
                ? device.call('ledgerEntryProblems', written.id, written) : 'nothing written'));
    }

    // AND A TARGET WITH NO READABLE DATE IS NOT CORRECTABLE. There is no day to put the
    // correction on, and inventing one puts money in a fortnight nobody chose.
    {
        const { device, entry } = target();
        // Written straight onto the record, the way a snapshot from a build that did not
        // date its repayments would arrive.
        device.State.schedule.ledger.advances[entry.id].date = '';
        check('a transaction with no readable date cannot be corrected',
            device.call('eventReversalProblems', device.State.schedule, entry.id,
                TARGET, 'סיבה').length > 0,
            JSON.stringify(device.call('eventReversalProblems', device.State.schedule,
                entry.id, TARGET, 'סיבה')));
        const change = device.call('recordEventReversed', device.State.schedule,
            entry.id, TARGET, '2026-08-18', 'סיבה', '2026-08-26T00:00:00.000Z', device.id);
        check('and nothing is written for it', change === null, JSON.stringify(change));
    }

    // THE OTHER FORM, which corrects an ADVANCE rather than a transaction, takes the same
    // rule from the same reason - and recordAdvanceReversed asks nothing at all.
    {
        const device = withRepayment('d_date_adv');
        const advanceId = Object.keys(device.State.schedule.advances)[0];
        const when = device.State.schedule.advances[advanceId].date;
        const change = device.call('recordAdvanceReversed', device.State.schedule,
            advanceId, 100, '2020-01-01', 'לא נמסר', '2026-08-26T00:00:00.000Z', device.id);
        const written = change ? change.value : null;
        check('a correction of an advance is dated on the advance',
            written !== null && written.date === when,
            JSON.stringify([written && written.date, when]));
        check('and it too is readable by the model that wrote it',
            written !== null
            && device.call('ledgerEntryProblems', written.id, written).length === 0,
            JSON.stringify(written
                ? device.call('ledgerEntryProblems', written.id, written) : 'nothing written'));

        // A rule the recorder does not apply is a document, not a guard: the amount is
        // asked here for the same reason the date is.
        const bad = device.call('recordAdvanceReversed', device.State.schedule,
            advanceId, -50, when, 'שלילי', '2026-08-26T00:00:00.000Z', device.id);
        check('and a correction of less than nothing is refused before anything moves',
            bad === null, JSON.stringify(bad));
    }
}

report();
