// A screenshot of one screen at phone size. Not a test - nothing here asserts anything.
//
//   node tests/shot.mjs out.png [day|week|roster|reports] [width] [height]
//
// The suites can say a button is 44px and that a bar clears the one below it. They cannot
// say whether the screen is worth looking at, and a phone layout that is wrong is usually
// wrong in a way that is obvious in a picture and invisible in a measurement.
//
// It is a SUPPLEMENT, and it is not evidence. Every layout requirement this app has -
// four widths, both colour schemes, with and without a home indicator, portrait and
// landscape, 200% text, the sheet, the settings screen, reorder mode, the dock, the
// touch targets, the date, the banners, the last man in the crew - is an assertion in
// tests/mobile.test.mjs. A picture nobody looks at proves nothing at all.
import { serve } from './serve.mjs';
const { chromium } = await import('playwright');
const [out = 'shot.png', view = 'day', w = '390', h = '844'] = process.argv.slice(2);
const server = await serve(new URL('..', import.meta.url).pathname);
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: Number(w), height: Number(h) },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true
});
const page = await ctx.newPage();
page.on('dialog', d => d.accept());
await page.goto(`${server.url}/index.html`, { waitUntil: 'load' });
await page.waitForTimeout(500);
await page.evaluate(() => {
  State.schedule.workers = [
    { id: 'w_01', name: 'דוד כהן', active: true, dailyRate: 400, hourlyRate: 50 },
    { id: 'w_02', name: 'שרה לוי', active: true, dailyRate: 350, hourlyRate: 0 },
    { id: 'w_03', name: 'עלי חסן', active: true, dailyRate: 380, hourlyRate: 45 },
    { id: 'w_04', name: 'מוחמד אבו ראס', active: true, dailyRate: 380, hourlyRate: 45 },
    { id: 'w_05', name: 'יוסי מזרחי', active: true, dailyRate: 420, hourlyRate: 55 }
  ];
  State.schedule.places = [
    { id: 'p_01', name: 'הרצליה', active: true },
    { id: 'p_02', name: 'תל אביב', active: true },
    { id: 'p_03', name: 'רמת גן', active: true }
  ];
  State.date = '2026-08-12';
  assignPlace(State.schedule, '2026-08-12', 'w_01', 'actual', 'p_01');
  assignPlace(State.schedule, '2026-08-12', 'w_02', 'actual', 'p_02');
  markAbsent(State.schedule, '2026-08-12', 'w_03', 'actual');
  State.save();
  render();
});
await page.waitForTimeout(300);
if (view !== 'day') { await page.click(`#tab-${view}`); await page.waitForTimeout(400); }
await page.screenshot({ path: out, fullPage: false });
await browser.close(); server.close(); process.exit(0);
