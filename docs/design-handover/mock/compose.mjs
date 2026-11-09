// Side-by-side "before / after" pictures for the owner, labelled in Arabic.
//
//   node compose.mjs <beforeDir> <afterDir> <outDir> name1,name2,...
//
// Before sits on the RIGHT (the page is RTL: it is read first), after on the left.
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.env.ROOT || '/home/yosef/farkad-design';
const { chromium } = await import(join(ROOT, 'node_modules/playwright/index.mjs'));
const [before, after, out, names, prefix = ''] = process.argv.slice(2);
mkdirSync(out, { recursive: true });

// SCALE=1 FMT=jpg makes a file a quarter of the size: the owner's uploads time out on 2x PNGs.
const SCALE = Number(process.env.SCALE || 2);
const FMT = process.env.FMT === 'jpg' ? 'jpeg' : 'png';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 940, height: 600 }, deviceScaleFactor: SCALE });

const dataUrl = path => 'data:image/png;base64,' + readFileSync(path).toString('base64');

for (const name of names.split(',')) {
    // SKIP_EXISTING=1 resumes an interrupted run.
    if (process.env.SKIP_EXISTING && existsSync(join(out, `${prefix}${name}.${FMT === 'jpeg' ? 'jpg' : 'png'}`))) continue;
    // A screen that only exists in the proposal (the ⋯ sheet) has no "before": one figure.
    const beforePath = join(before, name + '.png');
    const beforeFig = existsSync(beforePath)
        ? `<figure class="before"><figcaption><span class="dot"></span>قبل</figcaption><img src="${dataUrl(beforePath)}"></figure>`
        : '';
    const html = `<!doctype html><html dir="rtl"><head><meta charset="utf-8">
    <style>
      body { margin: 0; background: #0b0f14; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #e6eaf0; }
      .wrap { display: flex; gap: 20px; padding: 16px 20px 20px; align-items: flex-start; width: max-content; }
      figure { margin: 0; width: 440px; }
      figcaption { font-size: 22px; font-weight: 700; margin: 0 0 10px; display: flex; align-items: center; gap: 10px; }
      .dot { width: 14px; height: 14px; border-radius: 50%; display: inline-block; }
      .before .dot { background: #8a95a3; } .after .dot { background: #4ade80; }
      img { width: 440px; display: block; border-radius: 14px; outline: 1px solid #2a3542; }
    </style></head><body><div class="wrap">
      ${beforeFig}
      <figure class="after"><figcaption><span class="dot"></span>بعد</figcaption><img src="${dataUrl(join(after, name + '.png'))}"></figure>
    </div></body></html>`;
    await page.setViewportSize({ width: beforeFig ? 940 : 480, height: 600 });
    await page.setContent(html, { waitUntil: 'load' });
    const ext = FMT === 'jpeg' ? 'jpg' : 'png';
    await page.screenshot({ path: join(out, `${prefix}${name}.${ext}`), fullPage: true, type: FMT, ...(FMT === 'jpeg' ? { quality: 86 } : {}) });
    console.log(`${prefix}${name}.${ext}`);
}
await browser.close();
