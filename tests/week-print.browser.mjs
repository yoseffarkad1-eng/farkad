import {chromium} from 'playwright';
import {writeFileSync} from 'node:fs';
import {serve} from './serve.mjs';
import {launchLocalBrowser} from './network-guard.mjs';
import {verifyServedAssets,expectedShaFor} from './treecheck.mjs';
import {readPdf,pageText} from './pdf.mjs';
import {suite,check,same,report} from './runner.mjs';
const root=new URL('..',import.meta.url).pathname;
const server=await serve(root);
check('weekly print uses named source tree',(await verifyServedAssets(server.url,root,expectedShaFor(root))).ok);
const browser=await launchLocalBrowser(chromium,{executablePath:process.env.CHROME_PATH});
const page=await browser.newPage({viewport:{width:390,height:844}});
try{
 await page.goto(server.url);
 await page.evaluate(()=>{
  todayStr=()=> '2026-10-07';State.date='2026-10-07';
  State.schedule.workers=Array.from({length:30},(_,i)=>({id:`w_${i}`,name:`Worker ${String(i+1).padStart(2,'0')}`,active:true,dailyRate:400}));
  State.schedule.places=Array.from({length:7},(_,i)=>({id:`p_${i}`,name:`Site ${i+1}`,active:true}));
  setWeekFromDate(State.date);
  weekDates().forEach((date,d)=>State.schedule.workers.forEach(w=>assignPlace(State.schedule,date,w.id,'actual',`p_${d}`)));
  assignPlace(State.schedule,'2026-10-07','w_0','actual','p_0',RATE_EXTRA,2.5);
  State.save();showView('week');
 });
 const before=await page.evaluate(()=>JSON.stringify(State.schedule));
 suite('real weekly PDF is wide and complete from a phone');
 const buffer=await page.pdf({preferCSSPageSize:true,printBackground:true});
 const pdf=readPdf(buffer),text=pdf.pages.map(pageText).join('\n');
 check('every weekly page is landscape A4',pdf.pages.length>0&&pdf.pages.every(p=>p.width>p.height&&Math.abs(p.width-842)<3&&Math.abs(p.height-595)<3),JSON.stringify(pdf.pages.map(p=>[p.width,p.height])));
 check('all thirty worker names survive pagination',Array.from({length:30},(_,i)=>`Worker ${String(i+1).padStart(2,'0')}`).every(n=>text.includes(n)));
 check('all seven site names print as words',Array.from({length:7},(_,i)=>`Site ${i+1}`).every(n=>text.includes(n)));
 check('first and last week dates are printed',text.includes('02/10')&&text.includes('08/10'));
 check('precise extra hours survive printing',text.includes('2.5'));
 check('no empty trailing pages',pdf.pages.every(p=>p.texts.length>10));
 check('printed text stays inside each page',pdf.pages.every(p=>p.texts.every(t=>t.x>=0&&t.x<=p.width&&t.y>=0&&t.y<=p.height)));
 if(process.env.WEEK_PRINT_DIR)writeFileSync(`${process.env.WEEK_PRINT_DIR}/week-landscape.pdf`,buffer);
 await page.emulateMedia({media:'print'});
 const format=await page.evaluate(()=>({
  site:getComputedStyle(document.querySelector('.week-table .site-name')).display,
  phone:getComputedStyle(document.querySelector('.week-phone')).display,
  title:getComputedStyle(document.querySelector('.week-print-title')).display
 }));
 check('paper restores words even at phone viewport',format.site!=='none'&&format.phone==='none'&&format.title!=='none',JSON.stringify(format));
 await page.emulateMedia({media:'screen'});
 check('print heading does not clutter the screen',!(await page.locator('.week-print-title').isVisible()));
 suite('phone fallback image is landscape and includes site/rate words');
 const out=await page.evaluate(()=>{
  const seen=[];const native=CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText=function(t,...args){seen.push(t);return native.call(this,t,...args);};
  try{const out=printoutImage('week');return {width:out.width,height:out.height,seen,rows:out.layout.rows.length,png:out.blob?true:false};}
  finally{CanvasRenderingContext2D.prototype.fillText=native;}
 });
 check('fallback image is wide and stays within the bitmap cap',out.width>out.height&&Math.max(out.width,out.height)<=4096,JSON.stringify({width:out.width,height:out.height}));
 same('fallback includes every worker row',out.rows,30);
 check('site and extra-hour labels are drawn, not just color blocks',out.seen.some(t=>t.includes('Site 7'))&&out.seen.some(t=>t.includes('2.5')));
 if(process.env.WEEK_PRINT_DIR){const base64=await page.evaluate(async()=>{const out=printoutImage('week');return new Promise(ok=>{const r=new FileReader();r.onload=()=>ok(r.result.split(',')[1]);r.readAsDataURL(out.blob);});});writeFileSync(`${process.env.WEEK_PRINT_DIR}/week-landscape.png`,Buffer.from(base64,'base64'));}
 same('printing and sharing never modify records',await page.evaluate(()=>JSON.stringify(State.schedule)),before);
 await page.evaluate(()=>{REPORT_RANGE.from='2026-10-02';REPORT_RANGE.to='2026-10-08';showView('reports');});
 const reports=readPdf(await page.pdf({preferCSSPageSize:true,printBackground:true}));
 check('payroll and invoices retain portrait paper',reports.pages.length>0&&reports.pages.every(p=>p.height>p.width));
}finally{await browser.close();await server.close();}
report();
