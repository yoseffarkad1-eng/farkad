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
        // Says the next move, not only the absence. An empty week is the one moment a
        // person cannot tell a fresh install from a broken app, and this screen is one a
        // phone may well open on first. Named in the same voice the roster uses.
        root.appendChild(emptyHint('אין עובדים להצגה. הוסף עובד במסך עובדים ואתרים.'));
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

    // ONE MAP FOR THE WHOLE GRID, built here rather than inside renderWeekCell.
    //
    // placeLabelsIn walks every day in the schedule (js/model/schema.js). renderWeekCell
    // called it for every filled cell, and a week of thirty people is up to two hundred and
    // ten cells - eighty-one walks of the record to draw one screen, measured, which is
    // 36.1ms on a season against 2.2ms for the day screen beside it. tests/perf.test.mjs
    // counts the calls as well as the clock, because a cheaper map would hide this from the
    // clock and not from the count.
    //
    // Safe because nothing touches the schedule between the first cell and the last. NOT
    // held across draws - tests/labelcache.test.mjs pins that this grid follows a site
    // rename immediately, and a map kept from the last render is what would stop it.
    const labels = placeLabelsIn(State.schedule);

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
            row.appendChild(renderWeekCell(worker, date, labels));
        });

        body.appendChild(row);
    });
    table.appendChild(body);
    table.appendChild(renderWeekTotals(dates, workers));

    const wrap = el('div', 'table-scroll');
    wrap.appendChild(table);

    // A BOX THE SCROLL CUE CAN HANG ON, and it has to be outside the scroller.
    //
    // At 390 and below the week is wider than the screen - 88px of names and seven 48px
    // days are 424 - so Thursday sits off the LEFT edge at rest, this being a
    // right-to-left strip. The pitch is deliberate and stays; what was missing was any
    // sign that the strip could be pushed at all. A fade drawn INSIDE .table-scroll would
    // scroll away with the table, so the mark lives on a wrapper that does not move.
    // css/app.css draws it, and only where the strip actually overflows.
    const strip = el('div', 'week-strip');
    strip.appendChild(wrap);
    root.appendChild(strip);

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

// `labels` is the grid's one site-label map, built once by renderWeek above and handed down
// so the record is not walked once per cell.
//
// OPTIONAL, and the fallback is not tidiness. placeLabelFrom answers a missing map with
// 'אתר שאינו ברשימה' rather than throwing, so a caller that forgot to hand one down would
// draw a whole week in which every site has lost its name - silently, and on the screen the
// crew reads a week off. A cell that can find the map itself cannot fail that way.
function renderWeekCell(worker, date, labels) {
    const map = labels || placeLabelsIn(State.schedule);
    const cell = el('td', 'week-cell');
    if (parseLocalDate(date).getDay() === 6) cell.classList.add('col-rest');

    // WHAT THE CELL SAYS, gathered as it is drawn.
    //
    // The label below is on a role="button", and a label overrides the element's
    // contents: the browser reports this cell as a LEAF - childIds 0, measured - so
    // whatever is not in this list is not on the screen at all for anybody who is not
    // looking at the picture. The label used to be a template that knew the man and the
    // date, so a fortnight of work read as thirty identical "who and when", an absence
    // announced exactly like a blank Tuesday, and a doubled day like an ordinary one.
    //
    // Built here, beside the block it describes, rather than from a template - the fault
    // was a template that knew two of the three facts the block is painted from. Nothing
    // in it is a new word: נעדר, כפול and the hours badge are the cell's own text.
    const said = [];

    if (isAbsent(State.schedule, date, worker.id, State.layer)) {
        cell.classList.add('cell-absent');
        cell.textContent = 'נעדר';
        said.push('נעדר');
    } else {
        const entries = entriesFor(State.schedule, date, worker.id, State.layer);
        if (entries.length > 0) {
            cell.classList.add('cell-filled');
            entries.forEach(entry => {
                // The same badge the day screen uses. This grid is read across a whole
                // week at once, which is precisely where a colour beats reading a name in
                // every cell - and where two different sites must not look alike.
                const line = el('div', 'cell-line tag tag-place');
                const place = placeLabelFrom(map, entry.placeId);
                appendSiteName(line, entry.placeId, place);
                paintSite(line, entry.placeId);

                const rate = entryRate(entry);
                // The classes exist for the phone's colour map, where there is no room
                // for the word: a doubled day carries a white dot, extra hours a plus.
                let word = '';
                if (rate === RATE_DOUBLE) {
                    line.classList.add('cell-double');
                    word = 'כפול';
                    line.appendChild(el('span', 'tag-rate', word));
                } else if (rate === RATE_EXTRA) {
                    const hours = entryExtraHours(entry);
                    line.classList.add('cell-extra');
                    word = hours ? plusAmount(hours) : 'נוספות';
                    line.appendChild(el('span', 'tag-rate', word));
                }
                // isolate(), for the reason js/ui/dom.js gives and this label was the one
                // place in the app that did not: a site called "B7" is a left-to-right run
                // inside a right-to-left sentence, and unisolated it slides across the
                // words around it.
                said.push(word ? `${isolate(place)} ${word}` : isolate(place));
                cell.appendChild(line);
            });
        }
    }

    cell.tabIndex = 0;
    cell.setAttribute('role', 'button');
    // Without a name an empty cell announces as "button" and nothing else - the reader
    // hears thirty of those per week. The name says whose day it opens, and everything
    // gathered above says what is on it.
    const who = `${isolate(worker.name)} · ${hebrewDayName(parseLocalDate(date))} `
        + `${formatFullDate(parseLocalDate(date))}`;
    cell.setAttribute('aria-label', said.length ? `${who} · ${said.join(' · ')}` : who);
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
