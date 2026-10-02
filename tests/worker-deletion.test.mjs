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

{
    suite('D8 empty placeholders: same name, separate identity, atomic deletion and reopen');
    const a=device(), cloud=makeCloud();
    a.State.worker('w_typo').name='אבו עיד';a.State.worker('w_typo').active=false;
    a.State.worker('w_keep').name='אבו עיד';
    a.State.commitRoster();
    const dates=['2026-08-14','2026-08-15','2026-08-16'];
    a.State.schedule.days=Object.fromEntries(dates.map(date=>[date,{
        plan:{},actual:{w_typo:{entries:[]},w_keep:{entries:[{placeId:'p_site'}],rates:{daily:500,hourly:0}}}
    }]));
    a.State.commitMany(dates.flatMap(date=>['w_typo','w_keep'].map(id=>({
        path:`days.${date}.actual.${id}`,value:a.State.schedule.days[date].actual[id]
    }))));
    await connect(a,cloud);
    const b=makeDevice({deviceId:'d_empty_reader'});await connect(b,cloud);
    same('canonical empty rows permit deletion after sync',a.call('deletionBlockers','w_typo').length,0);
    check('same-named worker with actual work stays protected',a.call('deletionBlockers','w_keep').some(x=>x.includes('ימים')));
    let prompt='';a.ctx.askText=async q=>{prompt=q.message;return q.placeholder;};
    const start=cloud.attempts.length;
    await a.call('deleteWorker','w_typo');await settle(350);
    check('confirmation names the three empty rows',prompt.includes('3 רישומים ריקים'));
    const removal=cloud.attempts.slice(start).find(x=>x.payload['roster.workers.w_typo']===null);
    check('all empty removals travel with roster tombstone',removal&&dates.every(date=>Object.hasOwn(removal.payload,`days.${date}.actual.w_typo`)&&removal.payload[`days.${date}.actual.w_typo`]===null));
    same('cloud identity removed',cloud.doc.roster.workers.w_typo,null);
    for(const d of [a,b,makeDevice({storage:a.dump()}),makeDevice({storage:b.dump()})]) {
        if(d!==a&&d!==b)d.State.load();
        same('accidental ID does not return',d.State.worker('w_typo'),null);
        check('the other ID survives with its original rate',d.State.worker('w_keep')?.name==='אבו עיד'&&d.State.worker('w_keep').dailyRate===500);
        check('empty keys absent and real work unchanged',dates.every(date=>!Object.hasOwn(d.State.schedule.days[date].actual,'w_typo')&&d.State.schedule.days[date].actual.w_keep.rates.daily===500));
        same('no quarantine after reopen',d.call('farkadWritesBlocked'),false);
    }
    check('wire removes keys rather than writing null',dates.every(date=>!Object.hasOwn(cloud.doc.days[date].actual,'w_typo')));
    const seed={days:{'2026-08-14':{actual:{w_typo:{entries:[]}}}}};
    a.call('writeFieldPath',seed,'days.2026-08-14.actual.w_typo',null);
    same('create seed also removes key',Object.hasOwn(seed.days['2026-08-14'].actual,'w_typo'),false);
    stop(a);stop(b);
}
{
    suite('D9 only exact empty placeholders are removable');
    const d=device();
    for(const record of [{absent:true,entries:[]},{entries:[],rates:{daily:450,hourly:0}},
        {entries:[],hourlyRate:0},{entries:[],note:'keep'},{entries:[],unknown:true},{},null]) {
        same('absence, stamp or unknown data is not empty: '+JSON.stringify(record),d.call('isEmptyWorkerRecord',record),false);
    }
    same('plain empty placeholder recognized',d.call('isEmptyWorkerRecord',{entries:[]}),true);
}
{
    suite('D10 a failed durable batch keeps empty rows and worker together');
    const d=device(),cloud=makeCloud();
    d.State.schedule.days['2026-08-14']={plan:{w_typo:{entries:[]}},actual:{}};
    d.State.commit({path:'days.2026-08-14.plan.w_typo',value:{entries:[]}});
    await connect(d,cloud);d.setQuota(()=>true);
    await d.call('deleteWorker','w_typo');
    check('failed storage keeps worker and placeholder in memory',Boolean(d.State.worker('w_typo'))&&Object.hasOwn(d.State.schedule.days['2026-08-14'].plan,'w_typo'));
    const reopened=makeDevice({storage:d.dump()});reopened.State.load();
    check('failed storage keeps both after reopen',Boolean(reopened.State.worker('w_typo'))&&Object.hasOwn(reopened.State.schedule.days['2026-08-14'].plan,'w_typo'));
    d.setQuota(null);stop(d);
}


{
    suite('D11 work on a formerly empty day wins a race with deletion');
    const a=device(),cloud=makeCloud();
    a.State.schedule.days['2026-10-02']={plan:{},actual:{w_typo:{entries:[]}}};
    a.State.commit({path:'days.2026-10-02.actual.w_typo',value:{entries:[]}});
    await connect(a,cloud);
    const b=makeDevice({deviceId:'d_race_worker'});await connect(b,cloud);
    let release;const waiting=new Promise(resolve=>{release=resolve;});let held=false;
    cloud.hold=(kind,payload)=>{
        if(kind==='update'&&payload['roster.workers.w_typo']===null){held=true;return waiting;}
        return null;
    };
    await a.call('deleteWorker','w_typo');await settle(80);
    given('deletion held before server commit',held);
    given('other phone records real work',work(b)===true);await settle(200);
    release();cloud.hold=null;await settle(450);
    same('new work wins in cloud',cloud.doc.days['2026-10-02'].actual.w_typo.entries[0]?.placeId,'p_site');
    check('losing deletion remains visibly contested',a.Sync.honestStatusFor('synced')!=='synced');
    check('winning phone keeps worker identity',Boolean(b.State.worker('w_typo')));
    const reopened=makeDevice({storage:a.dump()});reopened.State.load();
    same('losing operation survives reopen',reopened.Sync.pendingCount()>0,true);
    stop(a);stop(b);
}

report();
