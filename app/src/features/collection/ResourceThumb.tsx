import { useEffect, useState } from "react";
import { getObjectUrlFor } from "../../lib/storage/blobUrl";
import type { ProviderFile } from "../../lib/storage/types";

/**
 * Small square thumbnail for a material — real image preview, or a type icon
 * otherwise. Pass `fill` to size from the parent (e.g. a grid cell with
 * aspect-ratio: 1) instead of a fixed pixel size.
 */
export function ResourceThumb({ file, size = 28, fill = false }: { file: ProviderFile; size?: number; fill?: boolean }) {
  const isImage = file.mimeType.startsWith("image/");
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isImage) return;
    let cancelled = false;
    getObjectUrlFor(file)
      .then((u) => !cancelled && setUrl(u))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isImage, file]);

  return (
    <span
      style={{
        width: fill ? "100%" : size,
        height: fill ? "100%" : size,
        borderRadius: 6,
        overflow: "hidden",
        flexShrink: 0,
        background: isImage ? "var(--sage-soft)" : "var(--bg-cream-2)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {url ? (
        <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <TypeIcon mimeType={file.mimeType} size={Math.round(size * 0.5)} />
      )}
    </span>
  );
}

export function TypeIcon({ mimeType, size = 14 }: { mimeType: string; size?: number }) {
  if (mimeType.startsWith("image/"))
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="var(--sage)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="14" rx="1.5" />
        <circle cx="8.5" cy="9.5" r="1.5" />
        <path d="M4 16l5-4.5 3.5 3 3-2.5L21 16" />
      </svg>
    );
  if (mimeType.startsWith("audio/"))
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="var(--ink-soft)" strokeWidth="1.8" strokeLinecap="round">
        <path d="M4 12v0M7 9v6M10 6v12M13 9v6M16 6v12M19 12v0" />
      </svg>
    );
  if (mimeType.startsWith("video/"))
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="var(--ink-soft)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="14" height="14" rx="2" />
        <path d="M17 9.5l4-2.5v10l-4-2.5" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="var(--ink-soft)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3.5h8l4 4V19a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19V5A1.5 1.5 0 0 1 6 3.5z" />
      <path d="M14 3.5V7h4" />
    </svg>
  );
}
