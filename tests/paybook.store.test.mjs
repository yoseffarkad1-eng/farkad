// The pay book on ONE phone: what is stored, what is refused, and what survives a reopen.
//
//   node tests/paybook.store.test.mjs
//
// v173 gives `schedule.pay` a disk, a journal and a place in every file that leaves the
// phone - and ships the writer SHUT. This suite is the single-device half: no cloud, no
// second phone (those are tests/paybook.sync.test.mjs). Each section is a way this record
// could quietly come to say something other than what was done:
//
//   the gate        with the shipped flags nothing writes a pay entry - and a phone that
//                   does not write one still keeps, reads and exports one it was handed
//   the commit      a closure is ONE journal batch; a reopen reads back the same bytes and
//                   the folds say the same thing before and after
//   journal first   dying between the journal and the record loses nothing; a journal the
//                   disk refuses rolls memory back, and says so
//   append-only     a null, a rewrite and a stray path are refused at three doors - the
//                   commit, the one minting path of the queue, and the queue's reader
//   one fact        the same closure committed twice writes nothing the second time
//   a disagreement  two bodies under one id are both kept, across a reopen, and stop the
//                   pay planners for that man WITHOUT stopping the phone
//   unreadable      an entry this build could not have written stays exactly where it is,
//                   is quarantined, and stops writing until a person has been told (law 10)
//   poison          `__proto__` as a pay id, through every writer and every reader
//   backups         the backup file, a restore point and the rescue file carry the book
//   capacity        what a season of closures weighs - REPORTED, against Firestore's 1 MiB
//
// Synthetic data only.

import vm from 'node:vm';
import { makeDevice } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import {
    FORTNIGHT, WEEK1, WEEK2, TODAY, clone, stamp, canonical, payDevice, world, fillWorld, advancesOf,
    plan, openBook, batchKeys, reopen, bookOf, foldOf
} from './paybook.world.mjs';

const SCHEDULE = 'scheduleData:v2';
// An expression evaluated INSIDE a device's own realm - for the questions that cannot be
// asked from out here, like whose prototype a map has.
const inside = (device, code) => vm.runInContext(code, device.ctx, { filename: 'paybook:inside' });
const onDisk = device => JSON.parse(device.raw(SCHEDULE));

// Khaled's fortnight, closed with everything a closure can carry: two advances with the
// person's own split, an extra deduction, and part of the net handed over.
//   wage 4,400 - 500 - 100 (advances) - 150 (tools) = 3,650 net; 2,000 paid; 1,650 owed.
const ADVANCES = [['w_khaled', '2026-10-03', 500], ['w_khaled', '2026-10-06', 400]];
const fullClosure = (device, by) => {
    const [k1, k2] = advancesOf(device, 'w_khaled');
    return plan(device, 'planClosure', 'w_khaled', FORTNIGHT, {
        allocations: { [k1]: 500, [k2]: 100 },
        extras: [{ amount: 150, category: 'agreed', reason: 'ציוד' }],
        paid: 2000, paidOn: TODAY, method: 'cash'
    }, stamp(TODAY, by || device.id));
};
const CLOSURE_PATHS = device => {
    const [k1, k2] = advancesOf(device, 'w_khaled');
    return ['ledger.advances.le_period_w_khaled_20261002',
        `ledger.advances.le_close_${k1}_20261002`, `ledger.advances.le_close_${k2}_20261002`,
        'pay.pd_w_khaled_20261002_1', 'pay.ps_w_khaled_20261002', 'pay.pp_ps_w_khaled_20261002'];
};

// =====================================================================================
{
    suite('THE GATE: what a person installs does not write the pay book');

    const shipped = makeDevice({ deviceId: 'd_shipped' });
    same('the shipped flags say the writer is off - and say so as a boolean, not by omission',
        [shipped.global('FARKAD_FLAGS').paybook, shipped.call('paybookWritesEnabled')], [false, false]);

    // A record on which every OTHER gate is open, so that `gate` below can only be this one.
    const on = world({ advances: ADVANCES });
    openBook(on);
    const drawn = fullClosure(on);
    given('with the writer on, the closure is allowed', drawn.ok === true, JSON.stringify(drawn.reasons));

    const off = payDevice({ shipped: true, storage: on.dump(), deviceId: on.id });
    off.State.load();
    given('the same record, on the shipped build, has its financial gate open',
        off.call('financialWritingEnabled', off.State.schedule) === true);
    const S = off.State.schedule;
    const st = stamp(TODAY, off.id);
    same('every planner refuses with `gate`, and hands back no change', [
        off.call('planClosure', S, 'w_khaled', FORTNIGHT, {}, st),
        off.call('planOpening', S, '2026-10-02', st),
        off.call('planPayment', S, 'ps_w_khaled_20261002', 100, { paymentId: 'pp_gate00000001' }, st),
        off.call('planVoid', S, 'pp_gate00000001', { reason: 'x' }, st),
        off.call('planAdjustment', S, 'ps_w_khaled_20261002', 50, { reason: 'x' }, st),
        off.call('planLegacy', S, 'w_khaled', '2026-10-02', { state: 'paid' }, st)
    ].map(answer => [answer.ok, answer.reasons.indexOf('gate') !== -1, (answer.changes || []).length]),
    Array(6).fill([false, true, 0]));
    same('the group planner refuses every man the same way',
        off.call('planGroupClosure', S, ['w_khaled', 'w_salim'], FORTNIGHT, {}, st).results
            .map(row => [row.outcome, (row.reasons || []).indexOf('gate') !== -1]),
        [['refuse', true], ['refuse', true]]);

    // AND THE COMMIT ITSELF, handed a perfectly good plan drawn by a build with the writer
    // on. A gate that lived only in the planners would be a gate on the people who ask.
    const before = { disk: off.raw(SCHEDULE), batches: batchKeys(off).length, book: bookOf(off) };
    const refused = off.State.commitPaybook(clone(drawn.changes));
    same('State.commitPaybook refuses a valid closure with `gate`',
        [refused.ok, refused.reasons, refused.written], [false, ['gate'], []]);
    same('and nothing moved: not memory, not the record, not the queue',
        [bookOf(off), off.raw(SCHEDULE), batchKeys(off).length], [before.book, before.disk, before.batches]);
    check('nobody is told anything, because nothing was attempted', off.said.length === 0, JSON.stringify(off.said));

    // A PHONE WITH THE WRITER OFF IS NOT A PHONE THAT DESTROYS WHAT IT DOES NOT WRITE.
    given('the closure is committed on the phone with the writer on', on.State.commitPaybook(drawn.changes).ok === true);
    const reader = payDevice({ shipped: true, storage: on.dump(), deviceId: on.id });
    reader.State.load();
    same('the shipped build opens a record that holds a pay book: every entry, byte for byte',
        [bookOf(reader), reader.call('farkadWritesBlocked')], [bookOf(on), false]);
    same('it folds it - 3,650 owed, 2,000 paid, 1,650 still due, status partial', foldOf(reader), foldOf(on));
    same('it reads the man\'s account off it',
        (a => [a.status, a.wageDue, a.debt])(reader.call('accountFor', reader.State.schedule, 'w_khaled', TODAY)),
        ['partial', 1650, 300]);
    // An ordinary evening on that phone: a day recorded, the whole record rewritten.
    given('a day is recorded on the shipped build', reader.State.commit(
        reader.call('assignPlace', reader.State.schedule, '2026-10-18', 'w_nasser', 'actual', 'p_a')) === true);
    const again = payDevice({ shipped: true, storage: reader.dump(), deviceId: on.id });
    again.State.load();
    same('and after its own save and its own reopen the book is still every byte of it',
        [bookOf(again), canonical(onDisk(reader).pay)], [bookOf(on), bookOf(on)]);
    same('a worker with a pay entry cannot be deleted for good - his footprint names it',
        reader.call('workerFootprint', reader.State.schedule, 'w_khaled').ledger
            .filter(id => /^p[sdp]_/.test(id)).sort(),
        ['pd_w_khaled_20261002_1', 'pp_ps_w_khaled_20261002', 'ps_w_khaled_20261002']);
}

// =====================================================================================
{
    suite('THE COMMIT: one batch, journal first, and a reopen that reads the same thing back');

    const d = world({ advances: ADVANCES });
    openBook(d);
    const drawn = fullClosure(d);
    given('the closure is allowed', drawn.ok === true, JSON.stringify(drawn.reasons));
    same('the plan is the closure artifact, one `deducted` entry per advance, and three pay entries',
        drawn.changes.map(change => change.path), CLOSURE_PATHS(d));

    // What the model says the record WILL say, before a byte is written.
    const foretold = d.call('paybookApply', d.State.schedule, drawn.changes).schedule;
    const foretoldFold = canonical(d.call('paybookFold', foretold).statements.ps_w_khaled_20261002.owed);

    const batchesBefore = batchKeys(d);
    const done = d.State.commitPaybook(drawn.changes);
    same('committed: ok, every path written, nothing kept back',
        [done.ok, done.reasons, done.written, done.same, done.kept], [true, [], CLOSURE_PATHS(d), [], false]);
    const batch = batchKeys(d).filter(key => batchesBefore.indexOf(key) === -1);
    same('as ONE journal record', batch.length, 1);
    same('holding all six operations, in the plan\'s order',
        JSON.parse(d.raw(batch[0])).ops.map(op => op.path), CLOSURE_PATHS(d));
    same('the record on the disk holds the three pay entries and the opening',
        Object.keys(onDisk(d).pay).sort(),
        ['pd_w_khaled_20261002_1', 'po_open', 'pp_ps_w_khaled_20261002', 'ps_w_khaled_20261002']);
    same('the committed entries are the plan\'s, byte for byte',
        drawn.changes.filter(c => c.path.startsWith('pay.')).map(c => canonical(d.State.schedule.pay[c.path.slice(4)])),
        drawn.changes.filter(c => c.path.startsWith('pay.')).map(c => canonical(c.value)));
    check('and the record does not share an object with the plan it was drawn from',
        drawn.changes.every(c => !c.path.startsWith('pay.') || d.State.schedule.pay[c.path.slice(4)] !== c.value));
    same('the fold after the commit is the fold the model foretold',
        canonical(d.call('paybookFold', d.State.schedule).statements.ps_w_khaled_20261002.owed), foretoldFold);

    const r = reopen(d);
    same('REOPENED: the pay book is identical', bookOf(r), bookOf(d));
    same('the ledger entries the closure wrote are identical',
        CLOSURE_PATHS(d).slice(0, 3).map(path => canonical(r.State.schedule.ledger.advances[path.split('.')[2]])),
        CLOSURE_PATHS(d).slice(0, 3).map(path => canonical(d.State.schedule.ledger.advances[path.split('.')[2]])));
    same('the fold is identical', foldOf(r), foldOf(d));
    same('nothing is held, nothing is beside, the phone is not blocked, no closure is impossible',
        [r.call('farkadWritesBlocked'), r.State.schedule.payConflicted, Object.keys(r.State.schedule.ledger.unreadable),
            r.call('impossibleClosures', r.State.schedule), r.call('paybookFold', r.State.schedule).held],
        [false, undefined, [], [], []]);
    same('his account: closed, part paid, 1,650 of wage owed, 300 of advance debt - two balances',
        (a => [a.status, a.running, a.wageDue, a.debt])(r.call('accountFor', r.State.schedule, 'w_khaled', TODAY)),
        ['partial', 0, 1650, 300]);
    same('the two folds of the advances agree with the statement: 0 and 300 left',
        advancesOf(r, 'w_khaled').map(id => r.call('advanceOutstanding', r.State.schedule, id).left), [0, 300]);

    // A LATER PAYMENT, through the same door, on the reopened phone.
    const pay = plan(r, 'planPayment', 'ps_w_khaled_20261002', 650, { paymentId: 'pp_later0000001', date: TODAY }, stamp(TODAY, r.id));
    given('a later payment is allowed', pay.ok === true, JSON.stringify(pay.reasons));
    same('a later payment commits', r.State.commitPaybook(pay.changes).ok, true);
    same('and after another reopen 1,000 is still owed',
        (a => [a.status, a.wageDue])(reopen(r).call('accountFor', reopen(r).State.schedule, 'w_khaled', TODAY)),
        ['partial', 1000]);
}

// =====================================================================================
{
    suite('JOURNAL FIRST: a death between the two writes, and a journal the disk refuses');

    // THE RECORD WRITE NEVER HAPPENS. The journal took the batch; the phone dies before
    // scheduleData:v2 is rewritten. The reopen has to rebuild the closure from the journal.
    const d = world({ advances: ADVANCES });
    openBook(d);
    const drawn = fullClosure(d);
    const diskBefore = d.raw(SCHEDULE);
    d.setQuota(key => key === SCHEDULE);
    const done = d.State.commitPaybook(drawn.changes);
    d.setQuota(null);
    same('the record itself was not rewritten', d.raw(SCHEDULE), diskBefore);
    same('the commit stands all the same - the journal holds it, which is what durable means here',
        [done.ok, done.written.length], [true, 6]);
    const r = reopen(d);
    same('REOPENED off the old record and the journal: all six entries are back',
        [Object.keys(r.State.schedule.pay).sort(), CLOSURE_PATHS(d).slice(0, 3)
            .every(path => r.State.schedule.ledger.advances[path.split('.')[2]] !== undefined)],
        [['pd_w_khaled_20261002_1', 'po_open', 'pp_ps_w_khaled_20261002', 'ps_w_khaled_20261002'], true]);
    same('byte for byte what was committed', bookOf(r), bookOf(d));
    same('and the fold says 1,650 owed', r.call('accountFor', r.State.schedule, 'w_khaled', TODAY).wageDue, 1650);
    same('replaying the journal a second time changes nothing - one statement, one payment',
        (again => [bookOf(again), again.State.schedule.payConflicted])(reopen(r)), [bookOf(d), undefined]);

    // THE JOURNAL WRITE IS REFUSED. Nothing of the closure may stand anywhere.
    const full = world({ advances: ADVANCES });
    openBook(full);
    const plan2 = fullClosure(full);
    const before = { disk: full.raw(SCHEDULE), book: bookOf(full), batches: batchKeys(full).length,
        ledger: Object.keys(full.State.schedule.ledger.advances).sort() };
    full.said.length = 0;
    full.setQuota(key => key.indexOf(':op:') !== -1);
    const refused = full.State.commitPaybook(plan2.changes);
    full.setQuota(null);
    same('a journal the disk will not take: the commit answers no, and names it',
        [refused.ok, refused.reasons, refused.written, refused.kept], [false, ['unwritten'], [], false]);
    same('MEMORY IS ROLLED BACK: no statement, no payment, no deduction, no closure artifact',
        [bookOf(full), Object.keys(full.State.schedule.ledger.advances).sort()], [before.book, before.ledger]);
    same('the record and the queue on the disk are untouched',
        [full.raw(SCHEDULE), batchKeys(full).length], [before.disk, before.batches]);
    check('AND IT IS SAID: the person is told the change was not saved',
        full.said.length === 1 && full.said[0].indexOf('הרישום לא נשמר') !== -1
        && full.said[0].indexOf('בוטל כדי שלא ייראה כאילו נרשם') !== -1, JSON.stringify(full.said));
    same('a reopen finds no trace of it', bookOf(reopen(full)), before.book);
    same('and the same plan, once there is room, commits whole',
        [full.State.commitPaybook(plan2.changes).ok, Object.keys(full.State.schedule.pay).length], [true, 4]);
}

// =====================================================================================
{
    suite('APPEND-ONLY: a null, a rewrite and a stray path, refused at every door');

    const d = world({ advances: ADVANCES });
    openBook(d);
    const drawn = fullClosure(d);
    given('the closure is committed', d.State.commitPaybook(drawn.changes).ok === true);
    const statement = clone(d.State.schedule.pay.ps_w_khaled_20261002);
    const payment = clone(d.State.schedule.pay.pp_ps_w_khaled_20261002);
    const J = (path, value) => d.call('journalEntryProblems', path, value);
    const snapshot = () => [d.raw(SCHEDULE), batchKeys(d).length, bookOf(d)];
    const still = snapshot();

    // --- the grammar: what the journal's own reader accepts under `pay.`
    same('the reader accepts a statement, a payment, a deduction and the opening as they were written',
        ['ps_w_khaled_20261002', 'pp_ps_w_khaled_20261002', 'pd_w_khaled_20261002_1', 'po_open']
            .map(id => J('pay.' + id, d.State.schedule.pay[id])), [[], [], [], []]);
    same('a NULL - a deletion in flight - is refused', J('pay.ps_w_khaled_20261002', null), ['a pay entry cannot be deleted']);
    same('a path with a third segment is refused: an entry is written whole, never a field of one',
        J('pay.ps_w_khaled_20261002.netDue', 1), ['a pay path with the wrong number of segments']);
    same('an entry filed under another id is refused',
        J('pay.ps_w_salim_20261002', statement), ['a pay entry whose id does not match its path']);
    same('an amount that is text is refused, not coerced',
        J('pay.pp_ps_w_khaled_20261002', Object.assign({}, payment, { amount: '2000' })), ['a payment of a sum that is not a number']);
    same('a kind nobody wrote is refused',
        J('pay.pp_ps_w_khaled_20261002', Object.assign({}, payment, { kind: 'bonus' })), ['a pay entry of a kind nobody wrote']);
    same('and `payConflicted` is not a path at all - nothing sends what is kept beside',
        J('payConflicted.ps_w_khaled_20261002', [statement]), ['a path root nobody wrote']);

    // --- door 1: State.commitPaybook
    const tampered = Object.assign({}, payment, { amount: 2500 });
    const answers = {
        nulled: d.State.commitPaybook([{ path: 'pay.pp_ps_w_khaled_20261002', value: null }]),
        rewrite: d.State.commitPaybook([{ path: 'pay.pp_ps_w_khaled_20261002', value: tampered }]),
        stray: d.State.commitPaybook([{ path: 'days.2026-10-18.actual.w_khaled', value: { entries: [{ placeId: 'p_a' }] } }]),
        legacyAdvance: d.State.commitPaybook([{ path: 'advances.a_x', value: null }]),
        twice: d.State.commitPaybook([{ path: 'pay.pp_new000000001', value: Object.assign({}, payment, { id: 'pp_new000000001', amount: 10 }) },
            { path: 'pay.pp_new000000001', value: Object.assign({}, payment, { id: 'pp_new000000001', amount: 20 }) }]),
        nothing: d.State.commitPaybook([]),
        ledgerRewrite: d.State.commitPaybook([{ path: 'ledger.advances.le_period_w_khaled_20261002',
            value: Object.assign({}, d.State.schedule.ledger.advances.le_period_w_khaled_20261002, { gross: 9999 }) }])
    };
    same('the commit refuses a null', [answers.nulled.ok, answers.nulled.reasons], [false, ['rejected']]);
    same('the commit refuses a different body under an id that is already there', [answers.rewrite.ok, answers.rewrite.reasons], [false, ['conflict']]);
    same('the commit refuses a day path: this door writes entries and nothing else', [answers.stray.ok, answers.stray.reasons], [false, ['rejected']]);
    same('and the legacy advances field, deletion or not', [answers.legacyAdvance.ok, answers.legacyAdvance.reasons], [false, ['rejected']]);
    same('one id twice in a batch', [answers.twice.ok, answers.twice.reasons], [false, ['rejected']]);
    same('an empty batch', [answers.nothing.ok, answers.nothing.reasons], [false, ['rejected']]);
    same('a ledger entry is not rewritten through this door either', [answers.ledgerRewrite.ok, answers.ledgerRewrite.reasons], [false, ['conflict']]);
    same('seven refusals, and not a byte moved anywhere', snapshot(), still);

    // A REFUSAL IS FOR THE WHOLE BATCH. A good payment beside a rewrite is not written.
    const good = plan(d, 'planPayment', 'ps_w_khaled_20261002', 100, { paymentId: 'pp_good00000001', date: TODAY }, stamp(TODAY, d.id));
    given('a later payment is allowed', good.ok === true);
    const mixed = d.State.commitPaybook(good.changes.concat([{ path: 'pay.pp_ps_w_khaled_20261002', value: tampered }]));
    same('a good entry in a batch with a rewrite is not written: all or nothing',
        [mixed.ok, mixed.written, d.State.schedule.pay.pp_good00000001], [false, [], undefined]);
    same('still not a byte moved', snapshot(), still);

    // --- door 2: the one minting path of the queue, for a caller that went round door 1.
    const direct = {
        nulled: d.Sync.queueBatch([{ path: 'pay.pp_ps_w_khaled_20261002', value: null }]),
        rewrite: d.Sync.queueBatch([{ path: 'pay.pp_ps_w_khaled_20261002', value: tampered }]),
        garbage: d.Sync.queueBatch([{ path: 'pay.pp_xx0000000001', value: { id: 'pp_xx0000000001', kind: 'payment' } }]),
        beside: d.Sync.queueBatch([{ path: 'days.2026-10-18.actual.w_nasser', value: { entries: [{ placeId: 'p_a' }] } },
            { path: 'pay.pp_ps_w_khaled_20261002', value: tampered }])
    };
    same('the journal itself refuses a null, a rewrite and an entry nobody could have written',
        [direct.nulled, direct.rewrite, direct.garbage], [false, false, false]);
    same('and a day in the same batch is not journalled without it: a batch is one write', direct.beside, false);
    same('nothing was minted', batchKeys(d).length, still[1]);

    // The ordinary commit, misused: memory is changed first, as every other caller does.
    d.said.length = 0;
    d.State.schedule.pay.pp_ps_w_khaled_20261002 = tampered;
    const misused = d.State.commit({ path: 'pay.pp_ps_w_khaled_20261002', value: tampered });
    same('State.commit with a rewrite: refused, and the payment on the screen is the 2,000 again',
        [misused, d.State.schedule.pay.pp_ps_w_khaled_20261002.amount, d.said.length], [false, 2000, 1]);
    same('and still not a byte moved on the disk', [d.raw(SCHEDULE), batchKeys(d).length], [still[0], still[1]]);

    // --- door 3: the queue's READER. A batch on the disk that deletes a pay entry is not
    // a queue this app wrote, and it is not replayed.
    const forged = payDevice({ storage: (() => {
        const disk = d.dump();
        disk['farkad:outbox:op:forged01'] = JSON.stringify({ batchId: 'forged01', at: '2026-10-16T12:00:00.000Z',
            ops: [{ opId: 'o_forged', path: 'pay.pp_ps_w_khaled_20261002', value: null, seq: 9999, base: null, after: [] }] });
        return disk;
    })(), deviceId: d.id });
    forged.State.load();
    same('a queue record carrying `pay.<id>: null` is not replayed over the record',
        forged.State.schedule.pay.pp_ps_w_khaled_20261002.amount, 2000);

    // --- ONE FACT. The same closure again writes nothing; so does another hand's copy of it.
    const batchesNow = batchKeys(d).length;
    const twice = d.State.commitPaybook(drawn.changes);
    same('the same plan committed again: ok, nothing written, every path named as the same fact',
        [twice.ok, twice.written, twice.same.length, batchKeys(d).length], [true, [], 6, batchesNow]);
    const otherHand = fullClosure(d, 'd_other_hand');
    same('re-planning a closed account is refused by the planner (`closed`, `statement`)',
        [otherHand.ok, otherHand.reasons.indexOf('closed') !== -1, otherHand.reasons.indexOf('statement') !== -1], [false, true, true]);
    const resigned = drawn.changes.map(change => ({ path: change.path,
        value: Object.assign({}, change.value, { at: '2026-10-16T13:30:00.000Z', by: 'd_other_hand' }) }));
    const second = d.State.commitPaybook(resigned);
    same('the same money under another signer and another moment is the same fact: nothing written',
        [second.ok, second.written, second.same.length], [true, [], 6]);
    same('and the first signer stands', d.State.schedule.pay.ps_w_khaled_20261002.by, d.id);
    same('not a byte moved for either', snapshot(), still);
}

// =====================================================================================
{
    suite('A DISAGREEMENT: two bodies under one id, both kept, and only the pay planners stop');

    const d = world({ advances: ADVANCES });
    openBook(d);
    given('the closure is committed', d.State.commitPaybook(fullClosure(d).changes).ok === true);
    const mine = clone(d.State.schedule.pay.pp_ps_w_khaled_20261002);       // 2,000
    const theirs = Object.assign({}, mine, { amount: 3000, by: 'd_other', at: '2026-10-16T09:00:00.000Z' });

    // The union, as the three doors call it: `standing` is the document that outranks.
    const U = (standing, other) => d.call('paybookUnion', standing, other);
    const cloud = { pay: Object.assign({}, clone(d.State.schedule.pay), { pp_ps_w_khaled_20261002: theirs }) };
    const union = U(cloud, d.State.schedule);
    same('one id, different money: the standing document\'s copy stands',
        [union.pay.pp_ps_w_khaled_20261002.amount, union.clashes], [3000, ['pp_ps_w_khaled_20261002']]);
    same('the other is kept beside it, whole', canonical(union.payConflicted), canonical({ pp_ps_w_khaled_20261002: [mine] }));
    same('nothing else is touched or lost', Object.keys(union.pay).sort(), Object.keys(d.State.schedule.pay).sort());
    same('the union is the same whichever way the entries arrived, apart from who stands',
        [U(d.State.schedule, cloud).pay.pp_ps_w_khaled_20261002.amount, canonical(U(d.State.schedule, cloud).payConflicted)],
        [2000, canonical({ pp_ps_w_khaled_20261002: [theirs] })]);
    same('unioned a second time, the disagreement is still one variant - not two',
        (again => [again.pay.pp_ps_w_khaled_20261002.amount, again.payConflicted.pp_ps_w_khaled_20261002.length])(
            U({ pay: union.pay, payConflicted: union.payConflicted }, d.State.schedule)), [3000, 1]);
    same('a document with NO pay map at all removes nothing', [canonical(U({}, d.State.schedule).pay),
        canonical(U(d.State.schedule, {}).pay), U({}, d.State.schedule).clashes], [bookOf(d), bookOf(d), []]);
    same('the same money under another hand is one fact: nothing beside, nothing clashing',
        (one => [one.clashes, one.payConflicted, one.pay.pp_ps_w_khaled_20261002.by])(
            U({ pay: { pp_ps_w_khaled_20261002: Object.assign({}, mine, { by: 'd_other', at: '2026-10-16T09:00:00.000Z' }) } }, d.State.schedule)),
        [[], {}, 'd_other']);
    check('neither input was touched', canonical(cloud.pay.pp_ps_w_khaled_20261002) === canonical(theirs)
        && d.State.schedule.pay.pp_ps_w_khaled_20261002.amount === 2000 && d.State.schedule.payConflicted === undefined);

    // ON THE RECORD, across a save and a reopen. Laid on as receive() lays it.
    d.call('layPaybookUnion', d.State.schedule, cloud, d.State.schedule);
    given('the record is saved', d.State.persist() === true);
    const r = reopen(d);
    same('REOPENED: both bodies are still there - the 3,000 standing, the 2,000 beside',
        [r.State.schedule.pay.pp_ps_w_khaled_20261002.amount, canonical(r.State.schedule.payConflicted)],
        [3000, canonical({ pp_ps_w_khaled_20261002: [mine] })]);
    same('THE PHONE IS NOT STOPPED: no Recovery problem, writing is not blocked',
        [r.call('farkadWritesBlocked'), r.global('Recovery').problems.length], [false, 0]);
    same('a day can be recorded, by anybody, as on any evening', r.State.commit(
        r.call('assignPlace', r.State.schedule, '2026-10-18', 'w_khaled', 'actual', 'p_a')), true);
    same('the fold names the disagreement, with the man it belongs to',
        r.call('paybookFold', r.State.schedule).conflicts, [{ id: 'pp_ps_w_khaled_20261002', variants: 1, workerIds: ['w_khaled'] }]);
    same('and counts ONLY the copy that stands: 3,000 paid, 650 due',
        (of => [of.paid, of.due])(r.call('paybookFold', r.State.schedule).statements.ps_w_khaled_20261002), [3000, 650]);
    same('his account says a person has to look', r.call('accountFor', r.State.schedule, 'w_khaled', TODAY).status, 'review');
    same('every pay planner for HIM refuses with `conflict`', [
        plan(r, 'planPayment', 'ps_w_khaled_20261002', 100, { paymentId: 'pp_more00000001', date: TODAY }, stamp(TODAY, r.id)).reasons,
    ].map(reasons => reasons.indexOf('conflict') !== -1), [true]);
    const salim = plan(r, 'planClosure', 'w_salim', FORTNIGHT, {}, stamp(TODAY, r.id));
    same('ANOTHER man\'s account closes as on any day', [salim.ok, r.State.commitPaybook(salim.changes).ok], [true, true]);
    same('the commit refuses to write over the disputed id, from either side',
        [mine, theirs].map(body => r.State.commitPaybook([{ path: 'pay.pp_ps_w_khaled_20261002', value: body }]).reasons),
        [['conflict'], ['conflict']]);
    same('a second save and reopen later, the two bodies are still two',
        (again => [again.State.schedule.pay.pp_ps_w_khaled_20261002.amount,
            again.State.schedule.payConflicted.pp_ps_w_khaled_20261002.map(v => v.amount)])(reopen(r)), [3000, [2000]]);

    // The journal's replay obeys the same law: it never lays a queued body over one that stands.
    const laid = clone(r.State.schedule);
    same('layPaybookEntry: an id that is not there is added; the same fact is left; a different one goes beside',
        [d.call('layPaybookEntry', laid, 'pp_fresh0000001', Object.assign({}, mine, { id: 'pp_fresh0000001' })),
            d.call('layPaybookEntry', laid, 'pp_ps_w_khaled_20261002', theirs),
            d.call('layPaybookEntry', laid, 'pp_ps_w_khaled_20261002', Object.assign({}, mine, { amount: 1 })),
            d.call('layPaybookEntry', laid, 'pp_ps_w_khaled_20261002', null),
            laid.pay.pp_ps_w_khaled_20261002.amount, laid.payConflicted.pp_ps_w_khaled_20261002.map(v => v.amount)],
        ['added', 'same', 'beside', 'same', 3000, [2000, 1]]);
}

// =====================================================================================
{
    suite('UNREADABLE: an entry this build could not have written is kept where it lies, and somebody is told');

    const d = world({ advances: ADVANCES });
    openBook(d);
    given('the closure is committed', d.State.commitPaybook(fullClosure(d).changes).ok === true);

    // Three ways an entry can be unreadable: a kind from a build that does not exist yet,
    // a sum that is text, and a null where an entry should be.
    const future = { id: 'pb_w_khaled_1', kind: 'bonus', workerId: 'w_khaled', amount: 700,
        date: '2026-10-16', at: '2026-10-16T10:00:00.000Z', by: 'd_future' };
    const texty = Object.assign({}, clone(d.State.schedule.pay.pp_ps_w_khaled_20261002),
        { id: 'pp_texty0000001', amount: '400' });
    const disk = d.dump();
    const record = JSON.parse(disk[SCHEDULE]);
    record.pay.pb_w_khaled_1 = future;
    record.pay.pp_texty0000001 = texty;
    record.pay.pp_null00000001 = null;
    disk[SCHEDULE] = JSON.stringify(record);

    const r = payDevice({ storage: disk, deviceId: d.id });
    r.State.load();
    const unreadableIds = ['pb_w_khaled_1', 'pp_null00000001', 'pp_texty0000001'];
    same('NOT DROPPED and NOT MOVED: each is still at pay.<id>, exactly as it arrived',
        unreadableIds.map(id => canonical(r.State.schedule.pay[id])), [future, null, texty].map(canonical));
    same('the readable entries beside them are all still there', Object.keys(r.State.schedule.pay).length, 4 + 3);
    same('Recovery holds a problem under the pay book\'s own key, and writing is blocked',
        [r.global('Recovery').problems.map(problem => problem.key), r.call('farkadWritesBlocked')],
        [['scheduleData:v2:pay'], true]);
    same('QUARANTINED: a copy of exactly the three, read back off the disk',
        canonical(JSON.parse(r.raw('scheduleData:v2:pay:damaged'))),
        canonical({ pb_w_khaled_1: future, pp_null00000001: null, pp_texty0000001: texty }));
    check('the person is told in the pay book\'s own words, not the ledger\'s',
        r.global('Recovery').problems[0].message.indexOf('סגירות החשבון והתשלומים') !== -1);
    same('WHAT IT BLOCKS, before anybody has looked: a day is refused, like every other write',
        r.State.commit(r.call('assignPlace', r.State.schedule, '2026-10-18', 'w_khaled', 'actual', 'p_a')), false);
    same('the fold holds all three by id and counts none of them',
        [r.call('paybookFold', r.State.schedule).held.map(row => row.id).sort(),
            r.call('paybookFold', r.State.schedule).statements.ps_w_khaled_20261002.paid], [unreadableIds, 2000]);
    same('the man the unreadable entries name reads `review`',
        r.call('accountFor', r.State.schedule, 'w_khaled', TODAY).status, 'review');

    // The rescue file is how those bytes leave the phone.
    r.call('exportRecoveryData');
    given('a rescue file was produced', r.downloads.length === 1);
    const rescue = JSON.parse(r.downloads[0].text);
    check('the rescue file carries the quarantined copy under its own name',
        typeof rescue.records['scheduleData:v2:pay:damaged'] === 'string'
        && rescue.records['scheduleData:v2:pay:damaged'].indexOf('"bonus"') !== -1, Object.keys(rescue.records || {}).join(','));
    check('and the record itself, with the entries still in it',
        JSON.parse(rescue.records[SCHEDULE]).pay.pb_w_khaled_1.kind === 'bonus');

    // Acknowledged: writing resumes, and the entries are STILL where they were.
    same('after the export and «הבנתי» writing resumes', [r.global('Recovery').acknowledge(), r.call('farkadWritesBlocked')], [true, false]);
    given('a day is recorded', r.State.commit(
        r.call('assignPlace', r.State.schedule, '2026-10-18', 'w_khaled', 'actual', 'p_a')) === true);
    same('the save that followed wrote all three back, byte for byte',
        unreadableIds.map(id => canonical(onDisk(r).pay[id])), [future, null, texty].map(canonical));
    const again = reopen(r);
    same('the next open finds them, holds the phone again until told, and reuses the same quarantine copy',
        [unreadableIds.map(id => canonical(again.State.schedule.pay[id])), again.call('farkadWritesBlocked'),
            Object.keys(again.dump()).filter(key => key.indexOf('scheduleData:v2:pay:damaged') === 0)],
        [[future, null, texty].map(canonical), true, ['scheduleData:v2:pay:damaged']]);

    // A PAYMENT WHOSE STATEMENT HAS NOT ARRIVED IS NOT UNREADABLE. It is the ordinary
    // order of two field paths on a wire that promises none, and stopping a phone for it
    // would stop every phone, daily.
    const early = world();
    openBook(early);
    const orphan = { id: 'pp_early0000001', kind: 'payment', workerId: 'w_salim', statementId: 'ps_w_salim_20261002',
        date: TODAY, amount: 500, at: '2026-10-16T10:00:00.000Z', by: 'd_other' };
    const earlyDisk = early.dump();
    const earlyRecord = JSON.parse(earlyDisk[SCHEDULE]);
    earlyRecord.pay.pp_early0000001 = orphan;
    earlyDisk[SCHEDULE] = JSON.stringify(earlyRecord);
    const waiting = payDevice({ storage: earlyDisk, deviceId: early.id });
    waiting.State.load();
    same('a payment that arrived before its statement: kept, held by the FOLD, and the phone not stopped',
        [canonical(waiting.State.schedule.pay.pp_early0000001), waiting.call('farkadWritesBlocked'),
            waiting.call('paybookFold', waiting.State.schedule).held.map(row => row.id),
            Object.keys(waiting.call('paybookUnreadable', waiting.State.schedule))],
        [canonical(orphan), false, ['pp_early0000001'], []]);

    // THE CONTAINER ITSELF. A `pay` that is a string has no entries to take out of it.
    // (With the queue long since collected: a journal that still held the closure would
    // replay its entries into the empty book, which is right and is not this check.)
    const stringy = d.dump();
    Object.keys(stringy).filter(key => key.indexOf('farkad:outbox') === 0).forEach(key => { delete stringy[key]; });
    const stringyRecord = JSON.parse(stringy[SCHEDULE]);
    stringyRecord.pay = 'this was a pay book';
    stringy[SCHEDULE] = JSON.stringify(stringyRecord);
    const held = payDevice({ storage: stringy, deviceId: d.id });
    held.State.load();
    same('a `pay` that is not a record: read as an empty book, its bytes carried on the record, the phone held',
        [held.State.schedule.pay, held.State.schedule.payUnreadableContainer, held.call('farkadWritesBlocked'),
            held.global('Recovery').problems.map(problem => problem.key)],
        [{}, { pay: 'this was a pay book' }, true, ['scheduleData:v2:pay:container']]);
    held.global('Recovery').acknowledge();
    given('a day is recorded after the acknowledgement', held.State.commit(
        held.call('assignPlace', held.State.schedule, '2026-10-18', 'w_khaled', 'actual', 'p_a')) === true);
    same('the bytes survive this phone\'s own save, under the name nothing folds',
        [onDisk(held).payUnreadableContainer, reopen(held).State.schedule.payUnreadableContainer],
        [{ pay: 'this was a pay book' }, { pay: 'this was a pay book' }]);
    same('a REPLACEMENT with such a container is refused at the door, in its own sentence',
        [d.call('readReplacementDocument', stringyRecord).document,
            d.call('readReplacementDocument', stringyRecord).problems],
        [null, ['רישום סגירות החשבון בקובץ אינו בצורה שאפשר לקרוא.']]);
    same('a document with no `pay` at all - every record before v173 - is a whole schedule, and an empty book',
        (old => { delete old.pay; const read = d.call('readReplacementDocument', old);
            return [read.problems, d.call('normaliseSchedule', read.document).pay]; })(clone(record)), [[], {}]);
}

// =====================================================================================
{
    suite('POISON: `__proto__` as a pay id, through every writer and every reader');

    const d = world({ advances: ADVANCES });
    openBook(d);
    given('the closure is committed', d.State.commitPaybook(fullClosure(d).changes).ok === true);
    const payment = clone(d.State.schedule.pay.pp_ps_w_khaled_20261002);
    const NAMES = ['__proto__', 'constructor', 'prototype'];
    const still = [d.raw(SCHEDULE), batchKeys(d).length];

    same('the validator refuses each name as an id', NAMES.map(name =>
        d.call('payEntryProblems', name, Object.assign({}, payment, { id: name }))),
    NAMES.map(() => ['a pay entry under an id nobody could write']));
    same('the journal\'s reader refuses each as a path', NAMES.map(name =>
        d.call('journalEntryProblems', 'pay.' + name, Object.assign({}, payment, { id: name }))),
    NAMES.map(() => ['a path that would land on the prototype']));
    same('the commit refuses each', NAMES.map(name =>
        d.State.commitPaybook([{ path: 'pay.' + name, value: Object.assign({}, payment, { id: name }) }]).reasons),
    NAMES.map(() => ['rejected']));
    same('the one minting path of the queue refuses each', NAMES.map(name =>
        d.Sync.queueBatch([{ path: 'pay.' + name, value: Object.assign({}, payment, { id: name }) }])),
    [false, false, false]);
    same('and nothing was written by any of the twelve', [d.raw(SCHEDULE), batchKeys(d).length], still);
    // The statement's own nested ids: an advance named after the prototype.
    const statement = clone(d.State.schedule.pay.ps_w_khaled_20261002);
    statement.advanceDeductions[0].advanceId = '__proto__';
    same('a statement deducting from an advance called `__proto__` is refused',
        d.call('payEntryProblems', statement.id, statement), ['a statement deducting from an advance nobody could name']);
    same('a worker id that is a prototype name is refused',
        d.call('payEntryProblems', 'pp_poison0000001', Object.assign({}, payment, { id: 'pp_poison0000001', workerId: 'constructor' })),
        ['a pay entry belonging to nobody']);

    // The merge and the replay, handed a document that already HAS the key as an own
    // property - which is what JSON.parse makes of it.
    const poisoned = JSON.parse('{"pay":{"__proto__":{"amount":999,"kind":"payment"},"constructor":{"x":1}},'
        + '"payConflicted":{"__proto__":[{"amount":1}]}}');
    given('the fixture really carries own keys', Object.keys(poisoned.pay).length === 2);
    d.ctx.__poisoned = poisoned;
    d.ctx.__mine = d.State.schedule;
    same('paybookUnion skips the names from either side and reparents nothing', inside(d, `(() => {
        const out = [];
        [paybookUnion(__poisoned, __mine), paybookUnion(__mine, __poisoned)].forEach(union => {
            out.push(Object.getPrototypeOf(union.pay) === Object.getPrototypeOf({}),
                Object.getPrototypeOf(union.payConflicted) === Object.getPrototypeOf({}),
                Object.keys(union.pay).length === Object.keys(__mine.pay).length,
                union.pay.amount === undefined, ({}).amount === undefined);
        });
        return JSON.stringify(out);
    })()`), JSON.stringify(Array(10).fill(true)));
    same('layPaybookEntry does nothing at all for a poison id', inside(d, `(() => {
        const target = { pay: {} };
        const said = ['__proto__', 'constructor', 'prototype'].map(name => layPaybookEntry(target, name, { amount: 5 }));
        return JSON.stringify([said, Object.keys(target.pay), Object.getPrototypeOf(target.pay) === Object.getPrototypeOf({})]);
    })()`), JSON.stringify([['same', 'same', 'same'], [], true]));

    // The door every document comes in by.
    const disk = d.dump();
    disk[SCHEDULE] = disk[SCHEDULE].replace('"pay":{', '"pay":{"__proto__":{"id":"__proto__","kind":"payment","amount":999},');
    given('the disk now carries the name under pay', disk[SCHEDULE].indexOf('"pay":{"__proto__"') !== -1);
    const r = payDevice({ storage: disk, deviceId: d.id });
    r.State.load();
    same('normaliseSchedule: the map is not reparented, the readable entries are all there, nothing invented',
        [inside(r, 'Object.getPrototypeOf(State.schedule.pay) === Object.getPrototypeOf({})'),
            Object.keys(r.State.schedule.pay).sort(), r.State.schedule.pay.amount, bookOf(r)],
        [true, Object.keys(d.State.schedule.pay).sort(), undefined, bookOf(d)]);
    same('the bytes under the name are quarantined as evidence and the phone is held',
        [r.global('Recovery').problems.map(problem => problem.key), r.call('farkadWritesBlocked'),
            r.raw('scheduleData:v2:poison:pay.__proto__:damaged')],
        [['scheduleData:v2:poison:pay.__proto__'], true, '{"id":"__proto__","kind":"payment","amount":999}']);
    same('a replacement door refuses such a file before it can hold this phone',
        d.call('poisonedMapProblems', JSON.parse(disk[SCHEDULE])),
        ['ברישום יש שם שאי אפשר להשתמש בו כמפתח (pay.__proto__).']);
}

// =====================================================================================
{
    suite('BACKUPS: the backup file, a restore point and the rescue file carry the book');

    const d = world({ advances: ADVANCES });
    openBook(d);
    given('the closure is committed', d.State.commitPaybook(fullClosure(d).changes).ok === true);
    // A disagreement on the record too, so that what is kept beside travels as well.
    const beside = Object.assign({}, clone(d.State.schedule.pay.pp_ps_w_khaled_20261002), { amount: 1234, by: 'd_other' });
    d.State.schedule.payConflicted = { pp_ps_w_khaled_20261002: [beside] };
    given('the record is saved', d.State.persist() === true);
    const book = bookOf(d);
    const besideBytes = canonical(d.State.schedule.payConflicted);

    // --- the backup file
    d.call('exportBackup');
    given('a backup file was handed over', d.downloads.length === 1 && /^farkad-.*\.json$/.test(d.downloads[0].name));
    const file = JSON.parse(d.downloads[0].text);
    same('the backup file holds the pay book and what is kept beside it, byte for byte',
        [canonical(file.pay), canonical(file.payConflicted)], [book, besideBytes]);

    // --- a restore point
    d.call('takeDailySnapshot');
    const snaps = Object.keys(d.dump()).filter(key => key.startsWith('scheduleData:snap:'));
    given('a restore point was written', snaps.length === 1, JSON.stringify(Object.keys(d.dump())));
    same('the restore point holds them, byte for byte',
        (snap => [canonical(snap.pay), canonical(snap.payConflicted)])(JSON.parse(d.raw(snaps[0]))), [book, besideBytes]);

    // --- the way back (the state a restore replaces)
    given('the way-back state is pushed', d.call('pushUndoState', d.State.schedule) === true);
    same('the way back holds them',
        (undo => [canonical(undo.pay), canonical(undo.payConflicted)])(JSON.parse(d.call('peekUndoState'))), [book, besideBytes]);

    // --- the rescue file, and a schedule rebuilt out of it on another phone
    d.call('exportRecoveryData');
    const rescueFile = d.downloads[d.downloads.length - 1];
    const rescue = JSON.parse(rescueFile.text);
    same('the rescue file\'s copy of the record holds them',
        (raw => [canonical(raw.pay), canonical(raw.payConflicted)])(JSON.parse(rescue.records[SCHEDULE])), [book, besideBytes]);
    const facts = d.call('recoveryFacts', d.State.schedule);
    same('the rescue\'s comparison of two captures knows each pay entry as a fact of its own',
        Object.keys(facts).filter(key => key.indexOf('pay') === 0).sort(),
        ['pay:pd_w_khaled_20261002_1', 'pay:po_open', 'pay:pp_ps_w_khaled_20261002', 'pay:ps_w_khaled_20261002',
            'payConflicted:pp_ps_w_khaled_20261002']);
    const lesser = clone(d.State.schedule);
    delete lesser.pay.pp_ps_w_khaled_20261002;
    same('so a capture that lost a payment does not "contain everything" the other holds',
        [d.call('accountsFor', d.call('recoveryFacts', lesser), facts), d.call('accountsFor', facts, d.call('recoveryFacts', lesser))],
        [false, true]);
    const rebuilt = d.call('scheduleFromRecoveryRecords', rescue.records, null);
    same('a schedule rebuilt from the rescue file holds the book, and names nothing as lost',
        [canonical(rebuilt.schedule.pay), canonical(rebuilt.schedule.payConflicted),
            rebuilt.tried.filter(line => line.indexOf('סגירת חשבון') !== -1)], [book, besideBytes, []]);

    // --- restored onto another phone, the file brings the book with it
    const fresh = payDevice({ shipped: true });
    fresh.ctx.askConfirm = said => { fresh.said.push(said.message || ''); return Promise.resolve(true); };
    fresh.call('importBackup', fresh.fileEvent(d.downloads[0].name, d.downloads[0].text));
    await new Promise(resolve => setTimeout(resolve, 60));
    same('a phone with an empty book that loads the backup file holds the book - writer off or not',
        [bookOf(fresh), canonical(fresh.State.schedule.payConflicted), bookOf(reopen(fresh, { shipped: true }))],
        [book, besideBytes, book]);
    check('its confirmation said nothing about pay entries being kept: this phone held none',
        fresh.said.length > 0 && fresh.said[0].indexOf('סגירות חשבון ותשלומים') === -1, JSON.stringify(fresh.said));

    // --- AN OLD BACKUP, written before the pay book, restored onto a phone that has one.
    const old = clone(file);
    delete old.pay;
    delete old.payConflicted;
    // The old file is a different evening too: one of Khaled's days is not in it.
    delete old.days['2026-10-15'];
    const read = d.call('readReplacementDocument', old);
    same('a backup with no `pay` is a whole schedule, and reads as a file with no pay entries',
        [read.problems, canonical(d.call('normaliseSchedule', read.document).pay)], [[], '{}']);
    const target = reopen(d);
    target.ctx.askConfirm = said => { target.said.push(said.message || ''); return Promise.resolve(true); };
    target.said.length = 0;
    target.call('importBackup', target.fileEvent('farkad-old.json', JSON.stringify(old)));
    await new Promise(resolve => setTimeout(resolve, 60));
    check('the old backup was restored: the day it does not have is gone',
        target.State.schedule.days['2026-10-15'] === undefined, JSON.stringify(Object.keys(target.State.schedule.days)));
    same('AND NOT ONE PAY ENTRY WAS ERASED BY IT - the book and what is beside it are unioned in',
        [bookOf(target), canonical(target.State.schedule.payConflicted)], [book, besideBytes]);
    same('nor the closure\'s ledger entries, by the rule that was already there',
        target.State.schedule.ledger.advances.le_period_w_khaled_20261002.gross, 4400);
    same('it survives the reopen', bookOf(reopen(target)), book);
    check('THE CONFIRMATION SAID SO: on a phone that holds pay entries, the dialog names what is kept',
        target.said.length > 0 && target.said[0].indexOf(
            'הקובץ יחליף את כל הנתונים הקיימים, והמצב הנוכחי יישמר כגיבוי מקומי.'
            + ' סגירות חשבון ותשלומים שכבר נרשמו אינם נמחקים בשחזור - הם נשארים רשומים.') !== -1,
        JSON.stringify(target.said));
    same('the sentence is the pinned one, and empty on a phone with no pay entry',
        [target.call('payKeptOnRestoreNotice'), payDevice({ shipped: true }).call('payKeptOnRestoreNotice')],
        [' סגירות חשבון ותשלומים שכבר נרשמו אינם נמחקים בשחזור - הם נשארים רשומים.', '']);

    // --- a restore point from before a later payment, restored: the payment stays.
    const later = reopen(d);
    later.call('takeDailySnapshot');
    const point = Object.keys(later.dump()).filter(key => key.startsWith('scheduleData:snap:'))[0];
    // Decide the disagreement out of the way first: the planner refuses a man in dispute.
    delete later.State.schedule.payConflicted;
    given('the record is saved', later.State.persist() === true);
    const more = plan(later, 'planPayment', 'ps_w_khaled_20261002', 650, { paymentId: 'pp_after0000001', date: TODAY }, stamp(TODAY, later.id));
    given('a later payment is committed', more.ok === true && later.State.commitPaybook(more.changes).ok === true, JSON.stringify(more.reasons));
    later.ctx.askConfirm = () => Promise.resolve(true);
    await later.call('restoreSnapshot', point.slice('scheduleData:snap:'.length));
    await new Promise(resolve => setTimeout(resolve, 60));
    same('a restore point taken BEFORE a payment, restored after it: the payment is still on the record',
        [later.State.schedule.pay.pp_after0000001 && later.State.schedule.pay.pp_after0000001.amount,
            later.call('accountFor', later.State.schedule, 'w_khaled', TODAY).wageDue,
            reopen(later).State.schedule.pay.pp_after0000001.amount], [650, 1000, 650]);
}

// =====================================================================================
{
    suite('CAPACITY: what a season of closures weighs - reported, against Firestore\'s 1 MiB');

    // WHAT IS MEASURED, AND HOW. Every entry below is produced by the shipped writers on a
    // real record - a day, a closed week, a closed fortnight, each with an advance touched
    // and a payment - and its bytes are what the app itself stores. A year is then those
    // entries repeated under fresh ids, laid into a document the size the app would really
    // hold, and the DOCUMENT is weighed. Nothing is multiplied out on paper.
    //
    // Two weights, because two limits apply to the one record:
    //   the cloud document   Firestore refuses a document over 1,048,576 bytes, counted
    //                        its own way (a string is its UTF-8 bytes + 1, a number 8, a
    //                        boolean or null 1, a field name its bytes + 1, 32 for the
    //                        document) - and the WHOLE schedule is one document
    //   scheduleData:v2      what one copy costs the phone, two bytes a UTF-16 unit, the
    //                        way tests/capacity.test.mjs charges it; the app keeps up to
    //                        seven more copies beside it (restore points, the way back)
    //
    // THE CREW IS AN ASSUMPTION AND IS SAID. Thirty men is the brief's figure and the one
    // js/ui/backup.js was measured at; fourteen is the crew docs/transport-spec.md sizes a
    // day by. Six days a week, every week. One closure in four deducts an advance.
    const MIB = 1024 * 1024;
    const utf8 = text => Buffer.byteLength(String(text), 'utf8');
    const firestoreSize = value => {
        if (value === null || typeof value === 'boolean') return 1;
        if (typeof value === 'number') return 8;
        if (typeof value === 'string') return utf8(value) + 1;
        if (Array.isArray(value)) return value.reduce((sum, item) => sum + firestoreSize(item), 0);
        return Object.keys(value).reduce((sum, key) => sum + utf8(key) + 1 + firestoreSize(value[key]), 0);
    };
    const documentSize = doc => utf8('schedules') + 1 + utf8('current') + 1 + 16 + firestoreSize(doc) + 32;

    const d = world({ advances: [['w_ahmad', '2026-10-03', 500], ['w_khaled', '2026-10-03', 500]] });
    openBook(d);
    const kindOf = (changes, kind) => clone(changes.filter(change => change.value.kind === kind)[0].value);
    const [a1] = advancesOf(d, 'w_ahmad');
    const [k1] = advancesOf(d, 'w_khaled');
    const weekly = plan(d, 'planClosure', 'w_ahmad', WEEK1, { allocations: { [a1]: 200 }, paid: 1600, paidOn: '2026-10-09' }, stamp('2026-10-09', d.id));
    const fortnightly = plan(d, 'planClosure', 'w_khaled', FORTNIGHT, { allocations: { [k1]: 200 }, paid: 4200, paidOn: TODAY }, stamp(TODAY, d.id));
    given('a weekly and a fortnightly closure are allowed', weekly.ok === true && fortnightly.ok === true,
        JSON.stringify([weekly.reasons, fortnightly.reasons]));
    const TEMPLATE = {
        day: clone(d.State.schedule.days['2026-10-05'].actual.w_ahmad),
        weekly: { artifact: kindOf(weekly.changes, 'closed'), deducted: kindOf(weekly.changes, 'deducted'),
            statement: kindOf(weekly.changes, 'statement'), payment: kindOf(weekly.changes, 'payment') },
        biweekly: { artifact: kindOf(fortnightly.changes, 'closed'), deducted: kindOf(fortnightly.changes, 'deducted'),
            statement: kindOf(fortnightly.changes, 'statement'), payment: kindOf(fortnightly.changes, 'payment') }
    };
    const bytes = value => utf8(JSON.stringify(value));
    const sizes = { workerDay: bytes(TEMPLATE.day) };
    ['weekly', 'biweekly'].forEach(cycle => Object.keys(TEMPLATE[cycle]).forEach(kind => {
        sizes[`${cycle}.${kind}`] = bytes(TEMPLATE[cycle][kind]);
    }));
    console.log('        one entry, JSON bytes: ' + JSON.stringify(sizes));
    check('a statement and its payment together weigh less than the frozen payslip the existing closure writes',
        sizes['weekly.statement'] + sizes['weekly.payment'] < sizes['weekly.artifact']
        && sizes['biweekly.statement'] + sizes['biweekly.payment'] < sizes['biweekly.artifact'], JSON.stringify(sizes));

    const dayAfter = (date, n) => new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
    // `closures`: false, or the cycle every man is settled on. `pay`: whether each closure
    // also writes a statement and one payment.
    const build = (men, weeks, options) => {
        const doc = clone(d.State.schedule);
        doc.workers = [];
        doc.days = {};
        doc.advances = {};
        doc.ledger = { advances: {}, unreadable: {}, migrations: doc.ledger.migrations || {}, unreadableMigrations: {} };
        doc.pay = options.pay ? { po_open: clone(d.State.schedule.pay.po_open) } : {};
        for (let m = 1; m <= men; m += 1) {
            doc.workers.push({ id: 'w_' + String(m).padStart(2, '0'), name: 'עובד מספר ' + m, idNumber: '',
                phone: '050-000-00' + String(m).padStart(2, '0'), dailyRate: 400, hourlyRate: 50,
                payCycles: options.closures === 'weekly' ? '2026-09-11=weekly' : '', active: true });
        }
        for (let week = 0; week < weeks; week += 1) {
            const friday = dayAfter('2026-10-02', week * 7);
            [0, 2, 3, 4, 5, 6].forEach(offset => {
                const date = dayAfter(friday, offset);
                doc.days[date] = { plan: {}, actual: {} };
                doc.workers.forEach(worker => { doc.days[date].actual[worker.id] = TEMPLATE.day; });
            });
            if (!options.closures) continue;
            if (options.closures === 'biweekly' && week % 2 === 1) continue;
            const made = TEMPLATE[options.closures];
            const key = friday.replace(/-/g, '');
            doc.workers.forEach((worker, at) => {
                const artifactId = `le_period_${worker.id}_${key}`;
                doc.ledger.advances[artifactId] = Object.assign({}, made.artifact, { id: artifactId, workerId: worker.id });
                const withAdvance = (at % 4) === 0;
                if (withAdvance) {
                    const entryId = `le_close_a_${worker.id}${key}_${key}`;
                    doc.ledger.advances[entryId] = Object.assign({}, made.deducted, { id: entryId, workerId: worker.id });
                }
                if (!options.pay) return;
                const statementId = `ps_${worker.id}_${key}`;
                doc.pay[statementId] = Object.assign({}, made.statement, { id: statementId, workerId: worker.id,
                    artifactId, advanceDeductions: withAdvance ? made.statement.advanceDeductions : [] });
                doc.pay['pp_' + statementId] = Object.assign({}, made.payment, { id: 'pp_' + statementId,
                    workerId: worker.id, statementId });
            });
        }
        return doc;
    };
    const weigh = (men, weeks, options) => {
        const doc = build(men, weeks, options);
        return { firestore: documentSize(d.call('cloudDocument', doc)), disk: JSON.stringify(doc).length * 2,
            pay: firestoreSize(doc.pay), ledger: firestoreSize(doc.ledger), days: firestoreSize(doc.days) };
    };
    const pct = size => (size / MIB * 100).toFixed(0) + '%';
    // Weeks until the cloud document reaches a share of 1 MiB, from its weekly growth.
    const runway = (men, options) => {
        const base = weigh(men, 0, options).firestore;
        const year = weigh(men, 52, options);
        const perWeek = (year.firestore - base) / 52;
        return { year, perWeek, half: (MIB / 2 - base) / perWeek, full: (MIB - base) / perWeek };
    };
    const SCENARIOS = [
        ['days only, nobody ever closed', { closures: false, pay: false }],
        ['closed every fortnight, as the app writes a closure TODAY', { closures: 'biweekly', pay: false }],
        ['closed every fortnight, with a statement and a payment', { closures: 'biweekly', pay: true }],
        ['closed every week, as the app writes a closure TODAY', { closures: 'weekly', pay: false }],
        ['closed every week, with a statement and a payment', { closures: 'weekly', pay: true }]
    ];
    const measured = {};
    [14, 30].forEach(men => {
        measured[men] = {};
        SCENARIOS.forEach(([label, options]) => {
            const m = runway(men, options);
            measured[men][label] = m;
            console.log(`        ${String(men).padStart(2)} men · ${label}: after 52 weeks ${m.year.firestore} B = ${pct(m.year.firestore)} of 1 MiB`
                + ` (days ${m.year.days}, ledger ${m.year.ledger}, pay ${m.year.pay});`
                + ` ${Math.round(m.perWeek)} B a week; 50% at week ${m.half.toFixed(0)}, 100% at week ${m.full.toFixed(0)}`
                + ` (${(m.full / 52).toFixed(1)} years); one copy on the phone ${m.year.disk} B = ${(m.year.disk / (5 * MIB) * 100).toFixed(0)}% of 5 MiB`);
        });
    });
    const at = (men, label) => measured[men][SCENARIOS.filter(row => row[0].indexOf(label) === 0)[0][0]];

    // THE FINDING, pinned as facts - so that it cannot quietly stop being true, and so that
    // nobody opens the gate on the strength of a suite that never weighed anything.
    check('the document is ALREADY on a clock with no closure at all: thirty men\'s days alone pass half of 1 MiB inside a year',
        at(30, 'days only').half < 52 && at(30, 'days only').full < 104,
        `50% at week ${at(30, 'days only').half.toFixed(0)}, 100% at week ${at(30, 'days only').full.toFixed(0)}`);
    check('THE CLOSURE AS IT IS WRITTEN TODAY is the heavy part: thirty men closed every fortnight cross 1 MiB inside a year, without one pay entry',
        at(30, 'closed every fortnight, as').full < 52, 'week ' + at(30, 'closed every fortnight, as').full.toFixed(0));
    check('thirty men closed every WEEK, with statements and payments, cross 1 MiB inside five months',
        at(30, 'closed every week, with').full < 22, 'week ' + at(30, 'closed every week, with').full.toFixed(0));
    check('a crew of fourteen closed every week, with statements and payments, crosses 1 MiB inside a year',
        at(14, 'closed every week, with').full < 52, 'week ' + at(14, 'closed every week, with').full.toFixed(0));
    check('and closed every fortnight, inside two years',
        at(14, 'closed every fortnight, with').full < 104, 'week ' + at(14, 'closed every fortnight, with').full.toFixed(0));
    check('THE PAY BOOK IS THE SMALLER HALF of what a closure adds - in every scenario it weighs less than the ledger entries beside it',
        [14, 30].every(men => ['closed every fortnight, with', 'closed every week, with']
            .every(label => at(men, label).year.pay < at(men, label).year.ledger)));
    check('but it is not free: in every scenario the document is full at least a sixth sooner with it than without',
        [14, 30].every(men => ['week', 'fortnight'].every(cycle =>
            at(men, `closed every ${cycle}, with`).full < at(men, `closed every ${cycle}, as`).full * (5 / 6))),
        JSON.stringify([14, 30].map(men => ['week', 'fortnight'].map(cycle =>
            [at(men, `closed every ${cycle}, as`).full.toFixed(1), at(men, `closed every ${cycle}, with`).full.toFixed(1)]))));
    check('so the writer stays shut in what is shipped', makeDevice().global('FARKAD_FLAGS').paybook === false);

    // And the union's cost on a phone, over a year of entries: it runs on every snapshot.
    const year = build(30, 52, { closures: 'weekly', pay: true });
    const started = Date.now();
    const union = d.call('paybookUnion', year, clone(year));
    console.log(`        paybookUnion over ${Object.keys(year.pay).length} entries against a copy of itself: ${Date.now() - started} ms`);
    same('the union of a year\'s book with a copy of itself is itself, with nothing beside',
        [Object.keys(union.pay).length, union.clashes.length, Object.keys(union.payConflicted).length],
        [Object.keys(year.pay).length, 0, 0]);
}

report();
