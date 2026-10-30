import { useMemo, type ReactNode } from "react";
import { isRtl, LocaleContext, type Locale } from "./index";
import en from "./locales/en.json";
import he from "./locales/he.json";

/**
 * Supplies the language for everything below it.
 *
 * The dictionaries are plain JSON in ./locales, one file per language, so translating the
 * site means editing data rather than code — see docs/i18n/TRANSLATION.md, which lists
 * every string with the screen it appears on. Adding a language is a file there plus a
 * line here and in Locale; no component changes.
 *
 * English is the source language and its file is empty by design: the keys in the code
 * are already English, so an untranslated string renders readably instead of blank.
 *
 * Its own file so i18n/index.ts exports no components — a module mixing components with
 * plain functions breaks fast refresh for its importers.
 */

const dictionaries: Record<Locale, Record<string, string>> = { en, he };

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  // Memoised so `t` keeps one identity for as long as the language does. Consumers list
  // it in hook dependencies, and a new function each render would re-run all of them.
  const value = useMemo(() => {
    const dictionary = dictionaries[locale];
    return {
      locale,
      dir: isRtl(locale) ? ("rtl" as const) : ("ltr" as const),
      // Untranslated keys fall through as English rather than rendering empty.
      t: (text: string) => dictionary[text] ?? text,
    };
  }, [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
