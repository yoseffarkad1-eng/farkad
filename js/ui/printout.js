// The table as a picture, for the phone where window.print() opens nothing.
//
// On an iPhone with the app on the home screen, window.print() has for years either not
// opened the print sheet or opened an empty one. There is no error and nothing on the
// screen: the person taps «🖨️ הדפסה» and nothing happens. "Open it in Safari" is not an
// answer there - the home-screen app's localStorage is its own partition, and the phone
// that reported this held thirty-eight unsent records in it.
//
// So the print button still prints where printing works, and where it does not, the
// same table goes out as a PNG through the share sheet - which on a building site is
// how anything is sent anyway. Two rules hold everything here together:
//
//   - THE PICTURE IS READ OFF THE DOM, never off the schedule. One day has one price on
//     every surface (tests/money.display.test.mjs), and a picture drawn from the record
//     by a second arithmetic is a second surface that can disagree. What is drawn is
//     the text in the cells, the chip colours the screen computed, the marks the classes
//     carry - exactly what the screen shows, nothing it does not.
//   - NOTHING HERE WAITS. The share sheet needs a user gesture, and on Safari the
//     gesture does not survive an await: the canvas is drawn, encoded with toDataURL
//     and turned into a Blob synchronously, inside the tap that asked for it. A
//     toBlob callback would have been cleaner and would have lost the gesture.
//
// Classic script on the global scope, like every other UI file. It is called from the
// print buttons in js/ui/week.js and js/ui/reports.js and touches nothing at load.

// How long the page waits for the browser to say the print sheet opened. Chrome and
// Firefox fire beforeprint synchronously inside window.print(); Safari fires it when
// the sheet appears; the home-screen app fires nothing at all, which is the case this
// file exists for. A second and a half is long enough for a slow phone to open a real
// sheet and short enough that "nothing happened" is answered before the person taps
// the button again.
const PRINT_SHEET_WAIT_MS = 1500;

// The long side of the bitmap. iOS caps a canvas at about sixteen million pixels, and a
// crew of thirty at three device pixels per CSS pixel would pass it - the scale drops
// instead of the drawing failing. 4096 is also what WhatsApp keeps of a picture anyway.
const PRINTOUT_MAX_SIDE = 4096;

// THE SENTENCES, written once. Pinned verbatim by tests/smoke.mjs.
const PRINTOUT_OFFER = 'ההדפסה לא נפתחה במסך הזה. לשתף את הטבלה כתמונה?';
const PRINTOUT_CHOICE_IMAGE = 'שיתוף כתמונה';
const PRINTOUT_CHOICE_CANCEL = 'ביטול';
const PRINTOUT_NO_WAY_OUT = 'אי אפשר לשתף או לשמור תמונה במכשיר הזה.';
const PRINTOUT_NOTHING_TO_DRAW = 'אין טבלה להדפסה במסך הזה.';

// The paper's own colours, fixed, whatever the screen's scheme. The print stylesheet
// prints black on white in dark mode too; a picture that carried the dark theme's
// #171d25 background into a WhatsApp chat would be a screenshot, not a printout. Only
// the site chips keep the colour the screen computed for them - the colour IS the data
// there, and the legend under the grid is read against it.
const PRINTOUT_PAPER = {
    background: '#ffffff',
    ink: '#17202b',
    ink2: '#4d5a69',
    ink3: '#7a8797',
    line: '#d3dae2',
    lineSoft: '#e6eaef',
    band: '#e4e9ef'
};

let printSheetPending = false;

// ---------------------------------------------------------------- the button

// window.print(), and the fallback if it did nothing.
//
// The heuristic is the only thing that decides - not isStandalone(), not the user
// agent. A desktop where the sheet opened fired beforeprint inside the call and is never
// asked; a phone where nothing opened is asked once, after the wait. Both listeners are
// attached BEFORE the call because Chrome fires them synchronously inside it.
function printWithFallback(kind) {
    // A second tap inside the wait is the person wondering why nothing happened. One
    // offer answers both taps; two offers stacked would displace each other (ask.js
    // resolves the displaced one as a dismissal) and the second would be the only one
    // they could act on.
    if (printSheetPending) return;
    printSheetPending = true;

    let opened = false;
    const mark = () => { opened = true; };
    const media = typeof window.matchMedia === 'function' ? window.matchMedia('print') : null;
    window.addEventListener('beforeprint', mark);
    if (media) {
        if (typeof media.addEventListener === 'function') media.addEventListener('change', mark);
        else if (typeof media.addListener === 'function') media.addListener(mark);
    }

    try {
        window.print();
    } catch (error) {
        // A frame that refuses print() throws, and a throw is a sheet that did not
        // open: the timer below says so, in the same words as silence.
    }

    setTimeout(() => {
        printSheetPending = false;
        window.removeEventListener('beforeprint', mark);
        if (media) {
            if (typeof media.removeEventListener === 'function') media.removeEventListener('change', mark);
            else if (typeof media.removeListener === 'function') media.removeListener(mark);
        }
        if (opened) return;
        offerPrintoutImage(kind);
    }, PRINT_SHEET_WAIT_MS);
}

function offerPrintoutImage(kind) {
    if (typeof askChoice !== 'function') return;
    askChoice({
        title: 'הדפסה',
        message: PRINTOUT_OFFER,
        choices: [PRINTOUT_CHOICE_IMAGE, PRINTOUT_CHOICE_CANCEL]
    }).then(answer => {
        if (answer === PRINTOUT_CHOICE_IMAGE) sharePrintout(kind);
    });
}

// ---------------------------------------------------------------- the doors out

// The share sheet where there is one, a download where there is not, and a sentence
// where there is neither. Called inside a tap - the offer's button or the always-on
// image button - and nothing in it awaits before the share call, for the reason at the
// top of the file.
function sharePrintout(kind) {
    let out = null;
    try {
        out = printoutImage(kind);
    } catch (error) {
        out = null;
    }
    if (!out) {
        if (typeof askTell === 'function') askTell(PRINTOUT_NOTHING_TO_DRAW);
        return;
    }

    const file = typeof File === 'function'
        ? new File([out.blob], out.name, { type: 'image/png' })
        : null;
    const canShareFile = Boolean(file) && typeof navigator.share === 'function'
        && (typeof navigator.canShare !== 'function' || navigator.canShare({ files: [file] }));

    if (canShareFile) {
        navigator.share({ files: [file], title: out.title }).catch(error => {
            // A cancelled sheet is not a failure and must not be answered with a
            // download the person just declined - the same rule the WhatsApp button
            // keeps in js/ui/share.js. Anything else is a sheet that would not take
            // the picture, and the download is the next door.
            if (error && error.name === 'AbortError') return;
            if (!downloadPrintout(out) && typeof askTell === 'function') askTell(PRINTOUT_NO_WAY_OUT);
        });
        return;
    }

    if (!downloadPrintout(out) && typeof askTell === 'function') askTell(PRINTOUT_NO_WAY_OUT);
}

// The same anchor-and-click every other export in this app uses (downloadCsv,
// exportBackup). False when the browser has no way to do it, so the caller can say so
// instead of clicking a link that goes nowhere.
function downloadPrintout(out) {
    if (!(window.URL && typeof URL.createObjectURL === 'function')) return false;
    const link = document.createElement('a');
    if (!('download' in link)) return false;
    const url = URL.createObjectURL(out.blob);
    link.href = url;
    link.download = out.name;
    link.click();
    // Revoking in the same tick can cancel the download before it starts; a minute is
    // long enough for the slowest phone to have read the bytes.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return true;
}

// ---------------------------------------------------------------- the picture

// Draws the table the screen is showing and returns { blob, name, title, width, height,
// layout }, or null when the screen has no table to draw. `layout` names where things
// landed, in bitmap pixels - the title, the header band, each row, each chip and its
// colour - so a test can sample the PNG at the place the drawing claims a thing is and
// see whether it is there. Synchronous throughout: see the top of the file.
function printoutImage(kind) {
    const spec = kind === 'week' ? readWeekPrintout() : readReportPrintout();
    if (!spec) return null;

    const canvas = document.createElement('canvas');
    const probe = canvas.getContext('2d');
    if (!probe) return null;
    const family = printoutFontFamily();
    const plan = kind === 'week' ? planWeekPrintout(spec, probe, family) : planReportPrintout(spec, probe, family);

    // Device pixels, capped: a crisp picture on a 3x phone, and never a canvas the
    // phone refuses to allocate.
    const dpr = Number(window.devicePixelRatio) > 0 ? Number(window.devicePixelRatio) : 1;
    const longest = Math.max(plan.width, plan.height, 1);
    const scale = Math.max(Math.min(dpr, PRINTOUT_MAX_SIDE / longest), 0.25);
    canvas.width = Math.round(plan.width * scale);
    canvas.height = Math.round(plan.height * scale);

    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = PRINTOUT_PAPER.background;
    ctx.fillRect(0, 0, plan.width, plan.height);
    // Right-to-left for every run of text, the way the page is. Canvas has no dir
    // attribute; this is the one switch, and it is set once for the whole drawing.
    ctx.direction = 'rtl';
    ctx.textBaseline = 'middle';

    const layout = plan.draw(ctx);

    const blob = printoutDataUrlToBlob(canvas.toDataURL('image/png'));
    return {
        blob,
        name: spec.name,
        title: spec.title,
        width: canvas.width,
        height: canvas.height,
        layout: printoutScaleLayout(layout, scale)
    };
}

function printoutFontFamily() {
    const body = document.body ? getComputedStyle(document.body).fontFamily : '';
    return body || 'system-ui, -apple-system, "Segoe UI", "Noto Sans Hebrew", Arial, sans-serif';
}

// toDataURL is synchronous and toBlob is not, and the share sheet is on the other
// side of a user gesture that an await would spend. So the PNG is decoded out of the
// data URL by hand - a few hundred kilobytes, once per tap.
function printoutDataUrlToBlob(dataUrl) {
    const comma = dataUrl.indexOf(',');
    const bytes = atob(dataUrl.slice(comma + 1));
    const array = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i += 1) array[i] = bytes.charCodeAt(i);
    return new Blob([array], { type: 'image/png' });
}

function printoutScaleLayout(layout, scale) {
    const box = at => at ? {
        x: Math.round(at.x * scale),
        y: Math.round(at.y * scale),
        w: Math.round(at.w * scale),
        h: Math.round(at.h * scale),
        color: at.color
    } : null;
    return {
        title: box(layout.title),
        header: box(layout.header),
        rows: (layout.rows || []).map(box),
        chips: (layout.chips || []).map(box)
    };
}

// ---------------------------------------------------------------- reading the screen

// textContent with the invisible bidi controls taken out. The app wraps names and
// dates in FSI…PDI so the page's bidi algorithm keeps them whole; canvas text is laid
// out by the same algorithm and the marks add nothing there, and a font that lacks a
// glyph for them draws a box. The LRM before a minus (minusAmount in js/ui/dom.js)
// STAYS - it is what keeps "-500" from drawing as "500-", on canvas as in the DOM.
function printoutText(node) {
    if (!node) return '';
    return String(node.textContent || '')
        .replace(/[\u2066-\u2069]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// The dates in a range the screen shows, "07/08/2026 - 13/08/2026", as the ISO days
// the file is named for. Read off the same text the picture carries, so the name and
// the title cannot disagree.
function printoutIsoDates(text) {
    const out = [];
    const pattern = /(\d{2})\/(\d{2})\/(\d{4})/g;
    let match;
    while ((match = pattern.exec(text)) !== null) out.push(`${match[3]}-${match[2]}-${match[1]}`);
    return out;
}

function printoutStamp(text) {
    const dates = printoutIsoDates(text);
    if (dates.length >= 2) return `${dates[0]}-${dates[1]}`;
    if (dates.length === 1) return dates[0];
    return typeof todayStr === 'function' ? todayStr() : '';
}

// The week grid, as drawn: the day headers, a row per worker with the chips the cell
// holds and the colour each was painted, the totals row, the legend and its note.
function readWeekPrintout() {
    const root = document.getElementById('weekView');
    const table = root ? root.querySelector('.week-table') : null;
    if (!table) return null;

    const range = printoutText(root.querySelector('.week-range'));
    const days = [...table.querySelectorAll('thead th')].slice(1).map(th => ({
        name: printoutText(th.querySelector('.day-full')) || printoutText(th.querySelector('.day-initial')),
        date: printoutText(th.querySelector('small')),
        rest: th.classList.contains('col-rest')
    }));

    const rows = [...table.querySelectorAll('tbody tr')].map(tr => ({
        name: printoutText(tr.querySelector('.name-cell .name-clip')),
        badge: printoutText(tr.querySelector('.name-cell .badge')),
        cells: [...tr.querySelectorAll('.week-cell')].map(td => ({
            absent: td.classList.contains('cell-absent'),
            rest: td.classList.contains('col-rest'),
            chips: [...td.querySelectorAll('.cell-line')].map(line => ({
                // The colour the screen computed for THIS chip - paintSite wrote a
                // var(--site-N) inline and the scheme resolved it. Read, not recomputed.
                color: getComputedStyle(line).backgroundColor,
                double: line.classList.contains('cell-double'),
                extra: line.classList.contains('cell-extra')
            }))
        }))
    }));

    const foot = table.querySelector('tfoot tr');
    const totals = foot ? {
        label: printoutText(foot.querySelector('.name-cell')),
        counts: [...foot.querySelectorAll('td')].slice(1).map(printoutText)
    } : null;

    const legend = [...root.querySelectorAll('.week-legend .tag-place')].map(chip => ({
        color: getComputedStyle(chip).backgroundColor,
        name: printoutText(chip)
    }));
    const note = printoutText(root.querySelector('.week-legend-note'));

    return {
        title: `שבוע ${range}`.trim(),
        name: `farkad-שבוע-${printoutStamp(range)}.png`,
        days,
        rows,
        totals,
        legend,
        note
    };
}

// The report on screen - the one section not set aside - as drawn: its heading and
// period, the table's header, body and totals as the cells read, and the notes under
// it that the paper keeps (hint-warn and hint-money, the ones the print stylesheet
// shows; every other hint is dropped there too).
function readReportPrintout() {
    const root = document.getElementById('reportsView');
    const section = root ? root.querySelector('.report:not(.report-offscreen)') : null;
    if (!section) return null;

    const kind = section.classList.contains('report-invoice') ? 'חיוב' : 'שכר';
    const heading = printoutText(section.querySelector('h2'));
    const period = printoutText(section.querySelector('.report-period'));
    const table = section.querySelector('table.report-table');
    const cellsOf = tr => [...tr.children].map(printoutText);

    return {
        title: heading,
        subtitle: period,
        name: `farkad-דוח-${kind}-${printoutStamp(period)}.png`,
        headers: table ? [...table.querySelectorAll('thead th')].map(printoutText) : [],
        rows: table ? [...table.querySelectorAll('tbody tr')].map(cellsOf) : [],
        totals: table ? [...table.querySelectorAll('tfoot tr')].map(cellsOf) : [],
        empty: table ? '' : printoutText(section.querySelector('.empty-hint')),
        notes: [...section.querySelectorAll('.hint-warn, .hint-money')]
            .map(printoutText).filter(Boolean)
    };
}

// ---------------------------------------------------------------- drawing helpers

function printoutFont(weight, size, family) {
    return `${weight} ${size}px ${family}`;
}

// Text that must fit a box is cut with an ellipsis rather than drawn over the next
// column - the same decision the screen makes for a long name (name-clip in week.js).
function printoutFit(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let cut = text;
    while (cut.length > 1 && ctx.measureText(cut + '…').width > maxWidth) cut = cut.slice(0, -1);
    return cut + '…';
}

function printoutWrap(ctx, text, maxWidth) {
    const words = text.split(' ').filter(Boolean);
    const lines = [];
    let line = '';
    words.forEach(word => {
        const probe = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(probe).width > maxWidth) {
            lines.push(line);
            line = word;
        } else {
            line = probe;
        }
    });
    if (line) lines.push(line);
    return lines;
}

function printoutRoundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

function printoutLine(ctx, x1, y1, x2, y2, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 1;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
}

// One chip, the way the phone draws it: a filled rounded square in the site's colour,
// a white dot for a doubled day, a white plus for extra hours.
function printoutChip(ctx, chip, x, y, size, family) {
    ctx.fillStyle = chip.color;
    printoutRoundRect(ctx, x, y, size, size, Math.round(size * 0.3));
    ctx.fill();
    if (chip.double) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, Math.max(2, size / 6), 0, Math.PI * 2);
        ctx.fill();
    } else if (chip.extra) {
        ctx.fillStyle = '#ffffff';
        ctx.font = printoutFont(800, Math.round(size * 0.75), family);
        ctx.textAlign = 'center';
        ctx.fillText('+', x + size / 2, y + size / 2 + 1);
    }
}

// ---------------------------------------------------------------- the week, planned

// Sizes in CSS pixels; the bitmap scale is applied by the caller. Every column is
// placed from the RIGHT edge, because that is where the week starts.
function planWeekPrintout(spec, probe, family) {
    const PAD = 20;
    const TITLE_H = 34;
    const HEAD_H = 46;
    const FOOT_H = 34;
    const DAY_W = 64;
    const CHIP = 18;
    const CHIP_GAP = 4;
    const LEGEND_H = 26;
    const NOTE_H = 24;

    probe.font = printoutFont(600, 14, family);
    const widest = spec.rows.reduce((max, row) =>
        Math.max(max, probe.measureText(row.name).width), probe.measureText(spec.totals ? spec.totals.label : '').width);
    const NAME_W = Math.max(96, Math.min(200, Math.ceil(widest) + 24));

    const rowHeights = spec.rows.map(row => {
        const deepest = row.cells.reduce((max, cell) => Math.max(max, cell.chips.length), 0);
        return Math.max(40, 12 + deepest * (CHIP + CHIP_GAP));
    });

    probe.font = printoutFont(500, 14, family);
    const legendWidth = spec.legend.map(item => CHIP - 2 + 6 + Math.ceil(probe.measureText(item.name).width) + 18);
    const width = PAD * 2 + NAME_W + DAY_W * Math.max(spec.days.length, 1);
    const inner = width - PAD * 2;
    let legendLines = 0;
    if (spec.legend.length > 0) {
        let used = 0;
        legendLines = 1;
        legendWidth.forEach(w => {
            if (used > 0 && used + w > inner) { legendLines += 1; used = 0; }
            used += w;
        });
    }

    const tableTop = PAD + TITLE_H + 10;
    const bodyTop = tableTop + HEAD_H;
    const bodyHeight = rowHeights.reduce((sum, h) => sum + h, 0);
    const footTop = bodyTop + bodyHeight;
    const tableBottom = footTop + (spec.totals ? FOOT_H : 0);
    const legendTop = tableBottom + 14;
    const noteTop = legendTop + legendLines * LEGEND_H + (legendLines ? 6 : 0);
    const height = noteTop + (spec.note ? NOTE_H : 0) + PAD;

    const draw = ctx => {
        const paper = PRINTOUT_PAPER;
        const right = width - PAD;
        const left = PAD;
        const layout = { title: null, header: null, rows: [], chips: [] };

        // The title, at the right edge, the way the page's heading sits.
        ctx.fillStyle = paper.ink;
        ctx.font = printoutFont(700, 20, family);
        ctx.textAlign = 'right';
        ctx.fillText(printoutFit(ctx, spec.title, inner), right, PAD + TITLE_H / 2);
        layout.title = { x: left, y: PAD, w: inner, h: TITLE_H };

        const colLeft = index => right - NAME_W - DAY_W * (index + 1);

        // The header band, and the rest day's column shaded down the whole grid.
        ctx.fillStyle = paper.band;
        ctx.fillRect(left, tableTop, inner, HEAD_H);
        spec.days.forEach((day, index) => {
            if (!day.rest) return;
            ctx.save();
            ctx.globalAlpha = 0.65;
            ctx.fillStyle = paper.band;
            ctx.fillRect(colLeft(index), bodyTop, DAY_W, bodyHeight);
            ctx.restore();
        });
        layout.header = { x: left, y: tableTop, w: inner, h: HEAD_H };

        ctx.textAlign = 'center';
        spec.days.forEach((day, index) => {
            const centre = colLeft(index) + DAY_W / 2;
            ctx.fillStyle = day.rest ? paper.ink3 : paper.ink;
            ctx.font = printoutFont(600, 13, family);
            ctx.fillText(day.name, centre, tableTop + 16);
            ctx.fillStyle = paper.ink3;
            ctx.font = printoutFont(500, 12, family);
            ctx.fillText(day.date, centre, tableTop + 32);
        });
        ctx.textAlign = 'right';
        ctx.fillStyle = paper.ink2;
        ctx.font = printoutFont(600, 12, family);
        ctx.fillText('עובדים / ימים', right - 8, tableTop + HEAD_H / 2);

        // The rows.
        let y = bodyTop;
        spec.rows.forEach((row, rowIndex) => {
            const h = rowHeights[rowIndex];
            layout.rows.push({ x: left, y, w: inner, h });

            ctx.fillStyle = paper.ink;
            ctx.textAlign = 'right';
            ctx.font = printoutFont(600, 14, family);
            if (row.badge) {
                ctx.fillText(printoutFit(ctx, row.name, NAME_W - 16), right - 8, y + h / 2 - 7);
                ctx.fillStyle = paper.ink3;
                ctx.font = printoutFont(500, 11, family);
                ctx.fillText(row.badge, right - 8, y + h / 2 + 8);
            } else {
                ctx.fillText(printoutFit(ctx, row.name, NAME_W - 16), right - 8, y + h / 2);
            }

            row.cells.forEach((cell, index) => {
                const x0 = colLeft(index);
                const centre = x0 + DAY_W / 2;
                if (cell.absent) {
                    ctx.fillStyle = paper.ink3;
                    ctx.font = printoutFont(500, 14, family);
                    ctx.textAlign = 'center';
                    ctx.fillText('—', centre, y + h / 2);
                    return;
                }
                const stack = cell.chips.length * (CHIP + CHIP_GAP) - CHIP_GAP;
                let cy = y + (h - stack) / 2;
                cell.chips.forEach(chip => {
                    const cx = centre - CHIP / 2;
                    printoutChip(ctx, chip, cx, cy, CHIP, family);
                    layout.chips.push({ x: cx, y: cy, w: CHIP, h: CHIP, color: chip.color });
                    cy += CHIP + CHIP_GAP;
                });
            });

            printoutLine(ctx, left, y + h + 0.5, right, y + h + 0.5, paper.lineSoft, 1);
            y += h;
        });

        // The totals band.
        if (spec.totals) {
            ctx.fillStyle = paper.band;
            ctx.fillRect(left, footTop, inner, FOOT_H);
            ctx.fillStyle = paper.ink;
            ctx.textAlign = 'right';
            ctx.font = printoutFont(700, 13, family);
            ctx.fillText(printoutFit(ctx, spec.totals.label, NAME_W - 16), right - 8, footTop + FOOT_H / 2);
            ctx.textAlign = 'center';
            spec.totals.counts.forEach((count, index) => {
                if (!count) return;
                ctx.fillText(count, colLeft(index) + DAY_W / 2, footTop + FOOT_H / 2);
            });
        }

        // The grid's lines, over everything, so the bands do not swallow them.
        printoutLine(ctx, left + 0.5, tableTop, left + 0.5, tableBottom, paper.line, 1);
        printoutLine(ctx, right - 0.5, tableTop, right - 0.5, tableBottom, paper.line, 1);
        printoutLine(ctx, right - NAME_W + 0.5, tableTop, right - NAME_W + 0.5, tableBottom, paper.line, 1);
        spec.days.forEach((day, index) => {
            const x = colLeft(index) + 0.5;
            printoutLine(ctx, x, tableTop, x, tableBottom, paper.line, 1);
        });
        printoutLine(ctx, left, tableTop + 0.5, right, tableTop + 0.5, paper.line, 1);
        printoutLine(ctx, left, bodyTop + 0.5, right, bodyTop + 0.5, paper.line, 1);
        if (spec.totals) printoutLine(ctx, left, footTop + 0.5, right, footTop + 0.5, paper.line, 1);
        printoutLine(ctx, left, tableBottom - 0.5, right, tableBottom - 0.5, paper.line, 1);

        // The legend: the colours, named, flowing from the right and wrapping.
        let lx = right;
        let ly = legendTop;
        ctx.textAlign = 'right';
        ctx.font = printoutFont(500, 14, family);
        spec.legend.forEach((item, index) => {
            const w = legendWidth[index];
            if (lx < right && lx - w < left) { lx = right; ly += LEGEND_H; }
            const swatch = CHIP - 2;
            ctx.fillStyle = item.color;
            printoutRoundRect(ctx, lx - swatch, ly + (LEGEND_H - swatch) / 2, swatch, swatch, 4);
            ctx.fill();
            ctx.fillStyle = paper.ink;
            ctx.fillText(item.name, lx - swatch - 6, ly + LEGEND_H / 2);
            lx -= w;
        });

        if (spec.note) {
            ctx.fillStyle = paper.ink3;
            ctx.font = printoutFont(500, 13, family);
            ctx.textAlign = 'right';
            ctx.fillText(printoutFit(ctx, spec.note, inner), right, noteTop + NOTE_H / 2);
        }

        return layout;
    };

    return { width, height, draw };
}

// ---------------------------------------------------------------- the report, planned

// A plain table: the header row in bold on a band, a rule under every row, the totals
// in bold under a heavier rule, and the notes the paper keeps beneath. Numbers are
// drawn as the cells read them - the LRM before a minus included.
function planReportPrintout(spec, probe, family) {
    const PAD = 20;
    const TITLE_H = 32;
    const SUB_H = 24;
    const HEAD_H = 38;
    const ROW_H = 36;
    const NOTE_LINE = 20;
    const CELL_PAD = 10;
    const MIN_COL = 56;
    const MAX_COL = 240;

    const columns = spec.headers.map((header, index) => {
        probe.font = printoutFont(700, 13, family);
        let w = probe.measureText(header).width;
        probe.font = printoutFont(500, 15, family);
        spec.rows.forEach(row => { w = Math.max(w, probe.measureText(row[index] || '').width); });
        probe.font = printoutFont(700, 15, family);
        spec.totals.forEach(row => { w = Math.max(w, probe.measureText(row[index] || '').width); });
        const floor = index === 0 ? 110 : MIN_COL;
        return Math.max(floor, Math.min(MAX_COL, Math.ceil(w) + CELL_PAD * 2));
    });
    const tableWidth = columns.reduce((sum, w) => sum + w, 0);

    probe.font = printoutFont(700, 20, family);
    const titleWidth = Math.ceil(probe.measureText(spec.title).width);
    probe.font = printoutFont(500, 14, family);
    const subWidth = Math.ceil(probe.measureText(spec.subtitle).width);
    probe.font = printoutFont(500, 15, family);
    const emptyWidth = Math.ceil(probe.measureText(spec.empty).width);
    const inner = Math.max(tableWidth, Math.min(titleWidth, 720), Math.min(subWidth, 720), Math.min(emptyWidth, 720), 320);
    const width = PAD * 2 + inner;

    probe.font = printoutFont(500, 13, family);
    const noteLines = spec.notes.map(note => printoutWrap(probe, note, inner));
    const noteCount = noteLines.reduce((sum, lines) => sum + lines.length, 0);

    const tableTop = PAD + TITLE_H + (spec.subtitle ? SUB_H : 0) + 10;
    const hasTable = spec.headers.length > 0;
    const bodyTop = tableTop + (hasTable ? HEAD_H : 0);
    const footTop = bodyTop + spec.rows.length * ROW_H;
    const tableBottom = footTop + spec.totals.length * ROW_H;
    const emptyBottom = hasTable ? tableBottom : tableTop + (spec.empty ? ROW_H : 0);
    const notesTop = emptyBottom + (noteCount ? 14 : 0);
    const height = notesTop + noteCount * NOTE_LINE + PAD;

    const draw = ctx => {
        const paper = PRINTOUT_PAPER;
        const right = width - PAD;
        const left = PAD;
        const layout = { title: null, header: null, rows: [], chips: [] };

        ctx.fillStyle = paper.ink;
        ctx.font = printoutFont(700, 20, family);
        ctx.textAlign = 'right';
        ctx.fillText(printoutFit(ctx, spec.title, inner), right, PAD + TITLE_H / 2);
        layout.title = { x: left, y: PAD, w: inner, h: TITLE_H };

        if (spec.subtitle) {
            ctx.fillStyle = paper.ink2;
            ctx.font = printoutFont(500, 14, family);
            ctx.fillText(printoutFit(ctx, spec.subtitle, inner), right, PAD + TITLE_H + SUB_H / 2);
        }

        if (!hasTable) {
            if (spec.empty) {
                ctx.fillStyle = paper.ink3;
                ctx.font = printoutFont(500, 15, family);
                ctx.fillText(printoutFit(ctx, spec.empty, inner), right, tableTop + ROW_H / 2);
            }
        } else {
            // Column edges, from the right: the first column is the rightmost.
            const edges = [];
            let x = right;
            columns.forEach(w => { edges.push({ right: x, left: x - w, width: w }); x -= w; });

            ctx.fillStyle = paper.band;
            ctx.fillRect(left, tableTop, inner, HEAD_H);
            layout.header = { x: left, y: tableTop, w: inner, h: HEAD_H };
            ctx.fillStyle = paper.ink2;
            ctx.font = printoutFont(700, 13, family);
            ctx.textAlign = 'right';
            spec.headers.forEach((header, index) => {
                const edge = edges[index];
                ctx.fillText(printoutFit(ctx, header, edge.width - CELL_PAD * 2), edge.right - CELL_PAD, tableTop + HEAD_H / 2);
            });
            printoutLine(ctx, left, bodyTop - 0.75, right, bodyTop - 0.75, paper.ink, 1.5);

            let y = bodyTop;
            spec.rows.forEach(row => {
                layout.rows.push({ x: left, y, w: inner, h: ROW_H });
                ctx.fillStyle = paper.ink;
                ctx.font = printoutFont(500, 15, family);
                row.forEach((cell, index) => {
                    const edge = edges[index];
                    if (!edge || !cell) return;
                    ctx.fillText(printoutFit(ctx, cell, edge.width - CELL_PAD * 2), edge.right - CELL_PAD, y + ROW_H / 2);
                });
                printoutLine(ctx, left, y + ROW_H - 0.5, right, y + ROW_H - 0.5, paper.lineSoft, 1);
                y += ROW_H;
            });

            spec.totals.forEach(row => {
                ctx.fillStyle = paper.band;
                ctx.fillRect(left, y, inner, ROW_H);
                ctx.fillStyle = paper.ink;
                ctx.font = printoutFont(700, 15, family);
                row.forEach((cell, index) => {
                    const edge = edges[index];
                    if (!edge || !cell) return;
                    ctx.fillText(printoutFit(ctx, cell, edge.width - CELL_PAD * 2), edge.right - CELL_PAD, y + ROW_H / 2);
                });
                printoutLine(ctx, left, y + 1, right, y + 1, paper.line, 2);
                y += ROW_H;
            });
        }

        let ny = notesTop;
        ctx.fillStyle = paper.ink;
        ctx.font = printoutFont(500, 13, family);
        ctx.textAlign = 'right';
        noteLines.forEach(lines => {
            lines.forEach(line => {
                ctx.fillText(line, right, ny + NOTE_LINE / 2);
                ny += NOTE_LINE;
            });
        });

        return layout;
    };

    return { width, height, draw };
}
