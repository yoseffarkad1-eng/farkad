import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {launchLocalBrowser} from './network-guard.mjs';
import {verifyServedAssets, expectedShaFor} from './treecheck.mjs';
import {suite, check, same, report} from './runner.mjs';
const root=new URL('..',import.meta.url).pathname;
const server=await serve(root);
const served=await verifyServedAssets(server.url,root,expectedShaFor(root));
check('browser is served the named tree',served.ok);
const browser=await launchLocalBrowser(chromium,{executablePath:process.env.CHROME_PATH});
const page=await browser.newPage({viewport:{width:390,height:844}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
    await page.clock.setFixedTime('2026-10-08T18:00:00Z');
    await page.goto(server.url);
    await page.evaluate(()=>{
        todayStr=()=> '2026-10-08';
        State.schedule.workers=[{id:'w_a',name:'עובד ראשון',active:true,dailyRate:500,payCycles:'2026-10-02=weekly'},
            {id:'w_b',name:'עובד שני',active:true,dailyRate:400}];
        State.schedule.places=[{id:'p_a',name:'אתר',active:true}];
        State.commitRoster();
        for(const date of ['2026-10-04','2026-10-05','2026-10-06','2026-10-07'])
            for(const worker of State.schedule.workers) State.commit(assignPlace(State.schedule,date,worker.id,'actual','p_a'));
        State.commitMany(recordNewAdvance(State.schedule,'w_a','2026-10-04',1000,'','2026-10-04T08:00:00Z','test','cash'));
        render();
    });
    suite('separate advances screen and cash repayment');
    await page.locator('#tab-advances').click();
    check('separate screen is reachable',await page.locator('#advancesView').isVisible());
    await page.getByRole('button',{name:/עובד ראשון.*נשארו/}).click();
    check('balance is prominent',await page.locator('.advance-balance strong').isVisible());
    await page.getByRole('button',{name:'העובד החזיר כסף',exact:true}).click();
    await page.locator('.advance-form input[type=text]').first().fill('200');
    await page.locator('.advance-form').getByRole('button',{name:'שמור',exact:true}).click();
    same('repayment recorded through real form',await page.evaluate(()=>workerAdvanceSummary('w_a').left),800);
    check('save stays in separate screen',await page.locator('#advancesView').isVisible());
    await page.getByRole('button',{name:'תיקון טעות',exact:true}).click();
    await page.locator('.advance-form input[type=text]').first().fill('100');
    await page.locator('.advance-form input[type=text]').nth(1).fill('טעות בהקלדה');
    await page.getByRole('button',{name:'שמור תיקון',exact:true}).click();
    same('correction preserves a clear remaining balance',await page.evaluate(()=>workerAdvanceSummary('w_a').left),700);
    suite('manual deduction with confirmation and no automatic write');
    await page.getByRole('button',{name:'קיזוז מהשכר',exact:true}).click();
    const field=page.getByRole('textbox',{name:'כמה לקזז מהשכר הפעם?'});
    same('deduction has no automatic selected amount',await field.inputValue(),'');
    await field.fill('300');
    check('preview shows payable amount',/1,?700/.test(await page.locator('.finance-preview').innerText()));
    same('typing does not settle debt',await page.evaluate(()=>workerAdvanceSummary('w_a').left),700);
    await page.getByRole('button',{name:'סגירת חשבון התקופה',exact:true}).click();
    check('confirmation names chosen amount',/300/.test(await page.locator('#askMessage').innerText()));
    await page.locator('#askOk').click();
    same('confirmed choice settles only 300',await page.evaluate(()=>workerAdvanceSummary('w_a').left),400);
    await page.getByRole('button',{name:'סגור',exact:true}).click();
    suite('selected workers in report and files');
    await page.locator('.report-worker-picker summary').click();
    await page.getByRole('button',{name:'בחר הכל',exact:true}).click();
    // v128 retains the open picker after changing the selection. A second summary
    // click now closes it; assert the intended state before selecting a worker.
    check('select all leaves the worker choices open', await page.getByLabel('עובד שני',{exact:true}).isVisible());
    await page.getByLabel('עובד שני',{exact:true}).uncheck();
    const sheets=await page.evaluate(()=>reportSheets());
    check('selected report excludes second worker',!JSON.stringify(sheets).includes('עובד שני'));
    same('unfiltered client sheet does not leak into selected export',sheets.invoice,undefined);
    await page.getByRole('button',{name:'נקה בחירה',exact:true}).click();
    same('zero chosen workers stays zero',await page.evaluate(()=>payrollRows().length),0);
    suite('phone layout of advances');
    await page.locator('#tab-advances').click();
    for(const width of [320,390,430]) {
        await page.setViewportSize({width,height:844});
        check(`no horizontal scrolling at ${width}`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
        check(`all five tabs fit at ${width}`,await page.locator('.tabs .tab').evaluateAll(nodes=>nodes.every(n=>{const r=n.getBoundingClientRect();return r.width>=44 && r.height>=44;})));
    }
    if(process.env.FINANCE_SCREENSHOT) await page.screenshot({path:process.env.FINANCE_SCREENSHOT,fullPage:true});
    check('no uncaught browser errors',errors.length===0,JSON.stringify(errors));
} finally { await browser.close();await server.close(); }
report();
