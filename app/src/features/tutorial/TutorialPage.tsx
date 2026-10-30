import { AppLayout } from "../../app/AppLayout";
import { useAuth } from "../auth/useAuth";
import { useT } from "../../i18n";
import { Chapter, Face, MockApp, Node, Note, Shot, Tile, type RailStep } from "./TutorialScreens";

/**
 * How to use the Studio, followed through one family from start to finish.
 *
 * Written in Hebrew and left in Hebrew whatever the interface language: it walks through
 * the organisation's own questions, which are Hebrew, and a half-translated walkthrough
 * would be harder to follow than one language consistently.
 *
 * The family is the Helfgotts, because an abstract example teaches nothing — "add a tag"
 * means little until you have seen "Aliyah Bet" sitting on a scanned war diary.
 */

const RAIL_FULL: RailStep[] = [
  { label: "הרשמה", state: "done" },
  { label: "אחסון", state: "done", sub: "helfgot" },
  { label: "איסוף", state: "done", sub: "7 קבצים" },
  { label: "עץ המשפחה", sub: "לא חובה" },
  { label: "הסיפור" },
  { label: "סיכום" },
];

const CONTENTS = [
  "מה הכלי הזה עושה",
  "המשפחה שתלווה אותנו",
  "הרשמה",
  "אחסון — איפה החומרים חיים",
  "איסוף — תיוג החומרים",
  "עץ המשפחה",
  "הסיפור — הראיון המונחה",
  "סיכום — ומה אפשר ליצור",
  "גיבוי והעברה למחשב אחר",
  "מדריכים וחומרים של העמותה",
  "דיווח על תקלות",
  "שאלות נפוצות",
];

export function TutorialPage() {
  const { user } = useAuth();
  const t = useT();

  return (
    <AppLayout step="tutorial" profileDone={true} signedIn={Boolean(user)}>
      <div className="wizard-page" style={{ padding: "48px 40px", display: "flex", justifyContent: "center" }}>
        {/* Hebrew throughout, so the column reads right-to-left in either interface language. */}
        <div className="card-enter tut" dir="rtl" style={{ width: "100%" }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: ".09em",
              textTransform: "uppercase",
              color: "var(--accent-deep)",
            }}
          >
            {t("Zikaron BaSalon")}
          </div>
          <h1 style={{ fontSize: 31, lineHeight: 1.25, margin: "6px 0 10px" }}>
            סטודיו הסיפורים — מדריך למשתמש
          </h1>
          <p style={{ fontSize: 16.5, color: "var(--ink-soft)", lineHeight: 1.65, maxWidth: 700 }}>
            איך אוספים סיפור משפחתי, בונים ממנו ערב זיכרון בסלון, ומה עושים כשמשהו לא עובד.
            המדריך עוקב אחרי משפחה אחת לאורך כל הדרך — משפחת הלפגוט.
          </p>

          <div className="tut-toc">
            <strong>מה יש כאן</strong>
            <ol>
              {CONTENTS.map((title, i) => (
                <li key={title}>
                  <a href={`#ch${i + 1}`}>{title}</a>
                </li>
              ))}
            </ol>
          </div>

          {/* ─────────────── 1 ─────────────── */}
          <Chapter n={1} title="מה הכלי הזה עושה" sub="מתצלומים בקופסה לסיפור שאפשר לספר בסלון." />
          <p>
            לרוב המשפחות יש חומרים — תצלומים, מכתבים, מסמכים, הקלטה ישנה — אבל אין סיפור.
            הסטודיו לוקח את אסופת החומרים הזו ומוביל אותה, שלב אחר שלב, לכדי סיפור שאפשר לספר בערב
            זיכרון בסלון.
          </p>
          <p>הדרך בנויה משישה שלבים, והתפריט מראה תמיד איפה אתם נמצאים ומה כבר הושלם:</p>

          <table>
            <tbody>
              <tr>
                <th>השלב</th>
                <th>מה עושים בו</th>
              </tr>
              <tr>
                <td>
                  <strong>הרשמה</strong>
                </td>
                <td>מי אתם — בן משפחה, מארח, או צוות העמותה.</td>
              </tr>
              <tr>
                <td>
                  <strong>אחסון</strong>
                </td>
                <td>מחברים את התיקייה שבה החומרים נמצאים. הם לא עוזבים את המחשב.</td>
              </tr>
              <tr>
                <td>
                  <strong>איסוף</strong>
                </td>
                <td>עוברים על החומרים: תגיות, הערות, מקומות, פנים.</td>
              </tr>
              <tr>
                <td>
                  <strong>עץ המשפחה</strong>
                </td>
                <td>מי קשור למי. לא חובה.</td>
              </tr>
              <tr>
                <td>
                  <strong>הסיפור</strong>
                </td>
                <td>ראיון מונחה — חמישה חלקים של שאלות.</td>
              </tr>
              <tr>
                <td>
                  <strong>סיכום</strong>
                </td>
                <td>הכול במקום אחד, ומכאן יוצרים חוברת, מצגת או כתבה.</td>
              </tr>
            </tbody>
          </table>

          <Note>
            <p>
              <strong>החומרים שלכם נשארים אצלכם.</strong> הסטודיו קורא את הקבצים מהתיקייה שבחרתם
              ושומר את המטא-דאטה בקובץ <code>zikaron-metadata.sqlite</code> באותה תיקייה — לצד
              החומרים עצמם. שום תצלום ושום מסמך לא מועלים לשרת.
            </p>
          </Note>

          {/* ─────────────── 2 ─────────────── */}
          <Chapter n={2} title="המשפחה שתלווה אותנו" sub="משפחת הלפגוט, סטרי, פולין." />
          <p>
            כדי שהמדריך לא יישאר מופשט, כל שלב מוצג דרך סיפור אחד אמיתי:{" "}
            <strong>רחל הלפגוט</strong>, ילידת סטרי שבפולין, 4 במאי 1914.
          </p>
          <ul>
            <li>
              אביה, <strong>משה הלפגוט</strong>, היה מורה לעברית. הבית היה ציוני, ודיברו בו עברית.
            </li>
            <li>
              אמה, <strong>טונצ'יה ברטלר</strong>. לרחל היו שלושה אחים למחצה מנישואיו הראשונים של
              האב, ואח צעיר בשם <strong>איזו</strong>.
            </li>
            <li>בזמן המלחמה הסתתרה בסטרי ובסביבתה — בעליית גג, ביער ובבונקר תת-קרקעי.</li>
            <li>
              בחורף 1941 ילדה את <strong>עמוס</strong> בבית החולים היהודי, בלילה, בזמן עוצר.
            </li>
            <li>
              ב-1948 עלתה לישראל. לימים נודעה בשם <strong>רחל שפריר</strong>.
            </li>
          </ul>
          <p>
            מה שיש למשפחה ביד: תיקייה בשם <code>helfgot</code> ובה שבעה קבצים — תצלומים, סרטון,
            ו-PDF סרוק של יומן המלחמה שרחל כתבה בעצמה.
          </p>

          {/* ─────────────── 3 ─────────────── */}
          <Chapter n={3} title="הרשמה" sub="צעד קצר אחד, פעם אחת." />
          <p>בכניסה הראשונה הסטודיו שואל מי אתם. זה משנה את הטקסטים שתראו בהמשך, ולא יותר מזה.</p>

          <Shot caption="דנה, נכדתה של רחל, בוחרת „בן או בת משפחה”. אפשר לחזור ולשנות בכל שלב.">
            <MockApp
              minHeight={200}
              steps={[{ label: "הרשמה", state: "now" }, { label: "אחסון" }, { label: "איסוף" }]}
            >
              <div className="tut-panel" style={{ maxWidth: 330 }}>
                <h5>ספרו לנו מי אתם</h5>
                <p style={{ fontSize: 10.5, color: "var(--ink-soft)", margin: "0 0 9px" }}>
                  כדי שהצוות יֵדע עם מי הוא עובד עוד לפני שמתחילים לאסוף סיפור.
                </p>
                <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 5 }}>אני כאן בתור...</div>
                <div className="tut-chips" style={{ flexDirection: "column", alignItems: "stretch" }}>
                  <span className="tut-chip is-on">בן או בת משפחה — אוספים את סיפורו של קרוב משפחה</span>
                  <span className="tut-chip">מארח/ת — מעבירים מפגש בסלון</span>
                  <span className="tut-chip">צוות זיכרון בסלון</span>
                </div>
                <div className="tut-btnrow">
                  <span className="tut-btn is-primary">המשך</span>
                </div>
              </div>
            </MockApp>
          </Shot>

          {/* ─────────────── 4 ─────────────── */}
          <Chapter n={4} title="אחסון — איפה החומרים חיים" sub="מחברים תיקייה פעם אחת." />
          <p>
            כאן בוחרים את התיקייה שבה החומרים כבר נמצאים. הדפדפן מבקש אישור, ומאותו רגע כל מה
            שבתיקייה זמין לתיוג. הקבצים לא מועתקים ולא מועלים לשום מקום.
          </p>

          <Shot caption="אחרי הפעם הראשונה הסטודיו זוכר את התיקייה ומציע „המשך עם helfgot”.">
            <MockApp
              steps={[
                { label: "הרשמה", state: "done" },
                { label: "אחסון", state: "now" },
                { label: "איסוף" },
              ]}
            >
              <h4>היכן נמצאים החומרים של הסיפור הזה?</h4>
              <p>חברו מיקום פעם אחת, וכל מה שנמצא בו יהיה זמין לתיוג, לעיון ולשילוב במצגת בהמשך.</p>
              <div className="tut-card is-resume">
                <b>המשך עם helfgot</b>
                המכשיר הזה · מהמקום שבו הפסקתם
              </div>
              <div className="tut-card">
                <b>המכשיר הזה</b>בחרו תיקייה מהמכשיר הזה
              </div>
              <div className="tut-card">
                <b>Google Drive</b>בחרו תיקייה מחשבון Google
              </div>
            </MockApp>
          </Shot>

          <Note>
            <p>
              <strong>למה צריך לבחור שוב בכל פעם?</strong> דפדפנים לא נותנים לאתר גישה קבועה
              לתיקייה בלי אישור מחודש. זו הגנה, לא תקלה — לחיצה אחת על „המשך” מחזירה את הכול.
            </p>
          </Note>

          {/* ─────────────── 5 ─────────────── */}
          <Chapter n={5} title="איסוף — תיוג החומרים" sub="כאן נמצאת רוב העבודה, וכאן היא משתלמת." />
          <p>
            כל קובץ בתיקייה מופיע ככרטיס. לוחצים על כרטיס כדי לפתוח אותו ולהוסיף תגיות, הערות
            ומקום. מה שתכתבו כאן יחזור אליכם בשלב הסיפור ובמצגת.
          </p>

          <Shot caption="רצועת הפנים מעל הכרטיסים מסננת לפי אדם — לחיצה על „rachel” תשאיר רק את החומרים שבהם היא מופיעה.">
            <MockApp
              minHeight={270}
              steps={[
                { label: "הרשמה", state: "done" },
                { label: "אחסון", state: "done", sub: "helfgot" },
                { label: "איסוף", state: "now", sub: "7 קבצים" },
                { label: "עץ המשפחה", sub: "לא חובה" },
              ]}
            >
              <h4>helfgot</h4>
              <p>נמצאו 5 קבצים · 7 בתיקייה · 13 הוסרו</p>
              <div className="tut-search">⌕ חיפוש לפי שם, תגית או הערה</div>
              <div style={{ fontSize: 10, color: "var(--ink-soft)", marginBottom: 5 }}>
                אנשים — הקישו על פנים כדי לראות רק את החומרים שבהם הם מופיעים
              </div>
              <div className="tut-faces">
                <Face initial="א" name="Izak" on />
                <Face initial="ר" name="rachel" />
                <Face initial="ע" name="Edzia" />
                <Face initial="פ" name="fishko" />
              </div>
              <div className="tut-grid">
                <Tile glyph="▶" name="…WA0000.mp4" tag="סרטון" />
                <Tile glyph="▤" name="The_War_Diary.pdf" tag="מסמך" />
                <Tile glyph="◧" name="I212.png" tag="תצלום" sage />
                <Tile glyph="◧" name="I217.png" tag="תצלום" sage />
              </div>
            </MockApp>
          </Shot>

          <h3>שלוש פעולות ששוות את הזמן</h3>
          <ul>
            <li>
              <strong>תגיות.</strong> אצל הלפגוט: „היסטוריה משפחתית”, „קיבוץ”, „שורדי שואה”,
              „עלייה ב'”. התגיות הן מה שמאפשר למצוא חומר באופן קל ומהיר.
            </li>
            <li>
              <strong>מקום.</strong> כל חומר יכול לקבל מיקום. בשלב הסיכום כל המקומות מופיעים יחד
              על מפה.
            </li>
            <li>
              <strong>פנים.</strong> בתצלום אפשר לזהות פנים ולתת להן שם. מכאן אפשר להעביר אותן
              ישירות לעץ המשפחה, עם התמונה.
            </li>
          </ul>

          <Note>
            <p>
              <strong>„נמצאו 5 קבצים · 7 בתיקייה · 13 הוסרו” — מה זה אומר?</strong>
              <br />
              המספרים מראים כל שלב בנפרד: כמה מוצגים עכשיו, כמה יש בתיקייה בפועל, וכמה הוסרו
              מהסיפור. חומר שהוסר לא נמחק מהדיסק — אפשר להחזיר אותו דרך „הוסרו מהסיפור הזה”
              בתחתית הדף.
            </p>
          </Note>

          {/* ─────────────── 6 ─────────────── */}
          <Chapter n={6} title="עץ המשפחה" sub="לא חובה — וגם שלושה שמות זה עץ." />
          <p>
            העץ עונה על שאלה אחת: מי קשור למי. אפשר להוסיף אנשים אחד-אחד, לייבא קובץ GEDCOM
            מ-MyHeritage או Gramps, או להביא את הפנים שכבר נתתם להן שם בשלב האיסוף.
          </p>

          <Shot caption="שמונה אנשים. רחל מסומנת כ„הסיפור הזה” — הטבעת סביבה — וכך שאר האשף יודע מי במרכז.">
            <MockApp
              minHeight={250}
              steps={[
                { label: "הרשמה", state: "done" },
                { label: "אחסון", state: "done", sub: "helfgot" },
                { label: "איסוף", state: "done", sub: "7 קבצים" },
                { label: "עץ המשפחה", state: "now", sub: "לא חובה" },
              ]}
            >
              <h4>העץ</h4>
              <p>לחצו לחיצה ימנית על אדם כדי להוסיף לידו קרוב משפחה. קו מקווקו מסמן בני זוג.</p>
              <div className="tut-tree">
                <div className="tut-treerow">
                  <Node initial="ח" name="hana" />
                  <Node initial="ר" name="rivka" />
                  <Node initial="פ" name="fishko" />
                  <div className="tut-partner" />
                  <Node initial="ע" name="Edzia" />
                </div>
                <div className="tut-rung" />
                <div className="tut-treerow">
                  <Node initial="נ" name="nora" />
                  <Node initial="א" name="Izak" />
                  <Node initial="ר" name="rachel" subject />
                </div>
                <div className="tut-rung" style={{ width: "28%" }} />
                <div className="tut-treerow">
                  <Node initial="ד" name="dana" />
                </div>
              </div>
            </MockApp>
          </Shot>

          <h3>פעולות שימושיות</h3>
          <ul>
            <li>
              <strong>לחיצה ימנית</strong> על אדם פותחת תפריט: הוספת ילד/ה, הורה, אח/ות או בן/בת
              זוג — ביחס אליו.
            </li>
            <li>
              <strong>„חיבור למישהו שכבר בעץ”</strong> מחבר שני אנשים שהוזנו בנפרד. זה קורה הרבה:
              סבתא שנוספה מתצלום, והנכדה שהוזנה חודש אחר כך.
            </li>
            <li>
              <strong>„מתוך פנים מתויגות”</strong> מביא את מי שכבר זיהיתם בתצלומים, עם התמונה
              שלהם.
            </li>
          </ul>

          {/* ─────────────── 7 ─────────────── */}
          <Chapter n={7} title="הסיפור — הראיון המונחה" sub="חמישה חלקים. אין חובה למלא הכול." />
          <p>
            זה ליבו של הכלי. השאלות הן אותן שאלות שבערכת מוסרי העדות של העמותה, מחולקות לחמישה
            חלקים: שאלות מרכזיות, היכרות עם עולמם, תקופת המלחמה, לאחר המלחמה, ומסר למשתתפים.
          </p>

          <Shot caption="חלק שכבר נענה מסומן ברקע בהיר. הלשוניות למעלה עוברות בין חמשת החלקים.">
            <MockApp
              minHeight={255}
              steps={[...RAIL_FULL.slice(0, 3), { label: "עץ המשפחה", state: "done" }, { label: "הסיפור", state: "now" }]}
            >
              <div className="tut-tabs">
                <span className="is-on">היכרות עם עולמם</span>
                <span>תקופת המלחמה</span>
                <span>לאחר המלחמה</span>
              </div>
              <h4>היכרות עם עולמם – החיים לפני המלחמה</h4>
              <div className="tut-card is-answered">
                <b>מתי והיכן נולדה?</b>
                נולדה ב-4 במאי 1914 בעיר סטרי, פולין.
              </div>
              <div className="tut-card is-answered">
                <b>מי היו בני המשפחה הקרובה והמורחבת בחייה?</b>
                אביה היה משה הלפגוט ואמה טונצ'יה ברטלר. היו לה שלושה אחים למחצה מנישואיו הראשונים
                של אביה, ואח צעיר בשם איזו.
              </div>
              <div className="tut-card">
                <b>האם דת, מסורת או תרבות היו חלק משגרת חייה?</b>
                <span style={{ color: "var(--ink-soft)" }}>כיצד, אם בכלל</span>
              </div>
            </MockApp>
          </Shot>

          <h3>אירועים — החלק שהופך תשובות לסיפור</h3>
          <p>
            מתחת לשאלות אפשר להוסיף <strong>אירועים</strong>: רגע אחד מסוים, עם תאריך, מקום, מי
            היה שם, ואיזה חומר שייך לו. אצל רחל נבנו שלושה:
          </p>
          <ul>
            <li>
              <strong>„מדברים עברית בתחנת הרכבת”</strong> — ליד תחנת הרכבת בשדרות קוליובקה. רחל
              ואביה דיברו עברית; אישה שאלה אם זו צרפתית, והאב השיב בגאווה שזו שפת התנ"ך.
            </li>
            <li>
              <strong>„לידתו של עמוס”</strong> — חורף 1941, בית החולים היהודי. רחל ילדה בלילה בזמן
              עוצר; אמה המבוגרת טיפסה על חומה בגובה שני מטרים כדי שיפתחו את השער.
            </li>
            <li>
              <strong>„מסתתרים בבונקר”</strong> — בונקר תת-קרקעי באזור נִינְיוֹב. אוקראיני בשם
              קוזיק הביא מזון ומים עד השחרור.
            </li>
          </ul>

          <Note>
            <p>
              <strong>אירוע טוב הוא סצנה אחת, לא תקציר.</strong>
            </p>
          </Note>

          {/* ─────────────── 8 ─────────────── */}
          <Chapter n={8} title="סיכום — ומה אפשר ליצור" sub="הכול במקום אחד, ושלושה דברים לקחת מכאן." />
          <p>
            דף הסיכום אוסף את כל מה שנעשה: עץ המשפחה, מפה של כל המקומות שהוזכרו, ציר זמן של
            האירועים לפי סדרם, התצלומים, והתשובות חלק אחר חלק.
          </p>

          <Shot caption="שלושת התוצרים נבנים על המכשיר שלכם ונשמרים ישירות אליו.">
            <MockApp
              minHeight={250}
              steps={[
                { label: "איסוף", state: "done" },
                { label: "עץ המשפחה", state: "done" },
                { label: "הסיפור", state: "done" },
                { label: "סיכום", state: "now" },
              ]}
            >
              <h4>rachel</h4>
              <p>כל מה שנאסף עד כה, במקום אחד — שום דבר כאן עדיין לא נבדק ולא פורסם.</p>
              <div className="tut-card">
                <b>ליצור משהו מהסיפור הזה</b>
                <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  <span className="tut-btn">חוברת מזכרת</span>
                  <span className="tut-btn">מצגת</span>
                  <span className="tut-btn">כתבה</span>
                </div>
              </div>
              <div className="tut-card">
                <b>ציר זמן</b>אירועים, לפי סדר הופעתם לאורך הסיפור.
              </div>
              <div className="tut-card">
                <b>מפה</b>פריז · רומא
              </div>
            </MockApp>
          </Shot>

          <table>
            <tbody>
              <tr>
                <th>התוצר</th>
                <th>מה השימושים שלו</th>
              </tr>
              <tr>
                <td>
                  <strong>חוברת מזכרת</strong>
                </td>
                <td>PDF להדפסה. מה שנשאר אצל המשפחה אחרי הערב.</td>
              </tr>
              <tr>
                <td>
                  <strong>מצגת</strong>
                </td>
                <td>קובץ PowerPoint — סדר הרצה למפגש. אפשר לערוך בכל תוכנה.</td>
              </tr>
              <tr>
                <td>
                  <strong>כתבה</strong>
                </td>
                <td>הסיפור כטקסט, למייל או לניוזלטר.</td>
              </tr>
            </tbody>
          </table>

          {/* ─────────────── 9 ─────────────── */}
          <Chapter n={9} title="גיבוי והעברה למחשב אחר" sub="אם ממשיכים לעבוד במקום אחר." />
          <p>
            בדף <strong>קטלוג</strong> אפשר לייצא את הסיפור כולו — החומרים יחד עם הקטלוג — לקובץ
            דחוס אחד. הקובץ נושא תאריך, רשימת חומרים ומספר גרסה של הקטלוג.
          </p>
          <p>
            במחשב השני מחברים קודם תיקייה (שלב „אחסון”), ואז בוחרים „שחזור מקובץ ייצוא”. לארכיון
            גדול אפשר להוריד סקריפט שמפרק אותו מקומית, בלי לעבור דרך הדפדפן.
          </p>

          {/* ─────────────── 10 ─────────────── */}
          <Chapter n={10} title="מדריכים וחומרים של העמותה" sub="הערכות המודפסות של זיכרון בסלון, להורדה." />
          <p>
            בתפריט, מתחת ל„מצגת”, יש עמוד <strong>מדריכים וחומרים</strong> ובו שש ערכות שזיכרון
            בסלון מפרסמים — להורדה ישירה:
          </p>
          <ul>
            <li>
              <strong>ערכת אירוח</strong> — איך בונים ערב מתחילתו ועד סופו, כולל ספרון תוכן שנכתב
              בשיתוף יד ושם.
            </li>
            <li>
              <strong>ערכת מוסרי עדות</strong> — מבנה המפגש, איך אוספים את הסיפור, ושאלות מנחות.
              זו הערכה שעליה בנוי שלב „הסיפור”.
            </li>
            <li>
              <strong>איך עושים זיכרון בסלון — מדריך למורה</strong> — לאנשי חינוך בעל-יסודי.
            </li>
            <li>
              <strong>הסיפורים שלנו</strong> — הצעה לסלון שיתופי: כמה סיפורים קצרים במקום אחד ארוך.
            </li>
            <li>
              <strong>שיחה, הקשבה, מחשבה</strong> — טקסטים להשראה ולשיח.
            </li>
            <li>
              <strong>מצגת דוגמה לבניית הסיפור</strong> — שלד שאפשר לעבוד איתו.
            </li>
          </ul>

          {/* ─────────────── 11 ─────────────── */}
          <Chapter n={11} title="דיווח על תקלות" sub="מצביעים על מה שלא תקין — ושולחים." />
          <p>
            אם משהו נראה שבור, מנוסח רע או פשוט מבלבל, אפשר לדווח עליו ישירות מתוך הדף. הכלי{" "}
            <strong>כבוי כברירת מחדל</strong> — משפחה שאוספת סיפור לא רואה אותו כלל.
          </p>

          <h3>שלב א' — מפעילים</h3>
          <p>לוחצים על מספר הגרסה בתחתית התפריט, ואז על „הפעלת דיווח על תקלות”.</p>

          <Shot caption="אפשר גם לשלוח קישור שמפעיל ישירות: הוספת ?report=1 לכל כתובת.">
            <MockApp
              minHeight={215}
              steps={[
                { label: "הרשמה", state: "done" },
                { label: "אחסון", state: "done" },
                { label: "איסוף" },
              ]}
              railFoot={
                <>
                  עברית
                  <br />
                  <span className="tut-version is-hot">v0.11.11 · build 20 ←</span>
                </>
              }
            >
              <div className="tut-panel" style={{ maxWidth: 310 }}>
                <h5>דיווח על תקלות</h5>
                <p style={{ fontSize: 10.5, color: "var(--ink-soft)", margin: "0 0 8px" }}>
                  הפעילו כדי להצביע על כל דבר בדף ולתאר מה לא בסדר בו.
                </p>
                <span className="tut-btn is-primary">הפעלת דיווח על תקלות</span>
              </div>
            </MockApp>
          </Shot>

          <h3>שלב ב' — מדווחים</h3>
          <p>הכפתור „דיווח על תקלה” מופיע בתחתית. לוחצים עליו, ואז על החלק שעליו רוצים לדווח.</p>

          <Shot caption="מה שהעכבר עובר מעליו מסומן במסגרת מקווקוות. Esc יוצא.">
            <MockApp
              minHeight={190}
              banner="לחצו על החלק בדף שעליו תרצו לדווח · ביטול"
              steps={[
                { label: "אחסון", state: "done" },
                { label: "הסיפור", state: "now" },
              ]}
            >
              <h4 className="tut-picked">היכרות עם עולמם – החיים לפני המלחמה</h4>
              <p>מי הם היו לפני שהכול השתנה.</p>
              <div className="tut-card">
                <b>מתי והיכן נולדה?</b>
              </div>
              <div className="tut-fabrow">
                <span className="tut-fab is-on">⚑ ביטול</span>
              </div>
            </MockApp>
          </Shot>

          <Shot caption="בוחרים סוג, כותבים מה ראיתם ומה ציפיתם, ומוסיפים לרשימה.">
            <MockApp minHeight={200} dim steps={[{ label: "אחסון", state: "done" }]}>
              <div className="tut-panel" style={{ maxWidth: 320, margin: "4px auto" }}>
                <h5>מה לא בסדר כאן?</h5>
                <p style={{ fontSize: 10, color: "var(--ink-soft)", margin: "0 0 7px" }}>
                  <code>h1</code> · „היכרות עם עולמם – החיים לפני המלחמה”
                </p>
                <div className="tut-chips">
                  <span className="tut-chip">נראה לא תקין</span>
                  <span className="tut-chip is-on">ניסוח</span>
                  <span className="tut-chip">לא עובד</span>
                  <span className="tut-chip">מבלבל</span>
                </div>
                <div className="tut-textarea">הכותרת ארוכה מדי ונשברת לשתי שורות בלשונית.</div>
                <div className="tut-btnrow">
                  <span className="tut-btn">ביטול</span>
                  <span className="tut-btn is-primary">הוספה לרשימה</span>
                </div>
              </div>
            </MockApp>
          </Shot>

          <h3>שלב ג' — שולחים</h3>
          <p>
            המונה שליד הכפתור פותח את הרשימה. „העתקת הרשימה” מעתיקה טקסט מסודר — מדביקים במייל
            ושולחים.
          </p>

          <Shot caption="כל דיווח נושא אוטומטית את הדף, השפה ומספר הגרסה.">
            <MockApp minHeight={215} dim steps={[{ label: "אחסון", state: "done" }]}>
              <div className="tut-panel" style={{ maxWidth: 330, margin: "2px auto" }}>
                <h5>תקלות שדווחו (3)</h5>
                <p style={{ fontSize: 10, color: "var(--ink-soft)", margin: "0 0 8px" }}>
                  הן נשמרות בדפדפן הזה עד שתייצאו אותן.
                </p>
                <div
                  style={{
                    border: "1px solid var(--line)",
                    borderRadius: 7,
                    background: "var(--bg-cream)",
                    padding: "7px 9px",
                    marginBottom: 5,
                  }}
                >
                  <span className="tut-chip is-on" style={{ fontSize: 9 }}>
                    ניסוח
                  </span>
                  <div style={{ marginTop: 3 }}>הכותרת ארוכה מדי ונשברת לשתי שורות.</div>
                </div>
                <div
                  style={{
                    border: "1px solid var(--line)",
                    borderRadius: 7,
                    background: "var(--bg-cream)",
                    padding: "7px 9px",
                  }}
                >
                  <span className="tut-chip is-on" style={{ fontSize: 9 }}>
                    לא עובד
                  </span>
                  <div style={{ marginTop: 3 }}>כפתור ההורדה לא מגיב בספארי.</div>
                </div>
                <div className="tut-btnrow">
                  <span className="tut-btn is-primary">העתקת הרשימה</span>
                  <span className="tut-btn">הורדה כקובץ</span>
                </div>
              </div>
              <div className="tut-fabrow">
                <span className="tut-fab">⚑ דיווח על תקלה</span>
                <span className="tut-fabcount">3</span>
              </div>
            </MockApp>
          </Shot>

          <p style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>
            זה הנוסח שמועתק. התוויות באנגלית בכוונה — הן מיועדות לתיקון:
          </p>
          <pre>
            <code>{`## /he/collection/story/life-before-war

- **Wording** — הכותרת ארוכה מדי ונשברת לשתי שורות
  - element: \`h1\`
  - text on screen: "היכרות עם עולמם – החיים לפני המלחמה"
  - he · v0.11.11 build 20 · 1440×900`}</code>
          </pre>

          <Note>
            <p>
              <strong>הדיווחים לא נשלחים לבד.</strong> שום דבר לא עוזב את הדפדפן עד שלוחצים
              „העתקת הרשימה” או „הורדה כקובץ”. זו אותה הבטחה שהסטודיו נותן לגבי החומרים של
              המשפחה.
            </p>
          </Note>

          {/* ─────────────── 12 ─────────────── */}
          <Chapter n={12} title="שאלות נפוצות" />

          <p style={{ fontWeight: 700, marginBottom: 2 }}>החומרים שלי מועלים לאינטרנט?</p>
          <p style={{ color: "var(--ink-soft)" }}>
            לא. הסטודיו קורא את הקבצים מהתיקייה שבחרתם ושומר את המטא-דאטה בקובץ SQLite באותה
            תיקייה. התצלומים, המסמכים וההקלטות נשארים אצלכם.
          </p>

          <p style={{ fontWeight: 700, marginBottom: 2 }}>למה כפתורי הבינה המלאכותית לא פעילים?</p>
          <p style={{ color: "var(--ink-soft)" }}>
            הם עדיין לא הופעלו. זיכרון בסלון מסדירים את החשבון שעליו הם יפעלו. לחיצה עליהם מציגה
            הסבר. בינתיים כל מה שרץ על המכשיר — חילוץ טקסט מ-PDF, זיהוי פנים, תגיות, מקומות, עץ
            המשפחה והקטלוג — עובד כרגיל.
          </p>

          <p style={{ fontWeight: 700, marginBottom: 2 }}>אפשר לעבוד בשני מחשבים?</p>
          <p style={{ color: "var(--ink-soft)" }}>
            כן — דרך ייצוא ושחזור (פרק 9). אין סנכרון אוטומטי, במכוון: זה היה אומר להעלות את
            החומרים לשרת.
          </p>

          <p style={{ fontWeight: 700, marginBottom: 2 }}>חלק מהמסכים עדיין באנגלית.</p>
          <p style={{ color: "var(--ink-soft)" }}>
            נכון. התרגום נעשה מסך אחר מסך; חלון פרטי החומר והקטלוג עדיין באנגלית ברובם. אם
            נתקלתם בטקסט אנגלי שמפריע — זה בדיוק מה שכדאי לדווח עליו.
          </p>

          <p style={{ fontWeight: 700, marginBottom: 2 }}>מחקתי בטעות חומר מהסיפור.</p>
          <p style={{ color: "var(--ink-soft)" }}>
            הוא לא נמחק מהדיסק. בתחתית דף האיסוף יש „הוסרו מהסיפור הזה” ובו „החזרת הכול”. התגיות
            וההערות של אותו חומר כן נמחקו בעת ההסרה.
          </p>

          <p style={{ fontWeight: 700, marginBottom: 2 }}>צריך להשלים את כל השאלות?</p>
          <p style={{ color: "var(--ink-soft)" }}>
            לא. שאלה ריקה היא תשובה לגיטימית — יש דברים שאין עליהם עדות. גם שניים או שלושה
            אירועים טובים הם סיפור שאפשר לספר בסלון.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
