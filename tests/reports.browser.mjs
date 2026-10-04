import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {launchLocalBrowser} from './network-guard.mjs';
import {verifyServedAssets, expectedShaFor} from './treecheck.mjs';
import {suite, check, same, report} from './runner.mjs';

const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
check('reports browser uses the named tree', (await verifyServedAssets(server.url, root, expectedShaFor(root))).ok);
const browser = await launchLocalBrowser(chromium, {executablePath: process.env.CHROME_PATH});
const page = await browser.newPage({viewport: {width:390,height:844}});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
    await page.goto(server.url);
    await page.evaluate(() => {
        todayStr = () => '2026-10-03';
        State.schedule.workers = [
            {id:'w_week',name:'David · עובד שבועי',active:true,dailyRate:450,payCycles:'2026-10-02=weekly'},
            {id:'w_two',name:'עובד דו שבועי',active:true,dailyRate:500},
            {id:'w_off',name:'עובד עם שם ארוך במיוחד לבדיקה',active:false,dailyRate:400}
        ];
        State.schedule.places = [{id:'p_one',name:'הרצליה',active:true},{id:'p_two',name:'אתר שני עם שם ארוך במיוחד',active:true}];
        for (const id of ['w_week','w_two','w_off']) assignPlace(State.schedule,'2026-10-02',id,'actual','p_one');
        assignPlace(State.schedule,'2026-10-03','w_week','actual','p_two');
        showView('reports');
    });
    suite('pay-cycle navigation keeps both groups in the report');
    same('two groups offer two jump buttons', await page.locator('.report-cycle-nav button').count(), 2);
    await page.locator('.report-cycle-nav button').last().click();
    same('jump moves keyboard focus to the chosen group', await page.evaluate(()=>document.activeElement.id), 'report-cycle-biweekly');
    same('counts include the workers actually in that group', await page.locator('#report-cycle-biweekly').getAttribute('data-workers'), '2 עובדים');
    await page.locator('.report-calculation > summary').first().click();
    check('pay-unit explanation remains available', await page.locator('.report-calculation .hint').first().isVisible());
    await page.locator('.report-calculation > summary').first().click();
    await page.evaluate(()=>scrollTo(0,0));
    const before = await page.evaluate(() => JSON.stringify(State.schedule));
    const original = await page.evaluate(() => JSON.stringify(reportSheets()));
    suite('one report toolbar with compact filters');
    const order = await page.evaluate(() => {
        const top = selector => document.querySelector(selector).getBoundingClientRect().top;
        return top('.report-section-toggle') < top('.range-wrap')
            && top('.range-wrap') < top('.report-worker-picker')
            && top('.report-output-actions') < top('.report-section-toggle');
    });
    check('toolbar precedes type, dates and workers', order);
    check('output choices start collapsed', !(await page.locator('.report-output-actions button').first().isVisible()));
    await page.locator('.report-output-actions > summary').click();
    same('all three existing outputs are available', await page.locator('.report-output-actions button:visible').count(), 3);
    await page.locator('.report-output-actions > summary').press('Escape');
    check('Escape closes output choices', !(await page.locator('.report-output-actions').evaluate(n=>n.open)));
    same('Escape restores trigger focus', await page.evaluate(()=>document.activeElement.parentElement.className), 'report-output-actions');
    check('date presets start folded away', !(await page.locator('.range-chips').isVisible()));
    check('compact controls fit above the report', await page.locator('.reports-controls').evaluate(n=>n.getBoundingClientRect().height<230));
    same('both payroll cycles remain in the image', await page.evaluate(() => readReportPrintout().groups.length), 2);

    suite('search narrows choices without silently narrowing the report');
    await page.locator('.report-worker-picker summary').click();
    const search = page.locator('#reportWorkerSearch');
    await search.fill(' david ');
    same('search ignores case and surrounding spaces', await page.locator('.report-worker-choice:visible').count(), 1);
    check('case-insensitive search finds the intended worker', await page.locator('[data-worker-id="w_week"]').isVisible());
    await search.fill('לא קיים');
    same('no-match search hides every worker choice', await page.locator('.report-worker-choice:visible').count(), 0);
    check('no-match search explains the empty list', await page.getByText('לא נמצאו עובדים בחיפוש.',{exact:true}).isVisible());
    same('no-match search announces its result count', await page.locator('.report-search-count').textContent(), 'מוצגים 0 מתוך 3 עובדים');
    same('search does not remove workers from the exported report', await page.evaluate(() => JSON.stringify(reportSheets())), original);
    await page.locator('#reportWorkerSearchClear').click();
    same('clear search restores every choice', await page.locator('.report-worker-choice:visible').count(), 3);
    same('clear search returns typing focus', await page.evaluate(()=>document.activeElement.id), 'reportWorkerSearch');
    check('clear search is disabled while empty', await page.locator('#reportWorkerSearchClear').isDisabled());
    same('clear search preserves exported amounts', await page.evaluate(() => JSON.stringify(reportSheets())), original);
    await search.fill('ארוך');
    same('inactive workers can still be selected', await page.locator('.report-worker-choice:visible').count(), 1);
    await page.getByRole('button',{name:'נקה בחירה',exact:true}).click();
    same('clear selection deliberately removes report rows', await page.locator('.report-payroll tbody tr').count(), 0);
    const off = page.locator('[data-worker-id="w_off"]');
    await off.check();
    same('one remaining group does not need navigation', await page.locator('.report-cycle-nav').count(), 0);
    same('only the chosen worker is included', await page.locator('.report-payroll tbody tr').count(), 1);
    same('selection restores checkbox focus', await page.evaluate(() => document.activeElement.dataset.workerId), 'w_off');
    await search.fill('');
    check('clearing search preserves the selected worker', await off.isChecked());
    await page.getByRole('button',{name:'בחר הכל',exact:true}).click();
    check('select all keeps the picker open', await search.isVisible());
    same('select all restores both payroll groups and every amount', await page.evaluate(() => JSON.stringify(reportSheets())), original);
    await search.fill('שבועי');
    await page.evaluate(() => render());
    same('redraw retains the search', await search.inputValue(), 'שבועי');
    same('redraw retains typing focus', await page.evaluate(() => document.activeElement.id), 'reportWorkerSearch');
    await search.fill('');
    await page.locator('.report-worker-picker summary').click();

    suite('date and client boundaries still drive every output');
    if (!(await page.locator('.range-wrap').evaluate(n=>n.open))) await page.locator('.report-range-heading').click();
    await page.getByRole('button',{name:'השבוע · שישי–חמישי',exact:true}).click();
    check('choosing a preset folds dates away', !(await page.locator('.range-chips').isVisible()));
    same('weekly dates remain Friday through Thursday', await page.evaluate(() => ({...REPORT_RANGE})), {from:'2026-10-02',to:'2026-10-08'});
    if (!(await page.locator('.range-wrap').evaluate(n=>n.open))) await page.locator('.report-range-heading').click();
    await page.getByRole('button',{name:'שבוע קודם',exact:true}).click();
    same('previous week moves the whole range', await page.evaluate(() => ({...REPORT_RANGE})), {from:'2026-09-25',to:'2026-10-01'});
    if (!(await page.locator('.range-wrap').evaluate(n=>n.open))) await page.locator('.report-range-heading').click();
    await page.getByRole('button',{name:'תקופת החשבון',exact:true}).click();
    await page.getByRole('button',{name:'לפי אתר',exact:true}).click();
    await page.locator('.invoice-picker').getByRole('button',{name:'הרצליה',exact:true}).click();
    same('one client still receives only an invoice sheet', await page.evaluate(() => Object.keys(reportSheets())), ['invoice']);
    await page.locator('.report-output-actions > summary').click();
    check('client output action names the selected client', (await page.locator('.report-output-actions').innerText()).includes('הרצליה'));
    await page.emulateMedia({media:'print'});
    check('cycle navigation stays off paper', !(await page.locator('.report-cycle-nav').isVisible()));
    check('controls do not enter the paper report', !(await page.locator('.reports-controls').isVisible()));
    check('payroll is excluded from client printing', !(await page.locator('.report-payroll').isVisible()));
    check('invoice remains printable', await page.locator('.report-invoice').isVisible());
    await page.emulateMedia({media:'screen'});
    await page.getByRole('button',{name:'לפי עובד',exact:true}).click();
    same('returning to workers restores the original report', await page.evaluate(() => JSON.stringify(reportSheets())), original);
    same('all filtering and navigation leave the shared record unchanged', await page.evaluate(() => JSON.stringify(State.schedule)), before);

    suite('report controls fit phones, dark mode and enlarged text');
    for (const [width,scheme,scale=1] of [[320,'light'],[390,'light'],[430,'dark'],[1100,'light'],[320,'light',2]]) {
        await page.setViewportSize({width,height:844});
        await page.emulateMedia({colorScheme:scheme});
        if (!(await page.locator('.range-wrap').evaluate(n=>n.open))) await page.locator('.report-range-heading').click();
    await page.getByRole('button',{name:'תאריכים אחרים',exact:true}).click();
        if (!(await search.isVisible())) await page.locator('.report-worker-picker summary').click();
        if (scale === 2) await page.evaluate(() => {
            const sizes = [...document.querySelectorAll('#reportsView *')].map(n => [n,parseFloat(getComputedStyle(n).fontSize)]);
            sizes.forEach(([n,size]) => n.style.setProperty('font-size',`${size*2}px`,'important'));
        });
        const geometry = await page.evaluate(() => ({
            overflow:document.documentElement.scrollWidth>innerWidth+1,
            small:[...document.querySelectorAll('#reportsView button, #reportsView input, #reportsView summary')]
                .filter(n => n.offsetParent !== null).filter(n => {const r=n.getBoundingClientRect();return r.width<44||r.height<44;}).map(n=>n.textContent),
            smallInput:[...document.querySelectorAll('.reports-controls input')].some(n=>parseFloat(getComputedStyle(n).fontSize)<16)
        }));
        check(`${width}/${scheme}/${scale}: no page overflow`, !geometry.overflow, JSON.stringify(geometry));
        check(`${width}/${scheme}/${scale}: touch targets remain at least 44px`, !geometry.small.length, JSON.stringify(geometry));
        check(`${width}/${scheme}/${scale}: inputs remain readable without iPhone zoom`, !geometry.smallInput);
        if (process.env.REPORTS_SCREENSHOT_DIR) {
            await page.evaluate(() => scrollTo(0,0));
            await page.screenshot({path:`${process.env.REPORTS_SCREENSHOT_DIR}/reports-${width}-${scheme}-${scale}.png`,fullPage:true});
        }
        await page.evaluate(() => document.querySelectorAll('#reportsView *').forEach(n=>n.style.removeProperty('font-size')));
    }
    suite('compact phone cards preserve amounts and make details reachable');
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=> { REPORT_CARD_GRID = true; render(); });
    same('one compact card per report row', await page.locator('.report-worker-tile').count(), await page.locator('.report-payroll tbody tr').count());
    const amounts = await page.evaluate(()=>[...document.querySelectorAll('.report-payroll-group')].every(group=> {
        const cards=[...group.querySelectorAll('.report-tile-value')].map(n=>n.textContent);
        const rows=[...group.querySelectorAll('tbody tr')].map(n=>n.querySelector('.cell-net')?.textContent || '—');
        return JSON.stringify(cards)===JSON.stringify(rows);
    }));
    check('compact amounts exactly match the prepared full report', amounts);
    const pair = page.locator('.report-worker-cards').last().locator('.report-worker-tile');
    const positions=await pair.evaluateAll(nodes=>nodes.map(n=>({x:n.offsetLeft,y:n.offsetTop})));
    check('two workers share a row on an ordinary phone', positions.length===2 && positions[0].y===positions[1].y && positions[0].x!==positions[1].x,JSON.stringify(positions));
    await page.locator('.report-worker-tile').first().click();
    check('tapping the card opens worker details', await page.locator('#workerDaysModal').isVisible());
    await page.evaluate(()=>closeWorkerDays());
    await page.locator('.report-layout-toggle').click();
    check('full detail view still exposes the original worker rows', await page.locator('.report-payroll tbody tr').first().isVisible());
    check('full detail hides duplicate compact cards', !(await page.locator('.report-worker-tile').first().isVisible()));
    await page.locator('.report-layout-toggle').click();
    await page.setViewportSize({width:320,height:844});
    const narrow=await pair.evaluateAll(nodes=>nodes.map(n=>n.offsetTop));
    check('narrow phones use one column', narrow.length===2 && narrow[0]!==narrow[1]);
    await page.emulateMedia({media:'print'});
    check('paper hides compact duplicates', !(await page.locator('.report-worker-tile').first().isVisible()));
    check('paper retains the complete payroll table', await page.locator('.report-payroll tbody tr').first().isVisible());
    await page.emulateMedia({media:'screen'});
    suite('selecting a worker in a long list preserves the position');
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(() => {
        for (let i=0;i<25;i++) State.schedule.workers.push({id:`w_extra_${i}`,name:`עובד נוסף ${i}`,active:true,dailyRate:400});
        REPORT_WORKER_SEARCH = ''; REPORT_PICKER_OPEN = true; render();
    });
    const list = page.locator('.report-worker-list');
    await list.evaluate(node => { node.scrollTop = node.scrollHeight; });
    const scroll = await list.evaluate(node => node.scrollTop);
    check('long crew actually scrolls inside the picker', scroll > 0);
    await page.locator('[data-worker-id="w_extra_24"]').uncheck();
    same('selection retains the list position', await list.evaluate(node => node.scrollTop), scroll);
    same('selection retains focus on the worker just changed', await page.evaluate(() => document.activeElement.dataset.workerId), 'w_extra_24');
    await page.evaluate(() => render());
    same('live redraw retains the list position', await list.evaluate(node => node.scrollTop), scroll);
    suite('plain work and holiday cards count payable units, not attendance dates');
    await page.evaluate(()=>{
        State.schedule = emptySchedule();
        State.schedule.workers = [{id:'w_simple',name:'עובד לדוגמה',active:true,dailyRate:450,hourlyRate:55}];
        State.schedule.places = [{id:'p_one',name:'הרצליה',active:true},{id:'p_two',name:'רמת גן',active:true}];
        assignPlace(State.schedule,'2026-10-02','w_simple','actual','p_one');
        assignPlace(State.schedule,'2026-10-02','w_simple','actual','p_two');
        assignPlace(State.schedule,'2026-10-03','w_simple','actual','p_one',RATE_DOUBLE);
        markAbsent(State.schedule,'2026-10-04','w_simple','actual');
        assignPlace(State.schedule,'2026-10-05','w_simple','actual','p_one',RATE_EXTRA,3);
        REPORT_RANGE.from='2026-10-02'; REPORT_RANGE.to='2026-10-15';
        REPORT_WORKERS=null; REPORT_PICKER_OPEN=false; REPORT_RANGE_OPEN=false; REPORT_CARD_GRID=true; render();
    });
    const simple = page.locator('[data-report-worker-id="w_simple"]');
    same('only plain work and holiday labels appear on the card',await simple.locator('.report-tile-metrics .report-tile-label').allTextContents(),['ימי עבודה','חופש']);
    same('normal day, double day and overtime day are four payable units',await simple.locator('.report-tile-metrics strong').allTextContents(),['4','1']);
    same('the original attendance count stays three',await page.locator('.report-payroll tbody [data-label="ימי נוכחות"]').textContent(),'3');
    same('the original pay count stays four',await page.locator('.report-payroll tbody [data-label="ימי שכר"]').textContent(),'4');
    same('no deduction line crowds the outer card',await simple.locator('.report-tile-deduction').count(),0);
    check('compact total hides detailed attendance labels',!(await page.locator('.report-payroll tfoot [data-label="ימי נוכחות"]').isVisible()));
    const simpleOutput = await page.evaluate(()=>JSON.stringify(reportSheets()));
    const simpleRecord = await page.evaluate(()=>JSON.stringify(State.schedule));
    await simple.click();
    check('card opens the complete dated details',await page.locator('#workerDaysModal').isVisible());
    check('double-day note remains in details',(await page.locator('#workerDaysBody').innerText()).includes('כפול'));
    check('holiday date remains in details',await page.locator('#workerDaysBody .wday-absent').isVisible());
    check('overtime note remains in details',(await page.locator('#workerDaysBody').innerText()).includes('+3'));
    await page.evaluate(()=>closeWorkerDays());
    await page.locator('.report-layout-toggle').click();
    check('full report retains the attendance breakdown',await page.locator('.report-payroll tbody [data-label="ימי נוכחות"]').isVisible());
    check('full total retains the attendance breakdown',await page.locator('.report-payroll tfoot [data-label="ימי נוכחות"]').isVisible());
    same('simplified cards and details leave every export unchanged',await page.evaluate(()=>JSON.stringify(reportSheets())),simpleOutput);
    same('simplified cards and details leave the record unchanged',await page.evaluate(()=>JSON.stringify(State.schedule)),simpleRecord);
    suite('large amounts and unknown wages stay readable in compact cards');
    await page.evaluate(() => {
        State.schedule = emptySchedule();
        State.schedule.workers = [
            {id:'w_large',name:'מוחמד עבד אלרחמן אבו מחאמיד',active:true,dailyRate:987654.32},
            {id:'w_unknown',name:'עובד ללא שכר יומי',active:true}
        ];
        State.schedule.places = [{id:'p_one',name:'הרצליה',active:true}];
        State.schedule.workers.forEach(worker=>assignPlace(State.schedule,'2026-10-02',worker.id,'actual','p_one'));
        REPORT_WORKERS = null; REPORT_PICKER_OPEN = false; REPORT_RANGE_OPEN = false; REPORT_CARD_GRID = true; render();
    });
    const unknown = page.locator('[data-report-worker-id="w_unknown"]');
    same('unknown wage remains a dash, not a zero', await unknown.locator('.report-tile-value').textContent(), '—');
    same('unknown wage has no misleading currency amount', await unknown.locator('.report-tile-currency').count(), 0);
    same('known wage explicitly names its currency', await page.locator('[data-report-worker-id="w_large"] .report-tile-currency').textContent(), '₪');
    for (const [width, scale] of [[390,1],[320,1],[390,2]]) {
        await page.setViewportSize({width,height:844});
        await page.evaluate(()=>render());
        if (scale === 2) await page.evaluate(() => {
            const sizes = [...document.querySelectorAll('.report-worker-cards, .report-worker-cards *')].map(n=>[n,parseFloat(getComputedStyle(n).fontSize)]);
            sizes.forEach(([n,size])=>n.style.fontSize=`${size*2}px`);
        });
        const cards = await page.locator('.report-worker-tile').evaluateAll(nodes=>nodes.map(n=>({fits:n.scrollWidth<=n.clientWidth+1,top:n.offsetTop})));
        check(`${width}px/${scale}: long name and large wage fit inside each card`, cards.every(n=>n.fits),JSON.stringify(cards));
        if (scale === 2) check('enlarged text switches the cards to one column', cards[0].top!==cards[1].top,JSON.stringify(cards));
    }
    await page.evaluate(()=>{
        State.schedule=emptySchedule();
        State.schedule.workers=[{id:'w_unpriced',name:'עובד ללא מחיר',active:true}];
        State.schedule.places=[{id:'p_one',name:'הרצליה',active:true}];
        assignPlace(State.schedule,'2026-10-02','w_unpriced','actual','p_one');
        render();
    });
    check('unpriced compact footer does not expose the old pay-units label',!(await page.locator('.report-payroll tfoot [data-label="ימי שכר"]').isVisible()));
    same('unpriced card still has plain work and holiday counts',await page.locator('.report-tile-metrics strong').allTextContents(),['1','0']);
    check('no uncaught browser errors', errors.length === 0, JSON.stringify(errors));
} finally { await browser.close(); await server.close(); }
report();
