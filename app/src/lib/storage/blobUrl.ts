import { getLocalObjectUrl } from "./localFsProvider";
import { getDriveObjectUrl } from "./driveApi";
import type { ProviderFile } from "./types";

/** Resolves an object URL for any provider's file, regardless of mime type. */
export async function getObjectUrlFor(file: ProviderFile): Promise<string> {
  if (file.ref.providerId === "local") {
    const url = getLocalObjectUrl(file.ref.id);
    if (!url) throw new Error(`Local file not found: ${file.name}`);
    return url;
  }
  return getDriveObjectUrl(file.ref.id);
}
