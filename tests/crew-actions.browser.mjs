import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {launchLocalBrowser} from './network-guard.mjs';
import {verifyServedAssets, expectedShaFor} from './treecheck.mjs';
import {suite, check, same, report} from './runner.mjs';
const root=new URL('..',import.meta.url).pathname, server=await serve(root);
check('group browser uses named committed assets',(await verifyServedAssets(server.url,root,expectedShaFor(root))).ok);
const browser=await launchLocalBrowser(chromium,{executablePath:process.env.CHROME_PATH});
const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const select=id=>page.locator(`#crewList input[value="${id}"]`).check();
async function openCrewEntry(id='crewOpenBtn') {
    if(!(await page.locator('#'+id).isVisible()))await page.locator('.bulk-toggle').click();
    await page.locator('#'+id).click();
}
try {
    await page.goto(server.url);
    await page.evaluate(()=>{
        todayStr=()=> '2026-10-08';State.date=todayStr();State.layer='actual';
        State.schedule.workers=[
            {id:'w_a',name:'TEST يوسف',active:true,dailyRate:500,hourlyRate:50},
            {id:'w_b',name:'TEST דוד',active:true,dailyRate:600,hourlyRate:60},
            {id:'w_c',name:'TEST جود',active:true,dailyRate:550,hourlyRate:55}];
        State.schedule.places=[{id:'p_a',name:'TEST אתר أ',active:true},{id:'p_b',name:'TEST אתר ב',active:true}];
        State.commitRoster();showView('day');
    });
    const original=await page.evaluate(()=>JSON.stringify(State.schedule));
    suite('selection, Arabic/Hebrew typing and cancellation');
    await openCrewEntry();
    await page.waitForFunction(()=>document.activeElement.id==='crewTitle');
    check('dialog begins at its named heading',await page.locator('#crewTitle').isVisible());
    check('first worker is visible without scrolling through setup',await page.locator('.crew-choice').first().evaluate(n=>{const r=n.getBoundingClientRect();return r.top>=0&&r.bottom<innerHeight;}));
    await page.locator('#crewSearch').fill('يوسف');
    same('Arabic finds one name',await page.locator('#crewList input').count(),1);await select('w_a');
    same('search keeps keyboard focus when typing',await page.locator('#crewSearch').inputValue(),'يوسف');
    await page.locator('#crewSearch').fill('דוד');
    same('Hebrew finds one name',await page.locator('#crewList input').count(),1);
    same('input is not replaced during filtering',await page.evaluate(()=>document.activeElement.id),'crewSearch');
    check('hidden selections are explicit',(await page.locator('#crewCount').innerText()).includes('1 מוסתרים'));
    await select('w_b');await page.locator('#crewSearch').fill('');
    same('independent selections survive filtering',await page.locator('#crewList input:checked').count(),2);
    await page.keyboard.press('Escape');
    same('Escape restores the opener',await page.evaluate(()=>document.activeElement.id),'crewOpenBtn');
    same('opening and cancelling changed no data',await page.evaluate(()=>JSON.stringify(State.schedule)),original);
    await openCrewEntry();same('reopening starts with no stale selection',await page.locator('#crewList input:checked').count(),0);
    same('reopening begins at the heading',await page.locator('#crewModal .modal-content').evaluate(n=>n.scrollTop),0);

    suite('review counts, cancellation and one group commit');
    await select('w_a');await select('w_b');await page.locator('#crewPlace').selectOption('p_a');
    await page.locator('#crewPreview').click();
    check('preview identifies count and site',(await page.locator('#askMessage').innerText()).includes('יתווספו 2 רישומים') && (await page.locator('#askMessage').innerText()).includes('TEST אתר أ'));
    await page.locator('#askCancel').click();
    same('return keeps selection',await page.locator('#crewList input:checked').count(),2);
    same('cancelled review changes no data',await page.evaluate(()=>JSON.stringify(State.schedule)),original);
    await page.locator('#crewPreview').click();await page.locator('#askOk').click();
    await page.waitForFunction(()=>document.getElementById('crewModal').style.display==='none');
    same('both selected workers saved once',await page.evaluate(()=>['w_a','w_b'].map(id=>entriesFor(State.schedule,State.date,id,'actual').map(e=>e.placeId))),[['p_a'],['p_a']]);
    await page.locator('#undoBtn').click();same('one undo removes the group',await page.evaluate(()=>entriesFor(State.schedule,State.date,'w_a','actual').length+entriesFor(State.schedule,State.date,'w_b','actual').length),0);
    await page.locator('#redoBtn').click();

    suite('range holiday protects old work and spans Saturday');
    await openCrewEntry('holidayRangeBtn');await select('w_a');await select('w_b');
    await page.locator('#crewTo').fill('2026-10-10');await page.locator('#crewPreview').click();
    const text=await page.locator('#askMessage').innerText();
    check('scope names four added cells, two preserved and Saturday',text.includes('יתווספו 4 רישומים')&&text.includes('2 רישומים קיימים')&&text.includes('כולל שבת'));
    await page.locator('#askOk').click();
    check('Saturday saved while existing work survives',await page.evaluate(()=>isAbsent(State.schedule,'2026-10-10','w_a','actual')&&entriesFor(State.schedule,'2026-10-08','w_a','actual').length===1));
    same('range save returns keyboard to its opener',await page.evaluate(()=>document.activeElement.id),'holidayRangeBtn');

    suite('changing date and remote work during confirmation refuse the whole group');
    await openCrewEntry();await select('w_c');await page.locator('#crewPlace').selectOption('p_a');await page.locator('#crewPreview').click();
    await page.evaluate(()=>{State.date='2026-10-11';render();});await page.locator('#askOk').click();
    await page.waitForFunction(()=>document.getElementById('askMessage').textContent.includes('השתנו'));
    same('date change writes neither date',await page.evaluate(()=>['2026-10-08','2026-10-11'].map(date=>entriesFor(State.schedule,date,'w_c','actual').length)),[0,0]);
    await page.locator('#askOk').click();await page.keyboard.press('Escape');
    await page.evaluate(()=>{State.date='2026-10-08';render();});
    await openCrewEntry();await select('w_c');await page.locator('#crewPlace').selectOption('p_a');await page.locator('#crewPreview').click();
    await page.evaluate(()=>State.commit(assignPlace(State.schedule,'2026-10-08','w_c','actual','p_b','double')));
    await page.locator('#askOk').click();await page.waitForFunction(()=>document.getElementById('askMessage').textContent.includes('השתנו'));
    same('received/newer fact stays intact',await page.evaluate(()=>entriesFor(State.schedule,'2026-10-08','w_c','actual').map(e=>[e.placeId,e.rate])),[['p_b','double']]);
    await page.locator('#askOk').click();await page.keyboard.press('Escape');

    suite('site grouping is view-only; pairs enter the existing reorder review');
    const beforeOrder=await page.evaluate(()=>JSON.stringify(State.schedule));
    await openCrewEntry();await page.locator('#crewFilters > summary').click();await page.locator('#crewGrouping').selectOption('sites');
    same('both site groups labelled',await page.locator('.crew-group-title').count(),2);
    await select('w_a');await select('w_c');await page.locator('#crewAdjacent').click();
    same('only the draft is reordered',await page.evaluate(()=>reorderDraft),['w_a','w_c','w_b']);
    same('review has not changed the roster',await page.evaluate(()=>JSON.stringify(State.schedule)),beforeOrder);
    await page.evaluate(()=>closeReorder());same('cancel discards adjacency draft',await page.evaluate(()=>JSON.stringify(State.schedule)),beforeOrder);
    await page.evaluate(()=>showView('day'));

    suite('small phone, large text, keyboard trap and print');
    for(const width of [320,390]) {
        await page.setViewportSize({width,height:844});await openCrewEntry();
        if(width===320)await page.evaluate(()=>{
            const sizes=[...document.querySelectorAll('#crewModal *')].map(n=>[n,parseFloat(getComputedStyle(n).fontSize)]);
            sizes.forEach(([n,size])=>n.style.fontSize=`${size*2}px`);
        });
        const geometry=await page.locator('#crewModal .modal-content').evaluate(node=>({
            overflow:node.scrollWidth>node.clientWidth+1,
            small:[...node.querySelectorAll('button,input,select')].filter(n=>n.offsetParent!==null).filter(n=>{const r=n.getBoundingClientRect();return r.width<44||r.height<44;}).map(n=>n.id),
            inputs:[...node.querySelectorAll('input,select')].filter(n=>n.offsetParent!==null).every(n=>parseFloat(getComputedStyle(n).fontSize)>=16)
        }));
        check(`${width}: no horizontal overflow`,!geometry.overflow,JSON.stringify(geometry));
        check(`${width}: touch and text floors`,!geometry.small.length&&geometry.inputs,JSON.stringify(geometry));
        await page.locator('#crewSearch').focus();
        for(let i=0;i<25;i++)await page.keyboard.press('Tab');
        check(`${width}: keyboard stays in dialog`,await page.evaluate(()=>document.getElementById('crewModal').contains(document.activeElement)));
        await page.emulateMedia({media:'print'});check(`${width}: no action controls printed`,!(await page.locator('#crewModal').isVisible())&&!(await page.locator('#crewOpenBtn').isVisible()));await page.emulateMedia({media:'screen'});
        await page.keyboard.press('Escape');
        await page.evaluate(()=>document.querySelectorAll('#crewModal [style]').forEach(n=>{if(n.id!=='crewModal')n.style.removeProperty('font-size');}));
    }

    suite('offline close/reopen keeps the completed range');
    await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
    await page.reload();await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
    await context.setOffline(true);await page.reload();
    check('range survives offline reopening',await page.evaluate(()=>isAbsent(State.schedule,'2026-10-10','w_b','actual')));
    same('newer double day survives offline reopening',await page.evaluate(()=>entriesFor(State.schedule,'2026-10-08','w_c','actual')[0].rate),'double');
    await context.setOffline(false);
    same('no browser exceptions',errors,[]);
} finally {await browser.close();await server.close();}
report();
