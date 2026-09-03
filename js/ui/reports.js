// The two outputs the record exists for: what each worker is owed, and what the client is
// billed. Both run over a free date range because neither cycle is a week - pay is every
// two weeks and invoicing is periodic.
//
// Neither report shows an ID number or a phone. Those are in the app so the manager can
// reach someone, not so they can travel out in a spreadsheet.

const REPORT_RANGE = { from: null, to: null };

// Which chip is lit. 'custom' is the only one that shows the two raw date inputs -
// for everyone else the period is one press, not two calendars.
let REPORT_PRESET = 'fortnight';

// null = every site on one page, which is the working view. A site id here narrows the
// invoice to that client alone, for printing.
let INVOICE_PLACE = null;

// Which of the two reports is on screen: 'workers' is the pay sheet, 'sites' the
// billing grid. On a phone the two stacked was one long scroll with the answer to the
// wrong question at the top of it. BOTH stay in the DOM - print gets the whole record,
// the screen shows the one being asked about.
let REPORT_SECTION = 'workers';

// The account period as the owner runs it: fourteen days, Friday through Thursday
// twice, and WHICH fortnight is anchored to the business's own seam - see accountStart
// in dates.js. This returns the account containing today, whole, even on its first
// morning.
function defaultPayrollRange() {
    const from = accountStart(parseLocalDate(todayStr()));
    const to = new Date(from);
    to.setDate(from.getDate() + 13);
    return { from: toLocalDateStr(from), to: toLocalDateStr(to) };
}

function renderReports() {
    const root = document.getElementById('reportsView');
    if (!root) return;

    if (!REPORT_RANGE.from) {
        const range = defaultPayrollRange();
        REPORT_RANGE.from = range.from;
        REPORT_RANGE.to = range.to;
    }

    clear(root);
    root.appendChild(renderRangePicker());
    root.appendChild(renderSectionToggle());
    renderOverCapNotice(root);

    // Both sections are built and both are in the DOM, whichever is chosen; the one not
    // being looked at carries .report-offscreen, which the print block hides as well.
    // Only the section on screen reaches the paper, on purpose: a client's report leaves
    // the crew out of it, and the pay sheet does not carry the client's invoice behind
    // it - tests/print.test.mjs pins both directions. (This comment used to say the
    // hidden section stayed on paper. It does not, and must not.) The invoice's page
    // break keys on the pay sheet being printed in front of it, so the order these two
    // are appended in is what the stylesheet reads.
    // With one client's site chosen, the printer follows the same rule as the export
    // button beside it: the pay sheet stays out of the client's hands. The body class
    // is what the print stylesheet keys on.
    if (document.body && document.body.classList) {
        document.body.classList.toggle('client-scoped', Boolean(scopedExportPlace()));
    }
    const payroll = renderPayrollTable();
    const invoice = renderInvoiceTable();
    if (REPORT_SECTION === 'sites') payroll.classList.add('report-offscreen');
    else invoice.classList.add('report-offscreen');
    root.appendChild(payroll);
    root.appendChild(invoice);
}

// The same two-button switch the day screen uses for its two ways of looking at one
// day - these are two ways of looking at one fortnight.
function renderSectionToggle() {
    const toggle = el('div', 'layer-toggle mode-toggle mode-quiet report-section-toggle');
    toggle.appendChild(sectionButton('workers', 'לפי עובד'));
    toggle.appendChild(sectionButton('sites', 'לפי אתר'));
    return toggle;
}

function sectionButton(key, text) {
    const on = REPORT_SECTION === key;
    const btn = button(text, on ? 'layer-on' : 'layer-off', () => {
        REPORT_SECTION = key;
        render();
    });
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    return btn;
}

// Days recorded with more sites than the cap allows. They are NOT trimmed - those
// entries are days somebody worked, and deleting data to satisfy a rule written
// afterwards is the one thing a record of pay must not do. They are named here, on the
// screen where the pay is worked out, because a day recorded at three sites means
// somebody's day is written down wrong and the invoice is built from it.
function renderOverCapNotice(root) {
    const over = daysOverCap(State.schedule).filter(item => item.layer === 'actual');
    if (over.length === 0) return;

    const notice = el('p', 'hint hint-warn');
    const days = over.slice(0, 3).map(item => {
        const worker = State.worker(item.workerId);
        const parsed = parseLocalDate(item.date);
        return `${worker ? worker.name : item.workerId} ב-${formatFullDate(parsed)}`;
    }).join(', ');

    notice.textContent = `⚠️ ${over.length} ימים נרשמו עם יותר מ-${MAX_ENTRIES_PER_DAY} ` +
        `אתרים (${days}${over.length > 3 ? '…' : ''}). הרישום נשמר כפי שהוא - ` +
        'בדוק אותו לפני שמוציאים חשבון.';
    root.appendChild(notice);
}

// One decision, made with one thumb: which period. The two raw date inputs exist for
// the odd question, folded away behind their own chip - eight controls in a row was a
// cockpit, and the person flying it is sixty-two.
function renderRangePicker() {
    const wrap = el('div', 'range-wrap');

    const chips = el('div', 'range-chips');
    chips.appendChild(presetChip('fortnight', 'תקופת החשבון', () => {
        const range = defaultPayrollRange();
        REPORT_RANGE.from = range.from;
        REPORT_RANGE.to = range.to;
    }));
    chips.appendChild(presetChip('month', 'החודש', () => setMonthRange(0)));
    // Invoicing is usually done for the month just gone, from a few days into the next
    // one - so reaching it should not mean typing two dates.
    chips.appendChild(presetChip('lastmonth', 'חודש שעבר', () => setMonthRange(-1)));
    chips.appendChild(presetChip('custom', 'תאריכים אחרים', () => {}));
    wrap.appendChild(chips);

    if (REPORT_PRESET === 'custom') {
        const bar = el('div', 'range-bar');
        bar.appendChild(el('label', null, 'מתאריך'));
        bar.appendChild(dateInput('from'));
        bar.appendChild(el('label', null, 'עד'));
        bar.appendChild(dateInput('to'));
        wrap.appendChild(bar);

        // Said out loud, because the numbers underneath look exactly like the ones under
        // "תקופת החשבון" and they do not mean the same thing. The account periods run
        // Friday to Thursday and are what the crew is actually paid on; a window typed by
        // hand is a way of LOOKING at the same days - it settles nothing, it changes no
        // account, and two hand-picked windows can count the same day twice.
        wrap.appendChild(el('p', 'hint',
            'טווח שנבחר ידנית - לצפייה בלבד. הוא לא סוגר חשבון ולא משנה את תקופות ' +
            'החשבון הקבועות, וטווחים שנבחרים ידנית עלולים לחפוף.'));
    }

    const actions = el('div', 'range-actions');
    // One left-to-right run (dateRange, js/ui/dom.js): as two runs in this RTL line the
    // later date landed on the left and the range read backwards.
    actions.appendChild(el('strong', 'range-current',
        dateRange(formatFullDate(parseLocalDate(REPORT_RANGE.from)), formatFullDate(parseLocalDate(REPORT_RANGE.to)))));
    // Not window.print() bare - see renderWeekHeader in js/ui/week.js and
    // js/ui/printout.js: where the print sheet does not open, the sheet on screen is
    // offered as a picture instead, and the picture has its own button beside it.
    actions.appendChild(button('🖨️ הדפסה', 'btn-success', () => printWithFallback('report')));
    actions.appendChild(button('🖼️ שיתוף כתמונה', 'btn-secondary', () => sharePrintout('report')));
    // The button says what will come out of it. With one client's site chosen the file
    // is that client's billing sheet and nothing else (see reportSheets), and a button
    // still reading "יצוא" would promise the usual workbook and quietly hand over less.
    const client = scopedExportPlace();
    actions.appendChild(button(
        client ? `📊 יצוא חיוב - ${isolate(client.name)}` : '📊 יצוא',
        'btn-secondary', exportReports));
    wrap.appendChild(actions);

    return wrap;
}

function presetChip(key, label, apply) {
    const on = REPORT_PRESET === key;
    const chip = button(label, on ? 'chip-on' : 'chip-off', () => {
        REPORT_PRESET = key;
        apply();
        render();
    });
    chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    return chip;
}

function setMonthRange(offset) {
    const now = parseLocalDate(todayStr());
    const month = now.getMonth() + offset;
    REPORT_RANGE.from = toLocalDateStr(new Date(now.getFullYear(), month, 1, 12));
    // Day 0 of the next month is the last day of this one, and it handles December and
    // leap years without a table of month lengths.
    REPORT_RANGE.to = toLocalDateStr(new Date(now.getFullYear(), month + 1, 0, 12));
    render();
}

function dateInput(key) {
    const input = document.createElement('input');
    input.type = 'date';
    input.value = REPORT_RANGE[key];
    input.setAttribute('aria-label', key === 'from' ? 'מתאריך' : 'עד תאריך');

    // The browser's own guard rail, and not the only one: on some phones a date can still
    // be typed straight into the field, so the handler refuses an inverted range too.
    if (key === 'from' && REPORT_RANGE.to) input.max = REPORT_RANGE.to;
    if (key === 'to' && REPORT_RANGE.from) input.min = REPORT_RANGE.from;

    input.addEventListener('change', () => {
        if (!input.value) return;

        const from = key === 'from' ? input.value : REPORT_RANGE.from;
        const to = key === 'to' ? input.value : REPORT_RANGE.to;

        // A period that ends before it starts contains nothing, and every report under it
        // then reads "אין רישומים בטווח הזה" - which is the same sentence the app shows
        // for a fortnight nobody worked. One of those is a typo and the other is a fact
        // about the crew, and they must not look alike on payday.
        //
        // Refused rather than quietly swapped: a swap answers a question nobody asked,
        // and the totals underneath it look like the answer to the one that was typed.
        if (from > to) {
            input.value = REPORT_RANGE[key];
            if (typeof askTell === 'function') {
                askTell({
                    title: 'הטווח הפוך',
                    message: 'תאריך ההתחלה מאוחר מתאריך הסיום, ולכן הוא לא שונה. ' +
                        'בחר קודם את תאריך ההתחלה ואז את הסיום.'
                });
            }
            return;
        }

        REPORT_RANGE[key] = input.value;
        render();
    });
    return input;
}

// Which period these totals cover, on screen as well as on paper. It used to be printed
// only, and on a phone that made this screen unreadable in the one way that matters: a
// day recorded outside the range is simply not in the count, and with no dates on screen
// there was nothing to explain why. A page of numbers with no period on it is unusable a
// month later too - nobody can tell which fortnight it was.
function reportPeriod() {
    const from = parseLocalDate(REPORT_RANGE.from);
    const to = parseLocalDate(REPORT_RANGE.to);
    const days = Math.round((to - from) / 86400000) + 1;
    // A whole account period is named as the thing the owner actually runs - שישי–חמישי
    // - and any other window is measured in days instead, so a short one is obvious.
    const length = wholeAccountRange(REPORT_RANGE.from, REPORT_RANGE.to)
        ? 'שישי–חמישי'
        : `${days} ימים`;
    // The range is one left-to-right run (dateRange, js/ui/dom.js) and the length after
    // it is Hebrew, so a Hebrew reader meets the range first and its length to the left
    // of it; inside the run the earlier date is on the left, where an eye that reads a
    // date left to right expects it. This text is also the picture's subtitle and the
    // paper's period line.
    return el('div', 'report-period',
        `${dateRange(formatFullDate(from), formatFullDate(to))} · ${length}`);
}

// Exactly one account, whole: it starts on an account's opening Friday and runs its
// fourteen days. Anything else - a month, a hand-picked window, half an account - is a
// way of looking at days, not a period the crew is paid on.
function wholeAccountRange(fromStr, toStr) {
    const from = parseLocalDate(fromStr);
    if (!from || toLocalDateStr(accountStart(from)) !== fromStr) return false;
    const to = new Date(from);
    to.setDate(from.getDate() + 13);
    return toLocalDateStr(to) === toStr;
}

function payrollRows() {
    // Advances keep a row alive on their own: a man who took 500 on the 1st and then
    // worked nothing would otherwise vanish from the sheet - and with him the 500,
    // which next period is out of range too and never deducted anywhere.
    //
    // A vehicle does the same, and for the same reason. Its owner is paid for the days it
    // went out whether or not he was on a site, so a man with three vans and a fortnight
    // off is owed real money and had no row to be owed it on.
    // What an unsettled advance did to this account, worked out ONCE and carried on the
    // row. Every surface below reads it from here rather than asking again: the walk goes
    // back over every account this man has ever had, and two callers doing that separately
    // is both slow and a second place for the answer to differ.
    //
    // ONLY OVER A WHOLE ACCOUNT, which is the condition the arithmetic needs and the one
    // this first got wrong. An account is a Friday and the thirteen days after it; the
    // report range is whatever somebody picked, and "החודש" is a month. Handed a month,
    // the walk stepped back through fourteen-day accounts from the first advance and then
    // counted an advance INSIDE the displayed range as carried in from before it - the
    // same 500 deducted twice, on a pay sheet. A range that is not an account gets no
    // carry and the arithmetic this build has always done; a month is not a payday, and
    // the carry is a statement about what one payday left owed to the next.
    //
    // With the gate off, `carry` is absent everywhere and every reader falls through the
    // same way - see moneyOf.
    // carryReportingEnabled, not advanceCarryEnabled: the flag says what this BUILD
    // does, and the question here is whether this RECORD may be read the new way yet.
    // See js/model/ledger.js - a sheet that restates a printed fortnight before anybody
    // approved the migration is the same fault as a writer that does, on the surface
    // somebody is actually paid from.
    const carrying = carryReportingEnabled(State.schedule)
        && wholeAccountRange(REPORT_RANGE.from, REPORT_RANGE.to);

    return payrollReport(State.schedule, REPORT_RANGE.from, REPORT_RANGE.to)
        // The carry is worked out BEFORE the filter, because it is one of the things that
        // keeps a row alive - see the next comment.
        .map(row => (carrying
            ? Object.assign({}, row, {
                carry: advanceAccount(State.schedule, row.workerId,
                    REPORT_RANGE.from, REPORT_RANGE.to)
            })
            : row))
        .filter(row => row.attendanceDays > 0 || row.absent > 0 || row.advances > 0
            // A DEBT KEEPS A ROW ALIVE TOO, for the same reason an advance does, one line
            // up: a man who owes a carried balance and worked no days this fortnight had
            // no row to owe it on, so he dropped off the sheet and the debt went with
            // him - out of the total, off the paper, and off the screen that is supposed
            // to say what is still outstanding. Found by a check that asked the open
            // period for his opening balance and got back undefined.
            || (row.carry && (row.carry.carriedIn > 0 || row.carry.carriedForward > 0))
            || (vehiclesEnabled() && row.vehicleDays > 0));
}

function invoiceRows() {
    return invoiceReport(State.schedule, REPORT_RANGE.from, REPORT_RANGE.to)
        .filter(row => row.workerDays > 0);
}

// One row per worker, with the arithmetic already done. The manager was working this out
// on paper from the day counts; the rates are in the app now, so it is done here.
function renderPayrollTable() {
    const section = el('section', 'report report-payroll');
    section.appendChild(el('h2', null, 'שכר - לפי עובד'));
    section.appendChild(reportPeriod());

    const rows = payrollRows();
    if (rows.length === 0) {
        section.appendChild(emptyHint('אין רישומים בטווח הזה.'));
        return section;
    }

    const anyRate = rows.some(row => row.dailyRate > 0);

    // A column is dropped only when it is zero for EVERY worker in the period - never
    // for one worker at a time. On a phone each row becomes a card, and a card that
    // silently omits "כפול" because this person happened to have none looks exactly
    // like a card where the app never recorded any: the same question was asked of the
    // pay sheet twice. Dropping the whole concept when nobody used it keeps every card
    // the same shape, so a row that is missing means the fortnight had none of it.
    //
    // Two day columns, not one. "ימי עבודה" on its own was being read as the number the
    // money was worked out from, and it is not: four dates with two of them double is
    // six days of pay. Both are named, so the total beside them can be checked.
    //
    // "רגיל" is gone with it. It was the count of the days that were not double, which
    // is now the difference between the two columns either side of it - a third number
    // saying the same thing is a third number to reconcile.
    const columns = [
        { header: 'ימי נוכחות', value: row => row.attendanceDays, always: true },
        { header: 'ימי שכר', value: row => row.payUnits, always: true },
        { header: 'מתוכם כפולים', value: row => row.doubleDays },
        { header: 'שעות נוספות', value: row => row.extraHours },
        { header: 'נעדר', value: row => row.absent }
    ].filter(column => column.always || rows.some(row => column.value(row) > 0));

    // The advance columns appear only once somebody has actually taken one, so a run of
    // accounts with no advances is not carrying two empty columns across every card.
    // NOT gated on anyRate: cash handed over is real whether or not rates were entered,
    // and hiding it because the rates are blank made 500 shekels disappear in silence.
    // Any advance at all, not just a payable one. A record can hold an amount this build
    // refuses to net - a negative one, which would INCREASE what somebody is owed - and
    // hiding the column then made that money invisible on the one screen where it is
    // read. It is shown, and it does not move the net: see moneyOf.
    const anyAdvance = rows.some(row => Number(row.advances) !== 0);

    // Vehicles get their own two columns, on the same rule as the advances: they appear
    // once somebody owns one that went out. Two columns and not one, because the days and
    // the money answer different questions - and separate from the day rate, because a
    // vehicle is paid for going out and the man's day is paid for his working. Adding
    // them together is how five days at 450 comes to 3750 and explains nothing.
    const anyVehicle = vehiclesEnabled() && rows.some(row => row.vehicleDays > 0);

    const headers = ['עובד'].concat(columns.map(column => column.header));
    if (anyVehicle) headers.push('ימי רכב', 'שכר רכב');
    if (anyRate) headers.push('שכר יומי', 'נצבר');
    // THE COLUMN IS NAMED AFTER WHAT IS IN IT. With the account being read, this cell is
    // the DEDUCTION - what came off this fortnight - which for an advance larger than the
    // wage is not the advance, and for a man in review is zero while he holds one. See
    // moneyOf. With the account shut it is the advances, and then מקדמות is the truth.
    if (anyAdvance) headers.push(deductionColumnName());
    if (anyRate) headers.push('לתשלום');

    const table = buildTable(headers, rows.map(row => {
        const cells = [row.name].concat(columns.map(column => column.value(row)));
        if (anyVehicle) cells.push(row.vehicleDays || 0, agora(row.vehicleAmount || 0));
        if (anyRate) {
            cells.push(row.dailyRate);
            // null, not 0: a worker whose rate was never entered owes an unknown amount,
            // which is a different statement from owing nothing.
            const money = moneyOf(row);
            cells.push(money.gross === null ? '—'
                : moneyText(money.gross) + (row.hoursUnpriced ? ' *' : ''));
            // THE DEDUCTION, which is what the net is computed from and what the exported
            // file has always printed here.
            //
            // This cell showed `advances` - the money handed over - beside a net computed
            // from `netted`, the part of it the wage could cover. For an advance of 5,000
            // against a fortnight of 3,050 the row read 3050, -5000, 0, which does not
            // reconcile, and the band under it totalled -1,950 as לתשלום: a negative wage
            // on the sheet a man is paid from, for a fortnight in which he was owed
            // nothing and paid nothing. The workbook and the CSV printed -3,050 on the
            // same row of the same fortnight. Two surfaces, one record, two answers.
            //
            // The remainder is not lost by this: the hint under the sheet names it and
            // says whose it is, which is the same sentence the file carries in its note.
            if (anyAdvance) cells.push(money.netted === 0 ? 0 : minusAmount(-money.netted));
            // The * follows the money onto the number actually paid.
            cells.push(money.net === null ? '—'
                : bidiAmount(moneyText(money.net)) + (row.hoursUnpriced ? ' *' : ''));
        } else if (anyAdvance) {
            const money = moneyOf(row);
            cells.push(money.netted === 0 ? 0 : minusAmount(-money.netted));
        }
        return cells;
    }));

    // The three money columns must reconcile: נצבר − מקדמות = לתשלום, on the same rows.
    // Summing per-row nets instead used to let an unpriced worker's advance into one
    // column and not the other, and the footer contradicted itself.
    // Summed off the SAME number each row printed - see moneyOf. Summing row.advances
    // while the rows printed the deduction is how a band comes to contradict every line
    // above it.
    const totals = rows.reduce((sum, row) => ({
        amount: sum.amount + (row.amount || 0),
        advances: sum.advances - moneyOf(row).netted
    }), { amount: 0, advances: 0 });

    // The band names what it totals and over how many people. Thirty rows of cards end
    // in one number, and "סה״כ" alone does not say whether that number is the gross,
    // the net, or the count of anything - nor that all thirty are inside it.
    // Counting only the men whose money is actually inside the number: a worker with
    // no daily rate contributes nothing to the total, and a denominator that includes
    // him asserts a coverage the warning four lines down denies.
    const paid = rows.filter(row => row.amount !== null).length;
    const footer = [anyRate
        ? `סה״כ לתשלום · ${countedIn(paid, 'עובד אחד', 'עובדים')}`
        : 'סה״כ'].concat(columns.map(column =>
        rows.reduce((sum, row) => sum + column.value(row), 0)));
    // The band under the column adds up the same way each row did - see moneyOf.
    const bandGross = agora(totals.amount);
    const bandTaken = agora(totals.advances);
    if (anyRate) footer.push('', moneyText(bandGross));
    if (anyAdvance) footer.push(bandTaken === 0 ? 0 : minusAmount(bandTaken));
    if (anyRate) footer.push(bidiAmount(moneyText(agora(bandGross - bandTaken))));
    table.appendChild(totalRow(footer, headers));

    // The net is the last cell of every row - the column order is the ledger's - and it
    // is also the number the whole sheet exists to produce. The class lets the phone
    // stylesheet lead each card with it; the table itself, the data-labels and the
    // printed order stay exactly as they are.
    if (anyRate) {
        table.querySelectorAll('tbody tr').forEach(tr =>
            tr.lastElementChild.classList.add('cell-net'));
    }

    // The name opens that worker's days. On payday somebody asks why the number is what
    // it is, and the answer has to be reachable from the number itself.
    table.querySelectorAll('tbody tr').forEach((tr, index) => {
        const cell = tr.firstChild;
        if (!cell) return;
        clear(cell);
        cell.appendChild(button(rows[index].name, 'link-cell',
            () => openWorkerDays(rows[index].workerId),
            `פירוט הימים של ${rows[index].name}`));
    });

    section.appendChild(scrollWrap(table));

    if (!anyRate) {
        section.appendChild(el('p', 'hint',
            'הוסף שכר יומי לעובדים במסך "עובדים ואתרים" כדי שהדוח יחשב גם את הסכום.'));
    } else {
        section.appendChild(el('p', 'hint',
            'ימי נוכחות = כמה תאריכים העובד היה באתר. ימי שכר = כמה ימים משולמים, ' +
            'כשיום כפול נספר כשניים. שני אתרים באותו יום הם יום נוכחות אחד, ' +
            'ויום שכר אחד - או שניים אם היום כפול. שעות נוספות מחושבות בנפרד.'));
    }

    if (rows.some(row => row.hoursUnpriced)) {
        section.appendChild(el('p', 'hint hint-warn',
            '* שעות נוספות בלי שכר שעה - לא נכללו בסכום.'));
    }

    // WHAT THE מקדמות COLUMN NO LONGER SHOWS, said in shekels and named to a person.
    //
    // The column is the deduction, so an advance larger than the fortnight's wage is
    // partly not in it, and the part that is not in it is still owed. Without this the
    // sheet is arithmetically honest and silent about a real debt - and this fortnight's
    // sheet is the last document that mentions the advance at all. The exported file says
    // the same thing in its note column; this is the screen's and the paper's copy of it.
    const carrying = rows.filter(row => row.carry && row.carry.gross !== null
        && row.carry.carriedOut > 0);
    if (carrying.length > 0) {
        section.appendChild(el('p', 'hint hint-money',
            'מקדמות שלא נוכו במלואן בתקופה הזו ועוברות לחשבון הבא: '
            + carrying.map(row => `${isolate(row.name)} ${moneyText(row.carry.carriedOut)} ₪`)
                .join(' · ') + '.'));
    }

    // And the corrections, in their own words. A correction nets against the deduction
    // above, so its shekels are inside the column with nothing naming them - and a
    // correction that goes unnamed is the one a person cannot check.
    const corrected = rows.filter(row => row.carry && row.carry.reversed > 0);
    if (corrected.length > 0) {
        section.appendChild(el('p', 'hint hint-money',
            `${LEDGER_KIND_LABELS.reversed} בתקופה הזו: `
            + corrected.map(row => `${isolate(row.name)} ${moneyText(row.carry.reversed)} ₪`)
                .join(' · ') + '.'));
    }

    // A day is paid at the rate it was RECORDED at, so after a raise mid-period the total
    // cannot be checked by multiplying the days by the rate in the column beside it. Said
    // plainly, because a sheet whose arithmetic does not come out reads as a mistake -
    // and the alternative, quietly repaying old days at the new rate, is the mistake.
    const mixed = rows.filter(row => row.mixedRates);
    if (mixed.length > 0) {
        section.appendChild(el('p', 'hint',
            `בתקופה הזו השתנה השכר היומי של ${mixed.map(row => isolate(row.name)).join(', ')}. ` +
            'כל יום מחושב לפי השכר שהיה בזמן הרישום, ולכן הסכום אינו מספר הימים כפול ' +
            'השכר שמופיע כאן.'));
    }

    // A "—" in the pay column is easy to read past when it is one line among thirteen,
    // and the total at the foot is then quietly short by a whole worker's fortnight. The
    // people it is missing for are named, once, under the sheet.
    const unpriced = rows.filter(row => row.amount === null);
    if (unpriced.length > 0) {
        section.appendChild(el('p', 'hint hint-warn',
            `⚠️ ${unpriced.length} עובדים בלי שכר יומי, ולכן הסכום למטה חסר אותם: ` +
            `${unpriced.map(row => isolate(row.name)).join(', ')}. הוסף להם שכר במסך "עובדים ואתרים".`));
    }

    // Under every pay sheet, not only in the fortnights where it happened to matter:
    // the two rules every number above is computed by. The mixed-rates note further up
    // stays as the extra explanation for the sheets where a rate actually changed.
    section.appendChild(el('p', 'hint',
        'יום כפול נספר כשני ימי שכר. כל יום מחושב לפי השכר שהיה בזמן הרישום.'));
    return section;
}

// The client is invoiced day by day, so this is a grid: a row per date, a column per
// site. It is also what gets printed, which is why it is a plain table and not cards.
//
// One site can be singled out, because a printed invoice usually goes to ONE client and
// every other site on the page is somebody else's business - a page listing four sites is
// not a document that can be handed over as it is.
function renderInvoiceTable() {
    const section = el('section', 'report report-invoice');

    const all = invoiceByDate(State.schedule, REPORT_RANGE.from, REPORT_RANGE.to);
    const chosen = all.places.find(place => place.placeId === INVOICE_PLACE) || null;
    const places = chosen ? [chosen] : all.places;

    section.appendChild(el('h2', null,
        chosen ? `חיוב - ${chosen.name}` : 'חיוב - לפי אתר, יום ביום'));
    section.appendChild(reportPeriod());

    if (all.places.length === 0) {
        section.appendChild(emptyHint('אין רישומים בטווח הזה.'));
        return section;
    }

    section.appendChild(renderInvoicePicker(all.places));

    // The screen's answer: one row per site. The question asked at a glance here is
    // "how much of the period was each site", and a date-by-site grid answers it only
    // after arithmetic. The grid is still built below, whole, because it is what the
    // client is handed on paper - the bars are screen-only and the grid print-only,
    // and both read the same workerDays.
    section.appendChild(renderInvoiceBars(places));

    // Only the dates this site actually worked. A client's page with a run of empty rows
    // for days their site was closed reads as a mistake.
    const dates = chosen
        ? chosen.days.map(day => day.date)
        : all.dates;

    const headers = ['תאריך'].concat(places.map(place => place.name)).concat(['סה״כ']);
    // Weekday and dd/mm, no year: the person asked for it off a screenshot of this
    // column. The year is on the period line above the grid, once, and repeated down
    // every row it was the widest thing in the narrowest cell, saying nothing the line
    // above had not said. This grid is the paper too (the print stylesheet shows the
    // same DOM), so the paper follows; the exported sheets do NOT - a file is read out
    // of context and keeps its full date (detailRows, invoiceSheetRows).
    const body = dates.map(date => {
        const parsed = parseLocalDate(date);
        const counts = places.map(place => all.countAt(place.placeId, date));
        const dayTotal = counts.reduce((sum, n) => sum + n, 0);
        return [`${HEBREW_DAY_NAMES[parsed.getDay()]} ${formatShortDate(parsed)}`]
            .concat(counts).concat([dayTotal]);
    });

    const table = buildTable(headers, body);
    // "ימי עובד־אתר", not "סה"כ". The column adds up how many men were on that site on
    // how many days - four men for three days is twelve - and a bare total under a
    // column of dates gets read as "the site worked twelve days", which is the number a
    // client would be billed on. They are different numbers and only one of them is here.
    table.appendChild(totalRow(
        ['סה״כ ימי עובד־אתר'].concat(places.map(place => place.workerDays))
            .concat([places.reduce((sum, place) => sum + place.workerDays, 0)]),
        headers
    ));

    // Kept in the DOM and kept whole, hidden from the screen only: the print stylesheet
    // still gets the full date-by-site grid, and the tests that pin the paper pin THIS.
    const grid = scrollWrap(table);
    grid.classList.add('invoice-grid');
    section.appendChild(grid);
    section.appendChild(el('p', 'hint',
        'המספר ליד כל אתר הוא ימי עובד־אתר: עובד אחד ביום אחד באתר. הוא אינו מספר ' +
        'הימים שהאתר עבד. בהדפסה יוצא הפירוט המלא - שורה לכל תאריך, עמודה לכל אתר.'));
    // The counting rule, spelled out: this number lives beside two others that sound
    // like it, and the person about to bill from it must not expect them to reconcile.
    section.appendChild(el('p', 'hint',
        'עובד בשני אתרים נספר פעם אחת בכל אתר; ימי עובד־אתר אינם ימי נוכחות ואינם ' +
        'ימי שכר — אין לצפות שהסכומים יתאימו.'));
    return section;
}

// The on-screen shape of the site report: the site's own colour, its name, its
// ימי עובד־אתר, and a bar proportional to the busiest site so the period's spread is
// visible without reading a grid. Counts only - the screen version of this page names
// no worker, exactly like the paper one. Nothing here is interactive; the picker above
// narrows it and the total band closes it.
function renderInvoiceBars(places) {
    const wrap = el('div', 'invoice-bars');
    wrap.appendChild(el('div', 'invoice-bars-head', 'ימי עובד־אתר לפי אתר'));

    const most = places.reduce((max, place) => Math.max(max, place.workerDays), 0);
    places.forEach(place => {
        const row = el('div', 'invoice-bar-row');
        row.appendChild(paintSite(el('span', 'invoice-swatch'), place.placeId));

        const name = el('span', 'invoice-bar-name');
        appendSiteName(name, place.placeId, place.name);
        row.appendChild(name);

        const track = el('span', 'invoice-bar-track');
        const fill = el('span', 'invoice-bar-fill');
        fill.style.width = `${most > 0 ? Math.round((place.workerDays / most) * 100) : 0}%`;
        fill.style.background = siteColorVar(place.placeId);
        track.appendChild(fill);
        row.appendChild(track);

        row.appendChild(el('span', 'invoice-bar-count', String(place.workerDays)));
        wrap.appendChild(row);
    });

    const total = el('div', 'invoice-bars-total');
    total.appendChild(el('span', null, 'סה״כ ימי עובד־אתר'));
    total.appendChild(el('strong', null,
        String(places.reduce((sum, place) => sum + place.workerDays, 0))));
    wrap.appendChild(total);
    return wrap;
}

// The chips are not printed - by then the choice has been made and the heading says it.
function renderInvoicePicker(places) {
    const bar = el('div', 'invoice-picker');
    bar.appendChild(el('span', 'invoice-picker-label', 'להדפסה ללקוח:'));

    const chip = (label, placeId) => {
        const on = INVOICE_PLACE === placeId;
        const node = button(label, on ? 'chip-on' : 'chip-off', () => {
            INVOICE_PLACE = placeId;
            render();
        });
        node.setAttribute('aria-pressed', on ? 'true' : 'false');
        if (placeId && !on) {
            node.style.borderColor = siteColorVar(placeId);
            node.style.color = siteColorVar(placeId);
        } else if (placeId) {
            paintSite(node, placeId);
        }
        return node;
    };

    bar.appendChild(chip('כל האתרים', null));
    places.forEach(place => bar.appendChild(chip(place.name, place.placeId)));
    return bar;
}

// ---------------------------------------------------------------- one worker's days

// The pay sheet says a worker is owed 4,150. This says which days that is: the sites, the
// doubled days, the hours, and what each day came to. It is read out to the person asking,
// so it runs the same arithmetic as the total rather than re-deriving it a second way.
function openWorkerDays(workerId) {
    const worker = State.worker(workerId);
    if (!worker) return;

    const days = workerDaysReport(State.schedule, worker, REPORT_RANGE.from, REPORT_RANGE.to);
    const advances = advancesFor(State.schedule, worker.id, REPORT_RANGE.from, REPORT_RANGE.to);

    document.getElementById('workerDaysTitle').textContent = worker.name;
    document.getElementById('workerDaysMeta').textContent =
        `${formatFullDate(parseLocalDate(REPORT_RANGE.from))} - ${formatFullDate(parseLocalDate(REPORT_RANGE.to))}`;

    const body = document.getElementById('workerDaysBody');
    clear(body);

    if (days.length === 0 && advances.length === 0) {
        body.appendChild(emptyHint('אין רישומים בטווח הזה.'));
    } else {
        const strip = renderAttendanceChips(days);
        if (strip) body.appendChild(strip);
        days.forEach(day => body.appendChild(renderWorkerDayRow(day, worker)));
        body.appendChild(renderWorkerDaysTotal(days, worker));
        // Named before the rows begin: money that went the other way is its own block,
        // not three more days at the end of the list.
        if (advances.length > 0) {
            body.appendChild(el('div', 'wday-advances-head', 'מקדמות בתקופה'));
        }
        advances.forEach(item => body.appendChild(renderAdvanceRow(item)));
        if (advances.length > 0) {
            body.appendChild(renderNetRow(days, worker, advances));
            // The sentence that used to sit here described what WOULD happen when the
            // ledger opened: that the מקדמות row "becomes" a נוכה מהשכר movement. On this
            // build it has happened - the column is headed נוכה מהשכר and the row reports
            // the deduction - so the hint was telling a person to expect a change they
            // were already looking at, and naming a build number to do it.
        }
    }

    // Closing the account is a deliberate act with its own button, and it is the ONLY
    // thing in this app that writes a closure - see renderPeriodClosure.
    const closure = renderPeriodClosure(worker);
    if (closure) body.appendChild(closure);

    // After the period's advances: the whole record of them, folded shut. Read-only by
    // construction - see renderWorkerLedger.
    const ledger = renderWorkerLedger(worker.id);
    if (ledger) body.appendChild(ledger);

    body.appendChild(renderAdvanceAdd(worker));
    const modal = document.getElementById('workerDaysModal');
    modal.style.display = 'flex';
    // Read from the top: the name, the fortnight, the chips that say WHICH days. The
    // dialog is entered at its heading (modal.js) so nothing scrolls it on the way in,
    // and the scroll position is set rather than assumed - whatever the last look left.
    // (The Node harness's elements have no children to find: guarded, not assumed.)
    const content = modal.querySelector('.modal-content');
    if (content) content.scrollTop = 0;
}

// SEALING THE ACCOUNT, and the only place in this app that does it.
//
// recordPeriodClosed existed for a release with nothing calling it, which meant every
// figure it was written to freeze was still being recomputed on every read - correct
// arithmetic, and correct only for as long as the entries never moved. They move: a phone
// offline for three weeks, an import and a restore all deliver entries dated inside a
// fortnight that was printed and paid, and the closing balance shifts underneath a
// payslip somebody was handed.
//
// It is a BUTTON and not a side effect. Printing a sheet, opening a preview, exporting a
// workbook and sending a statement all read this account and none of them may close it:
// a person looking at a number is not the same as a person deciding it is final, and a
// closure cannot be taken back. tests/repayment.test.mjs holds the shipped source to
// that - this identifier appears in exactly one place.
//
// Behind both gates, like every other writer here: a closure the other two phones cannot
// read is money off a wage they will go on deducting.
function renderPeriodClosure(worker) {
    if (typeof planPeriodClosure !== 'function') return null;
    if (!financialWritingEnabled(State.schedule)) return null;
    if (!wholeAccountRange(REPORT_RANGE.from, REPORT_RANGE.to)) return null;

    // Planned at the moment this screen is drawn, and re-planned at the moment the button
    // is pressed - the clock reason below is a question about NOW, not about the record.
    const plan = planPeriodClosure(State.schedule, worker.id,
        REPORT_RANGE.from, REPORT_RANGE.to, new Date().toISOString());

    const box = el('div', 'period-closure');
    if (plan.reasons.indexOf('closed') !== -1) {
        // Said in the ledger's own words, and said before anything else on this block.
        box.appendChild(el('p', 'hint', `${LEDGER_KIND_LABELS.closed} ולא ישתנה.`));
        return box;
    }
    if (plan.reasons.indexOf('overpaid') !== -1) {
        box.appendChild(el('p', 'hint hint-warn',
            'יש עודף בהחזרי המקדמות של העובד הזה. אי אפשר לסגור חשבון שלא מסתדר - '
            + 'תקן קודם, ואז סגור.'));
        return box;
    }
    // THE PHONE'S OWN CLOCK, said out loud. A closure written from here would be sound
    // arithmetic and wrong about the world: a movement recorded before it, on a phone
    // whose clock is ahead of this one, would be pushed into the next fortnight - on
    // somebody's payslip, silently. The button is not offered; the sentence is.
    if (plan.reasons.indexOf('clock') !== -1) {
        box.appendChild(el('p', 'hint hint-warn', CLOSURE_CLOCK_BEHIND));
        return box;
    }
    if (!plan.canClose) return null;

    box.appendChild(el('p', 'hint',
        `סגירת החשבון תרשום ${moneyText(plan.deducted)} ₪ כ"${LEDGER_KIND_LABELS.deducted}" `
        + `ותשאיר חוב פתוח ${moneyText(plan.carriedForward)} ₪. `
        + 'אחרי הסגירה המספרים האלה לא ישתנו.'));
    box.appendChild(button('סגור את החשבון', 'btn-secondary',
        () => closeAccountFor(worker, plan), 'סגירת חשבון התקופה'));
    return box;
}

async function closeAccountFor(worker, plan) {
    const ok = await askConfirm({
        title: 'לסגור את החשבון?',
        message: `${isolate(worker.name)}: ${moneyText(plan.deducted)} ₪ ינוכו מהשכר `
            + `ויישאר חוב פתוח ${moneyText(plan.carriedForward)} ₪. `
            + 'סגירה היא סופית - אי אפשר לבטל אותה, רק לרשום תיקון לצידה.',
        ok: 'סגור'
    });
    if (!ok) return;

    // Re-planned against the record as it is NOW, not against the plan this screen was
    // drawn from: the other phone may have closed it while this dialog was open. An empty
    // list is the right answer to that, not an error - the account is closed either way.
    //
    // ONE MOMENT for the plan and the write, because the clock reason is a question about
    // that moment: planning at one `at` and writing at another asks two questions.
    const at = new Date().toISOString();
    const changes = closePeriodChanges(State.schedule, worker.id,
        REPORT_RANGE.from, REPORT_RANGE.to, at, syncDeviceId());
    if (changes.length === 0) {
        // AND SAID FOR THE RIGHT REASON. Nothing written now has two causes - it was
        // already closed, or this phone's clock is behind something on the record - and
        // «נסגר כבר» told a person the fortnight was done when it was not. The plan is
        // asked, at the same moment, which one it was.
        const why = planPeriodClosure(State.schedule, worker.id,
            REPORT_RANGE.from, REPORT_RANGE.to, at);
        if (typeof askTell === 'function') {
            await askTell(why.reasons.indexOf('clock') !== -1
                ? CLOSURE_CLOCK_BEHIND
                : `${LEDGER_KIND_LABELS.closed} כבר. לא נרשם דבר נוסף.`);
        }
        openWorkerDays(worker.id);
        return;
    }
    if (!State.commitMany(changes)) return;
    openWorkerDays(worker.id);
}

// The attendance dates in one line above the day rows: a chip per date the man was on a
// site, the traditional one-letter weekday mark and the short date, ×2 on a doubled day.
// The count on the pay sheet says FOUR; this is which four, at a glance, before the rows
// spell out where and for how much. Nothing here is a button - the rows below carry the
// detail - so the chips owe no thumb size, only legibility.
function renderAttendanceChips(days) {
    const worked = days.filter(day => !day.absent);
    if (worked.length === 0) return null;

    const strip = el('div', 'wday-chips');
    worked.forEach(day => {
        const parsed = parseLocalDate(day.date);
        const chip = el('span', 'wday-chip',
            `${HEBREW_DAY_LETTERS[parsed.getDay()]} ${formatShortDate(parsed)}`);
        if (day.doubled) chip.appendChild(el('span', 'wday-chip-x2', '×2'));
        strip.appendChild(chip);
    });
    return strip;
}

// How the money moved, when that was recorded. An advance from before the field existed
// is still a plain מקדמה - the record does not guess.
const ADVANCE_METHOD_LABELS = { cash: 'מקדמה במזומן', transfer: 'מקדמה בהעברה' };

// One reading of the record, for the screen and for the message the worker is sent - a
// word this build does not draw is not a word it invents a label for.
function advanceMethodLabel(method) {
    return Object.prototype.hasOwnProperty.call(ADVANCE_METHOD_LABELS, method)
        ? ADVANCE_METHOD_LABELS[method] : 'מקדמה';
}

// Cash handed over before settlement day. Recorded here, next to the days it will be
// deducted from, because the question it answers - "how much is left" - is asked on this
// screen and nowhere else.
function renderAdvanceRow(item) {
    const row = el('div', 'wday wday-advance');
    const parsed = parseLocalDate(item.date);

    const when = el('div', 'wday-date');
    when.appendChild(el('strong', null, advanceMethodLabel(item.method)));
    when.appendChild(el('span', null, formatFullDate(parsed)));
    row.appendChild(when);

    const what = el('div', 'wday-what');
    if (item.note) what.appendChild(el('span', 'wday-note', item.note));

    // WHAT IS LEFT ON IT, and the way to settle some of that in cash.
    //
    // BEHIND BOTH GATES, and it has to be both.
    //
    // The writer gate, because a repayment IS a ledger entry - schedule.advances holds a
    // single number per advance and no room for a second event about it - so recording
    // one with that gate shut writes something the other two phones cannot read: money
    // handed back and nowhere on their pay sheets, which is the failure the gate exists
    // to prevent, pointed the other way.
    //
    // And the CARRY gate, which is the half that was missing. moneyOf reads the deduction
    // off row.carry, and with the carry off there is no row.carry - so with the writer
    // alone open, a man hands back 200, this row says "200 ₪ הוחזרו · נותרו 300", and the
    // pay column goes on deducting the whole 500. Recorded, visible, and absent from the
    // sum somebody is paid from. A repayment nobody deducts is worse than no repayment at
    // all, because it reads as settled and is not.
    //
    // Either a build deducts what it lets somebody record, or it does not offer a way to
    // record one. There is no third state worth shipping.
    // BOTH GATES AND THE RECORD'S OWN READINESS. financialWritingEnabled adds the third
    // condition: a device whose accounts would be restated by the carry has money on the
    // line nobody has looked at yet, and no button here may write against it until
    // somebody has - see the migration review in js/ui/settings.js.
    const settled = financialWritingEnabled(State.schedule)
        ? advanceSettled(State.schedule, item.id) : null;
    // THE TWO LABELS THAT NEVER SWAP.
    //
    // "חוב פתוח" is the live number - what this man still owes as of today, and it moves
    // with every new transaction. "יתרת סגירה" is the historical one, printed on a closed
    // payslip and fixed there forever. They are different questions with different
    // answers, and the moment a screen uses one word for both, somebody reads a settled
    // fortnight's figure as what is still owed - or the reverse, which is worse.
    //
    // Taken from the design's HistoryVsToday frame, where the whole point of the frame is
    // that these two never trade places.
    // Each way the debt came down gets its own words, because they are different events
    // and a man asked to sign for one of them may not have done the other. Cash he handed
    // back, money that came off his wage, and a clerical correction that never involved
    // him at all are three sentences, not one number.
    if (settled && settled.repaid > 0) {
        what.appendChild(el('span', 'wday-note',
            `${moneyText(settled.repaid)} ₪ ${LEDGER_KIND_LABELS.repaid}`));
    }
    if (settled && settled.deducted > 0) {
        what.appendChild(el('span', 'wday-note',
            `${moneyText(settled.deducted)} ₪ ${LEDGER_KIND_LABELS.deducted}`));
    }
    if (settled && settled.reversed > 0) {
        what.appendChild(el('span', 'wday-note',
            `${moneyText(settled.reversed)} ₪ ${LEDGER_KIND_LABELS.reversed}`));
    }
    if (settled && settled.settled > 0) {
        what.appendChild(el('span', 'wday-note',
            `חוב פתוח ${moneyText(settled.left)} ₪`));
    }
    // MORE HAS COME OFF THIS ADVANCE THAN WAS EVER PUT ON IT, said out loud rather than
    // clamped to zero and forgotten. Two phones each recorded the same 500 back; both
    // entries are real records of something and neither may be dropped, but until a
    // person says which story is true this app records nothing further against it and
    // deducts nothing from the wage. See overpaidAdvances in js/model/ledger.js.
    if (settled && settled.overpaid > 0) {
        what.appendChild(el('span', 'wday-note wday-review',
            `הוחזר ${moneyText(settled.settled)} ₪ מתוך ${moneyText(settled.given)} ₪ - `
            + `עודף ${moneyText(settled.overpaid)} ₪ טעון בדיקה`));
    } else if (settled && settled.left > 0) {
        what.appendChild(button('החזר', 'btn-secondary',
            () => openRepaymentForm(item, settled, row), 'רישום החזר מזומן'));
    }

    // A MISTAKE IS CORRECTED, NEVER DELETED - and this button is where the ✕ used to be.
    //
    // The ✕ called removeAdvance, which sends `advances.<id> = null`: the row is gone from
    // every phone, and the pay sheet simply grows by that much with nothing anywhere
    // saying whether that was a correction or a loss. On the one operation somebody
    // reaches for when the record is already wrong, that is the worst possible answer.
    //
    // So the correction is an entry of the opposite sign, with a mandatory reason, and
    // both rows stay on the screen. Behind the same two gates as the repayment, and for
    // the same argument: a build that has no way to record a correction the other phones
    // can read must not offer one.
    if (settled && settled.given > 0 && financialWritingEnabled(State.schedule)) {
        what.appendChild(button('תיקון', 'btn-secondary',
            () => openReversalForm(item, settled, row), 'תיקון-היפוך של מקדמה שנרשמה בטעות'));
    }

    row.appendChild(what);

    row.appendChild(el('div', 'wday-money', minusAmount(item.amount)));
    return row;
}

// How much of this advance is still owed - ONE call, to the one fold.
//
// This used to be its own arithmetic: `given - repaid`, cash in and cash back. It counted
// one of the three kinds of entry that reduce a debt and silently ignored the other two,
// so an advance of 500 with 400 already taken off a man's wage read "חוב פתוח 500" here
// and offered him a repayment ceiling of 500. He could hand back 500 in cash against a
// debt of 100, and the app would take it.
//
// A second answer to a money question is not a convenience, it is a disagreement waiting
// for a payday. advanceOutstanding in js/model/ledger.js is the answer; this is a name
// for it on this screen and nothing more, and it is feature-detected only because the
// ledger file may not be loaded in a build that is being taken apart.
function advanceSettled(schedule, advanceId) {
    if (typeof advanceOutstanding !== 'function') {
        const given = Number(((schedule.advances || {})[advanceId] || {}).amount) || 0;
        return { id: String(advanceId), given: agora(given), repaid: 0, reversed: 0,
            deducted: 0, settled: 0, left: agora(given), overpaid: 0 };
    }
    return advanceOutstanding(schedule, advanceId);
}

// Cash handed back, recorded against the advance it settles.
//
// Deliberately the same shape as the advance form above it, because it is the same act
// seen from the other side and a person who has used one should not have to learn the
// other. The two differences are the ones that matter:
//
//   the ceiling      a repayment larger than what is left is not a repayment, it is a
//                    number somebody mistyped - and accepting it would credit a man for
//                    money the firm never lent him
//   the account      dated inside the CURRENT account, like an advance, because a
//                    repayment filed into a fortnight that was printed and paid weeks
//                    ago moves a number on a sheet somebody was already handed
function openRepaymentForm(item, settled, row) {
    const host = row.parentNode;
    if (!host || host.querySelector('.advance-form')) return;

    const form = el('div', 'advance-form');
    form.appendChild(el('div', 'advance-form-title',
        `החזר מקדמה · חוב פתוח ${moneyText(settled.left)} ₪`));

    const field = (labelText, input) => {
        form.appendChild(el('label', 'field-label', labelText));
        form.appendChild(input);
        return input;
    };

    const amountInput = document.createElement('input');
    amountInput.type = 'text';
    amountInput.setAttribute('inputmode', 'decimal');
    amountInput.dir = 'ltr';
    // The whole of what is left, because settling in full is what usually happens and
    // typing it again is a chance to type it wrong.
    amountInput.value = String(settled.left);
    field('סכום שהוחזר', amountInput);

    const today = todayStr();
    const accountFrom = accountStart(parseLocalDate(today));
    const accountTo = new Date(accountFrom);
    accountTo.setDate(accountFrom.getDate() + 13);
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.value = today;
    dateInput.min = toLocalDateStr(accountFrom);
    dateInput.max = toLocalDateStr(accountTo);
    field('תאריך', dateInput);

    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.maxLength = 120;
    field('הערה (לא חובה)', noteInput);

    const error = el('p', 'field-error');
    form.appendChild(error);

    const save = () => {
        const typed = amountInput.value.trim()
            .replace(/[٠-٩]/g, digit => '٠١٢٣٤٥٦٧٨٩'.indexOf(digit))
            .replace(/[۰-۹]/g, digit => '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit));
        const amount = Number(typed);
        if (!/^\d+$/.test(typed) || !Number.isFinite(amount) || amount <= 0) {
            error.textContent = 'הכנס סכום בשקלים שלמים, גדול מאפס.';
            amountInput.focus();
            return;
        }
        if (amount > settled.left) {
            error.textContent = 'אי אפשר להחזיר יותר מהחוב הפתוח - '
                + `${moneyText(settled.left)} ₪.`;
            amountInput.focus();
            return;
        }
        const date = dateInput.value;
        if (!isRealDate(date) || date < dateInput.min || date > dateInput.max) {
            error.textContent = 'בחר תאריך בתוך תקופת החשבון הנוכחית - החזר מחוץ לה ' +
                'ישנה חשבון שכבר שולם.';
            return;
        }

        const change = recordAdvanceRepaid(State.schedule, item.id, amount, date,
            noteInput.value.trim(), new Date().toISOString(), syncDeviceId(), 'cash');
        if (!State.commit(change)) return;
        openWorkerDays(item.workerId);
    };

    const buttons = el('div', 'modal-actions');
    // No class: the base `button` rule IS the primary style, and this is the primary
    // action of the form. `btn-primary` used to be written here and matched no rule in
    // css/app.css at all - it looked right by accident and told the next reader a lie.
    buttons.appendChild(button('שמור', null, save));
    buttons.appendChild(button('ביטול', 'btn-secondary', () => form.remove()));
    form.appendChild(buttons);
    host.insertBefore(form, row.nextSibling);
}

// TIKUN-HIPUKH: an advance that should not have been recorded, corrected in place.
//
// The same shape as the repayment form beside it, because it is the same gesture, and
// three things about it are different on purpose:
//
//   the reason      MANDATORY. A repayment explains itself - a man handed cash over. A
//                   correction explains nothing on its own, and "somebody changed a
//                   number and nobody wrote down why" is the state this whole ledger was
//                   written against.
//   the ceiling     what is left UNREVERSED, not what is left owed. Reversing 300 of a
//                   300 leaves nothing to reverse, and the second attempt is refused
//                   rather than folded into a debt the man never had.
//   the words       "הוחזר במזומן" is not said here. He handed nothing back; the money
//                   never left the tin, and a statement that called this a repayment
//                   would be telling him he did something he did not do.
function openReversalForm(item, settled, row) {
    const host = row.parentNode;
    if (!host || host.querySelector('.advance-form')) return;

    const room = typeof reversalRoom === 'function'
        ? reversalRoom(State.schedule, item.id) : settled.given;

    const form = el('div', 'advance-form');
    form.appendChild(el('div', 'advance-form-title',
        `${LEDGER_KIND_LABELS.reversed} · אפשר לתקן עד ${moneyText(room)} ₪`));

    const field = (labelText, input) => {
        form.appendChild(el('label', 'field-label', labelText));
        form.appendChild(input);
        return input;
    };

    // AN AMOUNT IS A QUESTION HERE, and it stays a field.
    //
    // This form says "this advance was never handed over", and money can be handed over
    // in part: reversalProblems has always accepted a partial against an advance and the
    // fold reads it that way. The all-or-nothing rule added in C5 belongs to a correction
    // that names a TRANSACTION - openEventReversalForm - where a partial would strand the
    // remainder where nothing can reach it. The two forms are not the same question and
    // must not be given the same answer.
    const amountInput = document.createElement('input');
    amountInput.type = 'text';
    amountInput.setAttribute('inputmode', 'decimal');
    amountInput.dir = 'ltr';
    amountInput.value = String(room);
    field('סכום לתיקון', amountInput);

    // Dated on the advance's own day, and not a question - the same rule as the form
    // that corrects a transaction, from the same reason. This entry says the advance was
    // never handed over, so it belongs in the account the advance is in, and a date
    // somebody can type is a fortnight somebody can move money into.
    form.appendChild(el('label', 'field-label', 'תאריך'));
    form.appendChild(el('div', 'advance-form-amount',
        formatFullDate(parseLocalDate(item.date)) + ' · לפי יום המקדמה'));

    const reasonInput = document.createElement('input');
    reasonInput.type = 'text';
    reasonInput.maxLength = 120;
    field('סיבה (חובה)', reasonInput);

    const error = el('p', 'field-error');
    form.appendChild(error);

    const save = () => {
        // THIS FORM CORRECTS AN ADVANCE - "this was never handed over" - and a partial is
        // legitimate here, because money can be handed over in part. The all-or-nothing
        // rule belongs to a correction that names a TRANSACTION: see
        // openEventReversalForm and tests/correction.test.mjs. So the amount is a field,
        // and it is read back out of the field.
        const typed = amountInput.value.trim()
            .replace(/[٠-٩]/g, digit => '٠١٢٣٤٥٦٧٨٩'.indexOf(digit))
            .replace(/[۰-۹]/g, digit => '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit));
        const amount = Number(typed);
        const reason = reasonInput.value.trim();
        if (!/^\d+$/.test(typed) || !Number.isFinite(amount) || amount <= 0) {
            error.textContent = 'הכנס סכום בשקלים שלמים, גדול מאפס.';
            amountInput.focus();
            return;
        }
        if (reason === '') {
            error.textContent = 'צריך לכתוב למה - תיקון בלי סיבה הוא שינוי בכסף '
                + 'שאיש לא הסביר.';
            reasonInput.focus();
            return;
        }
        // The model has the last word, and it is asked about the exact advance rather
        // than about a number a form carried: `room` was read when this form opened, and
        // between then and now the other phone may have reversed it.
        const problems = typeof reversalProblems === 'function'
            ? reversalProblems(State.schedule, item.id, amount, reason) : [];
        if (problems.length > 0) {
            const left = typeof reversalRoom === 'function'
                ? reversalRoom(State.schedule, item.id) : room;
            error.textContent = left <= 0
                ? 'המקדמה הזו כבר תוקנה במלואה. תיקון נוסף יבטל כסף שכבר בוטל.'
                : `אפשר לתקן עד ${moneyText(left)} ₪ מהמקדמה הזו.`;
            amountInput.focus();
            return;
        }
        const change = recordAdvanceReversed(State.schedule, item.id, amount, item.date,
            reason, new Date().toISOString(), syncDeviceId());
        // A refusal from the model is not a screen that pretends to have saved. It reads
        // the record as it is NOW, so the honest answer is that something moved under
        // this form.
        if (!change) {
            error.textContent = 'אי אפשר לתקן את המקדמה הזו עכשיו. רענן ובדוק את '
                + 'ההיסטוריה - ייתכן שכבר תוקנה ממכשיר אחר.';
            amountInput.focus();
            return;
        }
        if (!State.commit(change)) return;
        openWorkerDays(item.workerId);
    };

    const buttons = el('div', 'modal-actions');
    buttons.appendChild(button('שמור תיקון', null, save));
    buttons.appendChild(button('ביטול', 'btn-secondary', () => form.remove()));
    form.appendChild(buttons);
    host.insertBefore(form, row.nextSibling);
}

// THE ONE ACCOUNT READER, and every surface in this file goes through it.
//
// Four surfaces priced the same fortnight and three of them did their own arithmetic:
//
//   renderNetRow          earned - sum(advances dated in the range)
//   workerStatementText   earned - sum(advances dated in the range)
//   openAdvanceBalance    sum(every advance ever), ignoring every repayment
//
// while payrollRows priced it through advanceAccount, which knows about the opening
// balance, the cash that came back and the money already taken off his wage. So one man,
// one evening, one fortnight could read 1,950 on the screen, 5,000 in the archive warning
// and 3,050 on WhatsApp - and each of those numbers was arrived at honestly.
//
// Null when there is no account to read: the carry gate is shut, the migration has not
// been approved on this record, or the range somebody picked is not a whole account.
// Every caller falls back to the arithmetic this build has always done, which is what a
// phone with the gates closed - or a record nobody has signed off - must keep saying.
function workerAccountFor(workerId) {
    if (!carryReportingEnabled(State.schedule)) return null;
    if (!wholeAccountRange(REPORT_RANGE.from, REPORT_RANGE.to)) return null;
    if (typeof advanceAccount !== 'function') return null;
    return advanceAccount(State.schedule, workerId, REPORT_RANGE.from, REPORT_RANGE.to);
}

function renderNetRow(days, worker, advances) {
    const earned = days.filter(day => !day.absent)
        .reduce((sum, day) => sum + (day.amount || 0), 0);
    const account = workerAccountFor(worker.id);
    // What comes off THIS fortnight, which is not the same as what was handed over in it:
    // an advance bigger than the wage is deducted up to the wage and the rest carries.
    const taken = account
        ? account.deducted
        : advances.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

    const row = el('div', 'wday wday-total wday-net');
    row.appendChild(el('div', 'wday-date', 'נותר לתשלום'));
    const what = `${moneyText(agora(earned))} נצבר · ${moneyText(agora(taken))} מקדמות`;
    row.appendChild(el('div', 'wday-what', account && account.carriedIn > 0
        ? `${what} · ${moneyText(account.carriedIn)} מחשבון קודם` : what));
    row.appendChild(el('div', 'wday-money',
        Number(worker.dailyRate) > 0
            ? bidiAmount(moneyText(agora(agora(earned) - agora(taken)))) : '—'));
    return row;
}

function renderAdvanceAdd(worker) {
    const box = el('div', 'wday-actions');
    box.appendChild(button('+ מקדמה', 'btn-secondary', () => openAdvanceForm(worker, box)));
    box.appendChild(button('💬 שלח לעובד', 'btn-success', () => shareWorkerStatement(worker.id)));
    return box;
}

// The small form an advance is recorded through: amount, date, an optional note, and
// how the money moved. One question through askText used to be enough, but the answers
// the extra fields carry were being asked anyway - on payday, of somebody's memory.
//
// This still writes the ONE record every phone already reads (addAdvance, the legacy
// path); the v80 ledger writer stays gated off. The method rides along as an extra
// field the wire check passes through untouched.
function openAdvanceForm(worker, actions) {
    const host = actions.parentNode;
    if (!host || host.querySelector('.advance-form')) return;

    const form = el('div', 'advance-form');
    form.appendChild(el('div', 'advance-form-title', `מקדמה חדשה · ${isolate(worker.name)}`));

    const field = (labelText, input) => {
        const label = el('label', 'field-label', labelText);
        form.appendChild(label);
        form.appendChild(input);
        return input;
    };

    const amountInput = document.createElement('input');
    amountInput.type = 'text';
    // The digit keyboard, the way every other amount field in the app gets it.
    amountInput.setAttribute('inputmode', 'decimal');
    amountInput.dir = 'ltr';
    amountInput.placeholder = '500';
    field('סכום', amountInput);

    // Dated today, and correctable only inside the account that contains today. The
    // clamp used to follow the VIEWED range - and from the "חודש שעבר" preset that
    // filed live cash into a fortnight that was printed and paid weeks ago, where the
    // date window would never deduct it. The account an advance belongs to is the one
    // containing the day the money changed hands, not whatever window is on screen.
    const today = todayStr();
    const accountFrom = accountStart(parseLocalDate(today));
    const accountTo = new Date(accountFrom);
    accountTo.setDate(accountFrom.getDate() + 13);
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.value = today;
    dateInput.min = toLocalDateStr(accountFrom);
    dateInput.max = toLocalDateStr(accountTo);
    field('תאריך', dateInput);
    // The native control renders in the OS locale - 08/28 on a phone set to English -
    // while every date this app shows is 28/08. The read-back line says the chosen day
    // the way the rest of the screen says it.
    const dateEcho = el('p', 'hint advance-date-echo');
    const sayDate = () => {
        const parsed = parseLocalDate(dateInput.value);
        dateEcho.textContent = parsed
            ? `${hebrewDayName(parsed)}, ${formatFullDate(parsed)}` : '';
    };
    dateInput.addEventListener('change', sayDate);
    dateInput.addEventListener('input', sayDate);
    sayDate();
    form.appendChild(dateEcho);

    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.placeholder = 'למשל: על חשבון סוף התקופה';
    // A pasted essay would be journalled and saved with the schedule; the cap keeps a
    // note a note.
    noteInput.maxLength = 120;
    field('הערה (לא חובה)', noteInput);

    // מזומן is the default because it is what an advance on a site almost always is -
    // and the segment is the day screen's toggle, not a third text field.
    let method = 'cash';
    const methods = el('div', 'layer-toggle advance-method');
    const methodButton = (key, text) => {
        const btn = button(text, method === key ? 'layer-on' : 'layer-off', () => {
            method = key;
            methods.querySelectorAll('button').forEach(node => {
                const on = node === btn;
                node.className = on ? 'layer-on' : 'layer-off';
                node.setAttribute('aria-pressed', on ? 'true' : 'false');
            });
        });
        btn.setAttribute('aria-pressed', method === key ? 'true' : 'false');
        return btn;
    };
    methods.appendChild(methodButton('cash', 'מזומן'));
    methods.appendChild(methodButton('transfer', 'העברה'));
    form.appendChild(methods);

    form.appendChild(el('p', 'hint', 'הסכום יירד מהתשלום בסוף התקופה.'));

    const error = el('p', 'field-error');
    form.appendChild(error);

    const close = () => {
        form.remove();
        actions.style.display = '';
    };

    const save = () => {
        // Validated to the same standard the wire check will later demand - a value
        // the read path rejects (Infinity stringifies to null, a malformed date) would
        // pass commit today and quarantine the whole record on the next launch.
        // Arabic-Indic digits are typed on real phones here and are normalised, whole
        // shekels only; 'Number' alone also reads '0x10' and '1e5', which nobody meant.
        const typed = amountInput.value.trim()
            .replace(/[٠-٩]/g, digit => '٠١٢٣٤٥٦٧٨٩'.indexOf(digit))
            .replace(/[۰-۹]/g, digit => '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit));
        const amount = Number(typed);
        if (!/^\d+$/.test(typed) || !Number.isFinite(amount) || amount <= 0 || amount > 10000000) {
            error.textContent = 'הכנס סכום בשקלים שלמים, גדול מאפס.';
            amountInput.focus();
            return;
        }
        // Some phones let a date be typed straight into the field, past min and max -
        // and a lexical compare would pass '2026-13-45'. The same isRealDate the wire
        // check runs, run here first.
        const date = dateInput.value;
        if (!isRealDate(date) || date < dateInput.min || date > dateInput.max) {
            error.textContent = 'בחר תאריך בתוך תקופת החשבון הנוכחית - מקדמה מחוץ לה ' +
                'תנוכה מהתקופה הלא נכונה.';
            return;
        }

        // BOTH HALVES, IN ONE OPERATION.
        //
        // This called addAdvance and committed the one change it returned. That wrote the
        // record every phone reads - which is right, and is not all of it: the ledger
        // learned about the advance at the next boot, from the migration, if it ever ran.
        // A repayment recorded before then stood on nothing, the fold answered undefined
        // for the whole advance, and the migration then took that repayment as proof the
        // advance had already been migrated. See recordNewAdvance in js/model/ledger.js.
        //
        // commitMany, not commit: the two changes are one logical act and the journal
        // writes them all or none. A disk that took the advance and refused its origin
        // would leave money nobody can price.
        const changes = recordNewAdvance(State.schedule, worker.id, date, amount,
            noteInput.value.trim(), new Date().toISOString(), syncDeviceId(), method);
        if (!State.commitMany(changes)) return;
        openWorkerDays(worker.id);
    };

    const buttons = el('div', 'modal-actions');
    buttons.appendChild(button('שמור מקדמה', null, save));
    buttons.appendChild(button('ביטול', 'btn-secondary', close));
    form.appendChild(buttons);

    host.insertBefore(form, actions);
    actions.style.display = 'none';
    amountInput.focus();
}

// removeAdvanceRow WAS HERE, and it is gone on purpose.
//
// It asked "למחוק את המקדמה?" and, on a yes, sent `advances.<id> = null`. The record was
// then gone from all three phones, the pay sheet grew by that much, and nothing anywhere
// said whether that was a correction or a loss. Money that leaves a ledger without a row
// explaining it is the one thing this file may not do.
//
// The replacement is openReversalForm above: an entry of the opposite sign, with a
// mandatory reason, and both rows still on the screen afterwards. removeAdvance itself
// stays in js/model/schema.js - a `null` at an advance path still has to be UNDERSTOOD
// when it arrives from a phone that has not updated, and the validator that reads it is
// the reason it is there. Nothing in this build calls it.

// What a ledger entry IS, in the ledger's own three words. Not the method labels above:
// a kind says what happened to the record, not how money moved.
// The five words the design settled on, and they are the words on every surface: the
// history list, the advance row, the pay sheet and the statement. Each names an EVENT, so
// no two of them can be read as the same thing - which is the point of writing them down
// here rather than at each call site.
// Every correction against this man, dated in the range, oldest first. Read off the
// ledger because that is where a correction lives, and feature-detected because the
// ledger file may not be loaded on a build that never opened it.
function correctionsIn(workerId, from, to) {
    if (typeof ledgerEntries !== 'function') return [];
    return ledgerEntries(State.schedule)
        .filter(entry => String(entry.kind) === 'reversed')
        .filter(entry => String(entry.workerId || '') === String(workerId)
            || String((State.schedule.advances[entry.advanceId] || {}).workerId || '')
                === String(workerId))
        .filter(entry => String(entry.date) >= from && String(entry.date) <= to)
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// One correction, in the words a person can answer for: what it undid, when that was,
// how much it was, and why. The same sentence on every surface that shows it.
function correctionLine(entry) {
    const what = LEDGER_KIND_LABELS[String(entry.targetKind)] || String(entry.targetKind);
    const when = entry.targetDate
        ? formatShortDate(parseLocalDate(String(entry.targetDate))) : '';
    const howMuch = entry.targetAmount !== undefined
        ? `${moneyText(Number(entry.targetAmount) || 0)} ₪` : '';
    const head = [what, when, howMuch].filter(Boolean).join(' ');
    const why = String(entry.reason || '').trim();
    return why ? `${head} - ${why}` : head;
}

// What the third money column is called, which depends on what it holds - see moneyOf.
// One function so the screen, the CSV and the workbook cannot disagree about the heading
// over the same number.
function deductionColumnName() {
    return (typeof carryReportingEnabled === 'function'
        && carryReportingEnabled(State.schedule)
        && wholeAccountRange(REPORT_RANGE.from, REPORT_RANGE.to))
        ? LEDGER_KIND_LABELS.deducted
        : 'מקדמות';
}

// WHY A CLOSE IS REFUSED FOR A REASON THAT IS NOT ABOUT THE MONEY.
//
// Said in one place because it is said in two: on the block instead of the button, and
// in the dialog when the clock went behind between drawing the screen and pressing.
// It names what would happen rather than the mechanism - a person holding a phone does
// not care which timestamp lost, they care that a payment would move fortnight.
const CLOSURE_CLOCK_BEHIND = 'השעון של הטלפון הזה מפגר אחרי תנועה שכבר רשומה בחשבון. '
    + 'סגירה מהטלפון הזה תעביר את התנועה הזאת לתקופה הבאה - לכן היא חסומה עכשיו. '
    + 'נסה שוב בעוד כמה דקות, או סגור מטלפון אחר.';

const LEDGER_KIND_LABELS = {
    given: 'ניתנה מקדמה',
    repaid: 'הוחזר במזומן',
    deducted: 'נוכה מהשכר',
    reversed: 'תיקון-היפוך',
    closed: 'החשבון נסגר',
    corrected: 'תיקון',
    cancelled: 'בוטל'
};

// היסטוריה מלאה: every ledger entry that concerns this worker, oldest first, folded
// shut under the advances. Strictly a reading of the v80 record - the writer is gated
// off (ledger.js LEDGER_WRITES), so there is not a single button in here and nothing
// this renders can change an entry. Feature-detected, because the modal must survive a
// build where the ledger file is not loaded; empty ledgers render nothing at all.
function renderWorkerLedger(workerId) {
    if (typeof advanceHistory !== 'function' || typeof ledgerEntries !== 'function') {
        return null;
    }

    // An advance concerns this man if any of its entries names him - a correction that
    // moved it to somebody else is still part of the story of what he was handed.
    const ids = [];
    ledgerEntries(State.schedule).forEach(entry => {
        if (String(entry.workerId || '') !== String(workerId)) return;
        if (ids.indexOf(String(entry.advanceId)) === -1) ids.push(String(entry.advanceId));
    });

    let entries = [];
    ids.forEach(id => { entries = entries.concat(advanceHistory(State.schedule, id)); });
    if (entries.length === 0) return null;

    // Read out in the order things happened. A migrated entry carries no `at` on
    // purpose (ledger.js: a fabricated timestamp would be the ledger's first lie), so
    // its advance date stands in for ordering; ties fall back to the entry id, the same
    // tie-break the fold uses.
    entries.sort((a, b) => {
        const at = String(a.at || a.date || '');
        const bt = String(b.at || b.date || '');
        if (at !== bt) return at < bt ? -1 : 1;
        return String(a.id) < String(b.id) ? -1 : 1;
    });

    const fold = el('details', 'wday-ledger');
    // No version number in a sentence somebody reads. It named the build the ledger
    // arrived in, which stopped being this build several releases ago, and a person
    // opening their own history has no use for it.
    fold.appendChild(el('summary', null, 'היסטוריה מלאה'));
    entries.forEach(entry => fold.appendChild(renderLedgerEntry(entry)));
    return fold;
}

function renderLedgerEntry(entry) {
    const row = el('div', 'ledger-entry');

    const what = el('div', 'ledger-what');
    what.appendChild(el('strong', 'ledger-kind',
        LEDGER_KIND_LABELS[entry.kind] || String(entry.kind || '')));
    const parsed = parseLocalDate(entry.date);
    if (parsed) what.appendChild(el('span', 'ledger-date', formatFullDate(parsed)));
    row.appendChild(what);

    // A cancellation carries no amount, and a correction may only move a date - the
    // amount cell is filled only when the entry actually states one.
    const amount = Number(entry.amount);
    row.appendChild(el('div', 'ledger-amount',
        entry.amount !== undefined && isFinite(amount) ? bidiAmount(moneyText(amount)) : ''));

    if (entry.note) row.appendChild(el('div', 'ledger-note', entry.note));
    // THE REASON, ON THE ROW. A correction is the one entry that explains nothing on its
    // own - the amount and the date say what moved and when, and neither says why - so an
    // unexplained adjustment to money is exactly what this would be without it.
    if (entry.reason) {
        row.appendChild(el('div', 'ledger-reason', `סיבה: ${entry.reason}`));
    }
    // And WHICH line stopped being true. A correction floating beside four transactions
    // is a correction of whichever one the reader guesses.
    if (entry.targetKind) {
        row.appendChild(el('div', 'ledger-note',
            `מתקן: ${LEDGER_KIND_LABELS[entry.targetKind] || entry.targetKind}`));
    }
    if (entry.origin === 'migration') {
        row.appendChild(el('div', 'ledger-origin', 'הועתק מהרישום הקיים'));
    }

    // CORRECTING THIS TRANSACTION, offered here and nowhere else - this is the only place
    // in the app where the immutable id of one event is on the screen, and the id is what
    // a correction has to name. Behind the writing gate, like every other writer.
    if (typeof eventReversalRoom === 'function'
        && financialWritingEnabled(State.schedule)
        && eventReversalRoom(State.schedule, entry.id) > 0) {
        row.appendChild(button('תיקון', 'btn-secondary',
            () => openEventReversalForm(entry, row),
            `תיקון-היפוך של ${LEDGER_KIND_LABELS[entry.kind] || entry.kind}`));
    }
    return row;
}

// CORRECTING ONE TRANSACTION, by its immutable id.
//
// The advance-level form corrects an ADVANCE - "this was never handed over" - and that is
// the only sentence it can say. A cash repayment entered twice, or against the wrong man,
// is at least as common and could not be expressed at all: reversing the advance to fix a
// repayment reduces the debt, which credits him twice for money that was never there.
//
// So this names the transaction. Its sign follows the kind of what it corrects, which the
// model decides and this form does not - see recordEventReversed in js/model/ledger.js.
function openEventReversalForm(entry, row) {
    const host = row.parentNode;
    if (!host || host.querySelector('.advance-form')) return;

    const room = eventReversalRoom(State.schedule, entry.id);
    const form = el('div', 'advance-form');
    form.appendChild(el('div', 'advance-form-title',
        `${LEDGER_KIND_LABELS.reversed} · ${LEDGER_KIND_LABELS[entry.kind] || entry.kind}`
        + ` ${moneyText(room)} ₪`));

    const field = (labelText, input) => {
        form.appendChild(el('label', 'field-label', labelText));
        form.appendChild(input);
        return input;
    };

    // THE AMOUNT IS NOT A QUESTION, so it is not a field.
    //
    // This was an editable input pre-filled with the room, and the error under it read
    // "אפשר לתקן עד X ₪" - correct up TO. Both of them invited a number smaller than the
    // transaction, and the model now refuses every one of those: a correction is the
    // whole transaction or it is nothing, because a partial strands the remainder where
    // nothing can reach it. Offering a box somebody can type 100 into and then refusing
    // 100 is a worse screen than not offering the box.
    //
    // It is still SHOWN - the person has to see what they are undoing - as text.
    const amountLine = el('div', 'advance-form-amount',
        `${moneyText(room)} ₪ · התיקון מבטל את התנועה במלואה`);
    form.appendChild(el('label', 'field-label', 'סכום לתיקון'));
    form.appendChild(amountLine);

    // THE DATE IS NOT A QUESTION EITHER, for the same reason the amount is not.
    //
    // This entry says that transaction did not happen, so it belongs where the transaction
    // is. This was an editable date input, above a comment saying that dating it anywhere
    // else "would move money between two fortnights to undo something that happened in one
    // of them" - and the value went into the record unexamined. Blank, it wrote a
    // correction this build's own reader refuses.
    //
    // Shown, because the person has to see where the correction is going. As text.
    form.appendChild(el('label', 'field-label', 'תאריך'));
    form.appendChild(el('div', 'advance-form-amount',
        formatFullDate(parseLocalDate(entry.date)) + ' · לפי יום התנועה'));

    const reasonInput = document.createElement('input');
    reasonInput.type = 'text';
    reasonInput.maxLength = 120;
    field('סיבה (חובה)', reasonInput);

    const error = el('p', 'field-error');
    form.appendChild(error);

    const save = () => {
        // Re-read, not remembered: the other phone may have corrected this transaction
        // while the form was open, and `room` is then 0 and this button must not write.
        const amount = eventReversalRoom(State.schedule, entry.id);
        const reason = reasonInput.value.trim();
        if (!(amount > 0)) {
            error.textContent = 'התנועה הזו כבר תוקנה. תיקון נוסף יזיז את הכסף פעמיים.';
            reasonInput.focus();
            return;
        }
        if (reason === '') {
            error.textContent = 'צריך לכתוב למה - תיקון בלי סיבה הוא שינוי בכסף '
                + 'שאיש לא הסביר.';
            reasonInput.focus();
            return;
        }
        // The model has the last word, asked about the record as it is NOW: the other
        // phone may have corrected this same transaction while the form was open.
        const problems = eventReversalProblems(State.schedule, entry.id, amount, reason);
        if (problems.length > 0) {
            // No "up to" any more: there is no amount this form can offer that the model
            // would take but this one, so a refusal here is about the transaction, never
            // about the number.
            error.textContent = 'אי אפשר לתקן את התנועה הזו עכשיו. רענן ובדוק את '
                + 'ההיסטוריה - ייתכן שכבר תוקנה ממכשיר אחר.';
            reasonInput.focus();
            return;
        }

        // The transaction's own day. recordEventReversed derives it from the validated
        // target and ignores anything else; this passes the same value so the two
        // never differ in a reading of the code either.
        const change = recordEventReversed(State.schedule, entry.id, amount,
            entry.date, reason, new Date().toISOString(), syncDeviceId());
        if (!change) { form.remove(); return; }
        if (!State.commit(change)) return;
        openWorkerDays(entry.workerId || (State.schedule.advances[entry.advanceId] || {}).workerId);
    };

    const buttons = el('div', 'modal-actions');
    buttons.appendChild(button('שמור תיקון', null, save));
    buttons.appendChild(button('ביטול', 'btn-secondary', () => form.remove()));
    form.appendChild(buttons);
    host.insertBefore(form, row.nextSibling);
}

// The statement the worker gets on payday, in the same shape as the screen it came from:
// the days, then what they add up to, then what was already handed over. Sent the same
// way the seder is, because that is the channel these men are reachable on.
function workerStatementText(workerId) {
    const worker = State.worker(workerId);
    if (!worker) return '';

    const days = workerDaysReport(State.schedule, worker, REPORT_RANGE.from, REPORT_RANGE.to);
    const advances = advancesFor(State.schedule, worker.id, REPORT_RANGE.from, REPORT_RANGE.to);
    const worked = days.filter(day => !day.absent);
    const earned = worked.reduce((sum, day) => sum + (day.amount || 0), 0);
    // THE SAME ACCOUNT THE SCREEN AND THE SHEET READ. This summed the advances dated in
    // the range, which is a different question from what comes off this man's wage - and
    // his own copy was the one document that answered it differently from the sheet he
    // is paid against.
    const account = workerAccountFor(worker.id);
    const taken = account
        ? account.deducted
        : advances.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const priced = Number(worker.dailyRate) > 0;

    const lines = [
        `📄 ${isolate(worker.name)} - ${formatFullDate(parseLocalDate(REPORT_RANGE.from))} עד ${formatFullDate(parseLocalDate(REPORT_RANGE.to))}`,
        ''
    ];

    days.forEach(day => {
        const parsed = parseLocalDate(day.date);
        const when = `${HEBREW_DAY_NAMES[parsed.getDay()]} ${formatShortDate(parsed)}`;
        if (day.absent) { lines.push(`• ${when} - נעדר`); return; }

        const labels = reportPlaceLabels();
        const where = day.entries.map(entry => {
            const name = placeLabelFrom(labels, entry.placeId);
            const rate = entryRate(entry);
            if (rate === RATE_DOUBLE) return `${name} (כפול)`;
            if (rate === RATE_EXTRA) {
                const hours = entryExtraHours(entry);
                return hours ? `${name} (${plusAmount(hours)} ש׳)` : `${name} (נוספות)`;
            }
            return name;
        }).join(' + ');

        lines.push(`• ${when} - ${where}${priced && day.amount !== null ? ` - ${moneyText(day.amount)}` : ''}`);
    });

    lines.push('');
    // Both numbers, in the message the man actually receives. He is the one person who
    // will check the total against the days, and one count could not explain it.
    const summary = workerDaysSummary(days);
    lines.push('סה״כ ' + countedIn(summary.attendanceDays, 'יום נוכחות אחד', 'ימי נוכחות'));
    lines.push(workUnitsLine(summary));
    if (priced) lines.push(`נצבר: ${moneyText(agora(earned))}`);

    // The screen puts a * on unpriced hours and the sheet explains it; the message the
    // worker actually receives must not be the one place that pretends the number is
    // complete.
    if (priced && days.some(day => !day.absent && day.extraHours > 0)
        && !(Number(worker.hourlyRate) > 0)) {
        lines.push('');
        lines.push('* שעות נוספות בלי שכר שעה - לא נכללו בסכום.');
    }

    // WHAT HE OWED BEFORE THIS FORTNIGHT BEGAN. Without it the deduction below looks
    // like it came from nowhere, and the man checking his own message has no way to get
    // from the advance he remembers to the number he is handed.
    if (account && account.carriedIn > 0) {
        lines.push('');
        // יתרת פתיחה, not "ניתנה מקדמה מחשבון קודם". Nothing was given from a previous
        // account; a balance was carried out of one. The old wording said money changed
        // hands on a date it did not, in the document the man checks his own pay against.
        lines.push(`יתרת פתיחה: ${moneyText(account.carriedIn)}`);
    }

    if (advances.length > 0) {
        lines.push('');
        // What was handed over IN THIS PERIOD, totalled before the individual lines, so
        // the four figures below read as one account: opening balance, new advances,
        // what came off the wage, what is still open.
        lines.push(`מקדמות חדשות: ${moneyText(agora(advances.reduce(
            (sum, item) => sum + (Number(item.amount) || 0), 0)))}`);
        // The same three words the screen draws over the same record. The man is the one
        // person who will ever dispute "you were paid in cash", and his own copy used to
        // be the one document in the app that could not answer.
        advances.forEach(item => lines.push(
            `${advanceMethodLabel(item.method)} ${formatShortDate(parseLocalDate(item.date))}: `
            + `${minusAmount(item.amount)}`));
    }

    // Cash he handed back, and money already taken off his wage - his own copy has to
    // name both, or the two of them are the difference he cannot account for.
    if (account && account.repaid > 0) {
        lines.push(`${LEDGER_KIND_LABELS.repaid}: ${moneyText(account.repaid)}`);
    }
    if (account && account.reversed > 0) {
        lines.push(`${LEDGER_KIND_LABELS.reversed}: ${moneyText(account.reversed)}`);
        // AND WHY, and against what. An amount with no reason is the one line on this
        // message a man cannot check: it says money moved and does not say what it
        // undid. Each correction names the transaction it corrects - its kind, its date
        // and its amount - and the reason somebody typed when they wrote it.
        correctionsIn(worker.id, REPORT_RANGE.from, REPORT_RANGE.to).forEach(entry => {
            lines.push(`  · ${correctionLine(entry)}`);
        });
    }
    if (account && account.deducted > 0) {
        lines.push(`${LEDGER_KIND_LABELS.deducted}: ${moneyText(account.deducted)}`);
    }

    // AND THE ONE THING THAT STOPS A PAYMENT. The man's own copy is the document he
    // acts on, and it was the one surface that said nothing when his account did not add
    // up - a clean net, on a record where more had been handed back than was ever given.
    const overpayment = overpaymentWarning(account);
    if (overpayment) {
        lines.push('');
        lines.push(overpayment);
    }

    if (priced) {
        lines.push('');
        lines.push(`נותר לתשלום: `
            + `${bidiAmount(moneyText(agora(agora(earned) - agora(taken))))}`);
        // And what is still on the books afterwards, in the words the two labels never
        // swap: a closed period reports its יתרת סגירה, an open one its חוב פתוח.
        // BOTH FIGURES WHEN THERE ARE TWO, because there are two and he is entitled to
        // the second one. The sheet has printed both since C4; this document printed only
        // the frozen one, so a man who handed back 400 after his fortnight shut was told
        // he still owed 1,950 when he owed 1,550 - and the office's copy said so. The one
        // number he can check was the one that left out the money he paid.
        //
        // `חוב פתוח כולל` rather than `חוב פתוח`: on an open period that label means the
        // whole balance and nothing was frozen beside it. Here it stands next to a closing
        // balance and means what is left after everything that has happened since, which
        // is a different sentence and takes a different word.
        if (account && account.closed && account.carriedOut > 0) {
            lines.push(`יתרת סגירה: ${moneyText(account.carriedOut)}`);
            if (account.lateSinceClose !== 0) {
                lines.push(`חוב פתוח כולל: ${moneyText(account.carriedForward)}`);
            }
        } else if (account && account.carriedForward > 0) {
            lines.push(`חוב פתוח: ${moneyText(account.carriedForward)}`);
        }
    }

    return lines.join('\n');
}

function shareWorkerStatement(workerId) {
    const text = workerStatementText(workerId);
    if (!text) return;

    if (navigator.share) {
        navigator.share({ text }).catch(error => {
            if (error && error.name === 'AbortError') return;
            // Outside the gesture by now, so a window.open here would be popup-blocked
            // and the failure silent. Say what happened instead.
            askTell('השיתוף לא נפתח. נסה שוב, או שלח מתוך מסך היום.');
        });
        return;
    }
    // Inside the click, where the browser still allows a new tab.
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

function renderWorkerDayRow(day, worker) {
    const row = el('div', day.absent ? 'wday wday-absent' : 'wday');
    const parsed = parseLocalDate(day.date);

    const when = el('div', 'wday-date');
    when.appendChild(el('strong', null, HEBREW_DAY_NAMES[parsed.getDay()]));
    when.appendChild(el('span', null, formatFullDate(parsed)));
    row.appendChild(when);

    const what = el('div', 'wday-what');
    if (day.absent) {
        what.appendChild(el('span', 'tag tag-absent', 'נעדר'));
    } else {
        const labels = reportPlaceLabels();
        day.entries.forEach(entry => {
            const tag = el('span', 'tag tag-place');
            appendSiteName(tag, entry.placeId, placeLabelFrom(labels, entry.placeId));
            paintSite(tag, entry.placeId);

            const rate = entryRate(entry);
            if (rate === RATE_DOUBLE) tag.appendChild(el('span', 'tag-rate', 'כפול'));
            else if (rate === RATE_EXTRA) {
                const hours = entryExtraHours(entry);
                tag.appendChild(el('span', 'tag-rate', hours ? plusAmount(hours) : 'נוספות'));
            }
            what.appendChild(tag);
        });

        // Spelled out, because this is the line that gets queried: two sites is one day.
        if (day.entries.length > 1) {
            what.appendChild(el('span', 'wday-note', 'שני אתרים - יום אחד'));
        }
    }
    row.appendChild(what);

    const money = el('div', 'wday-money');
    if (!day.absent) {
        money.textContent = day.amount === null ? '—' : moneyText(day.amount);
        if (day.amount !== null && day.extraHours > 0 && !(Number(worker.hourlyRate) > 0)) {
            money.textContent += ' *';
        }
        // A day keeps the rate it was worked at, so after a raise this line and the
        // roster disagree - and the line has to say which rate IT was paid at, or the
        // whole card reads as an arithmetic mistake on the one screen that exists to
        // settle that argument.
        if (day.historic && day.dailyRate > 0) {
            money.appendChild(el('span', 'wday-rate', day.doubled
                ? `לפי ${day.dailyRate} ליום × 2`
                : `לפי ${day.dailyRate} ליום`));
        }
    }
    row.appendChild(money);

    return row;
}

function renderWorkerDaysTotal(days, worker) {
    // One computation, shared with the pay sheet, the message and the export. Counting
    // it again here is how the four of them came to disagree in the first place.
    const summary = workerDaysSummary(days);
    const total = summary.amount === null
        ? days.filter(day => !day.absent).reduce((sum, day) => sum + (day.amount || 0), 0)
        : summary.amount;

    const row = el('div', 'wday wday-total');
    row.appendChild(el('div', 'wday-date',
        countedIn(summary.attendanceDays, 'יום נוכחות אחד', 'ימי נוכחות')));

    // The counts, then the working under them: how 4 dates became 6 paid days, and how
    // 6 paid days became 2,700. Each line appears only when it is actually true - the
    // second one is dropped the moment more than one rate was paid in the period,
    // because then no single multiplication IS the total.
    const what = el('div', 'wday-what');
    what.appendChild(el('span', null, workUnitsLine(summary)));
    if (summary.doubleDays > 0) {
        what.appendChild(el('span', 'wday-derive', deriveUnitsLine(summary)));
    }
    const rateLine = singleRateLine(days, summary, total);
    if (rateLine) what.appendChild(el('span', 'wday-derive', rateLine));
    row.appendChild(what);

    // Gated on what the DAYS say, not on the roster's rate today: six stamped days at
    // 450 are 2,700 whether or not the man still has a rate on the roster, and a card
    // that prints the equation while refusing the sum reads as an argument with itself.
    const knowsMoney = summary.amount !== null || total > 0;
    row.appendChild(el('div', 'wday-money',
        knowsMoney ? moneyText(total) : '—'));
    return row;
}

// "2 ימים רגילים + 2 ימים כפולים × 2 = 6 ימי שכר" - the arithmetic between the two day
// counts, written out once for the person holding the phone up to somebody who counted
// four dates on his fingers.
function deriveUnitsLine(summary) {
    const normal = summary.attendanceDays - summary.doubleDays;
    // Digits as operands: the whole point of the line is arithmetic somebody can
    // follow, and words make poor operands. The labels ride beside the numbers.
    const parts = [];
    if (normal > 0) parts.push(`${normal} רגילים`);
    parts.push(`${summary.doubleDays} כפולים × 2`);
    return parts.join(' + ') + ` = ${summary.payUnits} ימי שכר`;
}

// "6 ימי שכר × 450 = 2,700" - but only when that multiplication is the truth: one rate
// across every day worked, nothing priced by the hour on top, and the product actually
// equal to the total. A period with a raise in it has no such line, and the sheet's
// mixed-rates note explains why.
function singleRateLine(days, summary, total) {
    const worked = days.filter(day => !day.absent);
    if (worked.length === 0) return null;
    // Hours priced at zero pass the product check invisibly: the total excludes them,
    // the product agrees with the total, and the equation asserts nothing is missing
    // while the line above it lists the missing hours. No equation over any overtime.
    if (summary.extraHours > 0) return null;

    const rates = new Set(worked.map(day => day.dailyRate));
    if (rates.size !== 1) return null;
    const rate = rates.values().next().value;
    if (!(rate > 0)) return null;

    const product = summary.payUnits * rate;
    if (agora(total) !== agora(product)) return null;
    return countedIn(summary.payUnits, 'יום שכר אחד', 'ימי שכר') +
        ` × ${rate.toLocaleString('en-US')} = ${product.toLocaleString('en-US')}`;
}

// "6 ימי שכר · מתוכם 2 ימים כפולים · 3 שעות נוספות", with the parts that are zero left
// out. Written once, so the card, the message and the sheet say it the same way.
function workUnitsLine(summary) {
    const parts = [countedIn(summary.payUnits, 'יום שכר אחד', 'ימי שכר')];
    if (summary.doubleDays > 0) {
        parts.push('מתוכם ' + countedIn(summary.doubleDays, 'יום כפול אחד', 'ימים כפולים'));
    }
    if (summary.extraHours > 0) {
        parts.push(countedIn(summary.extraHours, 'שעה נוספת אחת', 'שעות נוספות'));
    }
    return parts.join(' · ');
}

// Hebrew does not read "1 ימים" the way a template makes it. One of anything gets its own
// wording; everything else gets the number and the plural.
function countedIn(count, one, many) {
    return count === 1 ? one : `${count} ${many}`;
}

function closeWorkerDays() {
    document.getElementById('workerDaysModal').style.display = 'none';
}

function buildTable(headers, bodyRows) {
    const table = el('table', 'report-table');

    const head = el('thead');
    const headRow = el('tr');
    headers.forEach(text => headRow.appendChild(el('th', null, text)));
    head.appendChild(headRow);
    table.appendChild(head);

    const body = el('tbody');
    bodyRows.forEach(cells => {
        const tr = el('tr');
        cells.forEach((cell, index) => tr.appendChild(reportCell(cell, index, headers[index])));
        body.appendChild(tr);
    });
    table.appendChild(body);

    return table;
}

// Zeros are blanked so the eye lands on the numbers that mean something. In a table this
// dense a column of noughts reads as noise, and the person is scanning for what to pay.
function reportCell(value, index, label) {
    const cell = index === 0
        ? el('td', null, String(value))
        : el('td', 'num', isBlankCell(value) ? '' : String(value));

    // Carried on the cell so a phone can drop the header row and print the label beside
    // each number instead. A table this wide only fits by scrolling sideways, and the
    // column that ends up off the edge is the one the whole report is for.
    if (label) cell.setAttribute('data-label', label);
    return cell;
}

function isBlankCell(value) {
    return value === 0 || value === '' || value === undefined || value === null;
}

function totalRow(cells, headers) {
    const foot = el('tfoot');
    const tr = el('tr');
    cells.forEach((cell, index) =>
        tr.appendChild(reportCell(cell, index, headers && headers[index])));
    foot.appendChild(tr);
    return foot;
}

function scrollWrap(node) {
    const wrap = el('div', 'table-scroll');
    wrap.appendChild(node);
    return wrap;
}

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
