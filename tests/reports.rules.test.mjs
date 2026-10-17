// What the work report shows, and what it does not.
//
//   node tests/reports.rules.test.mjs
//
// The owner's decisions of 17 October 2026, which replace the earlier specification and
// are therefore the spec this suite pins:
//
//   - Hide a worker who has no actual work INSIDE THE PERIOD, and only for that reason.
//   - Do NOT hide a worker who worked because his wage is not set - the hours are the
//     record, the missing rate is a separate problem and the sheet already says so.
//   - Do NOT hide a worker who is inactive today if he has work inside the period.
//   - A balance or an advance ALONE does not put a worker in the WORK report. The money
//     is not lost by that: the מקדמות screen lists every worker with a balance, work or
//     no work, which is where an outstanding amount is read.
//   - The headings are shortened to נוכחות | ימי שכר | כפולים. The numbers under them
//     and the arithmetic that produces them do not change.
//   - Filtering the payroll by pay cycle does not move a shekel on the sites report.
//
// Nothing here changes a rate, a stamp, a cycle boundary, a closure or an account.

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDevice } from './harness.mjs';
import { suite, check, given, report } from './runner.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORTS = readFileSync(join(ROOT, 'js/ui/reports.js'), 'utf8');

const TODAY = '2026-10-20';
const FROM = '2026-10-02';
const TO = '2026-10-15';
const WORKED = '2026-10-06';

const run = (device, code) => vm.runInContext(code, device.ctx, { filename: 'harness:reports' });

// One crew, four men, each the shape of one rule:
//   w_rate   worked, has a rate      - the ordinary row
//   w_norate worked, NO rate         - must stay, the work is the record
//   w_off    worked, inactive today  - must stay, the work happened
//   w_money  no work, an advance     - must NOT be in the work report
function phone() {
    const device = makeDevice({ deviceId: 'd_reports' });
    device.setToday(TODAY);
    vm.runInContext(REPORTS, device.ctx, { filename: 'harness:reports' });
    device.ctx.askTell = () => Promise.resolve();
    device.ctx.askConfirm = () => Promise.resolve(true);
    device.State.schedule.workers = [
        { id: 'w_rate', name: 'סאלח', active: true, dailyRate: 450, hourlyRate: 0 },
        { id: 'w_norate', name: 'כרם', active: true, dailyRate: 0, hourlyRate: 0 },
        { id: 'w_off', name: 'עודי', active: false, dailyRate: 500, hourlyRate: 0 },
        { id: 'w_money', name: 'רגא', active: true, dailyRate: 470, hourlyRate: 0 }
    ];
    device.State.schedule.places = [{ id: 'p_01', name: 'פרסדיה', active: true }];
    ['w_rate', 'w_norate', 'w_off'].forEach(id => {
        device.State.commit(device.call('assignPlace',
            device.State.schedule, WORKED, id, 'actual', 'p_01', 'normal'));
    });
    // The fourth man takes cash and works no day in the period.
    device.State.commit(device.call('addAdvance',
        device.State.schedule, 'w_money', WORKED, 500, ''));
    device.State.save({ silent: true });
    run(device, `REPORT_RANGE.from='${FROM}'; REPORT_RANGE.to='${TO}';`);
    return device;
}

const namesInWork = device => run(device,
    'payrollRows().map(row => row.workerId).join(",")');

// ------------------------------------------------------------------ who is on the sheet
{
    suite('who the work report shows');

    const device = phone();
    given('the crew and the period are set up',
        run(device, 'State.schedule.workers.length') === 4
        && run(device, 'advancesFor(State.schedule, "w_money", REPORT_RANGE.from, REPORT_RANGE.to).length') === 1,
        namesInWork(device));

    const ids = namesInWork(device);
    check('a man who worked is on the sheet', ids.indexOf('w_rate') !== -1, ids);
    check('a man who worked with no rate set is on the sheet too',
        ids.indexOf('w_norate') !== -1, ids);
    check('and a man who worked but is inactive today', ids.indexOf('w_off') !== -1, ids);
    check('a man with only an advance and no work is NOT on the work report',
        ids.indexOf('w_money') === -1, ids);

    // And the money is not lost by leaving him off it.
    const balance = run(device, 'workerAdvanceSummary("w_money").left');
    check('his balance is still there to be read on the advances screen',
        Number(balance) === 500, String(balance));
    check('and he is still one of the workers the advances screen lists',
        run(device, 'advanceWorkersInOrder().map(w => w.id).join(",")').indexOf('w_money') !== -1,
        run(device, 'advanceWorkersInOrder().map(w => w.id).join(",")'));
}

// ------------------------------------------------------------------------ the headings
{
    suite('the headings are the three the owner asked for');

    const device = phone();
    const head = run(device, 'JSON.stringify(payrollSheetRows()[0])');
    const headers = JSON.parse(head);
    check('attendance is «נוכחות»', headers[1] === 'נוכחות', head);
    check('pay days keep «ימי שכר»', headers[2] === 'ימי שכר', head);
    check('and the double column is «כפולים»', headers[3] === 'כפולים', head);
    check('the columns after them are unchanged',
        headers[4] === 'שעות נוספות' && headers[5] === 'נעדר', head);

    // The numbers under them are the same numbers.
    const row = JSON.parse(run(device, 'JSON.stringify(payrollSheetRows().slice(1).find(r => r[0].indexOf("סאלח") !== -1))'));
    check('one attendance day under the shortened heading', Number(row[1]) === 1, JSON.stringify(row));
    check('and one pay day', Number(row[2]) === 1, JSON.stringify(row));
}

// -------------------------------------------------------------- the sites report stands
{
    suite('the sites report does not move when the payroll is filtered');

    const device = phone();
    const before = run(device, 'JSON.stringify(invoiceRows().map(r => [r.placeId, r.workerDays]))');
    // Choose only the men paid one way - the payroll's own picker - and ask the sites
    // report again. It answers about places and days worked; a pay cycle is not one of
    // its inputs and must never become one.
    run(device, 'REPORT_WORKERS = new Set(["w_rate"]);');
    const after = run(device, 'JSON.stringify(invoiceRows().map(r => [r.placeId, r.workerDays]))');
    check('the sites report is the same report', before === after, `${before} -> ${after}`);
}

report();
