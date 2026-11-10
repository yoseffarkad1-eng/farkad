// tests/paybook.archive.test.mjs
//
// PHASE 5: a settled closure leaves the server's live document, and nothing is lost.
//
// The claim, in one line: after the move the SERVER's document is smaller, every PHONE's
// record is byte for byte what it was, and every figure anybody is paid from is the same
// figure - on the phone that moved it, on a phone that watched, on a phone that was away
// for all of it, and on a phone installed afterwards.
//
//   R1  the model: what may move and what may not, the row, whole <-> stripped
//   R2  the move on three phones: confirmed, idempotent; a closure from before statements
//       gets its copy first, then the drop
//   R3  never before the server confirms the copy
//   R4  a phone that lacks the detail: it fetches, or it does not adopt - and says so
//   R5  resumable: a lost answer, a refused step, a second phone doing the same move
//   R7  what is refused: no signal, unsent work, the gate shut
//   R8  life after the move: a correction to an archived closure, and the next closure
//   R9  a restore never erases a closure: every door, before and after the move
//   R10 the files: the backup, the rescue file and the daily cloud copy
//
// The fake cloud here runs with `payRules: true`: it refuses what firestore.rules refuse
// of a whole-document write. The real rules are measured in
// tests/paybook.archive.emulator.test.mjs.

import { makeCloud, settle, settleUntil } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import {
    FORTNIGHT, WEEK1, TODAY, clone, stamp, canonical, payDevice, world, advancesOf, plan, openBook, SERVER_FIRST
} from './paybook.world.mjs';

const SCHEDULE = 'scheduleData:v2';
const LATER = '2026-11-20';       // five weeks on: everything closed in October is old enough

const BASE = (() => {
    const first = world({ advances: [['w_khaled', '2026-10-03', 500], ['w_khaled', '2026-10-06', 400]] });
    openBook(first, undefined, 'd_seed');
    const schedule = clone(first.State.schedule);
    return { schedule, wire: first.call('cloudDocument', schedule), advances: advancesOf(first, 'w_khaled') };
})();
const [K1, K2] = BASE.advances;

const cloudWith = (options = {}) => makeCloud(Object.assign({ payRules: true,
    doc: Object.assign(clone(BASE.wire), { protocol: 2, revision: 1, lastOpId: 'op_seed' })
}, options));

function phone(id, cloud, options = {}) {
    const device = payDevice(Object.assign({ deviceId: id, flags: { paybookQueue: false },
        storage: options.storage || { [SCHEDULE]: JSON.stringify(BASE.schedule) } }, options));
    device.Sync.pushDelayMs = 5;
    device.State.load();
    if (cloud) device.Sync.connect(cloud.adapter);
    return device;
}
const again = (device, cloud) => {
    const next = payDevice({ storage: device.dump(), deviceId: device.id, flags: { paybookQueue: false } });
    next.Sync.pushDelayMs = 5;
    next.State.load();
    if (cloud) next.Sync.connect(cloud.adapter);
    return next;
};
const quiet = device => device.Sync.status === 'synced' && device.Sync.pendingCount() === 0;
const settled = (devices, limit = 8000) => settleUntil(() => devices.every(quiet), limit, 5);

const at = (root, path) => path.split('.').reduce((node, key) =>
    (node && typeof node === 'object' && Object.prototype.hasOwnProperty.call(node, key) ? node[key] : undefined), root);
const rowsOf = source => Object.keys(((source && source.payIndex) || {}).rows || {}).sort();
const payIds = source => Object.keys((source && source.pay) || {}).sort();
const ledgerIds = source => Object.keys(((source && source.ledger) || {}).advances || {}).sort();
const sizeOf = value => JSON.stringify(value).length;
const kinds = cloud => cloud.writes.filter(write => !write.replayed).map(write => write.kind);

// Everything a person is paid from, as one string: the pay book's own folds, the ledger's,
// and the two maps themselves. If any figure on any money screen moved, this moved.
const money = (device, today = TODAY) => {
    const S = device.State.schedule;
    const advances = Object.keys(device.call('currentAdvances', S)).sort();
    return canonical({
        accounts: device.call('accountsList', S, today),
        history: device.call('closureHistory', S, {}),
        advances: advances.map(id => device.call('advanceOutstanding', S, id)),
        closed: S.workers.map(man => [man.id, device.call('closedPeriods', S, man.id)]),
        carry: S.workers.map(man => [man.id, device.call('advanceCarryInto', S, man.id, '2026-10-16')]),
        payroll: device.call('payrollReport', S, '2026-10-02', '2026-10-15'),
        pay: S.pay,
        ledger: S.ledger.advances
    });
};

// One closure through the real door, paid in full unless told otherwise.
async function close(device, worker, period, choices = {}, hour = '10') {
    const draw = paid => plan(device, 'planClosure', worker, period,
        Object.assign({ method: 'cash' }, choices, paid === null ? {} : { paid, paidOn: TODAY }),
        stamp(TODAY, device.id, hour));
    const first = draw(null);
    given(`the closure of ${worker} is allowed`, first.ok === true, JSON.stringify(first.reasons));
    const drawn = choices.paid === 0 ? first : draw(choices.paid === undefined ? first.review.netDue : choices.paid);
    given(`and with its payment (${worker})`, drawn.ok === true, JSON.stringify(drawn.reasons));
    const answer = await device.Sync.transactPaybook(drawn);
    given(`the closure of ${worker} is on the server`, answer.state === 'closed', JSON.stringify(answer));
    return drawn;
}

// The world every section starts from: Khaled and Salim closed and paid in full, Nasser
// closed and not paid, Ahmad's first week closed the OLD way (no statement) on another
// phone and answered «שולם» afterwards. Ahmad's second week is open.
async function closedWorld(options = {}) {
    const cloud = cloudWith(options.cloud || {});
    const a = phone('d_a' + (options.tag || ''), cloud);
    const b = phone('d_b' + (options.tag || ''), cloud);
    await settled([a, b]);
    await close(a, 'w_khaled', FORTNIGHT, { allocations: { [K1]: 500, [K2]: 100 } });
    await close(a, 'w_salim', FORTNIGHT, { method: 'transfer' });
    await close(a, 'w_nasser', FORTNIGHT, { paid: 0 });
    await settled([a, b]);
    const old = b.call('closePeriodChanges', b.State.schedule, 'w_ahmad', WEEK1.from, WEEK1.to,
        `${TODAY}T08:00:00.000Z`, b.id, 0);
    given('the old dialog\'s closure is a list of ledger entries', Array.isArray(old) && old.length > 0, JSON.stringify(old).slice(0, 200));
    given('and is committed the old way', b.State.commitMany(old) === true);
    await settled([a, b]);
    const answer = plan(a, 'planLegacy', 'w_ahmad', WEEK1.from, { state: 'paid' }, stamp(TODAY, a.id, '11'));
    given('the older closure may be answered for', answer.ok === true, JSON.stringify(answer.reasons));
    const said = await a.Sync.transactPaybook(answer);
    given('the answer is on the server', said.state === 'closed', JSON.stringify(said));
    await settled([a, b]);
    return { cloud, a, b };
}

const KHALED = 'ps_w_khaled_20261002';
const SALIM = 'ps_w_salim_20261002';
const NASSER = 'ps_w_nasser_20261002';
const AHMAD = 'pl_le_period_w_ahmad_20261002';
const KHALED_PATHS = ['ledger.advances.le_period_w_khaled_20261002',
    `ledger.advances.le_close_${K1}_20261002`, `ledger.advances.le_close_${K2}_20261002`,
    'pay.ps_w_khaled_20261002', 'pay.pp_ps_w_khaled_20261002'].sort();

// ------------------------------------------------------------------------------------
{
    suite('R1: the model - what may move, the row it leaves, and whole <-> stripped');

    const { a, cloud } = await closedWorld({ tag: '1' });
    const S = a.State.schedule;
    const before = canonical(S);
    const drawn = a.call('planArchive', S, TODAY);
    same('the plan is a dry run: no changes, and the record is untouched',
        [drawn.ok, drawn.changes, canonical(S) === before], [true, [], true]);
    const by = Object.fromEntries(drawn.bundles.map(bundle => [`${bundle.workerId} ${bundle.periodFrom}`, bundle]));
    same('four closed periods, each with its state and - where it stays - the reason',
        drawn.bundles.map(bundle => [bundle.workerId, bundle.periodFrom, bundle.state, bundle.why]).sort(),
        [['w_ahmad', '2026-10-02', 'ready', null], ['w_khaled', '2026-10-02', 'ready', null],
            ['w_nasser', '2026-10-02', 'held', 'owed'], ['w_salim', '2026-10-02', 'ready', null]]);
    same('the totals count them', [drawn.totals.bundles, drawn.totals.ready, drawn.totals.held, drawn.totals.archived, drawn.totals.waiting],
        [4, 3, 1, 0, 0]);
    check('and say the live document would get smaller', drawn.totals.liveBytesAfter < drawn.totals.liveBytes,
        `${drawn.totals.liveBytes} -> ${drawn.totals.liveBytesAfter}`);
    const khaled = by['w_khaled 2026-10-02'];
    same('a bundle names its row and every path that would leave', [khaled.rowId, khaled.paths.slice().sort()], [KHALED, KHALED_PATHS]);
    same('the row stands for exactly those paths', a.call('paybookRowPaths', khaled.rowId, khaled.row).sort(), KHALED_PATHS);
    same('and is a row this build reads back', a.call('paybookIndexRowProblems', khaled.rowId, khaled.row), []);
    same('it carries the figures of the closure: whose, the period, the wage, each advance, the net, owed and paid',
        [khaled.row.w, khaled.row.f, khaled.row.t, khaled.row.g, Object.keys(khaled.row.a).map(id => [id, khaled.row.a[id][0]]).sort(), khaled.row.n,
            khaled.row.o, khaled.row.p, khaled.row.s, khaled.row.e],
        ['w_khaled', '2026-10-02', '2026-10-15', 4400, [[K1, 500], [K2, 100]].sort(), 3800, 3800, 3800, 'statement',
            ['pp_ps_w_khaled_20261002']]);
    same('no list sits inside a list anywhere in a row: Firestore refuses one (measured on the emulator)',
        (() => { const nested = value => (Array.isArray(value) ? value.some(one => Array.isArray(one) || nested(one))
            : (value && typeof value === 'object' ? Object.keys(value).some(key => nested(value[key])) : false));
            return [drawn.bundles.filter(bundle => bundle.row).some(bundle => nested(bundle.row)), nested({ a: [[1]] })]; })(), [false, true]);
    same('and the stored row turns back into the row the index folds read, fact for fact',
        canonical(a.call('paybookDerivedRow', khaled.row)), canonical(a.call('paybookIndexFrom', S).rows[KHALED]));
    // What a row costs, weighed the way Phase 3 weighed its own (the key and the JSON of the
    // value): the stored row is the derived one plus the names of the pay entries that left
    // with it. The capacity curve in docs/payroll-closure.md was drawn with the derived row.
    const weigh = (id, row) => id.length + JSON.stringify(row).length;
    const extra = drawn.bundles.filter(bundle => bundle.row && bundle.source === 'statement')
        .map(bundle => weigh(bundle.rowId, bundle.row) - weigh(bundle.rowId, a.call('paybookDerivedRow', bundle.row)));
    check('a stored row is heavier than the row Phase 3 weighed by the name of the payment that left with it - under 40 bytes',
        extra.length === 2 && extra.every(more => more > 0 && more < 40), JSON.stringify(extra));
    check('and is still under an eighth of the closure it stands for, on the smallest closure here (nine days, no advance)',
        drawn.bundles.filter(bundle => bundle.row && bundle.source === 'statement').every(bundle => weigh(bundle.rowId, bundle.row) * 8 < bundle.bytes),
        JSON.stringify(drawn.bundles.filter(bundle => bundle.row).map(bundle => [weigh(bundle.rowId, bundle.row), bundle.bytes])));
    same('an older closure answered «שולם» is ready too, under the answer\'s id',
        [by['w_ahmad 2026-10-02'].rowId, by['w_ahmad 2026-10-02'].source], [AHMAD, 'legacy']);
    same('a young closure waits when a horizon is given - and is ready past it',
        [a.call('planArchive', S, TODAY, { olderThanDays: 14 }).totals.waiting,
            a.call('planArchive', S, LATER, { olderThanDays: 14 }).totals.ready], [3, 3]);
    same('with the gate shut the plan refuses, and still describes',
        (() => { const shut = payDevice({ shipped: true, storage: a.dump(), deviceId: 'd_shut1' }); shut.State.load();
            const said = shut.call('planArchive', shut.State.schedule, TODAY); return [said.ok, said.reasons, said.bundles.length]; })(),
        [false, ['gate'], 4]);

    // whole <-> stripped, on the record as it stands, with rows laid in by hand.
    const indexed = clone(S);
    indexed.payIndex = { v: 1, rows: { [KHALED]: khaled.row, [SALIM]: by['w_salim 2026-10-02'].row } };
    const stripped = a.call('paybookStripCovered', indexed);
    same('stripping leaves out exactly what the rows stand for, and keeps the rows',
        [KHALED_PATHS.map(path => at(stripped, path)), rowsOf(stripped), payIds(stripped).indexOf(NASSER) !== -1],
        [KHALED_PATHS.map(() => undefined), [KHALED, SALIM], true]);
    check('and does not touch its input', canonical(indexed.pay) === canonical(S.pay));
    const fromLocal = a.call('paybookWhole', stripped, indexed, {});
    same('made whole from a record that holds the entries: nothing to fetch, and the same bytes',
        [fromLocal.missing, fromLocal.broken, canonical(fromLocal.document) === canonical(indexed)], [[], [], true]);
    const fromNothing = a.call('paybookWhole', stripped, null, {});
    same('from a record that holds nothing: the closed documents are named, and nothing is invented',
        [fromNothing.missing.slice().sort(), fromNothing.broken], [[KHALED, SALIM], []]);
    const docs = Object.fromEntries([...cloud.closed.entries()]);
    const fromDocs = a.call('paybookWhole', stripped, null, docs);
    same('from the closed documents alone: whole, byte for byte',
        [fromDocs.missing, fromDocs.broken, canonical(fromDocs.document) === canonical(indexed)], [[], [], true]);
    const short = clone(docs);
    delete short[KHALED].entries['pay.pp_ps_w_khaled_20261002'];
    same('a closed document that does not hold what the row says is BROKEN, by name - not papered over',
        a.call('paybookWhole', stripped, null, short).broken, [KHALED]);
    same('a document with no index goes through as the same object', a.call('paybookWhole', S, null, {}).document === S, true);
    same('and so does a strip with nothing to leave out', a.call('paybookStripCovered', S) === S, true);

    // rows this build cannot read
    const bad = clone(indexed);
    bad.payIndex.rows.ps_w_ghost_20260101 = { w: 'w_ghost', f: 'yesterday', a: {}, s: 'statement' };
    bad.payIndex.rows[SALIM] = Object.assign({}, bad.payIndex.rows[SALIM], { invented: 1 });
    same('a row this build could not have written is named unreadable, and reads as no row',
        [a.call('paybookStoredIndex', bad).unreadable, Object.keys(a.call('paybookStoredIndex', bad).rows)],
        [[SALIM, 'ps_w_ghost_20260101'].sort(), [KHALED]]);
    const through = a.call('normaliseSchedule', clone(bad));
    same('and is carried through a read of the record exactly as it lies (law 10)',
        canonical(through.payIndex.rows), canonical(bad.payIndex.rows));
    same('a record with no index has none after a read - not an empty one', 'payIndex' in a.call('normaliseSchedule', clone(S)), false);
    same('the union of two indexes only grows, and the standing row stands',
        (() => { const target = {}; a.call('layPaybookIndexUnion', target, { payIndex: { rows: { x: 1 } } }, { payIndex: { rows: { x: 2, y: 3 } } });
            return target.payIndex; })(), { v: 1, rows: { x: 1, y: 3 } });
}

// ------------------------------------------------------------------------------------
{
    suite('R2: the move - the live document shrinks, and no phone\'s money moves');

    const { cloud, a, b } = await closedWorld({ tag: '2' });
    const c = phone('d_c2', cloud, { shipped: true });      // a phone with the writer off
    await settled([a, b, c]);
    const before = { a: money(a), b: money(b), c: money(c), size: sizeOf(cloud.doc), closed: [...cloud.closed.keys()].sort(),
        record: canonical({ pay: a.State.schedule.pay, ledger: a.State.schedule.ledger }) };
    const writesBefore = cloud.writes.length;

    const result = await a.Sync.archiveClosed({ today: TODAY });
    same('three closures moved, none failed, none left', [result.ok, result.state, result.moved.slice().sort(), result.failed, result.left],
        [true, 'done', [AHMAD, KHALED, SALIM].sort(), [], 0]);
    await settled([a, b, c]);
    same('the server\'s document names them in its index', rowsOf(cloud.doc), [AHMAD, KHALED, SALIM].sort());
    same('and holds none of their entries any more', KHALED_PATHS.map(path => at(cloud.doc, path)), KHALED_PATHS.map(() => undefined));
    same('what is NOT settled stayed: Nasser\'s unpaid closure, the opening',
        [payIds(cloud.doc), ledgerIds(cloud.doc).filter(id => id.indexOf('le_period_') === 0)],
        [[NASSER, 'po_open'].sort(), ['le_period_w_nasser_20261002']]);
    check('the live document is smaller', sizeOf(cloud.doc) < before.size, `${before.size} -> ${sizeOf(cloud.doc)}`);
    same('every closed document that existed is untouched, and ONE was added - the copy of the older closure',
        [before.closed.every(id => cloud.closed.has(id)), [...cloud.closed.keys()].filter(id => before.closed.indexOf(id) === -1)],
        [true, ['le_period_w_ahmad_20261002']]);
    same('four writes: a drop for each closure, and for the older one a COPY as well', [kinds({ writes: cloud.writes.slice(writesBefore) }).filter(kind => kind === 'archiveClosed').length,
        kinds({ writes: cloud.writes.slice(writesBefore) }).filter(kind => kind === 'transact').length], [3, 1]);
    const copyAt = cloud.writes.findIndex(write => write.kind === 'transact' && write.closed && write.closed[0] === 'le_period_w_ahmad_20261002');
    const dropAt = cloud.writes.findIndex(write => write.kind === 'archiveClosed' && write.patch.archivedId === AHMAD);
    check('the copy landed before the drop', copyAt !== -1 && copyAt < dropAt, `${copyAt} ${dropAt}`);
    same('the older closure\'s row names the document its ledger half went to', cloud.doc.payIndex.rows[AHMAD].d, ['le_period_w_ahmad_20261002']);
    same('a drop removed exactly its bundle\'s paths', cloud.writes.find(write => write.kind === 'archiveClosed'
        && write.patch.archivedId === KHALED).removed.slice().sort(), KHALED_PATHS);

    same('THE PHONE THAT MOVED THEM: every figure it pays from is the same figure', money(a) === before.a, true);
    same('and its record still holds every entry, byte for byte',
        canonical({ pay: a.State.schedule.pay, ledger: a.State.schedule.ledger }) === before.record, true);
    same('with the rows beside them', rowsOf(a.State.schedule), [AHMAD, KHALED, SALIM].sort());
    same('THE PHONE THAT WATCHED: the same', [money(b) === before.b, rowsOf(b.State.schedule)], [true, [AHMAD, KHALED, SALIM].sort()]);
    same('THE PHONE WITH THE WRITER OFF: the same', [money(c) === before.c, rowsOf(c.State.schedule)], [true, [AHMAD, KHALED, SALIM].sort()]);
    same('all three agree with each other', [money(b) === money(a), canonical(b.State.schedule.pay) === canonical(a.State.schedule.pay)], [true, true]);
    same('after the app is closed and opened: the same again', money(again(a, null)) === before.a, true);
    same('nothing went near the queue, and nobody is waiting', [a.Sync.pendingCount(), b.Sync.pendingCount(), a.Sync.closedWaiting()], [0, 0, null]);
    same('the plan now reads them as archived', a.call('planArchive', a.State.schedule, TODAY).bundles.map(bundle => bundle.state).sort(),
        ['archived', 'archived', 'archived', 'held']);

    // idempotent
    const writesAfter = cloud.writes.length;
    const second = await a.Sync.archiveClosed({ today: TODAY });
    same('run again: nothing to do, and nothing is written', [second.ok, second.moved, second.failed, cloud.writes.length - writesAfter], [true, [], [], 0]);
    const third = await b.Sync.archiveClosed({ today: TODAY });
    same('run from the other phone: the same', [third.ok, third.moved, cloud.writes.length - writesAfter], [true, [], 0]);

    // the phones go on working
    given('a day is recorded after the move', b.State.commit(b.call('assignPlace', b.State.schedule, '2026-10-16', 'w_salim', 'actual', 'p_a', undefined, 0)) === true);
    await settled([a, b, c]);
    same('an ordinary edit still lands, and the index is where it was',
        [Boolean(at(cloud.doc, 'days.2026-10-16.actual.w_salim')), rowsOf(cloud.doc).length, KHALED_PATHS.map(path => at(cloud.doc, path)).filter(Boolean).length], [true, 3, 0]);
    same('NO PHONE PUT AN ENTRY BACK: the queue of each is empty and the cloud still holds only what stayed',
        [a.Sync.pendingCount(), b.Sync.pendingCount(), c.Sync.pendingCount(), payIds(cloud.doc)], [0, 0, 0, [NASSER, 'po_open'].sort()]);
}

// ------------------------------------------------------------------------------------
{
    suite('R3: never before the server confirms the copy');

    {
        const { cloud, a } = await closedWorld({ tag: '3a' });
        const real = cloud.closed.get(KHALED);
        const forged = clone(real);
        forged.entries['pay.pp_ps_w_khaled_20261002'].amount = 1;
        cloud.closed.set(KHALED, forged);
        const size = sizeOf(cloud.doc);
        const result = await a.Sync.archiveClosed({ today: TODAY, only: [KHALED] });
        same('a closed document that holds ANOTHER figure for an entry: the closure stays, and it is said',
            [result.ok, result.moved, result.failed], [false, [], [{ rowId: KHALED, reason: 'copy-differs', detail: null }]]);
        same('nothing left the live document', [sizeOf(cloud.doc) === size, rowsOf(cloud.doc), Boolean(at(cloud.doc, 'pay.' + KHALED))], [true, [], true]);
    }
    {
        const { cloud, a } = await closedWorld({ tag: '3b' });
        // The comparison inside the transaction, on its own: the client is told the copy
        // is fine (its own reads are answered honestly) and the document is swapped
        // between its read and its write.
        const real = cloud.adapter.archiveClosed;
        cloud.adapter.archiveClosed = (patch, removals, ids) => {
            const forged = clone(cloud.closed.get(KHALED));
            forged.entries['pay.' + KHALED].netDue = 1;
            cloud.closed.set(KHALED, forged);
            return real(patch, removals, ids);
        };
        const result = await a.Sync.archiveClosed({ today: TODAY, only: [KHALED] });
        same('a copy that changed between the client\'s look and the drop is caught INSIDE the drop',
            [result.ok, result.failed.map(row => row.reason), rowsOf(cloud.doc), Boolean(at(cloud.doc, 'pay.' + KHALED))],
            [false, ['copy-differs'], [], true]);
    }
    {
        const { cloud, a } = await closedWorld({ tag: '3c' });
        // The closed document is gone altogether (it cannot be, under the rules; this is
        // the model of "the copy was never made"). The move makes the copy FIRST.
        cloud.closed.delete(SALIM);
        const from = cloud.writes.length;
        const result = await a.Sync.archiveClosed({ today: TODAY, only: [SALIM] });
        same('with no closed document at all the copy is made first, read back, and only then the drop',
            [result.ok, result.moved, kinds({ writes: cloud.writes.slice(from) })], [true, [SALIM], ['transact', 'archiveClosed']]);
        same('and the copy holds what left, path for path',
            Object.keys(cloud.closed.get(SALIM).entries).sort(), cloud.writes[cloud.writes.length - 1].removed.slice().sort());
    }
    {
        const { cloud, a, b } = await closedWorld({ tag: '3d' });
        // The server holds a different body from this phone's at a path of the bundle.
        cloud.doc.pay['pp_' + SALIM].amount = 1;
        const result = await a.Sync.archiveClosed({ today: TODAY, only: [SALIM] });
        same('a bundle the server holds differently from this phone does not move',
            [result.ok, result.failed.map(row => row.reason), rowsOf(cloud.doc)], [false, ['differs'], []]);
        void b;
    }
}

// ------------------------------------------------------------------------------------
{
    suite('R4: a phone that lacks the detail fetches it - or does not adopt, and says so');

    const { cloud, a, b } = await closedWorld({ tag: '4' });
    const whole = money(a);
    given('the closures are moved', (await a.Sync.archiveClosed({ today: TODAY })).ok === true);
    await settled([a, b]);

    // a phone installed afterwards
    {
        const reads = [];
        const real = cloud.adapter.readClosed;
        cloud.adapter.readClosed = id => { reads.push(String(id)); return real(id); };
        const fresh = phone('d_new4', cloud, { storage: {} });
        await settled([fresh]);
        same('A PHONE INSTALLED AFTER THE MOVE holds every entry and pays from the same figures',
            [money(fresh) === whole, canonical(fresh.State.schedule.pay) === canonical(a.State.schedule.pay),
                canonical(fresh.State.schedule.ledger.advances) === canonical(a.State.schedule.ledger.advances)], [true, true, true]);
        same('it fetched each closed document its index names, once',
            reads.slice().sort(), [AHMAD, KHALED, SALIM, 'le_period_w_ahmad_20261002'].sort());
        const next = again(fresh, cloud);
        reads.length = 0;
        await settled([next]);
        same('and after a reopen it needs none - the entries are in its own record: no fetch, the same money', [reads, money(next) === whole], [[], true]);
        cloud.adapter.readClosed = real;
    }

    // a phone that cannot fetch
    {
        const real = cloud.adapter.readClosed;
        let failing = true;
        cloud.adapter.readClosed = id => (failing ? Promise.reject(Object.assign(new Error('no signal'), { code: 'unavailable' })) : real(id));
        const dark = phone('d_dark4', cloud, { storage: {} });
        await settle(60);
        same('A PHONE THAT CANNOT FETCH THE DETAIL ADOPTS NOTHING: no roster, no day, no hole',
            [dark.State.schedule.workers.length, payIds(dark.State.schedule), rowsOf(dark.State.schedule)], [0, [], []]);
        same('it does not say synced', dark.Sync.status === 'synced', false);
        same('and says what it is waiting for', (dark.Sync.closedWaiting() || {}).missing.slice().sort(),
            [AHMAD, KHALED, SALIM, 'le_period_w_ahmad_20261002'].sort());
        same('nothing may be moved or closed from it meanwhile', dark.Sync.archiveRefusal(), 'waiting');
        failing = false;
        await settleUntil(() => quiet(dark), 20000, 20);
        same('when the documents can be read it adopts, whole', [money(dark) === whole, dark.Sync.closedWaiting(), dark.Sync.status], [true, null, 'synced']);
        cloud.adapter.readClosed = real;
    }

    // a phone that held the old record and was away for the closure AND the move
    {
        const cloud2 = cloudWith();
        const mover = phone('d_m4', cloud2);
        const away = phone('d_w4', cloud2);
        await settled([mover, away]);
        const awayDisk = away.dump();
        cloud2.subscribers.splice(1, 1);                    // away stops hearing
        await close(mover, 'w_salim', FORTNIGHT, { method: 'transfer' });
        given('the closure is moved while the other phone is away', (await mover.Sync.archiveClosed({ today: TODAY })).ok === true);
        await settled([mover]);
        const back = payDevice({ storage: awayDisk, deviceId: 'd_w4', flags: { paybookQueue: false } });
        back.Sync.pushDelayMs = 5;
        back.State.load();
        given('the returning phone has never seen the closure', payIds(back.State.schedule).indexOf(SALIM) === -1);
        back.Sync.connect(cloud2.adapter);
        await settled([back]);
        same('A PHONE THAT WAS AWAY FOR BOTH comes back to the whole record',
            [money(back) === money(mover), payIds(back.State.schedule).indexOf(SALIM) !== -1, rowsOf(back.State.schedule)], [true, true, [SALIM]]);
    }

    // a phone that was away, cannot fetch, and goes on working meanwhile
    {
        const cloud4 = cloudWith();
        const mover = phone('d_m4c', cloud4);
        const away = phone('d_w4c', cloud4);
        await settled([mover, away]);
        const awayDisk = away.dump();
        cloud4.subscribers.splice(1, 1);
        await close(mover, 'w_salim', FORTNIGHT, { method: 'transfer' });
        given('moved while the other phone is away', (await mover.Sync.archiveClosed({ today: TODAY })).ok === true);
        const real = cloud4.adapter.readClosed;
        let failing = true;
        cloud4.adapter.readClosed = id => (failing ? Promise.reject(Object.assign(new Error('no signal'), { code: 'unavailable' })) : real(id));
        const back = payDevice({ storage: awayDisk, deviceId: 'd_w4c', flags: { paybookQueue: false } });
        back.Sync.pushDelayMs = 5;
        back.State.load();
        back.Sync.connect(cloud4.adapter);
        await settle(60);
        given('it is waiting for the detail', back.Sync.closedWaiting() !== null && back.Sync.status !== 'synced');
        same('WHILE IT WAITS its record is the one it had - whole, and not yet the server\'s',
            [payIds(back.State.schedule).indexOf(SALIM), rowsOf(back.State.schedule), back.State.schedule.workers.length > 0], [-1, [], true]);
        given('a day is recorded on it meanwhile', back.State.commit(back.call('assignPlace', back.State.schedule, '2026-10-16', 'w_nasser', 'actual', 'p_a', undefined, 0)) === true);
        const tried = plan(back, 'planClosure', 'w_nasser', FORTNIGHT, { paid: 0 }, stamp(TODAY, back.id));
        given('a closure can be drawn on its own record', tried.ok === true, JSON.stringify(tried.reasons));
        const writes = cloud4.writes.length;
        const answer = await back.Sync.transactPaybook(tried);
        same('A CLOSURE FROM IT IS REFUSED while it waits - and nothing is sent',
            [answer.ok, answer.state, answer.reasons, cloud4.writes.filter(write => write.kind === 'transact').length - cloud4.writes.slice(0, writes).filter(write => write.kind === 'transact').length,
                back.dump()['farkad:payIntent'] === undefined], [false, 'refused', ['waiting'], 0, true]);
        await settle(300);
        same('the day is still on that phone, whatever became of sending it', Boolean(back.State.schedule.days['2026-10-16'].actual.w_nasser), true);
        failing = false;
        await settleUntil(() => quiet(back) && quiet(mover), 30000, 20);
        same('WHEN THE DETAIL CAN BE READ everything meets: the phone is whole and synced, its day is on the server, the index is where it was',
            [back.Sync.closedWaiting(), back.Sync.status, payIds(back.State.schedule).indexOf(SALIM) !== -1,
                Boolean(at(cloud4.doc, 'days.2026-10-16.actual.w_nasser')), rowsOf(cloud4.doc), back.Sync.pendingCount()],
            [null, 'synced', true, true, [SALIM], 0]);
        same('and it pays from the same figures as the phone that never left', money(back) === money(mover), true);
        cloud4.adapter.readClosed = real;
    }

    // a broken copy on the server
    {
        const cloud3 = cloudWith();
        const mover = phone('d_m4b', cloud3);
        await settled([mover]);
        await close(mover, 'w_salim', FORTNIGHT, { method: 'transfer' });
        given('moved', (await mover.Sync.archiveClosed({ today: TODAY })).ok === true);
        const short = clone(cloud3.closed.get(SALIM));
        delete short.entries['pay.pp_' + SALIM];
        cloud3.closed.set(SALIM, short);
        const fresh = phone('d_new4b', cloud3, { storage: {} });
        await settle(80);
        same('a closed document that does not hold what the index says: not adopted, named as broken, never invented',
            [fresh.State.schedule.workers.length, (fresh.Sync.closedWaiting() || {}).broken, fresh.Sync.status === 'synced'], [0, [SALIM], false]);
    }
}

// ------------------------------------------------------------------------------------
{
    suite('R5: resumable - a lost answer, a step refused, two phones at once');

    {
        const { cloud, a } = await closedWorld({ tag: '5a', cloud: { loseAnswer: kind => kind === 'archiveClosed' } });
        const from = cloud.writes.length;
        const result = await a.Sync.archiveClosed({ today: TODAY, only: [KHALED] });
        same('the drop landed and its answer was lost: settled by LOOKING, one write, never a second',
            [result.ok, result.moved, kinds({ writes: cloud.writes.slice(from) })], [true, [KHALED], ['archiveClosed']]);
    }
    {
        const { cloud, a } = await closedWorld({ tag: '5b' });
        // The older closure: its copy lands, then the drop is refused (the phone lost its
        // signal between the two). An interrupted move leaves a copy and never a hole.
        let refuse = true;
        cloud.reject = kind => (kind === 'archiveClosed' && refuse
            ? Object.assign(new Error('no signal'), { code: 'unavailable', unsent: true }) : null);
        const first = await a.Sync.archiveClosed({ today: TODAY, only: [AHMAD] });
        same('interrupted between the copy and the drop: reported, the copy exists, NOTHING has left',
            [first.ok, first.failed.map(row => row.reason), cloud.closed.has('le_period_w_ahmad_20261002'), rowsOf(cloud.doc),
                Boolean(at(cloud.doc, 'ledger.advances.le_period_w_ahmad_20261002'))], [false, ['offline'], true, [], true]);
        refuse = false;
        const from = cloud.writes.length;
        const next = again(a, cloud);          // and the app was closed in between
        await settled([next]);
        const second = await next.Sync.archiveClosed({ today: TODAY, only: [AHMAD] });
        same('run again after a reopen: it continues from the server\'s state - no second copy, one drop',
            [second.ok, second.moved, kinds({ writes: cloud.writes.slice(from) })], [true, [AHMAD], ['archiveClosed']]);
    }
    {
        const { cloud, a, b } = await closedWorld({ tag: '5c' });
        const before = money(a);
        const from = cloud.writes.length;
        const [one, two] = await Promise.all([a.Sync.archiveClosed({ today: TODAY }), b.Sync.archiveClosed({ today: TODAY })]);
        await settled([a, b]);
        same('two phones moving the same closures in the same moment: both end done, each row stored once',
            [one.ok, two.ok, rowsOf(cloud.doc), cloud.writes.slice(from).filter(write => write.kind === 'archiveClosed' && !write.replayed).length],
            [true, true, [AHMAD, KHALED, SALIM].sort(), 3]);
        same('one copy of the older closure', [...cloud.closed.keys()].filter(id => id === 'le_period_w_ahmad_20261002').length, 1);
        same('and the money on both is what it was', [money(a) === before, money(b) === before], [true, true]);
    }
    {
        const { cloud, a, b } = await closedWorld({ tag: '5d' });
        // The document moves under the move for somebody else's reason.
        const real = cloud.adapter.archiveClosed;
        let once = true;
        cloud.adapter.archiveClosed = (patch, removals, ids) => {
            if (once) {
                once = false;
                cloud.doc.revision += 1;                   // another phone's write landed first
                cloud.doc.lastOpId = 'op_other';
            }
            return real(patch, removals, ids);
        };
        const result = await a.Sync.archiveClosed({ today: TODAY, only: [SALIM] });
        same('a revision lost to another phone\'s write is re-aimed, not reported', [result.ok, result.moved], [true, [SALIM]]);
        void b;
    }
}

// ------------------------------------------------------------------------------------
{
    suite('R7: what is refused, and that a refusal writes nothing');

    const { cloud, a, b } = await closedWorld({ tag: '7' });
    const from = cloud.attempts.length;
    cloud.online = false;
    const dark = await a.Sync.archiveClosed({ today: TODAY });
    same('no signal: the first closure fails as «offline» and the run stops there',
        [dark.ok, dark.moved, dark.failed.map(row => row.reason), dark.left], [false, [], ['offline'], 2]);
    given('a day is recorded with the cloud unreachable', b.State.commit(b.call('assignPlace', b.State.schedule, '2026-10-16', 'w_salim', 'actual', 'p_a', undefined, 0)) === true);
    await settle(20);
    same('this phone holds unsent work', (await b.Sync.archiveClosed({ today: TODAY })).reasons, ['unsent-work']);
    cloud.online = true;
    await settled([a, b]);
    const shut = phone('d_shut7', cloud, { shipped: true });
    await settled([shut]);
    same('the gate is shut in what is shipped', [(await shut.Sync.archiveClosed({ today: TODAY })).reasons, shut.Sync.archiveRefusal()], [['gate'], 'gate']);
    same('none of the three wrote anything', [cloud.writes.filter(write => write.kind === 'archiveClosed').length, rowsOf(cloud.doc)], [0, []]);
    same('and nothing moved by itself: archiveDue on a shut build answers nothing', await shut.Sync.archiveDue(LATER), null);
    same('archiveDue moves only what is old enough - nothing, two weeks after closing day minus one',
        (await a.Sync.archiveDue('2026-10-29')).moved, []);
    same('- and what is, a few at a time', (await a.Sync.archiveDue(LATER)).moved.length, 3);
}

// ------------------------------------------------------------------------------------
{
    suite('R8: life after the move - a correction to an archived closure, a later payment, the next closure');

    const { cloud, a, b } = await closedWorld({ tag: '8' });
    given('moved', (await a.Sync.archiveClosed({ today: TODAY })).ok === true);
    await settled([a, b]);
    // B voids the payment of Khaled's archived closure.
    const voided = plan(b, 'planVoid', 'pp_' + KHALED, { reason: 'נרשם בטעות', date: TODAY }, stamp(TODAY, b.id, '12'));
    given('a payment of an archived closure may be voided', voided.ok === true, JSON.stringify(voided.reasons));
    const said = await b.Sync.transactPaybook(voided);
    same('the void lands - one write, its own closed document', [said.state, cloud.closed.has('pv_pp_' + KHALED)], ['closed', true]);
    await settled([a, b]);
    const owedOn = device => device.call('accountFor', device.State.schedule, 'w_khaled', TODAY).wageDue;
    same('and both phones now say Khaled is owed his net again', [owedOn(a), owedOn(b)], [3800, 3800]);
    same('the void is in the live document; the closure it corrects is not, and its row is as it was',
        [payIds(cloud.doc).indexOf('pv_pp_' + KHALED) !== -1, Boolean(at(cloud.doc, 'pay.' + KHALED)), cloud.doc.payIndex.rows[KHALED].p], [true, false, 3800]);
    const fresh = phone('d_new8', cloud, { storage: {} });
    await settled([fresh]);
    same('a phone installed now reads the same: the archived closure, and the correction beside it', [owedOn(fresh), money(fresh) === money(a)], [3800, true]);
    // and he is paid again, later
    const paid = plan(a, 'planPayment', KHALED, 3800, { paymentId: 'pp_later000001', date: TODAY, method: 'cash' }, stamp(TODAY, a.id, '13'));
    given('a later payment against an archived closure is allowed', paid.ok === true, JSON.stringify(paid.reasons));
    same('and lands', (await a.Sync.transactPaybook(paid)).state, 'closed');
    await settled([a, b, fresh]);
    same('all three agree he is paid', [owedOn(a), owedOn(b), owedOn(fresh)], [0, 0, 0]);
    // Nasser is paid, and his closure can now move
    const nasser = plan(a, 'planPayment', NASSER, 3000, { paymentId: 'pp_nasser00001', date: TODAY, method: 'cash' }, stamp(TODAY, a.id, '14'));
    given('Nasser is paid', nasser.ok === true && (await a.Sync.transactPaybook(nasser)).state === 'closed', JSON.stringify(nasser.reasons));
    const more = await a.Sync.archiveClosed({ today: TODAY });
    same('a closure that has since been paid in full moves at the next run, with its later payment',
        [more.moved, cloud.doc.payIndex.rows[NASSER].e, cloud.doc.payIndex.rows[NASSER].d], [[NASSER], ['pp_nasser00001'], ['pp_nasser00001']]);
    await settled([a, b, fresh]);
    same('and three phones still agree on everything', [money(b) === money(a), money(fresh) === money(a)], [true, true]);
    same('an archived account cannot be closed again from any of them',
        [a, b, fresh].map(device => plan(device, 'planClosure', 'w_salim', FORTNIGHT, { paid: 0 }, stamp(TODAY, device.id)).ok), [false, false, false]);
}

// ------------------------------------------------------------------------------------
{
    suite('R9: a restore never erases a closure - before the move and after it');

    const { cloud, a, b } = await closedWorld({ tag: '9' });
    const fileBefore = clone(a.State.schedule);                    // a backup taken BEFORE the move
    const whole = money(a);
    given('moved', (await a.Sync.archiveClosed({ today: TODAY })).ok === true);
    await settled([a, b]);
    const fileAfter = clone(a.State.schedule);                     // and one taken after
    const ancient = clone(BASE.schedule);                          // and one from before any closure
    const stay = () => [rowsOf(cloud.doc), payIds(cloud.doc), [...cloud.closed.keys()].sort().length];
    const stood = stay();

    for (const [name, file] of [['a file from before any closure', ancient], ['a file from before the move', fileBefore],
        ['a file from after the move', fileAfter]]) {
        const saves = cloud.writes.filter(write => write.kind === 'save').length;
        const result = await b.Sync.replaceEverything(b.call('normaliseSchedule', clone(file)));
        await settled([a, b]);
        same(`${name}: the restore is ACCEPTED by a server that refuses any change to the pay book or the index`,
            [result.ok, cloud.writes.filter(write => write.kind === 'save').length - saves], [true, 1]);
        same('- the index, the live pay book and the closed documents are exactly what they were', stay(), stood);
        const sent = cloud.writes.filter(write => write.kind === 'save').slice(-1)[0].data;
        same('- the document it sent carries the rows and none of the entries they stand for',
            [rowsOf(sent), KHALED_PATHS.map(path => at(sent, path)).filter(value => value !== undefined).length], [stood[0], 0]);
        same('- and both phones still hold every closure and pay from the same figures',
            [money(a) === whole, money(b) === whole], [true, true]);
    }
    same('a restore of a file from before the closures did replace the WORK record it was asked to - the closures are not days',
        Boolean(b.State.schedule.days['2026-10-02']), true);

    // A whole document from a build that has never heard of the pay book or the index.
    const old = clone(cloud.doc);
    delete old.pay;
    delete old.payIndex;
    Object.assign(old, { protocol: 1, revision: cloud.doc.revision + 1, lastOpId: 'op_old_restore', updatedAt: new Date().toISOString() });
    const refused = await cloud.adapter.save(old).then(() => 'accepted', error => error.code);
    same('a whole document from a build that does not know `pay` is REFUSED once anything has moved',
        [refused, stay()], ['permission-denied', stood]);
    const sly = clone(cloud.doc);
    delete sly.payIndex.rows[KHALED];
    Object.assign(sly, { revision: cloud.doc.revision + 1, lastOpId: 'op_sly', updatedAt: new Date().toISOString() });
    same('and so is one that speaks protocol 2 and takes a row away',
        await cloud.adapter.save(sly).then(() => 'accepted', error => error.code), 'permission-denied');

    // A restore on a phone installed after the move, from a file that never held the closures.
    const fresh = phone('d_new9', cloud, { storage: {} });
    await settled([fresh]);
    const result = await fresh.Sync.replaceEverything(fresh.call('normaliseSchedule', clone(ancient)));
    await settled([a, b, fresh]);
    same('a restore from a phone installed after the move: accepted, and nothing of the closures is lost anywhere',
        [result.ok, stay(), money(fresh) === whole, money(a) === whole], [true, stood, true, true]);
}

// ------------------------------------------------------------------------------------
{
    suite('R10: the files - the backup, the rescue file, the daily cloud copy - say what they carry, and carry it');

    const { cloud, a, b } = await closedWorld({ tag: '10' });
    // Before anything has moved: every file and every sentence is what it always was.
    a.call('exportBackup');
    same('with nothing archived the backup file is this phone\'s record and nothing else, byte for byte',
        a.downloads[a.downloads.length - 1].text === JSON.stringify(a.State.schedule, null, 1), true);
    same('and no sentence about an archive is said', [a.call('payArchiveFileNotice'), a.call('payArchiveCarried', a.State.schedule)], ['', null]);
    given('moved', (await a.Sync.archiveClosed({ today: TODAY })).ok === true);
    await settled([a, b]);

    const NOTICE = ' הקובץ כולל את כל סגירות החשבון והתשלומים שבמכשיר הזה, גם אלה שכבר הועברו לארכיון בשרת. '
        + 'מסמכי הארכיון עצמם נשארים בשרת ואינם בקובץ: שחזור לאותו חשבון לא מוחק דבר, '
        + 'אבל שחזור לחשבון חדש וריק לא יחזיר את סגירות החשבון לשרת.';
    a.said.length = 0;
    a.call('exportBackup');
    const file = JSON.parse(a.downloads[a.downloads.length - 1].text);
    const pathsOut = rowsOf(a.State.schedule).reduce((sum, id) => sum + a.call('paybookRowPaths', id, a.State.schedule.payIndex.rows[id]).length, 0);
    same('THE BACKUP FILE carries every entry of every closure - the archived ones included - and the rows',
        [canonical(file.pay) === canonical(a.State.schedule.pay), canonical(file.ledger) === canonical(a.State.schedule.ledger),
            rowsOf(file), KHALED_PATHS.every(path => at(file, path) !== undefined)], [true, true, [AHMAD, KHALED, SALIM].sort(), true]);
    same('and SAYS, in the file, what it carries and what it does not',
        [file.aboutClosedAccounts.closuresArchivedOnServer, file.aboutClosedAccounts.entriesOfThoseCarriedInThisFile,
            file.aboutClosedAccounts.entriesOfThoseMissingFromThisFile, file.aboutClosedAccounts.closedDocumentsCarried,
            /does NOT\s+carry the server's closed documents/.test(file.aboutClosedAccounts.note.replace(/\s+/g, ' ')),
            /NEW, EMPTY project/.test(file.aboutClosedAccounts.note)], [3, pathsOut, 0, false, true, true]);
    same('the same is said on the screen, in these words', [a.call('payArchiveFileNotice'), a.said.some(line => line.indexOf(NOTICE.trim()) !== -1)], [NOTICE, true]);
    const read = a.call('readBackupFile', clone(file));
    same('read back, the file is the record - the note is not taken for data',
        [canonical(read.schedule.pay) === canonical(a.State.schedule.pay), canonical(read.schedule.payIndex) === canonical(a.State.schedule.payIndex),
            'aboutClosedAccounts' in read.schedule], [true, true, false]);
    a.said.length = 0;
    a.call('exportRecoveryData');
    const rescue = JSON.parse(a.downloads[a.downloads.length - 1].text);
    same('THE RESCUE FILE says the same in the file, and on the screen',
        [rescue.aboutClosedAccounts.closuresArchivedOnServer, rescue.aboutClosedAccounts.closedDocumentsCarried,
            a.said.some(line => line.indexOf(NOTICE.trim()) !== -1)], [3, false, true]);
    same('its copy of the record holds every entry and every row',
        (raw => [canonical(raw.pay) === canonical(a.State.schedule.pay), rowsOf(raw)])(JSON.parse(rescue.records[SCHEDULE])), [true, [AHMAD, KHALED, SALIM].sort()]);
    same('and its comparison of two captures knows each row as a fact of its own',
        Object.keys(a.call('recoveryFacts', a.State.schedule)).filter(key => key.indexOf('payIndex:') === 0).sort(),
        [AHMAD, KHALED, SALIM].sort().map(id => 'payIndex:' + id));

    // A draft of a closure (js/ui/accounts.js) is this phone's typing and nothing else's.
    a.Store.set('farkadPayDraft', JSON.stringify({ v: 1, workerId: 'w_khaled', typed: 'DRAFT-MARKER' }), { optional: true });
    a.call('exportBackup');
    a.call('exportRecoveryData');
    same('a draft of a closure is in neither file', a.downloads.slice(-2).map(file => /farkadPayDraft|DRAFT-MARKER/.test(file.text)), [false, false]);
    same('nor anywhere on the cloud', /farkadPayDraft|DRAFT-MARKER/.test(JSON.stringify([cloud.doc, [...cloud.closed.values()], [...cloud.history.values()]])), false);

    // What the note warns of, measured: the same record offered to a project that does not exist yet.
    {
        const empty = makeCloud({ payRules: true });
        const lone = payDevice({ storage: a.dump(), deviceId: 'd_lone10', flags: { paybookQueue: false } });
        lone.Sync.pushDelayMs = 5;
        lone.State.load();
        lone.Sync.connect(empty.adapter);
        await settle(40);
        given('a day is recorded on it', lone.State.commit(lone.call('assignPlace', lone.State.schedule, '2026-10-17', 'w_salim', 'actual', 'p_a', undefined, 0)) === true);
        await settle(400);
        same('A NEW, EMPTY PROJECT does not take the pay book: nothing is created there, and the phone does not say synced',
            [empty.doc, lone.Sync.status === 'synced'], [null, false]);
        same('and the phone still holds everything', [canonical(lone.State.schedule.pay) === canonical(a.State.schedule.pay), rowsOf(lone.State.schedule).length], [true, 3]);
    }

    cloud.history.clear();
    a.Sync._archivedOn = null;                 // the day's copy is written once; ask for it again
    a.Sync.archiveDaily(a.State.schedule);
    await settle(20);
    const copies = [...cloud.history.values()];
    given('a daily copy was written', copies.length === 1, String(copies.length));
    same('it is the live document\'s shape: the rows, and none of what they stand for',
        [rowsOf(copies[0]), KHALED_PATHS.map(path => at(copies[0], path)).filter(value => value !== undefined).length], [[AHMAD, KHALED, SALIM].sort(), 0]);
    check('so it is no larger than the document it copies has to be', sizeOf(copies[0]) < sizeOf(a.call('cloudDocument', a.State.schedule)),
        `${sizeOf(copies[0])} < ${sizeOf(a.call('cloudDocument', a.State.schedule))}`);
    void b;
}

report();
