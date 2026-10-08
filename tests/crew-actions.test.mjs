// Synthetic group/range actions: the preview is a promise about exact cells, not
// permission to overwrite whatever happens to be there when confirmation returns.
import vm from 'node:vm';
import {readFileSync, existsSync} from 'node:fs';
import {makeDevice, makeCloud, settle} from './harness.mjs';
import {suite, check, same, given, report} from './runner.mjs';
const DATE = '2026-10-08';
const groups = new URL('../js/ui/groups.js', import.meta.url);
suite('group and holiday-range controls are implemented');
check('group action source exists', existsSync(groups));
if (!existsSync(groups)) report();
function device(id, options = {}) {
    const d = makeDevice({deviceId: id, ...options});
    for (const file of ['undo', 'groups']) vm.runInContext(readFileSync(new URL('../js/ui/' + file + '.js', import.meta.url), 'utf8'), d.ctx);
    d.setToday(DATE); d.State.date = DATE; d.State.layer = 'actual';
    d.messages = []; d.ctx.askTell = async message => { d.messages.push(message); };
    d.ctx.askConfirm = async () => false;
    return d;
}
function seed(d) {
    d.State.schedule.workers = [
        {id:'w_a', name:'TEST يوسف', active:true, dailyRate:500, hourlyRate:50},
        {id:'w_b', name:'TEST דוד', active:true, dailyRate:600, hourlyRate:60},
        {id:'w_c', name:'TEST جود', active:true, dailyRate:550, hourlyRate:55},
        {id:'w_old', name:'TEST inactive', active:false, dailyRate:700}
    ];
    d.State.schedule.places = [{id:'p_a',name:'TEST א',active:true},{id:'p_b',name:'TEST ب',active:true}];
    given('roster saved', d.State.commitRoster());
    // Use the same normalized, durable starting shape as a reopened real app. A
    // quota rollback loads this shape too (including empty ledger migration maps).
    d.State.load(); return d;
}
const record = (d,id='w_a',date=DATE) => d.call('snapshotWorkerDay',date,'actual',id);
const plan = (d, kind='assign', ids=['w_a','w_b'], from=DATE, to=from) => d.call('planCrewAction',kind,ids,from,to,'p_a');
const execute = (d,p) => d.call('applyCrewPlan',p);
function save(d,id='w_a',date=DATE,site='p_b') {
    given('day saved', d.State.commit(d.call('assignPlace',d.State.schedule,date,id,'actual',site,'extra',2)));
}
function reopen(d) { const r = device(d.id+'_reopen',{storage:d.dump()}); r.State.load(); return r; }
function refusedWithoutWrites(d,p,label) {
    const before = JSON.stringify(d.State.schedule), bytes=d.dump();
    same(label+': refused',execute(d,p),false);
    same(label+': memory untouched',JSON.stringify(d.State.schedule),before);
    same(label+': storage untouched',d.dump(),bytes);
}
{
    suite('one selected group, one durable action, one undo/redo');
    const d=seed(device('group')); const p=plan(d,'assign',['w_a','w_b','w_a']);
    same('duplicates removed from preview',p.rows.length,2);
    check('assignment committed',execute(d,p));
    same('selected site recorded once',record(d).entries.map(e=>e.placeId),['p_a']);
    same('unselected worker untouched',record(d,'w_c').entries,[]);
    const after=[record(d),record(d,'w_b')];
    refusedWithoutWrites(d,p,'double click');
    d.call('runUndo'); same('whole group undone',[record(d).entries,record(d,'w_b').entries],[[],[]]);
    d.call('runRedo'); same('stamps and records restored',[record(d),record(d,'w_b')],after);
    const r=reopen(d); same('reopening retains group',[record(r),record(r,'w_b')],after);
}
{
    suite('range includes Saturday and preserves recorded facts');
    const d=seed(device('range')); save(d,'w_a','2026-10-09');
    const existing=record(d,'w_a','2026-10-09');
    const p=plan(d,'holiday',['w_a','w_b'],'2026-10-08','2026-10-10');
    same('inclusive range includes hidden Saturday',p.dates,['2026-10-08','2026-10-09','2026-10-10']);
    same('five empty cells, one preserved', [p.rows.length,p.skipped.recorded],[5,1]);
    check('range saved',execute(d,p));
    same('overtime and frozen rates unchanged',record(d,'w_a','2026-10-09'),existing);
    check('Saturday explicitly recorded',record(d,'w_b','2026-10-10').absent === true);
    d.call('runUndo'); same('last day undone',record(d,'w_b','2026-10-10').entries,[]);
    same('old work survives undo',record(d,'w_a','2026-10-09'),existing);
    d.call('runRedo'); check('range redo works',record(d,'w_b','2026-10-10').absent === true);
    const p2=plan(d,'holiday',['w_a','w_b'],'2026-10-08','2026-10-10');
    same('repeat range has no new cells',p2.rows.length,0); refusedWithoutWrites(d,p2,'repeat range');
}
for (const change of ['date','layer','rate','inactive','site','record','closed']) {
    suite('preview refuses changed '+change+' without a partial group');
    const d=seed(device('stale_'+change)), p=plan(d);
    if(change==='date')d.State.date='2026-10-09';
    if(change==='layer')d.State.layer='plan';
    if(change==='rate')d.State.worker('w_a').dailyRate=900;
    if(change==='inactive')d.State.worker('w_a').active=false;
    if(change==='site')d.State.place('p_a').active=false;
    if(change==='record')save(d);
    if(change==='closed')d.ctx.vehicleDateClosed=()=>true;
    refusedWithoutWrites(d,p,change);
}
{
    suite('journal refusal leaves the entire range retryable');
    const d=seed(device('quota')),p=plan(d,'holiday',['w_a','w_b'],DATE,'2026-10-10');
    d.setQuota(()=>true); refusedWithoutWrites(d,p,'full storage');
    same('no undo for a failed action',d.global('undoAction'),null);
    d.setQuota(null); check('same preview retries once',execute(d,p));
    same('all cells survive reopen',reopen(d).State.schedule.days,d.State.schedule.days);
}
{
    suite('undo refuses new work on any date in the range');
    const d=seed(device('range_undo')),p=plan(d,'holiday',['w_a','w_b'],DATE,'2026-10-10');
    given('range saved',execute(d,p)); save(d,'w_b','2026-10-10');
    const before=JSON.stringify(d.State.schedule),bytes=d.dump();
    same('undo refused',d.call('runUndo'),false);
    same('no partial undo in memory',JSON.stringify(d.State.schedule),before);
    same('no partial undo on disk',d.dump(),bytes);
}
{
    suite('range excludes closed cells and refuses closure before undo');
    const d=seed(device('closed'));
    d.ctx.vehicleDateClosed=(_s,_w,date)=>date==='2026-10-09';
    const p=plan(d,'holiday',['w_a'],DATE,'2026-10-10');
    same('closed day excluded',[p.rows.length,p.skipped.closed],[2,1]);
    given('open cells saved',execute(d,p));
    d.ctx.vehicleDateClosed=()=>true;
    const before=JSON.stringify(d.State.schedule); same('new closure blocks whole undo',d.call('runUndo'),false);
    same('closed undo changes nothing',JSON.stringify(d.State.schedule),before);
}
{
    suite('two devices: a preview never overwrites a received update');
    const a=seed(device('a')),b=device('b'),cloud=makeCloud();
    for(const d of [a,b]){d.Sync.pushDelayMs=6;d.Sync.connect(cloud.adapter);await settle(250);}
    const p=plan(a); save(b); await settle(300);
    given('remote fact arrived',record(a).entries.length===1);
    refusedWithoutWrites(a,p,'remote edit');
    same('second group member remains empty',record(a,'w_b').entries,[]);
    a.Sync.disconnect();b.Sync.disconnect();
}
{
    suite('grouping is a view; adjacent names are only a reorder draft');
    const d=seed(device('order'));save(d,'w_a',DATE,'p_a');save(d,'w_c','2026-10-07','p_a');save(d,'w_b',DATE,'p_b');
    const before=JSON.stringify(d.State.schedule),bytes=d.dump();
    same('two-day site groups put coworkers next to each other',d.call('crewOrderedWorkers',d.State.activeWorkers(),DATE,'actual','sites').map(w=>w.id),['w_a','w_c','w_b']);
    same('chosen pair becomes adjacent',d.call('crewAdjacentOrder',['w_a','w_b','w_c'],['w_a','w_c']),['w_a','w_c','w_b']);
    same('pair selection does not select its partner',d.call('crewAdjacentOrder',['w_a','w_b','w_c'],['w_c']),['w_a','w_b','w_c']);
    same('no data changed',JSON.stringify(d.State.schedule),before);same('no disk writes',d.dump(),bytes);
}
{
    suite('invalid ranges and inactive workers cannot become new records');
    const d=seed(device('invalid'));
    for(const [from,to] of [['2026-02-30',DATE],[DATE,'2026-10-07'],['2024-01-01','2026-01-01']])check('invalid/bounded date range refused',!!plan(d,'holiday',['w_a'],from,to).error);
    check('inactive selection refused',!!plan(d,'assign',['w_old']).error);
    check('empty selection refused',!!plan(d,'assign',[]).error);
    d.State.layer='plan';check('actual action not silently applied to planned work',!!plan(d).error);
}
report();
