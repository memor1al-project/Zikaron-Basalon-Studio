/**
 * The navigator's own chrome, in the language the survivor is speaking.
 *
 * The rest of the Studio is an English-language tool for the person *building* a
 * presentation. This screen is different: it's aimed at the people in the room —
 * often elderly Hebrew speakers — so its buttons follow the testimony, not the app.
 */

export interface NavigatorLabels {
  chapters: string;
  chapterOf: (n: number, total: number) => string;
  play: string;
  pause: string;
  previousChapter: string;
  nextChapter: string;
  back10: string;
  speed: string;
  slow: string;
  normal: string;
  textSize: string;
  stayInChapter: string;
  captions: string;
  topics: string;
  close: string;
  noChapters: string;
  loading: string;
  jumpTo: (title: string) => string;
}

const en: NavigatorLabels = {
  chapters: "Chapters",
  chapterOf: (n, total) => `Chapter ${n} of ${total}`,
  play: "Play",
  pause: "Pause",
  previousChapter: "Previous chapter",
  nextChapter: "Next chapter",
  back10: "Back 10 seconds",
  speed: "Speed",
  slow: "Slower",
  normal: "Normal",
  textSize: "Text size",
  stayInChapter: "Stop at the end of this chapter",
  captions: "Show the words",
  topics: "In this part",
  close: "Close",
  noChapters: "Chapters haven't been prepared for this testimony yet.",
  loading: "Loading...",
  jumpTo: (title) => `Jump to: ${title}`,
};

const he: NavigatorLabels = {
  chapters: "פרקים",
  chapterOf: (n, total) => `פרק ${n} מתוך ${total}`,
  play: "נגן",
  pause: "השהה",
  previousChapter: "הפרק הקודם",
  nextChapter: "הפרק הבא",
  back10: "10 שניות אחורה",
  speed: "מהירות",
  slow: "איטי",
  normal: "רגיל",
  textSize: "גודל טקסט",
  stayInChapter: "עצור בסוף הפרק",
  captions: "הצג את הנאמר",
  topics: "בחלק הזה",
  close: "סגור",
  noChapters: "עדיין לא הוכנו פרקים לעדות הזו.",
  loading: "טוען...",
  jumpTo: (title) => `קפוץ אל: ${title}`,
};

/**
 * The server canonicalizes language names, but raw ISO codes are tolerated here too so
 * chapter data generated before that normalization still renders in the right language.
 */
function languageKey(language: string): string {
  const key = language.trim().toLowerCase().split(/[-_]/)[0];
  if (["he", "heb", "iw", "hebrew"].includes(key) || language.includes("עבר")) return "hebrew";
  if (["ar", "ara", "arabic"].includes(key)) return "arabic";
  if (["ru", "rus", "russian"].includes(key)) return "russian";
  if (["pl", "pol", "polish"].includes(key)) return "polish";
  if (["de", "deu", "ger", "german"].includes(key)) return "german";
  if (["yi", "yid", "yiddish"].includes(key)) return "yiddish";
  return "english";
}

export function labelsFor(language: string): NavigatorLabels {
  return languageKey(language) === "hebrew" ? he : en;
}
