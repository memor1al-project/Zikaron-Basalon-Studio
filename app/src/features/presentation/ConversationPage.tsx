import { useEffect, useState } from "react";
import { PresentationPageShell } from "./PresentationPageShell";
import { useLocale, useT } from "../../i18n";
import prompts from "./discussionPrompts.json";
import { readChosenPrompts, writeChosenPrompts } from "./conversationSelection";

/**
 * The part of the evening that happens after the story.
 *
 * Every hosting document the organisation publishes describes the same three movements —
 * עבר (testimony), הווה (sharing), עתיד (conversation) — and the Studio only ever helped
 * with the first. A host was left to run the conversation unaided, which is the part most
 * people find hardest.
 *
 * The questions are the organisation's own, from the digital hosting kit, quoted as
 * written. Choosing some marks them for the printed booklet; nothing is required.
 */

interface Prompt {
  he: string;
  en: string;
}
interface Group {
  id: string;
  title: string;
  titleHe: string;
  note: string;
  noteHe: string;
  prompts: Prompt[];
}

export function ConversationPage() {
  const { locale } = useLocale();
  const t = useT();
  const groups = (prompts as { groups: Group[] }).groups;

  const [selected, setSelected] = useState<string[]>(readChosenPrompts);

  useEffect(() => {
    writeChosenPrompts(selected);
  }, [selected]);

  function toggle(text: string) {
    setSelected((prev) => (prev.includes(text) ? prev.filter((p) => p !== text) : [...prev, text]));
  }

  /** The Hebrew is the original; the English is a translation of it. */
  const textOf = (prompt: Prompt) => (locale === "he" ? prompt.he : prompt.en);

  return (
    <PresentationPageShell>
      <div className="no-print" style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 26, lineHeight: 1.25, marginBottom: 6 }}>{t("The conversation")}</h1>
        <p style={{ fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.6, maxWidth: 680 }}>
          {t(
            "An evening has three parts: the testimony, the time together, and the conversation about what the memory asks of us. These are the questions Zikaron BaSalon suggests for the third. Choose any that fit your evening — they'll be included when you print the booklet."
          )}
        </p>
      </div>

      {groups.map((group) => (
        <div
          key={group.id}
          className="print-card"
          style={{
            border: "1px solid var(--line)",
            borderRadius: 14,
            padding: 22,
            background: "var(--card)",
            marginBottom: 20,
          }}
        >
          <h2 style={{ fontSize: 16, marginBottom: 4 }}>{locale === "he" ? group.titleHe : group.title}</h2>
          <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 14, lineHeight: 1.55 }}>
            {locale === "he" ? group.noteHe : group.note}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {group.prompts.map((prompt) => {
              const text = textOf(prompt);
              const isChosen = selected.includes(text);
              return (
                <label
                  key={prompt.he}
                  className="option-card"
                  style={{
                    gap: 12,
                    cursor: "pointer",
                    alignItems: "flex-start",
                    background: isChosen ? "var(--accent-soft)" : "var(--bg-cream)",
                    borderColor: isChosen ? "var(--accent)" : "var(--line)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChosen}
                    onChange={() => toggle(text)}
                    className="no-print"
                    style={{ width: 18, height: 18, marginTop: 2, accentColor: "var(--accent-deep)", padding: 0 }}
                  />
                  <span style={{ fontSize: 14, lineHeight: 1.55 }}>{text}</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}

      {selected.length > 0 && (
        <p className="no-print" style={{ fontSize: 12.5, color: "var(--sage)" }}>
          {selected.length} {selected.length === 1 ? t("question chosen") : t("questions chosen")}
        </p>
      )}
    </PresentationPageShell>
  );
}

