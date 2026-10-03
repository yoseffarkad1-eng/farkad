import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {launchLocalBrowser} from './network-guard.mjs';
import {verifyServedAssets, expectedShaFor} from './treecheck.mjs';
import {suite, check, same, report} from './runner.mjs';
const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
check('week browser uses the named tree', (await verifyServedAssets(server.url, root, expectedShaFor(root))).ok);
const browser = await launchLocalBrowser(chromium, {executablePath:process.env.CHROME_PATH});
const page = await browser.newPage({viewport:{width:390,height:844}});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
try {
    await page.goto(server.url);
    await page.evaluate(() => {
        todayStr=()=> '2026-10-07';
        State.date='2026-10-07';
        State.schedule.workers=[
            {id:'w_two',name:'מוחמד עם שם ארוך מאוד לבדיקה',active:true,dailyRate:400},
            {id:'w_absent',name:'עובד בחופש',active:true,dailyRate:400},
            {id:'w_blank',name:'עובד ללא רישום',active:true,dailyRate:400},
            {id:'w_old',name:'עובד שכבר לא פעיל',active:false,dailyRate:400}
        ];
        State.schedule.places=[{id:'p_one',name:'אתר ראשון הרצליה',active:true},{id:'p_two',name:'B7 אתר שני עם שם ארוך במיוחד',active:false}];
        assignPlace(State.schedule,State.date,'w_two','actual','p_one',RATE_DOUBLE);
        assignPlace(State.schedule,State.date,'w_two','actual','p_two',RATE_EXTRA,2.5);
        markAbsent(State.schedule,State.date,'w_absent','actual');
        assignPlace(State.schedule,State.date,'w_old','actual','p_one');
        assignPlace(State.schedule,'2026-10-08','w_two','actual','p_one');
        State.save();showView('week');
    });
    const snapshot=await page.evaluate(()=>JSON.stringify(State.schedule));
    suite('phone week is a full-text read-only day within the week');
    check('phone opens in readable day mode',await page.locator('.week-phone-panel').isVisible());
    check('grid is hidden on phone until requested',!(await page.locator('.week-table').isVisible()));
    same('seven day choices remain available',await page.locator('[data-week-date]').count(),7);
    same('selected day follows the day being viewed',await page.locator('[data-week-date][aria-pressed=true]').getAttribute('data-week-date'),'2026-10-07');
    same('a worker at two sites counts once',await page.locator('.week-phone-counts').innerText(),'2 עבדו\n1 נעדרו\n1 ללא רישום');
    const two=page.locator('.week-phone-worked [data-worker-id=w_two]');
    same('both sites are spelled out',await two.locator('.site-name').count(),2);
    check('inactive site label remains in historical work',(await two.innerText()).includes('B7 אתר שני עם שם ארוך במיוחד'));
    check('double and precise overtime hours are written in words',(await two.innerText()).includes('יום כפול')&&(await two.innerText()).includes('2.5')&&(await two.innerText()).includes('שעות נוספות'));
    check('inactive worker remains with a status badge',await page.locator('.week-phone-worked [data-worker-id=w_old] .badge').isVisible());
    await page.locator('.week-phone-fold summary').first().click();
    check('absence is visibly distinct from no record',(await page.locator('.week-phone-fold').first().innerText()).includes('נעדר'));
    await page.locator('[data-week-date="2026-10-08"]').click();
    same('day browsing leaves the edited date alone',await page.evaluate(()=>State.date),'2026-10-07');
    same('selection retains keyboard focus',await page.evaluate(()=>document.activeElement.dataset.weekDate),'2026-10-08');
    same('next day shows its own worker count',await page.locator('.week-phone-worked .week-phone-worker').count(),1);
    check('departed worker with no record does not become missing work',!(await page.locator('.week-phone-panel').innerText()).includes('עובד שכבר לא פעיל'));
    await page.evaluate(()=>render());
    same('live redraw keeps selected date',await page.locator('[data-week-date][aria-pressed=true]').getAttribute('data-week-date'),'2026-10-08');
    await page.locator('[data-week-mode=grid]').click();
    check('full week remains one tap away',await page.locator('.week-table').isVisible());
    same('all seven table days still available',await page.locator('.week-table thead th').count(),8);
    await page.locator('[data-week-mode=days]').click();
    await page.locator('.week-header .nav-fwd').click();
    check('changing weeks selects a day inside the new week',await page.evaluate(()=>weekDates().includes(weekPhoneDate)));
    check('empty day explains that no work is recorded',(await page.locator('.week-phone-worked').innerText()).includes('אין עבודה רשומה'));
    await page.locator('.week-header .nav-back').click();
    await page.locator('[data-week-date="2026-10-07"]').click();
    same('browsing never mutates the shared schedule',await page.evaluate(()=>JSON.stringify(State.schedule)),snapshot);

    suite('phone layout, large text, desktop and print');
    for(const [width,scheme,scale=1] of [[320,'light'],[390,'light'],[430,'dark'],[390,'light',2],[320,'light',2]]) {
        await page.setViewportSize({width,height:844});await page.emulateMedia({colorScheme:scheme});
        await page.evaluate(()=>document.querySelectorAll('#weekView *').forEach(n=>n.style.removeProperty('font-size')));
        if(scale===2) await page.evaluate(()=>{
            const sizes=[...document.querySelectorAll('#weekView *')].map(n=>[n,parseFloat(getComputedStyle(n).fontSize)]);
            sizes.forEach(([n,s])=>n.style.setProperty('font-size',`${s*2}px`,'important'));
        });
        const geometry=await page.evaluate(()=>({
            overflow:document.documentElement.scrollWidth>innerWidth+1,
            small:[...document.querySelectorAll('#weekView button')].filter(n=>n.offsetParent!==null).filter(n=>{const r=n.getBoundingClientRect();return r.width<44||r.height<44;}).map(n=>n.textContent),
            clipped:[...document.querySelectorAll('.week-phone-name strong,.week-phone-entry .site-name')].filter(n=>n.offsetParent!==null).some(n=>n.scrollWidth>n.clientWidth+1),
            tiny:[...document.querySelectorAll('.week-phone span,.week-phone strong,.week-phone bdi')].filter(n=>n.offsetParent!==null && /[\p{L}\p{N}]/u.test(n.textContent)).some(n=>parseFloat(getComputedStyle(n).fontSize)<14)
        }));
        check(`${width}/${scheme}/${scale}: page stays within viewport`,!geometry.overflow,JSON.stringify(geometry));
        check(`${width}/${scheme}/${scale}: touch targets stay 44px`,!geometry.small.length,JSON.stringify(geometry));
        check(`${width}/${scheme}/${scale}: full names fit and text remains readable`,!geometry.clipped&&!geometry.tiny,JSON.stringify(geometry));
        if(process.env.WEEK_SCREENSHOT_DIR){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${process.env.WEEK_SCREENSHOT_DIR}/week-${width}-${scheme}-${scale}.png`,fullPage:true});}
    }
    await page.evaluate(()=>document.querySelectorAll('#weekView *').forEach(n=>n.style.removeProperty('font-size')));
    await page.emulateMedia({media:'print'});
    check('print still renders the original complete table',await page.locator('.week-table').isVisible());
    check('phone controls do not leak into print',!(await page.locator('.week-phone').isVisible()));
    await page.emulateMedia({media:'screen'});await page.setViewportSize({width:1100,height:844});
    check('desktop remains the original week table',await page.locator('.week-table').isVisible()&&!(await page.locator('.week-phone').isVisible()));
    await page.setViewportSize({width:390,height:844});
    await page.locator('[data-week-date="2026-10-08"]').click();
    await page.locator('.week-phone-open').click();
    same('explicit edit opens exactly the selected day',await page.evaluate(()=>State.date),'2026-10-08');
    check('edit opens day screen',await page.locator('#dayView').isVisible());
    same('opening for edit still does not alter work',await page.evaluate(()=>JSON.stringify(State.schedule)),snapshot);
    check('no uncaught errors',errors.length===0,JSON.stringify(errors));
}finally{await browser.close();await server.close();}
report();
