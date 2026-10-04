import {chromium} from 'playwright';
import {launchLocalBrowser} from './network-guard.mjs';
import {serve} from './serve.mjs';
import {expectedShaFor, verifyServedAssets} from './treecheck.mjs';
import {suite, check, same, report} from './runner.mjs';

const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
check('day polish uses the named tree', (await verifyServedAssets(server.url, root, expectedShaFor(root))).ok);
const browser = await launchLocalBrowser(chromium, {executablePath: process.env.CHROME_PATH});
const page = await browser.newPage({viewport:{width:390,height:844}});
const errors = [];
page.on('pageerror', e => errors.push(e.message));
async function seed() {
    await page.goto(server.url);
    await page.evaluate(() => {
        todayStr = () => '2026-10-04';
        State.date = '2026-10-04';
        State.schedule.workers = [
            {id:'w_a',name:'David דוד',active:true,dailyRate:400},
            {id:'w_b',name:'מוחמד עבד אל רחמן מחאמיד',active:true,dailyRate:400},
            {id:'w_c',name:'עלי חסן',active:true,dailyRate:400},
            {id:'w_d',name:'עובד נוסף',active:true,dailyRate:400}
        ];
        State.schedule.places = [
            {id:'p_a',name:'הרצליה',active:true},
            {id:'p_b',name:'אתר עם שם ארוך במיוחד לבדיקה',active:true}
        ];
        assignPlace(State.schedule,State.date,'w_c','actual','p_b');
        markAbsent(State.schedule,State.date,'w_d','actual');
        State.save(); render(); openWorkerPicker('p_a');
    });
    await page.waitForTimeout(100);
}
try {
    await seed();
    suite('worker search changes visibility, never the record or roster order');
    same('picker enters its heading without requesting the keyboard', await page.evaluate(()=>document.activeElement.id), 'workerPickerTitle');
    check('selected date stays visible in the picker', (await page.locator('#workerPickerContext').textContent()).includes('04/10/2026'));
    check('unrecorded state is named', await page.locator('[data-worker-id="w_a"] .picker-note').textContent() === 'טרם נרשם');
    check('absence is distinct from unrecorded', await page.locator('[data-worker-id="w_d"] .picker-note').textContent() === 'נעדר ביום הזה');
    check('a worker assigned elsewhere names that site', (await page.locator('[data-worker-id="w_c"] .picker-note').textContent()).includes('אתר עם שם'));
    const before = await page.evaluate(()=>JSON.stringify(State.schedule));
    const order = await page.locator('.picker-row').evaluateAll(nodes=>nodes.map(n=>n.dataset.workerId));
    const search = page.locator('#workerPickerSearch');
    check('clear search is disabled while the field is empty', await page.locator('#workerPickerClear').isDisabled());
    same('unfiltered list reports its size', await page.locator('#workerPickerSummary').textContent(), '4 עובדים ברשימה');
    await search.fill(' david ');
    same('case and surrounding whitespace do not affect search', await page.locator('.picker-row').count(), 1);
    same('search retains typing focus', await page.evaluate(()=>document.activeElement.id), 'workerPickerSearch');
    await search.fill('אין כזה עובד');
    same('no-match search has no worker actions', await page.locator('.picker-row').count(), 0);
    check('no-match result is explained', await page.locator('.picker-no-results').isVisible());
    same('searching has not changed any stored record', await page.evaluate(()=>JSON.stringify(State.schedule)), before);
    await page.getByRole('button',{name:'הצג את כל העובדים',exact:true}).click();
    same('empty-state recovery restores every worker', await page.locator('.picker-row').count(), 4);
    same('empty-state recovery returns to the search field', await page.evaluate(()=>document.activeElement.id), 'workerPickerSearch');
    await search.fill('דוד');
    await page.locator('.picker-row button').click();
    same('adding retains the search', await search.inputValue(), 'דוד');
    same('adding retains the focused worker action', await page.evaluate(()=>document.activeElement.closest('.picker-row')?.dataset.workerId), 'w_a');
    check('add uses the existing durable assignment', await page.evaluate(()=>workersAtPlace(State.schedule,State.date,'p_a','actual').includes('w_a')));
    same('selected worker action exposes its pressed state', await page.locator('.picker-row button').getAttribute('aria-pressed'), 'true');
    check('remove action names both worker and site', /David דוד.*הרצליה/.test((await page.locator('.picker-row button').getAttribute('aria-label')).replace(/[\u2066-\u2069]/g,'')));
    await page.locator('.picker-row button').click();
    check('remove uses the existing unassignment', await page.evaluate(()=>!workersAtPlace(State.schedule,State.date,'p_a','actual').includes('w_a')));
    await search.fill('');
    same('clearing search restores the frozen order', await page.locator('.picker-row').evaluateAll(nodes=>nodes.map(n=>n.dataset.workerId)), order);
    await search.fill('דוד');
    await page.evaluate(()=>{closeWorkerPicker();openWorkerPicker('p_b');});
    same('opening another site resets the search', await search.inputValue(), '');
    same('another site shows the whole crew', await page.locator('.picker-row').count(), 4);
    await page.evaluate(()=>{closeWorkerPicker();openPlacePicker('w_c');});
    same('place choice exposes the selected site', await page.locator('#placePickerList [aria-pressed="true"]').count(), 1);
    check('place picker also names the selected day', (await page.locator('#placePickerContext').textContent()).includes('04/10/2026'));
    same('each place has a stable colour marker', await page.locator('#placePickerList .place-choice-dot').count(), 2);
    same('selected place has a visible check', await page.locator('#placePickerList .place-choice-check').count(), 1);
    await page.evaluate(()=>{closePlacePicker();openAssignSheet('w_d');});
    same('assignment sheet explicitly names absence', await page.locator('.sheet-status').textContent(), 'נעדר ביום הזה');
    await page.evaluate(()=>{closeAssignSheet();openAssignSheet('w_a');});
    same('assignment sheet explicitly names unrecorded work', await page.locator('.sheet-status').textContent(), 'טרם נרשם ביום הזה');
    await page.evaluate(()=>{closeAssignSheet();openAssignSheet('w_c');});
    same('assignment sheet identifies a recorded site', await page.locator('.sheet-status').textContent(), 'רשום באתר אחד');
    await page.evaluate(()=>closeAssignSheet());
    const beforePreview = await page.evaluate(()=>JSON.stringify(State.schedule));
    const expectedMessage = await page.evaluate(()=>dayMessage(State.date,State.layer,undefined,'p_b'));
    await page.evaluate(()=>showDayMessage('p_b'));
    same('preview retains the exact message text', await page.locator('#shareText').inputValue(), expectedMessage);
    check('preview identifies selected site and date', /אתר עם שם.*04\/10\/2026/.test(await page.locator('#shareContext').textContent()));
    await page.locator('#shareStyles button').nth(1).click();
    same('changing style retains the one-site message boundary', await page.locator('#shareText').inputValue(), await page.evaluate(()=>dayMessage(State.date,State.layer,'crane','p_b')));
    same('preview makes no work-record changes', await page.evaluate(()=>JSON.stringify(State.schedule)), beforePreview);
    await page.evaluate(()=>closeShareModal());
    for (const id of ['workerFormPhone','workerFormId','workerFormHourly']) {
        check(`${id} has a persistent visible field label`, await page.locator(`label[for="${id}"]`).count() === 1);
    }

    suite('new picker and rate groups fit narrow screens and larger text');
    for (const width of [320,430]) {
      for (const colorScheme of ['light','dark']) {
        await page.emulateMedia({colorScheme});
        await page.setViewportSize({width,height:844});
        await seed();
        await page.evaluate(()=>{
            const sizes=[...document.querySelectorAll('#workerPickerModal *')].map(n=>[n,parseFloat(getComputedStyle(n).fontSize)]);
            sizes.forEach(([n,size])=>n.style.fontSize=`${size*2}px`);
        });
        const fit = await page.locator('#workerPickerModal .modal-content').evaluate(n=>({fits:n.scrollWidth<=n.clientWidth+1,search:document.getElementById('workerPickerSearch').getBoundingClientRect().width>100}));
        check(`${width}px ${colorScheme} double text: picker fits without squeezing search`, fit.fits && fit.search, JSON.stringify(fit));
        await page.evaluate(()=>{closeWorkerPicker();openAssignSheet('w_c');});
        check(`${width}px: selected-site rates remain visible`, await page.locator('.sheet-rate-row').isVisible());
        const rates=await page.locator('.sheet-rate-row').evaluate(n=>({fits:n.scrollWidth<=n.clientWidth+1,buttons:[...n.querySelectorAll('button')].every(b=>b.getBoundingClientRect().height>=44)}));
        check(`${width}px: rate group fits and keeps finger targets`, rates.fits && rates.buttons, JSON.stringify(rates));
        await page.evaluate(()=>closeAssignSheet());
      }
    }
    same('no page errors', errors, []);
} finally { await browser.close(); server.close(); }
report();
