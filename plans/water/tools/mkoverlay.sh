set -e
cd "$(dirname "$0")"
CH=${CHROME_PATH:-/opt/pw-browsers/chromium-1194/chrome-linux/chrome}
for S in W-02 W-03 W-04; do
  python3 -c "
import sys; sys.path.insert(0,'lib')
from sheet import page
open('ov_$S.html','w').write(page('$S'))
"
  $CH --headless --disable-gpu --no-sandbox --run-all-compositor-stages-before-draw \
      --virtual-time-budget=6000 --print-to-pdf=ov_$S.pdf --no-pdf-header-footer ov_$S.html 2>/dev/null
done
python3 -c "
import pymupdf
for s in ['W-02','W-03','W-04']:
    d=pymupdf.open(f'ov_{s}.pdf'); print(s, d.page_count, d[0].rect)
"
