// G3 mock-up: the bands on every other screen, their ⋯ sheets, the empty-state flag and
// the pay-day screens. Injected at screenshot time only, after mock-g2.js (which provides
// mockSheet, mockMoreButton, mockIcon and the render hook pattern).
(function () {
    const ICON = {
        gear: 'm9 3-.6 2.2-2 .9-2-.6-2 3.4 1.5 1.7v2.3L2.4 15l2 3.4 2-.6 2 .9L9 21h4l.6-2.3 2-.9 2 .6 2-3.4-1.5-1.8V11l1.5-1.7-2-3.4-2 .6-2-.9L13 3Z M14 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
        paste: 'M9 4h6a1 1 0 0 1 1 1v1h2a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2V5a1 1 0 0 1 1-1Zm0 7h6m-6 4h4',
        sort: 'M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3',
        print: 'M6 9V4h12v5M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v6H6z',
        image: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm4 5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm-5 8 5-5 4 4 3-3 5 5',
        list: 'M4 6h16M4 12h16M4 18h10',
        money: 'M3 7h18v10H3zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM6 12h.01M18 12h.01',
        back: 'm9 6 6 6-6 6'
    };
    const svg = (path, stroke) => {
        const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none');
        s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', stroke || '1.8');
        s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', path); s.appendChild(p);
        return s;
    };
    const el2 = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

    // ---------------------------------------------------------------- the band
    function band(view, { title, sub, start, back, row1 = [], row2 = [], more = [] }) {
        if (!view || view.querySelector(':scope > .view-band')) return null;
        const wrap = el2('div', 'view-band');
        const r1 = el2('div', 'band-row band-row-1' + (start ? ' band-start' : ''));
        if (back) {
            const b = el2('button', 'band-back'); b.type = 'button'; b.setAttribute('aria-label', back.label || 'חזרה');
            b.appendChild(svg(ICON.back, '2')); b.addEventListener('click', back.onTap); r1.appendChild(b);
        }
        row1.filter(n => n && n.dataset && n.dataset.bandSide === 'start').forEach(n => r1.appendChild(n));
        const t = el2('div', 'band-title');
        t.appendChild(el2('strong', null, title));
        if (sub) t.appendChild(el2('span', 'band-sub', sub));
        r1.appendChild(t);
        row1.filter(n => n && !(n.dataset && n.dataset.bandSide === 'start')).forEach(n => r1.appendChild(n));
        const moreBtn = window.mockMoreButton ? window.mockMoreButton(() => window.mockSheet(more, { syncLine: true })) : null;
        if (moreBtn) r1.appendChild(moreBtn);
        wrap.appendChild(r1);
        if (row2.length) { const r2 = el2('div', 'band-row band-row-2'); row2.forEach(n => n && r2.appendChild(n)); wrap.appendChild(r2); }
        view.prepend(wrap);
        return wrap;
    }
    const settingsRow = () => ({ icon: svg(ICON.gear), label: 'הגדרות', onTap: () => openSettings() });
    const clickRow = (icon, label, selector, root) => {
        const target = (root || document).querySelector(selector);
        return target ? { icon: svg(ICON[icon]), label: (label || target.textContent).replace(/^[^\p{L}\d]+/u, '').trim(), onTap: () => target.click() } : null;
    };

    // ---------------------------------------------------------------- per view
    function roster() {
        const view = document.getElementById('rosterView');
        if (!view) return;
        const h1 = view.querySelector('.crew-header h1');
        const shortcuts = view.querySelector('.crew-shortcuts');
        band(view, {
            title: h1 ? h1.textContent : 'צוות', start: true,
            row2: shortcuts ? [shortcuts] : [],
            more: [settingsRow(), clickRow('paste', null, '.crew-tools button:first-child', view), clickRow('sort', null, '#reorderOpenBtn', view)].filter(Boolean)
        });
    }
    function week() {
        const view = document.getElementById('weekView');
        if (!view) return;
        const range = view.querySelector('.week-range');
        const back = view.querySelector('.week-header .nav-back');
        const fwd = view.querySelector('.week-header .nav-fwd');
        const today = view.querySelector('.week-today-action');
        const seg = el2('div', 'band-seg');
        const mode = typeof weekPhoneMode !== 'undefined' ? weekPhoneMode : 'grid';
        [['grid', 'טבלה'], ['days', 'ימים']].forEach(([m, label]) => {
            const b = el2('button', null, label); b.type = 'button';
            b.setAttribute('aria-pressed', String(mode === m));
            b.addEventListener('click', () => { setWeekPhoneMode(m); });
            seg.appendChild(b);
        });
        if (back) back.dataset.bandSide = 'start';
        // The week's arrows carry their words as bare text; the band shows the chevron
        // alone, so the words move into a span the stylesheet hides (aria-label keeps them).
        [back, fwd].filter(Boolean).forEach(b => {
            if (!b.getAttribute('aria-label')) b.setAttribute('aria-label', b.textContent.trim());
            Array.from(b.childNodes).forEach(n => {
                if (n.nodeType === 3 && n.textContent.trim()) { const s = el2('span', 'nav-word', n.textContent); b.replaceChild(s, n); }
            });
        });
        band(view, {
            title: 'שבוע', sub: range ? range.textContent : '',
            row1: [back, fwd].filter(Boolean),
            row2: [seg, today].filter(Boolean),
            more: [settingsRow(), clickRow('print', 'הדפסה', '.week-print-action', view), clickRow('image', 'שיתוף כתמונה', '.week-share-action', view)].filter(Boolean)
        });
    }
    function reports() {
        const view = document.getElementById('reportsView');
        if (!view) return;
        const out = view.querySelector('.report-output-actions');
        const toggle = view.querySelector('.report-section-toggle');
        band(view, { title: 'דוחות', start: true, row1: out ? [out] : [], row2: toggle ? [toggle] : [], more: [settingsRow()] });
    }
    function advances() {
        const view = document.getElementById('advancesView');
        if (!view) return;
        const h2 = view.querySelector(':scope > h2');
        const text = h2 ? h2.textContent : 'מקדמות';
        if (/·/.test(text)) {
            const name = text.split('·').pop().trim();
            const backBtn = view.querySelector(':scope > .btn-secondary');
            if (backBtn) backBtn.classList.add('band-moved');
            band(view, { title: name, sub: 'מקדמות', back: { label: backBtn ? backBtn.textContent : 'חזרה', onTap: () => backBtn && backBtn.click() }, more: [settingsRow()] });
        } else {
            const seder = view.querySelector(':scope > h2 + .btn-secondary');
            if (seder) seder.classList.add('band-moved');
            band(view, { title: 'מקדמות', start: true, more: [settingsRow(), seder ? { icon: svg(ICON.list), label: seder.textContent.trim(), onTap: () => seder.click() } : null].filter(Boolean) });
            view.querySelectorAll('.advance-worker-card span').forEach(s => { if (/^\s*0\s*₪/.test(s.textContent)) s.classList.add('is-zero'); });
        }
    }

    // ---------------------------------------------------------------- pay day (visual mock of the planned feature)
    const ROWS = [
        { name: 'עומר סעד', days: 6, gross: 3000, owes: 2000, parts: '1500 מקודם · 500 בתקופה', ded: 500 },
        { name: 'ראמי ח׳ורי', days: 5, gross: 2250, owes: 0 },
        { name: 'סלים נסאר', days: 6, gross: 2520, owes: 1000, ded: 1000 },
        { name: 'וסים עודה', days: 4, gross: 1600, owes: 2000, ded: 300 }
    ];
    const money = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    window.mockPayday = function (mode) {
        const view = document.getElementById('advancesView');
        if (!view) return;
        const bandEl = view.querySelector(':scope > .view-band');
        if (mode === 'entry') {
            const door = el2('div', 'payday-door');
            const icon = el2('div', 'payday-door-icon'); icon.appendChild(svg(ICON.money, '1.9')); door.appendChild(icon);
            const t = el2('div', 'payday-door-text');
            t.appendChild(el2('strong', null, 'יום תשלום · היום'));
            t.appendChild(el2('span', null, '4 עובדים שבועיים · 13/11–19/11'));
            door.appendChild(t);
            const go = el2('button', 'payday-door-go', 'לתשלום'); go.type = 'button'; door.appendChild(go);
            (bandEl || view.firstChild).insertAdjacentElement(bandEl ? 'afterend' : 'beforebegin', door);
            return;
        }
        Array.from(view.children).forEach(c => { if (c !== bandEl) c.remove(); });
        if (bandEl) bandEl.remove();
        band(view, { title: 'יום תשלום', sub: 'חמישי 19/11/2026', back: { label: 'חזרה למקדמות', onTap: () => {} }, more: [settingsRow()] });
        view.appendChild(el2('p', 'payday-period', 'שבועי · 4 עובדים · 13/11–19/11'));
        let pay = 0, ded = 0, left = 0;
        if (mode === 'paid') {
            const done = el2('div', 'payday-done');
            done.appendChild(el2('span', null, 'שולם ונסגר · חמישי 19/11'));
            const big = el2('strong'); done.appendChild(big);
            const line = el2('p'); done.appendChild(line);
            view.appendChild(done);
            ROWS.forEach(r => {
                const off = r.ded || 0, net = r.gross - off, after = r.owes - off;
                pay += net; ded += off; left += after;
                const card = el2('section', 'payday-row payday-paid');
                const top = el2('div', 'payday-row-top');
                top.appendChild(el2('strong', null, r.name));
                top.appendChild(el2('span', 'payday-chip', '✓ שולם 19/11'));
                card.appendChild(top);
                card.appendChild(el2('p', 'payday-paid-line', off > 0 ? `שולם ${money(net)} ₪ · קוזז ${money(off)} ₪` : `שולם ${money(net)} ₪`));
                card.appendChild(el2('p', 'payday-left', after > 0 ? `נשאר חוב מקדמה: ${money(after)} ₪` : 'אין חוב מקדמה'));
                if (off > 0) { const acts = el2('div', 'finance-actions payday-fix'); const b = el2('button', 'btn-secondary', 'תיקון טעות'); b.type = 'button'; acts.appendChild(b); card.appendChild(acts); }
                view.appendChild(card);
            });
            big.textContent = `${money(pay)} ₪`;
            line.textContent = `קוזז ממקדמות: ${money(ded)} ₪ · נשאר חוב: ${money(left)} ₪`;
            view.appendChild(el2('p', 'payday-hint', 'טעות בסכום? «תיקון טעות» רושם תיקון ליד הסגירה. הסגירה עצמה לא נמחקת.'));
            return;
        }
        view.appendChild(el2('p', 'payday-lead', 'כתוב כמה לקזז מכל עובד שיש לו חוב. 0 = לא מקזזים הפעם.'));
        ROWS.forEach(r => {
            const off = r.ded || 0, net = r.gross - off, after = r.owes - off;
            const card = el2('section', 'payday-row');
            const top = el2('div', 'payday-row-top');
            top.appendChild(el2('strong', null, r.name));
            top.appendChild(el2('span', 'payday-earned', `${r.days} ימים · ${money(r.gross)} ₪`));
            card.appendChild(top);
            if (r.owes > 0) {
                const mid = el2('div', 'payday-mid');
                const owed = el2('div', 'payday-owed');
                owed.appendChild(document.createTextNode('חוב מקדמה '));
                owed.appendChild(el2('strong', null, `${money(r.owes)} ₪`));
                if (r.parts) owed.appendChild(el2('small', null, r.parts));
                mid.appendChild(owed);
                const lab = el2('label', 'payday-ded');
                lab.appendChild(el2('span', null, 'לקזז'));
                const input = document.createElement('input'); input.type = 'text'; input.inputMode = 'numeric'; input.dir = 'ltr'; input.value = String(off); input.setAttribute('aria-label', `כמה לקזז מ${r.name}`);
                lab.appendChild(input); mid.appendChild(lab);
                card.appendChild(mid);
            }
            const res = el2('div', 'payday-result');
            res.appendChild(el2('span', 'payday-net', `לתשלום ${money(net)} ₪`));
            res.appendChild(el2('span', r.owes > 0 ? 'payday-after' : 'payday-none', r.owes > 0 ? `נשאר חוב ${money(after)} ₪` : 'אין חוב מקדמה'));
            card.appendChild(res);
            view.appendChild(card);
            pay += net; ded += off; left += after;
        });
        const total = el2('div', 'payday-total');
        total.appendChild(el2('span', null, 'סה״כ לתשלום עכשיו'));
        total.appendChild(el2('strong', null, `${money(pay)} ₪`));
        total.appendChild(el2('p', null, `קיזוז מקדמות: ${money(ded)} ₪ · נשאר חוב: ${money(left)} ₪`));
        view.appendChild(total);
        const go = el2('button', 'payday-go', 'שילמתי · סגור חשבון ל־4 עובדים'); go.type = 'button'; view.appendChild(go);
        view.appendChild(el2('p', 'payday-hint', 'הסגירה סופית. אחריה התקופה לא משתנה, והחוב שנשאר עובר לתקופה הבאה.'));
    };

    // ---------------------------------------------------------------- apply after every render
    function apply() {
        const view = typeof currentView !== 'undefined' ? currentView : 'day';
        document.body.classList.toggle('mock-empty', State.activeWorkers().length === 0);
        if (view === 'roster') roster();
        if (view === 'week') week();
        if (view === 'reports') reports();
        if (view === 'advances') advances();
    }
    const origRender = window.render;
    window.render = function () { const r = origRender.apply(this, arguments); try { apply(); } catch (e) { console.error('mock-g3', e); } return r; };
    const origWeek = window.setWeekPhoneMode;
    if (typeof origWeek === 'function') window.setWeekPhoneMode = function () { const r = origWeek.apply(this, arguments); try { apply(); } catch (e) { console.error('mock-g3', e); } return r; };
    const origAdv = window.showWorkerAdvances;
    if (typeof origAdv === 'function') window.showWorkerAdvances = function () { const r = origAdv.apply(this, arguments); try { apply(); } catch (e) { console.error('mock-g3', e); } return r; };
    try { apply(); } catch (e) { console.error('mock-g3', e); }
})();
