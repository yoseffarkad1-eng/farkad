#!/usr/bin/env bash
#
# The acceptance bundle: every byte a phone would be served, and nothing else.
#
#   bash tools/acceptance-bundle.sh [output-directory]
#
# WHY THIS EXISTS. Nobody in this repository can run the app on an iPhone, and the twelve
# P-rows in docs/iphone-acceptance.md are the only coverage that would settle what the
# suites cannot. Those rows need the app ON a phone, and the app is not deployed - so this
# builds the smallest thing a person can serve themselves.
#
# WHAT IT IS NOT. It is not a deploy, it does not touch Firebase, and the copy it makes
# carries `js/sync/firebase-config.js` exactly as the repository holds it: empty, which
# means local-only. A bundle that reached a real project would put test taps on somebody's
# real pay record, so the config is asserted empty below and the script refuses if it is not.
#
# WHAT IT CARRIES. The service worker's own SHELL list, read out of sw.js rather than typed
# here - so a file that was added to the app and forgotten in the shell is a failure of this
# script too, which is the point. Plus index.html, the manifest and the icons.

set -euo pipefail
cd "$(dirname "$0")/.."

OUT="${1:-$(pwd)/dist}"
SHA="$(git rev-parse HEAD)"
SHORT="$(git rev-parse --short HEAD)"
BUILD="$(grep -o 'content="v[0-9]*"' index.html | grep -o 'v[0-9]*')"
DIRTY="$(git status --porcelain | wc -l | tr -d ' ')"

echo "commit : $SHA"
echo "build  : $BUILD"
echo "dirty  : $DIRTY"

if [ "$DIRTY" != "0" ]; then
    echo "REFUSED: the tree is not clean. A bundle whose bytes are not a commit cannot be" >&2
    echo "         reported against a commit, and that is the whole value of the bundle." >&2
    exit 1
fi

# THE CONFIG GATE. Local-only means the object has no apiKey and no projectId. A bundle
# that could reach a real project is a bundle that could write to somebody's real record.
if grep -qE '"?(apiKey|projectId)"?\s*:\s*["'"'"'][^"'"'"']+' js/sync/firebase-config.js; then
    echo "REFUSED: js/sync/firebase-config.js carries a real project. This bundle is for" >&2
    echo "         acceptance on a phone, and it must not be able to reach live data." >&2
    exit 1
fi

STAGE="$OUT/farkad-$BUILD-$SHORT"
rm -rf "$STAGE"
mkdir -p "$STAGE"

# The shell, read off the app. Anything sw.js precaches is a byte the phone will need
# offline, and offline is the whole point of the acceptance rows.
FILES=$(node -e '
const fs = require("fs");
const sw = fs.readFileSync("sw.js", "utf8");
const block = sw.match(/const SHELL\s*=\s*\[([\s\S]*?)\]/);
if (!block) { console.error("sw.js: no SHELL array"); process.exit(1); }
const found = [...block[1].matchAll(/["\x27]([^"\x27]+)["\x27]/g)].map(m => m[1]);
const extra = ["index.html", "manifest.json", "sw.js"];
const all = [...new Set([...found, ...extra])]
    .map(p => p.replace(/^\.\//, ""))
    .filter(p => p && p !== "/" && !/^https?:/.test(p));
console.log(all.join("\n"));
')

MISSING=0
while IFS= read -r f; do
    [ -z "$f" ] && continue
    if [ ! -f "$f" ]; then
        echo "  MISSING from the tree, named by the shell: $f" >&2
        MISSING=$((MISSING + 1))
        continue
    fi
    mkdir -p "$STAGE/$(dirname "$f")"
    cp "$f" "$STAGE/$f"
done <<< "$FILES"

# The icons, which the shell does not always name but a home-screen install needs.
for d in icons assets img; do
    [ -d "$d" ] && cp -r "$d" "$STAGE/" 2>/dev/null || true
done

if [ "$MISSING" != "0" ]; then
    echo "REFUSED: $MISSING file(s) the service worker precaches are not in the tree." >&2
    echo "         The phone would be told it can work offline and then find a hole." >&2
    exit 1
fi

cat > "$STAGE/READ-ME-FIRST.txt" <<TXT
פרקד — חבילת בדיקה
==================

בנייה: $BUILD
קומיט: $SHA
נבנה:  $(date -u '+%Y-%m-%d %H:%M UTC')

זו לא גרסה מותקנת ולא פרסום. זו בדיוק הקבצים שהטלפון היה מקבל, בשביל
לבדוק אותם ביד לפי docs/iphone-acceptance.md.

הסנכרון כבוי בחבילה הזאת (firebase-config ריק) - מה שנרשם פה נשאר על
המכשיר הזה ולא נוגע בשום רישום אמיתי.

איך מריצים
----------
1. פורקים את התיקייה על מחשב שנמצא באותה רשת Wi-Fi כמו הטלפון.
2. בתוך התיקייה:      python3 -m http.server 8000
3. בטלפון, בספארי:    http://<כתובת-ה-IP-של-המחשב>:8000
4. שתף  ->  הוסף למסך הבית.
5. פותחים מהאייקון - לא מספארי - ועוברים על הרשימה.

חשוב: iOS נותן אחסון קבוע רק לאפליקציה שנוספה למסך הבית. אם בודקים
בתוך לשונית ספארי, הרישום עלול להימחק, וזה לא תקלה של האפליקציה.

אם משהו לא עובד
---------------
1. מספר הסעיף מהרשימה.
2. צילום מסך של הרגע עצמו.
3. ⋯  ->  מידע טכני  ->  "העתק", ולהדביק בהודעה.

הבלוק הזה לא מכיל שמות עובדים, לא אתרים, לא סכומים ולא סיסמאות.
TXT

# The manifest of what went in, so a report can name the exact bytes it was made against.
( cd "$STAGE" && find . -type f -print0 | sort -z | xargs -0 sha256sum ) > "$STAGE/MANIFEST.sha256"
COUNT=$(grep -c "" "$STAGE/MANIFEST.sha256")

ZIP="$OUT/farkad-$BUILD-$SHORT.zip"
rm -f "$ZIP"
( cd "$OUT" && zip -qr "$(basename "$ZIP")" "$(basename "$STAGE")" )

echo
echo "bundle : $ZIP"
echo "files  : $COUNT"
echo "size   : $(du -h "$ZIP" | cut -f1)"
echo "sha256 : $(sha256sum "$ZIP" | cut -d' ' -f1)"
