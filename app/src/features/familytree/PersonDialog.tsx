import { useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { ConnectDialog } from "./ConnectDialog";
import { FacePicker } from "./FacePicker";
import { splitName, toPortrait, type NamedFace } from "./facePeople";
import {
  displayName,
  initialsOf,
  personMemberships,
  relationshipOptions,
  type FamilyTree,
  type RelationshipType,
  type Sex,
  type TreePerson,
} from "./familyTree";
import { useT } from "../../i18n";

/**
 * Add or edit one person.
 *
 * The field set and the relationship picker are taken from the sibling `website` project's
 * AddPersonDialog: nobody builds GEDCOM FAM records by hand, so a new person is placed by
 * saying how they relate to someone already in the tree ("child of Miriam") and the union
 * bookkeeping happens in familyTree.ts. Restyled from that dialog's dark glass panel to
 * this app's cream card.
 */

export interface PersonDraft {
  person: TreePerson;
  relation: RelationshipType;
  relatedId: string;
}

export function PersonDialog({
  initial,
  people,
  faces,
  mode,
  tree,
  onLink,
  onUnlink,
  initialRelation,
  initialRelatedId,
  onCancel,
  onSave,
  onRemove,
}: {
  initial: TreePerson;
  /** Everyone already in the tree, for the "relates to" picker. Excludes the person being edited. */
  people: TreePerson[];
  /** Named faces from the Collection step, offered as portraits for this person. */
  faces: NamedFace[];
  mode: "add" | "edit";
  /** The whole tree, so an existing person's links can be listed and changed here. */
  tree?: FamilyTree;
  /** Applies a new link immediately — structural edits don't wait for "Save changes". */
  onLink?: (relation: RelationshipType, relatedId: string) => void;
  onUnlink?: (unionId: string, role: "partner" | "child") => void;
  /** Pre-set when the dialog was opened from a person's right-click menu. */
  initialRelation?: RelationshipType;
  initialRelatedId?: string;
  onCancel: () => void;
  onSave: (draft: PersonDraft) => void;
  onRemove?: () => void;
}) {
  const [person, setPerson] = useState<TreePerson>(initial);
  const [connecting, setConnecting] = useState(false);
  const [relation, setRelation] = useState<RelationshipType>(
    initialRelation ?? (people.length ? "child" : "none")
  );
  const [relatedId, setRelatedId] = useState<string>(initialRelatedId ?? people[0]?.id ?? "");
  const [error, setError] = useState("");
  const t = useT();
  const [pickingFace, setPickingFace] = useState(false);

  async function handleFaceChosen(chosen: NamedFace[]) {
    setPickingFace(false);
    const face = chosen[0];
    if (!face) return;
    const photo = await toPortrait(face.dataUrl);
    setPerson((p) => {
      // Picking a face for someone still unnamed fills the name in from the tag — that's
      // the name someone already typed against this face, so retyping it is busywork.
      const named = p.firstName.trim() || p.lastName.trim();
      return { ...p, photo: photo || undefined, ...(named ? {} : splitName(face.label)) };
    });
  }

  const needsRelative = mode === "add" && relation !== "none";

  function set<K extends keyof TreePerson>(key: K, value: TreePerson[K]) {
    setPerson((p) => ({ ...p, [key]: value }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!person.firstName.trim() && !person.lastName.trim()) {
      setError(t("Give at least a first or last name."));
      return;
    }
    if (needsRelative && !relatedId) {
      setError(t("Choose who this person is related to, or pick “Not linked yet”."));
      return;
    }
    onSave({
      person: { ...person, firstName: person.firstName.trim(), lastName: person.lastName.trim() },
      relation: mode === "add" ? relation : "none",
      relatedId,
    });
  }

  // Portalled to <body>: CollectionPageShell wraps every page in .card-enter, whose
  // animation keeps a transform applied (fill-mode "both"), and a transformed ancestor
  // becomes the containing block for position:fixed. Left in place the overlay sizes
  // itself to the page content instead of the viewport, which pushes the dialog's top
  // out of view on a long page.
  return createPortal(
    <>
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "oklch(24% 0.025 50 / 0.42)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card-enter"
        role="dialog"
        aria-modal="true"
        aria-label={mode === "add" ? t("Add a person") : `${t("Edit")} ${displayName(person)}`}
        style={{
          width: "100%",
          maxWidth: 560,
          maxHeight: "calc(100svh - 48px)",
          overflowY: "auto",
          background: "var(--card)",
          border: "1px solid var(--line)",
          borderRadius: 16,
          boxShadow: "0 24px 60px -30px oklch(30% 0.03 50 / 0.45)",
        }}
      >
        <form onSubmit={handleSubmit}>
          <div style={{ padding: "22px 24px 0" }}>
            <h2 style={{ fontSize: 18, marginBottom: 4 }}>
              {mode === "add" ? t("Add a person") : displayName(person)}
            </h2>
            <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 18 }}>
              Only a name is required. Everything else can stay blank until it's known.
            </p>
          </div>

          <div style={{ padding: "0 24px", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {person.photo ? (
                <img
                  src={person.photo}
                  alt=""
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    objectFit: "cover",
                    border: "1px solid var(--line)",
                    flexShrink: 0,
                  }}
                />
              ) : (
                <span
                  aria-hidden
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1px dashed var(--line)",
                    background: "var(--bg-cream)",
                    fontFamily: "Domine, serif",
                    fontSize: 17,
                    fontWeight: 600,
                    color: "var(--accent-deep)",
                  }}
                >
                  {initialsOf(person)}
                </span>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: "7px 14px", fontSize: 12.5 }}
                    onClick={() => setPickingFace(true)}
                    disabled={faces.length === 0}
                  >
                    {person.photo ? t("Change portrait") : t("Choose from tagged faces")}
                  </button>
                  {person.photo && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: "7px 14px", fontSize: 12.5 }}
                      onClick={() => setPerson((p) => ({ ...p, photo: undefined }))}
                    >
                      {/* Not just "Remove" — the footer already has one for the person. */}
                      {t("Remove portrait")}
                    </button>
                  )}
                </div>
                <span style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
                  {faces.length > 0
                    ? t(
                        faces.length === 1
                          ? "{n} named face from your photographs"
                          : "{n} named faces from your photographs"
                      ).replace("{n}", String(faces.length))
                    : t("Name a face in Collection to use it here")}
                </span>
              </div>
            </div>

            <Row>
              <Field label={t("First name")}>
                <input value={person.firstName} onChange={(e) => set("firstName", e.target.value)} autoFocus />
              </Field>
              <Field label={t("Last name")}>
                <input value={person.lastName} onChange={(e) => set("lastName", e.target.value)} />
              </Field>
            </Row>

            <Row>
              <Field label={t("Maiden name")} hint={t("If the last name changed on marriage")}>
                <input value={person.maidenName ?? ""} onChange={(e) => set("maidenName", e.target.value)} />
              </Field>
              <Field label={t("Sex")} hint={t("Recorded for the genealogy file")}>
                <select value={person.sex} onChange={(e) => set("sex", e.target.value as Sex)}>
                  <option value="">{t("Not recorded")}</option>
                  <option value="F">{t("Female")}</option>
                  <option value="M">{t("Male")}</option>
                </select>
              </Field>
            </Row>

            <Row>
              <Field label={t("Born")} hint={t("Any form — “1902”, “about 1902”")}>
                <input value={person.birthDate ?? ""} onChange={(e) => set("birthDate", e.target.value)} />
              </Field>
              <Field label={t("Birthplace")}>
                <input value={person.birthPlace ?? ""} onChange={(e) => set("birthPlace", e.target.value)} />
              </Field>
            </Row>

            <Row>
              <Field label={t("Died")} hint={t("Leave blank if living or unknown")}>
                <input value={person.deathDate ?? ""} onChange={(e) => set("deathDate", e.target.value)} />
              </Field>
              <Field label={t("Place of death")}>
                <input value={person.deathPlace ?? ""} onChange={(e) => set("deathPlace", e.target.value)} />
              </Field>
            </Row>

            <Field label={t("Occupation")}>
              <input value={person.occupation ?? ""} onChange={(e) => set("occupation", e.target.value)} />
            </Field>

            <Field label={t("Notes")}>
              <textarea
                rows={2}
                value={person.note ?? ""}
                onChange={(e) => set("note", e.target.value)}
                placeholder={t("Anything worth remembering about them")}
                style={TextAreaStyle}
              />
            </Field>

            {mode === "edit" && tree && onUnlink && (
              <div
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: 12,
                  padding: 16,
                  background: "var(--bg-cream)",
                }}
              >
                <h3 style={{ fontSize: 13.5, marginBottom: 4 }}>{t("Relationships")}</h3>
                <p style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 12 }}>
                  {t("Changes here take effect straight away, and apply to the chart rather than to this person's details. Removing a link never deletes anyone.")}
                </p>

                {(() => {
                  const memberships = personMemberships(tree, person.id, t);
                  if (memberships.length === 0) {
                    return (
                      <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 12 }}>
                        {t("Not connected to anyone yet.")}
                      </p>
                    );
                  }
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                      {memberships.map((membership) => (
                        <div
                          key={`${membership.unionId}-${membership.role}`}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "8px 12px",
                            borderRadius: 8,
                            background: "var(--bg-cream-2)",
                          }}
                        >
                          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5 }}>{membership.description}</span>
                          <button
                            type="button"
                            onClick={() => onUnlink(membership.unionId, membership.role)}
                            style={{
                              background: "none",
                              border: "none",
                              padding: 0,
                              fontSize: 12,
                              fontWeight: 600,
                              color: "var(--accent-deep)",
                              flexShrink: 0,
                            }}
                          >
                            {t("Remove")}
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {onLink && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setConnecting(true)}
                    style={{ fontSize: 12.5, padding: "8px 14px" }}
                  >
                    {t("Add a connection")}
                  </button>
                )}
              </div>
            )}

            {mode === "add" && people.length > 0 && (
              <div
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: 12,
                  padding: 16,
                  background: "var(--bg-cream)",
                }}
              >
                <h3 style={{ fontSize: 13.5, marginBottom: 4 }}>{t("How do they connect?")}</h3>
                <p style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 12 }}>
                  {t("Linking now keeps the chart together. It can also be left for later.")}
                </p>
                <Row>
                  <Field label={t("Relationship")}>
                    <select
                      value={relation}
                      onChange={(e) => setRelation(e.target.value as RelationshipType)}
                    >
                      {relationshipOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {t(option.label)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t("Person")}>
                    <select
                      value={relatedId}
                      onChange={(e) => setRelatedId(e.target.value)}
                      disabled={relation === "none"}
                    >
                      {people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {displayName(p)}
                        </option>
                      ))}
                    </select>
                  </Field>
                </Row>
              </div>
            )}

            {error && (
              <div
                style={{
                  fontSize: 12.5,
                  color: "var(--accent-deep)",
                  background: "var(--accent-soft)",
                  borderRadius: 8,
                  padding: "10px 12px",
                }}
              >
                {error}
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              padding: "20px 24px 22px",
              marginTop: 18,
              borderTop: "1px solid var(--line)",
            }}
          >
            {mode === "edit" && onRemove ? (
              <button
                type="button"
                onClick={onRemove}
                className="btn-secondary"
                style={{ color: "var(--accent-deep)" }}
              >
                {t("Remove")}
              </button>
            ) : (
              <span />
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" className="btn-secondary" onClick={onCancel}>
                {t("Cancel")}
              </button>
              <button type="submit" className="btn-primary">
                {mode === "add" ? t("Add to tree") : t("Save changes")}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>

    {/* A sibling of the overlay, not a child: a React portal still bubbles events through
        the component tree, so nested inside it every click in the picker would also hit
        the overlay's dismiss handler and close this dialog underneath. */}
    {pickingFace && (
      <FacePicker
        faces={faces}
        mode="single"
        // Choosing a portrait is unrelated to who is already in the tree — the same
        // person's face is exactly what's wanted here.
        alreadyInTree={new Set()}
        onCancel={() => setPickingFace(false)}
        onConfirm={handleFaceChosen}
      />
    )}

    {connecting && tree && onLink && (
      <ConnectDialog
        tree={tree}
        person={person}
        onConnect={onLink}
        onClose={() => setConnecting(false)}
      />
    )}
    </>,
    document.body
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>{children}</div>;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="ft-field" style={{ flex: "1 1 200px", minWidth: 0, display: "block" }}>
      {/* The global input/select styling in index.css sets padding and borders but not
          width, and these sit as block children rather than as flex items. */}
      <style>{`.ft-field input, .ft-field select, .ft-field textarea { width: 100%; }`}</style>
      <span style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>{label}</span>
      {children}
      {hint && (
        <span style={{ fontSize: 11, color: "var(--ink-soft)", display: "block", marginTop: 4 }}>{hint}</span>
      )}
    </label>
  );
}

const TextAreaStyle: React.CSSProperties = {
  width: "100%",
  fontFamily: "inherit",
  fontSize: 13.5,
  padding: "9px 11px",
  border: "1px solid var(--line)",
  borderRadius: 8,
  background: "var(--bg-cream)",
  color: "var(--ink)",
  resize: "vertical",
};
