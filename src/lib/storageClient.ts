// A minimal, firebase/storage-API-compatible client backed by our upload
// REST API (server/routes/uploadRoutes.ts + server/models/Upload.ts).
// Small binary assets (e.g. branch logos) are stored as base64 in MongoDB,
// which is enough for this app's needs without introducing a dedicated
// object-storage dependency.
import { getAuthToken } from "./authClient";

export interface StorageHandle {
  __isStorage: true;
}

export const storage: StorageHandle = { __isStorage: true };

export interface StorageRef {
  path: string;
}

export function ref(_storage: StorageHandle, path: string): StorageRef {
  return { path };
}

export interface UploadResult {
  ref: StorageRef;
}

function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the "data:<mime>;base64," prefix
      const base64 = result.split(",")[1] || "";
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function uploadBytes(
  storageRef: StorageRef,
  file: Blob,
  metadata?: { contentType?: string }
): Promise<UploadResult> {
  const dataBase64 = await fileToBase64(file);
  const contentType = metadata?.contentType || (file as any).type || "application/octet-stream";
  const token = getAuthToken();

  const res = await fetch(`/api/uploads/${storageRef.path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ contentType, dataBase64 }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Upload failed with status ${res.status}`);
  }

  // Stash the resolved download URL on the ref so getDownloadURL can return it.
  (storageRef as any).__downloadUrl = data.url;
  return { ref: storageRef };
}

export async function getDownloadURL(storageRef: StorageRef): Promise<string> {
  const cached = (storageRef as any).__downloadUrl;
  if (cached) return cached;
  throw new Error("getDownloadURL called before uploadBytes resolved for this ref.");
}
