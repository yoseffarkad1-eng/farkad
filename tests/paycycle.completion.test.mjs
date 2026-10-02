// v115 regression cases: return to fortnightly, creation and a form waiting on sync.
import { makeDevice, makeCloud, settle } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';
const OPEN = { ledgerWrites: true, carryAdvances: true };
const INITIAL = '2026-09-11=weekly';
function phone(id, history = INITIAL) {
    const d = makeDevice({ deviceId: id, flags: OPEN });
    d.setToday('2026-10-02'); d.Sync.pushDelayMs = 6;
    d.State.schedule.workers = [
        { id: 'w_x', name: 'ORIGINAL', active: true, dailyRate: 650, hourlyRate: 0, payCycles: history },
        { id: 'w_dup', name: 'DUPLICATE', active: true, dailyRate: 450, hourlyRate: 0 }
    ];
    d.State.schedule.places = [{ id: 'p_x', name: 'SITE', active: true }];
    given('seed committed', d.State.commitRoster() === true);
    return d;
}
function form(d, { editing = 'w_x', name = 'ORIGINAL', cycle = 'weekly', from = '2026-10-16' } = {}) {
    const nodes = {};
    for (const [id, value] of Object.entries({ workerFormName: name, workerFormId: '',
        workerFormPhone: '', workerFormDaily: '650', workerFormHourly: '0',
        workerFormCycle: cycle, workerFormCycleFrom: from, workerFormError: '', workerFormModal: '' })) {
        nodes[id] = { value, textContent: '', style: { display: 'block' }, focus() {} };
    }
    d.ctx.document.getElementById = id => nodes[id] || null;
    d.global(`editingWorkerId = ${JSON.stringify(editing)}`);
    return nodes;
}
function work(d, date) {
    given('day committed', d.State.commit(d.call('assignPlace', d.State.schedule, date, 'w_x', 'actual', 'p_x')) === true);
}
{
    suite('C1: returning to fortnightly contains the day and carries every deduction');
    const d = phone('d_return', `${INITIAL};2026-09-25=biweekly`);
    const w = d.State.worker('w_x');
    const range = d.call('periodRangeFor', w, '2026-09-26');
    same('return starts on the effective Friday', range.from, '2026-09-25');
    same('return rejoins the existing fortnight grid', range.to, '2026-10-01');
    same('short first fortnight is marked transitional', range.transition, true);
    same('next period advances to October', d.call('nextPeriodFor', w, '2026-09-26').from, '2026-10-02');
    for (const day of ['2026-09-11', '2026-09-18', '2026-09-25']) work(d, day);
    given('advance committed', d.State.commit(d.call('addAdvance', d.State.schedule, 'w_x', '2026-09-11', 3000, 'TEST')) === true);
    const before = d.call('accountsBefore', d.State.schedule, 'w_x', '2026-10-02');
    same('the return period participates in the carry walk', JSON.stringify(before), JSON.stringify([
        { from: '2026-09-11', to: '2026-09-17' }, { from: '2026-09-18', to: '2026-09-24' },
        { from: '2026-09-25', to: '2026-10-01' }
    ]));
    same('October owes 1050, not 1700', d.call('advanceAccount', d.State.schedule, 'w_x', '2026-10-02', '2026-10-15').carriedIn, 1050);
    const closing = d.call('closePeriodChanges', d.State.schedule, 'w_x', range.from, range.to, '2026-10-02T12:00:00.000Z', d.id);
    given('transition closure committed', d.State.commitMany(closing) === true);
    const reopened = makeDevice({ storage: d.dump(), flags: OPEN }); reopened.State.load();
    same('transition closure survives reopening', reopened.call('farkadWritesBlocked'), false);
    // Several switches, including year boundaries, must partition dates without gaps.
    for (const history of ['', INITIAL, `${INITIAL};2026-09-25=biweekly`,
        '2026-08-14=weekly;2026-08-21=biweekly;2026-09-11=weekly;2026-09-25=biweekly;2026-10-09=weekly',
        '2026-12-25=weekly;2027-01-01=biweekly']) {
        let issue = '';
        for (let day = '2026-08-01'; day <= '2027-01-20'; day = d.call('shiftDate', day, 1)) {
            const r = d.call('periodRangeFor', { payCycles: history }, day);
            const n = d.call('nextPeriodFor', { payCycles: history }, day);
            const first = d.call('periodRangeFor', { payCycles: history }, r.from);
            if (!(r.from <= day && day <= r.to) || n.from !== d.call('shiftDate', r.to, 1)
                || first.from !== r.from || first.to !== r.to) { issue = JSON.stringify({ day, r, n, first }); break; }
        }
        same(`dates partition correctly for ${history || 'default'}`, issue, '');
    }
}
{
    suite('C2: creating a weekly worker preserves the form choice on disk');
    const d = phone('d_new');
    const nodes = form(d, { editing: null, name: 'NEW', from: '2026-09-11' });
    await d.call('saveWorkerForm');
    const added = d.State.schedule.workers.find(w => w.name === 'NEW');
    given('worker exists', Boolean(added));
    same('new worker receives the chosen history', added.payCycles, INITIAL);
    same('successful form closes', nodes.workerFormModal.style.display, 'none');
    const reopened = makeDevice({ storage: d.dump(), flags: OPEN }); reopened.State.load();
    same('reopened worker is weekly', reopened.call('periodRangeFor', reopened.State.worker(added.id), '2026-09-16').cycle, 'weekly');
    const failed = phone('d_new_full');
    const fields = form(failed, { editing: null, name: 'NEW', from: '2026-09-11' });
    failed.setQuota(() => true); await failed.call('saveWorkerForm');
    same('failed save creates no worker', failed.State.schedule.workers.some(w => w.name === 'NEW'), false);
    same('failed save retains the weekly choice', fields.workerFormCycle.value, 'weekly');
    same('failed save retains the open form', fields.workerFormModal.style.display, 'block');
}
async function pair(id, history = INITIAL) {
    const a = phone(`${id}_a`, history); const cloud = makeCloud();
    a.Sync.connect(cloud.adapter); await settle(200);
    const b = makeDevice({ storage: a.dump(), deviceId: `${id}_b`, flags: OPEN });
    b.State.load(); b.setToday('2026-10-02'); b.Sync.pushDelayMs = 6;
    b.Sync.connect(cloud.adapter); await settle(200);
    return { a, b, cloud };
}
for (const kind of ['append', 'same-date', 'closure']) {
    suite(`C3: ${kind} arriving while the worker form awaits confirmation`);
    const { a, b, cloud } = await pair(`d_wait_${kind}`, kind === 'closure' ? '' : INITIAL);
    const nodes = form(a, { name: 'DUPLICATE', from: kind === 'closure' ? '2026-09-11' : '2026-10-16' });
    let answer;
    a.ctx.askConfirm = () => new Promise(resolve => { answer = resolve; });
    const saving = a.call('saveWorkerForm');
    given('confirmation is pending', typeof answer === 'function');
    let received;
    if (kind === 'closure') {
        work(b, '2026-09-04');
        const changes = b.call('closePeriodChanges', b.State.schedule, 'w_x', '2026-09-04', '2026-09-17', '2026-09-17T12:00:00.000Z', b.id);
        given('other phone closes the fortnight', b.State.commitMany(changes) === true);
    } else {
        received = `${INITIAL};${kind === 'append' ? '2026-10-02' : '2026-10-16'}=biweekly`;
        b.State.worker('w_x').payCycles = received;
        given('other phone saved cycle', b.State.commitRoster() === true);
    }
    await settle(650);
    if (kind === 'closure') given('closure reached waiting phone', Boolean(a.call('periodArtifactFor', a.State.schedule, 'w_x', '2026-09-04')));
    else given('history reached waiting phone', a.State.worker('w_x').payCycles === received);
    answer(true); await saving; await settle(650);
    if (kind === 'append') {
        const expected = `${received};2026-10-16=weekly`;
        same('append preserves received boundary locally', a.State.worker('w_x').payCycles, expected);
        same('append preserves received boundary on second phone', b.State.worker('w_x').payCycles, expected);
        same('append preserves received boundary in cloud', cloud.doc.roster.workers.w_x.payCycles, expected);
    } else {
        same('unsafe edit leaves current history unchanged', a.State.worker('w_x').payCycles || '', received || '');
        same('form stays open for decision', nodes.workerFormModal.style.display, 'block');
        check('refusal is explained', nodes.workerFormError.textContent.length > 0, nodes.workerFormError.textContent);
        same('unsaved choice remains in the form', nodes.workerFormCycle.value, 'weekly');
        same('name edit was not partially saved', a.State.worker('w_x').name, 'ORIGINAL');
    }
    a.Sync.disconnect(); b.Sync.disconnect();
}
report();
