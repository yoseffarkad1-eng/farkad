import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {launchLocalBrowser} from './network-guard.mjs';
import {verifyServedAssets, expectedShaFor} from './treecheck.mjs';
import {suite, check, same, report} from './runner.mjs';
const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
check('roster browser uses the named tree', (await verifyServedAssets(server.url, root, expectedShaFor(root))).ok);
const browser = await launchLocalBrowser(chromium, {executablePath: process.env.CHROME_PATH});
const page = await browser.newPage({viewport: {width: 390, height: 844}});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
    await page.goto(server.url);
    await page.evaluate(() => {
        todayStr = () => '2026-10-03';
        State.schedule.workers = [
            {id:'w_week',name:'עובד שבועי',active:true,dailyRate:450,phone:'0501234567',payCycles:'2026-10-02=weekly'},
            {id:'w_next',name:'עובד עם שם ארוך במיוחד לבדיקה',active:true,dailyRate:500,payCycles:'2026-10-09=weekly'},
            {id:'w_off',name:'עובד בחופשה',active:false,dailyRate:400,idNumber:'123456789'}
        ];
        State.schedule.places = [{id:'p_crew',name:'אתר העבודה הראשי',active:true}];
        State.commitRoster();
        showView('roster');
    });
    const before = await page.evaluate(() => JSON.stringify(State.schedule));
    suite('search is a view of all workers, including disabled ones');
    const search = page.locator('#rosterWorkerSearch');
    await search.fill('050123');
    same('phone finds the intended worker', await page.locator('#workerList .roster-row').count(), 1);
    check('current weekly cycle is labelled', (await page.locator('#workerList .crew-cycle').innerText()).includes('תשלום שבועי'));
    await search.fill('123456789');
    check('ID search includes a disabled worker', await page.locator('[data-worker-id="w_off"]').isVisible());
    check('disabled result has its existing reactivation switch', await page.locator('[data-worker-id="w_off"] [role=switch]').getAttribute('aria-checked') === 'false');
    await search.fill('לא קיים');
    check('empty search explains the result', (await page.locator('#workerList').innerText()).includes('לא נמצאו עובדים'));
    await page.locator('#rosterSearchClear').click();
    same('clearing restores every row', await page.locator('#workerList .roster-row').count(), 3);
    same('clearing keeps typing focus', await page.evaluate(() => document.activeElement.id), 'rosterWorkerSearch');
    same('future cycle does not appear early', await page.locator('[data-worker-id="w_next"] .crew-cycle').innerText(), 'תשלום כל שבועיים');
    await search.fill('שבועי');
    await page.evaluate(() => render());
    same('live redraw preserves search text', await search.inputValue(), 'שבועי');
    same('live redraw preserves filtered results', await page.locator('#workerList .roster-row').count(), 1);
    await page.locator('#rosterSearchClear').click();
    same('search never modifies shared worker data', await page.evaluate(() => JSON.stringify(State.schedule)), before);
    await page.locator('[data-worker-id="w_week"] .crew-edit').click();
    same('labelled edit opens the right worker', await page.locator('#workerFormName').inputValue(), 'עובד שבועי');
    await page.evaluate(() => closeWorkerForm());
    await page.locator('.crew-shortcuts').getByRole('button', {name:'אתרים ↓',exact:true}).click();
    same('site shortcut moves keyboard focus', await page.evaluate(() => document.activeElement.id), 'placesHeading');
    await page.locator('.crew-shortcuts').getByRole('button', {name:'עובדים ↓',exact:true}).click();
    same('worker shortcut moves keyboard focus', await page.evaluate(() => document.activeElement.id), 'workersHeading');

    suite('crew list puts names within reach on a phone');
    const compact = await page.evaluate(() => {
        const view = document.getElementById('rosterView').getBoundingClientRect();
        const row = document.querySelector('[data-worker-id="w_week"]').getBoundingClientRect();
        const search = document.getElementById('rosterWorkerSearch').getBoundingClientRect();
        const tools = document.querySelector('.crew-tools').getBoundingClientRect();
        return {lead:row.top-view.top, height:row.height, searchFirst:search.bottom<=tools.top};
    });
    check('first worker starts within 240px of the crew section', compact.lead <= 240, JSON.stringify(compact));
    check('ordinary worker card stays within 125px without shrinking controls', compact.height <= 125, JSON.stringify(compact));
    check('search precedes the less frequent list tools', compact.searchFirst);
    const archive = page.locator('#workerList .roster-archive');
    await archive.locator('summary').click();
    check('collapsed disabled section really hides its workers', !(await page.locator('[data-worker-id="w_off"]').isVisible()));
    await archive.locator('summary').click();

    suite('roster controls fit small screens and remain legible');
    for (const [width, scheme, scale=1] of [[320,'light'],[390,'light'],[430,'dark'],[1100,'light'],[320,'light',2]]) {
        await page.setViewportSize({width,height:844});
        await page.emulateMedia({colorScheme:scheme});
        await page.waitForTimeout(180);
        if (scale === 2) await page.evaluate(() => {
            const sizes = [...document.querySelectorAll('#rosterView *')].map(node => [node, parseFloat(getComputedStyle(node).fontSize)]);
            sizes.forEach(([node,size]) => node.style.setProperty('font-size', `${size*2}px`, 'important'));
        });
        const geometry = await page.evaluate(() => ({
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
            small: [...document.querySelectorAll('#rosterView button, #rosterView input')]
                .filter(n => n.offsetParent !== null).filter(n => {const r=n.getBoundingClientRect();return r.width<44||r.height<44;}).map(n=>n.textContent),
            readableOff: getComputedStyle(document.querySelector('.roster-off')).opacity === '1'
        }));
        check(`${width}/${scheme}/${scale}: no horizontal overflow`, !geometry.overflow, JSON.stringify(geometry));
        check(`${width}/${scheme}/${scale}: every control meets 44px`, !geometry.small.length, JSON.stringify(geometry));
        check(`${width}/${scheme}/${scale}: inactive workers are not faded`, geometry.readableOff);
        if (process.env.ROSTER_SCREENSHOT_DIR) {
            await page.evaluate(() => scrollTo(0,0));
            await page.screenshot({path:`${process.env.ROSTER_SCREENSHOT_DIR}/crew-${width}-${scheme}-${scale}.png`,fullPage:true});
        }
    }
    await page.evaluate(() => document.querySelectorAll('#rosterView *').forEach(node => node.style.removeProperty('font-size')));
    await page.evaluate(() => { State.schedule.workers=[];State.schedule.places=[];renderRoster(); });
    same('empty worker heading resets its count', await page.locator('#workersHeading').innerText(), 'עובדים פעילים (0)');
    same('empty site heading resets its count', await page.locator('#placesHeading').innerText(), 'אתרי עבודה (0)');
    check('no uncaught browser errors', errors.length===0, JSON.stringify(errors));
} finally { await browser.close();await server.close(); }
report();
