import {initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';
import {onCall, HttpsError} from 'firebase-functions/v2/https';
import {onSchedule} from 'firebase-functions/v2/scheduler';
import {defineSecret} from 'firebase-functions/params';
import webpush from 'web-push';
import {createReminderService} from './service.js';
import {ReminderError} from './policy.js';

initializeApp();
const vapid = defineSecret('FARKAD_WEB_PUSH');
const base = {region: 'europe-west1', memory: '256MiB', cpu: 'gcf_gen1', minInstances: 0,
    maxInstances: 1, concurrency: 1, secrets: [vapid]};
function service() {
    const keys = JSON.parse(vapid.value());
    webpush.setVapidDetails('mailto:yosef.farkad1@gmail.com', keys.publicKey, keys.privateKey);
    return createReminderService({db: getFirestore(), publicKey: keys.publicKey,
        getUser: uid => getAuth().getUser(uid),
        send: (subscription, message, options) => webpush.sendNotification(subscription, JSON.stringify(message), {...options, timeout: 15000})});
}
export const reminderDevice = onCall({...base, timeoutSeconds: 60,
    cors: ['https://yoseffarkad1-eng.github.io']}, async request => {
    try { return await service().handle(request); }
    catch (error) {
        if (error instanceof ReminderError) throw new HttpsError(error.code, error.message);
        // SDK errors can include a private subscription endpoint. Never return or log it.
        throw new HttpsError('unavailable', 'Reminder service is unavailable.');
    }
});
export const scheduledReminders = onSchedule({...base, timeoutSeconds: 540,
    schedule: '0 10,18 * * *', timeZone: 'Asia/Jerusalem', retryCount: 3,
    minBackoffSeconds: 120, maxBackoffSeconds: 300, maxRetrySeconds: 1800},
    async event => service().dispatch(event.scheduleTime));
