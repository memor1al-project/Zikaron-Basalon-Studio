import { useEffect, useMemo, useState } from "react";
import { Navigate, Link, useSearchParams } from "react-router-dom";
import { CollectionPageShell } from "./CollectionPageShell";
import { useCollectionSession } from "./CollectionSessionContext";
import { GoogleDriveConnect } from "./GoogleDriveConnect";
import { useAuthedUser } from "../../app/guards";
import {
  addLocalFiles,
  copyExternalFilesIntoFolder,
  duplicateExternalPairs,
  forgetLocalFile,
  getExternalFileNames,
  getLocalObjectUrl,
  isExternalId,
  pickExternalFiles,
  pickExternalFolder,
} from "../../lib/storage/localFsProvider";
import { getDriveObjectUrl } from "../../lib/storage/driveApi";
import { metaKeyFor, type MaterialMeta } from "./materialsMetaService";
import {
  listMetas,
  listRecordedMaterials,
  metaStoreDescription,
  metaStoreKindFor,
  listRemoved,
  rekeyMaterial,
  removeMaterial,
  removedKeys,
  restoreAllMaterials,
  restoreMaterial,
  saveMeta,
  storeThumbnail,
  thumbnailedKeys,
} from "./metaStore";
import { canThumbnail, makeThumbnail } from "../../lib/thumbnail";
import { MaterialDetail } from "./MaterialDetail";
import { faceDistance, SAME_PERSON_THRESHOLD } from "./faceExtractionService";
import type { ProviderFile } from "../../lib/storage/types";
import { useT } from "../../i18n";

const EMPTY_META: MaterialMeta = { tags: [], notes: "", connections: [] };

/** metaKeyFor() is "<providerId>_<encoded id>"; this recovers the id for provider calls. */
function idFromKey(key: string): string {
  const separator = key.indexOf("_");
  return separator === -1 ? key : decodeURIComponent(key.slice(separator + 1));
}

export function MaterialsStep() {
  const { connection, files, addFiles } = useCollectionSession();
  const user = useAuthedUser();
  const [metas, setMetas] = useState<Record<string, MaterialMeta>>({});
  /**
   * Whether the saved metadata has come back yet.
   *
   * An explicit flag rather than checking for an empty map: a story whose materials have
   * never been tagged legitimately has none, and would otherwise look like "still loading"
   * forever.
   */
  const [metasLoaded, setMetasLoaded] = useState(false);
  const t = useT();
  const appearsIn = (n: number) =>
    t(n === 1 ? "appears in {n} material" : "appears in {n} materials").replace("{n}", String(n));
  const [query, setQuery] = useState("");
  const [openFile, setOpenFile] = useState<ProviderFile | null>(null);
  /**
   * Arriving from a story attribution chip: ?open=<materialKey>&page=<1-based>.
   *
   * The page is 1-based in the URL because that's the number the person saw on the pager;
   * a link that says page 7 should not open page 8.
   */
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedKey = searchParams.get("open");
  const requestedPage = Number(searchParams.get("page"));
  const [initialPage, setInitialPage] = useState<number | undefined>(undefined);

  const [addingDrive, setAddingDrive] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [externalNames, setExternalNames] = useState<string[]>(() => getExternalFileNames());
  const [copying, setCopying] = useState(false);
  /** Materials the sidecar remembers whose file isn't reachable right now. */
  const [missing, setMissing] = useState<{ key: string; name: string; origin: string; thumbnail: string | null }[]>([]);
  /** Materials taken out of the story — still on disk, so the scan must be told to skip them. */
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [removedList, setRemovedList] = useState<{ key: string; name: string }[]>([]);
  const [showRemoved, setShowRemoved] = useState(false);
  const [restoringAll, setRestoringAll] = useState(false);
  const [flushing, setFlushing] = useState<string | null>(null);
  /** Index into `people`, when the grid is filtered to one person. */
  const [selectedPerson, setSelectedPerson] = useState<number | null>(null);
  /** Formatted at save time, not during render — reading the clock while rendering is impure. */
  const [savedAt, setSavedAt] = useState<string | null>(null);

useEffect(() => {
    if (!requestedKey) return;
    const match = files.find((f) => metaKeyFor(f.ref) === requestedKey);
    // Files load after this runs on a cold navigation, so wait rather than clearing the
    // request — the effect runs again once they arrive.
    if (!match) return;

    setOpenFile(match);
    setInitialPage(Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage - 1 : undefined);
    // Consumed, so closing and reopening the material doesn't jump back to that page, and
    // a reload doesn't reopen a panel the person has since closed.
    setSearchParams({}, { replace: true });
  }, [requestedKey, requestedPage, files, metasLoaded, setSearchParams]);

  const metaStoreKind = metaStoreKindFor(connection);

  function handleAddLocalFiles(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return;
    addFiles(addLocalFiles(e.target.files));
    setExternalNames(getExternalFileNames());
    e.target.value = "";
  }

  /**
   * Prefers the handle-based picker so materials from other folders can be reopened next
   * session; falls back to the plain input where the browser has no such picker.
   */
  async function handlePickExternal() {
    const picked = await pickExternalFiles();
    if (picked === null) return false;
    if (picked.length > 0) {
      addFiles(picked);
      setExternalNames(getExternalFileNames());
      // Record them straight away so the sidecar knows they belong to this story even if
      // nothing is tagged yet.
      for (const file of picked) {
        await saveMeta(connection, user.uid, metaKeyFor(file.ref), file.name, EMPTY_META, {
          source: "external",
          origin: "another folder on this device",
        }).catch(() => {});
      }
    }
    return true;
  }

  async function handleRemoveMaterial(key: string, name: string) {
    try {
      await removeMaterial(connection, user.uid, key, name);
      if (connection?.providerId === "local") await forgetLocalFile(idFromKey(key));
      setRemoved((prev) => new Set(prev).add(key));
      setRemovedList((prev) => [...prev.filter((r) => r.key !== key), { key, name }]);
      setMissing((prev) => prev.filter((m) => m.key !== key));
      setExternalNames(getExternalFileNames());
      setSaveError(null);
    } catch (err) {
      setSaveError(
        err instanceof Error
          ? `${t('Couldn\'t remove "{name}"').replace("{name}", name)}: ${err.message}`
          : t("Couldn't remove material")
      );
      throw err;
    }
  }

  async function handleRestoreMaterial(key: string) {
    try {
      await restoreMaterial(connection, key);
      setRemoved((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      setRemovedList((prev) => prev.filter((r) => r.key !== key));
      setSaveError(null);
    } catch (err) {
      setSaveError(err instanceof Error ? `${t("Couldn't restore")}: ${err.message}` : t("Couldn't restore material"));
    }
  }

  /** Adds a whole second folder, which is what gives outside materials a real location. */
  async function handleAddFolder() {
    const picked = await pickExternalFolder();
    if (!picked || picked.length === 0) return;
    addFiles(picked);
    setExternalNames(getExternalFileNames());
    for (const file of picked) {
      const folder = file.name.split("/")[0];
      await saveMeta(connection, user.uid, metaKeyFor(file.ref), file.name, EMPTY_META, {
        source: "external",
        origin: folder,
      }).catch(() => {});
    }
  }

  /**
   * Writes every material in the session to disk, not just the ones that were opened.
   *
   * Editing a material saves it immediately, so this isn't flushing a write buffer — it's
   * making the database a complete record of the story. A material nobody happened to tag
   * has no row at all, which means it contributes no preview and no provenance, and it
   * simply vanishes from the record if its file later moves.
   */
  async function handleSaveAll() {
    setFlushing(t("Saving..."));
    setSaveError(null);
    try {
      const alreadyThumbnailed = await thumbnailedKeys(connection);
      let index = 0;

      for (const file of visibleFiles) {
        index++;
        setFlushing(`Saving ${index} of ${visibleFiles.length}...`);

        const key = metaKeyFor(file.ref);
        const external = isExternalId(file.ref.id);
        await saveMeta(
          connection,
          user.uid,
          key,
          file.name,
          // Existing metadata, never EMPTY_META over the top of real tags and notes.
          metas[key] ?? EMPTY_META,
          {
            source: external ? "external" : "folder",
            origin: external
              ? file.name.includes("/")
                ? file.name.split("/")[0]
                : "another folder on this device"
              : "",
          }
        );

        if (canThumbnail(file) && !alreadyThumbnailed.has(key)) {
          const thumbnail = await makeThumbnail(file);
          if (thumbnail) await storeThumbnail(connection, key, file.name, thumbnail);
        }
      }

      setSavedAt(new Date().toLocaleTimeString());
    } catch (err) {
      setSaveError(
        err instanceof Error ? `${t("Couldn't save everything")}: ${err.message}` : t("Couldn't save everything")
      );
    } finally {
      setFlushing(null);
    }
  }

  async function handleRestoreAll() {
    setRestoringAll(true);
    try {
      await restoreAllMaterials(connection);
      setRemoved(new Set());
      setRemovedList([]);
      setSaveError(null);
    } catch (err) {
      setSaveError(err instanceof Error ? `${t("Couldn't restore")}: ${err.message}` : t("Couldn't restore materials"));
    } finally {
      setRestoringAll(false);
    }
  }

  async function handleCopyIntoFolder() {
    setCopying(true);
    setSaveError(null);
    try {
      await copyExternalFilesIntoFolder();
    } catch (err) {
      setSaveError(err instanceof Error ? `${t("Couldn't copy files in")}: ${err.message}` : t("Couldn't copy files in"));
    } finally {
      setExternalNames(getExternalFileNames());
      setCopying(false);
    }
  }

  useEffect(() => {
    setMetasLoaded(false);
    listMetas(connection, user.uid)
      .then(setMetas)
      .catch((err) =>
        setSaveError(
          err instanceof Error
            ? `${t("Couldn't load saved metadata")}: ${err.message}`
            : t("Couldn't load saved metadata")
        )
      )
      // Loaded either way: a failure must not leave a deep link waiting forever for
      // metadata that is never going to arrive.
      .finally(() => setMetasLoaded(true));
  }, [connection, user.uid, t]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([removedKeys(connection), listRemoved(connection)])
      .then(([keys, list]) => {
        if (cancelled) return;
        setRemoved(keys);
        setRemovedList(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [connection]);

  /**
   * Reconciles outside materials that turned out to be in the folder after all.
   *
   * listFiles() already hides the duplicate, but the catalog still holds a row under the
   * outside id — with whatever notes and tags were recorded against it. Move that row onto
   * the folder copy when the folder copy has none, then stop tracking the outside file so
   * its stored handle doesn't reattach it next visit.
   */
  useEffect(() => {
    if (metaStoreKindFor(connection) !== "local-file") return;
    let cancelled = false;

    (async () => {
      const pairs = duplicateExternalPairs();
      if (pairs.length === 0) return;

      const records = await listRecordedMaterials(connection).catch(() => null);
      if (!records || cancelled) return;
      const byKey = new Map(records.map((r) => [r.key, r]));

      let changed = false;
      for (const { externalId, folderId } of pairs) {
        const externalKey = metaKeyFor({ providerId: "local", id: externalId });
        const folderKey = metaKeyFor({ providerId: "local", id: folderId });

        // Only move it when the copy being kept has nothing recorded — never overwrite
        // notes someone wrote against the folder copy with the outside one's.
        if (byKey.has(externalKey) && !byKey.has(folderKey)) {
          await rekeyMaterial(connection, externalKey, folderKey, folderId).catch(() => {});
          changed = true;
        }
        await forgetLocalFile(externalId).catch(() => {});
      }

      if (cancelled) return;
      setExternalNames(getExternalFileNames());
      if (changed) listMetas(connection, user.uid).then(setMetas).catch(() => {});
    })();

    return () => {
      cancelled = true;
    };
  }, [connection, files, user.uid]);

  // The folder scan shows what's on disk; the sidecar knows what belongs to the story.
  // Anything it remembers but we can't open is surfaced rather than quietly dropped.
  useEffect(() => {
    let cancelled = false;
    listRecordedMaterials(connection)
      .then((records) => {
        if (cancelled) return;
        const present = new Set(files.map((f) => metaKeyFor(f.ref)));
        setMissing(
          records
            .filter((r) => !present.has(r.key))
            .map((r) => ({
              key: r.key,
              name: r.name,
              origin: r.origin || (r.source === "external" ? "another folder" : ""),
              thumbnail: r.thumbnail,
            }))
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [connection, files, user.uid]);

  /**
   * Everyone who appears anywhere in the collection, one entry per person rather than per
   * photo. Faces are grouped by descriptor distance, so the same person photographed twice
   * is a single face to click rather than two identical-looking circles.
   *
   * A face with no descriptor (extracted before signatures were recorded) can't be grouped,
   * so it stands alone — visible and filterable, just never merged with anyone.
   */
  const people = useMemo(() => {
    const clusters: { descriptor: number[] | null; label: string; dataUrl: string; keys: Set<string> }[] = [];

    for (const [key, meta] of Object.entries(metas)) {
      for (const face of meta.faces ?? []) {
        const match = face.descriptor
          ? clusters.find((c) => c.descriptor && faceDistance(c.descriptor, face.descriptor!) < SAME_PERSON_THRESHOLD)
          : undefined;

        if (match) {
          match.keys.add(key);
          if (!match.label && face.label) match.label = face.label;
        } else {
          clusters.push({
            descriptor: face.descriptor ?? null,
            label: face.label ?? "",
            dataUrl: face.dataUrl,
            keys: new Set([key]),
          });
        }
      }
    }
    // Most-photographed first: the people a story is actually about surface without scrolling.
    return clusters.sort((a, b) => b.keys.size - a.keys.size);
  }, [metas]);

  const personKeys = selectedPerson === null ? null : people[selectedPerson]?.keys ?? null;

  // A plain filter rather than a memo: it's O(n) over a handful of files, and memoizing it
  // only added a dependency the compiler couldn't keep stable anyway.
  const visibleFiles = files.filter((file) => !removed.has(metaKeyFor(file.ref)));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let visible = files.filter((file) => !removed.has(metaKeyFor(file.ref)));
    if (personKeys) visible = visible.filter((file) => personKeys.has(metaKeyFor(file.ref)));
    if (!q) return visible;
    return visible.filter((file) => {
      const meta = metas[metaKeyFor(file.ref)];
      const haystack = [file.name, ...(meta?.tags ?? []), meta?.notes ?? "", meta?.location ?? ""].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [files, removed, metas, query, personKeys]);

  // Give every image on disk a stored preview while it's still readable, so it keeps a
  // face if the file later moves away. Runs quietly in the background, once per material.
  useEffect(() => {
    if (metaStoreKindFor(connection) !== "local-file") return;
    let cancelled = false;

    (async () => {
      const done = await thumbnailedKeys(connection);
      for (const file of files) {
        if (cancelled) return;
        if (!canThumbnail(file)) continue;
        const key = metaKeyFor(file.ref);
        if (done.has(key)) continue;
        const thumbnail = await makeThumbnail(file);
        if (cancelled || !thumbnail) continue;
        await storeThumbnail(connection, key, file.name, thumbnail).catch(() => {});
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connection, files]);

  /**
   * Materials the story remembers but can't open are only shown in the unfiltered view.
   *
   * They can't answer a filter honestly: with no file there's nothing to match a person
   * against, and their metadata was cleared, so they'd sit in every result set as noise
   * that has nothing to do with what was asked for.
   */
  const filtering = query.trim().length > 0 || selectedPerson !== null;
  const missingFiltered = filtering ? [] : missing;

  const knownLocations = useMemo(
    () => Array.from(new Set(Object.values(metas).map((m) => m.location).filter((l): l is string => Boolean(l)))),
    [metas]
  );

  async function handleSaveMeta(file: ProviderFile, meta: MaterialMeta) {
    const key = metaKeyFor(file.ref);
    try {
      const isExternal = isExternalId(file.ref.id);
      await saveMeta(connection, user.uid, key, file.name, meta, {
        source: isExternal ? "external" : "folder",
        origin: isExternal ? "another folder on this device" : "",
      });
      setSaveError(null);
    } catch (err) {
      // Surfaced, not swallowed: a save that fails silently is how a whole afternoon of
      // tagging gets lost without anyone noticing until it's too late.
      setSaveError(
        err instanceof Error
          ? `${t('Couldn\'t save "{name}"').replace("{name}", file.name)}: ${err.message}`
          : t("Couldn't save changes")
      );
      throw err;
    }
    setMetas((prev) => ({ ...prev, [key]: meta }));
  }

  if (!connection) return <Navigate to="/collection/connect" replace />;

  return (
    <CollectionPageShell step="collection">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, lineHeight: 1.25, marginBottom: 6 }}>{connection.label}</h1>
          <p style={{ fontSize: 14, color: "var(--ink-soft)" }}>
            {t(visibleFiles.length === 1 ? "{n} file found" : "{n} files found").replace(
              "{n}",
              String(visibleFiles.length)
            )}
            {/* Counts at each stage, so a material that vanishes can be traced to the step
                that dropped it instead of guessed at. */}
            {(removed.size > 0 || missing.length > 0 || files.length !== visibleFiles.length) && (
              <span style={{ color: "var(--ink-soft)" }}>
                {" "}
                · {t("{n} in folder").replace("{n}", String(files.length))}
                {removed.size > 0 && ` · ${t("{n} removed").replace("{n}", String(removed.size))}`}
                {missing.length > 0 && ` · ${t("{n} not found").replace("{n}", String(missing.length))}`}
              </span>
            )}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {savedAt && !flushing && (
            <span style={{ fontSize: 12, color: "var(--sage)" }}>
              {t("Saved")} {savedAt}
            </span>
          )}
          <button
            type="button"
            className="btn-primary"
            disabled={Boolean(flushing) || visibleFiles.length === 0}
            onClick={() => void handleSaveAll()}
            style={{ display: "inline-flex" }}
          >
            {flushing && <span className="spinner" />}
            {flushing ?? t("Save all to disk")}
          </button>
          <Link to="/collection/connect" className="btn-secondary" style={{ display: "inline-flex" }}>
            {t("Change location")}
          </Link>
        </div>
      </div>

      <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 16 }}>
        {metaStoreDescription(metaStoreKind, t)}
      </p>

      {metaStoreKind === "local-file" && externalNames.length > 0 && (
        <div
          style={{
            fontSize: 13,
            background: "var(--bg-cream-2)",
            borderRadius: 10,
            padding: "12px 14px",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span style={{ flex: 1, minWidth: 260, lineHeight: 1.5 }}>
            {t(
              externalNames.length === 1
                ? "{n} material was added from outside this folder, so it isn't saved anywhere yet. Copy it in to keep it with the rest of the story."
                : "{n} materials were added from outside this folder, so they aren't saved anywhere yet. Copy them in to keep them with the rest of the story."
            ).replace("{n}", String(externalNames.length))}
          </span>
          <button type="button" className="btn-secondary" disabled={copying} onClick={handleCopyIntoFolder}>
            {copying && <span className="spinner" />} {t("Copy into folder")}
          </button>
        </div>
      )}

      {saveError && (
        <p
          role="alert"
          style={{
            fontSize: 13,
            color: "var(--accent-deep)",
            background: "var(--accent-soft)",
            borderRadius: 8,
            padding: "10px 12px",
            marginBottom: 16,
          }}
        >
          {saveError}
        </p>
      )}

      {visibleFiles.length > 0 && (
        <div style={{ position: "relative", marginBottom: 20, maxWidth: 360 }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ink-soft)" }}>
            <SearchIcon />
          </span>
          <input
            type="text"
            placeholder={t("Search by name, tag, or note")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: "100%", paddingLeft: 36 }}
          />
        </div>
      )}

      {/* People found across the collection. Clicking one narrows the grid to the materials
          they appear in — the quickest route into "show me everything with Grandma in it". */}
      {people.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>People</span>
            <span style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
              {selectedPerson === null
                ? t("Tap a face to see only the materials they appear in")
                : t(filtered.length === 1 ? "Showing {n} material" : "Showing {n} materials").replace(
                    "{n}",
                    String(filtered.length)
                  )}
            </span>
            {selectedPerson !== null && (
              <button
                type="button"
                onClick={() => setSelectedPerson(null)}
                style={{ background: "none", border: "none", padding: 0, fontSize: 12, fontWeight: 600, color: "var(--accent-deep)" }}
              >
                {t("Show all")}
              </button>
            )}
          </div>

          <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 6 }}>
            {people.map((person, i) => {
              const active = selectedPerson === i;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedPerson(active ? null : i)}
                  aria-pressed={active}
                  title={`${person.label ? `${person.label} — ` : ""}${appearsIn(person.keys.size)}`}
                  aria-label={`${person.label || t("Unnamed person")}, ${appearsIn(person.keys.size)}`}
                  style={{
                    flexShrink: 0,
                    width: 76,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 5,
                    background: "none",
                    border: "none",
                    padding: 0,
                  }}
                >
                  <span style={{ position: "relative", lineHeight: 0 }}>
                    <img
                      src={person.dataUrl}
                      alt=""
                      style={{
                        width: 58,
                        height: 58,
                        borderRadius: "50%",
                        objectFit: "cover",
                        border: `2.5px solid ${active ? "var(--accent-deep)" : "var(--line)"}`,
                      }}
                    />
                    {person.keys.size > 1 && (
                      <span
                        aria-hidden="true"
                        style={{
                          position: "absolute",
                          right: -2,
                          bottom: -2,
                          minWidth: 18,
                          fontSize: 10,
                          fontWeight: 700,
                          background: active ? "var(--accent-deep)" : "var(--ink-soft)",
                          color: "var(--bg-cream)",
                          borderRadius: 9,
                          padding: "1px 5px",
                        }}
                      >
                        {person.keys.size}
                      </span>
                    )}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: active ? 700 : 500,
                      color: person.label ? "var(--ink)" : "var(--ink-soft)",
                      width: "100%",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      textAlign: "center",
                    }}
                  >
                    {person.label || t("Unnamed")}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {query && filtered.length === 0 && missingFiltered.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--ink-soft)" }}>
          {t('No materials match "{q}".').replace("{q}", query)}
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: 14,
          }}
        >
          {filtered.map((file) => (
            <MaterialCard
              key={file.ref.id}
              file={file}
              meta={metas[metaKeyFor(file.ref)] ?? EMPTY_META}
              onOpen={() => setOpenFile(file)}
            />
          ))}

          {missingFiltered.map((entry) => (
            <div
              key={entry.key}
              className="option-card"
              title={`${entry.name} — recorded in this story but not reachable right now`}
              style={{
                flexDirection: "column",
                alignItems: "stretch",
                gap: 10,
                padding: 14,
                textAlign: "left",
                // Deliberately NOT dimmed as a whole: the card carries the only explanation
                // of what happened to this material, and fading it made that unreadable.
                // The dashed border and the badge below carry the "unavailable" meaning.
                borderStyle: "dashed",
                cursor: "default",
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: 76,
                  borderRadius: 8,
                  background: "var(--bg-cream-2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  fontSize: 22,
                  color: "var(--ink-soft)",
                }}
              >
                {entry.thumbnail ? (
                  <img
                    src={entry.thumbnail}
                    alt=""
                    // Only the preview is faded, to read as "this is a stored copy, not the file".
                    style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.55 }}
                  />
                ) : (
                  "?"
                )}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {entry.name}
              </div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    background: "var(--accent-soft)",
                    color: "var(--accent-deep)",
                    padding: "3px 8px",
                    borderRadius: 10,
                  }}
                >
                  {t("File not found")}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-soft)", lineHeight: 1.45 }}>
                {entry.origin
                  ? t("Saved in this story from {origin}. Add it again to restore it.").replace(
                      "{origin}",
                      t(entry.origin)
                    )
                  : t("Saved in this story. Add it again to restore it.")}
              </div>
              <button
                type="button"
                onClick={() => void handleRemoveMaterial(entry.key, entry.name)}
                style={{
                  alignSelf: "flex-start",
                  background: "none",
                  border: "none",
                  padding: 0,
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: "var(--accent-deep)",
                  cursor: "pointer",
                }}
              >
                {t("Remove from story")}
              </button>
            </div>
          ))}

          {!query && connection.providerId === "local" && (
            <>
              <label
                className="option-card"
                style={AddTileStyle}
                onClick={(e) => {
                  // The handle picker is its own dialog; only let the hidden <input> open
                  // when the browser can't provide one.
                  e.preventDefault();
                  void handlePickExternal().then((handled) => {
                    if (!handled) e.currentTarget?.querySelector("input")?.click();
                  });
                }}
              >
                <PlusIcon />
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-soft)" }}>{t("Add files")}</span>
                <input type="file" multiple onChange={handleAddLocalFiles} style={{ display: "none" }} />
              </label>

              <button type="button" className="option-card" style={AddTileStyle} onClick={() => void handleAddFolder()}>
                <PlusIcon />
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-soft)" }}>{t("Add a folder")}</span>
                <span style={{ fontSize: 10.5, color: "var(--ink-soft)", textAlign: "center", lineHeight: 1.4 }}>
                  {t("Keeps each file's folder and path")}
                </span>
              </button>
            </>
          )}

          {!query && connection.providerId !== "local" && (
            <button type="button" className="option-card" style={AddTileStyle} onClick={() => setAddingDrive(true)}>
              <PlusIcon />
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-soft)" }}>{t("Add materials")}</span>
            </button>
          )}
        </div>
      )}

      {removedList.length > 0 && (
        <div style={{ marginTop: 24, fontSize: 13 }}>
          <button
            type="button"
            onClick={() => setShowRemoved((v) => !v)}
            style={{ background: "none", border: "none", padding: 0, fontSize: 13, color: "var(--ink-soft)" }}
          >
            {t("{n} removed from this story").replace("{n}", String(removedList.length))}{" "}
            {showRemoved ? "▲" : "▼"}
          </button>

          <button
            type="button"
            onClick={() => void handleRestoreAll()}
            disabled={restoringAll}
            className="btn-secondary"
            style={{ marginInlineStart: 12, fontSize: 12.5, padding: "6px 12px" }}
          >
            {restoringAll && <span className="spinner" />} {t("Put all back")}
          </button>

          {showRemoved && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
              {removedList.map((entry) => (
                <div
                  key={entry.key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: "var(--bg-cream-2)",
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {entry.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleRestoreMaterial(entry.key)}
                    style={{ background: "none", border: "none", padding: 0, fontSize: 12.5, fontWeight: 600, color: "var(--accent-deep)" }}
                  >
                    {t("Put back")}
                  </button>
                </div>
              ))}
              <p style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 2 }}>
                {t("Putting one back restores the material, but its tags and notes were cleared when it was removed.")}
              </p>
            </div>
          )}
        </div>
      )}

      <div
        style={{
          marginTop: 32,
          padding: "16px 20px",
          borderRadius: 12,
          background: "var(--sage-soft)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <CheckIcon />
        <span style={{ fontSize: 13, color: "var(--ink)" }}>
          {t("Nothing here is used until a person reviews it.")}
        </span>
      </div>

      {/* The family tree sits between this step and the interview, but it's optional — so
          both onward routes are offered rather than routing everyone through a detour. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 10,
          flexWrap: "wrap",
          marginTop: 20,
        }}
      >
        <Link to="/collection/story" className="btn-secondary" style={{ display: "inline-flex" }}>
          {t("Skip to the guided interview")} →
        </Link>
        <Link to="/collection/familytree" className="btn-primary" style={{ display: "inline-flex" }}>
          {t("Continue to the family tree")} →
        </Link>
      </div>

      {openFile && (
        <MaterialDetail
          /* Remount per material. The panel copies the metadata it's handed into its own
             state at mount, so switching straight from one material to another — via the
             "where else this person appears" jump — otherwise kept showing the previous
             one's tags, notes and AI results. */
          key={metaKeyFor(openFile.ref)}
          file={openFile}
          meta={metas[metaKeyFor(openFile.ref)] ?? EMPTY_META}
          connection={connection}
          linkableFiles={files.filter(
            (f) => f.ref.id !== openFile.ref.id || f.ref.providerId !== openFile.ref.providerId
          )}
          knownLocations={knownLocations}
          folderLabel={connection.providerId === "local" ? connection.label : null}
          uid={user.uid}
          allMetas={metas}
          initialPage={initialPage}
          onOpenMaterial={(next) => {
            setInitialPage(undefined);
            setOpenFile(next);
          }}
          onSave={(meta) => handleSaveMeta(openFile, meta)}
          onRemove={() => handleRemoveMaterial(metaKeyFor(openFile.ref), openFile.name)}
          onClose={() => {
            setInitialPage(undefined);
            setOpenFile(null);
          }}
        />
      )}

      {addingDrive && (
        <div
          onClick={() => setAddingDrive(false)}
          style={{ position: "fixed", inset: 0, background: "oklch(20% 0.02 50 / 0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card-enter"
            style={{ width: "min(520px, 92vw)", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: 28 }}
          >
            <h3 style={{ fontSize: 18, marginBottom: 16 }}>Add materials from Google Drive</h3>
            <GoogleDriveConnect
              onSelected={(_conn, newFiles) => {
                addFiles(newFiles);
                setAddingDrive(false);
              }}
              onCancel={() => setAddingDrive(false)}
            />
          </div>
        </div>
      )}
    </CollectionPageShell>
  );
}

const AddTileStyle: React.CSSProperties = {
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: 14,
  minHeight: 76 + 10 + 20,
  border: "1px dashed var(--line)",
  background: "transparent",
};

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--ink-soft)" strokeWidth="1.8" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function MaterialCard({ file, meta, onOpen }: { file: ProviderFile; meta: MaterialMeta; onOpen: () => void }) {
  const t = useT();
  const kind = kindFor(file.mimeType);
  const isImage = file.mimeType.startsWith("image/");
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isImage) return;
    let cancelled = false;

    if (file.ref.providerId === "local") {
      const url = getLocalObjectUrl(file.ref.id);
      if (url) setThumbnailUrl(url);
    } else if (file.ref.providerId === "google-drive") {
      getDriveObjectUrl(file.ref.id).then((url) => {
        if (!cancelled) setThumbnailUrl(url);
      });
    }

    return () => {
      cancelled = true;
    };
  }, [isImage, file.ref.providerId, file.ref.id]);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="option-card"
      style={{ flexDirection: "column", alignItems: "stretch", gap: 10, padding: 14, textAlign: "left" }}
    >
      <div
        style={{
          width: "100%",
          height: 76,
          borderRadius: 8,
          background: kind.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          kind.icon
        )}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {file.name}
      </div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: 10.5,
            background: "var(--accent-soft)",
            color: "var(--accent-deep)",
            padding: "3px 8px",
            borderRadius: 10,
          }}
        >
          {t(kind.label)}
        </span>
        {meta.tags.slice(0, 2).map((tag) => (
          <span
            key={tag}
            style={{
              fontSize: 10.5,
              background: "var(--sage-soft)",
              color: "var(--sage)",
              padding: "3px 8px",
              borderRadius: 10,
            }}
          >
            {tag}
          </span>
        ))}
        {meta.tags.length > 2 && (
          <span style={{ fontSize: 10.5, color: "var(--ink-soft)", padding: "3px 2px" }}>+{meta.tags.length - 2}</span>
        )}
      </div>
    </button>
  );
}

function kindFor(mimeType: string): { label: string; bg: string; icon: React.ReactNode } {
  if (mimeType.startsWith("image/")) return { label: "Photo", bg: "var(--sage-soft)", icon: <PhotoIcon /> };
  if (mimeType.startsWith("audio/")) return { label: "Audio", bg: "var(--bg-cream-2)", icon: <AudioIcon /> };
  if (mimeType.startsWith("video/")) return { label: "Video", bg: "var(--bg-cream-2)", icon: <VideoIcon /> };
  if (mimeType.startsWith("text/")) return { label: "Text", bg: "var(--bg-cream-2)", icon: <DocIcon /> };
  return { label: "Document", bg: "var(--bg-cream-2)", icon: <DocIcon /> };
}

function PhotoIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--sage)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="14" rx="1.5" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="M4 16l5-4.5 3.5 3 3-2.5L21 16" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--ink-soft)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3.5h8l4 4V19a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19V5A1.5 1.5 0 0 1 6 3.5z" />
      <path d="M14 3.5V7h4" />
      <path d="M7.5 12h7M7.5 15h7" />
    </svg>
  );
}

function AudioIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--ink-soft)" strokeWidth="1.6" strokeLinecap="round">
      <path d="M4 12v0M7 9v6M10 6v12M13 9v6M16 6v12M19 12v0" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--ink-soft)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="14" height="14" rx="2" />
      <path d="M17 9.5l4-2.5v10l-4-2.5" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20l-4.5-4.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="var(--sage)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 12.3l2.3 2.3 4.7-5" />
    </svg>
  );
}
