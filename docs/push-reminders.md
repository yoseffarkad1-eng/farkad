# Phone reminders — v143 candidate, not yet deployed

The owner corrected the Calendar choice on 2026-10-05 and confirmed **18:00 in the
evening plus 10:00 the following morning**, Asia/Jerusalem. Both iPhone and Galaxy
must receive a real notification while the app is closed. Calendar files remain
unchanged for existing subscribers; the app now offers push instead of adding a
calendar subscription. Help explains removing any old Calendar reminder.

## What is implemented

- One Firebase scheduled function, `0 10,18 * * *`, with `Asia/Jerusalem` handling
  summer/winter time. Selected evening days determine the following morning:
  Sunday–Thursday evenings produce Monday–Friday morning confirmations.
- The phone requests permission only from an explicit tap, registers its existing
  service worker's Web Push subscription, and waits for server acknowledgement.
  Each phone has independent days, enable/disable, status refresh and a test button.
- A background `push` event displays a generic Hebrew notification, with no worker
  names or amounts. A tap opens today's record; an open edit is preserved and a
  pending-open button is shown. No work or money is edited by any reminder action.
- The callable verifies Firebase Auth, then applies the same three-account allowlist
  as the existing rules. No new sign-in system. Device records live in the separate
  `reminderDevices` and `reminderOwners` collections, inaccessible to direct clients
  under the existing rules. No production Firestore rules change is required.
- Push destinations and keys are validated, devices are limited to eight per account,
  test sends are limited to one per minute, and expired subscriptions are removed.
  Scheduler leases and stable notification tags limit duplicate delivery. A push
  provider accepting a request is reported as acceptance, not proof of phone display.
- VAPID private keys are server-only, in the `FARKAD_WEB_PUSH` Secret Manager secret.
  The public key comes from the authenticated callable; none is hardcoded in the app.

## Deployment prerequisite and current blocker

**No live backend has been deployed, no phone subscribed, and no real lock-screen
delivery verified.** The execution workspace has no authenticated Firebase CLI or
Google Cloud application credentials for `farkad-schedule`. Its billing plan has not
been verified. Firebase requires the Blaze plan to deploy these functions. Billing
activation is an account-owner action and has not been performed or assumed.

Use the existing Farkad Firebase project only. Do not deploy to the unrelated clinic
Render/Railway accounts. Do not merge/publish the app candidate before the backend is
deployed and its callable is reachable with an allowed Farkad account.

## Deployment once project access and billing are available

1. Confirm project **farkad-schedule**, the owner account and Blaze billing. Set a
   small billing budget alert; an alert is not a hard spending cap. Keep both
   functions at `minInstances: 0`, `maxInstances: 1`, 256 MiB and fractional CPU.
2. Install the pinned dependencies: `npm ci` and `npm ci --prefix functions`, Node 22.
3. Create a VAPID key pair once using `web-push.generateVAPIDKeys()`. Write JSON
   `{publicKey, privateKey}` to a private temporary file (mode 0600), never stdout,
   git, a chat message or a public artifact. Store it with
   `firebase functions:secrets:set FARKAD_WEB_PUSH --project farkad-schedule --data-file <private-file>`.
   Delete the local private file after the secret is stored. If the secret already
   exists, reuse it: rotating it invalidates the existing phone subscriptions.
4. Deploy only the isolated functions codebase:
   `firebase deploy --only functions:reminders --project farkad-schedule`.
   This does not deploy, replace or roll back the existing Firestore rules.
5. Check the callable's authenticated `config` action, its rejection of anonymous
   and unlisted accounts, and the Scheduler job timezone/cron. Review deployment logs
   without dumping subscription endpoints, auth tokens or VAPID secrets.
6. Run the full release gate on one clean detached exact candidate SHA, then publish
   the app through the existing reviewed GitHub Pages route.
7. On each physical phone: open the updated app, sign in, choose evenings, tap
   **הפעלת התראות במכשיר הזה**, and approve the OS prompt. On iPhone open the app
   from its Home Screen icon (iOS 16.4+). Galaxy supports compatible Chrome/Samsung
   Internet. Test with **שליחת התראת ניסיון** while the screen is locked, then tap
   the notification to verify navigation. Also verify one 18:00 and one next-morning
   10:00 delivery on each device. Focus, notification settings and connectivity can
   affect visibility and delivery time; it is not an exact-alarm API.

## Cost and references

One Cloud Scheduler job runs twice daily, plus small callable/Firestore usage for
three family phones. Firebase documents $0.10/month per Scheduler job, with three
jobs per Google account at no charge. Functions, build storage, Secret Manager and
Firestore have separate pricing/quotas; this is **not a promise of zero charges**.

- https://firebase.google.com/docs/functions/get-started
- https://firebase.google.com/docs/functions/schedule-functions
- https://firebase.google.com/docs/functions/config-env
- https://firebase.google.com/docs/functions/callable
- https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/

Tests use local fakes or the Firestore emulator, never a live family account or push
endpoint. See `test:reminders`, `test:reminders-browser` and `test:reminders-emulator`.
