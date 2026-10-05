import {readFileSync} from 'node:fs';
import ICAL from 'ical.js';
import {suite,check,same,report} from './runner.mjs';

// Decode with an independent RFC 5545 implementation and compare the actual alarm
// instants with Intl's IANA timezone, including years with different March Fridays.
const clock = new Intl.DateTimeFormat('en-GB', {timeZone:'Asia/Jerusalem',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const expected = {workdays:[0,1,2,3,4],friday:[0,1,2,3,4,5],everyday:[0,1,2,3,4,5,6]};
const ids=[];
for (const [kind,weekdays] of Object.entries(expected)) {
    suite(`calendar: ${kind}`);
    const path=`calendars/daily-${kind}-1800.ics`;
    const text=readFileSync(new URL('../'+path,import.meta.url),'utf8');
    check('wire lines use CRLF and finish with a newline',text.endsWith('\r\n')&&!/(?<!\r)\n/.test(text));
    check('UTF-8 physical lines stay within the 75-octet limit',text.split('\r\n').every(line=>Buffer.byteLength(line)<=75));
    const calendar=new ICAL.Component(ICAL.parse(text));
    ICAL.TimezoneService.reset();
    ICAL.TimezoneService.register(calendar.getFirstSubcomponent('vtimezone'));
    same('one recurring event',calendar.getAllSubcomponents('vevent').length,1);
    const component=calendar.getFirstSubcomponent('vevent');
    const event=new ICAL.Event(component);
    ids.push(event.uid);
    same('readable Hebrew survives line folding',event.summary,'פרקד · רישום יום העבודה');
    same('Israel timezone is explicit',event.startDate.zone.tzid,'Asia/Jerusalem');
    same('the event opens the public app',component.getFirstPropertyValue('url'),'https://yoseffarkad1-eng.github.io/farkad/');
    same('reminders do not occupy working availability',component.getFirstPropertyValue('transp'),'TRANSPARENT');
    check('no invitations or personal records are included',!component.hasProperty('attendee')&&!component.hasProperty('organizer')&&!/dailyRate|scheduleData|firebase|phoneNumber/.test(text));
    const alarms=component.getAllSubcomponents('valarm');
    same('exactly one visible alarm',alarms.length,1);
    same('the alarm is a display reminder',alarms[0].getFirstPropertyValue('action'),'DISPLAY');
    same('the alarm fires at the event start',alarms[0].getFirstPropertyValue('trigger').toSeconds(),0);
    const iterator=event.iterator();
    const wrongClock=[],wrongDays=[],samples={};
    let count=0;
    for(let next=iterator.next();next&&next.year<2033;next=iterator.next()) {
        if(++count>3000)throw Error('Unexpected recurrence');
        const instant=next.toJSDate();
        if(clock.format(instant)!=='18:00')wrongClock.push(next.toString());
        const day=new Date(next.toString().slice(0,10)+'T12:00:00Z').getUTCDay();
        if(!weekdays.includes(day))wrongDays.push(next.toString());
        samples[next.toString().slice(0,10)]=instant.toISOString();
    }
    check('recurrence continues through 2032',count>1500,String(count));
    check('every occurrence stays at 18:00 across summer and winter changes',wrongClock.length===0,wrongClock.slice(0,3).join(', '));
    check('only the chosen weekdays recur',wrongDays.length===0,wrongDays.slice(0,3).join(', '));
    same('October before clock change',samples['2026-10-22'],'2026-10-22T15:00:00.000Z');
    same('October after clock change',samples['2026-10-25'],'2026-10-25T16:00:00.000Z');
    same('March before clock change',samples['2027-03-25'],'2027-03-25T16:00:00.000Z');
    same('March after clock change',samples['2027-03-28'],'2027-03-28T15:00:00.000Z');
    check('download is cached for offline fallback',readFileSync(new URL('../sw.js',import.meta.url),'utf8').includes(`'./${path}'`));
}
same('each subscription variant has a distinct stable UID',new Set(ids).size,3);
report();
