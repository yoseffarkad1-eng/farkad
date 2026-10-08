// Group selection is local to this dialog. It never creates a new roster entity or
// a payroll rule. Preview and commit compare the same cells, including skipped ones.
let crewDraft = null;
const spentCrewPlans = new WeakSet();

function crewDates(from, to) {
    if (!isRealDate(from) || !isRealDate(to) || from > to) return null;
    const dates = [], cursor = parseLocalDate(from);
    while (toLocalDateStr(cursor) <= to && dates.length <= 366) {
        dates.push(toLocalDateStr(cursor)); cursor.setDate(cursor.getDate() + 1);
    }
    return dates.length > 366 ? null : dates;
}

function planCrewAction(kind, selected, from, to, placeId) {
    const ids = [...new Set(selected)];
    const dates = crewDates(from, to);
    if (!dates) return {error: 'בחר טווח תאריכים תקין, עד 366 ימים בכל פעולה.'};
    if (State.layer !== 'actual') return {error: 'פעולת הקבוצה זמינה ברישום בפועל בלבד.'};
    if (!ids.length || ids.some(id => !State.worker(id) || State.worker(id).active === false)) {
        return {error: 'בחר עובדים פעילים. אם הרשימה השתנתה, פתח אותה מחדש.'};
    }
    if (kind !== 'holiday' && kind !== 'assign') return {error: 'בחר פעולה לקבוצה.'};
    const place = kind === 'assign' ? State.place(placeId) : null;
    if (kind === 'assign' && (!place || place.active === false || from !== State.date || to !== from)) {
        return {error: 'בחר אתר פעיל. שיבוץ לקבוצה נעשה ביום הנבחר בלבד.'};
    }
    const plan = {kind, ids, from, to, placeId: kind === 'assign' ? placeId : null,
        date: State.date, layer: State.layer, dates, rows: [], watched: [],
        workers: ids.map(id => JSON.parse(JSON.stringify(State.worker(id)))),
        place: place ? JSON.parse(JSON.stringify(place)) : null,
        skipped: {recorded: 0, closed: 0}};
    dates.forEach(date => ids.forEach(id => {
        const before = snapshotWorkerDay(date, 'actual', id);
        const closed = vehicleDateClosed(State.schedule, id, date);
        plan.watched.push({id, date, before, closed});
        if (closed) plan.skipped.closed++;
        else if (before.absent || (before.entries || []).length) plan.skipped.recorded++;
        else plan.rows.push({id, date, layer: 'actual', before});
    }));
    return plan;
}

function applyCrewPlan(plan) {
    if (!plan || plan.error || !plan.rows.length || spentCrewPlans.has(plan)) return false;
    const fresh = planCrewAction(plan.kind, plan.ids, plan.from, plan.to, plan.placeId);
    if (canonicalJson(fresh) !== canonicalJson(plan)) {
        askTell('הרישום, היום או רשימת העובדים השתנו בזמן הבדיקה. לא בוצעה שום פעולה לקבוצה. בדוק שוב את הסיכום.');
        return false;
    }
    // No await between the all-row check and this single journal batch. Only empty,
    // open cells reach assignPlace, so its two-site partial-refusal path is unreachable.
    const changes = plan.rows.map(row => plan.kind === 'holiday'
        ? markAbsent(State.schedule, row.date, row.id, row.layer)
        : assignPlace(State.schedule, row.date, row.id, row.layer, plan.placeId, RATE_NORMAL, 0));
    if (!State.commitMany(changes)) return false;
    spentCrewPlans.add(plan);
    offerWorkerRecordsUndo(`${plan.kind === 'holiday' ? 'חופש' : 'שיבוץ'} · ${plan.rows.length} רישומים`, plan.rows);
    return true;
}

// The most recent nonempty site record over these two dates determines the DISPLAY
// group. A pair means adjacent names (owner clarification), not linked selection.
function crewSiteGroup(worker, date, layer) {
    const yesterday = parseLocalDate(date); yesterday.setDate(yesterday.getDate() - 1);
    for (const day of [date, toLocalDateStr(yesterday)]) {
        const ids = [...new Set(entriesFor(State.schedule, day, worker.id, layer).map(e => e.placeId))].sort();
        if (ids.length) return {key: ids.join('|'), label: ids.map(id => {
            const place = State.place(id); return place ? place.name : 'אתר לא פעיל';
        }).join(' + ')};
    }
    return {key: '\uffff', label: 'ללא אתר ביומיים האלה'};
}

function crewOrderedWorkers(workers, date, layer, grouping) {
    if (grouping !== 'sites') return workers.slice();
    const keys = new Map(workers.map(worker => [worker.id, crewSiteGroup(worker, date, layer).key]));
    return workers.slice().sort((a, b) => keys.get(a.id).localeCompare(keys.get(b.id)));
}

function crewAdjacentOrder(order, selected) {
    const chosen = new Set(selected), together = order.filter(id => chosen.has(id));
    if (together.length < 2) return order.slice();
    const first = order.indexOf(together[0]), rest = order.filter(id => !chosen.has(id));
    rest.splice(first, 0, ...together); return rest;
}

function renderCrewActions() {
    const bar = el('div', 'crew-actions no-print');
    const open = button('בחירת עובדים', 'btn-secondary', () => openCrewActions('assign'));
    open.id = 'crewOpenBtn'; bar.appendChild(open);
    const holiday = button('חופש לתקופה', 'btn-secondary', () => openCrewActions('holiday'));
    holiday.id = 'holidayRangeBtn'; bar.appendChild(holiday);
    return bar;
}

function openCrewActions(kind = 'assign') {
    if (State.layer !== 'actual') { askTell('בחר רישום בפועל כדי לפעול על קבוצה.'); return; }
    crewDraft = {date: State.date, layer: State.layer, kind, selected: new Set(), busy: false,
        opener: kind === 'holiday' ? 'holidayRangeBtn' : 'crewOpenBtn',
        from: State.date, to: State.date, search: '', status: 'all', site: '', grouping: 'roster'};
    const modal = document.getElementById('crewModal');
    const form = document.getElementById('crewForm'); clear(form);
    const operation = document.getElementById('crewOperation'); clear(operation);
    const field = (label, id, type, value, parent = form) => {
        const wrap = el('label', 'crew-field', label), input = document.createElement('input');
        input.id = id; input.type = type; input.value = value; wrap.appendChild(input); parent.appendChild(wrap); return input;
    };
    const select = (label, id, options, value, change, parent = form) => {
        const wrap = el('label', 'crew-field', label), input = document.createElement('select'); input.id = id;
        options.forEach(([key, text]) => { const option = el('option', null, text); option.value = key; input.appendChild(option); });
        input.value = value; input.addEventListener('change', () => change(input.value));
        wrap.appendChild(input); parent.appendChild(wrap); return input;
    };
    const search = field('חיפוש עובד', 'crewSearch', 'search', ''); search.dir = 'auto';
    search.addEventListener('input', () => { crewDraft.search = search.value; renderCrewList(); });
    const filters = el('details', 'crew-filters'); filters.id = 'crewFilters';
    filters.appendChild(el('summary', null, 'סינון וסדר תצוגה'));
    const filterForm = el('div', 'crew-form'); filters.appendChild(filterForm); form.appendChild(filters);
    select('הצג', 'crewStatus', [['all','כל הפעילים'],['empty','בלי רישום ביום הנבחר']], 'all', value => { crewDraft.status=value; renderCrewList(); }, filterForm);
    select('אתר ביום הנבחר', 'crewSiteFilter', [['','כל האתרים'], ...State.activePlaces().map(p=>[p.id,p.name])], '', value => {crewDraft.site=value;renderCrewList();}, filterForm);
    select('סדר תצוגה', 'crewGrouping', [['roster','סדר העובדים'],['sites','יחד לפי אתרי היום ואתמול']], 'roster', value=>{crewDraft.grouping=value;renderCrewList();}, filterForm);
    select('פעולה', 'crewKind', [['assign','שיבוץ לאתר ביום הנבחר'],['holiday','חופש לתקופה — ללא שכר']], kind, value=>{crewDraft.kind=value; updateCrewFields();}, operation);
    select('אתר לשיבוץ', 'crewPlace', [['','בחר אתר'], ...State.activePlaces().map(p=>[p.id,p.name])], '', ()=>{}, operation);
    for (const [id,label,key] of [['crewFrom','מתאריך','from'],['crewTo','עד תאריך (כולל)','to']]) {
        const input=field(label,id,'date',State.date,operation); input.addEventListener('change',()=>{crewDraft[key]=input.value;});
    }
    document.getElementById('crewScope').textContent = `${formatFullDate(parseLocalDate(State.date))} · הבחירה נשמרת גם בסינון.`;
    modal.style.display='flex'; updateCrewFields(); renderCrewList();
    modal.querySelector('.modal-content').scrollTop=0;
}

function updateCrewFields() {
    if (!crewDraft) return;
    for(const id of ['crewFrom','crewTo']) document.getElementById(id).parentElement.hidden=crewDraft.kind!=='holiday';
    document.getElementById('crewPlace').parentElement.hidden=crewDraft.kind!=='assign';
}

function crewVisibleWorkers() {
    if (!crewDraft) return [];
    const d=crewDraft, query=d.search.trim().toLocaleLowerCase();
    const workers=State.activeWorkers().filter(worker=>{
        const entries=entriesFor(State.schedule,d.date,worker.id,d.layer);
        return (!query || worker.name.toLocaleLowerCase().includes(query))
            && (d.status!=='empty' || (!entries.length && !isAbsent(State.schedule,d.date,worker.id,d.layer)))
            && (!d.site || entries.some(entry=>entry.placeId===d.site));
    });
    return crewOrderedWorkers(workers,d.date,d.layer,d.grouping);
}

function renderCrewList() {
    if (!crewDraft) return;
    const list=document.getElementById('crewList'); clear(list);
    const workers=crewVisibleWorkers(); let group=null;
    workers.forEach(worker=>{
        const site=crewSiteGroup(worker,crewDraft.date,crewDraft.layer);
        if(crewDraft.grouping==='sites' && site.key!==group) {list.appendChild(el('h4','crew-group-title',site.label));group=site.key;}
        const row=el('label','crew-choice'), input=document.createElement('input');
        input.type='checkbox'; input.value=worker.id; input.checked=crewDraft.selected.has(worker.id);
        input.addEventListener('change',()=>{if(input.checked)crewDraft.selected.add(worker.id);else crewDraft.selected.delete(worker.id);updateCrewCount();});
        row.appendChild(input); const name=el('bdi',null,worker.name); name.dir='auto'; row.appendChild(name);list.appendChild(row);
    });
    if(!workers.length) list.appendChild(el('p','hint','אין עובדים מתאימים למסנן. הבחירה הקודמת נשארה.'));
    updateCrewCount();
}

function updateCrewCount() {
    if(!crewDraft)return;
    const n=crewDraft.selected.size, visible=crewVisibleWorkers().filter(w=>crewDraft.selected.has(w.id)).length;
    document.getElementById('crewCount').textContent=`נבחרו ${n} עובדים${visible<n ? ` · ${n-visible} מוסתרים במסנן` : ''}`;
    document.getElementById('crewPreview').disabled=!n || crewDraft.busy;
    document.getElementById('crewAdjacent').disabled=n<2 || crewDraft.busy;
}

function selectVisibleCrew() { if(crewDraft){crewVisibleWorkers().forEach(w=>crewDraft.selected.add(w.id));renderCrewList();} }
function clearCrewSelection() { if(crewDraft){crewDraft.selected.clear();renderCrewList();} }
function closeCrewActions() {
    const openerId=crewDraft ? crewDraft.opener : 'crewOpenBtn';
    crewDraft=null; document.getElementById('crewModal').style.display='none';
    const opener=document.getElementById(openerId); if(opener)opener.focus();
}

async function previewCrewAction() {
    const draft=crewDraft;
    if(!draft || draft.busy)return false;
    if(State.date!==draft.date || State.layer!==draft.layer) {await askTell('היום השתנה. סגור את הבחירה ופתח אותה מחדש ביום הרצוי.');return false;}
    const plan=planCrewAction(draft.kind,[...draft.selected],draft.kind==='holiday'?draft.from:draft.date,
        draft.kind==='holiday'?draft.to:draft.date,document.getElementById('crewPlace').value);
    if(plan.error){await askTell(plan.error);return false;}
    if(!plan.rows.length){await askTell('אין רישומים חסרים למילוי בבחירה הזאת. שום רישום לא שונה.');return false;}
    draft.busy=true;updateCrewCount();
    try {
        const yes=await askConfirm({title:'בדיקת הפעולה לקבוצה',
            message:`${plan.kind==='holiday'?'חופש ללא שכר':'שיבוץ ל־'+isolate(plan.place.name)} · ${dateRange(plan.from,plan.to)}. `
                + `${plan.ids.length} עובדים, ${plan.dates.length} ימים (כולל שבת): יתווספו ${plan.rows.length} רישומים. `
                + `${plan.skipped.recorded} רישומים קיימים ו־${plan.skipped.closed} ימים בחשבונות סגורים יישמרו. `
                + 'אפשר לבטל את הפעולה אחרי השמירה כל עוד הרישומים לא השתנו.',ok:'אשר את ההוספה',cancel:'חזרה לבחירה'});
        // Closing/reopening invalidates an outstanding answer, even for identical dates.
        if(yes!==true || crewDraft!==draft)return false;
        const saved=applyCrewPlan(plan); if(saved)closeCrewActions(); return saved;
    } finally {draft.busy=false;if(crewDraft===draft)updateCrewCount();}
}

function arrangeSelectedCrew() {
    if(!crewDraft || crewDraft.busy)return;
    const ids=[...crewDraft.selected].filter(id=>State.worker(id)&&State.worker(id).active!==false);
    if(ids.length<2)return;
    closeCrewActions();showView('roster');openReorder();
    reorderDraft=crewAdjacentOrder(reorderDraft,ids);renderReorderPanel();
    const title=document.getElementById('reorderTitle');if(title)title.focus();
}
