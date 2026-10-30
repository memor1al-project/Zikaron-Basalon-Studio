import type { NamedFace } from "../familytree/facePeople";

/**
 * "Who was there" for one story event.
 *
 * The people on offer are the faces already named while tagging photographs in the
 * Collection step — the same source the family tree draws on. Naming a face once should
 * be enough to use that person everywhere, rather than retyping them per event.
 *
 * Inline toggles rather than a dialog: attaching people is something you do while writing
 * the event down, and a modal in the middle of that would break the sentence you're in.
 */
export function EventPeoplePicker({
  faces,
  selected,
  onChange,
}: {
  faces: NamedFace[];
  /** Names, matching NamedFace.label. */
  selected: string[];
  onChange: (people: string[]) => void;
}) {
  // A name attached before its photograph was deleted still belongs to the event, so it's
  // shown alongside the live faces rather than silently dropped.
  const orphans = selected.filter(
    (name) => !faces.some((f) => f.label.toLowerCase() === name.toLowerCase())
  );

  if (faces.length === 0 && orphans.length === 0) {
    return (
      <p style={{ fontSize: 11.5, color: "var(--ink-soft)", margin: 0 }}>
        Name a face on a photograph in Collection to be able to say who was here.
      </p>
    );
  }

  function toggle(name: string) {
    const isOn = selected.some((s) => s.toLowerCase() === name.toLowerCase());
    onChange(isOn ? selected.filter((s) => s.toLowerCase() !== name.toLowerCase()) : [...selected, name]);
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {faces.map((face) => {
        const on = selected.some((s) => s.toLowerCase() === face.label.toLowerCase());
        return (
          <button
            key={face.label}
            type="button"
            onClick={() => toggle(face.label)}
            aria-pressed={on}
            title={on ? `Remove ${face.label}` : `Add ${face.label}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 10px 3px 3px",
              borderRadius: 16,
              border: `1px solid ${on ? "var(--accent)" : "var(--line)"}`,
              background: on ? "var(--accent-soft)" : "var(--card)",
              fontSize: 12,
              fontWeight: on ? 600 : 400,
              color: "var(--ink)",
            }}
          >
            <img
              src={face.dataUrl}
              alt=""
              style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover" }}
            />
            {face.label}
          </button>
        );
      })}

      {orphans.map((name) => (
        <button
          key={name}
          type="button"
          onClick={() => toggle(name)}
          aria-pressed
          title={`Remove ${name}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "3px 10px",
            borderRadius: 16,
            border: "1px solid var(--accent)",
            background: "var(--accent-soft)",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--ink)",
          }}
        >
          {name}
        </button>
      ))}
    </div>
  );
}
