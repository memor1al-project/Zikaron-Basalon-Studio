import { createContext, useContext } from "react";

/**
 * Two languages, chosen by URL: everything under /he is Hebrew, everything else English.
 *
 * The prefix is a router basename rather than a segment in every route, so no route
 * definition changes and every <Link to="/collection"> keeps the visitor in the language
 * they're reading. It also means a Hebrew page has its own address to share — which
 * matters for an audience being sent a link to a specific survivor's testimony.
 *
 * Keys are the English text itself. A missing translation then falls back to something
 * readable rather than to "collection.materials.title", and a string nobody has translated
 * yet is visibly English rather than invisibly blank.
 *
 * This file deliberately exports no components — LocaleProvider lives next door, because a
 * module mixing components with plain functions breaks fast refresh for its importers.
 */

export type Locale = "en" | "he";

export const LOCALE_PREFIX = "/he";

/** Reads the language out of the address, before React starts. */
export function localeFromPath(pathname: string): Locale {
  return pathname === LOCALE_PREFIX || pathname.startsWith(`${LOCALE_PREFIX}/`) ? "he" : "en";
}

export function basenameFor(locale: Locale): string | undefined {
  return locale === "he" ? LOCALE_PREFIX : undefined;
}

export function isRtl(locale: Locale): boolean {
  return locale === "he";
}

/** The same page in the other language, as a full path. */
export function switchLocalePath(locale: Locale, pathWithinApp: string): string {
  const clean = pathWithinApp.startsWith("/") ? pathWithinApp : `/${pathWithinApp}`;
  return locale === "he" ? clean : `${LOCALE_PREFIX}${clean}`;
}

export interface LocaleValue {
  locale: Locale;
  dir: "ltr" | "rtl";
  /** Translate. Returns the key itself when untranslated, so nothing ever renders empty. */
  t: (text: string) => string;
}

export const LocaleContext = createContext<LocaleValue>({
  locale: "en",
  dir: "ltr",
  t: (text) => text,
});

export function useLocale(): LocaleValue {
  return useContext(LocaleContext);
}

/** Shorthand for the common case of only needing the translate function. */
export function useT(): (text: string) => string {
  return useContext(LocaleContext).t;
}
