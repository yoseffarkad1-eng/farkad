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
    renderOverCapNotice(root);
    root.appendChild(renderPayrollTable());
    root.appendChild(renderInvoiceTable());
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
    actions.appendChild(button('📊 יצוא', 'btn-info', exportReports));
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
    return el('div', 'report-period',
        `${formatFullDate(from)} - ${formatFullDate(to)} · ${days} ימים`);
}

function payrollRows() {
    // Advances keep a row alive on their own: a man who took 500 on the 1st and then
    // worked nothing would otherwise vanish from the sheet - and with him the 500,
    // which next period is out of range too and never deducted anywhere.
    return payrollReport(State.schedule, REPORT_RANGE.from, REPORT_RANGE.to)
        .filter(row => row.attendanceDays > 0 || row.absent > 0 || row.advances > 0);
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

    const headers = ['עובד'].concat(columns.map(column => column.header));
    if (anyRate) headers.push('שכר יומי', 'נצבר');
    if (anyAdvance) headers.push('מקדמות');
    if (anyRate) headers.push('לתשלום');

    const table = buildTable(headers, rows.map(row => {
        const cells = [row.name].concat(columns.map(column => column.value(row)));
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

    const footer = ['סה"כ'].concat(columns.map(column =>
        rows.reduce((sum, row) => sum + column.value(row), 0)));
    if (anyRate) footer.push('', Math.round(totals.amount));
    if (anyAdvance) footer.push(minusAmount(totals.advances));
    if (anyRate) footer.push(bidiAmount(Math.round(totals.amount - totals.advances)));
    table.appendChild(totalRow(footer, headers));

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
            '* לעובד יש שעות נוספות בלי שכר שעה, ולכן הן לא נכללות בסכום.'));
    }

    // A day is paid at the rate it was RECORDED at, so after a raise mid-period the total
    // cannot be checked by multiplying the days by the rate in the column beside it. Said
    // plainly, because a sheet whose arithmetic does not come out reads as a mistake -
    // and the alternative, quietly repaying old days at the new rate, is the mistake.
    const mixed = rows.filter(row => row.mixedRates);
    if (mixed.length > 0) {
        section.appendChild(el('p', 'hint',
            `בתקופה הזו השתנה השכר היומי של ${mixed.map(row => isolate(row.name)).join(', ')}. ` +
            'כל יום מחושב לפי השכר שהיה בזמן שנרשם, ולכן הסכום אינו מספר הימים כפול ' +
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

    // Only the dates this site actually worked. A client's page with a run of empty rows
    // for days their site was closed reads as a mistake.
    const dates = chosen
        ? chosen.days.map(day => day.date)
        : all.dates;

    const headers = ['תאריך'].concat(places.map(place => place.name)).concat(['סה"כ']);
    const body = dates.map(date => {
        const parsed = parseLocalDate(date);
        const counts = places.map(place => all.countAt(place.placeId, date));
        const dayTotal = counts.reduce((sum, n) => sum + n, 0);
        return [`${HEBREW_DAY_NAMES[parsed.getDay()]} ${formatFullDate(parsed)}`]
            .concat(counts).concat([dayTotal]);
    });

    const table = buildTable(headers, body);
    // "ימי-עובד", not "סה"כ". The column adds up how many men were on that site on how
    // many days - four men for three days is twelve - and a bare total under a column of
    // dates gets read as "the site worked twelve days", which is the number a client
    // would be billed on. They are different numbers and only one of them is here.
    table.appendChild(totalRow(
        ['סה"כ ימי-עובד'].concat(places.map(place => place.workerDays))
            .concat([places.reduce((sum, place) => sum + place.workerDays, 0)]),
        headers
    ));

    section.appendChild(scrollWrap(table));
    section.appendChild(el('p', 'hint',
        'כל מספר הוא מספר העובדים שעבדו באתר באותו יום. השורה התחתונה היא ימי-עובד: ' +
        'עובד אחד ביום אחד באתר. היא אינה מספר הימים שהאתר עבד.'));
    return section;
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
        days.forEach(day => body.appendChild(renderWorkerDayRow(day, worker)));
        body.appendChild(renderWorkerDaysTotal(days, worker));
        advances.forEach(item => body.appendChild(renderAdvanceRow(item)));
        if (advances.length > 0) body.appendChild(renderNetRow(days, worker, advances));
    }

    body.appendChild(renderAdvanceAdd(worker));
    document.getElementById('workerDaysModal').style.display = 'flex';
}

// Cash handed over before settlement day. Recorded here, next to the days it will be
// deducted from, because the question it answers - "how much is left" - is asked on this
// screen and nowhere else.
function renderAdvanceRow(item) {
    const row = el('div', 'wday wday-advance');
    const parsed = parseLocalDate(item.date);

    const when = el('div', 'wday-date');
    when.appendChild(el('strong', null, 'מקדמה'));
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

    box.appendChild(button('+ מקדמה', 'btn-secondary', async () => {
        const amount = await askText({
            title: `מקדמה ל${isolate(worker.name)}`,
            message: 'כמה קיבל על החשבון? הסכום יירד מהתשלום בסוף התקופה.',
            placeholder: '500',
            // The digit keyboard, the way every other amount field in the app gets it.
            inputmode: 'decimal',
            dir: 'ltr',
            ok: 'שמור',
            validate: value => {
                const number = Number(value);
                if (!value || isNaN(number) || number <= 0) return 'הכנס סכום גדול מאפס.';
                return null;
            }
        });
        if (amount === null) return;

        // Dated today when today falls inside the period being viewed, and otherwise on
        // the period's last day - an advance filed outside the account it belongs to
        // would be deducted from the wrong fortnight.
        const today = todayStr();
        const date = (today >= REPORT_RANGE.from && today <= REPORT_RANGE.to)
            ? today : REPORT_RANGE.to;

        State.commit(addAdvance(State.schedule, worker.id, date, Number(amount), ''));
        openWorkerDays(worker.id);
    }));

    box.appendChild(button('💬 שלח לעובד', 'btn-success', () => shareWorkerStatement(worker.id)));
    return box;
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
                return hours ? `${name} (+${hours} ש׳)` : `${name} (נוספות)`;
            }
            return name;
        }).join(' + ');

        lines.push(`• ${when} - ${where}${priced && day.amount !== null ? ` - ${Math.round(day.amount)}` : ''}`);
    });

    lines.push('');
    // Both numbers, in the message the man actually receives. He is the one person who
    // will check the total against the days, and one count could not explain it.
    const summary = workerDaysSummary(days);
    lines.push('סה"כ ' + countedIn(summary.attendanceDays, 'יום נוכחות אחד', 'ימי נוכחות'));
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
                tag.appendChild(el('span', 'tag-rate', hours ? `+${hours}` : 'נוספות'));
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
    row.appendChild(el('div', 'wday-what', workUnitsLine(summary)));
    row.appendChild(el('div', 'wday-money',
        Number(worker.dailyRate) > 0 ? String(Math.round(total)) : '—'));
    return row;
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

function reportSheets() {
    // The exported columns say the SAME thing as the screen, under the same headings.
    // This file is the one that reaches the bookkeeper, and it used to write the gross
    // amount under 'לתשלום' - the heading the screen uses for the net - so the two
    // disagreed by exactly the advances, and the paper won.
    const payroll = [['עובד', 'ימי נוכחות', 'ימי שכר', 'מתוכם כפולים', 'שעות נוספות',
        'נעדר', 'שכר יומי', 'נצבר', 'מקדמות', 'לתשלום', 'הערה']]
        .concat(payrollRows().map(row => [
            row.name, row.attendanceDays, row.payUnits, row.doubleDays,
            row.extraHours, row.absent, row.dailyRate,
            row.amount === null ? '' : Math.round(row.amount),
            row.advances > 0 ? -Math.round(row.advances) : 0,
            row.netAmount === null ? '' : Math.round(row.netAmount),
            row.hoursUnpriced ? 'שעות נוספות בלי שכר שעה - לא נכללו' : ''
        ]));

    const invoice = invoiceByDate(State.schedule, REPORT_RANGE.from, REPORT_RANGE.to);
    // The export follows the same choice as the screen: exporting every site while the
    // screen shows one would send the client a file about four sites.
    const chosen = invoice.places.find(p => p.placeId === INVOICE_PLACE);
    const places = chosen ? [chosen] : invoice.places;
    const dates = chosen ? chosen.days.map(day => day.date) : invoice.dates;

    const invoiceRowsOut = [['תאריך'].concat(places.map(p => p.name)).concat(['סה"כ'])];
    dates.forEach(date => {
        const counts = places.map(p => invoice.countAt(p.placeId, date));
        invoiceRowsOut.push([date].concat(counts).concat([counts.reduce((a, b) => a + b, 0)]));
    });
    invoiceRowsOut.push(['סה"כ'].concat(places.map(p => p.workerDays))
        .concat([places.reduce((sum, p) => sum + p.workerDays, 0)]));

    return { payroll, invoice: invoiceRowsOut, detail: detailRows() };
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
    const sheets = reportSheets();

    await loadXlsx();

    // Falls back to CSV rather than failing when the SheetJS CDN is unreachable - which
    // on a building site is a normal Tuesday, not an exception.
    if (typeof XLSX === 'undefined') {
        downloadCsv(sheets.payroll, `שכר_${stamp}.csv`);
        downloadCsv(sheets.invoice, `חיוב_${stamp}.csv`);
        downloadCsv(sheets.detail, `פירוט_${stamp}.csv`);
        askTell('ספריית Excel לא נטענה, ולכן הקבצים יוצאו כ-CSV.');
        return;
    }

    try {
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheets.payroll), 'שכר');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheets.invoice), 'חיוב');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheets.detail), 'פירוט');
        XLSX.writeFile(wb, `דוחות_${stamp}.xlsx`);
    } catch (error) {
        console.error('Report export failed:', error);
        askTell('אירעה שגיאה בזמן היצוא.');
    }
}
