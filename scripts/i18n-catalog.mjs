#!/usr/bin/env node
/**
 * Builds the translation catalog: every piece of interface text, where it is used, and
 * which languages have it.
 *
 * The point is that nobody should have to read TypeScript to translate this site, and
 * nobody should have to hunt through forty components to find out what still needs
 * translating. This script reads the code once and writes both answers down:
 *
 *   docs/i18n/catalog.json   every string, with file:line pointers and per-language status
 *   docs/i18n/TRANSLATION.md the same thing for a person, grouped by the screen it's on
 *
 * The dictionaries themselves live in app/src/i18n/locales/*.json. Adding a language is
 * a new file there plus two lines in LocaleProvider — never a change to a component.
 *
 * Usage:
 *   node scripts/i18n-catalog.mjs            # write the catalog and the report
 *   node scripts/i18n-catalog.mjs --check    # exit 1 if any language has gaps
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "app/src");
const LOCALES_DIR = path.join(SRC, "i18n/locales");
const OUT_DIR = path.join(ROOT, "docs/i18n");

/** The source language. Its keys are the English text itself, so it needs no dictionary. */
const SOURCE_LOCALE = "en";

const CHECK = process.argv.includes("--check");

/**
 * Data files whose contents are rendered through t(). These hold the interview questions
 * and the discussion prompts — text that belongs to the organisation rather than to a
 * component, which is exactly why it lives in JSON in the first place.
 */
const DATA_SOURCES = [
  {
    file: "features/collection/storySections.json",
    label: "The guided interview",
    extract: (data) =>
      data.flatMap((section) => [
        { text: section.title, note: "section tab and heading" },
        { text: section.intro, note: "section introduction" },
        ...section.fields.flatMap((field) =>
          [
            { text: field.label, note: `question (${section.key}.${field.key})` },
            field.placeholder ? { text: field.placeholder, note: `example answer (${field.key})` } : null,
          ].filter(Boolean)
        ),
      ]),
  },
  {
    file: "features/presentation/discussionPrompts.json",
    label: "Discussion prompts",
    extract: (data) =>
      (Array.isArray(data) ? data : data.groups ?? []).flatMap((group) =>
        Array.isArray(group) ? group : [group.title, ...(group.prompts ?? [])].filter((v) => typeof v === "string").map((text) => ({ text }))
      ),
  },
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Reads from the "(" of a call to its matching ")", ignoring parens inside strings. */
function readCall(source, openParen) {
  let depth = 0;
  let quote = null;
  for (let i = openParen; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return source.slice(openParen + 1, i);
    }
  }
  return null;
}

function unescape(text) {
  return text.replace(/\\(["'\\nt])/g, (_, c) => ({ n: "\n", t: "\t" })[c] ?? c);
}

/**
 * Every string literal in a file, with the offset it starts at.
 *
 * Written as a scanner rather than a regex because this codebase comments in prose, and
 * a regex looking for '…' treats the apostrophe in "doesn't" as an opening quote and
 * swallows everything up to the next one — silently losing whatever literals lie between.
 */
function collectLiterals(source) {
  const found = [];
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];

    if (ch === "/" && source[i + 1] === "/") {
      i = source.indexOf("\n", i);
      if (i === -1) break;
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      if (end === -1) break;
      i = end + 1;
      continue;
    }
    if (ch !== '"' && ch !== "'") continue;

    const start = i;
    let text = "";
    for (i++; i < source.length; i++) {
      if (source[i] === "\\") {
        text += source[i] + source[i + 1];
        i++;
      } else if (source[i] === ch) break;
      else if (source[i] === "\n") break; // unterminated: not a literal
      else text += source[i];
    }
    if (source[i] === ch) found.push({ text: unescape(text), index: start });
  }
  return found;
}

/**
 * Every t("…") in the code, the ones whose key is computed at runtime, and an index of
 * every other string literal.
 *
 * The literal index matters because plenty of text reaches t() indirectly: through a
 * local helper that fills in a name ("about(...)", "count(...)"), or out of a table of
 * labels that a component maps over. Looking only for t("…") would call all of those
 * dead and invite someone to delete translations that are very much in use.
 */
function scanSource() {
  const uses = new Map(); // text -> [{ file, line }]
  const literals = new Map(); // every string literal -> [{ file, line }]
  const sources = new Map(); // file -> its text, for the unwired check below
  const dynamic = [];

  for (const file of walk(SRC)) {
    const rel = path.relative(ROOT, file);
    const source = fs.readFileSync(file, "utf8");
    const lineAt = (index) => source.slice(0, index).split("\n").length;
    sources.set(rel, source);

    for (const { text, index } of collectLiterals(source)) {
      if (!literals.has(text)) literals.set(text, []);
      literals.get(text).push({ file: rel, line: lineAt(index) });
    }

    for (const match of source.matchAll(/(^|[^A-Za-z0-9_$.])t\(/g)) {
      const openParen = match.index + match[0].length - 1;
      const args = readCall(source, openParen);
      if (args === null) continue;

      const args_literals = collectLiterals(args).map((l) => l.text);
      if (args_literals.length === 0) {
        // t(config.title), t(option.label) — the key comes from a data file or an array.
        dynamic.push({ file: rel, line: lineAt(openParen), expression: args.trim().split("\n")[0] });
        continue;
      }
      for (const text of args_literals) {
        // Skip the ".replace("{n}", …)" argument that follows many of these calls.
        if (/^\{[a-z]+\}$/.test(text)) continue;
        if (!uses.has(text)) uses.set(text, []);
        uses.get(text).push({ file: rel, line: lineAt(openParen) });
      }
    }
  }
  return { uses, literals, sources, dynamic };
}

/**
 * English still printed straight into the markup.
 *
 * This is the check that matters day to day. The dictionary can be complete and the
 * screen still be in English, because a component renders a bare JSX text node or a
 * label off an object without passing it through t(). Nothing else finds those: they
 * are not string literals, so no amount of looking for t("…") will turn them up.
 */
function findUntranslatedMarkup() {
  const findings = [];

  for (const file of walk(SRC)) {
    if (!file.endsWith(".tsx")) continue;
    const rel = path.relative(ROOT, file);
    const source = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const lineAt = (index) => source.slice(0, index).split("\n").length;

    // A JSX text node: between a closing ">" and the next "<", with real words in it.
    for (const m of source.matchAll(/>([^<>]*)</g)) {
      const text = m[1]
        .replace(/\{[^{}]*\}/g, "")   // drop embedded expressions
        .replace(/&[a-z]+;/g, " ")
        .trim();
      if (!/[A-Za-z]{2}/.test(text)) continue;
      if (/^[A-Z_]+$/.test(text)) continue; // a constant, not prose
      // ">" also closes arrow functions and generics, so most matches are code rather
      // than text. Prose on a page carries none of this punctuation; code always does.
      if (/[;{}()=`"'|&\[\]]|=>|\breturn\b|\bconst\b/.test(text)) continue;
      if (text.length > 200) continue;
      findings.push({ file: rel, line: lineAt(m.index), text, kind: "markup" });
    }

    // {thing.title} rendered without t(): the label comes from a table or a data file,
    // and is just as untranslated as a bare word would be.
    for (const m of source.matchAll(/\{\s*([A-Za-z_$][\w$]*(?:\.[\w$]+)*\.(title|label|hint|intro|subtitle|displayName|name))\s*\}/g)) {
      findings.push({ file: rel, line: lineAt(m.index), text: m[1], kind: "label" });
    }
  }
  return findings;
}

/** Text held in JSON data files and rendered through t(). */
function scanData() {
  const entries = [];
  for (const source of DATA_SOURCES) {
    const full = path.join(SRC, source.file);
    if (!fs.existsSync(full)) continue;
    const data = JSON.parse(fs.readFileSync(full, "utf8"));
    for (const item of source.extract(data)) {
      if (!item?.text) continue;
      entries.push({ ...item, file: path.relative(ROOT, full), group: source.label });
    }
  }
  return entries;
}

function loadLocales() {
  const locales = {};
  for (const name of fs.readdirSync(LOCALES_DIR)) {
    const match = /^([a-z]{2})\.json$/.exec(name);
    if (match) locales[match[1]] = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, name), "utf8"));
  }
  return locales;
}

function loadNotes() {
  const file = path.join(LOCALES_DIR, "notes.json");
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
}

/** The screen a string belongs to, for grouping the report the way a person reads the site. */
function screenOf(file) {
  const named = {
    "app/src/app": "Navigation and chrome",
    "app/src/features/auth": "Signing in",
    "app/src/features/profile": "Registration",
    "app/src/features/collection": "The Collection Wizard",
    "app/src/features/familytree": "Family tree",
    "app/src/features/presentation": "The Presentation Wizard",
    "app/src/features/testimony": "Testimony navigator",
    "app/src/features/products": "Things you can make",
  };
  for (const [prefix, label] of Object.entries(named)) {
    if (file.startsWith(prefix)) return label;
  }
  return "Elsewhere";
}

function build() {
  const { uses, literals, sources, dynamic } = scanSource();
  const untranslated = findUntranslatedMarkup();
  const data = scanData();
  const locales = loadLocales();
  const notes = loadNotes();
  const targets = Object.keys(locales).filter((l) => l !== SOURCE_LOCALE).sort();

  const entries = [];
  for (const [text, where] of uses) {
    entries.push({
      text,
      usedIn: where,
      screen: screenOf(where[0].file),
      note: notes[text],
      translations: Object.fromEntries(targets.map((l) => [l, locales[l][text] ?? null])),
    });
  }
  // Dictionary entries that never appear in a t("…") call but do appear as a literal:
  // a label in a table, or an argument to a helper that translates it. They are live.
  for (const locale of targets) {
    for (const key of Object.keys(locales[locale])) {
      if (uses.has(key) || !literals.has(key)) continue;
      uses.set(key, literals.get(key));
    }
  }

  for (const [text, where] of uses) {
    if (entries.some((e) => e.text === text)) continue;
    entries.push({
      text,
      usedIn: where,
      screen: screenOf(where[0].file),
      note: notes[text],
      translations: Object.fromEntries(targets.map((l) => [l, locales[l][text] ?? null])),
    });
  }

  for (const item of data) {
    if (uses.has(item.text)) continue; // already counted through its t() call site
    entries.push({
      text: item.text,
      usedIn: [{ file: item.file, line: null }],
      screen: item.group,
      note: item.note ?? notes[item.text],
      translations: Object.fromEntries(targets.map((l) => [l, locales[l][item.text] ?? null])),
    });
  }
  entries.sort((a, b) => a.screen.localeCompare(b.screen) || a.text.localeCompare(b.text));

  const live = new Set(entries.map((e) => e.text));

  /**
   * A dictionary entry with no t() behind it is one of two very different things, and
   * conflating them is how a translation gets deleted by mistake:
   *
   *  unwired — the English is still on screen, printed straight into the markup. The
   *            translation is finished and waiting; the component needs wrapping.
   *  orphan  — the English appears nowhere at all. A renamed button left it behind.
   */
  const unwired = {};
  const orphans = {};
  for (const locale of targets) {
    unwired[locale] = [];
    orphans[locale] = [];
    for (const key of Object.keys(locales[locale])) {
      if (live.has(key)) continue;
      // A plain substring test would report "and" against every English sentence in the
      // codebase, so short keys must look like a JSX text node to count; a long phrase
      // appearing at all is evidence enough, and those are the ones worth chasing.
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const matches =
        key.length >= 12
          ? new RegExp(escaped)
          : new RegExp(`>[^<>]*${escaped}[^<>]*<`);
      const where = [...sources].filter(([, text]) => matches.test(text)).map(([file]) => file);
      if (where.length) unwired[locale].push({ text: key, files: where.slice(0, 4) });
      else orphans[locale].push(key);
    }
    unwired[locale].sort((a, b) => a.text.localeCompare(b.text));
    orphans[locale].sort();
  }

  const missing = Object.fromEntries(
    targets.map((l) => [l, entries.filter((e) => e.translations[l] === null).map((e) => e.text)])
  );

  return { entries, dynamic, targets, missing, orphans, unwired, untranslated };
}

function writeCatalog({ entries, dynamic, targets, missing, orphans, unwired, untranslated }) {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const catalog = {
    generated: new Date().toISOString(),
    sourceLocale: SOURCE_LOCALE,
    locales: targets,
    counts: {
      strings: entries.length,
      ...Object.fromEntries(targets.map((l) => [l, entries.length - missing[l].length])),
    },
    entries,
    computedKeys: dynamic,
    unwired,
    orphans,
    untranslated,
  };
  fs.writeFileSync(path.join(OUT_DIR, "catalog.json"), JSON.stringify(catalog, null, 2) + "\n");

  const lines = [];
  lines.push("# Translation catalog");
  lines.push("");
  lines.push("Generated by `node scripts/i18n-catalog.mjs` — do not edit by hand.");
  lines.push("");
  lines.push(
    "Every piece of interface text in the Story Studio, grouped by the screen it appears on. " +
      "To translate, edit the matching file in `app/src/i18n/locales/` — the key is the English " +
      "text exactly as it appears below."
  );
  lines.push("");
  for (const locale of targets) {
    const done = entries.length - missing[locale].length;
    const pct = Math.round((done / entries.length) * 100);
    lines.push(`- **${locale}** — ${done} of ${entries.length} (${pct}%)`);
  }
  lines.push("");

  let screen = null;
  for (const entry of entries) {
    if (entry.screen !== screen) {
      screen = entry.screen;
      lines.push("");
      lines.push(`## ${screen}`);
      lines.push("");
      lines.push(`| English | ${targets.join(" | ")} | Used in |`);
      lines.push(`| --- | ${targets.map(() => "---").join(" | ")} | --- |`);
    }
    const cell = (value) => (value === null ? "— _missing_" : value).replace(/\|/g, "\\|").replace(/\n/g, " ");
    const where = entry.usedIn
      .slice(0, 3)
      .map((u) => `${path.basename(u.file)}${u.line ? `:${u.line}` : ""}`)
      .join(", ");
    const english = entry.note ? `${entry.text}<br>_${entry.note}_` : entry.text;
    lines.push(
      `| ${english.replace(/\|/g, "\\|")} | ${targets.map((l) => cell(entry.translations[l])).join(" | ")} | ${where} |`
    );
  }

  if (untranslated.length) {
    lines.push("");
    lines.push("## Still English in the markup");
    lines.push("");
    lines.push(
      "Text printed straight into a component, never passed through `t(\u2026)`. These will " +
        "read as English whatever the dictionaries say."
    );
    lines.push("");
    lines.push(
      "Entries shown as `{thing.label}` need judgement rather than translation: a person's " +
        "name, a filename or a place found on the map is content, and must stay as it is. " +
        "Only the ones naming a fixed set of options belong in a dictionary."
    );
    lines.push("");
    let currentFile = null;
    for (const item of untranslated) {
      if (item.file !== currentFile) {
        currentFile = item.file;
        lines.push("");
        lines.push(`**${item.file}**`);
        lines.push("");
      }
      const shown = item.text.length > 90 ? `${item.text.slice(0, 90)}…` : item.text;
      lines.push(`- \`:${item.line}\` ${item.kind === "label" ? `\`{${shown}}\`` : shown.replace(/\|/g, "\\|")}`);
    }
  }

  if (dynamic.length) {
    lines.push("");
    lines.push("## Keys built at runtime");
    lines.push("");
    lines.push(
      "These call sites translate a value rather than a literal — the text itself comes from " +
        "a data file or a list above, so it is already in the table."
    );
    lines.push("");
    for (const d of dynamic) lines.push(`- \`${d.expression}\` — ${d.file}:${d.line}`);
  }

  for (const locale of targets) {
    if (!unwired[locale].length) continue;
    lines.push("");
    lines.push(`## Translated but not wired up (${locale})`);
    lines.push("");
    lines.push(
      "These already have a translation, but the component still prints the English " +
        "straight into the page. Wrapping the string in `t(\u2026)` is all that is left."
    );
    lines.push("");
    for (const item of unwired[locale]) {
      lines.push(`- ${item.text.replace(/\|/g, "\\|")} — ${item.files.map((f) => path.basename(f)).join(", ")}`);
    }
  }

  for (const locale of targets) {
    if (!orphans[locale].length) continue;
    lines.push("");
    lines.push(`## Unused entries in ${locale}.json`);
    lines.push("");
    lines.push("Nothing in the code asks for these any more. Safe to delete.");
    lines.push("");
    for (const key of orphans[locale]) lines.push(`- ${key}`);
  }

  lines.push("");
  fs.writeFileSync(path.join(OUT_DIR, "TRANSLATION.md"), lines.join("\n"));
}

const result = build();
writeCatalog(result);

console.log(`${result.entries.length} strings catalogued.`);
for (const locale of result.targets) {
  const done = result.entries.length - result.missing[locale].length;
  console.log(`  ${locale}: ${done} translated, ${result.missing[locale].length} missing`);
  if (result.unwired[locale].length)
    console.log(`      ${result.unwired[locale].length} translated but not wired up`);
  if (result.orphans[locale].length) console.log(`      ${result.orphans[locale].length} unused entries`);
}
console.log(`  ${result.dynamic.length} call sites translate a computed value.`);
console.log(`  ${result.untranslated.length} places still print English into the markup.`);
console.log("Wrote docs/i18n/catalog.json and docs/i18n/TRANSLATION.md");

if (CHECK) {
  const gaps = result.targets.filter((l) => result.missing[l].length > 0);
  if (gaps.length) {
    console.error("");
    for (const locale of gaps) {
      console.error(`${locale} is missing ${result.missing[locale].length} strings:`);
      for (const text of result.missing[locale].slice(0, 20)) console.error(`  ${text}`);
      if (result.missing[locale].length > 20) console.error(`  … and ${result.missing[locale].length - 20} more`);
    }
    process.exit(1);
  }
}
