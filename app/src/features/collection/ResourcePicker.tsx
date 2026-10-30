import { useMemo, useState } from "react";
import { ResourceThumb } from "./ResourceThumb";
import { metaKeyFor } from "./materialsMetaService";
import type { ProviderFile } from "../../lib/storage/types";
import { useT } from "../../i18n";

interface ResourcePickerProps {
  selectedKeys: string[];
  allFiles: ProviderFile[];
  onChange: (keys: string[]) => void;
  compact?: boolean;
}

/** How many materials to offer when nothing has been typed yet. */
const BROWSE_LIMIT = 8;

/** Multi-select "attach materials" widget — search by name, thumbnail per result, removable chips. */
export function ResourcePicker({ selectedKeys, allFiles, onChange, compact }: ResourcePickerProps) {
  const t = useT();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const byKey = useMemo(() => {
    const map = new Map<string, ProviderFile>();
    for (const f of allFiles) map.set(metaKeyFor(f.ref), f);
    return map;
  }, [allFiles]);

  const selectedFiles = selectedKeys.map((k) => byKey.get(k)).filter((f): f is ProviderFile => Boolean(f));

  /**
   * With nothing typed this offers the first few unattached materials rather than nothing.
   * Search-only meant you had to already know a filename to attach anything, which made
   * the picker on a story event look like it did nothing at all.
   */
  const matches = useMemo(() => {
    const unselected = allFiles.filter((f) => !selectedKeys.includes(metaKeyFor(f.ref)));
    const q = search.trim().toLowerCase();
    if (!q) return unselected.slice(0, BROWSE_LIMIT);
    return unselected.filter((f) => f.name.toLowerCase().includes(q)).slice(0, BROWSE_LIMIT);
  }, [search, allFiles, selectedKeys]);

  function add(file: ProviderFile) {
    onChange([...selectedKeys, metaKeyFor(file.ref)]);
    setSearch("");
    setOpen(false);
  }

  function remove(key: string) {
    onChange(selectedKeys.filter((k) => k !== key));
  }

  return (
    <div>
      {selectedFiles.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {selectedFiles.map((f) => (
            <span
              key={metaKeyFor(f.ref)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                background: "var(--sage-soft)",
                color: "var(--sage)",
                padding: "3px 8px 3px 3px",
                borderRadius: 14,
              }}
            >
              <ResourceThumb file={f} size={20} />
              <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
              <button
                type="button"
                onClick={() => remove(metaKeyFor(f.ref))}
                style={{ background: "none", border: "none", padding: 0, color: "inherit", fontSize: 13, lineHeight: 1 }}
                aria-label={`Remove ${f.name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div
        style={{ position: "relative" }}
        onBlur={(e) => {
          // Only close when focus leaves the picker entirely, or clicking a result would
          // blur the input and unmount the button before its click landed.
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
        }}
      >
        <input
          type="text"
          placeholder={
            compact
              ? allFiles.length > 0
                ? "Attach a resource — click to browse"
                : "No materials collected yet"
              : t("Search materials by name to attach")
          }
          value={search}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
          }}
          style={{ width: "100%", fontSize: compact ? 12.5 : 14, padding: compact ? "7px 10px" : undefined }}
        />
        {open && matches.length > 0 && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              right: 0,
              background: "var(--card)",
              border: "1px solid var(--line)",
              borderRadius: 8,
              boxShadow: "0 8px 20px -8px oklch(30% 0.03 50 / 0.4)",
              zIndex: 2,
              maxHeight: 220,
              overflowY: "auto",
            }}
          >
            {matches.map((f) => (
              <button
                key={metaKeyFor(f.ref)}
                type="button"
                onClick={() => add(f)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 12px",
                  fontSize: 13,
                  background: "none",
                  border: "none",
                  borderBottom: "1px solid var(--line)",
                }}
              >
                <ResourceThumb file={f} size={26} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
