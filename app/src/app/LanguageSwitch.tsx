import { useLocation } from "react-router-dom";
import { switchLocalePath, useLocale } from "../i18n";

/**
 * Moves between the English and Hebrew versions of the page you're on.
 *
 * A full page load, not a route change: the language lives in the router's basename and
 * the document's direction, both fixed when the app starts. Reloading is also what makes
 * the address bar show the /he URL, which is the thing a visitor copies and sends on.
 */
export function LanguageSwitch() {
  const { locale } = useLocale();
  const location = useLocation();

  const target = switchLocalePath(locale, location.pathname + location.search);
  const label = locale === "he" ? "English" : "עברית";

  return (
    <a
      href={target}
      // The label is in the language being switched TO, so it reads correctly either way.
      lang={locale === "he" ? "en" : "he"}
      style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink-soft)" }}
    >
      {label}
    </a>
  );
}
