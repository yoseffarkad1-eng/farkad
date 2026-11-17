// A crew and a phone for tests/xlsxlook.test.mjs and for the before/after pictures of the
// workbook (v202). A helper, not a suite: it asserts nothing.
//
// SYNTHETIC NAMES ONLY. Invented men, invented sums, invented sites.
//
// The phone runs the pay sheet from `source` - this checkout's js/ui/reports.js, or v201's
// out of Git - on the same record, so the two files can be laid side by side cell for cell.
// The last inch of the export (XLSX.writeFile) is the only thing redirected: the bytes the
// shipped library would have handed the browser are kept.
//
// What the record holds, today Wednesday 25/11/2026 - the fortnight 13/11-26/11, its second
// week 20/11-26/11 (both Friday-anchored):
//
//   כרים חוסיין   weekly, 450      four days this week, a double one, 300 taken
//   נאסר ג'אבר    weekly, 400      three days this week and an absence
//   זיאד מסארוה   weekly, 420      two days LAST week with 2,000 taken, one day this week
//   סאלח עודה     fortnightly, 500 nine days, 1,500 taken
//   עודי חמדאן    fortnightly, 480 a double day, a day with 2 extra hours at 50, a day
//   רגא בכרי      fortnightly, 412.5  five days - agorot in the wage
//   מוסא דראושה   fortnightly, no daily rate, three days, 300 taken
//
// four sites, Rima's men counted on two of them, and Yosef Geves's on two.

import vm from 'node:vm';
import { makeDevice } from './harness.mjs';
import { workbookOf, SHEETJS_CODE } from './exports-proof.lib.mjs';

export const LOOK_TODAY = '2026-11-25';
const W = '2026-08-07=weekly';

export const LOOK_WORKERS = [
    { id: 'w_k', name: 'כרים חוסיין', active: true, dailyRate: 450, hourlyRate: 0, payCycles: W },
    { id: 'w_n', name: 'נאסר ג\'אבר', active: true, dailyRate: 400, hourlyRate: 0, payCycles: W },
    { id: 'w_z', name: 'זיאד מסארוה', active: true, dailyRate: 420, hourlyRate: 0, payCycles: W },
    { id: 'w_s', name: 'סאלח עודה', active: true, dailyRate: 500, hourlyRate: 0 },
    { id: 'w_o', name: 'עודי חמדאן', active: true, dailyRate: 480, hourlyRate: 50 },
    { id: 'w_r', name: 'רגא בכרי', active: true, dailyRate: 412.5, hourlyRate: 0 },
    { id: 'w_m', name: 'מוסא דראושה', active: true, dailyRate: 0, hourlyRate: 0 }
];
export const LOOK_PLACES = [
    { id: 'p_1', name: 'פרדסיה', active: true },
    { id: 'p_2', name: 'הרצליה פיתוח', active: true },
    { id: 'p_3', name: 'רמת השרון - מגדל', active: true },
    { id: 'p_4', name: 'כפר סבא', active: true }
];

// The days and the money, through the app's own writers. `counts: false` leaves Rima and
// Yosef Geves off the record; `geves: false` leaves only Yosef Geves off.
export function lookSeed(device, options = {}) {
    const work = (id, date, place, rate, hours) => device.State.commit(device.call('assignPlace',
        device.State.schedule, date, id, 'actual', place, rate || 'normal', hours));
    const cash = (id, date, amount) => device.State.commit(device.call('addAdvance',
        device.State.schedule, id, date, amount, ''));
    ['2026-11-22', '2026-11-23', '2026-11-25'].forEach(date => work('w_k', date, 'p_1'));
    work('w_k', '2026-11-24', 'p_2', 'double');
    cash('w_k', '2026-11-24', 300);
    ['2026-11-22', '2026-11-23', '2026-11-25'].forEach(date => work('w_n', date, 'p_2'));
    device.State.commit(device.call('markAbsent', device.State.schedule, '2026-11-24', 'w_n', 'actual'));
    ['2026-11-16', '2026-11-17', '2026-11-22'].forEach(date => work('w_z', date, 'p_3'));
    cash('w_z', '2026-11-16', 2000);
    ['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19',
        '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25'].forEach((date, i) => work('w_s', date, i % 2 ? 'p_1' : 'p_4'));
    cash('w_s', '2026-11-17', 1500);
    work('w_o', '2026-11-16', 'p_3', 'double');
    work('w_o', '2026-11-18', 'p_3', 'extra', 2);
    work('w_o', '2026-11-23', 'p_4');
    ['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19'].forEach(date => work('w_r', date, 'p_2'));
    ['2026-11-22', '2026-11-23', '2026-11-24'].forEach(date => work('w_m', date, 'p_1'));
    cash('w_m', '2026-11-23', 300);
    if (options.counts !== false) {
        const rima = (date, place, count) => device.State.commit(device.call('setRimaCount',
            device.State.schedule, date, place, count));
        rima('2026-11-16', 'p_1', 3);
        rima('2026-11-17', 'p_1', 2);
        rima('2026-11-23', 'p_3', 4);
        if (options.geves !== false) {
            const geves = (date, place, count) => device.State.commit(device.call('setYosefGevesCount',
                device.State.schedule, date, place, count));
            geves('2026-11-16', 'p_2', 5);
            geves('2026-11-19', 'p_2', 6);
            geves('2026-11-23', 'p_4', 2);
        }
    }
}

// One phone on `source`, the crew above on it (or `seed` instead), the gates as installed
// unless `flags` says otherwise, approved where the record needs it, and the range set.
export function lookPhone(source, options = {}) {
    const device = makeDevice({ deviceId: 'd_look', flags: options.flags || undefined });
    device.setToday(options.today || LOOK_TODAY);
    const fetched = [];
    device.ctx.document.head = {
        appendChild(tag) { fetched.push(tag); if (options.sheetjs === false && tag.onerror) tag.onerror(); }
    };
    device.ctx.askTell = () => Promise.resolve();
    device.ctx.askConfirm = () => Promise.resolve(true);
    device.ctx.askChoice = () => Promise.resolve(null);
    device.State.schedule.workers = (options.workers || LOOK_WORKERS).map(worker => ({ ...worker }));
    device.State.schedule.places = (options.places || LOOK_PLACES).map(place => ({ ...place }));
    device.State.save({ silent: true });
    const run = code => vm.runInContext(code, device.ctx, { filename: 'harness:xlsxlook' });
    run(source);
    (options.seed || lookSeed)(device, options);
    const plan = device.call('planCarryMigration', device.State.schedule);
    if (plan && plan.needed) {
        device.State.commit(device.call('recordCarryApproval', device.State.schedule,
            plan, '2026-10-29T09:00:00.000Z', 'd_person'));
    }
    device.State.save({ silent: true });
    // The page as it OPENS unless a range is given: the fortnight containing today, each
    // weekly man read over his own week (v189).
    const range = options.range || run('defaultPayrollRange()');
    run(`REPORT_RANGE.from = '${range.from}'; REPORT_RANGE.to = '${range.to}';`
        + ` REPORT_PRESET = '${options.preset || 'fortnight'}';`
        + ` REPORT_SECTION = '${options.section || 'workers'}';`
        + ` INVOICE_PLACE = ${options.place ? `'${options.place}'` : 'null'};`
        + ` REPORT_WORKERS = ${options.chosen ? `new Set(${JSON.stringify(options.chosen)})` : 'null'}; 1`);
    const caught = [];
    // `sheetjs: false` is a phone whose shelf lost the library: the CSV fallback.
    if (options.sheetjs !== false) {
        vm.runInContext(SHEETJS_CODE, device.ctx, { filename: 'xlsx.full.min.js' });
        device.ctx.__caught = caught;
        run(`XLSX.writeFile = function (wb, filename) {
                 __caught.push({ filename: filename, wb: wb,
                     bytes: XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) });
             };`);
    }
    return {
        device, run, fetched, caught, downloads: device.downloads,
        async exportOnce() {
            caught.length = 0;
            await run('exportReports()');
            if (caught.length !== 1) throw new Error(`exportReports wrote ${caught.length} workbooks, not one`);
            const book = workbookOf(Buffer.from(caught[0].bytes));
            book.filename = caught[0].filename;
            book.wb = caught[0].wb;
            return book;
        }
    };
}
