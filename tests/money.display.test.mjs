// One number for one day, wherever it is read.
//
//   node tests/money.display.test.mjs
//
// tests/money.test.mjs proves the arithmetic survives four doors. This asks the question
// underneath it: when the arithmetic produces a number that is not a whole shekel, do the
// surfaces AGREE about what that number is.
//
// The record holds agorot. A rate of 412.50 is a legal rate - rateProblems accepts any
// finite amount up to RATE_MAX - and an hourly rate multiplied by hours produces fractions
// without anybody typing one. js/ui/reports.js says what to do with such a value, in the
// comment over moneyText:
//
//     Showing 150 for 149.5 is not a rounding, it is a different number from the one the
//     record holds, and somebody is paid from it.
//
// The summary sheet obeys that. The day rows, the worker card, the WhatsApp statement and
// the detail sheet do not: they print Math.round(day.amount). So the two sheets of ONE
// exported file give the bookkeeper two different answers for the same fortnight, and the
// screen a man is shown agrees with neither.
//
// Every expected value here is a literal somebody could check on paper.

import { makeDevice, settle, reportsSource } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const FROM = '2026-08-07';
const TO = '2026-08-20';

// Two men, both on rates that do not divide into whole shekels.
//
//   דוד:  412.50 a day, three days           = 1,237.50
//   שרה:  300 a day and 37.25 an hour, two days with 2 extra hours on the second
//                                            = 300 + 300 + 74.50 = 674.50
//
// Neither number is exotic. A daily rate with agorot in it is what a raise negotiated as
// a percentage produces, and an hourly rate is a division.
function crew() {
    const device = makeDevice({ deviceId: 'd_agorot' });
    device.setToday('2026-08-20');
    device.State.schedule.workers = [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: 412.5, hourlyRate: 0 },
        { id: 'w_02', name: 'שרה', active: true, dailyRate: 300, hourlyRate: 37.25 }
    ];
    device.State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
    device.State.save({ silent: true });

    const put = (date, workerId, hours) => device.State.commit(
        device.call('assignPlace', device.State.schedule, date, workerId,
            'actual', 'p_01', undefined, hours));
    put('2026-08-10', 'w_01');
    put('2026-08-11', 'w_01');
    put('2026-08-12', 'w_01');
    put('2026-08-10', 'w_02');
    put('2026-08-11', 'w_02', 2);
    return device;
}

function reportsIn(device) {
    const run = code => vm.runInContext(code, device.ctx, { filename: 'harness:reports' });
    // The day card's renderer borrows appendSiteName from js/ui/sitecolor.js, which
    // index.html loads before this file. Loading one without the other is a harness
    // fault, not a product one.
    run(readFileSync(new URL('../js/ui/sitecolor.js', import.meta.url), 'utf8'));
    run(reportsSource());
    run(`REPORT_RANGE.from = '${FROM}'; REPORT_RANGE.to = '${TO}';`
        + `REPORT_SECTION = 'workers'; INVOICE_PLACE = null;`);
    return run;
}

const device = crew();
const run = reportsIn(device);

// ------------------------------------------------- the record holds what it holds
{
    suite('the record holds agorot, and says so');

    const rows = device.call('payrollReport', device.State.schedule, FROM, TO);
    const amount = name => (rows.find(row => row.name === name) || {}).amount;

    same('the two men are owed exactly this', [amount('דוד'), amount('שרה')],
        [1237.5, 674.5]);
}

// ------------------------------------------------------ the two sheets of one file
{
    suite('the two sheets of one exported file');

    // 'נצבר' on the summary sheet: the column a bookkeeper adds up.
    const summary = run('payrollSheetRows()');
    const heads = summary[0];
    const earnedAt = heads.indexOf('נצבר');
    const summaryOf = name => {
        const row = summary.find(r => r[0] === name);
        return row ? row[earnedAt] : undefined;
    };

    given('the summary sheet names its earned column', earnedAt !== -1, String(earnedAt));
    same('and carries the agorot', [summaryOf('דוד'), summaryOf('שרה')],
        ['1237.5', '674.5'].map(Number));

    // 'לתשלום ליום' on the detail sheet: the same money, one line per day.
    const detail = run('detailRows()');
    const payAt = detail[0].indexOf('לתשלום ליום');
    const paid = detail.slice(1)
        .filter(row => row[payAt] !== '' && row[payAt] !== undefined)
        .map(row => Number(row[payAt]));

    given('the detail sheet names its pay column', payAt !== -1, String(payAt));

    // THE FAULT, stated as the bookkeeper meets it: add up the detail sheet's own column
    // and compare it with the summary sheet in the same workbook.
    const detailTotal = paid.reduce((sum, value) => sum + value, 0);
    check('the detail rows add up to what the summary sheet says',
        Math.abs(detailTotal - (1237.5 + 674.5)) < 1e-9,
        `detail ${detailTotal}, summary ${1237.5 + 674.5}, rows ${JSON.stringify(paid)}`);
}

// --------------------------------------------------------- the man's own statement
{
    suite('the statement a man is sent, and the card he is shown');

    const text = run(`workerStatementText('w_01')`);
    check('the WhatsApp statement prices a day at what the record holds',
        text.includes('412.5'), JSON.stringify(text));

    // THE CARD ON THE SCREEN IS NOT ASKED HERE, and that is a limit worth naming rather
    // than papering over. js/ui/reports.js:1053 prices the day card with the same
    // Math.round(day.amount) the statement above uses, so it moves with this fix - but
    // this harness's createElement does not accumulate text through appendChild, so a
    // check written here would read "" whatever the app did. A test that cannot fail is
    // worse than no test. The card is measured in a real browser by tests/print.test.mjs
    // and tests/mobile.test.mjs.
}

await settle(1);
report();
