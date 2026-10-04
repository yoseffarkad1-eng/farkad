import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {launchLocalBrowser} from './network-guard.mjs';
import {expectedShaFor, verifyServedAssets} from './treecheck.mjs';
import {suite, check, same, report} from './runner.mjs';

const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
check('navigation uses the named tree', (await verifyServedAssets(server.url, root, expectedShaFor(root))).ok);
const browser = await launchLocalBrowser(chromium);
const page = await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const errors = [];
page.on('pageerror', error=>errors.push(error.message));
try {
    await page.goto(server.url);
    await page.evaluate(()=>{
        todayStr = ()=> '2026-10-04';
        State.date = '2026-10-04'; State.schedule = emptySchedule();
        State.schedule.workers = Array.from({length:12},(_,i)=>({id:`w_${i}`,name:`עובד עם שם ארוך לבדיקה ${i}`,active:true,dailyRate:450}));
        State.schedule.places = [{id:'p_one',name:'הרצליה',active:true}];
        State.schedule.workers.forEach(w=>assignPlace(State.schedule,State.date,w.id,'actual','p_one'));
        render();
    });
    const before = await page.evaluate(()=>JSON.stringify(State.schedule));
    suite('named tablist, one entry point and manual RTL keyboard activation');
    same('navigation has a name', await page.locator('.tabs').getAttribute('aria-label'), 'ניווט ראשי');
    same('all five icons use the same drawn family', await page.locator('.tab-icon svg').count(), 5);
    same('only one tab enters the Tab sequence', await page.locator('.tabs [tabindex="0"]').count(), 1);
    await page.locator('#tab-day').focus();
    await page.keyboard.press('ArrowLeft');
    same('left in RTL moves focus towards week', await page.evaluate(()=>document.activeElement.id), 'tab-week');
    same('arrows alone do not switch the work screen', await page.evaluate(()=>currentView), 'day');
    await page.keyboard.press('Enter');
    same('Enter activates the existing week route', await page.evaluate(()=>currentView), 'week');
    same('active tab is announced as selected', await page.locator('#tab-week').getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Home');
    same('Home reaches the first tab', await page.evaluate(()=>document.activeElement.id), 'tab-day');
    await page.keyboard.press('ArrowRight');
    same('right wraps from the first tab to reports', await page.evaluate(()=>document.activeElement.id), 'tab-reports');
    await page.keyboard.press('Space');
    same('Space activates the existing reports route', await page.evaluate(()=>currentView), 'reports');
    await page.keyboard.press('Home'); await page.keyboard.press('End');
    same('End reaches the last tab', await page.evaluate(()=>document.activeElement.id), 'tab-reports');
    same('roving focus retains exactly one Tab entry', await page.locator('.tabs [tabindex="0"]').count(), 1);
    await page.locator('#tab-advances').click();
    same('pointer navigation remains available to every tab', await page.evaluate(()=>currentView), 'advances');
    same('navigation makes no work or money changes', await page.evaluate(()=>JSON.stringify(State.schedule)), before);

    suite('the phone bar stays at the screen edge with full targets');
    for (const width of [320,390,430]) for (const colorScheme of ['light','dark']) {
        await page.setViewportSize({width,height:844});
        await page.emulateMedia({colorScheme});
        for (const view of ['day','week','roster','advances','reports']) {
            await page.evaluate(view=>showView(view),view);
            await page.waitForTimeout(50);
            const geometry = await page.locator('.tabs').evaluate(n=>{
                const r=n.getBoundingClientRect();
                return {bottom:r.bottom,height:r.height,fixed:getComputedStyle(n).position==='fixed',
                    targets:[...n.querySelectorAll('.tab')].every(t=>{const b=t.getBoundingClientRect();return b.width>=44&&b.height>=44;}),
                    labels:[...n.querySelectorAll('.tab')].every(t=>parseFloat(getComputedStyle(t).fontSize)>=15 && [...t.querySelectorAll('span:not(.tab-icon)')].some(s=>{const b=s.getBoundingClientRect();return b.width>10&&b.height>10&&getComputedStyle(s).clipPath==='none';})),
                    overflow:document.documentElement.scrollWidth>innerWidth+1};
            });
            check(`${width}/${colorScheme}/${view}: navigation is fixed to the viewport bottom`,geometry.fixed&&Math.abs(geometry.bottom-844)<=1,JSON.stringify(geometry));
            check(`${width}/${colorScheme}/${view}: labels and targets stay readable`,geometry.targets&&geometry.labels&&!geometry.overflow,JSON.stringify(geometry));
        }
    }
    await page.evaluate(()=>{showView('reports');scrollTo(0,document.documentElement.scrollHeight);});
    const clears = await page.locator('.report-worker-tile').last().evaluate(n=>{
        const r=n.getBoundingClientRect(),bar=document.querySelector('.tabs').getBoundingClientRect();
        return r.bottom<=bar.top&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('.report-worker-tile')===n;
    });
    check('last report card scrolls above the bar and remains tappable',clears);

    suite('reading contrast follows the device theme without relying on site colours');
    for (const colorScheme of ['light','dark']) {
        await page.emulateMedia({colorScheme});
        const contrast = await page.evaluate(()=>{
            const styles=getComputedStyle(document.documentElement);
            function luminance(hex) {
                const channels=hex.trim().slice(1).match(/../g).map(x=>parseInt(x,16)/255)
                    .map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
                return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
            }
            const value=key=>luminance(styles.getPropertyValue(key));
            const ratio=(a,b)=>(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
            const grounds=['--surface','--paper','--surface-2'];
            return {body:parseFloat(getComputedStyle(document.body).fontSize),
                ordinary:['--ink','--ink-2','--ink-3'].flatMap(ink=>grounds.map(ground=>ratio(value(ink),value(ground)))),
                primary:ratio(value('--accent'),value('--surface')),
                sites:Array.from({length:10},(_,i)=>ratio(1,value(`--site-${i+1}`)))};
        });
        check(`${colorScheme}: main type is at least 18px`,contrast.body>=18);
        check(`${colorScheme}: ordinary text exceeds 7:1 on its three surfaces`,contrast.ordinary.every(n=>n>=7),JSON.stringify(contrast));
        check(`${colorScheme}: primary figures and all site names exceed 7:1`,contrast.primary>=7&&contrast.sites.every(n=>n>=7),JSON.stringify(contrast));
    }
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.evaluate(()=>openWorkerDays('w_0'));
    same('reduced-motion preference removes the detail entrance animation',await page.locator('#workerDaysModal .modal-content').evaluate(n=>getComputedStyle(n).animationName),'none');
    await page.evaluate(()=>closeWorkerDays());
    same('no browser errors',errors,[]);
} finally { await browser.close(); await server.close(); }
report();
