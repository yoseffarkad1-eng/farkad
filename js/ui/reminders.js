// Device notifications are independent of the shared work record. Only a browser
// subscription AND an acknowledged server registration count as enabled.
const FarkadReminders = (() => {
    // An embedded preview can expose the property but throw when it is read. A
    // restricted notification API must never prevent the work record from booting.
    let workerContainer = null;
    try { workerContainer = navigator.serviceWorker; } catch { workerContainer = null; }
    let transport = null, registration = null, subscription = null, config = null;
    let device = null, busy = false, generation = 0;
    const node = id => document.getElementById(id);
    const supported = () => !!workerContainer && 'PushManager' in window && 'Notification' in window;
    const installed = () => navigator.standalone || matchMedia('(display-mode: standalone)').matches;
    const iPhone = () => /iPhone|iPad|iPod/.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    function paint(message) {
        const status = node('pushReminderStatus');
        if (!status) return;
        if (message) status.textContent = message;
        const canEnable = !!(config && registration && transport && supported());
        node('pushReminderEnable').disabled = busy || !canEnable;
        node('pushReminderEnable').textContent = device?.enabled ? 'שמירת ימי התזכורת' : 'הפעלת התראות במכשיר הזה';
        node('pushReminderTest').hidden = !device?.enabled;
        node('pushReminderTest').disabled = busy;
        node('pushReminderDisable').hidden = !subscription;
        node('pushReminderDisable').disabled = busy;
        node('pushReminderDays').disabled = busy;
        node('pushReminderRefresh').disabled = busy;
    }
    function explain(error) {
        return ({'permission-denied': 'אין לחשבון הזה גישה לתזכורות.',
            unauthenticated: 'יש להתחבר לענן לפני הפעלת ההתראות.',
            'resource-exhausted': 'המתן דקה לפני ניסיון נוסף. אם הגעת למגבלת מכשירים, כבה התראות במכשיר ישן.',
            'failed-precondition': 'יש להפעיל מחדש את ההתראות במכשיר הזה.',
            denied: 'ההתראות חסומות. אפשר אותן בהגדרות המכשיר או הדפדפן, ואז לחץ על בדיקה מחדש.'})[error?.code]
            || 'לא הצלחנו לאשר את התזכורות מול השרת. בדוק את החיבור ונסה שוב.';
    }
    async function idFor(value) {
        const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value.endpoint));
        return [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, '0')).join('');
    }
    function keyBytes(key) {
        return Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    }
    async function ready() {
        let timer;
        try {
            return await Promise.race([workerContainer.ready,
                new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('worker unavailable')), 8000); })]);
        } finally { clearTimeout(timer); }
    }
    async function refresh() {
        if (busy) return;
        const turn = ++generation;
        config = null; device = null;
        if (iPhone() && !installed()) {
            paint('ב־iPhone: הוסף את פרקד למסך הבית ופתח מהסמל שלו כדי לאפשר התראות.'); return;
        }
        if (!supported()) { paint('הדפדפן הזה אינו תומך בהתראות. ב־Galaxy פתח ב־Chrome או Samsung Internet; ב־iPhone עדכן את iOS ופתח ממסך הבית.'); return; }
        busy = true; paint('בודק את ההתראות במכשיר הזה…');
        try {
            const nextRegistration = await ready();
            const nextSubscription = await nextRegistration.pushManager.getSubscription();
            if (turn !== generation) return;
            registration = nextRegistration; subscription = nextSubscription;
            if (!transport) { paint('יש להתחבר לענן לפני הפעלת ההתראות.'); return; }
            const nextConfig = await transport({action: 'config'});
            if (turn !== generation) return;
            if (typeof nextConfig?.publicKey !== 'string' || keyBytes(nextConfig.publicKey).length !== 65) throw new Error('missing key');
            config = nextConfig;
            if (subscription) {
                const nextDevice = await transport({action: 'status', id: await idFor(subscription)});
                if (turn !== generation) return;
                device = nextDevice;
                if (device.enabled) node('pushReminderDays').value = device.days;
            }
            if (Notification.permission === 'denied') { device = null; paint(explain({code: 'denied'})); }
            else paint(device?.enabled ? 'התזכורות מופעלות במכשיר הזה: 18:00 ו־10:00 למחרת, לפי הימים שבחרת.'
                : 'התזכורות כבויות במכשיר הזה. לחץ על הפעלה ואשר קבלת התראות.');
        } catch (error) {
            if (turn === generation) { config = null; device = null; paint(explain(error)); }
        } finally { if (turn === generation) { busy = false; paint(); } }
    }
    async function enable() {
        if (busy || !config || !registration || !transport) return;
        const turn = generation, call = transport;
        busy = true; paint('מפעיל את ההתראות…');
        try {
            // Must start on the tap, before any server request or other await (iOS).
            const permission = await Notification.requestPermission();
            if (turn !== generation) return;
            if (permission !== 'granted') throw {code: 'denied'};
            subscription = await registration.pushManager.getSubscription()
                || await registration.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: keyBytes(config.publicKey)});
            if (turn !== generation) return;
            const enabled = await call({action: 'enable', subscription: subscription.toJSON(), days: node('pushReminderDays').value});
            if (turn !== generation) return;
            if (!enabled?.enabled) throw new Error('not acknowledged');
            device = enabled;
            paint('התזכורות מופעלות במכשיר הזה. לחץ על שליחת התראת ניסיון ובדוק גם במסך הנעילה.');
        } catch (error) { if (turn === generation) { device = null; paint(explain(error)); } }
        finally { if (turn === generation) { busy = false; paint(); } }
    }
    async function test() {
        if (busy || !device?.enabled || !transport) return;
        const turn = generation;
        busy = true; paint('שולח התראת ניסיון…');
        try {
            const result = await transport({action: 'test', id: device.id});
            if (turn !== generation) return;
            if (!result?.accepted) throw new Error('test not accepted');
            paint('בקשת הבדיקה נשלחה. בדוק אם התקבלה התראה במכשיר; מצב שקט או מיקוד עשוי להסתיר אותה.');
        } catch (error) { if (turn === generation) {
            if (error.code === 'failed-precondition') device = null;
            paint(explain(error));
        } }
        finally { if (turn === generation) { busy = false; paint(); } }
    }
    async function disable() {
        if (busy || !subscription) return;
        const turn = generation, old = subscription, call = transport;
        busy = true; paint('מכבה את ההתראות…');
        try {
            // Local unsubscribe also works when the server is temporarily unavailable.
            const id = await idFor(old);
            if (!(await old.unsubscribe()) && await registration.pushManager.getSubscription()) throw new Error('still subscribed');
            if (turn !== generation) return;
            subscription = null; device = null;
            if (call) { try { await call({action: 'disable', id}); } catch { /* A dead endpoint is pruned on the next send. */ } }
            if (turn === generation) paint('התזכורות כבויות במכשיר הזה. ההגדרות במכשירים האחרים לא השתנו.');
        } catch (error) { if (turn === generation) paint('הכיבוי לא הושלם. נסה שוב או חסום התראות בהגדרות המכשיר.'); }
        finally { if (turn === generation) { busy = false; paint(); } }
    }
    function setTransport(value) {
        generation++; busy = false; transport = value; config = null; device = null;
        paint(value ? 'לחץ על בדיקה מחדש כדי לבדוק את ההתראות.' : 'יש להתחבר לענן לפני הפעלת ההתראות.');
        if (typeof settingsOpen !== 'undefined' && settingsOpen) void refresh();
    }
    function daysChanged() {
        if (device?.enabled) paint('הימים החדשים עדיין לא נשמרו. לחץ על שמירת ימי התזכורת.');
    }
    function openToday() {
        if ((typeof midEdit === 'function' && midEdit()) || (typeof reorderDraft !== 'undefined' && reorderDraft)) {
            // A tap must never discard an amount or a name somebody is still typing.
            const banner = node('pushReminderPending');
            if (banner) banner.hidden = false;
            return;
        }
        const banner = node('pushReminderPending');
        if (banner) banner.hidden = true;
        if (typeof closeSettings === 'function') closeSettings();
        State.date = todayStr(); showView('day');
    }
    function openPending() {
        const url = new URL(location.href);
        if (!url.searchParams.has('farkad-reminder')) return;
        url.searchParams.delete('farkad-reminder');
        history.replaceState(null, '', url.href);
        openToday();
    }
    if (workerContainer) workerContainer.addEventListener('message', event => {
        if (event.data?.type === 'FARKAD_REMINDER_OPEN') openToday();
    });
    return {refresh, enable, test, disable, setTransport, daysChanged, openPending, openToday};
})();
window.FarkadReminders = FarkadReminders;
