// v119: delete accidental shared names without deleting anybody's work or money.
import { makeDevice, makeCloud, settle } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';
function device(id='d_delete') {
    const d=makeDevice({deviceId:id});
    d.State.schedule.workers=[{id:'w_typo',name:'טעות ישנה',active:true,dailyRate:450,
        payCycles:'2026-10-02=weekly'}, {id:'w_keep',name:'KEEP',active:true,dailyRate:500}];
    d.State.schedule.places=[{id:'p_site',name:'SITE',active:true}];
    given('crew saved',d.State.commitRoster()===true);
    d.ctx.askText=async q=>q.placeholder;
    d.ctx.askTell=async()=>{};
    return d;
}
async function connect(d,cloud) {
    d.Sync.pushDelayMs=4;d.Sync.connect(cloud.adapter);await settle(280);
}
function stop(d) {d.Sync.stopListening();d.Sync.disconnect();}
function work(d) {return d.State.commit(d.call('assignPlace',d.State.schedule,'2026-10-02','w_typo','actual','p_site'));}
{
    suite('D1 shared unused name: typed deletion, two devices, reopen, stale roster');
    const a=device(),cloud=makeCloud();await connect(a,cloud);
    const b=makeDevice({deviceId:'d_other'});await connect(b,cloud);
    given('name has been shared',a.Sync.provenLocalOnly('workers','w_typo')===false);
    given('both devices synced',a.Sync.status==='synced'&&b.Sync.status==='synced');
    same('old shared name may be removed',a.call('deletionBlockers','w_typo').length,0);
    const stale=structuredClone(cloud.doc.workers);
    await a.call('deleteWorker','w_typo');await settle(300);
    same('removed on writer',a.State.worker('w_typo'),null);
    same('removed on second phone',b.State.worker('w_typo'),null);
    same('other worker unchanged',b.State.worker('w_keep').dailyRate,500);
    same('cloud carries tombstone',cloud.doc.roster.workers.w_typo,null);
    const reopened=makeDevice({storage:b.dump()});reopened.State.load();
    same('does not return after reopen',reopened.State.worker('w_typo'),null);
    const restored=a.call('normaliseSchedule',{...cloud.doc,workers:stale});
    same('old whole roster does not resurrect unused name',restored.workers.some(w=>w.id==='w_typo'),false);
    stop(a);stop(b);
}
{
    suite('D2 late offline work wins over deletion with its original wage');
    const a=device(),cloud=makeCloud();await connect(a,cloud);
    const b=makeDevice({deviceId:'d_offline'});await connect(b,cloud);stop(b);
    given('offline work saved',work(b)===true);
    await a.call('deleteWorker','w_typo');await settle(200);
    given('deletion landed before offline day',cloud.doc.roster.workers.w_typo===null);
    await connect(b,cloud);await settle(450);
    for(const d of [a,b]) {
        check('worker identity retained for late work',Boolean(d.State.worker('w_typo')));
        same('returns inactive',d.State.worker('w_typo')?.active,false);
        same('original name retained',d.State.worker('w_typo')?.name,'טעות ישנה');
        same('weekly cycle retained',d.State.worker('w_typo')?.payCycles,'2026-10-02=weekly');
        same('wage remains 450',d.call('payrollReport',d.State.schedule,'2026-10-02','2026-10-08').find(r=>r.workerId==='w_typo')?.amount,450);
        same('device remains writable',d.call('farkadWritesBlocked'),false);
    }
    stop(a);stop(b);
}
{
    suite('D3 no-advance weekly closure alone prevents deletion and survives tombstone');
    const a=device(),cloud=makeCloud();await connect(a,cloud);
    const changes=a.call('closePeriodChanges',a.State.schedule,'w_typo','2026-10-02','2026-10-08','2026-10-09T12:00:00Z',a.id);
    given('empty weekly account closed',a.State.commitMany(changes)===true);await settle(280);
    check('immutable zero closure blocks deletion',a.call('deletionBlockers','w_typo').some(x=>x.includes('חשבונות')));
    const before=JSON.stringify(a.State.schedule.ledger);
    await a.call('deleteWorker','w_typo');
    check('worker retained',Boolean(a.State.worker('w_typo')));
    same('financial bytes untouched',JSON.stringify(a.State.schedule.ledger),before);
    const raw=structuredClone(cloud.doc);raw.roster.workers.w_typo=null;
    const read=a.call('normaliseSchedule',raw,a.call('rememberedEntities',a.State.schedule));
    same('late ledger restores inactive identity',read.workers.find(w=>w.id==='w_typo')?.active,false);
    same('weekly closure never becomes unreadable',Object.keys(read.ledger.unreadable).length,0);
    same('closure is still readable',JSON.stringify(read.ledger.advances),JSON.stringify(a.State.schedule.ledger.advances));
    stop(a);
}
for (const [label,mutate] of [
    ['day',d=>work(d)],
    ['absence',d=>d.State.commit(d.call('markAbsent',d.State.schedule,'2026-10-02','w_typo','actual'))],
    ['advance',d=>d.State.commit(d.call('addAdvance',d.State.schedule,'w_typo','2026-10-02',300,''))],
    ['vehicle owner',d=>{d.State.schedule.vehicles=[{id:'v_1',ownerId:'w_typo'}];}],
    ['cancelled advance history',d=>{
        d.State.schedule.ledger.advances.le_history={id:'le_history',advanceId:'a_history',kind:'given',workerId:'w_typo',date:'2026-10-02',amount:100,at:'2026-10-02T10:00:00Z',by:'d_a'};
        d.State.schedule.ledger.advances.le_cancel={id:'le_cancel',advanceId:'a_history',kind:'cancelled',date:'2026-10-02',at:'2026-10-02T11:00:00Z',by:'d_a'};
    }]
]) {
    suite('D4 history blocks deletion: '+label);
    const d=device(),cloud=makeCloud();await connect(d,cloud);mutate(d);await settle(250);
    const before=JSON.stringify(d.State.schedule);let asks=0;d.ctx.askText=async q=>{asks++;return q.placeholder;};
    await d.call('deleteWorker','w_typo');
    same('no delete confirmation for protected worker',asks,0);
    same('record unchanged',JSON.stringify(d.State.schedule),before);stop(d);
}
{
    suite('D5 confirmation rechecks typed value, same-object rename and new work');
    const d=device(),cloud=makeCloud();await connect(d,cloud);
    d.ctx.askText=async()=> 'wrong';await d.call('deleteWorker','w_typo');
    check('wrong name refused even outside dialog validation',Boolean(d.State.worker('w_typo')));
    d.ctx.askText=async q=>{d.State.worker('w_typo').name='CHANGED';return q.placeholder;};
    await d.call('deleteWorker','w_typo');check('rename while typing refuses deletion',Boolean(d.State.worker('w_typo')));
    d.ctx.askText=async q=>{work(d);return q.placeholder;};await d.call('deleteWorker','w_typo');
    check('work arriving while typing protected',Boolean(d.State.worker('w_typo')));stop(d);
}
{
    suite('D6 failed storage and offline shared names cannot be deleted');
    const d=device(),cloud=makeCloud();await connect(d,cloud);
    d.setQuota(()=>true);await d.call('deleteWorker','w_typo');
    check('failed journal keeps name',Boolean(d.State.worker('w_typo')));
    d.setQuota(null);stop(d);
    check('shared deletion requires sync',d.call('deletionBlockers','w_typo').some(x=>x.includes('הסנכרון')));
    const reopened=makeDevice({storage:d.dump()});reopened.State.load();
    check('failed delete keeps name after reopen',Boolean(reopened.State.worker('w_typo')));
}
{
    suite('D7 a zero-advance weekly closure made offline arrives after shared deletion');
    const a=device(),cloud=makeCloud();await connect(a,cloud);
    const b=makeDevice({deviceId:'d_closer'});await connect(b,cloud);stop(b);
    given('offline weekly closure durably saved',b.State.commitMany(b.call('closePeriodChanges',
        b.State.schedule,'w_typo','2026-10-02','2026-10-08','2026-10-09T12:00:00Z',b.id))===true);
    const ledger=JSON.stringify(b.State.schedule.ledger.advances);
    await a.call('deleteWorker','w_typo');await settle(200);await connect(b,cloud);await settle(400);
    for(const d of [a,b]) {
        same('closure remains byte for byte',JSON.stringify(d.State.schedule.ledger.advances),ledger);
        same('weekly owner identity survives',d.State.worker('w_typo')?.payCycles,'2026-10-02=weekly');
        same('owner returns inactive',d.State.worker('w_typo')?.active,false);
        same('late closure leaves device writable',d.call('farkadWritesBlocked'),false);
    }
    stop(a);stop(b);
}
report();
