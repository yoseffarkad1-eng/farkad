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
# WHAT IT IS NOT. It is not a deploy and it does not touch Firebase. The repository DOES
# carry the real farkad-schedule config - deliberately, a Firebase web config is public and
# firestore.rules is what keeps people out - so the staged copy is overwritten with the
# local-only shape and read back to prove it. Somebody working through the acceptance list
# adds workers and deletes them again; every one of those taps would otherwise land in the
# live pay record.
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

# THE CONFIG IS NEUTRALISED, NOT REFUSED.
#
# js/sync/firebase-config.js carries the real farkad-schedule project, deliberately and
# since the day sync was turned on - a Firebase web config is public by design and the
# allowlist in firestore.rules is what actually keeps people out. That is fine for the
# deployed app and wrong for this bundle: somebody tapping through an acceptance list is
# going to add workers, record days and delete them again, and every one of those taps
# would land in the real pay record.
#
# So the staged copy is replaced with the local-only shape and then read back to prove it.
# Everything the bundle can do, it does on that phone and nowhere else.

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
// NAMES READ OFF THE APP, NEVER TYPED HERE. The first version of this script listed
// "manifest.json" from memory; the app links manifest.webmanifest, so the script refused
// to build over a file that was never missing. A list kept by hand goes stale the first
// time somebody renames something, and then it lies about the app instead of about
// itself. So index.html is parsed for what it actually asks the browser to fetch.
const html = fs.readFileSync("index.html", "utf8");
const linked = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map(m => m[1]).filter(p => p && !/^https?:/.test(p) && p !== "/");
const extra = ["index.html", "sw.js", ...linked];
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

# The neutralised config, written over whatever was copied, then read back. A bundle that
# could still reach the live project is the one thing this script exists to prevent, so it
# is proven rather than assumed.
if [ -f "$STAGE/js/sync/firebase-config.js" ]; then
    cat > "$STAGE/js/sync/firebase-config.js" <<'CFG'
// NEUTRALISED FOR ACCEPTANCE. The repository carries the real farkad-schedule project
// here; this copy does not, on purpose.
//
// Somebody working through docs/iphone-acceptance.md adds workers, records days and
// deletes them again. With the real config in place every one of those taps would land in
// the live pay record. Empty apiKey and projectId means the app runs local-only: what is
// recorded on that phone stays on that phone.
//
// It also means the rows that need two phones talking to each other CANNOT be checked
// with this bundle. They need the deployed app. READ-ME-FIRST.txt says which ones.
export const firebaseConfig = {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
};

export const SCHEDULE_DOC_PATH = 'schedules/current';
CFG
    if grep -qE '(apiKey|projectId)"?\s*:\s*"[^"]+"' "$STAGE/js/sync/firebase-config.js"; then
        echo "REFUSED: the staged config still names a project after neutralising." >&2
        exit 1
    fi
    echo "config : neutralised (local-only), verified"
else
    echo "REFUSED: js/sync/firebase-config.js is not in the shell, so the bundle cannot" >&2
    echo "         guarantee which project the phone would reach." >&2
    exit 1
fi

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

הסנכרון כבוי בחבילה הזאת בכוונה - מה שנרשם פה נשאר על המכשיר הזה
ולא נוגע ברישום האמיתי. בלי זה, כל עובד שתוסיף ותמחק תוך כדי הבדיקה
היה נכנס לרישום השכר האמיתי.

לכן: כל סעיף שדורש שני טלפונים שמדברים ביניהם - סנכרון, "ממתינים
לשליחה", התנגשות בין מכשירים - **אי אפשר לבדוק עם החבילה הזאת**. הוא
דורש את האפליקציה המותקנת. כל השאר כן.

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
