// Compact conflict review must never silently resolve, discard or resend a fact.
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {launchLocalBrowser} from './network-guard.mjs';
import {verifyServedAssets, expectedShaFor} from './treecheck.mjs';
import {suite, check, same, report} from './runner.mjs';
const root=new URL('..',import.meta.url).pathname,server=await serve(root);
check('conflict browser uses named committed assets',(await verifyServedAssets(server.url,root,expectedShaFor(root))).ok);
const browser=await launchLocalBrowser(chromium,{executablePath:process.env.CHROME_PATH});
const page=await browser.newPage({viewport:{width:320,height:844}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try {
    await page.goto(server.url);
    await page.evaluate(()=>{
        State.date='2026-10-08';State.layer='actual';
        State.schedule.workers=[{id:'w_a',name:'TEST يوسف',active:true,dailyRate:500},{id:'w_b',name:'TEST דוד',active:true,dailyRate:600}];
        State.schedule.places=[{id:'p_a',name:'TEST أ',active:true},{id:'p_b',name:'TEST ב',active:true}];State.commitRoster();
        State.commitMany(['w_a','w_b'].map(id=>assignPlace(State.schedule,State.date,id,'actual','p_a')));
        FarkadSync._baseDoc={revision:3,days:{'2026-10-08':{actual:{
            w_a:{entries:[{placeId:'p_b'}],rates:{daily:500,hourly:0}},
            w_b:{entries:[{placeId:'p_b'}],rates:{daily:600,hourly:0}}
        }}}};
        FarkadSync.holdContested(['days.2026-10-08.actual.w_a','days.2026-10-08.actual.w_b']);openSettings();
    });
    const snapshot=()=>page.evaluate(()=>JSON.stringify({schedule:State.schedule,held:FarkadSync.heldRecords(),outbox:[...FarkadSync._outbox]}));
    const before=await snapshot();
    suite('one short visible warning, optional explanation, explicit per-record comparison');
    const compact=await page.locator('#heldReviewCount').count()===1;
    check('unresolved count stays visible above the rows',compact && (await page.locator('#heldReviewCount').innerText()).includes('2'));
    same('each held row has a review summary',await page.locator('details.held-row > summary').count(),2);
    if(compact) {
        check('explanation starts collapsed',!(await page.locator('.held-help').evaluate(n=>n.open)));
        same('decisions start behind the row review',await page.locator('details.held-row[open]').count(),0);
        same('drawing does not resolve or send either version',await snapshot(),before);
        await page.locator('.held-title').first().click();
        check('both versions and actions become readable',await page.locator('.held-row').first().getByText('להשאיר את שלי',{exact:true}).isVisible()&&await page.locator('.held-row').first().getByText('לקחת מהענן',{exact:true}).isVisible());
        await page.locator('.held-row').first().getByText('להשאיר את שלי',{exact:true}).focus();
        await page.evaluate(()=>{
            FarkadSync._baseDoc.days['2026-10-08'].actual.w_b.entries[0].rate='double';renderHeldRecords();
        });
        same('background redraw retains the open comparison',await page.locator('details.held-row[open]').count(),1);
        same('keyboard stays on the same decision',await page.evaluate(()=>document.activeElement.textContent),'להשאיר את שלי');
        await page.locator('.held-row').first().getByText('לקחת מהענן',{exact:true}).click();
        await page.locator('#askCancel').click();
        same('cancelling keeps both conflicts',await page.locator('.held-row').count(),2);
        same('cancelling keeps the local work',await page.evaluate(()=>entriesFor(State.schedule,'2026-10-08','w_a','actual')[0].placeId),'p_a');
        // A new snapshot during the existing confirmation must keep the old value.
        await page.locator('.held-row').first().getByText('לקחת מהענן',{exact:true}).click();
        await page.evaluate(()=>{FarkadSync._baseDoc.days['2026-10-08'].actual.w_a.entries[0].rate='double';});
        await page.locator('#askOk').click();await page.waitForFunction(()=>document.getElementById('askTitle').textContent==='הרישום השתנה');
        same('stale decision never replaces local work',await page.evaluate(()=>entriesFor(State.schedule,'2026-10-08','w_a','actual')[0].placeId),'p_a');
        await page.locator('#askOk').click();
        await page.locator('.held-help summary').click();
        check('complete old explanation remains available',(await page.locator('.held-help').innerText()).includes('כל שורה שמורה כאן ואינה נשלחת עד שתחליט'));
        await page.evaluate(()=>{
            const sizes=[...document.querySelectorAll('#heldRecords *')].map(n=>[n,parseFloat(getComputedStyle(n).fontSize)]);
            sizes.forEach(([n,s])=>n.style.fontSize=`${s*2}px`);
        });
        check('320px with doubled text stays inside the panel',await page.locator('#heldRecords').evaluate(n=>n.scrollWidth<=n.clientWidth+1));
        check('review summaries have a finger-sized target',await page.locator('.held-title').evaluateAll(nodes=>nodes.every(n=>{const r=n.getBoundingClientRect();return r.width>=44&&r.height>=44;})));
        await page.evaluate(()=>{State.saveFailed=true;updateSyncNotice();renderSettingsIfOpen();});
        check('failed-save warning remains visible',await page.locator('#storageBanner').isVisible()
            && (await page.locator('#storageBanner').innerText()).includes('לא נשמר'));
    }
    same('no browser exceptions',errors,[]);
}finally{await browser.close();await server.close();}
report();
