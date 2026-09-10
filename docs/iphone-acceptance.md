# בדיקת קבלה במכשיר אמיתי — רשימה ליוסף

> **NOT YET PHYSICALLY VERIFIED.** Nothing in this list has been performed on a real
> iPhone for the current build, and that has been true of every build since v86. Seventy-three
> rows, none of them run - sixty-one from earlier rounds and twelve added at v104. The number is written here rather than left to be counted, because
> "the suites are green" and "somebody looked at it on a phone" are two different claims and
> only one of them is true of this repository.
>
> **What the automated suites actually run on, exactly:**
>
> | suite | runs on |
> |---|---|
> | smoke, print, mobile, update, forms, recovery-browser, handover, swrestart, swidentity | headless **Chromium**, driven by Playwright, against a local static server |
> | every other suite in `npm test` | **Node**, with V8 contexts and a fake localStorage - no browser at all |
> | rules, bootstrap-rules, cas-emulator, rollout, bootstrap, money-concurrency | **Node** against the local **Firestore emulator** |
>
> None of them is Safari and none of them is a phone. Where a suite sets an iPhone
> user-agent string it is still Chromium: that proves the app's own branch runs, not that
> WebKit does anything. Where the mobile suite doubles every computed font-size, that is a
> real change to what is rendered and it is not iOS Dynamic Type - AX2 goes through the
> system, touches the `-apple-system` faces and Safari's own minimum sizes, and reflows
> controls in ways no stylesheet here can be made to. No result from any of the above may
> be reported as physical-device coverage. This table is what physical coverage is.
>
> HOW the mobile suite doubles the text, because the previous answer was not good enough
> to cite. It used to set `documentElement.style.fontSize = '32px'` and sample four nodes.
> Every font-size rule in `css/app.css` is in px, so the root size reached nothing that
> had a rule of its own: measured, root went 16 -> 32 while `.name-cell` stayed 14,
> `.week-cell` stayed 13 and the page's width did not move. Three of the four sampled
> nodes were static elements of `index.html` carrying an inline style for the life of the
> page. That pass could not have failed. It now REWRITES the cascade - every px
> font-size in every stylesheet re-emitted at 2x with `!important` in one appended
> `<style>` - and samples after four `showView()` calls and a `render()`, on nodes the
> app rebuilt, at 320/375/390/430, with long Hebrew and Arabic names. It is still
> Chromium and it is still not Dynamic Type; it is now at least a real measurement of a
> real reflow. Line 18 below remains the only Dynamic Type coverage there is.

מה זה: אף בדיקה אוטומטית לא יכולה להעיד על אייפון אמיתי. כל מה שנבדק עד עכשיו רץ
בדפדפן על שרת, לא על טלפון. הרשימה הזאת היא מה שצריך לראות **בעיניים**, על הטלפון,
לפני שמעלים גרסה.

**עדיין לא נבדק על טלפון אמיתי בגרסה הזאת.** כל מה שכתוב פה הוא מה שצריך לעשות, לא
מה שנעשה.

**לפני שמתחילים — הכי חשוב:** פתח את האפליקציה הקיימת, ⋯ ← גיבוי, ושמור את הקובץ
במקום שאתה יודע למצוא (לא רק בהורדות). בלי זה אל תתחיל.

לא צריך להסתכל בקוד ולא בלוגים. רק לפתוח, ללחוץ, ולראות.

---

## بأي ترتيب تعملهم — بالعربي، ليوسف

القائمة تحت بالعبري لأنّ الي مكتوب فيها هو **حرفياً** الي رح تشوفه على الشاشة، وأي ترجمة
بتخلّيك تقارن كلام بكلام تاني. الترتيب بس، هون:

1. **قبل أي إشي: نسخة احتياطية** على التلفون الي رح تجرّب عليه (⋯ ← نسخة احتياطية).
   كل الي تحت بيشتغل على تسجيلات حقيقية، وبدون نسخة ما في رجوع.
2. **(أ) التحديث نفسه** — على تلفون شغّال بالنسخة القديمة. هاي أول وحدة لأنّها الوحيدة
   الي ما بتقدر تعيدها: أول ما تحدّث، خلص.
3. **(ب) تنزيل نظيف** — من تلفون تاني أو بعد ما تشيل التطبيق وترجّعه، **بس بعد** ما
   تتأكد إنّ ما في شغل ناطر بالطابور (⋯ ← מצב המכשיר لازم يقول «מסונכרן»).
4. **(ج) بلا شبكة** — هاي الأهم. طفّي الشبكة من الإعدادات، مش بس اقفل الواي فاي.
5. **(د) الشاشة** — بالترتيب المكتوب، لأنّ كل صف بيبني على الي قبله.
6. **(هـ) الملفات الي بتطلع من التلفون** — بدها تكون فتحت تقرير فيه أرقام حقيقية.
7. **(و) تلات تلفونات مع بعض** — آخر وحدة لأنّها بدها التلاتة على نفس النسخة.
8. **(ز) VoiceOver** و **(ح)/(ط) الي انضاف بالنسخ الجديدة** — بأي وقت.

**كل صف بالقائمة NOT RUN لحد ما إنت تعمله.** ما بقدر أعمل ولا واحد منهم: ولا آيفون ركض
أي إشي من هاد الكود.

---

## א. העדכון עצמו — הטלפון שכבר עובד עם הגרסה הישנה

| # | מה לעשות | מה צריך לקרות | מה לצלם |
|---|---|---|---|
| 1 | פתח את האפליקציה המותקנת כרגיל | נפתחת רגיל, הרישום הישן שם | מסך ראשי |
| 2 | חכה שתופיע הודעת "גרסה חדשה זמינה" | מופיעה | ההודעה |
| 3 | לחץ "רענן עכשיו" | טוען מחדש, לא מסך לבן, לא שגיאה | המסך אחרי |
| 4 | בדוק שבוע שלם אחורה | כל היום שהיה שם עדיין שם | שבוע |
| 5 | ⋯ ← גרסה | מספר הגרסה החדש | המספר |

**אם נשאר מסך לבן, או שהרישום נראה חסר — עצור, אל תמשיך, ותגיד.**

## ב. התקנה נקייה

| # | מה לעשות | מה צריך לקרות |
|---|---|---|
| 6 | ספארי → הכתובת → שתף → הוסף למסך הבית | האייקון נוסף |
| 7 | פתח מהאייקון | נפתח בלי סרגל הכתובת של ספארי |
| 8 | ⋯ ← שחזור → בחר את קובץ הגיבוי מסעיף ההכנה | הרישום חוזר במלואו |

## ג. בלי רשת — זה העיקר

| # | מה לעשות | מה צריך לקרות |
|---|---|---|
| 9 | מצב טיסה, ואז פתח את האפליקציה מהאייקון | **נפתחת**, והשורה למטה אומרת "אין חיבור - השינויים יישלחו כשהחיבור יחזור". לא מסך לבן, ולא עמוד שגיאה של הדפדפן |
| 10 | רשום יום עבודה במצב טיסה | נשמר, ורואים שיש משהו ממתין לשליחה |
| 11 | סגור לגמרי (החלק למעלה) ופתח שוב, עדיין בטיסה | היום שרשמת עדיין שם |
| 12 | כבה מצב טיסה | עובר ל"מחובר. יש רישומים שעדיין נשלחים", ורק כשהכל נשלח ל"מסונכרן" |
| 13 | אזור עם קליטה חלשה (לא מנותק — חלש) | לא נתקע על "מתחבר" לנצח |

## ד. המסך — לפי הסדר הזה

| # | מה לעשות | מה צריך לקרות |
|---|---|---|
| 14 | גלול לעובד **האחרון** ברשימה | מגיעים אליו, לא חסום מלמטה |
| 15 | פתח את גיליון השיבוץ, בחר אתר | הבא זז לעובד הבא לבד, פעם אחת |
| 16 | פתח מקלדת בתוך הגיליון | הכפתורים למטה לא מתכסים |
| 17 | סובב לרוחב | האזהרות למעלה עדיין נראות במלואן |
| 18 | הגדרות iOS → תצוגה → גודל טקסט → **הכי גדול** (AX2) | שום טקסט לא נחתך, שום כפתור לא נעלם, והגיליון נפתח עם הכפתורים שלו על המסך. **זה הבדיקה היחידה של Dynamic Type — שום סוויטה לא מכסה אותה** |
| 19 | מצב כהה ומצב בהיר | קריא בשניהם |
| 20 | מצב סידור מחדש: הזז עובד מהסוף להתחלה | זז, ונשמר |
| 20א | מסך שבוע: החלק את הטבלה הצידה | הימים זזים, **עמודת השמות נשארת במקום**, והדף עצמו לא זז |
| 20ב | מסך שבוע: לחץ על יום של עובד מסוים | נפתח היום הנכון של העובד הנכון — לא של היום שלידו |
| 20ג | מסך שבוע בטלפון הקטן ביותר שיש | התאים גדולים מספיק לאצבע; אין צורך לכוון |

## ה. הקבצים שיוצאים מהטלפון

| # | מה לעשות | מה צריך לקרות | מה לצלם |
|---|---|---|---|
| 21 | דוח → ייצוא Excel | יורד קובץ .xlsx | שם הקובץ |
| 22 | פתח אותו ב-Excel לאייפון | נפתח, **מימין לשמאל**, המספרים מספרים | הגיליון |
| 23 | פתח את אותו קובץ ב-Numbers | נפתח, לא ריק, לא שבור | הגיליון |
| 24 | חזור על 21 **במצב טיסה** | עדיין יוצא .xlsx אמיתי | שם הקובץ |
| 25 | פתח מודל של עובד, ובלי לסגור אותו — הדפס | ה-PDF מראה את הדוח, לא את המודל | ה-PDF |
| 26 | ב-PDF: יש אזהרות (עובד בלי מחיר וכו') | האזהרות **בפנים**, לא נחתכות | הדף |
| 27 | חשבונית עם 8 אתרים ושמות ארוכים | לא נחתך, אין שמות עובדים בכלל | הדף |

## ו. שלושה טלפונים ביחד

| # | מה לעשות | מה צריך לקרות |
|---|---|---|
| 28 | שני טלפונים, אותו יום, **עובדים שונים** | שניהם נשמרים, אף אחד לא נמחק |
| 29 | שני טלפונים, אותו יום, **אותו עובד**, אתר אחר | לא נעלם בשקט. או שאחד מנצח וברור, או שנאמר שיש התנגשות |
| 30 | טלפון אחד בטיסה עורך, פותחים אותו אחרי שהשני שינה | שום ערב לא נעלם |
| 31 | ⋯ ← מצב המכשיר | לא כתוב "מסונכרן" כשיש משהו ממתין |

## ז. VoiceOver (קצר)

| # | מה לעשות | מה צריך לקרות |
|---|---|---|
| 32 | הפעל VoiceOver, פתח את התפריט | מקריא שם לכל כפתור, לא "כפתור" סתם |
| 33 | פתח דיאלוג וסגור ב-Escape/החלקה | חוזר לאותו מקום שהיית בו |

## ח. מה שנוסף ב-v97 ו-v98

הבנייה האלה נכתבו מתוך מה שראית על הטלפון בסבב הראשון. אף אחת מהשורות האלה לא נבדקה
על טלפון - הן בדיוק מה שצריך לראות בעיניים כדי לדעת שהתיקון עבד.

| # | מה לעשות | מה צריך לקרות |
|---|---|---|
| 34 | פתח דוח מהאפליקציה שבמסך הבית ולחץ "הדפס" | או שנפתח חלון ההדפסה של iOS, או שתוך שתי שניות מופיעה הודעה שההדפסה לא נפתחה במסך הזה ומוצעת התמונה. **לא כלום זה כישלון** |
| 35 | לחץ "🖼️ שיתוף כתמונה" במסך שבוע | נפתח חלון השיתוף עם תמונת PNG, השבוע בה נקרא מימין לשמאל, השם מתחיל ב-`farkad-שבוע-` |
| 36 | אותו דבר מתוך דוח | תמונה של הדוח, מימין לשמאל, השם מתחיל ב-`farkad-דוח-` |
| 37 | עמוד על שבת ולחץ על החץ קדימה ואחורה | מדלג מעל שבת ריקה ונוחת על יום שיש בו רישום |
| 38 | הקש פעמיים מהר על שם עובד, על כפתור, על טבלה | הדף **לא** מתקרב. צביטה לתקריב עדיין עובדת |
| 39 | נתק את הרשת בזמן שיש משהו ממתין, והסתכל על השבב למעלה | כתוב "שגיאת סנכרון" או "השליחה תקועה" - המשפט קודם, לא המספר לבד |
| 40 | ⋯ ← ייצוא, ובחר "שמור קובץ" | נשמר קובץ אחד. **הקש על הרקע כדי לסגור** - לא נשמר קובץ שני |
| 41 | פתח את אפליקציית "קבצים" והסתכל על השמות | מתחילים באותיות לטיניות (`farkad-payroll_…`, `farkad-reports_…`), התאריכים בסדר הנכון |
| 42 | הסתכל על טווח התאריכים בראש הדוח ובכותרת השבוע | התאריך המוקדם **משמאל**, המאוחר מימין, בשורה אחת |
| 43 | פתח את חלון העובד מתוך הדוח | נפתח בראש שלו - הכותרת ושורת התאריכים נראות, לא מגולל לסוף |
| 44 | הדפס דוח "לפי אתר" | אין עמוד ראשון ריק. העמוד הראשון הוא החשבונית |
| 45 | הסתכל על שורות התאריך בטבלת "לפי אתר" | כתוב «ראשון 23/08» - יום ותאריך קצר, בלי השנה. השנה מופיעה בשורת התקופה למעלה, ובקובץ המיוצא היא עדיין מלאה |

## ט. מה שנוסף ב-v99 עד v103

גם אלה לא נבדקו על טלפון. הן בדיוק מה שצריך לראות בעיניים כדי לדעת שהתיקון עבד.

| # | מה לעשות | מה צריך לקרות |
|---|---|---|
| 46 | פתח את האפליקציה ממסך הבית, פתח שדה כלשהו וסגור את המקלדת בזמן שהדף מגולל | שתי השורות התחתונות **חוזרות**. אם הן נעלמו - זה בדיוק הבאג של v99 |
| 47 | פתח את גיליון השיתוף או את חלון ההדפסה, וסגור אותו | אותו דבר: הבארים חוזרים בלי שצריך להרוג את האפליקציה |
| 48 | הוצא את האפליקציה לרקע והחזר אותה | הבארים במקום, והמסך לא נשאר עם רווח ריק למטה |
| 49 | ⋯ ← ענן וסנכרון, כשיש שגיאה | מתחת למשפט השגיאה יש שורה שאומרת **למה**: הענן מסרב, או שצריך להתחבר שוב, או שאין רשת כרגע |
| 50 | גלול את רשימת העובדים במסך היום | הכותרת מתכווצת לשורה אחת - שם היום, התאריך ושני החצים נשארים. **אף באר לא נעלם** |
| 51 | גלול חזרה לראש הדף | השורה השנייה חוזרת: בטל / שוב / היום והמונה |
| 52 | הסתכל על כרטיס אתר במצב "לפי אתרים" | שני הכפתורים הם עכשיו ＋ ו-💬 **בתוך הכותרת הצבעונית**, ואין שורת כפתורים מתחת לרשימה |
| 53 | הפעל VoiceOver והצבע על ה-＋ שבכותרת | הוא אומר «הוסף עובד ל<שם האתר>» - לא "כפתור" בלבד |
| 54 | פתח את מסך שבוע בטלפון צר (390 ומטה) | בקצה שממנו השבוע נחתך יש דהייה. הפיץ' לא השתנה - עדיין צריך לדחוף |
| 55 | שלח סידור בוואטסאפ ליום שיש בו אתר או עובד בשם לטיני | הפין 📍 והנקודה • נשארים **מימין** בכל שורה. שום שורה לא מתהפכת |
| 56 | פתח את מסך שבוע באפליקציה ריקה (בלי עובדים) | כתוב «אין עובדים להצגה. הוסף עובד במסך עובדים ואתרים.» - ולא רק שאין מה להציג |
| 57 | ⋯ ← גרסה | כתוב v103. אם כתוב מספר אחר - האפליקציה לא סיימה להתעדכן |
| 58 | פתח דוח "לפי עובדים" בחודש שהיום הראשון בו הוא תחילת חשבון | מספר הימים והסכום **תואמים** את מה שהצוות באמת עבד. זה הבאג ש-v100 תיקן: לפני כן החודש הראה עשרה ימים במקום עשרים |

---

## מה לשלוח בחזרה

לכל שורה: **עבר / לא עבר**, ואם לא עבר — צילום מסך ומה בדיוק ראית.
במיוחד: 3, 9, 14, 18, 22, 24, 25, 29.

## מה שאסור להסיק מרשימה זאת

זו בדיקת קבלה, לא אישור פרסום. גם אם הכל עובר, השחרור בפועל הוא פעולה נפרדת
ומבוקרת: כללי השרת, סדר העדכון של הטלפונים, ותוכנית חזרה אחורה.

---

# قائمة القبول على جهاز حقيقي — ليوسف

نفس القائمة أعلاه. ما في فحص آلي بيقدر يشهد على أيفون حقيقي.

**قبل ما تبدأ:** افتح التطبيق، ⋯ ← نسخة احتياطية، واحفظ الملف بمكان بتعرف ترجعله.
بدون هيك ما تبدأ.

الأهم من كل القائمة، بالترتيب:

1. **التحديث من النسخة القديمة** (بنود 1–5): لازم يفتح، وما يضيع ولا يوم من التسجيل.
2. **بدون شبكة** (بنود 9–13): التطبيق لازم يفتح وهو على وضع الطيران. هاي أهم إشي.
3. **آخر عامل بالقائمة** (بند 14): لازم توصله.
4. **الخط الكبير** (بند 18): ولا زر بيختفي.
5. **ملف Excel** (بنود 21–24): لازم يفتح من اليمين لليسار، وكمان وهو بدون شبكة.
6. **الطباعة والمودال مفتوح** (بند 25): الـPDF لازم يطلع التقرير مش المودال.
7. **تلفونين على نفس اليوم ونفس العامل** (بند 29): ما بصير إشي يضيع بالسكوت.
8. **الي انضاف بـv97 و v98** (بنود 34–45): هاي بالضبط الأربع إشيا الي حكيت عنها -
   الطباعة، والسبت، والتكبير بنقرتين، ورقاقة المزامنة - زائد مسار التصدير وأسماء
   الملفات واتجاه التواريخ. البند 34 هو الأهم فيها: **ما بصير يصير ولا إشي** لما
   تضغط "הדפס" - يا بينفتح الطباعة، يا بتطلع رسالة وبتنعرض الصورة.

ابعت لكل بند: **مرق / ما مرق**، وإذا ما مرق — صورة شاشة وشو بالضبط صار.

ما بدنا منك تفتح كود ولا سجلات. بس تفتح، تضغط، وتشوف.

---

## إذا إشي ما مرق — شو تبعت بالضبط

**تلات إشيا، ولا إشي غيرها:**

1. **رقم البند** (مثلًا «بند 14»).
2. **صورة شاشة** للحظة الي صار فيها الإشي — مش بعدها.
3. **كتلة التشخيص:** ⋯ ← **מידע טכני** ← **«העתק»**، وبعدين الصق بالرسالة.

الكتلة الثالثة هي الي بتوفّر جولة أسئلة كاملة. بتحمل رقم بناء الصفحة، ورقم بناء
التطبيق، **وتعداد الـservice worker لبناءاته** (`sw.builds`) — وهاد بالضبط الي بيحسم
«أي نسخة على هالتلفون» بدل التخمين من أبعاد صورة. وكمان بتحمل مقاس الشاشة الحقيقي
ومقياس التكبير ومستطيلات الشريطين مقيسة، وعدد المعلّق وسبب المزامنة.

**وما بتحمل ولا اسم عامل، ولا اسم موقع، ولا مبلغ، ولا كلمة سر.** هاد مقيس باختبار
بيزرع اسمًا عبريًا واسمًا لاتينيًا ومبالغ، وبيتأكد إنه ولا واحد فيهم بيطلع بالكتلة —
الاسم اللاتيني موجود بالاختبار عن قصد، لأن الكتلة ASCII بالبناء فالعبري ما بيظهر
أصلًا، واللاتيني وحده بيختبر الضمانة مش الآلية.

فتقدر تبعتها بواتساب بدون ما تفكر فيها.

---

## v104 — the twelve rows this round could not run

Added by the closeout round. The first eleven exist because Chromium anchors
`position: fixed` to the LAYOUT viewport and iOS anchors it to the VISUAL one, so the
shape in the screenshot cannot be produced by any suite in this repository - that is a
measured limit, not an untried idea. **P11 is the row that ends the guessing about which
build the phone is on, and only the owner can run it.**

Every one of these is **NOT RUN**.

| # | what to do | what must happen | why no suite here can say |
|---|---|---|---|
| P1 | On the home-screen app: scroll the day list, then pull the page down and let it settle | Both bottom bars stay ON the bottom edge. If either floats mid-screen with content under it, that is the original fault | Chromium anchors `position: fixed` to the layout viewport, iOS to the visual viewport. The geometry cannot be produced here |
| P2 | Pinch to zoom in, pan to the bottom of the list, tap the last man | His sheet opens, with his name on it | `visualViewport.offsetTop` stays 0 in headless Chromium; `Input.synthesizeScrollGesture` is refused at the coordinates that would pan it |
| P3 | Open a field, dismiss the keyboard **with the page scrolled**, then tap the last man | Both bars return, and the tap reaches him | the return is measured here through the app's own seam; that Safari fires the events that seam is driven by is an assumption |
| P4 | Press «הדפס», then close the sheet iOS opens (or does not) | Both bars return without killing the app | Safari's print sheet has no Chromium equivalent |
| P5 | Background the app for a minute, bring it back, tap the last man | Bars in place, no empty strip at the bottom, the tap reaches him | `visibilitychange`/`pageshow` are dispatched here as events, not produced by the OS |
| P6 | Turn the phone sideways, scroll to the end of the list, tap the last man, in **both** orientations | Reached, in both | a real finger on real glass — the board says this too and does not claim it |
| P7 | iOS → Display → Text Size → largest (AX2), then open the day screen and the assign sheet | Nothing clipped, no button gone, every target still a finger's size | the 200% pass rewrites the CSS cascade; it is a real reflow and it is not Dynamic Type |
| P8 | ⋯ → מידע טכני → «העתק», paste into WhatsApp | The block pastes whole, and `sw.builds` names a build | `navigator.clipboard` behaves differently inside a home-screen web app; the fallback path is written and unexercised on a phone |
| P9 | With writes held (quarantine), scroll the day list | «הרישום מושבת» stays on the screen | measured here in Chromium; the compact header under Safari's own scroll is not |
| P10 | Delete a worker's day so the undo bar appears carrying a long name, then tap the last man in the list | He is reached, not the undo bar | the fix is measured here; a real finger on a real 320px screen is not |
| P11 | Send back the diagnostic block from the phone that produced the floating-bars screenshot | `page.build`, `app.build` and `sw.builds` all name the same version — or they do not, which is the answer | this is the one row that ends the guessing, and only the owner can run it |
| P12 | On the smallest phone at AX2: delete a worker's day so the undo bar appears, then try to reach the last man in the list | If he cannot be reached, that is expected on that screen — the undo bar expires in twelve seconds and בטל stays in the header. What must NOT happen is the bar covering the screen with no way out | measured here as a geometric impossibility, not as a bug; a person's judgement of whether it is tolerable is not a measurement |
