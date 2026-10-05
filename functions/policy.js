import {createHash, ECDH} from 'node:crypto';

// Same family as the existing schedule rules. Push never reads or writes payroll data.
export const ALLOWED_EMAILS = Object.freeze([
    'yosef.farkad1@gmail.com', 'farkad1963@gmail.com', 'mu.mahameed1992@gmail.com'
]);
export const TIME_ZONE = 'Asia/Jerusalem';
export const DAYS = Object.freeze({workdays: [0, 1, 2, 3, 4], friday: [0, 1, 2, 3, 4, 5], everyday: [0, 1, 2, 3, 4, 5, 6]});
export class ReminderError extends Error {
    constructor(code, message) { super(message); this.code = code; }
}
export function requireOwner(auth) {
    if (!auth?.uid) throw new ReminderError('unauthenticated', 'Sign in first.');
    if (!ALLOWED_EMAILS.includes(auth.token?.email)) throw new ReminderError('permission-denied', 'Account not allowed.');
    return {uid: auth.uid, email: auth.token.email};
}
export function normalizeDays(value) {
    if (!Object.hasOwn(DAYS, value)) throw new ReminderError('invalid-argument', 'Invalid reminder days.');
    return value;
}
function keyBytes(value, length) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) return false;
    const bytes = Buffer.from(value, 'base64url');
    return bytes.length === length && bytes.toString('base64url') === value;
}
export function normalizeSubscription(value) {
    let url;
    try { url = new URL(value?.endpoint); } catch { throw new ReminderError('invalid-argument', 'Invalid push endpoint.'); }
    // Never let a supplied subscription turn the sender into an arbitrary HTTP client.
    const host = url.hostname;
    const allowed = host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com'
        || host === 'web.push.apple.com' || host.endsWith('.push.apple.com');
    if (!allowed || url.protocol !== 'https:' || url.port || url.username || url.password
        || url.hash || url.pathname === '/' || value.endpoint.length > 2048
        || !keyBytes(value.keys?.p256dh, 65) || !keyBytes(value.keys?.auth, 16)) {
        throw new ReminderError('invalid-argument', 'Invalid push subscription.');
    }
    try { ECDH.convertKey(Buffer.from(value.keys.p256dh, 'base64url'), 'prime256v1'); }
    catch { throw new ReminderError('invalid-argument', 'Invalid push key.'); }
    return {endpoint: url.href, keys: {p256dh: value.keys.p256dh, auth: value.keys.auth}};
}
export function subscriptionId(endpoint) { return createHash('sha256').update(endpoint).digest('hex'); }
export function validId(value) {
    if (!/^[a-f0-9]{64}$/.test(value || '')) throw new ReminderError('invalid-argument', 'Invalid device.');
    return value;
}
const israel = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
});
export function scheduledSlot(value) {
    const time = new Date(value);
    if (!Number.isFinite(time.getTime())) throw new ReminderError('invalid-argument', 'Invalid schedule time.');
    const parts = Object.fromEntries(israel.formatToParts(time).map(p => [p.type, p.value]));
    const date = `${parts.year}-${parts.month}-${parts.day}`;
    const hour = Number(parts.hour);
    if (hour !== 10 && hour !== 18) return null;
    const kind = hour === 18 ? 'evening' : 'morning';
    const weekday = new Date(date + 'T12:00:00Z').getUTCDay();
    // A selected evening ALWAYS has its confirmation the following morning, including Friday.
    const eveningWeekday = kind === 'morning' ? (weekday + 6) % 7 : weekday;
    return {kind, date, eveningWeekday, key: `${date}-${kind}`, at: time.getTime()};
}
export function isDue(days, slot) { return !!slot && DAYS[normalizeDays(days)].includes(slot.eveningWeekday); }
export function pushMessage(slot) {
    const kind = slot?.kind || 'test';
    return {
        version: 1, kind, date: slot?.date || null,
        title: kind === 'morning' ? 'פרקד · בדיקת העובדים' : kind === 'evening' ? 'פרקד · רישום עובדים' : 'פרקד · בדיקת התראות',
        body: kind === 'morning' ? 'השעה 10:00. בדוק מי יצא לעבודה ועדכן שינויים ברישום.'
            : kind === 'evening' ? 'השעה 18:00. זה הזמן לרשום את העובדים ולעדכן את יום העבודה.'
                : 'ההתראות פועלות במכשיר הזה. התזכורות יגיעו ב־18:00 וב־10:00 למחרת.',
        tag: slot ? `farkad-${slot.key}` : 'farkad-test'
    };
}
