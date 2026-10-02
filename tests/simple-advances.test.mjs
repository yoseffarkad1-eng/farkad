import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {makeDevice, makeCloud, settle} from './harness.mjs';
import {suite, check, same, given, report} from './runner.mjs';
function phone(storage) {
    const d=makeDevice(storage ? {storage} : {deviceId:'manual'});
    vm.runInContext(readFileSync(new URL('../js/ui/reports.js',import.meta.url),'utf8'),d.ctx);
    d.setToday('2026-10-08');
    if(storage) {d.State.load();return d;}
    d.State.schedule.workers=[{id:'w_a',name:'Alpha',active:true,dailyRate:500,payCycles:'2026-10-02=weekly'},
        {id:'w_b',name:'Beta',active:true,dailyRate:400}];
    d.State.schedule.places=[{id:'p_a',name:'Site',active:true}];
    given('roster saved',d.State.commitRoster());
    for(const date of ['2026-10-04','2026-10-05','2026-10-06','2026-10-07'])
        for(const id of ['w_a','w_b']) d.State.commit(d.call('assignPlace',d.State.schedule,date,id,'actual','p_a'));
    for(const amount of [600,400]) d.State.commitMany(d.call('recordNewAdvance',d.State.schedule,'w_a','2026-10-04',amount,'','2026-10-04T08:00:00Z','manual','cash'));
    d.global('REPORT_RANGE').from='2026-10-02';d.global('REPORT_RANGE').to='2026-10-08';
    return d;
}
for(const amount of [0,300,1000]) {
    suite(`manual deduction ${amount}: durable closure and remaining balance`);
    const d=phone(), before=JSON.stringify(d.State.schedule);
    const plan=d.call('planPeriodClosure',d.State.schedule,'w_a','2026-10-02','2026-10-08','2026-10-08T18:00:00Z',amount);
    given('choice accepted',plan.canClose);
    same('chosen deduction',plan.deducted,amount);
    same('remaining balance',plan.carriedForward,1000-amount);
    same('preview never writes',JSON.stringify(d.State.schedule),before);
    const changes=d.call('closePeriodChanges',d.State.schedule,'w_a','2026-10-02','2026-10-08','2026-10-08T18:00:00Z','manual',amount);
    given('whole closure durably committed',d.State.commitMany(changes));
    const reopened=phone(d.dump()), schedule=reopened.State.schedule;
    same('reopened device is writable',reopened.call('farkadWritesBlocked'),false);
    const account=reopened.call('advanceAccount',schedule,'w_a','2026-10-02','2026-10-08');
    same('saved deduction survives reopen',account.deducted,amount);
    same('payable is wage minus chosen amount',account.net,2000-amount);
    same('closed balance includes untouched advances',account.carriedOut,1000-amount);
    same('next period carries the remainder',reopened.call('advanceCarryInto',schedule,'w_a','2026-10-09'),1000-amount);
    same('standalone summary matches',reopened.call('workerAdvanceSummary','w_a').left,1000-amount);
    same('second close does not write',reopened.call('closePeriodChanges',schedule,'w_a','2026-10-02','2026-10-08','2026-10-08T19:00:00Z','manual',amount).length,0);
    same('a draft cannot restate a closed account',reopened.call('advanceAccount',schedule,'w_a','2026-10-02','2026-10-08',0).deducted,amount);
}
{
    suite('invalid and stale manual choices do not mutate money');
    const d=phone();
    for(const value of [-1,1001,NaN,Infinity,'300']) {
        const before=JSON.stringify(d.State.schedule);
        same('invalid amount yields no changes',d.call('closePeriodChanges',d.State.schedule,'w_a','2026-10-02','2026-10-08','2026-10-08T18:00:00Z','manual',value).length,0);
        same('invalid amount leaves data unchanged',JSON.stringify(d.State.schedule),before);
    }
    const id=Object.keys(d.State.schedule.advances)[0];
    d.State.commit(d.call('recordAdvanceRepaid',d.State.schedule,id,600,'2026-10-08','','2026-10-08T17:00:00Z','other','cash'));
    check('stale choice over remaining debt refused',!d.call('planPeriodClosure',d.State.schedule,'w_a','2026-10-02','2026-10-08','2026-10-08T18:00:00Z',700).canClose);
}
{
    suite('worker selection controls report, totals, and every exported worker detail');
    const d=phone();const before=JSON.stringify(d.State.schedule);
    same('all workers by default',d.call('payrollRows').length,2);
    vm.runInContext("REPORT_WORKERS=new Set(['w_a']); REPORT_DEDUCTIONS.set(reportDeductionKey('w_a'),300);",d.ctx);
    same('only requested worker remains',d.call('payrollRows').length,1);
    same('preview uses selected deduction',d.call('payrollRows')[0].carry.net,1700);
    const sheets=d.call('reportSheets');
    check('subset export omits unrelated site invoice',!sheets.invoice);
    check('payroll has no unselected worker',!JSON.stringify(sheets.payroll).includes('Beta'));
    check('details have no unselected worker',!JSON.stringify(sheets.detail).includes('Beta'));
    same('selection and preview never change shared data',JSON.stringify(d.State.schedule),before);
    vm.runInContext('REPORT_WORKERS=new Set();',d.ctx);
    same('empty selection is not all workers',d.call('payrollRows').length,0);
    same('empty export contains only header',d.call('payrollSheetRows').length,1);
}
{
    suite('first financial action stays enabled, synchronizes, and rolls back on disk failure');
    const d=phone();
    const cloud=makeCloud();d.Sync.pushDelayMs=6;d.Sync.connect(cloud.adapter);await settle(250);
    const other=makeDevice({deviceId:'second'});other.Sync.pushDelayMs=6;other.Sync.connect(cloud.adapter);await settle(250);
    given('first manual account saved',d.call('saveFinancialAction',()=>d.call('closePeriodChanges',d.State.schedule,'w_a','2026-10-02','2026-10-08','2026-10-08T18:00:00Z','manual',300)));
    await settle(350);
    same('second phone sees exact chosen deduction',other.call('advanceAccount',other.State.schedule,'w_a','2026-10-02','2026-10-08').deducted,300);
    same('second phone sees the complete remaining balance',other.call('advanceAccount',other.State.schedule,'w_a','2026-10-02','2026-10-08').carriedOut,700);
    same('later financial actions remain enabled',d.call('financialWritingEnabled',d.State.schedule),true);
    const reopened=phone(d.dump());
    same('readiness survives reopening',reopened.call('financialWritingEnabled',reopened.State.schedule),true);
    d.Sync.disconnect();other.Sync.disconnect();
    const full=phone();full.setQuota(()=>true);
    same('full disk does not claim a closure saved',full.call('saveFinancialAction',()=>full.call('closePeriodChanges',full.State.schedule,'w_a','2026-10-02','2026-10-08','2026-10-08T18:00:00Z','manual',300)),false);
    const again=phone(full.dump());
    same('failed closure leaves full debt',again.call('workerAdvanceSummary','w_a').left,1000);
    same('failed closure leaves no frozen account',again.call('advanceAccount',again.State.schedule,'w_a','2026-10-02','2026-10-08').closed,false);
    check('failed closure does not leave an approval marker',!again.State.schedule.ledger?.migrations?.cm_carry);
}
{
    suite('a pre-existing migration difference cannot be silently approved by a new action');
    const d=phone(), id=Object.keys(d.State.schedule.advances)[0];
    d.State.commit(d.call('recordAdvanceRepaid',d.State.schedule,id,100,'2026-10-08','','2026-10-08T17:00:00Z','legacy','cash'));
    given('fixture requires a real review',d.call('planCarryMigration',d.State.schedule).needed);
    const before=JSON.stringify(d.State.schedule);let called=false;
    const notices=[];d.ctx.askTell=async message=>notices.push(message);
    same('new action is refused',d.call('saveFinancialAction',()=>{called=true;return [];}),false);
    same('the required review is explained to the person',notices.length,1);
    same('money factory is never called',called,false);
    same('existing data is unchanged',JSON.stringify(d.State.schedule),before);
    check('no approval is manufactured',!d.State.schedule.ledger?.migrations?.cm_carry);
}
report();
