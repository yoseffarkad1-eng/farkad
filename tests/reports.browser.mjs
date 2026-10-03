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
    const before = await page.evaluate(() => JSON.stringify(State.schedule));
    const original = await page.evaluate(() => JSON.stringify(reportSheets()));
    suite('report choices precede the output actions');
    const order = await page.evaluate(() => {
        const top = selector => document.querySelector(selector).getBoundingClientRect().top;
        return top('.report-section-toggle') < top('.range-wrap')
            && top('.range-wrap') < top('.report-worker-picker')
            && top('.report-worker-picker') < top('.report-output-actions');
    });
    check('type, dates and workers come before sharing', order);
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
    same('search does not remove workers from the exported report', await page.evaluate(() => JSON.stringify(reportSheets())), original);
    await search.fill('ארוך');
    same('inactive workers can still be selected', await page.locator('.report-worker-choice:visible').count(), 1);
    await page.getByRole('button',{name:'נקה בחירה',exact:true}).click();
    same('clear selection deliberately removes report rows', await page.locator('.report-payroll tbody tr').count(), 0);
    const off = page.locator('[data-worker-id="w_off"]');
    await off.check();
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
    check('client output action names the selected client', (await page.locator('.report-output-actions').innerText()).includes('הרצליה'));
    await page.emulateMedia({media:'print'});
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
    check('no uncaught browser errors', errors.length === 0, JSON.stringify(errors));
} finally { await browser.close(); await server.close(); }
report();
