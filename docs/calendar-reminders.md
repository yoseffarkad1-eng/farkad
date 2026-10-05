# Daily calendar reminder

The owner chose iPhone Calendar rather than a new push service, for daily work
recording only at 18:00 Israel time. Settings offers Sunday–Thursday by default,
Sunday–Friday, or every day. These are three public, read-only subscriptions, with
one recurring event each. No worker names, wages, authentication, or records leave
the app. The calendar event links back to the existing app.

Opening a `webcal:` link cannot prove that a subscription or alerts were enabled.
The screen therefore asks the owner to confirm in Calendar and enable Event Alerts;
it never writes an enabled flag. Manual HTTPS address copying (with a selectable
fallback) and an offline-cached ICS download are available under the help disclosure.
Changing variants means removing the old Calendar subscription before adding another.
The recurring reminder still fires after a completed day; it does not read app data.

Calendar bytes use RFC 5545 CRLF, UTF-8 line folding, stable UIDs and one DISPLAY
VALARM at event start. Asia/Jerusalem is explicit. The bundled VTIMEZONE follows
IANA's Zion rules: March Friday on/after the 23rd, and October's last Sunday, at
02:00 local transition time. Calendar tests parse with ical.js and compare actual
occurrences through 2032 against Intl's independent timezone database.

Sources checked 2026-10-05:
- https://support.apple.com/en-gb/guide/iphone/iph3d1110d4/ios — subscriptions and Event Alerts.
- https://github.com/eggert/tz/blob/main/asia — Asia/Jerusalem and Zion rules.

The public URLs must stay stable for subscribed phones. If timezone law or event
contents change, retain each UID, increment SEQUENCE and update DTSTAMP. Do not
put private information in these publicly fetched files. Physical iPhone Calendar
handoff and the final notification depend on the user's confirmation and settings;
browser checks do not prove delivery on a physical phone.
