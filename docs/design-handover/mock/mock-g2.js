// G2 mock-up: the few DOM moves the CSS cannot make. Injected at screenshot time only
// (shots.mjs MOCKJS=...), never part of the app. Re-applied after every render.
//
//   - a ⋯ at the end of the date row (settings, הכל חופש, the bulk fold and the copy
//     button go behind it; the sync state is a dot on it)
//   - on a day with nothing recorded yet, the copy button as a strip under the band
//   - the WhatsApp button hides while the list scrolls down and returns on a scroll up
//   - mockSheet / mockMoreButton, shared with mock-g3.js for the other screens
(function () {
    function iconSvg(path) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '1.8');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.setAttribute('aria-hidden', 'true');
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', path);
        svg.appendChild(p);
        return svg;
    }
    const ICONS = {
        gear: 'm9 3-.6 2.2-2 .9-2-.6-2 3.4 1.5 1.7v2.3L2.4 15l2 3.4 2-.6 2 .9L9 21h4l.6-2.3 2-.9 2 .6 2-3.4-1.5-1.8V11l1.5-1.7-2-3.4-2 .6-2-.9L13 3Z M14 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
        holiday: 'M3 12h18M12 3v18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4',
        bulk: 'M4 6l1.5 1.5L8 5M11 6.5h9M4 12l1.5 1.5L8 11M11 12.5h9M4 18l1.5 1.5L8 17M11 18.5h9',
        copy: 'M12 4v12m0 0 4-4m-4 4-4-4M4 20h16'
    };

    function closeSheet() {
        document.querySelectorAll('.day-more-backdrop, .day-more-sheet').forEach(n => n.remove());
    }

    // rows: [{ icon: <svg>, label, extra: <node>|null, onTap }]
    function mockSheet(rows, opts = {}) {
        closeSheet();
        const backdrop = document.createElement('div');
        backdrop.className = 'day-more-backdrop';
        backdrop.addEventListener('click', closeSheet);
        const sheet = document.createElement('div');
        sheet.className = 'day-more-sheet';
        sheet.setAttribute('role', 'dialog');
        sheet.appendChild(Object.assign(document.createElement('div'), { className: 'grip' }));

        if (opts.syncLine !== false) {
            const chip = document.getElementById('syncChip');
            const notice = document.getElementById('storageNotice');
            const line = document.createElement('div');
            const kind = chip && !chip.hidden ? (chip.className.match(/chip-(ok|warn|danger)/) || [])[1] : null;
            line.className = 'sync-line ' + (kind ? 'chip-' + kind : 'chip-ok');
            line.appendChild(Object.assign(document.createElement('span'), { className: 'dot' }));
            line.appendChild(document.createTextNode((notice && notice.textContent.trim()) || (chip && chip.textContent) || ''));
            sheet.appendChild(line);
        }
        rows.filter(Boolean).forEach(row => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'row';
            if (row.icon) b.appendChild(row.icon);
            b.appendChild(document.createTextNode(row.label));
            if (row.extra) b.appendChild(row.extra);
            b.addEventListener('click', () => { closeSheet(); row.onTap(); });
            sheet.appendChild(b);
        });
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'cancel';
        cancel.textContent = 'סגור';
        cancel.addEventListener('click', closeSheet);
        sheet.appendChild(cancel);
        document.body.appendChild(backdrop);
        document.body.appendChild(sheet);
    }

    // The ⋯ button, drawn: three circles, like every other glyph on the header. The sync
    // state rides on it as a dot (amber: waiting to send, red: something is wrong).
    function mockMoreButton(onTap) {
        const more = document.createElement('button');
        more.type = 'button';
        more.className = 'btn-icon day-more';
        more.setAttribute('aria-label', 'עוד');
        more.setAttribute('aria-haspopup', 'dialog');
        const dots = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        dots.setAttribute('viewBox', '0 0 24 24');
        dots.setAttribute('fill', 'currentColor');
        dots.setAttribute('aria-hidden', 'true');
        [5, 12, 19].forEach(cx => {
            const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            c.setAttribute('cx', String(cx)); c.setAttribute('cy', '12'); c.setAttribute('r', '2.4');
            dots.appendChild(c);
        });
        more.appendChild(dots);
        const chip = document.getElementById('syncChip');
        if (chip && !chip.hidden) {
            if (/chip-warn/.test(chip.className)) more.classList.add('sync-warn');
            if (/chip-danger/.test(chip.className)) more.classList.add('sync-danger');
        }
        more.addEventListener('click', onTap);
        return more;
    }
    window.mockSheet = mockSheet;
    window.mockMoreButton = mockMoreButton;
    window.mockIcon = iconSvg;
    window.closeDayMore = closeSheet;

    function openDayMore() {
        const bulkCount = document.querySelector('.bulk-toggle .bulk-count');
        const count = document.createElement('span');
        count.className = 'count';
        count.textContent = bulkCount ? bulkCount.textContent : String(State.unrecorded().length);
        const copyBtn = document.getElementById('copyDayBtn');
        const copyLabel = copyBtn ? copyBtn.textContent.replace(/^[^\p{L}]+/u, '') : 'מהיום הקודם';
        mockSheet([
            { icon: iconSvg(ICONS.gear), label: 'הגדרות', onTap: () => openSettings() },
            { icon: iconSvg(ICONS.holiday), label: 'הכל חופש', onTap: () => markAllHoliday() },
            { icon: iconSvg(ICONS.bulk), label: 'פעולות מרוכזות', extra: count, onTap: () => { bulkOpen = true; render(); } },
            { icon: iconSvg(ICONS.copy), label: copyLabel, onTap: () => copyPreviousDay() }
        ]);
    }
    window.openDayMore = openDayMore;

    function apply() {
        const onDay = typeof currentView === 'undefined' || currentView === 'day';
        document.body.classList.toggle('view-day', onDay);
        const root = document.getElementById('dayView');
        const nav = root && root.querySelector('.day-nav');
        if (!nav || nav.querySelector('.day-more')) return;
        nav.appendChild(mockMoreButton(openDayMore));

        // The empty day: nothing recorded, nobody absent - the copy strip under the band.
        const header = root.querySelector('.day-header');
        const workers = State.workersForDay(State.date, State.layer);
        const emptyDay = workers.length > 0 && State.unrecorded().length === workers.length;
        const copyBtn = document.getElementById('copyDayBtn');
        if (emptyDay && header && copyBtn && !copyBtn.disabled && copyBtn.style.display !== 'none') {
            const strip = document.createElement('div');
            strip.className = 'day-copy-strip';
            const text = document.createElement('span');
            text.textContent = 'עוד אין רישום ליום הזה';
            strip.appendChild(text);
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = copyBtn.textContent;
            b.addEventListener('click', () => copyPreviousDay());
            strip.appendChild(b);
            header.insertAdjacentElement('afterend', strip);
        }
    }

    // The floating WhatsApp button hides on the way down and comes back on a small scroll
    // up (the owner's choice, 2026-11-08). The dock element carries the class; the
    // stylesheet slides it out of the way.
    let lastY = window.scrollY;
    window.addEventListener('scroll', () => {
        const y = window.scrollY;
        const dock = document.querySelector('.day-actions');
        if (!dock) return;
        if (y > lastY + 6 && y > 40) dock.classList.add('fab-hidden');
        else if (y < lastY - 6 || y <= 40) dock.classList.remove('fab-hidden');
        lastY = y;
    }, { passive: true });

    const origRender = window.render;
    window.render = function () {
        const result = origRender.apply(this, arguments);
        try { apply(); } catch (error) { console.error('mock-g2', error); }
        return result;
    };
    const origRenderDay = window.renderDay;
    if (typeof origRenderDay === 'function') {
        window.renderDay = function () {
            const result = origRenderDay.apply(this, arguments);
            try { apply(); } catch (error) { console.error('mock-g2', error); }
            return result;
        };
    }
    try { apply(); } catch (error) { console.error('mock-g2', error); }
})();
