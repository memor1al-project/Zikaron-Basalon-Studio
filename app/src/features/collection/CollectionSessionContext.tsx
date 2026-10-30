import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { ProviderFile, StorageConnection } from "../../lib/storage/types";
import { getCurrentStory, saveStorageConnection, type PersistedStory } from "./storyService";

interface CollectionSession {
  connection: StorageConnection | null;
  files: ProviderFile[];
  setConnection: (conn: StorageConnection | null) => void;
  setFiles: (files: ProviderFile[]) => void;
  /** What was connected last time, from Firestore — null once caught up to the live session. */
  persistedStory: PersistedStory | null | "loading";
  /** Sets the live connection AND remembers it for next time. */
  connectAndPersist: (conn: StorageConnection, files: ProviderFile[], driveFolderId?: string) => void;
  /** Appends more materials to the current connection (dedupes by ref), for the "+ Add" flow. */
  addFiles: (newFiles: ProviderFile[]) => void;
}

const CollectionSessionCtx = createContext<CollectionSession | null>(null);

export function CollectionSessionProvider({ uid, children }: { uid: string; children: ReactNode }) {
  const [connection, setConnection] = useState<StorageConnection | null>(null);
  const [files, setFiles] = useState<ProviderFile[]>([]);
  const [persistedStory, setPersistedStory] = useState<PersistedStory | null | "loading">("loading");

  useEffect(() => {
    getCurrentStory(uid).then(setPersistedStory);
  }, [uid]);

  function connectAndPersist(conn: StorageConnection, newFiles: ProviderFile[], driveFolderId?: string) {
    setConnection(conn);
    setFiles(newFiles);
    const story: PersistedStory = {
      storageProvider: conn.providerId,
      storageLabel: conn.label,
      fileCount: newFiles.length,
      ...(driveFolderId ? { driveFolderId } : {}),
    };
    setPersistedStory(story);
    saveStorageConnection(uid, story).catch(() => {
      // Best-effort — the live session still works even if the remember-for-next-time write fails.
    });
  }

  function addFiles(newFiles: ProviderFile[]) {
    setFiles((prev) => {
      const existingKeys = new Set(prev.map((f) => `${f.ref.providerId}:${f.ref.id}`));
      const merged = [...prev, ...newFiles.filter((f) => !existingKeys.has(`${f.ref.providerId}:${f.ref.id}`))];
      if (connection) {
        const story: PersistedStory = {
          storageProvider: connection.providerId,
          storageLabel: connection.label,
          fileCount: merged.length,
        };
        setPersistedStory((prevStory) =>
          prevStory && prevStory !== "loading" ? { ...prevStory, fileCount: merged.length } : story
        );
        saveStorageConnection(uid, story).catch(() => {});
      }
      return merged;
    });
  }

  return (
    <CollectionSessionCtx.Provider
      value={{ connection, files, setConnection, setFiles, persistedStory, connectAndPersist, addFiles }}
    >
      {children}
    </CollectionSessionCtx.Provider>
  );
}

export function useCollectionSession(): CollectionSession {
  const ctx = useContext(CollectionSessionCtx);
  if (!ctx) throw new Error("useCollectionSession must be used within CollectionSessionProvider");
  return ctx;
}

/** Like useCollectionSession, but returns null instead of throwing — for chrome shared with routes outside the Collection Wizard (e.g. AppSidebar on Presentation Wizard pages). */
export function useCollectionSessionOptional(): CollectionSession | null {
  return useContext(CollectionSessionCtx);
}
