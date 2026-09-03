// ---------------------------------------------------------------- the files that leave
//
// Split out of js/ui/reports.js. The code is unchanged: the same functions in the same
// order, from scopedExportPlace to the end of the file. Nothing was renamed and nothing
// was tidied on the way past. See the header of js/ui/reports-statement.js for why the
// split that v102 measured and refused could be made now.
//
// WHAT THIS FILE OWNS: everything that turns the two reports into a file somebody else
// opens. The site the billing page is narrowed to, the rows of the pay sheet and of the
// invoice, the money cells and how a figure is spelled in them, the detail sheet, the
// shipped spreadsheet library and how it is loaded, the file names, and the dialog that
// tells a person where the file went and offers to write it again.
//
// WHAT IT MUST NEVER DO:
//   - price a day differently from the screen. One day has one price on every surface -
//     screen, WhatsApp, printed sheet and workbook - and tests/money.display.test.mjs and
//     tests/xlsx.test.mjs measure the same shekels through all four. A number that only
//     the spreadsheet believes is a number nobody can check.
//   - write anything into the record. Exporting is reading. Nothing here may record,
//     settle or close an account. tests/repayment.test.mjs counts the callers of the one
//     function that seals a fortnight, in this file's bytes as well as the others', and
//     requires that there be exactly one - the account-closing button, behind a
//     confirmation. Nothing on this path is it.
//   - fetch the library off the network. vendor/xlsx-0.18.5.min.js is in the service
//     worker's shell so the export works in a tunnel; reaching the CSV fallback means the
//     build on that phone is incomplete, not that the signal is weak, and it says so.
//   - claim a file was written when it was not. A failed export says what failed and that
//     nothing was changed, in Hebrew, rather than handing over a file that is not there.

// ---------------------------------------------------------------- export

// The one client site the billing page is narrowed to, resolved against the rows that
// are actually in range - or null, when the person is working from the payroll side or
// looking at every site at once.
function scopedExportPlace() {
    if (REPORT_SECTION !== 'sites' || !INVOICE_PLACE) return null;
    return invoiceByDate(State.schedule, REPORT_RANGE.from, REPORT_RANGE.to)
        .places.find(place => place.placeId === INVOICE_PLACE) || null;
}

// The one labelling map this page draws every site from.
//
// Built over REPORT_RANGE, because that is the span a report covers. Every surface the
// reports page produces reads it: the invoice sheet's column headers, the detail sheet's
// אתר column, the table on screen, the worker's own modal, the message he is sent, and
// the printed page. They used to ask separately - two of them with different spans and
// three of them not at all, printing the record id - so one site could carry three names
// in one export.
//
// It is NOT memoised, and that is the point of this version. It was, on
// `from|to|places.length|days.length` - collection SIZES, not contents - so anything that
// kept the counts equal left a stale map standing: a site renamed, a day moved from one
// site to another, a whole different record restored. And because only three of the
// consumers read the memo while the invoice half rebuilds its labels fresh in the model,
// a stale map did not merely age, it SPLIT ONE EXPORT IN TWO - the invoice sheet saying
// the new name and the detail sheet the old, in one workbook, for one site.
//
// Worse than an old name: unlisted sites are numbered positionally over a sorted list, so
// a stale map yields a wrong NUMBER. Moving one day renumbered a day nobody had touched.
//
// A correct key would have to be a hash of every place and every day's site references,
// which is most of the work the map itself does. So there is no key. It is a walk over
// the days in range, built per render, and the alternative to paying for it is a report
// that names a site by a number that belongs to a different site.
function reportPlaceLabels() {
    return placeLabelsIn(State.schedule, REPORT_RANGE.from, REPORT_RANGE.to);
}

// Each sheet built on its own, so a test can hold the rows up to the light without a
// browser or the spreadsheet library - the leak this file had lived exactly in what got
// bundled, not in any one sheet's arithmetic.
function payrollSheetRows() {
    // The exported columns say the SAME thing as the screen, under the same headings.
    // This file is the one that reaches the bookkeeper, and it used to write the gross
    // amount under 'לתשלום' - the heading the screen uses for the net - so the two
    // disagreed by exactly the advances, and the paper won.
    // The vehicle columns are here whenever this build does vehicles at all, unlike on
    // the screen where they appear only when somebody owns one. A spreadsheet is compared
    // against last month's, and a file whose columns move depending on whether a van went
    // out is a file that cannot be.
    //
    // While the feature is retired they are not written. Two columns of zeroes in a file
    // that reaches a bookkeeper are not neutral: they are a heading that says this app
    // still accounts for vehicles, beside a number saying it accounted for none.
    const withVehicles = vehiclesEnabled();
    const headers = ['עובד', 'ימי נוכחות', 'ימי שכר', 'מתוכם כפולים', 'שעות נוספות', 'נעדר']
        .concat(withVehicles ? ['ימי רכב', 'שכר רכב'] : [])
        .concat(['שכר יומי', 'נצבר', deductionColumnName(), 'לתשלום', 'הערה']);

    return [headers].concat(payrollRows().map(row => [
        row.name, row.attendanceDays, row.payUnits, row.doubleDays,
        row.extraHours, row.absent
    ].concat(withVehicles
        ? [row.vehicleDays || 0, agora(row.vehicleAmount || 0)]
        : []
    ).concat(moneyCells(row))));
}

// נצבר, מקדמות and לתשלום - the three columns a bookkeeper adds up, and the one
// reconciliation this file states in its own headings. Two faults lived in rounding each
// of them on its own and reading the net off a different number than the two cells above
// it:
//
//   Half a shekel. 400 earned, 250.5 taken, 149.5 left, rounded separately: 400, -251,
//   150 - and 400 − 251 is 149. One shekel, printed twice as two different answers, on
//   the row somebody is paid from. The advance form refuses a fraction, so this arrives
//   from another phone, an import or a restore - and the wire accepts it. So the net is
//   computed FROM the two cells as they are printed, never rounded on its own.
//
//   A man with no daily rate who was handed cash. His נצבר is blank - a man whose rate
//   was never entered is owed an unknown amount, which is not the same statement as
//   being owed nothing - but the 300 he was handed is not unknown at all, and it used to
//   sit alone in the מקדמות column with no total in the file that included it. Down the
//   column, נצבר less מקדמות did not equal לתשלום and the 300 in the gap was money
//   nobody could find; the person who found it was the bookkeeper, next month, in an
//   argument about 300 shekels.
//
//   So a row that has money in it is a row that adds up. With advances and no rate the
//   three cells are written as numbers - 0, -300, -300 - and the הערה says why the 0 is
//   there, because on its own it would read as a claim that he earned nothing. With no
//   rate AND no advances there is nothing to add up and all three stay blank, which is
//   where "unknown rather than zero" was argued and where it still holds.
// ONE derivation of displayed money, for every surface.
//
// Six surfaces show these three numbers - the table on screen, its totals band, the
// worker's modal, the message he is sent, the CSV and the workbook - and each of them
// rounded gross, advance and net independently, from the exact value. For 400 earned and
// 250.5 taken that produced 150, 150, 150, 149, 149 and a screen whose own columns said
// 400 − 251 = 150. Six answers to one question, on the rows somebody is paid from.
//
// So the rounding happens ONCE, to the agora, and the net is computed from the rounded
// parts rather than from the exact ones. An agora is the precision the record can hold:
// the advance form refuses a fraction, but the wire accepts one, so a fraction arrives
// from another phone, an import or a restore - and a value the surfaces cannot all
// represent is a value they will disagree about.
const agora = value => Math.round(Number(value) * 100) / 100;

// A number as a person reads it: whole shekels stay whole, an agora is shown rather than
// hidden. Showing 150 for 149.5 is not a rounding, it is a different number from the one
// the record holds, and somebody is paid from it.
function moneyText(value) {
    const at = agora(value);
    return Number.isInteger(at) ? String(at) : at.toFixed(2).replace(/0$/, '');
}

// The three numbers, derived together. `advances` is negative or zero, `net` is their
// sum, and `gross` is null when the man has no rate - unknown is not zero.
// AN OVER-SETTLED ACCOUNT, in one sentence, for every surface that shows money.
//
// More has been settled against this man's advances than was ever handed to him - two
// phones recording the same 500 handed back is how it happens, and both entries are real.
// advanceWalk stops the automatic deduction while that stands, which is right and is
// invisible: the sheet showed a clean net and the statement the man is SENT said nothing
// at all, so the one number a person would act on looked ordinary.
//
// Three things have to be said, and the same three everywhere: the account needs a
// person, by how much, and that the payment is not to be finalised on this. Written once
// here so a surface cannot say two of them.
function overpaymentWarning(account) {
    if (!account || !account.review || !(account.overpaid > 0)) return null;
    return `⚠️ החשבון דורש בדיקה · ההחזרים עולים על החוב הפתוח ב-${moneyText(account.overpaid)} ₪`
        + ' · אין לאשר את התשלום אוטומטית';
}

function moneyOf(row) {
    // Only a POSITIVE advance is money that was handed over, and only that is netted. A
    // negative one is not a repayment this build knows how to account for - netting it
    // would report a man as owed MORE than he earned, which is how gross 400 with an
    // advance of -500 came out as 900. It is shown, in the column, and it changes nothing.
    const taken = Number(row.advances);
    // WHAT COMES OFF THIS FORTNIGHT, which is not always what was taken in it.
    //
    // With the carry on, an advance larger than the wage is deducted only as far as the
    // wage reaches and the rest goes to the next account, so the number in this column is
    // the DEDUCTION - and moneyCells says so in the note, because a column quietly
    // showing less than was handed over, with nothing explaining where the remainder
    // went, is a worse sheet than the one it replaces.
    //
    // EXCEPT for a man with no rate, who keeps the arithmetic he always had.
    //
    // The walk is right about him - nothing can be deducted from a wage this app cannot
    // price, so his balance passes through untouched and carries. The COLUMN is a
    // different question, and taking the walk's answer there emptied his row: 300 handed
    // over in cash came out as a blank נצבר, a 0 in מקדמות and a blank לתשלום, with the
    // only trace of it a note. A bookkeeper totalling that column would be 300 short of
    // the cash that actually left the tin.
    //
    // So an unpriced row still says what he was handed. It is the one row where the
    // reconciliation cannot balance anyway - an unknown wage is not a number - and the
    // sheet's job there is to report the fact, not to tidy it away.
    const priceless = row.carry && row.carry.gross === null;
    const netted = row.carry && !priceless
        ? -agora(row.carry.deducted)
        : (taken > 0 ? -agora(taken) : 0);
    // A CLOSED FORTNIGHT PRINTS THE WAGE IT WAS CLOSED ON.
    //
    // row.amount is days times rates as the schedule prices them TODAY. For an open
    // period that is exactly right. For a closed one it means a day corrected off a
    // fortnight that was printed and paid, or a day added to it, rewrites a payslip
    // somebody already has in their hand - measured at 3,050 becoming 2,440 while the
    // deduction column stayed 3,050, so the row stopped adding up. The account carries
    // the wage the closure recorded; where it does, that is the number.
    //
    // A closure written before closures recorded their wage has none, and then the live
    // figure is the only answer there is. Nothing is invented for it.
    const frozen = row.carry && row.carry.closed && !priceless
        && row.carry.gross !== null && row.carry.gross !== undefined
        ? agora(row.carry.gross) : null;
    const priced = frozen !== null || row.amount !== null;
    const gross = frozen !== null ? frozen : (row.amount !== null ? agora(row.amount) : null);
    return {
        gross,
        advances: taken === 0 ? 0 : -agora(taken),
        netted,
        net: gross === null ? null : agora(gross + netted)
    };
}

function moneyCells(row) {
    const money = moneyOf(row);
    const advances = money.netted;
    const priced = row.amount !== null;
    const gross = priced ? money.gross : (advances === 0 ? '' : 0);
    const net = gross === '' ? '' : agora(gross + advances);

    const notes = [];
    // Said in shekels, not in a word like "partial": the man asking is asking how much.
    // A closed period says so, in the design's words, before it says anything else: the
    // figures beside that sentence are a record and not a reckoning.
    if (row.carry && row.carry.closed) {
        notes.push('החשבון נסגר ולא ישתנה');
    }
    if (row.carry && row.carry.carriedIn > 0) {
        notes.push(`${moneyText(row.carry.carriedIn)} ₪ מקדמה מחשבון קודם`);
    }
    // Not on an unpriced row: that row shows the whole amount in its own column, so a
    // note saying the same shekels are ALSO going to the next account would have the
    // sheet counting one advance twice.
    if (row.carry && row.carry.gross !== null && row.carry.carriedOut > 0) {
        notes.push(row.carry.closed
            ? `יתרת סגירה ${moneyText(row.carry.carriedOut)} ₪`
            : `${moneyText(row.carry.carriedOut)} ₪ מקדמה עוברים לחשבון הבא`);
    }
    // A transaction that arrived after the period shut. The payslip does not move; this
    // says why the two numbers differ rather than leaving them on the page unexplained.
    if (row.carry && row.carry.closed && row.carry.lateSinceClose !== 0) {
        notes.push('הגיעה תנועה אחרי סגירת התקופה · '
            + `חוב פתוח ${moneyText(row.carry.carriedForward)} ₪`);
    }
    if (row.carry && row.carry.repaid > 0) {
        notes.push(`${moneyText(row.carry.repaid)} ₪ ${LEDGER_KIND_LABELS.repaid}`);
    }
    // AND WHAT WAS CORRECTED AWAY, beside it, in its own words.
    //
    // The money columns are already net of it, so a note that named only the repayment
    // told the bookkeeper a man settled 400 in cash when the record says that repayment
    // was written against the wrong man and undone. The statement the worker himself is
    // sent has carried both lines since the account became one; this file is the surface
    // that carried one, and it is the one the argument about the money happens over.
    if (row.carry && row.carry.reversed > 0) {
        notes.push(`${moneyText(row.carry.reversed)} ₪ ${LEDGER_KIND_LABELS.reversed}`);
        // With the reason, in the file the argument about the money happens over. A
        // workbook that says 500 was corrected and does not say why sends the reader
        // back to a phone.
        correctionsIn(row.workerId, REPORT_RANGE.from, REPORT_RANGE.to)
            .forEach(entry => notes.push(correctionLine(entry)));
    }
    // THE ACCOUNT DOES NOT ADD UP, and the sheet says so where the number would have been.
    //
    // More has been settled against this man's advances than was ever handed to him -
    // two phones recording the same repayment is the way it happens. Nothing is deducted
    // while that stands (see advanceWalk), so this note is the difference between a clean
    // net somebody would pay out and a net with a reason to stop and ask.
    const overpayment = overpaymentWarning(row.carry);
    if (overpayment) notes.push(overpayment);
    if (!priced && advances !== 0) notes.push('בלי שכר יומי - הנצבר לא חושב');
    if (row.hoursUnpriced) notes.push('שעות נוספות בלי שכר שעה - לא נכללו');
    return [row.dailyRate, gross, advances, net, notes.join(' · ')];
}

function invoiceSheetRows() {
    const invoice = invoiceByDate(State.schedule, REPORT_RANGE.from, REPORT_RANGE.to);
    // Narrowed by the SAME predicate that decides whose file this is. The sticky
    // INVOICE_PLACE alone once narrowed the bookkeeper's workbook too: chosen on the
    // billing side, remembered after switching to לפי עובד, and three sites' days
    // quietly missing from a file named דוחות.
    const scoped = scopedExportPlace();
    const chosen = scoped ? invoice.places.find(p => p.placeId === scoped.placeId) : null;
    const places = chosen ? [chosen] : invoice.places;
    const dates = chosen ? chosen.days.map(day => day.date) : invoice.dates;

    const rows = [['תאריך'].concat(places.map(p => p.name)).concat(['סה״כ'])];
    dates.forEach(date => {
        const counts = places.map(p => invoice.countAt(p.placeId, date));
        rows.push([date].concat(counts).concat([counts.reduce((a, b) => a + b, 0)]));
    });
    rows.push(['סה״כ'].concat(places.map(p => p.workerDays))
        .concat([places.reduce((sum, p) => sum + p.workerDays, 0)]));
    return rows;
}

// Which sheets go in the file follows whose file it is. From the payroll side it is the
// bookkeeper's - all three. With one client's site chosen on the billing side it is the
// CLIENT's, and the client gets the billing grid alone: the other two sheets carry
// every worker's name and pay, which is exactly what the screen version of that page
// keeps off anything handed over. It used to write all three regardless, so the file
// said what the printed page was built never to say.
function reportSheets() {
    if (scopedExportPlace()) return { invoice: invoiceSheetRows() };
    return { payroll: payrollSheetRows(), invoice: invoiceSheetRows(), detail: detailRows() };
}

// Every worker-day in the range, one row each. The two summary sheets answer "how much";
// this is the sheet that answers "which days", which is the question that arrives a month
// later from an accountant or from the worker himself - and by then nobody is reopening
// the app to scroll a fortnight.
function detailRows() {
    const rows = [['תאריך', 'יום', 'עובד', 'אתר', 'סוג', 'שעות נוספות', 'לתשלום ליום']];
    // The page's own map - the same one the invoice sheet beside it bills into. It used to
    // read the whole schedule while the invoice read the report range, so the same missing
    // site was numbered differently on two sheets of one file.
    const labels = reportPlaceLabels();

    payrollRows().forEach(row => {
        const worker = State.worker(row.workerId);
        if (!worker) return;

        workerDaysReport(State.schedule, worker, REPORT_RANGE.from, REPORT_RANGE.to)
            .forEach(day => {
                const parsed = parseLocalDate(day.date);
                if (day.absent) {
                    rows.push([day.date, HEBREW_DAY_NAMES[parsed.getDay()], worker.name,
                        '', 'נעדר', '', '']);
                    return;
                }

                // The day's pay is written once, on its first line: repeating it against
                // every site would add up to double when the column is summed.
                day.entries.forEach((entry, index) => {
                    rows.push([
                        day.date,
                        HEBREW_DAY_NAMES[parsed.getDay()],
                        worker.name,
                        placeLabelFrom(labels, entry.placeId),
                        RATE_LABELS[entryRate(entry)],
                        entryExtraHours(entry) || '',
                        index === 0 ? (day.amount === null ? '' : agora(day.amount)) : ''
                    ]);
                });
            });
    });

    return rows;
}

// SheetJS, from this origin, loaded only when somebody actually asks for a spreadsheet.
//
// It used to be a plain script tag in the head, which is the most expensive place a
// third-party library can be: synchronous, before anything on the page, and on a slow
// mobile connection it does not fail so much as sit there - taking the whole app down
// with it for a feature used once a fortnight. Nothing is loaded until the button is
// pressed.
//
// And it used to come from a CDN, which meant the spreadsheet was the one thing in this
// app that needed a signal. On a building site that is not an edge case, it is most
// Tuesdays: the pay sheet is worked out on the phone, in the van, where the phone has
// been offline all day - and the export quietly produced three CSVs instead, under
// different filenames, for a bookkeeper expecting one workbook.
//
// It is a file on this origin now, in the service worker's shell like every other script,
// so a phone that has opened the app once can export from a tunnel. Pinned by filename to
// the exact version the arithmetic was proved against: tests/xlsx.test.mjs reads a real
// generated workbook back, and a silent version bump underneath it would change what that
// proves.
const XLSX_URL = 'vendor/xlsx-0.18.5.min.js';
let xlsxLoading = null;

function loadXlsx(timeoutMs = 8000) {
    if (typeof XLSX !== 'undefined') return Promise.resolve(true);
    if (xlsxLoading) return xlsxLoading;

    xlsxLoading = new Promise(resolve => {
        let settled = false;
        const finish = ok => {
            if (settled) return;
            settled = true;
            // Not remembered as a failure: the next attempt may be on a better
            // connection, and this is a button somebody presses again.
            if (!ok) xlsxLoading = null;
            resolve(ok && typeof XLSX !== 'undefined');
        };

        const tag = document.createElement('script');
        tag.src = XLSX_URL;
        tag.async = true;
        tag.onload = () => finish(true);
        tag.onerror = () => finish(false);
        document.head.appendChild(tag);
        setTimeout(() => finish(false), timeoutMs);
    });
    return xlsxLoading;
}

// THE TWO ANSWERS to the hand-over dialog, written once. Pinned verbatim by
// tests/xlsx.test.mjs and tests/smoke.mjs.
const EXPORT_CHOICE_DONE = 'הבנתי';
const EXPORT_CHOICE_AGAIN = 'שמירה חוזרת';

async function exportReports() {
    const stamp = `${REPORT_RANGE.from}_${REPORT_RANGE.to}`;
    const client = scopedExportPlace();
    const sheets = reportSheets();

    await loadXlsx();

    // CSV is still written rather than nothing - the numbers are the point and a person
    // who pressed export at the end of a fortnight must not be handed an error and an
    // empty hand. What changed is what it MEANS.
    //
    // While the library came from a CDN this was the ordinary offline path, and the
    // message said so gently. The file is on this origin now and in the shell, so
    // reaching here means the build itself is incomplete - a shelf that installed without
    // it, or a phone serving an app it only half has. That is worth saying plainly,
    // because the remedy is different: no amount of waiting for signal fixes it, and the
    // person needs to know the workbook is not coming back on its own.
    //
    // The client-scoped export stays scoped: only the billing sheet exists to fall back to.
    if (typeof XLSX === 'undefined') {
        if (sheets.payroll) downloadCsv(sheets.payroll, `farkad-payroll_${stamp}.csv`);
        downloadCsv(sheets.invoice, `farkad-invoice_${stamp}.csv`);
        if (sheets.detail) downloadCsv(sheets.detail, `farkad-detail_${stamp}.csv`);
        askTell(client
            ? 'חלק מהאפליקציה חסר במכשיר, ולכן קובץ החיוב יוצא כ-CSV במקום Excel. '
                + 'המספרים זהים. רענן את הדף כדי להשלים את ההתקנה.'
            : 'חלק מהאפליקציה חסר במכשיר, ולכן הקבצים יוצאו כ-CSV במקום Excel. '
                + 'המספרים זהים. רענן את הדף כדי להשלים את ההתקנה.');
        return;
    }

    try {
        const wb = XLSX.utils.book_new();

        // The file has to open the way it reads. Every sheet here is Hebrew - עובד is
        // the first column and לתשלום the last - and a workbook that says nothing about
        // its direction opens left to right on any Excel that is not itself Hebrew: the
        // first column lands on the far left and the bookkeeper reads the table
        // backwards. This is the one flag that decides it; SheetJS writes it into the
        // sheet as rightToLeft="1", which was checked against a real generated file
        // rather than taken from the documentation.
        //
        // The screen and the printed page have never had this problem - the page is
        // dir="rtl" and the PDF comes out of it - so this is the only place the
        // direction had to be said out loud.
        wb.Workbook = { Views: [{ RTL: true }] };

        if (sheets.payroll) {
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheets.payroll), 'שכר');
        }
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheets.invoice), 'חיוב');
        if (sheets.detail) {
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheets.detail), 'פירוט');
        }
        // NAMED LATIN-FIRST, like the backup (farkad-<date>.json) and the picture
        // (farkad-דוח-…png). The names were דוחות_<from>_<to>.xlsx and שכר_/חיוב_/פירוט_
        // <from>_<to>.csv, and a name that opens with a Hebrew word is laid out by a list
        // that runs right to left - the iPhone's Files app, a WhatsApp chat - as
        // xlsx.2026-08-20_2026-08-07_דוחות: the two dates swapped, the extension on the
        // far left, a name the person reads as "backwards". A name that begins in Latin
        // and stays Latin to its extension is one directional run, and one run is never
        // reordered, whichever way the list runs. The Hebrew stays where it is read as
        // Hebrew: the sheet names inside the workbook, and the columns.
        const name = client ? `farkad-invoice_${stamp}.xlsx` : `farkad-reports_${stamp}.xlsx`;
        XLSX.writeFile(wb, name);

        // SAID OUT LOUD, on the same pattern as the backup above it.
        //
        // The download was silent. A person pressed export at the end of a fortnight, the
        // sheet did not visibly change, and there was nothing on the screen to say
        // whether a file had been made - so the honest thing to do was press it again,
        // and again, which is how three copies of one workbook end up in a bookkeeper's
        // inbox with nobody sure which is current.
        //
        // The wording follows the backup dialog word for word in its shape, and stops
        // exactly where the backup does: the browser was HANDED the file. It is never
        // "נשמר בהצלחה", because this app cannot see the Files app and must not claim to.
        // The filename is Latin inside a Hebrew sentence, so it travels wrapped in
        // LRI…PDI - askChoice writes textContent, so the isolation has to be in the
        // string or the bidi algorithm folds the date backwards.
        //
        // WHAT IT SAYS ABOUT THE FILE has to be true in every viewer that opens it. It
        // used to end «הקובץ נפתח מימין לשמאל.» - true in Excel, where the sheetView flag
        // above is honoured, and false in the viewers an iPhone opens first: the Files
        // preview, WhatsApp's document preview and Numbers ignore the flag and lay עובד
        // out on the left, so the person who took the sentence at its word opened the
        // file and read the table backwards under a promise that it would not be. No way
        // of writing the file satisfies both kinds of viewer. So the sentence says where
        // right-to-left is true, admits the preview - with the numbers unchanged, which
        // is what matters - and points at the one door that reads right everywhere: the
        // picture beside the export button, drawn off the screen (js/ui/printout.js).
        //
        // ASKED AS A CHOICE, NOT A CONFIRM. «שמירה חוזרת» was askConfirm's cancel button,
        // and the export ran again whenever the promise came back false - which is also
        // what Escape and a tap beside the dialog resolve to on that path (askCancel in
        // js/ui/ask.js; js/ui/modal.js sends the backdrop there). Measured on v96 at
        // 390x844: one press, three taps beside the dialog, four workbooks - three copies
        // nobody asked for, on their way to a bookkeeper. askChoice resolves the label
        // that was pressed and null for every other way out, so only the named press
        // exports again and closing the dialog, however it is closed, writes nothing.
        //
        // A device with no dialogs (the harness's stub document, the same seam the
        // backup dialog in js/ui/share.js allows for) has nothing to ask through; the
        // file is already written and nothing here can undo that.
        if (typeof askChoice !== 'function') return;
        askChoice({
            title: 'קובץ ה-Excel נמסר לשמירה',
            message: '\u2066' + name + '\u2069 נמסר לדפדפן — '
                + 'פתח את "קבצים" וודא שהוא מופיע. '
                + 'ב-Excel הטבלה נפתחת מימין לשמאל; תצוגה מקדימה ("קבצים", וואטסאפ, Numbers) '
                + 'עשויה להציג אותה משמאל לימין, עם אותם מספרים. '
                + 'טבלה שנקראת נכון בכל מקום יוצאת מהכפתור «🖼️ שיתוף כתמונה».',
            choices: [EXPORT_CHOICE_DONE, EXPORT_CHOICE_AGAIN]
        }).then(answer => { if (answer === EXPORT_CHOICE_AGAIN) exportReports(); });
    } catch (error) {
        console.error('Report export failed:', error);
        // Named, the way the crash banner does it: which file failed, that the record
        // was not touched, and the error itself - "something went wrong" is not a
        // report anybody can act on.
        askTell({
            title: 'היצוא נכשל',
            // The raw error is English inside a Hebrew paragraph; LRI/PDI keep its
            // punctuation on its own side after the slice.
            message: 'קובץ ה-Excel לא נוצר. לא שינינו כלום. ' +
                '\u2066' + String((error && error.message) || error).slice(0, 160) + '\u2069'
        });
    }
}
