// FINANCIAL TRUTH: the thirteen claims the ledger candidate is judged on.
//
//   node tests/ledger.truth.test.mjs
//
// Every other money suite in this repository was written the day a particular bug was
// found, and each proves its own bug cannot come back. This one is written the other way
// round: it is the list somebody has to be able to read before the writer gate is opened,
// asked of ONE record, end to end, with every figure stated in agorot so that "it
// balances" is an integer identity rather than a float that looks close.
//
// It duplicates coverage on purpose where the duplication is the point - a claim proved
// only as a side effect of a bug report is a claim nobody has stated - and it names, in
// its own comments, which existing suite already says each thing. Nothing here weakens
// an assertion anywhere else, and nothing here opens a shipped gate: the gates are opened
// through the harness `flags` seam and nowhere else, exactly as CLAUDE.md requires, and
// section 13 pins the shipped defaults shut by reading the source.
//
// ---------------------------------------------------------------- the worked example
//
// One man, one fortnight, numbers a person could check on paper:
//
//   ACCOUNT A   2026-08-07 .. 2026-08-20   (Friday-anchored, fourteen days)
//   ACCOUNT B   2026-08-21 .. 2026-09-03
//
//   eight days at 400.00            gross      3,200.00      320,000 ag
//   one advance on the 10th         given      5,000.00      500,000 ag
//   cash back on the 24th                        500.00       50,000 ag
//   cash back on the 26th                        300.00       30,000 ag
//                                   ------------------------------------
//   still owed after the two                   4,200.00      420,000 ag
//   comes off the wage in A                    3,200.00      320,000 ag
//   carried out of A                           1,000.00      100,000 ag
//
// 500,000 - 50,000 - 30,000 - 320,000 = 100,000. It balances to the agora, and every
// surface below is asked for the same integers.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { makeDevice, settle } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const A = { from: '2026-08-07', to: '2026-08-20' };
const B = { from: '2026-08-21', to: '2026-09-03' };

const A_DAYS = ['2026-08-07', '2026-08-10', '2026-08-11', '2026-08-12',
    '2026-08-13', '2026-08-14', '2026-08-17', '2026-08-18'];   // 8 x 400 = 3,200

// EVERY MONEY COMPARISON IN THIS FILE GOES THROUGH THIS.
//
// Shekels are stored as JavaScript numbers and a fortnight's arithmetic is a chain of
// additions and subtractions over them; 0.1 + 0.2 is the reason a suite about money must
// not compare shekels with ===. Agorot are integers, the record's own smallest unit, and
// an integer identity is either true or it is a defect. Math.round rather than a
// tolerance: a figure that is not a whole number of agorot is not money this app admits,
// and rounding one here would hide exactly that.
const ag = value => Math.round(Number(value) * 100);

const owns = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);

// The open gates, through the seam and nowhere else. tests/build.test.mjs refuses any
// mention of FARKAD_FLAG_OVERRIDES in a file this app ships, so nothing a phone can
// reach opens these.
const OPEN = { carryAdvances: true, ledgerWrites: true };

function crew(options = {}) {
    const device = makeDevice(Object.assign({ flags: OPEN }, options));
    device.setToday('2026-09-03');
    device.ctx.askTell = () => Promise.resolve();
    device.ctx.askConfirm = () => Promise.resolve(true);
    device.State.schedule.workers = [
        { id: 'w_01', name: 'עומר סעד', active: true, dailyRate: 400, hourlyRate: 50 }
    ];
    device.State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
    device.State.schedule.updatedAt = '2026-08-01T00:00:00.000Z';
    device.State.schedule.updatedBy = 'd_seed';
    device.State.save({ silent: true });
    A_DAYS.forEach(date => device.State.commit(device.call('assignPlace',
        device.State.schedule, date, 'w_01', 'actual', 'p_01')));
    return device;
}

// The advance, written the way the form writes it: the legacy record every phone reads
// and the origin entry the fold stands on, as ONE all-or-nothing commit.
function giveAdvance(device, amount, date, note, at, by, method) {
    const changes = device.call('recordNewAdvance', device.State.schedule,
        'w_01', date, amount, note || '', at, by || device.id, method);
    given('the advance was written as one operation', device.State.commitMany(changes),
        JSON.stringify(changes));
    return changes[0].value.id;
}

// The approval a person gives before any surface may read the new arithmetic. Without it
// carryReportingEnabled is false and every report keeps saying what it always said - see
// tests/approval.test.mjs, which is the suite that proves that.
function approveCarry(device) {
    const plan = device.call('planCarryMigration', device.State.schedule);
    if (!plan.needed) return plan;
    device.State.commit(device.call('recordCarryApproval', device.State.schedule,
        plan, '2026-09-01T08:00:00.000Z', 'd_person'));
    return plan;
}

// js/ui/reports.js in the device's own scope, so the SHEET and the STATEMENT can be
// asked the same question the model was asked. index.html loads sitecolor.js first.
function reportsIn(device, range) {
    const run = code => vm.runInContext(code, device.ctx, { filename: 'harness:reports' });
    run(readFileSync(new URL('../js/ui/sitecolor.js', import.meta.url), 'utf8'));
    run(readFileSync(new URL('../js/ui/reports.js', import.meta.url), 'utf8'));
    run(`REPORT_RANGE.from = '${range.from}'; REPORT_RANGE.to = '${range.to}';`
        + `REPORT_SECTION = 'workers'; INVOICE_PLACE = null;`);
    return run;
}

// The device's disk as it would be once everything it wrote has actually been SENT.
//
// receive() replays this phone's unsent edits on top of an arriving snapshot - which is
// right, and is what stops a snapshot taken a moment ago undoing an edit made since. It
// also means a suite about what a SNAPSHOT does has to be sure the queue is empty first,
// or it measures the replay instead. The queue names itself, so nothing here has to know
// how it is spelled.
function afterSending(device) {
    const disk = device.dump();
    Object.keys(disk)
        .filter(key => device.Sync.isQueueKey && device.Sync.isQueueKey(key))
        .forEach(key => { delete disk[key]; });
    return disk;
}

// A snapshot from another phone: this device's own document with a ledger substituted and
// a newer stamp, so receive() adopts it rather than reading it as an echo of its own
// write. The same shape tests/merge.test.mjs uses.
function snapshotOf(device, ledger) {
    const raw = JSON.parse(JSON.stringify(device.State.schedule));
    if (ledger === null) delete raw.ledger; else raw.ledger = ledger;
    raw.updatedAt = '2026-09-05T10:00:00.000Z';
    raw.updatedBy = 'd_other';
    return raw;
}

// ==================================================================================
// 1. AN ENTRY IS CREATED AND NEVER EDITED OR DELETED, THROUGH EVERY DOOR
// ==================================================================================
//
// Already stated in pieces: tests/merge.test.mjs proves the snapshot door (a union that
// never removes, a disagreement that is held rather than resolved), tests/repayment.test.mjs
// «D3» proves no screen deletes an advance, tests/poison.test.mjs proves an entry named
// after a prototype is not lost. What none of them says in one place is that the BYTES of
// a history are identical after each door in turn - which is the claim an append-only
// ledger actually makes.
{
    suite('1. a history written once is the same bytes after every door it goes through');

    const device = crew({ deviceId: 'd_doors' });
    const id = giveAdvance(device, 5000, '2026-08-10', 'על חשבון',
        '2026-08-10T09:00:00.000Z', 'd_doors', 'cash');
    device.State.commit(device.call('recordAdvanceRepaid', device.State.schedule,
        id, 500, '2026-08-24', 'מזומן', '2026-08-24T09:00:00.000Z', 'd_doors', 'cash'));
    device.State.commit(device.call('recordAdvanceCorrected', device.State.schedule,
        id, { note: 'על חשבון אוגוסט' }, '2026-08-25T09:00:00.000Z', 'd_doors'));

    // The bytes, canonically, so key order cannot make two identical records look
    // different or two different ones look the same.
    const canon = ledger => JSON.stringify(Object.keys((ledger || {}).advances || {}).sort()
        .map(key => [key, JSON.stringify((ledger.advances)[key])]));
    const written = canon(device.State.schedule.ledger);

    given('three entries were written', JSON.parse(written).length === 3, written);

    // DOOR 1 - the app is closed and opened.
    const reopened = makeDevice({ storage: device.dump(), deviceId: 'd_doors',
        flags: OPEN });
    reopened.setToday('2026-09-03');
    reopened.State.load();
    await settle(5);
    check('closed and reopened: byte for byte the same three entries',
        canon(reopened.State.schedule.ledger) === written,
        canon(reopened.State.schedule.ledger));

    // DOOR 2 - a snapshot from a phone that has never heard of a ledger at all. This is
    // the v79 phone writing a whole document, and adopting it wholesale would delete
    // every correction ever made here.
    const blind = crew({ deviceId: 'd_blind' });
    blind.State.schedule.ledger = device.State.schedule.ledger;
    blind.State.save({ silent: true });
    blind.Sync.receive(snapshotOf(blind, null));
    await settle(5);
    check('a snapshot with no ledger at all: the three entries survive',
        canon(blind.State.schedule.ledger) === written,
        canon(blind.State.schedule.ledger));

    // DOOR 3 - a snapshot carrying ONE of the three. The union may add; it may never
    // subtract.
    const partial = crew({ deviceId: 'd_partial' });
    partial.State.schedule.ledger = JSON.parse(JSON.stringify(device.State.schedule.ledger));
    partial.State.save({ silent: true });
    const one = Object.keys(device.State.schedule.ledger.advances)[0];
    partial.Sync.receive(snapshotOf(partial, { advances: {
        [one]: device.State.schedule.ledger.advances[one]
    } }));
    await settle(5);
    check('a snapshot carrying one of the three: the other two are not removed',
        canon(partial.State.schedule.ledger) === written,
        canon(partial.State.schedule.ledger));

    // DOOR 4 - the backup file, opened on a second phone.
    device.call('exportBackup');
    const backupText = (device.downloads[device.downloads.length - 1] || {}).text;
    given('the backup file left the phone', typeof backupText === 'string');
    const second = crew({ deviceId: 'd_second' });
    second.ctx.importBackup(second.fileEvent('farkad-2026-09-03.json', backupText));
    await settle(40);
    check('through a backup file onto another phone: the same three entries',
        canon(second.State.schedule.ledger) === written,
        canon(second.State.schedule.ledger));

    // DOOR 5 - the rescue file, which is the door of last resort.
    device.call('exportRecoveryData');
    const rescueText = (device.downloads[device.downloads.length - 1] || {}).text;
    given('the rescue file left the phone', typeof rescueText === 'string');
    const rescued = crew({ deviceId: 'd_rescued' });
    rescued.ctx.importBackup(rescued.fileEvent('farkad-recovery.json', rescueText));
    await settle(80);
    check('through the rescue file onto a fresh phone: the same three entries',
        canon(rescued.State.schedule.ledger) === written,
        canon(rescued.State.schedule.ledger));

    // AND THE CORRECTION DID NOT TOUCH WHAT IT CORRECTED. A 'corrected' entry restates
    // the record; the entry it restates is still there, unchanged, saying what it always
    // said. That is the difference between this and a mutation.
    const origin = device.State.schedule.ledger.advances[device.call('originEntryId', id)];
    same('the entry the correction restated still says what it said',
        [origin.kind, ag(origin.amount), origin.note], ['given', 500000, 'על חשבון']);

    // AND NOTHING SHIPPED REMOVES AN ENTRY FROM AN APPEND-ONLY FAMILY. A grep, because a
    // `delete` is one line and this is the rule that line would break.
    //
    // js/state.js is the ONE file allowed to hold such a line and it holds exactly two,
    // both named here rather than excluded in silence:
    //
    //   the boot mirror rolling ITSELF back when the disk refused it, before any of what
    //   it wrote is durable - nothing is lost, the legacy field still holds every advance
    //   an impossible closure being MOVED into `unreadable`, which is holding aside, not
    //   removing: the bytes stay on the record and the fold stops reading them
    //
    // The pattern is deliberately about the FAMILY maps, not about the word "ledger": a
    // shallow copy with `ledger.conflicted` taken off it and put straight back is not a
    // deletion of anybody's history, and a rule that could not tell the two apart would
    // be one somebody eventually turns off.
    const removes = /delete\s+[A-Za-z_.$]*\.ledger\.(advances|migrations|unreadable|unreadableMigrations)\s*\[/;
    const shipped = ['js/model/ledger.js', 'js/model/schema.js', 'js/sync/receive.js',
        'js/sync/send.js', 'js/sync/restore.js', 'js/sync/sync.js', 'js/ui/reports.js',
        'js/ui/backup.js', 'js/ui/settings.js', 'js/recovery.js'];
    const mirror = readFileSync(new URL('../js/state.js', import.meta.url), 'utf8')
        .split('\n').filter(line => removes.test(line));
    given('the pattern really does find the two lines js/state.js is allowed to hold',
        mirror.length === 2, JSON.stringify(mirror.map(line => line.trim())));
    const removers = shipped.filter(file =>
        removes.test(readFileSync(new URL('../' + file, import.meta.url), 'utf8')));
    check('and no other shipped file removes a ledger entry at all',
        removers.length === 0, removers.join(','));
}

// ==================================================================================
// 2. PARTIAL REPAYMENT: 5,000 GIVEN, 500 BACK, 300 BACK - EVERY SURFACE, TO THE AGORA
// ==================================================================================
//
// tests/repayment.test.mjs proves a repayment accumulates rather than replacing, and
// «L2» proves one fortnight reads the same on every surface. This asks the owner's own
// example of the same question, in agorot, of the fold, the account, the pay sheet, the
// exported sheet and the man's own message at once.
{
    suite('2. 5,000 given, 500 back, 300 back: one number on every surface');

    const device = crew({ deviceId: 'd_partial2' });
    const id = giveAdvance(device, 5000, '2026-08-10', '',
        '2026-08-10T09:00:00.000Z', 'd_partial2', 'cash');
    device.State.commit(device.call('recordAdvanceRepaid', device.State.schedule,
        id, 500, '2026-08-12', 'מזומן', '2026-08-12T09:00:00.000Z', 'd_partial2', 'cash'));
    device.State.commit(device.call('recordAdvanceRepaid', device.State.schedule,
        id, 300, '2026-08-14', 'מזומן', '2026-08-14T09:00:00.000Z', 'd_partial2', 'cash'));
    approveCarry(device);

    // THE FOLD. Two repayments accumulate; the amount given never moves.
    const state = device.call('advanceOutstanding', device.State.schedule, id);
    same('the fold, in agorot: 500,000 given, 80,000 back, 420,000 left',
        [ag(state.given), ag(state.repaid), ag(state.deducted), ag(state.settled),
            ag(state.left), ag(state.overpaid)],
        [500000, 80000, 0, 80000, 420000, 0]);
    check('and it balances exactly: given - settled = left',
        ag(state.given) - ag(state.settled) === ag(state.left),
        `${ag(state.given)} - ${ag(state.settled)} = ${ag(state.left)}`);

    // THE ACCOUNT. 3,200 is all the wage can carry, so 100,000 agorot walk into B.
    const walk = device.call('advanceAccount', device.State.schedule, 'w_01', A.from, A.to);
    same('the account, in agorot: 500,000 given, 80,000 back, 320,000 off the wage',
        [ag(walk.carriedIn), ag(walk.given), ag(walk.repaid), ag(walk.gross),
            ag(walk.deducted), ag(walk.net), ag(walk.carriedForward)],
        [0, 500000, 80000, 320000, 320000, 0, 100000]);
    check('and THAT balances too: opening + given - back - deducted = carried out',
        ag(walk.carriedIn) + ag(walk.given) - ag(walk.repaid) - ag(walk.deducted)
            === ag(walk.carriedForward),
        JSON.stringify(walk));

    const next = device.call('advanceCarryInto', device.State.schedule, 'w_01', B.from);
    check('the next account opens on exactly the 100,000 that walked out',
        ag(next) === 100000, String(ag(next)));

    // THE PAY SHEET, drawn by the shipped reporter.
    const run = reportsIn(device, A);
    const rows = run('payrollRows()');
    const row = rows.find(item => item.workerId === 'w_01');
    given('the row carries the account the sheet is drawn from', Boolean(row.carry),
        JSON.stringify(row));
    same('the pay sheet row carries the same integers',
        [ag(row.amount), ag(row.carry.given), ag(row.carry.repaid),
            ag(row.carry.deducted), ag(row.carry.net), ag(row.carry.carriedForward)],
        [320000, 500000, 80000, 320000, 0, 100000]);
    // row.advances is what was HANDED OVER in this range - a different question from what
    // comes off the wage, and the sheet prints the second. Both are on the row and this
    // is the one place they are asked side by side.
    same('and what was handed over is a separate figure on the same row',
        ag(row.advances), 500000);

    // THE EXPORTED SHEET, which is the file a bookkeeper adds up.
    const sheet = run('payrollSheetRows()');
    const heads = sheet[0];
    const line = sheet.find(item => item[0] === 'עומר סעד');
    given('the sheet has a row for him', Boolean(line), JSON.stringify(sheet.slice(0, 2)));
    const cell = name => Number(line[heads.indexOf(name)]);
    // The deduction column carries a MINUS - it is money coming off - so the sheet's own
    // sign is asserted rather than papered over with Math.abs.
    same('the exported sheet says 320,000 earned and -320,000 deducted',
        [ag(cell('נצבר')), ag(cell(run('deductionColumnName()')))], [320000, -320000]);

    // THE MAN'S OWN MESSAGE. He is the one person who will check it against the days.
    const text = run(`workerStatementText('w_01')`);
    check('his own message names the cash he handed back, and only that',
        text.indexOf('הוחזר במזומן: 800') !== -1, JSON.stringify(text));
    check('and the debt that is still open after this fortnight',
        text.indexOf('חוב פתוח: 1000') !== -1, JSON.stringify(text));

    // AND THE OTHER FOLD, which no surface reads TODAY and every surface is documented to
    // read: currentAdvances is the shape schedule.advances has, built out of the entries.
    // A repayment that REPLACED rather than accumulated there would say 300 back on an
    // advance a man handed 800 back on - and it can be broken today without a single
    // suite in this repository noticing, because nothing has ever asked it. Asked here.
    const folded = device.call('currentAdvances', device.State.schedule)[id];
    same('the entry fold accumulates the two repayments too',
        [ag(folded.amount), ag(folded.repaid), ag(folded.reversed)], [500000, 80000, 0]);
    check('and what he was HANDED never moves, whatever comes back',
        ag(folded.amount) === ag(state.given), JSON.stringify(folded));

    // AGOROT, NOT SHEKELS. The same story one agora off, so nothing above is passing on
    // a coincidence of whole numbers.
    const fine = crew({ deviceId: 'd_fine' });
    const fineId = giveAdvance(fine, 1000.55, '2026-08-10', '',
        '2026-08-10T09:00:00.000Z', 'd_fine', 'cash');
    fine.State.commit(fine.call('recordAdvanceRepaid', fine.State.schedule,
        fineId, 250.3, '2026-08-12', '', '2026-08-12T09:00:00.000Z', 'd_fine', 'cash'));
    const fineState = fine.call('advanceOutstanding', fine.State.schedule, fineId);
    same('100,055 given less 25,030 back is 75,025 agorot, exactly',
        [ag(fineState.given), ag(fineState.repaid), ag(fineState.left)],
        [100055, 25030, 75025]);
}

// ==================================================================================
// 3. CASH BACK AND WAGE DEDUCTION ARE SEPARATE FACTS
// ==================================================================================
//
// tests/repayment.test.mjs «D1» proves both come off the balance. This proves they never
// become one figure on the way to a person: two entries, two fields, two labels, two
// numbers - because "you were credited 4,000" answers a question nobody asked and cannot
// be checked against anything the man remembers.
{
    suite('3. cash handed back and money off the wage never become one figure');

    const device = crew({ deviceId: 'd_two_facts' });
    const id = giveAdvance(device, 5000, '2026-08-10', '',
        '2026-08-10T09:00:00.000Z', 'd_two_facts', 'cash');
    device.State.commit(device.call('recordAdvanceRepaid', device.State.schedule,
        id, 500, '2026-08-12', 'מזומן', '2026-08-12T09:00:00.000Z', 'd_two_facts', 'cash'));
    device.State.commit(device.call('recordAdvanceRepaid', device.State.schedule,
        id, 300, '2026-08-14', 'מזומן', '2026-08-14T09:00:00.000Z', 'd_two_facts', 'cash'));
    approveCarry(device);

    // The fortnight closes: 320,000 agorot come off his wage. That is not a repayment.
    const changes = device.call('closePeriodChanges', device.State.schedule,
        'w_01', A.from, A.to, '2026-08-20T18:00:00.000Z', 'd_two_facts');
    given('the close wrote its artifact and its deduction', changes.length === 2,
        JSON.stringify(changes.map(one => one.value.kind)));
    device.State.commitMany(changes);

    const state = device.call('advanceOutstanding', device.State.schedule, id);
    same('the fold keeps them apart: 80,000 cash, 320,000 wage, 100,000 left',
        [ag(state.repaid), ag(state.deducted), ag(state.settled), ag(state.left)],
        [80000, 320000, 400000, 100000]);
    check('and settled is their sum and nothing else',
        ag(state.repaid) + ag(state.deducted) === ag(state.settled),
        JSON.stringify(state));

    // TWO KINDS IN THE HISTORY, never one. A statement reads the entries.
    const kinds = device.call('advanceHistory', device.State.schedule, id)
        .map(entry => `${entry.kind}:${ag(entry.amount || 0)}`);
    same('the history is four separate facts, each with its own kind and amount',
        kinds.sort(), ['deducted:320000', 'given:500000', 'repaid:30000', 'repaid:50000']);

    // TWO LABELS ON THE MAN'S OWN MESSAGE, with two different numbers beside them.
    const run = reportsIn(device, A);
    const text = run(`workerStatementText('w_01')`);
    check('his message says הוחזר במזומן 800, in those words',
        text.indexOf('הוחזר במזומן: 800') !== -1, JSON.stringify(text));
    check('and נוכה מהשכר 3200, in those words, on its own line',
        text.indexOf('נוכה מהשכר: 3200') !== -1, JSON.stringify(text));
    check('and never prints their sum as either one of them',
        text.indexOf('הוחזר במזומן: 4000') === -1
        && text.indexOf('נוכה מהשכר: 4000') === -1, JSON.stringify(text));

    // AND THE SHEET'S DEDUCTION COLUMN IS THE WAGE DEDUCTION, not the settlement.
    // tests/wording.test.mjs pins the column's NAME; this pins what is in it.
    const sheet = run('payrollSheetRows()');
    const heads = sheet[0];
    const line = sheet.find(item => item[0] === 'עומר סעד');
    check('the sheet\'s deduction column holds 3,200, not 4,000',
        ag(Number(line[heads.indexOf(run('deductionColumnName()'))])) === -320000,
        JSON.stringify([run('deductionColumnName()'), line]));
}

// ==================================================================================
// 4. A CORRECTION TARGETS A TRANSACTION, AND CARRIES ITS SEVEN FIELDS
// ==================================================================================
//
// tests/correction.test.mjs proves a correction is all of a transaction and is dated on
// it. This states the shape: the seven fields that let somebody answer for it without
// going to find the entry it names, and the direction each kind of target moves the debt.
{
    suite('4. a correction names one transaction and carries what it was');

    const device = crew({ deviceId: 'd_correct' });
    const id = giveAdvance(device, 5000, '2026-08-10', '',
        '2026-08-10T09:00:00.000Z', 'd_correct', 'cash');
    const repayment = device.call('recordAdvanceRepaid', device.State.schedule,
        id, 500, '2026-08-12', 'מזומן', '2026-08-12T09:00:00.000Z', 'd_correct', 'cash');
    device.State.commit(repayment);
    approveCarry(device);

    const before = device.call('advanceOutstanding', device.State.schedule, id);
    given('the repayment stands: 450,000 left', ag(before.left) === 450000,
        JSON.stringify(before));

    const written = device.call('recordEventReversed', device.State.schedule,
        repayment.value.id, 500, '2026-08-12', 'המזומן לא הגיע',
        '2026-08-26T09:00:00.000Z', 'd_correct');
    given('the correction was written', Boolean(written), JSON.stringify(written));
    device.State.commit(written);
    const entry = written.value;

    // THE SEVEN FIELDS. Each one is a question somebody asks of a correction, and each
    // one is answerable off the correction alone - on a statement, in a workbook, in a
    // backup, where the entry it names may not be beside it at all.
    const seven = ['targetId', 'targetKind', 'targetDate', 'targetAmount',
        'date', 'amount', 'reason'];
    const missing = seven.filter(field => entry[field] === undefined || entry[field] === '');
    check('all seven fields are on the correction itself', missing.length === 0,
        missing.join(','));
    same('and they say which transaction, of what kind, on what day, for how much',
        [entry.targetId, entry.targetKind, entry.targetDate, ag(entry.targetAmount),
            entry.date, ag(entry.amount), entry.reason],
        [repayment.value.id, 'repaid', '2026-08-12', 50000,
            '2026-08-12', 50000, 'המזומן לא הגיע']);
    check('it targets the TRANSACTION, not the advance',
        entry.targetId === repayment.value.id && entry.targetId !== id,
        JSON.stringify([entry.targetId, id]));
    check('and it is dated on the transaction it corrects, not on the day it was typed',
        entry.date === repayment.value.date && entry.at === '2026-08-26T09:00:00.000Z',
        JSON.stringify([entry.date, entry.at]));

    // THE DIRECTION. A repayment that never arrived puts the debt back UP.
    const after = device.call('advanceOutstanding', device.State.schedule, id);
    same('the cash that never came back is off the record: 500,000 owed again',
        [ag(after.repaid), ag(after.settled), ag(after.left), ag(after.repaidGross)],
        [0, 0, 500000, 50000]);
    check('and the gross history still says a repayment of 50,000 was once recorded',
        ag(after.repaidGross) === 50000 && ag(after.repaid) === 0,
        JSON.stringify(after));

    // THE OTHER DIRECTION, on a second advance: an advance recorded in error goes DOWN.
    const wrong = giveAdvance(device, 300, '2026-08-25', '',
        '2026-08-25T09:00:00.000Z', 'd_correct', 'cash');
    const origin = device.State.schedule.ledger.advances[device.call('originEntryId', wrong)];
    device.State.commit(device.call('recordEventReversed', device.State.schedule,
        origin.id, 300, '2026-08-25', 'נרשם על האדם הלא נכון',
        '2026-08-26T10:00:00.000Z', 'd_correct'));
    const undone = device.call('advanceOutstanding', device.State.schedule, wrong);
    same('an advance he never got: 30,000 given gross, nothing owed',
        [ag(undone.givenGross), ag(undone.given), ag(undone.left)], [30000, 0, 0]);

    // AND WHAT IT REFUSES, asked of a THIRD transaction that nothing has corrected yet -
    // so each refusal is refused for its own reason and not for being a second correction.
    const third = giveAdvance(device, 400, '2026-08-26', '',
        '2026-08-26T11:00:00.000Z', 'd_correct', 'cash');
    const fresh = device.State.schedule.ledger.advances[device.call('originEntryId', third)];
    check('a correction of part of a transaction is refused - it strands the rest',
        device.call('eventReversalProblems', device.State.schedule,
            fresh.id, 100, 'חצי').length > 0,
        JSON.stringify(device.call('eventReversalProblems', device.State.schedule,
            fresh.id, 100, 'חצי')));
    check('and a correction with no reason is refused',
        device.call('eventReversalProblems', device.State.schedule,
            fresh.id, 400, '   ').length > 0,
        JSON.stringify(device.call('eventReversalProblems', device.State.schedule,
            fresh.id, 400, '   ')));
    check('all of it, with a reason, is allowed',
        device.call('eventReversalProblems', device.State.schedule,
            fresh.id, 400, 'נרשם על האדם הלא נכון').length === 0,
        JSON.stringify(device.call('eventReversalProblems', device.State.schedule,
            fresh.id, 400, 'נרשם על האדם הלא נכון')));
    check('but a second correction of one already corrected is refused',
        device.call('eventReversalProblems', device.State.schedule, origin.id, 300,
            'שוב').length > 0,
        JSON.stringify(device.call('eventReversalProblems', device.State.schedule,
            origin.id, 300, 'שוב')));
    check('and the writer refuses it too, not only the validator',
        device.call('recordEventReversed', device.State.schedule, fresh.id, 100,
            '2026-08-26', 'חצי', '2026-08-26T12:00:00.000Z', 'd_correct') === null);
}

// ==================================================================================
// 5. TWO PHONES: A REPAYMENT AND A CORRECTION AT ONCE
// ==================================================================================
//
// tests/samefact.test.mjs proves one deterministic id with two signers is one fact;
// tests/money.concurrency.test.mjs races two phones through the production adapter
// against a real emulator. This is the shape underneath both, asked of MONEY: two phones
// each write a different fact about the same advance while offline, and both land.
{
    suite('5. a repayment on one phone and a correction on the other, at the same moment');

    const one = crew({ deviceId: 'd_one' });
    const id = giveAdvance(one, 5000, '2026-08-10', '',
        '2026-08-10T09:00:00.000Z', 'd_one', 'cash');
    const first = one.call('recordAdvanceRepaid', one.State.schedule,
        id, 500, '2026-08-12', 'מזומן', '2026-08-12T09:00:00.000Z', 'd_one', 'cash');
    one.State.commit(first);
    approveCarry(one);

    // The second phone starts from the first one's disk - they have synced this far.
    const two = makeDevice({ storage: one.dump(), deviceId: 'd_two', flags: OPEN });
    two.setToday('2026-09-03');
    two.ctx.askTell = () => Promise.resolve();
    two.State.load();
    await settle(5);

    // Now they go offline and each does something different. Phone one records a second
    // repayment; phone two corrects the first.
    one.State.commit(one.call('recordAdvanceRepaid', one.State.schedule,
        id, 300, '2026-08-14', 'מזומן', '2026-08-14T09:00:00.000Z', 'd_one', 'cash'));
    two.State.commit(two.call('recordEventReversed', two.State.schedule,
        first.value.id, 500, '2026-08-12', 'המזומן לא הגיע',
        '2026-08-14T09:05:00.000Z', 'd_two'));

    // Phone two's document arrives on phone one.
    one.Sync.receive(snapshotOf(one, two.State.schedule.ledger));
    await settle(5);

    const kinds = one.call('advanceHistory', one.State.schedule, id)
        .map(entry => `${entry.kind}:${ag(entry.amount || 0)}`).sort();
    same('both facts survive: nothing was dropped to make them agree',
        kinds, ['given:500000', 'repaid:30000', 'repaid:50000', 'reversed:50000']);

    // 500,000 given, 50,000 back that never arrived and was corrected, 30,000 back that
    // did. 500,000 - 30,000 = 470,000.
    const state = one.call('advanceOutstanding', one.State.schedule, id);
    same('and the arithmetic is the sum of both, to the agora',
        [ag(state.given), ag(state.repaid), ag(state.repaidGross), ag(state.left)],
        [500000, 30000, 80000, 470000]);
    check('which balances: 500,000 - 30,000 = 470,000',
        ag(state.given) - ag(state.repaid) === ag(state.left), JSON.stringify(state));

    // THE OTHER SHAPE: two phones correcting the SAME transaction. One deterministic id,
    // so the union holds one entry and the money moves once.
    const three = makeDevice({ storage: one.dump(), deviceId: 'd_three', flags: OPEN });
    three.setToday('2026-09-03');
    three.ctx.askTell = () => Promise.resolve();
    three.State.load();
    await settle(5);
    const already = three.call('recordEventReversed', three.State.schedule,
        first.value.id, 500, '2026-08-12', 'המזומן לא הגיע',
        '2026-08-14T09:09:00.000Z', 'd_three');
    check('a phone that can already see the correction writes no second one',
        already === null, JSON.stringify(already));

    // And when it could not see it - both offline - the two land on ONE field path with
    // the same money in them, and only the hand and the second differ.
    const mine = { id: one.call('eventReversalId', first.value.id),
        advanceId: id, kind: 'reversed', targetId: first.value.id, targetKind: 'repaid',
        targetDate: '2026-08-12', targetAmount: 500, date: '2026-08-12', amount: 500,
        reason: 'המזומן לא הגיע', at: '2026-08-14T09:09:00.000Z', by: 'd_three' };
    check('two phones writing the same correction are one fact, not a conflict',
        one.call('sameLedgerFact', one.State.schedule.ledger.advances[mine.id], mine),
        JSON.stringify([one.State.schedule.ledger.advances[mine.id], mine]));

    const conflicts = [];
    one.call('mergeLedgerInto',
        JSON.parse(JSON.stringify(one.State.schedule)),
        { ledger: { advances: { [mine.id]: mine } } }, conflicts);
    same('so no conflict is raised and the money moves once', conflicts.length, 0);

    // A DIFFERENT number under the same name is a disagreement, and is HELD - never
    // resolved by whichever copy happened to arrive.
    const held = [];
    one.call('mergeLedgerInto',
        JSON.parse(JSON.stringify(one.State.schedule)),
        { ledger: { advances: { [mine.id]: Object.assign({}, mine, { amount: 400 }) } } },
        held);
    check('but a different amount under the same name is held for a person',
        held.length === 1 && held[0].id === mine.id, JSON.stringify(held));
}

// ==================================================================================
// 6. A CLOSED PERIOD IS FROZEN
// ==================================================================================
//
// tests/closure.test.mjs is the suite for this and proves it in more directions than
// this does. Restated here because it is one of the seven activation conditions: a
// closed payslip must not be recomputed from live days, live names or live rates.
{
    suite('6. a closed fortnight is not recomputed from the live record');

    const device = crew({ deviceId: 'd_frozen' });
    const id = giveAdvance(device, 5000, '2026-08-10', '',
        '2026-08-10T09:00:00.000Z', 'd_frozen', 'cash');
    approveCarry(device);
    device.State.commitMany(device.call('closePeriodChanges', device.State.schedule,
        'w_01', A.from, A.to, '2026-08-20T18:00:00.000Z', 'd_frozen'));

    const closed = device.call('advanceAccount', device.State.schedule, 'w_01', A.from, A.to);
    same('closed on 320,000 earned, 320,000 off, 180,000 carried',
        [ag(closed.gross), ag(closed.deducted), ag(closed.net), ag(closed.carriedOut),
            closed.closed],
        [320000, 320000, 0, 180000, true]);
    check('and it balances: 500,000 given - 320,000 off = 180,000 carried',
        ag(closed.given) - ag(closed.deducted) === ag(closed.carriedOut),
        JSON.stringify(closed));

    const frozen = device.call('closedPeriods', device.State.schedule, 'w_01')[A.from];
    const basisBefore = JSON.stringify(frozen.basis);
    const daysBefore = JSON.stringify(frozen.days);

    // NOW THE LIVE RECORD MOVES, in the three ways it moves in real life.
    device.State.commit(device.call('clearWorkerDay', device.State.schedule,
        '2026-08-18', 'w_01', 'actual'));
    device.State.schedule.workers[0].dailyRate = 500;
    device.State.schedule.workers[0].name = 'עומר ס.';
    device.State.save({ silent: true });

    // THE RECORD REALLY DID MOVE. Read off the days themselves and off a range that is
    // NOT the closed account - the closed one is frozen, which is the whole claim, so
    // asking it whether it moved would be asking the answer to prove the question.
    given('the day is off the record',
        ((((device.State.schedule.days || {})['2026-08-18'] || {}).actual || {}).w_01
            || { entries: [] }).entries.length === 0,
        JSON.stringify(((device.State.schedule.days || {})['2026-08-18'] || {}).actual));
    const openRange = device.call('payrollReport', device.State.schedule,
        '2026-08-17', '2026-08-19').find(row => row.workerId === 'w_01');
    given('and an unfrozen range prices it lower', ag(openRange.amount) === 40000,
        String(ag(openRange.amount)));

    const again = device.call('advanceAccount', device.State.schedule, 'w_01', A.from, A.to);
    same('the closed payslip has not moved one agora',
        [ag(again.gross), ag(again.deducted), ag(again.net), ag(again.carriedOut)],
        [320000, 320000, 0, 180000]);

    // AND THE PAY SHEET'S OWN ROW, which is the surface the crew is paid from. It is
    // frozen with no gate in front of it: a phone whose gate is still shut must not
    // recompute a fortnight the phone with the gate open closed.
    const sheetRow = device.call('payrollReport', device.State.schedule, A.from, A.to)
        .find(row => row.workerId === 'w_01');
    same('the closed row still says eight days at 320,000, on the live schedule',
        [ag(sheetRow.amount), sheetRow.attendanceDays, sheetRow.payUnits],
        [320000, 8, 8]);
    const shutGate = makeDevice({ storage: device.dump(), deviceId: 'd_shut', flags: {} });
    shutGate.setToday('2026-09-03');
    shutGate.State.load();
    await settle(10);
    const shutRow = shutGate.call('payrollReport', shutGate.State.schedule, A.from, A.to)
        .find(row => row.workerId === 'w_01');
    check('and a phone whose gates are shut reads the same frozen row',
        ag(shutRow.amount) === 320000, String(ag(shutRow.amount)));

    const stillFrozen = device.call('closedPeriods', device.State.schedule, 'w_01')[A.from];
    check('nor the counts and the rate it was priced at',
        JSON.stringify(stillFrozen.basis) === basisBefore,
        JSON.stringify([stillFrozen.basis, JSON.parse(basisBefore)]));
    check('nor the list of days the wage was made of',
        JSON.stringify(stillFrozen.days) === daysBefore,
        JSON.stringify(stillFrozen.days));
    check('and the name on the frozen payslip is the name it was closed under',
        stillFrozen.basis.workerName === 'עומר סעד', stillFrozen.basis.workerName);

    // A SECOND CLOSE IS NOT A SECOND DEDUCTION.
    same('closing it again writes nothing',
        device.call('closePeriodChanges', device.State.schedule, 'w_01',
            A.from, A.to, '2026-09-01T18:00:00.000Z', 'd_frozen').length, 0);
}

{
    suite('6b. every writer names its operation, so two phones write one fact');

    // THE ACTIVATION CONDITION, stated on its own: an id derived from the OPERATION and
    // not from the moment somebody pressed a button. Two phones with no coordination
    // write the same field path, the union holds one entry, and the money moves once.
    // Measured before this existed: two phones each closed the same account, the union
    // kept both random ids, and 200 came off a wage from one closure pressed twice.
    const device = crew({ deviceId: 'd_ids' });
    const id = giveAdvance(device, 5000, '2026-08-10', '',
        '2026-08-10T09:00:00.000Z', 'd_ids', 'cash');
    const repayment = device.call('recordAdvanceRepaid', device.State.schedule,
        id, 500, '2026-08-12', '', '2026-08-12T09:00:00.000Z', 'd_ids', 'cash');
    device.State.commit(repayment);
    approveCarry(device);

    same('an advance names its origin after the advance',
        device.call('originEntryId', id), 'le_mig_' + id);
    same('a closure names the account it closes',
        device.call('closureId', id, A.from), `le_close_${id}_20260807`);
    same('a fortnight names the man and the day it opens',
        device.call('periodArtifactId', 'w_01', A.from), 'le_period_w_01_20260807');
    same('a correction names the transaction it corrects',
        device.call('eventReversalId', repayment.value.id),
        'le_rev_' + repayment.value.id);
    same('and the migration approval names the decision, not the numbers',
        device.call('carryMigrationId'), 'cm_carry');

    // THE SAME FORTNIGHT, CLOSED ON TWO PHONES THAT CANNOT SEE EACH OTHER.
    const other = makeDevice({ storage: afterSending(device), deviceId: 'd_ids2',
        flags: OPEN });
    other.setToday('2026-09-03');
    other.ctx.askTell = () => Promise.resolve();
    other.State.load();
    await settle(10);

    const mine = device.call('closePeriodChanges', device.State.schedule,
        'w_01', A.from, A.to, '2026-08-20T18:00:00.000Z', 'd_ids');
    const theirs = other.call('closePeriodChanges', other.State.schedule,
        'w_01', A.from, A.to, '2026-08-20T18:04:00.000Z', 'd_ids2');
    given('both phones did close it', mine.length === 2 && theirs.length === 2,
        JSON.stringify([mine.length, theirs.length]));
    same('and they wrote the same two field paths',
        mine.map(one => one.path).sort(), theirs.map(one => one.path).sort());
    same('with the same money in them',
        mine.map(one => ag(one.value.amount || 0)).sort(),
        theirs.map(one => ag(one.value.amount || 0)).sort());

    device.State.commitMany(mine);
    // The other phone's copies arrive. Only `at` and `by` differ - two people pressed the
    // button at two moments - and that is one fact with two signers, not a disagreement.
    const clashes = [];
    device.call('mergeLedgerInto',
        JSON.parse(JSON.stringify(device.State.schedule)),
        { ledger: { advances: theirs.reduce((all, one) => {
            all[one.value.id] = one.value; return all;
        }, {}) } }, clashes);
    same('so the second close is the first, not a second deduction', clashes.length, 0);

    // AND THE ARITHMETIC IS THE ONE CLOSE, not two. 320,000 off a wage of 320,000.
    theirs.forEach(one => { device.State.schedule.ledger.advances[one.value.id] = one.value; });
    const walk = device.call('advanceAccount', device.State.schedule, 'w_01', A.from, A.to);
    same('320,000 came off his wage once, and 130,000 is carried',
        [ag(walk.deducted), ag(walk.net), ag(walk.carriedOut)], [320000, 0, 130000]);
    check('and it balances: 500,000 given - 50,000 back - 320,000 off = 130,000',
        500000 - 50000 - 320000 === ag(walk.carriedOut), JSON.stringify(walk));
}

// ==================================================================================
// 7. THE OPENING AND CLOSING BALANCES ARE A FIXED PAIR
// ==================================================================================
//
// tests/closure.test.mjs «the frozen balance and the live debt are two numbers» and
// tests/repayment.test.mjs «היסטורי מול נוכחי» both say this. Restated as the activation
// condition: the pair a period was closed on never takes the value of the live open debt,
// and the live open debt is never printed under the frozen label.
{
    suite('7. the frozen pair and the live debt are two numbers that never swap');

    const device = crew({ deviceId: 'd_pair' });
    const id = giveAdvance(device, 5000, '2026-08-10', '',
        '2026-08-10T09:00:00.000Z', 'd_pair', 'cash');
    approveCarry(device);
    device.State.commitMany(device.call('closePeriodChanges', device.State.schedule,
        'w_01', A.from, A.to, '2026-08-20T18:00:00.000Z', 'd_pair'));

    const closed = device.call('advanceAccount', device.State.schedule, 'w_01', A.from, A.to);
    same('the pair the payslip states: opened on 0, closed on 180,000',
        [ag(closed.carriedIn), ag(closed.carriedOut)], [0, 180000]);

    // A repayment dated INTO the closed fortnight, recorded after it shut - the phone
    // that was in a tunnel, the import, the restore.
    device.State.commit(device.call('recordAdvanceRepaid', device.State.schedule,
        id, 400, '2026-08-15', 'הגיע מטלפון אחר', '2026-08-30T09:00:00.000Z',
        'd_late', 'cash'));

    const after = device.call('advanceAccount', device.State.schedule, 'w_01', A.from, A.to);
    same('the frozen pair is unchanged, and the live debt is 40,000 lower',
        [ag(after.carriedIn), ag(after.carriedOut), ag(after.carriedForward),
            ag(after.lateSinceClose)],
        [0, 180000, 140000, -40000]);
    check('the two are named apart, not reconciled into one',
        ag(after.carriedOut) !== ag(after.carriedForward)
        && ag(after.carriedOut) - ag(after.carriedForward) === -ag(after.lateSinceClose),
        JSON.stringify(after));

    // AND THE NEXT ACCOUNT OPENS ON THE LIVE ONE, because that is what he actually owes.
    const opens = device.call('advanceAccount', device.State.schedule, 'w_01', B.from, B.to);
    check('account B opens on the live 140,000, not on the frozen 180,000',
        ag(opens.carriedIn) === 140000, JSON.stringify(opens));

    // THE LABELS. A closed period says יתרת סגירה; an open one says חוב פתוח. The two
    // never appear over each other's number - tests/wording.test.mjs pins the words, and
    // this pins which number stands under which.
    const run = reportsIn(device, A);
    const closedText = run(`workerStatementText('w_01')`);
    check('the closed fortnight prints יתרת סגירה 1800',
        closedText.indexOf('יתרת סגירה: 1800') !== -1, JSON.stringify(closedText));
    check('and names the live total separately, as חוב פתוח כולל 1400',
        closedText.indexOf('חוב פתוח כולל: 1400') !== -1, JSON.stringify(closedText));
    check('and never prints the frozen figure under the open label',
        closedText.indexOf('חוב פתוח: 1800') === -1, JSON.stringify(closedText));

    run(`REPORT_RANGE.from = '${B.from}'; REPORT_RANGE.to = '${B.to}';`);
    const openText = run(`workerStatementText('w_01')`);
    check('the open fortnight never claims to be closed',
        openText.indexOf('יתרת סגירה') === -1, JSON.stringify(openText));
    check('and carries the 1,400 it inherited as its opening balance',
        openText.indexOf('יתרת פתיחה: 1400') !== -1, JSON.stringify(openText));
}

// ==================================================================================
// 8. AN ARCHIVED MAN WHO STILL OWES MONEY
// ==================================================================================
//
// The one place a debt could quietly leave the books: a man is put away and his row goes
// with him. Nothing in this repository stated it before.
{
    suite('8. a man in the archive keeps his debt, his history and his row');

    const device = crew({ deviceId: 'd_archive' });
    const id = giveAdvance(device, 5000, '2026-08-10', '',
        '2026-08-10T09:00:00.000Z', 'd_archive', 'cash');
    device.State.commit(device.call('recordAdvanceRepaid', device.State.schedule,
        id, 500, '2026-08-12', 'מזומן', '2026-08-12T09:00:00.000Z', 'd_archive', 'cash'));
    approveCarry(device);

    const beforeHistory = device.call('advanceHistory', device.State.schedule, id).length;
    const beforeLeft = ag(device.call('advanceOutstanding', device.State.schedule, id).left);
    given('he owes 450,000 agorot on two entries',
        beforeLeft === 450000 && beforeHistory === 2, `${beforeLeft} / ${beforeHistory}`);

    // WHAT THE DIALOG SAYS BEFORE HE IS PUT AWAY. It is the last thing anybody reads.
    const warning = device.call('openAdvanceBalance', device.State.schedule, 'w_01');
    same('the archive warning names one advance and 450,000 agorot still owed',
        [warning.count, ag(warning.total)], [1, 450000]);

    await device.call('setWorkerArchived', 'w_01', true);
    await settle(20);
    given('he is in the archive', device.State.worker('w_01').active === false,
        JSON.stringify(device.State.worker('w_01')));

    check('his debt is exactly what it was',
        ag(device.call('advanceOutstanding', device.State.schedule, id).left) === 450000,
        JSON.stringify(device.call('advanceOutstanding', device.State.schedule, id)));
    same('his history is exactly what it was',
        device.call('advanceHistory', device.State.schedule, id).length, beforeHistory);
    check('the advance record itself is untouched',
        ag((device.State.schedule.advances[id] || {}).amount) === 500000,
        JSON.stringify(device.State.schedule.advances[id]));

    // HIS ROW. payrollReport walks schedule.workers, archived included, so the fortnight
    // he worked still has a line - which is what stops a man's last pay disappearing on
    // the day he leaves.
    const row = device.call('payrollReport', device.State.schedule, A.from, A.to)
        .find(item => item.workerId === 'w_01');
    check('he still has a row on the pay sheet for the fortnight he worked',
        Boolean(row) && ag(row.amount) === 320000, JSON.stringify(row));

    const walk = device.call('advanceAccount', device.State.schedule, 'w_01', A.from, A.to);
    same('and his account still walks: 500,000 given, 50,000 back, 320,000 off',
        [ag(walk.given), ag(walk.repaid), ag(walk.deducted), ag(walk.carriedForward)],
        [500000, 50000, 320000, 130000]);

    // AND HE SURVIVES A REOPEN in the archive, still owing.
    const reopened = makeDevice({ storage: device.dump(), deviceId: 'd_archive',
        flags: OPEN });
    reopened.setToday('2026-09-03');
    reopened.State.load();
    await settle(5);
    check('after a reopen he is still archived and still owes 450,000',
        reopened.State.worker('w_01').active === false
        && ag(reopened.call('advanceOutstanding', reopened.State.schedule, id).left) === 450000,
        JSON.stringify(reopened.call('advanceOutstanding', reopened.State.schedule, id)));
}

// ==================================================================================
// 9. THE LEGACY MIGRATION PRESERVES EVERYTHING, AND THE APPROVAL OUTLIVES EVERY DOOR
// ==================================================================================
//
// tests/approval.test.mjs proves the approval moves the surfaces and survives two reopens
// and a second phone. tests/quarantine.test.mjs proves a damaged one is held. This is the
// activation condition stated whole: nothing dropped, nothing invented, and the approval
// through sync, backup, recovery and a restart in one run.
{
    suite('9. a v79 disk migrates without losing or inventing anything');

    // A disk as a phone that has never heard of a ledger leaves it: advances, no ledger.
    const legacy = crew({ deviceId: 'd_legacy', flags: {} });
    legacy.State.commit(legacy.call('addAdvance', legacy.State.schedule,
        'w_01', '2026-08-10', 5000, 'מזומן'));
    legacy.State.commit(legacy.call('addAdvance', legacy.State.schedule,
        'w_01', '2026-08-24', 1200.75, ''));
    delete legacy.State.schedule.ledger;
    legacy.State.save({ silent: true });
    const legacyAdvances = JSON.parse(JSON.stringify(legacy.State.schedule.advances));
    given('the disk has two advances and no ledger',
        Object.keys(legacyAdvances).length === 2 && !legacy.State.schedule.ledger,
        JSON.stringify(Object.keys(legacyAdvances)));

    // Opened by this build. The boot mirror is the ONE sanctioned write.
    const device = makeDevice({ storage: legacy.dump(), deviceId: 'd_legacy',
        flags: OPEN });
    device.setToday('2026-09-03');
    device.ctx.askTell = () => Promise.resolve();
    device.State.load();
    await settle(10);

    // NOTHING DROPPED. The legacy field is left exactly as it was - the other two phones
    // read it and it is the only copy until they update.
    same('the legacy advances are untouched, byte for byte',
        JSON.stringify(device.State.schedule.advances), JSON.stringify(legacyAdvances));

    // NOTHING INVENTED. One origin per advance, carrying the advance's own numbers and an
    // empty `at`, because an old advance has no timestamp and a fabricated one would be
    // the ledger's first lie.
    const entries = device.call('ledgerEntries', device.State.schedule);
    same('one origin entry per advance, and nothing else', entries.length, 2);
    const byAdvance = {};
    entries.forEach(entry => { byAdvance[entry.advanceId] = entry; });
    Object.keys(legacyAdvances).forEach(advanceId => {
        const entry = byAdvance[advanceId] || {};
        const was = legacyAdvances[advanceId];
        check(`the origin of ${advanceId} says exactly what the advance says`,
            entry.kind === 'given' && entry.workerId === String(was.workerId)
            && entry.date === String(was.date) && ag(entry.amount) === ag(was.amount)
            && entry.at === '' && entry.origin === 'migration',
            JSON.stringify([entry, was]));
    });

    const parity = device.State.ledgerParity();
    check('and the ledger says the same thing as the field it was built from',
        parity.agrees === true, JSON.stringify(parity));

    // The 1,200.75: the agorot survive the mirror.
    const fine = entries.find(entry => ag(entry.amount) === 120075);
    check('an advance with agorot in it is mirrored to the agora',
        Boolean(fine), JSON.stringify(entries.map(entry => ag(entry.amount))));

    // A SECOND BOOT WRITES NOTHING. The migration is once, per advance, for ever.
    const twice = makeDevice({ storage: device.dump(), deviceId: 'd_legacy', flags: OPEN });
    twice.setToday('2026-09-03');
    twice.State.load();
    await settle(10);
    same('opening it again mirrors nothing a second time',
        twice.call('ledgerEntries', twice.State.schedule).length, 2);
}

{
    suite('9b. the approval survives sync, backup, recovery and a restart');

    const device = crew({ deviceId: 'd_approval' });
    giveAdvance(device, 5000, '2026-08-10', '', '2026-08-10T09:00:00.000Z',
        'd_approval', 'cash');
    const plan = approveCarry(device);
    given('there was something to approve', plan.needed === true, JSON.stringify(plan));
    const approval = JSON.stringify(device.State.schedule.ledger.migrations.cm_carry);
    given('the approval is on the record', approval.indexOf('d_person') !== -1, approval);
    check('and it is what opens the reading gate',
        device.call('carryReportingEnabled', device.State.schedule) === true);

    // A RESTART.
    const reopened = makeDevice({ storage: device.dump(), deviceId: 'd_approval',
        flags: OPEN });
    reopened.setToday('2026-09-03');
    reopened.State.load();
    await settle(10);
    same('after a restart it is the same approval',
        JSON.stringify(reopened.State.schedule.ledger.migrations.cm_carry), approval);
    check('and the gate is still open on this record',
        reopened.call('carryReportingEnabled', reopened.State.schedule) === true);

    // SYNC: a snapshot from a phone that has never heard of the approval.
    device.Sync.receive(snapshotOf(device, { advances:
        JSON.parse(JSON.stringify(device.State.schedule.ledger.advances)) }));
    await settle(10);
    same('a snapshot that has never heard of it does not take it away',
        JSON.stringify((device.State.schedule.ledger.migrations || {}).cm_carry), approval);

    // BACKUP.
    device.call('exportBackup');
    const backupText = (device.downloads[device.downloads.length - 1] || {}).text;
    same('the backup file carries it',
        JSON.stringify(JSON.parse(backupText).ledger.migrations.cm_carry), approval);
    const opened = crew({ deviceId: 'd_opened' });
    opened.ctx.importBackup(opened.fileEvent('farkad-2026-09-03.json', backupText));
    await settle(40);
    same('and the phone that opens the file has it',
        JSON.stringify(opened.State.schedule.ledger.migrations.cm_carry), approval);

    // RECOVERY - the rescue file, the door of last resort.
    device.call('exportRecoveryData');
    const rescueText = (device.downloads[device.downloads.length - 1] || {}).text;
    const rescued = crew({ deviceId: 'd_rescue2' });
    rescued.ctx.importBackup(rescued.fileEvent('farkad-recovery.json', rescueText));
    await settle(80);
    same('and so does a phone rebuilt from the rescue file',
        JSON.stringify(((rescued.State.schedule.ledger || {}).migrations || {}).cm_carry),
        approval);
}

// ==================================================================================
// 10. THE TWO FILES, READ BACK
// ==================================================================================
//
// tests/exports.test.mjs reads particular entries out of a backup. This asks the whole
// question: the ledger CONTAINER, every family, every entry, compared as bytes against
// what the phone held - read out of the produced file, never off the writer.
{
    suite('10. the backup and the rescue file round-trip the ledger exactly');

    const device = crew({ deviceId: 'd_files' });
    const id = giveAdvance(device, 5000, '2026-08-10', 'על חשבון',
        '2026-08-10T09:00:00.000Z', 'd_files', 'transfer');
    device.State.commit(device.call('recordAdvanceRepaid', device.State.schedule,
        id, 500, '2026-08-12', 'מזומן', '2026-08-12T09:00:00.000Z', 'd_files', 'cash'));
    approveCarry(device);
    device.State.commitMany(device.call('closePeriodChanges', device.State.schedule,
        'w_01', A.from, A.to, '2026-08-20T18:00:00.000Z', 'd_files'));
    // And the two families that exist for what could NOT be read. They are evidence, and
    // evidence that does not survive a handover is evidence nobody can act on.
    device.State.schedule.ledger.unreadable = {
        le_bad: { id: 'le_bad', raw: '{"amount":', why: 'held aside at boot' }
    };
    device.State.schedule.ledger.unreadableMigrations = {
        cm_bad: { id: 'cm_bad', rows: 'לא מספר' }
    };
    device.State.save({ silent: true });

    const held = JSON.stringify(device.State.schedule.ledger);
    const families = Object.keys(device.State.schedule.ledger).sort();
    given('the phone holds four families and a closed fortnight',
        families.join(',') === 'advances,migrations,unreadable,unreadableMigrations',
        families.join(','));
    given('and four entries under advances: origin, repayment, artifact, deduction',
        Object.keys(device.State.schedule.ledger.advances).length === 4,
        JSON.stringify(Object.keys(device.State.schedule.ledger.advances)));

    // THE BACKUP FILE, parsed back out of the bytes that left the phone.
    device.call('exportBackup');
    const backupText = (device.downloads[device.downloads.length - 1] || {}).text;
    given('a backup file left the phone', typeof backupText === 'string');
    const fromBackup = JSON.parse(backupText).ledger;
    same('the backup file holds the same four families',
        Object.keys(fromBackup).sort(), families);
    check('and the same ledger, byte for byte, read back out of the file',
        JSON.stringify(fromBackup) === held,
        JSON.stringify([fromBackup, JSON.parse(held)]).slice(0, 400));

    // THE RESCUE FILE. Its schedule is the one the app is holding, and its records are
    // the raw disk - both have to carry the ledger, and both are read back here.
    device.call('exportRecoveryData');
    const rescueText = (device.downloads[device.downloads.length - 1] || {}).text;
    given('a rescue file left the phone', typeof rescueText === 'string');
    const rescue = JSON.parse(rescueText);
    // `liveSchedule` is the schedule AS THE APP IS HOLDING IT - which on the phone this
    // file exists for is not any record on the disk, so both halves are read back here.
    check('the rescue file\'s live schedule carries the ledger byte for byte',
        JSON.stringify((rescue.liveSchedule || {}).ledger) === held,
        String(JSON.stringify((rescue.liveSchedule || {}).ledger)).slice(0, 400));
    const rawRecord = JSON.parse(rescue.records['scheduleData:v2'] || '{}');
    check('and so do the raw disk records inside it',
        JSON.stringify(rawRecord.ledger) === held,
        JSON.stringify(rawRecord.ledger).slice(0, 400));

    // AND BOTH FILES OPEN. A file that round-trips and cannot be opened is not a way back.
    const fromFile = crew({ deviceId: 'd_from_backup' });
    fromFile.ctx.importBackup(fromFile.fileEvent('farkad-2026-09-03.json', backupText));
    await settle(40);
    check('the phone that opens the backup holds the same ledger',
        JSON.stringify(fromFile.State.schedule.ledger) === held,
        JSON.stringify(fromFile.State.schedule.ledger).slice(0, 400));
    check('written to that phone\'s disk, not only into its memory',
        JSON.stringify(JSON.parse(fromFile.raw('scheduleData:v2')).ledger) === held,
        String(fromFile.raw('scheduleData:v2')).slice(0, 200));

    const fromRescue = crew({ deviceId: 'd_from_rescue' });
    fromRescue.ctx.importBackup(fromRescue.fileEvent('farkad-recovery.json', rescueText));
    await settle(80);
    check('and the phone rebuilt from the rescue file holds it too',
        JSON.stringify(fromRescue.State.schedule.ledger) === held,
        JSON.stringify(fromRescue.State.schedule.ledger).slice(0, 400));

    // THE MONEY, not just the bytes: the same fortnight priced on the far side of both
    // files. Bytes that match and arithmetic that does not would be the worse failure.
    const walkOf = phone => {
        const account = phone.call('advanceAccount', phone.State.schedule,
            'w_01', A.from, A.to);
        return [ag(account.gross), ag(account.deducted), ag(account.carriedOut)];
    };
    same('the closed fortnight prices the same after the backup',
        walkOf(fromFile), walkOf(device));
    same('and the same after the rescue file', walkOf(fromRescue), walkOf(device));
}

// ==================================================================================
// 11. MALFORMED LEDGER DATA IS HELD ASIDE, NEVER COERCED, IN EVERY FAMILY
// ==================================================================================
//
// tests/ledger.ingress.test.mjs is the suite for this and goes wider. Restated here in
// the two doors money actually arrives by, because they answer differently and the
// difference is the thing an owner has to know before the gate is opened:
//
//   THE DISK      the record this phone already holds. Each family is read on its own
//                 terms; what cannot be read goes into a map of its own, keeps its bytes,
//                 and the fold never sees it.
//   THE CLOUD     a snapshot from another phone. It is refused WHOLE - nothing in it is
//                 adopted, not even the parts that read - the bytes are quarantined, and
//                 the device stops writing and says so.
{
    suite('11a. the disk door: every family held aside on its own terms, never coerced');

    const good = crew({ deviceId: 'd_seedgood' });
    const id = giveAdvance(good, 5000, '2026-08-10', '',
        '2026-08-10T09:00:00.000Z', 'd_seedgood', 'cash');
    approveCarry(good);
    const disk = JSON.parse(good.raw('scheduleData:v2'));
    const origin = good.call('originEntryId', id);

    // Four families, each with one record this build cannot read, on one disk.
    disk.ledger.advances.le_bad_amount = { id: 'le_bad_amount', advanceId: id,
        kind: 'repaid', date: '2026-08-12', amount: 'הרבה',
        at: '2026-08-12T09:00:00.000Z', by: 'd_other' };
    disk.ledger.advances.le_bad_date = { id: 'le_bad_date', advanceId: id,
        kind: 'repaid', date: 'מתישהו', amount: 100,
        at: '2026-08-12T09:00:00.000Z', by: 'd_other' };
    disk.ledger.advances.le_bad_kind = { id: 'le_bad_kind', advanceId: id,
        kind: 'הונאה', date: '2026-08-12', amount: 100,
        at: '2026-08-12T09:00:00.000Z', by: 'd_other' };
    disk.ledger.migrations.cm_bad = { id: 'cm_bad', kind: 'carry', rows: 'לא מספר',
        at: '2026-09-01T08:00:00.000Z', by: 'd_other' };
    disk.ledger.unreadable = { le_kept: { id: 'le_kept', raw: 'bytes from before' } };
    disk.ledger.unreadableMigrations = { cm_kept: { id: 'cm_kept', raw: 'bytes' } };
    disk.ledger.somethingLater = { note: 'a family this build has never heard of' };

    const opened = makeDevice({ deviceId: 'd_disk', flags: OPEN,
        storage: Object.assign({}, good.dump(), { 'scheduleData:v2': JSON.stringify(disk) }) });
    opened.setToday('2026-09-03');
    opened.ctx.askTell = () => Promise.resolve();
    opened.State.load();
    await settle(10);

    const ledger = opened.State.schedule.ledger || {};
    check('the good origin is still folded as money', owns(ledger.advances || {}, origin),
        JSON.stringify(Object.keys(ledger.advances || {})));
    ['le_bad_amount', 'le_bad_date', 'le_bad_kind'].forEach(bad => {
        check(`${bad} is not folded as money`, !owns(ledger.advances || {}, bad),
            JSON.stringify(Object.keys(ledger.advances || {})));
        check(`${bad} keeps its bytes, exactly as they arrived`,
            JSON.stringify((ledger.unreadable || {})[bad])
                === JSON.stringify(disk.ledger.advances[bad]),
            JSON.stringify((ledger.unreadable || {})[bad]));
    });
    check('the damaged approval is not read as an approval',
        !owns(ledger.migrations || {}, 'cm_bad'),
        JSON.stringify(Object.keys(ledger.migrations || {})));
    check('and keeps its bytes in the map of its own',
        JSON.stringify((ledger.unreadableMigrations || {}).cm_bad)
            === JSON.stringify(disk.ledger.migrations.cm_bad),
        JSON.stringify(ledger.unreadableMigrations));
    check('what an earlier read had already held aside stays held',
        owns(ledger.unreadable || {}, 'le_kept')
        && owns(ledger.unreadableMigrations || {}, 'cm_kept'),
        JSON.stringify([Object.keys(ledger.unreadable || {}),
            Object.keys(ledger.unreadableMigrations || {})]));
    check('the good approval is still an approval',
        owns(ledger.migrations || {}, 'cm_carry'),
        JSON.stringify(Object.keys(ledger.migrations || {})));
    check('and a family this build has never heard of is carried, not dropped',
        JSON.stringify(ledger.somethingLater) === JSON.stringify(disk.ledger.somethingLater),
        JSON.stringify(ledger.somethingLater));

    // NEVER COERCED. 'הרבה' must not become a number anywhere on the way to a person.
    const state = opened.call('advanceOutstanding', opened.State.schedule, id);
    same('the debt is exactly what the readable record says, to the agora',
        [ag(state.given), ag(state.repaid), ag(state.deducted), ag(state.left)],
        [500000, 0, 0, 500000]);
    const finite = row => Object.keys(row).every(key => typeof row[key] !== 'number'
        || Number.isFinite(row[key]));
    check('and no figure in the fold is NaN', finite(state), JSON.stringify(state));
    const walk = opened.call('advanceAccount', opened.State.schedule, 'w_01', A.from, A.to);
    check('nor in the account the pay sheet is drawn from', finite(walk),
        JSON.stringify(walk));

    // AND THE PERSON IS TOLD, AND THE PHONE STOPS WRITING. Held aside in silence is the
    // same as lost.
    check('the device stops writing while money it cannot read is on its disk',
        opened.call('farkadWritesBlocked') === true);
    const problems = opened.global('Recovery').problems;
    check('and says so, naming the ledger and pointing at the quarantined copy',
        problems.some(problem => problem.key === 'scheduleData:v2:ledger'
            && problem.copy === 'scheduleData:v2:ledger:damaged'),
        JSON.stringify(problems.map(problem => [problem.key, problem.copy])));
    const copy = JSON.parse(opened.raw('scheduleData:v2:ledger:damaged') || '{}');
    check('the quarantined copy carries both families, byte for byte',
        JSON.stringify(copy.unreadable) === JSON.stringify(ledger.unreadable)
        && JSON.stringify(copy.unreadableMigrations)
            === JSON.stringify(ledger.unreadableMigrations),
        String(opened.raw('scheduleData:v2:ledger:damaged')).slice(0, 300));
    check('and the original record on the disk is untouched',
        opened.raw('scheduleData:v2') === JSON.stringify(disk),
        String(opened.raw('scheduleData:v2')).slice(0, 120));
}

{
    suite('11b. the cloud door: a snapshot carrying money nobody can read is refused whole');

    const device = crew({ deviceId: 'd_cloud' });
    const id = giveAdvance(device, 5000, '2026-08-10', '',
        '2026-08-10T09:00:00.000Z', 'd_cloud', 'cash');
    approveCarry(device);
    const beforeMemory = JSON.stringify(device.State.schedule);
    const beforeDisk = device.raw('scheduleData:v2');

    // The snapshot carries a legitimate repayment AND one entry nobody can read.
    const arriving = snapshotOf(device, JSON.parse(JSON.stringify(device.State.schedule.ledger)));
    arriving.ledger.advances.le_good = { id: 'le_good', advanceId: id, kind: 'repaid',
        date: '2026-08-12', amount: 500, note: '',
        at: '2026-08-12T09:00:00.000Z', by: 'd_other' };
    arriving.ledger.advances.le_bad = { id: 'le_bad', advanceId: id, kind: 'repaid',
        date: '2026-08-12', amount: 'הרבה', at: '2026-08-12T09:00:00.000Z', by: 'd_other' };
    arriving.days = Object.assign({}, arriving.days,
        { '2026-08-19': { actual: { w_01: { entries: [{ placeId: 'p_01' }] } } } });

    device.Sync.receive(arriving);
    await settle(30);

    // NOTHING IS ADOPTED. Not the unreadable entry, not the readable one beside it, and
    // not the day - the whole document is refused rather than half-taken.
    same('memory is exactly what it was', JSON.stringify(device.State.schedule),
        beforeMemory);
    same('and so is the disk', device.raw('scheduleData:v2'), beforeDisk);
    check('the entry nobody can read did not land',
        !owns(device.State.schedule.ledger.advances, 'le_bad'),
        JSON.stringify(Object.keys(device.State.schedule.ledger.advances)));
    check('and neither did the readable one that shared its snapshot',
        !owns(device.State.schedule.ledger.advances, 'le_good'),
        JSON.stringify(Object.keys(device.State.schedule.ledger.advances)));

    // NEVER COERCED, AND NEVER REPORTED CLEAN.
    same('the debt has not moved one agora',
        ag(device.call('advanceOutstanding', device.State.schedule, id).left), 500000);
    check('the device stops writing', device.call('farkadWritesBlocked') === true);
    check('it does not say it is synced',
        device.Sync.status !== 'synced', String(device.Sync.status));
    const problems = device.global('Recovery').problems;
    check('and the bytes it could not read are quarantined and named',
        problems.some(problem => problem.key === 'scheduleData:v2:ledger'
            && String(problem.raw).indexOf('le_bad') !== -1),
        JSON.stringify(problems.map(problem => problem.key)));
    check('the quarantined copy is on the disk, under its own name',
        String(device.raw('scheduleData:v2:ledger:damaged')).indexOf('le_bad') !== -1,
        String(device.raw('scheduleData:v2:ledger:damaged')).slice(0, 200));

    // AND IT LEAVES ON THE RESCUE FILE, which is the only way those bytes get off a phone.
    device.call('exportRecoveryData');
    const rescueText = (device.downloads[device.downloads.length - 1] || {}).text;
    check('the rescue file carries the quarantined copy',
        typeof rescueText === 'string'
        && JSON.stringify(JSON.parse(rescueText).records || {}).indexOf('le_bad') !== -1,
        String(rescueText).slice(0, 200));
}

// ==================================================================================
// 12. AN OLDER CLIENT CANNOT OVERWRITE LEDGER FIELDS
// ==================================================================================
//
// Two halves, and only one of them is in Node. The CLIENT half is here: a document from a
// phone that has never heard of a ledger cannot subtract from this one's. The SERVER half
// - that a phone which does not speak the protocol is refused outright once the document
// is bootstrapped - is firestore.rules, and is measured by tests/rollout-matrix.test.mjs
// «cell 4» and tests/rules.test.mjs against the real emulator. This suite states which
// half it is proving so that nobody reads it as both.
{
    suite('12. a client that has never heard of a ledger cannot take one off this phone');

    const device = crew({ deviceId: 'd_old' });
    const id = giveAdvance(device, 5000, '2026-08-10', '',
        '2026-08-10T09:00:00.000Z', 'd_old', 'cash');
    device.State.commit(device.call('recordAdvanceRepaid', device.State.schedule,
        id, 500, '2026-08-12', 'מזומן', '2026-08-12T09:00:00.000Z', 'd_old', 'cash'));
    approveCarry(device);
    const held = JSON.stringify(device.State.schedule.ledger);

    // A v79 document: a whole schedule, no ledger key at all, stamped newer.
    const old = snapshotOf(device, null);
    given('the old client\'s document really has no ledger', old.ledger === undefined,
        JSON.stringify(Object.keys(old)));
    device.Sync.receive(old);
    await settle(10);
    // Compared family by family. normaliseSchedule creates the two maps every build now
    // has even when the record it read had neither, so a bare string comparison would
    // fail on an empty map being created rather than on anything being taken away.
    const familiesOf = ledger => JSON.stringify(['advances', 'migrations', 'unreadable',
        'unreadableMigrations'].map(key => JSON.stringify((ledger || {})[key] || {})));
    same('adopting it removes nothing',
        familiesOf(device.State.schedule.ledger), familiesOf(JSON.parse(held)));

    // AND IT SURVIVES THE WRITE THAT FOLLOWS. State.persist() writes the adopted document
    // over the disk, so a merge that is right in memory and wrong on the disk is wrong.
    device.State.commit(device.call('assignPlace', device.State.schedule,
        '2026-08-19', 'w_01', 'actual', 'p_01'));
    const reopened = makeDevice({ storage: device.dump(), deviceId: 'd_old', flags: OPEN });
    reopened.setToday('2026-09-03');
    reopened.State.load();
    await settle(10);
    same('and it is still on the disk after a reopen',
        familiesOf(reopened.State.schedule.ledger), familiesOf(JSON.parse(held)));

    // A v79 document that carries the OLD advances field with a different number in it.
    // The legacy field is what an old phone writes; it may not restate an entry.
    //
    // Sent first, so this measures what the SNAPSHOT does rather than what the replay of
    // this phone's own unsent edits does - see afterSending.
    const settled = makeDevice({ storage: afterSending(device), deviceId: 'd_old2',
        flags: OPEN });
    settled.setToday('2026-09-03');
    settled.ctx.askTell = () => Promise.resolve();
    settled.State.load();
    await settle(10);
    const restated = JSON.parse(JSON.stringify(settled.State.schedule));
    delete restated.ledger;
    restated.advances[id].amount = 300;
    restated.updatedAt = '2026-09-06T10:00:00.000Z';
    restated.updatedBy = 'd_v79';
    settled.Sync.receive(restated);
    await settle(20);
    given('the old phone\'s restatement really did land on the legacy field',
        ag(settled.State.schedule.advances[id].amount) === 30000,
        String(ag(settled.State.schedule.advances[id].amount)));
    const entry = settled.State.schedule.ledger.advances[settled.call('originEntryId', id)];
    check('an old phone restating the legacy amount does not restate the entry',
        ag(entry.amount) === 500000, JSON.stringify(entry));
    check('and the disagreement is visible rather than silent',
        settled.State.ledgerParity().agrees === false,
        JSON.stringify(settled.State.ledgerParity()));

    // THE SERVER HALF, named rather than claimed. These are the rules a phone is judged
    // by, and the two facts this suite depends on being true of them.
    const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
    check('the rules refuse a write with no protocol once the document is bootstrapped',
        /function legacyWrite\(\)\s*\{\s*return noRevisionYet\(\)/.test(rules), 'legacyWrite');
    check('and nothing deletes the schedule, ever',
        /allow delete: if false;/.test(rules), 'delete');
}

// ==================================================================================
// 13. THE WRITER GATE IS SHUT, AND THE DEFAULT IS PINNED
// ==================================================================================
//
// tests/data.test.mjs pins the pair in the model and tests/smoke.mjs asks a real browser.
// Restated here because it is the last activation condition and because this whole file
// runs with both gates OPEN: the suite that measures the open build has to be the one
// that proves the shipped build is shut.
{
    suite('13. the two gates ship false, together, and the source says so');

    const ledgerSource = readFileSync(new URL('../js/model/ledger.js', import.meta.url), 'utf8');
    const schemaSource = readFileSync(new URL('../js/model/schema.js', import.meta.url), 'utf8');
    check('LEDGER_WRITES is false in js/model/ledger.js',
        /^const LEDGER_WRITES = false;$/m.test(ledgerSource));
    check('carryAdvances is false in js/model/schema.js',
        /carryAdvances:\s*false/.test(schemaSource)
        && /carryAdvances:\s*true/.test(schemaSource) === false);

    // A device given no flags is a device somebody installs.
    const shipped = makeDevice({ deviceId: 'd_shipped' });
    shipped.setToday('2026-09-03');
    check('a phone as installed cannot write to the ledger',
        shipped.call('ledgerWritesEnabled') === false);
    check('and cannot read the carried arithmetic either',
        shipped.call('advanceCarryEnabled') === false);
    check('so no financial control on it may write',
        shipped.call('financialWritingEnabled', shipped.State.schedule) === false);

    // AND THE WRITER OBEYS IT. With the gate shut recordNewAdvance hands back the legacy
    // change alone - which is exactly what a phone that cannot read entries needs.
    shipped.State.schedule.workers = [
        { id: 'w_01', name: 'עומר סעד', active: true, dailyRate: 400, hourlyRate: 0 }
    ];
    shipped.State.save({ silent: true });
    const changes = shipped.call('recordNewAdvance', shipped.State.schedule,
        'w_01', '2026-08-10', 5000, '', '2026-08-10T09:00:00.000Z', 'd_shipped', 'cash');
    same('one change, and it is the legacy record every phone reads',
        [changes.length, changes[0].path.split('.')[0]], [1, 'advances']);
    shipped.State.commitMany(changes);
    same('nothing was appended to the ledger',
        Object.keys(((shipped.State.schedule.ledger || {}).advances) || {}).length, 0);

    // AND NOTHING IN THE SHELL CAN OPEN THE SEAM. The two model files READ the override
    // - that is what makes them openable by a suite - and no shipped file may DEFINE one,
    // and the page may not mention it at all. tests/build.test.mjs says this about every
    // cached file; the two that matter for money are said here as well.
    const defines = ['js/model/ledger.js', 'js/model/schema.js']
        .filter(file => {
            const code = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
            return /FARKAD_FLAG_OVERRIDES\s*=[^=]/.test(code)
                || /(var|let|const)\s+FARKAD_FLAG_OVERRIDES/.test(code);
        });
    check('no shipped file defines the override seam, only reads it',
        defines.length === 0, defines.join(','));
    check('and the page a phone loads does not mention it at all',
        /FARKAD_FLAG_OVERRIDES/.test(
            readFileSync(new URL('../index.html', import.meta.url), 'utf8')) === false);
}

await settle(20);
report();
