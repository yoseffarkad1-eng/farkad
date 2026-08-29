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

    // Both sections are built and both are in the DOM, whichever is chosen: the print
    // stylesheet prints the record, not the screen's current answer to it. The one not
    // being looked at is set aside on screen only.
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
    actions.appendChild(el('strong', 'range-current',
        `${formatFullDate(parseLocalDate(REPORT_RANGE.from))} - ${formatFullDate(parseLocalDate(REPORT_RANGE.to))}`));
    actions.appendChild(button('🖨️ הדפסה', 'btn-success', () => window.print()));
    // The button says what will come out of it. With one client's site chosen the file
    // is that client's billing sheet and nothing else (see reportSheets), and a button
    // still reading "יצוא" would promise the usual workbook and quietly hand over less.
    const client = scopedExportPlace();
    actions.appendChild(button(
        client ? `📊 יצוא חיוב - ${isolate(client.name)}` : '📊 יצוא',
        'btn-info', exportReports));
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
    return el('div', 'report-period',
        `${formatFullDate(from)} - ${formatFullDate(to)} · ${length}`);
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
    return payrollReport(State.schedule, REPORT_RANGE.from, REPORT_RANGE.to)
        .filter(row => row.attendanceDays > 0 || row.absent > 0 || row.advances > 0
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
    const anyAdvance = rows.some(row => row.advances > 0);

    // Vehicles get their own two columns, on the same rule as the advances: they appear
    // once somebody owns one that went out. Two columns and not one, because the days and
    // the money answer different questions - and separate from the day rate, because a
    // vehicle is paid for going out and the man's day is paid for his working. Adding
    // them together is how five days at 450 comes to 3750 and explains nothing.
    const anyVehicle = vehiclesEnabled() && rows.some(row => row.vehicleDays > 0);

    const headers = ['עובד'].concat(columns.map(column => column.header));
    if (anyVehicle) headers.push('ימי רכב', 'שכר רכב');
    if (anyRate) headers.push('שכר יומי', 'נצבר');
    if (anyAdvance) headers.push('מקדמות');
    if (anyRate) headers.push('לתשלום');

    const table = buildTable(headers, rows.map(row => {
        const cells = [row.name].concat(columns.map(column => column.value(row)));
        if (anyVehicle) cells.push(row.vehicleDays || 0, Math.round(row.vehicleAmount || 0));
        if (anyRate) {
            cells.push(row.dailyRate);
            // null, not 0: a worker whose rate was never entered owes an unknown amount,
            // which is a different statement from owing nothing.
            cells.push(row.amount === null ? '—'
                : Math.round(row.amount) + (row.hoursUnpriced ? ' *' : ''));
        }
        if (anyAdvance) cells.push(row.advances > 0 ? minusAmount(row.advances) : 0);
        if (anyRate) {
            // The * follows the money onto the number actually paid.
            cells.push(row.netAmount === null ? '—'
                : bidiAmount(Math.round(row.netAmount)) + (row.hoursUnpriced ? ' *' : ''));
        }
        return cells;
    }));

    // The three money columns must reconcile: נצבר − מקדמות = לתשלום, on the same rows.
    // Summing per-row nets instead used to let an unpriced worker's advance into one
    // column and not the other, and the footer contradicted itself.
    const totals = rows.reduce((sum, row) => ({
        amount: sum.amount + (row.amount || 0),
        advances: sum.advances + (row.advances || 0)
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
    if (anyRate) footer.push('', Math.round(totals.amount));
    if (anyAdvance) footer.push(minusAmount(totals.advances));
    if (anyRate) footer.push(bidiAmount(Math.round(totals.amount - totals.advances)));
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
    const body = dates.map(date => {
        const parsed = parseLocalDate(date);
        const counts = places.map(place => all.countAt(place.placeId, date));
        const dayTotal = counts.reduce((sum, n) => sum + n, 0);
        return [`${HEBREW_DAY_NAMES[parsed.getDay()]} ${formatFullDate(parsed)}`]
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
            // Where this block is headed. The ledger model is written and gated off;
            // when it opens, nothing about these numbers changes - only their record.
            body.appendChild(el('p', 'hint wday-bridge',
                'במודל v80 השורה "מקדמות" בפירוט השכר הופכת לתנועת "נוכה מהשכר" ' +
                'בסגירת תקופה — אותם סכומים, היסטוריה מלאה.'));
        }
    }

    // After the period's advances: the whole record of them, folded shut. Read-only by
    // construction - see renderWorkerLedger.
    const ledger = renderWorkerLedger(worker.id);
    if (ledger) body.appendChild(ledger);

    body.appendChild(renderAdvanceAdd(worker));
    document.getElementById('workerDaysModal').style.display = 'flex';
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

// Cash handed over before settlement day. Recorded here, next to the days it will be
// deducted from, because the question it answers - "how much is left" - is asked on this
// screen and nowhere else.
function renderAdvanceRow(item) {
    const row = el('div', 'wday wday-advance');
    const parsed = parseLocalDate(item.date);

    const when = el('div', 'wday-date');
    when.appendChild(el('strong', null,
        Object.prototype.hasOwnProperty.call(ADVANCE_METHOD_LABELS, item.method)
            ? ADVANCE_METHOD_LABELS[item.method] : 'מקדמה'));
    when.appendChild(el('span', null, formatFullDate(parsed)));
    row.appendChild(when);

    const what = el('div', 'wday-what');
    if (item.note) what.appendChild(el('span', 'wday-note', item.note));
    what.appendChild(button('✕', 'btn-icon', () => removeAdvanceRow(item), 'מחק מקדמה'));
    row.appendChild(what);

    row.appendChild(el('div', 'wday-money', minusAmount(item.amount)));
    return row;
}

function renderNetRow(days, worker, advances) {
    const earned = days.filter(day => !day.absent)
        .reduce((sum, day) => sum + (day.amount || 0), 0);
    const taken = advances.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

    const row = el('div', 'wday wday-total wday-net');
    row.appendChild(el('div', 'wday-date', 'נותר לתשלום'));
    row.appendChild(el('div', 'wday-what',
        `${Math.round(earned)} נצבר · ${Math.round(taken)} מקדמות`));
    row.appendChild(el('div', 'wday-money',
        Number(worker.dailyRate) > 0 ? bidiAmount(Math.round(earned - taken)) : '—'));
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

        const change = addAdvance(State.schedule, worker.id, date, amount,
            noteInput.value.trim());
        // On the record object itself, before the commit, so the journal entry and the
        // saved schedule carry it together.
        change.value.method = method;
        if (!State.commit(change)) return;
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

async function removeAdvanceRow(item) {
    const ok = await askConfirm({
        title: 'למחוק את המקדמה?',
        message: `${Math.round(item.amount)} ₪ מ-${formatFullDate(parseLocalDate(item.date))}.`,
        ok: 'מחק'
    });
    if (!ok) return;
    State.commit(removeAdvance(State.schedule, item.id));
    openWorkerDays(item.workerId);
}

// What a ledger entry IS, in the ledger's own three words. Not the method labels above:
// a kind says what happened to the record, not how money moved.
const LEDGER_KIND_LABELS = { given: 'מקדמה', corrected: 'תיקון', cancelled: 'בוטל' };

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
    fold.appendChild(el('summary', null, 'היסטוריה מלאה (פנקס v80)'));
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
        entry.amount !== undefined && isFinite(amount) ? bidiAmount(Math.round(amount)) : ''));

    if (entry.note) row.appendChild(el('div', 'ledger-note', entry.note));
    if (entry.origin === 'migration') {
        row.appendChild(el('div', 'ledger-origin', 'הועתק מהרישום הקיים'));
    }
    return row;
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
    const taken = advances.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const priced = Number(worker.dailyRate) > 0;

    const lines = [
        `📄 ${isolate(worker.name)} - ${formatFullDate(parseLocalDate(REPORT_RANGE.from))} עד ${formatFullDate(parseLocalDate(REPORT_RANGE.to))}`,
        ''
    ];

    days.forEach(day => {
        const parsed = parseLocalDate(day.date);
        const when = `${HEBREW_DAY_NAMES[parsed.getDay()]} ${formatShortDate(parsed)}`;
        if (day.absent) { lines.push(`• ${when} - נעדר`); return; }

        const where = day.entries.map(entry => {
            const place = State.place(entry.placeId);
            const name = place ? place.name : entry.placeId;
            const rate = entryRate(entry);
            if (rate === RATE_DOUBLE) return `${name} (כפול)`;
            if (rate === RATE_EXTRA) {
                const hours = entryExtraHours(entry);
                return hours ? `${name} (${plusAmount(hours)} ש׳)` : `${name} (נוספות)`;
            }
            return name;
        }).join(' + ');

        lines.push(`• ${when} - ${where}${priced && day.amount !== null ? ` - ${Math.round(day.amount)}` : ''}`);
    });

    lines.push('');
    // Both numbers, in the message the man actually receives. He is the one person who
    // will check the total against the days, and one count could not explain it.
    const summary = workerDaysSummary(days);
    lines.push('סה״כ ' + countedIn(summary.attendanceDays, 'יום נוכחות אחד', 'ימי נוכחות'));
    lines.push(workUnitsLine(summary));
    if (priced) lines.push(`נצבר: ${Math.round(earned)}`);

    // The screen puts a * on unpriced hours and the sheet explains it; the message the
    // worker actually receives must not be the one place that pretends the number is
    // complete.
    if (priced && days.some(day => !day.absent && day.extraHours > 0)
        && !(Number(worker.hourlyRate) > 0)) {
        lines.push('');
        lines.push('* שעות נוספות בלי שכר שעה - לא נכללו בסכום.');
    }

    if (advances.length > 0) {
        lines.push('');
        advances.forEach(item => lines.push(
            `מקדמה ${formatShortDate(parseLocalDate(item.date))}: ${minusAmount(item.amount)}`));
    }

    if (priced) {
        lines.push('');
        lines.push(`נותר לתשלום: ${bidiAmount(Math.round(earned - taken))}`);
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
        day.entries.forEach(entry => {
            const place = State.place(entry.placeId);
            const tag = el('span', 'tag tag-place');
            appendSiteName(tag, entry.placeId, place ? place.name : entry.placeId);
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
        money.textContent = day.amount === null ? '—' : String(Math.round(day.amount));
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
        knowsMoney ? String(Math.round(total)) : '—'));
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
    if (Math.round(total) !== product) return null;
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
        .concat(['שכר יומי', 'נצבר', 'מקדמות', 'לתשלום', 'הערה']);

    return [headers].concat(payrollRows().map(row => [
        row.name, row.attendanceDays, row.payUnits, row.doubleDays,
        row.extraHours, row.absent
    ].concat(withVehicles
        ? [row.vehicleDays || 0, Math.round(row.vehicleAmount || 0)]
        : []
    ).concat([
        row.dailyRate,
        row.amount === null ? '' : Math.round(row.amount),
        row.advances > 0 ? -Math.round(row.advances) : 0,
        row.netAmount === null ? '' : Math.round(row.netAmount),
        row.hoursUnpriced ? 'שעות נוספות בלי שכר שעה - לא נכללו' : ''
    ])));
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
                    const place = State.place(entry.placeId);
                    rows.push([
                        day.date,
                        HEBREW_DAY_NAMES[parsed.getDay()],
                        worker.name,
                        place ? place.name : entry.placeId,
                        RATE_LABELS[entryRate(entry)],
                        entryExtraHours(entry) || '',
                        index === 0 ? (day.amount === null ? '' : Math.round(day.amount)) : ''
                    ]);
                });
            });
    });

    return rows;
}

// SheetJS, fetched only when somebody actually asks for a spreadsheet.
//
// It used to be a plain script tag in the head, which is the most expensive place a
// third-party library can be: synchronous, before anything on the page, and on a slow
// mobile connection it does not fail so much as sit there - taking the whole app down
// with it for a feature used once a fortnight. Nothing is loaded now until the export
// button is pressed, and if it does not arrive in a few seconds the CSV path takes over,
// which is the same fallback as before and produces the same numbers.
const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
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

async function exportReports() {
    const stamp = `${REPORT_RANGE.from}_${REPORT_RANGE.to}`;
    const client = scopedExportPlace();
    const sheets = reportSheets();

    await loadXlsx();

    // Falls back to CSV rather than failing when the SheetJS CDN is unreachable - which
    // on a building site is a normal Tuesday, not an exception. The client-scoped
    // export stays scoped here too: only the billing sheet exists to fall back to.
    if (typeof XLSX === 'undefined') {
        if (sheets.payroll) downloadCsv(sheets.payroll, `שכר_${stamp}.csv`);
        downloadCsv(sheets.invoice, `חיוב_${stamp}.csv`);
        if (sheets.detail) downloadCsv(sheets.detail, `פירוט_${stamp}.csv`);
        askTell(client
            ? 'ספריית Excel לא נטענה, ולכן קובץ החיוב יוצא כ-CSV.'
            : 'ספריית Excel לא נטענה, ולכן הקבצים יוצאו כ-CSV.');
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
        XLSX.writeFile(wb, client ? `חיוב_${stamp}.xlsx` : `דוחות_${stamp}.xlsx`);
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
