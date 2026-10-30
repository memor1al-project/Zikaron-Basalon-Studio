# Translating the Story Studio

Everything a visitor reads lives in one file per language:

    app/src/i18n/locales/he.json      Hebrew
    app/src/i18n/locales/en.json      English (empty — see below)
    app/src/i18n/locales/notes.json   questions for the organisation, by key

The key is the English text itself. `"Save all to disk": "שמירת הכול לדיסק"` means that
wherever the interface says *Save all to disk*, Hebrew readers see שמירת הכול לדיסק.

English needs no dictionary because the keys are already English. That is also why a
string nobody has translated yet shows up in English rather than blank — a gap looks
unfinished, never broken.

## To translate something

1. Open `docs/i18n/TRANSLATION.md`. It lists every string, grouped by the screen it
   appears on, with what each language currently says and which file it comes from.
2. Edit `app/src/i18n/locales/<language>.json`. Copy the English key exactly, including
   punctuation and any `{n}` or `{name}` placeholder — those are filled in at runtime and
   must survive translation, though they may move within the sentence.
3. Run `node scripts/i18n-catalog.mjs` to refresh the report.

No TypeScript, no components, no build step.

## To add a language

1. Copy `en.json` to the new code, e.g. `fr.json`, and translate it.
2. In `app/src/i18n/index.ts`, add the code to `Locale` and give it a URL prefix.
3. In `app/src/i18n/LocaleProvider.tsx`, import the file and add it to `dictionaries`.

Three lines of code, once. Nothing else in the app changes.

## Keeping it honest

`node scripts/i18n-catalog.mjs` reads the source and writes two files:

- `catalog.json` — every string, where it is used, and its status in each language
- `TRANSLATION.md` — the same thing for a person to read

It reports three things worth acting on:

- **missing** — the string has no translation yet
- **translated but not wired up** — the translation exists, but the component still
  prints the English straight into the page. The string needs wrapping in `t(…)`
- **unused** — the English appears nowhere in the code any more; safe to delete

`--check` exits non-zero if any language has gaps, for use in a pre-release check.
`scripts/release.mjs` refreshes the catalog before every build, so the report always
describes what actually shipped.

## A note on placeholders

Some sentences are translated whole with a slot in them, rather than assembled from
words:

    "Restored {n} materials into this folder"
    "{a} and {b} are recorded in different families. Remove one of those links first."

This is deliberate. Languages order the number, the noun and the verb differently, and
gluing fragments together in English order produces Hebrew that reads like a machine
wrote it. Where a joining word has to attach to the next word — Hebrew's ו — the spacing
is part of the key, which is why one entry is `" and "` with its spaces.
