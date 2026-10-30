import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.tsx";
import { basenameFor, isRtl, localeFromPath } from "./i18n";
import { LocaleProvider } from "./i18n/LocaleProvider";

// Read before React starts: the router needs the basename at construction, and the
// document's language and direction should be right on the first paint rather than
// flipping once an effect runs.
const locale = localeFromPath(window.location.pathname);
document.documentElement.lang = locale;
document.documentElement.dir = isRtl(locale) ? "rtl" : "ltr";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LocaleProvider locale={locale}>
      <BrowserRouter basename={basenameFor(locale)}>
        <App />
      </BrowserRouter>
    </LocaleProvider>
  </StrictMode>
);
