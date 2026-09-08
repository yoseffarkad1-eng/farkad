// The advance surfaces, asked the money.display question: does every document say the
// same thing about the same shekels, and does it say each of them SEPARATELY.
//
//   node tests/exports-proof.advances.mjs
//
// tests/money.display.test.mjs proves one DAY has one price on the screen, in the
// WhatsApp statement and on the exported sheets. An advance is harder, because it is not
// one number: a fortnight can carry a balance in, take new money out, deduct part of it
// from the wage, receive cash back, have one of those movements corrected, and carry a
// balance out - six figures that a document showing their SUM would be lying about.
//
// The board's export map (ExportTruthMap) states the rule the outputs are measured
// against here: new advances, the deduction, a cash repayment, the opening/closing pair,
// the movements and a correction each appear under their own name in every administrative
// output, and «a deduction is NEVER labelled מקדמות in any output».
//
// The surfaces reachable without a browser are the ones this file asks: the account
// itself, the WhatsApp statement a man is sent, the workbook, and the CSV fallback. The
// printed page and the fallback picture are asked in tests/exports-proof.print.mjs.

import { suite, check, same, given, report } from './runner.mjs';
import { phone, SHEETJS_PRESENT, SHEETJS_PATH } from './exports-proof.lib.mjs';

given(`SheetJS is in the tree (${SHEETJS_PATH})`, SHEETJS_PRESENT);

// עומר, the worked example: 500 a day and 50 an hour, six pay-days and one hour is 3,050
// against an advance of 5,000. A repayment of 400 in cash is recorded against the wrong
// man and corrected. So 3,050 is deducted, 1,950 carries to the next account, and the 400
// nets to nothing - six separate facts, and every document has to carry all six.
const WORKED_EXAMPLE = `
    State.commitMany(recordNewAdvance(State.schedule, 'w_01', '2026-08-10', 5000, '',
        '2026-08-10T09:00:00.000Z', 'd_one', 'cash'));
    ['2026-08-07','2026-08-10','2026-08-11','2026-08-12','2026-08-13'].forEach(
        date => State.commit(assignPlace(State.schedule, date, 'w_01', 'actual', 'p_01')));
    State.commit(assignPlace(State.schedule, '2026-08-14', 'w_01', 'actual', 'p_01',
        RATE_EXTRA, 1));
    var plan = planCarryMigration(State.schedule);
    if (plan.needed) State.commit(recordCarryApproval(State.schedule, plan,
        '2026-08-15T08:00:00.000Z', 'd_one'));
    var repay = recordAdvanceRepaid(State.schedule, Object.keys(State.schedule.advances)[0],
        400, '2026-08-16', '', '2026-08-16T09:00:00.000Z', 'd_one', 'cash');
    State.commit(repay);
    State.commit(recordEventReversed(State.schedule, repay.value.id, 400, '2026-08-17',
        'נרשם על האדם הלא נכון', '2026-08-17T09:00:00.000Z', 'd_one'));
    State.save({ silent: true });`;

const CREW = {
    flags: { carryAdvances: true, ledgerWrites: true },
    from: '2026-08-07', to: '2026-08-20',
    workers: [{ id: 'w_01', name: 'עומר סעד', active: true, dailyRate: 500, hourlyRate: 50 }],
    places: [{ id: 'p_01', name: 'הרצליה', active: true }]
};

const paper = phone(WORKED_EXAMPLE, CREW);
const workbook = await paper.exportOnce();
const account = paper.run(`advanceAccount(State.schedule, 'w_01', '2026-08-07', '2026-08-20')`);
const statement = paper.run(`workerStatementText('w_01')`);
const head = workbook.sheets['שכר'].values[0];
const row = workbook.sheets['שכר'].values[1];
const note = String(row[head.indexOf('הערה')] || '');

// The same fortnight through the CSV door, so the two files can be compared cell by cell
// rather than believed one at a time.
const fallback = phone(WORKED_EXAMPLE, Object.assign({ sheetjs: false }, CREW));
fallback.failOnFetch();
await fallback.run('exportReports()');
const csvRow = fallback.downloads[0].text.split('\r\n')[1];

{
    suite('the record this fortnight actually holds');

    same('3,050 earned, 5,000 handed over, 3,050 deducted, 1,950 carried, 400 corrected',
        [account.gross, account.given, account.deducted, account.carriedForward,
            account.repaid, account.reversed],
        [3050, 5000, 3050, 1950, 400, 400]);
}

{
    suite('every figure is on the man\'s own statement, under its own name');

    const says = (label, amount) =>
        statement.includes(`${label}: ${amount}`) || statement.includes(`${label} ${amount}`);

    check('the new advance, named and dated', statement.includes('מקדמות חדשות: 5000')
        && /במזומן 10\/08: .*5000/.test(statement), JSON.stringify(statement));
    check('the cash repayment, by its own name', says('הוחזר במזומן', 400), '');
    check('the correction, by its own name', says('תיקון-היפוך', 400), '');
    check('the wage deduction, by its own name', says('נוכה מהשכר', 3050), '');
    check('and the balance that carries out of this fortnight',
        statement.includes('1950'), JSON.stringify(statement.split('\n').slice(-4)));
    // The deduction and the advance are different numbers here, which is the whole point
    // of the fixture: a document that printed one for the other would be out by 1,950.
    check('the deduction is never called מקדמות on it',
        !/מקדמות: *3050|מקדמות *3050/.test(statement), JSON.stringify(statement));
}

{
    suite('and every one of them is in the workbook, under the same name');

    same('the deduction column is named after the deduction, not after the advance',
        [head.indexOf('נוכה מהשכר') !== -1, head.indexOf('מקדמות') !== -1], [true, false]);
    same('the three money cells are the wage, the deduction and the net',
        [row[head.indexOf('נצבר')], row[head.indexOf('נוכה מהשכר')],
            row[head.indexOf('לתשלום')]], [3050, -3050, 0]);
    check('the balance carried to the next account is named in the note',
        note.includes('1950') && note.includes('לחשבון הבא'), note);
    check('the cash repayment is named in it', note.includes('400 ₪ הוחזר במזומן'), note);
    check('and the correction that undid it, so 400 is not read as cash he settled',
        note.includes('400 ₪ תיקון-היפוך'), note);
    // RED where it is red: measured, not assumed.
    check('the money handed over in this period is on the sheet as its own figure',
        note.includes('5000') || row.indexOf(5000) !== -1 || row.indexOf(-5000) !== -1,
        `note ${JSON.stringify(note)} row ${JSON.stringify(row)}`);
}

{
    suite('the CSV fallback carries the same numbers as the workbook it stands in for');

    const cells = csvRow.split('","').map(cell => cell.replace(/^"|"$/g, ''));
    same('the same eleven cells', cells.length, row.length);
    same('cell for cell, as text', cells.slice(0, 10),
        row.slice(0, 10).map(cell => String(cell)));
    // The two files come off two independently seeded phones, and a ledger id is minted
    // per record - so the ONE thing that legitimately differs between these two notes is
    // the id each phone gave its own correction. Masked here, and asserted on its own
    // line below, rather than dropped: a note that stopped carrying an id at all would
    // otherwise pass this comparison quietly.
    const withoutIds = text => String(text).replace(/le_[a-z0-9]+/g, 'le_…');
    same('and the note is the same sentence', withoutIds(cells[10]), withoutIds(note));
    check('each of them carrying its own record\'s transaction id',
        /מזהה תנועה .le_[a-z0-9]+/.test(cells[10]) && /מזהה תנועה .le_[a-z0-9]+/.test(note),
        `${cells[10]} | ${note}`);
    // The board asks that the fallback name itself a fallback and not a workbook.
    check('the message calls it a fallback for a build that is incomplete, not a workbook',
        fallback.told.length === 1 && fallback.told[0].includes('חלק מהאפליקציה חסר')
        && fallback.told[0].includes('CSV במקום Excel'), JSON.stringify(fallback.told));
}

// ------------------------------------------------------ the seven fields of a correction
//
// The board's rule for a reversal: source id · source kind · source date · source amount ·
// reason · correction date · recorded by, in EVERY administrative output. The entry
// carries all seven (recordEventReversed in js/model/ledger.js writes targetId,
// targetKind, targetDate, targetAmount, reason, at and by), so this is a question about
// what each document chooses to print out of them.
{
    suite('a correction, and the seven fields the board asks of every administrative output');

    const entry = paper.run(`JSON.stringify(ledgerEntries(State.schedule)
        .filter(function (e) { return e.kind === 'reversed'; })[0])`);
    const held = JSON.parse(entry);
    given('the ledger entry carries all seven', Boolean(held.targetId) && Boolean(held.targetKind)
        && Boolean(held.targetDate) && held.targetAmount !== undefined
        && Boolean(held.reason) && Boolean(held.at) && Boolean(held.by), entry);

    [['the workbook note', note], ['the statement', statement]].forEach(([where, text]) => {
        check(`${where}: the kind of what was corrected`, text.includes('הוחזר במזומן'), text);
        check(`${where}: the date of what was corrected`, text.includes('16/08'), text);
        check(`${where}: the amount of what was corrected`, text.includes('400'), text);
        check(`${where}: the reason somebody typed`,
            text.includes('נרשם על האדם הלא נכון'), text);
        check(`${where}: the id of the transaction it corrects`,
            text.includes(held.targetId), `looking for ${held.targetId}`);
        check(`${where}: the day the correction itself was recorded`,
            text.includes('17/08') || text.includes(String(held.at).slice(0, 10)),
            `looking for ${held.at}`);
        check(`${where}: who recorded it`, text.includes(String(held.by)),
            `looking for ${held.by}`);
    });
}

// ------------------------------------------ the same record, read over two ranges
//
// payrollRows (js/ui/reports.js) attaches the carry ONLY when the chosen range is a whole
// Friday-anchored account, and the comment there says why: a month is not a payday, and a
// walk over a month once counted an advance inside the range as carried in from before
// it. So the range a person picks decides which arithmetic every document does - and
// «החודש» is one tap on the range bar.
//
// This is not the board's mislabelling case: over a month the column is called מקדמות and
// holds the advance, which is honest. What it does not do is say which of the two
// readings the reader is holding, and the two differ by the whole carried balance.
{
    suite('the same record read over a month, which is one tap on the range bar');

    const month = phone(WORKED_EXAMPLE,
        Object.assign({}, CREW, { from: '2026-08-01', to: '2026-08-31' }));
    const book = await month.exportOnce();
    const heads = book.sheets['שכר'].values[0];
    const cells = book.sheets['שכר'].values[1];
    const at = name => heads.indexOf(name);
    const monthly = month.run(`workerStatementText('w_01')`);
    const monthNote = String(cells[at('הערה')] || '');

    given('the month range is not a whole account',
        month.run(`wholeAccountRange('2026-08-01', '2026-08-31')`) === false, '');
    check('the heading and the number under it agree with each other',
        at('מקדמות') !== -1 && cells[at('מקדמות')] === -5000,
        `«${heads[at('מקדמות') !== -1 ? at('מקדמות') : at('נוכה מהשכר')]}» over `
        + `${cells[at('מקדמות') !== -1 ? at('מקדמות') : at('נוכה מהשכר')]}`);

    // THE ARITHMETIC IS NOT THE FAULT AND DOES NOT MOVE. Over these dates the advance
    // came off in full, and -1,950 is the honest answer to the question that was asked;
    // 0 is the honest answer to a different one. What must not happen is a document that
    // answers one of them while looking exactly like the other - so what is asked here is
    // that each document SAYS which question it answered.
    same('the arithmetic over the picked dates is unchanged', cells[at('לתשלום')], -1950);
    check('the sheet says the range is not an account period',
        monthNote.includes('הטווח אינו תקופת חשבון'), JSON.stringify(monthNote));
    check('and that these figures carry no balance either way',
        monthNote.includes('בלי יתרה מחשבון קודם')
        && monthNote.includes('בלי יתרה שעוברת לחשבון הבא'), JSON.stringify(monthNote));
    check('the man\'s own statement says the same thing',
        monthly.includes('אינו תקופת חשבון') && monthly.includes('המקדמות נוכו במלואן'),
        JSON.stringify(monthly.split('\n').slice(-5)));
    // The one reading a person acts on: a minus in front of לתשלום is not money owed to
    // him. Nothing else on the page says so, and over a whole account it never appears.
    check('and says what the minus in front of לתשלום does not mean',
        monthly.includes('סכום שלילי כאן אינו כסף שמגיע לעובד'),
        JSON.stringify(monthly.split('\n').slice(-5)));
    // And the account itself is still one tap away, said by the name of the chip that
    // reaches it - the document points at the reading it is not.
    check('while the whole account, which reads 0 payable, is unchanged',
        month.run(`advanceAccount(State.schedule, 'w_01', '2026-08-07', '2026-08-20').deducted`)
            === 3050,
        '');
}

// ---------------------------------------------------------------- an overpaid account
{
    suite('an account that does not add up says so on every document, and deducts nothing');

    const over = phone(`
        State.commitMany(recordNewAdvance(State.schedule, 'w_01', '2026-08-10', 500, '',
            '2026-08-10T09:00:00.000Z', 'd_one', 'cash'));
        ['2026-08-10','2026-08-11','2026-08-12'].forEach(
            date => State.commit(assignPlace(State.schedule, date, 'w_01', 'actual', 'p_01')));
        var id = Object.keys(State.schedule.advances)[0];
        State.commit(recordAdvanceRepaid(State.schedule, id, 400, '2026-08-16', '',
            '2026-08-16T09:00:00.000Z', 'd_one', 'cash'));
        State.commit(recordAdvanceRepaid(State.schedule, id, 400, '2026-08-17', '',
            '2026-08-17T09:00:00.000Z', 'd_two', 'cash'));
        // Approved AFTER the movements: carryMigrationApproved matches an approval to the
        // plan it was given, and a movement recorded after one changes the plan - which
        // is the harness fault this fixture was written with the first time, and reads on
        // the sheet exactly like the app refusing to show the review.
        var plan = planCarryMigration(State.schedule);
        if (plan.needed) State.commit(recordCarryApproval(State.schedule, plan,
            '2026-08-18T08:00:00.000Z', 'd_one'));
        State.save({ silent: true });`, CREW);

    const walk = over.run(`advanceAccount(State.schedule, 'w_01', '2026-08-07', '2026-08-20')`);
    given('more has been handed back than was ever given', walk.review === true
        && walk.repaid === 800 && walk.given === 500, JSON.stringify(walk));

    const book = await over.exportOnce();
    const heads = book.sheets['שכר'].values[0];
    const cells = book.sheets['שכר'].values[1];
    const overNote = String(cells[heads.indexOf('הערה')] || '');
    const overStatement = over.run(`workerStatementText('w_01')`);

    same('nothing is deducted from the wage while the account is in review',
        cells[heads.indexOf('לתשלום')], cells[heads.indexOf('נצבר')]);
    const WARNING = '⚠️ החשבון דורש בדיקה · ההחזרים עולים על החוב הפתוח ב-300 ₪ · '
        + 'אין לאשר את התשלום אוטומטית';
    check('the workbook says so, in the words the app pins',
        overNote.includes(WARNING), overNote);
    check('and the statement the man is sent says the same words',
        overStatement.includes(WARNING), JSON.stringify(overStatement));
    check('the 300 is its own figure, not folded into anything',
        overNote.includes('300') && overStatement.includes('300'),
        `${overNote} | ${overStatement}`);
    check('and the cash he handed back is still named separately',
        overNote.includes('800 ₪ הוחזר במזומן') && overStatement.includes('הוחזר במזומן: 800'),
        `${overNote} | ${overStatement}`);
}

report();
