// The week grid, kept for the one thing it is genuinely good at: seeing the whole week as
// a picture, and printing it.
//
// It is deliberately read-only. A cell can hold two sites and a rate now, and a grid cell
// cannot show or edit that without losing something - so tapping a cell jumps to that day
// in the day view, where the full record fits. Editing here would quietly discard the
// second site.

let weekStart = null;

function currentWeekStart() {
    if (!weekStart) weekStart = toLocalDateStr(snapToWeekStart(parseLocalDate(State.date)));
    return weekStart;
}

function setWeekFromDate(date) {
    weekStart = toLocalDateStr(snapToWeekStart(parseLocalDate(date)));
}

function weekDates() {
    const start = parseLocalDate(currentWeekStart());
    const dates = [];
    for (let i = 0; i < 7; i++) {
        const date = new Date(start);
        date.setDate(start.getDate() + i);
        dates.push(toLocalDateStr(date));
    }
    return dates;
}

function renderWeek() {
    const root = document.getElementById('weekView');
    if (!root) return;

    clear(root);
    root.appendChild(renderWeekHeader());

    const dates = weekDates();
    const workers = weekWorkers(dates);

    if (workers.length === 0) {
        root.appendChild(emptyHint('אין עובדים להצגה.'));
        return;
    }

    const table = el('table', 'week-table');

    const head = el('thead');
    const headRow = el('tr');
    const corner = el('th', 'corner');
    corner.appendChild(el('span', 'name-clip', 'עובדים / ימים'));
    headRow.appendChild(corner);
    dates.forEach(date => {
        const parsed = parseLocalDate(date);
        const th = el('th');
        // Saturday is the rest day; its column stays, greyed, so the week keeps its
        // shape - a six-column week would make every other day jump position.
        if (parsed.getDay() === 6) th.classList.add('col-rest');
        // Both forms are in the cell; the stylesheet decides which fits the screen.
        th.appendChild(el('div', 'day-full', HEBREW_DAY_NAMES[parsed.getDay()]));
        th.appendChild(el('div', 'day-initial', HEBREW_DAY_LETTERS[parsed.getDay()]));
        th.appendChild(el('small', null, `${String(parsed.getDate()).padStart(2, '0')}/${String(parsed.getMonth() + 1).padStart(2, '0')}`));
        headRow.appendChild(th);
    });
    head.appendChild(headRow);
    table.appendChild(head);

    const body = el('tbody');
    workers.forEach(worker => {
        const row = el('tr');
        // THE NAME, IN A BOX OF ITS OWN.
        //
        // Not text straight in the cell. The week table is laid out `auto` so that the day
        // columns can hold their 44px floor, and auto layout sizes a column to its widest
        // CONTENT - so one long name pushed the pinned first column to 305px inside a
        // 296px box and left zero of seven days on the screen. overflow and text-overflow
        // on the cell did nothing about it: they clip what is drawn, they do not tell the
        // column how wide to be.
        //
        // A block inside the cell with a max-width does. The column is then bounded by
        // this element, the name is ellipsised, and the days get the rest of the screen.
        const name = el('td', 'name-cell');
        const clip = el('span', 'name-clip', worker.name);
        // The whole name is still available - to a finger that holds it, and to a screen
        // reader, which must never be handed "מוחמד עבד אל…". Ellipsis is a drawing
        // decision and it may not become a data one.
        clip.title = worker.name;
        name.setAttribute('aria-label', worker.name);
        name.appendChild(clip);
        // Said plainly, because a name in a week they worked and a name on the current
        // roster are two different statements.
        if (worker.active === false) name.appendChild(el('span', 'badge', 'לא פעיל'));
        row.appendChild(name);

        dates.forEach(date => {
            row.appendChild(renderWeekCell(worker, date));
        });

        body.appendChild(row);
    });
    table.appendChild(body);
    table.appendChild(renderWeekTotals(dates, workers));

    const wrap = el('div', 'table-scroll');
    wrap.appendChild(table);
    root.appendChild(wrap);

    root.appendChild(renderWeekLegend());
    root.appendChild(el('p', 'week-legend-note',
        '\u25CF = יום כפול \u00B7 + = שעות נוספות \u00B7 \u2014 = נעדר'));
    root.appendChild(el('p', 'hint', 'לחיצה על יום פותחת אותו במסך היום לעריכה.'));
}

// On a phone the whole week fits on one screen because the cells shrink to the site's
// colour alone - and this legend is what maps a colour back to a name there. On a
// desktop the names are written inside the cells and the legend stays hidden.
function renderWeekLegend() {
    const legend = el('div', 'week-legend');
    State.activePlaces().forEach(place => {
        const chip = el('span', 'tag tag-place');
        appendSiteName(chip, place.id, place.name);
        paintSite(chip, place.id);
        legend.appendChild(chip);
    });
    return legend;
}

// Everyone on the roster now, plus anyone archived who actually worked in this week.
//
// The grid used to show active workers only, so archiving somebody removed them from
// weeks they had already worked - the record was intact underneath, and the picture of
// that week silently stopped matching it. This screen is read as history; history does
// not change when a person leaves.
function weekWorkers(dates) {
    return State.schedule.workers.filter(worker => {
        if (worker.active !== false) return true;
        return dates.some(date =>
            isAbsent(State.schedule, date, worker.id, State.layer) ||
            entriesFor(State.schedule, date, worker.id, State.layer).length > 0);
    });
}

// One row under the grid: how many people were out on each day of the week. It answers
// the question the grid is usually opened for - "was Tuesday a big day?" - without
// counting down a column by eye.
function renderWeekTotals(dates, workers) {
    const foot = el('tfoot');
    const row = el('tr');
    const total = el('td', 'name-cell');
    total.appendChild(el('span', 'name-clip', 'סה"כ עובדים'));
    row.appendChild(total);

    dates.forEach(date => {
        const count = workers.filter(worker =>
            !isAbsent(State.schedule, date, worker.id, State.layer) &&
            entriesFor(State.schedule, date, worker.id, State.layer).length > 0).length;
        row.appendChild(el('td', 'week-total', count > 0 ? String(count) : ''));
    });

    foot.appendChild(row);
    return foot;
}

function renderWeekCell(worker, date) {
    const cell = el('td', 'week-cell');
    if (parseLocalDate(date).getDay() === 6) cell.classList.add('col-rest');

    if (isAbsent(State.schedule, date, worker.id, State.layer)) {
        cell.classList.add('cell-absent');
        cell.textContent = 'נעדר';
    } else {
        const entries = entriesFor(State.schedule, date, worker.id, State.layer);
        if (entries.length > 0) {
            cell.classList.add('cell-filled');
            const labels = placeLabelsIn(State.schedule);
            entries.forEach(entry => {
                // The same badge the day screen uses. This grid is read across a whole
                // week at once, which is precisely where a colour beats reading a name in
                // every cell - and where two different sites must not look alike.
                const line = el('div', 'cell-line tag tag-place');
                appendSiteName(line, entry.placeId, placeLabelFrom(labels, entry.placeId));
                paintSite(line, entry.placeId);

                const rate = entryRate(entry);
                // The classes exist for the phone's colour map, where there is no room
                // for the word: a doubled day carries a white dot, extra hours a plus.
                if (rate === RATE_DOUBLE) {
                    line.classList.add('cell-double');
                    line.appendChild(el('span', 'tag-rate', 'כפול'));
                } else if (rate === RATE_EXTRA) {
                    const hours = entryExtraHours(entry);
                    line.classList.add('cell-extra');
                    line.appendChild(el('span', 'tag-rate', hours ? plusAmount(hours) : 'נוספות'));
                }
                cell.appendChild(line);
            });
        }
    }

    cell.tabIndex = 0;
    cell.setAttribute('role', 'button');
    // Without a name an empty cell announces as "button" and nothing else - the reader
    // hears thirty of those per week. The name says whose day it opens.
    cell.setAttribute('aria-label',
        `${worker.name} · ${hebrewDayName(parseLocalDate(date))} ${formatFullDate(parseLocalDate(date))}`);
    const open = () => { State.date = date; showView('day'); };
    cell.addEventListener('click', open);
    cell.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
    });

    return cell;
}

function renderWeekHeader() {
    const header = el('div', 'week-header');

    const back = button('שבוע קודם', 'btn-secondary btn-nav nav-back', () => stepWeek(-7));
    back.insertBefore(chevronIcon('back'), back.firstChild);
    header.appendChild(back);

    const dates = weekDates();
    const first = parseLocalDate(dates[0]);
    const last = parseLocalDate(dates[6]);
    // Each date is one LTR run and the pair sits in an RTL element: the bidi algorithm
    // keeps each date readable but lays the two out right to left, so the range showed
    // its end first. Isolating EACH date (FSI/PDI around each, which is what this did)
    // does not change that - two isolates are still two runs, ordered by the paragraph.
    // dateRange (js/ui/dom.js) wraps the pair as ONE left-to-right run.
    header.appendChild(el('strong', 'week-range',
        dateRange(formatFullDate(first), formatFullDate(last))));

    const fwd = button('שבוע הבא', 'btn-secondary btn-nav nav-fwd', () => stepWeek(7));
    fwd.appendChild(chevronIcon('fwd'));
    header.appendChild(fwd);
    header.appendChild(button('השבוע', 'btn-secondary', () => { setWeekFromDate(todayStr()); render(); }));

    // Not window.print() bare. On the home-screen app on an iPhone that call opens
    // nothing and says nothing; printWithFallback (js/ui/printout.js) still makes it,
    // listens for the sheet, and offers the grid as a picture when no sheet came.
    header.appendChild(button('🖨️ הדפסה', 'btn-success', () => printWithFallback('week')));
    // And the picture on its own button, always. The person on a site sends pictures on
    // WhatsApp, not PDFs, and the print button's offer arrives a second and a half after
    // a tap that did nothing - this is the door for somebody who already knows that.
    header.appendChild(button('🖼️ שיתוף כתמונה', 'btn-secondary', () => sharePrintout('week')));

    return header;
}

function stepWeek(days) {
    const start = parseLocalDate(currentWeekStart());
    start.setDate(start.getDate() + days);
    weekStart = toLocalDateStr(start);
    render();
}
