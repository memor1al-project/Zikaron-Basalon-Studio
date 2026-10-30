import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useT } from "../../i18n";
import { CollectionPageShell } from "../collection/CollectionPageShell";
import { useCollectionSession } from "../collection/CollectionSessionContext";
import { listMetas } from "../collection/metaStore";
import { useAuthedUser } from "../../app/guards";
import { FamilyTreeChart } from "./FamilyTreeChart";
import { FacePicker } from "./FacePicker";
import { NodeMenu } from "./NodeMenu";
import { ConnectDialog } from "./ConnectDialog";
import { namedFacesFrom, splitName, toPortrait, type NamedFace } from "./facePeople";
import { PersonDialog, type PersonDraft } from "./PersonDialog";
import { getFamilyTree, saveFamilyTree } from "./familyTreeService";
import { parseGedcom, renumber, serializeGedcom } from "./gedcom";
import {
  addPerson,
  detachFromUnion,
  linkPeople,
  describeRelations,
  displayName,
  EMPTY_TREE,
  initialsOf,
  lifespan,
  nextId,
  removePerson,
  setSubject,
  updatePerson,
  type FamilyTree,
  type RelationshipType,
  type TreePerson,
} from "./familyTree";

/**
 * The Family tree step — optional throughout.
 *
 * A family gathering a story often already has a tree in Gramps, MyHeritage or Ancestry,
 * and just as often has none at all and no wish to build one. So this offers both doors
 * and blocks neither: import a GEDCOM, or add people one at a time, or skip the step
 * entirely and carry on with the rest of the wizard.
 */
export function FamilyTreePage() {
  const t = useT();
  const user = useAuthedUser();
  const { connection } = useCollectionSession();
  const [tree, setTree] = useState<FamilyTree | null>(null);
  const [faces, setFaces] = useState<NamedFace[]>([]);
  /** null = closed; "add" picks new people, otherwise the id of the person getting a portrait. */
  const [facePicker, setFacePicker] = useState<"add" | string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [editing, setEditing] = useState<{
    person: TreePerson;
    mode: "add" | "edit";
    relation?: RelationshipType;
    relatedId?: string;
  } | null>(null);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  /** Right-click target in the chart, in viewport coordinates. */
  const [menu, setMenu] = useState<{ person: TreePerson; x: number; y: number } | null>(null);
  /** Open when joining two people who are both already in the tree. */
  const [connecting, setConnecting] = useState<TreePerson | null>(null);
  const [importNote, setImportNote] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // A failed read must still open the step — otherwise a dropped connection leaves a
    // blank page with no way to tell that anything went wrong.
    getFamilyTree(user.uid)
      .then(setTree)
      .catch(() => {
        setTree(EMPTY_TREE);
        setSaveError(t("Couldn't load your saved tree. Anything added now may overwrite it — reload before saving."));
      });
  }, [user.uid, t]);

  useEffect(() => {
    // Best-effort: a tree is perfectly usable with no tagged faces behind it, so a failure
    // here just means the shortcut isn't offered.
    listMetas(connection, user.uid)
      .then((metas) => setFaces(namedFacesFrom(metas)))
      .catch(() => setFaces([]));
  }, [connection, user.uid]);

  const namesInTree = useMemo(
    () => new Set((tree?.people ?? []).map((p) => displayName(p).toLowerCase())),
    [tree]
  );

  if (!tree) return null;

  function apply(next: FamilyTree) {
    setTree(next);
    setDirty(true);
    setSavedAt(null);
  }

  async function handleSave() {
    if (!tree) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveFamilyTree(user.uid, tree);
      setDirty(false);
      setSavedAt(Date.now());
    } catch (err) {
      // Staying dirty matters more than the message: the work is still in the page,
      // and the Save button stays live to try again. The document-too-large case carries
      // its own message naming the cause, so it's shown rather than the generic one.
      setSaveError(
        err instanceof Error && err.message.includes("too large")
          ? err.message
          : t("Couldn't save. Check your connection and try again.")
      );
    } finally {
      setSaving(false);
    }
  }

  function handleAddClick() {
    if (!tree) return;
    setEditing({
      mode: "add",
      person: { id: nextId("I", tree.people), firstName: "", lastName: "", sex: "" },
    });
  }

  /** From the chart's right-click menu: a blank person, already tied to who was clicked. */
  function handleAddRelative(relation: RelationshipType, relatedId: string) {
    if (!tree) return;
    setMenu(null);
    setEditing({
      mode: "add",
      person: { id: nextId("I", tree.people), firstName: "", lastName: "", sex: "" },
      relation,
      relatedId,
    });
  }

  function handleDialogSave(draft: PersonDraft) {
    if (!tree || !editing) return;
    const next =
      editing.mode === "add"
        ? addPerson(tree, draft.person, draft.relation, draft.relatedId)
        : updatePerson(tree, draft.person.id, draft.person);
    apply(next);
    setEditing(null);
  }

  /**
   * Named faces become people. They arrive unlinked: the photograph says who they are, not
   * how they're related, and guessing a relationship from a group shot would be inventing
   * genealogy. The relationships get set afterwards by editing each one.
   */
  async function handleFacesChosen(chosen: NamedFace[]) {
    if (!tree) return;
    const target = facePicker;
    setFacePicker(null);
    if (!target) return;

    const portraits = await Promise.all(chosen.map((face) => toPortrait(face.dataUrl)));

    if (target !== "add") {
      const photo = portraits[0];
      apply(updatePerson(tree, target, photo ? { photo } : {}));
      return;
    }

    let next = tree;
    chosen.forEach((face, i) => {
      const { firstName, lastName } = splitName(face.label);
      next = addPerson(
        next,
        { id: nextId("I", next.people), firstName, lastName, sex: "", photo: portraits[i] || undefined },
        "none",
        undefined
      );
    });
    apply(next);
  }

  function handleRemove() {
    if (!tree || !editing) return;
    apply(removePerson(tree, editing.person.id));
    if (selectedId === editing.person.id) setSelectedId(undefined);
    setEditing(null);
  }

  async function handleImport(file: File) {
    setImportError(null);
    setImportNote(null);
    try {
      const text = await file.text();
      const parsed = parseGedcom(text);
      if (parsed.people.length === 0) {
        setImportError(t("No people found in that file. Is it a GEDCOM (.ged) export?"));
        return;
      }
      // Imported xrefs are whatever the exporting app chose, so they're re-keyed onto this
      // tree's numbering before merging — otherwise two different people could share an id.
      const current = tree ?? EMPTY_TREE;
      const incoming = renumber(parsed, current);
      apply({
        people: [...current.people, ...incoming.people],
        unions: [...current.unions, ...incoming.unions],
      });
      setImportNote(
        `Added ${incoming.people.length} ${incoming.people.length === 1 ? "person" : "people"} from ${file.name}. Nothing is stored until you save.`
      );
    } catch {
      setImportError(t("Couldn't read that file."));
    }
  }

  function handleExport() {
    if (!tree) return;
    const blob = new Blob([serializeGedcom(tree)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "family-tree.ged";
    a.click();
    URL.revokeObjectURL(url);
  }

  const empty = tree.people.length === 0;

  return (
    <CollectionPageShell step="familytree" maxWidth={1100}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 420px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <h1 style={{ fontSize: 28, lineHeight: 1.25 }}>{t("Family tree")}</h1>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: ".06em",
                textTransform: "uppercase",
                color: "var(--ink-soft)",
                border: "1px solid var(--line)",
                borderRadius: 20,
                padding: "3px 10px",
              }}
            >
              {t("Optional")}
            </span>
          </div>
          <p style={{ fontSize: 14.5, color: "var(--ink-soft)", lineHeight: 1.6, maxWidth: 620 }}>
            {t("Who the story sits inside. Bring in a tree you already keep somewhere else, or add the few people the story turns on — a handful of names is worth as much here as a full genealogy. Skipping this changes nothing else in the wizard.")}
          </p>
        </div>

        {!empty && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", paddingTop: 6 }}>
            <button type="button" className="btn-primary" onClick={handleAddClick}>
              + {t("Add a person")}
            </button>
            {faces.length > 0 && (
              <button type="button" className="btn-secondary" onClick={() => setFacePicker("add")}>
                {t("From tagged faces")}
              </button>
            )}
            <button type="button" className="btn-secondary" onClick={() => fileInput.current?.click()}>
              {t("Import GEDCOM")}
            </button>
            <button type="button" className="btn-secondary" onClick={handleExport}>
              {t("Export")}
            </button>
          </div>
        )}
      </div>

      <input
        ref={fileInput}
        type="file"
        accept=".ged,.gedcom,text/plain"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleImport(file);
          e.target.value = "";
        }}
      />

      {(importNote || importError) && (
        <div
          style={{
            marginTop: 20,
            fontSize: 13,
            borderRadius: 10,
            padding: "12px 14px",
            background: importError ? "var(--accent-soft)" : "var(--sage-soft)",
            color: "var(--ink)",
          }}
        >
          {importError ?? importNote}
        </div>
      )}

      {empty ? (
        <EmptyState
          onAdd={handleAddClick}
          onImport={() => fileInput.current?.click()}
          faceCount={faces.length}
          onUseFaces={() => setFacePicker("add")}
        />
      ) : (
        <>
          <Card
            title={t("The tree")}
            subtitle={t("Right-click anyone to add a relative beside them. Dashed lines are partners.")}
          >
            <FamilyTreeChart
              tree={tree}
              selectedId={selectedId}
              onSelect={(p) => setSelectedId(p.id)}
              onContextMenu={(person, x, y) => setMenu({ person, x, y })}
            />
          </Card>

          <Card
            title={t("People ({n})").replace("{n}", String(tree.people.length))}
            subtitle={t("Mark the person this story is about, so the rest of the wizard knows who is at its centre.")}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {tree.people.map((person) => (
                <PersonRow
                  key={person.id}
                  person={person}
                  relations={describeRelations(tree, person.id, t)}
                  selected={person.id === selectedId}
                  canPickFace={faces.length > 0}
                  onEdit={() => setEditing({ person, mode: "edit" })}
                  onSelect={() => setSelectedId(person.id)}
                  onToggleSubject={() => apply(setSubject(tree, person.id))}
                  onPickFace={() => setFacePicker(person.id)}
                />
              ))}
            </div>
          </Card>
        </>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          marginTop: 28,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <button type="button" className="btn-primary" disabled={saving || !dirty} onClick={handleSave}>
            {saving && <span className="spinner" />}
            {saving ? t("Saving...") : t("Save")}
          </button>
          {dirty && !saving && !saveError && (
            // Says "before leaving" because the step links sit right beside it, and an
            // unsaved import is a whole tree to lose rather than a stray field.
            <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
              {t("Unsaved changes — save before leaving.")}
            </span>
          )}
          {savedAt && !dirty && <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{t("Saved.")}</span>}
          {saveError && <span style={{ fontSize: 12.5, color: "var(--accent-deep)" }}>{saveError}</span>}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link to="/collection/materials" className="btn-secondary" style={{ display: "inline-flex" }}>
            ← {t("Back to collection")}
          </Link>
          <Link to="/collection/story" className="btn-secondary" style={{ display: "inline-flex" }}>
            {t("Continue to the story")} →
          </Link>
        </div>
      </div>

      {menu && (
        <NodeMenu
          person={menu.person}
          x={menu.x}
          y={menu.y}
          onAdd={(relation) => handleAddRelative(relation, menu.person.id)}
          onConnect={() => {
            setConnecting(menu.person);
            setMenu(null);
          }}
          onEdit={() => {
            setEditing({ person: menu.person, mode: "edit" });
            setMenu(null);
          }}
          onClose={() => setMenu(null)}
        />
      )}

      {facePicker && (
        <FacePicker
          faces={faces}
          mode={facePicker === "add" ? "multi" : "single"}
          alreadyInTree={namesInTree}
          onCancel={() => setFacePicker(null)}
          onConfirm={handleFacesChosen}
        />
      )}

      {connecting && (
        <ConnectDialog
          tree={tree}
          person={connecting}
          onConnect={(relation, relatedId) => apply(linkPeople(tree, connecting.id, relation, relatedId))}
          onClose={() => setConnecting(null)}
        />
      )}

      {editing && (
        <PersonDialog
          initial={editing.person}
          mode={editing.mode}
          faces={faces}
          initialRelation={editing.relation}
          tree={tree}
          onLink={(relation, relatedId) => apply(linkPeople(tree, editing.person.id, relation, relatedId))}
          onUnlink={(unionId, role) => apply(detachFromUnion(tree, editing.person.id, unionId, role))}
          initialRelatedId={editing.relatedId}
          people={tree.people.filter((p) => p.id !== editing.person.id)}
          onCancel={() => setEditing(null)}
          onSave={handleDialogSave}
          onRemove={editing.mode === "edit" ? handleRemove : undefined}
        />
      )}
    </CollectionPageShell>
  );
}

/**
 * Two doors, and an explanation of the file format between them.
 *
 * The copy is adapted from the website's GedcomPage, which exists because most people have
 * never heard of GEDCOM and won't go looking for an export button they can't name.
 */
function EmptyState({
  onAdd,
  onImport,
  faceCount,
  onUseFaces,
}: {
  onAdd: () => void;
  onImport: () => void;
  faceCount: number;
  onUseFaces: () => void;
}) {
  const t = useT();
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {/* Offered first when it applies: the names are already typed, so this is the
            shortest route from nothing to a tree. */}
        {faceCount > 0 && (
          <Door
            title={t("Use the faces you've named")}
            body={t(
              faceCount === 1
                ? "{n} person has been named while tagging photographs in Collection. Bring them in with their portraits, then say how they're related."
                : "{n} people have been named while tagging photographs in Collection. Bring them in with their portraits, then say how they're related."
            ).replace("{n}", String(faceCount))}
            action={t("Choose from tagged faces")}
            onClick={onUseFaces}
            primary
          />
        )}
        <Door
          title={t("Start from scratch")}
          body={t("Add people one at a time, saying how each one connects to someone already here. Two or three names is a perfectly good tree.")}
          action={t("Add the first person")}
          onClick={onAdd}
          primary={faceCount === 0}
        />
        <Door
          title={t("Import what you already have")}
          body={t("If the tree lives in Gramps, MyHeritage, Ancestry or similar, export it as a GEDCOM file and bring it in whole.")}
          action={t("Choose a .ged file")}
          onClick={onImport}
        />
      </div>

      <Card title={t("What's a GEDCOM file?")} subtitle={t("Short for Genealogical Data Communication.")}>
        <p style={{ fontSize: 13.5, lineHeight: 1.7, color: "var(--ink-soft)", marginBottom: 14 }}>
          {t("One file holding people, dates, places, and the relationships between them. Nearly every family-tree app can write one, which is what makes it possible to move a tree between them without retyping anything.")}
        </p>
        <ol
          style={{
            fontSize: 13.5,
            lineHeight: 1.8,
            color: "var(--ink-soft)",
            paddingLeft: 20,
            margin: "0 0 14px",
          }}
        >
          <li>{t("Open the app or site where the tree already lives.")}</li>
          <li>{t("Look under Settings, Tools, or Share for Export, Download, or GEDCOM.")}</li>
          <li>
            {t("Save the file — it ends in")} <strong style={{ color: "var(--ink)" }}>.ged</strong>{" "}
            {t("— then choose it above.")}
          </li>
        </ol>
        <p style={{ fontSize: 13.5, lineHeight: 1.7, color: "var(--ink-soft)" }}>
          {t("No tree anywhere yet?")}{" "}
          <a href="https://gramps-project.org/" target="_blank" rel="noreferrer">
            Gramps
          </a>{" "}
          {t("is free and open-source, keeps the data on your own machine, and exports GEDCOM. Whichever route you take, the tree here can be exported back out at any time.")}
        </p>
        <p
          style={{
            fontSize: 12.5,
            lineHeight: 1.6,
            color: "var(--ink-soft)",
            marginTop: 14,
            paddingTop: 14,
            borderTop: "1px solid var(--line)",
          }}
        >
          {t("A word on living relatives: a tree exported from elsewhere often carries people who are still alive and haven't been asked. Bring in only what they'd be comfortable sharing — anyone can be removed here after importing.")}
        </p>
      </Card>
    </div>
  );
}

function Door({
  title,
  body,
  action,
  onClick,
  primary,
}: {
  title: string;
  body: string;
  action: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <div
      style={{
        flex: "1 1 280px",
        border: "1px solid var(--line)",
        borderRadius: 14,
        padding: 22,
        background: "var(--card)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <h2 style={{ fontSize: 16, marginBottom: 8 }}>{title}</h2>
      <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-soft)", marginBottom: 18, flex: 1 }}>
        {body}
      </p>
      <button
        type="button"
        className={primary ? "btn-primary" : "btn-secondary"}
        onClick={onClick}
        style={{ alignSelf: "flex-start" }}
      >
        {action}
      </button>
    </div>
  );
}

function PersonRow({
  person,
  relations,
  selected,
  canPickFace,
  onEdit,
  onSelect,
  onToggleSubject,
  onPickFace,
}: {
  person: TreePerson;
  relations: string;
  selected: boolean;
  canPickFace: boolean;
  onEdit: () => void;
  onSelect: () => void;
  onToggleSubject: () => void;
  onPickFace: () => void;
}) {
  const t = useT();
  const years = lifespan(person);
  return (
    <div
      onClick={onSelect}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        border: `1px solid ${selected ? "var(--accent)" : "var(--line)"}`,
        borderRadius: 10,
        background: selected ? "var(--accent-soft)" : "var(--bg-cream)",
        cursor: "pointer",
      }}
    >
      {person.photo ? (
        <img
          src={person.photo}
          alt=""
          style={{
            width: 34,
            height: 34,
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
            width: 34,
            height: 34,
            borderRadius: "50%",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid var(--line)",
            background: "var(--card)",
            fontFamily: "Domine, serif",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--accent-deep)",
          }}
        >
          {initialsOf(person)}
        </span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          {displayName(person)}
          {years && <span style={{ fontSize: 12, fontWeight: 400, color: "var(--ink-soft)" }}>{years}</span>}
          {person.isSubject && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: ".05em",
                textTransform: "uppercase",
                color: "var(--bg-cream)",
                background: "var(--accent-deep)",
                borderRadius: 20,
                padding: "2px 8px",
              }}
            >
              {t("This story")}
            </span>
          )}
        </div>
        {relations && (
          <div
            style={{
              fontSize: 12,
              color: "var(--ink-soft)",
              marginTop: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {relations}
          </div>
        )}
      </div>
      {canPickFace && (
        <button
          type="button"
          className="btn-secondary"
          style={{ padding: "6px 12px", fontSize: 12.5 }}
          onClick={(e) => {
            e.stopPropagation();
            onPickFace();
          }}
        >
          {person.photo ? t("Change photo") : t("Add photo")}
        </button>
      )}
      <button
        type="button"
        className="btn-secondary"
        style={{ padding: "6px 12px", fontSize: 12.5 }}
        onClick={(e) => {
          e.stopPropagation();
          onToggleSubject();
        }}
      >
        {person.isSubject ? t("Unmark") : t("This story")}
      </button>
      <button
        type="button"
        className="btn-secondary"
        style={{ padding: "6px 12px", fontSize: 12.5 }}
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
      >
        {t("Edit")}
      </button>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        border: "1px solid var(--line)",
        borderRadius: 14,
        padding: 22,
        background: "var(--card)",
        marginTop: 20,
      }}
    >
      <h2 style={{ fontSize: 16, marginBottom: subtitle ? 4 : 14 }}>{title}</h2>
      {subtitle && <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 14 }}>{subtitle}</p>}
      {children}
    </div>
  );
}
