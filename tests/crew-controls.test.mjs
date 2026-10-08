// v116: default-enabled money and reversible crew controls, using durable device state.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { makeDevice, makeCloud, settle } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';
function device(id='d_controls') {
    const d = makeDevice({ deviceId:id });
    for (const file of ['js/ui/day.js','js/ui/reports.js'])
        vm.runInContext(readFileSync(new URL('../'+file, import.meta.url),'utf8'),d.ctx,{filename:file});
    d.setToday('2026-10-02'); d.State.date='2026-10-02';
    d.State.schedule.workers = [
        {id:'w_a',name:'A',active:true,dailyRate:500},
        {id:'w_b',name:'B',active:true,dailyRate:600},
        {id:'w_off',name:'OFF',active:false,dailyRate:700}
    ];
    d.State.schedule.places=[{id:'p_a',name:'SITE',active:true}];
    given('crew durably saved',d.State.commitRoster()===true);
    return d;
}
function work(d,id='w_a',date='2026-10-02') {
    return d.State.commit(d.call('assignPlace',d.State.schedule,date,id,'actual','p_a'));
}
function form(d) {
    const nodes={};
    for (const id of ['workerFormTitle','workerFormName','workerFormId','workerFormPhone',
        'workerFormDaily','workerFormHourly','workerFormError','workerFormCycle','workerFormCycleFrom',
        'workerFormCycleHint','workerFormCycleHistory','workerFormModal','workerFormPhoneHint'])
        nodes[id]={value:'',textContent:'',style:{},options:[{textContent:''}],focus(){}};
    d.ctx.document.getElementById=id=>nodes[id]||null;
    d.ctx.renderWorkerFormActions=()=>{};
    return nodes;
}
{
    suite('U1: owner-authorized money gates open together, legacy seam remains explicit');
    const d=device();
    same('shipped writer is enabled',d.call('ledgerWritesEnabled'),true);
    same('shipped carry is enabled',d.call('advanceCarryEnabled'),true);
    same('empty accounts need no migration approval',d.call('financialWritingEnabled',d.State.schedule),true);
    const old=makeDevice({flags:{ledgerWrites:false,carryAdvances:false}});
    same('an explicitly modelled old writer remains off',old.call('ledgerWritesEnabled'),false);
    same('an explicitly modelled old reader remains off',old.call('advanceCarryEnabled'),false);
    work(d);
    const add=d.call('addAdvance',d.State.schedule,'w_a','2026-10-02',300,'TEST');
    given('advance saved',d.State.commit(add)===true);
    const id=Object.keys(d.State.schedule.advances)[0];
    const back=d.call('recordAdvanceRepaid',d.State.schedule,id,100,'2026-10-02','cash back','2026-10-02T12:00:00Z',d.id,'cash');
    given('repayment saved with shipped defaults',d.State.commit(back)===true);
    same('repayment reduces debt',d.call('advanceOutstanding',d.State.schedule,id).left,200);
    const fix=d.call('recordAdvanceReversed',d.State.schedule,id,50,'2026-10-02','recording error','2026-10-02T12:01:00Z',d.id);
    given('correction saved',d.State.commit(fix)===true);
    same('correction reduces remaining debt',d.call('advanceOutstanding',d.State.schedule,id).left,150);
    const reopened=makeDevice({storage:d.dump()});reopened.State.load();
    same('financial history survives reopening',reopened.call('advanceOutstanding',reopened.State.schedule,id).left,150);
    same('reopened account accepts writes',reopened.call('farkadWritesBlocked'),false);
}
{
    suite('U2: new worker explicitly chooses frequency; opening resets stale drafts');
    const d=device(); const n=form(d);
    n.workerFormCycle.value='weekly';n.workerFormCycleFrom.value='2027-01-01';
    d.call('showAddWorkerModal');
    same('old worker choice is cleared',n.workerFormCycle.value,'');
    same('default starting Friday is today',n.workerFormCycleFrom.value,'2026-10-02');
    n.workerFormName.value='NEW'; n.workerFormDaily.value='550';
    await d.call('saveWorkerForm');
    same('no silent default for a new worker',d.State.schedule.workers.length,3);
    check('choice explained beside form',n.workerFormError.textContent.includes('כל שבוע'));
    n.workerFormCycle.value='weekly';await d.call('saveWorkerForm');
    const worker=d.State.schedule.workers.find(w=>w.name==='NEW');
    same('weekly chosen by user is saved',worker?.payCycles,'2026-10-02=weekly');
    same('first payday is Thursday',d.call('periodRangeFor',worker,'2026-10-02').to,'2026-10-08');
    d.call('showAddWorkerModal');n.workerFormName.value='FORTNIGHT';n.workerFormCycle.value='biweekly';
    await d.call('saveWorkerForm');
    same('fortnight explicitly saved',d.State.schedule.workers.find(w=>w.name==='FORTNIGHT')?.payCycles,'2026-10-02=biweekly');
    const groups=d.call('payrollGroups',[{payCycle:'weekly'}]);
    same('all-weekly report still identifies frequency',groups[0].cycle,'weekly');
    d.call('setWeeklyReportRange',0);
    same('current weekly report starts Friday',d.global('REPORT_RANGE').from,'2026-10-02');
    same('current weekly report ends Thursday',d.global('REPORT_RANGE').to,'2026-10-08');
    given('weekly worker day saved',d.State.commit(d.call('assignPlace',d.State.schedule,'2026-10-05',worker.id,'actual','p_a'))===true);
    const sheet=d.call('payrollSheetRows');
    same('export identifies weekly worker',sheet.find(row=>row[0]==='NEW')[sheet[0].indexOf('מחזור תשלום')],'שבועי');
    check('whole weekly statement has no false fortnight warning',!d.call('workerStatementText',worker.id).includes('אינו תקופת חשבון'));
    const rows=d.call('payrollRows').filter(row=>row.workerId===worker.id);
    same('weekly deduction is labelled as deduction',d.call('deductionColumnName',rows),d.global('LEDGER_KIND_LABELS').deducted);
    d.call('setWeeklyReportRange',-1);
    same('previous weekly report is one week earlier',d.global('REPORT_RANGE').from,'2026-09-25');
}
{
    suite('U3: visibility toggle keeps work and money, survives reboot and sync');
    const d=device();work(d);
    const before=JSON.stringify(d.State.schedule.days);
    let asked=0;d.ctx.askConfirm=async()=>{asked++;return true;};
    await d.call('setWorkerArchived','w_a',true,true);
    same('one tap hides worker',d.State.worker('w_a').active,false);
    same('ordinary off toggle has no archive dialog',asked,0);
    same('work unchanged',JSON.stringify(d.State.schedule.days),before);
    same('historical wage remains',d.call('payrollReport',d.State.schedule,'2026-10-02','2026-10-08').find(r=>r.workerId==='w_a').amount,500);
    const reopened=makeDevice({storage:d.dump()});reopened.State.load();
    same('off state survives reboot',reopened.State.worker('w_a').active,false);
    await d.call('setWorkerArchived','w_a',false,true);
    same('one tap reactivates',d.State.worker('w_a').active,true);
    const cloud=makeCloud();d.Sync.pushDelayMs=6;d.Sync.connect(cloud.adapter);await settle(250);
    const other=makeDevice({deviceId:'d_other'});other.Sync.pushDelayMs=6;other.Sync.connect(cloud.adapter);await settle(250);
    await d.call('setWorkerArchived','w_b',true,true);await settle(250);
    same('second device receives off switch',other.State.worker('w_b').active,false);
    d.Sync.disconnect();other.Sync.disconnect();
}
{
    suite('U4: holiday protects recorded work and rechecks after confirmation');
    const d=device();work(d);const before=JSON.stringify(d.call('workerDay',d.State.schedule,'2026-10-02','w_a','actual'));
    d.ctx.askConfirm=async()=>true;
    same('holiday saves',await d.call('markAllHoliday'),true);
    same('already recorded work survives',JSON.stringify(d.call('workerDay',d.State.schedule,'2026-10-02','w_a','actual')),before);
    same('unrecorded active worker absent',d.call('isAbsent',d.State.schedule,'2026-10-02','w_b','actual'),true);
    same('inactive worker untouched',d.call('isAbsent',d.State.schedule,'2026-10-02','w_off','actual'),false);
    const reopened=makeDevice({storage:d.dump()});reopened.State.load();
    same('holiday survives reopen',reopened.call('isAbsent',reopened.State.schedule,'2026-10-02','w_b','actual'),true);
    const race=device('d_race');race.ctx.askConfirm=async()=>{work(race,'w_b');race.State.date='2026-10-03';return true;};
    await race.call('markAllHoliday');
    same('confirmation stays on original date',race.call('isAbsent',race.State.schedule,'2026-10-02','w_a','actual'),true);
    same('work arriving during confirmation protected',race.call('isAbsent',race.State.schedule,'2026-10-02','w_b','actual'),false);
    same('newly viewed date untouched',race.State.schedule.days['2026-10-03'],undefined);
    const cancelled=device();cancelled.ctx.askConfirm=async()=>false;
    same('cancelling writes nothing',await cancelled.call('markAllHoliday'),false);
    same('cancelled day remains missing',cancelled.State.schedule.days['2026-10-02'],undefined);
}
{
    suite('U5: bulk holiday and visibility changes fail safely on a full disk');
    const d=device();d.ctx.askConfirm=async()=>true;
    d.setQuota(()=>true);
    same('holiday reports failed durable write',await d.call('markAllHoliday'),false);
    same('no holiday appears in memory',d.call('isAbsent',d.State.schedule,'2026-10-02','w_a','actual'),false);
    await d.call('setWorkerArchived','w_a',true,true);
    same('failed toggle leaves worker enabled',d.State.worker('w_a').active,true);
    const reopened=makeDevice({storage:d.dump()});reopened.State.load();
    same('no partial holiday survives reopening',reopened.call('isAbsent',reopened.State.schedule,'2026-10-02','w_b','actual'),false);
    const closed=device();
    given('period closed',closed.State.commitMany(closed.call('closePeriodChanges',closed.State.schedule,'w_a','2026-10-02','2026-10-15','2026-10-16T12:00:00Z',closed.id))===true);
    closed.ctx.askConfirm=async()=>true;await closed.call('markAllHoliday');
    same('holiday leaves closed worker untouched',closed.call('isAbsent',closed.State.schedule,'2026-10-02','w_a','actual'),false);
    same('holiday still fills unclosed worker',closed.call('isAbsent',closed.State.schedule,'2026-10-02','w_b','actual'),true);
}
{
    suite('U6: shared phone warning names an inactive worker without changing his history');
    const d=device();
    given('recorded work saved',work(d)===true);
    given('advance saved',d.State.commit(d.call('addAdvance',d.State.schedule,'w_a','2026-10-02',200,'TEST'))===true);
    const advanceId=Object.keys(d.State.schedule.advances)[0];
    given('repayment saved',d.State.commit(d.call('recordAdvanceRepaid',d.State.schedule,advanceId,50,
        '2026-10-02','TEST repayment','2026-10-02T12:00:00Z',d.id,'cash'))===true);
    d.State.worker('w_a').name='יוסף يوسف';
    d.State.worker('w_a').phone='052-884-1930';
    d.State.worker('w_a').active=false;
    given('inactive identity saved',d.State.commitRoster()===true);
    // Boot completes the sanctioned legacy-advance mirror before the history snapshot.
    d.State.load();
    const history=schedule=>JSON.stringify({days:schedule.days,advances:schedule.advances,ledger:schedule.ledger});
    const beforeHistory=history(d.State.schedule);
    const originalWorker=JSON.stringify(d.State.worker('w_a'));
    const n=form(d);
    d.call('showAddWorkerModal');
    n.workerFormName.value='עובד חדש';n.workerFormDaily.value='550';n.workerFormCycle.value='weekly';
    n.workerFormPhone.value='+972-52-884-1930';
    d.call('workerPhoneTyped');
    const inactiveName=`${d.call('isolate','יוסף يوسف')} (לא פעיל)`;
    same('duplicate hint stays visible',n.workerFormPhoneHint.style.display,'');
    check('hint names the inactive worker',n.workerFormPhoneHint.textContent.includes(inactiveName),n.workerFormPhoneHint.textContent);
    check('hint does not call him archived',!n.workerFormPhoneHint.textContent.includes('ארכיון'),n.workerFormPhoneHint.textContent);
    check('hint retains the duplicate warning',n.workerFormPhoneHint.textContent.includes('בדוק שאין כפילות'));
    const beforeCancel=JSON.stringify(d.State.schedule);
    const diskBeforeCancel=JSON.stringify(d.dump());
    const questions=[];
    let writeAttempts=0;d.failWrite(()=>{writeAttempts++;return false;});
    d.ctx.askConfirm=async options=>{questions.push(options);return false;};
    await d.call('saveWorkerForm');
    same('save still requires duplicate confirmation',questions.length,1);
    check('confirmation uses the same inactive label',questions[0]?.title.includes(inactiveName),questions[0]?.title);
    check('confirmation does not call him archived',!questions[0]?.title.includes('ארכיון'),questions[0]?.title);
    same('cancel keeps the entire schedule',JSON.stringify(d.State.schedule),beforeCancel);
    same('cancel writes nothing to disk',JSON.stringify(d.dump()),diskBeforeCancel);
    same('cancel attempts no storage writes',writeAttempts,0);
    d.failWrite(null);
    same('cancel leaves the draft open',n.workerFormModal.style.display,'flex');
    same('cancel preserves the typed phone',n.workerFormPhone.value,'+972-52-884-1930');
    d.ctx.askConfirm=async()=>true;
    await d.call('saveWorkerForm');
    same('explicit confirmation adds one separate worker',d.State.schedule.workers.length,4);
    same('original inactive identity remains intact',JSON.stringify(d.State.worker('w_a')),originalWorker);
    same('save preserves recorded days, advances and ledger',history(d.State.schedule),beforeHistory);
    const reopened=makeDevice({storage:d.dump()});reopened.State.load();
    same('historical days and money survive reopening',history(reopened.State.schedule),beforeHistory);
    same('inactive worker historical wage is unchanged',reopened.call('payrollReport',reopened.State.schedule,
        '2026-10-02','2026-10-08').find(row=>row.workerId==='w_a').amount,500);
    same('repayment is not lost or repeated',reopened.call('advanceOutstanding',reopened.State.schedule,advanceId).left,150);
}
{
    suite('U7: site inactivity confirmation names the site and preserves recorded work');
    const d=device();
    given('site work saved',work(d)===true);
    given('worker advance saved',d.State.commit(d.call('addAdvance',d.State.schedule,'w_a','2026-10-02',100,'TEST'))===true);
    d.State.load();
    const history=schedule=>JSON.stringify({days:schedule.days,advances:schedule.advances,ledger:schedule.ledger});
    const beforeHistory=history(d.State.schedule);
    const beforeCancel=JSON.stringify(d.State.schedule);
    const diskBeforeCancel=JSON.stringify(d.dump());
    let question;
    let writeAttempts=0;d.failWrite(()=>{writeAttempts++;return false;});
    d.ctx.askConfirm=async options=>{question=options;return false;};
    await d.call('togglePlaceActive','p_a');
    check('title explicitly identifies an inactive site',question?.title.includes('SITE')
        && question.title.includes('לא פעיל') && question.title.includes('אתר'),question?.title);
    check('site confirmation does not use archive wording',!question?.title.includes('ארכיון'),question?.title);
    same('confirmation button refers to a site',question?.ok,'הפוך אתר ללא פעיל');
    check('confirmation explains that recorded days remain',question?.message.includes('הימים שכבר נרשמו יישמרו'));
    same('cancel keeps the schedule intact',JSON.stringify(d.State.schedule),beforeCancel);
    same('cancel does not write to disk',JSON.stringify(d.dump()),diskBeforeCancel);
    same('site cancellation attempts no storage writes',writeAttempts,0);
    d.failWrite(null);
    d.ctx.askConfirm=async()=>true;
    await d.call('togglePlaceActive','p_a');
    same('confirmed site becomes inactive',d.State.place('p_a').active,false);
    same('site visibility preserves days and money',history(d.State.schedule),beforeHistory);
    const reopened=makeDevice({storage:d.dump()});reopened.State.load();
    same('site stays inactive after reopening',reopened.State.place('p_a').active,false);
    same('site history survives reopening',history(reopened.State.schedule),beforeHistory);
    same('historical wage at inactive site remains',reopened.call('payrollReport',reopened.State.schedule,
        '2026-10-02','2026-10-08').find(row=>row.workerId==='w_a').amount,500);
    await d.call('togglePlaceActive','p_a');
    same('existing reactivation still works',d.State.place('p_a').active,true);
    same('reactivation preserves days and money',history(d.State.schedule),beforeHistory);
}
report();
