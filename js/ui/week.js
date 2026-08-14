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
    headRow.appendChild(el('th', 'corner', 'עובדים / ימים'));
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
        const name = el('td', 'name-cell', worker.name);
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
    row.appendChild(el('td', 'name-cell', 'סה"כ עובדים'));

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
            entries.forEach(entry => {
                const place = State.place(entry.placeId);
                // The same badge the day screen uses. This grid is read across a whole
                // week at once, which is precisely where a colour beats reading a name in
                // every cell - and where two different sites must not look alike.
                const line = el('div', 'cell-line tag tag-place');
                appendSiteName(line, entry.placeId, place ? place.name : entry.placeId);
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
                    line.appendChild(el('span', 'tag-rate', hours ? `+${hours}` : 'נוספות'));
                }
                cell.appendChild(line);
            });
        }
    }

    cell.tabIndex = 0;
    cell.setAttribute('role', 'button');
    const open = () => { State.date = date; showView('day'); };
    cell.addEventListener('click', open);
    cell.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
    });

    return cell;
}

function renderWeekHeader() {
    const header = el('div', 'week-header');

    header.appendChild(button('שבוע קודם', 'btn-secondary btn-nav nav-back', () => stepWeek(-7)));

    const dates = weekDates();
    const first = parseLocalDate(dates[0]);
    const last = parseLocalDate(dates[6]);
    header.appendChild(el('strong', 'week-range',
        `${formatFullDate(first)} - ${formatFullDate(last)}`));

    header.appendChild(button('שבוע הבא', 'btn-secondary btn-nav nav-fwd', () => stepWeek(7)));
    header.appendChild(button('השבוע', 'btn-secondary', () => { setWeekFromDate(todayStr()); render(); }));

    header.appendChild(button('🖨️ הדפסה', 'btn-success', () => window.print()));

    return header;
}

function stepWeek(days) {
    const start = parseLocalDate(currentWeekStart());
    start.setDate(start.getDate() + days);
    weekStart = toLocalDateStr(start);
    render();
}
