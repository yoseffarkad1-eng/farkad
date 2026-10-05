import {createECDH, randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {suite, check, same, report} from './runner.mjs';
import {ALLOWED_EMAILS, requireOwner, normalizeSubscription, normalizeDays, scheduledSlot, isDue, pushMessage} from '../functions/policy.js';
const key = createECDH('prime256v1'); key.generateKeys();
const subscription = {endpoint: 'https://fcm.googleapis.com/fcm/send/test-device', keys: {p256dh: key.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url')}};
function refuses(label, fn) { try { fn(); check(label, false); } catch { check(label, true); } }
suite('two reminders follow Israel time and the evening chosen by the owner');
for (const [utc, kind, date] of [
    ['2026-10-05T15:00:00Z', 'evening', '2026-10-05'], ['2026-10-06T07:00:00Z', 'morning', '2026-10-06'],
    ['2026-10-25T16:00:00Z', 'evening', '2026-10-25'], ['2026-10-26T08:00:00Z', 'morning', '2026-10-26'],
    ['2027-03-25T16:00:00Z', 'evening', '2027-03-25'], ['2027-03-26T07:00:00Z', 'morning', '2027-03-26']
]) {
    const slot = scheduledSlot(utc); same(`${utc}: kind`, slot.kind, kind); same(`${utc}: date`, slot.date, date);
}
same('unrequested hours cannot send', scheduledSlot('2026-10-05T12:00:00Z'), null);
check('Thursday evening has Friday morning confirmation', isDue('workdays', scheduledSlot('2026-10-09T07:00:00Z')));
check('no Friday evening in Sunday–Thursday selection', !isDue('workdays', scheduledSlot('2026-10-09T15:00:00Z')));
check('no Sunday morning without a Saturday evening', !isDue('workdays', scheduledSlot('2026-10-11T07:00:00Z')));
check('Saturday morning follows a selected Friday evening', isDue('friday', scheduledSlot('2026-10-10T07:00:00Z')));
check('daily includes Saturday evenings', isDue('everyday', scheduledSlot('2026-10-10T15:00:00Z')));
refuses('unknown days refused', () => normalizeDays('__proto__'));
suite('private subscriptions and a closed sender');
for (const email of ALLOWED_EMAILS) same(`family account ${ALLOWED_EMAILS.indexOf(email) + 1}`, requireOwner({uid: 'owner', token: {email}}).uid, 'owner');
refuses('anonymous caller refused', () => requireOwner(null));
refuses('unlisted account refused', () => requireOwner({uid: 'stranger', token: {email: 'stranger@example.com'}}));
same('membership matches existing rules', ALLOWED_EMAILS.every(email => readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8').includes(`'${email}'`)), true);
for (const endpoint of ['https://fcm.googleapis.com/wp/abc', 'https://web.push.apple.com/test', 'https://updates.push.services.mozilla.com/wpush/v2/test']) {
    same(`accepted provider ${new URL(endpoint).hostname}`, normalizeSubscription({...subscription, endpoint}).endpoint, endpoint);
}
for (const endpoint of ['http://fcm.googleapis.com/test', 'https://127.0.0.1/test', 'https://169.254.169.254/test',
    'https://fcm.googleapis.com.evil.test/test', 'https://evil.test/fcm.googleapis.com/test', 'https://name:password@web.push.apple.com/test',
    'https://web.push.apple.com:444/test', 'https://web.push.apple.com/test#secret']) {
    refuses(`unsafe destination ${new URL(endpoint).hostname}`, () => normalizeSubscription({...subscription, endpoint}));
}
refuses('wrong curve key refused', () => normalizeSubscription({...subscription, keys: {...subscription.keys, p256dh: Buffer.alloc(65).toString('base64url')}}));
refuses('wrong auth key length refused', () => normalizeSubscription({...subscription, keys: {...subscription.keys, auth: 'bad'}}));
const evening = pushMessage(scheduledSlot('2026-10-05T15:00:00Z'));
same('retry has one stable notification tag', evening.tag, pushMessage(scheduledSlot('2026-10-05T15:00:00Z')).tag);
same('payload fields never include payroll or identities', Object.keys(evening).sort().join(','), 'body,date,kind,tag,title,version');
suite('the actual worker displays push with no open app and opens only its own app');
const handlers = {}, shown = [], opened = [], messages = [];
let windows = [];
const worker = {registration: {scope: 'https://example.test/farkad/', showNotification: async (...args) => shown.push(args)},
    addEventListener: (type, fn) => handlers[type] = fn,
    clients: {matchAll: async () => windows, openWindow: async url => opened.push(url)}};
vm.runInNewContext(readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), {self: worker, URL, console, setTimeout, clearTimeout});
async function event(type, value) { let task; handlers[type]({...value, waitUntil: value => task = value}); await task; }
await event('push', {data: {json: () => evening}});
same('worker shows the evening reminder', shown[0][0], evening.title);
same('RTL notification', shown[0][1].dir, 'rtl');
await event('push', {data: {json: () => { throw Error('malformed'); }}});
same('malformed push still has a visible notification', shown.length, 2);
let closed = false;
await event('notificationclick', {notification: {close: () => closed = true, data: {url: 'https://evil.test/'}}});
check('notification is dismissed', closed);
same('cold open remains inside app', opened[0], 'https://example.test/farkad/index.html?farkad-reminder=today');
let focused = false;
windows = [{url: 'https://example.test/another-app/', focus: async () => {throw Error('wrong app');}},
    {url: 'https://example.test/farkad/index.html', focus: async () => focused = true, postMessage: message => messages.push(message)}];
await event('notificationclick', {notification: {close() {}}});
check('warm open focuses the existing app', focused);
same('warm open avoids forced navigation', opened.length, 1);
same('warm open goes through the typing guard', messages[0].type, 'FARKAD_REMINDER_OPEN');
report();
