export type StorageProviderId = "local" | "google-drive";

export interface ProviderFileRef {
  providerId: StorageProviderId;
  id: string; // opaque: local File handle key, or Google Drive file ID
}

export interface ProviderFile {
  ref: ProviderFileRef;
  name: string;
  mimeType: string;
  sizeBytes?: number;
}

export interface StorageConnection {
  providerId: StorageProviderId;
  label: string; // e.g. folder name, for display
}

export interface StorageProvider {
  id: StorageProviderId;
  displayName: string;
  connect(): Promise<StorageConnection>;
  listFiles(conn: StorageConnection): Promise<ProviderFile[]>;
  getFileBlob(conn: StorageConnection, ref: ProviderFileRef): Promise<Blob>;
}
