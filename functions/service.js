import {ALLOWED_EMAILS, ReminderError, requireOwner, normalizeDays, normalizeSubscription, subscriptionId, validId, scheduledSlot, isDue, pushMessage} from './policy.js';

export function createReminderService({db, send, publicKey, getUser, now = () => Date.now()}) {
    const devices = db.collection('reminderDevices');
    const owners = db.collection('reminderOwners');
    const owned = (data, owner) => {
        if (data && data.uid !== owner.uid) throw new ReminderError('permission-denied', 'Device belongs to another account.');
        return data;
    };
    async function disable(id, owner) {
        await db.runTransaction(async tx => {
            const ref = devices.doc(id), ownerRef = owners.doc(owner.uid);
            const [snapshot, account] = await Promise.all([tx.get(ref), tx.get(ownerRef)]);
            owned(snapshot.data(), owner);
            tx.delete(ref);
            tx.set(ownerRef, {devices: (account.data()?.devices || []).filter(value => value !== id)}, {merge: true});
        });
    }
    async function handle({auth, data}) {
        const owner = requireOwner(auth);
        if (!data || typeof data !== 'object') throw new ReminderError('invalid-argument', 'Missing request.');
        if (data.action === 'config') return {publicKey, timeZone: 'Asia/Jerusalem', times: ['18:00', '10:00']};
        if (data.action === 'enable') {
            const subscription = normalizeSubscription(data.subscription), days = normalizeDays(data.days);
            const id = subscriptionId(subscription.endpoint), ref = devices.doc(id), ownerRef = owners.doc(owner.uid);
            await db.runTransaction(async tx => {
                const [snapshot, account] = await Promise.all([tx.get(ref), tx.get(ownerRef)]);
                const old = owned(snapshot.data(), owner), list = account.data()?.devices || [];
                if (!list.includes(id) && list.length >= 8) throw new ReminderError('resource-exhausted', 'Device limit reached.');
                tx.set(ref, {...owner, subscription, days, enabled: true, updatedAt: now(),
                    createdAt: old?.createdAt || now()}, {merge: true});
                tx.set(ownerRef, {devices: [...new Set([...list, id])]}, {merge: true});
            });
            return {id, enabled: true, days};
        }
        const id = validId(data.id), ref = devices.doc(id);
        const record = owned((await ref.get()).data(), owner);
        if (data.action === 'status') return {id, enabled: !!record?.enabled, days: record?.days || 'workdays'};
        if (data.action === 'disable') { await disable(id, owner); return {enabled: false}; }
        if (data.action !== 'test') throw new ReminderError('invalid-argument', 'Unknown request.');
        if (!record?.enabled) throw new ReminderError('failed-precondition', 'Enable this device first.');
        // Rate limits belong to the owner, not to a tab or a supplied endpoint.
        await db.runTransaction(async tx => {
            const ownerRef = owners.doc(owner.uid), account = await tx.get(ownerRef);
            if (account.data()?.lastTestAt > now() - 60000) throw new ReminderError('resource-exhausted', 'Wait one minute before another test.');
            tx.set(ownerRef, {lastTestAt: now()}, {merge: true});
        });
        try { await send(normalizeSubscription(record.subscription), pushMessage(null), {TTL: 300, urgency: 'high'}); }
        catch (error) {
            if ([404, 410].includes(error.statusCode)) {
                await disable(id, owner);
                throw new ReminderError('failed-precondition', 'Subscription expired. Enable it again.');
            }
            throw new ReminderError('unavailable', 'Push service did not accept the test.');
        }
        // Acceptance by Apple/Google is NOT proof that a phone displayed the notification.
        return {accepted: true};
    }
    async function dispatch(scheduleTime) {
        const slot = scheduledSlot(scheduleTime);
        if (!slot || now() - slot.at > 3600000 || slot.at > now() + 60000) return {sent: 0, skipped: true};
        const snapshot = await devices.where('enabled', '==', true).get();
        let sent = 0, failed = 0;
        for (const item of snapshot.docs) {
            const initial = item.data();
            if (!ALLOWED_EMAILS.includes(initial.email) || !isDue(initial.days, slot)) continue;
            let account;
            try { account = await getUser(initial.uid); }
            catch (error) {
                if (error.code !== 'auth/user-not-found') { failed++; continue; }
            }
            if (!account || account.disabled || account.email !== initial.email) {
                await disable(item.id, initial); continue;
            }
            // A transaction lease stops overlapping scheduler invocations. A stable tag
            // also replaces a notification when a network acknowledgement was lost.
            const record = await db.runTransaction(async tx => {
                const fresh = (await tx.get(item.ref)).data();
                if (!fresh?.enabled || !isDue(fresh.days, slot) || fresh.sentSlots?.includes(slot.key)
                    || fresh.leaseUntil > now()) return null;
                tx.update(item.ref, {leaseUntil: now() + 120000, leaseSlot: slot.key});
                return fresh;
            });
            if (!record) continue;
            try {
                await send(normalizeSubscription(record.subscription), pushMessage(slot), {TTL: 3600, urgency: 'high'});
                await db.runTransaction(async tx => {
                    const fresh = (await tx.get(item.ref)).data();
                    // Turning notifications off while a send is in flight must never recreate it.
                    if (!fresh) return;
                    tx.update(item.ref, {sentSlots: [...new Set([...(fresh.sentSlots || []), slot.key])].slice(-4),
                        leaseUntil: 0, lastAcceptedAt: now()});
                });
                sent++;
            } catch (error) {
                if ([404, 410].includes(error.statusCode)) await disable(item.id, record);
                else {
                    failed++;
                    await db.runTransaction(async tx => {
                        if ((await tx.get(item.ref)).exists) tx.update(item.ref, {leaseUntil: 0});
                    });
                }
            }
        }
        if (failed) throw new Error(`Reminder delivery needs retry for ${failed} device(s).`);
        return {sent};
    }
    return {handle, dispatch};
}
