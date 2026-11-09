// Contact sheet: several screenshots side by side at 1x, for a quick review.
//   node sheet.mjs <dir> <out.png> name1,name2,...   (each image 440 CSS px wide, cropped to 956 tall)
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = process.env.ROOT || '/home/yosef/farkad-design';
const { chromium } = await import(join(ROOT, 'node_modules/playwright/index.mjs'));
const [dir, out, names] = process.argv.slice(2);
const list = names.split(',').filter(n => existsSync(join(dir, n + '.png')));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 20 + list.length * 452, height: 1000 }, deviceScaleFactor: 1 });
const dataUrl = p => 'data:image/png;base64,' + readFileSync(p).toString('base64');
const figs = list.map(n => `<figure><figcaption>${n}</figcaption><div class="clip"><img src="${dataUrl(join(dir, n + '.png'))}"></div></figure>`).join('');
await page.setContent(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>
  body{margin:0;background:#0b0f14;color:#cfd8e3;font:700 15px system-ui}
  .wrap{display:flex;gap:12px;padding:10px}
  figure{margin:0;width:440px} figcaption{margin:0 0 6px;direction:ltr;text-align:left}
  .clip{height:956px;overflow:hidden;border-radius:10px;outline:1px solid #2a3542} img{width:440px;display:block}
</style></head><body><div class="wrap">${figs}</div></body></html>`, { waitUntil: 'load' });
await page.screenshot({ path: out, fullPage: true });
console.log(out, list.join(' '));
await browser.close();
