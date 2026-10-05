import {chromium} from 'playwright';
import {createECDH, randomBytes} from 'node:crypto';
import {serve} from './serve.mjs';
import {launchLocalBrowser} from './network-guard.mjs';
import {verifyServedAssets, expectedShaFor} from './treecheck.mjs';
import {suite, check, same, report} from './runner.mjs';
const root = new URL('..', import.meta.url).pathname;
const server = await serve(root), browser = await launchLocalBrowser(chromium, {executablePath: process.env.CHROME_PATH});
const key = createECDH('prime256v1'); key.generateKeys();
const publicKey = key.getPublicKey().toString('base64url');
const serialized = {endpoint: 'https://fcm.googleapis.com/fcm/send/local-test', keys: {p256dh: publicKey, auth: randomBytes(16).toString('base64url')}};
const page = await browser.newPage({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
    check('reminder browser uses the named tree', (await verifyServedAssets(server.url, root, expectedShaFor(root))).ok);
    await page.addInitScript(({serialized}) => {
        window.pushFixture = {permission: 'default', promptCalls: 0, subscription: null, serverDevice: null, requests: [], fail: ''};
        const f = window.pushFixture;
        const subscription = {endpoint: serialized.endpoint, toJSON: () => serialized,
            unsubscribe: async () => { if (f.fail === 'unsubscribe') throw Error('offline'); f.subscription = null; return true; }};
        const registration = {pushManager: {getSubscription: async () => f.subscription,
            subscribe: async options => { f.options = {userVisibleOnly: options.userVisibleOnly, keyLength: options.applicationServerKey.length}; f.subscription = subscription; return subscription; }}};
        Object.defineProperty(navigator.serviceWorker, 'ready', {get: () => Promise.resolve(registration)});
        Object.defineProperty(window, 'PushManager', {value: function () {}, configurable: true});
        Object.defineProperty(window, 'Notification', {value: {get permission() { return f.permission; },
            requestPermission: async () => { f.promptCalls++; f.wasGesture = navigator.userActivation.isActive; return f.permission; }}, configurable: true});
    }, {serialized});
    await page.goto(server.url);
    const before = await page.evaluate(() => JSON.stringify(State.schedule));
    await page.locator('#settingsBtn').click();
    suite('activation is explicit and needs a durable server response');
    same('opening never asks permission', await page.evaluate(() => pushFixture.promptCalls), 0);
    check('no transport cannot enable reminders', await page.locator('#pushReminderEnable').isDisabled());
    await page.evaluate(publicKey => {
        FarkadReminders.setTransport(async data => {
            const f = pushFixture; f.requests.push(data);
            if (f.fail === data.action) throw Object.assign(Error('refused'), {code: 'unavailable'});
            if (data.action === 'config') return {publicKey};
            if (data.action === 'enable') {
                f.serverDevice = {id: 'a'.repeat(64), enabled: true, days: data.days}; return f.serverDevice;
            }
            if (data.action === 'status') return f.serverDevice || {enabled: false};
            if (data.action === 'test') return {accepted: true};
            if (data.action === 'disable') { f.serverDevice = null; return {enabled: false}; }
        });
    }, publicKey);
    await page.waitForFunction(() => !document.getElementById('pushReminderEnable').disabled);
    await page.evaluate(() => pushFixture.permission = 'denied');
    await page.locator('#pushReminderEnable').click();
    check('permission denial is explained', (await page.locator('#pushReminderStatus').innerText()).includes('חסומות'));
    same('denied permission cannot register a device', await page.evaluate(() => pushFixture.requests.filter(r => r.action === 'enable').length), 0);
    await page.evaluate(() => { pushFixture.permission = 'granted'; pushFixture.fail = 'enable'; });
    await page.locator('#pushReminderEnable').click();
    await page.waitForFunction(() => !document.getElementById('pushReminderEnable').disabled);
    check('server refusal is not called enabled', !(await page.locator('#pushReminderTest').isVisible()));
    check('server refusal is readable', (await page.locator('#pushReminderStatus').innerText()).includes('לא הצלחנו לאשר'));
    await page.evaluate(() => pushFixture.fail = '');
    await page.locator('#pushReminderDays').selectOption('friday');
    await page.locator('#pushReminderEnable').click();
    await page.locator('#pushReminderTest').waitFor({state: 'visible'});
    check('permission is requested directly from a gesture', await page.evaluate(() => pushFixture.wasGesture));
    same('subscription requests visible push only', await page.evaluate(() => pushFixture.options.userVisibleOnly), true);
    same('real VAPID public key reaches subscription', await page.evaluate(() => pushFixture.options.keyLength), 65);
    same('chosen evenings reach server', await page.evaluate(() => pushFixture.serverDevice.days), 'friday');
    await page.locator('#pushReminderTest').click();
    check('test says accepted request, not proved phone delivery', (await page.locator('#pushReminderStatus').innerText()).includes('בדוק אם התקבלה'));
    await page.keyboard.press('Escape'); await page.locator('#settingsBtn').click();
    await page.waitForFunction(() => document.getElementById('pushReminderStatus').textContent.includes('התזכורות מופעלות'));
    same('reopening restores server days', await page.locator('#pushReminderDays').inputValue(), 'friday');
    await page.locator('#pushReminderDays').selectOption('everyday');
    check('changing days requires saving before claiming a new schedule', (await page.locator('#pushReminderStatus').innerText()).includes('עדיין לא נשמרו'));
    same('unsaved days do not change the server', await page.evaluate(() => pushFixture.serverDevice.days), 'friday');
    await page.evaluate(() => pushFixture.fail = 'unsubscribe');
    await page.locator('#pushReminderDisable').click();
    check('failed disable is not called off', (await page.locator('#pushReminderStatus').innerText()).includes('הכיבוי לא הושלם'));
    await page.evaluate(() => pushFixture.fail = 'disable');
    await page.locator('#pushReminderDisable').click();
    check('local unsubscribe stops delivery despite server failure', (await page.locator('#pushReminderStatus').innerText()).includes('כבויות'));
    same('browser subscription actually removed', await page.evaluate(() => pushFixture.subscription), null);
    check('test is hidden after disable', !(await page.locator('#pushReminderTest').isVisible()));
    suite('notification taps preserve edits and never change work records');
    await page.evaluate(() => { closeSettings(); State.date = '2026-01-01'; showView('reports'); FarkadReminders.openToday(); });
    same('tap opens day', await page.evaluate(() => currentView), 'day');
    same('tap opens today', await page.evaluate(() => State.date === todayStr()), true);
    await page.evaluate(() => { showView('reports'); document.getElementById('signInModal').style.display = 'flex'; FarkadReminders.openToday(); });
    same('open edit is preserved', await page.evaluate(() => currentView), 'reports');
    check('pending open is offered', await page.locator('#pushReminderPending').isVisible());
    await page.evaluate(() => document.getElementById('signInModal').style.display = 'none');
    await page.getByRole('button', {name: 'פתיחת היום', exact: true}).click();
    same('deferred tap reaches today after edit closes', await page.evaluate(() => currentView), 'day');
    same('all notification actions preserve work data', await page.evaluate(() => JSON.stringify(State.schedule)), before);
    suite('Galaxy and installed versus browser iPhone');
    for (const [ua, installed, expected] of [
        ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', false, 'למסך הבית'],
        ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', true, 'להתחבר לענן'],
        ['Mozilla/5.0 (Linux; Android 15; SM-S938B)', false, 'להתחבר לענן']
    ]) {
        await page.evaluate(({ua, installed}) => {
            Object.defineProperty(navigator, 'userAgent', {value: ua, configurable: true});
            Object.defineProperty(navigator, 'standalone', {value: installed, configurable: true});
            FarkadReminders.setTransport(null);
        }, {ua, installed});
        await page.locator('#settingsBtn').click();
        await page.waitForFunction(text => document.getElementById('pushReminderStatus').textContent.includes(text), expected);
        check(`${ua.includes('iPhone') ? 'iPhone' : 'Galaxy'} installed=${installed}: relevant instructions`, (await page.locator('#pushReminderStatus').innerText()).includes(expected));
        await page.keyboard.press('Escape');
    }
    suite('restricted previews cannot let notification APIs break the app');
    const embedded = await browser.newPage({viewport: {width: 390, height: 844}});
    const embeddedErrors = [];
    embedded.on('pageerror', error => embeddedErrors.push(error.message));
    await embedded.goto(server.url + '/tests/embedded.html');
    const frame = await embedded.locator('#app').elementHandle().then(handle => handle.contentFrame());
    await frame.waitForFunction(() => typeof FarkadReminders !== 'undefined' && document.getElementById('dayView').children.length > 0);
    check('sandboxed app still boots', await frame.locator('#dayView').isVisible());
    await frame.locator('#settingsBtn').click();
    check('restricted preview explains unsupported notifications', (await frame.locator('#pushReminderStatus').innerText()).includes('אינו תומך'));
    check('restricted preview cannot ask permission', await frame.locator('#pushReminderEnable').isDisabled());
    check('no sandbox boot exception', !embeddedErrors.length, JSON.stringify(embeddedErrors));
    await embedded.close();
    check('no uncaught errors', !errors.length, JSON.stringify(errors));
} finally { await browser.close(); await server.close(); }
report();
